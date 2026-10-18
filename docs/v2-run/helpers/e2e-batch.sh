#!/usr/bin/env bash
# e2e-batch.sh — one batch of Playwright specs under the machine-wide e2e lock.
#
# What it does: in the checkout that holds this file (found from the script's own location, so
# every worktree runs its own tree), builds the three test builds OUTSIDE the lock
# (turbo build:test for @shmup/web, @shmup/tizen, @shmup/webos), then waits for the e2e lock and
# runs the given specs with Playwright. Only one e2e batch runs at a time on a host: the timed
# specs measure frame pacing, and two batches at once make them flaky.
#
# Run (opencode's shell tool stops a foreground command after 2 minutes: start the batch with
# the shell tool's `background: true`, or with nohup as below, and poll the log; the log goes to
# the run directory, /home/sites/shmup-cup-run on myadmin1; put your subtask id for <id>):
#   nohup bash docs/v2-run/helpers/e2e-batch.sh options.spec.ts game-options.spec.ts \
#     > /home/sites/shmup-cup-run/<id>-e2e.log 2>&1 &
# Arguments: up to ~10 spec files (or any other `playwright test` arguments, e.g. `-g <title>`).
# CI=1 (set below) gives each test one retry: for a flake repeat pass `--retries=0 --repeat-each=N`.
# Environment (defaults in brackets):
#   E2E_PROJECT [chromium]  the Playwright project (firefox runs only the determinism spec)
#   E2E_WORKERS [2]         browsers per batch; with the lock held machine-wide it can go higher
#                           on a big host (myadmin1: 64 cores), but 2 is what the timed specs
#                           were measured with
#   E2E_LOCK [/tmp/shmup-cup-e2e.lock]  the lock file every e2e run on the host shares
#   E2E_LOCK_WAIT [5400]    seconds to wait for the lock before giving up (a stuck holder shows)
#   E2E_SKIP_BUILD [0]      1 = the test builds are already fresh
#
# Used by: every subtask whose targeted tests include e2e specs (R2-02 E0, R2-03 E1–E4, the R3-04
# memory and R5 zone e2e checks, …) — the "e2e" command of the docs/v2-run/ work orders.
# Delete when: the v2 agent run ends (R6-03).
# Was: the orchestrator's scratchpad w4-laneA-fix2-e2e.sh (one fixed worktree and three fixed
# specs), generalised.
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")" && git rev-parse --show-toplevel)
cd "$REPO"
if [ "$#" -eq 0 ]; then
  echo "usage: bash docs/v2-run/helpers/e2e-batch.sh <spec>… (run from any directory)" >&2
  exit 2
fi
if [ "${E2E_SKIP_BUILD:-0}" != 1 ]; then
  pnpm exec turbo run build:test --filter=@shmup/web --filter=@shmup/tizen --filter=@shmup/webos
fi
exec flock -w "${E2E_LOCK_WAIT:-5400}" "${E2E_LOCK:-/tmp/shmup-cup-e2e.lock}" \
  env CI=1 E2E_WORKERS="${E2E_WORKERS:-2}" pnpm exec playwright test \
  --config test/e2e/playwright.config.ts --project="${E2E_PROJECT:-chromium}" "$@"
