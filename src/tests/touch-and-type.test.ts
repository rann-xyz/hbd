import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Two things a scrapbook can only get away with on a desktop: type too small to
 * read at arm's length, and links too small to hit with a thumb. Both were
 * measured on the live page at 390px — the tracked caps sat at 9.9px and the
 * nav links stood 34px tall — and both are the kind of thing a phone reveals
 * and a mockup hides.
 *
 * jsdom has no layout engine, so these read the stylesheet the way the browser
 * will: the numbers below are the contract, not a rendering.
 */

const stylesDir = resolve(process.cwd(), 'src/styles');
const css = ['tokens.css', 'base.css', 'components.css', 'layout.css']
  .map((file) => readFileSync(resolve(stylesDir, file), 'utf8'))
  .join('\n');

/** The declaration block for a selector, matched at the start of a line. */
function block(selector: string): string {
  // Selector lists wrap across lines in the source, so any run of whitespace
  // (including a newline after a comma) has to match a single space.
  const pattern = selector
    .split(/\s+/)
    .map((part) => part.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&'))
    .join('\\s+');
  const match = css.match(new RegExp(`^${pattern}\\s*\\{([^}]*)\\}`, 'm'));
  expect(match, `no rule found for ${selector}`).not.toBeNull();
  return match?.[1] ?? '';
}

/** A rem length as a number, for comparing against the 44px / 11px floors. */
function rem(value: string): number {
  const match = value.trim().match(/^([\d.]+)rem$/);
  expect(match, `expected a rem length, got "${value}"`).not.toBeNull();
  return Number(match?.[1]);
}

describe('type on a phone', () => {
  it('keeps the tracked caps above a squint', () => {
    const token = css.match(/--t-eyebrow:\s*clamp\(([^)]+)\)/);
    expect(token, 'tokens.css needs a fluid --t-eyebrow').not.toBeNull();

    const [floor] = (token?.[1] ?? '').split(',').map((part) => part.trim());
    // The floor is the size a 390px phone actually renders (the vw term is
    // smaller than it at that width), so this is the number that matters.
    expect(rem(floor ?? '')).toBeGreaterThanOrEqual(0.72);
  });

  it('is the one token the small labels share', () => {
    // Eyebrows, nav links, button labels and countdown labels all read from it,
    // so the floor above lifts every one of them at once.
    for (const selector of ['.site-nav__links a', '.btn']) {
      expect(block(selector)).toMatch(/font-size:\s*var\(--t-eyebrow\)/);
    }
  });
});

describe('thumbs on a phone', () => {
  it('gives every button a 44px target', () => {
    expect(rem(block('.btn').match(/min-height:\s*([^;]+)/)?.[1] ?? '0rem')).toBeGreaterThanOrEqual(
      2.75,
    );
  });

  it('grows the nav hit areas to 44px without moving the bar', () => {
    const hitArea = block('.site-nav__mark::after, .site-nav__links a::after');
    expect(hitArea).toMatch(/content:\s*''/);
    expect(hitArea).toMatch(/position:\s*absolute/);
    // Negative for anything shorter than 44px — which is why one rule fits the
    // 27px wordmark and the 34px links alike.
    expect(hitArea).toMatch(/inset-block:\s*calc\(\(100%\s*-\s*2\.75rem\)\s*\/\s*2\)/);
  });

  it('anchors those hit areas to the link, not to the bar', () => {
    // Without a positioned link the pseudo-element would stretch over the whole
    // nav and swallow its neighbours.
    for (const selector of ['.site-nav__mark', '.site-nav__links a']) {
      expect(block(selector)).toMatch(/position:\s*relative/);
    }
  });

  it('leaves the hit areas somewhere to grow', () => {
    // The wordmark is a direct child of the bar, so its pseudo-element grows
    // into the bar's own padding. The links are not: they sit in a strip that
    // scrolls sideways, and `overflow-x: auto` clips the y axis too — the
    // pseudo-elements were cut off at the strip and the links stayed 37px tall.
    // The overhang is (2.75rem - 100%) / 2, which is 4.1px for a 36.8px link
    // (the percentage resolves against the link's padding box, not its border
    // box), so the strip has to be padded by at least that much...
    const strip = block('.site-nav__links');
    const padding = strip.match(/padding-block:\s*([^;]+)/)?.[1] ?? '0rem';
    expect(rem(padding)).toBeGreaterThanOrEqual(0.3);

    // ...and pull the same amount back, so the fixed bar keeps its height and
    // the links keep their place on the baseline.
    const margin = strip.match(/margin-block:\s*([^;]+)/)?.[1] ?? '0rem';
    expect(margin.trim()).toBe(`-${padding.trim()}`);
  });

  it('gives the candle a thumb-wide button', () => {
    // A 6px stick and a small flame made a 41px button: tall enough to hit by
    // luck, not by design.
    expect(rem(block('.candle').match(/min-width:\s*([^;]+)/)?.[1] ?? '0rem')).toBeGreaterThanOrEqual(
      2.75,
    );
  });

  it('covers the two circles the first pass left behind', () => {
    // The letter's close is 36.8px and a wish's remove is 30.4px — both under
    // the floor, and the remove is the smallest target on the page. Neither
    // can simply grow: the circle *is* the button, so the hit area grows
    // behind it instead, exactly as the nav links do.
    for (const selector of ['.letter__close', '.wish-card__remove']) {
      // Anchored to the button, or the pseudo-element would stretch over the
      // dialog / the whole card.
      expect(block(selector)).toMatch(/position:\s*(absolute|relative)/);

      const hitArea = block(`${selector}::after`);
      expect(hitArea).toMatch(/content:\s*''/);
      expect(hitArea).toMatch(/position:\s*absolute/);
      // Negative for both sizes, so one rule fits the 36.8px circle and the
      // 30.4px one alike.
      expect(hitArea).toMatch(/inset:\s*calc\(\(100%\s*-\s*2\.75rem\)\s*\/\s*2\)/);
    }
  });
});

describe('the stamp on a phone', () => {
  it('stops shrinking its label below the shared floor', () => {
    // 0.55rem was 8.8px on a phone: the smallest tracked caps on the page, in
    // the ornament most likely to be looked at closely. Reading from the token
    // means the floor test above covers it too.
    expect(block('.stamp__label')).toMatch(/font-size:\s*var\(--t-eyebrow\)/);
  });
});

describe('the letter dialog on a phone', () => {
  it('is not trapped under the fixed nav', () => {
    // `.section` is `position: relative; z-index: 1`, and a stacking context
    // caps everything inside it: the dialog's own `z-index: 80` only competed
    // within the letter, so the fixed nav (40) painted over the top of the
    // dialog — and over the first pixels of its close button, which is exactly
    // where a thumb lands. The section has to join the dialog's layer while the
    // letter is open.
    const nav = Number(css.match(/--z-nav:\s*(\d+)/)?.[1] ?? '0');
    const modal = Number(css.match(/--z-modal:\s*(\d+)/)?.[1] ?? '0');

    expect(block('body.is-letter-open .letter')).toMatch(/z-index:\s*var\(--z-modal\)/);
    // And the token really does sit above the nav, or the rule fixes nothing.
    expect(modal).toBeGreaterThan(nav);
  });
});
