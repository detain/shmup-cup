/**
 * Browser test of the Force Field (plan M1-11) in headless Chromium: `?loadout=full` (the web-only
 * dev override) starts the KESTREL with a fresh Force Field, so the `shields/force-field` sprite —
 * an engine sprite, drawn over the ship from the `LayerId.Player` batch — must show its fresh
 * cyan ring around the ship, with no console errors and no "unknown sprite" warning from the
 * atlas. The default web boot and the Tizen build opened from disk (which ignores
 * `?loadout=full`) never show it. Screenshots are ×3 (viewport 1152×648): frame pixel (x, y) is
 * screenshot pixel (3x + 1, 3y + 1).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** The fresh Force Field's ring colour (`shields/force-field` frame 0, #70e8ff) — unique. */
const RING = [0x70, 0xe8, 0xff] as const;
/** KESTREL hull colour (`ships/kestrel` palette `h`, #c8d0e0). */
const KESTREL_HULL = [0xc8, 0xd0, 0xe0] as const;

/**
 * Waits for `frames` animation frames in the page.
 *
 * @param page - The page.
 * @param frames - Frames to wait.
 */
function waitFrames(page: Page, frames: number): Promise<void> {
  return page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const next = (): void => {
          seen++;
          if (seen >= count) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    frames,
  );
}

/** Frame pixels of one colour. */
interface ColourPixels {
  /** How many in the playfield. */
  readonly count: number;
  /** In the HUD bars (should stay 0). */
  readonly hud: number;
  /** Bounding box of the playfield pixels (Infinity / -Infinity when none). */
  readonly minX: number;
  /** See {@link ColourPixels.minX}. */
  readonly maxX: number;
  /** See {@link ColourPixels.minX}. */
  readonly minY: number;
  /** See {@link ColourPixels.minX}. */
  readonly maxY: number;
}

/**
 * Samples the canvas at frame-pixel resolution and finds the pixels of each colour.
 *
 * @param page - The page.
 * @param colours - The colours to look for.
 * @returns One result per colour.
 */
async function findColours(
  page: Page,
  colours: readonly (readonly [number, number, number])[],
): Promise<ColourPixels[]> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  const out = colours.map(() => ({
    count: 0,
    hud: 0,
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  }));
  for (let fy = 0; fy < 216 && fy * 3 + 1 < height; fy++) {
    for (let fx = 0; fx < 384 && fx * 3 + 1 < width; fx++) {
      const i = ((fy * 3 + 1) * width + fx * 3 + 1) * 4;
      colours.forEach(([r, g, b], k) => {
        if (
          Math.abs(data[i] - r) > 3 ||
          Math.abs(data[i + 1] - g) > 3 ||
          Math.abs(data[i + 2] - b) > 3
        ) {
          return;
        }
        const found = out[k];
        if (fy < 8 || fy >= 208) {
          found.hud++;
          return;
        }
        found.count++;
        found.minX = Math.min(found.minX, fx);
        found.maxX = Math.max(found.maxX, fx);
        found.minY = Math.min(found.minY, fy);
        found.maxY = Math.max(found.maxY, fy);
      });
    }
  }
  return out;
}

/**
 * Collects console errors and atlas warnings of a page.
 *
 * @param page - The page.
 * @returns The (live) list.
 */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().startsWith('atlas:')) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test.describe('Force Field (web build)', () => {
  test('?loadout=full draws the fresh Force Field ring around the ship', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await page.goto('./?loadout=full');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    let found: ColourPixels[] | null = null;
    for (let poll = 0; poll < 60 && found === null; poll++) {
      await waitFrames(page, 10);
      const pixels = await findColours(page, [RING, KESTREL_HULL]);
      // The 30×24 ellipse's ring: dozens of pixels (fewer where Options overlap it).
      if (pixels[0].count >= 20 && pixels[1].count > 0) found = pixels;
    }
    expect(found, 'no Force Field ring within 600 frames').not.toBeNull();
    if (found === null) return;
    const [ring, hull] = found;
    expect(ring.hud).toBe(0);
    // Around the ship: the ring's box (at most 30×24) contains the hull's.
    expect(ring.maxX - ring.minX).toBeLessThanOrEqual(30);
    expect(ring.maxY - ring.minY).toBeLessThanOrEqual(24);
    expect(ring.minX).toBeLessThanOrEqual(hull.minX);
    expect(ring.maxX).toBeGreaterThanOrEqual(hull.maxX);
    expect(ring.minY).toBeLessThanOrEqual(hull.minY);
    expect(ring.maxY).toBeGreaterThanOrEqual(hull.maxY);
    expect(errors).toEqual([]);
  });

  test('the default loadout has no Force Field', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await page.goto('./');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    // Past the 40-tick fly-in, a few samples: never a ring pixel.
    let hullSeen = false;
    for (let poll = 0; poll < 8; poll++) {
      await waitFrames(page, 10);
      const [ring, hull] = await findColours(page, [RING, KESTREL_HULL]);
      expect(ring.count + ring.hud).toBe(0);
      hullSeen ||= hull.count > 0;
    }
    expect(hullSeen).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe('Force Field (Tizen build via file://)', () => {
  test('ignores the web-only ?loadout=full: no Force Field', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await page.goto(TIZEN_INDEX + '?loadout=full');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    let hullSeen = false;
    for (let poll = 0; poll < 8; poll++) {
      await waitFrames(page, 10);
      const [ring, hull] = await findColours(page, [RING, KESTREL_HULL]);
      expect(ring.count + ring.hud).toBe(0);
      hullSeen ||= hull.count > 0;
    }
    expect(hullSeen).toBe(true);
    expect(errors).toEqual([]);
  });
});
