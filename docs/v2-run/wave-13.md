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
| 3 bench | `R5-10.T7` | `test/bench/render.perf.ts`, `render-harness/load.ts`, `render-harness/gates.ts` (a gate only), `render-bench` tests, `apps/tizen/src/bench/scene.ts` | none | bench (lock) |
| 4 version | `R5-10.T9` | the 10 `package.json`, three version pins | none | none |
| 5 balance | `R6-01.B1 → R6-01.B2 → R6-01.B2.DOCS` | `test/bench/balance.perf.ts` (new); the report in the run directory (B2); `docs/v2-run/balance-report.md` (new, B2.DOCS) | none | bench (lock) |
| 6 re-measure | `R6-02.P1` (after R5-10.T7) | the bench gates and `check-bundle.mjs` **only with reasons** | none | bench (lock) |
| 7 capture kit | `R6-02.P2` | none committed (builds + a checklist in the report) | none | none |

- **Order rules:** `R6-02.P1` waits for `R5-10.T7` (P1 measures T7's real-zone render bench in
  `test/bench/render.perf.ts`, and both may change a render gate in `test/bench/render-harness/gates.ts`).
  `R6-01.B2` waits for `R5-10.T4` too (it proposes the boss-rush delays from T4's retimed values). `R5-10.T9`
  starts once its *Depends on* holds (T4 and T7 on `origin/master`, T5 done), so it pushes last of R5-10's builders
  (T1 … T8). The step review `R5-10.RV`, late subtask-review fixes and the docs item push after T9, so the beta tag
  is the wave's last action and targets `origin/master` once they are all on it (rule 4), never T9's own commit.
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
   like a zone lane: the orchestrator pastes wave 11's *Rules for this wave*, rules 3–14 (the zone template, the v2
   numbers, the frozen entries, the shared files, content-only bosses, the fixed bot, derived files red on the
   branch, generators, budgets, AI art, the cross-zone checks, long commands), into the fix's prompts after this
   wave's rules; wave 11's rules 1–2 do not apply (the worktree, turns and LAND below replace them). Rule 13's
   timeout fix uses wave 11's `R5-0n.TO` block with the next free id of the zone (`R5-02.TO2` if `R5-02.TO` exists),
   as the bullet "A timeout fix" below says:
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
       checks and, where the zone has them, its runtime and Direct tests. Leave out S6's e2e line: this wave runs
       no zone spec except a late art drop's own (rule 5), and R6-03.D6's full Chromium run (wave 15) covers the
       zone's spec. A golden, a demo or a fingerprint's `PINNED` comparison that the fix moves stays red until the
       LAND (the LAND re-records the scope and re-pins): list each in the report, never fix it on the branch.
     - **The review:** the orchestrator starts `<id>.RV` on the branch. It reads
       `git -C /home/sites/shmup-cup-run/wt/fix-zone-<x> diff origin/master...r5/fix-zone-<x>`, re-runs turn 1's
       tests **inside** `/home/sites/shmup-cup-run/wt/fix-zone-<x>` (skip the WORKTREE block's first three lines, as
       turn 1 does; `git branch --show-current` must print `r5/fix-zone-<x>`; never rebase or commit there — a fresh
       worktree of `origin/master` would test master, not the fix), and checks that only the zone's own files
       changed, that no frozen entry (wave 11 rule 5) was edited and that no derived file is on the branch. A finding
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
   - **A timeout fix** (wave 11 rule 13 and its `R5-0n.TO` block, which name the zone's S6): in this wave the S6 is
     the zone fix's turn 1 or its `<id>.RV` re-run of turn 1's tests.
     - A turn 1 whose only red test failed only on its Vitest timeout (rule 13) still makes its one commit on the
       branch, then reports the file, the test's title and its measured duration.
     - A TO fix of `test/playtest/boss-rush.test.ts` waits until `R5-10.T4` is on `origin/master` with
       `R5-10.T4.RV` at zero (T4 and its fixers own that file in this wave; wave 11 rule 13's "`R5-10.T4`
       (wave 13) is too late" does not apply here). A TO fix of a `campaign-routes-*.test.ts` file starts at once.
     - The TO block's "new S6 agent" (rule 13's "a new S6 agent re-runs your S6") is a **new turn 1**: once the TO
       fix is on `origin/master` and `R5-0n.TO.RV` is at zero, the orchestrator starts a new agent with the fix's
       prompt and this line at its top: "You are turn 1 again: your edit is already committed on the branch and a
       timeout fix is on `origin/master` — run the start lines (their rebase brings the timeout fix onto the
       branch), then turn 1's tests; make no edit and no new commit; report."
     - Only when those tests are green does `<id>.RV` start (a new round, if one had already run). A test red for
       any other reason goes to an `<id>.FIXn`, like a review finding.
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
   exit checks 1–4 all hold (no zone fix still open), and every review of the wave is at zero (`R5-10.RV`, the
   subtask reviews, `W13.DOCS-RV`) — so the docs item, with `W13.DOCS-A`'s CHANGELOG line `2.0.0-beta.1`, is
   pushed. The tag commit is the full SHA of `origin/master` at that moment: it holds all of R5-10, the fixes of
   every R5-10 review, the version line and its CHANGELOG line — **not** R5-10.T9's own commit, which `R5-10.RV`,
   the late subtask reviews' fixes and `W13.DOCS-A` follow. Three steps, in this order; never run step 3 before
   step 2 has passed on the SHA that step 1 wrote:
   1. **Write the SHA** (in the main checkout):
      ```bash
      git -C /home/sites/shmup-cup fetch origin && git -C /home/sites/shmup-cup rev-parse origin/master > /home/sites/shmup-cup-run/w13-tag.txt
      ```
   2. **Re-run exit checks 2 and 3 on that SHA** (RUN-1). The docs item pushes after the code exit, so
      `origin/master` has moved since those checks ran. A fresh tester agent runs them, as for the code exit, in a
      worktree made from that SHA instead of `origin/master`: in its WORKTREE block the `worktree add` line becomes
      the line below (`<name>` is the tester's name), and the block's `cd`, `pnpm install` and `pnpm assets` lines
      stay as written. The tester reports `git rev-parse HEAD` in that worktree, which must equal the SHA in
      `w13-tag.txt`.
      ```bash
      git -C /home/sites/shmup-cup worktree add /home/sites/shmup-wt/<name> "$(cat /home/sites/shmup-cup-run/w13-tag.txt)" --detach
      ```
      A failure gets a fixer as at any exit; after its push, go back to step 1 (write `w13-tag.txt` again) and run
      step 2 again.
   3. **Only when both checks passed on that SHA**, tag it (in the main checkout):
      ```bash
      cd /home/sites/shmup-cup && gh release create v2.0.0-beta.1 --prerelease --target "$(cat /home/sites/shmup-cup-run/w13-tag.txt)" --title "v2.0.0-beta.1" --notes "Shmup Cup v2: all zones remastered with stand-in art; real art drops pending the owner. A pre-release: the full suite runs before v2.0.0."
      ```

   If one of wave 14's first LANDs reached `origin/master` before step 1, the tag holds it too; that is fine (step
   2 checks it) — never pick an older commit to leave it out. The tag is cut without the full suite — unless the
   driver's SCOPE ends the run here: then R6-03.D6's commands (wave 15) run first, once exit checks 1–4 hold, and
   the tag targets the full SHA of the commit their last green run checked (write it to `w13-tag.txt` instead of
   step 1's `rev-parse` output; that green run replaces step 2; RUN-1, as wave 15's `R6-03.D7` targets `v2.0.0`).
   The owner's sign-off is welcome and never blocks.
5. **Late art drops (fillers).** An owner-ready `R5-0n.S3` (wave 12's template) may run as a filler (≤ 2; its zone
   spec is one of the wave's two e2e agents, README common rule 4 — the benches under the lock do not count), never
   while `R6-01.B4` holds GLOBAL and never once `R6-03.D6` has started; R6-03.D3 / D4 wait for any drop the owner
   names for the release. The orchestrator pastes wave 12's *Rules for this wave* into the drop's prompt instead of
   this wave's (the drop needs wave 12's rules 3–6: the normal worktree and push protocol, one derived-file push at
   a time, the art snapshot, the winners folder).

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
     If the push is rejected, run the script again (at most 5 times, then report). If the script stops on a rebase
     conflict in one of the three fingerprint files (a re-run's commit already holds their regenerated `PINNED`
     tables, and a push that moved master in between may have re-pinned them too), take master's file and let the
     script re-pin it — never merge it by hand:
     `git checkout origin/master -- <that file> && git add <that file> && GIT_EDITOR=true git rebase --continue`
     (`<that file>` is the conflicted fingerprint file's path, as `git status` prints it), then run the flock line
     again. (During a rebase `--ours` / `--theirs` are swapped, so name `origin/master`.) A conflict in any other
     file is real: `git rebase --abort`, stop and report. After the push,
     `git show --stat HEAD` must list only your sources and the fingerprint files; anything else: stop and
     report. `R5-10.T4.RV` reviews the pushed commit; its fixes are new pushes (README's review loop), through the
     same script when they change what a fingerprint pins.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/boss-rush.test.ts
  ```
- **Acceptance:** the boss rush clears in god mode within the test's Vitest timeout (`60_000` in
  `test/playtest/boss-rush.test.ts` on `7d54b04`, or what a wave-11 `R5-0n.TO` raised it to) and the harness's tick
  cap (`DEFAULT_MAX_TICKS` in `test/playtest/harness.ts`). Longer delays may raise a test's Vitest timeout in
  `boss-rush.test.ts` once, with the measured duration (run the file with `--reporter=verbose`: Vitest prints it
  after the test's title) in the commit body; never the tick cap (`harness.ts` is BOT) — a run that hits the cap:
  stop and report. At most the presentation fingerprint's `extra.bossRush` segment and, of the content-DB
  fingerprint, only `core.stages` of `PINNED.shipped` move; the shell frame fingerprint unchanged; every golden
  verified unchanged (the boss rush has no golden). This narrow scope holds because T4 adds **no sprite name**: the
  `rush` list names bosses that their zones already use, so the sorted sprite-name table — and every sprite id —
  stays as it is (`wave-07.md`: a new sprite name shifts every later sprite id). If a fingerprint moves anywhere
  else, stop and report.
- **Token:** FINGERPRINTS (the land lock for the push).
- **Traps:** the `rush` list names enemy ids — never rename a boss; a boss that times out in the rush is retimed by
  its delay, never by editing its zone — a fix that needs the zone changed: report it, the orchestrator spawns a
  zone fix (rule 1); never `golden:update`; never touch the stage's other fields (its parallax, backdrop or any
  sprite name) — a new sprite name would shift every later sprite id and move nearly every fingerprint segment.
- **Docs needs:** the new rush order and timings for `docs/dev/extra-modes-and-replays.md` and its client page.

### R5-10.T5 — The loops and the caravan follow the zones

- **Wave / lane / order:** wave 13, lane 2.
- **Depends on:** all nine zone LANDs.
- **Goal:** verify that every zone's loop remix (written by its `S5b`) spans the expanded stage, that loop 2 runs,
  and that the caravan (score attack) still works; fix only test pins that moved for a real reason.
- **Files (only these):** `test/integration/loops-runtime.test.ts` (only if a pin moved).
- **Tests (targeted):** the Vitest line, then a read-only span check run from your worktree's root
  (`loops-runtime.test.ts` checks that each remix event lies inside its stage, never that the remix spans it):
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/loops-runtime.test.ts test/golden
  node -e 'for (const z of "abcdefghi") { const s = require("./content/stages/zone-" + z + ".stage.json"); const x = s.remix.map((e) => e.x); const cp = Math.max(...s.checkpoints.map((c) => c.x)); console.log(z, s.length, x.length, Math.min(...x), Math.max(...x), cp, Math.min(...x) < s.length / 4 && Math.max(...x) > cp ? "spans" : "DOES NOT SPAN"); }'
  ```
  Each line it prints: the zone, its `length`, the number of remix events, the first and last remix `x`, the last
  checkpoint's `x`, then `spans` or `DOES NOT SPAN`.
- **Acceptance:** loops-runtime green; the goldens `zone-a-loop2-boss`, `zone-a-loop2-god` and `zone-a-caravan`
  verified unchanged; every zone prints `spans` — its first remix event lies before `length / 4` and its last after
  the zone's last checkpoint (the v1 remixes on `7d54b04` all do, e.g. zone A 220 … 7480 of 9000 with its last
  checkpoint at 6000). A `DOES NOT SPAN` line goes to the orchestrator as a zone fix (rule 1, a LAND), never here;
  put the printed lines in the report. Likely a report-only subtask.
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
  `test/bench/render-harness/gates.ts` (a gate only, rule 3: the render bench's gates `DRAW_CALL_BUDGET`,
  `RENDER_P95_BUDGET_MS` and `HEAP_BUDGET` live there, not in `render.perf.ts`),
  `test/integration/render-bench.test.ts`, `test/integration/tv-render-bench.test.ts`, `apps/tizen/src/bench/scene.ts`
  (only if it names zone sprites).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/render-bench.test.ts test/integration/tv-render-bench.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/render-groups.test.ts   # only if gates.ts changed: it pins that file's DRAW_CALL_BUDGET and docblock
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
- **Traps:** the run is long (per ship × preset `walkCampaignRoutes` plays up to 31 zone runs for the 16 routes,
  zone A once — at most 248 in all): run it in the background and poll. Without god mode a route stops at its first
  zone that does not clear (`test/playtest/campaign.ts`: no fork after a game over), so a zone that no route of a
  ship × preset reaches gets no row: leave it missing in the table — never an invented number — and name each such
  gap (ship, preset, zone) in your report. The sim is deterministic — any difference between two runs is a bug; no
  `Math.random` / `Date.now` in what feeds the sim.
- **Docs needs:** how to run it, for `docs/dev/difficulty-and-rank.md`; a row for `test/README.md` (it has one row
  per bench file) and the bench list in `docs/dev/repo-layout.md`'s `test/` entry.

### R6-01.B2 — The balance report

- **Wave / lane / order:** wave 13, lane 5, after R6-01.B1.
- **Depends on:** R6-01.B1 (with `R6-01.B1.RV` at zero) and R5-10.T4 (with `R5-10.T4.RV` at zero) on
  `origin/master` — the boss-rush delays are proposed from T4's retimed values, old → new.
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
- **Files:** none, unless a gate must change deliberately: then `test/bench/{stress,zones}.perf.ts` or
  `test/bench/render-harness/gates.ts` (gates only; a `gates.ts` change also runs
  `test/integration/render-groups.test.ts`, below) or `apps/tizen/scripts/check-bundle.mjs` (a budget only), each
  with the measured reason.
- **Tests (targeted):**
  ```bash
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts stress.perf.ts
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts zones.perf.ts
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts render.perf.ts
  SHMUP_STANDIN_PRINT=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/standin-budget.test.ts
  pnpm --filter @shmup/tizen build && pnpm --filter @shmup/webos build
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/render-groups.test.ts   # only if gates.ts changed
  ```
- **Acceptance:** every number in the report (ms per tick, heap, render ms, draw calls, render-target bytes, per-zone
  textures + images against `TEXTURE_BUDGET_BYTES` 23 MiB, `app.js` gzip against 512 KB, `dist/` against
  `DIST_BUDGET`); a missed budget goes to the orchestrator as a fixer, never a budget raise.
- **Token:** none.
- **Traps:** the soak (`soak.perf.ts`, 30 min) is wave 15's; `standin-budget.test.ts` measures R3-04's stand-in
  table — if it does not cover the real zones, report the gap, do not rewrite it here.
- **Docs needs:** the headless numbers for `docs/dev/render-performance-review.md` (`W13.DOCS-B`) and the per-zone
  memory estimates for `docs/dev/platform-polish.md` § Memory budget (`W13.DOCS-C`), both read from
  `/home/sites/shmup-cup-run/R6-02.P1-report.md`. Wave 15's `W15.DOCS-C` also puts them beside the TV numbers in
  `docs/dev/input-probe-results.md` §12's subsection "v2 on the TV (R6-02)" (§12 itself is plan R0-03's
  "Resolution benchmark"; the subsection holds R6-02.P3's tables and verdicts).

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
- `R5-10.RV` — the R5-10 step review over T1 … T9 and every zone fix of this wave (rule 1): the boss rush, loops,
  bonus stages, escape, dimension, ranges, linked pages and the version line hold together; `test/golden` verified;
  the derived files match their reasons.
- `R6-01.B1.RV` (determinism of the harness, the `SHMUP_BALANCE` gate, no shared file edited), `R6-01.B2.RV` (reads
  `/home/sites/shmup-cup-run/R6-01.B2-balance-report.md` and the table in `/home/sites/shmup-cup-run/R6-01.B2-table/`:
  every proposal traceable to a row of that table, the eleven headings), `R6-01.B2.DOCS.RV` (re-runs the block's
  `cmp` and `grep` lines: the committed file equals the reviewed report byte for byte, the eleven headings),
  `R6-02.P1.RV` (only if a gate or budget changed: the reason is measured).
- A zone fix's `<id>.RV` (rule 1), if a zone fix runs: on its branch, between its two turns — the branch diff, turn
  1's tests re-run **inside** the lane worktree `/home/sites/shmup-cup-run/wt/fix-zone-<x>` (never a fresh worktree
  of `origin/master`), only the zone's own files changed, no frozen entry edited, no derived file on the branch.
- Every loop: a new reviewer each round, until zero findings, nits included.

## Docs item

### W13.DOCS-A — The plan, the changelog and the beta.1 lines

- **Depends on:** R5-10.T9 on `origin/master`, `R5-10.RV` at zero, and every zone fix (rule 1) LANDed.
- **Goal:** R5-10's As built (T1 … T9) and Manual list; §17 R5-10 → `done (owner parts pending)` and R6-01, R6-02 →
  `in progress`; CHANGELOG `[Unreleased] — v2`: the version line `2.0.0-beta.1` and the R5-10 entries (and one entry
  per zone fix); if a zone fix ran, one line in that zone step's As built (`R5-0n`: what the fix changed and why);
  `README.md`'s version line; delete the helper `docs/v2-run/helpers/r5r6/carrier.py` (R5 is done) and its row in
  `docs/v2-run/helpers/README.md` (the main table's `r5r6/carrier.py` row and the "Where they came from" table's
  `r5r6/…` row); push; then report: the orchestrator runs the board sync.
- **Files (only these):** `plan_resolution.md` (R5-10, §17, and a zone fix's As built line), `CHANGELOG.md`,
  `README.md` (the version line and the milestone sentence only), `docs/v2-run/helpers/r5r6/carrier.py` (deleted
  with `git rm`), `docs/v2-run/helpers/README.md` (those rows only).
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

- **Depends on:** R5-10.T4, T7, T9 and R6-01.B1 on `origin/master`, T5 done (pushed or reported), every zone fix
  (rule 1) LANDed; the reports of R6-02.P1 (and `R6-02.P1.RV` at zero if P1 changed a gate or a budget) and
  R6-02.P2 (`/home/sites/shmup-cup-run/R6-02.P1-report.md`, `/home/sites/shmup-cup-run/R6-02.P2-report.md`).
- **Goal:** the docs needs of R5-10.T4, T5 (only if it names one) and T7, of R6-01.B1, of R6-02.P1 (its headless
  numbers; its memory sentence is `W13.DOCS-C`'s) and R6-02.P2, and of a zone fix if one ran, in the files below:
  the install-on-tv checklist from `/home/sites/shmup-cup-run/R6-02.P2-report.md`, the headless numbers from
  `/home/sites/shmup-cup-run/R6-02.P1-report.md`, and the two install-on-tv version lines; push (common rule 5); then
  report.
- **Files (only these):**
  - `docs/dev/extra-modes-and-replays.md` and `docs/client/extra-modes-and-replays.md` (the boss rush, the loops, the
    caravan);
  - `docs/dev/render-performance-review.md` (the bench's real zones, P1's headless numbers);
  - `docs/client/bestiary.md` (the section "Bosses you only meet in EXTRA");
  - `docs/client/install-on-tv.md`: R6-02.P2's checklist and the page's two current-version lines — in the "Which
    game you build" bullet `version 2.0.0-alpha.…` → `version 2.0.0-beta.1` (and drop "which still plays like the
    released game …" if it is still there: the zones are remastered now), and in "Going back from v2 to v1"
    "A build of `master` is v2's 2.0.0 alpha" → "… v2's 2.0.0 beta" (no hyphen there, so a `2\.0\.0-alpha`
    search misses it);
  - `docs/dev/difficulty-and-rank.md` (how to run `balance.perf.ts`, with `SHMUP_BALANCE=1`);
  - `test/README.md` and `docs/dev/repo-layout.md` (the `balance.perf.ts` row / mention only: `test/README.md` has a
    row per bench file, `repo-layout.md`'s `test/` entry lists the benches);
  - only if a zone fix ran: that zone's doc (`docs/dev/zone-a-and-playtest.md`, `zones-b-and-c.md`,
    `zones-d-and-e.md`, `zones-f-and-g.md` or `zones-h-and-i.md`) — the lines the fix's docs needs name.
- **Tests:** `docs/dev/repo-layout.md` is read by `e2e-docs.test.ts` (its `pnpm test:e2e` command line names
  Firefox); no test reads the other files:
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/e2e-docs.test.ts
  ```
- **Token:** none (no other docs agent of this wave holds these files).

### W13.DOCS-C — The version lines

- **Depends on:** R5-10.T9 on `origin/master`; for `platform-polish.md`'s memory figures also R6-02.P1's report
  (`/home/sites/shmup-cup-run/R6-02.P1-report.md`, and `R6-02.P1.RV` at zero if P1 changed a gate or a budget).
- **Goal:** every sentence that states the version `master` has now says `2.0.0-beta.1` (R5-10.T9's docs need).
  Find them with (`README.md` is `W13.DOCS-A`'s and `docs/client/install-on-tv.md` `W13.DOCS-B`'s, so the search
  leaves them out)
  `git grep -ln "2\.0\.0-alpha" -- '*.md' ':!docs/v2-run/**' ':!plan_resolution.md' ':!prompt_resolution.md' ':!CHANGELOG.md' ':!README.md' ':!docs/client/install-on-tv.md'`.
  History lines stay (for example "since R0-01 `2.0.0` for `2.0.0-alpha.0`", or a row about an earlier build); the
  TV manifests stay `2.0.0` (a sentence that says so stays). Also R6-02.P1's docs need: in `platform-polish.md`
  § Memory budget, the sentence that gives every campaign zone's estimate (on `7d54b04`: "Today every campaign zone
  passes: A–G ≈ 64.7 MiB, …") takes P1's per-zone `estimateStageMemory` figures at 640×360.
- **Files (only these; the current-version sentences only, and that one memory sentence):** `CLAUDE.md` (the
  version sentence), `apps/tizen/README.md`, `docs/README.md`, `docs/client/README.md`, `docs/client/debug-tools.md`,
  `docs/client/desktop-app.md`, `docs/client/preview-build.md`, `docs/client/release-candidate.md`,
  `docs/dev/README.md`, `docs/dev/build-test-deploy.md`, `docs/dev/platform-polish.md` (its version sentence and
  the memory sentence above), `docs/dev/release-hardening.md`.
- **Tests:** the search again, with `-n` instead of `-ln` so that it prints each remaining line, not only the file
  names — every line it still prints is a history line (list them in the report):
  `git grep -n "2\.0\.0-alpha" -- '*.md' ':!docs/v2-run/**' ':!plan_resolution.md' ':!prompt_resolution.md' ':!CHANGELOG.md' ':!README.md' ':!docs/client/install-on-tv.md'`.
  Then the docs tests that read these files — `docs/dev/build-test-deploy.md` (`e2e-docs.test.ts`) and
  `docs/client/debug-tools.md` (`render-telemetry-pipeline.test.ts`: every "same statistic" claim next to "bench"
  keeps "not a comparable" within 400 characters):
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/e2e-docs.test.ts test/integration/render-telemetry-pipeline.test.ts
  ```
- **Token:** none.

### W13.DOCS-RV — Review of the docs item

- The loop to zero, as in every wave. Once `W13.DOCS-A`, `W13.DOCS-B` and `W13.DOCS-C` have all pushed, it runs the
  full search, with `README.md` and `docs/client/install-on-tv.md` included:
  ```bash
  git grep -n "2\.0\.0-alpha" -- '*.md' ':!docs/v2-run/**' ':!plan_resolution.md' ':!prompt_resolution.md' ':!CHANGELOG.md'
  git grep -n "2\.0\.0 alpha" -- docs/client/install-on-tv.md
  ```
  The first must list only history lines (a line about an earlier build, never the current version); the second
  prints nothing.

## Exit check

1. `origin/master` holds R5-10.T4, T5 (if any), T7, T9 and R6-01.B1 and R6-01.B2.DOCS;
   `docs/v2-run/balance-report.md` exists; R6-02.P1 and R6-02.P2 reported (P1's numbers and P2's checklist in
   `/home/sites/shmup-cup-run/R6-02.P1-report.md` and `/home/sites/shmup-cup-run/R6-02.P2-report.md`; `R6-02.P1.RV`
   at zero if P1 changed a gate or a budget); every zone fix the wave spawned (`R5-0n.ZFIXn`, rule 1) LANDed, and
   its worktree and branch removed.
2. `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/playtest/boss-rush.test.ts test/integration/loops-runtime.test.ts test/integration/render-bench.test.ts test/integration/tv-render-bench.test.ts test/integration/tooling-config.test.ts test/integration/content-db-fingerprint.test.ts test/integration/presentation-fingerprint.test.ts`
   and `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/config-xml`
   and `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts`.
3. `pnpm content:check`; `pnpm --filter @shmup/tizen build`.
4. The docs review at zero; §17 set by `W13.DOCS-A`; the board synced by the orchestrator after that push.
5. **Last**, once items 1–4 hold and every review is at zero: the orchestrator tags `v2.0.0-beta.1` (pre-release,
   rule 4's three steps: `--target` is the SHA in `/home/sites/shmup-cup-run/w13-tag.txt` — `origin/master` at that
   moment, with exit checks 2 and 3 run again on it — never R5-10.T9's own commit). A CI look at most.
6. **Deferred to wave 15:** R5-10.T10 (the milestone's full suite: `pnpm format:check && pnpm lint && pnpm typecheck
   && pnpm test && pnpm build`, `pnpm test:e2e` with Firefox, the whole `pnpm bench`, `docs:images --check`,
   `store:assets --check`, the input probe) — it runs once, as R6-03.D6 (unless the driver's SCOPE ends the run
   here: then R6-03.D6's commands run before the tag, RUN-1 and rule 4).

## Owner (Manual) — never blocks this wave

- Sign off the beta (optional); play sessions over the new zones (feeds R6-01).
- Run the capture kit on both M7s and send the logs (R0-03.A1 and R6-02.P3, wave 15; they are also R0-03's TV bench run).
- Read the balance report; send overrides before wave 14 (optional).
