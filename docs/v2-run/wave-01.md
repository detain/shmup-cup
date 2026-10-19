# Wave 1 — the R2-01 docs pass ∥ R2-02's opening (`WORLD_SCALE`, the port kit)

> Schedule: `plan_resolution.md` §18 · how to use: [`README.md`](README.md) · decisions: [`decisions.md`](decisions.md)
>
> **Run directory:** `RUN_DIR` is `/home/sites/shmup-cup-run` (README common rule 15). The commands below spell the
> path out, so each one runs as typed in a fresh shell; prose that says `RUN_DIR/…` means the same path.
>
> **Wave base:** when this wave's first agent starts, the orchestrator records the wave's base (the
> `origin/master` SHA at that moment) once, in the main checkout, and notes it in `RUN_DIR/lanes-<wave>.md` too
> (README step 5):
> `git fetch origin && git rev-parse origin/master > /home/sites/shmup-cup-run/w01-base.txt`.
> Every command below that diffs against the wave base reads that file, `$(cat /home/sites/shmup-cup-run/w01-base.txt)`;
> an agent's prompt may carry the SHA itself instead, never a placeholder.

**Steps:** R2-01 (docs pass, and `R2-01.F1` if wave 0 left it open) · R2-02 (P0, P1) · **Gate to start:** wave 0
closed (the C5 review loop at zero: [`wave-00.md`](wave-00.md)'s status line reads `**Status: closed**`), or its
open item handed over as `R2-01.F1` (lane 1 and `R2-01.F1.RV` then start first) · **Exit (summary):** the docs review
at zero findings; §17 R2-01 → `done (owner parts pending)` on master (the orchestrator then syncs the board); the
F1 loop (if it ran) at zero and `wave-00.md` closed; `WORLD_SCALE` / `WORLD_TOP_PAD` and the port kit on master,
reviewed to zero.

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| 1 | `R2-01.F1` (only if `wave-00.md` reads `**Status: open**`; fix rounds of `R2-01.F1.RV`'s findings) | `test/e2e/{campaign-run,debug-tools,flight,raster}.spec.ts`, the e2e files of the C5 fixes since `c67c7c9` (block) | — | **yes** |
| 2 | `R2-02.P0` → `R2-02.P1` | `packages/core/src/config/index.ts`, barrel, `scripts/frame.mjs`, `test/scripts/frame.test.ts`; then `test/port-v2/**` (new) | CORE-CONFIG and E2E-MIRROR (P0), then KIT | no |
| 3 | `R2-01.D1` (= `W01.DOCS-A`) | `plan_resolution.md`, `CHANGELOG.md` | **PLAN** | no |
| 4 | `R2-01.D2` | `CLAUDE.md`, `docs/dev/conventions.md`, `docs/dev/repo-layout.md`, `test/README.md`, `scripts/README.md` | — | no |
| 5 | `R2-01.D3` | `docs/dev/api-reference.md`, `packages/{core,render-pixi,shell}/README.md` | — | no |
| 6 | `R2-01.D4` | `docs/dev/{asset-pipeline,rendering-and-shell,presentation-polish,visual-and-mechanic-extras}.md` | — | no |
| 7 | `R2-01.D5` | `docs/dev/{saves-and-options,options-rebinding-and-accessibility,debug-and-replays,extra-modes-and-replays,front-end-and-attract}.md`, `docs/client/extra-modes-and-replays.md` | — | no |
| 8 | `R2-01.D6` | `docs/dev/{platform-polish,build-test-deploy}.md`, `docs/client/{desktop-app,outstanding-work}.md`, `apps/electron/README.md` | — | no |
| 9 | `R2-01.D7` (queued: the first free slot) | `docs/dev/{scenes-and-ui,zones-h-and-i,campaign-and-bonus-stages}.md` | — | no |

- **Slots:** 8 builders. Lane 1 runs only while wave 0 is open, and then it takes the first slot; lane 9 waits for
  the first free slot.
- **Reviews:** slot 1 = `R2-01.DR` (the docs review loop); slot 2 = `R2-01.F1.RV` first (only while wave 0 is open),
  then `R2-02.P0.RV`, then `R2-02.P1.RV`.
- **Docs item:** this wave *is* docs; `R2-01.D1` holds PLAN and closes the wave's §17 row (the orchestrator then runs
  the board sync).
- **e2e:** only `R2-01.F1` and `R2-01.F1.RV`, one after the other (never at the same time).

## Rules for this wave

- **D1 … D7 never touch code or tests.** They describe R2-01 as built on `origin/master` when the D agent starts —
  `c67c7c9` plus the C5 review-3 fixes `8ff2bf6`, `543887b`, `0cabaec`, `424afd7` and `b0dede1`, plus every later C5
  fix and `R2-01.F1`, if they land (this lists the later ones:
  `git log --oneline b0dede1..origin/master -- test/e2e test/integration/e2e-ticks.test.ts`). Their inputs are
  [`handoffs-w4.md`](handoffs-w4.md) (the hand-offs of every report of the old run's wave 4 — R2-01's lanes —,
  grouped by target file; since `b49703a` it also has C5 review 2 and C5 fix 2 `c67c7c9`: the "C5 review 2" bullet
  under R2-01's As built, § docs/dev/conventions.md "Tests: e2e waits count ticks", Appendix A (d)), the commit
  messages of `c67c7c9`, C5 fix 3 `8ff2bf6`, C5 fix 4 `543887b`, C5 fix 5 `0cabaec` and the later `424afd7` /
  `b0dede1` (`git show -s c67c7c9 8ff2bf6 543887b 0cabaec 424afd7 b0dede1`) and of every later C5 fix
  (`git log --format='%h %s%n%n%b' b0dede1..origin/master -- test/e2e test/integration/e2e-ticks.test.ts`), and the
  facts named in each block; every number they write is checked in the code first.
- **Docs files are disjoint**: one D agent per file. A D agent that finds a needed change in another D's file puts
  it in its report; the orchestrator gives it to that agent or its fixer.
- **Builders and docs agents do not block each other**: `R2-02.P0` / `P1` change code and a new test folder only.
- **`R2-02.P0` pushes first and alone among R2-02 work** (nothing else of R2-02 exists yet in this wave); `P1`
  starts after P0 is on master.
- **Pushes:** every builder, docs agent and fixer of this wave pushes its own task to `master` (Common rule 5);
  review agents never push. This wave has no zone lane (local branch) and no patch-only subtask.
- Nothing in this wave changes `content/`, a golden, a demo, `test/fixtures/v1-baseline/` or a fingerprint `PINNED`
  table.

## Subtasks

### R2-01.F1 — Finish wave 0: C5 review 4 of the fixes since `c67c7c9` (and its later rounds) to zero (only if `wave-00.md` still reads `**Status: open**`)

- **Wave / lane / order:** wave 1, lane 1, first: it takes the first slot. Skip this block (and `R2-01.F1.RV`) when
  [`wave-00.md`](wave-00.md)'s status line reads `**Status: closed**`.
- **How the loop runs:** C5 fix 2 (`c67c7c9`) already fixed the three CI-only failures and the flight flake. C5
  review 3 then found 3 should-fix items and 1 nit (review 2's flake patterns in sibling specs), and C5 fix 3
  `8ff2bf6` fixed them: one shared tick helper `test/e2e/ticks.ts` (its mirrors pinned to core by
  `test/integration/e2e-ticks.test.ts`), used by ten specs. C5 fix 4 `543887b` finished that list: every boot wait
  takes `{ timeout: BOOT_TIMEOUT_MS }`, and the ship fly-in and item polls count ticks (`SHIP_ENTER_TICKS`). C5 fix 5
  `0cabaec` made `rebind.spec.ts`'s taps and pauses count ticks (the slow-host repro), and `424afd7` / `b0dede1` did
  the same for the menu specs' taps (`options`, `game-options`, `scenes`, `release-check`, `weapon-select`,
  `display-options`, `bullet-palette`). Later C5 fixes may be on master before this wave starts (this lists them:
  `git log --oneline b0dede1..origin/master -- test/e2e test/integration/e2e-ticks.test.ts`); F1 treats each one like
  these.
  C5 review 4 of these fixes (and its later rounds) follows, with the slow-host runs (the third and fourth commands
  under **Tests**) and the myadmin1 run (the first two). F1 verifies all of it and closes the loop:
  1. **review** — `R2-01.F1.RV` (below), a fresh read-only review of `c67c7c9`, `8ff2bf6`, `543887b`, `0cabaec`,
     `424afd7`, `b0dede1` and any later C5 fix against [`handoffs-w4.md`](handoffs-w4.md) (the "C5 review 2" bullet
     under R2-01's As built, and Appendix A (d)), with the four e2e runs under **Tests**. If the owner hands over a
     finished C5 review report (review 4 or later) with findings, that report is the first round instead;
  2. **fix** — this block, `R2-01.F1`: one fix agent for the round's findings (only when there are findings);
  3. a **new** `R2-01.F1.RV`, and so on, until a review reports zero findings, nits included, and the four e2e runs
     are green.
     Then the orchestrator rewrites `wave-00.md`'s status line to `**Status: closed** — <date>, <the zero review>`.
- **Depends on:** a review round with findings: the newest C5 review report (review 4 or later) — from the owner, or
  the newest `r2-01C5-review*.md` under `/home/sites/shmup-cup/.claude/orchestrator/scratchpad/` on myadmin1 (with
  the newest `w4-C5-fix*-report.md` beside it) — or `R2-01.F1.RV`'s. Never redo a finding that `8ff2bf6`,
  `543887b`, `0cabaec`, `424afd7` or `b0dede1` already fixed (C5 review 3's), or that a later C5 fix on master
  already fixed (its commit body names the review).
- **Goal:** every finding of that round fixed, so ten agents do not verify against a red master.
- **Files (only these; lines on `543887b`; the reviewer reads them, the fixer may edit them):**
  - `test/e2e/campaign-run.spec.ts` — `:217` ("A → B → D → F → H: every tally and map, …", the web build; it was
    CI's `:241`) and `:335` (``the remote`s OK skips the tally and launches the next zone``, the Tizen build; CI's
    `:355`);
  - `test/e2e/debug-tools.spec.ts` — `:236` ("Tizen build via file://: after the unlock, 4 freezes and each 5 runs one
    tick"; CI's `:233`);
  - `test/e2e/flight.spec.ts` — `:153` ("arrow keys move the KESTREL; without input it stays put"; the myadmin1 flake
    at `:114`);
  - `test/e2e/raster.spec.ts` — only what a finding names (`c67c7c9` changed its row comment, then `:237-239`, now
    `:240-242`);
  - the files of the C5 fixes since `c67c7c9` (`8ff2bf6`, `543887b`, `0cabaec`, `424afd7`, `b0dede1` and any later
    one) — `test/e2e/ticks.ts`, `test/integration/e2e-ticks.test.ts` and the specs they touched (the `test(R2-01): …
    (C5 review …)` commits of `git log --stat c67c7c9..origin/master -- test/e2e test/integration/e2e-ticks.test.ts`)
    — only what a finding names;
  - app or shell source only if the cause is a real bug — then report it first and wait for the orchestrator.
- **Steps (fix agent):** read the round's findings; for a red run, read what the poll waits for — a poll that can
  never come true is a bug in the test or the game, not slowness; fix; run the commands under **Tests**.
- **Tests (on myadmin1, under the lock; `--retries=0` because the helper sets `CI=1`, which gives each test one retry
  and would hide a flake):**
  ```bash
  # the four specs, 4 repeats, 12 workers — as C5 review 3's myadmin1 run (the flake was first seen at 12 workers in
  # myadmin1's full suite; its 6-of-48 repro was 12 workers pinned to 12 CPUs, taskset -c 0-11)
  E2E_WORKERS=12 bash docs/v2-run/helpers/e2e-batch.sh campaign-run.spec.ts debug-tools.spec.ts flight.spec.ts raster.spec.ts --repeat-each=4 --retries=0
  # CI-like load on 2 CPUs (the test builds are fresh from the first run)
  taskset -c 0-1 env E2E_WORKERS=2 E2E_SKIP_BUILD=1 bash docs/v2-run/helpers/e2e-batch.sh campaign-run.spec.ts debug-tools.spec.ts --repeat-each=2 --retries=0
  # the slow-host run of 8ff2bf6's specs (2 CPUs, 3 repeats)
  taskset -c 0-1 env E2E_WORKERS=2 E2E_SKIP_BUILD=1 bash docs/v2-run/helpers/e2e-batch.sh zone-map.spec.ts frame-layout.spec.ts platform-polish.spec.ts smoke.spec.ts continue.spec.ts front-end.spec.ts extra-replays.spec.ts rebind.spec.ts --repeat-each=3 --retries=0
  # the slow-host run of 424afd7's and b0dede1's specs (2 CPUs, 2 repeats, as their commit bodies); release-check's
  # wall-clock "shows the title in under 3 s" budget is left out, as there and in C5 review 4's run
  taskset -c 0-1 env E2E_WORKERS=2 E2E_SKIP_BUILD=1 bash docs/v2-run/helpers/e2e-batch.sh test/e2e/options.spec.ts game-options.spec.ts display-options.spec.ts scenes.spec.ts release-check.spec.ts weapon-select.spec.ts bullet-palette.spec.ts --repeat-each=2 --retries=0 --grep-invert 'shows the title in under 3 s'
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/e2e-gates.test.ts test/integration/e2e-ticks.test.ts
  ```
  Start each batch in the background and poll its log (Common rule 4). **The fourth run also covers the later C5
  fixes:** when `git log --oneline b0dede1..origin/master -- test/e2e test/integration/e2e-ticks.test.ts` lists any
  commit, run every spec they changed with the fourth command's flags (2 CPUs, `E2E_SKIP_BUILD=1`,
  `--repeat-each=2 --retries=0 --grep-invert 'shows the title in under 3 s'`). `git diff --name-only b0dede1 origin/master -- 'test/e2e/*.spec.ts'` prints them
  as `test/e2e/<name>.spec.ts` paths, which the helper takes as they are (each path selects that spec alone); pass up
  to 10 per batch, one batch after the other.
- **Acceptance:** every finding of the round closed (or answered in the report with its reason); the four e2e runs
  green; the cause of each fix written in the commit body; no timeout raised without a cause; then a new
  `R2-01.F1.RV` at zero findings.
- **Token:** none.
- **Pushes:** the fix agent pushes its own fix to `master` (Common rule 5); the reviewer never pushes.
- **Traps:** never gate or skip these tests to get green; never raise a timeout blindly; e2e waits count game ticks
  (`__shmupDebug.tick`, `test/e2e/frame-advance.ts` `freezeSim` / `stepTo`), never rAF frames or seconds.
- **Docs needs:** if a fix adds a lasting e2e rule, a line for `docs/dev/conventions.md` § Tests (to `R2-01.D2`) and
  `docs/dev/build-test-deploy.md` (to `R2-01.D6`).

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
  - `packages/core/test/config/frame-constants.test.ts` — import both. **Do not add them to the `CONSTANTS` object**:
    its `toEqual` pin (`:82-100`), the "every constant a positive whole number" case (`:102-107`) and `FRACTIONAL`
    (`:79`) stay unchanged. Add three cases of their own: a rational check like `ART_SCALE`'s (`:109`) for
    `WORLD_SCALE` (positive, a small denominator, `WORLD_SCALE * 2` whole); `WORLD_TOP_PAD` a whole number ≥ 0; and
    `it.runIf(WORLD_SCALE !== 1)('PLAYFIELD_H is 200·WORLD_SCALE + WORLD_TOP_PAD', …)`;
  - `scripts/frame.mjs` — a pinned mirror `export const WORLD_SCALE = 1;` with a docblock, and `SPAWN_LEAD` (`:85`)
    becomes `PLAYFIELD_W + 16 * WORLD_SCALE` (656 today, unchanged);
  - `test/scripts/frame.test.ts` — add `WORLD_SCALE: core.WORLD_SCALE` to `MIRRORED` (`:31-47`; the case "exports
    exactly the mirrored constants and the capture scale" then holds). In "holds only whole numbers" (`:66-70`) skip
    `WORLD_SCALE`, and give it a case of its own: positive, and `WORLD_SCALE * 2` whole. The kit and the port make it
    3/2, and a whole-number check would fail there.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/config packages/core/test/index.test.ts packages/core/test/frame-literals.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/frame.test.ts test/integration/frame-literals-repo.test.ts test/scripts/content/tiled-import-edge.test.ts test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  pnpm --filter @shmup/core typecheck && pnpm typecheck:root
  ```
- **Acceptance:** all green; the three fingerprints green **unedited**; `SPAWN_LEAD` still 656 (pinned against
  `core.DEFAULT_SPAWN_SCREEN_X` by `test/scripts/frame.test.ts:46` and at `test/scripts/content/tiled-import-edge.test.ts:182`).
- **Token:** CORE-CONFIG and E2E-MIRROR (`test/scripts/frame.test.ts`).
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
    7. runs `<cmd…>` in `<tmp>`, keeps its exit code, then `git worktree remove --force <tmp>` (unless `--keep`,
       which keeps the tree and prints its absolute path as the script's last output line; `--reuse <dir>` takes
       that printed path, skips steps 1–6, runs `<cmd…>` in the kept tree and leaves the tree in place — its user
       removes it with `git worktree remove --force <dir>` when done).
    `apply` makes the changes of steps 3–6 in the current tree, in that order (only R2-02.S runs it, in wave 4).
  - `test/port-v2/handfix.patch` (new) — content only, made against the tool's output on master (run steps 1–3 with
    `--keep`, edit, `git diff` in the kept tree). It holds decision W5-7's fixes and A5 review 2's:
    - `content/stages/gimmick-range.stage.json`: trigger `events[8]` (flag `took-low`) gets `until` 2275, below the
      falling rock's ported 2276;
    - `content/stages/zone-g.stage.json`: the `facet-turret` spawn (master's `events[15]`, x 2340; the tool re-sorts
      it to `events[14]`, x 3446) back inside the `glimmer-cache` `ground` bonus window (master's `events[14]`;
      `events[15]` in the tool's output, x 3450 … 4650). Give it x ≥ 3450 and move it back **after** the bonus event
      in the file (its order on master): at the same x, file order decides. Indices in the tool's output are not
      master's: find both events by `enemy` / `stage`;
    - the hunter-range dive (`content/stages/hunter-range.stage.json:38`, `y: -24`; the tool gives -36): **no content
      edit in P1**. The dive has no path. `hunter.option` (variant 2) flies to its `lineY`, a `world-y` default that
      `R2-02.W6` writes as `24 * WORLD_SCALE + WORLD_TOP_PAD` (72 at the port), so it lands at ×1.5 + 36 by itself.
      `R2-02.T3`'s landing check (`turnY`, wave 3) confirms it, and adds a hand fix to the patch only if it fails;
    - `content/enemies/advanced-bosses.enemies.json` `captain-circler` (`:78`): its home x 530 (`cx + rx` of its orbit;
      the port's end-anchored 562 would make it jump at its start);
    - `content/stages/zone-g.stage.json` tilemap: zone G's rising crystal walls one row up, so they cross the
      playfield's middle row (`floor(PLAYFIELD_H / 2 / 12)` = 14; ported they start on row 15 —
      `test/integration/content.test.ts:1659`'s PRISM LABYRINTH case needs 6 walls there).
- **The 15 frame-unit literal defaults** (`packages/core/src/behaviors/index.ts`, lines at `bc8e05d`, unchanged on
  `c67c7c9`): `orbiter.loop` `x: 256` / `y: 100` (`:568-569`); `cube.pincer` `meetX: 176` (`:703`); `rear.swoop`
  `turnX: 280` (`:1031`); `captain.ram` `ramX: 40` (`:1613`); `captain.crab` `minX: 250`, `maxX: 340`, `minY: 40`,
  `maxY: 160` (`:1749-1752`); `boss.widow` `minX: 250`, `maxX: 320`, `minY: 56`, `maxY: 144` (`:2021-2024`);
  `boss.walker` `frontX: 96` / `backX: 280` (`:3158-3159`). Their units are `screen-x` / `screen-y`, except
  `orbiter.loop` `y`, which is `world-y` (`units.ts:94`) and still one of the 15 kit literals (`rescaleNumber`
  gives 186); check each in `packages/core/src/behaviors/units.ts` `BEHAVIOR_PARAM_UNITS`. Compute each v2 value with
  core's `rescaleNumber(unit, v1, options)` (`packages/core/src/data/units.ts:265`, the same options the tool passes:
  v1 geometry 384×200 / 8-px tiles → 640×336, factor 1.5, pad 36). The other 14 lines take 12 replacements, each
  pattern made of whole lines, so that every pattern matches once: the line `minX: 250,` occurs twice (`:1749`,
  `:2021`), so each one is replaced together with the line after it — `captain.crab`'s `minX: 250,` + `maxX: 340,`
  and `boss.widow`'s `minX: 250,` + `maxX: 320,` — as one two-line pattern that writes both v2 values (those two
  `maxX` lines get no replacement of their own); every other line is one replacement of its own. **The one exception
  is `cube.pincer`:** its line `:703` (`{ speed: 1.5, meetX: 176, gap: 8, leaveSpeed: 1.75 },`) also holds three
  world values that `R2-02.W6` rewrites in wave 2, so its replacement matches the token `meetX: 176` only (unique in
  the file), never the whole line.
- **The stub** (`packages/core/test/helpers/port-pending.ts`): `:57-59` becomes `export const CONTENT_PORT_PENDING:
  boolean = false;`, the import-time call `checkPortPendingExpiry(FRAME_W, CONTENT_PORT_PENDING);` (`:76`) is
  removed, and the now-unused import `import { FRAME_W, TILE_SIZE } from '../../src/config/index.js';` (`:26`) is
  dropped (`TILE_SIZE` was used only at `:58`, `FRAME_W` only at `:76`; `noUnusedLocals` fails the typecheck
  otherwise). Keep all six exports (`shippedTileSizes`, `CONTENT_PORT_PENDING`, `checkPortPendingExpiry`,
  `PORT_PENDING_REASON`, `describePortPending`, `itPortPending`) and keep `checkPortPendingExpiry` itself unchanged —
  `port-pending.test.ts` calls it; `shippedTileSizes`, `V1_FRAME_W` and `checkPortPendingExpiry` keep their own
  imports. Without the stub the real module throws at import in the ported tree and about 30 test files fail to
  load.
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
  report kit bugs to the orchestrator. In wave 2 the orchestrator sends a small fix agent that takes KIT; in wave 3,
  while `R2-02.T3` runs, T3 makes the kit fix itself (it holds KIT), and after T3's push a small fix agent takes KIT
  again. Never two KIT holders at once.
- **Traps:**
  - the kit only ever resets its **own** throwaway tree; never run `git checkout -- content`, `git stash` or a
    content edit in your own tree;
  - **no content file may change on master before the port** (wave 4), or `handfix.patch` stops applying;
  - the frame-literal scans skip `test/` and `.sh` files; still, the only frame numbers the script may hold are the
    tool's four v1 geometry flags (`--from-width 384 --from-height 200 --tile-size 8 --to-width 640`, step 3) — write
    no other one;
  - `apply` must be the exact same steps as the throwaway mode (S runs it; a reviewer diffs the two).
- **Docs needs:** none (the kit is deleted by the port commit; `test/README.md` gets no row).

## Docs subtasks (the R2-01 docs pass)

Every D block below: read [`handoffs-w4.md`](handoffs-w4.md) (its section for your files), then the code it names;
write only what holds at HEAD. Wording: plain, short sentences; keep tables readable; no Prettier for Markdown.
Tests for docs: none unless the block names one. Push with a `docs:` subject.

### R2-01.D1 — The plan and the changelog (`W01.DOCS-A`, holds PLAN)

- **Wave / lane / order:** wave 1, lane 3, first; it closes the wave (its last push updates §17; the orchestrator
  then syncs the board).
- **Depends on:** nothing for the draft; its §17 change waits for `R2-01.DR` at zero and `R2-01.F1` (if open) with
  `R2-01.F1.RV` at zero.
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
     the HI rule and the es title-cursor fix. Add C5 review 2's fix `c67c7c9` (read `git show -s c67c7c9`): e2e
     waits count game ticks (`__shmupDebug.tick`), never rAF frames or seconds; the campaign-run web test's timeout
     is 420 s for a slow runner; the Tizen debug unlock (Pause, Ch+ ×3) is sent in one `page.evaluate`; the flight
     idle check freezes the sim and steps exact ticks. Add C5 fix 3 `8ff2bf6` (read `git show -s 8ff2bf6`): the
     shared e2e helper `test/e2e/ticks.ts` (tick-paced taps, scene waits with tick budgets, the scene-flow delays as
     mirrors of core pinned by `test/integration/e2e-ticks.test.ts`, `BOOT_TIMEOUT_MS` for the wall-clock boot), and
     C5 fix 4 `543887b`: every boot wait takes `BOOT_TIMEOUT_MS`; the ship fly-in and item polls count ticks
     (`SHIP_ENTER_TICKS` 40, pinned against `content/player/*.player.json`). Add C5 fix 5 `0cabaec` and the later
     `424afd7` / `b0dede1` (rebind's and the menu specs' taps, and where the sim always runs their pauses, count
     ticks), and every later C5 fix on master, each from its commit message (this lists them:
     `git log --oneline b0dede1..origin/master -- test/e2e test/integration/e2e-ticks.test.ts`).
  2. **§1 register:** rows W4-1 … W4-14 ([`decisions.md`](decisions.md) has them), with "R2-01" in "Applies to".
  3. **Notes for later steps** (into R2-02's and R2-03's sections, as `- **Notes from R2-01:**` bullets): from
     `handoffs-w4.md` — rescale's four required v1 flags and `--art-scale 1.5`; the 3 IRON LEVIATHAN errors (W5-8);
     zone G's rising walls (a hand fix); `replay-version-shipped.test.ts` deleted with `stale.ts` in R2-03;
     `docs/images/logo.png` regenerated in R2-03; both e2e gates deleted in R2-03; the builds' sizes after the flip
     (as `check-bundle` prints them on `c67c7c9`: Tizen `app.js` 380.2 KB gzip of 512, dist ≈ 1,742 KB of 8,192;
     webOS `app.js` 379.9 KB gzip); the e2e shards' ~6 minutes at 640.
  4. **CHANGELOG** `## [Unreleased] — v2`: R2-01 entries (player-visible: the 640×360 frame, interim art, v1 replays
     refused as "V1 REPLAY", v1 hi-scores archived; developer: the constants, the gates).
  5. **§17:** R2-01 → `done (owner parts pending) — <date>` (owner parts: the M7 interim look, W3-7), then push.
     **Never run `python3 .claude/plan_board_v2.py` yourself:** the orchestrator runs it from the main checkout once
     your push is on `origin/master` (the script reads §17 from `origin/master`). Say in your report that §17 changed.
- **Tests:** none (Markdown). Check `grep -n "^| R2-01 |" plan_resolution.md` shows the new status.
- **Acceptance:** every hand-off line of `handoffs-w4.md` marked for the plan or the CHANGELOG is either written or
  listed in the report as "not applicable, because …"; the §17 change is on `origin/master`.
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
  - `CLAUDE.md`: the frame bullet was **already flipped** by `92da486` (line 17 now starts "**Since `72b18a1`
    (R2-01's flip) the code runs at 640×360 on `master`:**"): only check that every value it gives matches the code.
    Keep its "**The world is still ×1:**" sentence — it stays true until the port; `W05.DOCS-B` changes it. Keep the
    rest of the v2 section.
  - `conventions.md` § Frame numbers: the frame constants' current values (640 / 360, `HUD_BAR_HEIGHT` 12,
    `HUD_BOTTOM_Y` 348, `TILE_SIZE` 12, `GLYPH_W` / `GLYPH_H` / `LINE_H` 9 / 12 / 15 = the font file × `ART_SCALE`);
    the panel rule (`:98`, "Panel widths and heights sized by their 6×8 text stay literal") is replaced — panel sizes
    now derive from `GLYPH_*` and `uiPx`; the scanner skips long hex colours (`#rrggbb` / `#rrggbbaa`); the
    allow-lists hold **32 repo / 14 core** entries (the doc says 22 at `:138`); the banned set includes
    640 / 360 / 336 / 348; the two e2e gates and `test/integration/e2e-gates.test.ts`.
  - `repo-layout.md`: the lines that still say 384×216 for the render target or the frame.
  - `test/README.md`, `scripts/README.md`: rows for files R2-01 added or changed (`test/e2e/gates.ts`,
    `test/e2e/save-format.ts`, `test/e2e/ticks.ts`, `test/integration/e2e-gates.test.ts`, `e2e-save-format.test.ts`,
    `e2e-ticks.test.ts`, the replay v1 fixture), if missing.
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
  packages/core/src/index.ts` lists them; `c67c7c9` did not touch the barrel). Do **not** document `R2-02.P0`'s
  `WORLD_SCALE` / `WORLD_TOP_PAD` here, even if P0 has pushed: wave 5's `W05.DOCS-D` does.
- **Token:** none.

### R2-01.D4 — Art and rendering docs

- **Wave / lane / order:** wave 1, lane 6.
- **Depends on:** nothing.
- **Files (only these):** `docs/dev/asset-pipeline.md`, `docs/dev/rendering-and-shell.md`,
  `docs/dev/presentation-polish.md`, `docs/dev/visual-and-mechanic-extras.md`.
- **What to write:** the interim ×1.5 stage (nearest-neighbour `⌈1.5·w⌉`, anchors `⌈1.5·a⌉`); the native sources the
  interim stage never upscales (terrain tilesets, `ui/pixel`, the laser beams — 12 frames of 6×12, frame k is k+1
  rows); the 9×12 interim font (the 6×8 file × 3/2, line 15); the upscale ×3 on 1080p and ×2 on 720p; the CRT pitch
  3; the TV bench decode pages are ×1.5 since the flip, so R0-03 rows before and after the flip are not like for like;
  the R3 hand-off on `artScale: 1` builds (from `handoffs-w4.md`); D19 / D20 marked superseded (the render target
  640×360, the 12-px HUD bars; `rendering-and-shell.md:30`, `:33`, `:95`, `:214` still say 384×216 / D20 numbers).
- **Acceptance:** every line that `grep -n "384×216" docs/dev/{asset-pipeline,rendering-and-shell,presentation-polish,visual-and-mechanic-extras}.md`
  prints describes v1 or is marked superseded; every `handoffs-w4.md` item for these four files is written or listed
  in the report with its reason.
- **Token:** none.

### R2-01.D5 — Saves and replays docs

- **Wave / lane / order:** wave 1, lane 7.
- **Depends on:** nothing.
- **Files (only these):** `docs/dev/saves-and-options.md`, `docs/dev/options-rebinding-and-accessibility.md`,
  `docs/dev/debug-and-replays.md`, `docs/dev/extra-modes-and-replays.md`, `docs/client/extra-modes-and-replays.md`,
  `docs/dev/front-end-and-attract.md`.
- **What to write:** save format 3 (`SAVE_VERSION` 3, `packages/core/src/save/index.ts:119`), `legacyScores` (W4-8:
  no UI in R2-01; Steam achievements read `hiScores ∪ legacyScores`), W4-13 (v1 hi-score tables archived, v2 starts
  empty), W4-14 (a v1.x build reading a v3 save falls back to defaults, the old text kept under `save.corrupt`);
  replay format 2, the refusal (`ReplayVersionError`), the "V1 REPLAY" row and "RECORDED BY V1: CANNOT PLAY", delete
  only (W4-7); the web app's v1-paste notice; the attract loop skips refused demos (W4-9) until R2-03 re-records them.
- **Acceptance:** wherever these six files name today's formats, the save is format 3 and the replay format 2
  (check every hit of `grep -n -i "save format\|replay format\|SAVE_VERSION\|REPLAY_FORMAT" <the six files>`);
  every `handoffs-w4.md` item for these files is written or listed in the report with its reason.
- **Token:** none.

### R2-01.D6 — Hosts and build docs

- **Wave / lane / order:** wave 1, lane 8.
- **Depends on:** nothing.
- **Files (only these):** `docs/dev/platform-polish.md`, `docs/client/desktop-app.md`, `apps/electron/README.md`,
  `docs/dev/build-test-deploy.md`, `docs/client/outstanding-work.md`.
- **What to write:** C5 review 2's lasting e2e rule from `c67c7c9`, in `build-test-deploy.md` (short; the rule itself
  goes into `conventions.md` § Tests, `R2-01.D2`'s file — link to it): an e2e wait counts game ticks
  (`__shmupDebug.tick`, or `freezeSim` / `stepTo`; the shared helpers live in `test/e2e/ticks.ts` since `8ff2bf6`),
  never rAF frames or seconds of wall time — only a test's own timeout and the boot wait (`BOOT_TIMEOUT_MS`) are wall
  time (the campaign-run web test's timeout is 420 s for a slow runner); a multi-key input with a time window
  (the Tizen debug unlock) is sent in one `page.evaluate`; a flake repeat passes `--retries=0` (the e2e helper's
  `CI=1` gives one retry). Then window state v2 (`scale′ = max(1, round(scale × 384 / 640))`, W4-10), the default ×2 = 1280×720,
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
- **Depends on:** nothing.
- **Files (only these):** `docs/dev/scenes-and-ui.md`, `docs/dev/zones-h-and-i.md`,
  `docs/dev/campaign-and-bonus-stages.md`.
- **What to write:** the layout section (panels no longer literal; picture scenes scaled by `uiPx` / `uiOffsets`);
  the campaign line caps are **47 / 67**, derived from the text panels (`scenes-and-ui.md:363-366` still says
  "55 / 68"; `zones-h-and-i.md:432-433` gives the v1 caps 40 / 60 with the old formulas
  `⌊(FRAME_W − 144) / GLYPH_W⌋` and `⌊(FRAME_W − 24) / GLYPH_W⌋`, which give 55 / 68 at 640); `SCROLL_HALVES` (the
  story crawl and the credits keep their v1 duration at 640; `SCROLL_HALVES` = 2 brings back the slow crawl); the
  title HI-line rule (shown where v1 showed it, hidden only under Options and difficulty).
- **Acceptance:** `grep -n "55 / 68" docs/dev/scenes-and-ui.md docs/dev/zones-h-and-i.md docs/dev/campaign-and-bonus-stages.md`
  is empty; no line of the three files gives the campaign line caps for today's frame as anything but 47 / 67
  (`packages/core/src/data/campaign.ts:151`, `:163`, `:185`); every `handoffs-w4.md` item for these files is written
  or listed in the report with its reason.
- **Token:** none.

## Reviews

### R2-01.DR — Review of the docs pass

- **Wave / order:** review slot 1, as D pushes land; then a final pass over all seven.
- **What to read:** `git log --oneline $(cat /home/sites/shmup-cup-run/w01-base.txt)..origin/master -- '*.md'` and
  each diff.
- **Must hold:** every number and path in the new text matches the code at HEAD (spot-check at least 10 per agent
  with `git grep`); no doc still says "22 entries", "still runs at 384×216" or "55 / 68"; every item of
  `handoffs-w4.md` for these files is written or explained; no code, test or content file changed; tables readable.
- **Report:** findings with severity (blocker / should-fix / nit). Zero findings means zero nits. Fixes go to a
  fixer (the D agent's own files), then a **new** reviewer.

### R2-01.F1.RV — C5 review 4 of the fixes since `c67c7c9` and its later rounds (only while `wave-00.md` reads `**Status: open**`)

- **Wave / order:** review slot 2, first in the wave: the first round (unless a finished C5 review report — review 4
  or later — with findings is handed over), then one new round after each `R2-01.F1` fix push. Fix → a **new**
  reviewer until zero findings, nits included.
- **What to read:** `git show c67c7c9`, `git show 8ff2bf6`, `git show 543887b`, `git show 0cabaec`,
  `git show 424afd7`, `git show b0dede1` and every later commit to the e2e specs and their helpers
  (`git log --oneline c67c7c9^..origin/master -- test/e2e test/integration/e2e-ticks.test.ts`);
  [`handoffs-w4.md`](handoffs-w4.md)'s "C5 review 2" bullet under R2-01's As built and Appendix A (d); the hand-over
  note (the newest C5 review report — review 4 or later — if one is handed over); the previous round's report and
  F1's report, if any.
- **Run:** the four e2e commands (the fourth with the later C5 fixes' specs, as **Tests** says) and the Vitest
  command of `R2-01.F1`'s **Tests** (read-only: never edit a file).
- **Must hold:** every C5 review 2 item (S1–S3, N1) is fixed as `handoffs-w4.md` describes, and every C5 review 3
  item as the commit bodies of `8ff2bf6`, `543887b`, `0cabaec`, `424afd7` and `b0dede1` say (and every later round's
  item as its fix commits' bodies say); the four e2e runs green with `--retries=0`; the cause of each later fix named
  in its commit body; no timeout raised without a measured, commented reason (the boot waits'
  `BOOT_TIMEOUT_MS` is the named one); no gate or skip added; only the files F1 lists (or a reported real-bug fix)
  changed; `test/integration/e2e-gates.test.ts` and `test/integration/e2e-ticks.test.ts` green.
- **Report:** findings with severity (blocker / should-fix / nit). Zero findings means zero nits; at zero, the
  orchestrator closes `wave-00.md`'s status line.

### R2-02.P0.RV — Review of `WORLD_SCALE` / `WORLD_TOP_PAD`

- **Must hold:** both typed `number`; docblocks as P0 says; the barrel exports them; `scripts/frame.mjs` mirror
  pinned by `test/scripts/frame.test.ts`, whose "holds only whole numbers" case skips `WORLD_SCALE` and whose own
  `WORLD_SCALE` case checks it positive with `WORLD_SCALE * 2` whole (at 3/2, under the kit and after the port, a
  whole-number check would fail); `SPAWN_LEAD` still 656; the `CONSTANTS` pin of `frame-constants.test.ts`
  unchanged (the two constants have cases of their own); the three fingerprints unedited and green; no allow-list
  entry added; P0's test commands green when re-run.

### R2-02.P1.RV — Review of the port kit

- **Must hold:** the throwaway mode and `apply` make the same changes (run both on scratch trees and `git diff
  --no-index` them); every flip replacement matches once (break one pattern locally and see the script fail); the
  `cube.pincer` replacement matches the token `meetX: 176` only, never the whole line `:703`; the 15 v2 defaults equal
  `rescaleNumber` of the v1 values (recompute two by hand); `handfix.patch` touches `content/` only and applies
  cleanly to a fresh tool output; the identity dry run shows exactly the 3 expected errors; the stub keeps all six
  exports and drops the unused `FRAME_W, TILE_SIZE` import (`pnpm --filter @shmup/core typecheck` green in the kit
  tree).

## Exit check

1. `R2-01.DR` at zero findings; `R2-01.F1.RV` (if F1 ran), `R2-02.P0.RV` and `R2-02.P1.RV` at zero.
2. `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/e2e-docs.test.ts
   test/scripts/frame.test.ts test/integration/frame-literals-repo.test.ts test/integration/presentation-fingerprint.test.ts
   test/integration/content-db-fingerprint.test.ts` and `--project core packages/core/test/config
   packages/core/test/frame-literals.test.ts` green on `origin/master`.
3. `bash test/port-v2/two-scale.sh -- node scripts/content/rescale.mjs --factor 1 --dry-run` reports exactly the 3
   IRON LEVIATHAN `parts[].x` errors.
4. `git diff $(cat /home/sites/shmup-cup-run/w01-base.txt)..origin/master -- content test/golden/*.replay.json content/demos test/fixtures/v1-baseline`
   is empty.
5. §17's R2-01 row on `origin/master` says `done (owner parts pending)`; then the orchestrator (only the orchestrator,
   never a docs agent) runs `python3 .claude/plan_board_v2.py` from the main checkout.
6. Deferred to wave 15: nothing new.

## Owner (Manual) — never blocks this wave

- Look at the interim 640×360 build on the M7 (`pnpm --filter @shmup/tizen build:dev`; R2-01's Manual list).
- W3-7: check that the M7 boots to the title (the atlas manifest fetched by XHR from `file://`).
