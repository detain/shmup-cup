# `docs/v2-run/` — the work orders of the v2 agent run

This folder holds the **work orders for every v2 plan step that is not `done…` in
[`plan_resolution.md` §17](../../plan_resolution.md#17-progress)**, from Wave 0 to the `v2.0.0` release. They are
scheduled for **about 10 agents at once** (builders plus review agents), driven by an orchestrator on the host
**myadmin1** (opencode with Qwen 3.8 Flash agents; the driver prompt is
[`prompt_resolution.md`](../../prompt_resolution.md)).

- [`plan_resolution.md` §18](../../plan_resolution.md#18-execution-waves-for-the-10-agent-run) is the **schedule**:
  the rules of the run and one row per wave.
- **This folder is the detail**: one file per wave with every subtask, its exact files, its tests, its acceptance,
  its token and its traps.

Everything here is committed on purpose. The run does not depend on any scratchpad, on the git-ignored `.claude/`
folder (except `.claude/plan_board_v2.py` and `.claude/skills/`, which the previous orchestrator copied to myadmin1),
or on any file outside the repository other than the run directory (§ The run directory).

## Read it in this order

1. [`CLAUDE.md`](../../CLAUDE.md), then [`plan_resolution.md`](../../plan_resolution.md) **§2.6** (frame ≠ world),
   **§17** (progress) and **§18** (the waves).
2. **This README**: the id scheme, the common rules every agent follows, the e2e batches, the tokens.
3. [`decisions.md`](decisions.md): every default the run adopted and every question still open for the owner.
4. The current wave's file, [`wave-NN.md`](#the-waves).
5. Only when a subtask block cites it:
   - [`handoffs-w4.md`](handoffs-w4.md): the inputs of the R2-01 docs pass and the hand-offs to later steps;
   - [`wave5-scout.md`](wave5-scout.md): the background of R2-02, R3-03 and R3-04, corrected after the frame flip;
   - `designs/zone-<x>.md`: the R5 zone designs, written in waves 8 and 9;
   - [`helpers/README.md`](helpers/README.md): the helper scripts (`e2e-batch.sh`, `host-check.sh`, the export
     and default listers).

## The waves

| File | Wave | Steps |
|---|---|---|
| [`wave-00.md`](wave-00.md) | 0 | the R2-01 C5 review loop and the CI triage — closed by the orchestrator before the hand-off, or its open item (verifying C5 fix 2 `c67c7c9`: C5 review 3 and any fix → review loop to zero) becomes `R2-01.F1` in wave 1 |
| [`wave-01.md`](wave-01.md) | 1 | R2-01 docs pass (7 docs agents) · R2-02 opening (`WORLD_SCALE`, the port kit) |
| [`wave-02.md`](wave-02.md) | 2 | R2-02 prep A (world constants and defaults) · R3-03 / R3-04 side lanes |
| [`wave-03.md`](wave-03.md) | 3 | R2-02 prep B (the test pins, the v2-port comparison, the e2e pre-gate) |
| [`wave-04.md`](wave-04.md) | 4 | R2-02 barrier and **the port commit** · R3-03 / R3-04 side lanes · R0-04 agent parts |
| [`wave-05.md`](wave-05.md) | 5 | R2-02 after the port (un-gating, bench, e2e) · R3-03 / R3-04 close · docs |
| [`wave-06.md`](wave-06.md) | 6 | R2-03 (e2e re-measure, the one golden re-bless, doc images) · stable hash keys and capacity (R5 prep) |
| [`wave-07.md`](wave-07.md) | 7 | R2-04 (retune, `v2.0.0-alpha.1`) · R3-06 · R4 prep |
| [`wave-08.md`](wave-08.md) | 8 | R4-01 … R4-05 art and code (all but the integrators) |
| [`wave-09.md`](wave-09.md) | 9 | R4 integrators · R5 prep (test splits, `--only`, the fingerprint write mode) · R5 designs |
| [`wave-10.md`](wave-10.md) | 10 | R5 prep 2 (ramps, bot) · every zone's stand-in art · the zone-A pilot |
| [`wave-11.md`](wave-11.md) | 11 | R5 zones B, C, D, E, F, G, I · zone H's first half |
| [`wave-12.md`](wave-12.md) | 12 | zone H · R5-10 part 1 · real-art drops (owner-gated) |
| [`wave-13.md`](wave-13.md) | 13 | R5-10 part 2 (`v2.0.0-beta.1`) · R6 opening |
| [`wave-14.md`](wave-14.md) | 14 | R6-01 balance |
| [`wave-15.md`](wave-15.md) | 15 | R6-02 / R6-03, **the one full suite**, `v2.0.0` |

## How an orchestrator uses this folder

1. **Pick the wave.** It is the first wave whose exit is not met; §17 and the wave file's "Gate to start" tell you.
   Wave N+1 may start as soon as wave N's **code exit** passes; wave N's docs agents then run inside wave N+1's cap.
   Wave N+1's own docs item starts only once wave N's docs review is at zero findings.
2. **Fill the slots.** At most **8 builders and 2 review agents** run at once; the re-check scouts (the driver's wave
   loop, step 1) and the fix agents take builder slots, and the cap is 10 agents in all. Take the wave's lanes in the
   order the wave file gives; a lane runs its subtasks one after another, one agent per subtask. When a lane ends,
   start the next queued lane, or a listed **filler**. A subtask starts only when its "Depends on" holds **on
   `origin/master`**.
3. **Write each agent's prompt** from four parts, verbatim:
   1. the agent brief of `prompt_resolution.md`;
   2. the **Common rules** section below;
   3. the wave file's **Rules for this wave** section;
   4. the subtask's block (from its `### <id> — …` heading to the next heading).

   Review and docs agents get the same four parts, with their own block.
4. **Run the review loop** for every subtask that pushed: review → fix → a **new** review, until a review reports
   **zero findings, nits included**. Doc-only nits may go to a fixer that is already running.
5. **Track the run** in the run directory (below): the wave's lane table, every agent, its status and its pushes.
6. **Close the wave**: run its **Exit check** (targeted, on myadmin1; never wait for GitHub CI — look at it at a
   wave's close at most) and let the wave's docs agent (`Wnn.DOCS-A`) update the §17 rows. Once that push is on
   `origin/master`, the orchestrator runs `python3 .claude/plan_board_v2.py` in the main checkout
   `/home/sites/shmup-cup` (the script is git-ignored, so it exists only there; docs agents never run it). Then go
   to step 1.

Owner-only work (**Manual (owner)** in each wave file) is listed so it is visible. It never blocks a wave.

## Subtask ids

- **`<step>.<local id>`** for work inside a plan step: `R2-02.P0`, `R2-03.G1`, `R3-03.V1`, `R4-01.A1b`,
  `R5-10.T4`, `R6-03.D6`. The local ids come from the re-plan scouts, so `R2-02.P1` (the port kit), `R2-04.P1` (the
  score popups) and `R5-P.P1` (stable hash keys) are different subtasks: always write the step prefix.
- **Prep that belongs to no plan step:** `R4-P.<id>` (R4's prep, done in wave 7) and `R5-P.<id>` (R5's prep and the
  zone designs `R5-P.D-A` … `R5-P.D-I`).
- **Zone subtasks** use the zone's step: zone A = `R5-01`, B = `R5-02`, C = `R5-03`, D = `R5-04`, E = `R5-05`,
  F = `R5-06`, G = `R5-07`, H = `R5-08`, I = `R5-09`. Example: `R5-04.S5a` is zone D's stage geometry.
- **Reviews and fixes:** a review block is `<id>.RV` (one subtask, e.g. `R2-02.P0.RV`), `<step>.<group>.RV` (a group
  of subtasks, e.g. `R2-02.prepA.RV`) or `<step>.RV` (the step review); `R2-02.RV-pre` is the barrier review. The
  rounds of a loop are numbered when the orchestrator launches them: `R2-02.P0.RV1`, `R2-02.P0.FIX1`,
  `R2-02.P0.RV2`, …
- **Wave items:** `W07.DOCS-A` (the docs agent that holds the plan), `W07.DOCS-B` …; a wave's exit is its
  `## Exit check` section (no id).
- Every block heading is `### <id> — <title>`. The ids are unique across the whole folder.

## Common rules (paste into every agent prompt)

1. **Where you work.** Your own git worktree, made from `origin/master` (`git fetch origin && git switch --detach
   origin/master`) — or the lane worktree under `RUN_DIR/wt/` that your block names. Then
   `pnpm install --frozen-lockfile --prefer-offline`, and `pnpm assets` when your tests need the atlas. Never work in
   the main checkout, never `git stash` (the stash is shared by every worktree), never `git checkout -- <path>` to undo
   someone else's change.
2. **Only your files.** Edit only the files your block lists (a "new" file is one you create). A change anywhere
   else goes into your report, with the file and the reason; the orchestrator gives it to its owner. Big files
   (`behaviors/index.ts` 3,337 lines, `data/index.ts` 5,544, `scenes/index.ts` 10,865, `content.test.ts` 2,315):
   edit with exact old/new strings, never rewrite the whole file.
3. **Targeted tests only.** Vitest with `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project <p> <files>`. Never run
   `pnpm test`, `pnpm test:e2e` or the whole `pnpm bench`: the one full suite runs in wave 15. Run the typecheck of
   what you touched (`pnpm --filter <pkg> typecheck`; `pnpm typecheck:root` for files outside `packages/` and
   `apps/`), and `pnpm exec eslint <files> && pnpm exec prettier --check <files>`. Markdown is not formatted by
   Prettier; keep its tables readable.
4. **e2e only through the lock.** `bash docs/v2-run/helpers/e2e-batch.sh <≤ 10 specs>` builds the three test
   builds, waits for `/tmp/shmup-cup-e2e.lock` and runs the specs (Firefox: `E2E_PROJECT=firefox`). opencode's shell
   tool stops a foreground command after 2 minutes: start the batch with the shell tool's `background: true` (or
   `nohup bash docs/v2-run/helpers/e2e-batch.sh … > "$RUN_DIR/<id>-e2e.log" 2>&1 &`) and poll the log. One
   batch runs at a time on the host (the web server's port 4173 is fixed), and at most two agents of a wave do
   e2e work. `pnpm docs:screens` and every `pnpm bench` file also run under the same lock (`flock -w 5400
   /tmp/shmup-cup-e2e.lock <command>`), so they cannot make a timed spec flaky. A failure seen only on CI is
   reproduced with `taskset -c 0-3` and `E2E_WORKERS=2`; a timeout is never raised blindly.
5. **Push protocol.** Commit with explicit paths (`git add <paths>`; never `git add -A`), an imperative subject with
   the repository's prefix style (`feat(R2-02): …`, `test(R2-02): …`, `docs: …`), a body that says why, and no
   Co-Authored-By line (the driver's GIT block). Then `git fetch origin && git rebase origin/master`, re-run your
   targeted tests if the rebase brought changes to your files, and `git push origin HEAD:master`. If the push is
   rejected, repeat from the fetch (at most 5 times, then report). Never force-push. Never push `v1.x`. No branches
   are pushed and no pull requests are opened. **Two exceptions, as your block says:** an agent in a **lane
   worktree** (`RUN_DIR/wt/…`, on a local branch) commits there and never pushes — only its LAND subtask pushes,
   through `docs/v2-run/helpers/land-zone.sh`; a **patch subtask** (`R2-04.F1`, `R2-04.Z1` … `Z4`) commits locally,
   writes `RUN_DIR/w07/patches/<id>.patch` and pushes nothing.
6. **Derived files go through the land lock.** A push that regenerates a derived file — the golden replays
   (`test/golden/*.replay.json`), the attract demos (`content/demos/*.replay.json`), a `PINNED` table of the three
   fingerprints (`test/integration/presentation-fingerprint.test.ts`, `test/integration/content-db-fingerprint.test.ts`,
   `packages/shell/test/frame-fingerprint.test.ts`), `assets/source/atlas-groups.json`, `docs/images/**` or the
   store icons — holds `/tmp/shmup-cup-land.lock` from the fetch to the push:
   `flock -w 5400 /tmp/shmup-cup-land.lock bash <your script>` where the script fetches, rebases, **regenerates**
   (never merges a derived file by hand: on a conflict take master's file and regenerate), runs the targeted
   checks and pushes. Only a subtask whose block names the token (GOLDEN, FINGERPRINTS, GROUPS, DOCS-IMAGES, STORE)
   may change those files. A fingerprint moved by a change that should not move it is a bug: stop and report.
7. **Never:** `pnpm golden:update` unless your block holds GOLDEN; `SHMUP_V1_BASELINE_UPDATE` (the v1 baseline is
   frozen for good); raising a budget (allocation, bundle, draw calls, atlas bytes) to get green; deleting or
   skipping a failing test to get green; editing `plan_resolution.md`, `CHANGELOG.md`, `README.md`, `CLAUDE.md`,
   `docs/**` or `docs/dev/api-reference.md` unless you are a docs agent (builders list their **docs needs** in the
   report); adding a dependency or touching `pnpm-lock.yaml`; packaging, signing, deploying or any TV / `sdb` /
   Tizen CLI command; touching skynet2, `art-prompts/v2/server.sh` or port 30000.
8. **Frame ≠ world** (`plan_resolution.md` §2.6). The frame is 640×360 (playfield 640×336, 12-px HUD bars, 12-px
   tiles, font cell 9×12). The world is v1 × 1.5. A value anchored to a screen edge or the centre derives from the
   frame (`PLAYFIELD_W + 16 * WORLD_SCALE`, never `PLAYFIELD_W * WORLD_SCALE`); a world length, speed, radius or
   acceleration is v1 × 1.5; ticks, angles (`ANGLE_UNITS` 1024), counts, scores and ratios never scale. Take a
   number's unit from its schema (`s.num({ unit })`) or from `behaviors/units.ts` `BEHAVIOR_PARAM_UNITS`, never from
   its name.
9. **No frame literals.** `packages/*/src`, `apps/*/src`, `apps/*/scripts` and `scripts/**` may not hold the
   numbers `384 216 200 208 192 108 640 360 336 348` (`packages/core/test/frame-literals.test.ts`,
   `test/integration/frame-literals-repo.test.ts`). Import `FRAME_W` … from `@shmup/core`, or from
   `scripts/frame.mjs` in a Node script. Never extend an allow-list to dodge the scan.
10. **Core stays pure and deterministic:** no DOM or Node globals, no `Math.random` / `Date.now` /
    `performance.now`, no `Math.sin`-family, `Math.pow` or `**` (use `core/math`'s tables and plain
    multiplication). Asset generators use exact maths and the seeded `scripts/assets/rng.mjs`; two runs must be
    byte-identical.
11. **Zero allocation per tick and per frame.** A per-tick or per-frame entry point keeps its allocation guard
    (`packages/core/test/helpers/alloc.ts` `measureHeapGrowth`, the rules in `docs/dev/conventions.md`). A
    fractional value passed to a call V8 does not inline is boxed: pass whole numbers, or let the callee compute the
    fraction. Never raise a guard's budget, never move a measured loop into a helper.
12. **Chromium 68.** Shipped code (`packages/*/src`, `apps/*/src`) uses no `.flat`, `.flatMap`, `.at(`,
    `Object.fromEntries`, `Object.hasOwn`, `replaceAll`, `structuredClone`, `Promise.allSettled`, `queueMicrotask`
    (`test/integration/tv-engine-floor.test.ts`). The Tizen `app.js` stays ≤ 512 KB gzip.
13. **Goldens.** A golden or demo changes only on purpose, in the commit of the change that moved it, with the reason
    in the commit body. An unintended golden change is a bug. Until R2-03 (wave 6) the goldens are stale by design
    behind `test/golden/stale.ts`; do not touch the gates `test/golden/stale.ts`, `test/e2e/gates.ts` or
    `packages/core/test/helpers/port-pending.ts` unless your block says so.
14. **Original names, art and music only.** AI art enters only through `art-prompts/ingest/ingest.mjs` with its
    `.art.json` record; nothing from `art-prompts/v2/candidates/` is committed; no FLUX winner is used even as a
    reference while FLUX is on hold (decision RR-4).
15. **Your report** (the last thing you write) has: the subtask id; the commits you pushed (SHA + subject); the
    files you changed; the exact test commands you ran and their results; what you could not do and why; findings
    that belong to another subtask (by its id); **docs needs** (file + what to say); owner (Manual) items. Write it
    to the run directory as `$RUN_DIR/<id>-report.md` and repeat its first lines as your final reply. `RUN_DIR` is
    `/home/sites/shmup-cup-run` (the driver's Run setting): wherever a block writes `RUN_DIR/…`, `<RUN_DIR>` or
    `$RUN_DIR` it means that absolute path; start each shell command that uses it with
    `export RUN_DIR=/home/sites/shmup-cup-run`.
16. **If you are almost at the end of your task, do not bother with context compression; it is quicker to finish the
    task and respond.**

## The standard e2e batches

Every one of the 50 specs of `test/e2e/` is in exactly one batch. A subtask that "runs all e2e" runs the five
Chromium batches A … E one after another (each under the lock) — plus batch G once it exists — and Firefox's
determinism spec (F).

| Batch | Specs |
|---|---|
| **A** (zones and stages) | `zone-a.spec.ts zones-bc.spec.ts zones-de.spec.ts zones-fg.spec.ts zones-hi.spec.ts stage.spec.ts mode7.spec.ts raster.spec.ts gimmicks.spec.ts campaign-run.spec.ts` |
| **B** (sprites and colours) | `bullets.spec.ts bullet-palette.spec.ts enemies.spec.ts weapons.spec.ts direct-items.spec.ts option-hunter.spec.ts powerups.spec.ts lives.spec.ts coop.spec.ts coop-gamepad.spec.ts` |
| **C** (bosses, HUD, debug, recordings) | `boss.spec.ts advanced-bosses.spec.ts render-groups.spec.ts debug-tools.spec.ts attract.spec.ts determinism.spec.ts atlas-residency.spec.ts extra-replays.spec.ts zone-map.spec.ts continue.spec.ts` |
| **D** (front end and options) | `smoke.spec.ts boot.spec.ts frame-layout.spec.ts scenes.spec.ts front-end.spec.ts options.spec.ts game-options.spec.ts display-options.spec.ts rebind.spec.ts input.spec.ts` |
| **E** (hosts and the rest) | `flight.spec.ts ship-select.spec.ts weapon-select.spec.ts fx-gallery.spec.ts audio.spec.ts shell.spec.ts webos.spec.ts platform-polish.spec.ts release-check.spec.ts render-profile.spec.ts` |
| **F** (Firefox) | `E2E_PROJECT=firefox bash docs/v2-run/helpers/e2e-batch.sh determinism.spec.ts` |
| **G** (new specs) | none yet; `atlas-context-loss.spec.ts` (R3-04.M3d) and `decor.spec.ts` (R3-06.L6) when they land |

When R5-P.P5d (wave 10) splits `zones-{bc,de,fg,hi}.spec.ts` into `zone-{b…i}.spec.ts`, batch A becomes two batches:
`A1` = `zone-a … zone-e` + `stage mode7`, `A2` = `zone-f … zone-i` + `raster gimmicks campaign-run`. A new spec
(`atlas-context-loss.spec.ts` from R3-04.M3d, `decor.spec.ts` from R3-06.L6) goes into a new batch **G** (≤ 10
specs; batches A … E already hold 10 each).

## Tokens and locks

A **token** says who may change a hot file or a derived file. A wave file names, for each token it uses, which lane
holds it and when it passes on. Two kinds:

- **Work-time tokens** (held while a lane works on the file): one lane edits the file, everyone else only reads it.
- **Push-time tokens** (derived files, rule 6): many lanes may build at once; each takes the land lock only to
  rebase, regenerate, check and push.

| Token | Files | Kind |
|---|---|---|
| **PLAN** | `plan_resolution.md`, `CHANGELOG.md` | work-time: the wave's docs agent (`Wnn.DOCS-A`) only |
| **GOLDEN** | `test/golden/*.replay.json`, `content/demos/*.replay.json`, running `pnpm golden:update` | push-time; only the blocks that name it |
| **FINGERPRINTS** (FP) | the `PINNED` tables of the three fingerprint tests (re-pin with `SHMUP_FINGERPRINT_PRINT=1`, or from R5-P.P10 on with `SHMUP_FINGERPRINT_UPDATE=1`) | push-time |
| **GROUPS** | `assets/source/atlas-groups.json` (re-derive with `SHMUP_ATLAS_GROUPS_UPDATE=1`) | push-time |
| **DOCS-IMAGES** | `docs/images/**` (`pnpm docs:images`, `pnpm docs:screens`) | push-time; a subject folder may be committed by its subtask, a full regeneration only by the wave's integrator |
| **STORE** | `apps/tizen/public/icon.png`, `apps/webos/public/{icon,largeIcon}.png`, `apps/electron/build/icon.png` | push-time; R4-05.E5 and R6-03.D3 only |
| **LAND** | a zone's whole re-bless (`--only`) in R5 / R6 | push-time; the land lock for the whole LAND script |
| **GLOBAL** | a whole-set re-bless (R5-P.P12, R6-01.B4) | the land lock for the whole re-bless; no LAND meanwhile |
| **KIT** | `test/port-v2/**` (R2-02's two-scale kit) | work-time: R2-02.P1, then R2-02.T3 for `handfix.patch`, then R2-02.S deletes it |
| **CORE-CONFIG** | `packages/core/src/config/index.ts`, `packages/core/src/index.ts` (barrel), `scripts/frame.mjs` | work-time |
| **DATA-INDEX** | `packages/core/src/data/index.ts` | work-time |
| **BEHAVIOR** | `packages/core/src/behaviors/index.ts`, `behaviors/units.ts` | work-time |
| **CONTENT-TEST** | `test/integration/content.test.ts` (until R5-P.P2 splits it), `test/integration/release-audit.test.ts` | work-time |
| **BOT** | `test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts` | work-time; from R5 on also GLOBAL when it re-records |
| **SCENES** | `packages/core/src/scenes/index.ts` | work-time |
| **UI-FILE** | `packages/core/src/ui/index.ts` | work-time |
| **STRINGS** | `content/strings/*.strings.json`, `packages/core/src/ui/strings.ts` (implies FP) | work-time |
| **POWERUPS** | `packages/core/src/powerups/index.ts` | work-time |
| **E2E-MIRROR** | `test/e2e/frame-pixels.ts`, `test/scripts/frame.test.ts` (and `scripts/frame.mjs` with CORE-CONFIG) | work-time |
| **RP-BARREL** / **SHELL-BARREL** | `packages/render-pixi/src/index.ts` / `packages/shell/src/index.ts` | work-time |
| **PORT window** | everything | wave 4 only: from R2-02.S's verification start to its push, nobody else pushes |

The locks: `/tmp/shmup-cup-e2e.lock` (every e2e batch, `pnpm docs:screens`, every bench run) and
`/tmp/shmup-cup-land.lock` (rule 6, LAND, GLOBAL). Both are machine-wide on the host; `flock -w 5400` notices a
stuck holder.

## The run directory

Transient run files live **outside the repository** in the run directory, `RUN_DIR` — by default
`/home/sites/shmup-cup-run/` on myadmin1 (the driver prompt's Run setting `RUN_DIR`; its preflight creates it). It
holds the orchestrator's `RESUME.md`, lane file per wave, wave notes, `prompts/` and `logs/`; the agents' reports
(every agent writes its report as `$RUN_DIR/<id>-report.md`); RV-A2's failure lists (`w02/rv-a2/`); R2-04's proposed
patches (`w07/patches/`); and the lane worktrees of R5 / R6 (`wt/`). It survives sessions on the host. Anything a
**later wave** needs that is not in this list is committed (the zone designs, for example, go to
`docs/v2-run/designs/`). Before the run moves to another host, copy the run directory along.

## The host

- **myadmin1** (64 cores, 251 GB RAM, Ubuntu 24.04, Node 24 via nvm, pnpm 12 via corepack, `gh` logged in).
  Repository: `/home/sites/shmup-cup`. `bash docs/v2-run/helpers/host-check.sh` reruns the CI-equivalent check that
  passed there on `bc8e05d` (about 12 minutes); it is the full suite, so it runs only in wave 15 (`R6-03.D6`), or
  when the host itself is rebuilt — never in the preflight.
- **Art data on myadmin1 is a snapshot.** `art-prompts/v2/candidates/` (961 MB, git-ignored) and the picker's
  `data/choices.json` (at `/home/sites/mystage/public_html/shmup-cup/data/choices.json`, not served) were copied
  from the old host. The owner keeps picking on the old host, and myadmin1 cannot reach it, so **every art subtask
  (R0-04.W1, R3-04.M1c, the R5 `S3` drops) first asks the owner for a fresh copy of `choices.json`**, and treats a
  regenerate request as done only when every slot's take is newer than the click.
- **GPU work is done.** Only the owner starts a GPU session on skynet2 (`art-prompts/v2/server.sh`, never port
  30000).
