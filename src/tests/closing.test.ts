import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLOSING, PORTRAIT, RECIPIENT } from '../content';
import { buildClosing } from '../sections/closing';

let element: HTMLElement | null = null;

function mount(): HTMLElement {
  const built = buildClosing();
  document.body.append(built);
  element = built;
  return built;
}

beforeEach(() => {
  // jsdom has no scrolling implementation; the section must still be able to ask.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  element = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('closing section', () => {
  it('is a labelled section, not another h1', () => {
    const built = mount();
    expect(built).toBe(element);
    expect(built.id).toBe('closing');
    expect(built.className).toContain('closing');
    expect(built.getAttribute('aria-labelledby')).toBe('closing-title');
    expect(built.querySelectorAll('h1')).toHaveLength(0);
    expect(built.querySelector('#closing-title')?.tagName).toBe('H2');
  });

  it('says the two lines exactly as the brief asks', () => {
    const built = mount();
    expect(built.querySelector('#closing-title')?.textContent).toBe(CLOSING.heading);
    expect(built.textContent).toContain(`With love, ${CLOSING.signature}`);
    expect(built.querySelector('.closing__signature')?.textContent).toBe(CLOSING.signature);

    for (const line of CLOSING.lines) {
      expect(built.textContent).toContain(line);
    }
  });

  it('shows the one real portrait, lazy-loaded and uncropped', () => {
    const built = mount();
    const image = built.querySelector<HTMLImageElement>('.polaroid__frame img');

    expect(image?.getAttribute('src')).toBe(PORTRAIT.src);
    expect(image?.getAttribute('width')).toBe(String(PORTRAIT.width));
    expect(image?.getAttribute('height')).toBe(String(PORTRAIT.height));
    expect(image?.getAttribute('loading')).toBe('lazy');
    expect(image?.getAttribute('alt')).toContain(RECIPIENT.fullName);
  });

  it('treats every decoration as decoration', () => {
    const built = mount();
    for (const node of Array.from(
      built.querySelectorAll('.closing__bloom, .tape, .rule-sprig svg'),
    )) {
      expect(node.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('offers a real way back to the beginning', () => {
    // A stand-in for the opening section the real page already has.
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<section id="opening"><h1 id="opening-title">A LITTLE WORLD MADE FOR YOU</h1></section>',
    );

    const built = mount();
    const restart = built.querySelector<HTMLButtonElement>('.closing__restart');
    expect(restart).not.toBeNull();

    restart?.click();

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(document.getElementById('opening-title'));
  });

  it('does not throw when the opening section is missing', () => {
    const built = mount();
    expect(() => built.querySelector<HTMLButtonElement>('.closing__restart')?.click()).not.toThrow();
  });
});
