/**
 * Vite config for the Samsung Tizen TV build (Tizen 5.5+ = Chromium 69).
 *
 * Output (dist/): index.html + ONE classic (non-module) IIFE script `app.js` + the
 * files in public/ (config.xml, icon.png) + the atlas pages in `assets/atlas/`
 * (`shmupAssets()`; the manifest itself is inlined into app.js, decision D25).
 * Rules from shmup_tech.md §2.1:
 *  - syntax lowered for Chrome 69 (and ES2018, so optional catch binding etc. are
 *    lowered too and the bundle parses as ES2018 — verified by scripts/check-bundle.mjs);
 *  - no `<script type="module">` (Samsung lists ES modules as only partially supported),
 *    no code splitting, no module-preload polyfill;
 *  - a tiny hand-written globalThis polyfill is prepended after minification
 *    (`postBanner`), so it runs before any bundled code, including PixiJS.
 * `shmupBuildInfo()` defines `__SHMUP_DEV__` — `false` for `vite build` (the release bundle, no
 * debug tools), `true` for `--mode development` (`build:dev`: the tools behind the remote's Pause,
 * Ch+, Ch+, Ch+) and `--mode test` (`build:test`, what `pnpm test:e2e` opens) — and
 * `__SHMUP_BUILD__` (the git SHA). M2-17: `liveReloadDefine()` bakes the `tizen:watch` dev server's
 * URL into dev builds (`__SHMUP_LIVE_RELOAD__`), and `configXmlVariant()` turns the copied
 * `config.xml` into its game-mode / gamepad-check variant when asked (`build:game-mode`,
 * `TIZEN_GAME_MODE=1`, `TIZEN_GAMEPADS=…`).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import {
  clientConditions,
  isDevBuild,
  shmupAssets,
  shmupBuildInfo,
  shmupContent,
} from '../../vite.shared.js';
import { applyConfigVariant, variantFromEnv, variantName } from './scripts/config-xml.mjs';

/** Source of `polyfills/global-this.js`, prepended to `app.js` as the post-minify banner. */
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

/**
 * Defines `__SHMUP_LIVE_RELOAD__` (M2-17): the `SHMUP_LIVE_RELOAD_URL` environment variable
 * (`ws://<desktop>:<port>`, set by `scripts/tizen-watch.mjs`) in dev builds, `''` otherwise — so a
 * release bundle never connects anywhere.
 *
 * @returns The Vite plugin.
 */
export function liveReloadDefine(): Plugin {
  return {
    name: 'shmup:live-reload-define',
    config(_config, env) {
      const url = isDevBuild(env) ? (process.env.SHMUP_LIVE_RELOAD_URL ?? '') : '';
      return { define: { __SHMUP_LIVE_RELOAD__: JSON.stringify(url) } };
    },
  };
}

/**
 * Applies the `config.xml` variant (M2-17, `scripts/config-xml.mjs`) to the copied
 * `dist/config.xml` once the build is written: the game-mode metadata for `--mode game-mode` or
 * `TIZEN_GAME_MODE=1`, the gamepad check for `TIZEN_GAMEPADS`; the default variant leaves the file
 * as copied from `public/`.
 *
 * @returns The Vite plugin.
 */
export function configXmlVariant(): Plugin {
  let outDir = '';
  let mode = '';
  return {
    name: 'shmup:config-xml-variant',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      mode = config.mode;
    },
    closeBundle() {
      const variant = variantFromEnv(process.env, mode);
      const file = join(outDir, 'config.xml');
      if (variantName(variant) === 'default' || !existsSync(file)) return;
      writeFileSync(file, applyConfigVariant(readFileSync(file, 'utf8'), variant));
      console.log(`config.xml: ${variantName(variant)} variant`);
    },
  };
}

export default defineConfig({
  base: './',
  resolve: {
    conditions: clientConditions,
  },
  plugins: [
    shmupContent(),
    shmupAssets(),
    shmupBuildInfo(),
    liveReloadDefine(),
    classicScriptTag(),
    configXmlVariant(),
  ],
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
