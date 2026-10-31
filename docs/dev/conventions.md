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
active (one ESLint instance, warmed up in `beforeAll` since M2-05 — its first lint timed out
under the full `pnpm test` load).

## Frame numbers: the literal scan and the fingerprint

v2 changes the internal frame from 384×216 to 640×360 by changing a few constants
([plan_resolution.md](../../plan_resolution.md) R1-01, R2-01). So since R1-01 every
frame-dependent number in `@shmup/core` **derives** from the constants of `core/config`:
`FRAME_W` / `FRAME_H` (640 / 360 since R2-01's flip), `FRAME_CX` / `FRAME_CY` (the centre),
`HUD_BAR_HEIGHT` (12), `PLAYFIELD_Y` / `PLAYFIELD_W` / `PLAYFIELD_H` / `PLAYFIELD_CY` (the
playfield is 640×336), `HUD_BOTTOM_Y` (348), `TILE_SIZE` (12), `ART_SCALE` (3/2 — a positive
rational, not a whole number; the config's whole-number check exempts it and a rational check
requires its products with the font metrics to be whole) and the font metrics `GLYPH_W` /
`GLYPH_H` / `LINE_H` (9 / 12 / 15 — since R4-03.C1 the native font file's own cell,
`assets/source/fonts/pixel9x12.font.json`, pinned to that file by
`packages/core/test/config/frame-constants.test.ts` (RR-2); the scale-1 build still reads the v1
file's 6 / 8 / 10 through `ART_SCALE`; glyph rows stay laid out at the file's own cell).

Since R1-02 the same holds outside core: the other packages and the apps import the constants from
`@shmup/core`, and code that cannot — Electron's main process, the Node scripts — reads a **pinned
mirror** (owner decision O8): `apps/electron/src/main/window-state.ts` `FRAME_WIDTH` /
`FRAME_HEIGHT` (pinned by `apps/electron/test/main/window-frame.test.ts`) and
[`scripts/frame.mjs`](../../scripts/frame.mjs) — the frame constants plus `WORLD_SCALE`,
`SPAWN_LEAD` and `CAPTURE_SCALE` — for the root scripts, the apps' scripts, the browser specs and
the Playwright config (pinned export by export by `test/scripts/frame.test.ts`). A mirror's test
fails when core
flips alone, so R2-01 changes them together. Since R2-01 the browser specs hold two mirrors of
their own, each pinned to core by a Node test: `test/e2e/frame-pixels.ts` re-exports the font
metrics and computes `UI_ART_SCALE` (core's `ART_SCALE`, read back as `GLYPH_W` over the font
file's cell width) and its own `uiPx` exactly as `core/ui` does (both pinned by
`test/scripts/frame.test.ts`); `test/e2e/save-format.ts` holds `SAVE_FORMAT` = 3, pinned to core's
`SAVE_VERSION` by `test/integration/e2e-save-format.test.ts`. (`test/e2e/gates.ts` once held a
third — the `REPLAY_FORMAT` mirror — and was deleted by R2-03.G1 with the gates below.)

| Rule | Enforced by |
|---|---|
| No literal frame number in `packages/core/src`: write `FRAME_W`, `PLAYFIELD_W + 16`, `FRAME_CX - 120`, `n * GLYPH_W` — never `384`, `400`, `72` | `packages/core/test/frame-literals.test.ts` |
| No literal frame number in the other packages' `src/`, the apps' `src/` and `scripts/`, or the root `scripts/`: import the constants from `@shmup/core` (in a Node script: from `scripts/frame.mjs`) | `test/integration/frame-literals-repo.test.ts` |
| **Frame ≠ world** (plan §2.6): only values anchored to the frame derive from it — an edge, the centre, "one playfield", a text width. World values (radii, margins, speeds, a boss's distance from the edge) are written `v1 × WORLD_SCALE` since R2-02's port (3/2): an absolute world y takes `+ WORLD_TOP_PAD` (36), a y above the top edge (`y < 0`) `WORLD_SCALE · y` only; frame-anchored values read neither | review; the audits below |
| Since R2-01 (`92120c7`) no panel size is a literal at all — they derive from `GLYPH_W` / `LINE_H` through `core/ui` `uiPx`; a panel's position derives from the centre or an edge | [scenes-and-ui.md](scenes-and-ui.md) |
| A browser spec samples a screenshot through `test/e2e/frame-pixels.ts` (`sx`, `sy`, `pixelIndex`, `VIEWPORT`) — never `3x + 1`; rows that come from content (a stage's bands, a Mode-7 horizon) stay literal | review |
| Core's presentation output does not move unless a step means it to | `test/integration/presentation-fingerprint.test.ts` |
| The shell's own scenes (flight, showcase, fx-gallery) do not move either | `packages/shell/test/frame-fingerprint.test.ts` |

**The world-value audits (R2-02).** A scaled world number cannot hide, and neither can an unscaled
one. `packages/core/test/config/world-scale.test.ts` freezes every world-unit numeric export of
core's barrel at its **v1** value and its unit (`V1_WORLD`; `V1_WORLD_ARRAYS` for the frozen
`number[]` exports) and requires each to equal `rescaleNumber(unit, v1, geometry)` at the live
scale — the identity while `WORLD_SCALE` was 1, the ported value now; a completeness pass over the
barrel fails any new world-shaped export until it is classified into that table or the reasoned
`UNSCALED` / `UNSCALED_ARRAYS` list. `packages/core/test/behaviors/behavior-defaults-port.test.ts`
holds every behaviour and weapon default to the same rule against the frozen
`fixtures/v1-behavior-defaults.json`, so a new world-unit tunable without a fixture row fails too.

**The literal scan** (`frame-literals.test.ts`) parses every `packages/core/src/**/*.ts` file with
the TypeScript compiler — comments and docblocks are never read, numbers inside strings and
template literals are, except that the digits of a long `#rrggbb` / `#rrggbbaa` colour token are
blanked before the numbers are matched (decision W4-11: the `336` of `'#336a64'` is a palette
entry, not a frame number — and a palette would trip the scan now that 336 is one; a short
`#rgb` / `#rgba` is read as text, so `'#384'` still counts) — and fails on any literal of a frame
number: the v1 frame's `384`, `216`,
`200` (`PLAYFIELD_H`), `208` (`HUD_BOTTOM_Y`) and its centre `192` / `108`, plus whatever `FRAME_W`,
`FRAME_H`, `PLAYFIELD_H` and `HUD_BOTTOM_Y` are *now* (from R2-01: `640`, `360`, `336`, `348`).
`100` and the new centre `320` / `180` are not banned — ticks, percentages and scores use them.

A literal that is a frame number but does not mean the frame goes on the allow-list `ALLOWED` in
that file — core's holds **14 entries** today — one entry per symbol and value:

```ts
{
  file: 'math/trig-table.ts',       // relative to packages/core/src/
  symbol: 'ATAN_TABLE',             // the declarations around it, outermost first, '.'-joined
  value: 108,
  count: 3,                         // how many literals of `value` the symbol holds (default 1)
  reason: 'angles: the generated arctangent table (gen-trig-tables.mjs; its test diffs it)',
}
```

The failure message names the file, symbol path, value and line of each unlisted literal, so the
entry can be written from it. Entries never match on line numbers; the test fails on an entry whose
symbol now holds more literals than `count` (a frame number crept in beside an allowed one), fewer,
or none — the list cannot rot. Add an entry only for a count, an angle, a character cap, a world
distance or generated data, with the reason (text-sized panels are no longer a category —
`92120c7` laid them out from `GLYPH_W` / `LINE_H`); anything that does mean the frame derives from
the constants. The flip (R2-01, `72b18a1`) added three new entries covering the four literals plan
R1-01's As built predicted: the 360-tick ending timers `EndingScene.drawCitadel.sink` (`count: 2`)
and `StoryScene.drawDawn.rise`, and the angle `640` in `DIRECTION_HEADINGS`; `92120c7` — the same
step's uiPx commit, earlier than the flip — had already removed the seven panel / column entries,
among them the `ZONE_TALLY_PANEL.w` entry this doc's old example quoted.

**The repo-wide scan** (`test/integration/frame-literals-repo.test.ts`, R1-02) does the same for
everything else, with the same scanner — the shared test helper
`packages/core/test/helpers/frame-literal-scan.ts` (`scanFrameLiterals`, `listSourceFiles`,
`frameLiteralProblems`, `FRAME_NUMBERS`), which the repo-wide test imports by relative path (as the
packages import the allocation guard). It parses every package's `src/` but core's, every app's
`src/` and — where it has one — `scripts/` (the bundle checks, the manifest validators, packaging
and bench helpers), and the root `scripts/`; `.mjs` files are parsed as JavaScript. The trees are
read from disk, so a new package or app is scanned without editing the test. Its own `ALLOWED` list
(30 entries today) has the same shape, with `file` relative to the repository root, and holds HTTP
statuses, alphas, colour channels, a key code, a brightness sum, degrees (the 360° turn), the TV
bench's 384×216 and 640×360 baseline rows, v1's window-state width — and the four **mirror
definitions**, whose entries say `value: FRAME_W` / `value: FRAME_H` rather than a number, so they
follow the flip as long as the mirror flips with core. Its failure message ends `derive it from
@shmup/core's constants (in a Node script: from scripts/frame.mjs)`.

**Not scanned:** `test/` (specs and tests may hold literal sizes — but specs should sample through
`frame-pixels.ts`), the `vite*.config.ts` files and `vite.shared.ts`, `apps/*/index.html`,
`apps/tizen/bench/`, `apps/tizen/polyfills/` and `tools/` (standalone, with bench data and HTTP codes
of its own). Like core's scan it reads literals only: a computed `128 * 3`, a BigInt or a regular
expression passes.

**The presentation fingerprint** (`test/integration/presentation-fingerprint.test.ts`): the golden
replays hash only the simulation, so a change that moves a menu, the HUD, the zone card or the
WARNING band passes them. This test plays fixed, scripted walks through every scene of the scene
flow on the shipped content — **119 segments over 12 walks**, and a 13th test that checks the walks
showed every `SceneId` — and folds every frame core hands a renderer into four FNV-1a hashes per
segment: `ui`, `hud`, `world`, `screen` (a text command contributes its string, never its slot).
It was pinned on the v1.0.0 code (`333721b`; the co-op walks on `4dfca16`) and covers core's output
only, not render-pixi or the shell.

- **Through R1 it stayed green without an edit** — the re-pin R2-01's flip performed is exactly the
  exception below, and the walks are content-independent since. A red segment names the walk, the
  segment and the
  kind of output that moved: a moved pixel (or a moved sim value — then the goldens fail too).
- **Re-pinning** is for a step that changes what is drawn on purpose — R2-01's flip, an art or
  layout step, a change of the shipped content (strings, stages, the campaign). Since R5-P.P10
  (`95bc61d`) each of the three fingerprint tests — this one, the content-DB one and the shell's
  `packages/shell/test/frame-fingerprint.test.ts` — rewrites its own `PINNED` in place when run
  with `SHMUP_FINGERPRINT_UPDATE=1` (the shared writer is
  `packages/core/test/helpers/pin-writer.ts`; it refuses to write while `CI` is set and prints the
  Prettier-clean form, so after a re-pin `pnpm exec prettier --check` the touched file and review
  `git status`). The print-and-paste path still stands where it is preferred:
  `SHMUP_FINGERPRINT_PRINT=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration
  test/integration/presentation-fingerprint.test.ts` prints the tables to paste over `PINNED`. In
  both cases say in the commit message why the output changed. Never re-pin to quiet an
  unexplained change.

**Self-expiring gates (R2-01 → R2-03) — all gone now.** Between the flip, R2-02's port and
R2-03's re-bless, some checks could not pass. Each gate skipped its cases — the reason rode in
the test's name — while its condition held, and its helper threw at import once the condition was
gone, so the step that cleared it deleted the file and every use of it. The port's gate,
`CONTENT_PORT_PENDING` (`packages/core/test/helpers/port-pending.ts`, held while a shipped
tileset was not at `TILE_SIZE`), expired with R2-02's port and `R2-02.U5` (`2ce6a12`) deleted
the file — but three `packages/core/test/data` suites (tilemap, tilemap-edge, units-pairs) held
self-contained local twins of the same signal that survived U5, permanently false-skipping 44
cases, until `R2-03.FIXG` (`bdd820a`) deleted the twins and rewrote the cases on the ported
premise. The last two gates — `GOLDENS_STALE` (`test/golden/stale.ts`, re-exported by
`golden.ts`, held while a committed golden or demo recorded another replay format or another
frame) and the browser specs' twins `R2_03_PENDING` / `PORT_UNMEASURED` (`test/e2e/gates.ts`,
pinned in Node by `test/integration/e2e-gates.test.ts` along with the `REPLAY_FORMAT` mirror
above) — expired when `R2-03.G1` (`d4ba9e8`) re-blessed the goldens and re-recorded the demos at
640×360; that step deleted the helpers, the pinning test and the `scripts/golden-update.mjs`
refusal of the shipped-tileset signal. The law stands: a failure that comes from a test's own
fixture is fixed, never gated.

## Chromium 68 / 69 rules (the TV engine floor)

Shipped runtime code (`packages/*/src`, `apps/web/src`, `apps/tizen/src`,
`apps/webos/src`) is linted against `chrome >= 69` (`.browserslistrc`) — but since
M3-03 there are **two** TVs and the older one is **Chromium 68**. Read
[Two TVs, two engines](#two-tvs-two-engines) below before you rely on the lint. The build
lowers **syntax**, not **APIs**. Lint errors you may meet:

| Don't use | Needs | Use instead |
|---|---|---|
| `Array.prototype.flat` / `flatMap` | Chrome 69 — **not a lint error**, and webOS 5 is Chromium 68 | a loop, or `concat.apply`; caught by `test/integration/tv-engine-floor.test.ts` |
| `globalThis` | Chrome 71 | Allowed — polyfilled by `apps/tizen/polyfills/global-this.js` (both TV builds prepend that same file) |
| `Object.hasOwn` | Chrome 93 | `Object.prototype.hasOwnProperty.call(o, k)` |
| `Object.fromEntries` | Chrome 73 | a loop filling an object |
| `Promise.allSettled` / `Promise.any` | Chrome 76 / 85 | `Promise.all` with per-promise `.catch` |
| `String.prototype.replaceAll` | Chrome 85 | `replace(/…/g, …)` |
| `.at(i)` | Chrome 92 | `a[i]`, `a[a.length - 1]` — the rule matches any `.at(` call, so do not name your own method `at` either (the scene stack's is `sceneAt`) |
| `structuredClone` | Chrome 98 | explicit copy |
| a **stable** `Array.prototype.sort` | Chrome 70 (V8 7.0) — not a lint error | an insertion sort by hand wherever equal keys must keep their order (`core/save`'s hi-score tables: a tie stays below the older row) |
| `import.meta` | ES modules only | pass values in through config (allowed only in `apps/web`, which is served as a module) |
| other newer APIs | — | `compat/compat` (eslint-plugin-compat, `lintAllEsApis`) reports them |

Also avoid on the TV: top-level `await` and dynamic `import()` (the TV bundles are one
classic IIFE script each), WebGL2-only features (WebGL1 is the baseline), and CSS newer than
Chrome 68 in `index.html`. Hand-written files prepended to the bundle (polyfills) are
ES5 and linted with `ecmaVersion: 5`.

### Two TVs, two engines

| Host | Platform | Engine |
|---|---|---|
| `@shmup/tizen` | Samsung Tizen 5.5 (the M7 monitors) | Chromium **69** — measured on both units, UA `… 69.0.3497.106/5.5 …` (`shmup_tech.md` §2.7) |
| `@shmup/webos` | LG webOS TV **5.x** (2020 sets) | Chromium **68** — LG's published [web engine table](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine) (re-checked 2026-09-16: webOS 4.x = 53, **5.x = 68**, 6.x = 79, 22 = 87, 23 = 94, 24 = 108) |

**The real floor of shipped code is therefore Chromium 68, not 69.** Three separate
things are involved, and confusing them is the trap:

1. **Syntax — handled by the build, and safe.** Both TV apps build with
   `target: ['chrome69', 'es2018']`. A target list is a set of constraints, so the
   *lowest* wins: the emitted syntax is **ES2018**, and every ES2018 feature (object rest
   and spread, async iteration, `Promise.prototype.finally`, `RegExp` `dotAll`, named
   groups and lookbehind) shipped in Chrome 60–64 — comfortably inside 68. The `chrome69`
   entry is not what makes the output safe — `es2018` is. (Chrome 69 added no JavaScript
   *syntax* over 68; what it added was the two library methods in point 2, which no target
   setting can conjure onto an older engine.)
2. **Runtime APIs — not handled by anything automatic.** A bundler never polyfills library
   methods. `Array.prototype.flat` and `flatMap` landed in **Chrome 69**, so
   `eslint-plugin-compat` at a `chrome >= 69` floor **accepts them**
   (`test/integration/eslint-rules.test.ts` asserts that it does) and they would throw
   `TypeError: [].flat is not a function` on an LG set. Two guards stand against that,
   sharing the needle list in **`scripts/too-new-apis.mjs`**: the source scan
   **`test/integration/tv-engine-floor.test.ts`**, which scans every shipped source tree
   (`packages/{core,audio-web,input-web,render-pixi,shell}/src`,
   `apps/{web,tizen,webos}/src`) with comments stripped for the API names newer than
   Chrome 68, and also pins the shared build settings — the same target string in both
   Vite configs, the same polyfill *file* (webOS reads
   `apps/tizen/polyfills/global-this.js` rather than keeping a copy) and the budgets
   imported from the Tizen check rather than repeated — and the built-bundle scan
   **rule 13 of `apps/tizen/scripts/check-bundle.mjs`** (the v20x P1-8c rule below),
   which reads the same names over the `app.js` the TV actually parses — dependencies
   included — as part of both TV apps' `build` script.
3. **`globalThis` (Chrome 71) exists on neither TV.** It works because both builds prepend
   the same ES5 polyfill, whose banner both bundle checks verify.

**What the scan does not cover — do not read a green run as proof of anything wider:**

- **Only the names in its list.** It is a string search, not a semantic analysis: a new
  Chrome 69+ API nobody thought of passes, and so would `arr['flat']()` or any other
  indirect call. Add the name to the shared list in `scripts/too-new-apis.mjs`
  (`TOO_NEW_APIS`) when you learn of one — it feeds both guards.
- **Only first-party source — the source scan; the bundle check scans everything.** The
  built bundle is not the source test's problem, and since the v20x P1-8c rule it is not
  unscanned either: **rule 13 of `apps/tizen/scripts/check-bundle.mjs`** re-greps the
  built `app.js` itself with the same `scripts/too-new-apis.mjs` list, and the `build`
  scripts of both TV apps run their bundle check after `vite build` — so every
  `pnpm build` (CI included, via turbo) fails loud if any of these names reaches the
  artifact. The exemption is positional, not by name: the two prepended ES5 polyfill
  files' exact embedded regions (located by their on-disk text) are exempt, and
  `String.prototype.matchAll` is tolerated only at Pixi 8.22's pinned two-site baseline
  while the matchAll polyfill banner stands in front. This is the codification of the
  standing rule that grew from the incident this paragraph predicted: the 2026-10-20
  dependency bump (`b42d34f2`, PixiJS 8.20.1 → 8.22.0) silently broke the TV boot because
  8.22's shader-sampler parse (`ensureSamplerPrecision`) calls `String.prototype.matchAll`
  (Chrome 73 — on neither TV) twice in renderer init, where the 2026-09-16 grep over the
  built `apps/tizen/dist/app.js` had found no `.flat(`, `.flatMap(`, `.at(`,
  `Object.fromEntries`, `matchAll`, `replaceAll`, `structuredClone`, `queueMicrotask` or
  `Promise.allSettled` at all; `apps/tizen/polyfills/string-match-all.js` is now
  prepended in both TV builds right after the globalThis file, and the 2026-10-23 audit
  of a fresh build finds only Pixi's two call sites and every other name absent — the
  corpus rule 13 now greps automatically on every TV build, so a dependency upgrade that
  changes that shape breaks the build instead of the boot.
- **Only JavaScript.** DOM, CSS, WebGL and Web Audio surfaces between 68 and 69 are not
  checked by anything; WebGL1 is the baseline for a different reason (the Mali driver), and
  CSS in `index.html` is a hand-review item.
- **Nothing at runtime.** No webOS device has ever run this code
  ([plan §8.7](../old/shmup_plan.md#87-lg-webos-on-a-real-set-m3-03)), so "inside the floor"
  is a static claim about APIs, not a report from hardware.

The safest habit is the simplest one: **write for Chromium 68**, and treat the lint's 69 as
the looser of two rules rather than the rule.

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
  And from M1-19: draw lists whose items come in several colours re-tint a shared quad pool —
  give each colour its own list (the debug overlay has sixteen); a slowed clock fed to
  `loop.advance` is floored to whole milliseconds (a fractional argument is boxed every frame);
  wrappers of a hot native call (the draw-call counter) forward their arguments explicitly, never
  through `arguments` or a rest array; and an allocation guard of an object made by a factory may
  need to measure a second instance after a throwaway one — the first carried V8 hidden-class
  transitions and made the render-pixi overlay guard flaky
  ([debug-and-replays.md](debug-and-replays.md#the-overlay-shmuprender-pixi-debug)).
  And from M2-02: a fractional **return value** is boxed just like an argument — draw an RNG
  fraction into a typed array (`Rng.nextFloatInto(out, i)`, the pattern DSL's `$rand`); hand a set
  of fractional values to another system in a reused class instance (`BulletShot` →
  `BulletSystem.launch`) and let a method read a point from class fields rather than take it as
  arguments (the bending lasers' `aimPoint()`); an interpreter keeps all of its state in
  preallocated typed arrays (runner tables, an expression stack whose slot 0 is the result) and
  caps the work of one run (`PATTERN_STEP_BUDGET`); a sprite drawn many times per frame with no
  need to turn is round art placed per node, never rotated or scaled (Pixi's transform setters
  allocate — the bending laser segments)
  ([pattern-dsl.md](pattern-dsl.md#zero-allocation)).
  And from M2-03: a per-call variant of a shared routine (the Twin Laser's lane in `emit`) travels
  in a class field set around the call, not as an extra fractional argument; a grid visitor that
  needs more than a box test (the Ripple's ring) reads its per-query geometry from class fields set
  once per queried shot; state compiled from content that a menu may swap at run time (the weapon
  select's preview arsenal) is recompiled **into the existing typed arrays** and copied into the
  existing list (`WeaponSystem.setArsenal`), never rebuilt; and a screen that runs a private World
  (the live preview) gives it its own event queue and debug flags and reuses one input snapshot
  ([meter-arsenal.md](meter-arsenal.md#zero-allocation-and-the-hot-path-rules)).
  And from M2-04: a small hot method that other code calls every tick (`OptionGroup.follow`) must
  stay small enough for V8 to inline — adding the Snake / Formation / Rotate placement inline made
  it too big, V8 stopped inlining it and a fractional argument was boxed on every call; move the
  new branches into a separate method (`place()`) and keep only the common path inline. A
  fraction derived from state (the spread `t`) is computed inside the method that uses it, never
  passed
  ([options-shields-hunter.md](options-shields-hunter.md#zero-allocation-and-the-hot-path-rules)).
  And from M2-05: content with a variable shape (a family's levels of emitters) is compiled once
  into flat typed arrays with per-level start / count indices (`FamilyTables`), and a per-shot
  variant (an emitter's offset) reaches the shared `emit` through class fields reset after the
  volley; an allocation guard of a system whose test stage spawns enemies measures without the
  spawns — each spawn's coroutine allocates (D29), which on the direct range alone is ~70–80 KB
  ([direct-mode.md](direct-mode.md#zero-allocation-and-the-hot-path-rules)).
  And from M2-06: change detection that grows per player keeps its remembered values in typed
  arrays sampled and compared in a loop (`Hud`'s `shown` / `next`, twelve values a player) rather
  than a field per value and player; a fractional credit that a system carries from tick to tick
  (`PowerUpSystem.coopCredit`) lives in a one-slot `Float64Array`; and strings only one mode draws
  (the co-op HUD's) are written only when drawn, so draw lists sized for the other mode keep working
  ([coop.md](coop.md#zero-allocation-and-the-hot-path-rules)).
  And from M2-07: a condition tested every tick is mover state, not a script loop (the falling
  rock's proximity trigger lives in the `Ballistic` mover, whose landing wakes the sleeping
  script once); a point handed to a per-tick query is the object that holds it
  (`runner.probe(ship)`); state a renderer must follow as it changes in place (the terrain tiles)
  is announced through write / reset counters and a ring of changed indices (`TerrainChanges`),
  never by rescanning or a dirty list; and a closure a system needs goes on its cold path only
  (`StageGimmicks.clear`'s block respawn)
  ([advanced-stages.md](advanced-stages.md#zero-allocation-and-the-hot-path-rules)).
  And from M2-08: a fraction many per-frame calls need (render interpolation's blend factor) travels
  in a reused class instance (`RenderBlend` / `FrameBlend`, the drawn camera), never as a call
  argument, and a clamp of it is written inline rather than in a helper that returns it; a value
  the host reads every frame from a probe (`RefreshMonitor.hz`) is a plain field — the getter
  boxed it; per-binding history a feature may never use is allocated on first use and swapped by
  reference; Pixi state that copies or rebuilds on assignment (a layer's `filters` list, a sprite's
  `blendMode`) is set only at a range edge — or never, with one sprite per blend mode — and a
  data texture is re-uploaded only when its bytes changed
  ([presentation-polish.md](presentation-polish.md#zero-allocation-and-the-hot-path-rules)).
  And from M2-09: a trig lookup done per part per tick reads a module-level `Float64Array` copy of
  the committed sine table by whole index (a `sinB` call passes and returns fractions); cold script
  code (a behaviour between yields runs in V8's lower tiers, which box every double they compute)
  reads snapshots the hot phase already took (`BossPart.inView`) and hands fractional work to a
  hot routine that owns it (`aimPart` → the bullet system's `aimFrom`), moving only whole numbers
  itself; a camera target another system writes every tick is a class with plain fields
  (`RaidCamera`), read, never copied; and a sprite that must show a direction uses heading
  frames, never Pixi's rotation setter
  ([advanced-bosses.md](advanced-bosses.md#zero-allocation-and-the-hot-path-rules)).
  And from M2-10: state that must survive from one World to the next (a campaign run's players)
  is copied field by field into a preallocated class on the scene transition (`CarryState`), never
  kept by reference to the old World; a screen whose drawing grows with the content (the zone map's
  edges) derives its per-item cost from a fixed budget of the draw list at construction
  (`MapScene.edgeDots`) so the largest content the validation accepts still fits, and builds its
  strings on `enter` or reads the content's own; a counter a condition reads every tick is a class
  of plain numbers incremented in place (`EnemyStats`); and a host handler never modifies an array
  a content picker returned (it may be memoised) — it builds its own on the cold path
  ([campaign-and-bonus-stages.md](campaign-and-bonus-stages.md#zero-allocation-and-the-hot-path-rules)).
  And from M2-14: a script that waits for a condition sleeps for good and lets the system test the
  condition in its tick (`ScriptApi.sleepUntilNear` — the enemy system's movement phase wakes it
  once; a polling `mine.burst` allocated 294 KB per 10,000 ticks with four mines waiting); a pattern
  repeated every few ticks is state the system fires (`BossScriptApi.spiral` — the boss system's
  spiral stream in `runScript`), not a script woken per volley (≈ 80 bytes a wake); and a screen
  that grows with content draws only what is on screen through a fixed ring of string slots taken
  by row number (`CreditsScene`, 24 slots for any number of rows)
  ([zones-h-and-i.md](zones-h-and-i.md#zero-allocation)).
  And from M2-15: a screen that plays a private World (the attract demo) gives it its own event
  queue and debug switches and forwards that queue through a closure bound once in its constructor,
  filtering kinds through a `Uint8Array` table (`DEMO_SILENT_KINDS`); a name, a page title or a zone
  card is built on a transition and never per frame (the name entry's letters are one-character
  strings built once); and an allocation guard of a World must not run after a long
  replay-*recording* session in the same worker — V8 feedback from the recorder made every later
  World allocate ~12 bytes a tick — so it plays a synthetic recording (`packReplayInput`) instead
  ([front-end-and-attract.md](front-end-and-attract.md#zero-allocation)).
  And from M2-16: per-frame code never iterates with `for … of` — the rebind widget's first draw
  did, and V8 allocated an iterator object on every redraw (~600 bytes, caught by the allocation
  guard); use index loops, and have a widget precompute in its constructor the counts its draw
  needs (`RebindPanel.menuSlots` / `maxRows`). A host call a screen makes every tick while it waits
  (`ControlsSetup.pollCapture`) returns a number read from a field; a UI string template
  (`formatUiText`) is filled on a transition, never per frame
  ([options-rebinding-and-accessibility.md](options-rebinding-and-accessibility.md#zero-allocation)).
  And from M2-17: a setter a host calls every frame "just in case" must compare its **raw input**
  with the last one before it transforms anything — the overlay's device line compared its result
  instead, so cutting the ~66-character TV line with `slice()` made a new string on every frame
  (≈ 1.7 MB per 20,000 calls, caught in review). `DebugOverlay.setDevice` keeps the last input and
  returns at once when it is the same string
  ([platform-polish.md](platform-polish.md#the-debug-overlays-device-line-shmuprender-pixi-debug-shmupshell-debug)).
  And from M3-01: a hot function that gains a branch for a feature only one mode uses (the
  game-speed assist in `Game.frame`) can grow past what V8 inlines, and then the fractional
  argument it receives (`nowMs`) is boxed on every call — keep the small version for the mode
  that does not need the branch and pick one function at creation (`bareFrame` / `flowFrame`)
  instead of testing the mode inside; a new piece of per-tick state that older recordings do not
  have is hashed only when in use (the caravan clock, `Loadout.spread`) so their hashes stay valid
  ([extra-modes-and-replays.md](extra-modes-and-replays.md#zero-allocation)).
  And from M3-02: a **centre passed to a many-argument call** V8 does not inline is boxed like any
  other fractional argument — `BlackHoleSystem.update` hands whole-pixel centres to the
  six-argument `bullets.vortex` and to `enemies.pullTowards`, or a heap number appeared on every
  tick a vortex was open; and a filter attached per frame copies Pixi's filter list, so a
  presentation pass attaches and detaches only at a range or setting edge (the Mode-7 floor's
  camera range, the CRT pass's setting and viewport)
  ([visual-and-mechanic-extras.md](visual-and-mechanic-extras.md#zero-allocation)).
  And from R2-02: a fractional **offset does not travel across a call V8 leaves un-inlined** —
  after the port the muzzle trigger's `dx` is 13.5, and added at the `emitRow` call it boxed on
  every shot (166,000 B against `dispatch-fx-alloc`'s 65,536 B budget); the particle system hands
  `emitSlot` the whole x and y, the cue row and the trigger's slot, and `spawn` adds `dx[slot]` /
  `dy[slot]` only where it stores `px[i]` / `py[i]` (commit `d031d41`); and a cold path that
  **recompiles content tables** re-lowers its fractions in V8's mid tiers and boxes them — at the
  port scale half the behaviour defaults stop being whole, so every `setArsenal` recompile of the
  weapon-select preview boxed ~79 B (`compileRole`'s `tunable()` reads); the per-weapon compiled
  row is captured once into a `Float64Array` and restored by number (`captureRow` / `applyRow`,
  commit `3b56c26`) — [meter-arsenal.md](meter-arsenal.md#zero-allocation-and-the-hot-path-rules).
  And from R5-01: **the parallax and decor sync take the camera object, not its raw numbers** —
  `updateParallaxView` / `updateDecorView` carried fractional `camera.x` per tick into non-inlined
  callees (one `HeapNumber` per tick at a fractional anchor); `syncParallaxView` /
  `syncDecorView` write carrier fields on the view instead (M1-10 family, the R2-02 muzzle-dx
  transport law one boundary earlier, commit `79243ce`). Fractional camera values are the v2 norm,
  so **any stage anchor can step on this class** — the two grep-found raw-number call sites were
  the only per-tick ones, and a checkpoint or off-loop site is exempt.
- Behaviour coroutines (generators, D29) allocate a small result object on every resume:
  scripts **sleep** (`yield ticks`) and are resumed only when they wake; per-tick motion
  belongs in a mover (numbers on the body), never in a `yield 1` loop.
- Prove it with the allocation guard: `measureHeapGrowth(fn, iterations, warmup, attempts?,
  settled?)` (`packages/core/test/helpers/alloc.ts` — the only one; other packages import it by
  relative path, and their `vitest.config.ts` passes `execArgv: ALLOCATION_GUARD_EXEC_ARGV`) —
  every per-tick or per-frame entry point gets a test asserting its bytes stay under budget
  ([sim-world.md](sim-world.md#zero-allocation-and-the-allocation-guard)). Its rules:
  - a **warm-up** of at least `max(iterations, 20_000)` calls for a cheap loop (microseconds a
    call) — V8 promotes code to its top tier only after enough calls; a heavy World guard warms up
    about two windows' worth;
  - **new indices in every window**: the calls get indices that never repeat — `0 … warmup − 1`
    in the warm-up, then `warmup + w × iterations …` in window `w` — so derive the per-call values
    from the index the way the game produces them: what grows in play (a tick, the camera, a
    clock, a score, a stick's reading) grows with the index, what is bounded (a screen position,
    an animation frame, a pattern phase) may cycle (`i % n`). Pick the code's paths by the index's
    remainders, which the warm-up has all met, never by its size. (Windows that replayed the
    warm-up's indices never met a new value, so a cache keyed on one — a `Map` entry per camera
    position — went unseen: render-pixi's hitbox guard passed with one in its `sync`.)
  - `settled` (default 32 KiB, the window that ends the search early) at most **half the
    budget** — the 32 KiB guards pass 16 KiB;
  - three windows by default (`attempts`); a guard whose windows still differ under the full
    suite's load may take five (M2-13's `boss.squid` / `boss.facet` do);
  - the measured work is the code under test only: fakes the loop calls must not log or allocate
    (the fx gallery guard measured ~53 KB of its popups fake's call log);
  - never raise a budget to quiet a flaky guard, never move a measured loop into a helper of its
    own (the guard runs warm-up and windows through one loop so the windows run the code the
    warm-up compiled), and never collect garbage between a warm-up and a measurement yourself.

  A guard of a script that wakes often allows the bytes of its wakes on top of its budget (M2-14:
  `WakeCount` counts them — `see(wakeTick)` per call — and `allowance(iterations)` gives
  `SCRIPT_WAKE_BYTES` 96 per wake; the heavy boss guards use it) — those bytes are D29's by
  design, a real leak grows with the calls.

## Debug-only code

Developer tooling that must not ship (the debug tools, the overlay, `window.__shmupDebug`) is
reached only through a `__SHMUP_DEV__ ? … : null` expression in an app's `main.ts` — the define
is `false` in `pnpm build`, so the minifier drops the branch and everything only it imports.
Library code takes such tooling as an optional **factory** (`ShellOptions.debugTools`), never as
a static import from the boot path; `apps/tizen/test/build/tizen-build.test.ts` checks that the
release `app.js` holds no debug code. Sim-affecting debug options belong in `GameConfig` (so a
replay records them); the only sim-affecting debug switch is god mode, which a replay header
records as `assisted` ([debug-and-replays.md](debug-and-replays.md#release-builds-and-dev--test-builds))
— and, since M3-01, as bit 1 of `assists`; the assists a player chooses (invincibility, option
recovery) are `GameConfig` fields, the game speed only slows the clock.

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
- **Golden replays** (M1-19, plan §1.3 / §1.5): `test/golden/*.replay.json` — and since M2-15 the
  attract demos `content/demos/*.replay.json` (`test/golden/demos.test.ts`) — must replay with
  every state hash equal. A change that alters what the simulation does re-blesses them **in the
  same commit** with `pnpm golden:update`, and the commit message says why; never edit the files
  by hand (Prettier skips them). An unintended golden failure is a bug, not a re-bless
  ([debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden)).
- **Hashed state is appended, never renumbered** (w15-MOVE): when a sim change adds state the
  world hash must carry, its read is appended **at the end** of the mixer that owns it — the
  vertical ease-in's `verticalTicks` / `verticalIdle` went at the end of `core/debug` `mixPlayer`
  — so every older field keeps its place in the hash order; only the hashes themselves move, and
  the step that intended them re-blesses (`pnpm golden:update`, reason in the commit message).
- **A zone content change re-blesses one zone** (R5-P.P3, `c284b78`): each zone's outcome checks
  live in their own file, `test/golden/golden-zone-<letter>.test.ts` (`golden.test.ts` still plays
  every recording and keeps the dev-stage and extra-mode blocks), and
  `node scripts/golden-update.mjs --only zone-b[,zone-c,…]` re-records the listed stages' goldens
  **and demos** while every other recording is still verified against its hash. Through pnpm the
  flag rides after a `--` (`pnpm golden:update -- --only zone-b`); an unknown or empty id list
  fails loud (`0b166c4`). The global re-bless of a content round (R5-P.P12, R6-01.B4) is the plain
  `pnpm golden:update` with no list.
- **Zone tests are per-zone** (R5-P.P3/P5a/P5e): the zone suites are one file per zone —
  `packages/core/test/behaviors/behaviors-zone-<letter>.test.ts` with its `-edge` twin,
  `test/integration/zone-<letter>-runtime.test.ts` (zones B–I; the old `-runtime-edge` pair files
  are gone — P5e folded every edge case into its zone's runtime file) and
  `test/integration/zone-<letter>-direct.test.ts` (zones B–G), and
  `test/playtest/zone-<letter>-recovery.test.ts`, beside the content-side
  `content-zone-<letter>.test.ts`. A new case for a zone goes into that zone's file, never into a
  shared pair file. (Since R5-P.P5d (`9592777`) the Playwright specs follow the same shape:
  nine `test/e2e/zone-<letter>.spec.ts` files sharing `test/e2e/zone-helpers.ts` replaced
  `zones-bc.spec.ts` and its three siblings.)
- **A zone LAND lands one commit** (`docs/v2-run/helpers/land-zone.sh`, R5-P.P1): the branch's
  sources are squashed to one commit and the derived files are regenerated on the landing base
  under the land lock — the atlas groups and pages, the zone's `--only` golden re-bless, the three
  fingerprints re-pinned with `SHMUP_FINGERPRINT_UPDATE=1`, and `pnpm docs:images`. The run then
  proves the scope (every changed `test/golden/*.replay.json` or `content/demos/*.replay.json`
  must name a stage from the `--only` list) and stamps a `Changed plates:` line — one
  `docs/images/…` path per changed plate, or `none` — into the commit body, which is what the
  post-LAND docs check reads. Exactly one of `--only <ids>` / `--all` is required; `--all` is the
  global re-bless shape, for the landings that re-record the whole set.
- **Tests run in parallel** ([build-test-deploy.md](build-test-deploy.md#test-concurrency)):
  every Vitest file in its own forked worker, every Playwright test in its own browser context,
  in any order — a test never depends on another test or file having run first, and never
  writes to a fixed path another test reads (use a temp dir). A Playwright file whose tests
  truly must share state says so with `test.describe.configure({ mode: 'serial' })`; none does
  today.
- **A wrong-depth relative import in a test file is a `pnpm typecheck` catch, not a test-run
  catch** (wave 3's FIX5): Vitest can resolve such a specifier root-anchored at the project root
  and load it green, while importer-anchored resolution — the shipped truth — fails. Only the
  root `tsc` passes (`typecheck:root`: `tsconfig.json` and `test/tsconfig.json`) see it, so a
  landing battery without `pnpm typecheck` is incomplete.
- **Vitest flags come after the file filter**: `--disable-console-intercept` placed before it
  makes vitest ignore the filter and run the whole project (wave 4's FIXE mis-run: 1,959 passed /
  421 skipped / 2 failed, EXIT 1, where one file was the target) — the flag is how one prints a
  passing test's stdout, since the default reporter hides it.
- **A shared-host e2e run sets `env CI=1`** (v2.0.x era, probe4; the adjudication upstream at
  `7ee20a07`): `vite preview` with `reuseExistingServer: !ci` *silently joins* a sibling lane's
  server squatting the port — the HELP twin walked the web build it did not name and read its
  verdicts off the wrong bundle. Outside CI a run does not know a squat from its own server;
  with `CI=1` preview refuses the occupied port and the collision fails loud. Two suites on one
  host share nothing but this law.
- **An art round owes `pnpm docs:images --check`** (R6-03.D6.FIX1 `88a92797`): `docs/images/`
  is derived from the atlas by `scripts/doc-images.mjs`, whose `--check` exits 1 on any stale
  plate; the taste round moved sprites and the plates went stale un-noticed until the FIX1
  re-render. A step that moves a sprite includes the plates check in its gates the same way it
  includes the pipeline floors below.
- **Band/layer/census-moving steps owe the shared-kit gates** (R5-10.T3): a step that adds a
  parallax band kind, moves a `LayerId` census or changes an upscaled-pool floor includes
  `test/scripts/assets` — the `interim-pipeline.test.ts` floor in particular — and
  `test/integration/render-groups.test.ts` in its gate set, the lesson and mechanism the
  `c86ad478` / `59d14ed8` commit bodies carry.
- **The frame-path DOM-free law is a machine check, not prose** (plan v20x P1-7; the 2026-10-27
  DOM-rules lane's §8.5 measurement): `test/integration/frame-path-dom-free.test.ts` parses every
  package's and app's `src/` from disk (core excepted — the purity lint owns it) and freezes the
  conclusion that shipped code reaches the page only at pinned **cold** sites. The family: the
  DOM methods (creation/query, attributes, the node-graph mutators — counted where **called**),
  the DOM fields (`style`, `dataset`, node-graph companions, the document surface — counted on
  any reach) and `new Image()` / `new Audio()`. Each hit is pinned in a rot-proof `ALLOWED` by
  file, symbol path, API and count — an entry that grows, shrinks or dies fails like an unlisted
  touch — and the per-frame body's own ban derives the callback's name from the boot's AST (the
  `startFrameLoop(win, callback)` call), so a rename moves the ban and a changed call shape reds
  the gate instead of going vacuous. Print the live surface with `SHMUP_DOM_FREE_PRINT=1` to
  write entries; a new touch moves off the frame path or joins the list with its cold reason.
- **The layout-inquiry law is a hard zero** (plan v20x P1-7, §8.5 again; the same lane's
  layout-queries report): `test/integration/layout-inquiry.test.ts` scans the shipped trees (core
  included) for `getBoundingClientRect` / `getClientRects`, the `offset*` / `client*` / `scroll*`
  fields and `getComputedStyle` — every read of them forces a synchronous style/layout flush on
  the frame thread — with **no allow-list**, because the measurement found no first-party site to
  write. Comments are stripped, so naming the family in prose cannot offend; dependency
  residuals (Pixi's per-pointermove rect read, closed on the TVs by P0-5's `eventFeatures` off)
  are `dep-grep-floor.test.ts`'s and the bundle greps' ground, not this file's.
- **Allocation guards** run in the shared worker pool, next to everything else: the guard lands
  V8's background compiles before every round it measures and leaves compiled code out of its
  count, so the full suite's load no longer shows in its result
  ([build-test-deploy.md](build-test-deploy.md#test-concurrency)). A guard that fails only under
  load is too close to its steady state — follow the guard rules under
  [Performance](#performance-zero-allocation-in-hot-paths) (warm-up, windows, `settled`), never
  the budget.
- **Fixture stages fly in over one playfield** (R2-01, lane A3): a fixture stage the ship flies into
  is one playfield tall — `rowsTall: PLAYFIELD_H / tile` — and its map is `length + PLAYFIELD_W`
  wide; the fly-in row is `SPAWN_Y = PLAYFIELD_H / 2`, and the ground snap searches from there.
  Off-screen and cull positions derive from `PLAYFIELD_W` / `PLAYFIELD_H` plus
  `SHOT_CULL_MARGIN` / `ITEM_CULL_MARGIN` / `DEFAULT_BLOCK_SCREEN_X`, never from a literal frame
  number. A heightfield floor reaches its `base` only after `base / tile` columns of ramp — a
  fixture that wants flat ground at `base` must leave the ramp room. And tile-row ↔ pixel
  conversions inside a test read the content's own tile size (`map.tileSize`,
  `tileset.tileSize`), not `TILE_SIZE`: since R2-02's port the shipped content is at `TILE_SIZE`
  (12) like the code, but the loader still accepts 8 or 12 (`MIN_TILE_SIZE` / `MAX_TILE_SIZE`), so
  a fixture may sit at either and a test that mixes the two is wrong at one of them.
- **Browser specs count the game's ticks, never rAF frames or wall seconds** (the rule C5 wrote
  into `test/e2e/ticks.ts`). The loop runs up to 4 ticks a frame under load, so a count of rAF
  frames or a wall timeout is a different number of game ticks on every machine; a spec waiting
  for something the game does after ticks counts `window.__shmupDebug.tick` through the shared
  helpers — `expectScene` for a scene that opens after a delay or a lock (the delay's mirror plus
  `SCENE_SLACK_TICKS`), `pollTicks` for any other tick-reached state, `waitTicks` for a pause or a
  held key, `tap` / `remoteTap` for a press, and a key sequence the host times in milliseconds
  (the TV unlock) goes in one `page.evaluate` (`remoteSequence`). The delay mirrors
  (`STAGE_CLEAR_DELAY_TICKS` 90, `MAP_LAUNCH_TICKS` 60, `SHIP_ENTER_TICKS` 40 — the content's
  longest fly-in — …) are pinned to core and the content by
  `test/integration/e2e-ticks.test.ts`; only `SCENE_SLACK_TICKS` and `BOOT_TIMEOUT_MS` are the
  specs' own. Waits for real-time work stay wall time — the boot (`BOOT_TIMEOUT_MS`), audio
  rendered and started, a screenshot captured and decoded, a console line — and a spec's own
  timeout is wall time sized for a slow runner (the campaign-run test allows 420 s). A wait stays
  in rAF frames only where no ticks run (a frozen sim, a hidden page), where a tick wait would
  hang instead of failing (before a "ticks advance" check), or where it waits for drawn frames (a
  renderer re-fit, a picture); each such spec says why in its docblock. A spec that freezes the
  sim steps it with `test/e2e/frame-advance.ts` (`freezeSim`, `stepTo`) — two captures a known
  number of ticks apart land on exact ticks. A flake repeat runs with `--retries=0`.
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
| Shipped content and the examples validate with zero issues; files are named `<folder>/<name>.<kind>.json`; README samples still match the schema | `pnpm content:check` (`test/integration/content.test.ts` + the nine `content-zone-<letter>.test.ts` files, one per zone — what each zone's files must produce is pinned by `test/integration/zones/zone-<letter>.contract.ts` with a per-zone `remastered` flag the R5 zone lanes flip, meta-checked by `zones/contract.test.ts`) |
| Content refers to other content, sprites, scripts and cues by string id declared with `s.ref(kind)`; systems read the resolved `<field>Id`, never the string | review; [content-data.md](content-data.md) |
| A bare array or record of references is not allowed — wrap each id in an object | `s.array` / `s.record` throw a `TypeError` at construction |
| Every number of every content kind declares a **unit** (`s.num({ …, unit })` / `s.int(…)`, `core/data/units` `NumberUnit`), every behaviour tunable has a row in `core/behaviors/units.ts` `BEHAVIOR_PARAM_UNITS`, and a hand-made schema is an `s.custom` with its `meta` — so `scripts/content/rescale.mjs` can port the content (R1-03) | `test/integration/content-units.test.ts`, `packages/core/test/data/content-file-units.test.ts`, `behavior-param-units.test.ts`; [content-data.md](content-data.md#units-and-the-rescale-tool-r1-03) |
| Placeholder art is source data, never a hand-drawn binary: a `*.sprite.json` pixel map under `assets/source/sprites/` or a seeded generator in `scripts/assets/procedural/` (plan §1.5). PNGs there are real-art overrides only | review; [asset-pipeline.md](asset-pipeline.md) |
| `assets/source/atlas-groups.json` (which sprites pack onto a zone's own atlas pages) equals its derivation from the content — re-derive it with `SHMUP_ATLAS_GROUPS_UPDATE=1` after a content change that moves a sprite between zones, never edit it by hand (R1-05) | `test/integration/atlas-groups.test.ts`; [asset-pipeline.md](asset-pipeline.md#atlas-groups-r1-05) |
| v2 art lives **beside** v1, never in its place: a `<path>.v2.sprite.json` is the v2 pixel map of `<path>` (`native` implied) and a `native: true` font the v2 font of its name, and a generator's v2 art is a branch in its `generate()`; all are taken when `(options.artScale ?? 1) !== 1` — a call without options draws v1. The scale-1 build stays v1 (there a PNG override of a code-sourced name is skipped too, so the digest pin, the TV bench, the CJK figures and the store icons never move) until a v2.0.x clean-up after the release deletes the v1 sources — decision RR-1, deferred from R6-03 (R4-P.P3) | `test/scripts/assets/pipeline-v2-sources.test.ts`; the `interim-pipeline.test.ts` scale-1 digest pin — [asset-pipeline.md](asset-pipeline.md#v2-sources-beside-v1-r4-pp3) |
| A real-art PNG override (v2) comes from the ingest tool with its `<name>.art.json` provenance record, or is hand-drawn with a record of `"origin": "hand"` or a `LICENSES.md` entry; `ingest.mjs --check` re-creates every committed output byte for byte | `test/scripts/assets/provenance.test.ts`; CI's `ingest` job — [real-assets.md](real-assets.md#the-ingest-tool-art-promptsingest) |
| Every shipped tileset and stage tilemap uses `TILE_SIZE` (12 since R2-02's port); the loader accepts 8 or 12 (`MIN_TILE_SIZE` / `MAX_TILE_SIZE`) so test fixtures can use either | `test/integration/tile-size.test.ts`; `core/data` `checkTileset` |
| A sprite's name is its path below `assets/source/sprites/` (lower-case kebab segments, `/`-separated) and the file's `name` field repeats it | `scripts/assets/sprite-source.mjs` (source issue) |
| Every sprite name the shipped content uses exists in the atlas | `pnpm content:check` (`findMissingSprites`) |
| Every bullet, laser beam and bending laser sprite has a `<sprite>@<palette>` variant for each colour-blind palette (`BULLET_PALETTES` other than `standard`), frame for frame — a real-art override of one needs its variants too (M2-02) | `pnpm content:check` |
| Bullet patterns are data: expressions are parsed by the DSL's own compiler at load (no `eval` / `new Function`), every `patterns` action a shipped enemy names compiles, and zone speeds follow the 4-way rules like hand-written behaviours | `pnpm content:check`; [pattern-dsl.md](pattern-dsl.md) |
| Every `script` id names a registered behaviour (`KNOWN_SCRIPT_IDS`), every enemy `params` name a tunable of its behaviour, every spawner a `child` | `pnpm content:check` and the shell's boot (`knownScripts`, `checkEnemyBehaviors`) |
| Procedural generators seed from the sprite name (`seedOf`) and use only exactly rounded maths (no `Math.sin`/`cos`), so the atlas is byte-identical on every machine | review; `test/scripts/assets/pipeline*.test.ts` (byte-identical runs) |
| A shipped zone is playable with four directions (`shmup_feat.md` §4 rule 2, D17): no aimed bullet over 2.0 px/tick on Normal, no two simultaneous laser lanes leaving under 16 px of gap (lanes widened by the ship's hurt radius), ≥ 3 capsule sources within 900 px after every checkpoint (§10 — the three numbers are v1 baselines; `test/playtest/rules.ts` holds each as × `WORLD_SCALE` since R2-02's port); the terrain leaves a flyable corridor of ≥ 48 open px in every column the camera shows, and since the zone-F punch-seal adjudication a full-mask destructible cell — one the tileset gives `hp` — counts as open there, a corridor the gun opens (w11-MF5 `a0abbf0a`); the 4-way playtest bot clears it in god mode | `pnpm content:check` (`content-zone-a.test.ts` and its eight zone siblings, split out of the old zone A block of `content.test.ts`; the rules in `test/playtest/rules.ts`), `test/playtest/`, the corridor rule in `test/integration/stage-runtime.test.ts` — [zone-a-and-playtest.md](zone-a-and-playtest.md#the-4-way-design-rules) |
| Every label the canvas UI draws is a UI string id (`core/ui/strings.ts` `DEFAULT_UI_TEXT`, read through `SceneFlow.text` / the builders' `text` argument), never an upper-case literal in the scenes or the UI kit; `content/strings/en.strings.json` equals the built-in table; a `strings` file uses known ids and the bitmap font's glyphs only (M2-16) | `packages/core/test/ui/ui-strings.test.ts` (source scan), `pnpm content:check` (`test/integration/content.test.ts`), the loader — [options-rebinding-and-accessibility.md](options-rebinding-and-accessibility.md#the-string-table-coreuistringsts-content-kind-strings) |
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
