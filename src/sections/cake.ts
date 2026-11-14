/* ============================================================
   SECTION F — MAKE A WISH
   A hand-drawn cake, and the party that happens around it: a string
   of pennants, balloons you can pop, a slice that comes out, and
   confetti thrown across the stage.

   The candle is a real button (aria-pressed), blowing it out is a
   real state change, and nothing here moves unless motion is
   welcome — with reduced motion the same states arrive still.
   ============================================================ */

import { CAKE } from '../content';
import { el, setHidden, setText } from '../lib/dom';
import { prefersReducedMotion, pulseClass } from '../lib/motion';
import { TUNE_REQUEST_EVENT } from '../lib/music';
import {
  balloon as balloonArt,
  bunting as buntingArt,
  cake as cakeArt,
  flame,
  star,
} from '../lib/svg';

/** How many pieces of confetti one throw makes. */
export const CONFETTI_COUNT = 34;

/** Palette only — the party is made of the same paper as the rest of the page. */
const CONFETTI_COLOURS: readonly string[] = ['#F4DDE1', '#E8C5CB', '#C58F99', '#F7EDE4', '#D9A5AE'];

const BALLOON_FILLS: readonly string[] = ['#F4DDE1', '#E8C5CB', '#FFF9F4'];

export interface CakeHandle {
  readonly element: HTMLElement;
  isLit(): boolean;
  blowOut(): void;
  relight(): void;
  isCut(): boolean;
  cut(): void;
  /** Pops the balloon at that index, as the button does. */
  popBalloon(index: number): void;
  sparkCount(): number;
  confettiCount(): number;
  poppedBalloons(): number;
  destroy(): void;
}

export function buildCake(): CakeHandle {
  const headingId = 'wish-title';

  const eyebrow = el('p', { className: 'eyebrow', text: CAKE.eyebrow, attrs: { 'data-reveal': '' } });
  const heading = el('h2', { className: 'h2', attrs: { id: headingId, 'data-reveal': '' } });
  const headingWords = CAKE.heading.split(' ');
  heading.append(
    document.createTextNode(`${headingWords.slice(0, 2).join(' ')} `),
    el('span', { className: 'accent', text: headingWords.slice(2).join(' ') }),
  );
  const intro = el('p', { className: 'lead', text: CAKE.intro, attrs: { 'data-reveal': '' } });

  const flameArt = flame(30);
  const candleButton = el('button', {
    className: 'candle',
    attrs: {
      type: 'button',
      'aria-pressed': 'false',
      'aria-label': CAKE.candleAria,
      'data-candle': '',
    },
    children: [
      el('span', { className: 'candle__flame-wrap', attrs: { 'aria-hidden': 'true' }, children: [flameArt] }),
      el('span', { className: 'candle__stick', attrs: { 'aria-hidden': 'true' } }),
    ],
  });

  const cakeFigure = el('div', {
    className: 'cake',
    attrs: { 'data-reveal': '' },
    children: [cakeArt(240), candleButton],
  });

  const bunting = el('div', {
    className: 'cake__bunting',
    attrs: { 'aria-hidden': 'true' },
    children: [buntingArt(320)],
  });

  const banner = el('p', {
    className: 'cake__banner',
    attrs: { 'data-cake-banner': '' },
    text: CAKE.banner,
  });

  // Balloons are buttons: popping one is a real action, and the line it
  // was holding lands in one shared slip so the row never reflows.
  const party = el('div', { className: 'cake__party', attrs: { 'data-cake-party': '' } });
  const balloonWiring: { readonly button: HTMLButtonElement; readonly handler: () => void }[] = [];
  const balloonLines: string[] = [];

  CAKE.balloons.forEach((spec, index) => {
    const button = el('button', {
      className: 'balloon',
      attrs: {
        type: 'button',
        'data-balloon': spec.id,
        'aria-pressed': 'false',
        'aria-label': spec.aria,
      },
      children: [balloonArt(54, BALLOON_FILLS[index % BALLOON_FILLS.length] ?? '#F4DDE1')],
    });
    const handler = (): void => popBalloon(index);
    button.addEventListener('click', handler);
    balloonWiring.push({ button, handler });
    balloonLines.push(spec.line);
    party.append(button);
  });

  const slip = el('p', {
    className: 'hand cake__slip',
    attrs: { 'data-cake-slip': '', 'aria-live': 'polite', 'aria-atomic': 'true' },
  });

  const status = el('p', {
    className: 'cake__status',
    attrs: { 'data-cake-status': '', 'aria-live': 'polite', 'aria-atomic': 'true' },
    text: CAKE.litLabel,
  });

  const wishLine = el('p', { className: 'hand cake__wish', attrs: { 'data-cake-wish': '', hidden: '' }, text: CAKE.wishPrompt });

  const note = el('p', { className: 'hand cake__note', attrs: { 'data-cake-note': '' }, text: CAKE.cutNote });

  const cutButton = el('button', {
    className: 'btn btn--quiet cake__cut',
    text: CAKE.cutLabel,
    attrs: { type: 'button', 'data-cake-cut': '', 'aria-label': CAKE.cutAria },
  });

  const singButton = el('button', {
    className: 'btn btn--quiet cake__sing',
    text: CAKE.singLabel,
    attrs: { type: 'button', 'data-cake-sing': '', 'aria-label': CAKE.singAria },
  });

  const againButton = el('button', {
    className: 'btn btn--quiet cake__again',
    text: CAKE.againLabel,
    attrs: { type: 'button', 'data-cake-again': '', 'aria-label': CAKE.againAria },
  });

  const relightButton = el('button', {
    className: 'btn btn--quiet cake__relight',
    text: CAKE.relight,
    attrs: { type: 'button', 'data-cake-relight': '', hidden: '' },
  });

  const actions = el('div', {
    className: 'cake__actions',
    children: [cutButton, singButton, againButton, relightButton],
  });

  const confetti = el('div', {
    className: 'cake__confetti',
    attrs: { 'data-cake-confetti': '', 'aria-hidden': 'true' },
  });

  const sparks = el('div', { className: 'cake__sparks', attrs: { 'data-cake-sparks': '', 'aria-hidden': 'true' } });

  const stage = el('div', {
    className: 'cake__stage',
    attrs: { 'data-cake-stage': '' },
    children: [bunting, banner, party, cakeFigure, confetti, sparks, status, wishLine, note, slip, actions],
  });

  const section = el('section', {
    className: 'section wish',
    attrs: { id: 'wish', 'aria-labelledby': headingId },
    children: [
      el('div', {
        className: 'page',
        children: [el('div', { className: 'section__head', children: [eyebrow, heading, intro] }), stage],
      }),
    ],
  });

  let lit = true;
  let cut = false;

  const clearSparks = (): void => {
    while (sparks.firstChild) sparks.removeChild(sparks.firstChild);
  };

  const clearConfetti = (): void => {
    while (confetti.firstChild) confetti.removeChild(confetti.firstChild);
  };

  /** A throw of confetti, spread across the stage. Returns how many fell. */
  const throwConfetti = (): number => {
    if (prefersReducedMotion()) return 0;
    clearConfetti();
    for (let index = 0; index < CONFETTI_COUNT; index += 1) {
      const piece = el('span', {
        className: 'cake__confetti-piece',
        attrs: {
          'aria-hidden': 'true',
          style:
            `--i:${index}; --x:${(index * 37) % 100}%; --drift:${((index % 7) - 3) * 16}px;` +
            ` --spin:${120 + (index % 5) * 90}deg; --colour:${CONFETTI_COLOURS[index % CONFETTI_COLOURS.length] ?? '#F4DDE1'}`,
        },
      });
      confetti.append(piece);
    }
    return confetti.childElementCount;
  };

  const celebrate = (): void => {
    if (prefersReducedMotion()) return;
    clearSparks();
    for (let index = 0; index < 7; index += 1) {
      const spark = el('span', {
        className: 'cake__spark',
        attrs: { 'aria-hidden': 'true', style: `--spark: ${index}` },
        children: [star(12)],
      });
      sparks.append(spark);
    }
    throwConfetti();
  };

  const blowOut = (): void => {
    if (!lit) return;
    lit = false;
    candleButton.setAttribute('aria-pressed', 'true');
    candleButton.classList.add('is-out');
    setText(status, CAKE.outLabel);
    setHidden(wishLine, false);
    setHidden(relightButton, false);
    section.setAttribute('data-celebrating', 'true');
    pulseClass(status, 'is-fresh');
    celebrate();
  };

  const cutCake = (): void => {
    if (cut) return;
    cut = true;
    stage.classList.add('is-cut');
    setText(status, CAKE.cutStatus);
    pulseClass(status, 'is-fresh');
  };

  const popBalloon = (index: number): void => {
    const wiring = balloonWiring[index];
    if (!wiring || wiring.button.classList.contains('is-popped')) return;
    wiring.button.classList.add('is-popped');
    wiring.button.setAttribute('aria-pressed', 'true');
    pulseClass(wiring.button, 'is-popping', 420);
    setText(slip, balloonLines[index] ?? '');
    pulseClass(slip, 'is-fresh');
  };

  const askForTune = (): void => {
    // The shell owns the music box; the section only asks for it.
    section.dispatchEvent(new CustomEvent(TUNE_REQUEST_EVENT, { bubbles: true }));
  };

  const again = (): void => celebrate();

  const relight = (): void => {
    if (lit) return;
    lit = true;
    cut = false;
    candleButton.setAttribute('aria-pressed', 'false');
    candleButton.classList.remove('is-out');
    candleButton.classList.remove('is-blown');
    setText(status, CAKE.litLabel);
    setText(wishLine, CAKE.wishPrompt);
    setHidden(wishLine, true);
    setHidden(relightButton, true);
    section.removeAttribute('data-celebrating');
    stage.classList.remove('is-cut');
    clearSparks();
    clearConfetti();
    for (const { button } of balloonWiring) {
      button.classList.remove('is-popped');
      button.setAttribute('aria-pressed', 'false');
    }
    setText(slip, '');
  };

  const onCandleClick = (): void => {
    if (lit) {
      blowOut();
      setText(wishLine, CAKE.wishDone);
      return;
    }
    relight();
  };

  candleButton.addEventListener('click', onCandleClick);
  relightButton.addEventListener('click', relight);
  cutButton.addEventListener('click', cutCake);
  singButton.addEventListener('click', askForTune);
  againButton.addEventListener('click', again);

  return {
    element: section,
    isLit: () => lit,
    blowOut,
    relight,
    isCut: () => cut,
    cut: cutCake,
    popBalloon,
    sparkCount: () => sparks.childElementCount,
    confettiCount: () => confetti.childElementCount,
    poppedBalloons: () => balloonWiring.filter(({ button }) => button.classList.contains('is-popped')).length,
    destroy(): void {
      candleButton.removeEventListener('click', onCandleClick);
      relightButton.removeEventListener('click', relight);
      cutButton.removeEventListener('click', cutCake);
      singButton.removeEventListener('click', askForTune);
      againButton.removeEventListener('click', again);
      for (const { button, handler } of balloonWiring) button.removeEventListener('click', handler);
      clearSparks();
      clearConfetti();
    },
  };
}
