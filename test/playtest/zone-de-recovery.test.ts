/**
 * The recovery rule of zones D and E at runtime (plan M2-12 acceptance "recovery rule after
 * checkpoints", shmup_feat.md §10): restarted at each checkpoint of MAGMA DEEP and TEMPEST RIDGE
 * and played perfectly (every enemy killed on its first on-screen tick), the capsules dropped
 * before the next source beyond the 900-px window are exactly the window's sources, and at least
 * three — the lava bombs of the cones drop nothing of their own (`recovery.ts`). Zone D's third
 * checkpoint lies in the caves, after the dive: the restart puts the camera back down there.
 */
import { describe, expect, it } from 'vitest';
import { MIN_RECOVERY_CAPSULES, recoveryAt, shippedStage } from './recovery.js';

describe('playtest: zones D and E recovery after every checkpoint (M2-12)', () => {
  const cases: [string, number][] = [];
  for (const id of ['zone-d', 'zone-e']) {
    shippedStage(id).checkpoints.forEach((_c, i) => cases.push([id, i]));
  }

  it.each(cases)('%s checkpoint %i: ≥ 3 capsules in the window, all of them dropped', (id, cp) => {
    const { inWindow, drops, cameraX, until } = recoveryAt(id, cp);
    expect(cameraX).toBeGreaterThanOrEqual(until);
    expect(inWindow).toBeGreaterThanOrEqual(MIN_RECOVERY_CAPSULES);
    expect(drops).toBe(inWindow);
  });

  it('checks four checkpoints per zone', () => {
    expect(cases).toHaveLength(8);
  });
});
