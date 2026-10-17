/**
 * `scripts/bench-decode.mjs` (plan R1-05 B4): the pages the TV render bench's `decode` scenario
 * fetches, decodes and uploads — two synthetic 2048² pages (RGBA, and PNG-8) generated at
 * bench-build time, deterministic byte for byte, sized like detailed pixel art, plus the shipped
 * atlas's `common` and zone A pages exactly as the asset pipeline builds them.
 */
import { describe, expect, it } from 'vitest';
import {
  DECODE_BYTE_BANDS,
  DECODE_PAGE_IDS,
  DECODE_PAGE_PREFIX,
  DECODE_PAGE_SIZE,
  DECODE_SEED,
  buildDecodePages,
  decodeArtImage,
  decodePageFile,
  pngColorType,
} from '../../scripts/bench-decode.mjs';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { decodePng, encodePng, indexedPalette } from '../../../../scripts/assets/png.mjs';

/**
 * Distinct alpha values of an image.
 *
 * @param data - RGBA bytes.
 * @returns The alpha values present.
 */
function alphas(data: Uint8Array): Set<number> {
  const out = new Set<number>();
  for (let i = 3; i < data.length; i += 4) out.add(data[i]);
  return out;
}

describe('bench-decode: the synthetic pages', () => {
  it('names the pages and their files', () => {
    expect(DECODE_PAGE_IDS).toEqual(['rgba-2048', 'png8-2048', 'common', 'zone-a']);
    expect(DECODE_PAGE_SIZE).toBe(2048);
    expect(DECODE_PAGE_PREFIX).toBe('decode-');
    expect(decodePageFile('rgba-2048')).toBe('decode-rgba-2048.png');
  });

  it('is deterministic: the same seed draws the same pixels, another seed others', () => {
    const a = decodeArtImage('rgba', 256);
    const b = decodeArtImage('rgba', 256);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    const other = decodeArtImage('rgba', 256, DECODE_SEED + 1);
    expect(Buffer.from(a.data).equals(Buffer.from(other.data))).toBe(false);
    expect(encodePng(decodeArtImage('png8', 256), { indexed: 'auto' })).toEqual(
      encodePng(decodeArtImage('png8', 256), { indexed: 'auto' }),
    );
  });

  it('packs a page like an atlas: mostly covered, with transparent gaps', () => {
    const page = decodeArtImage('rgba', 512);
    let empty = 0;
    for (let i = 3; i < page.data.length; i += 4) if (page.data[i] === 0) empty++;
    const share = empty / (512 * 512);
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.6);
  });

  it('keeps the RGBA page full-colour with soft alpha, and the PNG-8 page within 256 colours', () => {
    const rgba = decodeArtImage('rgba', 512);
    expect(indexedPalette(rgba)).toBeNull();
    expect(alphas(rgba.data).size).toBeGreaterThan(16);
    const png8 = decodeArtImage('png8', 512);
    const palette = indexedPalette(png8);
    expect(palette).not.toBeNull();
    expect(palette?.length).toBeLessThanOrEqual(65);
    expect([...alphas(png8.data)].sort((x, y) => x - y)).toEqual([0, 255]);
    // The repo's encoder picks the colour type by itself (decision W3-3).
    expect(pngColorType(encodePng(rgba, { indexed: 'auto' }))).toBe(6);
    expect(pngColorType(encodePng(png8, { indexed: 'auto' }))).toBe(3);
  });

  it('refuses an unknown mode and reads no colour type from junk', () => {
    expect(() => decodeArtImage('gif' as 'rgba', 16)).toThrow(RangeError);
    expect(pngColorType(new Uint8Array(10))).toBe(-1);
    expect(pngColorType(new Uint8Array(40))).toBe(-1);
  });
});

describe('bench-decode: the pages the bench ships', () => {
  it('builds the two 2048² pages in their byte bands and the shipped common and zone A pages', () => {
    const pages = buildDecodePages();
    expect(pages.map((page) => page.id)).toEqual(DECODE_PAGE_IDS);
    expect(pages.map((page) => page.file)).toEqual(DECODE_PAGE_IDS.map(decodePageFile));
    const [rgba, png8, common, zone] = pages;
    for (const page of [rgba, png8]) {
      expect([page.width, page.height]).toEqual([2048, 2048]);
      const image = decodePng(page.png);
      expect([image.width, image.height]).toEqual([2048, 2048]);
      const [low, high] = DECODE_BYTE_BANDS[page.id as keyof typeof DECODE_BYTE_BANDS];
      expect(page.png.length, `${page.id}: ${page.png.length} bytes`).toBeGreaterThanOrEqual(low);
      expect(page.png.length, `${page.id}: ${page.png.length} bytes`).toBeLessThanOrEqual(high);
    }
    expect(pngColorType(rgba.png)).toBe(6);
    expect(pngColorType(png8.png)).toBe(3);
    expect(rgba.what).toContain('RGBA');
    expect(png8.what).toContain('PNG-8');
    // The shipped pages, byte for byte as the asset pipeline packs them (R1-05: common = page 0).
    const atlas = buildAtlas();
    const groups = atlas.manifest.pages.map((page) => (page as { group?: string }).group);
    const zoneIndex = groups.indexOf('zone-a');
    expect(zoneIndex).toBeGreaterThan(0);
    expect(common.png.equals(atlas.pages[0].png)).toBe(true);
    expect(zone.png.equals(atlas.pages[zoneIndex].png)).toBe(true);
    expect([common.width, common.height]).toEqual([
      atlas.manifest.pages[0].w,
      atlas.manifest.pages[0].h,
    ]);
    expect([zone.width, zone.height]).toEqual([
      atlas.manifest.pages[zoneIndex].w,
      atlas.manifest.pages[zoneIndex].h,
    ]);
    expect(common.what).toContain('main.png');
  }, 120_000);

  it('can build small synthetic pages for a quick look', () => {
    const pages = buildDecodePages({ size: 128 });
    expect([pages[0].width, pages[1].height]).toEqual([128, 128]);
    expect(decodePng(pages[0].png).width).toBe(128);
    expect(pages[0].what).toContain('128x128');
  }, 60_000);
});
