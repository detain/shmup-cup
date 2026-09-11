/**
 * Edge cases of the stage runtime (plan M1-07), beyond the acceptance suite in `stage.test.ts`:
 *
 * - camera path: ramps restarted mid-ramp, one-tick ramps, speed events with and without ramps,
 *   pans restarted mid-pan and continuing through a lock, scroll stops (speed 0), locks at the
 *   first key, at the stage end and behind a speed event, `unlock()` before the lock engages;
 * - randomised invariants over generated stages: the camera never moves back or past `length`,
 *   `dx` / `vx` equal its movement, it rests exactly on every lock key, every event fires exactly
 *   once on the first tick the camera reaches its x (after the runner applied its own part),
 *   the cursor counts the fired events and the checkpoint is the last one passed;
 * - flags up to bit 31 (unsigned), idempotent sets / clears, `end` (the camera keeps going);
 * - checkpoints: no checkpoints, repeated restarts, a checkpoint on a lock key or on an `end`,
 *   restarting past a lock, ramps and pans before the checkpoint settled, `clear()` counts, and
 *   a randomised live-vs-restart equivalence (regression for the M1-07 review finding "restart
 *   key / event order at a shared x");
 * - `findEventCursor` against a linear scan, the camera object, unknown event types, the
 *   parallax / terrain helpers, and zero allocation with locks, pans and hooks that unlock.
 */
import { describe, expect, it } from 'vitest';
import {
  loadContent,
  type ContentDb,
  type StageEvent,
  type StageSpec,
} from '../../src/data/index.js';
import { createRng, type Rng } from '../../src/rng/index.js';
import {
  StageEventCode,
  StageSlot,
  createParallaxView,
  createStageCamera,
  createStageRunner,
  createStageTerrain,
  createTerrainView,
  findEventCursor,
  stageMapWidth,
  updateParallaxView,
  type StageHooks,
  type StageRunner,
} from '../../src/stage/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/** A tileset with one full block (enough for RLE maps). */
const TILESET = {
  formatVersion: 1,
  kind: 'tileset',
  id: 'rock',
  sprite: 'tiles/terrain-a',
  tileSize: 8,
  tiles: [
    { name: 'solid', type: 'solid', frame: 0, anchor: 'floor', mask: [8, 8, 8, 8, 8, 8, 8, 8] },
  ],
};

/**
 * Loads one stage body (plus the tileset above).
 *
 * @param body - Stage fields over a minimal valid stage (length 1000, speed 1).
 * @returns The DB (asserted issue-free).
 */
function stageDb(body: Record<string, unknown>): ContentDb {
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
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [],
        parallax: [],
        tilemap: null,
        events: [],
        ...body,
      },
    },
    { path: 'tilesets/rock.tileset.json', data: TILESET },
  ]);
  expect(issues).toEqual([]);
  return db;
}

/**
 * A stage spec from {@link stageDb}.
 *
 * @param body - Stage fields.
 * @returns The stage.
 */
function stage(body: Record<string, unknown>): StageSpec {
  return stageDb(body).stages[0];
}

/** Hooks that ignore everything. */
const NO_HOOKS: StageHooks = { event() {}, clear() {} };

/** One recorded hook call. */
interface Fired {
  /** Ticks done when it fired (the tick it fired on, counted from 1). */
  readonly tick: number;
  /** Event index. */
  readonly index: number;
  /** Its code. */
  readonly code: number;
  /** Camera x when it fired. */
  readonly x: number;
  /** Runner target speed seen by the hook. */
  readonly target: number;
  /** Runner flags seen by the hook. */
  readonly flags: number;
  /** Runner `ended` seen by the hook. */
  readonly ended: boolean;
}

/**
 * Hooks that record every event with the runner state the hook saw, and count clears.
 *
 * @returns The hooks; set `runner` before ticking and bump `tick` per tick.
 */
function recorder(): StageHooks & {
  runner: StageRunner | null;
  tick: number;
  fired: Fired[];
  clears: number;
} {
  const hooks = {
    runner: null as StageRunner | null,
    tick: 0,
    fired: [] as Fired[],
    clears: 0,
    event(code: number, _event: StageEvent, index: number) {
      const r = hooks.runner;
      hooks.fired.push({
        tick: hooks.tick,
        index,
        code,
        x: r === null ? NaN : r.camera.x,
        target: r === null ? NaN : r.targetSpeed,
        flags: r === null ? NaN : r.flags,
        ended: r !== null && r.ended,
      });
    },
    clear() {
      hooks.clears++;
    },
  };
  return hooks;
}

/**
 * Ticks a runner `n` times, collecting a value after each tick.
 *
 * @param runner - The runner.
 * @param n - Ticks.
 * @param read - What to collect.
 * @returns The values.
 */
function collect<T>(runner: StageRunner, n: number, read: (r: StageRunner) => T): T[] {
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    runner.tick();
    out.push(read(runner));
  }
  return out;
}

describe('core/stage edge — speed ramps', () => {
  it('restarts a ramp from the current (mid-ramp) speed when a key interrupts it', () => {
    const runner = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 4, ramp: 8 },
          { x: 3, speed: 0.5, ramp: 2 },
        ],
      }),
      NO_HOOKS,
    );
    // 0.5, 1, 1.5, 2 → x 0.5, 1.5, 3 (the key at 3 applies on the next tick) → ramp 2 → 0.5.
    expect(collect(runner, 6, (r) => r.speed)).toEqual([0.5, 1, 1.5, 1, 0.5, 0.5]);
    expect(runner.targetSpeed).toBe(0.5);
  });

  it('reaches the target on the last ramp tick exactly, even when the steps are inexact', () => {
    const runner = createStageRunner(stage({ camera: [{ x: 0, speed: 1, ramp: 3 }] }), NO_HOOKS);
    const speeds = collect(runner, 4, (r) => r.speed);
    expect(speeds[0]).toBeCloseTo(1 / 3, 15);
    expect(speeds[1]).toBeCloseTo(2 / 3, 15);
    expect(speeds.slice(2)).toEqual([1, 1]);
  });

  it('treats a one-tick ramp like an immediate change from the next tick', () => {
    const at = createStageRunner(stage({ camera: [{ x: 0, speed: 2 }] }), NO_HOOKS);
    const one = createStageRunner(stage({ camera: [{ x: 0, speed: 2, ramp: 1 }] }), NO_HOOKS);
    expect(collect(one, 3, (r) => r.camera.x)).toEqual(collect(at, 3, (r) => r.camera.x));
  });

  it('ramps a speed event from the next tick on, a ramp to the same speed stays flat', () => {
    const runner = createStageRunner(
      stage({
        camera: [{ x: 0, speed: 2 }],
        events: [
          { x: 4, type: 'speed', speed: 2, ramp: 10 },
          { x: 10, type: 'speed', speed: 4, ramp: 2 },
        ],
      }),
      NO_HOOKS,
    );
    // x 2, 4 (event: same speed), 6, 8, 10 (event: 2 → 4 over 2 ticks), 13, 17, 21.
    expect(collect(runner, 8, (r) => r.camera.x)).toEqual([2, 4, 6, 8, 10, 13, 17, 21]);
  });

  it('lets a later key override a speed event whose ramp is still running', () => {
    const runner = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 1 },
          { x: 5, speed: 3 },
        ],
        events: [{ x: 2, type: 'speed', speed: 0.5, ramp: 100 }],
      }),
      NO_HOOKS,
    );
    for (let i = 0; i < 20 && runner.camera.x < 5; i++) runner.tick();
    runner.tick();
    expect([runner.speed, runner.targetSpeed]).toEqual([3, 3]);
  });
});

describe('core/stage edge — scroll stops, pans and locks', () => {
  it('stops scrolling at a speed-0 key: nothing further fires, the checkpoint stays', () => {
    const hooks = recorder();
    const runner = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 2 },
          { x: 10, speed: 0 },
        ],
        checkpoints: [{ x: 0 }, { x: 11 }],
        events: [
          { x: 10, type: 'flag', flag: 'here' },
          { x: 11, type: 'end' },
        ],
      }),
      hooks,
    );
    for (let i = 0; i < 100; i++) runner.tick();
    expect([runner.camera.x, runner.camera.dx, runner.checkpoint]).toEqual([10, 0, 0]);
    expect(hooks.fired.map((f) => f.index)).toEqual([0]);
    expect([runner.locked, runner.ended, runner.ticks]).toEqual([false, false, 100]);
  });

  it('starts a new pan from the current y when a key interrupts a running pan', () => {
    const runner = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 1, yTo: 80, yTicks: 4 },
          { x: 2, speed: 1, yTo: 0, yTicks: 2 },
        ],
      }),
      NO_HOOKS,
    );
    // 10, 40 (x reaches 2) → the key applies: from 40 back to 0 over 2 ticks (inOutQuad ½ = ½).
    const ys = collect(runner, 5, (r) => r.camera.y);
    expect(ys).toEqual([10, 40, 20, 0, 0]);
    expect(runner.camera.dy).toBe(0);
  });

  it('keeps panning while locked, and records dy / vy but no dx', () => {
    const runner = createStageRunner(
      stage({ camera: [{ x: 0, speed: 1, yTo: 30, yTicks: 3, lock: true }] }),
      NO_HOOKS,
    );
    const rows = collect(runner, 4, (r) => [r.camera.x, r.camera.y, r.camera.dx, r.camera.vy]);
    expect(rows.map((row) => row[0])).toEqual([0, 0, 0, 0]);
    expect(rows.map((row) => row[2])).toEqual([0, 0, 0, 0]);
    expect(rows[2][1]).toBe(30);
    expect(rows[0][3]).toBe(rows[0][1]);
    expect(runner.locked).toBe(true);
  });

  it('pans at once with an explicit yTicks of 0', () => {
    const runner = createStageRunner(
      stage({ camera: [{ x: 0, speed: 1, yTo: 12, yTicks: 0 }] }),
      NO_HOOKS,
    );
    runner.tick();
    expect([runner.camera.y, runner.camera.dy]).toEqual([12, 12]);
  });

  it('locks on the first tick when the first key is a lock', () => {
    const hooks = recorder();
    const runner = createStageRunner(
      stage({
        camera: [{ x: 0, speed: 3, lock: true }],
        events: [
          { x: 0, type: 'music', cue: 'Boss' },
          { x: 1, type: 'end' },
        ],
      }),
      hooks,
    );
    for (let i = 0; i < 5; i++) runner.tick();
    expect([runner.camera.x, runner.locked]).toEqual([0, true]);
    expect(hooks.fired.map((f) => f.index)).toEqual([0]); // x 0 fires, x 1 waits
    runner.unlock();
    runner.tick();
    expect([runner.camera.x, runner.ended]).toEqual([3, true]);
  });

  it('locks at the stage end and never moves past it after the unlock', () => {
    const runner = createStageRunner(
      stage({
        length: 20,
        camera: [
          { x: 0, speed: 3 },
          { x: 20, speed: 5, lock: true },
        ],
      }),
      NO_HOOKS,
    );
    for (let i = 0; i < 20; i++) runner.tick();
    expect([runner.camera.x, runner.locked]).toEqual([20, true]);
    runner.unlock();
    for (let i = 0; i < 5; i++) runner.tick();
    expect([runner.camera.x, runner.camera.dx, runner.locked]).toEqual([20, 0, false]);
  });

  it('holds a lock behind a speed event: the key speed resumes after the unlock', () => {
    const runner = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 2 },
          { x: 9, speed: 1.5, lock: true },
        ],
        events: [{ x: 8, type: 'speed', speed: 8 }],
      }),
      NO_HOOKS,
    );
    // 2, 4, 6, 8 (event: speed 8 from the next tick), 9 (clamped), locked.
    expect(collect(runner, 6, (r) => r.camera.x)).toEqual([2, 4, 6, 8, 9, 9]);
    expect([runner.locked, runner.speed]).toEqual([true, 1.5]);
    runner.unlock();
    runner.tick();
    expect(runner.camera.x).toBe(10.5);
  });

  it('stops at every one of several lock keys in one run', () => {
    const runner = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 7 },
          { x: 10, speed: 7, lock: true },
          { x: 11, speed: 7, lock: true },
          { x: 30, speed: 7, lock: true },
        ],
      }),
      NO_HOOKS,
    );
    const stops: number[] = [];
    for (let i = 0; i < 40; i++) {
      runner.tick();
      if (runner.locked) {
        stops.push(runner.camera.x);
        runner.unlock();
      }
    }
    expect(stops).toEqual([10, 11, 30]);
  });

  it('ignores an unlock() before the lock engages: the camera still stops there', () => {
    let runner: StageRunner | null = null;
    runner = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 2 },
          { x: 6, speed: 2, lock: true },
        ],
        // A hook that tries to release the lock on the very tick the camera arrives.
        events: [{ x: 6, type: 'music', cue: 'Boss' }],
      }),
      {
        event() {
          runner?.unlock();
        },
        clear() {},
      },
    );
    runner.unlock(); // not locked: no effect
    for (let i = 0; i < 10; i++) runner.tick();
    expect([runner.camera.x, runner.locked]).toEqual([6, true]);
  });

  it('stops exactly on fractional lock keys reached at fractional speeds', () => {
    const rng = createRng(77);
    for (let trial = 0; trial < 300; trial++) {
      const lockX = 0.5 + rng.nextFloat() * 60;
      const midX = rng.nextFloat() * lockX * 0.9;
      const camera = [
        { x: 0, speed: 0.1 + rng.nextFloat() * 3, ramp: rng.rangeInt(0, 5) },
        { x: midX, speed: 1 + rng.nextFloat() * 15 },
        { x: lockX, speed: 1, lock: true },
      ];
      if (midX === 0) camera.splice(1, 1);
      const runner = createStageRunner(stage({ camera }), NO_HOOKS);
      for (let i = 0; i < 2000 && !runner.locked; i++) runner.tick();
      expect(runner.locked, `trial ${String(trial)}`).toBe(true);
      expect(runner.camera.x, `trial ${String(trial)}`).toBe(lockX);
    }
  });
});

describe('core/stage edge — flags and end', () => {
  it('handles all 32 flag bits as an unsigned mask (bit 31 included)', () => {
    const names = Array.from({ length: 32 }, (_, i) => 'f' + String(i).padStart(2, '0'));
    const events: Record<string, unknown>[] = names.map((flag) => ({ x: 1, type: 'flag', flag }));
    events.push({ x: 2, type: 'flag', flag: 'f31', value: false });
    events.push({ x: 3, type: 'flag', flag: 'f00', value: false });
    events.push({ x: 4, type: 'flag', flag: 'f31', value: true });
    const runner = createStageRunner(stage({ events }), NO_HOOKS);
    expect(runner.stage.flagNames).toEqual(names);
    expect(collect(runner, 4, (r) => r.flags)).toEqual([
      0xffffffff, 0x7fffffff, 0x7ffffffe, 0xfffffffe,
    ]);
    expect(runner.flags).toBeGreaterThan(0);
  });

  it('makes setting a set flag and clearing a clear flag no-ops', () => {
    const runner = createStageRunner(
      stage({
        events: [
          { x: 1, type: 'flag', flag: 'b', value: false },
          { x: 2, type: 'flag', flag: 'a' },
          { x: 3, type: 'flag', flag: 'a', value: true },
          { x: 4, type: 'flag', flag: 'b', value: false },
        ],
      }),
      NO_HOOKS,
    );
    expect(collect(runner, 4, (r) => r.flags)).toEqual([0, 1, 1, 1]);
  });

  it('keeps scrolling after `end` and fires an event lying exactly at the length', () => {
    const hooks = recorder();
    const runner = createStageRunner(
      stage({
        length: 10,
        camera: [{ x: 0, speed: 4 }],
        events: [
          { x: 2, type: 'end' },
          { x: 10, type: 'end' },
        ],
      }),
      hooks,
    );
    hooks.runner = runner;
    runner.tick();
    expect([runner.ended, runner.camera.x]).toEqual([true, 4]);
    runner.tick();
    runner.tick();
    expect(runner.camera.x).toBe(10);
    expect(hooks.fired.map((f) => f.index)).toEqual([0, 1]);
    expect(hooks.fired[0].ended).toBe(true); // the runner part ran before the hook
  });
});

describe('core/stage edge — hooks', () => {
  it('passes each event with the code of `eventCodes`, after the runner applied it', () => {
    const hooks = recorder();
    const spec = stage({
      events: [
        { x: 1, type: 'music', cue: 'Boss' },
        { x: 1, type: 'speed', speed: 3, ramp: 5 },
        { x: 2, type: 'flag', flag: 'z' },
        { x: 3, type: 'end' },
      ],
    });
    const runner = createStageRunner(spec, hooks);
    hooks.runner = runner;
    for (let t = 1; t <= 3; t++) {
      hooks.tick = t;
      runner.tick();
    }
    expect(Array.from(runner.eventCodes)).toEqual([
      StageEventCode.Music,
      StageEventCode.Speed,
      StageEventCode.Flag,
      StageEventCode.End,
    ]);
    expect(hooks.fired.map((f) => [f.index, f.code])).toEqual(
      Array.from(runner.eventCodes, (code, index) => [index, code]),
    );
    expect(hooks.fired[1].target).toBe(3);
    expect(hooks.fired[2].flags).toBe(1);
    expect(hooks.fired[3].ended).toBe(true);
  });

  it('never calls clear() at creation, once per restart', () => {
    const hooks = recorder();
    const runner = createStageRunner(stage({ checkpoints: [{ x: 0 }, { x: 5 }] }), hooks);
    expect(hooks.clears).toBe(0);
    runner.restartAt(1);
    runner.restartAt(-1);
    runner.restartAt(0);
    expect(hooks.clears).toBe(3);
    expect(runner.state[StageSlot.Restarts]).toBe(3);
  });

  it('throws at creation for an event type the runtime does not know', () => {
    const spec = stage({ events: [{ x: 1, type: 'end' }] });
    const bad = { ...spec, events: [{ x: 1, type: 'teleport' } as unknown as StageEvent] };
    expect(() => createStageRunner(bad, NO_HOOKS)).toThrow(/unknown event type teleport/);
  });
});

/**
 * A random valid stage body for the invariant sweeps.
 *
 * @param rng - Random source.
 * @returns Stage fields.
 */
function randomStage(rng: Rng): Record<string, unknown> {
  const length = rng.rangeInt(100, 1200);
  const keyCount = rng.rangeInt(1, 7);
  const keyXs = new Set<number>([0]);
  while (keyXs.size < keyCount)
    keyXs.add(rng.rangeInt(1, length) - (rng.nextFloat() < 0.3 ? 0.5 : 0));
  const camera = [...keyXs]
    .sort((a, b) => a - b)
    .map((x) => {
      const key: Record<string, unknown> = { x, speed: 0.5 + rng.rangeInt(0, 20) * 0.35 };
      if (rng.nextFloat() < 0.4) key.ramp = rng.rangeInt(0, 40);
      if (rng.nextFloat() < 0.3) {
        key.yTo = rng.rangeInt(0, 64);
        if (rng.nextFloat() < 0.5) key.yTicks = rng.rangeInt(0, 30);
      }
      if (x > 0 && rng.nextFloat() < 0.25) key.lock = true;
      return key;
    });
  const events: Record<string, unknown>[] = [];
  const eventCount = rng.rangeInt(0, 30);
  for (let i = 0; i < eventCount; i++) {
    const x = rng.nextFloat() < 0.1 ? 0 : rng.nextFloat() < 0.1 ? length : rng.rangeInt(0, length);
    const kind = rng.rangeInt(0, 3);
    if (kind === 0) events.push({ x, type: 'flag', flag: 'f' + String(rng.rangeInt(0, 5)) });
    else if (kind === 1) {
      events.push({
        x,
        type: 'speed',
        speed: 0.5 + rng.rangeInt(0, 12) * 0.5,
        ramp: rng.rangeInt(0, 20),
      });
    } else if (kind === 2) events.push({ x, type: 'music', cue: 'Boss' });
    else events.push({ x, type: 'end' });
  }
  events.sort((a, b) => (a.x as number) - (b.x as number));
  const checkpoints: { x: number }[] = [];
  let cx = 0;
  while (rng.nextFloat() < 0.7 && cx <= length) {
    checkpoints.push({ x: cx });
    cx += rng.rangeInt(1, 400);
  }
  return { length, camera, events, checkpoints };
}

describe('core/stage edge — randomised invariants', () => {
  it('holds the camera, timeline and checkpoint invariants on 60 generated stages', () => {
    const rng = createRng(20260911);
    for (let trial = 0; trial < 60; trial++) {
      const spec = stage(randomStage(rng));
      const hooks = recorder();
      const runner = createStageRunner(spec, hooks);
      hooks.runner = runner;
      const lockXs = spec.camera.filter((k) => k.lock === true).map((k) => k.x);
      const xs: number[] = [0];
      const stops: number[] = [];
      let lockedFor = 0;
      for (let t = 1; t <= 6000; t++) {
        hooks.tick = t;
        const before = runner.camera.x;
        runner.tick();
        const x = runner.camera.x;
        const checkpoint = spec.checkpoints.reduce((last, cp, i) => (cp.x <= x ? i : last), -1);
        // Up to 360k ticks in all: check in plain code and call `expect` only on a mismatch (a
        // per-tick `expect` + label brought this test close to the 5 s timeout on CI).
        if (!(
          x >= before &&
          x <= spec.length &&
          Object.is(before + runner.camera.dx, x) &&
          Object.is(runner.camera.vx, runner.camera.dx) &&
          runner.eventCursor === hooks.fired.length &&
          runner.checkpoint === checkpoint &&
          runner.ticks === t
        )) {
          const label = `trial ${String(trial)} tick ${String(t)}`;
          expect(x, label).toBeGreaterThanOrEqual(before);
          expect(x, label).toBeLessThanOrEqual(spec.length);
          expect(before + runner.camera.dx, label).toBe(x);
          expect(runner.camera.vx, label).toBe(runner.camera.dx);
          expect(runner.eventCursor, label).toBe(hooks.fired.length);
          expect(runner.checkpoint, label).toBe(checkpoint);
          expect(runner.ticks, label).toBe(t);
        }
        xs.push(x);
        if (runner.locked) {
          if (lockedFor === 0) stops.push(x);
          if (++lockedFor >= 3) {
            runner.unlock();
            lockedFor = 0;
          }
        }
        if (x === spec.length && !runner.locked && lockedFor === 0 && t > 2) break;
      }
      const label = `trial ${String(trial)}`;
      // Rests exactly on every lock key it reached, in order.
      expect(stops, label).toEqual(lockXs.filter((lx) => lx <= xs[xs.length - 1]));
      // Every event fired exactly once, in index order, on the first tick reaching its x.
      expect(
        hooks.fired.map((f) => f.index),
        label,
      ).toEqual(spec.events.map((_, i) => i).filter((i) => spec.events[i].x <= xs[xs.length - 1]));
      for (const f of hooks.fired) {
        const ex = spec.events[f.index].x;
        expect(f.x, `${label} event ${String(f.index)}`).toBeGreaterThanOrEqual(ex);
        expect(xs[f.tick], `${label} event ${String(f.index)}`).toBe(f.x);
        if (f.tick > 1)
          expect(xs[f.tick - 1], `${label} event ${String(f.index)}`).toBeLessThan(ex);
      }
      expect(runner.camera.x, label).toBe(spec.length);
    }
  });
});

describe('core/stage edge — checkpoints', () => {
  it('accepts only -1 on a stage without checkpoints', () => {
    const runner = createStageRunner(stage({}), NO_HOOKS);
    expect(() => runner.restartAt(0)).toThrow(RangeError);
    expect(() => runner.restartAt(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    runner.tick();
    runner.restartAt(-1);
    expect([runner.camera.x, runner.checkpoint, runner.eventCursor]).toEqual([0, -1, 0]);
  });

  it('refires the events at x 0 after a restart at the stage start, like a fresh stage', () => {
    const hooks = recorder();
    const runner = createStageRunner(
      stage({ events: [{ x: 0, type: 'flag', flag: 'go' }], checkpoints: [{ x: 0 }] }),
      hooks,
    );
    runner.tick();
    for (const cp of [-1, 0]) {
      runner.restartAt(cp);
      expect(runner.flags).toBe(0);
      runner.tick();
      expect(runner.flags).toBe(1);
    }
    expect(hooks.fired.map((f) => f.index)).toEqual([0, 0, 0]);
  });

  it('gives the same state for repeated restarts at one checkpoint', () => {
    const body = {
      camera: [
        { x: 0, speed: 2 },
        { x: 50, speed: 3, yTo: 20 },
      ],
      checkpoints: [{ x: 0 }, { x: 120 }],
      events: [
        { x: 60, type: 'flag', flag: 'a' },
        { x: 120, type: 'speed', speed: 1, ramp: 4 },
      ],
    };
    const runner = createStageRunner(stage(body), NO_HOOKS);
    for (let i = 0; i < 100; i++) runner.tick();
    runner.restartAt(1);
    const first = Array.from(runner.state);
    const cam = [runner.camera.x, runner.camera.y];
    for (let i = 0; i < 17; i++) runner.tick();
    runner.restartAt(1);
    runner.restartAt(1);
    const again = Array.from(runner.state);
    first[StageSlot.Restarts] = again[StageSlot.Restarts] = 0;
    expect(again).toEqual(first);
    expect([runner.camera.x, runner.camera.y]).toEqual(cam);
  });

  it('restarts with the speed live play had when the first key and a speed event share x 0', () => {
    // Regression: the first tick applies the key at 0 *before* firing the events at 0, so the
    // event's speed wins there (unlike ties further on); the restart replayed event → key.
    const body = {
      camera: [
        { x: 0, speed: 1 },
        { x: 40, speed: 1, yTo: 8 },
      ],
      checkpoints: [{ x: 0 }, { x: 20 }],
      events: [{ x: 0, type: 'speed', speed: 0.5 }],
    };
    const runner = createStageRunner(stage(body), NO_HOOKS);
    expect(collect(runner, 3, (r) => r.camera.x)).toEqual([1, 1.5, 2]);
    while (runner.checkpoint < 1) runner.tick();
    expect([runner.camera.x, runner.speed]).toEqual([20, 0.5]);
    runner.restartAt(1);
    expect([runner.speed, runner.targetSpeed]).toEqual([0.5, 0.5]);
    runner.tick();
    expect(runner.camera.x).toBe(20.5);
  });

  it('locks again after a restart at a checkpoint on a lock key', () => {
    const runner = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 2 },
          { x: 40, speed: 1, lock: true },
        ],
        checkpoints: [{ x: 0 }, { x: 40 }],
      }),
      NO_HOOKS,
    );
    for (let i = 0; i < 30; i++) runner.tick();
    runner.unlock();
    for (let i = 0; i < 10; i++) runner.tick();
    expect(runner.camera.x).toBe(50);
    runner.restartAt(1);
    expect(runner.locked).toBe(false);
    runner.tick();
    expect([runner.camera.x, runner.locked, runner.speed]).toEqual([40, true, 1]);
  });

  it('does not lock again after a restart past a lock key (the boss was beaten)', () => {
    const runner = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 2 },
          { x: 40, speed: 1.5, lock: true },
        ],
        checkpoints: [{ x: 0 }, { x: 60 }],
      }),
      NO_HOOKS,
    );
    runner.restartAt(1);
    runner.tick();
    expect([runner.camera.x, runner.locked, runner.speed]).toEqual([61.5, false, 1.5]);
  });

  it('ends at once on a restart at a checkpoint holding `end`, not for an `end` before it', () => {
    const body = {
      length: 300,
      checkpoints: [{ x: 0 }, { x: 100 }, { x: 200 }],
      events: [
        { x: 100, type: 'end' },
        { x: 150, type: 'flag', flag: 'late' },
      ],
    };
    const runner = createStageRunner(stage(body), NO_HOOKS);
    runner.restartAt(1);
    expect(runner.ended).toBe(true); // live play ended on arriving at 100
    runner.restartAt(2);
    expect([runner.ended, runner.flags]).toEqual([false, 1]);
  });

  it('restarts with ramps and pans before the checkpoint already settled', () => {
    const runner = createStageRunner(
      stage({
        camera: [
          { x: 0, speed: 3, ramp: 600, yTo: 90, yTicks: 600 },
          { x: 10, speed: 1, ramp: 50 },
        ],
        checkpoints: [{ x: 0 }, { x: 5 }, { x: 20 }],
        events: [{ x: 2, type: 'speed', speed: 2, ramp: 900 }],
      }),
      NO_HOOKS,
    );
    runner.restartAt(1);
    // Key 0 (3, pan to 90) then the event at 2 (2): the ramps and the pan are over at once.
    expect([runner.speed, runner.targetSpeed, runner.camera.y]).toEqual([2, 2, 90]);
    runner.tick();
    expect([runner.camera.x, runner.camera.dy]).toEqual([7, 0]);
    runner.restartAt(2);
    expect([runner.speed, runner.camera.y]).toEqual([1, 90]);
  });

  it('refires only the events at exactly the checkpoint x, then continues', () => {
    const hooks = recorder();
    const runner = createStageRunner(
      stage({
        camera: [{ x: 0, speed: 5 }],
        checkpoints: [{ x: 0 }, { x: 100 }],
        events: [
          { x: 99.5, type: 'music', cue: 'Boss' },
          { x: 100, type: 'music', cue: 'Stage' },
          { x: 100, type: 'flag', flag: 'x' },
          { x: 100.5, type: 'end' },
        ],
      }),
      hooks,
    );
    runner.restartAt(1);
    expect(runner.state[StageSlot.Replay]).toBe(3);
    runner.tick();
    expect(hooks.fired.map((f) => f.index)).toEqual([1, 2, 3]);
    expect([runner.flags, runner.ended, runner.eventCursor]).toEqual([1, true, 4]);
  });

  it('continues from a checkpoint exactly as live play did (60 generated stages)', () => {
    const rng = createRng(4242);
    const speeds = [0.5, 1, 1.5, 2, 3, 4.25];
    /**
     * Unlocks after the camera was locked for three ticks (the same rule in every run).
     *
     * @returns A per-run tick function.
     */
    const driver = (): ((runner: StageRunner) => void) => {
      let lockedFor = 0;
      return (runner) => {
        runner.tick();
        if (!runner.locked) return;
        if (++lockedFor >= 3) {
          runner.unlock();
          lockedFor = 0;
        }
      };
    };
    let compared = 0;
    for (let trial = 0; trial < 60; trial++) {
      // Keys and events on a 20-px grid (a tick moves at most 4.25 px, so no key and event are
      // ever crossed in one tick — the documented approximation), no ramps, pans at once.
      const length = 20 * rng.rangeInt(20, 60);
      const keyXs = new Set<number>([0]);
      for (let i = rng.rangeInt(1, 8); i > 0; i--) keyXs.add(20 * rng.rangeInt(1, length / 20));
      const camera = [...keyXs]
        .sort((a, b) => a - b)
        .map((x) => {
          const key: Record<string, unknown> = { x, speed: speeds[rng.rangeInt(0, 5)] };
          if (rng.nextFloat() < 0.4) key.yTo = rng.rangeInt(0, 50);
          if (x > 0 && rng.nextFloat() < 0.3) key.lock = true;
          return key;
        });
      const events: Record<string, unknown>[] = [];
      for (let i = rng.rangeInt(0, 25); i > 0; i--) {
        const x = 20 * rng.rangeInt(0, length / 20 - 1);
        const kind = rng.rangeInt(0, 2);
        if (kind === 0) {
          events.push({
            x,
            type: 'flag',
            flag: 'f' + String(rng.rangeInt(0, 3)),
            value: rng.nextFloat() < 0.7,
          });
        } else if (kind === 1) events.push({ x, type: 'speed', speed: speeds[rng.rangeInt(0, 5)] });
        else events.push({ x, type: 'music', cue: 'Boss' });
      }
      events.sort((a, b) => (a.x as number) - (b.x as number));
      const body = { length, camera, events };

      // Where live play lands (a checkpoint must be a position the camera reaches exactly).
      const probe = createStageRunner(stage(body), NO_HOOKS);
      const step = driver();
      const landings: number[] = [];
      for (let t = 0; t < 4000 && probe.camera.x < length; t++) {
        step(probe);
        if (probe.camera.dx > 0) landings.push(probe.camera.x);
      }
      const picks = [...new Set(landings.filter((x) => x < length - 50))];
      const chosen = [0, 1, 2]
        .map(() => picks[rng.rangeInt(0, picks.length - 1)])
        .filter((x, i, all) => x !== undefined && all.indexOf(x) === i)
        .sort((a, b) => a - b);
      const spec = stage({ ...body, checkpoints: chosen.map((x) => ({ x })) });

      for (let cp = 0; cp < chosen.length; cp++) {
        const hooks = recorder();
        const runner = createStageRunner(spec, hooks);
        const liveStep = driver();
        while (runner.checkpoint < cp) liveStep(runner);
        const label = `trial ${String(trial)} checkpoint ${String(chosen[cp])}`;
        expect(runner.camera.x, label).toBe(chosen[cp]);
        /**
         * Records 150 ticks.
         *
         * @param tick - The tick function.
         * @returns Camera and runner state per tick.
         */
        const trace = (tick: (r: StageRunner) => void): number[][] => {
          const rows: number[][] = [];
          for (let i = 0; i < 150; i++) {
            tick(runner);
            const s = runner.state;
            rows.push([
              runner.camera.x,
              runner.camera.y,
              runner.camera.dx,
              runner.camera.dy,
              s[StageSlot.Speed],
              s[StageSlot.Target],
              s[StageSlot.Locked],
              s[StageSlot.Flags],
              s[StageSlot.Cursor],
              s[StageSlot.NextKey],
              s[StageSlot.Checkpoint],
            ]);
          }
          return rows;
        };
        hooks.fired.length = 0;
        const live = trace(liveStep);
        const liveFired = hooks.fired.map((f) => f.index);
        runner.restartAt(cp);
        const replay = runner.state[StageSlot.Replay];
        hooks.fired.length = 0;
        expect(trace(driver()), label).toEqual(live);
        expect(
          hooks.fired.map((f) => f.index).filter((index) => index >= replay),
          label,
        ).toEqual(liveFired);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(80);
  });
});

describe('core/stage edge — findEventCursor', () => {
  it('matches a linear scan on random sorted timelines (duplicates, fractions, out of range)', () => {
    const rng = createRng(5);
    for (let trial = 0; trial < 200; trial++) {
      const xs = Array.from({ length: rng.rangeInt(0, 40) }, () => rng.rangeInt(0, 60) / 2).sort(
        (a, b) => a - b,
      );
      const events: StageEvent[] = xs.map((x) => ({ x, type: 'end' }));
      for (const probe of [-1, 0, 0.25, 7, 7.5, 15, 29.75, 30, 31, ...xs]) {
        const linear = xs.findIndex((x) => x >= probe);
        expect(findEventCursor(events, probe)).toBe(linear < 0 ? xs.length : linear);
      }
    }
  });

  it('returns 0 for NaN (no event is "before" NaN)', () => {
    expect(findEventCursor([{ x: 1, type: 'end' }] as StageEvent[], Number.NaN)).toBe(0);
  });
});

describe('core/stage edge — camera object and helpers', () => {
  it('creates independent zeroed cameras and resets a given camera at creation', () => {
    const a = createStageCamera();
    const b = createStageCamera();
    expect(a).not.toBe(b);
    expect({ ...a }).toEqual({ x: 0, y: 0, dx: 0, dy: 0, vx: 0, vy: 0 });
    Object.assign(a, { x: 500, y: 40, dx: 3, dy: 2, vx: 3, vy: 2 });
    createStageRunner(stage({}), NO_HOOKS, a);
    expect({ ...a }).toEqual({ x: 0, y: 0, dx: 0, dy: 0, vx: 0, vy: 0 });
  });

  it('keeps the parallax offsets in [0, spacing) for any camera x, factor 0 included', () => {
    const view = createParallaxView(
      stage({
        parallax: [
          { layer: 'far', sprite: 'bg/stars-far', factor: 0, y: 7, spacing: 128 },
          { layer: 'mid', sprite: 'bg/stars-mid', factor: 0.3, y: -12, spacing: 24 },
          { layer: 'mid', sprite: 'bg/stars-mid', factor: 4, y: 512, spacing: 1024 },
        ],
      }),
    );
    expect(view).not.toBeNull();
    if (view === null) return;
    const rng = createRng(9);
    for (let i = 0; i < 500; i++) {
      const cx = (rng.nextFloat() - 0.3) * 200000;
      const cy = rng.nextFloat() * 400;
      updateParallaxView(view, cx, cy);
      for (let b = 0; b < view.count; b++) {
        expect(view.offsetX[b]).toBeGreaterThanOrEqual(0);
        expect(view.offsetX[b]).toBeLessThan(view.spacing[b]);
        expect(view.y[b]).toBe(view.baseY[b] - cy * view.factor[b]);
      }
      expect(view.offsetX[0]).toBe(0);
    }
    updateParallaxView(view, 24 / 0.3, 0);
    expect(view.offsetX[1]).toBeCloseTo(0, 9);
  });

  it('marks an unresolved band sprite as 0xffff (drawn as the missing frame)', () => {
    const spec = stage({
      parallax: [{ layer: 'far', sprite: 'bg/stars-far', factor: 0.5, y: 0, spacing: 64 }],
    });
    const unresolved = { ...spec, parallax: [{ ...spec.parallax[0], spriteId: -1 }] };
    expect(createParallaxView(unresolved)?.spriteId[0]).toBe(0xffff);
  });

  it('rounds the map width up to whole tiles', () => {
    expect(stageMapWidth(1, 8)).toBe(Math.ceil(385 / 8));
    expect(stageMapWidth(4800, 8)).toBe(648);
    expect(stageMapWidth(4801, 8)).toBe(649);
  });

  it('gives each world its own terrain copy and no terrain for a missing tileset', () => {
    const db = stageDb({
      tilemap: { tileSize: 8, tileset: 'rock', rowsTall: 2, rle: ['3*1', ''] },
    });
    const spec = db.stages[0];
    const a = createStageTerrain(spec, db);
    const b = createStageTerrain(spec, db);
    expect(a).not.toBeNull();
    if (a === null || b === null || spec.terrain === null) return;
    a.tiles[0] = 0;
    expect([b.tiles[0], spec.terrain.tiles[0]]).toEqual([1, 1]);
    expect(a.tileType).toBe(db.tilesets[0].tables.type);
    const orphan = { ...spec, terrain: { ...spec.terrain, tilesetId: 5 } };
    expect(createStageTerrain(orphan, db)).toBeNull();
    expect(() => createTerrainView(a, orphan, db)).toThrow(RangeError);
  });
});

describe('core/stage edge — allocation', () => {
  it('ticks without allocating through locks, unlocking hooks, pans and speed events', () => {
    const camera: Record<string, unknown>[] = [{ x: 0, speed: 2.5, ramp: 9 }];
    const events: Record<string, unknown>[] = [];
    for (let x = 400; x < 99000; x += 400) {
      camera.push(
        x % 1200 === 0
          ? { x, speed: 1.75, lock: true }
          : { x, speed: 3.25, ramp: 11, yTo: (x / 400) % 40, yTicks: 17 },
      );
      events.push({ x: x + 13, type: 'speed', speed: 2.75, ramp: 7 });
      events.push({ x: x + 13, type: 'music', cue: 'Boss' });
    }
    let runner: StageRunner | null = null;
    let fired = 0;
    runner = createStageRunner(
      stage({ length: 100000, camera, events, checkpoints: [{ x: 0 }, { x: 50000 }] }),
      {
        event(code) {
          fired++;
          if (code === StageEventCode.Music) runner?.unlock();
        },
        clear() {},
      },
    );
    const growth = measureHeapGrowth(
      () => {
        runner.tick();
        if (runner.locked && runner.ticks % 5 === 0) runner.unlock();
      },
      20_000,
      10_000,
      3,
    );
    expect(fired).toBeGreaterThan(50);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
