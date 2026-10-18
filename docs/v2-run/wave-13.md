# Wave 13 — R5-10 part 2 (`v2.0.0-beta.1`) ∥ R6 opening

> Schedule: `plan_resolution.md` §18 · how to use: `docs/v2-run/README.md` · decisions: `docs/v2-run/decisions.md`
>
> **Run directory:** `RUN_DIR` is `/home/sites/shmup-cup-run` (README common rule 15). The commands below spell the
> path out, so each one runs as typed in a fresh shell; prose that says `RUN_DIR/…` means the same path.

**Steps:** R5-10 part 2 (the boss rush, the loops and the caravan, the bench's real zones, the beta.1 version line),
R6-01's opening (the balance harness and its report), R6-02's opening (the headless re-measure, the owner's capture
kit). · **Gate to start:** wave 12's exit — all nine zones LANDed, R5-10.T1, T2, T3 and T8 on `origin/master`, T6
done (pushed or reported). ·
**Exit (summary):** R5-10 done; the `2.0.0-beta.1` version line on `origin/master` and the pre-release tag
`v2.0.0-beta.1` (decision RUN-1: **without** the milestone full suite — R5-10.T10 is deferred to wave 15); the
balance report committed; the re-measure numbers and the capture checklist handed to the docs item; every review at
zero.

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e / bench |
|---|---|---|---|---|
| 1 boss rush | `R5-10.T4` | `content/stages/boss-rush.stage.json`, `test/playtest/boss-rush.test.ts` | FINGERPRINTS | none |
| 2 loops | `R5-10.T5` | `test/integration/loops-runtime.test.ts` (only if a pin moved) | none | none |
| 3 bench | `R5-10.T7` | `test/bench/render.perf.ts`, `render-harness/load.ts`, `render-bench` tests, `apps/tizen/src/bench/scene.ts` | none | bench (lock) |
| 4 version | `R5-10.T9` | the 10 `package.json`, three version pins | none | none |
| 5 balance | `R6-01.B1 → R6-01.B2 → R6-01.B2.DOCS` | `test/bench/balance.perf.ts` (new); the report in the run directory (B2); `docs/v2-run/balance-report.md` (new, B2.DOCS) | none | bench (lock) |
| 6 re-measure | `R6-02.P1` (after R5-10.T7) | the bench gates and `check-bundle.mjs` **only with reasons** | none | bench (lock) |
| 7 capture kit | `R6-02.P2` | none committed (builds + a checklist in the report) | none | none |

- **Order rules:** `R6-02.P1` waits for `R5-10.T7` (both may touch `test/bench/render.perf.ts`). `R5-10.T9` may run at
  any time but pushes last of R5-10's builders (T1 … T8). The step review `R5-10.RV`, late subtask-review fixes
  and the docs item push after T9, so the beta tag is the wave's last action and targets `origin/master` once they
  are all on it (rule 4), never T9's own commit.
- **The e2e lock** serialises every bench run (T7, B1/B2, P1): at most two of those agents wait for it at a time.
- **Reviews:** `R5-10.T4.RV`, `R5-10.T5.RV` (only if T5 committed), `R5-10.T7.RV`, `R5-10.T9.RV`, `R5-10.RV` (the
  step), `R6-01.B1.RV`, `R6-01.B2.RV`, `R6-01.B2.DOCS.RV`, `R6-02.P1.RV`; and a zone fix's `<id>.RV` on its
  branch before its LAND, if a zone fix runs (rule 1).
- **Docs item:** `W13.DOCS-A`, `W13.DOCS-B`, `W13.DOCS-C` (they may overlap wave 14's first builders).
  `R6-01.B2.DOCS` (lane 5) is a docs agent too, but it belongs to the code exit: wave 14 reads the file it commits.
- **Fillers:** an owner-ready `R5-0n.S3` real-art drop (rule 5).

## Rules for this wave

1. **No zone file is open.** The zones are LANDed. A zone fix found here (a remix that does not span the expanded
   stage, a boss-rush delay that needs a zone change) is a small fix subtask the orchestrator spawns, never an edit
   inside another lane. Its id is the zone's step plus `ZFIX` and a number (zone B's first fix: `R5-02.ZFIX1`; the
   zone steps are in the README's § Subtask ids); below, `<id>` is that id and `<x>` the zone's letter. It works
   like a zone lane (wave 11 rule 1):
   - **The worktree:** the orchestrator creates the fix's worktree and branch (for zone B:
     `git -C /home/sites/shmup-cup worktree add -b r5/fix-zone-b /home/sites/shmup-cup-run/wt/fix-zone-b origin/master`).
   - **The prompt line:** the orchestrator's prompt for the fix says: "lane worktree, exception (a) of the GIT block —
     skip only the WORKTREE block's first three lines (fetch, worktree add, cd). Start lines:
     `cd /home/sites/shmup-cup-run/wt/fix-zone-<x>` (your zone's letter); `git branch --show-current` must print
     `r5/fix-zone-<x>` (if HEAD is detached, run `git switch r5/fix-zone-<x>` and say so in your report); then
     `git fetch origin && git rebase origin/master`; then still run the WORKTREE block's `pnpm install` line there
     (and `pnpm assets` when your tests need the atlas). Commit on that branch and never push it" (the agent brief's
     exception (a) list names `fix-zone-<x>` too; the prompt still gives the zone's letter).
   - **Two agent turns, with the review between them** (as wave 14's rule 2):
     - **Turn 1:** the start lines, the edit, the tests below, one commit on `r5/fix-zone-<x>` (sources only: never a
       replay, a fingerprint's `PINNED` table, `assets/source/atlas-groups.json` or `docs/images/**`); then report
       and stop — never write the message file, never run the helper.
     - **Turn 1's tests:** `pnpm content:check`;
       `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-<x>.test.ts`;
       and every Vitest line of the zone's S6 block (zone A: `wave-10.md` `R5-01.S6`; zone H: `wave-12.md`
       `R5-08.S6`; the other zones: `wave-11.md` `R5-0n.S6`), which the orchestrator copies into the prompt —
       whatever that block lists: the zone's playtest and recovery tests, `release-audit.test.ts`, the cross-zone
       checks and, where the zone has them, its runtime and Direct tests. Leave out S6's e2e line: no e2e runs in
       this wave, and R6-03.D6's full Chromium run (wave 15) covers the zone's spec. A golden, a demo or a
       fingerprint's `PINNED` comparison that the fix moves stays red until the LAND (the LAND re-records the scope
       and re-pins): list each in the report, never fix it on the branch.
     - **The review:** the orchestrator starts `<id>.RV` on the branch. It reads
       `git -C /home/sites/shmup-cup-run/wt/fix-zone-<x> diff origin/master...r5/fix-zone-<x>`, re-runs turn 1's
       tests, and checks that only the zone's own files changed and that no derived file is on the branch. A finding
       goes to a fix agent (`<id>.FIXn`) that works in the same lane worktree and commits on the same branch; a new
       review follows, until a review reports zero findings.
     - **Turn 2:** the orchestrator starts a new agent with the same prompt and this line at its top: "You are turn 2:
       the review is at zero — write the commit message file, run the dry run, read its log, then the LAND." It runs
       the start lines again and writes `/home/sites/shmup-cup-run/<id>-msg.txt`: the subject
       `fix(R5-0n): <what the fix does>` with the zone's step (e.g. `fix(R5-02): zone B's remix spans the expanded
       stage`); a body that says why and "re-bless <scope>: <the reason>"; no Co-Authored-By line. Then it runs the
       LAND below with `--dry-run`, reads the dry run's log (`/home/sites/shmup-cup-run/land-<x>-<date>.log`), and
       only when the log is clean runs the real LAND. If the dry run's `test/golden` run fails on an outcome
       expectation, it does not LAND: it reports, a `<id>.FIXn` corrects that expectation on the branch (as wave 11's
       S7 "Dry run first" says), then a new review and a new turn 2.
   - **The LAND** (turn 2, from `/home/sites/shmup-cup-run/wt/fix-zone-<x>`; Token: LAND): the fix reaches
     `origin/master` only through
     `RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only <scope> --message /home/sites/shmup-cup-run/<id>-msg.txt --zone <x>`,
     where `<scope>` is the zone's LAND scope as its S7 block writes it (for zone B `zone-b,brine-grotto`);
     `--dry-run` first; shell timeout 3600000, or the background with a log; the script takes
     `/tmp/shmup-cup-land.lock` itself — never wrap it in another `flock`.
   - **After the push** the orchestrator removes the worktree and deletes the branch (for zone B:
     `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/fix-zone-b && git -C /home/sites/shmup-cup branch -D r5/fix-zone-b`).
2. **Benches run under the e2e lock**, one file at a time:
   `flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts <file>.perf.ts`
   (`<file>` is the bench your block names, e.g. `render`). A bench takes minutes: give the shell call a `timeout` of
   1800000 or run it in the background and poll its log (opencode's shell stops a foreground command after
   2 minutes). The whole `pnpm bench` (with the 30-minute soak) is wave 15's.
3. **A gate or budget changes only deliberately**, with the measured reason in the commit body and the docblock
   (`DRAW_CALL_BUDGET` 20, the heap gate, `DIST_BUDGET`, `APP_JS_GZIP_BUDGET` 512 KB). Never to get green.
4. **The beta tag** is a pre-release, and it is the wave's **last** action. The orchestrator creates it only when
   exit checks 1–4 all hold and every review of the wave is at zero (`R5-10.RV`, the subtask reviews,
   `W13.DOCS-RV`) — so the docs item, with `W13.DOCS-A`'s CHANGELOG line `2.0.0-beta.1`, is pushed. Then, from the
   main checkout `/home/sites/shmup-cup`:
   ```bash
   git -C /home/sites/shmup-cup fetch origin
   git -C /home/sites/shmup-cup rev-parse origin/master    # prints the full SHA of the tag commit
   gh release create v2.0.0-beta.1 --prerelease --target <the tag commit> --title "v2.0.0-beta.1" --notes …
   ```
   where `<the tag commit>` is the full SHA that the `rev-parse` line printed, and the notes say: all zones remastered
   with stand-in art; real art drops pending the owner; the full suite runs before `v2.0.0` (decision RUN-1). That
   commit holds all of R5-10, the fixes of every R5-10 review, the version line and its CHANGELOG line. Never tag
   R5-10.T9's own commit: `R5-10.RV`, the late subtask reviews' fixes and `W13.DOCS-A` push after it, so it lacks
   them. If one of wave 14's first LANDs reached `origin/master` before the tag, the tag holds it too; that is fine
   (the LAND ran its own checks) — never pick an older commit to leave it out. The tag is cut without the full suite —
   unless the driver's SCOPE ends the run here: then R6-03.D6's commands (wave 15) run first, once exit checks 1–4
   hold, and `<the tag commit>` is the full SHA of the commit their last green run checked (RUN-1; wave 15's
   `R6-03.D7` targets `v2.0.0` the same way). The owner's sign-off is welcome and never blocks.
5. **Late art drops (fillers).** An owner-ready `R5-0n.S3` (wave 12's template) may run as a filler (≤ 2, e2e pass
   permitting), never while `R6-01.B4` holds GLOBAL and never once `R6-03.D6` has started; R6-03.D3 / D4 wait for any
   drop the owner names for the release. The orchestrator pastes wave 12's *Rules for this wave* into the drop's
   prompt instead of this wave's (the drop needs wave 12's rules 3–6: the normal worktree and push protocol, one
   derived-file push at a time, the art snapshot, the winners folder).

## Subtasks

### R5-10.T4 — The boss rush with the new bosses

- **Wave / lane / order:** wave 13, lane 1.
- **Depends on:** all nine zone LANDs (R5-01.S7 … R5-09.S7) on `origin/master`.
- **Goal:** the boss rush fights the nine rebuilt bosses: its `rush` list (the bosses by id, `content/stages/boss-rush.stage.json:56`)
  in order, with delays retimed to the bigger fights; it clears in god mode within its budget.
- **Files (only these):** `content/stages/boss-rush.stage.json` (the `rush` list and its delays only);
  `test/playtest/boss-rush.test.ts`; the `PINNED` tables of `test/integration/presentation-fingerprint.test.ts`,
  `test/integration/content-db-fingerprint.test.ts` and `packages/shell/test/frame-fingerprint.test.ts`
  (FINGERPRINTS — regenerated by the push script in step 3, never edited by hand).
- **Steps:**
  1. Your own worktree from `origin/master` (common rule 1 — T4 is not a lane worktree), then
     `pnpm install --frozen-lockfile --prefer-offline && pnpm assets`.
  2. Edit; run the tests below; make **one** commit with explicit paths (sources only):
     `feat(R5-10): the boss rush fights the rebuilt bosses`, the body listing the new `rush` order and each delay
     (old → new); no Co-Authored-By line.
  3. Push under the land lock (README rule 6) as soon as the tests pass: write the script below to
     `/home/sites/shmup-cup-run/R5-10.T4-push.sh`, then run
     `flock -w 5400 /tmp/shmup-cup-land.lock bash /home/sites/shmup-cup-run/R5-10.T4-push.sh` from your worktree
     (several minutes: a shell timeout of 3600000, or the background with a log):
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
     `git show --stat HEAD` must list only your sources and the fingerprint files; anything else: stop and
     report. `R5-10.T4.RV` reviews the pushed commit; its fixes are new pushes (README's review loop), through the
     same script when they change what a fingerprint pins.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/boss-rush.test.ts
  ```
- **Acceptance:** the boss rush clears in god mode within `boss-rush.test.ts`' time budget; at most the presentation
  fingerprint's `extra.bossRush` segment and, of the content-DB fingerprint, only `core.stages` of `PINNED.shipped`
  move; the shell frame fingerprint unchanged; every golden verified unchanged (the boss rush has no golden). This
  narrow scope holds because T4 adds **no sprite name**: the `rush` list names bosses that their zones already use,
  so the sorted sprite-name table — and every sprite id — stays as it is (`wave-07.md`: a new sprite name shifts
  every later sprite id). If a fingerprint moves anywhere else, stop and report.
- **Token:** FINGERPRINTS (the land lock for the push).
- **Traps:** the `rush` list names enemy ids — never rename a boss; a boss that times out in the rush is retimed by
  its delay, never by editing its zone; never `golden:update`; never touch the stage's other fields (its parallax,
  backdrop or any sprite name) — a new sprite name would shift every later sprite id and move nearly every
  fingerprint segment.
- **Docs needs:** the new rush order and timings for `docs/dev/extra-modes-and-replays.md` and its client page.

### R5-10.T5 — The loops and the caravan follow the zones

- **Wave / lane / order:** wave 13, lane 2.
- **Depends on:** all nine zone LANDs.
- **Goal:** verify that every zone's loop remix (written by its `S5b`) spans the expanded stage, that loop 2 runs,
  and that the caravan (score attack) still works; fix only test pins that moved for a real reason.
- **Files (only these):** `test/integration/loops-runtime.test.ts` (only if a pin moved).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/loops-runtime.test.ts test/golden
  ```
- **Acceptance:** loops-runtime green; the goldens `zone-a-loop2-boss`, `zone-a-loop2-god` and `zone-a-caravan`
  verified unchanged. A remix that does not span its stage goes to the orchestrator as a zone fix (a LAND), never
  here. Likely a report-only subtask.
- **Token:** none.
- **Traps:** a moved golden here means a sim change somewhere — a bug, report it; never paste a failing run's
  output as the new expectation.
- **Docs needs:** none, unless the loops changed (then `extra-modes-and-replays.md`).

### R5-10.T7 — The render bench draws the real zones

- **Wave / lane / order:** wave 13, lane 3.
- **Depends on:** all nine zone LANDs.
- **Goal:** replace R3-04's "v2 zone stand-in" scenario of the headless render bench (and of the TV bench scene, if
  it names zone sprites) with the real remastered zones.
- **Files (only these):** `test/bench/render.perf.ts`, `test/bench/render-harness/load.ts`,
  `test/integration/render-bench.test.ts`, `test/integration/tv-render-bench.test.ts`, `apps/tizen/src/bench/scene.ts`
  (only if it names zone sprites).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/render-bench.test.ts test/integration/tv-render-bench.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/bench
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts render.perf.ts   # long: background + poll
  pnpm bench:tv   # only if scene.ts changed; build:bench runs check-bundle on dist-bench
  ```
- **Acceptance:** the scenario renders the real zones; the gates (`DRAW_CALL_BUDGET` 20, the heap gate) hold, or a
  gate changes deliberately with the measured reason; `pnpm bench:tv` still builds and `dist-bench/` passes
  `check-bundle` if `scene.ts` changed.
- **Token:** none.
- **Traps:** the render bench runs a Vite-built page in Playwright's Chromium — it takes the e2e lock; the TV bench's
  18-scenario matrix stays 18; Chromium 68 in `apps/tizen/src/bench`.
- **Docs needs:** the bench's real-zone figures for `docs/dev/render-performance-review.md`.

### R5-10.T9 — The `2.0.0-beta.1` version line

- **Wave / lane / order:** wave 13, lane 4; pushes last of R5-10's builders (rule 4: the tag does not target this
  commit).
- **Depends on:** R5-10.T4 and T7 on `origin/master`, T5 done (pushed or reported), and the wave-12 subtasks of
  R5-10.
- **Goal:** every workspace project at `2.0.0-beta.1`, mirroring what R2-04.REL did for `2.0.0-alpha.1`.
- **Files (only these):**
  - the 10 manifests: `package.json`, `packages/{audio-web,core,input-web,render-pixi,shell}/package.json`,
    `apps/{electron,tizen,web,webos}/package.json`;
  - `test/integration/tooling-config.test.ts` — `RELEASE` (`:323` on `bc8e05d`) and the prerelease check
    (`:328`, `['beta', 1]`);
  - `apps/tizen/test/config-xml/config-xml-consistency.test.ts` — the title text at `:32`;
  - `test/scripts/store-assets-edge.test.ts` — the comment at `:182`.
- **Tests (targeted):**
  ```bash
  pnpm install --frozen-lockfile --prefer-offline     # no lockfile change: no lockfile line holds the workspace version
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tooling-config.test.ts test/scripts/store-assets-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/config-xml
  pnpm --filter @shmup/tizen build && pnpm --filter @shmup/webos build
  git diff --exit-code pnpm-lock.yaml     # no output, exit 0: the lockfile is unchanged
  ```
- **Acceptance:** every manifest says `2.0.0-beta.1`; the TV manifests stay `2.0.0` (the Tizen `config.xml`, the
  webOS `appinfo.json` take numbers only); `pnpm-lock.yaml` unchanged; the tests green.
- **Token:** none (it is the only lane editing the manifests in this wave).
- **Traps:** the CHANGELOG's version line and the docs that quote the version are the docs agents'
  (`W13.DOCS-A`: `CHANGELOG.md`, `README.md`; `W13.DOCS-C`: `CLAUDE.md` and the other docs; `W13.DOCS-B`:
  `docs/client/install-on-tv.md`), never this lane's — `tooling-config.test.ts` checks that the first CHANGELOG
  section stays `[Unreleased] — v2`; never touch `.github/workflows/ci.yml`, `turbo.json` or the lockfile.
- **Docs needs:** the version line for `CHANGELOG.md`, `README.md`, `CLAUDE.md` (its version sentence) and every doc
  that quotes `2.0.0-alpha.1` (`W13.DOCS-A`, `W13.DOCS-B`, `W13.DOCS-C`).

### R6-01.B1 — The balance report harness

- **Wave / lane / order:** wave 13, lane 5, first (a filler from wave 12 when a slot was free).
- **Depends on:** all nine zone LANDs.
- **Goal:** a bench (not part of `pnpm test`) that plays every campaign route × both ships × the four presets
  **without** god mode and records, per zone: the score curve, deaths, extends earned, rank, boss fight times.
  Deterministic.
- **Files (only these):** `test/bench/balance.perf.ts` (**new**).
- **Steps:**
  1. Read `test/playtest/campaign.ts` (`walkCampaignRoutes`, `playRunZone`) and `test/playtest/campaign-routes.ts`;
     use them **read-only** (BOT token: never edit them). If they cannot run without god mode or lack a hook you
     need, stop and report.
  2. One `it` per preset × ship (8 cases), each with its own timeout above the bench config's 300 s default.
  3. Gate the whole suite with `describe.runIf(process.env.SHMUP_BALANCE === '1')`: `test/bench/vitest.config.ts`
     includes every `*.perf.ts`, and CI's Benchmark job and R6-03.D6 run the whole `pnpm bench` — without the
     variable the balance suite must skip.
  4. Write the table as JSON and Markdown to a temp dir given by `SHMUP_BALANCE_OUT` (default `os.tmpdir()`), never
     to a fixed repository path.
- **Tests (targeted):** the two `SHMUP_BALANCE=1` runs write to two different folders, so the second does not
  overwrite the first; then `diff -r` compares them.
  ```bash
  mkdir -p /home/sites/shmup-cup-run/R6-01.B1-run1 /home/sites/shmup-cup-run/R6-01.B1-run2
  SHMUP_BALANCE=1 SHMUP_BALANCE_OUT=/home/sites/shmup-cup-run/R6-01.B1-run1 flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts balance.perf.ts   # long: background + poll
  SHMUP_BALANCE=1 SHMUP_BALANCE_OUT=/home/sites/shmup-cup-run/R6-01.B1-run2 flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts balance.perf.ts   # long: background + poll
  diff -r /home/sites/shmup-cup-run/R6-01.B1-run1 /home/sites/shmup-cup-run/R6-01.B1-run2   # no output: identical
  pnpm exec vitest run --config test/bench/vitest.config.ts balance.perf.ts   # without the variable: skipped in seconds
  pnpm typecheck:root
  pnpm exec eslint test/bench/balance.perf.ts && pnpm exec prettier --check test/bench/balance.perf.ts
  ```
- **Acceptance:** two runs with `SHMUP_BALANCE=1` give byte-identical tables (the `diff -r` above prints nothing);
  without the variable,
  `pnpm exec vitest run --config test/bench/vitest.config.ts balance.perf.ts` reports the suite skipped in seconds, so
  `pnpm bench` and CI's Benchmark job skip it; the bench is excluded from `pnpm test` (it lives in `test/bench/`); no
  shared harness file changed.
- **Token:** none.
- **Traps:** the run is long (16 routes × 2 ships × 4 presets, 5 zones each): run it in the background and poll; the
  sim is deterministic — any difference between two runs is a bug; no `Math.random` / `Date.now` in what feeds the
  sim.
- **Docs needs:** how to run it, for `docs/dev/difficulty-and-rank.md`.

### R6-01.B2 — The balance report

- **Wave / lane / order:** wave 13, lane 5, after R6-01.B1.
- **Depends on:** R6-01.B1 on `origin/master`.
- **Goal:** run B1, read the table, and write the findings with **proposed numbers**: the extends (today 20,000 /
  every 70,000, re-derived from v2 run scores), the milking cap (`repeatKills` / `repeatPercent`), the rank growth
  per preset, per-zone point values where the expanded levels changed the score curve, the caravan clock (decision
  R6-D1: keep 3 min unless the numbers say otherwise), the boss-rush delays.
- **Files:** none in the repository. Write the report to `/home/sites/shmup-cup-run/R6-01.B2-balance-report.md`
  (common rule 7: a builder never edits `docs/**`; `R6-01.B2.DOCS` commits it after the review). Its sections, in
  this order and with exactly these headings: `## Zone A` … `## Zone I` (one per zone: enemy and boss scores,
  density, the zone's point values — wave 14's B3a … B3i each read their own), `## Global` (the presets: lives,
  extends, rank base and growth, continues, death penalty, bullet speed; the scoring rules and the milking cap; the
  rank curve — wave 14's B4) and `## Extra modes` (the caravan clock, the boss-rush delays — wave 14's B5).
- **Tests:** run B1's bench once, writing its table to a fixed folder of the run directory, so `R6-01.B2.RV` can read
  the same table without re-running the bench (under the e2e lock; long: background + poll):
  ```bash
  mkdir -p /home/sites/shmup-cup-run/R6-01.B2-table
  SHMUP_BALANCE=1 SHMUP_BALANCE_OUT=/home/sites/shmup-cup-run/R6-01.B2-table flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts balance.perf.ts
  ```
- **Acceptance:** every proposal cites the row of the table in `/home/sites/shmup-cup-run/R6-01.B2-table/` it comes
  from; a title line, then the eleven sections above; no proposal outside them.
- **Token:** none (nothing committed).
- **Traps:** propose, never apply: content and rules change in wave 14; the owner reads the report with his play
  sessions (Manual) and may override any number.
- **Owner (Manual):** read the report; play sessions on the M7; send any override before wave 14 starts (never
  blocks: without notes, wave 14 applies the proposals).

### R6-01.B2.DOCS — Commit the balance report

- **Wave / lane / order:** wave 13, lane 5, after R6-01.B2.RV is at zero. A docs agent. Part of the wave's code
  exit (wave 14 reads the committed file), not of the docs item.
- **Depends on:** R6-01.B2.RV at zero.
- **Goal:** copy `/home/sites/shmup-cup-run/R6-01.B2-balance-report.md` verbatim to `docs/v2-run/balance-report.md`
  and push it (common rule 5; commit subject `docs: commit the R6-01 balance report`, no Co-Authored-By line).
- **Files (only these):** `docs/v2-run/balance-report.md` (**new**).
- **Tests:**
  ```bash
  cmp /home/sites/shmup-cup-run/R6-01.B2-balance-report.md docs/v2-run/balance-report.md   # no output: identical
  grep -n '^## ' docs/v2-run/balance-report.md   # ## Zone A … ## Zone I, ## Global, ## Extra modes
  ```
- **Acceptance:** the committed file equals the reviewed report byte for byte; pushed.
- **Token:** none (a new file of the run folder).
- **Traps:** never edit a number or a heading: a wrong proposal goes back to `R6-01.B2` and a new review loop.

### R6-02.P1 — The headless re-measure with the final content

- **Wave / lane / order:** wave 13, lane 6.
- **Depends on:** R5-10.T7 on `origin/master` (`render.perf.ts` changed there).
- **Goal:** measure the remastered game headless: the stress bench, the per-zone stress bench, the render bench;
  the per-zone memory estimate (`estimateStageMemory`) table; both TV bundles' sizes and budgets.
- **Files:** none, unless a gate must change deliberately: then `test/bench/{stress,zones,render}.perf.ts` (gates
  only) or `apps/tizen/scripts/check-bundle.mjs` (a budget only), each with the measured reason.
- **Tests (targeted):**
  ```bash
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts stress.perf.ts
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts zones.perf.ts
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts render.perf.ts
  SHMUP_STANDIN_PRINT=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/standin-budget.test.ts
  pnpm --filter @shmup/tizen build && pnpm --filter @shmup/webos build
  ```
- **Acceptance:** every number in the report (ms per tick, heap, render ms, draw calls, render-target bytes, per-zone
  textures + images against `TEXTURE_BUDGET_BYTES` 23 MiB, `app.js` gzip against 512 KB, `dist/` against
  `DIST_BUDGET`); a missed budget goes to the orchestrator as a fixer, never a budget raise.
- **Token:** none.
- **Traps:** the soak (`soak.perf.ts`, 30 min) is wave 15's; `standin-budget.test.ts` measures R3-04's stand-in
  table — if it does not cover the real zones, report the gap, do not rewrite it here.
- **Docs needs:** the numbers for `docs/dev/render-performance-review.md` and `docs/dev/platform-polish.md`.
  Wave 15's `W15.DOCS-C` also puts them beside the TV numbers in `docs/dev/input-probe-results.md` §12's subsection
  "v2 on the TV (R6-02)" (§12 itself is plan R0-03's "Resolution benchmark"; the subsection holds R6-02.P3's tables
  and verdicts).

### R6-02.P2 — The owner's capture kit

- **Wave / lane / order:** wave 13, lane 7.
- **Depends on:** all nine zone LANDs.
- **Goal:** build what the owner needs on the TV and write the step-by-step checklist: the guided render capture
  (M3-02f's telemetry, `docs/client/debug-tools.md`, `docs/dev/debug-and-replays.md`) on both M7s, and the R0 TV bench
  for comparison.
- **Files:** none committed (the checklist goes into the report; `W13.DOCS-B` writes it into
  `docs/client/install-on-tv.md`).
- **Tests (builds only):**
  ```bash
  pnpm --filter @shmup/tizen build:dev
  pnpm bench:tv
  ```
- **Acceptance:** both builds succeed and pass their bundle checks; the checklist names every command, the log
  server (`npm run log-server` in `tools/input-probe/`), where the logs land, and what to send back:
  - **Where the logs land:** `tools/input-probe/logs/` on the machine that runs the log server
    (`tools/input-probe/server/log-server.mjs`, `LOG_DIR`'s default) — a git-ignored folder. The owner copies the
    `rp-….jsonl` sessions (the guided capture) to `tools/input-probe/results/<date>-m7/` and the `rb-….jsonl`
    sessions (the R0 bench) to `tools/input-probe/results/<date>-m7-bench/` (`<date>` = the capture date as
    `YYYY-MM-DD`; both monitors in one folder, as in `results/2026-09-15-m7/`), then commits them or sends them to
    the orchestrator (plan R0-03).
  - **Both builds report to the log server:** the owner rebuilds the debug build **and** the bench with the log
    server's address — `VITE_REPORT_URL=http://<log server>:8787 pnpm --filter @shmup/tizen build:dev` and
    `VITE_REPORT_URL=http://<log server>:8787 pnpm bench:tv`, where `<log server>` is the address
    `npm run log-server` prints (on Windows: `set VITE_REPORT_URL=…` first, as in `docs/client/debug-tools.md`
    § The guided capture (preferred)) — because the guided capture and the bench report nothing in a build without
    it (`docs/dev/debug-and-replays.md`, `__SHMUP_REPORT_URL__`; plan R0-03 step 2).
  - **The bench runs twice on each M7:** once with WebGL 1 (the shipped default) and once with WebGL 2
    (`localStorage['shmup-cup:gl']`, plan R0-03 step 3) — the pair is what decides R6-02.P4d (wave 15).
- **Token:** none.
- **Traps:** **never** package, sign, install or run anything on a TV (`bench:tv:package`, `bench:tv:install`,
  `sdb`, the Tizen CLI are the owner's); no `VITE_REPORT_URL` secret in a committed file.
- **Owner (Manual):** run the kit on both M7s; send the logs (needed by R0-03.A1 and R6-02.P3, wave 15).

## Reviews

- `R5-10.T4.RV`, `R5-10.T5.RV` (if it committed), `R5-10.T7.RV`, `R5-10.T9.RV`: read the diff, re-run the block's
  tests, check its acceptance and traps.
- `R5-10.RV` — the R5-10 step review over T1 … T9: the boss rush, loops, bonus stages, escape, dimension, ranges,
  linked pages and the version line hold together; `test/golden` verified; the derived files match their reasons.
- `R6-01.B1.RV` (determinism of the harness, the `SHMUP_BALANCE` gate, no shared file edited), `R6-01.B2.RV` (reads
  `/home/sites/shmup-cup-run/R6-01.B2-balance-report.md` and the table in `/home/sites/shmup-cup-run/R6-01.B2-table/`:
  every proposal traceable to a row of that table, the eleven headings), `R6-01.B2.DOCS.RV` (re-runs the block's
  `cmp` and `grep` lines: the committed file equals the reviewed report byte for byte, the eleven headings),
  `R6-02.P1.RV` (only if a gate or budget changed: the reason is measured).
- A zone fix's `<id>.RV` (rule 1), if a zone fix runs: on its branch, between its two turns — the branch diff, turn
  1's tests, only the zone's own files changed, no derived file on the branch.
- Every loop: a new reviewer each round, until zero findings, nits included.

## Docs item

### W13.DOCS-A — The plan, the changelog and the beta.1 lines

- **Depends on:** R5-10.T9 on `origin/master` and `R5-10.RV` at zero.
- **Goal:** R5-10's As built (T1 … T9) and Manual list; §17 R5-10 → `done (owner parts pending)` and R6-01, R6-02 →
  `in progress`; CHANGELOG `[Unreleased] — v2`: the version line `2.0.0-beta.1` and the R5-10 entries; `README.md`'s
  version line; delete the helper `docs/v2-run/helpers/r5r6/carrier.py` (R5 is done) and its row in
  `docs/v2-run/helpers/README.md` (the main table's `r5r6/carrier.py` row and the "Where they came from" table's
  `r5r6/…` row); push; then report: the orchestrator runs the board sync.
- **Files (only these):** `plan_resolution.md` (R5-10, §17), `CHANGELOG.md`, `README.md` (the version line and the
  milestone sentence only), `docs/v2-run/helpers/r5r6/carrier.py` (deleted with `git rm`),
  `docs/v2-run/helpers/README.md` (those rows only).
- **Tests:** the docs tests that read these files — `CHANGELOG.md` (`tooling-config.test.ts`: the first-section
  rule; `render-telemetry-pipeline.test.ts`: every "same statistic" claim next to "bench" keeps "not a comparable"
  within 400 characters, and nothing says "comparable to the bench") and `README.md` (`e2e-docs.test.ts`: the
  Playwright install line, `--project=chromium`, Firefox; `tooling-config.test.ts`: the Node 24.15+ floor):
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tooling-config.test.ts test/integration/e2e-docs.test.ts test/integration/render-telemetry-pipeline.test.ts
  ```
  After the push, report: the orchestrator runs the board sync (`python3 .claude/plan_board_v2.py` in its main
  checkout — docs agents never run it).
- **Token:** PLAN.
- **Traps:** the CHANGELOG's first section stays `## [Unreleased] — v2` (`tooling-config.test.ts`); keep §17's
  three-column rows; T7's real-zone bench entries never call the headless numbers comparable to the TV's — a "same
  statistic" sentence next to "bench" also says "not a comparable" (`render-telemetry-pipeline.test.ts`).

### W13.DOCS-B — The extra modes, the bench, the bestiary, the capture checklist

- **Depends on:** R5-10.T4, T7, T9 and R6-01.B1 on `origin/master`, T5 done (pushed or reported); the reports of
  R6-02.P1 (and `R6-02.P1.RV` at zero if P1 changed a gate or a budget) and R6-02.P2
  (`/home/sites/shmup-cup-run/R6-02.P1-report.md`, `/home/sites/shmup-cup-run/R6-02.P2-report.md`).
- **Files (only these):** `docs/dev/extra-modes-and-replays.md` and `docs/client/extra-modes-and-replays.md` (the
  boss rush, the loops, the caravan), `docs/dev/render-performance-review.md` (the bench's real zones, P1's headless
  numbers), `docs/client/bestiary.md` (the section "Bosses you only meet in EXTRA"), `docs/client/install-on-tv.md`
  (R6-02.P2's checklist and its version line: `2.0.0-beta.1`), `docs/dev/difficulty-and-rank.md` (how to run
  `balance.perf.ts`, with `SHMUP_BALANCE=1`).
- **Tests:** none.

### W13.DOCS-C — The version lines

- **Depends on:** R5-10.T9 on `origin/master`.
- **Goal:** every sentence that states the version `master` has now says `2.0.0-beta.1` (R5-10.T9's docs need).
  Find them with
  `git grep -ln "2\.0\.0-alpha" -- '*.md' ':!docs/v2-run/**' ':!plan_resolution.md' ':!prompt_resolution.md' ':!CHANGELOG.md'`.
  History lines stay (for example "since R0-01 `2.0.0` for `2.0.0-alpha.0`", or a row about an earlier build); the
  TV manifests stay `2.0.0` (a sentence that says so stays). `README.md` is `W13.DOCS-A`'s and
  `docs/client/install-on-tv.md` `W13.DOCS-B`'s.
- **Files (only these; the current-version sentences only):** `CLAUDE.md` (the version sentence),
  `apps/tizen/README.md`, `docs/README.md`, `docs/client/README.md`, `docs/client/debug-tools.md`,
  `docs/client/desktop-app.md`, `docs/client/preview-build.md`, `docs/client/release-candidate.md`,
  `docs/dev/README.md`, `docs/dev/build-test-deploy.md`, `docs/dev/platform-polish.md`,
  `docs/dev/release-hardening.md`.
- **Tests:** the search again, with `-n` instead of `-ln` so that it prints each remaining line, not only the file
  names — every line it still prints is a history line (list them in the report):
  `git grep -n "2\.0\.0-alpha" -- '*.md' ':!docs/v2-run/**' ':!plan_resolution.md' ':!prompt_resolution.md' ':!CHANGELOG.md'`.
  Then the docs tests that read these files — `docs/dev/build-test-deploy.md` (`e2e-docs.test.ts`) and
  `docs/client/debug-tools.md` (`render-telemetry-pipeline.test.ts`: every "same statistic" claim next to "bench"
  keeps "not a comparable" within 400 characters):
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/e2e-docs.test.ts test/integration/render-telemetry-pipeline.test.ts
  ```
- **Token:** none.

### W13.DOCS-RV — Review of the docs item

- The loop to zero, as in every wave.

## Exit check

1. `origin/master` holds R5-10.T4, T5 (if any), T7, T9 and R6-01.B1 and R6-01.B2.DOCS;
   `docs/v2-run/balance-report.md` exists; R6-02.P1 and R6-02.P2 reported (P1's numbers and P2's checklist in
   `/home/sites/shmup-cup-run/R6-02.P1-report.md` and `/home/sites/shmup-cup-run/R6-02.P2-report.md`; `R6-02.P1.RV`
   at zero if P1 changed a gate or a budget).
2. `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/playtest/boss-rush.test.ts test/integration/loops-runtime.test.ts test/integration/render-bench.test.ts test/integration/tv-render-bench.test.ts test/integration/tooling-config.test.ts test/integration/content-db-fingerprint.test.ts test/integration/presentation-fingerprint.test.ts`
   and `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/config-xml`
   and `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts`.
3. `pnpm content:check`; `pnpm --filter @shmup/tizen build`.
4. The docs review at zero; §17 set by `W13.DOCS-A`; the board synced by the orchestrator after that push.
5. **Last**, once items 1–4 hold: the orchestrator tags `v2.0.0-beta.1` (pre-release, rule 4: `--target` is the full
   SHA that `git -C /home/sites/shmup-cup rev-parse origin/master` prints after a fetch at that moment — never
   R5-10.T9's own commit). A CI look at most.
6. **Deferred to wave 15:** R5-10.T10 (the milestone's full suite: `pnpm format:check && pnpm lint && pnpm typecheck
   && pnpm test && pnpm build`, `pnpm test:e2e` with Firefox, the whole `pnpm bench`, `docs:images --check`,
   `store:assets --check`, the input probe) — it runs once, as R6-03.D6 (unless the driver's SCOPE ends the run
   here: then R6-03.D6's commands run before the tag, RUN-1 and rule 4).

## Owner (Manual) — never blocks this wave

- Sign off the beta (optional); play sessions over the new zones (feeds R6-01).
- Run the capture kit on both M7s and send the logs (R0-03.A1 and R6-02.P3, wave 15; they are also R0-03's TV bench run).
- Read the balance report; send overrides before wave 14 (optional).
