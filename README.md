# grapesjs-ruler

A GrapesJS plugin that adds Photoshop-like **rulers** to the canvas:

- a horizontal and a vertical ruler in document pixels, following the canvas
  zoom and the page scroll; the document (frame) range is lighter, the empty
  area around a narrow tablet / mobile frame is darker and keeps counting
  (negative values to the left / above, larger values to the right);
- a **crosshair**: dashed lines that start at the rulers and follow the cursor
  over the canvas — over the page *and* over the empty area — with marks on
  the rulers and a `x 120  y 340` badge next to the cursor;
- **guides**: drag one out of a ruler (top ruler → horizontal guide, left ruler
  → vertical guide), drag to move (hold <kbd>Shift</kbd> to snap to the ruler
  ticks), drag back onto a ruler or double-click to remove, double-click the
  corner square to remove all. Guides can be placed in the empty area too.
  <kbd>Esc</kbd> cancels a drag;
- **distances** (Figma-like): while a guide is dragged, red measure lines
  with labels show the distance to the nearest parallel guide or page edge
  on each side (page edges: 0 and the frame width / the page height);
- a **grid** in the empty area around a narrow frame, aligned with the
  ruler ticks, plus a thin outline of the frame — so the empty area never
  blends with a page of the same colour. Click the corner square to switch
  it on/off;
- a toggle button (ruler icon) in the `options` panel. Visibility and guides
  are kept in `localStorage`.

While the rulers are shown, the frames area is moved out from under them, so
they never cover the page. GrapesJS' own highlighter, toolbar and badges stay
aligned (they are positioned from the frame's real box).

Works with plain GrapesJS (core zoom, Device Manager) and with
[grapesjs-sidebar-tools](https://www.npmjs.com/package/grapesjs-sidebar-tools)
2.1+ (device toolbar, zoom, workspace tabs).

## Install

```sh
npm i grapesjs-ruler
```

```js
import grapesjs from 'grapesjs';
import grapesjsRuler from 'grapesjs-ruler';

grapesjs.init({
  container: '#gjs',
  plugins: [(editor) => grapesjsRuler(editor, { /* options */ })],
});
```

UMD: `<script src="grapesjs-ruler.umd.cjs">` defines
`window.grapesjsRuler = { default: pluginFn, ... }`; pass
`grapesjsRuler.default` to `plugins`.

## Options

| Option | Default | |
| --- | --- | --- |
| `size` | `20` | Ruler thickness, px (12–48). |
| `visible` | `true` | Shown on the first start; later the last state is restored. |
| `crosshair` | `'full'` | `'full'` — lines across the whole canvas, `'cursor'` — from the ruler to the cursor, `false` — off. |
| `cursorLabel` | `true` | Coordinate badge next to the cursor. |
| `guides` | `true` | Dragging guides out of the rulers. |
| `distances` | `true` | Distances to the nearest guides / page edges while dragging a guide. |
| `grid` | `true` | Grid in the empty area (initial state; the corner toggles it and the last state is restored). |
| `button` | `{ panel: 'options', id: 'gjs-ruler' }` | Toggle button; `false` for none. |
| `keymap` | `false` | GrapesJS keymap for `ruler:toggle`, e.g. `'⌘+shift+h, ctrl+shift+h'`. |
| `storageKey` | `'gjs-ruler'` | `localStorage` key; `false` to keep nothing. |
| `labels` | — | Overrides of `toggle`, `corner`, `guide`, `ruler` (otherwise from `editor.I18n`: en, ru, uk). |

Colours are CSS variables on `.gjs-cv-canvas.gjs-ruler-on`:
`--gjs-ruler-bg`, `--gjs-ruler-doc-bg`, `--gjs-ruler-tick`, `--gjs-ruler-text`,
`--gjs-ruler-border`, `--gjs-ruler-cross`, `--gjs-ruler-guide`,
`--gjs-ruler-measure`, `--gjs-ruler-grid`, `--gjs-ruler-grid-major`,
`--gjs-ruler-frame`.

## Commands, events, API

- `ruler:show` — stateful (run = show, stop = hide; the button uses it);
  `ruler:toggle`; `ruler:clear-guides`; `ruler:toggle-grid`.
- Events: `ruler:toggle` `{ visible }`, `ruler:guides` `{ h, v }`, `ruler:grid` `{ grid }`.
- `editor.Ruler`: `show()`, `hide()`, `toggle(force?)`, `isVisible()`,
  `getGuides()` → `{ h: number[], v: number[] }` (document px; `h` are
  horizontal guides = y values), `setGuides({ h?, v? })`,
  `addGuide('h' | 'v', value)`, `removeGuide(axis, index)`, `clearGuides()`,
  `setGrid(on)`, `toggleGrid()`, `isGrid()`,
  `getGeometry()`, `clientToDoc(clientX, clientY)`, `refresh()`.

## Development

```sh
npm i
npm test          # vitest + jsdom, real grapesjs
npm run typecheck
npm run build     # dist/: ES + UMD + .d.ts
```


## Using it by name and changing options in the editor

This plugin follows the plugin contract of grapesjs-plugins-manager (its `docs/plugin-contract.md`): with the UMD bundle on the page it registers itself as `grapesjs-ruler`, so it can be listed like an official plugin —

```js
grapesjs.init({
  plugins: ['grapesjs-ruler'],
  pluginsOpts: { 'grapesjs-ruler': { crosshair: 'cursor' } },
});
```

— and grapesjs-plugins-manager shows a form of its options (⚙ in the plugin list); `crosshair`, `cursorLabel`, `distances` and `labels` change without a reload. The plugin function carries `meta` (id, version, option schema).

## License

MIT
