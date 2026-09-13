/**
 * The M1 gameplay smoke (plan M1-19) in headless Chromium, on the dev / test builds `pnpm test:e2e`
 * makes (`build:test` — `__SHMUP_DEV__` on, so `window.__shmupDebug` exists): for the web build
 * (served by `vite preview`) and the Tizen `dist/` opened from disk via `file://`, **title → OK →
 * hold the arrows for 5 s → the game scene is active** (`window.__shmupDebug.sceneId === 'game'`,
 * the World ticked, the ship alive or flying in again) **→ no console errors**. Then the debug tools
 * themselves: on the web F1 shows the overlay and F2 turns god mode on; on the TV build nothing
 * works until the remote's Pause, Ch+, Ch+, Ch+ unlocks the tools and shows the overlay, and the
 * number keys then run the commands.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

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
 * Presses a key for a few frames, then releases it (remote profiles debounce releases).
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
 * Dispatches a remote key the desktop keyboard does not have (Play/Pause 10252, Ch+ 427), down
 * then up.
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
  await waitFrames(page, 2);
  await send('keyup');
  await waitFrames(page, 2);
}

/**
 * The smoke itself: title → OK (twice: past `PRESS OK`, then START) → hold the arrows for 5 s →
 * the game scene is active, the World ticked, no console errors.
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
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
  await expect.poll(async () => (await debugState(page))?.sceneId).toBe('title');
  await waitFrames(page, 10);
  await tap(page, 'Enter'); // OK: past PRESS OK
  await tap(page, 'Enter'); // OK on START
  await expect.poll(async () => (await debugState(page))?.sceneId).toBe('difficulty');
  await tap(page, 'Enter'); // OK on NORMAL
  await expect.poll(async () => (await debugState(page))?.sceneId).toBe('weaponSelect');
  await tap(page, 'Enter'); // OK on START in the weapon select (M2-03)
  await expect.poll(async () => (await debugState(page))?.sceneId).toBe('game');
  const before = await debugState(page);
  // Hold the arrows: right and up for 2.5 s each (a remote holds one at a time).
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(2500);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2500);
  await page.keyboard.up('ArrowUp');
  await waitFrames(page, 5);
  const after = await debugState(page);
  expect(after?.sceneId).toBe('game');
  expect(after?.worldTick ?? 0).toBeGreaterThan((before?.worldTick ?? 0) + 60);
  expect(['entering', 'alive', 'dying', 'dead', 'respawning']).toContain(after?.shipState);
  await expect(page.locator('#game')).toHaveAttribute('data-shmup-scene', 'game');
  return errors;
}

test.describe('M1 gameplay smoke', () => {
  test('web build: title → OK → 5 s of arrows → the game scene, no errors; F1 / F2 debug keys', async ({
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

  test('Tizen build via file://: title → OK → 5 s of arrows → the game scene, no errors; Pause, Ch+ ×3 unlocks the tools', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = await smoke(page, TIZEN_INDEX);
    // Locked until the remote sequence: the number keys and F1 do nothing.
    expect((await debugState(page))?.unlocked).toBe(false);
    await remoteTap(page, 50);
    await tap(page, 'F1');
    expect(await debugState(page)).toMatchObject({ overlay: false, godMode: false });
    await remoteTap(page, 10252); // Play/Pause: the pause menu opens
    await remoteTap(page, 427);
    await remoteTap(page, 427);
    await remoteTap(page, 427);
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
