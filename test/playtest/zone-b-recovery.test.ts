/**
 * The recovery rule of zone B at runtime (plan M2-11 acceptance "recovery rule after
 * checkpoints", shmup_feat.md §10): restarted at each checkpoint of BRINE NEBULA and
 * played perfectly (every enemy killed on its first on-screen tick), the capsules dropped
 * before the next source beyond the 900-px window are exactly the window's sources, and at
 * least three — bubbles that split, a bubble's fish and a geyser's clods drop
 * nothing of their own (`recovery.ts`).
 */
import { describe, expect, it } from 'vitest';
import { MIN_RECOVERY_CAPSULES, recoveryAt, shippedStage } from './recovery.js';

describe('playtest: zone B recovery after every checkpoint (M2-11)', () => {
  const cases: [string, number][] = [];
  shippedStage('zone-b').checkpoints.forEach((_c, i) => cases.push(['zone-b', i]));

  it.each(cases)('%s checkpoint %i: ≥ 3 capsules in the window, all of them dropped', (id, cp) => {
    const { inWindow, drops, cameraX, until } = recoveryAt(id, cp);
    expect(cameraX).toBeGreaterThanOrEqual(until);
    expect(inWindow).toBeGreaterThanOrEqual(MIN_RECOVERY_CAPSULES);
    expect(drops).toBe(inWindow);
  });

  it('checks six checkpoints per zone', () => {
    // The R5-02.S5a geometry (design §4) gave BRINE NEBULA six checkpoints.
    expect(cases).toHaveLength(6);
  });
});
