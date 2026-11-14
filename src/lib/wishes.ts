/* ============================================================
   WISHES — the data contract for the Wish Journal.
   Validation lives here (not in the UI) so the form, the store and
   the tests all agree on exactly what a valid wish is. Wishes are
   private by default: nothing here reads someone else's entries.

   A wish is only a title and what it means. Categories were removed:
   asking someone to file their own wish under a label made the form
   feel like a database and the cards read like tags. Records written
   by the older version still load — `toWish` reads the two fields it
   needs and ignores anything else it finds in the row.
   ============================================================ */

export const WISH_LIMITS = {
  titleMin: 2,
  titleMax: 80,
  descriptionMin: 4,
  descriptionMax: 600,
  maxWishesPerDevice: 200,
} as const;

export interface WishInput {
  readonly title: string;
  readonly description: string;
}

export interface Wish extends WishInput {
  readonly id: string;
  readonly createdAt: string;
  /** Where this record actually lives — shown honestly in the UI. */
  readonly source: WishSource;
}

export type WishSource = 'cloud' | 'device';

export type WishField = 'title' | 'description';
export type WishFieldErrors = Partial<Record<WishField, string>>;

export type WishValidation =
  | { readonly ok: true; readonly value: WishInput }
  | { readonly ok: false; readonly errors: WishFieldErrors };

/** Drop anything that is not printable text, keeping tabs and newlines. */
function stripControlCharacters(value: string): string {
  let cleaned = '';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    const isLineBreak = code === 9 || code === 10;
    if (code === 127 || (code < 32 && !isLineBreak)) continue;
    cleaned += character;
  }
  return cleaned;
}

/** Cleanup for anything a visitor types: no control characters, no space runs. */
export function sanitizeText(value: string): string {
  return stripControlCharacters(value)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validateWish(input: unknown): WishValidation {
  const errors: WishFieldErrors = {};
  const record = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;

  const title = typeof record['title'] === 'string' ? sanitizeText(record['title']) : '';
  const description = typeof record['description'] === 'string' ? sanitizeText(record['description']) : '';

  if (title.length < WISH_LIMITS.titleMin) {
    errors.title = 'Give it at least a couple of characters.';
  } else if (title.length > WISH_LIMITS.titleMax) {
    errors.title = `Keep the title under ${WISH_LIMITS.titleMax} characters.`;
  }

  if (description.length < WISH_LIMITS.descriptionMin) {
    errors.description = 'A wish needs a little more than that.';
  } else if (description.length > WISH_LIMITS.descriptionMax) {
    errors.description = `Keep it under ${WISH_LIMITS.descriptionMax} characters.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, value: { title, description } };
}

/** Normalise a stored record (from Postgres or from device storage). */
export function toWish(record: unknown, source: WishSource): Wish | null {
  if (typeof record !== 'object' || record === null) return null;
  const row = record as Record<string, unknown>;

  const id = typeof row['id'] === 'string' ? row['id'] : '';
  const createdAtRaw = row['createdAt'] ?? row['created_at'];
  const createdAt = typeof createdAtRaw === 'string' ? createdAtRaw : '';

  const validation = validateWish({
    title: row['title'],
    description: row['description'],
  });

  if (!id || !createdAt || !validation.ok) return null;

  return { id, createdAt, source, ...validation.value };
}

/** Newest first, stable for identical timestamps. */
export function sortWishes(wishes: readonly Wish[]): Wish[] {
  return [...wishes].sort((a, b) => {
    const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
}
