/**
 * `scripts/store-assets.mjs` (plan M2-18, key art by the owner's dated §1.5 waiver of 2026-10-27,
 * `pnpm store:assets`): the committed icons are exactly what the script renders from the art
 * round's chosen winners (regenerate them after a source changes), have the sizes the Tizen widget
 * / Seller Office and electron-builder expect, every key-art source carries a current provenance
 * record under `assets/source/store/`, and the store folder gets the sixteen key-art products,
 * four 1920 × 1080 placeholder screenshots (still atlas-drawn — the waiver covers store/icon
 * surfaces only) and a listing that names them all.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { decodePng } from '../../scripts/assets/png.mjs';
import {
  ICON_TARGETS,
  KEY_ART,
  SCREENSHOTS,
  STORE_TEXTS,
  buildStoreListing,
  renderIcon,
  renderScreenshot,
  staleIcons,
  staleRecords,
  writeStoreAssets,
} from '../../scripts/store-assets.mjs';

/** Temporary folders to remove. */
const temps: string[] = [];

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/**
 * The distinct colours of an image.
 *
 * @param data - RGBA bytes.
 * @returns How many different RGBA values occur.
 */
function colours(data: Uint8Array): number {
  const seen = new Set<number>();
  for (let i = 0; i < data.length; i += 4) {
    seen.add(((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0);
  }
  return seen.size;
}

describe('scripts/store-assets (M2-18, key art v20x-A2)', () => {
  it('keeps the committed icons equal to a fresh rendering (run pnpm store:assets after changes)', () => {
    expect(staleIcons()).toEqual([]);
  });

  it('keeps the committed provenance records current (same command)', () => {
    expect(staleRecords()).toEqual([]);
  });

  it('commits the TV, desktop and webOS icons at their sizes, opaque and not blank', () => {
    expect(ICON_TARGETS.map((t) => t.path)).toEqual([
      'apps/tizen/public/icon.png',
      'apps/electron/build/icon.png',
      // M3-03: `appinfo.json`'s icon (80²) and largeIcon (130²).
      'apps/webos/public/icon.png',
      'apps/webos/public/largeIcon.png',
    ]);
    for (const target of ICON_TARGETS) {
      const image = decodePng(readFileSync(new URL(`../../${target.path}`, import.meta.url)));
      expect([image.width, image.height], target.path).toEqual([target.width, target.height]);
      for (let i = 3; i < image.data.length; i += 4) expect(image.data[i]).toBe(255);
      expect(colours(image.data)).toBeGreaterThan(8);
      // The PNG-8 budget: the median-cut keeps every product inside the indexed cap.
      expect(colours(image.data)).toBeLessThanOrEqual(256);
    }
  });

  it('renders the same pixels every time', () => {
    const a = renderIcon(512, 423);
    const b = renderIcon(512, 423);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    const s = renderScreenshot(0);
    expect(Buffer.from(s.data).equals(Buffer.from(renderScreenshot(0).data))).toBe(true);
  });

  it('draws four different 1920 × 1080 screenshots of original zones', () => {
    expect(SCREENSHOTS).toHaveLength(4);
    const shots = SCREENSHOTS.map((_, k) => renderScreenshot(k));
    for (const shot of shots) {
      expect([shot.width, shot.height]).toEqual([1920, 1080]);
      expect(colours(shot.data)).toBeGreaterThan(8);
    }
    for (let k = 1; k < shots.length; k++) {
      expect(Buffer.from(shots[k].data).equals(Buffer.from(shots[0].data))).toBe(false);
    }
    expect(() => renderScreenshot(4)).toThrow(RangeError);
  });

  it('writes the icons, the records and the store folder: products, screenshots, a listing', () => {
    const root = mkdtempSync(join(tmpdir(), 'shmup-store-root-'));
    const storeDir = mkdtempSync(join(tmpdir(), 'shmup-store-'));
    temps.push(root, storeDir);
    const written = writeStoreAssets({ root, storeDir });
    // Icons, one record and one product per key-art source, the screenshots, the listing.
    expect(written).toHaveLength(ICON_TARGETS.length + 2 * KEY_ART.length + SCREENSHOTS.length + 1);
    expect(staleIcons(root)).toEqual([]);
    expect(staleRecords(root)).toEqual([]);
    const files = readdirSync(storeDir).sort();
    const listing = JSON.parse(readFileSync(join(storeDir, 'listing.json'), 'utf8')) as {
      name: string;
      placeholder: boolean;
      images: { file: string; width: number; height: number }[];
    };
    expect(listing.name).toBe('Shmup Cup');
    expect(listing.placeholder).toBe(true);
    expect(JSON.stringify(listing)).not.toMatch(/gradius|darius|konami|taito/i);
    expect(files).toEqual([...listing.images.map((i) => i.file), 'listing.json'].sort());
    for (const entry of listing.images) {
      const image = decodePng(readFileSync(join(storeDir, entry.file)));
      expect([image.width, image.height], entry.file).toEqual([entry.width, entry.height]);
    }
    expect(buildStoreListing().images.map((i) => i.file)).toEqual(
      listing.images.map((i) => i.file),
    );
    // The icon's store copy is the Tizen icon's pixels.
    const tv = ICON_TARGETS[0];
    const copy = decodePng(readFileSync(join(storeDir, `icon-${tv.width}x${tv.height}.png`)));
    const committed = decodePng(readFileSync(join(root, tv.path)));
    expect(Buffer.from(copy.data).equals(Buffer.from(committed.data))).toBe(true);
  }, 120_000);

  it('reports a missing or different committed icon as stale', () => {
    const root = mkdtempSync(join(tmpdir(), 'shmup-store-empty-'));
    temps.push(root);
    expect(staleIcons(root)).toEqual(ICON_TARGETS.map((t) => t.path));
  });

  it('reports every missing provenance record as stale', () => {
    const root = mkdtempSync(join(tmpdir(), 'shmup-store-no-records-'));
    temps.push(root);
    expect(staleRecords(root)).toEqual(KEY_ART.map((entry) => entry.slug));
  });

  it('keeps the listing texts as the release-candidate placeholders', () => {
    expect(STORE_TEXTS.name).toBe('Shmup Cup');
    expect(STORE_TEXTS.placeholder).toBe(true);
  });
});
