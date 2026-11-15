import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The palette holds two kinds of rose and two kinds of cocoa: washes, which are
 * translucent and only ever meant to sit *behind* something, and ink, which is
 * opaque and meant to be read.
 *
 * tokens.css says exactly that beside the token — "Dusty rose is a fill colour:
 * as text it reads at 2.6:1. This deeper rose carries the handwritten voice at
 * 4.9:1" — and the cake banner still shipped as `color: var(--rose-ink)`: 24px
 * of real words at 1.63:1 against the cream page. No test could see it, because
 * jsdom has neither a cascade nor a contrast ratio. This one can: it reads the
 * stylesheet the way a browser would and refuses a wash as ink.
 *
 * The ratio itself was measured in Chromium at 390px, not here.
 */

const stylesDir = resolve(process.cwd(), 'src/styles');
const FILES = ['tokens.css', 'base.css', 'components.css', 'layout.css'];

const css = FILES.map((file) => readFileSync(resolve(stylesDir, file), 'utf8')).join('\n');
const tokens = readFileSync(resolve(stylesDir, 'tokens.css'), 'utf8');

/** Tokens that are washes. `--cocoa-faint` is not one of them: it reads at 5.3:1. */
const FILL_TOKENS = ['--rose-ink', '--cocoa-hair', '--cocoa-veil'];

/**
 * On these, `color` is not text — it is the ink for `currentColor` strokes
 * inside an aria-hidden ornament, where a translucent wash is the point.
 * Update this list deliberately when another ornament container is added.
 */
const ORNAMENT_SELECTORS = [
  '.opening__orn',
  '.portrait__bow',
  '.closing__bloom',
  '.site-foot__sprig',
  '.rule-sprig',
];

interface Declaration {
  readonly selector: string;
  readonly text: string;
}

/**
 * Every declaration in the stylesheet, paired with the selector it lives under.
 * At-rule wrappers are dropped, so a rule inside `@media` reports its own
 * selector rather than the media query.
 */
function declarations(source: string): Declaration[] {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Declaration[] = [];
  const open: string[] = [];
  let buffer = '';

  const flush = (): void => {
    const selector = open
      .filter((part) => part !== '' && !part.startsWith('@'))
      .join(' ');
    for (const part of buffer.split(';')) {
      const text = part.trim();
      if (text !== '') out.push({ selector, text });
    }
    buffer = '';
  };

  for (const character of clean) {
    if (character === '{') {
      open.push(buffer.trim());
      buffer = '';
    } else if (character === '}') {
      flush();
      open.pop();
    } else {
      buffer += character;
    }
  }

  return out;
}

const DECLARATIONS = declarations(css);

/** Does this declaration set the `color` property itself, and to a fill token? */
function fillTokenInk(declaration: Declaration): string | null {
  const match = declaration.text.match(/^color:\s*var\((--[\w-]+)\)/);
  if (!match) return null;
  const token = match[1] ?? '';
  return FILL_TOKENS.includes(token) ? token : null;
}

describe('a wash is never ink', () => {
  it('parsed the stylesheet, rather than silently seeing nothing', () => {
    // If the parser goes blind this suite passes for the wrong reason.
    expect(DECLARATIONS.length).toBeGreaterThan(200);
    expect(DECLARATIONS.some((d) => d.selector === '.cake__banner')).toBe(true);
  });

  it('still uses the fill tokens, as fills', () => {
    // The rule below is only meaningful while these tokens are in use.
    for (const token of FILL_TOKENS) {
      const used = DECLARATIONS.some(
        (d) => d.text.includes(`var(${token})`) && fillTokenInk(d) === null,
      );
      expect(used, `${token} is no longer used as a fill`).toBe(true);
    }
  });

  it('has no `color:` that resolves to a translucent token', () => {
    const offenders = DECLARATIONS.filter((declaration) => {
      if (fillTokenInk(declaration) === null) return false;
      const selectors = declaration.selector.split(',').map((part) => part.trim());
      return !selectors.some((selector) => ORNAMENT_SELECTORS.includes(selector));
    });

    expect(offenders.map((d) => `${d.selector} { ${d.text} }`)).toEqual([]);
  });

  it('keeps the two roses distinct — one is a wash, one is opaque ink', () => {
    const roseInk = tokens.match(/--rose-ink:\s*([^;]+);/)?.[1]?.trim() ?? '';
    const roseText = tokens.match(/--rose-text:\s*([^;]+);/)?.[1]?.trim() ?? '';

    expect(roseInk, '--rose-ink is the wash').toMatch(/^rgba\([^)]*,\s*0?\.\d+\)$/);
    expect(roseText, '--rose-text is the ink').toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('gives the cake banner the ink token', () => {
    // The regression this file exists for: 24px of birthday greeting at 1.63:1.
    const banner = DECLARATIONS.filter((d) =>
      d.selector.split(',').map((part) => part.trim()).includes('.cake__banner'),
    );
    const colour = banner.find((d) => d.text.startsWith('color:'));

    expect(colour?.text).toBe('color: var(--rose-text)');
  });
});
