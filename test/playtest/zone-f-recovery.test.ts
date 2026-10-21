/**
 * The recovery rule of zone F at runtime (plan M2-13 acceptance "recovery rule after
 * checkpoints", shmup_feat.md §10): restarted at each checkpoint of CELL VAULT and
 * played perfectly (every enemy killed on its first on-screen tick), the capsules dropped
 * before the next source beyond the 900-px window are exactly the window's sources, and at
 * least three — the dividing cells' halves drop nothing of their own (`recovery.ts`).
 */
import { describe, expect, it } from 'vitest';
import { MIN_RECOVERY_CAPSULES, recoveryAt, shippedStage } from './recovery.js';

describe('playtest: zone F recovery after every checkpoint (M2-13)', () => {
  const cases: [string, number][] = [];
  shippedStage('zone-f').checkpoints.forEach((_c, i) => cases.push(['zone-f', i]));

  it.each(cases)('%s checkpoint %i: ≥ 3 capsules in the window, all of them dropped', (id, cp) => {
    const { inWindow, drops, cameraX, until } = recoveryAt(id, cp);
    expect(cameraX).toBeGreaterThanOrEqual(until);
    expect(inWindow).toBeGreaterThanOrEqual(MIN_RECOVERY_CAPSULES);
    expect(drops).toBe(inWindow);
  });

  it('checks four checkpoints per zone', () => {
    expect(cases).toHaveLength(4);
  });
});
