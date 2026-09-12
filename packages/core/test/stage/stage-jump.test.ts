/**
 * `StageRunner.jumpTo` — the debug stage skip of plan M1-18: a restart at any scroll x.
 *
 * - at a checkpoint's x it leaves exactly the state `restartAt` leaves (every state slot, the
 *   camera);
 * - between checkpoints: the camera at x, the speed / pan / flags of the keys and events before
 *   it, the cursor at the first event at or after x, the last checkpoint at or before x, one
 *   `clear()`; the events it skipped never fire, those at or after x fire as the camera reaches
 *   them;
 * - bad x (negative, past `length`, NaN) is a `RangeError`.
 */
import { describe, expect, it } from 'vitest';
import { loadContent, type StageEvent, type StageSpec } from '../../src/data/index.js';
import { StageEventCode, createStageRunner, type StageHooks } from '../../src/stage/index.js';

/**
 * A stage with keys, a pan, speed / flag events, checkpoints and spawns.
 *
 * @returns The stage (asserted issue-free).
 */
function stage(): StageSpec {
  const { db, issues } = loadContent([
    {
      path: 'stages/s.stage.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 's',
        name: 'S',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 1000,
        camera: [
          { x: 0, speed: 1, ramp: 10 },
          { x: 200, speed: 2, ramp: 20, yTo: 40, yTicks: 30 },
          { x: 600, speed: 0.5 },
        ],
        checkpoints: [{ x: 0 }, { x: 300 }, { x: 700 }],
        parallax: [],
        tilemap: null,
        events: [
          { x: 100, type: 'music', cue: 'Boss' },
          { x: 250, type: 'flag', flag: 'a' },
          { x: 300, type: 'music', cue: 'Stage' },
          { x: 400, type: 'speed', speed: 3 },
          { x: 450, type: 'flag', flag: 'b' },
          { x: 500, type: 'music', cue: 'Stage' },
          { x: 900, type: 'end' },
        ],
      },
    },
  ]);
  expect(issues).toEqual([]);
  return db.stages[0];
}

/**
 * Hooks recording the fired event indices and the clears.
 *
 * @returns The hooks.
 */
function recorder(): StageHooks & { fired: number[]; clears: number } {
  const hooks = {
    fired: [] as number[],
    clears: 0,
    event(_code: number, _event: StageEvent, index: number) {
      hooks.fired.push(index);
    },
    clear() {
      hooks.clears++;
    },
  };
  return hooks;
}

describe('core/stage StageRunner.jumpTo (M1-18)', () => {
  it('equals restartAt at every checkpoint', () => {
    const spec = stage();
    for (const [x, index] of [
      [0, 0],
      [300, 1],
      [700, 2],
    ] as const) {
      const a = createStageRunner(spec, recorder());
      const b = createStageRunner(spec, recorder());
      for (let i = 0; i < 50; i++) {
        a.tick();
        b.tick();
      }
      a.restartAt(index);
      b.jumpTo(x);
      expect(Array.from(b.state), `x ${String(x)}`).toEqual(Array.from(a.state));
      expect([b.camera.x, b.camera.y]).toEqual([a.camera.x, a.camera.y]);
    }
  });

  it('jumps between checkpoints: state of the keys and events before x, later events still fire', () => {
    const spec = stage();
    const hooks = recorder();
    const runner = createStageRunner(spec, hooks);
    runner.tick();
    hooks.fired.length = 0;
    runner.jumpTo(420);
    expect(hooks.clears).toBe(1);
    expect(runner.camera.x).toBe(420);
    expect(runner.camera.y).toBe(40); // the pan of the key at 200, applied at once
    expect(runner.speed).toBe(3); // the speed event at 400 after the key at 200
    expect(runner.flags).toBe(1); // flag `a` (250) set, `b` (450) not yet
    expect(runner.eventCursor).toBe(4);
    expect(runner.checkpoint).toBe(1); // the checkpoint at 300
    expect(runner.locked).toBe(false);
    // On to the end: the skipped events never fire, the rest fire in order, exactly once.
    for (let i = 0; i < 2000 && !runner.ended; i++) runner.tick();
    expect(hooks.fired).toEqual([4, 5, 6]);
    expect(runner.flags).toBe(3);
    expect(runner.checkpoint).toBe(2);
    expect(spec.events[6].type).toBe('end');
    expect(runner.eventCodes[6]).toBe(StageEventCode.End);
  });

  it('re-fires the events at exactly x for the hooks on the next tick', () => {
    const hooks = recorder();
    const runner = createStageRunner(stage(), hooks);
    runner.jumpTo(500);
    expect(hooks.fired).toEqual([]);
    runner.tick();
    expect(hooks.fired).toEqual([5]);
  });

  it('rejects an x outside the stage', () => {
    const runner = createStageRunner(stage(), recorder());
    for (const x of [-1, 1000.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => runner.jumpTo(x), String(x)).toThrow(RangeError);
    }
    expect(() => runner.jumpTo('3' as unknown as number)).toThrow(RangeError);
    expect(() => runner.jumpTo(1000)).not.toThrow();
    expect(runner.camera.x).toBe(1000);
  });
});
