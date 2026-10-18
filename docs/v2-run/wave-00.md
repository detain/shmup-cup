# Wave 0 — closing R2-01's review loops (old host's orchestrator, before the hand-off)

> Schedule: `plan_resolution.md` §18 · how to use: [`README.md`](README.md) · decisions: [`decisions.md`](decisions.md)

**Steps:** R2-01 (its last review loop and a CI triage) · **Gate to start:** — · **Exit (summary):** C5 review 3 of
`c67c7c9` (and any later fix → review round) at zero findings, nits included; both repeat runs of `W00.TRIAGE`
green on myadmin1 (`--retries=0`). Otherwise the open items become `R2-01.F1` in [wave 1](wave-01.md).

**Status: open** — until C5 review 3 of `c67c7c9` (and any fix → new review loop after it) reaches zero findings,
nits included. When that loop ends at zero before the hand-off, the old host's orchestrator rewrites this line to
`**Status: closed** — <date>, <the zero review>`. If it still reads open when the run starts, the opencode
orchestrator finishes it first, as `R2-01.F1` in [wave 1](wave-01.md).

Background: C5 review 2 (of `293e885` + `bc8e05d`) found 3 should-fix items and 1 nit (S1–S3, N1). C5 fix 2
`c67c7c9` (`test(R2-01): e2e waits on ticks, not frame rate (C5 review 2)`, test files only) fixed all four. C5
review 3 of `c67c7c9` (with the full Chromium e2e on myadmin1) was still running when this file was written. The
driver checks the literal `**Status: open**` / `**Status: closed**` at the start of the status line: keep that
spelling.

- **The new run's orchestrator**, before wave 1, reads the status line on `origin/master`:
  - **closed:** nothing of wave 0 is left (C5 review 3 already ran its e2e on myadmin1); go to wave 1.
  - **open:** get C5 review 3's report from the owner or the hand-off note (if there is none, `R2-01.F1.RV` runs the
    review); every open finding and every red check becomes `R2-01.F1` in [wave 1](wave-01.md), and wave 1 starts
    with its lane 1. When `R2-01.F1.RV` reaches zero, the orchestrator rewrites the status line to
    `**Status: closed** — <date>, <the zero review>`.

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| — (orchestrator) | `W00.C5` → `W00.TRIAGE` | `test/e2e/*.spec.ts` only if a fix is needed | — | yes (under the lock) |

Reviews: the C5 review loop itself. Docs item: none (the R2-01 docs pass is wave 1).

## Rules for this wave

- Wave 0 ran under the old host's orchestrator until the hand-off (its e2e runs on myadmin1). After the hand-off
  nothing runs as wave 0: a closed wave 0 needs no re-run, and an open one becomes `R2-01.F1`.
- **Pushes:** a fixer pushes its own fix to `master` (README Common rule 5); review agents never push. This wave has
  no zone lane and no patch-only subtask.
- Nothing in wave 0 changes a golden, a demo, `content/`, a fingerprint or `plan_resolution.md`.

## Subtasks

### W00.C5 — C5 review loop to zero (closes A5, U3 and C5)

- **Wave / lane / order:** wave 0, orchestrator, first.
- **Depends on:** the C5 fixer's commits `293e885` (the second e2e gate `PORT_UNMEASURED` / `PORT_REASON`,
  `assertionsGated`) and `bc8e05d` (the sweep review's 9 stale comment sites), and `c67c7c9` (the review-2 fix), all
  on master.
- **Goal:** C5 review 2 (of `293e885` + `bc8e05d`) found 3 should-fix items and 1 nit, all fixed by C5 fix 2
  `c67c7c9` (test files only). C5 review 3 of `c67c7c9` (with the full Chromium e2e on myadmin1), and any fix → new
  review loop after it, reaches zero findings, nits included. A zero C5 review also closes the A5 (the flip) and U3
  (the post-flip layout pass) loops.
- **Files:** read-only; a fixer touches only the files a finding names.
- **Tests:** the reviewer re-runs `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration
  test/integration/e2e-gates.test.ts` and the gated specs under the lock
  (`bash docs/v2-run/helpers/e2e-batch.sh <specs>`).
- **Acceptance:** a review with zero findings; every fix pushed and itself reviewed by a new reviewer.
- **Token:** none.
- **Traps:** a review that finds only nits is not zero: loop again.
- **Docs needs:** none (the docs pass is wave 1; anything new goes into the report, for `R2-01.D1` / `R2-01.D6`).

### W00.TRIAGE — CI e2e shard 1 and the flight idle drift

- **Wave / lane / order:** wave 0, orchestrator, inside the C5 review loop.
- **Depends on:** nothing.
- **Goal:** explain, and fix if real, the three e2e failures that were red on GitHub CI only (shard 1, since
  `ac40436`) and the flake seen on myadmin1. **Fixed in `c67c7c9`** (see [`handoffs-w4.md`](handoffs-w4.md) Appendix A
  (d) and the "C5 review 2" bullet under R2-01's As built). Left: the two repeat runs under **Tests**, checked by C5
  review 3. Today's lines (on `c67c7c9`; they were `:241` / `:355`, `:233` and `:114` on `bc8e05d`):
  - `test/e2e/campaign-run.spec.ts:298` — "A → B → D → F → H: every tally and map, …" (zone B's `clearZone` stayed in
    `game` instead of reaching `stageClear`; atlas pages `0,2`);
  - `test/e2e/campaign-run.spec.ts:411` — ``the remote`s OK skips the tally and launches the next zone`` (the Tizen
    build);
  - `test/e2e/debug-tools.spec.ts:261` — "Tizen build via file://: after the unlock, 4 freezes and each 5 runs one
    tick" (`frameAdvance` stayed `false` after the debug unlock and remote 4);
  - `test/e2e/flight.spec.ts:152` — "arrow keys move the KESTREL; without input it stays put" (the idle drift was
    0.96 px against a 0.5 px limit, one flaky run on myadmin1).
- **Files:** `test/e2e/campaign-run.spec.ts`, `test/e2e/debug-tools.spec.ts`, `test/e2e/flight.spec.ts`,
  `test/e2e/raster.spec.ts`; app or shell source only for a real bug, reported first.
- **Tests (on myadmin1, under the lock; `--retries=0` because the helper sets `CI=1`, which gives each test one
  retry and would hide a flake):**
  ```bash
  # the four specs, 4 repeats, 12 workers — the load the flight flake was seen under (6 of 48)
  E2E_WORKERS=12 bash docs/v2-run/helpers/e2e-batch.sh campaign-run.spec.ts debug-tools.spec.ts flight.spec.ts raster.spec.ts --repeat-each=4 --retries=0
  # CI-like load on 2 CPUs (the test builds are fresh from the first run)
  taskset -c 0-1 env E2E_WORKERS=2 E2E_SKIP_BUILD=1 bash docs/v2-run/helpers/e2e-batch.sh campaign-run.spec.ts debug-tools.spec.ts --repeat-each=2 --retries=0
  ```
- **Acceptance:** the fix is confirmed: both runs green on myadmin1; the cause is named; no timeout raised blindly
  (the C5 lesson: a poll that can never come true only looks like slowness).
- **Token:** none.
- **Traps:** do not gate a failing test to get green; a gate is only for a test that is wrong at 640×360 by design.
- **If still open at the hand-off:** it becomes `R2-01.F1` in [wave 1](wave-01.md).

## Exit check

1. C5 review 3 (and every later round) reports zero findings, nits included.
2. `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/e2e-gates.test.ts` is green.
3. Both runs of `W00.TRIAGE`'s **Tests** are green on myadmin1 (or the open items are handed to wave 1 as
   `R2-01.F1`).
4. `git status` is clean in the main checkout; no worktree is left with unpushed commits.
5. The status line above reads `**Status: closed** — …` (written by the old host's orchestrator), or it still reads
   `**Status: open**` and the new orchestrator runs the open items as `R2-01.F1`.

## Owner (Manual) — never blocks this wave

- Hand C5 review 3's report to the new run if this wave is still open at the hand-off.
- None new otherwise. The open owner questions are in [`decisions.md`](decisions.md).
