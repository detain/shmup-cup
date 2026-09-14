/**
 * The recovery rule of zones F and G at runtime (plan M2-13 acceptance "as M2-11": the recovery rule
 * after checkpoints, shmup_feat.md §10): restarted at each checkpoint of CELL VAULT and PRISM
 * LABYRINTH and played perfectly (every enemy killed on its first on-screen tick), the capsules
 * dropped before the next source beyond the 900-px window are exactly the window's sources, and at
 * least three (`recovery.ts`). The dividing cells' halves, the geodes' shards and the cube rushes
 * drop nothing of their own; the cube rushes' formations carry no drop.
 */
import { describe, expect, it } from 'vitest';
import { MIN_RECOVERY_CAPSULES, recoveryAt, shippedStage } from './recovery.js';

describe('playtest: zones F and G recovery after every checkpoint (M2-13)', () => {
  const cases: [string, number][] = [];
  for (const id of ['zone-f', 'zone-g']) {
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
