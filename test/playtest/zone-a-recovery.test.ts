/**
 * The recovery rule of zone A at runtime (plan M1-18, shmup_feat.md §10: ≥ 3 capsule sources
 * within 900 px after each checkpoint). The content test counts the sources in the stage file;
 * this restarts a headless game at each checkpoint — what the `arcade` death penalty and continues
 * do — and plays it perfectly (every enemy killed on its first on-screen tick, through the public
 * damage API): the capsules those sources really drop before the next source beyond the window
 * appears are exactly the sources in the window, and at least three (`recovery.ts`; zones B and C
 * in `zone-bc-recovery.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import { MIN_RECOVERY_CAPSULES, RECOVERY_WINDOW, recoveryAt } from './recovery.js';

describe('playtest: zone A recovery after every checkpoint (M1-18)', () => {
  it.each([0, 1, 2])(
    `drops ≥ ${String(MIN_RECOVERY_CAPSULES)} capsules within ${String(RECOVERY_WINDOW)} px of checkpoint %i`,
    (checkpoint) => {
      const { inWindow, drops, cameraX, until } = recoveryAt('zone-a', checkpoint);
      expect(cameraX).toBeGreaterThanOrEqual(until);
      expect(inWindow).toBeGreaterThanOrEqual(MIN_RECOVERY_CAPSULES);
      expect(drops).toBe(inWindow);
    },
  );
});
