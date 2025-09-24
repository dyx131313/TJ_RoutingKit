// templates.js - template list and preview handling
var templatePreviewMap = {}; // sig -> [layers]
var polygonPreviewLayers = [];
var arcPreviewLayers = [];

async function loadTemplates() {
  const list = document.getElementById('templatesList');
  if (!list) return;
  list.innerHTML = '加载中...';
  try {
    const j = await apiGet('/api/templates');
    if (j.error) { list.innerText = '加载失败: ' + j.error; return; }
    const arr = j.templates || [];
    const visible = arr.filter(t => !t.deleted);
    if (visible.length === 0) { list.innerText = '没有已保存的模板。'; return; }
    const html = visible.map(t => {
      const isPreviewing = (templatePreviewMap && templatePreviewMap[t.signature] && templatePreviewMap[t.signature].length);
      const previewText = isPreviewing ? '关闭预览' : '预览';
      const previewClass = isPreviewing ? 'btn-select active' : 'btn-select';
      const delBtn = t.deleted ? '' : `<button data-sig="${t.signature}" onclick="toggleTemplatePreview('${t.signature}', this)" class="${previewClass}">${previewText}</button> <button onclick="deleteTemplate('${t.signature}')" class="btn-select">删除</button>`;
      const checkbox = t.deleted ? '' : `<input type="checkbox" class="tplCheckbox" data-sig="${t.signature}" onchange="onTplCheckboxChange()">`;
      const badge = t.deleted ? `<span style="color:#a00;font-weight:bold;margin-left:8px">(已删除)</span>` : '';
      const desc = t.description ? `<div style="font-size:0.9em;color:#444;margin-top:6px">${t.description}</div>` : '';
      const createdHuman = t.created_at_human || (t.created_at ? new Date(t.created_at).toLocaleString() : 'unknown');
      return `<div style="border-bottom:1px solid #eee;padding:8px;display:flex;justify-content:space-between;">` +
             `<div>${checkbox}<strong style="margin-left:8px">${t.display_name || t.signature}</strong>${badge}<div style="font-size:0.9em;color:#666">创建: ${createdHuman} <small style=\"color:#999;margin-left:6px\">(${t.signature})</small></div>${desc}</div>` +
             `<div style="text-align:right">${delBtn}</div>` +
             `</div>`;
    }).join('');
    list.innerHTML = html;
    onTplCheckboxChange();
  } catch (e) {
    list.innerText = '加载失败: ' + e;
  }
}

async function toggleTemplatePreview(sig, btn) {
  if (!sig) return;
  try {
    if (templatePreviewMap[sig] && templatePreviewMap[sig].length) {
      for (const l of templatePreviewMap[sig]) { try { map.removeLayer(l); } catch(e){} }
      templatePreviewMap[sig] = [];
      try {
        const btnEl = btn || document.querySelector(`button[data-sig="${sig}"]`);
        if (btnEl) { btnEl.textContent = '预览'; btnEl.classList.remove('active'); }
      } catch(e){}
      document.getElementById('result').innerText = `已关闭模板 ${sig} 的预览`;
      return;
    }
    document.getElementById('result').innerText = `正在获取模板 ${sig} 预览...`;
    const j = await apiGet(`/api/templates/${encodeURIComponent(sig)}/preview`);
    templatePreviewMap[sig] = templatePreviewMap[sig] || [];
    const btnEl = document.querySelector(`button[data-sig="${sig}"]`);
    // draw arc_coords if present
    const coords = (j.preview && Array.isArray(j.preview.arc_coords) && j.preview.arc_coords.length) ? j.preview.arc_coords : (Array.isArray(j.arc_coords) && j.arc_coords.length ? j.arc_coords : null);
    if (coords && coords.length) {
      for (const a of coords) {
        const line = L.polyline([a.u, a.v], { color: 'orange', weight: 2, opacity: 0.9 }).addTo(map);
        try { line.on('click', function(){ try { map.removeLayer(line); } catch(e){}; try { templatePreviewMap[sig] = (templatePreviewMap[sig] || []).filter(l=>l!==line); } catch(e){}; try { const btnNow = btnEl || document.querySelector(`button[data-sig="${sig}"]`); if ((!templatePreviewMap[sig] || templatePreviewMap[sig].length===0) && btnNow) { btnNow.textContent = '预览'; btnNow.classList.remove('active'); } } catch(e){}; try { document.getElementById('result').innerText = `已移除模板 ${sig} 的一条预览弧（剩余 ${ (templatePreviewMap[sig]||[]).length } 条）`; } catch(e){} }); } catch(e){}
        templatePreviewMap[sig].push(line);
      }
      if (j.polygon && Array.isArray(j.polygon)) {
        try {
          const polyLayer = L.polygon(j.polygon, { color: 'blue', dashArray: '6,6', weight: 1.5, opacity: 0.9 }).addTo(map);
          polyLayer.on('click', function(){ try { map.removeLayer(polyLayer); } catch(e){}; try { templatePreviewMap[sig] = (templatePreviewMap[sig]||[]).filter(l=>l!==polyLayer); } catch(e){}; try { if ((!templatePreviewMap[sig] || templatePreviewMap[sig].length===0) && (btnEl || document.querySelector(`button[data-sig="${sig}"]`))) { (btnEl||document.querySelector(`button[data-sig="${sig}"]`)).textContent='预览'; (btnEl||document.querySelector(`button[data-sig="${sig}"]`)).classList.remove('active'); } } catch(e){} });
          templatePreviewMap[sig].push(polyLayer);
        } catch(e){}
      }
      try { if (btnEl) { btnEl.textContent = '关闭预览'; btnEl.classList.add('active'); } } catch(e){}
      const group = L.featureGroup(templatePreviewMap[sig]);
      try { map.fitBounds(group.getBounds()); } catch(e){}
      document.getElementById('result').innerText = `模板 ${sig} 预览: ${templatePreviewMap[sig].length} 条 arc_coords`;
      return;
    }
    if (j.arc_ids && Array.isArray(j.arc_ids)) {
      document.getElementById('result').innerText = `模板 ${sig} 预览: ${j.arc_ids.length} arc_ids（仅 id）`;
      return;
    }
    if (j.polygon && Array.isArray(j.polygon)) {
      const poly = L.polygon(j.polygon, {color: 'blue', dashArray: '6,6', weight:1.5, opacity:0.9}).addTo(map);
      poly.on('click', function(){ try { map.removeLayer(poly); } catch(e){}; try { templatePreviewMap[sig] = (templatePreviewMap[sig]||[]).filter(l=>l!==poly); } catch(e){}; try { const btnNow = document.querySelector(`button[data-sig="${sig}"]`); if ((!templatePreviewMap[sig] || templatePreviewMap[sig].length===0) && btnNow) { btnNow.textContent = '预览'; btnNow.classList.remove('active'); } } catch(e){} });
      templatePreviewMap[sig].push(poly);
      try { if (btnEl) { btnEl.textContent = '关闭预览'; btnEl.classList.add('active'); } } catch(e){}
      document.getElementById('result').innerText = `模板 ${sig} 多边形已在地图上高亮`;
      return;
    }
    if (j.preview) {
      const p = j.preview;
      if (p.arc_coords && Array.isArray(p.arc_coords)) {
        for (const a of p.arc_coords) {
          const line = L.polyline([a.u, a.v], { color: 'orange', weight: 2, opacity: 0.8 }).addTo(map);
          try { line.on('click', function(){ try { map.removeLayer(line); } catch(e){}; try { templatePreviewMap[sig] = (templatePreviewMap[sig]||[]).filter(l=>l!==line); } catch(e){}; try { const btnNow = document.querySelector(`button[data-sig="${sig}"]`); if ((!templatePreviewMap[sig] || templatePreviewMap[sig].length===0) && btnNow) { btnNow.textContent = '预览'; btnNow.classList.remove('active'); } } catch(e){}; try { document.getElementById('result').innerText = `已移除模板 ${sig} 的一条预览弧（剩余 ${ (templatePreviewMap[sig]||[]).length } 条）`; } catch(e){} }); } catch(e){}
          templatePreviewMap[sig].push(line);
        }
        if (j.polygon && Array.isArray(j.polygon)) {
          try {
            const polyLayer = L.polygon(j.polygon, { color: 'blue', dashArray: '6,6', weight:1.5, opacity:0.9 }).addTo(map);
            polyLayer.on('click', function(){ try { map.removeLayer(polyLayer); } catch(e){}; try { templatePreviewMap[sig] = (templatePreviewMap[sig]||[]).filter(l=>l!==polyLayer); } catch(e){}; try { const btnNow = document.querySelector(`button[data-sig="${sig}"]`); if ((!templatePreviewMap[sig] || templatePreviewMap[sig].length===0) && btnNow) { btnNow.textContent = '预览'; btnNow.classList.remove('active'); } } catch(e){} });
            templatePreviewMap[sig].push(polyLayer);
          } catch(e){}
        }
        try { if (btnEl) { btnEl.textContent = '关闭预览'; btnEl.classList.add('active'); } } catch(e){}
        document.getElementById('result').innerText = `模板 ${sig} 预览: ${templatePreviewMap[sig].length} 条 arc_coords`;
        return;
      }
      if (p.arc_ids && Array.isArray(p.arc_ids)) {
        document.getElementById('result').innerText = `模板 ${sig} 预览: ${p.arc_ids.length} arc_ids（仅 id）`;
        return;
      }
    }
    document.getElementById('result').innerText = `模板 ${sig} 没有可预览的内容`;
  } catch (e) {
    console.error('toggleTemplatePreview error', e);
    document.getElementById('result').innerText = '模板预览请求失败: ' + e;
  }
}

async function deleteTemplate(sig) {
  if (!confirm('确定要删除模板 ' + sig + ' 吗？（将移入回收站）')) return;
  try {
    const j = await fetch(`/api/templates/${sig}`, { method: 'DELETE' }).then(r=>r.json());
    if (j.deleted) { document.getElementById('result').innerText = '已删除: ' + sig; loadTemplates(); }
    else document.getElementById('result').innerText = '删除失败: ' + JSON.stringify(j);
  } catch(e) { document.getElementById('result').innerText = '删除请求失败: ' + e; }
}

function onTplCheckboxChange() {
  const checks = Array.from(document.querySelectorAll('.tplCheckbox')).filter(c=>c.checked).map(c=>c.getAttribute('data-sig'));
  document.getElementById('selectedTemplatesCount').innerText = checks.length;
}

window.loadTemplates = loadTemplates;
window.toggleTemplatePreview = toggleTemplatePreview;
window.deleteTemplate = deleteTemplate;
window.onTplCheckboxChange = onTplCheckboxChange;
window.templatePreviewMap = templatePreviewMap;
window.arcPreviewLayers = arcPreviewLayers;
window.polygonPreviewLayers = polygonPreviewLayers;
