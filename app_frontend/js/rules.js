// rules.js - rule preview, list and build operations
var arcPreviewLayers = window.arcPreviewLayers || [];

async function listRules() {
  const el = document.getElementById('rulesPanelList');
  const selectEl = document.getElementById('ruleSelect');
  if (!el) {
    console.warn('rulesPanelList element not found');
    return;
  }
  if (!selectEl) {
    console.warn('ruleSelect element not found');
    return;
  }
  el.innerText = '加载中...';
  selectEl.innerHTML = '<option value="">(无)</option>'; // 清空下拉框
  try {
    console.log('Fetching rules from /api/rules');
    const j = await apiGet('/api/rules');
    console.log('Received response from /api/rules:', j);
    if (j.error) {
      console.error('Error fetching rules:', j.error);
      el.innerText = '加载失败: ' + j.error;
      return;
    }
    const rows = (j.rules || []).map(r => {
      console.log('Processing rule:', r);
      return `<div style="border-bottom:1px solid #eee;padding:6px"><div><strong>${r.name}</strong> <small style="color:#666">(${r.id})</small></div><div style="font-size:0.9em;color:#666">模板: ${ (r.templates || []).slice(0,5).join(',') }${(r.templates||[]).length>5? '...':''}</div><div style="margin-top:6px"><button onclick="buildRule('${r.id}')" class="btn-select">构建 metric</button> <button onclick="deleteRule('${r.id}')" class="btn-select">删除规则</button></div></div>`;
    }).join('');
    el.innerHTML = rows || '(无)';

    // 更新 ruleSelect 下拉框
    const options = (j.rules || []).map(r => {
      return `<option value="${r.id}">${r.name}</option>`;
    }).join('');
    selectEl.innerHTML = '<option value="">(无)</option>' + options; // 始终保留“无规则”选项
  } catch (e) {
    console.error('Error in listRules:', e);
    el.innerText = '加载失败: ' + e;
    selectEl.innerHTML = '<option value="">(加载失败)</option>';
  }
}

async function buildRule(id) {
  document.getElementById('result').innerText = '开始构建...';
  try {
    const j = await fetch(`/api/rules/${id}/build`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ big: 1000000000 }) }).then(r=>r.json());
    if (j.built) { document.getElementById('result').innerText = `构建完成: ${j.path} 影响 ${j.affected_count}`; listRules(); }
    else document.getElementById('result').innerText = '构建失败: ' + JSON.stringify(j);
  } catch(e) { document.getElementById('result').innerText = '构建请求失败: ' + e; }
}

async function deleteRule(id) { if (!confirm('删除规则?')) return; try { const j = await fetch(`/api/rules/${id}`, { method: 'DELETE' }).then(r=>r.json()); if (j.deleted) { document.getElementById('result').innerText = '规则已删除'; listRules(); } else document.getElementById('result').innerText = '删除返回: ' + JSON.stringify(j); } catch(e) { document.getElementById('result').innerText = '删除规则失败: ' + e; } }

async function previewRule(ruleId) {
  if (!ruleId) return;
  document.getElementById('result').innerText = '正在获取规则预览...';
  try {
    const r = await apiGet(`/api/rules/${encodeURIComponent(ruleId)}`);
    const templates = Array.isArray(r.templates) ? r.templates : [];
    // clear old preview layers
    for (const l of arcPreviewLayers) map.removeLayer(l);
    arcPreviewLayers = [];
    let total = 0;
    const groupLayers = [];
    let drawn = 0;
    for (const sig of templates) {
      try {
        let tj = await apiGet(`/api/templates/${encodeURIComponent(sig)}/preview`);
        if ((!tj.arc_coords || tj.arc_coords.length === 0) && Array.isArray(tj.arc_ids) && tj.arc_ids.length > 0 && tj.arc_ids.length <= 2000) {
          try { const pj = await fetch(`/api/templates/${encodeURIComponent(sig)}/precompute`, { method: 'POST' }).then(r=>r.json()); tj = pj.result || tj; } catch(e){}
        }
        const coords = (tj.preview && tj.preview.arc_coords) ? tj.preview.arc_coords : (tj.arc_coords || []);
        if (Array.isArray(coords) && coords.length) {
          total += coords.length;
          for (const a of coords) {
            const line = L.polyline([a.u, a.v], { color: 'blue', weight: 2, opacity: 0.9 }).addTo(map);
            try { line.on('click', function(){ try { map.removeLayer(line); } catch(e){}; try { arcPreviewLayers = arcPreviewLayers.filter(l=>l!==line); } catch(e){}; try { groupLayers.splice(groupLayers.indexOf(line),1); } catch(e){}; try { if (arcPreviewLayers.length === 0) document.getElementById('previewLegend').style.display = 'none'; } catch(e){}; try { document.getElementById('result').innerText = `已移除一条预览弧（剩余 ${arcPreviewLayers.length} 条）`; } catch(e){} }); } catch(e){}
            arcPreviewLayers.push(line);
            groupLayers.push(line);
            drawn++;
          }
        }
      } catch(e){}
    }
    if (groupLayers.length) {
      const group = L.featureGroup(groupLayers);
      try { map.fitBounds(group.getBounds()); } catch(e) {}
      try { document.getElementById('previewLegend').style.display = 'block'; } catch(e){}
    } else {
      try { document.getElementById('previewLegend').style.display = 'none'; } catch(e){}
    }
    document.getElementById('result').innerText = `规则 ${ruleId} 影响弧数 (预览): ${total}`;
  } catch (e) {
    document.getElementById('result').innerText = '规则预览失败: ' + e;
  }
}

window.listRules = listRules;
window.buildRule = buildRule;
window.deleteRule = deleteRule;
window.previewRule = previewRule;

// Ensure listRules is called on script load
window.addEventListener('DOMContentLoaded', () => {
  try {
    listRules();
  } catch (e) {
    console.error('Error initializing rules on page load:', e);
  }
});
