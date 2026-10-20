/**
 * The port allocation-churn gate's self-expiry (`port-alloc-churn.ts`, the prepB.FIX3 ruling's
 * option (c)): once the build is no longer at v1's frame and no committed recording is stale, the
 * gate throws so it cannot outlive R2-03's re-bless — the twin of `port-pending.test.ts` and of the
 * stale-gate check in `test/golden/golden-edge.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { ALLOC_CHURN_REASON, checkPortAllocChurnExpiry } from './port-alloc-churn.js';

describe('the port allocation-churn gate expires by itself (v2 R2-02, prepB.FIX3)', () => {
  /** The v1 frame's width and v2's: the gate counts only once the build is not at v1's. */
  const [V1_W, V2_W] = [384, 640];
  /** The variable `pnpm golden:update` sets; inside that run the gate never throws. */
  const UPDATE_ENV = 'SHMUP_GOLDEN_UPDATE';
  /** The message the gate's self-expiry throws. */
  const EXPIRED = 'R2-03 re-blessed: delete the port alloc-churn gate (port-alloc-churn.ts)';

  it('throws in a normal run once nothing is stale at v2`s frame (the gate was forgotten)', () => {
    expect(() => checkPortAllocChurnExpiry(V2_W, false, {})).toThrow(EXPIRED);
    // Any value but '1' is a normal run.
    expect(() => checkPortAllocChurnExpiry(V2_W, false, { [UPDATE_ENV]: '0' })).toThrow(EXPIRED);
  });

  it('never throws inside the re-bless run, which may import it after rewriting every file', () => {
    expect(() => checkPortAllocChurnExpiry(V2_W, false, { [UPDATE_ENV]: '1' })).not.toThrow();
  });

  it('stays quiet while a recording is stale, and at v1`s frame', () => {
    expect(() => checkPortAllocChurnExpiry(V2_W, true, {})).not.toThrow();
    expect(() => checkPortAllocChurnExpiry(V1_W, false, {})).not.toThrow();
    expect(() => checkPortAllocChurnExpiry(V1_W, true, {})).not.toThrow();
  });

  it('names prepB.FIX3 in the reason a skipped test carries', () => {
    expect(ALLOC_CHURN_REASON).toContain('prepB.FIX3');
    expect(ALLOC_CHURN_REASON).toContain('R2-03');
  });
});
