/**
 * Frame-advance helpers for the browser tests: `pnpm test:e2e` runs the test builds
 * (`build:test`, `__SHMUP_DEV__` on), whose `window.__shmupDebug` (plan M1-19) exposes the
 * session's debug switches and `game.requestStep`. A spec that compares two captures a known
 * number of ticks apart freezes the sim with {@link freezeSim} and runs exact tick counts with
 * {@link stepTo}, so what it sees does not depend on how many ticks a busy machine's frame loop
 * would have caught up per frame (the loop runs up to 4 per frame).
 *
 * @module
 */
import type { Page } from '@playwright/test';

/**
 * Waits for `frames` animation frames in the page.
 *
 * @param page - The page.
 * @param frames - Frames to wait.
 * @returns Resolves once the page has shown `frames` more animation frames.
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
 * Freezes the sim with the debug tools' frame advance as soon as `window.__shmupDebug` is
 * published (the shell publishes it before the first frame), so from then on ticks run only
 * when {@link stepTo} asks for them.
 *
 * @param page - The page (a test build, booted).
 * @returns Resolves once frame advance is on (the World then stays at its current tick).
 * @throws {Error} Playwright's timeout error when `window.__shmupDebug` never appears — the page
 *   is a release build (`pnpm build` instead of `build:test`) or did not boot.
 */
export async function freezeSim(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const api = (window as unknown as { __shmupDebug?: { flags: { frameAdvance: boolean } } })
      .__shmupDebug;
    if (api === undefined) return false;
    api.flags.frameAdvance = true;
    return true;
  });
}

/**
 * Runs ticks under frame advance until the current World's tick is `tick` (none when it already
 * is at or past it), then waits two frames so the canvas shows that tick.
 *
 * @param page - The page (frozen with {@link freezeSim}).
 * @param tick - The World tick to reach.
 * @returns The World tick reached (resolves once the canvas shows it) — exactly `tick` unless the
 *   World was already past it.
 *
 * @example
 * ```ts
 * await freezeSim(page);
 * await stepTo(page, 90);
 * const before = await capture(page);
 * await stepTo(page, 120); // exactly 30 ticks later, whatever the machine's load
 * ```
 */
export async function stepTo(page: Page, tick: number): Promise<number> {
  // Queue the missing ticks; the next frame runs them all (`Game.frame` under frame advance).
  await page.evaluate((target) => {
    const api = (
      window as unknown as {
        __shmupDebug: { worldTick: number; game: { requestStep(count: number): void } };
      }
    ).__shmupDebug;
    if (api.worldTick < target) api.game.requestStep(target - api.worldTick);
  }, tick);
  const reached = await page.waitForFunction((target) => {
    const ticks = (window as unknown as { __shmupDebug: { worldTick: number } }).__shmupDebug
      .worldTick;
    return ticks >= target ? ticks : false;
  }, tick);
  const worldTick = (await reached.jsonValue()) as number;
  await waitFrames(page, 2);
  return worldTick;
}
