/**
 * Rule 10 of `scripts/check-bundle.mjs` (plan R1-05): the atlas manifest ships next to its pages as
 * `dist/assets/atlas/main.json` — the shell fetches it with XHR at boot instead of carrying ~200 KB
 * of frame data in `app.js`. The manifest must exist, parse, carry a format version the shell
 * reads, list every page with its real size and every page must be listed; and `app.js` must not
 * name more than a handful of its frames (an accidentally inlined manifest names them all). The
 * TV render bench, which inlines its own density atlases, is exempt. Small fixture folders, like
 * `check-bundle.test.ts`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ATLAS_MANIFEST_FILE,
  ATLAS_MANIFEST_VERSIONS,
  MAX_INLINED_FRAME_NAMES,
  TV_BENCH_MARKER,
  checkAtlasManifest,
  checkTizenBundle,
} from '../../scripts/check-bundle.mjs';
import { benchConfigXml } from '../../scripts/config-xml.mjs';

const polyfill = readFileSync(new URL('../../polyfills/global-this.js', import.meta.url), 'utf8');
const CONFIG_XML = readFileSync(new URL('../../public/config.xml', import.meta.url), 'utf8');
const HTML =
  '<!doctype html><html><head><script defer src="./app.js"></script></head><body></body></html>';
const GOOD_APP = `${polyfill}\n(function () { var game = 1; void game; })();\n`;

let dir = '';

/**
 * The start of a PNG: signature and IHDR chunk with the given size.
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

/** Frame names of a fixture sprite sheet: `enemies/drone#0` … */
const FRAMES = Array.from({ length: 24 }, (_, i) => `enemies/drone#${i}`);

/**
 * A manifest document.
 *
 * @param pages - Its pages.
 * @param formatVersion - Its format version.
 * @returns The JSON text.
 */
function manifest(
  pages: ReadonlyArray<Record<string, unknown>>,
  formatVersion: unknown = 1,
): string {
  const frames: Record<string, unknown> = {};
  for (const [i, name] of FRAMES.entries()) frames[name] = { p: 0, x: i, y: 0, w: 1, h: 1 };
  return JSON.stringify({ formatVersion, pages, frames, sprites: {}, animations: {}, fonts: {} });
}

/**
 * Problems rule 10 reports for the fixture folder (through the whole check, so the rule's place
 * in it is covered too).
 *
 * @returns The problems.
 */
function problems(): string[] {
  return checkTizenBundle(dir).problems;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shmup-check-manifest-'));
  put('index.html', HTML);
  put('app.js', GOOD_APP);
  put('config.xml', CONFIG_XML);
  put('icon.png', 'png');
  put('assets/atlas/main.png', png(1024, 1024));
  put('assets/atlas/main-1.png', png(512, 256));
  put(
    ATLAS_MANIFEST_FILE,
    manifest([
      { file: 'main.png', w: 1024, h: 1024, group: 'common' },
      { file: 'main-1.png', w: 512, h: 256, group: 'zone-a' },
    ]),
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('tizen/scripts/check-bundle rule 10 (the atlas manifest ships outside app.js)', () => {
  it('names the file, the versions the shell reads and the inline threshold', () => {
    expect(ATLAS_MANIFEST_FILE).toBe('assets/atlas/main.json');
    expect(ATLAS_MANIFEST_VERSIONS).toEqual([1, 2]);
    expect(MAX_INLINED_FRAME_NAMES).toBe(8);
  });

  it('accepts a manifest listing every page with its size (format 1 or 2)', () => {
    expect(problems()).toEqual([]);
    put(
      ATLAS_MANIFEST_FILE,
      manifest(
        [
          { file: 'main.png', w: 1024, h: 1024, group: 'common' },
          { file: 'main-1.png', w: 512, h: 256, group: 'zone-a' },
        ],
        2,
      ),
    );
    expect(problems()).toEqual([]);
  });

  it('reports a missing manifest (and nothing else of the rule)', () => {
    unlinkSync(join(dir, ATLAS_MANIFEST_FILE));
    expect(problems()).toEqual([
      'assets/atlas/main.json is missing (the shell fetches the atlas manifest at boot)',
    ]);
  });

  it('reports a manifest that is not JSON, or lists no pages', () => {
    put(ATLAS_MANIFEST_FILE, '{ "formatVersion": 1, ');
    const [notJson, ...rest] = problems();
    expect(notJson).toMatch(/^assets\/atlas\/main\.json is not valid JSON: /);
    expect(rest).toEqual([]);
    for (const text of ['{}', '[]', 'null', '{"pages":[]}', '{"pages":{}}']) {
      put(ATLAS_MANIFEST_FILE, text);
      expect(problems(), text).toEqual(['assets/atlas/main.json lists no atlas pages']);
    }
  });

  it('reports a format version the shell cannot read', () => {
    for (const version of [3, 0, '1', null]) {
      put(
        ATLAS_MANIFEST_FILE,
        manifest(
          [
            { file: 'main.png', w: 1024, h: 1024 },
            { file: 'main-1.png', w: 512, h: 256 },
          ],
          version,
        ),
      );
      expect(problems(), String(version)).toEqual([
        `assets/atlas/main.json has format version ${String(version)}, the shell reads 1 or 2`,
      ]);
    }
  });

  it('reports a listed page that is missing, one whose size differs, and an unlisted page', () => {
    put('assets/atlas/main-2.png', png(256, 256));
    put(
      ATLAS_MANIFEST_FILE,
      manifest([
        { file: 'main.png', w: 1024, h: 512 },
        { file: 'main-1.png', w: 512, h: 256 },
        { file: 'main-3.png', w: 64, h: 64 },
        { w: 1, h: 1 },
      ]),
    );
    expect(problems()).toEqual([
      'assets/atlas/main.png is 1024×1024, but assets/atlas/main.json says 1024×512',
      'assets/atlas/main.json lists assets/atlas/main-3.png, which is missing',
      'assets/atlas/main.json page 3 has no file name',
      'assets/atlas/main-2.png is not listed in assets/atlas/main.json (a stale page?)',
    ]);
  });

  it('leaves a page that is not a PNG to rule 8 and ignores PNGs outside assets/atlas/', () => {
    put('assets/atlas/main-1.png', 'not a png');
    put('assets/atlas/extra/deep.png', png(1, 1));
    put('assets/other/page.png', png(1, 1));
    expect(problems()).toEqual(['atlas page assets/atlas/main-1.png is not a PNG']);
  });

  it(`rejects an app.js naming more than ${MAX_INLINED_FRAME_NAMES} atlas frames (an inlined manifest)`, () => {
    const few = FRAMES.slice(0, MAX_INLINED_FRAME_NAMES).map((name) => `'${name}'`);
    put('app.js', `${polyfill}\n(function () { var f = [${few.join(',')}]; void f; })();\n`);
    expect(problems()).toEqual([]);
    const many = FRAMES.slice(0, MAX_INLINED_FRAME_NAMES + 1).map((name) => `"${name}"`);
    // Repeats count once; names that are not frames of the manifest do not count.
    put(
      'app.js',
      `${polyfill}\n(function () { var f = [${many.join(',')},${many[0]},"enemies/other#0"]; void f; })();\n`,
    );
    expect(problems()).toEqual([
      `app.js names ${MAX_INLINED_FRAME_NAMES + 1} atlas frames (enemies/drone#0, enemies/drone#1, ` +
        'enemies/drone#2, …) — the atlas manifest was inlined; the apps import ' +
        'virtual:shmup-assets and fetch assets/atlas/main.json',
    ]);
  });

  it('exempts the TV render bench, which inlines its own density atlases', () => {
    unlinkSync(join(dir, ATLAS_MANIFEST_FILE));
    put('config.xml', benchConfigXml(CONFIG_XML));
    put(
      'app.js',
      `${polyfill}\n(function(){document.body.setAttribute('${TV_BENCH_MARKER}','x')})();\n`,
    );
    expect(problems()).toEqual([]);
  });

  it('is exported on its own for the webOS check (same problems for the same folder)', () => {
    unlinkSync(join(dir, 'assets', 'atlas', 'main-1.png'));
    const files = checkTizenBundle(dir).files;
    expect(checkAtlasManifest(dir, files, GOOD_APP)).toEqual([
      'assets/atlas/main.json lists assets/atlas/main-1.png, which is missing',
    ]);
    expect(checkAtlasManifest(dir, [], '')).toEqual([
      'assets/atlas/main.json is missing (the shell fetches the atlas manifest at boot)',
    ]);
  });
});
