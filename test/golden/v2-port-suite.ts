/**
 * The comparison half of the v2-port acceptance check (plan_resolution.md R2-02.T3), shared by the
 * three `v2-port*.test.ts` files so the scenarios run in parallel workers: each committed
 * `test/fixtures/v1-baseline/*.baseline.json` is read, its scenario is played again on the live
 * (ported) world through `v1-baseline.ts` `recordBaseline` — with the scenario's `startX` mapped
 * by `v1x`, the one input the port scales — and {@link compareScenario} matches the two runs
 * field by field through the mapping of `test/fixtures/v1-baseline/README.md` § "Comparing a v2
 * run". Nothing here writes a fixture: the v1 files are the frozen record.
 *
 * While the world is still ×1 (`WORLD_SCALE` = 1, before R2-02's port commit) the whole block is
 * skipped — the comparison's meaning is the ported world's. The `K` = 1 sanity lives in
 * `v2-port.test.ts` (self-comparison of a committed file: the identity).
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import { readBaseline, recordBaseline, type BaselineScenario } from './v1-baseline.js';
import { v1x } from '../../packages/core/test/helpers/v1-port.js';
import { compareScenario, K } from './v2-port.js';
import { RERUN_TIMEOUT_MS } from './v1-baseline-suite.js';

/**
 * Declares the acceptance comparisons of some scenarios (one `it` each), skipped while the world
 * is ×1.
 *
 * @param title - The describe block's title.
 * @param scenarios - The scenarios to compare against their committed v1 baselines.
 */
export function describeV2PortComparisons(
  title: string,
  scenarios: readonly BaselineScenario[],
): void {
  describe.skipIf(K === 1)(title, () => {
    it.each(scenarios.map((s) => [s.id, s] as const))(
      '%s: the v2 run matches the v1 baseline through the port mapping',
      (id, scenario) => {
        const v1 = readBaseline(id);
        const v2 = recordBaseline({ ...scenario, startX: v1x(scenario.startX) });
        const problems = compareScenario(v1, v2);
        expect(
          problems.join('\n'),
          `the port run of ${id} departs from the README mapping (${String(problems.length)} ` +
            'issues; bot-dependent rows are R2-02.T2b until the bot scales):\n' +
            problems.join('\n'),
        ).toBe('');
      },
      RERUN_TIMEOUT_MS,
    );
  });
}
