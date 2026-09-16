/**
 * # render-harness/gates — the render bench's budgets, and the check that a run means anything
 *
 * The gates of `pnpm bench`'s render suite (plan M3-02c): the budgets, and
 * {@link renderBenchViolations}, which turns one {@link RenderBenchResult} into the list of
 * reasons it must fail.
 *
 * Its own module so the gates can be tested without a browser
 * (`test/integration/render-bench.test.ts`). The first thing it checks is not a budget at all but
 * the **load floor**: a render benchmark that measured an empty scene while printing confident
 * numbers is worse than having none, and that is exactly what M3-02c's review round 1 found
 * (topping the bullet pool up before `game.step()` spawned nothing). A scenario therefore fails
 * unless every frame it timed really carried the load it claims.
 *
 * @module
 */
import type { RenderBenchResult } from './protocol.js';

/**
 * Most WebGL draw calls a measured frame may take. `shmup_feat.md` §22 allows 20–50; the two e2e
 * specs pin the plain frame at 12. This is the render bench's own ceiling, deliberately above the
 * e2e one because a scenario stacks the busiest frame, a filtered layer or the Mode-7 floor *and*
 * the CRT pass.
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
