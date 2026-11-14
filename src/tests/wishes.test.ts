import { describe, expect, it } from 'vitest';

import {
  WISH_CATEGORIES,
  WISH_LIMITS,
  categoryLabel,
  isWishCategory,
  sanitizeText,
  sortWishes,
  toWish,
  validateWish,
  type Wish,
} from '../lib/wishes';

const VALID = { title: 'A quiet place to live', description: 'Somewhere with a window and good light.', category: 'dream' };

function wish(id: string, createdAt: string, title = 'x'): Wish {
  return { id, createdAt, title, description: 'desc', category: 'dream', source: 'device' };
}

describe('isWishCategory', () => {
  it('accepts only the published categories', () => {
    for (const category of WISH_CATEGORIES) expect(isWishCategory(category)).toBe(true);
    expect(isWishCategory('holiday')).toBe(false);
    expect(isWishCategory(42)).toBe(false);
    expect(isWishCategory(null)).toBe(false);
  });
});

describe('sanitizeText', () => {
  it('trims, collapses runs of spaces and drops control characters', () => {
    expect(sanitizeText('  hello   world  ')).toBe('hello world');
    expect(sanitizeText('a\u0000b\u0007c')).toBe('abc');
    expect(sanitizeText('line\n\n\n\nbreak')).toBe('line\n\nbreak');
  });
});

describe('validateWish', () => {
  it('accepts a well-formed wish and returns a clean value', () => {
    const result = validateWish({ ...VALID, title: '  A quiet   place  ' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ title: 'A quiet place', description: VALID.description, category: 'dream' });
    }
  });

  it('rejects a title that is missing or too short', () => {
    const result = validateWish({ ...VALID, title: ' ' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.title).toBeTruthy();
  });

  it('rejects an over-long title and description', () => {
    const long = 'a'.repeat(WISH_LIMITS.titleMax + 1);
    const result = validateWish({ ...VALID, title: long, description: 'b'.repeat(WISH_LIMITS.descriptionMax + 1) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.title).toContain(String(WISH_LIMITS.titleMax));
      expect(result.errors.description).toContain(String(WISH_LIMITS.descriptionMax));
    }
  });

  it('rejects a missing or unknown category', () => {
    for (const category of [undefined, 'nope', 7]) {
      const result = validateWish({ ...VALID, category });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.category).toBeTruthy();
    }
  });

  it('rejects empty and non-object input without throwing', () => {
    for (const input of [null, undefined, 'a wish', 12, []]) {
      const result = validateWish(input);
      expect(result.ok).toBe(false);
    }
    const empty = validateWish({});
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(Object.keys(empty.errors).sort()).toEqual(['category', 'description', 'title']);
    }
  });

  it('accepts exactly the maximum lengths', () => {
    const result = validateWish({
      title: 'a'.repeat(WISH_LIMITS.titleMax),
      description: 'b'.repeat(WISH_LIMITS.descriptionMax),
      category: 'self',
    });
    expect(result.ok).toBe(true);
  });
});

describe('toWish', () => {
  it('normalises a database row and tags its source', () => {
    const row = {
      id: 'abc',
      created_at: '2026-05-01T10:00:00.000Z',
      title: 'Grow something',
      description: 'A plant, a habit, a person.',
      category: 'self',
    };
    const normalised = toWish(row, 'cloud');
    expect(normalised?.createdAt).toBe('2026-05-01T10:00:00.000Z');
    expect(normalised?.source).toBe('cloud');
  });

  it('also accepts camelCase records from device storage', () => {
    const normalised = toWish(
      { id: 'abc', createdAt: '2026-05-01T10:00:00.000Z', title: 'Grow', description: 'Something.', category: 'self' },
      'device',
    );
    expect(normalised?.source).toBe('device');
  });

  it('rejects malformed records instead of trusting them', () => {
    expect(toWish(null, 'device')).toBeNull();
    expect(toWish({ id: 'abc' }, 'device')).toBeNull();
    expect(toWish({ id: 'abc', createdAt: 'nope', title: 'x', description: 'y', category: 'self' }, 'device')).toBeNull();
    expect(
      toWish({ id: 'abc', createdAt: '2026-05-01T10:00:00.000Z', title: '', description: 'y', category: 'self' }, 'device'),
    ).toBeNull();
  });
});

describe('sortWishes', () => {
  it('puts the newest wish first', () => {
    const sorted = sortWishes([
      wish('a', '2026-01-01T00:00:00.000Z'),
      wish('c', '2026-03-01T00:00:00.000Z'),
      wish('b', '2026-02-01T00:00:00.000Z'),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['c', 'b', 'a']);
  });

  it('is stable for identical timestamps', () => {
    const sorted = sortWishes([wish('b', '2026-01-01T00:00:00.000Z'), wish('a', '2026-01-01T00:00:00.000Z')]);
    expect(sorted.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const input = [wish('a', '2026-01-01T00:00:00.000Z'), wish('b', '2026-02-01T00:00:00.000Z')];
    sortWishes(input);
    expect(input.map((item) => item.id)).toEqual(['a', 'b']);
  });
});

describe('categoryLabel', () => {
  it('returns human copy for each category, never a raw slug', () => {
    for (const category of WISH_CATEGORIES) {
      const label = categoryLabel(category);
      expect(label.length).toBeGreaterThan(1);
      expect(label).not.toBe(category);
      expect(label).not.toMatch(/[-_]/);
    }
  });
});
