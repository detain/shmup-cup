/**
 * Vite config of the **TV render bench** widget (plan R0-02 — `pnpm bench:tv`, which runs
 * `vite build --config vite.bench.config.ts --mode bench`).
 *
 * Output (`dist-bench/`, never `dist/`): `index.html` + ONE classic IIFE `app.js` + `config.xml`
 * (the game's, rewritten to the bench's own app id `ShmpCupBnc.RenderBench` by
 * `scripts/config-xml.mjs` `benchConfigXml`, so the bench installs next to the game) +
 * `icon.png` + the density atlases in `assets/atlas/` (`scripts/bench-atlas.mjs` — the real atlas
 * ×1 / ×1.5 / ×2.25, nearest-neighbour; nothing is added to the game's atlas) + the video knob's
 * looped clip and the decode scenario's measured clips in `assets/video/…` (v2 R7-VID + plan v20x
 * HARBENCH S8 — `shmupVideos({ only })` from `BENCH_VIDEO_CLIPS`, not the game's 15-clip set).
 *
 * **The SVG arm (`VITE_BENCH_SVG=e3`, plan R-SVG WO-1):** the same contract with the density pages
 * as E3 SVG text files (`assets/atlas/bench-x<s>-<i>.svg`, `scripts/bench-svg.mjs`) in place of the
 * PNGs — separate fetched files, never inlined: `app.js` carries the manifests, and its gzip budget
 * (512 KiB, ~487.5 KiB used) has no room for 4.5 MB of page text. The build id gains `+svg-e3` and
 * the payload's `svgEnc` says which arm ran, so the analyzer keeps the two pools apart.
 *
 * **The Tizen build contract, unchanged:** `chrome69` + `es2018` (so the emitted syntax is ES2018 —
 * inside webOS 5's Chromium 68 too), one IIFE with no code splitting and no module preload, the
 * hand-written ES5 polyfills (`globalThis`, `String.prototype.matchAll`) as the post-minify banner
 * and a classic deferred script tag
 * (`classicScriptTag()` from the game's config). `scripts/check-bundle.mjs dist-bench` checks the
 * output exactly like the game's, budgets included, and its rule 9 keeps the two apart.
 *
 * The Vite root is `bench/` (its `index.html` becomes `dist-bench/index.html`); the code lives in
 * `src/bench/`, where it is type-checked, linted and scanned by the Chromium 68 floor test with
 * the rest of the app. The `bench` mode is one of `vite.shared.ts`'s `DEV_BUILD_MODES`, so
 * `__SHMUP_REPORT_URL__` carries `VITE_REPORT_URL` (the input probe's log server) into the bundle.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { buildId, clientConditions, shmupBuildInfo, shmupVideos } from '../../vite.shared.js';
import { gameCodeHash } from '../../scripts/game-code-hash.mjs';
import { BENCH_VIDEO_CLIPS, shmupRenderBench } from './scripts/bench-atlas.mjs';
import { parseBenchSvgEncoding } from './scripts/bench-svg.mjs';
import { benchBuildId, parseBenchOutput } from './src/bench/output.js';
import { benchConfigXml } from './scripts/config-xml.mjs';
import { classicScriptTag } from './vite.config.js';

/** `apps/tizen/`. */
const appDir = fileURLToPath(new URL('.', import.meta.url));

/** The repository root (two levels up) — the tree the game-code hash digest is taken over. */
const repoRoot = join(appDir, '..', '..');

/** Source of `polyfills/global-this.js`, prepended to `app.js` as the post-minify banner. */
const globalThisPolyfill = readFileSync(
  fileURLToPath(new URL('./polyfills/global-this.js', import.meta.url)),
  'utf8',
);

/** Source of `polyfills/string-match-all.js`, prepended right after the globalThis one. */
const matchAllPolyfill = readFileSync(
  fileURLToPath(new URL('./polyfills/string-match-all.js', import.meta.url)),
  'utf8',
);

/** The Vite mode of the bench builds (one of `vite.shared.ts` `DEV_BUILD_MODES`). */
export const BENCH_BUILD_MODE = 'bench';

/** The bench widget's output folder, relative to `apps/tizen/`. */
export const BENCH_OUT_DIR = 'dist-bench';

/**
 * Rewrites the copied `config.xml` into the bench's (its own app id, widget id and name) once the
 * build is written.
 *
 * @returns The Vite plugin.
 */
export function benchConfigXmlPlugin(): Plugin {
  let outDir = '';
  return {
    name: 'shmup:bench-config-xml',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const file = join(outDir, 'config.xml');
      if (!existsSync(file)) return;
      writeFileSync(file, benchConfigXml(readFileSync(file, 'utf8')));
    },
  };
}

/** `VITE_BENCH_OUTPUT`, parsed (`null`: the window's backbuffer); throws on a malformed value. */
const benchOutput = parseBenchOutput(process.env.VITE_BENCH_OUTPUT ?? '');

/**
 * `VITE_BENCH_SVG`: the atlas-page encoding of this build (`'png'` by default, `'e3'` for the SVG
 * arm — see `scripts/bench-svg.mjs`); a bad value fails the build like a bad `VITE_BENCH_OUTPUT`.
 */
const benchSvg = parseBenchSvgEncoding(process.env.VITE_BENCH_SVG ?? '');

export default defineConfig({
  root: join(appDir, 'bench'),
  base: './',
  // The campaign mode (`src/bench/campaign.ts`): the passes and the pause, `''` = no campaign.
  // The build output (`src/bench/output.ts`): `VITE_BENCH_OUTPUT` = `<w>x<h>` (a bad value fails
  // the build), `''` = the window's backbuffer; the build id gains `@<w>x<h>` with one.
  define: {
    __SHMUP_BENCH_CAMPAIGN__: JSON.stringify(process.env.VITE_BENCH_CAMPAIGN ?? ''),
    __SHMUP_BENCH_PAUSE_S__: JSON.stringify(process.env.VITE_BENCH_PAUSE_S ?? '30'),
    __SHMUP_BENCH_OUTPUT__: JSON.stringify(benchOutput === null ? '' : benchOutput.id),
    __SHMUP_BENCH_SVG__: JSON.stringify(benchSvg),
    __SHMUP_BENCH_BUILD_ID__: JSON.stringify(benchBuildId(buildId(), benchOutput, benchSvg)),
    // Plan v20x BENCSKIP: the game-code identity the skip ledger and the payloads pool by —
    // stable across a bench-only rebuild, fresh whenever any drawn-pixel input moves.
    __SHMUP_GAME_CODE_HASH__: JSON.stringify(gameCodeHash(repoRoot)),
  },
  publicDir: join(appDir, 'public'),
  resolve: {
    conditions: clientConditions,
  },
  plugins: [
    shmupRenderBench({ svgEnc: benchSvg }),
    shmupBuildInfo(),
    // The video knob's looped clip + the decode scenario's measured clips (v2 R7-VID, plan v20x
    // HARBENCH S8) — one list, derived from the same table the virtual module's `videos` emits from.
    shmupVideos({ only: BENCH_VIDEO_CLIPS.map((clip) => `${clip.id}.mp4`) }),
    classicScriptTag(),
    benchConfigXmlPlugin(),
  ],
  server: {
    host: true,
    port: 5176,
  },
  build: {
    outDir: join(appDir, BENCH_OUT_DIR),
    emptyOutDir: true,
    target: ['chrome69', 'es2018'],
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    sourcemap: false,
    rolldownOptions: {
      checks: {
        // As in the game's config: Vite's preload helper mentions import.meta, which Rolldown
        // replaces with `{}` in IIFE output; the bundle check still rejects a real one.
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
