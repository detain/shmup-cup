/**
 * Browser test of the stage runtime (plan M1-07) in headless Chromium: `?stage=test-range` boots
 * the dev stage — its generated terrain is visible (the placeholder tileset's surface and rock
 * colours inside the playfield, never in the HUD bars) and it scrolls: the terrain pixels move
 * left between two screenshots while the ship stays where it is on screen; an unknown stage id
 * warns and boots free flight without terrain. Screenshots are at the e2e capture scale
 * (`frame-pixels.ts`; ×2, viewport 1280×720): frame pixel (x, y) is screenshot pixel
 * (sx(x), sy(y)).
 *
 * The scroll check does not depend on how fast the machine is: `pnpm test:e2e` runs the test
 * builds, whose `window.__shmupDebug` (plan M1-19) lets the spec freeze the sim with frame advance
 * and run exact tick counts (`./frame-advance.ts`). The two captures are then exactly 30 ticks of
 * camera travel apart, however many ticks a loaded machine would have run per frame. The unknown
 * stage's free flight runs on its own clock: its pause counts the game's ticks (`ticks.ts`), never
 * rAF frames (C5 review 4).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { freezeSim, stepTo } from './frame-advance.js';
import { FRAME_H, FRAME_W, HUD_BOTTOM_Y, PLAYFIELD_Y, pixelIndex, sx, sy } from './frame-pixels.js';
import { PORT_REASON, PORT_UNMEASURED } from './gates.js';
import { BOOT_TIMEOUT_MS, waitTicks } from './ticks.js';

/** Colours of the `tiles/terrain-a` placeholder art (surface rim, subsurface, rock tones). */
const TERRAIN_COLOURS = [
  [0x8a, 0xd0, 0xa8],
  [0x4a, 0x9a, 0x7a],
  [0x2a, 0x5a, 0x58],
  [0x1e, 0x44, 0x48],
  [0x33, 0x6a, 0x64],
] as const;

/**
 * Samples the canvas at frame-pixel resolution and summarises the terrain-coloured pixels.
 *
 * @param page - The page.
 * @returns Terrain pixels in the playfield (rows `PLAYFIELD_Y` … `HUD_BOTTOM_Y − 1`) and in the HUD
 *   bars, and per frame column the number of terrain pixels (the floor's height profile).
 */
async function terrainPixels(
  page: Page,
): Promise<{ playfield: number; hud: number; profile: number[] }> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  let playfield = 0;
  let hud = 0;
  const profile = new Array<number>(FRAME_W).fill(0);
  for (let fy = 0; fy < FRAME_H && sy(fy) < height; fy++) {
    for (let fx = 0; fx < FRAME_W && sx(fx) < width; fx++) {
      const i = pixelIndex(width, fx, fy);
      const terrain = TERRAIN_COLOURS.some(
        ([r, g, b]) =>
          Math.abs(data[i] - r) <= 2 &&
          Math.abs(data[i + 1] - g) <= 2 &&
          Math.abs(data[i + 2] - b) <= 2,
      );
      if (!terrain) continue;
      if (fy < PLAYFIELD_Y || fy >= HUD_BOTTOM_Y) {
        hud++;
      } else {
        playfield++;
        profile[fx]++;
      }
    }
  }
  return { playfield, hud, profile };
}

/**
 * How far the terrain moved left between two height profiles: the shift `s` for which
 * `after[x - s]` best matches `before[x]` (mean absolute difference over the overlap).
 *
 * @param before - Profile of the earlier capture.
 * @param after - Profile of the later capture.
 * @returns The best shift (0 … 250) and its mean difference.
 */
function leftShift(before: number[], after: number[]): { shift: number; error: number } {
  let best = { shift: 0, error: Number.POSITIVE_INFINITY };
  for (let s = 0; s <= 250; s++) {
    let sum = 0;
    let n = 0;
    for (let x = s; x < FRAME_W; x++) {
      if (before[x] === 0 && after[x - s] === 0) continue;
      sum += Math.abs(before[x] - after[x - s]);
      n++;
    }
    if (n >= 60 && sum / n < best.error) best = { shift: s, error: sum / n };
  }
  return best;
}

test.describe('stage runtime (web build, ?stage=test-range)', () => {
  test('shows the generated terrain and scrolls it', async ({ page }) => {
    test.skip(PORT_UNMEASURED, PORT_REASON);
    const errors: string[] = [];
    page.on('console', (message) => {
      // Errors, plus the atlas's "unknown sprite" warning (a stage naming a missing sprite).
      if (message.type() === 'error' || message.text().startsWith('atlas:')) {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./?scene=flight&stage=test-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await freezeSim(page);
    // The camera ramps up to 1 px/tick over the first 60 ticks, then holds that speed.
    const start = await stepTo(page, 90);

    const first = await terrainPixels(page);
    expect(first.playfield).toBeGreaterThan(400); // the floor of the first segment
    expect(first.hud).toBe(0);
    // Exactly 30 ticks later the camera has travelled 30 px.
    expect(await stepTo(page, start + 30)).toBe(start + 30);
    const second = await terrainPixels(page);
    expect(second.playfield).toBeGreaterThan(400);
    expect(second.hud).toBe(0);
    // The floor's height profile reappears shifted 30 px to the left (± 1 for pixel snapping).
    const moved = leftShift(first.profile, second.profile);
    expect(moved.shift).toBeGreaterThanOrEqual(29);
    expect(moved.shift).toBeLessThanOrEqual(31);
    expect(moved.error).toBeLessThan(1);
    expect(errors).toEqual([]);
  });

  test('warns about an unknown ?stage= and flies in open space without terrain', async ({
    page,
  }) => {
    const warnings: string[] = [];
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./?scene=flight&stage=no-such-stage');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await waitTicks(page, 30);
    const pixels = await terrainPixels(page);
    expect(pixels.playfield + pixels.hud).toBe(0);
    expect(warnings.some((text) => text.includes('no stage "no-such-stage"'))).toBe(true);
    expect(errors).toEqual([]);
  });
});
