# Wave 14 — R6-01 balance

> Schedule: `plan_resolution.md` §18 · how to use: `docs/v2-run/README.md` · decisions: `docs/v2-run/decisions.md`

**Steps:** R6-01 (balance and difficulty). · **Gate to start:** wave 13's exit — `docs/v2-run/balance-report.md`
(R6-01.B2) on `origin/master`; the owner's overrides, if he sent any (never required). · **Exit (summary):** the nine
per-zone passes LANDed one at a time, then the global pass (rules, built-in tables, rank) and the extra-mode pass
re-blessed with their reasons; every review at zero; the wave's docs item done.

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| 1–8 (zone passes) | `R6-01.B3a` (A) · `B3b` (B) · `B3c` (C) · `B3d` (D) · `B3e` (E) · `B3f` (F) · `B3g` (G) · `B3h` (H), then `B3i` (I) in the first free lane | `content/enemies/zone-<x>.enemies.json`, `content/stages/zone-<x>.stage.json` | LAND at the end of each | none |
| 9 (alone, last) | `R6-01.B4 → R6-01.B5` | `content/rules/*`, the built-in copies in core, the rank curve; then the caravan clock and its strings | GLOBAL (B4), LAND + STRINGS (B5) | none |

- **Order rules:** at most 8 zone passes build at once; their LANDs run one at a time (the land lock). **B4 starts
  only after every B3 has LANDed**, and holds the land lock for its whole re-bless (GLOBAL: no LAND meanwhile). B5
  follows B4 in the same lane.
- **Reviews:** each `R6-01.B3x.RV` on its branch before its LAND; `R6-01.B4.RV`, `R6-01.B5.RV`; `R6-01.RV` (the step)
  at the end.
- **Docs item:** `W14.DOCS-A`, `W14.DOCS-B`.
- **Fillers:** wave 15's `R6-03.D3` / `D4` must **not** start early (the art and the screens follow the balance).

## Rules for this wave

1. **Apply the report.** `docs/v2-run/balance-report.md` gives one section per zone (B3x) and one global section (B4,
   B5). Apply its proposed numbers; where the owner sent an override, the override wins (the orchestrator puts it in
   the subtask's prompt). Never change a number the report does not name.
2. **Zone passes are LANDs.** Each B3x works in `RUN_DIR/wt/r6-zone-<x>` on a local branch `r6/zone-<x>` (never
   pushed), is reviewed there, and reaches `origin/master` only through
   `RUN_DIR=<RUN_DIR> bash docs/v2-run/helpers/land-zone.sh --only <scope> --message <file> --zone <x>` (it takes `/tmp/shmup-cup-land.lock` itself — never wrap it in another `flock`; `--dry-run` first). The scopes are
   the zone LANDs' (A `zone-a,bonus-range`; B `zone-b,brine-grotto`; C `zone-c`; D `zone-d`; E `zone-e`; F `zone-f`;
   G `zone-g,glimmer-cache`; H `zone-h`; I `zone-i`).
3. **Still frozen:** `tender`'s fields (`content/enemies/zone-a.enemies.json`; it is every zone's capsule carrier —
   only B4 may change it, as a global change); the ids and sprite names every other file names.
4. **Scores and density only** in a zone pass: an enemy's or a boss's `score`, the number and spacing of spawns. A
   change that breaks the zone's v2 contract (`test/integration/zones/zone-<x>.contract.ts`) or the 4-way rules is
   wrong — keep the contract green, never relax it.
5. **Goldens:** every re-bless names its reason ("R6-01 balance: …"); a diff outside the declared scope is a bug.

## Subtasks

### R6-01.B3a — Zone A's balance pass (the template for B3b … B3i)

- **Wave / lane / order:** wave 14, lane 1.
- **Depends on:** R6-01.B2 (`docs/v2-run/balance-report.md`) on `origin/master`.
- **Goal:** apply the report's zone A section: enemy and boss `score`s, density where the report flags it.
- **Files (only these):** `content/enemies/zone-a.enemies.json` (`score` fields; never `tender`, `picket` or
  `halcyon-bulwark`'s other fields — `picket` and `halcyon-bulwark` also play in `bonus-range`, so their score
  change is in this scope on purpose), `content/stages/zone-a.stage.json` (spawn / formation density).
- **Steps:** create the worktree and branch (rule 2); edit; run the tests; review (`R6-01.B3a.RV`) to zero; LAND.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-a.test.ts test/playtest/zone-a.test.ts test/integration/release-audit.test.ts
  ```
  then the LAND:
  ```bash
  RUN_DIR=<RUN_DIR> bash docs/v2-run/helpers/land-zone.sh --only zone-a,bonus-range --message RUN_DIR/R6-01.B3a-msg.txt --zone a
  ```
- **Acceptance:** the zone's contract and the 4-way rules green; the bot still clears it in god mode; the LAND's
  replay diff ⊆ zone A's scope with the reason "R6-01 balance: zone A scores / density".
- **Token:** LAND.
- **Traps:** a score is a count, never ×1.5; density changes keep the capsule window rule (≥ 3 per 1,350 px after a
  checkpoint) and the calm (exactly two `carrier.straight`); never `golden:update` outside the LAND script.
- **Docs needs:** the changed values for `docs/dev/death-and-scoring.md` and the zone doc.

### R6-01.B3b — Zone B's balance pass

- As B3a, with `content/enemies/zone-b.enemies.json`, `content/stages/zone-b.stage.json`, the tests
  `content-zone-b.test.ts`, `test/playtest/zone-b.test.ts`, `release-audit.test.ts`, and the LAND scope
  `zone-b,brine-grotto`. Worktree `RUN_DIR/wt/r6-zone-b`.

### R6-01.B3c — Zone C's balance pass

- As B3a, with `zone-c.enemies.json`, `zone-c.stage.json`, `content-zone-c.test.ts`, `test/playtest/zone-c.test.ts`,
  `release-audit.test.ts`; LAND scope `zone-c`.

### R6-01.B3d — Zone D's balance pass

- As B3a, with `zone-d.enemies.json`, `zone-d.stage.json`, `content-zone-d.test.ts`, `test/playtest/zone-d.test.ts`,
  `release-audit.test.ts`; LAND scope `zone-d`.

### R6-01.B3e — Zone E's balance pass

- As B3a, with `zone-e.enemies.json`, `zone-e.stage.json`, `content-zone-e.test.ts`, `test/playtest/zone-e.test.ts`,
  `release-audit.test.ts`; LAND scope `zone-e`.

### R6-01.B3f — Zone F's balance pass

- As B3a, with `zone-f.enemies.json`, `zone-f.stage.json`, `content-zone-f.test.ts`, `test/playtest/zone-f.test.ts`,
  `release-audit.test.ts`; LAND scope `zone-f`. Zone F was the bot's hardest zone: re-run its playtest twice.

### R6-01.B3g — Zone G's balance pass

- As B3a, with `zone-g.enemies.json`, `zone-g.stage.json`, `content-zone-g.test.ts`, `test/playtest/zone-g.test.ts`,
  `release-audit.test.ts`; LAND scope `zone-g,glimmer-cache`.

### R6-01.B3h — Zone H's balance pass

- As B3a, with `zone-h.enemies.json` (the echoes' `score` too), `zone-h.stage.json`, `content-zone-h.test.ts`,
  `test/playtest/zone-h.test.ts`, `release-audit.test.ts`; LAND scope `zone-h`.

### R6-01.B3i — Zone I's balance pass

- As B3a, with `zone-i.enemies.json`, `zone-i.stage.json`, `content-zone-i.test.ts`, `test/playtest/zone-i.test.ts`,
  `release-audit.test.ts`; LAND scope `zone-i` (it includes `zone-i-escape`). Starts in the first free lane.

### R6-01.B4 — The global pass: presets, extends, rank, scoring

- **Wave / lane / order:** wave 14, lane 9, after **every** B3 LAND; alone (GLOBAL).
- **Depends on:** R6-01.B3a … B3i on `origin/master`.
- **Goal:** apply the report's global section: the four presets (lives, extends, rank base and growth, continues,
  death penalty, bullet speed) in `difficulty.rules.json`; the scoring rules (cancel points, the milking cap
  `repeatKills` / `repeatPercent`); the extends (today 20,000 / every 70,000); the rank curve only if the report asks.
  The built-in copies in core equal the content (`content.test.ts:423`, `:539`).
- **Files (only these):**
  - `content/rules/difficulty.rules.json`, `content/rules/scoring.rules.json`, `content/rules/README.md` (only if its
    sample shows a changed value — the samples are validated);
  - `packages/core/src/config/index.ts` — `DEFAULT_DIFFICULTY_TABLE` (`:321` on `bc8e05d`) (CORE-CONFIG);
  - `packages/core/src/scoring/index.ts` — `DEFAULT_SCORING_RULES` (`:159`);
  - `packages/core/src/rank/index.ts` — only if the curve changes;
  - the pins: `packages/core/test/config/config-difficulty.test.ts`, `config-difficulty-edge.test.ts`,
    `packages/core/test/rank/rank*.test.ts`, `packages/core/test/scoring/scoring*.test.ts`, and the other tests that
    import the tables (`git grep -ln "DEFAULT_DIFFICULTY_TABLE\|DEFAULT_SCORING_RULES" packages test` — e.g.
    `packages/core/test/world/world-m3-content.test.ts`, `packages/core/test/replay/replay-demo-edge.test.ts`,
    `test/integration/patterns-runtime.test.ts`) — only where a pinned value changed;
  - every golden and demo (the whole-set re-bless).
- **Steps:**
  1. Work in `RUN_DIR/wt/r6-global` on a local branch `r6/global` (never pushed). Edit content and the built-in
     copies together; fix the pins that changed (through the constants, never by pasting a failing run's output);
     commit on the branch (sources only).
  2. Review (`R6-01.B4.RV`) on the branch to zero, then the whole-set re-bless with the helper's GLOBAL mode — it
     takes the land lock itself for the whole run, so no LAND overlaps it:
     `RUN_DIR=<RUN_DIR> bash docs/v2-run/helpers/land-zone.sh --all --message RUN_DIR/R6-01.B4-msg.txt --zone a`
     (`--dry-run` first; `--zone a` only picks the zone checks; the `test/golden` run covers every golden). It runs
     `pnpm golden:update` (the whole set), the fingerprints' update mode and `pnpm docs:images`, then pushes.
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/config packages/core/test/rank packages/core/test/scoring packages/core/test/world/world-m3-content.test.ts packages/core/test/replay
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/patterns-runtime.test.ts test/integration/release-audit.test.ts test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts packages/shell/test/determinism
  pnpm --filter @shmup/core typecheck
  ```
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
- **Goal:** apply the report's extra-mode section. Default (decision R6-D1): the caravan keeps **3 minutes**
  (`CARAVAN_TICKS` = `180 * 60`, `packages/core/src/scenes/index.ts:1268`); only if the report says otherwise change
  it, with its hint string. Retime the boss-rush delays if the report asks.
- **Files (only these):**
  - `packages/core/src/scenes/index.ts` — `CARAVAN_TICKS` only (SCENES);
  - `content/strings/{en,es,ja}.strings.json` — `extraCaravanHint` (en `:284` "SCORE ATTACK: THREE MINUTES") and
    `packages/core/src/ui/strings.ts` — `extraCaravanHint` (`:342`) (STRINGS; en must equal the built-in table);
  - `content/stages/boss-rush.stage.json` — the `rush` delays;
  - `packages/core/test/scenes/scenes-extra-modes.test.ts`, `test/playtest/boss-rush.test.ts` — the pins.
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/scenes/scenes-extra-modes.test.ts packages/core/test/ui
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/localization.test.ts test/integration/cjk-budget.test.ts test/playtest/boss-rush.test.ts
  pnpm content:check
  ```
  then, if the caravan clock changed, the LAND (it re-records zone A's scenarios; only `zone-a-caravan` may differ):
  ```bash
  RUN_DIR=<RUN_DIR> bash docs/v2-run/helpers/land-zone.sh --only zone-a --message RUN_DIR/R6-01.B5-msg.txt --zone a
  ```
  otherwise a normal push under the land lock with the fingerprint update (strings and `boss-rush` are hashed).
- **Acceptance:** the caravan hint matches the clock in en, es and ja; the strings use only the bitmap font's glyphs
  (`localization.test.ts`, `cjk-budget.test.ts`); the boss rush clears in god mode within its budget; only
  `zone-a-caravan` moves (if the clock changed).
- **Token:** SCENES, STRINGS (implies FINGERPRINTS), LAND (if the clock changed).
- **Traps:** ticks never scale; a text change must fit its panel in all three languages (`ui-layout-frame.test.ts`
  under `packages/core/test/ui`); likely a no-op if the report keeps 3 min.
- **Docs needs:** the caravan and boss-rush notes for `docs/client/extra-modes-and-replays.md`.

## Reviews

- `R6-01.B3a.RV` … `R6-01.B3i.RV`: on the branch, before the LAND — the diff touches only the zone's score and
  density fields, every change traceable to the report (or an owner override), the contract green.
- `R6-01.B4.RV`: the tables equal content, the re-bless reason, nothing outside the global section changed.
- `R6-01.B5.RV`: the clock and its strings agree; the scope.
- `R6-01.RV`: the step review over B1 … B5 — the report's proposals all applied or explicitly declined.
- Every loop: a new reviewer each round, until zero findings, nits included.

## Docs item

### W14.DOCS-A — The plan and the changelog

- **Depends on:** R6-01.B5 and `R6-01.RV` at zero.
- **Goal:** R6-01's As built (the changed numbers, the re-bless reasons, the owner's overrides if any) and Manual
  list (the owner's play sessions); §17 R6-01 → `done (owner parts pending)`; CHANGELOG; `python3 .claude/plan_board_v2.py`.
- **Files (only these):** `plan_resolution.md` (R6-01, §17), `CHANGELOG.md`. **Token:** PLAN.

### W14.DOCS-B — Difficulty, scoring and the extra modes

- **Files (only these):** `docs/dev/difficulty-and-rank.md`, `docs/dev/death-and-scoring.md`, `docs/client/controls.md`
  and `docs/client/README.md` (their difficulty notes only), `docs/client/extra-modes-and-replays.md` (the caravan,
  the boss rush).
- **Tests:** none.

### W14.DOCS-RV — Review of the docs item

- The loop to zero, as in every wave.

## Exit check

1. `origin/master` holds the nine B3 LANDs, B4's global re-bless and B5 (or its "no change" report).
2. `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/release-audit.test.ts test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts test/playtest/boss-rush.test.ts`
   and `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/config packages/core/test/rank packages/core/test/scoring`.
3. `pnpm content:check`.
4. The docs review at zero; §17 and the board synced.
5. A CI look at most. **Deferred to wave 15:** the whole `pnpm test`, `pnpm test:e2e`, `pnpm bench`.

## Owner (Manual) — never blocks this wave

- Play sessions over every route with both ships; send notes (they become a follow-up subtask, or v2.0.x work).
