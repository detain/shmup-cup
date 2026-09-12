/**
 * Browser test of the stage runtime (plan M1-07) in headless Chromium: `?stage=test-range` boots
 * the dev stage — its generated terrain is visible (the placeholder tileset's surface and rock
 * colours inside the playfield, never in the HUD bars) and it scrolls: the terrain pixels move
 * left between two screenshots while the ship stays where it is on screen; an unknown stage id
 * warns and boots free flight without terrain. Screenshots are ×3
 * (viewport 1152×648): frame pixel (x, y) is screenshot pixel (3x + 1, 3y + 1).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** Colours of the `tiles/terrain-a` placeholder art (surface rim, subsurface, rock tones). */
const TERRAIN_COLOURS = [
  [0x8a, 0xd0, 0xa8],
  [0x4a, 0x9a, 0x7a],
  [0x2a, 0x5a, 0x58],
  [0x1e, 0x44, 0x48],
  [0x33, 0x6a, 0x64],
] as const;

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

/**
 * Samples the canvas at frame-pixel resolution and summarises the terrain-coloured pixels.
 *
 * @param page - The page.
 * @returns Terrain pixels in the playfield (rows 8 … 207) and in the HUD bars, and per frame
 *   column the number of terrain pixels (the floor's height profile).
 */
async function terrainPixels(
  page: Page,
): Promise<{ playfield: number; hud: number; profile: number[] }> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  let playfield = 0;
  let hud = 0;
  const profile = new Array<number>(384).fill(0);
  for (let fy = 0; fy < 216 && fy * 3 + 1 < height; fy++) {
    for (let fx = 0; fx < 384 && fx * 3 + 1 < width; fx++) {
      const i = ((fy * 3 + 1) * width + fx * 3 + 1) * 4;
      const terrain = TERRAIN_COLOURS.some(
        ([r, g, b]) =>
          Math.abs(data[i] - r) <= 2 &&
          Math.abs(data[i + 1] - g) <= 2 &&
          Math.abs(data[i + 2] - b) <= 2,
      );
      if (!terrain) continue;
      if (fy < 8 || fy >= 208) {
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
    for (let x = s; x < 384; x++) {
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
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await waitFrames(page, 90); // the camera ramps up to 1 px/tick over the first second

    const first = await terrainPixels(page);
    expect(first.playfield).toBeGreaterThan(400); // the floor of the first segment
    expect(first.hud).toBe(0);
    // 30 frames: a busy machine runs up to 4 ticks per frame (the loop catches up), and the
    // shift must stay inside the 250-px search window of `leftShift`.
    await waitFrames(page, 30);
    const second = await terrainPixels(page);
    expect(second.playfield).toBeGreaterThan(400);
    expect(second.hud).toBe(0);
    // The floor's height profile reappears shifted to the left (≈ 1 px per tick).
    const moved = leftShift(first.profile, second.profile);
    expect(moved.shift).toBeGreaterThan(10);
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
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await waitFrames(page, 30);
    const pixels = await terrainPixels(page);
    expect(pixels.playfield + pixels.hud).toBe(0);
    expect(warnings.some((text) => text.includes('no stage "no-such-stage"'))).toBe(true);
    expect(errors).toEqual([]);
  });
});
