#!/usr/bin/env node
/**
 * Post-build compatibility check for Tizen 5.5 (Chromium 69):
 *
 * 1. `dist/app.js` parses with acorn at ecmaVersion 2018 as a classic script (no ES2019+ syntax such as
 *    optional catch binding, no `import`/`export`/`import.meta`).
 * 2. `dist/index.html` loads `app.js` as a classic script (no `type="module"`, no `crossorigin`).
 * 3. `dist/config.xml` and `dist/icon.png` are present (and config.xml references them).
 *
 * Usage: node scripts/check-compat.mjs [distDir]   (exit code 1 on failure)
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(process.argv[2] ?? join(here, '..', 'dist'));
const failures = [];
const ok = (msg) => console.log('  ok   ' + msg);
const fail = (msg) => {
  failures.push(msg);
  console.log('  FAIL ' + msg);
};

console.log('check:compat — ' + dist);

if (!existsSync(dist)) {
  console.error('dist/ not found — run `npm run build` first');
  process.exit(1);
}

// 1. app.js syntax
const appPath = join(dist, 'app.js');
if (!existsSync(appPath)) fail('dist/app.js missing');
else {
  const src = readFileSync(appPath, 'utf8');
  try {
    parse(src, { ecmaVersion: 2018, sourceType: 'script' });
    ok('app.js parses as an ES2018 classic script (' + (statSync(appPath).size / 1024).toFixed(1) + ' KiB)');
  } catch (e) {
    const pos = typeof e.pos === 'number' ? e.pos : 0;
    fail('app.js is not ES2018 script syntax: ' + e.message + ' near: ' + JSON.stringify(src.slice(Math.max(0, pos - 60), pos + 60)));
  }
  if (/\bimport\.meta\b/.test(src)) fail('app.js still references import.meta');
}

// 2. index.html script tags
const htmlPath = join(dist, 'index.html');
if (!existsSync(htmlPath)) fail('dist/index.html missing');
else {
  const html = readFileSync(htmlPath, 'utf8');
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  const app = scripts.filter((s) => /src=["'][^"']*app\.js["']/.test(s));
  if (app.length !== 1) fail('index.html should load app.js exactly once, found ' + app.length);
  else ok('index.html loads app.js: ' + app[0]);
  for (const s of scripts) {
    if (/type\s*=\s*["']module["']/.test(s)) fail('module script tag remains: ' + s);
    if (/\bcrossorigin\b/.test(s)) fail('crossorigin attribute remains: ' + s);
  }
  if (/\bcrossorigin\b/.test(html)) fail('crossorigin attribute remains in index.html');
  if (/<link[^>]+rel=["']modulepreload["']/.test(html)) fail('modulepreload link remains');
  if (!/\$WEBAPIS\/webapis\/webapis\.js/.test(html)) fail('webapis.js script tag missing');
  else ok('index.html keeps the $WEBAPIS/webapis/webapis.js tag');
}

// 3. widget files
for (const f of ['config.xml', 'icon.png']) {
  if (existsSync(join(dist, f))) ok(f + ' present');
  else fail(f + ' missing from dist/');
}
if (existsSync(join(dist, 'config.xml'))) {
  const xml = readFileSync(join(dist, 'config.xml'), 'utf8');
  if (!/<content\s+src="index\.html"/.test(xml)) fail('config.xml does not point at index.html');
  if (!/<icon\s+src="icon\.png"/.test(xml)) fail('config.xml does not reference icon.png');
  if (!/ShmpCpIPrb\.InputProbe/.test(xml)) fail('config.xml application id is not ShmpCpIPrb.InputProbe');
}
if (existsSync(join(dist, 'icon.png'))) {
  const sig = readFileSync(join(dist, 'icon.png')).subarray(0, 8);
  if (sig.toString('hex') !== '89504e470d0a1a0a') fail('icon.png is not a PNG');
}

if (failures.length > 0) {
  console.error('\ncheck:compat failed (' + failures.length + ')');
  process.exit(1);
}
console.log('\ncheck:compat passed');
