/* ============================================================
   COUNTDOWN — the real arithmetic behind the digits.
   Timezone-safe by construction: the birthday window is expressed
   as absolute instants (WIB has no daylight saving), so a visitor
   in any timezone sees the same countdown to the same moment.
   ============================================================ */

import { BIRTHDAY } from '../content';

export const BIRTHDAY_START_ISO = BIRTHDAY.iso;
export const BIRTHDAY_END_ISO = BIRTHDAY.isoEnd;

export type CountdownPhase = 'before' | 'birthday' | 'after';

export interface CountdownParts {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly totalMs: number;
}

export interface CountdownState {
  readonly phase: CountdownPhase;
  readonly parts: CountdownParts;
  /** Which boundary the digits are counting to (null when the day is over). */
  readonly target: 'start' | 'end' | null;
}

export const ZERO_PARTS: CountdownParts = {
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  totalMs: 0,
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function birthdayWindow(): { readonly start: Date; readonly end: Date } {
  return { start: new Date(BIRTHDAY_START_ISO), end: new Date(BIRTHDAY_END_ISO) };
}

/** Split a duration into whole days/hours/minutes/seconds (never negative). */
export function splitParts(durationMs: number): CountdownParts {
  const total = Number.isFinite(durationMs) ? Math.max(0, Math.floor(durationMs)) : 0;
  return {
    days: Math.floor(total / DAY),
    hours: Math.floor((total % DAY) / HOUR),
    minutes: Math.floor((total % HOUR) / MINUTE),
    seconds: Math.floor((total % MINUTE) / SECOND),
    totalMs: total,
  };
}

export function getPhase(now: Date, start: Date = new Date(BIRTHDAY_START_ISO), end: Date = new Date(BIRTHDAY_END_ISO)): CountdownPhase {
  const time = now.getTime();
  if (time < start.getTime()) return 'before';
  if (time > end.getTime()) return 'after';
  return 'birthday';
}

export function getCountdownState(
  now: Date,
  start: Date = new Date(BIRTHDAY_START_ISO),
  end: Date = new Date(BIRTHDAY_END_ISO),
): CountdownState {
  const phase = getPhase(now, start, end);

  if (phase === 'before') {
    return { phase, parts: splitParts(start.getTime() - now.getTime()), target: 'start' };
  }
  if (phase === 'birthday') {
    return { phase, parts: splitParts(end.getTime() - now.getTime()), target: 'end' };
  }
  return { phase, parts: ZERO_PARTS, target: null };
}

export interface PaddedParts {
  readonly days: string;
  readonly hours: string;
  readonly minutes: string;
  readonly seconds: string;
}

export function padParts(parts: CountdownParts): PaddedParts {
  return {
    days: String(parts.days).padStart(2, '0'),
    hours: String(parts.hours).padStart(2, '0'),
    minutes: String(parts.minutes).padStart(2, '0'),
    seconds: String(parts.seconds).padStart(2, '0'),
  };
}

export const COUNTDOWN_UNITS = ['days', 'hours', 'minutes', 'seconds'] as const;
export type CountdownUnit = (typeof COUNTDOWN_UNITS)[number];

/** Human sentence for the aria-live region, so the ticking is not silent to screen readers. */
export function describeRemaining(parts: CountdownParts, labels: Record<CountdownUnit, string>): string {
  const ordered: readonly (readonly [CountdownUnit, number])[] = [
    ['days', parts.days],
    ['hours', parts.hours],
    ['minutes', parts.minutes],
    ['seconds', parts.seconds],
  ];

  const firstMeaningful = ordered.findIndex(([, value]) => value > 0);
  if (firstMeaningful === -1) return `0 ${labels.seconds.toLowerCase()}`;

  // Speak from the first meaningful unit to the last one, so "1 day" stays
  // "1 day" instead of being padded with a tail of zeroes.
  const lastMeaningful =
    ordered.length - 1 - [...ordered].reverse().findIndex(([, value]) => value > 0);

  return ordered
    .slice(firstMeaningful, lastMeaningful + 1)
    .map(([unit, value]) => {
      const label = labels[unit].toLowerCase();
      const spoken = value === 1 && label.endsWith('s') ? label.slice(0, -1) : label;
      return `${value} ${spoken}`;
    })
    .join(', ');
}

/** Milliseconds until the next whole second, so ticks stay aligned to the clock. */
export function msUntilNextSecond(now: Date): number {
  return SECOND - (now.getTime() % SECOND);
}
