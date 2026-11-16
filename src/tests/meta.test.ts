import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SITE } from '../content';

/**
 * The link-preview tags live in index.html (Vite does not process them), so
 * these tests keep that static head honest against the single source of truth
 * in content.ts. A card that previews wrong is the first thing anyone sees.
 */
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

function metaContent(attribute: 'name' | 'property', key: string): string | null {
  const pattern = new RegExp(
    `<meta\\s+${attribute}="${key}"\\s+content="([^"]*)"\\s*/?>`,
    'i',
  );
  return html.match(pattern)?.[1] ?? null;
}

function linkHref(rel: string): string | null {
  const pattern = new RegExp(`<link\\s+rel="${rel}"\\s+href="([^"]*)"\\s*/?>`, 'i');
  return html.match(pattern)?.[1] ?? null;
}

describe('document head', () => {
  it('uses the site title and description from the content file', () => {
    expect(html).toContain(`<title>${SITE.title}</title>`);
    expect(metaContent('name', 'description')).toBe(SITE.description);
  });

  it('declares a canonical address that matches where the site lives', () => {
    expect(linkHref('canonical')).toBe(SITE.url);
  });

  it('gives every section the phone needs to lay the page out', () => {
    expect(metaContent('name', 'viewport')).toContain('width=device-width');
    expect(metaContent('name', 'theme-color')).toBeTruthy();
  });
});

describe('link preview tags', () => {
  it('mirrors the title, description and url for Open Graph', () => {
    expect(metaContent('property', 'og:title')).toBe(SITE.title);
    expect(metaContent('property', 'og:description')).toBe(SITE.description);
    expect(metaContent('property', 'og:url')).toBe(SITE.url);
    expect(metaContent('property', 'og:type')).toBe('website');
  });

  it('points Open Graph at an absolute image url, never a relative one', () => {
    const image = metaContent('property', 'og:image');
    expect(image).toBe(`${SITE.url}${SITE.ogImage}`);
    expect(image?.startsWith('https://')).toBe(true);
    expect(metaContent('property', 'og:image:alt')).toBe(SITE.ogImageAlt);
  });

  it('asks for the large Twitter card and supplies the same artwork', () => {
    expect(metaContent('name', 'twitter:card')).toBe('summary_large_image');
    expect(metaContent('name', 'twitter:title')).toBe(SITE.title);
    expect(metaContent('name', 'twitter:image')).toBe(`${SITE.url}${SITE.ogImage}`);
  });
});

describe('the social card artwork', () => {
  const cardPath = resolve(process.cwd(), 'public', SITE.ogImage);
  const card = readFileSync(cardPath);

  /**
   * The card is a JPEG, so its size is not at a fixed offset the way a PNG
   * header is: it lives in the frame header (SOF), behind a chain of segments
   * whose lengths have to be walked. Progressive JPEGs put a lot of them there.
   */
  function jpegFrame(image: Buffer): { width: number; height: number } {
    let offset = 2; // past the SOI marker
    while (offset + 3 < image.length) {
      if (image[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = image[offset + 1] ?? 0;
      // Fill bytes, a bare marker, or a restart/standalone marker: no payload.
      if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2;
        continue;
      }
      const length = image.readUInt16BE(offset + 2);
      // SOF0..SOF15, minus the three that are not frame headers.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: image.readUInt16BE(offset + 5), width: image.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
    throw new Error('no frame header in the JPEG');
  }

  it('is a real JPEG file', () => {
    expect(card.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(card.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
  });

  it('is the format the head declares, not just a file with a JPEG name', () => {
    // A PNG renamed to .jpg is the failure this catches: the bytes and the
    // declared type have to agree, or a crawler refuses the card.
    expect(metaContent('property', 'og:image:type')).toBe('image/jpeg');
    expect(SITE.ogImage.endsWith('.jpg')).toBe(true);
  });

  it('is exactly the size the head claims, in the 1.91:1 preview ratio', () => {
    const { width, height } = jpegFrame(card);

    expect(width).toBe(Number(metaContent('property', 'og:image:width')));
    expect(height).toBe(Number(metaContent('property', 'og:image:height')));
    expect(width).toBe(1200);
    expect(height).toBe(630);
  });

  it('stays light enough to fetch on a phone before the page opens', () => {
    // The PNG this replaced was 447 KB for the same 1200x630 card. A card
    // re-rendered and saved as PNG again would blow this and fail here.
    expect(card.byteLength).toBeLessThan(150 * 1024);
  });
});
