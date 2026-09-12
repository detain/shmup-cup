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
├── turbo.json              task graph: build (^build + //#assets → dist/**), typecheck/lint/test (via "transit"), dev, clean, root tasks; globalDependencies incl. content/** types/** assets/source/**
├── tsconfig.base.json      strict compiler options shared by everything (ES2018 target/lib, NodeNext, @shmup/source)
├── tsconfig.tooling.json   Node-side base (tests, Vite/Vitest configs): ES2023 + DOM + node types, noEmit, allowJs (JSDoc-typed scripts/*.mjs)
├── tsconfig.json           type-checks repo-root tooling files
├── eslint.config.js        flat config: typescript-eslint (type-aware), compat (chrome >= 69), jsdoc, core purity rules
├── vite.shared.ts          @shmup/source resolve conditions shared by Vite + Vitest; shmupContent() → virtual:shmup-content; shmupAssets() → virtual:shmup-assets + dist/assets/atlas/
├── vitest.shared.ts        defineShmupProject(): per-project Vitest defaults (tests in test/, Node env, optional worker execArgv such as --expose-gc)
├── vitest.config.ts        Vitest *projects*: packages/*, apps/*, test (→ `pnpm test:all`)
├── .browserslistrc         chrome >= 69 (Tizen 5.5) for eslint-plugin-compat
├── .editorconfig  .prettierrc.json  .prettierignore  .nvmrc (Node 24)  .gitignore
├── .github/workflows/ci.yml   install (frozen) → lint → typecheck → test → build; job e2e (Playwright Chromium → pnpm test:e2e); ELECTRON_SKIP_BINARY_DOWNLOAD=1
│
├── packages/               reusable libraries (the "engine + game")
│   ├── core/               @shmup/core — PURE TS: no DOM/WebGL/audio/Node/platform APIs, no clocks, no Math.random
│   │   ├── src/
│   │   │   ├── index.ts        public API (implemented parts only)
│   │   │   ├── module-info.ts  ModuleInfo / defineModule
│   │   │   ├── platform/       ✔ Platform interface (tech §3.2), headless platform, memory storage
│   │   │   ├── input/          ✔ Action bits, InputSnapshot, edge latching (feat §4)
│   │   │   ├── config/         ✔ GameConfig + defaults + validation
│   │   │   ├── loop/           ✔ fixed-step accumulator (snap, cap, reset)
│   │   │   ├── game/           ✔ createGame(): composition root, suspend/resume, hosts the World
│   │   │   ├── world/          ✔ createWorld / stepWorld: session state + the fixed 9-phase tick pipeline (plan §3.2), pool registry, view
│   │   │   ├── presentation/   ✔ IRenderer / IAudio contracts + the render contract (RenderFrame, WorldView, SpriteBatchView, DrawList, LayerId)
│   │   │   ├── rng/ math/ events/ pools/                 ✔ engine foundations (sfc32, trig tables, event ring, SoA pools)
│   │   │   ├── data/           ✔ (partial) content loader: schema.ts combinators, loadContent(), ContentDb, migrations, tilemap.ts (tileset tables, heightfield / RLE expansion), paths.ts (spline → arc-length tables)
│   │   │   ├── player/         ✔ (partial) KESTREL movement, speed levels, clamp, banking, fly-in (death/respawn: M1-12)
│   │   │   ├── weapons/        ✔ (partial) player shots (96-slot SoA pool), Type A roles from content, loadouts, autofire + caps per shooter, grid hits (Type B–D / Direct: M2)
│   │   │   ├── options/        ✔ (partial) trailing Options: screen-space trail ring buffer (Snake / Formation / Rotate: M2-04)
│   │   │   ├── powerups/       ✔ (partial) 7-slot power meter, equip on the PowerUp edge, Auto Power-Up, capsule pool + magnet, Mega Crash (Direct mode: M2-05)
│   │   │   ├── shields/        ✔ (partial) the Force Field on every ship: hits, shield-hit i-frames, wear, never terrain (pods, Arm tiers: M2-04 / M2-05)
│   │   │   ├── enemies/        ✔ (partial) 64 enemy slots: spawns, formations, off-screen rules, contact, damage, sprite mirror
│   │   │   ├── patterns/       ✔ (partial) sleeping behaviour coroutines (runner) + per-tick movers + fire primitives (DSL: M2-02)
│   │   │   ├── behaviors/      ✔ (partial) behaviour registry referenced by content script ids; the M1 roster
│   │   │   ├── bullets/        ✔ enemy bullets (512-slot SoA pool = the ENEMY_BULLETS batch) + telegraphed lasers, player collision, cancel
│   │   │   ├── bosses/                                     enemy-side system (placeholder)
│   │   │   ├── collision/      ✔ (partial) scalar shape tests, layer masks, counting-sort uniform grid, pixel-exact terrain queries
│   │   │   ├── stage/          ✔ stage runtime: camera keys / ramps / pans / locks, event cursor, checkpoints, terrain map + parallax / terrain views
│   │   │   ├── rank/           ✔ (partial) constant rank from the difficulty, rankScale curves (growth: M2-01)
│   │   │   ├── scoring/ fx/                                rules & feel (placeholders)
│   │   │   ├── scenes/ ui/                                 flow & canvas UI model (placeholders)
│   │   │   ├── debug/          ✔ (partial) hashWorld state hash, debug flags (controls: M1-19)
│   │   │   └── replay/ save/                               meta & tooling (placeholders)
│   │   ├── test/<module>/  one folder per module + index.test.ts (module tree invariants); test/helpers/alloc.ts = allocation guard (measureHeapGrowth)
│   │   ├── tsconfig.json   src only, lib ES2018, no types (purity)
│   │   ├── tsconfig.build.json  emits dist/ (customConditions off)
│   │   └── test/tsconfig.json   Node-side program for tests
│   ├── render-pixi/        @shmup/render-pixi — PixiJS v8 IRenderer: WebGL1-first, 384×216 RT, integer upscale
│   │   └── src/ renderer ✔ viewport ✔ test-pattern ✔ palette ✔ atlas ✔ layers ✔ (+ terrain grid, parallax bands, laser sprites) sprites ✔ text ✔ ui ✔ · particles effects debug (placeholders)
│   ├── audio-web/          @shmup/audio-web — Web Audio IAudio: interactive latency, buses, suspend/resume
│   │   └── src/ web-audio ✔ · sfx music loader (placeholders)
│   ├── input-web/          @shmup/input-web — keyboard/remote + Gamepad API → InputSnapshot
│   │   └── src/ keymap ✔ keyboard ✔ gamepad ✔ web-input ✔ remote ✔ (debounce, diagonal/SOCD policies) rebind ✔ (partial: input profiles, game/menu tables, profile choice)
│   └── shell/              @shmup/shell — shared browser host of apps/web + apps/tizen (decision D34)
│       └── src/ boot ✔ loader ✔ dispatch ✔ error-screen ✔ frame-loop ✔ flight ✔ (default scene: free flight) showcase ✔
│
├── apps/                   deployable hosts (thin adapters around the packages)
│   ├── web/                @shmup/web — Vite dev app (HMR), browser Platform; also Electron's renderer
│   │   └── src/ main.ts · boot ✔ platform ✔
│   ├── tizen/              @shmup/tizen — Samsung TV .wgt (Tizen 5.5+, Chromium 69)
│   │   ├── public/         config.xml (tv-samsung, tv.inputdevice + internet), icon.png → copied to dist/
│   │   ├── polyfills/      global-this.js (ES5, prepended to app.js)
│   │   ├── scripts/        check-bundle.mjs (one classic ES2018 script) · tizen-package/install/run.mjs (env-driven, Windows-friendly)
│   │   ├── vite.config.ts  target chrome69+es2018, IIFE, no code splitting, classic <script defer>
│   │   └── src/ main.ts · boot ✔ platform ✔ (keys, Back 10009, visibility, exit) · device-info live-reload (placeholders)
│   └── electron/           @shmup/electron — desktop shell; compiles in CI, binary never downloaded there
│       ├── scripts/        copy-renderer.mjs (apps/web/dist → dist/renderer)
│       └── src/ main/ (main.ts, app-protocol.ts, window-options.ts ✔ · saves.ts steam.ts placeholders) · preload/preload.cts · shared/ipc.ts
│
├── content/                game DATA (JSON, formatVersion 1, validated at load by core/data ✔)
│   ├── player/             ✔ one file per ship: speed levels, hitboxes, margins, timers (+ README, example)
│   ├── stages/             ✔ one file per stage: music, camera path, checkpoints, parallax, tilemap (heightfield / RLE), event timeline; test-range (+ README, example)
│   ├── tilesets/           ✔ terrain tilesets: per tile collision type, column-height mask, atlas frame (+ README, example)
│   ├── enemies/            ✔ enemy definitions: hp, score, hurtbox, behaviour script + tunables, mover, ground anchor, drop, child; test-range roster (+ README, example)
│   ├── paths/              ✔ movement paths: spline control points, baked to arc-length tables at load (+ README, example)
│   ├── weapons/            ✔ weapon tunables + preset loadouts: the Type A arsenal the game fires (+ README, example)
│   └── input/              ✔ input profiles (kind input-profiles, validated by input-web rebind): per-context key/button tables, remote debounce/diagonal/SOCD, Tizen keys to register
├── assets/
│   ├── source/             editable sources — in git: sprites/**/*.sprite.json pixel maps (+ real-art PNG overrides), fonts/*.font.json, tilesets, audio
│   └── generated/          pipeline output (atlas/main.png + main.json, cache) — ignored
├── scripts/                repo-level Node scripts: clean.mjs, generate-assets.mjs (pnpm assets) + assets/ (PNG encoder, sprite sources, procedural generators, packer, font), gen-trig-tables.mjs
├── types/                  ambient declarations for the Vite virtual modules (virtual:shmup-content, virtual:shmup-assets)
├── test/                   cross-package integration tests (Vitest project "integration", part of `pnpm test`); e2e/ = Playwright browser smoke tests (`pnpm test:e2e`)
├── docs/
│   ├── client/             player/tester docs
│   └── dev/                contributor docs (this file, architecture, engine-foundations, content-data, asset-pipeline, rendering-and-shell, sim-world, stage-runtime, enemies-and-behaviors, api-reference, …)
├── tools/                  standalone tools, NOT workspace members (own package.json/lockfile, npm not pnpm)
│   └── input-probe/        Tizen diagnostic .wgt: remote/gamepad/display measurements (see input-probe.md)
└── shmup_feat.md  shmup_tech.md  input_probe_spec.md  README.md  LICENSE (MPL-2.0)
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
allows the shell to import render-pixi, audio-web and input-web; today it imports render-pixi,
input-web (only to validate the `input-profiles` content by default, M1-05) and core — the
input and audio adapters themselves arrive as interfaces. Guide:
[rendering-and-shell.md](rendering-and-shell.md).

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
pnpm test:e2e           # build web + tizen, then browser smoke tests (headless Chromium, Playwright)
pnpm --filter @shmup/tizen build    # TV bundle + bundle check
pnpm content:check      # validate content/ against the core schemas (+ sprite names exist in the atlas)
pnpm assets             # regenerate the placeholder atlas (skipped when nothing changed)
pnpm clean              # remove dist/ coverage/ .turbo/ everywhere
```

More: [build-test-deploy.md](build-test-deploy.md) (every script, TV deployment, CI,
troubleshooting), [architecture.md](architecture.md) (how the pieces work together at
runtime), [content-data.md](content-data.md) (game data and its loader),
[asset-pipeline.md](asset-pipeline.md) (placeholder art → atlas),
[rendering-and-shell.md](rendering-and-shell.md) (render contract, renderer, shared boot,
`pnpm test:e2e`), [sim-world.md](sim-world.md) (the World and its tick),
[stage-runtime.md](stage-runtime.md) (scrolling stages, terrain, parallax),
[api-reference.md](api-reference.md) and [conventions.md](conventions.md).
