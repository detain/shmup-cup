#!/usr/bin/env node
/**
 * Verifies the Tizen build output after `vite build` (runs as part of `pnpm build`):
 *
 *  1. dist/ holds exactly ONE JavaScript file, `app.js` (no code-split chunks).
 *  2. index.html loads it with a classic `<script defer src="./app.js">` — no
 *     `type="module"` (ES modules are only partially supported on Tizen).
 *  3. app.js parses with acorn as an ES2018 *script* (Chromium 69 supports ES2018;
 *     this also rejects `import`/`export`, `import()`, `import.meta`, `?.`, `??`,
 *     class fields and optional catch binding that would slip through).
 *  4. app.js starts with the globalThis polyfill banner.
 *  5. config.xml and icon.png were copied from public/.
 *  6. Every other file is a non-script asset under dist/assets/ (atlas pages emitted by
 *     the shmupAssets() plugin, M1-03); anything else in dist/ would be packaged into the
 *     .wgt by accident.
 *
 * Exits non-zero with a readable report on failure. The checks are also exported as
 * {@link checkTizenBundle} so the unit tests can run them against fixture folders.
 *
 * **Public API.** {@link checkTizenBundle}, {@link WIDGET_FILES}, {@link POLYFILL_BANNER}.
 *
 * @module
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parse } from 'acorn';
import { DIST_DIR } from './tizen-env.mjs';

/**
 * Files that make up the widget itself (rule 5 requires them); every other file in `dist/`
 * must live under `assets/` (rule 6).
 */
export const WIDGET_FILES = ['app.js', 'config.xml', 'icon.png', 'index.html'];

/** First characters of the globalThis polyfill banner that must open app.js. */
export const POLYFILL_BANNER = '/* Shmup Cup — globalThis polyfill';

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
 * Reads a file, or returns `null` when it does not exist.
 *
 * @param {string} file - Absolute path.
 * @returns {string | null} The UTF-8 contents.
 */
function readOptional(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

/**
 * Runs every Tizen bundle check against a build output folder.
 *
 * @param {string} distDir - Folder produced by `vite build` (normally apps/tizen/dist).
 * @returns {{ problems: string[], files: string[], code: string }} Problems found (empty
 *   when the bundle is valid), the files in the folder (relative, `/`-separated) and
 *   the contents of app.js (`''` when missing).
 */
export function checkTizenBundle(distDir) {
  /** @type {string[]} */
  const problems = [];
  if (!existsSync(distDir)) {
    return { problems: [`${distDir} does not exist — run vite build first`], files: [], code: '' };
  }
  const files = listFiles(distDir).map((file) => relative(distDir, file).split('\\').join('/'));

  // 1. Exactly one script.
  const scripts = files.filter((file) => /\.(m?js|cjs)$/.test(file));
  if (scripts.length !== 1 || scripts[0] !== 'app.js') {
    problems.push(
      `expected exactly one script "app.js" in dist/, found: ${scripts.join(', ') || 'none'}`,
    );
  }

  // 2. Classic script tag.
  const rawHtml = readOptional(join(distDir, 'index.html'));
  const html = (rawHtml ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];
  if (rawHtml !== null && scriptTags.length !== 1) {
    problems.push(`index.html should contain exactly one <script> tag, found ${scriptTags.length}`);
  }
  for (const tag of scriptTags) {
    if (/type\s*=\s*["']?module/.test(tag))
      problems.push(`index.html still loads a module script: ${tag}`);
    if (!/src="\.\/app\.js"/.test(tag))
      problems.push(`index.html script does not load ./app.js: ${tag}`);
    if (!/\bdefer\b/.test(tag)) problems.push(`index.html script is not deferred: ${tag}`);
  }

  // 3. ES2018 classic-script parse.
  const code = readOptional(join(distDir, 'app.js')) ?? '';
  if (code !== '') {
    try {
      parse(code, { ecmaVersion: 2018, sourceType: 'script' });
    } catch (error) {
      const err = /** @type {Error & { pos?: number }} */ (error);
      const pos = typeof err.pos === 'number' ? err.pos : 0;
      const context = code.slice(Math.max(0, pos - 80), pos + 80).replace(/\s+/g, ' ');
      problems.push(`app.js is not a valid ES2018 script: ${err.message}\n    near: …${context}…`);
    }

    // 4. Polyfill first.
    if (!code.trimStart().startsWith(POLYFILL_BANNER)) {
      problems.push('app.js does not start with the globalThis polyfill banner');
    }
  }

  // 5. Tizen widget files.
  for (const required of ['config.xml', 'icon.png', 'index.html', 'app.js']) {
    if (!files.includes(required)) problems.push(`dist/${required} is missing`);
  }

  // 6. Non-script assets only under assets/ (scripts anywhere are already reported by 1).
  const stray = files.filter(
    (file) =>
      !WIDGET_FILES.includes(file) && !file.startsWith('assets/') && !scripts.includes(file),
  );
  if (stray.length > 0) {
    problems.push(`unexpected files outside dist/assets/: ${stray.join(', ')}`);
  }

  return { problems, files, code };
}

/** Command-line entry point: checks apps/tizen/dist and exits non-zero on failure. */
function main() {
  const { problems, files, code } = checkTizenBundle(DIST_DIR);
  if (problems.length > 0) {
    console.error('Tizen bundle check FAILED:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  /**
   * Formats a byte count for the report.
   *
   * @param {number} bytes - Size in bytes.
   * @returns {string} e.g. `"812.4 KB"`.
   */
  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  console.log(
    `Tizen bundle OK: app.js ${kb(code.length)} (${kb(gzipSync(code).length)} gzip), classic script, ES2018, ${files.length} files in dist/`,
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
