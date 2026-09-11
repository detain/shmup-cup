/**
 * Unit tests for scripts/check-bundle.mjs: every rule must reject a bundle that would
 * break on Tizen 5.5 (Chromium 69), using small fixture folders instead of a real build.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POLYFILL_BANNER, checkTizenBundle } from '../../scripts/check-bundle.mjs';

const polyfill = readFileSync(new URL('../../polyfills/global-this.js', import.meta.url), 'utf8');
const GOOD_HTML =
  '<!doctype html><html><head><script defer src="./app.js"></script></head><body><canvas id="game"></canvas></body></html>';
const GOOD_APP = `${polyfill}\n(function () {\n  'use strict';\n  var x = { a: 1 };\n  var y = Object.assign({}, x, { b: 2 });\n  async function f() { for await (const v of []) { void v; } }\n  void f; void y;\n})();\n`;

let dir = '';

/**
 * Writes a file into the fixture folder.
 *
 * @param name - Relative path.
 * @param contents - File contents.
 */
function put(name: string, contents: string): void {
  const file = join(dir, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shmup-check-bundle-'));
  put('index.html', GOOD_HTML);
  put('app.js', GOOD_APP);
  put('config.xml', '<widget/>');
  put('icon.png', 'png');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('tizen/scripts/check-bundle checkTizenBundle', () => {
  it('accepts a valid bundle (ES2018 features such as async iteration and object spread are fine)', () => {
    put('app.js', `${GOOD_APP}\n(function () { var o = { ...{ a: 1 } }; void o; })();\n`);
    const result = checkTizenBundle(dir);
    expect(result.problems).toEqual([]);
    expect(result.files.sort()).toEqual(['app.js', 'config.xml', 'icon.png', 'index.html']);
    expect(result.code.startsWith(POLYFILL_BANNER)).toBe(true);
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

  it('reports a missing build folder instead of throwing', () => {
    const missing = join(dir, 'nope');
    expect(checkTizenBundle(missing).problems).toEqual([
      `${missing} does not exist — run vite build first`,
    ]);
  });
});
