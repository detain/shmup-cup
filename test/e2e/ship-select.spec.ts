/**
 * Browser tests of the ship select and Direct mode (plan M2-05) in headless Chromium, on the test
 * builds (their `window.__shmupDebug` hands the spec the game):
 *
 * - web build: OK on the difficulty menu opens the ship select (its panel names both ships and
 *   pictures the focused one — the MANTA's green canopy once ArrowDown focuses it); Enter starts the
 *   game with the MANTA in Direct mode (no weapon select), the HUD shows the tier pips' labels
 *   (`SHOT`, `SUB`, `ARM`, `SPD`, the family's `DISC`) instead of the meter, and the MANTA flies;
 * - Tizen build from `file://`: the remote's arrows and OK (37–40, 13) pick the MANTA and Ch− (428)
 *   toggles its speed in the game;
 * - no console errors in either.
 *
 * Screenshots are ×3 (viewport 1152×648): frame pixel x is screenshot pixel 3x + 1.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** The MANTA's canopy colour (`ships/manta` palette `g`, #40d070) — only its sprite uses it. */
const MANTA_CANOPY = [0x40, 0xd0, 0x70] as const;

/** What the spec reads through `window.__shmupDebug`. */
interface DirectView {
  readonly sceneId: string;
  readonly shipId: string;
  readonly mode: string;
  readonly speedLevel: number;
  readonly state: string;
  readonly hud: readonly string[];
}

/**
 * Reads the scene, the game World's ship and mode, player 1's speed and state and the HUD's texts.
 *
 * @param page - The page.
 * @returns The view.
 */
function view(page: Page): Promise<DirectView> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __shmupDebug: {
          sceneId: string;
          game: {
            world: {
              config: { shipId: string; powerUpMode: string };
              players: Array<{ speedLevel: number; state: string }>;
            };
            scenes: { game: { hudList: { strings: readonly string[] } } };
          };
        };
      }
    ).__shmupDebug;
    const world = api.game.world;
    return {
      sceneId: api.sceneId,
      shipId: world.config.shipId,
      mode: world.config.powerUpMode,
      speedLevel: world.players[0].speedLevel,
      state: world.players[0].state,
      hud: api.game.scenes.game.hudList.strings.slice(),
    };
  });
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
 * Presses a key for a few frames and lets the game see the release.
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
 * Dispatches a remote key by its legacy key code (the TV sends no `code`), down then up.
 *
 * @param page - The page.
 * @param keyCode - The key code.
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
 * Counts the canvas pixels within 2 of a colour.
 *
 * @param page - The page.
 * @param rgb - The colour.
 * @returns The count.
 */
async function countColour(page: Page, rgb: readonly [number, number, number]): Promise<number> {
  const png = await page.locator('#game').screenshot();
  const { data } = decodePng(new Uint8Array(png));
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - rgb[0]) <= 2 &&
      Math.abs(data[i + 1] - rgb[1]) <= 2 &&
      Math.abs(data[i + 2] - rgb[2]) <= 2
    ) {
      count++;
    }
  }
  return count;
}

/**
 * Opens a build and goes through the title and the difficulty menu (NORMAL) to the ship select.
 *
 * @param page - The page.
 * @param url - The build's URL.
 * @param remote - Drive the menus with remote key codes (else the keyboard).
 * @returns The page's error log.
 */
async function openShips(page: Page, url: string, remote: boolean): Promise<string[]> {
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
  const ok = (): Promise<void> => (remote ? remoteTap(page, 13) : tap(page, 'Enter'));
  await ok(); // PRESS OK
  await ok(); // START
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
  await ok(); // NORMAL
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
  return errors;
}

test.describe('ship select (web build)', () => {
  test('ArrowDown + Enter picks the MANTA: Direct mode, the tier pips, no weapon select', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = await openShips(page, './', false);
    const canvas = page.locator('#game');
    await waitFrames(page, 4);
    await tap(page, 'ArrowDown'); // MANTA: its picture on the panel
    await expect.poll(async () => countColour(page, MANTA_CANOPY)).toBeGreaterThan(0);
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await expect.poll(async () => (await view(page)).state, { timeout: 10_000 }).toBe('alive');
    const game = await view(page);
    expect([game.shipId, game.mode, game.speedLevel]).toEqual(['manta', 'direct', 1]);
    for (const label of ['SHOT', 'SUB', 'ARM', 'SPD', 'DISC']) expect(game.hud).toContain(label);
    // The MANTA flies (its canopy on screen).
    expect(await countColour(page, MANTA_CANOPY)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});

test.describe('ship select (Tizen build via file://)', () => {
  test('the remote picks the MANTA; Ch- toggles its speed in the game', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await openShips(page, TIZEN_INDEX, true);
    const canvas = page.locator('#game');
    await waitFrames(page, 4);
    await remoteTap(page, 40); // ArrowDown: MANTA
    await remoteTap(page, 13); // OK
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await expect.poll(async () => (await view(page)).state, { timeout: 10_000 }).toBe('alive');
    expect((await view(page)).mode).toBe('direct');
    await remoteTap(page, 428); // Ch-: the Speed toggle
    await expect.poll(async () => (await view(page)).speedLevel).toBe(2);
    expect(errors).toEqual([]);
  });
});
