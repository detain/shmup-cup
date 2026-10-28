/**
 * The TV render bench's webOS stub (plan R0-02 — build-only, like everything webOS here): its own
 * `appinfo.json` id, the bundle check's rule 9 (the game and the bench never mix), the wrappers'
 * environment overrides and the bench config's build contract. **Nothing here has been run on a
 * webOS set.**
 *
 * @module
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEDIA_STILL_COUNT,
  MEDIA_VIDEO_CLIP_COUNT,
  POLYFILL_BANNER,
  STILLS_LEDGER_FILE,
  TV_BENCH_MARKER,
  VIDEO_LEDGER_FILE,
} from '../../../tizen/scripts/check-bundle.mjs';
import {
  BENCH_APPINFO_ID,
  BENCH_APPINFO_TITLE,
  benchAppInfo,
  validateAppInfo,
} from '../../scripts/appinfo.mjs';
import { checkWebosBundle } from '../../scripts/check-bundle.mjs';
import { BENCH_COMMANDS, benchEnv } from '../../scripts/webos-bench.mjs';
import benchConfig from '../../vite.bench.config.js';

const APPINFO = readFileSync(
  fileURLToPath(new URL('../../public/appinfo.json', import.meta.url)),
  'utf8',
);
// The banner pair real bundles start with (rule 4, w14) — the fixtures need both.
const polyfill =
  readFileSync(
    fileURLToPath(new URL('../../../tizen/polyfills/global-this.js', import.meta.url)),
    'utf8',
  ) +
  readFileSync(
    fileURLToPath(new URL('../../../tizen/polyfills/string-match-all.js', import.meta.url)),
    'utf8',
  );

/** A 1x1 PNG. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100' +
    '05fe02fea7b1b3c00000000049454e44ae426082',
  'hex',
);

let dir = '';

/**
 * Writes a file into the fixture folder.
 *
 * @param path - Relative path.
 * @param data - Contents.
 */
function put(path: string, data: string | Uint8Array): void {
  const file = join(dir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shmup-webos-bench-'));
  put('index.html', '<script defer src="./app.js"></script>');
  put('icon.png', PNG);
  put('largeIcon.png', PNG);
  put('assets/atlas/bench-x1-0.png', PNG);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('webos bench stub (R0-02)', () => {
  it('gives the bench its own valid appinfo.json, keeping the game’s version and Back handling', () => {
    const bench = benchAppInfo(APPINFO);
    expect(validateAppInfo(bench)).toEqual([]);
    const json = JSON.parse(bench) as Record<string, unknown>;
    const game = JSON.parse(APPINFO) as Record<string, unknown>;
    expect(json.id).toBe(BENCH_APPINFO_ID);
    expect(json.title).toBe(BENCH_APPINFO_TITLE);
    expect(json.version).toBe(game.version);
    expect(json.disableBackHistoryAPI).toBe(true);
    expect(BENCH_APPINFO_ID).not.toBe(game.id);
  });

  it('checks the game and the bench apart (rule 9)', () => {
    const benchApp = `${polyfill}\n(function(){document.body.setAttribute('${TV_BENCH_MARKER}','x')})();\n`;
    const gameApp = `${polyfill}\n(function(){var g=1;void g;})();\n`;
    expect(benchApp.startsWith(POLYFILL_BANNER)).toBe(true);

    put('appinfo.json', benchAppInfo(APPINFO));
    put('app.js', benchApp);
    expect(checkWebosBundle(dir).problems).toEqual([]);
    put('app.js', gameApp);
    expect(checkWebosBundle(dir).problems).toEqual([
      `appinfo.json names the render bench (${BENCH_APPINFO_ID}) but app.js is not it`,
    ]);

    put('appinfo.json', APPINFO);
    // The game ships its atlas manifest next to the pages (rule 10, plan R1-05).
    const pages = [{ file: 'bench-x1-0.png', w: 1, h: 1 }];
    const manifest = {
      formatVersion: 1,
      pages,
      frames: {},
      sprites: {},
      animations: {},
      fonts: {},
    };
    put('assets/atlas/main.json', JSON.stringify(manifest));
    // The game id makes rule 11 apply (v20x-VIDIO1) — the game build carries its era media.
    const clips = Array.from({ length: MEDIA_VIDEO_CLIP_COUNT }, (_, i) => `clip-${i}.mp4`);
    for (const file of clips) put(`assets/video/${file}`, 'x');
    put(VIDEO_LEDGER_FILE, JSON.stringify({ clips: clips.map((file) => ({ file })) }));
    put('assets/video/LICENSES-videos.md', '# videos');
    const stills = Array.from({ length: MEDIA_STILL_COUNT }, (_, i) => `still-${i}.png`);
    for (const file of stills) put(`assets/stills/${file}`, 'x');
    put(STILLS_LEDGER_FILE, JSON.stringify({ stills: stills.map((file) => ({ file })) }));
    put('assets/stills/LICENSES-stills.md', '# stills');
    expect(checkWebosBundle(dir).problems).toEqual([]);
    put('app.js', benchApp);
    expect(checkWebosBundle(dir).problems).toEqual([
      'app.js contains the TV render bench (R0-02) — the bench must never ship in the game',
    ]);
  });

  it('points the ares wrappers at dist-bench, release/bench and the bench id', async () => {
    expect(Object.keys(BENCH_COMMANDS)).toEqual(['package', 'install', 'run']);
    expect(benchEnv({})).toEqual({
      WEBOS_DIST_DIR: 'dist-bench',
      WEBOS_RELEASE_DIR: 'release/bench',
      WEBOS_APP_ID: BENCH_APPINFO_ID,
    });
    expect(benchEnv({ WEBOS_APP_ID: 'dev.other.app' }).WEBOS_APP_ID).toBe('dev.other.app');
    for (const [name, value] of Object.entries(benchEnv({}))) vi.stubEnv(name, value);
    vi.resetModules();
    const env = await import('../../scripts/webos-env.mjs');
    expect(env.DIST_DIR).toMatch(/apps[\\/]webos[\\/]dist-bench$/);
    expect(env.RELEASE_DIR).toMatch(/apps[\\/]webos[\\/]release[\\/]bench$/);
    expect(env.packageCommand().args[0]).toBe(env.DIST_DIR);
    expect(env.launchCommand('tv1').args).toEqual(['--device', 'tv1', BENCH_APPINFO_ID]);
  });

  it('builds the shared bench page with the TV build contract into dist-bench/', () => {
    const settings = benchConfig.build ?? {};
    expect(settings.target).toEqual(['chrome69', 'es2018']);
    const output = settings.rolldownOptions?.output as Record<string, unknown>;
    expect([output.format, output.codeSplitting, output.entryFileNames]).toEqual([
      'iife',
      false,
      'app.js',
    ]);
    expect(output.postBanner).toBe(polyfill);
    expect(settings.outDir).toMatch(/apps[\\/]webos[\\/]dist-bench$/);
    expect(benchConfig.root).toMatch(/apps[\\/]tizen[\\/]bench$/);
  });
});
