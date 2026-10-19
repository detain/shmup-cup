/**
 * Browser tests of the M2-01 menus (plan M2-01) in headless Chromium, on the test builds (their
 * `window.__shmupDebug` hands the spec the game, to end a run without playing it out):
 *
 * - web build: START opens the difficulty menu, ArrowDown + Enter starts the game on HARD (its
 *   World on the Hard preset: rank 4); a game over opens the continue countdown over the game (its
 *   red panel drawn); Enter after the lock continues — the same game runs on with fresh lives, one
 *   continue used and the score's last digit counting it;
 * - Tizen build from `file://`: the remote's Back (10009) on the countdown gives up and opens the
 *   game-over screen, without leaving the app;
 * - no console errors in either.
 *
 * Screenshots are at the e2e capture scale (`frame-pixels.ts`; ×2, viewport 1280×720).
 *
 * Key taps and pauses count the game's ticks (`ticks.ts`), never rAF frames: a slow runner draws
 * fewer frames a second and catches up by up to 4 ticks a frame, so a count of frames is a
 * different number of ticks on every machine (C5 review 4).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import {
  BOOT_TIMEOUT_MS,
  GAME_OVER_DELAY_TICKS,
  SCENE_SLACK_TICKS,
  expectScene,
  remoteTap,
  tap,
  waitTicks,
} from './ticks.js';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** The continue panel's border and digit colour (core `ui` `UI_COLORS.alert`, 0xf85858). */
const ALERT_RED = [0xf8, 0x58, 0x58] as const;

/** What the spec reads from the game through `window.__shmupDebug`. */
interface GameView {
  readonly sceneId: string;
  readonly difficulty: string;
  readonly rank: number;
  readonly status: string;
  readonly lives: number;
  readonly continuesUsed: number;
  readonly score: number;
}

/**
 * Reads the scene id and a few World fields.
 *
 * @param page - The page.
 * @returns The view.
 */
function view(page: Page): Promise<GameView> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __shmupDebug: {
          sceneId: string;
          game: {
            world: {
              config: { difficulty: string };
              rank: number;
              status: string;
              continuesUsed: number;
              players: Array<{ lives: number }>;
              scoring: { board: { scores: Array<{ score: number }> } };
            };
          };
        };
      }
    ).__shmupDebug;
    const world = api.game.world;
    return {
      sceneId: api.sceneId,
      difficulty: world.config.difficulty,
      rank: world.rank,
      status: world.status,
      lives: world.players[0].lives,
      continuesUsed: world.continuesUsed,
      score: world.scoring.board.scores[0].score,
    };
  });
}

/**
 * Ends the running game: every life gone, status `gameOver`. The scene flow opens the continue
 * countdown {@link GAME_OVER_DELAY_TICKS} ticks later, and this waits for it.
 *
 * @param page - The page.
 * @returns Resolves once the canvas shows the countdown (`continue`).
 */
async function endGame(page: Page): Promise<void> {
  await page.evaluate(() => {
    const world = (
      window as unknown as {
        __shmupDebug: {
          game: {
            world: {
              status: string;
              players: Array<{ lives: number }>;
              scoring: { board: { scores: Array<{ score: number }> } };
            };
          };
        };
      }
    ).__shmupDebug.game.world;
    world.scoring.board.scores[0].score = 12_340;
    world.status = 'gameOver';
    for (const ship of world.players) ship.lives = 0;
  });
  await expectScene(page, 'continue', GAME_OVER_DELAY_TICKS + SCENE_SLACK_TICKS);
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
 * Opens a build, goes through the title, the difficulty menu and the weapon select (M2-03) and
 * starts a game.
 *
 * @param page - The page.
 * @param url - The build's URL.
 * @param downs - ArrowDown presses on the difficulty menu (from NORMAL).
 * @returns The page's error log.
 */
async function startGame(page: Page, url: string, downs: number): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const canvas = page.locator('#game');
  await expect(canvas).toHaveAttribute('data-shmup-state', 'running', { timeout: BOOT_TIMEOUT_MS });
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
  await waitTicks(page, 10);
  await tap(page, 'Enter'); // PRESS OK
  await tap(page, 'Enter'); // START
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
  for (let i = 0; i < downs; i++) await tap(page, 'ArrowDown');
  await tap(page, 'Enter');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
  await tap(page, 'Enter'); // KESTREL in the ship select (M2-05)
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
  await tap(page, 'Enter'); // START in the weapon select (M2-03)
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
  return errors;
}

test.describe('difficulty and continues (web build)', () => {
  test('HARD from the menu; a game over counts down and Enter continues', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await startGame(page, './', 1);
    const canvas = page.locator('#game');
    const hard = await view(page);
    expect([hard.difficulty, hard.rank, hard.lives]).toEqual(['hard', 4, 3]);
    await waitTicks(page, 30);
    expect(await countColour(page, ALERT_RED)).toBe(0); // no countdown panel in play
    await endGame(page);
    await waitTicks(page, 40); // past the countdown's lock (core CONTINUE_LOCK_TICKS 30)
    expect(await countColour(page, ALERT_RED)).toBeGreaterThan(50);
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    const after = await view(page);
    expect(after).toMatchObject({
      difficulty: 'hard',
      status: 'playing',
      lives: 3,
      continuesUsed: 1,
      score: 12_341,
    });
    expect(errors).toEqual([]);
  });
});

test.describe('difficulty and continues (Tizen build via file://)', () => {
  test('Back on the countdown gives up: the game-over screen', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = await startGame(page, TIZEN_INDEX, 0);
    const canvas = page.locator('#game');
    expect((await view(page)).difficulty).toBe('normal');
    await endGame(page);
    await waitTicks(page, 40);
    await remoteTap(page, 10009);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'gameOver');
    expect((await view(page)).continuesUsed).toBe(0);
    expect(errors).toEqual([]);
  });
});
