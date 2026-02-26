// public/planner/assets/map.js
// WoS Planner – V1.0 step 1 UI logic
// Assumes API endpoints:
//   GET    /api/maps/{slug}/objects?layer=system|object|all
//   GET    /api/maps/{slug}/tile?x=..&y=..&layer=system|object|all
//   POST   /api/objects/{id}/update
//   POST   /api/objects/{id}/move
//   DELETE /api/objects/{id}
// NOTE: create endpoint is project-specific; placeholder is kept.

const API = {
  mapObjects: (slug, layer='all') => `/api/maps/${encodeURIComponent(slug)}/objects?layer=${encodeURIComponent(layer)}`,
  tile: (slug, x, y, layer='all') => `/api/maps/${encodeURIComponent(slug)}/tile?x=${x}&y=${y}&layer=${encodeURIComponent(layer)}`,
  update: (id) => `/api/objects/${id}/update`,
  move: (id) => `/api/objects/${id}/move`,
  del: (id) => `/api/objects/${id}`,
};

const els = {
  canvas: document.getElementById('mapCanvas'),
  modeLabel: document.getElementById('modeLabel'),
  mapSlugLabel: document.getElementById('mapSlugLabel'),
  toggleSystem: document.getElementById('toggleSystem'),
  toggleLabels: document.getElementById('toggleLabels'),
  toggleFootprints: document.getElementById('toggleFootprints'),

  toolPlace: document.getElementById('toolPlace'),
  toolSelect: document.getElementById('toolSelect'),
  toolMove: document.getElementById('toolMove'),
  toolDelete: document.getElementById('toolDelete'),

  emptyProps: document.getElementById('emptyProps'),
  props: document.getElementById('props'),
  moveHint: document.getElementById('moveHint'),

  p_id: document.getElementById('p_id'),
  p_type: document.getElementById('p_type'),
  p_xy: document.getElementById('p_xy'),
  p_layer: document.getElementById('p_layer'),
  p_locked: document.getElementById('p_locked'),

  f_tag: document.getElementById('f_tag'),
  f_note: document.getElementById('f_note'),
  f_color: document.getElementById('f_color'),

  btnSave: document.getElementById('btnSave'),
  btnMove: document.getElementById('btnMove'),
  btnDelete: document.getElementById('btnDelete'),
};

const state = {
  slug: window.MAP_SLUG || 'default',
  mode: 'select', // select | place | move
  showSystem: true,
  showLabels: true,
  showFootprints: false,
  objects: [],
  selected: null,
  tileSize: 30,
  gridW: 30,
  gridH: 30,
};

els.mapSlugLabel.textContent = state.slug;

function setMode(mode){
  state.mode = mode;
  els.modeLabel.textContent = mode;
  const hasSel = !!state.selected;
  const locked = hasSel ? (Number(state.selected.is_locked) === 1) : false;

  // Tool buttons
  els.toolMove.disabled = !hasSel || locked;
  els.toolDelete.disabled = !hasSel || locked;

  // Panel buttons
  els.btnMove.disabled = !hasSel || locked;
  els.btnDelete.disabled = !hasSel || locked;

  els.moveHint.classList.toggle('hidden', mode !== 'move');
}

function showProps(obj){
  state.selected = obj;
  if(!obj){
    els.emptyProps.style.display = '';
    els.props.classList.add('hidden');
    setMode('select');
    return;
  }
  els.emptyProps.style.display = 'none';
  els.props.classList.remove('hidden');

  els.p_id.textContent = obj.id;
  els.p_type.textContent = obj.type || '—';
  els.p_xy.textContent = `${obj.x},${obj.y}`;
  els.p_layer.textContent = obj.layer || 'object';
  els.p_locked.textContent = Number(obj.is_locked) === 1 ? 'yes' : 'no';

  const meta = safeJson(obj.meta_json) || {};
  els.f_tag.value = meta.tag ?? '';
  els.f_note.value = meta.note ?? '';
  els.f_color.value = meta.color ?? '';

  setMode(state.mode); // refresh disabled states
}

function safeJson(s){
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

async function apiJson(url, opts={}){
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok){
    const msg = data.error || data.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function loadObjects(){
  const layer = state.showSystem ? 'all' : 'object';
  const data = await apiJson(API.mapObjects(state.slug, layer));
  state.objects = data.objects || [];
  // If selected disappeared, clear it
  if(state.selected){
    const still = state.objects.find(o => Number(o.id) === Number(state.selected.id));
    if(!still) showProps(null);
    else showProps(still);
  }
  draw();
}

function draw(){
  const ctx = els.canvas.getContext('2d');
  const {tileSize, gridW, gridH} = state;
  ctx.clearRect(0,0,els.canvas.width, els.canvas.height);

  // grid
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 1;
  for(let x=0; x<=gridW; x++){
    ctx.beginPath();
    ctx.moveTo(x*tileSize, 0);
    ctx.lineTo(x*tileSize, gridH*tileSize);
    ctx.stroke();
  }
  for(let y=0; y<=gridH; y++){
    ctx.beginPath();
    ctx.moveTo(0, y*tileSize);
    ctx.lineTo(gridW*tileSize, y*tileSize);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // objects
  const systemFirst = [...state.objects].sort((a,b) => {
    const la = (a.layer||'object') === 'system' ? 0 : 1;
    const lb = (b.layer||'object') === 'system' ? 0 : 1;
    return la-lb || (a.id-b.id);
  });

  for(const obj of systemFirst){
    if(!state.showSystem && obj.layer === 'system') continue;

    const meta = safeJson(obj.meta_json) || {};
    const fill = meta.color || (obj.layer === 'system' ? 'rgba(90,242,196,.35)' : 'rgba(255,255,255,.25)');
    ctx.fillStyle = fill;

    // footprint (optional)
    const fp = Array.isArray(meta.footprint) ? meta.footprint : [{dx:0,dy:0}];
    for(const t of fp){
      const x = (Number(obj.x) + Number(t.dx||0)) * tileSize;
      const y = (Number(obj.y) + Number(t.dy||0)) * tileSize;
      ctx.fillRect(x+1, y+1, tileSize-2, tileSize-2);

      if(state.showFootprints){
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.strokeRect(x+1, y+1, tileSize-2, tileSize-2);
      }
    }

    // selected outline
    if(state.selected && Number(state.selected.id) === Number(obj.id)){
      ctx.strokeStyle = 'rgba(255,92,122,.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(Number(obj.x)*tileSize+1, Number(obj.y)*tileSize+1, tileSize-2, tileSize-2);
      ctx.lineWidth = 1;
    }

    // label
    if(state.showLabels){
      const label = meta.tag || obj.type || `#${obj.id}`;
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(label, Number(obj.x)*tileSize + 4, Number(obj.y)*tileSize + 14);
    }
  }
}

function tileFromEvent(ev){
  const rect = els.canvas.getBoundingClientRect();
  const x = Math.floor((ev.clientX - rect.left) / state.tileSize);
  const y = Math.floor((ev.clientY - rect.top) / state.tileSize);
  return {x,y};
}

async function onCanvasClick(ev){
  const {x,y} = tileFromEvent(ev);

  // bounds
  if(x<0 || y<0 || x>=state.gridW || y>=state.gridH) return;

  if(state.mode === 'move' && state.selected){
    // move selected
    try{
      await apiJson(API.move(state.selected.id), {method:'POST', body: JSON.stringify({x,y})});
      await loadObjects();
      setMode('select');
    }catch(e){
      alert(`Move failed: ${e.message}`);
      setMode('select');
      await loadObjects();
    }
    return;
  }

  // select existing (system/object based on toggle)
  try{
    const layer = state.showSystem ? 'all' : 'object';
    const data = await apiJson(API.tile(state.slug, x, y, layer));
    if(data.object){
      showProps(data.object);
      setMode('select');
      return;
    }
  }catch(e){
    console.warn(e);
  }

  // empty tile -> place object (project-specific)
  if(state.mode === 'place'){
    await createObjectAt(x,y);
    await loadObjects();
  } else {
    showProps(null);
  }
}

async function createObjectAt(x,y){
  // Placeholder.
  // Replace with your existing create endpoint call.
  alert(`No create endpoint wired here yet. Clicked empty tile ${x},${y}`);
}

async function saveMeta(){
  if(!state.selected) return;
  try{
    const body = {
      tag: els.f_tag.value.trim(),
      note: els.f_note.value.trim(),
      color: els.f_color.value.trim(),
    };
    await apiJson(API.update(state.selected.id), {method:'POST', body: JSON.stringify(body)});
    await loadObjects();
  }catch(e){
    alert(`Save failed: ${e.message}`);
  }
}

async function deleteSelected(){
  if(!state.selected) return;
  if(!confirm('Delete object?')) return;
  try{
    await apiJson(API.del(state.selected.id), {method:'DELETE'});
    showProps(null);
    await loadObjects();
  }catch(e){
    alert(`Delete failed: ${e.message}`);
  }
}

// Wire UI
els.canvas.addEventListener('click', onCanvasClick);

els.toggleSystem.addEventListener('change', async () => {
  state.showSystem = !!els.toggleSystem.checked;
  await loadObjects();
});
els.toggleLabels.addEventListener('change', () => {
  state.showLabels = !!els.toggleLabels.checked;
  draw();
});
els.toggleFootprints.addEventListener('change', () => {
  state.showFootprints = !!els.toggleFootprints.checked;
  draw();
});

els.toolPlace.addEventListener('click', ()=> setMode('place'));
els.toolSelect.addEventListener('click', ()=> setMode('select'));
els.toolMove.addEventListener('click', ()=> { if(state.selected) setMode('move'); });
els.toolDelete.addEventListener('click', deleteSelected);

els.btnSave.addEventListener('click', saveMeta);
els.btnMove.addEventListener('click', ()=> { if(state.selected) setMode('move'); });
els.btnDelete.addEventListener('click', deleteSelected);

// Boot
(async function init(){
  setMode('select');
  await loadObjects();
})();
