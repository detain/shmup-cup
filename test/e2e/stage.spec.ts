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
import {
  FRAME_H,
  FRAME_W,
  HUD_BOTTOM_Y,
  PLAYFIELD_Y,
  TILE_SIZE,
  pixelIndex,
  sx,
  sy,
} from './frame-pixels.js';
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
    // The camera ramps up to the ported stage's 1.5 px/tick over the first 60 ticks, then holds.
    const start = await stepTo(page, 90);

    const first = await terrainPixels(page);
    expect(first.playfield).toBeGreaterThan(400); // the floor of the first segment
    expect(first.hud).toBe(0);
    // Exactly 30 ticks later the camera has travelled 45 px at 1.5 px/tick.
    expect(await stepTo(page, start + 30)).toBe(start + 30);
    const second = await terrainPixels(page);
    expect(second.playfield).toBeGreaterThan(400);
    expect(second.hud).toBe(0);
    // The floor's height profile reappears shifted 45 px to the left (± 1 for pixel snapping).
    const moved = leftShift(first.profile, second.profile);
    expect(moved.shift).toBeGreaterThanOrEqual(44);
    expect(moved.shift).toBeLessThanOrEqual(46);
    expect(moved.error).toBeLessThan(1);
    expect(errors).toEqual([]);
  });

  test('draws the ported terrain on 12-px tiles: its tile edges are exactly TILE_SIZE apart', async ({
    page,
  }) => {
    // R1-04's deferred browser check: with the content ported (R2-02) the shipped tileset is at
    // the frame's `TILE_SIZE`, so the drawn terrain repeats every tile edge — 12 frame pixels =
    // `SCALE × TILE_SIZE` = 24 screenshot pixels at the ×2 e2e capture.
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
    // The first floor segment (world x 144 … 2100, `content/stages/test-range.stage.json`): its
    // entrance ramp settles on a flat plateau a whole number of tile rows above the bottom.
    await stepTo(page, 90);
    const png = await page.locator('#game').screenshot();
    const { width, height, data } = decodePng(new Uint8Array(png));
    const isColour = (fx: number, fy: number, [r, g, b]: readonly number[]): boolean => {
      const i = pixelIndex(width, fx, fy);
      return (
        Math.abs(data[i] - r) <= 2 &&
        Math.abs(data[i + 1] - g) <= 2 &&
        Math.abs(data[i + 2] - b) <= 2
      );
    };
    // The floor's lip row per frame column (measured in frame pixels).
    const lip: number[] = [];
    for (let fx = 0; fx < FRAME_W && sx(fx) < width; fx++) {
      let t = -1;
      for (let fy = PLAYFIELD_Y; fy < HUD_BOTTOM_Y && sy(fy) < height; fy++) {
        if (TERRAIN_COLOURS.some((c) => isColour(fx, fy, c))) {
          t = fy;
          break;
        }
      }
      lip.push(t);
    }
    // The plateau: the longest run of columns with the same lip row — at least two tiles wide.
    let best = 0;
    let bestEnd = 0;
    let run = 0;
    for (let fx = 1; fx < lip.length; fx++) {
      run = lip[fx] >= 0 && lip[fx] === lip[fx - 1] ? run + 1 : 0;
      if (run > best) {
        best = run;
        bestEnd = fx;
      }
    }
    expect(best).toBeGreaterThanOrEqual(2 * TILE_SIZE);
    const lipRow = lip[bestEnd];
    // The plateau's top sits exactly on the tile grid (observed: three tile rows above the
    // playfield's bottom at this tick).
    expect((HUD_BOTTOM_Y - lipRow) % TILE_SIZE).toBe(0);
    expect(HUD_BOTTOM_Y - lipRow).toBeGreaterThanOrEqual(2 * TILE_SIZE);
    // The tile frame is one edge tall: down every plateau column the body's rock colours repeat
    // exactly every TILE_SIZE rows — the same drawn tile frame stacked, so row `r` and row
    // `r + TILE_SIZE` agree pixel for pixel below the lip and its subsurface row. That is the
    // 12-px tile edge in frame pixels = SCALE × TILE_SIZE = 24 screenshot pixels at the ×2
    // capture; a v1 8-px tile would repeat 16 screenshot pixels.
    let matching = 0;
    let columns = 0;
    for (let fx = bestEnd - best + 2; fx <= bestEnd - 2; fx++) {
      let mismatched = false;
      for (let fy = lipRow + 2; fy + TILE_SIZE < HUD_BOTTOM_Y; fy++) {
        const a = pixelIndex(width, fx, fy);
        const b = pixelIndex(width, fx, fy + TILE_SIZE);
        if (data[a] !== data[b] || data[a + 1] !== data[b + 1] || data[a + 2] !== data[b + 2]) {
          mismatched = true;
          break;
        }
      }
      columns++;
      if (!mismatched) matching++;
    }
    expect(matching).toBeGreaterThanOrEqual(Math.ceil(columns / 2));
    // The repeat is the tile, not a uniform block: some plateau pixels differ half a tile apart.
    let halfPairs = 0;
    let halfDiffs = 0;
    for (let fx = bestEnd - best + 2; fx <= bestEnd - 2; fx++) {
      for (let fy = lipRow + 2; fy + TILE_SIZE / 2 < HUD_BOTTOM_Y; fy++) {
        const a = pixelIndex(width, fx, fy);
        const b = pixelIndex(width, fx, fy + TILE_SIZE / 2);
        halfPairs++;
        if (data[a] !== data[b] || data[a + 1] !== data[b + 1] || data[a + 2] !== data[b + 2]) {
          halfDiffs++;
        }
      }
    }
    expect(halfPairs).toBeGreaterThan(0);
    expect(halfDiffs * 4).toBeGreaterThan(halfPairs); // uneven at half a tile: not a uniform block
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
