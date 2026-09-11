/**
 * # collision — collision shapes, broad phase and terrain queries
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** All collision detection. Narrow phase: circle-vs-circle for bullets (squared
 * distances), AABB for enemies/terrain, capsule (point-to-segment) for straight lasers,
 * circle chains for bending lasers. Broad phase: a uniform grid (~32 px cells, rebuilt
 * each tick via counting sort) for player shots × enemies; brute force for enemy bullets ×
 * players. Layer/mask bitfields. Terrain: tilemap collision layer lookups (solid,
 * destructible, hazard), per-tile height masks for slopes and a "find floor" query for
 * crawlers and ground missiles.
 *
 * **Implements.**
 * - shmup_feat.md §22 Collision
 * - shmup_feat.md §5 — separate hurtbox and terrain box
 * - shmup_tech.md §4.5 — custom circle/AABB/capsule + grid + tile masks, no physics engine
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'collision',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §22', 'shmup_feat.md §5', 'shmup_tech.md §4.5'],
});

/** Collision shapes (sizes in pixels, centred on the entity position). */
export type Shape =
  | { readonly kind: 'circle'; readonly r: number }
  | { readonly kind: 'aabb'; readonly hw: number; readonly hh: number }
  | { readonly kind: 'capsule'; readonly length: number; readonly r: number };

/** Uniform-grid broad phase over pool indices. */
export interface SpatialGrid {
  clear(): void;
  insert(index: number, x: number, y: number, hw: number, hh: number): void;
  /** Visits every index whose cell overlaps the box (may repeat; callers dedupe). */
  query(x: number, y: number, hw: number, hh: number, visit: (index: number) => void): void;
}

/** Terrain queries against the stage's collision tilemap. */
export interface TerrainQuery {
  isSolid(x: number, y: number): boolean;
  /** Y of the first floor pixel below `y` within `maxDistance`, or -1. */
  findFloor(x: number, y: number, maxDistance: number): number;
}

// Planned: circleVsCircle, aabbVsAabb, capsuleVsCircle, createSpatialGrid(cellSize = 32), layer masks.
