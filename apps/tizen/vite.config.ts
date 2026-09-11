/**
 * Vite config for the Samsung Tizen TV build (Tizen 5.5+ = Chromium 69).
 *
 * Output (dist/): index.html + ONE classic (non-module) IIFE script `app.js` + the
 * files in public/ (config.xml, icon.png). Rules from shmup_tech.md §2.1:
 *  - syntax lowered for Chrome 69 (and ES2018, so optional catch binding etc. are
 *    lowered too and the bundle parses as ES2018 — verified by scripts/check-bundle.mjs);
 *  - no `<script type="module">` (Samsung lists ES modules as only partially supported),
 *    no code splitting, no module-preload polyfill;
 *  - a tiny hand-written globalThis polyfill is prepended after minification
 *    (`postBanner`), so it runs before any bundled code, including PixiJS.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { clientConditions } from '../../vite.shared.js';

const globalThisPolyfill = readFileSync(
  fileURLToPath(new URL('./polyfills/global-this.js', import.meta.url)),
  'utf8',
);

/**
 * Rewrites Vite's `<script type="module" crossorigin src=…>` into a classic deferred
 * script, which Chromium 69 runs as a normal script after the document is parsed.
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
  plugins: [classicScriptTag()],
  server: {
    host: true,
    port: 5174,
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
