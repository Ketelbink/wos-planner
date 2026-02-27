
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
  btnZoomOut: document.getElementById('btnZoomOut'),
  btnZoomIn: document.getElementById('btnZoomIn'),
  btnResetView: document.getElementById('btnResetView'),
  btnRotateView: document.getElementById('btnRotateView'),
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
  zoomMin: 0.25,
  zoomMax: 4,

  // camera (world tile coords, view-only)
  camX: (cfg.width-1)/2,
  camY: (cfg.height-1)/2,
  viewRot: 0, // 0 or Math.PI/4

  // pointer interaction
  isPanning: false,
  panPointerId: null,
  lastPanX: 0,
  lastPanY: 0,
  pointers: new Map(),
  pinchStartDist: 0,
  pinchStartZoom: 1,
  pinchAnchorWorld: null,
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

function clampCamera(){
  const ts = getTs();
  const W = els.canvas.width, H = els.canvas.height;
  // Approx clamp (works well enough for v1.2 even with rotation)
  const halfW = (W/2) / ts;
  const halfH = (H/2) / ts;
  state.camX = Math.max(halfW, Math.min(state.gridW - halfW, state.camX));
  state.camY = Math.max(halfH, Math.min(state.gridH - halfH, state.camY));
}

function setZoom(newZoom, anchorEv=null){
  const z = Math.max(state.zoomMin, Math.min(state.zoomMax, newZoom));
  if(!anchorEv){
    state.zoom = z;
    clampCamera();
    draw();
    setCoord(state.hover?.x ?? '-', state.hover?.y ?? '-');
    return;
  }

  // zoom-to-cursor (keep world point under cursor stable)
  const rect = els.canvas.getBoundingClientRect();
  const sx = (anchorEv.clientX - rect.left) * devicePixelRatio;
  const sy = (anchorEv.clientY - rect.top) * devicePixelRatio;
  const W = els.canvas.width, H = els.canvas.height;

  // screen -> centered
  let x = sx - W/2;
  let y = sy - H/2;

  const tsOld = getTs();
  const inv = rot2(x,y,-state.viewRot);
  const anchorWorldX = state.camX + (inv.x / tsOld);
  const anchorWorldY = state.camY + (inv.y / tsOld);

  state.zoom = z;
  const tsNew = getTs();

  state.camX = anchorWorldX - (inv.x / tsNew);
  state.camY = anchorWorldY - (inv.y / tsNew);

  clampCamera();
  draw();
}

function getTs(){ return state.tileSize * state.zoom * devicePixelRatio; }

function rot2(x,y,ang){
  const c = Math.cos(ang), s = Math.sin(ang);
  return {x: x*c - y*s, y: x*s + y*c};
}

function screenToWorldPx(ev){
  const rect = els.canvas.getBoundingClientRect();
  const sx = (ev.clientX - rect.left) * devicePixelRatio;
  const sy = (ev.clientY - rect.top) * devicePixelRatio;

  const W = els.canvas.width, H = els.canvas.height;
  const ts = getTs();

  // screen -> centered
  let x = sx - W/2;
  let y = sy - H/2;

  // undo view rotation
  const r = rot2(x,y, -state.viewRot);
  x = r.x; y = r.y;

  // to world pixels
  return { x: x + state.camX*ts, y: y + state.camY*ts, ts };
}

function tileFromEvent(ev){
  const w = screenToWorldPx(ev);
  return { x: Math.floor(w.x / w.ts), y: Math.floor(w.y / w.ts) };
}

function draw(){
  const ctx = els.canvas.getContext('2d');
  const W = els.canvas.width, H = els.canvas.height;

  // reset transform + clear
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,W,H);

  const ts = getTs();

  // apply camera transform (world px -> screen px)
  ctx.translate(W/2, H/2);
  ctx.rotate(state.viewRot);
  ctx.translate(-state.camX*ts, -state.camY*ts);

  // visible tile bounds (approx) using inverse of screen corners
  function cornerWorldTile(px,py){
    // px,py are in screen device px (canvas space)
    let x = px - W/2;
    let y = py - H/2;
    const r = rot2(x,y,-state.viewRot);
    x = r.x + state.camX*ts;
    y = r.y + state.camY*ts;
    return { tx: x/ts, ty: y/ts };
  }
  const c1 = cornerWorldTile(0,0);
  const c2 = cornerWorldTile(W,0);
  const c3 = cornerWorldTile(0,H);
  const c4 = cornerWorldTile(W,H);
  const xs = [c1.tx,c2.tx,c3.tx,c4.tx], ys=[c1.ty,c2.ty,c3.ty,c4.ty];
  let xmin = Math.floor(Math.min(...xs)) - 2;
  let xmax = Math.ceil(Math.max(...xs)) + 2;
  let ymin = Math.floor(Math.min(...ys)) - 2;
  let ymax = Math.ceil(Math.max(...ys)) + 2;
  xmin = Math.max(0, xmin); ymin=Math.max(0,ymin);
  xmax = Math.min(state.gridW-1, xmax); ymax=Math.min(state.gridH-1, ymax);

  // grid (only visible region)
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  ctx.lineWidth = 1;
  for(let x=xmin; x<=xmax+1; x++){
    ctx.beginPath();
    ctx.moveTo(x*ts, ymin*ts);
    ctx.lineTo(x*ts, (ymax+1)*ts);
    ctx.stroke();
  }
  for(let y=ymin; y<=ymax+1; y++){
    ctx.beginPath();
    ctx.moveTo(xmin*ts, y*ts);
    ctx.lineTo((xmax+1)*ts, y*ts);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // hover preview (place)
  if(state.mode==='place' && state.hover?.tiles){
    ctx.strokeStyle = 'rgba(90,242,196,.85)';
    ctx.lineWidth = 2;
    for(const t of state.hover.tiles){
      if(t.x < xmin-2 || t.x > xmax+2 || t.y < ymin-2 || t.y > ymax+2) continue;
      ctx.strokeRect(t.x*ts, t.y*ts, ts, ts);
    }
  }

  // selected outline
  if(state.selected?.tiles){
    ctx.strokeStyle = 'rgba(122,162,255,.95)';
    ctx.lineWidth = 3;
    for(const t of state.selected.tiles){
      if(t.x < xmin-2 || t.x > xmax+2 || t.y < ymin-2 || t.y > ymax+2) continue;
      ctx.strokeRect(t.x*ts, t.y*ts, ts, ts);
    }
  }

  // objects
  const objs = Array.isArray(state.objects) ? state.objects : [];
  for(const o of objs){
    if(!state.showSystem && o.layer==='system') continue;

    // bbox cull
    const w = Math.max(1, Number(o.w||1));
    const h = Math.max(1, Number(o.h||1));
    if(o.x + w < xmin || o.x > xmax || o.y + h < ymin || o.y > ymax) continue;

    // body
    ctx.fillStyle = o.color || (o.layer==='system' ? 'rgba(94,242,196,.55)' : 'rgba(122,162,255,.45)');
    ctx.fillRect(o.x*ts, o.y*ts, w*ts, h*ts);

    // footprint (optional)
    if(state.showFootprints){
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x*ts, o.y*ts, w*ts, h*ts);
    }

    // label
    if(state.showLabels){
      const label = o.tag || o.type || '';
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


function onWheel(ev){
  ev.preventDefault();
  const delta = ev.deltaY;
  const factor = delta > 0 ? 0.9 : 1.1;
  setZoom(state.zoom * factor, ev);
}

function onPointerDown(ev){
  if(!els.canvas) return;
  els.canvas.setPointerCapture?.(ev.pointerId);

  // store pointer
  state.pointers.set(ev.pointerId, {x: ev.clientX, y: ev.clientY});

  // pinch start
  if(state.pointers.size === 2){
    const pts = Array.from(state.pointers.values());
    const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    state.pinchStartDist = Math.hypot(dx,dy);
    state.pinchStartZoom = state.zoom;

    // anchor = midpoint world
    const midEv = { clientX: (pts[0].x + pts[1].x)/2, clientY: (pts[0].y + pts[1].y)/2 };
    const w = screenToWorldPx(midEv);
    state.pinchAnchorWorld = { wx: w.x / w.ts, wy: w.y / w.ts, sx: midEv.clientX, sy: midEv.clientY };
    return;
  }

  // start panning (drag). We keep click-to-select by using a small drag threshold in pointerup.
  state.isPanning = true;
  state.panPointerId = ev.pointerId;
  state.lastPanX = ev.clientX;
  state.lastPanY = ev.clientY;
  state._dragMoved = false;
}

function onPointerMove(ev){
  // update pointer cache
  if(state.pointers.has(ev.pointerId)){
    state.pointers.set(ev.pointerId, {x: ev.clientX, y: ev.clientY});
  }

  // pinch zoom
  if(state.pointers.size === 2 && state.pinchAnchorWorld){
    const pts = Array.from(state.pointers.values());
    const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    const dist = Math.hypot(dx,dy) || 1;
    const ratio = dist / (state.pinchStartDist || dist);
    const newZoom = state.pinchStartZoom * ratio;

    // Keep anchor stable at midpoint
    const mid = { clientX: (pts[0].x + pts[1].x)/2, clientY: (pts[0].y + pts[1].y)/2 };
    // reuse setZoom with anchor event
    setZoom(newZoom, mid);
    return;
  }

  // panning
  if(state.isPanning && state.panPointerId === ev.pointerId){
    const dx = ev.clientX - state.lastPanX;
    const dy = ev.clientY - state.lastPanY;
    if(Math.abs(dx) + Math.abs(dy) > 2) state._dragMoved = true;

    state.lastPanX = ev.clientX;
    state.lastPanY = ev.clientY;

    // convert screen delta -> world tile delta
    const ts = getTs();
    const dprDx = dx * devicePixelRatio;
    const dprDy = dy * devicePixelRatio;
    const inv = rot2(dprDx, dprDy, -state.viewRot);

    state.camX -= inv.x / ts;
    state.camY -= inv.y / ts;

    clampCamera();
    draw();
    return;
  }

  // hover update (when not panning)
  onCanvasMove(ev);
}

function onPointerUp(ev){
  // update cache
  state.pointers.delete(ev.pointerId);

  if(state.pointers.size < 2){
    state.pinchAnchorWorld = null;
    state.pinchStartDist = 0;
  }

  if(state.isPanning && state.panPointerId === ev.pointerId){
    state.isPanning = false;
    state.panPointerId = null;

    // If it was a tap/click (no drag), treat as click
    if(!state._dragMoved){
      onCanvasClick(ev);
    }
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
    if(els.canvas){
      // Pointer events unify mouse + touch
      els.canvas.addEventListener('pointerdown', onPointerDown);
      els.canvas.addEventListener('pointermove', onPointerMove);
      els.canvas.addEventListener('pointerup', onPointerUp);
      els.canvas.addEventListener('pointercancel', onPointerUp);
      els.canvas.addEventListener('mouseleave', ()=>{ if(state.hover){ state.hover=null; draw(); } });

      // Wheel zoom (desktop)
      els.canvas.addEventListener('wheel', onWheel, {passive:false});
    }

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
    if(els.btnZoomOut) els.btnZoomOut.addEventListener('click', ()=> setZoom(state.zoom/1.15));
    if(els.btnZoomIn) els.btnZoomIn.addEventListener('click', ()=> setZoom(state.zoom*1.15));
    if(els.btnResetView) els.btnResetView.addEventListener('click', ()=>{
      state.camX = (state.gridW-1)/2;
      state.camY = (state.gridH-1)/2;
      state.zoom = 1;
      clampCamera();
      draw();
    });
    if(els.btnRotateView) els.btnRotateView.addEventListener('click', ()=>{
      state.viewRot = state.viewRot ? 0 : Math.PI/4;
      clampCamera();
      draw();
    });

    // Hold Shift while placing to temporarily straighten the view
    window.addEventListener('keydown', (e)=>{
      if(e.key==='Shift' && state.mode==='place'){
        state._savedViewRot = state.viewRot;
        state.viewRot = 0;
        draw();
      }
    });
    window.addEventListener('keyup', (e)=>{
      if(e.key==='Shift' && state.mode==='place' && state._savedViewRot !== undefined){
        state.viewRot = state._savedViewRot;
        state._savedViewRot = undefined;
        draw();
      }
    });


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
