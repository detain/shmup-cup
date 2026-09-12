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
 * Screenshots are ×3 (viewport 1152×648).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';

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
 * Ends the running game: every life gone, status `gameOver` (the scene flow opens the end screen
 * after its delay).
 *
 * @param page - The page.
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
 * Opens a build, goes through the title and the difficulty menu and starts a game.
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
  await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
  await waitFrames(page, 10);
  await tap(page, 'Enter'); // PRESS OK
  await tap(page, 'Enter'); // START
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
  for (let i = 0; i < downs; i++) await tap(page, 'ArrowDown');
  await tap(page, 'Enter');
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
    await waitFrames(page, 30);
    expect(await countColour(page, ALERT_RED)).toBe(0); // no countdown panel in play
    await endGame(page);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'continue');
    await waitFrames(page, 40); // past the countdown's lock
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
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'continue');
    await waitFrames(page, 40);
    await remoteTap(page, 10009);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'gameOver');
    expect((await view(page)).continuesUsed).toBe(0);
    expect(errors).toEqual([]);
  });
});
