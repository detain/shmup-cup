/**
 * Unit tests for scripts/check-bundle.mjs: every rule must reject a bundle that would
 * break on Tizen 5.5 (Chromium 69), using small fixture folders instead of a real build.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  APP_JS_GZIP_BUDGET,
  ATLAS_PAGE_MAX_SIZE,
  DIST_BUDGET,
  MATCH_ALL_BANNER,
  MEDIA_STILL_COUNT,
  MEDIA_VIDEO_CLIP_COUNT,
  POLYFILL_BANNER,
  STILLS_LEDGER_FILE,
  VIDEO_LEDGER_FILE,
  WIDGET_FILES,
  checkBundleEngineFloor,
  checkEraMedia,
  checkTizenBundle,
  pngSize,
} from '../../scripts/check-bundle.mjs';
import { STILL_SURFACES, VIDEO_CLIPS } from '@shmup/shell';

const polyfill = readFileSync(new URL('../../polyfills/global-this.js', import.meta.url), 'utf8');
const matchAllPolyfill = readFileSync(
  new URL('../../polyfills/string-match-all.js', import.meta.url),
  'utf8',
);
/** The shipped (default-variant) config.xml — the bundle check validates it (M2-17). */
const CONFIG_XML = readFileSync(new URL('../../public/config.xml', import.meta.url), 'utf8');
const GOOD_HTML =
  '<!doctype html><html><head><script defer src="./app.js"></script></head><body><canvas id="game"></canvas></body></html>';
const GOOD_APP = `${polyfill}${matchAllPolyfill}\n(function () {\n  'use strict';\n  var x = { a: 1 };\n  var y = Object.assign({}, x, { b: 2 });\n  async function f() { for await (const v of []) { void v; } }\n  void f; void y;\n})();\n`;
/** The one rule 4 problem a bundle that does not open with the pair earns (positional, w14). */
const PAIR_PROBLEM =
  "app.js does not open with the polyfill pair (the globalThis file's text, then the matchAll " +
  "file's text, verbatim — apps/tizen/vite.config.ts postBanner)";

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

/**
 * Writes `assets/atlas/main.json` listing every PNG directly in `assets/atlas/` with its pixel size
 * (rule 10, plan R1-05: the manifest ships next to the pages and must match them).
 */
function syncManifest(): void {
  const atlas = join(dir, 'assets', 'atlas');
  const files = existsSync(atlas) ? readdirSync(atlas).filter((f) => f.endsWith('.png')) : [];
  const pages = files.sort().map((file) => {
    const size = pngSize(readFileSync(join(atlas, file)));
    return { file, w: size?.width ?? 0, h: size?.height ?? 0 };
  });
  const manifest = { formatVersion: 1, pages, frames: {}, sprites: {}, animations: {}, fonts: {} };
  put('assets/atlas/main.json', JSON.stringify(manifest));
}

/**
 * Rule 11 (v20x-VIDIO1): the media files a complete era build carries under `assets/video/` and
 * `assets/stills/`. The ids are synthetic — the rule compares ledger row COUNTS and file
 * presence, never names or digests (the encoder is not byte-deterministic across ffmpeg builds).
 *
 * @returns The dist-relative paths.
 */
function eraMediaFiles(): string[] {
  const clips: string[] = [];
  for (let i = 0; i < MEDIA_VIDEO_CLIP_COUNT; i++) clips.push(`assets/video/clip-${i}.mp4`);
  const stills: string[] = [];
  for (let i = 0; i < MEDIA_STILL_COUNT; i++) stills.push(`assets/stills/still-${i}.png`);
  return [
    'assets/stills/LICENSES-stills.md',
    ...stills,
    STILLS_LEDGER_FILE,
    'assets/video/LICENSES-videos.md',
    ...clips,
    VIDEO_LEDGER_FILE,
  ];
}

/** Writes the complete rule 11 set (ledgers, licences, every media file) into the fixture. */
function putEraMedia(): void {
  const clips = Array.from({ length: MEDIA_VIDEO_CLIP_COUNT }, (_, i) => `clip-${i}.mp4`);
  for (const file of clips) put(`assets/video/${file}`, 'x');
  put(VIDEO_LEDGER_FILE, JSON.stringify({ clips: clips.map((file) => ({ file })) }));
  put('assets/video/LICENSES-videos.md', '# videos');
  const stills = Array.from({ length: MEDIA_STILL_COUNT }, (_, i) => `still-${i}.png`);
  for (const file of stills) put(`assets/stills/${file}`, 'x');
  put(STILLS_LEDGER_FILE, JSON.stringify({ stills: stills.map((file) => ({ file })) }));
  put('assets/stills/LICENSES-stills.md', '# stills');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shmup-check-bundle-'));
  put('index.html', GOOD_HTML);
  put('app.js', GOOD_APP);
  put('config.xml', CONFIG_XML);
  put('icon.png', 'png');
  put('assets/atlas/main.png', PAGE);
  syncManifest();
  putEraMedia();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('tizen/scripts/check-bundle checkTizenBundle', () => {
  it('accepts a valid bundle (ES2018 features such as async iteration and object spread are fine)', () => {
    put('app.js', `${GOOD_APP}\n(function () { var o = { ...{ a: 1 } }; void o; })();\n`);
    const result = checkTizenBundle(dir);
    expect(result.problems).toEqual([]);
    expect(result.files.sort()).toEqual(
      [
        'app.js',
        'assets/atlas/main.json',
        'assets/atlas/main.png',
        'config.xml',
        'icon.png',
        'index.html',
        ...eraMediaFiles(),
      ].sort(),
    );
    expect(result.code.startsWith(POLYFILL_BANNER)).toBe(true);
  });

  it('accepts non-script assets under dist/assets/ (atlas pages) next to the one script', () => {
    put('assets/atlas/main-1.png', PAGE);
    syncManifest();
    const result = checkTizenBundle(dir);
    expect(result.problems).toEqual([]);
    expect(result.files.sort()).toEqual(
      [
        'app.js',
        'assets/atlas/main-1.png',
        'assets/atlas/main.json',
        'assets/atlas/main.png',
        'config.xml',
        'icon.png',
        'index.html',
        ...eraMediaFiles(),
      ].sort(),
    );
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
    syncManifest();
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

  it('the polyfill banner constants match the first lines of the polyfill files', () => {
    expect(polyfill.startsWith(POLYFILL_BANNER)).toBe(true);
    expect(matchAllPolyfill.startsWith(MATCH_ALL_BANNER)).toBe(true);
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
    put('app.js', `${polyfill}${matchAllPolyfill}\n${snippet}\n`);
    const { problems } = checkTizenBundle(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/app\.js is not a valid ES2018 script/);
    expect(problems[0]).toMatch(/near: …/);
  });

  it('rejects a bundle that does not open with the polyfill pair', () => {
    put('app.js', '(function () {})();\n' + polyfill);
    expect(checkTizenBundle(dir).problems).toEqual([PAIR_PROBLEM]);
  });

  it('rejects a bundle that opens with only the globalThis half of the pair (PixiJS 8.22, w14)', () => {
    put('app.js', `${polyfill}\n(function () {})();\n`);
    expect(checkTizenBundle(dir).problems).toEqual([PAIR_PROBLEM]);
  });

  it('rejects the planted reorder — matchAll behind the app code runs unbacked (self-check)', () => {
    // The exact shape the old permissive `includes` gate let through: every byte present, wrong
    // position. Rule 13 loses its two-site licence here too — its tolerance rides rule 4's.
    put(
      'app.js',
      `${polyfill}\n(function () { void 'x'.matchAll(/re/g); })();\n${matchAllPolyfill}`,
    );
    expect(checkTizenBundle(dir).problems).toEqual([
      PAIR_PROBLEM,
      expect.stringContaining('String.prototype.matchAll'),
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
    put('assets/other/main.png', 'png');
    expect(checkTizenBundle(dir).problems).toEqual([
      'no atlas page in dist/assets/atlas/ (the game cannot boot without it)',
      // Rule 10 (R1-05): the manifest still lists it.
      'assets/atlas/main.json lists assets/atlas/main.png, which is missing',
    ]);
  });

  it('reads the pixel size of a PNG and rejects anything else', () => {
    expect(pngSize(png(2048, 1024))).toEqual({ width: 2048, height: 1024 });
    expect(pngSize(new TextEncoder().encode('png'))).toBeNull();
    const notIhdr = png(1, 1);
    notIhdr[12] = 0x49 + 1;
    expect(pngSize(notIhdr)).toBeNull();
  });

  it('keeps the budgets: 512 KB gzip (350 KB until M2-16, 384 KB until M3-02), 2048² pages, 16 MB', () => {
    expect([APP_JS_GZIP_BUDGET, ATLAS_PAGE_MAX_SIZE, DIST_BUDGET]).toEqual([
      512 * 1024,
      2048,
      24 * 1024 * 1024,
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
    syncManifest();
    expect(checkTizenBundle(dir).problems).toEqual([
      'atlas page assets/atlas/main-1.png is 4096×2048, over the 2048² budget',
      'atlas page assets/atlas/main-2.png is not a PNG',
    ]);
  });

  it('rejects an app.js over 512 KB gzipped and a dist/ over 16 MB', () => {
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
    expect(problems[1]).toMatch(/^dist\/ holds [\d.]+ KB, over the 24576.0 KB budget$/);
  });

  it('reports a missing build folder instead of throwing', () => {
    const missing = join(dir, 'nope');
    expect(checkTizenBundle(missing).problems).toEqual([
      `${missing} does not exist — run vite build first`,
    ]);
  });
});

describe('tizen/scripts/check-bundle rule 11 — the era media ships (v20x-VIDIO1)', () => {
  // The baked-off kill switches (v20x-CIFIX2): CI exports SHMUP_NO_VIDEO=1 workflow-wide to
  // build the clip-less variant, and this suite's checks read the default process.env inside
  // checkTizenBundle. Every test here starts from the baked-in state — the problems it asserts
  // are its own fixture's, not the runner's setting — and the ambient value comes back after.
  let savedNoVideo: string | undefined;
  let savedNoStills: string | undefined;
  beforeEach(() => {
    savedNoVideo = process.env.SHMUP_NO_VIDEO;
    savedNoStills = process.env.SHMUP_NO_STILLS;
    delete process.env.SHMUP_NO_VIDEO;
    delete process.env.SHMUP_NO_STILLS;
  });
  afterEach(() => {
    if (savedNoVideo === undefined) delete process.env.SHMUP_NO_VIDEO;
    else process.env.SHMUP_NO_VIDEO = savedNoVideo;
    if (savedNoStills === undefined) delete process.env.SHMUP_NO_STILLS;
    else process.env.SHMUP_NO_STILLS = savedNoStills;
  });

  it('pins the counted rows to the shell media manifests', () => {
    expect(MEDIA_VIDEO_CLIP_COUNT).toBe(VIDEO_CLIPS.length);
    expect(MEDIA_STILL_COUNT).toBe(STILL_SURFACES.length);
  });

  it('reports the video half missing loud — the ffmpeg hole (an emptied dist names the ledger)', () => {
    rmSync(join(dir, 'assets', 'video'), { recursive: true, force: true });
    const { problems } = checkTizenBundle(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^assets\/video\/video-ledger\.json is missing/);
    expect(problems[0]).toContain('ffmpeg');
  });

  it('names a clip the ledger lists but the dist lost', () => {
    unlinkSync(join(dir, 'assets', 'video', 'clip-7.mp4'));
    const { problems } = checkTizenBundle(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('assets/video/clip-7.mp4 is listed in');
  });

  it('rejects a ledger whose row count moved', () => {
    const ledger = JSON.parse(readFileSync(join(dir, VIDEO_LEDGER_FILE), 'utf8')) as {
      clips: unknown[];
    };
    ledger.clips.pop();
    put(VIDEO_LEDGER_FILE, JSON.stringify(ledger));
    const { problems } = checkTizenBundle(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/lists 14 clips; the era ships 15/);
  });

  it('needs the AI-content disclosure beside the clips', () => {
    unlinkSync(join(dir, 'assets', 'video', 'LICENSES-videos.md'));
    expect(checkTizenBundle(dir).problems).toEqual([
      'assets/video/LICENSES-videos.md is missing (the AI-content disclosure)',
    ]);
  });

  it('reports the stills half missing', () => {
    rmSync(join(dir, 'assets', 'stills'), { recursive: true, force: true });
    const { problems } = checkTizenBundle(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^assets\/stills\/stills-ledger\.json is missing/);
  });

  it('names a still the ledger lists but the dist lost', () => {
    unlinkSync(join(dir, 'assets', 'stills', 'still-2.png'));
    const { problems } = checkTizenBundle(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('assets/stills/still-2.png is listed in');
  });

  it('lets the baked-off build pass by env (the Vite plugins ship it under the same opt-outs)', () => {
    rmSync(join(dir, 'assets', 'video'), { recursive: true, force: true });
    rmSync(join(dir, 'assets', 'stills'), { recursive: true, force: true });
    const { files } = checkTizenBundle(dir);
    expect(checkEraMedia(dir, files, { SHMUP_NO_VIDEO: '1', SHMUP_NO_STILLS: '1' })).toEqual([]);
    expect(checkEraMedia(dir, files, { SHMUP_NO_VIDEO: '1' })).toHaveLength(1);
    expect(checkEraMedia(dir, files, { SHMUP_NO_STILLS: '1' })).toHaveLength(1);
  });
});

describe('tizen/scripts/check-bundle rule 13 — the built bundle stays inside Chromium 68 (P1-8c)', () => {
  // The Pixi 8.22 lesson turned into code: a post-68 name that reaches app.js must fail the
  // build, not the TV boot. The polyfill regions and the pair-position-backed baseline (rule 4's
  // head) are the rule's only grace — everything else is a landmine, named with its byte
  // position.

  /** The needle pair every bundle starts with, verbatim from the committed ES5 files. */
  const BODIES = [
    { file: 'apps/tizen/polyfills/global-this.js', text: polyfill },
    { file: 'apps/tizen/polyfills/string-match-all.js', text: matchAllPolyfill },
  ];

  it('holds the fixture bundle (ES2018 built-ins only) clean', () => {
    expect(checkBundleEngineFloor(GOOD_APP, BODIES)).toEqual([]);
    expect(checkBundleEngineFloor(GOOD_APP)).toEqual([]);
  });

  it.each([
    ['[1, [2]].flat()', 'Array.prototype.flat'],
    ['[1, [2]].flatMap((x) => x)', 'Array.prototype.flatMap'],
    ['Object.fromEntries([])', 'Object.fromEntries'],
    ['Object.hasOwn({}, "a")', 'Object.hasOwn'],
    ['Promise.allSettled([])', 'Promise.allSettled'],
    ['Promise.any([])', 'Promise.any'],
    ['"a".replaceAll("b", "c")', 'String.prototype.replaceAll'],
    ['structuredClone({})', 'structuredClone'],
    ['queueMicrotask(() => {})', 'queueMicrotask'],
    ['new WeakRef({})', 'WeakRef'],
    ['new FinalizationRegistry(() => {})', 'FinalizationRegistry'],
    ['[].at(0)', 'Array.prototype.at'],
  ])('names a planted %s outside the exempt regions', (snippet, name) => {
    const code = `${GOOD_APP}\nvar x = ${snippet};\nvoid x;\n`;
    const problems = checkBundleEngineFloor(code, BODIES);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(name);
    expect(problems[0]).toContain('at byte');
  });

  it('reports every occurrence when one name is planted twice', () => {
    const code = `${GOOD_APP}\nvar a = [1].flat();\nvar b = [2].flat();\nvoid a; void b;\n`;
    expect(checkBundleEngineFloor(code, BODIES)).toHaveLength(2);
  });

  it('grants the matchAll baseline to the two Pixi call sites it was pinned from', () => {
    // The 2026-10-23 audit's known-good bundle: exactly the two `.matchAll(` sites, with the
    // polyfill standing in front. The fixture carries them; a real build is checked by
    // apps/tizen/test/build/tizen-build.test.ts against the actual vite output.
    const code = `${GOOD_APP}\nvar a = /re/g;\n` + "void 'x'.matchAll(a);\nvoid 'y'.matchAll(a);\n";
    expect(checkBundleEngineFloor(code, BODIES)).toEqual([]);
  });

  it('rejects a third matchAll site — beyond the known-good baseline of 2', () => {
    const code =
      `${GOOD_APP}\nvar a = /re/g;\n` +
      "void 'x'.matchAll(a);\nvoid 'y'.matchAll(a);\nvoid 'z'.matchAll(a);\n";
    const problems = checkBundleEngineFloor(code, BODIES);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('`.matchAll(`');
    expect(problems[0]).toContain('known-good baseline of 2');
  });

  it('keeps matchAll a landmine when the polyfill pair does not stand in front', () => {
    // The baseline is a licence granted by the polyfill pair standing at the head — a bundle that
    // lost the position lost the licence (and rule 4 reports the wrong head right with it).
    const bodies = [{ file: 'apps/tizen/polyfills/global-this.js', text: polyfill }];
    const code = `${polyfill}\nvoid 'x'.matchAll(/re/g);\n`;
    expect(code).not.toContain(MATCH_ALL_BANNER);
    const problems = checkBundleEngineFloor(code, bodies);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('String.prototype.matchAll');
  });

  it('keeps matchAll a landmine when the polyfill pair is planted out of order', () => {
    // Positional tolerance (the reviewer's planted reorder): both files are in the bundle — the
    // old `includes` gate passed this shape — yet the matchAll half stands BEHIND the app code,
    // where Pixi's init-time `.matchAll(` would run unbacked on Chromium 68/69. No licence.
    const code = `${polyfill}\nvoid 'x'.matchAll(/re/g);\n${matchAllPolyfill}`;
    const problems = checkBundleEngineFloor(code, BODIES);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('String.prototype.matchAll');
  });

  it('exempts exactly the embedded polyfill regions — not the name everywhere', () => {
    // A bundle that embeds a polyfill body keeps its text clean; one that hides a fresh call in
    // a string shaped like the banner region is still caught. The exemption is positional.
    const disguised =
      `${GOOD_APP}\nvar s = "/* Shmup Cup — globalThis polyfill */ junk";\nvoid s;\n` +
      'var t = [1].flat();\nvoid t;\n';
    const problems = checkBundleEngineFloor(disguised, BODIES);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('Array.prototype.flat');
  });

  it('checks a bundle even when the polyfill files cannot be read (no exemption granted)', () => {
    const code = `${GOOD_APP}\nvar x = [1].flat();\nvoid x;\n`;
    const bodies = [
      { file: 'apps/tizen/polyfills/global-this.js', text: null },
      { file: 'apps/tizen/polyfills/string-match-all.js', text: null },
    ];
    expect(checkBundleEngineFloor(code, bodies)).toHaveLength(1);
  });

  it('empty code is not a problem here (the missing script is rule 5’s)', () => {
    expect(checkBundleEngineFloor('', BODIES)).toEqual([]);
  });

  it('the shipped fixture bundle passes the whole check with rule 13 wired in', () => {
    expect(checkTizenBundle(dir).problems).toEqual([]);
  });
});
