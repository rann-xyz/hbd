/* ============================================================
   APP SHELL — mounts the built sections, wires the chrome
   (navigation, reading progress, footer), and owns the one
   interaction that spans sections: opening the surprise.
   ============================================================ */

import { BUILT_SECTIONS, COUNTDOWN_COPY, FOOT, RECIPIENT, navEntriesFor } from './content';
import { clear, el, qs, setHidden, toggleClass } from './lib/dom';
import { createMusicBox, shouldAutoStart, TUNE_REQUEST_EVENT, type MusicBox } from './lib/music';
import { prefersReducedMotion, revealOnScroll, scrollToElement } from './lib/motion';
import { sprig } from './lib/svg';
import { buildCake } from './sections/cake';
import { buildClosing } from './sections/closing';
import { buildCountdown, type CountdownController } from './sections/countdown';
import { buildJournal } from './sections/journal';
import { buildLetter } from './sections/letter';
import { buildMusicControl, type MusicControlHandle } from './sections/music';
import { buildNotes } from './sections/notes';
import { buildOpening, OPEN_EVENT } from './sections/opening';
import { buildPortrait } from './sections/portrait';

export interface SectionInstance {
  readonly id: string;
  readonly element: HTMLElement;
  destroy?(): void;
}

export interface SectionDefinition {
  readonly id: string;
  build(): SectionInstance;
}

export function sectionDefinitions(): SectionDefinition[] {
  const built = new Set<string>(BUILT_SECTIONS);
  const definitions: SectionDefinition[] = [];

  if (built.has('opening')) {
    definitions.push({ id: 'opening', build: () => ({ id: 'opening', element: buildOpening() }) });
  }
  if (built.has('countdown')) {
    definitions.push({
      id: 'countdown',
      build: () => {
        const controller: CountdownController = buildCountdown();
        return { id: 'countdown', element: controller.element, destroy: () => controller.destroy() };
      },
    });
  }
  if (built.has('portrait')) {
    definitions.push({ id: 'portrait', build: () => ({ id: 'portrait', element: buildPortrait() }) });
  }
  if (built.has('letter')) {
    definitions.push({
      id: 'letter',
      build: () => {
        const handle = buildLetter();
        return { id: 'letter', element: handle.element, destroy: () => handle.destroy() };
      },
    });
  }
  if (built.has('notes')) {
    definitions.push({
      id: 'notes',
      build: () => {
        const handle = buildNotes();
        return { id: 'notes', element: handle.element, destroy: () => handle.destroy() };
      },
    });
  }
  if (built.has('wish')) {
    definitions.push({
      id: 'wish',
      build: () => {
        const handle = buildCake();
        return { id: 'wish', element: handle.element, destroy: () => handle.destroy() };
      },
    });
  }
  if (built.has('journal')) {
    definitions.push({
      id: 'journal',
      build: () => {
        const handle = buildJournal();
        return { id: 'journal', element: handle.element, destroy: () => handle.destroy() };
      },
    });
  }
  if (built.has('closing')) {
    definitions.push({ id: 'closing', build: () => ({ id: 'closing', element: buildClosing() }) });
  }

  return definitions;
}

function buildNav(ids: readonly string[]): HTMLElement {
  const entries = navEntriesFor(ids);
  const nav = el('nav', { className: 'site-nav__links', attrs: { 'aria-label': 'Sections' } });
  for (const entry of entries) {
    nav.append(
      el('a', {
        text: entry.label,
        attrs: { href: `#${entry.id}`, 'data-nav-link': entry.id },
      }),
    );
  }
  return nav;
}

function buildFooter(): HTMLElement {
  const year = String(new Date().getFullYear());
  const format = FOOT.format.replace('{name}', RECIPIENT.firstName).replace('{year}', year);
  // Hidden until the surprise is opened, matching the shell in index.html.
  const footer = el('footer', { className: 'site-foot', attrs: { 'data-foot': '', hidden: '' } });
  footer.append(
    el('div', { className: 'site-foot__rule' }),
    el('p', { className: 'small', text: format }),
    el('p', { className: 'small hand', text: FOOT.note }),
    el('span', { className: 'site-foot__sprig', attrs: { 'aria-hidden': 'true' }, children: [sprig(30)] }),
  );
  return footer;
}

/** Reading progress along the top hairline. */
function trackProgress(fill: HTMLElement): () => void {
  let frame = 0;

  const update = (): void => {
    frame = 0;
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - window.innerHeight;
    const ratio = scrollable <= 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / scrollable));
    fill.style.width = `${(ratio * 100).toFixed(2)}%`;
  };

  const schedule = (): void => {
    if (frame !== 0) return;
    frame = window.requestAnimationFrame(update);
  };

  update();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });

  return () => {
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
  };
}

/** Highlight the section currently being read. */
function trackActiveSection(links: readonly HTMLAnchorElement[], sections: readonly HTMLElement[]): () => void {
  if (links.length === 0) return () => {};

  const setActive = (id: string): void => {
    for (const link of links) {
      link.setAttribute('aria-current', link.dataset['navLink'] === id ? 'true' : 'false');
    }
  };

  if (typeof IntersectionObserver === 'undefined') return () => {};

  // A ratio threshold cannot work here: the observation band is only ~20% of
  // the viewport while the tallest sections are taller than the window, so
  // their intersection ratio never reaches a high threshold and they would
  // never be reported. Track plain overlap (threshold 0) and let the reading
  // line — a third of the way down the viewport — pick the current section.
  const visible = new Set<Element>();

  const pick = (): HTMLElement | null => {
    const line = window.innerHeight * 0.35;
    let best: HTMLElement | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const section of sections) {
      if (!visible.has(section)) continue;
      const rect = section.getBoundingClientRect();
      const distance =
        rect.top <= line && rect.bottom > line
          ? 0
          : Math.min(Math.abs(rect.top - line), Math.abs(rect.bottom - line));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = section;
      }
    }

    return best;
  };

  const sync = (): void => {
    // At the very bottom the reading line can sit in the footer, where no
    // section overlaps the band any more: the last section is the answer.
    const atBottom =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    const target = atBottom ? sections[sections.length - 1] : pick();
    if (target?.id) setActive(target.id);
  };

  // The visible set only changes when a section crosses the observation band,
  // but which section holds the reading line changes on every scroll frame —
  // including while the set stays the same. Two sections share the band
  // whenever one is taller than the window, so the last intersection event
  // alone leaves the highlight a section behind; smooth scrolling makes it
  // worse by settling on a position that fires no further event at all. Drive
  // the pick from scroll frames too, the way the progress rail does.
  let frame = 0;
  const schedule = (): void => {
    if (frame !== 0) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      sync();
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      schedule();
    },
    { rootMargin: '-30% 0px -50% 0px', threshold: 0 },
  );

  for (const section of sections) observer.observe(section);

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });

  return () => {
    observer.disconnect();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (frame !== 0) window.cancelAnimationFrame(frame);
  };
}

export interface BootedApp {
  destroy(): void;
}

export interface BootOptions {
  /** Injected by tests so no real AudioContext is ever constructed. */
  readonly musicBox?: MusicBox;
}

export function boot(
  root: Element | null = qs<HTMLElement>('[data-app]'),
  options: BootOptions = {},
): BootedApp {
  const teardown: (() => void)[] = [];

  if (!root) {
    return { destroy: () => {} };
  }

  clear(root);

  const sections = sectionDefinitions().map((definition) => definition.build());

  for (const section of sections) {
    root.append(section.element);
    if (section.destroy) teardown.push(section.destroy);
  }

  const nav = qs<HTMLElement>('[data-nav]');
  const navLinks = qs<HTMLElement>('[data-nav-links]');
  const foot = qs<HTMLElement>('[data-foot]');
  const progress = qs<HTMLElement>('[data-progress-fill]');

  if (nav && navLinks) {
    clear(navLinks);
    navLinks.replaceWith(buildNav(sections.map((section) => section.id)));
  }
  if (foot) {
    const built = buildFooter();
    foot.replaceWith(built);
  }

  // The birthday tune. A runtime without Web Audio simply never gets the
  // control, rather than getting a button that does nothing.
  let musicControl: MusicControlHandle | null = null;
  const music: MusicBox =
    options.musicBox ??
    createMusicBox({
      // Starting the tune can take a moment (the browser may have to resume a
      // suspended context), so the button follows the box rather than assuming
      // the play() call landed.
      onStateChange: () => musicControl?.sync(),
    });

  if (music.available && typeof document !== 'undefined' && document.body) {
    musicControl = buildMusicControl(music);
    document.body.append(musicControl.element);
    teardown.push(() => musicControl?.destroy());
  }

  // The cake asks for the tune instead of owning a player of its own. When
  // there is no Web Audio to play into, the ask is taken off the page rather
  // than left as a button that does nothing.
  const wishSection = qs<HTMLElement>('#wish');
  if (wishSection && !music.available) wishSection.setAttribute('data-tune', 'off');

  const onTuneRequest = (): void => {
    if (!music.available) return;
    musicControl?.reveal();
    music.play();
    musicControl?.sync();
  };
  root.addEventListener(TUNE_REQUEST_EVENT, onTuneRequest);
  teardown.push(() => root.removeEventListener(TUNE_REQUEST_EVENT, onTuneRequest));

  teardown.push(revealOnScroll(root, { stagger: 90 }));

  if (progress) teardown.push(trackProgress(progress));

  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]'));
  teardown.push(
    trackActiveSection(
      links,
      sections.map((section) => section.element),
    ),
  );

  // Opening the surprise: reveal the chrome, then walk to the countdown.
  const onOpen = (): void => {
    toggleClass(document.body, 'is-open', true);
    if (nav) setHidden(nav, false);
    const footNow = qs<HTMLElement>('[data-foot]');
    if (footNow) setHidden(footNow, false);

    // This runs inside the click that opened the surprise, which is the user
    // gesture a browser requires before it will let audio start.
    if (musicControl) {
      musicControl.reveal();
      if (shouldAutoStart()) music.play();
      musicControl.sync();
    }

    const countdown = qs<HTMLElement>('#countdown');
    if (countdown) {
      const focusTarget = qs<HTMLElement>('#countdown-title', countdown) ?? countdown;
      scrollToElement(countdown, focusTarget);
      const firstUnit = qs<HTMLElement>('.countdown__value', countdown);
      if (firstUnit && prefersReducedMotion()) firstUnit.setAttribute('data-static', 'true');
    }
  };

  (root as HTMLElement).addEventListener(OPEN_EVENT, onOpen);

  // Keyboard users can reach the sections from the start.
  if (nav) {
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target;
      if (target instanceof Element && target.matches('[data-open-surprise]')) {
        event.preventDefault();
        (target as HTMLElement).click();
      }
    };
    document.addEventListener('keydown', onKeydown);
    teardown.push(() => document.removeEventListener('keydown', onKeydown));
  }

  // Reflect the countdown copy in the document title once the day arrives.
  const titleBase = document.title;
  const updateTitle = (): void => {
    const countdown = qs<HTMLElement>('#countdown');
    if (!countdown) return;
    const celebrating = !qs<HTMLElement>('[data-countdown-birthday]', countdown)?.hasAttribute('hidden');
    document.title = celebrating ? `${COUNTDOWN_COPY.birthdayHeading} ${RECIPIENT.firstName}` : titleBase;
  };
  window.setTimeout(updateTitle, 0);

  return {
    destroy(): void {
      (root as HTMLElement).removeEventListener(OPEN_EVENT, onOpen);
      music.destroy();
      for (const off of teardown) off();
    },
  };
}
