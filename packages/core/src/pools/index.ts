/**
 * # pools — zero-GC storage: struct-of-arrays pools and object pools
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Preallocated storage for everything that exists in large numbers. High-count,
 * homogeneous things — enemy bullets (~512), player shots (64), particles (256) — live in
 * **struct-of-arrays typed-array pools** (cache friendly, trivially hashable for replays).
 * Enemies/boss parts (≤ ~100) are pooled class instances (`Pool<T>`). Removal is deferred
 * to the end of the tick (swap-remove) so iteration order stays deterministic. No ECS.
 *
 * **Implements.**
 * - shmup_feat.md §22 — hybrid data layout, zero per-frame allocations, budgets
 * - shmup_tech.md §4.2 — "no ECS": SoA `Float32Array` pools + generic 30-line `Pool<T>`
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'pools',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §22', 'shmup_tech.md §4.2'],
});

/** A struct-of-arrays pool: parallel typed arrays indexed by slot. */
export interface SoaPool {
  /** Maximum live slots. */
  readonly capacity: number;
  /** Live slots, packed in `[0, count)`. */
  readonly count: number;
  /**
   * Reserves a slot.
   *
   * @returns The new slot index, or -1 when the pool is full (the spawn is dropped).
   */
  alloc(): number;
  /**
   * Marks a slot for removal at the next {@link SoaPool.flush}. Removal is deferred so
   * indices stay stable while systems iterate during a tick.
   *
   * @param index - Slot index in `[0, count)`.
   */
  free(index: number): void;
  /** Applies deferred removals (swap-remove). Call once at the end of a tick. */
  flush(): void;
}

/** A pool of reusable objects (pooled enemy instances). */
export interface Pool<T> {
  /** Number of objects preallocated at creation. */
  readonly capacity: number;
  /** Objects currently acquired. */
  readonly inUse: number;
  /**
   * Takes an object from the pool.
   *
   * @returns A reset object, or `null` when exhausted (callers must handle it).
   */
  acquire(): T | null;
  /**
   * Returns an object to the pool.
   *
   * @param item - An object previously returned by {@link Pool.acquire}.
   */
  release(item: T): void;
}

// Planned: createSoaPool({ capacity, fields: { x: Float32Array, y: Float32Array, ... } }),
//          createPool<T>(factory: () => T, capacity: number).
