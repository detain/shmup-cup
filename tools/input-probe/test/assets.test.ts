/**
 * Static project assets and config: the Tizen widget config (spec essentials), index.html ↔ glue consistency,
 * the Vite build config and its classic-script HTML rewrite, .gitignore, package scripts, and the
 * dependency-free icon generator (reproduces the committed icon.png).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ARENA_HEIGHT, ARENA_WIDTH } from '../src/arena';
import viteConfig, { classicScriptHtml } from '../vite.config';
import { decodePng, pixelAt } from './helpers/png';
import { PROJECT_ROOT, runNode, tempDir } from './helpers/project';

const read = (rel: string): string => readFileSync(join(PROJECT_ROOT, rel), 'utf8');

/** Returns the attributes of the first `<tag …>` in `xml` as a map. */
function attrs(xml: string, tag: string): Record<string, string> {
  const m = new RegExp('<' + tag + '\\b([^>]*)>').exec(xml);
  if (!m) throw new Error('<' + tag + '> not found');
  const out: Record<string, string> = {};
  for (const a of (m[1] as string).matchAll(/([\w:-]+)="([^"]*)"/g)) out[a[1] as string] = a[2] as string;
  return out;
}

describe('public/config.xml (spec essentials)', () => {
  const xml = read('public/config.xml');

  it('is a W3C widget with the spec id, version and view mode', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(attrs(xml, 'widget')).toEqual({
      xmlns: 'http://www.w3.org/ns/widgets',
      'xmlns:tizen': 'http://tizen.org/ns/widgets',
      id: 'http://shmupcup.dev/InputProbe',
      version: '0.1.0',
      viewmodes: 'maximized',
    });
  });

  it('declares the Tizen application, content, icon and name', () => {
    expect(attrs(xml, 'tizen:application')).toEqual({ id: 'ShmpCpIPrb.InputProbe', package: 'ShmpCpIPrb', required_version: '2.3' });
    expect(attrs(xml, 'content')).toEqual({ src: 'index.html' });
    expect(attrs(xml, 'icon')).toEqual({ src: 'icon.png' });
    expect(xml).toContain('<name>InputProbe</name>');
    expect(attrs(xml, 'access')).toEqual({ origin: '*', subdomains: 'true' });
    expect(attrs(xml, 'tizen:profile')).toEqual({ name: 'tv-samsung' });
  });

  it('requests exactly the internet, tv.inputdevice and productinfo privileges', () => {
    const privs = [...xml.matchAll(/<tizen:privilege name="([^"]+)"/g)].map((m) => m[1]);
    expect(privs.sort()).toEqual([
      'http://developer.samsung.com/privilege/productinfo',
      'http://tizen.org/privilege/internet',
      'http://tizen.org/privilege/tv.inputdevice',
    ]);
  });

  it('has the spec settings (hardware keys enabled, landscape, no background)', () => {
    expect(attrs(xml, 'tizen:setting')).toEqual({
      'screen-orientation': 'landscape',
      'context-menu': 'enable',
      'background-support': 'disable',
      encryption: 'disable',
      'install-location': 'auto',
      'hwkey-event': 'enable',
    });
  });

  it('application id package prefix is 10 alphanumeric characters (Tizen requirement)', () => {
    const { id, package: pkg } = attrs(xml, 'tizen:application');
    expect(pkg).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(id?.startsWith(pkg + '.')).toBe(true);
  });

  it('widget version matches package.json', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    expect(attrs(xml, 'widget')['version']).toBe(pkg.version);
  });
});

describe('index.html', () => {
  const html = read('index.html');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

  it('contains every element the glue looks up', () => {
    for (const id of ['stage', 'arena', 'log', 'env', 'verdicts', 'checklist', 'seen', 'keys', 'pads', 'headline', 'report']) {
      expect(ids.has(id), '#' + id).toBe(true);
    }
  });

  it('arena canvas size matches ARENA_WIDTH × ARENA_HEIGHT', () => {
    expect(html).toMatch(new RegExp('<canvas id="arena" width="' + ARENA_WIDTH + '" height="' + ARENA_HEIGHT + '"'));
  });

  it('loads Samsung webapis.js before the app entry', () => {
    const webapis = html.indexOf('$WEBAPIS/webapis/webapis.js');
    const entry = html.indexOf('src="./src/main.ts"');
    expect(webapis).toBeGreaterThan(0);
    expect(entry).toBeGreaterThan(webapis);
  });

  it('shows the 9-step on-device test protocol from the spec', () => {
    const protocol = /<ol id="protocol">([\s\S]*?)<\/ol>/.exec(html)?.[1] ?? '';
    const steps = [...protocol.matchAll(/<li>/g)];
    expect(steps).toHaveLength(9);
    expect(protocol).toContain('240 fps');
    expect(protocol).toContain('Press Home');
  });

  it('mentions the exit gesture and reset key in the header', () => {
    expect(html).toContain('Back ×3 quickly');
    expect(html).toContain('Play/Pause');
  });
});

describe('vite.config.ts', () => {
  it('builds a single chrome69 IIFE app.js with relative URLs', () => {
    const cfg = viteConfig as unknown as {
      base: string;
      build: { target: string[]; modulePreload: boolean; cssCodeSplit: boolean; rolldownOptions: { output: Record<string, string> } };
      plugins: Array<{ name: string; apply: string }>;
    };
    expect(cfg.base).toBe('./');
    expect(cfg.build.target).toContain('chrome69');
    expect(cfg.build.modulePreload).toBe(false);
    expect(cfg.build.cssCodeSplit).toBe(false);
    expect(cfg.build.rolldownOptions.output).toMatchObject({ format: 'iife', entryFileNames: 'app.js' });
    expect(cfg.plugins).toEqual([expect.objectContaining({ name: 'input-probe:classic-script', apply: 'build' })]);
  });
});

describe('classicScriptHtml', () => {
  it('turns the Vite module entry into a deferred classic script', () => {
    expect(classicScriptHtml('<script type="module" crossorigin src="./app.js"></script>')).toBe(
      '<script defer src="./app.js"></script>',
    );
  });

  it('handles attribute order, single quotes and valued crossorigin', () => {
    expect(classicScriptHtml("<script crossorigin=\"anonymous\" type='module' src='./app.js'></script>")).toBe(
      "<script defer src='./app.js'></script>",
    );
  });

  it('does not add a second defer', () => {
    expect(classicScriptHtml('<script type="module" defer src="./app.js"></script>')).toBe('<script defer src="./app.js"></script>');
  });

  it('leaves classic scripts alone', () => {
    const tag = '<script src="$WEBAPIS/webapis/webapis.js"></script><script>var x = 1;</script>';
    expect(classicScriptHtml(tag)).toBe(tag);
  });

  it('strips crossorigin from links', () => {
    expect(classicScriptHtml('<link rel="stylesheet" crossorigin href="./app.css">')).toBe('<link rel="stylesheet" href="./app.css">');
    expect(classicScriptHtml('<link rel="icon" href="x.png">')).toBe('<link rel="icon" href="x.png">');
  });

  it('rewrites a whole Vite-style document', () => {
    const doc = [
      '<head>',
      '  <script src="$WEBAPIS/webapis/webapis.js"></script>',
      '  <script type="module" crossorigin src="./app.js"></script>',
      '  <link rel="stylesheet" crossorigin href="./app.css">',
      '</head>',
    ].join('\n');
    const out = classicScriptHtml(doc);
    expect(out).not.toMatch(/type=["']module["']/);
    expect(out).not.toContain('crossorigin');
    expect(out).toContain('<script defer src="./app.js"></script>');
    expect(out).toContain('<script src="$WEBAPIS/webapis/webapis.js"></script>');
  });
});

describe('project hygiene', () => {
  it('.gitignore excludes build output, packages, logs and dependencies', () => {
    const lines = read('.gitignore').split(/\r?\n/);
    for (const entry of ['node_modules/', 'dist/', '*.wgt', 'logs/']) expect(lines).toContain(entry);
  });

  it('package.json is a standalone npm project with the spec scripts', () => {
    const pkg = JSON.parse(read('package.json')) as { private: boolean; scripts: Record<string, string>; dependencies?: unknown };
    expect(pkg.private).toBe(true);
    expect(pkg.dependencies).toBeUndefined(); // nothing shipped from npm at runtime
    for (const s of ['dev', 'build', 'typecheck', 'test', 'check:compat', 'package', 'deploy', 'log-server']) {
      expect(pkg.scripts[s], s).toBeTruthy();
    }
    expect(pkg.scripts['check:compat']).toContain('check-compat.mjs');
    expect(pkg.scripts['typecheck']).toContain('tsc --noEmit');
  });
});

describe('scripts/make-icon.mjs', () => {
  it('generates a 512×423 RGBA PNG identical in pixels to the committed public/icon.png', () => {
    const out = join(tempDir('probe-icon-'), 'icon.png');
    const r = runNode(join(PROJECT_ROOT, 'scripts', 'make-icon.mjs'), [out]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('512×423');

    const fresh = decodePng(readFileSync(out));
    expect(fresh).toMatchObject({ width: 512, height: 423, bitDepth: 8, colorType: 6 });
    expect(fresh.chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(fresh.chunks.every((c) => c.crcOk)).toBe(true);
    expect(fresh.raw.length).toBe((512 * 4 + 1) * 423);

    const committed = decodePng(readFileSync(join(PROJECT_ROOT, 'public', 'icon.png')));
    expect(committed.chunks.every((c) => c.crcOk)).toBe(true);
    expect(committed.raw.equals(fresh.raw)).toBe(true);

    // Rounded-corner transparency, navy tile, white/orange OK button in the middle.
    expect(pixelAt(fresh, 0, 0)[3]).toBe(0);
    expect(pixelAt(fresh, 511, 422)[3]).toBe(0);
    expect(pixelAt(fresh, 256, 15)).toEqual([13, 22, 51, 255]);
    expect(pixelAt(fresh, 256, 211 - 177)).toEqual([43, 63, 122, 255]); // D-pad ring
    expect(pixelAt(fresh, 256, 211)).toEqual([255, 179, 71, 255]);
    expect(pixelAt(fresh, 256, 211 - 38)).toEqual([255, 255, 255, 255]);
  });
});
