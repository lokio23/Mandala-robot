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

const bgColorInput    = document.getElementById('bg-color');
const toolModeInput   = document.getElementById('tool-mode');
const brushTypeInput  = document.getElementById('brush-type');
const stampShapeInput = document.getElementById('stamp-shape');
const stampShapeGroup = document.getElementById('stamp-shape-group');
const stampAlignInput    = document.getElementById('stamp-align');
const stampAlignGroup    = document.getElementById('stamp-align-group');
const brushRotationInput = document.getElementById('brush-rotation');
const brushRotationVal   = document.getElementById('brush-rotation-val');
const brushTypeGroup     = document.getElementById('brush-type-group');

const btnUndo  = document.getElementById('btn-undo');
const btnClear = document.getElementById('btn-clear');
const btnSave  = document.getElementById('btn-save');
const btnReset = document.getElementById('btn-reset');

// ── State ───────────────────────────────────────────────────
let segments   = 12;
let mirror     = true;
let showGuides = true;
let brushSize  = 6;
let brushColor = '#ffffff';
let bgColor    = '#0a0a12';
let brushType  = 'normal';   // 'normal' | 'dashed' | 'dotted' | 'airbrush'
let toolMode   = 'brush';    // 'brush' | 'stamp'
let stampShape = 'circle';   // 'circle' | 'star' | 'triangle' | 'diamond' | 'hexagon' | 'petal'
let stampAlign = false;      // rotate stamps to align with segment angle
let brushRotation = 0;       // manual rotation in radians
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
let dashAccum  = 0;            // cumulative distance for dashed brush spacing
let shiftDown  = false;        // is Shift held? (for 45° snap)
let strokeOriginX = 0;         // where the current stroke started
let strokeOriginY = 0;

let cursorX = 0;               // cursor position for preview
let cursorY = 0;
let cursorOnCanvas = false;    // is the mouse hovering over the canvas?

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

  // Draw small dots at each grid cell center
  const centers = getGridCenters();
  ctx.fillStyle = 'rgba(0,240,255,0.25)';
  for (let i = 0; i < centers.length; i++) {
    ctx.beginPath();
    ctx.arc(centers[i].x, centers[i].y, 2.5, 0, Math.PI * 2);
    ctx.fill();
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
 * Draw a single segment stroke using the current brush type.
 * Called from drawMandalaStroke for each segment's rotated endpoints.
 */
function drawSegmentStroke(p1x, p1y, p2x, p2y) {
  switch (brushType) {
    case 'dashed':
      // Spacing is handled at the frame level (drawFrame skips gap frames).
      // Here we just draw a normal line segment for the "on" phase.
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.stroke();
      break;

    case 'dotted':
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(p2x, p2y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'airbrush': {
      ctx.fillStyle = ctx.strokeStyle;
      const count = Math.max(3, Math.floor(brushSize * 1.5));
      const radius = brushSize * 2;
      for (let n = 0; n < count; n++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * radius;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        const dotR = Math.random() * (brushSize / 4) + 0.5;
        ctx.beginPath();
        ctx.arc(p2x + dx, p2y + dy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    default: // 'normal'
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.stroke();
      break;
  }
}

// ── Shape path builders (for stamp tool) ─────────────────────

function shapeCirclePath(r) {
  ctx.arc(0, 0, r, 0, Math.PI * 2);
}

function shapeStarPath(r) {
  const spikes = 5;
  const innerR = r * 0.4;
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const rad = (i % 2 === 0) ? r : innerR;
    const px = Math.cos(angle) * rad;
    const py = Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function shapeTrianglePath(r) {
  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 * Math.PI) / 3 - Math.PI / 2;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function shapeDiamondPath(r) {
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.6, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-r * 0.6, 0);
  ctx.closePath();
}

function shapeHexagonPath(r) {
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function shapePetalPath(r) {
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(r * 0.8, 0, 0, r);
  ctx.quadraticCurveTo(-r * 0.8, 0, 0, -r);
  ctx.closePath();
}

function drawShapePath(shape, r) {
  switch (shape) {
    case 'circle':   shapeCirclePath(r);   break;
    case 'star':     shapeStarPath(r);     break;
    case 'triangle': shapeTrianglePath(r); break;
    case 'diamond':  shapeDiamondPath(r);  break;
    case 'hexagon':  shapeHexagonPath(r);  break;
    case 'petal':    shapePetalPath(r);    break;
  }
}

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

      drawSegmentStroke(
        useCX + sdx1 * cos1 - sdy1 * sin1, useCY + sdx1 * sin1 + sdy1 * cos1,
        useCX + sdx2 * cos2 - sdy2 * sin2, useCY + sdx2 * sin2 + sdy2 * cos2
      );

      if (mirror) {
        drawSegmentStroke(
          useCX + sdx1 * cos1 + sdy1 * sin1, useCY + sdx1 * sin1 - sdy1 * cos1,
          useCX + sdx2 * cos2 + sdy2 * sin2, useCY + sdx2 * sin2 - sdy2 * cos2
        );
      }
    } else {
      // Standard rotation (no spiral)
      const cos = Math.cos(baseAngle);
      const sin = Math.sin(baseAngle);

      drawSegmentStroke(
        useCX + sdx1 * cos - sdy1 * sin, useCY + sdx1 * sin + sdy1 * cos,
        useCX + sdx2 * cos - sdy2 * sin, useCY + sdx2 * sin + sdy2 * cos
      );

      if (mirror) {
        drawSegmentStroke(
          useCX + sdx1 * cos + sdy1 * sin, useCY + sdx1 * sin - sdy1 * cos,
          useCX + sdx2 * cos + sdy2 * sin, useCY + sdx2 * sin - sdy2 * cos
        );
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

// ── Stamp tool ──────────────────────────────────────────────

/**
 * Place a shape at (x, y) replicated into all mandala segments.
 * Uses the same segment rotation, hue shift, radial fade, scale decay,
 * rotation offset, and mirror logic as drawMandalaStroke.
 */
function drawMandalaStamp(x, y, centerX, centerY, tileMaxRadius) {
  const useCX = (centerX !== undefined) ? centerX : cx;
  const useCY = (centerY !== undefined) ? centerY : cy;
  const useMaxR = (tileMaxRadius !== undefined) ? tileMaxRadius : maxRadius;

  const step = (Math.PI * 2) / segments;
  const r = brushSize;

  ctx.save();
  ctx.lineWidth = Math.max(1, brushSize / 6);
  ctx.lineCap   = 'round';
  ctx.lineJoin  = 'round';

  if (glow > 0) {
    ctx.shadowBlur  = glow;
    ctx.shadowColor = brushColor;
  }

  let baseHSL = null;
  if (hueShift > 0) {
    baseHSL = hexToHSL(brushColor);
  }

  const dx = x - useCX;
  const dy = y - useCY;

  // Radial fade
  let fadeAlpha = opacity;
  if (radialFade !== 0) {
    const dist = Math.sqrt(dx * dx + dy * dy);
    const t = useMaxR > 0 ? dist / useMaxR : 0;
    if (radialFade > 0) {
      fadeAlpha = opacity * (1 - t * radialFade);
    } else {
      fadeAlpha = opacity * (1 - (1 - t) * (-radialFade));
    }
    fadeAlpha = Math.max(0, Math.min(1, fadeAlpha));
  }

  for (let i = 0; i < segments; i++) {
    // Per-segment color
    let segColor;
    if (baseHSL) {
      const shiftedHue = baseHSL.h + i * hueShift;
      segColor = hslToCSS(shiftedHue, baseHSL.s, baseHSL.l);
    } else {
      segColor = brushColor;
    }
    ctx.strokeStyle = segColor;
    ctx.fillStyle   = segColor;
    if (glow > 0) ctx.shadowColor = segColor;
    ctx.globalAlpha = fadeAlpha;

    // Scale decay
    let sdx = dx, sdy = dy, sr = r;
    if (scaleDecay !== 1.0) {
      const sf = Math.pow(scaleDecay, i);
      sdx *= sf; sdy *= sf; sr *= sf;
    }

    const baseAngle = step * i + rotationOffset;
    const cos = Math.cos(baseAngle);
    const sin = Math.sin(baseAngle);

    const px = useCX + sdx * cos - sdy * sin;
    const py = useCY + sdx * sin + sdy * cos;

    // Draw shape
    ctx.save();
    ctx.translate(px, py);
    if (stampAlign) {
      const radialAngle = Math.atan2(py - useCY, px - useCX);
      ctx.rotate(radialAngle + Math.PI / 2 + brushRotation);
    } else if (brushRotation !== 0) {
      ctx.rotate(brushRotation);
    }
    ctx.beginPath();
    drawShapePath(stampShape, sr);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Mirror
    if (mirror) {
      const mpx = useCX + sdx * cos + sdy * sin;
      const mpy = useCY + sdx * sin - sdy * cos;

      ctx.save();
      ctx.translate(mpx, mpy);
      if (stampAlign) {
        const radialAngle = Math.atan2(mpy - useCY, mpx - useCX);
        ctx.rotate(radialAngle + Math.PI / 2 + brushRotation);
      } else if (brushRotation !== 0) {
        ctx.rotate(brushRotation);
      }
      ctx.scale(-1, 1);
      ctx.beginPath();
      drawShapePath(stampShape, sr);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
}

/** Tile stamp placement across all grid cells */
function drawTiledMandalaStamp(x, y) {
  const centers = getGridCenters();

  if (centers.length === 0) {
    drawMandalaStamp(x, y);
    return;
  }

  const ox = x - cx;
  const oy = y - cy;
  const tileR = gridSize / 2;

  for (let i = 0; i < centers.length; i++) {
    const c = centers[i];
    drawMandalaStamp(c.x + ox, c.y + oy, c.x, c.y, tileR);
  }
}

// ── Input handling ──────────────────────────────────────────

/** Snap a point to the nearest 45° angle relative to an origin */
function snapTo45(rawX, rawY, originX, originY) {
  const dx = rawX - originX;
  const dy = rawY - originY;
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  const dist = Math.sqrt(dx * dx + dy * dy);
  return {
    x: originX + Math.cos(snapped) * dist,
    y: originY + Math.sin(snapped) * dist
  };
}

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
  strokeOriginX = pos.x;
  strokeOriginY = pos.y;
  dashAccum = 0;

  // Draw immediately on click (so clicking without moving still leaves a mark)
  if (toolMode === 'stamp') {
    drawTiledMandalaStamp(pos.x, pos.y);
  } else {
    // Brush: draw a dot at click position (zero-length stroke with round cap = dot)
    drawTiledMandalaStroke(pos.x, pos.y, pos.x, pos.y);
  }
}

function onPointerMove(e) {
  // Always track cursor position for preview
  const rawPos = getPointerPos(e);
  cursorX = rawPos.x;
  cursorY = rawPos.y;

  if (!drawing) {
    // Redraw overlays + cursor preview (no stroke)
    if (contentData) ctx.putImageData(contentData, 0, 0);
    drawAllOverlays();
    drawCursorPreview();
    return;
  }

  e.preventDefault();
  let pos = { x: rawPos.x, y: rawPos.y };

  // Snap to nearest 45° angle when Shift is held
  if (shiftDown) {
    const snapped = snapTo45(pos.x, pos.y, strokeOriginX, strokeOriginY);
    pos = snapped;
  }

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

  if (toolMode === 'brush') {
    if (brushType === 'dashed') {
      // Track cumulative distance; draw during "dash" phase, skip during "gap" phase
      const ddx = smoothX - lastX;
      const ddy = smoothY - lastY;
      dashAccum += Math.sqrt(ddx * ddx + ddy * ddy);
      const dashLen = brushSize * 4;
      const gapLen  = brushSize * 3;
      const cycle   = dashLen + gapLen;
      if ((dashAccum % cycle) < dashLen) {
        drawTiledMandalaStroke(lastX, lastY, smoothX, smoothY);
      }
    } else {
      drawTiledMandalaStroke(lastX, lastY, smoothX, smoothY);
    }
  } else if (toolMode === 'stamp') {
    drawTiledMandalaStamp(smoothX, smoothY);
  }

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
  drawCursorPreview();
}

/**
 * Called when visual parameters change (guides toggle, segment count).
 * Restores the clean art from contentData, then overlays new guides.
 */
function refreshGuides() {
  if (contentData) ctx.putImageData(contentData, 0, 0);
  drawAllOverlays();
  drawCursorPreview();
}

/**
 * Draw a ghost preview of the current brush/stamp at the cursor position.
 * Shown at low opacity so the user can see size, shape, and position.
 */
function drawCursorPreview() {
  if (!cursorOnCanvas) return;

  ctx.save();
  ctx.globalAlpha = 0.3;

  if (toolMode === 'stamp') {
    // Draw the stamp shape outline at cursor
    ctx.translate(cursorX, cursorY);
    if (stampAlign) {
      const radialAngle = Math.atan2(cursorY - cy, cursorX - cx);
      ctx.rotate(radialAngle + Math.PI / 2 + brushRotation);
    } else if (brushRotation !== 0) {
      ctx.rotate(brushRotation);
    }
    ctx.strokeStyle = brushColor;
    ctx.fillStyle = brushColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    drawShapePath(stampShape, brushSize);
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.stroke();
  } else {
    // Brush mode — circle showing brush size
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cursorX, cursorY, brushSize / 2, 0, Math.PI * 2);
    ctx.stroke();

    // For airbrush, also show the scatter radius
    if (brushType === 'airbrush') {
      ctx.setLineDash([3, 3]);
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.arc(cursorX, cursorY, brushSize * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ctx.restore();
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

bgColorInput.addEventListener('input', () => {
  bgColor = bgColorInput.value;
  document.body.style.background = bgColor;
});

toolModeInput.addEventListener('change', () => {
  toolMode = toolModeInput.value;
  stampShapeGroup.style.display = (toolMode === 'stamp') ? '' : 'none';
  stampAlignGroup.style.display = (toolMode === 'stamp') ? '' : 'none';
  brushTypeGroup.style.display  = (toolMode === 'brush') ? '' : 'none';
});

brushTypeInput.addEventListener('change', () => {
  brushType = brushTypeInput.value;
});

stampShapeInput.addEventListener('change', () => {
  stampShape = stampShapeInput.value;
});

stampAlignInput.addEventListener('change', () => {
  stampAlign = stampAlignInput.checked;
});

brushRotationInput.addEventListener('input', () => {
  const raw = parseInt(brushRotationInput.value, 10);
  brushRotation = raw * Math.PI / 180;
  brushRotationVal.textContent = raw;
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

  const dpr = window.devicePixelRatio || 1;
  let cropW, cropH;

  if (gridType === 'square') {
    // Snap to whole grid cells so the export tiles seamlessly
    const cellPx = gridSize * dpr;
    const maxSide = Math.min(canvas.width, canvas.height);
    const cells = Math.floor(maxSide / cellPx);
    cropW = cropH = cells * cellPx;

  } else if (gridType === 'hexagon') {
    const r = gridSize / 2;
    const colStepPx = 1.5 * r * dpr;
    const rowStepPx = Math.sqrt(3) * r * dpr;
    // Even number of cols/rows needed for hex offset pattern
    const cols = Math.floor(canvas.width / colStepPx);
    const evenCols = cols - (cols % 2);
    cropW = evenCols * colStepPx;
    const rows = Math.floor(canvas.height / rowStepPx);
    const evenRows = rows - (rows % 2);
    cropH = evenRows * rowStepPx;

  } else if (gridType === 'triangle') {
    const colStepPx = (gridSize / 2) * dpr;
    const rowStepPx = (gridSize * Math.sqrt(3) / 2) * dpr;
    // Even number of cols/rows for alternating triangle pattern
    const cols = Math.floor(canvas.width / colStepPx);
    const evenCols = cols - (cols % 2);
    cropW = evenCols * colStepPx;
    const rows = Math.floor(canvas.height / rowStepPx);
    const evenRows = rows - (rows % 2);
    cropH = evenRows * rowStepPx;

  } else {
    // Grid off — centered square crop
    cropW = cropH = Math.min(canvas.width, canvas.height);
  }

  // Center crop on canvas center (which is also the grid origin)
  const sx = (canvas.width - cropW) / 2;
  const sy = (canvas.height - cropH) / 2;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = Math.round(cropW);
  tempCanvas.height = Math.round(cropH);
  const tempCtx = tempCanvas.getContext('2d');

  // Fill background color
  tempCtx.fillStyle = bgColor;
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

  // Draw art on top (drawImage composites, unlike putImageData)
  tempCtx.drawImage(canvas, sx, sy, cropW, cropH, 0, 0, tempCanvas.width, tempCanvas.height);

  const link = document.createElement('a');
  link.download = 'mandala.png';
  link.href = tempCanvas.toDataURL('image/png');
  link.click();

  // Re-overlay guides + grid
  drawAllOverlays();
});

btnReset.addEventListener('click', () => {
  // Reset all state to defaults
  segments = 12;       segmentsInput.value = 12;   segmentsVal.textContent = 12;
  mirror = true;       mirrorInput.checked = true;
  showGuides = true;   guidesInput.checked = true;
  brushSize = 6;       brushSizeInput.value = 6;   brushSizeVal.textContent = 6;
  brushColor = '#ffffff'; brushColorInput.value = '#ffffff';
  bgColor = '#0a0a12'; bgColorInput.value = '#0a0a12';
  document.body.style.background = bgColor;

  brushType = 'normal';  brushTypeInput.value = 'normal';
  toolMode = 'brush';    toolModeInput.value = 'brush';
  stampShape = 'circle';  stampShapeInput.value = 'circle';
  stampAlign = false;     stampAlignInput.checked = false;
  brushRotation = 0;      brushRotationInput.value = 0; brushRotationVal.textContent = 0;

  stampShapeGroup.style.display = 'none';
  stampAlignGroup.style.display = 'none';
  brushTypeGroup.style.display  = '';

  opacity = 1;           opacityInput.value = 100;  opacityVal.textContent = '1';
  smoothing = 0.5;       smoothingInput.value = 50; smoothingVal.textContent = '0.5';

  hueShift = 0;          hueShiftInput.value = 0;   hueShiftVal.textContent = 0;
  glow = 0;              glowInput.value = 0;       glowVal.textContent = 0;
  radialFade = 0;        radialFadeInput.value = 0; radialFadeVal.textContent = 0;

  rotationOffset = 0;    rotationOffsetInput.value = 0;  rotationOffsetVal.textContent = 0;
  spiralTwist = 0;       spiralTwistInput.value = 0;     spiralTwistVal.textContent = '0.00';
  scaleDecay = 1.0;      scaleDecayInput.value = 100;    scaleDecayVal.textContent = '1.00';

  gridType = 'off';      gridTypeInput.value = 'off';
  gridSize = 80;         gridSizeInput.value = 80;  gridSizeVal.textContent = 80;
  gridCentersCache = null; gridCentersKey = '';

  // Redraw overlays with new settings
  refreshGuides();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') shiftDown = true;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    undo();
    finishStroke();
  }
});
document.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') shiftDown = false;
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
canvas.addEventListener('mouseenter', () => {
  cursorOnCanvas = true;
});
canvas.addEventListener('mouseleave', (e) => {
  cursorOnCanvas = false;
  if (drawing) {
    onPointerUp(e);
    finishStroke();
  } else {
    // Clear stale cursor preview
    refreshGuides();
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
