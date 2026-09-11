/**
 * Edge cases of the `paths` content kind and the path baker (plan M1-08), beyond `patterns.test.ts`:
 *
 * - `bakePath` properties over random curves: uniform 1-px arc-length spacing (±0.5 px chord),
 *   sample 0 at the origin and the last sample on the last point, the sample count formula,
 *   the curve at least as long as the control polygon, translation invariance (the table is
 *   relative to the first point), reversal symmetry of the length, a unit end tangent; exact
 *   limits (a straight line of exactly {@link MAX_PATH_LENGTH} px is fine, one pixel more is
 *   not); argument errors;
 * - the centripetal parameterisation: close control points next to far ones never make the
 *   curve overshoot wildly (the uniform variant's cusps / loops);
 * - the loader: 2 … 64 points, coordinate bounds, coincident neighbours and overlong curves as
 *   issues (the file's other paths still load), duplicate ids across files, `path` refs from
 *   stage events and `path` movers resolving to `pathId` (unknown ids are issues, absent ones
 *   `-1`).
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_PATH_LENGTH,
  PATH_SAMPLE_STEP,
  bakePath,
  loadContent,
  type ContentFile,
  type PathTable,
} from '../../src/data/index.js';
import { createRng, type Rng } from '../../src/rng/index.js';

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
 * Random control points (consecutive ones distinct).
 *
 * @param rng - Random source.
 * @param n - Point count.
 * @param spread - Largest step per axis.
 * @returns The coordinates.
 */
function randomPoints(rng: Rng, n: number, spread = 120): { xs: number[]; ys: number[] } {
  const xs = [below(rng, 200) - 100];
  const ys = [below(rng, 200) - 100];
  for (let i = 1; i < n; i++) {
    let x: number;
    let y: number;
    do {
      x = xs[i - 1] + below(rng, 2 * spread + 1) - spread;
      y = ys[i - 1] + below(rng, 2 * spread + 1) - spread;
    } while (x === xs[i - 1] && y === ys[i - 1]);
    xs.push(x);
    ys.push(y);
  }
  return { xs, ys };
}

/**
 * Distance between samples `i` and `j` of a table.
 *
 * @param t - The table.
 * @param i - First sample.
 * @param j - Second sample.
 * @returns The distance.
 */
function gap(t: PathTable, i: number, j: number): number {
  const dx = t.samples[2 * j] - t.samples[2 * i];
  const dy = t.samples[2 * j + 1] - t.samples[2 * i + 1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Random control points of a *smooth* path (content-like): each leg 20…140 px long, turning at
 * most 60° from the previous leg.
 *
 * @param rng - Random source.
 * @param n - Point count.
 * @returns The coordinates.
 */
function smoothPoints(rng: Rng, n: number): { xs: number[]; ys: number[] } {
  const xs = [0];
  const ys = [0];
  let heading = rng.nextFloat() * 2 * Math.PI;
  for (let i = 1; i < n; i++) {
    heading += (rng.nextFloat() - 0.5) * ((2 * Math.PI) / 3);
    const leg = 20 + below(rng, 121);
    xs.push(Math.round(xs[i - 1] + Math.cos(heading) * leg));
    ys.push(Math.round(ys[i - 1] + Math.sin(heading) * leg));
  }
  return { xs, ys };
}

describe('core/data bakePath — properties over random curves', () => {
  it('spaces samples 1 px apart along smooth curves (±0.5 px chord, 150 curves)', () => {
    const rng = createRng(0x5e0);
    for (let round = 0; round < 150; round++) {
      const { xs, ys } = smoothPoints(rng, 2 + below(rng, 14));
      const t = bakePath(xs, ys);
      let worst = 0;
      for (let i = 1; i < t.count - 1; i++) {
        worst = Math.max(worst, Math.abs(gap(t, i - 1, i) - PATH_SAMPLE_STEP));
      }
      expect(worst, `round ${round}`).toBeLessThan(0.5);
    }
  });

  it('never spaces samples more than 1 px apart, even around hairpins, and pins both ends', () => {
    // At a hairpin the 1-px arc wraps round the tip, so its chord may be short — never long.
    const rng = createRng(0xba4e);
    for (let round = 0; round < 150; round++) {
      const { xs, ys } = randomPoints(rng, 2 + below(rng, 14));
      const t = bakePath(xs, ys);
      const n = xs.length;
      const whole = Math.floor(t.length / PATH_SAMPLE_STEP);
      expect(t.count).toBe(whole === t.length ? whole + 1 : whole + 2);
      expect(t.samples).toHaveLength(2 * t.count);
      expect([t.samples[0], t.samples[1]]).toEqual([0, 0]);
      expect([t.samples[2 * t.count - 2], t.samples[2 * t.count - 1]]).toEqual([
        xs[n - 1] - xs[0],
        ys[n - 1] - ys[0],
      ]);
      let longest = 0;
      let shortest = Infinity;
      for (let i = 1; i < t.count; i++) {
        const d = gap(t, i - 1, i);
        longest = Math.max(longest, d);
        if (i < t.count - 1) shortest = Math.min(shortest, d);
      }
      expect(longest, `round ${round}`).toBeLessThanOrEqual(PATH_SAMPLE_STEP + 1e-9);
      expect(shortest, `round ${round}`).toBeGreaterThan(0);
      // The curve passes through every control point, so it is at least the polygon's length.
      let polygon = 0;
      for (let i = 1; i < n; i++) {
        polygon += Math.sqrt((xs[i] - xs[i - 1]) ** 2 + (ys[i] - ys[i - 1]) ** 2);
      }
      expect(t.length).toBeGreaterThanOrEqual(polygon - 1e-9);
      expect(Math.sqrt(t.endDx * t.endDx + t.endDy * t.endDy)).toBeCloseTo(1, 12);
    }
  });

  it('is relative to the first point: translated points bake the identical table', () => {
    const rng = createRng(12);
    for (let round = 0; round < 30; round++) {
      const { xs, ys } = randomPoints(rng, 3 + below(rng, 8));
      const dx = below(rng, 2000) - 1000;
      const dy = below(rng, 2000) - 1000;
      const a = bakePath(xs, ys);
      const b = bakePath(
        xs.map((x) => x + dx),
        ys.map((y) => y + dy),
      );
      expect(b.length).toBe(a.length);
      expect(Array.from(b.samples)).toEqual(Array.from(a.samples));
      expect([b.endDx, b.endDy]).toEqual([a.endDx, a.endDy]);
    }
  });

  it('gives a reversed curve the same length (the spline is symmetric)', () => {
    const rng = createRng(99);
    for (let round = 0; round < 30; round++) {
      const { xs, ys } = randomPoints(rng, 2 + below(rng, 10));
      const forward = bakePath(xs, ys);
      const backward = bakePath(xs.slice().reverse(), ys.slice().reverse());
      expect(backward.length).toBeCloseTo(forward.length, 6);
    }
  });

  it('keeps close points from overshooting (centripetal: no loops or cusps)', () => {
    // Uniform Catmull-Rom loops wildly around a tight pair of points between far ones.
    const xs = [0, -200, -202, -400];
    const ys = [0, 0, 1, 0];
    const t = bakePath(xs, ys);
    let minX = Infinity;
    let maxX = -Infinity;
    let maxAbsY = 0;
    for (let i = 0; i < t.count; i++) {
      minX = Math.min(minX, t.samples[2 * i]);
      maxX = Math.max(maxX, t.samples[2 * i]);
      maxAbsY = Math.max(maxAbsY, Math.abs(t.samples[2 * i + 1]));
    }
    expect(maxX).toBeLessThanOrEqual(1e-9);
    expect(minX).toBeGreaterThanOrEqual(-400 - 1e-9);
    expect(maxAbsY).toBeLessThan(10);
    expect(t.length).toBeLessThan(420);
  });

  it('bakes a straight line of exactly MAX_PATH_LENGTH px and rejects one pixel more', () => {
    const exact = bakePath([0, -MAX_PATH_LENGTH], [0, 0]);
    expect(exact.length).toBe(MAX_PATH_LENGTH);
    expect(exact.count).toBe(MAX_PATH_LENGTH / PATH_SAMPLE_STEP + 1);
    expect([exact.endDx, exact.endDy]).toEqual([-1, 0]);
    expect(() => bakePath([0, -MAX_PATH_LENGTH - 1], [0, 0])).toThrow(
      `path is ${MAX_PATH_LENGTH + 1} px long (at most ${MAX_PATH_LENGTH})`,
    );
  });

  it('bakes a fractional-length curve with a short last step, and a sub-pixel path', () => {
    // A 3-4-5 line: 5 px up to the rounding of 64 summed dense steps, so the table may end with
    // a sub-ulp last step — always on the end point.
    const t = bakePath([0, 3], [0, 4]);
    expect(t.length).toBeCloseTo(5, 12);
    expect(t.count).toBe(t.length === 5 ? 6 : 7);
    expect([t.samples[2 * t.count - 2], t.samples[2 * t.count - 1]]).toEqual([3, 4]);
    expect(t.samples[10]).toBeCloseTo(3, 12);
    const tiny = bakePath([0, 0.25], [0, 0]);
    expect(tiny.length).toBe(0.25);
    expect(tiny.count).toBe(2);
    expect(Array.from(tiny.samples)).toEqual([0, 0, 0.25, 0]);
    const diagonal = bakePath([0, 1], [0, 1]);
    expect(diagonal.length).toBeCloseTo(Math.SQRT2, 12);
    expect(diagonal.count).toBe(3);
  });

  it('reports its argument errors', () => {
    expect(() => bakePath([], [])).toThrow(RangeError);
    expect(() => bakePath([0, 1, 2], [0, 1])).toThrow('a path needs at least two points');
    expect(() => bakePath([0, 5, 5], [0, 0, 0])).toThrow('path points 1 and 2 coincide');
    // Non-neighbours may coincide (a path that returns to its start).
    const round = bakePath([0, -50, -50, 0, 0], [0, 0, 50, 50, 0]);
    expect(round.samples[2 * round.count - 2]).toBe(0);
    expect(round.samples[2 * round.count - 1]).toBe(0);
  });
});

/**
 * A `paths` content file.
 *
 * @param paths - The entries.
 * @param name - File name below `paths/`.
 * @returns The file.
 */
function pathsFile(paths: unknown[], name = 'p.paths.json'): ContentFile {
  return { path: 'paths/' + name, data: { formatVersion: 1, kind: 'paths', paths } };
}

/**
 * Points helper.
 *
 * @param coords - `[x, y]` pairs.
 * @returns Point objects.
 */
function pts(...coords: Array<[number, number]>): Array<{ x: number; y: number }> {
  return coords.map(([x, y]) => ({ x, y }));
}

describe('core/data loadContent — paths', () => {
  it('bakes every path and indexes it by id, in file order', () => {
    const { db, issues } = loadContent([
      pathsFile([
        { id: 'a', points: pts([0, 0], [-10, 0]) },
        { id: 'b', points: pts([5, 5], [5, 25], [25, 25]) },
      ]),
    ]);
    expect(issues).toEqual([]);
    expect(db.paths.map((p) => p.id)).toEqual(['a', 'b']);
    expect(db.pathIndex.get('b')).toBe(1);
    expect(db.paths[0].table.length).toBe(10);
    expect(db.paths[1].points).toEqual(pts([5, 5], [5, 25], [25, 25]));
    // Relative to the first point.
    const t = db.paths[1].table;
    expect([t.samples[2 * t.count - 2], t.samples[2 * t.count - 1]]).toEqual([20, 20]);
  });

  it('checks the point count and coordinate bounds', () => {
    const many = [];
    for (let i = 0; i < 65; i++) many.push({ x: -i, y: 0 });
    const { issues } = loadContent([
      pathsFile([
        { id: 'one', points: pts([0, 0]) },
        { id: 'many', points: many },
        { id: 'far', points: pts([0, 0], [-4097, 0]) },
        {
          id: 'nan',
          points: [
            { x: 0, y: 0 },
            { x: 'left', y: 0 },
          ],
        },
        {
          id: 'extra',
          points: [
            { x: 0, y: 0, z: 1 },
            { x: 1, y: 0 },
          ],
        },
      ]),
    ]);
    expect(issues).toEqual([
      { path: 'paths/p.paths.json:paths[0].points', message: 'must have at least 2 items' },
      { path: 'paths/p.paths.json:paths[1].points', message: 'must have at most 64 items' },
      {
        path: 'paths/p.paths.json:paths[2].points[1].x',
        message: 'must be a finite number in -4096..4096',
      },
      {
        path: 'paths/p.paths.json:paths[3].points[1].x',
        message: 'must be a finite number in -4096..4096',
      },
      { path: 'paths/p.paths.json:paths[4].points[0].z', message: 'unknown field' },
    ]);
  });

  it('accepts 64 points and the coordinate limits', () => {
    const points = [];
    for (let i = 0; i < 64; i++) points.push({ x: -i * 4, y: i % 2 === 0 ? 0 : 3 });
    const { db, issues } = loadContent([
      pathsFile([
        { id: 'zig', points },
        { id: 'wide', points: pts([4096, -4096], [-4096, -4096]) },
      ]),
    ]);
    expect(issues).toEqual([]);
    expect(db.paths[0].table.length).toBeGreaterThan(63 * 4);
    expect(db.paths[1].table.length).toBe(8192);
  });

  it('reports coincident neighbours and overlong curves, and still loads the good paths', () => {
    const { db, issues } = loadContent([
      pathsFile([
        { id: 'dup', points: pts([0, 0], [-5, 0], [-5, 0], [-9, 0], [-9, 0]) },
        { id: 'good', points: pts([0, 0], [-30, 40]) },
        { id: 'long', points: pts([0, 0], [-4096, 4096], [4096, 4096], [-4096, -4096]) },
      ]),
    ]);
    expect(issues).toEqual([
      { path: 'paths/p.paths.json:paths[0].points[2]', message: 'must differ from points[1]' },
      { path: 'paths/p.paths.json:paths[0].points[4]', message: 'must differ from points[3]' },
      {
        path: 'paths/p.paths.json:paths[2].points',
        message: expect.stringMatching(/^path is \d+ px long \(at most 16384\)$/) as string,
      },
    ]);
    expect(db.paths.map((p) => p.id)).toEqual(['good']);
    expect(db.pathIndex.get('good')).toBe(0);
    expect(db.pathIndex.has('dup')).toBe(false);
  });

  it('reports a path id defined twice (across files)', () => {
    const { db, issues } = loadContent([
      pathsFile([{ id: 'x', points: pts([0, 0], [1, 0]) }], 'a.paths.json'),
      pathsFile([{ id: 'x', points: pts([0, 0], [0, 1]) }], 'b.paths.json'),
    ]);
    expect(db.paths).toHaveLength(1);
    expect(db.paths[0].table.endDx).toBe(1); // the first file (path order) wins
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe('paths/b.paths.json:paths[0].id');
    expect(issues[0].message).toMatch(/"x"/);
  });

  it('resolves `path` refs of stage events and path movers, absent ones to -1', () => {
    const { db, issues } = loadContent([
      pathsFile([
        { id: 'p0', points: pts([0, 0], [-10, 0]) },
        { id: 'p1', points: pts([0, 0], [0, 10]) },
      ]),
      {
        path: 'enemies/e.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            {
              id: 'own',
              hp: 1,
              score: 1,
              hurtbox: { hw: 2, hh: 2 },
              script: 'x',
              sprite: 's',
              drop: null,
              mover: { type: 'path', path: 'p1', speed: 1 },
            },
            {
              id: 'spawned',
              hp: 1,
              score: 1,
              hurtbox: { hw: 2, hh: 2 },
              script: 'x',
              sprite: 's',
              drop: null,
              mover: { type: 'path', speed: 2 },
            },
            {
              id: 'bad',
              hp: 1,
              score: 1,
              hurtbox: { hw: 2, hh: 2 },
              script: 'x',
              sprite: 's',
              drop: null,
              mover: { type: 'path', path: 'nope', speed: 2 },
            },
          ],
        },
      },
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
          events: [
            { x: 10, type: 'spawn', enemy: 'own', path: 'p0' },
            { x: 20, type: 'formation', enemy: 'spawned', count: 2, interval: 5, path: 'p1' },
            { x: 30, type: 'spawn', enemy: 'own' },
            { x: 40, type: 'spawn', enemy: 'own', path: 'missing' },
          ],
        },
      },
    ]);
    expect(issues).toEqual([
      { path: 'enemies/e.enemies.json:enemies[2].mover.path', message: 'unknown path id "nope"' },
      { path: 'stages/s.stage.json:events[3].path', message: 'unknown path id "missing"' },
    ]);
    expect(db.enemies.map((e) => (e.mover as { pathId: number }).pathId)).toEqual([1, -1, -1]);
    expect(db.stages[0].events.map((e) => (e as { pathId: number }).pathId)).toEqual([
      0, 1, -1, -1,
    ]);
  });
});
