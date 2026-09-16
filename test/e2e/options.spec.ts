/**
 * Browser test of the Options screen and the save (plan M1-17) in headless Chromium, web build:
 * OPTIONS on the title opens the canvas-drawn Options screen (`data-shmup-scene="options"`); a
 * MUSIC change is written to `localStorage` (`shmup-cup:save.v1`) when Esc (Back) closes the
 * screen; after a reload the shell reads the save before the title, so the next change starts from
 * the saved level; the boot time is on the canvas (`data-shmup-boot-ms`). A corrupt save boots the
 * title with defaults, is kept under `shmup-cup:save.corrupt` and is replaced by a valid document
 * when the Options screen closes. The Tizen build opened from disk (`file://`) does the same with
 * the remote only — arrows, OK, Back (10009) — and keeps SFX and the CONTROLS page's profile
 * (M2-16) across a relaunch (the manual check of plan M1-17, automated).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/** The save's `localStorage` key (the web adapter prefixes `core/save`'s `save.v1`). */
const SAVE_KEY = 'shmup-cup:save.v1';

/** Where a corrupt or unreadable save is copied (`core/save` `save.corrupt`, prefixed). */
const CORRUPT_KEY = 'shmup-cup:save.corrupt';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** A stored save document (the fields these tests read). */
interface StoredSave {
  /** Format version. */
  readonly version: number;
  /** Options. */
  readonly options: {
    readonly audio: { readonly master: number; readonly music: number; readonly sfx: number };
    readonly input: { readonly profileId: string | null };
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
 * The MUSIC level stored in the save, or `null` when nothing is stored.
 *
 * @param page - The page.
 * @returns The level.
 */
async function storedMusic(page: Page): Promise<number | null> {
  const text = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
  if (text === null) return null;
  return (JSON.parse(text) as { options: { audio: { music: number } } }).options.audio.music;
}

/**
 * The stored save document, or `null` when nothing (or nothing parsable) is stored.
 *
 * @param page - The page.
 * @returns The document.
 */
async function storedSave(page: Page): Promise<StoredSave | null> {
  const text = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
  if (text === null) return null;
  try {
    return JSON.parse(text) as StoredSave;
  } catch {
    return null;
  }
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
 * Opens the title, then the Options screen through the title menu.
 *
 * @param page - The page.
 */
async function openOptions(page: Page): Promise<void> {
  const canvas = page.locator('#game');
  await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
  await waitFrames(page, 10);
  await tap(page, 'Enter'); // PRESS OK → the menu
  await tap(page, 'ArrowDown'); // 2 PLAYERS (M2-06)
  await tap(page, 'ArrowDown'); // PRACTICE (M2-15)
  await tap(page, 'ArrowDown'); // OPTIONS
  await tap(page, 'Enter');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'options');
  await waitFrames(page, 4); // the menu's open lock
}

test.describe('options and saves (web build)', () => {
  test('a MUSIC change is saved on Back and read again after a reload', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await page.goto('./');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    const canvas = page.locator('#game');
    await openOptions(page);
    const bootMs = Number(await canvas.getAttribute('data-shmup-boot-ms'));
    expect(bootMs).toBeGreaterThan(0);
    expect(bootMs).toBeLessThan(10_000); // shmup_feat.md §23: launch ≤ 10 s
    await tap(page, 'ArrowDown'); // MUSIC
    for (let i = 0; i < 3; i++) await tap(page, 'ArrowLeft'); // 10 → 7
    expect(await storedMusic(page)).toBeNull(); // written when the screen closes
    await tap(page, 'Escape'); // Back: save and close
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await expect.poll(() => storedMusic(page)).toBe(7);

    await page.reload();
    await openOptions(page);
    await tap(page, 'ArrowDown'); // MUSIC
    await tap(page, 'ArrowRight'); // from the saved 7, not the default 10
    await tap(page, 'Escape');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await expect.poll(() => storedMusic(page)).toBe(8);
    expect(errors).toEqual([]);
  });
});

test.describe('options and saves: corrupt save (web build)', () => {
  test('a corrupt save boots with defaults, is kept aside and replaced on Back', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await page.goto('./');
    await page.evaluate(
      ([save, corrupt]) => {
        window.localStorage.clear();
        window.localStorage.setItem(save, '{"version":1,"options":{"audio"');
        window.localStorage.removeItem(corrupt);
      },
      [SAVE_KEY, CORRUPT_KEY] as const,
    );
    await page.reload();
    await openOptions(page);
    expect(await page.evaluate((key) => window.localStorage.getItem(key), CORRUPT_KEY)).toBe(
      '{"version":1,"options":{"audio"',
    );
    await tap(page, 'ArrowLeft'); // MASTER: from the default 10 → 9
    await tap(page, 'Escape');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-scene', 'title');
    await expect.poll(async () => (await storedSave(page))?.options.audio.master).toBe(9);
    const save = await storedSave(page);
    expect(save?.version).toBe(2); // M2-16: save format version 2
    expect(save?.options.audio).toEqual({ master: 9, music: 10, sfx: 10 });
    expect(errors).toEqual([]);
  });
});

test.describe('options and saves (Tizen build from file://)', () => {
  test('remote only: SFX and CONTROLS are saved on Back and kept after a relaunch', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await page.goto(TIZEN_INDEX);
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    const canvas = page.locator('#game');
    await openOptions(page); // OK (13) and the arrows arrive as the remote's key codes
    await tap(page, 'ArrowDown');
    await tap(page, 'ArrowDown'); // SFX
    await tap(page, 'ArrowLeft'); // 10 → 9
    await tap(page, 'ArrowLeft'); // → 8
    await tap(page, 'ArrowDown'); // CONTROLS (M2-16: a page)
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'controls');
    // M3-02b: the TV ships one remote profile (`REMOTE (DEFAULT)`), so PROFILE has nowhere to go —
    // the selector stays where it is and the save keeps `profileId` unset.
    await tap(page, 'ArrowRight');
    expect(await storedSave(page)).toBeNull(); // written when a screen closes
    await remoteTap(page, 10009); // Back: the page stores and closes
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'options');
    await remoteTap(page, 10009); // Back: the Options screen — never an exit here
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await expect.poll(async () => (await storedSave(page))?.options.audio.sfx).toBe(8);
    expect((await storedSave(page))?.options.input.profileId).toBeNull();

    // Relaunch: the save is read before the title; the next change starts from the saved level.
    await page.reload();
    await openOptions(page);
    await tap(page, 'ArrowDown');
    await tap(page, 'ArrowDown'); // SFX
    await tap(page, 'ArrowRight'); // 8 → 9
    await remoteTap(page, 10009);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await expect.poll(async () => (await storedSave(page))?.options.audio.sfx).toBe(9);
    // PROFILE was not touched this time either.
    expect((await storedSave(page))?.options.input.profileId).toBeNull();
    expect(errors).toEqual([]);
  });
});
