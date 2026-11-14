/* ============================================================
   FORMAT — dates, times and digits, always rendered in the
   recipient's own timezone so nothing is ambiguous.
   ============================================================ */

export const DEFAULT_TIME_ZONE = 'Asia/Jakarta';
export const DEFAULT_LOCALE = 'id-ID';

export function pad(value: number, size = 2): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return String(safe).padStart(size, '0');
}

export function parseDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(
  value: Date | string | number,
  timeZone: string = DEFAULT_TIME_ZONE,
  locale: string = DEFAULT_LOCALE,
): string {
  const date = parseDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(date);
}

export function formatDateOnly(
  value: Date | string | number,
  timeZone: string = DEFAULT_TIME_ZONE,
  locale: string = DEFAULT_LOCALE,
): string {
  const date = parseDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(date);
}

/** "3 days ago" / "just now", for the wish journal. */
export function formatRelative(
  value: Date | string | number,
  now: Date = new Date(),
  locale: string = DEFAULT_LOCALE,
): string {
  const date = parseDate(value);
  if (!date) return '';

  const diffMs = date.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (absMs < minute) return formatter.format(0, 'second');
  if (absMs < hour) return formatter.format(Math.round(diffMs / minute), 'minute');
  if (absMs < day) return formatter.format(Math.round(diffMs / hour), 'hour');
  if (absMs < 30 * day) return formatter.format(Math.round(diffMs / day), 'day');
  return formatter.format(Math.round(diffMs / (30 * day)), 'month');
}

/** Character counter text, e.g. "128 / 600". */
export function counterText(value: string, max: number): string {
  return `${value.length} / ${max}`;
}

export function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
