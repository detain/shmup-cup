/**
 * # render-harness/bench-gates — the render bench's budgets, and the check that a run
 * means anything
 *
 * The gates of `pnpm bench`'s render suite (plan M3-02c): the budgets, and
 * {@link renderBenchViolations}, which turns one {@link RenderBenchResult} into the list of
 * reasons it must fail. Since plan **M3-02e** a second gate, {@link renderGroupViolations}, reads
 * the same result against *how the scenario was configured* — the shipped scene must have stopped
 * rebuilding itself (the review's **F1**), while the deliberate `renderGroups: false` arm must
 * still be the single-group scene it is there to compare against.
 *
 * Its own module so the gates can be tested without a browser
 * (`test/integration/render-bench.test.ts`). Since plan **R0-02** it also gates the TV render
 * bench's scenes ({@link tvBenchViolations}) — counts only, never milliseconds: the machine the
 * headless bench runs on is shared. The first thing it checks is not a budget at all but
 * the **load floor**: a render benchmark that measured an empty scene while printing confident
 * numbers is worse than having none, and that is exactly what M3-02c's review round 1 found
 * (topping the bullet pool up before `game.step()` spawned nothing). A scenario therefore fails
 * unless every frame it timed really carried the load it claims.
 *
 * @module
 */
import type { RenderBenchRecord } from '../../../packages/shell/src/telemetry/index.js';
import type { RenderBenchResult } from './protocol.js';

/**
 * Most WebGL draw calls a measured frame may take. `shmup_feat.md` §22 allows 20–50; since plan
 * **M3-02e** — one render group, and so one batch boundary, per high-churn layer — the two e2e
 * specs pin the plain frame at 16. This is the render bench's own ceiling, deliberately above the
 * e2e one because a scenario stacks the busiest frame, a filtered layer or the Mode-7 floor *and*
 * the CRT pass. (`test/integration/render-groups.test.ts` keeps this sentence and those two specs
 * in step.)
 */
export const DRAW_CALL_BUDGET = 20;

/**
 * Render-ms p95 budget under SwiftShader. Not the TV's 8 ms budget (`shmup_feat.md` §22): software
 * WebGL on a shared CI machine is one to two orders slower, and this exists to catch a *structural*
 * regression — a second full-screen pass appearing, the scene being walked twice — not to predict
 * the Mali-G51.
 */
export const RENDER_P95_BUDGET_MS = 16;

/** JS-heap growth a scenario may retain over its measured frames, bytes. */
export const HEAP_BUDGET = 1024 * 1024;

/**
 * Fewest live enemy bullets, point items and particles **every** measured frame must have
 * carried (of 512 each).
 *
 * @remarks
 * Not 512: a few point items reach the score during the tick that follows the screen clear, and a
 * particle preset's burst can end a frame one slot short. The measured floors are 512 bullets and
 * ≥ 489 of each of the other two, so this rejects anything close to half a pool — and rejects an
 * empty scene outright.
 */
export const MIN_LIVE_LOAD = 400;

/**
 * Every reason a bench result must fail: an empty or thin scene first, then the budgets.
 *
 * @param result - What the harness measured.
 * @returns The violations, most important first; empty when the run was a real, in-budget frame.
 */
export function renderBenchViolations(result: RenderBenchResult): string[] {
  const out: string[] = [];
  if (result.frames <= 0) out.push(`measured no frames at all (${result.frames})`);
  if (result.bullets <= MIN_LIVE_LOAD) {
    out.push(`a frame carried only ${result.bullets} enemy bullets (need > ${MIN_LIVE_LOAD})`);
  }
  if (result.points <= MIN_LIVE_LOAD) {
    out.push(`a frame carried only ${result.points} point items (need > ${MIN_LIVE_LOAD})`);
  }
  if (result.particles <= MIN_LIVE_LOAD) {
    out.push(`a frame carried only ${result.particles} particles (need > ${MIN_LIVE_LOAD})`);
  }
  if (result.drawCalls <= 0) {
    out.push(`the frame took ${result.drawCalls} draw calls — nothing was drawn, or none counted`);
  } else if (result.drawCalls > DRAW_CALL_BUDGET) {
    out.push(`${result.drawCalls} draw calls, over the budget of ${DRAW_CALL_BUDGET}`);
  }
  if (!(result.renderP95Ms < RENDER_P95_BUDGET_MS)) {
    out.push(`render p95 ${result.renderP95Ms} ms, over the budget of ${RENDER_P95_BUDGET_MS} ms`);
  }
  if (result.heapMeasured && !(result.heapDeltaBytes < HEAP_BUDGET)) {
    out.push(
      `the heap grew ${result.heapDeltaBytes} bytes over ${result.frames} frames, ` +
        `over the budget of ${HEAP_BUDGET}`,
    );
  }
  return out;
}

/**
 * Fraction of a scenario's measured frames on which the **scene's own** instruction set may be
 * rebuilt (plan M3-02e, the review's **F1**).
 *
 * @remarks
 * Before the step every frame rebuilt it: the bench measured 655–659 of every 660. After it the
 * measured figure is 0, and the counter accumulates over the warm-up frames too, so a tenth of
 * the *measured* frames is a ceiling nothing but F1 coming back can reach.
 */
export const SCENE_REBUILD_BUDGET = 0.1;

/**
 * Every reason a bench result's render-group behaviour must fail (plan M3-02e).
 *
 * @remarks
 * Separate from {@link renderBenchViolations} because it is the one gate that depends on *how the
 * scenario was configured*: the bench deliberately runs one scenario with the layer groups off —
 * the review's measurement **M1**, the pre-M3-02e scene measured against the shipped one in the
 * same session — and that arm must fail the ordinary expectation and meet the opposite one.
 *
 * @param result - What the harness measured.
 * @param renderGroups - Whether the scenario asked for the layer render groups (the shipped scene).
 * @returns The violations; empty when the scenario behaved as its configuration says it must.
 */
export function renderGroupViolations(result: RenderBenchResult, renderGroups: boolean): string[] {
  const out: string[] = [];
  // The scene's group is one of the groups the second counter walks, so it can never be the
  // larger of the two — whichever scene was built.
  if (result.groupRebuilds < result.structureRebuilds) {
    out.push(
      `${result.groupRebuilds} render-group rebuilds is fewer than the ` +
        `${result.structureRebuilds} rebuilds of the scene's own group, which is one of them`,
    );
  }
  if (renderGroups) {
    const budget = Math.floor(result.frames * SCENE_REBUILD_BUDGET);
    if (result.structureRebuilds > budget) {
      out.push(
        `the whole scene was rebuilt on ${result.structureRebuilds} frames, over the budget of ` +
          `${budget} — the review's F1 is back`,
      );
    }
    // A fall in the figure above means nothing unless the churn is still happening somewhere: a
    // scene that drew nothing would score 0 too.
    if (result.groupRebuilds <= 0) {
      out.push(
        `no render group was rebuilt at all (${result.groupRebuilds}) — the scene was empty, or ` +
          'the counters are read in the wrong place',
      );
    }
  } else {
    // The A/B arm: one group for everything, so essentially every frame throws the whole
    // instruction set away and the two counters are the same figure.
    if (!(result.structureRebuilds > result.frames * 0.9)) {
      out.push(
        `the single-group scene rebuilt itself on only ${result.structureRebuilds} of ` +
          `${result.frames} frames — it is not the pre-M3-02e scene`,
      );
    }
    if (result.groupRebuilds !== result.structureRebuilds) {
      out.push(
        `the single-group scene counted ${result.groupRebuilds} render-group rebuilds and ` +
          `${result.structureRebuilds} scene rebuilds — with one group they are the same figure`,
      );
    }
  }
  return out;
}

/**
 * The next power of two at or above `n` — since pixi.js **8.21** the *ceiling* of a pooled
 * render-target axis, not the axis itself (pre-8.21 the pool rounded each axis up to this; from
 * 8.21 a registered screen can cap it below, see {@link pooledAxisSize}).
 *
 * @param n - A positive size.
 * @returns The power of two.
 */
export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * The backing size of one axis of a pooled render target, in physical pixels, per the pixi.js
 * **8.21+** pool (`TexturePool.getOptimalSize` → `ScreenSizeRegistry.getFittingWidth/Height`):
 * the next power of two, capped by the smallest registered screen the request fits inside. A
 * renderer registers its own backbuffer as the screen (`ViewSystem._updateScreenSize`), and each
 * bench page runs exactly one renderer in one scenario, so the registered screen of a record is
 * its own `displayWidth` / `displayHeight` at resolution 1. A request larger than every
 * registered screen on an axis keeps the bare power of two — the pool never rounds a request up
 * to a screen it does not fit in — and whenever the screen is at least the power of two the axis
 * equals {@link nextPowerOfTwo}, the pre-8.21 value (every v1-frame row of both benches).
 *
 * @param request - The requested size of the axis, in physical pixels.
 * @param screen - The size of the page's registered screen on the axis.
 * @returns The pooled size of the axis, in physical pixels.
 */
export function pooledAxisSize(request: number, screen: number): number {
  const pow2 = nextPowerOfTwo(request);
  return screen >= request ? Math.min(pow2, screen) : pow2;
}

/**
 * Bytes of pooled render target one filter pass at `width × height` costs on a page whose
 * renderer registered a `displayWidth × displayHeight` backbuffer — {@link pooledAxisSize} on
 * each axis, RGBA8 (the benches all render at resolution 1).
 *
 * @param width - The internal frame width the filter pass renders.
 * @param height - The internal frame height the filter pass renders.
 * @param displayWidth - The page's registered screen width.
 * @param displayHeight - The page's registered screen height.
 * @returns The pooled bytes.
 */
export function pooledRenderTargetBytes(
  width: number,
  height: number,
  displayWidth: number,
  displayHeight: number,
): number {
  return pooledAxisSize(width, displayWidth) * pooledAxisSize(height, displayHeight) * 4;
}

/** What a TV-bench scenario is expected to show (plan R0-02). */
export interface TvBenchExpectation {
  /** Atlas pages of its density: 1 at ×1 and ×1.5, 2 at ×2.25. */
  readonly atlasPages: number;
}

/**
 * Every reason a TV render-bench record (plan R0-02, `apps/tizen/src/bench`) must fail the
 * headless gate: a thin scene first, then the counted budgets. **No time gate** — the machine is
 * shared and SwiftShader is not the M7; the milliseconds are for the TV run (R0-03).
 *
 * @remarks
 * - the synthetic load: all 512 bullets, 512 point items and 64 enemies on every frame, the
 *   particle pool above {@link MIN_LIVE_LOAD}, terrain in view, frames in both measured phases;
 * - draw calls within {@link DRAW_CALL_BUDGET} (the busiest variant stacks a filtered layer, the
 *   Mode-7 floor and the CRT);
 * - render targets: none pooled without a filtered layer (the CRT is the blit's shader and the
 *   Mode-7 floor a mesh since M3-02d), and with one exactly {@link pooledRenderTargetBytes} for
 *   the frame on the page's registered screen (pixi.js 8.21+ — power-of-two axes capped by the
 *   screen); the frame target `width · height · 4`;
 * - the density's atlas pages, and texture bytes of at least one RGBA page per page;
 * - the heap within {@link HEAP_BUDGET} whenever the browser reports one.
 *
 * @param record - What the bench measured.
 * @param expected - What its scenario must show.
 * @returns The violations; empty when the record is a real, in-budget frame.
 */
export function tvBenchViolations(
  record: RenderBenchRecord,
  expected: TvBenchExpectation,
): string[] {
  const out: string[] = [];
  if (!(record.frames > 0)) out.push(`measured no free-running frame (${record.frames})`);
  if (!(record.syncedFrames > 0)) out.push(`measured no synced frame (${record.syncedFrames})`);
  const load = record.load;
  if (load.bullets !== 512) out.push(`a frame carried ${load.bullets} enemy bullets, not 512`);
  if (load.points !== 512) out.push(`a frame carried ${load.points} point items, not 512`);
  if (load.enemies !== 64) out.push(`a frame carried ${load.enemies} enemies, not 64`);
  if (load.particles <= MIN_LIVE_LOAD) {
    out.push(`a frame carried only ${load.particles} particles (need > ${MIN_LIVE_LOAD})`);
  }
  if (!(load.tiles > 0)) out.push('no terrain tile was in view');
  if (record.drawCalls <= 0) {
    out.push(`the frame took ${record.drawCalls} draw calls — nothing was drawn, or none counted`);
  } else if (record.drawCalls > DRAW_CALL_BUDGET) {
    out.push(`${record.drawCalls} draw calls, over the budget of ${DRAW_CALL_BUDGET}`);
  }
  const pooled = record.filter
    ? pooledRenderTargetBytes(
        record.width,
        record.height,
        record.displayWidth,
        record.displayHeight,
      )
    : 0;
  if (record.renderTargetBytes !== pooled) {
    out.push(
      `${record.renderTargetBytes} bytes of pooled render targets, expected ${pooled} ` +
        (record.filter
          ? '(one filter pass at the frame size, power-of-two axes capped by the screen)'
          : '(none)'),
    );
  }
  if (record.frameTargetBytes !== record.width * record.height * 4) {
    out.push(`the frame target holds ${record.frameTargetBytes} bytes, not width · height · 4`);
  }
  if (record.atlasPages !== expected.atlasPages) {
    out.push(`${record.atlasPages} atlas pages, expected ${expected.atlasPages}`);
  }
  if (!(record.textureBytes >= record.atlasPages * 4)) {
    out.push(`${record.textureBytes} texture bytes for ${record.atlasPages} pages`);
  }
  if (record.heapMeasured && !(record.heapDeltaBytes < HEAP_BUDGET)) {
    out.push(
      `the heap grew ${record.heapDeltaBytes} bytes over the measured phases, ` +
        `over the budget of ${HEAP_BUDGET}`,
    );
  }
  return out;
}
