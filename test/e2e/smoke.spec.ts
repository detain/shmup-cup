/**
 * The M1 gameplay smoke (plan M1-19) in headless Chromium, on the dev / test builds `pnpm test:e2e`
 * makes (`build:test` — `__SHMUP_DEV__` on, so `window.__shmupDebug` exists): for the web build
 * (served by `vite preview`) and the Tizen `dist/` opened from disk via `file://`, **title → OK →
 * hold the arrows for 300 World ticks (5 s at 60 ticks a second) → the game scene is active**
 * (`window.__shmupDebug.sceneId === 'game'`, the World ticked, the ship alive or flying in again)
 * **→ no console errors**. Then the debug tools themselves: on the web F1 shows the overlay and F2
 * turns god mode on; on the TV build nothing works until the remote's Pause, Ch+, Ch+, Ch+ unlocks
 * the tools and shows the overlay, and the number keys then run the commands.
 *
 * The holds count World ticks (`ticks.ts`), not wall time: a slow runner ran about 9 ticks a second,
 * so 5 s of wall time gave fewer than the 60 ticks the smoke asserts (C5 review 3). Key taps and
 * pauses count the game's ticks too, never rAF frames (C5 review 4): a runner drawing about 3
 * frames a second runs up to 4 ticks a frame. The TV unlock goes in one go (`remoteSequence`): it
 * must fit in its 3 s of host time.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { BOOT_TIMEOUT_MS, remoteSequence, remoteTap, tap, waitTicks } from './ticks.js';

/** The Tizen build's page, as a `file://` URL. */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** What the smoke reads from `window.__shmupDebug`. */
interface DebugState {
  readonly sceneId: string;
  readonly tick: number;
  readonly worldTick: number;
  readonly unlocked: boolean;
  readonly overlay: boolean;
  readonly godMode: boolean;
  readonly shipState: string;
}

/**
 * Reads the dev build's debug API.
 *
 * @param page - The page.
 * @returns The state, or `null` when the build has no `window.__shmupDebug`.
 */
function debugState(page: Page): Promise<DebugState | null> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __shmupDebug?: {
          sceneId: string;
          tick: number;
          worldTick: number;
          unlocked: boolean;
          flags: { overlay: boolean; godMode: boolean };
          game: { world: { players: Array<{ state: string }> } };
        };
      }
    ).__shmupDebug;
    if (api === undefined) return null;
    return {
      sceneId: api.sceneId,
      tick: api.tick,
      worldTick: api.worldTick,
      unlocked: api.unlocked,
      overlay: api.flags.overlay,
      godMode: api.flags.godMode,
      shipState: api.game.world.players[0].state,
    };
  });
}

/** World ticks each arrow is held: 2.5 s at 60 ticks a second. */
const HOLD_TICKS = 150;

/**
 * The smoke itself: title → OK (twice: past `PRESS OK`, then START) → hold the arrows for
 * {@link HOLD_TICKS} World ticks each → the game scene is active, the World ticked, no console
 * errors.
 *
 * @param page - The page.
 * @param url - The build's URL.
 * @returns The page's error log (checked by the caller at the end).
 */
async function smoke(page: Page, url: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().startsWith('atlas:')) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
    timeout: BOOT_TIMEOUT_MS,
  });
  await expect.poll(async () => (await debugState(page))?.sceneId).toBe('title');
  await waitTicks(page, 10);
  await tap(page, 'Enter'); // OK: past PRESS OK
  await tap(page, 'Enter'); // OK on START
  await expect.poll(async () => (await debugState(page))?.sceneId).toBe('difficulty');
  await tap(page, 'Enter'); // OK on NORMAL
  await expect.poll(async () => (await debugState(page))?.sceneId).toBe('shipSelect');
  await tap(page, 'Enter'); // KESTREL in the ship select (M2-05)
  await expect.poll(async () => (await debugState(page))?.sceneId).toBe('weaponSelect');
  await tap(page, 'Enter'); // OK on START in the weapon select (M2-03)
  await expect.poll(async () => (await debugState(page))?.sceneId).toBe('game');
  const before = await debugState(page);
  // Hold the arrows: right, then up (a remote holds one at a time).
  await page.keyboard.down('ArrowRight');
  await waitTicks(page, HOLD_TICKS, 'worldTick');
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowUp');
  await waitTicks(page, HOLD_TICKS, 'worldTick');
  await page.keyboard.up('ArrowUp');
  await waitTicks(page, 5);
  const after = await debugState(page);
  expect(after?.sceneId).toBe('game');
  expect(after?.worldTick ?? 0).toBeGreaterThan((before?.worldTick ?? 0) + 60);
  expect(['entering', 'alive', 'dying', 'dead', 'respawning']).toContain(after?.shipState);
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-scene', 'game');
  return errors;
}

test.describe('M1 gameplay smoke', () => {
  test('web build: title → OK → 300 ticks of arrows → the game scene, no errors; F1 / F2 debug keys', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = await smoke(page, './');
    expect((await debugState(page))?.unlocked).toBe(true);
    await tap(page, 'F1');
    await tap(page, 'F2');
    const state = await debugState(page);
    expect([state?.overlay, state?.godMode]).toEqual([true, true]);
    expect(errors).toEqual([]);
  });

  test('Tizen build via file://: title → OK → 300 ticks of arrows → the game scene, no errors; Pause, Ch+ ×3 unlocks the tools', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = await smoke(page, TIZEN_INDEX);
    // Locked until the remote sequence: the number keys and F1 do nothing.
    expect((await debugState(page))?.unlocked).toBe(false);
    await remoteTap(page, 50);
    await tap(page, 'F1');
    expect(await debugState(page)).toMatchObject({ overlay: false, godMode: false });
    // Play/Pause (the pause menu opens), Ch+ ×3, in one go: the unlock's 3 s of host time.
    await remoteSequence(page, [10252, 427, 427, 427]);
    expect(await debugState(page)).toMatchObject({
      unlocked: true,
      overlay: true,
      sceneId: 'pause',
    });
    await remoteTap(page, 50); // 2 = god mode
    expect((await debugState(page))?.godMode).toBe(true);
    expect(errors).toEqual([]);
  });
});
