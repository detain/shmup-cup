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
 *
 * Exits non-zero with a readable report on failure.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { parse } from 'acorn';
import { DIST_DIR } from './tizen-env.mjs';

/** @type {string[]} */
const problems = [];

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

const files = listFiles(DIST_DIR).map((file) => relative(DIST_DIR, file).split('\\').join('/'));

// 1. Exactly one script.
const scripts = files.filter((file) => /\.(m?js|cjs)$/.test(file));
if (scripts.length !== 1 || scripts[0] !== 'app.js') {
  problems.push(
    `expected exactly one script "app.js" in dist/, found: ${scripts.join(', ') || 'none'}`,
  );
}

// 2. Classic script tag.
const html = readFileSync(join(DIST_DIR, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];
if (scriptTags.length !== 1) {
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
const code = readFileSync(join(DIST_DIR, 'app.js'), 'utf8');
try {
  parse(code, { ecmaVersion: 2018, sourceType: 'script' });
} catch (error) {
  const err = /** @type {Error & { pos?: number }} */ (error);
  const pos = typeof err.pos === 'number' ? err.pos : 0;
  const context = code.slice(Math.max(0, pos - 80), pos + 80).replace(/\s+/g, ' ');
  problems.push(`app.js is not a valid ES2018 script: ${err.message}\n    near: …${context}…`);
}

// 4. Polyfill first.
if (!code.trimStart().startsWith('/* Shmup Cup — globalThis polyfill')) {
  problems.push('app.js does not start with the globalThis polyfill banner');
}

// 5. Tizen widget files.
for (const required of ['config.xml', 'icon.png', 'index.html']) {
  if (!files.includes(required)) problems.push(`dist/${required} is missing`);
}

if (problems.length > 0) {
  console.error('Tizen bundle check FAILED:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log(
  `Tizen bundle OK: app.js ${kb(code.length)} (${kb(gzipSync(code).length)} gzip), classic script, ES2018, ${files.length} files in dist/`,
);
