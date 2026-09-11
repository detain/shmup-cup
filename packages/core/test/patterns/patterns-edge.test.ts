/**
 * Edge cases of `core/patterns` (plan M1-08), beyond the acceptance suite in `patterns.test.ts`:
 *
 * - the script runner: a randomised spy over generated wait sequences (`next()` exactly once per
 *   wake, never while asleep), waits below one tick, huge ticks after `SLEEP_FOREVER`, scripts
 *   that end at once, exceptions propagating (and the closed generator dropped afterwards);
 * - `FollowTrack`: the ring boundary (exactly {@link FOLLOW_HISTORY} entries), ages recorded out
 *   of order, negative ages, `reset`;
 * - `setMover`: state reset on every switch, the velocity each kind starts with, `moverKindOf`
 *   for every content name;
 * - movers: sine phase wrap-around (negative / ≥ 1024 phases), no jump on the first step,
 *   ground frame vs camera frame; the inlined path sampler against `samplePath` on random curves
 *   and speeds; path speed 0, re-targeting mid-path; waypoint arrival on the exact step, a
 *   `hold` of 0 (regression — it held one tick), moving view targets, ground waypoints; follow
 *   without a track and in both frames; homing with turn rate 0 and at the target heading;
 *   aimed dash with windup 0, no target, and every one of the 32 directions; unknown mover
 *   codes;
 * - ground crawling on hand-built maps: steps and drops of exactly {@link CRAWL_STEP} pixels are
 *   walked, one pixel more is a wall / cliff — on floors and ceilings alike.
 */
import { describe, expect, it } from 'vitest';
import { TerrainAnchor, TerrainType, type TerrainMap } from '../../src/collision/index.js';
import { MOVER_TYPES, PATH_SAMPLE_STEP, bakePath, type PathSpec } from '../../src/data/index.js';
import { ANGLE_UNITS, angleDelta, atan2B, cosB, sinB } from '../../src/math/index.js';
import {
  AIM_DIRECTIONS,
  BodyAnchor,
  CRAWL_STEP,
  FOLLOW_HISTORY,
  FollowTrack,
  MOVER_NAMES,
  MoverKind,
  SLEEP_FOREVER,
  createMoverContext,
  moverKindOf,
  resumeScript,
  samplePath,
  setMover,
  updateMover,
  type MoverBody,
  type MoverContext,
  type Script,
  type ScriptHolder,
} from '../../src/patterns/index.js';
import { createRng, type Rng } from '../../src/rng/index.js';

/**
 * A fresh body at a position.
 *
 * @param x - World x.
 * @param y - World y.
 * @param anchor - `BodyAnchor` code.
 * @param hh - Half height.
 * @returns The body.
 */
function body(x = 0, y = 0, anchor: number = BodyAnchor.Air, hh = 4): MoverBody {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    hh,
    anchor,
    age: 0,
    mover: 0,
    m0: 0,
    m1: 0,
    m2: 0,
    m3: 0,
    m4: 0,
    m5: 0,
    s0: 0,
    s1: 0,
    s2: 0,
    s3: 0,
    moverTicks: 0,
    track: null,
  };
}

/** A writable camera. */
interface TestCamera {
  x: number;
  y: number;
}

/**
 * A mover context.
 *
 * @param camera - The camera.
 * @param terrain - Terrain map.
 * @param paths - Paths.
 * @returns The context.
 */
function context(
  camera: TestCamera = { x: 0, y: 0 },
  terrain: TerrainMap | null = null,
  paths: readonly PathSpec[] = [],
): MoverContext {
  return createMoverContext(camera, terrain, paths);
}

/**
 * A path spec from control points.
 *
 * @param xs - X coordinates.
 * @param ys - Y coordinates.
 * @returns The spec.
 */
function pathOf(xs: readonly number[], ys: readonly number[]): PathSpec {
  return {
    id: 'p',
    points: xs.map((x, i) => ({ x, y: ys[i] })),
    table: bakePath(xs, ys),
  };
}

/**
 * A random integer in `[0, n)`.
 *
 * @param rng - Random source.
 * @param n - Exclusive upper bound.
 * @returns The integer.
 */
function below(rng: Rng, n: number): number {
  return rng.rangeInt(0, n - 1);
}

/**
 * Random control points: `n` points, consecutive ones distinct, a few hundred pixels apart.
 *
 * @param rng - Random source.
 * @param n - Point count.
 * @returns The coordinates.
 */
function randomPoints(rng: Rng, n: number): { xs: number[]; ys: number[] } {
  const xs = [0];
  const ys = [0];
  for (let i = 1; i < n; i++) {
    let x: number;
    let y: number;
    do {
      x = xs[i - 1] + below(rng, 161) - 100;
      y = ys[i - 1] + below(rng, 121) - 60;
    } while (x === xs[i - 1] && y === ys[i - 1]);
    xs.push(x);
    ys.push(y);
  }
  return { xs, ys };
}

describe('core/patterns edge — resumeScript', () => {
  /**
   * A coroutine yielding the given waits and logging each resume.
   *
   * @param waits - Values to yield.
   * @param log - Receives the tick of every resume.
   * @param now - The current tick.
   * @returns The coroutine.
   */
  function* sequence(waits: readonly number[], log: number[], now: () => number): Script {
    for (const wait of waits) {
      log.push(now());
      yield wait;
    }
    log.push(now());
  }

  it('resumes exactly on the reference wake ticks for 200 random wait sequences (spy)', () => {
    const rng = createRng(0x0808);
    for (let round = 0; round < 200; round++) {
      const waits: number[] = [];
      const n = 1 + below(rng, 12);
      for (let i = 0; i < n; i++) {
        const pick = below(rng, 6);
        waits.push(
          pick === 0
            ? 0
            : pick === 1
              ? -below(rng, 5)
              : pick === 2
                ? rng.nextFloat() * 3
                : 1 + below(rng, 40),
        );
      }
      // Reference: after a resume at `t` with wait w, the next resume is at t + max(1, floor(w)).
      const expected: number[] = [];
      let t = below(rng, 10);
      const start = t;
      for (const w of waits) {
        expected.push(t);
        t += w >= 1 ? Math.floor(w) : 1;
      }
      expected.push(t);
      const log: number[] = [];
      let tick = 0;
      const script = sequence(waits, log, () => tick);
      let nexts = 0;
      const next = script.next.bind(script);
      script.next = (...args: [] | [undefined]) => {
        nexts++;
        return next(...args);
      };
      const holder: ScriptHolder = { script, wakeTick: start };
      const resumed: number[] = [];
      for (; tick <= t + 5; tick++) if (resumeScript(holder, tick)) resumed.push(tick);
      expect(log, `round ${round}`).toEqual(expected);
      expect(resumed).toEqual(expected);
      expect(nexts).toBe(expected.length);
      expect(holder.script).toBeNull();
    }
  });

  it('sleeps for one tick on waits below 1 and never wakes after SLEEP_FOREVER', () => {
    const log: number[] = [];
    let tick = 0;
    const holder: ScriptHolder = {
      script: sequence([0.5, 0.999, 1.999, SLEEP_FOREVER], log, () => tick),
      wakeTick: 0,
    };
    for (; tick < 10; tick++) resumeScript(holder, tick);
    expect(log).toEqual([0, 1, 2, 3]);
    expect(resumeScript(holder, Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(resumeScript(holder, Number.MAX_VALUE)).toBe(false);
    expect(log).toHaveLength(4);
  });

  it('drops a script that ends on its first resume', () => {
    const holder: ScriptHolder = {
      // eslint-disable-next-line require-yield
      script: (function* done(): Script {
        return;
      })(),
      wakeTick: 3,
    };
    expect(resumeScript(holder, 2)).toBe(false);
    expect(holder.script).not.toBeNull();
    expect(resumeScript(holder, 3)).toBe(true);
    expect(holder.script).toBeNull();
    expect(holder.wakeTick).toBe(3); // unchanged: nothing more to wake
  });

  it('lets exceptions from a script propagate, then drops the closed generator', () => {
    const holder: ScriptHolder = {
      script: (function* broken(): Script {
        yield 2;
        throw new Error('behaviour bug');
      })(),
      wakeTick: 0,
    };
    expect(resumeScript(holder, 0)).toBe(true);
    expect(holder.wakeTick).toBe(2);
    expect(() => resumeScript(holder, 2)).toThrow('behaviour bug');
    // The generator is closed now: the next due resume finds it done and drops it.
    expect(resumeScript(holder, 3)).toBe(true);
    expect(holder.script).toBeNull();
  });
});

describe('core/patterns edge — FollowTrack', () => {
  it('keeps exactly FOLLOW_HISTORY entries', () => {
    const track = new FollowTrack();
    for (let age = 0; age < 300; age++) track.record(age, age, -age);
    expect(track.recorded).toBe(300);
    expect(track.has(300 - FOLLOW_HISTORY)).toBe(true);
    expect(track.has(299 - FOLLOW_HISTORY)).toBe(false);
    expect(track.has(299)).toBe(true);
    expect(track.has(300)).toBe(false);
    expect(track.has(-1)).toBe(false);
    const slot = (300 - FOLLOW_HISTORY) % FOLLOW_HISTORY;
    expect([track.x[slot], track.y[slot]]).toEqual([300 - FOLLOW_HISTORY, FOLLOW_HISTORY - 300]);
  });

  it('never shrinks when an older age is recorded again, and forgets everything on reset', () => {
    const track = new FollowTrack();
    track.record(0, 1, 1);
    track.record(10, 5, 5);
    expect(track.recorded).toBe(11);
    expect(track.has(5)).toBe(true); // not written, but inside the recorded range
    track.record(3, 2, 2);
    expect(track.recorded).toBe(11);
    expect([track.x[3], track.y[3]]).toEqual([2, 2]);
    track.reset();
    expect(track.recorded).toBe(0);
    expect(track.has(0)).toBe(false);
  });
});

describe('core/patterns edge — setMover', () => {
  it('maps every content mover name to its code, in order', () => {
    MOVER_TYPES.forEach((type, i) => {
      expect(moverKindOf(type)).toBe(i + 1);
      expect(MOVER_NAMES[i + 1]).toBe(type);
    });
    expect(Object.isFrozen(MOVER_NAMES)).toBe(true);
    expect(Object.values(MoverKind)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('resets the mover state and tick count on every switch', () => {
    const ctx = context();
    const b = body(10, 20);
    setMover(b, ctx, MoverKind.Waypoint, 300, 20, 50, 5, -1, 0);
    for (let i = 0; i < 9; i++) updateMover(b, ctx); // arrived on tick 6 (s0 = 1), holding
    expect([b.x, b.s0, b.s1]).toEqual([300, 1, 3]);
    expect(b.moverTicks).toBe(9);
    setMover(b, ctx, MoverKind.Waypoint, 0, 20, 50, 5, -1, 0);
    expect([b.s0, b.s1, b.s2, b.s3, b.moverTicks]).toEqual([0, 0, 0, 0, 0]);
    expect([b.m0, b.m1, b.m2, b.m3, b.m4, b.m5]).toEqual([0, 20, 50, 5, -1, 0]);
    updateMover(b, ctx);
    expect(b.x).toBe(250); // approaching the new point, not holding
  });

  it('sets the starting velocity of each kind (none stops, straight / crawl set it, others keep it)', () => {
    const ctx = context();
    const b = body();
    b.vx = 3;
    b.vy = -2;
    setMover(b, ctx, MoverKind.Follow);
    expect([b.vx, b.vy]).toEqual([3, -2]);
    setMover(b, ctx, MoverKind.AimedDash, 2, 5);
    expect([b.vx, b.vy]).toEqual([3, -2]);
    setMover(b, ctx, MoverKind.Straight, -1, 0.5);
    expect([b.vx, b.vy]).toEqual([-1, 0.5]);
    setMover(b, ctx, MoverKind.GroundCrawl, 0.75);
    expect([b.vx, b.vy]).toEqual([0.75, 0]);
    setMover(b, ctx, MoverKind.None);
    expect([b.vx, b.vy]).toEqual([0, 0]);
    setMover(b, ctx, MoverKind.Straight); // defaults: every parameter 0
    expect([b.vx, b.vy, b.m0, b.m5]).toEqual([0, 0, 0, 0]);
  });

  it('starts homing from the current heading in every direction', () => {
    const ctx = context();
    for (let a = 0; a < ANGLE_UNITS; a += 16) {
      const b = body(100, 100);
      b.vx = cosB(a) * 2;
      b.vy = sinB(a) * 2;
      setMover(b, ctx, MoverKind.Homing, 2, 0);
      expect(Math.abs(angleDelta(b.s0, a)), `angle ${a}`).toBeLessThanOrEqual(1);
    }
  });

  it('ignores unknown mover codes: the body stops but counts the ticks', () => {
    const ctx = context();
    const b = body(5, 5);
    b.vx = 2;
    setMover(b, ctx, 99, 1, 2, 3);
    expect(b.vx).toBe(2); // left alone by setMover
    updateMover(b, ctx);
    expect([b.x, b.y, b.vx, b.vy, b.moverTicks]).toEqual([5, 5, 0, 0, 1]);
  });
});

describe('core/patterns edge — sine', () => {
  /**
   * The y positions of a sine body over some ticks.
   *
   * @param phase - Phase parameter.
   * @returns 120 y values.
   */
  function wave(phase: number): number[] {
    const ctx = context();
    const b = body(0, 100);
    setMover(b, ctx, MoverKind.Sine, -1, 18, 70, phase);
    const ys: number[] = [];
    for (let t = 0; t < 120; t++) {
      updateMover(b, ctx);
      ys.push(b.y);
    }
    return ys;
  }

  it('wraps the phase: negative phases and phases past a turn give the same wave', () => {
    const reference = wave(128);
    expect(wave(128 + ANGLE_UNITS)).toEqual(reference);
    expect(wave(128 - ANGLE_UNITS)).toEqual(reference);
    expect(wave(128 + 5 * ANGLE_UNITS)).toEqual(reference);
  });

  it('never jumps on the first step, whatever the phase (at most amp · 2π / period)', () => {
    for (let phase = 0; phase < ANGLE_UNITS; phase += 32) {
      const ctx = context();
      const b = body(50, 100);
      setMover(b, ctx, MoverKind.Sine, 0, 24, 60, phase);
      updateMover(b, ctx);
      expect(Math.abs(b.y - 100), `phase ${phase}`).toBeLessThanOrEqual(
        (24 * 2 * Math.PI) / 60 + 1e-3,
      );
    }
  });

  it('keeps a ground body on its world line while the camera moves', () => {
    const camera = { x: 0, y: 0 };
    const ctx = context(camera);
    const b = body(200, 150, BodyAnchor.Floor);
    setMover(b, ctx, MoverKind.Sine, 0, 10, 40, 0);
    const still = body(200, 150, BodyAnchor.Floor);
    const stillCtx = context();
    setMover(still, stillCtx, MoverKind.Sine, 0, 10, 40, 0);
    for (let t = 0; t < 80; t++) {
      camera.x += 3;
      camera.y -= 1;
      updateMover(b, ctx);
      updateMover(still, stillCtx);
      expect([b.x, b.y]).toEqual([still.x, still.y]);
    }
  });

  it('reports the step it took as its velocity', () => {
    const ctx = context();
    const b = body(0, 0);
    setMover(b, ctx, MoverKind.Sine, 1.5, 30, 50, 256);
    for (let t = 0; t < 60; t++) {
      const [x, y] = [b.x, b.y];
      updateMover(b, ctx);
      expect(b.vx).toBe(1.5);
      expect(b.x - x).toBe(1.5);
      expect(b.vy).toBeCloseTo(b.y - y, 12);
    }
  });
});

describe('core/patterns edge — path', () => {
  it('matches samplePath exactly on 40 random curves and speeds (the inlined sampler)', () => {
    const rng = createRng(0x9a7);
    const at = new Float64Array(2);
    for (let round = 0; round < 40; round++) {
      const { xs, ys } = randomPoints(rng, 2 + below(rng, 10));
      const path = pathOf(xs, ys);
      const ctx = context({ x: 0, y: 0 }, null, [path]);
      const speed = 0.25 + rng.nextFloat() * 4;
      const b = body(below(rng, 400), below(rng, 200));
      const [x0, y0] = [b.x, b.y];
      setMover(b, ctx, MoverKind.Path, 0, speed);
      const ticks = Math.ceil((path.table.length * 1.2) / speed);
      for (let t = 1; t <= ticks; t++) {
        updateMover(b, ctx);
        samplePath(path, b.s0, at);
        expect(b.x, `round ${round} tick ${t}`).toBe(x0 + at[0]);
        expect(b.y, `round ${round} tick ${t}`).toBe(y0 + at[1]);
        expect(b.s0).toBeCloseTo(speed * t, 6);
      }
    }
  });

  it('stays at the start with speed 0 and restarts the curve from where it is when re-targeted', () => {
    const path = pathOf([0, -100, -100], [0, 0, -100]);
    const ctx = context({ x: 0, y: 0 }, null, [path]);
    const b = body(300, 100);
    setMover(b, ctx, MoverKind.Path, 0, 0);
    for (let t = 0; t < 5; t++) updateMover(b, ctx);
    expect([b.x, b.y, b.vx, b.vy]).toEqual([300, 100, 0, 0]);
    setMover(b, ctx, MoverKind.Path, 0, 2);
    for (let t = 0; t < 20; t++) updateMover(b, ctx);
    const [mx, my] = [b.x, b.y];
    setMover(b, ctx, MoverKind.Path, 0, 2); // the curve starts again, translated to (mx, my)
    updateMover(b, ctx);
    const at = new Float64Array(2);
    samplePath(path, 2, at);
    expect(b.x).toBe(mx + at[0]);
    expect(b.y).toBe(my + at[1]);
  });

  it('translates a flying body`s path with the camera but not a ground body`s', () => {
    const path = pathOf([0, -80, -160], [0, 40, 0]);
    const camera = { x: 0, y: 0 };
    const ctx = context(camera, null, [path]);
    const air = body(300, 60);
    const ground = body(300, 60, BodyAnchor.Floor);
    setMover(air, ctx, MoverKind.Path, 0, 1);
    setMover(ground, ctx, MoverKind.Path, 0, 1);
    const at = new Float64Array(2);
    for (let t = 1; t <= 150; t++) {
      camera.x += 1;
      air.x += 1; // the caller's camera ride
      updateMover(air, ctx);
      updateMover(ground, ctx);
      samplePath(path, t, at);
      expect(air.x - camera.x).toBeCloseTo(300 + at[0], 9);
      expect(ground.x).toBe(300 + at[0]);
      expect(ground.y).toBe(60 + at[1]);
    }
  });

  it('samplePath: whole distances hit the samples, fractions interpolate, the end is continuous', () => {
    const rng = createRng(77);
    const at = new Float64Array(2);
    for (let round = 0; round < 20; round++) {
      const { xs, ys } = randomPoints(rng, 3 + below(rng, 6));
      const path = pathOf(xs, ys);
      const { samples, count, length } = path.table;
      for (let i = 0; i < count - 1; i++) {
        samplePath(path, i * PATH_SAMPLE_STEP, at);
        expect([at[0], at[1]]).toEqual([samples[2 * i], samples[2 * i + 1]]);
      }
      samplePath(path, length, at);
      expect([at[0], at[1]]).toEqual([xs[xs.length - 1], ys[ys.length - 1]]);
      // Just before and just after the end: within a hair of the end point.
      samplePath(path, length - 1e-9, at);
      expect(at[0]).toBeCloseTo(xs[xs.length - 1], 6);
      samplePath(path, length + 1e-9, at);
      expect(at[1]).toBeCloseTo(ys[ys.length - 1], 6);
      // Halfway between two samples: the midpoint of the chord.
      const i = Math.floor(count / 3);
      samplePath(path, i + 0.5, at);
      expect(at[0]).toBeCloseTo((samples[2 * i] + samples[2 * i + 2]) / 2, 9);
    }
  });
});

describe('core/patterns edge — waypoint', () => {
  it('arrives on the step that covers the distance exactly', () => {
    const ctx = context();
    const b = body(100, 0);
    setMover(b, ctx, MoverKind.Waypoint, 70, 40, 5, 3, -1, 0); // distance 50 = 10 steps
    for (let t = 1; t <= 10; t++) {
      updateMover(b, ctx);
      if (t < 10) expect(b.s0).toBe(0);
    }
    expect([b.x, b.y, b.s0]).toEqual([70, 40, 1]);
  });

  it('holds exactly `hold` ticks for every hold — 0 leaves on the tick after arriving (regression)', () => {
    for (const hold of [0, 1, 2, 7]) {
      const ctx = context();
      const b = body(10, 0);
      setMover(b, ctx, MoverKind.Waypoint, 0, 0, 20, hold, -3, 1);
      updateMover(b, ctx); // arrives
      expect([b.x, b.y]).toEqual([0, 0]);
      let still = 0;
      for (let t = 0; t < 20; t++) {
        updateMover(b, ctx);
        if (b.vx === 0 && b.vy === 0) still++;
        else break;
      }
      expect(still, `hold ${hold}`).toBe(hold);
      expect([b.x, b.y, b.vx, b.vy]).toEqual([-3, 1, -3, 1]);
    }
  });

  it('chases a view point while the camera scrolls (flying) and a world point on the ground', () => {
    const camera = { x: 0, y: 0 };
    const ctx = context(camera);
    const air = body(400, 100);
    const ground = body(400, 100, BodyAnchor.Floor);
    setMover(air, ctx, MoverKind.Waypoint, 200, 100, 2, 1000, 0, 0);
    setMover(ground, ctx, MoverKind.Waypoint, 200, 100, 2, 1000, 0, 0);
    for (let t = 0; t < 300; t++) {
      camera.x += 1;
      air.x += 1;
      updateMover(air, ctx);
      updateMover(ground, ctx);
    }
    expect(air.x - camera.x).toBe(200); // parked on the view point, riding the camera
    expect(ground.x).toBe(200); // parked on the world point
  });
});

describe('core/patterns edge — follow', () => {
  it('keeps its last velocity without a track', () => {
    const ctx = context();
    const b = body(0, 0);
    b.vx = -1.5;
    b.vy = 0.5;
    setMover(b, ctx, MoverKind.Follow);
    for (let t = 1; t <= 4; t++) {
      b.age = t;
      updateMover(b, ctx);
    }
    expect([b.x, b.y]).toEqual([-6, 2]);
  });

  it('replays a ground track in the world and a flying one relative to the camera', () => {
    const track = new FollowTrack();
    for (let age = 0; age < 30; age++) track.record(age, 100 + age, 50);
    const camera = { x: 1000, y: 20 };
    const ctx = context(camera);
    const air = body(0, 0);
    const ground = body(0, 0, BodyAnchor.Floor);
    air.track = track;
    ground.track = track;
    setMover(air, ctx, MoverKind.Follow);
    setMover(ground, ctx, MoverKind.Follow);
    air.age = 12;
    ground.age = 12;
    updateMover(air, ctx);
    updateMover(ground, ctx);
    expect([air.x, air.y]).toEqual([1112, 70]);
    expect([ground.x, ground.y]).toEqual([112, 50]);
    expect([ground.vx, ground.vy]).toEqual([112, 50]); // the jump onto the track
  });

  it('falls back to the last velocity once its age was overwritten by the ring', () => {
    const track = new FollowTrack();
    for (let age = 0; age < FOLLOW_HISTORY + 20; age++) track.record(age, age, 0);
    const ctx = context();
    const b = body(0, 0);
    b.track = track;
    setMover(b, ctx, MoverKind.Follow);
    b.age = 20;
    updateMover(b, ctx);
    expect(b.x).toBe(20);
    b.age = 19; // older than the ring holds
    b.vx = 1;
    updateMover(b, ctx);
    expect(b.x).toBe(21);
  });
});

describe('core/patterns edge — homing and aimed dash', () => {
  it('homing: turn rate 0 flies straight on, and a target dead ahead needs no turn', () => {
    const ctx = context();
    ctx.hasTarget = true;
    ctx.targetX = 0;
    ctx.targetY = 500;
    const b = body(0, 0);
    b.vx = -1;
    setMover(b, ctx, MoverKind.Homing, 1.5, 0);
    for (let t = 0; t < 50; t++) updateMover(b, ctx);
    expect(b.s0).toBe(ANGLE_UNITS / 2);
    expect(b.y).toBeCloseTo(0, 6);
    expect(b.x).toBeCloseTo(-75, 3);
    ctx.targetX = -1000;
    ctx.targetY = b.y;
    setMover(b, ctx, MoverKind.Homing, 1.5, 64);
    for (let t = 0; t < 20; t++) {
      updateMover(b, ctx);
      expect(b.s0).toBe(ANGLE_UNITS / 2);
    }
  });

  it('homing: keeps a constant speed while turning, and ends up circling a still target', () => {
    const ctx = context();
    ctx.hasTarget = true;
    ctx.targetX = 100;
    ctx.targetY = 100;
    const b = body(0, 0);
    setMover(b, ctx, MoverKind.Homing, 2, 8);
    let closest = Infinity;
    for (let t = 0; t < 600; t++) {
      updateMover(b, ctx);
      expect(Math.sqrt(b.vx * b.vx + b.vy * b.vy)).toBeCloseTo(2, 4);
      const d = Math.sqrt((b.x - 100) * (b.x - 100) + (b.y - 100) * (b.y - 100));
      closest = Math.min(closest, d);
    }
    expect(closest).toBeLessThan(40); // it got there, turning at 8 units per tick
  });

  it('aimedDash: a windup of 0 dashes on the first tick; without a target it dashes left', () => {
    const ctx = context();
    const b = body(50, 50);
    setMover(b, ctx, MoverKind.AimedDash, 2, 0);
    updateMover(b, ctx);
    expect(b.s1).toBe(ANGLE_UNITS / 2);
    expect(b.x).toBeCloseTo(48, 6);
    expect(b.y).toBeCloseTo(50, 6);
  });

  it('aimedDash: each of the 32 directions is hit exactly when the target lies on it', () => {
    const step = ANGLE_UNITS / AIM_DIRECTIONS;
    for (let k = 0; k < AIM_DIRECTIONS; k++) {
      const a = k * step;
      const ctx = context();
      ctx.hasTarget = true;
      ctx.targetX = 200 + cosB(a) * 120;
      ctx.targetY = 100 + sinB(a) * 120;
      const b = body(200, 100);
      setMover(b, ctx, MoverKind.AimedDash, 3, 2);
      for (let t = 0; t < 3; t++) updateMover(b, ctx);
      expect(b.s1, `direction ${k}`).toBe(a);
    }
  });

  it('aimedDash: random targets are aimed within half a direction step', () => {
    const rng = createRng(0xda5);
    const step = ANGLE_UNITS / AIM_DIRECTIONS;
    for (let round = 0; round < 300; round++) {
      const ctx = context();
      ctx.hasTarget = true;
      ctx.targetX = below(rng, 400);
      ctx.targetY = below(rng, 240);
      const b = body(below(rng, 400), below(rng, 240));
      if (Math.abs(b.x - ctx.targetX) + Math.abs(b.y - ctx.targetY) < 8) continue;
      const exact = atan2B(ctx.targetY - b.y, ctx.targetX - b.x);
      setMover(b, ctx, MoverKind.AimedDash, 2, 0);
      updateMover(b, ctx);
      expect(b.s1 % step).toBe(0);
      expect(Math.abs(angleDelta(b.s1, exact))).toBeLessThanOrEqual(step / 2 + 1);
    }
  });
});

describe('core/patterns edge — groundCrawl on hand-built maps', () => {
  /** Map width in tiles. */
  const COLS = 40;
  /** Map height in tiles. */
  const ROWS = 25;

  /**
   * A collision map from per-tile-column surfaces: tile 1 is a full floor block, tiles 2…8 floor
   * blocks 1…7 px high, tile 9 a full ceiling block, tiles 10…16 ceiling blocks 1…7 px deep.
   *
   * @param floor - Floor surface y per tile column (the first solid row), or `null` for none.
   * @param ceiling - Ceiling surface y per tile column (the first free row below the rock), or
   *   `null`.
   * @returns The map.
   */
  function map(
    floor: (col: number) => number | null,
    ceiling: (col: number) => number | null = () => null,
  ): TerrainMap {
    const tiles = new Uint8Array(COLS * ROWS);
    const tileType = new Uint8Array(17).fill(TerrainType.Solid);
    tileType[0] = TerrainType.Empty;
    const tileAnchor = new Uint8Array(17);
    const tileMask = new Uint8Array(17 * 8);
    for (let h = 1; h <= 8; h++) {
      const floorId = h === 8 ? 1 : h + 1;
      const ceilingId = h === 8 ? 9 : h + 9;
      tileAnchor[floorId] = TerrainAnchor.Floor;
      tileAnchor[ceilingId] = TerrainAnchor.Ceiling;
      tileMask.fill(h, floorId * 8, floorId * 8 + 8);
      tileMask.fill(h, ceilingId * 8, ceilingId * 8 + 8);
    }
    for (let col = 0; col < COLS; col++) {
      const f = floor(col);
      if (f !== null) {
        for (let row = 0; row < ROWS; row++) {
          const top = row * 8;
          if (top >= f) tiles[row * COLS + col] = 1;
          else if (top + 8 > f) tiles[row * COLS + col] = 1 + (top + 8 - f); // height 1…7
        }
      }
      const c = ceiling(col);
      if (c !== null) {
        for (let row = 0; row < ROWS; row++) {
          const top = row * 8;
          if (top + 8 <= c) tiles[row * COLS + col] = 9;
          else if (top < c) tiles[row * COLS + col] = 9 + (c - top); // depth 1…7
        }
      }
    }
    return { tileSize: 8, cols: COLS, rows: ROWS, tiles, tileType, tileAnchor, tileMask };
  }

  /**
   * Walks a floor crawler right from x 20 on a floor at 160 that changes by `delta` at x 80.
   *
   * @param delta - Surface change (negative = a step up).
   * @returns Whether it crossed x 80, its y there and whether it ever turned.
   */
  function walkFloor(delta: number): { crossed: boolean; y: number; turned: boolean } {
    const m = map((col) => (col < 10 ? 160 : 160 + delta));
    const ctx = context({ x: 0, y: 0 }, m);
    const hh = 5;
    const b = body(20, 160 - hh, BodyAnchor.Floor, hh);
    setMover(b, ctx, MoverKind.GroundCrawl, 1);
    let turned = false;
    let crossedY = Number.NaN;
    for (let t = 0; t < 120; t++) {
      updateMover(b, ctx);
      if (b.vx < 0) turned = true;
      if (b.x >= 80 && crossedY !== crossedY) crossedY = b.y;
    }
    return { crossed: crossedY === crossedY, y: crossedY, turned };
  }

  it(`floor: climbs and drops steps of up to ${CRAWL_STEP} px, turns at one more`, () => {
    for (const delta of [-1, -4, -CRAWL_STEP, 1, 5, CRAWL_STEP]) {
      const r = walkFloor(delta);
      expect(r.crossed, `delta ${delta}`).toBe(true);
      expect(r.turned, `delta ${delta}`).toBe(false);
      expect(r.y + 5, `delta ${delta}`).toBe(160 + delta); // standing on the new surface
    }
    for (const delta of [-(CRAWL_STEP + 1), -20, CRAWL_STEP + 1, 30]) {
      const r = walkFloor(delta);
      expect(r.crossed, `delta ${delta}`).toBe(false);
      expect(r.turned, `delta ${delta}`).toBe(true);
    }
  });

  /**
   * Walks a ceiling crawler right from x 20 under a ceiling at 40 that changes by `delta` at
   * x 80.
   *
   * @param delta - Surface change (positive = the ceiling comes down).
   * @returns Whether it crossed x 80, its y there and whether it ever turned.
   */
  function walkCeiling(delta: number): { crossed: boolean; y: number; turned: boolean } {
    const m = map(
      () => null,
      (col) => (col < 10 ? 40 : 40 + delta),
    );
    const ctx = context({ x: 0, y: 0 }, m);
    const hh = 4;
    const b = body(20, 40 + hh, BodyAnchor.Ceiling, hh);
    setMover(b, ctx, MoverKind.GroundCrawl, 1);
    let turned = false;
    let crossedY = Number.NaN;
    for (let t = 0; t < 120; t++) {
      updateMover(b, ctx);
      if (b.vx < 0) turned = true;
      if (b.x >= 80 && crossedY !== crossedY) crossedY = b.y;
    }
    return { crossed: crossedY === crossedY, y: crossedY, turned };
  }

  it(`ceiling: follows steps of up to ${CRAWL_STEP} px either way, turns at one more`, () => {
    for (const delta of [-1, -CRAWL_STEP, 3, CRAWL_STEP]) {
      const r = walkCeiling(delta);
      expect(r.crossed, `delta ${delta}`).toBe(true);
      expect(r.turned, `delta ${delta}`).toBe(false);
      expect(r.y - 4, `delta ${delta}`).toBe(40 + delta); // hanging from the new surface
    }
    for (const delta of [-(CRAWL_STEP + 1), CRAWL_STEP + 1, 24]) {
      const r = walkCeiling(delta);
      expect(r.crossed, `delta ${delta}`).toBe(false);
      expect(r.turned, `delta ${delta}`).toBe(true);
    }
  });

  it('turns at the right edge of the map and paces between two walls forever', () => {
    const m = map((col) => (col === 5 || col === 15 ? 100 : 160));
    const ctx = context({ x: 0, y: 0 }, m);
    const b = body(80, 155, BodyAnchor.Floor, 5);
    setMover(b, ctx, MoverKind.GroundCrawl, 1.5);
    let turns = 0;
    let last = b.vx;
    for (let t = 0; t < 2000; t++) {
      updateMover(b, ctx);
      expect(b.x).toBeGreaterThanOrEqual(48);
      expect(b.x).toBeLessThan(120);
      expect(b.y).toBe(155);
      if (Math.sign(b.vx) !== Math.sign(last)) turns++;
      last = b.vx;
    }
    expect(turns).toBeGreaterThan(40);
    // At the right map edge (x ≥ 320) there is no floor: it turns there too.
    const edge = body(COLS * 8 - 3, 155, BodyAnchor.Floor, 5);
    const open = map(() => 160);
    const edgeCtx = context({ x: 0, y: 0 }, open);
    setMover(edge, edgeCtx, MoverKind.GroundCrawl, 2);
    for (let t = 0; t < 10; t++) {
      updateMover(edge, edgeCtx);
      expect(edge.x).toBeLessThan(COLS * 8);
    }
    expect(edge.vx).toBeLessThan(0);
  });

  it('a turn costs the tick: the body stays put and keeps its height', () => {
    const m = map((col) => (col < 10 ? 160 : 120));
    const ctx = context({ x: 0, y: 0 }, m);
    const b = body(79.5, 155, BodyAnchor.Floor, 5);
    setMover(b, ctx, MoverKind.GroundCrawl, 1);
    updateMover(b, ctx);
    expect([b.x, b.y, b.vx, b.vy]).toEqual([79.5, 155, -1, 0]);
    updateMover(b, ctx);
    expect([b.x, b.y]).toEqual([78.5, 155]);
  });
});
