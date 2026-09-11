/**
 * # collision — collision shapes, broad phase and terrain queries
 *
 * **Status: partial.** The narrow-phase shape tests, the layer bits and the uniform-grid broad
 * phase are implemented (plan M1-06); terrain queries against the stage tilemap arrive with the
 * stage runtime (M1-07).
 *
 * **Responsibility.** All collision detection. Narrow phase: circle-vs-circle for bullets (squared
 * distances), AABB for enemies/terrain, capsule (point-to-segment) for straight lasers,
 * circle chains for bending lasers. Broad phase: a uniform grid (~32 px cells, rebuilt
 * each tick via counting sort) for player shots × enemies; brute force for enemy bullets ×
 * players. Layer/mask bitfields. Terrain: tilemap collision layer lookups (solid,
 * destructible, hazard), per-tile height masks for slopes and a "find floor" query for
 * crawlers and ground missiles.
 *
 * **Shape tests take scalars.** Every test receives plain numbers (`circleCircle(ax, ay, ar, bx,
 * by, br)`) — no `{ x, y }` temporaries, so the per-tick collision phase never allocates. Shapes
 * are **closed**: touching counts as a hit (`distance === r1 + r2`, boxes sharing an edge),
 * which makes every test symmetric and keeps edge cases deterministic. Only IEEE `+ − × ÷`,
 * `Math.abs` / `Math.min` / `Math.max` are used (no square roots — distances are compared
 * squared), so results are bit-identical on every engine.
 *
 * **Implements.**
 * - shmup_feat.md §22 Collision (circle, AABB, capsule, uniform grid via counting sort, layer
 *   bits)
 * - shmup_feat.md §5 — separate hurtbox and terrain box
 * - shmup_tech.md §4.5 — custom circle/AABB/capsule + grid + tile masks, no physics engine
 *
 * **Public API.** Shape tests {@link circleCircle}, {@link aabbAabb}, {@link circleAabb},
 * {@link capsuleCircle}, {@link segmentAabb}, {@link pointSegmentDistanceSq}; layers
 * {@link CollisionLayer}, {@link COLLISION_MASKS}, {@link layersInteract}; broad phase
 * {@link createSpatialGrid}, {@link SpatialGrid}, {@link SpatialGridVisitor},
 * {@link DEFAULT_GRID_CELL_SIZE}, {@link DEFAULT_GRID_CAPACITY}; the {@link Shape} union and
 * the {@link TerrainQuery} contract M1-07 implements.
 *
 * **Planned API.** Terrain queries `terrainSolidAt`, `boxHitsTerrain`, `findFloor`,
 * `findCeiling` (M1-07); circle chains for bending lasers (M2-02).
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'collision',
  status: 'partial',
  specRefs: ['shmup_feat.md §22', 'shmup_feat.md §5', 'shmup_tech.md §4.5'],
});

/** Collision shapes (sizes in pixels, centred on the entity position). */
export type Shape =
  | {
      /** Discriminant: a circle (bullets, player hurtbox). */
      readonly kind: 'circle';
      /** Radius. */
      readonly r: number;
    }
  | {
      /** Discriminant: an axis-aligned box (enemies, terrain box). */
      readonly kind: 'aabb';
      /** Half width. */
      readonly hw: number;
      /** Half height. */
      readonly hh: number;
    }
  | {
      /** Discriminant: a capsule (straight lasers — a segment swept by a circle). */
      readonly kind: 'capsule';
      /** Length of the core segment, starting at the entity position. */
      readonly length: number;
      /** Radius around the segment. */
      readonly r: number;
    };

// ------------------------------------------------------------------------------ layers

/**
 * Collision layer bits (shmup_feat.md §22 "layer/mask bitfields per entity type"). An entity
 * belongs to one layer; {@link COLLISION_MASKS} says which layers each layer is tested against.
 *
 * @remarks
 * Append new layers as new bits; the values are plain numbers so they can live in typed arrays.
 */
export const CollisionLayer = {
  /** Player ship hurtbox (and its terrain / pickup boxes). */
  Player: 1 << 0,
  /** Player shots, lasers and missiles. */
  PlayerShot: 1 << 1,
  /** Enemies and boss parts. */
  Enemy: 1 << 2,
  /** Enemy bullets. */
  EnemyBullet: 1 << 3,
  /** Enemy lasers (capsules). */
  EnemyLaser: 1 << 4,
  /** Capsules and other pickups. */
  Item: 1 << 5,
  /** Tile terrain. */
  Terrain: 1 << 6,
} as const;

/** One {@link CollisionLayer} bit. */
export type CollisionLayer = (typeof CollisionLayer)[keyof typeof CollisionLayer];

/**
 * Which layers each layer collides with (plan §3.2 phase 6: shots × enemies, bullets/lasers ×
 * players, enemies × players, items × players, terrain). Indexed by layer bit.
 *
 * @remarks
 * Symmetric: if `A` lists `B`, `B` lists `A`. Options (M1-10) are not a layer — they are
 * invulnerable and pass through terrain.
 */
export const COLLISION_MASKS: Readonly<Record<CollisionLayer, number>> = Object.freeze({
  [CollisionLayer.Player]:
    CollisionLayer.Enemy |
    CollisionLayer.EnemyBullet |
    CollisionLayer.EnemyLaser |
    CollisionLayer.Item |
    CollisionLayer.Terrain,
  [CollisionLayer.PlayerShot]: CollisionLayer.Enemy | CollisionLayer.Terrain,
  [CollisionLayer.Enemy]: CollisionLayer.Player | CollisionLayer.PlayerShot,
  [CollisionLayer.EnemyBullet]: CollisionLayer.Player | CollisionLayer.Terrain,
  [CollisionLayer.EnemyLaser]: CollisionLayer.Player,
  [CollisionLayer.Item]: CollisionLayer.Player,
  [CollisionLayer.Terrain]:
    CollisionLayer.Player | CollisionLayer.PlayerShot | CollisionLayer.EnemyBullet,
});

/**
 * Whether two layers are tested against each other (see {@link COLLISION_MASKS}).
 *
 * @param a - A layer bit.
 * @param b - Another layer bit.
 * @returns `true` when `a`'s mask contains `b`.
 *
 * @example
 * ```ts
 * layersInteract(CollisionLayer.PlayerShot, CollisionLayer.Enemy); // → true
 * layersInteract(CollisionLayer.PlayerShot, CollisionLayer.EnemyBullet); // → false
 * ```
 */
export function layersInteract(a: CollisionLayer, b: CollisionLayer): boolean {
  return (COLLISION_MASKS[a] & b) !== 0;
}

// ------------------------------------------------------------------------------ shape tests

/**
 * Circle vs circle (bullets vs the player's hurt radius). Squared distances — no square root.
 *
 * @param ax - Centre x of circle A.
 * @param ay - Centre y of circle A.
 * @param ar - Radius of circle A (≥ 0).
 * @param bx - Centre x of circle B.
 * @param by - Centre y of circle B.
 * @param br - Radius of circle B (≥ 0).
 * @returns `true` when the circles overlap or touch.
 *
 * @example
 * ```ts
 * circleCircle(0, 0, 1, 3, 0, 2); // → true (touching)
 * ```
 */
export function circleCircle(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Axis-aligned box vs box, both given by centre and half extents.
 *
 * @param ax - Centre x of box A.
 * @param ay - Centre y of box A.
 * @param ahw - Half width of box A.
 * @param ahh - Half height of box A.
 * @param bx - Centre x of box B.
 * @param by - Centre y of box B.
 * @param bhw - Half width of box B.
 * @param bhh - Half height of box B.
 * @returns `true` when the boxes overlap or share an edge / corner.
 */
export function aabbAabb(
  ax: number,
  ay: number,
  ahw: number,
  ahh: number,
  bx: number,
  by: number,
  bhw: number,
  bhh: number,
): boolean {
  return Math.abs(bx - ax) <= ahw + bhw && Math.abs(by - ay) <= ahh + bhh;
}

/**
 * Circle vs axis-aligned box (a bullet vs an enemy, an item vs the pickup box).
 *
 * @param cx - Circle centre x.
 * @param cy - Circle centre y.
 * @param r - Circle radius (≥ 0).
 * @param bx - Box centre x.
 * @param by - Box centre y.
 * @param hw - Box half width.
 * @param hh - Box half height.
 * @returns `true` when the circle overlaps or touches the box.
 */
export function circleAabb(
  cx: number,
  cy: number,
  r: number,
  bx: number,
  by: number,
  hw: number,
  hh: number,
): boolean {
  // Distance from the circle centre to the closest point of the box, per axis.
  const dx = Math.max(Math.abs(cx - bx) - hw, 0);
  const dy = Math.max(Math.abs(cy - by) - hh, 0);
  return dx * dx + dy * dy <= r * r;
}

/**
 * Squared distance from a point to a segment.
 *
 * @param px - Point x.
 * @param py - Point y.
 * @param x1 - Segment start x.
 * @param y1 - Segment start y.
 * @param x2 - Segment end x.
 * @param y2 - Segment end y.
 * @returns The squared distance (a degenerate segment is treated as a point).
 */
export function pointSegmentDistanceSq(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const sx = x2 - x1;
  const sy = y2 - y1;
  const lengthSq = sx * sx + sy * sy;
  let t = 0;
  if (lengthSq > 0) {
    t = ((px - x1) * sx + (py - y1) * sy) / lengthSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  const dx = px - (x1 + sx * t);
  const dy = py - (y1 + sy * t);
  return dx * dx + dy * dy;
}

/**
 * Capsule (a segment swept by a radius — a straight laser) vs circle.
 *
 * @param x1 - Capsule segment start x.
 * @param y1 - Capsule segment start y.
 * @param x2 - Capsule segment end x.
 * @param y2 - Capsule segment end y.
 * @param capsuleR - Capsule radius (half the beam width).
 * @param cx - Circle centre x.
 * @param cy - Circle centre y.
 * @param r - Circle radius.
 * @returns `true` when they overlap or touch.
 */
export function capsuleCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  capsuleR: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const reach = capsuleR + r;
  return pointSegmentDistanceSq(cx, cy, x1, y1, x2, y2) <= reach * reach;
}

/**
 * Segment vs axis-aligned box (slab test) — fast shots, line-of-sight checks.
 *
 * @param x1 - Segment start x.
 * @param y1 - Segment start y.
 * @param x2 - Segment end x.
 * @param y2 - Segment end y.
 * @param bx - Box centre x.
 * @param by - Box centre y.
 * @param hw - Box half width.
 * @param hh - Box half height.
 * @returns `true` when any point of the segment lies in the (closed) box.
 */
export function segmentAabb(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bx: number,
  by: number,
  hw: number,
  hh: number,
): boolean {
  let tMin = 0;
  let tMax = 1;
  const dx = x2 - x1;
  if (dx === 0) {
    if (x1 < bx - hw || x1 > bx + hw) return false;
  } else {
    let t1 = (bx - hw - x1) / dx;
    let t2 = (bx + hw - x1) / dx;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return false;
  }
  const dy = y2 - y1;
  if (dy === 0) {
    if (y1 < by - hh || y1 > by + hh) return false;
  } else {
    let t1 = (by - hh - y1) / dy;
    let t2 = (by + hh - y1) / dy;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return false;
  }
  return true;
}

// ------------------------------------------------------------------------------ grid

/** Default grid cell edge in pixels (shmup_feat.md §22: ~32 px cells). */
export const DEFAULT_GRID_CELL_SIZE = 32;

/** Default number of boxes a grid holds per tick (64 enemies + boss parts, with headroom). */
export const DEFAULT_GRID_CAPACITY = 256;

/**
 * Called once per matching entry of a {@link SpatialGrid.query}.
 *
 * @remarks
 * Pass a function created once (at system creation), never a fresh closure per query — the
 * per-tick path must not allocate.
 *
 * @param id - The id the entry was inserted with.
 */
export type SpatialGridVisitor = (id: number) => void;

/**
 * Uniform-grid broad phase, rebuilt every tick (shmup_feat.md §22: player shots × enemies).
 *
 * @remarks
 * Per tick: {@link SpatialGrid.begin} (sets the origin, drops last tick's boxes) → any number of
 * {@link SpatialGrid.insert} → {@link SpatialGrid.build} (counting sort: count per cell →
 * prefix sum → fill, all in preallocated `Int32Array`s) → any number of
 * {@link SpatialGrid.query}. Boxes outside the covered area are clamped into the border cells,
 * so nothing is ever lost — far-away boxes are just checked a little more often. A box that
 * spans more than 9 cells (3×3) is not written into the cells at all but into an overflow list
 * that every query scans, so the cell storage (`capacity × 9` slots) can never run out. A query
 * visits each entry at most once (a per-query stamp array) and only when the stored box really
 * overlaps the query box (closed boxes, like {@link aabbAabb}), so its result equals a
 * brute-force scan. Nothing allocates after creation.
 */
export interface SpatialGrid {
  /** Cell edge in pixels. */
  readonly cellSize: number;
  /** Cells per row. */
  readonly cols: number;
  /** Cells per column. */
  readonly rows: number;
  /** Maximum boxes per tick. */
  readonly capacity: number;
  /** Boxes inserted since the last {@link SpatialGrid.begin}. */
  readonly count: number;
  /** Inserts rejected because the grid was full, since the last {@link SpatialGrid.begin}. */
  readonly dropped: number;
  /**
   * Starts a new tick: forgets every box and places the grid's top-left corner.
   *
   * @remarks
   * The origin only decides which cell a box lands in — queries compare the stored boxes
   * exactly — so pass whole numbers (`Math.floor(camera.x) - margin`): V8 boxes a fractional
   * argument into a 16-byte heap number whenever the call is not inlined, which would be an
   * allocation per tick while the camera scrolls.
   *
   * @param originX - World x of the covered area's left edge (e.g. `camera.x - margin`).
   * @param originY - World y of the covered area's top edge.
   */
  begin(originX: number, originY: number): void;
  /**
   * Adds a box. Call between {@link SpatialGrid.begin} and {@link SpatialGrid.build}.
   *
   * @param id - Caller's id for the box (e.g. a pool slot); returned to query visitors.
   * @param minX - Left edge (world x).
   * @param minY - Top edge (world y).
   * @param maxX - Right edge (≥ `minX`).
   * @param maxY - Bottom edge (≥ `minY`).
   * @returns `false` when the grid is full (the box is dropped and counted in `dropped`).
   */
  insert(id: number, minX: number, minY: number, maxX: number, maxY: number): boolean;
  /** Sorts the inserted boxes into their cells. Call once after the last insert of a tick. */
  build(): void;
  /**
   * Visits every inserted box that overlaps (or touches) the query box, once each.
   *
   * @param minX - Query left edge.
   * @param minY - Query top edge.
   * @param maxX - Query right edge.
   * @param maxY - Query bottom edge.
   * @param visit - Receives each matching id (in cell order, then insertion order).
   * @returns Number of ids visited.
   * @throws {Error} When called after an insert without {@link SpatialGrid.build}.
   */
  query(minX: number, minY: number, maxX: number, maxY: number, visit: SpatialGridVisitor): number;
}

/**
 * Creates a uniform grid covering `width × height` pixels from its origin.
 *
 * @param width - Covered width in pixels (e.g. the playfield plus a margin).
 * @param height - Covered height in pixels.
 * @param cellSize - Cell edge in pixels (default {@link DEFAULT_GRID_CELL_SIZE}).
 * @param capacity - Maximum boxes per tick (default {@link DEFAULT_GRID_CAPACITY}).
 * @returns The grid; all storage preallocated.
 * @throws {RangeError} When a size is not positive or `capacity` is not a positive integer.
 *
 * @example
 * ```ts
 * const grid = createSpatialGrid(PLAYFIELD_W + 64, PLAYFIELD_H + 64);
 * const onCandidate: SpatialGridVisitor = (id) => { hits[hitCount++] = id; };
 * // every tick:
 * grid.begin(Math.floor(camera.x) - 32, Math.floor(camera.y) - 32);
 * grid.insert(enemySlot, x - hw, y - hh, x + hw, y + hh);
 * grid.build();
 * grid.query(shotX - 2, shotY - 1, shotX + 2, shotY + 1, onCandidate);
 * ```
 */
export function createSpatialGrid(
  width: number,
  height: number,
  cellSize: number = DEFAULT_GRID_CELL_SIZE,
  capacity: number = DEFAULT_GRID_CAPACITY,
): SpatialGrid {
  if (!(width > 0) || !(height > 0) || !(cellSize > 0)) {
    throw new RangeError('spatial grid width, height and cell size must be positive');
  }
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError('spatial grid capacity must be a positive integer');
  }
  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const cells = cols * rows;
  const inv = 1 / cellSize;

  // Entries (one per inserted box).
  const entryId = new Int32Array(capacity);
  const minXs = new Float64Array(capacity);
  const minYs = new Float64Array(capacity);
  const maxXs = new Float64Array(capacity);
  const maxYs = new Float64Array(capacity);
  const col0 = new Int32Array(capacity);
  const row0 = new Int32Array(capacity);
  const col1 = new Int32Array(capacity);
  const row1 = new Int32Array(capacity);
  const stamp = new Uint32Array(capacity);
  // Cells: `cellStart[c] … cellStart[c + 1]` index `cellEntries`.
  const cellStart = new Int32Array(cells + 1);
  const cellFill = new Int32Array(cells);
  // Worst case every box covers every cell; grow lazily only at creation time is not possible
  // without allocation, so size for `capacity` boxes of up to `refsPerBox` cells each and send
  // bigger boxes to the overflow list, which every query scans.
  const refsPerBox = 9;
  const cellEntries = new Int32Array(capacity * refsPerBox);
  const overflow = new Int32Array(capacity);
  let overflowCount = 0;

  let originX = 0;
  let originY = 0;
  let count = 0;
  let dropped = 0;
  let built = true;
  let queryStamp = 0;

  /**
   * Cell column of a world x (clamped to the grid).
   *
   * @param x - World x.
   * @returns Column in `[0, cols)`.
   */
  const colOf = (x: number): number => {
    const c = Math.floor((x - originX) * inv);
    return c < 0 ? 0 : c >= cols ? cols - 1 : c;
  };

  /**
   * Cell row of a world y (clamped to the grid).
   *
   * @param y - World y.
   * @returns Row in `[0, rows)`.
   */
  const rowOf = (y: number): number => {
    const r = Math.floor((y - originY) * inv);
    return r < 0 ? 0 : r >= rows ? rows - 1 : r;
  };

  /**
   * Visits entry `e` if it was not visited by this query yet and overlaps the query box.
   *
   * @param e - Entry index.
   * @param qx0 - Query left.
   * @param qy0 - Query top.
   * @param qx1 - Query right.
   * @param qy1 - Query bottom.
   * @param visit - Visitor.
   * @returns 1 when visited, else 0.
   */
  const consider = (
    e: number,
    qx0: number,
    qy0: number,
    qx1: number,
    qy1: number,
    visit: SpatialGridVisitor,
  ): number => {
    if (stamp[e] === queryStamp) return 0;
    stamp[e] = queryStamp;
    if (minXs[e] > qx1 || maxXs[e] < qx0 || minYs[e] > qy1 || maxYs[e] < qy0) return 0;
    visit(entryId[e]);
    return 1;
  };

  return {
    cellSize,
    cols,
    rows,
    capacity,
    get count(): number {
      return count;
    },
    get dropped(): number {
      return dropped;
    },
    begin(x, y): void {
      originX = x;
      originY = y;
      count = 0;
      dropped = 0;
      overflowCount = 0;
      cellStart.fill(0);
      built = true;
    },
    insert(id, x0, y0, x1, y1): boolean {
      if (count >= capacity) {
        dropped++;
        return false;
      }
      const e = count++;
      built = false;
      entryId[e] = id;
      minXs[e] = x0;
      minYs[e] = y0;
      maxXs[e] = x1;
      maxYs[e] = y1;
      col0[e] = colOf(x0);
      row0[e] = rowOf(y0);
      col1[e] = colOf(x1);
      row1[e] = rowOf(y1);
      return true;
    },
    build(): void {
      // 1. Count per cell (boxes covering more than `refsPerBox` cells go to the overflow list).
      cellStart.fill(0);
      overflowCount = 0;
      for (let e = 0; e < count; e++) {
        const span = (col1[e] - col0[e] + 1) * (row1[e] - row0[e] + 1);
        if (span > refsPerBox) {
          overflow[overflowCount++] = e;
          continue;
        }
        for (let r = row0[e]; r <= row1[e]; r++) {
          for (let c = col0[e]; c <= col1[e]; c++) cellStart[r * cols + c + 1]++;
        }
      }
      // 2. Prefix sum: cellStart[c] = first slot of cell c.
      for (let c = 0; c < cells; c++) {
        cellStart[c + 1] += cellStart[c];
        cellFill[c] = cellStart[c];
      }
      // 3. Fill, in insertion order per cell.
      for (let e = 0; e < count; e++) {
        const span = (col1[e] - col0[e] + 1) * (row1[e] - row0[e] + 1);
        if (span > refsPerBox) continue;
        for (let r = row0[e]; r <= row1[e]; r++) {
          for (let c = col0[e]; c <= col1[e]; c++) cellEntries[cellFill[r * cols + c]++] = e;
        }
      }
      built = true;
    },
    query(x0, y0, x1, y1, visit): number {
      if (!built) throw new Error('SpatialGrid.query() before build()');
      queryStamp = (queryStamp + 1) >>> 0;
      if (queryStamp === 0) {
        // Wrapped after 2^32 queries: clear the stamps so old marks cannot match.
        stamp.fill(0);
        queryStamp = 1;
      }
      let visited = 0;
      const c0 = colOf(x0);
      const c1 = colOf(x1);
      const r0 = rowOf(y0);
      const r1 = rowOf(y1);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const cell = r * cols + c;
          const end = cellStart[cell + 1];
          for (let i = cellStart[cell]; i < end; i++) {
            visited += consider(cellEntries[i], x0, y0, x1, y1, visit);
          }
        }
      }
      for (let i = 0; i < overflowCount; i++) {
        visited += consider(overflow[i], x0, y0, x1, y1, visit);
      }
      return visited;
    },
  };
}

// ------------------------------------------------------------------------------ terrain

/** Terrain queries against the stage's collision tilemap (implemented by M1-07). */
export interface TerrainQuery {
  /**
   * Tests one world pixel against the collision layer.
   *
   * @param x - World x in pixels.
   * @param y - World y in pixels.
   * @returns `true` when the pixel is solid (including destructible tiles still intact).
   */
  isSolid(x: number, y: number): boolean;
  /**
   * Finds the floor below a point (crawlers, ground missiles).
   *
   * @param x - World x in pixels.
   * @param y - Start y in pixels; the search goes downwards.
   * @param maxDistance - Maximum number of pixels to search.
   * @returns Y of the first floor pixel below `y` within `maxDistance`, or -1.
   */
  findFloor(x: number, y: number, maxDistance: number): number;
}
