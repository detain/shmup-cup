/**
 * # remote — device quirks: release debounce, diagonal policy, SOCD
 *
 * **Responsibility.** The Samsung Smart Remote's quirks — and the matching knobs for keyboards
 * and gamepads — as small, allocation-free building blocks the input sources run inside
 * `poll()`. Every knob comes from the active input profile (`rebind`, decision D13), so the
 * input-probe results change data, not code:
 *
 * - **Release debounce** ({@link createReleaseDebouncer}): some TV remotes send fake
 *   `keyup`/`keydown` pairs while a key is held. A released key keeps counting as held for
 *   `releaseDebounceTicks` more polls; a `keydown` inside that window cancels the release
 *   without a new `pressed` edge, so movement does not stutter (shmup_feat.md §4 rule 3).
 * - **Diagonal policy** ({@link resolveDirections}): `combine` keeps a horizontal and a
 *   vertical direction together (8-way); `lastWins` / `firstWins` keep only the most recently /
 *   earliest pressed one, emulating a D-pad ring that cannot hold two arrows (rule 2).
 * - **SOCD** (simultaneous opposing cardinal directions — Left+Right, Up+Down): `neutral`
 *   cancels both, `lastWins` keeps the most recently pressed (shmup_feat.md §4 [P1]).
 * - {@link createDirectionOrder} gives polled devices (gamepads) the press order the policies
 *   need; key sources derive it from their event order instead.
 *
 * Remote key codes live in `keymap` (arrows 37–40, OK 13, Back 10009, Play/Pause 10252,
 * Ch± 427/428); forced autofire is applied by the core in remote mode.
 *
 * **Implements.**
 * - shmup_feat.md §4 — remote-first control design rules 2–3 (4-way, release debounce), SOCD
 * - shmup_tech.md §2.3 — remote key codes; input_probe_spec.md questions 1–3
 *
 * **Public API.** {@link InputTuning}, {@link DEFAULT_INPUT_TUNING},
 * {@link MAX_RELEASE_DEBOUNCE_TICKS}, {@link DiagonalPolicy}, {@link DIAGONAL_POLICIES},
 * {@link SocdPolicy}, {@link SOCD_POLICIES}, {@link DIRECTION_MASK}, {@link DIRECTION_COUNT},
 * {@link createReleaseDebouncer}, {@link ReleaseDebouncer}, {@link resolveDirections},
 * {@link createDirectionOrder}, {@link DirectionOrder}.
 *
 * @module
 */
import { Action, defineModule, type ActionMask } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'remote',
  status: 'implemented',
  specRefs: ['shmup_feat.md §4', 'shmup_tech.md §2.3', 'input_probe_spec.md'],
});

/**
 * How a horizontal and a vertical direction held together are resolved.
 *
 * - `combine` — keep both (a diagonal).
 * - `lastWins` — keep the one pressed most recently (the remote's "second arrow replaces the
 *   first"); releasing it brings the other one back.
 * - `firstWins` — keep the one pressed first until it is released.
 */
export type DiagonalPolicy = 'combine' | 'lastWins' | 'firstWins';

/** Every {@link DiagonalPolicy}. */
export const DIAGONAL_POLICIES: readonly DiagonalPolicy[] = Object.freeze([
  'combine',
  'lastWins',
  'firstWins',
] as DiagonalPolicy[]);

/**
 * How opposing directions held together (Left+Right, Up+Down) are resolved.
 *
 * - `neutral` — both cancel (no movement on that axis).
 * - `lastWins` — the one pressed most recently wins.
 */
export type SocdPolicy = 'neutral' | 'lastWins';

/** Every {@link SocdPolicy}. */
export const SOCD_POLICIES: readonly SocdPolicy[] = Object.freeze([
  'neutral',
  'lastWins',
] as SocdPolicy[]);

/** Largest accepted `releaseDebounceTicks` (a sixth of a second at 60 Hz). */
export const MAX_RELEASE_DEBOUNCE_TICKS = 10;

/** The quirk knobs of one device, as the active input profile sets them. */
export interface InputTuning {
  /** Polls a released key keeps counting as held (0 = off; decision D14 uses 2 on the TV). */
  readonly releaseDebounceTicks: number;
  /** Horizontal + vertical direction handling. */
  readonly diagonals: DiagonalPolicy;
  /** Left+Right / Up+Down handling. */
  readonly socd: SocdPolicy;
}

/** Tuning used before a profile is applied: no debounce, 8-way, neutral SOCD. */
export const DEFAULT_INPUT_TUNING: InputTuning = Object.freeze({
  releaseDebounceTicks: 0,
  diagonals: 'combine',
  socd: 'neutral',
} as const);

/** The four direction bits (`Action.Up | Down | Left | Right` = bits 0–3). */
export const DIRECTION_MASK = Action.Up | Action.Down | Action.Left | Action.Right;

/**
 * Number of direction slots in a press-order array: index = bit position of the direction
 * (`Up` 0, `Down` 1, `Left` 2, `Right` 3).
 */
export const DIRECTION_COUNT = 4;

/** Slot index of each direction in an order array. */
const UP = 0;
const DOWN = 1;
const LEFT = 2;
const RIGHT = 3;

/** Key state inside a {@link ReleaseDebouncer}. */
const STATE_UP = 0;
const STATE_DOWN = 1;
const STATE_RELEASING = 2;

/**
 * Per-slot held state with a release debounce. Slots are small integers chosen by the caller
 * (the keyboard source uses one slot per physical key).
 *
 * @remarks
 * No method allocates; {@link ReleaseDebouncer.poll} runs once per simulation tick.
 */
export interface ReleaseDebouncer {
  /** Polls a released slot keeps counting as held. */
  readonly ticks: number;
  /** Number of slots. */
  readonly capacity: number;
  /**
   * Changes the debounce window. Pending releases are shortened to the new window; `0`
   * releases them immediately.
   *
   * @param ticks - New window, clamped to `0 … MAX_RELEASE_DEBOUNCE_TICKS`.
   */
  setTicks(ticks: number): void;
  /**
   * A `keydown` for the slot.
   *
   * @param slot - Slot index.
   * @returns `'new'` for a fresh press (a `pressed` edge), `'resumed'` when it cancelled a
   *   pending release (no edge — the key never stopped counting as held), `'held'` when the
   *   slot was already down (an auto-repeat keydown, even without the `repeat` flag).
   */
  press(slot: number): 'new' | 'resumed' | 'held';
  /**
   * A `keyup` for the slot.
   *
   * @param slot - Slot index.
   * @returns `true` when the slot is released right away (window 0), `false` when the release
   *   is pending (or the slot was not down).
   */
  release(slot: number): boolean;
  /**
   * Whether the slot counts as held (down, or released less than `ticks` polls ago).
   *
   * @param slot - Slot index.
   * @returns `true` while held.
   */
  isHeld(slot: number): boolean;
  /**
   * Whether the slot was released but still counts as held (its debounce window is running).
   *
   * @param slot - Slot index.
   * @returns `true` only while a release is pending.
   */
  isReleasing(slot: number): boolean;
  /**
   * One poll: ages every pending release; releases that ran out free their slot.
   *
   * @returns How many slots were released by this poll.
   */
  poll(): number;
  /**
   * Forgets one slot immediately (no debounce).
   *
   * @param slot - Slot index.
   */
  reset(slot: number): void;
  /** Forgets every slot immediately (window blur, suspend). */
  clear(): void;
}

/**
 * Clamps a debounce window to the accepted range.
 *
 * @param ticks - Requested window.
 * @returns An integer in `0 … MAX_RELEASE_DEBOUNCE_TICKS` (non-finite → 0).
 */
function clampTicks(ticks: number): number {
  if (!Number.isFinite(ticks) || ticks <= 0) return 0;
  const whole = Math.floor(ticks);
  return whole > MAX_RELEASE_DEBOUNCE_TICKS ? MAX_RELEASE_DEBOUNCE_TICKS : whole;
}

/**
 * Creates a release debouncer.
 *
 * @remarks
 * A `keyup` arriving between polls N and N+1 with a window of `ticks` keeps the slot held for
 * polls N+1 … N+ticks and releases it on poll N+ticks+1 — unless a `keydown` for the same slot
 * arrives first, which cancels the release without a new `pressed` edge. With a window of 2
 * (decision D14) a fake `keyup`/`keydown` pair up to ~33 ms apart is invisible at 60 Hz; a
 * window of 0 behaves like plain keydown/keyup tracking.
 *
 * @param ticks - Debounce window in polls (clamped to `0 … MAX_RELEASE_DEBOUNCE_TICKS`).
 * @param capacity - Number of slots (default 32; floored, at least 1 — also for `NaN`).
 * @returns The debouncer.
 *
 * @example
 * ```ts
 * const debounce = createReleaseDebouncer(2);
 * debounce.press(0);   // 'new'
 * debounce.release(0); // false — pending
 * debounce.poll();     // still held
 * debounce.press(0);   // 'resumed' — the fake keyup is gone, no new edge
 * ```
 */
export function createReleaseDebouncer(ticks: number, capacity = 32): ReleaseDebouncer {
  // `Math.max(1, NaN)` is NaN: compare instead, so a NaN capacity still gives one slot.
  const whole = Math.floor(capacity);
  const size = whole >= 1 ? whole : 1;
  const state = new Uint8Array(size);
  const left = new Int32Array(size);
  let window = clampTicks(ticks);

  /**
   * Whether `slot` is a valid index.
   *
   * @param slot - Slot index.
   * @returns `true` inside `0 … capacity - 1`.
   */
  const valid = (slot: number): boolean => slot >= 0 && slot < size && slot === (slot | 0);

  return {
    get ticks() {
      return window;
    },
    capacity: size,
    setTicks(next) {
      window = clampTicks(next);
      for (let i = 0; i < size; i++) {
        if (state[i] !== STATE_RELEASING) continue;
        if (window === 0) state[i] = STATE_UP;
        else if (left[i] > window) left[i] = window;
      }
    },
    press(slot) {
      if (!valid(slot)) return 'held';
      const current = state[slot];
      state[slot] = STATE_DOWN;
      if (current === STATE_DOWN) return 'held';
      return current === STATE_RELEASING ? 'resumed' : 'new';
    },
    release(slot) {
      if (!valid(slot) || state[slot] !== STATE_DOWN) return false;
      if (window === 0) {
        state[slot] = STATE_UP;
        return true;
      }
      state[slot] = STATE_RELEASING;
      left[slot] = window;
      return false;
    },
    isHeld(slot) {
      return valid(slot) && state[slot] !== STATE_UP;
    },
    isReleasing(slot) {
      return valid(slot) && state[slot] === STATE_RELEASING;
    },
    poll() {
      let released = 0;
      for (let i = 0; i < size; i++) {
        if (state[i] !== STATE_RELEASING) continue;
        if (left[i] <= 0) {
          state[i] = STATE_UP;
          released++;
        } else {
          left[i]--;
        }
      }
      return released;
    },
    reset(slot) {
      if (valid(slot)) state[slot] = STATE_UP;
    },
    clear() {
      state.fill(STATE_UP);
    },
  };
}

/**
 * Resolves one opposing pair under an SOCD policy.
 *
 * @param mask - Direction bits.
 * @param a - Bit of the first direction.
 * @param b - Bit of the opposing direction.
 * @param orderA - Press order of `a` (higher = more recent).
 * @param orderB - Press order of `b`.
 * @param socd - Policy.
 * @returns `mask` with at most one of `a` / `b` left.
 */
function resolvePair(
  mask: ActionMask,
  a: number,
  b: number,
  orderA: number,
  orderB: number,
  socd: SocdPolicy,
): ActionMask {
  if ((mask & a) === 0 || (mask & b) === 0) return mask;
  if (socd === 'neutral') return mask & ~(a | b);
  // lastWins; a tie (same poll) falls back to neutral so the result never depends on bit order.
  if (orderA > orderB) return mask & ~b;
  if (orderB > orderA) return mask & ~a;
  return mask & ~(a | b);
}

/**
 * Applies the SOCD and diagonal policies to an action mask.
 *
 * @remarks
 * SOCD runs first (per axis), then the diagonal policy between the surviving horizontal and
 * vertical direction. `order` holds one press-order number per direction (index = bit
 * position: Up 0, Down 1, Left 2, Right 3; higher = pressed more recently); only the relative
 * order of directions that are in `mask` matters. Ties (pressed within the same poll) resolve
 * deterministically: SOCD `lastWins` falls back to neutral, the diagonal policy keeps the
 * vertical direction for `lastWins` and the horizontal one for `firstWins`.
 * Non-direction bits pass through untouched. Pure; no allocation.
 *
 * @param mask - Held actions.
 * @param order - Press order per direction (length ≥ {@link DIRECTION_COUNT}).
 * @param diagonals - Diagonal policy.
 * @param socd - SOCD policy.
 * @returns The resolved mask.
 *
 * @example
 * ```ts
 * const order = [2, 0, 0, 1]; // Up pressed after Right
 * resolveDirections(Action.Up | Action.Right, order, 'lastWins', 'neutral'); // → Action.Up
 * resolveDirections(Action.Left | Action.Right, order, 'combine', 'neutral'); // → 0
 * ```
 */
export function resolveDirections(
  mask: ActionMask,
  order: ArrayLike<number>,
  diagonals: DiagonalPolicy,
  socd: SocdPolicy,
): ActionMask {
  if ((mask & DIRECTION_MASK) === 0) return mask;
  const up = order[UP] ?? 0;
  const down = order[DOWN] ?? 0;
  const left = order[LEFT] ?? 0;
  const right = order[RIGHT] ?? 0;
  let out = resolvePair(mask, Action.Left, Action.Right, left, right, socd);
  out = resolvePair(out, Action.Up, Action.Down, up, down, socd);
  if (diagonals === 'combine') return out;
  const horizontal = out & (Action.Left | Action.Right);
  const vertical = out & (Action.Up | Action.Down);
  if (horizontal === 0 || vertical === 0) return out;
  const hOrder = horizontal === Action.Left ? left : right;
  const vOrder = vertical === Action.Up ? up : down;
  const keepVertical = diagonals === 'lastWins' ? vOrder >= hOrder : vOrder < hOrder;
  return keepVertical ? out & ~horizontal : out & ~vertical;
}

/**
 * Press-order tracker for a polled device (a gamepad): directions that become held get
 * increasing order numbers, in the format {@link resolveDirections} reads.
 */
export interface DirectionOrder {
  /** Order per direction (index = bit position); reused — do not keep a copy. */
  readonly order: Int32Array;
  /**
   * Records one poll's direction bits: each direction that was not held on the previous
   * update gets the next order number (several in the same poll share one).
   *
   * @param mask - Held actions of this poll (non-direction bits are ignored).
   */
  update(mask: ActionMask): void;
  /** Forgets the previous mask and every order (device disconnected). */
  reset(): void;
}

/**
 * Creates a {@link DirectionOrder}.
 *
 * @returns A tracker with every order at 0.
 *
 * @example
 * ```ts
 * const tracker = createDirectionOrder();
 * tracker.update(Action.Right);
 * tracker.update(Action.Right | Action.Up);
 * resolveDirections(Action.Right | Action.Up, tracker.order, 'lastWins', 'neutral'); // → Up
 * ```
 */
export function createDirectionOrder(): DirectionOrder {
  const order = new Int32Array(DIRECTION_COUNT);
  let previous = 0;
  let sequence = 0;
  return {
    order,
    update(mask) {
      const fresh = mask & DIRECTION_MASK & ~previous;
      if (fresh !== 0) {
        sequence++;
        for (let i = 0; i < DIRECTION_COUNT; i++) if ((fresh & (1 << i)) !== 0) order[i] = sequence;
      }
      previous = mask & DIRECTION_MASK;
    },
    reset() {
      previous = 0;
      sequence = 0;
      order.fill(0);
    },
  };
}
