/**
 * Browser tests of free flight (plan M1-06) in headless Chromium: after the fly-in, holding an
 * arrow key moves the KESTREL — found by its hull colour in canvas screenshots (a pixel diff
 * between captures) — while it stays put without input; holding a direction long enough stops
 * the ship at the playfield margin (the clamp), never over the HUD bars; the same works in the
 * Tizen build opened from disk (remote key codes through the `tizen-remote-safe` profile).
 * Screenshots are ×3 (viewport 1152×648): frame pixel (x, y) is screenshot pixel (3x + 1, 3y + 1).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

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
async function shipCentre(
  page: Page,
  rows: readonly [number, number] = [8, 208],
): Promise<{ x: number; y: number; pixels: number }> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  let sumX = 0;
  let sumY = 0;
  let pixels = 0;
  // Playfield = frame rows 8 … 207 (the HUD bars are outside it); `rows` can widen the scan.
  for (let y = rows[0] * 3; y < Math.min(height, rows[1] * 3); y++) {
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
    test.setTimeout(90_000);
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

  test('holding a direction stops the ship at the playfield margin, clear of the HUD', async ({
    page,
  }) => {
    // ~400 rAF frames and five canvas captures: ~55 s on a CI runner's SwiftShader, over the
    // 60 s default under load (the M1-10/M1-11 CI flakes).
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await waitFrames(page, 60);

    // Left: 64 px from the fly-in end to the 8 px margin at 1.5 px/tick ≈ 38 ticks; hold 100.
    await hold(page, 'ArrowLeft', 100);
    const left = await shipCentre(page);
    await hold(page, 'ArrowLeft', 30);
    const stillLeft = await shipCentre(page);
    expect(left.pixels).toBeGreaterThan(20);
    expect(Math.abs(stillLeft.x - left.x)).toBeLessThan(0.5); // pinned
    expect(left.x).toBeLessThan(16); // the hull sits around the ship centre (x = 8)

    // Up: from mid-playfield (100) to the 6 px top margin ≈ 63 ticks; hold 160 frames (enough
    // even if the headless compositor ran rAF faster than the 60 Hz tick).
    await hold(page, 'ArrowUp', 160);
    // Rows 0 … 199: the top HUD bar included, the bottom bar's stock icons (same hull colour)
    // left out.
    const top = await shipCentre(page, [0, 200]);
    await hold(page, 'ArrowUp', 30);
    const stillTop = await shipCentre(page, [0, 200]);
    expect(Math.abs(stillTop.y - top.y)).toBeLessThan(0.5); // pinned
    // Screen y of the ship centre = PLAYFIELD_Y 8 + margin 6 = 14; no hull pixel in the HUD bar.
    expect(top.y).toBeGreaterThan(8);
    expect(top.y).toBeLessThan(20);
    const inHud = await shipCentre(page, [0, 8]);
    expect(inHud.pixels).toBe(0);

    expect(errors).toEqual([]);
  });
});

test.describe('free flight (Tizen build via file://)', () => {
  test('remote arrow keys move the KESTREL', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(TIZEN_INDEX);
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await waitFrames(page, 60);
    const start = await shipCentre(page);
    expect(start.pixels).toBeGreaterThan(20);
    await hold(page, 'ArrowRight', 30);
    const right = await shipCentre(page);
    expect(right.x - start.x).toBeGreaterThan(20);
    await hold(page, 'ArrowDown', 20);
    const down = await shipCentre(page);
    expect(down.y - right.y).toBeGreaterThan(12);
    expect(errors).toEqual([]);
  });
});
