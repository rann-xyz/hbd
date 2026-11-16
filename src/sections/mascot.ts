/* ============================================================
   THE LITTLE RESIDENT
   A small round creature at the foot of the opening page. It is the
   only thing on this site that asks nothing of you: you boop it, it
   says something small, and it goes back to bobbing.

   It also keeps an eye on the party. What it says depends on what the
   reader has already done — it waits while the surprise is shut, it
   talks about the party once it is open, and it has opinions about the
   cake afterwards — and it blinks, slowly, on its own clock, which is
   the difference between a drawing of a creature and one that is
   standing there.

   The drawing is decoration and the button carries the name; the line
   it says lives in a polite live region, so a screen reader hears it
   too — and hears nothing at all until the creature is booped, because
   an empty live region announces nothing.
   ============================================================ */

import { MASCOT } from '../content';
import { el, setHidden, setText } from '../lib/dom';
import { pulseClass } from '../lib/motion';
import { partyState, type PartyState } from '../lib/party';
import { mascot as mascotArt } from '../lib/svg';

export interface MascotHandle {
  readonly element: HTMLElement;
  /** How many times it has been booped. */
  boops(): number;
  /** The line showing right now, or '' before the first boop. */
  current(): string;
  /** Boops it, exactly as a tap does. */
  boop(): void;
  destroy(): void;
}

export interface MascotOptions {
  /** Extra class on the wrapper — `opening__mascot`, `closing__mascot`. */
  readonly className?: string;
}

/** The lines it has to hand, given how far into the party the reader is. */
function poolFor(state: PartyState): readonly string[] {
  if (state.cakeCut) return MASCOT.afterCake;
  if (state.opened) return MASCOT.party;
  return MASCOT.lines;
}

export function buildMascot(options: MascotOptions = {}): MascotHandle {
  const say = el('p', {
    className: 'hand mascot__say',
    attrs: { 'data-mascot-say': '', 'aria-live': 'polite', 'aria-atomic': 'true' },
  });

  const button = el('button', {
    className: 'mascot__button',
    attrs: { type: 'button', 'data-mascot': '', 'aria-label': MASCOT.aria },
    children: [mascotArt(76)],
  });

  const hint = el('span', {
    className: 'mascot__hint',
    attrs: { 'aria-hidden': 'true' },
    text: MASCOT.hint,
  });

  const classes = ['mascot', options.className].filter(Boolean).join(' ');
  const element = el('div', { className: classes, children: [say, button, hint] });

  let pool: readonly string[] = MASCOT.lines;
  let index = -1;
  let count = 0;

  const boop = (): void => {
    count += 1;

    if (count > MASCOT.boopsBeforeTooMuch) {
      // Past the limit it stops being a conversation, and it keeps saying so,
      // which is the joke. The shiver goes on the wrapper rather than on the
      // drawing, so it does not fight the bob that is already running there.
      setText(say, MASCOT.tooMuch);
      pulseClass(element, 'is-ticklish', 620);
    } else {
      const next = poolFor(partyState());
      // A reader who comes back after the cake gets the new lines from their
      // own first one, not from wherever the old set happened to be.
      if (next !== pool) {
        pool = next;
        index = -1;
      }
      index = (index + 1) % pool.length;
      setText(say, pool[index] ?? '');
    }

    // The hint and the line share a cell: once there is a line, the label has
    // done its job and goes away for good.
    setHidden(hint, true);
    pulseClass(say, 'is-fresh');
    pulseClass(button, 'is-bopped', 620);
  };

  button.addEventListener('click', boop);

  return {
    element,
    boops: () => count,
    current: () => say.textContent ?? '',
    boop,
    destroy(): void {
      button.removeEventListener('click', boop);
    },
  };
}
