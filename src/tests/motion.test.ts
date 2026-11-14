import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  animateNumber,
  enter,
  prefersReducedMotion,
  pulseClass,
  revealOnScroll,
  scrollToElement,
  watchReducedMotion,
} from '../lib/motion';

function mediaQueryList(matches: boolean, query: string): MediaQueryList {
  return {
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}

/** jsdom has no real media engine, so the reader's preference is stubbed here. */
function stubMatchMedia(matches: boolean | 'missing'): void {
  if (matches === 'missing') {
    vi.stubGlobal('matchMedia', undefined);
    (window as unknown as { matchMedia: unknown }).matchMedia = undefined;
    return;
  }
  const impl = (query: string): MediaQueryList =>
    mediaQueryList(matches && query.includes('prefers-reduced-motion'), query);
  vi.stubGlobal('matchMedia', impl);
  (window as unknown as { matchMedia: (query: string) => MediaQueryList }).matchMedia = impl;
}

function fixture(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = '<p data-reveal>one</p><p data-reveal>two</p><p>three</p>';
  document.body.append(root);
  return root;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.textContent = '';
});

describe('prefersReducedMotion', () => {
  it('reports true when the reader asked for less motion', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it('reports false when motion is fine', () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('assumes reduced motion when the platform has no opinion', () => {
    stubMatchMedia('missing');
    expect(prefersReducedMotion()).toBe(true);
  });
});

describe('watchReducedMotion', () => {
  it('returns a teardown even on platforms without matchMedia', () => {
    stubMatchMedia('missing');
    const stop = watchReducedMotion(() => {});
    expect(typeof stop).toBe('function');
    expect(() => stop()).not.toThrow();
  });
});

describe('enter', () => {
  it('does not animate at all when motion is reduced', () => {
    stubMatchMedia(true);
    const node = document.createElement('p');
    const spy = vi.fn();
    node.animate = spy as unknown as Element['animate'];
    expect(enter(node, [{ opacity: 0 }, { opacity: 1 }])).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('animates when motion is welcome and the API exists', () => {
    stubMatchMedia(false);
    const node = document.createElement('p');
    const spy = vi.fn(() => ({ cancel: () => {} }));
    node.animate = spy as unknown as Element['animate'];
    enter(node, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ duration: 100, fill: 'both' }),
    );
  });
});

describe('revealOnScroll', () => {
  it('reveals everything immediately when IntersectionObserver is unavailable', () => {
    stubMatchMedia(false);
    vi.stubGlobal('IntersectionObserver', undefined);
    const root = fixture();
    const stop = revealOnScroll(root);
    for (const node of Array.from(root.querySelectorAll('[data-reveal]'))) {
      expect(node.classList.contains('is-in')).toBe(true);
    }
    expect(() => stop()).not.toThrow();
  });

  it('reveals everything immediately when motion is reduced', () => {
    stubMatchMedia(true);
    const root = fixture();
    revealOnScroll(root);
    for (const node of Array.from(root.querySelectorAll('[data-reveal]'))) {
      expect(node.classList.contains('is-in')).toBe(true);
    }
  });

  it('waits for the observer when motion is welcome', () => {
    stubMatchMedia(false);
    const observed: Element[] = [];
    class FakeObserver {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element): void {
        observed.push(target);
      }
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      root = null;
      rootMargin = '';
      thresholds = [];
      fire(target: Element): void {
        this.callback(
          [{ target, isIntersecting: true } as unknown as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver as unknown as typeof IntersectionObserver);

    const root = fixture();
    revealOnScroll(root, { stagger: 50 });

    expect(observed).toHaveLength(2);
    for (const node of observed) expect(node.classList.contains('is-in')).toBe(false);
  });

  it('does nothing when there is nothing to reveal', () => {
    stubMatchMedia(false);
    const root = document.createElement('div');
    expect(() => revealOnScroll(root)()).not.toThrow();
  });
});

describe('animateNumber', () => {
  it('jumps straight to the target when motion is reduced', () => {
    stubMatchMedia(true);
    const seen: number[] = [];
    const cancel = animateNumber(0, 42, 500, (value) => seen.push(value));
    expect(seen).toEqual([42]);
    expect(() => cancel()).not.toThrow();
  });

  it('reports the final value for a zero-length animation', () => {
    stubMatchMedia(false);
    const seen: number[] = [];
    animateNumber(5, 9, 0, (value) => seen.push(value));
    expect(seen).toEqual([9]);
  });
});

describe('pulseClass', () => {
  it('adds nothing when motion is reduced', () => {
    stubMatchMedia(true);
    const node = document.createElement('span');
    pulseClass(node, 'is-turning');
    expect(node.classList.contains('is-turning')).toBe(false);
  });
});

describe('scrollToElement', () => {
  it('scrolls without smooth motion when reduced motion is requested', () => {
    stubMatchMedia(true);
    const node = document.createElement('section');
    const spy = vi.fn();
    node.scrollIntoView = spy as unknown as Element['scrollIntoView'];
    scrollToElement(node);
    expect(spy).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('moves focus to the target when one is provided', () => {
    stubMatchMedia(true);
    const node = document.createElement('section');
    node.scrollIntoView = vi.fn() as unknown as Element['scrollIntoView'];
    const heading = document.createElement('h2');
    document.body.append(node, heading);

    scrollToElement(node, heading);
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(heading);
  });
});
