/* WoS Planner – v1.2 (Camera + pan/zoom/rotate, repo-native)
 * Notes:
 * - Keeps API conventions from v1.1 (delete remains POST /api/objects/{id}/delete; Router has no delete()).
 * - View rotation is VISUAL ONLY. Data stays in world tile coords (origin integers).
 * - Defensive parsing and error surfacing: status becomes "error: …" on init failures.
 *
 * Uses MAP_CFG from /map/{slug} route:
 *   { slug,width,height,basePath }
 */

const cfg = window.MAP_CFG || { slug: '', width: 60, height: 60, basePath: '' };

const API = {
  objects: (layer = 'all') =>
    `${cfg.basePath}/api/maps/${encodeURIComponent(cfg.slug)}/objects?xmin=0&xmax=${cfg.width - 1}&ymin=0&ymax=${cfg.height - 1}&layer=${encodeURIComponent(layer)}`,
  tile: (x, y, layer = 'all') =>
    `${cfg.basePath}/api/maps/${encodeURIComponent(cfg.slug)}/tile?x=${x}&y=${y}&layer=${encodeURIComponent(layer)}`,
  objectTypes: () => `${cfg.basePath}/api/object-types`,
  create: () => `${cfg.basePath}/api/maps/${encodeURIComponent(cfg.slug)}/objects/create`,
  update: (id) => `${cfg.basePath}/api/objects/${id}/update`,
  move: (id) => `${cfg.basePath}/api/objects/${id}/move`,
  del: (id) => `${cfg.basePath}/api/objects/${id}/delete`, // POST
  export: (layer = 'all') =>
    `${cfg.basePath}/api/maps/${encodeURIComponent(cfg.slug)}/export?layer=${encodeURIComponent(layer)}`,
  import: (dryRun = 1) =>
    `${cfg.basePath}/api/maps/${encodeURIComponent(cfg.slug)}/import?dryRun=${dryRun ? 1 : 0}`,
};

async function apiJson(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { raw: text }; }

  if (!res.ok) {
    const msg = data?.error || data?.message || res.statusText || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function safeJson(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
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
  camX: (cfg.width - 1) / 2,
  camY: (cfg.height - 1) / 2,
  viewRot: 0, // 0 or Math.PI/4

  // pointer interaction
  isPanning: false,
  panPointerId: null,
  lastPanX: 0,
  lastPanY: 0,
  _dragMoved: false,
  pointers: new Map(),
  pinchStartDist: 0,
  pinchStartZoom: 1,

  objects: [],
  objectTypes: [],
  selectedTypeCode: 'player_object',
  selected: null,
  hover: null,

  // object footprint rotation during placement (R key)
  rotation: 0,

  showSystem: true,
  showLabels: true,
  showFootprints: false,

  // Shift-straighten helper (place mode only)
  _savedViewRot: undefined,
};

function setStatus(s) { if (els.status) els.status.textContent = s; }
function isMobile() { return window.matchMedia && window.matchMedia('(max-width: 1023px)').matches; }

function openDrawer() {
  if (!els.propDrawer) return;
  els.propDrawer.classList.add('open');
  if (isMobile() && els.drawerBackdrop) els.drawerBackdrop.classList.remove('hidden');
}
function closeDrawer() {
  if (!els.propDrawer) return;
  els.propDrawer.classList.remove('open');
  if (els.drawerBackdrop) els.drawerBackdrop.classList.add('hidden');
}
function toggleDrawer() {
  if (!els.propDrawer) return;
  const open = els.propDrawer.classList.contains('open');
  open ? closeDrawer() : openDrawer();
}

function setCoord(x, y) {
  if (els.coordMid) els.coordMid.textContent = `X: ${x}  Y: ${y}`;
  if (els.coordRight) els.coordRight.textContent = `ZOOM: ${Math.round(state.zoom * 100)}%`;
}

function setMode(m) {
  state.mode = m;
  if (els.toolSelect) els.toolSelect.classList.toggle('primary', m === 'select');
  if (els.toolPlace) els.toolPlace.classList.toggle('primary', m === 'place');
  if (m !== 'place') state.hover = null;
  draw();
}

function typeDefaultMeta(t) {
  return safeJson(t?.default_meta_json) || {};
}

function renderPalette() {
  if (!els.typePalette) return;
  const q = (els.typeSearch?.value || '').trim().toLowerCase();
  const types = (state.objectTypes || []).filter(t => {
    if (!q) return true;
    return (t.name || '').toLowerCase().includes(q) || (t.code || '').toLowerCase().includes(q);
  });

  els.typePalette.innerHTML = '';
  for (const t of types) {
    const btn = document.createElement('button');
    btn.className = 'pbtn' + (t.code === state.selectedTypeCode ? ' active' : '');
    const meta = typeDefaultMeta(t);
    const tag = meta.tag || '';
    btn.innerHTML = `<div>${t.name || t.code}</div><span class="sub">${tag ? tag : t.code}</span>`;
    btn.addEventListener('click', () => {
      state.selectedTypeCode = t.code;
      state.rotation = 0;
      renderPalette();
      draw();
    });
    els.typePalette.appendChild(btn);
  }
}

function getSelectedType() {
  return (state.objectTypes || []).find(t => t.code === state.selectedTypeCode) || null;
}

function rotatedFootprint(fp, rotation) {
  const r = ((rotation % 4) + 4) % 4;
  if (!Array.isArray(fp) || fp.length === 0) return [{ dx: 0, dy: 0 }];
  return fp.map(t => {
    const dx = Number(t.dx || 0), dy = Number(t.dy || 0);
    if (r === 0) return { dx, dy };
    if (r === 1) return { dx: -dy, dy: dx };
    if (r === 2) return { dx: -dx, dy: -dy };
    return { dx: dy, dy: -dx };
  });
}

function getTs() { return state.tileSize * state.zoom * devicePixelRatio; }

function rot2(x, y, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return { x: x * c - y * s, y: x * s + y * c };
}

function fitCanvas() {
  if (!els.canvas) return;
  const rect = els.canvas.parentElement.getBoundingClientRect();
  els.canvas.width = Math.floor(rect.width * devicePixelRatio);
  els.canvas.height = Math.floor(rect.height * devicePixelRatio);
  clampCamera();
  draw();
}

function clampCamera() {
  if (!els.canvas) return;
  const ts = getTs();
  const W = els.canvas.width, H = els.canvas.height;

  const halfW = (W / 2) / ts;
  const halfH = (H / 2) / ts;
  state.camX = Math.max(halfW, Math.min(state.gridW - halfW, state.camX));
  state.camY = Math.max(halfH, Math.min(state.gridH - halfH, state.camY));
}

function setZoom(newZoom, anchorEv = null) {
  const z = Math.max(state.zoomMin, Math.min(state.zoomMax, newZoom));
  if (!anchorEv) {
    state.zoom = z;
    clampCamera();
    draw();
    setCoord(state.hover?.x ?? '-', state.hover?.y ?? '-');
    return;
  }

  const rect = els.canvas.getBoundingClientRect();
  const sx = (anchorEv.clientX - rect.left) * devicePixelRatio;
  const sy = (anchorEv.clientY - rect.top) * devicePixelRatio;
  const W = els.canvas.width, H = els.canvas.height;

  let x = sx - W / 2;
  let y = sy - H / 2;

  const tsOld = getTs();
  const inv = rot2(x, y, -state.viewRot);
  const anchorWorldX = state.camX + (inv.x / tsOld);
  const anchorWorldY = state.camY + (inv.y / tsOld);

  state.zoom = z;
  const tsNew = getTs();

  state.camX = anchorWorldX - (inv.x / tsNew);
  state.camY = anchorWorldY - (inv.y / tsNew);

  clampCamera();
  draw();
}

function screenToWorldPx(ev) {
  const rect = els.canvas.getBoundingClientRect();
  const sx = (ev.clientX - rect.left) * devicePixelRatio;
  const sy = (ev.clientY - rect.top) * devicePixelRatio;

  const W = els.canvas.width, H = els.canvas.height;
  const ts = getTs();

  let x = sx - W / 2;
  let y = sy - H / 2;

  const r = rot2(x, y, -state.viewRot);
  x = r.x; y = r.y;

  return { x: x + state.camX * ts, y: y + state.camY * ts, ts };
}

function tileFromEvent(ev) {
  const w = screenToWorldPx(ev);
  return { x: Math.floor(w.x / w.ts), y: Math.floor(w.y / w.ts) };
}

// Load object types (defensive) – MUST be top-level (not inside init)
async function loadObjectTypes() {
  try {
    const data = await apiJson(API.objectTypes());
    const types = data.object_types || data.types || data.objectTypes || [];
    state.objectTypes = Array.isArray(types) ? types : [];

    if (state.objectTypes.length && !state.objectTypes.find(t => t.code === state.selectedTypeCode)) {
      state.selectedTypeCode = state.objectTypes[0].code;
    }

    renderPalette();
    return state.objectTypes;
  } catch (e) {
    console.error('loadObjectTypes failed:', e);
    state.objectTypes = [];
    renderPalette();
    return [];
  }
}

async function loadObjects() {
  setStatus('loading objects…');
  const layer = state.showSystem ? 'all' : 'object';

  try {
    const data = await apiJson(API.objects(layer));
    state.objects = Array.isArray(data?.objects) ? data.objects : [];
  } catch (e) {
    console.error('loadObjects failed:', e);
    state.objects = [];
  }

  draw();
}

function draw() {
  if (!els.canvas) return;
  const ctx = els.canvas.getContext('2d');
  const W = els.canvas.width, H = els.canvas.height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const ts = getTs();

  ctx.translate(W / 2, H / 2);
  ctx.rotate(state.viewRot);
  ctx.translate(-state.camX * ts, -state.camY * ts);

  function cornerWorldTile(px, py) {
    let x = px - W / 2;
    let y = py - H / 2;
    const r = rot2(x, y, -state.viewRot);
    x = r.x + state.camX * ts;
    y = r.y + state.camY * ts;
    return { tx: x / ts, ty: y / ts };
  }

  const c1 = cornerWorldTile(0, 0);
  const c2 = cornerWorldTile(W, 0);
  const c3 = cornerWorldTile(0, H);
  const c4 = cornerWorldTile(W, H);
  const xs = [c1.tx, c2.tx, c3.tx, c4.tx];
  const ys = [c1.ty, c2.ty, c3.ty, c4.ty];

  let xmin = Math.floor(Math.min(...xs)) - 2;
  let xmax = Math.ceil(Math.max(...xs)) + 2;
  let ymin = Math.floor(Math.min(...ys)) - 2;
  let ymax = Math.ceil(Math.max(...ys)) + 2;

  xmin = Math.max(0, xmin);
  ymin = Math.max(0, ymin);
  xmax = Math.min(state.gridW - 1, xmax);
  ymax = Math.min(state.gridH - 1, ymax);

  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  ctx.lineWidth = 1;

  for (let x = xmin; x <= xmax + 1; x++) {
    ctx.beginPath();
    ctx.moveTo(x * ts, ymin * ts);
    ctx.lineTo(x * ts, (ymax + 1) * ts);
    ctx.stroke();
  }
  for (let y = ymin; y <= ymax + 1; y++) {
    ctx.beginPath();
    ctx.moveTo(xmin * ts, y * ts);
    ctx.lineTo((xmax + 1) * ts, y * ts);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const objs = Array.isArray(state.objects) ? state.objects : [];
  for (const o of objs) {
    if (!state.showSystem && o.layer === 'system') continue;

    const w = Math.max(1, Number(o.w || 1));
    const h = Math.max(1, Number(o.h || 1));
    if (o.x + w < xmin || o.x > xmax || o.y + h < ymin || o.y > ymax) continue;

    ctx.fillStyle = o.color || (o.layer === 'system' ? 'rgba(94,242,196,.55)' : 'rgba(122,162,255,.45)');
    ctx.fillRect(o.x * ts, o.y * ts, w * ts, h * ts);

    if (state.showFootprints) {
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x * ts, o.y * ts, w * ts, h * ts);
    }

    if (state.showLabels) {
      const label = o.tag || o.type || '';
      if (label) {
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.font = `${12 * devicePixelRatio}px system-ui`;
        ctx.fillText(label, o.x * ts + 4, o.y * ts + 14 * devicePixelRatio);
      }
    }
  }
}

function fillProperties(o) {
  state.selected = o;

  if (!o) {
    if (els.propId) els.propId.textContent = '-';
    if (els.propType) els.propType.textContent = '-';
    if (els.propPos) els.propPos.textContent = '-';
    if (els.propLayer) els.propLayer.textContent = '-';
    if (els.propLocked) els.propLocked.textContent = '-';
    if (els.inpTag) els.inpTag.value = '';
    if (els.inpNote) els.inpNote.value = '';
    if (els.inpColor) els.inpColor.value = '';
    if (els.btnSave) els.btnSave.disabled = true;
    if (els.btnMove) els.btnMove.disabled = true;
    if (els.btnDelete) els.btnDelete.disabled = true;
    draw();
    return;
  }

  openDrawer();

  const meta = safeJson(o.meta_json) || {};
  if (els.propId) els.propId.textContent = o.id;
  if (els.propType) els.propType.textContent = o.type;
  if (els.propPos) els.propPos.textContent = `${o.x},${o.y}`;
  if (els.propLayer) els.propLayer.textContent = o.layer || 'object';
  if (els.propLocked) els.propLocked.textContent = (Number(o.is_locked || 0) === 1) ? 'yes' : 'no';

  if (els.inpTag) els.inpTag.value = meta.tag || '';
  if (els.inpNote) els.inpNote.value = meta.note || '';
  if (els.inpColor) els.inpColor.value = (meta.color && meta.color.startsWith('#')) ? meta.color : '#7aa2ff';

  const locked = Number(o.is_locked || 0) === 1;
  if (els.btnSave) els.btnSave.disabled = locked;
  if (els.btnMove) els.btnMove.disabled = locked;
  if (els.btnDelete) els.btnDelete.disabled = locked;

  draw();
}

async function onCanvasClick(ev) {
  const { x, y } = tileFromEvent(ev);
  try {
    const data = await apiJson(API.tile(x, y, state.showSystem ? 'all' : 'object'));
    fillProperties(data.object);
  } catch (e) {
    console.warn(e);
  }
}

function onCanvasMove(ev) {
  const { x, y } = tileFromEvent(ev);
  if (x >= 0 && y >= 0 && x < state.gridW && y < state.gridH) setCoord(x, y);
}

async function exportJson() {
  const layer = state.showSystem ? 'all' : 'object';
  const data = await apiJson(API.export(layer));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${cfg.slug}-${layer}-export.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

function openImport() {
  if (!els.modalImport) return;
  els.modalImport.classList.remove('hidden');
  if (els.importReport) els.importReport.textContent = '';
  if (els.btnApply) els.btnApply.disabled = true;
}
function closeImport() { if (els.modalImport) els.modalImport.classList.add('hidden'); }

function onWheel(ev) {
  ev.preventDefault();
  const delta = ev.deltaY;
  const factor = delta > 0 ? 0.9 : 1.1;
  setZoom(state.zoom * factor, ev);
}

function onPointerDown(ev) {
  if (!els.canvas) return;
  els.canvas.setPointerCapture?.(ev.pointerId);
  state.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

  if (state.pointers.size === 2) {
    const pts = Array.from(state.pointers.values());
    const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    state.pinchStartDist = Math.hypot(dx, dy);
    state.pinchStartZoom = state.zoom;
    return;
  }

  state.isPanning = true;
  state.panPointerId = ev.pointerId;
  state.lastPanX = ev.clientX;
  state.lastPanY = ev.clientY;
  state._dragMoved = false;
}

function onPointerMove(ev) {
  if (state.pointers.has(ev.pointerId)) {
    state.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  }

  if (state.pointers.size === 2) {
    const pts = Array.from(state.pointers.values());
    const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    const dist = Math.hypot(dx, dy) || 1;
    const ratio = dist / (state.pinchStartDist || dist);
    const newZoom = state.pinchStartZoom * ratio;
    const mid = { clientX: (pts[0].x + pts[1].x) / 2, clientY: (pts[0].y + pts[1].y) / 2 };
    setZoom(newZoom, mid);
    return;
  }

  if (state.isPanning && state.panPointerId === ev.pointerId) {
    const dx = ev.clientX - state.lastPanX;
    const dy = ev.clientY - state.lastPanY;
    if (Math.abs(dx) + Math.abs(dy) > 2) state._dragMoved = true;

    state.lastPanX = ev.clientX;
    state.lastPanY = ev.clientY;

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

  onCanvasMove(ev);
}

function onPointerUp(ev) {
  state.pointers.delete(ev.pointerId);
  if (state.pointers.size < 2) state.pinchStartDist = 0;

  if (state.isPanning && state.panPointerId === ev.pointerId) {
    state.isPanning = false;
    state.panPointerId = null;

    if (!state._dragMoved) onCanvasClick(ev);
  }
}

// Boot (init)
(async function init() {
  try {
    setStatus('loading…');

    state.showSystem = !!(els.toggleSystem && els.toggleSystem.checked);
    state.showLabels = !!(els.toggleLabels && els.toggleLabels.checked);
    state.showFootprints = !!(els.toggleFootprints && els.toggleFootprints.checked);

    await loadObjectTypes();
    await loadObjects();

    setCoord('-', '-');
    setMode('select');

    if (els.canvas) {
      els.canvas.addEventListener('pointerdown', onPointerDown);
      els.canvas.addEventListener('pointermove', onPointerMove);
      els.canvas.addEventListener('pointerup', onPointerUp);
      els.canvas.addEventListener('pointercancel', onPointerUp);
      els.canvas.addEventListener('mouseleave', () => { draw(); });
      els.canvas.addEventListener('wheel', onWheel, { passive: false });
    }

    window.addEventListener('resize', fitCanvas);
    fitCanvas();

    if (els.btnDrawerToggle) els.btnDrawerToggle.addEventListener('click', toggleDrawer);
    if (els.btnDrawerClose) els.btnDrawerClose.addEventListener('click', closeDrawer);
    if (els.drawerBackdrop) els.drawerBackdrop.addEventListener('click', closeDrawer);

    if (els.typeSearch) els.typeSearch.addEventListener('input', renderPalette);

    if (els.btnExport) els.btnExport.addEventListener('click', async () => {
      try { await exportJson(); } catch (e) { alert('Export failed: ' + e.message); }
    });

    if (els.btnZoomOut) els.btnZoomOut.addEventListener('click', () => setZoom(state.zoom / 1.15));
    if (els.btnZoomIn) els.btnZoomIn.addEventListener('click', () => setZoom(state.zoom * 1.15));
    if (els.btnResetView) els.btnResetView.addEventListener('click', () => {
      state.camX = (state.gridW - 1) / 2;
      state.camY = (state.gridH - 1) / 2;
      state.zoom = 1;
      clampCamera();
      draw();
    });
    if (els.btnRotateView) els.btnRotateView.addEventListener('click', () => {
      state.viewRot = state.viewRot ? 0 : Math.PI / 4;
      clampCamera();
      draw();
    });

    setStatus('ready');
  } catch (e) {
    console.error(e);
    setStatus('error: ' + e.message);
  }
})();
