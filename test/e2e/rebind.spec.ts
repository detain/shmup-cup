/**
 * Browser test of rebinding (plan M2-16) in headless Chromium: the Options screen's CONTROLS page →
 * REBIND KEYS captures a key for SHOT (`data-shmup-scene="rebind"`), the save stores it
 * (`options.input.bindings` under `shmup-cup:save.v1`), the INPUT TEST shows the new key driving
 * SHOT (and the old one no longer), holding Pause leaves the test — and after a reload the
 * rebinding is applied at boot. The Tizen build opened from disk rebinds the remote's POWER-UP to
 * CH- with the remote's keys only and keeps it across a relaunch. Web and TV read the flow through
 * the test build's debug API (`window.__shmupDebug.game`).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/** The save's `localStorage` key. */
const SAVE_KEY = 'shmup-cup:save.v1';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** Bits of the core's `Action` the tests read. */
const SHOT = 1 << 4;
const POWER_UP = 1 << 6;

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
 * Sends a remote key by key code (the TV remote's CH− = 428), down or up.
 *
 * @param page - The page.
 * @param type - `keydown` or `keyup`.
 * @param keyCode - The legacy key code.
 */
function remoteKey(page: Page, type: 'keydown' | 'keyup', keyCode: number): Promise<void> {
  return page.evaluate(
    ([eventType, code]) => {
      const event = new KeyboardEvent(eventType, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'keyCode', { get: () => code });
      window.dispatchEvent(event);
    },
    [type, keyCode] as const,
  );
}

/**
 * Taps a remote key by key code.
 *
 * @param page - The page.
 * @param keyCode - The legacy key code.
 */
async function remoteTap(page: Page, keyCode: number): Promise<void> {
  await remoteKey(page, 'keydown', keyCode);
  await waitFrames(page, 3);
  await remoteKey(page, 'keyup', keyCode);
  await waitFrames(page, 6);
}

/** The scene flow's state the tests read, through the debug API. */
interface FlowProbe {
  /** The rebind screen's widget. */
  readonly rebind: { readonly capturing: boolean; readonly message: string };
  /** The input test's lit actions. */
  readonly lit: number;
}

/**
 * Reads the rebind screen and the input test.
 *
 * @param page - The page.
 * @returns What they show.
 */
function probe(page: Page): Promise<FlowProbe> {
  return page.evaluate(() => {
    const debug = (
      window as unknown as {
        __shmupDebug: {
          game: {
            scenes: {
              rebind: { panel: { capturing: boolean; message: string } };
              inputTest: { lit: number };
            };
          };
        };
      }
    ).__shmupDebug;
    const scenes = debug.game.scenes;
    return {
      rebind: { capturing: scenes.rebind.panel.capturing, message: scenes.rebind.panel.message },
      lit: scenes.inputTest.lit,
    };
  });
}

/**
 * The rebinding stored in the save.
 *
 * @param page - The page.
 * @returns `options.input.bindings`, or `null` when nothing is stored.
 */
async function storedBindings(page: Page): Promise<Record<string, unknown> | null> {
  const text = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
  if (text === null) return null;
  const save = JSON.parse(text) as { options?: { input?: { bindings?: Record<string, unknown> } } };
  return save.options?.input?.bindings ?? null;
}

/**
 * Collects console errors and page errors.
 *
 * @param page - The page.
 * @returns The (live) error log.
 */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * From the title: OPTIONS → the CONTROLS page (the arrows and Enter reach the remote profiles
 * through their key codes too).
 *
 * @param page - The page.
 */
async function openControls(page: Page): Promise<void> {
  const canvas = page.locator('#game');
  await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
  await waitFrames(page, 10);
  await tap(page, 'Enter'); // PRESS OK → the menu
  for (let i = 0; i < 3; i++) await tap(page, 'ArrowDown'); // 2 PLAYERS, PRACTICE, OPTIONS
  await tap(page, 'Enter');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'options');
  await waitFrames(page, 4);
  for (let i = 0; i < 3; i++) await tap(page, 'ArrowDown'); // MUSIC, SFX, CONTROLS
  await tap(page, 'Enter');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'controls');
  await waitFrames(page, 4);
}

/**
 * Holds a key until the input test's lit mask has the bits, and returns the mask.
 *
 * @param page - The page.
 * @param key - Playwright key name.
 * @returns The lit mask while held.
 */
async function litWhileHeld(page: Page, key: string): Promise<number> {
  await page.keyboard.down(key);
  await waitFrames(page, 4);
  const lit = (await probe(page)).lit;
  await page.keyboard.up(key);
  await waitFrames(page, 20); // the press flash goes out
  return lit;
}

test.describe('rebinding (web build)', () => {
  test('rebinds SHOT to J, saves it, shows it in the input test and applies it after a reload', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await page.goto('./');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    const canvas = page.locator('#game');
    await openControls(page);
    // PROFILE, AUTOFIRE, RATE, SOCD, DEBOUNCE → REBIND KEYS.
    for (let i = 0; i < 5; i++) await tap(page, 'ArrowDown');
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'rebind');
    await waitFrames(page, 4);
    for (let i = 0; i < 5; i++) await tap(page, 'ArrowDown'); // MODE, UP … RIGHT → SHOT
    await tap(page, 'Enter');
    await expect.poll(async () => (await probe(page)).rebind.capturing).toBe(true);
    await tap(page, 'KeyJ');
    await expect.poll(async () => (await probe(page)).rebind.message).toBe('SHOT REBOUND');
    expect((await probe(page)).rebind.capturing).toBe(false);
    await waitFrames(page, 10);
    await tap(page, 'Escape'); // Back: DONE
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'controls');
    await expect
      .poll(() => storedBindings(page))
      .toEqual({ 'keyboard-default': { game: { Shot: ['code:KeyJ'] } } });

    // The input test (the gameplay table): J shoots, Z no longer does.
    await waitFrames(page, 4);
    for (let i = 0; i < 2; i++) await tap(page, 'ArrowDown'); // REBIND PAD, INPUT TEST
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'inputTest');
    expect((await litWhileHeld(page, 'KeyJ')) & SHOT).toBe(SHOT);
    expect((await litWhileHeld(page, 'KeyZ')) & SHOT).toBe(0);
    // Holding Pause (Esc) leaves it.
    await page.keyboard.down('Escape');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'controls', { timeout: 10_000 });
    await page.keyboard.up('Escape');

    // After a reload the save's rebinding is applied at boot.
    await page.reload();
    await openControls(page);
    for (let i = 0; i < 7; i++) await tap(page, 'ArrowDown'); // … INPUT TEST
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'inputTest');
    expect((await litWhileHeld(page, 'KeyJ')) & SHOT).toBe(SHOT);
    expect(errors).toEqual([]);
  });
});

test.describe('rebinding (Tizen build from file://)', () => {
  test('remote only: POWER-UP moves to CH- and stays there after a relaunch', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await page.goto(TIZEN_INDEX);
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    const canvas = page.locator('#game');
    await openControls(page);
    // PROFILE, (AUTOFIRE is off on the TV), RATE, SOCD, DEBOUNCE → REBIND KEYS.
    for (let i = 0; i < 4; i++) await tap(page, 'ArrowDown');
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'rebind');
    await waitFrames(page, 4);
    for (let i = 0; i < 7; i++) await tap(page, 'ArrowDown'); // MODE, UP … SUB → POWER-UP
    await tap(page, 'Enter');
    await expect.poll(async () => (await probe(page)).rebind.capturing).toBe(true);
    await remoteTap(page, 428); // CH−: Speed's only key — the two swap
    await expect.poll(async () => (await probe(page)).rebind.message).toBe('SWAPPED WITH SPEED');
    await waitFrames(page, 10);
    await remoteTap(page, 10009); // Back: DONE (the remote's Back never moves)
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'controls');
    await expect
      .poll(() => storedBindings(page))
      .toEqual({ 'tizen-remote-safe': { game: { PowerUp: ['key:428'], Speed: ['key:13'] } } });

    await page.reload();
    await openControls(page);
    for (let i = 0; i < 6; i++) await tap(page, 'ArrowDown'); // … INPUT TEST
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'inputTest');
    await remoteKey(page, 'keydown', 428);
    await waitFrames(page, 4);
    expect((await probe(page)).lit & POWER_UP).toBe(POWER_UP);
    await remoteKey(page, 'keyup', 428);
    expect(errors).toEqual([]);
  });
});
