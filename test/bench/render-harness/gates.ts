/**
 * # render-harness/gates — the render bench's budgets, and the check that a run means anything
 *
 * The gates of `pnpm bench`'s render suite (plan M3-02c): the budgets, and
 * {@link renderBenchViolations}, which turns one {@link RenderBenchResult} into the list of
 * reasons it must fail. Since plan **M3-02e** a second gate, {@link renderGroupViolations}, reads
 * the same result against *how the scenario was configured* — the shipped scene must have stopped
 * rebuilding itself (the review's **F1**), while the deliberate `renderGroups: false` arm must
 * still be the single-group scene it is there to compare against.
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
