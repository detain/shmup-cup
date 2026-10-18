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
 * Every wait after the boot counts the game's ticks (`ticks.ts`), never rAF frames or wall time:
 * the tally opens 90 ticks after the clear and the next zone 60 ticks after the map's OK, which a
 * slow runner takes far longer than `expect`'s default 5 s to run (C5 review 3).
 *
 * Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport 1280×720).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import {
  BOOT_TIMEOUT_MS,
  MAP_LAUNCH_TICKS,
  SCENE_SLACK_TICKS,
  STAGE_CLEAR_DELAY_TICKS,
  expectScene,
  remoteTap,
  tap,
  waitTicks,
} from './ticks.js';

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
 * Clears the running zone: a score, status `stageClear`. The flow opens the tally
 * {@link STAGE_CLEAR_DELAY_TICKS} ticks later, and this waits for it.
 *
 * @param page - The page.
 * @returns Resolves once the canvas shows the tally (`stageClear`).
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
  await expectScene(page, 'stageClear', STAGE_CLEAR_DELAY_TICKS + SCENE_SLACK_TICKS);
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
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
    timeout: BOOT_TIMEOUT_MS,
  });
  await expectScene(page, 'title');
  await waitTicks(page, 10);
  await tap(page, 'Enter'); // PRESS OK
  await tap(page, 'Enter'); // 1 PLAYER
  await expectScene(page, 'difficulty');
  await tap(page, 'Enter'); // NORMAL
  await expectScene(page, 'shipSelect');
  await tap(page, 'Enter'); // KESTREL
  await expectScene(page, 'weaponSelect');
  await tap(page, 'Enter'); // START
  await expectScene(page, 'game');
  return errors;
}

test.describe('zone map (web build)', () => {
  test('zone A`s clear: the tally, the map, ArrowDown + Enter → zone C', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await startGame(page, './');
    expect(await view(page)).toMatchObject({ stage: 'zone-a', route: [0] });
    await clearZone(page);
    await waitTicks(page, 10);
    await tap(page, 'Enter'); // skip the tally
    await expectScene(page, 'map');
    await waitTicks(page, 10);
    // The graph and its panel: yellow for the cleared zone and the focused exit.
    expect(await countColour(page, FOCUS_YELLOW)).toBeGreaterThan(100);
    await tap(page, 'ArrowDown');
    await tap(page, 'Enter');
    await expectScene(page, 'game', MAP_LAUNCH_TICKS + SCENE_SLACK_TICKS);
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
    await clearZone(page);
    await waitTicks(page, 10);
    await remoteTap(page, 13);
    await expectScene(page, 'map');
    await waitTicks(page, 10);
    await remoteTap(page, 10009);
    await expectScene(page, 'confirm');
    await remoteTap(page, 10009); // NO
    await expectScene(page, 'map');
    await waitTicks(page, 10);
    await remoteTap(page, 13);
    await expectScene(page, 'game', MAP_LAUNCH_TICKS + SCENE_SLACK_TICKS);
    expect((await view(page)).stage).toBe('zone-b');
    expect(errors).toEqual([]);
  });
});
