/**
 * No literal frame numbers outside `@shmup/core` either (plan_resolution.md R1-02).
 *
 * R1-01 made every frame-dependent number in core derive from a few constants (`FRAME_W`,
 * `FRAME_H`, `HUD_BAR_HEIGHT`, `TILE_SIZE`, the font metrics), and R1-02 did the same for the
 * presentation packages, the hosts and the root scripts, so that R2-01's flip to 640×360 is a
 * change of those constants alone. Core's own scan (`packages/core/test/frame-literals.test.ts`)
 * keeps `packages/core/src` clean; this file keeps the rest clean with the same scanner
 * (`packages/core/test/helpers/frame-literal-scan.ts`, imported by relative path as packages
 * import the allocation guard). It parses
 *
 * - every other package's `src/` (`render-pixi`, `shell`, `audio-web`, `input-web` — and any
 *   package added later),
 * - every app's `src/` (`web`, `tizen`, `webos`, `electron`),
 * - every app's `scripts/` where it has one (`tizen`, `webos`, `electron`: the bundle checks, the
 *   manifests' validators, packaging and bench helpers — `.mjs`, parsed as JavaScript), and
 * - every root script under `scripts/` (`.mjs`, parsed as JavaScript),
 *
 * and fails on any numeric literal — or whole number inside a string or template literal — that
 * is a frame number: the v1 frame's `384`, `216`, `200`, `208` and its centre `192` / `108`, plus
 * whatever `FRAME_W`, `FRAME_H`, `PLAYFIELD_H` and `HUD_BOTTOM_Y` are *now* (from R2-01: `640`,
 * `360`, `336`, `348`). Comments and docblocks are never read.
 *
 * A literal that is a frame number but does not mean the frame (an HTTP status, an alpha, a key
 * code, a colour channel, the TV bench's v1 baseline row, a pinned mirror of core's constants)
 * goes on {@link ALLOWED}, one entry per file, **symbol path** and value with the reason — never a
 * line number. The test fails when a symbol holds more literals than its entry's `count` (a frame
 * number crept in beside an allowed one), fewer, or none (a stale entry), so the list cannot rot.
 * Anything that does mean the frame derives from `@shmup/core`'s constants — or, in a Node script
 * (root or an app's), from `scripts/frame.mjs`, the scripts' pinned mirror of them.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME_H, FRAME_W } from '@shmup/core';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  type AllowedFrameLiteral,
  FRAME_NUMBERS,
  frameLiteralKey,
  frameLiteralProblems,
  listSourceFiles,
  scanFrameLiterals,
} from '../../packages/core/test/helpers/frame-literal-scan.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * How a scanned file is parsed, by its name.
 *
 * @param name - A file name.
 * @returns Its script kind, or `null` when it is not a script the scan reads.
 */
function kindOf(name: string): ts.ScriptKind | null {
  if (name.endsWith('.d.ts')) return null;
  if (/\.[cm]?ts$/.test(name)) return ts.ScriptKind.TS;
  if (/\.[cm]?js$/.test(name)) return ts.ScriptKind.JS;
  return null;
}

/**
 * The trees the scan reads: every package's `src/` but core's (its own scan covers it), every
 * app's `src/` and — where it has one — `scripts/` (its build checks, packaging and bench
 * helpers), and the root `scripts/`.
 *
 * @returns Repo-relative folders, sorted.
 */
function scannedTrees(): string[] {
  const trees: string[] = [];
  for (const parent of ['packages', 'apps']) {
    for (const entry of readdirSync(join(repo, parent), { withFileTypes: true })) {
      if (!entry.isDirectory() || (parent === 'packages' && entry.name === 'core')) continue;
      trees.push(`${parent}/${entry.name}/src`);
      if (parent === 'apps' && existsSync(join(repo, parent, entry.name, 'scripts'))) {
        trees.push(`${parent}/${entry.name}/scripts`);
      }
    }
  }
  trees.push('scripts');
  return trees.sort();
}

/**
 * Every frame-number literal outside core that may stay, and why. Add an entry only for a literal
 * that does not mean the frame; a literal that does derives from core's constants (or, in a Node
 * script, from `scripts/frame.mjs`).
 */
const ALLOWED: readonly AllowedFrameLiteral[] = [
  // Mirrors of core's frame size, for code that cannot import core. Each is pinned to core by a
  // test that fails when core flips alone (owner decision O8), so the entry follows FRAME_W/H.
  {
    file: 'apps/electron/src/main/window-state.ts',
    symbol: 'FRAME_WIDTH',
    value: FRAME_W,
    reason: "Electron main's mirror of FRAME_W (O8), pinned by test/main/window-frame.test.ts",
  },
  {
    file: 'apps/electron/src/main/window-state.ts',
    symbol: 'FRAME_HEIGHT',
    value: FRAME_H,
    reason: "Electron main's mirror of FRAME_H (O8), pinned by test/main/window-frame.test.ts",
  },
  // Not a mirror: the frame a version-1 window.json counted its scale in (R2-01, W4-10).
  {
    file: 'apps/electron/src/main/window-state.ts',
    symbol: 'V1_WINDOW_FRAME_WIDTH',
    value: 384,
    reason: "v1's frame width, which a version-1 window.json's scale counts — fixed history",
  },
  {
    file: 'scripts/frame.mjs',
    symbol: 'FRAME_W',
    value: FRAME_W,
    reason: "the root scripts' mirror of FRAME_W (O8), pinned by test/scripts/frame.test.ts",
  },
  {
    file: 'scripts/frame.mjs',
    symbol: 'FRAME_H',
    value: FRAME_H,
    reason: "the root scripts' mirror of FRAME_H (O8), pinned by test/scripts/frame.test.ts",
  },
  // The TV bench's v1 baseline: 384×216 stays a measured row after R2-01 (plan R0-02, §13).
  {
    file: 'apps/tizen/src/bench/matrix.ts',
    symbol: 'BENCH_SIZES.id',
    value: 384,
    reason: "the TV bench's v1 baseline row '384x216': data that outlives R2-01 (R0-02, §13)",
  },
  {
    file: 'apps/tizen/src/bench/matrix.ts',
    symbol: 'BENCH_SIZES.id',
    value: 216,
    reason: "the TV bench's v1 baseline row '384x216': data that outlives R2-01 (R0-02, §13)",
  },
  {
    file: 'apps/tizen/src/bench/matrix.ts',
    symbol: 'BENCH_SIZES.width',
    value: 384,
    reason: "the TV bench's v1 baseline row's width: data that outlives R2-01 (R0-02, §13)",
  },
  {
    file: 'apps/tizen/src/bench/matrix.ts',
    symbol: 'BENCH_SIZES.height',
    value: 216,
    reason: "the TV bench's v1 baseline row's height: data that outlives R2-01 (R0-02, §13)",
  },
  // HTTP status codes: 200 = OK.
  {
    file: 'packages/audio-web/src/loader/index.ts',
    symbol: 'loadArrayBuffer.ok',
    value: 200,
    reason: 'an HTTP status: 2xx (or 0 from file://) means the audio file loaded',
  },
  {
    file: 'packages/shell/src/telemetry/index.ts',
    symbol: 'RenderReporter.send',
    value: 200,
    reason: 'an HTTP status: 2xx means the log server took the render report',
  },
  {
    file: 'packages/shell/src/telemetry/index.ts',
    symbol: 'sendRenderBench.ok',
    value: 200,
    reason: 'an HTTP status: 2xx means the log server took the render bench result',
  },
  {
    file: 'scripts/doc-screenshots.mjs',
    symbol: 'serveBuild.server',
    value: 200,
    reason: "an HTTP status: the screenshot script's static server answers 200 OK",
  },
  {
    file: 'apps/tizen/scripts/tizen-watch.mjs',
    symbol: 'createLiveReloadServer.server',
    value: 200,
    reason: "an HTTP status: the live-reload dev server answers 200 OK with the build's file",
  },
  // A key code.
  {
    file: 'packages/input-web/src/rebind/index.ts',
    symbol: 'CODE_KEY_CODES.Backquote',
    value: 192,
    reason: "a DOM keyCode: the Backquote key's legacy keyCode is 192",
  },
  // Alphas (0–255) and colour channels.
  {
    file: 'packages/render-pixi/src/debug/index.ts',
    symbol: 'buildDebugPanel',
    value: 200,
    count: 2,
    reason: "alphas: the debug overlay's two frame-graph guide lines are drawn at 200 / 255",
  },
  {
    file: 'scripts/assets/procedural/backdrops.mjs',
    symbol: 'generate',
    value: 200,
    reason: "an alpha: the azure planet's lit rim row is drawn at 200 / 255",
  },
  {
    file: 'scripts/assets/procedural/brine.mjs',
    symbol: 'bubbleFrame',
    value: 200,
    reason: "an alpha: the bubble's film is drawn at 200 / 255",
  },
  {
    file: 'scripts/assets/procedural/dune.mjs',
    symbol: 'geyserFrame',
    value: 200,
    reason: "an alpha: the geyser's cloud puff is drawn at 200 / 255",
  },
  {
    file: 'scripts/assets/procedural/magma.mjs',
    symbol: 'wispFrame',
    value: 200,
    reason: "an alpha: the wisp's flame stroke is drawn at 200 / 255",
  },
  {
    file: 'scripts/doc-images.mjs',
    symbol: 'TITLE_INK',
    value: 200,
    reason: "a colour channel: the green 0xc8 of the UI kit's title colour",
  },
  {
    file: 'scripts/store-assets.mjs',
    symbol: 'CAPTION',
    value: 208,
    reason: "a colour channel: the green 0xd0 of the placeholder screenshots' caption ink",
  },
  // A brightness threshold.
  {
    file: 'scripts/doc-screenshots.mjs',
    symbol: 'litPixels',
    value: 384,
    reason: 'a brightness sum: R + G + B above half of 3 × 256 counts as a lit pixel',
  },
];

describe('the repo outside core: no literal frame numbers (plan R1-02)', () => {
  const trees = scannedTrees();
  const files: string[] = [];
  for (const tree of trees) {
    for (const file of listSourceFiles(join(repo, tree), (name) => kindOf(name) !== null)) {
      files.push(`${tree}/${file}`);
    }
  }
  const hits = files.flatMap((file) =>
    scanFrameLiterals(file, readFileSync(join(repo, file), 'utf8'), kindOf(file) as ts.ScriptKind),
  );

  it('scans every other package, every app with its scripts, and the root scripts', () => {
    expect(trees).toEqual(
      expect.arrayContaining([
        'packages/render-pixi/src',
        'packages/shell/src',
        'packages/audio-web/src',
        'packages/input-web/src',
        'apps/web/src',
        'apps/tizen/src',
        'apps/webos/src',
        'apps/electron/src',
        'apps/tizen/scripts',
        'apps/webos/scripts',
        'apps/electron/scripts',
        'scripts',
      ]),
    );
    expect(trees).not.toContain('packages/core/src');
    expect(files.length).toBeGreaterThan(100);
    for (const file of [
      'packages/render-pixi/src/renderer/index.ts',
      'packages/shell/src/boot/index.ts',
      'apps/electron/src/main/window-state.ts',
      'apps/electron/src/preload/preload.cts',
      'apps/tizen/scripts/check-bundle.mjs',
      'apps/webos/scripts/appinfo.mjs',
      'scripts/frame.mjs',
      'scripts/content/rescale.mjs',
      'scripts/assets/procedural/terrain.mjs',
    ]) {
      expect(files).toContain(file);
    }
  });

  it('has no frame number outside the allow-list, and every entry still matches', () => {
    const problems = frameLiteralProblems(
      hits,
      ALLOWED,
      "derive it from @shmup/core's constants (in a Node script: from scripts/frame.mjs)",
    );
    expect(problems).toEqual([]);
  });

  it('keeps the allow-list well formed', () => {
    const keys = ALLOWED.map(frameLiteralKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of ALLOWED) {
      expect(files, entry.file).toContain(entry.file);
      expect(FRAME_NUMBERS.has(entry.value), frameLiteralKey(entry)).toBe(true);
      expect(entry.reason.trim().length, frameLiteralKey(entry)).toBeGreaterThan(10);
    }
  });

  it('reports unlisted literals, and stale or miscounted entries', () => {
    const sample = scanFrameLiterals(
      'scripts/sample.mjs',
      'export const PANEL = { w: 384, h: 216 };\nexport const OK = [200, 200];',
      ts.ScriptKind.JS,
    );
    const entry = (symbol: string, value: number, count?: number): AllowedFrameLiteral => ({
      file: 'scripts/sample.mjs',
      symbol,
      value,
      count,
      reason: 'a sample entry',
    });
    expect(
      frameLiteralProblems(
        sample,
        [entry('PANEL.w', 384), entry('OK', 200), entry('GONE', 208)],
        'fix it',
      ),
    ).toEqual([
      'scripts/sample.mjs › OK = 200: the allow-list expects 1 literal(s), the source has 2',
      'scripts/sample.mjs › GONE = 208: the allow-list expects 1 literal(s), the source has 0',
      'scripts/sample.mjs › PANEL.h = 216 (line 1): a frame number — fix it',
    ]);
    expect(
      frameLiteralProblems(
        sample,
        [entry('PANEL.w', 384), entry('PANEL.h', 216), entry('OK', 200, 2)],
        'x',
      ),
    ).toEqual([]);
  });

  it('skips the digits of a CSS hex colour in a string, and nothing else (R2-01, W4-11)', () => {
    const sample = [
      "export const ROCK = ['#336a64', '#384', '#2160', '#c0d8ff', '#216216ff'];",
      "export const LABEL = 'row 384 of #208';",
      'export const MIXED = `#123456 ${216} and 360px`;',
      "export const NOT_HEX = ['384#', 'zone #9 216'];",
    ].join('\n');
    expect(
      scanFrameLiterals('sample.mjs', sample, ts.ScriptKind.JS).map(
        (h) => `${h.symbol}=${h.value}@${h.line}`,
      ),
    ).toEqual([
      'LABEL=384@2',
      'MIXED=216@3',
      // 360 is a frame number from R2-01's flip on: a plain number beside a colour still counts.
      ...(FRAME_NUMBERS.has(360) ? ['MIXED=360@3'] : []),
      'NOT_HEX=384@4',
      'NOT_HEX=216@4',
    ]);
  });

  it('reads a root script as JavaScript and still skips its comments', () => {
    const sample = [
      '// 384 in a line comment',
      '/** @param {number} w - 216 in a JSDoc block. */',
      'export function capture(w = /** @type {number} */ (384)) {',
      '  const view = { width: w * 3, height: 216 * 3 };',
      '  return `${view.width}x648 or 1152x208`;',
      '}',
      'export const BAND = [130, 150];',
    ].join('\n');
    expect(
      scanFrameLiterals('sample.mjs', sample, ts.ScriptKind.JS).map(
        (h) => `${h.symbol}=${h.value}@${h.line}`,
      ),
    ).toEqual(['capture.w=384@3', 'capture.view.height=216@4', 'capture=208@5']);
  });
});
