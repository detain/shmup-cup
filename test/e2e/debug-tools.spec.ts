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
 *
 * `startGame`'s menu taps and its pause count the game's ticks (`ticks.ts`), never rAF frames: a
 * slow runner draws fewer frames a second and catches up by up to 4 ticks a frame, so a count of
 * frames is a different number of ticks on every machine (C5 review 4). The debug keys stay
 * frame-paced (`debugTap`, `debugRemoteTap`): the tools act on the keydown and must work
 * under the freeze, when no tick runs. So do the waits that check the freeze holds: no tick runs
 * there either.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { WORLD_SCALE } from '../../scripts/frame.mjs';
import { freezeSim, stepTo } from './frame-advance.js';
import { BOOT_TIMEOUT_MS, remoteSequence, tap, waitTicks } from './ticks.js';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/**
 * Zone A's checkpoints and the x of its WARNING event, read from
 * `content/stages/zone-a.stage.json` (R2-03's re-measure: the file carries the ported numbers —
 * the spec derives them from the content, never from v1 literals). `skipLead` mirrors
 * `core/debug` `BOSS_SKIP_LEAD` = 96 px at the world's scale, the lead `skipToBoss` keeps.
 */
const ZONE_A = (() => {
  const stage = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../content/stages/zone-a.stage.json', import.meta.url)),
      'utf8',
    ),
  ) as { checkpoints: Array<{ x: number }>; events: Array<{ x: number; type: string }> };
  const warning = stage.events
    .filter((event) => event.type === 'warning' || event.type === 'boss')
    .pop();
  if (warning === undefined) throw new Error('zone-a has no warning/boss event');
  return {
    checkpoints: stage.checkpoints.map((checkpoint) => checkpoint.x),
    warningX: warning.x,
    skipLead: 96 * WORLD_SCALE,
  };
})();

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
 * @remarks
 * Frames, not ticks: every pause made with it directly runs while the sim is frozen (F4, the
 * remote's 4, `freezeSim`), where no tick runs — the check is that none does. The debug taps
 * hold with it too, which must work under the freeze as well (`debugTap`).
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
 * Presses a debug key (F2–F8) for a few frames, then releases it (no auto-repeat).
 *
 * @remarks
 * Frames, not ticks: the debug tools act on the keydown (`shell/debug` `onKeyDown`) and these keys
 * must work under the freeze, when no tick runs — a tick-paced tap would never end there.
 *
 * @param page - The page.
 * @param key - Playwright key name.
 */
async function debugTap(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  await waitFrames(page, 3);
  await page.keyboard.up(key);
  await waitFrames(page, 3);
}

/**
 * Dispatches a remote debug key by key code (4, 5: keys the desktop keyboard lacks), down then up.
 *
 * @remarks
 * Frames, not ticks, like `debugTap`: 4 and 5 act on the keydown and 5 must work under the
 * freeze. The locked 4 is a negative check too: a tick-paced tap would hang there instead of
 * failing if 4 froze the sim.
 *
 * @param page - The page.
 * @param keyCode - The legacy key code.
 */
async function debugRemoteTap(page: Page, keyCode: number): Promise<void> {
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
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
    timeout: BOOT_TIMEOUT_MS,
  });
  await expect.poll(async () => (await view(page)).sceneId).toBe('title');
  await waitTicks(page, 10);
  await tap(page, 'Enter');
  await tap(page, 'Enter'); // START
  await expect.poll(async () => (await view(page)).sceneId).toBe('difficulty');
  await tap(page, 'Enter'); // NORMAL
  await expect.poll(async () => (await view(page)).sceneId).toBe('shipSelect');
  await tap(page, 'Enter'); // KESTREL in the ship select (M2-05)
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
    await debugTap(page, 'F2'); // god mode: nothing ends the run while the spec looks around
    await debugTap(page, 'F4');
    const frozen = await view(page);
    expect(frozen.flags.frameAdvance).toBe(true);
    await waitFrames(page, 30);
    expect((await view(page)).worldTick).toBe(frozen.worldTick);

    // Each F5 press: exactly one tick (no auto-repeat, whatever the frame rate).
    for (let i = 1; i <= 3; i++) {
      await debugTap(page, 'F5');
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
    await debugTap(page, 'F7');
    const jumped = await view(page);
    expect(jumped.checkpoint).toBe(before.checkpoint + 1);
    // The camera lands at the content's own x's (ZONE_A above, read from the ported stage file);
    // R2-03 re-measured these on the ported world.
    expect(jumped.cameraX).toBe(ZONE_A.checkpoints[jumped.checkpoint]);
    expect(jumped.worldTick).toBe(before.worldTick); // a jump is not a tick
    await debugTap(page, 'F8');
    const skipped = await view(page);
    expect(skipped.cameraX).toBe(ZONE_A.warningX - ZONE_A.skipLead);
    expect(skipped.cameraX).toBeGreaterThan(jumped.cameraX);
    expect(skipped.status).toBe('playing');

    // F3 cycles the outlines, F6 the slow motion.
    await debugTap(page, 'F3');
    expect((await view(page)).flags).toMatchObject({ showHitboxes: true, showGrid: false });
    await debugTap(page, 'F3');
    expect((await view(page)).flags).toMatchObject({ showHitboxes: true, showGrid: true });
    await debugTap(page, 'F6');
    expect((await view(page)).flags.slowMo).toBe(2);
    await debugTap(page, 'F6');
    await debugTap(page, 'F6');
    expect((await view(page)).flags.slowMo).toBe(1);

    // F4 again: the game runs on.
    await debugTap(page, 'F4');
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
    await debugRemoteTap(page, 52);
    expect((await view(page)).flags.frameAdvance).toBe(false);
    await remoteSequence(page, [10252, 427, 427, 427]); // Pause, Ch+ ×3: the unlock
    await debugRemoteTap(page, 52); // 4 = frame advance
    const frozen = await view(page);
    expect(frozen.flags.frameAdvance).toBe(true);
    await waitFrames(page, 20);
    expect((await view(page)).tick).toBe(frozen.tick);
    await debugRemoteTap(page, 53); // 5 = step
    await expect.poll(async () => (await view(page)).tick).toBe(frozen.tick + 1);
    await debugRemoteTap(page, 53);
    await expect.poll(async () => (await view(page)).tick).toBe(frozen.tick + 2);
    await waitFrames(page, 10);
    expect((await view(page)).tick).toBe(frozen.tick + 2);
    expect(errors).toEqual([]);
  });

  test('freezeSim holds a freshly booted page; stepTo then runs exact ticks', async ({ page }) => {
    await page.goto('./?scene=flight&stage=test-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await freezeSim(page);
    await waitFrames(page, 20);
    const held = await view(page);
    expect(held.flags.frameAdvance).toBe(true);
    await waitFrames(page, 20);
    expect((await view(page)).worldTick).toBe(held.worldTick);
    expect(await stepTo(page, held.worldTick + 7)).toBe(held.worldTick + 7);
  });
});
