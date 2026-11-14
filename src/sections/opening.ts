/* ============================================================
   SECTION A — OPENING
   A full-screen first page: eyebrow, the headline as a piece of
   editorial typography, Fitria's name, one sentence, one button.
   The button announces an intent; the shell decides what opens.
   ============================================================ */

import { OPENING, RECIPIENT } from '../content';
import { el } from '../lib/dom';
import { enter } from '../lib/motion';
import { arrow, bow, sprig, star } from '../lib/svg';

export const OPEN_EVENT = 'hbd:open';

function ornament(className: string, node: SVGSVGElement | HTMLElement): HTMLElement {
  return el('span', { className, attrs: { 'aria-hidden': 'true' }, children: [node] });
}

export function buildOpening(): HTMLElement {
  const eyebrow = el('p', { className: 'eyebrow', text: OPENING.eyebrow, attrs: { 'data-reveal': '' } });

  const headline = el('h1', {
    className: 'display',
    text: OPENING.headline,
    attrs: { id: 'opening-title' },
  });

  const nameLine = el('p', {
    className: 'opening__name',
    text: OPENING.nameLine,
    attrs: { 'aria-label': `for ${RECIPIENT.fullName}` },
  });

  const intro = el('p', { className: 'lead', text: OPENING.intro });

  const ctaMark = el('span', { className: 'btn__mark', attrs: { 'aria-hidden': 'true' }, children: [arrow(20)] });

  const cta = el('button', {
    className: 'btn btn--solid',
    attrs: { type: 'button', 'data-open-surprise': '' },
    children: [el('span', { text: OPENING.cta }), ctaMark],
  });

  const handNote = el('p', { className: 'hand', text: OPENING.handNote });

  const actions = el('div', { className: 'opening__actions', children: [cta, handNote] });

  const stampValue = el('span', { className: 'stamp__year', text: OPENING.stamp.year });
  const stampLabel = el('span', { className: 'stamp__label', text: OPENING.stamp.label });
  const stamp = el('div', {
    className: 'stamp opening__orn opening__orn--stamp',
    attrs: { 'aria-hidden': 'true' },
    children: [el('span', { className: 'stamp__inner', children: [stampValue, stampLabel] })],
  });

  const inner = el('div', {
    className: 'opening__inner',
    children: [
      ornament('opening__orn opening__orn--bow', bow(38)),
      ornament('opening__orn opening__orn--star-a', star(18)),
      ornament('opening__orn opening__orn--star-b', star(13)),
      eyebrow,
      headline,
      nameLine,
      el('div', { className: 'rule-sprig', children: [el('span', { className: 'rule-sprig__line' }), sprig(38), el('span', { className: 'rule-sprig__line' })] }),
      intro,
      actions,
      stamp,
    ],
  });

  const section = el('section', {
    className: 'section opening',
    attrs: { id: 'opening', 'aria-labelledby': 'opening-title' },
    children: [el('div', { className: 'page', children: [inner] })],
  });

  // A quiet staged entrance — and nothing at all when motion is unwelcome.
  const staged: readonly [HTMLElement, number][] = [
    [eyebrow, 0],
    [headline, 120],
    [nameLine, 260],
    [intro, 380],
    [actions, 480],
  ];

  for (const [node, delay] of staged) {
    enter(
      node,
      [
        { opacity: 0, transform: 'translateY(16px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 780, delay, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
    );
  }

  cta.addEventListener('click', () => {
    section.dispatchEvent(new CustomEvent(OPEN_EVENT, { bubbles: true }));
  });

  return section;
}
