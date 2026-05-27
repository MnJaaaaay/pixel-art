(() => {
  "use strict";

  const DEFAULT_PALETTE = [
    { id: "p1", color: "#66bb6a", char: "🌳", name: "树" },
    { id: "p2", color: "#9e9e9e", char: "🛣️", name: "路" },
    { id: "p3", color: "#ec407a", char: "🌸", name: "花" },
    { id: "p4", color: "#9ccc65", char: "🌿", name: "草" },
    { id: "p5", color: "#757575", char: "🪨", name: "石" },
  ];

  const MAX_HISTORY = 50;
  const PALETTE_KEY = "pixel-art:palette:v2";
  const CANVAS_MARGIN = 24;
  const ZOOM_MIN = 0.1, ZOOM_MAX = 3.0, ZOOM_STEP = 0.1;

  let nextCanvasNum = 1;
  function makeCanvasId() {
    return `c${nextCanvasNum++}_${Date.now().toString(36)}${Math.floor(Math.random()*1000)}`;
  }
  function newCanvas(cols, x, y) {
    return { id: makeCanvasId(), x, y, cols, rows: cols, cellPx: 20, cells: {} };
  }

  const state = {
    canvases: [newCanvas(32, 20, 20)],
    activeCanvasId: null,
    palette: loadPalette(),
    currentBlockId: null,
    tool: "draw",
    history: [],
    future: [],
    drag: null,
  };
  state.activeCanvasId = state.canvases[0].id;
  if (state.palette.length) state.currentBlockId = state.palette[0].id;

  // ===== DOM =====
  const workspace = document.getElementById("workspace");
  const canvasOuter = document.getElementById("canvas-outer");
  const canvasArea = document.getElementById("canvas-area");
  const zoomDisplay = document.getElementById("zoom-display");
  const paletteEl = document.getElementById("palette");
  const blockForm = document.getElementById("block-form");
  const blockColor = document.getElementById("block-color");
  const blockChar = document.getElementById("block-char");
  const blockName = document.getElementById("block-name");
  const btnAddBlock = document.getElementById("btn-add-block");
  const btnFormCancel = document.getElementById("block-form-cancel");
  const countUsedEl = document.getElementById("count-used");
  const countCanvasesEl = document.getElementById("count-canvases");
  const sizeSelect = document.getElementById("size-select");
  const fileInput = document.getElementById("file-input");

  const canvasNodes = new Map();
  let zoom = 1.0;
  let spaceDown = false;
  let panning = null;

  // ===== 持久化 =====
  function loadPalette() {
    try {
      const raw = localStorage.getItem(PALETTE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (e) { /* fall through */ }
    return DEFAULT_PALETTE.map(p => ({ ...p }));
  }
  function savePalette() {
    try {
      localStorage.setItem(PALETTE_KEY, JSON.stringify(state.palette));
    } catch (e) { /* quota; ignore */ }
  }

  // ===== 颜色对比 =====
  function contrastTextColor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return "#222";
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? "#222" : "#fff";
  }

  // ===== 多画布同步 =====
  function syncCanvasNodes() {
    const stateIds = new Set(state.canvases.map(c => c.id));
    for (const [id, node] of canvasNodes) {
      if (!stateIds.has(id)) {
        node.el.remove();
        canvasNodes.delete(id);
      }
    }
    for (const c of state.canvases) {
      let node = canvasNodes.get(c.id);
      if (!node) {
        const el = document.createElement("canvas");
        el.className = "canvas-tile";
        el.dataset.canvasId = c.id;
        canvasArea.appendChild(el);
        node = { el, ctx: el.getContext("2d"), cachedW: -1, cachedH: -1 };
        canvasNodes.set(c.id, node);
      }
      const cssW = c.cols * c.cellPx;
      const cssH = c.rows * c.cellPx;
      if (node.cachedW !== cssW || node.cachedH !== cssH) {
        const dpr = window.devicePixelRatio || 1;
        node.el.style.width = cssW + "px";
        node.el.style.height = cssH + "px";
        node.el.width = Math.round(cssW * dpr);
        node.el.height = Math.round(cssH * dpr);
        node.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        node.cachedW = cssW;
        node.cachedH = cssH;
      }
      node.el.style.left = c.x + "px";
      node.el.style.top = c.y + "px";
      node.el.classList.toggle("active", c.id === state.activeCanvasId);
    }
    let maxX = 200, maxY = 200;
    for (const c of state.canvases) {
      maxX = Math.max(maxX, c.x + c.cols * c.cellPx);
      maxY = Math.max(maxY, c.y + c.rows * c.cellPx);
    }
    const innerW = maxX + 40, innerH = maxY + 40;
    canvasArea.style.width = innerW + "px";
    canvasArea.style.height = innerH + "px";
    canvasArea.style.transform = `scale(${zoom})`;
    canvasOuter.style.width = (innerW * zoom) + "px";
    canvasOuter.style.height = (innerH * zoom) + "px";
    workspace.dataset.tool = state.tool;
    if (zoomDisplay) zoomDisplay.textContent = Math.round(zoom * 100) + "%";
  }

  function renderCanvasTile(c) {
    const node = canvasNodes.get(c.id);
    if (!node) return;
    const { ctx } = node;
    const { cols, rows, cellPx } = c;
    ctx.clearRect(0, 0, cols * cellPx, rows * cellPx);

    for (const key in c.cells) {
      const sep = key.indexOf(",");
      const x = +key.slice(0, sep), y = +key.slice(sep + 1);
      const { color, char } = c.cells[key];
      ctx.fillStyle = color;
      ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
      if (char) {
        ctx.fillStyle = contrastTextColor(color);
        ctx.font = `${Math.floor(cellPx * 0.68)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(char, x * cellPx + cellPx / 2, y * cellPx + cellPx / 2 + 1);
      }
    }

    ctx.strokeStyle = "#e8e8e8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= cols; i++) {
      const px = i * cellPx + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, rows * cellPx);
    }
    for (let j = 0; j <= rows; j++) {
      const py = j * cellPx + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(cols * cellPx, py);
    }
    ctx.stroke();

    if (state.drag && state.drag.mode === "draw" && state.drag.shift && state.drag.canvasId === c.id) {
      const { sx, sy, cx, cy } = state.drag;
      const x0 = Math.min(sx, cx), y0 = Math.min(sy, cy);
      const x1 = Math.max(sx, cx), y1 = Math.max(sy, cy);
      ctx.save();
      ctx.fillStyle = state.tool === "erase" ? "rgba(255,80,80,0.18)" : "rgba(0,0,0,0.10)";
      ctx.fillRect(x0 * cellPx, y0 * cellPx, (x1 - x0 + 1) * cellPx, (y1 - y0 + 1) * cellPx);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        x0 * cellPx + 0.5,
        y0 * cellPx + 0.5,
        (x1 - x0 + 1) * cellPx - 1,
        (y1 - y0 + 1) * cellPx - 1
      );
      ctx.restore();
    }
  }

  function renderAll() {
    syncCanvasNodes();
    for (const c of state.canvases) renderCanvasTile(c);
    updateCounters();
    renderPalette();
  }

  function updateCounters() {
    let n = 0;
    for (const c of state.canvases) n += Object.keys(c.cells).length;
    countUsedEl.textContent = String(n);
    countCanvasesEl.textContent = String(state.canvases.length);
  }

  // ===== 每素材统计 =====
  function countByBlock() {
    const counts = new Map();
    for (const c of state.canvases) {
      for (const key in c.cells) {
        const { color, char } = c.cells[key];
        const k = `${color}|${char}`;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    return counts;
  }

  // ===== 工具操作 =====
  function applyAt(c, x, y) {
    const key = `${x},${y}`;
    if (state.tool === "erase") {
      delete c.cells[key];
    } else if (state.currentBlockId) {
      const blk = state.palette.find(p => p.id === state.currentBlockId);
      if (!blk) return;
      c.cells[key] = { color: blk.color, char: blk.char };
    }
  }

  function fillRect(c, x0, y0, x1, y1) {
    const lx = Math.min(x0, x1), rx = Math.max(x0, x1);
    const ty = Math.min(y0, y1), by = Math.max(y0, y1);
    for (let y = ty; y <= by; y++) {
      for (let x = lx; x <= rx; x++) applyAt(c, x, y);
    }
  }

  // ===== 历史栈 =====
  function snapshotAll() {
    return { canvases: JSON.parse(JSON.stringify(state.canvases)) };
  }
  function pushHistory(snap) {
    state.history.push(snap);
    if (state.history.length > MAX_HISTORY) state.history.shift();
    state.future.length = 0;
  }
  function restore(snap) {
    state.canvases = JSON.parse(JSON.stringify(snap.canvases));
    if (!state.canvases.find(c => c.id === state.activeCanvasId)) {
      state.activeCanvasId = state.canvases[0]?.id || null;
    }
    renderAll();
  }
  function undo() {
    if (!state.history.length) return;
    state.future.push(snapshotAll());
    restore(state.history.pop());
  }
  function redo() {
    if (!state.future.length) return;
    state.history.push(snapshotAll());
    restore(state.future.pop());
  }

  // ===== 输入 =====
  function getCanvasFromEvent(e) {
    let el = e.target;
    while (el && el !== workspace && !el.classList?.contains("canvas-tile")) {
      el = el.parentElement;
    }
    if (!el || !el.classList?.contains("canvas-tile")) return null;
    const id = el.dataset.canvasId;
    return state.canvases.find(c => c.id === id) || null;
  }

  function eventToCell(e, c) {
    const node = canvasNodes.get(c.id);
    if (!node) return [0, 0];
    const r = node.el.getBoundingClientRect();
    const actualCellPx = r.width / c.cols;
    const x = Math.floor((e.clientX - r.left) / actualCellPx);
    const y = Math.floor((e.clientY - r.top) / actualCellPx);
    return [
      Math.max(0, Math.min(c.cols - 1, x)),
      Math.max(0, Math.min(c.rows - 1, y)),
    ];
  }

  let preDragSnapshot = null;
  let dirty = false;

  workspace.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;

    if (spaceDown) {
      e.preventDefault();
      panning = {
        startX: e.clientX, startY: e.clientY,
        scrollX: workspace.scrollLeft, scrollY: workspace.scrollTop,
      };
      workspace.classList.add("panning-active");
      return;
    }

    const c = getCanvasFromEvent(e);
    if (!c) return;
    e.preventDefault();

    if (state.activeCanvasId !== c.id) {
      state.activeCanvasId = c.id;
      syncCanvasNodes();
    }

    if (state.tool === "move") {
      const node = canvasNodes.get(c.id);
      node.el.classList.add("dragging");
      const r = node.el.getBoundingClientRect();
      state.drag = {
        mode: "move",
        canvasId: c.id,
        offsetX: (e.clientX - r.left) / zoom,
        offsetY: (e.clientY - r.top) / zoom,
      };
      preDragSnapshot = snapshotAll();
      return;
    }

    const [x, y] = eventToCell(e, c);
    preDragSnapshot = snapshotAll();
    dirty = false;
    state.drag = {
      mode: "draw",
      canvasId: c.id,
      sx: x, sy: y, cx: x, cy: y,
      shift: e.shiftKey,
      visited: new Set(),
    };
    if (!e.shiftKey) {
      const before = JSON.stringify(c.cells[`${x},${y}`] || null);
      applyAt(c, x, y);
      state.drag.visited.add(`${x},${y}`);
      if (JSON.stringify(c.cells[`${x},${y}`] || null) !== before) dirty = true;
    }
    renderCanvasTile(c);
  });

  window.addEventListener("mousemove", (e) => {
    if (panning) {
      workspace.scrollLeft = panning.scrollX - (e.clientX - panning.startX);
      workspace.scrollTop = panning.scrollY - (e.clientY - panning.startY);
      return;
    }
    if (!state.drag) return;
    const c = state.canvases.find(cc => cc.id === state.drag.canvasId);
    if (!c) return;

    if (state.drag.mode === "move") {
      const wsRect = workspace.getBoundingClientRect();
      const areaX = (e.clientX - wsRect.left + workspace.scrollLeft) / zoom;
      const areaY = (e.clientY - wsRect.top + workspace.scrollTop) / zoom;
      let nx = areaX - state.drag.offsetX;
      let ny = areaY - state.drag.offsetY;
      nx = Math.max(0, nx);
      ny = Math.max(0, ny);
      c.x = Math.round(nx);
      c.y = Math.round(ny);
      syncCanvasNodes();
      return;
    }

    const [x, y] = eventToCell(e, c);
    state.drag.cx = x;
    state.drag.cy = y;
    if (!state.drag.shift) {
      const key = `${x},${y}`;
      if (!state.drag.visited.has(key)) {
        state.drag.visited.add(key);
        const before = JSON.stringify(c.cells[key] || null);
        applyAt(c, x, y);
        if (JSON.stringify(c.cells[key] || null) !== before) dirty = true;
      }
    }
    renderCanvasTile(c);
  });

  window.addEventListener("mouseup", () => {
    if (panning) {
      panning = null;
      workspace.classList.remove("panning-active");
      return;
    }
    if (!state.drag) return;
    const c = state.canvases.find(cc => cc.id === state.drag.canvasId);
    if (!c) {
      state.drag = null;
      preDragSnapshot = null;
      return;
    }

    if (state.drag.mode === "move") {
      const node = canvasNodes.get(c.id);
      if (node) node.el.classList.remove("dragging");
      const orig = preDragSnapshot && preDragSnapshot.canvases.find(cc => cc.id === c.id);
      if (orig && (orig.x !== c.x || orig.y !== c.y)) {
        pushHistory(preDragSnapshot);
      }
    } else {
      if (state.drag.shift) {
        const before = JSON.stringify(c.cells);
        fillRect(c, state.drag.sx, state.drag.sy, state.drag.cx, state.drag.cy);
        if (JSON.stringify(c.cells) !== before) dirty = true;
      }
      if (dirty) pushHistory(preDragSnapshot);
    }

    preDragSnapshot = null;
    dirty = false;
    state.drag = null;
    renderCanvasTile(c);
    updateCounters();
    renderPalette();
  });

  // ===== 素材库 UI =====
  function renderPalette() {
    const counts = countByBlock();
    paletteEl.innerHTML = "";
    state.palette.forEach(blk => {
      const div = document.createElement("div");
      div.className = "palette-item" + (blk.id === state.currentBlockId ? " active" : "");
      div.style.backgroundColor = blk.color;
      div.style.color = contrastTextColor(blk.color);
      div.title = blk.name || blk.char;
      div.textContent = blk.char;

      const n = counts.get(`${blk.color}|${blk.char}`) || 0;
      if (n > 0) {
        const cnt = document.createElement("span");
        cnt.className = "count";
        cnt.textContent = String(n);
        div.appendChild(cnt);
      }

      div.addEventListener("click", () => {
        state.currentBlockId = blk.id;
        state.tool = "draw";
        renderPalette();
        renderTools();
        syncCanvasNodes();
      });
      const del = document.createElement("button");
      del.className = "del";
      del.textContent = "×";
      del.title = "删除";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`删除"${blk.name || blk.char}"？`)) return;
        state.palette = state.palette.filter(p => p.id !== blk.id);
        if (state.currentBlockId === blk.id) {
          state.currentBlockId = state.palette[0]?.id || null;
        }
        savePalette();
        renderPalette();
      });
      div.appendChild(del);
      paletteEl.appendChild(div);
    });
  }

  btnAddBlock.addEventListener("click", () => {
    blockForm.hidden = false;
    btnAddBlock.hidden = true;
    blockChar.focus();
  });
  btnFormCancel.addEventListener("click", () => {
    blockForm.hidden = true;
    btnAddBlock.hidden = false;
    blockForm.reset();
    blockColor.value = "#ff5252";
  });
  blockForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const char = blockChar.value.trim();
    if (!char) return;
    const newBlk = {
      id: "p" + Date.now() + Math.floor(Math.random() * 1000),
      color: blockColor.value,
      char,
      name: blockName.value.trim() || char,
    };
    state.palette.push(newBlk);
    state.currentBlockId = newBlk.id;
    savePalette();
    renderPalette();
    blockForm.hidden = true;
    btnAddBlock.hidden = false;
    blockForm.reset();
    blockColor.value = "#ff5252";
  });

  // ===== 工具切换 =====
  function renderTools() {
    document.querySelectorAll(".tool-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tool === state.tool);
    });
    workspace.dataset.tool = state.tool;
  }
  document.querySelectorAll(".tool-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.tool = btn.dataset.tool;
      renderTools();
    });
  });

  // ===== 顶栏 =====
  document.getElementById("btn-new").addEventListener("click", () => {
    const hasAny = state.canvases.some(c => Object.keys(c.cells).length);
    if (hasAny && !confirm("新建会清空所有画布，确认？")) return;
    pushHistory(snapshotAll());
    state.canvases = [newCanvas(Number(sizeSelect.value), 20, 20)];
    state.activeCanvasId = state.canvases[0].id;
    renderAll();
  });

  document.getElementById("btn-undo").addEventListener("click", undo);
  document.getElementById("btn-redo").addEventListener("click", redo);

  document.getElementById("btn-add-canvas").addEventListener("click", () => {
    const cols = Number(sizeSelect.value);
    let nx = 20, ny = 20;
    if (state.canvases.length) {
      const maxX = Math.max(...state.canvases.map(c => c.x + c.cols * c.cellPx));
      nx = maxX + CANVAS_MARGIN;
      ny = state.canvases[0].y;
    }
    pushHistory(snapshotAll());
    const c = newCanvas(cols, nx, ny);
    state.canvases.push(c);
    state.activeCanvasId = c.id;
    renderAll();
    // 滚动到新画布
    const node = canvasNodes.get(c.id);
    if (node) {
      const rect = node.el.getBoundingClientRect();
      const wsRect = workspace.getBoundingClientRect();
      if (rect.right > wsRect.right) {
        workspace.scrollLeft = c.x + c.cols * c.cellPx - workspace.clientWidth + 40;
      }
    }
  });

  document.getElementById("btn-remove-canvas").addEventListener("click", () => {
    if (state.canvases.length <= 1) {
      alert("至少要保留一张画布");
      return;
    }
    const c = state.canvases.find(c => c.id === state.activeCanvasId);
    if (!c) return;
    if (Object.keys(c.cells).length && !confirm(`删除当前画布（含 ${Object.keys(c.cells).length} 个像素块）？`)) return;
    pushHistory(snapshotAll());
    state.canvases = state.canvases.filter(x => x.id !== c.id);
    state.activeCanvasId = state.canvases[0].id;
    renderAll();
  });

  document.getElementById("btn-save").addEventListener("click", () => {
    const payload = {
      version: 2,
      canvases: state.canvases,
      palette: state.palette,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pixel-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  document.getElementById("btn-import").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== "object") throw new Error("文件格式不正确");

      if (data.version === 2 && Array.isArray(data.canvases)) {
        state.canvases = data.canvases.map(c => ({
          id: c.id || makeCanvasId(),
          x: c.x || 20,
          y: c.y || 20,
          cols: c.cols || 32,
          rows: c.rows || c.cols || 32,
          cellPx: c.cellPx || 20,
          cells: c.cells || {},
        }));
      } else if (data.cells && typeof data.cells === "object") {
        const cols = data.config?.cols || 32;
        state.canvases = [{
          id: makeCanvasId(),
          x: 20, y: 20,
          cols, rows: data.config?.rows || cols,
          cellPx: data.config?.cellPx || 20,
          cells: data.cells,
        }];
      } else {
        throw new Error("找不到画布数据");
      }

      if (!state.canvases.length) {
        state.canvases = [newCanvas(32, 20, 20)];
      }
      state.activeCanvasId = state.canvases[0].id;
      if (Array.isArray(data.palette) && data.palette.length) {
        state.palette = data.palette;
        state.currentBlockId = state.palette[0].id;
        savePalette();
      }
      state.history = [];
      state.future = [];
      renderAll();
    } catch (err) {
      alert("导入失败：" + (err.message || err));
    }
    fileInput.value = "";
  });

  // ===== 缩放 =====
  function setZoom(newZoom, anchorClientX, anchorClientY) {
    newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, +newZoom.toFixed(2)));
    if (newZoom === zoom) return;
    const wsRect = workspace.getBoundingClientRect();
    const ax = (anchorClientX != null ? anchorClientX : wsRect.left + workspace.clientWidth / 2) - wsRect.left;
    const ay = (anchorClientY != null ? anchorClientY : wsRect.top + workspace.clientHeight / 2) - wsRect.top;
    const areaX = (ax + workspace.scrollLeft) / zoom;
    const areaY = (ay + workspace.scrollTop) / zoom;
    zoom = newZoom;
    syncCanvasNodes();
    workspace.scrollLeft = areaX * zoom - ax;
    workspace.scrollTop = areaY * zoom - ay;
  }

  workspace.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    setZoom(zoom + delta, e.clientX, e.clientY);
  }, { passive: false });

  document.getElementById("btn-zoom-in").addEventListener("click", () => setZoom(zoom + ZOOM_STEP));
  document.getElementById("btn-zoom-out").addEventListener("click", () => setZoom(zoom - ZOOM_STEP));
  document.getElementById("btn-zoom-reset").addEventListener("click", () => setZoom(1.0));

  // ===== 快捷键 =====
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.code === "Space") {
      e.preventDefault();
      if (!spaceDown) {
        spaceDown = true;
        workspace.classList.add("space-down");
      }
      return;
    }
    const cmd = e.ctrlKey || e.metaKey;
    if (cmd && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (e.key === "e" || e.key === "E") {
      state.tool = "erase"; renderTools();
    } else if (e.key === "b" || e.key === "B") {
      state.tool = "draw"; renderTools();
    } else if (e.key === "m" || e.key === "M") {
      state.tool = "move"; renderTools();
    } else if (e.key === "0") {
      setZoom(1.0);
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      spaceDown = false;
      workspace.classList.remove("space-down");
      if (panning) {
        panning = null;
        workspace.classList.remove("panning-active");
      }
    }
  });

  // ===== 启动 =====
  renderAll();
})();
