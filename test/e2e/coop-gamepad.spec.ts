/**
 * Browser test of two-player co-op with a gamepad (plan M2-06 — "remote / keyboard → P1, pads →
 * P2 by default") in headless Chromium, on the web test build with the default keyboard profile.
 * `navigator.getGamepads()` is replaced before the app boots by a fake standard-mapping pad the
 * spec presses (`window.__fakePads`), so the real input adapter, the shell's seat forwarding
 * (`Game.inputSeats` → `WebInput.setSeats`) and the scene flow run end to end:
 *
 * - with one seat (the title's menus) the pad drives player 1: its A passes `PRESS OK` and its
 *   D-pad picks `2 PLAYERS`;
 * - in the co-op game the pad's START takes player 2's seat and drops player 2 in without pausing;
 * - then the pad's D-pad moves player 2 only and the keyboard's arrows player 1 only;
 * - the pad's START now pauses (player 2 plays) and the pause menu, which routes one seat, stays
 *   open (the held START is no second press on player 1's slot); START there resumes and the game
 *   does not pause again; no console errors.
 */
import { expect, test, type Page } from '@playwright/test';

/** What the spec reads through `window.__shmupDebug`. */
interface PadCoopView {
  readonly sceneId: string;
  readonly coop: boolean;
  readonly seats: number;
  readonly p2Active: boolean;
  readonly p2State: string;
  /** Each ship's x relative to the view. */
  readonly screenX: readonly [number, number];
}

/**
 * Reads the scene, the World's co-op state and both ships' positions on screen.
 *
 * @param page - The page.
 * @returns The view.
 */
function view(page: Page): Promise<PadCoopView> {
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
          };
        };
      }
    ).__shmupDebug;
    const world = api.game.world;
    const [p1, p2] = world.players;
    return {
      sceneId: api.sceneId,
      coop: world.config.coop,
      seats: api.game.inputSeats,
      p2Active: p2.active,
      p2State: p2.state,
      screenX: [p1.x - world.camera.x, p2.x - world.camera.x] as [number, number],
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
 * Sets the fake pad's pressed buttons (standard mapping: 0 = A, 9 = START, 12–15 = D-pad).
 *
 * @param page - The page.
 * @param pressed - Button indices held down.
 */
function padButtons(page: Page, pressed: number[]): Promise<void> {
  return page.evaluate((down) => {
    (window as unknown as { __fakePads: { set(buttons: number[]): void } }).__fakePads.set(down);
  }, pressed);
}

/**
 * Presses a pad button for a few frames and lets the game see the release.
 *
 * @param page - The page.
 * @param button - Button index.
 */
async function padTap(page: Page, button: number): Promise<void> {
  await padButtons(page, [button]);
  await waitFrames(page, 3);
  await padButtons(page, []);
  await waitFrames(page, 6);
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

test.describe('two-player co-op (web build, keyboard + gamepad)', () => {
  test('the pad drives the menus, takes player 2`s seat with START, then moves player 2', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      /** One standard-mapping pad in slot 0, the other slots empty (like Chromium's list). */
      const buttons: Array<{ pressed: boolean; touched: boolean; value: number }> = [];
      for (let i = 0; i < 17; i++) buttons.push({ pressed: false, touched: false, value: 0 });
      const pad = {
        id: 'Fake pad (STANDARD GAMEPAD)',
        index: 0,
        connected: true,
        mapping: 'standard',
        timestamp: 0,
        axes: [0, 0, 0, 0],
        buttons,
      };
      (window as unknown as { __fakePads: unknown }).__fakePads = {
        set(down: number[]): void {
          for (let i = 0; i < buttons.length; i++) {
            const on = down.indexOf(i) >= 0;
            buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 };
          }
          pad.timestamp++;
        },
      };
      Object.defineProperty(Navigator.prototype, 'getGamepads', {
        configurable: true,
        value: () => [pad, null, null, null],
      });
    });
    await page.goto('./');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitFrames(page, 10);
    expect((await view(page)).seats).toBe(1);

    await padTap(page, 0); // PRESS OK with the pad's A (one seat: the pad is player 1's)
    await padTap(page, 13); // D-pad down: 2 PLAYERS
    await tap(page, 'Enter');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
    await waitFrames(page, 4);
    await tap(page, 'Enter'); // NORMAL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
    await waitFrames(page, 4);
    await tap(page, 'Enter'); // KESTREL
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
    await waitFrames(page, 4);
    await tap(page, 'Enter'); // START
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    let game = await view(page);
    expect([game.coop, game.seats, game.p2Active]).toEqual([true, 2, false]);

    await padTap(page, 9); // the pad's START: player 2's seat and its join, no pause
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await expect.poll(async () => (await view(page)).p2State, { timeout: 10_000 }).toBe('alive');
    await expect.poll(async () => (await view(page)).screenX[0] > 0).toBe(true);
    await waitFrames(page, 10);

    // The pad's D-pad moves player 2 only.
    game = await view(page);
    await padButtons(page, [15]);
    await waitFrames(page, 20);
    await padButtons(page, []);
    let after = await view(page);
    expect(after.screenX[1]).toBeGreaterThan(game.screenX[1] + 10);
    expect(Math.abs(after.screenX[0] - game.screenX[0])).toBeLessThan(2);

    // The keyboard's arrows move player 1 only.
    game = after;
    await page.keyboard.down('ArrowRight');
    await waitFrames(page, 20);
    await page.keyboard.up('ArrowRight');
    after = await view(page);
    expect(after.screenX[0]).toBeGreaterThan(game.screenX[0] + 10);
    expect(Math.abs(after.screenX[1] - game.screenX[1])).toBeLessThan(2);

    // Player 2 plays now: its START pauses — and the pause menu (one seat, the pad back on player
    // 1's slot) must not take the still-held START as a second press that resumes at once.
    await padTap(page, 9);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'pause');
    await waitFrames(page, 20);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'pause');
    expect((await view(page)).seats).toBe(1);
    // The pad's START in the pause menu resumes; back in the game (two seats) it does not pause
    // again.
    await padTap(page, 9);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await waitFrames(page, 20);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    expect((await view(page)).seats).toBe(2);
    expect(errors).toEqual([]);
  });
});
