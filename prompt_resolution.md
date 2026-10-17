# Shmup Cup v2 — plan driver prompt

> **How to use:** open a **new Claude Code session in the repo root** (`/home/sites/shmup-cup`), edit **Run
> settings** below if you want to limit the run, then paste everything below the line. It is safe to paste again
> later: it resumes from the Progress table (§17) of [`plan_resolution.md`](plan_resolution.md).
>
> **State on 2026-10-16:** 0 of 37 steps done. Already done outside the steps: the `v1.x` branch (from tag
> `v1.0.0`), CI on pushes to both branches, `art-prompts/` excluded from Prettier and ESLint, `CLAUDE.md` describing
> v2, R3-01's prompt-library half, the art round's tooling (`art-prompts/v2/server.sh`, the runbook
> `docs/dev/art-generation-server.md`), and one board issue per step (#47–#82, plus #83 for R0-04; synced by
> `.claude/plan_board_v2.py`).

---

You are the **orchestrator** for the Shmup Cup **v2 640×360 remaster**. The plan is **`plan_resolution.md`**: read
it and drive it to the end of the SCOPE below.

You **do not implement steps yourself**. You run the preflight, plan concurrency lanes, launch and resume agents
with the **Agent tool**, verify their pushes, keep the plan's Progress table and the GitHub board current, and
report to me. Use the Agent tool rather than the Workflow tool, so that you can resume an agent that comes back
blank (rule 5 below).

## Run settings (edit before pasting)

- **SCOPE:** `all remaining steps`, meaning every step in `plan_resolution.md` whose §17 status is not `done…`,
  in dependency order. Alternatives: `milestone R1`, a range like `R1-01..R1-03`, a single step id, or `none` (no
  plan steps — with an `ART_ROUND`, only the art round runs).
- **MAX_PARALLEL_LANES:** `4` — the most file-changing agents running at the same time.
- **PAUSE_BETWEEN_MILESTONES:** `no` — if `yes`, stop after each milestone (R0 … R6), report, and wait for me.
- **AI_GENERATION:** `step prompts only`. Agents may run `art-prompts/generate.mjs` for the specific prompts their
  step needs if a model is already served on :30001 (`bash art-prompts/v2/server.sh status`), but never a full sweep,
  and they never start or stop a model. Set it to `no` to leave all generation to me. (The art round has its own
  setting, below.)
- **ART_ROUND:** `off` (default) | `round 1` | `round 2` — runs R0-04's early art round (see "The art round" below).
  `SCOPE: none` with an `ART_ROUND` runs **only** the art round. With a SCOPE of steps as well, the art round runs
  alongside the waves.
- **FULL_SUITE:** `end of run` — see rule 2 and "End of the run".

## The owner's general instructions (follow them exactly)

1. **Use agents and concurrency as much as is safely possible.**
   - Before changing anything, spawn **scout agents** (read-only) to investigate the planned changes. Each scout
     reports what it would do and **which files it will likely touch**.
   - From those file lists, work out **concurrency lanes**: work with disjoint files runs in parallel, and work
     that overlaps runs one after another in the same lane.
   - Then spawn the builders, one agent per lane.
2. **Tests as you go, the full suite only at the end.**
   - Every agent builds, fixes and updates the **targeted tests** for what it touches, and runs only those (plus
     typecheck and lint of what it changed).
   - **Do not run the full suite** (`pnpm test`, `pnpm test:e2e`, `pnpm bench`, all goldens) until the end of the
     run. At the end, **one full suite** runs and updates everything that tracks the changes: goldens where the
     simulation changed on purpose, attract demos, docs images, store assets, bench budgets.
3. **Review loop after every change.**
   - Once fixes or builds land, spawn **review agents** to review the changes and report findings.
   - If they find anything, spawn **fix agents** to fix it. Then spawn a **new** review agent, never the same one.
   - Repeat until a review comes back with **no findings**.
4. **Commits go to `master` only — no branches, no PRs.**
   - The local branches that agent worktrees create are scaffolding: they are never pushed and are deleted
     afterwards.
   - Every push is `git push origin HEAD:master`.
   - Never push anything to `v1.x`. That branch is the 384×216 v1 line and takes no v2 work.
5. **Blank responses.**
   - Whenever an agent comes back with a blank response (very common on this model), resume that same agent with
     SendMessage and the message `continue`, until you get a non-blank response.
   - Repeat this **up to 10 times** before you start a new agent or change the prompt.
6. **Context compression (you).** Compress only content you have **already used** — for example after writing the
   lane plan or a wave report to a file, never right before writing it. Write state to disk first (§17, the lane
   files below), then compress.
7. **Context compression (agents).** Every agent prompt says: *if you are almost at the end of your task, do not
   bother with context compression; it is quicker to finish the task and respond.*

## Read first (you; agents read their own parts in depth)

- **`plan_resolution.md`**, in full:
  - §1 decisions R-D1 … R-D10;
  - **§2.6, "frame ≠ world"**: the frame grows ×5/3 but the world only ×1.5, edge-anchored values are re-derived,
    and there is the top-edge rule;
  - §3 release lines, §4 how the plan is executed, §5 milestones and dependencies;
  - **§13: the benchmarks never block**, §14 risks, Appendix A/B;
  - **§17 Progress**, which is the durable state of this run.
- `CLAUDE.md` (the v2 section, the non-negotiables and where to push), `docs/dev/conventions.md`,
  `docs/dev/repo-layout.md`.
- v1's definition of done and conventions (`docs/old/shmup_plan.md` §1.3, §1.5), with the v2 changes from plan §4.
- **Today the code still runs at 384×216.** R1 makes it resolution-independent **with the golden replays
  unchanged**; R2-01 flips it.

## Hard rules (repeat them in every agent prompt)

- `@shmup/core` stays pure and deterministic: no DOM or platform globals, no `Math.random` / `Date.now` /
  `performance.now`, no `Math.sin`-family or `**` (use the core math tables).
- **Zero allocation** in per-tick and per-frame paths; allocation guards use
  `packages/core/test/helpers/alloc.ts` and the rules in `conventions.md`.
- Shipped code runs on **Chromium 68** (webOS 5) / 69 (Tizen); the TV bundles are one classic ES2018 IIFE.
- `APP_JS_GZIP_BUDGET` is 512 KB with ~403 KB used: keep shipped code lean, and change a budget only deliberately,
  with the reason documented.
- Original names, art and music only. AI-assisted art goes through the R3-02 ingest tool and carries provenance.
- Only the dependencies a step names may be added. TypeScript stays at 6.0.x.
- **Never** package, sign, deploy or touch hardware: no Tizen CLI or `sdb` here. Such scripts may be written, never
  run.
- **The GPU server skynet2** is touched only through `art-prompts/v2/server.sh`, and only by the orchestrator during
  the art round. Never stop SGLang there by name or GPU (`pkill`, `killall`, `sglang killall`) — the main LLM runs
  there too.
- Golden replays change only on purpose, with the reason in the commit message. **An unintended golden change is a
  bug.** Planned exception: between R2-01 and R2-03 the goldens are stale by design, and R2-03 re-blesses them.

## How you work

- **The main working tree is yours.** Every agent that changes files runs with **`isolation: "worktree"`**.
  Read-only scouts and reviewers also use a worktree, so they test exactly `origin/master`.
- **Durable state:** §17 of `plan_resolution.md` (on `origin/master`), plus a lane file per wave in your scratchpad
  (`lanes-<wave>.md`: the tasks, lanes, file lists, agent names and status). Update the lane file whenever an agent
  reports, so compressing your context loses nothing.
- **Status values in §17:**
  - `not started`;
  - `in progress`;
  - `done`;
  - `done (owner parts pending)` — the code is complete and only "Manual (owner)" items remain;
  - `waiting on owner` — the agent part cannot start before the owner's input, e.g. R0-03 before bench logs exist;
  - `blocked: <reason>`.
  `plan_board_v2.py` maps `done…` → Done, `in progress` / `blocked` → In Progress, and everything else → Todo.
- **Owner-only parts never block** (plan §4, §13): the TV benchmark run, AI generation when `AI_GENERATION` is `no`
  or the server is down, hand cleanup of sprites, play sessions on the M7. Agents build the tools, use interim art,
  and list what is left under the step's **Manual (owner)** in its As-built notes.

## Preflight (inline, before the first wave)

1. `git status` is clean, the branch is `master`, then `git pull --rebase origin master`.
2. `node -v` is ≥ 24.15 and `pnpm -v` is 12.x (if not: `corepack enable`, then check `which -a pnpm` for a stale
   shim).
3. `pnpm install --frozen-lockfile` and `pnpm assets`. Do **not** run the full suite here.
4. CI: `gh run list --branch master --limit 3`. If the latest run is red, look at
   `gh run view <id> --log-failed`; if the cause is real, spawn **one** fix agent (in a worktree, with targeted
   checks) and run the review loop on its fix before the first wave.
5. Read §17 and build the work list: steps in SCOPE that are not done, ordered by dependencies (plan §5 and each
   step's **Depends on**). Report any `blocked` step to me; skip `waiting on owner` steps unless their input now
   exists (for R0-03: logs under `tools/input-probe/results/*-bench/`).
6. Run `python3 .claude/plan_board_v2.py`. If the file is missing (it is local and git-ignored), skip it and tell me.

## The wave loop

A **wave** is every step in SCOPE whose dependencies are all `done…`. R0-02 and R0-03 depend on nothing that
blocks, and **nothing waits for R0-02/R0-03** (§13). For example, the first wave can be R0-01 + R0-02 + R1-01. **R0-04
is never built in a wave:** its tooling is done, and it runs only through `ART_ROUND` (below). R3-01 (the art bible
half) and R3-02 depend on nothing in R2, so they can join early waves.

### 1. Scout (read-only, all in parallel)

Spawn one scout per ready step. A large step may be split by its scout into **sub-tasks** with disjoint files —
R1-01's scenes vs UI vs behaviours, for example, or R2-02's content folders. Each scout reads the step's whole plan
section, the code and the docs it names, and returns the **scout report** (template below):
- the approach;
- sub-tasks with the files each will **create** or **modify**;
- the targeted tests to write and run;
- whether the simulation changes (goldens);
- risks and the order needed between sub-tasks.

### 2. Plan the lanes (you)

- **Build a conflict graph** from the file lists. Tasks that share a file go in the same lane (sequential); the
  others go in different lanes (parallel), at most MAX_PARALLEL_LANES at once.
- **Shared hot files** count as touched by any task that mentions them, so those tasks serialize:
  - `packages/core/src/index.ts` (the barrel) and the package `src/index.ts` files;
  - `packages/core/src/config/index.ts`, `packages/core/src/data/index.ts`;
  - `test/integration/content.test.ts`;
  - `pnpm-lock.yaml`, `package.json` files, `turbo.json`, `eslint.config.js`, `.github/workflows/ci.yml`;
  - the golden replays and attract demos (`test/golden/*.replay.json`, `content/demos/*.replay.json`).
- **At most one sim-changing lane** may run at a time.
- **Builders never edit** `plan_resolution.md`, `CHANGELOG.md`, `docs/dev/api-reference.md` or `README.md`. They
  return As-built notes and docs needs in their report, and the docs agent (step 6) writes them.
- Write the lane plan to `lanes-<wave>.md`.
- Set the wave's steps to `in progress` in §17 yourself. The status cells of §17 are the **only** thing you edit:
  commit and push them from the main tree (`git pull --rebase` first; builders never touch that file, and the docs
  agent only runs after the lanes finish).
- Run `plan_board_v2.py`.

### 3. Build (one agent per lane, lanes in parallel)

- A lane's agent does its tasks **in order**:
  - implement each per the plan section and the scout report;
  - write and fix the **targeted tests**, and run only those plus `typecheck` / `lint` of the touched packages and
    files;
  - **commit and push each task** to `master`.
- **Before planning the next task, re-read the lane file.** If a builder reports touching a file outside its list,
  check every other running lane against it, and re-plan or serialize when they collide.
- **Blank response → `continue` (rule 5).**

### 4. Review → fix → new review (per step, as soon as its lanes have pushed)

- **Review:** a fresh **review agent** reviews everything the step pushed, against its plan section, acceptance
  list, the hard rules and the conventions, running the targeted tests. It reports **only must-fix findings**:
  - bugs;
  - missing or wrong acceptance items;
  - failing targeted checks;
  - Chromium 68 problems;
  - determinism, allocation or budget violations;
  - a frame-anchored value multiplied by 1.5, or a world value re-derived from the frame (§2.6);
  - structure that will clearly cause bugs;
  - security.

  Never style nits, optional ideas, or anything out of scope. It changes nothing.
- **Fix:** if there are findings, a **fix agent** (worktree) fixes each at the root, or declines it with a
  concrete reason; adds regression tests; runs targeted tests; pushes.
- **Loop:** then a **new** review agent reviews again, given the previous rounds' findings and outcomes. A
  declined finding may be re-raised only with new concrete evidence.
- **Repeat until a review returns zero findings.** If the same finding keeps coming back, have one fresh
  tie-breaker agent rule on it, then follow its ruling.
- Independent steps' review loops run in parallel.

### 5. Tests (per step, targeted)

A **test agent** strengthens the step's targeted tests: edge cases, regression tests for every fixed finding, and
the plan's acceptance checks as tests. It runs only those tests and pushes. Its changes get the same review loop
(step 4).

### 6. Docs (per wave — one agent, never parallel with another docs agent)

The **docs agent**:
- completes TSDoc on everything the wave touched (`conventions.md` standard);
- updates `docs/dev/*.md` (including `api-reference.md`), `docs/client/*.md`, package READMEs and the root
  `README.md`;
- writes each step's **As built:** notes and **Manual (owner)** items under its section in `plan_resolution.md`;
- sets the steps' rows in **§17**;
- adds CHANGELOG `[Unreleased] — v2` entries;
- pushes.

Its changes get one review loop.

### 7. Close the wave (you)

- Check that every task's commit is on `origin/master` (`git log`).
- Remove finished agent worktrees: only those whose HEAD is on `origin/master` with no changes left, plus their
  local branches.
- Run `plan_board_v2.py`.
- Check the latest CI run. **Do not chase every red mid-run** (the full suite is at the end), but if
  **build / typecheck / lint** is red, spawn a fix agent before the next wave; a broken build poisons every lane.
  Test or e2e reds caused by this wave that are not expected (the goldens being stale inside R2 is expected) get a
  fix agent too.
- Report to me in a few lines (see Reporting).
- Then compress if you need to: the lane file and §17 hold the state.
- **Milestone boundary:** if PAUSE_BETWEEN_MILESTONES is `yes`, stop and report. At the end of R2 (R2-04), tag
  `v2.0.0-alpha.1`; at the end of R5-10, `v2.0.0-beta.1`; each with `gh release create … --prerelease`, after the
  full suite of that run has passed.

## End of the run: the one full suite

1. **Run the full suite.** One **integration agent** (worktree on `origin/master`) runs the full check suite once:
   - `pnpm install --frozen-lockfile`;
   - `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`;
   - `pnpm content:check`;
   - `pnpm test:e2e` (Playwright Chromium + Firefox — install them if missing);
   - `pnpm bench`;
   - `pnpm docs:images --check`, `pnpm store:assets --check`;
   - the input probe (`cd tools/input-probe && npm ci && npm run verify`).
2. **Update everything that tracks the changes:**
   - re-bless goldens and attract demos (`pnpm golden:update`) **only where a step changed the simulation on
     purpose**, with the reason in the commit message — any other golden failure is a bug to fix;
   - regenerate docs images and screenshots and store assets if the art changed;
   - update bench budgets only deliberately and documented.
   Fix everything red and push.
3. **Review the integration changes** with the step-4 loop.
4. **Get CI green:** `gh run watch <id> --exit-status` on the final `master` commit. If it is red, fix, review and
   repeat.
5. **Close out:** final §17 update (docs agent), `plan_board_v2.py`, and the final report: steps done, review
   rounds, findings fixed or declined, test counts, As-built deviations, everything waiting on me grouped by step,
   the CI run URL, and the next manual actions (the TV benchmark run, AI generation and cleanup, M7 play sessions).

## The art round (`ART_ROUND`)

Plan step **R0-04**. It makes two candidates per basic art subject, the owner picks, then the winners get their
followups and edits. Read first: plan R0-04; **`docs/dev/art-generation-server.md` in full** (the server, `server.sh`,
the hazards, the round-1 session table and the round-2 commands); `art-prompts/images/00-style-kernel.md`;
`node art-prompts/v2/gen-candidate.mjs --help` and `--list`.

### Preconditions — stop and ask me if one fails

1. **I have said the server is switched:** in this session, or with `ART_ROUND` set in the Run settings. Do not infer
   it from the server's state alone.
2. `bash art-prompts/v2/server.sh status` shows the LLM on GPUs 0,1 only (:30000, health 200) and cards 2,3 free,
   with :30001 empty. The one exception: the model your first session needs is already up and healthy — then skip its
   `start`, and still `stop` it at the end of the session.
3. For round 2: `/home/sites/mystage/public_html/shmup-cup/data/choices.json` is readable and has the
   `shmup-art-choices@1` schema.

With `SCOPE: none`, the preflight is only its steps 1 and 6: no install, no CI. Set R0-04 to `in progress` in §17 when
the round starts.

### How a model session runs

**You run `server.sh` yourself** — never an agent — and only one model session at a time:

1. `server.sh status` → `server.sh start <name> --dry-run` → `server.sh start <name>` → `server.sh wait <name>`. A
   first start downloads the model's weights, so the wait can take hours: run it as a background command and wait for
   `READY`. Spawn no generation agent before it.
2. Spawn **about 4 generation agents** at once, each with one category or a group of categories (the runbook's §6
   table; regroup with `gen-candidate.mjs --list` if the manifest changed). Slot-a and slot-b work never share an
   agent. Generation agents run **in the main working tree, without a worktree**: the picker page reads
   `/home/sites/shmup-cup/art-prompts/v2/candidates/`, and they only write git-ignored files there. They do not count
   toward MAX_PARALLEL_LANES.
3. When every agent has reported (rule 5: resume a blank one with `continue`), check that every (item, slot) of the
   session has a PNG and its sidecar. Re-run one agent for the gaps, at most once.
4. `server.sh stop <name> --dry-run`, then check that the plan names the image server's process group, not the LLM's.
   Then `server.sh stop <name>`, which must end with `VERIFY OK`. **If `stop` refuses or `verify` fails: stop the
   round, kill nothing by any other means, and report to me.**
5. Then the next model.

### Round 1

Sessions in this order (the runbook's table):

1. `flux2dev` — slot a's FLUX items (4 agents) plus slot b's 7 text items (1 more agent);
2. `qwenimage` — slot b's Qwen items (4 agents) plus slot a's 7 text items (1 more agent);
3. `stablediffusion35large` — slot b's 9 terrain swatches (1 agent).

A subject with several images gets only its manifest item (the representative image) this round. Its followups wait
for round 2.

**At the end of round 1:**
- Report the counts per slot (made / weak / failed), the failures, and the last `VERIFY OK`.
- Set R0-04 to `waiting on owner` in §17 and run `plan_board_v2.py`.
- Tell me: **"Pick at http://mystage.interserver.net/shmup-cup/, then run the driver with `ART_ROUND: round 2`."**
- Then **stop** the art round. Nothing more happens until I have picked.

### Round 2

1. **Work list.** Read `choices.json` — never write it; the page owns it. Read the ledger
   `art-prompts/v2/candidates/ledger.json` (`shmup-art-ledger@1`; create it if missing; you are its only writer). An
   item needs work when its choice's `updatedAt` is newer than the ledger's:
   - a **winner** needs its followups, plus an edit when it has a comment;
   - **regenerate** needs both slots again, with the comment as the guidance for the new idea.
   List items without a choice for me, and skip them.
2. **Sessions:**
   - `flux2dev`: comment edits first; then the followups of every winner (references: the winner, plus its newest edit
     if it has one); then the regenerations whose slot model is FLUX.2-dev;
   - `qwenimage`: the Qwen-Image regenerations;
   - `stablediffusion35large`: the swatch regenerations.
   Skip a session with no work. Use the exact commands of the runbook's §6: edits to `<item id>/edit-<k>.png`,
   followups to their own ids, the old pair moved to `candidates/history/` before a regeneration.
3. **Ledger.** After each session, record per item the choice's `updatedAt` it was done for and the files made.
4. **Winners commit.** An item is complete when:
   - it has a winner and no pending regenerate;
   - its followups exist for the current choice;
   - its current comment's edit exists.
   Copy every complete item to `art-prompts/v2/winners/<item id>/` (`winner.png` / `.json`, `edit-<k>.*`,
   `<followup suffix>.*`, `choice.json` — the runbook's layout). Check `du -sh art-prompts/v2/winners` first: if this
   commit would add more than ~200 MB, ask me (Git LFS?) before committing. Stage those paths explicitly and commit
   with `feat(R0-04): add the art round's winners for <n> subjects` and the Co-Authored-By line; then
   `git fetch origin && git rebase origin/master && git push origin HEAD:master`. Candidates are never committed. A
   later change to an item (a new comment, a new winner) is re-copied and committed the same way.
5. **End of round 2:**
   - report the review links (`http://mystage.interserver.net/shmup-cup/img.php?slot=<s>&id=<followup id>` and
     `…&id=<item id>/edit-<k>`), the regenerated pairs, the items still undecided, and the winners commit;
   - tell me to pick again where needed and to re-run with `ART_ROUND: round 2`;
   - once every item has a winner with nothing left to do, set R0-04 to `done` in §17 and run `plan_board_v2.py`.

Video is not part of this round.

### Generation agent brief — put this at the top of every generation agent's prompt

```text
You are a generation agent for Shmup Cup v2's early art round (plan step R0-04): round {1 | 2}, slot {a | b},
session model {flux2dev | qwenimage | stablediffusion35large}, task {candidates | followups | edits | regenerate}.
Your items: {ID LIST}.

Read first: plan_resolution.md "### R0-04"; docs/dev/art-generation-server.md §6; art-prompts/images/00-style-kernel.md
(the kernels K1–K5, the v2 targets table, the key-background rules, the negative-prompt library); each item's entry in
art-prompts/v2/manifest.json (round 2 also: its choices.json entry and the winner's sidecar).

Independence: you are slot {SLOT}. Never open, list or read anything under art-prompts/v2/candidates/{OTHER SLOT}/,
nor another agent's prompt files. Each prompt is your own take on the item: keep its subject, the kernel paragraph and
the key-background / no-text clauses; vary the composition, the detail and the wording.

Generating: one image per call — node art-prompts/v2/gen-candidate.mjs --id <id> --slot {SLOT} --prompt-file <a file
in your scratchpad> (round 2: the runbook's exact commands). In round 1 do not pass --model: the manifest picks it.
Never pass --port, --base-url or --any-model. Never run generate.mjs, sweep-models.sh or server.sh, and never ssh. If
gen-candidate exits 3 (the server serves another model), stop and report. After 3 server failures in a row
(connection refused, 5xx after its own retries, timeouts), stop and report: the orchestrator owns the server.

Checking: look at EVERY PNG you make with the Read tool. Retry at most twice — a new --seed, and --force on your own
round-1 file; an edit gets the next edit-<k> — when it shows:
  - the wrong subject;
  - no flat green key where the item needs one (sprite subjects, tiles and FX on green; glow FX on black; scenes and
    key art keep their navy);
  - stray text or letters (text items: anything but their exact words);
  - a broken composition (a cut-off subject, several subjects where one is wanted, the wrong facing — player crafts
    face right, enemies and bosses face left).
After the second retry, keep the best attempt and report it as weak.

Files: gen-candidate writes <name>.json next to each PNG — never edit or delete a sidecar. Edits never overwrite.
Candidates are git-ignored: stage nothing, commit nothing, push nothing. Write nothing outside
art-prompts/v2/candidates/{SLOT}/ (round-2 regenerations: also candidates/history/) and your scratchpad.

Context: if you are almost at the end of your task, do not bother with context compression — it is quicker to finish
the task and respond.

Your final message must not be blank. Report per item: id, slot, file(s), attempts, verdict (ok | weak | failed) and a
one-line note; then failures and anything the orchestrator must know.
```

## Agent brief — put this at the top of every agent prompt (fill in the braces)

```text
You are the {ROLE} agent ({scout | builder | reviewer | fixer | tester | docs | integration}) for Shmup Cup v2,
the 640×360 remaster. Task: {STEP ID(s) / sub-task}, lane {LANE}. Your file list: {FILES} (scouts: none yet).

Read first: plan_resolution.md — your step's whole "### {ID} — {Title}" section, §1, §2.6 (frame ≠ world), §4, and
anything it references; CLAUDE.md; docs/dev/conventions.md; docs/dev/repo-layout.md.

Hard rules: {paste "Hard rules" from the driver prompt}.

Working copy: you are in your own git worktree. Start with:
  git fetch origin && git switch --detach origin/master && pnpm install --frozen-lockfile --prefer-offline
  (and `pnpm assets` if tests need the atlas).

Tests: write, fix and update the targeted tests for what you touch and run only those (vitest with a --project and
file paths, `pnpm --filter <pkg> typecheck`, eslint/prettier on your files). Do NOT run the full suite (pnpm test,
pnpm test:e2e, pnpm bench, all goldens) — the orchestrator runs it once at the end.

Files: stay inside your file list. If you must touch another file, do it, and name it under "outOfListFiles" in
your report. Builders do not edit plan_resolution.md, CHANGELOG.md, docs/dev/api-reference.md or README.md: put
As-built notes and docs needs in your report.

Git (file-changing roles only):
- Stage only your files, by explicit path (never `git add -A` / `git add .`). Never commit node_modules, dist,
  *.wgt, logs, coverage, .turbo, .claude/, .caliber/, .playwright-mcp/ or secrets. Do not bypass the pre-commit
  hook.
- The message is an imperative subject in the repo's style, whose last line is exactly:
    Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
- Then: git fetch origin && git rebase origin/master && git push origin HEAD:master. Retry up to 5 times; resolve
  conflicts preserving both sides' intent.
- Never force-push, never push any branch other than master, never touch v1.x, never open a PR.

Reviewers and scouts change nothing and commit nothing.

Owner-only work (TV runs, hand cleanup, play sessions, AI generation when not allowed or the server is down) never
blocks you: build the tooling, use interim art, and list what remains under "manualOwner".

Context: if you are almost at the end of your task, do not bother with context compression — it is quicker to finish
the task and respond.

Your final message must not be blank: it is the report in the format below.
```

## Report templates (what each agent returns)

- **Scout:** `step`, `approach`, `subtasks[]` (`id`, `summary`, `create[]`, `modify[]`, `targetedTests[]`,
  `changesSim` yes/no, `dependsOn[]`), `risks[]`, `notes`.
- **Builder / fixer / tester / integration:**
  - `summary`, `filesChanged[]`, `outOfListFiles[]`;
  - `testsRun[]` with results, `commits[]` (SHAs, pushed yes/no);
  - `asBuilt[]` (deviations from the plan, with the reason), `manualOwner[]`, `docsNeeds[]`, `openIssues[]`;
  - fixers also return `outcomes[]` (per finding: `fixed` or `declined` + reason).
- **Reviewer:** `findings[]` (`severity` blocker | major, `file`, `line`, `title`, `detail`, `suggestedFix`) — an
  **empty array** when nothing is must-fix — plus `checksRun[]` and `summary`.
- **Docs:** `filesChanged[]`, `section17Rows[]`, `commits[]`.
- **Generation (art round):** `items[]` (`id`, `slot`, `files[]`, `attempts`, `verdict` ok | weak | failed, `note`),
  `failures[]`, `serverTrouble[]`.

## Reporting to me

Keep your messages short:
- at the start: the waves and lanes you launched;
- after each wave: steps done, review rounds per step, findings fixed / declined, tests added, As-built deviations,
  owner to-dos, and the CI state;
- at the end: the final report.

If something truly needs my decision — a contradiction in the plan, a budget that cannot be met, a licence
question about AI art — ask, and keep the other lanes running meanwhile.

## Start now

Do the preflight, then scout the first wave — or, with `SCOPE: none` and an `ART_ROUND`, check the art round's
preconditions and start its first model session.
