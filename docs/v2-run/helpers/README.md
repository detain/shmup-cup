# v2 run helpers

Small scripts and the data they produced that the v2 agent run's work orders (`docs/v2-run/`,
plan §18) rely on. They used to live only in the orchestrator's scratchpad on the old host; they
are committed here so every host and every worktree has the same copy. **None of them ships**,
none is a `pnpm` script, and each is deleted when the subtask that needs it is done (column
"Delete when"). The step's docs agent deletes a helper and its row; the folder goes when it is
empty (R6-03 at the latest).

Every script finds the checkout from its own location, so it runs from any clone or worktree and
from any directory. All are read-only except `host-check.sh` (which installs and builds) and
`e2e-batch.sh` (which builds the test builds).

| Path (`docs/v2-run/helpers/…`) | What | Run | Used by | Delete when |
|---|---|---|---|---|
| `host-check.sh` | The full CI-equivalent setup and check of a host: install, Playwright deps + browsers, format, lint, typecheck, test, build, then bench and e2e chromium + firefox (all three under the e2e lock), input probe, ingest. Logs each step (`=== HH:MM:SS step` / `rc=…`) to stdout and `$LOG_DIR/summary.log`, full output in `$LOG_DIR/NN-<step>.log`; exits 1 if a step failed. `HOST_CHECK_STEPS="format lint"` runs only some steps. ~12 min on myadmin1 (timings in its header) | opencode's shell tool stops a foreground command after 2 minutes, so start it in the background: `HOST_CHECK_LOG_DIR=/home/sites/shmup-cup-run/<id>-steps nohup bash docs/v2-run/helpers/host-check.sh > /home/sites/shmup-cup-run/<id>-host-check.log 2>&1 &` (`<id>` = your subtask id, e.g. `R6-03.D6`), then poll the log until its last line reads `ALL DONE: <n> step(s) failed` — **alone**, never while builder agents work | the orchestrator when a host is rebuilt, and `R6-03.D6` (the one full suite, wave 15) | the agent run ends (R6-03), or a docs pass promotes it to `scripts/` |
| `e2e-batch.sh` | One batch of Playwright specs: builds the three test builds outside the lock, then runs the specs under `flock /tmp/shmup-cup-e2e.lock` (`E2E_WORKERS` 2, `E2E_PROJECT` chromium, `E2E_LOCK_WAIT` 5400 s; `E2E_SKIP_BUILD=1` skips the build). It exports `CI=1`, which gives each test one retry: a flake repeat passes `--retries=0 --repeat-each=N` | opencode's shell tool stops a foreground command after 2 minutes: start it with the shell tool's `background: true`, or `nohup bash docs/v2-run/helpers/e2e-batch.sh a.spec.ts b.spec.ts > /home/sites/shmup-cup-run/<id>-e2e.log 2>&1 &` (≤ 10 specs; `<id>` = your subtask id), and poll the log | every subtask whose targeted tests include e2e specs (R2-02 E0, R2-03 E1–E4, R3-04, the R5 zone lanes, …) | the agent run ends (R6-03) |
| `load-core.mjs` | Shared module: loads `@shmup/core`'s barrel from the sources of any tree through a Vite SSR server (Vite from this checkout, so an old commit needs only a `git archive`, no install) | — (imported) | `w5pre/exports.mjs`, `w5/defaults.mjs` | with the last of them |
| `w5pre/exports.mjs` | Every numeric export of core's barrel as `NAME=value` after a count line | `node docs/v2-run/helpers/w5pre/exports.mjs [<root>]` | R2-02 prep **A1**: `world-scale.test.ts`' frozen `V1_WORLD` table (values from a pre-flip root ≤ `d4de048`, see below) and its completeness audit | A1 is on master (at the latest R2-02's port commit S) |
| `w5pre/exports.txt` | Its output at `ac40436` (**post-flip**: 386 numeric exports, `FRAME_W=640`), **not** the v1 values. The count is 386 at `bc8e05d` and 388 after `R2-02.P0` (`WORLD_SCALE`, `WORLD_TOP_PAD`): A1's audit takes today's list from the barrel, never a hard-coded count | — | A1 (a cross-check of the list), reviewers | with `exports.mjs` |
| `w5/defaults.mjs` | Every behaviour tunable's default with its unit (lengths and speeds only; the weapons' `WEAPON_BEHAVIOR_PARAMS` all), as `<behaviour>.<param>=<v> [<unit>]` | `node docs/v2-run/helpers/w5/defaults.mjs [<root>]` | R2-02 prep **A1** (`v1-behavior-defaults.json`, `behavior-defaults-port.test.ts`) and the W lanes' reviewers | A1 is on master (at the latest S) |
| `w5/defaults-all.txt` | Its output at `2c865b6` (pre-flip: the **v1** defaults, weapons included; reproduced byte for byte) | — | A1's fixture, the W lanes | with `defaults.mjs` |
| `w5/literals.mjs` | Every numeric literal of the 18 core sim modules with its line (TypeScript AST; skips 0, 1, `yield` ticks, enum members, index accesses) | `node docs/v2-run/helpers/w5/literals.mjs [--root <root>] [<module>…]` | R2-02 prep **W1–W7** (inline world literals → `v1 * WORLD_SCALE`) and their reviewers | W1–W7 are on master (at the latest S) |
| `w5/literals.txt` | Its output at `bc8e05d` (the scout's `8d89dd2` copy holds the same literals; only `data/index.ts` lines moved by 0–2) | — | W1–W7 | with `literals.mjs` |
| `w5pre/hurtbox.mjs` | Per zone, how many hurtboxes outgrow their art once ported ×1.5 (odd half-extents rounded up): over the v1 frame and over the interim ×1.5 atlas frame. Today: F 6, G 7, H 6, I 1, A 5, all by ≤ 1 px | `node docs/v2-run/helpers/w5pre/hurtbox.mjs [<root>]` (~2 s) | R2-02 prep **T4c** (hurtbox-inside-art tests measure the `buildAtlas()` frames; W5-3's 1-px allowance) | T4c is on master (at the latest S) |
| `r34-gen-list.mjs` | Every procedural generator's sprites (frames, size, native `N`, flash `F`) at `{ tileSize: 12, artScale: 1.5 }`, and the pixel maps | `node docs/v2-run/helpers/r34-gen-list.mjs [<root>]` | `R3-03.V1` (wave 2) and `R4-P.P3` (wave 7), and their reviewers: a generator's sprite list, frame counts, sizes and native / flash marks before and after the change | R4 is on master (after R4-05) |
| `r5r6/zonerefs.py` | Groups every tracked `.ts` / `.mjs` under `test/ packages/ apps/ scripts/ tools/` by the zones it names (`zone-x` or the zone's names) | `python3 docs/v2-run/helpers/r5r6/zonerefs.py [<root>] > /home/sites/shmup-cup-run/<id>-zonerefs.txt` (`<id>` = your subtask id; never a shared path two lanes would overwrite) | `R5-01.S6b` (wave 10), the fixture triage (group `a`); other zone lanes for their group | R5's zone lanes are on master (after zone H's LAND, `R5-08.S7`, wave 12; `W12.DOCS-A` deletes it) |
| `r5r6/zonerefs.txt` | Its output at `bc8e05d` — **re-run before use**: R2-02 … R4 move tests | — | `R5-01.S6b` (re-run first) | with `zonerefs.py` |
| `r5r6/carrier.py` | Which zone A enemies zones B–I spawn (`tender`, the capsule carrier, in all of them) and the sprites / scripts of the shared rosters | `python3 docs/v2-run/helpers/r5r6/carrier.py [<root>]` | `R5-01.S4a` (the frozen shared entries `tender`, `picket` / `halcyon-bulwark`, wave 10) and `R5-01.RV`; re-run it in each zone lane's review | R5 is on master (after R5-10) |

## A pre-flip (v1) tree for `exports.mjs` / `defaults.mjs`

The v1 values must come from a commit **≤ `d4de048`**: the frame-derived exports moved at
`72b18a1`. Core imports nothing outside its own `src/`, so a bare archive is enough:

```bash
V1=$(mktemp -d)
git archive -o "$V1.tar" d4de048 packages/core tsconfig.base.json
tar -x -C "$V1" -f "$V1.tar"
node docs/v2-run/helpers/w5pre/exports.mjs "$V1"    # FRAME_W=384 … (386 exports)
node docs/v2-run/helpers/w5/defaults.mjs "$V1"      # equals w5/defaults-all.txt
```

## Where they came from (the old host's scratchpad)

| Old scratchpad path | Here | Note |
|---|---|---|
| `myadmin1-setup.sh` | `host-check.sh` | repo from its own location; per-step logs in `$LOG_DIR`; e2e under the lock; step filter; exit code |
| `w4-laneA-fix2-e2e.sh` | `e2e-batch.sh` | generalised: specs as arguments, any worktree |
| `w5pre/exports.mjs`, `w5pre/exports.txt` | `w5pre/exports.mjs`, `w5pre/exports.txt` | Vite loading moved to `load-core.mjs` |
| `w5pre/hurtbox.mjs` | `w5pre/hurtbox.mjs` | root optional |
| `w5/defaults.mjs`, `w5/defaults-all.txt` | `w5/defaults.mjs`, `w5/defaults-all.txt` | root was hard-coded |
| `w5/literals.mjs`, `w5/literals.txt` | `w5/literals.mjs`, `w5/literals.txt` | root was hard-coded; list regenerated at `bc8e05d` |
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
