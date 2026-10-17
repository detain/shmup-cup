/**
 * The TV render bench's on-screen results table (plan R0-02 acceptance: "the on-screen results
 * table is unit-tested against a fake result"): the fixed-width lines, the columns read against the
 * session's own 384×216 row, the results page around them, and the draw-list writer the page draws
 * them with.
 */
import { DrawOp, createDrawList } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  ERROR_COLOR,
  HEADER_COLOR,
  ROW_COLOR,
  TV_BENCH_TIMING,
  baselineOf,
  benchPageLines,
  createRunState,
  drawBenchLines,
  formatResultRow,
  formatResultsHeader,
  formatResultsTable,
  lateShare,
  recordResult,
  stopRun,
  type BenchPageInput,
} from '../../src/bench/index.js';
import { fakeRecord } from './fake-record.js';

/** The 640×360 busy record of the same fake session. */
const V2_BUSY = fakeRecord({
  scenario: '640x360-busy',
  index: 6,
  size: '640x360',
  width: 640,
  height: 360,
  density: 1.5,
  scale: 3,
  renderMs: [1.5, 3, 3.75, 7],
  syncedMs: [3, 4.1, 5, 10],
  twoTickShare: 0.035,
  drawCalls: 13,
  renderTargetBytes: 0,
  textureBytes: 2048 * 1024 * 4,
  heapMeasured: false,
  heapStartBytes: 0,
  heapEndBytes: 0,
  heapDeltaBytes: 0,
});

describe('bench results table', () => {
  it('has a fixed-width header that fits the 640x360 results page (106 columns)', () => {
    const header = formatResultsHeader();
    expect(header).toBe(
      'SCENARIO          GL REND95 SYNC50 SYNC95 xBASE 2TICK%   D2T RAF21% DRAW  RT_KB TEX_KB  HEAPKB',
    );
    expect(header.length).toBeLessThanOrEqual(106);
  });

  it('formats the baseline row against itself', () => {
    const base = fakeRecord();
    expect(formatResultRow(base, base)).toBe(
      '384x216 busy       1   2.50   3.25   4.00 1.00x   1.0%   0.0   5.0%   12      0   4096     +12',
    );
  });

  it('reads a v2 row against the same variant at 384x216: ratio, points, missing heap', () => {
    const base = fakeRecord();
    expect(formatResultRow(V2_BUSY, base)).toBe(
      '640x360 busy       1   3.75   4.10   5.00 1.25x   3.5%  +2.5   5.0%   13      0   8192       -',
    );
    expect(formatResultRow(V2_BUSY, base).length).toBe(formatResultsHeader().length);
  });

  it('prints "-" without a baseline, and a negative point delta with its sign', () => {
    const lonely = fakeRecord({ scenario: '960x540-mode7', size: '960x540', variant: 'mode7' });
    const row = formatResultRow(lonely, null);
    // xBASE starts after SCENARIO, GL, REND95, SYNC50 and SYNC95; D2T after xBASE and 2TICK%.
    const xBase = 17 + 3 + 7 + 7 + 7;
    expect(row.slice(xBase, xBase + 6)).toBe('     -');
    expect(row.slice(xBase + 6 + 7, xBase + 6 + 7 + 6)).toBe('     -');
    const better = fakeRecord({ twoTickShare: 0.002, size: '640x360', index: 6 });
    expect(formatResultRow(better, fakeRecord())).toContain('  -0.8');
  });

  it('finds the baseline by variant and WebGL version only at 384x216', () => {
    const base = fakeRecord();
    const gl2 = fakeRecord({ webGLVersion: 2 });
    const records = [V2_BUSY, gl2, base];
    expect(baselineOf(V2_BUSY, records)).toBe(base);
    expect(baselineOf({ ...V2_BUSY, webGLVersion: 2 }, records)).toBe(gl2);
    expect(baselineOf({ ...V2_BUSY, variant: 'mode7' }, records)).toBeNull();
  });

  it('counts the frames that came 21 ms or later', () => {
    expect(lateShare(fakeRecord())).toBeCloseTo(0.05, 9);
    expect(lateShare(fakeRecord({ raf: [0, 0, 0, 0, 0, 0, 0, 0] }))).toBe(0);
  });

  it('lists the header and one line per record, in matrix order', () => {
    const lines = formatResultsTable([V2_BUSY, fakeRecord()]);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(formatResultsHeader());
    expect(lines[1].startsWith('384x216 busy')).toBe(true);
    expect(lines[2].startsWith('640x360 busy')).toBe(true);
    expect(lines[2]).toContain('1.25x');
  });
});

describe('bench results page', () => {
  /**
   * The page's input with overrides.
   *
   * @param over - What differs.
   * @returns The input.
   */
  const input = (over: Partial<BenchPageInput> = {}): BenchPageInput => ({
    state: null,
    buildId: 'abc1234',
    host: 'tizen',
    webGLVersion: 1,
    display: '1920x1080',
    endpoint: null,
    status: '',
    scenarios: 18,
    timing: TV_BENCH_TIMING,
    ...over,
  });

  it('says how to start and where the results go before the first run', () => {
    const lines = benchPageLines(input());
    expect(lines[0]).toEqual({
      text: 'SHMUP CUP TV RENDER BENCH (R0-02)  build abc1234  host tizen  GL 1  display 1920x1080',
      color: HEADER_COLOR,
    });
    expect(lines[1].text).toBe(
      'ENTER run the matrix: 18 scenarios, ~10 min (10 s warm-up, 14 s measured, 6 s synced each)',
    );
    expect(lines[3].text).toBe('LOG off (build with VITE_REPORT_URL)');
    expect(lines[lines.length - 1]).toEqual({ text: 'No results yet.', color: ROW_COLOR });
    for (const line of lines) expect(line.text.length).toBeLessThanOrEqual(106);
    // The bitmap font has the printable ASCII glyphs only.
    for (const line of lines) expect(line.text).toMatch(/^[ -~]*$/);
  });

  it('shows the run, its table and the error that stopped it', () => {
    let state = createRunState('rb-test-0001', 1, 1, TV_BENCH_TIMING);
    state = recordResult(state, fakeRecord());
    state = recordResult(state, V2_BUSY);
    state = stopRun(state, 'Error: no WebGL');
    const lines = benchPageLines(
      input({ state, endpoint: 'http://10.0.0.2:8787/report', status: 'all results acknowledged' }),
    );
    const texts = lines.map((line) => line.text);
    expect(texts[3]).toBe('LOG http://10.0.0.2:8787/report  all results acknowledged');
    expect(texts).toContain('RUN rb-test-0001  2/18 measured  sent 0/2');
    expect(texts).toContain(formatResultsHeader());
    expect(texts.filter((text) => text.startsWith('640x360 busy'))).toHaveLength(1);
    expect(lines[lines.length - 1]).toEqual({ text: 'ERROR Error: no WebGL', color: ERROR_COLOR });
  });

  it('writes one string slot and one text command per line, up to the slots it has', () => {
    const list = createDrawList(64, 4);
    const lines = benchPageLines(input());
    expect(drawBenchLines(list, lines, 4, 4, 10)).toBe(4);
    expect(list.count).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(list.op[i]).toBe(DrawOp.Text);
      expect(list.ref[i]).toBe(i);
      expect(list.y[i]).toBe(4 + i * 10);
      expect(list.color[i]).toBe(lines[i].color);
      expect(list.strings[i]).toBe(lines[i].text);
    }
    // Drawing again replaces the page instead of appending to it.
    drawBenchLines(list, lines.slice(0, 2), 0, 0, 10);
    expect(list.count).toBe(2);
  });
});
