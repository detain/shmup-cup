/**
 * `scripts/bench-decode.mjs` (plan R1-05 B4, pages re-picked by plan R3-04.M4a): the pages the TV
 * render bench's `decode` scenario fetches, decodes and uploads — the interim stand-in zone A's own
 * packed PNG-8 page(s) (`scripts/assets/standin.mjs`), then the shipped atlas's `common` and zone A
 * pages exactly as the asset pipeline builds them — plus the manifest of the run's last page load,
 * `standin-zone`. The synthetic 2048² drawer stays exported (its tests and its sha pins here) even
 * though no build ships a page drawn by it.
 */
import { describe, expect, it } from 'vitest';
import {
  DECODE_BYTE_BANDS,
  DECODE_PAGE_IDS,
  DECODE_PAGE_PREFIX,
  DECODE_PAGE_SIZE,
  DECODE_SEED,
  buildDecodePages,
  buildDecodeStandin,
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

describe('bench-decode: the synthetic drawer (kept for its tests, not shipped)', () => {
  it('names the pages and their files', () => {
    expect(DECODE_PAGE_IDS).toEqual(['standin-zone-a', 'common', 'zone-a']);
    expect(DECODE_PAGE_SIZE).toBe(2048);
    expect(DECODE_PAGE_PREFIX).toBe('decode-');
    expect(decodePageFile('standin-zone-a')).toBe('decode-standin-zone-a.png');
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
  it('builds the stand-in zone A page(s), the shipped common and zone A pages', () => {
    const pages = buildDecodePages();
    // Today's stand-in pack is one page; a second would ride in right after the first.
    expect(pages.map((page) => page.id)).toEqual(DECODE_PAGE_IDS);
    expect(pages.map((page) => page.file)).toEqual(DECODE_PAGE_IDS.map(decodePageFile));
    const [standin, common, zone] = pages;
    expect(standin.what).toContain('stand-in zone A page 1/');
    expect(standin.what).toContain('PNG-8');
    expect(pngColorType(standin.png)).toBe(3);
    const image = decodePng(standin.png);
    expect([image.width, image.height]).toEqual([standin.width, standin.height]);
    // RR-7's band: 0.3–0.6 MB per 2048×1024 PNG-8 page, checked over the stand-in pages together.
    const standinPages = pages.filter((page) => page.id.indexOf('standin-zone-') === 0);
    let bytes = 0;
    let area = 0;
    for (const page of standinPages) {
      bytes += page.png.length;
      area += page.width * page.height;
    }
    const [low, high] = DECODE_BYTE_BANDS.standin;
    expect(DECODE_BYTE_BANDS.standin).toEqual([300_000 / (2048 * 1024), 600_000 / (2048 * 1024)]);
    const perPixel = bytes / area;
    expect(perPixel, `stand-in pages: ${bytes} bytes over ${area} px`).toBeGreaterThanOrEqual(low);
    expect(perPixel, `stand-in pages: ${bytes} bytes over ${area} px`).toBeLessThanOrEqual(high);
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

  it('is deterministic: the same pages and manifest every call', () => {
    const a = buildDecodeStandin();
    const b = buildDecodeStandin();
    expect(b.pages.map((page) => page.id)).toEqual(a.pages.map((page) => page.id));
    for (let i = 0; i < a.pages.length; i++) {
      expect(b.pages[i].png.equals(a.pages[i].png)).toBe(true);
    }
    expect(JSON.stringify(b.manifest)).toBe(JSON.stringify(a.manifest));
  }, 180_000);

  it('prunes the stand-in manifest to the group pages and their stand-in sprites', () => {
    const { pages, manifest } = buildDecodeStandin();
    const standinPages = pages.filter((page) => page.id.indexOf('standin-zone-') === 0);
    expect(manifest.pages).toHaveLength(standinPages.length);
    expect(manifest.pages.map((page) => page.file)).toEqual(standinPages.map((page) => page.file));
    expect(manifest.formatVersion).toBe(2);
    const names = Object.keys(manifest.sprites);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name.indexOf('standin/zone-a/')).toBe(0);
    // Every frame sits on a page of this manifest, renumbered from 0.
    for (const frame of Object.values(manifest.frames)) {
      expect(frame.p).toBeLessThan(manifest.pages.length);
    }
    // No fonts (the load draws no text) and only animations of surviving sprites.
    expect(Object.keys(manifest.fonts)).toEqual([]);
    for (const name of Object.keys(manifest.animations))
      expect(name in manifest.sprites).toBe(true);
  }, 120_000);
});
