/**
 * The recovery rule of zones B and C at runtime (plan M2-11 acceptance "recovery rule after
 * checkpoints", shmup_feat.md §10): restarted at each checkpoint of BRINE NEBULA and DUNE EXPANSE
 * and played perfectly (every enemy killed on its first on-screen tick), the capsules dropped
 * before the next source beyond the 900-px window are exactly the window's sources, and at least
 * three — bubbles that split, a bubble's fish, a sand worm's segments and a geyser's clods drop
 * nothing of their own (`recovery.ts`).
 */
import { describe, expect, it } from 'vitest';
import { MIN_RECOVERY_CAPSULES, recoveryAt, shippedStage } from './recovery.js';

describe('playtest: zones B and C recovery after every checkpoint (M2-11)', () => {
  const cases: [string, number][] = [];
  for (const id of ['zone-b', 'zone-c']) {
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
