/* ============================================================
   SECTION D — THE BIRTHDAY LETTER
   A sealed envelope that really opens into a letter: focus moves in,
   Tab stays inside, Escape and the backdrop close it, and focus goes
   back to the envelope. Reduced motion shows the letter instantly.
   ============================================================ */

import { AUTHOR, LETTER } from '../content';
import { el, setHidden } from '../lib/dom';
import { trapFocus, type FocusTrap } from '../lib/focus';
import { enter } from '../lib/motion';
import { bow } from '../lib/svg';

export interface LetterHandle {
  readonly element: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

export const LETTER_PAPER_ID = 'letter-paper';

export function buildLetter(): LetterHandle {
  const headingId = 'letter-title';

  const eyebrow = el('p', { className: 'eyebrow', text: LETTER.eyebrow, attrs: { 'data-reveal': '' } });
  const heading = el('h2', {
    className: 'h2',
    attrs: { id: headingId, 'data-reveal': '' },
  });
  heading.append(
    document.createTextNode(`${LETTER.heading.split(' ').slice(0, 2).join(' ')} `),
    el('span', {
      className: 'accent',
      text: LETTER.heading.split(' ').slice(2).join(' '),
    }),
  );

  /* ---------------- envelope ---------------- */

  const seal = el('span', {
    className: 'seal envelope__seal',
    text: 'A',
    attrs: { 'aria-hidden': 'true' },
  });

  const envelope = el('button', {
    className: 'envelope',
    attrs: {
      type: 'button',
      'aria-expanded': 'false',
      'aria-controls': LETTER_PAPER_ID,
      'aria-label': LETTER.envelopeAria,
    },
    children: [
      el('span', { className: 'envelope__body', attrs: { 'aria-hidden': 'true' } }),
      el('span', { className: 'envelope__flap', attrs: { 'aria-hidden': 'true' } }),
      el('span', { className: 'envelope__pocket', attrs: { 'aria-hidden': 'true' } }),
      seal,
      el('span', { className: 'envelope__bow', attrs: { 'aria-hidden': 'true' }, children: [bow(34)] }),
    ],
  });

  const envelopeHint = el('p', { className: 'hand', text: LETTER.envelopeHint });

  const envelopeWrap = el('div', {
    className: 'envelope-wrap',
    attrs: { 'data-reveal': '' },
    children: [envelope, envelopeHint],
  });

  /* ---------------- the letter itself ---------------- */

  const salutation = el('p', { className: 'letter__salutation', text: LETTER.salutation });

  const bodyNodes: HTMLElement[] = LETTER.body.map((paragraph) => el('p', { text: paragraph }));

  // The apology is the emotional centre of the letter: it is set apart by a
  // hairline rule, never by a box, and the words are used exactly as written.
  const apology = el('p', { className: 'letter__apology', text: LETTER.apology, attrs: { 'data-apology': '' } });

  const closingNodes: HTMLElement[] = LETTER.closing.map((paragraph) => el('p', { text: paragraph }));

  const signOff = el('p', { className: 'letter__signoff', text: LETTER.signOff });
  const signature = el('p', { className: 'letter__signature', text: AUTHOR.signature });
  const postscript = el('p', { className: 'letter__ps', text: LETTER.postscript });

  const closeButton = el('button', {
    className: 'letter__close',
    text: '×',
    attrs: { type: 'button', 'aria-label': LETTER.closeAria, 'data-letter-close': '' },
  });

  const paperTitle = el('h3', {
    className: 'sr-only',
    text: LETTER.heading,
    attrs: { id: 'letter-paper-title' },
  });

  const paper = el('div', {
    className: 'letter__paper',
    attrs: {
      id: LETTER_PAPER_ID,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'letter-paper-title',
      tabindex: '-1',
    },
    children: [
      closeButton,
      paperTitle,
      salutation,
      el('div', { className: 'letter__body', children: [...bodyNodes, apology, ...closingNodes] }),
      el('div', {
        className: 'letter__signature-block',
        children: [signOff, signature],
      }),
      postscript,
    ],
  });

  const backdrop = el('div', {
    className: 'letter-modal__backdrop',
    attrs: { 'data-letter-backdrop': '', 'aria-hidden': 'true' },
  });

  const modal = el('div', {
    className: 'letter-modal',
    attrs: { 'data-letter-modal': '', hidden: '' },
    children: [backdrop, paper],
  });

  const section = el('section', {
    className: 'section letter',
    attrs: { id: 'letter', 'aria-labelledby': headingId },
    children: [
      el('div', {
        className: 'page',
        children: [eyebrow, heading, envelopeWrap],
      }),
      modal,
    ],
  });

  let open = false;
  let trap: FocusTrap | null = null;

  const onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      closeLetter();
    }
  };

  const openLetter = (): void => {
    if (open) return;
    open = true;
    setHidden(modal, false);
    envelope.setAttribute('aria-expanded', 'true');
    document.body.classList.add('is-letter-open');
    document.addEventListener('keydown', onDocumentKeydown);

    enter(paper, [{ opacity: 0, transform: 'translateY(18px) scale(0.99)' }, { opacity: 1, transform: 'none' }], {
      duration: 420,
    });

    trap = trapFocus(paper, envelope);
    paper.focus({ preventScroll: true });
  };

  const closeLetter = (): void => {
    if (!open) return;
    open = false;
    setHidden(modal, true);
    envelope.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('is-letter-open');
    document.removeEventListener('keydown', onDocumentKeydown);
    trap?.release();
    trap = null;
  };

  envelope.addEventListener('click', () => {
    if (open) closeLetter();
    else openLetter();
  });

  backdrop.addEventListener('click', () => closeLetter());
  closeButton.addEventListener('click', () => closeLetter());

  return {
    element: section,
    open: openLetter,
    close: closeLetter,
    isOpen: () => open,
    destroy(): void {
      closeLetter();
      document.removeEventListener('keydown', onDocumentKeydown);
    },
  };
}
