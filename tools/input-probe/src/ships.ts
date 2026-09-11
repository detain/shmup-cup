/**
 * Ship lanes: three ships driven by the same input through three different key-handling strategies.
 *
 * - **A — raw:** held = between `keydown` and `keyup` (repeats ignored).
 * - **B — debounced:** held, or released less than ~3 frames (50 ms) ago — hides fake keyup/keydown pairs.
 * - **C — naive:** moves a fixed step on every `keydown` event including repeats ("menu-style" handling).
 *
 * Pure module: the simulation state lives in typed arrays; {@link Ship.step} and {@link stepLanes} are
 * allocation-free so they can run every frame.
 *
 * @module ships
 */

import { KeyCode } from './keys';
import type { KeyTracker } from './keyTracker';

/** Movement speed of lanes A and B (px per frame, per axis). */
export const SHIP_SPEED_PX = 4;
/** Distance lane C moves per `keydown` event (px). */
export const NAIVE_STEP_PX = 12;
/** Trail length (positions kept). */
export const TRAIL_LENGTH = 16;
/** Timeline length (frames kept). */
export const TIMELINE_FRAMES = 240;

/**
 * One ship in its lane, with a short trail and a moving/not-moving timeline.
 *
 * @example
 * ```ts
 * const ship = new Ship(820, 150); // starts centered at (410, 75)
 * ship.step(4, 0);                 // true — moved right
 * ship.step(0, 0);                 // false
 * ship.timelineAt(0);              // 0 (this frame: not moving)
 * ship.timelineAt(1);              // 1 (previous frame: moving)
 * ```
 */
export class Ship {
  /** Lane width (px); x wraps within [0, width). */
  readonly width: number;
  /** Lane height (px); y wraps within [0, height). */
  readonly height: number;
  /** Current x position (px, lane-local). */
  x: number;
  /** Current y position (px, lane-local). */
  y: number;
  /** Trail x positions (ring buffer, {@link TRAIL_LENGTH} entries). */
  readonly trailX = new Float32Array(TRAIL_LENGTH);
  /** Trail y positions (ring buffer, {@link TRAIL_LENGTH} entries, same indexing as {@link Ship.trailX}). */
  readonly trailY = new Float32Array(TRAIL_LENGTH);
  /** Index of the next trail slot to write. */
  trailHead = 0;
  /** Timeline ring: 1 = moved that frame, 0 = did not. */
  readonly timeline = new Uint8Array(TIMELINE_FRAMES);
  /** Index of the next timeline slot to write. */
  timelineHead = 0;
  /** Frames recorded so far (saturates at {@link TIMELINE_FRAMES}). */
  timelineCount = 0;

  /**
   * Creates a ship centered in a lane of the given size, with its whole trail at the start position.
   *
   * @param width - lane width in px.
   * @param height - lane height in px.
   */
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.x = width / 2;
    this.y = height / 2;
    this.trailX.fill(this.x);
    this.trailY.fill(this.y);
  }

  /**
   * Advances one frame: moves by (dx, dy) with wrap-around, updates trail and timeline. Allocation-free.
   *
   * @param dx - horizontal movement in px (may be 0 or negative).
   * @param dy - vertical movement in px (may be 0 or negative).
   * @returns whether the ship moved this frame.
   */
  step(dx: number, dy: number): boolean {
    const moved = dx !== 0 || dy !== 0;
    if (moved) {
      this.x = wrap(this.x + dx, this.width);
      this.y = wrap(this.y + dy, this.height);
    }
    this.trailX[this.trailHead] = this.x;
    this.trailY[this.trailHead] = this.y;
    this.trailHead = (this.trailHead + 1) % TRAIL_LENGTH;
    this.timeline[this.timelineHead] = moved ? 1 : 0;
    this.timelineHead = (this.timelineHead + 1) % TIMELINE_FRAMES;
    if (this.timelineCount < TIMELINE_FRAMES) this.timelineCount++;
    return moved;
  }

  /**
   * Reads the timeline ring by age.
   *
   * @param i - age in frames (0 = this frame).
   * @returns 1 if the ship moved in that frame, 0 if not or when that frame was not recorded yet.
   */
  timelineAt(i: number): number {
    if (i < 0 || i >= this.timelineCount) return 0;
    let idx = this.timelineHead - 1 - i;
    if (idx < 0) idx += TIMELINE_FRAMES;
    return this.timeline[idx] as number;
  }
}

/**
 * Wraps a coordinate into [0, size).
 *
 * @param v - coordinate (any finite value, negative allowed).
 * @param size - lane size; a non-positive size yields 0.
 * @returns `v` modulo `size`, always non-negative.
 *
 * @example
 * ```ts
 * wrap(-4, 820);  // 816
 * wrap(824, 820); // 4
 * ```
 */
export function wrap(v: number, size: number): number {
  if (size <= 0) return 0;
  const r = v % size;
  return r < 0 ? r + size : r;
}

/**
 * Converts two opposing held flags (e.g. left/right) into an axis value.
 *
 * @param negative - the negative-direction key is held (left / up).
 * @param positive - the positive-direction key is held (right / down).
 * @returns -1, 0 or +1 (both held cancel out to 0).
 */
export function axis(negative: boolean, positive: boolean): number {
  return (positive ? 1 : 0) - (negative ? 1 : 0);
}

/** The three lanes, all driven by the same input through different key-handling strategies. */
export interface Lanes {
  /** Lane A — raw held state. */
  raw: Ship;
  /** Lane B — debounced held state. */
  debounced: Ship;
  /** Lane C — naive per-`keydown` steps. */
  naive: Ship;
}

/**
 * Creates the three lanes with the same size.
 *
 * @param width - lane width in px.
 * @param height - lane height in px.
 * @returns three fresh ships, each centered in its lane.
 */
export function createLanes(width: number, height: number): Lanes {
  return { raw: new Ship(width, height), debounced: new Ship(width, height), naive: new Ship(width, height) };
}

/**
 * Steps all three lanes by one frame from the tracker's state. Allocation-free.
 *
 * @param lanes - the ships.
 * @param tracker - key tracker (already `tick`ed for this frame).
 * @param now - frame time (ms), for the debounced lane.
 */
export function stepLanes(lanes: Lanes, tracker: KeyTracker, now: number): void {
  const L = KeyCode.Left;
  const R = KeyCode.Right;
  const U = KeyCode.Up;
  const D = KeyCode.Down;
  lanes.raw.step(
    SHIP_SPEED_PX * axis(tracker.isRawHeld(L), tracker.isRawHeld(R)),
    SHIP_SPEED_PX * axis(tracker.isRawHeld(U), tracker.isRawHeld(D)),
  );
  lanes.debounced.step(
    SHIP_SPEED_PX * axis(tracker.isDebouncedHeld(L, now), tracker.isDebouncedHeld(R, now)),
    SHIP_SPEED_PX * axis(tracker.isDebouncedHeld(U, now), tracker.isDebouncedHeld(D, now)),
  );
  const nl = tracker.takeNaiveDowns(L);
  const nr = tracker.takeNaiveDowns(R);
  const nu = tracker.takeNaiveDowns(U);
  const nd = tracker.takeNaiveDowns(D);
  lanes.naive.step(NAIVE_STEP_PX * (nr - nl), NAIVE_STEP_PX * (nd - nu));
}
