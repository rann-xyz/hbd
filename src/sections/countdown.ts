/* ============================================================
   SECTION B — COUNTDOWN
   Real arithmetic (lib/countdown.ts), a real 1s tick, real birthday
   mode. Ticking is paused while the tab is hidden and stops once
   the day is over. Digits only animate when motion is welcome.
   ============================================================ */

import { BIRTHDAY, COUNTDOWN_COPY } from '../content';
import { getCountdownState, padParts, describeRemaining, COUNTDOWN_UNITS } from '../lib/countdown';
import { el, setHidden, setText } from '../lib/dom';
import { pulseClass } from '../lib/motion';
import { bow } from '../lib/svg';

export interface CountdownController {
  readonly element: HTMLElement;
  /** Recompute the display for a given moment (defaults to now). */
  tick(now?: Date): void;
  destroy(): void;
}

interface UnitNodes {
  readonly value: HTMLElement;
  readonly label: HTMLElement;
}

const UNIT_LABELS = COUNTDOWN_COPY.units;

/** Render a zero-padded number as individually animatable digit spans. */
function renderDigits(container: HTMLElement, value: string): void {
  const existing = Array.from(container.children) as HTMLElement[];

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? '';
    let node = existing[index];
    if (!node) {
      node = el('span', { className: 'countdown__digit' });
      container.append(node);
    }
    if (node.textContent !== character) {
      node.textContent = character;
      pulseClass(node, 'is-turning');
    }
  }

  // Drop leftovers when the digit count shrinks (e.g. 100 -> 99 days).
  while (container.children.length > value.length) {
    container.lastElementChild?.remove();
  }
}

export function buildCountdown(nowSource: () => Date = () => new Date()): CountdownController {
  const eyebrow = el('p', { className: 'eyebrow', text: COUNTDOWN_COPY.eyebrow, attrs: { 'data-reveal': '' } });
  const heading = el('h2', {
    className: 'h2',
    attrs: { id: 'countdown-title', 'data-reveal': '' },
  });
  heading.append(
    document.createTextNode(`${COUNTDOWN_COPY.headingLead} `),
    el('span', { className: 'accent', text: COUNTDOWN_COPY.headingAccent }),
  );
  const intro = el('p', { className: 'lead', text: COUNTDOWN_COPY.intro, attrs: { 'data-reveal': '' } });

  const units = new Map<string, UnitNodes>();
  const grid = el('div', {
    className: 'countdown__grid',
    attrs: { 'data-countdown-grid': '', 'aria-hidden': 'true' },
  });

  for (const unit of COUNTDOWN_UNITS) {
    const value = el('div', { className: 'countdown__value' });
    const label = el('div', { className: 'countdown__label', text: UNIT_LABELS[unit] });
    units.set(unit, { value, label });
    grid.append(el('div', { className: 'countdown__unit', children: [value, label] }));
  }

  // The visible digits are decorative; this region speaks the real value.
  const live = el('p', { className: 'sr-only', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } });

  const celebration = el('div', {
    className: 'celebration',
    attrs: { 'data-countdown-birthday': '', hidden: '' },
    children: [
      el('p', { className: 'eyebrow', text: BIRTHDAY.label }),
      el('h3', { className: 'h3 accent', text: COUNTDOWN_COPY.birthdayHeading }),
      el('p', { className: 'hand', text: COUNTDOWN_COPY.birthdayLine }),
      el('p', { className: 'prose', text: COUNTDOWN_COPY.birthdayNote }),
      el('span', { className: 'celebration__bow', attrs: { 'aria-hidden': 'true' }, children: [bow(34)] }),
    ],
  });

  const after = el('div', {
    className: 'afterword',
    attrs: { 'data-countdown-after': '', hidden: '' },
    children: [
      el('h3', { className: 'h3 accent', text: COUNTDOWN_COPY.afterHeading }),
      el('p', { className: 'prose', text: COUNTDOWN_COPY.afterLine }),
    ],
  });

  const head = el('div', {
    className: 'countdown__head',
    children: [eyebrow, heading, intro],
  });

  const section = el('section', {
    className: 'section countdown',
    attrs: { id: 'countdown', 'aria-labelledby': 'countdown-title' },
    children: [el('div', { className: 'page', children: [head, grid, live, celebration, after] })],
  });

  const tick = (now: Date = nowSource()): void => {
    const state = getCountdownState(now);
    const isBefore = state.phase === 'before';

    setHidden(grid, !isBefore);
    setHidden(celebration, state.phase !== 'birthday');
    setHidden(after, state.phase !== 'after');

    if (isBefore) {
      const padded = padParts(state.parts);
      renderDigits(units.get('days')?.value ?? grid, padded.days);
      renderDigits(units.get('hours')?.value ?? grid, padded.hours);
      renderDigits(units.get('minutes')?.value ?? grid, padded.minutes);
      renderDigits(units.get('seconds')?.value ?? grid, padded.seconds);
      setText(live, `${COUNTDOWN_COPY.ariaLivePrefix} ${describeRemaining(state.parts, UNIT_LABELS)}`);
      return;
    }

    if (state.phase === 'birthday') {
      setText(live, COUNTDOWN_COPY.birthdayLine);
      return;
    }

    setText(live, COUNTDOWN_COPY.afterLine);
  };

  let timer = 0;
  const startTimer = (): void => {
    if (timer !== 0) return;
    timer = window.setInterval(() => {
      tick();
      if (getCountdownState(nowSource()).phase === 'after') stopTimer();
    }, 1000);
  };
  const stopTimer = (): void => {
    if (timer === 0) return;
    window.clearInterval(timer);
    timer = 0;
  };

  const onVisibility = (): void => {
    if (document.hidden) {
      stopTimer();
      return;
    }
    tick();
    if (getCountdownState(nowSource()).phase === 'before') startTimer();
  };

  tick();
  if (getCountdownState(nowSource()).phase === 'before') startTimer();
  document.addEventListener('visibilitychange', onVisibility);

  return {
    element: section,
    tick,
    destroy(): void {
      stopTimer();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
