/**
 * Edge cases of `StageRunner.jumpTo` (the debug stage skip of plan M1-18), beyond
 * `stage-jump.test.ts`:
 *
 * - a stage without checkpoints (`jumpTo(0)` equals `restartAt(-1)`, the checkpoint stays -1) and
 *   one whose first checkpoint is not at 0 (-1 until the camera passes it);
 * - a camera key at exactly x stays pending and applies with its ramp and pan on the next tick;
 *   keys and speed events before x apply in x order (the later one wins);
 * - a lock key before x does not lock (like a restart), one after x still stops the camera;
 * - a jump re-opens an ended stage, releases a brake, counts as a restart and resets the tick
 *   counter; fractional x is allowed;
 * - a jump from inside `hooks.event` stops that tick's event loop (the events it skipped never
 *   fire);
 * - the result depends only on x, never on the history of the runner.
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type StageEvent, type StageSpec } from '../../src/data/index.js';
import {
  StageSlot,
  createStageRunner,
  type StageHooks,
  type StageRunner,
} from '../../src/stage/index.js';

/**
 * A validated stage from a partial description.
 *
 * @param fields - Overrides of the base stage (length 1000, one key at 0, no events).
 * @returns The stage (asserted issue-free).
 */
function stage(fields: Record<string, unknown>): StageSpec {
  const { db, issues } = loadContent([
    {
      path: 'stages/j.stage.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 'j',
        name: 'J',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 1000,
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [],
        parallax: [],
        tilemap: null,
        events: [],
        ...fields,
      },
    },
  ]);
  expect(issues).toEqual([]);
  return db.stages[0];
}

/**
 * Hooks recording the fired event indices and the clears; `onEvent` may act on the runner.
 *
 * @param onEvent - Called for every fired event after it is recorded.
 * @returns The hooks.
 */
function recorder(
  onEvent?: (index: number) => void,
): StageHooks & { fired: number[]; clears: number } {
  const hooks = {
    fired: [] as number[],
    clears: 0,
    event(_code: number, _event: StageEvent, index: number) {
      hooks.fired.push(index);
      onEvent?.(index);
    },
    clear() {
      hooks.clears++;
    },
  };
  return hooks;
}

/**
 * Ticks a runner until a condition holds (bounded).
 *
 * @param runner - The runner.
 * @param done - The condition.
 * @param limit - Tick limit.
 * @returns Ticks run.
 */
function tickUntil(runner: StageRunner, done: () => boolean, limit = 5000): number {
  let ticks = 0;
  while (!done() && ticks < limit) {
    runner.tick();
    ticks++;
  }
  return ticks;
}

describe('core/stage StageRunner.jumpTo — edge cases (M1-18)', () => {
  it('without checkpoints: jumpTo(0) equals restartAt(-1) and the checkpoint stays -1', () => {
    const spec = stage({ events: [{ x: 300, type: 'music', cue: 'Boss' }] });
    const a = createStageRunner(spec, recorder());
    const b = createStageRunner(spec, recorder());
    for (let i = 0; i < 40; i++) {
      a.tick();
      b.tick();
    }
    a.restartAt(-1);
    b.jumpTo(0);
    expect(Array.from(b.state)).toEqual(Array.from(a.state));
    expect([b.camera.x, b.camera.y]).toEqual([a.camera.x, a.camera.y]);
    b.jumpTo(500);
    expect(b.checkpoint).toBe(-1);
    expect(b.eventCursor).toBe(1); // the music at 300 lies behind
    tickUntil(b, () => b.camera.x >= 999);
    expect(b.checkpoint).toBe(-1);
  });

  it('keeps the checkpoint at -1 before a first checkpoint that is not at 0, until it is passed', () => {
    const runner = createStageRunner(stage({ checkpoints: [{ x: 300 }, { x: 600 }] }), recorder());
    runner.jumpTo(100);
    expect(runner.checkpoint).toBe(-1);
    runner.tick();
    expect(runner.checkpoint).toBe(-1);
    tickUntil(runner, () => runner.camera.x >= 300);
    expect(runner.checkpoint).toBe(0);
    // Exactly at a checkpoint: that one; just before the next: still that one.
    runner.jumpTo(600);
    expect(runner.checkpoint).toBe(1);
    runner.jumpTo(599.5);
    expect(runner.checkpoint).toBe(0);
  });

  it('leaves a camera key at exactly x pending: its ramp and pan start on the next tick', () => {
    const runner = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 1 },
          { x: 200, speed: 2, ramp: 20, yTo: 40, yTicks: 30 },
        ],
      }),
      recorder(),
    );
    runner.jumpTo(200);
    expect(runner.speed).toBe(1);
    expect(runner.camera.y).toBe(0);
    runner.tick();
    expect(runner.targetSpeed).toBe(2);
    expect(runner.speed).toBeCloseTo(1.05, 12); // one twentieth of the ramp
    expect(runner.camera.y).toBeGreaterThan(0);
    expect(runner.camera.y).toBeLessThan(40);
    tickUntil(runner, () => runner.camera.y === 40, 100);
    expect(runner.camera.y).toBe(40);
    // Past the key: its speed and pan at once, no ramp.
    runner.jumpTo(201);
    expect(runner.speed).toBe(2);
    expect(runner.targetSpeed).toBe(2);
    expect(runner.camera.y).toBe(40);
  });

  it('applies keys and speed events before x in x order: the later one wins', () => {
    const spec = stage({
      camera: [
        { x: 0, speed: 1 },
        { x: 600, speed: 0.5 },
      ],
      events: [
        { x: 400, type: 'speed', speed: 3 },
        { x: 800, type: 'speed', speed: 2 },
      ],
    });
    const runner = createStageRunner(spec, recorder());
    const speedAt = (x: number): number => {
      runner.jumpTo(x);
      return runner.speed;
    };
    expect(speedAt(399)).toBe(1);
    expect(speedAt(400)).toBe(3); // the event at exactly x: its runner part applied at once
    expect(speedAt(599)).toBe(3);
    expect(speedAt(650)).toBe(0.5);
    expect(speedAt(900)).toBe(2);
    expect(speedAt(0)).toBe(0); // the stage start: the first tick applies the key at 0
    runner.tick();
    expect(runner.speed).toBe(1);
  });

  it('does not re-lock at a lock key before x; a lock key after x still stops the camera', () => {
    const spec = stage({
      camera: [
        { x: 0, speed: 2 },
        { x: 300, speed: 2, lock: true },
      ],
    });
    const runner = createStageRunner(spec, recorder());
    runner.jumpTo(400);
    expect(runner.locked).toBe(false);
    runner.tick();
    expect(runner.camera.x).toBe(402);
    runner.jumpTo(100);
    tickUntil(runner, () => runner.locked, 400);
    expect(runner.locked).toBe(true);
    expect(runner.camera.x).toBe(300);
    for (let i = 0; i < 30; i++) runner.tick();
    expect(runner.camera.x).toBe(300);
  });

  it('re-opens an ended stage: the end fires again once the camera reaches it', () => {
    const hooks = recorder();
    const spec = stage({ events: [{ x: 900, type: 'end' }] });
    const runner = createStageRunner(spec, hooks);
    tickUntil(runner, () => runner.ended);
    expect(runner.ended).toBe(true);
    runner.jumpTo(850);
    expect(runner.ended).toBe(false);
    expect(runner.eventCursor).toBe(0);
    tickUntil(runner, () => runner.ended);
    expect(runner.ended).toBe(true);
    expect(hooks.fired).toEqual([0, 0]);
    // Jumping past the end event: its runner part is not replayed as live (never re-ends).
    runner.jumpTo(950);
    expect(runner.ended).toBe(false);
    for (let i = 0; i < 200; i++) runner.tick();
    expect(runner.ended).toBe(false);
    expect(runner.camera.x).toBe(1000);
  });

  it('releases a brake, counts as a restart and resets the tick counter', () => {
    const hooks = recorder();
    const runner = createStageRunner(stage({}), hooks);
    for (let i = 0; i < 100; i++) runner.tick();
    runner.brake(10);
    tickUntil(runner, () => runner.locked, 50);
    expect(runner.locked).toBe(true);
    const restarts = runner.state[StageSlot.Restarts];
    const x = runner.camera.x;
    runner.jumpTo(x);
    expect(runner.locked).toBe(false);
    expect(runner.state[StageSlot.Braking]).toBe(0);
    expect(runner.state[StageSlot.Restarts]).toBe(restarts + 1);
    expect(runner.ticks).toBe(0);
    expect(hooks.clears).toBe(1);
    runner.tick();
    expect(runner.camera.x).toBeGreaterThan(x);
  });

  it('accepts a fractional x', () => {
    const spec = stage({
      checkpoints: [{ x: 0 }, { x: 420 }],
      events: [
        { x: 420, type: 'music', cue: 'Stage' },
        { x: 421, type: 'music', cue: 'Boss' },
      ],
    });
    const hooks = recorder();
    const runner = createStageRunner(spec, hooks);
    runner.jumpTo(420.5);
    expect(runner.camera.x).toBe(420.5);
    expect(runner.checkpoint).toBe(1);
    expect(runner.eventCursor).toBe(1); // the event at 420 lies behind, the one at 421 ahead
    runner.tick();
    expect(runner.camera.x).toBe(421.5);
    expect(hooks.fired).toEqual([1]);
  });

  it('stops the tick’s event loop when a hook jumps: the skipped events never fire', () => {
    const spec = stage({
      events: [
        { x: 250, type: 'flag', flag: 'a' },
        { x: 250, type: 'flag', flag: 'b' },
        { x: 500, type: 'music', cue: 'Boss' },
        { x: 700, type: 'music', cue: 'Stage' },
      ],
    });
    let runner: StageRunner | null = null;
    let jumped = false;
    const hooks = recorder((index) => {
      if (index === 0 && !jumped) {
        jumped = true;
        runner?.jumpTo(500);
      }
    });
    runner = createStageRunner(spec, hooks);
    const r = runner;
    tickUntil(r, () => jumped);
    expect(hooks.fired).toEqual([0]);
    expect(r.camera.x).toBe(500);
    // The jump re-derived the flags at 500: `a` and `b` are set, though the hooks never saw `b`.
    expect(r.flags).toBe(3);
    r.tick(); // the event at exactly 500 re-fires for the hooks
    expect(hooks.fired).toEqual([0, 2]);
    tickUntil(r, () => r.camera.x >= 999);
    expect(hooks.fired).toEqual([0, 2, 3]);
    expect(hooks.clears).toBe(1);
  });

  it('depends only on x, never on how the runner got there', () => {
    const spec = stage({
      camera: [
        { x: 0, speed: 1, ramp: 10 },
        { x: 200, speed: 2, ramp: 20, yTo: 24, yTicks: 30 },
        { x: 600, speed: 0.5 },
      ],
      checkpoints: [{ x: 0 }, { x: 300 }, { x: 700 }],
      events: [
        { x: 250, type: 'flag', flag: 'a' },
        { x: 400, type: 'speed', speed: 3 },
        { x: 450, type: 'flag', flag: 'b' },
        { x: 800, type: 'flag', flag: 'a', value: false },
      ],
    });
    const fresh = createStageRunner(spec, recorder());
    const played = createStageRunner(spec, recorder());
    for (let i = 0; i < 700; i++) played.tick();
    played.restartAt(2);
    played.brake(5);
    for (let i = 0; i < 20; i++) played.tick();
    for (const x of [0, 150, 300, 455.25, 700, 850, 1000]) {
      fresh.jumpTo(x);
      played.jumpTo(x);
      const a = Array.from(fresh.state);
      const b = Array.from(played.state);
      a[StageSlot.Restarts] = 0;
      b[StageSlot.Restarts] = 0;
      expect(b, `x ${String(x)}`).toEqual(a);
      expect([played.camera.x, played.camera.y]).toEqual([fresh.camera.x, fresh.camera.y]);
    }
    expect(fresh.flags).toBe(2); // at 1000: `a` cleared at 800, `b` still set
  });
});
