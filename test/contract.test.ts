import { afterEach, describe, expect, it } from 'vitest';
import grapesjs, { type Editor } from 'grapesjs';
import plugin, { META, VERSION } from '../src/index';
import { CONTROLS, definePlugin, type PluginControl } from '../src/contract';
import { createEditor, destroyEditor } from './helpers/editor';
import pkg from '../package.json';

const control = (ed: object): PluginControl => (ed as Record<symbol, Map<string, PluginControl>>)[CONTROLS].get(META.id)!;
let editor: Editor | undefined;
afterEach(async () => {
  await destroyEditor(editor);
  editor = undefined;
  document.body.innerHTML = '';
});

describe('plugin contract', () => {
  it('meta: id = npm name, version = package.json, registered by id', () => {
    expect(META.id).toBe(pkg.name);
    expect(VERSION).toBe(pkg.version);
    expect((plugin as unknown as { meta: unknown }).meta).toBe(META);
    (globalThis as { grapesjs?: unknown }).grapesjs = grapesjs;
    definePlugin(plugin, META);
    expect(grapesjs.plugins.get(META.id)).toBe(plugin);
  });

  it('crosshair, badge and distances apply live; the rest after a reload', async () => {
    editor = await createEditor({ storageKey: false });
    const c = control(editor);
    expect(c.getOptions()).toMatchObject({ crosshair: 'full', cursorLabel: true, size: 20, storageKey: '' });
    expect(c.setOptions({ crosshair: 'cursor', cursorLabel: false, size: 30 })).toEqual({ applied: ['crosshair', 'cursorLabel'], reload: ['size'] });
    expect(c.getOptions()).toMatchObject({ crosshair: 'cursor', cursorLabel: false, size: 20 });
  });
});
