/**
 * Browser test of two-player co-op (plan M2-06) in headless Chromium, on the web test build (its
 * `window.__shmupDebug` hands the spec the game), with the split keyboard (`?profile=keyboard-split`
 * — player 1 WASD + F / G, player 2 arrows + K / L, Enter = player 2's START):
 *
 * - the title's `2 PLAYERS` starts a co-op game (difficulty, ship and weapon select as usual) whose
 *   HUD blinks player 2's `PRESS START`;
 * - Enter (player 2's START) drops player 2 in without pausing: its ship flies in, the bottom bar
 *   splits into both players' compact halves, and player 2's arrows move it;
 * - Esc (player 1's Pause) still opens the pause menu; no console errors.
 */
import { expect, test, type Page } from '@playwright/test';

/** What the spec reads through `window.__shmupDebug`. */
interface CoopView {
  readonly sceneId: string;
  readonly coop: boolean;
  readonly seats: number;
  readonly p2Active: boolean;
  readonly p2State: string;
  readonly p2X: number;
  readonly cameraX: number;
  readonly hud: readonly string[];
}

/**
 * Reads the scene, the World's co-op state, player 2's ship and the HUD's texts.
 *
 * @param page - The page.
 * @returns The view.
 */
function view(page: Page): Promise<CoopView> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __shmupDebug: {
          sceneId: string;
          game: {
            inputSeats: number;
            world: {
              config: { coop: boolean };
              camera: { x: number };
              players: Array<{ active: boolean; state: string; x: number }>;
            };
            scenes: { game: { hudList: { strings: readonly string[] } } };
          };
        };
      }
    ).__shmupDebug;
    const world = api.game.world;
    return {
      sceneId: api.sceneId,
      coop: world.config.coop,
      seats: api.game.inputSeats,
      p2Active: world.players[1].active,
      p2State: world.players[1].state,
      p2X: world.players[1].x,
      cameraX: world.camera.x,
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

test.describe('two-player co-op (web build, split keyboard)', () => {
  test('2 PLAYERS, player 2 joins with its START, both play; player 1 still pauses', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./?profile=keyboard-split');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitFrames(page, 10);
    await tap(page, 'Enter'); // PRESS OK (player 2's half drives the menus too)
    await tap(page, 'ArrowDown'); // 2 PLAYERS
    await tap(page, 'KeyF'); // player 1's OK
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
    await waitFrames(page, 4);
    await tap(page, 'KeyF'); // NORMAL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
    await waitFrames(page, 4);
    await tap(page, 'KeyF'); // KESTREL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await waitFrames(page, 4);
    await tap(page, 'KeyF'); // START
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    let game = await view(page);
    expect([game.coop, game.seats, game.p2Active]).toEqual([true, 2, false]);
    await expect.poll(async () => (await view(page)).hud).toContain('PRESS START');

    await tap(page, 'Enter'); // player 2's START: it drops in, no pause
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await expect.poll(async () => (await view(page)).p2State, { timeout: 10_000 }).toBe('alive');
    game = await view(page);
    expect(game.p2Active).toBe(true);
    for (const label of ['SP', 'MS', 'OP']) expect(game.hud).toContain(label);
    // Player 2's arrows move player 2 (relative to the scrolling view).
    const before = game.p2X - game.cameraX;
    await page.keyboard.down('ArrowRight');
    await waitFrames(page, 20);
    await page.keyboard.up('ArrowRight');
    game = await view(page);
    expect(game.p2X - game.cameraX).toBeGreaterThan(before + 10);

    await tap(page, 'Escape'); // player 1's Pause
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'pause');
    expect((await view(page)).seats).toBe(1); // the pause menu: one seat
    expect(errors).toEqual([]);
  });
});
