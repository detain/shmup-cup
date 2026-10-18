# Wave 05 — R2-02 after the port ∥ R3-03 / R3-04 close ∥ the docs of all three

> Schedule: [`plan_resolution.md` §18](../../plan_resolution.md#18-execution-waves-for-the-10-agent-run) · how to
> use: [`README.md`](README.md) · decisions: [`decisions.md`](decisions.md) · background:
> [`wave5-scout.md`](wave5-scout.md) §8, §9

**Steps:** R2-02 (un-gating, the content READMEs, bench and e2e after the port, residual zone fixes, the step
review), R3-03 (V4c, the step review), R3-04 (the step review), and the wave's docs for R2-02, R3-03 and R3-04.
**Gate to start:** wave 4's exit — the port commit `feat(R2-02): port all content ×1.5 …` on `origin/master`.
**Exit (summary):** U1–U5, R, B, EF and every spawned Z on master; the R2-02, R3-03 and R3-04 step reviews at zero
findings; `git grep -n port-pending` lists only docblock mentions in `test/golden/stale.ts` and `test/e2e/gates.ts`
(R2-03 deletes both files); the docs review at zero; §17 R2-02, R3-03, R3-04 → `done` (owner parts pending where
the step has some); the board synced.

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| 1 | `R2-02.U1` | 6 core test files, 1 shell test file | — | no |
| 2 | `R2-02.U2` | `test/integration/content.test.ts` | CONTENT-TEST | no |
| 3 | `R2-02.U3` | 6 zone integration tests | — | no |
| 4 | `R2-02.U4 → R3-03.V4c` | 11 integration tests (incl. `stage-terrain.test.ts`) | — | no |
| 5 | `R2-02.R` | `content/*/README.md` (8) | — | no |
| 6 | `R2-02.B → R2-02.EF` | read-only | — | yes (pass 1: bench files, then batches A–F) |
| 7 | `R2-02.U5` (after U1–U4 on master) | playtest / Tiled tests, `tile-size`, `e2e-gates`, `port-pending*` (deleted), one config comment | — | no |
| 8 | `R2-02.Z-*` — spawned only for a red zone (Z-A, Z-BC, Z-DE, Z-FG, Z-HI, Z-X) | that zone's content and tests | FINGERPRINTS (at push) | maybe (pass 2) |
| side | carry-overs from wave 4: any of `R3-03.V2a, V2b, V4a, V4b, V5`, `R3-04.M1a … M4b`, `R3-03.V3`, `R3-04.M3a … M3e` still open | their blocks in [`wave-04.md`](wave-04.md) / [`wave-02.md`](wave-02.md) | as there | as there |

- **Reviews:** slot 1 reviews U1–U5, R and each Z as they push, then runs `R2-02.RV` (the step review). Slot 2 runs
  `R3-03.RV` and `R3-04.RV` once their last subtasks are on master, then reviews the docs (`W05.DOCS-RV`).
- **Docs item:** `W05.DOCS-A` … `W05.DOCS-F`, six docs agents with disjoint files, **after** the three step reviews
  are at zero. Wave 6 may start once this wave's code exit passes; these docs agents then count against wave 6's cap.
- **e2e passes:** two. Pass 1: lane 6 (B's bench files, then EF's batches). Pass 2: a Z agent, or an M3 carry-over.

## Rules for this wave

1. **Shared content belongs to nobody in this wave.** `content/campaign/main.campaign.json`, `content/rules/*`,
   `content/patterns/{common,zones}.patterns.json` (zones B–I share `zones.patterns.json`), `content/fx/particles.fx.json`,
   `content/player/*`, `content/weapons/*`: a Z agent that needs a change there reports it; the orchestrator
   decides who makes it.
2. **A content change after the port moves the content-DB fingerprint** (and the presentation fingerprint if it
   touches zone A, zone B or a campaign walk). Its pusher takes the land lock, re-runs the prints
   (`SHMUP_FINGERPRINT_PRINT=1`) and pastes the tables (README rule 6).
3. **Goldens stay stale** until wave 6 (`test/golden/stale.ts`, `GOLDENS_STALE`; e2e `R2_03_PENDING`). Nobody runs
   `pnpm golden:update` — after the port its refusal has lifted by itself, so the command would really re-bless.
4. **The un-gating is mechanical.** `describePortPending(name, fn)` → `describe(name, fn)`,
   `itPortPending(name, fn, t?)` → `it(name, fn, t?)`, `describe.skipIf(CONTENT_PORT_PENDING)` / `it.skipIf(…)` →
   plain `describe` / `it`; delete the import of `port-pending.js` when nothing else of it is used. A test that
   fails once un-gated is a real failure: report it (it is a Z item or a T item missed in wave 3), never re-gate it.
5. Expected skips once U1–U5 are on master: **280** = 239 `GOLDENS_STALE` + 41 frame `runIf`s, and **0**
   `CONTENT_PORT_PENDING`.

## Subtasks

### R2-02.U1 — Un-gate the core and shell tests

- **Wave / lane / order:** wave 05, lane 1, first.
- **Depends on:** the port commit on master.
- **Goal:** the port-pending wrappers in core and shell tests become plain `describe` / `it`.
- **Files (only these):** `packages/core/test/behaviors/behaviors.test.ts`, `behaviors-cube.test.ts`,
  `behaviors-cube-edge.test.ts`, `behaviors-zones-de-edge.test.ts`; `packages/core/test/powerups/powerups-direct.test.ts`;
  `packages/core/test/stage/stage-bonus.test.ts`; `packages/shell/test/dispatch/dispatch-fx-runtime.test.ts`.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors.test.ts \
    packages/core/test/behaviors/behaviors-cube.test.ts packages/core/test/behaviors/behaviors-cube-edge.test.ts \
    packages/core/test/behaviors/behaviors-zones-de-edge.test.ts packages/core/test/powerups/powerups-direct.test.ts \
    packages/core/test/stage/stage-bonus.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/dispatch/dispatch-fx-runtime.test.ts
  pnpm --filter @shmup/core typecheck && pnpm --filter @shmup/shell typecheck
  ```
- **Acceptance:** no `port-pending` import left in these files; the same test count as before (the wrappers ran
  already under the stub); all green.
- **Token:** none.
- **Traps:** rule 4 of this wave; do not touch `port-pending.ts` itself (U5 deletes it last).

### R2-02.U2 — Un-gate `content.test.ts`

- **Wave / lane / order:** wave 05, lane 2, first.
- **Depends on:** the port commit on master.
- **Goal:** the 9 port-pending sites in `content.test.ts` become plain tests.
- **Files (only these):** `test/integration/content.test.ts` (find the sites with
  `grep -n "PortPending\|CONTENT_PORT_PENDING" test/integration/content.test.ts`; 9 on `bc8e05d`).
- **Tests:** `pnpm content:check` (= `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration
  test/integration/content.test.ts`).
- **Acceptance:** no `port-pending` reference left; green, with the 4-way rules at 3.0 / 24 / 1,350.
- **Token:** CONTENT-TEST.
- **Traps:** a 2,315-line file: edit with exact old/new strings, never rewrite it. The A5 review's PRISM LABYRINTH
  row-14 case (about `:1659`) must find its rising walls now that zone G's walls moved one row up (hand fix): if it
  fails, report it to `R2-02.Z-FG`.

### R2-02.U3 — Un-gate the zone integration tests

- **Wave / lane / order:** wave 05, lane 3, first.
- **Depends on:** the port commit on master.
- **Files (only these):** `test/integration/zones-de-runtime.test.ts`, `zones-de-runtime-edge.test.ts`,
  `zones-fg-runtime.test.ts`, `zones-fg-runtime-edge.test.ts`, `zones-fg-direct.test.ts`, `zones-hi-runtime-edge.test.ts`.
- **Tests:** `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/zones-de-runtime.test.ts
  test/integration/zones-de-runtime-edge.test.ts test/integration/zones-fg-runtime.test.ts
  test/integration/zones-fg-runtime-edge.test.ts test/integration/zones-fg-direct.test.ts
  test/integration/zones-hi-runtime-edge.test.ts`.
- **Acceptance:** no `port-pending` reference left; green. A red zone test goes to the matching Z item.
- **Token:** none.

### R2-02.U4 — Un-gate the other integration tests

- **Wave / lane / order:** wave 05, lane 4, first; `R3-03.V4c` follows in the same lane.
- **Depends on:** the port commit on master.
- **Files (only these):** `test/integration/arsenal-runtime.test.ts`, `bonus-stage-runtime.test.ts`,
  `campaign-flow.test.ts`, `death-runtime.test.ts`, `dimension-runtime.test.ts`, `enemies-runtime.test.ts`,
  `extra-edit-runtime.test.ts`, `raster-range-runtime.test.ts`, `stage-runtime.test.ts`, `weapons-runtime.test.ts`,
  `stage-terrain.test.ts` (its `itPortPending` at `:131` and `:205`).
- **Tests:** `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration` with those 11 files.
- **Acceptance:** no `port-pending` reference left; green.
- **Token:** none.
- **Traps:** in `stage-terrain.test.ts` change only the wrappers; V4c (next) replaces its checks by imports.

### R3-03.V4c — `stage-terrain.test.ts` imports the shared terrain checks

- **Wave / lane / order:** wave 05, lane 4, after `R2-02.U4`.
- **Depends on:** `R2-02.U4` and `R3-03.V4b` (it created `test/integration/terrain-checks.ts`) on master.
- **Goal:** remove the duplicate: `stage-terrain.test.ts` imports the two checks from `terrain-checks.ts`.
- **Files (only these):** `test/integration/stage-terrain.test.ts`; `test/integration/terrain-checks.ts` only if the
  copy drifted from the original (keep one version, the original's behaviour).
- **Tests:** `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/stage-terrain.test.ts
  test/scripts/assets/tileset-masks.test.ts`.
- **Acceptance:** the same test count and names as before (`pnpm exec vitest list --project integration
  test/integration/stage-terrain.test.ts` before and after); all green.
- **Token:** none.

### R2-02.R — The content READMEs' format samples at v2

- **Wave / lane / order:** wave 05, lane 5.
- **Depends on:** the port commit on master.
- **Goal:** the hand-written format samples match the ported content (12-px tiles, 12-entry masks, ×1.5 numbers;
  plan R1-03's note: the tool does not touch them).
- **Files (only these):** `content/stages/README.md`, `content/tilesets/README.md`, `content/player/README.md`,
  `content/enemies/README.md`, `content/paths/README.md`, `content/fx/README.md`, `content/weapons/README.md`,
  `content/patterns/README.md`.
- **Tests:** `pnpm content:check` (it validates the README samples against the schemas).
- **Acceptance:** every sample validates; numbers are the v1 sample × 1.5 by each field's unit (frame-anchored ones
  re-derived from the 640×360 frame, plan §2.6).
- **Token:** none.
- **Traps:** these READMEs are format samples, not prose docs, so this builder may edit them. Take each number's
  unit from its schema, never from its name.

### R2-02.B — The bench after the port

- **Wave / lane / order:** wave 05, lane 6, first; `R2-02.EF` follows in the same lane.
- **Depends on:** the port commit on master.
- **Goal:** measure the sim and render cost of the ported content; a failing gate goes to a fixer.
- **Files:** read-only. Write the numbers into your report.
- **Tests:**
  ```bash
  flock -w 5400 /tmp/shmup-cup-e2e.lock env VITEST_MAX_WORKERS=6 pnpm exec vitest run \
    --config test/bench/vitest.config.ts test/bench/stress.perf.ts test/bench/zones.perf.ts test/bench/render.perf.ts
  ```
  **Not** `test/bench/soak.perf.ts` and not the whole `pnpm bench`: wave 15 runs them.
- **Acceptance:** every gate green, or each red gate reported with its numbers. Compare with wave 4's C5 numbers on
  `e7ff5db`: stress median 0.138 ms/tick, zones medians 0.479–0.524 ms/tick, render worst case p95 5.7 ms with 9 draw
  calls (a shared, noisy host).
- **Token:** none.
- **Traps:** **never raise a budget**; a red gate is a finding for the orchestrator.

### R2-02.EF — The e2e check after the port

- **Wave / lane / order:** wave 05, lane 6, after `R2-02.B`.
- **Depends on:** the port commit on master.
- **Goal:** prove that master's e2e is green on the ported content (the content-bound specs skip on
  `PORT_UNMEASURED` by design; E0's extra gates hold).
- **Files:** read-only.
- **Tests:** the standard batches **A, B, C, D, E**, one after another, then **F** (Firefox determinism), each with
  `bash docs/v2-run/helpers/e2e-batch.sh <the batch's specs>` (README "The standard e2e batches"), in the background,
  polling the log.
- **Acceptance:** 0 failures; report per batch: passed / skipped / flaky, and every skip's reason (`PORT_REASON`,
  `CONTENT_REASON`, `GOLDEN_REASON`).
- **Token:** none.
- **Traps:** a failure seen only once may be a flake: re-run that spec alone, then with `taskset -c 0-3` and
  `E2E_WORKERS=2`; report both. Never raise a timeout to get green.

### R2-02.U5 — The last un-gating: delete the port-pending gate

- **Wave / lane / order:** wave 05, lane 7, after U1–U4 are on master.
- **Depends on:** `R2-02.U1`, `U2`, `U3`, `U4` on master.
- **Goal:** remove the last users of `port-pending.ts`, then the file and its test.
- **Files (only these):**
  - `test/playtest/four-way-bot.test.ts`, `test/playtest/harness.test.ts` — un-gate;
  - `test/scripts/content/tiled-import.test.ts`, `test/scripts/content/tiled-import-edge.test.ts` — un-gate;
  - `test/integration/tile-size.test.ts` — drop the pending branch: the import (`:28`), `CONTENT_TILE_SIZE` (`:35`)
    becomes `TILE_SIZE` everywhere, delete the case "is pending only in the R2-01 → R2-02 window" (`:71-78`), fix the
    docblock (`:5-9`) and the next case's title (`:80`, "TILE_SIZE, or 8 while the port is pending");
  - `test/integration/e2e-gates.test.ts` — rewrite the pin `contentPorted() === !CONTENT_PORT_PENDING` (`:15`, `:101-102`)
    as a direct read of every `content/tilesets/*.tileset.json` `tileSize` against `scripts/frame.mjs` `TILE_SIZE`;
    update its docblock (`:5`, `:10-11`);
  - `packages/core/test/helpers/port-pending.ts` and `packages/core/test/helpers/port-pending.test.ts` — **deleted**;
  - `packages/core/src/config/index.ts` — the comment at `:788-789` (drop "stays at v1's 8 until then,
    `CONTENT_PORT_PENDING`"); comment only.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tile-size.test.ts \
    test/integration/e2e-gates.test.ts test/playtest/four-way-bot.test.ts test/playtest/harness.test.ts test/scripts/content
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/helpers packages/core/test/frame-literals.test.ts
  pnpm --filter @shmup/core typecheck && pnpm typecheck:root
  git grep -n port-pending
  ```
- **Acceptance:** `git grep -n port-pending` lists only docblock mentions in `test/golden/stale.ts` (`:26`) and
  `test/e2e/gates.ts` (`:24`, `:39`, `:132`) — R2-03.G1 deletes both files; all green.
- **Token:** CORE-CONFIG (one comment).
- **Traps:** `test/e2e/gates.ts` keeps its own `contentPorted()`; do not edit it (it is a spec helper R2-03 deletes).
  The playtests are slow (minutes of simulation per zone): run only the two playtest unit files listed.

### R2-02.Z-A — Residual fixes: zone A (spawn only if red)

- **Wave / lane / order:** wave 05, lane 8, only when S's, U3–U5's or EF's report names a red zone-A test.
- **Depends on:** the port commit on master; the red list in those reports.
- **Goal:** fix what the port left wrong in zone A's content or its zone-owned tests, so the bot clears it and the
  v2-port comparison holds.
- **Files (only these):** `content/stages/zone-a.stage.json`, `content/enemies/zone-a.enemies.json`,
  `content/paths/zone-a.paths.json`, `test/playtest/zone-a.test.ts`, `test/playtest/zone-a-recovery.test.ts`; plus
  the three fingerprint `PINNED` tables at push.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-a.test.ts \
    test/playtest/zone-a-recovery.test.ts test/golden/v2-port.test.ts test/golden/v2-port-zones.test.ts
  pnpm content:check
  ```
- **Acceptance:** the bot clears zone A in god mode within its budgets; `v2-port*` green; `content:check` green.
- **Token:** FINGERPRINTS (content-DB, and presentation: zone A is in every campaign walk) under the land lock.
- **Traps:** `tender` (zone A's capsule carrier) is used by every zone B–I and `picket` / `halcyon-bulwark` by
  `bonus-range`: do not change their sim fields here — report instead. Test pins are written through
  `packages/core/test/helpers/v1-port.ts` (`v1x`, `v1speed`, `v1screenX`), never by pasting a failing run's output.
  A moved spawn breaks the v2-port first-visible ±1 check: add an exemption only with its reason, and say so.

### R2-02.Z-BC — Residual fixes: zones B and C (spawn only if red)

- **Wave / lane / order / depends on / goal:** as `R2-02.Z-A`, for zones B and C.
- **Files (only these):** `content/stages/zone-b.stage.json`, `zone-c.stage.json`, `brine-grotto.stage.json`;
  `content/enemies/zone-b.enemies.json`, `zone-c.enemies.json`; `content/paths/zone-c.paths.json`;
  `test/playtest/zone-b.test.ts`, `zone-c.test.ts`, `zone-bc-recovery.test.ts`; `test/integration/zones-bc-runtime.test.ts`,
  `zones-bc-direct.test.ts`.
- **Tests:** those playtest and integration files plus `test/golden/v2-port*.test.ts` and `pnpm content:check`.
- **Acceptance / token / traps:** as `R2-02.Z-A` (FINGERPRINTS: content-DB; presentation for zone B, which `runA`
  walks). Zones B–I share `content/patterns/zones.patterns.json`: never edit it here (rule 1).

### R2-02.Z-DE — Residual fixes: zones D and E (spawn only if red)

- **As `R2-02.Z-A`**, for zones D and E. **Files:** `content/stages/zone-d.stage.json`, `zone-e.stage.json`;
  `content/enemies/zone-d.enemies.json`, `zone-e.enemies.json`; `content/paths/zone-d.paths.json`, `zone-e.paths.json`;
  `test/playtest/zone-d.test.ts`, `zone-e.test.ts`, `zone-de-recovery.test.ts`; `test/integration/zones-de-runtime.test.ts`,
  `zones-de-runtime-edge.test.ts`, `zones-de-direct.test.ts`. Known: zone D's `camera.y` pins (the dive's `yTo` is ×1.5
  + pad, O2) are T2b's / T2c's — check they landed.

### R2-02.Z-FG — Residual fixes: zones F and G (spawn only if red; zone F is a known item)

- **As `R2-02.Z-A`**, for zones F and G. **Files:** `content/stages/zone-f.stage.json`, `zone-g.stage.json`,
  `glimmer-cache.stage.json`; `content/enemies/zone-f.enemies.json`, `zone-g.enemies.json`; `test/playtest/zone-f.test.ts`,
  `zone-g.test.ts`, `zone-fg-recovery.test.ts`; `test/integration/zones-fg-runtime.test.ts`, `zones-fg-runtime-edge.test.ts`,
  `zones-fg-direct.test.ts`.
- **Known item:** in the wave-5 scout's experiment the bot in zone F had `broken` (tissue walls shot open) or
  `lunges` at 0 in god mode, and the non-god run was still `playing` after 600 s with 2 deaths. Find whether the
  cause is content (wall hp, tissue regrowth at ×1.5 lengths), a test literal, or the bot (the bot is `test/playtest/
  four-way-bot.ts`: BOT token, not yours — report a bot cause). Also zone G's PRISM LABYRINTH row-14 rising-wall case
  in `content.test.ts` if U2 reported it.

### R2-02.Z-HI — Residual fixes: zones H and I (spawn only if red)

- **As `R2-02.Z-A`**, for zones H and I. **Files:** `content/stages/zone-h.stage.json`, `zone-i.stage.json`;
  `content/enemies/zone-h.enemies.json`, `zone-i.enemies.json`; `test/playtest/zone-h.test.ts`, `zone-i.test.ts`,
  `zone-hi-recovery.test.ts`; `test/integration/zones-hi-runtime-edge.test.ts`. Known: zone I's eel count (`e.y <
  camera.y + 170` → `v1y(170)`) is T2b's — check it landed. Zone H's top pistons no longer reach above the top edge
  (plan R2-02, R1-03 notes): visual only.

### R2-02.Z-X — Residual fixes: the other stages (spawn only if red)

- **As `R2-02.Z-A`**, for `bonus-range`, `bonus-vault`, `brine-grotto` and `glimmer-cache` (if Z-BC / Z-FG are not
  running), `boss-rush`, `gauntlet-range`, `escape`, `dimension`, the dev ranges and the campaign routes.
- **Files:** the red stage's `content/stages/<id>.stage.json` and, for a range with its own roster, its
  `content/enemies/<id>.enemies.json`; `test/playtest/boss-rush.test.ts`, `test/playtest/campaign-routes*.test.ts`
  only to fix a v1 literal (through `v1-port.ts`). Never the shared harness (`test/playtest/{four-way-bot,harness,
  rules,recovery,campaign,campaign-routes}.ts`: BOT token) — report.

## Reviews

### R2-02.RV — The R2-02 step review

- **Wave / lane / order:** wave 05, review slot 1, after U1–U5, R, B, EF and every Z are on master. Fix → **new**
  review → … until zero findings, nits included.
- **Goal:** the step's acceptance and the wave-5 reviewer gate (`wave5-scout.md` §8, as corrected after the flip).
- **Steps / must hold:**
  - `git diff --name-only <wave-2 base>..origin/master -- test/golden/'*.replay.json' content/demos
    test/fixtures/v1-baseline` empty; `pnpm golden:update` and `SHMUP_V1_BASELINE_UPDATE` never ran;
  - pre-port commits were neutral (wave 4's RV-pre said so; spot-check two);
  - the port commit = tool + `handfix.patch` + the kit's flip lines + the stub (wave 4's S.RV1 said so);
  - `rescale --factor 1 --dry-run` 0 / 0 / 0; `pnpm content:check` green with the 4-way rules at 3.0 / 24 / 1,350;
  - the bot clears every zone, bonus stage and the boss rush in god mode
    (`VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest`);
  - `test/golden/v2-port*.test.ts` green; every exemption carries its reason;
  - all 66 allocation guards green with no budget raised
    (`VITEST_MAX_WORKERS=6 pnpm exec vitest run $(find packages apps test -name '*alloc*.test.ts' -not -path '*/node_modules/*')`);
  - `world-scale.test.ts` classifies every numeric barrel export; `behavior-defaults-port.test.ts` covers every tunable
    of `BEHAVIOR_PARAM_UNITS`;
  - skips: 280 (239 `GOLDENS_STALE` + 41 frame `runIf`), 0 `CONTENT_PORT_PENDING`;
  - `git grep -n port-pending` as U5's acceptance; no API newer than Chromium 68; zero allocation per tick / frame.
- **Must not have changed:** R2-03's work (no re-bless, no demo re-record, no `docs:images` / `docs:screens` /
  `store:assets` regeneration, no e2e re-measurement); R2-04's (shake, popup and particle-look speeds, the CRT look,
  spawn-lead retuning); `assets/source/atlas-groups.json`.

### R3-03.RV — The R3-03 step review

- **Wave / lane / order:** wave 05, review slot 2, once V1, V2a, V2b, V3, V4a, V4b, V4c and V5 are on master. Loop to
  zero.
- **Must hold:** `buildAtlas({ artScale: 1 })` unchanged (the scale-1 digest pin of `interim-pipeline.test.ts:341-357`
  green, unedited); V2a left `buildAtlas()` byte-identical (`ATLAS-SHA` at the commit before and after); bullets and
  bends native at 3/2 at the bible's sizes (round 11, oval 13 ×8, needle 17 ×8, bend 11), beams still `k + 1` rows;
  every `@<palette>` variant frame for frame (`content.test.ts:852`); the cycle scan passes on the shipped atlas and
  fails on its stray-pixel fixture; `INGEST` byte-identical with old fixtures unchanged; `node scripts/art-origins.mjs
  --check` 0 failures (438 procedural); `stage-terrain.test.ts` imports `terrain-checks.ts` with the same tests.
- **Re-run:** `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets
  test/scripts/art-origins.test.ts test/integration/palette-cycle-scan.test.ts test/integration/content.test.ts
  test/integration/stage-terrain.test.ts test/integration/atlas-groups.test.ts test/integration/cjk-budget.test.ts`;
  `cd art-prompts/ingest && npm ci && npm test && node ingest.mjs --check`.

### R3-04.RV — The R3-04 step review

- **Wave / lane / order:** wave 05, review slot 2, once M1a–M4b (M1c optional) and M3a–M3e are on master. Loop to
  zero.
- **Must hold:** the stand-in deterministic; budgets in bytes with derivations in docblocks (`DIST_BUDGET`, the atlas
  caps, `TEXTURE_BUDGET_BYTES`); the lazy policy holds the sim (a replay across a zone change hashes equal with and
  without the hold); debug frame advance still steps (`freezeSim` / `stepTo`); the context-loss e2e and the residency
  steady-state allocation guard green; both bundle checks and `pnpm bench:tv` pass; `DRAW_CALL_BUDGET` not raised;
  `app.js` ≤ 512 KB gzip; no API newer than Chromium 68 in `packages/shell/src` and `packages/render-pixi/src`.
- **Re-run:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/memory packages/shell/test/boot \
    packages/shell/test/loader packages/shell/test/frame-loop
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/atlas
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/standin.test.ts \
    test/integration/standin-budget.test.ts test/integration/cjk-budget.test.ts test/integration/render-bench.test.ts \
    test/integration/tv-render-bench.test.ts test/integration/tv-engine-floor.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test && VITEST_MAX_WORKERS=6 pnpm exec vitest run --project webos apps/webos/test
  pnpm --filter @shmup/tizen build && pnpm --filter @shmup/webos build && pnpm bench:tv
  bash docs/v2-run/helpers/e2e-batch.sh atlas-residency.spec.ts atlas-context-loss.spec.ts boot.spec.ts zone-map.spec.ts webos.spec.ts
  ```

### W05.DOCS-RV — Review of the wave's docs

- **Wave / lane / order:** wave 05, review slot 2, after W05.DOCS-A … F have pushed. Loop to zero.
- **Must hold:** every docs need in the reports of this wave's builders (`RUN_DIR/<id>-report.md`) and of wave 2–4's
  R2-02 / R3-03 / R3-04 subtasks is either written or listed as deferred with its reason; no doc quotes a number the
  code does not have (spot-check 10: `WORLD_SCALE`, `WORLD_TOP_PAD`, `SPAWN_LEAD` 664, `DIST_BUDGET`, the 4-way rules,
  `BOT_X`); tables readable; links resolve; `python3 .claude/plan_board_v2.py` ran after the §17 edit.

## Docs item

All six run after `R2-02.RV`, `R3-03.RV` and `R3-04.RV` are at zero. Inputs for every one: the builders' reports in
`RUN_DIR` ("docs needs"), [`wave5-scout.md`](wave5-scout.md) §9, and `git log` of the three steps. Each edits only its
files; markdown is not formatted by Prettier, so keep tables readable by hand.

### W05.DOCS-A — The plan and the changelog (holds PLAN)

- **Files (only these):** `plan_resolution.md`, `CHANGELOG.md`.
- **Write:**
  - R2-02's **As built** under its step: the tool's run and summary line, the hand fixes, `WORLD_SCALE` (1 → 3/2) and
    `WORLD_TOP_PAD` (0 → 36), the 15 frame-unit defaults, the kit (`test/port-v2/`, deleted by the port), the stub and
    U1–U5, the e2e pre-gate E0, the v2-port comparison and its exemptions, zone F's outcome, the build delta, B's
    numbers;
  - R3-03's and R3-04's As built (RR-7: the stand-in calibrated or not; RR-8: the bench decode pages);
  - §1's register: W5-1 … W5-19 (with the post-flip notes: W5-6 implemented in R2-01, W5-9's beam half moot),
    R2-N1 … R2-N3, RR-7, RR-8 (texts in [`decisions.md`](decisions.md));
  - Appendix B (§16): the extra constants (wave5-scout §0.4) and `WORLD_SCALE` / `WORLD_TOP_PAD`; O4's 1-px note
    (W5-3);
  - §17: R2-02, R3-03, R3-04 → `done` (owner parts pending where they have some: R3-04's M7 bench run);
  - `CHANGELOG.md` `[Unreleased] — v2`: one entry per step;
  - then `python3 .claude/plan_board_v2.py`.
- **Never:** §17 cells of other steps; any other file.

### W05.DOCS-B — `CLAUDE.md` and the conventions

- **Files (only these):** `CLAUDE.md`, `docs/dev/conventions.md`.
- **Write:** CLAUDE.md's "every world-pixel value ×1.5" line names `WORLD_SCALE` / `WORLD_TOP_PAD` and says R2-02 is
  done (`rescale.mjs` "R2-02 runs it for real" → ran); conventions: world values in code are `v1 × WORLD_SCALE`
  (`+ WORLD_TOP_PAD` for an absolute world y), the audit tests (`world-scale.test.ts`, `behavior-defaults-port.test.ts`),
  and the `particles.emit` lesson (a fractional `dx` added at a non-inlined call is boxed: `emit` adds the offset
  itself).

### W05.DOCS-C — Content, enemies, playtest, stages

- **Files (only these):** `docs/dev/content-data.md`, `docs/dev/enemies-and-behaviors.md`,
  `docs/dev/zone-a-and-playtest.md`, `docs/dev/stage-runtime.md`, `docs/dev/advanced-stages.md`.
- **Write:** the port done and the identity rule (`--factor 1` is 0 / 0 / 0); ported behaviour defaults and their
  snapshot test; the 4-way rules at 3.0 px/tick, 24 px, 1,350 px and `BOT_X = ENTER_END_X` (96); the masks tool
  (`scripts/assets/tileset-masks.mjs`) in `advanced-stages.md` or `stage-runtime.md`.

### W05.DOCS-D — API reference, test and script READMEs, package READMEs

- **Files (only these):** `docs/dev/api-reference.md`, `test/README.md`, `scripts/README.md`,
  `packages/core/README.md`, `packages/render-pixi/README.md`, `packages/shell/README.md`.
- **Write:** rows for `WORLD_SCALE`, `WORLD_TOP_PAD` and the changed defaults; render-pixi `createAtlas` with deferred
  pages (`loadPage` / `unloadPage`); the shell's `ImagePolicy` at run time and `prepare(): Promise<void>`; the new tests'
  rows (`world-scale`, `behavior-defaults-port`, `v1-port`, `v2-port*`, `palette-cycle-scan`, `standin*`,
  `tileset-masks`, `coop-p2`, `p2-ingest`, `palette-recolour`, `residency-*`, `atlas-context-loss.spec`).

### W05.DOCS-E — The asset pipeline and real art

- **Files (only these):** `docs/dev/asset-pipeline.md`, `docs/dev/real-assets.md`, `docs/dev/art-bible-v2.md` (§4.4–4.5),
  `docs/dev/art-provenance.md` (§9), `docs/dev/presentation-polish.md`, `art-prompts/ingest/README.md`.
- **Write:** "Player 2's palette swap" → the palette map; native v2 bullets and bends; palette variants of real art
  (kind `palette`); the stand-in generator; recipe keys `p2` and `collision`, `masks.json`; the cycle scan exists now and
  its exemption list is pinned in `test/integration/palette-cycle-scan.test.ts` (bible §4.4).

### W05.DOCS-F — Platform, rendering, build, performance

- **Files (only these):** `docs/dev/platform-polish.md`, `docs/dev/rendering-and-shell.md`, `docs/dev/build-test-deploy.md`,
  `docs/dev/render-performance-review.md`, `docs/client/outstanding-work.md`, `tools/input-probe/README.md`.
- **Write:** **the budget reasoning** (required by R3-04's scope: `DIST_BUDGET`, the atlas caps, `TEXTURE_BUDGET_BYTES`
  23 MiB at 640×360, the policies); the lazy residency, the hold and context loss; the bench's stand-in scenario; the
  owner's M7 run in outstanding-work.

## Exit check

1. On `origin/master` in a fresh worktree:
   ```bash
   git grep -n port-pending                                   # only stale.ts and gates.ts docblock lines
   pnpm content:check
   node scripts/content/rescale.mjs --factor 1 --dry-run      # 0 / 0 / 0
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tile-size.test.ts \
     test/integration/e2e-gates.test.ts test/integration/stage-terrain.test.ts test/golden/v2-port.test.ts
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/frame-literals.test.ts \
     packages/core/test/config
   ```
2. `R2-02.RV`, `R3-03.RV`, `R3-04.RV` and `W05.DOCS-RV` at zero findings; §17 updated; the board synced.
3. Deferred to wave 15: the full suite, the bench soak.

## Owner (Manual) — never blocks this wave

- Run `bench:tv` on the M7 with the stand-in scenario (R0-03), if not done.
- Confirm W5-2 (the spawn row), W5-15 (memory policy) and W5-16 (`DIST_BUDGET`) if you disagree with the defaults.
