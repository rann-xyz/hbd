/* ============================================================
   MUSIC CONTROL — one small button, bottom right, that turns the
   birthday tune on and off.

   It stays out of the way until the surprise is opened, and it never
   lies about what it is doing: the pressed state, the label and the
   little animation all come from the same reading of the music box.
   ============================================================ */

import { MUSIC } from '../content';
import { el, setHidden } from '../lib/dom';
import type { MusicBox } from '../lib/music';
import { note } from '../lib/svg';

export interface MusicControlHandle {
  readonly element: HTMLElement;
  /** Reveal it — the shell calls this when the surprise opens. */
  reveal(): void;
  /** Re-read the box's state and update the button. */
  sync(): void;
  destroy(): void;
}

export function buildMusicControl(box: MusicBox): MusicControlHandle {
  const icon = el('span', {
    className: 'music__icon',
    attrs: { 'aria-hidden': 'true' },
    children: [note(17)],
  });

  const button = el('button', {
    className: 'music__toggle',
    attrs: {
      type: 'button',
      'data-music-toggle': '',
      'aria-pressed': 'false',
      'aria-label': MUSIC.playLabel,
      title: MUSIC.hint,
    },
    children: [icon],
  });

  const element = el('div', {
    className: 'music',
    attrs: { 'data-music': '', hidden: '' },
    children: [button],
  });

  function sync(): void {
    const playing = box.isPlaying();
    button.setAttribute('aria-pressed', playing ? 'true' : 'false');
    button.setAttribute('aria-label', playing ? MUSIC.pauseLabel : MUSIC.playLabel);
    element.classList.toggle('is-playing', playing);
  }

  const onClick = (): void => {
    box.toggle();
    sync();
  };

  button.addEventListener('click', onClick);
  sync();

  return {
    element,
    reveal(): void {
      setHidden(element, false);
    },
    sync,
    destroy(): void {
      button.removeEventListener('click', onClick);
    },
  };
}
