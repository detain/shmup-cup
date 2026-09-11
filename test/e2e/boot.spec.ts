/**
 * Browser smoke tests (plan §1.4, M1-04): the production web build (via `vite preview`) and
 * the Tizen `dist/` (opened from disk via `file://`, like the TV) boot in headless Chromium
 * with SwiftShader WebGL — the shell reaches `data-shmup-state="running"`, the atlas page
 * loads, the canvas shows a real picture (not a uniform colour) and nothing is logged as an
 * error. The pixel checks read the canvas at ×3 (viewport 1152×648): frame pixel (x, y) is
 * screenshot pixel (3x + 1, 3y + 1).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** Title tint of the showcase ("SHMUP CUP", white glyphs × 0xf8d030). */
const TITLE_YELLOW = [0xf8, 0xd0, 0x30] as const;

/** HUD bar fill of the showcase (0x1d2a5c). */
const HUD_BAR = [0x1d, 0x2a, 0x5c] as const;

/** Light tone of the calibration pattern's checker border (0xf4f4f4). */
const BORDER_LIGHT = [0xf4, 0xf4, 0xf4] as const;

/**
 * Collects console errors, uncaught exceptions and failed requests of a page.
 *
 * @param page - The page.
 * @returns The live list of problems.
 */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()}`));
  return errors;
}

/**
 * Waits until the shell is running and a few frames were drawn.
 *
 * @param page - The page.
 */
async function waitForRunning(page: Page): Promise<void> {
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 0;
        const next = (): void => {
          frames++;
          if (frames >= 10) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
  );
}

/** Pixels of a canvas screenshot plus helpers. */
interface Capture {
  /** Screenshot width. */
  readonly width: number;
  /** Screenshot height. */
  readonly height: number;
  /** Distinct colours (all pixels). */
  readonly colors: number;
  /** Standard deviation of the luma. */
  readonly lumaDeviation: number;
  /**
   * Colour of a frame pixel (384×216 coordinates).
   *
   * @param x - Frame x.
   * @param y - Frame y.
   */
  frameRgb(x: number, y: number): [number, number, number];
  /**
   * Whether any pixel is within `tolerance` of a colour.
   *
   * @param rgb - Colour.
   * @param tolerance - Allowed difference per channel.
   */
  contains(rgb: readonly [number, number, number], tolerance?: number): boolean;
}

/**
 * Screenshots the game canvas and analyses it.
 *
 * @param page - The page.
 * @returns The capture.
 */
async function capture(page: Page): Promise<Capture> {
  const png = await page.locator('#game').screenshot();
  const image = decodePng(new Uint8Array(png));
  const { width, height, data } = image;
  const colors = new Set<number>();
  let sum = 0;
  let sumSq = 0;
  const pixels = width * height;
  for (let i = 0; i < pixels; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    colors.add((r << 16) | (g << 8) | b);
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += luma;
    sumSq += luma * luma;
  }
  const mean = sum / pixels;
  return {
    width,
    height,
    colors: colors.size,
    lumaDeviation: Math.sqrt(Math.max(0, sumSq / pixels - mean * mean)),
    frameRgb(x, y) {
      const i = ((y * 3 + 1) * width + (x * 3 + 1)) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    },
    contains(rgb, tolerance = 2) {
      for (let i = 0; i < pixels; i++) {
        if (
          Math.abs(data[i * 4] - rgb[0]) <= tolerance &&
          Math.abs(data[i * 4 + 1] - rgb[1]) <= tolerance &&
          Math.abs(data[i * 4 + 2] - rgb[2]) <= tolerance
        ) {
          return true;
        }
      }
      return false;
    },
  };
}

/**
 * Loads a URL relative to the page with `new Image()` (the shell's own loading path).
 *
 * @param page - The page.
 * @param url - Relative URL.
 * @returns The image's natural width (0 when it failed).
 */
function imageWidth(page: Page, url: string): Promise<number> {
  return page.evaluate(
    (src) =>
      new Promise<number>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image.naturalWidth);
        image.onerror = () => resolve(0);
        image.src = src;
      }),
    url,
  );
}

/**
 * The checks every boot must pass: running, a non-uniform ×3 picture, the atlas reachable
 * at its relative URL, and no errors.
 *
 * @param page - The page after navigation.
 * @param errors - Its error log.
 * @returns The canvas capture for scene-specific checks.
 */
async function expectHealthyBoot(page: Page, errors: string[]): Promise<Capture> {
  await waitForRunning(page);
  const shot = await capture(page);
  expect([shot.width, shot.height]).toEqual([1152, 648]);
  expect(shot.colors).toBeGreaterThan(8);
  expect(shot.lumaDeviation).toBeGreaterThan(8);
  expect(await imageWidth(page, 'assets/atlas/main.png')).toBeGreaterThan(0);
  expect(await page.locator('canvas[data-shmup-overlay]').count()).toBe(0);
  expect(errors).toEqual([]);
  return shot;
}

test.describe('web build (vite preview)', () => {
  test('boots the sprite showcase: atlas loaded, bitmap title and HUD drawn, no errors', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    const atlas = page.waitForResponse((response) => response.url().endsWith('/main.png'));
    await page.goto('./');
    expect((await atlas).status()).toBe(200);
    const shot = await expectHealthyBoot(page, errors);
    expect(shot.contains(TITLE_YELLOW)).toBe(true);
    expect(shot.frameRgb(0, 0)).toEqual([...HUD_BAR]);
  });

  test('?scene=calibration shows the test pattern instead', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./?scene=calibration');
    const shot = await expectHealthyBoot(page, errors);
    expect(shot.frameRgb(0, 0)).toEqual([...BORDER_LIGHT]);
  });
});

test.describe('Tizen build (dist/ via file://)', () => {
  test('boots from disk as one classic script: atlas loaded, showcase drawn, no errors', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await page.goto(TIZEN_INDEX);
    const scripts = await page
      .locator('script')
      .evaluateAll((nodes) =>
        nodes.map((node) => [node.getAttribute('src'), node.getAttribute('type')]),
      );
    expect(scripts).toEqual([['./app.js', null]]);
    const shot = await expectHealthyBoot(page, errors);
    expect(shot.contains(TITLE_YELLOW)).toBe(true);
    expect(shot.frameRgb(0, 0)).toEqual([...HUD_BAR]);
  });
});
