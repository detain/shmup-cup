/**
 * Allocation guard of the refresh-rate probe (plan M2-08, zero allocation per frame — plan §1.3):
 * the shell calls `RefreshMonitor.sample` on every rAF callback and, once the probe is ready, reads
 * `hz` every frame to switch render interpolation; the estimate (an insertion sort into a
 * preallocated array, the interquartile mean) runs every 15 frames. Fed jittery, fractional
 * timestamps for thousands of frames, with `ready` / `hz` read like the shell does, it allocates
 * nothing — a regression guard: `hz` was a getter returning the fractional rate, which boxed it on
 * every read (about 16 bytes a frame). Kept in its own file, away from suites that build many
 * objects (see docs/dev/conventions.md).
 */
import { describe, expect, it } from 'vitest';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';
import { INTERPOLATION_MIN_HZ, createRefreshMonitor } from '../../src/frame-loop/index.js';

describe('shell/frame-loop refresh monitor allocation', () => {
  it('samples, re-estimates and is read every frame without allocating', () => {
    const monitor = createRefreshMonitor();
    // Timestamps live in a typed array: a fractional `let` in this closure would be boxed.
    const clock = new Float64Array(1);
    let fast = 0;
    const growth = measureHeapGrowth(
      (frame) => {
        clock[0] += (frame & 1) === 0 ? 6.5 : 7.4;
        if (frame % 997 === 0) clock[0] += 300; // a hitch now and then
        monitor.sample(clock[0]);
        // What the shell's frame callback does in 'auto' mode.
        if (monitor.ready && monitor.hz > INTERPOLATION_MIN_HZ) fast++;
      },
      20_000,
      5000,
    );
    expect(growth.bytes).toBeLessThan(64 * 1024);
    expect(fast).toBeGreaterThan(0);
  });
});
