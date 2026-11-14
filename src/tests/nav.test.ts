import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { boot, type BootedApp } from '../app';

/* ============================================================
   NAV HIGHLIGHT — regression cover for the reading line.

   The highlight used to be recomputed only from IntersectionObserver
   callbacks. The observed set changes when a section crosses the band, but
   which section *holds the reading line* changes on every scroll frame, and
   two sections share the band whenever one is taller than the window. The
   highlight therefore sat one section behind — most visibly at the end of a
   smooth scroll, which settles without firing any further event.
   ============================================================ */

type Entry = { target: Element; isIntersecting: boolean };

class FakeObserver {
  static all: FakeObserver[] = [];

  readonly targets: Element[] = [];

  constructor(
    private readonly callback: (entries: Entry[]) => void,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeObserver.all.push(this);
  }

  observe(target: Element): void {
    this.targets.push(target);
  }

  unobserve(target: Element): void {
    const index = this.targets.indexOf(target);
    if (index >= 0) this.targets.splice(index, 1);
  }

  disconnect(): void {
    this.targets.length = 0;
  }

  fire(entries: Entry[]): void {
    this.callback(entries);
  }
}

/** The nav observer, told apart from the reveal observer by its band. */
function navObserver(): FakeObserver {
  const found = FakeObserver.all.find((o) => o.options?.rootMargin === '-30% 0px -50% 0px');
  if (!found) throw new Error('the nav observer was never created');
  return found;
}

const frames: FrameRequestCallback[] = [];

/** Run the queued animation frames, the way a real frame would. */
function flushFrames(): void {
  while (frames.length > 0) frames.shift()?.(0);
}

function placeRects(rects: Record<string, { top: number; bottom: number }>): void {
  for (const [id, rect] of Object.entries(rects)) {
    const element = document.getElementById(id);
    if (!element) continue;
    element.getBoundingClientRect = () =>
      ({ top: rect.top, bottom: rect.bottom, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  }
}

function activeHref(): string | null {
  const current = Array.from(document.querySelectorAll('[data-nav-link]')).find(
    (link) => link.getAttribute('aria-current') === 'true',
  );
  return current?.getAttribute('href') ?? null;
}

let app: BootedApp | null = null;

beforeEach(() => {
  document.body.innerHTML = `
    <div class="progress-rail"><span data-progress-fill></span></div>
    <header class="site-nav" data-nav hidden>
      <a class="site-nav__mark" href="#opening" data-nav-mark>Fitria &amp; Agis</a>
      <nav class="site-nav__links" data-nav-links></nav>
    </header>
    <main id="story" data-app></main>
    <footer class="site-foot" data-foot hidden></footer>
  `;

  FakeObserver.all = [];
  frames.length = 0;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames.length = 0;
  });
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 4000 });
});

afterEach(() => {
  app?.destroy();
  app = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('nav highlight', () => {
  it('follows the reading line when a section enters the band', () => {
    app = boot();
    const observer = navObserver();
    const countdown = document.getElementById('countdown');
    const letter = document.getElementById('letter');
    expect(countdown).not.toBeNull();
    expect(letter).not.toBeNull();

    placeRects({
      countdown: { top: -1000, bottom: 200 },
      letter: { top: 200, bottom: 900 },
    });

    observer.fire([
      { target: countdown as Element, isIntersecting: true },
      { target: letter as Element, isIntersecting: true },
    ]);
    flushFrames();

    // The reading line (35% of a 768px window, so 268.8px) sits inside #letter.
    expect(activeHref()).toBe('#letter');
  });

  it('re-picks on scroll even when the observed set does not change', () => {
    app = boot();
    const observer = navObserver();
    const countdown = document.getElementById('countdown') as Element;
    const letter = document.getElementById('letter') as Element;

    // Both sections share the band, as they do whenever one is taller than the
    // window. No further intersection event will ever fire between them.
    observer.fire([
      { target: countdown, isIntersecting: true },
      { target: letter, isIntersecting: true },
    ]);
    placeRects({
      countdown: { top: -1000, bottom: 200 },
      letter: { top: 200, bottom: 900 },
    });
    flushFrames();
    expect(activeHref()).toBe('#letter');

    // Scrolling on moves the reading line back into #countdown while the
    // visible set stays exactly the same.
    placeRects({
      countdown: { top: -1000, bottom: 400 },
      letter: { top: 400, bottom: 1100 },
    });
    window.dispatchEvent(new Event('scroll'));
    flushFrames();

    expect(activeHref()).toBe('#countdown');
  });

  it('stops listening once it is torn down', () => {
    app = boot();
    const observer = navObserver();
    const countdown = document.getElementById('countdown') as Element;
    const letter = document.getElementById('letter') as Element;

    observer.fire([
      { target: countdown, isIntersecting: true },
      { target: letter, isIntersecting: true },
    ]);
    placeRects({
      countdown: { top: -1000, bottom: 200 },
      letter: { top: 200, bottom: 900 },
    });
    flushFrames();
    expect(activeHref()).toBe('#letter');

    app.destroy();
    app = null;

    placeRects({
      countdown: { top: -1000, bottom: 400 },
      letter: { top: 400, bottom: 1100 },
    });
    window.dispatchEvent(new Event('scroll'));
    flushFrames();

    expect(activeHref()).toBe('#letter');
  });
});
