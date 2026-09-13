# Build, test and deploy

Commands, outputs and gotchas for the pnpm + Turborepo monorepo. For *where* things live
see [repo-layout.md](repo-layout.md); for the tester-facing TV install walkthrough see
[../client/install-on-tv.md](../client/install-on-tv.md). The standalone input probe
(`tools/input-probe/`, npm) has its own guide: [input-probe.md](input-probe.md).

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | `^22.22.2 \|\| ^24.15.0 \|\| >=26` (`.nvmrc` = 24) | Intersection of the dev toolchain's own requirements (Vitest 5, Electron 44, eslint-plugin-jsdoc 64, ESLint 10). `devEngines.runtime.onFail: "error"` makes pnpm refuse other versions up front |
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
| `pnpm test` | Every project's `vitest run` plus `test:integration` (repo-level `test/`) |
| `pnpm test:all` | One Vitest process over all projects (root `vitest.config.ts`) — quickest full run |
| `pnpm test:integration` | Only the repo-level `test/` project |
| `pnpm test:e2e` | Browser smoke tests: `turbo run build:test` for `@shmup/web` and `@shmup/tizen` (test builds — the release code plus the debug tools and `window.__shmupDebug`, M1-19), then Playwright (`test/e2e/playwright.config.ts`) in headless Chromium with SwiftShader WebGL — the web build via `vite preview` (port 4173) and the Tizen `dist/index.html` via `file://`. Needs Chromium once per machine: `pnpm exec playwright install --with-deps chromium`. See [rendering-and-shell.md](rendering-and-shell.md#browser-tests-pnpm-teste2e) |
| `pnpm golden:update` | Re-blesses the golden replays (`scripts/golden-update.mjs`: Vitest on `test/golden` with `SHMUP_GOLDEN_UPDATE=1` — re-records every scenario of `test/golden/golden.ts` from its bot, rewrites `test/golden/*.replay.json`, then checks them). Only for an **intended** simulation change, in the same commit, with the reason in the commit message — see [debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden) |
| `pnpm bench` | The stress benchmark (`test/bench/`, own Vitest config, `--expose-gc`): 20,000 ticks with 512 bullets, 64 enemies, the full loadout and four lasers; prints ms/tick and heap growth, fails at a median ≥ 1.0 ms/tick or ≥ 512 KB heap growth. Not part of `pnpm test`; CI runs it after the build — see [debug-and-replays.md](debug-and-replays.md#the-stress-benchmark-pnpm-bench) |
| `pnpm format` / `pnpm format:check` | Prettier write / check (research docs at the root are ignored) |
| `pnpm clean` | Removes `dist/`, `coverage/`, `.turbo/` everywhere (never `node_modules`) |
| `pnpm assets` | Placeholder asset pipeline (`scripts/generate-assets.mjs`): sprite pixel maps, procedural generators, PNG overrides and fonts → `assets/generated/atlas/main.png` + `main.json`; skipped when inputs are unchanged; `--force` rebuilds, `--out DIR` / `--source DIR` redirect, `--quiet` silences; exit 1 lists invalid sources. Also runs before every `build` / `dev` (Turborepo `//#assets`) and inside Vite builds (`shmupAssets()`). See [asset-pipeline.md](asset-pipeline.md#running-it) |
| `pnpm content:check` | Validates every JSON file under `content/` with `loadContent()` from `@shmup/core` — the shipped files and the `example.*.json` samples as two independent sets, plus the README format samples — and checks that every sprite name of the shipped content exists in the atlas; the foreign kinds go through their owners, and `content/audio/` is also checked for sound (every `SFX_CUES` cue bound, audible, unclipped, short; every song looping sample-exactly; every cue a shipped stage names prepared and bound — M1-15) (`test/integration/content.test.ts`; also part of `pnpm test`). See [content-data.md](content-data.md#commands) |
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
  workspace packages from source (`@shmup/source` condition), not from `dist/`.
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

A cache hit prints `cache hit, replaying logs`. To force a rerun: `pnpm turbo run test --force`.

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
the boot error screen), and — since M1-19 — the **budgets** hold: `app.js` ≤ 350 KB gzipped
(`APP_JS_GZIP_BUDGET`), every atlas page a readable PNG of at most 2048² (`ATLAS_PAGE_MAX_SIZE`),
the whole `dist/` ≤ 8 MB (`DIST_BUDGET`). The OK line prints the sizes against them
(M1-19: `app.js` 773.6 KB, 228.6 KB gzipped; `dist/` 812.4 KB). A release build must also carry
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

## Electron

```sh
pnpm --filter @shmup/electron build    # tsc + copy apps/web/dist → dist/renderer
pnpm --filter @shmup/electron start    # needs the Electron binary
SHMUP_DEV_URL=http://localhost:5173 pnpm --filter @shmup/electron start   # against `pnpm dev` (HMR)
SHMUP_FULLSCREEN=1 pnpm --filter @shmup/electron start
```

`SHMUP_RENDERER_DIR` points the `app://game/` protocol at another web build. The preload
is compiled to CommonJS (`preload.cjs`) because sandboxed preloads cannot be ES modules.

## Tests

- Unit tests live in each project's `test/<module>/` (never in `src/`), run headless in
  Node. Browser APIs are faked per test (fake windows, WebGL classes, `AudioContext`,
  `window.tizen`); nothing needs a TV or a GPU.
- `apps/tizen/test/build/` and `apps/web/test/build/` run **real Vite builds** into temp
  folders — the slowest tests in the repo.
- The Tizen CLI wrappers are tested with `spawnSync` mocked; nothing is ever executed.
- **Allocation guard** (plan §1.4): `measureHeapGrowth(fn, iterations)` in
  `packages/core/test/helpers/alloc.ts` measures the bytes a hot path allocates (heap growth
  plus what in-loop GCs reclaimed, via V8's `GCProfiler`). It needs `--expose-gc`, which
  `defineShmupProject(name, { execArgv: ['--expose-gc'] })` passes to the Vitest workers of
  `@shmup/core` and `@shmup/shell`. `stepWorld` must stay under 256 KB per 10,000 ticks, a
  64-enemy World under 64 KB — see
  [sim-world.md](sim-world.md#zero-allocation-and-the-allocation-guard) and
  [enemies-and-behaviors.md](enemies-and-behaviors.md#zero-allocation-and-the-hot-path-rules).
  The long 64-enemy tests carry explicit timeouts (several seconds on a CI runner).
- **Playtest** (plan §1.4, M1-18): `test/playtest/` plays shipped stages headless with a bot at
  the controls — `runStage(stageId, bot, flags)` records and reports the run, `replayStage`
  replays it, `fourWayBot()` plays like a Samsung-remote player (never a diagonal). Part of the
  `integration` project, so of `pnpm test`; the zone A run with god mode must kill HALCYON
  BULWARK and reach the stage clear in 3–6 minutes, the run without it only reports its deaths.
  `pnpm exec vitest run --project integration test/playtest --reporter=verbose` prints the runs —
  see [zone-a-and-playtest.md](zone-a-and-playtest.md#the-playtest-testplaytest).
- **Golden replays** (M1-19, plan §1.3): `test/golden/golden.test.ts` plays the four committed
  zone A replays (`test/golden/*.replay.json`) back and requires every state hash and the
  recorded outcome to match — part of `pnpm test` (the `integration` project). A failure means
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
  OPTIONS → BULLETS = DEUTERANOPIA is saved on Back and the next boot's test-range bullets are
  drawn in that palette's colours, while a boot without a save shows none of them (M2-02), and
  the weapon select opens after the difficulty menu with its live preview, TYPE B draws Ripple
  rings, the remote's arrows alone choose a Weapon Edit, a `!` choice and an Auto order and START
  plays them (M2-03 — every spec that starts a game presses one more Enter / OK for the weapon
  select's START), and on `?stage=hunter-range&loadout=full` an Option Hunter steals and carries
  the Options (violet body, grey haul), a Mega Crash frees them and they are collected again, while
  the weapon select's OPTION row is driven by the remote (M2-04). The gameplay specs
  open `?scene=flight` (bare gameplay, open space unless `?stage=` names a stage) since M1-16;
  specs comparing captures a set number of ticks apart freeze the sim and step exact ticks
  (`test/e2e/frame-advance.ts`, M1-19) instead of counting rAF frames. Since M1-19 the suite runs
  on the **test builds** (`build:test`), and Playwright uses half the cores, at most 8 workers.
  Output goes to `test/e2e/test-results/` (git- and Prettier-ignored).
- **Dev query parameters** of the web build (`pnpm dev`, `vite preview`; without `?scene=` the
  game starts on the title — the scene flow, M1-16 — and START plays zone A, AZURE VERGE, M1-18):
  `?scene=flight` (free flight straight away, no title or pause menu — bare gameplay, open space),
  `?stage=<id>` (START — or free flight — runs that stage instead, e.g. `test-range`,
  `test-boss` for the WARNING and the test boss, or `hunter-range` for the Option Hunters and the
  blue capsule — M2-04, [options-shields-hunter.md](options-shields-hunter.md) — see
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

## CI

`.github/workflows/ci.yml` on every push to `master` and every pull request:
`pnpm/action-setup` (version from `packageManager`) → `actions/setup-node` (`.nvmrc`,
pnpm cache) → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` →
`pnpm test` (golden replays included) → `pnpm build` (Tizen budgets included) → `pnpm bench`
(M1-19), with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` (Electron is only
type-checked, tested and compiled) and Turborepo telemetry off. A parallel **`e2e`** job
installs the same way, runs `pnpm exec playwright install --with-deps chromium` and then
`pnpm test:e2e` (test builds); the `input-probe` job builds and tests `tools/input-probe` with npm. Commit `pnpm-lock.yaml`
whenever dependencies change, or the frozen install fails.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `ERR_PNPM_BROKEN_LOCKFILE … expected a single document in the stream` | An old pnpm (e.g. 8.x from a standalone install in `~/.local/share/pnpm`) is first on `PATH` and cannot read the lockfile. `pnpm -v` must print 12.x: install pnpm under the active Node (`npm i -g pnpm@latest`) and put that bin directory first, or remove the old install |
| pnpm refuses to run: unsupported Node / `devEngines` error | Switch Node (`nvm use`, `.nvmrc` = 24). Node 23 and 25 are not supported by the toolchain |
| `pnpm install --frozen-lockfile` fails in CI | `pnpm-lock.yaml` not updated after a `package.json` change — run `pnpm install` locally and commit the lockfile |
| Tizen build fails in `check-bundle.mjs` with "not a valid ES2018 script" | Something reached `app.js` unlowered — usually `import.meta` or a dependency shipping newer syntax the build did not lower. The report shows the code around the error position |
| ESLint `compat/compat` or "needs Chrome NN" errors | A runtime API newer than Chrome 69 in shipped code; use an older API or feature-detect behind a fallback |
| `electron: command not found` / Electron failed to install | The binary was skipped (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`); run `pnpm rebuild electron` |
| Electron window blank: "Web build not found" at build | Build `@shmup/web` first (`pnpm build` does it via Turborepo) |
| `pnpm content:check` (or `pnpm test`) lists `path` / `message` issues | A content file breaks its schema (`unknown field`, a bound, an id that does not resolve). The path is `<file>:<json path>`; fix the file or, if the format changed on purpose, the schema in `packages/core/src/data` — see [content-data.md](content-data.md#gotchas) |
| Build fails with `SyntaxError: <file>.json: …` from `shmup:content` | A file under `content/` is not valid JSON (comments and trailing commas are not allowed; only the README samples are JSONC) |
| `asset sources are invalid (N issues)` from `pnpm assets`, `pnpm build` or `pnpm dev` | A sprite pixel map, PNG override or font breaks its format; every line names `<file>:<json path>`. See [asset-pipeline.md](asset-pipeline.md#gotchas) |
| `pnpm content:check` reports `sprite "…" is not in the atlas` | Content names a sprite no pixel map, generator or PNG defines — fix the name or add the sprite |
| `pnpm content:check` fails an audio check (a cue without a sound, a song that clips or does not loop sample-exactly, a stage cue without a track) | Fix `content/audio/` — listen with `pnpm audio:preview --only <name>`; the rules are in [audio.md](audio.md#extending-it) and [`content/audio/README.md`](../../content/audio/README.md) |
| `pnpm dev` keeps the old atlas after editing `scripts/assets/` | Vite should restart the server on its own; if it logged `restart the dev server to regenerate the atlas …`, restart `pnpm dev` |
| Tizen build fails with `unexpected files outside dist/assets/` | Something (a new `public/` file, a plugin) put a file into `dist/` outside `assets/`; move it under `assets/` or keep it out of the widget |
| The game shows a navy screen with a pink title such as `CONTENT ERRORS: 2 PROBLEMS` or `ATLAS PAGE FAILED TO LOAD` | The shell's boot error screen: every line is one problem (`<file>:<json path>: message` for content). Fix the listed content, rebuild a stale atlas (`ATLAS DOES NOT MATCH ITS MANIFEST`), or check WebGL (`WEBGL IS NOT AVAILABLE`). The console logs "Shmup Cup failed to start" with the `ShellBootError` — see [rendering-and-shell.md](rendering-and-shell.md#the-boot-sequence) |
| `pnpm test:e2e`: `Executable doesn't exist … chromium` | Playwright's browser is not installed: `pnpm exec playwright install --with-deps chromium` |
| `pnpm test:e2e` hangs or times out creating WebGL contexts | A stale `DISPLAY` (forwarded X display of an SSH session) — the config already strips it for the browser; if you launch Chromium by hand, unset `DISPLAY` |
| `pnpm test:e2e`: port 4173 already in use | Another `vite preview` is running; locally it is reused (`reuseExistingServer`), so make sure it serves a current `apps/web/dist`, or stop it |
| A test fails with `measureHeapGrowth needs node --expose-gc` | The package's `vitest.config.ts` lacks `defineShmupProject(name, { execArgv: ['--expose-gc'] })` |
| An allocation test (`… toBeLessThan(…)` on `growth.bytes`) fails | A hot path allocates: a new object / array / closure per tick, or a fractional number V8 boxes (a fractional `let` in a closure, a mixed ternary, a fractional argument) — see [sim-world.md](sim-world.md#zero-allocation-and-the-allocation-guard). If it fails only now and then in a full `pnpm test` (Turborepo runs every package at once) and always passes alone (`pnpm --filter <package> test`), it is JIT / GC noise under load — seen occasionally in core's `game-world.test.ts` and render-pixi's `sprites-edge.test.ts`; rerun, and report it if it keeps happening |
| `golden.test.ts` fails: a hash or the outcome differs | The simulation changed. Unintended: find the change (the report names the first diverging hash tick). Intended: `pnpm golden:update`, review the diff of `test/golden/*.replay.json`, commit it with the reason — [debug-and-replays.md](debug-and-replays.md#gotchas) |
| `pnpm bench` fails on the median | Timing: run it alone on a quiet machine. On the heap: something in the tick allocates — see the allocation guard rows above |
| Tizen build fails with `app.js is … gzipped, over the … budget` (or an atlas page / `dist/` budget) | The bundle grew past a plan budget (`check-bundle.mjs` rule 8). Find what grew (a new dependency, inlined data); raising a budget is a plan decision, not a fix |
| `pnpm test:e2e` specs time out waiting for `window.__shmupDebug` | They ran against release builds (e.g. `playwright test` by hand after `pnpm build`). Run `pnpm test:e2e`, which builds `build:test` first |
| Type errors about `@shmup/*` imports only in `pnpm build` | The library build uses `dist/` typings: a dependency's `build` failed or was skipped — run `pnpm build` from the root so `^build` runs first |
