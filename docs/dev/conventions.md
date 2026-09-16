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
- **Tests run in parallel** ([build-test-deploy.md](build-test-deploy.md#test-concurrency)):
  every Vitest file in its own forked worker, every Playwright test in its own browser context,
  in any order — a test never depends on another test or file having run first, and never
  writes to a fixed path another test reads (use a temp dir). A Playwright file whose tests
  truly must share state says so with `test.describe.configure({ mode: 'serial' })`; none does
  today.
- **Allocation guards** run in the shared worker pool, next to everything else: the guard lands
  V8's background compiles before every round it measures and leaves compiled code out of its
  count, so the full suite's load no longer shows in its result
  ([build-test-deploy.md](build-test-deploy.md#test-concurrency)). A guard that fails only under
  load is too close to its steady state — follow the guard rules under
  [Performance](#performance-zero-allocation-in-hot-paths) (warm-up, windows, `settled`), never
  the budget.
- Browser specs that compare two captures a known number of ticks apart freeze the sim and step
  exact ticks (`test/e2e/frame-advance.ts` — `freezeSim`, `stepTo`); never count rAF frames, the
  loop runs 1–4 ticks per frame under load.
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
| Every bullet, laser beam and bending laser sprite has a `<sprite>@<palette>` variant for each colour-blind palette (`BULLET_PALETTES` other than `standard`), frame for frame — a real-art override of one needs its variants too (M2-02) | `pnpm content:check` |
| Bullet patterns are data: expressions are parsed by the DSL's own compiler at load (no `eval` / `new Function`), every `patterns` action a shipped enemy names compiles, and zone speeds follow the 4-way rules like hand-written behaviours | `pnpm content:check`; [pattern-dsl.md](pattern-dsl.md) |
| Every `script` id names a registered behaviour (`KNOWN_SCRIPT_IDS`), every enemy `params` name a tunable of its behaviour, every spawner a `child` | `pnpm content:check` and the shell's boot (`knownScripts`, `checkEnemyBehaviors`) |
| Procedural generators seed from the sprite name (`seedOf`) and use only exactly rounded maths (no `Math.sin`/`cos`), so the atlas is byte-identical on every machine | review; `test/scripts/assets/pipeline*.test.ts` (byte-identical runs) |
| A shipped zone is playable with four directions (`shmup_feat.md` §4 rule 2, D17): no aimed bullet over 2.0 px/tick on Normal, no two simultaneous laser lanes leaving under 16 px of gap (lanes widened by the ship's hurt radius), ≥ 3 capsule sources within 900 px after every checkpoint (§10); the 4-way playtest bot clears it in god mode | `pnpm content:check` (zone A block of `content.test.ts`), `test/playtest/` — [zone-a-and-playtest.md](zone-a-and-playtest.md#the-4-way-design-rules) |
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
