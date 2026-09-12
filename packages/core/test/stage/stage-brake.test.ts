/**
 * The runner's brake (plan M1-13 — the boss WARNING's "camera decelerates to a lock"): the speed
 * ramps linearly to 0, then the camera locks; keys and `speed` events met on the way only record
 * the speed to resume at; `unlock()` ramps back up; a second brake changes nothing; a restart
 * forgets it; `brake(0)` stops at once.
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type StageSpec } from '../../src/data/index.js';
import {
  STAGE_STATE_SLOTS,
  StageSlot,
  createStageRunner,
  type StageRunner,
} from '../../src/stage/index.js';

/**
 * A runner on an open stage.
 *
 * @param camera - Camera keys.
 * @param events - Events.
 * @returns The runner.
 */
function runner(camera: unknown[], events: unknown[] = []): StageRunner {
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
        checkpoints: [{ x: 0 }],
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
 * Ticks a runner.
 *
 * @param r - The runner.
 * @param n - Ticks.
 */
function tick(r: StageRunner, n: number): void {
  for (let i = 0; i < n; i++) r.tick();
}

describe('core/stage — brake to a lock (M1-13)', () => {
  it('keeps its state in the hashed slot array', () => {
    expect(STAGE_STATE_SLOTS).toBe(22);
    expect([StageSlot.Braking, StageSlot.ResumeSpeed, StageSlot.BrakeRamp]).toEqual([19, 20, 21]);
  });

  it('decelerates linearly to 0 over the ramp, then locks where it stopped', () => {
    const r = runner([{ x: 0, speed: 2 }]);
    tick(r, 10);
    expect(r.camera.x).toBe(20); // the key at 0 applies on the first tick, before it moves
    r.brake(4);
    expect(r.locked).toBe(false);
    const steps: number[] = [];
    for (let i = 0; i < 4; i++) {
      const x = r.camera.x;
      r.tick();
      steps.push(r.camera.x - x);
    }
    expect(steps).toEqual([1.5, 1, 0.5, 0]);
    expect(r.locked).toBe(true);
    const x = r.camera.x;
    tick(r, 100);
    expect(r.camera.x).toBe(x);
    expect(r.state[StageSlot.Braking]).toBe(1);
    // A second brake while it holds changes nothing.
    r.brake(1);
    expect(r.state[StageSlot.BrakeRamp]).toBe(4);
  });

  it('records the speed of keys and speed events met while braking and resumes there', () => {
    const r = runner(
      [
        { x: 0, speed: 1 },
        { x: 20, speed: 3, ramp: 5 },
      ],
      [{ x: 30, type: 'speed', speed: 2 }],
    );
    tick(r, 10);
    r.brake(60);
    tick(r, 60);
    expect(r.locked).toBe(true);
    expect(r.camera.x).toBeGreaterThan(30);
    expect(r.speed).toBe(0);
    expect(r.state[StageSlot.ResumeSpeed]).toBe(2); // the key's 3, then the event's 2
    r.unlock();
    expect(r.locked).toBe(false);
    expect(r.state[StageSlot.Braking]).toBe(0);
    tick(r, 30);
    expect(r.speed).toBe(1);
    tick(r, 30);
    expect(r.speed).toBe(2);
  });

  it('stops at once for brake(0), and a restart forgets the brake', () => {
    const r = runner([{ x: 0, speed: 1 }]);
    tick(r, 5);
    r.brake(0);
    expect(r.locked).toBe(true);
    const x = r.camera.x;
    tick(r, 10);
    expect(r.camera.x).toBe(x);
    r.restartAt(0);
    expect([r.locked, r.state[StageSlot.Braking]]).toEqual([false, 0]);
    tick(r, 3);
    expect(r.camera.x).toBe(3);
    // A negative ramp is a stop at once too; unlock without a brake just releases.
    r.brake(-5);
    expect(r.locked).toBe(true);
    r.unlock();
    tick(r, 1);
    expect(r.speed).toBe(1);
  });
});
