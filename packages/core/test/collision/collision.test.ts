/**
 * Tests for the collision toolkit (plan M1-06): every scalar shape test including edge contact
 * (shapes are closed — touching is a hit), the layer masks, and the uniform grid broad phase —
 * a property test compares its queries with brute force over 1,000 random boxes, plus
 * clamping, big boxes, duplicates, capacity and misuse.
 */
import { describe, expect, it } from 'vitest';
import {
  COLLISION_MASKS,
  CollisionLayer,
  DEFAULT_GRID_CAPACITY,
  DEFAULT_GRID_CELL_SIZE,
  aabbAabb,
  capsuleCircle,
  circleAabb,
  circleCircle,
  createSpatialGrid,
  layersInteract,
  moduleInfo,
  pointSegmentDistanceSq,
  segmentAabb,
} from '../../src/collision/index.js';
import { createRng } from '../../src/rng/index.js';

describe('core/collision shapes', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('collision');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('circleCircle: overlap, exact edge contact, apart', () => {
    expect(circleCircle(0, 0, 2, 1, 1, 1)).toBe(true);
    expect(circleCircle(0, 0, 1, 3, 0, 2)).toBe(true); // touching
    expect(circleCircle(0, 0, 3, 3, 4, 2)).toBe(true); // distance 5 = 3 + 2
    expect(circleCircle(0, 0, 3, 3, 4, 1.999)).toBe(false);
    expect(circleCircle(5, 5, 0, 5, 5, 0)).toBe(true); // two points on the same spot
    expect(circleCircle(0, 0, 1, 3, 0, 1.5)).toBe(false);
  });

  it('aabbAabb: overlap, shared edge, shared corner, apart, containment', () => {
    expect(aabbAabb(0, 0, 2, 2, 3, 0, 2, 2)).toBe(true);
    expect(aabbAabb(0, 0, 2, 2, 4, 0, 2, 2)).toBe(true); // shared edge x = 2
    expect(aabbAabb(0, 0, 2, 2, 4, 4, 2, 2)).toBe(true); // shared corner
    expect(aabbAabb(0, 0, 2, 2, 4.001, 0, 2, 2)).toBe(false);
    expect(aabbAabb(0, 0, 2, 2, 0, -4.5, 2, 2)).toBe(false);
    expect(aabbAabb(0, 0, 10, 10, 1, 1, 1, 1)).toBe(true); // contained
  });

  it('circleAabb: face contact, corner contact, inside, apart', () => {
    expect(circleAabb(5, 0, 2, 0, 0, 3, 3)).toBe(true); // touches the right face
    expect(circleAabb(5.01, 0, 2, 0, 0, 3, 3)).toBe(false);
    expect(circleAabb(6, 7, 5, 0, 0, 3, 3)).toBe(true); // corner (3,3): distance 5
    expect(circleAabb(6, 7, 4.99, 0, 0, 3, 3)).toBe(false);
    expect(circleAabb(1, 1, 0.5, 0, 0, 3, 3)).toBe(true); // centre inside
  });

  it('pointSegmentDistanceSq: projection inside, beyond each end, degenerate segment', () => {
    expect(pointSegmentDistanceSq(5, 3, 0, 0, 10, 0)).toBe(9);
    expect(pointSegmentDistanceSq(-3, 4, 0, 0, 10, 0)).toBe(25);
    expect(pointSegmentDistanceSq(13, -4, 0, 0, 10, 0)).toBe(25);
    expect(pointSegmentDistanceSq(3, 4, 0, 0, 0, 0)).toBe(25);
  });

  it('capsuleCircle: along the body, at the rounded caps, edge contact, apart', () => {
    // Horizontal beam from (0,0) to (100,0), half-width 4; player hurt radius 1.5.
    expect(capsuleCircle(0, 0, 100, 0, 4, 50, 5, 1.5)).toBe(true);
    expect(capsuleCircle(0, 0, 100, 0, 4, 50, 5.5, 1.5)).toBe(true); // touching
    expect(capsuleCircle(0, 0, 100, 0, 4, 50, 5.51, 1.5)).toBe(false);
    expect(capsuleCircle(0, 0, 100, 0, 4, 105, 0, 1)).toBe(true); // end cap
    expect(capsuleCircle(0, 0, 100, 0, 4, 103, 4, 1)).toBe(true); // distance 5
    expect(capsuleCircle(0, 0, 100, 0, 4, 104, 4, 1)).toBe(false);
    expect(capsuleCircle(0, 0, 100, 0, 4, -5, 0, 1)).toBe(true); // start cap
    // A diagonal beam.
    expect(capsuleCircle(0, 0, 30, 40, 1, 24, 32, 0)).toBe(true); // on the segment
  });

  it('segmentAabb: crossing, touching an edge, ending inside, parallel, missing', () => {
    expect(segmentAabb(-10, 0, 10, 0, 0, 0, 2, 2)).toBe(true); // crosses
    expect(segmentAabb(-10, 2, 10, 2, 0, 0, 2, 2)).toBe(true); // runs along the top edge
    expect(segmentAabb(-10, 2.01, 10, 2.01, 0, 0, 2, 2)).toBe(false);
    expect(segmentAabb(-10, -10, -2, -2, 0, 0, 2, 2)).toBe(true); // ends at the corner
    expect(segmentAabb(-10, -10, -2.01, -2.01, 0, 0, 2, 2)).toBe(false); // stops short
    expect(segmentAabb(0.5, 0.5, 1, 1, 0, 0, 2, 2)).toBe(true); // fully inside
    expect(segmentAabb(3, -10, 3, 10, 0, 0, 2, 2)).toBe(false); // vertical, beside
    expect(segmentAabb(5, 5, 5, 5, 5, 5, 0, 0)).toBe(true); // point on a point box
    expect(segmentAabb(-10, 5, 10, -5, 0, 0, 1, 1)).toBe(true); // diagonal through
    expect(segmentAabb(-10, 10, 10, 9, 0, 0, 1, 1)).toBe(false);
  });

  it('the shape tests are symmetric', () => {
    const rng = createRng(5);
    for (let i = 0; i < 500; i++) {
      const v = (): number => rng.rangeInt(-40, 40) / 4;
      const r = (): number => rng.rangeInt(0, 20) / 4;
      const [ax, ay, bx, by, ar, br] = [v(), v(), v(), v(), r(), r()];
      expect(circleCircle(ax, ay, ar, bx, by, br)).toBe(circleCircle(bx, by, br, ax, ay, ar));
      expect(aabbAabb(ax, ay, ar, br, bx, by, br, ar)).toBe(
        aabbAabb(bx, by, br, ar, ax, ay, ar, br),
      );
    }
  });

  it('layer masks are symmetric and match the tick plan', () => {
    const layers = Object.values(CollisionLayer);
    for (const a of layers) {
      for (const b of layers) expect(layersInteract(a, b)).toBe(layersInteract(b, a));
    }
    expect(layersInteract(CollisionLayer.PlayerShot, CollisionLayer.Enemy)).toBe(true);
    expect(layersInteract(CollisionLayer.EnemyBullet, CollisionLayer.Player)).toBe(true);
    expect(layersInteract(CollisionLayer.Item, CollisionLayer.Player)).toBe(true);
    expect(layersInteract(CollisionLayer.PlayerShot, CollisionLayer.EnemyBullet)).toBe(false);
    expect(layersInteract(CollisionLayer.Enemy, CollisionLayer.Terrain)).toBe(false);
    expect(Object.keys(COLLISION_MASKS)).toHaveLength(layers.length);
  });
});

describe('core/collision spatial grid', () => {
  /** A random box set in and around a 448×328 area (the playfield + a 32 px border). */
  interface Box {
    id: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }

  /**
   * Random boxes, some partly or fully outside the grid, some large.
   *
   * @param seed - RNG seed.
   * @param count - How many.
   * @returns The boxes (ids 1000 + index).
   */
  const randomBoxes = (seed: number, count: number): Box[] => {
    const rng = createRng(seed);
    const boxes: Box[] = [];
    for (let i = 0; i < count; i++) {
      const x0 = rng.rangeInt(-120, 560) + rng.nextFloat();
      const y0 = rng.rangeInt(-120, 440) + rng.nextFloat();
      const big = rng.nextFloat() < 0.05;
      const w = big ? rng.rangeInt(60, 300) : rng.rangeInt(0, 40) + rng.nextFloat();
      const h = big ? rng.rangeInt(60, 300) : rng.rangeInt(0, 40) + rng.nextFloat();
      boxes.push({ id: 1000 + i, x0, y0, x1: x0 + w, y1: y0 + h });
    }
    return boxes;
  };

  /**
   * Brute-force overlap (closed boxes).
   *
   * @param a - Box.
   * @param b - Box.
   * @returns Whether they overlap or touch.
   */
  const overlaps = (a: Box, b: Box): boolean =>
    a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;

  it('uses 32 px cells and a 256-box capacity by default', () => {
    const grid = createSpatialGrid(448, 328);
    expect([grid.cellSize, grid.capacity, grid.cols, grid.rows]).toEqual([
      DEFAULT_GRID_CELL_SIZE,
      DEFAULT_GRID_CAPACITY,
      14,
      11,
    ]);
  });

  it('queries equal brute force for 1,000 random boxes (property test)', () => {
    for (const seed of [1, 2, 3]) {
      const boxes = randomBoxes(seed, 1000);
      const grid = createSpatialGrid(448, 328, 32, 1000);
      grid.begin(-32, -32);
      for (const b of boxes) expect(grid.insert(b.id, b.x0, b.y0, b.x1, b.y1)).toBe(true);
      grid.build();
      const found: number[] = [];
      const visit = (id: number): void => {
        found.push(id);
      };
      for (const q of randomBoxes(seed + 100, 300)) {
        found.length = 0;
        const visited = grid.query(q.x0, q.y0, q.x1, q.y1, visit);
        const expected = boxes.filter((b) => overlaps(b, q)).map((b) => b.id);
        expect(visited).toBe(found.length);
        expect(new Set(found).size).toBe(found.length); // each id once
        expect([...found].sort((a, b) => a - b)).toEqual(expected);
      }
    }
  });

  it('reports touching boxes and point boxes', () => {
    const grid = createSpatialGrid(128, 128, 32, 8);
    grid.begin(0, 0);
    grid.insert(1, 10, 10, 20, 20);
    grid.insert(2, 64, 64, 64, 64); // a point exactly on a cell corner
    grid.build();
    const found: number[] = [];
    const visit = (id: number): void => {
      found.push(id);
    };
    grid.query(20, 20, 30, 30, visit); // shares the corner (20, 20)
    grid.query(64, 40, 64, 64, visit); // a vertical segment ending on the point
    grid.query(20.001, 0, 40, 9.999, visit); // misses box 1
    expect(found).toEqual([1, 2]);
  });

  it('follows its origin and rebuilds every tick', () => {
    const grid = createSpatialGrid(64, 64, 32, 4);
    const found: number[] = [];
    const visit = (id: number): void => {
      found.push(id);
    };
    grid.begin(1000, 0);
    grid.insert(7, 1010, 10, 1012, 12);
    grid.build();
    grid.query(1000, 0, 1020, 20, visit);
    grid.begin(2000, 0); // next tick: the old box is gone
    grid.build();
    grid.query(1000, 0, 1020, 20, visit);
    expect(found).toEqual([7]);
    expect(grid.count).toBe(0);
  });

  it('drops inserts beyond its capacity and counts them', () => {
    const grid = createSpatialGrid(64, 64, 32, 2);
    grid.begin(0, 0);
    expect(grid.insert(1, 0, 0, 1, 1)).toBe(true);
    expect(grid.insert(2, 0, 0, 1, 1)).toBe(true);
    expect(grid.insert(3, 0, 0, 1, 1)).toBe(false);
    expect([grid.count, grid.dropped]).toEqual([2, 1]);
    grid.build();
    grid.begin(0, 0);
    expect([grid.count, grid.dropped]).toEqual([0, 0]);
  });

  it('refuses to query boxes that were not built yet', () => {
    const grid = createSpatialGrid(64, 64);
    grid.begin(0, 0);
    expect(grid.query(0, 0, 10, 10, () => {})).toBe(0);
    grid.insert(1, 0, 0, 1, 1);
    expect(() => grid.query(0, 0, 10, 10, () => {})).toThrow(/before build/);
  });

  it('validates its sizes', () => {
    expect(() => createSpatialGrid(0, 10)).toThrow(RangeError);
    expect(() => createSpatialGrid(10, 10, 0)).toThrow(RangeError);
    expect(() => createSpatialGrid(10, 10, 32, 0)).toThrow(RangeError);
    expect(() => createSpatialGrid(10, 10, 32, 1.5)).toThrow(RangeError);
  });
});
