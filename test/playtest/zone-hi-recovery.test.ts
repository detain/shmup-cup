/**
 * The recovery rule of zones H and I at runtime (plan M2-14 acceptance "as M2-11": the recovery rule
 * after checkpoints, shmup_feat.md §10): restarted at each checkpoint of IRON CITADEL and ABYSSAL
 * THRONE and played perfectly (every enemy killed on its first on-screen tick), the capsules
 * dropped before the next source beyond the 900-px window are exactly the window's sources, and at
 * least three (`recovery.ts`). The hatches' mites, the parade's captains, the mines and the eels
 * drop nothing of their own.
 */
import { describe, expect, it } from 'vitest';
import { MIN_RECOVERY_CAPSULES, recoveryAt, shippedStage } from './recovery.js';

describe('playtest: zones H and I recovery after every checkpoint (M2-14)', () => {
  const cases: [string, number][] = [];
  for (const id of ['zone-h', 'zone-i']) {
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
