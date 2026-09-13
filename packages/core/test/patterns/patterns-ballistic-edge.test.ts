/**
 * Edge cases of the `Ballistic` mover (plan M2-07, `core/patterns`), beyond
 * `patterns-ballistic.test.ts`: its content name and code, the proximity trigger at exactly its
 * reach (and a target right above), rising bodies (negative gravity, upward throws) landing under
 * a ceiling, a sideways throw landing against a wall, hazards and moving blocks stopping it, a
 * zero-size box, fractional box edges, and a fresh `setMover` flying a landed body again.
 */
import { describe, expect, it } from 'vitest';
import {
  TerrainAnchor,
  TerrainBlocks,
  TerrainType,
  type TerrainMap,
} from '../../src/collision/index.js';
import {
  BALLISTIC_ARMED,
  BALLISTIC_FLYING,
  BALLISTIC_LANDED,
  BallisticLand,
  BodyAnchor,
  MOVER_NAMES,
  MoverKind,
  createMoverContext,
  moverKindOf,
  setMover,
  updateMover,
  type MoverBody,
  type MoverContext,
} from '../../src/patterns/index.js';

/**
 * A body at rest.
 *
 * @param x - World x.
 * @param y - World y.
 * @param hw - Half width.
 * @param hh - Half height.
 * @returns The body.
 */
function body(x: number, y: number, hw = 2, hh = 2): MoverBody {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    hw,
    hh,
    anchor: BodyAnchor.Air,
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
 * A 16 × 16 map of 8-px tiles (128 × 128 px) from rows: `.` empty, `r` rock, `h` hazard.
 *
 * @param rows - Row strings (16 × 16).
 * @param blocks - Moving blocks, or `null`.
 * @returns The map.
 */
function makeMap(rows: string[], blocks: TerrainBlocks | null = null): TerrainMap {
  const cols = 16;
  const tiles = new Uint8Array(cols * 16);
  rows.forEach((row, r) => {
    for (let c = 0; c < cols; c++)
      tiles[r * cols + c] = row[c] === 'r' ? 1 : row[c] === 'h' ? 2 : 0;
  });
  const mask = new Uint8Array(3 * 8);
  mask.fill(8, 8);
  return {
    tileSize: 8,
    cols,
    rows: 16,
    tiles,
    tileType: Uint8Array.from([TerrainType.Empty, TerrainType.Solid, TerrainType.Hazard]),
    tileAnchor: new Uint8Array(3).fill(TerrainAnchor.Floor),
    tileMask: mask,
    blocks,
  };
}

/** An empty 16 × 16 layout. */
const EMPTY = new Array<string>(16).fill('.'.repeat(16));

/**
 * A layout with some rows replaced.
 *
 * @param rows - Row index → row string.
 * @returns The rows.
 */
function layout(rows: Record<number, string>): string[] {
  return EMPTY.map((row, r) => rows[r] ?? row);
}

/**
 * A mover context with a still camera.
 *
 * @param terrain - The map, or `null`.
 * @returns The context.
 */
function context(terrain: TerrainMap | null): MoverContext {
  return createMoverContext({ x: 0, y: 0 }, terrain, []);
}

/**
 * Steps a body until it lands (or `max` ticks).
 *
 * @param b - The body.
 * @param ctx - The context.
 * @param max - Tick limit.
 * @returns Ticks until it landed (-1 = never).
 */
function untilLanded(b: MoverBody, ctx: MoverContext, max = 200): number {
  for (let t = 1; t <= max; t++) {
    updateMover(b, ctx);
    if (b.s0 === BALLISTIC_LANDED) return t;
  }
  return -1;
}

describe('core/patterns Ballistic — edges', () => {
  it('is the `ballistic` content mover', () => {
    expect(MOVER_NAMES[MoverKind.Ballistic]).toBe('ballistic');
    expect(moverKindOf('ballistic')).toBe(MoverKind.Ballistic);
  });

  it('triggers at exactly its reach, and for a target straight above or below', () => {
    const ctx = context(null);
    ctx.hasTarget = true;
    for (const [tx, fires] of [
      [70, true], // 30 px left: exactly the reach
      [69.99, false],
      [130, true],
      [130.01, false],
      [100, true], // right above / below
    ] as const) {
      const b = body(100, 10);
      setMover(b, ctx, MoverKind.Ballistic, 0, 0, 0.5, 0, 30, BallisticLand.Pass);
      ctx.targetX = tx;
      ctx.targetY = -500;
      updateMover(b, ctx);
      expect(b.s0 === BALLISTIC_FLYING, String(tx)).toBe(fires);
    }
    // A NaN target position never triggers.
    const b = body(100, 10);
    setMover(b, ctx, MoverKind.Ballistic, 0, 0, 0.5, 0, 30, BallisticLand.Pass);
    ctx.targetX = Number.NaN;
    updateMover(b, ctx);
    expect(b.s0).toBe(BALLISTIC_ARMED);
  });

  it('rises with negative gravity and lands under a ceiling', () => {
    const ctx = context(makeMap(layout({ 0: 'r'.repeat(16), 1: 'r'.repeat(16) }))); // rock to y 15
    const b = body(40, 60);
    setMover(b, ctx, MoverKind.Ballistic, 0, 0, -0.5, 0, 0, BallisticLand.Stop);
    const ticks = untilLanded(b, ctx);
    expect(ticks).toBeGreaterThan(0);
    // Its top row (y − 2) stays below the rock's last row (15).
    expect(b.y - 2).toBeGreaterThanOrEqual(16);
    expect(b.y - 2).toBeLessThan(16 + 8);
    expect([b.vx, b.vy]).toEqual([0, 0]);
  });

  it('lands a sideways throw against a wall, and stays there', () => {
    const rows: Record<number, string> = {};
    for (let r = 0; r < 16; r++) rows[r] = '..........rr....'; // a wall at x 80 … 95
    const ctx = context(makeMap(layout(rows)));
    const b = body(20, 60, 3, 3);
    setMover(b, ctx, MoverKind.Ballistic, 4, 0, 0, 0, 0, BallisticLand.Stop);
    // At x 76 its right column is 78; the next step (80, column 82) would enter the wall.
    expect(untilLanded(b, ctx)).toBe(15);
    expect(b.x).toBe(76);
    for (let i = 0; i < 5; i++) updateMover(b, ctx);
    expect([b.x, b.y, b.s0]).toEqual([76, 60, BALLISTIC_LANDED]);
  });

  it('is stopped by hazard tiles and by moving blocks like by rock', () => {
    const hazard = context(makeMap(layout({ 10: 'h'.repeat(16) }))); // y 80 … 87
    const a = body(40, 40);
    setMover(a, hazard, MoverKind.Ballistic, 0, 2, 0, 0, 0, BallisticLand.Shatter);
    expect(untilLanded(a, hazard)).toBeGreaterThan(0);
    expect(a.y + 2 - 1).toBeLessThan(80);
    const blocks = new TerrainBlocks(2);
    const withBlock = context(makeMap(EMPTY, blocks));
    blocks.set(0, 30, 70, 50, 73, TerrainType.Solid);
    const b = body(40, 40);
    setMover(b, withBlock, MoverKind.Ballistic, 0, 2, 0, 0, 0, BallisticLand.Stop);
    expect(untilLanded(b, withBlock)).toBeGreaterThan(0);
    expect(b.y + 2 - 1).toBeLessThan(70);
    expect(b.y + 2 - 1).toBeGreaterThanOrEqual(68);
    // A body beside the block falls past it (no map rows there: it never lands).
    const c = body(60, 40);
    setMover(c, withBlock, MoverKind.Ballistic, 0, 2, 0, 0, 0, BallisticLand.Stop);
    expect(untilLanded(c, withBlock, 60)).toBe(-1);
  });

  it('tests a zero-size box as its own pixel, and fractional edges by whole pixels', () => {
    const map = makeMap(layout({ 10: 'r'.repeat(16) })); // rock from y 80
    const ctx = context(map);
    const point = body(40, 70, 0, 0);
    setMover(point, ctx, MoverKind.Ballistic, 0, 1, 0, 0, 0, BallisticLand.Stop);
    expect(untilLanded(point, ctx)).toBe(10); // y 79 is the last empty row; 80 is rock
    expect(point.y).toBe(79);
    // hh 1.5: at y 78.2 the box spans rows floor(76.7) … ceil(79.7) − 1 = 76 … 79 (all empty);
    // the next step, 79.2, would reach row 80 — rock.
    const frac = body(40, 77.2, 1.5, 1.5);
    setMover(frac, ctx, MoverKind.Ballistic, 0, 1, 0, 0, 0, BallisticLand.Stop);
    updateMover(frac, ctx);
    expect(frac.s0).toBe(BALLISTIC_FLYING);
    expect(frac.y).toBeCloseTo(78.2, 9);
    updateMover(frac, ctx);
    expect(frac.s0).toBe(BALLISTIC_LANDED);
  });

  it('flies again from a landing after a fresh setMover (its state reset)', () => {
    const ctx = context(makeMap(layout({ 10: 'r'.repeat(16) })));
    const b = body(40, 60);
    setMover(b, ctx, MoverKind.Ballistic, 0, 2, 0, 0, 0, BallisticLand.Stop);
    expect(untilLanded(b, ctx)).toBeGreaterThan(0);
    b.s3 = 1; // the enemy system's "landing handled" mark
    setMover(b, ctx, MoverKind.Ballistic, 0, -3, 0.1, 0, 0, BallisticLand.Stop);
    expect([b.s0, b.s1, b.s2, b.s3]).toEqual([BALLISTIC_FLYING, 0, -3, 0]);
    const y = b.y;
    updateMover(b, ctx);
    expect(b.y).toBeCloseTo(y - 2.9, 9);
    // With a trigger it is armed again instead.
    setMover(b, ctx, MoverKind.Ballistic, 0, 0, 0.1, 0, 10, BallisticLand.Stop);
    expect(b.s0).toBe(BALLISTIC_ARMED);
  });
});
