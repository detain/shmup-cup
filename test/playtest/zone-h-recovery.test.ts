/**
 * The recovery rule of zone H at runtime (plan M2-14 acceptance "recovery rule after
 * checkpoints", shmup_feat.md §10): restarted at each checkpoint of IRON CITADEL and
 * played perfectly (every enemy killed on its first on-screen tick), the capsules dropped
 * before the next source beyond the 1,350-px window (900 · WORLD_SCALE) are exactly the
 * window's sources, and at least three — the hatches' mites, the gate's sentries and the
 * parade's captains drop nothing of their own (`recovery.ts`; the six-checkpoint premise is
 * the R5-08.S6 retarget to the §2 checkpoint table).
 */
import { describe, expect, it } from 'vitest';
import { MIN_RECOVERY_CAPSULES, recoveryAt, shippedStage } from './recovery.js';

describe('playtest: zone H recovery after every checkpoint (M2-14)', () => {
  const cases: [string, number][] = [];
  shippedStage('zone-h').checkpoints.forEach((_c, i) => cases.push(['zone-h', i]));

  it.each(cases)('%s checkpoint %i: ≥ 3 capsules in the window, all of them dropped', (id, cp) => {
    const { inWindow, drops, cameraX, until } = recoveryAt(id, cp);
    expect(cameraX).toBeGreaterThanOrEqual(until);
    expect(inWindow).toBeGreaterThanOrEqual(MIN_RECOVERY_CAPSULES);
    expect(drops).toBe(inWindow);
  });

  it('checks the six §2 checkpoints of the remastered stage', () => {
    expect(cases).toHaveLength(6);
  });
});
