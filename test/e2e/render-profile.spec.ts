/**
 * The M3-02c render-profile instruments in a real browser, on the test build `pnpm test:e2e`
 * makes (`build:test` — `__SHMUP_DEV__` on, so `window.__shmupDebug` and the debug tools exist).
 *
 * The Node suites test these against fakes; only a real WebGL context can say whether they report
 * anything at all:
 *
 * - **`REB`** — `PixiRenderer.structureRebuilds`, read before pass 1 because Pixi clears the flag
 *   while rendering. If the read were in the wrong place the figure would sit at 0 for ever, and
 *   no fake would notice. It is also the review's **F1** measured rather than argued: Pixi v8
 *   rebuilds the whole instruction set on very nearly every frame of this game.
 * - **`RT`** — `createRenderTargetMeter` hooked into Pixi's global `TexturePool`. On
 *   `raster-range` a layer effect pools a target for the 384×216 frame, and the review's **F3**
 *   says Pixi rounds that up to 512×256 RGBA8 (512 KB), not 324 KB.
 * - **`?gl=2`** — F8's A/B switch: WebGL1 is the shipped default and the query parameter really
 *   does get a WebGL2 context, with the overlay reporting what was obtained.
 */
import { expect, test, type Page } from '@playwright/test';
import { freezeSim, stepTo } from './frame-advance.js';

/** Bytes of the render target Pixi pools for a 384×216 filter pass (review F3: 512×256 RGBA8). */
const FRAME_FILTER_TARGET_BYTES = 512 * 256 * 4;

/** What this spec reads from `window.__shmupDebug`. */
interface ProfileWindow {
  readonly __shmupDebug: {
    readonly renderer: {
      readonly webGLVersion: number;
      readonly structureRebuilds: number;
      readonly layerEffects: { readonly attachedMask: number };
    };
    readonly stats: {
      readonly drawCalls: number;
      readonly structureRebuilds: number;
      readonly renderTargetBytes: number;
      readonly webGLVersion: number;
    };
  };
}

/** The overlay's render-profile readings. */
interface Profile {
  /** `PixiRenderer.structureRebuilds`. */
  readonly rebuilds: number;
  /** The overlay's mirror of it (what `REB` draws). */
  readonly statsRebuilds: number;
  /** The meter's total (what `RT` draws). */
  readonly renderTargetBytes: number;
  /** The context's WebGL version. */
  readonly webGLVersion: number;
  /** The overlay's mirror of it. */
  readonly statsWebGLVersion: number;
  /** Last frame's draw calls. */
  readonly drawCalls: number;
  /** Layers with an effect filter attached. */
  readonly layerEffectMask: number;
}

/**
 * Reads the render-profile figures after letting two frames render (the overlay fills them in
 * `beforeRender`).
 *
 * @param page - The page.
 * @returns The readings.
 */
async function profile(page: Page): Promise<Profile> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  return page.evaluate(() => {
    const api = (window as unknown as ProfileWindow).__shmupDebug;
    return {
      rebuilds: api.renderer.structureRebuilds,
      statsRebuilds: api.stats.structureRebuilds,
      renderTargetBytes: api.stats.renderTargetBytes,
      webGLVersion: api.renderer.webGLVersion,
      statsWebGLVersion: api.stats.webGLVersion,
      drawCalls: api.stats.drawCalls,
      layerEffectMask: api.renderer.layerEffects.attachedMask,
    };
  });
}

/**
 * Collects console and page errors.
 *
 * @param page - The page.
 * @returns The messages (filled while the test runs).
 */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test.describe('render profile (web test build, M3-02c)', () => {
  test('counts the structure rebuilds Pixi really does, every frame', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=flight');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    const first = await profile(page);
    // Counting is on (dev / test build) and something was drawn.
    expect(first.rebuilds).toBeGreaterThanOrEqual(0);
    expect(first.statsRebuilds).toBe(first.rebuilds);
    expect(first.drawCalls).toBeGreaterThan(0);

    // The review's F1, measured: the count keeps rising as the scene changes, rather than staying
    // put — which is what a counter reading `structureDidChange` *after* `renderer.render()` would
    // report, because Pixi clears the flag while rendering. (How *often* a busy frame rebuilds is
    // the render bench's business: it measured 655–659 of 660.)
    const FRAMES = 60;
    await page.evaluate(
      (frames) =>
        new Promise((resolve) => {
          let left = frames;
          const step = (): void => {
            if (--left <= 0) resolve(undefined);
            else requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
      FRAMES,
    );
    const later = await profile(page);
    expect(later.rebuilds).toBeGreaterThan(first.rebuilds);
    // Never more than one per frame, either.
    expect(later.rebuilds - first.rebuilds).toBeLessThanOrEqual(FRAMES + 4);
    expect(later.statsRebuilds).toBe(later.rebuilds);
    expect(errors).toEqual([]);
  });

  test('meters the render target a filtered layer pools (review F3)', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=flight&stage=raster-range');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    await freezeSim(page);
    await stepTo(page, 200);
    const state = await profile(page);
    // The sea is filtered at this camera x (the raster spec pins the mask itself) …
    expect(state.layerEffectMask).toBeGreaterThan(0);
    // … and the pass is pooled at the next power of two on each axis: 512×256, not 384×216.
    expect(state.renderTargetBytes).toBeGreaterThanOrEqual(FRAME_FILTER_TARGET_BYTES);
    expect(errors).toEqual([]);
  });

  test('boots on WebGL1 by default and on WebGL2 with ?gl=2 (review F8)', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=flight');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    const shipped = await profile(page);
    expect(shipped.webGLVersion).toBe(1);
    expect(shipped.statsWebGLVersion).toBe(1);

    // The A/B switch: the same page, one query parameter, a WebGL2 context — and a frame that
    // still draws (the overlay's WEBGL figure is what the owner reads on the TV).
    await page.goto('./?scene=flight&gl=2');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    const two = await profile(page);
    expect(two.webGLVersion).toBe(2);
    expect(two.statsWebGLVersion).toBe(2);
    expect(two.drawCalls).toBeGreaterThan(0);
    expect(two.rebuilds).toBeGreaterThanOrEqual(0);
    expect(errors).toEqual([]);
  });
});
