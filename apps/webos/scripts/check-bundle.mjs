#!/usr/bin/env node
/**
 * Verifies the webOS build output after `vite build` (runs as part of `pnpm build`):
 *
 *  1. dist/ holds exactly ONE JavaScript file, `app.js` (no code-split chunks).
 *  2. index.html loads it with a classic `<script defer src="./app.js">` — no `type="module"`.
 *  3. app.js parses with acorn as an ES2018 *script* (this also rejects `import`/`export`,
 *     `import()`, `import.meta`, `?.`, `??`, class fields and optional catch binding).
 *  4. app.js starts with the globalThis polyfill banner (webOS 5 = Chromium 68, no `globalThis`).
 *  5. `appinfo.json`, `icon.png` and `largeIcon.png` were copied from public/, and `appinfo.json`
 *     validates (`scripts/appinfo.mjs`).
 *  6. Every other file is a non-script asset under dist/assets/ — anything else would be packaged
 *     into the `.ipk` by accident.
 *  7. At least one atlas page (`dist/assets/atlas/*.png`) is present.
 *  8. The same budgets as the Tizen widget, imported from its check so there is one source of
 *     truth: `app.js` ≤ `APP_JS_GZIP_BUDGET` gzipped, every atlas page at most
 *     `ATLAS_PAGE_MAX_SIZE`² pixels, the whole `dist/` ≤ `DIST_BUDGET`.
 *
 * Exits non-zero with a readable report on failure. The checks are also exported as
 * {@link checkWebosBundle} so the unit tests can run them against fixture folders.
 *
 * **Public API.** {@link checkWebosBundle}, {@link WEBOS_APP_FILES}.
 *
 * @module
 */
import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import {
  APP_JS_GZIP_BUDGET,
  ATLAS_PAGE_MAX_SIZE,
  DIST_BUDGET,
  POLYFILL_BANNER,
  pngSize,
} from '../../tizen/scripts/check-bundle.mjs';
import { validateAppInfo } from './appinfo.mjs';

/** `apps/webos/dist`. */
const DIST_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/**
 * Files that make up the webOS app itself (rule 5 requires them); every other file in `dist/`
 * must live under `assets/` (rule 6).
 */
export const WEBOS_APP_FILES = [
  'app.js',
  'appinfo.json',
  'icon.png',
  'index.html',
  'largeIcon.png',
];

/**
 * Formats a byte count for reports.
 *
 * @param {number} bytes - Size in bytes.
 * @returns {string} e.g. `"812.4 KB"`.
 */
function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Lists files under a directory recursively.
 *
 * @param {string} dir - Directory.
 * @returns {string[]} Absolute file paths.
 */
function listFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * Runs every webOS bundle check against a build output folder.
 *
 * @param {string} distDir - Folder produced by `vite build` (normally apps/webos/dist).
 * @returns {{ problems: string[], files: string[], code: string, gzipBytes: number, distBytes: number }}
 *   Problems found (empty when the bundle is valid), the files in the folder (relative,
 *   `/`-separated), the contents of app.js (`''` when missing), its gzipped size and the size of
 *   the whole folder in bytes.
 */
export function checkWebosBundle(distDir) {
  /** @type {string[]} */
  const problems = [];
  if (!existsSync(distDir)) {
    return {
      problems: [`${distDir} does not exist — run "pnpm --filter @shmup/webos build" first`],
      files: [],
      code: '',
      gzipBytes: 0,
      distBytes: 0,
    };
  }
  const files = listFiles(distDir)
    .map((file) =>
      file
        .slice(distDir.length + 1)
        .split('\\')
        .join('/'),
    )
    .sort();

  // 1. one script, named app.js.
  const scripts = files.filter((file) => file.endsWith('.js'));
  if (scripts.length !== 1 || scripts[0] !== 'app.js') {
    problems.push(
      `dist/ must hold exactly one script, app.js; found ${scripts.join(', ') || 'none'}`,
    );
  }
  const code = files.indexOf('app.js') >= 0 ? readFileSync(join(distDir, 'app.js'), 'utf8') : '';

  // 2. classic script tag.
  const html =
    files.indexOf('index.html') >= 0 ? readFileSync(join(distDir, 'index.html'), 'utf8') : '';
  if (html === '') problems.push('dist/index.html is missing');
  else {
    if (/<script[^>]*\btype="module"/.test(html)) {
      problems.push('index.html still loads a type="module" script (webOS 5 wants a classic one)');
    }
    if (!/<script[^>]*\bsrc="\.\/app\.js"/.test(html)) {
      problems.push('index.html does not load ./app.js');
    }
  }

  // 3. ES2018 script.
  if (code !== '') {
    try {
      parse(code, { ecmaVersion: 2018, sourceType: 'script' });
    } catch (error) {
      problems.push(
        `app.js does not parse as an ES2018 script: ${/** @type {Error} */ (error).message}`,
      );
    }
  }

  // 4. the globalThis polyfill banner.
  if (code !== '' && !code.startsWith(POLYFILL_BANNER)) {
    problems.push('app.js does not start with the globalThis polyfill banner');
  }

  // 5. the app files, and a valid appinfo.json.
  for (const file of WEBOS_APP_FILES) {
    if (files.indexOf(file) < 0) problems.push(`dist/${file} is missing`);
  }
  if (files.indexOf('appinfo.json') >= 0) {
    problems.push(...validateAppInfo(readFileSync(join(distDir, 'appinfo.json'), 'utf8')));
  }

  // 6. everything else lives under assets/ and is not a script.
  for (const file of files) {
    if (WEBOS_APP_FILES.indexOf(file) >= 0) continue;
    if (!file.startsWith('assets/')) problems.push(`unexpected file in dist/: ${file}`);
    else if (file.endsWith('.js')) problems.push(`unexpected script in dist/assets/: ${file}`);
  }

  // 7. at least one atlas page.
  const pages = files.filter((file) => file.startsWith('assets/atlas/') && file.endsWith('.png'));
  if (pages.length === 0) problems.push('dist/assets/atlas/ holds no atlas page');

  // 8. budgets, shared with the Tizen widget.
  const gzipBytes = code === '' ? 0 : gzipSync(code).length;
  if (gzipBytes > APP_JS_GZIP_BUDGET) {
    problems.push(`app.js is ${kb(gzipBytes)} gzipped, over the ${kb(APP_JS_GZIP_BUDGET)} budget`);
  }
  for (const page of pages) {
    const size = pngSize(readFileSync(join(distDir, page)));
    if (size === null) {
      problems.push(`atlas page ${page} is not a PNG`);
    } else if (size.width > ATLAS_PAGE_MAX_SIZE || size.height > ATLAS_PAGE_MAX_SIZE) {
      problems.push(
        `atlas page ${page} is ${size.width}×${size.height}, over the ${ATLAS_PAGE_MAX_SIZE}² budget`,
      );
    }
  }
  let distBytes = 0;
  for (const file of files) distBytes += statSync(join(distDir, file)).size;
  if (distBytes > DIST_BUDGET) {
    problems.push(`dist/ holds ${kb(distBytes)}, over the ${kb(DIST_BUDGET)} budget`);
  }

  return { problems, files, code, gzipBytes, distBytes };
}

/** Command-line entry point: checks apps/webos/dist and exits non-zero on failure. */
function main() {
  const { problems, files, code, gzipBytes, distBytes } = checkWebosBundle(DIST_DIR);
  if (problems.length > 0) {
    console.error('webOS bundle check FAILED:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(
    `webOS bundle OK: app.js ${kb(code.length)} (${kb(gzipBytes)} gzip of ${kb(APP_JS_GZIP_BUDGET)}), ` +
      `classic script, ES2018, ${files.length} files in dist/ (${kb(distBytes)} of ${kb(DIST_BUDGET)})`,
  );
}

/**
 * Whether this file is the script Node was started with (`node scripts/check-bundle.mjs`),
 * as opposed to being imported by a test. Compares real paths so symlinked checkouts work.
 *
 * @returns {boolean} `true` when run from the command line.
 */
function isCommandLineEntry() {
  const entry = process.argv[1];
  if (entry === undefined || !existsSync(entry)) return false;
  return realpathSync(resolve(entry)) === realpathSync(fileURLToPath(import.meta.url));
}

if (isCommandLineEntry()) main();
