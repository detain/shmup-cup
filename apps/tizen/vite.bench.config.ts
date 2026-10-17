/**
 * Vite config of the **TV render bench** widget (plan R0-02 — `pnpm bench:tv`, which runs
 * `vite build --config vite.bench.config.ts --mode bench`).
 *
 * Output (`dist-bench/`, never `dist/`): `index.html` + ONE classic IIFE `app.js` + `config.xml`
 * (the game's, rewritten to the bench's own app id `ShmpCupBnc.RenderBench` by
 * `scripts/config-xml.mjs` `benchConfigXml`, so the bench installs next to the game) +
 * `icon.png` + the density atlases in `assets/atlas/` (`scripts/bench-atlas.mjs` — the real atlas
 * ×1 / ×1.5 / ×2.25, nearest-neighbour; nothing is added to the game's atlas).
 *
 * **The Tizen build contract, unchanged:** `chrome69` + `es2018` (so the emitted syntax is ES2018 —
 * inside webOS 5's Chromium 68 too), one IIFE with no code splitting and no module preload, the
 * hand-written `globalThis` polyfill as the post-minify banner and a classic deferred script tag
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
import { clientConditions, shmupBuildInfo } from '../../vite.shared.js';
import { shmupRenderBench } from './scripts/bench-atlas.mjs';
import { benchConfigXml } from './scripts/config-xml.mjs';
import { classicScriptTag } from './vite.config.js';

/** `apps/tizen/`. */
const appDir = fileURLToPath(new URL('.', import.meta.url));

/** Source of `polyfills/global-this.js`, prepended to `app.js` as the post-minify banner. */
const globalThisPolyfill = readFileSync(
  fileURLToPath(new URL('./polyfills/global-this.js', import.meta.url)),
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

export default defineConfig({
  root: join(appDir, 'bench'),
  base: './',
  publicDir: join(appDir, 'public'),
  resolve: {
    conditions: clientConditions,
  },
  plugins: [shmupRenderBench(), shmupBuildInfo(), classicScriptTag(), benchConfigXmlPlugin()],
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
        postBanner: globalThisPolyfill,
      },
    },
  },
});
