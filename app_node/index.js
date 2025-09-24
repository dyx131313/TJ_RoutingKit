const express = require('express');
const net = require('net');
const path = require('path');
const monitor = require('express-status-monitor');

const app = express();
const port = 3000;

// C++ TCP 服务器的配置
const CPP_SERVER_HOST = '127.0.0.1';
const CPP_SERVER_PORT = 12345;

app.use(monitor());
// Serve the bundled frontend that lives in the repo under app_frontend
app.use(express.static(path.resolve(__dirname, '../app_frontend')));
app.use('/tiles', express.static(path.resolve(__dirname, '../tiles')));
app.use(express.json({ limit: '1mb' }));

// Fallback: ensure root serves the index page
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../app_frontend/index.html'));
});

function handle_request(req, res) {
    const { from, to, profile, time } = req.query;
    const profile_str = profile || 'normal';
    const time_param = time || '';

    const client = new net.Socket();

    client.connect(CPP_SERVER_PORT, CPP_SERVER_HOST, () => {
        console.log('已连接到 C++ 路由计算服务');
    // support optional metric_sig query parameter to apply a custom metric
    // also accept rule_id as a shortcut to refer to a built merged metric
    const metric_sig = req.query.metric_sig || req.query.rule_id || '';
        let request_str = time_param ? `${from},${to},${profile_str},${time_param}` : `${from},${to},${profile_str}`;
        if (metric_sig) request_str = request_str + `,metric_sig:${metric_sig}`;
        // ensure newline termination so backend can rely on it
        const out_str = request_str.endsWith('\n') ? request_str : (request_str + '\n');
        console.log('Sending to C++:', out_str);
        client.write(out_str);
    });

    let response_buffer = '';
    client.on('data', (data) => {
        response_buffer += data.toString();
        console.log('Raw response from C++ (accum):', JSON.stringify(response_buffer));
        if (response_buffer.includes('\n')) {
            try {
                const json_output = JSON.parse(response_buffer);
                // log metric unit and source for diagnostics (forwarded unchanged)
                try {
                    if (json_output && (json_output.metric_unit || json_output.metric_source)) {
                        console.log('C++ route result metric_unit=', json_output.metric_unit, 'metric_source=', json_output.metric_source);
                    }
                } catch (e) { /* ignore logging errors */ }
                if (json_output.error) {
                    res.status(500).json(json_output);
                } else {
                    res.json(json_output);
                }
            } catch (e) {
                console.error(`解析 C++ JSON 响应时出错: ${e}`);
                console.error(`原始数据: '${response_buffer}'`);
                res.status(500).json({ error: "无法解析计算结果" });
            }
            client.end();
        }
    });

    client.on('error', (err) => {
        console.error('与 C++ 服务连接时出错:', err.message);
        res.status(503).json({ error: '路由计算服务当前不可用。' });
    });

    client.on('close', () => {
        console.log('与 C++ 服务的连接已关闭');
    });
}


app.get('/route', (req, res) => {
    const { from, to } = req.query;

    if (!from || !to) {
        return res.status(400).send('错误: "from" 和 "to" 参数是必需的。');
    }
    // if rule_id provided, ensure rule metric exists (build it) and expose as metric_sig_<id>.bin
    const rule_id = req.query.rule_id || '';
    if (rule_id) {
        (async () => {
            try {
                // attempt to build metric for rule (if already built, buildMetricForRule will update metadata)
                const br = await buildMetricForRule(rule_id, undefined);
                // ensure metric_sig_<rule_id>.bin exists alongside metric_rule_<rule_id>.bin
                const outdir = path.join(path.resolve(__dirname, '..', 'cache'), PBF_HASH);
                const sigPath = path.join(outdir, `metric_sig_${rule_id}.bin`);
                try {
                    if (!fs.existsSync(sigPath)) {
                        try { fs.linkSync(br.path, sigPath); } catch (e) { fs.copyFileSync(br.path, sigPath); }
                    }
                } catch (e) { console.warn('failed to create metric_sig link for rule', e); }
            } catch (e) {
                console.warn('route: failed to build/ensure rule metric', e.message || e);
                // continue — route may still be computed without rule metric
            }
            handle_request(req, res);
        })();
        return;
    }

    handle_request(req, res);
});

app.get('/health', (req, res) => {
    const client = new net.Socket();
    client.connect(CPP_SERVER_PORT, CPP_SERVER_HOST, () => {
        res.send('服务运行正常。C++ 路由计算服务可达。');
        client.end();
    });
    client.on('error', (err) => {
        res.status(503).send('服务运行正常，但 C++ 路由计算服务不可达。');
    });
});

// Nearest node lookup: forwards a special request to the C++ server
app.get('/nearest', (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

    const client = new net.Socket();
    client.connect(CPP_SERVER_PORT, CPP_SERVER_HOST, () => {
    const request_str = `NEAREST,${lat},${lon}\n`;
    console.log('nearest: sending to C++ ->', request_str);
    client.write(request_str);
    });

    let response_buffer = '';
    client.on('data', (data) => {
        response_buffer += data.toString();
        console.log('nearest: raw response (accum):', JSON.stringify(response_buffer));
        if (response_buffer.includes('\n')) {
            try {
                const json_output = JSON.parse(response_buffer);
                if (json_output.error) res.status(500).json(json_output);
                else res.json(json_output);
            } catch (e) {
                console.error('解析 C++ nearest 响应失败', e);
                res.status(500).json({ error: '无法解析 nearest 响应' });
            }
            client.end();
        }
    });
    client.on('error', (err) => {
        console.error('nearest: C++ 连接错误', err.message);
        res.status(503).json({ error: 'C++ 服务不可达' });
    });
});

// Resolve polygon to arc ids with simple disk cache
const crypto = require('crypto');
const fs = require('fs');

// Determine PBF hash for per-dataset cache. Prefer env `PBF_HASH`, else try to find
// a hex-named subdirectory under ../cache. Fallback to 'unknown'.
function detectPbfHash() {
    if (process.env.PBF_HASH && /^[0-9a-f]{64}$/.test(process.env.PBF_HASH)) return process.env.PBF_HASH;
    const base = path.resolve(__dirname, '../cache');
    try {
        const entries = fs.readdirSync(base, { withFileTypes: true });
        for (const e of entries) {
            if (e.isDirectory() && /^[0-9a-f]{64}$/.test(e.name)) return e.name;
        }
    } catch (e) {
        // ignore
    }
    return 'unknown';
}

const PBF_HASH = detectPbfHash();
const CACHE_TEMPLATES_DIR = path.resolve(__dirname, `../cache/${PBF_HASH}/templates`);
const CACHE_TEMPLATES_TRASH = path.resolve(__dirname, `../cache/${PBF_HASH}/templates/trash`);
const CACHE_RULES_DIR = path.resolve(__dirname, `../cache/${PBF_HASH}/rules`);

function ensureCacheDir() {
    try {
        fs.mkdirSync(CACHE_TEMPLATES_DIR, { recursive: true });
        fs.mkdirSync(CACHE_TEMPLATES_TRASH, { recursive: true });
        fs.mkdirSync(CACHE_RULES_DIR, { recursive: true });
    } catch(e) {}
}

// Helpers for rules storage
function rulePath(id) {
    return path.join(CACHE_RULES_DIR, `rules_${id}.json`);
}

function listRuleFiles() {
    try {
        if (!fs.existsSync(CACHE_RULES_DIR)) return [];
        return fs.readdirSync(CACHE_RULES_DIR).filter(f => f.startsWith('rules_') && f.endsWith('.json'));
    } catch (e) { return []; }
}

function readRule(id) {
    const p = rulePath(id);
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch(e) { return null; }
}

function writeRule(obj) {
    if (!obj.id) return false;
    const p = rulePath(obj.id);
    try { fs.writeFileSync(p, JSON.stringify(obj, null, 2)); return true; } catch(e) { console.error('writeRule failed', e); return false; }
}

function generateRuleId() {
    return `${Date.now().toString(36)}${Math.floor(Math.random()*10000).toString(36)}`;
}

// Collect affected arcs for a list of template signatures
function collectAffectedArcsFromTemplates(templateSigs) {
    const set = new Set();
    for (const sig of templateSigs) {
        const tplPath = path.join(CACHE_TEMPLATES_DIR, `tpl_${sig}.json`);
        if (!fs.existsSync(tplPath)) continue;
        try {
            const tpl = JSON.parse(fs.readFileSync(tplPath,'utf8'));
            const arcIds = tpl.canonical && Array.isArray(tpl.canonical.arc_ids) ? tpl.canonical.arc_ids : (tpl.original && Array.isArray(tpl.original.arc_ids) ? tpl.original.arc_ids : null);
            const poly = tpl.canonical && tpl.canonical.polygon ? tpl.canonical.polygon : (tpl.original && tpl.original.polygon ? tpl.original.polygon : null);
            if (Array.isArray(arcIds) && arcIds.length) { for (const a of arcIds) set.add(Number(a)); continue; }
            if (Array.isArray(poly) && poly.length>=3) {
                const coords = poly.map(p => `${p[0].toFixed(6)},${p[1].toFixed(6)}`);
                const canon = coords.join(';');
                const hash = crypto.createHash('sha256').update(canon).digest('hex');
                const cache_file = path.join(CACHE_TEMPLATES_DIR, `resolve_poly_${hash}.json`);
                if (fs.existsSync(cache_file)) {
                    try { const d = JSON.parse(fs.readFileSync(cache_file,'utf8')); if (Array.isArray(d.arc_ids)) { for (const a of d.arc_ids) set.add(Number(a)); }
                    } catch(e) {}
                }
            }
        } catch(e) { }
    }
    return Array.from(set).sort((a,b)=>a-b);
}

// Build merged metric for a rule (write metric_rule_<id>.bin)
async function buildMetricForRule(ruleId, bigValue) {
    const rule = readRule(ruleId);
    if (!rule) throw new Error('rule not found');
    const affected = collectAffectedArcsFromTemplates(rule.templates || []);
    if (!Array.isArray(affected) || affected.length === 0) throw new Error('no affected arcs');

    // determine travel_time_count from C++ INFO
    async function queryCppInfo() {
        return new Promise((resolve) => {
            const client = new net.Socket();
            let buf = '';
            client.connect(CPP_SERVER_PORT, CPP_SERVER_HOST, () => { client.write('INFO\n'); });
            client.on('data', (data) => {
                buf += data.toString();
                if (buf.includes('\n')) {
                    try { const j = JSON.parse(buf); if (j && Number.isInteger(j.travel_time_count)) { client.end(); return resolve(j.travel_time_count); } if (j && Number.isInteger(j.arc_count)) { client.end(); return resolve(j.arc_count); } } catch(e) {}
                    client.end(); return resolve(null);
                }
            });
            client.on('error', (err) => { console.error('queryCppInfo error', err.message); resolve(null); });
            client.on('close', () => resolve(null));
        });
    }

    let estimated = 0;
    try { const c = await queryCppInfo(); if (c && Number.isInteger(c)) estimated = c; } catch(e) {}
    if (!estimated) {
        // fallback: pick max affected + 1
        estimated = (affected.length ? (affected[affected.length-1]+1) : 0);
    }

    const weights = new Array(estimated).fill(1000);
    const BIG = Number.isFinite(bigValue) ? bigValue : 1000000000;
    for (const a of affected) if (a >=0 && a < weights.length) weights[a] = BIG;

    const outdir = path.join(path.resolve(__dirname, '..', 'cache'), PBF_HASH);
    try { fs.mkdirSync(outdir, { recursive: true }); } catch(e) {}
    const outpath = path.join(outdir, `metric_rule_${ruleId}.bin`);
    const buf = Buffer.alloc(8 + weights.length * 4);
    buf.writeBigUInt64LE(BigInt(weights.length), 0);
    for (let i=0;i<weights.length;i++) buf.writeUInt32LE(weights[i], 8 + i*4);
    fs.writeFileSync(outpath, buf);
    // ensure a metric_sig_<ruleId>.bin peer file exists so C++ can load by signature
    const sigPath = path.join(outdir, `metric_sig_${ruleId}.bin`);
    try {
        // always overwrite existing signature file to reflect latest build
        try { if (fs.existsSync(sigPath)) fs.unlinkSync(sigPath); } catch(e) {}
        try { fs.linkSync(outpath, sigPath); }
        catch (e) { try { fs.copyFileSync(outpath, sigPath); } catch (e2) { console.warn('failed to create metric_sig peer file (copy failed)', e2); } }
    } catch (e) { console.warn('failed to create metric_sig peer file', e); }
    // update rule metadata
    rule.metric_path = outpath;
    rule.merged_arc_count = affected.length;
    rule.updated_at = new Date().toISOString();
    writeRule(rule);
    return { path: outpath, affected_count: affected.length };
}

// Migrate legacy cache/templates files into per-pbf dir if present
try {
    const legacy = path.resolve(__dirname, '../cache/templates');
    if (fs.existsSync(legacy) && !fs.existsSync(CACHE_TEMPLATES_DIR)) {
        fs.mkdirSync(CACHE_TEMPLATES_DIR, { recursive: true });
        const files = fs.readdirSync(legacy);
        for (const f of files) {
            try {
                fs.renameSync(path.join(legacy, f), path.join(CACHE_TEMPLATES_DIR, f));
            } catch (e) {
                // ignore individual failures
            }
        }
    }
} catch (e) { console.error('cache migration check failed', e); }

app.post('/api/resolve_poly', (req, res) => {
    const body = req.body;
    if (!body || !Array.isArray(body.polygon) || body.polygon.length < 3) {
        return res.status(400).json({ error: 'body must include polygon array with at least 3 [lat,lon] points' });
    }

    // canonicalize polygon -> string for hashing (lat,lon pairs with 6 decimals)
    const coords = body.polygon.map(p => `${p[0].toFixed(6)},${p[1].toFixed(6)}`);
    const canon = coords.join(';');
    const hash = crypto.createHash('sha256').update(canon).digest('hex');
    ensureCacheDir();
    const cache_file = path.join(CACHE_TEMPLATES_DIR, `resolve_poly_${hash}.json`);

    if (fs.existsSync(cache_file)) {
        try {
            const data = fs.readFileSync(cache_file, 'utf8');
            return res.json(JSON.parse(data));
        } catch (e) {
            console.error('Failed to read cache file', e);
            // fall through to recompute
        }
    }

    // build RESOLVE_POLY command string
    let cmd = 'RESOLVE_POLY';
    for (const p of body.polygon) {
        cmd += `,${p[0]},${p[1]}`;
    }
    cmd += '\n';

    const client = new net.Socket();
    client.connect(CPP_SERVER_PORT, CPP_SERVER_HOST, () => {
        console.log('resolve_poly: sending to C++ ->', cmd);
        client.write(cmd);
    });

    let response_buffer = '';
    client.on('data', (data) => {
        response_buffer += data.toString();
        if (response_buffer.includes('\n')) {
            try {
                const json_output = JSON.parse(response_buffer);
                // write cache
                try { fs.writeFileSync(cache_file, JSON.stringify(json_output)); } catch(e) { console.error('Failed to write cache', e); }
                res.json(json_output);
            } catch (e) {
                console.error('Failed to parse RESOLVE_POLY response', e);
                res.status(500).json({ error: '无法解析后端响应' });
            }
            client.end();
        }
    });

    client.on('error', (err) => {
        console.error('resolve_poly: C++ connection error', err.message);
        res.status(503).json({ error: 'C++ 服务不可达' });
    });
});

// --- Template management: canonicalize + sign + CRUD on disk ---
function canonicalizeTemplate(obj) {
    // shallow canonicalization: sort keys recursively, format numbers with 6 decimals for floats
    if (Array.isArray(obj)) {
        return obj.map(canonicalizeTemplate);
    } else if (obj && typeof obj === 'object') {
        const keys = Object.keys(obj).sort();
        const out = {};
        for (const k of keys) {
            out[k] = canonicalizeTemplate(obj[k]);
        }
        return out;
    } else if (typeof obj === 'number') {
        if (Number.isInteger(obj)) return obj;
        return parseFloat(obj.toFixed(6));
    } else {
        return obj;
    }
}

function signCanonical(canonical_obj, secret) {
    const json = JSON.stringify(canonical_obj);
    return crypto.createHmac('sha256', secret).update(json).digest('hex');
}

app.post('/api/templates', (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'template JSON body required' });
    // simple canonicalize and sign using secret from env or default
    const secret = process.env.TEMPLATE_SECRET || 'default-secret';
    const canon = canonicalizeTemplate(body);
    const sig = signCanonical(canon, secret);
    ensureCacheDir();
    const pathp = path.join(CACHE_TEMPLATES_DIR, `tpl_${sig}.json`);
    try {
        const payload = { signature: sig, canonical: canon, original: body, created_at: new Date().toISOString() };
        fs.writeFileSync(pathp, JSON.stringify(payload, null, 2));
        return res.json({ signature: sig, path: pathp });
    } catch (e) {
        console.error('Failed to write template file', e);
        return res.status(500).json({ error: 'failed to save template' });
    }
});

// Preview affected arcs for a template signature.
// Returns JSON: { arc_count: N, arc_ids: [...], arc_coords: [ { arc, u:[lat,lon], v:[lat,lon] }, ... ] }
// Note: consolidated template preview handler is defined later in this file

// Precompute template artifacts: if template has polygon, call RESOLVE_POLY and cache result
app.post('/api/templates/:sig/precompute', (req, res) => {
    const sig = req.params.sig;
    const pathp = path.join(CACHE_TEMPLATES_DIR, `tpl_${sig}.json`);
    if (!fs.existsSync(pathp)) return res.status(404).json({ error: 'template not found' });
    let tpl;
    try { tpl = JSON.parse(fs.readFileSync(pathp,'utf8')); } catch(e) { return res.status(500).json({ error: 'failed to read template' }); }

    // detect polygon in canonical or original
    const poly = tpl.canonical && tpl.canonical.polygon ? tpl.canonical.polygon : (tpl.original && tpl.original.polygon ? tpl.original.polygon : null);
    // detect arc_ids in canonical or original
    const arcIds = tpl.canonical && Array.isArray(tpl.canonical.arc_ids) ? tpl.canonical.arc_ids : (tpl.original && Array.isArray(tpl.original.arc_ids) ? tpl.original.arc_ids : null);
    // detect tag_filter
    const tagFilter = tpl.canonical && tpl.canonical.tag_filter ? tpl.canonical.tag_filter : (tpl.original && tpl.original.tag_filter ? tpl.original.tag_filter : null);

    ensureCacheDir();

    if (Array.isArray(arcIds) && arcIds.length > 0) {
        // For arc_id templates we can cache directly without asking C++: store arc_ids and count.
        const canon = arcIds.map(a => Number(a)).join(',');
        const hash = crypto.createHash('sha256').update(canon).digest('hex');
        const cache_file = path.join(CACHE_TEMPLATES_DIR, `resolve_poly_${hash}.json`);
        const result = { arc_count: arcIds.length, arc_ids: arcIds };
        try { fs.writeFileSync(cache_file, JSON.stringify(result)); } catch(e) { console.error('failed to write arc_ids precompute cache', e); }
        return res.json({ cached: false, hash: hash, result });
    }

    if (tagFilter) {
        // Tag-based resolution not implemented in precompute stage. Defer to metric build or return informative error.
        return res.status(400).json({ error: 'tag_filter precompute not implemented; will be resolved during metric build' });
    }

    if (!poly || !Array.isArray(poly) || poly.length < 3) return res.status(400).json({ error: 'no polygon or arc_ids in template to precompute' });

    // call existing /api/resolve_poly logic by building command
    const coords = poly.map(p => `${p[0].toFixed(6)},${p[1].toFixed(6)}`);
    const canon = coords.join(';');
    const hash = crypto.createHash('sha256').update(canon).digest('hex');
    const cache_file = path.join(CACHE_TEMPLATES_DIR, `resolve_poly_${hash}.json`);
    if (fs.existsSync(cache_file)) {
        try { const d = JSON.parse(fs.readFileSync(cache_file,'utf8')); return res.json({ cached: true, hash: hash, result: d }); } catch(e) {}
    }

    // otherwise call C++ server
    let cmd = 'RESOLVE_POLY';
    for (const p of poly) cmd += `,${p[0]},${p[1]}`;
    cmd += '\n';
    const client = new net.Socket();
    client.connect(CPP_SERVER_PORT, CPP_SERVER_HOST, () => { client.write(cmd); });
    let buf = '';
    client.on('data', (data) => {
        buf += data.toString();
        if (buf.includes('\n')) {
            try {
                const json_output = JSON.parse(buf);
                try { fs.writeFileSync(cache_file, JSON.stringify(json_output)); } catch(e) { console.error('failed to write precompute cache', e); }
                res.json({ cached: false, hash: hash, result: json_output });
            } catch (e) {
                res.status(500).json({ error: 'invalid response from backend' });
            }
            client.end();
        }
    });
    client.on('error', (err) => { console.error('precompute: C++ connection error', err.message); res.status(503).json({ error: 'C++ 服务不可达' }); });
});

// Build metric file for a template: reads resolve_poly_<hash>.json or arc_ids and writes metric_sig_<sig>.bin
app.post('/api/templates/:sig/build', async (req, res) => {
    const sig = req.params.sig;
    ensureCacheDir();
    const tpl_path = path.join(CACHE_TEMPLATES_DIR, `tpl_${sig}.json`);
    if (!fs.existsSync(tpl_path)) return res.status(404).json({ error: 'template not found' });
    let tpl;
    try { tpl = JSON.parse(fs.readFileSync(tpl_path,'utf8')); } catch(e) { return res.status(500).json({ error: 'failed to read template' }); }

    const arcIds = (tpl.canonical && Array.isArray(tpl.canonical.arc_ids)) ? tpl.canonical.arc_ids : (tpl.original && Array.isArray(tpl.original.arc_ids) ? tpl.original.arc_ids : null);
    const poly = tpl.canonical && tpl.canonical.polygon ? tpl.canonical.polygon : (tpl.original && tpl.original.polygon ? tpl.original.polygon : null);
    let resolve_cache = null;
    if (Array.isArray(poly) && poly.length >= 3) {
        try {
            const coords = poly.map(p => `${p[0].toFixed(6)},${p[1].toFixed(6)}`);
            const canon = coords.join(';');
            const hash = crypto.createHash('sha256').update(canon).digest('hex');
            const cache_file = path.join(CACHE_TEMPLATES_DIR, `resolve_poly_${hash}.json`);
            if (fs.existsSync(cache_file)) resolve_cache = JSON.parse(fs.readFileSync(cache_file,'utf8'));
        } catch (e) { /* ignore */ }
    }

    let affected = null;
    if (Array.isArray(arcIds) && arcIds.length > 0) affected = arcIds.map(x=>Number(x));
    else if (resolve_cache && Array.isArray(resolve_cache.arc_ids)) affected = resolve_cache.arc_ids.map(x=>Number(x));

    if (!Array.isArray(affected) || affected.length === 0) return res.status(400).json({ error: 'no affected arcs to build metric from; precompute polygon first' });

    // estimate arc count from known arcs
    const maxArc = affected.reduce((m,a)=> Math.max(m,a), 0);
    let estimatedArcCount = maxArc + 1;
    try {
        const files = fs.readdirSync(CACHE_TEMPLATES_DIR);
        for (const f of files) {
            if (f.startsWith('resolve_poly_') && f.endsWith('.json')) {
                try { const d = JSON.parse(fs.readFileSync(path.join(CACHE_TEMPLATES_DIR,f),'utf8')); if (Array.isArray(d.arc_ids)) { for (const a of d.arc_ids) estimatedArcCount = Math.max(estimatedArcCount, Number(a)+1); } } catch(e){}
            }
        }
    } catch(e) {}

    // ask C++ for authoritative arc_count / travel_time_count
    async function queryCppInfo() {
        return new Promise((resolve) => {
            const client = new net.Socket();
            let buf = '';
            client.connect(CPP_SERVER_PORT, CPP_SERVER_HOST, () => { client.write('INFO\n'); });
            client.on('data', (data) => {
                buf += data.toString();
                if (buf.includes('\n')) {
                    try {
                        // Log raw INFO response for debugging
                        console.log('queryCppInfo: raw INFO ->', buf.trim());
                        const j = JSON.parse(buf);
                        if (j && Number.isInteger(j.travel_time_count)) { client.end(); return resolve(j.travel_time_count); }
                        if (j && Number.isInteger(j.arc_count)) { client.end(); return resolve(j.arc_count); }
                    } catch (e) {
                        console.error('queryCppInfo: parse error', e, 'raw:', buf);
                    }
                    client.end();
                    return resolve(null);
                }
            });
            client.on('error', (err) => { console.error('queryCppInfo: connection error', err.message); resolve(null); });
            client.on('close', () => { resolve(null); });
        });
    }

    try {
        const ccount = await queryCppInfo();
        if (ccount && Number.isInteger(ccount) && ccount > estimatedArcCount) estimatedArcCount = ccount;
    } catch (e) { }

    const weights = new Array(estimatedArcCount).fill(1000);
    const BIG = 1000000000;
    for (const a of affected) if (a >= 0 && a < weights.length) weights[a] = BIG;

    const outpath = path.join(path.resolve(__dirname, '..', 'cache'), process.env.PBF_HASH && /^[0-9a-f]{64}$/.test(process.env.PBF_HASH) ? process.env.PBF_HASH : fs.readdirSync(path.resolve(__dirname,'../cache')).find(d=>/^[0-9a-f]+$/.test(d) ), `metric_sig_${sig}.bin`);
    try {
        const outdir = path.dirname(outpath);
        fs.mkdirSync(outdir, { recursive: true });
        const buf = Buffer.alloc(8 + weights.length * 4);
        buf.writeBigUInt64LE(BigInt(weights.length), 0);
        for (let i = 0; i < weights.length; ++i) buf.writeUInt32LE(weights[i], 8 + i*4);
        fs.writeFileSync(outpath, buf);
        return res.json({ built: true, path: outpath, affected_count: affected.length });
    } catch (e) {
        console.error('failed to write metric_sig file', e);
        return res.status(500).json({ error: 'failed to write metric file', detail: e.message });
    }
});

// Rules CRUD
app.post('/api/rules', (req, res) => {
    ensureCacheDir();
    const body = req.body;
    if (!body || !Array.isArray(body.templates)) return res.status(400).json({ error: 'body must include templates: [sig,...]' });
    const id = body.id || generateRuleId();
    const rule = { id, name: body.name || `rule-${id}`, description: body.description || '', templates: body.templates, created_at: new Date().toISOString() };
    if (!writeRule(rule)) return res.status(500).json({ error: 'failed to write rule' });
    res.json(rule);
});

app.get('/api/rules', (req, res) => {
    ensureCacheDir();
    const files = listRuleFiles();
    const out = [];
    for (const f of files) {
        try { const j = JSON.parse(fs.readFileSync(path.join(CACHE_RULES_DIR,f),'utf8')); out.push(j); } catch(e) { console.warn('bad rule file', f); }
    }
    res.json({ rules: out });
});

app.get('/api/rules/:id', (req, res) => {
    ensureCacheDir();
    const id = req.params.id;
    const r = readRule(id);
    if (!r) return res.status(404).json({ error: 'not found' });
    res.json(r);
});

app.put('/api/rules/:id', (req, res) => {
    ensureCacheDir();
    const id = req.params.id; const body = req.body;
    const r = readRule(id);
    if (!r) return res.status(404).json({ error: 'not found' });
    r.name = body.name || r.name; r.description = body.description || r.description; r.templates = Array.isArray(body.templates) ? body.templates : r.templates; r.updated_at = new Date().toISOString();
    if (!writeRule(r)) return res.status(500).json({ error: 'failed to write' });
    res.json(r);
});

app.delete('/api/rules/:id', (req, res) => {
    ensureCacheDir();
    const id = req.params.id; const p = rulePath(id);
    if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
    try { fs.unlinkSync(p); res.json({ deleted: true, id }); } catch(e) { res.status(500).json({ error: 'failed to delete' }); }
});

// Build merged metric for a rule
app.post('/api/rules/:id/build', async (req, res) => {
    const id = req.params.id; const body = req.body || {};
    const big = (body && Number(body.big)) ? Number(body.big) : undefined;
    try {
        const r = readRule(id); if (!r) return res.status(404).json({ error: 'not found' });
        const result = await buildMetricForRule(id, big);
        res.json({ built: true, path: result.path, affected_count: result.affected_count });
    } catch (e) {
        console.error('rule build error', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/templates', (req, res) => {
    ensureCacheDir();
    try {
        const out = [];
        // active templates
        if (fs.existsSync(CACHE_TEMPLATES_DIR)) {
            const files = fs.readdirSync(CACHE_TEMPLATES_DIR).filter(f => f.startsWith('tpl_') && f.endsWith('.json'));
            for (const f of files) {
                const p = path.join(CACHE_TEMPLATES_DIR, f);
                try {
                    const j = JSON.parse(fs.readFileSync(p,'utf8'));
                    const stat = fs.statSync(p);
                    const created = j.created_at || stat.ctime.toISOString();
                    const created_human = new Date(created).toLocaleString();
                    const display = j.name || (j.canonical && j.canonical.name) || (j.original && j.original.name) || j.signature;
                    out.push({
                        signature: j.signature,
                        display_name: display,
                        description: j.description || (j.canonical && j.canonical.description) || '',
                        created_at: created,
                        created_at_human: created_human,
                        path: p,
                        deleted: false,
                        precomputed: !!(j.canonical && (Array.isArray(j.canonical.arc_ids) || Array.isArray(j.canonical.arc_coords)))
                    });
                } catch (e) {
                    console.warn('failed to read template', p, e.message);
                }
            }
        }
        // trashed templates: only include if caller explicitly asked with ?include_deleted=true
        const includeDeleted = String(req.query.include_deleted || '').toLowerCase() === 'true';
        if (includeDeleted && fs.existsSync(CACHE_TEMPLATES_TRASH)) {
            const tfiles = fs.readdirSync(CACHE_TEMPLATES_TRASH).filter(f => f.startsWith('tpl_') && f.endsWith('.json'));
            for (const f of tfiles) {
                const p = path.join(CACHE_TEMPLATES_TRASH, f);
                try {
                    const j = JSON.parse(fs.readFileSync(p,'utf8'));
                    const stat = fs.statSync(p);
                    const created = j.created_at || stat.ctime.toISOString();
                    const deleted_at = stat.ctime.toISOString();
                    out.push({
                        signature: j.signature,
                        display_name: j.name || (j.canonical && j.canonical.name) || j.signature,
                        description: j.description || '',
                        created_at: created,
                        created_at_human: new Date(created).toLocaleString(),
                        path: p,
                        deleted: true,
                        deleted_at: deleted_at,
                        deleted_at_human: new Date(deleted_at).toLocaleString(),
                        precomputed: !!(j.canonical && (Array.isArray(j.canonical.arc_ids) || Array.isArray(j.canonical.arc_coords)))
                    });
                } catch (e) {
                    console.warn('failed to read trash template', p, e.message);
                }
            }
        }
        res.json({ templates: out });
    } catch (e) {
        console.error('Failed to list templates', e);
        res.status(500).json({ error: 'failed to list templates' });
    }
});

// Preview a specific template: returns polygon, bbox and resolve preview (arc_ids or arc_coords)
app.get('/api/templates/:sig/preview', (req, res) => {
    ensureCacheDir();
    const sig = req.params.sig;
    const pathp = path.join(CACHE_TEMPLATES_DIR, `tpl_${sig}.json`);
    if (!fs.existsSync(pathp)) return res.status(404).json({ error: 'not found' });
    let tpl;
    try { tpl = JSON.parse(fs.readFileSync(pathp,'utf8')); } catch (e) { return res.status(500).json({ error: 'failed to read template' }); }

    // Extract polygon if present
    const poly = tpl.canonical && tpl.canonical.polygon ? tpl.canonical.polygon : (tpl.original && tpl.original.polygon ? tpl.original.polygon : null);
    const arcIds = tpl.canonical && Array.isArray(tpl.canonical.arc_ids) ? tpl.canonical.arc_ids : (tpl.original && Array.isArray(tpl.original.arc_ids) ? tpl.original.arc_ids : null);

    const result = { signature: sig, polygon: poly || null, arc_ids: arcIds || null, precomputed: false, preview: null };

    // compute bbox for polygon
    if (Array.isArray(poly) && poly.length > 0) {
        let minlat = 1e9, minlon = 1e9, maxlat = -1e9, maxlon = -1e9;
        for (const p of poly) {
            const lat = Number(p[0]), lon = Number(p[1]);
            minlat = Math.min(minlat, lat); minlon = Math.min(minlon, lon);
            maxlat = Math.max(maxlat, lat); maxlon = Math.max(maxlon, lon);
        }
        result.bbox = [minlat, minlon, maxlat, maxlon];
    }

    // try to find resolve cache
    try {
        if (Array.isArray(poly) && poly.length >= 3) {
            const coords = poly.map(p => `${p[0].toFixed(6)},${p[1].toFixed(6)}`);
            const canon = coords.join(';');
            const hash = crypto.createHash('sha256').update(canon).digest('hex');
            const cache_file = path.join(CACHE_TEMPLATES_DIR, `resolve_poly_${hash}.json`);
            if (fs.existsSync(cache_file)) {
                const d = JSON.parse(fs.readFileSync(cache_file,'utf8'));
                result.precomputed = true;
                // prefer arc_coords preview if present, else arc_ids
                if (Array.isArray(d.arc_coords) && d.arc_coords.length > 0) result.preview = { arc_coords: d.arc_coords.slice(0, 200) };
                else if (Array.isArray(d.arc_ids)) result.preview = { arc_ids: d.arc_ids.slice(0, 500) };
                return res.json(result);
            }
        }
        // fallback: if arc_ids present in template, return summary
        if (Array.isArray(arcIds) && arcIds.length > 0) {
            result.precomputed = true;
            result.preview = { arc_ids: arcIds.slice(0, 500) };
            return res.json(result);
        }
        // as last fallback return polygon only
        res.json(result);
    } catch (e) {
        console.error('template preview error', e);
        res.status(500).json({ error: 'failed to prepare preview' });
    }
});

app.get('/api/templates/:sig', (req, res) => {
    ensureCacheDir();
    const sig = req.params.sig;
    let pathp = path.join(CACHE_TEMPLATES_DIR, `tpl_${sig}.json`);
    let deleted = false;
    if (!fs.existsSync(pathp)) {
        const tp = path.join(CACHE_TEMPLATES_TRASH, `tpl_${sig}.json`);
        if (fs.existsSync(tp)) {
            pathp = tp;
            deleted = true;
        } else {
            return res.status(404).json({ error: 'not found' });
        }
    }
    try {
        const j = JSON.parse(fs.readFileSync(pathp,'utf8'));
        j._meta = { path: pathp, deleted };
        res.json(j);
    } catch (e) {
        console.error('Failed to read template', e);
        res.status(500).json({ error: 'failed to read template' });
    }
});

app.delete('/api/templates/:sig', (req, res) => {
    ensureCacheDir();
    const sig = req.params.sig;
    const pathp = path.join(CACHE_TEMPLATES_DIR, `tpl_${sig}.json`);
    if (!fs.existsSync(pathp)) return res.status(404).json({ error: 'not found' });
    try {
        const dest = path.join(CACHE_TEMPLATES_TRASH, `tpl_${sig}.json`);
        fs.renameSync(pathp, dest);
        res.json({ deleted: true, signature: sig, path: dest });
    } catch(e) {
        console.error('Failed to move template to trash', e);
        res.status(500).json({ error: 'failed to delete' });
    }
});

// Restore template from trash
app.post('/api/templates/:sig/restore', (req, res) => {
    ensureCacheDir();
    const sig = req.params.sig;
    const tp = path.join(CACHE_TEMPLATES_TRASH, `tpl_${sig}.json`);
    if (!fs.existsSync(tp)) return res.status(404).json({ error: 'not found in trash' });
    try {
        const dest = path.join(CACHE_TEMPLATES_DIR, `tpl_${sig}.json`);
        fs.renameSync(tp, dest);
        res.json({ restored: true, signature: sig, path: dest });
    } catch (e) {
        console.error('Failed to restore template', e);
        res.status(500).json({ error: 'failed to restore' });
    }
});

app.listen(port, '127.0.0.1', () => {
    console.log(`Node.js 服务器已在 http://127.0.0.1:${port} 启动`);
    console.log(`请确保 C++ TCP 服务器正在 ${CPP_SERVER_HOST}:${CPP_SERVER_PORT} 上运行。`);
});
