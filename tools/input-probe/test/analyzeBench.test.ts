/**
 * results/analyze-bench.mjs (plan R0-02 acceptance: "the analyzer prints a relative table from a recorded
 * fixture session"): a fixture TV render-bench session (`fixtures/bench-session.jsonl` — 18 scenarios, a Red
 * re-run, an older record re-sent at the end of the run) turns into the §12 tables, every row read against the
 * same variant at 384×216 in the same session, with plan §13's outcome applied to 640×360 and the 960×540 note
 * — and two sessions of the same set into the WebGL 1-vs-2 verdict. Since plan R1-05 (B4) a run ends with the
 * decode scenario (`fixtures/bench-decode.jsonl` — its payload alone): its table and R3-04's zone-load estimate,
 * and an older session without it still reads the same. Since `898021ee` campaigns are partitioned by
 * `env.buildId` first (the 2026-10-27 contamination law): the `output resolutions` fixtures pin both shapes —
 * three outputs as three builds (per-build headings, no pooling, a cross-output refusal) and the same three
 * outputs under one build (the pooled band and the cross-output table, exactly as they read before).
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import {
  ZONE_LOAD_TARGET_MS,
  analyzeBenchSession,
  benchPoolOf,
  analyzeBenchSessions,
  baselineFor,
  beatsReference,
  decodeSection,
  decodeZoneEstimate,
  expandSessionArgs,
  lateShare,
  loadCampaign,
  parseRow,
  poolNoise,
  quantile,
  readBenchSession,
  relativeTo,
  runStats,
  section13Outcome,
  sessionOutput,
  sizeOrder,
} from '../results/analyze-bench.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'test', 'fixtures', 'bench-session.jsonl');
const DECODE_FIXTURE = join(ROOT, 'test', 'fixtures', 'bench-decode.jsonl');
const tmp = mkdtempSync(join(tmpdir(), 'analyze-bench-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Writes a variant of the fixture session.
 *
 * @param name - File name.
 * @param edit - Rewrites each record.
 * @returns The path.
 */
function variantSession(name: string, edit: (r: Record<string, unknown>) => Record<string, unknown>): string {
  const lines = readFileSync(FIXTURE, 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const p = JSON.parse(line) as Record<string, unknown>;
      return JSON.stringify({ ...p, results: (p['results'] as Record<string, unknown>[]).map(edit) });
    });
  const file = join(tmp, name);
  writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

describe('readBenchSession', () => {
  it('keeps the latest record per scenario: a Red re-run wins, an older copy re-sent later does not', () => {
    const { payloads, records } = readBenchSession(FIXTURE);
    expect(payloads).toHaveLength(20);
    expect(records).toHaveLength(18);
    expect(records.map((r) => r.index)).toEqual([...Array(18).keys()]);
    const busy = records.find((r) => r.scenario === '640x360-busy');
    expect(busy?.twoTickShare).toBe(0.02);
    expect(busy?.syncedMs).toEqual([2.6, 3.7, 5, 11.25]);
  });
});

describe('relative figures', () => {
  const { records } = readBenchSession(FIXTURE);
  const busy = records.find((r) => r.scenario === '640x360-busy');
  const base = records.find((r) => r.scenario === '384x216-busy');

  it('reads a row against the same variant and WebGL version at 384x216', () => {
    expect(baselineFor(busy, records)).toBe(base);
    expect(baselineFor({ ...busy, variant: 'nope' }, records)).toBeNull();
    expect(baselineFor({ ...busy, webGLVersion: 2 }, records)).toBeNull();
    const rel = relativeTo(busy, base);
    expect(rel.syncRatio).toBeCloseTo(1.25, 9);
    expect(rel.renderRatio).toBeCloseTo(1.25, 9);
    expect(rel.twoTickPoints).toBeCloseTo(1.2, 9);
    expect(relativeTo(busy, null)).toEqual({ syncRatio: null, renderRatio: null, twoTickPoints: null });
  });

  it('counts the frames that came 21 ms or later', () => {
    expect(lateShare(base)).toBeCloseTo(97 / 830, 9);
    expect(lateShare({ raf: [0, 0] })).toBeNull();
    expect(lateShare({})).toBeNull();
  });

  it('applies plan §13 at 640x360', () => {
    expect(section13Outcome(busy, base).tier).toBe('planned');
    const tv = { ...busy, twoTickShare: base.twoTickShare + 0.05 };
    expect(section13Outcome(tv, base).tier).toBe('tv-profile');
    expect(section13Outcome({ ...busy, syncedMs: [0, 0, 10, 0] }, base).tier).toBe('tv-profile');
    expect(section13Outcome({ ...busy, syncedMs: [0, 0, 12.5, 0] }, base).tier).toBe('performance-step');
    expect(section13Outcome({ ...busy, twoTickShare: base.twoTickShare + 0.11 }, base).tier).toBe(
      'performance-step',
    );
    expect(section13Outcome(busy, null).tier).toBe('unknown');
  });
});

describe('analyzeBenchSession', () => {
  const report = analyzeBenchSession(FIXTURE);

  it('prints the session header and a table per internal size', () => {
    expect(report).toContain('# rb-mgabc12-k3f0 — TV render bench');
    expect(report).toContain('20 payload(s), 18 of 18 scenario(s) measured, run complete; from 10.0.0.8.');
    expect(report).toContain('Build `abc1234` · host tizen · display 1920×1080 @1 · WebGL 1');
    expect(report).toContain('## 384x216 (s = 1) — the baseline (v1 as it ships)');
    expect(report).toContain('## 640x360 (s = 1.5) — the v2 frame and density');
    expect(report).toContain('## 960x540 (s = 2.25) — the same field of view at 1.5× the density (for the record)');
  });

  it('prints each row relative to the same session’s 384x216 baseline', () => {
    const lines = report.split('\n');
    expect(lines).toContain(
      '| busy | 1 | 1.60 / 2.40 | 3.00 / 4.00 | 1.00× | 0.8 | 0.0 | 11.7 | 12 | 0 | 4096 (1) | 20 | 830 + 350 |',
    );
    expect(lines).toContain(
      '| busy | 1 | 2.00 / 3.00 | 3.70 / 5.00 | 1.25× | 2.0 | +1.2 | 11.7 | 12 | 0 | 8192 (1) | 20 | 830 + 350 |',
    );
    expect(lines).toContain(
      '| filter | 1 | 3.86 / 5.80 | 7.25 / 9.66 | 2.10× | 8.6 | +7.7 | 11.7 | 15 | 4096 | 16384 (2) | 21 | 830 + 350 |',
    );
  });

  it('applies plan §13 to 640x360 and notes the 960x540 verdict', () => {
    expect(report).toContain('## Plan §13 at 640×360');
    expect(report).toContain(
      '| busy | 1 | 1.2 | 5.00 | **planned** — proceed as planned; record the headroom as the R3-04 / R6-02 budget |',
    );
    expect(report).toContain(
      '960×540 (busy) is **tv-profile** where 640×360 is **planned**: clearly worse — note it; nothing changes.',
    );
  });

  it('marks an incomplete run and lists the records on request', () => {
    const partial = join(tmp, 'partial.jsonl');
    writeFileSync(partial, readFileSync(FIXTURE, 'utf8').trim().split('\n').slice(0, 7).join('\n') + '\n');
    const text = analyzeBenchSession(partial, { withRecords: true });
    expect(text).toContain('7 of 18 scenario(s) measured, run **incomplete**');
    expect(text).not.toContain('## 960x540');
    expect(text).toContain('## Records');
    expect(text).toContain('"scenario":"640x360-busy"');
  });

  it('says so for an empty log', () => {
    const empty = join(tmp, 'empty.jsonl');
    writeFileSync(empty, '\n');
    expect(analyzeBenchSession(empty)).toBe('no payloads in ' + empty);
  });
});

/**
 * The fixture session followed by its decode payload — a whole run since R1-05 B4.
 *
 * @param name - File name.
 * @param editDecode - Rewrites the decode record.
 * @returns The path.
 */
function decodeSession(name: string, editDecode: (d: Record<string, unknown>) => Record<string, unknown> = (d) => d): string {
  const payload = JSON.parse(readFileSync(DECODE_FIXTURE, 'utf8')) as Record<string, unknown>;
  const edited = { ...payload, decode: editDecode(payload['decode'] as Record<string, unknown>) };
  const file = join(tmp, name);
  writeFileSync(file, readFileSync(FIXTURE, 'utf8').trim() + '\n' + JSON.stringify(edited) + '\n');
  return file;
}

describe('the decode scenario (plan R1-05 B4)', () => {
  it('has no decode record in a session from before it', () => {
    expect(readBenchSession(FIXTURE).decode).toBeNull();
    expect(analyzeBenchSession(FIXTURE)).not.toContain('## Decode and upload');
  });

  it('reads the decode record next to the 18 render records, the latest one winning', () => {
    const file = decodeSession('decode.jsonl');
    const { payloads, records, decode } = readBenchSession(file);
    expect(payloads).toHaveLength(21);
    expect(records).toHaveLength(18);
    expect(decode?.pages.map((p: { id: string }) => p.id)).toEqual(['rgba-2048', 'png8-2048', 'common', 'zone-a']);
    // A Red re-run of the decode scenario sends a newer record: it wins.
    const rerun = join(tmp, 'decode-rerun.jsonl');
    const payload = JSON.parse(readFileSync(DECODE_FIXTURE, 'utf8')) as { decode: Record<string, unknown> };
    const newer = { ...payload, seq: 22, decode: { ...payload.decode, repetitions: 3, endedAt: 1760000999000 } };
    writeFileSync(rerun, readFileSync(file, 'utf8') + JSON.stringify(newer) + '\n');
    expect(readBenchSession(rerun).decode?.repetitions).toBe(3);
  });

  it('estimates R3-04’s zone load: common + two zone pages, cold and as uploads only', () => {
    const { decode } = readBenchSession(decodeSession('estimate.jsonl'));
    const estimate = decodeZoneEstimate(decode);
    // 554 + 2 × 379 cold; 130 + 2 × 110 uploads; 260 ms over 4.19 Mpx.
    expect(estimate?.lazyMs).toBe(1312);
    expect(estimate?.eagerMs).toBe(350);
    expect(estimate?.perMpxMs).toBeCloseTo(260 / 4.194304, 9);
    expect(ZONE_LOAD_TARGET_MS).toBe(2000);
    expect(decodeZoneEstimate(null)).toBeNull();
    expect(decodeZoneEstimate({ pages: [decode.pages[0]] })).toBeNull();
    expect(decodeZoneEstimate({ pages: [decode.pages[0], { ...decode.pages[1], totalMs: null }] })).toBeNull();
  });

  it('prints the decode table, the notes and the estimate', () => {
    const report = analyzeBenchSession(decodeSession('report.jsonl'), { withRecords: true });
    expect(report).toContain('## Decode and upload — file to GPU (plan R1-05 B4, for R3-04)');
    expect(report).toContain('4 page(s), 8 repetition(s) each, WebGL 1;');
    expect(report).toContain(
      '| rgba-2048 | 2048×2048 | rgba | 2442 | 24.00 / 30.00 | 400.00 / 450.00 | 110.00 / 140.00 |' +
        ' 130.00 / 170.00 | 554.00 / 640.00 | 660.00 | 380.00 / 420.00 | 20.00 / 26.00 |',
    );
    expect(report).toContain('| zone-a | 256×128 | png8 | 2 | 0.60 / 0.80 |');
    expect(report).toContain('- **zone-a:** bitmap: createImageBitmap timed out after 30000 ms');
    expect(report).toContain('**cold load** (fetch + decode + upload — a lazy zone load, B3b): **1312 ms**, within');
    expect(report).toContain('**350 ms**, within R3-04’s 2000 ms');
    expect(report).toContain('PNG-8 decode ≈ 62.0 ms per megapixel');
    // The render tables are unchanged, and --records lists the decode record too.
    expect(report).toContain('18 of 18 scenario(s) measured, run complete');
    expect(report).toContain('"scenario":"decode"');
  });

  it('flags an estimate over the target and a scenario that stopped', () => {
    const slow = (d: Record<string, unknown>) => ({
      ...d,
      error: 'Error: context lost',
      pages: (d['pages'] as Record<string, unknown>[]).map((p) => ({ ...p, totalMs: [900, 1000, 1100, 1200] })),
    });
    const lines = decodeSection(readBenchSession(decodeSession('slow.jsonl', slow)).decode);
    expect(lines).toContain('**The decode scenario stopped:** Error: context lost');
    expect(lines.join('\n')).toContain('**3000 ms**, **over** R3-04’s 2000 ms');
    const none = decodeSection({ repetitions: 1, pages: [] });
    expect(none).toContain(
      'No zone-load estimate: neither the stand-in pages (plan R3-04.M4a) nor both synthetic 2048² pages were measured.',
    );
  });

  it('estimates the zone load from the measured stand-in pages, each page at its median', () => {
    // Since plan R3-04.M4a the decode scenario measures the real thing: `common` plus the stand-in
    // zone pages (and the shipped zone page, a reference row). No page is multiplied any more.
    const page = (id: string, w: number, h: number, t: number, u: number, d: number) => ({
      id,
      width: w,
      height: h,
      encoding: 'png8',
      fetchMs: [1, 1, 2, 2],
      decodeMs: [d, d, d, d],
      uploadSyncedMs: [u, u, u, u],
      totalMs: [t, t, t, t],
    });
    const estimate = decodeZoneEstimate({
      repetitions: 1,
      pages: [
        page('standin-zone-a', 2048, 1024, 420, 140, 90),
        page('common', 1024, 1024, 300, 100, 40),
        page('zone-a', 256, 128, 60, 20, 10),
      ],
    });
    expect(estimate).toMatchObject({ lazyMs: 780, eagerMs: 260, basis: 'standin', pages: 3 });
    expect(estimate?.perMpxMs).toBeCloseTo((90 + 40 + 10) / (2.097152 + 1.048576 + 0.032768), 6);
    // The stand-in id list is the group rule: `standin-zone-a-2` joins when the pack needs two pages.
    const two = decodeZoneEstimate({
      repetitions: 1,
      pages: [
        page('standin-zone-a', 2048, 1024, 420, 140, 90),
        page('standin-zone-a-2', 2048, 512, 210, 70, 45),
        page('common', 1024, 1024, 300, 100, 40),
      ],
    });
    expect(two).toMatchObject({ lazyMs: 930, eagerMs: 310, basis: 'standin', pages: 3 });
    // An old session (synthetic 2048² pages) still takes the page-target formula.
    const { decode } = readBenchSession(decodeSession('old-estimate.jsonl'));
    expect(decodeZoneEstimate(decode)).toMatchObject({ basis: 'synthetic', pages: 3 });
  });

  it('prints the stand-in record on its own line, not as a matrix row', () => {
    const lines = readFileSync(FIXTURE, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const last = lines[lines.length - 1];
    const results = last['results'] as Record<string, unknown>[];
    const template = results[results.length - 1];
    const standinRecord = {
      ...template,
      scenario: 'standin-zone',
      index: 173,
      size: '640x360',
      variant: 'standin-zone',
    };
    const file = join(tmp, 'standin-record.jsonl');
    writeFileSync(
      file,
      [...lines.slice(0, -1), { ...last, results: [...results, standinRecord] }]
        .map((p) => JSON.stringify(p))
        .join('\n') + '\n',
    );
    const session = readBenchSession(file);
    expect(session.records.some((r: { scenario: string }) => r.scenario === 'standin-zone')).toBe(false);
    expect(session.standin.map((r: { scenario: string }) => r.scenario)).toEqual(['standin-zone']);
    const report = analyzeBenchSession(file);
    expect(report).toContain("## Stand-in draw (the run's last page load, plan R3-04.M4a) — 1 record(s)");
    expect(report).not.toContain('| standin-zone |');
    expect(report).toContain('18 of 18 scenario(s) measured');
  });
});

describe('knob rows', () => {
  it('splits a record variant into the load variant and the knob', () => {
    expect(parseRow('busy')).toEqual({ base: 'busy', knob: null });
    expect(parseRow('crt-light')).toEqual({ base: 'crt-light', knob: null });
    expect(parseRow('crt-light-out720')).toEqual({ base: 'crt-light', knob: 'out720' });
    expect(parseRow('worst-stretch')).toEqual({ base: 'worst', knob: 'stretch' });
    expect(parseRow('nope')).toEqual({ base: 'nope', knob: null });
  });

  it('reads a knob row against its own plain row at the same size', () => {
    const { records } = readBenchSession(FIXTURE);
    const plain = records.find((r) => r.scenario === '640x360-busy');
    const knob = { ...plain, scenario: '640x360-busy-stretch', variant: 'busy-stretch', index: 150 };
    expect(baselineFor(knob, records)).toBe(plain);
  });

  it('prices the cull pair against its plain row and prints what the walk walked', () => {
    // The knob machinery is generic (plan R-SVG WO-2): a `busy-cull` row needs no new code to be read
    // against `busy` at the same size. What the cull rows add is the record's additive `cull` field —
    // and the table says what was priced, not only what it cost, so a row cannot be read as a
    // regression without seeing that nothing was culled.
    const facts = analyzeBenchSessions([cullSession('cull-facts.jsonl', true)]);
    // The table's own row (size + variant, like every knob's), then the walk's figures under it.
    expect(facts).toContain('| 640x360 | busy-cull |');
    expect(facts).toContain('- **640x360-busy-cull:** 7386 sprites tagged cullable; per frame 7392');
    expect(facts).toContain('120 found outside the view, 2 write(s) that moved the bit, over 400');
    // A run recorded before the field exists (or a plain knob row) prices the same and says nothing.
    const bare = analyzeBenchSessions([cullSession('cull-bare.jsonl', false)]);
    expect(bare).toContain('| 640x360 | busy-cull |');
    expect(bare).not.toContain('sprites tagged cullable');
  });

  it('orders sizes scaled first, then native, each in matrix order', () => {
    const records = [
      { size: '1280x720n', index: 40, variant: 'busy' },
      { size: '640x360', index: 6, variant: 'busy', density: 1.5 },
      { size: '480x320n', index: 12, variant: 'busy' },
      { size: '384x216', index: 0, variant: 'busy', density: 1 },
      { size: '960x540', index: 30, variant: 'busy' },
    ];
    expect(sizeOrder(records).map((s) => s.id)).toEqual(['384x216', '640x360', '960x540', '480x320n', '1280x720n']);
  });
});

describe('campaigns: aggregation, noise floor, GL 1 vs 2 (plan §13, review F8)', () => {
  /** A GL 1 repeat: synced p95 ×1.1 and two-tick +0.2 points on every row. */
  const gl1b = variantSession('gl1-repeat.jsonl', (r) => ({
    ...r,
    syncedMs: (r['syncedMs'] as number[]).map((v) => v * 1.1),
    twoTickShare: (r['twoTickShare'] as number) + 0.002,
  }));

  it('aggregates the runs of a version and derives the noise band from same-version repeats', () => {
    const campaign = loadCampaign([FIXTURE, gl1b]);
    expect(campaign.runsByGl.get(1)).toHaveLength(2);
    const busy = campaign.aggregates.get(1).get('640x360-busy');
    expect(busy.runs).toBe(2);
    expect(busy.sync.min).toBe(5);
    expect(busy.sync.max).toBeCloseTo(5.5, 9);
    expect(busy.sync.median).toBeCloseTo(5.25, 9);
    expect(busy.twoTick.median).toBeCloseTo(2.1, 9);
    expect(campaign.noise.relSync.median).toBeCloseTo(0.1 / 1.05, 9);
    expect(campaign.noise.twoTick.p90).toBeCloseTo(0.2, 9);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(runStats([])).toBeNull();
  });

  it('prints the summary matrices, §13 on the medians and the noise band', () => {
    const report = analyzeBenchSessions([FIXTURE, gl1b]);
    expect(report).toContain('# TV render bench — 2 session(s)');
    expect(report).toContain('## WebGL 1 — 2 run(s)');
    expect(report).toMatch(/\| Size +\| +s \| +busy \| +filter \| +mode7 \| +crt-light \| +crt-full \| +worst \|/);
    // Two-tick %: the median of 2.0 and 2.2, ± half the range.
    expect(report).toMatch(/\| 640x360 \| +1\.5 \| +2\.1 ±0\.1 \|/);
    expect(report).toContain('### Plan §13 at 640×360 — GL 1, median of 2 runs');
    expect(report).toContain('| synced p95, relative   |    18 |    10% | 10% |');
    // Only GL 1 runs: no comparison.
    expect(report).toContain('No comparison: the sessions hold WebGL 1 runs only.');
  });

  it('refuses a verdict with fewer than two runs of each version', () => {
    const gl2 = variantSession('gl2-once.jsonl', (r) => ({ ...r, webGLVersion: 2 }));
    const report = analyzeBenchSessions([FIXTURE, gl2]);
    expect(report).toContain('## WebGL 1 vs 2 (plan §13, review F8)');
    expect(report).toContain('**No verdict:** it needs ≥ 2 runs of each WebGL version, these sessions hold GL 1 × 1 and GL 2 × 1.');
    expect(report).toContain('No noise floor: no WebGL version has 2 runs (GL 1 × 1, GL 2 × 1).');
    expect(report).not.toContain('**Verdict:**');
  });

  it('calls a difference only beyond the noise band', () => {
    const asGl2 = (name: string, edit: (r: Record<string, unknown>) => Record<string, unknown>) =>
      variantSession(name, (r) => edit({ ...r, webGLVersion: 2 }));
    const same = [asGl2('gl2-same-a.jsonl', (r) => r), asGl2('gl2-same-b.jsonl', (r) => r)];
    const within = analyzeBenchSessions([FIXTURE, gl1b, ...same]);
    expect(within).toContain('**Verdict:** within noise — no verdict: WebGL 1 (the shipped default) stays.');
    // GL 2 halves the two-tick share and the synced p95 everywhere: far beyond a 0.2-point / 10 % band.
    const better = (r: Record<string, unknown>) => ({
      ...r,
      twoTickShare: (r['twoTickShare'] as number) * 0.5,
      syncedMs: (r['syncedMs'] as number[]).map((v) => v * 0.5),
    });
    const report = analyzeBenchSessions([FIXTURE, gl1b, asGl2('gl2-a.jsonl', better), asGl2('gl2-b.jsonl', better)]);
    expect(report).toContain('**Verdict:** WebGL 2 is better beyond the noise floor (two-tick share)');
    expect(report).toContain('§13’s rule: WebGL 2 is clearly better at 640×360 (0.48× the synced p95');
    // A GL 2 that repeats one GL 1 run exactly is half GL 1's spread away — inside GL 1's range, never called.
    const repeat = [asGl2('gl2-rep-a.jsonl', (r) => r), asGl2('gl2-rep-b.jsonl', (r) => r)];
    expect(analyzeBenchSessions([FIXTURE, gl1b, ...repeat])).toMatch(/\| two-tick share \| +0 \| +0 \| +18 \|/);
    expect(report).toMatch(/\| 640x360-busy +\| +2\.1 ±0\.1 \| +1\.0 ±0\.0 \| +-1\.1 \| beyond \|/);
  });

  it('reads a folder of sessions and prints the per-session detail with --full', () => {
    const dir = mkdtempSync(join(tmp, 'campaign-'));
    writeFileSync(join(dir, 'rb-a.jsonl'), readFileSync(FIXTURE, 'utf8'));
    writeFileSync(join(dir, 'rb-b.jsonl'), readFileSync(gl1b, 'utf8'));
    writeFileSync(join(dir, 'ip-other.jsonl'), '{"kind":"input-probe"}\n');
    expect(expandSessionArgs([dir]).map((f) => f.slice(dir.length + 1))).toEqual(['rb-a.jsonl', 'rb-b.jsonl']);
    const report = analyzeBenchSessions([dir], { full: true });
    expect(report).toContain('# TV render bench — 2 session(s)');
    expect(report).toContain('## 640x360 (s = 1.5) — the v2 frame and density');
    expect(analyzeBenchSessions([dir])).not.toContain('## 640x360 (s = 1.5)');
  });

  it('runs from the command line', async () => {
    const out = await new Promise<{ code: number | null; stdout: string }>((done) => {
      const child = spawn(process.execPath, [join(ROOT, 'results', 'analyze-bench.mjs'), FIXTURE], { cwd: ROOT });
      let stdout = '';
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
      child.on('close', (code) => done({ code, stdout }));
    });
    expect(out.code).toBe(0);
    expect(out.stdout).toContain('## Plan §13 at 640×360');
    const usage = await new Promise<number | null>((done) => {
      const child = spawn(process.execPath, [join(ROOT, 'results', 'analyze-bench.mjs')], { cwd: ROOT });
      child.on('close', (code) => done(code));
    });
    expect(usage).toBe(2);
  });
});

// ------------------------------------------------------------------ output resolutions

interface SyntheticRow {
  size: string;
  variant: string;
  index: number;
}

/** The synthetic matrix: three sizes (the last one native, 1280x720n) × two load variants. */
const SYNTHETIC_ROWS: SyntheticRow[] = [
  { size: '384x216', variant: 'busy', index: 0 },
  { size: '384x216', variant: 'worst', index: 1 },
  { size: '640x360', variant: 'busy', index: 2 },
  { size: '640x360', variant: 'worst', index: 3 },
  { size: '1280x720n', variant: 'busy', index: 4 },
  { size: '1280x720n', variant: 'worst', index: 5 },
];

interface SyntheticOptions {
  /** `env.output` (a reduced-output build), or none for the full window. */
  output?: string;
  /**
   * `env.buildId` for every session written (default: the real bench's per-output identity,
   * `<base>` for the window and `<base>@<output>` otherwise — apps/tizen/src/bench/output.ts).
   */
  build?: string;
  /** The window, `[innerWidth, innerHeight]` (default 1920×1080). */
  inner?: [number, number];
  /** The session's WebGL version. */
  gl: number;
  /** `env.gameCodeHash` (plan v20x BENCSKIP): the pool key when present. */
  gameCode?: string;
  /** `env.svgEnc` (plan R-SVG WO-1): `'png'` / absent is the PNG arm, `'e3'` the SVG arm. */
  svgEnc?: string;
  /** Position in the campaign: 0 for the first run of its output, 1 for the repeat, … */
  run: number;
  /** Rows the build skipped (no record). */
  skip?: (row: SyntheticRow) => boolean;
  /** `[twoTick %, synced p95 ms]` of a row in this run. */
  value: (row: SyntheticRow, run: number) => [number, number];
}

/**
 * Writes a small synthetic bench session.
 *
 * @param name - File name.
 * @param o - What the session holds.
 * @returns The path.
 */
function syntheticSession(name: string, o: SyntheticOptions): string {
  const [w, h] = o.inner ?? [1920, 1080];
  const rows = SYNTHETIC_ROWS.filter((row) => !(o.skip?.(row) ?? false));
  const env: Record<string, unknown> = {
    buildId: o.build ?? (o.output === undefined ? 'abc1234' : `abc1234@${o.output}`),
    host: 'tizen',
    innerWidth: w,
    innerHeight: h,
    devicePixelRatio: 1,
    webGLVersion: o.gl,
    ...(o.gameCode === undefined ? {} : { gameCodeHash: o.gameCode }),
    ...(o.svgEnc === undefined ? {} : { svgEnc: o.svgEnc }),
    scenarios: SYNTHETIC_ROWS.length,
    startedAt: 1760000000000 + o.run * 1000 + (o.output === undefined ? 0 : 500) + o.gl,
  };
  if (o.output !== undefined) env['output'] = o.output;
  const results = rows.map((row) => {
    const [twoTick, sync] = o.value(row, o.run);
    return {
      scenario: `${row.size}-${row.variant}`,
      index: row.index,
      size: row.size,
      density: 1,
      variant: row.variant,
      webGLVersion: o.gl,
      twoTickShare: twoTick / 100,
      syncedMs: [0, sync / 2, sync, sync * 1.5],
      renderMs: [0, sync / 3, sync / 2, sync],
      endedAt: 1760000000000 + o.run * 1000 + row.index,
    };
  });
  const payload = { kind: 'render-bench', session: name.replace('.jsonl', ''), seq: 1, env, results, done: true };
  const file = join(tmp, name);
  writeFileSync(file, JSON.stringify(payload) + '\n');
  return file;
}

/**
 * A one-run session with the plain 640×360 `busy` row and its cull twin, the latter carrying (or
 * not) the additive `cull` facts of plan R-SVG WO-2.
 *
 * @param {string} name - The file's name in the temp folder.
 * @param {boolean} withFacts - Whether the cull row's record carries the walk's figures.
 * @returns {string} the written file.
 */
function cullSession(name: string, withFacts: boolean): string {
  const rec = (scenario: string, index: number, variant: string, over: Record<string, unknown> = {}) => ({
    scenario,
    index,
    size: '640x360',
    density: 1,
    variant,
    webGLVersion: 1,
    twoTickShare: 0.1,
    syncedMs: [1, 2, 3, 4],
    renderMs: [1, 1.5, 2, 2.5],
    endedAt: 1760000000000 + index,
    ...over,
  });
  const cull = withFacts ? { cull: { tagged: 7386, passes: 400, visits: 7392, culled: 120, flips: 2 } } : {};
  const payload = {
    kind: 'render-bench',
    session: name.replace('.jsonl', ''),
    seq: 1,
    env: {
      buildId: 'abc1234',
      host: 'tizen',
      innerWidth: 1920,
      innerHeight: 1080,
      devicePixelRatio: 1,
      webGLVersion: 1,
      scenarios: 194,
      startedAt: 1760000000000,
    },
    results: [
      rec('640x360-busy', 6, 'busy'),
      rec('640x360-busy-cull', 190, 'busy-cull', cull),
    ],
    done: true,
  };
  const file = join(tmp, name);
  writeFileSync(file, JSON.stringify(payload) + '\n');
  return file;
}

/** Base figures of a row at 1920x1080: the two-tick share (%) and the synced p95 (ms). */
function base1080(row: SyntheticRow): [number, number] {
  return [10 + row.index, 8 + row.index];
}

/** A run's own jitter: the repeat (run 1) is +1.0 point and +10 % of the first. */
function jitter(value: [number, number], run: number, points: number): [number, number] {
  return run === 0 ? value : [value[0] + points, value[1] * 1.1];
}

/**
 * The four passes (GL 1, 2, 1, 2) of one output.
 *
 * @param prefix - File-name prefix.
 * @param output - `env.output`, or none for the window.
 * @param value - The row's figures.
 * @param skip - Skipped rows.
 * @param passes - How many of the four passes to write.
 * @param build - The `env.buildId` every pass shares (omitted: the per-output ids).
 * @returns The paths.
 */
function campaignOf(
  prefix: string,
  output: string | undefined,
  value: (row: SyntheticRow, run: number) => [number, number],
  skip?: (row: SyntheticRow) => boolean,
  passes = 4,
  build?: string,
): string[] {
  return [1, 2, 1, 2].slice(0, passes).map((gl, i) =>
    syntheticSession(`${prefix}-${i}.jsonl`, {
      gl,
      run: Math.floor(i / 2),
      ...(output === undefined ? {} : { output }),
      ...(skip === undefined ? {} : { skip }),
      ...(build === undefined ? {} : { build }),
      value,
    }),
  );
}

/**
 * The cells of one row of the cross-output table.
 *
 * @param report - The report.
 * @param size - Size id.
 * @param variant - Load variant.
 * @returns The cells after Size and Variant: two-tick per output, then synced p95 per output.
 */
function crossRow(report: string, size: string, variant: string): string[] {
  const at = report.indexOf('## Cross-output comparison');
  expect(at).toBeGreaterThan(-1);
  const line = report
    .slice(at)
    .split('\n')
    .find((l) => {
      const c = l.split('|').map((x) => x.trim());
      return c[1] === size && c[2] === variant;
    });
  expect(line).toBeDefined();
  return (line as string)
    .split('|')
    .map((x) => x.trim())
    .slice(3, -1);
}

describe('output resolutions', () => {
  // 1920x1080 (the window): jitter 1.0 pt / +10 %. 1280x720: much better on busy, the same on worst; jitter 0.4 pt.
  // 960x540: one GL 1 session (no repeat), a hair better on busy, skips the native 1280x720n rows.
  // `all` writes each output under its own build id — the identity the shipped bench composes
  // (`<build>@<output>`, apps/tizen/src/bench/output.ts, the Oct-19 resolutions campaign), so under the
  // 898021ee partition law its campaign splits into one build per output. `one` is the same matrix
  // recorded under ONE build id — the case the analyzer still aggregates, pools and compares.
  const full = campaignOf('o1080', undefined, (row, run) => jitter(base1080(row), run, 1));
  const mid = campaignOf('o720', '1280x720', (row, run) => {
    const [t, s] = base1080(row);
    return row.variant === 'busy' ? jitter([t * 0.4, s * 0.5], run, 0.4) : jitter([t, s], run, 0.4);
  });
  const small = campaignOf(
    'o540',
    '960x540',
    (row) => {
      const [t, s] = base1080(row);
      return [row.variant === 'busy' ? t - 0.5 : t, s];
    },
    (row) => row.size === '1280x720n',
    1,
  );
  const all = [...full, ...mid, ...small];
  const oneFull = campaignOf('u1080', undefined, (row, run) => jitter(base1080(row), run, 1), undefined, 4, 'abc1234');
  const oneMid = campaignOf(
    'u720',
    '1280x720',
    (row, run) => {
      const [t, s] = base1080(row);
      return row.variant === 'busy' ? jitter([t * 0.4, s * 0.5], run, 0.4) : jitter([t, s], run, 0.4);
    },
    undefined,
    4,
    'abc1234',
  );
  const oneSmall = campaignOf(
    'u540',
    '960x540',
    (row) => {
      const [t, s] = base1080(row);
      return [row.variant === 'busy' ? t - 0.5 : t, s];
    },
    (row) => row.size === '1280x720n',
    1,
    'abc1234',
  );
  const one = [...oneFull, ...oneMid, ...oneSmall];

  it('takes the output from env.output, else from the window', () => {
    expect(sessionOutput({ output: '1280x720', innerWidth: 1920, innerHeight: 1080 })).toEqual({
      id: '1280x720',
      label: '1280x720 (backbuffer)',
      area: 921600,
      window: false,
    });
    expect(sessionOutput({ innerWidth: 1920, innerHeight: 1080 })).toEqual({
      id: '1920x1080',
      label: '1920x1080 (window)',
      area: 2073600,
      window: true,
    });
    // A bogus output is ignored; nothing at all is an unknown output that sorts last.
    expect(sessionOutput({ output: 'big', innerWidth: 1280, innerHeight: 720 }).id).toBe('1280x720');
    expect(sessionOutput({}).id).toBe('?');
    expect(sessionOutput(undefined).area).toBe(0);
  });

  it('groups the sessions by output, largest first, with their own runs per WebGL version', () => {
    const campaign = loadCampaign(all);
    expect(campaign.outputs.map((o: { output: { id: string } }) => o.output.id)).toEqual(['1920x1080', '1280x720', '960x540']);
    expect(campaign.outputs.map((o: { sessions: unknown[] }) => o.sessions.length)).toEqual([4, 4, 1]);
    const [o1080, o720, o540] = campaign.outputs;
    expect([...o1080.runsByGl.keys()]).toEqual([1, 2]);
    expect(o1080.runsByGl.get(1)).toHaveLength(2);
    expect(o720.runsByGl.get(2)).toHaveLength(2);
    expect([...o540.runsByGl.keys()]).toEqual([1]);
    // The old fields mirror the first output.
    expect(campaign.runsByGl).toBe(o1080.runsByGl);
    expect(campaign.sessions).toHaveLength(9);
    // Every output band comes from its own repeats.
    expect(o1080.noise.twoTick.median).toBeCloseTo(1, 9);
    expect(o720.noise.twoTick.median).toBeCloseTo(0.4, 9);
    expect(o1080.noise.pooled).toBeUndefined();
    expect(o720.noise.pooled).toBeUndefined();
  });

  it('prints a heading per output with its own sections, and a sessions table with the output', () => {
    const report = analyzeBenchSessions(all);
    // The `all` campaign holds one build per output (the shipped bench's `<build>@<output>` identity),
    // so the 898021ee partition law names the build in every heading. A single-build campaign keeps
    // the unnamed headings — asserted on `one` in the cross-output tests below.
    const heads = [
      '## Output 1920x1080 (window) [build abc1234]',
      '## Output 1280x720 (backbuffer) [build abc1234@1280x720]',
      '## Output 960x540 (backbuffer) [build abc1234@960x540]',
    ].map((h) => report.indexOf('\n' + h + '\n'));
    expect(heads.every((i) => i > 0)).toBe(true);
    expect([...heads].sort((a, b) => a - b)).toEqual(heads);
    expect(report).toMatch(/\| # +\| Session +\| Output +\| GL /);
    // Each output carries every per-GL section, demoted under its heading.
    const section = (from: number, to: number) => report.slice(from, to);
    const big = section(heads[0], heads[1]);
    expect(big).toContain('\n### WebGL 1 — 2 run(s)\n');
    expect(big).toContain('\n### WebGL 2 — 2 run(s)\n');
    expect(big).toContain('\n#### Plan §13 at 640×360 — GL 1, median of 2 runs\n');
    expect(big).toContain('\n### Noise floor — same-GL repeats\n');
    expect(big).toContain('\n### WebGL 1 vs 2 (plan §13, review F8)\n');
    expect(big).toContain('runs: GL 1 × 2, GL 2 × 2.');
    // The noise band is computed per output: 1.0 point at 1080, 0.4 at 720.
    expect(big).toMatch(/\| two-tick share, points +\| +\d+ +\| +1\.0 +\| +1\.0 \|/);
    const mid = section(heads[1], heads[2]);
    expect(mid).toMatch(/\| two-tick share, points +\| +\d+ +\| +0\.4 +\| +0\.4 \|/);
    expect(mid).toContain('The canvas backbuffer is this size');
    expect(big).not.toContain('falling back');
    expect(mid).not.toContain('falling back');
  });

  it('falls back to the pooled band of the build’s outputs when one has no repeats, and says so', () => {
    // The fallback survives the partition inside one build (898021ee): the `one` campaign records all
    // three outputs under `abc1234`, so the 960x540 output borrows the band of its build's others.
    const campaign = loadCampaign(one);
    const small540 = campaign.outputs[2];
    expect(small540.ownNoise).toBeNull();
    expect(small540.noise.pooled).toBe(true);
    expect(small540.noise.pooledFrom).toEqual(['1920x1080', '1280x720']);
    // 1080 contributes 12 pairs of 1.0, 720 12 of 0.4: the median of the pool is 0.7 (between the two groups).
    expect(small540.noise.twoTick.n).toBe(24);
    expect(small540.noise.twoTick.median).toBeCloseTo(0.7, 9);
    expect(small540.noise.twoTick.p90).toBeCloseTo(1, 9);
    const report = analyzeBenchSessions(one);
    const at = report.indexOf('\n## Output 960x540 (backbuffer)\n');
    const block = report.slice(at, report.indexOf('## Cross-output comparison'));
    expect(block).toContain('**No same-GL repeats at this output** (GL 1 × 1)');
    expect(block).toContain('pooled band of all outputs** (1920x1080, 1280x720)');
    expect(block).toContain('Pooled over the outputs. 24 scenario');
    // One run of one version: no verdict either way.
    expect(block).toContain('No comparison: the sessions hold WebGL 1 runs only.');
    // No output of the build with a repeat: no band, no fallback (nothing to pool).
    const lone = loadCampaign(campaignOf('lone', undefined, (row) => base1080(row), undefined, 2, 'abc1234').concat(oneSmall));
    expect(lone.outputs.every((o: { noise: unknown }) => o.noise === null)).toBe(true);
  });

  it('never pools the band or compares outputs across builds (the 2026-10-27 partition law)', () => {
    // The `all` campaign is the Oct-19 shape: three outputs, three build ids. Nothing aggregates across them.
    const campaign = loadCampaign(all);
    expect(campaign.outputs.map((o: { output: { buildId: string } }) => o.output.buildId)).toEqual([
      'abc1234',
      'abc1234@1280x720',
      'abc1234@960x540',
    ]);
    // The 960x540 build contributes a single output: its repeat-less band cannot borrow the other
    // builds' outputs — no band at all, and the block says the plain no-noise-floor line.
    expect(campaign.outputs[2].noise).toBeNull();
    const report = analyzeBenchSessions(all);
    const at = report.indexOf('\n## Output 960x540 (backbuffer) [build abc1234@960x540]\n');
    const block = report.slice(at, report.indexOf('## Cross-output comparison'));
    expect(block).toContain('No noise floor: no WebGL version has 2 runs (GL 1 × 1)');
    expect(block).not.toContain('pooled band');
    expect(block).not.toContain('falling back');
    // The cross-output section prints the refusal, not a table.
    expect(report).toContain(
      'No cross-output comparison: no build contributes two output resolutions to this campaign.',
    );
    expect(report).not.toContain('2t % 1920x1080');
    // The same matrix under one build id still compares: its headings stay unnamed, as before.
    const oneReport = analyzeBenchSessions(one);
    expect(oneReport).not.toContain('[build');
    expect(oneReport).toContain('2t % 1920x1080');
  });

  it('prints the cross-output table with the outputs side by side, a star where a reduced output beats 1080p', () => {
    // The comparison is the one build's: `one` (the partition law above).
    const report = analyzeBenchSessions(one);
    expect(report).toContain('Outputs, largest first: 1920x1080 (window) · 1280x720 (backbuffer) · 960x540 (backbuffer).');
    expect(report).toMatch(/\| Size +\| Variant +\| 2t % 1920x1080 +\| 2t % 1280x720 +\| 2t % 960x540 +\| p95 ms 1920x1080 /);
    // 640x360 busy (index 2): 1080 -> 12 / 10 (+1 pt, +10 % on the repeat: median over the four runs 12.5 / 10.5).
    // 720 -> 4.8 / 5, repeat +0.4 / ×1.1 (median 5.0 / 5.25); 540 -> 11.5 / 10 (one run).
    expect(crossRow(report, '640x360', 'busy')).toEqual(['12.5', '5.0*', '11.5', '10.5', '5.3*', '10.0']);
    // The 720 worst row equals the 1080 one except its smaller jitter: no mark; 540 is the same.
    expect(crossRow(report, '640x360', 'worst')).toEqual(['13.5', '13.2', '13.0', '11.6', '11.6', '11.0']);
    // The native rows are skipped by the 960x540 build: a dash, never a zero.
    expect(crossRow(report, '1280x720n', 'busy')).toEqual(['14.5', '5.8*', '—', '12.6', '6.3*', '—']);
    expect(crossRow(report, '1280x720n', 'worst')).toEqual(['15.5', '15.2', '—', '13.7', '13.7', '—']);
  });

  it('says per variant where the reduced outputs beat the largest beyond the noise band', () => {
    const report = analyzeBenchSessions(one);
    expect(report).toContain('Where the reduced outputs beat 1920x1080 beyond the noise band, per load variant:');
    expect(report).toContain(
      '- **busy** — 1280x720 beats 1920x1080 on two-tick at 3/3 size(s) (most: 1280x720n -8.7 pts) and synced p95 at 3/3 size(s)' +
        ' (most: ',
    );
    expect(report).toContain('0.50×) (3 size(s) compared); 960x540 beats it nowhere (2 size(s) compared).');
    expect(report).toContain('- **worst** — 1280x720 beats it nowhere (3 size(s) compared); 960x540 beats it nowhere (2 size(s) compared).');
  });

  it('adds the per-version tables with --full only', () => {
    expect(analyzeBenchSessions(one)).not.toContain('### Cross-output — WebGL 1 runs only');
    const full1 = analyzeBenchSessions(one, { full: true });
    expect(full1).toContain('### Cross-output — WebGL 1 runs only');
    expect(full1).toContain('### Cross-output — WebGL 2 runs only');
    // Per version the median is over that version's two runs: 640x360 busy at 1080 is (12 + 13) / 2.
    const gl1 = full1.slice(full1.indexOf('### Cross-output — WebGL 1 runs only'));
    const row = gl1.split('\n').find((l) => l.split('|').map((x) => x.trim())[1] === '640x360' && l.includes(' busy '));
    expect((row as string).split('|').map((x) => x.trim()).slice(3, 4)).toEqual(['12.5']);
  });

  it('leaves a single-output campaign as it was: one output heading, no cross-output section', () => {
    const report = analyzeBenchSessions(full);
    expect(report).toContain('\n## Output 1920x1080 (window)\n');
    expect(report).not.toContain('Cross-output');
    expect(report).not.toMatch(/\| Session +\| Output/);
    expect(loadCampaign(full).outputs).toHaveLength(1);
    // The fixture session (no env.output) reads as the window.
    expect(analyzeBenchSessions([FIXTURE])).toContain('## Output 1920x1080 (window)');
    // A reduced-output session names its output in its own report.
    expect(analyzeBenchSession(mid[0])).toContain('display 1920×1080 @1 · output 1280x720 · WebGL 1');
    expect(analyzeBenchSession(full[0])).not.toContain(' · output ');
  });

  it('groups old sessions without env.output by their window size', () => {
    const a = syntheticSession('win-a.jsonl', { gl: 1, run: 0, value: (row) => base1080(row) });
    const b = syntheticSession('win-b.jsonl', { gl: 1, run: 1, inner: [1280, 720], value: (row) => base1080(row) });
    const campaign = loadCampaign([a, b]);
    expect(campaign.outputs.map((o: { output: { label: string } }) => o.output.label)).toEqual([
      '1920x1080 (window)',
      '1280x720 (window)',
    ]);
  });

  it('judges a missing noise band as unjudged, not as a beat', () => {
    expect(beatsReference({ twoTick: 10, sync: 10 }, { twoTick: 1, sync: 1 }, null, null)).toEqual({
      twoTick: false,
      sync: false,
      points: -9,
      ratio: 0.1,
    });
    expect(beatsReference(undefined, { twoTick: 1, sync: 1 }, null, null)).toEqual({
      twoTick: false,
      sync: false,
      points: null,
      ratio: null,
    });
    const band = { twoTick: { p90: 2 }, relSync: { p90: 0.2 } };
    expect(beatsReference({ twoTick: 10, sync: 10 }, { twoTick: 8.5, sync: 8.5 }, band, band)).toMatchObject({ twoTick: false, sync: false });
    expect(beatsReference({ twoTick: 10, sync: 10 }, { twoTick: 7.5, sync: 7.5 }, band, band)).toMatchObject({ twoTick: true, sync: true });
    expect(poolNoise([])).toBeNull();
  });
});

describe('the pool key: game code and atlas encoding (plans v20x BENCSKIP + R-SVG WO-1)', () => {
  it('names a PNG session exactly as it was named before the arm', () => {
    // The 364+ committed rows' keys must not move: no field, `png`, `''` and `off` all read as the
    // bare identity, with or without a game code.
    expect(benchPoolOf({ buildId: 'abc1234' })).toBe('abc1234');
    expect(benchPoolOf({ buildId: 'abc1234', svgEnc: 'png' })).toBe('abc1234');
    expect(benchPoolOf({ buildId: 'abc1234', svgEnc: '' })).toBe('abc1234');
    expect(benchPoolOf({ buildId: 'abc1234@960x540' })).toBe('abc1234@960x540');
    expect(benchPoolOf({ buildId: 'abc1234', gameCodeHash: 'dead1' })).toBe('code:dead1');
    expect(benchPoolOf({ buildId: 'abc1234', gameCodeHash: 'dead1', svgEnc: 'png' })).toBe('code:dead1');
    expect(benchPoolOf({})).toBe('?');
  });

  it('suffixes an SVG session and never lets it share a pool with a PNG one', () => {
    expect(benchPoolOf({ gameCodeHash: 'dead1', svgEnc: 'e3' })).toBe('code:dead1|svg=e3');
    expect(benchPoolOf({ buildId: 'abc1234', svgEnc: 'e3' })).toBe('abc1234|svg=e3');
    // A different encoding is a different pool, and so is a different game code.
    expect(benchPoolOf({ gameCodeHash: 'dead1', svgEnc: 'e4' })).toBe('code:dead1|svg=e4');
    expect(benchPoolOf({ gameCodeHash: 'dead2', svgEnc: 'e3' })).toBe('code:dead2|svg=e3');
    // The suffix cannot collide with a real build id: one is a short sha with a dirty `+`, then
    // `@<w>x<h>` for a build output (`8ba0e7c@960x540`), and it never holds a `|` — so a key with a
    // `|` in it is always an arm key, and an arm's session is never read as a PNG session's.
    expect(benchPoolOf({ buildId: '8ba0e7c@960x540' })).not.toContain('|');
    expect(benchPoolOf({ buildId: '8ba0e7c@960x540', svgEnc: 'e3' })).toContain('|');
  });

  it('groups the arms apart in a campaign and stacks same-arm sessions together', () => {
    const png = syntheticSession('pool-png.jsonl', { gl: 1, run: 0, gameCode: 'dead1', value: base1080 });
    const other = syntheticSession('pool-png-2.jsonl', { gl: 2, run: 0, gameCode: 'dead1', value: base1080 });
    const svg = syntheticSession('pool-svg.jsonl', {
      gl: 1,
      run: 0,
      gameCode: 'dead1',
      svgEnc: 'e3',
      build: 'abc1234+svg-e3',
      value: (row) => [base1080(row)[0] + 30, base1080(row)[1] * 3],
    });
    const mixed = loadCampaign([png, other, svg]);
    // Two identities on one output: the PNG pool (two passes) and the SVG pool (its own session).
    // The arms' rows never average together, and each group's session set says which is which.
    expect(mixed.sessions).toHaveLength(3);
    expect(mixed.outputs).toHaveLength(2);
    const pools = mixed.outputs.map((o: { sessions: { id: string }[] }) => o.sessions.map((r) => r.id).sort().join('+')).sort();
    expect(pools).toEqual(['pool-png+pool-png-2', 'pool-svg']);
    const svgOnly = loadCampaign([svg]);
    expect(svgOnly.outputs).toHaveLength(1);
    expect(svgOnly.sessions).toHaveLength(1);
    // The report names both builds apart (the shipped bench composes the arm's id with `+svg-e3`),
    // and a PNG-only campaign keeps the headings it always had.
    const report = analyzeBenchSessions([png, other, svg]);
    expect(report).toContain('[build abc1234]');
    expect(report).toContain('[build abc1234+svg-e3]');
    expect(analyzeBenchSessions([png, other])).not.toContain('+svg-e3');
  });
});
