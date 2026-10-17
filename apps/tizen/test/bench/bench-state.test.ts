/**
 * The TV render bench's persisted run state and its sampler (plan R0-02): one scenario per page
 * load, the cursor and the records in `localStorage` between reloads, the Red re-run, the
 * acknowledged records — and the per-frame statistics the records are folded from.
 */
import type { RenderBenchRecord } from '@shmup/shell';
import { describe, expect, it } from 'vitest';
import {
  BENCH_SCENARIOS,
  BENCH_STATE_KEY,
  BENCH_STATE_VERSION,
  BenchSampler,
  BenchSeries,
  TV_BENCH_TIMING,
  createRunState,
  markSent,
  nextSeq,
  parseRunState,
  recordResult,
  rerunScenario,
  roundTo,
  serializeRunState,
  stopRun,
  summarizeSeries,
  unsentRecords,
} from '../../src/bench/index.js';
import { recordFor } from './fake-record.js';

/**
 * A complete record for scenario `index`.
 *
 * @param index - Scenario index.
 * @returns The record.
 */
const rec = (index: number): RenderBenchRecord => recordFor(index);

describe('bench run state', () => {
  it('starts a run on the first scenario under the game’s storage prefix', () => {
    const state = createRunState('rb-x', 5, 2, TV_BENCH_TIMING);
    expect(BENCH_STATE_KEY).toBe('shmup-cup:render-bench');
    expect(state).toMatchObject({
      version: BENCH_STATE_VERSION,
      session: 'rb-x',
      running: true,
      single: false,
      cursor: 0,
      seq: 0,
      webGLVersion: 2,
      records: [],
      sent: [],
      lastError: null,
    });
  });

  it('round-trips through storage and ignores what it cannot use', () => {
    let state = createRunState('rb-x', 5, 1, TV_BENCH_TIMING);
    state = recordResult(state, rec(0));
    expect(parseRunState(serializeRunState(state))).toEqual(state);
    expect(parseRunState(null)).toBeNull();
    expect(parseRunState('')).toBeNull();
    expect(parseRunState('{nope')).toBeNull();
    expect(parseRunState('[]')).toBeNull();
    expect(parseRunState(JSON.stringify({ ...state, version: 99 }))).toBeNull();
    expect(parseRunState(JSON.stringify({ ...state, timing: null }))).toBeNull();
    // Junk records and sent entries are dropped, a cursor out of range is clamped.
    const messy = parseRunState(
      JSON.stringify({
        ...state,
        cursor: 99,
        // A record the results page could not draw (no timings) is dropped like junk.
        records: [null, 3, { scenario: '384x216-filter', index: 1 }, rec(1)],
        sent: ['x', 1],
      }),
    );
    expect(messy?.cursor).toBe(BENCH_SCENARIOS.length);
    expect(messy?.running).toBe(false);
    expect(messy?.records).toEqual([rec(1)]);
    expect(messy?.sent).toEqual([1]);
  });

  it('works through the matrix one record at a time and stops at its end', () => {
    let state = createRunState('rb-x', 5, 1, TV_BENCH_TIMING);
    for (let i = 0; i < BENCH_SCENARIOS.length; i++) {
      expect(state.running).toBe(true);
      expect(state.cursor).toBe(i);
      state = recordResult(state, rec(i));
    }
    expect(state.running).toBe(false);
    expect(state.cursor).toBe(BENCH_SCENARIOS.length);
    expect(state.records.map((r) => r.index)).toEqual(BENCH_SCENARIOS.map((s) => s.index));
  });

  it('re-runs the current scenario during a run (Red) and carries on afterwards', () => {
    let state = recordResult(createRunState('rb-x', 5, 1, TV_BENCH_TIMING), rec(0));
    state = rerunScenario(state);
    expect([state.running, state.single, state.cursor]).toEqual([true, false, 1]);
    state = recordResult(state, rec(1));
    expect([state.running, state.cursor]).toEqual([true, 2]);
  });

  it('re-runs only the last scenario from the results page, replacing its record', () => {
    let state = createRunState('rb-x', 5, 1, TV_BENCH_TIMING);
    for (let i = 0; i < BENCH_SCENARIOS.length; i++) state = recordResult(state, rec(i));
    state = markSent(state, [17]);
    state = rerunScenario(state);
    expect([state.running, state.single, state.cursor]).toEqual([true, true, 17]);
    state = recordResult(state, { ...rec(17), frames: 7 });
    expect([state.running, state.single, state.cursor]).toEqual([false, false, 18]);
    expect(state.records).toHaveLength(18);
    expect(state.records[17].frames).toBe(7);
    // The new record is not acknowledged yet.
    expect(unsentRecords(state).map((r) => r.index)).toContain(17);
  });

  it('stops where it is on Back or an error, keeping the results so far', () => {
    let state = recordResult(createRunState('rb-x', 5, 1, TV_BENCH_TIMING), rec(0));
    state = stopRun(state, 'Error: boom');
    expect([state.running, state.cursor, state.lastError]).toEqual([false, 1, 'Error: boom']);
    expect(state.records).toHaveLength(1);
    // A re-run of a stopped run is the last measured scenario only.
    const again = rerunScenario(state);
    expect([again.cursor, again.single, again.lastError]).toEqual([0, true, null]);
  });

  it('numbers payloads and remembers which records the log server acknowledged', () => {
    let state = createRunState('rb-x', 5, 1, TV_BENCH_TIMING);
    state = recordResult(recordResult(state, rec(0)), rec(1));
    state = nextSeq(nextSeq(state));
    expect(state.seq).toBe(2);
    state = markSent(state, [1, 1]);
    expect(state.sent).toEqual([1]);
    expect(unsentRecords(state).map((r) => r.index)).toEqual([0]);
    state = markSent(state, [0]);
    expect(unsentRecords(state)).toEqual([]);
  });
});

describe('bench sampler', () => {
  it('summarizes a series as [min, p50, p95, max] with the telemetry’s nearest-rank rule', () => {
    const values = new Float64Array(100);
    for (let i = 0; i < 100; i++) values[i] = 100 - i;
    expect(summarizeSeries(values, 100)).toEqual([1, 51, 95, 100]);
    expect(summarizeSeries(Float64Array.of(3, 1, 2), 3)).toEqual([1, 2, 3, 3]);
    expect(summarizeSeries(new Float64Array(4), 0)).toEqual([0, 0, 0, 0]);
    expect(summarizeSeries(Float64Array.of(1.23456), 1)).toEqual([1.235, 1.235, 1.235, 1.235]);
  });

  it('rounds without ever giving -0 or a non-finite number', () => {
    expect(Object.is(roundTo(-0.0001, 3), 0)).toBe(true);
    expect(roundTo(Number.NaN, 3)).toBe(0);
    expect(roundTo(2.3456, 2)).toBe(2.35);
  });

  it('drops values beyond a series’ capacity', () => {
    const series = new BenchSeries(2);
    series.push(1);
    series.push(2);
    series.push(3);
    expect(series.count).toBe(2);
    expect(series.summary()).toEqual([1, 2, 2, 2]);
  });

  it('counts rAF buckets, ticks per frame and the two-tick share of the free-running frames', () => {
    const sampler = new BenchSampler();
    sampler.free(1, 0, 0); // first frame: no delta yet
    sampler.free(1, 16.7, 1);
    sampler.free(1, 16.6, 1);
    sampler.free(2, 33.4, 2);
    sampler.free(2, 50, 5);
    sampler.synced(4);
    expect(sampler.frames).toBe(5);
    expect(sampler.frame.count).toBe(4);
    expect(Array.from(sampler.raf)).toEqual([0, 0, 2, 0, 0, 0, 0, 2]);
    expect(Array.from(sampler.ticks)).toEqual([1, 2, 1, 1]);
    expect(sampler.twoTickShare()).toBe(0.4);
    expect(sampler.sync.summary()).toEqual([4, 4, 4, 4]);
    expect(new BenchSampler().twoTickShare()).toBe(0);
  });
});
