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
 * `eslint-rules.test.ts` — a belt beside the braces, for a rule no config can express. The names
 * live in `scripts/too-new-apis.mjs`, shared with rule 13 of `apps/tizen/scripts/check-bundle.mjs`
 * — the built-bundle audit (the v20x P1-8c codification of the standing re-grep after the Pixi
 * 8.22 `matchAll` boot break), so one list guards the sources here and the dependency-carrying
 * `app.js` there.
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
import { BUNDLE_POLYFILLED, TOO_NEW_APIS } from '../../scripts/too-new-apis.mjs';

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
 * APIs Chrome 68 does not have — the shared list of `scripts/too-new-apis.mjs` (its docblock
 * carries the story; the source scan and the built-bundle rule 13 read the same needles).
 */
const TOO_NEW = TOO_NEW_APIS;

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
 * @throws Error when a reference resolves to nothing outside the generated trees, or leaves
 * the repo.
 *
 * @remarks
 * A `.js` specifier that does not exist resolves to its `.ts` source (NodeNext imports), and a
 * folder with an `index.html` (a Vite root) is followed into that page. A path under
 * `assets/generated/` that does not (yet) exist is build output — the pipeline and the encode
 * kits create those trees from committed sources during a build, and a clean checkout (CI has
 * no ffmpeg) has none of them before the first producer runs. The walk records such a folder and
 * stops instead of throwing: the cache-key assertion that uses this list still demands the build
 * hash it, which is the point of the reference naming it at all (v20x-FIX-VIDEO).
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
        if (!existsSync(join(repo, target))) {
          if (target.startsWith('assets/generated/')) {
            seen.add(`${target.replace(/\/$/, '')}/`);
            continue;
          }
          throw new Error(`${file}: ${match[1]} not found`);
        }
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
      for (const { needle, what } of TOO_NEW) {
        if (code.includes(needle)) offenders.push(`${path}: ${what}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('would catch one if it appeared — the scan is not vacuous', () => {
    const sample = 'export const a = [1, [2]].flat();\nexport const b = Object.fromEntries([]);\n';
    const hits = TOO_NEW.filter(({ needle }) => stripComments(sample).includes(needle));
    expect(hits.map(({ what }) => what)).toEqual([
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

  it('carries the 2026-10-23 built-bundle corpus — the list the manual audit grepped', () => {
    // The precedent grep (w14, after the Pixi 8.22 boot break) is what rule 13 of
    // apps/tizen/scripts/check-bundle.mjs now runs automatically on every TV build; its nine
    // names must all stand in the shared list the rule reads.
    const corpus = [
      '.flat(',
      '.flatMap(',
      '.at(',
      'Object.fromEntries',
      '.matchAll(',
      '.replaceAll(',
      'structuredClone',
      'queueMicrotask',
      'Promise.allSettled',
    ];
    const needles = TOO_NEW.map(({ needle }) => needle);
    for (const name of corpus) expect(needles, name).toContain(name);
  });

  it('tolerates only the polyfilled matchAll name in a built bundle, at Pixi’s two sites', () => {
    // The single bundle tolerance is the name apps/tizen/polyfills/string-match-all.js exists
    // for, and its baseline is the two call sites the 2026-10-23 audit found and no more.
    expect(BUNDLE_POLYFILLED).toHaveLength(1);
    const [tolerance] = BUNDLE_POLYFILLED;
    expect(tolerance?.needle).toBe('.matchAll(');
    expect(tolerance?.banner).toBe(MATCH_ALL_BANNER);
    expect(tolerance?.maxCount).toBe(2);
    expect(tolerance?.polyfill).toBe('apps/tizen/polyfills/string-match-all.js');
    expect(typeof tolerance?.why).toBe('string');
    expect(existsSync(join(repo, 'apps/tizen/polyfills/string-match-all.js'))).toBe(true);
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
    // TVs (w14). The fix is the second prepended file. Rule 13 of the bundle check exempts this
    // file's embedded region exactly, but the ES5 file stays grep-clean on principle (comments
    // and strings included, it is prepended verbatim — it spells none of the shapes) so the
    // built bundle's `.matchAll(` count stays exactly Pixi's two sites — the baseline
    // BUNDLE_POLYFILLED pins. The ES5-only requirement is enforced (with an acorn parse) in
    // apps/tizen/test/build/match-all-polyfill.test.ts; here the grep shape is what matters.
    const file = read('apps/tizen/polyfills/string-match-all.js');
    expect(MATCH_ALL_BANNER).toBe('/* Shmup Cup — matchAll polyfill');
    expect(file.startsWith(MATCH_ALL_BANNER)).toBe(true);
    // The globalThis polyfill is exempted the same way and must likewise speak no needle.
    const globalThisFile = read('apps/tizen/polyfills/global-this.js');
    expect(globalThisFile.startsWith(POLYFILL_BANNER)).toBe(true);
    for (const { needle, what } of TOO_NEW) {
      expect(file, `the polyfill ${what}`).not.toContain(needle);
      expect(globalThisFile, `the globalThis polyfill ${what}`).not.toContain(needle);
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
      // The generated trees the bench build emits from are named even when this checkout has
      // not produced them (v20x-FIX-VIDEO) — so the filter below genuinely demands their
      // cache-key coverage on every machine, cold or warm, with ffmpeg or without it.
      expect(reached, app).toEqual(
        expect.arrayContaining(['assets/generated/video/', 'assets/generated/stills/']),
      );
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
      'checkPolyfillPair',
    ]) {
      expect(check, name).toContain(name);
      // …and webOS does not define its own.
      expect(new RegExp(`export const ${name}\\s*=`).test(check), name).toBe(false);
    }
    expect([APP_JS_GZIP_BUDGET, ATLAS_PAGE_MAX_SIZE, DIST_BUDGET]).toEqual([
      512 * 1024,
      2048,
      24 * 1024 * 1024,
    ]);
  });

  it('asks for the polyfill pair and an ES2018 classic script on both TVs', () => {
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
    // Both checks enforce rule 4 through one positional function — the pair verbatim at the head
    // (reordered halves leave Pixi's init-time `.matchAll(` unbacked on both TVs; rule 13's
    // tolerance rides the same position). Shared wiring, no second wording to drift.
    for (const path of [
      'apps/tizen/scripts/check-bundle.mjs',
      'apps/webos/scripts/check-bundle.mjs',
    ]) {
      expect(read(path), path).toContain('checkPolyfillPair(code)');
    }
    expect(read('apps/webos/scripts/check-bundle.mjs')).toContain(
      "from '../../tizen/scripts/check-bundle.mjs'",
    );
  });

  it('audits both built bundles for the shared needle list — rule 13 (v20x P1-8c)', () => {
    // The standing prose rule became code: each app's `build` script runs its check-bundle after
    // vite, and both checks call the Tizen check's shared rule over the built app.js (the webOS
    // one imports it, like the budgets — no second implementation to forget).
    for (const path of [
      'apps/tizen/scripts/check-bundle.mjs',
      'apps/webos/scripts/check-bundle.mjs',
    ]) {
      expect(read(path), path).toContain('checkBundleEngineFloor(');
    }
    expect(read('apps/webos/scripts/check-bundle.mjs')).toContain(
      "from '../../tizen/scripts/check-bundle.mjs'",
    );
    // …and the rule is a plain name scan over the raw bundle: shared with this file's list.
    expect(read('apps/tizen/scripts/check-bundle.mjs')).toContain(
      "from '../../../scripts/too-new-apis.mjs'",
    );
  });
});
