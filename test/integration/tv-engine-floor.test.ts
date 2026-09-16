/**
 * The engine floor the two TV builds share (plan M3-03).
 *
 * Tizen 5.5 is Chromium **69**; webOS 5 is Chromium **68**, one release older. Both builds are
 * emitted with the same `chrome69` + `es2018` target and the same `globalThis` polyfill, which is
 * only safe while **no shipped source uses an API Chrome 68 lacks** — and the lint cannot say so,
 * because its browserslist floor is `chrome >= 69`: `[].flat()` and `[].flatMap()` are Chrome 69
 * APIs, so ESLint *accepts* them (`test/integration/eslint-rules.test.ts` asserts exactly that)
 * and they would throw on an LG set.
 *
 * So this file does what the lint cannot: it scans the shipped runtime sources for the handful of
 * APIs between Chrome 68 and the lint's own floor, and pins the shared build settings that make
 * one target correct for two engines. The scan is the same shape as the `.timeStamp` scan in
 * `eslint-rules.test.ts` — a belt beside the braces, for a rule no config can express.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  APP_JS_GZIP_BUDGET,
  ATLAS_PAGE_MAX_SIZE,
  DIST_BUDGET,
  POLYFILL_BANNER,
} from '../../apps/tizen/scripts/check-bundle.mjs';
import { WEBOS_APP_FILES, checkWebosBundle } from '../../apps/webos/scripts/check-bundle.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every source tree that ships to a browser or a TV. */
const RUNTIME_ROOTS = [
  'packages/core/src',
  'packages/audio-web/src',
  'packages/input-web/src',
  'packages/render-pixi/src',
  'packages/shell/src',
  'apps/web/src',
  'apps/tizen/src',
  'apps/webos/src',
];

/**
 * APIs Chrome 68 does not have. The first two are the ones the lint lets through (Chrome 69);
 * the rest are already lint errors and are re-checked here so one scan covers the whole floor.
 */
const TOO_NEW = [
  ['.flat(', 'Array.prototype.flat (Chrome 69 — webOS 5 is 68)'],
  ['.flatMap(', 'Array.prototype.flatMap (Chrome 69 — webOS 5 is 68)'],
  ['Object.fromEntries', 'Object.fromEntries (Chrome 73)'],
  ['Object.hasOwn', 'Object.hasOwn (Chrome 93)'],
  ['Promise.allSettled', 'Promise.allSettled (Chrome 76)'],
  ['Promise.any', 'Promise.any (Chrome 85)'],
  ['.replaceAll(', 'String.prototype.replaceAll (Chrome 85)'],
  ['.matchAll(', 'String.prototype.matchAll (Chrome 73)'],
  ['structuredClone', 'structuredClone (Chrome 98)'],
  ['queueMicrotask', 'queueMicrotask (Chrome 71)'],
  ['WeakRef', 'WeakRef (Chrome 84)'],
  ['FinalizationRegistry', 'FinalizationRegistry (Chrome 84)'],
  ['.at(', 'Array.prototype.at (Chrome 92)'],
] as const;

/**
 * Strips block and line comments so a docblock that *names* an API is not an offence.
 *
 * @param source - TypeScript source.
 * @returns The code with its comments blanked out.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * Every `.ts` file under a repo-relative directory.
 *
 * @param relative - The directory.
 * @returns Repo-relative file paths, sorted.
 */
function sourcesOf(relative: string): string[] {
  const root = join(repo, relative);
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (/\.(ts|mts|cts)$/.test(entry.name)) out.push(path.slice(repo.length + 1));
    }
  }
  return out.sort();
}

/**
 * Reads a repo file.
 *
 * @param path - Repo-relative path.
 * @returns Its text.
 */
function read(path: string): string {
  return readFileSync(join(repo, path), 'utf8');
}

describe('integration: shipped code stays inside Chromium 68 (webOS 5) — M3-03', () => {
  const files = RUNTIME_ROOTS.flatMap((root) => sourcesOf(root));

  it('scans every runtime source tree (and finds some)', () => {
    expect(files.length).toBeGreaterThan(50);
    for (const root of RUNTIME_ROOTS) {
      expect(sourcesOf(root).length, root).toBeGreaterThan(0);
    }
  });

  it('uses no API newer than Chrome 68 anywhere in shipped source', () => {
    const offenders: string[] = [];
    for (const path of files) {
      const code = stripComments(read(path));
      for (const [needle, what] of TOO_NEW) {
        if (code.includes(needle)) offenders.push(`${path}: ${what}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('would catch one if it appeared — the scan is not vacuous', () => {
    const sample = 'export const a = [1, [2]].flat();\nexport const b = Object.fromEntries([]);\n';
    const hits = TOO_NEW.filter(([needle]) => stripComments(sample).includes(needle));
    expect(hits.map(([, what]) => what)).toEqual([
      'Array.prototype.flat (Chrome 69 — webOS 5 is 68)',
      'Object.fromEntries (Chrome 73)',
    ]);
    // …and a docblock naming the same API is not an offence.
    expect(stripComments('/** Never use Object.hasOwn. */\nexport const c = 1;')).not.toContain(
      'Object.hasOwn',
    );
    expect(stripComments('// Object.hasOwn is banned.\nexport const d = 1;')).not.toContain(
      'Object.hasOwn',
    );
  });

  it('keeps the one `globalThis` in shipped source behind the polyfill both TVs prepend', () => {
    const users = files.filter((path) => /\bglobalThis\b/.test(stripComments(read(path))));
    // Only `audio-web/tracker` reads it (`detectAudioCapabilities`'s default scope). Chrome 71
    // added `globalThis`, so on both TVs it exists only because the banner defines it.
    expect(users).toEqual(['packages/audio-web/src/tracker/index.ts']);
    expect(read('apps/tizen/polyfills/global-this.js')).toMatch(/^\/\* Shmup Cup — globalThis/);
    expect(POLYFILL_BANNER).toBe('/* Shmup Cup — globalThis polyfill');
    expect(read('apps/tizen/polyfills/global-this.js').startsWith(POLYFILL_BANNER)).toBe(true);
  });
});

describe('integration: the two TV builds cannot drift apart (M3-03)', () => {
  it('emit the same target and prepend the same polyfill file', () => {
    const tizen = read('apps/tizen/vite.config.ts');
    const webos = read('apps/webos/vite.config.ts');
    for (const [path, source] of [
      ['apps/tizen/vite.config.ts', tizen],
      ['apps/webos/vite.config.ts', webos],
    ] as const) {
      expect(source, path).toContain("target: ['chrome69', 'es2018']");
      expect(source, path).toContain('postBanner: globalThisPolyfill');
    }
    // webOS reads the Tizen app's file rather than keeping a copy: one polyfill, two hosts.
    expect(webos).toContain("'../tizen/polyfills/global-this.js'");
    expect(tizen).toContain("'./polyfills/global-this.js'");
  });

  it('share one set of bundle budgets, imported rather than repeated', () => {
    const check = read('apps/webos/scripts/check-bundle.mjs');
    expect(check).toContain("from '../../tizen/scripts/check-bundle.mjs'");
    for (const name of [
      'APP_JS_GZIP_BUDGET',
      'ATLAS_PAGE_MAX_SIZE',
      'DIST_BUDGET',
      'POLYFILL_BANNER',
    ]) {
      expect(check, name).toContain(name);
      // …and webOS does not define its own.
      expect(new RegExp(`export const ${name}\\s*=`).test(check), name).toBe(false);
    }
    expect([APP_JS_GZIP_BUDGET, ATLAS_PAGE_MAX_SIZE, DIST_BUDGET]).toEqual([
      512 * 1024,
      2048,
      8 * 1024 * 1024,
    ]);
  });

  it('asks for the polyfill banner and an ES2018 classic script on both TVs', () => {
    // Drive the webOS check against an empty folder: it is the missing-app-files path, and it
    // proves the check really is wired to the shared constants above (no build needed).
    const report = checkWebosBundle(join(repo, 'apps/webos/__no_such_dist__'));
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toContain('does not exist');
    expect(WEBOS_APP_FILES).toEqual([
      'app.js',
      'appinfo.json',
      'icon.png',
      'index.html',
      'largeIcon.png',
    ]);
    // Both checks name the same banner rule in the same words.
    for (const path of [
      'apps/tizen/scripts/check-bundle.mjs',
      'apps/webos/scripts/check-bundle.mjs',
    ]) {
      expect(read(path), path).toContain(
        "problems.push('app.js does not start with the globalThis polyfill banner')",
      );
    }
  });
});
