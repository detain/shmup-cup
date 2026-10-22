/**
 * The recovery rule of zone E at runtime (plan M2-12 acceptance "recovery rule after
 * checkpoints", shmup_feat.md §10, remastered by R5-05.S6: ≥ 3 capsule sources within
 * 1,350 px after each checkpoint). The content test counts the sources in the stage file;
 * this restarts a headless game at each of the seven checkpoints — what the `arcade` death
 * penalty and continues do — and plays it perfectly (every enemy killed on its first
 * on-screen tick, through the public damage API): the capsules those sources really drop
 * before the next source beyond the window appears are exactly the sources in the window,
 * and at least three (`recovery.ts`; the other zones in `zone-<x>-recovery.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import { MIN_RECOVERY_CAPSULES, recoveryAt, shippedStage } from './recovery.js';

describe('playtest: zone E recovery after every checkpoint (M2-12, R5-05 remaster)', () => {
  const cases: [string, number][] = [];
  shippedStage('zone-e').checkpoints.forEach((_c, i) => cases.push(['zone-e', i]));

  it.each(cases)('%s checkpoint %i: ≥ 3 capsules in the window, all of them dropped', (id, cp) => {
    const { inWindow, drops, cameraX, until } = recoveryAt(id, cp);
    expect(cameraX).toBeGreaterThanOrEqual(until);
    expect(inWindow).toBeGreaterThanOrEqual(MIN_RECOVERY_CAPSULES);
    expect(drops).toBe(inWindow);
  });

  it('checks seven checkpoints per zone', () => {
    expect(cases).toHaveLength(7);
  });
});
