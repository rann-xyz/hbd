import { afterEach, describe, expect, it, vi } from 'vitest';

import { CAKE } from '../content';
import { buildCake, type CakeHandle } from '../sections/cake';

function stubMatchMedia(matches: boolean): void {
  const impl = (query: string): MediaQueryList =>
    ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', impl);
  (window as unknown as { matchMedia: (query: string) => MediaQueryList }).matchMedia = impl;
}

let handle: CakeHandle | null = null;

function mount(): CakeHandle {
  const built = buildCake();
  document.body.append(built.element);
  handle = built;
  return built;
}

function candle(): HTMLButtonElement {
  const node = document.querySelector<HTMLButtonElement>('[data-candle]');
  if (!node) throw new Error('candle missing');
  return node;
}

afterEach(() => {
  handle?.destroy();
  handle = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('cake section', () => {
  it('is a labelled section with the copy from the content file', () => {
    const built = mount();
    expect(built.element.id).toBe('wish');
    expect(document.getElementById('wish-title')?.textContent).toContain('One candle');

    const status = built.element.querySelector('[data-cake-status]');
    const live = status?.getAttribute('aria-live');
    expect(live).toBe('polite');
  });

  it('starts with the candle lit and the wish prompt hidden', () => {
    const built = mount();
    expect(built.isLit()).toBe(true);
    expect(candle().getAttribute('aria-pressed')).toBe('false');
    expect(candle().getAttribute('aria-label')).toBe(CAKE.candleAria);
    expect(built.element.querySelector('[data-cake-wish]')?.hasAttribute('hidden')).toBe(true);
    expect(built.element.querySelector('[data-cake-relight]')?.hasAttribute('hidden')).toBe(true);
  });

  it('blows the candle out when it is pressed', () => {
    const built = mount();
    candle().click();

    expect(built.isLit()).toBe(false);
    expect(candle().getAttribute('aria-pressed')).toBe('true');
    expect(candle().classList.contains('is-out')).toBe(true);
    expect(built.element.querySelector('[data-cake-status]')?.textContent).toBe(CAKE.outLabel);
    expect(built.element.querySelector('[data-cake-wish]')?.textContent).toBe(CAKE.wishDone);
    expect(built.element.querySelector('[data-cake-wish]')?.hasAttribute('hidden')).toBe(false);
    expect(built.element.getAttribute('data-celebrating')).toBe('true');
  });

  it('relights the candle from the relight button', () => {
    const built = mount();
    candle().click();

    const relight = built.element.querySelector<HTMLButtonElement>('[data-cake-relight]');
    expect(relight?.hasAttribute('hidden')).toBe(false);
    relight?.click();

    expect(built.isLit()).toBe(true);
    expect(candle().getAttribute('aria-pressed')).toBe('false');
    expect(candle().classList.contains('is-out')).toBe(false);
    expect(built.element.querySelector('[data-cake-wish]')?.hasAttribute('hidden')).toBe(true);
    expect(built.element.querySelector('[data-cake-status]')?.textContent).toBe(CAKE.litLabel);
    expect(built.element.hasAttribute('data-celebrating')).toBe(false);
  });

  it('pressing the candle twice relights rather than getting stuck', () => {
    const built = mount();
    candle().click();
    candle().click();
    expect(built.isLit()).toBe(true);
    expect(built.sparkCount()).toBe(0);
  });

  it('throws a few sparks when motion is welcome', () => {
    stubMatchMedia(false);
    const built = mount();
    candle().click();
    expect(built.sparkCount()).toBeGreaterThan(0);
  });

  it('keeps the celebration still when the reader prefers reduced motion', () => {
    stubMatchMedia(true);
    const built = mount();
    candle().click();
    expect(built.sparkCount()).toBe(0);
    expect(built.isLit()).toBe(false);
  });

  it('treats the drawing as decorative', () => {
    const built = mount();
    for (const node of Array.from(built.element.querySelectorAll('.cake__sparks, .candle__flame-wrap, .candle__stick'))) {
      expect(node.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('stops responding after destroy', () => {
    const built = mount();
    built.destroy();
    candle().click();
    expect(built.isLit()).toBe(true);
  });
});
