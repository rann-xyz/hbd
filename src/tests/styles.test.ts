import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `setHidden` only flips the `hidden` attribute, so the stylesheet has to make
 * that attribute win everywhere. A component class that sets `display` (flex,
 * grid, inline-flex) outranks a bare attribute selector — the "light it again"
 * button and the wish list stayed on screen while the code believed they were
 * hidden. jsdom does not run the real cascade, so this reads the CSS instead.
 *
 * The classes below are not hand-listed: they are derived from the call sites,
 * so a new `setHidden(...)` on a display-setting component fails this test
 * until the global rule covers it.
 */

const root = process.cwd();
const stylesDir = resolve(root, 'src/styles');
const srcDir = resolve(root, 'src');

const styleFiles = ['tokens.css', 'base.css', 'components.css', 'layout.css'];
const css = styleFiles
  .map((file) => readFileSync(resolve(stylesDir, file), 'utf8'))
  .join('\n');

const base = readFileSync(resolve(stylesDir, 'base.css'), 'utf8');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'tests') walk(path);
      } else if (entry.name.endsWith('.ts')) {
        out.push(path);
      }
    }
  };
  walk(srcDir);
  return out;
}

/** Classes on the element a `[data-*]` selector in index.html points at. */
function classesForHtmlSelector(selector: string): string[] {
  const attr = selector.replace(/^\[|\]$/g, '');
  const tag = html.match(new RegExp(`<[^>]*\\b${attr}(?=[\\s>=/])[^>]*>`));
  const cls = tag?.[0].match(/class="([^"]*)"/);
  return cls ? (cls[1] ?? '').split(/\s+/).filter(Boolean) : [];
}

function classListOf(snippet: string): string[] {
  const cls = snippet.slice(0, 400).match(/className:\s*['"]([^'"]*)['"]/);
  return cls ? (cls[1] ?? '').split(/\s+/).filter(Boolean) : [];
}

/**
 * Trace an identifier used as a `setHidden` target back to the classes on the
 * element it holds: `const x = el(...)`, `const x = qs<T>('[data-*]')`, or
 * `const x = someMap.get(...)` where `someMap.set(key, built)` stores an `el`.
 *
 * `before` is the offset of the reference: the nearest preceding declaration
 * wins. Names are reused across functions (`nav` is both the header element and
 * the inner link list built later in the file), so the closest binding is the
 * only safe attribution.
 */
function resolveClasses(ident: string, scope: string, before: number, depth = 0): string[] {
  if (depth > 3) return [];

  const decl = new RegExp(`const\\s+${ident}\\s*=\\s*([^;\\n]+)`, 'g');
  let binding: RegExpMatchArray | undefined;
  for (const match of scope.matchAll(decl)) {
    if ((match.index ?? 0) < before) binding = match;
  }
  if (!binding) return [];

  const init = (binding[1] ?? '').trim();

  if (/^el\b/.test(init)) return classListOf(scope.slice(binding.index));

  const queried = init.match(/^qs<[^>]*>\(\s*['"]([^'"]+)['"]/);
  if (queried) return classesForHtmlSelector(queried[1] ?? '');

  const fromMap = init.match(/^([\w$]+)\.get\(/);
  if (!fromMap) return [];

  const setter = new RegExp(
    `\\b${fromMap[1]}\\.set\\(\\s*[^,]+,\\s*([A-Za-z_$][\\w$]*)\\s*\\)`,
    'g',
  );
  const out: string[] = [];
  for (const stored of scope.matchAll(setter)) {
    out.push(...resolveClasses(stored[1] ?? '', scope, stored.index ?? 0, depth + 1));
  }
  return out;
}

/** Every class that is ever handed to `setHidden`, traced back to its source. */
function hiddenClasses(): Set<string> {
  const classes = new Set<string>();
  const unresolved: string[] = [];

  for (const file of sourceFiles()) {
    const text = readFileSync(file, 'utf8');
    // Skip the definition itself; it takes the element as a parameter.
    if (/(?:export\s+)?function\s+setHidden\b/.test(text)) continue;

    for (const call of text.matchAll(/setHidden\(\s*([A-Za-z_$][\w$]*)/g)) {
      const ident = call[1] ?? '';
      const found = resolveClasses(ident, text, call.index ?? 0);
      if (found.length === 0) {
        unresolved.push(`${ident} (${file.slice(root.length + 1)})`);
      }
      found.forEach((c) => classes.add(c));
    }
  }

  expect(unresolved, 'every setHidden target must trace back to a class').toEqual([]);
  return classes;
}

/** Does this class, on its own, give the element a non-`none` display box? */
function setsOwnDisplay(cls: string): boolean {
  const escaped = cls.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const re = new RegExp(`\\.${escaped}(?![\\w:-])`, 'g');
  for (const match of css.matchAll(re)) {
    const block = css.slice(match.index, css.indexOf('}', match.index) + 1);
    for (const display of block.matchAll(/display:\s*([^;}]+)/g)) {
      if ((display[1] ?? '').trim() !== 'none') return true;
    }
  }
  return false;
}

const hidden = hiddenClasses();
const loadBearing = [...hidden].filter(setsOwnDisplay);
console.log('hidden:', [...hidden].sort().join(' '));
console.log('loadBearing:', [...loadBearing].sort().join(' '));

describe('the [hidden] attribute', () => {
  it('is honoured globally, not only per component', () => {
    const rule = base.match(/^\[hidden\]\s*\{([^}]*)\}/m);

    expect(rule, 'base.css needs a bare [hidden] rule').not.toBeNull();
    expect(rule?.[1]).toMatch(/display:\s*none/);
    expect(rule?.[1]).toMatch(/!important/);
  });

  it('is load-bearing: hidden elements do set their own display', () => {
    // If this ever empties out the derivation went blind, not the CSS.
    expect(hidden.size).toBeGreaterThan(0);
    expect(loadBearing.length).toBeGreaterThan(0);

    // The two the regression report named: the wish list sets `display: grid`,
    // the relight button gets `display: inline-flex` from `.btn`.
    expect(loadBearing).toContain('wishes');
    expect(loadBearing).toContain('btn');
  });

  it('names every component that depends on it', () => {
    // A bare attribute selector loses to a class, so these are the elements
    // whose own `display` would otherwise win. Update this list deliberately
    // when a new hidden-toggled component is added.
    expect([...loadBearing].sort()).toEqual([
      'btn',
      'countdown__grid',
      'letter-modal',
      'site-nav',
      'wishes',
    ]);
  });
});
