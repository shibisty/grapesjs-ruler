/**
 * Pure maths of the rulers: tick steps for a zoom level and the mapping
 * between canvas pixels and document pixels. No DOM here, so it is unit
 * tested directly.
 */

/** Steps (document px) a major tick may use, smallest first. */
export const MAJOR_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000];

export interface TickStep {
  /** Document px between labelled ticks. */
  major: number;
  /** Document px between the smallest ticks (divides `major`). */
  minor: number;
  /** Minor ticks per major tick. */
  div: number;
}

/**
 * The tick step for `scale` (screen px per document px): labelled ticks at
 * least `minLabelPx` apart on screen, minor ticks at least `minTickPx`.
 */
export function pickStep(scale: number, minLabelPx = 50, minTickPx = 4): TickStep {
  const s = scale > 0 && isFinite(scale) ? scale : 1;
  const major = MAJOR_STEPS.find((m) => m * s >= minLabelPx) ?? MAJOR_STEPS[MAJOR_STEPS.length - 1];
  for (const div of [10, 5, 4, 2]) {
    const minor = major / div;
    if (Number.isInteger(minor) && minor * s >= minTickPx) return { major, minor, div };
  }
  return { major, minor: major, div: 1 };
}

/** Geometry of the canvas, all in screen px relative to the canvas element. */
export interface Geometry {
  /** Canvas element inner size. */
  cw: number;
  ch: number;
  /** Where document point (0, 0) is (frame corner minus its scroll). */
  ox: number;
  oy: number;
  /** Screen px per document px (the canvas zoom). */
  scale: number;
  /** Visible frame box (the document area; the rest is the empty area). */
  fx: number;
  fy: number;
  fw: number;
  fh: number;
}

export type Axis = 'x' | 'y';

export function toDoc(geo: Geometry, axis: Axis, screen: number): number {
  return axis === 'x' ? (screen - geo.ox) / geo.scale : (screen - geo.oy) / geo.scale;
}

export function toScreen(geo: Geometry, axis: Axis, doc: number): number {
  return axis === 'x' ? geo.ox + doc * geo.scale : geo.oy + doc * geo.scale;
}

export interface Tick {
  /** Screen px (canvas-relative). */
  pos: number;
  /** Document px. */
  value: number;
  kind: 'major' | 'mid' | 'minor';
}

/** Ticks of one ruler whose visible screen range is [from, to]. */
export function ticks(geo: Geometry, axis: Axis, from: number, to: number, step = pickStep(geo.scale)): Tick[] {
  const v0 = toDoc(geo, axis, from);
  const v1 = toDoc(geo, axis, to);
  const lo = Math.ceil(Math.min(v0, v1) / step.minor);
  const hi = Math.floor(Math.max(v0, v1) / step.minor);
  const out: Tick[] = [];
  if (hi - lo > 20000) return out; // degenerate geometry
  for (let i = lo; i <= hi; i++) {
    const value = i * step.minor;
    const r = ((i % step.div) + step.div) % step.div;
    const kind = r === 0 ? 'major' : step.div % 2 === 0 && r === step.div / 2 ? 'mid' : 'minor';
    out.push({ pos: toScreen(geo, axis, value), value, kind });
  }
  return out;
}

/** Rounds a document coordinate; with `snap`, to the nearest minor tick. */
export function snapValue(value: number, scale: number, snap: boolean): number {
  if (!snap) return Math.round(value);
  const { minor } = pickStep(scale);
  return Math.round(value / minor) * minor;
}

/** A compact label: 1250 → "1250", -0 → "0". */
export function formatValue(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}

/** Geometry fingerprint used to skip redrawing unchanged rulers. */
export function signature(g: Geometry | null): string {
  if (!g) return '';
  const r = (n: number) => Math.round(n * 100) / 100;
  return [g.cw, g.ch, g.ox, g.oy, g.scale, g.fx, g.fy, g.fw, g.fh].map(r).join(',');
}

/**
 * Grid of the empty area: lines on the labelled ruler ticks (`major`) and,
 * when they are at least `minPx` apart on screen, finer lines (`minor`).
 */
export function gridStep(scale: number, minPx = 8): { major: number; minor: number } {
  const s = scale > 0 && isFinite(scale) ? scale : 1;
  const { major } = pickStep(s);
  for (const div of [5, 2]) {
    const minor = major / div;
    if (Number.isInteger(minor) && minor * s >= minPx) return { major, minor };
  }
  return { major, minor: major };
}

/** The closest values below and above `v` (null when there is none). */
export function neighbours(values: number[], v: number): { before: number | null; after: number | null } {
  let before: number | null = null;
  let after: number | null = null;
  values.forEach((x) => {
    if (!isFinite(x)) return;
    if (x < v && (before == null || x > before)) before = x;
    if (x > v && (after == null || x < after)) after = x;
  });
  return { before, after };
}
