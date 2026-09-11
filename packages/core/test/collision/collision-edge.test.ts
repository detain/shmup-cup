/**
 * Edge-case suite for the collision toolkit (plan M1-06), beyond the acceptance tests in
 * `collision.test.ts`:
 *
 * - shape tests against **exact references** (integer coordinates, so every product and quotient
 *   is exact and "touching" is decided without rounding): `segmentAabb` vs an orientation-based
 *   segment/edge intersection, degenerate shapes (zero radius, zero-size box, zero-length
 *   segment) reducing to the simpler tests, direction independence of segments and capsules;
 * - the full layer interaction matrix (plan §3.2 phase 6) as a contract;
 * - the spatial grid: brute-force equality for other cell sizes, fractional origins, boxes on
 *   exact cell boundaries and far outside the area, the 9-cell overflow threshold, visit order,
 *   rebuild idempotence, the build/query protocol, capacity bookkeeping, id round-trips and
 *   zero allocation per tick.
 */
import { describe, expect, it } from 'vitest';
import {
  COLLISION_MASKS,
  CollisionLayer,
  aabbAabb,
  capsuleCircle,
  circleAabb,
  circleCircle,
  createSpatialGrid,
  layersInteract,
  pointSegmentDistanceSq,
  segmentAabb,
  type SpatialGridVisitor,
} from '../../src/collision/index.js';
import { createRng, type Rng } from '../../src/rng/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

// ------------------------------------------------------------------------------ references

/**
 * Sign of the cross product (b − a) × (c − a): exact for integer inputs.
 *
 * @param ax - Point a x.
 * @param ay - Point a y.
 * @param bx - Point b x.
 * @param by - Point b y.
 * @param cx - Point c x.
 * @param cy - Point c y.
 * @returns -1, 0 or 1.
 */
function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
}

/**
 * Whether collinear point p lies within the bounding box of segment ab.
 *
 * @param ax - Segment start x.
 * @param ay - Segment start y.
 * @param bx - Segment end x.
 * @param by - Segment end y.
 * @param px - Point x.
 * @param py - Point y.
 * @returns `true` when p is inside the segment's bounding box.
 */
function within(ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean {
  return (
    Math.min(ax, bx) <= px &&
    px <= Math.max(ax, bx) &&
    Math.min(ay, by) <= py &&
    py <= Math.max(ay, by)
  );
}

/**
 * Exact closed segment/segment intersection (CLRS orientation test, collinear cases included).
 *
 * @param s - Segment 1 `[x1, y1, x2, y2]`.
 * @param t - Segment 2 `[x1, y1, x2, y2]`.
 * @returns `true` when the segments share at least one point.
 */
function segmentsIntersect(
  s: readonly [number, number, number, number],
  t: readonly [number, number, number, number],
): boolean {
  const [ax, ay, bx, by] = s;
  const [cx, cy, dx, dy] = t;
  const d1 = orient(cx, cy, dx, dy, ax, ay);
  const d2 = orient(cx, cy, dx, dy, bx, by);
  const d3 = orient(ax, ay, bx, by, cx, cy);
  const d4 = orient(ax, ay, bx, by, dx, dy);
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  if (d1 === 0 && within(cx, cy, dx, dy, ax, ay)) return true;
  if (d2 === 0 && within(cx, cy, dx, dy, bx, by)) return true;
  if (d3 === 0 && within(ax, ay, bx, by, cx, cy)) return true;
  if (d4 === 0 && within(ax, ay, bx, by, dx, dy)) return true;
  return false;
}

/**
 * Exact reference for {@link segmentAabb}: an endpoint lies in the closed box, or the segment
 * crosses one of its four edges.
 *
 * @param x1 - Segment start x.
 * @param y1 - Segment start y.
 * @param x2 - Segment end x.
 * @param y2 - Segment end y.
 * @param bx - Box centre x.
 * @param by - Box centre y.
 * @param hw - Half width.
 * @param hh - Half height.
 * @returns Whether they share a point.
 */
function segmentAabbReference(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bx: number,
  by: number,
  hw: number,
  hh: number,
): boolean {
  const l = bx - hw;
  const r = bx + hw;
  const t = by - hh;
  const b = by + hh;
  const inside = (x: number, y: number): boolean => x >= l && x <= r && y >= t && y <= b;
  if (inside(x1, y1) || inside(x2, y2)) return true;
  const seg = [x1, y1, x2, y2] as const;
  return (
    segmentsIntersect(seg, [l, t, r, t]) ||
    segmentsIntersect(seg, [r, t, r, b]) ||
    segmentsIntersect(seg, [l, b, r, b]) ||
    segmentsIntersect(seg, [l, t, l, b])
  );
}

/**
 * A random integer in `[min, max]`.
 *
 * @param rng - Generator.
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns The integer.
 */
const int = (rng: Rng, min: number, max: number): number => rng.rangeInt(min, max);

// ------------------------------------------------------------------------------ shapes

describe('core/collision shape tests — exact references and degenerate shapes', () => {
  it('segmentAabb equals an exact segment/edge intersection reference (4,000 integer cases)', () => {
    const rng = createRng(0x5e6);
    let hits = 0;
    let touches = 0;
    for (let i = 0; i < 4000; i++) {
      // Small integers: every slab quotient is a small-denominator rational, so the float
      // comparisons decide exactly like the reference (touching included).
      const x1 = int(rng, -12, 12);
      const y1 = int(rng, -12, 12);
      const x2 = i % 5 === 0 ? x1 : int(rng, -12, 12); // some vertical segments
      const y2 = i % 7 === 0 ? y1 : int(rng, -12, 12); // some horizontal / point segments
      const bx = int(rng, -4, 4);
      const by = int(rng, -4, 4);
      const hw = int(rng, 0, 5);
      const hh = int(rng, 0, 5);
      const expected = segmentAabbReference(x1, y1, x2, y2, bx, by, hw, hh);
      expect(segmentAabb(x1, y1, x2, y2, bx, by, hw, hh), `case ${i}`).toBe(expected);
      // Direction does not matter.
      expect(segmentAabb(x2, y2, x1, y1, bx, by, hw, hh)).toBe(expected);
      if (expected) hits++;
      // Count grazing contacts: shrinking the box by half a pixel ends the contact.
      const shrinkable = hw >= 1 && hh >= 1;
      if (
        expected &&
        shrinkable &&
        !segmentAabbReference(x1, y1, x2, y2, bx, by, hw - 0.5, hh - 0.5)
      ) {
        touches++;
      }
    }
    // The random set exercises both outcomes and a fair number of edge contacts.
    expect(hits).toBeGreaterThan(400);
    expect(hits).toBeLessThan(3600);
    expect(touches).toBeGreaterThan(20);
  });

  it('segmentAabb: a zero-length segment is a point-in-box test; a zero-size box a point', () => {
    expect(segmentAabb(2, 2, 2, 2, 0, 0, 2, 2)).toBe(true); // on the corner
    expect(segmentAabb(2.001, 2, 2.001, 2, 0, 0, 2, 2)).toBe(false);
    expect(segmentAabb(0, 0, 0, 0, 0, 0, 0, 0)).toBe(true);
    // A point box on the segment, mid-way and at an end.
    expect(segmentAabb(-4, -4, 4, 4, 1, 1, 0, 0)).toBe(true);
    expect(segmentAabb(-4, -4, 4, 4, 4, 4, 0, 0)).toBe(true);
    expect(segmentAabb(-4, -4, 4, 4, 1, 1.5, 0, 0)).toBe(false);
    // Segments along the box's left and bottom edges, outside by a hair.
    expect(segmentAabb(-2, -10, -2, 10, 0, 0, 2, 2)).toBe(true);
    expect(segmentAabb(-2.0001, -10, -2.0001, 10, 0, 0, 2, 2)).toBe(false);
    expect(segmentAabb(-10, -2, 10, -2, 0, 0, 2, 2)).toBe(true);
  });

  it('segmentAabb: a segment that stops short of, or starts after, the box misses', () => {
    // On the box's line but not reaching it.
    expect(segmentAabb(-10, 0, -3, 0, 0, 0, 2, 2)).toBe(false);
    expect(segmentAabb(3, 0, 10, 0, 0, 0, 2, 2)).toBe(false);
    expect(segmentAabb(10, 0, 3, 0, 0, 0, 2, 2)).toBe(false);
    expect(segmentAabb(0, 10, 0, 3, 0, 0, 2, 2)).toBe(false);
    // A long diagonal passing just outside a corner.
    expect(segmentAabb(-10, -5.01, 5, 10, 0, 0, 2, 2)).toBe(false);
  });

  it('circleAabb: a zero-size box is circleCircle with a point; radius 0 is point-in-box', () => {
    const rng = createRng(21);
    for (let i = 0; i < 1500; i++) {
      const cx = int(rng, -10, 10);
      const cy = int(rng, -10, 10);
      const r = int(rng, 0, 8);
      const bx = int(rng, -10, 10);
      const by = int(rng, -10, 10);
      expect(circleAabb(cx, cy, r, bx, by, 0, 0)).toBe(circleCircle(cx, cy, r, bx, by, 0));
      const hw = int(rng, 0, 6);
      const hh = int(rng, 0, 6);
      const inBox = Math.abs(cx - bx) <= hw && Math.abs(cy - by) <= hh;
      expect(circleAabb(cx, cy, 0, bx, by, hw, hh)).toBe(inBox);
      // Necessary condition: a circle touching a box means its bounding square touches it.
      if (circleAabb(cx, cy, r, bx, by, hw, hh)) {
        expect(aabbAabb(cx, cy, r, r, bx, by, hw, hh)).toBe(true);
      }
    }
  });

  it('circleAabb near a corner uses the true (rounded) distance, not the bounding square', () => {
    // The bounding squares overlap, but the circle misses the corner (3,3): distance √8 > 2.
    expect(aabbAabb(5, 5, 2, 2, 0, 0, 3, 3)).toBe(true);
    expect(circleAabb(5, 5, 2, 0, 0, 3, 3)).toBe(false);
    // Exact corner contact (a 3-4-5 triangle): corner (3,3), centre (6,7), radius 5.
    expect(circleAabb(6, 7, 5, 0, 0, 3, 3)).toBe(true);
    expect(circleAabb(6, 7, 5, 0, 0, 3, 3 - 1e-9)).toBe(false);
  });

  it('circleCircle: zero radii are points; coincident centres always hit', () => {
    expect(circleCircle(1, 1, 0, 1, 1, 0)).toBe(true);
    expect(circleCircle(1, 1, 0, 1, 1.0001, 0)).toBe(false);
    expect(circleCircle(-7, 3, 0, -7, 3, 9)).toBe(true);
    // Exact contact along each axis and both diagonals of a 3-4-5 triangle.
    for (const [dx, dy] of [
      [5, 0],
      [0, -5],
      [3, 4],
      [-4, -3],
    ]) {
      expect(circleCircle(10, 10, 2, 10 + dx, 10 + dy, 3)).toBe(true);
      expect(circleCircle(10, 10, 2, 10 + dx * 1.001, 10 + dy * 1.001, 3)).toBe(false);
    }
  });

  it('aabbAabb: zero-size boxes are points; shared edges on every side count', () => {
    expect(aabbAabb(3, 3, 0, 0, 3, 3, 0, 0)).toBe(true);
    expect(aabbAabb(3, 3, 0, 0, 3, 3.5, 0, 0)).toBe(false);
    for (const [bx, by] of [
      [4, 0],
      [-4, 0],
      [0, 4],
      [0, -4],
      [4, -4],
      [-4, 4],
    ]) {
      expect(aabbAabb(0, 0, 2, 2, bx, by, 2, 2)).toBe(true);
      expect(aabbAabb(0, 0, 2, 2, bx * 1.0001, by * 1.0001, 2, 2)).toBe(false);
    }
    // A thin box crossing a wide one (no corner inside the other) overlaps.
    expect(aabbAabb(0, 0, 10, 1, 0, 0, 1, 10)).toBe(true);
  });

  it('pointSegmentDistanceSq: never negative, never above the nearer endpoint, exact on axes', () => {
    const rng = createRng(99);
    for (let i = 0; i < 2000; i++) {
      const px = int(rng, -20, 20);
      const py = int(rng, -20, 20);
      const x1 = int(rng, -20, 20);
      const y1 = int(rng, -20, 20);
      const x2 = int(rng, -20, 20);
      const y2 = int(rng, -20, 20);
      const d = pointSegmentDistanceSq(px, py, x1, y1, x2, y2);
      const toA = (px - x1) * (px - x1) + (py - y1) * (py - y1);
      const toB = (px - x2) * (px - x2) + (py - y2) * (py - y2);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(Math.min(toA, toB) + 1e-9);
      // Reversing the segment changes the rounding at most.
      expect(pointSegmentDistanceSq(px, py, x2, y2, x1, y1)).toBeCloseTo(d, 9);
    }
    // Horizontal and vertical segments: the perpendicular distance, exactly.
    expect(pointSegmentDistanceSq(4, -7, -10, 0, 10, 0)).toBe(49);
    expect(pointSegmentDistanceSq(-3, 5, 0, -10, 0, 10)).toBe(9);
    // The point on the segment, including at its ends.
    expect(pointSegmentDistanceSq(10, 0, -10, 0, 10, 0)).toBe(0);
    expect(pointSegmentDistanceSq(0, 0, -10, 0, 10, 0)).toBe(0);
  });

  it('capsuleCircle: a zero-length capsule is circleCircle; the direction does not matter', () => {
    const rng = createRng(1234);
    for (let i = 0; i < 1500; i++) {
      const x1 = int(rng, -20, 20);
      const y1 = int(rng, -20, 20);
      const cr = int(rng, 0, 5);
      const cx = int(rng, -20, 20);
      const cy = int(rng, -20, 20);
      const r = int(rng, 0, 5);
      expect(capsuleCircle(x1, y1, x1, y1, cr, cx, cy, r)).toBe(
        circleCircle(x1, y1, cr, cx, cy, r),
      );
      const x2 = int(rng, -20, 20);
      const y2 = int(rng, -20, 20);
      const reach = (cr + r) * (cr + r);
      const d = pointSegmentDistanceSq(cx, cy, x1, y1, x2, y2);
      // Away from the exact contact distance, both directions agree.
      if (Math.abs(d - reach) > 1e-6) {
        expect(capsuleCircle(x1, y1, x2, y2, cr, cx, cy, r)).toBe(
          capsuleCircle(x2, y2, x1, y1, cr, cx, cy, r),
        );
      }
    }
  });

  it('capsuleCircle: a zero-width beam still hits a circle it passes through', () => {
    expect(capsuleCircle(0, 0, 100, 0, 0, 50, 1.5, 1.5)).toBe(true); // grazes the hurt radius
    expect(capsuleCircle(0, 0, 100, 0, 0, 50, 1.6, 1.5)).toBe(false);
    expect(capsuleCircle(0, 0, 100, 0, 0, 50, 0, 0)).toBe(true); // a point on the beam
  });
});

// ------------------------------------------------------------------------------ layers

describe('core/collision layers — the interaction matrix', () => {
  const L = CollisionLayer;

  it('uses distinct single bits', () => {
    const bits = Object.values(L);
    expect(new Set(bits).size).toBe(bits.length);
    for (const bit of bits) {
      expect(bit > 0 && (bit & (bit - 1)) === 0).toBe(true);
    }
  });

  it('matches plan §3.2 phase 6 exactly (who is tested against whom)', () => {
    const pairs: [number, number][] = [
      [L.PlayerShot, L.Enemy],
      [L.EnemyBullet, L.Player],
      [L.EnemyLaser, L.Player],
      [L.Enemy, L.Player],
      [L.Item, L.Player],
      [L.Player, L.Terrain],
      [L.PlayerShot, L.Terrain],
      [L.EnemyBullet, L.Terrain],
    ];
    const bits = Object.values(L);
    const all = bits.reduce((m, b) => m | b, 0);
    for (const a of bits) {
      expect(COLLISION_MASKS[a] & ~all).toBe(0); // only known bits
      expect(layersInteract(a, a)).toBe(false); // no layer hits itself
      for (const b of bits) {
        const listed = pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
        expect(layersInteract(a, b), `${a} × ${b}`).toBe(listed);
      }
    }
  });

  it('keeps the masks frozen', () => {
    expect(Object.isFrozen(COLLISION_MASKS)).toBe(true);
  });
});

// ------------------------------------------------------------------------------ grid

describe('core/collision spatial grid — edge cases', () => {
  /** A box with its id. */
  interface Box {
    readonly id: number;
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
  }

  /**
   * Brute-force closed-box overlap.
   *
   * @param a - Box.
   * @param b - Box.
   * @returns Whether they overlap or touch.
   */
  const overlaps = (a: Box, b: Box): boolean =>
    a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;

  /**
   * Runs one query and returns the ids sorted, checking uniqueness and the returned count.
   *
   * @param grid - The grid.
   * @param q - The query box.
   * @returns Sorted ids.
   */
  const queryIds = (grid: ReturnType<typeof createSpatialGrid>, q: Box): number[] => {
    const found: number[] = [];
    const n = grid.query(q.x0, q.y0, q.x1, q.y1, (id) => {
      found.push(id);
    });
    expect(n).toBe(found.length);
    expect(new Set(found).size).toBe(found.length);
    return found.sort((a, b) => a - b);
  };

  it.each([
    [8, 0, 0],
    [17, 3.25, -7.5],
    [50, -1000.5, 400.125],
    [512, 0, 0], // a single cell
  ])(
    'equals brute force with cell size %i and origin (%f, %f), boxes on cell lines included',
    (cellSize, ox, oy) => {
      const rng = createRng(cellSize * 31 + 7);
      const w = 300;
      const h = 180;
      const grid = createSpatialGrid(w, h, cellSize, 600);
      const boxes: Box[] = [];
      for (let i = 0; i < 600; i++) {
        // A third of the boxes sit exactly on cell boundaries (edges shared with the grid lines).
        const snap = i % 3 === 0;
        const x0 = snap
          ? ox + int(rng, -2, Math.ceil(w / cellSize) + 2) * cellSize
          : ox + int(rng, -80, w + 80) + rng.nextFloat();
        const y0 = snap
          ? oy + int(rng, -2, Math.ceil(h / cellSize) + 2) * cellSize
          : oy + int(rng, -80, h + 80) + rng.nextFloat();
        const bw = snap ? int(rng, 0, 2) * cellSize : int(rng, 0, 3 * cellSize) + rng.nextFloat();
        const bh = snap ? int(rng, 0, 2) * cellSize : int(rng, 0, 3 * cellSize) + rng.nextFloat();
        boxes.push({ id: i, x0, y0, x1: x0 + bw, y1: y0 + bh });
      }
      grid.begin(ox, oy);
      for (const b of boxes) grid.insert(b.id, b.x0, b.y0, b.x1, b.y1);
      grid.build();
      for (let q = 0; q < 250; q++) {
        const qx = ox + int(rng, -100, w + 100) + (q % 2 === 0 ? 0 : rng.nextFloat());
        const qy = oy + int(rng, -100, h + 100) + (q % 2 === 0 ? 0 : rng.nextFloat());
        const query: Box = {
          id: -1,
          x0: qx,
          y0: qy,
          x1: qx + int(rng, 0, 2 * cellSize),
          y1: qy + int(rng, 0, 2 * cellSize),
        };
        const expected = boxes.filter((b) => overlaps(b, query)).map((b) => b.id);
        expect(queryIds(grid, query)).toEqual(expected);
      }
    },
  );

  it('finds boxes at the 9-cell overflow threshold and beyond, once each, from any cell', () => {
    const grid = createSpatialGrid(320, 320, 32, 16);
    grid.begin(0, 0);
    grid.insert(1, 40, 40, 100, 100); // 3×3 = 9 cells (stays in the cells)
    grid.insert(2, 40, 40, 140, 100); // 4×3 = 12 cells (overflow list)
    grid.insert(3, -1e6, -1e6, 1e6, 1e6); // everything (overflow)
    grid.insert(4, 200, 200, 200, 200); // a point
    grid.build();
    const all: Box = { id: 0, x0: -10, y0: -10, x1: 400, y1: 400 };
    expect(queryIds(grid, all)).toEqual([1, 2, 3, 4]);
    expect(queryIds(grid, { id: 0, x0: 100, y0: 100, x1: 100, y1: 100 })).toEqual([1, 2, 3]);
    expect(queryIds(grid, { id: 0, x0: 120, y0: 60, x1: 130, y1: 70 })).toEqual([2, 3]);
    expect(queryIds(grid, { id: 0, x0: 300, y0: 10, x1: 310, y1: 20 })).toEqual([3]);
    // Far outside the area: only the huge box reaches it.
    expect(queryIds(grid, { id: 0, x0: 5000, y0: 5000, x1: 5001, y1: 5001 })).toEqual([3]);
  });

  it('clamps boxes and queries outside the area into the border cells without false hits', () => {
    const grid = createSpatialGrid(64, 64, 32, 8);
    grid.begin(0, 0);
    grid.insert(1, -500, 10, -490, 20); // far left
    grid.insert(2, 600, 600, 610, 610); // far bottom-right
    grid.insert(3, 10, 10, 12, 12);
    grid.build();
    // Same border cell, but the stored boxes are tested exactly.
    expect(queryIds(grid, { id: 0, x0: -300, y0: 10, x1: -290, y1: 20 })).toEqual([]);
    expect(queryIds(grid, { id: 0, x0: -495, y0: 15, x1: -495, y1: 15 })).toEqual([1]);
    expect(queryIds(grid, { id: 0, x0: 605, y0: 605, x1: 700, y1: 700 })).toEqual([2]);
    expect(queryIds(grid, { id: 0, x0: 0, y0: 0, x1: 12, y1: 12 })).toEqual([3]);
  });

  it('visits in cell order, then insertion order within a cell', () => {
    const grid = createSpatialGrid(128, 32, 32, 8);
    grid.begin(0, 0);
    grid.insert(30, 100, 5, 101, 6); // cell 3
    grid.insert(10, 5, 5, 6, 6); // cell 0
    grid.insert(11, 7, 7, 8, 8); // cell 0, later
    grid.insert(20, 40, 5, 41, 6); // cell 1
    grid.build();
    const order: number[] = [];
    grid.query(0, 0, 127, 31, (id) => {
      order.push(id);
    });
    expect(order).toEqual([10, 11, 20, 30]);
  });

  it('build() twice gives the same answers; queries repeat without side effects', () => {
    const rng = createRng(4);
    const grid = createSpatialGrid(200, 200, 32, 64);
    grid.begin(0, 0);
    for (let i = 0; i < 64; i++) {
      const x = int(rng, -20, 220);
      const y = int(rng, -20, 220);
      grid.insert(i, x, y, x + int(rng, 0, 50), y + int(rng, 0, 50));
    }
    grid.build();
    const q: Box = { id: 0, x0: 50, y0: 50, x1: 120, y1: 90 };
    const first = queryIds(grid, q);
    expect(first.length).toBeGreaterThan(0);
    grid.build();
    expect(queryIds(grid, q)).toEqual(first);
    for (let i = 0; i < 5; i++) expect(queryIds(grid, q)).toEqual(first);
  });

  it('an insert after build() invalidates queries until the next build()', () => {
    const grid = createSpatialGrid(64, 64, 32, 4);
    grid.begin(0, 0);
    grid.insert(1, 0, 0, 1, 1);
    grid.build();
    expect(queryIds(grid, { id: 0, x0: 0, y0: 0, x1: 64, y1: 64 })).toEqual([1]);
    grid.insert(2, 2, 2, 3, 3);
    expect(() => grid.query(0, 0, 64, 64, () => {})).toThrow(/before build/);
    grid.build();
    expect(queryIds(grid, { id: 0, x0: 0, y0: 0, x1: 64, y1: 64 })).toEqual([1, 2]);
    // begin() after unbuilt inserts starts a clean, queryable tick.
    grid.insert(3, 5, 5, 6, 6);
    grid.begin(0, 0);
    expect(queryIds(grid, { id: 0, x0: 0, y0: 0, x1: 64, y1: 64 })).toEqual([]);
  });

  it('keeps counting dropped inserts while full; the kept boxes are still found', () => {
    const grid = createSpatialGrid(64, 64, 32, 3);
    grid.begin(0, 0);
    for (let i = 0; i < 7; i++) grid.insert(i, i, i, i + 1, i + 1);
    expect([grid.count, grid.dropped]).toEqual([3, 4]);
    grid.build();
    expect(queryIds(grid, { id: 0, x0: 0, y0: 0, x1: 64, y1: 64 })).toEqual([0, 1, 2]);
  });

  it('returns the caller ids unchanged, negative ones included', () => {
    const grid = createSpatialGrid(64, 64, 32, 4);
    grid.begin(0, 0);
    grid.insert(-1, 0, 0, 1, 1);
    grid.insert(0x7fffffff, 2, 2, 3, 3);
    grid.insert(0, 4, 4, 5, 5);
    grid.build();
    expect(queryIds(grid, { id: 0, x0: 0, y0: 0, x1: 64, y1: 64 })).toEqual([-1, 0, 0x7fffffff]);
  });

  it('sizes its cells by rounding up and rejects non-numeric sizes', () => {
    const grid = createSpatialGrid(100, 50, 32);
    expect([grid.cols, grid.rows]).toEqual([4, 2]);
    expect([createSpatialGrid(1, 1).cols, createSpatialGrid(1, 1).rows]).toEqual([1, 1]);
    expect(() => createSpatialGrid(Number.NaN, 10)).toThrow(RangeError);
    expect(() => createSpatialGrid(10, -1)).toThrow(RangeError);
    expect(() => createSpatialGrid(10, 10, Number.NaN)).toThrow(RangeError);
    expect(() => createSpatialGrid(10, 10, 32, -4)).toThrow(RangeError);
  });

  it('allocates nothing per tick: begin → insert × 64 → build → query × 64', () => {
    const grid = createSpatialGrid(512, 328, 32, 256);
    const rng = createRng(77);
    const n = 64;
    const xs = new Int32Array(n);
    const ys = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = int(rng, -40, 540);
      ys[i] = int(rng, -40, 360);
    }
    let hits = 0;
    const visit: SpatialGridVisitor = (id) => {
      hits += id & 1;
    };
    // Integer coordinates on purpose: they travel as small integers, so this measures what the
    // grid itself allocates. Fractional coordinates can additionally cost 16 B per argument when
    // V8 does not inline a call site (a JS call passes doubles boxed) — keep collision call
    // sites small, and let the world-level guard (world tests) catch it if one is not.
    const growth = measureHeapGrowth((tick) => {
      grid.begin(tick & 7, -(tick & 3));
      for (let i = 0; i < n; i++) grid.insert(i, xs[i], ys[i], xs[i] + 12, ys[i] + 9);
      grid.build();
      for (let i = 0; i < n; i++) grid.query(xs[i] - 2, ys[i] - 2, xs[i] + 2, ys[i] + 2, visit);
    }, 10_000);
    expect(hits).toBeGreaterThan(0);
    expect(growth.bytes).toBeLessThan(256 * 1024);
  });
});
