# Code conventions

Rules every change follows. Most are enforced by TypeScript, ESLint or the integration
tests — the "Enforced by" column says where, so a red check points you here.

## Project and module layout

| Rule | Enforced by |
|---|---|
| Every workspace project (`packages/*`, `apps/*`) has `package.json`, `tsconfig.json`, `README.md`, `src/` and `test/` | `test/integration/workspace-layout.test.ts` |
| Tests live in `test/`, **never** next to sources in `src/` | same |
| Each system is a folder `src/<module>/index.ts` (Electron uses `src/main`, `src/preload`, `src/shared` files instead) | `test/integration/module-layout.test.ts` |
| A module file starts with a docblock containing `**Responsibility.**`, `**Implements.**` (spec sections) and a *Public API* paragraph; placeholders also say `**Status: placeholder.**` | same |
| Each module exports `moduleInfo = defineModule({ name: '<folder>', status, specRefs })`; `specRefs` must name existing numbered sections, e.g. `'shmup_feat.md §22'`, `'shmup_tech.md §3.2'`, or `'input_probe_spec.md'` | same |
| `test/<module>/` exists for every module and contains at least one `*.test.ts` | same |
| `tools/*` stays outside the workspace (standalone npm projects) | `workspace-layout.test.ts`, `pnpm-workspace.yaml` |

## TSDoc

- Every source file starts with a file-level docblock (`@module` for TS modules,
  `@packageDocumentation` for package entry points).
- Every exported function, class, interface, type alias, enum and constant has a
  docblock — ESLint `jsdoc/require-jsdoc` fails the lint for runtime sources
  (`packages/*/src`, `apps/web/src`, `apps/tizen/src`, `apps/electron/src`).
- Beyond the lint minimum, the project standard is: a one-line summary; `@param` for
  every parameter; `@returns` for every non-void result (including `Promise<void>`
  methods — say *when* it resolves); `@throws` for anything that can throw or reject;
  `@remarks` for non-obvious behaviour (edge cases, allocation, ordering); `@example`
  for the main entry points. Interface members, including methods of interfaces and
  union-type members, get their own docblocks.
- Non-exported helpers that are more than a couple of lines (closures inside factories
  included) get a short docblock too.
- Node scripts (`*.mjs`) use JSDoc types: `@param {string} name - …`,
  `@returns {string[]} …`.
- Keep specs cross-referenced: cite `shmup_feat.md §N` / `shmup_tech.md §N.M` where a
  rule comes from.

## TypeScript

- `strict` plus `noImplicitOverride`, `noImplicitReturns`, `noUnusedLocals`,
  `noUnusedParameters`, `verbatimModuleSyntax`, `isolatedModules`
  (`tsconfig.base.json`).
- Relative imports carry the `.js` extension (`'../loop/index.js'`) — NodeNext resolution
  for the packages.
- Type-only imports use inline `type` modifiers (`import { createGame, type Game }`) —
  `@typescript-eslint/consistent-type-imports`.
- Unused parameters/variables start with `_` (e.g. `catch (_error)`).
- `===` / `!==` only (`eqeqeq`).
- TypeScript is pinned to **6.0.x** (catalog in `pnpm-workspace.yaml`): TypeScript 7
  (native) has no JS API until 7.1 and typescript-eslint 8.x requires `typescript < 6.1`.

## `@shmup/core` purity

`packages/core/src` must run unchanged in Node, the browser and the TV:

- no DOM / WebGL / Web Audio / worker / Node globals (`window`, `document`,
  `requestAnimationFrame`, `setTimeout`, `process`, `Buffer` …) — `no-restricted-globals`,
  and `tsconfig.json` gives only the ES2018 lib with no `types`;
- no imports of `pixi.js`, `howler`, `electron`, Node built-ins, `tizen*` / `*webapis*`
  or other `@shmup/*` packages — `no-restricted-imports`;
- no `Math.random`, `Date.now`, `performance.now` (determinism) — `no-restricted-properties`;
- no engine-dependent maths: `Math.sin/cos/tan/asin/acos/atan/atan2/exp/log/pow/hypot/cbrt`
  (`no-restricted-properties`) and the `**` operator (`no-restricted-syntax`). Use the
  committed tables in `core/math` (`sinB`, `cosB`, `atan2B`, `EASINGS`) and repeated
  multiplication; `+ - * /`, `Math.sqrt`, `Math.abs/floor/round/min/max/imul` are exactly
  specified by IEEE 754 and stay allowed — see
  [engine-foundations.md](engine-foundations.md);
- no `console` — `no-console`.

`test/integration/eslint-rules.test.ts` lints fixture snippets to prove these rules stay
active.

## Chromium 69 rules

Shipped runtime code (`packages/*/src`, `apps/web/src`, `apps/tizen/src`) targets
`chrome >= 69` (`.browserslistrc`). The build lowers **syntax**, not **APIs**. Lint
errors you may meet:

| Don't use | Needs | Use instead |
|---|---|---|
| `globalThis` | Chrome 71 | Allowed — polyfilled by `apps/tizen/polyfills/global-this.js` |
| `Object.hasOwn` | Chrome 93 | `Object.prototype.hasOwnProperty.call(o, k)` |
| `Object.fromEntries` | Chrome 73 | a loop filling an object |
| `Promise.allSettled` / `Promise.any` | Chrome 76 / 85 | `Promise.all` with per-promise `.catch` |
| `String.prototype.replaceAll` | Chrome 85 | `replace(/…/g, …)` |
| `.at(i)` | Chrome 92 | `a[i]`, `a[a.length - 1]` |
| `structuredClone` | Chrome 98 | explicit copy |
| `import.meta` | ES modules only | pass values in through config (allowed only in `apps/web`, which is served as a module) |
| other newer APIs | — | `compat/compat` (eslint-plugin-compat, `lintAllEsApis`) reports them |

Also avoid on the TV: top-level `await` and dynamic `import()` (the Tizen bundle is one
classic IIFE script), WebGL2-only features (WebGL1 is the baseline), and CSS newer than
Chrome 69 in `index.html`. Hand-written files prepended to the bundle (polyfills) are
ES5 and linted with `ecmaVersion: 5`.

## Performance: zero allocation in hot paths

- Nothing allocates per tick (`Game.step`, everything it calls) or per frame
  (`renderer.render`, the frame loop): no object/array literals, closures, spread,
  `map`/`filter`, string building or `new` in those paths.
- Reuse output objects (`PlatformInput.poll()` and `Game.renderFrame()` return the same
  object every call) and document it in the TSDoc (*reused — do not keep it*).
- Preallocate: struct-of-arrays pools with fixed capacity (`createSoaPool`), pooled
  objects (`createPool`), sprite views sized to the pool, event rings of plain numbers
  (`createEventQueue`). Free SoA slots with `free()` during the tick and `flush()` once at
  the end — slot indices are only stable within a tick.
- Resolve string ids to numeric indices at load time, never per tick.

## Tests

- Vitest, Node environment, one folder per module: `test/<module>/<module>.test.ts`, plus
  `<module>-edge.test.ts` for edge cases where useful.
- Browser/TV APIs are injected (`win`, `createContext`, `getGamepads`, `tizen`) so tests
  pass fakes instead of touching globals.
- Each package has `test/tsconfig.json` (Node types, DOM lib) separate from the pure
  `src` program.
- Determinism-sensitive code gets a headless test against `createHeadlessPlatform()`.
- Generated sources that are committed (today `packages/core/src/math/trig-table.ts`) get
  a test that regenerates them and diffs the committed copy.

## Formatting

Prettier 3 (`.prettierrc.json`: 100 columns, single quotes, trailing commas): run
`pnpm format` before committing. Markdown and XML are excluded on purpose (hand-made
tables and the Tizen `config.xml`); keep Markdown tables readable by hand. Prettier does
not wrap comments — keep docblock lines within 100 columns yourself. `.editorconfig`
sets UTF-8, LF (CRLF for `.bat`/`.cmd`/`.ps1`), 2-space indentation.

## Content and naming

Only original names, art and music — never Konami or Taito names or assets
(`shmup_feat.md` §26). Placeholder art (e.g. `PLACEHOLDER_SHIP`) is original too.

| Rule | Enforced by |
|---|---|
| Every `content/` folder has a `README.md` (format sample) and an `example.*.json`; every JSON in it has the current `formatVersion` and a `kind` | `test/integration/workspace-layout.test.ts` |
| Shipped content and the examples validate with zero issues; files are named `<folder>/<name>.<kind>.json`; README samples still match the schema | `pnpm content:check` (`test/integration/content.test.ts`) |
| Content refers to other content, sprites, scripts and cues by string id declared with `s.ref(kind)`; systems read the resolved `<field>Id`, never the string | review; [content-data.md](content-data.md) |
| A bare array or record of references is not allowed — wrap each id in an object | `s.array` / `s.record` throw a `TypeError` at construction |

## Checklists

**New module in an existing package**

1. `src/<module>/index.ts` with the docblock sections and `moduleInfo`.
2. `test/<module>/<module>.test.ts` (at least: imports cleanly, `moduleInfo.name`).
3. When it becomes public API: export it from `src/index.ts`, update the package README
   module table and [api-reference.md](api-reference.md).

**New package or app**

1. `packages/<name>/` or `apps/<name>/` — picked up by the workspace globs automatically.
2. `package.json` (`"name": "@shmup/<name>"`, `type: module`, scripts `build`,
   `typecheck`, `lint`, `test`, `clean` like the existing ones; for libraries the
   `exports` map with the `@shmup/source` condition), `tsconfig.json`, `test/tsconfig.json`,
   `vitest.config.ts` (`defineShmupProject('<name>')`), `README.md`, `src/`, `test/`.
3. If it ships to the TV, make sure its `src/` matches ESLint's runtime-source globs in
   `eslint.config.js`.
4. `pnpm install` to link it, then `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
   from the root.
5. Add it to [repo-layout.md](repo-layout.md) and the root README's layout table.
