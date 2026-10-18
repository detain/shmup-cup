# Wave 14 — R6-01 balance

> Schedule: `plan_resolution.md` §18 · how to use: `docs/v2-run/README.md` · decisions: `docs/v2-run/decisions.md`
>
> **Run directory:** `RUN_DIR` is `/home/sites/shmup-cup-run` (README common rule 15). The commands below spell the
> path out, so each one runs as typed in a fresh shell; prose that says `RUN_DIR/…` means the same path.

**Steps:** R6-01 (balance and difficulty). · **Gate to start:** wave 13's exit — `docs/v2-run/balance-report.md`
(written by R6-01.B2, committed by R6-01.B2.DOCS) on `origin/master`; the owner's overrides, if he sent any (never
required). · **Exit (summary):** the nine per-zone passes LANDed one at a time, then the global pass (rules, built-in
tables, rank) re-blessed and the extra-mode pass pushed, each with its reason; every review at zero; the wave's docs
item done.

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| 1–8 (zone passes) | `R6-01.B3a` (A) · `B3b` (B) · `B3c` (C) · `B3d` (D) · `B3e` (E) · `B3f` (F) · `B3g` (G) · `B3h` (H), then `B3i` (I) in the first free lane | `content/enemies/zone-<x>.enemies.json`, `content/stages/zone-<x>.stage.json` | LAND at the end of each | none |
| 9 (alone, last) | `R6-01.B4 → R6-01.B5` | `content/rules/*`, the built-in copies in core, the rank curve; then the caravan clock, its strings and the boss-rush delays | GLOBAL (B4); SCENES, STRINGS ⇒ FINGERPRINTS (B5, a normal push under the land lock) | none |

- **Order rules:** at most 8 zone passes build at once; their LANDs run one at a time (the land lock). **B4 starts
  only after every B3 has LANDed**, and holds the land lock for its whole re-bless (GLOBAL: no LAND meanwhile). B5
  follows B4 in the same lane.
- **Reviews:** each `R6-01.B3x.RV` on its branch before its LAND; `R6-01.B4.RV`, `R6-01.B5.RV`; `R6-01.RV` (the step)
  at the end.
- **Docs item:** `W14.DOCS-A`, `W14.DOCS-B`.
- **Fillers:** wave 15's `R6-03.D3` / `D4` must **not** start early (the art and the screens follow the balance). An
  owner-ready `R5-0n.S3` drop may run as a filler under rule 6.

## Rules for this wave

1. **Apply the report.** `docs/v2-run/balance-report.md` has the sections `## Zone A` … `## Zone I` (one per B3x:
   B3a applies `## Zone A`, B3b `## Zone B`, …), `## Global` (B4) and `## Extra modes` (B5). Apply its proposed
   numbers; where the owner sent an override, the override wins (the orchestrator puts it in the subtask's prompt).
   Never change a number the report does not name.
2. **Zone passes are LANDs.** **This replaces common rule 1's worktree step:** never `git switch --detach`, never
   create another worktree. The orchestrator creates each zone's worktree once, from its main checkout — for zone A:
   `git -C /home/sites/shmup-cup worktree add -b r6/zone-a /home/sites/shmup-cup-run/wt/r6-zone-a origin/master`
   (each block names its own command). Every agent of the lane works in that worktree, one after another (never two
   at once). Start each subtask inside it with `git branch --show-current` — it must print your zone's branch
   (`r6/zone-a` for zone A); if HEAD is detached, run `git switch r6/zone-a` (your zone's branch) and say so in your
   report — then `git fetch origin && git rebase origin/master`. Commit with explicit paths on the branch; **never
   push the branch**; commits on it hold **sources only** (never a replay, a fingerprint's `PINNED` table,
   `assets/source/atlas-groups.json` or `docs/images/**`). The branch reaches `origin/master` only through the LAND:
   each block's command runs `docs/v2-run/helpers/land-zone.sh`, which takes `/tmp/shmup-cup-land.lock` itself — never
   wrap it in another `flock`. Run it with `--dry-run` first and read the dry run's log. Each run takes about 25
   minutes: give the shell call a `timeout` of 3600000, or run it in the background and poll its log. After the
   push, the orchestrator removes the lane worktree and deletes its branch (the command is in each block). The
   scopes are the zone LANDs' (A `zone-a,bonus-range`; B `zone-b,brine-grotto`; C `zone-c`; D `zone-d`; E `zone-e`;
   F `zone-f`; G `zone-g,glimmer-cache`; H `zone-h`; I `zone-i`).
3. **Still frozen:** `tender`'s fields (`content/enemies/zone-a.enemies.json`; it is every zone's capsule carrier —
   only B4 may change it, as a global change); the ids and sprite names every other file names.
4. **Scores and density only** in a zone pass: an enemy's or a boss's `score`, the number and spacing of spawns. A
   change that breaks the zone's v2 contract (`test/integration/zones/zone-<x>.contract.ts`) or the 4-way rules is
   wrong — keep the contract green, never relax it.
5. **Goldens:** every re-bless names its reason ("R6-01 balance: …"); a diff outside the declared scope is a bug.
   **Dry run first:** if the dry run's `test/golden` run fails on an outcome expectation (in
   `test/golden/golden-zone-<x>.test.ts`, or in `test/golden/golden.test.ts` for B4) because the report's change
   moved it — a score bound, a starting-lives count — do not run the real LAND: report it; a fixer
   (`R6-01.B3x.FIXn`, `R6-01.B4.FIXn`) corrects that expectation on the branch so it states what the change predicts
   (through the constant where one exists; never a pasted run output), then a new review and a new dry run.
6. **Late art drops (fillers).** An owner-ready `R5-0n.S3` (wave 12's template) may run as a filler (≤ 2, e2e pass
   permitting), never while `R6-01.B4` holds GLOBAL and never once `R6-03.D6` has started; R6-03.D3 / D4 wait for any
   drop the owner names for the release.

## Subtasks

### R6-01.B3a — Zone A's balance pass (the template for B3b … B3i)

- **Wave / lane / order:** wave 14, lane 1.
- **Depends on:** R6-01.B2.DOCS (it commits `docs/v2-run/balance-report.md`, wave 13) on `origin/master`.
- **Goal:** apply the report's `## Zone A` section: enemy and boss `score`s, density where the report flags it.
- **Files (only these):** `content/enemies/zone-a.enemies.json` (`score` fields; never `tender`, `picket` or
  `halcyon-bulwark`'s other fields — `picket` and `halcyon-bulwark` also play in `bonus-range`, so their score
  change is in this scope on purpose), `content/stages/zone-a.stage.json` (spawn / formation density);
  `test/golden/golden-zone-a.test.ts` — only an outcome expectation the change moves, and only as a fixer after a
  dry run (rule 5).
- **Worktree:** `/home/sites/shmup-cup-run/wt/r6-zone-a` on the local branch `r6/zone-a` (rule 2). The orchestrator
  creates it: `git -C /home/sites/shmup-cup worktree add -b r6/zone-a /home/sites/shmup-cup-run/wt/r6-zone-a origin/master`.
- **Steps:** `cd /home/sites/shmup-cup-run/wt/r6-zone-a && git branch --show-current && git fetch origin && git rebase origin/master`
  (the branch must print `r6/zone-a`); edit; run the tests; commit on `r6/zone-a` (sources only); review
  (`R6-01.B3a.RV`) to zero; write the commit message; the LAND (dry run first).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-a.test.ts test/playtest/zone-a.test.ts test/integration/release-audit.test.ts
  ```
- **Commit message** (write it to `/home/sites/shmup-cup-run/R6-01.B3a-msg.txt` first): `feat(R6-01): balance zone A
  — scores and density`; the body lists each changed value (old → new, with the report's line) and says "re-bless
  zone A's scope (zone-a, bonus-range): R6-01 balance: zone A scores / density"; no Co-Authored-By line.
- **The LAND** (after `R6-01.B3a.RV` is at zero; from `/home/sites/shmup-cup-run/wt/r6-zone-a`):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-a,bonus-range --message /home/sites/shmup-cup-run/R6-01.B3a-msg.txt --zone a --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-a-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-a,bonus-range --message /home/sites/shmup-cup-run/R6-01.B3a-msg.txt --zone a
  # each about 25 min: shell timeout 3600000, or background with a log; the script takes /tmp/shmup-cup-land.lock itself — never wrap it in another flock
  ```
  After the push, the orchestrator removes the lane worktree and its branch:
  `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/r6-zone-a && git -C /home/sites/shmup-cup branch -D r6/zone-a`.
- **Acceptance:** the zone's contract and the 4-way rules green; the bot still clears it in god mode; the LAND's
  replay diff ⊆ zone A's scope with the reason "R6-01 balance: zone A scores / density".
- **Token:** LAND.
- **Traps:** a score is a count, never ×1.5; density changes keep the capsule window rule (≥ 3 per 1,350 px after a
  checkpoint) and the calm (exactly two `carrier.straight`); never `golden:update` outside the LAND script.
- **Docs needs:** the changed values for `docs/dev/death-and-scoring.md` and the zone doc.

### R6-01.B3b — Zone B's balance pass

- As B3a (every bullet applies, with zone B in place of zone A), with the report's `## Zone B` section,
  `content/enemies/zone-b.enemies.json`, `content/stages/zone-b.stage.json` and
  `test/golden/golden-zone-b.test.ts` (rule 5 only); LAND scope `zone-b,brine-grotto`.
- **Worktree:** `/home/sites/shmup-cup-run/wt/r6-zone-b` on the local branch `r6/zone-b`. The orchestrator creates it:
  `git -C /home/sites/shmup-cup worktree add -b r6/zone-b /home/sites/shmup-cup-run/wt/r6-zone-b origin/master`.
- **Start:** `cd /home/sites/shmup-cup-run/wt/r6-zone-b && git branch --show-current && git fetch origin && git rebase origin/master`
  (the branch must print `r6/zone-b`).
- **Commit message** (write it to `/home/sites/shmup-cup-run/R6-01.B3b-msg.txt` first): `feat(R6-01): balance zone B
  — scores and density`; the body as B3a's, for zone B (zone-b, brine-grotto); no Co-Authored-By line.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-b.test.ts test/playtest/zone-b.test.ts test/integration/release-audit.test.ts
  ```
- **The LAND** (after `R6-01.B3b.RV` is at zero; from `/home/sites/shmup-cup-run/wt/r6-zone-b`):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-b,brine-grotto --message /home/sites/shmup-cup-run/R6-01.B3b-msg.txt --zone b --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-b-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-b,brine-grotto --message /home/sites/shmup-cup-run/R6-01.B3b-msg.txt --zone b
  # each about 25 min: shell timeout 3600000, or background with a log; never wrap it in another flock
  ```
  After the push, the orchestrator removes the lane worktree and its branch:
  `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/r6-zone-b && git -C /home/sites/shmup-cup branch -D r6/zone-b`.

### R6-01.B3c — Zone C's balance pass

- As B3a (every bullet applies, with zone C in place of zone A), with the report's `## Zone C` section,
  `content/enemies/zone-c.enemies.json`, `content/stages/zone-c.stage.json` and
  `test/golden/golden-zone-c.test.ts` (rule 5 only); LAND scope `zone-c`.
- **Worktree:** `/home/sites/shmup-cup-run/wt/r6-zone-c` on the local branch `r6/zone-c`. The orchestrator creates it:
  `git -C /home/sites/shmup-cup worktree add -b r6/zone-c /home/sites/shmup-cup-run/wt/r6-zone-c origin/master`.
- **Start:** `cd /home/sites/shmup-cup-run/wt/r6-zone-c && git branch --show-current && git fetch origin && git rebase origin/master`
  (the branch must print `r6/zone-c`).
- **Commit message** (write it to `/home/sites/shmup-cup-run/R6-01.B3c-msg.txt` first): `feat(R6-01): balance zone C
  — scores and density`; the body as B3a's, for zone C (zone-c); no Co-Authored-By line.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-c.test.ts test/playtest/zone-c.test.ts test/integration/release-audit.test.ts
  ```
- **The LAND** (after `R6-01.B3c.RV` is at zero; from `/home/sites/shmup-cup-run/wt/r6-zone-c`):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-c --message /home/sites/shmup-cup-run/R6-01.B3c-msg.txt --zone c --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-c-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-c --message /home/sites/shmup-cup-run/R6-01.B3c-msg.txt --zone c
  # each about 25 min: shell timeout 3600000, or background with a log; never wrap it in another flock
  ```
  After the push, the orchestrator removes the lane worktree and its branch:
  `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/r6-zone-c && git -C /home/sites/shmup-cup branch -D r6/zone-c`.

### R6-01.B3d — Zone D's balance pass

- As B3a (every bullet applies, with zone D in place of zone A), with the report's `## Zone D` section,
  `content/enemies/zone-d.enemies.json`, `content/stages/zone-d.stage.json` and
  `test/golden/golden-zone-d.test.ts` (rule 5 only); LAND scope `zone-d`.
- **Worktree:** `/home/sites/shmup-cup-run/wt/r6-zone-d` on the local branch `r6/zone-d`. The orchestrator creates it:
  `git -C /home/sites/shmup-cup worktree add -b r6/zone-d /home/sites/shmup-cup-run/wt/r6-zone-d origin/master`.
- **Start:** `cd /home/sites/shmup-cup-run/wt/r6-zone-d && git branch --show-current && git fetch origin && git rebase origin/master`
  (the branch must print `r6/zone-d`).
- **Commit message** (write it to `/home/sites/shmup-cup-run/R6-01.B3d-msg.txt` first): `feat(R6-01): balance zone D
  — scores and density`; the body as B3a's, for zone D (zone-d); no Co-Authored-By line.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-d.test.ts test/playtest/zone-d.test.ts test/integration/release-audit.test.ts
  ```
- **The LAND** (after `R6-01.B3d.RV` is at zero; from `/home/sites/shmup-cup-run/wt/r6-zone-d`):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-d --message /home/sites/shmup-cup-run/R6-01.B3d-msg.txt --zone d --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-d-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-d --message /home/sites/shmup-cup-run/R6-01.B3d-msg.txt --zone d
  # each about 25 min: shell timeout 3600000, or background with a log; never wrap it in another flock
  ```
  After the push, the orchestrator removes the lane worktree and its branch:
  `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/r6-zone-d && git -C /home/sites/shmup-cup branch -D r6/zone-d`.

### R6-01.B3e — Zone E's balance pass

- As B3a (every bullet applies, with zone E in place of zone A), with the report's `## Zone E` section,
  `content/enemies/zone-e.enemies.json`, `content/stages/zone-e.stage.json` and
  `test/golden/golden-zone-e.test.ts` (rule 5 only); LAND scope `zone-e`.
- **Worktree:** `/home/sites/shmup-cup-run/wt/r6-zone-e` on the local branch `r6/zone-e`. The orchestrator creates it:
  `git -C /home/sites/shmup-cup worktree add -b r6/zone-e /home/sites/shmup-cup-run/wt/r6-zone-e origin/master`.
- **Start:** `cd /home/sites/shmup-cup-run/wt/r6-zone-e && git branch --show-current && git fetch origin && git rebase origin/master`
  (the branch must print `r6/zone-e`).
- **Commit message** (write it to `/home/sites/shmup-cup-run/R6-01.B3e-msg.txt` first): `feat(R6-01): balance zone E
  — scores and density`; the body as B3a's, for zone E (zone-e); no Co-Authored-By line.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-e.test.ts test/playtest/zone-e.test.ts test/integration/release-audit.test.ts
  ```
- **The LAND** (after `R6-01.B3e.RV` is at zero; from `/home/sites/shmup-cup-run/wt/r6-zone-e`):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-e --message /home/sites/shmup-cup-run/R6-01.B3e-msg.txt --zone e --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-e-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-e --message /home/sites/shmup-cup-run/R6-01.B3e-msg.txt --zone e
  # each about 25 min: shell timeout 3600000, or background with a log; never wrap it in another flock
  ```
  After the push, the orchestrator removes the lane worktree and its branch:
  `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/r6-zone-e && git -C /home/sites/shmup-cup branch -D r6/zone-e`.

### R6-01.B3f — Zone F's balance pass

- As B3a (every bullet applies, with zone F in place of zone A), with the report's `## Zone F` section,
  `content/enemies/zone-f.enemies.json`, `content/stages/zone-f.stage.json` and
  `test/golden/golden-zone-f.test.ts` (rule 5 only); LAND scope `zone-f`.
  Zone F was the bot's hardest zone: re-run its playtest twice.
- **Worktree:** `/home/sites/shmup-cup-run/wt/r6-zone-f` on the local branch `r6/zone-f`. The orchestrator creates it:
  `git -C /home/sites/shmup-cup worktree add -b r6/zone-f /home/sites/shmup-cup-run/wt/r6-zone-f origin/master`.
- **Start:** `cd /home/sites/shmup-cup-run/wt/r6-zone-f && git branch --show-current && git fetch origin && git rebase origin/master`
  (the branch must print `r6/zone-f`).
- **Commit message** (write it to `/home/sites/shmup-cup-run/R6-01.B3f-msg.txt` first): `feat(R6-01): balance zone F
  — scores and density`; the body as B3a's, for zone F (zone-f); no Co-Authored-By line.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-f.test.ts test/playtest/zone-f.test.ts test/integration/release-audit.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-f.test.ts     # the second playtest run
  ```
- **The LAND** (after `R6-01.B3f.RV` is at zero; from `/home/sites/shmup-cup-run/wt/r6-zone-f`):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-f --message /home/sites/shmup-cup-run/R6-01.B3f-msg.txt --zone f --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-f-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-f --message /home/sites/shmup-cup-run/R6-01.B3f-msg.txt --zone f
  # each about 25 min: shell timeout 3600000, or background with a log; never wrap it in another flock
  ```
  After the push, the orchestrator removes the lane worktree and its branch:
  `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/r6-zone-f && git -C /home/sites/shmup-cup branch -D r6/zone-f`.

### R6-01.B3g — Zone G's balance pass

- As B3a (every bullet applies, with zone G in place of zone A), with the report's `## Zone G` section,
  `content/enemies/zone-g.enemies.json`, `content/stages/zone-g.stage.json` and
  `test/golden/golden-zone-g.test.ts` (rule 5 only); LAND scope `zone-g,glimmer-cache`.
- **Worktree:** `/home/sites/shmup-cup-run/wt/r6-zone-g` on the local branch `r6/zone-g`. The orchestrator creates it:
  `git -C /home/sites/shmup-cup worktree add -b r6/zone-g /home/sites/shmup-cup-run/wt/r6-zone-g origin/master`.
- **Start:** `cd /home/sites/shmup-cup-run/wt/r6-zone-g && git branch --show-current && git fetch origin && git rebase origin/master`
  (the branch must print `r6/zone-g`).
- **Commit message** (write it to `/home/sites/shmup-cup-run/R6-01.B3g-msg.txt` first): `feat(R6-01): balance zone G
  — scores and density`; the body as B3a's, for zone G (zone-g, glimmer-cache); no Co-Authored-By line.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-g.test.ts test/playtest/zone-g.test.ts test/integration/release-audit.test.ts
  ```
- **The LAND** (after `R6-01.B3g.RV` is at zero; from `/home/sites/shmup-cup-run/wt/r6-zone-g`):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-g,glimmer-cache --message /home/sites/shmup-cup-run/R6-01.B3g-msg.txt --zone g --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-g-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-g,glimmer-cache --message /home/sites/shmup-cup-run/R6-01.B3g-msg.txt --zone g
  # each about 25 min: shell timeout 3600000, or background with a log; never wrap it in another flock
  ```
  After the push, the orchestrator removes the lane worktree and its branch:
  `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/r6-zone-g && git -C /home/sites/shmup-cup branch -D r6/zone-g`.

### R6-01.B3h — Zone H's balance pass

- As B3a (every bullet applies, with zone H in place of zone A), with the report's `## Zone H` section,
  `content/enemies/zone-h.enemies.json` (the echoes' `score` too), `content/stages/zone-h.stage.json` and
  `test/golden/golden-zone-h.test.ts` (rule 5 only); LAND scope `zone-h`.
- **Worktree:** `/home/sites/shmup-cup-run/wt/r6-zone-h` on the local branch `r6/zone-h`. The orchestrator creates it:
  `git -C /home/sites/shmup-cup worktree add -b r6/zone-h /home/sites/shmup-cup-run/wt/r6-zone-h origin/master`.
- **Start:** `cd /home/sites/shmup-cup-run/wt/r6-zone-h && git branch --show-current && git fetch origin && git rebase origin/master`
  (the branch must print `r6/zone-h`).
- **Commit message** (write it to `/home/sites/shmup-cup-run/R6-01.B3h-msg.txt` first): `feat(R6-01): balance zone H
  — scores and density`; the body as B3a's, for zone H (zone-h); no Co-Authored-By line.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-h.test.ts test/playtest/zone-h.test.ts test/integration/release-audit.test.ts
  ```
- **The LAND** (after `R6-01.B3h.RV` is at zero; from `/home/sites/shmup-cup-run/wt/r6-zone-h`):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-h --message /home/sites/shmup-cup-run/R6-01.B3h-msg.txt --zone h --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-h-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-h --message /home/sites/shmup-cup-run/R6-01.B3h-msg.txt --zone h
  # each about 25 min: shell timeout 3600000, or background with a log; never wrap it in another flock
  ```
  After the push, the orchestrator removes the lane worktree and its branch:
  `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/r6-zone-h && git -C /home/sites/shmup-cup branch -D r6/zone-h`.

### R6-01.B3i — Zone I's balance pass

- As B3a (every bullet applies, with zone I in place of zone A), with the report's `## Zone I` section,
  `content/enemies/zone-i.enemies.json`, `content/stages/zone-i.stage.json` and
  `test/golden/golden-zone-i.test.ts` (rule 5 only); LAND scope `zone-i`.
- **Worktree:** `/home/sites/shmup-cup-run/wt/r6-zone-i` on the local branch `r6/zone-i`. Starts in the first free lane; then the orchestrator creates it:
  `git -C /home/sites/shmup-cup worktree add -b r6/zone-i /home/sites/shmup-cup-run/wt/r6-zone-i origin/master`.
- **Start:** `cd /home/sites/shmup-cup-run/wt/r6-zone-i && git branch --show-current && git fetch origin && git rebase origin/master`
  (the branch must print `r6/zone-i`).
- **Commit message** (write it to `/home/sites/shmup-cup-run/R6-01.B3i-msg.txt` first): `feat(R6-01): balance zone I
  — scores and density`; the body as B3a's, for zone I (zone-i — it includes `zone-i-escape`, the ARK's boss-escape scenario); no Co-Authored-By line.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-i.test.ts test/playtest/zone-i.test.ts test/integration/release-audit.test.ts
  ```
- **The LAND** (after `R6-01.B3i.RV` is at zero; from `/home/sites/shmup-cup-run/wt/r6-zone-i`):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-i --message /home/sites/shmup-cup-run/R6-01.B3i-msg.txt --zone i --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-i-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-i --message /home/sites/shmup-cup-run/R6-01.B3i-msg.txt --zone i
  # each about 25 min: shell timeout 3600000, or background with a log; never wrap it in another flock
  ```
  After the push, the orchestrator removes the lane worktree and its branch:
  `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/r6-zone-i && git -C /home/sites/shmup-cup branch -D r6/zone-i`.

### R6-01.B4 — The global pass: presets, extends, rank, scoring

- **Wave / lane / order:** wave 14, lane 9, after **every** B3 LAND; alone (GLOBAL).
- **Depends on:** R6-01.B3a … B3i on `origin/master`.
- **Goal:** apply the report's `## Global` section: the four presets (lives, extends, rank base and growth,
  continues, death penalty, bullet speed) in `difficulty.rules.json`; the scoring rules (cancel points, the milking
  cap `repeatKills` / `repeatPercent`); the extends (today 20,000 / every 70,000); the rank curve only if the report
  asks. The built-in copies in core equal the content (the `content.test.ts` cases 'ships the scoring rules (M2-02)
  equal to the built-in ones, and a compiled pattern library' and 'ships the difficulty presets of plan M2-01, equal
  to the built-in table').
- **Files (only these):**
  - `content/rules/difficulty.rules.json`, `content/rules/scoring.rules.json`, `content/rules/README.md` (only if its
    sample shows a changed value — the samples are validated);
  - `packages/core/src/config/index.ts` — `DEFAULT_DIFFICULTY_TABLE` (`:321` on `bc8e05d`) (CORE-CONFIG);
  - `packages/core/src/scoring/index.ts` — `DEFAULT_SCORING_RULES` (`:159`);
  - `packages/core/src/rank/index.ts` — only if the curve changes;
  - `content/enemies/zone-a.enemies.json` — the `tender` entry only, and only if `## Global` changes it (rule 3);
  - the pins: `packages/core/test/config/config-difficulty.test.ts`, `config-difficulty-edge.test.ts`,
    `packages/core/test/rank/rank*.test.ts`, `packages/core/test/scoring/scoring*.test.ts`, and the other tests that
    import the tables (`git grep -ln "DEFAULT_DIFFICULTY_TABLE\|DEFAULT_SCORING_RULES" packages test` — e.g.
    `packages/core/test/world/world-m3-content.test.ts`, `packages/core/test/replay/replay-demo-edge.test.ts`,
    `test/integration/patterns-runtime.test.ts`) — only where a pinned value changed;
  - `test/golden/golden.test.ts` and `test/golden/golden-zone-<x>.test.ts` — only an outcome expectation that pins a
    value this pass changes (a starting-lives `3`, an extend threshold), and only as a fixer after a dry run (rule 5);
  - every golden and demo (the whole-set re-bless; the helper regenerates them).
- **Worktree:** `/home/sites/shmup-cup-run/wt/r6-global` on the local branch `r6/global` (never pushed). This
  replaces common rule 1's worktree step, as rule 2 does for the zones. The orchestrator creates it after the last B3
  LAND: `git -C /home/sites/shmup-cup worktree add -b r6/global /home/sites/shmup-cup-run/wt/r6-global origin/master`.
- **Steps:**
  1. `cd /home/sites/shmup-cup-run/wt/r6-global && git branch --show-current && git fetch origin && git rebase origin/master`
     (it must print `r6/global`; if HEAD is detached, run `git switch r6/global` and say so in your report). Edit
     content and the built-in copies together; fix the pins that changed (through the constants, never by pasting a
     failing run's output); commit on the branch (sources only).
  2. Review (`R6-01.B4.RV`) on the branch to zero. Write the commit message to
     `/home/sites/shmup-cup-run/R6-01.B4-msg.txt`: `feat(R6-01): balance the presets, extends, scoring and rank`; the
     body lists every changed value and says "re-bless every golden and demo: R6-01 balance: presets / extends /
     scoring / rank (docs/v2-run/balance-report.md)"; no Co-Authored-By line.
  3. The whole-set re-bless with the helper's GLOBAL mode — it takes the land lock itself for the whole run, so no
     LAND overlaps it (`--zone a` only picks the zone checks; the `test/golden` run covers every golden):
     ```bash
     RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --all --message /home/sites/shmup-cup-run/R6-01.B4-msg.txt --zone a --dry-run
     # read the dry run's log (/home/sites/shmup-cup-run/land-a-<date>.log); only when it is clean, the real run:
     RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --all --message /home/sites/shmup-cup-run/R6-01.B4-msg.txt --zone a
     # long (every golden and demo): shell timeout 3600000, or background with a log; never wrap it in another flock
     ```
     It runs `pnpm golden:update` (the whole set), the fingerprints' update mode and `pnpm docs:images`, then pushes.
     A dry run whose `test/golden` fails on an outcome expectation follows rule 5 (`R6-01.B4.FIXn`).
  4. After the push, the orchestrator removes the worktree and its branch:
     `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/r6-global && git -C /home/sites/shmup-cup branch -D r6/global`.
- **Tests (targeted, on the branch):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/config packages/core/test/rank packages/core/test/scoring packages/core/test/world/world-m3-content.test.ts packages/core/test/replay
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/patterns-runtime.test.ts test/integration/release-audit.test.ts test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts packages/shell/test/determinism
  pnpm --filter @shmup/core typecheck
  ```
  **Expected red on the branch, until the re-bless** (list them in the report; never fix them by hand — the helper
  re-records and re-checks them): `test/golden` (the replays), `packages/shell/test/determinism` (it replays the
  goldens) and the `PINNED` comparisons of the three fingerprints.
- **Acceptance:** content and built-in tables equal; every golden and demo re-blessed in one commit with the reason
  "R6-01 balance: presets / extends / scoring / rank (docs/v2-run/balance-report.md)"; the zone contracts and the
  4-way rules green.
- **Token:** GLOBAL (the land lock for the whole re-bless); CORE-CONFIG.
- **Traps:** core stays pure (no `Math.pow` / `**` in a new curve: plain multiplication or `core/math`'s tables);
  `tender` may change only here, as a global change, with the reason; a rank curve change touches every zone — the
  bot must still clear them all (run the nine `test/playtest/zone-<x>.test.ts` files if the curve changed).
- **Docs needs:** the new tables for `docs/dev/difficulty-and-rank.md`, `docs/dev/death-and-scoring.md`, the client
  difficulty notes.

### R6-01.B5 — The extra modes: the caravan clock and the boss-rush delays

- **Wave / lane / order:** wave 14, lane 9, after R6-01.B4.
- **Depends on:** R6-01.B4 on `origin/master`.
- **Goal:** apply the report's `## Extra modes` section. Default (decision R6-D1): the caravan keeps **3 minutes**
  (`CARAVAN_TICKS` = `180 * 60`, `packages/core/src/scenes/index.ts:1268`); only if the report says otherwise change
  it, with its hint string. Retime the boss-rush delays if the report asks. If the section changes nothing, push
  nothing and report "no change".
- **Files (only these):**
  - `packages/core/src/scenes/index.ts` — `CARAVAN_TICKS` only (SCENES);
  - `content/strings/{en,es,ja}.strings.json` — `extraCaravanHint` (en `:284` "SCORE ATTACK: THREE MINUTES") and
    `packages/core/src/ui/strings.ts` — `extraCaravanHint` (`:342`) (STRINGS; en must equal the built-in table);
  - `content/stages/boss-rush.stage.json` — the `rush` delays;
  - `packages/core/test/scenes/scenes-extra-modes.test.ts`, `test/playtest/boss-rush.test.ts` — the pins;
  - the `PINNED` tables of `test/integration/presentation-fingerprint.test.ts`,
    `test/integration/content-db-fingerprint.test.ts` and `packages/shell/test/frame-fingerprint.test.ts`
    (FINGERPRINTS — regenerated by the push script in step 3, never edited by hand).
- **Steps:**
  1. Your own worktree from `origin/master` (common rule 1 — B5 is not a lane worktree), then
     `pnpm install --frozen-lockfile --prefer-offline && pnpm assets`.
  2. Edit; run the tests below; make **one** commit with explicit paths (sources only):
     `feat(R6-01): retime the extra modes`, the body listing each changed value and "R6-01 balance: extra modes
     (docs/v2-run/balance-report.md)"; no Co-Authored-By line. Review (`R6-01.B5.RV`) to zero.
  3. Push under the land lock (README rule 6): write the script below to `/home/sites/shmup-cup-run/R6-01.B5-push.sh`,
     then run `flock -w 5400 /tmp/shmup-cup-land.lock bash /home/sites/shmup-cup-run/R6-01.B5-push.sh` from your
     worktree (several minutes: a shell timeout of 3600000, or the background with a log):
     ```bash
     set -e
     git fetch origin && git rebase origin/master
     pnpm install --frozen-lockfile --prefer-offline && pnpm assets
     SHMUP_FINGERPRINT_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
     SHMUP_FINGERPRINT_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
     VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
     VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
     git add test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts packages/shell/test/frame-fingerprint.test.ts
     git commit --amend --no-edit
     git push origin HEAD:master
     ```
     If the push is rejected, run the script again (at most 5 times, then report). After the push,
     `git show --stat HEAD` must list only your sources and the fingerprint files; anything else: stop and report.
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/scenes/scenes-extra-modes.test.ts packages/core/test/ui
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/localization.test.ts test/integration/cjk-budget.test.ts test/playtest/boss-rush.test.ts
  pnpm content:check
  ```
- **Acceptance:** the caravan hint matches the clock in en, es and ja; the strings use only the bitmap font's glyphs
  (`localization.test.ts`, `cjk-budget.test.ts`); the boss rush clears in god mode within its budget; every golden
  verified unchanged (`test/golden` — `zone-a-caravan` pins its own `timeLimit: 3600`; `CARAVAN_TICKS` moves only the
  `extra.caravan` walk of the presentation fingerprint and `scenes-extra-modes.test.ts`); the presentation fingerprint
  moves only in segments that show the caravan (its clock or its hint) or the boss rush, the content-DB fingerprint
  only in its strings and stage digests; the shell frame fingerprint unchanged (its scenes show neither — if its
  `PINNED` table moved, stop and report).
- **Token:** SCENES, STRINGS (⇒ FINGERPRINTS); the land lock for the push.
- **Traps:** ticks never scale; a text change must fit its panel in all three languages (`ui-layout-frame.test.ts`
  under `packages/core/test/ui`); likely a no-op if the report keeps 3 min; never `pnpm golden:update` (B5 holds no
  GOLDEN: a golden that moves is a bug — stop and report).
- **Docs needs:** the caravan and boss-rush notes for `docs/client/extra-modes-and-replays.md`.

## Reviews

- `R6-01.B3a.RV` … `R6-01.B3i.RV`: on the branch, before the LAND — the diff touches only the zone's score and
  density fields (and, after a dry run, a `golden-zone-<x>.test.ts` expectation under rule 5), every change
  traceable to the report (or an owner override), the contract green.
- `R6-01.B4.RV`: the tables equal content, the re-bless reason, nothing outside the global section changed.
- `R6-01.B5.RV`: the clock and its strings agree; the scope; the fingerprints moved only where the change shows.
- `R6-01.RV`: the step review over B1 … B5 — the report's proposals all applied or explicitly declined.
- Every loop: a new reviewer each round, until zero findings, nits included.

## Docs item

### W14.DOCS-A — The plan and the changelog

- **Depends on:** R6-01.B5 (or its "no change" report) and `R6-01.RV` at zero.
- **Goal:** R6-01's As built (the changed numbers, the re-bless reasons, the owner's overrides if any) and Manual
  list (the owner's play sessions); §17 R6-01 → `done (owner parts pending)`; CHANGELOG; push; then report: the
  orchestrator runs the board sync.
- **Files (only these):** `plan_resolution.md` (R6-01, §17), `CHANGELOG.md`. **Token:** PLAN.
- **Tests:** `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tooling-config.test.ts`
  (the CHANGELOG's first-section rule).

### W14.DOCS-B — Difficulty, scoring and the extra modes

- **Depends on:** R6-01.B5 (or its "no change" report) and `R6-01.RV` at zero.
- **Files (only these):** `docs/dev/difficulty-and-rank.md`, `docs/dev/death-and-scoring.md`, `docs/client/controls.md`
  and `docs/client/README.md` (their difficulty notes only), `docs/client/extra-modes-and-replays.md` (the caravan,
  the boss rush), `docs/dev/zone-a-and-playtest.md`, `docs/dev/zones-b-and-c.md`, `docs/dev/zones-d-and-e.md`,
  `docs/dev/zones-f-and-g.md` and `docs/dev/zones-h-and-i.md` (the B3x score and density notes only).
- **Tests:** none.

### W14.DOCS-RV — Review of the docs item

- The loop to zero, as in every wave.

## Exit check

1. `origin/master` holds the nine B3 LANDs, B4's global re-bless and B5 (or its "no change" report).
2. On a fresh worktree of `origin/master` (long: shell timeout 3600000):
   ```bash
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/release-audit.test.ts test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts test/playtest/boss-rush.test.ts
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/campaign-routes-b.test.ts test/playtest/campaign-routes-c.test.ts test/playtest/campaign-routes-manta-b.test.ts test/playtest/campaign-routes-manta-c.test.ts test/integration/campaign-flow.test.ts test/integration/bonus-stage-runtime.test.ts test/golden/v2-port
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/config packages/core/test/rank packages/core/test/scoring
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts packages/shell/test/determinism
   ```
3. `pnpm content:check`.
4. The docs review at zero; §17 set by `W14.DOCS-A`; the board synced by the orchestrator after that push
   (`python3 .claude/plan_board_v2.py` in its main checkout — docs agents never run it).
5. A CI look at most. **Deferred to wave 15:** the whole `pnpm test`, `pnpm test:e2e`, `pnpm bench`.

## Owner (Manual) — never blocks this wave

- Play sessions over every route with both ships; send notes (they become a follow-up subtask, or v2.0.x work).
