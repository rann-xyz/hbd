import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CAKE } from '../content';
import { TUNE_REQUEST_EVENT } from '../lib/music';
import { buildCake, CONFETTI_COUNT, type CakeHandle } from '../sections/cake';

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
    for (const node of Array.from(
      built.element.querySelectorAll(
        '.cake__sparks, .candle__flame-wrap, .candle__stick, .cake__bunting, .cake__confetti',
      ),
    )) {
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

describe('the party around the cake', () => {
  it('hangs bunting over the whole thing', () => {
    const built = mount();
    const bunting = built.element.querySelector('.cake__bunting');
    expect(bunting).not.toBeNull();
    expect(bunting?.querySelector('svg')).not.toBeNull();
    expect(bunting?.getAttribute('aria-hidden')).toBe('true');
  });

  it('offers every balloon as a real button with its own label', () => {
    const built = mount();
    const balloons = Array.from(built.element.querySelectorAll<HTMLButtonElement>('[data-balloon]'));

    expect(balloons).toHaveLength(CAKE.balloons.length);
    balloons.forEach((balloon, index) => {
      expect(balloon.tagName).toBe('BUTTON');
      expect(balloon.getAttribute('aria-label')).toBe(CAKE.balloons[index]?.aria);
      expect(balloon.getAttribute('aria-pressed')).toBe('false');
    });
  });

  it('carries the banner copy from the content file', () => {
    const built = mount();
    expect(built.element.querySelector('[data-cake-banner]')?.textContent).toBe(CAKE.banner);
  });

  it('holds the party back until the candle is out', () => {
    const built = mount();
    expect(built.element.hasAttribute('data-celebrating')).toBe(false);

    candle().click();
    expect(built.element.getAttribute('data-celebrating')).toBe('true');
  });

  it('reveals the cutting, the slice and the note in the stylesheet', () => {
    // jsdom does not run the cascade, so the state contract is checked against
    // the CSS the browser uses: the two late actions stay display:none until
    // the section is celebrating, and the slice and the note wait for is-cut.
    const css = readFileSync(resolve(process.cwd(), 'src/styles/components.css'), 'utf8');

    expect(css).toMatch(/\.cake__cut,\s*\.cake__again\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.wish\[data-celebrating\][\s\S]{0,140}display:\s*inline-flex/);
    expect(css).toMatch(/\.cake__stage\.is-cut\s*\.cake__slice\s*\{[^}]*opacity:\s*1/);
    expect(css).toMatch(/\.cake__stage\.is-cut\s*\.cake__note\s*\{[^}]*display:\s*block/);
  });

  it('cuts the cake once, and keeps the note that was inside', () => {
    const built = mount();
    candle().click();

    const cutButton = built.element.querySelector<HTMLButtonElement>('[data-cake-cut]');
    cutButton?.click();

    expect(built.isCut()).toBe(true);
    expect(built.element.querySelector('[data-cake-stage]')?.classList.contains('is-cut')).toBe(true);
    expect(built.element.querySelector('[data-cake-status]')?.textContent).toBe(CAKE.cutStatus);
    expect(built.element.querySelector('[data-cake-note]')?.textContent).toBe(CAKE.cutNote);

    // Pressing it again is a no-op, not a second slice.
    cutButton?.click();
    expect(built.isCut()).toBe(true);
  });

  it('pops a balloon and hands over the line it was holding', () => {
    const built = mount();
    const balloons = Array.from(built.element.querySelectorAll<HTMLButtonElement>('[data-balloon]'));

    balloons[1]?.click();

    expect(built.poppedBalloons()).toBe(1);
    expect(balloons[1]?.getAttribute('aria-pressed')).toBe('true');
    expect(balloons[1]?.classList.contains('is-popped')).toBe(true);
    expect(built.element.querySelector('[data-cake-slip]')?.textContent).toBe(CAKE.balloons[1]?.line);

    balloons[1]?.click();
    expect(built.poppedBalloons()).toBe(1);
  });

  it('asks the shell for the tune instead of playing it itself', () => {
    const built = mount();
    const heard: Event[] = [];
    const listener = (event: Event): void => {
      heard.push(event);
    };
    document.addEventListener(TUNE_REQUEST_EVENT, listener);

    built.element.querySelector<HTMLButtonElement>('[data-cake-sing]')?.click();
    document.removeEventListener(TUNE_REQUEST_EVENT, listener);

    expect(heard).toHaveLength(1);
  });

  it('throws confetti across the stage when motion is welcome', () => {
    stubMatchMedia(false);
    const built = mount();
    candle().click();
    expect(built.confettiCount()).toBe(CONFETTI_COUNT);
  });

  it('leaves the confetti out when the reader prefers reduced motion', () => {
    stubMatchMedia(true);
    const built = mount();
    candle().click();
    expect(built.confettiCount()).toBe(0);
    expect(built.sparkCount()).toBe(0);
  });

  it('throws it all again on request', () => {
    stubMatchMedia(false);
    const built = mount();
    candle().click();

    built.element.querySelector<HTMLButtonElement>('[data-cake-again]')?.click();
    expect(built.confettiCount()).toBe(CONFETTI_COUNT);
  });

  it('puts the whole party back when the candle is relit', () => {
    stubMatchMedia(false);
    const built = mount();
    candle().click();
    built.cut();
    built.popBalloon(0);

    built.relight();

    expect(built.isLit()).toBe(true);
    expect(built.isCut()).toBe(false);
    expect(built.element.querySelector('[data-cake-stage]')?.classList.contains('is-cut')).toBe(false);
    expect(built.element.hasAttribute('data-celebrating')).toBe(false);
    expect(built.poppedBalloons()).toBe(0);
    expect(built.element.querySelector('[data-cake-slip]')?.textContent).toBe('');
    expect(built.confettiCount()).toBe(0);
  });

  it('stops the whole party after destroy', () => {
    const built = mount();
    const heard: Event[] = [];
    const listener = (event: Event): void => {
      heard.push(event);
    };
    document.addEventListener(TUNE_REQUEST_EVENT, listener);

    built.destroy();
    built.element.querySelector<HTMLButtonElement>('[data-cake-sing]')?.click();
    built.element.querySelectorAll<HTMLButtonElement>('[data-balloon]')[0]?.click();
    document.removeEventListener(TUNE_REQUEST_EVENT, listener);

    expect(heard).toHaveLength(0);
    expect(built.poppedBalloons()).toBe(0);
  });
});
