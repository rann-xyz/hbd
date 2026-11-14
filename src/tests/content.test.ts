import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as content from '../content';
import { WISH_CATEGORIES } from '../lib/wishes';

const REQUIRED_APOLOGY =
  "I'm sorry I haven't been able to give you something special yet. I'm still trying my best to make it happen. Maybe I can't give you everything you deserve right now, but please know that I'm working on it. I hope one day I can give you something that makes you feel as special as you truly are.";

const EMOJI = /\p{Extended_Pictographic}/u;

/** Collect every string reachable from the content module. */
function collectStrings(value: unknown, found: string[] = [], depth = 0): string[] {
  if (depth > 6) return found;
  if (typeof value === 'string') {
    found.push(value);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, found, depth + 1);
    return found;
  }
  if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) collectStrings(item, found, depth + 1);
  }
  return found;
}

describe('required copy', () => {
  it('keeps the opening exactly as specified', () => {
    expect(content.OPENING.headline).toBe('A LITTLE WORLD MADE FOR YOU');
    expect(content.OPENING.intro).toBe('Some people make ordinary days feel a little more beautiful.');
    expect(content.OPENING.cta).toBe('OPEN YOUR SURPRISE');
  });

  it('keeps the portrait heading exactly as specified', () => {
    expect(content.PORTRAIT_SECTION.heading).toBe(
      'THE GIRL WHO MAKES THIS WORLD A LITTLE BRIGHTER',
    );
  });

  it('keeps the closing exactly as specified', () => {
    expect(content.CLOSING.heading).toBe('Happy Birthday, Fitria Cahaya Aulia.');
    expect(content.CLOSING.signature).toBe('Agis');
  });

  it('keeps the apology message word for word', () => {
    expect(content.LETTER.apology).toBe(REQUIRED_APOLOGY);
  });

  it('names the recipient and the author consistently', () => {
    expect(content.RECIPIENT.fullName).toBe('Fitria Cahaya Aulia');
    expect(content.AUTHOR.name).toBe('Agis');
  });
});

describe('little notes', () => {
  const requiredNotes = [
    { id: 'tired', label: 'When you feel tired' },
    { id: 'doubt', label: 'When you doubt yourself' },
    { id: 'miss', label: 'When you miss me' },
    { id: 'difficult', label: 'When life gets difficult' },
    { id: 'because', label: 'Just because' },
  ];

  it('has exactly the five specified notes, in order', () => {
    expect(content.NOTES.map((note) => ({ id: note.id, label: note.label }))).toEqual(requiredNotes);
  });

  it('gives every note a distinct sublabel and a real message', () => {
    const messages = new Set(content.NOTES.map((note) => note.message));
    expect(messages.size).toBe(content.NOTES.length);

    for (const note of content.NOTES) {
      expect(note.message.length).toBeGreaterThan(40);
      expect(note.sublabel.length).toBeGreaterThan(0);
      expect(note.message.endsWith('.')).toBe(true);
    }
  });

  it('never invents a shared memory or a fake event', () => {
    // No dates, no "remember when we..." — only the writer's own feelings.
    for (const note of content.NOTES) {
      expect(note.message).not.toMatch(/\bremember when\b|\b\d{4}\b|\byesterday\b|\blast week\b/i);
    }
  });
});

describe('house rules on the writing', () => {
  const strings = collectStrings(content);

  it('contains a meaningful amount of copy', () => {
    expect(strings.length).toBeGreaterThan(40);
  });

  it('uses no emoji anywhere in the content', () => {
    const offenders = strings.filter((value) => EMOJI.test(value));
    expect(offenders).toEqual([]);
  });

  it('has no placeholder text left behind', () => {
    const offenders = strings.filter((value) => /lorem ipsum|TODO|TBD|xxxx|placeholder/i.test(value));
    expect(offenders).toEqual([]);
  });

  it('opens with a real birthday the whole site agrees on', () => {
    expect(content.BIRTHDAY.iso).toBe('2026-11-17T00:00:00+07:00');
    expect(content.BIRTHDAY.isoEnd).toBe('2026-11-17T23:59:59.999+07:00');
    expect(content.BIRTHDAY.timeZone).toBe('Asia/Jakarta');
  });
});

describe('wish categories', () => {
  it('offers copy for every category the store accepts', () => {
    expect(Object.keys(content.WISH_CATEGORY_COPY).sort()).toEqual([...WISH_CATEGORIES].sort());
  });
});

describe('navigation', () => {
  it('only links to sections that are actually built', () => {
    const entries = content.navEntriesFor(content.BUILT_SECTIONS);
    expect(entries.map((entry) => entry.id)).toEqual([...content.BUILT_SECTIONS]);
    for (const entry of entries) {
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it('ignores ids it does not know about', () => {
    expect(content.navEntriesFor(['opening', 'not-a-section'])).toEqual([
      { id: 'opening', label: 'Opening' },
    ]);
  });
});

describe('the portrait asset', () => {
  const assetsPath = resolve(process.cwd(), 'public/assets/fitria-portrait.jpg');

  function jpegSize(buffer: Buffer): { width: number; height: number } | null {
    let index = 2;
    while (index < buffer.length - 9) {
      if (buffer[index] !== 0xff) {
        index += 1;
        continue;
      }
      const marker = buffer[index + 1];
      if (marker === undefined) return null;
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: buffer.readUInt16BE(index + 5), width: buffer.readUInt16BE(index + 7) };
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
        index += 2;
        continue;
      }
      const length = buffer.readUInt16BE(index + 2);
      index += 2 + length;
    }
    return null;
  }

  it('ships the photograph locally instead of hot-linking it', () => {
    expect(statSync(assetsPath).size).toBeGreaterThan(10_000);
    expect(content.PORTRAIT.src).toBe('./assets/fitria-portrait.jpg');
  });

  it('stores real pixels whose dimensions match the declared metadata', () => {
    const buffer = readFileSync(assetsPath);
    expect(buffer[0]).toBe(0xff);
    expect(buffer[1]).toBe(0xd8);

    const size = jpegSize(buffer);
    expect(size).not.toBeNull();
    expect(size?.width).toBe(content.PORTRAIT.width);
    expect(size?.height).toBe(content.PORTRAIT.height);
  });

  it('keeps the photograph in portrait orientation so it is never squashed', () => {
    expect(content.PORTRAIT.height).toBeGreaterThan(content.PORTRAIT.width);
    expect(content.PORTRAIT.alt.length).toBeGreaterThan(10);
  });
});
