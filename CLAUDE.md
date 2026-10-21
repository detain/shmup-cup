# Shmup Cup

TypeScript 2D horizontal shoot-'em-up for **Samsung Tizen 5.5 TVs** (Chromium 69), plus LG webOS 5+ TVs, browser and Electron. pnpm 12 workspace + Turborepo. On `master` every `package.json` says `2.0.0-alpha.0` (the Tizen `config.xml` and webOS `appinfo.json`: `2.0.0`); `v1.x` carries `1.0.1-dev`.

**Two release lines:**
- **v2 is in development on `master`:** the 640×360 remaster. Its plan, decisions and step status (§17) are in **`plan_resolution.md`**.
- **v1 (384×216) is released** as tag `v1.0.0` and maintained on the **`v1.x`** branch (fixes only, never resolution / art / level changes). Its finished plan is `docs/old/shmup_plan.md` (status `docs/old/shmup_progress.md`); the feature catalog `docs/old/shmup_feat.md` and platform research `docs/old/shmup_tech.md` still apply to both.

## v2: the 640×360 remaster

- **Target:**
  - internal frame **640×360** (×3 on 1080p, ×2 on 720p, ×4 on 1440p, ×6 on 4K);
  - every world-pixel value **×1.5** — lengths, positions, speeds, radii, accelerations — written in code since R2-02's port as `v1 × WORLD_SCALE` (3/2; an absolute world y takes `+ WORLD_TOP_PAD` 36, a y above the top edge the scale alone). Ticks, angles, counts and scores do not change;
  - **12-px** tiles and **12-px** HUD bars, so the playfield is **640×336**;
  - font cell ≈ 9×12;
  - all art redone much more detailed (AI-assisted through `art-prompts/`, then cleaned into pixel art, by the rules of `docs/dev/art-bible-v2.md`) and every level expanded.
- **Since `72b18a1` (R2-01's flip) the code runs at 640×360 on `master`:** `FRAME_W` / `FRAME_H` 640 / 360, `HUD_BAR_HEIGHT` and `TILE_SIZE` 12 (playfield 640×336, `HUD_BOTTOM_Y` 348), the font metrics `GLYPH_W` / `GLYPH_H` / `LINE_H` 9 / 12 / 15 and `ART_SCALE` 3/2 — the interim art, v1's sprites and font ×1.5 (the UI's art-sized values scale through `core/ui` `uiPx`) — all in `packages/core/src/config/index.ts`, mirrored by `scripts/frame.mjs` and `apps/electron/src/main/window-state.ts`. Replays are format 2 (`REPLAY_FORMAT_VERSION`, `RUN_REPLAY_FORMAT_VERSION`: a v1 recording is refused with `ReplayVersionError`), saves format 3 (`SAVE_VERSION`: v1's hi-score tables kept read-only under `legacyScores`). **R2-02's port is done** (`8dbe858`): the world is ×1.5 — the content is ported (12-px tiles, ported positions and speeds), `TILE_SIZE` 12 in code and content alike, `SPAWN_LEAD` 664 (`PLAYFIELD_W + 16 · WORLD_SCALE`), and code world values are `v1 × WORLD_SCALE` (+ `WORLD_TOP_PAD` for an absolute world y). The goldens and attract demos are current v2 recordings: `R2-03.G1` (`d4ba9e8`) re-blessed the 62 goldens and re-recorded the 10 demos at 640×360, replay format 2. `pnpm golden:update` re-blesses them whenever a step changes the simulation on purpose — say why in the commit; never edit the files by hand. Only the v1-baseline fixtures (`test/golden/v1-baseline*`, `fixtures/v1-baseline/`) stay v1 recordings **by design**: they are the comparison kit's input, not the game's recording.
- **No literal frame numbers:** every frame-dependent number derives from those constants (Node scripts take them from `scripts/frame.mjs`). The scans — core: `packages/core/test/frame-literals.test.ts`, everything else: `test/integration/frame-literals-repo.test.ts` — fail on `384` / `216` / `200` / `208` / `192` / `108` and, since the flip, on `640` / `360` / `336` / `348` outside their allow-lists (`docs/dev/conventions.md` § Frame numbers). The presentation, content-DB and shell frame fingerprints are re-pinned only by a step that changes what is drawn on purpose.
- **Self-expiring gates are gone.** All three of the flip's gates — `CONTENT_PORT_PENDING`, `GOLDENS_STALE` (`test/golden/stale.ts`) and the e2e twins `R2_03_PENDING` / `PORT_UNMEASURED` (`test/e2e/gates.ts`) — expired with R2-02's port and R2-03.G1's re-bless (`d4ba9e8` deleted the helpers, `test/integration/e2e-gates.test.ts` and the `golden:update` refusal). `docs/dev/conventions.md` § Frame numbers keeps the full story. The law stands: a failure that comes from a test's own fixture is fixed, never gated.
- **Frame ≠ world:** 640×360 is ×5/3 of the old frame, but the world is only ×1.5. Values anchored to a screen edge ("one playfield", "just past the right edge", the screen centre) are re-derived from the new frame, never multiplied by 1.5 (`plan_resolution.md` §2.6).
- **Step workflow:** steps are `### R<n>-<nn> — <Title>` sections of `plan_resolution.md`. After a step, its row in §17 is set (in the v2 run by the wave's docs agent `Wnn.DOCS-A`) and the orchestrator resyncs the board with `python3 .claude/plan_board_v2.py` in the main checkout `/home/sites/shmup-cup` — the script is git-ignored, exists only there and reads §17 from `origin/master`, so the row is pushed first; agents never run it (GitHub milestones R0–R6, issues #47–#83 — #83 is R0-04, label `v2`).
- **Schedule:** the remaining steps run in the waves of `plan_resolution.md` §18 ("Execution waves for the ~10-agent run"), with their work orders in `docs/v2-run/` (index `docs/v2-run/README.md`); the driver prompt is `prompt_resolution.md`.
- **Benchmarks don't block:** the TV benchmarks (384×216 / 640×360 / 960×540, R0-02/R0-03) never block a step; they set budgets.
- **Art round (R0-04):** tooling in `art-prompts/v2/` (`manifest.json`, `gen-candidate.mjs`, `server.sh`), runbook `docs/dev/art-generation-server.md`. **Never stop SGLang on skynet2 by name or GPU — the main LLM runs there too; use `server.sh stop`.**

## Commands

```bash
pnpm install --frozen-lockfile
pnpm dev                 # turbo run dev --filter=@shmup/web
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Focused loops:

```bash
pnpm content:check       # test/integration/content.test.ts + the nine content-zone-a…i.test.ts over content/**
pnpm test:integration    # vitest --project integration
pnpm test:e2e            # needs: pnpm exec playwright install --with-deps chromium firefox
pnpm golden:update       # scripts/golden-update.mjs re-blesses test/golden/*.replay.json and re-records content/demos/*.replay.json
pnpm assets              # scripts/assets/pipeline.mjs -> atlas + manifest
pnpm bench               # test/bench/vitest.config.ts (not part of pnpm test)
pnpm bench:tv            # the TV render bench widgets -> apps/{tizen,webos}/dist-bench/ (R0-02; packaging is the owner's)
```

Platform builds and release helpers:

```bash
pnpm --filter @shmup/tizen build       # TV .wgt bundle, then apps/tizen/scripts/check-bundle.mjs size budgets
pnpm --filter @shmup/tizen build:dev   # TV debug build (debug tools behind Pause, Ch+ x3)
pnpm --filter @shmup/webos build       # LG webOS bundle, then apps/webos/scripts/check-bundle.mjs (Tizen budgets + appinfo.json)
pnpm --filter @shmup/electron package  # desktop installers into apps/electron/release/ (never in CI)
pnpm store:assets        # scripts/store-assets.mjs -> TV/desktop icons + store-listing placeholders
pnpm itch:package        # scripts/itch-package.mjs -> the web build as one itch.io ZIP (never run here)
pnpm clean               # scripts/clean.mjs: dist/ coverage/ .turbo/ everywhere
```

## Layout

- **Sim (pure)** `packages/core/src/` — `world/index.ts` `player/index.ts` `enemies/index.ts` `bullets/index.ts` `bosses/index.ts` `blackhole/index.ts` `powerups/index.ts` `stage/index.ts` `scenes/index.ts` `scenes/run.ts` `scoring/index.ts` `save/index.ts` `config/index.ts` `events/index.ts` `debug/index.ts` `behaviors/index.ts` `data/index.ts` `data/campaign.ts` `replay/demo.ts` `ui/strings.ts`; barrel `packages/core/src/index.ts`.
- **Presentation** `packages/render-pixi/src/index.ts` + `packages/render-pixi/src/effects/` (PixiJS v8; `mode7.ts`, `crt.ts`, `shaders.ts`) · `packages/audio-web/src/` (incl. `packages/audio-web/src/tracker/index.ts`) · `packages/input-web/src/index.ts` · `packages/shell/src/index.ts` + `packages/shell/src/loader/index.ts` (shared browser host).
- **Apps** `apps/web/src/main.ts` · `apps/tizen/src/main.ts` (`apps/tizen/public/config.xml`, `apps/tizen/scripts/check-bundle.mjs`, `apps/tizen/vite.config.ts`) · `apps/webos/src/main.ts` (`apps/webos/public/appinfo.json`, `apps/webos/scripts/check-bundle.mjs`, `apps/webos/vite.config.ts`) · `apps/electron/` (`electron-builder.json`, `apps/electron/build/icon.png`, `apps/electron/src/main/steam.ts`).
- **Data** `content/` — `stages/` `enemies/` `weapons/` `patterns/` `paths/` `tilesets/` `campaign/` `rules/` `strings/` (`en`, `es`, `ja`) `demos/` `audio/` `input/` `player/` `fx/`.
- **Tests** `test/integration/` `test/golden/` `test/playtest/` `test/e2e/` `test/bench/` `test/scripts/` plus `packages/*/test/`.
- **Tooling** `scripts/assets/procedural/*.mjs`, `scripts/content/tiled-import.mjs`, `scripts/content/rescale.mjs` (R1-03: the unit-driven ×k content port; R2-02 ran it for real at `8dbe858`. Its defaults are v2's geometry now, so `node scripts/content/rescale.mjs --factor 1 --dry-run` is the identity check), `scripts/frame.mjs` (the scripts' pinned copy of the frame constants), `scripts/store-assets.mjs`, `scripts/itch-package.mjs`, `tools/input-probe/`; `art-prompts/` (the AI art prompt library, `generate.mjs` and its committed outputs — standalone, outside the workspace, not linted or formatted); `art-prompts/ingest/` (the R3-02 ingest tool, own npm project: `npm ci && npm test`, `node art-prompts/ingest/ingest.mjs [--check]`; guide `docs/dev/real-assets.md`).
- **Ambient types** `types/` — declarations for the Vite virtual modules (`virtual:shmup-content`, `virtual:shmup-assets`, and since R1-05 `virtual:shmup-assets-inline`) plus `types/build-info.d.ts` for the build-info defines `__SHMUP_DEV__`, `__SHMUP_BUILD__`, `__SHMUP_LIVE_RELOAD__`; `turbo.json` lists `types/**` in `globalDependencies`, so touching it re-runs typecheck everywhere.
- **Config** `pnpm-workspace.yaml` (version catalog) · `turbo.json` · `vitest.config.ts` · `vitest.shared.ts` · `vite.shared.ts` · `tsconfig.base.json` · `eslint.config.js` · `.github/workflows/ci.yml` · `opencode.json` (opencode v2 reads `AGENTS.md` only, so its `instructions` hand every opencode session this file, `docs/dev/conventions.md` and `docs/dev/repo-layout.md`).

## Non-negotiables

- `@shmup/core` is platform-agnostic and deterministic: no DOM/Node globals, no `Math.random`/`Date.now`, no `Math.sin`-family or `**`. Enforced in `eslint.config.js` (which ignores `tools/`, `art-prompts/`, `.claude/`, `.caliber/`, `.playwright-mcp/`).
- Zero allocation in per-tick / per-frame paths; guards use `packages/core/test/helpers/alloc.ts`.
- Shipped code must run on Chromium 69 — and, since `apps/webos` targets webOS 5, really on Chromium **68** (`test/integration/tv-engine-floor.test.ts`); both TV bundles are one classic ES2018 IIFE.
- Original names, art and music only. Placeholder art is generated by committed scripts. In v2, real art arrives as committed PNG sources under `assets/source/` made by the ingest tool (R3-02), each with a provenance record (`.art.json`: model, prompt, seed, source hash).
- Commit style: imperative subject, `docs:` / `build(tizen):` prefixes as in `git log`.
- **Where to push:**
  - v2 work goes to `master`;
  - v1 fixes go to `v1.x` first;
  - merge `v1.x` → `master` until R2-01 lands, and only cherry-pick code fixes (`git cherry-pick -x`) after it;
  - CI runs on pushes to both branches.

## Deep docs

The docs below were written for v1 and quote its numbers: 384×216, 8-px tiles, 8-px HUD bars, the 6×8 font, D19 / D20. Their rules still hold; where a number differs, `plan_resolution.md` wins on `master`. R2-03 updated them in wave 6; what remains of that work is the player-facing `docs/client/` pages' refresh cadence, which follows each step that changes what the player sees.

@./docs/dev/conventions.md
@./docs/dev/repo-layout.md

See also `docs/dev/architecture.md`, `docs/dev/api-reference.md`, `docs/dev/build-test-deploy.md`, `docs/dev/content-data.md`, `docs/dev/debug-and-replays.md`, `docs/dev/input_probe_spec.md`, and player-facing `docs/client/`.

## MCP

A `searxng` MCP server is configured for web search when researching Tizen/Pixi APIs; prefer `docs/dev/*.md` and `docs/old/shmup_tech.md` first.

<!-- caliber:managed:pre-commit -->
## Before Committing

**IMPORTANT:** Before every git commit, you MUST ensure Caliber syncs agent configs with the latest code changes.

First, check if the pre-commit hook is already installed:
```bash
grep -q "caliber" .git/hooks/pre-commit 2>/dev/null && echo "hook-active" || echo "no-hook"
```

- If **hook-active**: the hook handles sync automatically — just commit normally. Tell the user: "Caliber will sync your agent configs automatically via the pre-commit hook."
- If **no-hook**: run Caliber manually before committing:
  1. Tell the user: "Caliber: Syncing agent configs with your latest changes..."
  2. Run: `caliber refresh && git add CALIBER_LEARNINGS.md CLAUDE.md .claude/ 2>/dev/null`
  3. After it completes, briefly tell the user what Caliber updated. Then proceed with the commit.

**Valid `caliber refresh` options:** `--quiet` (suppress output) and `--dry-run` (preview without writing). Do not pass any other flags — options like `--auto-approve`, `--debug`, or `--force` do not exist and will cause errors.

**`caliber config`** takes no flags — it runs an interactive provider setup. Do not pass `--provider`, `--api-key`, or `--endpoint`.

If `caliber` is not found, tell the user: "This project uses Caliber for agent config sync. Run /setup-caliber to get set up."
<!-- /caliber:managed:pre-commit -->

<!-- caliber:managed:learnings -->
## Session Learnings

Read `CALIBER_LEARNINGS.md` for patterns and anti-patterns learned from previous sessions.
These are auto-extracted from real tool usage — treat them as project-specific rules.
<!-- /caliber:managed:learnings -->

<!-- caliber:managed:model-config -->
## Model Configuration

Recommended default: `claude-sonnet-4-6` with high effort (stronger reasoning; higher cost and latency than smaller models).
Smaller/faster models trade quality for speed and cost — pick what fits the task.
Pin your choice (`/model` in Claude Code, or `CALIBER_MODEL` when using Caliber with an API provider) so upstream default changes do not silently change behavior.

<!-- /caliber:managed:model-config -->

<!-- caliber:managed:sync -->
## Context Sync

This project uses [Caliber](https://github.com/caliber-ai-org/ai-setup) to keep AI agent configs in sync across Claude Code, Cursor, Copilot, and Codex.
Configs update automatically before each commit via `caliber refresh`.
If the pre-commit hook is not set up, run `/setup-caliber` to configure everything automatically.
<!-- /caliber:managed:sync -->
