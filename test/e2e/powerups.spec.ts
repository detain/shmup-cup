/**
 * Browser test of the Force Field (plan M1-11) in headless Chromium: `?loadout=full` (the web-only
 * dev override) starts the KESTREL with a fresh Force Field, so the `shields/force-field` sprite —
 * an engine sprite, drawn over the ship from the `LayerId.Player` batch — must show its fresh
 * cyan ring around the ship, translucent through the shield batch (w15-SHIELDFIX: the ring's
 * colours reach the screen blended with what is behind it, never raw), with no console errors and
 * no "unknown sprite" warning from the
 * atlas. The default web boot and the Tizen build opened from disk (which ignores
 * `?loadout=full`) never show it. Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2,
 * viewport 1280×720): frame pixel (x, y) is screenshot pixel (sx(x), sy(y)).
 *
 * The polls' intervals count the game's ticks (`ticks.ts`), never rAF frames (C5 review 4): a
 * runner drawing about 3 frames a second runs up to 4 ticks a frame.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import {
  FRAME_H,
  FRAME_W,
  HUD_BOTTOM_Y,
  PLAYFIELD_Y,
  pixelIndex,
  sx,
  sy,
  uiPx,
} from './frame-pixels.js';
import { BOOT_TIMEOUT_MS, waitTicks } from './ticks.js';

/** An RGB colour. */
type Rgb = readonly [number, number, number];

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/**
 * The fresh Force Field's ring as it reaches the screen. The shield batch draws translucent
 * (alpha 0.65, w15-SHIELDFIX owner ruling 2026-10-27 — the ring must not hide the ship), so the
 * raw sprite colours never survive to a screenshot; these are the screen composites over the
 * playfield's base sky #10173a, `0.65 × art + 0.35 × sky`:
 * - `RING_RIM`: band #70e8ff → (78, 158, 185);
 * - `RING_GLOW_A`: glow strip → (43, 81, 113);
 * - `RING_GLOW_B`: bright shimmer strip → (171, 173, 185).
 * Re-pinned 2026-10-27. The ±3 windows are numerically unique: zero opaque pixels in every atlas
 * frame (ungrouped build, all sprites incl. the font), 0 px (count + HUD) in every sample of the
 * plain flight scene, and 168–195 / 190–206 / 146–172 px steady across the 8 full-loadout
 * samples.
 */
const RING_RIM: Rgb = [0x4e, 0x9e, 0xb9];
const RING_GLOW_A: Rgb = [0x2b, 0x51, 0x71];
const RING_GLOW_B: Rgb = [0xab, 0xad, 0xb9];
/** KESTREL deck colour (`ships/kestrel` w15-REING-11 gen11 art, #909bd8). */
const KESTREL_HULL: Rgb = [0x90, 0x9b, 0xd8];

/**
 * The fresh Force Field's ellipse at the art's scale: 30×24 in the v1 art, ×1.5 rounded up in the
 * interim art since R2-01 (45×36) — the most a box around its ring pixels can measure.
 */
const RING_BOX = { w: uiPx(30), h: uiPx(24) } as const;

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
  for (let fy = 0; fy < FRAME_H && sy(fy) < height; fy++) {
    for (let fx = 0; fx < FRAME_W && sx(fx) < width; fx++) {
      const i = pixelIndex(width, fx, fy);
      colours.forEach(([r, g, b], k) => {
        if (
          Math.abs(data[i] - r) > 3 ||
          Math.abs(data[i + 1] - g) > 3 ||
          Math.abs(data[i + 2] - b) > 3
        ) {
          return;
        }
        const found = out[k];
        if (fy < PLAYFIELD_Y || fy >= HUD_BOTTOM_Y) {
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
    await page.goto('./?scene=flight&loadout=full');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    let found: ColourPixels[] | null = null;
    for (let poll = 0; poll < 60 && found === null; poll++) {
      await waitTicks(page, 10);
      const pixels = await findColours(page, [RING_RIM, RING_GLOW_A, RING_GLOW_B, KESTREL_HULL]);
      // The ellipse's ring: dozens of pixels of every blend family (fewer where Options overlap
      // it; the 0.65 batch alpha composites each with what is behind, never a raw sprite colour).
      if (
        pixels[0].count >= 20 &&
        pixels[1].count >= 20 &&
        pixels[2].count >= 20 &&
        pixels[3].count > 0
      ) {
        found = pixels;
      }
    }
    expect(found, 'no Force Field ring within 600 ticks').not.toBeNull();
    if (found === null) return;
    const [rim, glowA, glowB, hull] = found;
    expect(rim.hud).toBe(0);
    expect(glowA.hud).toBe(0);
    expect(glowB.hud).toBe(0);
    // Around the ship: the ring's box (at most the ellipse's) contains the hull's.
    expect(rim.maxX - rim.minX).toBeLessThanOrEqual(RING_BOX.w);
    expect(rim.maxY - rim.minY).toBeLessThanOrEqual(RING_BOX.h);
    expect(rim.minX).toBeLessThanOrEqual(hull.minX);
    expect(rim.maxX).toBeGreaterThanOrEqual(hull.maxX);
    expect(rim.minY).toBeLessThanOrEqual(hull.minY);
    expect(rim.maxY).toBeGreaterThanOrEqual(hull.maxY);
    expect(errors).toEqual([]);
  });

  test('the default loadout has no Force Field', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await page.goto('./?scene=flight');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    // Past the 40-tick fly-in, a few samples: never a ring pixel of any blend family.
    let hullSeen = false;
    for (let poll = 0; poll < 8; poll++) {
      await waitTicks(page, 10);
      const [rim, glowA, glowB, hull] = await findColours(page, [
        RING_RIM,
        RING_GLOW_A,
        RING_GLOW_B,
        KESTREL_HULL,
      ]);
      expect(rim.count + rim.hud).toBe(0);
      expect(glowA.count + glowA.hud).toBe(0);
      expect(glowB.count + glowB.hud).toBe(0);
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
    await page.goto(TIZEN_INDEX + '?scene=flight&loadout=full');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    let hullSeen = false;
    for (let poll = 0; poll < 8; poll++) {
      await waitTicks(page, 10);
      const [rim, glowA, glowB, hull] = await findColours(page, [
        RING_RIM,
        RING_GLOW_A,
        RING_GLOW_B,
        KESTREL_HULL,
      ]);
      expect(rim.count + rim.hud).toBe(0);
      expect(glowA.count + glowA.hud).toBe(0);
      expect(glowB.count + glowB.hud).toBe(0);
      hullSeen ||= hull.count > 0;
    }
    expect(hullSeen).toBe(true);
    expect(errors).toEqual([]);
  });
});
