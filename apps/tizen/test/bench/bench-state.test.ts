/**
 * The TV render bench's persisted run state and its sampler (plan R0-02): one scenario per page
 * load, the cursor and the records in `localStorage` between reloads, the Red re-run, the
 * acknowledged records — and the per-frame statistics the records are folded from. Since R1-05 B4
 * a run appends the decode scenario, whose record the state keeps beside the render records;
 * since R3-04.M4a the stand-in draw follows, recorded like a render scenario; since R2 TL-3 the
 * run closes with the rewind page, whose record the state keeps and never posts.
 */
import type { RenderBenchRecord } from '@shmup/shell';
import { describe, expect, it } from 'vitest';
import {
  BENCH_RUN_LENGTH,
  BENCH_SCENARIOS,
  BENCH_STATE_KEY,
  DECODE_SCENARIO_INDEX,
  STANDIN_SCENARIO_INDEX,
  STANDIN_SVG_SCENARIO_INDEX,
  BENCH_STATE_VERSION,
  BenchSampler,
  BenchSeries,
  TV_BENCH_TIMING,
  createRunState,
  decodeUnsent,
  isDecodeRecord,
  markSent,
  nextSeq,
  parseRunState,
  recordDecode,
  recordResult,
  recordRewind,
  rerunScenario,
  roundTo,
  serializeRunState,
  skipPlannedScenarios,
  stopRun,
  summarizeSeries,
  unsentRecords,
} from '../../src/bench/index.js';
import { REWIND_SCENARIO_INDEX } from '../../src/bench/index.js';
import {
  fakeDecode,
  fakeRewind,
  fakeStandinRecord,
  fakeStandinSvgRecord,
  recordFor,
} from './fake-record.js';

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
      decode: null,
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
        cursor: 999,
        // A record the results page could not draw (no timings) is dropped like junk.
        records: [null, 3, { scenario: '384x216-filter', index: 1 }, rec(1)],
        sent: ['x', 1],
      }),
    );
    expect(messy?.cursor).toBe(BENCH_RUN_LENGTH);
    expect(messy?.running).toBe(false);
    expect(messy?.records).toEqual([rec(1)]);
    expect(messy?.sent).toEqual([1]);
  });

  it('works through the matrix, then decode, the two stand-in loads and the rewind page, and stops', () => {
    let state = createRunState('rb-x', 5, 1, TV_BENCH_TIMING);
    for (let i = 0; i < BENCH_SCENARIOS.length; i++) {
      expect(state.running).toBe(true);
      expect(state.cursor).toBe(i);
      state = recordResult(state, rec(i));
    }
    // The decode scenario follows the matrix (plan R1-05 B4).
    expect(state.running).toBe(true);
    expect(state.cursor).toBe(DECODE_SCENARIO_INDEX);
    expect(state.records.map((r) => r.index)).toEqual(BENCH_SCENARIOS.map((s) => s.index));
    state = recordDecode(state, fakeDecode());
    // The decode scenario hands on to the stand-in load (plan R3-04.M4a): the run goes on.
    expect(state.running).toBe(true);
    expect(state.cursor).toBe(STANDIN_SCENARIO_INDEX);
    expect(state.decode).toEqual(fakeDecode());
    expect(state.records).toHaveLength(BENCH_SCENARIOS.length);
    state = recordResult(state, fakeStandinRecord());
    // The stand-in hands on to the SVG arm's stand-in slot, and the rewind page closes the run
    // (plans R3-04.M4a, R-SVG WO-2, R2 TL-3): `state.ts` walks the arm's slot on both arms, and which
    // builds launch a page for it is `run.ts`'s planned skip.
    expect(state.running).toBe(true);
    expect(state.cursor).toBe(STANDIN_SVG_SCENARIO_INDEX);
    state = recordResult(state, fakeStandinSvgRecord());
    expect(state.running).toBe(true);
    expect(state.cursor).toBe(REWIND_SCENARIO_INDEX);
    expect(state.records).toHaveLength(BENCH_SCENARIOS.length + 2);
    state = recordRewind(state, fakeRewind());
    expect(state.running).toBe(false);
    expect(state.cursor).toBe(BENCH_RUN_LENGTH);
    expect(state.rewind).toEqual(fakeRewind());
  });

  it('re-runs the current scenario during a run (Red) and carries on afterwards', () => {
    let state = recordResult(createRunState('rb-x', 5, 1, TV_BENCH_TIMING), rec(0));
    state = rerunScenario(state);
    expect([state.running, state.single, state.cursor]).toEqual([true, false, 1]);
    state = recordResult(state, rec(1));
    expect([state.running, state.cursor]).toEqual([true, 2]);
  });

  it('re-runs only the last scenario from the results page, replacing its record', () => {
    // A run stored by a bench from before the decode scenario: stopped after the matrix.
    let state = createRunState('rb-x', 5, 1, TV_BENCH_TIMING);
    for (let i = 0; i < BENCH_SCENARIOS.length; i++) state = recordResult(state, rec(i));
    const { decode: _decode, ...old } = { ...state, running: false };
    state = parseRunState(JSON.stringify(old)) ?? state;
    expect([state.running, state.cursor, state.decode]).toEqual([
      false,
      DECODE_SCENARIO_INDEX,
      null,
    ]);
    state = markSent(state, [BENCH_SCENARIOS.length - 1]);
    state = rerunScenario(state);
    expect([state.running, state.single, state.cursor]).toEqual([
      true,
      true,
      BENCH_SCENARIOS.length - 1,
    ]);
    state = recordResult(state, { ...rec(BENCH_SCENARIOS.length - 1), frames: 7 });
    expect([state.running, state.single, state.cursor]).toEqual([
      false,
      false,
      DECODE_SCENARIO_INDEX,
    ]);
    expect(state.records).toHaveLength(BENCH_SCENARIOS.length);
    expect(state.records[BENCH_SCENARIOS.length - 1].frames).toBe(7);
    // The new record is not acknowledged yet.
    expect(unsentRecords(state).map((r) => r.index)).toContain(BENCH_SCENARIOS.length - 1);
  });

  it('re-runs the last page load from the results page after a whole run (R3-04.M4a, R2 TL-3)', () => {
    let state = createRunState('rb-x', 5, 1, TV_BENCH_TIMING);
    for (let i = 0; i < BENCH_SCENARIOS.length; i++) state = recordResult(state, rec(i));
    state = markSent(recordDecode(state, fakeDecode()), [DECODE_SCENARIO_INDEX]);
    expect(decodeUnsent(state)).toBe(false);
    // The run is not over: the stand-in load, the SVG arm's stand-in slot and the rewind page
    // follow (plan R-SVG WO-2 — the arm's slot sits before the page that closes the run, so a Red at
    // the results page always re-measures a row a PNG build has too).
    expect([state.running, state.cursor]).toEqual([true, STANDIN_SCENARIO_INDEX]);
    state = recordResult(state, fakeStandinRecord());
    state = markSent(state, [STANDIN_SCENARIO_INDEX]);
    expect([state.running, state.cursor]).toEqual([true, STANDIN_SVG_SCENARIO_INDEX]);
    state = recordResult(state, fakeStandinSvgRecord());
    state = markSent(state, [STANDIN_SVG_SCENARIO_INDEX]);
    expect([state.running, state.cursor]).toEqual([true, REWIND_SCENARIO_INDEX]);
    state = recordRewind(state, fakeRewind());
    expect([state.running, state.cursor]).toEqual([false, BENCH_RUN_LENGTH]);
    state = rerunScenario(state);
    expect([state.running, state.single, state.cursor]).toEqual([
      true,
      true,
      REWIND_SCENARIO_INDEX,
    ]);
    state = recordRewind(state, fakeRewind({ stepsPerSecond: 999 }));
    expect([state.running, state.single, state.cursor]).toEqual([false, false, BENCH_RUN_LENGTH]);
    expect(state.rewind?.stepsPerSecond).toBe(999);
    expect(state.records).toHaveLength(BENCH_SCENARIOS.length + 2);
    expect(state.records[BENCH_SCENARIOS.length].drawCalls).toBe(96);
    expect(state.records[BENCH_SCENARIOS.length + 1].drawCalls).toBe(96);
    // The rewind is never POSTed: nothing new joins the acknowledged set, the decode stays acked.
    expect(unsentRecords(state).map((r) => r.index)).not.toContain(REWIND_SCENARIO_INDEX);
    expect(decodeUnsent(state)).toBe(false);
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

  it('keeps the decode record through storage and drops one it could not show', () => {
    let state = createRunState('rb-x', 5, 1, TV_BENCH_TIMING);
    state = recordDecode(recordResult(state, rec(0)), fakeDecode());
    expect(parseRunState(serializeRunState(state))).toEqual(state);
    const text = (decode: unknown): string => JSON.stringify({ ...state, decode });
    expect(parseRunState(text(null))?.decode).toBeNull();
    expect(parseRunState(text({ scenario: 'decode' }))?.decode).toBeNull();
    const badPage = { ...fakeDecode().pages[0], decodeMs: [1, 2] };
    expect(parseRunState(text(fakeDecode({ pages: [badPage] })))?.decode).toBeNull();
    // A state from before the decode scenario has no field at all.
    const { decode: _decode, ...old } = state;
    expect(parseRunState(JSON.stringify(old))?.decode).toBeNull();
  });

  it('tells a decode record the results page can draw', () => {
    expect(isDecodeRecord(fakeDecode())).toBe(true);
    expect(isDecodeRecord(fakeDecode({ pages: [] }))).toBe(true);
    const unmeasured = { ...fakeDecode().pages[0], bitmapMs: null, bitmapUploadMs: null };
    expect(isDecodeRecord(fakeDecode({ pages: [unmeasured], error: 'Error: x' }))).toBe(true);
    expect(isDecodeRecord(null)).toBe(false);
    expect(isDecodeRecord({ ...fakeDecode(), pages: 'x' })).toBe(false);
    expect(isDecodeRecord({ ...fakeDecode(), error: 3 })).toBe(false);
    expect(isDecodeRecord(fakeDecode({ pages: [null as never] }))).toBe(false);
    const noBytes = { ...fakeDecode().pages[1], bytes: 'many' as unknown as number };
    expect(isDecodeRecord(fakeDecode({ pages: [noBytes] }))).toBe(false);
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
    // The decode record is acknowledged under its own index.
    expect(decodeUnsent(state)).toBe(false);
    state = recordDecode(state, fakeDecode());
    expect(decodeUnsent(state)).toBe(true);
    state = markSent(state, [DECODE_SCENARIO_INDEX]);
    expect(decodeUnsent(state)).toBe(false);
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

describe('bench run state: planned skips (a build output — src/bench/output.ts)', () => {
  /** Indexes 3 to 5 and the last render scenario are skipped. */
  const skipped = (index: number): boolean =>
    (index >= 3 && index <= 5) || index === DECODE_SCENARIO_INDEX - 1;
  const run = createRunState('rb-s', 1, 1, TV_BENCH_TIMING);

  it('leaves a run alone whose cursor scenario runs, or that is not running', () => {
    const at2 = { ...run, cursor: 2 };
    expect(skipPlannedScenarios(at2, skipped)).toBe(at2);
    const stopped = { ...run, cursor: 3, running: false };
    expect(skipPlannedScenarios(stopped, skipped)).toBe(stopped);
    expect(skipPlannedScenarios({ ...run, cursor: 3 }, () => false).cursor).toBe(3);
  });

  it('moves the cursor past every skipped scenario in a row, with no record and no error', () => {
    const next = skipPlannedScenarios({ ...run, cursor: 3, lastError: 'earlier' }, skipped);
    expect(next).toMatchObject({ cursor: 6, running: true, single: false, lastError: 'earlier' });
    expect(next.records).toEqual([]);
  });

  it('runs on into the decode scenario past a skipped last render scenario', () => {
    const next = skipPlannedScenarios({ ...run, cursor: DECODE_SCENARIO_INDEX - 1 }, skipped);
    expect(next).toMatchObject({ cursor: DECODE_SCENARIO_INDEX, running: true });
    // Since plan R-SVG WO-2 the page loads are asked about too — `run.ts` answers for them (the SVG
    // arm's stand-in slot is the row a PNG build passes over), and a run whose whole tail is a
    // planned skip ends at the run's length rather than stopping at the decode scenario.
    expect(
      skipPlannedScenarios({ ...run, cursor: DECODE_SCENARIO_INDEX }, () => true),
    ).toMatchObject({ cursor: BENCH_RUN_LENGTH, running: false });
    expect(
      skipPlannedScenarios(
        { ...run, cursor: DECODE_SCENARIO_INDEX },
        (index) => index !== STANDIN_SVG_SCENARIO_INDEX,
      ).cursor,
    ).toBe(STANDIN_SVG_SCENARIO_INDEX);
  });

  it('stops a Red re-run of a skipped scenario instead of running the rest of the matrix', () => {
    const next = skipPlannedScenarios({ ...run, cursor: 4, single: true }, skipped);
    expect(next).toMatchObject({ cursor: 5, running: false, single: false });
  });
});

describe('bench run state — skip ledger fields (plan v20x BENCSKIP)', () => {
  it('keeps the four-argument start at row zero with no skipped rows', () => {
    const full = createRunState('rb-full', 7, 1, TV_BENCH_TIMING);
    expect(full).toMatchObject({ cursor: 0, skippedAtStart: 0 });
  });

  it('starts a planned skip run on its first pending row', () => {
    const skip = createRunState('rb-skip', 7, 1, TV_BENCH_TIMING, 174, 174);
    expect(skip).toMatchObject({ running: true, cursor: 174, skippedAtStart: 174 });
    // The skip plan's first pending row is where the run works on from.
    const state = recordResult(skip, rec(174));
    expect(state).toMatchObject({ cursor: 175, skippedAtStart: 174, running: true });
    // Red on a stopped skip run re-runs its last measured row, note preserved (plan v20x
    // BENCSKIP: Red on a *running* state just resumes — as it always did).
    expect(rerunScenario(stopRun(state, null))).toMatchObject({
      cursor: 174,
      single: true,
      skippedAtStart: 174,
    });
  });

  it('reads a stored state without the field as a full run', () => {
    const state = createRunState('rb-old', 7, 1, TV_BENCH_TIMING);
    const raw = JSON.parse(serializeRunState(state)) as Record<string, unknown>;
    delete raw.skippedAtStart;
    expect(parseRunState(JSON.stringify(raw))).toMatchObject({ skippedAtStart: 0, cursor: 0 });
    const bad = { ...raw, skippedAtStart: -4 };
    expect(parseRunState(JSON.stringify(bad))?.skippedAtStart).toBe(0);
    const fractional = { ...raw, skippedAtStart: 174.9 };
    expect(parseRunState(JSON.stringify(fractional))?.skippedAtStart).toBe(174);
  });
});
