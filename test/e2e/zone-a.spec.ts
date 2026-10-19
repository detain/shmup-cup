/**
 * Browser smoke test of zone A (plan M1-18) in headless Chromium: the web build's scene flow
 * plays AZURE VERGE by default, and the debug stage skip `?skip=boss` starts the game a little
 * before its boss — Enter past `PRESS OK`, Enter on START, Enter on NORMAL (the difficulty menu),
 * then within seconds the WARNING band
 * (its red edge rows across the whole width) and, once it is gone, HALCYON BULWARK holding the
 * right half of the playfield (its hull colour there) — all without console errors or atlas
 * warnings. Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport
 * 1280×720): frame pixel (x, y) is screenshot pixel (sx(x), sy(y)).
 *
 * Key taps, pauses and the polls' intervals count the game's ticks (`ticks.ts`), never rAF frames
 * (C5 review 4): a runner drawing about 3 frames a second runs up to 4 ticks a frame, and with no
 * god mode a poll that overshot in frames could let the game run on to its game over.
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import {
  FRAME_CX,
  FRAME_CY,
  FRAME_W,
  PLAYFIELD_Y,
  pixelIndex,
  sx,
  sy,
  uiPx,
} from './frame-pixels.js';
import { PORT_REASON, PORT_UNMEASURED } from './gates.js';
import { BOOT_TIMEOUT_MS, tap, waitTicks } from './ticks.js';

/** The WARNING band's edge colour (core `ui` `UI_COLORS.alert`, 0xf85858). */
const WARNING_RED = [0xf8, 0x58, 0x58] as const;
/** `bosses/bulwark-hull` / wing palette `m` (#2e5082) — only HALCYON BULWARK uses it. */
const BULWARK_HULL = [0x2e, 0x50, 0x82] as const;
/**
 * Screen row of the band's top edge (the game scene's `WARNING_BAND_Y`: the 48-row band centred
 * 8 px above the frame's centre row, both at the art's scale — `FRAME_CY − uiPx(8) − uiPx(48) / 2`,
 * 76 at 384×216, 132 at 640×360).
 */
const BAND_Y = FRAME_CY - uiPx(8) - (uiPx(48) >> 1);

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
    if (sx(fx) >= width || sy(fy) >= height) return false;
    const i = pixelIndex(width, fx, fy);
    return (
      Math.abs(data[i] - r) <= 3 && Math.abs(data[i + 1] - g) <= 3 && Math.abs(data[i + 2] - b) <= 3
    );
  };
  let band = 0;
  for (let fx = 0; fx < FRAME_W; fx++) if (is(fx, BAND_Y, WARNING_RED)) band++;
  let hull = 0;
  for (let fy = PLAYFIELD_Y; fy < 160; fy++) {
    for (let fx = FRAME_CX; fx < FRAME_W; fx++) if (is(fx, fy, BULWARK_HULL)) hull++;
  }
  return { band, hull };
}

test.describe('zone A (web build)', () => {
  test('?skip=boss: START reaches the WARNING and HALCYON BULWARK within seconds', async ({
    page,
  }) => {
    test.skip(PORT_UNMEASURED, PORT_REASON);
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
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitTicks(page, 10);
    await tap(page, 'Enter'); // PRESS OK → the menu
    await tap(page, 'Enter'); // START
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
    await tap(page, 'Enter'); // NORMAL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
    await tap(page, 'Enter'); // KESTREL in the ship select (M2-05)
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await tap(page, 'Enter'); // START in the weapon select (M2-03)
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    const start = await capture(page);
    expect(start.band).toBe(0);
    expect(start.hull).toBe(0);

    // The WARNING: about two seconds of scrolling after the skip.
    let shown = false;
    for (let poll = 0; poll < 120 && !shown; poll++) {
      await waitTicks(page, 10);
      shown = (await capture(page)).band > 300;
    }
    expect(shown, 'no WARNING band within 1,200 ticks of START').toBe(true);

    // Two band-free captures in a row (one may land on a red WARNING flash).
    let clear = 0;
    for (let poll = 0; poll < 100 && clear < 2; poll++) {
      await waitTicks(page, 10);
      clear = (await capture(page)).band === 0 ? clear + 1 : 0;
    }
    expect(clear, 'the WARNING band never went away').toBe(2);

    // The boss flies in (150 ticks) and holds the right half of the playfield.
    let hull = 0;
    for (let poll = 0; poll < 80 && hull <= 100; poll++) {
      await waitTicks(page, 5);
      hull = (await capture(page)).hull;
    }
    expect(hull).toBeGreaterThan(100);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    expect(errors).toEqual([]);
  });
});
