import type { Editor } from 'grapesjs';
import { getLabels, registerMessages } from './i18n';
import { loadState, resolveOptions, saveState, type RulerOptions, type RulerState } from './options';
import { createRuler, type GuideAxis, type Guides, type RulerController } from './ruler';
import type { Geometry } from './scale';
import { ICON, injectStyles } from './styles';

export type { RulerOptions, RulerLabels, CrosshairMode, RulerButtonOptions } from './options';
export type { Guides, GuideAxis, RulerController } from './ruler';
export type { Geometry } from './scale';
export { pickStep, ticks, toDoc, toScreen } from './scale';

/** Stateful command: running it shows the rulers, stopping hides them. */
export const CMD_SHOW = 'ruler:show';
/** Flips the rulers. */
export const CMD_TOGGLE = 'ruler:toggle';
/** Removes all guides. */
export const CMD_CLEAR = 'ruler:clear-guides';
/** Grid in the empty area on/off. */
export const CMD_GRID = 'ruler:toggle-grid';
/** Editor events. */
export const EVENT_TOGGLE = 'ruler:toggle';
export const EVENT_GUIDES = 'ruler:guides';
export const EVENT_GRID = 'ruler:grid';

/** `editor.Ruler`. */
export interface RulerApi {
  show(): void;
  hide(): void;
  toggle(force?: boolean): void;
  isVisible(): boolean;
  getGuides(): Guides;
  setGuides(g: Partial<Guides>): void;
  addGuide(axis: GuideAxis, value: number): void;
  removeGuide(axis: GuideAxis, index: number): void;
  clearGuides(): void;
  /** Grid in the empty area around the page (tablet / mobile). */
  setGrid(on: boolean): void;
  toggleGrid(): void;
  isGrid(): boolean;
  /** Canvas geometry: document origin, zoom, frame box (canvas px). */
  getGeometry(): Geometry | null;
  /** Document coordinates under a client (viewport) point of the editor page. */
  clientToDoc(clientX: number, clientY: number): { x: number; y: number } | null;
  refresh(): void;
}

declare module 'grapesjs' {
  interface Editor {
    Ruler?: RulerApi;
  }
}

export default function grapesjsRuler(editor: Editor, options: RulerOptions = {}): void {
  const opts = resolveOptions(options);
  const state: RulerState = loadState(opts.storageKey, opts.visible, opts.grid);
  registerMessages(editor);
  const labels = () => getLabels(editor, opts.labels);

  let ctrl: RulerController | null = null;
  /** Visibility wanted before the canvas exists. */
  let pending = state.visible;

  const onChange = (s: RulerState, what: 'visible' | 'guides' | 'grid') => {
    saveState(opts.storageKey, s);
    if (what === 'visible') {
      editor.trigger(EVENT_TOGGLE, { visible: s.visible });
      syncButton(s.visible);
    } else if (what === 'grid') editor.trigger(EVENT_GRID, { grid: s.grid });
    else editor.trigger(EVENT_GUIDES, { h: s.h.slice(), v: s.v.slice() });
  };

  const setVisible = (v: boolean) => {
    pending = v;
    ctrl?.setVisible(v);
  };

  // ---- Commands -----------------------------------------------------------------

  const cmds = editor.Commands;
  cmds.add(CMD_SHOW, {
    run() {
      setVisible(true);
    },
    stop() {
      setVisible(false);
    },
  });
  const isShown = () => (ctrl ? ctrl.isVisible() : pending);
  const toggle = (force?: boolean) => {
    const v = typeof force === 'boolean' ? force : !isShown();
    if (v) editor.runCommand(CMD_SHOW);
    else editor.stopCommand(CMD_SHOW);
    // Commands may refuse (already active / inactive): enforce the state.
    setVisible(v);
  };
  cmds.add(CMD_TOGGLE, { run: () => toggle() });
  cmds.add(CMD_CLEAR, { run: () => ctrl?.clearGuides() });
  const setGrid = (on: boolean) => {
    if (ctrl) ctrl.setGrid(on);
    else {
      state.grid = !!on;
      saveState(opts.storageKey, state);
    }
  };
  cmds.add(CMD_GRID, { run: () => setGrid(!state.grid) });

  if (opts.keymap) {
    try {
      editor.Keymaps.add(CMD_TOGGLE, opts.keymap, CMD_TOGGLE);
    } catch {
      // ignore
    }
  }

  // ---- Button -------------------------------------------------------------------

  let syncing = false;
  const getButton = (): any => {
    if (!opts.button) return null;
    try {
      return editor.Panels.getButton(opts.button.panel, opts.button.id) || null;
    } catch {
      return null;
    }
  };

  function syncButton(v: boolean) {
    const b = getButton();
    if (!b || !!b.get('active') === v || syncing) return;
    syncing = true;
    try {
      // fromListen: only the button look changes, the command is not re-run.
      b.set('active', v, { fromListen: true });
    } finally {
      syncing = false;
    }
  }

  function addButton() {
    if (!opts.button) return;
    const { panel, id } = opts.button;
    const Panels = editor.Panels;
    if (!Panels.getPanel(panel)) return;
    if (Panels.getButton(panel, id)) return;
    Panels.addButton(panel, {
      id,
      label: ICON,
      command: CMD_SHOW,
      togglable: true,
      // Own context: activating it must not switch off other option buttons.
      context: 'gjs-ruler',
      active: false,
      attributes: { title: labels().toggle, 'data-tooltip-pos': 'bottom' },
    } as any);
  }

  // i18n:locale fires before the locale is switched.
  const updateButtonTitle = () =>
    setTimeout(() => {
      const b = getButton();
      if (b) b.set('attributes', { ...(b.get('attributes') || {}), title: labels().toggle });
    }, 0);
  editor.on('i18n:locale i18n:update', updateButtonTitle);

  // ---- Start --------------------------------------------------------------------

  const start = () => {
    if (ctrl) return;
    const canvasEl = (editor.Canvas as any).getElement?.() as HTMLElement | undefined;
    if (!canvasEl) return;
    injectStyles(canvasEl.ownerDocument);
    addButton();
    ctrl = createRuler({ editor, canvasEl, opts, state, getLabels: labels, onChange });
    if (pending) {
      const b = getButton();
      if (b) b.set('active', true); // runs CMD_SHOW
      else editor.runCommand(CMD_SHOW);
      ctrl.setVisible(true);
    } else {
      syncButton(false);
    }
  };

  editor.onReady(start);

  editor.on('destroy', () => {
    ctrl?.destroy();
    ctrl = null;
    editor.off('i18n:locale i18n:update', updateButtonTitle);
  });

  const api: RulerApi = {
    show: () => toggle(true),
    hide: () => toggle(false),
    toggle,
    isVisible: isShown,
    getGuides: () => (ctrl ? ctrl.getGuides() : { h: state.h.slice(), v: state.v.slice() }),
    setGuides: (g) => {
      if (ctrl) ctrl.setGuides(g);
      else {
        if (g.h) state.h = g.h.slice();
        if (g.v) state.v = g.v.slice();
        saveState(opts.storageKey, state);
      }
    },
    addGuide: (axis, value) => ctrl?.addGuide(axis, value),
    removeGuide: (axis, index) => ctrl?.removeGuide(axis, index),
    clearGuides: () => ctrl?.clearGuides(),
    setGrid,
    toggleGrid: () => setGrid(!state.grid),
    isGrid: () => state.grid,
    getGeometry: () => ctrl?.getGeometry() ?? null,
    clientToDoc: (x, y) => ctrl?.clientToDoc(x, y) ?? null,
    refresh: () => ctrl?.refresh(),
  };
  (editor as any).Ruler = api;
}
