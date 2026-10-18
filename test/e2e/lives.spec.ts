/**
 * Browser test of the life cycle (plan M1-12) in headless Chromium: on `?stage=test-range` an
 * unattended KESTREL is shot down again and again — the HUD's stock icons (`hud/life`, `lives − 1`
 * of them in the bottom bar) go 2 → 1 → 0, the ship disappears while it explodes and flies back
 * in, and once the last ship is out `GAME OVER` (red) replaces the stage title in the top bar —
 * all without console errors or atlas warnings. Screenshots are at the e2e capture scale
 * (`frame-pixels.ts`; ×2, viewport 1280×720): frame pixel (x, y) is screenshot pixel
 * (sx(x), sy(y)).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { FRAME_W, HUD_BOTTOM_Y, PLAYFIELD_Y, pixelIndex, sx, sy, uiPx } from './frame-pixels.js';

/** KESTREL hull colour (`ships/kestrel` and `hud/life` palette `h`, #c8d0e0). */
const HULL = [0xc8, 0xd0, 0xe0] as const;
/** `GAME OVER`'s colour in the flight HUD (0xf85858) — nothing else in the top bar uses it. */
const GAME_OVER_RED = [0xf8, 0x58, 0x58] as const;
/**
 * Frame row of the stock icons' top: the flight scene's `LIVES_Y`, one pixel at the art's scale
 * into the bottom HUD bar (`HUD_BOTTOM_Y + uiPx(1)` — 209 at 384×216, 350 at 640×360).
 */
const LIVES_Y = HUD_BOTTOM_Y + uiPx(1);
/** Rows of each stock icon the scan reads, from {@link LIVES_Y} (the `hud/life` art's own). */
const LIFE_ROWS = uiPx(5);
/**
 * The stock icons' columns: the first at the flight scene's `LIVES_X`, then one every
 * `LIVES_STEP`, each `hud/life` icon 8 px wide in the v1 art (4, 10 and 8 at the art's scale).
 */
const LIFE = { x: uiPx(4), step: uiPx(10), w: uiPx(8) } as const;

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

/** What one capture of the HUD and playfield shows. */
interface LifeCapture {
  /**
   * Stock icons drawn in the bottom bar (one band per {@link LIFE} column, rows `LIVES_Y` …
   * `LIVES_Y + LIFE_ROWS − 1`).
   */
  readonly stock: number;
  /** `GAME OVER`-red pixels in the top bar (rows 0 … `PLAYFIELD_Y − 1` — 0 … 11 at 640×360). */
  readonly gameOver: number;
  /** KESTREL hull pixels in the playfield (0 while the ship is exploding or dead). */
  readonly ship: number;
}

/**
 * Screenshots the canvas and reads the stock, the game-over text and the ship.
 *
 * @param page - The page.
 * @returns The capture.
 */
async function captureLives(page: Page): Promise<LifeCapture> {
  const png = await page.locator('#game').screenshot();
  const { width, height, data } = decodePng(new Uint8Array(png));
  const is = (fx: number, fy: number, [r, g, b]: readonly [number, number, number]): boolean => {
    if (sx(fx) >= width || sy(fy) >= height) return false;
    const i = pixelIndex(width, fx, fy);
    return (
      Math.abs(data[i] - r) <= 3 && Math.abs(data[i + 1] - g) <= 3 && Math.abs(data[i + 2] - b) <= 3
    );
  };
  let stock = 0;
  for (let icon = 0; icon < 8; icon++) {
    let found = false;
    for (let fy = LIVES_Y; fy < LIVES_Y + LIFE_ROWS && !found; fy++) {
      const x0 = LIFE.x + icon * LIFE.step;
      for (let fx = x0; fx < x0 + LIFE.w && !found; fx++) found = is(fx, fy, HULL);
    }
    if (found) stock++;
  }
  let gameOver = 0;
  let ship = 0;
  for (let fy = 0; fy < HUD_BOTTOM_Y; fy++) {
    for (let fx = 0; fx < FRAME_W; fx++) {
      if (fy < PLAYFIELD_Y && is(fx, fy, GAME_OVER_RED)) gameOver++;
      else if (fy >= PLAYFIELD_Y && is(fx, fy, HULL)) ship++;
    }
  }
  return { stock, gameOver, ship };
}

test.describe('lives and game over (web build, ?stage=test-range)', () => {
  test('the stock drops with every death and GAME OVER replaces the title', async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.text().startsWith('atlas:')) {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./?scene=flight&stage=test-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await waitFrames(page, 60); // past the fly-in

    const first = await captureLives(page);
    expect(first.stock).toBe(2); // three ships: the one in play and two in stock
    expect(first.gameOver).toBe(0);
    expect(first.ship).toBeGreaterThan(0);

    const stocks: number[] = [first.stock];
    let shipless = 0;
    let over: LifeCapture | null = null;
    // An unattended session ends after about 1,700 ticks (≈ 28 s at 60 Hz); allow for slow CI.
    for (let poll = 0; poll < 600 && over === null; poll++) {
      await waitFrames(page, 15);
      const shot = await captureLives(page);
      if (shot.stock !== stocks[stocks.length - 1]) stocks.push(shot.stock);
      if (shot.ship === 0) shipless++;
      if (shot.gameOver > 0) over = shot;
    }
    expect(over, 'no GAME OVER within 9,000 frames').not.toBeNull();
    // The stock only ever went down, one ship at a time, to none.
    expect(stocks).toEqual([2, 1, 0]);
    expect(over?.stock).toBe(0);
    expect(over?.ship).toBe(0); // the last ship never came back
    expect(shipless).toBeGreaterThan(0); // the explosions and dead times were seen
    expect(errors).toEqual([]);
  });
});
