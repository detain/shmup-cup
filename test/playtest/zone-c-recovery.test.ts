/**
 * The recovery rule of zone C at runtime (plan M2-11 acceptance "recovery rule after
 * checkpoints", shmup_feat.md §10): restarted at each checkpoint of DUNE EXPANSE and
 * played perfectly (every enemy killed on its first on-screen tick), the capsules dropped
 * before the next source beyond the 1,350-px window (`recovery.ts`'s `RECOVERY_WINDOW` =
 * 900 · WORLD_SCALE) are exactly the window's sources, and at least three — a sand worm's
 * segments drop nothing of their own (`recovery.ts`).
 */
import { describe, expect, it } from 'vitest';
import { MIN_RECOVERY_CAPSULES, recoveryAt, shippedStage } from './recovery.js';

describe('playtest: zone C recovery after every checkpoint (M2-11)', () => {
  const cases: [string, number][] = [];
  shippedStage('zone-c').checkpoints.forEach((_c, i) => cases.push(['zone-c', i]));

  it.each(cases)('%s checkpoint %i: ≥ 3 capsules in the window, all of them dropped', (id, cp) => {
    const { inWindow, drops, cameraX, until } = recoveryAt(id, cp);
    expect(cameraX).toBeGreaterThanOrEqual(until);
    expect(inWindow).toBeGreaterThanOrEqual(MIN_RECOVERY_CAPSULES);
    expect(drops).toBe(inWindow);
  });

  it('checks seven checkpoints per zone', () => {
    // The R5-03.S5a geometry (design §4) gave DUNE EXPANSE seven checkpoints.
    expect(cases).toHaveLength(7);
  });
});
