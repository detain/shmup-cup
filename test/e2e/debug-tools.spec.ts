/**
 * The M1-19 debug tools in headless Chromium, on the test builds `pnpm test:e2e` makes
 * (`build:test` — `__SHMUP_DEV__` on):
 *
 * - **web build:** after START (zone A), F4 freezes the sim — the World does not tick however many
 *   frames pass — each F5 press runs exactly one tick, `game.requestStep(n)` exactly n (what the
 *   `frame-advance.ts` helpers of the other specs rely on, the fix for the flaky scroll checks),
 *   F7 jumps to the next checkpoint and F8 to just before HALCYON BULWARK's WARNING (the camera at
 *   the expected x), F3 / F6 cycle the outlines and slow motion, F4 again unfreezes; no console
 *   errors;
 * - **Tizen build via `file://`:** once Pause, Ch+, Ch+, Ch+ unlocked the tools, the remote's 4
 *   freezes the sim and each 5 runs exactly one tick;
 * - **the `frame-advance.ts` helpers** (regression cover for the M1-19 review fix): `freezeSim`
 *   holds a freshly booted dev scene however many frames pass, and `stepTo` then reaches the exact
 *   tick asked for.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { freezeSim, stepTo } from './frame-advance.js';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** Zone A's checkpoints and the x of its WARNING event (content/stages/zone-a.stage.json). */
const ZONE_A = { checkpoints: [0, 3500, 6000], warningX: 8600, skipLead: 96 } as const;

/** What the spec reads from `window.__shmupDebug`. */
interface DebugView {
  readonly sceneId: string;
  readonly tick: number;
  readonly worldTick: number;
  readonly cameraX: number;
  readonly checkpoint: number;
  readonly status: string;
  readonly flags: {
    readonly frameAdvance: boolean;
    readonly slowMo: number;
    readonly showHitboxes: boolean;
    readonly showGrid: boolean;
    readonly godMode: boolean;
  };
}

/**
 * Reads the debug API (and a few World fields through its `game`).
 *
 * @param page - The page.
 * @returns The view.
 */
function view(page: Page): Promise<DebugView> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __shmupDebug: {
          sceneId: string;
          tick: number;
          worldTick: number;
          flags: DebugView['flags'];
          game: {
            world: { camera: { x: number }; status: string; stage: { checkpoint: number } | null };
          };
        };
      }
    ).__shmupDebug;
    const world = api.game.world;
    const { frameAdvance, slowMo, showHitboxes, showGrid, godMode } = api.flags;
    return {
      sceneId: api.sceneId,
      tick: api.tick,
      worldTick: api.worldTick,
      cameraX: world.camera.x,
      checkpoint: world.stage === null ? -2 : world.stage.checkpoint,
      status: world.status,
      flags: { frameAdvance, slowMo, showHitboxes, showGrid, godMode },
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
    (count) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const next = (): void => {
          seen++;
          if (seen >= count) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    frames,
  );
}

/**
 * Presses a key for a few frames, then releases it (no auto-repeat).
 *
 * @param page - The page.
 * @param key - Playwright key name.
 */
async function tap(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  await waitFrames(page, 3);
  await page.keyboard.up(key);
  await waitFrames(page, 3);
}

/**
 * Dispatches a remote key by key code (keys the desktop keyboard lacks), down then up.
 *
 * @param page - The page.
 * @param keyCode - The legacy key code.
 */
async function remoteTap(page: Page, keyCode: number): Promise<void> {
  for (const type of ['keydown', 'keyup']) {
    await page.evaluate(
      ([eventType, code]) => {
        const event = new KeyboardEvent(eventType, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'keyCode', { get: () => code });
        window.dispatchEvent(event);
      },
      [type, keyCode] as const,
    );
    await waitFrames(page, 3);
  }
}

/**
 * Boots a build, collects its errors and starts zone A (OK past PRESS OK, OK on START).
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
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
  await expect.poll(async () => (await view(page)).sceneId).toBe('title');
  await waitFrames(page, 10);
  await tap(page, 'Enter');
  await tap(page, 'Enter'); // START
  await expect.poll(async () => (await view(page)).sceneId).toBe('difficulty');
  await tap(page, 'Enter'); // NORMAL
  await expect.poll(async () => (await view(page)).sceneId).toBe('weaponSelect');
  await tap(page, 'Enter'); // START in the weapon select (M2-03)
  await expect.poll(async () => (await view(page)).sceneId).toBe('game');
  return errors;
}

test.describe('debug tools (M1-19)', () => {
  test('web build: F4 freezes, F5 steps one tick, F7 / F8 jump the stage, F3 / F6 cycle', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = await startGame(page, './');
    await tap(page, 'F2'); // god mode: nothing ends the run while the spec looks around
    await tap(page, 'F4');
    const frozen = await view(page);
    expect(frozen.flags.frameAdvance).toBe(true);
    await waitFrames(page, 30);
    expect((await view(page)).worldTick).toBe(frozen.worldTick);

    // Each F5 press: exactly one tick (no auto-repeat, whatever the frame rate).
    for (let i = 1; i <= 3; i++) {
      await tap(page, 'F5');
      await expect.poll(async () => (await view(page)).worldTick).toBe(frozen.worldTick + i);
    }
    await waitFrames(page, 10);
    expect((await view(page)).worldTick).toBe(frozen.worldTick + 3);

    // The helpers the other specs use: exact tick counts through game.requestStep.
    expect(await stepTo(page, frozen.worldTick + 45)).toBe(frozen.worldTick + 45);
    await waitFrames(page, 10);
    expect((await view(page)).worldTick).toBe(frozen.worldTick + 45);

    // F7: the next checkpoint (the camera at its x); F8: just before the WARNING.
    const before = await view(page);
    await tap(page, 'F7');
    const jumped = await view(page);
    expect(jumped.checkpoint).toBe(before.checkpoint + 1);
    expect(jumped.cameraX).toBe(ZONE_A.checkpoints[jumped.checkpoint]);
    expect(jumped.worldTick).toBe(before.worldTick); // a jump is not a tick
    await tap(page, 'F8');
    const skipped = await view(page);
    expect(skipped.cameraX).toBe(ZONE_A.warningX - ZONE_A.skipLead);
    expect(skipped.status).toBe('playing');

    // F3 cycles the outlines, F6 the slow motion.
    await tap(page, 'F3');
    expect((await view(page)).flags).toMatchObject({ showHitboxes: true, showGrid: false });
    await tap(page, 'F3');
    expect((await view(page)).flags).toMatchObject({ showHitboxes: true, showGrid: true });
    await tap(page, 'F6');
    expect((await view(page)).flags.slowMo).toBe(2);
    await tap(page, 'F6');
    await tap(page, 'F6');
    expect((await view(page)).flags.slowMo).toBe(1);

    // F4 again: the game runs on.
    await tap(page, 'F4');
    const running = await view(page);
    expect(running.flags.frameAdvance).toBe(false);
    await expect.poll(async () => (await view(page)).worldTick).toBeGreaterThan(running.worldTick);
    expect(errors).toEqual([]);
  });

  test('Tizen build via file://: after the unlock, 4 freezes and each 5 runs one tick', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = await startGame(page, TIZEN_INDEX);
    // Locked: 4 does nothing.
    await remoteTap(page, 52);
    expect((await view(page)).flags.frameAdvance).toBe(false);
    for (const keyCode of [10252, 427, 427, 427]) await remoteTap(page, keyCode);
    await remoteTap(page, 52); // 4 = frame advance
    const frozen = await view(page);
    expect(frozen.flags.frameAdvance).toBe(true);
    await waitFrames(page, 20);
    expect((await view(page)).tick).toBe(frozen.tick);
    await remoteTap(page, 53); // 5 = step
    await expect.poll(async () => (await view(page)).tick).toBe(frozen.tick + 1);
    await remoteTap(page, 53);
    await expect.poll(async () => (await view(page)).tick).toBe(frozen.tick + 2);
    await waitFrames(page, 10);
    expect((await view(page)).tick).toBe(frozen.tick + 2);
    expect(errors).toEqual([]);
  });

  test('freezeSim holds a freshly booted page; stepTo then runs exact ticks', async ({ page }) => {
    await page.goto('./?scene=flight&stage=test-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await freezeSim(page);
    await waitFrames(page, 20);
    const held = await view(page);
    expect(held.flags.frameAdvance).toBe(true);
    await waitFrames(page, 20);
    expect((await view(page)).worldTick).toBe(held.worldTick);
    expect(await stepTo(page, held.worldTick + 7)).toBe(held.worldTick + 7);
  });
});
