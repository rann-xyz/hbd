import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MASCOT } from '../content';
import { balloon, cake, face, heart, mascot } from '../lib/svg';
import { buildCake, CONFETTI_COUNT, type CakeHandle } from '../sections/cake';
import { buildClosing } from '../sections/closing';
import { buildMascot, type MascotHandle } from '../sections/mascot';
import { buildOpening } from '../sections/opening';

/**
 * The gemes layer: faces on the drawings, a creature you can boop, hearts in
 * the confetti, and a page of round corners.
 *
 * Cuteness is not testable, but the things that make it work are. A face that
 * has drifted off the cake, a bubble that says nothing, a button too small to
 * hit, or an animation that runs when the reader asked for none — each of
 * those turns a charming detail into a defect, and each of those is checked
 * here.
 */

const stylesDir = resolve(process.cwd(), 'src/styles');
const css = ['tokens.css', 'base.css', 'components.css', 'layout.css']
  .map((file) => readFileSync(resolve(stylesDir, file), 'utf8'))
  .join('\n');

/** The declaration block for a selector, matched at the start of a line. */
function block(selector: string): string {
  const pattern = selector
    .split(/\s+/)
    .map((part) => part.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&'))
    .join('\\s+');
  const match = css.match(new RegExp(`^${pattern}\\s*\\{([^}]*)\\}`, 'm'));
  expect(match, `no rule found for ${selector}`).not.toBeNull();
  return match?.[1] ?? '';
}

/**
 * The body of the `prefers-reduced-motion: no-preference` guard that holds the
 * rule containing `needle`. An animation that is not inside one of these runs
 * for a reader who asked for none, which is the defect this checks for.
 */
function motionGuard(needle: string): string {
  const at = css.indexOf(needle);
  expect(at, `no rule containing ${needle}`).toBeGreaterThan(-1);
  const open = css.lastIndexOf('@media (prefers-reduced-motion: no-preference) {', at);
  expect(open, `${needle} is not inside a reduced-motion guard`).toBeGreaterThan(-1);
  const close = css.indexOf('\n}', at);
  return css.slice(open, close);
}

/** Where a path starts — the first coordinate pair after the move command. */
function startOf(path: Element): { x: number; y: number } {
  const match = (path.getAttribute('d') ?? '').match(/^M([\d.-]+)\s+([\d.-]+)/);
  return { x: Number(match?.[1]), y: Number(match?.[2]) };
}

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('the face builder', () => {
  it('draws two eyes, one smile and two cheeks, each tagged for the tests', () => {
    const paths = face({ x: 50, y: 50 });

    expect(paths.filter((path) => path.className === 'face__eye')).toHaveLength(2);
    expect(paths.filter((path) => path.className === 'face__smile')).toHaveLength(1);
    expect(paths.filter((path) => path.className === 'face__blush')).toHaveLength(2);
  });

  it('closes both eyes when it is happy, and one when it winks', () => {
    const happy = face({ x: 0, y: 0, mood: 'happy' });
    const wink = face({ x: 0, y: 0, mood: 'wink' });

    // A closed eye is an arc (a stroke), an open one is a filled dot.
    expect(happy.filter((path) => path.className?.includes('happy'))).toHaveLength(2);
    expect(wink.filter((path) => path.className?.includes('happy'))).toHaveLength(1);
    expect(happy.every((path) => path.className !== 'face__eye' || path.stroke)).toBe(true);
  });

  it('drops the blush on request, and only the blush', () => {
    const bare = face({ x: 0, y: 0, blush: false });

    expect(bare.some((path) => path.className === 'face__blush')).toBe(false);
    expect(bare.filter((path) => path.className === 'face__eye')).toHaveLength(2);
  });

  it('scales with the drawing it is dropped into', () => {
    const eyeStarts = (paths: ReturnType<typeof face>): number[] =>
      paths
        .filter((path) => path.className === 'face__eye')
        .map((path) => Number(path.d.match(/^M([\d.-]+)/)?.[1]));
    const gap = (xs: number[]): number => Math.abs((xs[1] ?? 0) - (xs[0] ?? 0));

    const small = gap(eyeStarts(face({ x: 0, y: 0, scale: 1 })));
    const large = gap(eyeStarts(face({ x: 0, y: 0, scale: 2 })));

    expect(large).toBeCloseTo(small * 2, 1);
  });
});

describe('the drawings that got a face', () => {
  it('puts one on the cake, on the tier that faces the reader', () => {
    const art = cake(240);

    expect(art.querySelectorAll('.face__eye')).toHaveLength(2);
    expect(art.querySelectorAll('.face__smile')).toHaveLength(1);
    expect(art.querySelectorAll('.face__blush')).toHaveLength(2);

    // The top tier's front runs x 35.2-85.2, y 44.4-72.6 in the cake's own
    // 120-unit viewBox. A face that drifts onto the icing, the cherries or the
    // doily is a face on the wrong part of the cake.
    for (const path of Array.from(art.querySelectorAll('.face__eye, .face__blush, .face__smile'))) {
      const { x, y } = startOf(path);
      expect(x, `face path starts at x=${x}`).toBeGreaterThan(35.2);
      expect(x, `face path starts at x=${x}`).toBeLessThan(85.2);
      expect(y, `face path starts at y=${y}`).toBeGreaterThan(44.4);
      expect(y, `face path starts at y=${y}`).toBeLessThan(72.6);
    }
  });

  it('puts one on every balloon, clear of the highlight', () => {
    const art = balloon(54);
    const eyes = Array.from(art.querySelectorAll('.face__eye'));

    expect(eyes).toHaveLength(2);

    // The balloon body is x 5.6-34.4, y 2.8-37.4; the highlight runs down the
    // left edge to y=20.2, so the face has to sit right of it.
    for (const eye of eyes) {
      const { x, y } = startOf(eye);
      expect(x).toBeGreaterThan(11);
      expect(x).toBeLessThan(29);
      expect(y).toBeGreaterThan(20.2);
      expect(y).toBeLessThan(37);
    }
  });

  it('draws the resident with a face and a heart, inside its own box', () => {
    const art = mascot(76);

    expect(art.querySelectorAll('.face__eye')).toHaveLength(2);
    expect(art.querySelectorAll('.face__blush')).toHaveLength(2);
    expect(art.getAttribute('viewBox')).toBe('0 0 100 100');
    // The heart it holds is the last path, and the only one out at the right.
    const last = art.querySelector('path:last-of-type');
    expect(startOf(last as Element).x).toBeGreaterThan(60);
  });

  it('closes the resident’s eyes on the last page, and opens them on the first', () => {
    expect(mascot(76, 'open').querySelectorAll('.face__eye--happy')).toHaveLength(0);
    expect(mascot(84, 'happy').querySelectorAll('.face__eye--happy')).toHaveLength(2);
  });

  it('keeps every face out of the accessibility tree', () => {
    for (const art of [cake(240), balloon(54), mascot(76)]) {
      expect(art.getAttribute('aria-hidden')).toBe('true');
      for (const path of Array.from(art.querySelectorAll('path'))) {
        expect(path.getAttribute('aria-hidden')).toBeNull();
      }
    }
  });
});

describe('the little resident', () => {
  let resident: MascotHandle | null = null;

  function mount(): MascotHandle {
    const built = buildMascot({ className: 'opening__mascot' });
    document.body.append(built.element);
    resident = built;
    return built;
  }

  afterEach(() => {
    resident?.destroy();
    resident = null;
  });

  it('is a named button holding a decorative drawing', () => {
    const built = mount();
    const button = built.element.querySelector('button');

    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe(MASCOT.aria);
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(built.element.className).toContain('opening__mascot');
  });

  it('says nothing at all until it is booped', () => {
    const built = mount();
    const say = built.element.querySelector('[data-mascot-say]');

    // An empty polite region announces nothing, which is the point: the page
    // must not talk over itself on load.
    expect(say?.getAttribute('aria-live')).toBe('polite');
    expect(say?.getAttribute('aria-atomic')).toBe('true');
    expect(built.current()).toBe('');
    expect(built.boops()).toBe(0);
  });

  it('answers in order, and wraps round to the first line', () => {
    const built = mount();
    const button = built.element.querySelector('button');

    for (const line of MASCOT.lines) {
      button?.click();
      expect(built.current()).toBe(line);
    }

    button?.click();
    expect(built.current()).toBe(MASCOT.lines[0]);
    expect(built.boops()).toBe(MASCOT.lines.length + 1);
  });

  it('retires the hint the moment there is a line to read instead', () => {
    const built = mount();
    const hint = built.element.querySelector('.mascot__hint');

    expect(hint?.hasAttribute('hidden')).toBe(false);
    built.element.querySelector('button')?.click();
    expect(hint?.hasAttribute('hidden')).toBe(true);
  });

  it('gives the button a thumb-sized target and the bubble a tail', () => {
    // The creature is small; the thing you press must not be.
    const button = block('.mascot__button');
    expect(button).toMatch(/min-height:\s*2\.75rem/);
    expect(button).toMatch(/min-width:\s*2\.75rem/);

    // The tail is what makes it a speech bubble rather than a stray label.
    expect(block('.mascot__say::before')).toMatch(/transform:\s*rotate\(45deg\)/);
    expect(block('.mascot__say:empty')).toMatch(/display:\s*none/);
  });

  it('wiggles when motion is welcome, and not one frame when it is not', () => {
    stubMatchMedia(false);
    const lively = mount();
    lively.element.querySelector('button')?.click();
    expect(lively.element.querySelector('button')?.classList.contains('is-bopped')).toBe(true);
    lively.destroy();
    resident = null;

    stubMatchMedia(true);
    const still = mount();
    still.element.querySelector('button')?.click();
    // The line still changes — only the animation is withheld.
    expect(still.current()).toBe(MASCOT.lines[0]);
    expect(still.element.querySelector('button')?.classList.contains('is-bopped')).toBe(false);
  });

  it('stops listening once it is torn down', () => {
    const built = mount();
    built.destroy();
    resident = null;

    built.element.querySelector('button')?.click();
    expect(built.boops()).toBe(0);
  });

  it('sits on the opening page, under the call to action', () => {
    const opening = buildOpening();
    const mascotNode = opening.querySelector('.opening__mascot');
    const cta = opening.querySelector('[data-open-surprise]');

    expect(mascotNode).not.toBeNull();
    expect(cta).not.toBeNull();
    // In the flow, after the button: a creature pinned to a corner would land
    // on the stamp on a short phone.
    expect(cta?.compareDocumentPosition(mascotNode as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(block('.opening__mascot')).toMatch(/margin-top:/);
  });

  it('waves goodbye on the last page as decoration, not as a control', () => {
    const closing = buildClosing();
    const farewell = closing.querySelector('.closing__mascot');

    expect(farewell).not.toBeNull();
    expect(farewell?.getAttribute('aria-hidden')).toBe('true');
    // Decoration, so it must not add a second button to the last page.
    expect(farewell?.querySelector('button')).toBeNull();
    expect(farewell?.querySelectorAll('.face__eye--happy')).toHaveLength(2);
  });

  it('pops the bubble when a line lands, and never for a reader who asked for still', () => {
    // The script puts `is-fresh` on the bubble on every boop, so a missing rule
    // here is a class that does nothing — the line would appear mid-bubble.
    expect(motionGuard('.mascot__say.is-fresh')).toMatch(
      /\.mascot__say\.is-fresh\s*\{[^}]*animation:\s*mascot-say/,
    );
    // Applied for 520ms by the script, so the animation has to fit inside it.
    const duration = Number(css.match(/animation:\s*mascot-say\s+(\d+)ms/)?.[1]);
    expect(duration).toBeLessThanOrEqual(520);
  });

  it('arrives after the button it sits under, not before it', () => {
    stubMatchMedia(false);
    const original = Element.prototype.animate;
    const staged: { node: Element; delay: number }[] = [];

    Element.prototype.animate = function record(
      this: Element,
      _frames: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ): Animation {
      staged.push({ node: this, delay: Number((options as KeyframeAnimationOptions)?.delay ?? 0) });
      return { cancel: () => {}, finish: () => {} } as unknown as Animation;
    } as Element['animate'];

    try {
      const opening = buildOpening();
      const mascotNode = opening.querySelector('.opening__mascot');
      const actions = opening.querySelector('.opening__actions');
      const mascotCall = staged.find((call) => call.node === mascotNode);
      const actionsCall = staged.find((call) => call.node === actions);

      expect(mascotCall, 'the creature is not staged at all').toBeDefined();
      expect(actionsCall).toBeDefined();
      expect(mascotCall?.delay).toBeGreaterThan(actionsCall?.delay ?? 0);
    } finally {
      Element.prototype.animate = original;
    }
  });
});

describe('the confetti', () => {
  let handle: CakeHandle | null = null;

  afterEach(() => {
    handle?.destroy();
    handle = null;
  });

  it('throws hearts in with the paper, and keeps the throw the same size', () => {
    stubMatchMedia(false);
    handle = buildCake();
    document.body.append(handle.element);
    handle.blowOut();

    const pieces = document.querySelectorAll('.cake__confetti-piece');
    const hearts = document.querySelectorAll('.cake__confetti-piece--heart');

    expect(handle.confettiCount()).toBe(CONFETTI_COUNT);
    expect(pieces).toHaveLength(CONFETTI_COUNT);
    // Every sixth piece, starting at the first.
    expect(hearts).toHaveLength(Math.ceil(CONFETTI_COUNT / 6));
    for (const piece of Array.from(hearts)) {
      expect(piece.querySelector('svg')).not.toBeNull();
      expect(piece.getAttribute('aria-hidden')).toBe('true');
    }
    // A heart is drawn, not a coloured rectangle: no background of its own.
    expect(block('.cake__confetti-piece--heart')).toMatch(/background:\s*none/);
  });

  it('leaves the hearts out with the rest of the confetti when motion is off', () => {
    stubMatchMedia(true);
    handle = buildCake();
    document.body.append(handle.element);
    handle.blowOut();

    expect(handle.confettiCount()).toBe(0);
    expect(document.querySelectorAll('.cake__confetti-piece--heart')).toHaveLength(0);
  });
});

describe('the hearts', () => {
  it('is one closed shape, filled, so it never renders as an outline', () => {
    const art = heart(16, '#E8C5CB');
    const paths = Array.from(art.querySelectorAll('path'));

    expect(paths).toHaveLength(2);
    expect(paths[0]?.getAttribute('fill')).toBe('#E8C5CB');
    expect(paths[0]?.getAttribute('d')?.endsWith('Z')).toBe(true);
  });

  it('takes the colour of whatever is around it by default', () => {
    expect(heart(16).querySelector('path')?.getAttribute('fill')).toBe('currentColor');
  });

  it('turns the middle of the closing bloom into one', () => {
    const closing = buildClosing();
    const bloom = closing.querySelector('.closing__bloom');

    expect(bloom?.getAttribute('aria-hidden')).toBe('true');
    expect(bloom?.children).toHaveLength(3);
    expect(bloom?.children[1]?.getAttribute('viewBox')).toBe('0 0 20 20');
  });
});

describe('the rounder page', () => {
  it('defines the gemes scale in the tokens, not in a component', () => {
    for (const token of ['--radius-lg', '--radius-xl', '--radius-pill']) {
      expect(css).toMatch(new RegExp(`${token}:\\s*[\\d.]+(px|rem)?`));
    }
  });

  it('makes every button a pill, and squishes it under the thumb', () => {
    expect(block('.btn')).toMatch(/border-radius:\s*var\(--radius-pill\)/);
    expect(block('.btn:active')).toMatch(/scale\(0\.9\d\)/);
  });

  it('rounds the surfaces you read and touch, and leaves the paper alone', () => {
    for (const selector of ['.note-card', '.wish-card', '.state', '.field__control', '.celebration']) {
      expect(block(selector), selector).toMatch(/border-radius:\s*var\(--radius-lg\)/);
    }

    // A polaroid is a photograph and a stamp is a stamp: square corners are
    // the point of both.
    expect(block('.polaroid')).not.toMatch(/border-radius:\s*var\(--radius-lg\)/);
  });

  it('bobs the balloons without fighting the celebrating sway', () => {
    // Two animations on one `transform` would cancel each other: the small bob
    // lives on the drawing, the big sway on the button around it. The bob sits
    // inside a reduced-motion guard, so it is not in the base rule.
    expect(css).toMatch(/\.balloon__art\s*\{[^}]*animation:\s*balloon-bob/);
    expect(css).toMatch(/\.wish\[data-celebrating\] \.balloon:not\(\.is-popped\)\s*\{[^}]*balloon-sway/);
  });
});
