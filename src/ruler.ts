/**
 * The rulers, the crosshair and the guides of one editor.
 *
 * Everything lives in two overlays inside the canvas element
 * (`.gjs-cv-canvas`), outside the frame:
 *  - `.gjs-ruler` (above GrapesJS tools): the two rulers, the corner and the
 *    cursor marks on the rulers;
 *  - `.gjs-ruler-lines` (below GrapesJS tools, clipped to the area right of
 *    and below the rulers): crosshair lines, guides, the coordinate badge.
 *
 * Coordinates are measured from the real boxes of the canvas and the frame
 * (getBoundingClientRect), so the canvas zoom, the device width, the frame
 * scroll and the empty area around a narrow (tablet / mobile) frame are all
 * handled the same way: the rulers and lines cover the whole canvas, and
 * values left of / above / beyond the frame are just negative / larger
 * document coordinates.
 */
import type { Editor } from 'grapesjs';
import type { ResolvedOptions, RulerLabels, RulerState } from './options';
import {
  formatValue,
  gridStep,
  neighbours,
  signature,
  snapValue,
  ticks,
  toDoc,
  toScreen,
  type Axis,
  type Geometry,
} from './scale';

/** 'h' = horizontal guide (a document y), 'v' = vertical guide (a document x). */
export type GuideAxis = 'h' | 'v';

export interface Guides {
  h: number[];
  v: number[];
}

export interface RulerController {
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  getGuides(): Guides;
  setGuides(g: Partial<Guides>): void;
  addGuide(axis: GuideAxis, value: number): void;
  removeGuide(axis: GuideAxis, index: number): void;
  clearGuides(): void;
  /** Grid in the empty area around the frame. */
  setGrid(on: boolean): void;
  isGrid(): boolean;
  /** Current canvas geometry (null while the canvas is not laid out). */
  getGeometry(): Geometry | null;
  /** Document coordinates of a point given in client (viewport) px of the editor page. */
  clientToDoc(clientX: number, clientY: number): { x: number; y: number } | null;
  /** Re-measures and redraws on the next frame. */
  refresh(): void;
  destroy(): void;
}

export interface RulerDeps {
  editor: Editor;
  canvasEl: HTMLElement;
  opts: ResolvedOptions;
  state: RulerState;
  getLabels(): RulerLabels;
  /** Called after any state change (visibility, guides). */
  onChange(state: RulerState, what: 'visible' | 'guides' | 'grid'): void;
}

const DRAG_THRESHOLD = 3;

const raf: (cb: () => void) => number =
  typeof requestAnimationFrame === 'function' ? (cb) => requestAnimationFrame(cb) : (cb) => setTimeout(cb, 16) as any;
const caf: (id: number) => void =
  typeof cancelAnimationFrame === 'function' ? (id) => cancelAnimationFrame(id) : (id) => clearTimeout(id);

interface Drag {
  axis: GuideAxis;
  /** Index of the guide being moved; null for a new guide. */
  index: number | null;
  value: number;
  startX: number;
  startY: number;
  moved: boolean;
  /** Pointer is back over its ruler: dropping removes the guide. */
  onRuler: boolean;
}

export function createRuler(deps: RulerDeps): RulerController {
  const { editor, canvasEl, opts, state } = deps;
  const size = opts.size;
  const doc = canvasEl.ownerDocument;
  const win = doc.defaultView || window;

  // ---- DOM --------------------------------------------------------------------

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement) => {
    const e = doc.createElement(tag);
    e.className = cls;
    parent?.appendChild(e);
    return e;
  };

  const root = el('div', 'gjs-ruler' + (opts.guides ? '' : ' gjs-ruler--noguides'));
  const lines = el('div', 'gjs-ruler-lines');
  lines.style.cssText = `top:${size}px;left:${size}px;right:0;bottom:0;`;
  // First child of the lines layer: everything else is drawn over the grid.
  const gridCanvas = el('canvas', 'gjs-ruler__grid', lines);
  const hCanvas = el('canvas', 'gjs-ruler__h', root);
  const vCanvas = el('canvas', 'gjs-ruler__v', root);
  hCanvas.style.left = `${size}px`;
  hCanvas.style.height = `${size}px`;
  vCanvas.style.top = `${size}px`;
  vCanvas.style.width = `${size}px`;
  const corner = el('div', 'gjs-ruler__corner', root);
  corner.style.width = corner.style.height = `${size}px`;
  corner.textContent = 'px';
  const markX = el('div', 'gjs-ruler__mark gjs-ruler__mark--x', root);
  const markY = el('div', 'gjs-ruler__mark gjs-ruler__mark--y', root);
  markX.style.height = markY.style.width = `${size}px`;
  const crossH = el('div', 'gjs-ruler__cross gjs-ruler__cross--h', lines);
  const crossV = el('div', 'gjs-ruler__cross gjs-ruler__cross--v', lines);
  const badge = el('div', 'gjs-ruler__badge', lines);
  const dragEl = el('div', 'gjs-ruler__guide gjs-ruler__guide--drag', lines);
  const mkDist = () => {
    const d = el('div', 'gjs-ruler__dist', lines);
    const label = el('span', 'gjs-ruler__dist-label', d);
    return { d, label };
  };
  /** Distance to the nearest line before / after the dragged guide. */
  const dists = [mkDist(), mkDist()];
  [markX, markY, crossH, crossV, badge, dragEl, ...dists.map((x) => x.d)].forEach((e) => (e.style.display = 'none'));

  // Lines go right after the frames area (below GrapesJS tools), rulers last.
  const frames = canvasEl.querySelector('.gjs-cv-canvas__frames');
  if (frames && frames.parentElement === canvasEl) frames.after(lines);
  else canvasEl.appendChild(lines);
  canvasEl.appendChild(root);
  canvasEl.style.setProperty('--gjs-ruler-size', `${size}px`);

  const guideEls: { h: HTMLElement[]; v: HTMLElement[] } = { h: [], v: [] };

  const applyLabels = () => {
    const l = deps.getLabels();
    corner.title = state.grid ? l.cornerGridOn : l.corner;
    if (opts.guides) hCanvas.title = vCanvas.title = l.ruler;
    [...guideEls.h, ...guideEls.v].forEach((g) => (g.title = l.guide));
  };

  // ---- State ----------------------------------------------------------------

  let visible = false;
  let destroyed = false;
  let geo: Geometry | null = null;
  let lastSig = '';
  let dpr = 0;
  let frameId = 0;
  /** Cursor in canvas px, or null when it is not over the canvas. */
  let mouse: { x: number; y: number } | null = null;
  let drag: Drag | null = null;
  let shield: HTMLElement | null = null;

  const isDead = () => {
    const em = (editor as any).getModel?.() || (editor as any).em;
    return !!em?.destroyed;
  };

  const schedule = () => {
    if (destroyed || frameId) return;
    frameId = raf(() => {
      frameId = 0;
      render();
    });
  };

  // ---- Geometry ---------------------------------------------------------------

  const frameEl = (): HTMLIFrameElement | null => {
    try {
      return ((editor.Canvas as any).getFrameEl?.() as HTMLIFrameElement) || null;
    } catch {
      return null;
    }
  };

  function measure(): Geometry | null {
    const fe = frameEl();
    if (!fe || !canvasEl.isConnected) return null;
    const cw = canvasEl.clientWidth;
    const ch = canvasEl.clientHeight;
    if (!cw || !ch) return null;
    const cr = canvasEl.getBoundingClientRect();
    const fr = fe.getBoundingClientRect();
    let scale = fe.offsetWidth ? fr.width / fe.offsetWidth : NaN;
    if (!(scale > 0) || !isFinite(scale)) {
      const z = Number((editor.Canvas as any).getZoomDecimal?.());
      scale = z > 0 ? z : 1;
    }
    let sx = 0;
    let sy = 0;
    try {
      sx = fe.contentWindow?.scrollX || 0;
      sy = fe.contentWindow?.scrollY || 0;
    } catch {
      // cross-origin frame: no scroll info
    }
    const fx = fr.left - cr.left - canvasEl.clientLeft;
    const fy = fr.top - cr.top - canvasEl.clientTop;
    return { cw, ch, ox: fx - sx * scale, oy: fy - sy * scale, scale, fx, fy, fw: fr.width, fh: fr.height };
  }

  /** Client px of the editor page → canvas px. */
  const clientToCanvas = (cx: number, cy: number) => {
    const cr = canvasEl.getBoundingClientRect();
    return { x: cx - cr.left - canvasEl.clientLeft, y: cy - cr.top - canvasEl.clientTop };
  };

  // ---- Drawing ----------------------------------------------------------------

  const cssVar = (name: string, fallback: string) => {
    try {
      return win.getComputedStyle(canvasEl).getPropertyValue(name).trim() || fallback;
    } catch {
      return fallback;
    }
  };

  function sizeCanvas(c: HTMLCanvasElement, w: number, h: number) {
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    if (c.width !== pw) c.width = pw;
    if (c.height !== ph) c.height = ph;
  }

  function drawRuler(c: HTMLCanvasElement, axis: Axis, g: Geometry) {
    const len = axis === 'x' ? g.cw - size : g.ch - size;
    if (len <= 0) return;
    if (axis === 'x') sizeCanvas(c, len, size);
    else sizeCanvas(c, size, len);
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = c.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    const colors = {
      bg: cssVar('--gjs-ruler-bg', '#2f2f33'),
      doc: cssVar('--gjs-ruler-doc-bg', '#45454b'),
      tick: cssVar('--gjs-ruler-tick', '#8d8d96'),
      text: cssVar('--gjs-ruler-text', '#c9c9d1'),
      border: cssVar('--gjs-ruler-border', 'rgba(0,0,0,.45)'),
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = axis === 'x' ? len : size;
    const H = axis === 'x' ? size : len;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    // The document (frame) range is lighter; the empty area stays dark.
    const a = Math.max(0, (axis === 'x' ? g.fx : g.fy) - size);
    const b = Math.min(len, (axis === 'x' ? g.fx + g.fw : g.fy + g.fh) - size);
    if (b > a) {
      ctx.fillStyle = colors.doc;
      if (axis === 'x') ctx.fillRect(a, 0, b - a, H);
      else ctx.fillRect(0, a, W, b - a);
    }

    ctx.strokeStyle = colors.tick;
    ctx.fillStyle = colors.text;
    ctx.lineWidth = 1;
    ctx.font = '9px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textBaseline = 'top';
    ctx.beginPath();
    const labels: { p: number; t: string }[] = [];
    ticks(g, axis, size, size + len).forEach((t) => {
      const p = Math.round(t.pos - size) + 0.5;
      const h = t.kind === 'major' ? size : t.kind === 'mid' ? size * 0.45 : size * 0.25;
      if (axis === 'x') {
        ctx!.moveTo(p, size);
        ctx!.lineTo(p, size - h);
      } else {
        ctx!.moveTo(size, p);
        ctx!.lineTo(size - h, p);
      }
      if (t.kind === 'major') labels.push({ p, t: formatValue(t.value) });
    });
    ctx.stroke();
    labels.forEach(({ p, t }) => {
      if (axis === 'x') {
        ctx!.textAlign = 'left';
        ctx!.fillText(t, p + 2.5, 2);
      } else {
        ctx!.save();
        ctx!.translate(2, p + 2.5);
        ctx!.rotate(-Math.PI / 2);
        ctx!.textAlign = 'right';
        ctx!.fillText(t, 0, 0);
        ctx!.restore();
      }
    });
    ctx.strokeStyle = colors.border;
    ctx.beginPath();
    if (axis === 'x') {
      ctx.moveTo(0, size - 0.5);
      ctx.lineTo(len, size - 0.5);
    } else {
      ctx.moveTo(size - 0.5, 0);
      ctx.lineTo(size - 0.5, len);
    }
    ctx.stroke();
  }

  // ---- Grid of the empty area -------------------------------------------------

  /**
   * Grid lines in document px (aligned with the ruler ticks), clipped to the
   * area outside the frame, plus a thin outline of the frame: the empty
   * area never blends with a page of the same colour.
   */
  function drawGrid(g: Geometry) {
    const W = g.cw - size;
    const H = g.ch - size;
    if (!state.grid || W <= 0 || H <= 0) {
      gridCanvas.style.display = 'none';
      return;
    }
    gridCanvas.style.display = '';
    sizeCanvas(gridCanvas, W, H);
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = gridCanvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const fx = g.fx - size;
    const fy = g.fy - size;
    const covered = fx <= 0 && fy <= 0 && fx + g.fw >= W && fy + g.fh >= H;
    if (covered) return; // no empty area

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.rect(fx, fy, g.fw, g.fh);
    ctx.clip('evenodd');
    const { major, minor } = gridStep(g.scale);
    const pass = (step: number, color: string, skipMajor: boolean) => {
      const px = step * g.scale;
      if (!(px > 0)) return;
      ctx!.beginPath();
      const ix0 = Math.ceil((size - g.ox) / px);
      const ix1 = Math.floor((g.cw - g.ox) / px);
      for (let i = ix0; i <= ix1; i++) {
        if (skipMajor && (i * step) % major === 0) continue;
        const x = Math.round(g.ox + i * px - size) + 0.5;
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, H);
      }
      const iy0 = Math.ceil((size - g.oy) / px);
      const iy1 = Math.floor((g.ch - g.oy) / px);
      for (let i = iy0; i <= iy1; i++) {
        if (skipMajor && (i * step) % major === 0) continue;
        const y = Math.round(g.oy + i * px - size) + 0.5;
        ctx!.moveTo(0, y);
        ctx!.lineTo(W, y);
      }
      ctx!.strokeStyle = color;
      ctx!.lineWidth = 1;
      ctx!.stroke();
    };
    if (minor < major) pass(minor, cssVar('--gjs-ruler-grid', 'rgba(255,255,255,.05)'), true);
    pass(major, cssVar('--gjs-ruler-grid-major', 'rgba(255,255,255,.11)'), false);
    ctx.restore();
    ctx.strokeStyle = cssVar('--gjs-ruler-frame', 'rgba(255,255,255,.22)');
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(fx) - 0.5, Math.round(fy) - 0.5, Math.round(g.fw) + 1, Math.round(g.fh) + 1);
  }

  // ---- Distances of a dragged guide (Figma-like) -------------------------------

  /** Document size in px: width of the frame viewport, height of the page. */
  function docSize(): { w: number; h: number } {
    const fe = frameEl();
    if (!fe) return { w: 0, h: 0 };
    let w = 0;
    let h = 0;
    try {
      const d = fe.contentDocument;
      w = d?.documentElement.clientWidth || 0;
      h = Math.max(d?.documentElement.scrollHeight || 0, d?.body?.scrollHeight || 0);
    } catch {
      // cross-origin
    }
    return { w: w || fe.offsetWidth || 0, h: h || fe.offsetHeight || 0 };
  }

  function placeDistances(g: Geometry) {
    const d = drag;
    const m = mouse;
    const on = opts.distances && d && d.moved && !d.onRuler && isFinite(d.value) && m;
    if (!on || !d || !m) {
      dists.forEach((x) => (x.d.style.display = 'none'));
      return;
    }
    const others = state[d.axis].filter((_, i) => i !== d.index);
    const ds = docSize();
    const far = d.axis === 'h' ? ds.h : ds.w;
    const { before, after } = neighbours([...others, 0, ...(far > 0 ? [far] : [])], d.value);
    const segs: ([number, number] | null)[] = [
      before != null ? [before, d.value] : null,
      after != null ? [d.value, after] : null,
    ];
    segs.forEach((seg, k) => {
      const x = dists[k];
      if (!seg) {
        x.d.style.display = 'none';
        return;
      }
      const [a, b] = seg;
      x.d.style.display = '';
      if (d.axis === 'h') {
        // horizontal guide: a vertical measure through the cursor
        const y1 = Math.round(toScreen(g, 'y', a)) - size;
        const y2 = Math.round(toScreen(g, 'y', b)) - size;
        x.d.className = 'gjs-ruler__dist gjs-ruler__dist--v';
        x.d.style.left = `${Math.round(m.x) - size}px`;
        x.d.style.top = `${y1}px`;
        x.d.style.height = `${y2 - y1}px`;
        x.d.style.width = '';
      } else {
        const x1 = Math.round(toScreen(g, 'x', a)) - size;
        const x2 = Math.round(toScreen(g, 'x', b)) - size;
        x.d.className = 'gjs-ruler__dist gjs-ruler__dist--h';
        x.d.style.top = `${Math.round(m.y) - size}px`;
        x.d.style.left = `${x1}px`;
        x.d.style.width = `${x2 - x1}px`;
        x.d.style.height = '';
      }
      const text = formatValue(b - a);
      if (x.label.textContent !== text) x.label.textContent = text;
    });
  }

  // ---- Guides -----------------------------------------------------------------

  function syncGuideEls() {
    (['h', 'v'] as GuideAxis[]).forEach((axis) => {
      const list = guideEls[axis];
      const want = opts.guides ? state[axis].length : 0;
      while (list.length < want) {
        const g = el('div', `gjs-ruler__guide gjs-ruler__guide--${axis}`);
        lines.insertBefore(g, dragEl);
        g.title = deps.getLabels().guide;
        g.addEventListener('pointerdown', (e) => {
          const i = guideEls[axis].indexOf(g);
          if (i >= 0) startDrag(e, axis, i);
        });
        g.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const i = guideEls[axis].indexOf(g);
          if (i >= 0) api.removeGuide(axis, i);
        });
        list.push(g);
      }
      while (list.length > want) list.pop()!.remove();
    });
  }

  function placeGuides(g: Geometry) {
    syncGuideEls();
    (['h', 'v'] as GuideAxis[]).forEach((axis) => {
      guideEls[axis].forEach((e, i) => {
        const hiddenByDrag = drag && drag.moved && drag.axis === axis && drag.index === i;
        e.style.display = hiddenByDrag ? 'none' : '';
        const value = state[axis][i];
        // Whole pixels: a 1px line at a fractional position blurs into grey.
        if (axis === 'h') e.style.top = `${Math.round(toScreen(g, 'y', value)) - size}px`;
        else e.style.left = `${Math.round(toScreen(g, 'x', value)) - size}px`;
      });
    });
    if (drag && drag.moved) {
      dragEl.style.display = '';
      dragEl.className = `gjs-ruler__guide gjs-ruler__guide--drag gjs-ruler__guide--${drag.axis}${drag.onRuler ? ' gjs-ruler__guide--out' : ''}`;
      dragEl.style.top = drag.axis === 'h' ? `${Math.round(toScreen(g, 'y', drag.value)) - size}px` : '';
      dragEl.style.left = drag.axis === 'v' ? `${Math.round(toScreen(g, 'x', drag.value)) - size}px` : '';
    } else {
      dragEl.style.display = 'none';
    }
  }

  // ---- Cursor -----------------------------------------------------------------

  function placeCursor(g: Geometry) {
    const m = mouse;
    const show = (e: HTMLElement, on: boolean) => (e.style.display = on ? '' : 'none');
    if (!m || m.x < 0 || m.y < 0 || m.x > g.cw || m.y > g.ch) {
      [markX, markY, crossH, crossV, badge].forEach((e) => show(e, false));
      return;
    }
    show(markX, m.x >= size);
    show(markY, m.y >= size);
    markX.style.left = `${Math.round(m.x)}px`;
    markY.style.top = `${Math.round(m.y)}px`;

    const inside = m.x >= size && m.y >= size;
    const lx = Math.round(m.x) - size;
    const ly = Math.round(m.y) - size;
    const cross = !!opts.crosshair && inside && !(drag && drag.moved);
    show(crossH, cross);
    show(crossV, cross);
    if (cross) {
      const full = opts.crosshair === 'full';
      crossH.style.top = `${ly}px`;
      crossH.style.left = '0px';
      crossH.style.width = `${full ? g.cw - size : lx}px`;
      crossV.style.left = `${lx}px`;
      crossV.style.top = '0px';
      crossV.style.height = `${full ? g.ch - size : ly}px`;
    }

    let text = '';
    if (drag && drag.moved) {
      text = drag.onRuler ? '×' : `${drag.axis === 'h' ? 'y' : 'x'} ${formatValue(drag.value)}`;
    } else if (opts.cursorLabel && inside) {
      text = `x ${formatValue(Math.round(toDoc(g, 'x', m.x)))}  y ${formatValue(Math.round(toDoc(g, 'y', m.y)))}`;
    }
    show(badge, !!text);
    if (text) {
      if (badge.textContent !== text) badge.textContent = text;
      const bw = badge.offsetWidth || text.length * 6 + 8;
      const bh = badge.offsetHeight || 16;
      let bx = lx + 12;
      let by = ly + 14;
      if (bx + bw > g.cw - size - 2) bx = lx - bw - 8;
      if (by + bh > g.ch - size - 2) by = ly - bh - 8;
      badge.style.left = `${Math.max(2, bx)}px`;
      badge.style.top = `${Math.max(2, by)}px`;
    }
  }

  // ---- Render -----------------------------------------------------------------

  function render() {
    if (!visible || destroyed) return;
    bindFrame();
    const g = measure();
    geo = g;
    if (!g) return;
    const d = win.devicePixelRatio || 1;
    const sig = `${signature(g)}|${d}`;
    if (sig !== lastSig) {
      lastSig = sig;
      dpr = d;
      drawRuler(hCanvas, 'x', g);
      drawRuler(vCanvas, 'y', g);
      drawGrid(g);
    }
    placeGuides(g);
    placeDistances(g);
    placeCursor(g);
  }

  // ---- Mouse tracking ---------------------------------------------------------

  const onParentMove = (e: MouseEvent) => {
    if (!visible || drag) return;
    // GrapesJS re-dispatches frame events on the iframe element with frame
    // coordinates; those are handled by onFrameMove.
    if ((e as any)._parentEvent || (e.target as Element)?.tagName === 'IFRAME') return;
    mouse = clientToCanvas(e.clientX, e.clientY);
    schedule();
  };
  const onParentLeave = () => {
    if (drag) return;
    mouse = null;
    schedule();
  };

  let boundFrame: HTMLIFrameElement | null = null;
  let boundDoc: Document | null = null;
  let boundWin: Window | null = null;

  const onFrameMove = (e: MouseEvent) => {
    if (!visible || drag || !boundFrame) return;
    const g = geo || measure();
    if (!g) return;
    // Frame client px → canvas px: the frame's visible corner plus the scaled offset.
    mouse = { x: g.fx + e.clientX * g.scale, y: g.fy + e.clientY * g.scale };
    schedule();
  };
  const onFrameOut = (e: MouseEvent) => {
    if (!e.relatedTarget) onParentLeave();
  };
  const onFrameScroll = () => schedule();
  const onFrameLoad = () => {
    boundDoc = null; // force rebinding to the new document
    schedule();
  };

  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => schedule());
    ro.observe(canvasEl);
  }

  function unbindFrame() {
    if (boundDoc) {
      boundDoc.removeEventListener('mousemove', onFrameMove, true);
      boundDoc.removeEventListener('dragover', onFrameMove, true);
      boundDoc.removeEventListener('mouseout', onFrameOut, true);
    }
    boundWin?.removeEventListener('scroll', onFrameScroll, true);
    if (boundFrame) {
      boundFrame.removeEventListener('load', onFrameLoad);
      ro?.unobserve(boundFrame);
    }
    boundFrame = null;
    boundDoc = null;
    boundWin = null;
  }

  function bindFrame() {
    const fe = frameEl();
    let fdoc: Document | null = null;
    try {
      fdoc = fe?.contentDocument || null;
    } catch {
      fdoc = null;
    }
    if (fe === boundFrame && fdoc === boundDoc) return;
    unbindFrame();
    if (!fe) return;
    boundFrame = fe;
    boundDoc = fdoc;
    boundWin = fe.contentWindow;
    fe.addEventListener('load', onFrameLoad);
    ro?.observe(fe);
    if (fdoc) {
      fdoc.addEventListener('mousemove', onFrameMove, true);
      fdoc.addEventListener('dragover', onFrameMove, true);
      fdoc.addEventListener('mouseout', onFrameOut, true);
    }
    try {
      boundWin?.addEventListener('scroll', onFrameScroll, true);
    } catch {
      // ignore
    }
  }

  canvasEl.addEventListener('mousemove', onParentMove);
  canvasEl.addEventListener('dragover', onParentMove);
  canvasEl.addEventListener('mouseleave', onParentLeave);
  // GrapesJS animates the frame width when the device changes.
  canvasEl.addEventListener('transitionend', schedule);
  canvasEl.addEventListener('transitionrun', schedule);

  const editorEvents = 'canvas:zoom canvas:coords canvas:frame:load canvas:refresh change:device frame:updated page:select update:canvas';
  editor.on(editorEvents, schedule);

  // Safety net for layout changes nobody announces (panel resizes, CSS).
  // Also notices a destroyed editor (GrapesJS 0.21 has no 'destroy' event).
  const poll = setInterval(() => {
    if (isDead()) return api.destroy();
    if (visible) schedule();
  }, 400);

  // ---- Guide dragging ---------------------------------------------------------

  function startDrag(e: PointerEvent, axis: GuideAxis, index: number | null) {
    if (!opts.guides || e.button !== 0 || drag) return;
    e.preventDefault();
    e.stopPropagation();
    drag = {
      axis,
      index,
      value: index == null ? NaN : state[axis][index],
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      onRuler: false,
    };
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    win.addEventListener('pointermove', onDragMove, true);
    win.addEventListener('pointerup', onDragUp, true);
    win.addEventListener('pointercancel', onDragCancel, true);
    win.addEventListener('keydown', onDragKey, true);
  }

  function onDragMove(e: PointerEvent) {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD && Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD) return;
      drag.moved = true;
      // A shield over everything keeps the pointer events in this page while
      // the pointer crosses the frame.
      shield = el('div', 'gjs-ruler__shield', doc.body);
      shield.style.cursor = drag.axis === 'h' ? 'row-resize' : 'col-resize';
    }
    const g = geo || measure();
    if (!g) return;
    const p = clientToCanvas(e.clientX, e.clientY);
    mouse = p;
    if (drag.axis === 'h') {
      drag.value = snapValue(toDoc(g, 'y', p.y), g.scale, e.shiftKey);
      drag.onRuler = p.y < size;
    } else {
      drag.value = snapValue(toDoc(g, 'x', p.x), g.scale, e.shiftKey);
      drag.onRuler = p.x < size;
    }
    e.preventDefault();
    schedule();
  }

  function endDrag(commit: boolean) {
    const d = drag;
    drag = null;
    win.removeEventListener('pointermove', onDragMove, true);
    win.removeEventListener('pointerup', onDragUp, true);
    win.removeEventListener('pointercancel', onDragCancel, true);
    win.removeEventListener('keydown', onDragKey, true);
    shield?.remove();
    shield = null;
    if (d && d.moved && commit && isFinite(d.value)) {
      const list = state[d.axis].slice();
      if (d.onRuler) {
        if (d.index != null) list.splice(d.index, 1);
      } else if (d.index == null) list.push(d.value);
      else list[d.index] = d.value;
      if (d.onRuler && d.index == null) {
        // dragged out and back: nothing to do
      } else {
        state[d.axis] = list;
        deps.onChange(state, 'guides');
      }
    }
    schedule();
  }

  const onDragUp = () => endDrag(true);
  const onDragCancel = () => endDrag(false);
  const onDragKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      endDrag(false);
    }
  };

  hCanvas.addEventListener('pointerdown', (e) => startDrag(e, 'h', null));
  vCanvas.addEventListener('pointerdown', (e) => startDrag(e, 'v', null));
  // Click: grid on/off (delayed, so a double-click only clears the guides).
  let cornerTimer: any = 0;
  corner.addEventListener('click', (e) => {
    e.preventDefault();
    if (cornerTimer) return;
    cornerTimer = setTimeout(() => {
      cornerTimer = 0;
      if (!destroyed) api.setGrid(!state.grid);
    }, 250);
  });
  corner.addEventListener('dblclick', (e) => {
    e.preventDefault();
    clearTimeout(cornerTimer);
    cornerTimer = 0;
    api.clearGuides();
  });
  // Keep clicks on the rulers away from GrapesJS (no deselect, no drag start).
  [root, lines].forEach((r) =>
    ['mousedown', 'click', 'contextmenu'].forEach((t) =>
      r.addEventListener(t, (e) => {
        if (e.target !== r) e.stopPropagation();
      }),
    ),
  );

  applyLabels();
  // i18n:locale fires before the locale is switched.
  const onLocale = () => setTimeout(() => !destroyed && applyLabels(), 0);
  editor.on('i18n:locale i18n:update', onLocale);

  // ---- API --------------------------------------------------------------------

  const setGuidesRaw = (axis: GuideAxis, list: number[]) => {
    state[axis] = list.map(Number).filter((n) => isFinite(n));
  };

  const api: RulerController = {
    setVisible(v) {
      v = !!v;
      if (destroyed || v === visible) return;
      visible = v;
      state.visible = v;
      root.hidden = lines.hidden = !v;
      canvasEl.classList.toggle('gjs-ruler-on', v);
      if (!v) {
        mouse = null;
        if (drag) endDrag(false);
      }
      lastSig = '';
      try {
        // GrapesJS caches the canvas/frame offsets used for its tools.
        (editor as any).refresh?.({ tools: true });
      } catch {
        // ignore
      }
      deps.onChange(state, 'visible');
      schedule();
    },
    isVisible: () => visible,
    getGuides: () => ({ h: state.h.slice(), v: state.v.slice() }),
    setGuides(g) {
      if (g.h) setGuidesRaw('h', g.h);
      if (g.v) setGuidesRaw('v', g.v);
      deps.onChange(state, 'guides');
      schedule();
    },
    addGuide(axis, value) {
      if (!isFinite(value)) return;
      state[axis] = [...state[axis], Math.round(value * 100) / 100];
      deps.onChange(state, 'guides');
      schedule();
    },
    removeGuide(axis, index) {
      if (index < 0 || index >= state[axis].length) return;
      state[axis] = state[axis].filter((_, i) => i !== index);
      deps.onChange(state, 'guides');
      schedule();
    },
    clearGuides() {
      if (!state.h.length && !state.v.length) return;
      state.h = [];
      state.v = [];
      deps.onChange(state, 'guides');
      schedule();
    },
    setGrid(on) {
      on = !!on;
      if (destroyed || on === state.grid) return;
      state.grid = on;
      lastSig = '';
      applyLabels();
      deps.onChange(state, 'grid');
      schedule();
    },
    isGrid: () => state.grid,
    getGeometry: () => geo || measure(),
    clientToDoc(cx, cy) {
      const g = measure();
      if (!g) return null;
      const p = clientToCanvas(cx, cy);
      return { x: toDoc(g, 'x', p.x), y: toDoc(g, 'y', p.y) };
    },
    refresh() {
      lastSig = '';
      schedule();
    },
    destroy() {
      if (destroyed) return;
      if (drag) endDrag(false);
      destroyed = true;
      clearTimeout(cornerTimer);
      if (frameId) caf(frameId);
      clearInterval(poll);
      unbindFrame();
      ro?.disconnect();
      editor.off(editorEvents, schedule);
      editor.off('i18n:locale i18n:update', onLocale);
      canvasEl.removeEventListener('mousemove', onParentMove);
      canvasEl.removeEventListener('dragover', onParentMove);
      canvasEl.removeEventListener('mouseleave', onParentLeave);
      canvasEl.removeEventListener('transitionend', schedule);
      canvasEl.removeEventListener('transitionrun', schedule);
      canvasEl.classList.remove('gjs-ruler-on');
      canvasEl.style.removeProperty('--gjs-ruler-size');
      root.remove();
      lines.remove();
    },
  };

  root.hidden = lines.hidden = true;
  return api;
}
