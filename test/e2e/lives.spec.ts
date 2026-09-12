/**
 * Browser test of the life cycle (plan M1-12) in headless Chromium: on `?stage=test-range` an
 * unattended KESTREL is shot down again and again — the HUD's stock icons (`hud/life`, `lives − 1`
 * of them in the bottom bar) go 2 → 1 → 0, the ship disappears while it explodes and flies back
 * in, and once the last ship is out `GAME OVER` (red) replaces the stage title in the top bar —
 * all without console errors or atlas warnings. Screenshots are ×3 (viewport 1152×648): frame
 * pixel (x, y) is screenshot pixel (3x + 1, 3y + 1).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** KESTREL hull colour (`ships/kestrel` and `hud/life` palette `h`, #c8d0e0). */
const HULL = [0xc8, 0xd0, 0xe0] as const;
/** `GAME OVER`'s colour in the flight HUD (0xf85858) — nothing else in the top bar uses it. */
const GAME_OVER_RED = [0xf8, 0x58, 0x58] as const;

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
  /** Stock icons drawn in the bottom bar (bands of 10 px from x 4, rows 209 … 213). */
  readonly stock: number;
  /** `GAME OVER`-red pixels in the top bar (rows 0 … 7). */
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
    if (fx * 3 + 1 >= width || fy * 3 + 1 >= height) return false;
    const i = ((fy * 3 + 1) * width + fx * 3 + 1) * 4;
    return (
      Math.abs(data[i] - r) <= 3 && Math.abs(data[i + 1] - g) <= 3 && Math.abs(data[i + 2] - b) <= 3
    );
  };
  let stock = 0;
  for (let icon = 0; icon < 8; icon++) {
    let found = false;
    for (let fy = 209; fy <= 213 && !found; fy++) {
      for (let fx = 4 + icon * 10; fx < 12 + icon * 10 && !found; fx++) found = is(fx, fy, HULL);
    }
    if (found) stock++;
  }
  let gameOver = 0;
  let ship = 0;
  for (let fy = 0; fy < 208; fy++) {
    for (let fx = 0; fx < 384; fx++) {
      if (fy < 8 && is(fx, fy, GAME_OVER_RED)) gameOver++;
      else if (fy >= 8 && is(fx, fy, HULL)) ship++;
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
