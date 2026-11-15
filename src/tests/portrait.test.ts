import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { PORTRAIT, PORTRAIT_SECTION } from '../content';
import { buildPortrait } from '../sections/portrait';

const css = ['tokens.css', 'base.css', 'components.css', 'layout.css']
  .map((file) => readFileSync(resolve(process.cwd(), 'src/styles', file), 'utf8'))
  .join('\n');

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

describe('the birthday hat', () => {
  it('is drawn over the print, never into it', () => {
    const built = mount();
    const image = built.querySelector<HTMLImageElement>('img');

    // The photograph is the one real picture on the page: the hat is a sibling
    // element, so nothing about the image itself changes — no filter, no mask,
    // no rewritten source.
    expect(image?.getAttribute('src')).toBe(PORTRAIT.src);
    expect(image?.getAttribute('style')).toBeNull();
    expect(image?.getAttribute('class')).toBeNull();
    expect(image?.getAttribute('filter')).toBeNull();
  });

  it('lives inside the frame, so the print clips it', () => {
    const built = mount();
    const frame = built.querySelector('.polaroid__frame');
    const hat = frame?.querySelector('.portrait__hat');

    expect(hat, 'the hat belongs inside .polaroid__frame').not.toBeNull();
    expect(hat?.querySelector('svg')).not.toBeNull();
    // Decoration, not content: a screen reader should hear the photograph once.
    expect(hat?.getAttribute('aria-hidden')).toBe('true');
    expect(hat?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    // And it must not eat a tap meant for the print.
    expect(css).toMatch(/\.portrait__hat\s*\{[^}]*pointer-events:\s*none/);
  });

  it('is placed in percentages of the frame, so it stays on her head', () => {
    // jsdom has no layout engine, so this reads the stylesheet. The numbers come
    // from the picture: in the 720x1280 frame her hair starts at y=138 and the
    // crown sits at x=324.
    const rule = css.match(/\.portrait__hat\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/left:\s*[\d.]+%/);
    expect(rule).toMatch(/top:\s*[\d.]+%/);
    expect(rule).toMatch(/width:\s*[\d.]+%/);
    // Anchored by its own bottom centre, so the tilt turns around the point
    // where the hat meets her hair instead of swinging the base off her head.
    expect(rule).toMatch(/transform:\s*translate\(-50%,\s*-100%\)\s*rotate\([-\d.]+deg\)/);
    expect(rule).toMatch(/transform-origin:\s*50%\s+100%/);
  });
});
