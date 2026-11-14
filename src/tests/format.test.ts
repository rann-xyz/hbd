import { describe, expect, it } from 'vitest';

import { counterText, formatDateOnly, formatDateTime, formatRelative, pad, parseDate, truncate } from '../lib/format';

describe('pad', () => {
  it('zero-pads to width', () => {
    expect(pad(7)).toBe('07');
    expect(pad(7, 3)).toBe('007');
    expect(pad(123, 2)).toBe('123');
  });

  it('survives junk input', () => {
    expect(pad(Number.NaN)).toBe('00');
    expect(pad(-5)).toBe('00');
    expect(pad(3.9)).toBe('03');
  });
});

describe('parseDate', () => {
  it('accepts ISO strings and Date objects', () => {
    expect(parseDate('2026-11-17T00:00:00.000Z')?.toISOString()).toBe('2026-11-17T00:00:00.000Z');
    expect(parseDate(new Date('2026-11-17T00:00:00.000Z'))?.getTime()).toBe(Date.parse('2026-11-17T00:00:00.000Z'));
  });

  it('returns null rather than an invalid date', () => {
    expect(parseDate('not a date')).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
  });
});

describe('formatDateTime', () => {
  it('renders the birthday instant in Jakarta time', () => {
    // 17 Nov 2026 00:00 UTC is 07:00 in Jakarta on the same day.
    const text = formatDateTime('2026-11-17T00:00:00.000Z', 'Asia/Jakarta', 'en-GB');
    expect(text).toMatch(/17/);
    expect(text).toMatch(/November/);
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/07:00/);
  });

  it('shows the previous day in UTC for a Jakarta-midnight instant', () => {
    const jakartaMidnight = '2026-11-16T17:00:00.000Z';
    expect(formatDateOnly(jakartaMidnight, 'Asia/Jakarta', 'en-GB')).toMatch(/17 November 2026/);
    expect(formatDateOnly(jakartaMidnight, 'UTC', 'en-GB')).toMatch(/16 November 2026/);
  });

  it('returns an empty string instead of "Invalid Date"', () => {
    expect(formatDateTime('rubbish', 'Asia/Jakarta', 'en-GB')).toBe('');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-11-17T12:00:00.000Z');

  it('describes the recent past and the near future', () => {
    expect(formatRelative('2026-11-17T11:55:00.000Z', now, 'en-GB')).toMatch(/5 minutes ago/);
    expect(formatRelative('2026-11-17T13:00:00.000Z', now, 'en-GB')).toMatch(/in 1 hour/);
    expect(formatRelative('2026-11-14T12:00:00.000Z', now, 'en-GB')).toMatch(/3 days ago/);
  });

  it('handles the exact present moment', () => {
    expect(formatRelative(now, now, 'en-GB').length).toBeGreaterThan(0);
  });

  it('returns an empty string for junk', () => {
    expect(formatRelative('nope', now, 'en-GB')).toBe('');
  });
});

describe('truncate / counterText', () => {
  it('trims without cutting words in half unnecessarily', () => {
    expect(truncate('short', 20)).toBe('short');
    expect(truncate('a much longer wish than allowed', 12)).toHaveLength(12);
    expect(truncate('a much longer wish than allowed', 12).endsWith('…')).toBe(true);
  });

  it('counts characters honestly', () => {
    expect(counterText('hello', 600)).toBe('5 / 600');
  });
});

/**
 * Every other test passes a locale explicitly, which is exactly how a wrong
 * default hid for so long: the wish cards rendered "sekarang" and
 * "pukul 16.44" in the middle of an English page. These call the formatters
 * the way the site calls them — with no locale at all.
 */
describe('the default locale', () => {
  const now = new Date('2026-11-17T12:00:00.000Z');

  it('speaks the same language as the page', () => {
    expect(formatRelative('2026-11-17T11:55:00.000Z', now)).toMatch(/minutes ago/);
    expect(formatDateTime('2026-11-17T00:00:00.000Z')).toMatch(/at /);
  });

  it('never drops Indonesian into an English page', () => {
    const rendered = [
      formatRelative('2026-11-17T11:55:00.000Z', now),
      formatRelative(now, now),
      formatDateTime('2026-11-17T00:00:00.000Z'),
      formatDateOnly('2026-11-17T00:00:00.000Z'),
    ].join(' | ');

    expect(rendered).not.toMatch(/sekarang|menit|yang lalu|pukul/);
  });
});
