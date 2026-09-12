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
| `.at(i)` | Chrome 92 | `a[i]`, `a[a.length - 1]` — the rule matches any `.at(` call, so do not name your own method `at` either (the scene stack's is `sceneAt`) |
| `structuredClone` | Chrome 98 | explicit copy |
| a **stable** `Array.prototype.sort` | Chrome 70 (V8 7.0) — not a lint error | an insertion sort by hand wherever equal keys must keep their order (`core/save`'s hi-score tables: a tie stays below the older row) |
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
- Rendering: never create Pixi objects or option literals in `render()`. Sprite bindings
  are created when a new `WorldView` is bound (load time), draw lists are replayed into
  preallocated quad pools, and Pixi setters that allocate (e.g. `tint`) are only called
  when the value changes — see [rendering-and-shell.md](rendering-and-shell.md).
- Text reaches the screen through `DrawList` string slots (`setString` only when the text
  changes) or the `number` command; never build a string per frame.
- Mind V8's number boxing — a non-integer number becomes a 16-byte heap object in some
  positions: keep fractional state in typed arrays or object fields rather than in closure
  `let`s, pass whole numbers across calls that only need whole numbers (e.g.
  `grid.begin(Math.floor(camera.x) - margin, …)`), and make both arms of a conditional produce
  the same kind of number (`a * (diagonal ? k : 1)`, not `diagonal ? a * k : a`). Give a hot
  object with fractional fields (the camera) its own class instead of an object literal: V8
  shares hidden classes between literals with the same key order, and another literal of that
  shape holding objects (a content schema, say) turns the fields "tagged" — every fractional
  write then allocates. Per-tick code reads compiled typed arrays, not content objects (their
  shapes vary with optional fields) — see [stage-runtime.md](stage-runtime.md#gotchas). Two
  more from M1-08: `Math.ceil` can return `-0`, which V8 boxes like a fraction — write
  `Math.ceil(x) | 0` for whole-pixel bounds passed to a call; and a schema whose shape is
  `{ x, y }` is built by adding keys to an empty object, never as an `{ x: …, y: … }` literal
  ([enemies-and-behaviors.md](enemies-and-behaviors.md#zero-allocation-and-the-hot-path-rules)).
  And from M1-09: copy fields of a hot object that is reached through another object (the
  ship's `x` / `y`) or has several shapes (a spec from content vs a built-in default) into
  class fields once per call before a loop reads them; keep a hot per-tick loop in the method
  the World calls instead of behind a tiny wrapper (V8's mid tier inlined the loop into the
  wrapper and boxed); run an allocation guard in its own test file, away from suites that
  create many small worlds
  ([bullets-and-patterns.md](bullets-and-patterns.md#zero-allocation-and-the-hot-path-rules)).
  And from M1-10: presentation events are pushed with whole-pixel positions
  (`Math.floor(x) | 0`) — the event push is a call V8 does not inline, so a fractional `x`
  allocated per sound; pass hot objects (the ship, the camera) to a method that reads their
  fields instead of passing their fractional coordinates
  ([weapons-and-options.md](weapons-and-options.md#zero-allocation-and-the-hot-path-rules)).
  And from M1-14: state that leaves the small-integer range (an RNG's 32-bit words) lives in a
  typed array, not in closure `let`s, and a draw returned from a call stays within 16 bits; a
  fractional value the renderer reads every frame is a field updated when it changes, not a
  getter; a quad pool shared by items of different tints re-tints quads whenever the items
  shift — give each item its own quads so a tint is written only when it really changes
  ([fx-and-game-feel.md](fx-and-game-feel.md#zero-allocation-and-the-hot-path-rules)).
  And from M1-15: a value computed per request and passed on (a stereo pan) is boxed by the call
  even when the callee then drops the request — pass the whole-pixel input instead and compute
  the fraction inside, only on the path that uses it (`SfxPlayer.playAt(cue, x, priority)`);
  code that only *has* to allocate (a Web Audio source node per started sound) keeps every
  other path — dropped, deduped, unchanged — allocation-free
  ([audio.md](audio.md#zero-allocation-and-the-hot-path-rules)).
  And from M1-16: an options / layout object a builder reads every frame (`drawMenu`'s
  `MenuLayout`) is a frozen module constant — a literal at the call site allocates on every
  redraw; widgets and HUDs that count ticks are classes; a composed draw list (the scene flow's
  one UI list) is cleared and rebuilt only when a producer's revision changed, and each producer
  writes only its own string-slot range
  ([scenes-and-ui.md](scenes-and-ui.md#zero-allocation-and-the-hot-path-rules)).
  And from M1-17: `Math.round(x)` for `x` in (−0.5, 0) returns `-0` too, and so does a `-0` read
  back from JSON — clamp read values with `v <= 0 ? 0 : …` (as `resolveUserOptions` and the save's
  counters do) so a `-0` never enters state that is later passed around
  ([saves-and-options.md](saves-and-options.md#user-options-coreconfig)).
- Behaviour coroutines (generators, D29) allocate a small result object on every resume:
  scripts **sleep** (`yield ticks`) and are resumed only when they wake; per-tick motion
  belongs in a mover (numbers on the body), never in a `yield 1` loop.
- Prove it with the allocation guard: `measureHeapGrowth(fn, iterations)`
  (`packages/core/test/helpers/alloc.ts`, needs `--expose-gc` through
  `defineShmupProject(name, { execArgv })`) — every per-tick or per-frame entry point gets a
  test asserting its bytes stay under budget ([sim-world.md](sim-world.md#zero-allocation-and-the-allocation-guard)).
  It keeps the steadiest of three measured windows by default (`attempts`, stopping at the
  first within `settled` = 32 KiB); give short, cheap loops a long `warmup` (e.g. 20,000), and
  never move its measured loop into a separate helper — V8 optimises the warm-up loop on stack
  with `fn` inlined, and only that code runs allocation-free.

## Tests

- Vitest, Node environment, one folder per module: `test/<module>/<module>.test.ts`, plus
  `<module>-edge.test.ts` for edge cases where useful.
- Browser/TV APIs are injected (`win`, `createContext`, `getGamepads`, `tizen`) so tests
  pass fakes instead of touching globals. Web Audio code is written against the structural
  types of `audio-web/web-audio` (`PlaybackContextLike` …) and tested with the recording fake
  `packages/audio-web/test/helpers/fake-context.ts` (a settable clock, real sample buffers, every
  scheduled parameter change logged).
- Each package has `test/tsconfig.json` (Node types, DOM lib) separate from the pure
  `src` program.
- Determinism-sensitive code gets a headless test against `createHeadlessPlatform()`; code
  that changes simulated state is covered by a lockstep test comparing `hashWorld` of two
  worlds fed the same input.
- Generated sources that are committed (today `packages/core/src/math/trig-table.ts`) get
  a test that regenerates them and diffs the committed copy.
- Pixi display objects need no GPU, so render code is unit-tested in Node with the
  `WebGLRenderer` faked; the real WebGL path is covered by the Playwright browser tests in
  `test/e2e/` (`pnpm test:e2e`, part of the definition of done from M1-04 on).

## Formatting

Prettier 3 (`.prettierrc.json`: 100 columns, single quotes, trailing commas): run
`pnpm format` before committing. Markdown and XML are excluded on purpose (hand-made
tables and the Tizen `config.xml`), and so is `assets/source/` (pixel rows and font glyphs
are laid out one row per line); keep Markdown tables readable by hand. Prettier does
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
| Placeholder art is source data, never a hand-drawn binary: a `*.sprite.json` pixel map under `assets/source/sprites/` or a seeded generator in `scripts/assets/procedural/` (plan §1.5). PNGs there are real-art overrides only | review; [asset-pipeline.md](asset-pipeline.md) |
| A sprite's name is its path below `assets/source/sprites/` (lower-case kebab segments, `/`-separated) and the file's `name` field repeats it | `scripts/assets/sprite-source.mjs` (source issue) |
| Every sprite name the shipped content uses exists in the atlas | `pnpm content:check` (`findMissingSprites`) |
| Every `script` id names a registered behaviour (`KNOWN_SCRIPT_IDS`), every enemy `params` name a tunable of its behaviour, every spawner a `child` | `pnpm content:check` and the shell's boot (`knownScripts`, `checkEnemyBehaviors`) |
| Procedural generators seed from the sprite name (`seedOf`) and use only exactly rounded maths (no `Math.sin`/`cos`), so the atlas is byte-identical on every machine | review; `test/scripts/assets/pipeline*.test.ts` (byte-identical runs) |
| A shipped zone is playable with four directions (`shmup_feat.md` §4 rule 2, D17): no aimed bullet over 2.0 px/tick on Normal, no two simultaneous laser lanes leaving under 16 px of gap (lanes widened by the ship's hurt radius), ≥ 3 capsule sources within 900 px after every checkpoint (§10); the 4-way playtest bot clears it in god mode | `pnpm content:check` (zone A block of `content.test.ts`), `test/playtest/` — [zone-a-and-playtest.md](zone-a-and-playtest.md#the-4-way-design-rules) |
| Placeholder sounds and music are data, never audio binaries: synth parameter sets and chip songs in `content/audio/`, rendered at load by the deterministic `audio-web` synth (table sines, seeded noise). Every `SFX_CUES` cue is bound, every song loops sample-exactly, every cue a shipped stage names has a track | `pnpm content:check`; `packages/audio-web/test/synth/` (pinned hashes) — [audio.md](audio.md) |

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
