/**
 * Edge cases of the runner's brake (plan M1-13), beyond `stage-brake.test.ts`: a fractional ramp
 * is floored, a brake during a speed ramp resumes at that ramp's target, an unlock before the
 * camera stopped ramps back up from the current speed, pans still run while braking, a lock key
 * met while braking is released by the same unlock, a brake from a standstill locks on the next
 * tick, and a restart replaying a `speed` event before the checkpoint forgets the brake.
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type StageSpec } from '../../src/data/index.js';
import { StageSlot, createStageRunner, type StageRunner } from '../../src/stage/index.js';

/**
 * A runner on an open stage.
 *
 * @param camera - Camera keys.
 * @param events - Events.
 * @param checkpoints - Checkpoints.
 * @returns The runner.
 */
function runner(
  camera: unknown[],
  events: unknown[] = [],
  checkpoints: unknown[] = [{ x: 0 }],
): StageRunner {
  const { db, issues } = loadContent([
    {
      path: 's.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 's',
        name: 'S',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 5000,
        camera,
        checkpoints,
        parallax: [],
        tilemap: null,
        events,
      },
    },
  ]);
  expect(issues).toEqual([]);
  const stage: StageSpec = db.stages[0];
  return createStageRunner(stage, { event() {}, clear() {} });
}

/**
 * Ticks a runner, returning how far the camera moved on each tick.
 *
 * @param r - The runner.
 * @param n - Ticks.
 * @returns The steps.
 */
function steps(r: StageRunner, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = r.camera.x;
    r.tick();
    out.push(r.camera.x - x);
  }
  return out;
}

describe('core/stage — brake edge cases (M1-13)', () => {
  it('floors a fractional ramp', () => {
    const r = runner([{ x: 0, speed: 2 }]);
    steps(r, 5);
    r.brake(2.9);
    expect(r.state[StageSlot.BrakeRamp]).toBe(2);
    expect(steps(r, 3)).toEqual([1, 0, 0]);
    expect(r.locked).toBe(true);
  });

  it('resumes at the target of a speed ramp that was still running', () => {
    const r = runner([{ x: 0, speed: 4, ramp: 8 }]);
    steps(r, 2);
    expect(r.speed).toBe(1);
    r.brake(2);
    expect(r.state[StageSlot.ResumeSpeed]).toBe(4);
    steps(r, 2);
    expect(r.locked).toBe(true);
    r.unlock();
    expect(steps(r, 3)).toEqual([2, 4, 4]);
  });

  it('an unlock before the camera stopped ramps back up from the current speed', () => {
    const r = runner([{ x: 0, speed: 4 }]);
    steps(r, 3);
    r.brake(4);
    expect(steps(r, 2)).toEqual([3, 2]);
    expect(r.locked).toBe(false);
    r.unlock();
    expect(r.state[StageSlot.Braking]).toBe(0);
    // Back to 4 over the brake's 4-tick ramp, from 2.
    expect(steps(r, 5)).toEqual([2.5, 3, 3.5, 4, 4]);
    expect(r.locked).toBe(false);
  });

  it('keeps panning while braking and locked', () => {
    const r = runner([
      { x: 0, speed: 1 },
      { x: 5, speed: 1, yTo: 16, yTicks: 20 },
    ]);
    steps(r, 3);
    r.brake(1);
    steps(r, 1);
    expect(r.locked).toBe(true);
    // The pan key lies ahead of the locked camera: it never applies.
    steps(r, 30);
    expect(r.camera.y).toBe(0);
    // A pan already running keeps going under the lock.
    const s = runner([
      { x: 0, speed: 1 },
      { x: 2, speed: 1, yTo: 16, yTicks: 10 },
    ]);
    steps(s, 4);
    s.brake(0);
    const x = s.camera.x;
    steps(s, 20);
    expect([s.camera.x, s.camera.y]).toEqual([x, 16]);
  });

  it('a lock key met while braking is released by the same unlock', () => {
    const r = runner([
      { x: 0, speed: 3 },
      { x: 12, speed: 2, lock: true },
    ]);
    steps(r, 2);
    r.brake(10);
    // 6 → 8.7 → 11.1 → stopped at the lock key's x (12); the key locks on the next tick and
    // only records its speed for the unlock.
    steps(r, 10);
    expect(r.camera.x).toBe(12);
    expect(r.locked).toBe(true);
    expect(r.state[StageSlot.ResumeSpeed]).toBe(2);
    r.unlock();
    expect(r.locked).toBe(false);
    steps(r, 20);
    expect(r.speed).toBe(2);
    expect(r.camera.x).toBeGreaterThan(12);
  });

  it('locks on the next tick when the camera already stands still', () => {
    const r = runner([
      { x: 0, speed: 1 },
      { x: 3, speed: 0 },
    ]);
    steps(r, 10);
    expect(r.speed).toBe(0);
    r.brake(60);
    expect(r.locked).toBe(false);
    steps(r, 1);
    expect(r.locked).toBe(true);
    // Resuming "at speed 0": still standing.
    r.unlock();
    expect(steps(r, 70).every((dx) => dx === 0)).toBe(true);
  });

  it('a restart replaying a passed speed event takes that speed, the brake forgotten', () => {
    const r = runner(
      [{ x: 0, speed: 1 }],
      [{ x: 4, type: 'speed', speed: 3 }],
      [{ x: 0 }, { x: 10 }],
    );
    steps(r, 20);
    r.brake(5);
    steps(r, 10);
    expect(r.locked).toBe(true);
    r.restartAt(1);
    expect([r.locked, r.state[StageSlot.Braking], r.state[StageSlot.ResumeSpeed]]).toEqual([
      false,
      0,
      0,
    ]);
    expect(steps(r, 2)).toEqual([3, 3]);
  });
});
