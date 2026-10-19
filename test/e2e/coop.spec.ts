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
 *
 * Key taps and pauses count the game's ticks (`ticks.ts`), never rAF frames: a slow runner draws
 * fewer frames a second and catches up by up to 4 ticks a frame, so a count of frames is a
 * different number of ticks on every machine (C5 review 4).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  BOOT_TIMEOUT_MS,
  SCENE_SLACK_TICKS,
  SHIP_ENTER_TICKS,
  pollTicks,
  tap,
  waitTicks,
} from './ticks.js';

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
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitTicks(page, 10);
    await tap(page, 'Enter'); // PRESS OK (player 2's half drives the menus too)
    await tap(page, 'ArrowDown'); // 2 PLAYERS
    await tap(page, 'KeyF'); // player 1's OK
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
    await waitTicks(page, 4);
    await tap(page, 'KeyF'); // NORMAL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
    await waitTicks(page, 4);
    await tap(page, 'KeyF'); // KESTREL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await waitTicks(page, 4);
    await tap(page, 'KeyF'); // START
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    let game = await view(page);
    expect([game.coop, game.seats, game.p2Active]).toEqual([true, 2, false]);
    await expect.poll(async () => (await view(page)).hud).toContain('PRESS START');

    await tap(page, 'Enter'); // player 2's START: it drops in, no pause
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    // Player 2 joins on its START and flies in like a respawn.
    await pollTicks(
      page,
      "player 2's state",
      async () => (await view(page)).p2State,
      'alive',
      SHIP_ENTER_TICKS + SCENE_SLACK_TICKS,
    );
    game = await view(page);
    expect(game.p2Active).toBe(true);
    for (const label of ['SP', 'MS', 'OP']) expect(game.hud).toContain(label);
    // Player 2's arrows move player 2 (relative to the scrolling view).
    const before = game.p2X - game.cameraX;
    await page.keyboard.down('ArrowRight');
    await waitTicks(page, 20);
    await page.keyboard.up('ArrowRight');
    game = await view(page);
    expect(game.p2X - game.cameraX).toBeGreaterThan(before + 10);

    await tap(page, 'Escape'); // player 1's Pause
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'pause');
    expect((await view(page)).seats).toBe(1); // the pause menu: one seat
    expect(errors).toEqual([]);
  });
});
