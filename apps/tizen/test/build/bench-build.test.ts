/**
 * Build-output test of the TV render bench widget (plan R0-02 acceptance: "`pnpm bench:tv`
 * produces a widget directory that passes the Tizen bundle checks"): runs the real bench build
 * (`vite.bench.config.ts`, mode `bench`) into a temporary folder and checks what would be packaged
 * — one classic ES2018 IIFE behind the `globalThis` banner, the bench's own `config.xml`, the
 * density atlases (1, 1 and 2 pages) and nothing of the game's.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  POLYFILL_BANNER,
  TV_BENCH_MARKER,
  applicationIdOf,
  checkTizenBundle,
} from '../../scripts/check-bundle.mjs';
import { BENCH_APP_ID } from '../../scripts/config-xml.mjs';
import benchConfig, { BENCH_BUILD_MODE, BENCH_OUT_DIR } from '../../vite.bench.config.js';

const appDir = fileURLToPath(new URL('../../', import.meta.url));
let outDir = '';
let code = '';

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'shmup-tizen-bench-'));
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VITE_REPORT_URL', 'http://10.0.0.2:8787');
  try {
    await build({
      root: join(appDir, 'bench'),
      configFile: join(appDir, 'vite.bench.config.ts'),
      mode: BENCH_BUILD_MODE,
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });
  } finally {
    vi.unstubAllEnvs();
  }
  code = readFileSync(join(outDir, 'app.js'), 'utf8');
}, 180_000);

afterAll(() => {
  if (outDir !== '') rmSync(outDir, { recursive: true, force: true });
});

describe('tizen bench build (vite.bench.config.ts → dist-bench/)', () => {
  it('keeps the Tizen build contract and its own output folder', () => {
    const settings = benchConfig.build ?? {};
    expect(settings.target).toEqual(['chrome69', 'es2018']);
    expect(settings.modulePreload).toBe(false);
    const output = settings.rolldownOptions?.output as Record<string, unknown>;
    expect(output.format).toBe('iife');
    expect(output.codeSplitting).toBe(false);
    expect(output.entryFileNames).toBe('app.js');
    expect(output.postBanner).toBe(
      readFileSync(new URL('../../polyfills/global-this.js', import.meta.url), 'utf8'),
    );
    expect(settings.outDir).toBe(join(appDir, BENCH_OUT_DIR));
    expect(BENCH_OUT_DIR).toBe('dist-bench');
    expect(benchConfig.base).toBe('./');
    expect(BENCH_BUILD_MODE).toBe('bench');
  });

  it('passes every check of scripts/check-bundle.mjs', () => {
    const report = checkTizenBundle(outDir);
    expect(report.problems).toEqual([]);
    expect(report.files.sort()).toEqual([
      'app.js',
      'assets/atlas/bench-x1-0.png',
      'assets/atlas/bench-x1.5-0.png',
      'assets/atlas/bench-x2.25-0.png',
      'assets/atlas/bench-x2.25-1.png',
      'config.xml',
      'icon.png',
      'index.html',
    ]);
  });

  it('is one ES2018 classic script behind the polyfill, loaded by a deferred tag', () => {
    expect(() => parse(code, { ecmaVersion: 2018, sourceType: 'script' })).not.toThrow();
    expect(code.startsWith(POLYFILL_BANNER)).toBe(true);
    const html = readFileSync(join(outDir, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    expect(html.match(/<script\b[^>]*>/g)).toEqual(['<script defer src="./app.js">']);
    expect(code).not.toMatch(/\bimport\.meta\b/);
    expect(code).not.toMatch(/\bimport\s*\(/);
  });

  it('installs next to the game under its own app id', () => {
    const xml = readFileSync(join(outDir, 'config.xml'), 'utf8');
    expect(applicationIdOf(xml)).toBe(BENCH_APP_ID);
    expect(readFileSync(join(outDir, 'icon.png'))).toEqual(
      readFileSync(join(appDir, 'public', 'icon.png')),
    );
  });

  it('is the bench, reports to the log server, and carries none of the game', () => {
    expect(code).toContain(TV_BENCH_MARKER);
    expect(code).toContain('render-bench');
    // The bench mode is a dev-build mode, so VITE_REPORT_URL reaches the bundle.
    expect(code).toContain('http://10.0.0.2:8787');
    // The game's boot, scene flow and content never come along.
    expect(code).not.toContain('virtual:shmup-content');
    expect(code).not.toContain('AZURE VERGE');
    expect(code).not.toContain('ShmpCupGam');
  });
});
