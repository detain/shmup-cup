# Wave 3 — R2-02 prep B (the test pins, the v2-port comparison, the e2e pre-gate)

> Schedule: `plan_resolution.md` §18 · how to use: [`README.md`](README.md) · decisions: [`decisions.md`](decisions.md)
> · background: [`wave5-scout.md`](wave5-scout.md) §0 (what the experiment showed)
>
> **Run directory:** `RUN_DIR` is `/home/sites/shmup-cup-run` (README common rule 15). The commands below spell the
> path out, so each one runs as typed in a fresh shell; prose that says `RUN_DIR/…` means the same path.
>
> **Wave base:** when this wave's first agent starts, the orchestrator records the wave's base (the
> `origin/master` SHA at that moment) once, in the main checkout, and notes it in `RUN_DIR/lanes-<wave>.md` too
> (README step 5):
> `git fetch origin && git rev-parse origin/master > /home/sites/shmup-cup-run/w03-base.txt`.
> Every command below that diffs against the wave base reads that file, `$(cat /home/sites/shmup-cup-run/w03-base.txt)`;
> an agent's prompt may carry the SHA itself instead, never a placeholder.

**Steps:** R2-02 (prep B: T1a–T1e, T2a–T2e, T3, E0) · side lanes carried over from wave 2 (`R3-03.V3`, `R3-04.M3*`)
· **Gate to start:** wave 2's exit and `R2-02.RV-A2`'s lists in `RUN_DIR/w02/rv-a2/` · **Exit (summary):** every T
and E0 on master, reviewed to zero, still neutral at K = 1; each T's tests green under the kit; zero e2e failures
under the kit and master e2e unchanged.

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| 1 | `R2-02.T1a` → `R2-02.T2c` | `packages/core/test/behaviors/**`; `test/integration/zones-*.test.ts` | — | no |
| 2 | `R2-02.T1b` → `R2-02.T2d` | `packages/core/test/{enemies,bosses}/**`; 8 `test/integration/` runtime files (`world-flight` and seven `*-runtime*`) | — | no |
| 3 | `R2-02.T1c` → `R2-02.T2e` | `packages/core/test/{bullets,weapons,shields,patterns}/**`; 13 integration files | — | no |
| 4 | `R2-02.T1d` → `R2-02.T1e` | `packages/core/test/{powerups,world,debug,replay,blackhole,player,options}/**`, one scenes test; `packages/core/test/{data,stage,collision,config}/**` | — | no |
| 5 | `R2-02.T2a` | `test/integration/content.test.ts` | CONTENT-TEST | no |
| 6 | `R2-02.T2b` | `test/playtest/{rules,recovery,four-way-bot}.ts` and their tests, `zone-{d,i}.test.ts` | BOT | no |
| 7 | `R2-02.T3` | `test/golden/v2-port*.ts` (new); `test/port-v2/handfix.patch` | KIT | no |
| 8 (side) | carry-over `R3-03.V3` / whatever of `R3-04.M3a` … `M3e` is left (blocks in [wave 2](wave-02.md)); else filler `R3-03.V2a` (block in [wave 4](wave-04.md)) | — | as their blocks | M3d, M3e |
| last | `R2-02.E0` (after every T on master) | the failing `test/e2e/*.spec.ts` only | — | **yes** |

- **Slots:** 8 builders. `R2-02.E0` takes the first slot that frees after every T is on master.
- **Reviews:** slot 1 = each T as it lands, then E0; slot 2 = the side lanes, each round `<id>.RV<n>` with its
  block's must-hold (`R3-03.V3.RV`, `R3-04.M3.RV` in [wave 2](wave-02.md); `W04.RV-SIDE` in [wave 4](wave-04.md) for
  V2a), and a second T reviewer when slot 1 queues.
- **Docs item:** none (wave 5).
- **e2e:** E0 and lane 8 (M3d / M3e) at most.

## Rules for this wave

- **All of wave 2's rules hold** (neutral at K = 1, the kit proof, the world-value rule, zero allocation).
- **Test pins are written through the mapping helper** `packages/core/test/helpers/v1-port.ts` (`K`, `PAD`, `v1x`,
  `v1y`, `v1rel`, `v1speed`, `v1screenX`, `v1screenY`, `mapEnemyRow`, `mapBossRow`; integration tests import it by
  relative path, `../../packages/core/test/helpers/v1-port.js`). **Never paste the failing run's output as the new
  expectation**: derive it from the v1 value and its unit. A camera assertion `Math.floor(camera.x) toBe(x)` becomes
  "within one tick of scroll" (`|camera.x − x| ≤ speed`). A still ship parked for a test sits on the enemies' line
  `v1y(100)` (W5-2: `SPAWN_Y` itself stays the frame centre).
- **Fixtures that pair with a shipped tileset** take **that tileset's** `tileSize` **and** `rowsTall = PLAYFIELD_H /
  tileSize` together (precheck item 7: 42 core test files pair a `tileSize: 8` fixture tilemap with a shipped
  tileset, mostly `terrain-a`; 18 of them also hard-code `ROWS = PLAYFIELD_H / 8`). After the port that tileset is
  12 px and the loader rejects an 8-px map with "must equal the tileset's tileSize (12)". Floors measured in 8-px
  rows (a "32-px floor") may need re-deriving at 12.
- **Your list:** start from `RUN_DIR/w02/rv-a2/<your id>.txt` (RV-A2's failures under the kit for your files); add
  what you find. A failure in someone else's file goes to your report by that subtask's id.
  **`RUN_DIR/w02/rv-a2/other.txt`** (failures that fit no T, each with an owner RV-A2 suggests) is the
  orchestrator's: before the wave's builders start, it gives each line to the subtask RV-A2 suggests, adding the
  file to that subtask's Files **and** to both lines of its Tests in its prompt. A line in
  `test/integration/release-audit.test.ts` goes to `R2-02.T2a`: that file is under T2a's token CONTENT-TEST (README
  § "Tokens and locks"), and it runs whole (`-t 'zone X'` selects no test there). A line that no T of this wave can
  take (a shell or render-pixi test, or any line whose suggested owner is not a T of this wave) goes to a fix
  agent `R2-02.prepB.FIX<n>` (the next free number), in a builder slot, with the same kit proof and review as a T.
  No line is left for `R2-02.RV-pre` (wave 4).
- **The gates stay.** `describePortPending` / `itPortPending` / `skipIf(CONTENT_PORT_PENDING)` remain in place: under
  the kit the stub turns them off, so the gated tests must pass there; the wrappers are deleted after the port
  (`R2-02.U1` … `U5`, wave 5). `test/golden/stale.ts` and `test/e2e/gates.ts` are not yours.
- **`test/integration/content.test.ts` is T2a's only** in this wave; everyone else reads it.
- **Same-file order:** `test/integration/stage-terrain.test.ts` is T2e's in this wave (R3-03.V4b only *copies* its
  checks, in wave 4). `test/e2e/atlas-residency.spec.ts` (which `R3-04.M3d` extends) and
  `test/e2e/atlas-context-loss.spec.ts` (which `R3-04.M3d` creates) belong to lane 8: **E0 never edits them**. A test
  of either that fails under the kit goes into E0's report by name; the orchestrator hands it to
  `R3-04.M3d` if M3d has not pushed yet, otherwise to a small fix agent (the spec is free once M3d is on master).
  Nothing in this wave waits for a later wave.
- **Pushes:** every builder and fixer of this wave pushes its own task to `master` (Common rule 5), after its kit
  proof; review agents never push. This wave has no zone lane (local branch) and no patch-only subtask.

## Subtasks

### R2-02.T1a — Core behaviour tests at both scales

- **Wave / lane / order:** wave 3, lane 1, first.
- **Depends on:** wave 2's exit (W6, W7, T0 on master).
- **Goal:** the failing tests of `packages/core/test/behaviors/` (expect about 14 of 36 files) pass under the kit and
  stay green at K = 1.
- **Files (only these):** the failing files of `packages/core/test/behaviors/**` (RV-A2's list `T1a`). Known groups:
  fixtures paired with a shipped tileset (`behaviors-edge`, `-fire`, `-fire-edge`, `-gimmicks`, `-gimmicks-edge`,
  `-zones-edge`); shipped-value pins (`behaviors-zones*`, about 20 pins, each ×1.5 of a v1 number); the allocation
  guards' **setup** assertions (`behaviors-rocket-worm-alloc` "8 to be 12": read it through `K` or the tileset).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors
  ```
- **Acceptance:** green at both scales; no guard budget changed; the gated cases of the folder green under the kit
  (the gates stay).
- **Token:** none (test files only; `behaviors/index.ts` is not touched).
- **Traps:** a guard's measured loop and budget are never edited — only its setup assertion; a fixture's tile size
  comes from the tileset it uses, never `TILE_SIZE` blindly.

### R2-02.T2c — Zone runtime tests

- **Wave / lane / order:** wave 3, lane 1, after `R2-02.T1a`.
- **Depends on:** wave 2's exit.
- **Files (only these):** `test/integration/zones-bc-runtime.test.ts` (`:76` `Math.floor(zone.camera.x)).toBe(4600)`),
  `zones-bc-direct.test.ts`, `zones-de-runtime.test.ts` (`:98`), `zones-de-runtime-edge.test.ts` (`:155`),
  `zones-de-direct.test.ts`, `zones-fg-runtime.test.ts`, `zones-fg-runtime-edge.test.ts` (`:211`),
  `zones-fg-direct.test.ts`, `zones-hi-runtime-edge.test.ts` (`:146`).
- **What changes:** camera pins → "within one tick of scroll"; checkpoint x's through `v1x`; a parked ship on
  `v1y(100)`.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/zones-bc-runtime.test.ts test/integration/zones-bc-direct.test.ts test/integration/zones-de-runtime.test.ts test/integration/zones-de-runtime-edge.test.ts test/integration/zones-de-direct.test.ts test/integration/zones-fg-runtime.test.ts test/integration/zones-fg-runtime-edge.test.ts test/integration/zones-fg-direct.test.ts test/integration/zones-hi-runtime-edge.test.ts
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/zones-bc-runtime.test.ts test/integration/zones-bc-direct.test.ts test/integration/zones-de-runtime.test.ts test/integration/zones-de-runtime-edge.test.ts test/integration/zones-de-direct.test.ts test/integration/zones-fg-runtime.test.ts test/integration/zones-fg-runtime-edge.test.ts test/integration/zones-fg-direct.test.ts test/integration/zones-hi-runtime-edge.test.ts
  ```
- **Acceptance:** green at both scales.
- **Token:** none.
- **Traps:** a camera at 1.125 px/tick after one tick floors to 6901, not 6900: compare within one tick's travel.

### R2-02.T1b — Enemy and boss tests at both scales

- **Wave / lane / order:** wave 3, lane 2, first.
- **Depends on:** wave 2's exit.
- **Files (only these):** the failing files of `packages/core/test/enemies/**` and `packages/core/test/bosses/**`
  (about 8; RV-A2's list `T1b`): `enemies-edge.test.ts` (about 29 pins; `:329`
  `expect(DEFAULT_SPAWN_SCREEN_X).toBe(PLAYFIELD_W + 16)` → `PLAYFIELD_W + 16 * K`), `enemies.test.ts` (about 16),
  `enemies-hunter-alloc.test.ts` (its setup assertion "1 > 20").
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/enemies packages/core/test/bosses
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/enemies packages/core/test/bosses
  ```
- **Acceptance:** green at both scales; guard budgets untouched.
- **Token:** none.
- **Traps:** a spawn y of a test enemy at `PLAYFIELD_H / 2` stays frame-centred (it is `SPAWN_Y`'s rule, not a world
  value).

### R2-02.T2d — Runtime tests I

- **Wave / lane / order:** wave 3, lane 2, after `R2-02.T1b`.
- **Depends on:** wave 2's exit; `R2-02.T1b` finished (lane order).
- **Files (only these):** `test/integration/death-runtime.test.ts`, `world-flight.test.ts`, `stage-runtime.test.ts`,
  `enemies-runtime.test.ts`, `bullets-runtime.test.ts`, `weapons-runtime.test.ts`, `arsenal-runtime.test.ts`,
  `direct-runtime.test.ts`.
- **What changes:** the background's examples: camera x/y (`expected 6900 to be 4600`), KESTREL speeds, `x ≥ 8000`,
  `e.y < camera.y + 170`, `ship.y − camera.y > 8`; a stationary autofiring KESTREL on test-range kills nothing at the
  frame-centre row (`enemies-runtime` "0 > 0") — park it on `v1y(100)`, the enemies' line (W5-2).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/death-runtime.test.ts test/integration/world-flight.test.ts test/integration/stage-runtime.test.ts test/integration/enemies-runtime.test.ts test/integration/bullets-runtime.test.ts test/integration/weapons-runtime.test.ts test/integration/arsenal-runtime.test.ts test/integration/direct-runtime.test.ts
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/death-runtime.test.ts test/integration/world-flight.test.ts test/integration/stage-runtime.test.ts test/integration/enemies-runtime.test.ts test/integration/bullets-runtime.test.ts test/integration/weapons-runtime.test.ts test/integration/arsenal-runtime.test.ts test/integration/direct-runtime.test.ts
  ```
- **Acceptance:** green at both scales.
- **Token:** none.

### R2-02.T1c — Bullet, weapon, shield and pattern tests at both scales

- **Wave / lane / order:** wave 3, lane 3, first.
- **Depends on:** wave 2's exit.
- **Files (only these):** the failing files of `packages/core/test/{bullets,weapons,shields,patterns}/**` (about 15;
  RV-A2's list `T1c`): fixtures paired with `terrain-a` (bullets ×4, weapons ×7, `patterns`, `shields-alloc`,
  `shields-arm`), pattern pins (`vx −1.47 vs −0.98` = ×1.5), the guards' setup assertions (`shields-alloc`,
  `bullets-alloc`).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/bullets packages/core/test/weapons packages/core/test/shields packages/core/test/patterns
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/bullets packages/core/test/weapons packages/core/test/shields packages/core/test/patterns
  ```
- **Acceptance:** green at both scales; guard budgets untouched.
- **Token:** none.

### R2-02.T2e — Runtime tests II

- **Wave / lane / order:** wave 3, lane 3, after `R2-02.T1c`.
- **Depends on:** wave 2's exit; `R2-02.T1c` finished (lane order).
- **Files (only these; only the failing ones):** `test/integration/patterns-runtime.test.ts` (the aimed spiral starts
  at another angle at the frame-centre row: park on `v1y(100)`), `release-content-edge.test.ts`,
  `raster-range-runtime.test.ts`, `dimension-runtime.test.ts`, `bonus-stage-runtime.test.ts`, `campaign-flow.test.ts`,
  `extra-edit-runtime.test.ts`, `boss-runtime.test.ts`, `advanced-bosses-runtime.test.ts`,
  `options-shields-runtime.test.ts`, `powerups-runtime.test.ts`, `loops-runtime.test.ts`, `stage-terrain.test.ts`.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/patterns-runtime.test.ts test/integration/release-content-edge.test.ts test/integration/raster-range-runtime.test.ts test/integration/dimension-runtime.test.ts test/integration/bonus-stage-runtime.test.ts test/integration/campaign-flow.test.ts test/integration/extra-edit-runtime.test.ts test/integration/boss-runtime.test.ts test/integration/advanced-bosses-runtime.test.ts test/integration/options-shields-runtime.test.ts test/integration/powerups-runtime.test.ts test/integration/loops-runtime.test.ts test/integration/stage-terrain.test.ts
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/patterns-runtime.test.ts test/integration/release-content-edge.test.ts test/integration/raster-range-runtime.test.ts test/integration/dimension-runtime.test.ts test/integration/bonus-stage-runtime.test.ts test/integration/campaign-flow.test.ts test/integration/extra-edit-runtime.test.ts test/integration/boss-runtime.test.ts test/integration/advanced-bosses-runtime.test.ts test/integration/options-shields-runtime.test.ts test/integration/powerups-runtime.test.ts test/integration/loops-runtime.test.ts test/integration/stage-terrain.test.ts
  ```
- **Acceptance:** green at both scales.
- **Token:** none (`stage-terrain.test.ts` is yours in this wave).
- **Traps:** `stage-terrain.test.ts`' `itPortPending` cases (`:131`, `:205`; the import at `:30`) stay gated on
  master. R3-03.V4b (wave 4) copies two checks of that file into a helper: `expectMasksMatchArt` (`:71`, used by the
  test at `:131`) and the heightfield check, the test "a 12-px fixture: the heightfield finds a tile for every cell
  it shapes" (`:158`) — keep their bodies' structure (V4b finds them by name if your edits move the lines).

### R2-02.T1d — Powerup, world, debug, replay, black hole, player and option tests

- **Wave / lane / order:** wave 3, lane 4, first.
- **Depends on:** wave 2's exit.
- **Files (only these):** the failing files of `packages/core/test/{powerups,world,debug,replay,blackhole,player,options}/**`
  and `packages/core/test/scenes/scenes-options-edge.test.ts` (about 16; RV-A2's list `T1d`): `powerups` ×4 and
  `debug-controls{,-edge}` (fixture tiles), `world-death` ×4 / `world-gimmicks` ×3 / `world-stage` (fixture tiles,
  `ROWS = PLAYFIELD_H / 8`), `replay{,-demo}`, the guards' setup assertions (`powerups-alloc*`, `world-death*-alloc`).
  A shipped-value example: the MANTA's speeds `[1.75, 2.25, 2.75]` (`powerups/powerups-direct.test.ts:276`) become
  `[2.625, 3.375, 4.125]`, written through `v1speed`.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/powerups packages/core/test/world packages/core/test/debug packages/core/test/replay packages/core/test/blackhole packages/core/test/player packages/core/test/options packages/core/test/scenes/scenes-options-edge.test.ts
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/powerups packages/core/test/world packages/core/test/debug packages/core/test/replay packages/core/test/blackhole packages/core/test/player packages/core/test/options packages/core/test/scenes/scenes-options-edge.test.ts
  ```
- **Acceptance:** green at both scales.
- **Token:** none.
- **Traps:** `packages/core/test/replay/replay-version-shipped.test.ts` refuses the shipped v1 recordings by design —
  leave it; the world guards run in their own files and must not follow a long recording session in the same worker.

### R2-02.T1e — Data, stage, collision and config tests

- **Wave / lane / order:** wave 3, lane 4, after `R2-02.T1d`.
- **Depends on:** wave 2's exit; `R2-02.T1d` finished (lane order).
- **Files (only these):** the failing files of `packages/core/test/{data,stage,collision,config}/**` and
  `packages/core/test/data/frame-bounds.test.ts` (`:110`, "664 vs 656": `PLAYFIELD_W + 16 * K`); known groups:
  `tilemap{,-edge}` (13), `stage-bonus{,-edge}` (8), `collision/terrain{,-edge}` (6), `data-direct{,-edge}` (the
  MANTA's speeds `[1.75, 2.25, 2.75]` at `data-direct.test.ts:205` become `[2.625, 3.375, 4.125]`, through
  `v1speed`).
  **Not** A1's files (`packages/core/test/config/world-scale.test.ts`) and not `frame-constants.test.ts`.
  `packages/core/test/data/units-pairs.test.ts` already uses v1 geometry (`fromWidth: 384`, `:43`): only check it.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/data packages/core/test/stage packages/core/test/collision packages/core/test/config
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/data packages/core/test/stage packages/core/test/collision packages/core/test/config
  ```
- **Acceptance:** green at both scales.
- **Token:** none.
- **Traps:** fixtures with their own tileset (`data-edge`, `schema-meta`, `stage*`, `world-stage-edge`, collision
  `mixed`, `units-pairs`, `patterns-ballistic*`) are safe: do not change them for nothing.

### R2-02.T2a — `content.test.ts` at both scales

- **Wave / lane / order:** wave 3, lane 5.
- **Depends on:** wave 2's exit; the **kit run** of its acceptance waits for `R2-02.T2b` on master (the 4-way limits
  come from `test/playtest/rules.ts` and `recovery.ts`).
- **Goal:** the content contract reads its limits from the rules and passes on the ported content.
- **Files (only these):** `test/integration/content.test.ts` (2,315 lines; exact edits only).
- **What changes (lines at `bc8e05d`):**
  - the recovery window literal `900` at `:1046`, `:1785`, `:2170` → `RECOVERY_WINDOW` imported from
    `../playtest/recovery.js` (the docblock at `:24` says 900: leave docblocks to the docs pass);
    `MAX_AIMED_BULLET_SPEED` / `MIN_LANE_GAP` are already imported from `rules.js` (`:113`);
  - the zone A pins (`:953-960` length 8,500–9,500, checkpoints `[0, 3500, 6000]`, the 1.5 px/tick key at 6,000;
    `:1089-1134` section ranges) through `v1x` / `v1speed`;
  - A5 fix 1's world and tile values (left for R2-02 on purpose): the MAGMA DEEP ship gap `>= 24` (`:1490`,
    `gap * map.tileSize`) → `24 * K` (36); the CELL VAULT gap `>= 48` (`:1614`) → `48 * K` (72); the ground probe
    rows `[PLAYFIELD_H - 1, PLAYFIELD_H - 8]` and `[0, 7]` (`:1811`, `:2190`) → the content tile's last / first row
    (`PLAYFIELD_H - tileSize` and `[0, tileSize - 1]`); the sample step `y += 8` (`:2114`) → `y += tileSize` (the
    `x += 8` of the loop above it, `:2113`, stays);
  - the PRISM LABYRINTH case (`:1651-1662`, middle row `floor(PLAYFIELD_H / 2 / map.tileSize)` = 14 ported) stays: the
    content fix (zone G's walls one row up) is in `test/port-v2/handfix.patch`.
  - its 13 gated cases (`itPortPending` at `:626`, `:1121`, `:1450`, `:1650`, `:1995`;
    `it.skipIf(CONTENT_PORT_PENDING).each(zones)` at `:1791` — 6 zones — and `:2176` — 2 zones): green under the kit;
    the gates stay.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content.test.ts
  bash test/port-v2/two-scale.sh -- pnpm content:check
  ```
- **Acceptance:** green at K = 1; under the kit `content:check` green with the 4-way rules at 3.0 / 24 / 1,350.
- **Token:** CONTENT-TEST.
- **Traps:** `TILE_SIZE` is already 12 on master while the content is 8: read the content's own tile size, never
  `TILE_SIZE`, in a check that must hold at both scales.

### R2-02.T2b — The bot and the 4-way rules at both scales

- **Wave / lane / order:** wave 3, lane 6.
- **Depends on:** wave 2's exit (`R2-02.W3`: `ENTER_END_X` ×K).
- **Files (only these):**
  - `test/playtest/rules.ts` — `MAX_AIMED_BULLET_SPEED = 2.0` (`:25`) → `2.0 * WORLD_SCALE`, `MIN_LANE_GAP = 16`
    (`:28`) → `16 * WORLD_SCALE`, `COLUMN_HALF_WIDTH = 8` (`:31`) → `8 * WORLD_SCALE`;
  - `test/playtest/recovery.ts` — `RECOVERY_WINDOW = 900` (`:21`) → `900 * WORLD_SCALE`;
  - `test/playtest/four-way-bot.ts` — `BOT_X = 64` (`:56`) → `ENTER_END_X` (imported from `@shmup/core`), `LANE_HEIGHT
    = 16` (`:59`) → `16 * WORLD_SCALE`, `TERRAIN_AHEAD = 56` (`:68`) → `56 * WORLD_SCALE`, and the inline literals:
    `:233` `e.hw + 8`, `:243` `part.hw + 24`, `:256` `x0 - 8` / `x1 + 8`, `:286` `dx <= 16`, `:287` `dx <= 8`, `:401`
    `?? 1.5`, `:450` `dx < 24 || dx > 280` — all × `WORLD_SCALE`;
  - `test/playtest/rules.test.ts`, `rules-column-edge.test.ts`, `four-way-bot.test.ts` (from the constants; add a pin
    `BOT_X === ENTER_END_X`), `harness.test.ts`;
  - `test/playtest/zone-d.test.ts` (`:41` `expect(deepest).toBe(200)` → `v1rel(200)` = 300, O2), `zone-i.test.ts`
    (`:42` the eels `e.y < world.camera.y + 170` → `v1y(170)`), and any other `test/playtest/*.test.ts` (or BOT
    file `harness.ts`, `campaign.ts`, `campaign-routes.ts`) that fails under the kit.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest
  ```
  (slow: 3–6 minutes of simulation per zone; start it in the background and poll.)
- **Acceptance:** the bot clears every zone, bonus stage and the boss rush in god mode under the kit; green at K = 1.
  **Zone F is a known real item** (the background §0.3: in god mode `broken` or `lunges` is 0, the non-god run still
  `playing` after 600 s): if it is still red under the kit, report it for `R2-02.Z-FG` (wave 5), do not hide it.
- **Token:** BOT (`test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts`).
- **Traps:** `LANES = Math.floor(PLAYFIELD_H / LANE_HEIGHT)` follows by itself (14 lanes under the kit); the bot's
  kills drift from the v1 baseline if an inline literal is missed — scale them all; `remote-strict.ts` counts ticks:
  unchanged.

### R2-02.T3 — The v2-port comparison (R2-02's acceptance test)

- **Wave / lane / order:** wave 3, lane 7.
- **Depends on:** `R2-02.T0` on master; the **kit run** of its acceptance waits for `R2-02.T2b` on master (the
  README's comparison is made with the bot's constants scaled: `recordBaseline` plays `fourWayBot()`). Until then,
  list a bot-dependent mismatch in your report by `R2-02.T2b`'s id, never as an exemption.
- **Goal:** the test the plan's R2-02 acceptance names: a v2 run of every baseline scenario, compared field by field
  with the frozen v1 baseline (`test/fixtures/v1-baseline/*.baseline.json`, 37 scenarios).
- **Files (only these; "new" = create):** `test/golden/v2-port.ts` (new), `test/golden/v2-port-suite.ts` (new),
  `test/golden/v2-port.test.ts` (new), `test/golden/v2-port-zones.test.ts` (new), `test/golden/v2-port-loop2.test.ts`
  (new) — split by `BASELINE_GROUPS` (`test/golden/v1-baseline.ts:255`) like `v1-baseline*`;
  `test/port-v2/handfix.patch` (your findings); and `test/port-v2/two-scale.sh` only for a kit bug the orchestrator
  hands you while you hold KIT.
- **What the test does:** `recordBaseline(scenario)` (`test/golden/v1-baseline.ts`) **in memory** (never into the
  fixtures) with `startX` ×K (`hunter-range-dive`: `HUNTER_DIVE_START_X` 1440 → 2160), then compares with the v1 file
  by `test/fixtures/v1-baseline/README.md` § "Comparing a v2 run" (`:83-122`) through `mapEnemyRow` / `mapBossRow`:
  camera, event and checkpoint ticks and `warnings` within ±2 %; each non-ground spawn's `visibleTick` within ±1
  (ground spawns exempt, O11); a `T`-entry's `turnY = K·y + PAD` within 2 px; events paired through the tool's nine
  re-sort maps (gimmick-range 9↔10, zone-c 8↔9, zone-d 42↔43, zone-g 14↔15, zone-h 15↔16, 19↔20, 28↔29, 32↔33,
  62↔63). Exemptions written in the test with their reasons (player-dependent specs loose; children by their parent's
  mapping; bot-dependent fields loose). `describe.skipIf(WORLD_SCALE === 1)`.
- **Tests:**
  ```bash
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden/v2-port.test.ts test/golden/v2-port-zones.test.ts test/golden/v2-port-loop2.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden/v2-port.test.ts test/golden/v2-port-zones.test.ts test/golden/v2-port-loop2.test.ts
  ```
- **Acceptance:** green under the kit **after** your content findings are in `handfix.patch` (the tool's 7 "on or
  above the top edge" items among them); skipped (not failing) at K = 1.
- **Token:** KIT (`test/port-v2/**`): only T3 edits `handfix.patch` in this wave, and while T3 runs it also makes any
  kit fix the orchestrator hands it (no second KIT holder; after T3's push a small fix agent may take KIT). Every
  patch change is content-only and re-applies to a fresh tool output (`two-scale.sh` must still pass for everyone).
- **Traps:** never `SHMUP_V1_BASELINE_UPDATE` (the v1 baseline is frozen for good); the v1 files are read, never
  written; above the top edge (y < 0) the mapping is `K·y` only, and the landing (`turnY`) is what must match.

### R2-02.E0 — The e2e pre-gate (last of the wave)

- **Wave / lane / order:** wave 3, the first slot that frees after **every** T subtask is on master.
- **Depends on:** `R2-02.T1a` … `T1e`, `T2a` … `T2e`, `T3` on master. Nothing of a later wave
  (`atlas-residency.spec.ts` and `atlas-context-loss.spec.ts` are not yours — rule "Same-file order").
- **Goal:** after the port the content-bound specs that have not been re-measured must skip, not fail: gate every
  spec that fails under the kit on `PORT_UNMEASURED` (decision R2-N3). The gate is neutral on master today
  (`PORT_UNMEASURED` = stale recordings ∧ content ported = false), true from the port until R2-03 re-records.
- **Files (only these):** the failing `test/e2e/*.spec.ts` only — never `test/e2e/gates.ts`, never
  `test/e2e/atlas-residency.spec.ts` or `test/e2e/atlas-context-loss.spec.ts` (lane 8's: report a failure there by
  test title).
- **What is gated today** (lines at `543887b` — the C5 fixes keep moving them, so list today's yourself with
  `git grep -n "test.skip(\|assertionsGated(" test/e2e/`; do not touch these): `PORT_UNMEASURED` + `PORT_REASON` at
  zone-a `:109`, stage `:114`, mode7 `:485` `:779`, raster `:224` `:258` ("runs the heat haze only inside its camera
  range"), campaign-run `:292` ("?stage=bonus-range: the digit entrance flies the ship into the vault, …"), zones-bc
  `:237` `:266` `:286` `:303`, zones-de `:318` `:356`, zones-fg `:315` `:354` `:388`, zones-hi `:414` `:444` `:510`
  `:532`, advanced-bosses `:259` `:363` `:389`, debug-tools `:203` (assertion level, inside "web build: F4 freezes,
  F5 steps one tick, F7 / F8 jump the stage, F3 / F6 cycle"); `R2_03_PENDING` + `CONTENT_REASON` at zones-de `:278`,
  zones-hi `:471`, gimmicks `:77` `:103`, boss `:136` (the hull, assertion level), render-groups `:220` (the HUD,
  assertion level); `GOLDEN_REASON` at attract `:184` `:305`, atlas-residency `:409`, determinism `:119`; the inverse
  tests attract `:238` `:281`.
- **The likely new ones** (C5's "content-backed but not gated" list, expected to hold but to be checked; lines at
  `543887b`): bullets, bullet-palette ×2, enemies, weapons ×3, direct-items, option-hunter, raster `:183` ("compiles
  and links in a WebGL1 context"), `:285` ("stretch fills a display the integer mode letterboxes") and `:306`
  ("draws the hitbox markers only while the option is on"), stage `:147` ("warns about an unknown ?stage= and flies
  in open space without terrain"), coop-gamepad.
- **Steps:**
  1. `bash test/port-v2/two-scale.sh --keep -- true` → a kept kit tree; `<kit>` below is the path that command prints
     as its last output line. In it, run the five standard batches A–E (README) — and batch G too, if it exists (it
     holds `atlas-context-loss.spec.ts` once `R3-04.M3d` has pushed) — one after another with **its own** helper:
     `bash <kit>/docs/v2-run/helpers/e2e-batch.sh <the batch's specs>` (background + poll; each takes the lock).
  2. For every failing test add `test.skip(PORT_UNMEASURED, PORT_REASON)` at the test's start, or, for one assertion,
     `if (!assertionsGated(test.info(), PORT_UNMEASURED, '<what>', PORT_REASON)) { … }`, importing both from
     `./gates.js`; commit locally; then re-create the kit tree so it holds your commit: `git worktree remove --force
     <kit>`, then step 1's `two-scale.sh --keep` again (the new tree is made at your `HEAD`).
  3. Re-run the batches under the kit until zero failures; then run every spec you edited in your own tree (master +
     your commit; Tests' second line) — no change expected.
- **Tests:**
  ```bash
  bash <kit>/docs/v2-run/helpers/e2e-batch.sh <batch A specs>   # … B, C, D, E, and G if it exists
  bash docs/v2-run/helpers/e2e-batch.sh <every spec you edited>    # on your own tree (master + your commit)
  ```
- **Acceptance:** zero e2e failures under the kit outside `atlas-residency.spec.ts` and `atlas-context-loss.spec.ts`
  (a failure there is listed in your report by test title, for `R3-04.M3d` or its fix agent); master e2e unchanged
  (the edited specs pass, nothing skips that ran before).
- **Token:** none. **e2e:** one of the wave's two e2e agents.
- **Traps:** never edit `gates.ts` or its pin `test/integration/e2e-gates.test.ts`; never gate a spec that also fails
  on master (that is a bug: report it); e2e steps exact ticks (`frame-advance.ts`), samples through `frame-pixels.ts`;
  a batch takes 5–15 minutes — background + poll.

## Reviews

### R2-02.prepB.RV — Review of each T subtask and of E0

- **Wave / order:** review slot 1 (and slot 2 when slot 1 queues), as each lands; fix → a **new** review → zero.
- **Must hold:** test files only (no `src/`, no `content/`, no fingerprint file); pins written through `v1-port`
  from v1 values and their units, not pasted outputs (spot-check 10 per subtask); the gates still in place; the
  subtask's tests green at K = 1 **and** under the kit (the reviewer re-runs them); for E0, each new skip names
  `PORT_UNMEASURED` / `PORT_REASON` and the spec still runs on master; for T3, the exemptions each carry a reason and
  `handfix.patch` is content-only.

## Exit check

1. T1a–T1e, T2a–T2e, T3 and E0 on master; their reviews at zero findings.
2. Neutral: `git diff $(cat /home/sites/shmup-cup-run/w03-base.txt)..origin/master -- content test/golden/*.replay.json content/demos
   test/fixtures/v1-baseline` empty; the three fingerprints green and unedited:
   `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts
   test/integration/content-db-fingerprint.test.ts` and `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell
   packages/shell/test/frame-fingerprint.test.ts` green, and this is empty:
   ```bash
   git diff $(cat /home/sites/shmup-cup-run/w03-base.txt)..origin/master -- test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts packages/shell/test/frame-fingerprint.test.ts
   ```
3. Under the kit: one kept tree, then each command with `--reuse` (`<kit>` is the last line the first command prints;
   put that path in its place):
   ```bash
   bash test/port-v2/two-scale.sh --keep -- true
   bash test/port-v2/two-scale.sh --reuse <kit> -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors packages/core/test/enemies packages/core/test/bosses packages/core/test/bullets packages/core/test/weapons packages/core/test/data
   bash test/port-v2/two-scale.sh --reuse <kit> -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content.test.ts test/golden/v2-port.test.ts test/golden/v2-port-zones.test.ts test/golden/v2-port-loop2.test.ts
   git worktree remove --force <kit>
   ```
   green (the full barrier run is `R2-02.RV-pre` in wave 4).
4. E0's report: zero failures under the kit in batches A–E (and G), except `atlas-residency.spec.ts` and
   `atlas-context-loss.spec.ts` tests handed over by title (to `R3-04.M3d` or its fix agent).
5. Deferred to wave 15: nothing new.

## Owner (Manual) — never blocks this wave

- None.
