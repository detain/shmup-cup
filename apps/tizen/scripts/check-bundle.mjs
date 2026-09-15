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
 *  5. config.xml and icon.png were copied from public/, and config.xml — whichever variant was
 *     built (default, game mode, gamepad check — `config-xml.mjs`, M2-17) — validates.
 *  6. Every other file is a non-script asset under dist/assets/ (atlas pages emitted by
 *     the shmupAssets() plugin, M1-03); anything else in dist/ would be packaged into the
 *     .wgt by accident.
 *  7. At least one atlas page (`dist/assets/atlas/*.png`) is present — the shell's boot
 *     loads the pages with `new Image()` and shows the boot error screen without them (M1-04).
 *  8. Budgets (plan M1-19, shmup_feat.md §22 / §23): `app.js` ≤ {@link APP_JS_GZIP_BUDGET}
 *     gzipped, every atlas page a PNG of at most {@link ATLAS_PAGE_MAX_SIZE}² pixels, the whole
 *     `dist/` ≤ {@link DIST_BUDGET} bytes.
 *
 * Exits non-zero with a readable report on failure. The checks are also exported as
 * {@link checkTizenBundle} so the unit tests can run them against fixture folders.
 *
 * **Public API.** {@link checkTizenBundle}, {@link WIDGET_FILES}, {@link POLYFILL_BANNER},
 * {@link APP_JS_GZIP_BUDGET}, {@link ATLAS_PAGE_MAX_SIZE}, {@link DIST_BUDGET}, {@link pngSize}.
 *
 * @module
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parse } from 'acorn';
import { validateConfigXml } from './config-xml.mjs';
import { DIST_DIR } from './tizen-env.mjs';

/**
 * Files that make up the widget itself (rule 5 requires them); every other file in `dist/`
 * must live under `assets/` (rule 6).
 */
export const WIDGET_FILES = ['app.js', 'config.xml', 'icon.png', 'index.html'];

/** First characters of the globalThis polyfill banner that must open app.js. */
export const POLYFILL_BANNER = '/* Shmup Cup — globalThis polyfill';

/**
 * Most bytes `app.js` may take gzipped (launch ≤ 10 s on the TV, shmup_feat.md §23): 350 KB from
 * M1-19, 384 KB since M2-16 (the Options pages, rebinding and the UI string table — the built-in
 * English table and its content copy — took the bundle to ≈ 359 KB).
 *
 * @remarks
 * The owner has authorised raising this budget when a plan step genuinely needs the room (M3-01
 * left only ≈ 9 KB free). Raise it deliberately: prefer leaner shipped code first, then bump this
 * constant together with the expectation in `apps/tizen/test/scripts/check-bundle.test.ts`, the
 * budget table in `docs/dev/debug-and-replays.md` and `docs/dev/api-reference.md`, and say in the
 * commit message what the extra bytes bought. The launch must still stay ≤ 10 s on the TV, which
 * M2-18's boot-time check guards.
 */
export const APP_JS_GZIP_BUDGET = 384 * 1024;

/** Largest atlas page edge in pixels (2048² — shmup_feat.md §22 budgets). */
export const ATLAS_PAGE_MAX_SIZE = 2048;

/** Most bytes the whole `dist/` may take (8 MB — the packaged widget). */
export const DIST_BUDGET = 8 * 1024 * 1024;

/** The 8-byte PNG signature. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Reads a PNG's pixel size from its IHDR chunk.
 *
 * @param {Uint8Array} bytes - The file.
 * @returns {{ width: number, height: number } | null} The size, or `null` when the bytes are not
 *   a PNG starting with an IHDR chunk.
 */
export function pngSize(bytes) {
  if (bytes.length < 24) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  const type = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (type !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

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
 * @returns {{ problems: string[], files: string[], code: string, gzipBytes: number, distBytes: number }}
 *   Problems found (empty when the bundle is valid), the files in the folder (relative,
 *   `/`-separated), the contents of app.js (`''` when missing), its gzipped size and the size of
 *   the whole folder in bytes.
 */
export function checkTizenBundle(distDir) {
  /** @type {string[]} */
  const problems = [];
  if (!existsSync(distDir)) {
    return {
      problems: [`${distDir} does not exist — run vite build first`],
      files: [],
      code: '',
      gzipBytes: 0,
      distBytes: 0,
    };
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
  const configXml = readOptional(join(distDir, 'config.xml'));
  if (configXml !== null) {
    for (const problem of validateConfigXml(configXml)) problems.push(`config.xml: ${problem}`);
  }

  // 6. Non-script assets only under assets/ (scripts anywhere are already reported by 1).
  const stray = files.filter(
    (file) =>
      !WIDGET_FILES.includes(file) && !file.startsWith('assets/') && !scripts.includes(file),
  );
  if (stray.length > 0) {
    problems.push(`unexpected files outside dist/assets/: ${stray.join(', ')}`);
  }

  // 7. The atlas pages the shell loads at boot.
  const pages = files.filter((file) => /^assets\/atlas\/[^/]+\.png$/.test(file));
  if (pages.length === 0) {
    problems.push('no atlas page in dist/assets/atlas/ (the game cannot boot without it)');
  }

  // 8. Budgets.
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

/** Command-line entry point: checks apps/tizen/dist and exits non-zero on failure. */
function main() {
  const { problems, files, code, gzipBytes, distBytes } = checkTizenBundle(DIST_DIR);
  if (problems.length > 0) {
    console.error('Tizen bundle check FAILED:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(
    `Tizen bundle OK: app.js ${kb(code.length)} (${kb(gzipBytes)} gzip of ${kb(APP_JS_GZIP_BUDGET)}), ` +
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
