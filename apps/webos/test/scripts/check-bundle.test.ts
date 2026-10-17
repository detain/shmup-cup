/**
 * `scripts/check-bundle.mjs` (plan M3-03): the post-build check of `apps/webos/dist`, run against
 * fixture folders. It shares its budgets with the Tizen widget's check, which is the point — one
 * source of truth for `APP_JS_GZIP_BUDGET`, `ATLAS_PAGE_MAX_SIZE` and `DIST_BUDGET` — and, since
 * plan R1-05, its rule 10 (`checkAtlasManifest`: the atlas manifest ships as
 * `assets/atlas/main.json`, not inlined into `app.js`).
 *
 * @module
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  APP_JS_GZIP_BUDGET,
  ATLAS_PAGE_MAX_SIZE,
  DIST_BUDGET,
  MAX_INLINED_FRAME_NAMES,
  TV_BENCH_MARKER,
} from '../../../tizen/scripts/check-bundle.mjs';
import { WEBOS_APP_FILES, checkWebosBundle } from '../../scripts/check-bundle.mjs';
import { BENCH_APPINFO_ID, benchAppInfo, validateAppInfo } from '../../scripts/appinfo.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The committed manifest, reused as the fixture's. */
const APPINFO = readFileSync(
  fileURLToPath(new URL('../../public/appinfo.json', import.meta.url)),
  'utf8',
);

/** A 1x1 PNG (IHDR is all `pngSize` reads). */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100' +
    '05fe02fea7b1b3c00000000049454e44ae426082',
  'hex',
);

let dir: string;

/**
 * Writes a file into the fixture dist folder.
 *
 * @param path - Path below `dist/`.
 * @param data - Contents.
 */
function put(path: string, data: string | Uint8Array): void {
  const file = join(dir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}

/** Frame names of the fixture manifest. */
const FRAMES = Array.from({ length: 12 }, (_, i) => `ships/kestrel#${i}`);

/**
 * The fixture's atlas manifest: one 1×1 page (`main.png`, the `PNG` fixture) and {@link FRAMES}.
 *
 * @returns The JSON text.
 */
function manifestJson(): string {
  const frames: Record<string, unknown> = {};
  for (const name of FRAMES) frames[name] = { p: 0, x: 0, y: 0, w: 1, h: 1, ax: 0, ay: 0 };
  const pages = [{ file: 'main.png', w: 1, h: 1, group: 'common' }];
  return JSON.stringify({
    formatVersion: 2,
    pages,
    frames,
    sprites: {},
    animations: {},
    fonts: {},
  });
}

/** Writes a complete, valid fixture bundle. */
function goodBundle(): void {
  put('app.js', '/* Shmup Cup — globalThis polyfill */\nvar x = 1;\n');
  put('index.html', '<!doctype html><script defer src="./app.js"></script>');
  put('appinfo.json', APPINFO);
  put('icon.png', PNG);
  put('largeIcon.png', PNG);
  put('assets/atlas/main.png', PNG);
  put('assets/atlas/main.json', manifestJson());
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shmup-webos-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('webos check-bundle (M3-03)', () => {
  it('accepts a complete bundle', () => {
    goodBundle();
    const result = checkWebosBundle(dir);
    expect(result.problems).toEqual([]);
    expect(result.files).toEqual(
      [...WEBOS_APP_FILES, 'assets/atlas/main.json', 'assets/atlas/main.png'].sort(),
    );
    expect(result.gzipBytes).toBeGreaterThan(0);
  });

  it('reports a missing dist folder', () => {
    expect(checkWebosBundle(join(dir, 'nope')).problems[0]).toMatch(/does not exist/);
  });

  it('rejects a module script tag, a second script and a missing app file', () => {
    put('app.js', '/* Shmup Cup — globalThis polyfill */\n');
    put('chunk.js', '');
    put('index.html', '<script type="module" crossorigin src="./app.js"></script>');
    const { problems } = checkWebosBundle(dir);
    expect(problems.join('\n')).toMatch(/exactly one script/);
    expect(problems.join('\n')).toMatch(/type="module"/);
    expect(problems).toContain('dist/appinfo.json is missing');
    expect(problems).toContain('dist/largeIcon.png is missing');
    expect(problems).toContain('dist/assets/atlas/ holds no atlas page');
  });

  it('rejects syntax newer than ES2018 and a missing polyfill banner', () => {
    goodBundle();
    put('app.js', 'const a = b?.c ?? 1;\n');
    const { problems } = checkWebosBundle(dir);
    expect(problems.join('\n')).toMatch(/does not parse as an ES2018 script/);
    expect(problems).toContain('app.js does not start with the globalThis polyfill banner');
  });

  it('passes an invalid appinfo.json straight through from the validator', () => {
    goodBundle();
    put('appinfo.json', '{"id":"nope"}');
    const { problems } = checkWebosBundle(dir);
    for (const problem of validateAppInfo('{"id":"nope"}')) expect(problems).toContain(problem);
  });

  it('rejects stray files outside assets/', () => {
    goodBundle();
    put('README.txt', 'hello');
    expect(checkWebosBundle(dir).problems).toContain('unexpected file in dist/: README.txt');
  });

  it('shares the Tizen widget’s budgets', () => {
    expect([APP_JS_GZIP_BUDGET, ATLAS_PAGE_MAX_SIZE, DIST_BUDGET]).toEqual([
      512 * 1024,
      2048,
      8 * 1024 * 1024,
    ]);
    goodBundle();
    put('assets/big.bin', new Uint8Array(DIST_BUDGET));
    expect(checkWebosBundle(dir).problems.join('\n')).toMatch(/over the .* budget/);
  });

  it('rule 10 (R1-05): needs the atlas manifest next to its pages', () => {
    goodBundle();
    rmSync(join(dir, 'assets', 'atlas', 'main.json'));
    expect(checkWebosBundle(dir).problems).toEqual([
      'assets/atlas/main.json is missing (the shell fetches the atlas manifest at boot)',
    ]);
    goodBundle();
    put('assets/atlas/main-1.png', PNG);
    expect(checkWebosBundle(dir).problems).toEqual([
      'assets/atlas/main-1.png is not listed in assets/atlas/main.json (a stale page?)',
    ]);
  });

  it('rule 10 (R1-05): rejects an app.js that carries the manifest inlined', () => {
    goodBundle();
    const names = FRAMES.slice(0, MAX_INLINED_FRAME_NAMES + 1).map((name) => `'${name}'`);
    put('app.js', `/* Shmup Cup — globalThis polyfill */\nvar f = [${names.join(',')}];\n`);
    const { problems } = checkWebosBundle(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      new RegExp(
        `^app\\.js names ${MAX_INLINED_FRAME_NAMES + 1} atlas frames \\(ships/kestrel#0, `,
      ),
    );
  });

  it('rule 10 (R1-05): the bench is exempt (it inlines its own density atlases)', () => {
    goodBundle();
    rmSync(join(dir, 'assets', 'atlas', 'main.json'));
    put('appinfo.json', benchAppInfo(APPINFO));
    put('app.js', `/* Shmup Cup — globalThis polyfill */\nvar m = '${TV_BENCH_MARKER}';\n`);
    expect(BENCH_APPINFO_ID).not.toBe((JSON.parse(APPINFO) as { id: string }).id);
    expect(checkWebosBundle(dir).problems).toEqual([]);
  });
});
