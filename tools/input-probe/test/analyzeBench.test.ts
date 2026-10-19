/**
 * results/analyze-bench.mjs (plan R0-02 acceptance: "the analyzer prints a relative table from a recorded
 * fixture session"): a fixture TV render-bench session (`fixtures/bench-session.jsonl` — 18 scenarios, a Red
 * re-run, an older record re-sent at the end of the run) turns into the §12 tables, every row read against the
 * same variant at 384×216 in the same session, with plan §13's outcome applied to 640×360 and the 960×540 note
 * — and two sessions of the same set into the WebGL 1-vs-2 verdict. Since plan R1-05 (B4) a run ends with the
 * decode scenario (`fixtures/bench-decode.jsonl` — its payload alone): its table and R3-04's zone-load estimate,
 * and an older session without it still reads the same.
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
  analyzeBenchSessions,
  baselineFor,
  decodeSection,
  decodeZoneEstimate,
  expandSessionArgs,
  lateShare,
  loadCampaign,
  parseRow,
  quantile,
  readBenchSession,
  relativeTo,
  runStats,
  section13Outcome,
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
    expect(none).toContain('No zone-load estimate: the 2048² pages were not both measured.');
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
