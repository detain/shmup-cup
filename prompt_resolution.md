# Shmup Cup v2 — plan driver prompt (opencode on myadmin1)

> **How to use:** log in to **myadmin1** (`ssh -i ~/.ssh/id_ed25519_new my@myadmin1`), then
> `cd /home/sites/shmup-cup && git pull --rebase origin master`, start **opencode** there (`opencode`, the default
> primary agent `build`), edit **Run settings** below if you want to limit the run, and paste everything below the
> line. It is safe to paste again later: it resumes from §17 of [`plan_resolution.md`](plan_resolution.md), the wave
> schedule in its §18 and the run notes in `.claude/orchestrator/myadmin1/`.
>
> **State on 2026-10-18:** 10 of 37 steps done — R0-01, R0-02, R3-01, R3-02, R3-05 and R1-01 … R1-05 (several with
> owner parts pending). **R2-01 is flipped on master** (`72b18a1`: 640×360, 12-px HUD bars and tiles, `ART_SCALE` 3/2,
> replay format 2, save format 3) and closing: its docs pass is this run's first wave. **R0-04** (the art round) is
> waiting on the owner. Wave 0 — the C5 review loop and the triage of the CI e2e shard-1 failures — was closed by the
> previous orchestrator before the hand-off (§18 records it). All remaining work is scheduled in **plan §18
> "Execution waves for the ~10-agent run"**, with the work orders in **`docs/v2-run/`** (index
> `docs/v2-run/README.md`, helper scripts in `docs/v2-run/helpers/`).
>
> **What exists on myadmin1:** the repo (everything the run needs is on `master`), plus what the previous orchestrator
> copied over: `.claude/` (`plan_board_v2.py`, `skills/`, its old notes — history only), the git-ignored art
> candidates `art-prompts/v2/candidates/` and a **snapshot** of the picker site with `data/choices.json`. Nothing else
> from the old host is here, and myadmin1 cannot ssh to it.

---

You are the **orchestrator** for the Shmup Cup **v2 640×360 remaster**, running in **opencode** on **myadmin1**. The
plan is **`plan_resolution.md`**; its **§18** is the wave schedule for this run and **`docs/v2-run/`** holds one work
order per wave (subtasks, exact files, exact tests, tokens, defaults). Drive it to the end of the SCOPE below.

You **do not implement steps yourself**. You run the preflight, plan concurrency lanes, start and resume agents with
opencode's **subagent tool** (see "opencode: how you run agents"), verify their pushes, keep the plan's Progress table
(§17) and the GitHub board current, and report to me. The agents run **Qwen 3.8 Flash**: a fast, weaker model. Give
each one a small task with exact files and exact test commands, and paste the work order's text instead of
paraphrasing it.

## Run settings (edit before pasting)

- **SCOPE:** `all remaining steps` — every step in `plan_resolution.md` whose §17 status is not `done…`, run **in the
  waves of §18**, each from its work order in `docs/v2-run/`. A new paste resumes at the first §18 wave that is not
  closed (check §17 and `.claude/orchestrator/myadmin1/RESUME.md`). Alternatives: `wave <id>` (one §18 wave),
  `milestone R2`, a range like `R2-02..R2-04`, a single step id, or `none`.
- **MAX_PARALLEL:** `10` — agents running at the same time, every role counted (about 8 builders + 2 reviewers or
  fixers; scouts count too).
- **MAX_E2E_AGENTS:** `2` — agents that run Playwright. They share one machine-wide lock; a third would only wait.
- **VITEST_MAX_WORKERS:** `6` per agent (myadmin1 has 64 cores and 251 GB of RAM).
- **E2E_WORKERS:** `2` inside the e2e lock — what the timed specs were measured with, and the default of
  `docs/v2-run/helpers/e2e-batch.sh`. A batch with no timed spec may use up to `6` on this host.
- **PAUSE:** `no` — `waves`: stop after each §18 wave, report, and wait for me; `milestones`: stop only after the
  last wave of each milestone (R2 … R6).
- **AI_GENERATION:** `no` — on myadmin1 no agent calls an image or video model (the GPU work is done; only the owner
  starts GPU sessions). Only I can change this.
- **ART_ROUND:** `off` — see "The art round (R0-04) on myadmin1".
- **FULL_SUITE:** `end of run` — see owner rule 2 and "End of the run".

## The owner's general instructions (follow them exactly, and pass them on to every agent)

The agent brief below passes all eight on to every agent. Rules 1, 3, 5 and 6 are yours to carry out; 2, 4, 7 and 8
bind every agent directly.

1. **Utilize agents and concurrency as much as possible, safely.**
   - Spawn agents to investigate the proposed fixes, come up with which files each will likely touch, and respond
     with it.
   - From those answers, figure out **concurrency lanes**: work with disjoint files runs in parallel, work that
     overlaps runs one after another in the same lane. Then spawn the builders, one agent per lane.
   - In this run the work orders already hold the re-plan scouts' file lists. A wave still starts with **re-check
     scouts** (wave loop, step 1), and any new work (a review finding, a red test) gets a scout before a builder.
2. **Tests as you go; the full suite only at the end.**
   - Update tests and make sure the targeted tests are built, fixed, updated and working as you go.
   - At the end of all the changes, **one full suite** runs and updates everything that tracks the changes (goldens,
     demos, fingerprints, docs images, store assets, bench budgets). Avoid the full suite until the end.
3. **Review loop.** After fixes, spawn agents to review the changes and report any findings. If they find anything,
   spawn an agent to fix them. After that, loop back and spawn a **NEW** review agent — never the same one — and repeat
   the loop until a review finds **no issues** (zero findings, nits included).
4. **Commits all go to `master` — no branches or PRs.**
5. **Blank responses.** Any time an agent comes back with a blank response (very common on this model), resume that
   same agent telling it `continue` until you get a non-blank response. Repeat this **up to 10 times** before you try
   starting a new agent or changing the prompt.
6. **Context compression (you).** When doing any type of context compression, only do it on content after you have
   used it — for example after writing a plan file, not right before. Write the state to disk first (§17 and the run
   notes in `.claude/orchestrator/myadmin1/`), then compress.
7. **Context compression (agents).** Tell every agent: *if you are almost at the end of your task, don't bother with
   context compression — it is quicker to just finish the task and respond.*
8. **Tests and timing on myadmin1 — never wait on GitHub CI.** CI still runs on every push, but nobody waits for its
   result: the local results on myadmin1 are what count. Look at CI at a wave's close at most, and never block on it.

## Read first (you; agents read their own parts in depth)

- **`plan_resolution.md`:**
  - §1 decisions R-D1 … R-D10 and the decision register;
  - **§2.6, "frame ≠ world"**: the frame grew ×5/3 but the world only ×1.5; edge-anchored values are re-derived, never
    multiplied; the top-edge rule;
  - §3 release lines, §4 how the plan is executed, §5 milestones and dependencies;
  - **§13: the benchmarks never block**, §14 risks, Appendix A/B;
  - **§17 Progress** (the durable state) and **§18, the waves of this run**.
- **`docs/v2-run/README.md`**, then the work order of the next wave in full.
- `CLAUDE.md` (the v2 section, the non-negotiables and where to push), `docs/dev/conventions.md`,
  `docs/dev/repo-layout.md`. opencode hands these three to every session through the repo's `opencode.json`; read them
  anyway.
- v1's definition of done and conventions (`docs/old/shmup_plan.md` §1.3, §1.5), with the v2 changes of plan §4.
- **Where the code is now:** the frame is 640×360 since `72b18a1`; the content (the world) is still v1's ×1 until
  R2-02's port; the goldens and attract demos are stale by design until R2-03 re-blesses them. Self-expiring gates
  keep the tests green meanwhile (`CONTENT_PORT_PENDING`, `GOLDENS_STALE`, `test/e2e/gates.ts` — CLAUDE.md).

## Hard rules (paste this block verbatim into every agent prompt)

```text
HARD RULES — Shmup Cup v2, for every agent and every task
1. Push only to master (git push origin HEAD:master). Never push a branch, never open a PR, never force-push. Never
   push to v1.x without the owner's explicit OK.
2. Frame ≠ world (plan_resolution.md §2.6). The frame is 640×360 on master (12-px HUD bars and tiles, playfield
   640×336, 9×12 font, ART_SCALE 3/2). The world is ×1 until R2-02's port and ×1.5 after it (§17 says which). A value
   anchored to a screen edge or the centre derives from the core constants (FRAME_W, FRAME_CX, PLAYFIELD_W,
   PLAYFIELD_H, HUD_BAR_HEIGHT, TILE_SIZE, GLYPH_W …); a world value (radius, margin, speed, distance) never derives
   from the frame; ticks, angles, counts and scores never scale.
3. No literal frame number 384 216 200 208 192 108 640 360 336 348 in packages/*/src, apps/*/src, apps/*/scripts or
   scripts/: import the constants from @shmup/core (in a Node script: from scripts/frame.mjs). The scans
   packages/core/test/frame-literals.test.ts and test/integration/frame-literals-repo.test.ts fail otherwise; add an
   allow-list entry only where the work order says so.
4. @shmup/core is pure and deterministic: no DOM / Node / platform globals, no Math.random, Date.now or
   performance.now, no Math.sin-family, Math.pow or ** (use the core math tables), no console.
5. Zero allocation in per-tick and per-frame paths (docs/dev/conventions.md "Performance"). Allocation guards use
   packages/core/test/helpers/alloc.ts; never raise a guard's budget, never move a measured loop into a helper.
6. Shipped code runs on Chromium 68 (LG webOS 5) and 69 (Tizen 5.5): no .flat / .flatMap / .at / Object.fromEntries /
   Object.hasOwn / replaceAll / structuredClone / Promise.allSettled. The TV bundles are one classic ES2018 IIFE: no
   dynamic import(), no top-level await.
7. Golden replays (test/golden/*.replay.json), attract demos (content/demos/*.replay.json) and the three fingerprints
   (presentation, content-DB, shell frame) change only on purpose, only by the agent holding their token, with the
   reason in the commit message. Never edit a .replay.json by hand. An unintended golden or fingerprint change is a
   bug. The one planned exception: from R2-01 to R2-03 the goldens and demos are stale by design (v1 recordings), and
   R2-03 re-blesses them. The self-expiring gates (CONTENT_PORT_PENDING, GOLDENS_STALE, test/e2e/gates.ts) are deleted
   only by the step that clears them.
8. Original names, art and music only. AI-assisted art enters only through art-prompts/ingest with its .art.json
   provenance; nothing from art-prompts/v2/candidates/ ships.
9. skynet2 (the owner's GPU server; it also serves the LLM the agents run on): the only allowed way to touch it is
   art-prompts/v2/server.sh, run by the owner or on the owner's word — never by an agent on its own. Never stop
   SGLang by name or GPU (no pkill, killall, sglang killall), never touch port 30000. Never print, copy or log the HF token. Never read, run or edit the owner's /root scripts.
10. The picker's data/choices.json is written only by the picker (picks_save() in its lib.php). On myadmin1,
    /home/sites/mystage/public_html/shmup-cup/data/choices.json is a SNAPSHOT: an art task first gets a fresh copy
    from the owner, and nothing ever writes it.
11. The Caliber pre-commit hook is inert: leave it alone. Skip CLAUDE.md's "Before Committing" section: never run
    caliber, never install or edit a git hook, never commit with --no-verify.
12. Never package, sign, deploy or touch hardware (no Tizen CLI, sdb, ares-*): such scripts may be written, never
    run. Add only the dependencies your task names; TypeScript stays 6.0.x. APP_JS_GZIP_BUDGET is 512 KB with about
    390 KB used: keep shipped code lean, and change a budget only deliberately, with the reason in the commit.
13. Tests and timing happen on myadmin1. Never wait for GitHub CI.
```

## opencode: how you run agents

**Checked on 2026-10-18:** myadmin1 runs **opencode v2.0.32** (`opencode --version`; `opencode --help`,
`opencode debug agents`, `opencode debug config`). Its model is `sglang/Qwen3.8-Flash-Next` from the owner's global
config `~/.config/opencode/opencode.json`, served from skynet2 — never touch that server. opencode v2 reads `AGENTS.md`
only (no `CLAUDE.md` fallback, and it does not follow CLAUDE.md's `@` includes), so the repo's **`opencode.json`** lists
`CLAUDE.md`, `docs/dev/conventions.md` and `docs/dev/repo-layout.md` under `instructions`: every session, yours and
each subagent's, gets them. Confirm it once: `opencode debug config` lists `/home/sites/shmup-cup/opencode.json` with
those three entries. The agent brief still tells agents to read them.

**Starting an agent.** Use opencode's **subagent tool**. In v2 it is `subagent`: an agent id, a short `description`,
the full `prompt`, and `background: true`; it returns a **`sessionID`**. (In opencode v1 the same tool is `task`, with
`subagent_type` and `task_id`; in Claude Code it is the Agent tool and SendMessage.) Look at your own tool list once
and use whatever the subagent tool is called there.
- **Agent id `general` for every role** — builder, fixer, tester, docs, integration, reviewer, scout. It has full tool
  access and cannot start subagents of its own. Do not use the host's custom `coder`, `reviewer`, `scribe` or `build`
  agents: their prompts load the owner's generic "philosophy" skills, not this repo's rules. `explore` is fine for a
  pure read-only search.
- **Background:** start agents with `background: true`, up to MAX_PARALLEL at once; opencode notifies you when each
  child finishes.
- **The prompt** is the agent brief below with every brace filled in, then the task's text copied **verbatim** from
  the work order (its subtask row or section: files, tests, acceptance). Save it as
  `.claude/orchestrator/myadmin1/prompts/<name>.md` before you send it.
- **Record** each agent the moment you start it, in the wave's lane file: name, role, lane, task ids, worktree path,
  **sessionID**, tokens held, status.
- **Resume** an agent by calling the subagent tool again with its `sessionID` and the prompt `continue` (a blank
  reply — owner rule 5), or `RESUME: <what to do>` after a restart. Its context is intact.
- **Fallback**, only if the subagent tool cannot run children in the background: start each agent as its own process
  from a background shell command — `opencode run --auto --title <name> "$(cat .claude/orchestrator/myadmin1/prompts/<name>.md)"`
  with its output sent to `.claude/orchestrator/myadmin1/logs/<name>.log` — and resume it with
  `opencode run --auto --session <sessionID> continue` (`opencode session list` shows the ids). Check
  `opencode run --help` first; flags can change between versions.
- Every agent also writes its report to `.claude/orchestrator/myadmin1/reports/<name>.md`. The reply is the report;
  the file is the backup. A blank reply still gets `continue`.

**Long commands.** opencode's shell tool stops a foreground command after **2 minutes** unless the call sets
`timeout` (milliseconds). Any command that can take longer — `pnpm install`, a Vitest folder, a typecheck, e2e,
`pnpm bench`, `pnpm golden:update` — runs with `timeout` set (for example `1800000`) or with `background: true` (no
timeout; you are notified when it ends, and its full output is kept in a file). A command cut off by the timeout did
not fail: run it again with a longer timeout. The agent brief says the same.

**Compaction.** opencode compacts a session by itself near the context limit (a summary plus the last ~15k tokens),
and on myadmin1 the DCP plugin also gives sessions a `compress` tool. Both lose detail. So keep the run notes current
after every agent event, so that an automatic compaction loses nothing; compact or compress yourself only after the
content is used and written down (after writing the lane plan or a wave report), never right before; and agents near
the end of a task do not compress at all.

**Your notes folder: `/home/sites/shmup-cup/.claude/orchestrator/myadmin1/`.** It is git-ignored (all of `.claude/`
is) and survives restarts; never keep state in `/tmp` or a session folder. The older files directly in
`.claude/orchestrator/` are the old host's history. Keep here:
- `RESUME.md` — ten lines: the wave, what runs (agent, sessionID, worktree), what is next;
- `lanes-<wave>.md` — the lane plan: tasks, lanes, exact files, tokens, agents, status, commit SHAs;
- `wave-<wave>-notes.md` — decisions, review rounds, findings and their outcomes, owner to-dos;
- `prompts/<name>.md`, `reports/<name>.md`, `logs/`.

Write to it **before** any compaction, and after every agent start, report and push.

## Worktrees and pushing

**The main checkout `/home/sites/shmup-cup` is yours.** It stays on `master` and clean. Agents never edit it; the one
exception is an agent's own report file under `.claude/orchestrator/myadmin1/reports/`.

**Every agent works in its own git worktree** under `/home/sites/shmup-wt/` — reviewers and scouts too, so that they
read exactly `origin/master`. `<name>` is the agent's name from the lane file (unique, e.g. `w2-S-port`):

```bash
git -C /home/sites/shmup-cup fetch origin
git -C /home/sites/shmup-cup worktree add /home/sites/shmup-wt/<name> origin/master --detach   # = ../shmup-wt/<name>
cd /home/sites/shmup-wt/<name>
pnpm install --frozen-lockfile --prefer-offline     # shell timeout 600000
pnpm assets                                         # only when the task's tests need the atlas
```

Every path an agent edits starts with `/home/sites/shmup-wt/<name>/`, and every shell command runs there (the shell
tool's `workdir`).

**Pushing** (file-changing roles; reviewers and scouts commit nothing):

```bash
git add <each file by explicit path>        # never git add -A / git add .
git commit -F <message file>                # imperative subject in the repo's style, body says why
git fetch origin && git rebase origin/master && git push origin HEAD:master
```

- Rejected: fetch, rebase and push again, up to 5 times. Resolve a rebase conflict keeping both sides' intent, then
  re-run the targeted tests before pushing. A conflict in a fingerprint's `PINNED` table or another generated file is
  regenerated, never merged by hand.
- After the last push: `git fetch origin && git merge-base --is-ancestor HEAD origin/master` must succeed and
  `git status` must be clean. Then the agent removes its worktree:
  `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-wt/<name>`. Read-only agents remove theirs when
  done. Anything dirty or unpushed: keep the worktree and report it.
- A work order may keep a lane's worktree across several agents (for example a zone lane on a **local** branch, landed
  later by one LAND commit). Local branches are scaffolding: never pushed, deleted after the land.
- At a wave's close you check `git worktree list` and `git worktree prune`, and remove only worktrees whose HEAD is on
  `origin/master` with no changes left.

## Tokens and locks

- **A token** is the right to edit one set of shared files during a wave: **GOLDEN** (the goldens, the attract demos,
  `pnpm golden:update`), **FP** (the presentation, content-DB and shell frame fingerprints), and the others §18 and the
  work orders name (LAND, BOT, BEHAVIOR, STRINGS, SCENES …). **You assign each token to one lane in the lane plan.**
  Only that lane touches the token's files in that wave, and the token passes on only after the holder's push is on
  `origin/master`. A builder that finds it needs a token it does not hold stops and reports.
- **Shared hot files** count as touched by every task that mentions them, so those tasks serialize:
  - `packages/core/src/index.ts` (the barrel) and the packages' `src/index.ts`;
  - `packages/core/src/config/index.ts`, `packages/core/src/data/index.ts`, `packages/core/src/behaviors/index.ts`;
  - `test/integration/content.test.ts`;
  - the frame-literal allow-lists (`packages/core/test/frame-literals.test.ts`,
    `test/integration/frame-literals-repo.test.ts`) and `scripts/frame.mjs`;
  - `pnpm-lock.yaml`, the `package.json` files, `turbo.json`, `eslint.config.js`, `.github/workflows/ci.yml`;
  - `plan_resolution.md`, `CHANGELOG.md`, `README.md`, `docs/**`, `CLAUDE.md` (the docs agent only).
- **At most one sim-changing lane** at a time, unless §18 says otherwise for a wave (R5's "build in parallel, land one
  at a time" under its LAND lock).
- **The e2e lock.** Playwright's web server uses the fixed port 4173 (`--strictPort`), and the timed specs measure
  frame pacing, so one e2e batch runs on myadmin1 at a time. A batch is at most 10 specs, built outside the lock and
  run inside it. The helper does both, from the worktree it lives in; start it with the shell tool's
  `background: true` (it can wait a long time for the lock):

  ```bash
  bash docs/v2-run/helpers/e2e-batch.sh <spec files>      # E2E_WORKERS=2, E2E_PROJECT=chromium by default
  ```

  Without the helper, the same by hand:

  ```bash
  pnpm exec turbo run build:test --filter=@shmup/web --filter=@shmup/tizen --filter=@shmup/webos
  flock -w 5400 /tmp/shmup-cup-e2e.lock env CI=1 E2E_WORKERS=2 pnpm exec playwright test \
    --config test/e2e/playwright.config.ts --project=chromium <spec files>
  ```

  `CI=1` keeps Playwright from reusing another worktree's server. `pnpm bench`, `pnpm docs:screens` and
  `host-check.sh`'s e2e steps take the same lock, so they cannot make a timed spec flaky. If an agent's shell refuses
  `flock` directly, it writes the command into a script file and runs `bash <file>`.

## How you work

- **Durable state:** §17 of `plan_resolution.md` on `origin/master`, plus the run notes above. Update the lane file
  whenever an agent starts, reports or pushes, so that compressing your context loses nothing.
- **Status values in §17:**
  - `not started`;
  - `in progress`;
  - `done`;
  - `done (owner parts pending)` — the code is complete and only "Manual (owner)" items remain;
  - `waiting on owner` — the agent part cannot start before the owner's input, e.g. R0-03 before bench logs exist;
  - `blocked: <reason>`.
  `plan_board_v2.py` maps `done…` → Done, `in progress` / `blocked` → In Progress, and everything else → Todo. It
  reads `plan_resolution.md` from the current directory: run it as `python3 .claude/plan_board_v2.py` in the main
  checkout, after `git pull --rebase origin master`. Only you run it.
- **You edit only §17's status cells** of `plan_resolution.md`, and only while no docs agent runs: commit and push them
  from the main checkout (`git pull --rebase origin master` first).
- **Owner-only parts never block** (plan §4, §13): the TV benchmark run, AI generation, hand cleanup of sprites, play
  sessions on the M7, the FLUX licence. Agents build the tools, use interim or procedural art, and list what is left
  under the step's **Manual (owner)** in its As-built notes.

## Preflight (inline, before the first wave)

1. `cd /home/sites/shmup-cup`: `git status` is clean, the branch is `master`, then `git pull --rebase origin master`.
2. `node -v` is ≥ 24.15 (24.21 via nvm on myadmin1) and `pnpm -v` is 12.x (12.3.4 via corepack). If not:
   `corepack enable`, then `which -a pnpm` for a stale shim (the old standalone pnpm 8.6 was moved to
   `~/.local/share/pnpm/pnpm-8.6.0.bak`).
3. `pnpm install --frozen-lockfile` and `pnpm assets`. Then `pnpm typecheck && pnpm lint` (about a minute together):
   a red baseline poisons every lane, so a real red gets **one** fix agent and its review loop before the first wave.
   Do **not** run the tests, e2e or bench here. The Playwright browsers and their system packages are installed; if a
   spec reports a missing browser: `pnpm exec playwright install chromium firefox`, and for system packages
   `sudo -n env "PATH=$PATH" pnpm exec playwright install-deps chromium firefox`.
4. `mkdir -p .claude/orchestrator/myadmin1/{prompts,reports,logs} /home/sites/shmup-wt`. If
   `.claude/orchestrator/myadmin1/RESUME.md` exists, this is a resumed run: read it and the lane file it names, and
   resume the agents it lists by sessionID before starting new ones. `git worktree list`: check every leftover worktree
   (clean? pushed?) before removing it.
5. `opencode debug config` lists the repo's `opencode.json` with its three `instructions`.
6. Read §17, §18 and `docs/v2-run/README.md`: the next wave is the first §18 wave that is not closed. Check its
   prerequisites. Report any `blocked` step to me; skip `waiting on owner` steps unless their input now exists (R0-03:
   logs under `tools/input-probe/results/*-bench/`).
7. `python3 .claude/plan_board_v2.py` (it uses `gh`, which is logged in on myadmin1). If the file is missing (it is
   git-ignored and copied by hand), skip it and tell me.
8. CI, for the record only (owner rule 8): `gh run list --branch master --limit 3`. Note the state in `RESUME.md`; do
   not wait for a run and do not chase a CI-only red here.

`docs/v2-run/helpers/host-check.sh` is the full CI-equivalent run on this host (install, Playwright, format, lint,
typecheck, test, build, bench, e2e Chromium and Firefox, the input probe, the ingest check; about 12 minutes; it passed
on `bc8e05d`). It is the **full suite**: run it at the end of the run, or when the host itself is rebuilt, never in the
preflight.

## The wave loop

A **wave** is one row of §18: its steps and subtasks, its lanes, its tokens and its order are in its work order. Run
the waves in §18's order. **Nothing waits for R0-02 / R0-03** (§13), and **R0-04 is never built in a wave**: its agent
parts (the winners copy, the prompt-library edits) appear in §18 where the owner's inputs allow. The first wave holds
R2-01's **docs pass** (with whatever §18 runs beside it); R2-01 becomes `done` in §17 once that pass's review loop
reaches zero.

### 1. Re-check scouts (read-only, in parallel)

The work order already lists each subtask's files, tests, tokens and order. Before the wave, spawn **re-check scouts**
— one per step, or per group of about ten subtasks — that compare the work order with the current `origin/master`:
every named file and symbol still exists, what earlier waves changed, which line numbers moved. Each returns the
**scout report** (template below): per subtask the files it will **create** or **modify**, the targeted tests, whether
the simulation changes, the tokens, and the order between subtasks. Work that no work order covers (a review finding
that needs a new subtask, a red test) gets a scout of its own before a builder.

### 2. Plan the lanes (you)

- **Build a conflict graph** from the scouts' file lists. Tasks that share a file go in the same lane (sequential);
  the others go in different lanes (parallel), at most MAX_PARALLEL agents at once and at most MAX_E2E_AGENTS that run
  Playwright.
- **Assign every token** to one lane (see "Tokens and locks").
- **Builders never edit** `plan_resolution.md`, `CHANGELOG.md`, `docs/dev/api-reference.md`, `README.md`, `CLAUDE.md`
  or `docs/**` unless the work order makes them the wave's docs agent. They return As-built notes and docs needs in
  their report, and the docs agent (step 6) writes them.
- Write the lane plan to `.claude/orchestrator/myadmin1/lanes-<wave>.md`.
- Set the wave's steps to `in progress` in §17 and run `plan_board_v2.py`.

### 3. Build (one agent per lane, lanes in parallel)

- A lane's agent does its tasks **in order**. For each: implement it per the work order and the plan section; write
  and fix the **targeted tests** and run only those, plus typecheck / lint / prettier of what it touched; **commit and
  push** the task to `master`.
- **Before you start a lane's next agent, re-read the lane file.** If a builder reports touching a file outside its
  list, check every running lane against it, and re-plan or serialize when they collide.
- **Blank response → `continue`** (owner rule 5).

### 4. Review → fix → new review (per step or per lane group, as soon as its lanes have pushed)

- **Review:** a fresh **review agent** reviews everything the step pushed (give it the SHAs, the work-order section,
  the acceptance list and the previous rounds' findings with their outcomes) against the plan, the hard rules and the
  conventions, and runs the targeted tests. It changes nothing. It reports:
  - bugs;
  - missing or wrong acceptance items;
  - failing targeted checks;
  - Chromium 68 problems;
  - determinism, allocation or budget violations;
  - a frame-anchored value multiplied by 1.5, or a world value re-derived from the frame (§2.6);
  - structure that will clearly cause bugs; security;
  - **nits that are real defects**: a stale or wrong comment or doc line, a misleading name, a missing docblock the
    conventions require.
  Never style preferences, optional ideas, or anything out of scope.
- **Fix:** if there are findings, a **fix agent** fixes each at the root, or declines it with a concrete reason; adds
  regression tests; runs the targeted tests; pushes. Doc-only nits may be folded into a fixer that is already running.
- **Loop:** then a **new** review agent reviews again, given the previous rounds' findings and outcomes. A declined
  finding may be re-raised only with new concrete evidence.
- **Repeat until a review returns zero findings, nits included.** If the same finding keeps coming back, have one
  fresh tie-breaker agent rule on it, then follow its ruling.
- Independent steps' review loops run in parallel. Record every round in the wave notes.

### 5. Tests (per step, targeted)

A **test agent** strengthens the step's targeted tests: edge cases, a regression test for every fixed finding, the
plan's acceptance checks as tests. It runs only those tests and pushes. Its changes get the same review loop (step 4).

### 6. Docs (per wave — one agent, never two docs agents at once)

The **docs agent**:
- completes TSDoc on everything the wave touched (`conventions.md` standard);
- updates `docs/dev/*.md` (including `api-reference.md`), `docs/client/*.md`, package READMEs, the root `README.md`
  and, where the wave changed a rule, `CLAUDE.md`;
- writes each step's **As built:** notes and **Manual (owner)** items under its section in `plan_resolution.md`, and
  the wave's decisions in the decision register;
- sets the steps' rows in **§17** (you then pull the main checkout and run `plan_board_v2.py`);
- adds CHANGELOG `[Unreleased] — v2` entries;
- pushes.

Its changes get one review loop (step 4) to zero.

### 7. Close the wave (you)

- Check that every task's commit is on `origin/master` (`git log`).
- Remove finished worktrees (see "Worktrees and pushing"), prune the rest, delete local scaffolding branches.
- Run `plan_board_v2.py`.
- **CI, once, for information** (owner rule 8): `gh run list --branch master --limit 5`. Do not block on it. A red
  **build / typecheck / lint** job that reproduces on myadmin1 gets a fix agent before the next wave (a broken build
  poisons every lane). A red test or e2e job caused by this wave that is not expected (the goldens being stale inside
  R2 is expected) gets a fix agent, reproduced locally first — a CI-only failure with `taskset -c 0-3` (CI ran about
  ×1.8 slower than a local run in R2-01), never by raising a timeout blindly.
- Report to me in a few lines (see "Reporting to me").
- Write the wave's state to the run notes and `RESUME.md`; then compress if you need to.
- **PAUSE:** if it is `waves`, or `milestones` and this was a milestone's last wave, stop and wait for me.
- **Milestone boundary:** at the end of R2 (R2-04), tag `v2.0.0-alpha.1`; at the end of R5-10, `v2.0.0-beta.1`; each
  with `gh release create … --prerelease`, after that run's full suite has passed on myadmin1 (the work orders say
  which subtask bumps the versions first).

## End of the run: the one full suite

1. **Run the full suite.** One **integration agent** (its own worktree on `origin/master`) runs the full check suite
   once, on myadmin1, **alone** (no other agent runs meanwhile):
   - `bash docs/v2-run/helpers/host-check.sh` from its worktree (background, with its log). It runs install,
     Playwright, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm bench`,
     `pnpm test:e2e` for Chromium and Firefox under the e2e lock, the input probe
     (`cd tools/input-probe && npm ci && npm run verify`) and the ingest tool
     (`cd art-prompts/ingest && npm ci && npm test && node ingest.mjs --check`);
   - then `pnpm content:check`, `pnpm docs:images --check` and `pnpm store:assets --check`.
2. **Update everything that tracks the changes:**
   - re-bless goldens and attract demos (`pnpm golden:update`) **only where a step changed the simulation on
     purpose**, with the reason in the commit message — any other golden failure is a bug to fix;
   - regenerate docs images, screenshots and store assets if the art changed;
   - update bench budgets only deliberately and documented.
   Fix everything red and push.
3. **Review the integration changes** with the step-4 loop, to zero.
4. **CI, once:** look at the run of the final `master` commit (`gh run list --branch master --limit 3`). The local
   result counts (owner rule 8). A job that is red on CI only gets one triage agent (reproduce with `taskset -c 0-3`);
   its result goes into the final report.
5. **Close out:** the final §17 update (docs agent), `plan_board_v2.py`, and the final report: steps done, review
   rounds, findings fixed or declined, test counts, As-built deviations, everything waiting on me grouped by step, the
   local full-suite result and the CI state, and the next manual actions (the TV benchmark run, AI art and cleanup,
   the FLUX licence, M7 play sessions).

## The art round (R0-04) on myadmin1

**All GPU work is done** (skynet2's image cards empty since 2026-10-17 20:49, `VERIFY OK`), round 2 is generated and
reviewed, and R0-04 is waiting on the owner: is picking finished, and Git LFS for the winners? Model sessions do not
run from myadmin1: it has no tested key for `root@skynet2` (`server.sh`'s `SERVER_SH_HOST`), the picker page is served
from the old host only, and only the owner starts GPU sessions. So `ART_ROUND` stays `off` here, and no agent runs
`gen-candidate.mjs`, `generate.mjs`, `sweep-models.sh` or `server.sh`.

What agents can still do here is in §18 and its work orders (R0-04's winners copy and the prompt-library edits;
R3-02's real ingest and R3-04's calibration on real candidates are owner-gated). The rules for any task that reads the
picks:
- The candidates are in `art-prompts/v2/candidates/` (git-ignored, copied over; never committed), and
  `/home/sites/mystage/public_html/shmup-cup/data/choices.json` is a **snapshot** — the owner keeps picking on the old
  host. Before any art step, **ask me for a fresh copy** of `choices.json` (myadmin1 cannot reach the old host), and
  read that copy; nothing ever writes the live file except the picker's `picks_save()`.
- A regenerate request counts as done only when every slot's take is newer than the click.
- Winners go to `art-prompts/v2/winners/<item id>/` only after my "picking is done" and the Git LFS decision; check
  `du -sh art-prompts/v2/winners` first and ask me before committing more than ~200 MB.
- FLUX is on hold for pixels and as a reference until the licence question is settled (`docs/dev/art-provenance.md`).

If the owner ever runs another generation session, it runs from the old host with the full procedure and the
generation agent brief of the previous version of this file: `git show bc8e05d:prompt_resolution.md` ("The art
round"), with `docs/dev/art-generation-server.md` and `art-prompts/v2/STATUS.md`.

## Agent brief — put this at the top of every agent prompt (fill in every brace)

```text
You are agent {NAME}: the {ROLE} (scout | builder | reviewer | fixer | tester | docs | integration) for Shmup Cup v2,
the 640×360 remaster. Wave {WAVE}, lane {LANE}, task {TASK IDS} from {WORK ORDER FILE} § {SECTION}.

YOUR FILES — the only files you may create or change: {EXACT PATHS, or "none" for scouts and reviewers}
YOUR TOKENS: {GOLDEN | FP | LAND | … | none}. Files of a token you do not hold are read-only for you.
YOUR TESTS — run exactly these, plus the new tests your task needs: {EXACT COMMANDS}
DONE WHEN: {the acceptance items, copied from the work order}
THE TASK, copied from the work order: {VERBATIM TEXT}

READ FIRST, in this order: this prompt; plan_resolution.md "### {STEP ID} — {Title}" (the whole section), §2.6
(frame ≠ world) and §18's row for wave {WAVE}; CLAUDE.md, docs/dev/conventions.md, docs/dev/repo-layout.md (opencode
gives you these three as instructions; if you cannot see them, read the files). Read every file in YOUR FILES before
you edit it. Big files (packages/core/src/behaviors/index.ts, packages/core/src/data/index.ts,
test/integration/content.test.ts): edit with exact old/new strings, never rewrite the whole file.

{HARD RULES block, verbatim}

THE OWNER'S GENERAL INSTRUCTIONS (the orchestrator carries out 1, 3, 5 and 6; 2, 4, 7 and 8 are yours directly):
1. Agents and concurrency are used as much as is safely possible: scouts report the files each fix will touch, and
   the orchestrator plans lanes from that. If you are a scout, your file lists are what the lanes are built from: be
   exact.
2. Tests as you go: build, fix and update the targeted tests for what you touch, and run only those. Never run the
   full suite (pnpm test, pnpm test:e2e, pnpm bench, all goldens): it runs once at the end of all the changes.
3. After fixes, a review agent reports findings, a fix agent fixes them, then a NEW review agent reviews again, until
   a review finds no issues. If you are a reviewer, report every real issue, nits included; if a fixer, fix each
   finding at the root or decline it with a concrete reason.
4. Commits all go to master — no branches, no PRs.
5. A blank reply gets "continue": your final message must never be blank.
6. The orchestrator compresses its context only after using the content.
7. If you are almost at the end of your task, don't bother with context compression — it is quicker to just finish the
   task and respond.
8. Tests and timing happen on this host (myadmin1); never wait for GitHub CI.

WORKTREE — do this first:
  git -C /home/sites/shmup-cup fetch origin
  git -C /home/sites/shmup-cup worktree add /home/sites/shmup-wt/{NAME} origin/master --detach
  cd /home/sites/shmup-wt/{NAME}
  pnpm install --frozen-lockfile --prefer-offline        (shell timeout 600000)
  pnpm assets                                            (only if your tests need the atlas)
Work ONLY in /home/sites/shmup-wt/{NAME}: every path you edit starts with it, every shell command runs with its workdir
set to it. Never edit /home/sites/shmup-cup (the orchestrator's checkout), except your report file.

COMMANDS:
- The shell tool stops a command after 2 minutes unless you set `timeout`. Give every longer command a timeout (e.g.
  1800000) or run it in the background and wait for it. A command cut off by the timeout did not fail: run it again
  with a longer timeout.
- Vitest: VITEST_MAX_WORKERS=6 pnpm exec vitest run --project <core | integration | shell | render-pixi | audio-web |
  input-web | web | tizen | webos | electron> <test files or folders>
- Types, lint, format: pnpm --filter <package> typecheck; pnpm exec eslint <your files>; pnpm exec prettier --check
  <your files> (fix with --write).
- e2e, only if YOUR TESTS name specs, at most 10 specs a batch, with the shell tool's background mode (the batch
  waits for the machine-wide lock):
    bash docs/v2-run/helpers/e2e-batch.sh <spec files>
  It builds the test builds outside the lock, then runs the specs under /tmp/shmup-cup-e2e.lock with CI=1 and
  E2E_WORKERS=2. Never run Playwright outside that lock. Step exact ticks (test/e2e/frame-advance.ts), sample pixels
  through test/e2e/frame-pixels.ts, never raise a timeout blindly.
- Never: git stash (the stash is shared by every worktree); git checkout / git reset on files you did not change;
  git add -A or git add .; pnpm golden:update unless you hold GOLDEN; editing a .replay.json or a fingerprint's PINNED
  table by hand.

STAY INSIDE YOUR FILES. If your task truly needs a file outside YOUR FILES and no other lane or token owns it (a test
helper only you use), change it and list it under "Files outside my list". If it is a token's file or another lane's
file, do NOT change it: stop and report what you need. A failure in another subtask's area: report it with that
subtask's id; never fix it outside your list. Unless YOUR FILES names them, never edit plan_resolution.md,
CHANGELOG.md, README.md, docs/dev/api-reference.md, CLAUDE.md or docs/**: put As-built notes and docs needs in the
report (the docs agent writes them).

GIT (file-changing roles only; scouts and reviewers commit nothing):
  git add <each file by explicit path>
  git commit -F <message file>   (imperative subject in the repo's style — feat(R2-02): …, test(R2-02): …,
                                  docs: … — and a body that says why)
  git fetch origin && git rebase origin/master && git push origin HEAD:master
- Never commit node_modules, dist, dist-bench, *.wgt, *.ipk, logs, coverage, .turbo, test-results, .claude/,
  .caliber/, .playwright-mcp/, art-prompts/v2/candidates/ or secrets. Add no Co-Authored-By line: the Claude lines
  in git log belong to the old host's agents, not to you.
- One commit per task, pushed as soon as its tests pass. Push rejected: fetch, rebase, push again, up to 5 times.
- A rebase conflict: keep both sides' intent and re-run YOUR TESTS before pushing. In a fingerprint PINNED table or
  another generated file, regenerate it; never merge it by hand.
- Never force-push, never --no-verify, never push another branch, never touch v1.x.
- After your last push: git fetch origin && git merge-base --is-ancestor HEAD origin/master must succeed and git status
  must be clean; then git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-wt/{NAME}. Scouts and reviewers
  remove their worktree when done. Anything dirty or unpushed: keep the worktree and say so.

OWNER-ONLY WORK (TV runs, hand cleanup of sprites, play sessions, AI generation, the FLUX licence) never blocks you:
build the tooling, use interim or procedural art, and list what remains under "Manual (owner)".

REPORT: write it to /home/sites/shmup-cup/.claude/orchestrator/myadmin1/reports/{NAME}.md AND make it your final
message, in the template for your role. Your final message must never be blank.
```

## Report templates (what each agent returns)

Plain Markdown, these headings, in this order. Write `none` rather than leaving a heading out.

**Builder / fixer / tester / integration:**

```text
# Report {NAME} — {ROLE}, task {IDS}
Summary: 2–4 lines.
Commits: <sha> <subject> — pushed yes/no (one line each)
Files changed: <paths>
Files outside my list: <path — why> | none
Tests run: <exact command> → <passed / failed / skipped counts> (one line each)
Simulation changed (goldens): yes/no — why
As built (deviations from the plan, with the reason): …
Manual (owner): …
Docs needs: …
Open issues: …
Outcomes (fixers only): F1 fixed in <sha> | F2 declined — <concrete reason>
Worktree: removed | kept — why
```

**Reviewer:**

```text
# Review {NAME} — round {N} of {SCOPE}
Commits reviewed: <shas>
Checks run: <exact command> → <result> (one line each)
Findings: none
  — or one line each: F1 [blocker | major | nit] <file>:<line> — <title>. <detail>. Fix: <suggested fix>.
Summary: 2–4 lines.
```

**Scout:**

```text
# Scout {NAME} — {STEP or WAVE}
Approach: …
Subtasks (one block each): id · summary · create: <paths> · modify: <paths> · targeted tests: <commands> ·
  changes the simulation: yes/no · tokens: … · depends on: …
Changed since the work order: …
Risks: …
```

**Docs:** `Files changed`, `§17 rows`, `Commits`, `Worktree` — the same style.

## Reporting to me

Keep your messages short:
- at the start: the wave and the lanes you launched;
- after each wave: steps done, review rounds per step, findings fixed / declined, tests added, As-built deviations,
  owner to-dos, the local test state, and the CI state as information;
- at the end: the final report.

If something truly needs my decision — a contradiction in the plan, a budget that cannot be met, a licence question
about AI art, an art step that needs fresh picks — ask, and keep the other lanes running meanwhile.

## Start now

Do the preflight, then start the re-check scouts of the next §18 wave.
