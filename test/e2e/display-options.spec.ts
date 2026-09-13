/**
 * Browser test of the display options end to end (plan M2-08) in headless Chromium: the Options
 * screen's SCALE, SHAKE, FLASHES and HITBOX rows — driven by the keyboard on the web build and by
 * the remote's key codes on the Tizen build opened from disk — reach the renderer live
 * (`connectOptionEvents`), Back writes them to the save (`display` in `shmup-cup:save.v1`), and the
 * next boot applies the saved ones before the first frame (`applyDisplayOptions`): the `stretch`
 * frame fills a display the default `integer` mode letterboxes and the hitbox markers appear on the
 * ship. Nothing logs an error.
 *
 * Screenshots are of the canvas at 1000×600 (integer ×2 = a 768×432 frame letterboxed; stretch =
 * the whole canvas); the sim is frozen and stepped exact ticks (`./frame-advance.ts`).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { freezeSim, stepTo } from './frame-advance.js';

/** The save's `localStorage` key. */
const SAVE_KEY = 'shmup-cup:save.v1';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** The letterbox colour around the scaled frame (render-pixi `PALETTE.letterbox`). */
const LETTERBOX = [0x05, 0x07, 0x0f];

/** The rim colour of the hitbox markers (render-pixi `HITBOX_RIM_TINT`). */
const RIM = [0xff, 0x30, 0x50] as const;

/** The display options as the renderer holds them. */
interface RendererDisplay {
  readonly scaleMode: string;
  readonly showHitbox: boolean;
  readonly screenShake: boolean;
  readonly reduceFlashing: boolean;
}

/** `window` with the test build's debug API (the parts this spec reads). */
interface DebugWindow {
  readonly __shmupDebug: {
    readonly renderer: {
      readonly scaleMode: string;
      readonly showHitbox: boolean;
      readonly effects: {
        readonly settings: { readonly screenShake: boolean; readonly reduceFlashing: boolean };
      };
    };
  };
}

/**
 * Waits for `frames` animation frames in the page.
 *
 * @param page - The page.
 * @param frames - Frames to wait.
 */
function waitFrames(page: Page, frames: number): Promise<void> {
  return page.evaluate(
    (total) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const next = (): void => {
          seen++;
          if (seen >= total) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    frames,
  );
}

/**
 * Presses a key for a few frames, then lets the game see the release.
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

/**
 * Dispatches a remote key the desktop keyboard does not have (Back = 10009), down then up.
 *
 * @param page - The page.
 * @param keyCode - The legacy key code.
 */
async function remoteTap(page: Page, keyCode: number): Promise<void> {
  const send = (type: string): Promise<void> =>
    page.evaluate(
      ([eventType, code]) => {
        const event = new KeyboardEvent(eventType, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'keyCode', { get: () => code });
        window.dispatchEvent(event);
      },
      [type, keyCode] as const,
    );
  await send('keydown');
  await waitFrames(page, 3);
  await send('keyup');
  await waitFrames(page, 6);
}

/**
 * Collects console errors, atlas warnings and page errors.
 *
 * @param page - The page.
 * @returns The (live) error log.
 */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().startsWith('atlas:')) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * The renderer's display options (the test build's debug API).
 *
 * @param page - The page.
 * @returns The options.
 */
function rendererDisplay(page: Page): Promise<RendererDisplay> {
  return page.evaluate(() => {
    const renderer = (window as unknown as DebugWindow).__shmupDebug.renderer;
    return {
      scaleMode: renderer.scaleMode,
      showHitbox: renderer.showHitbox,
      screenShake: renderer.effects.settings.screenShake,
      reduceFlashing: renderer.effects.settings.reduceFlashing,
    };
  });
}

/**
 * The display options stored in the save, or `null` when nothing is stored.
 *
 * @param page - The page.
 * @returns The stored `options.display`.
 */
async function storedDisplay(page: Page): Promise<Record<string, unknown> | null> {
  const text = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
  if (text === null) return null;
  const save = JSON.parse(text) as { options?: { display?: Record<string, unknown> } };
  return save.options?.display ?? null;
}

/**
 * Opens the title, then the Options screen through the title menu, and moves down to SCALE.
 *
 * @param page - The page.
 */
async function openScaleRow(page: Page): Promise<void> {
  const canvas = page.locator('#game');
  await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
  await waitFrames(page, 10);
  await tap(page, 'Enter'); // PRESS OK → the menu
  await tap(page, 'ArrowDown'); // 2 PLAYERS
  await tap(page, 'ArrowDown'); // OPTIONS
  await tap(page, 'Enter');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'options');
  await waitFrames(page, 4); // the menu's open lock
  // MUSIC, SFX, CONTROLS, BULLETS, SCALE.
  for (let i = 0; i < 5; i++) await tap(page, 'ArrowDown');
}

/**
 * Takes a screenshot of the canvas and decodes it.
 *
 * @param page - The page.
 * @returns The decoded image.
 */
async function capture(page: Page): Promise<{ width: number; height: number; data: Uint8Array }> {
  const png = await page.locator('#game').screenshot();
  return decodePng(new Uint8Array(png));
}

/**
 * Counts the pixels of one colour (± 2 per channel) in a screenshot.
 *
 * @param image - The decoded screenshot.
 * @param rgb - The colour.
 * @returns Matching pixels.
 */
function countColour(
  image: { width: number; height: number; data: Uint8Array },
  rgb: readonly [number, number, number],
): number {
  let count = 0;
  for (let i = 0; i < image.width * image.height * 4; i += 4) {
    if (
      Math.abs(image.data[i] - rgb[0]) <= 2 &&
      Math.abs(image.data[i + 1] - rgb[1]) <= 2 &&
      Math.abs(image.data[i + 2] - rgb[2]) <= 2
    ) {
      count++;
    }
  }
  return count;
}

test.describe('display options through the Options screen (web build)', () => {
  test('SCALE, SHAKE, FLASHES and HITBOX apply live, are saved and applied at the next boot', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1000, height: 600 });
    const errors = collectErrors(page);
    await page.goto('./');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    expect(await rendererDisplay(page)).toEqual({
      scaleMode: 'integer',
      showHitbox: false,
      screenShake: true,
      reduceFlashing: false,
    });
    await openScaleRow(page);
    await tap(page, 'ArrowRight'); // INTEGER → FIT, live
    expect((await rendererDisplay(page)).scaleMode).toBe('fit');
    await tap(page, 'ArrowRight'); // → STRETCH
    await tap(page, 'ArrowDown'); // SHAKE
    await tap(page, 'ArrowLeft'); // OFF
    await tap(page, 'ArrowDown'); // FLASHES
    await tap(page, 'ArrowRight'); // REDUCED
    await tap(page, 'ArrowDown'); // HITBOX
    await tap(page, 'ArrowRight'); // ON
    expect(await rendererDisplay(page)).toEqual({
      scaleMode: 'stretch',
      showHitbox: true,
      screenShake: false,
      reduceFlashing: true,
    });
    expect(await storedDisplay(page)).toBeNull(); // written when the screen closes
    await tap(page, 'Escape'); // Back: save and close
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-scene', 'title');
    await expect
      .poll(() => storedDisplay(page))
      .toEqual({
        bulletPalette: 'standard',
        scaleMode: 'stretch',
        screenShake: false,
        reduceFlashing: true,
        showHitbox: true,
        bossHpBar: false,
      });

    // The next boot (free flight on the raster range) starts with them.
    await page.goto('./?scene=flight&stage=raster-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    expect(await rendererDisplay(page)).toEqual({
      scaleMode: 'stretch',
      showHitbox: true,
      screenShake: false,
      reduceFlashing: true,
    });
    await freezeSim(page);
    await stepTo(page, 120); // after the fly-in
    const image = await capture(page);
    // Stretched: no letterbox in the corner; the ship carries its hitbox marker.
    expect([image.data[0], image.data[1], image.data[2]]).not.toEqual(LETTERBOX);
    expect(countColour(image, RIM)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('without a save the frame is letterboxed and no hitbox marker shows', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 600 });
    await page.goto('./');
    await page.evaluate(() => window.localStorage.clear());
    await page.goto('./?scene=flight&stage=raster-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await freezeSim(page);
    await stepTo(page, 120);
    const image = await capture(page);
    expect([image.data[0], image.data[1], image.data[2]]).toEqual(LETTERBOX);
    expect(countColour(image, RIM)).toBe(0);
  });
});

test.describe('display options through the Options screen (Tizen build from file://)', () => {
  test('remote only: SCALE and HITBOX are saved on Back and kept after a relaunch', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await page.goto(TIZEN_INDEX);
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await openScaleRow(page); // OK (13) and the arrows arrive as the remote's key codes
    await tap(page, 'ArrowRight'); // FIT
    await tap(page, 'ArrowDown');
    await tap(page, 'ArrowDown');
    await tap(page, 'ArrowDown'); // HITBOX
    await tap(page, 'Enter'); // OK flips it ON
    expect(await rendererDisplay(page)).toMatchObject({ scaleMode: 'fit', showHitbox: true });
    await remoteTap(page, 10009); // Back: save and close — never an exit here
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-scene', 'title');
    await expect.poll(async () => (await storedDisplay(page))?.scaleMode).toBe('fit');
    expect((await storedDisplay(page))?.showHitbox).toBe(true);
    // Relaunch: the saved options are applied at boot.
    await page.reload();
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    expect(await rendererDisplay(page)).toEqual({
      scaleMode: 'fit',
      showHitbox: true,
      screenShake: true,
      reduceFlashing: false,
    });
    expect(errors).toEqual([]);
  });
});
