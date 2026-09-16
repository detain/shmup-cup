/**
 * frameStats: rAF delta ring buffer, percentiles, hitch/pause counters, running stats, event time choice.
 */

import { describe, expect, it } from 'vitest';

import { FRAME_BUCKET_EDGES_MS, FrameStats, frameBucket, HITCH_MS, PAUSE_MS, RunningStats, chooseEventTime, percentileSorted } from '../src/frameStats';

describe('FrameStats', () => {
  it('empty summary has nulls and zero counters', () => {
    const f = new FrameStats();
    expect(f.capacity).toBe(600);
    expect(f.length).toBe(0);
    expect(f.recent(0)).toBeNaN();
    expect(f.summary()).toEqual({
      samples: 0,
      medianMs: null,
      medianHz: null,
      p95Ms: null,
      maxMs: null,
      hitches: 0,
      worstMs: 0,
      pauses: 0,
      frames: 0,
      histogram: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
  });

  it('ignores negative and NaN deltas; accepts 0', () => {
    const f = new FrameStats(10);
    f.push(-1);
    f.push(NaN);
    f.push(0);
    expect(f.length).toBe(1);
    expect(f.summary().frames).toBe(1);
    expect(f.summary().medianHz).toBeNull(); // median 0 → no Hz
  });

  it('hitch threshold is strictly greater than 20 ms', () => {
    expect(HITCH_MS).toBe(20);
    const f = new FrameStats(10);
    f.push(20);
    f.push(20.01);
    expect(f.summary().hitches).toBe(1);
  });

  it('deltas above 500 ms are pauses, excluded from the window and worst', () => {
    expect(PAUSE_MS).toBe(500);
    const f = new FrameStats(10);
    f.push(500);
    f.push(500.1);
    f.push(3000);
    const s = f.summary();
    expect(s.pauses).toBe(2);
    expect(s.samples).toBe(1);
    expect(s.worstMs).toBe(500);
    expect(s.hitches).toBe(1); // 500 itself is a hitch
  });

  it('ring buffer keeps the newest deltas; recent(0) is newest', () => {
    const f = new FrameStats(4);
    for (let i = 1; i <= 6; i++) f.push(i);
    expect(f.length).toBe(4);
    expect([0, 1, 2, 3].map((i) => f.recent(i))).toEqual([6, 5, 4, 3]);
    expect(f.recent(4)).toBeNaN();
    expect(f.recent(-1)).toBeNaN();
    const s = f.summary();
    expect(s.samples).toBe(4);
    expect(s.medianMs).toBe(4); // nearest rank over [3,4,5,6]
    expect(s.p95Ms).toBe(6);
    expect(s.maxMs).toBe(6);
    expect(s.frames).toBe(6);
    expect(s.worstMs).toBe(6);
  });

  it('computes median Hz and p95 for a 60 Hz stream with occasional hitches', () => {
    const f = new FrameStats(600);
    for (let i = 0; i < 570; i++) f.push(16.67);
    for (let i = 0; i < 30; i++) f.push(33.3);
    const s = f.summary();
    expect(s.medianMs).toBeCloseTo(16.67);
    expect(s.medianHz).toBeCloseTo(59.99, 1);
    expect(s.p95Ms).toBeCloseTo(16.67); // exactly 5 % are hitches → rank 570 is still 16.67
    expect(s.maxMs).toBeCloseTo(33.3);
    expect(s.hitches).toBe(30);
  });

  it('summary sorts numerically (not lexicographically) and does not disturb the ring order', () => {
    const f = new FrameStats(5);
    [100, 9, 25, 3, 50].forEach((v) => f.push(v));
    expect(f.summary().medianMs).toBe(25);
    expect(f.summary().maxMs).toBe(100);
    expect(f.recent(0)).toBe(50);
    expect(f.recent(4)).toBe(100);
  });

  it('resetCounters clears hitches/worst/pauses/frames but keeps the window', () => {
    const f = new FrameStats(10);
    f.push(40);
    f.push(1000);
    f.resetCounters();
    const s = f.summary();
    expect(s).toMatchObject({ hitches: 0, worstMs: 0, pauses: 0, frames: 0, samples: 1, maxMs: 40 });
  });
});

describe('percentileSorted', () => {
  it('nearest-rank with clamping', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentileSorted(a, 0)).toBe(1);
    expect(percentileSorted(a, 0.5)).toBe(5);
    expect(percentileSorted(a, 0.95)).toBe(10);
    expect(percentileSorted(a, 1)).toBe(10);
    expect(percentileSorted(a, 2)).toBe(10);
    expect(percentileSorted(a, -1)).toBe(1);
    expect(percentileSorted([7], 0.5)).toBe(7);
    expect(percentileSorted([], 0.5)).toBeNaN();
  });

  it('works on typed arrays', () => {
    expect(percentileSorted(new Float64Array([1, 2, 3]), 0.5)).toBe(2);
  });
});

describe('RunningStats', () => {
  it('count / avg / min / max, ignoring non-finite values', () => {
    const r = new RunningStats();
    expect(r.summary()).toEqual({ count: 0, avg: null, min: null, max: null });
    [3, NaN, 1, Infinity, 5, -Infinity].forEach((v) => r.add(v));
    expect(r.summary()).toEqual({ count: 3, avg: 3, min: 1, max: 5 });
  });

  it('handles negative values and reset', () => {
    const r = new RunningStats();
    r.add(-2);
    r.add(2);
    expect(r.summary()).toEqual({ count: 2, avg: 0, min: -2, max: 2 });
    r.reset();
    expect(r.summary().count).toBe(0);
    r.add(7);
    expect(r.summary()).toEqual({ count: 1, avg: 7, min: 7, max: 7 });
  });
});

describe('FrameStats histogram (M3-02b)', () => {
  it('counts the stored deltas in the raw rAF-delta buckets', () => {
    const f = new FrameStats(16);
    // A 60 Hz panel with the M7's jitter: short and long deltas paired, one real drop.
    for (const d of [16.7, 16.6, 12.1, 21.3, 16.7, 26.0, 33.4, 60.0]) f.push(d);
    const h = f.summary().histogram;
    expect(h).toHaveLength(FRAME_BUCKET_EDGES_MS.length + 1);
    expect(h.reduce((sum, n) => sum + n, 0)).toBe(8);
    expect(frameBucket(16.7)).toBe(2);
    expect(frameBucket(33.4)).toBe(7);
    expect(frameBucket(60)).toBe(FRAME_BUCKET_EDGES_MS.length);
    expect(h[2]).toBe(3); // 16.7, 16.6, 16.7
    expect(h[7]).toBe(1); // 33.4 — a really dropped frame
    expect(h[FRAME_BUCKET_EDGES_MS.length]).toBe(1); // 60 ms
  });

  it('sends a non-finite or negative delta to bucket 0, never to the dropped-frame bucket', () => {
    // A `<` chain falls out of every comparison for NaN and would have called it a dropped frame.
    expect(frameBucket(NaN)).toBe(0);
    expect(frameBucket(-1)).toBe(0);
    expect(frameBucket(-Infinity)).toBe(0);
    expect(frameBucket(0)).toBe(0);
    expect(frameBucket(Infinity)).toBe(FRAME_BUCKET_EDGES_MS.length);
  });

  it('puts a delta on an edge into the bucket above it', () => {
    FRAME_BUCKET_EDGES_MS.forEach((edge, i) => {
      expect(frameBucket((edge as number) - 0.001), `${edge} - e`).toBe(i);
      expect(frameBucket(edge as number), `${edge}`).toBe(i + 1);
    });
  });

  it('counts only the deltas the ring still holds once it has wrapped', () => {
    const f = new FrameStats(4);
    for (const d of [40, 40, 40, 40, 16.7, 16.7, 16.7, 16.7]) f.push(d);
    const s = f.summary();
    expect(s.frames).toBe(8);
    expect(s.histogram.reduce((sum, n) => sum + n, 0)).toBe(4);
    expect(s.histogram[2]).toBe(4);
  });

  it('leaves pauses out (they never enter the ring)', () => {
    const f = new FrameStats(8);
    f.push(16.7);
    f.push(5000); // a pause: counted, not stored
    const s = f.summary();
    expect(s.pauses).toBe(1);
    expect(s.histogram.reduce((sum, n) => sum + n, 0)).toBe(1);
  });
});

describe('chooseEventTime', () => {
  // M3-02b: the handler clock is the only one the probe trusts (Tizen 5.5 advances
  // `event.timeStamp` in whole seconds); `timeStamp` survives only as the dispatch-delay statistic.
  it('always measures on the handler clock and reports the dispatch delay', () => {
    expect(chooseEventTime(990, 1000)).toEqual({ t: 1000, delay: 10 });
    expect(chooseEventTime(1000, 1000)).toEqual({ t: 1000, delay: 0 });
  });

  it('tolerates a timeStamp slightly ahead of now (≤ 5 ms, clock jitter)', () => {
    expect(chooseEventTime(1005, 1000)).toEqual({ t: 1000, delay: -5 });
  });

  it('keeps handler time and drops the delay for a whole-second Tizen 5.5 clock', () => {
    // Tizen 5.5 reports timeStamps that only advance in whole seconds: consecutive events look
    // 0 or 1000 ms apart however fast they really were.
    const times = [4000, 4000, 4000, 5000];
    const handler = [4210.4, 4262.1, 4333.8, 5040.2];
    const chosen = times.map((stamp, i) => chooseEventTime(stamp, handler[i] as number));
    expect(chosen.map((c) => c.t)).toEqual(handler);
    // The delays are the huge, wildly varying values that give the coarse clock away.
    expect(chosen.map((c) => Math.round(c.delay))).toEqual([210, 262, 334, 40]);
  });

  it('never returns anything but the handler clock, whatever the stamp is', () => {
    const stamps = [0, -1, NaN, Infinity, -Infinity, 1, 999.5, 1000, 1004.9, 1.7e12, -4000];
    for (const stamp of stamps) {
      expect(chooseEventTime(stamp, 1000).t, String(stamp)).toBe(1000);
    }
  });

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['NaN', NaN],
    ['far future', 1006],
    ['epoch milliseconds (old Chromium)', 1.7e12],
    ['older than 5 s', 1000 - 5000],
  ])('falls back to now for a %s timeStamp', (_label, ts) => {
    const r = chooseEventTime(ts, 1000);
    expect(r.t).toBe(1000);
    expect(r.delay).toBeNaN();
  });
});
