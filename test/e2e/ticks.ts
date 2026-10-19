/**
 * Tick-counted waits for the browser tests (plan_resolution.md R2-01, C5 reviews 2 and 3).
 *
 * The game runs a fixed-step loop: a slow runner draws fewer frames a second, and the loop then
 * catches up by up to 4 ticks a frame (core `config` `maxTicksPerFrame`). So a count of rAF frames
 * or a wall-clock timeout is a different number of game ticks on every machine. With two
 * SwiftShader browsers on 2 CPUs the game ran about 9 ticks a second at 640×360. A spec that
 * waits for something the game does after some ticks therefore counts the game's ticks (the test
 * builds' `window.__shmupDebug.tick`):
 *
 * - a scene that opens after a delay or a lock: {@link expectScene}, with the delay's mirror below
 *   plus {@link SCENE_SLACK_TICKS};
 * - any other state the game reaches after some ticks: {@link pollTicks};
 * - a pause, a key held for a while: {@link waitTicks};
 * - a key press: {@link tap}, {@link remoteTap}.
 *
 * Waits for wall-clock work stay wall time, because what they wait for is not ticks:
 *
 * - the boot ({@link BOOT_TIMEOUT_MS});
 * - other work the page or the test does in real time: audio rendered and started, a screenshot
 *   captured and decoded, a console line logged;
 * - a key sequence the host times in milliseconds: the TV unlock, which {@link remoteSequence}
 *   sends in one go.
 *
 * The tests' own timeouts are wall time too, sized for a slow runner.
 *
 * **The game must be running.** A frozen sim (the debug tools' frame advance) runs no ticks, so a
 * tick wait would never end. A spec that freezes the sim steps it with `frame-advance.ts` instead.
 * A wait stays in rAF frames only where no tick runs (a frozen sim, a hidden page), where a tick
 * wait would hang instead of failing (before a "ticks advance" check), or where it waits for drawn
 * frames (a renderer re-fit, a picture); the spec's docblock says why.
 *
 * **The delays are core's.** The specs cannot import `@shmup/core` (see `frame-pixels.ts`), so the
 * delays below are pinned mirrors of core's scene-flow constants, like `save-format.ts`, and of
 * the ships' fly-in (`content/player/*.player.json`).
 * `test/integration/e2e-ticks.test.ts` fails when one moves in core or the content and its copy
 * here does not.
 *
 * This module imports nothing at run time (only Playwright's `Page` type), so that pin test can
 * load it in Node.
 *
 * @example
 * ```ts
 * import { STAGE_CLEAR_DELAY_TICKS, SCENE_SLACK_TICKS, expectScene, tap } from './ticks.js';
 * await page.evaluate(() => { window.__shmupDebug.game.world.status = 'stageClear'; });
 * await expectScene(page, 'stageClear', STAGE_CLEAR_DELAY_TICKS + SCENE_SLACK_TICKS);
 * await tap(page, 'Enter'); // skip the tally
 * ```
 *
 * @module
 */
import type { Page } from '@playwright/test';

/**
 * Ticks the game runs on after `stageClear` before the stage-clear screen opens, a campaign zone's
 * tally (core `scenes` `STAGE_CLEAR_DELAY_TICKS`).
 */
export const STAGE_CLEAR_DELAY_TICKS = 90;

/**
 * Ticks the game runs on after `gameOver` before the continue countdown, or the game-over screen
 * without continues, opens (core `scenes` `GAME_OVER_DELAY_TICKS`).
 */
export const GAME_OVER_DELAY_TICKS = 30;

/** Ticks between the zone map's OK and the next zone (core `scenes` `MAP_LAUNCH_TICKS`). */
export const MAP_LAUNCH_TICKS = 60;

/**
 * Ticks between a hidden bonus entrance opening and the players in the bonus stage (core `scenes`
 * `BONUS_WARP_TICKS`).
 */
export const BONUS_WARP_TICKS = 40;

/** Ticks the ending and its result card ignore OK (core `scenes` `ENDING_LOCK_TICKS`). */
export const ENDING_LOCK_TICKS = 60;

/** Ticks the credits ignore OK and Back (core `scenes` `CREDITS_LOCK_TICKS`). */
export const CREDITS_LOCK_TICKS = 60;

/**
 * Ticks the hi-score table after a game ignores OK and Back (core `scenes`
 * `HI_SCORE_LOCK_TICKS`).
 */
export const HI_SCORE_LOCK_TICKS = 30;

/** Ticks Pause must be held to leave the input test (core `scenes` `INPUT_TEST_EXIT_TICKS`). */
export const INPUT_TEST_EXIT_TICKS = 60;

/**
 * Ticks the replay screen shows `REPLAY END` before the browser (core `scenes`
 * `REPLAY_END_TICKS`).
 */
export const REPLAY_END_TICKS = 150;

/**
 * Ticks a ship flies in before it is `alive`: at a game's start (`entering`), and after a death or
 * a co-op join (`respawning`). The content's `enterTicks`, the longest of the shipped ships in
 * `content/player/*.player.json` (40 for both today), not a core constant.
 */
export const SHIP_ENTER_TICKS = 40;

/**
 * Ticks a scene wait, or a {@link pollTicks} wait, allows on top of the game's own delay. A menu's
 * OK changes the scene on the next tick, a delayed push lands a tick after its count, and an item
 * or an enemy placed by a spec acts on the next tick; the rest is slack. The specs' own number, not
 * a mirror.
 */
export const SCENE_SLACK_TICKS = 30;

/**
 * Wall-clock time a page may take to boot: from the navigation to `data-shmup-state` `running`
 * (or the shell's `error`), or to whatever a spec waits for first instead (the title scene, the
 * determinism page's `ready`).
 *
 * @remarks
 * Booting is real work, not ticks: the atlas pages are fetched, decoded and uploaded, and the synth
 * renders the sound bank. On a loaded runner (one core per browser) it outlasted `expect`'s default
 * 5 s (C5 review 3). 30 s still leaves half of Playwright's default 60 s test timeout for the test.
 */
export const BOOT_TIMEOUT_MS = 30_000;

/** The test build's debug API, as far as these helpers read it. */
interface TickWindow {
  /** `window.__shmupDebug` (test and dev builds only). */
  readonly __shmupDebug: {
    /** Ticks the game ran: every tick of the scene flow, menus included (`Game.state.tick`). */
    readonly tick: number;
    /** Ticks the current World ran (the game scene's only). */
    readonly worldTick: number;
  };
}

/**
 * Which tick count a wait reads: `tick`, every tick of the game (menus included), or `worldTick`,
 * the current World's.
 */
export type TickClock = 'tick' | 'worldTick';

/**
 * Reads how many ticks the game has run.
 *
 * @param page - The page (a test build).
 * @param clock - Which count (default `tick`: every tick of the game).
 * @returns `__shmupDebug.tick` (or `.worldTick`).
 */
export function gameTick(page: Page, clock: TickClock = 'tick'): Promise<number> {
  return page.evaluate((name) => (window as unknown as TickWindow).__shmupDebug[name], clock);
}

/**
 * Waits until the game has run `ticks` more ticks.
 *
 * @param page - The page (a test build, its sim running).
 * @param ticks - Ticks to wait.
 * @param clock - Which count (default `tick`; `worldTick` counts only the World's ticks).
 * @returns Resolves once they ran, however many frames or seconds that takes. It has no timeout of
 *   its own: the test's timeout bounds it.
 */
export async function waitTicks(
  page: Page,
  ticks: number,
  clock: TickClock = 'tick',
): Promise<void> {
  const goal = (await gameTick(page, clock)) + ticks;
  await page.waitForFunction(
    ([name, target]) => (window as unknown as TickWindow).__shmupDebug[name] >= target,
    [clock, goal] as const,
    { timeout: 0 },
  );
}

/**
 * Waits until the canvas shows a scene (its `data-shmup-scene`), allowing it a number of game
 * ticks rather than wall time.
 *
 * @param page - The page (a test build, its sim running).
 * @param scene - The scene id.
 * @param ticks - Ticks the scene may take to show. The default, {@link SCENE_SLACK_TICKS}, suits a
 *   scene the last input opens at once.
 * @returns Resolves once the canvas shows `scene`.
 * @throws {Error} Naming the scene shown instead, once `ticks` ticks ran without `scene`.
 */
export async function expectScene(
  page: Page,
  scene: string,
  ticks = SCENE_SLACK_TICKS,
): Promise<void> {
  const last = (await gameTick(page)) + ticks;
  const handle = await page.waitForFunction(
    ([want, end]) => {
      const now = document.querySelector('#game')?.getAttribute('data-shmup-scene') ?? '';
      if (now === want) return now;
      if ((window as unknown as TickWindow).__shmupDebug.tick <= end) return false;
      return now === '' ? '(none)' : now;
    },
    [scene, last] as const,
    { timeout: 0 },
  );
  const shown = (await handle.jsonValue()) as string;
  if (shown !== scene) {
    throw new Error(
      `expected the scene "${scene}" within ${ticks} ticks, the canvas shows "${shown}"`,
    );
  }
}

/**
 * Polls a value read from the page until it equals `want`, allowing it a number of game ticks
 * rather than wall time (a frame between reads).
 *
 * @param page - The page (a test build, its sim running).
 * @param what - What the value is, for the error.
 * @param probe - Reads the value.
 * @param want - The value waited for (compared with `Object.is`).
 * @param ticks - Ticks it may take.
 * @returns Resolves once `probe` returns `want`.
 * @throws {Error} With the last value read, once `ticks` ticks ran without `want`.
 */
export async function pollTicks<T>(
  page: Page,
  what: string,
  probe: () => Promise<T>,
  want: T,
  ticks: number,
): Promise<void> {
  const last = (await gameTick(page)) + ticks;
  for (;;) {
    // The tick first: a value read after a tick past the budget is a timeout.
    const tick = await gameTick(page);
    const value = await probe();
    if (Object.is(value, want)) return;
    if (tick > last) {
      throw new Error(
        `expected ${what} to be ${String(want)} within ${ticks} ticks, read ${String(value)}`,
      );
    }
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
  }
}

/**
 * Presses a key for 3 ticks, then lets the game see the release (6 ticks).
 *
 * @param page - The page (a test build, its sim running).
 * @param key - Playwright key name.
 * @returns Resolves 6 ticks after the key-up.
 */
export async function tap(page: Page, key: string): Promise<void> {
  await page.keyboard.down(key);
  await waitTicks(page, 3);
  await page.keyboard.up(key);
  await waitTicks(page, 6);
}

/**
 * Dispatches one remote key event by its legacy key code on the window (the TV adapters read
 * `keyCode`).
 *
 * @param page - The page.
 * @param type - `keydown` or `keyup`.
 * @param keyCode - The key code.
 * @returns Resolves once the page dispatched it.
 */
function sendRemoteKey(page: Page, type: string, keyCode: number): Promise<void> {
  return page.evaluate(
    ([eventType, code]) => {
      const event = new KeyboardEvent(eventType, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'keyCode', { get: () => code });
      window.dispatchEvent(event);
    },
    [type, keyCode] as const,
  );
}

/**
 * Presses a remote key by its legacy key code for 3 ticks, then lets the game see the release
 * (6 ticks).
 *
 * @param page - The page (a test build, its sim running).
 * @param keyCode - The key code (13 OK, 10009 Back on Tizen).
 * @returns Resolves 6 ticks after the key-up.
 */
export async function remoteTap(page: Page, keyCode: number): Promise<void> {
  await sendRemoteKey(page, 'keydown', keyCode);
  await waitTicks(page, 3);
  await sendRemoteKey(page, 'keyup', keyCode);
  await waitTicks(page, 6);
}

/**
 * Dispatches several remote keys by key code in one go, each down then up with no frame in
 * between, then waits 3 ticks.
 *
 * @remarks
 * For the TV unlock (Pause, Ch+ ×3), which must fit in the shell's `DEBUG_UNLOCK_WINDOW_MS` (3 s)
 * of host time. A person's keydowns arrive at event time whatever the frame rate. Paced in frames,
 * four taps took 12–18 frames, more than 3 s on a runner drawing under 4–6 frames a second (CI
 * flakes, C5 reviews 2 and 3).
 *
 * The keys still work in one go:
 *
 * - the debug tools read the sequence from the keydown events themselves, each needing its keyup
 *   (a second keydown without one is a repeat, which does not advance the sequence);
 * - the keyboard adapter latches a key released before the next tick, so the game still sees the
 *   Pause.
 *
 * @param page - The page (a test build, its sim running).
 * @param keyCodes - The legacy key codes, in order.
 * @returns Resolves 3 ticks after the last key-up.
 */
export async function remoteSequence(page: Page, keyCodes: readonly number[]): Promise<void> {
  await page.evaluate((codes) => {
    for (const code of codes) {
      for (const type of ['keydown', 'keyup']) {
        const event = new KeyboardEvent(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'keyCode', { get: () => code });
        window.dispatchEvent(event);
      }
    }
  }, keyCodes);
  await waitTicks(page, 3);
}
