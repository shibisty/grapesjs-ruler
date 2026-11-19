import { afterEach } from 'vitest';

/*
 * jsdom quirk: GrapesJS renders the canvas from the iframe's `onload`
 * handler, and that render makes jsdom re-dispatch `load` on the same
 * iframe again and again. A real browser fires it once.
 */
Object.defineProperty(HTMLIFrameElement.prototype, 'onload', {
  configurable: true,
  get(this: HTMLIFrameElement & { __gjsOnload?: EventListener | null }) {
    return this.__gjsOnload || null;
  },
  set(this: HTMLIFrameElement & { __gjsOnload?: EventListener | null; __gjsOnloadBound?: boolean }, fn: EventListener | null) {
    this.__gjsOnload = fn;
    if (this.__gjsOnloadBound) return;
    this.__gjsOnloadBound = true;
    let done = false;
    this.addEventListener('load', (e) => {
      if (done || !this.__gjsOnload) return;
      done = true;
      this.__gjsOnload.call(this, e);
    });
  },
});

// jsdom has no 2D canvas (it would log "not implemented" on every draw).
HTMLCanvasElement.prototype.getContext = function getContext() {
  return null;
} as any;

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}

afterEach(() => {
  document.body.innerHTML = '';
  document.getElementById('gjs-ruler-styles')?.remove();
  localStorage.clear();
});
