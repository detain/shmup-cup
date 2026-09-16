/**
 * `scripts/store-assets.mjs` (plan M2-18, `pnpm store:assets`): the committed icons are exactly
 * what the script renders from the placeholder art (regenerate them after an art change), have the
 * sizes the Tizen widget / Seller Office and electron-builder expect, and the store folder gets the
 * icon, four 1920 × 1080 placeholder screenshots and a listing that names them.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { decodePng } from '../../scripts/assets/png.mjs';
import {
  ICON_TARGETS,
  SCREENSHOTS,
  STORE_LISTING,
  renderIcon,
  renderScreenshot,
  staleIcons,
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

describe('scripts/store-assets (M2-18)', () => {
  it('keeps the committed icons equal to a fresh rendering (run pnpm store:assets after art changes)', () => {
    expect(staleIcons()).toEqual([]);
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

  it('writes the icons and the store folder: icon, screenshots, a listing naming them', () => {
    const root = mkdtempSync(join(tmpdir(), 'shmup-store-root-'));
    const storeDir = mkdtempSync(join(tmpdir(), 'shmup-store-'));
    temps.push(root, storeDir);
    const written = writeStoreAssets({ root, storeDir });
    expect(written).toHaveLength(ICON_TARGETS.length + 1 + SCREENSHOTS.length + 1);
    expect(staleIcons(root)).toEqual([]);
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
    expect(STORE_LISTING.images.map((i) => i.file)).toEqual(listing.images.map((i) => i.file));
  });

  it('reports a missing or different committed icon as stale', () => {
    const root = mkdtempSync(join(tmpdir(), 'shmup-store-empty-'));
    temps.push(root);
    expect(staleIcons(root)).toEqual(ICON_TARGETS.map((t) => t.path));
  });
});
