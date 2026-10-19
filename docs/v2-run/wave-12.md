# Wave 12 — zone H ∥ R5-10 part 1 ∥ real-art drops

> Schedule: `plan_resolution.md` §18 · how to use: `docs/v2-run/README.md` · decisions: `docs/v2-run/decisions.md`
>
> **Run directory:** `RUN_DIR` is `/home/sites/shmup-cup-run` (README common rule 15). The commands below spell the
> path out, so each one runs as typed in a fresh shell; prose that says `RUN_DIR/…` means the same path.

**Steps:** R5-08 (zone H, second half), R5-10 part 1 (bonus stages, escape, dimension, dev ranges, linked-stage
pages), and the owner-gated real-art drops `R5-0n.S3` of every zone. · **Gate to start:** wave 11's exit — zones B,
C, D, E, F, G and I LANDed (with zone A from wave 10), zone H's S4a … S5b on `r5/zone-h`. · **Exit (summary):** zone
H LANDed; R5-10.T1, T2, T3 and T8 on `origin/master`, T6 done (pushed or reported); every review at zero; the
wave's docs item done. The S3 drops are not part of the exit: each lands when the owner's art for it exists (this wave or any later one).

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| 1 zone H | `R5-08.S4c → R5-08.S6 → R5-08.RV → R5-08.S7` | `zone-h.*` (the four echoes now), `citadel.mjs` | LAND at S7 | S6 |
| 2 bonus stages | `R5-10.T1` | `brine-grotto`, `glimmer-cache`, `bonus-vault`, `bonus-range` stages, `bonus.enemies.json` (art) | LAND | none |
| 3 escape → linked pages | `R5-10.T2 → R5-10.T8` | `escape.stage.json`, `escape.mjs` (new), the registry lines, the campaign credits; then `packages/shell/src/memory/index.ts`, `atlas-groups.test.ts` | LAND (T2), GROUPS (T8) | T8 |
| 4 dimension | `R5-10.T3` | `dimension.stage.json`, `dimension.mjs`, `extras.enemies.json` (art), its four plates | DOCS-IMAGES; FP only if names change | T3 |
| 5 dev ranges | `R5-10.T6` | the dev range stage and enemy files (art fields only, only if needed) | FP only if content changed | none |
| 6–7 real art | `R5-0n.S3` (owner-gated; at most 2 at once) | the zone's `assets/source/sprites/**` overrides and recipes | DOCS-IMAGES (+ LAND if a frame count moves) | the zone spec |

- **Order rules:** R5-10.T1 needs zones B and G LANDed (wave 11 — true at the gate). R5-10.T2 waits for zone H's
  LAND (R5-08.S7) and zone I's (wave 11). R5-10.T8 waits for T2. An S3 drop of zone `<x>` waits for that zone's LAND
  (zone H's for R5-08.S3).
- **Reviews:** `R5-08.RV` (the whole H branch: S4a … S6), the post-LAND checks, `R5-10.T1.RV` … `R5-10.T8.RV`, each
  S3's review.
- **e2e passes:** two. Hand them out in this order: R5-08.S6, R5-10.T3, R5-10.T8, then the S3 drops. A post-LAND
  check's e2e run and an RV's re-run of a spec take a pass too. `R6-01.B1`'s bench runs under the e2e lock (wave 13
  rule 2); like every bench it does not count toward the two passes (README common rule 4).
- **Docs item:** `W12.DOCS-A`, `W12.DOCS-B`.
- **Fillers:** wave 13's `R6-01.B1` (a new bench file, no shared file) may start early, once R5-08.S7 (zone H's
  LAND) is on `origin/master` (its Depends on is all nine zone LANDs) and a slot is free.

## Rules for this wave

1. Zone H follows wave 11's **Rules for this wave** (branch work in `RUN_DIR/wt/zone-h`, the zone template, the v2
   numbers, the frozen entries, the LAND helper, the cross-zone checks, long commands). The orchestrator pastes wave
   11's *Rules for this wave* into zone H's prompts, after this wave's rules. A timeout-only failure of the boss
   rush or a route in zone H's S6 (wave 11 rule 13) gets wave 11's `R5-0n.TO` block as `R5-08.TO`, before R5-08.S7.
2. **R5-10's stage subtasks are LANDs too.** T1 changes what the simulation does and T2 moves several kinds of
   derived files (the fingerprints, the atlas groups, the plates), so each works on its own local branch in its own
   lane worktree, is reviewed there, and reaches `origin/master` only through the `land-zone.sh` commands its block
   writes (R5-P.LAND's helper). **This replaces common rule 1's worktree step** (as wave 11 rule 1): never
   `git switch --detach`, never create another worktree. When the block starts, the orchestrator creates its
   worktree from its main checkout — T1:
   `git -C /home/sites/shmup-cup worktree add -b r5/bonus /home/sites/shmup-cup-run/wt/bonus origin/master`; T2:
   `git -C /home/sites/shmup-cup worktree add -b r5/escape /home/sites/shmup-cup-run/wt/escape origin/master`.
   Start each subtask inside it with `git branch --show-current` — it must print `r5/bonus` (T1) or `r5/escape`
   (T2); if HEAD is detached, run `git switch r5/bonus` (or `git switch r5/escape`) and say so in your report — then
   `git fetch origin && git rebase origin/master`. After the rebase, run
   `pnpm install --frozen-lockfile --prefer-offline` (shell timeout 600000), and `pnpm assets` when your tests need
   the atlas: the lane worktree has no `node_modules` until its first agent installs, and a rebase that brings a
   lockfile change leaves them stale (for a lane worktree the agent brief's WORKTREE block skips only its fetch /
   worktree add / cd lines and still installs; the install after your rebase, here, is the one that counts; zone
   H's agents do the same, wave 11 rule 1). Commit sources only on the branch; never push it. The helper takes
   `/tmp/shmup-cup-land.lock` itself — never wrap it in another `flock`. It runs about 25 minutes: give the
   shell call a `timeout` of 3600000 or run it in the background and poll its log. Run it with `--dry-run` first and
   read the dry run's log. After the LAND's push the orchestrator removes the worktree and deletes the branch (the
   command is in the block's acceptance).
3. **Presentation-only subtasks** (T3, T6, T8, the S3 drops) work in a normal worktree from `origin/master` and push
   with the README's push protocol; a push that moves a derived file holds the land lock (README rule 6).
4. **One LAND or derived-file push at a time** (the land lock). No GLOBAL re-bless runs in this wave.
5. **The art data on myadmin1 is a snapshot.** An S3 drop starts only after the owner has (a) decided FLUX
   (`docs/dev/art-provenance.md` §8, decision 1) or chosen a non-FLUX winner, (b) given the orchestrator a **fresh
   copy** of the picker's `data/choices.json` (myadmin1 cannot reach the old host; its copy under
   `/home/sites/mystage/public_html/shmup-cup/` is stale), and (c) cleaned the art and stamped it `reviewed`. A
   regenerate request counts as done only when every slot's take is newer than the click.
6. Nothing from `art-prompts/v2/candidates/` is committed. Winners live in `art-prompts/v2/winners/<id>/`
   (R0-04.W1). No FLUX winner is used, even as a reference, while FLUX is on hold (RR-4).

## Subtasks

### R5-08.S4c — Zone H's echoes re-rigged from the new bosses

- **Wave / lane / order:** wave 12, lane 1, first.
- **Depends on:** R5-01.S7, R5-02.S7, R5-04.S7 and R5-06.S7 (the LANDs of zones A, B, D and F) on `origin/master`;
  R5-08.S4a … S5b on `r5/zone-h`.
- **Goal:** rebuild the parade's four echoes from the **new** part trees of HALCYON BULWARK, GALVANIC MAW, CINDER
  BASTION and MANTLE REGENT: each echo uses a subset of its boss's new part tree (the same `name`, `parent`, `x` /
  `y`, `sprite` and `core` / `gun` flags for the parts it keeps, a reachable `core`), fewer HP, one phase, its
  `role: captain` / `timeLimit` kept, and the same behaviour script (`boss.bulwark`, `boss.maw`, `boss.bastion`,
  `boss.squid`). Today's echoes are such reduced forms (8 of 10, 5 of 7, 5 of 9 and 8 of 13 parts): never copy a
  whole boss into the parade.
- **Files (only these):**
  - `content/enemies/zone-h.enemies.json` — the entries `echo-bulwark`, `echo-maw`, `echo-bastion`, `echo-regent`;
  - `packages/core/test/behaviors/behaviors-zone-h.test.ts`, `behaviors-zone-h-edge.test.ts` (created by R5-P.P5a2)
    — the echo cases.
- **Steps:**
  1. `cd /home/sites/shmup-cup-run/wt/zone-h && git branch --show-current && git fetch origin && git rebase origin/master && pnpm install --frozen-lockfile --prefer-offline`
     (shell timeout 600000; the branch must print `r5/zone-h`; zone H rebases last, on all the LANDs, and the
     install picks up any lockfile change they brought — wave 11 rule 1).
  2. For each echo, read the new boss entry (`content/enemies/zone-a.enemies.json` `halcyon-bulwark`,
     `zone-b.enemies.json` `galvanic-maw`, `zone-d.enemies.json` `cinder-bastion`, `zone-f.enemies.json`
     `mantle-regent`) and rebuild the echo from a subset of its part tree: every part the echo keeps has the same
     `name`, `parent`, `x` / `y`, `sprite` and `core` / `gun` flags as in the new boss (boss parts have no `role`
     field); keep a reachable `core`, fewer HP, one phase, and the echo's own boss-level `role: captain` and
     `timeLimit`.
  3. Run the tests; commit on `r5/zone-h`.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-zone-h.test.ts packages/core/test/behaviors/behaviors-zone-h-edge.test.ts packages/core/test/behaviors/behaviors-bulwark-alloc.test.ts packages/core/test/behaviors/behaviors-maw-alloc.test.ts packages/core/test/behaviors/behaviors-bastion-alloc.test.ts packages/core/test/behaviors/behaviors-squid-alloc.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-h.test.ts
  ```
- **Acceptance:** each echo names only sprites that exist; every echo part matches a part of its new boss (`name`,
  `parent`, `x` / `y`, `sprite`, `core` / `gun`); a reachable `core`; parts ≤ `MAX_BOSS_PARTS` (24); one phase each;
  the four allocation guards green (they belong to zones A, B, D, F — run them, never edit them).
- **Token:** none (branch).
- **Traps:** never edit the A, B, D or F boss entries — copy from them; the echoes' sprites stay in the `common`
  atlas group (zone H names them); the LAND re-derives `atlas-groups.json`, you never edit it.
- **Docs needs:** the echoes' new shapes for `zones-h-and-i.md` and the bestiary.

### R5-08.S6 — Zone H playtest and e2e on the branch

- **Wave / lane / order:** wave 12, lane 1, after R5-08.S4c. It needs one e2e pass.
- **Depends on:** R5-08.S4a … S5b (wave 11) and S4c on the branch.
- **Goal:** prove the remastered zone H: the bot clears it in god mode, a no-god run replays to the same hash,
  recovery holds, the runtime test and the e2e spec pass on the stand-in art, the zone's memory fits. If R5-08.S5b
  left the contract at `remastered: false`, switch it now (`test/integration/zones/zone-h.contract.ts`).
- **Files (only these):** `test/playtest/zone-h.test.ts`, `test/playtest/zone-h-recovery.test.ts` (created by
  R5-P.P3), `test/integration/zone-h-runtime.test.ts` (created by R5-P.P5e from `zones-hi-runtime-edge.test.ts` —
  P5e creates no `-runtime-edge` file), `test/e2e/zone-h.spec.ts` (created by R5-P.P5d), `test/integration/zones/zone-h.contract.ts`;
  `test/golden/golden-zone-h.test.ts` — the zone's outcome expectations, derived from the design;
  `test/golden/golden.ts` and `test/golden/demos.ts` — zone H's own scenario / demo descriptions only (a description
  change re-blesses that scenario; it is in the LAND scope).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-h.test.ts test/playtest/zone-h-recovery.test.ts test/integration/zone-h-runtime.test.ts test/integration/content-zone-h.test.ts test/integration/standin-budget.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts
  # the cross-zone checks (wave 11 rule 13; long: shell timeout 1800000, or background with a log):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/campaign-routes-b.test.ts test/playtest/campaign-routes-c.test.ts test/playtest/campaign-routes-manta-b.test.ts test/playtest/campaign-routes-manta-c.test.ts test/integration/campaign-flow.test.ts test/golden/v2-port test/playtest/boss-rush.test.ts
  # red only on its `….toEqual(PINNED.…)` lines (`expect(w.table)…` and the `languages` / `coopSingle` walks' `expect(table)…`); any other failing expect: stop and report (wave 11 rule 9):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-h.spec.ts > /home/sites/shmup-cup-run/R5-08.S6-e2e.log 2>&1 &   # then poll the log
  ```
- **Acceptance:** god mode: `stageClear`, IRON SOVEREIGN down through all its phases (≥ 4), the four echoes seen,
  the run 4.0–6.0 min, `diagonalTicks` 0, parked at `BOT_X` (96) ± 4, no 4-way rule broken, peak live enemies ≤ 80 %
  of `MAX_ENEMIES` (64) and peak boss parts ≤ `MAX_BOSS_PARTS` (24), both sampled through the harness's `observe`
  hook in `zone-h.test.ts` (particles are not measured here: R6-02.P1 and the render bench own them — a full pool
  recycles its oldest particle, the bench always draws a full 512 pool, and R4-04.D3 (wave 08) chose 256; see
  `wave-10.md` R5-01.S6 Traps); the no-god run
  replays to the same hash; the pages within the zone's R3-04 budget; the cross-zone line green (every campaign
  route, the campaign flow, the v2-port comparison, the boss rush). **Expected red until the LAND** (list them in the
  report; do not fix them): zone H's goldens and demo (with the outcome cases of `golden-zone-h.test.ts`), the
  `PINNED` comparisons of the three fingerprints, `test/integration/atlas-groups.test.ts`, `pnpm docs:images --check`.
- **Token:** one e2e pass.
- **Traps:** the moving floors rely on R5-P.P12's bot support; a floor the bot cannot ride is redesigned, never the
  bot; a route or the boss rush failing on time with the bigger boss: stop and report (wave 11 rule 13) — never edit
  the route test; your own playtest files' Vitest timeouts (`test/playtest/zone-h.test.ts`,
  `zone-h-recovery.test.ts`) may grow in proportion to the longer stage — say why in the commit; a performance
  budget never; never paste a failing run's output as an expectation: derive each number from the design; no
  derived file on the branch.
- **Docs needs:** run times, the bot's damage per section, the memory figure.

### R5-08.RV — Review of zone H on the branch

- **Wave / lane / order:** wave 12, a review slot, after R5-08.S6; review → `R5-08.FIX1` → a **new** review → … zero.
- **Read:** `git -C /home/sites/shmup-cup-run/wt/zone-h diff origin/master...r5/zone-h` (S4a … S6) and
  `docs/v2-run/designs/zone-h.md`.
- **Re-run:** inside `/home/sites/shmup-cup-run/wt/zone-h` (`git branch --show-current` must print `r5/zone-h`),
  every **Tests** command of R5-08.S4a … S6 (wave 11's S4a … S5b blocks and this wave's S4c and S6) except the e2e
  spec — never a step's rebase, never a commit (the branch's changes exist only in that worktree; a fresh worktree
  of `origin/master` would test master). Read S6's log `/home/sites/shmup-cup-run/R5-08.S6-e2e.log`; re-run the
  spec only if the branch changed after S6 (it then takes one of the wave's two e2e passes).
- **Must hold:** wave 11's zone-review list (only zone H's files; no derived file; nothing multiplied twice; the
  contract on with no bound relaxed; no frozen entry edited; no behaviour code; the boss's ported `x` / `y` not
  re-derived; the golden-zone outcome expectations follow the design, never a pasted run output; the cross-zone line
  green; the expected-red list matches S6's report); every echo part matches a part of its new boss (`name`,
  `parent`, `x` / `y`, `sprite`, `core` / `gun`); one phase each.
- **Report:** findings with severity and file:line.

### R5-08.S7 — Zone H LAND

- **Wave / lane / order:** wave 12, lane 1, after R5-08.RV is at zero. One LAND at a time on the host (the land
  lock); first ready, first LAND.
- **Depends on:** R5-08.RV at zero.
- **Goal:** squash the branch into one commit on `origin/master` and regenerate every derived file for zone H's scope
  only.
- **Command** (from `/home/sites/shmup-cup-run/wt/zone-h`; the exact usage is in the helper's header — R5-P.LAND,
  wave 9):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-h --message /home/sites/shmup-cup-run/R5-08.S7-msg.txt --zone h --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-h-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-h --message /home/sites/shmup-cup-run/R5-08.S7-msg.txt --zone h
  # each about 25 min: shell timeout 3600000, or background with a log; the script takes /tmp/shmup-cup-land.lock itself — never wrap it in another flock
  ```
- **Dry run first:** if its `test/golden` run fails (an outcome expectation of `golden-zone-h.test.ts`, a
  description), do not run the real LAND: report it; a fixer (`R5-08.FIXn`) corrects the expectation on the branch so
  it states what the design predicts (the log shows the recorded outcome — an outcome that contradicts the design is
  a content bug, never an expectation to copy), then a new review and a new dry run.
- **Commit message** (write it to `/home/sites/shmup-cup-run/R5-08.S7-msg.txt` first):
  `feat(R5-08): remaster zone H IRON CITADEL`; the body lists the sections, the fortress gate, the new types, IRON
  SOVEREIGN and the re-rigged echoes, and says "re-bless zone-h-god, zone-h-boss, zone-h-deaths, zone-h-arcade and
  the demo zone-h: the zone was remastered (R5-08)" and "the fingerprints re-pinned: the zone's new sprite names
  shift every later sprite id"; no Co-Authored-By line.
- **Acceptance:** pushed; the replay diff ⊆ zone H's scope (every changed replay's `header.stageId` is in
  `--only`); every other golden and demo verified unchanged (no sim value outside the zone moved); the three
  fingerprints re-pinned by the LAND: a new sprite name shifts every later sprite id (ids are the sorted names,
  `wave-07.md`), so most walk segments of the presentation and shell fingerprints and every content-DB entry that
  holds a sprite id move — that is the re-pin, not a bug, and never a finding against the zone's scope; every
  fingerprint walk's own `expect` green; the commit body explains the re-pin; its `atlas-groups.json` block (or
  `common`); `docs/images/bosses/echo-*.png` and the zone's plates regenerated.
- **Token:** LAND (the land lock for the whole script).
- **Traps:** as wave 11's S7 (a rebase conflict is real: stop and report; never merge a derived file by hand; if the
  script aborts on its scope, report it — never widen the scope).
- **Post-LAND check** (a review slot, read-only): the LAND commit's `git show --stat` (find its SHA with
  `git log --oneline --grep 'feat(R5-08)' origin/master`) — the replays and demos it changed match the scope (no
  golden or demo outside it moved, so no sim value outside the zone changed); the fingerprint tables moved far
  outside the zone — expected, not a finding (a new sprite name shifts every later sprite id); the commit body
  explains that re-pin and lists the changed plates (zone H's own and the four `echo-*`); zone H's S6 Vitest
  commands green in a fresh worktree of `origin/master`; the zone's e2e spec once on master (one of the wave's e2e
  passes). Then the orchestrator removes the lane worktree and its branch:
  `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/zone-h && git -C /home/sites/shmup-cup branch -D r5/zone-h`.

### R5-10.T1 — The bonus stages at v2

- **Wave / lane / order:** wave 12, lane 2.
- **Depends on:** R5-02.S7 and R5-07.S7 (zones B and G own `brine-grotto` and `glimmer-cache`'s art) on
  `origin/master`.
- **Goal:** lay out the four bonus stages for the v2 frame and the new art: `brine-grotto` and `glimmer-cache`
  (layouts; B and G did their look), `bonus-vault` (art and layout), `bonus-range` (a check: its stage still works
  with zone A's frozen `picket`, `tender` and `halcyon-bulwark`).
- **Files (only these):** `content/stages/brine-grotto.stage.json`, `content/stages/glimmer-cache.stage.json`,
  `content/stages/bonus-vault.stage.json`, `content/stages/bonus-range.stage.json` (layout fields: camera, events,
  tilemap; the art fields B and G set stay), `content/enemies/bonus.enemies.json` (the carriers' art fields only —
  sprite, frames; never hp, score, drop); `test/golden/golden.test.ts` — the M2-10 bonus case only ('covers the
  hidden bonus stages of M2-10: …'); `test/golden/golden.ts` — the descriptions of `brine-grotto-god`,
  `glimmer-cache-god`, `bonus-vault-god`, `bonus-range-god` and `bonus-range-digit` only;
  `test/golden/golden-zone-b.test.ts` / `golden-zone-g.test.ts` — the `brine-grotto-god` / `glimmer-cache-god`
  expectations only. Every expectation is derived from the new layout, never pasted from a run.
- **Steps:** the orchestrator creates the worktree (rule 2:
  `git -C /home/sites/shmup-cup worktree add -b r5/bonus /home/sites/shmup-cup-run/wt/bonus origin/master`); then
  `cd /home/sites/shmup-cup-run/wt/bonus && git branch --show-current && git fetch origin && git rebase origin/master && pnpm install --frozen-lockfile --prefer-offline`
  (shell timeout 600000; it must print `r5/bonus`; the install is rule 2's); edit; test; commit on the branch
  (sources only); **stop and report**. After `R5-10.T1.RV` is at zero, the orchestrator starts the LAND (a new agent
  with this block, or this one resumed) — never run the LAND right after your own tests.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/bonus-stage-runtime.test.ts test/integration/release-audit.test.ts test/golden/golden-zone-b.test.ts test/golden/golden-zone-g.test.ts
  ```
- **The LAND** (after `R5-10.T1.RV` is at zero; from `/home/sites/shmup-cup-run/wt/bonus`; each about 25 min: shell
  timeout 3600000, or background with a log):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only brine-grotto,glimmer-cache,bonus-vault,bonus-range --message /home/sites/shmup-cup-run/R5-10.T1-msg.txt --zone b --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-b-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only brine-grotto,glimmer-cache,bonus-vault,bonus-range --message /home/sites/shmup-cup-run/R5-10.T1-msg.txt --zone b
  # --zone b only picks the zone checks the script runs; its test/golden run verifies every golden
  ```
  If the dry run's `test/golden` run fails on a bonus expectation, do not run the real LAND: report it; a fixer
  (`R5-10.T1.FIXn`) corrects the expectation on the branch so it states what the layout predicts, then a new review
  and a new dry run.
- **Commit message** (write it to `/home/sites/shmup-cup-run/R5-10.T1-msg.txt` first):
  `feat(R5-10): lay out the bonus stages for v2`; the body lists the four stages' new layouts and says "re-bless
  brine-grotto-god, glimmer-cache-god, bonus-vault-god, bonus-range-god and bonus-range-digit: the bonus stages were
  laid out for v2 (R5-10)" and "the fingerprints re-pinned: the bonus stages' layouts moved (and a new sprite name
  shifts every later sprite id)"; no Co-Authored-By line.
- **Expected red until the LAND** (list them in the report; do not fix them): the five bonus goldens (with their
  outcome cases in `golden.test.ts`, `golden-zone-b.test.ts` and `golden-zone-g.test.ts`), the `PINNED` comparisons
  of the three fingerprints, `test/integration/atlas-groups.test.ts`.
- **Acceptance:** each bonus stage of the map has bonus capsules and at most one 1UP (`release-audit.test.ts`, "gives
  each bonus stage …"); the bonus runtime tests green; the LAND re-blesses only `brine-grotto-god`,
  `glimmer-cache-god`, `bonus-vault-god`, `bonus-range-god` and `bonus-range-digit`, and verifies every other golden.
  After the push the orchestrator removes the lane worktree and its branch:
  `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/bonus && git -C /home/sites/shmup-cup branch -D r5/bonus`.
- **Token:** LAND.
- **Traps:** `terrain-a` stays the tileset of `bonus-vault` and `bonus-range` (decision R5-D3; zone A has its own
  `terrain-azure` since R5-01); never edit zone A's entries; ported numbers are ×1.5 already; the bonus entrances
  stay in zones B and G (do not move them here).
- **Docs needs:** the bonus stages' new layouts for `docs/dev/campaign-and-bonus-stages.md`.

### R5-10.T2 — The escape sequence's new layers

- **Wave / lane / order:** wave 12, lane 3, first.
- **Depends on:** R5-08.S7 (zone H's LAND) and R5-09.S7 (zone I's) on `origin/master`.
- **Goal:** give the escape stage the new backdrop layers (R3-06's painted bands, decor) and stand-in art. Decision
  R5-D3 / Q-13, owner-confirmed: the escape **keeps `terrain-a`**, gets `escape.mjs` and new layers only.
- **Files (only these):**
  - `content/stages/escape.stage.json` — parallax, decor, raster, tilemap art fields, and any event the new layers
    need;
  - `scripts/assets/procedural/escape.mjs` (**new**) — the escape's stand-in layers (frame-wide layers from
    `FRAME_W` / `FRAME_H` of `scripts/frame.mjs`);
  - `scripts/assets/procedural/index.mjs` — **two lines** registering `escape.mjs`:
    `import * as escape from './escape.mjs';` with the other imports and `{ id: 'escape', generate: escape.generate }`
    in `PROCEDURAL_GENERATORS` (this lane holds the registry in this wave; no other lane edits it);
  - `content/campaign/main.campaign.json` — the credits only: append `escape.mjs` to the generator credits line(s) of
    the "PLACEHOLDER ART GENERATORS" section, wherever the list ends after `R4-P.P1` (wave 7) and `R5-01.S2`
    (wave 10) rewrote it — read the section on `origin/master` first and add the name to one of its lines (in
    alphabetical order) or as one new line; each line within `MAX_CREDITS_LINE_LENGTH` characters and the section
    within `MAX_CREDITS_LINES` lines (both in `packages/core/src/data/campaign.ts`); this lane holds the campaign
    file in this wave;
  - `test/scripts/assets/procedural-escape.test.ts` (**new**) — sizes, frame counts, byte-identical runs.
- **Steps:** the orchestrator creates the worktree (rule 2:
  `git -C /home/sites/shmup-cup worktree add -b r5/escape /home/sites/shmup-cup-run/wt/escape origin/master`); then
  `cd /home/sites/shmup-cup-run/wt/escape && git branch --show-current && git fetch origin && git rebase origin/master && pnpm install --frozen-lockfile --prefer-offline`
  (shell timeout 600000; it must print `r5/escape`; the install is rule 2's); edit; test; commit on the branch
  (sources only); **stop and report**. After `R5-10.T2.RV` is at zero, the orchestrator starts the LAND (a new agent
  with this block, or this one resumed) — never run the LAND right after your own tests.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  pnpm assets
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/data/campaign-escape.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/campaign-flow.test.ts test/scripts/assets/procedural-escape.test.ts test/scripts/assets/pipeline.test.ts test/integration/frame-literals-repo.test.ts test/integration/palette-cycle-scan.test.ts
  # pipeline.test.ts scans every generator (escape.mjs too) for engine maths and for sprite names unique across generators
  ```
- **The LAND** (after `R5-10.T2.RV` is at zero; from `/home/sites/shmup-cup-run/wt/escape`; each about 25 min: shell
  timeout 3600000, or background with a log):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only escape --message /home/sites/shmup-cup-run/R5-10.T2-msg.txt --zone i --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-i-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only escape --message /home/sites/shmup-cup-run/R5-10.T2-msg.txt --zone i
  # `--only escape` matches no golden or demo: step 8 aborts if any replay changed; `--zone i` picks zone I's checks
  ```
- **Commit message** (write it to `/home/sites/shmup-cup-run/R5-10.T2-msg.txt` first):
  `feat(R5-10): give the escape sequence its v2 layers`; the body lists the new layers and `escape.mjs`, and says
  "no replay re-blessed: no golden plays the escape stage; the fingerprints, the atlas groups and the plates
  regenerated (R5-10): the new escape sprite names shift every later sprite id and the credits name escape.mjs";
  no Co-Authored-By line.
- **Acceptance:** the escape plays to its end (`campaign-escape`, `campaign-flow` green); **no replay may differ**
  (no golden or demo plays the escape stage; `zone-i-escape` is the ARK's boss escape in zone I) — the LAND's
  `--only escape` re-records nothing, verifies every golden and demo, and would abort on any changed replay; the
  LAND commit's `git show --stat` lists no `*.replay.json`; the fingerprints
  move and the LAND re-pins them (the new escape sprite names shift every later sprite id — ids are the sorted
  names, `wave-07.md` —, and the credits name `escape.mjs`): that is the re-pin, not a bug; every fingerprint walk's
  own `expect` green (`runA.escape` / `runB.escape` / `coopRun.escape` still reach the ending and the credits); the
  commit body explains the re-pin; two `pnpm assets` runs byte-identical; no frame literal in `escape.mjs`. After the
  push the
  orchestrator removes the lane worktree and its branch:
  `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/escape && git -C /home/sites/shmup-cup branch -D r5/escape`.
- **Token:** LAND; the registry `scripts/assets/procedural/index.mjs` and `content/campaign/main.campaign.json`
  (work-time, this lane only).
- **Traps:** `terrain-a` is used by 6 non-zone stages (bonus-range, bonus-vault, escape, gimmick-range, test-range,
  weapon-range) — never change its tiles or masks here; every registered generator must be named in the campaign
  credits (`content.test.ts`, 'rolls credits that list every placeholder-asset generator, the zones and the
  bosses') — that is why the credits line is in your files; the generator uses only exact maths and
  `scripts/assets/rng.mjs`; new colours ≥ 3/255 from every reserved ramp (the cycle scan).
- **Docs needs:** the escape's look for `docs/dev/visual-and-mechanic-extras.md` and its client page.

### R5-10.T8 — Linked stages share their zones' pages

- **Wave / lane / order:** wave 12, lane 3, after R5-10.T2. It needs one e2e pass.
- **Depends on:** R5-10.T2 on `origin/master`.
- **Goal:** decision W5-18's follow-up: linked and dev stages stop needing every page. The escape uses zone H's and
  zone I's pages, the bonus stages their zone's, `terrain-a` moves to `common`; the groups are re-derived. No
  mid-play re-upload.
- **Files (only these):**
  - `packages/shell/src/memory/index.ts` — `stageSpriteSets` / `atlasPageNeeds` / `stagePages` (the linked-stage
    rule; the docblock's derivation);
  - `test/integration/atlas-groups.test.ts` — the derivation (the file says it is the one place the rule lives);
  - `assets/source/atlas-groups.json` — **re-derived** with `SHMUP_ATLAS_GROUPS_UPDATE=1`, never by hand;
  - `packages/shell/test/memory/*.test.ts` — the pins that change;
  - `test/e2e/atlas-residency.spec.ts` — the linked-stage case.
- **Tests (targeted):**
  ```bash
  SHMUP_ATLAS_GROUPS_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/atlas-groups.test.ts && pnpm assets
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/atlas-groups.test.ts test/integration/atlas-zone-sprites.test.ts test/integration/standin-budget.test.ts test/integration/tv-engine-floor.test.ts   # tv-engine-floor: no API newer than Chromium 68 in packages/shell/src
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/memory
  # must stay green: the groups never move a sprite id or the sim (long: shell timeout 1800000):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts test/golden
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  nohup bash docs/v2-run/helpers/e2e-batch.sh atlas-residency.spec.ts atlas-context-loss.spec.ts campaign-run.spec.ts > /home/sites/shmup-cup-run/R5-10.T8-e2e.log 2>&1 &   # then poll the log
  ```
- **Commit and push:** one commit with explicit paths — `packages/shell/src/memory/index.ts`,
  `test/integration/atlas-groups.test.ts`, `assets/source/atlas-groups.json`, each
  `packages/shell/test/memory/*.test.ts` you changed, `test/e2e/atlas-residency.spec.ts` — subject
  `feat(R5-10): linked stages share their zones' atlas pages`, a body that says why (decision W5-18's follow-up: the
  escape needs `common` + H + I, the bonus stages their zone's, `terrain-a` moves to `common`; the groups
  re-derived; no golden or fingerprint moved); no Co-Authored-By line. Push under the land lock (README rule 6:
  `atlas-groups.json` is derived): write this script to `/home/sites/shmup-cup-run/R5-10.T8-push.sh`, then run
  `flock -w 5400 /tmp/shmup-cup-land.lock bash /home/sites/shmup-cup-run/R5-10.T8-push.sh` from your worktree
  (several minutes: a shell timeout of 3600000, or the background with a log):
  ```bash
  set -e
  git fetch origin && git rebase origin/master
  pnpm install --frozen-lockfile --prefer-offline && pnpm assets
  SHMUP_ATLAS_GROUPS_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/atlas-groups.test.ts && pnpm assets
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/atlas-groups.test.ts test/integration/atlas-zone-sprites.test.ts test/integration/standin-budget.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/memory
  git add assets/source/atlas-groups.json
  git commit --amend --no-edit
  git push origin HEAD:master
  ```
  If the script stops on a rebase conflict in `assets/source/atlas-groups.json`, take master's file and let the
  script re-derive it — never merge it by hand:
  `git checkout origin/master -- assets/source/atlas-groups.json && git add assets/source/atlas-groups.json && GIT_EDITOR=true git rebase --continue`,
  then run the flock line again. (During a rebase `--ours` / `--theirs` are swapped, so name `origin/master`.) A
  conflict in any other file is real: `git rebase --abort`, stop and report. If the push is rejected, run the flock
  line again (at most 5 times, then report). After the push, `git show --stat HEAD` must list only the files above.
- **Acceptance:** for every campaign zone the needed pages are `common` + its own; the escape needs `common` + H + I;
  the residency never re-uploads mid-play; the shell's allocation guards green; e2e green; the fingerprints and
  `test/golden` green without an update (nothing re-pinned, no replay re-blessed).
- **Token:** GROUPS (the land lock for the push); SHELL memory module (work-time, this lane).
- **Traps:** sprite names, their order and frame names never depend on the groups file, so goldens and fingerprints
  must **not** move — if one does, stop and report; Chromium 68 in `packages/shell/src` (no `.flat`, `.at(`, …);
  zero allocation in the residency's per-frame path.
- **Docs needs:** `docs/dev/asset-pipeline.md` (the linked-stage groups), `docs/dev/rendering-and-shell.md` (the
  residency rule).

### R5-10.T3 — The high-speed dimension's new layers

- **Wave / lane / order:** wave 12, lane 4. It needs one e2e pass.
- **Depends on:** R3-06 (wave 7) on `origin/master`.
- **Goal:** new layers and stand-in art for the Mode-7 dimension; re-measure its e2e rows.
- **Files (only these):** `content/stages/dimension.stage.json` (art fields), `scripts/assets/procedural/dimension.mjs`,
  `content/enemies/extras.enemies.json` (art fields only), `test/e2e/mode7.spec.ts` (the floor rows), and the
  dimension's procedural test file (`test/scripts/assets/procedural-*.test.ts` that holds `dimension.mjs`'s cases
  after R4-P.P2's split — look it up with `git grep -ln dimension test/scripts/assets`); the four plates of the
  sprites `dimension.mjs` draws — `docs/images/enemies/dim-pylon.png` and `docs/images/bosses/grasping-bloom.png`,
  `iron-talon.png`, `shadow-strider.png` (the boss portraits are assembled from their part trees) — regenerated by
  `pnpm docs:images`, never by hand (DOCS-IMAGES).
- **Tests (targeted):**
  ```bash
  pnpm assets
  # $(git grep …) adds the dimension's procedural test file (R4-P.P2's split) and pipeline.test.ts:
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/dimension-runtime.test.ts test/integration/palette-cycle-scan.test.ts test/integration/frame-literals-repo.test.ts $(git grep -ln dimension test/scripts/assets)
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden   # verified unchanged: the dimension has no golden (long: shell timeout 1800000)
  pnpm docs:images && git status --short docs/images   # only the four dimension plates above (or none)
  nohup bash docs/v2-run/helpers/e2e-batch.sh mode7.spec.ts > /home/sites/shmup-cup-run/R5-10.T3-e2e.log 2>&1 &   # then poll the log
  ```
- **Commit and push:** one commit with explicit paths (sources, the e2e rows, and the plates `git status` showed);
  the message says which plates moved and, if new sprite names came in, "the fingerprints re-pinned: new sprite
  names shift every later sprite id"; no Co-Authored-By line. Push under the land lock (README rule 6): write this
  script to `/home/sites/shmup-cup-run/R5-10.T3-push.sh`, then run
  `flock -w 5400 /tmp/shmup-cup-land.lock bash /home/sites/shmup-cup-run/R5-10.T3-push.sh` from your worktree
  (several minutes: a shell timeout of 3600000, or the background with a log):
  ```bash
  set -e
  git fetch origin && git rebase origin/master
  pnpm install --frozen-lockfile --prefer-offline && pnpm assets
  pnpm docs:images
  SHMUP_FINGERPRINT_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-db-fingerprint.test.ts test/integration/presentation-fingerprint.test.ts
  SHMUP_FINGERPRINT_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/content-db-fingerprint.test.ts test/integration/presentation-fingerprint.test.ts test/integration/dimension-runtime.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  pnpm docs:images --check
  test -z "$(git status --porcelain docs/images | grep -v -e dim-pylon.png -e grasping-bloom.png -e iron-talon.png -e shadow-strider.png)" || { echo 'a plate outside the four dimension plates changed: stop and report'; exit 1; }
  git add docs/images/enemies/dim-pylon.png docs/images/bosses/grasping-bloom.png docs/images/bosses/iron-talon.png docs/images/bosses/shadow-strider.png test/integration/content-db-fingerprint.test.ts test/integration/presentation-fingerprint.test.ts packages/shell/test/frame-fingerprint.test.ts
  git commit --amend --no-edit
  git push origin HEAD:master
  ```
  The update runs rewrite nothing when no sprite name changed. The `test -z` line stops the script before anything
  is staged when `pnpm docs:images` changed any other plate (`pnpm docs:images --check` is green right after a
  regeneration, so it cannot catch that). If the push is rejected, run the script again (at most 5 times, then
  report).
- **Acceptance:** the dimension runtime green; Mode-7 rows re-measured; no golden moves (the dimension has none —
  `test/golden` verified unchanged); `pnpm docs:images --check` clean after the push, with only the four dimension
  plates changed (or none).
- **Token:** DOCS-IMAGES (those four plates) and FINGERPRINTS (only if names change), both at push time under the
  land lock.
- **Traps:** Mode-7 `horizon` / `bottom` are frame rows (`PLAYFIELD_H`-anchored; the port set them); never edit
  `extras.enemies.json`' sim fields; e2e pixels through `frame-pixels.ts`; the dimension bosses' shared parts
  `bosses/core`, `bosses/orb` and `bosses/captain-shell` are drawn by other generators and used by other bosses —
  never redraw them here (they would move other plates); a plate outside the four in `git status --short
  docs/images`: stop and report.
- **Docs needs:** `docs/dev/visual-and-mechanic-extras.md` and `docs/client/visual-and-mechanic-extras.md`.

### R5-10.T6 — The dev ranges keep working on the new art

- **Wave / lane / order:** wave 12, lane 5.
- **Depends on:** the seven wave-11 LANDs and R5-08.S7 (so every retired or renamed name is known).
- **Goal:** the test and dev ranges get ported art only. Check every sprite they name still exists; fix a range's
  art fields only if a sprite it names was retired (none should be: the zones add names, never retire them).
- **Files (only these, and only if a check fails):** `content/stages/{test-range,weapon-range,gimmick-range,raster-range,captain-range,raid-range,twin-range,gauntlet-range,hunter-range,direct-range,test-boss}.stage.json`
  and their enemy files `content/enemies/{test-range,weapon-range,gimmick-range,option-hunters,direct-carriers,advanced-bosses,test-boss,test-sentry}.enemies.json`
  — art fields only.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden/golden.test.ts test/golden/golden-edge.test.ts
  ```
- **Acceptance:** `content:check` green (every sprite name exists); every range golden verified **unchanged**
  (`captain-range-god`, `gimmick-range-*`, `raid-range-*`, `raster-range-god`, `twin-range-god`, …). Likely a
  report-only subtask with no commit.
- **Token:** none; FINGERPRINTS only if a content file changed.
- **Traps:** a range golden that moves means a sim change — a bug here, report it; never `golden:update`.
- **Docs needs:** none expected.

### R5-0n.S3 — The real-art drop template (every zone)

Each zone's S3 drop follows this template; the per-zone blocks below name its sprites and checks.

- **Owner gates (all four before the agent starts):** the FLUX decision (or non-FLUX winners only); the zone's
  winners committed under `art-prompts/v2/winners/<id>/` (R0-04.W1); the owner's cleanup (`<name>.edit.png`) and
  `reviewed` stamps; a **fresh `choices.json` copy** from the owner (myadmin1's is a snapshot).
- **Goal:** replace the zone's stand-ins and interim art **by name** with ingested real art, as PNG overrides with
  provenance; no code change.
- **Files:** for each sprite of the zone: `assets/source/sprites/<name>.recipe.json` and the ingest outputs
  `<name>.png`, `<name>.json` (frame sidecar), `<name>.art.json` (provenance) next to it; tiles: the recipe's
  `collision` mode (W5-11: "clip-to-mask" for tiles the heightfield matches by mask) and, if a mask must change,
  `node scripts/assets/tileset-masks.mjs --write <tileset> <masks.json>`; the zone's e2e colour rows in
  `test/e2e/zone-<x>.spec.ts`; the zone's plates in `docs/images/` (DOCS-IMAGES);
  `content/enemies/zone-<x>.enemies.json` — the `anim.frames` fields only, and only on the LAND path below (a
  sprite whose real art has a new frame count shows its new frames only when the content's `anim.frames` names
  them).
- **Tests (targeted):**
  ```bash
  (cd art-prompts/ingest && npm ci && npm test && node ingest.mjs --check)
  node scripts/art-origins.mjs --check
  pnpm assets
  pnpm --filter @shmup/tizen build && pnpm --filter @shmup/webos build
  # Z = your zone's letter (a … i); zone B is shown — change "Z=b" on each of the next two lines:
  Z=b; VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/provenance.test.ts test/scripts/art-origins.test.ts test/integration/stage-terrain.test.ts test/integration/palette-cycle-scan.test.ts test/integration/standin-budget.test.ts test/integration/art-prompt-names.test.ts "test/integration/content-zone-$Z.test.ts"
  Z=b; nohup bash docs/v2-run/helpers/e2e-batch.sh "zone-$Z.spec.ts" > "/home/sites/shmup-cup-run/R5-0n.S3-zone-$Z-e2e.log" 2>&1 &   # then poll the log
  pnpm docs:images && git status --short docs/images   # only the zone's plates (and its echo plate, if the block names one)
  ```
  `art-prompt-names.test.ts` scans the new `*.recipe.json` / `*.art.json` under `assets/source/` for names
  `shmup_feat.md` §26 forbids.
- **Acceptance:** every shipped record complete (model, prompt, seed, source hash, `reviewed`); `art-origins --check`
  0 failures; the §26 name scan green; `pnpm docs:images --check` clean after the push, with only the zone's plates
  (and its echo plate) changed; the cycle scan clean (cycle art exactly on the zone's ramp, everything else
  ≥ 3/255 away); the terrain
  checks green; the zone's pages within its R3-04 budget (`standin-budget.test.ts`) and `dist/` within `DIST_BUDGET`
  (both TV builds' bundle checks) — never raise either; the zone's e2e rows re-pointed; the goldens and fingerprints
  **unchanged** — unless a sprite's `anim.frames` count changed: then the drop is a small LAND, with the reason in its
  commit message. For it (the LAND path):
  1. In your worktree, put the drop on a local branch first: `git switch -c r5/s3-zone-<x>` (your zone's letter,
     e.g. `r5/s3-zone-b`). `land-zone.sh` squashes and dry-runs "the branch" (R5-P.LAND, wave 9) and was tested only
     from a local branch, never from a detached HEAD. **Never push the branch** (the agent brief's GIT exception (a):
     only `land-zone.sh` pushes, as `HEAD:master`).
  2. Commit the drop there, sources only: the PNG overrides, recipes, sidecars and `.art.json` records, the
     `anim.frames` edits in `content/enemies/zone-<x>.enemies.json`, the e2e rows — never `docs/images/**`, a
     `PINNED` table, `atlas-groups.json` or a replay (the LAND regenerates them).
  3. Write the message to `/home/sites/shmup-cup-run/<id>-msg.txt` (`<id>` is your block's id, for example
     `R5-02.S3`) and run `land-zone.sh` from your worktree as the zone's S7 block writes it (zone A: wave 10's
     R5-01.S7; zones B … G and I: wave 11; zone H: R5-08.S7 above) — the same `--only` scope and `--zone` letter,
     `--message /home/sites/shmup-cup-run/<id>-msg.txt`, `--dry-run` first, then the real LAND.
  4. After the push: `git switch --detach origin/master && git branch -D r5/s3-zone-<x>` (your zone's letter).
- **Token:** DOCS-IMAGES for the zone's plates (land lock at push); LAND only if a frame count changed.
- **Traps:** a pure redraw (same names, same frame counts) moves only the atlas — a moved fingerprint is a bug: stop;
  never edit a v1 pixel map or a generator's v1 path (RR-1); a PNG override replaces a generated sprite by its name;
  hitboxes are content and never change with art; `ingest.mjs --check` stays byte-identical for every other record;
  no new npm dependency.
- **Docs needs:** the models used, for `docs/dev/art-provenance.md`; the zone's "stand-in vs real art" line.

### R5-01.S3 — Zone A real art

- **Depends on:** the template's owner gates; R5-01.S7. **Sprites:** the pixel maps
  `assets/source/sprites/enemies/{darter,drifter,gyre,hatch,hopper,turret,vane}.sprite.json` (the PNG overrides go
  beside them), `assets/source/sprites/bosses/{bulwark-emitter,bulwark-hull,bulwark-plate,bulwark-wing-bottom,bulwark-wing-top}.sprite.json`,
  the backdrops of `bg/azure-verge` (`backdrops.mjs`), the stand-ins of `azure.mjs` and the tileset `terrain-azure`.
  **Not** `bosses/core`: it is shared by ten bosses (`halcyon-bulwark`, `echo-bulwark`, `captain-circler`,
  `raid-leviathan`, `raid-heart`, `twin-ember`, `twin-frost`, `grasping-bloom`, `shadow-strider`, `test-boss`), so
  it is not zone A's to redraw — this drop leaves it on its interim art. **Checks:** the template's, with `zone-a`
  (`content-zone-a.test.ts`, `zone-a.spec.ts`). Zone H's `echo-bulwark` uses the `bulwark-*` names: its plate moves
  too.

### R5-02.S3 — Zone B real art

- **Depends on:** the gates; R5-02.S7. **Sprites:** everything `scripts/assets/procedural/brine.mjs` draws (the zone's
  enemies, `maw-*`, `herald-shell`, the backdrop layers, and the **complete** tileset sprite
  `tiles/terrain-reef-v2` of R5-02.S2 — since `R5-02.S5a` the tileset names that one `sprite` and draws **every**
  tile from it (`terrain-a`'s tiles first, in their order, then the variants: `R5-P.P13`), so the real-art tile
  frames land there too; the `tiles/terrain-reef` frames `terrain.mjs` draws show nowhere in the zone — leave
  them) and `brine-grotto`'s look. **Checks:** the template's with `zone-b`; `echo-maw`'s plate moves too.

### R5-03.S3 — Zone C real art

- **Depends on:** the gates; R5-03.S7. **Sprites:** what `dune.mjs` draws (`widow-*`, the worms, the skimmers, the
  layers, and the complete tileset sprite `tiles/terrain-dune-v2` — the tileset draws **every** tile from it since
  `R5-03.S5a` (`R5-P.P13`), so the real-art tile frames land there; the `tiles/terrain-dune` frames of
  `terrain.mjs` show nowhere in the zone). **Checks:** the template's with `zone-c`.

### R5-04.S3 — Zone D real art

- **Depends on:** the gates; R5-04.S7. **Sprites:** what `magma.mjs` draws (`bastion-*`, the bats, the cones, the
  layers, and the complete tileset sprite `tiles/terrain-magma-v2` — the tileset draws **every** tile from it since
  `R5-04.S5a` (`R5-P.P13`), the bricks among them, so the real-art tile frames land there; the
  `tiles/terrain-magma` frames of `terrain.mjs` show nowhere in the zone). **Checks:** the template's with
  `zone-d`; `echo-bastion`'s plate moves too.

### R5-05.S3 — Zone E real art

- **Depends on:** the gates; R5-05.S7. **Sprites:** what `tempest.mjs` draws (`steed-*`, the kites, the weather
  layers, and the complete tileset sprite `tiles/terrain-ridge-v2` — the tileset draws **every** tile from it since
  `R5-05.S5a` (`R5-P.P13`), so the real-art tile frames land there; the `tiles/terrain-ridge` frames of
  `terrain.mjs` show nowhere in the zone). **Checks:** the template's with `zone-e`.

### R5-06.S3 — Zone F real art

- **Depends on:** the gates; R5-06.S7. **Sprites:** what `vault.mjs` draws (`regent-*`, the cells, the layers,
  and the complete tileset sprite `tiles/terrain-vault-v2` — the tileset draws **every** tile from it since
  `R5-06.S5a` (`R5-P.P13`), the tissue walls among them, so the real-art tile frames land there; the
  `tiles/terrain-vault` frames of `terrain.mjs` show nowhere in the zone). **Checks:** the template's with
  `zone-f`; `echo-regent`'s plate moves too.

### R5-07.S3 — Zone G real art

- **Depends on:** the gates; R5-07.S7. **Sprites:** what `prism.mjs` draws (`facet-*`, the crystals, the
  `enemies/prism-cube` cubes, the layers, and the complete tileset sprite `tiles/terrain-prism-v2` — the tileset
  draws **every** tile from it since `R5-07.S5a` (`R5-P.P13`), the stacked `cube` tile among it, so the real-art
  tile frames land there; the `tiles/terrain-prism` frames of `terrain.mjs` show nowhere in the zone), and
  `glimmer-cache`'s look. **Checks:** the template's with `zone-g`.

### R5-08.S3 — Zone H real art

- **Depends on:** the gates; R5-08.S7. **Sprites:** what `citadel.mjs` draws (`sovereign-*`, the zone's enemies,
  the layers, and the complete tileset sprite `tiles/terrain-citadel-v2` — the tileset draws **every** tile from it
  since `R5-08.S5a` (`R5-P.P13`), so the real-art tile frames land there; the `tiles/terrain-citadel` frames of
  `terrain.mjs` show nowhere in the zone — the pistons and moving floors are `block` events drawn with the `-v2`
  tiles now). The echoes use the A, B, D, F bosses' names:
  their art comes with those zones' S3. **Checks:** the template's with `zone-h`.

### R5-09.S3 — Zone I real art

- **Depends on:** the gates; R5-09.S7. **Sprites:** what `abyss.mjs` draws (`ark-*`, `king-*`, the mines, the eels,
  the layers, and the complete tileset sprite `tiles/terrain-abyss-v2` — the tileset draws **every** tile from it
  since `R5-09.S5a` (`R5-P.P13`), so the real-art tile frames land there; the `tiles/terrain-abyss` frames of
  `terrain.mjs` show nowhere in the zone).
  **Checks:** the template's with `zone-i`.

## Reviews

- `R5-08.RV` and the post-LAND check: in zone H's blocks above.
- `R5-10.T1.RV`, `R5-10.T2.RV` (on their branches, before their LANDs), `R5-10.T3.RV`, `R5-10.T6.RV` (if it
  committed), `R5-10.T8.RV`: read the diff, re-run the block's tests, check the block's acceptance and traps; the
  loop to zero findings, a new reviewer each round.
  - **T1.RV / T2.RV:** T1's diff is
    `git -C /home/sites/shmup-cup-run/wt/bonus diff origin/master...r5/bonus`, T2's
    `git -C /home/sites/shmup-cup-run/wt/escape diff origin/master...r5/escape`. Re-run the block's **Tests** inside
    `/home/sites/shmup-cup-run/wt/bonus` (T1) / `/home/sites/shmup-cup-run/wt/escape` (T2) — `git branch
    --show-current` must print `r5/bonus` / `r5/escape` — never rebasing or committing there, and never its LAND
    commands (the branch's changes exist only in that worktree; a fresh worktree of `origin/master` would test
    master).
  - **T3.RV, T6.RV, T8.RV:** these pushed to `origin/master`: read `git show <SHA>` and re-run the block's Tests in
    your own fresh worktree of `origin/master`, except the e2e batch (read the block's log
    `/home/sites/shmup-cup-run/<id>-e2e.log`, `<id>` being the block's id); a re-derive or `pnpm docs:images` line
    must leave `git status --short` empty there.
- `R5-0n.S3.RV` for each drop: the provenance records against `docs/dev/art-provenance.md` (rules 1–6 of the origin
  report), the cycle scan, the unchanged goldens and fingerprints.

## Docs item

### W12.DOCS-A — The plan and the changelog

- **Depends on:** R5-08.S7, R5-10.T1, T2, T3, T6, T8 (and any S3 drop that landed).
- **Goal:** R5-08's As built (sections, the fortress gate, IRON SOVEREIGN, the re-rigged echoes, the re-bless
  reason) and Manual list; §17 R5-08 → `done (owner parts pending)`; §17 R5-10 → `in progress` (part 1 done; it is
  `not started` before you — wave 13's docs agent sets it `done (owner parts pending)`); the S3 drops' As built
  lines in their zone sections; CHANGELOG; delete the helpers
  `docs/v2-run/helpers/r5r6/zonerefs.py` and `docs/v2-run/helpers/r5r6/zonerefs.txt` (every zone lane is done after
  R5-08.S7) and their rows in `docs/v2-run/helpers/README.md` (the main table's two `r5r6/zonerefs.*` rows; in the
  "Where they came from" table the `r5r6/…` row keeps only `r5r6/carrier.py`); push; then report: the orchestrator
  runs the board sync.
- **Files (only these):** `plan_resolution.md` (R5-08, R5-10, the S3 notes of the zone sections, §17), `CHANGELOG.md`,
  `docs/v2-run/helpers/r5r6/zonerefs.py` and `docs/v2-run/helpers/r5r6/zonerefs.txt` (deleted with `git rm`),
  `docs/v2-run/helpers/README.md` (those rows only).
- **Tests:** `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tooling-config.test.ts`
  (the CHANGELOG's first-section rule). After the push, report: the orchestrator runs the board sync
  (`python3 .claude/plan_board_v2.py` in its main checkout — docs agents never run it).
- **Token:** PLAN.

### W12.DOCS-B — Zone H, the bonus stages, the escape and dimension, the linked-stage groups

- **Files (only these):** `docs/dev/zones-h-and-i.md` (the zone H part), `docs/client/bestiary.md` (zone H's
  section), `docs/dev/campaign-and-bonus-stages.md` (the bonus stages), `docs/dev/visual-and-mechanic-extras.md` and
  `docs/client/visual-and-mechanic-extras.md` (the escape, the dimension), `docs/dev/asset-pipeline.md` (the
  linked-stage groups of T8), `docs/dev/rendering-and-shell.md` (T8's residency rule), `docs/dev/art-provenance.md`
  (the models of the S3 drops, if any), `docs/client/outstanding-work.md` (zone H's owner parts),
  `docs/dev/debug-and-replays.md` (the golden table's rows for zone H's four scenarios and the five bonus goldens:
  the new outcomes and the re-bless reasons), `content/stages/README.md` and `content/enemies/README.md` (zone H's
  paragraphs), `content/paths/README.md` (the new `zone-h.paths.json`).
- **Depends on:** R5-08.S7, R5-10.T1, T2, T3, T8 (and T6's report). **Token:** none.
- **Tests:** `pnpm content:check` (the content README samples are validated).
- **Acceptance:** the README samples still validate; no stale v1 number in the touched sections.

### W12.DOCS-RV — Review of the docs item

- **Read:** the two docs pushes. **Must hold:** every statement matches the LAND commits, the pushes of T3 and T8
  and the reports; no builder-only file touched; §17 cells only for R5-08 (`done (owner parts pending)`) and R5-10
  (`in progress`). The loop to zero, as always.

## Exit check

1. `origin/master` holds R5-08.S7 (zone H's LAND), R5-10.T1's and T2's LANDs, and T3, T6 (if any), T8.
2. `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/content-db-fingerprint.test.ts test/integration/presentation-fingerprint.test.ts test/integration/atlas-groups.test.ts test/integration/atlas-zone-sprites.test.ts test/integration/campaign-flow.test.ts test/integration/bonus-stage-runtime.test.ts test/integration/dimension-runtime.test.ts test/playtest/zone-h.test.ts`
   and `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts packages/shell/test/memory`;
   then the cross-zone line (long: shell timeout 3600000):
   `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/campaign-routes-b.test.ts test/playtest/campaign-routes-c.test.ts test/playtest/campaign-routes-manta-b.test.ts test/playtest/campaign-routes-manta-c.test.ts test/integration/campaign-flow.test.ts test/integration/bonus-stage-runtime.test.ts test/golden/v2-port test/playtest/boss-rush.test.ts`.
3. `pnpm content:check`, `pnpm docs:images --check`, `node scripts/art-origins.mjs --check`.
4. The docs review at zero; §17 set by `W12.DOCS-A`; the board synced by the orchestrator after that push.
5. A CI look at most. **Deferred to wave 15:** the whole `pnpm test`, `pnpm test:e2e`, `pnpm bench`.

## Owner (Manual) — never blocks this wave

- The FLUX decision; the zones' AI art (generate, pick, clean, stamp `reviewed`); a fresh `choices.json` copy for
  every S3 drop; Git LFS for `art-prompts/v2/winners/` if wanted.
- Play zone H on the M7 (`build:dev`) and sign off; check the escape and the dimension on the TV.
