import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from 'grapesjs';
import { CMD_SHOW, CMD_TOGGLE, EVENT_GUIDES, EVENT_TOGGLE } from '../src/index';
import { canvasEl, createEditor, destroyEditor, fakeLayout, frame, mouse } from './helpers/editor';

let editor: Editor | undefined;
afterEach(async () => {
  await destroyEditor(editor);
  editor = undefined;
});

const q = (sel: string) => canvasEl(editor!).querySelector<HTMLElement>(sel)!;
const shown = (e: HTMLElement) => e.style.display !== 'none';

describe('setup', () => {
  it('adds the rulers to the canvas, visible by default', async () => {
    editor = await createEditor();
    const c = canvasEl(editor);
    expect(c.classList.contains('gjs-ruler-on')).toBe(true);
    expect(q('.gjs-ruler').hidden).toBe(false);
    expect(q('.gjs-ruler__h')).toBeTruthy();
    expect(q('.gjs-ruler__v')).toBeTruthy();
    expect(c.style.getPropertyValue('--gjs-ruler-size')).toBe('20px');
    expect(document.getElementById('gjs-ruler-styles')).toBeTruthy();
    // lines sit right after the frames area, below GrapesJS tools
    expect(q('.gjs-cv-canvas__frames').nextElementSibling?.classList.contains('gjs-ruler-lines')).toBe(true);
    expect(editor.Commands.isActive(CMD_SHOW)).toBe(true);
  });

  it('adds an active toggle button with its own context', async () => {
    editor = await createEditor();
    const b = editor.Panels.getButton('options', 'gjs-ruler')!;
    expect(b).toBeTruthy();
    expect(b.get('active')).toBe(true);
    expect(b.get('context')).toBe('gjs-ruler');
    // other option buttons are not switched off
    expect(editor.Panels.getButton('options', 'sw-visibility')!.get('active')).toBe(true);
  });

  it('works without the options panel', async () => {
    editor = await createEditor({}, false);
    expect(editor.Ruler!.isVisible()).toBe(true);
    expect(editor.Panels.getButton('options', 'gjs-ruler')).toBeFalsy();
  });

  it('respects visible:false and size', async () => {
    editor = await createEditor({ visible: false, size: 24 });
    expect(canvasEl(editor).classList.contains('gjs-ruler-on')).toBe(false);
    expect(q('.gjs-ruler').hidden).toBe(true);
    expect(editor.Panels.getButton('options', 'gjs-ruler')!.get('active')).toBe(false);
    expect(canvasEl(editor).style.getPropertyValue('--gjs-ruler-size')).toBe('24px');
  });
});

describe('toggling', () => {
  it('button, command and API stay in sync', async () => {
    editor = await createEditor();
    const events: boolean[] = [];
    editor.on(EVENT_TOGGLE, (e: { visible: boolean }) => events.push(e.visible));
    const b = editor.Panels.getButton('options', 'gjs-ruler')!;

    b.set('active', false); // like a click
    expect(editor.Ruler!.isVisible()).toBe(false);
    expect(canvasEl(editor).classList.contains('gjs-ruler-on')).toBe(false);

    editor.runCommand(CMD_TOGGLE);
    expect(editor.Ruler!.isVisible()).toBe(true);
    expect(b.get('active')).toBe(true);

    editor.Ruler!.hide();
    expect(b.get('active')).toBe(false);
    expect(editor.Commands.isActive(CMD_SHOW)).toBe(false);
    editor.Ruler!.show();
    expect(editor.Commands.isActive(CMD_SHOW)).toBe(true);
    expect(events).toEqual([false, true, false, true]);
  });

  it('remembers visibility', async () => {
    editor = await createEditor();
    editor.Ruler!.hide();
    await destroyEditor(editor);
    editor = await createEditor();
    expect(editor.Ruler!.isVisible()).toBe(false);
  });

  it('cleans up on destroy', async () => {
    editor = await createEditor();
    const c = canvasEl(editor);
    editor.destroy();
    await new Promise((r) => setTimeout(r, 450));
    expect(c.querySelector('.gjs-ruler')).toBeNull();
    expect(c.classList.contains('gjs-ruler-on')).toBe(false);
    editor = undefined;
  });
});

describe('guides API', () => {
  it('adds, removes and persists guides', async () => {
    editor = await createEditor();
    const seen: unknown[] = [];
    editor.on(EVENT_GUIDES, (g: unknown) => seen.push(g));
    editor.Ruler!.addGuide('h', 100);
    editor.Ruler!.addGuide('v', 40.123);
    expect(editor.Ruler!.getGuides()).toEqual({ h: [100], v: [40.12] });
    expect(JSON.parse(localStorage.getItem('gjs-ruler')!)).toMatchObject({ h: [100], v: [40.12] });
    editor.Ruler!.removeGuide('h', 0);
    expect(editor.Ruler!.getGuides().h).toEqual([]);
    editor.runCommand('ruler:clear-guides');
    expect(editor.Ruler!.getGuides()).toEqual({ h: [], v: [] });
    expect(seen.length).toBe(4);
  });
});

describe('with a layout', () => {
  // Canvas 1000×600 at (50, 40); a 400px wide (tablet-like) frame centred
  // in the frames area right of / below the 20px rulers.
  const layout = { cx: 50, cy: 40, cw: 1000, ch: 600, fx: 320, fy: 20, fw: 400, fh: 580 };

  it('draws the crosshair over the empty area, with document coords', async () => {
    editor = await createEditor();
    fakeLayout(editor, layout);
    // 100px left of the frame (empty area)
    mouse(canvasEl(editor), 'mousemove', 50 + 220, 40 + 120);
    await frame();
    const h = q('.gjs-ruler__cross--h');
    const v = q('.gjs-ruler__cross--v');
    expect(shown(h) && shown(v)).toBe(true);
    expect(h.style.top).toBe('100px'); // 120 - ruler
    expect(h.style.width).toBe('980px'); // full
    expect(v.style.left).toBe('200px');
    expect(v.style.height).toBe('580px');
    expect(q('.gjs-ruler__badge').textContent).toBe('x -100  y 100');
    expect(q('.gjs-ruler__mark--x').style.left).toBe('220px');
    expect(q('.gjs-ruler__mark--y').style.top).toBe('120px');

    mouse(canvasEl(editor), 'mouseleave', 0, 0);
    await frame();
    expect(shown(h)).toBe(false);
  });

  it('crosshair "cursor" mode grows from the rulers to the cursor', async () => {
    editor = await createEditor({ crosshair: 'cursor' });
    fakeLayout(editor, layout);
    mouse(canvasEl(editor), 'mousemove', 50 + 400, 40 + 300);
    await frame();
    expect(q('.gjs-ruler__cross--h').style.width).toBe('380px');
    expect(q('.gjs-ruler__cross--v').style.height).toBe('280px');
  });

  it('maps the cursor inside the zoomed frame', async () => {
    editor = await createEditor();
    fakeLayout(editor, { ...layout, scale: 0.5 });
    const doc = editor.Canvas.getFrameEl().contentDocument!;
    await frame(); // binds the frame listeners
    mouse(doc, 'mousemove', 100, 60); // frame px
    await frame();
    // canvas px = frame corner + 0.5 * frame px
    expect(q('.gjs-ruler__cross--v').style.left).toBe(`${320 + 50 - 20}px`);
    expect(q('.gjs-ruler__badge').textContent).toBe('x 100  y 60');
  });

  it('hides the crosshair over the rulers but keeps the mark', async () => {
    editor = await createEditor();
    fakeLayout(editor, layout);
    mouse(canvasEl(editor), 'mousemove', 50 + 500, 40 + 5);
    await frame();
    expect(shown(q('.gjs-ruler__cross--h'))).toBe(false);
    expect(shown(q('.gjs-ruler__mark--x'))).toBe(true);
    expect(shown(q('.gjs-ruler__mark--y'))).toBe(false);
  });

  it('drags a guide out of the top ruler, moves it and drops it back', async () => {
    editor = await createEditor();
    fakeLayout(editor, layout);
    await frame();
    const top = q('.gjs-ruler__h');
    mouse(top, 'pointerdown', 50 + 500, 40 + 10);
    mouse(window, 'pointermove', 50 + 500, 40 + 150);
    await frame();
    expect(document.querySelector('.gjs-ruler__shield')).toBeTruthy();
    expect(q('.gjs-ruler__badge').textContent).toBe('y 130');
    mouse(window, 'pointerup', 50 + 500, 40 + 150);
    expect(editor.Ruler!.getGuides().h).toEqual([130]);
    expect(document.querySelector('.gjs-ruler__shield')).toBeNull();
    await frame();
    const g = q('.gjs-ruler__guide--h');
    expect(g.style.top).toBe('130px');

    // move it
    mouse(g, 'pointerdown', 50 + 500, 40 + 150);
    mouse(window, 'pointermove', 50 + 500, 40 + 220);
    mouse(window, 'pointerup', 50 + 500, 40 + 220);
    expect(editor.Ruler!.getGuides().h).toEqual([200]);

    // back onto the ruler removes it
    await frame();
    const g2 = q('.gjs-ruler__guide--h');
    mouse(g2, 'pointerdown', 50 + 500, 40 + 220);
    mouse(window, 'pointermove', 50 + 500, 40 + 8);
    mouse(window, 'pointerup', 50 + 500, 40 + 8);
    expect(editor.Ruler!.getGuides().h).toEqual([]);
  });

  it('vertical guides go into the empty area too; Escape cancels', async () => {
    editor = await createEditor();
    fakeLayout(editor, layout);
    await frame();
    const left = q('.gjs-ruler__v');
    mouse(left, 'pointerdown', 50 + 10, 40 + 300);
    mouse(window, 'pointermove', 50 + 120, 40 + 300);
    mouse(window, 'pointerup', 50 + 120, 40 + 300);
    expect(editor.Ruler!.getGuides().v).toEqual([-200]);

    mouse(left, 'pointerdown', 50 + 10, 40 + 300);
    mouse(window, 'pointermove', 50 + 600, 40 + 300);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    mouse(window, 'pointerup', 50 + 600, 40 + 300);
    expect(editor.Ruler!.getGuides().v).toEqual([-200]);
  });

  it('a click on a ruler without moving adds nothing; guides:false disables dragging', async () => {
    editor = await createEditor();
    fakeLayout(editor, layout);
    mouse(q('.gjs-ruler__h'), 'pointerdown', 550, 50);
    mouse(window, 'pointerup', 551, 50);
    expect(editor.Ruler!.getGuides().h).toEqual([]);
    await destroyEditor(editor);

    editor = await createEditor({ guides: false });
    fakeLayout(editor, layout);
    mouse(q('.gjs-ruler__h'), 'pointerdown', 550, 50);
    mouse(window, 'pointermove', 550, 300);
    mouse(window, 'pointerup', 550, 300);
    expect(editor.Ruler!.getGuides().h).toEqual([]);
  });

  it('double-click removes a guide, double-click on the corner clears all', async () => {
    editor = await createEditor();
    fakeLayout(editor, layout);
    editor.Ruler!.setGuides({ h: [10, 20], v: [30] });
    await frame();
    const gs = canvasEl(editor).querySelectorAll<HTMLElement>('.gjs-ruler__guide--h:not(.gjs-ruler__guide--drag)');
    expect(gs.length).toBe(2);
    gs[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(editor.Ruler!.getGuides()).toEqual({ h: [20], v: [30] });
    q('.gjs-ruler__corner').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(editor.Ruler!.getGuides()).toEqual({ h: [], v: [] });
  });

  it('clientToDoc converts page points', async () => {
    editor = await createEditor();
    fakeLayout(editor, { ...layout, scale: 2 });
    expect(editor.Ruler!.clientToDoc(50 + 320 + 40, 40 + 20 + 10)).toEqual({ x: 20, y: 5 });
  });
});

describe('i18n', () => {
  it('uses the editor locale', async () => {
    editor = await createEditor();
    editor.I18n.setLocale('ru');
    await frame();
    expect(q('.gjs-ruler__corner').title).toMatch(/направляющие/);
    const b = editor.Panels.getButton('options', 'gjs-ruler')!;
    expect(b.get('attributes').title).toBe('Линейки');
  });
});

describe('distances while dragging a guide', () => {
  const layout = { cx: 50, cy: 40, cw: 1000, ch: 600, fx: 320, fy: 20, fw: 400, fh: 580 };
  const dists = () =>
    Array.from(canvasEl(editor!).querySelectorAll<HTMLElement>('.gjs-ruler__dist')).filter((d) => d.style.display !== 'none');

  it('measures to the nearest guides on both sides', async () => {
    editor = await createEditor();
    fakeLayout(editor, layout);
    editor.Ruler!.setGuides({ h: [100, 300, 50], v: [10] });
    await frame();
    mouse(q('.gjs-ruler__h'), 'pointerdown', 50 + 500, 40 + 10);
    mouse(window, 'pointermove', 50 + 500, 40 + 20 + 180); // y 180
    await frame();
    const d = dists();
    expect(d.map((x) => x.querySelector('.gjs-ruler__dist-label')!.textContent)).toEqual(['80', '120']);
    expect(d[0].classList.contains('gjs-ruler__dist--v')).toBe(true);
    expect(d[0].style.left).toBe('480px'); // through the cursor
    expect(d[0].style.top).toBe('100px'); // y 100 → canvas 120 → lines 100
    expect(d[0].style.height).toBe('80px');
    mouse(window, 'pointerup', 50 + 500, 40 + 200);
    await frame();
    expect(dists().length).toBe(0);
  });

  it('measures a moved vertical guide to the page edges, ignoring itself', async () => {
    editor = await createEditor();
    fakeLayout(editor, layout);
    editor.Ruler!.setGuides({ v: [100] });
    await frame();
    const g = q('.gjs-ruler__guide--v');
    mouse(g, 'pointerdown', 50 + 420, 40 + 300);
    mouse(window, 'pointermove', 50 + 320 + 150, 40 + 300); // x 150
    await frame();
    const d = dists();
    // page left edge 0 and right edge = frame width 400
    expect(d.map((x) => x.querySelector('.gjs-ruler__dist-label')!.textContent)).toEqual(['150', '250']);
    expect(d[1].classList.contains('gjs-ruler__dist--h')).toBe(true);
    expect(d[1].style.top).toBe('280px');
    mouse(window, 'pointerup', 50 + 470, 40 + 300);
  });

  it('only one side in the empty area; none with distances:false', async () => {
    editor = await createEditor();
    fakeLayout(editor, layout);
    await frame();
    mouse(q('.gjs-ruler__v'), 'pointerdown', 50 + 10, 40 + 300);
    mouse(window, 'pointermove', 50 + 220, 40 + 300); // x -100
    await frame();
    expect(dists().map((x) => x.textContent)).toEqual(['100']);
    mouse(window, 'pointerup', 50 + 220, 40 + 300);
    await destroyEditor(editor);

    editor = await createEditor({ distances: false });
    fakeLayout(editor, layout);
    await frame();
    mouse(q('.gjs-ruler__v'), 'pointerdown', 50 + 10, 40 + 300);
    mouse(window, 'pointermove', 50 + 220, 40 + 300);
    await frame();
    expect(dists().length).toBe(0);
    mouse(window, 'pointerup', 50 + 220, 40 + 300);
  });
});

describe('grid of the empty area', () => {
  const layout = { cx: 0, cy: 0, cw: 1000, ch: 600, fx: 320, fy: 20, fw: 400, fh: 580 };

  it('is on by default; the corner click toggles and remembers it', async () => {
    editor = await createEditor();
    fakeLayout(editor, layout);
    await frame();
    const grid = q('.gjs-ruler__grid');
    expect(grid.parentElement!.firstElementChild).toBe(grid);
    expect(grid.style.display).toBe('');
    expect(grid.style.width).toBe('980px');
    expect(editor.Ruler!.isGrid()).toBe(true);
    const seen: boolean[] = [];
    editor.on('ruler:grid', (e: { grid: boolean }) => seen.push(e.grid));

    q('.gjs-ruler__corner').click();
    await new Promise((r) => setTimeout(r, 300));
    await frame();
    expect(editor.Ruler!.isGrid()).toBe(false);
    expect(grid.style.display).toBe('none');
    expect(JSON.parse(localStorage.getItem('gjs-ruler')!).grid).toBe(false);

    editor.runCommand('ruler:toggle-grid');
    expect(editor.Ruler!.isGrid()).toBe(true);
    expect(seen).toEqual([false, true]);
  });

  it('a double-click on the corner clears guides without toggling the grid', async () => {
    editor = await createEditor();
    editor.Ruler!.setGuides({ h: [5] });
    const c = q('.gjs-ruler__corner');
    c.click();
    c.click();
    c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    expect(editor.Ruler!.isGrid()).toBe(true);
    expect(editor.Ruler!.getGuides().h).toEqual([]);
  });

  it('grid:false starts without it', async () => {
    editor = await createEditor({ grid: false });
    fakeLayout(editor, layout);
    await frame();
    expect(editor.Ruler!.isGrid()).toBe(false);
    expect(q('.gjs-ruler__grid').style.display).toBe('none');
  });
});
