/**
 * The DEP-GREP law, machine-checked (tizen_optimize.md §9 item 8 — plan v20x P1-7/P1-8).
 *
 * The standing rule after the Pixi 8.22 incident (2026-10-20 dependency bump, `matchAll` —
 * Chrome 73 — on neither TV): *re-grep the built bundle for post-68 APIs after every dependency
 * bump*. The build is what the rule speaks about, and `pnpm test` must not build — so this scan
 * does what `tv-engine-floor.test.ts` does for first-party sources, for the third-party side,
 * from committed state and the installed graph only:
 *
 * 1. the floor family itself cannot be quietly weakened — the shared needle list covers the
 *    canonical DEP-GREP set, the family scans with that list rather than a private one, both TV
 *    bundle checks run the same shared rule over it, and the walk still covers every
 *    browser-shipped tree on disk;
 * 2. the shipped third-party runtime set stays exactly the pinned graph (today: `pixi.js` and
 *    the packages it pulls in — §8.5's "all ten manifests scanned");
 * 3. no dependency's resolved sources reach for a post-68 API outside the pins below — a bump
 *    that adds such a use turns this red and forces the built-bundle re-grep the rule demands;
 * 4. the two APIs the dependencies *do* use on the TV path (`globalThis`, `matchAll`) stay
 *    polyfilled in both TV builds and both bench builds — the pairing this scan's allowance
 *    leans on. Break the pairing and the allowance goes red with it.
 *
 * The needle list itself moved with v20x P1-8c: `scripts/too-new-apis.mjs` now carries it, read
 * by the source scan *and* by rule 13 of both bundle checks, so law 1 proves the shared module
 * covers the canonical set below, that the family imports and scans with that module (and cannot
 * fall back to a private list), and that both TV bundle checks consume the same rule. The
 * canonical set stays anchored in this file — the guard names it, it is never inherited.
 *
 * Radius: Vite resolves `pixi.js` through its `module`/`exports` import condition into its
 * `lib/` ESM tree (the `.mjs` files; the `.js` CJS mirrors and the `dist/` prebuilt bundles are
 * never loaded by the TV builds), so only those files are scanned there; for the small
 * transitive packages every shipped `.js`/`.cjs`/`.mjs` is scanned except the `*.min.*`
 * duplicates. Like the
 * family it is a string search with comments stripped, not semantic analysis: a name hidden in
 * an indirect call or a computed property passes, and the ESLint compat floor over first-party
 * code stays the primary brace.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MATCH_ALL_BANNER, POLYFILL_BANNER } from '../../apps/tizen/scripts/check-bundle.mjs';
import { TOO_NEW_APIS } from '../../scripts/too-new-apis.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The pnpm virtual store every installed package is resolved from. */
const PNPM_STORE = join(repo, 'node_modules', '.pnpm');

/**
 * The needles whose Chrome ≥ 69 use is covered by a prepended polyfill — allowed anywhere in
 * the dependency graph *while* the pairing test finds both polyfills intact.
 */
const POLYFILLED = ['.matchAll(', 'globalThis'];

/**
 * The canonical floor set — the brief's post-68 list (flat/flatMap/matchAll/replaceAll/at/
 * fromEntries/structuredClone/queueMicrotask/allSettled) plus the rest of the family and the
 * incident's discoveries. This file is its anchor: the shared module the guards read must cover
 * it (the first test below), never the other way round — a moved list stays checkable by name.
 */
const FLOOR_NEEDLES = [
  '.flat(',
  '.flatMap(',
  'Object.fromEntries',
  'Object.hasOwn',
  'Promise.allSettled',
  'Promise.any',
  '.replaceAll(',
  '.matchAll(',
  'structuredClone',
  'queueMicrotask',
  'WeakRef',
  'FinalizationRegistry',
  '.at(',
];

/**
 * Names Chrome added after 68 that nothing in today's graph calls — pinned up front so the
 * next dependency bump trips this scan by name instead of by a human remembering to re-grep.
 */
const NEWER_NEEDLES = [
  'Object.groupBy',
  '.toSorted(',
  '.toReversed(',
  '.toSpliced(',
  'Array.fromAsync',
  'Promise.withResolvers',
  '.findLast(',
  '.findLastIndex(',
  '.isWellFormed(',
  '.toWellFormed(',
  'Atomics.waitAsync',
];

/** Every API name this scan greps the dependency graph for. */
const DEP_NEEDLES = [...FLOOR_NEEDLES, ...NEWER_NEEDLES, ...POLYFILLED];

/**
 * The shipped source trees `tv-engine-floor.test.ts` must keep walking. Derived from disk:
 * every workspace package and app with a `src/`, except the ones named below — a new browser-
 * or TV-shipped tree that is not added to the family's list turns the comparison red.
 */
const NOT_BROWSER_SHIPPED = ['apps/electron'];

/**
 * The third-party runtime graph as it stands at plan v20x: `pixi.js` and everything its
 * dependency tree reaches (§8.5's "all ten manifests scanned" — the walk here sees one more,
 * the transitive parser behind `gifuct-js`). A bump that adds a package to the graph must be
 * reviewed here: it enters the TV bundles un-grepped otherwise.
 */
const EXPECTED_GRAPH = [
  '@pixi/colord',
  '@types/earcut',
  '@webgpu/types',
  '@xmldom/xmldom',
  'earcut',
  'eventemitter3',
  'gifuct-js',
  'ismobilejs',
  'js-binary-schema-parser',
  'parse-svg-path',
  'pixi.js',
  'tiny-lru',
];

/** One post-68 API use in a dependency that the built-bundle audit accounted for. */
interface DependencyPin {
  /** The package, by name. */
  readonly pkg: string;
  /** The file inside it, package-relative. */
  readonly file: string;
  /** The needle it uses. */
  readonly needle: string;
  /** How many call sites the file holds. */
  readonly count: number;
  /** Why this use never reaches the TV bundles (or is polyfilled where it does). */
  readonly reason: string;
}

/**
 * The dependency-side findings as of the 2026-10-23 built-bundle audit recorded in
 * `docs/dev/conventions.md` §Two TVs ("the fresh build finds only Pixi's two `matchAll` call
 * sites, and every other name absent"): the uses below live in modules the shipped import graph
 * never reaches, so they are not in either `app.js` — each one is a re-audit trigger, not an
 * exemption. `matchAll`/`globalThis` uses need no rows: the polyfill pairing covers them.
 */
const DEPENDENCY_PINS: readonly DependencyPin[] = [
  {
    pkg: 'pixi.js',
    file: 'lib/assets/Assets.mjs',
    needle: '.flat(',
    count: 1,
    reason:
      "Pixi's asset loader — the shell fetches the atlas manifest itself (R1-05) and no " +
      'first-party file imports Assets; absent from the built app.js at the 2026-10-23 audit.',
  },
  {
    pkg: 'pixi.js',
    file: 'lib/rendering/renderers/gl/shader/migrateFragmentFromV7toV8.mjs',
    needle: '.replaceAll(',
    count: 3,
    reason:
      'v7-shader migration — the game ships v8-native programs only (render-pixi effects/); ' +
      'absent from the built app.js at the 2026-10-23 audit.',
  },
  {
    pkg: 'pixi.js',
    file: 'lib/scene/text/TextStyle.mjs',
    needle: 'Object.hasOwn',
    count: 2,
    reason:
      'the DOM-text style path — the game draws bitmap fonts through core DrawLists, never ' +
      'Text/HTMLText; absent from the built app.js at the 2026-10-23 audit.',
  },
  {
    pkg: '@xmldom/xmldom',
    file: 'lib/sax.js',
    needle: 'Object.hasOwn',
    count: 1,
    reason:
      "Pixi's SVG-texture parser dependency — no shipped content uses SVG sources; absent " +
      'from the built app.js at the 2026-10-23 audit.',
  },
];

/**
 * Strips block and line comments so a dependency's docblock that *names* an API is not a call
 * (the family's own helper, kept as a copy so the two guards cannot both be edited blind).
 *
 * @param source - JavaScript source.
 * @returns The code with its comments blanked out.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
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

/**
 * The single-quoted strings inside one array literal of `tv-engine-floor.test.ts`.
 *
 * @param source - The family's source text.
 * @param exportName - `RUNTIME_ROOTS` — the needle list left this file for
 * `scripts/too-new-apis.mjs` with v20x P1-8c, so it is checked on the live import now.
 * @returns The first-position strings: the roots.
 * @throws Error when the family restructured its lists — the pins must be rewritten by hand.
 */
function familyList(source: string, exportName: string): string[] {
  const block = new RegExp(`const ${exportName} = \\[([\\s\\S]*?)\\n\\]`).exec(source);
  if (block === null) {
    throw new Error(`tv-engine-floor.test.ts no longer holds a \`${exportName}\` block — `);
  }
  const pairs = block[1].match(/'([^']+)'/g);
  if (pairs === null || pairs.length === 0) {
    throw new Error(`tv-engine-floor.test.ts: empty \`${exportName}\` block`);
  }
  return pairs.map((s) => s.slice(1, -1));
}

/**
 * Every workspace package or app with a `src/` tree (repo-relative roots).
 *
 * @returns The on-disk shipped trees, sorted.
 */
function diskRuntimeRoots(): string[] {
  const out: string[] = [];
  for (const group of ['packages', 'apps']) {
    for (const entry of readdirSync(join(repo, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const src = `${group}/${entry.name}/src`;
      if (existsSync(join(repo, src))) out.push(src);
    }
  }
  return out.sort();
}

/**
 * Resolves one package name to its single instance in the pnpm virtual store.
 *
 * @param name - The package name (may be scoped).
 * @returns The store directory holding `node_modules/<name>`.
 * @throws Error when zero or several instances exist — both change what the bundle can contain.
 */
function pnpmInstance(name: string): string {
  const encoded = name.replace(/\//g, '+');
  const dirs = readdirSync(PNPM_STORE).filter(
    (entry) => entry.startsWith(`${encoded}@`) && /\d/.test(entry[encoded.length + 1] ?? ''),
  );
  if (dirs.length !== 1) {
    throw new Error(
      `${name}: ${dirs.length} instances in node_modules/.pnpm (${dirs.join(', ')}) — ` +
        'the TV bundle graph must hold one; re-audit the bump',
    );
  }
  return join(PNPM_STORE, dirs[0], 'node_modules', name);
}

/**
 * The transitive third-party runtime graph from the shipped packages' and browser apps'
 * `dependencies` (workspace `@shmup/*` members skipped — their sources are scanned by the
 * family itself).
 *
 * @returns Package name → store directory, of everything the build may inline.
 */
function shippedGraph(): Map<string, string> {
  const roots = [
    'packages/core',
    'packages/audio-web',
    'packages/input-web',
    'packages/render-pixi',
    'packages/shell',
    'apps/web',
    'apps/tizen',
    'apps/webos',
  ];
  const queue: string[] = [];
  for (const root of roots) {
    const manifest = JSON.parse(read(`${root}/package.json`)) as {
      dependencies?: Record<string, string>;
    };
    queue.push(...Object.keys(manifest.dependencies ?? {}));
  }
  const graph = new Map<string, string>();
  while (queue.length > 0) {
    const name = queue.pop() as string;
    if (name.startsWith('@shmup/') || graph.has(name)) continue;
    const dir = pnpmInstance(name);
    graph.set(name, dir);
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    queue.push(...Object.keys(manifest.dependencies ?? {}));
  }
  return graph;
}

/**
 * The files one dependency package actually ships that the TV builds could resolve — for
 * `pixi.js` only its `lib/` ESM tree (the `module`/`exports` import target; the `lib/*.js`
 * CJS mirrors and the `dist/` prebuilt bundles are never loaded by a Vite build), for the
 * small transitive packages every shipped script except the `*.min.*` duplicates.
 *
 * @param name - The package name.
 * @param dir - Its store directory.
 * @returns Package-relative file paths, sorted.
 */
function scannedFiles(name: string, dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
        continue;
      }
      if (!/\.(c?js|mjs)$/.test(entry.name) || /\.min\.[cm]?js$/.test(entry.name)) continue;
      const relative = path.slice(dir.length + 1);
      if (name === 'pixi.js' && !(relative.startsWith(`lib${sep}`) && relative.endsWith('.mjs'))) {
        continue;
      }
      out.push(relative);
    }
  }
  return out.sort();
}

/**
 * Post-68 API uses in one text: every needle with its occurrence count.
 *
 * @param code - Comment-stripped source.
 * @returns `needle ×count` entries for the needles present.
 */
function needleCounts(code: string): [string, number][] {
  const found: [string, number][] = [];
  for (const needle of DEP_NEEDLES) {
    let count = 0;
    let at = code.indexOf(needle);
    while (at !== -1) {
      count += 1;
      at = code.indexOf(needle, at + 1);
    }
    if (count > 0) found.push([needle, count]);
  }
  return found;
}

/** The dependency scan's rows: `pkg file :: needle ×count` for every un-polyfilled hit. */
function dependencySurface(): string[] {
  if (!existsSync(PNPM_STORE)) {
    throw new Error('node_modules/.pnpm is missing — run pnpm install before pnpm test');
  }
  const rows: string[] = [];
  for (const [name, dir] of shippedGraph()) {
    for (const file of scannedFiles(name, dir)) {
      const code = stripComments(readFileSync(join(dir, file), 'utf8'));
      for (const [needle, count] of needleCounts(code)) {
        if (POLYFILLED.includes(needle)) continue;
        rows.push(`${name} ${file} :: ${needle} ×${count}`);
      }
    }
  }
  return rows.sort();
}

/** The pins in the scan's row shape. */
const PINNED = DEPENDENCY_PINS.map(
  (pin) => `${pin.pkg} ${pin.file} :: ${pin.needle} ×${pin.count}`,
).sort();

describe('integration: the DEP-GREP law stays machine-checked (v20x P1-7/P1-8c)', () => {
  const family = read('test/integration/tv-engine-floor.test.ts');

  it('the shared needle module covers the whole canonical DEP-GREP set', () => {
    // (a) The list moved to `scripts/too-new-apis.mjs` with v20x P1-8c; the canonical set above
    // stays the anchor, read here live — the module may grow, but no name may leave it, and no
    // name may stand twice (the bundle rule counts occurrences per entry).
    const needles = TOO_NEW_APIS.map((entry) => entry.needle);
    const missing = FLOOR_NEEDLES.filter((needle) => !needles.includes(needle));
    expect(missing, 'needles dropped from scripts/too-new-apis.mjs TOO_NEW_APIS').toEqual([]);
    expect(needles.length, 'a duplicated needle in TOO_NEW_APIS').toBe(new Set(needles).size);
  });

  it('the floor family scans with the shared list — it cannot fall back to a private one', () => {
    // (b) A source-level proof beside the live one: the family imports the module, binds its
    // scan list to the imported name, and iterates that binding — the pre-move shape, a
    // `const TOO_NEW = [...]` literal, is the silent drift this forbids.
    expect(
      /import\s*\{[^}]*\bTOO_NEW_APIS\b[^}]*\}\s*from\s*'[^']*scripts\/too-new-apis\.mjs'/.test(
        family,
      ),
      'tv-engine-floor.test.ts no longer imports TOO_NEW_APIS from scripts/too-new-apis.mjs',
    ).toBe(true);
    expect(family, 'the scan list must be the shared module').toContain(
      'const TOO_NEW = TOO_NEW_APIS;',
    );
    expect(family, 'the offender loop must read the bound list').toContain(
      'for (const { needle, what } of TOO_NEW) {',
    );
    expect(/const TOO_NEW = \[/.test(family), 'the family grew a private TOO_NEW list').toBe(false);
  });

  it('both TV bundle checks consume the shared module — rule 13 stays one rule', () => {
    // (c) The family proof spans the built-bundle side too: the Tizen check reads the shared
    // names and exports the one engine-floor rule, and the webOS check calls that rule — never a
    // copy of its own (the budgets' shape of sharing, the lesson of the 8.22 boot break).
    const tizen = read('apps/tizen/scripts/check-bundle.mjs');
    const webos = read('apps/webos/scripts/check-bundle.mjs');
    expect(tizen).toMatch(
      /import\s*\{[^}]*\btooNewApiHits\b[^}]*\}\s*from\s*'[^']*scripts\/too-new-apis\.mjs'/,
    );
    expect(tizen, 'the exempt regions read the shared polyfill table').toContain(
      'TOO_NEW_POLYFILLS.map(',
    );
    expect(tizen).toContain('export function checkBundleEngineFloor(');
    expect(webos, 'webOS imports the shared rule').toContain('checkBundleEngineFloor,');
    expect(webos, 'webOS runs it as rule 13').toContain(
      'problems.push(...checkBundleEngineFloor(code));',
    );
    // …and webOS holds no second implementation, nor a private line to the list.
    expect(webos, 'webOS re-implements the engine floor').not.toMatch(
      /function checkBundleEngineFloor|tooNewApiHits/,
    );
    expect(webos, 'webOS greps a needle list of its own').not.toContain('too-new-apis');
  });

  it('the floor family still walks every browser-shipped tree on disk', () => {
    const roots = familyList(family, 'RUNTIME_ROOTS');
    const onDisk = diskRuntimeRoots().filter(
      (root) => !NOT_BROWSER_SHIPPED.includes(root.replace(/\/src$/, '')),
    );
    const missed = onDisk.filter((root) => !roots.includes(root));
    expect(
      missed,
      'shipped trees tv-engine-floor.test.ts no longer walks (a new app? add it to the family, ' +
        'or here with a reason if it never reaches a Chromium 68/69)',
    ).toEqual([]);
  });

  it('the third-party runtime graph is exactly the audited set', () => {
    expect([...shippedGraph().keys()].sort()).toEqual(EXPECTED_GRAPH);
  });

  it('no dependency reaches for a post-68 API the bundle audit did not account for', () => {
    const surface = dependencySurface();
    // Fail loud in three shapes: an un-pinned use (the bump added one — re-grep the built
    // bundle), a dead pin (the bump removed it — drop the row), a drift in count (it grew).
    const unpinned = surface.filter((row) => !PINNED.includes(row));
    const stale = PINNED.filter((row) => !surface.includes(row));
    expect({ unpinned, stale }).toEqual({ unpinned: [], stale: [] });
    // The scan is over the real graph, not nothing: pixi's lib alone is hundreds of files.
    expect(scannedFiles('pixi.js', pnpmInstance('pixi.js')).length).toBeGreaterThan(500);
  });

  it('the two APIs the allowance covers stay polyfilled on both TVs and both bench builds', () => {
    // globalThis (Chrome 71) and matchAll (Chrome 73) — on neither TV; the scan only allows
    // them in dependencies because every bundle prepends their ES5 polyfills. If the pairing
    // breaks, an allowance that reads as green today would boot black on the M7.
    const globalThisFile = read('apps/tizen/polyfills/global-this.js');
    const matchAllFile = read('apps/tizen/polyfills/string-match-all.js');
    expect(globalThisFile.startsWith(POLYFILL_BANNER)).toBe(true);
    expect(globalThisFile).toContain('globalThis');
    expect(matchAllFile.startsWith(MATCH_ALL_BANNER)).toBe(true);
    expect(matchAllFile).toContain('matchAll');
    for (const config of [
      'apps/tizen/vite.config.ts',
      'apps/webos/vite.config.ts',
      'apps/tizen/vite.bench.config.ts',
      'apps/webos/vite.bench.config.ts',
    ]) {
      const source = read(config);
      expect(source, config).toContain('postBanner: globalThisPolyfill + matchAllPolyfill');
      expect(source, config).toContain('polyfills/global-this.js');
      expect(source, config).toContain('polyfills/string-match-all.js');
    }
  });

  it('would catch a new post-68 API in a dependency — the scan is not vacuous', () => {
    const sample = stripComments(
      'export const f = arr.findLast((x) => x > 0);\n' +
        '// Object.hasOwn in a comment is not an offence\n' +
        'export const g = Object.hasOwn(o, k);\n',
    );
    const counts = needleCounts(sample);
    expect(counts.map(([needle]) => needle)).toEqual(['Object.hasOwn', '.findLast(']);
    // …and the polyfilled pair is the only name the allowance swallows.
    expect(POLYFILLED.filter((needle) => !DEP_NEEDLES.includes(needle))).toEqual([]);
  });
});
