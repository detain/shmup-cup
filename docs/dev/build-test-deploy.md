# Build, test and deploy

Commands, outputs and gotchas for the pnpm + Turborepo monorepo. For *where* things live
see [repo-layout.md](repo-layout.md); for the tester-facing TV install walkthrough see
[../client/install-on-tv.md](../client/install-on-tv.md). The standalone input probe
(`tools/input-probe/`, npm) has its own guide: [input-probe.md](input-probe.md).

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | `^24.15.0 \|\| >=26` (`.nvmrc` = 24) | Within the dev toolchain's own requirements (Vitest 5, Electron 44, eslint-plugin-jsdoc 64, ESLint 10), which would also allow `^22.22.2` — but the allocation guards are calibrated on Node 24's V8 and 17 of them fail on Node 22 (V8 12.4), so Node 22 is excluded. `devEngines.runtime.onFail: "error"` makes pnpm refuse other versions up front |
| pnpm | 12.x, exactly `12.3.4` pinned in `package.json` → `packageManager` | Install with `npm i -g pnpm@latest` under the active Node |
| Git | any recent | — |
| Tizen CLI + `sdb` + Samsung certificate profile | Tizen Studio or VS Code Tizen extension | Only for packaging/installing on a TV — never needed for build or tests |

Check before anything else:

```sh
node -v    # v24.15.0 or another supported version
pnpm -v    # 12.3.4
```

## Install

```sh
pnpm install                                   # links workspace packages, downloads Electron
ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install   # skip the ~100 MB Electron binary (CI does this)
```

pnpm only runs install scripts for `electron` and `esbuild` (`allowBuilds` in
`pnpm-workspace.yaml`). If you skipped the Electron binary and later want to run the
desktop app, run `pnpm rebuild electron` without the variable set.

## Root scripts

| Command | What it runs |
|---|---|
| `pnpm dev` | `turbo run dev --filter=@shmup/web` → Vite dev server on http://localhost:5173 (also on the LAN, `host: true`) |
| `pnpm build` | `turbo run build`: packages (`tsc` → `dist/`), `apps/web` (Vite), `apps/tizen` (Vite + bundle check), `apps/electron` (`tsc` + copy of the web build) |
| `pnpm typecheck` | Every project's `tsc --noEmit` for `src/` and `test/`, plus the root tooling (`typecheck:root`) |
| `pnpm lint` | ESLint `--max-warnings=0` per project, plus root files (`lint:root`) |
| `pnpm test` | `vitest run`: every project — packages, apps and the repo-level `test/` (`integration`) — in one Vitest process with one shared worker pool ([Test concurrency](#test-concurrency)) |
| `pnpm test:all` | The same run (kept as an alias) |
| `pnpm test:integration` | Only the repo-level `test/` project |
| `pnpm test:e2e` | Browser smoke tests: `turbo run build:test` for `@shmup/web` and `@shmup/tizen` (test builds — the release code plus the debug tools and `window.__shmupDebug`, M1-19), then Playwright (`test/e2e/playwright.config.ts`) with two projects: `chromium` runs every spec in headless Chromium with SwiftShader WebGL — the web build via `vite preview` (port 4173) and the Tizen `dist/index.html` via `file://` — and `firefox` runs only the cross-engine determinism spec (`determinism.spec.ts`, M2-18) in headless Firefox; every test in parallel ([Test concurrency](#test-concurrency)). Extra arguments go to Playwright (`pnpm test:e2e --shard=1/5`, `pnpm test:e2e boss`); `--project=chromium` / `--project=firefox` runs one engine only. Needs both browsers once per machine: `pnpm exec playwright install --with-deps chromium firefox` (Chromium alone is enough for `--project=chromium`). See [rendering-and-shell.md](rendering-and-shell.md#browser-tests-pnpm-teste2e) |
| `pnpm golden:update` | Re-blesses the golden replays (`scripts/golden-update.mjs`: Vitest on `test/golden` with `SHMUP_GOLDEN_UPDATE=1` — re-records every scenario of `test/golden/golden.ts` from its bot, rewrites `test/golden/*.replay.json`, then checks them — since M2-15 also the attract demos of `test/golden/demos.ts` into `content/demos/*.replay.json`). Only for an **intended** simulation change, in the same commit, with the reason in the commit message — see [debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden) |
| `pnpm bench` | The stress benchmark (`test/bench/`, own Vitest config, `--expose-gc`): 20,000 ticks with 512 bullets, 64 enemies, the full loadout and four lasers; prints ms/tick and heap growth, fails at a median ≥ 1.0 ms/tick or ≥ 512 KB heap growth. Not part of `pnpm test`; CI runs it after the build — see [debug-and-replays.md](debug-and-replays.md#the-stress-benchmark-pnpm-bench) |
| `pnpm format` / `pnpm format:check` | Prettier write / check (research docs at the root are ignored) |
| `pnpm clean` | Removes `dist/`, `coverage/`, `.turbo/` everywhere (never `node_modules`) |
| `pnpm assets` | Placeholder asset pipeline (`scripts/generate-assets.mjs`): sprite pixel maps, procedural generators, PNG overrides and fonts → `assets/generated/atlas/main.png` + `main.json`; skipped when inputs are unchanged; `--force` rebuilds, `--out DIR` / `--source DIR` redirect, `--quiet` silences; exit 1 lists invalid sources. Also runs before every `build` / `dev` (Turborepo `//#assets`) and inside Vite builds (`shmupAssets()`). See [asset-pipeline.md](asset-pipeline.md#running-it) |
| `pnpm content:check` | Validates every JSON file under `content/` with `loadContent()` from `@shmup/core` — the shipped files and the `example.*.json` samples as two independent sets, plus the README format samples — and checks that every sprite name of the shipped content exists in the atlas; the foreign kinds go through their owners, and `content/audio/` is also checked for sound (every `SFX_CUES` cue bound, audible, unclipped, short; every song looping sample-exactly; every cue a shipped stage names prepared and bound — M1-15) (`test/integration/content.test.ts`; also part of `pnpm test`). See [content-data.md](content-data.md#commands) |
| `pnpm content:tiled <map.tmj>` | Converts a Tiled JSON map into stage content (`scripts/content/tiled-import.mjs`, M2-07): the tile layer → `tilemap.rle`, objects → events / camera keys / checkpoints / triggers / blocks / branches, polylines → a `paths` file; writes `content/stages/<id>.stage.json` (+ `content/paths/<id>.paths.json`), warnings on stderr. Options `--id ID`, `--stages DIR`, `--paths DIR`, `--print`. Run `pnpm format` and `pnpm content:check` afterwards — see [advanced-stages.md](advanced-stages.md#importing-a-tiled-map-pnpm-contenttiled) |
| `pnpm audio:preview` | Renders every synthesized SFX cue and chip song of `content/audio/` to 16-bit mono WAV files in `assets/generated/audio-preview/` (git-ignored) for listening — a looping song as intro + loop + loop so the seam can be heard — and prints each file's `pcmHash` and a song's loop points (`scripts/audio-preview.mjs`, loads `@shmup/audio-web` through Vite's `ssrLoadModule`; `--out DIR`, `--only NAME`, `--quiet`). See [audio.md](audio.md#pnpm-audiopreview) |
| `pnpm trig:tables` | Regenerates the committed `packages/core/src/math/trig-table.ts` (`scripts/gen-trig-tables.mjs`; `--check` verifies, `--out FILE` writes elsewhere). Re-run it in the same commit whenever the script changes — a test diffs the committed file |

Per project: `pnpm --filter <name> <script>`, e.g. `pnpm --filter @shmup/core test`,
`pnpm --filter @shmup/tizen build`. The two browser apps also have `build:test` (`vite build
--mode test` — what `pnpm test:e2e` builds) and `build:dev` (`--mode development` — the on-device
debug build): both are the release code plus the debug tools (`__SHMUP_DEV__` true — M1-19,
[debug-and-replays.md](debug-and-replays.md#release-builds-and-dev--test-builds)); plain `build`
never contains them. Extra arguments go to the tool:
`pnpm --filter @shmup/core test loop` runs only test files whose path contains `loop`.

## Turborepo

`turbo.json` defines the task graph:

- `build` depends on `^build` (dependencies first) and on the root task `//#assets`, and
  caches `dist/**`; so do `build:test` and `build:dev` (M1-19 — the apps' test and debug
  builds; the packages have no such script, so `^build` builds them normally).
- `//#assets` runs `pnpm assets` (inputs `assets/source/**`, `scripts/assets/**`,
  `scripts/generate-assets.mjs`; outputs `assets/generated/**`). `dev` and the `test:e2e`
  entry depend on it too (that turbo task stays unused: the root `pnpm test:e2e` script
  chains `turbo run build:test` and Playwright itself). The pipeline also runs from the
  `shmupAssets()` Vite plugin and has its own input-hash cache, so a Turborepo cache miss
  costs one hash when nothing changed ([asset-pipeline.md](asset-pipeline.md#running-it)).
- `typecheck`, `lint` and `test` depend on the no-op `transit` task, so their caches are
  invalidated by upstream *source* changes without forcing upstream builds — they read
  workspace packages from source (`@shmup/source` condition), not from `dist/`. `pnpm test`
  itself does not go through Turborepo (one Vitest process instead, see
  [Test concurrency](#test-concurrency)); the per-package `test` tasks remain for
  `pnpm turbo run test --filter=<pkg>`.
- Root tasks (`//#typecheck:root`, `//#lint:root`, `//#test:integration`) and `dev` /
  `clean` are never cached.
- `globalDependencies` (`eslint.config.js`, `tsconfig.base.json`, `.browserslistrc`,
  shared Vite/Vitest configs …) invalidate every cache when they change. They also list
  `content/**`, `types/**`, `assets/source/**` and `scripts/assets/**`: all live outside
  any package, yet the app builds inline `content/` through `virtual:shmup-content` and the
  atlas manifest through `virtual:shmup-assets`, the app tsconfigs include
  `types/virtual-modules.d.ts`, and the test tasks run real builds. Without them, editing
  only a content file or a sprite would replay a cached `dist/` with stale inlined data.
  Any new root-level input a task reads belongs here too.

A cache hit prints `cache hit, replaying logs`. To force a rerun: `pnpm turbo run build --force`.

## Build outputs

| Project | Output | Notes |
|---|---|---|
| `packages/*` | `dist/*.js` + `.d.ts` (ES2018) | `tsconfig.build.json` switches the `@shmup/source` condition off so dependents' types come from `dist/` |
| `apps/web` | `apps/web/dist/` (+ `assets/atlas/main.png`) | Vite default (modern) target, `base: './'` (relocatable — required by Electron's `app://`) |
| `apps/tizen` | `apps/tizen/dist/`: `index.html`, `app.js`, `config.xml`, `icon.png`, `assets/atlas/main.png` | Chromium 69 contract below; packaging adds a `.wgt` next to them. `build:test` / `build:dev` write the **same folder** — the last build wins, so rebuild with `build` before packaging a release |
| repo root | `assets/generated/atlas/main.png` (+ `main-1.png` …), `main.json`, `assets/generated/.asset-cache.json` | `pnpm assets` / `//#assets`; git-ignored. The app builds copy the pages and inline the manifest |
| `apps/electron` | `dist/main/*.js`, `dist/preload/preload.cjs`, `dist/renderer/` (copy of `apps/web/dist`) | Needs `@shmup/web` built first (Turborepo does it) |

## The Tizen build contract (Chromium 69)

Tizen 5.5 runs web apps in **Chromium 69** (`shmup_tech.md` §2.1). `apps/tizen/vite.config.ts`:

- `build.target: ['chrome69', 'es2018']` — syntax newer than ES2018 (`?.`, `??`, class
  fields, optional catch binding …) is lowered;
- Rolldown `format: 'iife'`, `codeSplitting: false`, `modulePreload: false`,
  `entryFileNames: 'app.js'` — **one classic script**, no ES modules (Samsung lists them
  as only partially supported);
- a `transformIndexHtml` plugin rewrites Vite's `<script type="module" crossorigin>` into
  `<script defer src="./app.js">`;
- `polyfills/global-this.js` (plain ES5; `globalThis` arrived in Chrome 71 and PixiJS
  uses it) is prepended to `app.js` as the post-minification banner.

`scripts/check-bundle.mjs` runs after every Tizen build and fails it unless dist/ has
exactly one script `app.js`, `index.html` loads it as a deferred classic script, `app.js`
**parses with acorn as an ES2018 script** and starts with the polyfill banner,
`config.xml` / `icon.png` are present, every other file lives under `dist/assets/`
(the atlas pages — anything else would be packaged into the `.wgt` by accident), and at
least one atlas page exists under `dist/assets/atlas/` (without it the widget can only show
the boot error screen), and — since M1-19 — the **budgets** hold: `app.js` ≤ 384 KB gzipped
(`APP_JS_GZIP_BUDGET`; 350 KB until M2-16), every atlas page a readable PNG of at most 2048² (`ATLAS_PAGE_MAX_SIZE`),
the whole `dist/` ≤ 8 MB (`DIST_BUDGET`). The OK line prints the sizes against them
(M1-19: `app.js` 773.6 KB, 228.6 KB gzipped; `dist/` 812.4 KB; after M2-11 `app.js` is 307.5 KB
gzipped, after M2-12 313.5 KB, after M2-13 320.3 KB, after M2-14 331.5 KB and after M2-15
**343.8 KB** — the content of every zone is inlined, each pair of zones adds ≈ 6–11 KB; all nine
zones and the endings are in: [zones-h-and-i.md](zones-h-and-i.md#bundle-budget); M2-15's front
end added ~9 KB of scene code and ~3 KB of demos —
[front-end-and-attract.md](front-end-and-attract.md#budgets-string-slots-and-the-bundle); after
M2-16 **≈ 359 KB** — the two UI string tables ≈ 6 KB, the Options pages and the rebinding ≈ 9 KB —,
so M2-16 raised the budget to 384 KB
([options-rebinding-and-accessibility.md](options-rebinding-and-accessibility.md#budgets); M2-18's
boot-time check still guards the launch). A release build must also carry
no debug code (`tizen-build.test.ts` looks for `__shmupDebug` / `debug-overlay`).
`apps/tizen/test/build/tizen-build.test.ts` also executes the bundle in a V8 realm with
`globalThis` deleted.

Syntax is lowered by the build, **APIs are not polyfilled** — so runtime APIs newer than
Chrome 69 must not be used in shipped code. `eslint-plugin-compat` (browserslist
`chrome >= 69`) catches most; extra rules ban the common offenders (list in
[conventions.md](conventions.md#chromium-69-rules)).

`pnpm --filter @shmup/tizen dev` serves the Tizen entry in a desktop browser on port 5174
(no `window.tizen`: key registration is skipped and there is no `platform.exit`, so the title
has no EXIT item and Back never exits — it still pauses and backs out of menus). Opening
`apps/tizen/dist/index.html` straight from disk in desktop Chrome needs
`--allow-file-access-from-files`: Chrome gives every `file://` URL its own origin, so WebGL
refuses to upload the atlas page; the TV serves the widget's files as same-origin.

## Deploying to a Samsung TV / Smart Monitor

Never in CI; needs a machine with the Tizen CLI, a Samsung certificate profile whose
distributor certificate lists the monitor's DUID, and the monitor in Developer Mode
pointing at that machine (setup: [../client/install-on-tv.md](../client/install-on-tv.md)).
The wrappers in `apps/tizen/scripts/` are plain Node, so they work from cmd.exe,
PowerShell and POSIX shells.

| Variable | Used by | Meaning |
|---|---|---|
| `TIZEN_PROFILE` | `tizen:package` (required) | Certificate profile name (`tizen security-profiles list`) |
| `TIZEN_CLI` | all | Path to `tizen` / `tizen.bat` (default: found on `PATH`) |
| `SDB` | install, run | Path to `sdb` (default: on `PATH`) |
| `TV_IP` | install, run | One monitor's IP; the script runs `sdb connect` first |
| `TIZEN_TARGET` | install, run | sdb serial, default `${TV_IP}:26101` |

```bat
:: Windows cmd.exe, from the repository root
pnpm --filter @shmup/tizen build
set TIZEN_PROFILE=shmupcup
set TV_IP=192.168.1.50
:: tizen package -t wgt -s shmupcup -- apps\tizen\dist
pnpm --filter @shmup/tizen tizen:package
:: sdb connect 192.168.1.50, then tizen install -n <newest .wgt> -s 192.168.1.50:26101
pnpm --filter @shmup/tizen tizen:install
:: tizen run -p ShmpCupGam.ShmupCup -s 192.168.1.50:26101
pnpm --filter @shmup/tizen tizen:run
```

PowerShell: `$env:TIZEN_PROFILE = "shmupcup"; $env:TV_IP = "192.168.1.50"`; POSIX
shells: `TIZEN_PROFILE=shmupcup TV_IP=192.168.1.50 pnpm --filter @shmup/tizen tizen:install`.

For the second monitor set `TV_IP` to its address and repeat `tizen:install` and
`tizen:run` (unlike the input probe's `deploy`, these scripts take one IP at a time).
`pnpm build` empties `dist/`, so package again after every build.

**Debug build** (the §8.4 on-device checks, M1-19): `pnpm --filter @shmup/tizen build:dev`
instead of `build`, then the same three commands. It is the same app id, so it installs over the
release build and keeps its save; the remote sequence Pause, Ch+, Ch+, Ch+ unlocks the debug
tools ([../client/debug-tools.md](../client/debug-tools.md)). Package from a plain `build` for
anything that is not a test build — `pnpm test:e2e` leaves a test build in `dist/` too.

**`config.xml` variants** (M2-17, [platform-polish.md](platform-polish.md#tizen-configxml-variants-appstizenscriptsconfig-xmlmjs)):
`pnpm --filter @shmup/tizen build:game-mode` (`vite build --mode game-mode`, a release build) or
`TIZEN_GAME_MODE=1` with any build adds Samsung's `use.game.mode` metadata for the §8.5 latency A/B
test; `TIZEN_GAMEPADS=dualshock4::usbgamepad` adds the launch-time gamepad check (a popup when no
listed pad is connected — testing only, never shipped). `check-bundle.mjs` validates whichever
variant was built. The environment variables persist in a Command Prompt — clear them afterwards.

**Live reload** (M2-17, never in CI): `pnpm --filter @shmup/tizen tizen:watch` builds a development
bundle that knows this desktop's address (`SHMUP_LIVE_RELOAD_HOST`, default the first LAN IPv4;
`SHMUP_LIVE_RELOAD_PORT`, default 5175), rebuilds on every change, serves `dist/` over HTTP with a
WebSocket on the same port and tells the app to reload after each build. Package and install its
first build once (another terminal: `tizen:package`, `tizen:install`, `tizen:run`); the widget then
opens the served build. The TV must reach the port.

### The remote Web Inspector (DevTools on the TV)

The debug build's console (`window.__shmupDebug`, the `Shmup Cup device` snapshot, boot errors) and
DevTools' Memory / Performance panels are reached through `sdb` — the usual Tizen web-app route:

```bat
sdb connect 192.168.1.50:26101
sdb -s 192.168.1.50:26101 shell 0 debug ShmpCupGam.ShmupCup
:: → prints "… port: 7011" (the number varies)
sdb -s 192.168.1.50:26101 forward tcp:7011 tcp:7011
```

Then open `http://localhost:7011` in desktop Chrome (the TV's own DevTools front end), or add
`localhost:7011` under `chrome://inspect` → *Configure*. Tizen Studio's *Debug As → Tizen Web
Application* and the VS Code extension's debug command do the same in one step. `shell 0 debug`
restarts the app in debug mode; run it again after every install. Useful there:
`copy(__shmupDebug.save.export())` (the save for a bug report — M2-17), `__shmupDebug.save.usage()`,
and the heap size for the §8.5 memory check (compare with the estimator's 24 MiB
`HEAP_BASELINE_BYTES`, [platform-polish.md](platform-polish.md#memory-budget-shmupshell-memory)).

## Electron

```sh
pnpm --filter @shmup/electron build    # tsc + copy apps/web/dist → dist/renderer
pnpm --filter @shmup/electron start    # needs the Electron binary
SHMUP_DEV_URL=http://localhost:5173 pnpm --filter @shmup/electron start   # against `pnpm dev` (HMR)
SHMUP_FULLSCREEN=1 pnpm --filter @shmup/electron start
pnpm --filter @shmup/electron package  # M2-17, after build: installers in apps/electron/release/ — never in CI
```

`SHMUP_RENDERER_DIR` points the `app://game/` protocol at another web build. The preload
is compiled to CommonJS (`preload.cjs`) because sandboxed preloads cannot be ES modules.

Since M2-17 the app keeps its **saves as files** in `<userData>/saves/` (`save.v1.json`,
`window.json`, a `.bak` of each; atomic writes, 1 MiB a value, 8 MiB the folder), remembers the
**window** (fullscreen — **F11** / **Alt+Enter** —, the scale of the 384×216 frame — **Ctrl+=** /
**Ctrl+-** / **Ctrl+0**, Cmd on macOS —, the position) and the web build it loads runs as platform
`'electron'` (EXIT quits, sound from boot). `package` runs a pinned electron-builder through
`pnpm dlx` with `electron-builder.json` (Windows NSIS + portable, Linux AppImage + tar.gz, macOS dmg;
`--publish never`, unsigned; since M2-18 every platform takes `build/icon.png`, drawn by
`pnpm store:assets` — [release-hardening.md](release-hardening.md#icons-and-store-listing-placeholders)); `electronVersion` is pinned there because
electron-builder cannot read `catalog:` — bump it with the catalog. Details:
[platform-polish.md](platform-polish.md), for players [../client/desktop-app.md](../client/desktop-app.md).

## Tests

- Unit tests live in each project's `test/<module>/` (never in `src/`), run headless in
  Node. Browser APIs are faked per test (fake windows, WebGL classes, `AudioContext`,
  `window.tizen`); nothing needs a TV or a GPU.
- `apps/tizen/test/build/` and `apps/web/test/build/` run **real Vite builds** into temp
  folders — the slowest tests in the repo.
- The Tizen CLI wrappers are tested with `spawnSync` mocked; nothing is ever executed.
- **Allocation guard** (plan §1.4): `measureHeapGrowth(fn, iterations, warmup?, attempts?,
  settled?)` in `packages/core/test/helpers/alloc.ts` — the one guard of every package; shell,
  render-pixi and input-web import it by relative path — measures the bytes a hot path allocates
  (heap growth plus what in-loop GCs reclaimed, via V8's `GCProfiler`, without the heap spaces of
  compiled code), the steadiest of up to three windows, each on call indices neither the warm-up
  nor an earlier window ran (so values derived from them are new, as in play). It needs `--expose-gc` and
  `--allow-natives-syntax`: `defineShmupProject(name, { execArgv: ALLOCATION_GUARD_EXEC_ARGV })`
  passes both to the Vitest workers of `@shmup/core`, `@shmup/shell`, `@shmup/render-pixi` and
  `@shmup/input-web`. A cheap loop (microseconds a call) needs a long warm-up
  ([conventions.md](conventions.md#tests)). `stepWorld` must stay under 256 KB per 10,000 ticks, a
  64-enemy World under 64 KB — see
  [sim-world.md](sim-world.md#zero-allocation-and-the-allocation-guard) and
  [enemies-and-behaviors.md](enemies-and-behaviors.md#zero-allocation-and-the-hot-path-rules).
  The long 64-enemy tests carry explicit timeouts (several seconds on a CI runner).
- **Playtest** (plan §1.4, M1-18): `test/playtest/` plays shipped stages headless with a bot at
  the controls — `runStage(stageId, bot, flags)` records and reports the run, `replayStage`
  replays it, `fourWayBot()` plays like a Samsung-remote player (never a diagonal; since M2-06
  `fourWayBot(player)` flies either slot — the co-op golden replays fly player 2 with a second bot). Part of the
  `integration` project, so of `pnpm test`; the zone A run with god mode must kill HALCYON
  BULWARK and reach the stage clear in 3–6 minutes, the run without it only reports its deaths.
  Since M2-10 `campaign-routes-b` / `-c.test.ts` fly all 16 routes of the zone map in god mode
  with the campaign harness (`test/playtest/campaign.ts` — each zone built as the scene flow
  builds it, the players carried), split in two files so the halves run in parallel
  ([campaign-and-bonus-stages.md](campaign-and-bonus-stages.md#tests)). Since M2-11
  `zone-b` / `zone-c.test.ts` fly the real zones B and C the same way and `zone-bc-recovery.test.ts`
  checks the recovery rule at their eight checkpoints (the shared `recovery.ts` —
  [zones-b-and-c.md](zones-b-and-c.md#playtests-the-recovery-rule-and-the-harness)); since M2-12
  `zone-d` / `zone-e.test.ts` and `zone-de-recovery.test.ts` do the same for zones D and E (zone
  D's camera reaching the caves — [zones-d-and-e.md](zones-d-and-e.md#playtests-and-the-recovery-rule));
  since M2-13 `zone-f` / `zone-g.test.ts` and `zone-fg-recovery.test.ts` for zones F and G (shots
  breaking tissue, the claws lunging, the rush stacking cubes —
  [zones-f-and-g.md](zones-f-and-g.md#playtests-and-the-recovery-rule)).
  `pnpm exec vitest run --project integration test/playtest --reporter=verbose` prints the runs —
  see [zone-a-and-playtest.md](zone-a-and-playtest.md#the-playtest-testplaytest).
- **Golden replays** (M1-19, plan §1.3): `test/golden/golden.test.ts` plays the committed
  replays — forty-six since M2-13: seventeen of zone A, three of the `gimmick-range` dev stage,
  one of the `raster-range` dev stage, four of the advanced-boss dev stages (`captain-range`,
  `raid-range` twice, `twin-range`), three of the bonus-stage dev stages (`bonus-range` twice,
  `bonus-vault`), five of zones B and C (`zone-b` twice, `zone-c` twice, `brine-grotto`), five
  of zones D and E (`zone-d` three times — god mode, without, the boss —, `zone-e` twice), eight
  of zones F and G (`zone-f` four times — god mode, Arcade difficulty, the weaver's deaths, the boss
  —, `zone-g` three times — god mode, without, the boss —, `glimmer-cache`)
  (`test/golden/*.replay.json`) — back and requires every state hash and the
  recorded outcome to match — part of `pnpm test` (the `integration` project). Since M2-15
  `test/golden/demos.test.ts` does the same for the nine attract demos in `content/demos/`
  (through the attract playback, `createDemoPlayback`). A failure means
  the simulation changed; re-bless an intended change with `pnpm golden:update` and say why in
  the commit message ([debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden)).
- **Benchmark** (M1-19): `pnpm bench` (above) — not part of `pnpm test`; CI runs it.
- Repo-level integration tests (`test/`) cover cross-package behaviour, lint-rule
  enforcement and skeleton invariants, plus the root Node scripts (`test/scripts/`,
  including every asset-pipeline module) and the Vite plugins, some of which start a real
  dev server or build (see [../../test/README.md](../../test/README.md)).
- **Browser tests** (`test/e2e/`, `pnpm test:e2e`, not part of `pnpm test`): both builds boot
  in headless Chromium to `data-shmup-state="running"`, load the atlas, render the title
  (`data-shmup-scene="title"`: the logo and the hi-score, no ship) — and free flight with
  `?scene=flight` (HUD, title, the KESTREL's hull) — and log no errors; Enter / OK starts the
  game from the title, Esc / Back pause (dimmed, frozen) and resume, Back on the web title only
  backs out of the menu and on the Tizen title (a fake `window.tizen`) asks first and exits only
  after YES (M1-16); arrow keys move the
  ship and holding one stops it at the playfield margin (web and Tizen builds); a failing
  atlas request shows the boot error screen; resizing re-fits the integer scale; the input
  profiles reach the page
  (bound keys prevented, `?profile=keyboard-remote-emulation` knows only the remote's keys, an
  unknown `?profile=` warns and boots); `?stage=test-range` shows the generated terrain inside
  the playfield and scrolls it (an unknown `?stage=` warns and boots free flight), and its
  first drifter formation appears in the playfield and flies left (M1-08), the turrets'
  bullets appear in the playfield and move (M1-09), and the KESTREL autofires its main shot in
  both builds while `?loadout=full` draws Options and laser beams in the web build only (M1-10),
  and `?loadout=full` draws the fresh Force Field ring around the ship in the web build only
  (M1-11), and on `?stage=test-range` an unattended ship loses its stock icons 2 → 1 → 0 and the
  top bar shows `GAME OVER` (M1-12), and on `?stage=test-boss` the WARNING band shows for three
  seconds and then the test boss flies in (M1-13), and `?scene=fx-gallery` shows its station label
  and additively blended fireball pixels in both builds, with the screenshot attached to the
  report (M1-14), and — with `createBufferSource` wrapped to log started sounds — the web build's
  first key press on `?stage=test-range` starts the zone theme looping at the song's exact sample
  indices while the Tizen build plays its shots from boot (M1-15), and OPTIONS opens the Options
  screen, where a MUSIC change is saved to `shmup-cup:save.v1` on Back and read again after a
  reload, a corrupt save boots with defaults and is copied to `shmup-cup:save.corrupt`, the Tizen
  build keeps SFX and CONTROLS changed with the remote alone across a reload, and the boot time on
  the canvas (`data-shmup-boot-ms`) stays under 10 s (M1-17), and the scene flow plays zone A:
  with `?skip=boss`, Enter four times (three since M2-01, four since M2-03) reaches the WARNING band within seconds and then HALCYON
  BULWARK's hull in the right half of the playfield (M1-18), and the M1 gameplay smoke plays both
  builds from the title (hold the arrows 5 s → `window.__shmupDebug.sceneId` is `game`, no console
  errors) while the debug tools answer F1–F8 on the web and unlock on the TV build only after
  Pause, Ch+, Ch+, Ch+; F4 / F5 / `requestStep` run exact tick counts (M1-19), and START opens the
  difficulty menu, where ArrowDown + Enter starts on HARD, a game over opens the continue countdown
  and Enter continues in the web build while the remote's Back gives up in the Tizen build (M2-01
  — every spec that starts a game presses one more Enter / OK for the difficulty menu), and
  OPTIONS → BULLETS (DISPLAY since M2-16) = DEUTERANOPIA is saved on Back and the next boot's test-range bullets are
  drawn in that palette's colours, while a boot without a save shows none of them (M2-02), and
  the weapon select opens after the difficulty menu with its live preview, TYPE B draws Ripple
  rings, the remote's arrows alone choose a Weapon Edit, a `!` choice and an Auto order and START
  plays them (M2-03 — every spec that starts a game presses one more Enter / OK for the weapon
  select's START), and on `?stage=hunter-range&loadout=full` an Option Hunter steals and carries
  the Options (violet body, grey haul), a Mega Crash frees them and they are collected again, while
  the weapon select's OPTION row is driven by the remote (M2-04), and the ship select (between the
  difficulty menu and the weapon select) picks the MANTA with the remote's arrows, which starts at
  once with the tier pips on the HUD, Ch− / ShiftLeft toggle its speed, and on
  `?stage=direct-range` the six colour items and the Arm are drawn from the atlas (M2-05 — every
  spec that starts a game presses one more Enter / OK for the ship select's KESTREL), and co-op:
  with `?profile=keyboard-split` the title's 2 PLAYERS starts a game whose HUD blinks player 2's
  `PRESS START`, Enter (player 2's START) drops player 2 in without pausing — the bottom bar
  splits, player 2's arrows move it — and Esc still pauses; a fake `navigator.getGamepads()` pad
  drives the menus with one seat, joins as player 2 with START, moves player 2 only, and pauses and
  resumes without a phantom press (`coop.spec.ts`, `coop-gamepad.spec.ts`, M2-06 — every spec that
  walked down to OPTIONS on the title presses ▼ once more), and the stage gimmicks:
  `?stage=gimmick-range` boots without atlas warnings and draws the destructible brick pillar,
  breaking it in the sim takes it off the next frame and the checkpoint rollback draws it again
  (`gimmicks.spec.ts`, M2-07), and the presentation polish: the layer shader compiles and links in
  a real WebGL1 context, `?stage=raster-range` draws its wave, palette cycle, line-band floor and
  in-range heat haze within 12 draw calls, `stretch` fills what `integer` letterboxes and the
  hitbox markers show only while on (`raster.spec.ts`, M2-08), and OPTIONS → SCALE / SHAKE /
  FLASHES / HITBOX (on the DISPLAY page since M2-16) apply live, are saved on Back and applied at the next boot on both builds
  (`display-options.spec.ts`, M2-08), and the advanced bosses: IRON LEVIATHAN's hull across the
  whole playfield and the camera panning round it, `BOSS` and the red HP bar in zone A's HUD with
  the saved option, a captain fighting while the camera scrolls, and the twins on the Tizen build
  from `file://` — the resting one on the back layer, the swap at the turn
  (`advanced-bosses.spec.ts`, M2-09), and the zone map: zone A's clear (the tally, then the map;
  ArrowDown + Enter launches zone C), the remote's Back on the map asking and OK launching zone B
  (`zone-map.spec.ts`), a whole run A → B → D → F → H to the ending and the saved run with the zone
  it reached, `?stage=bonus-range`'s digit entrance flying into `bonus-vault` with the 1UP and
  bonus capsule drawn in their colours, and the Tizen build's OK skipping a tally and launching
  the next zone (`campaign-run.spec.ts`, M2-10 — the specs clear zones through
  `window.__shmupDebug`), and zones B and C: `?stage=zone-b`'s palette-cycled brine sea and, the
  stage jumped to its end, GALVANIC MAW's hull fighting with its mouth opening, `?stage=zone-c`'s
  dune ridge and SANDGRAVE WIDOW, `?stage=brine-grotto`'s reef over the brine sea, and the widow
  drawn on the Tizen build from `file://` (`zones-bc.spec.ts`, M2-11), and zones D and E:
  `?stage=zone-d`'s volcano peaks, its palette-cycled lava lake rising into view with the dive and
  CINDER BASTION's hull fighting down in the caves with its shield arms turning, `?stage=zone-e`'s
  palette-cycled storm clouds over the jagged ridge and SQUALL STEED opening its chest, and both
  bosses drawn on the Tizen build from `file://` (`zones-de.spec.ts`, M2-12), and zones F and G:
  `?stage=zone-f`'s palette-cycled cell wall (its pixels recoloured as the cycle steps) over the
  fleshy folds and MANTLE REGENT fighting with its tentacles curling in, `?stage=zone-g`'s
  palette-cycled crystal facets over the spires and FACET MONARCH waving its arms, and both bosses
  drawn on the Tizen build from `file://` (`zones-fg.spec.ts`, M2-13), and the Options pages of
  M2-16: SHOT rebound to J on the web build, saved, shown in the input test and applied after a
  reload, and on the Tizen build from `file://` POWER-UP swapped with CH− and kept across a
  relaunch (`rebind.spec.ts`); a version-1 save booting and rewritten as version 2 with its co-op
  row moved, LIVES 5 and ONE BUTTON reaching the next game, Escape cancelling a capture, RESET
  restoring a key, SOCD / DEBOUNCE saved, and LIVES 1 set with the remote's keys on the Tizen build
  (`game-options.spec.ts`) — the options, display-options and bullet-palette specs walk to the
  DISPLAY page since —, and M2-17's platform polish: on the web build `__shmupDebug.save` exporting
  the save, importing an edited one (written under `shmup-cup:`, reported by `usage()` against the
  1 MiB budget, loaded by the next launch) and refusing a broken text; on the Tizen build from
  `file://` no device facts and no `webapis.js` request before the unlock, the `Shmup Cup device`
  snapshot after Pause, Ch+ ×3, the storage usage, no console errors (`platform-polish.spec.ts`).
  The gameplay specs
  open `?scene=flight` (bare gameplay, open space unless `?stage=` names a stage) since M1-16;
  specs comparing captures a set number of ticks apart freeze the sim and step exact ticks
  (`test/e2e/frame-advance.ts`, M1-19) instead of counting rAF frames. Since M1-19 the suite runs
  on the **test builds** (`build:test`), every test in parallel on one browser per five cores
  ([Test concurrency](#test-concurrency)).
  Output goes to `test/e2e/test-results/` (git- and Prettier-ignored).
- **Dev query parameters** of the web build (`pnpm dev`, `vite preview`; without `?scene=` the
  game starts on the title — the scene flow, M1-16 — and START plays zone A, AZURE VERGE, M1-18):
  `?scene=flight` (free flight straight away, no title or pause menu — bare gameplay, open space),
  `?stage=<id>` (START — or free flight — runs that stage instead, e.g. `test-range`,
  `test-boss` for the WARNING and the test boss, or `hunter-range` for the Option Hunters and the
  blue capsule — M2-04, [options-shields-hunter.md](options-shields-hunter.md) —, or
  `direct-range` for the Direct mode's carriers — pick the MANTA in the ship select, M2-05,
  [direct-mode.md](direct-mode.md) —, `gimmick-range` for the advanced stage systems — M2-07,
  [advanced-stages.md](advanced-stages.md) —, `raster-range` for the raster effects and palette
  cycles — M2-08, [presentation-polish.md](presentation-polish.md) —, or `captain-range`,
  `raid-range`, `twin-range` and `gauntlet-range` for the captains, the battleship raid with its
  inner boss and time limit, the double boss and a boss rush — M2-09,
  [advanced-bosses.md](advanced-bosses.md) — see
  [stage-runtime.md](stage-runtime.md#running-a-stage) and
  [bosses-and-warning.md](bosses-and-warning.md#the-test-boss-and-stagetest-boss)), `?skip=boss`
  (the debug stage skip: every game starts about two seconds before the stage's WARNING — M1-18,
  [zone-a-and-playtest.md](zone-a-and-playtest.md#the-debug-stage-skip)), `?scene=showcase`
  (the M1-04 sprite showcase), `?scene=calibration` (test pattern),
  `?scene=fx-gallery` (every particle preset, shake, flash, the dim and the score popups in turn —
  M1-14, [fx-and-game-feel.md](fx-and-game-feel.md#the-fx-gallery-scenefx-gallery)),
  `?loadout=full` (start fully powered: speed 2, Missile, Laser, four Options — M1-10 — and a
  Force Field since M1-11 — since M2-03 the weapon select's `?` shield; see
  [weapons-and-options.md](weapons-and-options.md#loadouts-and-the-starting-loadout)),
  `?profile=<id>` (another keyboard / remote input profile, e.g.
  `keyboard-remote-emulation` or `tizen-remote-safe`) and `?debounce=<0…10>` (release debounce
  override) — see [input-profiles.md](input-profiles.md#choosing-the-active-profile). The TV
  widget starts without a query string.

## Test concurrency

**Vitest** (`pnpm test`, root `vitest.config.ts`): one process runs every project with one pool
of `cores − 1` forked workers (47 on the 48-vCPU dev box, 3 on a CI runner), and starts the
test files **longest first** across all projects (`LongestFirstSequencer`, from the durations
Vitest cached on the last run; files that failed last time or are new go first) — so the
whole-campaign playtests do not end the run alone. `pnpm --filter <pkg> test` runs one package's
config the same way.

`pnpm test` used to be `turbo run test test:integration`: nine Vitest processes at once, each
with a worker per core — about nine busy workers per core. One pool keeps the machine at about
one worker per core, and the run needs ~40 % less CPU. The wall time shrank less than the CPU
(53–56 s, before 63–71 s): the dev box's throughput (48 vCPUs on hyper-threaded host cores) and
the longest files (the campaign playtests, ~27 s alone) bound it. Keep test files independent of
each other and of their order — see [conventions.md](conventions.md#tests).

The **allocation guards** run in the shared pool like every other test (a separate
low-parallelism group for them, also tried, added 8–12 s a run). Under load they used to fail
now and then and pass alone — 1 full run in 8 with nine processes, still 2 in 20 with one pool
(render-pixi's effects guard at 131 KB of 64, input-web's poll guard at 156 KB of 128): V8
compiles the code under test on background threads, and with every core busy those compiles
landed inside the measured windows, which then ran the lower tiers (they box doubles) and
counted the compiled code. The guard (`measureHeapGrowth`, `packages/core/test/helpers/alloc.ts`
— since this change the only one; render-pixi and input-web had their own, noisier probes) now
lands every background compile before each round it measures (V8's `%FinalizeOptimization()`,
hence `--allow-natives-syntax` in `ALLOCATION_GUARD_EXEC_ARGV`), leaves the heap spaces of
compiled code out of its count, and runs the warm-up and the windows through one loop — see its
module docs. Over 8 instrumented full runs every guard's result stayed within 71 % of its
budget (before, over 13: up to 98 %), and 5 % of first windows went over a budget (before: 19 %);
22 full runs in a row passed (52–61 s each). Its windows then replayed the warm-up's call
indices, so a value a guard derives from its index (the camera, a tick) was never new in a window
and a cache keyed on one went unseen; they now run the indices after the warm-up's, and the guards
feed values that change as in play — 16 full runs in a row passed with that (52–63 s each), and
`CI=1 taskset -c 0-3 pnpm test` (a 4-vCPU runner's pool) too. A guard that still wavers is too
close to its steady state: give it a longer warm-up or more windows, never a bigger budget
([conventions.md](conventions.md#tests)).

**Playwright** (`pnpm test:e2e`, `test/e2e/playwright.config.ts`): `fullyParallel` — every test
(each has its own browser context: fresh `localStorage`, its own page on the shared
`vite preview` server) can run on any worker — on `max(2, ⌊cores / 5⌋)` browsers (9 on the dev
box, 2 on a CI runner). SwiftShader renders each page on up to 16 threads of its own, so the run
is CPU-bound: on 48 cores 8–12 browsers took 150–180 s, while 16 and 24 made frame-paced tests
time out. CI splits the Chromium tests over five runners (`--project=chromium --shard=i/5`) and
runs the Firefox project (the determinism spec) on a sixth (`--project=firefox`).

| Variable | Default | Effect |
|---|---|---|
| `VITEST_MAX_WORKERS` | `cores − 1` | Vitest's own: the worker pool of `pnpm test` (lower it to share a busy machine) |
| `E2E_WORKERS` | `max(2, ⌊cores / 5⌋)` | Playwright browsers of `pnpm test:e2e` |

Do not turn on Vitest's `fsModuleCache`: with it render-pixi's `sprites-interpolation` guard
measured over its budget one run in four (the cached module code tiers up differently; measured
with render-pixi's earlier probe, not retried since).

## CI

`.github/workflows/ci.yml` on every push to `master` and every pull request, as parallel jobs
on GitHub's 4-vCPU runners — the run takes as long as its slowest job. Each job installs on its
own: `pnpm/action-setup` (version from `packageManager`) → `actions/setup-node` (`.nvmrc`, pnpm
cache) → `pnpm install --frozen-lockfile`, with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` (Electron is
only type-checked, tested and compiled) and Turborepo telemetry off.

| Job | Runs |
|---|---|
| `format · lint` | `pnpm format:check`, `pnpm lint` |
| `typecheck` | `pnpm typecheck` |
| `test 1/3` … `3/3` | `pnpm test --shard=<i>/3` (golden replays included): Vitest's shards split the test files by path hash |
| `build · benchmark` | `pnpm build` (Tizen budgets included), then `pnpm bench` (M1-19) alone on its runner |
| `e2e 1/5` … `5/5` | `pnpm exec playwright install --with-deps chromium`, then `pnpm test:e2e --project=chromium --shard=<i>/5`: each shard builds its own test builds and runs a fifth of the Chromium tests (one retry on CI) |
| `e2e · headless Firefox` (`e2e-firefox`, M2-18) | `pnpm exec playwright install --with-deps firefox`, then `pnpm test:e2e --project=firefox`: the cross-engine determinism spec — every golden replay and attract demo in SpiderMonkey against the web build's `?determinism` page ([release-hardening.md](release-hardening.md)) |
| `input probe` | `tools/input-probe` with npm |

The matrices do not fail fast, so every shard reports. A newer push to the same branch cancels
the running workflow (`concurrency`). Commit `pnpm-lock.yaml` whenever dependencies change, or
the frozen install fails.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `ERR_PNPM_BROKEN_LOCKFILE … expected a single document in the stream` | An old pnpm (e.g. 8.x from a standalone install in `~/.local/share/pnpm`) is first on `PATH` and cannot read the lockfile. `pnpm -v` must print 12.x: install pnpm under the active Node (`npm i -g pnpm@latest`) and put that bin directory first, or remove the old install |
| pnpm refuses to run: unsupported Node / `devEngines` error | Switch Node (`nvm use`, `.nvmrc` = 24). Node 23 and 25 are not supported by the toolchain |
| `pnpm install --frozen-lockfile` fails in CI | `pnpm-lock.yaml` not updated after a `package.json` change — run `pnpm install` locally and commit the lockfile |
| Tizen build fails in `check-bundle.mjs` with "not a valid ES2018 script" | Something reached `app.js` unlowered — usually `import.meta` or a dependency shipping newer syntax the build did not lower. The report shows the code around the error position |
| ESLint `compat/compat` or "needs Chrome NN" errors | A runtime API newer than Chrome 69 in shipped code; use an older API or feature-detect behind a fallback |
| `eslint-rules.test.ts` times out on its first check under the full `pnpm test` | Loading ESLint and its plugins is slow when every project runs at once; since M2-05 the suite warms ESLint up once in `beforeAll` (a 120 s hook timeout), so the checks themselves stay short. Keep new lint checks inside that suite, sharing its instance |
| `Error: Test timed out in 5000ms.` in CI (e.g. an atlas build in `flight.test.ts` or `pipeline.test.ts`) | Vitest's 5 s default was too short while every package's suite runs at once on a 4-vCPU runner (a 0.5 s local test took 5.2 s). Since M2-10 `defineShmupProject` sets `testTimeout` to `TEST_TIMEOUT_MS` (30 s) for every project, and the atlas packer prunes only new free rectangles (same layout, about half the build time). A test that needs more passes its own timeout |
| `electron: command not found` / Electron failed to install | The binary was skipped (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`); run `pnpm rebuild electron` |
| Electron window blank: "Web build not found" at build | Build `@shmup/web` first (`pnpm build` does it via Turborepo) |
| `pnpm --filter @shmup/electron package` fails to find or download Electron | `electronVersion` in `apps/electron/electron-builder.json` no longer matches an Electron release — bump it together with the catalog's `electron` (the packaging test compares the majors) |
| The desktop app forgets its window position on Linux | Something saves on `moved` again — Electron emits it on macOS / Windows only; `main.ts` saves 400 ms after the last `move` and on `close` ([platform-polish.md](platform-polish.md#electron-the-window-mainwindow-statets-mainwindow-optionsts-mainmaints)) |
| Tizen build fails with `config.xml: …` | `check-bundle.mjs` validates the built `config.xml` variant: a hand edit broke `public/config.xml` (a missing privilege, an unbalanced tag), or unknown / repeated metadata |
| Every Tizen build suddenly has game mode or the gamepad check | `TIZEN_GAME_MODE` / `TIZEN_GAMEPADS` is still set in the shell — unset it (`set TIZEN_GAME_MODE=`); the build logs `config.xml: <variant> variant` whenever it is not the default |
| `tizen:watch` runs but the TV never reloads | The TV cannot reach the port (firewall, other subnet) or the wrong LAN address was picked — set `SHMUP_LIVE_RELOAD_HOST`; the widget on the TV must be the watch's own first build (a release bundle has no live reload) |
| `pnpm content:check` (or `pnpm test`) lists `path` / `message` issues | A content file breaks its schema (`unknown field`, a bound, an id that does not resolve). The path is `<file>:<json path>`; fix the file or, if the format changed on purpose, the schema in `packages/core/src/data` — see [content-data.md](content-data.md#gotchas) |
| Build fails with `SyntaxError: <file>.json: …` from `shmup:content` | A file under `content/` is not valid JSON (comments and trailing commas are not allowed; only the README samples are JSONC) |
| `asset sources are invalid (N issues)` from `pnpm assets`, `pnpm build` or `pnpm dev` | A sprite pixel map, PNG override or font breaks its format; every line names `<file>:<json path>`. See [asset-pipeline.md](asset-pipeline.md#gotchas) |
| `pnpm content:check` reports `sprite "…" is not in the atlas` | Content names a sprite no pixel map, generator or PNG defines — fix the name or add the sprite |
| `pnpm content:check` fails an audio check (a cue without a sound, a song that clips or does not loop sample-exactly, a stage cue without a track) | Fix `content/audio/` — listen with `pnpm audio:preview --only <name>`; the rules are in [audio.md](audio.md#extending-it) and [`content/audio/README.md`](../../content/audio/README.md) |
| `pnpm dev` keeps the old atlas after editing `scripts/assets/` | Vite should restart the server on its own; if it logged `restart the dev server to regenerate the atlas …`, restart `pnpm dev` |
| Tizen build fails with `unexpected files outside dist/assets/` | Something (a new `public/` file, a plugin) put a file into `dist/` outside `assets/`; move it under `assets/` or keep it out of the widget |
| The game shows a navy screen with a pink title such as `CONTENT ERRORS: 2 PROBLEMS` or `ATLAS PAGE FAILED TO LOAD` | The shell's boot error screen: every line is one problem (`<file>:<json path>: message` for content). Fix the listed content, rebuild a stale atlas (`ATLAS DOES NOT MATCH ITS MANIFEST`), or check WebGL (`WEBGL IS NOT AVAILABLE`). The console logs "Shmup Cup failed to start" with the `ShellBootError` — see [rendering-and-shell.md](rendering-and-shell.md#the-boot-sequence) |
| `pnpm test:e2e`: `Executable doesn't exist … chromium` | Playwright's browser is not installed: `pnpm exec playwright install --with-deps chromium firefox` (both engines, once per machine) |
| `pnpm test:e2e`: every `[firefox]` test fails with `Executable doesn't exist … firefox` | Since M2-18 the `firefox` project runs the determinism spec, so plain `pnpm test:e2e` needs Playwright's Firefox too: `pnpm exec playwright install --with-deps firefox` — or run `pnpm test:e2e --project=chromium` for the Chromium tests alone |
| `pnpm test:e2e` hangs or times out creating WebGL contexts | A stale `DISPLAY` (forwarded X display of an SSH session) — the config already strips it for the browser; if you launch Chromium by hand, unset `DISPLAY` |
| `pnpm test:e2e`: port 4173 already in use | Another `vite preview` is running; locally it is reused (`reuseExistingServer`), so make sure it serves a current `apps/web/dist`, or stop it |
| A test fails with `the allocation guard needs node --expose-gc --allow-natives-syntax` | The package's `vitest.config.ts` lacks `defineShmupProject(name, { execArgv: ALLOCATION_GUARD_EXEC_ARGV })` (`vitest.shared.ts`) |
| An allocation test (`… toBeLessThan(…)` on `growth.bytes`) fails | A hot path allocates: a new object / array / closure per tick, or a fractional number V8 boxes (a fractional `let` in a closure, a mixed ternary, a fractional argument) — see [sim-world.md](sim-world.md#zero-allocation-and-the-allocation-guard). Check the test's own fakes too: a fake that logs its calls allocates (the fx gallery guard measured its popups fake). If it fails only now and then and always passes alone (`pnpm --filter <package> test <file>`), the guard is too close to its steady state: a cheap loop needs a warm-up of at least `max(iterations, 20_000)` calls, and a window whose calls meet paths the warm-up never ran may need more windows (`attempts`) — or the guard picks paths by the size of its index instead of its remainders (the windows run indices the warm-up never ran); never raise the budget for it, and report it if it keeps happening. Compiles landing in a window (V8's background threads starved by the load) no longer count — the guard lands them before each round and leaves compiled code out |
| `golden.test.ts` or `demos.test.ts` fails: a hash or the outcome differs | The simulation changed (the demos in `content/demos/` are locked like the goldens since M2-15). Unintended: find the change (the report names the first diverging hash tick). Intended: `pnpm golden:update`, review the diff of `test/golden/*.replay.json`, commit it with the reason — [debug-and-replays.md](debug-and-replays.md#gotchas) |
| `pnpm bench` fails on the median | Timing: run it alone on a quiet machine. On the heap: something in the tick allocates — see the allocation guard rows above |
| Tizen build fails with `app.js is … gzipped, over the … budget` (or an atlas page / `dist/` budget) | The bundle grew past a plan budget (`check-bundle.mjs` rule 8). Find what grew (a new dependency, inlined data); raising a budget is a plan decision, not a fix |
| `pnpm test:e2e` specs time out waiting for `window.__shmupDebug` | They ran against release builds (e.g. `playwright test` by hand after `pnpm build`). Run `pnpm test:e2e`, which builds `build:test` first |
| Type errors about `@shmup/*` imports only in `pnpm build` | The library build uses `dist/` typings: a dependency's `build` failed or was skipped — run `pnpm build` from the root so `^build` runs first |
