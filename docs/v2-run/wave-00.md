# Wave 0 — closing R2-01's review loops (orchestrator, before the hand-off)

> Schedule: `plan_resolution.md` §18 · how to use: [`README.md`](README.md) · decisions: [`decisions.md`](decisions.md)

**Steps:** R2-01 (its last review loop and a CI triage) · **Gate to start:** — · **Exit (summary):** the C5 review
loop at zero findings; master green locally on myadmin1.

**Status: closed by the orchestrator before the hand-off.** If that line is wrong, the orchestrator of the new run
corrects it here and the open item becomes `R2-01.F1` in [wave 1](wave-01.md).

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| — (orchestrator) | `W00.C5` → `W00.TRIAGE` | `test/e2e/*.spec.ts` only if a fix is needed | — | yes (under the lock) |

Reviews: the C5 review loop itself. Docs item: none (the R2-01 docs pass is wave 1).

## Rules for this wave

- Wave 0 runs on the old host, before the run moves to myadmin1. Nothing in it is left for a new agent unless the
  orchestrator's hand-off note says so.
- Nothing in wave 0 changes a golden, a demo, `content/`, a fingerprint or `plan_resolution.md`.

## Subtasks

### W00.C5 — C5 review loop to zero (closes A5, U3 and C5)

- **Wave / lane / order:** wave 0, orchestrator, first.
- **Depends on:** the C5 fixer's commits `293e885` (the second e2e gate `PORT_UNMEASURED` / `PORT_REASON`,
  `assertionsGated`) and `bc8e05d` (the sweep review's 9 stale comment sites) on master.
- **Goal:** a fresh review of `293e885` and `bc8e05d` (and the 9 sweep sites) returns zero findings, nits included.
  A zero C5 review also closes the A5 (the flip) and U3 (the post-flip layout pass) loops.
- **Files:** read-only; a fixer touches only the files a finding names.
- **Tests:** the reviewer re-runs `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration
  test/integration/e2e-gates.test.ts` and the gated specs under the lock
  (`bash docs/v2-run/helpers/e2e-batch.sh <specs>`).
- **Acceptance:** a review with zero findings; every fix pushed and itself reviewed by a new reviewer.
- **Token:** none.
- **Traps:** a review that finds only nits is not zero: loop again.
- **Docs needs:** none (the docs pass is wave 1; anything new goes into [`handoffs-w4.md`](handoffs-w4.md)).

### W00.TRIAGE — CI e2e shard 1 and the flight idle drift

- **Wave / lane / order:** wave 0, orchestrator, inside the C5 review loop.
- **Depends on:** nothing.
- **Goal:** explain, and fix if real, the three e2e failures that are red on GitHub CI only (shard 1, since
  `ac40436`) and the flake seen on myadmin1:
  - `test/e2e/campaign-run.spec.ts:241` — zone B's `clearZone` stays in `game` instead of reaching `stageClear`
    (atlas pages `0,2`);
  - `test/e2e/campaign-run.spec.ts:355` — the Tizen variant of the same run;
  - `test/e2e/debug-tools.spec.ts:233` — on Tizen, `frameAdvance` stays `false` after the debug unlock and remote 4;
  - `test/e2e/flight.spec.ts:114` — the idle drift is 0.96 px against a 0.5 px limit (one flaky run on myadmin1).
- **Files:** `test/e2e/campaign-run.spec.ts`, `test/e2e/debug-tools.spec.ts`, `test/e2e/flight.spec.ts`; app or shell
  source only for a real bug, reported first.
- **Tests:** reproduce with CI's 4 cores: `taskset -c 0-3 env E2E_WORKERS=2 bash docs/v2-run/helpers/e2e-batch.sh
  campaign-run.spec.ts debug-tools.spec.ts flight.spec.ts`, three times.
- **Acceptance:** the cause is named; a fix (if any) passes three times under `taskset -c 0-3`; no timeout raised
  blindly (the C5 lesson: a poll that can never come true only looks like slowness).
- **Token:** none.
- **Traps:** do not gate a failing test to get green; a gate is only for a test that is wrong at 640×360 by design.
- **If still open at the hand-off:** it becomes `R2-01.F1` in [wave 1](wave-01.md).

## Exit check

1. The C5 review loop reports zero findings.
2. `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/e2e-gates.test.ts` is green.
3. The four specs above pass locally on myadmin1 (or the open one is handed to wave 1 as `R2-01.F1`).
4. `git status` is clean in the main checkout; no worktree is left with unpushed commits.

## Owner (Manual) — never blocks this wave

- None new. The open owner questions are in [`decisions.md`](decisions.md).
