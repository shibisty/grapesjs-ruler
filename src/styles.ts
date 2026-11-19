export const STYLE_ID = 'gjs-ruler-styles';

/**
 * Colours are CSS variables, so a site can restyle the rulers:
 * --gjs-ruler-bg, --gjs-ruler-doc-bg, --gjs-ruler-tick, --gjs-ruler-text,
 * --gjs-ruler-border, --gjs-ruler-cross, --gjs-ruler-guide.
 *
 * With the rulers on, the frames area is moved out from under them
 * (top/left = ruler size), so they never cover the page. The second rule
 * keeps that right with grapesjs-sidebar-tools' zoom, which sizes the
 * frames area as 100% / zoom.
 */
export const CSS = [
  '.gjs-cv-canvas.gjs-ruler-on{--gjs-ruler-bg:#2f2f33;--gjs-ruler-doc-bg:#45454b;--gjs-ruler-tick:#8d8d96;--gjs-ruler-text:#c9c9d1;--gjs-ruler-border:rgba(0,0,0,.45);--gjs-ruler-cross:rgba(255,72,120,.85);--gjs-ruler-guide:#1ec8f0;--gjs-ruler-measure:#f24822;--gjs-ruler-grid:rgba(255,255,255,.05);--gjs-ruler-grid-major:rgba(255,255,255,.11);--gjs-ruler-frame:rgba(255,255,255,.22);}',
  '.gjs-cv-canvas.gjs-ruler-on .gjs-cv-canvas__frames{top:var(--gjs-ruler-size,20px);left:var(--gjs-ruler-size,20px);width:calc(100% - var(--gjs-ruler-size,20px));height:calc(100% - var(--gjs-ruler-size,20px));}',
  '.gjs-st-zoomed .gjs-cv-canvas.gjs-ruler-on .gjs-cv-canvas__frames{width:calc((100% - var(--gjs-ruler-size,20px)) / var(--gjs-st-zoom, 1)) !important;height:calc((100% - var(--gjs-ruler-size,20px)) / var(--gjs-st-zoom, 1)) !important;}',
  // Rulers (above GrapesJS tools) and lines (below them).
  '.gjs-ruler{position:absolute;inset:0;pointer-events:none;z-index:4;overflow:hidden;font:9px/1 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;user-select:none;}',
  '.gjs-ruler-lines{position:absolute;pointer-events:none;z-index:1;overflow:hidden;}',
  '.gjs-ruler[hidden],.gjs-ruler-lines[hidden]{display:none;}',
  '.gjs-ruler__h,.gjs-ruler__v{position:absolute;display:block;pointer-events:auto;background:var(--gjs-ruler-bg);}',
  '.gjs-ruler__h{top:0;cursor:row-resize;}',
  '.gjs-ruler__v{left:0;cursor:col-resize;}',
  '.gjs-ruler--noguides .gjs-ruler__h,.gjs-ruler--noguides .gjs-ruler__v{cursor:default;}',
  '.gjs-ruler__corner{position:absolute;top:0;left:0;pointer-events:auto;background:var(--gjs-ruler-bg);box-shadow:inset -1px -1px 0 var(--gjs-ruler-border);display:flex;align-items:center;justify-content:center;color:var(--gjs-ruler-text);font-size:8px;opacity:.9;}',
  '.gjs-ruler__mark{position:absolute;background:var(--gjs-ruler-cross);pointer-events:none;}',
  '.gjs-ruler__mark--x{top:0;width:1px;}',
  '.gjs-ruler__mark--y{left:0;height:1px;}',
  '.gjs-ruler__cross{position:absolute;pointer-events:none;}',
  '.gjs-ruler__cross--h{height:0;border-top:1px dashed var(--gjs-ruler-cross);}',
  '.gjs-ruler__cross--v{width:0;border-left:1px dashed var(--gjs-ruler-cross);}',
  '.gjs-ruler__badge{position:absolute;pointer-events:none;padding:2px 4px;border-radius:2px;background:rgba(20,20,24,.85);color:#fff;font:10px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:nowrap;z-index:2;}',
  '.gjs-ruler__guide{position:absolute;pointer-events:auto;}',
  '.gjs-ruler__guide::after{content:"";position:absolute;background:var(--gjs-ruler-guide);}',
  '.gjs-ruler__guide--h{left:0;right:0;height:7px;margin-top:-3px;cursor:row-resize;}',
  '.gjs-ruler__guide--h::after{left:0;right:0;top:3px;height:1px;}',
  '.gjs-ruler__guide--v{top:0;bottom:0;width:7px;margin-left:-3px;cursor:col-resize;}',
  '.gjs-ruler__guide--v::after{top:0;bottom:0;left:3px;width:1px;}',
  '.gjs-ruler__guide--drag::after{background:var(--gjs-ruler-cross);}',
  '.gjs-ruler__guide--out{opacity:.35;}',
  '.gjs-ruler__grid{position:absolute;left:0;top:0;pointer-events:none;}',
  // Figma-like distances of a dragged guide.
  '.gjs-ruler__dist{position:absolute;pointer-events:none;z-index:2;}',
  '.gjs-ruler__dist--v{width:0;border-left:1px solid var(--gjs-ruler-measure);}',
  '.gjs-ruler__dist--h{height:0;border-top:1px solid var(--gjs-ruler-measure);}',
  '.gjs-ruler__dist::before,.gjs-ruler__dist::after{content:"";position:absolute;background:var(--gjs-ruler-measure);}',
  '.gjs-ruler__dist--v::before,.gjs-ruler__dist--v::after{left:-4px;width:7px;height:1px;}',
  '.gjs-ruler__dist--v::before{top:0;}',
  '.gjs-ruler__dist--v::after{bottom:0;}',
  '.gjs-ruler__dist--h::before,.gjs-ruler__dist--h::after{top:-4px;width:1px;height:7px;}',
  '.gjs-ruler__dist--h::before{left:0;}',
  '.gjs-ruler__dist--h::after{right:0;}',
  '.gjs-ruler__dist-label{position:absolute;padding:1px 4px;border-radius:2px;background:var(--gjs-ruler-measure);color:#fff;font:10px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:nowrap;transform:translate(-50%,-50%);}',
  '.gjs-ruler__dist--v .gjs-ruler__dist-label{left:0;top:50%;}',
  '.gjs-ruler__dist--h .gjs-ruler__dist-label{left:50%;top:0;}',
  '.gjs-ruler__shield{position:fixed;inset:0;z-index:2147483646;pointer-events:auto;}',
].join('\n');

export function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const st = doc.createElement('style');
  st.id = STYLE_ID;
  st.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(st);
}

/** Ruler icon for the toggle button (24×24, currentColor). */
export const ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" style="display:block;margin:auto"><path d="M3 3h18v5H8v13H3z"/><path d="M10.5 3v2.4M14 3v3M17.5 3v2.4M3 10.5h2.4M3 14h3M3 17.5h2.4"/></svg>';
