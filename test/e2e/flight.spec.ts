/**
 * Browser test of free flight (plan M1-06) on the production web build in headless Chromium:
 * after the fly-in, holding an arrow key moves the KESTREL — found by its hull colour in
 * canvas screenshots (a pixel diff between captures) — while it stays put without input.
 * Screenshots are ×3 (viewport 1152×648): frame pixel (x, y) is screenshot pixel (3x + 1, 3y + 1).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** KESTREL hull colour (`ships/kestrel` palette `h`, #c8d0e0) — nothing else uses it. */
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

/**
 * Screenshots the canvas and returns the centre (in 384×216 frame pixels) of the pixels in the
 * playfield rows that have the KESTREL's hull colour.
 *
 * @param page - The page.
 * @returns The centroid and the matching pixel count.
 */
async function shipCentre(page: Page): Promise<{ x: number; y: number; pixels: number }> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  let sumX = 0;
  let sumY = 0;
  let pixels = 0;
  // Playfield = frame rows 8 … 207 (the HUD bars are outside it).
  for (let y = 8 * 3; y < Math.min(height, 208 * 3); y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (
        Math.abs(data[i] - KESTREL_HULL[0]) <= 2 &&
        Math.abs(data[i + 1] - KESTREL_HULL[1]) <= 2 &&
        Math.abs(data[i + 2] - KESTREL_HULL[2]) <= 2
      ) {
        sumX += x;
        sumY += y;
        pixels++;
      }
    }
  }
  return { x: sumX / pixels / 3, y: sumY / pixels / 3, pixels };
}

/**
 * Holds a key for a number of animation frames, then releases it and lets the picture settle.
 *
 * @param page - The page.
 * @param key - Playwright key name.
 * @param frames - Frames to hold it.
 */
async function hold(page: Page, key: string, frames: number): Promise<void> {
  await page.keyboard.down(key);
  await waitFrames(page, frames);
  await page.keyboard.up(key);
  await waitFrames(page, 5);
}

test.describe('free flight (web build)', () => {
  test('arrow keys move the KESTREL; without input it stays put', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await waitFrames(page, 60); // the 40-tick fly-in is over

    const start = await shipCentre(page);
    expect(start.pixels).toBeGreaterThan(20);
    await waitFrames(page, 20);
    const idle = await shipCentre(page);
    expect(Math.abs(idle.x - start.x)).toBeLessThan(0.5);
    expect(Math.abs(idle.y - start.y)).toBeLessThan(0.5);

    // 1.5 px/tick at speed level 0: 30 frames ≈ 45 px.
    await hold(page, 'ArrowRight', 30);
    const right = await shipCentre(page);
    expect(right.x - idle.x).toBeGreaterThan(20);
    expect(Math.abs(right.y - idle.y)).toBeLessThan(2);

    await hold(page, 'ArrowUp', 20);
    const up = await shipCentre(page);
    expect(up.y - right.y).toBeLessThan(-12);
    expect(Math.abs(up.x - right.x)).toBeLessThan(2);

    expect(errors).toEqual([]);
  });
});
