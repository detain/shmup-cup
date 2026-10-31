/**
 * Build-output integration test for the LG webOS app (plan M3-03): runs the real Vite build into a
 * temporary folder and checks what would be packaged into the `.ipk` — one classic IIFE script
 * that parses as ES2018 (webOS 5 = Chromium 68), a deferred classic script tag, the shared
 * `globalThis` and `matchAll` polyfills running first (w14), and the manifest and icons from
 * `public/`.
 *
 * This is the closest anything here gets to packaging: `ares-package` has never been run, and the
 * `appinfo.json` validator is what stands in for it.
 *
 * @module
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MATCH_ALL_BANNER,
  POLYFILL_BANNER,
  checkBundleEngineFloor,
} from '../../../tizen/scripts/check-bundle.mjs';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { stillsShippedFiles, videoShippedFiles } from '../../../../vite.shared.js';
import { WEBOS_APP_FILES, checkWebosBundle } from '../../scripts/check-bundle.mjs';
import { validateAppInfo } from '../../scripts/appinfo.mjs';

const appDir = fileURLToPath(new URL('../../', import.meta.url));
let outDir = '';
let code = '';
let html = '';
/** The atlas the build ships (the pipeline is deterministic, so this equals its output). */
const atlas = buildAtlas();
const { manifest } = atlas;

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'shmup-webos-build-'));
  // Vitest runs with NODE_ENV=test; build exactly like `pnpm build` does.
  vi.stubEnv('NODE_ENV', 'production');
  try {
    await build({
      root: appDir,
      configFile: join(appDir, 'vite.config.ts'),
      mode: 'production',
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });
  } finally {
    vi.unstubAllEnvs();
  }
  code = readFileSync(join(outDir, 'app.js'), 'utf8');
  html = readFileSync(join(outDir, 'index.html'), 'utf8');
}, 120_000);

afterAll(() => {
  if (outDir !== '') rmSync(outDir, { recursive: true, force: true });
});

describe('webos build output (vite build → dist/) — M3-03', () => {
  it('passes every check of scripts/check-bundle.mjs, budgets included', () => {
    const result = checkWebosBundle(outDir);
    expect(result.problems).toEqual([]);
    expect(result.gzipBytes).toBeGreaterThan(0);
  });

  it('contains exactly the app files plus the atlas pages, its manifest and the shipped clip set (R1-05, v2 R7-VID)', () => {
    const pages = manifest.pages.map((page) => `assets/atlas/${page.file}`);
    expect(checkWebosBundle(outDir).files.sort()).toEqual(
      [
        ...WEBOS_APP_FILES,
        'assets/atlas/main.json',
        ...pages,
        // The same MP4 set the Tizen widget ships (webOS reads the Tizen budgets and the
        // `shmupVideos()` plugin's outputs; no webm anywhere — v2 R7-VID).
        ...videoShippedFiles(),
        // What the `shmupStills()` plugin ships — the stills kit's outputs on disk, none
        // before it ran (the still-less build variant, plan v20x A4).
        ...stillsShippedFiles(),
      ].sort(),
    );
    const shipped = JSON.parse(
      readFileSync(join(outDir, 'assets', 'atlas', 'main.json'), 'utf8'),
    ) as unknown;
    expect(shipped).toEqual(manifest);
    expect(code).not.toContain(Object.keys(manifest.frames)[0]);
  });

  it('copies a valid appinfo.json out of public/', () => {
    const text = readFileSync(join(outDir, 'appinfo.json'), 'utf8');
    expect(validateAppInfo(text)).toEqual([]);
    expect((JSON.parse(text) as { id: string }).id).toBe('dev.shmupcup.game');
  });

  it('ships the atlas pages byte-identical to the pipeline output (shmupAssets(), D25)', () => {
    for (const page of atlas.pages) {
      const shipped = readFileSync(join(outDir, 'assets', 'atlas', page.file));
      expect(Buffer.compare(shipped, page.png)).toBe(0);
    }
  });

  it('app.js parses as an ES2018 classic script and starts with the polyfills', () => {
    parse(code, { ecmaVersion: 2018, sourceType: 'script' });
    expect(code.startsWith(POLYFILL_BANNER)).toBe(true);
    expect(code).toContain(MATCH_ALL_BANNER);
    expect(code).not.toMatch(/\bimport\.meta\b/);
  });

  it('holds the Chromium-68 engine floor in the real bundle — rule 13 (v20x P1-8c)', () => {
    // The shared rule (the Tizen check's, imported like the budgets) over the webOS build too —
    // the older engine is exactly the one a post-68 dependency API breaks.
    expect(checkBundleEngineFloor(code)).toEqual([]);
  });

  it('loads it with a classic deferred tag, never a module', () => {
    expect(html).toMatch(/<script[^>]*\bdefer\b[^>]*src="\.\/app\.js"/);
    expect(html).not.toMatch(/type="module"/);
  });

  it('ships no debug code: a release build folds the tools away', () => {
    expect(code).not.toContain('__shmupDebug');
    expect(code).not.toContain('SHMUP CUP DEBUG');
  });
});
