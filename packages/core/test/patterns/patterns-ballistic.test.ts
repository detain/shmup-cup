/**
 * The `Ballistic` mover (plan M2-07, `core/patterns`): starting velocity, gravity with a fall cap,
 * the proximity trigger of falling rocks, and the landing rules (`Pass` through terrain, `Stop` /
 * `Shatter` just before it) — exact and allocation-free.
 */
import { describe, expect, it } from 'vitest';
import { TerrainAnchor, TerrainType, type TerrainMap } from '../../src/collision/index.js';
import {
  BALLISTIC_ARMED,
  BALLISTIC_FLYING,
  BALLISTIC_LANDED,
  BallisticLand,
  BodyAnchor,
  MoverKind,
  createMoverContext,
  setMover,
  updateMover,
  type MoverBody,
  type MoverContext,
} from '../../src/patterns/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/**
 * A body at rest (a 4 × 4 box).
 *
 * @param x - World x.
 * @param y - World y.
 * @returns The body.
 */
function body(x = 0, y = 0): MoverBody {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    hw: 2,
    hh: 2,
    anchor: BodyAnchor.Floor,
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

/**
 * A 16 × 16 map (8-px tiles, 128 × 128 px) whose bottom two rows are solid.
 *
 * @returns The map.
 */
function floorMap(): TerrainMap {
  const cols = 16;
  const rows = 16;
  const tiles = new Uint8Array(cols * rows);
  tiles.fill(1, 14 * cols);
  const mask = new Uint8Array(2 * 8);
  mask.fill(8, 8);
  return {
    tileSize: 8,
    cols,
    rows,
    tiles,
    tileType: Uint8Array.from([TerrainType.Empty, TerrainType.Solid]),
    tileAnchor: Uint8Array.from([TerrainAnchor.Floor, TerrainAnchor.Floor]),
    tileMask: mask,
  };
}

/**
 * A mover context with a static camera.
 *
 * @param terrain - The map, or `null`.
 * @returns The context.
 */
function context(terrain: TerrainMap | null = null): MoverContext {
  return createMoverContext({ x: 0, y: 0 }, terrain, []);
}

describe('core/patterns Ballistic mover', () => {
  it('starts at its velocity and adds gravity every tick, capped at maxFall', () => {
    const b = body(10, 10);
    const ctx = context();
    setMover(b, ctx, MoverKind.Ballistic, 1, -2, 0.5, 1.5, 0, BallisticLand.Pass);
    expect([b.s0, b.s1, b.s2, b.vx, b.vy]).toEqual([BALLISTIC_FLYING, 1, -2, 0, 0]);
    const ys: number[] = [];
    const vys: number[] = [];
    for (let i = 0; i < 7; i++) {
      updateMover(b, ctx);
      ys.push(b.y);
      vys.push(b.vy);
    }
    expect(vys).toEqual([-1.5, -1, -0.5, 0, 0.5, 1, 1.5]);
    expect(ys).toEqual([8.5, 7.5, 7, 7, 7.5, 8.5, 10]);
    updateMover(b, ctx);
    expect(b.vy).toBe(1.5); // the cap
    expect(b.x).toBe(18);
    // maxFall 0 means no cap.
    const free = body();
    setMover(free, ctx, MoverKind.Ballistic, 0, 0, 1, 0, 0, BallisticLand.Pass);
    for (let i = 0; i < 10; i++) updateMover(free, ctx);
    expect(free.vy).toBe(10);
  });

  it('waits, still, for the target to come within `trigger` px horizontally', () => {
    const b = body(100, 10);
    const ctx = context();
    setMover(b, ctx, MoverKind.Ballistic, 0, 0, 0.25, 0, 30, BallisticLand.Pass);
    expect(b.s0).toBe(BALLISTIC_ARMED);
    for (let i = 0; i < 5; i++) updateMover(b, ctx); // no target at all
    ctx.hasTarget = true;
    ctx.targetX = 60; // 40 px away
    ctx.targetY = 200;
    for (let i = 0; i < 5; i++) updateMover(b, ctx);
    expect([b.x, b.y, b.vx, b.vy, b.s0]).toEqual([100, 10, 0, 0, BALLISTIC_ARMED]);
    ctx.targetX = 130; // 30 px the other side: within reach
    updateMover(b, ctx);
    expect(b.s0).toBe(BALLISTIC_FLYING);
    expect([b.vy, b.y]).toEqual([0.25, 10.25]);
    ctx.hasTarget = false; // once falling it falls on
    updateMover(b, ctx);
    expect(b.y).toBe(10.75);
  });

  it('stops just before its box would enter terrain (Stop and Shatter), and stays', () => {
    const map = floorMap(); // rock from y 112
    for (const land of [BallisticLand.Stop, BallisticLand.Shatter]) {
      const b = body(40, 100);
      const ctx = context(map);
      setMover(b, ctx, MoverKind.Ballistic, 0, 3, 0, 0, 0, land);
      const ys: number[] = [];
      for (let i = 0; i < 5; i++) {
        updateMover(b, ctx);
        ys.push(b.y);
      }
      // 103, 106, 109: the box's bottom row is y + 2 − 1 → at 109 it spans rows 107…110; the next
      // step (112) would reach row 113 — rock.
      expect(ys).toEqual([103, 106, 109, 109, 109]);
      expect([b.s0, b.vx, b.vy]).toEqual([BALLISTIC_LANDED, 0, 0]);
    }
  });

  it('flies through terrain with Pass, and never lands without a map', () => {
    const map = floorMap();
    const through = body(40, 100);
    const ctx = context(map);
    setMover(through, ctx, MoverKind.Ballistic, 0, 3, 0, 0, 0, BallisticLand.Pass);
    for (let i = 0; i < 10; i++) updateMover(through, ctx);
    expect([through.y, through.s0]).toEqual([130, BALLISTIC_FLYING]);
    const open = body(40, 100);
    const none = context(null);
    setMover(open, none, MoverKind.Ballistic, 0, 3, 0, 0, 0, BallisticLand.Stop);
    for (let i = 0; i < 10; i++) updateMover(open, none);
    expect([open.y, open.s0]).toEqual([130, BALLISTIC_FLYING]);
  });

  it('never touches terrain with a non-finite position (it just flies on)', () => {
    const map = floorMap();
    const b = body(Number.NaN, 100);
    const ctx = context(map);
    setMover(b, ctx, MoverKind.Ballistic, 0, 3, 0, 0, 0, BallisticLand.Stop);
    updateMover(b, ctx);
    expect(b.s0).toBe(BALLISTIC_FLYING);
  });

  it('moves without allocating', () => {
    const map = floorMap();
    const ctx = context(map);
    ctx.hasTarget = true;
    ctx.targetX = 50;
    const bodies = [body(20, 10), body(60, 20), body(90, 5)];
    let k = 0;
    // A cheap loop, so a long warm-up (the helper's rule): with the default 1,000 calls the
    // measured windows could still run before V8's background compile landed — 0.1–4 MB when
    // the CPU was busy, where the optimised loop measures a few KB.
    const growth = measureHeapGrowth(
      () => {
        for (const b of bodies) {
          if (b.s0 === BALLISTIC_LANDED || k % 200 === 0) {
            b.y = 10 + (k % 7);
            setMover(b, ctx, MoverKind.Ballistic, 0.5, -1.25, 0.15, 3.5, 40, BallisticLand.Stop);
          }
          updateMover(b, ctx);
        }
        k++;
      },
      20_000,
      20_000,
    );
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
