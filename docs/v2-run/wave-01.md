# Wave 1 — the R2-01 docs pass ∥ R2-02's opening (`WORLD_SCALE`, the port kit)

> Schedule: `plan_resolution.md` §18 · how to use: [`README.md`](README.md) · decisions: [`decisions.md`](decisions.md)

**Steps:** R2-01 (docs pass, and `R2-01.F1` if wave 0 left it open) · R2-02 (P0, P1) · **Gate to start:** wave 0
closed (the C5 review loop at zero) · **Exit (summary):** the docs review at zero findings; §17 R2-01 → `done (owner
parts pending)` and the board synced; `WORLD_SCALE` / `WORLD_TOP_PAD` and the port kit on master, reviewed to zero.

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| 1 | `R2-01.F1` (only if wave 0 left it open) | `test/e2e/campaign-run.spec.ts`, `test/e2e/debug-tools.spec.ts` | — | **yes** |
| 2 | `R2-02.P0` → `R2-02.P1` | `packages/core/src/config/index.ts`, barrel, `scripts/frame.mjs`; then `test/port-v2/**` (new) | CORE-CONFIG, then KIT | no |
| 3 | `R2-01.D1` (= `W01.DOCS-A`) | `plan_resolution.md`, `CHANGELOG.md` | **PLAN** | no |
| 4 | `R2-01.D2` | `CLAUDE.md`, `docs/dev/conventions.md`, `docs/dev/repo-layout.md`, `test/README.md`, `scripts/README.md` | — | no |
| 5 | `R2-01.D3` | `docs/dev/api-reference.md`, `packages/{core,render-pixi,shell}/README.md` | — | no |
| 6 | `R2-01.D4` | `docs/dev/{asset-pipeline,rendering-and-shell,presentation-polish,visual-and-mechanic-extras}.md` | — | no |
| 7 | `R2-01.D5` | `docs/dev/{saves-and-options,options-rebinding-and-accessibility,debug-and-replays,extra-modes-and-replays,front-end-and-attract}.md`, `docs/client/extra-modes-and-replays.md` | — | no |
| 8 | `R2-01.D6` | `docs/dev/{platform-polish,build-test-deploy}.md`, `docs/client/{desktop-app,outstanding-work}.md`, `apps/electron/README.md` | — | no |
| 9 | `R2-01.D7` (queued: the first free slot) | `docs/dev/{scenes-and-ui,zones-h-and-i,campaign-and-bonus-stages}.md` | — | no |

- **Slots:** 8 builders. Lane 1 runs only if `R2-01.F1` is open; then lane 9 waits for the first free slot.
- **Reviews:** slot 1 = `R2-01.DR` (the docs review loop); slot 2 = `R2-02.P0.RV`, then `R2-02.P1.RV`.
- **Docs item:** this wave *is* docs; `R2-01.D1` holds PLAN and closes the wave's §17 row and the board.
- **e2e:** only `R2-01.F1`.

## Rules for this wave

- **D1 … D7 never touch code or tests.** They describe R2-01 as built at `bc8e05d` (plus `R2-01.F1` if it lands).
  Their single input list is [`handoffs-w4.md`](handoffs-w4.md) (the hand-offs of every wave-4 report, grouped by
  target file) and the facts named in each block; every number they write is checked in the code first.
- **Docs files are disjoint**: one D agent per file. A D agent that finds a needed change in another D's file puts
  it in its report; the orchestrator gives it to that agent or its fixer.
- **Builders and docs agents do not block each other**: `R2-02.P0` / `P1` change code and a new test folder only.
- **`R2-02.P0` pushes first and alone among R2-02 work** (nothing else of R2-02 exists yet in this wave); `P1`
  starts after P0 is on master.
- Nothing in this wave changes `content/`, a golden, a demo, `test/fixtures/v1-baseline/` or a fingerprint `PINNED`
  table.

## Subtasks

### R2-01.F1 — Master's e2e shard 1 green (only if wave 0 left it open)

- **Wave / lane / order:** wave 1, lane 1, first. Skip this block when wave 0's exit says the triage is closed.
- **Depends on:** nothing.
- **Goal:** the three CI-only e2e failures pass on CI's 4 cores, for a named reason, so ten agents do not verify
  against a red master.
- **Files (only these; checked on `bc8e05d`):**
  - `test/e2e/campaign-run.spec.ts` — `:241` (zone B's `clearZone` stays `game`; the god-mode run expects atlas pages
    `0,2`) and `:355` (the same run on the Tizen build);
  - `test/e2e/debug-tools.spec.ts` — `:233` (Tizen: after the debug unlock and remote 4, `frameAdvance` is `false`);
  - app or shell source only if the cause is a real bug — then report it first and wait for the orchestrator.
- **Steps:**
  1. Reproduce: `taskset -c 0-3 env E2E_WORKERS=2 bash docs/v2-run/helpers/e2e-batch.sh campaign-run.spec.ts
     debug-tools.spec.ts` (background + poll), three times.
  2. Read what the poll waits for. A poll that can never come true is a bug in the test or the game, not slowness.
  3. Fix the cause; rerun step 1 three times.
- **Tests (targeted, run all of them):**
  ```bash
  taskset -c 0-3 env E2E_WORKERS=2 bash docs/v2-run/helpers/e2e-batch.sh campaign-run.spec.ts debug-tools.spec.ts
  bash docs/v2-run/helpers/e2e-batch.sh campaign-run.spec.ts debug-tools.spec.ts flight.spec.ts
  ```
- **Acceptance:** all three tests pass three times in a row under `taskset -c 0-3`; the cause is written in the
  commit body; no timeout raised without a cause.
- **Token:** none.
- **Traps:** never gate or skip these tests to get green; never raise a timeout blindly; e2e steps exact ticks
  (`test/e2e/frame-advance.ts` `freezeSim` / `stepTo`), never rAF frames.
- **Docs needs:** if the cause is a lasting e2e rule, a line for `docs/dev/build-test-deploy.md` (to `R2-01.D6`).

### R2-02.P0 — `WORLD_SCALE` (1) and `WORLD_TOP_PAD` (0), neutral

- **Wave / lane / order:** wave 1, lane 2, first; **push it alone** before any other R2-02 work (about 30 minutes).
- **Depends on:** nothing.
- **Goal:** add the two world-scale constants every later R2-02 prep subtask writes its values with, at their v1
  values, so nothing moves today. Decision W5-1: world values in code are `v1 * WORLD_SCALE` (+ `WORLD_TOP_PAD` for an
  absolute world y); R2-02's port commit flips them to `3 / 2` and `36`.
- **Files (only these; checked on `bc8e05d`):**
  - `packages/core/src/config/index.ts` — after `ART_SCALE` (`:825`): `export const WORLD_SCALE: number = 1;` and
    `export const WORLD_TOP_PAD: number = 0;`, each with a docblock: "the world's scale relative to v1 (plan §2.6,
    R-D2): 1 until R2-02's port, then 3/2; world lengths, speeds, radii and accelerations in code are
    `v1 × WORLD_SCALE`" and "the §2.6 top pad (0 until R2-02's port, then 36), added to an absolute world y; a y
    above the top edge (y < 0) takes `K·y` only; frame-anchored values read neither";
  - `packages/core/src/index.ts` — export both next to `ART_SCALE` in the config block (`:140-155`);
  - `packages/core/test/config/frame-constants.test.ts` — import both; add both to `FRACTIONAL` (`:79`) so the "every
    constant a positive whole number" case (`:102`) skips them; a rational check like `ART_SCALE`'s (`:109`) for
    `WORLD_SCALE` (positive, a small denominator, `WORLD_SCALE * 2` whole); `WORLD_TOP_PAD` a whole number ≥ 0; and
    `it.runIf(WORLD_SCALE !== 1)('PLAYFIELD_H is 200·WORLD_SCALE + WORLD_TOP_PAD', …)`;
  - `scripts/frame.mjs` — a pinned mirror `export const WORLD_SCALE = 1;` with a docblock, and `SPAWN_LEAD` (`:85`)
    becomes `PLAYFIELD_W + 16 * WORLD_SCALE` (656 today, unchanged);
  - `test/scripts/frame.test.ts` — add `WORLD_SCALE: core.WORLD_SCALE` to `MIRRORED` (`:35-47`; the case "exports
    exactly the mirrored constants and the capture scale" then holds).
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/config packages/core/test/index.test.ts packages/core/test/frame-literals.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/frame.test.ts test/integration/frame-literals-repo.test.ts test/scripts/content/tiled-import-edge.test.ts test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  pnpm --filter @shmup/core typecheck && pnpm typecheck:root
  ```
- **Acceptance:** all green; the three fingerprints green **unedited**; `SPAWN_LEAD` still 656 (pinned against
  `core.DEFAULT_SPAWN_SCREEN_X` by `test/scripts/frame.test.ts:46` and at `test/scripts/content/tiled-import-edge.test.ts:182`).
- **Token:** CORE-CONFIG.
- **Traps:**
  - **The TS2367 trap:** declare both as `: number`. A literal type `1` makes every later `WORLD_SCALE === 3 / 2` or
    `WORLD_SCALE !== 1` comparison a type error at one of the two scales.
  - `1` and `0` are not banned frame numbers, so the frame-literal scans need no new entry; do not add one.
  - Neutral: nothing reads the constants yet except `SPAWN_LEAD`, whose value stays 656.
- **Docs needs (report them):** `docs/dev/api-reference.md` (two rows), `docs/dev/conventions.md` (world values are
  written `v1 * WORLD_SCALE`) — both go to wave 5's docs.

### R2-02.P1 — The port kit `test/port-v2/` (two-scale check + hand-fix patch)

- **Wave / lane / order:** wave 1, lane 2, after `R2-02.P0` is on master.
- **Depends on:** `R2-02.P0` on master.
- **Goal:** one committed, re-runnable tool that every R2-02 prep subtask uses to prove its tests at **both** scales:
  `two-scale.sh` builds a throwaway tree in which the content is ported ×1.5 and the code is flipped exactly as the
  port commit (R2-02.S, wave 4) will flip it. Decision R2-N1: the kit is committed (so every worktree runs the same
  version and reviewers can read the hand fixes) and R2-02.S deletes it.
- **Files (only these; "new" = create):**
  - `test/port-v2/two-scale.sh` (new) — usage `bash test/port-v2/two-scale.sh [--keep|--reuse <dir>] -- <cmd…>` and
    `bash test/port-v2/two-scale.sh apply`. Without `apply` it:
    1. `git worktree add --detach <tmp>` at the caller's `HEAD` (the caller commits locally first; uncommitted edits
       are not in the tree — say so in the usage text);
    2. `pnpm install --frozen-lockfile --prefer-offline && pnpm assets` in `<tmp>`;
    3. runs the tool for real: `node scripts/content/rescale.mjs --factor 1.5 --top-pad 36 --from-width 384
       --from-height 200 --tile-size 8 --to-width 640 --art-scale 1.5` (the four v1 geometry flags are required since
       the flip; without them the tool reports 28 errors);
    4. `git apply test/port-v2/handfix.patch` (content only);
    5. the code flip, as exact string replacements that must each match **exactly once** or the script exits 1 with
       the failing pattern: `WORLD_SCALE: number = 1` → `3 / 2` and `WORLD_TOP_PAD: number = 0` → `36` in
       `packages/core/src/config/index.ts`; the `WORLD_SCALE` mirror in `scripts/frame.mjs`; the **15 frame-unit
       literal defaults** of `packages/core/src/behaviors/index.ts` (below);
    6. the port-pending stub (below);
    7. runs `<cmd…>` in `<tmp>`, keeps its exit code, then `git worktree remove --force <tmp>` (unless `--keep`;
       `--reuse <dir>` reuses a kept tree and skips steps 1–6).
    `apply` makes the changes of steps 3–6 in the current tree, in that order (only R2-02.S runs it, in wave 4).
  - `test/port-v2/handfix.patch` (new) — content only, made against the tool's output on master (run steps 1–3 with
    `--keep`, edit, `git diff` in the kept tree). It holds decision W5-7's fixes and A5 review 2's:
    - `content/stages/gimmick-range.stage.json`: trigger `events[8]` (flag `took-low`) gets `until` 2275, below the
      falling rock's ported 2276;
    - `content/stages/zone-g.stage.json`: `events[15]` back inside `events[14]`'s `ground` bonus window (x ≥ 3450;
      the port puts it at 3446);
    - `content/stages/hunter-range.stage.json` (or its path in `content/paths/`): the dive's first path leg +36 px,
      so the hunter that enters from above lands where v1's did (×1.5 + 36);
    - `content/enemies/advanced-bosses.enemies.json` `captain-circler` (`:78`): its home x 530 (`cx + rx` of its orbit;
      the port's end-anchored 562 would make it jump at its start);
    - `content/stages/zone-g.stage.json` tilemap: zone G's rising crystal walls one row up, so they cross the
      playfield's middle row (`floor(PLAYFIELD_H / 2 / 12)` = 14; ported they start on row 15 —
      `test/integration/content.test.ts:1659`'s PRISM LABYRINTH case needs 6 walls there).
- **The 15 frame-unit literal defaults** (`packages/core/src/behaviors/index.ts`, lines at `bc8e05d`): `orbiter.loop`
  `x: 256` / `y: 100` (`:568-569`); `cube.pincer` `meetX: 176` (`:703`); `rear.swoop` `turnX: 280` (`:1031`);
  `captain.ram` `ramX: 40` (`:1613`); `captain.crab` `minX: 250`, `maxX: 340`, `minY: 40`, `maxY: 160`
  (`:1749-1752`); `boss.widow` `minX: 250`, `maxX: 320`, `minY: 56`, `maxY: 144` (`:2021-2024`); `boss.walker`
  `frontX: 96` / `backX: 280` (`:3158-3159`). Their units are `screen-x` / `screen-y` (check each in
  `packages/core/src/behaviors/units.ts` `BEHAVIOR_PARAM_UNITS`). Compute each v2 value with core's
  `rescaleNumber(unit, v1, options)` (`packages/core/src/data/units.ts:265`, the same options the tool passes:
  v1 geometry 384×200 / 8-px tiles → 640×336, factor 1.5, pad 36) and write the replacement with the full line
  context, so it matches once (two `minX: 250` lines exist).
- **The stub** (`packages/core/test/helpers/port-pending.ts`): `:57-59` becomes `export const CONTENT_PORT_PENDING:
  boolean = false;`, and the import-time call `checkPortPendingExpiry(FRAME_W, CONTENT_PORT_PENDING);` (`:76`) is
  removed. Keep all six exports (`shippedTileSizes`, `CONTENT_PORT_PENDING`, `checkPortPendingExpiry`,
  `PORT_PENDING_REASON`, `describePortPending`, `itPortPending`) and keep `checkPortPendingExpiry` itself unchanged —
  `port-pending.test.ts` calls it. Without the stub the real module throws at import in the ported tree and about 30
  test files fail to load.
- **Tests (targeted, run all of them):**
  ```bash
  bash test/port-v2/two-scale.sh -- node scripts/content/rescale.mjs --factor 1 --dry-run
  bash test/port-v2/two-scale.sh -- pnpm content:check
  bash test/port-v2/two-scale.sh -- env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/config
  bash -n test/port-v2/two-scale.sh
  ```
- **Acceptance:**
  - the tool's real run writes 4,035 changes in 77 files (0 unclassified, 0 errors);
  - the identity run (`--factor 1 --dry-run`) in the kit tree reports **exactly** the 3 IRON LEVIATHAN
    `parts[4|8|12].x` errors (576 / 576 / 540 against the fixed ±512 bound) until `R2-02.W5` widens the bound
    (wave 2), then 0 / 0 / 0;
  - every flip replacement matches exactly once; the script fails loudly otherwise;
  - `content:check` under the kit: record which cases fail and which subtask owns each (by id) in the report;
  - your own tree is unchanged after a run (`git status` clean).
- **Token:** KIT (`test/port-v2/**`): P1 creates it. In waves 2–3 only `R2-02.T3` edits `handfix.patch`; other agents
  report kit bugs to the orchestrator, who sends a small fix agent that takes KIT.
- **Traps:**
  - the kit only ever resets its **own** throwaway tree; never run `git checkout -- content`, `git stash` or a
    content edit in your own tree;
  - **no content file may change on master before the port** (wave 4), or `handfix.patch` stops applying;
  - the frame-literal scans skip `test/` and `.sh` files, but write no frame number in the script anyway: read them
    from the tool's output;
  - `apply` must be the exact same steps as the throwaway mode (S runs it; a reviewer diffs the two).
- **Docs needs:** none (the kit is deleted by the port commit; `test/README.md` gets no row).

## Docs subtasks (the R2-01 docs pass)

Every D block below: read [`handoffs-w4.md`](handoffs-w4.md) (its section for your files), then the code it names;
write only what holds at HEAD. Wording: plain, short sentences; keep tables readable; no Prettier for Markdown.
Tests for docs: none unless the block names one. Push with a `docs:` subject.

### R2-01.D1 — The plan and the changelog (`W01.DOCS-A`, holds PLAN)

- **Wave / lane / order:** wave 1, lane 3, first; it closes the wave (its last push updates §17 and the board).
- **Depends on:** nothing for the draft; its §17 change waits for `R2-01.DR` at zero and `R2-01.F1` (if open).
- **Goal:** R2-01's As built in the plan, its decisions in §1, the notes later steps need, and the CHANGELOG entries.
- **Files (only these):** `plan_resolution.md`, `CHANGELOG.md`.
- **Steps:**
  1. **R2-01 As built** (under `### R2-01`): the flip `72b18a1` (640×360, 12-px HUD and tiles, `ART_SCALE` 3/2,
     `uiPx`, replay format 2, save version 3, Electron window state v2, the interim ×1.5 art with native terrain,
     `ui/pixel` and beams, the 9×12 interim font), the two e2e gates (`test/e2e/gates.ts`: `R2_03_PENDING` with
     `CONTENT_REASON` / `GOLDEN_REASON`, and `PORT_UNMEASURED` with `PORT_REASON`, from `293e885`), the self-expiring
     gates `CONTENT_PORT_PENDING` / `GOLDENS_STALE`, and the **corrected** causes from `handoffs-w4.md`: the
     content-DB fingerprint's `core.stages` move comes only from the map widths (`terrain.cols` +32 and 32 empty
     columns in the 17 terrain stages); the presentation fingerprint's 3 screen-hash moves come from the story crawl
     and credits running longer (1,046 → 1,074 and 1,989 → 2,059 frames); `es.options` / `es.game` move from both
     the HI rule and the es title-cursor fix.
  2. **§1 register:** rows W4-1 … W4-14 ([`decisions.md`](decisions.md) has them), with "R2-01" in "Applies to".
  3. **Notes for later steps** (into R2-02's and R2-03's sections, as `- **Notes from R2-01:**` bullets): from
     `handoffs-w4.md` — rescale's four required v1 flags and `--art-scale 1.5`; the 3 IRON LEVIATHAN errors (W5-8);
     zone G's rising walls (a hand fix); `replay-version-shipped.test.ts` deleted with `stale.ts` in R2-03;
     `docs/images/logo.png` regenerated in R2-03; both e2e gates deleted in R2-03; the builds' sizes after the flip
     (Tizen `app.js` 379.9 KB gzip of 512, dist 1,741.2 KB; webOS 379.6 KB); the e2e shards' ~6 minutes at 640.
  4. **CHANGELOG** `## [Unreleased] — v2`: R2-01 entries (player-visible: the 640×360 frame, interim art, v1 replays
     refused as "V1 REPLAY", v1 hi-scores archived; developer: the constants, the gates).
  5. **§17:** R2-01 → `done (owner parts pending) — <date>` (owner parts: the M7 interim look, W3-7), then run
     `python3 .claude/plan_board_v2.py` (it reads §17 from `origin/master`, so push first).
- **Tests:** none (Markdown). Check `grep -n "^| R2-01 |" plan_resolution.md` shows the new status.
- **Acceptance:** every hand-off line of `handoffs-w4.md` marked for the plan or the CHANGELOG is either written or
  listed in the report as "not applicable, because …"; the board synced.
- **Token:** PLAN.
- **Traps:** never edit another §17 row; never add a table row whose first cell is a step id outside §17 (the board
  script reads every `| R<n>-<nn> | … |` row of the file as a status).

### R2-01.D2 — Frame truth and the conventions

- **Wave / lane / order:** wave 1, lane 4.
- **Depends on:** nothing.
- **Goal:** the project's rules describe the 640×360 code as built.
- **Files (only these):** `CLAUDE.md`, `docs/dev/conventions.md`, `docs/dev/repo-layout.md`, `test/README.md`,
  `scripts/README.md`.
- **What to write (each checked in the code):**
  - `CLAUDE.md`: the bullet "**Today the code still runs at 384×216.** …" (`:17`) becomes the 640×360 truth (R2-01
    flipped the constants; the literal scans now ban 640 / 360 / 336 / 348 too). Keep the rest of the v2 section; if
    the driver-prompt writer already changed that line, only check it.
  - `conventions.md` § Frame numbers: the frame constants' current values (640 / 360, `HUD_BAR_HEIGHT` 12,
    `HUD_BOTTOM_Y` 348, `TILE_SIZE` 12, `GLYPH_W` / `GLYPH_H` / `LINE_H` 9 / 12 / 15 = the font file × `ART_SCALE`);
    the panel rule (`:98`, "Panel widths and heights sized by their 6×8 text stay literal") is replaced — panel sizes
    now derive from `GLYPH_*` and `uiPx`; the scanner skips long hex colours (`#rrggbb` / `#rrggbbaa`); the
    allow-lists hold **32 repo / 14 core** entries (the doc says 22 at `:138`); the banned set includes
    640 / 360 / 336 / 348; the two e2e gates and `test/integration/e2e-gates.test.ts`.
  - `repo-layout.md`: the lines that still say 384×216 for the render target or the frame.
  - `test/README.md`, `scripts/README.md`: rows for files R2-01 added or changed (`test/e2e/gates.ts`,
    `test/e2e/save-format.ts`, `test/integration/e2e-gates.test.ts`, `e2e-save-format.test.ts`, the replay v1
    fixture), if missing.
- **Tests:** none.
- **Acceptance:** `grep -n "22 entries\|still runs at 384" CLAUDE.md docs/dev/conventions.md` is empty.
- **Token:** none.

### R2-01.D3 — The API reference and the package READMEs

- **Wave / lane / order:** wave 1, lane 5.
- **Depends on:** nothing.
- **Files (only these):** `docs/dev/api-reference.md`, `packages/core/README.md`, `packages/render-pixi/README.md`,
  `packages/shell/README.md`.
- **What to write:** rows for `ART_SCALE` (3/2), `uiPx` (`core/ui`, `⌈v·ART_SCALE⌉`), `ReplayVersionError`,
  `ReplayStoreResult.Legacy` (`core/replay/run.ts:669`), `SaveData.legacyScores`, `SAVE_VERSION` 3, the Electron
  window state v2, `buildAtlas` / `collectSprites` `artScale`, `SpriteDef.native`, `CREDITS_ROW_HEIGHT` /
  `STORY_ROW_HEIGHT` = `LINE_H + uiPx(1)` (`scenes/index.ts:1657`, `:7659`), `PREVIEW_SHIP_X` = `FRAME_CX + uiPx(40)`
  (`:5782`), the campaign line caps **47 / 67** (the rows near `api-reference.md:312` and `:318` still give the old
  formulas; the code derives them from the text panels: `data/campaign.ts:151`, `:163`, `:185`),
  `TEXTURE_BUDGET_BYTES` 23 MiB at 640×360; D19 / D20 marked superseded by R-D1 / R-D3 where this file quotes them.
- **Tests:** none.
- **Acceptance:** every new R2-01 export of the core barrel has a row (`git diff d4de048 bc8e05d --
  packages/core/src/index.ts` lists them).
- **Token:** none.

### R2-01.D4 — Art and rendering docs

- **Wave / lane / order:** wave 1, lane 6.
- **Files (only these):** `docs/dev/asset-pipeline.md`, `docs/dev/rendering-and-shell.md`,
  `docs/dev/presentation-polish.md`, `docs/dev/visual-and-mechanic-extras.md`.
- **What to write:** the interim ×1.5 stage (nearest-neighbour `⌈1.5·w⌉`, anchors `⌈1.5·a⌉`); the native sources the
  interim stage never upscales (terrain tilesets, `ui/pixel`, the laser beams — 12 frames of 6×12, frame k is k+1
  rows); the 9×12 interim font (the 6×8 file × 3/2, line 15); the upscale ×3 on 1080p and ×2 on 720p; the CRT pitch
  3; the TV bench decode pages are ×1.5 since the flip, so R0-03 rows before and after the flip are not like for like;
  the R3 hand-off on `artScale: 1` builds (from `handoffs-w4.md`); D19 / D20 marked superseded (the render target
  640×360, the 12-px HUD bars; `rendering-and-shell.md:30`, `:33`, `:95`, `:214` still say 384×216 / D20 numbers).
- **Token:** none.

### R2-01.D5 — Saves and replays docs

- **Wave / lane / order:** wave 1, lane 7.
- **Files (only these):** `docs/dev/saves-and-options.md`, `docs/dev/options-rebinding-and-accessibility.md`,
  `docs/dev/debug-and-replays.md`, `docs/dev/extra-modes-and-replays.md`, `docs/client/extra-modes-and-replays.md`,
  `docs/dev/front-end-and-attract.md`.
- **What to write:** save format 3 (`SAVE_VERSION` 3, `packages/core/src/save/index.ts:119`), `legacyScores` (W4-8:
  no UI in R2-01; Steam achievements read `hiScores ∪ legacyScores`), W4-13 (v1 hi-score tables archived, v2 starts
  empty), W4-14 (a v1.x build reading a v3 save falls back to defaults, the old text kept under `save.corrupt`);
  replay format 2, the refusal (`ReplayVersionError`), the "V1 REPLAY" row and "RECORDED BY V1: CANNOT PLAY", delete
  only (W4-7); the web app's v1-paste notice; the attract loop skips refused demos (W4-9) until R2-03 re-records them.
- **Token:** none.

### R2-01.D6 — Hosts and build docs

- **Wave / lane / order:** wave 1, lane 8.
- **Files (only these):** `docs/dev/platform-polish.md`, `docs/client/desktop-app.md`, `apps/electron/README.md`,
  `docs/dev/build-test-deploy.md`, `docs/client/outstanding-work.md`.
- **What to write:** window state v2 (`scale′ = max(1, round(scale × 384 / 640))`, W4-10), the default ×2 = 1280×720,
  max ×6, and the note on pre-flip dev builds (from `346c430` until the flip a dev `window.json` v2 counted 384-px
  frames; a flipped build reads it as 640-px frames — only local pre-flip dev builds; released v1 writes version 1,
  converted correctly); the Tizen and webOS sizes after the flip (`app.js` ≈ 380 KB gzip of 512); the e2e viewport
  1280×720 and the ~6-minute CI shards (e2e is about ×1.8 slower per test at 640); the owner's interim look on the M7
  and W3-7 under outstanding work.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/e2e-docs.test.ts
  ```
  (it reads `build-test-deploy.md`: the CI table must keep listing every `pnpm` command `ci.yml` runs).
- **Acceptance:** `e2e-docs.test.ts` green.
- **Token:** none.

### R2-01.D7 — Scenes and UI docs

- **Wave / lane / order:** wave 1, lane 9 (the first slot that frees).
- **Files (only these):** `docs/dev/scenes-and-ui.md`, `docs/dev/zones-h-and-i.md`,
  `docs/dev/campaign-and-bonus-stages.md`.
- **What to write:** the layout section (panels no longer literal; picture scenes scaled by `uiPx` / `uiOffsets`);
  the campaign line caps are **47 / 67**, derived from the text panels (`scenes-and-ui.md:363-366` still says
  "55 / 68"; `zones-h-and-i.md:432-433` too); `SCROLL_HALVES` (the story crawl and the credits keep their v1 duration
  at 640; `SCROLL_HALVES` = 2 brings back the slow crawl); the title HI-line rule (shown where v1 showed it, hidden
  only under Options and difficulty).
- **Token:** none.

## Reviews

### R2-01.DR — Review of the docs pass

- **Wave / order:** review slot 1, as D pushes land; then a final pass over all seven.
- **What to read:** `git log --oneline <wave base>..origin/master -- '*.md'` and each diff.
- **Must hold:** every number and path in the new text matches the code at HEAD (spot-check at least 10 per agent
  with `git grep`); no doc still says "22 entries", "still runs at 384×216" or "55 / 68"; every item of
  `handoffs-w4.md` for these files is written or explained; no code, test or content file changed; tables readable.
- **Report:** findings with severity (blocker / should-fix / nit). Zero findings means zero nits. Fixes go to a
  fixer (the D agent's own files), then a **new** reviewer.

### R2-02.P0.RV — Review of `WORLD_SCALE` / `WORLD_TOP_PAD`

- **Must hold:** both typed `number`; docblocks as P0 says; the barrel exports them; `scripts/frame.mjs` mirror
  pinned by `test/scripts/frame.test.ts`; `SPAWN_LEAD` still 656; the three fingerprints unedited and green; no
  allow-list entry added; P0's test commands green when re-run.

### R2-02.P1.RV — Review of the port kit

- **Must hold:** the throwaway mode and `apply` make the same changes (run both on scratch trees and `git diff
  --no-index` them); every flip replacement matches once (break one pattern locally and see the script fail); the
  15 v2 defaults equal `rescaleNumber` of the v1 values (recompute two by hand); `handfix.patch` touches `content/`
  only and applies cleanly to a fresh tool output; the identity dry run shows exactly the 3 expected errors; the
  stub keeps all six exports.

## Exit check

1. `R2-01.DR` at zero findings; `R2-02.P0.RV` and `R2-02.P1.RV` at zero.
2. `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/e2e-docs.test.ts
   test/scripts/frame.test.ts test/integration/frame-literals-repo.test.ts test/integration/presentation-fingerprint.test.ts
   test/integration/content-db-fingerprint.test.ts` and `--project core packages/core/test/config
   packages/core/test/frame-literals.test.ts` green on `origin/master`.
3. `bash test/port-v2/two-scale.sh -- node scripts/content/rescale.mjs --factor 1 --dry-run` reports exactly the 3
   IRON LEVIATHAN `parts[].x` errors.
4. `git diff <wave base>..origin/master -- content test/golden/*.replay.json content/demos test/fixtures/v1-baseline`
   is empty.
5. §17's R2-01 row says `done (owner parts pending)`; `python3 .claude/plan_board_v2.py` ran after the push.
6. Deferred to wave 15: nothing new.

## Owner (Manual) — never blocks this wave

- Look at the interim 640×360 build on the M7 (`pnpm --filter @shmup/tizen build:dev`; R2-01's Manual list).
- W3-7: check that the M7 boots to the title (the atlas manifest fetched by XHR from `file://`).
