# Wave 13 — R5-10 part 2 (`v2.0.0-beta.1`) ∥ R6 opening

> Schedule: `plan_resolution.md` §18 · how to use: `docs/v2-run/README.md` · decisions: `docs/v2-run/decisions.md`

**Steps:** R5-10 part 2 (the boss rush, the loops and the caravan, the bench's real zones, the beta.1 version line),
R6-01's opening (the balance harness and its report), R6-02's opening (the headless re-measure, the owner's capture
kit). · **Gate to start:** wave 12's exit — all nine zones LANDed, R5-10.T1, T2, T3, T6, T8 on `origin/master`. ·
**Exit (summary):** R5-10 done; the `2.0.0-beta.1` version line on `origin/master` and the pre-release tag
`v2.0.0-beta.1` (decision RUN-1: **without** the milestone full suite — R5-10.T10 is deferred to wave 15); the
balance report committed; the re-measure numbers and the capture checklist handed to the docs item; every review at
zero.

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e / bench |
|---|---|---|---|---|
| 1 boss rush | `R5-10.T4` | `content/stages/boss-rush.stage.json`, `test/playtest/boss-rush.test.ts` | FINGERPRINTS | none |
| 2 loops | `R5-10.T5` | `test/integration/loops-runtime.test.ts` (only if a pin moved) | none | none |
| 3 bench | `R5-10.T7` | `test/bench/render.perf.ts`, `render-harness/load.ts`, `render-bench` tests, `apps/tizen/src/bench/scene.ts` | none | bench (lock) |
| 4 version | `R5-10.T9` | the 10 `package.json`, three version pins | none | none |
| 5 balance | `R6-01.B1 → R6-01.B2` | `test/bench/balance.perf.ts` (new); `docs/v2-run/balance-report.md` (new) | none | bench (lock) |
| 6 re-measure | `R6-02.P1` (after R5-10.T7) | the bench gates and `check-bundle.mjs` **only with reasons** | none | bench (lock) |
| 7 capture kit | `R6-02.P2` | none committed (builds + a checklist in the report) | none | none |

- **Order rules:** `R6-02.P1` waits for `R5-10.T7` (both may touch `test/bench/render.perf.ts`). `R5-10.T9` may run at
  any time but pushes last of R5-10 (the tag points at a commit with all of R5-10).
- **The e2e lock** serialises every bench run (T7, B1/B2, P1): at most two of those agents wait for it at a time.
- **Reviews:** `R5-10.T4.RV`, `R5-10.T5.RV`, `R5-10.T7.RV`, `R5-10.T9.RV`, `R5-10.RV` (the step), `R6-01.B1.RV`,
  `R6-01.B2.RV`, `R6-02.P1.RV`.
- **Docs item:** `W13.DOCS-A`, `W13.DOCS-B` (they may overlap wave 14's first builders).
- **Fillers:** none.

## Rules for this wave

1. **No zone file is open.** The zones are LANDed. A zone fix found here (a remix that does not span the expanded
   stage, a boss-rush delay that needs a zone change) is a small fix subtask the orchestrator spawns, with a LAND
   (`land-zone.sh <scope>`), never an edit inside another lane.
2. **Benches run under the e2e lock**, one file at a time:
   `flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts <file>.perf.ts`.
   The whole `pnpm bench` (with the 30-minute soak) is wave 15's.
3. **A gate or budget changes only deliberately**, with the measured reason in the commit body and the docblock
   (`DRAW_CALL_BUDGET` 20, the heap gate, `DIST_BUDGET`, `APP_JS_GZIP_BUDGET` 512 KB). Never to get green.
4. **The beta tag** is a pre-release: the orchestrator runs
   `gh release create v2.0.0-beta.1 --prerelease --target <R5-10.T9's commit> --title "v2.0.0-beta.1" --notes …` after
   the wave's exit check. The notes say: all zones remastered with stand-in art; real art drops pending the owner;
   the full suite runs before `v2.0.0` (decision RUN-1). The owner's sign-off is welcome and never blocks.

## Subtasks

### R5-10.T4 — The boss rush with the new bosses

- **Wave / lane / order:** wave 13, lane 1.
- **Depends on:** all nine zone LANDs (R5-01.S7 … R5-09.S7) on `origin/master`.
- **Goal:** the boss rush fights the nine rebuilt bosses: its `rush` list (the bosses by id, `content/stages/boss-rush.stage.json:56`)
  in order, with delays retimed to the bigger fights; it clears in god mode within its budget.
- **Files (only these):** `content/stages/boss-rush.stage.json`; `test/playtest/boss-rush.test.ts`.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/boss-rush.test.ts
  ```
  then, under the land lock (FINGERPRINTS — the content changed):
  ```bash
  SHMUP_FINGERPRINT_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-db-fingerprint.test.ts test/integration/presentation-fingerprint.test.ts
  SHMUP_FINGERPRINT_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden
  ```
- **Acceptance:** the boss rush clears in god mode within `boss-rush.test.ts`' time budget; only the presentation
  fingerprint's `extra.bossRush` segment and the content-DB entries of `boss-rush` move; every golden verified
  unchanged (the boss rush has no golden).
- **Token:** FINGERPRINTS (the land lock for the push).
- **Traps:** the `rush` list names enemy ids — never rename a boss; a boss that times out in the rush is retimed by
  its delay, never by editing its zone; never `golden:update`.
- **Docs needs:** the new rush order and timings for `docs/dev/extra-modes-and-replays.md` and its client page.

### R5-10.T5 — The loops and the caravan follow the zones

- **Wave / lane / order:** wave 13, lane 2.
- **Depends on:** all nine zone LANDs.
- **Goal:** verify that every zone's loop remix (written by its `S5b`) spans the expanded stage, that loop 2 runs,
  and that the caravan (score attack) still works; fix only test pins that moved for a real reason.
- **Files (only these):** `test/integration/loops-runtime.test.ts` (only if a pin moved).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/loops-runtime.test.ts test/golden
  ```
- **Acceptance:** loops-runtime green; the goldens `zone-a-loop2-boss`, `zone-a-loop2-god` and `zone-a-caravan`
  verified unchanged. A remix that does not span its stage goes to the orchestrator as a zone fix (a LAND), never
  here. Likely a report-only subtask.
- **Token:** none.
- **Traps:** a moved golden here means a sim change somewhere — a bug, report it; never paste a failing run's
  output as the new expectation.
- **Docs needs:** none, unless the loops changed (then `extra-modes-and-replays.md`).

### R5-10.T7 — The render bench draws the real zones

- **Wave / lane / order:** wave 13, lane 3.
- **Depends on:** all nine zone LANDs.
- **Goal:** replace R3-04's "v2 zone stand-in" scenario of the headless render bench (and of the TV bench scene, if
  it names zone sprites) with the real remastered zones.
- **Files (only these):** `test/bench/render.perf.ts`, `test/bench/render-harness/load.ts`,
  `test/integration/render-bench.test.ts`, `test/integration/tv-render-bench.test.ts`, `apps/tizen/src/bench/scene.ts`
  (only if it names zone sprites).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/render-bench.test.ts test/integration/tv-render-bench.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/bench
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts render.perf.ts
  ```
- **Acceptance:** the scenario renders the real zones; the gates (`DRAW_CALL_BUDGET` 20, the heap gate) hold, or a
  gate changes deliberately with the measured reason; `pnpm bench:tv` still builds and `dist-bench/` passes
  `check-bundle` if `scene.ts` changed.
- **Token:** none.
- **Traps:** the render bench runs a Vite-built page in Playwright's Chromium — it takes the e2e lock; the TV bench's
  18-scenario matrix stays 18; Chromium 68 in `apps/tizen/src/bench`.
- **Docs needs:** the bench's real-zone figures for `docs/dev/render-performance-review.md`.

### R5-10.T9 — The `2.0.0-beta.1` version line

- **Wave / lane / order:** wave 13, lane 4; pushes last of R5-10.
- **Depends on:** R5-10.T4, T5, T7 on `origin/master` (and the wave-12 subtasks of R5-10).
- **Goal:** every workspace project at `2.0.0-beta.1`, mirroring what R2-04.REL did for `2.0.0-alpha.1`.
- **Files (only these):**
  - the 10 manifests: `package.json`, `packages/{audio-web,core,input-web,render-pixi,shell}/package.json`,
    `apps/{electron,tizen,web,webos}/package.json`;
  - `test/integration/tooling-config.test.ts` — `RELEASE` (`:323` on `bc8e05d`) and the prerelease check
    (`:327`, `['beta', 1]`);
  - `apps/tizen/test/config-xml/config-xml-consistency.test.ts` — the title text at `:32`;
  - `test/scripts/store-assets-edge.test.ts` — the comment at `:182`.
- **Tests (targeted):**
  ```bash
  pnpm install --frozen-lockfile     # no lockfile change: no lockfile line holds the workspace version
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tooling-config.test.ts test/scripts/store-assets-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/config-xml
  ```
- **Acceptance:** every manifest says `2.0.0-beta.1`; the TV manifests stay `2.0.0` (the Tizen `config.xml`, the
  webOS `appinfo.json` take numbers only); `pnpm-lock.yaml` unchanged; the tests green.
- **Token:** none (it is the only lane editing the manifests in this wave).
- **Traps:** the CHANGELOG's version line and the docs that quote the version are the docs agent's (`W13.DOCS-A`),
  never this lane's — `tooling-config.test.ts` checks that the first CHANGELOG section stays `[Unreleased] — v2`;
  never touch `.github/workflows/ci.yml`, `turbo.json` or the lockfile.
- **Docs needs:** the version line for `CHANGELOG.md`, `README.md`, `CLAUDE.md` (its version sentence) and every doc
  that quotes `2.0.0-alpha.1`.

### R6-01.B1 — The balance report harness

- **Wave / lane / order:** wave 13, lane 5, first (a filler from wave 12 when a slot was free).
- **Depends on:** all nine zone LANDs.
- **Goal:** a bench (not part of `pnpm test`) that plays every campaign route × both ships × the four presets
  **without** god mode and records, per zone: the score curve, deaths, extends earned, rank, boss fight times.
  Deterministic.
- **Files (only these):** `test/bench/balance.perf.ts` (**new**).
- **Steps:**
  1. Read `test/playtest/campaign.ts` (`walkCampaignRoutes`, `playRunZone`) and `test/playtest/campaign-routes.ts`;
     use them **read-only** (BOT token: never edit them). If they cannot run without god mode or lack a hook you
     need, stop and report.
  2. One `it` per preset × ship (8 cases), each with its own timeout above the bench config's 300 s default.
  3. Write the table as JSON and Markdown to a temp dir given by `SHMUP_BALANCE_OUT` (default `os.tmpdir()`), never
     to a fixed repository path.
- **Tests (targeted):**
  ```bash
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts balance.perf.ts   # long: background + poll
  pnpm typecheck:root
  pnpm exec eslint test/bench/balance.perf.ts && pnpm exec prettier --check test/bench/balance.perf.ts
  ```
- **Acceptance:** two runs give byte-identical tables; the bench is excluded from `pnpm test` (it lives in
  `test/bench/`); no shared harness file changed.
- **Token:** none.
- **Traps:** the run is long (16 routes × 2 ships × 4 presets, 5 zones each): run it in the background and poll; the
  sim is deterministic — any difference between two runs is a bug; no `Math.random` / `Date.now` in what feeds the
  sim.
- **Docs needs:** how to run it, for `docs/dev/difficulty-and-rank.md`.

### R6-01.B2 — The balance report

- **Wave / lane / order:** wave 13, lane 5, after R6-01.B1.
- **Depends on:** R6-01.B1 on `origin/master`.
- **Goal:** run B1, read the table, and write the findings with **proposed numbers**: the extends (today 20,000 /
  every 70,000, re-derived from v2 run scores), the milking cap (`repeatKills` / `repeatPercent`), the rank growth
  per preset, per-zone point values where the expanded levels changed the score curve, the caravan clock (decision
  R6-D1: keep 3 min unless the numbers say otherwise), the boss-rush delays.
- **Files (only these):** `docs/v2-run/balance-report.md` (**new**; it is the input of wave 14, so it is committed).
- **Tests:** the B1 command (under the e2e lock).
- **Acceptance:** every proposal cites the table row it comes from; one section per zone (the B3 subtasks of wave 14
  read their own section) and one global section (B4, B5).
- **Token:** none (a docs path of the run folder, owned by this subtask).
- **Traps:** propose, never apply: content and rules change in wave 14; the owner reads the report with his play
  sessions (Manual) and may override any number.
- **Owner (Manual):** read the report; play sessions on the M7; send any override before wave 14 starts (never
  blocks: without notes, wave 14 applies the proposals).

### R6-02.P1 — The headless re-measure with the final content

- **Wave / lane / order:** wave 13, lane 6.
- **Depends on:** R5-10.T7 on `origin/master` (`render.perf.ts` changed there).
- **Goal:** measure the remastered game headless: the stress bench, the per-zone stress bench, the render bench;
  the per-zone memory estimate (`estimateStageMemory`) table; both TV bundles' sizes and budgets.
- **Files:** none, unless a gate must change deliberately: then `test/bench/{stress,zones,render}.perf.ts` (gates
  only) or `apps/tizen/scripts/check-bundle.mjs` (a budget only), each with the measured reason.
- **Tests (targeted):**
  ```bash
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts stress.perf.ts
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts zones.perf.ts
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts render.perf.ts
  SHMUP_STANDIN_PRINT=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/standin-budget.test.ts
  pnpm --filter @shmup/tizen build && pnpm --filter @shmup/webos build
  ```
- **Acceptance:** every number in the report (ms per tick, heap, render ms, draw calls, render-target bytes, per-zone
  textures + images against `TEXTURE_BUDGET_BYTES` 23 MiB, `app.js` gzip against 512 KB, `dist/` against
  `DIST_BUDGET`); a missed budget goes to the orchestrator as a fixer, never a budget raise.
- **Token:** none.
- **Traps:** the soak (`soak.perf.ts`, 30 min) is wave 15's; `standin-budget.test.ts` measures R3-04's stand-in
  table — if it does not cover the real zones, report the gap, do not rewrite it here.
- **Docs needs:** the numbers for `docs/dev/render-performance-review.md` and `docs/dev/platform-polish.md`
  (wave 15's docs item records them in `docs/dev/input-probe-results.md` §12 with the TV numbers).

### R6-02.P2 — The owner's capture kit

- **Wave / lane / order:** wave 13, lane 7.
- **Depends on:** all nine zone LANDs.
- **Goal:** build what the owner needs on the TV and write the step-by-step checklist: the guided render capture
  (M3-02f's telemetry, `docs/client/debug-tools.md`, `docs/dev/debug-and-replays.md`) on both M7s, and the R0 TV bench
  for comparison.
- **Files:** none committed (the checklist goes into the report; `W13.DOCS-B` writes it into
  `docs/client/install-on-tv.md`).
- **Tests (builds only):**
  ```bash
  pnpm --filter @shmup/tizen build:dev
  pnpm bench:tv
  ```
- **Acceptance:** both builds succeed and pass their bundle checks; the checklist names every command, the log
  server (`tools/input-probe/`), where the logs land (`tools/input-probe/results/`), and what to send back.
- **Token:** none.
- **Traps:** **never** package, sign, install or run anything on a TV (`bench:tv:package`, `bench:tv:install`,
  `sdb`, the Tizen CLI are the owner's); no `VITE_REPORT_URL` secret in a committed file.
- **Owner (Manual):** run the kit on both M7s; send the logs (needed by R6-02.P3, wave 15).

## Reviews

- `R5-10.T4.RV`, `R5-10.T5.RV` (if it committed), `R5-10.T7.RV`, `R5-10.T9.RV`: read the diff, re-run the block's
  tests, check its acceptance and traps.
- `R5-10.RV` — the R5-10 step review over T1 … T9: the boss rush, loops, bonus stages, escape, dimension, ranges,
  linked pages and the version line hold together; `test/golden` verified; the derived files match their reasons.
- `R6-01.B1.RV` (determinism of the harness, no shared file edited), `R6-01.B2.RV` (every proposal traceable to the
  table), `R6-02.P1.RV` (only if a gate or budget changed: the reason is measured).
- Every loop: a new reviewer each round, until zero findings, nits included.

## Docs item

### W13.DOCS-A — The plan, the changelog and the beta.1 lines

- **Depends on:** R5-10.T9 on `origin/master` and `R5-10.RV` at zero.
- **Goal:** R5-10's As built (T1 … T9) and Manual list; §17 R5-10 → `done (owner parts pending)` and R6-01, R6-02 →
  `in progress`; CHANGELOG `[Unreleased] — v2`: the version line `2.0.0-beta.1` and the R5-10 entries; `README.md`'s
  version line; then `python3 .claude/plan_board_v2.py`.
- **Files (only these):** `plan_resolution.md` (R5-10, §17), `CHANGELOG.md`, `README.md` (the version line and the
  milestone sentence only).
- **Token:** PLAN.
- **Traps:** the CHANGELOG's first section stays `## [Unreleased] — v2` (`tooling-config.test.ts`); keep §17's
  three-column rows.

### W13.DOCS-B — The extra modes, the bench, the bestiary, the capture checklist

- **Files (only these):** `docs/dev/extra-modes-and-replays.md` and `docs/client/extra-modes-and-replays.md` (the
  boss rush, the loops, the caravan), `docs/dev/render-performance-review.md` (the bench's real zones, P1's headless
  numbers), `docs/client/bestiary.md` (the section "Bosses you only meet in EXTRA"), `docs/client/install-on-tv.md`
  (R6-02.P2's checklist), `docs/dev/difficulty-and-rank.md` (how to run `balance.perf.ts`).
- **Tests:** none.

### W13.DOCS-RV — Review of the docs item

- The loop to zero, as in every wave.

## Exit check

1. `origin/master` holds R5-10.T4, T5 (if any), T7, T9 and R6-01.B1, B2; `docs/v2-run/balance-report.md` exists.
2. `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/playtest/boss-rush.test.ts test/integration/loops-runtime.test.ts test/integration/render-bench.test.ts test/integration/tv-render-bench.test.ts test/integration/tooling-config.test.ts test/integration/content-db-fingerprint.test.ts test/integration/presentation-fingerprint.test.ts`
   and `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/config-xml`.
3. `pnpm content:check`; `pnpm --filter @shmup/tizen build`.
4. The docs review at zero; §17 and the board synced.
5. The orchestrator tags `v2.0.0-beta.1` (pre-release, rule 4). A CI look at most.
6. **Deferred to wave 15:** R5-10.T10 (the milestone's full suite: `pnpm format:check && pnpm lint && pnpm typecheck
   && pnpm test && pnpm build`, `pnpm test:e2e` with Firefox, the whole `pnpm bench`, `docs:images --check`,
   `store:assets --check`, the input probe) — it runs once, as R6-03.D6.

## Owner (Manual) — never blocks this wave

- Sign off the beta (optional); play sessions over the new zones (feeds R6-01).
- Run the capture kit on both M7s and send the logs (R6-02.P3, wave 15).
- Read the balance report; send overrides before wave 14 (optional).
