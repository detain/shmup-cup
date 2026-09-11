/**
 * Browser test of the enemies (plan M1-08) in headless Chromium: `?stage=test-range` runs the
 * dev stage's timeline, whose first event is a formation of `drifter` popcorn. The drifters'
 * placeholder colours (used by no other sprite) must show up inside the playfield — never in
 * the HUD bars — and the formation must fly left across the screen, with no console errors
 * while the timeline spawns. Screenshots are ×3 (viewport 1152×648): frame pixel (x, y) is
 * screenshot pixel (3x + 1, 3y + 1).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** Colours of the `enemies/drifter` placeholder sprite (rim, shell, core). */
const DRIFTER_COLOURS = [
  [0x58, 0xb0, 0x40],
  [0x2a, 0x6a, 0x30],
  [0xc8, 0xf0, 0x80],
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
 * Samples the canvas at frame-pixel resolution and finds the drifter-coloured pixels.
 *
 * @param page - The page.
 * @returns Drifter pixels in the playfield (rows 8 … 207) and in the HUD bars, and the leftmost
 *   frame column holding one (-1 = none).
 */
async function drifterPixels(
  page: Page,
): Promise<{ playfield: number; hud: number; left: number }> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  let playfield = 0;
  let hud = 0;
  let left = -1;
  for (let fy = 0; fy < 216 && fy * 3 + 1 < height; fy++) {
    for (let fx = 0; fx < 384 && fx * 3 + 1 < width; fx++) {
      const i = ((fy * 3 + 1) * width + fx * 3 + 1) * 4;
      const drifter = DRIFTER_COLOURS.some(
        ([r, g, b]) =>
          Math.abs(data[i] - r) <= 2 &&
          Math.abs(data[i + 1] - g) <= 2 &&
          Math.abs(data[i + 2] - b) <= 2,
      );
      if (!drifter) continue;
      if (fy < 8 || fy >= 208) {
        hud++;
      } else {
        playfield++;
        if (left < 0 || fx < left) left = fx;
      }
    }
  }
  return { playfield, hud, left };
}

test.describe('enemies (web build, ?stage=test-range)', () => {
  test('draws the timeline`s drifter formation in the playfield and flies it left', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      // Errors, plus the atlas's "unknown sprite" warning (an enemy naming a missing sprite).
      if (message.type() === 'error' || message.text().startsWith('atlas:')) {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./?stage=test-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');

    // The formation event fires at camera x 60 (≈ 1.5 s in, the camera ramps up first); poll
    // until the first drifters have flown in from the right edge.
    let first: { playfield: number; hud: number; left: number } | null = null;
    for (let poll = 0; poll < 40 && first === null; poll++) {
      await waitFrames(page, 15);
      const pixels = await drifterPixels(page);
      if (pixels.playfield >= 20) first = pixels;
    }
    expect(first, 'no drifter appeared within 600 frames').not.toBeNull();
    if (first === null) return;
    expect(first.hud).toBe(0);

    // 20 frames later (≥ 20 ticks at 1.25 px/tick) the leading drifter is further left.
    await waitFrames(page, 20);
    const second = await drifterPixels(page);
    expect(second.playfield).toBeGreaterThan(0);
    expect(second.hud).toBe(0);
    expect(second.left).toBeLessThan(first.left - 10);
    expect(errors).toEqual([]);
  });
});
