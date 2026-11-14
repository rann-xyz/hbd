import { afterEach, describe, expect, it } from 'vitest';

import { LETTER, RECIPIENT } from '../content';
import { focusableWithin } from '../lib/focus';
import { buildLetter, LETTER_PAPER_ID, type LetterHandle } from '../sections/letter';

let handle: LetterHandle | null = null;

function mount(): LetterHandle {
  const built = buildLetter();
  document.body.append(built.element);
  handle = built;
  return built;
}

function envelope(): HTMLButtonElement {
  const node = document.querySelector<HTMLButtonElement>('.envelope');
  if (!node) throw new Error('envelope missing');
  return node;
}

function paper(): HTMLElement {
  const node = document.getElementById(LETTER_PAPER_ID);
  if (!node) throw new Error('letter paper missing');
  return node;
}

function modal(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[data-letter-modal]');
  if (!node) throw new Error('letter modal missing');
  return node;
}

function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}

afterEach(() => {
  handle?.destroy();
  handle = null;
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('letter section structure', () => {
  it('has a labelled section', () => {
    const built = mount();
    expect(built.element.id).toBe('letter');
    const labelledBy = built.element.getAttribute('aria-labelledby') ?? '';
    expect(document.getElementById(labelledBy)).not.toBeNull();
  });

  it('starts closed, with a sealed envelope', () => {
    mount();
    expect(envelope().getAttribute('aria-expanded')).toBe('false');
    expect(envelope().getAttribute('aria-controls')).toBe(LETTER_PAPER_ID);
    expect(envelope().getAttribute('aria-label')).toBe(LETTER.envelopeAria);
    expect(envelope().querySelector('.envelope__seal')?.textContent).toBe('A');
    expect(modal().hasAttribute('hidden')).toBe(true);
  });

  it('exposes the letter as a modal dialog labelled by its heading', () => {
    mount();
    const dialog = paper();
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')).not.toBeNull();
  });

  it('keeps the envelope ornament hidden from assistive tech', () => {
    mount();
    for (const node of Array.from(document.querySelectorAll('.envelope__body, .envelope__flap, .envelope__pocket'))) {
      expect(node.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

describe('letter content', () => {
  it('uses the apology message exactly once, word for word', () => {
    mount();
    const apologies = document.querySelectorAll('[data-apology]');
    expect(apologies).toHaveLength(1);
    expect(apologies[0]?.textContent).toBe(LETTER.apology);
  });

  it('reads in order: salutation, body, apology, closing, sign-off, postscript', () => {
    mount();
    const dialog = paper();
    const salutation = dialog.querySelector('.letter__salutation')?.textContent;
    expect(salutation).toBe(LETTER.salutation);

    const paragraphs = Array.from(dialog.querySelectorAll('.letter__body > p'));
    expect(paragraphs).toHaveLength(LETTER.body.length + LETTER.closing.length + 1);
    expect(paragraphs[0]?.textContent).toBe(LETTER.body[0]);
    // The apology sits between the opening and the closing of the letter.
    expect(paragraphs[LETTER.body.length]?.textContent).toBe(LETTER.apology);
    expect(paragraphs[LETTER.body.length + 1]?.textContent).toBe(LETTER.closing[0]);
    expect(dialog.querySelector('.letter__signoff')?.textContent).toBe(LETTER.signOff);
    expect(dialog.querySelector('.letter__signature')?.textContent).toBe('Agis');
    expect(dialog.querySelector('.letter__ps')?.textContent).toBe(LETTER.postscript);
  });

  it('addresses the recipient by name and leaves no render artefacts behind', () => {
    mount();
    const text = paper().textContent ?? '';
    expect(text).toContain(RECIPIENT.firstName);
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('[object');
  });
});

describe('opening and closing the letter', () => {
  it('opens on click, moves focus inside, and locks the page behind it', () => {
    const built = mount();
    envelope().click();

    expect(built.isOpen()).toBe(true);
    expect(modal().hasAttribute('hidden')).toBe(false);
    expect(envelope().getAttribute('aria-expanded')).toBe('true');
    expect(document.body.classList.contains('is-letter-open')).toBe(true);
    expect(document.activeElement).toBe(paper());
  });

  it('closes on Escape and puts focus back on the envelope', () => {
    const built = mount();
    envelope().click();
    pressEscape();

    expect(built.isOpen()).toBe(false);
    expect(modal().hasAttribute('hidden')).toBe(true);
    expect(envelope().getAttribute('aria-expanded')).toBe('false');
    expect(document.body.classList.contains('is-letter-open')).toBe(false);
    expect(document.activeElement).toBe(envelope());
  });

  it('closes from the close button', () => {
    const built = mount();
    envelope().click();
    document.querySelector<HTMLButtonElement>('[data-letter-close]')?.click();
    expect(built.isOpen()).toBe(false);
  });

  it('closes when the backdrop is clicked', () => {
    const built = mount();
    envelope().click();
    document.querySelector<HTMLElement>('[data-letter-backdrop]')?.click();
    expect(built.isOpen()).toBe(false);
  });

  it('toggles shut if the envelope is pressed again', () => {
    const built = mount();
    envelope().click();
    envelope().click();
    expect(built.isOpen()).toBe(false);
    envelope().click();
    expect(built.isOpen()).toBe(true);
  });

  it('keeps Tab inside the open letter', () => {
    mount();
    envelope().click();
    const focusable = focusableWithin(paper());
    expect(focusable.length).toBeGreaterThan(0);

    focusable[focusable.length - 1]?.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(focusable[0]);
  });

  it('stops listening after being destroyed', () => {
    const built = mount();
    envelope().click();
    built.destroy();

    expect(built.isOpen()).toBe(false);
    expect(modal().hasAttribute('hidden')).toBe(true);

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
