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

  it('is a real PNG file', () => {
    expect(card.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it('is exactly the size the head claims, in the 1.91:1 preview ratio', () => {
    const width = card.readUInt32BE(16);
    const height = card.readUInt32BE(20);

    expect(width).toBe(Number(metaContent('property', 'og:image:width')));
    expect(height).toBe(Number(metaContent('property', 'og:image:height')));
    expect(width).toBe(1200);
    expect(height).toBe(630);
  });

  it('stays well under the size limit the big platforms enforce', () => {
    expect(card.byteLength).toBeLessThan(5 * 1024 * 1024);
  });
});
