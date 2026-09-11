/**
 * scripts/check-compat.mjs against hand-made dist/ fixtures: one passing layout and one fixture per failure rule
 * (ES2019+ syntax, module syntax, module/crossorigin tags, missing widget files, bad config/icon).
 */

import { copyFileSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PROJECT_ROOT, runNode, tempDir } from './helpers/project';

const SCRIPT = join(PROJECT_ROOT, 'scripts', 'check-compat.mjs');

const GOOD_JS = '(function(){"use strict";var a={x:1};var b=Object.assign({},a,{y:2});try{b.z()}catch(e){}for(const k of Object.keys(b)){console.log(k)}async function f(){await 1}var {x,...rest}=b;})();\n';

const GOOD_HTML = [
  '<!doctype html><html><head>',
  '<script src="$WEBAPIS/webapis/webapis.js"></script>',
  '<script defer src="./app.js"></script>',
  '<link rel="stylesheet" href="./app.css">',
  '</head><body></body></html>',
].join('\n');

interface Fixture {
  js?: string | null;
  html?: string | null;
  config?: string | null;
  icon?: Buffer | 'real' | null;
}

function makeDist(f: Fixture = {}): string {
  const dir = join(tempDir('probe-compat-'), 'dist');
  mkdirSync(dir, { recursive: true });
  const js = f.js === undefined ? GOOD_JS : f.js;
  const html = f.html === undefined ? GOOD_HTML : f.html;
  if (js !== null) writeFileSync(join(dir, 'app.js'), js);
  if (html !== null) writeFileSync(join(dir, 'index.html'), html);
  if (f.config === undefined) copyFileSync(join(PROJECT_ROOT, 'public', 'config.xml'), join(dir, 'config.xml'));
  else if (f.config !== null) writeFileSync(join(dir, 'config.xml'), f.config);
  if (f.icon === undefined || f.icon === 'real') copyFileSync(join(PROJECT_ROOT, 'public', 'icon.png'), join(dir, 'icon.png'));
  else if (f.icon !== null) writeFileSync(join(dir, 'icon.png'), f.icon);
  return dir;
}

function check(dir: string): ReturnType<typeof runNode> {
  return runNode(SCRIPT, [dir]);
}

describe('check-compat.mjs', () => {
  it('passes a Chromium-69-compatible dist/ (ES2018 syntax incl. async, rest/spread)', () => {
    const r = check(makeDist());
    expect(r.all).toContain('ok   app.js parses as an ES2018 classic script');
    expect(r.all).toContain('ok   index.html loads app.js: <script defer src="./app.js">');
    expect(r.all).toContain('ok   config.xml present');
    expect(r.all).toContain('ok   icon.png present');
    expect(r.all).toContain('check:compat passed');
    expect(r.status).toBe(0);
  });

  it('fails when dist/ does not exist', () => {
    const r = check(join(tempDir(), 'nope'));
    expect(r.status).toBe(1);
    expect(r.all).toContain('dist/ not found');
  });

  it.each([
    ['optional chaining (ES2020)', 'var a={};console.log(a?.b);'],
    ['nullish coalescing (ES2020)', 'var a=null;console.log(a??1);'],
    ['optional catch binding (ES2019)', 'try{f()}catch{}'],
    ['class fields (ES2022)', 'class A{x=1}'],
    ['numeric separators (ES2021)', 'var n=1_000;'],
    ['logical assignment (ES2021)', 'var a;a||=1;'],
    ['BigInt literal (ES2020)', 'var n=10n;'],
    ['ES module export', 'export const x=1;'],
    ['ES module import', 'import x from "y";'],
    ['import.meta', 'console.log(import.meta.url);'],
  ])('rejects %s in app.js', (_label, js) => {
    const r = check(makeDist({ js }));
    expect(r.status).toBe(1);
    expect(r.all).toContain('FAIL app.js is not ES2018 script syntax');
    expect(r.all).toContain('check:compat failed');
  });

  it('reports a missing app.js', () => {
    const r = check(makeDist({ js: null }));
    expect(r.status).toBe(1);
    expect(r.all).toContain('FAIL dist/app.js missing');
  });

  it.each([
    ['a module script tag', GOOD_HTML.replace('<script defer src="./app.js">', '<script type="module" src="./app.js">'), 'module script tag remains'],
    ['crossorigin on the script', GOOD_HTML.replace('<script defer src', '<script defer crossorigin src'), 'crossorigin attribute remains'],
    ['crossorigin on a link', GOOD_HTML.replace('<link rel', '<link crossorigin rel'), 'crossorigin attribute remains in index.html'],
    ['a modulepreload link', GOOD_HTML.replace('</head>', '<link rel="modulepreload" href="./x.js"></head>'), 'modulepreload link remains'],
    ['no app.js script', GOOD_HTML.replace('<script defer src="./app.js"></script>', ''), 'should load app.js exactly once, found 0'],
    ['app.js loaded twice', GOOD_HTML.replace('</head>', '<script src="./app.js"></script></head>'), 'should load app.js exactly once, found 2'],
    ['no webapis.js tag', GOOD_HTML.replace('<script src="$WEBAPIS/webapis/webapis.js"></script>', ''), 'webapis.js script tag missing'],
  ])('rejects index.html with %s', (_label, html, msg) => {
    const r = check(makeDist({ html }));
    expect(r.status).toBe(1);
    expect(r.all).toContain(msg);
  });

  it('reports a missing index.html', () => {
    const r = check(makeDist({ html: null }));
    expect(r.status).toBe(1);
    expect(r.all).toContain('FAIL dist/index.html missing');
  });

  it('reports missing widget files', () => {
    const r = check(makeDist({ config: null, icon: null }));
    expect(r.status).toBe(1);
    expect(r.all).toContain('FAIL config.xml missing from dist/');
    expect(r.all).toContain('FAIL icon.png missing from dist/');
  });

  it('validates config.xml content', () => {
    const r = check(makeDist({ config: '<widget><content src="main.html"/><icon src="logo.png"/><tizen:application id="Other.App"/></widget>' }));
    expect(r.status).toBe(1);
    expect(r.all).toContain('config.xml does not point at index.html');
    expect(r.all).toContain('config.xml does not reference icon.png');
    expect(r.all).toContain('application id is not ShmpCpIPrb.InputProbe');
  });

  it('rejects an icon.png that is not a PNG', () => {
    const r = check(makeDist({ icon: Buffer.from('GIF89a....') }));
    expect(r.status).toBe(1);
    expect(r.all).toContain('icon.png is not a PNG');
  });

  it('defaults to ./dist next to the scripts when no argument is given', () => {
    // Run a copy of the script from a temp project whose dist/ is missing.
    const root = tempDir('probe-compat-root-');
    mkdirSync(join(root, 'scripts'));
    copyFileSync(SCRIPT, join(root, 'scripts', 'check-compat.mjs'));
    symlinkSync(join(PROJECT_ROOT, 'node_modules'), join(root, 'node_modules'), 'junction'); // for acorn
    const r = runNode(join(root, 'scripts', 'check-compat.mjs'), [], { cwd: PROJECT_ROOT });
    expect(r.status).toBe(1);
    expect(r.all).toContain('check:compat — ' + join(root, 'dist'));
  });
});
