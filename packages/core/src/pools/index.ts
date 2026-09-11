/**
 * # pools — zero-GC storage: struct-of-arrays pools and object pools
 *
 * **Responsibility.** Preallocated storage for everything that exists in large numbers.
 * High-count, homogeneous things — enemy bullets (~512), player shots (64), particles
 * (256) — live in **struct-of-arrays typed-array pools** ({@link createSoaPool}): cache
 * friendly, trivially hashable for replays, and directly usable as a renderer batch view.
 * Enemies and boss parts (≤ ~100) are pooled class instances ({@link createPool}).
 * Removal is deferred to the end of the tick (swap-remove) so iteration order stays
 * deterministic while systems are running. No ECS (shmup_tech.md §4.2).
 *
 * Neither pool allocates after creation: `alloc`/`free`/`flush` and `acquire`/`release`
 * only move integers around.
 *
 * **Implements.**
 * - shmup_feat.md §22 — hybrid data layout, zero per-frame allocations, budgets
 * - shmup_tech.md §4.2 — "no ECS": SoA typed-array pools + a generic `Pool<T>`
 *
 * **Public API (implemented now).** {@link SoaFieldType}, {@link SoaSchema},
 * {@link SoaArray}, {@link SoaArrayFor}, {@link SoaFields}, {@link SoaPool},
 * {@link createSoaPool}, {@link Pool}, {@link createPool}.
 *
 * **Planned API (later steps).** State hashing of a pool's live slots for golden
 * replays (M1-19).
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'pools',
  status: 'implemented',
  specRefs: ['shmup_feat.md §22', 'shmup_tech.md §4.2'],
});

/** Element type of one struct-of-arrays field, as written in a schema. */
export type SoaFieldType = 'f64' | 'f32' | 'i32' | 'u32' | 'i16' | 'u16' | 'i8' | 'u8';

/** A pool layout: field name → element type, e.g. `{ x: 'f64', sprite: 'u16' }`. */
export type SoaSchema = Readonly<Record<string, SoaFieldType>>;

/** Any typed array a schema field may use. */
export type SoaArray =
  | Float64Array
  | Float32Array
  | Int32Array
  | Uint32Array
  | Int16Array
  | Uint16Array
  | Int8Array
  | Uint8Array;

/** The typed array a {@link SoaFieldType} maps to. */
export type SoaArrayFor<T extends SoaFieldType> = T extends 'f64'
  ? Float64Array
  : T extends 'f32'
    ? Float32Array
    : T extends 'i32'
      ? Int32Array
      : T extends 'u32'
        ? Uint32Array
        : T extends 'i16'
          ? Int16Array
          : T extends 'u16'
            ? Uint16Array
            : T extends 'i8'
              ? Int8Array
              : Uint8Array;

/** The parallel arrays of a pool, one per schema field, each `capacity` long. */
export type SoaFields<S extends SoaSchema> = { readonly [K in keyof S]: SoaArrayFor<S[K]> };

/**
 * A struct-of-arrays pool: parallel typed arrays indexed by slot.
 *
 * @remarks
 * **Slot indices are only stable within a tick.** {@link SoaPool.flush} swap-removes
 * freed slots, which moves the last live entries; anything that must survive a flush
 * (a boss part referencing a bullet, say) has to store its own id, not a slot index.
 */
export interface SoaPool<S extends SoaSchema> {
  /** Maximum live slots. */
  readonly capacity: number;
  /** Live slots, packed in `[0, count)`. */
  readonly count: number;
  /** Slots marked by {@link SoaPool.free} and waiting for the next flush. */
  readonly pendingFreeCount: number;
  /** The parallel data arrays, one per schema field. */
  readonly fields: SoaFields<S>;
  /**
   * Reserves a slot and zero-fills every field of it.
   *
   * @returns The new slot index, or -1 when the pool is full (the spawn is dropped).
   */
  alloc(): number;
  /**
   * Marks a slot for removal at the next {@link SoaPool.flush}. Removal is deferred so
   * indices stay stable while systems iterate during a tick. Freeing the same slot
   * twice in one tick is harmless.
   *
   * @param index - Slot index in `[0, count)`; out-of-range indices are ignored.
   */
  free(index: number): void;
  /**
   * Applies deferred removals (swap-remove, highest index first). Call once at the end
   * of a tick.
   */
  flush(): void;
  /** Empties the pool: no live slots, no pending frees. Field data is left as it was. */
  clear(): void;
}

/**
 * Allocates the typed array for one schema field.
 *
 * @param type - Element type from the schema.
 * @param capacity - Number of slots.
 * @returns A zero-filled typed array of `capacity` elements.
 * @throws {RangeError} If `type` is not a known {@link SoaFieldType}.
 */
function createFieldArray(type: SoaFieldType, capacity: number): SoaArray {
  switch (type) {
    case 'f64':
      return new Float64Array(capacity);
    case 'f32':
      return new Float32Array(capacity);
    case 'i32':
      return new Int32Array(capacity);
    case 'u32':
      return new Uint32Array(capacity);
    case 'i16':
      return new Int16Array(capacity);
    case 'u16':
      return new Uint16Array(capacity);
    case 'i8':
      return new Int8Array(capacity);
    case 'u8':
      return new Uint8Array(capacity);
    default:
      throw new RangeError(`unknown SoA field type "${String(type)}"`);
  }
}

/**
 * Creates a struct-of-arrays pool.
 *
 * @typeParam S - The schema type; `pool.fields` is typed from it.
 * @param capacity - Maximum number of live slots (a positive integer).
 * @param schema - Field name → element type.
 * @returns An empty pool with all its storage preallocated.
 * @throws {RangeError} If `capacity` is not a positive integer or a field type is unknown.
 *
 * @example
 * ```ts
 * const bullets = createSoaPool(512, { x: 'f64', y: 'f64', vx: 'f64', vy: 'f64', sprite: 'u16' });
 * const i = bullets.alloc();
 * if (i >= 0) { bullets.fields.x[i] = px; bullets.fields.y[i] = py; }
 * // … later in the tick
 * bullets.free(i);
 * bullets.flush();
 * ```
 */
export function createSoaPool<S extends SoaSchema>(capacity: number, schema: S): SoaPool<S> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError('SoA pool capacity must be a positive integer');
  }
  const fields: Record<string, SoaArray> = {};
  /** The same arrays as `fields`, in a dense list, for allocation-free iteration. */
  const arrays: SoaArray[] = [];
  // Sorted so the field order (and therefore a future state hash) does not depend on
  // how the schema literal was written.
  const names = Object.keys(schema).sort();
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const array = createFieldArray(schema[name], capacity);
    fields[name] = array;
    arrays.push(array);
  }
  const fieldCount = arrays.length;
  /** 1 when the slot is already marked for removal (deduplicates `free`). */
  const marks = new Uint8Array(capacity);
  /** Slots marked for removal, in `free` order. */
  const pending = new Int32Array(capacity);
  let pendingCount = 0;
  let count = 0;

  /**
   * Copies every field of one slot onto another.
   *
   * @param to - Destination slot.
   * @param from - Source slot.
   */
  const copySlot = (to: number, from: number): void => {
    for (let f = 0; f < fieldCount; f += 1) {
      const array = arrays[f];
      array[to] = array[from];
    }
  };

  return {
    capacity,
    fields: fields as SoaFields<S>,
    get count(): number {
      return count;
    },
    get pendingFreeCount(): number {
      return pendingCount;
    },
    alloc(): number {
      if (count === capacity) return -1;
      const index = count;
      count += 1;
      for (let f = 0; f < fieldCount; f += 1) arrays[f][index] = 0;
      return index;
    },
    free(index: number): void {
      if (index < 0 || index >= count || marks[index] === 1) return;
      marks[index] = 1;
      pending[pendingCount] = index;
      pendingCount += 1;
    },
    flush(): void {
      if (pendingCount === 0) return;
      // Insertion sort, descending: the pending list is short and this never allocates.
      for (let i = 1; i < pendingCount; i += 1) {
        const value = pending[i];
        let j = i - 1;
        while (j >= 0 && pending[j] < value) {
          pending[j + 1] = pending[j];
          j -= 1;
        }
        pending[j + 1] = value;
      }
      for (let i = 0; i < pendingCount; i += 1) {
        const index = pending[i];
        marks[index] = 0;
        count -= 1;
        if (index !== count) copySlot(index, count);
      }
      pendingCount = 0;
    },
    clear(): void {
      for (let i = 0; i < pendingCount; i += 1) marks[pending[i]] = 0;
      pendingCount = 0;
      count = 0;
    },
  };
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
   * @throws {RangeError} If more objects are released than were acquired.
   */
  release(item: T): void;
}

/**
 * Creates an object pool: every instance is built up front, `acquire` only hands one out.
 *
 * @typeParam T - The pooled object type.
 * @param factory - Called `capacity` times at creation; the only place objects are made.
 * @param capacity - How many objects to preallocate (a positive integer).
 * @param reset - Optional initialiser run on every {@link Pool.acquire} — put the object
 *   back into its "fresh" state here rather than in the caller.
 * @returns A full pool.
 * @throws {RangeError} If `capacity` is not a positive integer.
 *
 * @remarks
 * `release` does not check that the object came from this pool; releasing more objects
 * than were acquired is a bug and throws.
 *
 * @example
 * ```ts
 * const enemies = createPool(() => new Enemy(), 64, (e) => e.reset());
 * const enemy = enemies.acquire();
 * if (enemy !== null) spawn(enemy);
 * ```
 */
export function createPool<T>(
  factory: () => T,
  capacity: number,
  reset?: (item: T) => void,
): Pool<T> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError('object pool capacity must be a positive integer');
  }
  /** Free objects, newest first; `free[0 … freeCount)` are available. */
  const free: T[] = new Array<T>(capacity);
  for (let i = 0; i < capacity; i += 1) free[i] = factory();
  let freeCount = capacity;

  return {
    capacity,
    get inUse(): number {
      return capacity - freeCount;
    },
    acquire(): T | null {
      if (freeCount === 0) return null;
      freeCount -= 1;
      const item = free[freeCount];
      if (reset !== undefined) reset(item);
      return item;
    },
    release(item: T): void {
      if (freeCount === capacity) {
        throw new RangeError('object pool released more objects than it handed out');
      }
      free[freeCount] = item;
      freeCount += 1;
    },
  };
}
