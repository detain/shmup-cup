/**
 * The v1 baseline of the nine zones on loop 1 (plan_resolution.md R2-02 prep): while the engine
 * still runs the recorded frame, each zone re-runs (the 4-way bot, god mode — the run of its
 * `<zone>-god` golden replay) to its committed `test/fixtures/v1-baseline/<zone>.baseline.json`
 * byte for byte. See `v1-baseline.test.ts` for the rest of the check and how to re-record.
 */
import { BASELINE_GROUPS } from './v1-baseline.js';
import { describeBaselineReruns } from './v1-baseline-suite.js';

describeBaselineReruns('v1 baseline: the zones on loop 1 (R2-02 prep)', BASELINE_GROUPS.zones);
