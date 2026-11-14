import { afterEach, describe, expect, it } from 'vitest';

import { PORTRAIT, PORTRAIT_SECTION } from '../content';
import { buildPortrait } from '../sections/portrait';

function mount(): HTMLElement {
  const built = buildPortrait();
  document.body.append(built);
  return built;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('portrait section', () => {
  it('is a labelled section, not another h1', () => {
    const built = mount();
    expect(built.id).toBe('portrait');
    expect(built.getAttribute('aria-labelledby')).toBe('portrait-title');
    expect(built.querySelectorAll('h1')).toHaveLength(0);
    expect(built.querySelector('#portrait-title')?.tagName).toBe('H2');
  });

  it('carries the spread placement class the desktop grid positions', () => {
    // Regression: the figure also needs `spread__figure`, otherwise the
    // desktop grid auto-places it and the photograph collapses into the
    // narrow column the text just vacated.
    const built = mount();
    const figure = built.querySelector('figure');
    expect(figure).not.toBeNull();
    expect(figure?.classList.contains('spread__figure')).toBe(true);
    expect(figure?.classList.contains('polaroid')).toBe(true);
    expect(figure?.classList.contains('portrait__figure')).toBe(true);
  });

  it('keeps the one real photograph, uncropped and captioned', () => {
    const built = mount();
    const image = built.querySelector<HTMLImageElement>('img');
    expect(image?.getAttribute('src')).toBe(PORTRAIT.src);
    expect(image?.getAttribute('width')).toBe(String(PORTRAIT.width));
    expect(image?.getAttribute('height')).toBe(String(PORTRAIT.height));
    expect(image?.getAttribute('alt')).toBe(PORTRAIT.alt);
    expect(built.querySelector('figcaption')?.textContent).toBe(PORTRAIT_SECTION.caption);
  });
});
