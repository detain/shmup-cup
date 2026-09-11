/**
 * Browser tests of the shared shell beyond the smoke boot (plan §1.4, M1-04), on the production
 * web build served by `vite preview` in headless Chromium with SwiftShader WebGL:
 *
 * - a failing atlas page request ends on the **boot error screen** (overlay canvas, state
 *   `error`, the failure logged) instead of a black screen;
 * - a window that is not a multiple of 384×216 gets the largest integer scale, centred on the
 *   letterbox colour; resizing the window re-fits the frame (×2 → ×5);
 * - the frame loop runs: captures a few frames apart differ.
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** Letterbox colour around the scaled frame (render-pixi `PALETTE.letterbox`). */
const LETTERBOX = [0x05, 0x07, 0x0f] as const;

/** HUD bar fill of the free-flight scene (0x1d2a5c) — frame rows 0–7 and 208–215. */
const HUD_BAR = [0x1d, 0x2a, 0x5c] as const;

/** Boot screen background (`BOOT_SCREEN_COLORS.background`). */
const BOOT_BACKGROUND = [0x10, 0x17, 0x3a] as const;

/** Boot error title colour (`BOOT_SCREEN_COLORS.title`). */
const BOOT_TITLE = [0xff, 0x5a, 0xa0] as const;

/** A decoded screenshot. */
interface Shot {
  /** Width in pixels. */
  readonly width: number;
  /** Height in pixels. */
  readonly height: number;
  /** RGBA bytes. */
  readonly data: Uint8Array;
}

/**
 * Screenshots an element and decodes it.
 *
 * @param page - The page.
 * @param selector - Element selector.
 * @returns The pixels.
 */
async function shoot(page: Page, selector: string): Promise<Shot> {
  const png = await page.locator(selector).screenshot();
  return decodePng(new Uint8Array(png));
}

/**
 * Colour of one screenshot pixel.
 *
 * @param shot - The screenshot.
 * @param x - Column.
 * @param y - Row.
 * @returns `[r, g, b]`.
 */
function rgb(shot: Shot, x: number, y: number): number[] {
  const i = (y * shot.width + x) * 4;
  return [shot.data[i], shot.data[i + 1], shot.data[i + 2]];
}

/**
 * Whether any pixel is within `tolerance` of a colour.
 *
 * @param shot - The screenshot.
 * @param color - Colour.
 * @param tolerance - Allowed difference per channel.
 */
function contains(shot: Shot, color: readonly number[], tolerance = 2): boolean {
  for (let i = 0; i < shot.width * shot.height; i++) {
    if (
      Math.abs(shot.data[i * 4] - color[0]) <= tolerance &&
      Math.abs(shot.data[i * 4 + 1] - color[1]) <= tolerance &&
      Math.abs(shot.data[i * 4 + 2] - color[2]) <= tolerance
    ) {
      return true;
    }
  }
  return false;
}

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
 * Opens the web build and waits until the shell runs and a few frames were drawn.
 *
 * @param page - The page.
 */
async function openRunning(page: Page): Promise<void> {
  await page.goto('./');
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
  await waitFrames(page, 10);
}

test.describe('boot error screen (web build)', () => {
  test('an atlas page that fails to load shows the error screen, not a black canvas', async ({
    page,
  }) => {
    const logged: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') logged.push(message.text());
    });
    await page.route('**/assets/atlas/*.png', (route) => route.abort());
    await page.goto('./');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'error');
    const overlay = page.locator('canvas[data-shmup-overlay="boot"]');
    await expect(overlay).toHaveCount(1);
    const shot = await shoot(page, 'canvas[data-shmup-overlay="boot"]');
    expect([shot.width, shot.height]).toEqual([1152, 648]);
    expect(rgb(shot, 2, 2)).toEqual([...BOOT_BACKGROUND]);
    expect(contains(shot, BOOT_TITLE, 8)).toBe(true);
    expect(logged.some((text) => text.includes('Shmup Cup failed to start'))).toBe(true);
  });
});

test.describe('integer scaling (web build)', () => {
  test.use({ viewport: { width: 1000, height: 600 } });

  test('an off-multiple window gets the largest integer scale, centred on the letterbox', async ({
    page,
  }) => {
    await openRunning(page);
    const shot = await shoot(page, '#game');
    expect([shot.width, shot.height]).toEqual([1000, 600]);
    // ×2 → 768×432 at (116, 84).
    for (const [x, y] of [
      [2, 2],
      [115, 300],
      [500, 83],
      [884, 300],
      [500, 516],
      [997, 597],
    ]) {
      expect(rgb(shot, x, y), `letterbox at ${x},${y}`).toEqual([...LETTERBOX]);
    }
    expect(rgb(shot, 117, 85)).toEqual([...HUD_BAR]); // frame (0, 0)
    expect(rgb(shot, 116 + 767, 84 + 431)).toEqual([...HUD_BAR]); // frame (383, 215)
  });

  test('resizing the window re-fits the frame (×2 → ×5, no letterbox at 1920×1080)', async ({
    page,
  }) => {
    await openRunning(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await waitFrames(page, 5);
    const shot = await shoot(page, '#game');
    expect([shot.width, shot.height]).toEqual([1920, 1080]);
    for (const [x, y] of [
      [0, 0],
      [1919, 0],
      [0, 1079],
      [1919, 1079],
    ]) {
      expect(rgb(shot, x, y), `HUD bar at ${x},${y}`).toEqual([...HUD_BAR]);
    }
  });
});

test.describe('frame loop (web build)', () => {
  test('free flight animates: captures a few frames apart differ', async ({ page }) => {
    await openRunning(page);
    const first = await shoot(page, '#game');
    await waitFrames(page, 20);
    const second = await shoot(page, '#game');
    let different = 0;
    for (let i = 0; i < first.data.length; i += 4) {
      if (
        first.data[i] !== second.data[i] ||
        first.data[i + 1] !== second.data[i + 1] ||
        first.data[i + 2] !== second.data[i + 2]
      ) {
        different++;
      }
    }
    expect(different).toBeGreaterThan(100);
  });
});
