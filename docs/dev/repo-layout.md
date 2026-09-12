# Repository layout

Shmup Cup is a **pnpm workspace monorepo** orchestrated by **Turborepo**
(`shmup_tech.md` §3.1). Workspace members are `packages/*` and `apps/*` only — `tools/*`
holds standalone npm projects (own lockfile) and is deliberately outside the workspace.

Every workspace project has the same shape: `package.json`, `tsconfig.json` (runtime
sources), `README.md`, `src/` and a **separate `test/`** folder (tests never sit next to
sources). Each planned system is a directory `src/<module>/index.ts` whose docblock states
its responsibility, the spec sections it implements and its intended public API, and which
exports a `moduleInfo` descriptor (`status: 'placeholder' | 'partial' | 'implemented'`).
`test/<module>/` mirrors it with at least a smoke test.

## Annotated tree

```text
shmup-cup/
├── package.json            root scripts (dev/build/typecheck/lint/test/format/clean), packageManager pnpm@12, engines/devEngines (Node floor)
├── pnpm-workspace.yaml     members packages/* + apps/* (NOT tools/*), version catalog, allowed build scripts
├── pnpm-lock.yaml          committed; CI installs with --frozen-lockfile
├── turbo.json              task graph: build, build:test, build:dev (^build + //#assets → dist/**), typecheck/lint/test (via "transit"), dev, clean, root tasks; globalDependencies incl. content/** types/** assets/source/**
├── tsconfig.base.json      strict compiler options shared by everything (ES2018 target/lib, NodeNext, @shmup/source)
├── tsconfig.tooling.json   Node-side base (tests, Vite/Vitest configs): ES2023 + DOM + node types, noEmit, allowJs (JSDoc-typed scripts/*.mjs)
├── tsconfig.json           type-checks repo-root tooling files
├── eslint.config.js        flat config: typescript-eslint (type-aware), compat (chrome >= 69), jsdoc, core purity rules
├── vite.shared.ts          @shmup/source resolve conditions shared by Vite + Vitest; shmupContent() → virtual:shmup-content; shmupAssets() → virtual:shmup-assets + dist/assets/atlas/; shmupBuildInfo() → __SHMUP_DEV__ / __SHMUP_BUILD__ (M1-19)
├── vitest.shared.ts        defineShmupProject(): per-project Vitest defaults (tests in test/, Node env, optional worker execArgv such as --expose-gc)
├── vitest.config.ts        Vitest *projects*: packages/*, apps/*, test (→ `pnpm test:all`)
├── .browserslistrc         chrome >= 69 (Tizen 5.5) for eslint-plugin-compat
├── .editorconfig  .prettierrc.json  .prettierignore  .nvmrc (Node 24)  .gitignore
├── .github/workflows/ci.yml   install (frozen) → lint → typecheck → test (golden replays) → build (Tizen budgets) → bench; job e2e (Playwright Chromium → pnpm test:e2e on the test builds); ELECTRON_SKIP_BINARY_DOWNLOAD=1
│
├── packages/               reusable libraries (the "engine + game")
│   ├── core/               @shmup/core — PURE TS: no DOM/WebGL/audio/Node/platform APIs, no clocks, no Math.random
│   │   ├── src/
│   │   │   ├── index.ts        public API (implemented parts only)
│   │   │   ├── module-info.ts  ModuleInfo / defineModule
│   │   │   ├── platform/       ✔ Platform interface (tech §3.2), headless platform, memory storage
│   │   │   ├── input/          ✔ Action bits, InputSnapshot, edge latching (feat §4)
│   │   │   ├── config/         ✔ GameConfig + defaults + validation; difficulty presets (DEFAULT_DIFFICULTY_TABLE, withDifficulty — M2-01); UserOptions (volumes, input profile — M1-17)
│   │   │   ├── loop/           ✔ fixed-step accumulator (snap, cap, reset)
│   │   │   ├── game/           ✔ createGame(): composition root, suspend/resume; bare gameplay (one World) or the scene flow (options.scenes, M1-16)
│   │   │   ├── world/          ✔ createWorld / stepWorld: session state + the fixed 9-phase tick pipeline (plan §3.2), pool registry, view
│   │   │   ├── presentation/   ✔ IRenderer / IAudio contracts + the render contract (RenderFrame, WorldView, SpriteBatchView, DrawList, LayerId)
│   │   │   ├── rng/ math/ events/ pools/                 ✔ engine foundations (sfc32, trig tables, event ring, SoA pools)
│   │   │   ├── data/           ✔ (partial) content loader: schema.ts combinators, loadContent(), ContentDb, migrations, tilemap.ts (tileset tables, heightfield / RLE expansion), paths.ts (spline → arc-length tables)
│   │   │   ├── player/         ✔ KESTREL movement, speed levels, clamp, banking, fly-in, life cycle (killPlayer / respawnPlayer / playerOut)
│   │   │   ├── weapons/        ✔ (partial) player shots (96-slot SoA pool), Type A roles from content, loadouts, autofire + caps per shooter, grid hits (Type B–D / Direct: M2)
│   │   │   ├── options/        ✔ (partial) trailing Options: screen-space trail ring buffer (Snake / Formation / Rotate: M2-04)
│   │   │   ├── powerups/       ✔ (partial) 7-slot power meter, equip on the PowerUp edge, Auto Power-Up, capsule pool + magnet, Mega Crash (Direct mode: M2-05)
│   │   │   ├── shields/        ✔ (partial) the Force Field on every ship: hits, shield-hit i-frames, wear, never terrain (pods, Arm tiers: M2-04 / M2-05)
│   │   │   ├── enemies/        ✔ (partial) 64 enemy slots: spawns, formations, off-screen rules, contact, damage, sprite mirror
│   │   │   ├── patterns/       ✔ (partial) sleeping behaviour coroutines (runner) + per-tick movers + fire primitives (DSL: M2-02)
│   │   │   ├── behaviors/      ✔ (partial) behaviour registry referenced by content script ids; the M1 roster
│   │   │   ├── bullets/        ✔ enemy bullets (512-slot SoA pool = the ENEMY_BULLETS batch) + telegraphed lasers, player collision, cancel
│   │   │   ├── bosses/         ✔ (partial) multi-part bosses: weak points, phases, the WARNING, the death sequence (mid-bosses, raids: M2-09)
│   │   │   ├── collision/      ✔ (partial) scalar shape tests, layer masks, counting-sort uniform grid, pixel-exact terrain queries
│   │   │   ├── stage/          ✔ stage runtime: camera keys / ramps / pans / locks, event cursor, checkpoints, terrain map + parallax / terrain views
│   │   │   ├── rank/           ✔ rank 0–31 (difficulty base + growth × stage / loop / power terms, 16 on loop 1), rankScale curves, per-enemy sensitivity (M2-01)
│   │   │   ├── scoring/        ✔ (partial) per-player scores (clamp 99,999,990), session hi-score, crediting kills / bonuses / capsules, extends (cap 9) and the continue digit (M2-01; 1UP items: M2-05)
│   │   │   ├── fx/             ✔ (partial) hit-stop / shake / flash requests + timers (FxState), exact hit-stop (slowdown: M3-02)
│   │   │   ├── scenes/         ✔ (partial) scene stack (depth 8, deferred transitions) + the M1 flow: boot → title → difficulty menu (M2-01) → game ⇄ pause → stage clear / continue countdown (M2-01) / game over, YES / NO dialog (Tizen exit confirm), Options overlay (M1-17)
│   │   │   ├── ui/             ✔ (partial) canvas UI kit (list menu, slider, toggle, choice, confirm; 18/6-tick auto-repeat, 4-tick Confirm buffer; draw builders) + the HUD (buildHud, rebuilt only on change)
│   │   │   ├── debug/          ✔ hashWorld state hash, debug switches + controls (god mode, outlines, frame advance, slow-mo, checkpoint jump, stage skip), overlay counters (M1-19)
│   │   │   ├── save/           ✔ versioned save (save.v1): options, hi-score tables, stats; migrations, defensive parsing, SaveStore (writes only on change) — M1-17
│   │   │   └── replay/         ✔ replays: header, per-tick input recorder, playback + desync report, RLE/varint/base64 JSON format (M1-19)
│   │   ├── test/<module>/  one folder per module + index.test.ts (module tree invariants); test/helpers/alloc.ts = allocation guard (measureHeapGrowth)
│   │   ├── tsconfig.json   src only, lib ES2018, no types (purity)
│   │   ├── tsconfig.build.json  emits dist/ (customConditions off)
│   │   └── test/tsconfig.json   Node-side program for tests
│   ├── render-pixi/        @shmup/render-pixi — PixiJS v8 IRenderer: WebGL1-first, 384×216 RT, integer upscale
│   │   └── src/ renderer ✔ viewport ✔ test-pattern ✔ palette ✔ atlas ✔ layers ✔ (+ terrain grid, parallax bands, laser sprites) sprites ✔ text ✔ ui ✔ particles ✔ (fx content owner, 256-particle pool) effects ✔ (partial: shake, flash + limiter, dim, score popups) debug ✔ (overlay: panel, frame graph, hitbox / grid outlines — M1-19)
│   ├── audio-web/          @shmup/audio-web — Web Audio IAudio (interactive latency, buses, suspend/resume) + the game's audio
│   │   └── src/ web-audio ✔ synth ✔ (deterministic PCM: ZzFX-style SFX, chip songs with sample-exact loops) sfx ✔ (voice manager) music ✔ (loop, fades, ducking) loader ✔ (sfx / music kinds, OGG path) engine ✔
│   ├── input-web/          @shmup/input-web — keyboard/remote + Gamepad API → InputSnapshot
│   │   └── src/ keymap ✔ keyboard ✔ gamepad ✔ web-input ✔ remote ✔ (debounce, diagonal/SOCD policies) rebind ✔ (partial: input profiles, game/menu tables, profile choice)
│   └── shell/              @shmup/shell — shared browser host of apps/web + apps/tizen (decision D34)
│       └── src/ boot ✔ loader ✔ dispatch ✔ (+ connectFxEvents, connectAudioEvents, connectOptionEvents / applyAudioOptions — M1-17) error-screen ✔ frame-loop ✔ scene-view ✔ (default scene: the scene flow, M1-16) flight ✔ (?scene=flight: free flight) showcase ✔ fx-gallery ✔ (?scene=fx-gallery) debug ✔ (dev / test builds: F1–F8, the TV's Pause + Ch+ ×3 unlock, per-frame timing, window.__shmupDebug — M1-19)
│
├── apps/                   deployable hosts (thin adapters around the packages)
│   ├── web/                @shmup/web — Vite dev app (HMR), browser Platform; also Electron's renderer
│   │   └── src/ main.ts · boot ✔ platform ✔
│   ├── tizen/              @shmup/tizen — Samsung TV .wgt (Tizen 5.5+, Chromium 69)
│   │   ├── public/         config.xml (tv-samsung, tv.inputdevice + internet), icon.png → copied to dist/
│   │   ├── polyfills/      global-this.js (ES5, prepended to app.js)
│   │   ├── scripts/        check-bundle.mjs (one classic ES2018 script + size budgets) · tizen-package/install/run.mjs (env-driven, Windows-friendly)
│   │   ├── vite.config.ts  target chrome69+es2018, IIFE, no code splitting, classic <script defer>
│   │   └── src/ main.ts · boot ✔ (Back exits only before the game runs — then the scene flow's exit confirmation; tizenDebugTools in dev / test builds) platform ✔ (keys, Back 10009, visibility, exit) · device-info live-reload (placeholders)
│   └── electron/           @shmup/electron — desktop shell; compiles in CI, binary never downloaded there
│       ├── scripts/        copy-renderer.mjs (apps/web/dist → dist/renderer)
│       └── src/ main/ (main.ts, app-protocol.ts, window-options.ts ✔ · saves.ts steam.ts placeholders) · preload/preload.cts · shared/ipc.ts
│
├── content/                game DATA (JSON, formatVersion 1, validated at load by core/data ✔)
│   ├── player/             ✔ one file per ship: speed levels, hitboxes, margins, timers (+ README, example)
│   ├── stages/             ✔ one file per stage: music, camera path, checkpoints, parallax, tilemap (heightfield / RLE), event timeline; zone-a (AZURE VERGE, the game's stage — M1-18), test-range, test-boss (+ README, example)
│   ├── tilesets/           ✔ terrain tilesets: per tile collision type, column-height mask, atlas frame (+ README, example)
│   ├── enemies/            ✔ enemy definitions: hp, score, hurtbox, behaviour script + tunables, mover, ground anchor, drop, child; boss sections (parts, weak points, phases); zone A roster + HALCYON BULWARK (M1-18), test-range roster, test boss (+ README, example)
│   ├── paths/              ✔ movement paths: spline control points, baked to arc-length tables at load; zone A's fan / orbit curves, test-range's (+ README, example)
│   ├── weapons/            ✔ weapon tunables + preset loadouts: the Type A arsenal the game fires (+ README, example)
│   ├── input/              ✔ input profiles (kind input-profiles, validated by input-web rebind): per-context key/button tables, remote debounce/diagonal/SOCD, Tizen keys to register
│   ├── audio/              ✔ SFX bank (kind sfx: synth parameters or a file per SFX_CUES cue) + music/ (kind music: original chip songs or OGG, bound to MUSIC_CUES), validated by audio-web loader (+ README, examples)
│   ├── rules/              ✔ game-wide rule tables (kind rules, validated by core/data): the difficulty presets Easy / Normal / Hard / Arcade — rank base / growth, lives, extends, continues, death penalty, aim directions, bullet speed (M2-01; + README, example)
│   └── fx/                 ✔ particle presets + the event cues that spawn them (kind fx, validated by render-pixi particles): explosions, debris, sparks, clinks, cancel sparkles, pickup ring, muzzle flash (+ README, example)
├── assets/
│   ├── source/             editable sources — in git: sprites/**/*.sprite.json pixel maps (+ real-art PNG overrides), fonts/*.font.json, tilesets, audio
│   └── generated/          pipeline output (atlas/main.png + main.json, cache) — ignored
├── scripts/                repo-level Node scripts: clean.mjs, generate-assets.mjs (pnpm assets) + assets/ (PNG encoder, sprite sources, procedural generators, packer, font), gen-trig-tables.mjs, audio-preview.mjs (pnpm audio:preview → WAV files), golden-update.mjs (pnpm golden:update)
├── types/                  ambient declarations for the Vite virtual modules (virtual:shmup-content, virtual:shmup-assets) and the build-info defines (build-info.d.ts: __SHMUP_DEV__, __SHMUP_BUILD__)
├── test/                   cross-package integration tests (Vitest project "integration", part of `pnpm test`); playtest/ = headless playtest harness + 4-way bot + design rules (M1-18, same project); golden/ = golden zone A replays + their test (M1-19, same project); bench/ = `pnpm bench` stress benchmark (own Vitest config, not in `pnpm test`); e2e/ = Playwright browser smoke tests (`pnpm test:e2e`)
├── docs/
│   ├── client/             player/tester docs
│   └── dev/                contributor docs (this file, architecture, engine-foundations, content-data, asset-pipeline, rendering-and-shell, sim-world, stage-runtime, enemies-and-behaviors, fx-and-game-feel, scenes-and-ui, saves-and-options, zone-a-and-playtest, debug-and-replays, api-reference, …)
├── tools/                  standalone tools, NOT workspace members (own package.json/lockfile, npm not pnpm)
│   └── input-probe/        Tizen diagnostic .wgt: remote/gamepad/display measurements (see input-probe.md)
└── shmup_feat.md  shmup_tech.md  input_probe_spec.md  shmup_plan.md  shmup_progress.md  CHANGELOG.md  README.md  LICENSE (MPL-2.0)
```

✔ = implemented or partially implemented today; everything else is a placeholder with its
API declared.

## Dependency direction

```text
apps/web ──┐
apps/tizen ├─► shell ──► render-pixi ─┐
           │    └──────────────────────┤
           ├─► audio-web ──────────────┼─► core
           └─► input-web ──────────────┘
apps/electron ─► (loads apps/web build; no package imports)
```

`@shmup/shell` (M1-04) is the shared boot path of the two browser hosts; the apps still create
their own input / audio adapters and platform and hand them to it (plan §3.1). The plan
allows the shell to import render-pixi, audio-web and input-web; today it imports all three —
render-pixi (the renderer, the `fx` owner), audio-web (the `sfx` / `music` owners and the audio
engine, M1-15 — [audio.md](audio.md)), input-web (only to validate the `input-profiles` content
by default, M1-05) — and core; the input and audio adapters themselves arrive as interfaces.
Guide: [rendering-and-shell.md](rendering-and-shell.md).

`@shmup/core` imports nothing from the workspace (lint-enforced). Presentation packages
depend only on core. Apps compose everything.

## How packages resolve each other

Each package's `exports` has a custom **`@shmup/source`** condition pointing at
`src/index.ts`, plus `types`/`default` pointing at `dist/`:

- **Dev server, app builds, tests, type-checking** use the source condition (set in
  `tsconfig.base.json` `customConditions`, and in Vite/Vitest via `vite.shared.ts`) —
  no package build needed, HMR reaches into packages.
- **`tsc` library builds** (`tsconfig.build.json`) switch the condition off and use the
  dependencies' `dist/` typings; Turborepo builds dependencies first (`^build`).

## Tooling decisions

| Area | Choice | Notes |
|---|---|---|
| Package manager | pnpm 12 (`packageManager` field), catalog for shared versions | `allowBuilds` limits install scripts to electron + esbuild |
| Node.js | `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` (`engines.node` + `devEngines.runtime`, keep them identical); `.nvmrc` = 24 | Not the spec's `>=20`: this is the intersection of the pinned toolchain's own requirements — Vitest 5 `^22.12 \|\| ^24 \|\| >=26`, Electron 44 `>=22.12`, eslint-plugin-jsdoc 64 `^22.22.2 \|\| >=24.15`, ESLint 10 `^22.13 \|\| >=24`. `devEngines.runtime.onFail: "error"` makes pnpm reject other Node versions up front instead of failing later inside a tool. Re-derive it whenever those tools are bumped |
| Orchestration | Turborepo 2 | `transit` task makes typecheck/lint/test caches depend on upstream sources without forcing builds |
| TypeScript | **6.0.x** (pinned via catalog) | TypeScript 7.0 (native) is current, but it has no JS API until 7.1 and typescript-eslint 8.x supports `typescript < 6.1`; revisit when typescript-eslint supports 7.x |
| Lint | ESLint 10 flat config + typescript-eslint (type-aware) + eslint-plugin-compat + eslint-plugin-jsdoc | compat target `chrome >= 69`; extra rules ban `.at()`, `replaceAll`, `structuredClone`, `Object.hasOwn`, `import.meta` (Tizen) |
| Tests | Vitest 5, Node environment, tests in `test/` | Vitest projects config at the root |
| Bundler | Vite 8 (Rolldown/Oxc) | Tizen: `target ['chrome69','es2018']`, IIFE, `codeSplitting: false` |
| Format | Prettier 3 (`pnpm format`, `pnpm format:check`) | research docs at the root are excluded |

## Common commands

```sh
pnpm install            # also links workspace packages
pnpm dev                # browser dev app on http://localhost:5173
pnpm lint | typecheck | test | build
pnpm test:all           # every Vitest project in one process
pnpm test:e2e           # build web + tizen test builds, then browser smoke tests (headless Chromium, Playwright)
pnpm --filter @shmup/tizen build    # TV bundle (release) + bundle check with size budgets
pnpm --filter @shmup/tizen build:dev  # TV debug build (debug tools behind Pause, Ch+ ×3) for on-device checks
pnpm golden:update      # re-bless the golden replays (intended sim changes only — say why in the commit)
pnpm bench              # stress benchmark: ms/tick and heap growth under maximum load
pnpm content:check      # validate content/ against the core schemas (+ sprite names exist in the atlas, zone A's 4-way rules)
pnpm exec vitest run --project integration test/playtest --reporter=verbose   # the headless playtest, runs printed
pnpm assets             # regenerate the placeholder atlas (skipped when nothing changed)
pnpm clean              # remove dist/ coverage/ .turbo/ everywhere
```

More: [build-test-deploy.md](build-test-deploy.md) (every script, TV deployment, CI,
troubleshooting), [architecture.md](architecture.md) (how the pieces work together at
runtime), [content-data.md](content-data.md) (game data and its loader),
[asset-pipeline.md](asset-pipeline.md) (placeholder art → atlas),
[rendering-and-shell.md](rendering-and-shell.md) (render contract, renderer, shared boot,
`pnpm test:e2e`), [sim-world.md](sim-world.md) (the World and its tick),
[scenes-and-ui.md](scenes-and-ui.md) (scenes, menus, HUD),
[saves-and-options.md](saves-and-options.md) (saves, user options, the Options screen),
[stage-runtime.md](stage-runtime.md) (scrolling stages, terrain, parallax),
[zone-a-and-playtest.md](zone-a-and-playtest.md) (zone A, its boss, the 4-way rules, the
playtest bot), [debug-and-replays.md](debug-and-replays.md) (debug tools, replays, golden
replays, the benchmark and budgets), [api-reference.md](api-reference.md) and
[conventions.md](conventions.md).
