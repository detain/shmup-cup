# Wave 15 — R6-02 / R6-03, the one full suite, `v2.0.0`

> Schedule: `plan_resolution.md` §18 · how to use: `docs/v2-run/README.md` · decisions: `docs/v2-run/decisions.md`

**Steps:** R6-02 (performance and memory on the TV: the analysis of the owner's logs and, only if needed, a TV
profile), R6-03 (docs, the store refresh, the release). · **Gate to start:** wave 14's exit (R6-01 done). R6-02.P3
also needs the owner's capture logs (R6-02.P2's kit, wave 13); without them R6-02 is `waiting on owner` and the rest
of the wave goes on. · **Exit (summary):** the one full suite of the whole run green on `origin/master` (with its
fixes reviewed to zero), a CI look at the final commit, the version `2.0.0`, the docs refreshed, and — after the
owner's explicit OK — the GitHub release `v2.0.0`.

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e / bench |
|---|---|---|---|---|
| 1 TV analysis | `R6-02.P3` → (only if a budget is missed) `R6-02.P4a → P4b` | P3: none (a report); P4a/b: `packages/render-pixi/src/{layers,renderer}/index.ts`, `apps/{tizen,webos}/src/boot` | RP files (work-time) | e2e at P4 |
| 2 CRT default | (only if needed) `R6-02.P4c` | `packages/core/src/config/index.ts` (a per-host user-option default), the save tests | CORE-CONFIG | e2e |
| 3 WebGL 2 | (only if needed) `R6-02.P4d`, after P4a | `packages/render-pixi/src/renderer/index.ts`, `packages/shell/src/boot/index.ts` | RP files | e2e |
| 4 store icons | `R6-03.D3` | the four store icons | STORE | none |
| 5 doc images | `R6-03.D4` (after D3 and any P4) | `docs/images/**` | DOCS-IMAGES | `docs:screens` (lock) |
| 6 version + changelog | `R6-03.D1` = `W15.DOCS-A` | the 10 manifests, the version tests, `CHANGELOG.md`, `plan_resolution.md`, `CLAUDE.md` | PLAN | none |
| 7 docs | `W15.DOCS-B`, `W15.DOCS-C` (R6-03.D2 + D5, R6-02's docs) | `README.md`, `docs/client/**`, `docs/dev/*` | none | none |
| then, alone | `R6-03.D6` **the one full suite** → fixes → loop → `R6-03.D7` | everything that tracks the changes | all (the land lock for re-blesses) | all |

- **Order rules:** P4b after P4a, P4d after P4a (`renderer/index.ts`); D4 after D3 and after any P4 (the screens show
  the TV profile's defaults only on the TV, but a renderer change can move a screenshot); D6 after **every** other
  subtask of the wave is on `origin/master` and reviewed to zero; D7 after D6 is green and the owner says yes.
- **Reviews:** `R6-02.P3.RV`, `R6-02.P4*.RV` (if any), `R6-03.D3.RV`, `R6-03.D4.RV`, `W15.DOCS-RV`, then
  `R6-03.D6.RV` over the full-suite fixes, then `R6-03.RV` (the release review).
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

## Rules for this wave

1. **Hardware is the owner's.** Agents never package, sign, install or run anything on a TV (`sdb`, the Tizen CLI,
   `bench:tv:package`, `bench:tv:install`, store uploads). They analyse the logs the owner sends.
2. **A TV mitigation ships only if P3's numbers miss a budget** (render ≤ 8 ms, TPF reading 1 with the vsync lock,
   zone load ≤ 2 s, boot ≤ 10 s, memory < 100 MiB). Otherwise P4a–d are recorded as "not needed".
3. **The full suite runs alone** — no builder agent works while R6-03.D6 runs (it takes the e2e lock for its e2e and
   bench steps anyway). Its fixes are ordinary subtasks (`R6-03.D6.FIXn`) with their own file lists and targeted
   tests, reviewed to zero, and then the full suite runs **again** (only the failed steps first, then the whole).
4. **Re-blessing in D6** happens only for a change made on purpose and not yet re-blessed — there should be none. A
   golden that moves without a reason is a bug: fix it, never re-bless it.
5. **The release needs the owner's explicit OK** (decision R6-D3). Store submissions stay the owner's.

## Subtasks

### R6-02.P3 — Analyse the owner's TV logs

- **Wave / lane / order:** wave 15, lane 1, first.
- **Depends on:** the owner's logs from R6-02.P2's kit (the guided render capture on both M7s and the R0 bench), in
  `tools/input-probe/results/<date>-<device>/`. Without them: report "waiting on owner" and stop.
- **Goal:** turn the logs into the tables of `docs/dev/input-probe-results.md` (§11's analyzers) and decide, per
  budget, met or missed.
- **Files:** none committed by this subtask (the tables go into the report; `W15.DOCS-C` writes §12). The logs
  themselves are committed by the owner or by the orchestrator under `tools/input-probe/results/` as the owner says.
- **Tests (targeted):**
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
- **Goal:** a host flag the TV boots pass to the renderer: draw at most 4 parallax layers (the nearest kept).
- **Files (only these):** `packages/render-pixi/src/layers/index.ts`, `packages/render-pixi/src/renderer/index.ts`
  (the option), `apps/tizen/src/boot/*`, `apps/webos/src/boot/*` (pass the flag), their tests under
  `packages/render-pixi/test/layers/`, `packages/render-pixi/test/renderer/`, `apps/tizen/test/boot/`,
  `apps/webos/test/boot/`.
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/layers packages/render-pixi/test/renderer
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project webos apps/webos/test/boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tv-engine-floor.test.ts
  pnpm --filter @shmup/tizen build && pnpm --filter @shmup/webos build
  nohup bash docs/v2-run/helpers/e2e-batch.sh render-groups.spec.ts display-options.spec.ts mode7.spec.ts > RUN_DIR/R6-02.P4a-e2e.log 2>&1 &
  ```
- **Acceptance:** the web and desktop builds draw every layer; the TV builds draw at most 4; the render-pixi
  allocation guards green (never raised); `app.js` ≤ 512 KB gzip; the presentation fingerprint unchanged (core's
  output does not change).
- **Token:** render-pixi `layers` / `renderer` (work-time, lane 1).
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

- **Wave / lane / order:** wave 15, lane 2, only if P3 proposes it.
- **Goal:** the user option's default for the CRT pass is `off` on the TV hosts; a saved choice is kept.
- **Files (only these):** `packages/core/src/config/index.ts` (the per-host default of the user option; CORE-CONFIG),
  the host boots that pass the host kind if needed (`apps/tizen/src/boot/*`, `apps/webos/src/boot/*` — coordinate
  with P4a: if P4a holds them, do P4c after P4a), `packages/core/test/config/*` and `packages/core/test/save/*`
  (the defaults and the save round trip).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/config packages/core/test/save
  nohup bash docs/v2-run/helpers/e2e-batch.sh display-options.spec.ts options.spec.ts > RUN_DIR/R6-02.P4c-e2e.log 2>&1 &
  ```
- **Acceptance:** a fresh TV save has CRT off; web and desktop unchanged; an existing save keeps its value;
  `SAVE_VERSION` unchanged (no format change).
- **Token:** CORE-CONFIG.
- **Traps:** user options are not simulation state — no golden may move; clamp read values (`-0`, conventions);
  never bump the save format for a default.

### R6-02.P4d — WebGL 2 by default with WebGL 1 as fallback (only if P3 finds a miss)

- **Wave / lane / order:** wave 15, lane 3, after R6-02.P4a.
- **Goal:** the renderer asks for WebGL 2 first and falls back to WebGL 1 (the Mali baseline) when it is missing or
  fails.
- **Files (only these):** `packages/render-pixi/src/renderer/index.ts`, `packages/shell/src/boot/index.ts`, their
  tests (`packages/render-pixi/test/renderer/`, `packages/shell/test/boot/`).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/renderer
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tv-engine-floor.test.ts
  nohup bash docs/v2-run/helpers/e2e-batch.sh boot.spec.ts render-groups.spec.ts mode7.spec.ts webos.spec.ts > RUN_DIR/R6-02.P4d-e2e.log 2>&1 &
  ```
- **Acceptance:** WebGL 1 still works (the fake and the e2e with WebGL 2 disabled); shaders stay GLSL ES 1.0
  compatible; the context-loss recovery (R3-04.M3d) still works.
- **Token:** render-pixi `renderer` (after P4a), shell boot.
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
docs, with disjoint files. They start once lanes 1–5 are on `origin/master` (or recorded as not needed).

### W15.DOCS-A — R6-03.D1: version 2.0.0, the changelog, the plan

- **Wave / lane / order:** wave 15, lane 6; the only PLAN holder.
- **Depends on:** R6-02.P3 (or its "waiting on owner"), any P4, R6-03.D3, D4 on `origin/master`.
- **Goal:** every workspace project at **`2.0.0`**; CHANGELOG's first section becomes `## [2.0.0] — <date>` above
  `## [1.0.0] — 2026-10-16`, with the v2 summary (the remaster, the art status, the AI disclosure pointer); the
  release-version test follows; the plan's R6-02 / R6-03 As built and §17 (R6-02 `done` or `waiting on owner`,
  R6-03 `done` after D7); `CLAUDE.md`'s version sentence; then `python3 .claude/plan_board_v2.py`.
- **Files (only these):**
  - the 10 manifests: `package.json`, `packages/{audio-web,core,input-web,render-pixi,shell}/package.json`,
    `apps/{electron,tizen,web,webos}/package.json`;
  - `test/integration/tooling-config.test.ts` — `RELEASE = '2.0.0'` (`:323` on `bc8e05d`), the prerelease check
    (`semver.prerelease(...)` is `null` for a release), and the CHANGELOG test (`:338` on `bc8e05d`: the first
    section is now `## [2.0.0] — <date>`, not `[Unreleased] — v2`; keep `[1.0.0]` and `[1.0.0-rc.1]` below it);
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
  manifests stay `2.0.0`; the lockfile unchanged; the board synced.
- **Token:** PLAN.
- **Traps:** the board script parses §17's `| R6-0n | … | … |` rows — keep three columns; never write `done` for
  R6-03 before D7 has published the release (write it after D7, in a one-line follow-up push).

### W15.DOCS-B — R6-03.D2 + D5: the player-facing docs and the README

- **Files (only these):** `README.md` (the banner, the version, the feature list), `docs/README.md`,
  `docs/client/README.md`, `docs/client/controls.md`, `docs/client/bestiary.md`, `docs/client/arsenal.md` (all with
  the new images), `docs/client/outstanding-work.md` (for v2: what still waits on the owner),
  `docs/client/store-submission.md` (the store listings and the AI disclosures of R3-05, `docs/dev/art-provenance.md`).
- **Depends on:** R6-03.D4 (the images).
- **Tests:** none (Markdown).
- **Acceptance:** no stale 384×216 or v1 number in these files; the AI disclosure matches the origin report
  (`node scripts/art-origins.mjs` output).

### W15.DOCS-C — The developer docs: release lines, v1.x's end of life, the TV numbers

- **Files (only these):** `docs/dev/build-test-deploy.md` (the release lines; **v1.x's future**: security and crash
  fixes only for a stated time, then end of life — the owner's wording, default "six months after v2.0.0"),
  `docs/dev/README.md`, `docs/dev/input-probe-results.md` (§12, new: R6-02.P3's tables and verdicts),
  `docs/dev/render-performance-review.md`, `docs/dev/platform-polish.md` (the budgets, the TV profile if any),
  `docs/client/install-on-tv.md` (the TV profile, if any).
- **Depends on:** R6-02.P3 (or its "waiting on owner").
- **Tests:** `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/e2e-docs.test.ts` (it
  reads `build-test-deploy.md`).

### W15.DOCS-RV — Review of the docs item

- The loop to zero, as in every wave; it checks DOCS-A's one-push rule and that every version string says `2.0.0`.

### R6-03.D6 — THE ONE FULL SUITE of the whole run

- **Wave / lane / order:** wave 15, alone, after every other subtask of the wave (and `W15.DOCS-RV`) is at zero.
- **Depends on:** everything above on `origin/master`.
- **Goal:** run the full definition-of-done suite **once**, on a fresh worktree of `origin/master`, and make it
  green; it also updates whatever tracks the changes (goldens and demos only for a change made on purpose and not yet
  re-blessed, docs images, store assets, bench budgets — each with its reason).
- **Commands** (either the helper, or the same steps by hand):
  ```bash
  bash docs/v2-run/helpers/host-check.sh 2>&1 | tee RUN_DIR/R6-03.D6-host-check.log   # every CI job in order, ~15 min
  # or, step by step:
  pnpm install --frozen-lockfile
  pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  pnpm content:check
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm test:e2e                       # all Chromium specs
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm test:e2e --project=firefox     # the determinism spec
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm bench                          # stress, zones, render, the 30-min soak
  pnpm docs:images --check && pnpm store:assets --check
  (cd tools/input-probe && npm ci && npm run verify)
  (cd art-prompts/ingest && npm ci && npm test && node ingest.mjs --check)
  node scripts/art-origins.mjs --check
  ```
- **Acceptance:** every step green on one commit; the step log in the report (pass counts, skips — the gated skips
  of R2 must be **0** now: `git grep -n "R2_03_PENDING\|PORT_UNMEASURED\|GOLDENS_STALE\|CONTENT_PORT_PENDING"`
  empty); then a CI look: `gh run list --branch master --limit 3` and, for the final commit,
  `gh run view <id>` — a red CI job is reproduced locally (`taskset -c 0-3`, `E2E_WORKERS=2`) and fixed like any
  failure.
- **Fixes:** each failure becomes `R6-03.D6.FIXn` (its own files, targeted tests, the README's rules), reviewed to
  zero (`R6-03.D6.RV`); then D6 runs the failed steps again, then the whole suite again.
- **Token:** all (no other agent runs); the land lock for any re-bless or derived-file push; the e2e lock for its e2e
  and bench steps.
- **Traps:** never raise a budget, skip a test or re-bless without a reason to get green; a flaky timed spec
  (`flight.spec.ts:114`'s idle drift was one) is reproduced under load and fixed, not retried until green; the
  playwright browsers need `sudo -n env "PATH=$PATH" pnpm exec playwright install-deps chromium firefox` once per
  host (the helper does it unless `HOST_CHECK_SKIP_PW_DEPS=1`).

### R6-03.D7 — Publish `v2.0.0`

- **Wave / lane / order:** wave 15, last.
- **Depends on:** R6-03.D6 green and reviewed; `R6-03.RV` at zero; **the owner's explicit OK** (decision R6-D3).
- **Goal:** the GitHub release, run by the orchestrator:
  `gh release create v2.0.0 --target <the D6 commit> --title "Shmup Cup 2.0.0" --notes-file <CHANGELOG's [2.0.0] section>`.
  Then the one-line §17 follow-up (R6-03 → `done`) and `python3 .claude/plan_board_v2.py`.
- **Files:** none (the follow-up push is `W15.DOCS-A`'s).
- **Acceptance:** the release exists with the notes; §17 and the board say done.
- **Token:** PLAN for the follow-up line.
- **Traps:** never push `v1.x`; never upload to a store (the owner's); the tag is `v2.0.0` exactly.
- **Owner (Manual):** the OK; the store submissions (Samsung Seller Office, LG, Steam, itch.io).

## Reviews

- `R6-02.P3.RV`: every verdict traceable to a log and an analyzer table.
- `R6-02.P4a.RV` … `P4d.RV` (only those that ran): the read-the-diff review, Chromium 68, zero allocation, the
  fingerprints unchanged.
- `R6-03.D3.RV`, `R6-03.D4.RV`: the images match `--check` and show the final art.
- `R6-03.D6.RV`: over every full-suite fix.
- `R6-03.RV` — the release review: the CHANGELOG `[2.0.0]` section is true; every §17 row is `done…` or `waiting on
  owner` with a reason; the docs say 640×360 everywhere; `v1.x`'s future is written down.
- Every loop: a new reviewer each round, until zero findings, nits included.

## Exit check

1. R6-03.D6's step log: every step green on the final commit.
2. The CI look done (a red job reproduced and fixed).
3. `gh release view v2.0.0` shows the release (after the owner's OK).
4. §17: every step `done…`, or `waiting on owner` with its reason (R6-02 without logs, R0-03 if never run); the board
   synced.
5. The run's helpers in `docs/v2-run/helpers/` say "delete when the v2 agent run ends": the orchestrator asks the
   owner whether to delete `docs/v2-run/` now or keep it as history.

## Owner (Manual) — never blocks the agents (the release waits for the OK)

- The TV capture on both M7s (if not sent in wave 13) and the check of any TV profile.
- The explicit OK to publish `v2.0.0`; the store submissions and listings; the FLUX licence decision before any FLUX
  art ships.
- The wording of v1.x's end of life (default in `W15.DOCS-C`).
