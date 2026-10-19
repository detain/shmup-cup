/**
 * Browser test of the boss WARNING and the boss (plan M1-13) in headless Chromium: on
 * `?stage=test-boss` the camera reaches the test boss's `warning` event after about five seconds —
 * the flight scene then draws the WARNING band (its red edge rows across the whole width) for
 * three seconds; once it is gone the TRIAL WARDEN flies in from the right and stays in the right
 * part of the playfield (its hull-block colour there) — all without console errors or atlas
 * warnings. Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport
 * 1280×720): frame pixel (x, y) is screenshot pixel (sx(x), sy(y)).
 *
 * Its pauses and polls count the game's ticks (`ticks.ts`), never rAF frames: a slow runner draws
 * fewer frames a second and catches up by up to 4 ticks a frame, so a count of frames is a
 * different number of ticks on every machine (C5 review 4).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import {
  FRAME_CX,
  FRAME_CY,
  FRAME_W,
  HUD_BOTTOM_Y,
  PLAYFIELD_Y,
  pixelIndex,
  sx,
  sy,
  uiPx,
} from './frame-pixels.js';
import { CONTENT_REASON, R2_03_PENDING, assertionsGated } from './gates.js';
import { BOOT_TIMEOUT_MS, waitTicks } from './ticks.js';

/** The WARNING band's edge colour (0xf85858, the flight scene's WARNING_BAND rows). */
const WARNING_RED = [0xf8, 0x58, 0x58] as const;
/** `bosses/hull-block` palette `m` (#3a4a68). */
const HULL = [0x3a, 0x4a, 0x68] as const;
/**
 * Screen row of the band's top edge (the flight scene's `WARNING_BAND_Y`, like the game scene's:
 * the 48-row band centred 8 px above the frame's centre row, both at the art's scale — 76 at
 * 384×216, 132 at 640×360).
 */
const BAND_Y = FRAME_CY - uiPx(8) - (uiPx(48) >> 1);

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
    if (sx(fx) >= width || sy(fy) >= height) return false;
    const i = pixelIndex(width, fx, fy);
    return (
      Math.abs(data[i] - r) <= 3 && Math.abs(data[i + 1] - g) <= 3 && Math.abs(data[i + 2] - b) <= 3
    );
  };
  let band = 0;
  for (let fx = 0; fx < FRAME_W; fx++) if (is(fx, BAND_Y, WARNING_RED)) band++;
  let hull = 0;
  for (let fy = PLAYFIELD_Y; fy < HUD_BOTTOM_Y; fy++) {
    for (let fx = FRAME_CX; fx < FRAME_W; fx++) if (is(fx, fy, HULL)) hull++;
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
    await page.goto('./?scene=flight&stage=test-boss');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await waitTicks(page, 30);
    const before = await capture(page);
    expect(before.band).toBe(0);
    expect(before.hull).toBe(0);

    let shown = false;
    for (let poll = 0; poll < 300 && !shown; poll++) {
      await waitTicks(page, 10);
      shown = (await capture(page)).band > 300;
    }
    expect(shown, 'no WARNING band within 3,000 ticks').toBe(true);

    // Two captures in a row without the band: a single one can land on one of the WARNING's
    // 8-tick red flashes, which tint the band's edge rows (a flake under parallel load). They are
    // 10 ticks apart, so two of them never land in one flash.
    let gone = false;
    let clear = 0;
    for (let poll = 0; poll < 100 && !gone; poll++) {
      await waitTicks(page, 10);
      clear = (await capture(page)).band === 0 ? clear + 1 : 0;
      gone = clear >= 2;
    }
    expect(gone, 'the WARNING band never went away').toBe(true);

    // The intro takes 120 ticks; then the boss holds the right side of the playfield. Poll for
    // it every 5 ticks rather than wait out the intro: the ship's autofire can destroy the test
    // boss before a late capture. The TRIAL WARDEN holds v1's screen x 300, left of the 640×360
    // frame's centre, until R2-02's port: the hull check waits for it (`gates.ts`,
    // CONTENT_REASON); the band above is the shell's own layout and runs either way.
    if (
      !assertionsGated(
        test.info(),
        R2_03_PENDING,
        'the boss hull in the right half',
        CONTENT_REASON,
      )
    ) {
      let hull = 0;
      for (let poll = 0; poll < 60 && hull <= 50; poll++) {
        await waitTicks(page, 5);
        hull = (await capture(page)).hull;
      }
      expect(hull).toBeGreaterThan(50);
    }
    expect(errors).toEqual([]);
  });
});
