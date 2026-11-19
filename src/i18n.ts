import type { Editor } from 'grapesjs';
import type { RulerLabels } from './options';

export const I18N_NS = 'ruler';

export const locales: Record<string, RulerLabels> = {
  en: {
    toggle: 'Rulers',
    corner: 'Click: grid around the page · Double-click: remove all guides',
    cornerGridOn: 'Click: hide the grid around the page · Double-click: remove all guides',
    guide: 'Drag to move, drag onto a ruler or double-click to remove',
    ruler: 'Drag out a guide',
  },
  ru: {
    toggle: 'Линейки',
    corner: 'Клик — сетка вокруг страницы · Двойной клик — убрать все направляющие',
    cornerGridOn: 'Клик — скрыть сетку вокруг страницы · Двойной клик — убрать все направляющие',
    guide: 'Перетащите, чтобы сдвинуть; на линейку или двойной клик — убрать',
    ruler: 'Потяните, чтобы создать направляющую',
  },
  uk: {
    toggle: 'Лінійки',
    corner: 'Клік — сітка навколо сторінки · Подвійний клік — прибрати всі напрямні',
    cornerGridOn: 'Клік — сховати сітку навколо сторінки · Подвійний клік — прибрати всі напрямні',
    guide: 'Перетягніть, щоб зсунути; на лінійку або подвійний клік — прибрати',
    ruler: 'Потягніть, щоб створити напрямну',
  },
};

export function registerMessages(editor: Editor): void {
  const i18n = (editor as any).I18n;
  if (!i18n?.addMessages) return;
  const msgs: Record<string, any> = {};
  Object.keys(locales).forEach((lang) => (msgs[lang] = { [I18N_NS]: locales[lang] }));
  try {
    i18n.addMessages(msgs);
  } catch {
    // ignore
  }
}

/** Current labels: overrides, then editor.I18n, then English. */
export function getLabels(editor: Editor, overrides: Partial<RulerLabels>): RulerLabels {
  const out = { ...locales.en };
  const i18n = (editor as any).I18n;
  (Object.keys(out) as (keyof RulerLabels)[]).forEach((k) => {
    if (overrides[k]) {
      out[k] = overrides[k]!;
      return;
    }
    try {
      const t = i18n?.t?.(`${I18N_NS}.${k}`);
      if (typeof t === 'string' && t) out[k] = t;
    } catch {
      // ignore
    }
  });
  return out;
}
