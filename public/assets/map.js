(() => {
  // ============================================================
  // WoS Planner – Map MVP (Isometric Render)
  // File: public/assets/map.js
  // Notes:
  //  - Data coords remain square grid (x,y) with origin bottom-left.
  //  - Rendering uses an isometric (diamond) projection.
  //  - Basic depth sorting by (x + yTop).
  // ============================================================

  const gridW = window.MAP_CFG.width;
  const gridH = window.MAP_CFG.height;
  const slug  = window.MAP_CFG.slug;
  const base  = window.MAP_CFG.basePath || "";

  const canvas = document.getElementById("mapCanvas");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");

  const typeEl  = document.getElementById("objType");
  const noteEl  = document.getElementById("note");
  const tagEl   = document.getElementById("tag");
  const colorEl = document.getElementById("color");

  // ------------------------------------------------------------
  // CAMERA
  // ------------------------------------------------------------
  // tileWidth in px controls zoom. tileHeight is half for diamond.
  let tw = 48;
  let th = 24;

  // pan offsets in px (screen space)
  let originX = 240;
  let originY = 120;

  // state
  let objects = [];
  let lastFetchKey = "";

  // ------------------------------------------------------------
  // COORDINATE HELPERS
  // ------------------------------------------------------------
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function yToTop(y) { return (gridH - 1) - y; }
  function topToY(yTop) { return (gridH - 1) - yTop; }

  // Grid (x, yBottomLeft) -> Screen (sx, syTopPoint)
  function gridToScreen(x, y) {
    const yTop = yToTop(y);
    return {
      sx: originX + (x - yTop) * (tw / 2),
      sy: originY + (x + yTop) * (th / 2),
      yTop
    };
  }

  // Screen (sx, sy) -> Grid tile (x, yBottomLeft)
  // Uses inverse of diamond projection. Works well for MVP.
  function screenToGrid(sx, sy) {
    const dx = sx - originX;
    const dy = sy - originY;

    const a = dx / (tw / 2);
    const b = dy / (th / 2);

    const xf = (a + b) / 2;
    const yTopf = (b - a) / 2;

    const x = Math.floor(xf);
    const yTop = Math.floor(yTopf);
    const y = topToY(yTop);

    return { x, y, yTop };
  }

  // Approximate bbox for API fetch using the 4 corners of the screen.
  function viewportBBox() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    const corners = [
      screenToGrid(0, 0),
      screenToGrid(w, 0),
      screenToGrid(0, h),
      screenToGrid(w, h),
    ];

    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;

    for (const c of corners) {
      xmin = Math.min(xmin, c.x);
      xmax = Math.max(xmax, c.x);
      ymin = Math.min(ymin, c.y);
      ymax = Math.max(ymax, c.y);
    }

    // pad a bit so we don't pop-in while panning
    xmin -= 6; xmax += 6; ymin -= 6; ymax += 6;

    xmin = clamp(xmin, 0, gridW - 1);
    xmax = clamp(xmax, 0, gridW - 1);
    ymin = clamp(ymin, 0, gridH - 1);
    ymax = clamp(ymax, 0, gridH - 1);

    if (xmax < xmin) [xmin, xmax] = [xmax, xmin];
    if (ymax < ymin) [ymin, ymax] = [ymax, ymin];

    return { xmin, xmax, ymin, ymax };
  }

  // ------------------------------------------------------------
  // OBJECT HELPERS
  // ------------------------------------------------------------
  function footprint(type) {
    // anchor is bottom-left
    switch (type) {
      case "CITY": return { w: 2, h: 2 };
      default:     return { w: 1, h: 1 };
    }
  }

  function heightPx(type) {
    switch (type) {
      case "HQ":    return Math.round(th * 2.4);
      case "CITY":  return Math.round(th * 1.8);
      case "TRAP":  return Math.round(th * 1.4);
      case "BANNER":return Math.round(th * 1.1);
      default:      return Math.round(th * 1.0);
    }
  }

  function parseMeta(o) {
    try {
      if (!o.meta_json) return {};
      return typeof o.meta_json === "string" ? JSON.parse(o.meta_json) : (o.meta_json || {});
    } catch {
      return {};
    }
  }

  function colorFor(o) {
    const m = parseMeta(o);
    return m.color || "#7aa2ff";
  }

  function labelFor(o) {
    const m = parseMeta(o);
    const tag = (m.tag || "").trim();
    return tag ? `${o.type} ${tag}` : o.type;
  }

  // ------------------------------------------------------------
  // DRAW
  // ------------------------------------------------------------
  function resize() {
    canvas.width  = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    draw();
  }

  function drawDiamondTop(sx, sy, fillStyle, alpha = 0.85) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + tw/2, sy + th/2);
    ctx.lineTo(sx, sy + th);
    ctx.lineTo(sx - tw/2, sy + th/2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  function drawPrism(sx, sy, fillStyle, hPx) {
    // Draw a simple "height" effect: top diamond + two side faces.
    const topY = sy - hPx;

    ctx.globalAlpha = 0.65;
    ctx.fillStyle = fillStyle;

    // left face
    ctx.beginPath();
    ctx.moveTo(sx - tw/2, topY + th/2);
    ctx.lineTo(sx,        topY + th);
    ctx.lineTo(sx,        sy + th);
    ctx.lineTo(sx - tw/2, sy + th/2);
    ctx.closePath();
    ctx.fill();

    // right face
    ctx.beginPath();
    ctx.moveTo(sx + tw/2, topY + th/2);
    ctx.lineTo(sx,        topY + th);
    ctx.lineTo(sx,        sy + th);
    ctx.lineTo(sx + tw/2, sy + th/2);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1.0;

    drawDiamondTop(sx, topY, fillStyle, 0.9);
  }

  function drawBackground() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, w, h);
  }

  function drawHoverTile(tile) {
    if (!tile) return;
    const { x, y } = tile;
    if (x < 0 || y < 0 || x >= gridW || y >= gridH) return;
    const p = gridToScreen(x, y);
    drawDiamondTop(p.sx, p.sy, "rgba(255,255,255,0.10)", 1.0);
  }

  function drawObjects() {
    const sorted = [...objects].sort((a, b) => {
      const ayTop = yToTop(a.y);
      const byTop = yToTop(b.y);
      const ka = (a.x + ayTop);
      const kb = (b.x + byTop);
      if (ka !== kb) return ka - kb;
      return a.x - b.x;
    });

    for (const o of sorted) {
      const fp = footprint(o.type);
      const fill = colorFor(o);
      const hPx = heightPx(o.type);

      for (let dx = 0; dx < fp.w; dx++) {
        for (let dy = 0; dy < fp.h; dy++) {
          const tx = o.x + dx;
          const ty = o.y + dy;
          const p = gridToScreen(tx, ty);

          if (dx === 0 && dy === 0) {
            drawPrism(p.sx, p.sy, fill, hPx);
          } else {
            drawDiamondTop(p.sx, p.sy, fill, 0.35);
          }
        }
      }

      if (tw >= 44) {
        const p = gridToScreen(o.x, o.y);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(p.sx - 70, p.sy - hPx - 18, 140, 18);
        ctx.fillStyle = "#e6edf3";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.fillText(labelFor(o), p.sx, p.sy - hPx - 5);
        ctx.textAlign = "start";
      }
    }
  }

  let hoverTile = null;

  function draw() {
    drawBackground();
    drawObjects();
    drawHoverTile(hoverTile);
  }

  // ------------------------------------------------------------
  // API
  // ------------------------------------------------------------
  async function apiGetObjects(bbox) {
    const key = `${bbox.xmin},${bbox.xmax},${bbox.ymin},${bbox.ymax}|${tw}|${originX}|${originY}`;
    if (key === lastFetchKey) return;
    lastFetchKey = key;

    const url = `${base}/api/maps/${encodeURIComponent(slug)}/objects?xmin=${bbox.xmin}&xmax=${bbox.xmax}&ymin=${bbox.ymin}&ymax=${bbox.ymax}`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      objects = data.objects || [];

      statusEl.textContent = `Objects: ${objects.length} | View: x${bbox.xmin}-${bbox.xmax} y${bbox.ymin}-${bbox.ymax} | tw=${tw}`;
      draw();
    } catch (e) {
      statusEl.textContent = `API error: ${e?.message || e}`;
    }
  }

  async function apiPlaceObject(x, y) {
    const type = typeEl.value;
    const meta = {
      note: (noteEl.value || "").trim(),
      tag: (tagEl.value || "").trim(),
      color: (colorEl.value || "#7aa2ff")
    };

    try {
      const res = await fetch(`${base}/api/maps/${encodeURIComponent(slug)}/place`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, x, y, meta })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Place failed");
        return;
      }

      await apiGetObjects(viewportBBox());
    } catch (e) {
      alert(`API error: ${e?.message || e}`);
    }
  }

  // ------------------------------------------------------------
  // INPUT (PAN/ZOOM/CLICK)
  // ------------------------------------------------------------
  let dragging = false;
  let didDrag = false;
  let dragStart = { x: 0, y: 0, ox: 0, oy: 0 };

  canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    didDrag = false;
    dragStart = { x: e.clientX, y: e.clientY, ox: originX, oy: originY };
  });

  window.addEventListener("mouseup", () => { dragging = false; });

  window.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    hoverTile = screenToGrid(sx, sy);

    if (!dragging) {
      draw();
      return;
    }

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag = true;

    originX = dragStart.ox + dx;
    originY = dragStart.oy + dy;

    draw();
    apiGetObjects(viewportBBox());
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();

    const delta = e.deltaY > 0 ? -4 : 4;

    tw = clamp(tw + delta, 20, 120);
    th = Math.round(tw / 2);

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const before = screenToGrid(mx, my);
    const afterPos = gridToScreen(before.x, before.y);

    originX += (mx - afterPos.sx);
    originY += (my - afterPos.sy);

    draw();
    apiGetObjects(viewportBBox());
  }, { passive: false });

  canvas.addEventListener("click", async (e) => {
    if (didDrag) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const { x, y } = screenToGrid(sx, sy);

    if (x < 0 || y < 0 || x >= gridW || y >= gridH) return;

    const ok = confirm(`Place ${typeEl.value} at (${x},${y}) ?`);
    if (!ok) return;

    await apiPlaceObject(x, y);
  });

  // ------------------------------------------------------------
  // INIT
  // ------------------------------------------------------------
  window.addEventListener("resize", resize);
  resize();
  apiGetObjects(viewportBBox());
})();
