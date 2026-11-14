import { afterEach, describe, expect, it } from 'vitest';

import { NOTES, NOTES_INTRO } from '../content';
import { buildNotes, type NotesHandle } from '../sections/notes';

let handle: NotesHandle | null = null;

function mount(): NotesHandle {
  const built = buildNotes();
  document.body.append(built.element);
  handle = built;
  return built;
}

function toggleFor(id: string): HTMLButtonElement {
  const node = document.querySelector<HTMLButtonElement>(`[data-note-toggle="${id}"]`);
  if (!node) throw new Error(`toggle missing for ${id}`);
  return node;
}

function panelFor(id: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-note-panel="${id}"]`);
  if (!node) throw new Error(`panel missing for ${id}`);
  return node;
}

afterEach(() => {
  handle?.destroy();
  handle = null;
  document.body.innerHTML = '';
});

describe('notes section structure', () => {
  it('renders one card per note, all folded shut', () => {
    mount();
    expect(document.querySelectorAll('[data-note-card]')).toHaveLength(NOTES.length);

    for (const note of NOTES) {
      expect(toggleFor(note.id).getAttribute('aria-expanded')).toBe('false');
      expect(panelFor(note.id).hasAttribute('hidden')).toBe(true);
    }
  });

  it('wires each control to its own panel', () => {
    mount();
    for (const note of NOTES) {
      const toggle = toggleFor(note.id);
      const panel = panelFor(note.id);

      expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
      expect(panel.getAttribute('role')).toBe('region');
      expect(document.getElementById(panel.getAttribute('aria-labelledby') ?? '')).not.toBeNull();
    }
  });

  it('wraps every control in a real heading, for heading navigation', () => {
    mount();
    for (const note of NOTES) {
      const heading = document.getElementById(`note-heading-${note.id}`);
      expect(heading?.tagName).toBe('H3');
      expect(heading?.contains(toggleFor(note.id))).toBe(true);
    }
  });

  it('shows the five exact labels from the content file', () => {
    mount();
    const labels = Array.from(document.querySelectorAll('.note-card__label')).map((node) => node.textContent);
    expect(labels).toEqual(NOTES.map((note) => note.label));
  });

  it('uses real button elements, so Enter and Space work for free', () => {
    mount();
    for (const note of NOTES) {
      const toggle = toggleFor(note.id);
      expect(toggle.tagName).toBe('BUTTON');
      expect(toggle.getAttribute('type')).toBe('button');
    }
  });

  it('marks the fold ornament as decorative', () => {
    mount();
    for (const node of Array.from(document.querySelectorAll('.note-card__seal, .note-card__crease'))) {
      expect(node.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

describe('opening notes', () => {
  it('reveals the message when a note is opened', () => {
    const built = mount();
    toggleFor('tired').click();

    expect(built.isOpen('tired')).toBe(true);
    expect(toggleFor('tired').getAttribute('aria-expanded')).toBe('true');
    expect(panelFor('tired').hasAttribute('hidden')).toBe(false);
    expect(panelFor('tired').textContent).toContain(NOTES[0]?.message ?? '');
    expect(document.querySelector('[data-note-card="tired"]')?.getAttribute('data-open')).toBe('true');
  });

  it('folds the note back when it is pressed again', () => {
    const built = mount();
    toggleFor('miss').click();
    toggleFor('miss').click();

    expect(built.isOpen('miss')).toBe(false);
    expect(panelFor('miss').hasAttribute('hidden')).toBe(true);
  });

  it('lets several notes stay open at once', () => {
    const built = mount();
    toggleFor('tired').click();
    toggleFor('doubt').click();
    toggleFor('because').click();

    expect(built.openCount()).toBe(3);
    for (const id of ['tired', 'doubt', 'because']) {
      expect(panelFor(id).hasAttribute('hidden')).toBe(false);
    }
    expect(panelFor('miss').hasAttribute('hidden')).toBe(true);
  });

  it('swaps the handwriting hint while a note is open', () => {
    mount();
    const toggle = toggleFor('difficult');
    expect(toggle.querySelector('.note-card__sublabel')?.textContent).toBe(
      NOTES.find((note) => note.id === 'difficult')?.sublabel,
    );

    toggle.click();
    expect(toggle.querySelector('.note-card__sublabel')?.textContent).toBe(NOTES_INTRO.closeHint);

    toggle.click();
    expect(toggle.querySelector('.note-card__sublabel')?.textContent).toBe(
      NOTES.find((note) => note.id === 'difficult')?.sublabel,
    );
  });

  it('can also be driven programmatically', () => {
    const built = mount();
    built.toggle('because');
    expect(built.isOpen('because')).toBe(true);
  });

  it('stops responding once destroyed', () => {
    const built = mount();
    built.destroy();
    toggleFor('tired').click();
    expect(built.isOpen('tired')).toBe(false);
  });
});
