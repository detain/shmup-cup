/**
 * `core/patterns` (plan M1-08): the script runner (resumes only on wake — checked with a spy),
 * the path baker (uniform arc-length spacing ±0.5 px, passes through its points) and every mover
 * — sine maths against the table sine, path speed along the curve, waypoint enter → hold →
 * leave, follow delay, homing turn cap, aimed dash quantisation, ground crawling on the slopes
 * of the shipped tileset (and turning at walls, cliffs and the map edge).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { terrainSolidAt, type TerrainMap } from '../../src/collision/index.js';
import {
  PATH_SAMPLE_STEP,
  bakePath,
  loadContent,
  type ContentDb,
  type PathSpec,
} from '../../src/data/index.js';
import { ANGLE_UNITS, angleDelta, atan2B, sinB } from '../../src/math/index.js';
import {
  AIM_DIRECTIONS,
  BodyAnchor,
  FOLLOW_HISTORY,
  FollowTrack,
  MOVER_NAMES,
  MoverKind,
  SLEEP_FOREVER,
  createMoverContext,
  moduleInfo,
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
import { createStageTerrain } from '../../src/stage/index.js';

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
 * A mover context with a camera, optional terrain and paths.
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
 * @param points - `[x, y]` pairs.
 * @returns The spec.
 */
function pathOf(points: readonly (readonly [number, number])[]): PathSpec {
  return {
    id: 'p',
    points: points.map(([x, y]) => ({ x, y })),
    table: bakePath(
      points.map((p) => p[0]),
      points.map((p) => p[1]),
    ),
  };
}

const LOOP: readonly (readonly [number, number])[] = [
  [0, 0],
  [-150, 0],
  [-215, -20],
  [-240, -60],
  [-220, -100],
  [-180, -112],
  [-140, -92],
  [-130, -52],
  [-160, -14],
  [-230, 0],
  [-470, 0],
];

describe('core/patterns module', () => {
  it('describes itself and names the movers after the content types', () => {
    expect(moduleInfo.name).toBe('patterns');
    expect(moduleInfo.status).toBe('implemented');
    expect(MOVER_NAMES).toEqual([
      'none',
      'straight',
      'sine',
      'path',
      'waypoint',
      'follow',
      'groundCrawl',
      'homing',
      'aimedDash',
    ]);
    expect(moverKindOf('sine')).toBe(MoverKind.Sine);
    expect(moverKindOf('aimedDash')).toBe(MoverKind.AimedDash);
  });
});

describe('core/patterns resumeScript', () => {
  /**
   * A spy coroutine: counts its resumes and yields the given waits in turn.
   *
   * @param waits - Values to yield.
   * @param log - Receives the tick of every resume (via `now`).
   * @param now - Reads the current tick.
   * @returns The coroutine.
   */
  function* spy(waits: readonly number[], log: number[], now: () => number): Script {
    for (const wait of waits) {
      log.push(now());
      yield wait;
    }
    log.push(now());
  }

  it('calls next() only on the tick a script wakes', () => {
    const log: number[] = [];
    let tick = 0;
    const holder: ScriptHolder = { script: spy([30, 5, 1, 0], log, () => tick), wakeTick: 0 };
    let nexts = 0;
    const script = holder.script;
    if (script === null) throw new Error('no script');
    const next = script.next.bind(script);
    script.next = (...args: [] | [undefined]) => {
      nexts++;
      return next(...args);
    };
    for (; tick < 100; tick++) resumeScript(holder, tick);
    expect(log).toEqual([0, 30, 35, 36, 37]);
    expect(nexts).toBe(5);
    expect(holder.script).toBeNull();
  });

  it('treats 0, 1, negative and NaN waits as "next tick", floors fractions, never wakes forever', () => {
    const log: number[] = [];
    let tick = 0;
    const holder: ScriptHolder = {
      script: spy([0, -4, Number.NaN, 2.9, SLEEP_FOREVER], log, () => tick),
      wakeTick: 5,
    };
    for (; tick < 1000; tick++) resumeScript(holder, tick);
    expect(log).toEqual([5, 6, 7, 8, 10]);
    expect(holder.wakeTick).toBe(Number.POSITIVE_INFINITY);
    expect(holder.script).not.toBeNull();
  });

  it('reports whether it resumed and ignores holders without a script', () => {
    const holder: ScriptHolder = { script: null, wakeTick: 0 };
    expect(resumeScript(holder, 0)).toBe(false);
    const log: number[] = [];
    holder.script = spy([10], log, () => 0);
    expect(resumeScript(holder, 3)).toBe(true);
    expect(resumeScript(holder, 4)).toBe(false);
    expect(holder.wakeTick).toBe(13);
  });
});

describe('core/patterns bakePath / samplePath', () => {
  it('spaces the samples uniformly along the curve (±0.5 px) and passes through every point', () => {
    const path = pathOf(LOOP);
    const { samples, count, length } = path.table;
    expect(count).toBe(Math.floor(length) + 2);
    for (let i = 1; i < count - 1; i++) {
      const dx = samples[2 * i] - samples[2 * i - 2];
      const dy = samples[2 * i + 1] - samples[2 * i - 1];
      const d = Math.sqrt(dx * dx + dy * dy);
      expect(Math.abs(d - PATH_SAMPLE_STEP)).toBeLessThan(0.5);
    }
    for (const [px, py] of LOOP) {
      let best = Infinity;
      for (let i = 0; i < count; i++) {
        const dx = samples[2 * i] - px;
        const dy = samples[2 * i + 1] - py;
        best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
      }
      expect(best).toBeLessThanOrEqual(0.5 + 1e-9);
    }
    expect([samples[0], samples[1]]).toEqual([0, 0]);
    expect([samples[2 * count - 2], samples[2 * count - 1]]).toEqual([-470, 0]);
  });

  it('bakes a two-point path into an exact straight line, relative to its first point', () => {
    const table = bakePath([10, -90], [5, 5]);
    expect(table.length).toBeCloseTo(100, 9);
    expect(table.count).toBe(101);
    expect([table.endDx, table.endDy]).toEqual([-1, 0]);
    const at = new Float64Array(2);
    const spec: PathSpec = { id: 'l', points: [], table };
    samplePath(spec, 42.5, at);
    expect(at[0]).toBeCloseTo(-42.5, 9);
    expect(at[1]).toBeCloseTo(0, 9);
    samplePath(spec, 130, at); // continues along the end tangent
    expect(at[0]).toBeCloseTo(-130, 9);
    samplePath(spec, -5, at);
    expect([at[0], at[1]]).toEqual([0, 0]);
  });

  it('rejects coincident neighbours, single points and overlong curves', () => {
    expect(() => bakePath([0, 0], [0, 0])).toThrow(RangeError);
    expect(() => bakePath([0], [0])).toThrow(RangeError);
    expect(() => bakePath([0, 20000], [0, 0])).toThrow(RangeError);
  });

  it('is deterministic (identical tables from identical points)', () => {
    const a = pathOf(LOOP).table;
    const b = pathOf(LOOP).table;
    expect(Array.from(a.samples)).toEqual(Array.from(b.samples));
  });
});

describe('core/patterns movers', () => {
  it('straight: constant velocity', () => {
    const b = body(100, 50);
    const ctx = context();
    setMover(b, ctx, MoverKind.Straight, -1.5, 0.25);
    for (let i = 0; i < 10; i++) updateMover(b, ctx);
    expect([b.x, b.y, b.vx, b.vy, b.moverTicks]).toEqual([85, 52.5, -1.5, 0.25, 10]);
  });

  it('sine: x drifts linearly, y follows amp · sin(phase + t·1024/period) around the start line', () => {
    const b = body(300, 100);
    const ctx = context();
    const [vx, amp, period, phase] = [-1.25, 24, 96, 128];
    setMover(b, ctx, MoverKind.Sine, vx, amp, period, phase);
    const line = 100 - amp * sinB(phase);
    for (let t = 1; t <= 200; t++) {
      updateMover(b, ctx);
      expect(b.x).toBeCloseTo(300 + vx * t, 9);
      expect(b.y).toBe(line + amp * sinB(Math.floor(phase + (t * ANGLE_UNITS) / period)));
    }
  });

  it('sine: a flying body keeps its wave on screen while the camera scrolls (frame = camera)', () => {
    const camera = { x: 0, y: 0 };
    const b = body(300, 100);
    const ctx = context(camera);
    setMover(b, ctx, MoverKind.Sine, 0, 10, 60, 0);
    const still = body(300, 100);
    const stillCtx = context();
    setMover(still, stillCtx, MoverKind.Sine, 0, 10, 60, 0);
    for (let t = 0; t < 120; t++) {
      camera.x += 2;
      camera.y += 0.5;
      b.x += 2; // the caller's camera ride
      b.y += 0.5;
      updateMover(b, ctx);
      updateMover(still, stillCtx);
      expect(b.x - camera.x).toBeCloseTo(still.x, 9);
      expect(b.y - camera.y).toBeCloseTo(still.y, 9);
    }
  });

  it('path: moves `speed` px along the curve every tick (±0.5 px chord) and continues past the end', () => {
    const path = pathOf(LOOP);
    const ctx = context({ x: 0, y: 0 }, null, [path]);
    const b = body(400, 130);
    setMover(b, ctx, MoverKind.Path, 0, 1.75);
    let px = b.x;
    let py = b.y;
    for (let t = 0; t < 600; t++) {
      updateMover(b, ctx);
      const step = Math.sqrt((b.x - px) * (b.x - px) + (b.y - py) * (b.y - py));
      expect(Math.abs(step - 1.75)).toBeLessThanOrEqual(0.5);
      px = b.x;
      py = b.y;
    }
    // 600 · 1.75 = 1050 px: past the end of the curve, flying on along its end tangent.
    expect(b.s0).toBeCloseTo(1050, 9);
    expect(path.table.length).toBeLessThan(1050);
    expect(Math.abs(b.y - 130)).toBeLessThan(1); // the end segment is (almost) horizontal
    expect(b.vx).toBeCloseTo(-1.75, 2);
    expect(b.vx).toBeCloseTo(path.table.endDx * 1.75, 9);
  });

  it('path: an unknown path index keeps the body still', () => {
    const b = body(10, 10);
    const ctx = context();
    setMover(b, ctx, MoverKind.Path, -1, 2);
    updateMover(b, ctx);
    setMover(b, ctx, MoverKind.Path, 5, 2);
    updateMover(b, ctx);
    expect([b.x, b.y, b.vx, b.vy]).toEqual([10, 10, 0, 0]);
  });

  it('waypoint: flies to the view point, holds exactly `hold` ticks, then leaves', () => {
    const camera = { x: 1000, y: 0 };
    const ctx = context(camera);
    const b = body(1400, 40);
    setMover(b, ctx, MoverKind.Waypoint, 200, 100, 3, 20, -2, 0.5);
    let arrived = -1;
    for (let t = 1; t < 200 && arrived < 0; t++) {
      updateMover(b, ctx);
      if (b.x === 1200 && b.y === 100) arrived = t;
    }
    // Distance √(200² + 60²) ≈ 208.8 → 70 steps of 3 px.
    expect(arrived).toBe(70);
    for (let t = 0; t < 20; t++) {
      updateMover(b, ctx);
      expect([b.x, b.y]).toEqual([1200, 100]);
    }
    updateMover(b, ctx);
    expect([b.x, b.y, b.vx, b.vy]).toEqual([1198, 100.5, -2, 0.5]);
  });

  it('follow: replays the track at the body age, else keeps its last velocity', () => {
    const track = new FollowTrack();
    const ctx = context({ x: 500, y: 10 });
    for (let age = 0; age < 60; age++) track.record(age, 300 - age * 2, 50 + age);
    const b = body(800, 60);
    b.track = track;
    setMover(b, ctx, MoverKind.Follow);
    for (let age = 1; age < 60; age++) {
      b.age = age;
      updateMover(b, ctx);
      expect([b.x, b.y]).toEqual([500 + 300 - age * 2, 10 + 50 + age]);
    }
    b.age = 60; // not recorded yet: last velocity
    updateMover(b, ctx);
    expect([b.x, b.y]).toEqual([500 + 300 - 60 * 2, 10 + 50 + 60]);
    expect(track.has(59)).toBe(true);
    expect(track.has(60)).toBe(false);
    for (let age = 60; age < 60 + FOLLOW_HISTORY; age++) track.record(age, 0, 0);
    expect(track.has(59)).toBe(false); // overwritten by the ring
    track.reset();
    expect(track.has(0)).toBe(false);
  });

  it('homing: turns at most `turnRate` binary units per tick towards the target', () => {
    const ctx = context();
    ctx.hasTarget = true;
    ctx.targetX = 0;
    ctx.targetY = 0;
    const b = body(200, 0);
    b.vx = 1; // heading right (angle 0), target straight behind
    setMover(b, ctx, MoverKind.Homing, 2, 16);
    expect(b.s0).toBe(0);
    let heading = 0;
    for (let t = 0; t < 40; t++) {
      updateMover(b, ctx);
      const turned = Math.abs(angleDelta(heading, b.s0));
      expect(turned).toBeLessThanOrEqual(16);
      heading = b.s0;
      expect(Math.sqrt(b.vx * b.vx + b.vy * b.vy)).toBeCloseTo(2, 4);
    }
    // After 32 turns of 16 it points at the target (512 = left, give or take the target moving).
    expect(Math.abs(angleDelta(b.s0, atan2B(-b.y, -b.x)))).toBeLessThanOrEqual(16);
  });

  it('homing: without a target it keeps its heading; at rest it starts heading left', () => {
    const ctx = context();
    const b = body(0, 0);
    setMover(b, ctx, MoverKind.Homing, 1, 8);
    expect(b.s0).toBe(ANGLE_UNITS / 2);
    updateMover(b, ctx);
    expect(b.x).toBeCloseTo(-1, 6);
  });

  it('aimedDash: holds for the windup, aims once (quantised to 32 directions), dashes', () => {
    const ctx = context();
    ctx.hasTarget = true;
    ctx.targetX = 0;
    ctx.targetY = 37;
    const b = body(100, 0);
    setMover(b, ctx, MoverKind.AimedDash, 3, 10);
    for (let t = 0; t < 10; t++) {
      updateMover(b, ctx);
      expect([b.x, b.y]).toEqual([100, 0]);
    }
    updateMover(b, ctx);
    const step = ANGLE_UNITS / AIM_DIRECTIONS;
    expect(b.s1 % step).toBe(0);
    expect(Math.abs(angleDelta(b.s1, atan2B(37, -100)))).toBeLessThanOrEqual(step / 2 + 1);
    const heading = b.s1;
    ctx.targetX = 999; // the target moves: the dash does not steer
    for (let t = 0; t < 20; t++) updateMover(b, ctx);
    expect(b.s1).toBe(heading);
    expect(Math.sqrt(b.vx * b.vx + b.vy * b.vy)).toBeCloseTo(3, 4);
  });

  it('none: no motion of its own', () => {
    const b = body(5, 6);
    const ctx = context();
    setMover(b, ctx, MoverKind.None);
    updateMover(b, ctx);
    expect([b.x, b.y, b.vx, b.vy]).toEqual([5, 6, 0, 0]);
  });
});

describe('core/patterns groundCrawl', () => {
  /** The shipped tileset. */
  const tileset = JSON.parse(
    readFileSync(
      new URL('../../../../content/tilesets/terrain-a.tileset.json', import.meta.url),
      'utf8',
    ),
  ) as unknown;

  /**
   * Content with the shipped tileset and a stage whose floor rolls (45° and 22.5° slopes).
   *
   * @param rle - Optional RLE rows over the generator.
   * @param ceiling - Also generate a rolling ceiling.
   * @returns The DB.
   */
  function slopeDb(rle?: string[], ceiling = false): ContentDb {
    const { db, issues } = loadContent([
      { path: 'tilesets/terrain-a.tileset.json', data: tileset },
      {
        path: 'stages/s.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 's',
          name: 'S',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 2000,
          camera: [{ x: 0, speed: 0 }],
          checkpoints: [],
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-a',
            rowsTall: 25,
            generator: {
              type: 'heightfield',
              segments: [
                {
                  from: 0,
                  to: 2384,
                  floor: { base: 40, amp: 24, period: 240, seed: 7 },
                  ...(ceiling ? { ceiling: { base: 40, amp: 24, period: 200, seed: 9 } } : {}),
                },
              ],
            },
            ...(rle === undefined ? {} : { rle }),
          },
          events: [],
        },
      },
    ]);
    expect(issues).toEqual([]);
    return db;
  }

  /**
   * The collision map of the slope stage.
   *
   * @param db - Content.
   * @returns The map.
   */
  function mapOf(db: ContentDb): TerrainMap {
    const map = createStageTerrain(db.stages[0], db);
    if (map === null) throw new Error('no terrain');
    return map;
  }

  it('keeps a floor crawler standing on the surface over rolling slopes', () => {
    const map = mapOf(slopeDb());
    const ctx = context({ x: 0, y: 0 }, map);
    const hh = 6;
    const b = body(40, 0, BodyAnchor.Floor, hh);
    // Start standing on the floor below.
    for (let y = 0; y < 200; y++) {
      if (terrainSolidAt(map, 40, y)) {
        b.y = y - hh;
        break;
      }
    }
    setMover(b, ctx, MoverKind.GroundCrawl, 1);
    let minY = b.y;
    let maxY = b.y;
    for (let t = 0; t < 1800; t++) {
      updateMover(b, ctx);
      const foot = b.y + hh;
      expect(terrainSolidAt(map, b.x, foot), `t ${t}`).toBe(true);
      expect(terrainSolidAt(map, b.x, foot - 1), `t ${t}`).toBe(false);
      minY = Math.min(minY, b.y);
      maxY = Math.max(maxY, b.y);
    }
    expect(b.x).toBeGreaterThan(1800);
    expect(maxY - minY).toBeGreaterThan(24); // it really went up and down the slopes
  });

  it('keeps a ceiling crawler hanging from the surface', () => {
    const map = mapOf(slopeDb(undefined, true));
    const ctx = context({ x: 0, y: 0 }, map);
    const hh = 5;
    const b = body(60, 0, BodyAnchor.Ceiling, hh);
    for (let y = 100; y >= 0; y--) {
      if (terrainSolidAt(map, 60, y)) {
        b.y = y + 1 + hh;
        break;
      }
    }
    setMover(b, ctx, MoverKind.GroundCrawl, -0.75);
    setMover(b, ctx, MoverKind.GroundCrawl, 0.75);
    for (let t = 0; t < 1500; t++) {
      updateMover(b, ctx);
      const head = b.y - hh;
      expect(terrainSolidAt(map, b.x, head - 1), `t ${t}`).toBe(true);
      expect(terrainSolidAt(map, b.x, head), `t ${t}`).toBe(false);
    }
    expect(b.x).toBeGreaterThan(1100);
  });

  it('turns round at a wall higher than a step and at the map edge', () => {
    // A rock column (tile id 1 = solid) in column 20, rows 10…24.
    const rows: string[] = [];
    for (let r = 0; r < 25; r++) rows.push(r >= 10 ? '20*0, 1' : '');
    const map = mapOf(slopeDb(rows));
    const ctx = context({ x: 0, y: 0 }, map);
    const hh = 4;
    const b = body(100, 0, BodyAnchor.Floor, hh);
    for (let y = 0; y < 200; y++) {
      if (terrainSolidAt(map, 100, y)) {
        b.y = y - hh;
        break;
      }
    }
    setMover(b, ctx, MoverKind.GroundCrawl, 2);
    let turned = false;
    for (let t = 0; t < 200; t++) {
      updateMover(b, ctx);
      expect(b.x).toBeLessThan(160); // never enters the wall at x 160…167
      if (b.vx < 0) turned = true;
    }
    expect(turned).toBe(true);
    // Walking left it reaches the map edge (x < 0 has no floor) and turns again.
    let back = false;
    for (let t = 0; t < 400; t++) {
      updateMover(b, ctx);
      expect(b.x).toBeGreaterThanOrEqual(0);
      if (b.vx > 0) back = true;
    }
    expect(back).toBe(true);
  });

  it('walks a straight line in open space or when flying', () => {
    const ctx = context();
    const b = body(0, 50, BodyAnchor.Floor);
    setMover(b, ctx, MoverKind.GroundCrawl, -1);
    for (let t = 0; t < 5; t++) updateMover(b, ctx);
    expect([b.x, b.y, b.vy]).toEqual([-5, 50, 0]);
  });
});
