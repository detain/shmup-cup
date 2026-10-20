/**
 * The v2 port acceptance for the zones on loop 2 (plan_resolution.md R2-02.T3): the remixes flown
 * again on the ported world and compared through the README mapping (`v2-port.ts`; loop 1 in
 * `v2-port-zones.test.ts`, the other stages in `v2-port.test.ts`).
 */
import { BASELINE_GROUPS } from './v1-baseline.js';
import { describeV2PortComparisons } from './v2-port-suite.js';

describeV2PortComparisons('v2 port: the zones on loop 2 (R2-02.T3)', BASELINE_GROUPS.loop2);
