/**
 * Browser test of the advanced stage systems (plan M2-07) in headless Chromium: the dev stage
 * `?stage=gimmick-range` boots without errors (its gimmick enemies, moving blocks and the chain
 * sprite all resolve in the atlas) and draws its destructible brick pillar with the new tile art —
 * the `brick` tile's face colour appears in the playfield once the camera has scrolled to it.
 * Screenshots are ×3 (viewport 1152×648): frame pixel (x, y) is screenshot pixel (3x + 1, 3y + 1);
 * the sim is frozen and stepped exact ticks (`./frame-advance.ts`).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { freezeSim, stepTo } from './frame-advance.js';

/** Face colour of the placeholder `brick` tile (`scripts/assets/procedural/terrain.mjs`). */
const BRICK = [0xb0, 0x70, 0x4a] as const;

/**
 * Counts the playfield pixels of one colour (± 2 per channel).
 *
 * @param page - The page.
 * @param rgb - The colour.
 * @returns Frame pixels of that colour in rows 8 … 207.
 */
async function countColour(page: Page, rgb: readonly [number, number, number]): Promise<number> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  let count = 0;
  for (let fy = 8; fy < 208 && fy * 3 + 1 < height; fy++) {
    for (let fx = 0; fx < 384 && fx * 3 + 1 < width; fx++) {
      const i = ((fy * 3 + 1) * width + fx * 3 + 1) * 4;
      if (
        Math.abs(data[i] - rgb[0]) <= 2 &&
        Math.abs(data[i + 1] - rgb[1]) <= 2 &&
        Math.abs(data[i + 2] - rgb[2]) <= 2
      ) {
        count++;
      }
    }
  }
  return count;
}

test.describe('stage gimmicks (web build, ?stage=gimmick-range)', () => {
  test('boots the gimmick range and draws its destructible brick pillar', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      // Errors, plus the atlas's "unknown sprite" warning (content naming a missing sprite).
      if (message.type() === 'error' || message.text().startsWith('atlas:')) {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./?scene=flight&stage=gimmick-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await freezeSim(page);
    // Near the start the pillar (world x 480…511) is still off screen.
    const start = await stepTo(page, 30);
    expect(await countColour(page, BRICK)).toBe(0);
    // ≈ 450 px of scroll later it stands in the left part of the view.
    await stepTo(page, start + 450);
    expect(await countColour(page, BRICK)).toBeGreaterThan(300);
    expect(errors).toEqual([]);
  });
});
