# v2 run helpers

Small scripts and the data they produced that the v2 agent run's work orders (`docs/v2-run/`,
plan §18) rely on. They used to live only in the orchestrator's scratchpad on the old host; they
are committed here so every host and every worktree has the same copy. **None of them ships**,
and none is a `pnpm` script. Column "Delete when" says when a helper is no longer needed. The docs
agents delete them, each with its rows: `W05.DOCS-A` deleted the R2-02 helpers (`load-core.mjs`,
`w5pre/*`, `w5/*`) in wave 5; `W12.DOCS-A` deletes `r5r6/zonerefs.*` and `W13.DOCS-A`
`r5r6/carrier.py`. Every other helper
(`host-check.sh`, `e2e-batch.sh`, `r34-gen-list.mjs` and wave 9's `land-zone.sh`) stays until the
end of the run: wave 15's Exit check 5 lists what is left, and the owner decides there whether
`docs/v2-run/` is deleted (every helper with it) or kept as history.

Every script finds the checkout from its own location, so it runs from any clone or worktree and
from any directory. All are read-only except `host-check.sh` (which installs and builds),
`e2e-batch.sh` (which builds the test builds) and, from wave 9, `land-zone.sh` (which regenerates
the derived files, commits and pushes).

| Path (`docs/v2-run/helpers/…`) | What | Run | Used by | Delete when |
|---|---|---|---|---|
| `host-check.sh` | The full CI-equivalent setup and check of a host: install, Playwright deps + browsers, format, lint, typecheck, test, build, then bench and e2e chromium + firefox (all three under the e2e lock), input probe, ingest. Logs each step (`=== HH:MM:SS step` / `rc=…`) to stdout and `$LOG_DIR/summary.log`, full output in `$LOG_DIR/NN-<step>.log`; exits 1 if a step failed. `HOST_CHECK_STEPS="format lint"` runs only some steps. ~12 min on myadmin1 (timings in its header) | opencode's shell tool stops a foreground command after 2 minutes, so start it in the background: `HOST_CHECK_LOG_DIR=/home/sites/shmup-cup-run/<id>-steps nohup bash docs/v2-run/helpers/host-check.sh > /home/sites/shmup-cup-run/<id>-host-check.log 2>&1 &` (`<id>` = your subtask id, e.g. `R6-03.D6`), then poll the log until its last line reads `ALL DONE: <n> step(s) failed` — **alone**, never while builder agents work | the orchestrator when a host is rebuilt, and `R6-03.D6` (the one full suite, wave 15) | the agent run ends (R6-03), or a docs pass promotes it to `scripts/` |
| `e2e-batch.sh` | One batch of Playwright specs: builds the three test builds outside the lock, then runs the specs under `flock /tmp/shmup-cup-e2e.lock` (`E2E_WORKERS` 2, `E2E_PROJECT` chromium, `E2E_LOCK_WAIT` 5400 s; `E2E_SKIP_BUILD=1` skips the build). It exports `CI=1`, which gives each test one retry: a flake repeat passes `--retries=0 --repeat-each=N` | opencode's shell tool stops a foreground command after 2 minutes: start it with the shell tool's `background: true`, or `nohup bash docs/v2-run/helpers/e2e-batch.sh a.spec.ts b.spec.ts > /home/sites/shmup-cup-run/<id>-e2e.log 2>&1 &` (≤ 10 specs; `<id>` = your subtask id), and poll the log | every subtask whose targeted tests include e2e specs (R2-02 E0, R2-03 E1–E4, R3-04, the R5 zone lanes, …) | the agent run ends (R6-03) |
| `land-zone.sh` | LAND one zone (R5-P.LAND): squashes the branch to one sources-only commit from `--message <file>`, then under `flock -w 5400 /tmp/shmup-cup-land.lock` (`LAND_LOCK`/`LAND_LOCK_WAIT` change both; `--dry-run` takes no lock) regenerates every derived file — assets, the atlas groups (`SHMUP_ATLAS_GROUPS_UPDATE=1`), the goldens and demos (`node scripts/golden-update.mjs --only <stageId,…>` — with `--all` the whole re-bless, exactly one of the two is required), the three fingerprints (`SHMUP_FINGERPRINT_UPDATE=1`, R5-P.P10) and `pnpm docs:images` — runs the zone's targeted checks plus all of `test/golden` and the whole release audit, proves every changed replay's `header.stageId` is in the `--only` list (skipped with `--all`), amends the commit body with its `Changed plates:` list and pushes `HEAD:master` only (a rejected push resets to the sources-only commit and retries, ≤ 5; any abort from step 2 on restores the derived paths so the branch holds sources only); `--zone <a…I>` names the zone's checks and the log `$RUN_DIR/land-<zone>-<date>.log` (`RUN_DIR` required; refuses when `CI` is set). `--dry-run` runs steps 1–8 in a throwaway detached worktree of `HEAD`, prints what would be committed ("nothing derived changed" when that is true) and pushes nothing; the branch is not squashed or changed | run inside the zone worktree, backgrounded, and poll the log: `RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-b --message /home/sites/shmup-cup-run/<id>-msg.txt --zone b` (`<id>` = your subtask id) | every R5 zone lane's LAND, and the global re-blesses `R5-P.P12` / `R6-01.B4` in `--all` mode | the agent run ends (R6-03) |
| `r34-gen-list.mjs` | Every procedural generator's sprites (frames, size, native `N`, flash `F`) at `{ tileSize: 12, artScale: 1.5 }`, and the pixel maps | `node docs/v2-run/helpers/r34-gen-list.mjs [<root>]` | `R3-03.V1` (wave 2) and `R4-P.P3` (wave 7), and their reviewers: a generator's sprite list, frame counts, sizes and native / flash marks before and after the change | R4 is on master (after R4-05) — kept until the end of the run (wave 15, Exit check 5) |
| `r5r6/zonerefs.py` | Groups every tracked `.ts` / `.mjs` under `test/ packages/ apps/ scripts/ tools/` by the zones it names (`zone-x` or the zone's names) | `python3 docs/v2-run/helpers/r5r6/zonerefs.py [<root>] > /home/sites/shmup-cup-run/<id>-zonerefs.txt` (`<id>` = your subtask id; never a shared path two lanes would overwrite) | `R5-01.S6b` (wave 10), the fixture triage (group `a`); other zone lanes for their group | R5's zone lanes are on master (after zone H's LAND, `R5-08.S7`, wave 12; `W12.DOCS-A` deletes it) |
| `r5r6/zonerefs.txt` | Its output at `bc8e05d` — **re-run before use**: R2-02 … R4 move tests | — | `R5-01.S6b` (re-run first) | with `zonerefs.py` |
| `r5r6/carrier.py` | Which zone A enemies zones B–I spawn (`tender`, the capsule carrier, in all of them) and the sprites / scripts of the shared rosters | `python3 docs/v2-run/helpers/r5r6/carrier.py [<root>]` | `R5-01.S4a` (the frozen shared entries `tender`, `picket` / `halcyon-bulwark`, wave 10) and `R5-01.RV`; re-run it in each zone lane's review | R5 is on master (after R5-10; `W13.DOCS-A` deletes it) |

## Where they came from (the old host's scratchpad)

| Old scratchpad path | Here | Note |
|---|---|---|
| `myadmin1-setup.sh` | `host-check.sh` | repo from its own location; per-step logs in `$LOG_DIR`; e2e under the lock; step filter; exit code |
| `w4-laneA-fix2-e2e.sh` | `e2e-batch.sh` | generalised: specs as arguments, any worktree |
| `r34-gen-list.mjs` | `r34-gen-list.mjs` | the scout's worktree was hard-coded |
| `r5r6/zonerefs.py`, `r5r6/zonerefs.txt`, `r5r6/carrier.py` | `r5r6/…` | the scout's worktree was hard-coded |
| `w5/exports.mjs` | — | superseded by `w5pre/exports.mjs` (the same script with a root argument) |
| `w5/if-new.txt`, `w5/cf-new.txt`, `w5/if-fixed.txt` (and `w5/*-flip*.txt`, `*-port.txt`, `*-fixed.txt`, `core-fail*.txt`, `integ-fails.txt`) | — | stale (measured at `8d89dd2`, before wave 4's test rewrites): R2-02's review slot **RV-A2** re-derives the failing-test lists under the two-scale kit |
| `w5/*.log`, `w5/rescale-real.txt`, `w5-rescale-dry.txt`, `w5pre-rescale-dry.txt`, `w5pre-vitest.log` | — | run logs; regenerate with `node scripts/content/rescale.mjs --factor 1.5 --top-pad 36 --from-width 384 --from-height 200 --tile-size 8 --to-width 640 --art-scale 1.5 --dry-run` (while the content is v1) |
| `w5/experiment-code.patch`, `w5/experiment-diffstat.txt` | — | the wave-5 scout's throwaway experiment at `8d89dd2`: its flip half is on master (R2-01), the rest is spelled out in the R2-02 work order |
| `w5-port/` (`handfix.patch`, `flip.sh`, `port-pending.stub.ts`) | — | never written; replaced by the port kit `test/port-v2/` (`two-scale.sh`, `handfix.patch`) that R2-02 prep subtask **P1** commits and the port commit S deletes |

## Lint, format, tests

- The `.mjs` files are Prettier-formatted (`pnpm format:check` reads them) and pass `pnpm lint`
  (ESLint lints every `.mjs` outside `packages/` and `apps/`; each file declares its Node
  globals in a `/* global … */` line, like `scripts/doc-screenshots.mjs`). Keep both green when
  you edit one: `pnpm exec prettier --write docs/v2-run/helpers/ && pnpm exec eslint docs/v2-run/helpers/`.
- No tsconfig includes `docs/`, so `pnpm typecheck` never reads them; Prettier skips `.sh`,
  `.py` and `.txt`, and the shell scripts pass `shellcheck`.
- The frame-literal scans read only `packages/*/src`, `apps/*/{src,scripts}` and `scripts/`, so
  the literal `384` / `216` in these helpers and their lists is fine here — never copy one into
  shipped code or a root script.
