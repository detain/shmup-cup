/**
 * Rules 9 and 12 of `scripts/check-bundle.mjs`: the game and the TV render bench never mix — a
 * widget with the bench's app id must carry the bench's `app.js`, and the game's `app.js` must not
 * contain the bench (plan R0-02) — and the `.svg` pages on disk are exactly the `.svg` pages
 * `app.js` names, one encoding per build (the bench's SVG arm, plan R-SVG WO-1). Small fixture
 * folders, like `check-bundle.test.ts`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MEDIA_STILL_COUNT,
  MEDIA_VIDEO_CLIP_COUNT,
  STILLS_LEDGER_FILE,
  TV_BENCH_MARKER,
  VIDEO_LEDGER_FILE,
  applicationIdOf,
  checkBenchAtlasPages,
  checkTizenBundle,
} from '../../scripts/check-bundle.mjs';
import { BENCH_APP_ID, benchConfigXml } from '../../scripts/config-xml.mjs';

// The banner pair real bundles start with (rule 4, w14) — a fixture needs both.
const polyfill =
  readFileSync(new URL('../../polyfills/global-this.js', import.meta.url), 'utf8') +
  readFileSync(new URL('../../polyfills/string-match-all.js', import.meta.url), 'utf8');
const GAME_XML = readFileSync(new URL('../../public/config.xml', import.meta.url), 'utf8');
const HTML =
  '<!doctype html><html><head><script defer src="./app.js"></script></head><body></body></html>';
/** A script that is the bench: it sets the marker attribute. */
const BENCH_APP = `${polyfill}\n(function () { document.body.setAttribute('${TV_BENCH_MARKER}', 'x'); })();\n`;
/** A script that is the game. */
const GAME_APP = `${polyfill}\n(function () { var game = 1; void game; })();\n`;

let dir = '';

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

/** A PNG header of 512×512 — enough for the page check. */
function page(): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 512);
  view.setUint32(20, 512);
  return bytes;
}

/**
 * Writes the complete era media set (rule 11, v20x-VIDIO1) — the game-widget fixtures would
 * otherwise carry the two ledger-missing problems next to rule 9's.
 */
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
  dir = mkdtempSync(join(tmpdir(), 'shmup-check-bench-'));
  put('index.html', HTML);
  put('icon.png', 'png');
  put('assets/atlas/bench-x1-0.png', page());
  putEraMedia();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('tizen/scripts/check-bundle rule 9 (the game and the TV render bench never mix)', () => {
  it('reads the application id of a config.xml', () => {
    expect(applicationIdOf(GAME_XML)).toBe('ShmpCupGam.ShmupCup');
    expect(applicationIdOf('<!-- <tizen:application id="X.Y"/> -->')).toBeNull();
    expect(applicationIdOf('<tizen:application package="P"/>')).toBeNull();
  });

  it('accepts the bench app.js under the bench app id (no atlas manifest needed — rule 10)', () => {
    put('config.xml', benchConfigXml(GAME_XML));
    put('app.js', BENCH_APP);
    expect(checkTizenBundle(dir).problems).toEqual([]);
  });

  it('rejects the bench app id over the game’s app.js', () => {
    put('config.xml', benchConfigXml(GAME_XML));
    put('app.js', GAME_APP);
    expect(checkTizenBundle(dir).problems).toEqual([
      `config.xml names the render bench (${BENCH_APP_ID}) but app.js is not the bench`,
    ]);
  });

  it('rejects the bench inside the game’s widget', () => {
    put('config.xml', GAME_XML);
    // The game ships its atlas manifest next to the pages (rule 10, plan R1-05).
    const pages = [{ file: 'bench-x1-0.png', w: 512, h: 512 }];
    const manifest = {
      formatVersion: 1,
      pages,
      frames: {},
      sprites: {},
      animations: {},
      fonts: {},
    };
    put('assets/atlas/main.json', JSON.stringify(manifest));
    put('app.js', BENCH_APP);
    expect(checkTizenBundle(dir).problems).toEqual([
      'app.js contains the TV render bench (R0-02) — the bench must never ship in the game',
    ]);
    put('app.js', GAME_APP);
    expect(checkTizenBundle(dir).problems).toEqual([]);
  });
});

describe('tizen/scripts/check-bundle rule 12 (the SVG pages on disk are the pages app.js names)', () => {
  /**
   * A page document in the arm's shape (the reader wants the root's `width` / `height`).
   *
   * @param width - Page width in pixels.
   * @param height - Page height in pixels.
   * @returns The document text.
   */
  function svgDoc(width = 512, height = 512): string {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges"></svg>`
    );
  }

  /**
   * A bench `app.js` naming these page urls (the virtual module holds them as string literals).
   *
   * @param urls - The page urls the bundle fetches.
   * @returns The script text (the marker statement plus the names).
   */
  function benchAppNaming(urls: string[]): string {
    const lits = urls.map((url) => `'${url}'`).join(', ');
    return (
      `${polyfill}\n(function () { document.body.setAttribute('${TV_BENCH_MARKER}', 'x'); ` +
      `var pages = [${lits}]; void pages; })();\n`
    );
  }

  it('unit: one encoding named and present passes; both mismatches return problems', () => {
    // The PNG arm: pages, no svg named, no svg on disk.
    expect(
      checkBenchAtlasPages(['assets/atlas/bench-x1-0.png', 'assets/atlas/main.json'], 'bench-x1-0'),
    ).toEqual([]);
    // The SVG arm: the named page is on disk.
    expect(
      checkBenchAtlasPages(['assets/atlas/bench-x1-0.svg'], `'assets/atlas/bench-x1-0.svg'`),
    ).toEqual([]);
    // Named but not emitted: a load that would 404 on the TV.
    expect(checkBenchAtlasPages([], `'assets/atlas/gone.svg'`)).toEqual([
      'app.js names assets/atlas/gone.svg, which the bundle does not hold',
    ]);
    // Emitted but not named: the other arm's leftover page, sized for nothing.
    expect(checkBenchAtlasPages(['assets/atlas/x.svg'], '')).toEqual([
      'assets/atlas/x.svg is in the bundle but named by nothing (stale?)',
    ]);
    // The game widget holds neither: the rule reads as no stray svg.
    expect(
      checkBenchAtlasPages(['assets/atlas/main.png', 'assets/atlas/main.json'], 'game'),
    ).toEqual([]);
  });

  it('accepts the bench whose density pages are SVG (the arm)', () => {
    put('config.xml', benchConfigXml(GAME_XML));
    put('assets/atlas/bench-x1-0.svg', svgDoc());
    put('app.js', benchAppNaming(['assets/atlas/bench-x1-0.svg']));
    expect(checkTizenBundle(dir).problems).toEqual([]);
  });

  it('rejects an SVG page left on disk by the PNG arm (the stale direction)', () => {
    put('config.xml', benchConfigXml(GAME_XML));
    put('assets/atlas/bench-x1-0.svg', svgDoc());
    put('app.js', BENCH_APP);
    expect(checkTizenBundle(dir).problems).toEqual([
      'assets/atlas/bench-x1-0.svg is in the bundle but named by nothing (stale?)',
    ]);
  });

  it('rejects a bench app.js naming an SVG page the bundle does not hold (the broken-load direction)', () => {
    put('config.xml', benchConfigXml(GAME_XML));
    put('app.js', benchAppNaming(['assets/atlas/bench-x2.67-1.svg']));
    expect(checkTizenBundle(dir).problems).toEqual([
      'app.js names assets/atlas/bench-x2.67-1.svg, which the bundle does not hold',
    ]);
  });
});
