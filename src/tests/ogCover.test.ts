import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RECIPIENT } from '../content';

/**
 * The social card is a picture, and a picture is the one thing a test suite
 * cannot read. What it *can* hold is where the picture comes from: the card is
 * drawn by scripts/og-cover.html out of the site's own ornaments and the site's
 * own palette, so these tests keep that page from quietly becoming a second,
 * hand-copied drawing of the cake that drifts the moment the cake moves.
 */
const page = readFileSync(resolve(process.cwd(), 'scripts/og-cover.html'), 'utf8');
const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const head = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

/** Every colour the design system allows, read from the one place it lives. */
function paletteHexes(): Set<string> {
  const found = tokens.match(/#[0-9A-Fa-f]{6}\b/g) ?? [];
  return new Set(found.map((hex) => hex.toUpperCase()));
}

describe('the social card is drawn from the site', () => {
  it('imports the real ornaments instead of copying them', () => {
    // A hand-copied cake is the failure mode: it looks right until the cake
    // changes. The card has to be built from the same functions the page uses.
    expect(page).toMatch(/from '\.\.\/src\/lib\/svg\.ts'/);
    for (const ornament of ['cake', 'bunting', 'balloon', 'flame']) {
      expect(page).toMatch(new RegExp(`import \\{[^}]*\\b${ornament}\\b[^}]*\\} from '\\.\\.\\/src\\/lib\\/svg\\.ts'`));
    }
  });

  it('takes the name on the card from the content file', () => {
    expect(page).toMatch(/from '\.\.\/src\/content\.ts'/);
    expect(page).toContain('RECIPIENT.firstName');
    // The card must not spell the name itself: one source of truth, or the
    // card is the thing that goes stale.
    expect(page).not.toContain(RECIPIENT.firstName);
  });

  it('shows the cake cut open, the way the page leaves it', () => {
    expect(page).toMatch(/\.cake__gap,\s*\n\s*\.cake__slice\s*\{\s*opacity:\s*1/);
  });

  it('draws the candle the page draws, at the page size', () => {
    // The cake art leaves the space above the top tier empty on purpose: the
    // candle is a separate element on the page, so it has to be one here too.
    expect(page).toContain('candle__flame-wrap');
    expect(page).toMatch(/\.candle__stick\s*\{[^}]*width:\s*6px[^}]*height:\s*32px/);
    expect(page).toMatch(/\.candle\s*\{[^}]*top:\s*0\.5%/);
  });

  it('uses no colour the design system does not define', () => {
    const allowed = paletteHexes();
    const used = (page.match(/#[0-9A-Fa-f]{6}\b/g) ?? []).map((hex) => hex.toUpperCase());
    const strangers = [...new Set(used)].filter((hex) => !allowed.has(hex));

    expect(strangers).toEqual([]);
    // And the palette really was read: an empty allowlist would pass the line
    // above while checking nothing at all.
    expect(allowed.size).toBeGreaterThan(10);
  });

  it('uses no rgb() colour the design system does not define', () => {
    const allowed = new Set(
      [...paletteHexes()].map((hex) => [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ]),
    );

    const triples = [...page.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)].map(
      (match) => [Number(match[1]), Number(match[2]), Number(match[3])] as const,
    );

    const strangers = triples.filter(
      ([r, g, b]) => ![...allowed].some(([ar, ag, ab]) => ar === r && ag === g && ab === b),
    );

    expect(strangers).toEqual([]);
    expect(triples.length).toBeGreaterThan(0);
  });

  it('draws on a stage exactly the size the head advertises', () => {
    const width = Number(head.match(/og:image:width"\s+content="(\d+)"/)?.[1]);
    const height = Number(head.match(/og:image:height"\s+content="(\d+)"/)?.[1]);

    expect(page).toMatch(new RegExp(`width:\\s*${width}px`));
    expect(page).toMatch(new RegExp(`height:\\s*${height}px`));
  });

  it('places the confetti by arithmetic, never at random', () => {
    // Redrawing the card twice has to produce the same picture, or every
    // regeneration shows up as a diff nobody can review.
    expect(page).not.toMatch(/Math\.random/);
    expect(page).toMatch(/const CONFETTI = \[/);
  });
});
