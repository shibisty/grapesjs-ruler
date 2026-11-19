export type CrosshairMode = 'full' | 'cursor' | false;

export interface RulerLabels {
  /** Tooltip of the toggle button. */
  toggle: string;
  /** Tooltip of the corner square. */
  corner: string;
  /** Tooltip of the corner while the grid is on (click switches it off). */
  cornerGridOn: string;
  /** Tooltip of a guide. */
  guide: string;
  /** Tooltip of the rulers. */
  ruler: string;
}

export interface RulerButtonOptions {
  /** Panel to put the toggle button in. Default `'options'`. */
  panel?: string;
  /** Button id. Default `'gjs-ruler'`. */
  id?: string;
}

export interface RulerOptions {
  /** Ruler thickness in px. Default 20. */
  size?: number;
  /** Rulers shown on first start (later the last state is restored). Default true. */
  visible?: boolean;
  /**
   * Lines that follow the cursor over the canvas, starting at the rulers:
   * `'full'` across the whole canvas, `'cursor'` from the ruler to the
   * cursor, `false` off. Default `'full'`.
   */
  crosshair?: CrosshairMode;
  /** Badge with the document coordinates next to the cursor. Default true. */
  cursorLabel?: boolean;
  /** Drag guides out of the rulers (drag back onto a ruler or double-click to remove). Default true. */
  guides?: boolean;
  /**
   * Grid in the empty area around the frame (tablet / mobile), so it never
   * blends with a page of the same colour. Initial state; the corner square
   * toggles it and the last state is restored. Default true.
   */
  grid?: boolean;
  /** While a guide is dragged, show the distances to the nearest guides and page edges. Default true. */
  distances?: boolean;
  /** Toggle button; `false` for none. Default `{ panel: 'options', id: 'gjs-ruler' }`. */
  button?: RulerButtonOptions | false;
  /** GrapesJS keymap to toggle the rulers, e.g. `'⌘+shift+r, ctrl+shift+r'`. Default none. */
  keymap?: string | false;
  /** localStorage key for visibility and guides; `false` to keep nothing. Default `'gjs-ruler'`. */
  storageKey?: string | false;
  /** Label overrides (otherwise taken from editor.I18n: en/ru/uk). */
  labels?: Partial<RulerLabels>;
}

export interface ResolvedOptions {
  size: number;
  visible: boolean;
  crosshair: CrosshairMode;
  cursorLabel: boolean;
  guides: boolean;
  grid: boolean;
  distances: boolean;
  button: Required<RulerButtonOptions> | false;
  keymap: string | false;
  storageKey: string | false;
  labels: Partial<RulerLabels>;
}

export function resolveOptions(o: RulerOptions = {}): ResolvedOptions {
  const size = Number(o.size);
  const crosshair: CrosshairMode = o.crosshair === false ? false : o.crosshair === 'cursor' ? 'cursor' : 'full';
  return {
    size: isFinite(size) && size >= 12 && size <= 48 ? Math.round(size) : 20,
    visible: o.visible !== false,
    crosshair,
    cursorLabel: o.cursorLabel !== false,
    guides: o.guides !== false,
    grid: o.grid !== false,
    distances: o.distances !== false,
    button:
      o.button === false
        ? false
        : { panel: (o.button && o.button.panel) || 'options', id: (o.button && o.button.id) || 'gjs-ruler' },
    keymap: typeof o.keymap === 'string' && o.keymap.trim() ? o.keymap : false,
    storageKey: o.storageKey === false ? false : typeof o.storageKey === 'string' && o.storageKey ? o.storageKey : 'gjs-ruler',
    labels: o.labels || {},
  };
}

/** Saved state. */
export interface RulerState {
  visible: boolean;
  /** Grid in the empty area. */
  grid: boolean;
  /** Horizontal guides (document y). */
  h: number[];
  /** Vertical guides (document x). */
  v: number[];
}

const cleanList = (a: unknown): number[] =>
  Array.isArray(a) ? a.map(Number).filter((n) => isFinite(n)).map((n) => Math.round(n * 100) / 100).slice(0, 200) : [];

export function loadState(key: string | false, visibleDefault: boolean, gridDefault = true): RulerState {
  const fallback: RulerState = { visible: visibleDefault, grid: gridDefault, h: [], v: [] };
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const s = JSON.parse(raw);
    return {
      visible: typeof s?.visible === 'boolean' ? s.visible : visibleDefault,
      grid: typeof s?.grid === 'boolean' ? s.grid : gridDefault,
      h: cleanList(s?.h),
      v: cleanList(s?.v),
    };
  } catch {
    return fallback;
  }
}

export function saveState(key: string | false, s: RulerState): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({ visible: s.visible, grid: s.grid, h: s.h, v: s.v }));
  } catch {
    // storage full / disabled
  }
}
