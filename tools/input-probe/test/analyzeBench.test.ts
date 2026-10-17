/**
 * results/analyze-bench.mjs (plan R0-02 acceptance: "the analyzer prints a relative table from a recorded
 * fixture session"): a fixture TV render-bench session (`fixtures/bench-session.jsonl` — 18 scenarios, a Red
 * re-run, an older record re-sent at the end of the run) turns into the §12 tables, every row read against the
 * same variant at 384×216 in the same session, with plan §13's outcome applied to 640×360 and the 960×540 note
 * — and two sessions of the same set into the WebGL 1-vs-2 verdict.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import {
  analyzeBenchSession,
  analyzeBenchSessions,
  baselineFor,
  compareWebGL,
  lateShare,
  readBenchSession,
  relativeTo,
  section13Outcome,
} from '../results/analyze-bench.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'test', 'fixtures', 'bench-session.jsonl');
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

describe('WebGL 1 vs 2 (plan §13, review F8)', () => {
  it('compares two sessions of the same set scenario by scenario', () => {
    const faster = variantSession('gl2-faster.jsonl', (r) => ({
      ...r,
      webGLVersion: 2,
      syncedMs: (r['syncedMs'] as number[]).map((v) => v * 0.85),
    }));
    const report = analyzeBenchSessions([FIXTURE, faster]);
    expect(report).toContain('## WebGL 1 vs 2 (plan §13, review F8)');
    expect(report).toContain('| 640x360-busy | 5.00 | 4.25 | 0.85× |');
    expect(report).toContain('WebGL 2 is clearly better at 640×360 (0.85× the synced p95)');
    const same = variantSession('gl2-same.jsonl', (r) => ({ ...r, webGLVersion: 2 }));
    expect(analyzeBenchSessions([FIXTURE, same])).toContain('WebGL 2 is not clearly better at 640×360 (1.00×');
    // One session alone gets no comparison.
    expect(analyzeBenchSessions([FIXTURE])).not.toContain('WebGL 1 vs 2');
    expect(compareWebGL([], [])).toContain('No 640x360-busy row in both sessions: no WebGL verdict.');
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
