import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import type { GamepadLike, KeyEventLike } from '../src/index.js';

/** A plain key event object with a spy-able `preventDefault`. */
export interface FakeKeyEvent extends KeyEventLike {
  prevented: boolean;
}

/**
 * Builds a fake keyboard event.
 *
 * @param type - `keydown` or `keyup`.
 * @param code - `KeyboardEvent.code` ('' for TV remote keys).
 * @param keyCode - Legacy key code.
 * @param extra - Optional overrides (repeat, modifiers).
 */
export function key(
  type: 'keydown' | 'keyup',
  code: string,
  keyCode = 0,
  extra: Partial<Pick<KeyEventLike, 'repeat' | 'ctrlKey' | 'metaKey'>> = {},
): FakeKeyEvent {
  const event: FakeKeyEvent = {
    type,
    code,
    keyCode,
    repeat: extra.repeat ?? false,
    ctrlKey: extra.ctrlKey ?? false,
    metaKey: extra.metaKey ?? false,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
  };
  return event;
}

/**
 * Builds a fake standard-mapping gamepad.
 *
 * @param index - Pad slot.
 * @param pressed - Indices of pressed buttons.
 * @param axes - Axis values.
 */
export function pad(
  index: number,
  pressed: number[] = [],
  axes: number[] = [0, 0, 0, 0],
): GamepadLike {
  const buttons = [];
  for (let i = 0; i < 17; i++) buttons.push({ pressed: pressed.includes(i) });
  return { index, connected: true, mapping: 'standard', buttons, axes };
}

/** `gc()` of the V8 isolate (exposed on first use through `--expose-gc`). */
let collect: (() => void) | null = null;

/** Runs a full garbage collection. */
export function forceGc(): void {
  if (collect === null) {
    setFlagsFromString('--expose-gc');
    collect = runInNewContext('gc') as () => void;
  }
  collect();
  collect();
}

/**
 * Estimates the bytes `step` allocates over `iterations` calls, after `warmUp` calls (JIT).
 *
 * @remarks
 * Samples `heapUsed` every 100 calls and sums only the growing intervals, so a scavenge in the
 * middle loses one interval instead of hiding the whole run (the same probe as the
 * render-pixi tests). Short-lived garbage counts — per-tick input code must not produce any.
 *
 * @param step - The per-tick work; receives the iteration index.
 * @param iterations - Measured calls.
 * @param warmUp - Unmeasured calls first (default 2000).
 * @returns Estimated bytes allocated.
 */
export function measureAllocation(
  step: (i: number) => void,
  iterations: number,
  warmUp = 2000,
): number {
  for (let i = 0; i < warmUp; i++) step(i);
  forceGc();
  let previous = process.memoryUsage().heapUsed;
  let total = 0;
  for (let done = 0; done < iterations;) {
    const end = Math.min(iterations, done + 100);
    for (; done < end; done++) step(warmUp + done);
    const now = process.memoryUsage().heapUsed;
    if (now > previous) total += now - previous;
    previous = now;
  }
  return total;
}
