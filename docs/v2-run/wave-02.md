# Wave 2 — R2-02 prep A (world constants and defaults) ∥ R3-03 / R3-04 side lanes

> Schedule: `plan_resolution.md` §18 · how to use: [`README.md`](README.md) · decisions: [`decisions.md`](decisions.md)
> · background: [`wave5-scout.md`](wave5-scout.md) §0 and §1 (the experiment and the approach)
>
> **Run directory:** `RUN_DIR` is `/home/sites/shmup-cup-run` (README common rule 15). The commands below spell the
> path out, so each one runs as typed in a fresh shell; prose that says `RUN_DIR/…` means the same path.
>
> **Wave base:** when this wave's first agent starts, the orchestrator records the wave's base (the
> `origin/master` SHA at that moment) once, in the main checkout, and notes it in `RUN_DIR/lanes-<wave>.md` too
> (README step 5):
> `git fetch origin && git rev-parse origin/master > /home/sites/shmup-cup-run/w02-base.txt`.
> Every command below that diffs against the wave base reads that file, `$(cat /home/sites/shmup-cup-run/w02-base.txt)`;
> an agent's prompt may carry the SHA itself instead, never a placeholder.

**Steps:** R2-02 (prep A: W1–W7, T0, A1, T4a–c, RV-A2) · R3-03 (V1, V3) · R3-04 (M3a–M3e) · **Gate to start:**
wave 1's exit (`R2-02.P0` and `R2-02.P1` on master) · **Exit (summary):** every prep-A subtask on master, reviewed to
zero and **neutral at K = 1**; RV-A2's failure lists written; `R3-03.V1` on master and reviewed (V3 and M3* may carry
over).

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| 1 | `R2-02.W6` → `R2-02.W7` | `packages/core/src/behaviors/index.ts` | BEHAVIOR | no |
| 2 | `R2-02.T0` → `R2-02.A1` → `R2-02.T4b` | `packages/core/test/helpers/v1-port.ts` (new), the audit tests (new), `test/scripts/content/**` | — | no |
| 3 | `R2-02.W2` | `packages/core/src/weapons/index.ts` | — | no |
| 4 | `R2-02.W1` → `R2-02.T4c` | `packages/core/src/bullets/index.ts`, `patterns/{index,dsl}.ts`; `test/scripts/assets/procedural-zones*.test.ts` | — | no |
| 5 | `R2-02.W3` → `R2-02.W5` | `packages/core/src/{player,options,shields,powerups,blackhole}/index.ts`; `packages/core/src/data/index.ts` | DATA-INDEX (W5) | no |
| 6 | `R2-02.W4` → `R2-02.T4a` | `packages/core/src/{enemies,bosses,world,collision,debug}/index.ts`, `stage/systems.ts`; `packages/render-pixi/src/particles/index.ts` | — | no |
| 7 (side) | `R3-03.V1` → `R3-03.V3` | `scripts/assets/procedural/{bullets,palettes,lasers}.mjs`; `test/integration/palette-cycle-scan.test.ts` (new) | — | **yes** (V1) |
| 8 (side) | `R3-04.M3a` → `M3b` → `M3c` → `M3d` → `M3e` (carries over into waves 3–4) | `packages/render-pixi/src/atlas/index.ts`, `packages/shell/src/{memory,loader,boot,frame-loop}/index.ts` | RP-BARREL, SHELL-BARREL | **yes** (M3d, M3e) |

- **Slots:** 8 builders (lanes 1–8 start at once; lane 2 needs nothing but P0).
- **Reviews:** slot 1 = each R2-02 prep subtask as it lands, then `R2-02.RV-A2`; slot 2 = `R3-03.V1.RV`,
  `R3-03.V3.RV`, the `R3-04.M3*` reviews.
- **Docs item:** none in this wave (R2-02, R3-03 and R3-04 docs are wave 5's `W05.DOCS-*`). Builders list docs needs.
- **e2e:** at most two agents: lane 7 (V1's batch) and lane 8 (M3d / M3e).

## Rules for this wave

- **Neutral at K = 1.** Every R2-02 prep commit keeps `WORLD_SCALE` = 1 and `WORLD_TOP_PAD` = 0, changes no
  `content/` file, and leaves the three fingerprints (`test/integration/presentation-fingerprint.test.ts`,
  `test/integration/content-db-fingerprint.test.ts`, `packages/shell/test/frame-fingerprint.test.ts`) green
  **unedited**. "Fixing" a fingerprint in prep is a bug.
- **Every R2-02 prep subtask also proves itself under the kit**: commit locally, then
  `bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run …` with the same targeted tests.
  A failure under the kit that belongs to another subtask that has not landed yet is listed in your report by that
  subtask's id, never fixed outside your files.
- **The R2-02 acceptance every prep subtask adds to its own:**
  1. green on master: its tests, `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core
     packages/core/test/frame-literals.test.ts`, and the three fingerprints unedited;
  2. its targeted tests green under the kit (or the red ones named by owner id);
  3. typecheck: `pnpm --filter @shmup/core typecheck` (and `pnpm typecheck:root` for tests outside `packages/`);
  4. `pnpm exec eslint <files> && pnpm exec prettier --check <files>`.
- **The world-value rule** (W5-1): a world length, speed, radius or acceleration becomes `v1 * WORLD_SCALE` — plain
  multiplication, never `**` or `Math.pow`; an absolute world y becomes `v1 * WORLD_SCALE + WORLD_TOP_PAD`, but a y
  above the top edge (y < 0) becomes `v1 * WORLD_SCALE` only; a frame anchor plus a world margin is
  `PLAYFIELD_W + 16 * WORLD_SCALE` (never `PLAYFIELD_W * WORLD_SCALE`, never `(PLAYFIELD_W + 16) * …`); ticks,
  angles (`ANGLE_UNITS` 1024; `FREE_POD_SPREAD` 96 and `FRONT_POD_ANGLE` 64 are angles), counts, scores and ratios
  never scale. The values to change come from plan Appendix B (§16 — it now holds every world-unit default
  that the post-flip pre-check found missing from it) and
  `docs/v2-run/helpers/w5/literals.txt` (every numeric literal of the sim modules, with its line); the unit of a
  behaviour tunable comes from `packages/core/src/behaviors/units.ts` `BEHAVIOR_PARAM_UNITS`, never from its name.
- **`SPAWN_Y` stays `PLAYFIELD_H / 2`** (W5-2) and `DEFAULT_BOSS_Y` stays `PLAYFIELD_CY`: frame-centred.
- **Zero allocation.** Fractional constants (10.5, 7.5, 0.375, 0.1875, 4.5) are fine in the sim, but a fraction passed
  through a call V8 does not inline is boxed. Run your modules' allocation guards at K = 1 **and** under the kit;
  never raise a budget; never move a measured loop into a helper.
- **Side lanes (7, 8) are independent of R2-02** and touch none of its files. They never edit the bullet e2e specs
  (`bullet-palette`, `bullets`, `weapons`, `boss`) except V1's measured re-point (listed in V1's Files and its
  report); they never change a fingerprint, a golden, `atlas-groups.json`, the strings or `content/`.
- **Pushes:** every builder and fixer of this wave pushes its own task to `master` (Common rule 5), after its kit
  proof; review agents never push. This wave has no zone lane (local branch) and no patch-only subtask.
- **Same-file order inside this wave:** `packages/render-pixi/src/index.ts` (the barrel) is lane 8's (`R3-04.M3a`);
  `R2-02.T4a` must not export anything new from it. `test/scripts/assets/interim-pipeline.test.ts` is `R3-03.V1`'s
  only. `packages/core/src/data/index.ts` is `R2-02.W5`'s only.

## Subtasks

### R2-02.W6 — Enemy behaviour defaults in `WORLD_SCALE` terms

- **Wave / lane / order:** wave 2, lane 1, first.
- **Depends on:** `R2-02.P0`, `R2-02.P1` on master.
- **Goal:** every world-unit default of the enemy behaviours reads `v * WORLD_SCALE` (or `v * WORLD_SCALE +
  WORLD_TOP_PAD` for `world-y`), neutral at K = 1, so R2-02's port flips them with one constant (W5-5).
- **Files (only these; checked on `bc8e05d`):**
  - `packages/core/src/behaviors/index.ts` — the enemy behaviours (`defineBehavior` calls from `:455` up to
    `DEFAULT_BEHAVIOR_DEFS` at `:1194`): every default whose unit (from `BEHAVIOR_PARAM_UNITS`) is `px-per-tick`,
    `px-per-tick2`, `world-px` or `rel-px` → `v * WORLD_SCALE`; `world-y` → `v * WORLD_SCALE + WORLD_TOP_PAD`.
    Inline literals: `HUNTER_EDGE = 12` (`:633`) → `12 * WORLD_SCALE`; `api.spawn(child, 0, -self.hh - 4)` (`:799`)
    → `-self.hh - 4 * WORLD_SCALE`.
- **Steps:**
  1. List the defaults with units: `node docs/v2-run/helpers/w5/defaults.mjs` (today) and read
     `docs/v2-run/helpers/w5/defaults-all.txt` (the v1 values at `2c865b6`).
  2. Edit each default with an exact old/new string; leave `ticks`, `angle`, `count`, `ratio`, `score`, `index`,
     `seed`, `switch` units alone.
  3. **Leave the 14 kit lines and the `meetX: 176` token alone** — they are the literals the kit flips (`screen-x` /
     `screen-y`, plus `orbiter.loop` `y`, a `world-y` the kit writes as 186): `:568-569`, `:1031`, `:1613`,
     `:1749-1752`, `:2021-2024`, `:3158-3159`, and `meetX: 176` on `:703`. **On `:703`** (`{ speed: 1.5, meetX: 176,
     gap: 8, leaveSpeed: 1.75 },`) scale `speed` and `leaveSpeed` (`px-per-tick`) and `gap` (`rel-px`) like every
     other default, and keep the text `meetX: 176` byte for byte (the kit's replacement matches that token only).
- **Tests (targeted, run all of them, at K = 1 and under the kit):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core $(ls packages/core/test/behaviors/*alloc*.test.ts)
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors
  ```
- **Acceptance:** the wave's R2-02 acceptance; the 14 `behaviors-*-alloc` guards green at both scales, no budget
  raised; `node docs/v2-run/helpers/w5/defaults.mjs` prints the same values as before at K = 1; the kit still
  replaces all 15 kit literals (`bash test/port-v2/two-scale.sh -- true` exits 0).
- **Token:** BEHAVIOR (`behaviors/index.ts`, `behaviors/units.ts`) for lane 1 through `R2-02.W7`.
- **Traps:** 3,337 lines — exact edits only, never a rewrite; a fractional default (1.25 → `1.25 * WORLD_SCALE`) is a
  plain number field, fine; a guard that fails under the kit because a fraction now crosses a non-inlined call is
  fixed by passing whole numbers, never by a budget.
- **Docs needs:** `docs/dev/enemies-and-behaviors.md` (the defaults are written `v1 × WORLD_SCALE`).

### R2-02.W7 — Boss behaviour defaults in `WORLD_SCALE` terms

- **Wave / lane / order:** wave 2, lane 1, after `R2-02.W6` (same file, same lane).
- **Depends on:** `R2-02.W6` on master (each agent pushes its own task; W7 starts from a worktree that has W6).
- **Goal:** as W6, for the boss behaviours.
- **Files (only these):**
  - `packages/core/src/behaviors/index.ts` — the boss behaviours (from about `:1224` to `DEFAULT_BOSS_BEHAVIOR_DEFS`
    at `:3192`); the ram's row clamp (`:1631-1633`: `row < 24` / `PLAYFIELD_H - 24`) → `24 * WORLD_SCALE` and
    `PLAYFIELD_H - 24 * WORLD_SCALE`; `bossSuction` `pullRadius: 200` (`:3056`) → `200 * WORLD_SCALE`;
  - `packages/core/test/frame-literals.test.ts` — only the **reason** of the `bossSuction.pullRadius` entry
    (`:127-133`): the literal 200 stays inside `200 * WORLD_SCALE`, so the count stays 1; say "a world radius,
    `200 * WORLD_SCALE`".
- **Steps:** `R2-02.W6`'s steps 1–2 and its unit rule (in its Files), for this range:
  1. list the defaults with units: `node docs/v2-run/helpers/w5/defaults.mjs` (today) and read
     `docs/v2-run/helpers/w5/defaults-all.txt` (the v1 values at `2c865b6`);
  2. edit each boss default with an exact old/new string, by its unit in `BEHAVIOR_PARAM_UNITS`: `px-per-tick`,
     `px-per-tick2`, `world-px` or `rel-px` → `v * WORLD_SCALE`; `world-y` → `v * WORLD_SCALE + WORLD_TOP_PAD`;
     leave `ticks`, `angle`, `count`, `ratio`, `score`, `index`, `seed`, `switch` units alone;
  3. leave the kit lines of this range byte for byte (Traps).
- **Tests:** as W6, plus
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/frame-literals.test.ts packages/core/test/bosses
  ```
- **Acceptance:** as W6 (the kit still replaces all 15 kit literals); the core allow-list still holds **14** entries.
- **Token:** BEHAVIOR.
- **Traps:** the kit lines in this range are `captain.ram` `ramX` (`:1613`), `captain.crab` `minX` / `maxX` /
  `minY` / `maxY` (`:1749-1752`), `boss.widow` (`:2021-2024`) and `boss.walker` (`:3158-3159`): leave them byte for
  byte — the kit replaces each by an exact match, and a scaled line makes `two-scale.sh` exit 1.
- **Docs needs:** as W6.

### R2-02.T0 — The v1 → v2 mapping helper for tests

- **Wave / lane / order:** wave 2, lane 2, first.
- **Depends on:** `R2-02.P0` on master.
- **Goal:** one helper every R2-02 test pin is written with, the identity at K = 1.
- **Files (only these; "new" = create):**
  - `packages/core/test/helpers/v1-port.ts` (new) — exports `K` (= `WORLD_SCALE`), `PAD` (= `WORLD_TOP_PAD`),
    `v1x(x) = K·x`, `v1y(y) = y < 0 ? K·y : K·y + PAD`, `v1rel(v) = K·v`, `v1speed(v) = K·v`, `v1screenX` /
    `v1screenY` (core's `rescaleNumber('screen-x' | 'screen-y', v, …)` with the v2 geometry when `K !== 1`, the
    identity at 1), `V1_FRAME = { w: 384, h: 200 }` (test files are not frame-scanned), and `mapEnemyRow` /
    `mapBossRow` implementing `test/fixtures/v1-baseline/README.md` § "Comparing a v2 run" (`:83-122`). Numbers only;
    no `instanceof`; import core by relative path (`../../src/index.js`; `v1-replay.ts` does the same with
    `../../src/config/index.js`), so core tests do not load a second `@shmup/core` instance (w5-precheck §2 item
    12 — the report is not committed; the rule is stated here).
  - `packages/core/test/helpers/v1-port.test.ts` (new) — the identity at K = 1, and the mapping rules on hand-made
    rows (with K and PAD passed in, so both scales are tested at K = 1).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/helpers
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/helpers
  ```
- **Acceptance:** identity at K = 1; under the kit `v1x(100)` is 150, `v1y(100)` is 186, `v1y(-24)` is −36.
- **Token:** none.
- **Traps:** do not put the helper under `test/golden/` (the old plan's place): a core test importing it would load a
  second `@shmup/core`.
- **Docs needs:** `test/README.md` row (wave 5).

### R2-02.A1 — The world-scale audit tests

- **Wave / lane / order:** wave 2, lane 2, after `R2-02.T0`.
- **Depends on:** `R2-02.T0` on master.
- **Goal:** tests that are green at K = 1 and, under the kit, red exactly for the W1–W7 constants not yet ported —
  so the port cannot miss a world value.
- **Files (only these; "new" = create):**
  - `packages/core/test/config/world-scale.test.ts` (new):
    1. a frozen `V1_WORLD` table `{ name, v1, unit }` of every world-unit numeric barrel export, its v1 values from a
       **pre-flip** tree: `V1=$(mktemp -d) && git archive d4de048 packages/core tsconfig.base.json | tar -x -C "$V1"
       && node docs/v2-run/helpers/w5pre/exports.mjs "$V1"`; for a frame-anchored export (`LEAVE_END_X`,
       `BOSS_REST_X`, `DEFAULT_SPAWN_SCREEN_X`, `DEFAULT_BLOCK_SCREEN_X`, `DEFAULT_BOSS_X`) store the formula's world
       offset (32, 40, 16, 16, −88), not the absolute value;
    2. each export equals `rescaleNumber(unit, v1, geometry)` (core `data/units.ts:265`; geometry from
       `WORLD_SCALE` / `WORLD_TOP_PAD`; identity at 1), or `PLAYFIELD_W + offset * WORLD_SCALE` for the anchored ones;
    3. an `UNSCALED` list with a one-word reason (`ticks`, `angle`, `count`, `ratio`, `frame`, `score`, `flag`,
       `hash`, `resolution`, `bound`): `ACCEL_HAS_MAX` / `ACCEL_HAS_MIN` are `flag` (bit flags), `FNV_OFFSET_BASIS`
       is `hash`, `PATH_SAMPLE_STEP` (`data/paths.ts:26`, 1 px) is `resolution` (the baked path tables' sampling
       step: it stays 1 px, a ported path just has more samples), `MAX_PATH_LENGTH` (16384 px) is `bound` (a
       load-time cap far above every shipped path, ported or not: their control polylines are under 1,000 px);
    4. a **completeness audit**: every numeric barrel export (386 at `bc8e05d`, 388 after P0 adds `WORLD_SCALE` /
       `WORLD_TOP_PAD`; `docs/v2-run/helpers/w5pre/exports.txt` is the list at `ac40436`) — the audit takes today's
       list from the barrel, never a hard-coded count —
       whose name matches `/MARGIN|RADIUS|SPEED|ACCEL|_X$|_Y$|ORBIT|LINK|WIDTH|LENGTH|RANGE|PULL|DRIFT|SPREAD|STEP|LEAD|OFFSET|SPACING|CELL/`
       is in `V1_WORLD` or in `UNSCALED`.
  - `packages/core/test/behaviors/fixtures/v1-behavior-defaults.json` (new) — the v1 behaviour and weapon defaults
    with their units, made with `node docs/v2-run/helpers/w5/defaults.mjs "$V1"` (the `--- weapons` block included;
    `docs/v2-run/helpers/w5/defaults-all.txt` is the same output at `2c865b6`).
  - `packages/core/test/behaviors/behavior-defaults-port.test.ts` (new) — every world-unit default equals its v1 value
    by its unit's rule at the current scale; the `screen-x` / `screen-y` ones only when `WORLD_SCALE !== 1`, against
    `rescaleNumber` with the v2 geometry; every tunable of `BEHAVIOR_PARAM_UNITS` has a row (a new tunable fails).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/config/world-scale.test.ts packages/core/test/behaviors/behavior-defaults-port.test.ts
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/config/world-scale.test.ts packages/core/test/behaviors/behavior-defaults-port.test.ts
  ```
- **Acceptance:** green at K = 1; under the kit, the red list names only W1–W7 constants (list them by subtask id in
  the report); once W1–W7 are on master, green under the kit too.
- **Token:** none.
- **Traps:** `WORLD_SCALE` is typed `number` (TS2367), so `it.runIf(WORLD_SCALE !== 1)` typechecks; the v1 values
  must come from ≤ `d4de048` — the frame-derived exports moved at the flip `72b18a1`; a fixture JSON is not a content
  file (`content/` stays untouched).
- **Docs needs:** `docs/dev/conventions.md` (the audit test), `test/README.md` rows.

### R2-02.T4b — The Tiled importer and rescale tests

- **Wave / lane / order:** wave 2, lane 2, after `R2-02.A1`.
- **Depends on:** nothing beyond P0 / P1 for the fixtures and the `runIf`s; the kit run of the identity case `:243`
  (its ported branch, below) needs `R2-02.W5` (the ±768 bound) on master — until then that one case fails under the
  kit, and you list it in your report by W5's id.
- **Goal:** the tools' tests pass after the port: the Tiled fixtures at 12-px tiles and the 640 view; the rescale
  tests that read v1-geometry shipped content run only while the content is still v1 (W5-4), and the factor-1
  identity case runs on either tree (v1 content, or ported).
- **Files (only these):**
  - `test/scripts/content/fixtures/tiled-sample.tmj`, `tiled-sample.stage.json`, `tiled-sample.paths.json` — rebuilt
    at 12-px tiles and the 640 view (`scripts/content/tiled-import.mjs` reads `scripts/frame.mjs`: 640 / 12 since
    the flip);
  - `test/scripts/content/tiled-import.test.ts`, `tiled-import-edge.test.ts` — their literals
    (`tiled-import-edge.test.ts:182` pins `SPAWN_LEAD` symbolically: leave it); **their `port-pending` gates stay**
    (U5 deletes them in wave 5);
  - `test/scripts/content/rescale.test.ts`:
    - **the condition.** Write one constant in this test file itself, `CONTENT_STILL_V1`: read every
      `content/tilesets/*.tileset.json` `tileSize`; the content is still v1 while one of them is 8. Never take it from
      `packages/core/test/helpers/port-pending.ts` (`CONTENT_PORT_PENDING`, `shippedTileSizes`): `R2-02.U5` deletes
      that file in wave 5 without touching these tests, wave 5's mechanical un-gating (its rule 4) would turn a
      `runIf(CONTENT_PORT_PENDING)` into a plain `it`, and the 6 retired cases must keep skipping after it;
    - the four cases of "the shipped content" that assume v1 geometry (`:256`, `:279`, `:329`, `:360`) get
      `it.runIf(CONTENT_STILL_V1)`;
    - **the identity case `:243`** reads the content with the v1 geometry (`shipped('identity')`: `--tile-size 8`),
      so under the kit it fails ("tileSize 12 is not --tile-size 8"). Make it the factor-1 identity on **either**
      tree: while `CONTENT_STILL_V1`, it keeps `shipped('identity')`; once the content is ported, it uses core's own
      geometry (`options({ factor: 1 })`: `content/` as it is, a dry run — what
      `node scripts/content/rescale.mjs --factor 1 --dry-run` runs) and expects 0 changes, 0 unclassified, 0 errors.
      Under the kit, before `R2-02.W5` is on master, the ported branch reports the 3 IRON LEVIATHAN `parts[].x`
      errors (the bound is still ±512): list them in your report by W5's id. Never port `content/` ×1.5 inside a
      test: at `WORLD_SCALE !== 1` it is already ported. Add no other case;
  - `test/scripts/content/rescale-edge.test.ts` — the two round-5 cases `:1557` and `:1626` (they read the shipped
    `terrain-a` through `TILESET_FILE`, `:1466-1470`, in `portAndDraw`) get the same `it.runIf(CONTENT_STILL_V1)`,
    with the same constant written in this file too (same rule: never from `port-pending.ts`).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/content
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/content
  ```
- **Acceptance:** the 54 other tests of `rescale.test.ts` / `rescale-edge.test.ts` (13 + 48 = 61 today, less the 7
  named above) unchanged and green; green at both scales: the `port-pending` cases (`itPortPending`) skip at K = 1
  and **run** under the kit (the stub turns `CONTENT_PORT_PENDING` off), so they must pass there; the four + two
  `runIf(CONTENT_STILL_V1)` cases skip under the kit — retired by design, and `R2-02.U5` does not touch these two
  files — 6 retired cases, the number waves 4 and 5 expect; `:243` runs at both scales (under the kit it is red
  only for the 3 IRON LEVIATHAN errors, until `R2-02.W5` is on master).
- **Token:** none.
- **Traps:** every shipped-content run here is a dry run of `content/` as it is — no temp copy, no ×1.5 port inside a
  test, nothing written to `content/`.

### R2-02.W2 — Weapons in `WORLD_SCALE` terms

- **Wave / lane / order:** wave 2, lane 3.
- **Depends on:** `R2-02.P0` on master.
- **Goal:** the player-shot world values read `v1 * WORLD_SCALE`, neutral at K = 1.
- **Files (only these):** `packages/core/src/weapons/index.ts` — `SHOT_CULL_MARGIN` (`:256`), `LASER_SEGMENT_LENGTH`
  (`:271`), `RIPPLE_RING_WIDTH` (`:540`), and **`WEAPON_BEHAVIOR_PARAMS`** (`:362`, about 120 values: `ox`, `oy`,
  `hw`, `hh`, speeds, lengths, radii) — each by its unit in `BEHAVIOR_PARAM_UNITS` (the weapons block at
  `behaviors/units.ts:317`); `angle` and tick values (`hitCooldownTicks`) stay.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/weapons
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/weapons/weapons-alloc.test.ts packages/core/test/weapons/weapons-alloc-coop.test.ts packages/core/test/weapons/weapons-arsenal-alloc.test.ts
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/weapons
  ```
- **Acceptance:** the wave's R2-02 acceptance; the three weapons guards green at both scales.
- **Token:** none.
- **Traps:** `WEAPON_BEHAVIOR_PARAMS` holds frozen object literals: keep their key order (a new hidden-class shape
  can make hot reads allocate); `angle: 128` is a binary angle.
- **Docs needs:** `docs/dev/meter-arsenal.md` or `weapons-and-options.md` (one line: shot sizes ×1.5).

### R2-02.W1 — Bullets and patterns in `WORLD_SCALE` terms

- **Wave / lane / order:** wave 2, lane 4, first.
- **Depends on:** `R2-02.P0` on master.
- **Files (only these):**
  - `packages/core/src/bullets/index.ts` — `BULLET_CULL_MARGIN` (`:164`), `MAX_BULLET_SPEED` (`:167`), `LASER_WIDTH`
    (`:197`), `GRAZE_MARGIN` (`:240`), the radii of `BULLET_KINDS` (`:305`), `BENDING_LASER_SPEED` (`:349`),
    `BENDING_LASER_LENGTH` (`:358`), `BENDING_LASER_WIDTH` (`:361`), `POINT_ITEM_ACCEL` (`:376`),
    `POINT_ITEM_MAX_SPEED` (`:379`); `BENDING_LASER_TURN` / `_HOMING` / `_LIFE` / `_NODES` and `POINT_ITEM_HOVER_TICKS`
    / `_LIFETIME` are angles, ticks or counts: unchanged;
  - `packages/core/src/patterns/index.ts` — `CRAWL_STEP` (`:346`);
  - `packages/core/src/patterns/dsl.ts` — `DEFAULT_PATTERN_SPEED` (`:201`).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/bullets packages/core/test/patterns
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/bullets/bullets-alloc.test.ts packages/core/test/bullets/bullets-alloc-cancel.test.ts packages/core/test/patterns/patterns-alloc.test.ts
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/bullets packages/core/test/patterns
  ```
- **Acceptance:** the wave's R2-02 acceptance; the guards green at both scales with **no budget raised**.
- **Token:** none.
- **Traps:** `GRAZE_MARGIN` 10.5 and `POINT_ITEM_ACCEL` 0.525 are fractions under the kit: if a guard grows, the
  fraction crosses a call — fix the call; `POINT_ITEM_TARGETS` (`:389`) are screen points: check their unit before
  touching them (frame-anchored → derive, never ×K).
- **Docs needs:** `docs/dev/bullets-and-patterns.md` (one line).

### R2-02.T4c — Hurtbox-inside-art tests measure the atlas frames

- **Wave / lane / order:** wave 2, lane 4, after `R2-02.W1`.
- **Depends on:** nothing beyond P0 / P1 (needs `pnpm assets`).
- **Goal:** the B/C, D/E and F/G hurtbox-inside-art helpers measure the **`buildAtlas()` frames** (×1.5 interim art),
  the way the H/I test does, so after the port the hurtboxes (×1.5) are compared with art of the same scale; W5-3's
  1-px allowance covers only the boxes the tool's "rounded integers" list names.
- **Files (only these):**
  - `test/scripts/assets/procedural-zones-edge.test.ts` (`:154-185`, B/C: today it reads `brine.generate()` /
    `dune.generate()` raw frames);
  - `test/scripts/assets/procedural-zones-de.test.ts` (`:97-117`, `hurtboxesInside`);
  - `test/scripts/assets/procedural-zones-fg.test.ts` (`:99-118`);
  - `test/scripts/assets/procedural-zones-hi.test.ts` (`:186-232`, already uses `buildAtlas()`; add the allowance).
- **Steps:** switch the three helpers to `buildAtlas().manifest` frame sizes (as `-hi` does at `:187-191`); add the
  W5-3 allowance (1 px, only for entries the port rounds — today F 6, G 7, H 6, I 1:
  `node docs/v2-run/helpers/w5pre/hurtbox.mjs` prints them).
- **Tests:**
  ```bash
  pnpm assets
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-zones.test.ts test/scripts/assets/procedural-zones-edge.test.ts test/scripts/assets/procedural-zones-de.test.ts test/scripts/assets/procedural-zones-de-edge.test.ts test/scripts/assets/procedural-zones-fg.test.ts test/scripts/assets/procedural-zones-fg-edge.test.ts test/scripts/assets/procedural-zones-hi.test.ts test/scripts/assets/procedural-zones-hi-edge.test.ts
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-zones-edge.test.ts test/scripts/assets/procedural-zones-de.test.ts test/scripts/assets/procedural-zones-fg.test.ts test/scripts/assets/procedural-zones-hi.test.ts
  ```
- **Acceptance:** green at both scales; without the switch about 99 boxes would fail under the kit — say how many the
  allowance covers.
- **Token:** none.
- **Traps:** the allowance is exactly 1 px and only for listed boxes — a blanket tolerance hides real overflows.

### R2-02.W3 — The ship side in `WORLD_SCALE` terms

- **Wave / lane / order:** wave 2, lane 5, first.
- **Depends on:** `R2-02.P0` on master.
- **Files (only these):**
  - `packages/core/src/player/index.ts` — `ENTER_START_X` (`:135`, −24), `ENTER_END_X` (`:138`, 64),
    `LEAVE_ACCELERATION` (`:156`), `LEAVE_MAX_SPEED` (`:159`), `LEAVE_END_X = PLAYFIELD_W + 32 * WORLD_SCALE` (`:164`);
    **`SPAWN_Y` (`:141`) stays `PLAYFIELD_H / 2`** (W5-2);
  - `packages/core/src/options/index.ts` — `OPTION_RADIUS` (`:100`), `SNAKE_LINK` (`:103`), `ROTATE_RADIUS` (`:119`),
    `ROTATE_RADIUS_EXTENDED` (`:122`);
  - `packages/core/src/shields/index.ts` — `POD_RADIUS` (`:157`), `POD_ORBIT` (`:160`), `ROTATE_POD_ORBIT` (`:163`);
    **`FRONT_POD_ANGLE` (`:166`, 64) and `FREE_POD_SPREAD` (`:169`, 96) are binary angles: unchanged**;
  - `packages/core/src/powerups/index.ts` — `COOP_EXTRA_OFFSET` (`:268`), `ITEM_RADIUS` (`:416`),
    `PICKUP_MAGNET_RANGE` (`:419`), `PICKUP_MAGNET_SPEED` (`:422`), `ITEM_CULL_MARGIN` (`:425`);
  - `packages/core/src/blackhole/index.ts` — `BLACK_HOLE_RADIUS` (`:95`), `_CORE_RADIUS` (`:98`), `_PULL` (`:101`),
    `_ENEMY_PULL` (`:111`), `_DRIFT` (`:114`), `_THROW_X` (`:117`); the ticks, damage, frames stay.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/player packages/core/test/options packages/core/test/shields packages/core/test/powerups packages/core/test/blackhole
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/shields/shields-alloc.test.ts packages/core/test/powerups/powerups-alloc.test.ts packages/core/test/powerups/powerups-alloc-coop.test.ts packages/core/test/powerups/powerups-direct-alloc.test.ts packages/core/test/blackhole/blackhole-alloc.test.ts
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/player packages/core/test/options packages/core/test/shields packages/core/test/powerups packages/core/test/blackhole
  ```
- **Acceptance:** the wave's R2-02 acceptance; angles and ticks unchanged (`R2-02.A1` classifies them).
- **Token:** none (POWERUPS is not taken in this wave: W3 is the only editor of `powerups/index.ts`).
- **Traps:** `ENTER_END_X` is the bot's `BOT_X` in wave 3 (`R2-02.T2b` imports it); `BLACK_HOLE_DRIFT` 0.375 and
  `LEAVE_ACCELERATION` 0.1875 under the kit — watch the guards.

### R2-02.W5 — Data defaults and bounds in `WORLD_SCALE` terms

- **Wave / lane / order:** wave 2, lane 5, after `R2-02.W3`.
- **Depends on:** `R2-02.P0` on master.
- **Goal:** the content defaults and the fixed bounds read `WORLD_SCALE`, neutral at K = 1. The tool's pair metadata
  must still read v1 values while the tool runs (§0.5 of the background): at K = 1 it does; the kit runs the tool
  **before** flipping K.
- **Files (only these):** `packages/core/src/data/index.ts` — `DEFAULT_REVENGE_SPEED` (`:721`) → `1.25 * WORLD_SCALE`;
  `DEFAULT_BOSS_X = PLAYFIELD_W - 88 * WORLD_SCALE` (`:981`); `DEFAULT_MODE7_FOG_DEPTH` (`:1385`, texels) →
  `96 * WORLD_SCALE`; `DEFAULT_BONUS_WINDOW = 600 * WORLD_SCALE` (`:1797`); `DEFAULT_BLOCK_SCREEN_X = PLAYFIELD_W +
  16 * WORLD_SCALE` (`:1887`); the ground pair's `screenPastEnd: 16` (`:2775`) → `16 * WORLD_SCALE`; the boss
  `parts[].x/y` bound `±512` (`:2465-2466`) → `±512 * WORLD_SCALE` (W5-8: ±768 after the port).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/data
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-units.test.ts test/scripts/content
  bash test/port-v2/two-scale.sh -- node scripts/content/rescale.mjs --factor 1 --dry-run
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/data
  ```
- **Acceptance:** the wave's R2-02 acceptance; the block pair (`:2761`) still reads `DEFAULT_BLOCK_SCREEN_X −
  PLAYFIELD_W` (16 at K = 1); **the kit's identity run now reports 0 / 0 / 0** (the 3 IRON LEVIATHAN errors are gone).
- **Token:** DATA-INDEX.
- **Traps:** `DEFAULT_BOSS_Y` (`:984`) stays `PLAYFIELD_CY`; the schema bounds `min`/`max` are integers in some
  schemas (`s.int`): keep `±512 * WORLD_SCALE` whole (768) or the schema rejects it; 5,544 lines — exact edits.
- **Docs needs:** `docs/dev/content-data.md` (the defaults are `v1 × WORLD_SCALE`), plan Appendix B (wave 5).

### R2-02.W4 — Enemies, bosses, stage, world, collision and debug in `WORLD_SCALE` terms

- **Wave / lane / order:** wave 2, lane 6, first.
- **Depends on:** `R2-02.P0` on master.
- **Files (only these):**
  - `packages/core/src/enemies/index.ts` — `DEFAULT_SPAWN_SCREEN_X = PLAYFIELD_W + 16 * WORLD_SCALE` (`:265`),
    `DESPAWN_MARGIN` (`:268`), `UNSEEN_MARGIN` (`:271`), `GHOST_MARGIN` (`:277`), `CARRIED_OPTION_SPACING` (`:360`);
  - `packages/core/src/bosses/index.ts` — `BOSS_ENTRY_MARGIN` (`:268`), `BOSS_REST_X = PLAYFIELD_W + 40 *
    WORLD_SCALE` (`:289`), `BOSS_FIRE_MARGIN` (`:295`), `CHAIN_SPREAD` (`:1525`);
  - `packages/core/src/stage/systems.ts` — `BLOCK_DESPAWN_MARGIN` (`:87`);
  - `packages/core/src/world/index.ts` — `GRID_MARGIN` (`:759`);
  - `packages/core/src/collision/index.ts` — `DEFAULT_GRID_CELL_SIZE` (`:376`; 48 under the kit);
  - `packages/core/src/debug/index.ts` — `BOSS_SKIP_LEAD` (`:961`).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/enemies packages/core/test/bosses packages/core/test/stage packages/core/test/world packages/core/test/collision packages/core/test/debug
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/enemies/enemies-hunter-alloc.test.ts packages/core/test/enemies/enemies-rank-alloc.test.ts packages/core/test/bosses/bosses-alloc.test.ts packages/core/test/bosses/bosses-advanced-alloc.test.ts packages/core/test/bosses/bosses-escape-alloc.test.ts packages/core/test/bosses/bosses-pull-alloc.test.ts packages/core/test/world/world-death-alloc.test.ts packages/core/test/world/world-death-arcade-alloc.test.ts packages/core/test/world/world-coop-alloc.test.ts packages/core/test/world/world-gimmicks-alloc.test.ts packages/core/test/debug/debug-alloc.test.ts packages/core/test/stage/stage-bonus-alloc.test.ts
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/enemies packages/core/test/bosses packages/core/test/stage packages/core/test/world packages/core/test/collision packages/core/test/debug
  ```
- **Acceptance:** the wave's R2-02 acceptance; the grid cell is 48 under the kit and a whole number (the grid divides
  by it).
- **Token:** none.
- **Traps:** `DEFAULT_SPAWN_SCREEN_X` is pinned by `scripts/frame.mjs` `SPAWN_LEAD` (`test/scripts/frame.test.ts:46`)
  — P0 already wrote the mirror as `PLAYFIELD_W + 16 * WORLD_SCALE`, so both flip together; a whole-pixel bound passed
  to a call is `Math.floor(x) | 0` (the conventions' `-0` lesson).

### R2-02.T4a — Particles: no fractional argument crosses `emit`

- **Wave / lane / order:** wave 2, lane 6, after `R2-02.W4`.
- **Depends on:** nothing beyond P0 / P1.
- **Goal:** after the port, the muzzle trigger's `dx` 9 → 13.5 (`content/fx/particles.fx.json`) would be added at
  the call `emit(p, x + dx[base + k], y + dy[base + k], intensity)` (`packages/render-pixi/src/particles/index.ts:883`)
  and boxed on every shot (166,000 B against the 65,536 B budget of `dispatch-fx-alloc`). Keep the public
  `ParticleSystem.emit(preset, x, y, intensity)` (`:530`, also used by `packages/shell/src/fx-gallery/index.ts:236`,
  `apps/tizen/src/bench/scene.ts:847` and `packages/render-pixi/test/particles/particles-edge.test.ts`) exactly as it
  is. Give `emitRow` (`:867`) its own inner helper that takes the whole `x`, `y`, the offset arrays and the trigger
  slot `base + k`, and adds `dx[slot]` / `dy[slot]` itself. Read the offsets only where the position is stored
  (`px[i]` / `py[i]`, as `spawn` (`:812`) writes them): an offset or a sum handed on to another call is boxed there
  instead.
- **Files (only these):**
  - `packages/render-pixi/src/particles/index.ts` — the trigger loop (`:878-886`) and a new inner helper for
    `emitRow` (whole `x`, `y`, plus the trigger slot; the offsets read inside); the public `emit` unchanged;
  - `packages/render-pixi/test/particles/particles.test.ts` — `:138` (`dx` of `PlayerShot` is 9) reads the preset
    through `K` (`v1x(9)` from `packages/core/test/helpers/v1-port.ts` once T0 is on master, or `9 * WORLD_SCALE`).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/particles
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/dispatch packages/shell/test/frame-fingerprint.test.ts
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/particles
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/dispatch/dispatch-fx-alloc.test.ts
  pnpm --filter @shmup/render-pixi typecheck
  ```
- **Acceptance:** `packages/shell/test/dispatch/dispatch-fx-alloc.test.ts` **unchanged** and green at both scales;
  no budget touched; the shell frame fingerprint unedited and green.
- **Token:** none (do not touch `packages/render-pixi/src/index.ts`: RP-BARREL is lane 8's).
- **Traps:** this is the conventions' boxing lesson: a fraction computed per request and passed on is boxed even when
  the callee drops it — pass the whole-pixel input and compute inside.
- **Docs needs:** `docs/dev/conventions.md` (the `particles.emit` lesson, wave 5).

### R3-03.V1 — Bullets and bend nodes drawn natively at the bible's v2 sizes

- **Wave / lane / order:** wave 2, lane 7 (side), first. It must land **before R2-03** (wave 6) re-measures the e2e
  colours.
- **Depends on:** nothing in this wave.
- **Goal:** on the `artScale !== 1` path only, draw the round, oval and needle bullets and the bending-laser node
  natively at the art bible's v2 sizes (§5.4), marked `native` so the interim stage does not scale them again. The
  beams are already native (12 frames of 6×12; `lasers.mjs:10-15`, and `r34-gen-list.mjs` prints
  `beam-*(12f 6x12 N)`) — leave them. `GeneratorOptions` already has `artScale` (`procedural/index.mjs:47-55`) — do
  not add it.
- **Files (only these; "new" = create):**
  - `scripts/assets/procedural/bullets.mjs` — a v2 path in `bulletSprites` (`:108`): round 11×11 (1 frame), oval
    13×13 with 8 headings (interim is 14 — the only size that changes), needle 17×17 with 8 headings; `native: true`
    on the v2 sprites only; `generate()` (`:147`) takes `options = {}` and passes `options.artScale ?? 1` to
    `bulletSprites`, as `lasers.mjs` `generate()` (`:139-141`) does;
  - `scripts/assets/procedural/palettes.mjs` — pass `options.artScale` to `bulletSprites` (`:56`); `CORE_MARKS`
    (`:40`) stays as it is (pink solid, red ring, purple dot); the v2 path of `bullets.mjs` `drawEllipse` (`:61`)
    draws the ring / dot marks at the v2 core size;
  - `scripts/assets/procedural/lasers.mjs` — the bend node (`bendBlob`, `:74`) 11×11, native on the v2 path;
  - `test/scripts/assets/bullets-v2.test.ts` (new) — sizes and frame counts at 3/2; frame k is k·22.5°, frame k+4 the
    exact 90° turn of k; rim < body < core; every `@<palette>` variant frame for frame; `buildAtlas({ artScale: 1 })`
    unchanged;
  - `test/scripts/assets/interim-pipeline.test.ts` — only the `NATIVE` expectation (`:196-201`): add the bullets, the
    bend nodes and their `@<palette>` variants;
  - `test/e2e/bullet-palette.spec.ts`, `test/e2e/bullets.spec.ts`, `test/e2e/boss.spec.ts`, `test/e2e/weapons.spec.ts`
    — only a colour count the new art moves (measured, never guessed), each one listed in the report.
- **Tests:**
  ```bash
  mkdir -p /home/sites/shmup-cup-run
  node docs/v2-run/helpers/r34-gen-list.mjs > /home/sites/shmup-cup-run/R3-03.V1-gens-before.txt   # once, on origin/master, before your change
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/bullets-v2.test.ts test/scripts/assets/interim-pipeline.test.ts test/scripts/assets/procedural.test.ts test/scripts/assets/palettes-names.test.ts test/scripts/assets/pipeline-edge.test.ts test/integration/content.test.ts test/integration/cjk-budget.test.ts
  pnpm content:check
  bash docs/v2-run/helpers/e2e-batch.sh bullet-palette.spec.ts bullets.spec.ts boss.spec.ts weapons.spec.ts
  node docs/v2-run/helpers/r34-gen-list.mjs > /home/sites/shmup-cup-run/R3-03.V1-gens-after.txt    # after it; then diff the two files
  ```
- **Acceptance:** the scale-1 digest pin (`interim-pipeline.test.ts:341`) unchanged; at 3/2: round 11×11 (1),
  oval 13×13 (8), needle 17×17 (8), bend 11×11 (1); every `@<palette>` frame for frame (`content.test.ts:863`); atlas
  bytes under `ATLAS_PNG_BYTES_CAP` (`test/scripts/assets/atlas-budget.ts`); an e2e count that moves is updated in the
  same push and listed in the report; the `r34-gen-list.mjs` diff (the generators' sprite lists, frames, sizes,
  `N` / `F` marks) changes only the `## bullets` line, the `bend-*` entries of `## lasers` and the matching
  `@<palette>` entries of `## palettes` (the `beam-*` entries stay as they are).
- **Token:** none.
- **Traps:** never edit the bullets block of `test/scripts/assets/procedural.test.ts` (it pins scale 1); never edit
  the v1 path; generators use exact maths only (no `Math.sin` / `cos`; `DIRECTIONS_8`, integer hashing); two runs
  byte-identical; no frame-number literal in `scripts/**`.
- **Docs needs:** `docs/dev/asset-pipeline.md` (native v2 bullets); `docs/dev/art-bible-v2.md` §5.4: none (it
  already gives the sizes 11 / 13 / 17 and the 11×11 bend node).

### R3-03.V3 — The palette-cycle scan

- **Wave / lane / order:** wave 2, lane 7, after `R3-03.V1` (may carry over into wave 3).
- **Depends on:** `R3-03.V1` on master (the scan reads the atlas V1 changes).
- **Goal:** a test that enforces the art bible's §4.4 rules on the shipped atlas (decision W5-12: fail, not warn).
- **Files (only these; "new" = create):** `test/integration/palette-cycle-scan.test.ts` (new); optionally
  `test/integration/palette-cycle.ts` (new helper). It reads the shipped `content/stages/*.stage.json` (skip
  `example.*`, a format sample whose `terrain` cycle is no reserved ramp) (`cycles`, `parallax[].layer` and its
  sprite) and `buildAtlas()` in memory, and writes nothing in `content/` or `scripts/`.
- **The three rules:**
  1. per stage with `cycles`: on a cycled layer every pixel is an exact ramp colour of that layer's cycle art, or at
     Chebyshev distance ≥ 3 from every ramp colour of that layer;
  2. project-wide: every sprite is ≥ 3 from all 8 reserved ramps (the distinct `cycles` colour lists of the shipped
     stages — read from the stages, never copied; name each by the stage that cycles it, as the bible's ramp table
     does: `SEA` = raster-range, `BRINE` = zone-b and brine-grotto, `MAGMA` = zone-d, `STORM` = zone-e, `VAULT` =
     zone-f, `PRISM` = zone-g and glimmer-cache, `CITADEL` = zone-h, `ABYSS` = zone-i), **except a cycle-art sprite
     against its own ramp** (the ramp table's "Cycle art" column, e.g. `bg/sea-swell` against `SEA`; rule 1 checks
     it) and the bible's exemption list (`docs/dev/art-bible-v2.md` §4.4, after the ramp table), pinned in the test;
     an entry that no longer trips fails, so the list cannot rot;
  3. a synthetic fixture backdrop passes; the same with one pixel 2/255 off fails.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/palette-cycle-scan.test.ts
  ```
- **Acceptance:** passes on the shipped atlas; fails on the stray-pixel fixture.
- **Token:** none.
- **Traps:** the shader's tolerance is 1.5/255; the margin is 3 (twice it), Chebyshev (max over channels); later
  subtasks delete exemption lines when they replace a sprite — keep one line per sprite.
- **Docs needs:** `docs/dev/art-bible-v2.md` §4.4 (the scan exists, the exemptions are pinned),
  `docs/dev/presentation-polish.md` (wave 5).

### R3-04.M3a — Deferred atlas pages in render-pixi

- **Wave / lane / order:** wave 2, lane 8 (side), first. Lane 8 may carry over into waves 3 and 4.
- **Depends on:** nothing.
- **Goal:** `createAtlas` can start with pages unloaded and load / unload a page later (the base of the lazy
  residency, decision W5-15).
- **Files (only these; "new" = create):** `packages/render-pixi/src/atlas/index.ts` (`createAtlas` at `:274`: pages
  that start unloaded, `loadPage(i, image)`, `unloadPage(i)`); `packages/render-pixi/src/index.ts` (barrel);
  `packages/render-pixi/test/atlas/atlas-deferred.test.ts` (new); `packages/render-pixi/test/atlas/atlas.test.ts`.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/atlas
  pnpm --filter @shmup/render-pixi typecheck
  ```
- **Acceptance:** an unloaded page draws nothing (or `ui/missing`) and never throws; no allocation per frame (a guard
  if the draw path changed).
- **Token:** RP-BARREL.
- **Traps:** Chromium 68 (no `.at`, `structuredClone`, …); Pixi setters that allocate are called only on change;
  WebGL1.

### R3-04.M3b — The shell's lazy residency, images released

- **Wave / lane / order:** wave 2, lane 8, after `R3-04.M3a`.
- **Depends on:** `R3-04.M3a` on master.
- **Files (only these; "new" = create):** `packages/shell/src/memory/index.ts` (`createAtlasResidency` `:818` gains a
  mode `lazy`; `prepare(stage): Promise<void>` fetches and decodes through the loader, uploads, drops the image, and
  unloads pages the stage does not need; `ImagePolicy` (`:1052`) used at runtime); `packages/shell/src/loader/index.ts`
  (a single-page `loadImagesTimed`); `packages/shell/src/index.ts` (barrel); `packages/shell/test/memory/residency-lazy.test.ts`
  (new); `packages/shell/test/memory/residency-lazy-alloc.test.ts` (new).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/memory packages/shell/test/loader
  pnpm --filter @shmup/shell typecheck
  ```
- **Acceptance:** the steady-state guard (`measureHeapGrowth`, warm-up ≥ 20,000, new indices each window) green, no
  budget raised; linked and dev stages keep every page (W5-18).
- **Token:** SHELL-BARREL.
- **Traps:** `prepare` returns a Promise — `@returns` says when it resolves and `@throws` what rejects; no
  `Promise.allSettled` (Chromium 68).

### R3-04.M3c — Hold the sim while pages load

- **Wave / lane / order:** wave 2, lane 8, after `R3-04.M3b` (may run in wave 3).
- **Depends on:** `R3-04.M3b` on master.
- **Files (only these; "new" = create):** `packages/shell/src/boot/index.ts`, `packages/shell/src/frame-loop/index.ts`
  (while the shown World's pages load, the loop redraws the last frame: no tick, no input consumed);
  `packages/shell/test/boot/boot-residency.test.ts`; `packages/shell/test/boot/residency-hold.test.ts` (new: a replay
  across a zone change hashes the same with and without the hold; and, with debug frame advance on, a
  `game.requestStep(1)` asked for while pages load runs exactly one tick once they are in — the e2e helper `stepTo`
  (`test/e2e/frame-advance.ts`) relies on it); `packages/shell/test/memory/memory-hand.test.ts` (under the lazy
  policy); `apps/{web,tizen,webos}/test/boot/boot-wiring.test.ts` — they boot each host through the real
  `@shmup/shell` and count residency uploads (`uploads`) and ticks (`apps/web/test/boot/boot-wiring.test.ts:509`):
  if the hold covers the first World's page load, change only an upload or tick count it moves, and explain each
  in the commit body.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/boot packages/shell/test/frame-loop packages/shell/test/memory
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project web apps/web/test/boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project webos apps/webos/test/boot
  ```
- **Acceptance:** determinism proved by the replay test; the frame-loop guards (`frame-loop-refresh-alloc.test.ts`)
  green; **debug frame advance (`freezeSim` / `stepTo` in e2e) still steps** (the `requestStep` case of
  `residency-hold.test.ts`); the three apps' boot tests green.
- **Token:** none (M3c, M3d and M3e share `boot/index.ts`: one lane, in order).
- **Traps:** the hold must not consume input or tick: a held frame that ticks changes every replay hash.

### R3-04.M3d — Recover from a WebGL context loss

- **Wave / lane / order:** wave 2, lane 8, after `R3-04.M3c` (likely in wave 3 or 4).
- **Depends on:** `R3-04.M3c` on master.
- **Files (only these; "new" = create):** `packages/shell/src/boot/index.ts` (`webglcontextlost` / `restored` →
  re-fetch and re-upload the resident pages); `packages/render-pixi/src/renderer/index.ts` (only if the hook belongs
  there); `test/e2e/atlas-context-loss.spec.ts` (new: `WEBGL_lose_context`, then the game renders again);
  `test/e2e/atlas-residency.spec.ts` (extended).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/boot
  bash docs/v2-run/helpers/e2e-batch.sh atlas-context-loss.spec.ts atlas-residency.spec.ts boot.spec.ts zone-map.spec.ts webos.spec.ts
  ```
- **Acceptance:** the two atlas specs (`atlas-context-loss.spec.ts`, `atlas-residency.spec.ts`) green — the line's
  other three (`boot.spec.ts` batch D, `zone-map.spec.ts` batch C, `webos.spec.ts` batch E) are regression checks
  that pass as on master; the new spec joins e2e batch G (README; A … E hold 10 each).
- **Token:** none. **e2e:** this lane is one of the wave's two e2e agents.
- **Traps:** `atlas-residency.spec.ts:409` (line at `543887b`) is gated on `R2_03_PENDING` (`GOLDEN_REASON`); keep that skip (R2-03.G1
  deletes it in wave 6, and rebases on your extension); `WEBGL_lose_context` is for e2e only. `R2-02.E0` (wave 3)
  never edits `atlas-residency.spec.ts`: if E0's report hands you a test of it that fails under the kit, gate it with
  `test.skip(PORT_UNMEASURED, PORT_REASON)` (from `./gates.js`) in your push, and say so in your report.

### R3-04.M3e — The lazy policy, images released, becomes the hosts' default

- **Wave / lane / order:** wave 2, lane 8, after `R3-04.M3d`.
- **Depends on:** `R3-04.M3d` on master.
- **Files (only these):** one `bootShell` option in `packages/shell/src/boot/index.ts` (a one-line switch back);
  `packages/shell/test/memory/memory.test.ts` (the non-campaign "every page" pin stays);
  `packages/shell/test/boot/boot.test.ts`; `apps/{web,tizen,webos}/test/boot/boot-wiring.test.ts` — they boot each
  host through the real `@shmup/shell` and count residency uploads (`uploads`) and ticks
  (`apps/web/test/boot/boot-wiring.test.ts:509`): change only an upload or tick count the lazy default moves, and
  explain each in the commit body.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project web apps/web/test/boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project webos apps/webos/test/boot
  pnpm --filter @shmup/tizen build
  bash docs/v2-run/helpers/e2e-batch.sh boss.spec.ts advanced-bosses.spec.ts render-groups.spec.ts debug-tools.spec.ts attract.spec.ts determinism.spec.ts atlas-residency.spec.ts extra-replays.spec.ts zone-map.spec.ts continue.spec.ts
  bash docs/v2-run/helpers/e2e-batch.sh smoke.spec.ts boot.spec.ts frame-layout.spec.ts scenes.spec.ts front-end.spec.ts options.spec.ts game-options.spec.ts display-options.spec.ts rebind.spec.ts input.spec.ts
  bash docs/v2-run/helpers/e2e-batch.sh atlas-context-loss.spec.ts campaign-run.spec.ts
  ```
  (`--project shell` is one package's project, allowed as a targeted run. The three e2e lines are README's batch C,
  batch D, and batch G plus batch A's `campaign-run.spec.ts`, run one after another: the lazy default changes how
  every host boots and changes zones, so the boot, front-end, attract, determinism and zone-map specs must run.
  Master's e2e is green or skipped all through waves 2–4 — after wave 4's port commit the specs it moves skip on
  `PORT_UNMEASURED` — so a spec that turns red with your change is yours to fix.)
- **Acceptance:** `app.js` ≤ 512 KB gzip (about 380 KB now); the three apps' boot tests green; the three e2e batches
  above green (the existing skips stay skips).
- **Token:** none.

## Reviews

### R2-02.prepA.RV — Review of each R2-02 prep-A subtask (W1–W7, T0, A1, T4a–c)

- **Wave / order:** review slot 1, one review per subtask as it lands; fix → a **new** review until zero findings.
- **What to read:** the subtask's commits (`git show <sha>`) and its report.
- **Must hold:** `WORLD_SCALE` / `WORLD_TOP_PAD` still 1 / 0 and `scripts/frame.mjs` unchanged by anyone but P0;
  `git diff --name-only $(cat /home/sites/shmup-cup-run/w02-base.txt)..origin/master -- content test/golden/'*.replay.json' content/demos test/fixtures/v1-baseline`
  empty; the three fingerprints unedited and green; every changed value is a world value by its unit (spot-check 10
  against `docs/v2-run/helpers/w5/defaults-all.txt` / `literals.txt`); no angle, tick or count scaled; frame anchors
  written `PLAYFIELD_W + v * WORLD_SCALE`; the subtask's tests green at K = 1 **and** under the kit (the reviewer re-runs
  them); allocation guards green, no budget raised; after W6 and W7, the kit still replaces all 15 kit literals
  (`bash test/port-v2/two-scale.sh -- true` exits 0; `meetX: 176` still in `behaviors/index.ts` byte for byte).

### R2-02.RV-A2 — The failure lists under the kit

- **Wave / order:** review slot 1, after W1–W7, A1 and T0 are on master (lane 2 may still be on T4b).
- **Goal:** the list of tests that fail under the kit, one file per wave-3 subtask, replacing the background's stale
  lists (`if-new.txt` / `cf-new.txt`, never committed: see the "[Corrected after the flip" note before
  `wave5-scout.md` §0).
- **Run:**
  ```bash
  mkdir -p /home/sites/shmup-cup-run/w02/rv-a2
  bash test/port-v2/two-scale.sh --keep -- true   # its last output line is the kept tree's path: put it for <kit> below
  bash test/port-v2/two-scale.sh --reuse <kit> -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core --reporter=json --outputFile=/home/sites/shmup-cup-run/w02/rv-a2/core.json
  bash test/port-v2/two-scale.sh --reuse <kit> -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration --reporter=json --outputFile=/home/sites/shmup-cup-run/w02/rv-a2/int.json
  bash test/port-v2/two-scale.sh --reuse <kit> -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell --project render-pixi --reporter=json --outputFile=/home/sites/shmup-cup-run/w02/rv-a2/pkg.json
  ```
  (projects run in the throwaway tree are the barrier's kind of check, not the run's full suite. A whole project runs
  longer than the shell tool's 2 minutes: give each command a `timeout`, e.g. `1800000`. Remove the kept tree at the
  end with `git worktree remove --force <kit>`.)
- **Output:** `RUN_DIR/w02/rv-a2/<id>.txt` for `R2-02.T1a` … `T1e`, `T2a` … `T2e`, `T3`, and `other.txt` (failures
  that fit no T, with a suggested owner): one failing test per line, `file > describe > it — first error line`, by
  the file lists of wave 3's blocks.
- **Acceptance:** every failure is in exactly one list.

### R3-03.V1.RV — Review of the native v2 bullets

- **Must hold:** the scale-1 build is unchanged: the digest pin `interim-pipeline.test.ts:341-357` (`fa4198…`) is
  green **and unedited** by V1 (`node scripts/generate-assets.mjs` has no art-scale flag — it builds
  `INTERIM_ART_SCALE` 3/2, which V1 changes on purpose — so a `sha256sum assets/generated/atlas/*` before / after
  comparison is not the check here; that one is only for the byte-neutral side lanes); sizes and frame counts as V1 says; frame k+4 is the exact 90° turn of k; every
  `@<palette>` frame for frame; no edit of the v1 path or of `procedural.test.ts`'s bullets block; every e2e count V1
  changed is listed in its report with its measurement; generators deterministic (two runs identical).

### R3-03.V3.RV — Review of the palette-cycle scan

- **Must hold:** the ramps are read from the shipped stages (`example.*` skipped), never copied; the exemption list
  equals the bible's (a cycle-art sprite against its own ramp is skipped by rule 2, never listed); rule 3's fixture
  fails with a 2/255 pixel; the test passes on today's atlas.

### R3-04.M3.RV — Review of each M3 subtask

- **Must hold:** Chromium 68 floor (`VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration
  test/integration/tv-engine-floor.test.ts`); zero allocation in the steady state; the hold changes no hash (the
  replay test); frame advance still steps (the `requestStep` case of `residency-hold.test.ts`); `app.js` ≤ 512 KB
  gzip; after M3c and M3e, the three apps' boot tests green (`--project web` / `tizen` / `webos`, `apps/*/test/boot`).

## Exit check

1. W1–W7, A1, T0, T4a, T4b, T4c on master; their reviews at zero findings.
2. `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts
   test/integration/content-db-fingerprint.test.ts` — and `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell
   packages/shell/test/frame-fingerprint.test.ts` — green with the files unedited since the wave base — this is empty:
   ```bash
   git diff $(cat /home/sites/shmup-cup-run/w02-base.txt)..origin/master -- test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts packages/shell/test/frame-fingerprint.test.ts
   ```
3. `git diff --name-only $(cat /home/sites/shmup-cup-run/w02-base.txt)..origin/master -- content test/golden/'*.replay.json' content/demos test/fixtures/v1-baseline`
   is empty.
4. `bash test/port-v2/two-scale.sh -- node scripts/content/rescale.mjs --factor 1 --dry-run` reports 0 / 0 / 0.
5. `bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core
   packages/core/test/config/world-scale.test.ts packages/core/test/behaviors/behavior-defaults-port.test.ts` green.
6. `RUN_DIR/w02/rv-a2/` holds the lists.
7. `R3-03.V1` on master and reviewed to zero (V3 and the M3 lane may continue in wave 3).
8. Deferred to wave 15: nothing new.

## Owner (Manual) — never blocks this wave

- Optional: confirm W5-2 (the ship's spawn row stays the frame centre, 168) and W5-15 (the lazy memory policy).
- R0-03 (the TV bench run on the M7s) any time; nothing waits for it.
