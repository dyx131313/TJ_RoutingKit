// controls.js - UI controls, drawing and templates/rules glue
var selecting = 'from'; // 'from' or 'to' or null
var autoRoute = false;
var drawing = false;
var drawPoints = [];
var drawLayer = null;

// reuse polygonPreviewLayers and arcPreviewLayers from templates.js (they are declared there)
var previewDrawnCount = 0;

function updateMarkersFromInputs() {
  try {
    const fromVal = document.getElementById('from').value.trim();
    if (fromVal) {
      const parts = fromVal.split(',').map(s=>parseFloat(s.trim()));
      if (parts.length===2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
        setMarkerFrom(parts[0], parts[1]);
        try { document.getElementById('fromLabel').innerText = `${parts[0].toFixed(6)},${parts[1].toFixed(6)}`; } catch(e){}
      }
    }
  } catch(e) { console.warn('updateMarkersFromInputs from error', e); }
  try {
    const toVal = document.getElementById('to').value.trim();
    if (toVal) {
      const parts = toVal.split(',').map(s=>parseFloat(s.trim()));
      if (parts.length===2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
        setMarkerTo(parts[0], parts[1]);
        try { document.getElementById('toLabel').innerText = `${parts[0].toFixed(6)},${parts[1].toFixed(6)}`; } catch(e){}
      }
    }
  } catch(e) { console.warn('updateMarkersFromInputs to error', e); }
}

function selectMode(mode) {
  var fromBtn = document.getElementById('selFromBtn');
  var toBtn = document.getElementById('selToBtn');
  var drawBtn = document.getElementById('drawPolyBtn');
  if (selecting === mode) {
    selecting = null;
    document.getElementById('result').innerText = '';
  } else {
    selecting = mode;
    if (drawing) {
      drawing = false;
      drawBtn.classList.remove('active');
    }
  }
  fromBtn.classList.toggle('active', selecting === 'from');
  toBtn.classList.toggle('active', selecting === 'to');
  updateMarkersFromInputs();
}

function toggleDrawPoly() {
  drawing = !drawing;
  var fromBtn = document.getElementById('selFromBtn');
  var toBtn = document.getElementById('selToBtn');
  var drawBtn = document.getElementById('drawPolyBtn');
  if (drawing) {
    selecting = null;
    fromBtn.classList.remove('active');
    toBtn.classList.remove('active');
  }
  drawBtn.classList.toggle('active', drawing);
}

map.on('click', function(e) {
  if (drawing) {
    drawPoints.push([e.latlng.lat, e.latlng.lng]);
    if (drawLayer) map.removeLayer(drawLayer);
    drawLayer = L.polygon(drawPoints, {color: 'blue', dashArray: '6,6'}).addTo(map);
    return;
  }
  if (!selecting) {
    document.getElementById('result').innerText = '请先点击“选择 起点”或“选择 终点”按钮来指定目标。';
    return;
  }
  fetch(`/nearest?lat=${e.latlng.lat}&lon=${e.latlng.lng}`)
    .then(r => r.json())
    .then(j => {
      if (j.error) { document.getElementById('result').innerText = 'nearest 错误: ' + j.error; return; }
      const nearest = [j.lat, j.lon];
      setPreviewLine([e.latlng.lat, e.latlng.lng], nearest);
      if (selecting === 'from') document.getElementById('from').value = `${nearest[0]},${nearest[1]}`;
      else if (selecting === 'to') document.getElementById('to').value = `${nearest[0]},${nearest[1]}`;
      updateMarkersFromInputs();
      if (autoRoute) setTimeout(route, 50);
    })
    .catch(err => { document.getElementById('result').innerText = 'nearest 请求失败: ' + err; });
});

function clearDrawing() {
  drawPoints = [];
  if (drawLayer) { map.removeLayer(drawLayer); drawLayer = null; }
  drawing = false;
  try { document.getElementById('drawPolyBtn').classList.remove('active'); } catch(e) {}
  try { for (const l of polygonPreviewLayers) { if (l && map.hasLayer && map.hasLayer(l)) map.removeLayer(l); } } catch(e) {}
  polygonPreviewLayers = [];
  try { for (const l of arcPreviewLayers) { if (l && map.hasLayer && map.hasLayer(l)) map.removeLayer(l); } } catch(e) {}
  arcPreviewLayers = [];
  try {
    for (const sig in templatePreviewMap) {
      const arr = templatePreviewMap[sig] || [];
      for (const l of arr) { try { if (l && map.hasLayer && map.hasLayer(l)) map.removeLayer(l); } catch(e){} }
      templatePreviewMap[sig] = [];
      try { const btn = document.querySelector(`button[data-sig="${sig}"]`); if (btn) { btn.textContent = '预览'; btn.classList.remove('active'); } } catch(e){}
    }
  } catch(e) {}
  try { document.getElementById('previewLegend').style.display = 'none'; } catch(e) {}
  document.getElementById('result').innerText = '已取消当前绘制的多边形，并清除预览影响。';
}

window.selectMode = selectMode;
window.toggleDrawPoly = toggleDrawPoly;
window.clearDrawing = clearDrawing;
window.updateMarkersFromInputs = updateMarkersFromInputs;
window.selecting = selecting;
window.autoRoute = autoRoute;
window.drawing = drawing;
window.drawPoints = drawPoints;
window.drawLayer = drawLayer;

// --- Routing / preview / template helpers ---
function route() {
  var from = document.getElementById('from').value.trim();
  var to = document.getElementById('to').value.trim();
  var profile = document.getElementById('profile').value;
  if (!from || !to) { document.getElementById('result').innerText = '请输入起点和终点坐标'; return; }
  document.getElementById('result').innerText = '正在查询...';
  const sel = document.getElementById('ruleSelect');
  let url = `/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&profile=${encodeURIComponent(profile)}`;
  if (sel && sel.value) url += `&rule_id=${encodeURIComponent(sel.value)}`;
  fetch(url).then(r=>r.json()).then(data=>{
    if (data.error) { document.getElementById('result').innerText = '错误: ' + data.error; return; }
    try { setPolyline(data.path_coordinates); } catch(e) {}
    try {
      let txt = '';
      if (data.distance_meters !== undefined) txt += `物理距离: ${data.distance_meters} 米`;
      if (data.geo_distance_arcs_meters !== undefined) {
        if (txt) txt += '； ';
        txt += `沿弧累加长度: ${data.geo_distance_arcs_meters} 米`;
      }
      if (data.metric_distance !== undefined) {
          if (txt) txt += '； ';
          let metricPart = '';
          const unit = data.metric_unit || null;
          if (unit === 'ms') {
            // show both ms and s
            const s = (Number(data.metric_distance) / 1000).toFixed(2);
            metricPart = `度量值(metric): ${data.metric_distance} ${unit} (~${s} s)`;
          } else if (unit) {
            metricPart = `度量值(metric): ${data.metric_distance} ${unit}`;
          } else {
            metricPart = `度量值(metric): ${data.metric_distance}`;
          }
          txt += metricPart;
      }
      if (data.metric_type !== undefined) {
        if (txt) txt += '； ';
        txt += `metric_type: ${data.metric_type}`;
      }
      if (!txt) txt = '已收到路径结果（无距离信息）';
        if (data.metric_distance !== undefined && !data.metric_unit) txt += '（注意：metric 值可能是 travel_time_ms 或其它权重单位）';
      document.getElementById('result').innerText = txt;
    } catch(e){}
  }).catch(e=>{ document.getElementById('result').innerText = '请求失败: ' + e; });
}

async function previewPolygon() {
  if (!drawPoints || drawPoints.length < 3) { document.getElementById('result').innerText = '请先绘制至少 3 个点的多边形'; return; }
  document.getElementById('result').innerText = '正在解析多边形...';
  try {
    const body = { polygon: drawPoints };
    const res = await apiPost('/api/resolve_poly', body);
    // clear previous polygon preview layers
    try { for (const l of polygonPreviewLayers) { if (l && map.hasLayer && map.hasLayer(l)) map.removeLayer(l); } } catch(e){}
    polygonPreviewLayers = [];
    try { for (const l of arcPreviewLayers) { if (l && map.hasLayer && map.hasLayer(l)) map.removeLayer(l); } } catch(e){}
    arcPreviewLayers = [];
    let coords = null;
    if (res && Array.isArray(res.arc_coords) && res.arc_coords.length) coords = res.arc_coords;
    else if (res && Array.isArray(res.arc_ids) && res.arc_ids.length) coords = null;
    // draw polygon outline
    try { const poly = L.polygon(drawPoints, { color: 'blue', dashArray: '6,6', weight:1.5, opacity:0.9 }).addTo(map); polygonPreviewLayers.push(poly); } catch(e){}
    // draw arcs if available
    if (coords && coords.length) {
      for (const a of coords) {
        try {
          const line = L.polyline([a.u, a.v], { color: 'blue', weight: 2, opacity: 0.9 }).addTo(map);
          arcPreviewLayers.push(line);
        } catch(e){}
      }
    }
    if (arcPreviewLayers.length) { try { const group = L.featureGroup(arcPreviewLayers); map.fitBounds(group.getBounds()); } catch(e){}; try { document.getElementById('previewLegend').style.display = 'block'; } catch(e){} }
    document.getElementById('result').innerText = `多边形解析完成，绘制 ${arcPreviewLayers.length} 条弧`;
  } catch(e) {
    document.getElementById('result').innerText = '解析多边形失败: ' + e;
  }
}

async function saveTemplate() {
  const type = document.getElementById('templateType').value;
  const body = {};
  if (type === 'polygon') {
    if (!drawPoints || drawPoints.length < 3) { document.getElementById('result').innerText = '请先绘制多边形后保存模板'; return; }
    body.polygon = drawPoints;
  } else if (type === 'arc_ids') {
    const raw = document.getElementById('arcIdsInput').value.trim();
    if (!raw) { document.getElementById('result').innerText = '请输入 arc ids'; return; }
    body.arc_ids = raw.split(',').map(s=>Number(s.trim())).filter(x=>!Number.isNaN(x));
  } else if (type === 'tag_filter') {
    const k = document.getElementById('tagKey').value.trim();
    const v = document.getElementById('tagValue').value.trim();
    if (!k) { document.getElementById('result').innerText = '请输入 tag key'; return; }
    body.tag_filter = { key: k, value: v };
  }
  document.getElementById('result').innerText = '正在保存模板...';
  try {
    const j = await apiPost('/api/templates', body);
    if (j && j.signature) { window.__last_saved_template_sig = j.signature; document.getElementById('result').innerText = '模板已保存: ' + j.signature; }
    else document.getElementById('result').innerText = '保存返回: ' + JSON.stringify(j);
  } catch(e) { document.getElementById('result').innerText = '保存模板失败: ' + e; }
}

function undoTemplate() {
  const sig = window.__last_saved_template_sig;
  if (!sig) { document.getElementById('result').innerText = '没有可撤销的保存。'; return; }
  document.getElementById('result').innerText = '正在撤销模板...';
  fetch(`/api/templates/${sig}`, { method: 'DELETE' }).then(r => r.json()).then(j => {
    if (j.deleted) { document.getElementById('result').innerText = '已撤销保存（移至回收站）: ' + sig; window.__last_saved_template_sig = null; loadTemplates(); }
    else document.getElementById('result').innerText = '撤销失败: ' + JSON.stringify(j);
  }).catch(e => { document.getElementById('result').innerText = '撤销请求失败: ' + e; });
}

function openTemplatesPanel() { try { document.getElementById('templatesPanel').style.display = 'block'; loadTemplates(); loadRules(); listRules(); } catch(e){} }
function closeTemplatesPanel() { try { document.getElementById('templatesPanel').style.display = 'none'; } catch(e){} }
function openRulesPanel() { try { document.getElementById('rulesPanel').style.display = 'block'; listRules(); } catch(e){} }
function closeRulesPanel() { try { document.getElementById('rulesPanel').style.display = 'none'; } catch(e){} }

function showCreateRuleForm() { try { document.getElementById('createRuleForm').style.display = 'block'; onTplCheckboxChange(); } catch(e){} }
function hideCreateRuleForm() { try { document.getElementById('createRuleForm').style.display = 'none'; } catch(e){} }

async function createRule() {
  try {
    const name = document.getElementById('ruleName').value.trim();
    const checks = Array.from(document.querySelectorAll('.tplCheckbox')).filter(c=>c.checked).map(c=>c.getAttribute('data-sig'));
    if (!checks.length) { document.getElementById('result').innerText = '请选择至少一个模板'; return; }
    const body = { name: name || ('rule-' + Date.now()), templates: checks };
    document.getElementById('result').innerText = '正在创建规则...';
    const j = await apiPost('/api/rules', body);
    if (j && j.id) { document.getElementById('result').innerText = '规则已创建: ' + j.id; listRules(); hideCreateRuleForm(); }
    else document.getElementById('result').innerText = '创建规则返回: ' + JSON.stringify(j);
  } catch(e) { document.getElementById('result').innerText = '创建规则失败: ' + e; }
}

window.route = route;
window.previewPolygon = previewPolygon;
window.saveTemplate = saveTemplate;
window.undoTemplate = undoTemplate;
window.openTemplatesPanel = openTemplatesPanel;
window.closeTemplatesPanel = closeTemplatesPanel;
window.openRulesPanel = openRulesPanel;
window.closeRulesPanel = closeRulesPanel;
window.showCreateRuleForm = showCreateRuleForm;
window.hideCreateRuleForm = hideCreateRuleForm;
window.createRule = createRule;
window.loadRules = async function(){ try { const rules = await apiGet('/api/rules'); const sel = document.getElementById('ruleSelect'); if (sel) { sel.options.length = 1; (rules.rules||[]).forEach(r=>{ const opt = document.createElement('option'); opt.value = r.id; opt.textContent = r.name || r.id; sel.appendChild(opt); }); } } catch(e){} };
