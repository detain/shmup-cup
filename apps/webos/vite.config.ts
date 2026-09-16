/**
 * Vite config for the LG webOS TV build (webOS 5+ — Chromium 68 and newer; plan M3-03,
 * shmup_tech.md §3.3).
 *
 * Output (dist/): index.html + ONE classic (non-module) IIFE script `app.js` + the files in
 * public/ (appinfo.json, icon.png, largeIcon.png) + the atlas pages in `assets/atlas/`
 * (`shmupAssets()`; the manifest itself is inlined into app.js, decision D25).
 *
 * The rules are the Tizen build's, for the same reasons and one more: webOS 5 runs Chromium 68,
 * one release *older* than Tizen 5.5's 69, so the same `chrome69` + `es2018` target and the same
 * `globalThis` polyfill cover both (`.browserslistrc` stays the single floor — every API the
 * lint allows is a Chrome 69 API, and the only Chrome-69-only syntax the target emits is ES2018).
 * A webOS app is loaded from the device's own file system, so relative URLs and no `fetch()`
 * (decision D25) apply here exactly as on Tizen.
 *
 * `shmupBuildInfo()` defines `__SHMUP_DEV__` (`false` for `vite build`, `true` for `--mode
 * development` / `--mode test`) and `__SHMUP_BUILD__` (the git SHA).
 *
 * This config and `scripts/check-bundle.mjs` read two files out of `apps/tizen` on purpose — the
 * `globalThis` polyfill and the bundle budgets — so the two TV builds cannot drift apart. Both are
 * listed in `turbo.json`'s `globalDependencies`, so a change to either invalidates this app's
 * build cache.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { clientConditions, shmupAssets, shmupBuildInfo, shmupContent } from '../../vite.shared.js';

/**
 * Source of the Tizen app's `globalThis` polyfill, prepended to `app.js` as the post-minify
 * banner. webOS 5's Chromium 68 has no native `globalThis` either (Chrome 71 added it), and the
 * two TV builds share the one hand-written ES5 file rather than keeping two copies in step.
 */
const globalThisPolyfill = readFileSync(
  fileURLToPath(new URL('../tizen/polyfills/global-this.js', import.meta.url)),
  'utf8',
);

/**
 * Rewrites Vite's `<script type="module" crossorigin src=…>` into a classic deferred script,
 * which Chromium 68 runs as a normal script after the document is parsed (the same rewrite the
 * Tizen build does — webOS' own documentation asks for classic scripts on older sets).
 *
 * @returns The Vite plugin.
 */
function classicScriptTag(): Plugin {
  return {
    name: 'shmup:classic-script-tag',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          /<script\b([^>]*?)\btype="module"([^>]*)><\/script>/g,
          (_match, before: string, after: string) => {
            const attrs = `${before} ${after}`
              .replace(/\scrossorigin(="[^"]*")?/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            return `<script defer ${attrs}></script>`;
          },
        );
      },
    },
  };
}

export default defineConfig({
  base: './',
  resolve: {
    conditions: clientConditions,
  },
  plugins: [shmupContent(), shmupAssets(), shmupBuildInfo(), classicScriptTag()],
  server: {
    host: true,
    port: 5175,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: ['chrome69', 'es2018'],
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    sourcemap: false,
    rolldownOptions: {
      checks: {
        // Vite's dynamic-import preload helper mentions import.meta; in IIFE output Rolldown
        // replaces it with `{}`, which is harmless there (no module preloading). The bundle
        // check still rejects any real import.meta that reaches app.js.
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
