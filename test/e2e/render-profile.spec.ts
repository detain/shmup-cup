/**
 * The M3-02c render-profile instruments in a real browser, on the test build `pnpm test:e2e`
 * makes (`build:test` — `__SHMUP_DEV__` on, so `window.__shmupDebug` and the debug tools exist).
 *
 * The Node suites test these against fakes; only a real WebGL context can say whether they report
 * anything at all:
 *
 * - **`REB`** — `PixiRenderer.structureRebuilds`, read before pass 1 because Pixi clears the flag
 *   while rendering. If the read were in the wrong place the figure would sit at 0 for ever, and
 *   no fake would notice. Until **M3-02e** it was also the review's **F1** measured rather than
 *   argued — Pixi v8 rebuilt the whole instruction set on very nearly every frame of this game.
 *   Since M3-02e the high-churn layers are their own render groups, so what rises frame after
 *   frame is `groupRebuilds` (a layer's instruction set) while `structureRebuilds` (the whole
 *   scene's) barely moves. That pair is what this spec pins: the counters are alive *and* the
 *   churn is confined.
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
      readonly groupRebuilds: number;
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

/** What the M3-02f telemetry check reads from `window.__shmupDebug`. */
interface TelemetryWindow {
  readonly __shmupDebug: {
    readonly telemetry: {
      readonly enabled: boolean;
      readonly session: string;
      readonly status: { readonly endpoint: string | null };
      readonly sampler: { readonly frames: number };
      report(): unknown;
    };
  };
}

/** The overlay's render-profile readings. */
interface Profile {
  /** `PixiRenderer.structureRebuilds`. */
  readonly rebuilds: number;
  /** `PixiRenderer.groupRebuilds` — the same over every render group of the scene (M3-02e). */
  readonly groupRebuilds: number;
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
      groupRebuilds: api.renderer.groupRebuilds,
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
  test('counts the rebuilds Pixi really does, and keeps them off the scene (M3-02e)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=flight');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    const first = await profile(page);
    // Counting is on (dev / test build) and something was drawn.
    expect(first.rebuilds).toBeGreaterThanOrEqual(0);
    expect(first.groupRebuilds).toBeGreaterThanOrEqual(first.rebuilds);
    expect(first.statsRebuilds).toBe(first.rebuilds);
    expect(first.drawCalls).toBeGreaterThan(0);

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
    // The counters are read in the right place: a counter reading `structureDidChange` *after*
    // `renderer.render()` would sit at 0 for ever, because Pixi clears the flag while rendering.
    // The flying scene really does hide and show sprites every frame, so a render group rebuilds.
    expect(later.groupRebuilds).toBeGreaterThan(first.groupRebuilds);
    // M3-02e, the review's F1: that churn is confined to the layers' own groups. Before this step
    // the *scene's* counter rose on very nearly every frame here (the bench measured 655–659 of
    // 660); now the whole instruction set is thrown away on almost none of them.
    expect(later.rebuilds - first.rebuilds).toBeLessThan(FRAMES / 4);
    // And never more than one scene rebuild per frame either.
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

  test('starts no render-telemetry capture in a build with no log server (M3-02f)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=flight');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running');
    // This is a test build — `__SHMUP_DEV__` is on and the debug tools exist — but it was not
    // given `VITE_REPORT_URL`, so `createRenderTelemetry` must start nothing at all: no timer, no
    // listeners, no panel. A dev build the owner is only playing must cost the frame nothing.
    const capture = await page.evaluate(() => {
      const api = (window as unknown as TelemetryWindow).__shmupDebug.telemetry;
      return { enabled: api.enabled, session: api.session, endpoint: api.status.endpoint };
    });
    expect(capture.enabled).toBe(false);
    expect(capture.endpoint).toBeNull();
    expect(capture.session).toMatch(/^rp-/);
    // And the guided checklist is not on the page.
    await expect(page.locator('[data-shmup-render-telemetry]')).toHaveCount(0);

    // The frame hooks still run — `commitFrame` is called on every frame either way — and they are
    // no-ops: after 30 frames the disabled sampler has recorded nothing to report.
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          let left = 30;
          const step = (): void => {
            if (--left <= 0) resolve(undefined);
            else requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
    );
    const after = await page.evaluate(() => {
      const api = (window as unknown as TelemetryWindow).__shmupDebug.telemetry;
      return { frames: api.sampler.frames, report: api.report() };
    });
    expect(after.frames).toBe(0);
    expect(after.report).toBeNull();
    expect(errors).toEqual([]);
  });
});
