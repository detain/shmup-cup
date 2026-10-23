/**
 * The engine floor the two TV builds share (plan M3-03).
 *
 * Tizen 5.5 is Chromium **69**; webOS 5 is Chromium **68**, one release older. Both builds are
 * emitted with the same `chrome69` + `es2018` target and the same two prepended ES5 polyfills
 * (`globalThis`, and `String.prototype.matchAll` since w14), which is
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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  APP_JS_GZIP_BUDGET,
  ATLAS_PAGE_MAX_SIZE,
  DIST_BUDGET,
  MATCH_ALL_BANNER,
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

/** A task entry of `turbo.json`, as far as these checks read it. */
interface TurboTask {
  /** Tasks that run first. */
  readonly dependsOn?: readonly string[];
  /** Environment variables in the cache key. */
  readonly env?: readonly string[];
  /** Files in the cache key; absent = the package's own files (`$TURBO_DEFAULT$`). */
  readonly inputs?: readonly string[];
  /** Files the cache restores. */
  readonly outputs?: readonly string[];
}

/** The parts of `turbo.json` these checks read. */
interface TurboConfig {
  /** Repo files in every task's cache key. */
  readonly globalDependencies: readonly string[];
  /** Task entries by name (`build:bench`, `@shmup/webos#build:bench`, …). */
  readonly tasks: Readonly<Record<string, TurboTask>>;
}

/**
 * How a script names another repo file: static, side-effect and dynamic imports at the start of a
 * line (so a docblock that quotes one is not a reference) and `new URL('…', import.meta.url)`.
 */
const SCRIPT_REFERENCES = [
  /^\s*(?:import|export)\b[^;]*?\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/gm,
  /^\s*import\s+['"](\.{1,2}\/[^'"]+)['"]/gm,
  /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
  /\bnew URL\(\s*['"](\.{1,2}\/?[^'"]*)['"]\s*,\s*import\.meta\.url\s*\)/g,
] as const;

/** How an HTML page (a Vite root's `index.html`) names a repo file: its scripts. */
const PAGE_REFERENCES = [/<script\b[^>]*\bsrc=["'](\.{1,2}\/[^"']+)["']/g] as const;

/**
 * Every repo file and folder a build reaches from its entry files, following relative references
 * only — workspace packages come in through turbo's `^build` dependencies, not through files.
 *
 * @param entries - Repo-relative entry files (a Vite config, a bundle check).
 * @returns Repo-relative paths, sorted; a folder (a Vite root, a content directory) ends in `/`.
 * @throws Error when a reference resolves to nothing or leaves the repo.
 *
 * @remarks
 * A `.js` specifier that does not exist resolves to its `.ts` source (NodeNext imports), and a
 * folder with an `index.html` (a Vite root) is followed into that page.
 */
function reachedFiles(entries: readonly string[]): string[] {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(m?[jt]s|html)$/.test(file)) continue;
    const source = read(file);
    for (const pattern of file.endsWith('.html') ? PAGE_REFERENCES : SCRIPT_REFERENCES) {
      for (const match of source.matchAll(pattern)) {
        let target = posix.normalize(posix.join(posix.dirname(file), match[1]));
        if (target.startsWith('..')) throw new Error(`${file}: ${match[1]} leaves the repo`);
        if (!existsSync(join(repo, target)) && target.endsWith('.js')) {
          target = `${target.slice(0, -3)}.ts`;
        }
        if (!existsSync(join(repo, target))) throw new Error(`${file}: ${match[1]} not found`);
        if (statSync(join(repo, target)).isDirectory()) {
          const folder = `${target.replace(/\/$/, '')}/`;
          seen.add(folder);
          if (existsSync(join(repo, folder, 'index.html'))) queue.push(`${folder}index.html`);
        } else {
          queue.push(target);
        }
      }
    }
  }
  return [...seen].sort();
}

/**
 * Whether a `turbo.json` glob matches a repo path. Only the two forms the config uses are
 * understood — `dir/**` and an exact file — so a new form fails the test instead of passing it.
 *
 * @param glob - Repo-relative glob.
 * @param path - Repo-relative path (a folder ends in `/`).
 * @returns Whether the glob covers the path.
 * @throws Error for any other glob syntax.
 */
function globCovers(glob: string, path: string): boolean {
  if (glob.endsWith('/**')) return path.startsWith(glob.slice(0, -2));
  if (/[*?[\]{}!]/.test(glob)) throw new Error(`unsupported glob in turbo.json: ${glob}`);
  return path === glob;
}

/**
 * Whether a change to a repo path changes a package task's cache key.
 *
 * @param turbo - The parsed `turbo.json`.
 * @param task - The task entry that applies to the package.
 * @param appDir - The package's folder, repo-relative (`apps/webos`).
 * @param path - Repo-relative path.
 * @returns Whether the global dependencies or the task's inputs cover the path.
 */
function inCacheKey(turbo: TurboConfig, task: TurboTask, appDir: string, path: string): boolean {
  if (turbo.globalDependencies.some((glob) => globCovers(glob, path))) return true;
  const inputs = task.inputs ?? ['$TURBO_DEFAULT$'];
  return inputs.some((input) => {
    if (input === '$TURBO_DEFAULT$') return path.startsWith(`${appDir}/`);
    const glob = input.startsWith('$TURBO_ROOT$/')
      ? input.slice('$TURBO_ROOT$/'.length)
      : posix.join(appDir, input);
    return globCovers(glob, path);
  });
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

  it('polyfills the one Chrome 73 method PixiJS calls — one file, grep-clean', () => {
    // PixiJS 8.22's sampler-precision parse calls String.prototype.matchAll (Chrome 73) on both
    // TVs (w14). The fix is the second prepended file, and the built-bundle floor audit is a
    // plain name grep, so the polyfill may define the method only through defineProperty: its
    // text — comments and strings included, it is prepended verbatim — spells none of the shapes.
    const file = read('apps/tizen/polyfills/string-match-all.js');
    expect(MATCH_ALL_BANNER).toBe('/* Shmup Cup — matchAll polyfill');
    expect(file.startsWith(MATCH_ALL_BANNER)).toBe(true);
    // The ES5-only requirement is enforced (with an acorn parse) in
    // apps/tizen/test/build/match-all-polyfill.test.ts; here the grep shape is what matters.
    for (const [needle, what] of TOO_NEW) {
      expect(file, `the polyfill ${what}`).not.toContain(needle);
    }
  });
});

describe('integration: the two TV builds cannot drift apart (M3-03)', () => {
  it('emit the same target and prepend the same polyfill files', () => {
    const tizen = read('apps/tizen/vite.config.ts');
    const webos = read('apps/webos/vite.config.ts');
    for (const [path, source] of [
      ['apps/tizen/vite.config.ts', tizen],
      ['apps/webos/vite.config.ts', webos],
    ] as const) {
      expect(source, path).toContain("target: ['chrome69', 'es2018']");
      expect(source, path).toContain('postBanner: globalThisPolyfill + matchAllPolyfill');
    }
    // webOS reads the Tizen app's files rather than keeping copies: one pair of polyfills,
    // two hosts.
    expect(webos).toContain("'../tizen/polyfills/global-this.js'");
    expect(tizen).toContain("'./polyfills/global-this.js'");
    expect(webos).toContain("'../tizen/polyfills/string-match-all.js'");
    expect(tizen).toContain("'./polyfills/string-match-all.js'");
  });

  it('build the TV render bench under the same contract (plan R0-02)', () => {
    // The bench widgets ship to the same two engines, so they keep the game's target, banner and
    // classic script tag — and their code lives in `apps/tizen/src/bench`, inside the scan above.
    const benches = [
      [
        'apps/tizen/vite.bench.config.ts',
        "'./polyfills/global-this.js'",
        "'./polyfills/string-match-all.js'",
      ],
      [
        'apps/webos/vite.bench.config.ts',
        "'../tizen/polyfills/global-this.js'",
        "'../tizen/polyfills/string-match-all.js'",
      ],
    ] as const;
    for (const [path, ...polyfills] of benches) {
      const source = read(path);
      expect(source, path).toContain("target: ['chrome69', 'es2018']");
      expect(source, path).toContain('postBanner: globalThisPolyfill + matchAllPolyfill');
      for (const polyfill of polyfills) expect(source, path).toContain(polyfill);
      expect(source, path).toContain('classicScriptTag()');
      expect(source, path).toContain("format: 'iife'");
      expect(source, path).toContain('codeSplitting: false');
    }
    expect(sourcesOf('apps/tizen/src/bench').length).toBeGreaterThan(5);
    // Both bench widgets are checked by the game's own bundle checks.
    for (const app of ['tizen', 'webos']) {
      const scripts = (
        JSON.parse(read(`apps/${app}/package.json`)) as {
          scripts: Record<string, string>;
        }
      ).scripts;
      expect(scripts['build:bench'], app).toContain('node scripts/check-bundle.mjs dist-bench');
    }
  });

  it('key each bench build’s turbo cache on every file it reads, in its own app or not (R0-02)', () => {
    // The webOS stub bundles the Tizen app's bench page, sources, atlas script and Vite helpers,
    // and turbo hashes only a package's own files plus `globalDependencies` — so without its own
    // inputs `pnpm bench:tv` rebuilt the Tizen bench after an edit and restored a stale webOS one.
    const turbo = JSON.parse(read('turbo.json')) as TurboConfig;
    const generic = turbo.tasks['build:bench'];
    const webos = turbo.tasks['@shmup/webos#build:bench'];
    expect(webos, '@shmup/webos#build:bench').toBeDefined();
    // A root `<package>#<task>` entry replaces the generic task rather than extending it, so the
    // webOS one repeats everything but its inputs, and keeps the package's own files in the key.
    expect({ ...webos, inputs: undefined }).toEqual({ ...generic, inputs: undefined });
    expect(webos?.inputs).toContain('$TURBO_DEFAULT$');
    // The tasks' own inputs, not `globalDependencies`: an edit to the bench re-keys the two bench
    // builds only, never every task in the repo.
    expect(turbo.globalDependencies.filter((glob) => glob.includes('bench'))).toEqual([]);
    // `$TURBO_ROOT$` needs turbo 2.5 or newer.
    const [major = 0, minor = 0] = (
      JSON.parse(read('node_modules/turbo/package.json')) as { version: string }
    ).version
      .split('.')
      .map(Number);
    expect(major > 2 || (major === 2 && minor >= 5), 'turbo >= 2.5').toBe(true);

    let webosReached: string[] = [];
    for (const app of ['tizen', 'webos']) {
      const task = turbo.tasks[`@shmup/${app}#build:bench`] ?? generic;
      // What `build:bench` runs: the bench's Vite config, then the app's bundle check.
      const reached = reachedFiles([
        `apps/${app}/vite.bench.config.ts`,
        `apps/${app}/scripts/check-bundle.mjs`,
      ]);
      expect(
        reached.filter((path) => !inCacheKey(turbo, task, `apps/${app}`, path)),
        `files the ${app} bench build reads but turbo does not hash`,
      ).toEqual([]);
      if (app === 'webos') webosReached = reached;
    }
    // Not vacuous: the webOS walk really leaves its app, and the generic task alone would miss it.
    const fromTizen = [
      'apps/tizen/bench/',
      'apps/tizen/bench/index.html',
      'apps/tizen/bench/entry.js',
      'apps/tizen/src/bench/main.ts',
      'apps/tizen/src/platform/index.ts',
      'apps/tizen/scripts/bench-atlas.mjs',
      'apps/tizen/scripts/config-xml.mjs',
      'apps/tizen/scripts/tizen-env.mjs',
      'apps/tizen/vite.config.ts',
    ];
    expect(webosReached).toEqual(expect.arrayContaining(fromTizen));
    for (const path of fromTizen) {
      expect(inCacheKey(turbo, generic, 'apps/webos', path), path).toBe(false);
    }
  });

  it('share one set of bundle budgets, imported rather than repeated', () => {
    const check = read('apps/webos/scripts/check-bundle.mjs');
    expect(check).toContain("from '../../tizen/scripts/check-bundle.mjs'");
    for (const name of [
      'APP_JS_GZIP_BUDGET',
      'ATLAS_PAGE_MAX_SIZE',
      'DIST_BUDGET',
      'MATCH_ALL_BANNER',
      'POLYFILL_BANNER',
    ]) {
      expect(check, name).toContain(name);
      // …and webOS does not define its own.
      expect(new RegExp(`export const ${name}\\s*=`).test(check), name).toBe(false);
    }
    expect([APP_JS_GZIP_BUDGET, ATLAS_PAGE_MAX_SIZE, DIST_BUDGET]).toEqual([
      512 * 1024,
      2048,
      16 * 1024 * 1024,
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
    // Both checks name the same banner rules in the same words.
    for (const path of [
      'apps/tizen/scripts/check-bundle.mjs',
      'apps/webos/scripts/check-bundle.mjs',
    ]) {
      expect(read(path), path).toContain(
        "problems.push('app.js does not start with the globalThis polyfill banner')",
      );
      expect(read(path), path).toContain(
        "problems.push('app.js does not contain the matchAll polyfill banner')",
      );
    }
  });
});
