/**
 * Helpers that feed realistic key-event sequences into a {@link KeyTracker}.
 */

import type { KeyTracker } from '../../src/keyTracker';

/**
 * Holds a key with clean auto-repeat: press at `t0`, `repeat=true` keydowns from `t0 + delay` every
 * `interval` ms, release at `t1`.
 */
export function holdClean(tr: KeyTracker, code: number, t0: number, t1: number, delay = 500, interval = 50): void {
  tr.keyDown(code, false, t0);
  for (let t = t0 + delay; t < t1; t += interval) tr.keyDown(code, true, t);
  tr.keyUp(code, t1);
}

/**
 * Holds a key the "fake pairs" way: press at `t0`, then from `t0 + delay` every `interval` ms a keyup followed
 * `gap` ms later by a keydown (repeat flag false), final release at `t1`.
 */
export function holdFakePairs(
  tr: KeyTracker,
  code: number,
  t0: number,
  t1: number,
  delay = 500,
  interval = 50,
  gap = 10,
): void {
  tr.keyDown(code, false, t0);
  for (let t = t0 + delay; t + gap < t1; t += interval) {
    tr.keyUp(code, t);
    tr.keyDown(code, false, t + gap);
  }
  tr.keyUp(code, t1);
}

/** Calls `tick` every `step` ms from `from` to `to` inclusive (like a 60 Hz frame loop). */
export function tickRange(tr: KeyTracker, from: number, to: number, step = 16): void {
  for (let t = from; t <= to; t += step) tr.tick(t);
}
