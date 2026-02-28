/**
 * Mandala Drawing App
 *
 * Draws symmetrical mandala patterns by replicating brush strokes
 * across evenly-spaced radial segments, with optional mirroring.
 */

// ── DOM refs ────────────────────────────────────────────────
const canvas       = document.getElementById('canvas');
const ctx          = canvas.getContext('2d');
const controlPanel = document.getElementById('controls');
const toggleBtn    = document.getElementById('toggle-controls');

const segmentsInput  = document.getElementById('segments');
const segmentsVal    = document.getElementById('segments-val');
const mirrorInput    = document.getElementById('mirror');
const guidesInput    = document.getElementById('guides');
const brushSizeInput = document.getElementById('brush-size');
const brushSizeVal   = document.getElementById('brush-size-val');
const brushColorInput = document.getElementById('brush-color');
const opacityInput   = document.getElementById('opacity');
const opacityVal     = document.getElementById('opacity-val');
const smoothingInput = document.getElementById('smoothing');
const smoothingVal   = document.getElementById('smoothing-val');

const hueShiftInput       = document.getElementById('hue-shift');
const hueShiftVal         = document.getElementById('hue-shift-val');
const glowInput           = document.getElementById('glow');
const glowVal             = document.getElementById('glow-val');
const radialFadeInput     = document.getElementById('radial-fade');
const radialFadeVal       = document.getElementById('radial-fade-val');
const rotationOffsetInput = document.getElementById('rotation-offset');
const rotationOffsetVal   = document.getElementById('rotation-offset-val');
const spiralTwistInput    = document.getElementById('spiral-twist');
const spiralTwistVal      = document.getElementById('spiral-twist-val');
const scaleDecayInput     = document.getElementById('scale-decay');
const scaleDecayVal       = document.getElementById('scale-decay-val');

const gridTypeInput = document.getElementById('grid-type');
const gridSizeInput = document.getElementById('grid-size');
const gridSizeVal   = document.getElementById('grid-size-val');

const btnUndo  = document.getElementById('btn-undo');
const btnClear = document.getElementById('btn-clear');
const btnSave  = document.getElementById('btn-save');

// ── State ───────────────────────────────────────────────────
let segments   = 12;
let mirror     = true;
let showGuides = true;
let brushSize  = 6;
let brushColor = '#ffffff';
let opacity    = 1;
let smoothing  = 0.5;

// Color & Visual
let hueShift      = 0;     // degrees (0–360)
let glow          = 0;     // shadow blur radius (0–30)
let radialFade    = 0;     // -1 to 1

// Geometric
let rotationOffset = 0;    // radians
let spiralTwist    = 0;    // 0 to 1
let scaleDecay     = 1.0;  // 0.8 to 1.2

// Grid overlay
let gridType = 'off';          // 'off' | 'square' | 'triangle' | 'hexagon'
let gridSize = 80;             // cell size in CSS pixels
let gridCentersCache = null;   // cached array of {x, y} cell centers
let gridCentersKey   = '';     // invalidation key

let drawing    = false;        // is the user currently drawing?
let lastX      = 0;            // previous cursor x (smoothed)
let lastY      = 0;            // previous cursor y (smoothed)
let smoothX    = 0;            // smoothed x position
let smoothY    = 0;            // smoothed y position
let pendingDraw = false;       // whether we have a frame queued
let rafId      = null;         // requestAnimationFrame id

// Center of the canvas (updated on resize)
let cx = 0;
let cy = 0;
let maxRadius = 0;  // distance from center to corner

// Undo history: array of ImageData snapshots (max 20)
const MAX_UNDO = 20;
let undoStack = [];

// ── Canvas sizing ───────────────────────────────────────────

/** Resize canvas to fill the viewport at device pixel ratio */
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = window.innerWidth  * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx = window.innerWidth  / 2;
  cy = window.innerHeight / 2;
  maxRadius = Math.sqrt(cx * cx + cy * cy);
}

// ── Guide lines ─────────────────────────────────────────────

/**
 * Draw faint radial guide lines from center.
 * Rendered on a separate pass so they don't bake into undo history.
 */
function drawGuides() {
  if (!showGuides) return;
  const radius = Math.max(window.innerWidth, window.innerHeight);
  const step   = (Math.PI * 2) / segments;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth   = 1;

  for (let i = 0; i < segments; i++) {
    const angle = step * i;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.stroke();
  }

  // Small center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fill();

  ctx.restore();
}

// ── Grid overlay ─────────────────────────────────────────────

/** Draw the selected grid overlay (square / triangle / hexagon) */
function drawGrid() {
  if (gridType === 'off') return;

  const w = window.innerWidth;
  const h = window.innerHeight;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 0.5;

  switch (gridType) {
    case 'square':   drawSquareGrid(w, h);   break;
    case 'triangle': drawTriangleGrid(w, h); break;
    case 'hexagon':  drawHexagonGrid(w, h);  break;
  }

  ctx.restore();
}

/** Square grid — horizontal + vertical lines centered on (cx, cy) */
function drawSquareGrid(w, h) {
  ctx.beginPath();

  // Horizontal lines
  const startY = cy % gridSize;
  for (let y = startY; y <= h; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }

  // Vertical lines
  const startX = cx % gridSize;
  for (let x = startX; x <= w; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }

  ctx.stroke();
}

/** Triangle grid — 3 families of parallel lines at 0°, 60°, 120° */
function drawTriangleGrid(w, h) {
  const s = gridSize;
  const rowH = s * Math.sqrt(3) / 2;
  const diag = Math.sqrt(w * w + h * h);

  ctx.beginPath();

  // Set 1: Horizontal lines (0°)
  const startY = cy % rowH;
  for (let y = startY; y <= h; y += rowH) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }

  // Set 2: Lines at 60°
  const cos60 = Math.cos(Math.PI / 3);
  const sin60 = Math.sin(Math.PI / 3);
  const numLines = Math.ceil(diag / rowH);

  for (let i = -numLines; i <= numLines; i++) {
    const ox = cx + i * rowH * sin60;
    const oy = cy - i * rowH * cos60;
    ctx.moveTo(ox - cos60 * diag, oy - sin60 * diag);
    ctx.lineTo(ox + cos60 * diag, oy + sin60 * diag);
  }

  // Set 3: Lines at 120°
  const cos120 = Math.cos(2 * Math.PI / 3);
  const sin120 = Math.sin(2 * Math.PI / 3);

  for (let i = -numLines; i <= numLines; i++) {
    const ox = cx + i * rowH * sin120;
    const oy = cy - i * rowH * cos120;
    ctx.moveTo(ox - cos120 * diag, oy - sin120 * diag);
    ctx.lineTo(ox + cos120 * diag, oy + sin120 * diag);
  }

  ctx.stroke();
}

/** Hexagon grid — flat-top hexagons tiling the canvas */
function drawHexagonGrid(w, h) {
  const r = gridSize / 2;
  const hexH = Math.sqrt(3) * r;
  const colStep = 1.5 * r;
  const rowStep = hexH;

  const cols = Math.ceil(w / colStep) + 2;
  const rows = Math.ceil(h / rowStep) + 2;
  const startCol = -Math.ceil(cx / colStep) - 1;
  const startRow = -Math.ceil(cy / rowStep) - 1;

  ctx.beginPath();
  for (let col = startCol; col <= startCol + cols + 1; col++) {
    for (let row = startRow; row <= startRow + rows + 1; row++) {
      const x = cx + col * colStep;
      const yOffset = (col % 2 !== 0) ? hexH / 2 : 0;
      const y = cy + row * rowStep + yOffset;
      addHexToPath(x, y, r);
    }
  }
  ctx.stroke();
}

/** Add a single flat-top hexagon to the current path */
function addHexToPath(x, y, r) {
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const px = x + r * Math.cos(angle);
    const py = y + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Draw all visual overlays (guides + grid) */
function drawAllOverlays() {
  drawGuides();
  drawGrid();
}

// ── Grid cell centers (for tiling) ──────────────────────────

/**
 * Compute the center of every visible grid cell.
 * Returns [] when grid is 'off'. Results are cached.
 */
function getGridCenters() {
  if (gridType === 'off') return [];

  const w = window.innerWidth;
  const h = window.innerHeight;
  const key = `${gridType}|${gridSize}|${w}|${h}`;

  if (gridCentersCache && gridCentersKey === key) {
    return gridCentersCache;
  }

  const centers = [];
  const pad = gridSize;

  switch (gridType) {
    case 'square': {
      const minCol = Math.floor((-cx - pad) / gridSize);
      const maxCol = Math.ceil((w - cx + pad) / gridSize);
      const minRow = Math.floor((-cy - pad) / gridSize);
      const maxRow = Math.ceil((h - cy + pad) / gridSize);
      for (let col = minCol; col <= maxCol; col++) {
        for (let row = minRow; row <= maxRow; row++) {
          centers.push({ x: cx + col * gridSize, y: cy + row * gridSize });
        }
      }
      break;
    }

    case 'triangle': {
      const s = gridSize;
      const rowH = s * Math.sqrt(3) / 2;
      const minRow = Math.floor((-cy - pad) / rowH);
      const maxRow = Math.ceil((h - cy + pad) / rowH);
      const minCol = Math.floor((-cx - pad) / (s / 2));
      const maxCol = Math.ceil((w - cx + pad) / (s / 2));

      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const isUp = (row + col) % 2 === 0;
          const triCenterX = cx + col * (s / 2) + s / 4;
          const triCenterY = isUp
            ? cy + row * rowH + rowH / 3
            : cy + row * rowH + 2 * rowH / 3;
          centers.push({ x: triCenterX, y: triCenterY });
        }
      }
      break;
    }

    case 'hexagon': {
      const r = gridSize / 2;
      const hexH = Math.sqrt(3) * r;
      const colStep = 1.5 * r;
      const rowStep = hexH;

      const cols = Math.ceil(w / colStep) + 2;
      const rows = Math.ceil(h / rowStep) + 2;
      const startCol = -Math.ceil(cx / colStep) - 1;
      const startRow = -Math.ceil(cy / rowStep) - 1;

      for (let col = startCol; col <= startCol + cols + 1; col++) {
        for (let row = startRow; row <= startRow + rows + 1; row++) {
          const x = cx + col * colStep;
          const yOffset = (col % 2 !== 0) ? hexH / 2 : 0;
          const y = cy + row * rowStep + yOffset;
          centers.push({ x, y });
        }
      }
      break;
    }
  }

  gridCentersCache = centers;
  gridCentersKey = key;
  return centers;
}

// ── Undo system ─────────────────────────────────────────────

/** Push the current canvas state onto the undo stack */
function pushUndo() {
  const dpr = window.devicePixelRatio || 1;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  undoStack.push(data);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

/** Restore the most recent undo snapshot */
function undo() {
  if (undoStack.length === 0) return;
  const data = undoStack.pop();
  ctx.putImageData(data, 0, 0);
}

// ── Color helpers ────────────────────────────────────────────

/** Convert hex (#rrggbb) to { h (0-360), s (0-100), l (0-100) } */
function hexToHSL(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0, s = 0, l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case r: h = ((g - b) / delta + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / delta + 2) * 60; break;
      case b: h = ((r - g) / delta + 4) * 60; break;
    }
  }
  return { h, s: s * 100, l: l * 100 };
}

/** Return a CSS hsl() string */
function hslToCSS(h, s, l) {
  return `hsl(${h % 360}, ${s}%, ${l}%)`;
}

// ── Drawing engine ──────────────────────────────────────────

/**
 * Draw a line segment replicated into all mandala segments.
 * Each segment is rotated around the center; if mirror is on,
 * a horizontally-flipped copy is also drawn within each segment.
 */
function drawMandalaStroke(x1, y1, x2, y2, centerX, centerY, tileMaxRadius) {
  const useCX = (centerX !== undefined) ? centerX : cx;
  const useCY = (centerY !== undefined) ? centerY : cy;
  const useMaxR = (tileMaxRadius !== undefined) ? tileMaxRadius : maxRadius;

  const step = (Math.PI * 2) / segments;

  ctx.save();
  ctx.lineWidth = brushSize;
  ctx.lineCap   = 'round';
  ctx.lineJoin  = 'round';

  // ── Glow setup ─────────────────────────────────────────
  if (glow > 0) {
    ctx.shadowBlur  = glow;
    ctx.shadowColor = brushColor;
  }

  // ── Hue shift: pre-compute base HSL ────────────────────
  let baseHSL = null;
  if (hueShift > 0) {
    baseHSL = hexToHSL(brushColor);
  }

  // Convert points relative to center
  const dx1 = x1 - useCX;
  const dy1 = y1 - useCY;
  const dx2 = x2 - useCX;
  const dy2 = y2 - useCY;

  // ── Radial fade: compute once from midpoint distance ───
  let fadeAlpha = opacity;
  if (radialFade !== 0) {
    const midX = (dx1 + dx2) / 2;
    const midY = (dy1 + dy2) / 2;
    const dist = Math.sqrt(midX * midX + midY * midY);
    const t = useMaxR > 0 ? dist / useMaxR : 0;

    if (radialFade > 0) {
      fadeAlpha = opacity * (1 - t * radialFade);
    } else {
      fadeAlpha = opacity * (1 - (1 - t) * (-radialFade));
    }
    fadeAlpha = Math.max(0, Math.min(1, fadeAlpha));
  }

  for (let i = 0; i < segments; i++) {
    // ── Per-segment color (hue shift) ────────────────────
    if (baseHSL) {
      const shiftedHue = baseHSL.h + i * hueShift;
      ctx.strokeStyle = hslToCSS(shiftedHue, baseHSL.s, baseHSL.l);
      if (glow > 0) ctx.shadowColor = ctx.strokeStyle;
    } else {
      ctx.strokeStyle = brushColor;
    }

    ctx.globalAlpha = fadeAlpha;

    // ── Scale decay: scale distance per segment ──────────
    let sdx1 = dx1, sdy1 = dy1, sdx2 = dx2, sdy2 = dy2;
    if (scaleDecay !== 1.0) {
      const sf = Math.pow(scaleDecay, i);
      sdx1 *= sf; sdy1 *= sf;
      sdx2 *= sf; sdy2 *= sf;
    }

    // ── Base angle with rotation offset ──────────────────
    const baseAngle = step * i + rotationOffset;

    // ── Draw with or without spiral twist ────────────────
    if (spiralTwist > 0) {
      // Spiral: each endpoint gets its own twist based on distance
      const dist1 = Math.sqrt(sdx1 * sdx1 + sdy1 * sdy1);
      const dist2 = Math.sqrt(sdx2 * sdx2 + sdy2 * sdy2);
      const a1 = baseAngle + spiralTwist * (dist1 / (useMaxR || 1)) * Math.PI;
      const a2 = baseAngle + spiralTwist * (dist2 / (useMaxR || 1)) * Math.PI;

      const cos1 = Math.cos(a1), sin1 = Math.sin(a1);
      const cos2 = Math.cos(a2), sin2 = Math.sin(a2);

      ctx.beginPath();
      ctx.moveTo(useCX + sdx1 * cos1 - sdy1 * sin1, useCY + sdx1 * sin1 + sdy1 * cos1);
      ctx.lineTo(useCX + sdx2 * cos2 - sdy2 * sin2, useCY + sdx2 * sin2 + sdy2 * cos2);
      ctx.stroke();

      if (mirror) {
        ctx.beginPath();
        ctx.moveTo(useCX + sdx1 * cos1 + sdy1 * sin1, useCY + sdx1 * sin1 - sdy1 * cos1);
        ctx.lineTo(useCX + sdx2 * cos2 + sdy2 * sin2, useCY + sdx2 * sin2 - sdy2 * cos2);
        ctx.stroke();
      }
    } else {
      // Standard rotation (no spiral)
      const cos = Math.cos(baseAngle);
      const sin = Math.sin(baseAngle);

      ctx.beginPath();
      ctx.moveTo(useCX + sdx1 * cos - sdy1 * sin, useCY + sdx1 * sin + sdy1 * cos);
      ctx.lineTo(useCX + sdx2 * cos - sdy2 * sin, useCY + sdx2 * sin + sdy2 * cos);
      ctx.stroke();

      if (mirror) {
        ctx.beginPath();
        ctx.moveTo(useCX + sdx1 * cos + sdy1 * sin, useCY + sdx1 * sin - sdy1 * cos);
        ctx.lineTo(useCX + sdx2 * cos + sdy2 * sin, useCY + sdx2 * sin - sdy2 * cos);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

/**
 * Draw the mandala stroke tiled across all grid cells (if grid active),
 * or once at the main center (if grid is off).
 */
function drawTiledMandalaStroke(x1, y1, x2, y2) {
  const centers = getGridCenters();

  if (centers.length === 0) {
    // Grid is off — original single-center behavior
    drawMandalaStroke(x1, y1, x2, y2);
    return;
  }

  // User's stroke as offset from the main center
  const ox1 = x1 - cx, oy1 = y1 - cy;
  const ox2 = x2 - cx, oy2 = y2 - cy;
  const tileR = gridSize / 2;

  for (let i = 0; i < centers.length; i++) {
    const c = centers[i];
    drawMandalaStroke(
      c.x + ox1, c.y + oy1,
      c.x + ox2, c.y + oy2,
      c.x, c.y, tileR
    );
  }
}

// ── Input handling ──────────────────────────────────────────

/** Get pointer position from mouse or touch event */
function getPointerPos(e) {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

function onPointerDown(e) {
  e.preventDefault();
  drawing = true;
  const pos = getPointerPos(e);
  // Snapshot for undo before this stroke begins
  pushUndo();
  lastX = smoothX = pos.x;
  lastY = smoothY = pos.y;
}

function onPointerMove(e) {
  if (!drawing) return;
  e.preventDefault();
  const pos = getPointerPos(e);

  // Apply exponential smoothing to reduce jitter
  smoothX = smoothX + (1 - smoothing) * (pos.x - smoothX);
  smoothY = smoothY + (1 - smoothing) * (pos.y - smoothY);

  // Schedule a draw on the next animation frame
  if (!pendingDraw) {
    pendingDraw = true;
    rafId = requestAnimationFrame(drawFrame);
  }
}

function onPointerUp(e) {
  drawing = false;
  pendingDraw = false;
}

/** Called via requestAnimationFrame — performs the actual draw */
function drawFrame() {
  pendingDraw = false;
  if (!drawing) return;

  drawTiledMandalaStroke(lastX, lastY, smoothX, smoothY);
  lastX = smoothX;
  lastY = smoothY;
}

// ── Redraw (guides overlay) ─────────────────────────────────

/**
 * We keep a "content" ImageData so we can redraw guides on top
 * without baking them into the art. The guide overlay is drawn
 * on every repaint and stripped before saving / undo capture.
 */
let contentData = null;

/** Save the current canvas (should be clean art, no guides) */
function captureContent() {
  contentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Called after drawing ends (mouseup/touchend).
 * Canvas has clean art (guides were stripped at pointer-down).
 * Capture it, then overlay guides.
 */
function finishStroke() {
  captureContent();
  drawAllOverlays();
}

/**
 * Called when visual parameters change (guides toggle, segment count).
 * Restores the clean art from contentData, then overlays new guides.
 */
function refreshGuides() {
  if (contentData) ctx.putImageData(contentData, 0, 0);
  drawAllOverlays();
}

// ── Control bindings ────────────────────────────────────────

segmentsInput.addEventListener('input', () => {
  segments = parseInt(segmentsInput.value, 10);
  segmentsVal.textContent = segments;
  refreshGuides();
});

mirrorInput.addEventListener('change', () => {
  mirror = mirrorInput.checked;
});

guidesInput.addEventListener('change', () => {
  showGuides = guidesInput.checked;
  refreshGuides();
});

gridTypeInput.addEventListener('change', () => {
  gridType = gridTypeInput.value;
  gridCentersCache = null;
  refreshGuides();
});

gridSizeInput.addEventListener('input', () => {
  gridSize = parseInt(gridSizeInput.value, 10);
  gridSizeVal.textContent = gridSize;
  gridCentersCache = null;
  refreshGuides();
});

brushSizeInput.addEventListener('input', () => {
  brushSize = parseInt(brushSizeInput.value, 10);
  brushSizeVal.textContent = brushSize;
});

brushColorInput.addEventListener('input', () => {
  brushColor = brushColorInput.value;
});

opacityInput.addEventListener('input', () => {
  const raw = parseInt(opacityInput.value, 10);
  opacity = raw / 100;
  opacityVal.textContent = opacity.toFixed(2);
});

smoothingInput.addEventListener('input', () => {
  const raw = parseInt(smoothingInput.value, 10);
  smoothing = raw / 100;
  smoothingVal.textContent = smoothing.toFixed(2);
});

// ── Color & Visual bindings ──────────────────────────────────

hueShiftInput.addEventListener('input', () => {
  hueShift = parseInt(hueShiftInput.value, 10);
  hueShiftVal.textContent = hueShift;
});

glowInput.addEventListener('input', () => {
  glow = parseInt(glowInput.value, 10);
  glowVal.textContent = glow;
});

radialFadeInput.addEventListener('input', () => {
  const raw = parseInt(radialFadeInput.value, 10);
  radialFade = raw / 100;
  radialFadeVal.textContent = radialFade.toFixed(2);
});

// ── Geometric bindings ───────────────────────────────────────

rotationOffsetInput.addEventListener('input', () => {
  const raw = parseInt(rotationOffsetInput.value, 10);
  rotationOffset = raw * Math.PI / 180;
  rotationOffsetVal.textContent = raw;
});

spiralTwistInput.addEventListener('input', () => {
  const raw = parseInt(spiralTwistInput.value, 10);
  spiralTwist = raw / 100;
  spiralTwistVal.textContent = spiralTwist.toFixed(2);
});

scaleDecayInput.addEventListener('input', () => {
  const raw = parseInt(scaleDecayInput.value, 10);
  scaleDecay = raw / 100;
  scaleDecayVal.textContent = scaleDecay.toFixed(2);
});

// ── Button actions ──────────────────────────────────────────

btnClear.addEventListener('click', () => {
  // Strip guides so undo snapshot is clean
  if (contentData) ctx.putImageData(contentData, 0, 0);
  pushUndo();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  captureContent();
  drawAllOverlays();
});

btnUndo.addEventListener('click', () => {
  undo();
  finishStroke();
});

btnSave.addEventListener('click', () => {
  // Strip guides before saving
  if (contentData) ctx.putImageData(contentData, 0, 0);

  const link = document.createElement('a');
  link.download = 'mandala.png';
  link.href = canvas.toDataURL('image/png');
  link.click();

  // Re-overlay guides + grid
  drawAllOverlays();
});

// Keyboard shortcut: Ctrl/Cmd + Z for undo
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undo();
    finishStroke();
  }
});

// ── Toggle controls panel ───────────────────────────────────

toggleBtn.addEventListener('click', () => {
  controlPanel.classList.toggle('hidden');
  toggleBtn.classList.toggle('visible', controlPanel.classList.contains('hidden'));
});

// ── Pointer events (mouse + touch) ──────────────────────────

// Strip guides before drawing starts, restore after
canvas.addEventListener('mousedown', (e) => {
  // Remove guide overlay so strokes don't draw on top of it
  if (contentData) ctx.putImageData(contentData, 0, 0);
  onPointerDown(e);
});
canvas.addEventListener('mousemove', onPointerMove);
canvas.addEventListener('mouseup', (e) => {
  onPointerUp(e);
  finishStroke();
});
canvas.addEventListener('mouseleave', (e) => {
  if (drawing) {
    onPointerUp(e);
    finishStroke();
  }
});

canvas.addEventListener('touchstart',  (e) => {
  if (contentData) ctx.putImageData(contentData, 0, 0);
  onPointerDown(e);
}, { passive: false });
canvas.addEventListener('touchmove',   onPointerMove, { passive: false });
canvas.addEventListener('touchend',    (e) => {
  onPointerUp(e);
  finishStroke();
}, { passive: false });
canvas.addEventListener('touchcancel', (e) => {
  onPointerUp(e);
  finishStroke();
}, { passive: false });

// ── Init ────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  // Restore clean art (no guides), resize, put it back
  if (contentData) ctx.putImageData(contentData, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  resizeCanvas();
  gridCentersCache = null;
  ctx.putImageData(img, 0, 0);
  cx = window.innerWidth / 2;
  cy = window.innerHeight / 2;
  finishStroke();
});

/** Bootstrap: ensure viewport dimensions are available before sizing canvas */
function init() {
  resizeCanvas();
  // Capture the clean (empty) canvas as contentData before overlaying guides
  captureContent();
  drawAllOverlays();
}

// The script runs at end-of-body, but some browsers may not have
// viewport dimensions ready yet. Use 'load' as a safety net.
if (document.readyState === 'complete') {
  init();
} else {
  window.addEventListener('load', init);
}
