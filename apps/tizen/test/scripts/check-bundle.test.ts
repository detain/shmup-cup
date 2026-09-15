/**
 * Unit tests for scripts/check-bundle.mjs: every rule must reject a bundle that would
 * break on Tizen 5.5 (Chromium 69), using small fixture folders instead of a real build.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  APP_JS_GZIP_BUDGET,
  ATLAS_PAGE_MAX_SIZE,
  DIST_BUDGET,
  POLYFILL_BANNER,
  WIDGET_FILES,
  checkTizenBundle,
  pngSize,
} from '../../scripts/check-bundle.mjs';

const polyfill = readFileSync(new URL('../../polyfills/global-this.js', import.meta.url), 'utf8');
/** The shipped (default-variant) config.xml — the bundle check validates it (M2-17). */
const CONFIG_XML = readFileSync(new URL('../../public/config.xml', import.meta.url), 'utf8');
const GOOD_HTML =
  '<!doctype html><html><head><script defer src="./app.js"></script></head><body><canvas id="game"></canvas></body></html>';
const GOOD_APP = `${polyfill}\n(function () {\n  'use strict';\n  var x = { a: 1 };\n  var y = Object.assign({}, x, { b: 2 });\n  async function f() { for await (const v of []) { void v; } }\n  void f; void y;\n})();\n`;

let dir = '';

/**
 * The start of a PNG: signature and IHDR chunk with the given size (enough for the page check).
 *
 * @param width - Width in pixels.
 * @param height - Height in pixels.
 * @returns The bytes.
 */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** An atlas page within budget. */
const PAGE = png(512, 512);

/**
 * Writes a file into the fixture folder.
 *
 * @param name - Relative path.
 * @param contents - File contents.
 */
function put(name: string, contents: string | Uint8Array): void {
  const file = join(dir, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shmup-check-bundle-'));
  put('index.html', GOOD_HTML);
  put('app.js', GOOD_APP);
  put('config.xml', CONFIG_XML);
  put('icon.png', 'png');
  put('assets/atlas/main.png', PAGE);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('tizen/scripts/check-bundle checkTizenBundle', () => {
  it('accepts a valid bundle (ES2018 features such as async iteration and object spread are fine)', () => {
    put('app.js', `${GOOD_APP}\n(function () { var o = { ...{ a: 1 } }; void o; })();\n`);
    const result = checkTizenBundle(dir);
    expect(result.problems).toEqual([]);
    expect(result.files.sort()).toEqual([
      'app.js',
      'assets/atlas/main.png',
      'config.xml',
      'icon.png',
      'index.html',
    ]);
    expect(result.code.startsWith(POLYFILL_BANNER)).toBe(true);
  });

  it('accepts non-script assets under dist/assets/ (atlas pages) next to the one script', () => {
    put('assets/atlas/main-1.png', PAGE);
    const result = checkTizenBundle(dir);
    expect(result.problems).toEqual([]);
    expect(result.files.sort()).toEqual([
      'app.js',
      'assets/atlas/main-1.png',
      'assets/atlas/main.png',
      'config.xml',
      'icon.png',
      'index.html',
    ]);
  });

  it('rejects stray files outside dist/assets/ (they would end up in the .wgt)', () => {
    put('notes.txt', 'oops');
    put('atlas/main.png', 'png');
    expect(checkTizenBundle(dir).problems).toEqual([
      'unexpected files outside dist/assets/: atlas/main.png, notes.txt',
    ]);
  });

  it('matches dist/assets/ as a folder, not as a name prefix (assetsx/, a file named "assets")', () => {
    put('assetsx/main.png', 'png');
    put('assets.png', 'png');
    put('assets/deep/nested/data.bin', 'bin');
    expect(checkTizenBundle(dir).problems).toEqual([
      'unexpected files outside dist/assets/: assets.png, assetsx/main.png',
    ]);
  });

  it('allows the atlas manifest and any number of pages under dist/assets/atlas/', () => {
    for (let i = 0; i < 4; i++) put(`assets/atlas/main${i === 0 ? '' : `-${i}`}.png`, PAGE);
    put('assets/atlas/main.json', '{}');
    expect(checkTizenBundle(dir).problems).toEqual([]);
  });

  it('still rejects a script hidden under dist/assets/ (reported once, as a second script)', () => {
    put('assets/atlas/loader.js', 'void 0;');
    const { problems } = checkTizenBundle(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('assets/atlas/loader.js');
  });

  it('lists the widget files', () => {
    expect([...WIDGET_FILES].sort()).toEqual(['app.js', 'config.xml', 'icon.png', 'index.html']);
  });

  it('the polyfill banner constant matches the first line of polyfills/global-this.js', () => {
    expect(polyfill.startsWith(POLYFILL_BANNER)).toBe(true);
  });

  it.each([
    ['optional chaining (Chrome 80)', 'var a = {}; a?.b;'],
    ['nullish coalescing (Chrome 80)', 'var a = null ?? 1;'],
    ['optional catch binding (ES2019)', 'try { f(); } catch { }'],
    ['class fields (Chrome 72)', 'class A { x = 1; }'],
    ['BigInt literals (ES2020)', 'var n = 10n;'],
    ['numeric separators (ES2021)', 'var n = 1_000;'],
    ['dynamic import()', "import('./chunk.js');"],
    ['import.meta', 'var u = import.meta.url;'],
    ['ES module syntax', 'export var a = 1;'],
  ])('rejects %s', (_label, snippet) => {
    put('app.js', `${polyfill}\n${snippet}\n`);
    const { problems } = checkTizenBundle(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/app\.js is not a valid ES2018 script/);
    expect(problems[0]).toMatch(/near: …/);
  });

  it('rejects a bundle that does not start with the globalThis polyfill', () => {
    put('app.js', '(function () {})();\n' + polyfill);
    expect(checkTizenBundle(dir).problems).toEqual([
      'app.js does not start with the globalThis polyfill banner',
    ]);
  });

  it('tolerates leading whitespace before the polyfill banner', () => {
    put('app.js', `\n\n  ${GOOD_APP}`);
    expect(checkTizenBundle(dir).problems).toEqual([]);
  });

  it('rejects code-split chunks and extra scripts', () => {
    put('assets/chunk-abc.js', 'void 0;');
    put('worker.mjs', 'void 0;');
    const { problems } = checkTizenBundle(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('expected exactly one script "app.js"');
    expect(problems[0]).toContain('assets/chunk-abc.js');
    expect(problems[0]).toContain('worker.mjs');
  });

  it('rejects a script with another name', () => {
    unlinkSync(join(dir, 'app.js'));
    put('index.js', GOOD_APP);
    const { problems } = checkTizenBundle(dir);
    expect(problems).toContain('expected exactly one script "app.js" in dist/, found: index.js');
    expect(problems).toContain('dist/app.js is missing');
  });

  it('rejects a module script tag', () => {
    put('index.html', GOOD_HTML.replace('<script defer', '<script type="module" defer'));
    const { problems } = checkTizenBundle(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/still loads a module script/);
  });

  it('rejects a script tag that is not deferred (it would run before <canvas> exists)', () => {
    put('index.html', GOOD_HTML.replace('<script defer ', '<script '));
    expect(checkTizenBundle(dir).problems).toEqual([
      'index.html script is not deferred: <script src="./app.js">',
    ]);
  });

  it('rejects a script tag that loads something else', () => {
    put('index.html', GOOD_HTML.replace('./app.js', '/app.js'));
    expect(checkTizenBundle(dir).problems).toEqual([
      'index.html script does not load ./app.js: <script defer src="/app.js">',
    ]);
  });

  it('rejects more than one script tag but ignores scripts inside HTML comments', () => {
    put(
      'index.html',
      GOOD_HTML.replace('</head>', '<script defer src="./app.js"></script></head>'),
    );
    expect(checkTizenBundle(dir).problems).toEqual([
      'index.html should contain exactly one <script> tag, found 2',
    ]);
    put(
      'index.html',
      GOOD_HTML.replace(
        '</body>',
        '<!-- <script type="module" src="./src/main.ts"></script> --></body>',
      ),
    );
    expect(checkTizenBundle(dir).problems).toEqual([]);
  });

  it.each(['config.xml', 'icon.png', 'index.html'])('reports a missing %s', (name) => {
    unlinkSync(join(dir, name));
    expect(checkTizenBundle(dir).problems).toContain(`dist/${name} is missing`);
  });

  it('reports a bundle without any atlas page (rule 7: the shell cannot boot without it)', () => {
    unlinkSync(join(dir, 'assets', 'atlas', 'main.png'));
    put('assets/atlas/main.json', '{}');
    put('assets/other/main.png', 'png');
    expect(checkTizenBundle(dir).problems).toEqual([
      'no atlas page in dist/assets/atlas/ (the game cannot boot without it)',
    ]);
  });

  it('reads the pixel size of a PNG and rejects anything else', () => {
    expect(pngSize(png(2048, 1024))).toEqual({ width: 2048, height: 1024 });
    expect(pngSize(new TextEncoder().encode('png'))).toBeNull();
    const notIhdr = png(1, 1);
    notIhdr[12] = 0x49 + 1;
    expect(pngSize(notIhdr)).toBeNull();
  });

  it('keeps the budgets: 512 KB gzip (350 KB until M2-16, 384 KB until M3-02), 2048² pages, 8 MB', () => {
    expect([APP_JS_GZIP_BUDGET, ATLAS_PAGE_MAX_SIZE, DIST_BUDGET]).toEqual([
      512 * 1024,
      2048,
      8 * 1024 * 1024,
    ]);
    const result = checkTizenBundle(dir);
    expect(result.problems).toEqual([]);
    expect(result.gzipBytes).toBeGreaterThan(0);
    expect(result.distBytes).toBeGreaterThan(result.code.length);
  });

  it('rejects an atlas page over 2048² and one that is not a PNG', () => {
    put('assets/atlas/main-1.png', png(4096, 2048));
    put('assets/atlas/main-2.png', 'png');
    put('assets/atlas/main-3.png', png(2048, 2048));
    expect(checkTizenBundle(dir).problems).toEqual([
      'atlas page assets/atlas/main-1.png is 4096×2048, over the 2048² budget',
      'atlas page assets/atlas/main-2.png is not a PNG',
    ]);
  });

  it('rejects an app.js over 512 KB gzipped and a dist/ over 8 MB', () => {
    // Random-looking text barely compresses: ~1.3 MB of it stays far over the gzip budget.
    let state = 1;
    let noise = '';
    for (let i = 0; i < 200_000; i++) {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      noise += state.toString(36);
    }
    put('app.js', `${GOOD_APP}\n/* ${noise} */\n`);
    put('assets/big.bin', new Uint8Array(DIST_BUDGET));
    const problems = checkTizenBundle(dir).problems;
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^app\.js is [\d.]+ KB gzipped, over the 512\.0 KB budget$/);
    expect(problems[1]).toMatch(/^dist\/ holds [\d.]+ KB, over the 8192\.0 KB budget$/);
  });

  it('reports a missing build folder instead of throwing', () => {
    const missing = join(dir, 'nope');
    expect(checkTizenBundle(missing).problems).toEqual([
      `${missing} does not exist — run vite build first`,
    ]);
  });
});
