/**
 * Browser test of the boss WARNING and the boss (plan M1-13) in headless Chromium: on
 * `?stage=test-boss` the camera reaches the test boss's `warning` event after about five seconds —
 * the flight scene then draws the WARNING band (its red edge rows across the whole width) for
 * three seconds; once it is gone the TRIAL WARDEN flies in from the right and stays in the right
 * part of the playfield (its hull-block colour there) — all without console errors or atlas
 * warnings. Screenshots are ×3 (viewport 1152×648): frame pixel (x, y) is screenshot pixel
 * (3x + 1, 3y + 1).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** The WARNING band's edge colour (0xf85858, the flight scene's WARNING_BAND rows). */
const WARNING_RED = [0xf8, 0x58, 0x58] as const;
/** `bosses/hull-block` palette `m` (#3a4a68). */
const HULL = [0x3a, 0x4a, 0x68] as const;
/** Screen row of the band's top edge (the flight scene's `WARNING_BAND_Y`). */
const BAND_Y = 76;

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

/** What one capture shows. */
interface BossCapture {
  /** WARNING-red pixels on the band's top edge row. */
  readonly band: number;
  /** Hull-block pixels in the right half of the playfield. */
  readonly hull: number;
}

/**
 * Screenshots the canvas and reads the band edge and the boss hull.
 *
 * @param page - The page.
 * @returns The capture.
 */
async function capture(page: Page): Promise<BossCapture> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  const is = (fx: number, fy: number, [r, g, b]: readonly [number, number, number]): boolean => {
    if (fx * 3 + 1 >= width || fy * 3 + 1 >= height) return false;
    const i = ((fy * 3 + 1) * width + fx * 3 + 1) * 4;
    return (
      Math.abs(data[i] - r) <= 3 && Math.abs(data[i + 1] - g) <= 3 && Math.abs(data[i + 2] - b) <= 3
    );
  };
  let band = 0;
  for (let fx = 0; fx < 384; fx++) if (is(fx, BAND_Y, WARNING_RED)) band++;
  let hull = 0;
  for (let fy = 8; fy < 208; fy++) {
    for (let fx = 192; fx < 384; fx++) if (is(fx, fy, HULL)) hull++;
  }
  return { band, hull };
}

test.describe('boss (web build, ?stage=test-boss)', () => {
  test('the WARNING band shows for three seconds, then the boss flies in', async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.text().startsWith('atlas:')) {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./?stage=test-boss');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await waitFrames(page, 30);
    const before = await capture(page);
    expect(before.band).toBe(0);
    expect(before.hull).toBe(0);

    let shown = false;
    for (let poll = 0; poll < 300 && !shown; poll++) {
      await waitFrames(page, 10);
      shown = (await capture(page)).band > 300;
    }
    expect(shown, 'no WARNING band within 3,000 frames').toBe(true);

    let gone = false;
    for (let poll = 0; poll < 100 && !gone; poll++) {
      await waitFrames(page, 10);
      gone = (await capture(page)).band === 0;
    }
    expect(gone, 'the WARNING band never went away').toBe(true);

    // The intro takes 120 ticks; then the boss holds the right side of the playfield.
    await waitFrames(page, 150);
    const boss = await capture(page);
    expect(boss.hull).toBeGreaterThan(50);
    expect(errors).toEqual([]);
  });
});
