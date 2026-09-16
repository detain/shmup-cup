/**
 * The debug overlay's frame-pacing readouts (plan M3-02b): the rAF-delta histogram
 * ({@link RAF_BUCKET_EDGES_MS}, {@link rafDeltaBucket}, {@link buildRafHistogram}), the
 * ticks-per-frame counters and the `LOCK` alert the on-device check of the vsync lock reads
 * (`docs/dev/input-probe-results.md` finding 8).
 *
 * Regression: `rafDeltaBucket(NaN)` fell out of every `<` comparison and landed in the
 * "really dropped frame" overflow bucket, against its own contract of 0.
 */
import { DrawOp, createDebugFlags, type DrawList } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  PANEL_COLORS,
  RAF_BUCKETS,
  RAF_BUCKET_EDGES_MS,
  buildDebugPanel,
  buildRafHistogram,
  createDebugOverlayStats,
  createDebugPanelLists,
  createFrameGraph,
  rafDeltaBucket,
  setDebugPanelDevice,
} from '../../src/debug/index.js';

/** One rect command read back from a list. */
interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: number;
}

/**
 * The rect commands of a list, in command order.
 *
 * @param list - The list.
 * @returns The rects.
 */
function rects(list: DrawList): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] !== DrawOp.Rect) continue;
    out.push({ x: list.x[i], y: list.y[i], w: list.w[i], h: list.h[i], color: list.color[i] });
  }
  return out;
}

/**
 * The values of the number commands of a list.
 *
 * @param list - The list.
 * @returns Values in command order.
 */
function numbers(list: DrawList): number[] {
  const out: number[] = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] === DrawOp.Number) out.push(list.value[i]);
  }
  return out;
}

/**
 * The strings of the text commands of a list.
 *
 * @param list - The list.
 * @returns Texts in command order.
 */
function texts(list: DrawList): string[] {
  const out: string[] = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] === DrawOp.Text) out.push(list.strings[list.ref[i]]);
  }
  return out;
}

describe('rafDeltaBucket', () => {
  it('has strictly rising, frozen edges and one overflow bucket', () => {
    expect(RAF_BUCKETS).toBe(RAF_BUCKET_EDGES_MS.length + 1);
    expect(Object.isFrozen(RAF_BUCKET_EDGES_MS)).toBe(true);
    for (let i = 1; i < RAF_BUCKET_EDGES_MS.length; i++) {
      expect(RAF_BUCKET_EDGES_MS[i]).toBeGreaterThan(RAF_BUCKET_EDGES_MS[i - 1]);
    }
    expect([...RAF_BUCKET_EDGES_MS]).toEqual([12, 15, 17, 19, 21, 25, 33]);
  });

  it('puts a delta in the first bucket whose edge it is below (the edge itself is the next one)', () => {
    for (let i = 0; i < RAF_BUCKET_EDGES_MS.length; i++) {
      const edge = RAF_BUCKET_EDGES_MS[i];
      expect(rafDeltaBucket(edge - 0.001), `${edge} - ε`).toBe(i);
      expect(rafDeltaBucket(edge), `${edge}`).toBe(i + 1);
    }
  });

  it('reads the measured deltas the way the docs say', () => {
    expect(rafDeltaBucket(16.5)).toBe(2); // a 60 Hz frame (the 15 … 17 ms bucket)
    expect(rafDeltaBucket(16.7)).toBe(2);
    expect(rafDeltaBucket(30)).toBe(6); // the M7's p95 jitter
    expect(rafDeltaBucket(33.4)).toBe(7); // a really dropped frame
    expect(rafDeltaBucket(1000)).toBe(RAF_BUCKETS - 1);
    expect(rafDeltaBucket(Infinity)).toBe(RAF_BUCKETS - 1);
  });

  it('sends a non-finite or negative delta to bucket 0, never to the overflow bucket', () => {
    // Regression (M3-02b review): NaN failed every `<` test and was counted as a dropped frame.
    expect(rafDeltaBucket(Number.NaN)).toBe(0);
    expect(rafDeltaBucket(-1)).toBe(0);
    expect(rafDeltaBucket(-Infinity)).toBe(0);
    expect(rafDeltaBucket(0)).toBe(0);
  });
});

describe('buildRafHistogram', () => {
  /** An empty `pacing` list of the right capacity. */
  const list = (): DrawList => createDebugPanelLists('x').pacing;

  it('draws nothing for an empty histogram', () => {
    const l = list();
    buildRafHistogram(l, new Int32Array(RAF_BUCKETS), 10, 20);
    expect(l.count).toBe(0);
  });

  it('draws one bar per non-empty bucket, scaled to the busiest one', () => {
    const l = list();
    const buckets = new Int32Array(RAF_BUCKETS);
    buckets[3] = 800; // the 60 Hz bucket
    buckets[6] = 400;
    buckets[7] = 100;
    buildRafHistogram(l, buckets, 100, 50);
    const bars = rects(l);
    expect(bars).toHaveLength(3);
    // Bars sit left to right, one bucket apart, and share a baseline.
    expect(bars.map((b) => b.x)).toEqual([100 + 3 * 3, 100 + 6 * 3, 100 + 7 * 3]);
    for (const bar of bars) expect(bar.y + bar.h).toBe(50 + 8);
    // Heights scale to the busiest bucket (8 px tall).
    expect(bars[0].h).toBe(8);
    expect(bars[1].h).toBe(4);
    expect(bars[2].h).toBe(1);
  });

  it('keeps a rare bucket at one visible pixel', () => {
    const l = list();
    const buckets = new Int32Array(RAF_BUCKETS);
    buckets[0] = 1_000_000;
    buckets[7] = 1;
    buildRafHistogram(l, buckets, 0, 0);
    const bars = rects(l);
    expect(bars).toHaveLength(2);
    expect(bars[1].h).toBe(1);
  });

  it('colours the 60 Hz buckets green and the long ones yellow then red', () => {
    const l = list();
    const buckets = new Int32Array(RAF_BUCKETS);
    for (let i = 0; i < RAF_BUCKETS; i++) buckets[i] = 10;
    buildRafHistogram(l, buckets, 0, 0);
    expect(rects(l).map((bar) => bar.color)).toEqual([
      PANEL_COLORS.good,
      PANEL_COLORS.good,
      PANEL_COLORS.good,
      PANEL_COLORS.good,
      PANEL_COLORS.good,
      PANEL_COLORS.warn,
      PANEL_COLORS.warn,
      PANEL_COLORS.bad,
    ]);
  });

  it('clears and refills the list, so a rebuild never grows it', () => {
    const l = list();
    const buckets = new Int32Array(RAF_BUCKETS);
    for (let i = 0; i < RAF_BUCKETS; i++) buckets[i] = i + 1;
    buildRafHistogram(l, buckets, 0, 0);
    const first = l.count;
    for (let i = 0; i < 5; i++) buildRafHistogram(l, buckets, 0, 0);
    expect(l.count).toBe(first);
    buildRafHistogram(l, new Int32Array(RAF_BUCKETS), 0, 0);
    expect(l.count).toBe(0);
  });

  it('ignores a negative count (a bucket can never go below zero)', () => {
    const l = list();
    const buckets = new Int32Array(RAF_BUCKETS);
    buckets[2] = -5;
    buildRafHistogram(l, buckets, 0, 0);
    expect(l.count).toBe(0);
  });
});

describe('the panel’s frame-pacing line', () => {
  it('starts with empty counters of the right size, lock off', () => {
    const stats = createDebugOverlayStats();
    expect(stats.tickFrames).toHaveLength(4);
    expect(stats.rafHistogram).toHaveLength(RAF_BUCKETS);
    expect([...stats.tickFrames]).toEqual([0, 0, 0, 0]);
    expect([...stats.rafHistogram]).toEqual(new Array(RAF_BUCKETS).fill(0));
    expect(stats.vsyncLock).toBe(false);
  });

  it('draws TPF, RAF and the four ticks-per-frame counters', () => {
    const panel = createDebugPanelLists('build01');
    const stats = createDebugOverlayStats();
    stats.tickFrames[0] = 2;
    stats.tickFrames[1] = 3571;
    stats.tickFrames[2] = 11;
    stats.tickFrames[3] = 1;
    stats.rafHistogram[3] = 900;
    buildDebugPanel(panel, stats, null, createDebugFlags(), createFrameGraph());
    expect(texts(panel.labels)).toContain('TPF');
    expect(texts(panel.labels)).toContain('RAF');
    const values = numbers(panel.values);
    for (const n of [2, 3571, 11, 1]) expect(values).toContain(n);
    // The histogram went into the pacing list, not into the frame graph's lists.
    expect(rects(panel.pacing)).toHaveLength(1);
  });

  it('shows LOCK only while the vsync lock is on, after the other switches', () => {
    const panel = createDebugPanelLists('x');
    const stats = createDebugOverlayStats();
    const flags = createDebugFlags();
    buildDebugPanel(panel, stats, null, flags, createFrameGraph());
    expect(texts(panel.alerts)).toEqual([]);
    stats.vsyncLock = true;
    buildDebugPanel(panel, stats, null, flags, createFrameGraph());
    expect(texts(panel.alerts)).toEqual(['LOCK']);
    // With SLOW on, LOCK moves right of it instead of overlapping (the column advanced).
    flags.slowMo = 4;
    buildDebugPanel(panel, stats, null, flags, createFrameGraph());
    expect(texts(panel.alerts)).toEqual(['SLOW', 'LOCK']);
    const alerts = panel.alerts;
    const xs: number[] = [];
    for (let i = 0; i < alerts.count; i++) {
      if (alerts.op[i] === DrawOp.Text) xs.push(alerts.x[i]);
    }
    expect(xs[1]).toBeGreaterThan(xs[0]);
  });

  it('keeps the device line below the pacing line', () => {
    const panel = createDebugPanelLists('x');
    const stats = createDebugOverlayStats();
    setDebugPanelDevice(panel, 'MODEL / 1920x1080');
    buildDebugPanel(panel, stats, null, createDebugFlags(), createFrameGraph());
    const labels = panel.labels;
    let tpfY = -1;
    for (let i = 0; i < labels.count; i++) {
      if (labels.op[i] === DrawOp.Text && labels.strings[labels.ref[i]] === 'TPF')
        tpfY = labels.y[i];
    }
    expect(tpfY).toBeGreaterThan(0);
    const values = panel.values;
    let deviceY = -1;
    for (let i = 0; i < values.count; i++) {
      if (values.op[i] === DrawOp.Text && values.strings[values.ref[i]] === 'MODEL / 1920x1080') {
        deviceY = values.y[i];
      }
    }
    expect(deviceY).toBeGreaterThan(tpfY);
  });
});
