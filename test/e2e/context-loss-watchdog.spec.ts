/**
 * The context-loss watchdog (tizen_optimize.md §8.3, P0-3): a `webglcontextlost` whose
 * `webglcontextrestored` never arrives must not leave the player on an infinite black canvas.
 * The boot arms a flag in its lost listener; the frame loop counts rendered frames while it
 * stands — after ~60 (~1 s) it asks the live context once — and a still-lost one stops the loop
 * and covers the canvas with the boot error screen (the shell's existing overlay module), with
 * Back wired to `platform.exit()` wherever the platform can exit. Checked here through the
 * `WEBGL_lose_context` extension, both directions:
 *
 * - **loss without restore → screen**: the web build lands on `data-shmup-state="error"`, the
 *   boot overlay canvas appears drawn with the error-screen colours, and the sim freezes (no
 *   running game hides behind the picture any more);
 * - **loss with restore inside the grace window → no screen**: the build stays `running`, no
 *   overlay canvas ever exists, ticks advance and the title draws again (the flag cleared —
 *   `atlas-context-loss.spec.ts` keeps the deeper proof that the restored game fully recovers);
 * - **Back exits**: on the Tizen build with the counted stand-in `window.tizen` (the shape
 *   `release-check.spec.ts` installs), one remote Back (10009) on the stated screen calls the
 *   app's `exit()` exactly once.
 *
 * The waits are rAF frames and polled DOM state, not ticks: what they wait for is a rendered-
 * frame count and a screen swap — and after the swap no tick runs, so the tick helpers would
 * hang instead of failing (the law's documented exception in `ticks.ts`; `atlas-context-loss.
 * spec.ts` and `atlas-residency.spec.ts` say why the same way). The Back press rides a raw
 * remote-style `keydown` dispatch for the same reason — `remoteTap` waits ticks that never come.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePng } from '../../scripts/assets/png.mjs';
import { BOOT_TIMEOUT_MS } from './ticks.js';

/** The Tizen build's page, as a `file://` URL (the `release-check.spec.ts` shape). */
const TIZEN_INDEX = pathToFileURL(
  fileURLToPath(new URL('../../apps/tizen/dist/index.html', import.meta.url)),
).href;

/** The Tizen Back key. */
const BACK = 10009;

/** The boot error screen's background (`BOOT_SCREEN_COLORS.background`, #10173a). */
const SCREEN_BG = [0x10, 0x17, 0x3a] as const;

/** The boot error screen's title colour (#ff5aa0) — proof the screen drew, not just attached. */
const SCREEN_TITLE = [0xff, 0x5a, 0xa0] as const;

/** The title logo's bottom gradient colour (`ui/logo` #e04828, as in `atlas-context-loss`). */
const LOGO_RED = [0xe0, 0x48, 0x28] as const;

/** A decoded canvas screenshot. */
interface Shot {
  /** Width in pixels. */
  readonly width: number;
  /** RGBA pixels. */
  readonly data: Uint8Array;
}

/**
 * Screenshots a canvas element.
 *
 * @param locator - The canvas.
 * @returns The pixels.
 */
async function shoot(locator: Locator): Promise<Shot> {
  const png = await locator.screenshot();
  const { width, data } = decodePng(new Uint8Array(png));
  return { width, data };
}

/**
 * Counts the pixels within 2 of a colour.
 *
 * @param shot - The screenshot.
 * @param rgb - The colour.
 * @returns The count.
 */
function count(shot: Shot, rgb: readonly [number, number, number]): number {
  let n = 0;
  for (let i = 0; i < shot.data.length; i += 4) {
    if (
      Math.abs(shot.data[i] - rgb[0]) <= 2 &&
      Math.abs(shot.data[i + 1] - rgb[1]) <= 2 &&
      Math.abs(shot.data[i + 2] - rgb[2]) <= 2
    ) {
      n++;
    }
  }
  return n;
}

/**
 * Installs the counted stand-in `window.tizen` (key registration succeeds, `exit()` counts)
 * before the page's scripts — the `release-check.spec.ts` shape, trimmed to the exit probe.
 *
 * @param page - The page (not yet navigated).
 */
async function installTizenStandIn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { shmupExits: number; tizen?: unknown };
    w.shmupExits = 0;
    w.tizen = {
      tvinputdevice: {
        registerKey: () => {},
        registerKeyBatch: (_keys: string[], onSuccess?: () => void) => onSuccess?.(),
      },
      application: {
        getCurrentApplication: () => ({
          exit: () => {
            w.shmupExits++;
          },
        }),
      },
    };
  });
}

/**
 * Reads the stand-in's exit count.
 *
 * @param page - The page.
 * @returns Calls of the stand-in `exit()`.
 */
function exitCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { shmupExits: number }).shmupExits);
}

/**
 * Loses the game canvas's WebGL context through `WEBGL_lose_context` and leaves it lost — the
 * failure class the recovery listeners cannot see: no restore is ever asked for, so no
 * `webglcontextrestored` ever fires.
 *
 * @param page - The page, with the game canvas present.
 */
async function loseContext(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.querySelector('#game') as HTMLCanvasElement;
    // The canvas already has its context: `getContext` answers with it for the type it was
    // made with and `null` for the other (the renderer is WebGL1-first, but do not pin that).
    const gl = canvas.getContext('webgl') ?? canvas.getContext('webgl2');
    const lose = gl?.getExtension('WEBGL_lose_context');
    if (lose === null || lose === undefined) throw new Error('WEBGL_lose_context is not available');
    lose.loseContext();
  });
}

/**
 * Loses and restores the context through `WEBGL_lose_context`, resolving when
 * `webglcontextrestored` has run its listeners (the `atlas-context-loss.spec.ts` shape: the
 * restore is asked for from the lost listener, never in the same task as the loss).
 *
 * @param page - The page, with the game canvas present.
 */
async function loseAndRestore(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const canvas = document.querySelector('#game') as HTMLCanvasElement;
        const gl = canvas.getContext('webgl') ?? canvas.getContext('webgl2');
        const lose = gl?.getExtension('WEBGL_lose_context');
        if (lose === null || lose === undefined) {
          reject(new Error('WEBGL_lose_context is not available'));
          return;
        }
        const watchdog = setTimeout(
          () => reject(new Error('webglcontextrestored never fired')),
          40_000,
        );
        canvas.addEventListener(
          'webglcontextrestored',
          () => {
            clearTimeout(watchdog);
            resolve();
          },
          { once: true },
        );
        canvas.addEventListener(
          'webglcontextlost',
          () => {
            setTimeout(() => lose.restoreContext(), 0);
          },
          { once: true },
        );
        lose.loseContext();
      }),
  );
}

/**
 * Waits for `frames` animation frames in the page (frames, not ticks: the waits see a rendered-
 * frame count land, a swap shown, or a picture drawn — and after the swap the game's own loop is
 * stopped, so its tick clock stands still by design).
 *
 * @param page - The page.
 * @param frames - Frames to wait.
 */
async function waitFrames(page: Page, frames: number): Promise<void> {
  await page.evaluate(
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

/** The game's tick counter, as the test builds expose it. */
function readTick(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __shmupDebug: { tick: number } }).__shmupDebug.tick,
  );
}

/**
 * Dispatches one remote key event by its legacy key code on the window (the frozen-loop form of
 * `ticks.ts`'s `sendRemoteKey`, which is private there; no tick waits around it — after the
 * swap the loop runs none).
 *
 * @param page - The page.
 * @param type - `keydown` or `keyup`.
 * @param keyCode - The key code.
 */
async function sendRemoteKey(
  page: Page,
  type: 'keydown' | 'keyup',
  keyCode: number,
): Promise<void> {
  await page.evaluate(
    ([eventType, code]) => {
      const event = new KeyboardEvent(eventType, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'keyCode', { get: () => code });
      window.dispatchEvent(event);
    },
    [type, keyCode] as const,
  );
}

/** Every console error line and uncaught error. */
function watchErrors(page: Page): string[] {
  const lines: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') lines.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => lines.push(`pageerror: ${error.message}`));
  return lines;
}

test.describe('context-loss watchdog (P0-3)', () => {
  // The waits below are wall time sized for a slow runner (conventions: a spec's own timeout
  // is wall time for the slow machine): under the full suite's 12-worker SwiftShader load the
  // page can crawl to a few frames a second, and the watchdog's 60 counted frames are the
  // page's own frames — seconds on a quiet machine, tens of them under contention.
  test.describe.configure({ timeout: 180_000 });
  test('a loss that never restores swaps the black canvas for the error screen', async ({
    page,
  }) => {
    await page.goto('./');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await waitFrames(page, 10);
    expect(count(await shoot(canvas), LOGO_RED)).toBeGreaterThan(0);
    await loseContext(page);
    // The screen: the state flips to error and the boot overlay covers the dead canvas. The
    // wait is on the screen itself (Playwright polls it); the ~60 rendered frames are the
    // watchdog's own clock — ~1 s on a quiet page, longer under the suite's load.
    await expect(canvas).toHaveAttribute('data-shmup-state', 'error', { timeout: 90_000 });
    const overlay = page.locator('canvas[data-shmup-overlay]');
    await expect(overlay).toHaveCount(1);
    const shot = await shoot(overlay);
    expect(count(shot, SCREEN_BG)).toBeGreaterThan(shot.data.length / 8); // the filled screen
    expect(count(shot, SCREEN_TITLE)).toBeGreaterThan(0); // the drawn title, not a blank box
    // The loop halted: no sim runs behind the stated screen any more.
    const tick = await readTick(page);
    await waitFrames(page, 30);
    expect(await readTick(page)).toBe(tick);
    // One swap only: the verdict fired once and the flag stands down (no repeat check).
    await expect(canvas).toHaveAttribute('data-shmup-state', 'error');
  });

  test('a restore inside the grace window keeps the game and shows no screen', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await waitFrames(page, 10);
    const tickBefore = await readTick(page);
    await loseAndRestore(page);
    // More rendered frames than the watchdog counts before it checks — had the flag not cleared
    // on restore, a false verdict could still only come from the one `isContextLost()` check,
    // and neither swap may happen here.
    await waitFrames(page, 130);
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
    await expect(page.locator('canvas[data-shmup-overlay]')).toHaveCount(0);
    expect(await readTick(page)).toBeGreaterThan(tickBefore);
    expect(count(await shoot(canvas), LOGO_RED)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('Back on the stated screen exits the Tizen app once', async ({ page }) => {
    await installTizenStandIn(page);
    await page.goto(TIZEN_INDEX);
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await loseContext(page);
    await expect(canvas).toHaveAttribute('data-shmup-state', 'error', { timeout: 90_000 });
    expect(await exitCount(page)).toBe(0);
    await sendRemoteKey(page, 'keydown', BACK);
    await sendRemoteKey(page, 'keyup', BACK);
    await expect.poll(() => exitCount(page)).toBe(1);
    // The screen stays stated (the stand-in does not close the page); the loop stays stopped.
    await expect(canvas).toHaveAttribute('data-shmup-state', 'error');
    const tick = await readTick(page);
    await waitFrames(page, 20);
    expect(await readTick(page)).toBe(tick);
  });
});
