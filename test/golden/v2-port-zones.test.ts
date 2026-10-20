/**
 * The v2 port acceptance for the nine shipped zones on loop 1 (plan_resolution.md R2-02.T3):
 * every zone baseline is flown again on the ported world and compared through the README mapping
 * (`v2-port.ts`; the stages other than the zones live in `v2-port.test.ts`, loop 2 in
 * `v2-port-loop2.test.ts`).
 */
import { BASELINE_GROUPS } from './v1-baseline.js';
import { describeV2PortComparisons } from './v2-port-suite.js';

describeV2PortComparisons('v2 port: the zones on loop 1 (R2-02.T3)', BASELINE_GROUPS.zones);
