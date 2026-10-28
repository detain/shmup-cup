/**
 * The TV render bench's on-screen results table (plan R0-02 acceptance: "the on-screen results
 * table is unit-tested against a fake result"): the fixed-width lines, the columns read against the
 * session's own 384×216 row, the results page around them, and the draw-list writer the page draws
 * them with — and the decode scenario's table below it (plan R1-05 B4).
 */
import { DrawOp, createDrawList } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  BENCH_SCENARIOS,
  DECODE_SCENARIO_INDEX,
  ERROR_COLOR,
  HEADER_COLOR,
  ROW_COLOR,
  TV_BENCH_TIMING,
  NOTE_COLOR,
  baselineOf,
  benchSkippedScenarios,
  benchPageLines,
  benchResultPages,
  createRunState,
  drawBenchLines,
  formatDecodeHeader,
  formatDecodeRow,
  formatDecodeTable,
  formatOutputLines,
  formatResultRow,
  formatResultsHeader,
  formatResultsTable,
  lateShare,
  markSent,
  parseBenchOutput,
  recordDecode,
  recordResult,
  stopRun,
  type BenchPageInput,
} from '../../src/bench/index.js';
import { fakeDecode, fakeRecord, recordFor } from './fake-record.js';

/** The 640×360 busy record of the same fake session. */
const V2_BUSY = fakeRecord({
  scenario: '640x360-busy',
  index: 18,
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
      'SCENARIO                  GL REND95 SYNC50 SYNC95 xBASE 2TICK%   D2T RAF21% DRAW  RT_KB TEX_KB  HEAPKB',
    );
    expect(header.length).toBeLessThanOrEqual(106);
  });

  it('formats the baseline row against itself', () => {
    const base = fakeRecord();
    expect(formatResultRow(base, base)).toBe(
      '384x216 busy               1   2.50   3.25   4.00 1.00x   1.0%   0.0   5.0%   12      0   4096     +12',
    );
  });

  it('reads a v2 row against the same variant at 384x216: ratio, points, missing heap', () => {
    const base = fakeRecord();
    expect(formatResultRow(V2_BUSY, base)).toBe(
      '640x360 busy               1   3.75   4.10   5.00 1.25x   3.5%  +2.5   5.0%   13      0   8192       -',
    );
    expect(formatResultRow(V2_BUSY, base).length).toBe(formatResultsHeader().length);
  });

  it('prints "-" without a baseline, and a negative point delta with its sign', () => {
    const lonely = fakeRecord({ scenario: '960x540-mode7', size: '960x540', variant: 'mode7' });
    const row = formatResultRow(lonely, null);
    // xBASE starts after SCENARIO, GL, REND95, SYNC50 and SYNC95; D2T after xBASE and 2TICK%.
    const xBase = 25 + 3 + 7 + 7 + 7;
    expect(row.slice(xBase, xBase + 6)).toBe('     -');
    expect(row.slice(xBase + 6 + 7, xBase + 6 + 7 + 6)).toBe('     -');
    const better = fakeRecord({ twoTickShare: 0.002, size: '640x360', index: 18 });
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

describe('bench decode table (plan R1-05 B4)', () => {
  it('has a fixed-width header that fits the 640x360 results page', () => {
    expect(formatDecodeHeader()).toBe(
      'PAGE                 SIZE  ENC  FILE  FETCH  DEC50  DEC95  UPL50  UPL95  TOT50  TOT95' +
        '  FIRST  BMP50  BMPUP',
    );
    expect(formatDecodeHeader().length).toBeLessThanOrEqual(106);
  });

  it('prints a page’s medians and p95s from file to GPU, column for column', () => {
    const [standin, common, zone] = fakeDecode().pages;
    expect(formatDecodeRow(standin)).toBe(
      'standin-zone-a  2048x1024 PNG8   528   24.0  420.0  500.0  110.0  140.0  554.0  670.0' +
        '  696.0  380.0   22.0',
    );
    expect(formatDecodeRow(common)).toContain(' RGBA ');
    expect(formatDecodeRow(zone).length).toBe(formatDecodeHeader().length);
  });

  it('prints "-" for a stage that was not measured', () => {
    const page = {
      ...fakeDecode().pages[2],
      encoding: 'type 2',
      fetchMs: null,
      totalMs: null,
      bitmapMs: null,
      bitmapUploadMs: null,
    };
    const row = formatDecodeRow(page);
    expect(row).toContain('   ? ');
    const fetch = 16 + 9 + 5 + 6;
    expect(row.slice(fetch, fetch + 7)).toBe('      -');
    expect(row.endsWith('      -      -')).toBe(true);
  });

  it('titles the table, then its rows, then what went wrong', () => {
    const page = { ...fakeDecode().pages[1], error: 'bitmap: no createImageBitmap' };
    const lines = formatDecodeTable(fakeDecode({ pages: [page], error: 'Error: lost context' }));
    expect(lines.map((line) => line.color)).toEqual([
      NOTE_COLOR,
      HEADER_COLOR,
      ROW_COLOR,
      ERROR_COLOR,
      ERROR_COLOR,
    ]);
    expect(lines[0].text).toBe(
      'DECODE (R1-05) 8 reps GL1  file -> GPU ms: XHR fetch, Image decode, upload + gl.finish',
    );
    expect(lines[3].text).toBe('ERROR decode: Error: lost context');
    expect(lines[4].text).toBe('NOTE common: bitmap: no createImageBitmap');
    for (const line of lines) expect(line.text).toMatch(/^[ -~]*$/);
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
    scenarios: BENCH_SCENARIOS.length,
    timing: TV_BENCH_TIMING,
    ...over,
  });

  it('lists a build output and the sizes it skips under the head (VITE_BENCH_OUTPUT)', () => {
    const skipped = benchSkippedScenarios(parseBenchOutput('960x540'));
    const lines = benchPageLines(
      input({ output: '960x540', skipped, scenarios: BENCH_SCENARIOS.length - skipped.length }),
    );
    expect(lines[0].text).toBe(
      'SHMUP CUP TV RENDER BENCH (R0-02)  build abc1234  host tizen  GL 1  display 1920x1080' +
        '  output 960x540',
    );
    expect(lines[1].text).toMatch(/^ENTER run: 104 scenarios \+ decode/);
    const out = formatOutputLines('960x540', skipped);
    expect(out.map((line) => line.text)).toEqual([
      "OUTPUT backbuffer 960x540 ('fit' upscale), 86 scenario(s) skipped: frame larger than the output",
      'SKIPPED 1024x576 1024x576n 800x600 800x600n 1024x600 1024x600n 960x640 960x640n 1280x720n' +
        ' 1024x768n',
      '        1280x960n 1920x1080n 800x600-fit 800x600-stretch 1280x720n-interp 1920x1080n-interp',
      '        1920x1080n-out720 1280x720n-video 1920x1080n-video',
    ]);
    expect(out.every((line) => line.color === NOTE_COLOR && line.text.length <= 100)).toBe(true);
    expect(lines.slice(4, 4 + out.length)).toEqual(out);
    expect(lines[4 + out.length].text).toBe('');
    // Without an output the head is as it always was.
    expect(
      benchPageLines(input())
        .map((line) => line.text)
        .join('\n'),
    ).not.toContain('OUTPUT');
  });

  it('says how to start and where the results go before the first run', () => {
    const lines = benchPageLines(input());
    expect(lines[0]).toEqual({
      text: 'SHMUP CUP TV RENDER BENCH (R0-02)  build abc1234  host tizen  GL 1  display 1920x1080',
      color: HEADER_COLOR,
    });
    expect(lines[1].text).toBe(
      'ENTER run: 190 scenarios + decode + stand-in + rewind, ~101 min (10 s warm, 14 s measure, ' +
        '6 s sync)',
    );
    expect(lines[2]).toEqual({
      text: 'LEFT/RIGHT page    RED re-run the last scenario    BACK exit (stops a run)',
      color: NOTE_COLOR,
    });
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
    expect(texts).toContain('RUN rb-test-0001  2/191 measured  sent 0/2  PAGE 1/1');
    expect(texts).toContain(formatResultsHeader());
    expect(texts.filter((text) => text.startsWith('640x360 busy'))).toHaveLength(1);
    expect(lines[lines.length - 1]).toEqual({ text: 'ERROR Error: no WebGL', color: ERROR_COLOR });
  });

  it('shows the decode table below the matrix once the decode scenario ran (R1-05 B4)', () => {
    let state = createRunState('rb-test-0002', 1, 1, TV_BENCH_TIMING);
    state = recordDecode(recordResult(state, fakeRecord()), fakeDecode());
    let texts = benchPageLines(input({ state })).map((line) => line.text);
    expect(texts).toContain(
      'RUN rb-test-0002  1/191 measured  sent 0/1  decode not sent  (still running)  PAGE 1/1',
    );
    const header = texts.indexOf(formatDecodeHeader());
    expect(header).toBeGreaterThan(texts.indexOf(formatResultsHeader()));
    expect(texts[header + 1].startsWith('standin-zone-a')).toBe(true);
    expect(texts[header + 3].startsWith('zone-a')).toBe(true);
    // Acknowledged: the render records count apart from the decode record.
    state = markSent(state, [0, DECODE_SCENARIO_INDEX]);
    texts = benchPageLines(input({ state })).map((line) => line.text);
    expect(texts).toContain(
      'RUN rb-test-0002  1/191 measured  sent 1/1  decode sent  (still running)  PAGE 1/1',
    );
    // A decode record alone (a re-run of a run whose records were cleared) is still a result.
    const alone = recordDecode(createRunState('rb-test-0003', 1, 1, TV_BENCH_TIMING), fakeDecode());
    expect(benchPageLines(input({ state: alone })).map((line) => line.text)).not.toContain(
      'No results yet.',
    );
  });

  describe('paging (the resolution sweep’s 190 rows)', () => {
    /** A whole run: every scenario of the matrix measured, then the decode scenario. */
    const whole = (() => {
      let state = createRunState('rb-test-0004', 1, 1, TV_BENCH_TIMING);
      for (const scenario of BENCH_SCENARIOS)
        state = recordResult(state, recordFor(scenario.index));
      return recordDecode(state, fakeDecode());
    })();
    const rows = formatResultsTable(whole.records).slice(1);

    it('splits the rows over pages of at most maxLines lines, in matrix order', () => {
      // 35 lines: the 5-line head, the RUN line, the table header and the error line leave 27 rows.
      const pages = benchResultPages(input({ state: whole, maxLines: 35 }));
      expect(pages).toBe(Math.ceil(190 / 27) + 1);
      const shown: string[] = [];
      for (let page = 0; page < pages - 1; page++) {
        const lines = benchPageLines(input({ state: whole, maxLines: 35, page }));
        expect(lines.length).toBeLessThanOrEqual(35);
        expect(lines[5].text).toContain(`  PAGE ${page + 1}/${pages}`);
        expect(lines[6]).toEqual({ text: formatResultsHeader(), color: HEADER_COLOR });
        const pageRows = lines.slice(7).filter((line) => line.color === ROW_COLOR);
        expect(pageRows.length).toBe(page < pages - 2 ? 27 : 190 - 27 * (pages - 2));
        for (const line of pageRows) shown.push(line.text);
        expect(lines.map((line) => line.text)).not.toContain(formatDecodeHeader());
      }
      // Every row exactly once, across the pages.
      expect(shown).toEqual(rows);
      expect(rows[0].startsWith('384x216 busy')).toBe(true);
      expect(rows[171].startsWith('640x360 worst-out540')).toBe(true);
      expect(rows[173].startsWith('640x360 worst-video')).toBe(true);
    });

    it('puts the decode table on the last page, and clamps a page out of range', () => {
      const pages = benchResultPages(input({ state: whole, maxLines: 35 }));
      const last = benchPageLines(input({ state: whole, maxLines: 35, page: pages - 1 }));
      const texts = last.map((line) => line.text);
      expect(last.length).toBeLessThanOrEqual(35);
      expect(texts[5]).toContain(`  PAGE ${pages}/${pages}`);
      expect(texts).toContain(formatDecodeHeader());
      expect(texts).not.toContain(formatResultsHeader());
      expect(texts.some((text) => text.startsWith('standin-zone-a'))).toBe(true);
      expect(benchPageLines(input({ state: whole, maxLines: 35, page: 99 }))).toEqual(last);
      expect(benchPageLines(input({ state: whole, maxLines: 35, page: -3 }))).toEqual(
        benchPageLines(input({ state: whole, maxLines: 35 })),
      );
      // Without the decode record the table's pages are all there is.
      const { decode: _decode, ...rest } = whole;
      expect(benchResultPages(input({ state: { ...rest, decode: null }, maxLines: 35 }))).toBe(
        pages - 1,
      );
    });

    it('never draws more than maxLines lines, the error included', () => {
      const failed = stopRun(whole, 'Error: lost context');
      for (const maxLines of [8, 20, 35, 48]) {
        const pages = benchResultPages(input({ state: failed, maxLines }));
        for (let page = 0; page < pages; page++) {
          const lines = benchPageLines(input({ state: failed, maxLines, page }));
          expect(lines.length).toBeLessThanOrEqual(maxLines);
        }
        // On a table page with room for a row the error line still fits below the rows (8 lines
        // leave none after the head, the RUN line and the header: the page is cut at the limit).
        const first = benchPageLines(input({ state: failed, maxLines }));
        expect(first[first.length - 1]).toEqual(
          maxLines >= 9
            ? { text: 'ERROR Error: lost context', color: ERROR_COLOR }
            : { text: rows[0], color: ROW_COLOR },
        );
      }
    });

    it('keeps everything on one page without a line limit', () => {
      expect(benchResultPages(input({ state: whole }))).toBe(1);
      const texts = benchPageLines(input({ state: whole, page: 3 })).map((line) => line.text);
      expect(texts.filter((text) => rows.indexOf(text) >= 0)).toHaveLength(190);
      expect(texts.indexOf(formatDecodeHeader())).toBeGreaterThan(
        texts.indexOf(formatResultsHeader()),
      );
      expect(benchResultPages(input())).toBe(1);
    });
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
