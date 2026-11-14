import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { boot, sectionDefinitions, type BootedApp } from '../app';
import { BUILT_SECTIONS, FOOT, RECIPIENT } from '../content';

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
  // jsdom does not implement scrolling; the app must still be able to call it.
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2000 });
});

afterEach(() => {
  app?.destroy();
  app = null;
  document.body.innerHTML = '';
  document.body.className = '';
  document.title = '';
});

describe('section registry', () => {
  it('builds exactly the sections it declares as built', () => {
    expect(sectionDefinitions().map((definition) => definition.id)).toEqual([...BUILT_SECTIONS]);
  });
});

describe('boot', () => {
  it('mounts every built section into the page', () => {
    app = boot();

    for (const id of BUILT_SECTIONS) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(document.getElementById('opening-title')).not.toBeNull();
    expect(document.getElementById('countdown-title')).not.toBeNull();
    expect(document.getElementById('portrait-title')).not.toBeNull();
  });

  it('renders the navigation from the sections that exist', () => {
    app = boot();
    const links = Array.from(document.querySelectorAll('[data-nav-link]'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      BUILT_SECTIONS.map((id) => `#${id}`),
    );
  });

  it('renders the footer from the content file, with the right year', () => {
    app = boot();
    const footer = document.querySelector('.site-foot');
    const expected = FOOT.format
      .replace('{name}', RECIPIENT.firstName)
      .replace('{year}', String(new Date().getFullYear()));

    expect(footer?.textContent).toContain(expected);
    expect(footer?.textContent).toContain(FOOT.note);
  });

  it('shows the one real portrait with correct dimensions', () => {
    app = boot();
    const image = document.querySelector<HTMLImageElement>('.polaroid__frame img');
    expect(image?.getAttribute('src')).toBe('./assets/fitria-portrait.jpg');
    expect(image?.getAttribute('width')).toBe('720');
    expect(image?.getAttribute('height')).toBe('1280');
    expect(image?.getAttribute('loading')).toBe('eager');
  });

  it('leaves the chrome hidden until the surprise is opened', () => {
    app = boot();
    expect(document.querySelector('[data-nav]')?.hasAttribute('hidden')).toBe(true);
    expect(document.querySelector('[data-foot]')?.hasAttribute('hidden')).toBe(true);
  });

  it('opens for real when the button is pressed', () => {
    app = boot();

    const cta = document.querySelector<HTMLButtonElement>('[data-open-surprise]');
    expect(cta).not.toBeNull();
    cta?.click();

    expect(document.body.classList.contains('is-open')).toBe(true);
    expect(document.querySelector('[data-nav]')?.hasAttribute('hidden')).toBe(false);
    expect(document.querySelector('[data-foot]')?.hasAttribute('hidden')).toBe(false);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('can be torn down without leaving listeners behind', () => {
    const opened = boot();
    const cta = document.querySelector<HTMLButtonElement>('[data-open-surprise]');
    opened.destroy();

    cta?.click();
    expect(document.body.classList.contains('is-open')).toBe(false);
  });

  it('refuses to crash when the mount point is missing', () => {
    document.querySelector('[data-app]')?.remove();
    expect(() => {
      app = boot();
    }).not.toThrow();
  });
});

describe('accessibility of the shell', () => {
  it('labels every section by its own heading', () => {
    app = boot();
    for (const id of BUILT_SECTIONS) {
      const section = document.getElementById(id);
      const labelledBy = section?.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(document.getElementById(labelledBy ?? '')).not.toBeNull();
    }
  });

  it('gives the opening page a real h1 and keeps headings in order', () => {
    app = boot();
    const h1s = document.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe('A LITTLE WORLD MADE FOR YOU');
  });

  it('marks decorative ornaments as hidden from assistive tech', () => {
    app = boot();
    const ornaments = document.querySelectorAll('.opening__orn, .stamp, .tape, .rule-sprig svg');
    expect(ornaments.length).toBeGreaterThan(0);
    for (const ornament of Array.from(ornaments)) {
      expect(ornament.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
