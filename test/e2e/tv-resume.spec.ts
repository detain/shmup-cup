/**
 * The TV-resume kill cycle (R2 TL-2), on the Tizen build over `file://` with the release-check
 * probe (stand-in `window.tizen`, controllable `document.visibilityState`):
 *
 * - the Samsung M7 kills the app when the source changes; the documented hook is the
 *   `visibilitychange` to hidden — which the game uses to write the run checkpoint;
 * - after the kill (here: a reload, the localStorage surviving like the TV's does), the title
 *   offers CONTINUE? and starting it resumes the run at the last passed checkpoint under the
 *   game's own continue rule (lives, power, the score's continue digit);
 * - a record written by another build is stale: no row, and the key is cleared on load.
 *
 * The game's ticks pace everything (ticks.ts): taps and waits count `__shmupDebug.tick`. The
 * ship flies with god mode on (the campaign-run spec's trick) so the un-input play that fills
 * these ticks cannot end the run mid-test.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { BOOT_TIMEOUT_MS, tap, waitTicks } from './ticks.js';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** The checkpoint's storage key (the shell's prefix + `core/replay` `RUN_CHECKPOINT_STORAGE_KEY`). */
const CHECKPOINT_KEY = 'shmup-cup:run.checkpoint.v1';

/** What `window.__shmupDebug` answers here. */
interface DebugWindow {
  __shmupDebug: {
    tick: number;
    worldTick: number;
    buildId: string;
    flags: { godMode: boolean };
    game: {
      scenes: {
        checkpointAvailable: boolean;
        world: { continuesUsed: number } | null;
        title: { menu: { items: { label: string }[]; focus: number } };
      } | null;
    };
  };
}

/**
 * Reads the debug view the spec asserts on.
 *
 * @param page - The page.
 * @returns The checkpoint verdict, the title's rows, and the live World's continues.
 */
function resumeState(page: Page): Promise<{
  available: boolean;
  rows: string[];
  focus: number;
  continuesUsed: number;
  worldTick: number;
}> {
  return page.evaluate(() => {
    const api = (window as unknown as DebugWindow).__shmupDebug;
    const flow = api.game.scenes;
    if (flow === null) throw new Error('no scene flow');
    return {
      available: flow.checkpointAvailable,
      rows: flow.title.menu.items.map((item) => item.label),
      focus: flow.title.menu.focus,
      continuesUsed: flow.world === null ? -1 : flow.world.continuesUsed,
      worldTick: api.worldTick,
    };
  });
}

/**
 * Reads the raw checkpoint text (`null` when the key holds nothing).
 *
 * @param page - The page.
 * @returns The stored text, or `null`.
 */
function checkpointText(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), CHECKPOINT_KEY);
}

/**
 * Flips `document.visibilityState` / `hidden` and fires `visibilitychange` — the source switch's
 * hook the Samsung docs name (the page's own visibility stays real, so rAF and the wall clock
 * keep running while the game's loop suspends exactly as on the TV).
 *
 * @param page - The page.
 */
async function goHidden(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/**
 * Waits out a storage write in wall time: the game loop is suspended while hidden, so no tick
 * counter may be waited on there.
 *
 * @param page - The page.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
}

/**
 * Starts a one-player game on the Tizen build (PRESS OK → 1 PLAYER → the three arming screens).
 *
 * @param page - The page.
 */
async function startGame(page: Page): Promise<void> {
  const canvas = page.locator('#game');
  await tap(page, 'Enter'); // PRESS OK → the menu, 1 PLAYER focused
  await tap(page, 'Enter'); // 1 PLAYER → the difficulty
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
  await tap(page, 'Enter');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'shipSelect');
  await tap(page, 'Enter');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'weaponSelect');
  await tap(page, 'Enter');
  await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
}

test.describe('TV resume: the kill cycle (R2 TL-2)', () => {
  test('hidden writes the checkpoint; reload offers CONTINUE? and resumes the run', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      const w = window as unknown as { tizen?: unknown };
      w.tizen = {
        tvinputdevice: {
          registerKey: () => {},
          registerKeyBatch: (_keys: string[], onSuccess?: () => void) => onSuccess?.(),
        },
        application: { getCurrentApplication: () => ({ exit: () => {} }) },
      };
    });
    await page.goto(TIZEN_INDEX);
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title', { timeout: BOOT_TIMEOUT_MS });
    await waitTicks(page, 10);
    expect((await resumeState(page)).available).toBe(false); // a fresh TV holds nothing

    await startGame(page);
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.flags.godMode = true;
    });
    await waitTicks(page, 320); // play past the first checkpoint of the opening zone
    const killedTick = (await resumeState(page)).worldTick;
    expect(killedTick).toBeGreaterThan(250);

    // The kill: the page goes hidden — the game flushes the record before the loop freezes.
    // (The loop suspends with it, so the waits that follow are wall-clock settles, not ticks.)
    await goHidden(page);
    await settle(page);
    const text = await checkpointText(page);
    expect(text, 'the hidden page wrote the checkpoint').not.toBeNull();
    const record = JSON.parse(text ?? '{}') as {
      kind: string;
      buildId: string;
      savedTick: number;
      checkpointPassed: number;
      tail: unknown;
    };
    expect(record.kind).toBe('run.checkpoint');
    expect(record.buildId).not.toBe('');
    expect(record.savedTick).toBeGreaterThan(0);
    expect(record.checkpointPassed).toBeGreaterThanOrEqual(0);
    expect(record.tail, 'the tail rides within the cap on the opening zone').not.toBeNull();

    // The reload is the kill and the relaunch: localStorage survives, the title reads the record.
    await page.goto(TIZEN_INDEX);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title', { timeout: BOOT_TIMEOUT_MS });
    await waitTicks(page, 10);
    const offered = await resumeState(page);
    expect(offered.available).toBe(true);
    expect(offered.rows[0]).toBe('CONTINUE?');

    await tap(page, 'Enter'); // PRESS OK → the menu, CONTINUE? focused first
    expect((await resumeState(page)).focus).toBe(0);
    await tap(page, 'Enter'); // CONTINUE? → the resumed game, no arming screens
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'game');
    await waitTicks(page, 10);
    const resumed = await resumeState(page);
    // R1 (TL-2): the World is a fresh birth at the last passed checkpoint (TL-4 tightens this to
    // the exact tick when the tail rewinds clean).
    expect(resumed.worldTick).toBeLessThan(60);
    expect(resumed.continuesUsed).toBe(1); // the resume spent the game's own continue rule

    // The record was consumed — and the live game immediately re-anchored a fresh one.
    const fresh = await checkpointText(page);
    expect(fresh, 'the resumed run keeps its own checkpoint').not.toBeNull();
    const freshRecord = JSON.parse(fresh ?? '{}') as { savedTick: number };
    expect(freshRecord.savedTick).toBeLessThanOrEqual(20);
  });

  test('a record from another build shows no row and clears at load', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(TIZEN_INDEX);
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title', { timeout: BOOT_TIMEOUT_MS });
    await startGame(page);
    await page.evaluate(() => {
      (window as unknown as DebugWindow).__shmupDebug.flags.godMode = true;
    });
    await waitTicks(page, 60);
    await goHidden(page);
    await settle(page);
    const text = await checkpointText(page);
    expect(text).not.toBeNull();
    // The TV relaunches onto an updated channel: the record's build id is from another build.
    await page.evaluate((key: string) => {
      const raw = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
      raw.buildId = 'build-from-yesterday';
      localStorage.setItem(key, JSON.stringify(raw));
    }, CHECKPOINT_KEY);

    await page.goto(TIZEN_INDEX);
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title', { timeout: BOOT_TIMEOUT_MS });
    await waitTicks(page, 10);
    const state = await resumeState(page);
    expect(state.available).toBe(false);
    expect(state.rows[0], 'no CONTINUE? row — the record was stale').not.toBe('CONTINUE?');
    // The store clears through the storage adapter, which writes the library's empty-slot value
    // (the replay library's own convention: `''` is nothing, and the classifier reads it `none`).
    expect(await checkpointText(page), 'the stale key was cleared').toBe('');
  });
});
