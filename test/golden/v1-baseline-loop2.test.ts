/**
 * The v1 baseline of the nine zones on loop 2 (plan_resolution.md R2-02 prep — the `remix`
 * events of M3-01 join each timeline): while the engine still runs the recorded frame, each
 * re-runs (the 4-way bot, god mode) to its committed
 * `test/fixtures/v1-baseline/<zone>-loop2.baseline.json` byte for byte. See `v1-baseline.test.ts`
 * for the rest of the check and how to re-record.
 */
import { BASELINE_GROUPS } from './v1-baseline.js';
import { describeBaselineReruns } from './v1-baseline-suite.js';

describeBaselineReruns('v1 baseline: the zones on loop 2 (R2-02 prep)', BASELINE_GROUPS.loop2);
