/**
 * The recovery rule of zone D at runtime (plan M2-12 acceptance "recovery rule after
 * checkpoints", shmup_feat.md §10): restarted at each checkpoint of MAGMA DEEP and
 * played perfectly (every enemy killed on its first on-screen tick), the capsules dropped
 * before the next source beyond the 1,350-px window are exactly the window's sources, and at
 * least three — the lava bombs of the cones drop nothing of their own. Zone
 * D's remastered line has six checkpoints (`designs/zone-d.md` §4): the third lies on the
 * dive's first step and the last three deep in the caves — the restart puts the camera back
 * down there. (`recovery.ts`).
 */
import { describe, expect, it } from 'vitest';
import { MIN_RECOVERY_CAPSULES, recoveryAt, shippedStage } from './recovery.js';

describe('playtest: zone D recovery after every checkpoint (M2-12)', () => {
  const cases: [string, number][] = [];
  shippedStage('zone-d').checkpoints.forEach((_c, i) => cases.push(['zone-d', i]));

  it.each(cases)('%s checkpoint %i: ≥ 3 capsules in the window, all of them dropped', (id, cp) => {
    const { inWindow, drops, cameraX, until } = recoveryAt(id, cp);
    expect(cameraX).toBeGreaterThanOrEqual(until);
    expect(inWindow).toBeGreaterThanOrEqual(MIN_RECOVERY_CAPSULES);
    expect(drops).toBe(inWindow);
  });

  // `designs/zone-d.md` §4: the remastered MAGMA DEEP has six checkpoints (the R5-04.S6
  // retarget of the M2-12-era four).
  it('checks six checkpoints per zone', () => {
    expect(cases).toHaveLength(6);
  });
});
