import { describe, expect, it } from 'vitest';
import { loadState, resolveOptions, saveState } from '../src/options';

describe('resolveOptions', () => {
  it('has defaults', () => {
    expect(resolveOptions()).toMatchObject({
      size: 20,
      visible: true,
      crosshair: 'full',
      cursorLabel: true,
      guides: true,
      grid: true,
      distances: true,
      button: { panel: 'options', id: 'gjs-ruler' },
      keymap: false,
      storageKey: 'gjs-ruler',
    });
  });
  it('validates values', () => {
    const o = resolveOptions({ size: 2, crosshair: 'cursor', button: false, storageKey: false, keymap: 'ctrl+shift+r' });
    expect(o.size).toBe(20);
    expect(o.crosshair).toBe('cursor');
    expect(o.button).toBe(false);
    expect(o.storageKey).toBe(false);
    expect(o.keymap).toBe('ctrl+shift+r');
    expect(resolveOptions({ crosshair: false }).crosshair).toBe(false);
  });
});

describe('state', () => {
  it('round-trips through localStorage', () => {
    saveState('k', { visible: false, grid: false, h: [10, 20.555], v: [5] });
    expect(loadState('k', true)).toEqual({ visible: false, grid: false, h: [10, 20.56], v: [5] });
  });
  it('falls back on garbage', () => {
    localStorage.setItem('k', '{oops');
    expect(loadState('k', true)).toEqual({ visible: true, grid: true, h: [], v: [] });
    localStorage.setItem('k', JSON.stringify({ h: ['x', 3] }));
    expect(loadState('k', false, false)).toEqual({ visible: false, grid: false, h: [3], v: [] });
    expect(loadState(false, true).visible).toBe(true);
  });
});
