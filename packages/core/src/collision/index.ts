/**
 * # collision — collision shapes, broad phase and terrain queries
 *
 * **Status: implemented.** The narrow-phase shape tests, the layer bits, the uniform-grid broad
 * phase (plan M1-06), the terrain queries against a stage's tilemap (plan M1-07) and — plan
 * M2-07 — moving blocks inside those queries ({@link TerrainBlocks}) and destructible tiles
 * ({@link DestructibleTerrain}). The bending lasers' circle chains (plan M2-02) are tested inside
 * `core/bullets` (`BulletSystem.collidePlayers`: one squared-distance test per hit node, brute
 * force like the bullets) rather than through a shape of this module.
 *
 * **Responsibility.** All collision detection. Narrow phase: circle-vs-circle for bullets (squared
 * distances), AABB for enemies/terrain, capsule (point-to-segment) for straight lasers, circle
 * chains for bending lasers (in `core/bullets`). Broad phase: a uniform grid (~32 px cells, rebuilt
 * each tick via counting sort) for player shots × enemies; brute force for enemy bullets ×
 * players. Layer/mask bitfields. Terrain: tilemap collision lookups (solid, hazard), per-tile
 * column-height masks for slopes and "find floor / ceiling" queries for crawlers and ground
 * missiles; moving floors / ceilings as AABB blocks every query also sees; destructible tiles
 * with per-cell damage, optional regrowth and the checkpoint rollback.
 *
 * **Moving blocks (M2-07).** A map's optional {@link TerrainMap.blocks} holds up to
 * {@link MAX_TERRAIN_BLOCKS} whole-pixel boxes (`core/stage` moves them every tick): every query
 * — {@link terrainAt}, {@link terrainRectHit}, {@link findFloor}, {@link findCeiling} — treats a
 * block's pixels as terrain of its type, so ships die on them, shots and bullets stop at them and
 * crawlers and ground missiles walk on them with no change to those systems.
 *
 * **Destructible tiles (M2-07).** {@link DestructibleTerrain} keeps the damage of a World's map:
 * tiles with `hp` break after that much damage (shots hit the cell they meet — `core/weapons`), a
 * tile with `regen` heals and grows back after that many ticks (organic walls; not onto a ship's
 * terrain box), {@link DestructibleTerrain.place} adds tiles at run time (the cube rush) and
 * {@link DestructibleTerrain.restore} is the checkpoint rollback to the stage's own tiles. Changed
 * cells go to a small ring the renderer reads (the render contract's `TerrainChanges`).
 *
 * **Shape tests take scalars.** Every test receives plain numbers (`circleCircle(ax, ay, ar, bx,
 * by, br)`) — no `{ x, y }` temporaries, so the per-tick collision phase never allocates. Shapes
 * are **closed**: touching counts as a hit (`distance === r1 + r2`, boxes sharing an edge),
 * which makes every test symmetric and keeps edge cases deterministic. Only IEEE `+ − × ÷`,
 * `Math.abs` / `Math.min` / `Math.max` are used (no square roots — distances are compared
 * squared), so results are bit-identical on every engine.
 *
 * **Terrain is pixel-exact.** A {@link TerrainMap} is the stage's tile grid plus its tileset's
 * per-tile type, anchor and column heights; {@link terrainAt} / {@link terrainSolidAt} test one
 * pixel, {@link boxHitsTerrain} a box (a pixel counts when the box overlaps its interior), and
 * {@link findFloor} / {@link findCeiling} scan a pixel column tile by tile. All of them only read
 * typed arrays and return numbers (`NaN` = nothing found).
 *
 * **Implements.**
 * - shmup_feat.md §22 Collision (circle, AABB, capsule, uniform grid via counting sort, layer
 *   bits, terrain tile lookups with per-tile masks and a find-floor query)
 * - shmup_feat.md §5 — separate hurtbox and terrain box
 * - shmup_feat.md §14 — tile terrain with solid / hazard collision types and slopes
 * - shmup_tech.md §4.5 — custom circle/AABB/capsule + grid + tile masks, no physics engine
 *
 * **Public API.** Shape tests {@link circleCircle}, {@link aabbAabb}, {@link circleAabb},
 * {@link capsuleCircle}, {@link segmentAabb}, {@link pointSegmentDistanceSq}; layers
 * {@link CollisionLayer}, {@link COLLISION_MASKS}, {@link layersInteract}; broad phase
 * {@link createSpatialGrid}, {@link SpatialGrid}, {@link SpatialGridVisitor},
 * {@link DEFAULT_GRID_CELL_SIZE}, {@link DEFAULT_GRID_CAPACITY}; the {@link Shape} union;
 * terrain {@link TerrainMap}, {@link TerrainType}, {@link TerrainAnchor}, {@link terrainAt},
 * {@link terrainSolidAt}, {@link boxHitsTerrain}, {@link terrainRectHit}, {@link findFloor},
 * {@link findCeiling}; M2-07 {@link TerrainBlocks}, {@link MAX_TERRAIN_BLOCKS},
 * {@link DestructibleTerrain}, {@link TerrainHit}, {@link MAX_TERRAIN_DAMAGE},
 * {@link TERRAIN_CHANGE_LOG}, {@link MAX_TERRAIN_KEEP_OUT}.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'collision',
  status: 'implemented',
  specRefs: ['shmup_feat.md §22', 'shmup_feat.md §5', 'shmup_feat.md §14', 'shmup_tech.md §4.5'],
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

/**
 * Collision type of a terrain tile (the code stored in {@link TerrainMap.tileType}). Higher codes
 * win when a box touches several types ({@link boxHitsTerrain}).
 *
 * @remarks
 * The codes are the positions of the content names in `TILE_TYPES` (`core/data`): `empty` tiles
 * are drawn but never collide (decoration), `solid` tiles block and kill the ship, `hazard`
 * tiles kill without being part of a floor (spikes, lava). Append new types, never renumber.
 */
export const TerrainType = {
  /** No collision (an empty cell, or a decorative tile). */
  Empty: 0,
  /** Rock: blocks shots and crawlers, kills the ship (shmup_feat.md §14). */
  Solid: 1,
  /** Kills on touch (spikes, lava). */
  Hazard: 2,
} as const;

/** A {@link TerrainType} code. */
export type TerrainType = (typeof TerrainType)[keyof typeof TerrainType];

/**
 * Which edge of a tile its column heights grow from (the code stored in
 * {@link TerrainMap.tileAnchor}; the positions of `TILE_ANCHORS` in `core/data`).
 */
export const TerrainAnchor = {
  /** Heights are measured up from the tile's bottom edge (floors, floor slopes). */
  Floor: 0,
  /** Heights are measured down from the tile's top edge (ceilings, ceiling slopes). */
  Ceiling: 1,
} as const;

/** A {@link TerrainAnchor} code. */
export type TerrainAnchor = (typeof TerrainAnchor)[keyof typeof TerrainAnchor];

/**
 * A stage's collision tilemap plus the per-tile lookup tables of its tileset — everything the
 * terrain queries read. Built once when a stage starts (`core/stage` `createStageTerrain`); the
 * queries only index these typed arrays.
 *
 * @remarks
 * The map's top-left corner is world (0, 0); cell `(col, row)` covers world pixels
 * `[col·tileSize, (col+1)·tileSize) × [row·tileSize, (row+1)·tileSize)`. Everything outside the
 * map is open space. A tile id `t` (1…255; 0 = empty cell) has the collision type
 * `tileType[t]`, the anchor `tileAnchor[t]` and the column heights
 * `tileMask[t·tileSize + column]` (0 … tileSize pixels, measured from the anchor edge) — a
 * full block is all `tileSize`, a 45° slope `1, 2, … 8` (shmup_feat.md §22 "per-tile
 * height/mask for slopes").
 *
 * Since M2-07 a map may carry **moving blocks** ({@link TerrainMap.blocks}, the stage's moving
 * floors / ceilings): every query treats their pixels like terrain of their type, wherever they
 * are (inside the map or not). A World's map is its own copy, so destructible tiles
 * ({@link DestructibleTerrain}) change `tiles` in place.
 */
export interface TerrainMap {
  /** Tile edge in pixels (8). */
  readonly tileSize: number;
  /** Map width in tiles. */
  readonly cols: number;
  /** Map height in tiles. */
  readonly rows: number;
  /** Tile id per cell, row-major (`tiles[row * cols + col]`); 0 = empty. */
  readonly tiles: Uint8Array;
  /** {@link TerrainType} code per tile id (index 0 = the empty cell). */
  readonly tileType: Uint8Array;
  /** {@link TerrainAnchor} code per tile id. */
  readonly tileAnchor: Uint8Array;
  /** Column heights: `tileMask[tileId * tileSize + column]`, 0 … tileSize. */
  readonly tileMask: Uint8Array;
  /**
   * The moving blocks (M2-07) the queries also test, or `null` / absent for none (a stage without
   * `block` events).
   */
  readonly blocks?: TerrainBlocks | null;
}

// ------------------------------------------------------------------------------ moving blocks

/** Most moving blocks one terrain map holds at a time (plan M2-07: moving floors / ceilings). */
export const MAX_TERRAIN_BLOCKS = 16;

/**
 * The moving blocks of a terrain map (plan M2-07, shmup_feat.md §14 "moving floors / ceilings"):
 * axis-aligned boxes of whole pixels that every terrain query treats as terrain of their
 * {@link TerrainType}. Their owner (`core/stage` `MovingBlockSystem`) moves them once per tick by
 * rewriting the bounds; this class is only the geometry the queries read.
 *
 * @remarks
 * Slots `[0, count)` are scanned (a free slot inside that range has `live` 0); bounds are
 * **inclusive** whole pixels, so a query never boxes a fraction. A class (one hidden class, typed
 * arrays) so the per-pixel tests inline and never allocate.
 *
 * @example
 * ```ts
 * const blocks = new TerrainBlocks(4);
 * blocks.set(0, 100, 150, 131, 157, TerrainType.Solid); // a 32×8 floor slab
 * blocks.typeAt(110, 150); // → TerrainType.Solid
 * ```
 */
export class TerrainBlocks {
  /** Slots. */
  readonly capacity: number;
  /** One past the highest live slot (the scanned range). */
  count = 0;
  /** 1 for a slot in use. */
  readonly live: Uint8Array;
  /** First pixel column (inclusive). */
  readonly x0: Int32Array;
  /** First pixel row (inclusive). */
  readonly y0: Int32Array;
  /** Last pixel column (inclusive). */
  readonly x1: Int32Array;
  /** Last pixel row (inclusive). */
  readonly y1: Int32Array;
  /** {@link TerrainType} code per slot. */
  readonly type: Uint8Array;

  /**
   * Creates the slots (load time).
   *
   * @param capacity - Slots (default {@link MAX_TERRAIN_BLOCKS}).
   */
  constructor(capacity: number = MAX_TERRAIN_BLOCKS) {
    this.capacity = capacity;
    this.live = new Uint8Array(capacity);
    this.x0 = new Int32Array(capacity);
    this.y0 = new Int32Array(capacity);
    this.x1 = new Int32Array(capacity);
    this.y1 = new Int32Array(capacity);
    this.type = new Uint8Array(capacity);
  }

  /**
   * Places (or moves) a block. Never allocates.
   *
   * @param slot - Slot index (`0 … capacity − 1`; out of range does nothing).
   * @param x0 - First pixel column.
   * @param y0 - First pixel row.
   * @param x1 - Last pixel column (inclusive, ≥ `x0`).
   * @param y1 - Last pixel row (inclusive, ≥ `y0`).
   * @param type - {@link TerrainType} code (`Empty` makes the block harmless).
   */
  set(slot: number, x0: number, y0: number, x1: number, y1: number, type: number): void {
    if (!(slot >= 0 && slot < this.capacity)) return;
    this.live[slot] = 1;
    this.x0[slot] = x0;
    this.y0[slot] = y0;
    this.x1[slot] = x1;
    this.y1[slot] = y1;
    this.type[slot] = type;
    if (slot >= this.count) this.count = slot + 1;
  }

  /**
   * Frees a slot (and shrinks the scanned range past trailing free slots).
   *
   * @param slot - Slot index.
   */
  remove(slot: number): void {
    if (!(slot >= 0 && slot < this.capacity)) return;
    this.live[slot] = 0;
    while (this.count > 0 && this.live[this.count - 1] === 0) this.count--;
  }

  /** Frees every slot. */
  clear(): void {
    this.live.fill(0);
    this.count = 0;
  }

  /**
   * The highest {@link TerrainType} of the live blocks covering one pixel.
   *
   * @param px - Pixel column (whole number).
   * @param py - Pixel row (whole number).
   * @returns The type, `Empty` (0) when no block covers it.
   */
  typeAt(px: number, py: number): number {
    let found = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.live[i] === 0) continue;
      if (px < this.x0[i] || px > this.x1[i] || py < this.y0[i] || py > this.y1[i]) continue;
      if (this.type[i] > found) found = this.type[i];
    }
    return found;
  }

  /**
   * The highest {@link TerrainType} of the live blocks overlapping an inclusive pixel rectangle.
   *
   * @param x0 - First pixel column.
   * @param y0 - First pixel row.
   * @param x1 - Last pixel column (inclusive).
   * @param y1 - Last pixel row (inclusive).
   * @returns The type, `Empty` (0) for none.
   */
  rectType(x0: number, y0: number, x1: number, y1: number): number {
    let found = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.live[i] === 0) continue;
      if (x1 < this.x0[i] || x0 > this.x1[i] || y1 < this.y0[i] || y0 > this.y1[i]) continue;
      if (this.type[i] > found) found = this.type[i];
    }
    return found;
  }

  /**
   * The first block row at or below `py` in pixel column `px` (a floor for whatever is above).
   *
   * @param px - Pixel column.
   * @param py - First row scanned.
   * @param end - Last row scanned (inclusive).
   * @returns The row, or `NaN` when no live, non-empty block is there.
   */
  floorIn(px: number, py: number, end: number): number {
    let best = NaN;
    for (let i = 0; i < this.count; i++) {
      if (this.live[i] === 0 || this.type[i] === 0) continue;
      if (px < this.x0[i] || px > this.x1[i] || this.y1[i] < py || this.y0[i] > end) continue;
      const hit = this.y0[i] > py ? this.y0[i] : py;
      if (!(hit >= best)) best = hit;
    }
    return best;
  }

  /**
   * The first block row at or above `py` in pixel column `px` (a ceiling for whatever is below).
   *
   * @param px - Pixel column.
   * @param py - First row scanned (the scan goes up).
   * @param end - Last row scanned (inclusive, ≤ `py`).
   * @returns The row, or `NaN` when no live, non-empty block is there.
   */
  ceilingIn(px: number, py: number, end: number): number {
    let best = NaN;
    for (let i = 0; i < this.count; i++) {
      if (this.live[i] === 0 || this.type[i] === 0) continue;
      if (px < this.x0[i] || px > this.x1[i] || this.y0[i] > py || this.y1[i] < end) continue;
      const hit = this.y1[i] < py ? this.y1[i] : py;
      if (!(hit <= best)) best = hit;
    }
    return best;
  }
}

// ------------------------------------------------------------------------------ queries

/**
 * Collision type of one pixel of the tile grid only (no blocks).
 *
 * @param map - The terrain.
 * @param px - Pixel column (whole number).
 * @param py - Pixel row (whole number).
 * @returns The {@link TerrainType}.
 */
function tileTypeAt(map: TerrainMap, px: number, py: number): number {
  const size = map.tileSize;
  if (!(px >= 0 && py >= 0)) return TerrainType.Empty;
  const col = Math.floor(px / size);
  const row = Math.floor(py / size);
  if (col >= map.cols || row >= map.rows) return TerrainType.Empty;
  const tile = map.tiles[row * map.cols + col];
  if (tile === 0) return TerrainType.Empty;
  const type = map.tileType[tile];
  if (type === TerrainType.Empty) return TerrainType.Empty;
  const height = map.tileMask[tile * size + (px - col * size)];
  const ly = py - row * size;
  const solid = map.tileAnchor[tile] === TerrainAnchor.Ceiling ? ly < height : ly >= size - height;
  return solid ? type : TerrainType.Empty;
}

/**
 * Collision type of one world pixel.
 *
 * @param map - The terrain.
 * @param x - World x in pixels (floored to the pixel column).
 * @param y - World y in pixels (floored to the pixel row).
 * @returns The {@link TerrainType} of the pixel: `Empty` (0) outside the map, in an empty cell,
 *   in a decorative tile or outside the tile's mask; otherwise the tile's type — or a moving
 *   block's (M2-07) when it covers the pixel with a higher type.
 *
 * @example
 * ```ts
 * terrainAt(map, 100, 196); // → TerrainType.Solid when the floor is there
 * ```
 */
export function terrainAt(map: TerrainMap, x: number, y: number): number {
  const px = Math.floor(x);
  const py = Math.floor(y);
  const type = tileTypeAt(map, px, py);
  const blocks = map.blocks;
  if (blocks === undefined || blocks === null || blocks.count === 0) return type;
  if (type === TerrainType.Hazard) return type;
  const block = blocks.typeAt(px, py);
  return block > type ? block : type;
}

/**
 * Whether one world pixel collides (any non-empty {@link TerrainType}, hazards included).
 *
 * @param map - The terrain.
 * @param x - World x in pixels.
 * @param y - World y in pixels.
 * @returns `true` when {@link terrainAt} is not `Empty`.
 *
 * @example
 * ```ts
 * if (terrainSolidAt(map, shot.x, shot.y)) removeShot(shot); // shots die on rock
 * ```
 */
export function terrainSolidAt(map: TerrainMap, x: number, y: number): boolean {
  return terrainAt(map, x, y) !== TerrainType.Empty;
}

/**
 * Whether any column of a tile's mask is solid inside a tile-local pixel rectangle.
 *
 * @param map - The terrain.
 * @param tile - Tile id (non-zero).
 * @param lx0 - First tile-local column.
 * @param ly0 - First tile-local row.
 * @param lx1 - Last tile-local column (inclusive).
 * @param ly1 - Last tile-local row (inclusive).
 * @returns `true` when a solid pixel lies in the rectangle.
 */
function tileRectSolid(
  map: TerrainMap,
  tile: number,
  lx0: number,
  ly0: number,
  lx1: number,
  ly1: number,
): boolean {
  const size = map.tileSize;
  const base = tile * size;
  const ceiling = map.tileAnchor[tile] === TerrainAnchor.Ceiling;
  for (let lx = lx0; lx <= lx1; lx++) {
    const height = map.tileMask[base + lx];
    if (height === 0) continue;
    if (ceiling ? ly0 < height : ly1 >= size - height) return true;
  }
  return false;
}

/**
 * Tests an axis-aligned box (the ship's terrain box, a crawler's feet) against the terrain,
 * pixel-exactly. Never allocates — but see the remarks about fractional arguments.
 *
 * @remarks
 * A pixel counts when the box overlaps its interior: the box `[cx − hw, cx + hw] × [cy − hh,
 * cy + hh]` covers pixel columns `floor(cx − hw) … ceil(cx + hw) − 1` (at least one) and the
 * matching rows, so a box resting exactly on a floor surface does not touch it. The work is done
 * by {@link terrainRectHit}; per-tick callers with fractional positions should compute the pixel
 * bounds themselves and call that (whole numbers never box), as the World's collision phase does.
 *
 * @param map - The terrain.
 * @param cx - Box centre x (world pixels).
 * @param cy - Box centre y (world pixels).
 * @param hw - Half width (≥ 0).
 * @param hh - Half height (≥ 0).
 * @returns The highest {@link TerrainType} the box touches (`Hazard` beats `Solid`), or
 *   `Empty` (0) when it touches nothing — usable as a truthy "hit" value.
 *
 * @example
 * ```ts
 * boxHitsTerrain(map, 100.5, 180, 5, 3); // → TerrainType.Solid when the floor is there
 * ```
 */
export function boxHitsTerrain(
  map: TerrainMap,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
): number {
  const x0 = Math.floor(cx - hw);
  const y0 = Math.floor(cy - hh);
  const x1 = Math.ceil(cx + hw) - 1;
  const y1 = Math.ceil(cy + hh) - 1;
  return terrainRectHit(map, x0, y0, x1 < x0 ? x0 : x1, y1 < y0 ? y0 : y1);
}

/**
 * Tests an inclusive rectangle of whole world pixels against the terrain (the core of
 * {@link boxHitsTerrain}). Never allocates.
 *
 * @remarks
 * Only the tiles under the rectangle are visited, and inside them only the covered mask
 * columns; the moving blocks (M2-07) are tested after the tiles. Pass whole numbers (`Math.floor`
 * / `Math.ceil` of fractional positions): V8 boxes a fractional argument of a call it does not
 * inline — a heap allocation per call.
 *
 * @param map - The terrain.
 * @param x0 - First pixel column.
 * @param y0 - First pixel row.
 * @param x1 - Last pixel column (inclusive, ≥ `x0`).
 * @param y1 - Last pixel row (inclusive, ≥ `y0`).
 * @returns The highest {@link TerrainType} in the rectangle, `Empty` (0) for none (also for
 *   NaN bounds and rectangles outside the map and every block).
 *
 * @example
 * ```ts
 * // The pixels a box of half size (hw, hh) at (x, y) covers, as boxHitsTerrain computes them:
 * const x0 = Math.floor(x - hw);
 * const y0 = Math.floor(y - hh);
 * const hit = terrainRectHit(map, x0, y0, Math.max(x0, Math.ceil(x + hw) - 1),
 *   Math.max(y0, Math.ceil(y + hh) - 1));
 * ```
 */
export function terrainRectHit(
  map: TerrainMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const found = tileRectHit(map, x0, y0, x1, y1);
  const blocks = map.blocks;
  if (blocks === undefined || blocks === null || blocks.count === 0) return found;
  if (found === TerrainType.Hazard) return found;
  // Negated so that NaN bounds miss the blocks too.
  if (!(x0 <= x1 && y0 <= y1)) return found;
  const block = blocks.rectType(x0, y0, x1, y1);
  return block > found ? block : found;
}

/**
 * The tile-grid part of {@link terrainRectHit}.
 *
 * @param map - The terrain.
 * @param x0 - First pixel column.
 * @param y0 - First pixel row.
 * @param x1 - Last pixel column (inclusive).
 * @param y1 - Last pixel row (inclusive).
 * @returns The highest tile {@link TerrainType} in the rectangle.
 */
function tileRectHit(map: TerrainMap, x0: number, y0: number, x1: number, y1: number): number {
  const size = map.tileSize;
  const maxX = map.cols * size - 1;
  const maxY = map.rows * size - 1;
  // Negated so that NaN bounds also miss.
  if (!(x1 >= 0 && y1 >= 0 && x0 <= maxX && y0 <= maxY)) return TerrainType.Empty;
  const px0 = x0 < 0 ? 0 : x0;
  const py0 = y0 < 0 ? 0 : y0;
  const px1 = x1 > maxX ? maxX : x1;
  const py1 = y1 > maxY ? maxY : y1;
  const c0 = Math.floor(px0 / size);
  const c1 = Math.floor(px1 / size);
  const r0 = Math.floor(py0 / size);
  const r1 = Math.floor(py1 / size);
  const cols = map.cols;
  let found: number = TerrainType.Empty;
  for (let row = r0; row <= r1; row++) {
    const top = row * size;
    const ly0 = py0 > top ? py0 - top : 0;
    const ly1 = py1 < top + size - 1 ? py1 - top : size - 1;
    for (let col = c0; col <= c1; col++) {
      const tile = map.tiles[row * cols + col];
      if (tile === 0) continue;
      const type = map.tileType[tile];
      if (type <= found) continue;
      const left = col * size;
      const lx0 = px0 > left ? px0 - left : 0;
      const lx1 = px1 < left + size - 1 ? px1 - left : size - 1;
      if (tileRectSolid(map, tile, lx0, ly0, lx1, ly1)) {
        found = type;
        if (found === TerrainType.Hazard) return found;
      }
    }
  }
  return found;
}

/**
 * Finds the floor below a point: scans the pixel column `floor(x)` downwards from row
 * `floor(y)` for the first colliding pixel (crawlers, ground missiles — shmup_feat.md §22).
 * Never allocates.
 *
 * @remarks
 * Rows `floor(y) … floor(y) + floor(maxDist)` are scanned (rows above the map count as open
 * space, the scan stops at the map's bottom). Ceiling tiles count too — their rock is a floor for
 * whatever is below them. Tile by tile, not pixel by pixel; the moving blocks (M2-07) count as
 * floors too (their top row, anywhere in the scanned rows). Pass whole pixels from per-tick code
 * (see {@link terrainRectHit}).
 *
 * @param map - The terrain.
 * @param x - World x in pixels.
 * @param y - Start y in pixels; the search goes down.
 * @param maxDist - Pixels to search (≥ 0): the surface may lie up to `maxDist` below `floor(y)`.
 * @returns The world y of the floor surface (the top edge of the first colliding pixel — equal
 *   to `floor(y)` when the start pixel already collides), or `NaN` when there is none in range.
 *
 * @example
 * ```ts
 * const ground = findFloor(map, crawler.x, crawler.y, 32);
 * if (ground === ground) crawler.y = ground; // not NaN
 * ```
 */
export function findFloor(map: TerrainMap, x: number, y: number, maxDist: number): number {
  const hit = tileFloor(map, x, y, maxDist);
  const blocks = map.blocks;
  if (blocks === undefined || blocks === null || blocks.count === 0 || !(maxDist >= 0)) return hit;
  const py = Math.floor(y);
  const block = blocks.floorIn(Math.floor(x), py, py + Math.floor(maxDist));
  return block < hit || hit !== hit ? block : hit;
}

/**
 * The tile-grid part of {@link findFloor}.
 *
 * @param map - The terrain.
 * @param x - World x.
 * @param y - Start y.
 * @param maxDist - Pixels to search.
 * @returns The surface row, or `NaN`.
 */
function tileFloor(map: TerrainMap, x: number, y: number, maxDist: number): number {
  const size = map.tileSize;
  const px = Math.floor(x);
  if (!(px >= 0 && px < map.cols * size && maxDist >= 0)) return NaN;
  let py = Math.floor(y);
  let end = py + Math.floor(maxDist);
  const maxY = map.rows * size - 1;
  if (end > maxY) end = maxY;
  if (py < 0) py = 0;
  const col = Math.floor(px / size);
  const lx = px - col * size;
  while (py <= end) {
    const row = Math.floor(py / size);
    const top = row * size;
    const tile = map.tiles[row * map.cols + col];
    if (tile !== 0 && map.tileType[tile] !== TerrainType.Empty) {
      const height = map.tileMask[tile * size + lx];
      if (height > 0) {
        if (map.tileAnchor[tile] === TerrainAnchor.Ceiling) {
          if (py - top < height) return py;
        } else {
          const surface = top + size - height;
          const hit = py > surface ? py : surface;
          if (hit <= end) return hit;
        }
      }
    }
    py = top + size;
  }
  return NaN;
}

/**
 * Finds the ceiling above a point: scans the pixel column `floor(x)` upwards from row
 * `floor(y)` for the first colliding pixel (ceiling crawlers, hanging turrets). Never allocates.
 *
 * @remarks
 * Rows `floor(y) … floor(y) − floor(maxDist) − 1` are scanned, so the surface (a row's bottom
 * edge) lies at most `maxDist` above `floor(y)` — the mirror of {@link findFloor} (rows below the
 * map count as open space, the scan stops at the map's top). Floor tiles count too, and so do the
 * moving blocks (M2-07, their bottom row). Tile by tile. Pass whole pixels from per-tick code (see
 * {@link terrainRectHit}).
 *
 * @param map - The terrain.
 * @param x - World x in pixels.
 * @param y - Start y in pixels; the search goes up.
 * @param maxDist - Pixels to search (≥ 0): the surface may lie up to `maxDist` above `floor(y)`.
 * @returns The world y of the ceiling surface (the bottom edge of the first colliding pixel,
 *   i.e. its row + 1 — `floor(y) + 1` when the start pixel already collides), or `NaN` when there
 *   is none in range.
 *
 * @example
 * ```ts
 * const roof = findCeiling(map, turret.x, turret.y, 48);
 * if (roof === roof) turret.y = roof; // hang from it (not NaN)
 * ```
 */
export function findCeiling(map: TerrainMap, x: number, y: number, maxDist: number): number {
  const hit = tileCeiling(map, x, y, maxDist);
  const blocks = map.blocks;
  if (blocks === undefined || blocks === null || blocks.count === 0 || !(maxDist >= 0)) return hit;
  const py = Math.floor(y);
  const row = blocks.ceilingIn(Math.floor(x), py, py - Math.floor(maxDist) - 1);
  if (row !== row) return hit;
  const block = row + 1;
  return block > hit || hit !== hit ? block : hit;
}

/**
 * The tile-grid part of {@link findCeiling}.
 *
 * @param map - The terrain.
 * @param x - World x.
 * @param y - Start y.
 * @param maxDist - Pixels to search.
 * @returns The surface (row + 1), or `NaN`.
 */
function tileCeiling(map: TerrainMap, x: number, y: number, maxDist: number): number {
  const size = map.tileSize;
  const px = Math.floor(x);
  if (!(px >= 0 && px < map.cols * size && maxDist >= 0)) return NaN;
  let py = Math.floor(y);
  let end = py - Math.floor(maxDist) - 1;
  if (end < 0) end = 0;
  const maxY = map.rows * size - 1;
  if (py > maxY) py = maxY;
  const col = Math.floor(px / size);
  const lx = px - col * size;
  while (py >= end) {
    const row = Math.floor(py / size);
    const top = row * size;
    const tile = map.tiles[row * map.cols + col];
    if (tile !== 0 && map.tileType[tile] !== TerrainType.Empty) {
      const height = map.tileMask[tile * size + lx];
      if (height > 0) {
        if (map.tileAnchor[tile] === TerrainAnchor.Ceiling) {
          const bottom = top + height - 1;
          const hit = py < bottom ? py : bottom;
          if (hit >= end) return hit + 1;
        } else if (py - top >= size - height) {
          return py + 1;
        }
      }
    }
    py = top - 1;
  }
  return NaN;
}

// ------------------------------------------------------------------------------ destructible tiles

/** Cells of damaged or regrowing destructible terrain one map tracks at once (plan M2-07). */
export const MAX_TERRAIN_DAMAGE = 512;

/** Entries of the terrain change log the renderer reads ({@link DestructibleTerrain.cells}). */
export const TERRAIN_CHANGE_LOG = 64;

/** Keep-out rectangles a regrowing cell waits for (one per player ship). */
export const MAX_TERRAIN_KEEP_OUT = 4;

/** What {@link DestructibleTerrain.hit} did. */
export const TerrainHit = {
  /** Nothing: no destructible tile there (rock, empty, a moving block), or no room to track it. */
  None: 0,
  /** The tile took the damage and still stands. */
  Damaged: 1,
  /** The tile broke: its cell is empty now ({@link DestructibleTerrain.lastTile} says which). */
  Destroyed: 2,
} as const;

/** A {@link TerrainHit} code. */
export type TerrainHit = (typeof TerrainHit)[keyof typeof TerrainHit];

/** State of a {@link DestructibleTerrain} entry. */
const EntryState = {
  /** Unused. */
  Free: 0,
  /** A standing tile with damage (heals after its `regen` ticks without a hit, when it has one). */
  Damaged: 1,
  /** A broken regenerating tile waiting to grow back. */
  Regrowing: 2,
} as const;

/**
 * Destructible terrain (plan M2-07, shmup_feat.md §14 "destructible terrain … regenerating
 * walls"): the per-cell damage of a World's {@link TerrainMap}, tile regrowth, tiles placed at run
 * time (the cube rush's stacks) and the rollback to the stage's own tiles.
 *
 * @remarks
 * A tile is destructible when its tileset gives it `hp` (1–255, {@link DestructibleTerrain.tileHp}
 * by tile id); hits add up per cell and a cell whose damage reaches its tile's `hp` becomes empty.
 * A tile with `regen` ticks ({@link DestructibleTerrain.tileRegen}) heals its damage after that
 * many ticks without a hit and grows back that many ticks after breaking — unless a keep-out
 * rectangle (the players' terrain boxes, {@link DestructibleTerrain.setKeepOut}) overlaps the cell;
 * then it waits. Only damaged and regrowing cells take an entry of the fixed table
 * ({@link MAX_TERRAIN_DAMAGE}); a hit on a new cell while the table is full is ignored
 * ({@link TerrainHit.None}) unless it breaks the tile at once (a broken tile without `regen` needs
 * no entry; one with `regen` then does not grow back).
 *
 * {@link DestructibleTerrain.restore} copies the stage's own tiles back and forgets every entry —
 * the checkpoint rollback. Every changed cell is written to a small ring
 * ({@link DestructibleTerrain.cells}, the render contract's `TerrainChanges`) so the renderer
 * re-textures only those; a restore counts as a reset. Deterministic and allocation-free: typed
 * arrays and whole numbers only.
 *
 * @example
 * ```ts
 * const d = new DestructibleTerrain(map, stage.terrain.tiles, tileset.tables.hp, tileset.tables.regen);
 * if (d.hit(px, py, 1) === TerrainHit.Destroyed) score += tileScore[d.lastTile];
 * d.update(); // once per tick: heal / regrow
 * d.restore(); // checkpoint restart: the stage's tiles again
 * ```
 */
export class DestructibleTerrain {
  /** The World's map (its `tiles` change in place). */
  readonly map: TerrainMap;
  /** The stage's own tiles (shared content — never written). */
  readonly pristine: Uint8Array;
  /** Hit points per tile id (0 = indestructible). */
  readonly tileHp: Uint8Array;
  /** Regeneration ticks per tile id (0 = never grows back). */
  readonly tileRegen: Uint16Array;
  /** Whether any tile of the tileset is destructible. */
  readonly any: boolean;
  /** Entry → cell index (`row · cols + col`). */
  readonly entryCell: Int32Array;
  /** Entry → the tile id it tracks. */
  readonly entryTile: Uint8Array;
  /** Entry → damage taken so far. */
  readonly entryDamage: Uint16Array;
  /** Entry → ticks left (heal or regrow; 0 = none). */
  readonly entryTimer: Int32Array;
  /** Entry → state (0 free, 1 damaged, 2 regrowing). */
  readonly entryState: Uint8Array;
  /** One past the highest entry in use (the scanned range). */
  entries = 0;
  /** Cells changed so far (the change log's write count — `TerrainChanges.count`). */
  count = 0;
  /** Whole-map rewrites so far ({@link DestructibleTerrain.restore} — `TerrainChanges.resets`). */
  resets = 0;
  /** Ring of the last {@link TERRAIN_CHANGE_LOG} changed cells (`cells[k % length]`). */
  readonly cells: Int32Array;
  /** Keep-out rectangles, 4 whole-pixel bounds each (`x0, y0, x1, y1`, inclusive). */
  readonly keepOut: Int32Array;
  /** Keep-out rectangles set this tick. */
  keepOutCount = 0;
  /** Cells broken since the last restore. */
  destroyed = 0;
  /** Tile id the last {@link DestructibleTerrain.hit} broke or damaged (0 = none). */
  lastTile = 0;
  /** Cell of the last {@link DestructibleTerrain.hit} that did something (-1 = none). */
  lastCell = -1;

  /**
   * Tracks a map (load time).
   *
   * @param map - The World's own map (a copy — `core/stage` `createStageTerrain`).
   * @param pristine - The stage's tiles (`StageSpec.terrain.tiles`, same size as `map.tiles`).
   * @param tileHp - Hit points per tile id (the tileset tables' `hp`).
   * @param tileRegen - Regeneration ticks per tile id (the tileset tables' `regen`).
   * @param capacity - Tracked cells (default {@link MAX_TERRAIN_DAMAGE}).
   * @throws {RangeError} When `pristine` and `map.tiles` differ in size.
   */
  constructor(
    map: TerrainMap,
    pristine: Uint8Array,
    tileHp: Uint8Array,
    tileRegen: Uint16Array,
    capacity: number = MAX_TERRAIN_DAMAGE,
  ) {
    if (pristine.length !== map.tiles.length) {
      throw new RangeError(
        `pristine tiles (${pristine.length}) do not match the map (${map.tiles.length})`,
      );
    }
    this.map = map;
    this.pristine = pristine;
    this.tileHp = tileHp;
    this.tileRegen = tileRegen;
    let any = false;
    for (let i = 1; i < tileHp.length; i++) if (tileHp[i] > 0) any = true;
    this.any = any;
    this.entryCell = new Int32Array(capacity);
    this.entryTile = new Uint8Array(capacity);
    this.entryDamage = new Uint16Array(capacity);
    this.entryTimer = new Int32Array(capacity);
    this.entryState = new Uint8Array(capacity);
    this.cells = new Int32Array(TERRAIN_CHANGE_LOG);
    this.keepOut = new Int32Array(MAX_TERRAIN_KEEP_OUT * 4);
  }

  /**
   * Damages the destructible tile under one pixel. Never allocates.
   *
   * @remarks
   * The pixel's **cell** is hit (callers pass the pixel where a shot met the terrain; a moving
   * block or rock there is no destructible tile — `None`). A hit of `amount` adds to the cell's
   * damage; at the tile's `hp` the cell empties (`Destroyed`, {@link DestructibleTerrain.lastTile}
   * = the tile) and, for a regenerating tile, starts growing back. Amounts are floored to whole
   * points (at least 1 for any positive amount).
   *
   * @param px - Pixel column (whole number).
   * @param py - Pixel row (whole number).
   * @param amount - Damage (> 0).
   * @returns The {@link TerrainHit} code.
   */
  hit(px: number, py: number, amount: number): number {
    if (!this.any || !(amount > 0)) return TerrainHit.None;
    const map = this.map;
    const size = map.tileSize;
    if (!(px >= 0 && py >= 0)) return TerrainHit.None;
    const col = Math.floor(px / size);
    const row = Math.floor(py / size);
    if (col >= map.cols || row >= map.rows) return TerrainHit.None;
    const cell = row * map.cols + col;
    const tile = map.tiles[cell];
    const hp = this.tileHp[tile];
    if (tile === 0 || hp === 0) return TerrainHit.None;
    const points = amount >= 1 ? Math.floor(amount) : 1;
    let entry = this.find(cell, EntryState.Damaged);
    const damage = (entry < 0 ? 0 : this.entryDamage[entry]) + points;
    const regen = this.tileRegen[tile];
    if (damage >= hp) {
      map.tiles[cell] = 0;
      this.log(cell);
      this.destroyed++;
      this.lastTile = tile;
      this.lastCell = cell;
      if (regen > 0) {
        if (entry < 0) entry = this.alloc();
        if (entry >= 0) {
          this.entryState[entry] = EntryState.Regrowing;
          this.entryCell[entry] = cell;
          this.entryTile[entry] = tile;
          this.entryDamage[entry] = 0;
          this.entryTimer[entry] = regen;
        }
      } else if (entry >= 0) {
        this.free(entry);
      }
      return TerrainHit.Destroyed;
    }
    if (entry < 0) entry = this.alloc();
    if (entry < 0) return TerrainHit.None;
    this.entryState[entry] = EntryState.Damaged;
    this.entryCell[entry] = cell;
    this.entryTile[entry] = tile;
    this.entryDamage[entry] = damage;
    this.entryTimer[entry] = regen;
    this.lastTile = tile;
    this.lastCell = cell;
    return TerrainHit.Damaged;
  }

  /**
   * Puts a tile into an empty cell (the cube rush stacking into walls — `core/behaviors`
   * `cube.stack`). Never allocates.
   *
   * @remarks
   * Only an empty cell (tile 0) of the map takes it, and never one a keep-out rectangle overlaps
   * (a ship there would be buried). A regrowing entry of that cell is dropped (the new tile wins).
   * The rollback ({@link DestructibleTerrain.restore}) removes placed tiles again.
   *
   * @param col - Tile column.
   * @param row - Tile row.
   * @param tile - Tile id (1 … the tileset's last id).
   * @returns `true` when the tile was placed.
   */
  place(col: number, row: number, tile: number): boolean {
    const map = this.map;
    if (!(col >= 0 && row >= 0 && col < map.cols && row < map.rows)) return false;
    if (!(tile >= 1 && tile < map.tileType.length && tile % 1 === 0)) return false;
    const cell = row * map.cols + col;
    if (map.tiles[cell] !== 0 || this.keptOut(cell)) return false;
    const entry = this.find(cell, EntryState.Regrowing);
    if (entry >= 0) this.free(entry);
    map.tiles[cell] = tile;
    this.log(cell);
    return true;
  }

  /**
   * Advances the heal / regrow timers by one tick (tick phase 3). Never allocates.
   *
   * @returns Cells that grew back this tick.
   */
  update(): number {
    let grown = 0;
    const map = this.map;
    for (let i = 0; i < this.entries; i++) {
      const state = this.entryState[i];
      if (state === EntryState.Free) continue;
      const timer = this.entryTimer[i];
      if (state === EntryState.Damaged) {
        if (timer <= 0) continue; // no regeneration: the damage stays
        if (timer === 1) this.free(i);
        else this.entryTimer[i] = timer - 1;
        continue;
      }
      if (timer > 1) {
        this.entryTimer[i] = timer - 1;
        continue;
      }
      const cell = this.entryCell[i];
      if (map.tiles[cell] !== 0) {
        this.free(i); // something else filled it
        continue;
      }
      if (this.keptOut(cell)) {
        this.entryTimer[i] = 1; // a ship is in the way: try again next tick
        continue;
      }
      map.tiles[cell] = this.entryTile[i];
      this.log(cell);
      this.free(i);
      grown++;
    }
    return grown;
  }

  /**
   * The checkpoint rollback: the stage's own tiles again (broken ones back, placed ones gone),
   * no damage, no regrowth; a reset for the renderer. Cold path (copies the whole grid).
   */
  restore(): void {
    this.map.tiles.set(this.pristine);
    this.entryState.fill(0);
    this.entries = 0;
    this.destroyed = 0;
    this.lastTile = 0;
    this.lastCell = -1;
    this.resets++;
  }

  /** Forgets the keep-out rectangles (the World sets them again every tick). */
  clearKeepOut(): void {
    this.keepOutCount = 0;
  }

  /**
   * Adds a keep-out rectangle for this tick: cells overlapping it neither grow back nor take placed
   * tiles. Ignored beyond {@link MAX_TERRAIN_KEEP_OUT}.
   *
   * @param x0 - First pixel column.
   * @param y0 - First pixel row.
   * @param x1 - Last pixel column (inclusive).
   * @param y1 - Last pixel row (inclusive).
   */
  addKeepOut(x0: number, y0: number, x1: number, y1: number): void {
    const k = this.keepOutCount;
    if (k >= MAX_TERRAIN_KEEP_OUT) return;
    const r = this.keepOut;
    r[k * 4] = x0;
    r[k * 4 + 1] = y0;
    r[k * 4 + 2] = x1;
    r[k * 4 + 3] = y1;
    this.keepOutCount = k + 1;
  }

  /**
   * Damage taken so far by a cell (0 when untracked or broken).
   *
   * @param col - Tile column.
   * @param row - Tile row.
   * @returns Damage points.
   */
  damageAt(col: number, row: number): number {
    const entry = this.find(row * this.map.cols + col, EntryState.Damaged);
    return entry < 0 ? 0 : this.entryDamage[entry];
  }

  /**
   * Whether a keep-out rectangle overlaps a cell.
   *
   * @param cell - Cell index.
   * @returns `true` when one does.
   */
  private keptOut(cell: number): boolean {
    const map = this.map;
    const size = map.tileSize;
    const col = cell % map.cols;
    const row = (cell - col) / map.cols;
    const cx0 = col * size;
    const cy0 = row * size;
    const cx1 = cx0 + size - 1;
    const cy1 = cy0 + size - 1;
    const r = this.keepOut;
    for (let k = 0; k < this.keepOutCount; k++) {
      if (r[k * 4 + 2] < cx0 || r[k * 4] > cx1 || r[k * 4 + 3] < cy0 || r[k * 4 + 1] > cy1) {
        continue;
      }
      return true;
    }
    return false;
  }

  /**
   * The entry of a cell in one state.
   *
   * @param cell - Cell index.
   * @param state - Entry state.
   * @returns The entry, or -1.
   */
  private find(cell: number, state: number): number {
    for (let i = 0; i < this.entries; i++) {
      if (this.entryState[i] === state && this.entryCell[i] === cell) return i;
    }
    return -1;
  }

  /**
   * The lowest free entry (the scanned range grows as needed).
   *
   * @returns The entry, or -1 when the table is full.
   */
  private alloc(): number {
    const capacity = this.entryState.length;
    for (let i = 0; i < capacity; i++) {
      if (this.entryState[i] !== EntryState.Free) continue;
      if (i >= this.entries) this.entries = i + 1;
      this.entryDamage[i] = 0;
      this.entryTimer[i] = 0;
      return i;
    }
    return -1;
  }

  /**
   * Frees an entry (and shrinks the scanned range past trailing free entries).
   *
   * @param entry - The entry.
   */
  private free(entry: number): void {
    this.entryState[entry] = EntryState.Free;
    while (this.entries > 0 && this.entryState[this.entries - 1] === EntryState.Free) {
      this.entries--;
    }
  }

  /**
   * Records a changed cell in the ring.
   *
   * @param cell - Cell index.
   */
  private log(cell: number): void {
    const cells = this.cells;
    cells[this.count % cells.length] = cell;
    this.count++;
  }
}
