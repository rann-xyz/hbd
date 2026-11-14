/* ============================================================
   SECTION E — LITTLE NOTES
   Five folded notes. Each heading is a real button with
   aria-expanded/aria-controls, the panel is a labelled region, and
   notes open independently — you can leave three of them unfolded if
   that is the kind of day it is.
   ============================================================ */

import { NOTES, NOTES_INTRO } from '../content';
import { el, setHidden, setText } from '../lib/dom';
import { bow } from '../lib/svg';

export interface NotesHandle {
  readonly element: HTMLElement;
  isOpen(id: string): boolean;
  toggle(id: string): void;
  openCount(): number;
  destroy(): void;
}

export function buildNotes(): NotesHandle {
  const headingId = 'notes-title';

  const eyebrow = el('p', { className: 'eyebrow', text: NOTES_INTRO.eyebrow, attrs: { 'data-reveal': '' } });
  const heading = el('h2', {
    className: 'h2',
    attrs: { id: headingId, 'data-reveal': '' },
  });
  const introWords = NOTES_INTRO.heading.split(' ');
  const accentFrom = Math.max(1, introWords.length - 3);
  heading.append(
    document.createTextNode(`${introWords.slice(0, accentFrom).join(' ')} `),
    el('span', { className: 'accent', text: introWords.slice(accentFrom).join(' ') }),
  );
  const intro = el('p', { className: 'lead', text: NOTES_INTRO.intro, attrs: { 'data-reveal': '' } });
  const hint = el('p', { className: 'hand', text: NOTES_INTRO.openHint });

  const open = new Map<string, boolean>();
  const panels = new Map<string, HTMLElement>();
  const toggles = new Map<string, HTMLButtonElement>();
  const hints = new Map<string, HTMLElement>();

  const wall = el('div', { className: 'notes__wall' });

  NOTES.forEach((note, index) => {
    open.set(note.id, false);

    const label = el('span', { className: 'note-card__label', text: note.label });
    const sublabel = el('span', { className: 'note-card__sublabel', text: note.sublabel });

    const toggle = el('button', {
      className: 'note-card__toggle',
      attrs: {
        type: 'button',
        'aria-expanded': 'false',
        'aria-controls': `note-panel-${note.id}`,
        'data-note-toggle': note.id,
      },
      children: [label, sublabel],
    });
    toggles.set(note.id, toggle);

    const message = el('p', { className: 'note-card__message prose', text: note.message });
    const foldHint = el('p', { className: 'note-card__close-hint hand', text: NOTES_INTRO.closeHint });
    hints.set(note.id, foldHint);

    const panel = el('div', {
      className: 'note-card__panel',
      attrs: {
        id: `note-panel-${note.id}`,
        role: 'region',
        'aria-labelledby': `note-heading-${note.id}`,
        'data-note-panel': note.id,
        hidden: '',
      },
      children: [message, foldHint],
    });
    panels.set(note.id, panel);

    // A real heading wraps the control, so the note list is navigable by heading.
    const noteHeading = el('h3', {
      className: 'note-card__heading',
      attrs: { id: `note-heading-${note.id}` },
      children: [toggle],
    });

    const card = el('article', {
      className: 'note-card',
      attrs: {
        'data-note-card': note.id,
        'data-open': 'false',
        'data-reveal': '',
        style: `--note-index: ${index}`,
      },
      children: [
        el('span', { className: 'note-card__crease', attrs: { 'aria-hidden': 'true' } }),
        el('span', { className: 'note-card__seal', attrs: { 'aria-hidden': 'true' }, children: [bow(22)] }),
        noteHeading,
        panel,
      ],
    });

    wall.append(card);
  });

  const applyState = (id: string, next: boolean): void => {
    open.set(id, next);
    const panel = panels.get(id);
    const toggle = toggles.get(id);
    const hintNode = hints.get(id);
    const card = wall.querySelector<HTMLElement>(`[data-note-card="${id}"]`);

    if (panel) setHidden(panel, !next);
    if (toggle) {
      toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
      setText(
        toggle.querySelector('.note-card__sublabel') ?? toggle,
        next ? NOTES_INTRO.closeHint : (NOTES.find((note) => note.id === id)?.sublabel ?? ''),
      );
    }
    if (hintNode) setHidden(hintNode, false);
    if (card) card.setAttribute('data-open', next ? 'true' : 'false');
  };

  const toggleNote = (id: string): void => {
    applyState(id, !(open.get(id) ?? false));
  };

  const offs: (() => void)[] = [];
  for (const [id, toggle] of toggles) {
    const handler = (): void => toggleNote(id);
    toggle.addEventListener('click', handler);
    offs.push(() => toggle.removeEventListener('click', handler));
  }

  const section = el('section', {
    className: 'section notes',
    attrs: { id: 'notes', 'aria-labelledby': headingId },
    children: [
      el('div', {
        className: 'page',
        children: [
          el('div', { className: 'section__head', children: [eyebrow, heading, intro, hint] }),
          wall,
        ],
      }),
    ],
  });

  return {
    element: section,
    isOpen: (id: string) => open.get(id) ?? false,
    toggle: toggleNote,
    openCount: () => Array.from(open.values()).filter(Boolean).length,
    destroy(): void {
      for (const off of offs) off();
    },
  };
}
