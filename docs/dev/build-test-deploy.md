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
| `pnpm build` | `turbo run build`: packages (`tsc` → `dist/`), `apps/web` (Vite), `apps/tizen` and (since M3-03) `apps/webos` (Vite + their bundle checks), `apps/electron` (`tsc` + copy of the web build) |
| `pnpm typecheck` | Every project's `tsc --noEmit` for `src/` and `test/`, plus the root tooling (`typecheck:root`) |
| `pnpm lint` | ESLint `--max-warnings=0` per project, plus root files (`lint:root`) |
| `pnpm test` | `vitest run`: every project — packages, apps and the repo-level `test/` (`integration`) — in one Vitest process with one shared worker pool ([Test concurrency](#test-concurrency)) |
| `pnpm test:all` | The same run (kept as an alias) |
| `pnpm test:integration` | Only the repo-level `test/` project |
| `pnpm test:e2e` | Browser smoke tests: `turbo run build:test` for `@shmup/web`, `@shmup/tizen` and `@shmup/webos` (test builds — the release code plus the debug tools and `window.__shmupDebug`, M1-19), then Playwright (`test/e2e/playwright.config.ts`) with two projects: `chromium` runs every spec in headless Chromium with SwiftShader WebGL — the web build via `vite preview` (port 4173) and the two TV builds' `dist/index.html` via `file://` (`webos.spec.ts` is the only place the LG bundle is ever executed, M3-03) — and `firefox` runs only the cross-engine determinism spec (`determinism.spec.ts`, M2-18) in headless Firefox; every test in parallel ([Test concurrency](#test-concurrency)). Extra arguments go to Playwright (`pnpm test:e2e --shard=1/5`, `pnpm test:e2e boss`); `--project=chromium` / `--project=firefox` runs one engine only. Needs both browsers once per machine: `pnpm exec playwright install --with-deps chromium firefox` (Chromium alone is enough for `--project=chromium`). See [rendering-and-shell.md](rendering-and-shell.md#browser-tests-pnpm-teste2e) |
| `pnpm golden:update` | Re-blesses the golden replays (`scripts/golden-update.mjs`: Vitest on `test/golden` with `SHMUP_GOLDEN_UPDATE=1` — re-records every scenario of `test/golden/golden.ts` from its bot, rewrites `test/golden/*.replay.json`, then checks them — since M2-15 also the attract demos of `test/golden/demos.ts` into `content/demos/*.replay.json`). Since R5-P.P3, `node scripts/golden-update.mjs --only zone-b,zone-c` (through pnpm: `pnpm golden:update -- --only …`) re-records only the listed stages' goldens and demos — every other recording is still verified, and an unknown or empty id fails; this is what the zone LAND helper (`docs/v2-run/helpers/land-zone.sh`) runs, and `test/golden/golden-zone-<letter>.test.ts` holds each zone's outcome checks. Only for an **intended** simulation change, in the same commit, with the reason in the commit message. Since R2-01 it **refused to run** (exit 1) while a shipped tileset was not at `TILE_SIZE` — the content was v1's 8-px, and the goldens and demos were stale by design. R2-02's port (`8dbe858`) made that refusal dead, and R2-03's re-bless has since run: wave 6 re-recorded every golden and demo at 640×360 (`d4ba9e8`), and the R2-04 patch set re-blessed them (`a285e0e`) — see [debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden) |
| `pnpm bench` | The benchmarks (`test/bench/*.perf.ts`, own Vitest config, `--expose-gc`, one file at a time): the stress benchmark — 20,000 ticks with 512 bullets, 64 enemies, the full loadout and four lasers; fails at a median ≥ 1.0 ms/tick or ≥ 512 KB heap growth — and since M2-18 the per-zone stress benches (`zones.perf.ts`: every campaign zone start → clear with the bot under the same load, median < 1.0 ms/tick, < 1 MB retained) and the 30-minute headless soak (`soak.perf.ts`: the scene flow through runs, endings, credits and the name entry, heap flat within 1 MB), and since M3-02c the **render** bench (`render.perf.ts` + `render-harness/`: worst-case frames — every measured frame carrying 512 of 512 enemy bullets, ≥ 489 of 512 point items and ≥ 489 of 512 particles (asserted as a per-frame *floor*, not a last-frame reading), CRT off / light / full, a filtered layer, the Mode-7 floor, and the same load at ×2 the shipped frame (`2·FRAME_W` × `2·FRAME_H` since R1-02: 768×432 today, 1280×720 after R2-01) — through the real renderer in Playwright's Chromium; it prints render-ms p95, draw calls, pooled render-target bytes, structure rebuilds and a JS-heap delta, and fails on the draw-call, p95 and heap budgets. It renders through **SwiftShader**, so its milliseconds are a regression gate, never a prediction of the TV — what transfers is the counted quantities and the comparisons between scenarios). Since R0-02 the render bench also builds the TV render bench widget and opens its 172-row matrix, the decode pages and the stand-in load headlessly, gating counts only, and every scenario renders to a **1280×720** display (a whole multiple of 640×360; it was 960×540) — [The TV render bench](#the-tv-render-bench-r0-02). Not part of `pnpm test`; CI runs it after the build — see [debug-and-replays.md](debug-and-replays.md#the-stress-benchmark-pnpm-bench), [release-hardening.md](release-hardening.md#benchmarks-every-zone-and-the-soak) and [rendering-and-shell.md](rendering-and-shell.md#measuring-render-performance-m3-02c) |
| `pnpm bench:tv` | R0-02: `turbo run build:bench` for `@shmup/tizen` and `@shmup/webos` — the **TV render bench** widgets into `apps/tizen/dist-bench/` and `apps/webos/dist-bench/`, each followed by its bundle check (`check-bundle.mjs dist-bench`). Set `VITE_REPORT_URL` to stream the results to the input probe's log server — [The TV render bench](#the-tv-render-bench-r0-02) |
| `pnpm bench:tv:package` / `pnpm bench:tv:install` | R0-02: `pnpm --filter @shmup/tizen bench:package` / `bench:install` — `apps/tizen/scripts/tizen-bench.mjs` runs the Tizen CLI wrappers on `dist-bench/` under the bench's app id, so it installs next to the game. **Never run in CI or here** — the owner runs them from the Windows desktop (plan R0-03) |
| `pnpm format` / `pnpm format:check` | Prettier write / check (research docs at the root are ignored) |
| `pnpm clean` | Removes `dist/`, `coverage/`, `.turbo/` everywhere (never `node_modules`) |
| `pnpm assets` | Placeholder asset pipeline (`scripts/generate-assets.mjs`): sprite pixel maps, procedural generators, PNG overrides and fonts → `assets/generated/atlas/main.png` + `main.json`; skipped when inputs are unchanged; `--force` rebuilds, `--out DIR` / `--source DIR` redirect, `--quiet` silences; exit 1 lists invalid sources. Also runs before every `build` / `dev` (Turborepo `//#assets`) and inside Vite builds (`shmupAssets()`). See [asset-pipeline.md](asset-pipeline.md#running-it) |
| `pnpm content:check` | Validates every JSON file under `content/` with `loadContent()` from `@shmup/core` — the shipped files and the `example.*.json` samples as two independent sets, plus the README format samples — and checks that every sprite name of the shipped content exists in the atlas; the foreign kinds go through their owners, and `content/audio/` is also checked for sound (every `SFX_CUES` cue bound, audible, unclipped, short; every song looping sample-exactly; every cue a shipped stage names prepared and bound — M1-15) (`test/integration/content.test.ts`; also part of `pnpm test`). See [content-data.md](content-data.md#commands) |
| `pnpm content:tiled <map.tmj>` | Converts a Tiled JSON map into stage content (`scripts/content/tiled-import.mjs`, M2-07): the tile layer → `tilemap.rle`, objects → events / camera keys / checkpoints / triggers / blocks / branches, polylines → a `paths` file; writes `content/stages/<id>.stage.json` (+ `content/paths/<id>.paths.json`), warnings on stderr. Options `--id ID`, `--stages DIR`, `--paths DIR`, `--print`. Run `pnpm format` and `pnpm content:check` afterwards — see [advanced-stages.md](advanced-stages.md#importing-a-tiled-map-pnpm-contenttiled) |
| `node scripts/content/rescale.mjs --factor K [--top-pad P] [--dry-run]` | R1-03 (no `pnpm` script): ports `content/` (and the `example.*.json` samples; `demos/` skipped) to a new world scale by the **unit** of every number, rewriting only the changed values and formatting with Prettier; prints what a port must look at by hand; refuses to write (exit 1) while a value is unclassified or a file invalid, exit 2 on bad arguments or an art scale the atlas contradicts. Other options: `--root DIR`, `--no-examples`, `--from-width W`, `--from-height H`, `--tile-size T`, `--to-width W`, `--atlas FILE`, `--art-scale S`, `--force-art-scale`, `--json`, `--quiet`. `--factor 1 --dry-run` changes nothing on the shipped content and `--factor 1.5 --top-pad 36 --dry-run` classifies every value; the real ×1.5 run is plan R2-02's (its flags there) — see [content-data.md](content-data.md#units-and-the-rescale-tool-r1-03) |
| `pnpm store:assets` | M2-18: draws the icon set and the store-listing placeholders from the placeholder art (`scripts/store-assets.mjs`): the committed icons `apps/tizen/public/icon.png` (512 × 423), `apps/electron/build/icon.png` (512 × 512) and — since M3-03 — `apps/webos/public/icon.png` (80²) and `largeIcon.png` (130²), and the git-ignored `assets/generated/store/` (icon, four 1920 × 1080 placeholder screenshots, `listing.json`). `--check` exits 1 when a committed icon differs from a fresh rendering (`pnpm test` checks the same); `--out DIR` writes the store folder elsewhere. Run it and commit the icons after changing the logo, the ships or the script — see [release-hardening.md](release-hardening.md#icons-and-store-listing-placeholders) |
| `pnpm itch:package` | M3-03: packs `apps/web/dist` into the ZIP itch.io wants (`scripts/itch-package.mjs` → `assets/generated/itch/shmup-cup-web.zip`): `index.html` at the root, no source maps, a zero-dependency deflate with fixed timestamps so the archive is byte-identical for the same build. `--dist DIR` / `--out FILE`. **Never run in CI, and never run against a real build here** — the upload is the owner's ([docs/client/web-release.md](../client/web-release.md)) |
| `pnpm audio:preview` | Renders every synthesized SFX cue and chip song of `content/audio/` to 16-bit mono WAV files in `assets/generated/audio-preview/` (git-ignored) for listening — a looping song as intro + loop + loop so the seam can be heard — and prints each file's `pcmHash` and a song's loop points (`scripts/audio-preview.mjs`, loads `@shmup/audio-web` through Vite's `ssrLoadModule`; `--out DIR`, `--only NAME`, `--quiet`). See [audio.md](audio.md#pnpm-audiopreview) |
| `pnpm trig:tables` | Regenerates the committed `packages/core/src/math/trig-table.ts` (`scripts/gen-trig-tables.mjs`; `--check` verifies, `--out FILE` writes elsewhere). Re-run it in the same commit whenever the script changes — a test diffs the committed file |

Per project: `pnpm --filter <name> <script>`, e.g. `pnpm --filter @shmup/core test`,
`pnpm --filter @shmup/tizen build`. The two browser apps also have `build:test` (`vite build
--mode test` — what `pnpm test:e2e` builds) and `build:dev` (`--mode development` — the on-device
debug build): both are the release code plus the debug tools (`__SHMUP_DEV__` true — M1-19,
[debug-and-replays.md](debug-and-replays.md#release-builds-and-dev--test-builds)); plain `build`
never contains them. Since R0-02 `apps/tizen` and `apps/webos` also have `build:bench` (`vite build
--config vite.bench.config.ts --mode bench` → `dist-bench/` + the bundle check — what `pnpm bench:tv`
runs) and `apps/tizen` has `dev:bench` (the bench page in a desktop browser). Extra arguments go to the
tool: `pnpm --filter @shmup/core test loop` runs only test files whose path contains `loop`.

## Turborepo

`turbo.json` defines the task graph:

- `build` depends on `^build` (dependencies first) and on the root task `//#assets`, and
  caches `dist/**`; so do `build:test` and `build:dev` (M1-19 — the apps' test and debug
  builds; the packages have no such script, so `^build` builds them normally).
- `build:bench` (R0-02, the TV render bench) has the same dependencies, caches `dist-bench/**`
  and keys on the `VITE_REPORT_URL` and `SHMUP_BUILD_ID` variables. The webOS stub bundles the
  bench's sources from `apps/tizen`, which turbo would not hash for `@shmup/webos` (it does not
  depend on `@shmup/tizen`), so it has **its own entry, `@shmup/webos#build:bench`**, whose
  `inputs` add `apps/tizen/bench/**`, `src/**`, `scripts/**`, `vite.config.ts`, `tsconfig.json`
  and `package.json` — without them a bench edit replayed a stale webOS stub. **Any change to the
  generic `build:bench` (dependencies, env, outputs) must be repeated in that entry.**
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
  any package, yet the app builds inline `content/` through `virtual:shmup-content`, emit the
  atlas manifest and pages and record the manifest's digest through `virtual:shmup-assets` (R1-05 —
  the groups file `assets/source/atlas-groups.json` is covered by `assets/source/**`), the app
  tsconfigs include
  `types/virtual-modules.d.ts`, and the test tasks run real builds. Without them, editing
  only a content file or a sprite would replay a cached `dist/` with stale inlined data.
  Any new root-level input a task reads belongs here too — `scripts/frame.mjs` joined in R1-02
  (`64f106f`) because the webOS manifest check imports it, which `tv-engine-floor.test.ts`'s
  cache-key check caught.

A cache hit prints `cache hit, replaying logs`. To force a rerun: `pnpm turbo run build --force`.

## Build outputs

| Project | Output | Notes |
|---|---|---|
| `packages/*` | `dist/*.js` + `.d.ts` (ES2018) | `tsconfig.build.json` switches the `@shmup/source` condition off so dependents' types come from `dist/` |
| `apps/web` | `apps/web/dist/` (+ `assets/atlas/main.json` and its pages `main.png` …) | Vite default (modern) target, `base: './'` (relocatable — required by Electron's `app://`) |
| `apps/tizen` | `apps/tizen/dist/`: `index.html`, `app.js`, `config.xml`, `icon.png`, `assets/atlas/main.json` + `main.png` … `main-9.png` (15 files since R1-05) | Chromium 69 contract below; packaging adds a `.wgt` next to them. `build:test` / `build:dev` write the **same folder** — the last build wins, so rebuild with `build` before packaging a release |
| repo root | `assets/generated/atlas/main.png` (+ `main-1.png` …), `main.json`, `assets/generated/.asset-cache.json` | `pnpm assets` / `//#assets`; git-ignored. Since R1-05 ten pages — `main.png` = `common`, `main-1.png` … `main-9.png` = zones A–I. The app builds copy the pages **and the manifest** (until R1-05 the manifest was inlined into `app.js`) |
| `apps/webos` | `apps/webos/dist/`: `index.html`, `app.js`, `appinfo.json`, `icon.png`, `largeIcon.png`, `assets/atlas/main.json` and its pages | M3-03: the Tizen contract below, for webOS 5+ (Chromium 68 — one release older, so the same target and polyfill pair cover both). `scripts/check-bundle.mjs` imports the Tizen budgets. Packaging writes an `.ipk` into `release/`; **nothing here has been packaged or run on a device** |
| `apps/electron` | `dist/main/*.js`, `dist/preload/preload.cjs`, `dist/renderer/` (copy of `apps/web/dist`) | Needs `@shmup/web` built first (Turborepo does it) |
| `apps/tizen`, `apps/webos` (bench) | `dist-bench/`: `index.html`, `app.js`, `config.xml` / `appinfo.json`, icons, `assets/atlas/` (the density atlases upscaled from the ungrouped source atlas — eight densities ×1 … ×2.67 since the owner's R0-03 matrix follow-up — and, since R1-05, the decode scenario's `decode-<id>.png` pages: the stand-in zone A group plus the shipped `common` and zone A pages since R3-04.M4a) | R0-02: the TV render bench widget, never the game; git- and Prettier-ignored; `pnpm clean` removes it. `bench:tv:package` writes `ShmupCupBench.wgt` there |

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
  uses it) is prepended to `app.js` as the post-minification banner, and
  `polyfills/string-match-all.js` (plain ES5; `matchAll` arrived in Chrome 73 and PixiJS
  8.22 calls it in the shader-sampler parse) right after it.

`scripts/check-bundle.mjs` runs after every Tizen build and fails it unless dist/ has
exactly one script `app.js`, `index.html` loads it as a deferred classic script, `app.js`
**parses with acorn as an ES2018 script** and starts with the polyfill banner pair (the
globalThis one opening the file, the matchAll one right after — rule 4 checks both),
`config.xml` / `icon.png` are present, every other file lives under `dist/assets/`
(the atlas pages — anything else would be packaged into the `.wgt` by accident), and at
least one atlas page exists under `dist/assets/atlas/` (without it the widget can only show
the boot error screen), and — since M1-19 — the **budgets** hold: `app.js` ≤ 512 KB gzipped
(`APP_JS_GZIP_BUDGET`; 350 KB until M2-16, 384 KB until M3-02), every atlas page a readable PNG of at most 2048² (`ATLAS_PAGE_MAX_SIZE`),
the whole `dist/` ≤ 16 MB (`DIST_BUDGET`; 8 MiB until R3-04.M2b). The OK line prints the sizes against them
(M1-19: `app.js` 773.6 KB, 228.6 KB gzipped; `dist/` 812.4 KB; after M2-11 `app.js` is 307.5 KB
gzipped, after M2-12 313.5 KB, after M2-13 320.3 KB, after M2-14 331.5 KB and after M2-15
**343.8 KB** — the content of every zone is inlined, each pair of zones adds ≈ 6–11 KB; all nine
zones and the endings are in: [zones-h-and-i.md](zones-h-and-i.md#bundle-budget); M2-15's front
end added ~9 KB of scene code and ~3 KB of demos —
[front-end-and-attract.md](front-end-and-attract.md#budgets-string-slots-and-the-bundle); after
M2-16 **≈ 359 KB** — the two UI string tables ≈ 6 KB, the Options pages and the rebinding ≈ 9 KB —,
so M2-16 raised the budget to 384 KB
([options-rebinding-and-accessibility.md](options-rebinding-and-accessibility.md#budgets)); M3-01
took it to **374.7 KB**, leaving ≈ 9 KB, so before M3-02 the owner set **512 KB** as the agreed
ceiling (M3-02's shaders, Mode-7 floor, CRT pass, black-hole module and two new stages took it to
**383.4 KB**) — room to spend, not a target, and going above it needs their say-so (M2-18's boot-time
check still guards the launch, which is the real constraint). **R1-05 moved the atlas manifest out
of `app.js`** (406.7 → 384.3 KB gzip, −22.4 KB; ≈ 376 KB since), and **rule 10**
(`checkAtlasManifest`) keeps it out: the game widget must ship `dist/assets/atlas/main.json` that
parses (format 1 or 2) and lists every page with its real pixel size, no atlas PNG may be unlisted,
and `app.js` may name at most `MAX_INLINED_FRAME_NAMES` (8) atlas frames — the inlined manifest named
all ~1,400, so more means it was inlined by accident (the bench widget, which inlines its own
density atlases, is exempt). `DIST_BUDGET` is **16 MiB since R3-04.M2b** (owner decision
W5-16; it stayed 8 MiB from W3-4 until the stand-in art could be projected): the script's docblock
carries the projection — stand-in atlas 3,401,438 B + `app.js` raw 1,450,743 B + manifest and
widget files 211,360 B + recorded audio 6,002,830 B ≈ 10.55 MiB, a margin of ≈ 5.45 MiB — and its
three ceilings; R6-02 adjudicates them with new measurements, never to quiet the check
([platform-polish.md](platform-polish.md#memory-budget-shmupshell-memory)). Since R2-01's flip the interim ×1.5 art
and the 640-frame code ride these budgets: the check's OK line read **379.9 KB gzip of 512.0 KB**
at the flip itself and **380.2 KB of 512.0 KB** at the end of the step's work (`bc8e05d`;
1,432,504 B raw), and the webOS check of the same tree **379.9 KB of 512** — C5's figure at
`e7ff5db`, not re-verified since. A release build must also carry
no debug code (`tizen-build.test.ts` looks for `__shmupDebug` / `debug-overlay`).
`apps/tizen/test/build/tizen-build.test.ts` also executes the bundle in a V8 realm with
`globalThis` deleted.

Syntax is lowered by the build, **APIs are not polyfilled** — so runtime APIs newer than
the TVs' engines must not be used in shipped code. `eslint-plugin-compat` (browserslist
`chrome >= 69`) catches most; extra rules ban the common offenders (list in
[conventions.md](conventions.md#chromium-68--69-rules-the-tv-engine-floor)).

> **The floor is 68, not 69.** `apps/webos` targets LG webOS 5, which is Chromium **68** —
> one release older than Tizen's 69, and one release below the lint's browserslist floor. The
> two APIs in the gap, `Array.prototype.flat` and `flatMap`, therefore **pass the lint** and
> would throw on an LG set; `test/integration/tv-engine-floor.test.ts` is what catches them,
> and [conventions.md § Two TVs, two engines](conventions.md#two-tvs-two-engines) explains what
> that scan does and does not cover. The syntax half is safe for both engines because the
> target list's `es2018` entry, not its `chrome69` entry, decides what is emitted.

`pnpm --filter @shmup/tizen dev` serves the Tizen entry in a desktop browser on port 5174
(no `window.tizen`: key registration is skipped and there is no `platform.exit`, so the title
has no EXIT item and Back never exits — it still pauses and backs out of menus). Opening
`apps/tizen/dist/index.html` straight from disk in desktop Chrome needs
`--allow-file-access-from-files`: Chrome gives every `file://` URL its own origin, so WebGL
refuses to upload the atlas page; the TV serves the widget's files as same-origin.

## The webOS build (M3-03)

`apps/webos` builds the same way and on purpose shares the Tizen contract rather than
restating it: the same `target: ['chrome69', 'es2018']`, the same IIFE / classic-script
rules, and **the same polyfill files** — `apps/webos/vite.config.ts` reads
`../tizen/polyfills/global-this.js` and `../tizen/polyfills/string-match-all.js` instead of
keeping copies, so the two cannot drift.
`apps/webos/scripts/check-bundle.mjs` **imports** `APP_JS_GZIP_BUDGET`,
`ATLAS_PAGE_MAX_SIZE`, `DIST_BUDGET` and `POLYFILL_BANNER` from the Tizen check and adds
only what differs: its own file set (`app.js`, `appinfo.json`, `icon.png`, `index.html`,
`largeIcon.png`) and the `appinfo.json` rules that `scripts/appinfo.mjs` validates —
which is what stands in for the `ares-package` nobody here can run.
`test/integration/tv-engine-floor.test.ts` pins all of that shared-ness.

```sh
pnpm --filter @shmup/webos build            # dist/ + the bundle check
pnpm --filter @shmup/webos webos:package    # ares-package  → release/<id>_<version>_all.ipk
WEBOS_DEVICE=tv1 pnpm --filter @shmup/webos webos:install
WEBOS_DEVICE=tv1 pnpm --filter @shmup/webos webos:run
```

`ARES_BIN=<path>` points the wrappers at an SDK that is not on `PATH`.
**None of the three `ares-*` wrappers has ever been executed** — there is no LG TV, account
or SDK here, so they are covered only by tests that assert the command lines they would run.
The device recipe and the on-hardware checklist are in
[../client/webos.md](../client/webos.md); the adapter itself in
[platform-polish.md](platform-polish.md).

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
:: tizen package -t wgt -s shmupcup -- apps\tizen\dist (old .wgt removed first; the new
:: "Shmup Cup.wgt" is renamed ShmupCup.wgt — the monitor cannot install a name with a space)
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

## The TV render bench (R0-02)

A second widget built from `apps/tizen`, **next to** the game: it measures what a frame costs on
the M7 across a sweep of fifteen internal frames in two art-density modes (`scaled` — the same
world at higher density, the ×s atlas modelled as the real page scaled and re-packed; `native` —
more world at the original size) with a density-scaled synthetic scene (the real atlas upscaled
×1 / ×1.5 / ×2.25, five parallax layers, ~35 % terrain, 64 enemies, 512 bullets, 512 point items,
512 particles, the HUD bars), six variants per size, plus 22 knob rows (upscale modes,
interpolation, output resolution) — **172 scenarios, one per page load**
([plan_resolution.md](../../plan_resolution.md) R0-02, §13; the owner's R0-03 follow-up grew the
matrix from R0-02's 18, which keep their ids). Then a run loads the page twice more. The
**decode scenario** (R1-05 B4, decision W3-6; page model replaced by R3-04.M4a, decisions RR-8 /
W5-17): the PNG pages `apps/tizen/scripts/bench-decode.mjs` generates at bench-build time into
`dist-bench/assets/atlas/decode-<id>.png` — the stand-in zone A's own PNG-8 page or two, packed
through the real pipeline into the RR-7 byte band (0.3–0.6 MB per 2048×1024) that v2 zone pages
will ship in, plus the shipped `common` and zone A pages for reference (since R2-01's flip those
two **are** the ×1.5 shipped pages, so decode rows from before and after the flip are not like for
like; `bench-decode.mjs`'s docblock says so; the owner's R0-03 capture should name the side of the
flip it ran on) — fetched by XHR, decoded by an `HTMLImageElement` and uploaded through the
renderer's `uploadTextureSource`, eight times each with every stage timed (median / p95) and the
textures released between repetitions; `createImageBitmap` decodes them too for comparison. The
run's **last page load, `standin-zone`** (R3-04.M4a), draws one 640×360 frame from the stand-in
pages it just decoded, through the real bindings, measured like a render scenario. Its results
**never block** the plan. The bench folder shares the game's `DIST_BUDGET`:
`turbo run build:bench --force` measured **3,943.0 KB** on Tizen and **3,940.0 KB** on webOS of
the 16,384.0 KB at `7baeb4d`.

| | Game | Bench |
|---|---|---|
| Entry | `apps/tizen/index.html` → `src/main.ts` | `apps/tizen/bench/index.html` → `src/bench/` |
| Build | `build` (`vite.config.ts`) | `build:bench` (`vite.bench.config.ts`, mode `bench` — a dev-build mode, `DEV_BUILD_MODES`) |
| Output | `dist/` | `dist-bench/` |
| Tizen app id | `ShmpCupGam.ShmupCup` | `ShmpCupBnc.RenderBench` (`config-xml.mjs` `benchConfigXml` rewrites the game's `config.xml`) |
| webOS id | `dev.shmupcup.game` | `dev.shmupcup.renderbench` (the same page, built by `apps/webos/vite.bench.config.ts`) |

Both follow the Tizen build contract (one classic ES2018 IIFE, the polyfill banner pair, a classic
script tag) and pass the same bundle check, run on the folder (`check-bundle.mjs dist-bench`); its
**rule 9** keeps them apart — a widget with the bench's app id must hold the bench marker in its
`app.js`, the game must not. The CLI wrappers take `TIZEN_DIST_DIR` / `TIZEN_APP_ID` (webOS:
`WEBOS_DIST_DIR`, `WEBOS_RELEASE_DIR`, `WEBOS_APP_ID`), which `apps/tizen/scripts/tizen-bench.mjs`
and `apps/webos/scripts/webos-bench.mjs` set for the bench in their own process (cmd.exe has no
`VAR=value cmd`).

**The run on the monitors (plan R0-03, the owner's — never here):**

```powershell
# 1. on the desktop: the log server
cd tools/input-probe; npm run log-server
# 2. from the repository root: build both widgets with the server's address baked in
$env:VITE_REPORT_URL = "http://<desktop-ip>:8787"; pnpm bench:tv
# 3. package and install next to the game, then launch
$env:TIZEN_PROFILE = "shmupcup"; pnpm bench:tv:package     # apps/tizen/dist-bench/ShmupCupBench.wgt
$env:TV_IP = "192.168.1.50"; pnpm bench:tv:install
pnpm --filter @shmup/tizen bench:run
```

4. On each monitor press **Enter** (the page says "172 scenarios + decode + stand-in" with its own
   minute count — about 90 minutes: per scenario 10 s warm-up, 14 s free-running and 6 s with
   `gl.finish()` after every render, the page reloading in between); then the decode page loads
   (`R1-05 DECODE 173/174 GL1 <page> <rep>/8`) and, last, the stand-in frame draws (`R3-04
   STAND-IN 174/174`). **Red** re-runs the current scenario (after a whole run: the stand-in load),
   **Back** exits. Photograph the results table it draws at the end — and the **`DECODE (R1-05)`** table under
   it (per page `FETCH50`, `DEC50` / `DEC95`, `UPL50` / `UPL95` with `gl.finish()`, `TOT50` / `TOT95`,
   `FIRST` — the coldest repetition —, `BMP50` / `BMPUP` for `createImageBitmap`; `NOTE` lines flag a
   failed stage). A page noted `decoded from the URL instead` means the TV refused `file://` XHR — the
   game's manifest fetch would fail too: report it.
5. Run it again on WebGL 2: `localStorage['shmup-cup:gl'] = '2'` in the Web Inspector
   ([above](#the-remote-web-inspector-devtools-on-the-tv); the app id is `ShmpCupBnc.RenderBench`).
6. Each scenario was POSTed as a `render-bench` payload; the sessions are
   `tools/input-probe/logs/rb-*.jsonl`. Commit them to `tools/input-probe/results/<date>-m7-bench/` and
   print the tables with `node results/analyze-bench.mjs <gl1>.jsonl <gl2>.jsonl` — every scenario
   relative to the same session's 384×216 rows, §13's verdicts, and WebGL 1 against WebGL 2, then the
   **"Decode and upload"** section (per page median / p95, ms per megapixel) ending in R3-04's
   zone-load estimate against the 2 s target (decision W5-19): a session recorded since R3-04.M4a
   is estimated from **the pages it measured** — `common` plus the stand-in zone's own page or two,
   each at its own median, no page-count multiplier — while an older session falls back to the
   synthetic shape (`common` = one RGBA 2048² page + two PNG-8 2048² zone pages); both print a
   **cold load** (fetch + decode + upload — a lazy zone load) and a **zone change today** (policy
   "all": decoded at boot, uploaded at the change). The `standin-zone` record is kept out of the
   campaign aggregation and printed on its own line. They go into `input-probe-results.md` §12
   (plan R0-03).

The results also stay in the widget's `localStorage` until the next run, so a crash loses nothing.
`pnpm --filter @shmup/tizen dev:bench` serves the page in a desktop browser (`?scenario=<id>` runs
one scenario — `?scenario=decode` the decode scenario (`?reps=` 1–50 its repetitions), `?scenario=standin-zone` the headless twin of the stand-in draw (plan R3-04.M4b; `test/bench/render.perf.ts` gates it) —, `?warmup=`
/ `?measure=` / `?sync=` shorten the phases, `?gl=2`). `pnpm bench` builds the widget and opens
every scenario headlessly, `?scenario=decode&reps=2` and `?scenario=standin-zone` included. The webOS stub is
build-only: `pnpm --filter @shmup/webos bench:package` / `bench:install` are written, never run.
Details: [`apps/tizen/README.md`](../../apps/tizen/README.md),
[input-probe.md](input-probe.md) (the log server and the analyzer),
[rendering-and-shell.md](rendering-and-shell.md#the-tv-render-bench-r0-02) (what is measured).

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
**window** (fullscreen — **F11** / **Alt+Enter** —,
the scale of the game frame (384×216 at M2-17; 640×360 since R2-01) — **Ctrl+=** / **Ctrl+-** /
**Ctrl+0**, Cmd on macOS —, the position) and the web build it loads runs as platform
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
  [zones-f-and-g.md](zones-f-and-g.md#playtests-and-the-recovery-rule)). R5-P.P3 (`c284b78`) later
  split the pair recovery files into one per zone — `zone-<letter>-recovery.test.ts`, A through I.
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
- **Benchmark** (M1-19): `pnpm bench` (above) — not part of `pnpm test`; CI runs it (since
  M3-02c after installing Playwright's Chromium). The render bench's DOM-free core *is* part of
  `pnpm test`: `test/bench/render-harness/load.ts` (the scripted load and its tick order),
  `bench-gates.ts` (the budgets and `renderBenchViolations`) and `protocol.ts` (the wire types) are
  driven against the real simulation by `test/integration/render-bench.test.ts`, so a bench that
  would measure an empty scene fails in the ordinary suite. So, since R0-02, is the TV bench's:
  `test/integration/tv-render-bench.test.ts` checks its gate (`tvBenchViolations`), the headless
  driver's wiring and the records → log server → analyzer chain, and `apps/tizen/test/bench/` the
  widget's matrix, scene, sampler, results table and state — those build the atlas in memory with the
  pipeline, because CI's test shards run without `pnpm assets`. Since R1-05 that includes the decode
  scenario (`bench-decode.test.ts` — the measurement on fake hosts, the run length 19, the DECODE
  table, stored states from before it; `apps/tizen/test/scripts/bench-decode.test.ts` — the
  generated pages' sizes, encodings and byte bands) and the ungrouped source atlas the density pages
  come from (`bench-atlas.test.ts`: still 1 / 1 / 2 pages, density 1 the ungrouped one-page atlas
  byte for byte, every frame of the zone-split game atlas pixel for pixel).
- **The atlas (R1-05)** — `test/integration/atlas-groups.test.ts` (the groups file equals its
  derivation; every campaign zone needs exactly `common` + its own pages), `atlas-zone-sprites.test.ts`
  (11 golden runs: every sprite drawn is in its zone's set), `cjk-budget.test.ts` (the split's PNG
  budget), the pipeline's `png-indexed` / `packer-groups` / `pipeline-groups` tests, the shell's
  `loader-manifest` / `boot-manifest` / `boot-residency` / `residency-eager` / `memory-hand` /
  `debug-atlas`, render-pixi's `renderer-upload`, the bundle checks' `check-bundle-manifest` (rule 10)
  and `test/e2e/atlas-residency.spec.ts` — see [asset-pipeline.md](asset-pipeline.md#tests) and
  [rendering-and-shell.md](rendering-and-shell.md#tests).
- **v2's frame guards** (plan R1-01, R1-02 — [conventions.md](conventions.md#frame-numbers-the-literal-scan-and-the-fingerprint)):
  `packages/core/test/frame-literals.test.ts` fails on a literal frame number in `packages/core/src`
  outside its allow-list, and `test/integration/frame-literals-repo.test.ts` does the same for the
  other packages, the apps' `src/` and `scripts/` and the root `scripts/` (one scanner,
  `packages/core/test/helpers/frame-literal-scan.ts`); `test/scripts/frame.test.ts` and
  `apps/electron/test/main/window-frame.test.ts` pin the two mirrors of the constants to core
  (`scripts/frame.mjs` — also the e2e boss-bar formula against core's real `buildHud` — and Electron's
  `FRAME_WIDTH` / `FRAME_HEIGHT`). `test/integration/presentation-fingerprint.test.ts` hashes core's
  presentation output along 12 scripted walks (119 segments) and `packages/shell/test/frame-fingerprint.test.ts`
  the shell's own scenes along five — both stay green without an edit until a step changes what is drawn on
  purpose, which re-pins them with `SHMUP_FINGERPRINT_PRINT=1` and says why in the commit.
  `test/integration/tile-size.test.ts` (R1-04) holds the shipped tilesets and stages to `TILE_SIZE`.
- **Content units** (plan R1-03 — [content-data.md](content-data.md#units-and-the-rescale-tool-r1-03)):
  `test/integration/content-units.test.ts` fails on a number of any content kind without a unit (core's
  side in detail: `packages/core/test/data/content-file-units.test.ts`, `behaviors/behavior-param-units.test.ts`);
  `test/integration/content-db-fingerprint.test.ts` hashes everything the loaders produce from the shipped
  content and the examples, so a schema change that moves a parsed value fails; `test/scripts/content/rescale.test.ts`
  and `rescale-edge.test.ts` cover the rescale tool (fixtures, the shipped content at factor 1 and at the real
  v1 → v2 geometry, the command line).
- **The v1 baseline** (for R2-02, `test/golden/v1-baseline*.test.ts`): every shipped stage's ticks,
  spawns and boss timings at 384×216 in `test/fixtures/v1-baseline/` — since R2-01's flip these are
  the frozen v1 record: the re-run is skipped and re-recording refused
  ([test/golden/README.md](../../test/golden/README.md#the-v1-baseline-r2-02)).
- **Docs images** (R2-01 → R2-03, done): the flip made the committed `docs/images/logo.png` a
  frame behind — `doc-images.mjs`'s `buildLogoBanner` is `FRAME_W` wide — and R2-03 regenerated
  every picture (`356e7b2`). `pnpm docs:images --check` still compares them against the code; the
  check is not in CI.
- **The ingest tool** (`art-prompts/ingest/`, R3-02) is a standalone npm project with its own
  `node:test` suite (`cd art-prompts/ingest && npm ci && npm test`), outside `pnpm test`; its CI job
  also runs `node ingest.mjs --check`. In `pnpm test`, `test/scripts/assets/provenance.test.ts`
  checks every real-art override's provenance ([real-assets.md](real-assets.md#the-ingest-tool-art-promptsingest)).
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
  drawn on the Tizen build from `file://` (`zone-b.spec.ts`, `zone-c.spec.ts`, M2-11 — one file per zone since R5-P.P5d `9592777`, over the shared `zone-helpers.ts`), and zones D and E:
  `?stage=zone-d`'s volcano peaks, its palette-cycled lava lake rising into view with the dive and
  CINDER BASTION's hull fighting down in the caves with its shield arms turning, `?stage=zone-e`'s
  palette-cycled storm clouds over the jagged ridge and SQUALL STEED opening its chest, and both
  bosses drawn on the Tizen build from `file://` (`zone-d.spec.ts`, `zone-e.spec.ts`, M2-12 — one file per zone since R5-P.P5d), and zones F and G:
  `?stage=zone-f`'s palette-cycled cell wall (its pixels recoloured as the cycle steps) over the
  fleshy folds and MANTLE REGENT fighting with its tentacles curling in, `?stage=zone-g`'s
  palette-cycled crystal facets over the spires and FACET MONARCH waving its arms, and both bosses
  drawn on the Tizen build from `file://` (`zone-f.spec.ts`, `zone-g.spec.ts`, M2-13 — one file per zone since R5-P.P5d; zones H and I stand in `zone-h.spec.ts` and `zone-i.spec.ts` likewise), and the Options pages of
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
  (`test/e2e/frame-advance.ts`, M1-19). Since R2-01's C5 review 2 (`c67c7c9`) the rule is the wider
  one: **an e2e wait counts game ticks**, never rAF frames or seconds of wall time — the helpers in
  `test/e2e/ticks.ts` (since `8ff2bf6`) read `window.__shmupDebug.tick` (`waitTicks`, `pollTicks`,
  `expectScene`; `tap` / `remoteTap` pace a press in ticks (a held key: `waitTicks`);
  `remoteSequence` sends a key sequence the host times in milliseconds — the Tizen debug unlock —
  in one `page.evaluate`). Wall time stays only for what is not ticks: the boot
  (`BOOT_TIMEOUT_MS`, 30 s), real-time page work (audio started, a screenshot decoded, a console
  line), the host-timed TV-unlock sequence, which `remoteSequence` sends in one `page.evaluate`,
  and a test's own timeout, sized for a slow runner (the campaign-run web test: 420 s); a wait
  stays in rAF frames only where no tick runs (a frozen sim, a hidden page), where a tick wait
  would hang instead of failing, or where it waits for drawn frames — each such spec's docblock
  says why. The full rule: [conventions.md § Tests](conventions.md#tests). Since M1-19 the suite
  runs
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

Since R2-01's flip the pages render the 640×360 frame into a **1280×720** e2e viewport
(`test/e2e/frame-pixels.ts` `VIEWPORT` — the frame at `CAPTURE_SCALE`, ×2; it was 1152×648 at ×3):
software rasterisation of the bigger picture makes every test about **×1.8 slower** (C5's CI
comparison of the 143 tests run at both sizes: median ×1.83), and a CI shard now takes up to about
**6 min**. Because the waits count game ticks ([Tests](#tests)), the slowdown costs wall time, not
correctness. Retries come from `CI=1` (`playwright.config.ts` `retries: ci ? 1 : 0` — the run
helpers export it), so a local flake repeat must pass `--retries=0` (with `--repeat-each=N`).

| Variable | Default | Effect |
|---|---|---|
| `VITEST_MAX_WORKERS` | `cores − 1` | Vitest's own: the worker pool of `pnpm test` (lower it to share a busy machine) |
| `E2E_WORKERS` | `max(2, ⌊cores / 5⌋)` | Playwright browsers of `pnpm test:e2e` |

Do not turn on Vitest's `fsModuleCache`: with it render-pixi's `sprites-interpolation` guard
measured over its budget one run in four (the cached module code tiers up differently; measured
with render-pixi's earlier probe, not retried since).

## Release lines

Two lines are built, tested and released independently (plan_resolution.md §3.2, §3.3):

| | `v1.x` | `master` |
|---|---|---|
| What it is | v1, released as tag `v1.0.0` (2026-10-16) | v2, the 640×360 remaster ([plan_resolution.md](../../plan_resolution.md)), released as `2.0.0` (2026-10-24) |
| Resolution | 384×216, forever | 640×360 (384×216 until plan step R2-01 landed) |
| Versions | `1.0.1`, `1.0.2`, … (tags `v1.0.N`) while the line lives | `2.0.0-alpha.N` → `2.0.0-beta.N` → `2.0.0`; released, today `2.0.0` |
| What goes in | bug fixes, fixes from the first hardware runs, store-submission changes, translation corrections — since the `2.0.0` release: **security and crash fixes only, for one year after it, then end of life** (owner, Q-12; below) | everything in the v2 plan |
| What never goes in | resolution, art, level or balance changes | — |
| Releases | GitHub releases from tags on `v1.x` | GitHub releases from tags on `master` |

**`v1.x`'s future (owner decision Q-12, 2026-10-18).** After `2.0.0` the maintenance branch takes
security and crash fixes only — for one year after the release, then end of life. A fix that
applies to both lines still lands there first and reaches `master` by `git cherry-pick -x`.

Every `package.json` (the root, `packages/*`, `apps/*`) carries the line's semver version, and
`tooling-config.test.ts` checks that they agree. The TV manifests take numbers only, so the Tizen
`config.xml` widget version and the webOS `appinfo.json` version are its numeric core (`2.0.0` for
`2.0.0-beta.1` through development, and the identical `2.0.0` now the version is whole;
`config-xml-consistency.test.ts`, `appinfo.test.ts`). v2 ships as an update of
the same apps — the same Tizen id `ShmpCupGam.ShmupCup`, webOS id `dev.shmupcup.game` and desktop
app — so its TV version must stay above v1's. CI runs on every push to either branch.

How a fix moves between the lines:

- A fix that applies to both lines lands on **`v1.x` first**.
- **Since R2-01 landed** (`72b18a1`), content, art and frame constants differ everywhere:
  cherry-pick code fixes with `git cherry-pick -x <sha>` and port content fixes by hand. Never
  merge `v1.x` into `master` again.
- A v2-only change never goes back to `v1.x`.

**A `v1.x` commit that only `v1.x` needs** — its own version lines, text that describes the
maintenance branch — is merged with **`git merge -s ours v1.x`**: the merge records the commits as
taken and keeps `master`'s tree, so the next plain `git merge v1.x` brings in only what came after.
Both `v1.x` commits of R0-01 went in this way (2026-10-17): `f74cf95` took `bde77b5` (the
`1.0.1-dev` versions and the maintenance-line notes in its README and CHANGELOG) and `b37bc69` took
`ef6605c` (its docs describing the 1.0.0 release and the `1.0.1-dev` line). `master` describes the
two lines in its own words instead. Before a plain merge, `git log master..v1.x` shows what it will
take; a commit that mixes a real fix with `v1.x`-only text is split on `v1.x` first, or its fix is
cherry-picked.

## CI

`.github/workflows/ci.yml` on every push to `master` or `v1.x` (the two
[release lines](#release-lines); `v1.x`'s own `ci.yml` has the same trigger) and every pull
request, as parallel jobs on GitHub's 4-vCPU runners — the run takes as long as its slowest job.
Each job installs on its own: `pnpm/action-setup` (version from `packageManager`) →
`actions/setup-node` (`.nvmrc`, pnpm cache) → `pnpm install --frozen-lockfile`, with
`ELECTRON_SKIP_BINARY_DOWNLOAD=1` (Electron is only type-checked, tested and compiled) and
Turborepo telemetry off.

| Job | Runs |
|---|---|
| `format · lint` | `pnpm format:check`, `pnpm lint` |
| `typecheck` | `pnpm typecheck` |
| `test 1/3` … `3/3` | `pnpm test --shard=<i>/3` (golden replays included): Vitest's shards split the test files by path hash |
| `build · benchmark` | `pnpm build` (Tizen budgets included), then `pnpm exec playwright install --with-deps chromium` (M3-02c: the render bench drives a real browser), then `pnpm bench` (M1-19; since M2-18 also every zone under stress and the 30-minute soak, since M3-02c the render bench) alone on its runner — `timeout-minutes: 25` |
| `e2e 1/5` … `5/5` | `pnpm exec playwright install --with-deps chromium`, then `pnpm test:e2e --project=chromium --shard=<i>/5`: each shard builds its own test builds and runs a fifth of the Chromium tests (one retry on CI; since R2-01's flip a shard takes up to about 6 min — SwiftShader software-renders the 1280×720 e2e viewport at ≈ ×1.8 the per-test cost of v1's, [Test concurrency](#test-concurrency)) |
| `e2e · headless Firefox` (`e2e-firefox`, M2-18) | `pnpm exec playwright install --with-deps firefox`, then `pnpm test:e2e --project=firefox`: the cross-engine determinism spec — every golden replay and attract demo in SpiderMonkey against the web build's `?determinism` page ([release-hardening.md](release-hardening.md)) |
| `input probe` | `tools/input-probe` with npm |
| `art ingest · test · recipes up to date` (`ingest`, R3-02) | `art-prompts/ingest` with npm (its own lockfile and cache key): `npm ci`, `npm test` (syntax check + the `node:test` suite on synthetic fixtures), then `node ingest.mjs --check` — every committed recipe under `assets/source/sprites/` and `art-prompts/v2/ingested/` re-run in memory: the PNG and its sidecar on disk must match byte for byte, the provenance record apart from its date ([real-assets.md](real-assets.md#the-ingest-tool-art-promptsingest)) |

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
| Tizen or webOS build fails on rule 10 (`assets/atlas/main.json` …, or `app.js` names N atlas frames) | R1-05: the manifest is missing or does not list the pages as they are (a stale `dist/`, a hand-copied page — rebuild), or the manifest got **inlined** into `app.js` — an app imports `virtual:shmup-assets-inline` instead of `virtual:shmup-assets`. That is only right as the deliberate `file://` fallback (W3-7), and then rule 10 is relaxed in the same change |
| `atlas-groups.test.ts` fails: the groups file differs from its derivation | A content change moved a sprite between zones: `SHMUP_ATLAS_GROUPS_UPDATE=1 pnpm exec vitest run --project integration test/integration/atlas-groups.test.ts`, then `pnpm assets` — never a hand edit ([asset-pipeline.md](asset-pipeline.md#atlas-groups-r1-05)) |
| `cjk-budget.test.ts` fails on `ATLAS_PNG_BYTES_CAP` or a quoted figure | The art grew: the split's PNG bytes passed 256 KiB, or the one-page figures (487,176 px, 140.6 KB …) moved. Raise the cap on purpose with the reason — the wave-15 art rounds did, on the owner's dated carve-out of 2026-10-26 ("ok to go over the budget and to readd that stuff it removed"): `ATLAS_COMMON_PNG_CAP` walked 300,000 → 337,000 with the page's own measured bytes disclosed at every raise, and no gameplay cap ever moved — and update the documents the test names (its `SOURCES`; the v1-scale one-page figures ride `docs/dev/asset-pipeline.md` and its carry asserts together) |
| The game shows a navy screen with a pink title such as `CONTENT ERRORS: 2 PROBLEMS` or `ATLAS PAGE FAILED TO LOAD` | The shell's boot error screen: every line is one problem (`<file>:<json path>: message` for content). Fix the listed content, rebuild a stale atlas (`ATLAS DOES NOT MATCH ITS MANIFEST` — since R1-05 also a cached `main.json` of another build), check that `dist/assets/atlas/main.json` ships (`ATLAS MANIFEST FAILED TO LOAD`, R1-05), or check WebGL (`WEBGL IS NOT AVAILABLE`). The console logs "Shmup Cup failed to start" with the `ShellBootError` — see [rendering-and-shell.md](rendering-and-shell.md#the-boot-sequence) |
| `pnpm test:e2e`: `Executable doesn't exist … chromium` | Playwright's browser is not installed: `pnpm exec playwright install --with-deps chromium firefox` (both engines, once per machine) |
| `pnpm test:e2e`: every `[firefox]` test fails with `Executable doesn't exist … firefox` | Since M2-18 the `firefox` project runs the determinism spec, so plain `pnpm test:e2e` needs Playwright's Firefox too: `pnpm exec playwright install --with-deps firefox` — or run `pnpm test:e2e --project=chromium` for the Chromium tests alone |
| `pnpm test:e2e` hangs or times out creating WebGL contexts | A stale `DISPLAY` (forwarded X display of an SSH session) — the config already strips it for the browser; if you launch Chromium by hand, unset `DISPLAY` |
| `pnpm test:e2e`: port 4173 already in use | Another `vite preview` is running; locally it is reused (`reuseExistingServer`), so make sure it serves a current `apps/web/dist`, or stop it |
| A test fails with `the allocation guard needs node --expose-gc --allow-natives-syntax` | The package's `vitest.config.ts` lacks `defineShmupProject(name, { execArgv: ALLOCATION_GUARD_EXEC_ARGV })` (`vitest.shared.ts`) |
| An allocation test (`… toBeLessThan(…)` on `growth.bytes`) fails | A hot path allocates: a new object / array / closure per tick, or a fractional number V8 boxes (a fractional `let` in a closure, a mixed ternary, a fractional argument) — see [sim-world.md](sim-world.md#zero-allocation-and-the-allocation-guard). Check the test's own fakes too: a fake that logs its calls allocates (the fx gallery guard measured its popups fake). If it fails only now and then and always passes alone (`pnpm --filter <package> test <file>`), the guard is too close to its steady state: a cheap loop needs a warm-up of at least `max(iterations, 20_000)` calls, and a window whose calls meet paths the warm-up never ran may need more windows (`attempts`) — or the guard picks paths by the size of its index instead of its remainders (the windows run indices the warm-up never ran); never raise the budget for it, and report it if it keeps happening. Compiles landing in a window (V8's background threads starved by the load) no longer count — the guard lands them before each round and leaves compiled code out |
| `golden.test.ts` or `demos.test.ts` fails: a hash or the outcome differs | The simulation changed (the demos in `content/demos/` are locked like the goldens since M2-15). Unintended: find the change (the report names the first diverging hash tick). Intended: `pnpm golden:update`, review the diff of `test/golden/*.replay.json`, commit it with the reason — [debug-and-replays.md](debug-and-replays.md#gotchas) |
| `pnpm bench` fails on the median | Timing: run it alone on a quiet machine. On the heap: something in the tick allocates — see the allocation guard rows above |
| `pnpm bench`: `render.perf.ts` fails with `browserType.launch: Executable doesn't exist` | Playwright's Chromium is not installed on this machine: `pnpm exec playwright install --with-deps chromium`. `pnpm install` never downloads a browser |
| `pnpm bench`: `render.perf.ts` fails on draw calls | A render change added a batch break or a pass. Deliberate? Record the new number in `shmup_feat.md` §22 and raise `DRAW_CALL_BUDGET` there and in the two e2e specs — never silently |
| `pnpm bench`: `render.perf.ts` fails on the heap delta | Something allocates inside `renderer.render()` — ours or Pixi's (the Node allocation guards cannot see past that boundary). The leak fixture in the same file shows what a real leak looks like |
| `pnpm bench`: `soak.perf.ts` fails on the heap | The scene flow keeps something per run or per screen (a list that grows, a closure per transition). The soak already leaves V8's code spaces out (`dataHeapBytes`); print its per-minute samples — a leak keeps climbing, JIT warm-up levels off in the second run |
| `frame-literals.test.ts` fails: `… (line N): a frame number — derive it from config` | A literal `384` / `216` / `200` / `208` / `192` / `108` (or the current frame's size) reached `packages/core/src`. Derive it from the `core/config` constants; if it does not mean the frame (a count, an angle, a world distance, a text-sized panel), add an allow-list entry with the reason — [conventions.md](conventions.md#frame-numbers-the-literal-scan-and-the-fingerprint). `the allow-list expects N literal(s)` means an entry went stale: fix its `count` or remove it |
| `frame-literals-repo.test.ts` fails: `… (line N): a frame number — derive it from @shmup/core's constants (in a Node script: from scripts/frame.mjs)` | The same outside core: a frame number in another package's `src/`, an app's `src/` or `scripts/`, or a root script (the path names which). Import the constant from `@shmup/core`, or in a `.mjs` script from `scripts/frame.mjs`; a number that is not the frame (an HTTP status, an alpha, a colour channel) gets an entry in that test's `ALLOWED` with the reason. After R2-01, the mirror entries fail until `scripts/frame.mjs` and Electron's `window-state.ts` flip with core |
| `content-units.test.ts` (or `content-file-units` / `behavior-param-units`) fails: a field without a unit, an unknown tunable | A new numeric schema field needs `unit` (`s.num({ …, unit })`), a hand-made schema `s.custom(…, meta)`, a new behaviour tunable a row in `packages/core/src/behaviors/units.ts` — [content-data.md](content-data.md#units-and-the-rescale-tool-r1-03) |
| `content-db-fingerprint.test.ts` fails | A schema or loader change moved a parsed value of the shipped content or the examples. Unintended: find it. Intended (a content edit, a new field with a default): re-pin it with `SHMUP_FINGERPRINT_PRINT=1` and say why in the commit |
| `rescale.mjs` exits 1 (`refused`) or 2 | 1: a value it cannot classify (no unit, a tunable without a unit, an expression string a rule cannot take) or a file with an error (invalid, a tileset or tilemap at another tile size than `--tile-size`, an RLE row core cannot read, a segment the port would turn inside out) — the report lists them; 2: bad arguments (a `--tile-size` other than core's without `--from-width`, `--from-height` and `--to-width`), or an art scale the atlas' terrain tiles contradict — a missing `--art-scale` on an upscaled atlas, or a given one they disagree with (add `--force-art-scale` only when the parallax bands really are drawn at another scale than the tiles) |
| `presentation-fingerprint.test.ts` fails on a segment | Something core draws moved (a menu, the HUD, a band, a sprite batch) — the entry names the walk, the segment and which of `ui` / `hud` / `world` / `screen` changed. Unintended: find it. Intended (a layout or art step, R2-01's flip, a content change): re-pin with `SHMUP_FINGERPRINT_PRINT=1` and say why in the commit |
| `pnpm bench:tv` builds the Tizen bench but replays an old webOS stub | Something changed what the stub bundles from `apps/tizen` that `@shmup/webos#build:bench`'s `inputs` in `turbo.json` do not list — add it there (and keep that entry in step with the generic `build:bench`); `pnpm turbo run build:bench --force` rebuilds meanwhile |
| `pnpm test`: `store-assets.test.ts` says an icon is out of date | The logo, a ship sprite or `scripts/store-assets.mjs` changed: run `pnpm store:assets` and commit `apps/tizen/public/icon.png` and `apps/electron/build/icon.png` |
| `pnpm test:e2e`: a `determinism.spec.ts` test fails in one browser only | A determinism bug in the core — an engine-dependent `Math` call, a sort without a tie-break: the failure names the first differing hash; see [release-hardening.md](release-hardening.md#cross-engine-determinism-in-the-browser) |
| Tizen build fails with `app.js is … gzipped, over the … budget` (or an atlas page / `dist/` budget) | The bundle grew past a plan budget (`check-bundle.mjs` rule 8). Find what grew (a new dependency, inlined data); raising a budget is a plan decision, not a fix |
| `pnpm test:e2e` specs time out waiting for `window.__shmupDebug` | They ran against release builds (e.g. `playwright test` by hand after `pnpm build`). Run `pnpm test:e2e`, which builds `build:test` first |
| Type errors about `@shmup/*` imports only in `pnpm build` | The library build uses `dist/` typings: a dependency's `build` failed or was skipped — run `pnpm build` from the root so `^build` runs first |
