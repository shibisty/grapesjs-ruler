import { describe, expect, it } from 'vitest';
import { formatValue, pickStep, signature, snapValue, ticks, toDoc, toScreen, type Geometry } from '../src/scale';

const geo = (o: Partial<Geometry> = {}): Geometry => ({ cw: 1000, ch: 600, ox: 100, oy: 20, scale: 1, fx: 100, fy: 20, fw: 800, fh: 580, ...o });

describe('pickStep', () => {
  it('keeps labels at least 50px apart', () => {
    for (const s of [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8]) {
      const st = pickStep(s);
      expect(st.major * s).toBeGreaterThanOrEqual(50);
      expect(st.major % st.minor).toBe(0);
      expect(Number.isInteger(st.minor)).toBe(true);
    }
  });
  it('picks 50/5 at 100%, 100 at 50%, 200 at 25%', () => {
    expect(pickStep(1)).toEqual({ major: 50, minor: 5, div: 10 });
    expect(pickStep(0.5).major).toBe(100);
    expect(pickStep(0.25).major).toBe(200);
  });
  it('survives a broken scale', () => {
    expect(pickStep(0).major).toBe(50);
    expect(pickStep(NaN).major).toBe(50);
  });
});

describe('mapping', () => {
  it('round-trips screen and document px', () => {
    const g = geo({ ox: 130, oy: -40, scale: 0.5 });
    expect(toDoc(g, 'x', 130)).toBe(0);
    expect(toDoc(g, 'x', 180)).toBe(100);
    expect(toDoc(g, 'y', 0)).toBe(80);
    expect(toScreen(g, 'x', toDoc(g, 'x', 777))).toBeCloseTo(777);
  });
  it('gives negative values left of the frame (empty area)', () => {
    expect(toDoc(geo({ ox: 300 }), 'x', 250)).toBe(-50);
  });
});

describe('ticks', () => {
  it('marks major, mid and minor ticks', () => {
    const t = ticks(geo(), 'x', 100, 200);
    expect(t[0]).toMatchObject({ value: 0, kind: 'major', pos: 100 });
    expect(t.find((x) => x.value === 25)?.kind).toBe('mid');
    expect(t.find((x) => x.value === 5)?.kind).toBe('minor');
    expect(t.find((x) => x.value === 50)?.kind).toBe('major');
    expect(t[t.length - 1].value).toBe(100);
  });
  it('covers negative values', () => {
    const t = ticks(geo({ ox: 400 }), 'x', 300, 400);
    expect(t[0].value).toBe(-100);
    expect(t[0].kind).toBe('major');
  });
  it('follows the frame scroll', () => {
    const t = ticks(geo({ oy: 20 - 500 }), 'y', 20, 120);
    expect(t[0].value).toBe(500);
  });
});

describe('helpers', () => {
  it('snaps to the minor step with snap', () => {
    expect(snapValue(123.4, 1, false)).toBe(123);
    expect(snapValue(123.4, 1, true)).toBe(125);
  });
  it('formats values', () => {
    expect(formatValue(-0)).toBe('0');
    expect(formatValue(12.345)).toBe('12.35');
  });
  it('signature changes with geometry', () => {
    expect(signature(geo())).not.toBe(signature(geo({ scale: 0.5 })));
    expect(signature(null)).toBe('');
  });
});

import { gridStep, neighbours } from '../src/scale';

describe('grid and neighbours', () => {
  it('grid lines follow the ruler ticks', () => {
    expect(gridStep(1)).toEqual({ major: 50, minor: 10 });
    expect(gridStep(0.5)).toEqual({ major: 100, minor: 20 });
    expect(gridStep(0.1).minor * 0.1).toBeGreaterThanOrEqual(8);
  });
  it('finds the nearest values on both sides', () => {
    expect(neighbours([0, 100, 300, 800], 250)).toEqual({ before: 100, after: 300 });
    expect(neighbours([100], 50)).toEqual({ before: null, after: 100 });
    expect(neighbours([50, NaN], 50)).toEqual({ before: null, after: null });
  });
});
