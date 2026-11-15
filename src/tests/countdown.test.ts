import { afterEach, describe, expect, it } from 'vitest';

import { COUNTDOWN_COPY } from '../content';
import {
  COUNTDOWN_UNITS,
  describeAnnouncement,
  describeRemaining,
  getCountdownState,
  getPhase,
  padParts,
  splitParts,
} from '../lib/countdown';
import { buildCountdown, type CountdownController } from '../sections/countdown';

const LABELS = COUNTDOWN_COPY.units;

/**
 * Count the assignments to `textContent` on a node.
 *
 * `setText` only writes when the value actually differs, so one write is one
 * announcement — and the count is exactly what a screen reader hears. Reading
 * `textContent` back would not do: the value can be re-set to the same string
 * without any way to tell from the outside.
 */
function countTextWrites(node: Element): () => number {
  let writes = 0;
  const real = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
  if (!real || typeof real.get !== 'function' || typeof real.set !== 'function') {
    throw new Error('textContent is not an accessor on Node.prototype');
  }
  const read = real.get as (this: Node) => string;
  const write = real.set as (this: Node, value: string) => void;

  Object.defineProperty(node, 'textContent', {
    configurable: true,
    get(this: Node): string {
      return read.call(this);
    },
    set(this: Node, value: string): void {
      writes += 1;
      write.call(this, value);
    },
  });

  return () => writes;
}

/** The birthday is 17 November in Jakarta (UTC+7) — these instants are UTC. */
const WIB_MIDNIGHT_MINUS_1S = new Date('2026-11-16T16:59:59.000Z');
const WIB_MIDNIGHT = new Date('2026-11-16T17:00:00.000Z');
const WIB_DAY_END = new Date('2026-11-17T16:59:59.999Z');
const WIB_DAY_AFTER = new Date('2026-11-17T17:00:00.000Z');

describe('splitParts', () => {
  it('breaks a duration into whole days, hours, minutes and seconds', () => {
    const ms = 1 * 86_400_000 + 2 * 3_600_000 + 3 * 60_000 + 4 * 1000 + 999;
    expect(splitParts(ms)).toEqual({ days: 1, hours: 2, minutes: 3, seconds: 4, totalMs: ms });
  });

  it('never returns negative values for a past or invalid duration', () => {
    expect(splitParts(-5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 });
    expect(splitParts(Number.NaN).totalMs).toBe(0);
    expect(splitParts(Number.POSITIVE_INFINITY).totalMs).toBe(0);
  });

  it('carries the boundary exactly', () => {
    expect(splitParts(999).seconds).toBe(0);
    expect(splitParts(1000).seconds).toBe(1);
    expect(splitParts(86_399_999).days).toBe(0);
    expect(splitParts(86_400_000).days).toBe(1);
  });
});

describe('getPhase', () => {
  it('is "before" up to the very last second of the previous day', () => {
    expect(getPhase(WIB_MIDNIGHT_MINUS_1S)).toBe('before');
  });

  it('is "birthday" from Jakarta midnight until the last millisecond of the day', () => {
    expect(getPhase(WIB_MIDNIGHT)).toBe('birthday');
    expect(getPhase(new Date('2026-11-17T03:00:00.000Z'))).toBe('birthday');
    expect(getPhase(WIB_DAY_END)).toBe('birthday');
  });

  it('is "after" from the next Jakarta midnight onwards', () => {
    expect(getPhase(WIB_DAY_AFTER)).toBe('after');
  });
});

describe('getCountdownState', () => {
  it('counts to the start of the day while it is still ahead', () => {
    // Exactly 48 hours before Jakarta midnight on the 17th (17:00 UTC on the 14th).
    const now = new Date('2026-11-14T17:00:00.000Z');
    const state = getCountdownState(now);
    expect(state.phase).toBe('before');
    expect(state.target).toBe('start');
    expect(state.parts.days).toBe(2);
    expect(state.parts.hours).toBe(0);
    expect(state.parts.totalMs).toBe(new Date('2026-11-16T17:00:00.000Z').getTime() - now.getTime());
  });

  it('counts down the remaining hours of the day once it has started', () => {
    const state = getCountdownState(WIB_MIDNIGHT);
    expect(state.phase).toBe('birthday');
    expect(state.target).toBe('end');
    expect(state.parts.hours).toBe(23);
    expect(state.parts.minutes).toBe(59);
  });

  it('reports nothing left after the day, with no negative numbers', () => {
    const state = getCountdownState(new Date('2026-12-01T00:00:00.000Z'));
    expect(state.phase).toBe('after');
    expect(state.target).toBeNull();
    expect(state.parts.totalMs).toBe(0);
  });
});

describe('padParts / describeRemaining', () => {
  it('zero-pads every unit', () => {
    expect(padParts({ days: 3, hours: 4, minutes: 5, seconds: 6, totalMs: 0 })).toEqual({
      days: '03',
      hours: '04',
      minutes: '05',
      seconds: '06',
    });
  });

  it('keeps large day counts unpadded beyond two digits', () => {
    expect(padParts({ days: 132, hours: 0, minutes: 0, seconds: 0, totalMs: 0 }).days).toBe('132');
  });

  it('speaks a natural sentence and skips leading zero units', () => {
    expect(describeRemaining({ days: 0, hours: 2, minutes: 5, seconds: 1, totalMs: 0 }, LABELS)).toBe(
      '2 hours, 5 minutes, 1 second',
    );
    expect(describeRemaining({ days: 1, hours: 0, minutes: 0, seconds: 0, totalMs: 0 }, LABELS)).toBe('1 day');
    expect(describeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 }, LABELS)).toBe('0 seconds');
  });

  it('registers exactly four units', () => {
    expect(COUNTDOWN_UNITS).toEqual(['days', 'hours', 'minutes', 'seconds']);
  });
});

describe('describeAnnouncement', () => {
  it('drops the seconds, so the sentence is stable for a whole minute', () => {
    const parts = { days: 1, hours: 2, minutes: 3, seconds: 4, totalMs: 0 };
    expect(describeAnnouncement(parts, LABELS)).toBe('1 day, 2 hours, 3 minutes');
    expect(describeRemaining(parts, LABELS)).toBe('1 day, 2 hours, 3 minutes, 4 seconds');
  });

  it('keeps the leading unit and nothing else when the rest are zero', () => {
    expect(describeAnnouncement({ days: 0, hours: 0, minutes: 10, seconds: 45, totalMs: 0 }, LABELS)).toBe(
      '10 minutes',
    );
    expect(describeAnnouncement({ days: 3, hours: 0, minutes: 0, seconds: 9, totalMs: 0 }, LABELS)).toBe('3 days');
  });

  it('has nothing coarser to say under a minute', () => {
    // The coarse sentence would be describeRemaining's "0 seconds" fallback,
    // which is worse than staying quiet.
    expect(describeAnnouncement({ days: 0, hours: 0, minutes: 0, seconds: 42, totalMs: 0 }, LABELS)).toBeNull();
  });
});

describe('countdown section', () => {
  let controller: CountdownController | null = null;

  afterEach(() => {
    controller?.destroy();
    controller = null;
    document.body.textContent = '';
  });

  it('renders the exact copy from the content file', () => {
    controller = buildCountdown(() => new Date('2026-01-01T00:00:00.000Z'));
    const heading = controller.element.querySelector('#countdown-title');
    expect(heading?.textContent).toBe(`${COUNTDOWN_COPY.headingLead} ${COUNTDOWN_COPY.headingAccent}`);
    expect(controller.element.querySelector('.eyebrow')?.textContent).toBe(COUNTDOWN_COPY.eyebrow);
  });

  it('shows real digits while the day is still ahead', () => {
    controller = buildCountdown(() => new Date('2026-11-16T16:50:00.000Z'));
    document.body.append(controller.element);

    const units = Array.from(controller.element.querySelectorAll('.countdown__unit'));
    const values = units.map((unit) => unit.querySelector('.countdown__value')?.textContent);
    expect(values).toEqual(['00', '00', '10', '00']);

    const live = controller.element.querySelector('[aria-live]');
    expect(live?.textContent).toContain('10 minutes');
  });

  it('animates each digit as its own element', () => {
    controller = buildCountdown(() => new Date('2026-11-15T16:59:59.000Z'));
    const digits = controller.element.querySelectorAll('.countdown__digit');
    expect(digits.length).toBe(8);
  });

  it('updates the digits when the clock moves', () => {
    const now = new Date('2026-11-16T16:59:00.000Z');
    controller = buildCountdown(() => now);

    const seconds = controller.element.querySelectorAll('.countdown__unit')[3];
    expect(seconds?.querySelector('.countdown__value')?.textContent).toBe('00');

    controller.tick(new Date('2026-11-16T16:59:30.000Z'));
    expect(seconds?.querySelector('.countdown__value')?.textContent).toBe('30');
  });

  it('switches to celebration mode on the day itself', () => {
    controller = buildCountdown(() => WIB_MIDNIGHT);
    const grid = controller.element.querySelector('[data-countdown-grid]');
    const celebration = controller.element.querySelector('[data-countdown-birthday]');
    const after = controller.element.querySelector('[data-countdown-after]');

    expect(grid?.hasAttribute('hidden')).toBe(true);
    expect(celebration?.hasAttribute('hidden')).toBe(false);
    expect(after?.hasAttribute('hidden')).toBe(true);
    expect(celebration?.textContent).toContain(COUNTDOWN_COPY.birthdayHeading);
  });

  it('switches to the afterword once the day is over', () => {
    controller = buildCountdown(() => WIB_DAY_AFTER);
    expect(controller.element.querySelector('[data-countdown-grid]')?.hasAttribute('hidden')).toBe(true);
    expect(controller.element.querySelector('[data-countdown-birthday]')?.hasAttribute('hidden')).toBe(true);
    expect(controller.element.querySelector('[data-countdown-after]')?.hasAttribute('hidden')).toBe(false);
  });

  it('has a labelled section for assistive tech', () => {
    controller = buildCountdown(() => new Date('2026-01-01T00:00:00.000Z'));
    expect(controller.element.getAttribute('aria-labelledby')).toBe('countdown-title');
    expect(controller.element.querySelector('[aria-live]')?.getAttribute('aria-atomic')).toBe('true');
  });

  it('does not announce once a second', () => {
    // 29 minutes and 30 seconds before Jakarta midnight.
    const start = new Date('2026-11-16T16:30:30.000Z');
    controller = buildCountdown(() => start);
    document.body.append(controller.element);

    const live = controller.element.querySelector('[aria-live]') as HTMLElement;
    expect(live.textContent).toBe(`${COUNTDOWN_COPY.ariaLivePrefix} 29 minutes`);

    const writes = countTextWrites(live);
    for (let second = 1; second <= 30; second += 1) {
      controller.tick(new Date(start.getTime() + second * 1000));
    }

    // Half a minute of ticking, and the region has not been touched once. A
    // polite live region rewritten every second queues an announcement per
    // second and talks over every other element on the page.
    expect(writes()).toBe(0);
    expect(live.textContent).not.toMatch(/\d+ seconds?/);
  });

  it('speaks again when the minute turns', () => {
    const start = new Date('2026-11-16T16:30:30.000Z');
    controller = buildCountdown(() => start);
    document.body.append(controller.element);
    const live = controller.element.querySelector('[aria-live]') as HTMLElement;

    const writes = countTextWrites(live);
    controller.tick(new Date(start.getTime() + 31_000));

    expect(writes()).toBe(1);
    expect(live.textContent).toBe(`${COUNTDOWN_COPY.ariaLivePrefix} 28 minutes`);
  });

  it('still says something when the page opens inside the final minute', () => {
    const start = new Date('2026-11-16T16:59:30.000Z');
    controller = buildCountdown(() => start);
    document.body.append(controller.element);
    const live = controller.element.querySelector('[aria-live]') as HTMLElement;

    // There is nothing coarser to say — but an empty live region says nothing.
    expect(live.textContent).toBe(`${COUNTDOWN_COPY.ariaLivePrefix} 30 seconds`);

    const writes = countTextWrites(live);
    controller.tick(new Date(start.getTime() + 1000));
    expect(writes()).toBe(0);
    expect(live.textContent).toBe(`${COUNTDOWN_COPY.ariaLivePrefix} 30 seconds`);
  });
});
