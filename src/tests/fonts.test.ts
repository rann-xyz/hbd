import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { boot, type BootedApp } from '../app';

/**
 * The type is the heaviest thing this page loads — ~190 KB of woff2 against
 * ~30 KB of application — and it arrives over a second origin, after a
 * render-blocking stylesheet that used to declare every weight the design
 * system owns rather than the seven faces the page actually paints.
 *
 * Two promises are held here, both offline: the request declares no weight the
 * page never paints, and the preloads name real latin faces of the families
 * that paint first. The URLs themselves were read off the served Google CSS
 * (curl with a Chrome user agent) and cannot be re-derived without the network
 * — what a test can do is refuse a malformed or duplicated one, and refuse a
 * preload for a family the page does not use.
 *
 * "Paints" is read from the built page, not from the text of the stylesheets.
 * A text scan cannot see the one face that matters most here: `.accent` sets
 * `font-style: italic` and nothing else, so inside a 300-weight heading it
 * selects Cormorant Garamond 300 italic — a face that exists in no rule of its
 * own. jsdom will not resolve that inheritance for us either (it returns an
 * empty `fontFamily` for an inherited font), so the cascade for these three
 * properties is walked here: nearest ancestor that declares the property wins,
 * later rule wins within one element. Specificity is ignored — no two rules in
 * this stylesheet disagree on a font property for the same element.
 */

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const stylesDir = resolve(process.cwd(), 'src/styles');
const css = readdirSync(stylesDir)
  .filter((file) => file.endsWith('.css'))
  .map((file) => readFileSync(resolve(stylesDir, file), 'utf8'))
  .join('\n');

/** The three families, as the tokens name them. */
const TOKEN_FAMILIES: Record<string, string> = {
  '--font-display': 'Cormorant Garamond',
  '--font-body': 'DM Sans',
  '--font-hand': 'Caveat',
};

interface Face {
  readonly family: string;
  readonly weight: number;
  readonly italic: boolean;
}

interface Rule {
  readonly selectors: string[];
  readonly family?: string;
  readonly weight?: number;
  readonly italic?: boolean;
}

/** Every rule that touches a font property, in source order, media blocks inlined. */
function fontRules(source: string): Rule[] {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  let index = 0;
  let preludeStart = 0;

  while (index < clean.length) {
    if (clean[index] !== '{') {
      index += 1;
      continue;
    }

    const prelude = clean.slice(preludeStart, index).trim();
    let depth = 1;
    let end = index + 1;
    while (end < clean.length && depth > 0) {
      if (clean[end] === '{') depth += 1;
      else if (clean[end] === '}') depth -= 1;
      end += 1;
    }
    const body = clean.slice(index + 1, end - 1);

    if (prelude.startsWith('@')) {
      // A conditional group still paints somewhere: read its rules too.
      if (/^@(media|supports|layer|container)/.test(prelude)) rules.push(...fontRules(body));
    } else {
      const family = body.match(/font-family:\s*var\((--font-[\w-]+)\)/)?.[1];
      const weight = body.match(/font-weight:\s*(\d+)/)?.[1];
      const italic = /font-style:\s*italic/.test(body);
      if (family || weight || italic) {
        rules.push({
          selectors: prelude.split(',').map((selector) => selector.trim()).filter(Boolean),
          ...(family && TOKEN_FAMILIES[family] ? { family: TOKEN_FAMILIES[family] } : {}),
          ...(weight ? { weight: Number(weight) } : {}),
          ...(italic ? { italic: true } : {}),
        });
      }
    }

    index = end;
    preludeStart = end;
  }

  return rules;
}

const RULES = fontRules(css);

/** The same shell index.html provides, minus the module script. */
function shell(): void {
  document.body.innerHTML = `
    <a class="skip-link" href="#story">Skip</a>
    <div class="progress-rail"><span data-progress-fill></span></div>
    <header class="site-nav" data-nav hidden>
      <a class="site-nav__mark" href="#opening" data-nav-mark>Fitria &amp; Agis</a>
      <nav class="site-nav__links" data-nav-links></nav>
    </header>
    <main id="story" data-app></main>
    <footer class="site-foot" data-foot hidden></footer>
  `;
}

let app: BootedApp | null = null;

beforeEach(() => {
  shell();
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2000 });
  app = boot();
});

afterEach(() => {
  app?.destroy();
  app = null;
  document.body.innerHTML = '';
});

/** Every (family, weight, style) the built page can select, over-approximated. */
function facesPainted(): Face[] {
  const faces: Face[] = [];

  for (const node of document.querySelectorAll<HTMLElement>('*')) {
    // Screen-reader-only text is clipped to a pixel: it paints nothing, so it
    // cannot justify a face. (It is the one place a UA bold would show up.)
    if (node.closest('.sr-only')) continue;

    let family: string | undefined;
    let weight: number | undefined;
    let italic: boolean | undefined;

    for (let cursor: Element | null = node; cursor; cursor = cursor.parentElement) {
      // Later rule wins within one element; the nearest element that declares
      // a property wins over anything further up.
      let ownFamily: string | undefined;
      let ownWeight: number | undefined;
      let ownItalic: boolean | undefined;

      for (const rule of RULES) {
        const matches = rule.selectors.some((selector) => {
          try {
            return cursor?.matches(selector) ?? false;
          } catch {
            return false;
          }
        });
        if (!matches) continue;
        if (rule.family) ownFamily = rule.family;
        if (rule.weight !== undefined) ownWeight = rule.weight;
        if (rule.italic) ownItalic = true;
      }

      if (family === undefined && ownFamily) family = ownFamily;
      if (weight === undefined && ownWeight !== undefined) weight = ownWeight;
      if (italic === undefined && ownItalic) italic = ownItalic;
      if (family && weight !== undefined && italic !== undefined) break;
    }

    if (!family) continue;
    faces.push({ family, weight: weight ?? 400, italic: italic ?? false });
  }

  return faces;
}

/**
 * The families and axis tuples the Google Fonts request asks for, parsed out of
 * the stylesheet href: `family=Name:ital,wght@0,300;1,400`.
 */
function facesRequested(): Face[] {
  const href = html.match(/href="https:\/\/fonts\.googleapis\.com\/css2\?([^"]+)"/)?.[1] ?? '';
  const faces: Face[] = [];

  for (const match of href.matchAll(/family=([^&:]+)(?::([^&]+))?/g)) {
    const family = decodeURIComponent((match[1] ?? '').replace(/\+/g, ' '));
    const axes = (match[2] ?? 'wght@400').split('@');
    const names = (axes[0] ?? 'wght').split(',');
    const tuples = (axes[1] ?? '400').split(';');

    for (const tuple of tuples) {
      const values = tuple.split(',');
      const face: { family: string; weight: number; italic: boolean } = {
        family,
        weight: 400,
        italic: false,
      };
      for (const [index, name] of names.entries()) {
        const value = values[index] ?? '';
        if (name === 'ital') face.italic = value === '1';
        // A range (`9..40`) is an optical size, not a weight: take its floor.
        if (name === 'wght') face.weight = Number(value.split('..')[0]);
      }
      faces.push(face);
    }
  }

  return faces;
}

const key = (face: Face): string => `${face.family}|${face.weight}|${face.italic}`;

describe('the webfont request', () => {
  it('parsed both sides, rather than silently comparing nothing', () => {
    expect(facesRequested().length).toBeGreaterThanOrEqual(5);
    expect(facesPainted().length).toBeGreaterThan(30);
  });

  it('reads the italic accent out of the heading it sits in', () => {
    // The whole reason this file walks the cascade: no rule names this face.
    const accent = document.querySelector('.accent');
    expect(accent).not.toBeNull();
    expect(accent?.parentElement?.classList.contains('h2')).toBe(true);

    expect([...new Set(facesPainted().map(key))]).toContain('Cormorant Garamond|300|true');
  });

  it('asks for exactly the families the page paints, and no others', () => {
    const requested = [...new Set(facesRequested().map((face) => face.family))].sort();
    const painted = [...new Set(facesPainted().map((face) => face.family))].sort();

    expect(requested).toEqual(painted);
  });

  it('declares no weight the page never paints', () => {
    const painted = new Set(facesPainted().map(key));
    const strangers = facesRequested().map(key).filter((face) => !painted.has(face));

    expect([...new Set(strangers)]).toEqual([]);
  });

  it('asks for every weight the page paints', () => {
    const requested = new Set(facesRequested().map(key));
    const missing = facesPainted().map(key).filter((face) => !requested.has(face));

    // A face the page selects but never requested is a synthetic bold or an
    // oblique the browser draws itself.
    expect([...new Set(missing)]).toEqual([]);
  });
});

describe('the font preloads', () => {
  const preloads = [...html.matchAll(/<link\s+rel="preload"[^>]*>/g)].map((match) => match[0]);

  it('preloads the faces that paint above the fold, and only those', () => {
    expect(preloads.length).toBe(3);
    expect(preloads.every((tag) => /as="font"/.test(tag))).toBe(true);
    expect(preloads.every((tag) => /type="font\/woff2"/.test(tag))).toBe(true);
    // Fonts are fetched in CORS mode: without this the preload is discarded
    // and the browser fetches the file a second time.
    expect(preloads.every((tag) => /crossorigin/.test(tag))).toBe(true);
  });

  it('names one latin face per family that paints first', () => {
    const hrefs = preloads.map((tag) => tag.match(/href="([^"]+)"/)?.[1] ?? '');
    const families = hrefs.map((href) => href.match(/\/s\/([a-z]+)\/v\d+\//)?.[1] ?? '');

    expect(families.sort()).toEqual(['cormorantgaramond', 'cormorantgaramond', 'dmsans']);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs.every((href) => href.endsWith('.woff2'))).toBe(true);
  });

  it('preloads the upright and the italic of the display face separately', () => {
    // Cormorant Garamond is served as two files, one per style: preloading
    // only the upright leaves the name line waiting behind the stylesheet.
    const hrefs = preloads.map((tag) => tag.match(/href="([^"]+)"/)?.[1] ?? '');
    const cormorant = hrefs.filter((href) => href.includes('/cormorantgaramond/'));

    expect(new Set(cormorant).size).toBe(2);
  });
});
