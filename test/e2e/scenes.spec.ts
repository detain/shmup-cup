/**
 * Browser tests of the scene flow (plan M1-16) in headless Chromium: both builds boot to the
 * title (`data-shmup-scene="title"`, the canvas-drawn logo, no ship); **Enter starts the game from
 * the title** — once past `PRESS OK`, once on START, once on NORMAL in the difficulty menu (M2-01)
 * — and the KESTREL flies in with the HUD bars
 * and the power meter drawn; the pause key opens the pause menu over the dimmed, frozen game and
 * closes it again. In the Tizen build opened from disk the remote's OK (key code 13) starts the game
 * and Back (10009) pauses and resumes it through the scene stack — it never exits the app there.
 * Back on the title: in the browser (no `platform.exit`) it only backs out of the menu to
 * `PRESS OK`; in the Tizen build with a fake `window.tizen` it opens the exit confirmation, NO keeps
 * the app running and only YES calls `tizen.application.getCurrentApplication().exit()`.
 * Screenshots are ×3 (viewport 1152×648): frame pixel (x, y) is screenshot pixel (3x + 1, 3y + 1).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** KESTREL hull colour (`ships/kestrel` palette `h`, #c8d0e0) — only the ship uses it. */
const KESTREL_HULL = [0xc8, 0xd0, 0xe0] as const;

/** HUD bar fill (core `ui` `HUD_COLORS.bar`, 0x1d2a5c). */
const HUD_BAR = [0x1d, 0x2a, 0x5c] as const;

/** Bottom colour of the title logo's gradient (`ui/logo`, #e04828). */
const LOGO_RED = [0xe0, 0x48, 0x28] as const;

/** A decoded canvas screenshot. */
interface Shot {
  /** Width in pixels. */
  readonly width: number;
  /** RGBA pixels. */
  readonly data: Uint8Array;
}

/**
 * Screenshots the game canvas.
 *
 * @param page - The page.
 * @returns The pixels.
 */
async function shoot(page: Page): Promise<Shot> {
  const png = await page.locator('#game').screenshot();
  const { width, data } = decodePng(new Uint8Array(png));
  return { width, data };
}

/**
 * Counts the pixels within 2 of a colour.
 *
 * @param shot - The screenshot.
 * @param rgb - The colour.
 * @returns The count.
 */
function count(shot: Shot, rgb: readonly [number, number, number]): number {
  let n = 0;
  for (let i = 0; i < shot.data.length; i += 4) {
    if (
      Math.abs(shot.data[i] - rgb[0]) <= 2 &&
      Math.abs(shot.data[i + 1] - rgb[1]) <= 2 &&
      Math.abs(shot.data[i + 2] - rgb[2]) <= 2
    ) {
      n++;
    }
  }
  return n;
}

/**
 * The colour of a frame pixel.
 *
 * @param shot - The screenshot.
 * @param x - Frame x.
 * @param y - Frame y.
 * @returns RGB.
 */
function frameRgb(shot: Shot, x: number, y: number): [number, number, number] {
  const i = ((y * 3 + 1) * shot.width + (x * 3 + 1)) * 4;
  return [shot.data[i], shot.data[i + 1], shot.data[i + 2]];
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
 * Presses a key for a few frames and lets the game see the release (remote profiles debounce
 * releases by two ticks).
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
 * Opens a build and waits for its title.
 *
 * @param page - The page.
 * @param url - The URL.
 * @returns The page's error log.
 */
async function openTitle(page: Page, url: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const canvas = page.locator('#game');
  await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
  await waitFrames(page, 10);
  return errors;
}

test.describe('scene flow (web build)', () => {
  test('Enter starts the game from the title; Esc pauses and resumes it', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await openTitle(page, './');
    const canvas = page.locator('#game');
    const title = await shoot(page);
    expect(count(title, LOGO_RED)).toBeGreaterThan(50);
    expect(count(title, KESTREL_HULL)).toBe(0);
    await tap(page, 'Enter'); // PRESS OK → the menu
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await tap(page, 'Enter'); // START
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
    await tap(page, 'Enter'); // NORMAL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
    await tap(page, 'Enter'); // KESTREL in the ship select (M2-05)
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await tap(page, 'Enter'); // START in the weapon select (M2-03)
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await waitFrames(page, 60); // the fly-in
    const game = await shoot(page);
    expect(count(game, KESTREL_HULL)).toBeGreaterThan(0);
    expect(count(game, LOGO_RED)).toBe(0);
    expect(frameRgb(game, 0, 0)).toEqual([...HUD_BAR]);
    expect(frameRgb(game, 383, 215)).toEqual([...HUD_BAR]);
    // Pause: the menu over the dimmed game.
    await tap(page, 'Escape');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'pause');
    const paused = await shoot(page);
    const bar = frameRgb(paused, 0, 0);
    expect(bar[2]).toBeLessThan(HUD_BAR[2]); // dimmed
    await waitFrames(page, 20);
    const still = await shoot(page);
    expect(Buffer.from(still.data).equals(Buffer.from(paused.data))).toBe(true); // frozen
    await tap(page, 'Escape'); // Back in the menu context: resume
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    expect(errors).toEqual([]);
  });

  test('Back on the title only backs out of the menu (a browser cannot exit)', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await openTitle(page, './');
    const canvas = page.locator('#game');
    await tap(page, 'Escape'); // on PRESS OK: nothing to confirm
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await tap(page, 'Enter'); // the menu
    await tap(page, 'Escape'); // back to PRESS OK
    await tap(page, 'Enter'); // the menu again — not START yet
    await waitFrames(page, 6);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await tap(page, 'Enter'); // START
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
    await tap(page, 'Enter'); // NORMAL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
    await tap(page, 'Enter'); // KESTREL in the ship select (M2-05)
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await tap(page, 'Enter'); // START in the weapon select (M2-03)
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    expect(errors).toEqual([]);
  });
});

test.describe('scene flow (Tizen build via file://)', () => {
  test('OK starts the game; Back pauses and resumes it without exiting', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await openTitle(page, TIZEN_INDEX);
    const canvas = page.locator('#game');
    await tap(page, 'Enter'); // keyCode 13 = OK
    await tap(page, 'Enter'); // START
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
    await tap(page, 'Enter'); // NORMAL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
    await tap(page, 'Enter'); // KESTREL in the ship select (M2-05)
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await tap(page, 'Enter'); // START in the weapon select (M2-03)
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await waitFrames(page, 60);
    expect(count(await shoot(page), KESTREL_HULL)).toBeGreaterThan(0);
    await remoteTap(page, 10009);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'pause');
    await remoteTap(page, 10009);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    expect(errors).toEqual([]);
  });
});

test.describe('scene flow (Tizen build with a fake tizen API)', () => {
  test('Back on the title opens the exit confirmation; the app exits only after YES', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    // A stand-in for the TV's `window.tizen`: key registration succeeds, exit() is counted.
    await page.addInitScript(() => {
      const w = window as unknown as { shmupExits: number; tizen: unknown };
      w.shmupExits = 0;
      w.tizen = {
        tvinputdevice: {
          registerKey: () => {},
          registerKeyBatch: (_keys: string[], onSuccess?: () => void) => onSuccess?.(),
        },
        application: {
          getCurrentApplication: () => ({
            exit: () => {
              w.shmupExits++;
            },
          }),
        },
      };
    });
    const errors = await openTitle(page, TIZEN_INDEX);
    const canvas = page.locator('#game');
    const exits = (): Promise<number> =>
      page.evaluate(() => (window as unknown as { shmupExits: number }).shmupExits);
    await remoteTap(page, 10009);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'confirm');
    await tap(page, 'Enter'); // OK on the default NO
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    expect(await exits()).toBe(0);
    await remoteTap(page, 10009);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'confirm');
    await remoteTap(page, 10009); // Back answers NO as well
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    expect(await exits()).toBe(0);
    await remoteTap(page, 10009);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'confirm');
    await tap(page, 'ArrowLeft'); // YES
    expect(await exits()).toBe(0);
    await tap(page, 'Enter');
    await expect.poll(exits).toBe(1);
    expect(errors).toEqual([]);
  });
});
