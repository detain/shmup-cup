/**
 * `results/analyze.mjs` and the SVG matrix (WO-3A): a session whose last report carries `stats.svg` prints the
 * capability table with its expected/surprise counts and a detail line per surprise; an older session without
 * the key prints the not-captured line — the `extensions?` precedent, both shapes must read.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'ip-svg-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Run the analyzer over a jsonl file and return its stdout. */
async function analyze(file: string): Promise<{ code: number | null; stdout: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(ROOT, 'results', 'analyze.mjs'), file], { cwd: ROOT });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.on('close', (code) => done({ code, stdout }));
  });
}

/** A minimal valid probe payload; `stats.svg` rides when given. */
function payload(seq: number, svg?: unknown): string {
  return JSON.stringify({
    session: 'ip-svgtest-0001',
    from: '10.0.0.9',
    seq,
    sentAt: 1000 + seq * 3000,
    droppedEvents: 0,
    env: { userAgent: 'Mozilla/5.0 (Linux/Tizen) Chrome/69', chromeVersion: 69, innerWidth: 1920, innerHeight: 1080 },
    stats: {
      registered: [],
      supportedKeys: 0,
      seenKeys: [],
      frames: { medianMs: 16.7, medianHz: 60, p95Ms: 20, maxMs: 33, worstMs: 33, frames: 100, hitches: 0, pauses: 0 },
      ...(svg ? { svg } : {}),
    },
    newEvents: [],
  });
}

const SVG = {
  status: 'done',
  elapsedMs: 52000,
  warmWindows: 3,
  measureWindows: 12,
  features: [
    { id: 'blur-s2', kind: 'raster', status: 'PASS', bytes: 318, decodeMs: 2.1, drawMs: 1.1, totalMs: 3.2, windows: 12, inkedPx: 3163, detail: null },
    { id: 'smil-animate', kind: 'dynamic', status: 'ANIMATES', bytes: 300, decodeMs: 2.0, drawMs: 1.0, totalMs: 3.0, windows: 1, inkedPx: null, detail: 'redraw differs from the first read at byte 77' },
  ],
};

describe('analyze.mjs SVG capability section', () => {
  it('prints the table with expected/surprise counts and the detail line', async () => {
    const file = join(dir, 'with-svg.jsonl');
    writeFileSync(file, [payload(1), payload(2, SVG)].join('\n') + '\n');
    const out = await analyze(file);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain('## SVG capability');
    expect(out.stdout).toContain('2 features (1 expected, 1 surprise)');
    expect(out.stdout).toContain('blur-s2');
    expect(out.stdout).toContain('3.2');
    expect(out.stdout).toContain('smil-animate');
    expect(out.stdout).toContain('differs from the first read at byte 77');
    expect(out.stdout).not.toContain('19 features');
  }, 20000);

  it('reads an older session without stats.svg as not captured', async () => {
    const file = join(dir, 'no-svg.jsonl');
    writeFileSync(file, payload(1) + '\n');
    const out = await analyze(file);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain('## SVG capability');
    expect(out.stdout).toContain('not captured (probe build predates the SVG matrix)');
  }, 20000);
});
