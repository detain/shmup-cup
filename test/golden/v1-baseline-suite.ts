/**
 * The re-run half of the v1 baseline check (plan_resolution.md R2-02 prep), shared by the three
 * `v1-baseline*.test.ts` files so the scenarios run in parallel workers: while the engine still
 * runs the frame the committed `test/fixtures/v1-baseline/*.baseline.json` files were recorded at,
 * each scenario is played again (`v1-baseline.ts` `recordBaseline`) and its formatted measurement
 * must equal the committed file byte for byte; a scenario that is a golden replay's run must also
 * end on that golden's tick count and final hash. With `SHMUP_V1_BASELINE_UPDATE=1` the fresh
 * text is written first (only at the recorded frame). From R2-01 on the re-runs are skipped:
 * the files are the frozen v1 record R2-02 compares against.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import { readGolden } from './golden.js';
import {
  BASELINE_UPDATE_ENV,
  BASELINE_SCENARIOS,
  formatBaseline,
  readBaselineText,
  recordBaseline,
  sameFrame,
  writeBaseline,
  type BaselineFrame,
  type BaselineScenario,
  type StageBaseline,
} from './v1-baseline.js';

/** Per-scenario timeout of a re-run (a zone takes about 2 s alone, more under the full suite). */
export const RERUN_TIMEOUT_MS = 120_000;

/** Whether this run re-records the files. */
export const updating = process.env[BASELINE_UPDATE_ENV] === '1';

/** The committed files' frame — the first scenario's (`null` before anything is recorded). */
export const committedFrame: BaselineFrame | null = (() => {
  const text = readBaselineText(BASELINE_SCENARIOS[0].id);
  return text === null ? null : (JSON.parse(text) as StageBaseline).frame;
})();

/** The engine still runs the recorded frame (or nothing is recorded yet). */
export const atRecordedFrame = committedFrame === null || sameFrame(committedFrame);

/**
 * The first line where two texts differ, for a readable failure.
 *
 * @param actual - The fresh text.
 * @param expected - The committed text.
 * @returns `line N: committed … / now …`, or `''` when they are equal.
 */
export function firstDifference(actual: string, expected: string): string {
  if (actual === expected) return '';
  const a = actual.split('\n');
  const b = expected.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `line ${String(i + 1)}: committed ${b[i] ?? '(end)'} / now ${a[i] ?? '(end)'}`;
    }
  }
  return 'the texts differ';
}

/**
 * Declares the re-run tests of some scenarios (one `it` each), skipped once the frame changed.
 *
 * @param title - The describe block's title.
 * @param scenarios - The scenarios.
 */
export function describeBaselineReruns(
  title: string,
  scenarios: readonly BaselineScenario[],
): void {
  describe.runIf(atRecordedFrame)(title, () => {
    it.each(scenarios.map((s) => [s.id, s] as const))(
      '%s re-runs to the committed file byte for byte',
      async (id, scenario) => {
        const baseline = recordBaseline(scenario);
        const text = await formatBaseline(baseline);
        if (updating) {
          writeBaseline(id, text);
          console.info(`[v1-baseline] recorded ${id} (${String(text.length)} bytes)`);
        }
        const committed = readBaselineText(id);
        expect(
          committed,
          `no baseline for ${id}: record it with ${BASELINE_UPDATE_ENV}=1`,
        ).not.toBe(null);
        expect(
          firstDifference(text, committed ?? ''),
          `the v1 baseline of ${id} moved — an R1 change shifted what the game does (fix it), or ` +
            `an intended simulation change before R2-01: re-record with ${BASELINE_UPDATE_ENV}=1 ` +
            'and say why in the commit message',
        ).toBe('');
        if (scenario.golden !== null) {
          // The very run of a golden replay: the meter's wrappers left the simulation alone.
          const { file } = readGolden(scenario.golden);
          expect(baseline.run.ticks, scenario.golden).toBe(file.ticks);
          expect(baseline.run.hash, scenario.golden).toBe(file.finalHash);
        }
      },
      RERUN_TIMEOUT_MS,
    );
  });
}
