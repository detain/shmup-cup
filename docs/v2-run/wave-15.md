# Wave 15 — R6-02 / R6-03, the one full suite, `v2.0.0`

> Schedule: `plan_resolution.md` §18 · how to use: `docs/v2-run/README.md` · decisions: `docs/v2-run/decisions.md`
>
> **Run directory:** `RUN_DIR` is `/home/sites/shmup-cup-run` (README common rule 15). The commands below spell the
> path out, so each one runs as typed in a fresh shell; prose that says `RUN_DIR/…` means the same path.

**Steps:** R6-02 (performance and memory on the TV: the analysis of the owner's logs and, only if needed, a TV
profile), R6-03 (docs, the store refresh, the release). · **Gate to start:** wave 14's exit (R6-01 done). R6-02.P3
also needs the owner's capture logs (R6-02.P2's kit, wave 13); without them R6-02 is `waiting on owner` and the rest
of the wave goes on. · **Exit (summary):** the one full suite of the whole run green on `origin/master` (with its
fixes reviewed to zero), a CI look at the final commit, the version `2.0.0`, the docs refreshed, and — after the
owner's explicit OK — the GitHub release `v2.0.0`.

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e / bench |
|---|---|---|---|---|
| 1 TV analysis | `R6-02.P3` → (only if a budget is missed) `R6-02.P4a → P4b` | P3: none (a report); P4a/b: `packages/render-pixi/src/{layers,renderer}/index.ts`, `apps/{tizen,webos}/src/boot`, `packages/shell/src/boot/index.ts` (P4a: the flag travels through `ShellOptions`) | RP files, shell boot (work-time) | e2e at P4 |
| 2 CRT default | (only if needed) `R6-02.P4c`, after P4a if P4a runs | `packages/core/src/config/index.ts` (a per-host user-option default), the save tests; `apps/{tizen,webos}/src/boot` and `packages/shell/src/boot/index.ts` if the default is passed through `ShellOptions` | CORE-CONFIG | e2e |
| 3 WebGL 2 | (only if needed) `R6-02.P4d`, after P4b (or after P4a if P4b is not needed) and after P4c if it runs | `packages/render-pixi/src/renderer/index.ts`, `packages/shell/src/boot/index.ts`, the hosts' boots | RP files, shell boot | e2e |
| 4 store icons | `R6-03.D3` | the four store icons | STORE | none |
| 5 doc images | `R6-03.D4` (after D3 and any P4) | `docs/images/**` | DOCS-IMAGES | `docs:screens` (lock) |
| 6 version + changelog | `R6-03.D1` = `W15.DOCS-A` | the 10 manifests, the version tests, `CHANGELOG.md`, `plan_resolution.md`, `CLAUDE.md` | PLAN | none |
| 7 docs | `W15.DOCS-B`, `W15.DOCS-C` (R6-03.D2 + D5, R6-02's docs) | `README.md`, `docs/client/**`, `docs/dev/*`, `apps/tizen/README.md` | none | none |
| then, alone | `R6-03.D6` **the one full suite** → fixes → loop → `R6-03.D7` | everything that tracks the changes | all (the land lock for re-blesses) | all |
| last | `R6-03.D7.DOCS` (after the release) | `plan_resolution.md` (§17 R6-03), `CHANGELOG.md` (the `[2.0.0]` date, if it changed) | PLAN | none |

- **Order rules:** P4b after P4a; P4d after P4b (or after P4a if P4b is not needed) — both edit
  `packages/render-pixi/src/renderer/index.ts`. The edits of `packages/shell/src/boot/index.ts` and of the TV boots
  (`apps/{tizen,webos}/src/boot`) go one at a time: P4a → P4c → P4d (each only if it runs). D4 after D3 and after any
  P4 (the screens show the TV profile's defaults only on the TV, but a renderer change can move a screenshot); D6
  after **every** other subtask of the wave is on `origin/master` and reviewed to zero; D7 after D6 is green and the
  owner says yes; `R6-03.D7.DOCS` after D7.
- **Reviews:** `R6-02.P3.RV`, `R6-02.P4*.RV` (if any), `R6-03.D3.RV`, `R6-03.D4.RV`, `W15.DOCS-RV`, then
  `R6-03.D6.RV` over the full-suite fixes, then `R6-03.RV` (the release review), and after D7 `R6-03.D7.DOCS.RV`.
- **e2e passes:** two while lanes 1–5 run; D6 runs alone (no other agent) because it runs the full suite.

## What runs here because it was deferred

Every earlier wave ran targeted tests only (the owner's rule). These run **once**, here, as R6-03.D6:

- R2-03's "full definition-of-done suite" (wave 6 ran its targeted exit only);
- R2-04's milestone suite before `v2.0.0-alpha.1` (wave 7 tagged it without one, decision RUN-1);
- R5-10.T10, the milestone suite before `v2.0.0-beta.1` (wave 13, the same decision);
- the whole `pnpm bench`, with the 30-minute soak (`test/bench/soak.perf.ts`) — earlier waves ran single bench files;
- the whole `pnpm test:e2e`: all 50 specs on Chromium plus Firefox's determinism spec (earlier waves ran batches);
- the whole `pnpm test` (every Vitest project in one run), `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
  `pnpm build`;
- `pnpm docs:images --check`, `pnpm store:assets --check`, the input probe's `npm run verify`, the ingest tool's
  `npm test` and `node ingest.mjs --check`;
- a look at GitHub CI on the final commit (never waited on before).

## Not in this wave: the RR-1 clean-up (a v2.0.x step after the release)

Decisions RR-1 and RR-1b planned that R6-03 deletes the v1 art sources and retires the scale-1 builds. That clean-up
is **deferred to a v2.0.x step after the release**: it touches the whole asset pipeline right before the one full
suite, and nothing in the release plays scale 1. **No subtask of this wave does any of it.** `W15.DOCS-A` records it
in R6-03's As built in `plan_resolution.md` as a v2.0.x follow-up (so it survives if `docs/v2-run/` is deleted), with
this list of what that v2.0.x step must do:

1. Delete each v1 pixel map under `assets/source/sprites/` that has a `<path>.v2.sprite.json` sibling, and rename
   each `<path>.v2.sprite.json` to `<path>.sprite.json` (RR-1, the two-scale sources of `R4-P.P3`'s pipeline).
2. Delete the v1 font `assets/source/fonts/pixel6x8.font.json`, so the `"native": true` v2 font is the only source of
   its name.
3. Delete the generators' v1 paths: the `options.artScale === 1` branches in `scripts/assets/procedural/*.mjs`.
4. Retire the scale-1 consumers (`buildAtlas({ artScale: 1 })` / `collectSprites({ artScale: 1 })`): the digest pin
   of `test/scripts/assets/interim-pipeline.test.ts`; the M3-03 CJK figures of `test/integration/cjk-budget.test.ts`
   (re-measured at the default scale, with the documents that quote them); the TV bench atlas
   `apps/tizen/scripts/bench-atlas.mjs` with `apps/tizen/test/scripts/bench-atlas.test.ts` and
   `apps/tizen/test/bench/shipped-atlas.ts` (the bench baseline); the v1 anchors of
   `test/scripts/assets/pipeline-edge.test.ts` and the scale-1 case of `test/scripts/assets/pipeline.test.ts`.
5. Then drop the pipeline's two-scale rules that nothing uses any more (`scripts/assets/sprite-source.mjs`,
   `scripts/assets/font.mjs`, `scripts/assets/pipeline.mjs`) and update the docs that describe them
   (`docs/dev/asset-pipeline.md`), with its own targeted tests, review loop to zero and one full suite (the atlas
   moves: the derived files are re-derived with their reason).

## Rules for this wave

1. **Hardware is the owner's.** Agents never package, sign, install or run anything on a TV (`sdb`, the Tizen CLI,
   `bench:tv:package`, `bench:tv:install`, store uploads). They analyse the logs the owner sends.
2. **A TV mitigation ships only if P3's numbers miss a budget** (render ≤ 8 ms, TPF reading 1 with the vsync lock,
   zone load ≤ 2 s, boot ≤ 10 s, memory < 100 MiB). Otherwise P4a–d are recorded as "not needed". R6-02's other
   listed mitigation, PNG-8 everywhere, is already the atlas format since R1-05 (lossless automatic PNG-8 for the
   atlas pages, decision W3-3) — not a P4.
3. **The full suite runs alone** — no builder agent works while R6-03.D6 runs (it takes the e2e lock for its e2e and
   bench steps anyway). Its fixes are ordinary subtasks (`R6-03.D6.FIXn`) with their own file lists and targeted
   tests, reviewed to zero, and then the full suite runs **again** (only the failed steps first, then the whole).
4. **Re-blessing in D6** happens only for a change made on purpose and not yet re-blessed — there should be none. A
   golden that moves without a reason is a bug: fix it, never re-bless it.
5. **The release needs the owner's explicit OK** (decision R6-D3). Store submissions stay the owner's.
6. **Late art drops (fillers).** An owner-ready `R5-0n.S3` (wave 12's template) may run as a filler (≤ 2, e2e pass
   permitting), never while `R6-01.B4` holds GLOBAL and never once `R6-03.D6` has started; R6-03.D3 / D4 wait for any
   drop the owner names for the release.

## Subtasks

### R6-02.P3 — Analyse the owner's TV logs

- **Wave / lane / order:** wave 15, lane 1, first.
- **Depends on:** the owner's logs from R6-02.P2's kit (the guided render capture on both M7s and the R0 bench), in
  `tools/input-probe/results/<date>-<device>/`. Without them: report "waiting on owner" and stop.
- **Goal:** turn the logs into the tables of `docs/dev/input-probe-results.md` (§11's analyzers) and decide, per
  budget, met or missed.
- **Files:** none committed by this subtask (the tables go into the report; `W15.DOCS-C` writes §12). The logs
  themselves are committed by the owner or by the orchestrator under `tools/input-probe/results/` as the owner says.
- **Tests (targeted):** in the commands below, replace `<date>-<device>` with the folder that holds the owner's logs,
  `rp-<id>.jsonl` with each render-profile file in it and `<bench session>` with each bench session in it (run the
  analyzer once per file):
  ```bash
  cd tools/input-probe && npm ci && npm run verify
  node results/analyze-render.mjs results/<date>-<device>/rp-<id>.jsonl
  node results/analyze-bench.mjs results/<date>-<device>/<bench session>
  ```
- **Acceptance:** for each budget — render ≤ 8 ms (feat §22), TPF 1, zone load ≤ 2 s, boot ≤ 10 s, memory < 100 MiB —
  the measured figure, the device, and "met" or "missed"; for each miss, the mitigation proposed (P4a–d) with the
  expected gain.
- **Token:** none.
- **Traps:** the headless `pnpm bench` milliseconds are not the TV's (SwiftShader); compare counted quantities (draw
  calls, render-target bytes, heap deltas) and in-run ratios only (`analyze-render.mjs`' header explains it); a
  window recorded while a report POST was in flight is excluded by default.
- **Docs needs:** the tables and the verdicts for `docs/dev/input-probe-results.md` §12 (new) and
  `docs/dev/render-performance-review.md`.
- **Owner (Manual):** the capture itself on both M7s.

### R6-02.P4a — TV profile: at most 4 parallax layers (only if P3 finds a miss)

- **Wave / lane / order:** wave 15, lane 1, after R6-02.P3, only if P3 proposes it.
- **Goal:** a host flag the TV boots pass to the renderer: draw at most 4 parallax layers (the nearest kept). The
  shell creates the renderer (`createPixiRenderer` at `packages/shell/src/boot/index.ts:1199` on this master), so the
  flag travels from the TV boots through `ShellOptions` to the renderer's options.
- **Files (only these):** `packages/render-pixi/src/layers/index.ts`, `packages/render-pixi/src/renderer/index.ts`
  (the option), `packages/shell/src/boot/index.ts` (the `ShellOptions` field and its pass-through), `apps/tizen/src/boot/*`,
  `apps/webos/src/boot/*` (pass the flag), their tests under `packages/render-pixi/test/layers/`,
  `packages/render-pixi/test/renderer/`, `packages/shell/test/boot/`, `apps/tizen/test/boot/`, `apps/webos/test/boot/`.
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/layers packages/render-pixi/test/renderer
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project webos apps/webos/test/boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tv-engine-floor.test.ts
  pnpm --filter @shmup/tizen build && pnpm --filter @shmup/webos build
  nohup bash docs/v2-run/helpers/e2e-batch.sh render-groups.spec.ts display-options.spec.ts mode7.spec.ts > /home/sites/shmup-cup-run/R6-02.P4a-e2e.log 2>&1 &
  ```
- **Acceptance:** the web and desktop builds draw every layer; the TV builds draw at most 4; the render-pixi
  allocation guards green (never raised); `app.js` ≤ 512 KB gzip; the presentation fingerprint unchanged (core's
  output does not change).
- **Token:** render-pixi `layers` / `renderer` and the shell boot (work-time, lane 1; the shell boot passes on to P4c,
  then P4d).
- **Traps:** Chromium 68 (no `.flat`, `.at(`, `Object.fromEntries` …); never create Pixi objects or option literals
  in `render()`; a flag read every frame is a plain field.
- **Docs needs:** the TV profile for `docs/dev/platform-polish.md` and `docs/client/install-on-tv.md`.

### R6-02.P4b — TV profile: far layers at half resolution (only if P3 finds a miss)

- **Wave / lane / order:** wave 15, lane 1, after R6-02.P4a.
- **Goal:** the TV profile renders the far backdrop layers at half resolution (one render target, scaled up).
- **Files (only these):** `packages/render-pixi/src/layers/index.ts`, `packages/render-pixi/src/renderer/index.ts`,
  their tests.
- **Tests:** as P4a.
- **Acceptance:** as P4a; `estimateStageMemory` counts the extra target (`packages/shell/src/memory/index.ts` is
  read-only here — report the needed change if the estimate must learn it).
- **Token:** as P4a.
- **Traps:** a filter attached per frame copies Pixi's filter list — attach at a setting edge only (M3-02's lesson);
  the CRT pass's 1080-row cap still holds.

### R6-02.P4c — CRT off by default on the TV (only if P3 finds a miss)

- **Wave / lane / order:** wave 15, lane 2, only if P3 proposes it; after R6-02.P4a when P4a runs (both may edit the
  shell boot and the TV boots).
- **Goal:** the user option's default for the CRT pass is `off` on the TV hosts; a saved choice is kept.
- **Files (only these):** `packages/core/src/config/index.ts` (the per-host default of the user option; CORE-CONFIG),
  the host boots that pass the host kind if needed (`apps/tizen/src/boot/*`, `apps/webos/src/boot/*`, with
  `apps/tizen/test/boot/`, `apps/webos/test/boot/`), `packages/shell/src/boot/index.ts` and
  `packages/shell/test/boot/` (only if the default is passed through `ShellOptions`), `packages/core/test/config/*`
  and `packages/core/test/save/*` (the defaults and the save round trip).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/config packages/core/test/save
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/boot        # only if you edited the shell boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/boot            # only if you edited the Tizen boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project webos apps/webos/test/boot            # only if you edited the webOS boot
  nohup bash docs/v2-run/helpers/e2e-batch.sh display-options.spec.ts options.spec.ts > /home/sites/shmup-cup-run/R6-02.P4c-e2e.log 2>&1 &
  ```
- **Acceptance:** a fresh TV save has CRT off; web and desktop unchanged; an existing save keeps its value;
  `SAVE_VERSION` unchanged (no format change).
- **Token:** CORE-CONFIG; the shell boot after P4a (then on to P4d).
- **Traps:** user options are not simulation state — no golden may move; clamp read values (`-0`, conventions);
  never bump the save format for a default.

### R6-02.P4d — WebGL 2 by default with WebGL 1 as fallback (only if P3 finds a miss)

- **Wave / lane / order:** wave 15, lane 3, after R6-02.P4b (or after P4a if P4b is not needed), and after R6-02.P4c
  if it runs (the shell boot and the TV boots, one at a time).
- **Goal:** the renderer asks for WebGL 2 first and falls back to WebGL 1 (the Mali baseline) when it is missing or
  fails. The hosts pass `preferWebGLVersion: 1` explicitly today (`apps/tizen/src/boot/index.ts:513`,
  `apps/webos/src/boot/index.ts:360`, `apps/web/src/boot/index.ts:644` on this master): change only the hosts P3's
  proposal names, or the TV keeps WebGL 1.
- **Files (only these):** `packages/render-pixi/src/renderer/index.ts`, `packages/shell/src/boot/index.ts`, the boots
  of the hosts P3 names (`apps/tizen/src/boot/index.ts`, `apps/webos/src/boot/index.ts`, `apps/web/src/boot/index.ts`
  — the `preferWebGLVersion` line only), their tests (`packages/render-pixi/test/renderer/`,
  `packages/shell/test/boot/`, `apps/tizen/test/boot/`, `apps/webos/test/boot/`, `apps/web/test/boot/`).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/renderer
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/boot            # only if you edited the Tizen boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project webos apps/webos/test/boot            # only if you edited the webOS boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project web apps/web/test/boot                # only if you edited the web boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tv-engine-floor.test.ts
  nohup bash docs/v2-run/helpers/e2e-batch.sh boot.spec.ts render-groups.spec.ts mode7.spec.ts webos.spec.ts > /home/sites/shmup-cup-run/R6-02.P4d-e2e.log 2>&1 &
  ```
- **Acceptance:** WebGL 1 still works (the fake and the e2e with WebGL 2 disabled); shaders stay GLSL ES 1.0
  compatible; the context-loss recovery (R3-04.M3d) still works.
- **Token:** render-pixi `renderer` (after P4b, or P4a), the shell boot and the TV boots (after P4a and P4c).
- **Traps:** no WebGL2-only feature in shaders; Chromium 68.

### R6-03.D3 — The store icons with the final art

- **Wave / lane / order:** wave 15, lane 4.
- **Depends on:** wave 14's exit; every real-art drop that changes a ship or the font (R5 `S3`, R4 owner art) that
  the owner wants in the release.
- **Goal:** re-render the four icons from the final art (they use the v2 art since R4-05.E5).
- **Files (only these):** `apps/tizen/public/icon.png` (512 × 423), `apps/webos/public/icon.png` (80 × 80),
  `apps/webos/public/largeIcon.png` (130 × 130), `apps/electron/build/icon.png` (512 × 512).
- **Tests (targeted):**
  ```bash
  pnpm store:assets
  pnpm store:assets --check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/store-assets.test.ts test/scripts/store-assets-edge.test.ts
  pnpm --filter @shmup/tizen build && pnpm --filter @shmup/webos build     # the bundle checks validate the icons
  ```
- **Acceptance:** `--check` green; Read the four PNGs and confirm they show the final ship and logo.
- **Token:** STORE (the land lock for the push).
- **Traps:** never edit `scripts/store-assets.mjs`' layouts here (they were set by R4-05.E5); the store-listing
  placeholders under `assets/generated/store/` are git-ignored — do not commit them.

### R6-03.D4 — The docs images and screenshots

- **Wave / lane / order:** wave 15, lane 5, after R6-03.D3 and any R6-02.P4.
- **Goal:** regenerate every documentation picture from the final game: the plates and the banner, and the 18
  screens (played headlessly, frozen and stepped to exact ticks).
- **Files (only these):** `docs/images/**` (DOCS-IMAGES, the whole folder).
- **Tests (targeted):**
  ```bash
  pnpm docs:images
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm docs:screens
  pnpm docs:images --check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tooling-config.test.ts
  ```
- **Acceptance:** `--check` green; Read the banner, 5 plates and every screen.
- **Token:** DOCS-IMAGES (the land lock for the push).
- **Traps:** `docs:screens` is timing-heavy: it runs under the e2e lock; screenshots capture at `floor(1280 / FRAME_W)`
  × the frame unless the owner chose 1080p (decision O9); commit only `docs/images/**`.

## Docs item

`W15.DOCS-A` is R6-03.D1 (decision R6-D2: the version bump and the CHANGELOG's `[2.0.0]` go in **one push**, because
`test/integration/tooling-config.test.ts` checks both). `W15.DOCS-B` and `W15.DOCS-C` are R6-03.D2 + D5 and R6-02's
docs, with disjoint files. They start once lanes 1–5 are on `origin/master` (or recorded as not needed). After the
release, `R6-03.D7.DOCS` makes the last PLAN push (§17 R6-03 → `done`).

### W15.DOCS-A — R6-03.D1: version 2.0.0, the changelog, the plan

- **Wave / lane / order:** wave 15, lane 6; the PLAN holder (until `R6-03.D7.DOCS` after the release).
- **Depends on:** R6-02.P3 (or its "waiting on owner"), any P4, R6-03.D3, D4 on `origin/master`.
- **Goal:** every workspace project at **`2.0.0`**; CHANGELOG's first section becomes `## [2.0.0] — <date>` above
  `## [1.0.0] — 2026-10-16`, where `<date>` is the expected release date as `YYYY-MM-DD` (`R6-03.D7.DOCS` amends it
  if the owner's OK comes on another day), with the v2 summary (the remaster, the art status, the AI disclosure
  pointer); the release-version test follows; the plan's R6-02 / R6-03 As built (R6-03's records the deferred RR-1
  clean-up as a v2.0.x follow-up, with the five points of "Not in this wave" above) and §17 (R6-02 `done` or
  `waiting on owner`; R6-03 stays `in progress` — `R6-03.D7.DOCS` writes `done` after the release); `CLAUDE.md`'s
  version sentence; push; then report: the orchestrator runs the board sync.
- **Files (only these):**
  - the 10 manifests: `package.json`, `packages/{audio-web,core,input-web,render-pixi,shell}/package.json`,
    `apps/{electron,tizen,web,webos}/package.json`;
  - `test/integration/tooling-config.test.ts` — `RELEASE = '2.0.0'` (`:323` on `bc8e05d`), the prerelease check
    (`semver.prerelease(...)` is `null` for a release), and the CHANGELOG test (`:338` on `bc8e05d`: the first
    section is now `## [2.0.0] — <date>`, not `[Unreleased] — v2` — match its date with a pattern such as
    `/^## \[2\.0\.0\] — \d{4}-\d{2}-\d{2}$/m`, never a literal date, so `R6-03.D7.DOCS` can amend the date in
    `CHANGELOG.md` alone; keep `[1.0.0]` and `[1.0.0-rc.1]` below it);
  - `apps/tizen/test/config-xml/config-xml-consistency.test.ts` (the title text at `:32`),
    `test/scripts/store-assets-edge.test.ts` (the comment at `:182`);
  - `CHANGELOG.md`, `plan_resolution.md` (R6-02, R6-03, §17, the status line at the top), `CLAUDE.md` (the version
    sentence of its opening paragraph only).
- **Tests (targeted):**
  ```bash
  pnpm install --frozen-lockfile     # no lockfile change
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tooling-config.test.ts test/scripts/store-assets-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/config-xml
  ```
- **Acceptance:** one commit holds the manifests, the tests and the CHANGELOG (the test passes only with both); the TV
  manifests stay `2.0.0`; the lockfile unchanged.
- **Token:** PLAN.
- **Traps:** the board script parses §17's `| R6-0n | … | … |` rows — keep three columns; never write `done` for
  R6-03 before D7 has published the release (`R6-03.D7.DOCS` writes it, after D7).

### W15.DOCS-B — R6-03.D2 + D5: the player-facing docs and the README

- **Files (only these):** `README.md` (the banner, the version, the feature list), `docs/README.md`,
  `docs/client/README.md`, `docs/client/controls.md`, `docs/client/bestiary.md`, `docs/client/arsenal.md` (all with
  the new images), `docs/client/outstanding-work.md` (for v2: what still waits on the owner),
  `docs/client/store-submission.md` (the store listings and the AI disclosures of R3-05, `docs/dev/art-provenance.md`),
  and the version lines only of `docs/client/preview-build.md`, `docs/client/release-candidate.md`,
  `docs/client/desktop-app.md` and `docs/client/debug-tools.md`.
- **Depends on:** R6-03.D4 (the images).
- **Tests:** none (Markdown).
- **Acceptance:** no stale 384×216 or v1 number in these files; the AI disclosure matches the origin report
  (`node scripts/art-origins.mjs` output); every current-version line says `2.0.0`.

### W15.DOCS-C — The developer docs: release lines, v1.x's end of life, the TV numbers

- **Files (only these):** `docs/dev/build-test-deploy.md` (the release lines; **v1.x's future**: security and crash
  fixes only, for one year after v2.0.0 (owner, Q-12), then end of life), `docs/dev/README.md`,
  `docs/dev/input-probe-results.md` (§12, new: R6-02.P3's tables and verdicts), `docs/dev/render-performance-review.md`,
  `docs/dev/platform-polish.md` (the budgets, the TV profile if any, its version line),
  `docs/client/install-on-tv.md` (the TV profile, if any, and its version line), `apps/tizen/README.md` and
  `docs/dev/release-hardening.md` (their version lines only).
- **Depends on:** R6-02.P3 (or its "waiting on owner").
- **Tests:** `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/e2e-docs.test.ts` (it
  reads `build-test-deploy.md`).

### W15.DOCS-RV — Review of the docs item

- The loop to zero, as in every wave. It checks DOCS-A's one-push rule; that `build-test-deploy.md` gives v1.x one
  year of security and crash fixes after v2.0.0 (Q-12); and that every version string says `2.0.0`:
  ```bash
  git grep -n "2\.0\.0-\(alpha\|beta\)" -- '*.md' ':!CHANGELOG.md' ':!docs/v2-run/**' ':!plan_resolution.md' ':!prompt_resolution.md'
  ```
  must list only history lines (a line about an earlier build, never the current version).

### R6-03.D6 — THE ONE FULL SUITE of the whole run

- **Wave / lane / order:** wave 15, alone, after every other subtask of the wave (and `W15.DOCS-RV`) is at zero.
- **Depends on:** everything above on `origin/master`.
- **Goal:** run the full definition-of-done suite **once**, on a fresh worktree of `origin/master`, and make it
  green; it also updates whatever tracks the changes (goldens and demos only for a change made on purpose and not yet
  re-blessed, docs images, store assets, bench budgets — each with its reason).
- **Commands** — path 1 (preferred): the helper in the background (about 12 minutes, its header says; opencode stops
  a foreground command after 2 minutes), then the four checks the helper does not run:
  ```bash
  HOST_CHECK_LOG_DIR=/home/sites/shmup-cup-run/R6-03.D6-steps nohup bash docs/v2-run/helpers/host-check.sh > /home/sites/shmup-cup-run/R6-03.D6-host-check.log 2>&1 &
  # poll /home/sites/shmup-cup-run/R6-03.D6-host-check.log until its last line reads "ALL DONE: <n> step(s) failed"; then:
  pnpm content:check && pnpm docs:images --check && pnpm store:assets --check && node scripts/art-origins.mjs --check
  ```
  Path 2: every step by hand (each long step in the background, README rule 4):
  ```bash
  pnpm install --frozen-lockfile
  pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  pnpm content:check
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm test:e2e --project=chromium    # all Chromium specs
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm test:e2e --project=firefox     # the determinism spec
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm bench                          # stress, zones, render, the 30-min soak (the balance bench skips without SHMUP_BALANCE=1)
  pnpm docs:images --check && pnpm store:assets --check
  (cd tools/input-probe && npm ci && npm run verify)
  (cd art-prompts/ingest && npm ci && npm test && node ingest.mjs --check)
  node scripts/art-origins.mjs --check
  ```
- **Acceptance:** every step green on one commit; the step log in the report (pass counts, skips — the gated skips
  of R2 must be **0** now: `git grep -n "R2_03_PENDING\|PORT_UNMEASURED\|GOLDENS_STALE\|CONTENT_PORT_PENDING" -- packages apps test scripts`
  prints nothing (code only — the names stay in the Markdown history for good; a leftover mention in a code comment
  is stale: fix it as an `R6-03.D6.FIXn`)); then a CI look: `gh run list --branch master --limit 3` and, for the
  final commit, `gh run view <id>` (`<id>` = the run id `gh run list` shows for that commit) — a red CI job is
  reproduced locally (`taskset -c 0-3`, `E2E_WORKERS=2`) and fixed like any failure.
- **Fixes:** each failure becomes `R6-03.D6.FIXn` (its own files, targeted tests, the README's rules), reviewed to
  zero (`R6-03.D6.RV`); then D6 runs the failed steps again, then the whole suite again.
- **Token:** all (no other agent runs); the land lock for any re-bless or derived-file push; the e2e lock for its e2e
  and bench steps.
- **Traps:** never raise a budget, skip a test or re-bless without a reason to get green; a flaky timed spec
  (`flight.spec.ts:114`'s idle drift was one) is reproduced under load and fixed, not retried until green; the
  playwright browsers need `sudo -n env "PATH=$PATH" pnpm exec playwright install-deps chromium firefox` once per
  host (the helper does it unless `HOST_CHECK_SKIP_PW_DEPS=1`).

### R6-03.D7 — Publish `v2.0.0`

- **Wave / lane / order:** wave 15, after D6.
- **Depends on:** R6-03.D6 green and reviewed; `R6-03.RV` at zero; **the owner's explicit OK** (decision R6-D3).
- **Goal:** the GitHub release, run by the orchestrator. First write the body of CHANGELOG's `[2.0.0]` section
  (without its heading) to `/home/sites/shmup-cup-run/R6-03.D7-notes.md`, then
  `gh release create v2.0.0 --target <the D6 commit> --title "Shmup Cup 2.0.0" --notes-file /home/sites/shmup-cup-run/R6-03.D7-notes.md`
  (`<the D6 commit>` = the full SHA of the commit D6's last green run checked, from D6's report). Then the one-line
  §17 follow-up `R6-03.D7.DOCS` (R6-03 → `done`, a docs agent with PLAN), and the orchestrator runs
  `python3 .claude/plan_board_v2.py` in the main checkout after that push.
- **Files:** none (the follow-up push is `R6-03.D7.DOCS`'s).
- **Acceptance:** the release exists with the notes; after `R6-03.D7.DOCS`'s push, §17 says done and the board is
  synced.
- **Token:** none (the orchestrator; `R6-03.D7.DOCS` holds PLAN for the follow-up).
- **Traps:** never push `v1.x`; never upload to a store (the owner's); the tag is `v2.0.0` exactly.
- **Owner (Manual):** the OK; the store submissions (Samsung Seller Office, LG, Steam, itch.io).

### R6-03.D7.DOCS — §17: R6-03 done after the release

- **Wave / lane / order:** wave 15, last, after R6-03.D7; a docs agent, the PLAN holder.
- **Depends on:** R6-03.D7 (`gh release view v2.0.0` shows the release).
- **Goal:** §17's R6-03 row → `done`; R6-03's As built gets the release line (the tag `v2.0.0`, the commit it
  targets, the date); if the release date differs from the date in CHANGELOG's `## [2.0.0] — <date>` heading, amend
  that date; push; then report: the orchestrator runs the board sync.
- **Files (only these):** `plan_resolution.md` (the R6-03 section and its §17 row only), `CHANGELOG.md` (the
  `[2.0.0]` heading's date only, and only if it changed).
- **Tests:** `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tooling-config.test.ts`
  (the CHANGELOG's first-section rule).
- **Acceptance:** §17 R6-03 `done`; the test green; nothing else changed.
- **Token:** PLAN.
- **Traps:** the board script parses §17's `| R6-0n | … | … |` rows — keep three columns; never move the `v2.0.0`
  tag; never push `v1.x`.

## Reviews

- `R6-02.P3.RV`: every verdict traceable to a log and an analyzer table.
- `R6-02.P4a.RV` … `P4d.RV` (only those that ran): the read-the-diff review, Chromium 68, zero allocation, the
  fingerprints unchanged.
- `R6-03.D3.RV`, `R6-03.D4.RV`: the images match `--check` and show the final art.
- `R6-03.D6.RV`: over every full-suite fix.
- `R6-03.RV` — the release review: the CHANGELOG `[2.0.0]` section is true; every §17 row is `done…` or `waiting on
  owner` with a reason (R6-03 itself `in progress` until `R6-03.D7.DOCS`); the docs say 640×360 everywhere; `v1.x`'s
  future is written down (one year of security and crash fixes after v2.0.0, owner Q-12); R6-03's As built records
  the deferred RR-1 clean-up as a v2.0.x follow-up.
- `R6-03.D7.DOCS.RV`: the §17 row and the date only.
- Every loop: a new reviewer each round, until zero findings, nits included.

## Exit check

1. R6-03.D6's step log: every step green on the final commit.
2. The CI look done (a red job reproduced and fixed).
3. `gh release view v2.0.0` shows the release (after the owner's OK).
4. §17: every step `done…`, or `waiting on owner` with its reason (R6-02 without logs, R0-03 if never run) — set by
   `W15.DOCS-A` and, for R6-03, `R6-03.D7.DOCS`; the board synced by the orchestrator after that push
   (`python3 .claude/plan_board_v2.py` in its main checkout — docs agents never run it).
5. The run's helpers in `docs/v2-run/helpers/` say "delete when the v2 agent run ends": `land-zone.sh`, `e2e-batch.sh`
   and `host-check.sh` stay until here (`r5r6/zonerefs.*` and `r5r6/carrier.py` were deleted by `W12.DOCS-A` and
   `W13.DOCS-A`). The orchestrator asks the owner whether to delete `docs/v2-run/` now or keep it as history (the
   deferred RR-1 clean-up is recorded in R6-03's As built, so deleting the folder loses nothing).

## Owner (Manual) — never blocks the agents (the release waits for the OK)

- The TV capture on both M7s (if not sent in wave 13) and the check of any TV profile.
- The explicit OK to publish `v2.0.0`; the store submissions and listings; the FLUX licence decision before any FLUX
  art ships.
