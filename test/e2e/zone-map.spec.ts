/**
 * Browser tests of the M2-10 zone map in headless Chromium, on the test builds (their
 * `window.__shmupDebug` hands the spec the game, to clear a zone without playing it out):
 *
 * - web build: a game on zone A is a campaign run; its clear opens the zone result tally, then
 *   the zone map — drawn over the starfield, with the focused node blinking yellow —, ArrowDown
 *   chooses the lower exit and Enter launches zone C, whose World carries the score over;
 * - Tizen build from `file://`: the remote's OK (13) launches zone B from the map, and Back (10009)
 *   on the map asks "quit to title?" without leaving the app;
 * - no console errors in either.
 *
 * Screenshots are ×3 (viewport 1152×648).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** The focused node's and the cleared zone's yellow (core `ui` `UI_COLORS.focus`, 0xf8d030). */
const FOCUS_YELLOW = [0xf8, 0xd0, 0x30] as const;

/** What the spec reads through `window.__shmupDebug`. */
interface RunView {
  readonly sceneId: string;
  readonly stage: string | null;
  readonly score: number;
  readonly route: readonly number[];
}

/**
 * Reads the scene, the World's stage and score and the run's route.
 *
 * @param page - The page.
 * @returns The view.
 */
function view(page: Page): Promise<RunView> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __shmupDebug: {
          sceneId: string;
          game: {
            world: {
              stage: { stage: { id: string } } | null;
              scoring: { board: { scores: Array<{ score: number }> } };
            };
            scenes: { run: { route: number[] } };
          };
        };
      }
    ).__shmupDebug;
    const world = api.game.world;
    return {
      sceneId: api.sceneId,
      stage: world.stage === null ? null : world.stage.stage.id,
      score: world.scoring.board.scores[0].score,
      route: api.game.scenes.run.route.slice(),
    };
  });
}

/**
 * Clears the running zone: a score, status `stageClear` (the flow opens the tally after its
 * delay).
 *
 * @param page - The page.
 */
async function clearZone(page: Page): Promise<void> {
  await page.evaluate(() => {
    const world = (
      window as unknown as {
        __shmupDebug: {
          game: {
            world: { status: string; scoring: { board: { scores: Array<{ score: number }> } } };
          };
        };
      }
    ).__shmupDebug.game.world;
    world.scoring.board.scores[0].score = 4_200;
    world.status = 'stageClear';
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
 * Dispatches a remote key by its legacy key code, down then up.
 *
 * @param page - The page.
 * @param keyCode - The key code (13 OK, 10009 Back).
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
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - rgb[0]) <= 2 &&
      Math.abs(data[i + 1] - rgb[1]) <= 2 &&
      Math.abs(data[i + 2] - rgb[2]) <= 2
    ) {
      n++;
    }
  }
  return n;
}

/**
 * Opens a build and starts a game on zone A through the menus (NORMAL, KESTREL, START).
 *
 * @param page - The page.
 * @param url - The build's URL.
 * @returns The page's error log.
 */
async function startGame(page: Page, url: string): Promise<string[]> {
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
  await tap(page, 'Enter'); // PRESS OK
  await tap(page, 'Enter'); // 1 PLAYER
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
  await tap(page, 'Enter'); // NORMAL
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
  await tap(page, 'Enter'); // KESTREL
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
  await tap(page, 'Enter'); // START
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
  return errors;
}

test.describe('zone map (web build)', () => {
  test('zone A`s clear: the tally, the map, ArrowDown + Enter → zone C', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await startGame(page, './');
    const canvas = page.locator('#game');
    expect(await view(page)).toMatchObject({ stage: 'zone-a', route: [0] });
    await clearZone(page);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'stageClear');
    await waitFrames(page, 10);
    await tap(page, 'Enter'); // skip the tally
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'map');
    await waitFrames(page, 10);
    // The graph and its panel: yellow for the cleared zone and the focused exit.
    expect(await countColour(page, FOCUS_YELLOW)).toBeGreaterThan(100);
    await tap(page, 'ArrowDown');
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    const next = await view(page);
    expect(next.stage).toBe('zone-c');
    expect(next.route).toEqual([0, 2]);
    // 4,200 + the tally's kill bonus (zone A was cleared without killing much: at least 0 %).
    expect(next.score).toBeGreaterThanOrEqual(4_200);
    expect(errors).toEqual([]);
  });
});

test.describe('zone map (Tizen build via file://)', () => {
  test('the remote: Back on the map asks, OK launches zone B', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await startGame(page, TIZEN_INDEX);
    const canvas = page.locator('#game');
    await clearZone(page);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'stageClear');
    await waitFrames(page, 10);
    await remoteTap(page, 13);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'map');
    await waitFrames(page, 10);
    await remoteTap(page, 10009);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'confirm');
    await remoteTap(page, 10009); // NO
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'map');
    await waitFrames(page, 10);
    await remoteTap(page, 13);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    expect((await view(page)).stage).toBe('zone-b');
    expect(errors).toEqual([]);
  });
});
