/* ============================================================
   SECTION H — FINAL SURPRISE
   The last page: the birthday line, one soft portrait, a signature
   that looks signed, and a way back to the beginning.
   ============================================================ */

import { CLOSING, PORTRAIT, RECIPIENT } from '../content';
import { el, qs } from '../lib/dom';
import { scrollToElement } from '../lib/motion';
import { bow, sprig, star } from '../lib/svg';

export function buildClosing(): HTMLElement {
  const bloom = el('div', {
    className: 'closing__bloom',
    attrs: { 'aria-hidden': 'true' },
    children: [star(14), star(20), star(14)],
  });

  const eyebrow = el('p', { className: 'eyebrow', text: CLOSING.eyebrow, attrs: { 'data-reveal': '' } });
  const heading = el('h2', {
    className: 'h2 closing__heading',
    text: CLOSING.heading,
    attrs: { id: 'closing-title', 'data-reveal': '' },
  });

  const lines = el('div', { className: 'prose closing__lines', attrs: { 'data-reveal': '' } });
  for (const line of CLOSING.lines) lines.append(el('p', { text: line }));

  const figureCaption = el('figcaption', { text: CLOSING.caption });
  const figure = el('figure', {
    className: 'polaroid closing__figure',
    attrs: { 'data-reveal': '' },
    children: [
      el('div', {
        className: 'polaroid__frame',
        children: [
          el('img', {
            attrs: {
              src: PORTRAIT.src,
              width: PORTRAIT.width,
              height: PORTRAIT.height,
              alt: `${RECIPIENT.fullName}, photographed once and kept`,
              loading: 'lazy',
              decoding: 'async',
            },
          }),
        ],
      }),
      el('span', { className: 'tape tape--bl', attrs: { 'aria-hidden': 'true' } }),
      figureCaption,
    ],
  });

  const signOff = el('p', { className: 'closing__signoff', children: [el('span', { text: `${CLOSING.signOff} ` })] });
  const signature = el('p', { className: 'closing__signature', text: CLOSING.signature, attrs: { 'data-reveal': '' } });

  const restart = el('button', {
    className: 'btn btn--quiet closing__restart',
    attrs: { type: 'button' },
    children: [
      el('span', { text: CLOSING.restart }),
      el('span', { className: 'btn__mark', attrs: { 'aria-hidden': 'true' }, children: [bow(22)] }),
    ],
  });

  restart.addEventListener('click', () => {
    const opening = qs<HTMLElement>('#opening');
    const title = qs<HTMLElement>('#opening-title');
    if (opening) scrollToElement(opening, title ?? undefined);
  });

  const inner = el('div', {
    className: 'closing__inner',
    children: [
      bloom,
      eyebrow,
      heading,
      el('div', {
        className: 'rule-sprig',
        children: [el('span', { className: 'rule-sprig__line' }), sprig(40), el('span', { className: 'rule-sprig__line' })],
      }),
      lines,
      figure,
      signOff,
      signature,
      restart,
    ],
  });

  return el('section', {
    className: 'section closing',
    attrs: { id: 'closing', 'aria-labelledby': 'closing-title' },
    children: [el('div', { className: 'page', children: [inner] })],
  });
}
