# Wave 04 — R2-02's barrier and the port commit ∥ R3-03 / R3-04 side lanes ∥ R0-04's agent parts

> Schedule: [`plan_resolution.md` §18](../../plan_resolution.md#18-execution-waves-for-the-10-agent-run) · how to
> use: [`README.md`](README.md) · decisions: [`decisions.md`](decisions.md) · background:
> [`wave5-scout.md`](wave5-scout.md) §0, §1, §8
>
> **Run directory:** `RUN_DIR` is `/home/sites/shmup-cup-run` (README common rule 15). The commands below spell the
> path out, so each one runs as typed in a fresh shell; prose that says `RUN_DIR/…` means the same path.
>
> **Wave base:** when this wave's first agent starts, the orchestrator records the wave's base (the
> `origin/master` SHA at that moment) once, in the main checkout, and notes it in `RUN_DIR/lanes-<wave>.md` too
> (README step 5):
> `git fetch origin && git rev-parse origin/master > /home/sites/shmup-cup-run/w04-base.txt`.
> Every command below that diffs against the wave base reads that file, `$(cat /home/sites/shmup-cup-run/w04-base.txt)`;
> an agent's prompt may carry the SHA itself instead, never a placeholder.
> The commands that diff against **wave 2's** base read `/home/sites/shmup-cup-run/w02-base.txt` (recorded
> when wave 2 started, by the same command).

**Steps:** R2-02 (the barrier review and the one port commit), R3-03 (V2a, V2b, V4a, V4b, V5), R3-04 (M1a, M1b,
M1c, M2a, M2b, M4a, M4b), R0-04 (W1 owner-gated, W2).
**Gate to start:** wave 3's exit — every R2-02 prep subtask (P0, P1, W1–W7, A1, T0, T1a–e, T2a–e, T3, T4a–c, E0) on
`origin/master` with its review at zero findings; T3's findings folded into `test/port-v2/handfix.patch`.
**Exit (summary):** the port commit is on master and its verify list is green; `node scripts/content/rescale.mjs
--factor 1 --dry-run` reports 0 changes / 0 unclassified / 0 errors; the side lanes' pushes are reviewed to zero (or
carry over into wave 5).

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| 1 (review slot) | `R2-02.RV-pre` | read-only, a kept kit worktree | — | no |
| 2 | `R2-02.S` (after RV-pre is at zero) | `content/**`, core config, 15 lines of `behaviors/index.ts`, `scripts/frame.mjs`, the port-pending stub, the 3 fingerprints, `test/port-v2/**` (deleted) | CORE-CONFIG, BEHAVIOR (15 lines), KIT, FINGERPRINTS, PORT window | yes (pass 1) |
| 3 | `R3-03.V2a → R3-03.V5` (V5 after V1 and V2b on master) | `scripts/assets/{coop,sprite-source,pipeline}.mjs`, ship / life pixel maps, `procedural/palettes.mjs`, `scripts/art-origins.mjs` | — | no |
| 4 | `R3-03.V2b → V4a → V4b` (V2b after V2a on master) | `art-prompts/ingest/**`, `scripts/assets/tileset-masks.mjs` (new), `test/integration/terrain-checks.ts` (new) | — | no |
| 5 | `R3-04.M1a → M1b → M2a → M2b` (M2b after V1 on master) | `scripts/assets/standin.mjs` (new), `test/integration/standin-budget.test.ts` (new), `apps/tizen/scripts/check-bundle.mjs`, `test/scripts/assets/atlas-budget.ts` | — | no |
| 6 | `R3-04.M4a → M4b` (M4a after M1b on master) | `apps/tizen/scripts/{bench-decode,bench-atlas}.mjs`, `apps/tizen/src/bench/*`, `tools/input-probe/results/analyze-bench.mjs`, `test/integration/tv-render-bench.test.ts`, `test/bench/render.perf.ts` | — | no (bench under the e2e lock) |
| 7 | carry-overs from wave 2/3: `R3-03.V3`, `R3-04.M3a … M3e` (blocks in [`wave-02.md`](wave-02.md)) | see their blocks | RP-BARREL, SHELL-BARREL (M3) | M3d / M3e (pass 2) |
| 8 | filler `R0-04.W2`; `R0-04.W1` only when the owner opens it; optional `R3-04.M1c` | `art-prompts/images/**`; `art-prompts/v2/**` | — | no |

- **Reviews:** slot 1 runs `R2-02.RV-pre` first (it is the barrier), then reviews S's commit (`R2-02.S.RV1`, a
  fresh reviewer per round). Slot 2 reviews the side lanes as they push (`<id>.RV1`, …), loop to zero each.
- **Docs item:** none in this wave. R2-02, R3-03 and R3-04 are documented by wave 5's docs agents.
- **e2e passes:** two. Pass 1 belongs to S during its verification; pass 2 to the M3 carry-over (M3d / M3e). No
  other lane runs an e2e batch in this wave. M4b's render bench (`test/bench/render.perf.ts`, Playwright) also runs
  under the e2e lock, but a bench file or `pnpm docs:screens` run under the lock does **not** count toward the two
  e2e agents: the lock already runs it alone.

## Rules for this wave

1. **The PORT window.** When `R2-02.S` starts its verification (step 5 of its block), it creates the file
   `/home/sites/shmup-cup-run/w04-port-window` (`touch`). It deletes the file right after its push is on
   `origin/master`. **No push to master while that file exists.** Every other agent of this wave runs
   `test -e /home/sites/shmup-cup-run/w04-port-window` before each `git push`. While the file exists, keep working
   and committing locally; to wait, run
   `while test -e /home/sites/shmup-cup-run/w04-port-window; do sleep 60; done` with the shell tool's
   `background: true` (a foreground command stops after 2 minutes), and push only after the file is gone, rebasing
   onto S's push first. The window lasts about 1.5–2.5 hours. The orchestrator also holds any new side-lane start
   that would push in it. If S stops without pushing (a failure it reports), S deletes the file before it replies;
   if the file is still there after S's reply, the orchestrator deletes it. (A file, not a message: an opencode
   background agent gets no message from the orchestrator while it runs.)
2. **Nobody but S** touches `content/**`, `packages/core/src/config/index.ts`, `scripts/frame.mjs`,
   `packages/core/test/helpers/port-pending.ts`, `test/port-v2/**` or the three fingerprint tests in this wave.
3. **Nobody runs `pnpm golden:update`.** After S the tool's refusal (`scripts/golden-update.mjs:14-16`, `:30-50`)
   lifts by itself, because every tileset is then at `TILE_SIZE` 12: the command would re-bless. R2-03.G1
   (wave 6) is the only re-bless of R2.
4. **Side lanes are byte-neutral for the shipped atlas** unless the block says otherwise: the scale-1 digest pin in
   `test/scripts/assets/interim-pipeline.test.ts:341-357` (`fa4198…`) never moves in R3-03 / R3-04 (decision RR-1:
   `buildAtlas({ artScale: 1 })` stays the v1 art until a v2.0.x clean-up after the release). No R3 subtask moves a
   fingerprint or a golden.
5. `ATLAS-SHA` below means `node scripts/generate-assets.mjs --force && sha256sum assets/generated/atlas/*`, run
   before and after your change in your own tree, then compared.
6. `INGEST` means `cd art-prompts/ingest && npm ci && npm test && node ingest.mjs --check` (its own npm project; CI's
   `ingest` job runs the same).
7. **The barrier's exception to Common rule 3.** `R2-02.RV-pre`, `R2-02.S` and every round of S's review
   `R2-02.S.RV1` run whole Vitest projects (core, integration, shell, render-pixi, audio-web, input-web, web, tizen,
   webos, electron) because they are the port's barrier — like wave 2's `R2-02.RV-A2`. That is not the run's full
   suite: they still never run `pnpm test`,
   `pnpm test:e2e` or the whole `pnpm bench`. Every other agent of this wave runs targeted tests only.
8. **Pushes:** every builder and fixer of this wave pushes its own task to `master` (Common rule 5) — side lanes hold
   their pushes during the PORT window (rule 1). Review agents never push. This wave has no zone lane (local branch)
   and no patch-only subtask.

## Subtasks

### R2-02.RV-pre — The barrier review: the whole port, rehearsed in the kit

- **Wave / lane / order:** wave 04, lane 1 (review slot), first. S starts only when this review is at zero findings.
- **Depends on:** wave 3's exit (every prep subtask of R2-02 on `origin/master`).
- **Goal:** prove that the port commit can land: under the kit, every failure is explained, and every prep commit
  on master is neutral at `WORLD_SCALE` 1.
- **Files:** read-only. You write only your report (`RUN_DIR/R2-02.RV-pre-report.md`).
- **Steps:**
  1. List wave 2's base (the `origin/master` SHA wave 2 started from, recorded in `RUN_DIR/w02-base.txt`) and every
     R2-02 prep commit since: `git log --oneline $(cat /home/sites/shmup-cup-run/w02-base.txt)..origin/master`.
  2. Neutrality on master:
     `git diff --name-only $(cat /home/sites/shmup-cup-run/w02-base.txt)..origin/master -- content test/golden/'*.replay.json' content/demos test/fixtures/v1-baseline`
     must print nothing. `WORLD_SCALE` / `WORLD_TOP_PAD` are still `1` / `0` (`grep -n "WORLD_SCALE\|WORLD_TOP_PAD"
     packages/core/src/config/index.ts scripts/frame.mjs`). The three fingerprint tests are unedited since the base
     and green; this prints nothing:
     ```bash
     git log $(cat /home/sites/shmup-cup-run/w02-base.txt)..origin/master -- test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts packages/shell/test/frame-fingerprint.test.ts
     ```
  3. Make a kept kit worktree: `bash test/port-v2/two-scale.sh --keep -- true` (it prints the worktree's path). In
     it, run S's whole verify list (S's step 5 below), **except** the builds and e2e.
  4. Classify **every** failure: (a) expected, the derived files S re-pins (the three fingerprints); (b) an open item
     of a named subtask (say which); (c) a real problem nobody owns. Any (b) or (c) is a finding.
  5. Check the skip accounting: under the kit, `CONTENT_PORT_PENDING` is `false` (the stub), so the 80 port-pending
     tests **run**; the 239 `GOLDENS_STALE` skips stay; the 41 frame `runIf` skips stay; the 6 cases `R2-02.T4b`
     retired with `runIf(content still v1)` (`rescale.test.ts` ×4, `rescale-edge.test.ts` ×2) now skip — **286** in
     all (if T4b's report gives another number of retired cases, use T4b's). Report the numbers you see.
  6. Check `node scripts/content/rescale.mjs --factor 1 --dry-run` in the kit tree: 0 changes, 0 unclassified,
     0 errors (W5's ±768 bound for IRON LEVIATHAN's `parts[].x` is on master).
  7. Check the kit's flip replacements each matched exactly once (the script fails loudly otherwise) and that
     `handfix.patch` applies cleanly on the tool's output.
- **Tests:** the commands of S's step 5, run in the kit tree (core, integration, shell, render-pixi, audio-web,
  input-web and the apps' projects; every allocation guard the `find` of S's Tests lists — 66 on `bc8e05d`, plus any
  new one such as `R3-04.M3b`'s `residency-lazy-alloc`; `pnpm content:check`; typecheck), plus
  `pnpm exec prettier --check content` in the kit tree (the tool's output with `handfix.patch` applied; a failure
  there is a finding for `handfix.patch`).
- **Acceptance:** zero unexplained failures; every prep commit neutral; skip numbers as in step 5. Findings are
  reported by severity (blocker / should-fix / nit); zero findings means zero nits too.
- **Token:** none (read-only). Remove the kept worktree at the end: `git worktree remove --force <path>`, with the
  path step 3's command printed for `<path>` (`--force`: the tree holds the ported `content/` and the code flip).
- **Traps:** this is the barrier, not the run's full suite: it updates nothing (no re-bless, no re-pin, no image).
  Never fix anything here; a finding goes to a fixer, then a **new** RV-pre review runs.

### R2-02.S — The port commit: all content ×1.5 and the world constants, in one commit

- **Wave / lane / order:** wave 04, lane 2, after `R2-02.RV-pre` is at zero findings. **Alone:** no other R2
  agent works on master meanwhile, and the PORT window (rule 1) holds from step 5 to the push.
- **Depends on:** every R2-02 prep subtask on master; RV-pre at zero.
- **Goal:** one commit that ports `content/` ×1.5 with the rescale tool, applies the hand fixes, flips
  `WORLD_SCALE` 1 → 3/2 and `WORLD_TOP_PAD` 0 → 36, writes the 15 frame-unit behaviour defaults at their v2
  values, stubs the port-pending gate and re-pins the three fingerprints. The kit (`test/port-v2/`, made by
  R2-02.P1 in wave 1) does the mechanical part; S runs it, verifies and commits.
- **Files (only these):**
  - `content/**` — the tool's output (4,035 changes in 77 files on `bc8e05d`; `content/demos/` is skipped by the
    tool, `rescale.mjs:127`) plus `test/port-v2/handfix.patch`;
  - `packages/core/src/config/index.ts` — the two values (`WORLD_SCALE`, `WORLD_TOP_PAD`, next to `ART_SCALE` at
    `:825`);
  - `packages/core/src/behaviors/index.ts` — the 15 frame-unit literal defaults the kit replaces (`orbiter.loop` x / y,
    `cube.pincer.meetX`, `rear.swoop.turnX`, `captain.ram.ramX`, `captain.crab` ×4, `boss.widow` ×4, `boss.walker`
    ×2);
  - `scripts/frame.mjs` — the `WORLD_SCALE` mirror P0 added (so `SPAWN_LEAD` = `PLAYFIELD_W + 16 * WORLD_SCALE`,
    `:85`, becomes 664);
  - `packages/core/test/helpers/port-pending.ts` — the stub: `:57-59` becomes `export const CONTENT_PORT_PENDING:
    boolean = false;`, the import-time call `checkPortPendingExpiry(FRAME_W, CONTENT_PORT_PENDING)` at `:76` is
    removed, and the now-unused `import { FRAME_W, TILE_SIZE } from '../../src/config/index.js';` (`:26`) is dropped
    (`noUnusedLocals` fails `pnpm typecheck` otherwise); all six exports stay (`shippedTileSizes`,
    `CONTENT_PORT_PENDING`, `checkPortPendingExpiry` unchanged, `PORT_PENDING_REASON`, `describePortPending`,
    `itPortPending`);
  - `test/integration/presentation-fingerprint.test.ts`, `test/integration/content-db-fingerprint.test.ts`,
    `packages/shell/test/frame-fingerprint.test.ts` — their `PINNED` tables only;
  - `packages/core/test/frame-literals.test.ts` — only if step 4 needs it;
  - `test/port-v2/**` — deleted.
- **Steps:**
  1. In your worktree at `origin/master`: `pnpm install --frozen-lockfile --prefer-offline && pnpm assets`.
     Measure the baseline bundle: `pnpm --filter @shmup/tizen build` and note `app.js`'s gzip size
     (`gzip -9 -c apps/tizen/dist/app.js | wc -c` prints bytes — about 386,000 on `bc8e05d`; check-bundle's own
     line, 380.2 KB of 512 KB, uses zlib's default level and 1024-byte KB, so the two never match). Compare step 1
     and step 5 with the same `gzip -9 … | wc -c` command.
  2. `bash test/port-v2/two-scale.sh apply` — in your own tree, in this order: the tool
     (`node scripts/content/rescale.mjs --factor 1.5 --top-pad 36 --from-width 384 --from-height 200 --tile-size 8
     --to-width 640 --art-scale 1.5`, the four v1 geometry flags are required since the flip), then
     `git apply test/port-v2/handfix.patch`, then the code flip, then the port-pending stub. Save the tool's summary
     line for the commit body.
  3. `git rm -r test/port-v2`.
  4. If one of the 15 kit literals now equals a banned frame number (`336 348 640 360 384 216 200 208 192 108`),
     derive it from the frame constants (preferred) or add a reasoned entry to `packages/core/test/frame-literals.test.ts`.
     `bossSuction.pullRadius` keeps its entry (`200 * WORLD_SCALE` still holds the literal 200, count 1).
  5. **Open the PORT window** (rule 1): `touch /home/sites/shmup-cup-run/w04-port-window`, then verify:
     - the three fingerprints red only in their pinned tables; re-pin them (step 6) before the rest;
     - the verify list under **Tests** below, all green;
     - `node scripts/content/rescale.mjs --factor 1 --dry-run`: 0 changes, 0 unclassified, 0 errors (no flags: the
       content is now at `TILE_SIZE`);
     - `pnpm --filter @shmup/tizen build` and `pnpm --filter @shmup/webos build`; report the `app.js` gzip delta
       against step 1.
  6. Re-pin, under the land lock (`flock -w 5400 /tmp/shmup-cup-land.lock …`, README rule 6):
     ```bash
     SHMUP_FINGERPRINT_PRINT=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration \
       test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
     SHMUP_FINGERPRINT_PRINT=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell \
       packages/shell/test/frame-fingerprint.test.ts
     ```
     Paste the printed tables over the `PINNED` tables. Expect **most** segments to move (every walk over zone A,
     zone B or the campaign), not a dozen.
  7. Commit `feat(R2-02): port all content ×1.5 and the world constants (plan §2.6)`. The body gives: the tool's
     summary line; the hand fixes (W5-7: gimmick-range `events[8].until` 2275; zone-g `events[15]` back inside
     `events[14]`'s ground window; the captain-circler home 530; zone G's rising walls one row up; T3's items, if
     any); the line "hunter-range dive: no hand fix — `hunter.option` flies to its `lineY` (72 at the port)", unless
     `handfix.patch` holds a hunter-range fix that T3 added because its landing check (`turnY`) failed — then list
     that fix with the others instead; `WORLD_SCALE` 3/2 and `WORLD_TOP_PAD` 36; the 15 defaults; the stub; the
     three re-pins and why ("R2-02: content ×1.5 and the world constants, plan §2.6"); and the sentence "goldens and
     demos stay stale until R2-03; no re-bless". Push, then **close the PORT window** right after the push is on
     `origin/master`: `rm /home/sites/shmup-cup-run/w04-port-window`. Say in your report that the window is closed.
- **Tests (targeted for a port that touches everything; run all of them in your tree):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration test/playtest test/scripts test/golden
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell --project render-pixi --project audio-web --project input-web
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project web --project tizen --project webos --project electron
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run $(find packages apps test -name '*alloc*.test.ts' -not -path '*/node_modules/*')
  pnpm typecheck && pnpm exec eslint packages/core/src/config/index.ts packages/core/src/behaviors/index.ts \
    scripts/frame.mjs packages/core/test/helpers/port-pending.ts
  pnpm exec prettier --check content packages/core/src/config/index.ts packages/core/src/behaviors/index.ts \
    scripts/frame.mjs packages/core/test/helpers/port-pending.ts \
    test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts \
    packages/shell/test/frame-fingerprint.test.ts
  bash docs/v2-run/helpers/e2e-batch.sh <the specs E0's report lists, ≤ 8 per batch> smoke.spec.ts boot.spec.ts
  ```
  If step 4 changed `packages/core/test/frame-literals.test.ts`, add it to the `eslint` and `prettier --check` lines.
  The tool formats its own output through Prettier, but `handfix.patch` and the pasted `PINNED` tables are not
  formatted by anything: on a `prettier --check` failure, run `pnpm exec prettier --write` on the files it names
  (never reflow them by hand), then run the check again. In the e2e line, `smoke.spec.ts` and `boot.spec.ts` go in
  the first batch only; further batches take ≤ 10 of E0's specs (README rule 4). For the `<…>` part, write the spec
  file names from `R2-02.E0`'s report (`/home/sites/shmup-cup-run/R2-02.E0-report.md`).
  The goldens still skip (`GOLDENS_STALE`). The playtests take several minutes of simulation per zone.
- **Acceptance:**
  - `pnpm content:check` green, with the 4-way rules at 3.0 px/tick / 24 px / 1,350 px;
  - the playtest bot clears every zone, bonus stage and the boss rush in god mode (zone F: report what you see;
    a red zone goes to wave 5's `R2-02.Z-*`, it does not block S unless the zone test fails for a reason the
    hand-fix patch should have covered);
  - `test/golden/v2-port*.test.ts` green (camera ±2 %, first-visible ±1 tick for non-ground spawns, landing ±2 px);
  - every allocation guard the `find` above lists green (66 on `bc8e05d`, plus any new one such as `R3-04.M3b`'s
    `residency-lazy-alloc`), **no budget raised**;
  - `world-scale.test.ts`' audit classifies every numeric export; `behavior-defaults-port.test.ts` covers every
    tunable of `BEHAVIOR_PARAM_UNITS`;
  - after S, the skip count is 239 `GOLDENS_STALE` + 41 frame `runIf` + the 6 cases `R2-02.T4b` retired
    (`rescale.test.ts` ×4, `rescale-edge.test.ts` ×2) = **286** (or T4b's own number, if its report gives another),
    and 0 `CONTENT_PORT_PENDING` (the stub makes the wrappers run; wave 5 deletes them);
  - `test/e2e/gates.ts`' `PORT_UNMEASURED` is now `true` (23 tests skip on it on `bc8e05d`, plus debug-tools'
    gated assertions, plus every gate `R2-02.E0` added — by design) and `test/integration/e2e-gates.test.ts` stays
    green (its pin `contentPorted() === !CONTENT_PORT_PENDING` holds with the stub);
  - the commit holds only the files listed above.
- **Token:** CORE-CONFIG, BEHAVIOR (the 15 lines), KIT (deletes it), FINGERPRINTS (land lock for step 6 and the
  push), the PORT window.
- **Traps:**
  - **Order matters.** The tool runs **before** `WORLD_SCALE` flips: the block and ground pairs and the bonus-window
    timeline read v1 values from core. `two-scale.sh apply` keeps that order; never edit the constants first.
  - **The stub is mandatory.** `port-pending.ts` throws at import once every tileset is 12 px; without the stub about
    30 test files fail to load. Keep `checkPortPendingExpiry` (its own test calls it) and all six exports.
  - **Do not** delete the gates (wave 5's U1–U5 do that), edit e2e specs (E0 did), edit the content READMEs (wave 5's
    `R2-02.R`), run `pnpm golden:update` or `SHMUP_V1_BASELINE_UPDATE`.
  - **Do not** bump a format version (`REPLAY_FORMAT_VERSION` 2, `RUN_REPLAY_FORMAT_VERSION` 2, `SAVE_VERSION` 3,
    `window.json` v2): their e2e mirrors (`test/e2e/gates.ts` `REPLAY_FORMAT`, `test/e2e/save-format.ts`) are pinned.
  - **Never merge a `PINNED` table by hand.** On any rebase, re-run the prints and paste.
  - **Frame ≠ world.** `SPAWN_Y` and `DEFAULT_BOSS_Y` stay frame-centred (W5-2); `SPAWN_LEAD` becomes
    `PLAYFIELD_W + 16 * WORLD_SCALE` = 664, never `PLAYFIELD_W * WORLD_SCALE`.
  - **The TS2367 trap:** `WORLD_SCALE` / `WORLD_TOP_PAD` are typed `number` (P0); keep them so, or `=== 3/2` /
    `!== 1` comparisons fail the typecheck at one of the two scales.
  - If a check fails in a way RV-pre did not predict, stop and report: do not patch content by hand outside
    `handfix.patch`'s fixes.
- **Docs needs (report them; never edit docs):** the tool's summary line, the hand fixes, the build delta, which
  zones the bot cleared and how long, the e2e specs that now skip on `PORT_UNMEASURED` — for wave 5's docs agents
  (plan R2-02 As built, `zone-a-and-playtest.md`, `content-data.md`).

### R3-03.V2a — `@p2` by palette map, byte-identical (the R↔B swap deleted)

- **Wave / lane / order:** wave 04, lane 3, first (filler from wave 3 if a slot was free).
- **Depends on:** nothing in this wave (R3-02, R2-01 done).
- **Goal:** player 2's sprites come from an explicit palette map per sprite instead of a red↔blue channel swap, and
  the atlas stays byte-identical at both art scales.
- **Files (only these):**
  - `scripts/assets/coop.mjs` — `makeP2Sprite(sprite, map)` (`:74`) maps exact colours, unlisted colours stay;
    delete `swapRedBlue` (`:51`) and its mention in the docblock (`:14`); `wantsP2Variant` (`:39`) unchanged;
  - `scripts/assets/sprite-source.mjs` — add `'p2'` to `SPRITE_KEYS` (`:127-136`) and validate it (`"#rrggbb":
    "#rrggbb"` pairs); read a PNG override sidecar's `meta.shmup.p2` in `readPngFrames` (`:386`);
  - `scripts/assets/pipeline.mjs` — `:428-433` passes the sprite's map; three `AssetIssue`s: a `wantsP2Variant`
    sprite without a map, a map colour the art does not contain, a map that changes no pixel;
  - `assets/source/sprites/ships/kestrel.sprite.json`, `ships/kestrel-thruster.sprite.json`, `ships/manta.sprite.json`,
    `hud/life.sprite.json` — add `"p2"`: for every palette colour, today's swap (R and B exchanged);
  - `test/scripts/assets/coop.test.ts` (update), `test/scripts/assets/coop-p2.test.ts` (new: exact mapping, the three
    issues, a temp-tree override PNG with a sidecar map), `test/scripts/assets/sprite-source-edge.test.ts` (the key).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/coop.test.ts \
    test/scripts/assets/coop-p2.test.ts test/scripts/assets/sprite-source.test.ts \
    test/scripts/assets/sprite-source-edge.test.ts test/scripts/assets/pipeline.test.ts \
    test/scripts/assets/interim-pipeline.test.ts test/scripts/art-origins.test.ts test/integration/content.test.ts
  node scripts/generate-assets.mjs --force && sha256sum assets/generated/atlas/*   # ATLAS-SHA, before and after
  pnpm store:assets --check            # expected: exit 0
  pnpm docs:images --check             # expected: exit 1, and only docs/images/logo.png flagged (since the flip)
  node scripts/art-origins.mjs --check
  ```
  Run the two image checks as separate commands, never chained with `&&`: the second exits 1 by design.
- **Acceptance:** the sha256 of every page and of `main.json` identical before and after (default scale);
  `pnpm store:assets --check` exit 0; `pnpm docs:images --check` flags only `docs/images/logo.png`;
  `interim-pipeline.test.ts`' scale-1 digest pin unchanged; `git grep -n swapRedBlue` empty; the three issues tested;
  the origin report at 0 failures.
- **Token:** none.
- **Traps:** pixel maps keep their rows exactly (Prettier skips `assets/source/`; do not reflow them). `pnpm
  docs:images --check` already flags `docs/images/logo.png` since the flip (R2-03 regenerates it); every other image
  must stay clean. Do not edit `procedural/palettes.mjs` (V5) or the ingest tool (V2b).
- **Docs needs:** `asset-pipeline.md` "Player 2's palette swap" → the palette map; `coop.md` (p2).

### R3-03.V2b — The ingest recipe key `p2`, written to the sidecar

- **Wave / lane / order:** wave 04, lane 4, first.
- **Depends on:** `R3-03.V2a` on master (V2b writes the `meta.shmup.p2` sidecar format that V2a's
  `readPngFrames` reads).
- **Goal:** an ingested ship can carry its player-2 palette map from its recipe into the PNG sidecar, so real art
  gets an `@p2` variant without code.
- **Files (only these):**
  - `art-prompts/ingest/lib/recipe.mjs` — `RECIPE_KEYS` (`:82`) gains `p2`; validate `#rrggbb` pairs;
  - `art-prompts/ingest/lib/pipeline.mjs` — the sidecar writer (its `meta` object, `:950-991`) writes
    `meta.shmup.p2` into the frame sidecar; `lib/finish.mjs` is the pixel stages only — touch it just if the
    map must ride a pixel pass;
  - `art-prompts/ingest/test/recipe.test.mjs`, `art-prompts/ingest/test/pipeline.test.mjs` (the sidecar's
    `meta`, cf. `:210-211`);
  - a new fixture under `art-prompts/ingest/test/fixtures/` (a ship recipe with `p2`; model `qwenvl`, cleanup
    `heavy`, `reviewed` set) and its committed outputs (`.png`, `.json`, `.art.json`), made by the fixture maker
    `art-prompts/ingest/test/fixtures/make-fixtures.mjs` if it covers it;
  - `art-prompts/ingest/README.md` — the recipe key;
  - `test/scripts/assets/p2-ingest.test.ts` (new: the fixture output in a temp source tree → `buildAtlas` → `@flash`
    is the silhouette, `@p2` mapped, frame for frame);
  - `test/scripts/assets/provenance.test.ts` — only `FIXTURE_NAMES` (`:42-48`) if it must list the new fixture.
- **Tests:**
  ```bash
  cd art-prompts/ingest && npm ci && npm test && node ingest.mjs --check && cd ../..
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/p2-ingest.test.ts \
    test/scripts/assets/provenance.test.ts test/scripts/art-origins.test.ts
  ```
- **Acceptance:** `ingest.mjs --check` byte-identical and the **old fixtures unchanged**; the new fixture's sidecar
  holds the map; `art-origins.test.ts`' fixture counts (7 failures at `:324`) hold — if they move, do not edit that
  file: report the new numbers (V5 owns `art-origins.test.ts` in this wave).
- **Token:** none.
- **Traps:** add fixtures, never change old ones; no new npm dependency (`art-prompts/ingest/package-lock.json` stays);
  the fixture's model must not be FLUX (decision RR-4) and its record needs cleanup `heavy` or `redrawn` and
  `reviewed` set, or the origin report's counts move.
- **Docs needs:** `real-assets.md` (recipe `p2`).

### R3-03.V4a — The ingest tile collision modes

- **Wave / lane / order:** wave 04, lane 4, after `R3-03.V2b` (same file `recipe.mjs`).
- **Depends on:** `R3-03.V2b` pushed.
- **Goal:** a real-art tile can be ingested either clipped to its designed collision mask, or with a mask derived
  from its art (decision W5-11).
- **Files (only these):**
  - `art-prompts/ingest/lib/recipe.mjs` — for category `tile`: `collision: { tileset: "<path>", mode:
    "clip-to-mask" | "mask-from-art" }`;
  - `art-prompts/ingest/lib/pipeline.mjs` and/or `art-prompts/ingest/lib/finish.mjs` — clip: the alpha is the
    designed mask per frame; from art: column heights from the opaque pixels, an error when a column is not one run
    from its anchor edge; writes `<name>.masks.json` next to the PNG, **never** into `content/`;
  - `art-prompts/ingest/test/pipeline.test.mjs` plus 12-px fixtures (a tileset JSON and two tile sheets) under
    `art-prompts/ingest/test/fixtures/`;
  - `art-prompts/ingest/README.md`.
- **Tests:** `cd art-prompts/ingest && npm ci && npm test && node ingest.mjs --check`.
- **Acceptance:** both modes and the one-run rule tested; the old fixtures byte-identical.
- **Token:** none.
- **Traps:** the heightfield places slope and surface tiles **by anchor + mask** (`packages/core/src/data/tilemap.ts`
  `maskKey`, `:375-455`): a derived mask that differs from the designed one makes the heightfield miss tiles. That is
  why "clip to mask" is the default for every tile the heightfield matches (W5-11).
- **Docs needs:** `real-assets.md` (recipe `collision`, `masks.json`).

### R3-03.V4b — The repo-side mask copy and the shared terrain checks

- **Wave / lane / order:** wave 04, lane 4, after `R3-03.V4a`.
- **Depends on:** `R3-03.V4a` pushed.
- **Goal:** a script that copies ingested masks into a tileset, and a shared module with the two terrain checks of
  `stage-terrain.test.ts`, so ingested tiles can be proven against them.
- **Files (only these):**
  - `scripts/assets/tileset-masks.mjs` (new) — `--check | --write <tileset> <masks.json> [--allow-remap]`; refuses to
    change the mask of a floor or ceiling tile the heightfield places by anchor + mask unless `--allow-remap`;
  - `test/integration/terrain-checks.ts` (new) — a **copy** of the two checks of `test/integration/stage-terrain.test.ts`
    (`expectMasksMatchArt` at `:71`, used by the test at `:131`, and the heightfield check — the test "a 12-px
    fixture: the heightfield finds a tile for every cell it shapes" at `:158`, its body made a function that takes a
    tileset file — lines on `95210d1`; `R2-02.T2e` may move them in wave 3, so find them by name), exported;
  - `test/scripts/assets/tileset-masks.test.ts` (new) — a temp 12-px tileset, a stage and V4a's ingested tiles pass
    both checks; the refusal; `--write` never touches `content/` unless given a path there;
  - `scripts/README.md` — one row (append; if another lane pushed a row first, rebase).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/tileset-masks.test.ts \
    test/integration/stage-terrain.test.ts test/integration/frame-literals-repo.test.ts
  ```
- **Acceptance:** both modes pass the terrain checks; the refusal tested; `stage-terrain.test.ts` unchanged.
- **Token:** none.
- **Traps:** **copy, do not edit** `stage-terrain.test.ts`: wave 3's `R2-02.T2e` changed it and wave 5's
  `R2-02.U4` changes it (U4 removes its `itPortPending` wrappers); `R3-03.V4c`
  (wave 5, after U4) makes it import `terrain-checks.ts`. `scripts/**` is in the frame-literal scan: no
  `384 216 200 208 192 108 640 360 336 348`.
- **Docs needs:** `real-assets.md`, `advanced-stages.md` or `stage-runtime.md` (the masks tool), `scripts/README.md`
  row text.

### R3-03.V5 — Real-art bullet variants by recolouring the override

- **Wave / lane / order:** wave 04, lane 3, after `R3-03.V2a`.
- **Depends on:** `R3-03.V1` (wave 2 — its native v2 bullet art is what V5 recolours) and `R3-03.V2b` on
  master (in this wave only V5 edits `test/scripts/art-origins.test.ts`, so V2b reports its count changes here).
- **Goal:** when an engine bullet, beam or bend sprite gets a PNG override, its colour-blind `@<palette>` siblings
  are made by recolouring that override frame for frame (decision W5-13), with provenance kind `palette`.
- **Files (only these):**
  - `scripts/assets/pipeline.mjs` — for a bullet, beam or bend sprite (`BULLET_SPRITES` filtered to `bullets/` and
    `lasers/`, the palette-variant test `content.test.ts:863-864`) that has a PNG override: drop its procedural
    `@<palette>` siblings and recolour the override (rim, body and core classified by luma against the
    family's three v1 colours; the `BULLET_PALETTES` body colours plus `CORE_MARKS`; origin `palette:<base>`);
  - `scripts/assets/procedural/palettes.mjs` — export the tables it needs (`BULLET_PALETTES` `:29`, `CORE_MARKS` `:40`
    are exported already; add only what is missing);
  - `scripts/art-origins.mjs` — `codeOrigin` (`:490-500`): kind `palette` inherits its base's class and models, like
    `flash:` and `p2:`;
  - `test/scripts/assets/palette-recolour.test.ts` (new; a temp-tree fixture override);
  - `test/scripts/art-origins.test.ts` — one case for `palette`, and V2b's reported count change if any.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/palette-recolour.test.ts \
    test/scripts/art-origins.test.ts test/scripts/assets/interim-pipeline.test.ts test/integration/content.test.ts
  node scripts/art-origins.mjs --check
  node scripts/generate-assets.mjs --force && sha256sum assets/generated/atlas/*   # ATLAS-SHA, before and after
  ```
- **Acceptance:** the shipped atlas unchanged (no override exists today); the fixture gives every variant with its
  marks, frame for frame; the origin report holds 438 procedural sprites and 0 failures.
- **Token:** none.
- **Traps:** every bullet / beam / bend sprite keeps every `@<palette>` variant frame for frame (`content.test.ts:863`);
  the generators' v1 paths stay byte-identical (RR-1). Exact maths only in the recolour (no `Math.pow`, no float
  luma that can differ across engines — integer weights).
- **Docs needs:** `asset-pipeline.md` (palette variants of real art), `art-provenance.md` §9 (kind `palette`).

### R3-04.M1a — The stand-in generator, part 1 (palette, backdrops, bands, tiles)

- **Wave / lane / order:** wave 04, lane 5, first.
- **Depends on:** nothing in this wave.
- **Goal:** a seeded generator that draws a zone of v2-detailed stand-in art at the bible's sizes, so R3-04 can
  measure memory and bytes before real art exists (decision W5-14).
- **Files (only these):**
  - `scripts/assets/standin.mjs` (new; never used by the shipped pipeline — only hashed with `scripts/assets/`
    (`pipeline.mjs:84`), so it may import `scripts/frame.mjs`; adding the file makes `pnpm assets` rebuild once, and
    the atlas bytes do not change) —
    `standinZone(zoneId, { seed })`: a seeded zone palette of 48–64 colours, every colour ≥ 3/255 (Chebyshev) from
    the 8 reserved cycle ramps; the far layer `FRAME_W × FRAME_H` (or `2 * FRAME_W` wide), opaque; 3–5 bands of
    `FRAME_W` × 120–240, keyed; a 40-tile 12-px set; named entropy constants (noise, detail density), documented in
    the docblock as **uncalibrated** (RR-7: aimed at PNG-8 0.3–0.6 MB per 2048×1024 page);
  - `test/scripts/assets/standin.test.ts` (new) — two runs byte-identical; the sizes; the colour caps (art bible
    §4.3: zone palette 48–64; backdrop layer, boss body and tileset ≤ 32; enemy up to 30 px ≤ 16; larger enemy and
    boss part ≤ 24 — the enemy and boss caps check `R3-04.M1b`'s sprites).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/standin.test.ts \
    test/integration/frame-literals-repo.test.ts
  ```
- **Acceptance:** deterministic; bible sizes and the §4.3 colour caps (as listed under Files) hold; no banned frame
  literal.
- **Token:** none.
- **Traps:** exact maths and the seeded `scripts/assets/rng.mjs` only (no `Math.random`, no `Math.sin`); write
  `FRAME_W`, `FRAME_H` from `scripts/frame.mjs`, never `640` / `360`. Do not edit `scripts/assets/pipeline.mjs`.
- **Docs needs:** `asset-pipeline.md` (the stand-in).

### R3-04.M1b — The stand-in generator, part 2 (enemies, boss, the atlas)

- **Wave / lane / order:** wave 04, lane 5, after `R3-04.M1a`.
- **Depends on:** `R3-04.M1a` pushed.
- **Goal:** complete the stand-in with sprites and pack it through the real pipeline in a temp tree.
- **Files (only these):** `scripts/assets/standin.mjs` (≈ 10 enemies × 4–6 frames with `@flash`; a boss of ≈ 420 ×
  `Math.round(0.6 * PLAYFIELD_H)` in 3 states plus its parts and `@flash`; `standinAtlas(zones)`, steps below);
  `test/scripts/assets/standin.test.ts`.
- **Steps of `standinAtlas(zones)`:**
  1. `mkdtemp` a **temp source tree** and copy all of `assets/source/` into it (`cpSync(DEFAULT_SOURCE_DIR, tmp,
     { recursive: true })`, as `test/scripts/assets/interim-pipeline.test.ts:267` does; `tmp` = the temp tree's
     path). `buildAtlas` reads the sprites, the fonts and `atlas-groups.json` from that one root
     (`pipeline.mjs:360-367`, `:442`), and every name a groups file lists must be a sprite there, so today's sources
     must come too.
  2. Write each stand-in as a `<name>.sprite.json` pixel map into `sprites/standin/zone-<x>/…` of the temp tree (the
     name is that path, e.g. `standin/zone-a/boss`), with `"native": true` and, for the enemies, the boss and its
     parts, `"hitFlash": true`. Palette keys are single printable ASCII characters (`!` … `~`: 94, so 48–64 colours
     fit). Not PNG overrides: a PNG with no code-defined sprite is added with `hitFlash: false`
     (`sprite-source.mjs:624-633`), so the pipeline makes no `@flash` for it, and a `…@flash.png` is refused
     (`SPRITE_NAME_PATTERN`, `:103`, has no `@`).
  3. Overwrite the temp tree's `atlas-groups.json` with the shipped groups, unchanged, plus one group per stand-in
     zone, `standin-zone-<x>`, listing that zone's stand-in names. The shipped groups keep today's zone sprites out
     of `common` (every procedural sprite is always added, `pipeline.mjs:390`); the stand-ins' own groups keep the
     stand-in pages pure — the zone's own v2 pages, PNG-8 within 256 colours, not mixed with today's interim zone
     sprites (so `common` is the shipped `common`: the stand-in draws zone art only).
  4. `buildAtlas({ sourceDir: tmp })` — the real packer, groups and PNG-8 encoder — then remove the temp tree.
- **Tests:** as M1a.
- **Acceptance:** `standinAtlas` of the nine zones gives the groups `common`, today's `zone-a` … `zone-i` and the
  nine stand-in groups `standin-zone-a` … `standin-zone-i`; every page ≤ 2048²; each `standin-zone-<x>` group's
  pages are PNG-8 (colour type 3) and their bytes, scaled to a 2048×1024 page (`Σ bytes × 2048 × 1024 / Σ (w × h)`),
  fall in 300,000–600,000 (RR-7); deterministic.
- **Token:** none.
- **Traps:** the boss height is `Math.round(0.6 * PLAYFIELD_H)` (= 202), **never** a literal `200`: the repo scan
  fails it. Never write into `assets/source/` or `assets/source/atlas-groups.json` (only read them); the temp tree is
  `mkdtemp`'d. The stand-in groups are `standin-zone-<x>`, never `zone-<x>`: today's zone groups stay as shipped.
- **Docs needs:** `asset-pipeline.md` (the stand-in atlas).

### R3-04.M1c — (optional) Calibrate the stand-in on real candidates

- **Wave / lane / order:** wave 04, lane 8, optional, after `R3-04.M1b`; skip it if no slot is free (decision RR-7).
- **Depends on:** `R3-04.M1b` pushed; the candidates folder on the host.
- **Goal:** tune `standin.mjs`' entropy knobs so its PNG-8 bytes per Mpx match real AI art.
- **Files (only these):** `scripts/assets/standin.mjs` (only the entropy constants and their docblock);
  `test/scripts/assets/standin.test.ts` (only `R3-04.M1b`'s byte band, and only if the measured bytes move it out of
  RR-7's 0.3–0.6 MB — then the commit body says so).
- **Steps:** ingest about 6 **Qwen-Image** candidates (a backdrop, a boss, an enemy sheet; Apache-2.0) from
  `art-prompts/v2/candidates/` into a temp `--root` with `art-prompts/ingest/ingest.mjs` (after
  `cd art-prompts/ingest && npm ci` — its own npm project, rule 6, without the `--check`); measure their PNG-8
  bytes per Mpx; set the knobs; replace the docblock's **uncalibrated** mark with the measured numbers, and record them in
  the commit body too.
- **Tests:** as M1a.
- **Acceptance:** the measured bytes per Mpx are in the commit body; the generator stays deterministic.
- **Token:** none.
- **Traps:** **the art data on myadmin1 is a snapshot** copied from the old host (`art-prompts/v2/candidates/`,
  961 MB, git-ignored; the picker's `choices.json` at `/home/sites/mystage/public_html/shmup-cup/data/choices.json`,
  not served). M1c needs only candidate images, not the picks: ask the owner for a fresh `choices.json` copy **only
  when M1c wants winners** (never read the snapshot's picks as current). **No FLUX candidate**, even as a reference
  (RR-4). Nothing from `candidates/` is committed. If skipped, the constants stay marked "uncalibrated" (as M1a wrote
  them; RR-7: PNG-8 at 0.3–0.6 MB per 2048×1024 page).

### R3-04.M2a — Measure the stand-in against the memory budget

- **Wave / lane / order:** wave 04, lane 5, after `R3-04.M1b`.
- **Depends on:** `R3-04.M1b` pushed.
- **Goal:** a test that measures each stand-in zone and `common` against the texture budget, in bytes.
- **Files (only these):** `test/integration/standin-budget.test.ts` (new): for `common` and per stand-in zone, the
  pages and `estimateStageMemory({ …, needs, imagePolicy })` (`packages/shell/src/memory/index.ts:1097`; `needs`
  built by hand: `common`'s pages global, each `standin-zone-<x>` page needed by zone x's stage only, today's
  `zone-<x>` pages by none). **The gate:** textures + images ≤ `TEXTURE_BUDGET_BYTES` (`:261`, 23 MiB at 640×360)
  under `imagePolicy: 'none'` (W5-15's policy: the decoded images dropped) **and** `withinBudget` (total ≤
  `MEMORY_BUDGET_BYTES`, 100 MiB, `:123`); the `'resident'` figure is printed beside it, not gated. Also the PNG
  bytes; with `SHMUP_STANDIN_PRINT=1` it prints the table.
- **Tests:** `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/standin-budget.test.ts`.
- **Acceptance:** the budgets in bytes; the printed table in the commit body.
- **Token:** none.
- **Traps:** the test builds in memory; never read `assets/generated/` (CI's test job does not run `pnpm assets`).
- **Docs needs:** `platform-polish.md` (the budget reasoning — required by R3-04's scope).

### R3-04.M2b — Set the v2 budgets in bytes

- **Wave / lane / order:** wave 04, lane 5, after `R3-04.M2a`.
- **Depends on:** `R3-04.M2a` pushed; `R3-03.V1` on master (it edits `interim-pipeline.test.ts`, a user of
  `atlas-budget.ts`).
- **Goal:** `DIST_BUDGET` and the atlas byte caps derived from the stand-in projection (decision W5-16, ≈ 16 MiB).
- **Files (only these):**
  - `apps/tizen/scripts/check-bundle.mjs` — `DIST_BUDGET` (`:97`) and its derivation in the docblock (`:82-96`):
    `common` + 9 stand-in zones + code + recorded audio + margin;
  - `apps/tizen/test/scripts/check-bundle.test.ts` (`:277` and `:300` the test names' "8 MB", `:278` the constants,
    `:313` the "8192.0 KB" message), `apps/tizen/test/scripts/check-bundle-budgets.test.ts` (`:3` the docblock's
    "8 MB", `:124-133`);
  - `apps/webos/test/scripts/check-bundle.test.ts` (`:142-147`, the shared-budgets pin — its `8 * 1024 * 1024`);
  - `apps/tizen/README.md` (`:57`) and `apps/webos/README.md` (`:81`) — their "`dist/` ≤ 8 MB" (no docs agent owns
    these two READMEs);
  - `test/scripts/assets/atlas-budget.ts` — `ATLAS_PNG_BYTES_CAP` (`:15`) becomes a `common` cap plus a per-zone cap
    and a total; keep the export name, or update its two users `test/scripts/assets/interim-pipeline.test.ts:46,330`
    and `test/integration/cjk-budget.test.ts:47,127-128`;
  - `packages/shell/src/memory/index.ts` — docblocks only, and only once `R3-04.M3b` (the one M3 subtask whose block
    lists this file) is on master and reviewed; otherwise put the docblock text in your report;
  - `test/README.md` — the `atlas-budget.ts` row (append; rebase if another lane pushed first).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/scripts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project webos apps/webos/test/scripts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/cjk-budget.test.ts \
    test/scripts/assets/interim-pipeline.test.ts test/integration/tv-engine-floor.test.ts
  pnpm --filter @shmup/tizen build && pnpm --filter @shmup/webos build && pnpm bench:tv
  ```
- **Acceptance:** every budget has its derivation in a docblock; both bundle checks pass, and so does `bench:tv`
  (`DIST_BUDGET` also governs `dist-bench/`, `check-bundle.mjs:399`); the webOS check imports the Tizen budgets (it
  must not repeat them).
- **Token:** none.
- **Traps:** the M3-03 CJK figures stay at `artScale: 1` (`cjk-budget.test.ts`); the scale-1 digest pin is not
  yours to touch. A budget is set from a measurement with its derivation, never raised to make a test pass.
- **Docs needs:** every "8 MB" / "8 MiB" said of `DIST_BUDGET`: `build-test-deploy.md` (`DIST_BUDGET`; `:149`,
  `:168`, `:310`), `platform-polish.md` (the budget reasoning; `:346`), `api-reference.md` (`:1735`),
  `debug-and-replays.md` (`:707`, `:711`), `real-assets.md` (`:31`).

### R3-04.M4a — The stand-in in the TV bench's decode scenario

- **Wave / lane / order:** wave 04, lane 6, first.
- **Depends on:** `R3-04.M1b` on master.
- **Goal:** the TV bench decodes one stand-in zone plus `common` instead of the two synthetic 2048² pages (decision
  RR-8 / W5-17), and renders one frame from them.
- **The new ids and bands (decided here):**
  - `DECODE_PAGE_IDS` (`apps/tizen/scripts/bench-decode.mjs:53`) becomes `['standin-zone-a', 'common', 'zone-a']`:
    the stand-in zone A's page (group `standin-zone-a` of `standinAtlas(['zone-a'])`, `R3-04.M1b`) replaces
    `rgba-2048` / `png8-2048`. If that group packs onto two pages, the second is `standin-zone-a-2`, listed right
    after the first. The shipped `common` and `zone-a` pages stay as they are; `common` is also the stand-in's
    `common` (M1b's atlas draws zone art only, so its `common` page is the shipped one — no second copy).
  - `DECODE_BYTE_BANDS` (`:61-62`) becomes `{ standin: [300_000 / (2048 * 1024), 600_000 / (2048 * 1024)] }` — RR-7's
    PNG-8 0.3–0.6 MB per 2048×1024 page, in bytes **per pixel** — and the tests check the stand-in pages together
    against it (`Σ bytes / Σ (width × height)`), as M1b's acceptance does.
  - `decodeArtImage`, `DECODE_PAGE_SIZE` and `DECODE_SEED` stay exported (their tests and the sha pins in
    `test/integration/tv-render-bench.test.ts` stay), but the build no longer ships a page drawn by them: say so in
    the module docblock.
  - **The 20th page load:** after `decode` (index 18, `DECODE_SCENARIO_INDEX` unchanged) the bench loads the page once
    more for `standin-zone` (index 19; headless: `?scenario=standin-zone`), draws one `FRAME_W × FRAME_H` frame from
    the stand-in pages (bands, tiles, a row of enemies, the boss) and measures it like a render scenario. Its record
    is a `RenderBenchRecord` (scenario `standin-zone`, index 19 — the type in `packages/shell` does not change),
    stored and sent like a render scenario's. `BENCH_RUN_LENGTH` becomes 20; the 18-scenario matrix (`matrix.ts`)
    does not change.
- **Files (only these):**
  - `apps/tizen/scripts/bench-decode.mjs` — the ids, the bands and `buildDecodePages` (the stand-in pages from
    `standinAtlas(['zone-a'])`, `scripts/assets/standin.mjs`);
  - `apps/tizen/scripts/bench-atlas.mjs` — the virtual module gains the stand-in pages' manifest for the 20th load
    (its page URLs are the same `decode-standin-zone-a*.png` files), and the docblock's decode list (`:42-43`);
    `apps/tizen/src/bench/virtual-bench.d.ts` — its declaration, and the id / URL docblocks (`:33`, `:41`);
  - `apps/tizen/src/bench/decode.ts` (`:48` `BENCH_RUN_LENGTH`, `:7` and `:64` the docblocks), `run.ts`, `scene.ts`,
    `state.ts` (the docblocks at `:11-13` and `:39-43`), `results.ts` (the run lines, `:391` and `:414-420`) and the
    barrel `index.ts` (the docblock `:34-41`, the exports `:173-178`) — only for the 20th page load;
  - `packages/shell/src/telemetry/index.ts` — the `DecodeBenchPage` id docblock (`:1656`) only;
  - tests: `apps/tizen/test/scripts/bench-decode.test.ts`, `apps/tizen/test/bench/bench-decode.test.ts` (`:147`, the
    run length), `apps/tizen/test/scripts/check-bundle-bench.test.ts`, `apps/tizen/test/build/bench-build.test.ts`
    (`:86-87` the file list, `:105-119` the bands), `apps/tizen/test/scripts/bench-atlas.test.ts` (`:278-279`),
    `apps/tizen/test/bench/{bench,bench-state,bench-run,bench-results,bench-scene,bench-scene-alloc}.test.ts` and
    `fake-record.ts` (only the ids, the run length and the 20th load), `test/integration/tv-render-bench.test.ts` (`:236`, the run
    length; the 20th load — `R3-04.M4b` edits this file again after you);
  - `tools/input-probe/results/analyze-bench.mjs` — `decodeZoneEstimate` (`:272-288`) reads the new ids: `common`
    plus the stand-in zone pages, each at its median (no ×2 — the zone's pages are measured); a session recorded
    before this change (`rgba-2048` / `png8-2048`) keeps today's formula. The `standin-zone` record is printed on its
    own line, not in the matrix tables. The zone-load-estimate header print (`:330-332`, the `ZONE_PAGES` sentence)
    is reworded to the measured-pages formula (or `ZONE_PAGES` stops being used there); `R3-04.M4b` does not edit
    this file. And `tools/input-probe/test/analyzeBench.test.ts` (a case for the new ids;
    the old fixture and its cases stay).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tv-render-bench.test.ts
  pnpm bench:tv
  cd tools/input-probe && npm ci && npm run verify
  ```
- **Acceptance:** `dist-bench/` passes `check-bundle`; the scenario matrix stays 18 and a run is 20 page loads; the
  analyser reads the new ids (and still a session with the old ones).
- **Token:** none.
- **Traps:** never package or install the bench (`bench:tv:package` / `bench:tv:install` are the owner's); the bench
  is never in the game's bundle (check-bundle rule 9). Chromium 68 floor in `apps/tizen/src/bench/*`.
  `tools/input-probe` is its own npm project (not linted by the root ESLint).
- **Docs needs:** `tools/input-probe/README.md`, `build-test-deploy.md` (the bench scenario; `:310`, `dist-bench/`'s
  size), `api-reference.md` (`:1748`, the `bench-decode.mjs` row: `DECODE_PAGE_IDS`, now
  `['standin-zone-a', 'common', 'zone-a']`, and `DECODE_BYTE_BANDS`; `:1661`, the `DecodeBenchPage` id list),
  `docs/client/outstanding-work.md` (the owner's M7 run).
- **Owner (Manual):** run `bench:tv` with the stand-in scenario on the M7 (R0-03).

### R3-04.M4b — A "v2 zone stand-in" scenario in the headless render bench

- **Wave / lane / order:** wave 04, lane 6, after `R3-04.M4a`.
- **Depends on:** `R3-04.M4a` pushed.
- **Goal:** the Node / Playwright render bench measures a zone drawn from the stand-in pages.
- **Files (only these):** `test/bench/render.perf.ts` (the `SCENARIOS` list, `:150-218`), `test/bench/render-harness/load.ts`,
  `test/integration/render-bench.test.ts`, `test/integration/tv-render-bench.test.ts`.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/render-bench.test.ts \
    test/integration/tv-render-bench.test.ts
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts test/bench/render.perf.ts
  ```
- **Zone-load estimate (decision W5-19; R3-04's "zone-load time ≤ 2 s on the M7"):** check for the owner's R0-03
  logs with `ls -d tools/input-probe/results/*-m7-bench/`.
  - If it lists a folder: estimate a zone load as the stand-in pages' load time in headless Chromium (the shell's
    `data-shmup-atlas-*` timings, or the bench's load timing) × the R0-02 desktop-to-M7 ratio (the same bench
    scenario's time on the M7 ÷ its time in headless Chromium, read with `tools/input-probe/results/analyze-bench.mjs`).
    Write the estimate, the ratio and their sources in your report, against 2 s.
  - If it lists nothing (§17 has R0-03 `not started` today): write `zone-load: unmeasured until the owner's M7 run
    (R0-03)` in your report.
  Never guess a ratio.
- **Acceptance:** the new scenario runs; `DRAW_CALL_BUDGET` 20 and the heap gate are **not raised**; the report holds
  the zone-load estimate or its "unmeasured" line.
- **Token:** none.
- **Traps:** a bench file runs under the e2e lock; never run the whole `pnpm bench` (wave 15 does).
- **Docs needs:** `render-performance-review.md` (a short note), `build-test-deploy.md`; the zone-load figure or its
  "unmeasured" flag (for `W05.DOCS-F`).

### R0-04.W2 — Prompt-library edits 1–4 and the licence note

- **Wave / lane / order:** wave 04, lane 8 (filler; any later wave if no slot is free).
- **Depends on:** nothing.
- **Goal:** apply the remaining prompt-library edits of plan R3-01's Manual list and write R3-05's licence note.
- **Files (only these):**
  - `art-prompts/images/00-style-kernel.md` — edit 1 (the v2 targets table: a lead line that the bible wins; bullets
    11 / 13 / 17, point item 7, particles 7 / 9 / 13; laser beam 12 frames, node 1; force field "4 wear × 1–2
    shimmer"; Options "hand, or AI concept → heavy cleanup"; the backdrop lighting budget) and edit 2 (the K3 rules
    point to bible §8 for the yellowish key, hole seeds and despill, and name the only sprites allowed on the black
    key — the additive and translucent ones of bible §3.6);
  - `art-prompts/images/README.md` — edit 3 (model heuristics: FLUX.2-dev first for text, Qwen-Image second; SD3.5
    swatches are material references only) **with the note that FLUX is on hold** (RR-4), plus a "Licences" section
    from `docs/dev/art-provenance.md` §2 / §6: FLUX on hold; Qwen-Image and Wan ship; SD3.5 after registration and under
    USD 1 M revenue; LTX under USD 10 M with its note;
  - `art-prompts/images/40-enemies/zone-*.md` and the matching `zone-*.json` (they mirror each other) — edit 4 (one
    subject per sheet; drop "dithered highlights only" (zone A v2) and "light dithering on metal" (zone A v3); fix the
    stale "Grid layout on a single flat navy field" (zone A v1)).
- **Tests:**
  ```bash
  node art-prompts/generate.mjs --list
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/art-prompt-names.test.ts
  ```
- **Acceptance:** the library parses; the name check passes; `.md` and `.json` of each zone sheet agree.
- **Token:** none.
- **Traps:** edit 7 ("SNES-era" → "16-bit console era", 1,379 hits by `git grep -c "SNES-era"` on 2026-10-19;
  `plan_resolution.md:1673` says about 1,400 of bare "SNES") waits for the owner's decision: do not do
  it. The FACET MONARCH label reword (Q-5) likewise: only if the owner has decided it — then reword the label in
  `art-prompts/v2/manifest.json` (the zone G boss line, "the crystal core with an orbiting crown") and update its
  `KNOWN_HITS` pin in `test/integration/art-prompt-names.test.ts`; those two files join your Files list only then.
  Until decided, leave both unchanged. `art-prompts/` is outside the workspace and not formatted by Prettier — keep
  its layout. Original names only.
- **Docs needs:** plan R3-01 / R0-04 Manual lists (edits 1–4 done, edit 7 pending).

### R0-04.W1 — Copy the art-round winners into the repository (owner-gated)

- **Wave / lane / order:** wave 04, lane 8, **only when the owner opens it**; otherwise it stays open into later
  waves (it blocks nothing).
- **Depends on:** the owner's "picking is done"; the owner's Git LFS decision; a **fresh copy of `choices.json` from
  the owner**.
- **Goal:** copy every picked winner, its edits and its followups with their sidecars into
  `art-prompts/v2/winners/<id>/`, so later real-art ingest (R3-02's owner part, R5's `S3` drops) has committed inputs.
- **Files (only these):** `art-prompts/v2/copy-winners.mjs` (new: reads a **copy** of `choices.json` and
  `art-prompts/v2/candidates/ledger.json`; copies, never moves, a candidate); `art-prompts/v2/winners/**` (new);
  `.gitattributes` (only if the owner chose Git LFS); `art-prompts/v2/STATUS.md`.
- **Steps:** a dry run first (it prints the counts per pick; they must match the choices: about 334 decided items —
  281 `a`, 49 `b`, 4 `c` in the last snapshot), then the real copy; commit with explicit paths (plan R0-04 (e):
  committing these copies under `winners/` is the one exception to Common rule 14; the `candidates/` folder itself
  is never committed).
- **Tests:** the dry run; `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/art-prompt-names.test.ts`.
- **Acceptance:** one folder per decided subject with its winner, edits, followups and sidecars; nothing moved out of
  `candidates/`; `STATUS.md` says which `choices.json` copy (its time) was used.
- **Token:** none.
- **Traps:** **myadmin1 holds only a snapshot** of the picker's data (copied from the old host; the owner keeps
  picking there and myadmin1 cannot reach it): never use the snapshot — ask the owner for a fresh copy, and treat a
  regenerate request as done only when every slot's take is newer than the click. Never write the picker's live file.
  The files are large (videos included): check the size before committing; without LFS, ask the owner if it exceeds
  what they expect. No GPU, no `art-prompts/v2/server.sh`.

## Reviews

### R2-02.S.RV1 — Review of the port commit

- **Wave / lane / order:** wave 04, review slot 1, right after S's push (a **new** reviewer for each round).
- **Goal:** check the port commit against the wave-5 reviewer gate.
- **Steps:** `<port>` in every command below = the port commit's SHA, from S's report.
  1. In a fresh worktree at the port commit's parent (`git switch --detach <port>^`), after
     `pnpm install --frozen-lockfile --prefer-offline` (S's step 1): run the tool with the flags of `R2-02.S`
     step 2 — read that block in this file, `docs/v2-run/wave-04.md` — then `git apply
     test/port-v2/handfix.patch` (the file exists at the parent), then `git diff --stat <port> -- content` must
     print nothing.
  2. `git switch --detach <port>`, run `pnpm assets` (the checks below need the atlas), then re-run the commands
     under `R2-02.S` **Tests** — read that block in this file, and skip only its e2e line — including its `find`
     of the allocation guards, plus `node scripts/content/rescale.mjs --factor 1 --dry-run`. This is the barrier's
     check (rule 7): it runs whole Vitest projects.
  3. Read the commit itself (`git show <port>`): the code diff is the kit's flip lines plus the stub (the names are
     in `R2-02.S` **Files**); the three re-pins carry the reason; no `port-pending` import was deleted.
- **Must hold:** `git diff --name-only <port>^ <port> -- test/golden/'*.replay.json' content/demos
  test/fixtures/v1-baseline` empty (`<port>` = the port commit's SHA from S's report); content equals tool + patch;
  the 4-way rules at 3.0 / 24 / 1,350; `v2-port*` green; every allocation guard the `find` lists green (66 on
  `bc8e05d`, plus any new one) with no budget raised; 286 skips as S states (280 + T4b's 6); the build delta
  reported.
- **Report:** findings by severity; zero findings means zero nits.

### W04.RV-SIDE — Reviews of the side lanes (`<id>.RV1`, `<id>.RV2`, … per side subtask)

- **Wave / lane / order:** wave 04, review slot 2, as each side subtask pushes; fix → **new** review until zero.
  Each round is its own agent, named `<subtask id>.RV<n>` (for example `R3-03.V2a.RV1`).
- **Must hold (per subtask):** the files are only those of its block; `ATLAS-SHA` unchanged where the block says so;
  the scale-1 digest pin unchanged; `INGEST` byte-identical with old fixtures untouched (V2b, V4a); the origin report
  at 0 failures (V2a, V5); budgets in bytes with derivations (M2a, M2b); both bundle checks and `bench:tv` pass (M2b,
  M4a); `DRAW_CALL_BUDGET` not raised (M4b); no API newer than Chromium 68 in shipped code; no frame literal.

## Exit check

1. `git log origin/master` holds the port commit; S's report lists its verify list green.
2. On `origin/master`, in a fresh worktree:
   ```bash
   node scripts/content/rescale.mjs --factor 1 --dry-run          # 0 changes, 0 unclassified, 0 errors
   pnpm content:check
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts \
     test/integration/content-db-fingerprint.test.ts test/integration/e2e-gates.test.ts test/golden/v2-port.test.ts
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
   ```
3. Every side-lane push of this wave reviewed to zero, or listed as a carry-over into wave 5.
4. Deferred to wave 15 (the one full suite): `pnpm test`, `pnpm test:e2e`, the whole `pnpm bench`. Look at GitHub CI
   once at the close at most; never wait on it.

## Owner (Manual) — never blocks this wave

- Run `bench:tv` with the stand-in decode scenario on the M7 (R0-03), after M4a; confirm W5-15 (memory policy) and
  W5-16 (`DIST_BUDGET`).
- For R0-04.W1: say picking is done, decide Git LFS, give a fresh `choices.json` copy.
- Decide edit 7 ("SNES") and the FLUX licence (`art-provenance.md` §8, decision 1).
- Confirm W5-2 (the ship's spawn row, frame centre 168) and W5-10 … W5-13 (R3-03's defaults) if you disagree.
