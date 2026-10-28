/**
 * Vite config of the **TV render bench's webOS stub** (plan R0-02 — built by `pnpm bench:tv` next
 * to the Tizen bench; build-only, like everything webOS here).
 *
 * The same bench as the Tizen widget — the same page (`apps/tizen/bench/`), the same sources
 * (`apps/tizen/src/bench`, which detect the webOS host: Back 461, `webOS.platformBack()`) and the
 * same density atlases (`apps/tizen/scripts/bench-atlas.mjs`) — packaged the webOS way:
 * `dist-bench/` holds `index.html`, ONE classic IIFE `app.js` (`chrome69` + `es2018`, the shared
 * `globalThis` and `String.prototype.matchAll` polyfills as the banner), the game's icons and an
 * `appinfo.json` rewritten to the
 * bench's own id `dev.shmupcup.renderbench` (`scripts/appinfo.mjs` `benchAppInfo`), so it would
 * install next to the game. `scripts/check-bundle.mjs dist-bench` checks it like the game's
 * build, budgets included. `bench:package` / `bench:install` (`scripts/webos-bench.mjs`) drive the
 * existing `ares-*` wrappers — written, never run (no LG hardware).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { buildId, clientConditions, shmupBuildInfo } from '../../vite.shared.js';
import { gameCodeHash } from '../../scripts/game-code-hash.mjs';
import { shmupRenderBench } from '../tizen/scripts/bench-atlas.mjs';
import { benchBuildId, parseBenchOutput } from '../tizen/src/bench/output.js';
import { classicScriptTag } from '../tizen/vite.config.js';
import { benchAppInfo } from './scripts/appinfo.mjs';

/** `apps/webos/`. */
const appDir = fileURLToPath(new URL('.', import.meta.url));

/** The repository root (two levels up) — the tree the game-code hash digest is taken over. */
const repoRoot = join(appDir, '..', '..');

/**
 * Source of the Tizen app's `globalThis` polyfill — one hand-written ES5 pair for both TVs (see
 * `vite.config.ts`).
 */
const globalThisPolyfill = readFileSync(
  fileURLToPath(new URL('../tizen/polyfills/global-this.js', import.meta.url)),
  'utf8',
);

/** Source of the Tizen app's `matchAll` polyfill, prepended right after the globalThis one. */
const matchAllPolyfill = readFileSync(
  fileURLToPath(new URL('../tizen/polyfills/string-match-all.js', import.meta.url)),
  'utf8',
);

/**
 * Rewrites the copied `appinfo.json` into the bench's once the build is written.
 *
 * @returns The Vite plugin.
 */
export function benchAppInfoPlugin(): Plugin {
  let outDir = '';
  return {
    name: 'shmup:bench-appinfo',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const file = join(outDir, 'appinfo.json');
      if (!existsSync(file)) return;
      writeFileSync(file, benchAppInfo(readFileSync(file, 'utf8')));
    },
  };
}

/** `VITE_BENCH_OUTPUT`, parsed (`null`: the window's backbuffer); throws on a malformed value. */
const benchOutput = parseBenchOutput(process.env.VITE_BENCH_OUTPUT ?? '');

export default defineConfig({
  root: fileURLToPath(new URL('../tizen/bench', import.meta.url)),
  base: './',
  // The campaign mode (`src/bench/campaign.ts`): the passes and the pause, `''` = no campaign.
  // The build output (`src/bench/output.ts`): `VITE_BENCH_OUTPUT` = `<w>x<h>` (a bad value fails
  // the build), `''` = the window's backbuffer; the build id gains `@<w>x<h>` with one.
  define: {
    __SHMUP_BENCH_CAMPAIGN__: JSON.stringify(process.env.VITE_BENCH_CAMPAIGN ?? ''),
    __SHMUP_BENCH_PAUSE_S__: JSON.stringify(process.env.VITE_BENCH_PAUSE_S ?? '30'),
    __SHMUP_BENCH_OUTPUT__: JSON.stringify(benchOutput === null ? '' : benchOutput.id),
    __SHMUP_BENCH_BUILD_ID__: JSON.stringify(benchBuildId(buildId(), benchOutput)),
    // Plan v20x BENCSKIP: the game-code identity the skip ledger and the payloads pool by —
    // stable across a bench-only rebuild, fresh whenever any drawn-pixel input moves.
    __SHMUP_GAME_CODE_HASH__: JSON.stringify(gameCodeHash(repoRoot)),
  },
  publicDir: join(appDir, 'public'),
  resolve: {
    conditions: clientConditions,
  },
  plugins: [shmupRenderBench(), shmupBuildInfo(), classicScriptTag(), benchAppInfoPlugin()],
  build: {
    outDir: join(appDir, 'dist-bench'),
    emptyOutDir: true,
    target: ['chrome69', 'es2018'],
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    sourcemap: false,
    rolldownOptions: {
      checks: {
        emptyImportMeta: false,
      },
      output: {
        format: 'iife',
        codeSplitting: false,
        entryFileNames: 'app.js',
        assetFileNames: 'assets/[name][extname]',
        postBanner: globalThisPolyfill + matchAllPolyfill,
      },
    },
  },
});
