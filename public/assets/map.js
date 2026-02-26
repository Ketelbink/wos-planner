
/* WoS Planner – V1.0 Step1-5 integrated (repo-native)
 * Uses MAP_CFG from /map/{slug} route:
 *   { slug,width,height,basePath }
 */

const cfg = window.MAP_CFG || {slug:'', width:60, height:60, basePath:''};
const API = {
  objects: (layer='all') => `${cfg.basePath}/api/maps/${encodeURIComponent(cfg.slug)}/objects?xmin=0&xmax=${cfg.width-1}&ymin=0&ymax=${cfg.height-1}&layer=${encodeURIComponent(layer)}`,
  tile: (x,y,layer='all') => `${cfg.basePath}/api/maps/${encodeURIComponent(cfg.slug)}/tile?x=${x}&y=${y}&layer=${encodeURIComponent(layer)}`,
  objectTypes: () => `${cfg.basePath}/api/object-types`,
  create: () => `${cfg.basePath}/api/maps/${encodeURIComponent(cfg.slug)}/objects/create`,
  update: (id) => `${cfg.basePath}/api/objects/${id}/update`,
  move: (id) => `${cfg.basePath}/api/objects/${id}/move`,
  del: (id) => `${cfg.basePath}/api/objects/${id}/delete`,
  export: (layer='all') => `${cfg.basePath}/api/maps/${encodeURIComponent(cfg.slug)}/export?layer=${encodeURIComponent(layer)}`,
  import: (dryRun=1) => `${cfg.basePath}/api/maps/${encodeURIComponent(cfg.slug)}/import?dryRun=${dryRun?1:0}`,
};

async function apiJson(url, opts={}){
  const res = await fetch(url, {
    headers: {'Content-Type':'application/json'},
    ...opts
  });
  const text = await res.text();
  let data;
  try{ data = text ? JSON.parse(text) : {}; }catch(e){ data = {raw:text}; }
  if(!res.ok){
    const msg = data?.error || data?.message || res.statusText;
    throw new Error(msg);
  }
  return data;
}

function safeJson(v){
  if(!v) return null;
  if(typeof v === 'object') return v;
  try{return JSON.parse(v);}catch{ return null; }
}

const els = {
  canvas: document.getElementById('mapCanvas'),
  status: document.getElementById('status'),

  // drawer + coordbar
  propDrawer: document.getElementById('propDrawer'),
  drawerBackdrop: document.getElementById('drawerBackdrop'),
  btnDrawerToggle: document.getElementById('btnDrawerToggle'),
  btnDrawerClose: document.getElementById('btnDrawerClose'),
  coordLeft: document.getElementById('coordLeft'),
  coordMid: document.getElementById('coordMid'),
  coordRight: document.getElementById('coordRight'),

  // tools
  toolSelect: document.getElementById('toolSelect'),
  toolPlace: document.getElementById('toolPlace'),

  // palette
  typeSearch: document.getElementById('typeSearch'),
  typePalette: document.getElementById('typePalette'),

  // top actions
  btnExport: document.getElementById('btnExport'),
  btnImport: document.getElementById('btnImport'),
  btnSeedSystem: document.getElementById('btnSeedSystem'),
  toggleSystem: document.getElementById('toggleSystem'),
  toggleLabels: document.getElementById('toggleLabels'),
  toggleFootprints: document.getElementById('toggleFootprints'),

  // properties
  propId: document.getElementById('propId'),
  propType: document.getElementById('propType'),
  propPos: document.getElementById('propPos'),
  propLayer: document.getElementById('propLayer'),
  propLocked: document.getElementById('propLocked'),
  inpTag: document.getElementById('inpTag'),
  inpNote: document.getElementById('inpNote'),
  inpColor: document.getElementById('inpColor'),
  btnSave: document.getElementById('btnSave'),
  btnMove: document.getElementById('btnMove'),
  btnDelete: document.getElementById('btnDelete'),

  // import modal
  modalImport: document.getElementById('modalImport'),
  btnCloseImport: document.getElementById('btnCloseImport'),
  importText: document.getElementById('importText'),
  btnDryRun: document.getElementById('btnDryRun'),
  btnApply: document.getElementById('btnApply'),
  importReport: document.getElementById('importReport'),
};

const state = {
  mode: 'select', // select | place | move
  gridW: cfg.width,
  gridH: cfg.height,
  tileSize: 24,
  zoom: 1,
  objects: [],
  objectTypes: [],
  selectedTypeCode: 'player_object',
  selected: null,
  hover: null,
  rotation: 0,
  showSystem: true,
  showLabels: true,
  showFootprints: false,
};

function setStatus(s){ if(els.status) els.status.textContent = s; }
function isMobile(){ return window.matchMedia && window.matchMedia('(max-width: 1023px)').matches; }
function openDrawer(){
  if(!els.propDrawer) return;
  els.propDrawer.classList.add('open');
  if(isMobile() && els.drawerBackdrop) els.drawerBackdrop.classList.remove('hidden');
}
function closeDrawer(){
  if(!els.propDrawer) return;
  els.propDrawer.classList.remove('open');
  if(els.drawerBackdrop) els.drawerBackdrop.classList.add('hidden');
}
function toggleDrawer(){
  if(!els.propDrawer) return;
  const open = els.propDrawer.classList.contains('open');
  open ? closeDrawer() : openDrawer();
}

function setCoord(x,y){
  if(els.coordMid) els.coordMid.textContent = `X: ${x}  Y: ${y}`;
  if(els.coordRight) els.coordRight.textContent = `ZOOM: ${Math.round(state.zoom*100)}%`;
}

function setMode(m){
  state.mode = m;
  if(els.toolSelect) els.toolSelect.classList.toggle('primary', m==='select');
  if(els.toolPlace) els.toolPlace.classList.toggle('primary', m==='place');
  if(m !== 'place'){ state.hover = null; }
  draw();
}

function typeDefaultMeta(t){
  return safeJson(t?.default_meta_json) || {};
}
function renderPalette(){
  if(!els.typePalette) return;
  const q = (els.typeSearch?.value || '').trim().toLowerCase();
  const types = (state.objectTypes || []).filter(t=>{
    if(!q) return true;
    return (t.name||'').toLowerCase().includes(q) || (t.code||'').toLowerCase().includes(q);
  });
  els.typePalette.innerHTML = '';
  for(const t of types){
    const btn = document.createElement('button');
    btn.className = 'pbtn' + (t.code === state.selectedTypeCode ? ' active' : '');
    const meta = typeDefaultMeta(t);
    const tag = meta.tag || '';
    btn.innerHTML = `<div>${t.name || t.code}</div><span class="sub">${tag ? tag : t.code}</span>`;
    btn.addEventListener('click', ()=>{
      state.selectedTypeCode = t.code;
      state.rotation = 0;
      renderPalette();
      draw();
    });
    els.typePalette.appendChild(btn);
  }
}
function getSelectedType(){
  return (state.objectTypes || []).find(t => t.code === state.selectedTypeCode) || null;
}
function rotatedFootprint(fp, rotation){
  const r = ((rotation%4)+4)%4;
  if(!Array.isArray(fp) || fp.length===0) return [{dx:0,dy:0}];
  return fp.map(t=>{
    const dx=Number(t.dx||0), dy=Number(t.dy||0);
    if(r===0) return {dx,dy};
    if(r===1) return {dx:-dy, dy:dx};
    if(r===2) return {dx:-dx, dy:-dy};
    return {dx:dy, dy:-dx};
  });
}

function fitCanvas(){
  const rect = els.canvas.parentElement.getBoundingClientRect();
  els.canvas.width = Math.floor(rect.width * devicePixelRatio);
  els.canvas.height = Math.floor(rect.height * devicePixelRatio);
  draw();
}

function tileFromEvent(ev){
  const rect = els.canvas.getBoundingClientRect();
  const cx = (ev.clientX - rect.left) * devicePixelRatio;
  const cy = (ev.clientY - rect.top) * devicePixelRatio;
  const ts = state.tileSize * state.zoom * devicePixelRatio;
  return { x: Math.floor(cx/ts), y: Math.floor(cy/ts) };
}

async function loadObjectTypes(){
  try{
    const data = await apiJson(API.objectTypes());
    state.objectTypes = data.object_types || [];
    if(state.objectTypes.find(t=>t.code==='player_object')) state.selectedTypeCode='player_object';
    else if(state.objectTypes.length) state.selectedTypeCode = state.objectTypes[0].code;
    renderPalette();
  }catch(e){
    console.warn('object types load failed', e);
    state.objectTypes = [{code:'player_object', name:'Player Object', footprint_json:'[{"dx":0,"dy":0}]', default_meta_json:'{}'}];
    state.selectedTypeCode='player_object';
    renderPalette();
  }
}

async function loadObjects(){
  setStatus('loading objects�');

  const layer = state.showSystem ? 'all' : 'object';

  try {
    const data = await apiJson(API.objects(layer));

    if (Array.isArray(data?.objects)) {
      state.objects = data.objects;
    } else {
      console.warn('Unexpected objects payload:', data);
      state.objects = [];
    }

  } catch (e) {
    console.error('loadObjects failed:', e);
    state.objects = [];
  }

  draw();
}

function draw(){
  const ctx = els.canvas.getContext('2d');
  const W = els.canvas.width, H = els.canvas.height;
  ctx.clearRect(0,0,W,H);

  const ts = state.tileSize * state.zoom * devicePixelRatio;

  // grid
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  ctx.lineWidth = 1;
  for(let x=0; x<=state.gridW; x++){
    ctx.beginPath();
    ctx.moveTo(x*ts, 0);
    ctx.lineTo(x*ts, state.gridH*ts);
    ctx.stroke();
  }
  for(let y=0; y<=state.gridH; y++){
    ctx.beginPath();
    ctx.moveTo(0, y*ts);
    ctx.lineTo(state.gridW*ts, y*ts);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // hover preview (place)
  if(state.mode==='place' && state.hover?.tiles){
    ctx.strokeStyle = 'rgba(90,242,196,.85)';
    ctx.lineWidth = 2;
    for(const t of state.hover.tiles){
      ctx.strokeRect(t.x*ts+2, t.y*ts+2, ts-4, ts-4);
    }
    ctx.lineWidth = 1;
  }

  // objects (system first)
    const base = Array.isArray(state.objects) ? state.objects : [];
    const objs = [...base].sort((a,b)=>{
    const la=(a.layer==='system'?0:1), lb=(b.layer==='system'?0:1);
    if(la!==lb) return la-lb;
    return (a.id||0)-(b.id||0);
  });

  for(const o of objs){
    if(!state.showSystem && o.layer==='system') continue;
    const meta = safeJson(o.meta_json) || {};
    const color = meta.color || (o.layer==='system' ? 'rgba(90,242,196,.25)' : 'rgba(122,162,255,.25)');
    const fp = meta.footprint || [{dx:0,dy:0}];

    for(const p of fp){
      const x = (o.x + Number(p.dx||0));
      const y = (o.y + Number(p.dy||0));
      ctx.fillStyle = color;
      ctx.fillRect(x*ts+1, y*ts+1, ts-2, ts-2);
      if(state.showFootprints){
        ctx.strokeStyle='rgba(255,255,255,.25)';
        ctx.strokeRect(x*ts+2, y*ts+2, ts-4, ts-4);
      }
    }

    // selection outline
    if(state.selected && state.selected.id === o.id){
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x*ts+2, o.y*ts+2, ts-4, ts-4);
      ctx.lineWidth = 1;
    }

    if(state.showLabels){
      const label = meta.tag || o.type || '';
      if(label){
        ctx.fillStyle='rgba(255,255,255,.85)';
        ctx.font = `${12*devicePixelRatio}px system-ui`;
        ctx.fillText(label, o.x*ts + 4, o.y*ts + 14*devicePixelRatio);
      }
    }
  }
}

function fillProperties(o){
  state.selected = o;
  if(!o){
    els.propId.textContent = '-';
    els.propType.textContent = '-';
    els.propPos.textContent = '-';
    els.propLayer.textContent = '-';
    els.propLocked.textContent = '-';
    els.inpTag.value = '';
    els.inpNote.value = '';
    els.inpColor.value = '';
    els.btnSave.disabled = true;
    els.btnMove.disabled = true;
    els.btnDelete.disabled = true;
    draw();
    return;
  }
  // auto-open drawer on select
  openDrawer();
  const meta = safeJson(o.meta_json) || {};
  els.propId.textContent = o.id;
  els.propType.textContent = o.type;
  els.propPos.textContent = `${o.x},${o.y}`;
  els.propLayer.textContent = o.layer || 'object';
  els.propLocked.textContent = (Number(o.is_locked||0)===1) ? 'yes' : 'no';

  els.inpTag.value = meta.tag || '';
  els.inpNote.value = meta.note || '';
  // allow both #hex and rgba – keep raw
  els.inpColor.value = (meta.color && meta.color.startsWith('#')) ? meta.color : '#7aa2ff';

  const locked = Number(o.is_locked||0)===1;
  els.btnSave.disabled = locked;
  els.btnMove.disabled = locked;
  els.btnDelete.disabled = locked;
  draw();
}

async function createObjectAt(x,y){
  const t = getSelectedType();
  const type_code = t?.code || state.selectedTypeCode || 'player_object';

  let fp = [{dx:0,dy:0}];
  try{
    const rawFp = safeJson(t?.footprint_json) || [{dx:0,dy:0}];
    fp = rotatedFootprint(rawFp, state.rotation);
  }catch(e){}

  const meta = { footprint: fp };
  await apiJson(API.create(), {method:'POST', body: JSON.stringify({type_code, x, y, meta})});
}

async function onCanvasClick(ev){
  const {x,y} = tileFromEvent(ev);

  if(state.mode==='move' && state.selected){
    try{
      await apiJson(API.move(state.selected.id), {method:'POST', body: JSON.stringify({x,y})});
      setMode('select');
      await loadObjects();
    }catch(e){ alert('Move failed: '+e.message); }
    return;
  }

  if(state.mode==='place'){
    try{
      await createObjectAt(x,y);
      await loadObjects();
    }catch(e){ alert('Place failed: '+e.message); }
    return;
  }

  // select mode: tile lookup
  try{
    const data = await apiJson(API.tile(x,y, state.showSystem?'all':'object'));
    fillProperties(data.object);
  }catch(e){
    console.warn(e);
  }
}

function onCanvasMove(ev){
  const {x,y} = tileFromEvent(ev);
  if(x>=0 && y>=0 && x<state.gridW && y<state.gridH){ setCoord(x,y); }
  if(state.mode !== 'place'){
    if(state.hover){ state.hover=null; draw(); }
    return;
  }
  if(x<0||y<0||x>=state.gridW||y>=state.gridH){
    if(state.hover){ state.hover=null; draw(); }
    return;
  }
  const t = getSelectedType();
  let fp = [{dx:0,dy:0}];
  try{
    const rawFp = safeJson(t?.footprint_json) || [{dx:0,dy:0}];
    fp = rotatedFootprint(rawFp, state.rotation);
  }catch(e){}
  const tiles = fp.map(p=> ({x:x+Number(p.dx||0), y:y+Number(p.dy||0)}));
  const next = {x,y,tiles};
  const changed = !state.hover || state.hover.x!==next.x || state.hover.y!==next.y;
  if(changed){ state.hover = next; draw(); }
}

async function saveSelected(){
  if(!state.selected) return;
  const body = {
    tag: els.inpTag.value,
    note: els.inpNote.value,
    color: els.inpColor.value,
  };
  await apiJson(API.update(state.selected.id), {method:'POST', body: JSON.stringify(body)});
  await loadObjects();
}
async function deleteSelected(){
  if(!state.selected) return;
  if(!confirm('Delete this object?')) return;
  await apiJson(API.del(state.selected.id), {method:'POST'});
  fillProperties(null);
  await loadObjects();
}
function enterMove(){
  if(!state.selected) return;
  setMode('move');
  setStatus('Move: click new tile');
}

async function exportJson(){
  const layer = state.showSystem ? 'all' : 'object';
  const data = await apiJson(API.export(layer));
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${cfg.slug}-${layer}-export.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(a.href), 1500);
}

function openImport(){
  els.modalImport.classList.remove('hidden');
  els.importReport.textContent='';
  els.btnApply.disabled = true;
}
function closeImport(){ els.modalImport.classList.add('hidden'); }

function parseImport(){
  const raw = els.importText.value.trim();
  if(!raw) throw new Error('Empty JSON');
  const data = JSON.parse(raw);
  if(data.schema === 'wos-planner-export-v1' && Array.isArray(data.objects)){
    return {objects: data.objects};
  }
  if(Array.isArray(data.objects)) return data;
  if(Array.isArray(data)) return {objects:data};
  throw new Error('Invalid format. Expect {objects:[...]} or export payload.');
}

async function runImport(dryRun){
  const payload = parseImport();
  const data = await apiJson(API.import(dryRun), {method:'POST', body: JSON.stringify(payload)});
  els.importReport.textContent = JSON.stringify(data,null,2);
  els.btnApply.disabled = dryRun ? false : true;
  return data;
}

async function seedSystem(){
  const res = await fetch(`${cfg.basePath}/seeds/system_seed_default.json`);
  if(!res.ok) throw new Error('Seed file not found');
  const seed = await res.json();
  const payload = seed.schema === 'wos-planner-seed-v1' ? {objects: seed.objects} : seed;
  const report = await apiJson(API.import(true), {method:'POST', body: JSON.stringify(payload)});
  const msg = `Seed dry-run\nnew: ${(report.new||[]).length}\nconflicts: ${(report.conflicts||[]).length}\nout_of_bounds: ${(report.out_of_bounds||[]).length}\n\nApply seed now?`;
  if(!confirm(msg)) return;
  await apiJson(API.import(false), {method:'POST', body: JSON.stringify(payload)});
  await loadObjects();
}

window.addEventListener('keydown', (ev)=>{
  if(state.mode !== 'place') return;
  if(ev.key==='r' || ev.key==='R'){
    state.rotation = (state.rotation + 1) % 4;
    draw();
  }
});

// boot
(async function init(){
  try{
    setStatus('loading…');
    // toggles
    state.showSystem = !!els.toggleSystem.checked;
    state.showLabels = !!els.toggleLabels.checked;
    state.showFootprints = !!els.toggleFootprints.checked;

    await loadObjectTypes();
    await loadObjects();
    fillProperties(null);
    setCoord('-', '-');

    setMode('select');
    if(els.canvas) els.canvas.addEventListener('click', onCanvasClick);
    if(els.canvas) els.canvas.addEventListener('mousemove', onCanvasMove);
    if(els.canvas) els.canvas.addEventListener('mouseleave', ()=>{ if(state.hover){ state.hover=null; draw(); } });

    window.addEventListener('resize', fitCanvas);
    fitCanvas();

    // drawer wiring
    if(els.btnDrawerToggle) els.btnDrawerToggle.addEventListener('click', toggleDrawer);
    if(els.btnDrawerClose) els.btnDrawerClose.addEventListener('click', closeDrawer);
    if(els.drawerBackdrop) els.drawerBackdrop.addEventListener('click', closeDrawer);
    window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDrawer(); });

    // wire ui
    if(els.toolSelect) els.toolSelect.addEventListener('click', ()=> setMode('select'));
    if(els.toolPlace) els.toolPlace.addEventListener('click', ()=> setMode('place'));
    if(els.typeSearch) els.typeSearch.addEventListener('input', renderPalette);

    if(els.toggleSystem) els.toggleSystem.addEventListener('change', async ()=>{
      state.showSystem = !!els.toggleSystem.checked;
      await loadObjects();
    });
    if(els.toggleLabels) els.toggleLabels.addEventListener('change', ()=>{ state.showLabels = !!els.toggleLabels.checked; draw(); });
    if(els.toggleFootprints) els.toggleFootprints.addEventListener('change', ()=>{ state.showFootprints = !!els.toggleFootprints.checked; draw(); });

    if(els.btnSave) els.btnSave.addEventListener('click', async()=>{ try{ await saveSelected(); }catch(e){ alert('Save failed: '+e.message);} });
    if(els.btnMove) els.btnMove.addEventListener('click', ()=> enterMove());
    if(els.btnDelete) els.btnDelete.addEventListener('click', async()=>{ try{ await deleteSelected(); }catch(e){ alert('Delete failed: '+e.message);} });

    if(els.btnExport) els.btnExport.addEventListener('click', async()=>{ try{ await exportJson(); }catch(e){ alert('Export failed: '+e.message);} });
    if(els.btnImport) els.btnImport.addEventListener('click', openImport);
    if(els.btnSeedSystem) els.btnSeedSystem.addEventListener('click', async()=>{ try{ await seedSystem(); }catch(e){ alert('Seed failed: '+e.message);} });

    if(els.btnCloseImport) els.btnCloseImport.addEventListener('click', closeImport);
    if(els.modalImport) els.modalImport.addEventListener('click', (ev)=>{ if(ev.target===els.modalImport) closeImport();});
    if(els.btnDryRun) els.btnDryRun.addEventListener('click', async()=>{ try{ await runImport(true);}catch(e){ alert('Dry-run failed: '+e.message);} });
    if(els.btnApply) els.btnApply.addEventListener('click', async()=>{ try{ await runImport(false); await loadObjects(); closeImport(); }catch(e){ alert('Apply failed: '+e.message);} });

    setStatus('ready');
  }catch(e){
    console.error(e);
    setStatus('error: ' + e.message);
  }
})();
