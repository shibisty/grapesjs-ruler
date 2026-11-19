import grapesjs, { type Editor } from 'grapesjs';
import rulerPlugin from '../../src/index';
import type { RulerOptions } from '../../src/options';

export async function createEditor(opts: RulerOptions = {}, withOptionsPanel = true): Promise<Editor> {
  const container = document.createElement('div');
  container.id = 'gjs';
  document.body.append(container);
  const editor = grapesjs.init({
    container,
    height: '600px',
    storageManager: false,
    telemetry: false,
    panels: { defaults: withOptionsPanel ? [{ id: 'options', buttons: [{ id: 'sw-visibility', command: 'sw-visibility', active: true }] }] : [] },
    components: '<div id="box" style="height:2000px">Box</div>',
    plugins: [(ed: Editor) => rulerPlugin(ed, opts)],
  } as Parameters<typeof grapesjs.init>[0]);
  await new Promise<void>((resolve) => editor.onReady(() => resolve()));
  return editor;
}

export async function destroyEditor(editor: Editor | undefined): Promise<void> {
  if (!editor) return;
  await new Promise((r) => setTimeout(r, 10));
  try {
    editor.destroy();
  } catch {
    /* jsdom teardown noise */
  }
  document.body.innerHTML = '';
}

/** Waits for the ruler's next animation frame (setTimeout fallback in jsdom). */
export const frame = (): Promise<void> => new Promise((r) => setTimeout(r, 40));

export function canvasEl(editor: Editor): HTMLElement {
  return (editor.Canvas as any).getElement();
}

const rect = (x: number, y: number, w: number, h: number) =>
  ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} }) as DOMRect;

/**
 * Fakes a layout: canvas at (cx, cy) of cw × ch; frame of fw × fh (unscaled)
 * at (fx, fy) inside the canvas, drawn at `scale`.
 */
export function fakeLayout(
  editor: Editor,
  l: { cx?: number; cy?: number; cw: number; ch: number; fx: number; fy: number; fw: number; fh: number; scale?: number },
): void {
  const c = canvasEl(editor);
  const f = editor.Canvas.getFrameEl() as HTMLIFrameElement;
  const s = l.scale ?? 1;
  const cx = l.cx ?? 0;
  const cy = l.cy ?? 0;
  c.getBoundingClientRect = () => rect(cx, cy, l.cw, l.ch);
  Object.defineProperty(c, 'clientWidth', { configurable: true, get: () => l.cw });
  Object.defineProperty(c, 'clientHeight', { configurable: true, get: () => l.ch });
  f.getBoundingClientRect = () => rect(cx + l.fx, cy + l.fy, l.fw * s, l.fh * s);
  Object.defineProperty(f, 'offsetWidth', { configurable: true, get: () => l.fw });
  Object.defineProperty(f, 'offsetHeight', { configurable: true, get: () => l.fh });
}

export function mouse(target: EventTarget, type: string, x: number, y: number, extra: Record<string, unknown> = {}): void {
  const view = ((target as Node).ownerDocument?.defaultView || (target as Window)) as Window & typeof globalThis;
  const Ctor = (view && view.MouseEvent) || MouseEvent;
  const ev = new Ctor(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  target.dispatchEvent(ev);
}
