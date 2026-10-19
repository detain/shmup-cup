# Wave 0 — closing R2-01's review loops (old host's orchestrator, before the hand-off)

> Schedule: `plan_resolution.md` §18 · how to use: [`README.md`](README.md) · decisions: [`decisions.md`](decisions.md)
>
> **Run directory:** `RUN_DIR` is `/home/sites/shmup-cup-run` (README common rule 15). The commands below spell the
> path out, so each one runs as typed in a fresh shell; prose that says `RUN_DIR/…` means the same path.

**Steps:** R2-01 (its last review loop and a CI triage) · **Gate to start:** — · **Exit (summary):** the C5 review
loop at zero findings, nits included — its last review (review 4 of the C5 fixes since `c67c7c9`, or a later round
after a fix); the four runs of `W00.TRIAGE` green (`--retries=0`). Otherwise the open items become `R2-01.F1` in
[wave 1](wave-01.md).

**Status: closed** — 2026-10-19, the C5 review loop at zero findings, nits included, by reviews 5 and 6
(`r2-01C5-review5.md` — the fixes it ended on: `409a36c`, `9da5dc2`, `8e5272b`, `72a9b65`, `725297a`, and
review 5's one nit fixed in `602f8ab`; the full Chromium e2e 149 passed / 78 skipped / 0 failed, zero flaky).
Nothing of wave 0 becomes `R2-01.F1`; a closed wave 0 needs no re-run.

**Who closes it:** the previous (old host's) orchestrator sets the status line above to `**Status: closed**` and
fills in the closing SHA when the C5 loop reaches zero; after that the driver skips this wave. If the status line
still reads `**Status: open**` when the run starts, the open findings are in the newest `r2-01C5-review*.md` and
`w4-C5-fix*-report.md` under `/home/sites/shmup-cup/.claude/orchestrator/` on myadmin1 — that copy is flat, there
is no `scratchpad/` folder there; if the newest report is missing, the old orchestrator still holds it in its
session scratchpad, so ask the owner for it (the hand-off note in the "The new run's orchestrator" list below).

Background: C5 review 2 (of `293e885` + `bc8e05d`) found 3 should-fix items and 1 nit (S1–S3, N1). C5 fix 2
`c67c7c9` (`test(R2-01): e2e waits on ticks, not frame rate (C5 review 2)`, test files only) fixed all four. C5
review 3 of `c67c7c9` (with the full Chromium e2e on myadmin1) found 3 should-fix items and 1 nit — review 2's flake
patterns in sibling specs. C5 fix 3 `8ff2bf6` (`test(R2-01): one shared tick helper; the remaining e2e waits count
ticks (C5 review 3)`, test files only: the new `test/e2e/ticks.ts` and `test/integration/e2e-ticks.test.ts`, and ten
specs) and C5 fix 4 `543887b` (`test(R2-01): every e2e boot wait allows BOOT_TIMEOUT_MS; fly-in and item polls count
ticks (C5 review 3)`, test files only) pushed those fixes and the sweep that followed, and C5 fix 5 `0cabaec`
(`test(R2-01): rebind's taps and pauses count ticks, not rAF frames (C5 review 3)`, `test/e2e/rebind.spec.ts` only)
the slow-host repro's last timeout. Then `424afd7` and `b0dede1` (`test(R2-01): menu specs' taps (and, where the sim
always runs, pauses) count ticks (C5 review 3)`, then `test(R2-01): display-options' and bullet-palette's key taps
count ticks (C5 review 3)`; the patches that `w4-C5-fix5-report.md` left, pushed by the next fixer, report
`w4-C5-fix6-report.md`; test files only: seven menu specs) made the menu specs' frame-paced key taps count ticks.
C5 review 4 of these fixes (`8ff2bf6`, `543887b`, `0cabaec`, `424afd7`, `b0dede1` and any later C5 fix; with the
slow-host repro and the myadmin1 run) and any fix → new review round after it belonged to this loop too — and the
loop ran its course: reviews 4, 5 and 6, review 4's fixes `409a36c` … `725297a`, review 5's one nit fixed in
`602f8ab`, ending at zero (the status line above). The driver
checks the literal `**Status: open**` / `**Status: closed**` at the start of the status line: keep that spelling.

- **The new run's orchestrator**, before wave 1, reads the status line on `origin/master`:
  - **closed:** nothing of wave 0 is left (the loop's last, zero-finding review already ran its e2e on myadmin1); go
    to wave 1.
  - **open:** take the open findings from the newest C5 review report and fix report (the `r2-01C5-review*.md` /
    `w4-C5-fix*-report.md` files named above, or the owner's hand-off note; if there is none, `R2-01.F1.RV` runs the
    review); every open finding and every red check becomes `R2-01.F1` in [wave 1](wave-01.md), and wave 1 starts
    with its lane 1. When `R2-01.F1.RV` reaches zero, the orchestrator rewrites the status line to
    `**Status: closed** — <date>, <the zero review>`.

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| — (orchestrator) | `W00.C5`, with `W00.TRIAGE`'s runs inside each review round | `test/e2e/*.spec.ts`, `test/e2e/ticks.ts`, `test/integration/e2e-ticks.test.ts` — only if a fix is needed | — | yes (under the lock) |

Reviews: the C5 review loop itself. Docs item: none (the R2-01 docs pass is wave 1).

## Rules for this wave

- Wave 0 ran under the old host's orchestrator until the hand-off (its full e2e run on myadmin1; its 2-CPU
  `taskset -c 0-1` runs on myadmin1 or the old host, as `W00.TRIAGE`'s **Tests** says). After the hand-off
  nothing runs as wave 0: a closed wave 0 needs no re-run, and an open one becomes `R2-01.F1`.
- **Pushes:** a fixer pushes its own fix to `master` (README Common rule 5); review agents never push. This wave has
  no zone lane and no patch-only subtask.
- Nothing in wave 0 changes a golden, a demo, `content/` or a fingerprint; wave 0's agents do not touch
  `plan_resolution.md` — the §18 W00 row and the §17 board cells are the orchestrator's close-time edits.

## Subtasks

### W00.C5 — C5 review loop to zero (closes A5, U3 and C5)

- **Wave / lane / order:** wave 0, orchestrator, first.
- **Depends on:** the C5 fixer's commits `293e885` (the second e2e gate `PORT_UNMEASURED` / `PORT_REASON`,
  `assertionsGated`) and `bc8e05d` (the sweep review's 9 stale comment sites), `c67c7c9` (the review-2 fix), and
  `8ff2bf6`, `543887b`, `0cabaec`, `424afd7` and `b0dede1` (the review-3 fixes), all on master, and any later C5
  fix on master (`git log --oneline b0dede1..origin/master -- test/e2e test/integration/e2e-ticks.test.ts` lists
  them).
- **Goal:** C5 review 2 (of `293e885` + `bc8e05d`) found 3 should-fix items and 1 nit, all fixed by C5 fix 2
  `c67c7c9` (test files only). C5 review 3 of `c67c7c9` found 3 should-fix items and 1 nit, fixed by `8ff2bf6`,
  `543887b`, `0cabaec`, `424afd7` and `b0dede1` (test files only). The loop goes on — C5 review 4 of the fixes since
  `c67c7c9` (with the full Chromium e2e on myadmin1 and the slow-host runs), then any fix → new review — until a
  review reports zero findings, nits included. A zero C5 review also closes the A5 (the flip) and U3 (the post-flip layout pass) loops.
- **Files:** read-only; a fixer touches only the files a finding names.
- **Tests:** the reviewer re-runs `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration
  test/integration/e2e-gates.test.ts test/integration/e2e-ticks.test.ts`, the whole Chromium e2e on myadmin1 under
  the lock (`E2E_WORKERS=12 bash docs/v2-run/helpers/e2e-batch.sh --retries=0` — with `--retries=0` as its only
  argument and no spec it runs every spec; the old host's orchestrator only: in the open path `R2-01.F1` runs
  `W00.TRIAGE`'s four runs, never the whole suite) and `W00.TRIAGE`'s four runs (its **Tests**).
- **Acceptance:** a review with zero findings; every fix pushed and itself reviewed by a new reviewer.
- **Token:** none.
- **Traps:** a review that finds only nits is not zero: loop again.
- **Docs needs:** none (the docs pass is wave 1; anything new goes into the report, for `R2-01.D1` (the As built),
  `R2-01.D2` (a lasting e2e rule, `docs/dev/conventions.md` § Tests) or `R2-01.D6` (`docs/dev/build-test-deploy.md`)).

### W00.TRIAGE — CI e2e shard 1 and the flight idle drift

- **Wave / lane / order:** wave 0, orchestrator, inside the C5 review loop.
- **Depends on:** nothing.
- **Goal:** explain, and fix if real, the three e2e failures that were red on GitHub CI only (shard 1, since
  `ac40436`) and the flake seen on myadmin1. **Fixed in `c67c7c9`** (see [`handoffs-w4.md`](handoffs-w4.md) Appendix A
  (d) and the "C5 review 2" bullet under R2-01's As built). Left: the four runs under **Tests** (the third and the
  fourth are the slow-host runs of `8ff2bf6`'s specs and of `424afd7`'s and `b0dede1`'s specs), checked by the loop's
  newest review (review 4 or later). The lines on `543887b` (a later C5 fix may move them: find each test by its
  title; they were `:241` / `:355`, `:233` and `:114` on `bc8e05d`, and `:298` / `:411`, `:261` and `:152` on
  `c67c7c9`):
  - `test/e2e/campaign-run.spec.ts:217` — "A → B → D → F → H: every tally and map, …" (zone B's `clearZone` stayed in
    `game` instead of reaching `stageClear`; atlas pages `0,2`);
  - `test/e2e/campaign-run.spec.ts:335` — ``the remote`s OK skips the tally and launches the next zone`` (the Tizen
    build);
  - `test/e2e/debug-tools.spec.ts:236` — "Tizen build via file://: after the unlock, 4 freezes and each 5 runs one
    tick" (`frameAdvance` stayed `false` after the debug unlock and remote 4);
  - `test/e2e/flight.spec.ts:137` — "arrow keys move the KESTREL; without input it stays put" (the idle drift was
    0.96 px against a 0.5 px limit, one flaky run on myadmin1).
- **Files:** `test/e2e/campaign-run.spec.ts`, `test/e2e/debug-tools.spec.ts`, `test/e2e/flight.spec.ts`,
  `test/e2e/raster.spec.ts`; the files of the C5 fixes since `c67c7c9` (`8ff2bf6`, `543887b`, `0cabaec`, `424afd7`,
  `b0dede1` and any later one — `git log --stat c67c7c9..origin/master -- test/e2e
  test/integration/e2e-ticks.test.ts`: `test/e2e/ticks.ts`, `test/integration/e2e-ticks.test.ts` and the specs they
  touched) only where a finding names them; app or shell source only for a real bug, reported first.
- **Tests (the first on myadmin1; the three `taskset -c 0-1` runs on myadmin1 or the old host, as C5 reviews 3 and 4
  ran them; always under the lock; `--retries=0` because the helper sets `CI=1`, which gives each test one retry and
  would hide a flake):**
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
  ```
  **The fourth run also covers the later C5 fixes:** when `git log --oneline b0dede1..origin/master -- test/e2e
  test/integration/e2e-ticks.test.ts` lists any commit, run every spec they changed with the fourth command's flags
  (2 CPUs, `E2E_SKIP_BUILD=1`, `--repeat-each=2 --retries=0 --grep-invert 'shows the title in under 3 s'`).
  `git diff --name-only b0dede1 origin/master -- 'test/e2e/*.spec.ts'` prints them as `test/e2e/<name>.spec.ts`
  paths, which the helper takes as they are (each path selects that spec alone); pass up to 10 per batch, one batch
  after the other.
- **Acceptance:** the fix is confirmed: the four runs green (where **Tests** says); the cause is named; no timeout
  raised blindly (the C5 lesson: a poll that can never come true only looks like slowness).
- **Token:** none.
- **Traps:** do not gate a failing test to get green; a gate is only for a test that is wrong at 640×360 by design.
- **If still open at the hand-off:** it becomes `R2-01.F1` in [wave 1](wave-01.md).

## Exit check

1. The C5 loop's last review (review 4 or a later round) reports zero findings, nits included.
2. `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/e2e-gates.test.ts
   test/integration/e2e-ticks.test.ts` is green.
3. The four runs of `W00.TRIAGE`'s **Tests** are green (where **Tests** says; or the open items are handed to wave 1
   as `R2-01.F1`).
4. `git status` is clean in the main checkout; no worktree is left with unpushed commits.
5. The status line above reads `**Status: closed** — …` (written by the old host's orchestrator), or it still reads
   `**Status: open**` and the new orchestrator runs the open items as `R2-01.F1`.

## Owner (Manual) — never blocks this wave

- If this wave is still open at the hand-off, hand the newest C5 review report (review 4 or later) and its fix report
  to the new run (or leave them in `/home/sites/shmup-cup/.claude/orchestrator/` on myadmin1 — flat, beside the
  earlier C5 reports).
- None new otherwise. The open owner questions are in [`decisions.md`](decisions.md).
