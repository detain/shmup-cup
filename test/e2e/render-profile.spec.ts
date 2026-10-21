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
 *   `raster-range` a layer effect pools a target for the frame (640×360), and the review's **F3**
 *   says Pixi rounds that up to the next power of two on each axis — 1024×512 RGBA8 (2 MB), not
 *   900 KB (512×256, 512 KB, not 324 KB at v1's 384×216).
 * - **`?gl=`** — F8's A/B switch: the shipped default is `auto` since R6-04, which resolves to
 *   WebGL 2 on an engine past the Chromium 71 floor and to WebGL 1 on the two TVs, and the pin
 *   parameter really does force the version it names, with the overlay reporting what was obtained.
 */
import { expect, test, type Page } from '@playwright/test';
import { freezeSim, stepTo } from './frame-advance.js';
import { FRAME_H, FRAME_W } from './frame-pixels.js';
import { BOOT_TIMEOUT_MS } from './ticks.js';

/**
 * The smallest power of two at or above a size.
 *
 * @param size - A positive whole number.
 * @returns The power of two.
 */
function nextPowerOfTwo(size: number): number {
  let power = 1;
  while (power < size) power *= 2;
  return power;
}

/**
 * Bytes of the render target Pixi pools for a filter pass over the frame (review F3: each axis
 * rounded up to a power of two, RGBA8 — 1024×512 at 640×360, 512×256 at v1's 384×216).
 */
const FRAME_FILTER_TARGET_BYTES = nextPowerOfTwo(FRAME_W) * nextPowerOfTwo(FRAME_H) * 4;

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
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
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
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    await freezeSim(page);
    await stepTo(page, 200);
    const state = await profile(page);
    // The sea is filtered at this camera x (the raster spec pins the mask itself) …
    expect(state.layerEffectMask).toBeGreaterThan(0);
    // … and the pass is pooled at the next power of two on each axis (1024×512, not 640×360;
    // 512×256 at v1's 384×216).
    expect(state.renderTargetBytes).toBeGreaterThanOrEqual(FRAME_FILTER_TARGET_BYTES);
    expect(errors).toEqual([]);
  });

  test('boots on WebGL2 by default and on WebGL1 with ?gl=1 (review F8)', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=flight');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    // The shipped default is `auto` since R6-04, and this engine clears `resolveBootGLVersion`'s
    // Chromium 71 floor with a WebGL 2 context — so the default boot is WebGL 2. (The two TVs, 68
    // and 69, resolve to 1 under the same function; that is the shell's unit test, not this one.)
    const shipped = await profile(page);
    expect(shipped.webGLVersion).toBe(2);
    expect(shipped.statsWebGLVersion).toBe(2);

    // The A/B switch: the same page, one query parameter, a WebGL1 context forced under the pin —
    // and a frame that still draws (the overlay's WEBGL figure is what the owner reads on the TV,
    // where WebGL 1 is the floor the game must keep drawing on).
    await page.goto('./?scene=flight&gl=1');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
    const one = await profile(page);
    expect(one.webGLVersion).toBe(1);
    expect(one.statsWebGLVersion).toBe(1);
    expect(one.drawCalls).toBeGreaterThan(0);
    expect(one.rebuilds).toBeGreaterThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test('starts no render-telemetry capture in a build with no log server (M3-02f)', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=flight');
    await expect(page.locator('#game')).toHaveAttribute('data-shmup-state', 'running', {
      timeout: BOOT_TIMEOUT_MS,
    });
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
