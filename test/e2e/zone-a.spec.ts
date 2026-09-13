/**
 * Browser smoke test of zone A (plan M1-18) in headless Chromium: the web build's scene flow
 * plays AZURE VERGE by default, and the debug stage skip `?skip=boss` starts the game a little
 * before its boss — Enter past `PRESS OK`, Enter on START, Enter on NORMAL (the difficulty menu),
 * then within seconds the WARNING band
 * (its red edge rows across the whole width) and, once it is gone, HALCYON BULWARK holding the
 * right half of the playfield (its hull colour there) — all without console errors or atlas
 * warnings. Screenshots are ×3 (viewport 1152×648): frame pixel (x, y) is screenshot pixel
 * (3x + 1, 3y + 1).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** The WARNING band's edge colour (core `ui` `UI_COLORS.alert`, 0xf85858). */
const WARNING_RED = [0xf8, 0x58, 0x58] as const;
/** `bosses/bulwark-hull` / wing palette `m` (#2e5082) — only HALCYON BULWARK uses it. */
const BULWARK_HULL = [0x2e, 0x50, 0x82] as const;
/** Screen row of the band's top edge (the game scene's `WARNING_BAND_Y`). */
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

/**
 * Presses a key for a few frames, then releases it.
 *
 * @param page - The page.
 * @param key - Playwright key name.
 */
async function tap(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  await waitFrames(page, 3);
  await page.keyboard.up(key);
  await waitFrames(page, 6);
}

/** What one capture shows. */
interface Capture {
  /** WARNING-red pixels on the band's top edge row. */
  readonly band: number;
  /** HALCYON BULWARK hull pixels in the right half of the playfield. */
  readonly hull: number;
}

/**
 * Screenshots the canvas and reads the band edge and the boss hull.
 *
 * @param page - The page.
 * @returns The capture.
 */
async function capture(page: Page): Promise<Capture> {
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
  for (let fy = 8; fy < 160; fy++) {
    for (let fx = 192; fx < 384; fx++) if (is(fx, fy, BULWARK_HULL)) hull++;
  }
  return { band, hull };
}

test.describe('zone A (web build)', () => {
  test('?skip=boss: START reaches the WARNING and HALCYON BULWARK within seconds', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.text().startsWith('atlas:')) {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./?skip=boss');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitFrames(page, 10);
    await tap(page, 'Enter'); // PRESS OK → the menu
    await tap(page, 'Enter'); // START
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
    await tap(page, 'Enter'); // NORMAL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await tap(page, 'Enter'); // START in the weapon select (M2-03)
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    const start = await capture(page);
    expect(start.band).toBe(0);
    expect(start.hull).toBe(0);

    // The WARNING: about two seconds of scrolling after the skip.
    let shown = false;
    for (let poll = 0; poll < 120 && !shown; poll++) {
      await waitFrames(page, 10);
      shown = (await capture(page)).band > 300;
    }
    expect(shown, 'no WARNING band within 1,200 frames of START').toBe(true);

    // Two band-free captures in a row (one may land on a red WARNING flash).
    let clear = 0;
    for (let poll = 0; poll < 100 && clear < 2; poll++) {
      await waitFrames(page, 10);
      clear = (await capture(page)).band === 0 ? clear + 1 : 0;
    }
    expect(clear, 'the WARNING band never went away').toBe(2);

    // The boss flies in (150 ticks) and holds the right half of the playfield.
    let hull = 0;
    for (let poll = 0; poll < 80 && hull <= 100; poll++) {
      await waitFrames(page, 5);
      hull = (await capture(page)).hull;
    }
    expect(hull).toBeGreaterThan(100);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    expect(errors).toEqual([]);
  });
});
