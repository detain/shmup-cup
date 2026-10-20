/**
 * A lost and restored WebGL context (plan R3-04.M3d): the game must survive the GPU reset a TV
 * takes under memory pressure or a driver reload.
 *
 * Pixi cancels the loss (`webglcontextlost` → `preventDefault`), rebuilds its own GL objects when
 * the context is restored, and re-creates a texture on the frame that first binds it; the shell's
 * boot additionally re-fetches the shown stage's pages the lazy residency no longer holds and
 * re-uploads every page the residency believes resident (so the canvas's `data-shmup-atlas-pages`
 * and the GPU agree again without waiting for each page's next draw). Checked here, through the
 * `WEBGL_lose_context` extension — the same event pair a real reset fires:
 *
 * - after the restore the web build draws again: the title's logo is back in a screenshot, the
 *   sim still ticks, and input still moves the scene flow;
 * - the residency's marks survive: the same pages stay resident before and after the loss, and no
 *   console error or uncaught exception appears at any point.
 *
 * The waits are rAF frames, not ticks, where they wait for what a draw does (a re-upload, a
 * presented frame) — the docblock of `atlas-residency.spec.ts` says why; tick and scene checks
 * count the game's own clock (`ticks.ts`).
 */
import { expect, test, type Page } from '@playwright/test';
import { decodePng } from '../../scripts/assets/png.mjs';
import { BOOT_TIMEOUT_MS, tap } from './ticks.js';

/** Bottom colour of the title logo's gradient (`ui/logo` #e04828, as in `scenes.spec.ts`). */
const LOGO_RED = [0xe0, 0x48, 0x28] as const;

/** A decoded canvas screenshot. */
interface Shot {
  /** Width in pixels. */
  readonly width: number;
  /** RGBA pixels. */
  readonly data: Uint8Array;
}

/**
 * Screenshots the game canvas.
 *
 * @param page - The page.
 * @returns The pixels.
 */
async function shoot(page: Page): Promise<Shot> {
  const png = await page.locator('#game').screenshot();
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
 * Loses and restores the canvas's WebGL context through `WEBGL_lose_context` — the pair of events
 * a driver reset fires — and resolves when `webglcontextrestored` has run its listeners (the
 * boot's recovery first: Pixi, then the shell, then this wait, in registration order).
 * `restoreContext()` is only honoured once the context is really lost, so the restore is asked
 * for from the lost listener, never in the same task as `loseContext()`.
 *
 * @param page - The page, with the game canvas present.
 */
async function loseAndRestore(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const canvas = document.querySelector('#game') as HTMLCanvasElement;
        // The canvas already has its context: `getContext` answers with it for the type it was
        // made with and `null` for the other (the renderer is WebGL1-first, but do not pin that).
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
            // The loss has landed; a restore asked for now is honoured (in the next task, so
            // every lost-event listener — Pixi's preventDefault included — has run first).
            setTimeout(() => lose.restoreContext(), 0);
          },
          { once: true },
        );
        lose.loseContext();
      }),
  );
}

/**
 * Waits for `frames` animation frames in the page (frames, not ticks: what is checked happens on
 * a draw — a re-upload, a presented frame).
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

/** The game's tick counter, as the test builds expose it. */
const readTick = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __shmupDebug: { tick: number } }).__shmupDebug.tick);

/** Every console line and uncaught error, in order. */
function watch(page: Page): string[] {
  const lines: string[] = [];
  page.on('console', (message) => lines.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => lines.push(`pageerror: ${error.message}`));
  return lines;
}

test.describe('WebGL context loss (R3-04.M3d)', () => {
  test('the game draws again after a lost and restored context', async ({ page }) => {
    const lines = watch(page);
    await page.goto('./');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await waitFrames(page, 10);
    expect(count(await shoot(page), LOGO_RED)).toBeGreaterThan(0);
    const tickBefore = await readTick(page);
    await loseAndRestore(page);
    await waitFrames(page, 10);
    // Drawn again: the logo's pixels are back on the canvas.
    expect(count(await shoot(page), LOGO_RED)).toBeGreaterThan(0);
    // Simulated again: ticks advanced across the loss and the restore.
    expect(await readTick(page)).toBeGreaterThan(tickBefore);
    // Controlled again: the title's flow still answers the remote-style key.
    await tap(page, 'Enter'); // PRESS OK → the menu
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'title');
    await tap(page, 'Enter'); // START
    await expect(canvas).toHaveAttribute('data-shmup-scene', 'difficulty');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running');
    expect(
      lines.filter((line) => line.startsWith('error') || line.startsWith('pageerror')),
    ).toEqual([]);
  });

  test('the residency keeps its marks across a lost and restored context', async ({ page }) => {
    const lines = watch(page);
    await page.goto('./?stage=zone-b');
    const canvas = page.locator('#game');
    await expect(canvas).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    const pages = await canvas.getAttribute('data-shmup-atlas-pages');
    expect(pages).not.toBeNull();
    expect(pages).not.toBe('');
    await loseAndRestore(page);
    await waitFrames(page, 10);
    // The same pages, believed and — through the boot's recovery — uploaded again, with the
    // residency still answering (its `prepare` on a stage change works on the new context).
    await expect(canvas).toHaveAttribute('data-shmup-atlas-pages', pages ?? '');
    const swapped = await page.evaluate(() => {
      const atlas = (
        window as unknown as {
          __shmupDebug: { atlas: { prepare(stageId: string): number } | null };
        }
      ).__shmupDebug.atlas;
      return atlas === null ? null : atlas.prepare('zone-c');
    });
    expect(swapped).not.toBeNull();
    await waitFrames(page, 10);
    expect(await canvas.getAttribute('data-shmup-state')).toBe('running');
    expect(
      lines.filter((line) => line.startsWith('error') || line.startsWith('pageerror')),
    ).toEqual([]);
  });
});
