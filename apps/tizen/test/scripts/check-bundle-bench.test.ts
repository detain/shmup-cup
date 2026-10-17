/**
 * Rule 9 of `scripts/check-bundle.mjs` (plan R0-02): the game and the TV render bench never mix —
 * a widget with the bench's app id must carry the bench's `app.js`, and the game's `app.js` must
 * not contain the bench. Small fixture folders, like `check-bundle.test.ts`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TV_BENCH_MARKER, applicationIdOf, checkTizenBundle } from '../../scripts/check-bundle.mjs';
import { BENCH_APP_ID, benchConfigXml } from '../../scripts/config-xml.mjs';

const polyfill = readFileSync(new URL('../../polyfills/global-this.js', import.meta.url), 'utf8');
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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shmup-check-bench-'));
  put('index.html', HTML);
  put('icon.png', 'png');
  put('assets/atlas/bench-x1-0.png', page());
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

  it('accepts the bench app.js under the bench app id', () => {
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
    put('app.js', BENCH_APP);
    expect(checkTizenBundle(dir).problems).toEqual([
      'app.js contains the TV render bench (R0-02) — the bench must never ship in the game',
    ]);
    put('app.js', GAME_APP);
    expect(checkTizenBundle(dir).problems).toEqual([]);
  });
});
