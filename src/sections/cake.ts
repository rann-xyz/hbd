/* ============================================================
   SECTION F — MAKE A WISH
   A hand-drawn cake with one candle. The candle is a real button
   (aria-pressed), blowing it out is a real state change, and the
   little celebration only happens when motion is welcome.
   ============================================================ */

import { CAKE } from '../content';
import { el, setHidden, setText } from '../lib/dom';
import { prefersReducedMotion, pulseClass } from '../lib/motion';
import { cake as cakeArt, flame, star } from '../lib/svg';

export interface CakeHandle {
  readonly element: HTMLElement;
  isLit(): boolean;
  blowOut(): void;
  relight(): void;
  sparkCount(): number;
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

  const status = el('p', {
    className: 'cake__status',
    attrs: { 'data-cake-status': '', 'aria-live': 'polite', 'aria-atomic': 'true' },
    text: CAKE.litLabel,
  });

  const wishLine = el('p', { className: 'hand cake__wish', attrs: { 'data-cake-wish': '', hidden: '' }, text: CAKE.wishPrompt });

  const relightButton = el('button', {
    className: 'btn btn--quiet cake__relight',
    text: CAKE.relight,
    attrs: { type: 'button', 'data-cake-relight': '', hidden: '' },
  });

  const sparks = el('div', { className: 'cake__sparks', attrs: { 'data-cake-sparks': '', 'aria-hidden': 'true' } });

  const stage = el('div', {
    className: 'cake__stage',
    children: [cakeFigure, sparks, status, wishLine, relightButton],
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

  const clearSparks = (): void => {
    while (sparks.firstChild) sparks.removeChild(sparks.firstChild);
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

  const relight = (): void => {
    if (lit) return;
    lit = true;
    candleButton.setAttribute('aria-pressed', 'false');
    candleButton.classList.remove('is-out');
    candleButton.classList.remove('is-blown');
    setText(status, CAKE.litLabel);
    setText(wishLine, CAKE.wishPrompt);
    setHidden(wishLine, true);
    setHidden(relightButton, true);
    section.removeAttribute('data-celebrating');
    clearSparks();
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

  return {
    element: section,
    isLit: () => lit,
    blowOut,
    relight,
    sparkCount: () => sparks.childElementCount,
    destroy(): void {
      candleButton.removeEventListener('click', onCandleClick);
      relightButton.removeEventListener('click', relight);
      clearSparks();
    },
  };
}
