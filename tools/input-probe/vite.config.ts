/**
 * Vite config for the input probe.
 *
 * Tizen 5.5 runs Chromium 69 and only partially supports ES modules, so the build emits a single classic
 * IIFE script (`app.js`) transpiled for `chrome69`, and a build-only plugin strips `type="module"` and
 * `crossorigin` from the generated `index.html`. `base: './'` keeps every URL relative (the app is served
 * from the widget package, not a web server root).
 *
 * Build-time environment: `VITE_REPORT_URL` (optional log-server base URL, baked into `app.js`).
 */

import { defineConfig, type Plugin } from 'vite';

/**
 * Rewrites the built `index.html` so the bundle loads as a classic script: removes `type="module"` and
 * `crossorigin` from `<script>`/`<link>` tags and adds `defer` to the app script (it is placed in `<head>`).
 *
 * @param html - the HTML Vite generated.
 * @returns the rewritten HTML. Scripts that are not `type="module"` (e.g. the `$WEBAPIS` tag) are untouched.
 *
 * @remarks
 * `crossorigin` must go because the widget is loaded from `file://`-like package URLs, where a CORS-mode
 * script request can fail; `defer` keeps the "run after the DOM is parsed" semantics that module scripts
 * had.
 *
 * @example
 * ```ts
 * classicScriptHtml('<script type="module" crossorigin src="./app.js"></script>');
 * // '<script defer src="./app.js"></script>'
 * ```
 */
export function classicScriptHtml(html: string): string {
  return html
    .replace(/<script\b([^>]*)>/g, (_m, attrs: string) => {
      if (!/\btype\s*=\s*["']module["']/.test(attrs)) return '<script' + attrs + '>';
      let a = attrs.replace(/\s+type\s*=\s*["']module["']/, '').replace(/\s+crossorigin(\s*=\s*["'][^"']*["'])?/, '');
      if (!/\bdefer\b/.test(a)) a = ' defer' + a;
      return '<script' + a + '>';
    })
    .replace(/<link\b([^>]*)>/g, (_m, attrs: string) => '<link' + attrs.replace(/\s+crossorigin(\s*=\s*["'][^"']*["'])?/, '') + '>');
}

/**
 * Build-only Vite plugin that applies {@link classicScriptHtml} as the last `transformIndexHtml` step
 * (the dev server keeps serving real modules).
 *
 * @returns the plugin object.
 */
function classicScriptPlugin(): Plugin {
  return {
    name: 'input-probe:classic-script',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => classicScriptHtml(html),
    },
  };
}

/** The Vite configuration (dev server on all interfaces; build → `dist/` widget files). */
export default defineConfig({
  base: './',
  plugins: [classicScriptPlugin()],
  build: {
    // chrome69 = Tizen 5.5. 'es2018' additionally forces lowering of the few ES2019 features Chromium 69
    // already has (e.g. optional catch binding), so `npm run check:compat` can verify with acorn at ES2018.
    target: ['chrome69', 'es2018'],
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: '',
    modulePreload: false,
    cssCodeSplit: false,
    sourcemap: false,
    minify: true,
    rolldownOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'app.js',
        assetFileNames: 'app[extname]',
      },
    },
  },
  server: {
    host: true,
  },
});
