#!/usr/bin/env bash
# host-check.sh — the full CI-equivalent setup and check of a fresh host for the v2 agent run.
#
# What it does: on the checkout that holds this file (found from the script's own location, so
# it works from any clone or worktree), runs every job of .github/workflows/ci.yml in one go, in
# order, and logs each step:
#   install (pnpm install --frozen-lockfile) · Playwright system deps (sudo -n) · Playwright
#   browsers · format:check · lint · typecheck · test · build · bench · e2e chromium · e2e
#   firefox · the input probe (tools/input-probe: npm ci && npm run verify) · the ingest tool
#   (art-prompts/ingest: npm ci && npm test && node ingest.mjs --check).
# A failing step does not stop the run; the script exits 1 when any step failed.
#
# Run (from anywhere; ~12 min on myadmin1). Run it ALONE — it runs the full suite and the bench,
# so never while builder agents work (owner rule: the full suite only at the end):
#   bash docs/v2-run/helpers/host-check.sh 2>&1 | tee ~/shmup-host-check.log
# Environment:
#   HOST_CHECK_LOG_DIR      where the step logs go (default: /tmp/shmup-host-check-<timestamp>)
#   HOST_CHECK_SKIP_PW_DEPS 1 = skip `playwright install-deps` (no passwordless sudo, or done)
#   HOST_CHECK_STEPS        only these steps, by name, space-separated (default: all), e.g.
#                           HOST_CHECK_STEPS="format lint typecheck" for a quick re-check
#   E2E_LOCK                the machine-wide e2e lock (default /tmp/shmup-cup-e2e.lock); both
#                           e2e steps take it, so a check never overlaps an agent's e2e batch
#
# Step log: one line `=== HH:MM:SS <step>` when a step starts and `rc=<code> (<last 3 lines>)`
# when it ends, on stdout and in $LOG_DIR/summary.log; each step's full output is in
# $LOG_DIR/NN-<step>.log.
#
# Measured on myadmin1 (64 cores, 251 GB, Ubuntu 24.04, Node 24.21, pnpm 12.3.4 via corepack),
# master bc8e05d, 2026-10-18 15:04–15:16 EDT — passed end to end in ~12 min:
#   lint 38 s · typecheck 14 s · test 79 s (774 files, 8,954 passed, 360 skipped) · build 13 s ·
#   bench 350 s · e2e chromium 2.7 min (148 passed, 78 skipped, 12 workers; 1 flaky:
#   flight.spec.ts:114 idle drift 0.96 px > 0.5) · e2e firefox 2 passed · probe verify and
#   ingest test + --check green. (Install, deps, browsers and format were not timed separately.)
#
# Used by: the orchestrator when it sets up a host (wave 0 / the hand-off to myadmin1) and for
# the full suite at the end of a wave or of the run (docs/v2-run/, plan_resolution.md §18).
# Delete when: the v2 agent run ends (R6-03) — or a docs pass promotes it to scripts/.
# Was: the orchestrator's scratchpad myadmin1-setup.sh (it hard-coded /home/sites/shmup-cup).
set -u

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")" && git rev-parse --show-toplevel) || exit 1
cd "$REPO" || exit 1
LOG_DIR=${HOST_CHECK_LOG_DIR:-/tmp/shmup-host-check-$(date +%Y%m%dT%H%M%S)}
E2E_LOCK=${E2E_LOCK:-/tmp/shmup-cup-e2e.lock}
mkdir -p "$LOG_DIR" || exit 1
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 ELECTRON_SKIP_BINARY_DOWNLOAD=1 CI=1

STEPN=1
FAILED=0
# Prints a line to stdout and to the summary log.
say() { echo "$1" | tee -a "$LOG_DIR/summary.log"; }
# Runs one step: step <name> <command…>; its output goes to $LOG_DIR/NN-<name>.log.
step() {
  local name=$1 log rc
  shift
  case " ${HOST_CHECK_STEPS:-$name} " in *" $name "*) ;; *) return 0 ;; esac
  log=$(printf '%s/%02d-%s.log' "$LOG_DIR" "$STEPN" "$name")
  say "=== $(date +%T) $name"
  "$@" > "$log" 2>&1
  rc=$?
  say "rc=$rc ($(tail -n 3 "$log" | tr '\n' ' ' | cut -c1-300))"
  [ "$rc" -eq 0 ] || FAILED=$((FAILED + 1))
  STEPN=$((STEPN + 1))
}

say "host-check of $REPO at $(git rev-parse --short HEAD); logs in $LOG_DIR"
step install pnpm install --frozen-lockfile
if [ "${HOST_CHECK_SKIP_PW_DEPS:-0}" != 1 ]; then
  step pw-deps sudo -n env "PATH=$PATH" pnpm exec playwright install-deps chromium firefox
fi
step pw-browsers pnpm exec playwright install chromium firefox
step format pnpm format:check
step lint pnpm lint
step typecheck pnpm typecheck
step test pnpm test
step build pnpm build
step bench pnpm bench
step e2e-chromium flock -w 5400 "$E2E_LOCK" pnpm test:e2e --project=chromium
step e2e-firefox flock -w 5400 "$E2E_LOCK" pnpm test:e2e --project=firefox
step probe bash -c 'cd tools/input-probe && npm ci && npm run verify'
step ingest bash -c 'cd art-prompts/ingest && npm ci && npm test && node ingest.mjs --check'
say "=== $(date +%T) ALL DONE: $FAILED step(s) failed"
[ "$FAILED" -eq 0 ]
