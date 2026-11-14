/* ============================================================
   SECTION C — THE PORTRAIT
   One real photograph, framed like a print on a scrapbook page:
   polaroid paper, torn tape, a stamp, and a caption in handwriting.
   The image is never cropped square, never filtered, never redrawn.
   ============================================================ */

import { PORTRAIT, PORTRAIT_SECTION, RECIPIENT } from '../content';
import { el } from '../lib/dom';
import { bow } from '../lib/svg';

export function buildPortrait(): HTMLElement {
  const eyebrow = el('p', { className: 'eyebrow', text: PORTRAIT_SECTION.eyebrow, attrs: { 'data-reveal': '' } });

  const heading = el('h2', {
    className: 'h2',
    attrs: { id: 'portrait-title', 'data-reveal': '' },
  });
  // Split the given heading so the last three words can carry the rose accent.
  const headingWords = PORTRAIT_SECTION.heading.split(' ');
  const accentFrom = headingWords.length - 3;
  heading.append(
    document.createTextNode(`${headingWords.slice(0, accentFrom).join(' ')} `),
    el('span', { className: 'accent', text: headingWords.slice(accentFrom).join(' ') }),
  );

  const body = el('div', { className: 'prose portrait__lede', attrs: { 'data-reveal': '' } });
  for (const paragraph of PORTRAIT_SECTION.body) {
    body.append(el('p', { text: paragraph }));
  }

  const stamp = el('div', {
    className: 'stamp portrait__stamp',
    attrs: { 'aria-hidden': 'true' },
    children: [
      el('span', {
        className: 'stamp__inner',
        children: [
          el('span', { className: 'stamp__year', text: PORTRAIT_SECTION.stamp.year }),
          el('span', { className: 'stamp__label', text: PORTRAIT_SECTION.stamp.label }),
        ],
      }),
    ],
  });

  const text = el('div', {
    className: 'spread__text',
    children: [
      eyebrow,
      heading,
      el('div', { className: 'rule rule--tight' }),
      body,
      el('p', {
        className: 'portrait__signature hand hand--ink',
        text: `— ${RECIPIENT.nickname}, as I keep you`,
      }),
    ],
  });

  const image = el('img', {
    attrs: {
      src: PORTRAIT.src,
      width: PORTRAIT.width,
      height: PORTRAIT.height,
      alt: PORTRAIT.alt,
      decoding: 'async',
      // This is the one portrait of the page: load it eagerly, not lazily.
      loading: 'eager',
      fetchpriority: 'high',
    },
  });

  const figure = el('figure', {
    className: 'polaroid polaroid--lift-right portrait__figure',
    attrs: { 'data-reveal': '' },
    children: [
      el('div', { className: 'polaroid__frame', children: [image] }),
      el('span', { className: 'tape tape--tl', attrs: { 'aria-hidden': 'true' } }),
      el('span', { className: 'tape tape--tr', attrs: { 'aria-hidden': 'true' } }),
      el('figcaption', { text: PORTRAIT_SECTION.caption }),
      stamp,
    ],
  });

  const spread = el('div', { className: 'spread spread--flip', children: [text, figure] });

  return el('section', {
    className: 'section portrait',
    attrs: { id: 'portrait', 'aria-labelledby': 'portrait-title' },
    children: [
      el('div', {
        className: 'page',
        children: [
          spread,
          el('div', {
            className: 'portrait__bow',
            attrs: { 'aria-hidden': 'true' },
            children: [bow(30)],
          }),
        ],
      }),
    ],
  });
}
