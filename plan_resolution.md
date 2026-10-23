# Shmup Cup v2 — the 640×360 remaster plan

> **Status:** drafted 2026-10-16; updated 2026-10-18 — **10 of 37 steps done** (R0-01, R0-02, R1-01, R1-02, R1-03, R1-04,
> R1-05, R3-01, R3-02, R3-05 — owner parts pending for R0-01, R0-02, R1-05, R3-01, R3-02 and R3-05), 2 in progress
> (R0-04; R2-01 — its docs pass is §18's wave 1). The `v1.x`
> maintenance branch exists (created from the `v1.0.0` tag, commit `f82e183`, and pushed to `origin`). Everything
> below happens on `master`, which from now on is the **v2** line.
>
> **What v2 is:** the same game re-based on a **640×360** internal frame (from 384×216). Every world-pixel
> quantity is scaled **×1.5**, **all art is redone and made much more detailed** (AI-assisted, then cleaned into
> real pixel art), and **every level is expanded**. **v1.x stays at 384×216 for good.**
>
> Companion docs: [`docs/old/shmup_plan.md`](docs/old/shmup_plan.md) (the v1 plan; its §1.3 definition of done
> and §1.5 conventions still apply), [`docs/old/shmup_feat.md`](docs/old/shmup_feat.md),
> [`docs/old/shmup_tech.md`](docs/old/shmup_tech.md),
> [`docs/dev/render-performance-review.md`](docs/dev/render-performance-review.md) §7 (the earlier
> "what if the resolution changes" note — this plan supersedes its 768×432 suggestion for a real redo),
> [`docs/dev/conventions.md`](docs/dev/conventions.md), [`docs/dev/repo-layout.md`](docs/dev/repo-layout.md),
> [`art-prompts/`](art-prompts/) (the AI art prompt library and its outputs).

## Table of contents

1. [Summary of decisions](#1-summary-of-decisions)
2. [Why 640×360 and a ×1.5 world](#2-why-640360-and-a-15-world)
3. [Versions and branches](#3-versions-and-branches)
4. [How this plan is executed](#4-how-this-plan-is-executed)
5. [Milestones at a glance](#5-milestones-at-a-glance)
6. [R0 — Branches, versions and the TV benchmark](#6-r0--branches-versions-and-the-tv-benchmark)
7. [R1 — A resolution-independent engine (no visible change)](#7-r1--a-resolution-independent-engine-no-visible-change)
8. [R2 — The switch: 640×360 with the ×1.5 port](#8-r2--the-switch-640360-with-the-15-port)
9. [R3 — The art pipeline for detailed, AI-assisted art](#9-r3--the-art-pipeline-for-detailed-ai-assisted-art)
10. [R4 — The shared art redo](#10-r4--the-shared-art-redo)
11. [R5 — Zone remasters: new art and expanded levels](#11-r5--zone-remasters-new-art-and-expanded-levels)
12. [R6 — Balance, performance and v2.0.0](#12-r6--balance-performance-and-v200)
13. [The benchmarks: what they measure and how the results are used](#13-the-benchmarks-what-they-measure-and-how-the-results-are-used)
14. [Risks and fallbacks](#14-risks-and-fallbacks)
15. [Appendix A — what is coupled to 384×216 today](#15-appendix-a--what-is-coupled-to-384216-today)
16. [Appendix B — the ×1.5 port table](#16-appendix-b--the-15-port-table)
17. [Progress](#17-progress)
18. [Execution waves for the ~10-agent run](#18-execution-waves-for-the-10-agent-run)

---

## 1. Summary of decisions

| ID | Decision | Notes |
|---|---|---|
| **R-D1** | Internal frame **640×360** | Scales by a whole number on every display we ship to: ×3 on 1920×1080 (the M7s, LG sets), ×2 on 1280×720 (Full HD Samsung sets), ×4 on 1440p, ×6 on 4K. Replaces D19 (384×216). |
| **R-D2** | World scale **k = 1.5** | Every world-pixel length, speed, acceleration and radius is ×1.5. Times (ticks), angles, counts and scores do not change. |
| **R-D3** | HUD: two **12-px bars**, playfield **640×336** (screen y 12…347) | Replaces D20 (two 8-px bars, 384×200). The playfield shows **≈ 427×224 of today's pixels** (+11 % wide, +12 % tall). |
| **R-D4** | Terrain tiles **12 px** (from 8) | 8 × 1.5 is exact, so every tilemap ports cell for cell. The visible grid is 54×28 tiles. |
| **R-D5** | Bitmap font cell **≈ 9×12** (from 6×8) | Final cell (8×12 or 9×12) chosen in R4-03; R2 uses an interim ×1.5 font. All 195 glyphs (ASCII, Spanish Latin-1, 84 katakana) are redrawn. |
| **R-D6** | **All art is redone and much more detailed** | AI-assisted (the `art-prompts/` library) for backgrounds, bosses, large enemies, key art and ending scenes. Small, readability-critical sprites (ship, bullets, items, font) are hand-finished pixel art, with AI used as concept reference only. See R3. |
| **R-D7** | **Every level is expanded** | Zones go from ~3.1–3.6 min to ~4.5–5.5 min each (feat §14 allows 3–6), with new sections, set pieces, enemies and parallax depth. See R5. |
| **R-D8** | **`v1.x` branch stays at 384×216**; `master` is v2 | v1.x gets fixes only. v2 ships as an update of the same app ids, so saves carry over. See §3. |
| **R-D9** | **TV benchmarks at 384×216, 640×360 and 960×540 inform but never block** | R0-02 builds a benchmark that runs on the M7. Whatever it measures, R1 onward proceeds; the numbers set budgets and pick mitigations. See §13. |
| **R-D10** | 60 Hz fixed tick, determinism, the Chromium 68 floor, zero allocation per tick/frame, remote-first input: **unchanged** | All v1 non-negotiables (CLAUDE.md, `conventions.md`) still hold. |

### Decisions made while the plan runs

Smaller decisions taken during execution, so the steps that rely on them can cite them. **O1–O10** are the
wave-2 scout's recommendations for R1-02 … R1-04, put to the owner as the defaults and adopted on 2026-10-17
without objection; **O11** came out of R1-03's review and is built as the default while the owner confirms it;
**W1-D1 … W1-D3** are the orchestrator's wave-1 decisions (named D1–D3 in its notes — not v1's design decisions
D1 …); **W3-1 … W3-12** are the orchestrator's wave-3 decisions for R1-05 and R3-05 part 2 — the wave-3 scout's
recommended defaults, adopted and told to the owner, none blocking. **W4-1 … W4-14** are the orchestrator's
wave-4 decisions for R2-01 and **W5-6** the wave-5 confirmation its C5 loop closed on; all fifteen are
built, as R2-01's As built records. **W5-1 … W5-19** are the orchestrator's wave-5 decisions for R2-02,
R3-03 and R3-04 — the wave-5 scout's recommended defaults, the rows saying so confirmed by the owner on
2026-10-19 — **R2-N1 … R2-N4** are execution-shape decisions from the R2 re-plan (N1 … N3 built by R2-02,
N4 by R2-03), **RR-7** and **RR-8** are the R3 re-plan's stand-in decisions and **RR-3** its store-icons
deferral, worked at R2-03.I2; all are built, as R2-02's, R3-03's, R3-04's and R2-03's As built records.
**R5-D1 … R5-D9** are the R5 / R6 re-plan's decisions, their definitions in
[`docs/v2-run/decisions.md`](docs/v2-run/decisions.md) §6: **R5-D2**, **R5-D5** and **R5-D9** were built
early by RUN-7's fold into R2-03's wave, and the rest were built by the wave-10 pilot and its prep —
zone A's LAND (`9d0b472`) is the flow's record, R5-01's As built and §11's wave-10 block are the entries.
**R6-D1 … R6-D3** are adopted defaults that wait on their R6 waves. **W5-20** is the owner's
graphics-options directive of 2026-10-20,
worked into the plan as R6-04 by that directive's own order. **R2-N5 … R2-N8** complete the R2 re-plan's
register: N6 was built in R2-02's kit flip, N5, N7 and N8 were built at R2-04 (N7's owner's feel stays open
until the M7 play session). **RR-1** … **RR-6** are the R3 / R4 re-plan's art-pipeline, font, provenance,
store, sequencing and layer decisions: RR-1 / RR-1a / RR-1b were built by `R4-P.P3` (2026-10-20),
RR-2 and RR-4 were built by the R4 round itself (the font by `R4-03.C1 … C4b`, every art commit drawn under the
provenance rule — §10's As built entries), RR-3's one move was paid at `R4-05.E5`, RR-5's prep ran in wave 7 as
`R4-P` (§10's prep note), and RR-6 was built by `R3-06.L2` (2026-10-20) — all as records of those steps' As built.

| ID | Decision | Applies to |
|---|---|---|
| **O1** | Audio fields get their own units — `hz`, `seconds`, `semitones`, `samples` — all never rescaled | R1-03, R2-02 |
| **O2** | More units: `seed`, `version`, `index` (never rescaled); `texels` (Mode-7 `height` / `fogDepth`) and `tile-px` (mask entries) follow the art (×1.5 / resampled). Camera **`yTo`** was first to be re-derived from the frame ("one playfield", §2.6); **revised the same day after R1-03's review: `yTo` is `rel-px`, ×k with no pad** — with the 3 pad rows the deepest camera position ports exactly (`12·(rows + 3) − 336 = 1.5·(8·rows − 200)`), the floor stays on the bottom edge and it agrees with the raid camera offsets; zone D's 50-row map becomes 53 rows (not 56) and its `yTo` 200 → 300 (gimmick-range's 72 → 108). This replaces §2.6's "zone-d `yTo 200` = one playfield" and R2-02's hand fix of zone D's `yTo` | R1-03, R2-02 |
| **O3** | `screen-x` / `screen-y` values snap to the nearest of start, centre or end of the frame and keep their distance ×k — which reproduces §2.6 (400 → `W + 24`, boss 296 → `W − 132`, boss y 100 → 168, Mode-7 bottom 200 → 336); the tool lists every value it moves. **Since R1-03's review O3 no longer covers parallax band rows:** `parallax[].y` has its own unit `band-y` and is placed with the stage's whole backdrop from the bands' art heights (`rescaleBackdrop` — stacks stay closed, bottom bands stay on the bottom edge), raster rows follow the band edges they bound, and a lone `band-y` falls back to the snap. A block's (and a ground enemy's) `screenX` still snaps, but ports together with its event's `x` (a world sum — R1-03's As built) | R1-03, R2-02 |
| **O4** | Integer fields that turn fractional at ×1.5 (`spacing`, `wrap`, `yOver`, raster `bands`) are rounded and each one listed; the schema is never relaxed | R1-03, R2-02 |
| **O5** | Behaviour tunables' units live in a separate `BEHAVIOR_PARAM_UNITS` table (`behaviors/units.ts`), not in 45 `defineBehavior` signatures | R1-03 |
| **O6** | R1-03's acceptance also requires `rescale --factor 1.5 --top-pad 36 --dry-run` to report zero unclassified values | R1-03 |
| **O7** | R1-04's 12-px tile and 9×12 font checks run in Node; the browser check moves to R2-01 (the font) and R2-03 (12-px terrain) | R1-04, R2-01, R2-03 |
| **O8** | Frame mirrors outside the workspace graph (Electron's window state, `scripts/frame.mjs`) are pinned by tests; no new dependency, no lockfile change | R1-02 |
| **O9** | e2e and doc screenshots capture at `floor(1280 / FRAME_W)` × the frame — 1152×648 now, 1280×720 in v2 (pending the owner's optional wish for 1080p) | R1-02, R2-03, R4-05 |
| **O10** | The tile-size schema range is the set {8, 12} (`MIN_TILE_SIZE` / `MAX_TILE_SIZE`) | R1-04 |
| **O11** | **Ground-enemy spawns keep their terrain spot:** a `spawn` / `formation` event whose enemy has a `ground` anchor ports its `x` and `screenX` as one world x (`x + screenX` ×k, only the column snaps — the `ground-enemy` world-sum pair of `core/data`), so the enemy stands on the same terrain and appears 64 px of camera travel earlier than ×k, like the terrain under it; R2-02's first-visible-tick comparison exempts these spawns. The alternative was to **keep their timing** (`x` ×k alone), which would put 114 of the 146 shipped ground spawns on another terrain height. **Default adopted (R1-03, `277c709`), pending the owner's confirmation**; overturning it is the pair's one-line condition plus a re-run of the tool | R1-03, R2-02 |
| **W1-D1** | The owner approved one `v1.x` commit (versions → `1.0.1-dev` …) by its own agent, then `git merge -s ours` of `v1.x` into `master`; a second owner-approved `v1.x` docs commit went the same way (§3.3, R0-01's As built) | R0-01 |
| **W1-D2** | R0-01's builder may edit the version lines of `CHANGELOG.md`, `README.md` and `docs/client/README.md` its tests need and add "Release lines" to `build-test-deploy.md` — nothing else in those files | R0-01 |
| **W1-D3** | R3-02 builds and tests the ingest tool on fixtures only; the real ingest of the round-2 winners is deferred (after the FLUX decision) | R3-02 |
| **W3-1** | **Ship the zone split in the real atlas now:** a content-derived `assets/source/atlas-groups.json` (≈ 10 pages — `common` + one per zone), so the residency is real in every build and e2e (not a test-only split) | R1-05 |
| **W3-2** | Residency policy **"all"**: `keepPageImages` stays true, every page's decoded image stays, the GPU copies follow the zone and are **uploaded eagerly** at the transition; the lazy "resident" policy (scout B3b: deferred pages, a hold, a re-fetch after context loss) is built when the estimate crosses the budget — R3-04 at the latest | R1-05, R3-04 |
| **W3-3** | **Lossless automatic PNG-8** (≤ 256 RGBA colours) for **atlas pages only**; doc and store images keep their bytes; never lossy | R1-05 |
| **W3-4** | `DIST_BUDGET` **stays 8 MiB**, its derivation documented; R3-04 sets the v2 value from measured stand-in art | R1-05, R3-04 |
| **W3-5** | Audio budget **24 MiB** (worst zone ≈ 17.8 MiB); the texture budget is **derived from the frame** — 100 − 24 heap − 24 audio − the fixed targets at 1080p: 26 MiB at 384×216, 23 MiB at 640×360 | R1-05, R2-01 |
| **W3-6** | **Instrument the atlas load now** (per-page fetch / decode / upload ms at boot and zone load, as canvas attributes the owner reads in a `build:dev` on the M7), and add the TV bench's decode scenario (B4) since R0-03 has not run yet | R1-05, R0-03, R3-04 |
| **W3-7** | The atlas manifest is fetched by **XHR from `file://`** on Tizen and webOS (unverified on hardware); the inline module `virtual:shmup-assets-inline` is the one-line fallback; the owner checks that the M7 boots to the title | R1-05 |
| **W3-8** | R3-04's "`common` ≤ 1 + zone ≤ 2 pages" at 2048² (48 MiB) is **restated in bytes**: a zone's GPU pages + kept images ≤ `TEXTURE_BUDGET_BYTES` (amended in R3-04's scope) | R3-04 |
| **W3-9** | A **shell-side World-change trigger** for the residency (the attract demo, a replay — no `PrepareStage`); no core change | R1-05 |
| **W3-10** | Origin report: `use: "reference"` with cleanup `none` / `light` **fails** (the pixels are largely the model's); `heavy` / `redrawn` pass | R3-05 |
| **W3-11** | Origin report: a shipped `ai-assisted` record with `reviewed: null` **fails**; staged art only warns | R3-05 |
| **W3-12** | Origin report: pixel maps, the font, generators and their siblings are **`procedural`** (agent authorship is store-disclosure decision 8); no root `package.json` script — `node scripts/art-origins.mjs`, CI through vitest | R3-05 |
| **W4-1** | Self-expiring gates instead of a red window: `CONTENT_PORT_PENDING` (until R2-02) and `GOLDENS_STALE` (until R2-03), each throwing at import once its condition is gone; a failure that comes from the test's own fixture is fixed, never gated | R2-01, R2-02, R2-03 |
| **W4-2** | Prepare at 384×216 and flip last, in one atomic commit (`72b18a1`) — everything buildable before the flip lands at the old frame first | R2-01 |
| **W4-3** | The interim art size is core's `ART_SCALE` (1 → 3/2 at the flip) with `core/ui`'s `uiPx(v)` for art-sized UI values; the font pin is the font file × `ART_SCALE` | R2-01 |
| **W4-4** | The interim font is the 6×8 font upscaled ×1.5 at **pipeline time** (9×12, line 15) — no new font file until R4-03 | R2-01 |
| **W4-5** | Never upscaled: the terrain tilesets (`terrain.mjs` draws at `TILE_SIZE`), the `ui/pixel` sheet, real-art PNG overrides and `native: true` sources. Amended by `16aff20`: the laser beams are drawn natively at the art scale | R2-01 |
| **W4-6** | The TV bench's atlas, the CJK budget figures, the store icons and the doc images keep the v1 art (`artScale: 1`): the bench **for good**, the rest until R2-03; the store icons until R4-05 (RR-1, RR-3) | R2-01, R2-03, R4-05 |
| **W4-7** | A v1 replay raises `ReplayVersionError` and the browser shows **V1 REPLAY** / "recorded by v1: cannot play"; the entry is deleted by hand, never automatically | R2-01 |
| **W4-8** | `legacyScores` has no UI in R2-01; Steam achievements read `hiScores ∪ legacyScores` | R2-01 |
| **W4-9** | The attract demos stay stale recordings until R2-03: the attract loop skips the demos the build refuses | R2-01, R2-03 |
| **W4-10** | Electron's `window.json` is version 2; a v1 file's scale converts as `max(1, round(scale × 384/640))`, keeping the window's physical size | R2-01 |
| **W4-11** | The frame-literal allow-lists take the tick timers, the angle 640, `BENCH_SIZES` and the particle degrees; the boot overlay's fallback derives from the frame; the scanner skips `#rrggbb` / `#rrggbbaa` strings | R2-01 |
| **W4-12** | The menu / HUD / boot / options e2e specs must pass at 1280×720 on the interim art; the content- and golden-backed specs are gated until R2-03 | R2-01, R2-03 |
| **W4-13** | v1's hi-score tables are archived under `legacyScores` on the 2 → 3 migration; v2's tables start empty | R2-01 |
| **W4-14** | A `v1.x` build reading a format-3 save falls back to defaults — no back-migration, no rewrite | R2-01, `v1.x` |
| **W5-1** | World values reach ×1.5 through core `WORLD_SCALE` (1 → 3/2) and `WORLD_TOP_PAD` (0 → 36), written `v1 × WORLD_SCALE`, prepared neutrally at 1 and flipped in the one port commit with the tool output (`R2-02.P0` … `R2-02.S`) | R2-02 |
| **W5-2** | The ship's spawn row `SPAWN_Y` stays the frame centre (168, `PLAYFIELD_H / 2`); tests that park a still ship put it on the enemies' line `v1y(100)` | R2-02 |
| **W5-3** | Hurtbox-inside-art tests allow exactly O4's 1-px rounding, only for the entries the tool's rounded-integers list names (about 20 boxes: F 6, G 7, H 6, I 1) | R2-02, R2-04 |
| **W5-4** | The rescale tests that read the shipped content at v1 geometry are retired (`runIf` content still v1), keeping a factor-1 identity case that also runs on the ported tree | R2-02 |
| **W5-5** | Behaviour and weapon defaults are ported in code, pinned by a v1 snapshot and each unit's rule (`behavior-defaults-port.test.ts`) | R2-02 |
| **W5-6** | The e2e content gate is keyed on R2-03's re-measure, not on `CONTENT_PORT_PENDING`: `PORT_UNMEASURED` holds only from R2-02's port until R2-03, so the specs that pass at 640 on v1 content keep running through R2-02 (built as `test/e2e/gates.ts`, cited there and in `e2e-gates.test.ts`; **implemented in R2-01** as `R2_03_PENDING`, with `PORT_UNMEASURED` added at `293e885` — the wave-5 confirmation closed C5's loop) | R2-01, R2-02, R2-03 |
| **W5-7** | The tool's hand fixes travel in `test/port-v2/handfix.patch`: gimmick-range `events[8].until` 2275, zone-g `events[15]` back inside `events[14]`'s ground window (x ≥ 3450), captain-circler home 530, zone G's rising walls one row up. The hunter-range dive needs **no** content edit: `hunter.option` variant 2 flies to its `world-y` default, which `R2-02.W6` ports to 72, so it lands at ×1.5 + 36 by itself (T3's landing check confirmed it) | R2-02 |
| **W5-8** | Boss `parts[].x/y` bound ±512 → **±768** (×1.5) (`R2-02.W5`) | R2-02 |
| **W5-9** | v2 bullets drawn natively at the bible's sizes (`R3-03.V1`). Its beam half is **moot**: the beams are already native (6×12, 12 frames) since `16aff20` | R3-03 |
| **W5-10** | `@p2` for procedural ships: palette maps that reproduce today's swap exactly; the swap code removed (`R3-03.V2a`) | R3-03 |
| **W5-11** | Real-art tiles: "art clipped to mask" for every tile the heightfield matches by mask; "mask from art" only for name-placed or RLE-only tiles; derived masks reach `content/` only through `tileset-masks.mjs --write` | R3-03 |
| **W5-12** | The palette-cycle scan fails on any near-miss on a cycled layer and on any new project-wide near-miss; the bible's exemption list is pinned in the test | R3-03 |
| **W5-13** | The real-art bullet recolour step is built now and proven on a fixture (`R3-03.V5`) | R3-03 |
| **W5-14** | R3-04's stand-in is a seeded synthetic generator; its calibration on candidates is optional and host-bound (RR-7) | R3-04 |
| **W5-15** | Memory policy for detailed art: build the lazy residency (B3b — decoded images dropped, a context-loss re-fetch); the budget stays derived (23 MiB of GPU pages per zone at 640×360) | R3-04 |
| **W5-16** | `DIST_BUDGET` set from the stand-in projection plus margin — **16 MiB** — derived in `check-bundle.mjs` | R3-04 |
| **W5-17** | Stand-in pages replace the TV bench's synthetic decode pages (RR-8) | R3-04 |
| **W5-18** | Linked and dev stages keep "every page" until R5-10.T8 aliases them | R3-04 |
| **W5-19** | Zone load ≤ 2 s on the M7 estimated from headless Chromium × the R0-02 desktop-to-M7 ratio; flagged unmeasured if the logs are missing | R3-04 |
| **R2-N1** | The two-scale kit (`test/port-v2/`: `two-scale.sh`, `handfix.patch`) is committed by `R2-02.P1` and deleted by the port commit | R2-02 |
| **R2-N2** | At the port, `R2-02.S` stubs `packages/core/test/helpers/port-pending.ts` (`CONTENT_PORT_PENDING = false`, no import-time call); `R2-02.U1` … `U5` delete the wrappers after | R2-02 |
| **R2-N3** | `R2-02.E0` pre-gates every e2e spec that fails under the kit on `PORT_UNMEASURED` (neutral before the port); R2-03 re-measures | R2-02, R2-03 |
| **RR-7** | R3-04's stand-in uses R1-05's assumption — PNG-8 at 0.3–0.6 MB per 2048×1024 page — its constants marked **uncalibrated**; the optional `R3-04.M1c` calibration on candidates is host-bound and has not run | R3-04 |
| **RR-8** | W5-17 kept: one stand-in zone plus `common` replace the TV bench's synthetic `rgba-2048` / `png8-2048` decode pages; `tools/input-probe/results/analyze-bench.mjs` reads the new ids | R3-04 |
| **W5-20** | 2026-10-20, owner directive: v2 gains a **GRAPHICS options page** — `OUTPUT` and `RENDERER` knobs with recommended, good defaults — planned as **R6-04**. The defaults' evidence is the M7 resolution sweep (`tools/input-probe/results/2026-10-19-m7-bench-resolutions/README.md`, §17's R0-03 row): the output size is the lever (640×360-worst two-tick 59.5 % at 1080p output → 11.3 % at 720p → 1.8 % at 540p; synced p95 flat ≈ 12–16 ms across outputs); WebGL 2's 21-better / 0-worse win is a 1080p-fill win only — mixed at 720p, within noise at 540p; native art from 1280×720n up is dead, ≤ 640×360n is fine; the noise floors are the sweep's two-tick spread medians 1.5–2.7 points and synced-p95 spread medians 8–9 % (p90 23–26 %). The defaults: `Auto` everywhere — OUTPUT 1280×720 on the TVs and native on desktop / web, RENDERER WebGL 2 only above the directive's Chromium ≥ 71 floor with the probe as safety net, so both TVs keep WebGL 1, today's shipped default | R6-04, R6-02, §13 |
| **R2-N4** | R2-03 re-measures the content-bound e2e **before** the re-bless, in parallel; `R2-03.G1` is last and one commit | R2-03 |
| **RR-3** | The store icons stay on `artScale: 1` until `R4-05.E5` moves them to the v2 art once — at R2-03 `pnpm store:assets` only `--check`s (R2-03.I2, that step's As built) — built by `R4-05.E5` (`d23fec0`): the icons moved to the v2 art once, as the decision says; `store-assets.mjs` now collects the default (non-1) scale — the final ships (`R4-01.A1a/A1b`), the v2 font (`R4-03.C2`), the v2 logo (`R4-05.E1`) — the four committed icons are the v2 render, `--check` green, and no later step regenerates them until `R6-03.D3` | R2-03, R4-05 |
| **RR-2** | The v2 font cell is **9×12, line 15, advance 9** — today's `GLYPH_W` / `GLYPH_H` / `LINE_H` — so no layout moves at all; built by `R4-03.C1` (`3c8eca8`) as the native sibling `assets/source/fonts/pixel9x12.font.json` (name `pixel`, `native: true`, 195 glyphs — RR-1's font rule: the scale-1 build keeps v1's `pixel6x8`), hand-redrawn by `C2 … C4b`, pinned to core's metrics by `font-v2.test.ts` and the config tests — confirmed by the owner 2026-10-19 | R2-01, R4-03 |
| **RR-4** | Agent-made v2 art draws from the bible text, v1's designs and the palette tables; Qwen-Image, SD3.5 and Wan winners enter only once committed and content-reviewed; never a FLUX winner while FLUX is on hold — adopted (until the FLUX decision); held through all of R4: every shipped R4 commit is a hand-drawn `*.v2.sprite.json` pixel map or a procedural generator (the logo drew from the bible row plus v1's logo, not the key art), no AI winner shipped as art | R4, R5 |
| **R5-D1** | **Parallel zones, one LAND at a time** (overrides §11's "previous zone step" and the pre-re-plan driver's one-sim-changing-lane rule): the zones build in parallel on local branches and land one at a time, on stable content-order-independent hash keys (`R5-P.P1`), the scoped bless `golden:update --only <ids>` (`R5-P.P3`), the fingerprint write mode (`R5-P.P10`) and the land lock; zone A lands first, zone H's echoes wait for A, B, D and F. **Built:** zone A landed first, `9d0b472`, its composite `--only zone-a,bonus-range` bless flowing after the S7.0 guard cure `a089adb`, the weld's land lock held across the whole script | R5, R5-01 |
| **R5-D2** | The v2 zone contract (built as `R5-P.P6`'s `test/integration/zones/zone-<letter>.contract.ts` v2 branches): length 20,000–22,000 px; scroll to WARNING 3.75–5.25 min; the bot's god-mode run 4.0–7.0 min (wave 13's decision R5-D13 widened the ceiling 360 → 420 s globally; every wave-11 measurement ran under 4.0–6.0 min); ≥ 5 checkpoints; 6–8 new enemy types counted by sprite (zones B–I; zone A keeps v1's behaviour count — 6–8 distinct scripts besides the boss); 18–48 capsules before the WARNING; ≥ 3 in every 1,350-px window after a checkpoint; `directItems` from 30; ≤ 2 blue capsules. Wave 10's MF2 adjudication grew the contract an optional `directItemComposition` row — the release audit reads the composition from the zone, not a shared constant (zone A's row `{octagons: 2, maxRare: 3}`, `1f3040c`; every remaster authors its own) | R5, R5-P.P6, R5-01 |
| **R5-D3** | Zone A gets the new tileset **`terrain-azure`**; `terrain-a` stays for the escape, `bonus-vault` and the ranges; `R5-10.T2` adds `escape.mjs` for the escape's look (Q-13, owner-confirmed 2026-10-18). **Built** with `R5-01`: the LAND's groups re-derive demoted `tiles/terrain-a` (with `bosses/maw-pod`) to `common`, and the scale-1 pipeline learned to carry v2-only names as *absent at scale 1* (`732bfe1`, RR-1a's first tileset) | R5-01, R5-10 |
| **R5-D4** | The content-DB fingerprint stays as R2-02 left it and is **re-pinned only by a LAND** — through `R5-P.P10`'s write mode, never by hand. **Built:** zone A's LAND moved its `core.stages`-family rows with the stage rebuild; between LANDs the pin held through the whole `R4` round and wave 10's prep | R5-P, R5, R5-01 |
| **R5-D5** | Capacity: `MAX_BOSS_PARTS` 16 → **24**; `MAX_ENEMIES` 64 and `PARTICLE_CAPACITY` 256 kept unless a design peaks above 80 % of a pool (built early by RUN-7, as `R5-P.P8` inside R2-03) | R5, R2-03 |
| **R5-D6** | **Stand-ins only for new sprite names**; existing sprites stay the interim ×1.5 art until their zone's `S3` real-art drop. **Built:** the wave-10 `S2` legs — zones A (`8810f32`), C (`900d24e`), D (`75fa6d2`), B (`53832f8`) on master, E … I on their branches — shipped every new name's stand-in with no golden, fingerprint or scale-1 digest move | R5 |
| **R5-D7** | A zone that ships with stand-ins is **`done (owner parts pending)`**; its real art drops later as `S3` (the wave-12 template). **Built:** it is §17's R5-01 status since `9d0b472` | R5, §17 |
| **R5-D8** | **One LAND per zone**, reviewed on the local zone branch before it lands (the fixer commits on the branch); `S2` and `S3` push on their own, and an `S3` whose real art changes a frame count is a small LAND of its own from branch `r5/s3-zone-<x>`. **Built:** zone A's loop — seven branch legs, `R5-01.RV` (one critical) → `R5-01.FIX1` (`732bfe1`) → the scoped re-review at zero → the one weld `R5-01.S7` | R5, R5-01 |
| **R5-D9** | `R5-P.P1` runs inside R2-03 (RUN-7) — built in wave 6 (`6ba1187`), its hash shift paid by the step's single re-bless | R2-03, R5 |
| **R5-D13** | **The god-mode zone band ceiling widens 360 → 420 s globally** (adopted 2026-10-23, owner ruling option 2 of zone I's four-option menu): the R5-D2 contract's bot-run window reads 4.0–7.0 min — [240, 360] → [240, 420] s, every zone; the 240 s floor stays (it is also a design floor; nothing measured is near it). Basis: zone I's measured **369.25 s** against the 360 s ceiling with the I6+I7 double-STOP evidence — the fight-adjacent cells behave as ±20 s-class RNG lotteries, and a fuller §8 trim makes the ARK ESCAPE unbeatable at 332.0 s — the band, not the zone, was the wrong number. Executed by the `w13-G1` lane (the contracts, the meta-pin, the golden and playtest ceiling asserts, rule 3 and the docs' law quotes); no banked value, floor or unrelated pin moved; zone I's playtest/golden re-targets and its goldens' re-bless stay I-LAND's own, on settled numbers | R5-09, wave 13 |
| **R6-D1** | The caravan clock stays **3 min** unless `R6-01.B2`'s balance report says otherwise | R6-01 |
| **R6-D2** | `R6-03.D1`'s version bump and the CHANGELOG `[2.0.0]` section land in **one push** by the docs agent (`tooling-config.test.ts` checks the CHANGELOG's first section; precedent W1-D2) | R6-03 |
| **R6-D3** | `gh release create v2.0.0` runs only after the owner's **explicit OK** | R6-03 |
| **R2-N5** | R2-04's sim changes are proposed as patches; one integrator (`R2-04.G`) re-blesses once — wave 7 held: the five patches integrated once at `a285e0e`, `git log d48c0d2..origin/master` over the replay paths names that single commit | R2-04 |
| **R2-N6** | The 15 frame-unit behaviour defaults get literal v2 values in the kit's flip (no v1-geometry helper in core) — built by R2-02 | R2-02 |
| **R2-N7** | `ShakeMagnitude` 1 / 2 / 4 → **2 / 3 / 6** (the plan's "1/2/3" was stale; ×1.5 of v1, halves rounded up) — landed in the one bless `a285e0e`; the owner's feel decides in R2-04's play session | R2-04 |
| **R2-N8** | Every version goes to `2.0.0-alpha.1` before the `v2.0.0-alpha.1` tag (`R2-04.REL`, `5aad58e`: 10 manifests + 3 test pins; the TVs keep `2.0.0`) | R2-04 |
| **RR-1** | **v2 art beside v1; scale 1 stays the v1 art until a v2.0.x clean-up after the release.** A pixel map's v2 version is a sibling `<path>.v2.sprite.json` (native implied, used only at art scale ≠ 1); a generator branches on `options.artScale`; a v2 font is a `"native": true` font file with the same `name`; at scale 1 a PNG override of a name that has a code source is skipped. The digest pin, the TV bench and the CJK figures never move (the store icons only once, at `R4-05.E5`, RR-3); a v2.0.x step after the release deletes the v1 sources — deferred from R6-03, because it would move the whole pipeline right before the one full suite; [`docs/v2-run/wave-15.md`](docs/v2-run/wave-15.md) § "Not in this wave" lists the step. Built by `R4-P.P3` (`e3feb5d`): the scale-1 digest pin `fa4198…` green unedited | R4, R4-P, R5 |
| **RR-1a** | **A new sprite name with only a v2 source** (e.g. `ships/manta-thruster`, `ui/title-backdrop`) **is absent from the scale-1 build.** That is allowed: the scale-1 consumers (the TV bench atlas, the CJK figures, the store icons until R4-05.E5) never draw it, `pnpm content:check` and the content tests run on the default scale, and the scale-1 digest pin holds. No v1 stand-in is drawn for it. Owner-confirmed 2026-10-18 (applies to R4-01.A2, R4-05.E2, every R4 / R5 new name) | R4, R4-P, R5 |
| **RR-1b** | **Frame counts at scale 1:** when core starts reading more frames than a v1 source has (Option frames 2–3, black-hole frames 4–7, bank frames 3–4), only the v2 art gets them. The scale-1 atlas is never played; the relation tests skip native sprites (`R4-P.P3`); a v2.0.x step after the release retires the scale-1 builds (deferred from R6-03 like RR-1's clean-up). Owner-confirmed 2026-10-18 (applies to R4-01.A1b, A3, A4, A8, R4-02.B2, B3) | R4, R4-P |
| **RR-5** | R4 starts after R2-03; the subtasks that re-bless (`R4-01.A1b`, `R4-02.B3`) after R2-04; R4's prep runs in R2-04's wave — held: `R4-P.P1 … P4` landed in wave 7 (§10's prep note) while the wave's bless was `a285e0e` | R4 |
| **RR-6** | R3-06's new draw layers are inserted into `LayerId` (`DecorBack` after `BgMid`, `DecorFront` after `Terrain`, `Foreground` after `Fx`, below `EnemyBullets`); the fingerprints are re-pinned — built by `R3-06.L2` (`138bddb`): the layers are 2 / 4 / 12 of `LAYER_COUNT` 17, the presentation fingerprint moved 82 of 119 world hashes and the shell's 4 world hashes, re-layering only, no drawn value changed | R3-06 |

---

## 2. Why 640×360 and a ×1.5 world

### 2.1 Today (v1, frozen on `v1.x`)

- **384×216** internal: a 384×200 playfield between two 8-px HUD bars (decisions D19 / D20,
  `docs/old/shmup_plan.md:149-150`; constants `packages/core/src/config/index.ts:728-751`).
- Drawn into an offscreen render texture, then scaled up with nearest-neighbour by a whole number: ×5 to 1920×1080
  on the M7s, ×3 plus a letterbox on 720p TVs, ×10 on 4K.
- Art: ship 16×9, tiles 8×8, font 6×8, bullets 7–11 px. One 1024² atlas page holds 438 sprites in 1,411 frames
  (`assets/generated/atlas/main.png`, 137 KB).
- Stages are 9,000–9,800 px long, each about 3.1–3.6 minutes of camera travel.

### 2.2 The displays

| Host | Web-app viewport |
|---|---|
| Samsung M7 (Tizen 5.5, the primary target) | **1920×1080 @ DPR 1** (measured 2026-09-15) |
| Other Samsung Tizen sets | 1920×1080 (UHD models) or **1280×720** (FHD models) |
| LG webOS 5+ | typically 1920×1080 (never measured — no LG hardware) |
| Electron / browser | anything; 1080p, 1440p and 4K monitors are common |

For crisp pixel art the internal frame must divide both TV sizes. The largest 16:9 size that does is
**640×360**.

### 2.3 The options that were compared

| Internal | 1080p | 720p | 1440p | 4K | Pass-1 pixels vs v1 | Verdict |
|---|---|---|---|---|---|---|
| 384×216 (v1) | ×5 | ×3 + bars | ✗ | ×10 | 1× | stays on `v1.x` |
| 480×270 | ×4 | ✗ (×2.67) | ✗ | ×8 | 1.6× | too small a gain for a full redo; 1.25× is an awkward port ratio |
| **640×360** | **×3** | **×2** | **×4** | **×6** | 2.8× | **chosen** |
| 768×432 | ✗ (×2.5) | ✗ | ✗ | ×5 | 4× | no whole-number scale on any TV — only useful as a "same game, sharper" render experiment |
| 960×540 | ×2 | ✗ (×1.33) | ✗ | ×4 | 6.25× | the "hi-bit" route; benchmarked in R0 for the record (§13), not adopted |
| 1920×1080 | ×1 | shrinks | ✗ | ×2 | 25× | ~84 MB of render targets alone against a < 100 MB budget (review §7.3); not on the TV |

### 2.4 What 640×360 costs on the TV (estimates — R0 measures them)

- **GPU fill.** The final upscale to 1080p is a fixed ~2.07 Mpx per frame whatever the internal size, so a
  bigger pass 1 is diluted. Assuming about 4 layers of overdraw in pass 1, total fill per frame:

  | Internal | Pass 1 (×4 overdraw) | Upscale blit | Total | vs v1 |
  |---|---|---|---|---|
  | 384×216 | 0.33 Mpx | 2.07 Mpx | 2.40 Mpx | 1× |
  | 640×360 | 0.92 Mpx | 2.07 Mpx | 3.00 Mpx | **+25 %** |
  | 960×540 | 2.07 Mpx | 2.07 Mpx | 4.15 Mpx | +72 % |

  The CRT pass works on the 1080p output, so its cost does not change with the internal size.
- **Render-target memory.** Pixi pools targets rounded up to powers of two: the frame target goes 512×256
  (0.5 MB) → **1024×512 (2 MB)**; each filter pass the same.
- **CPU.** CPU cost follows object counts, not pixels: the visible terrain grows from 49×26 = 1,274 tile sprites to
  55×29 = 1,595; pools (512 bullets, 64 enemies, 256 particles) are unchanged by the switch itself.
- **Textures.** Art at ×1.5 is ~2.25× today's atlas area (~1536², still one 2048² page). "Much more detailed" art
  (more frames, bigger bosses, painted full-width backdrops) will **not** fit one page — R3-04 moves to
  zone-grouped pages. Note that **one 2048² page is 32 MiB including its decoded image**, which was the whole of
  `TEXTURE_BUDGET_BYTES` when this was written — since R1-05 that budget is derived from the frame: 26 MiB at
  384×216, 23 MiB at 640×360 (`packages/shell/src/memory/index.ts` `textureBudgetFor`).

### 2.5 The world scale k: how much of the level you see

Resolution and zoom are separate settings. At 640×360, with k = new pixels per v1 pixel:

| k | Ship | Tiles | Playfield in v1 pixels | Ship on a 1080p screen | Verdict |
|---|---|---|---|---|---|
| **1.5** | 24×14 | 12 px | **427×224** (+11 % / +12 %) | 72 px (v1: 80) | **chosen** |
| 1.67 | ~27×15 | ~13 px | 384×200 (same as v1) | 80 px | tiles and coordinates don't convert cleanly |
| 2 | 32×18 | 16 px | 320×168 (−17 %) | 96 px | clean ×2 port, but cramped dodging |

**k = 1.5** keeps sprites about as big on a 43" screen at couch distance as they are now (bullet readability is
design pillar 2), gives a little more room to dodge, and makes the port mechanical: 8 → 12 px tiles is exact and
every world value is ×1.5.

### 2.6 The trap: the frame grows ×5/3, the world only ×3/2

384×216 × 1.5 = **576×324**, not 640×360. So **two different scales** are in play, and the port must keep them
apart:

| Kind of value | Rule | Examples |
|---|---|---|
| **World** (positions in the level, lengths, speeds, radii, accelerations) | ×1.5 | stage `length`, camera keys and speeds, event x, checkpoints, hurtboxes, bullet speeds, path points, fx speeds |
| **Frame- or edge-anchored** (defined by "the right edge", "one playfield", "the screen centre") | **re-derive from the new frame**, never ×1.5 | spawn x 400 = right edge + 16 → `PLAYFIELD_W + 24`; `laserLength 384` = one screen width → `PLAYFIELD_W`; `rowsTall 25` → 28 (camera `yTo` is **not** here: it is `rel-px`, ×1.5, decision O2); raster `top`/`bottom`; Mode-7 `horizon 100` / `bottom 200`; `DEFAULT_BOSS_Y 100` (centre); `CX = 192`; **the map's right end** — a map is `length + PLAYFIELD_W` wide, so a heightfield segment, region or RLE row that reaches it ends at `length′ + 640` (zone D's segment `to 9984` → 15040, not ×1.5 = 14976 — R1-03) |
| **Time, angle, count, score** | unchanged | telegraph ticks, `OPTION_SPACING` (ticks), timers, aim directions, pool sizes, point values |

**The vertical fit.** World y × 1.5 fills 300 px of the new 336-px playfield, so 36 px (3 tile rows) are left
over. The R2 port rule:

- Insert **3 rows at the top** of every tilemap, copied from its top row (a ceiling that touches the top edge
  gets thicker; open sky stays open).
- Map absolute world y as **y′ = 1.5·y + 36**. That is continuous at the bottom edge (200 → 336), so floors stay
  on the bottom edge and nothing gets a gap under its floor; things below the screen stay below it.
- **The top edge is the one discontinuity.** A value above the top edge (y < 0) must stay above it, so it maps
  to **y′ = 1.5·y** — otherwise an enemy that entered from above would spawn on screen. But an enemy that spawns
  above the screen and then moves into it arrives 36 px higher than its v1 equivalent, because its path is
  relative. The rescale tool **lists every such spawn**, and R2-02 fixes each one by hand: usually by lengthening
  the first path leg by 36 px, or by moving the spawn so its landing point matches. A test compares landing
  positions between v1 and v2.
- Relative values (path waypoints, part offsets, velocities) are ×1.5 with no shift.

The R5 zone remasters then redesign the vertical space on purpose.

*Considered and rejected:* making the playfield exactly 300 px (= 200 × 1.5) with 30-px HUD bars. That makes the
vertical port exact, but spends 17 % of the screen on HUD (v1: 7 %) on a TV where play area matters most.

### 2.7 The v2 numbers (the spec)

| Quantity | v1 | v2 |
|---|---|---|
| Internal frame | 384×216 | **640×360** |
| HUD bars | 2 × 8 px | **2 × 12 px** |
| Playfield | 384×200 (y 8…207) | **640×336 (y 12…347)** |
| Tile size | 8 | **12** |
| Font cell / line height | 6×8 / 10 | **≈ 9×12 / 15** (R4-03 decides) |
| Ship art (KESTREL) | 16×9 | **24×14** (detail budget: ~2.25× the pixels) |
| Ship speed levels (px/tick) | 1.5 … 4.0 | **2.25 … 6.0** |
| Player hurt radius | 1.5 | **2.25** |
| Enemy bullet radius (`BULLET_KINDS`) | 1.5 / 2 | **2.25 / 3** |
| 4-way rule: max aimed bullet speed (Normal) | 2.0 px/tick | **3.0 px/tick** |
| 4-way rule: min laser lane gap | 16 px | **24 px** |
| 4-way rule: capsule window after a checkpoint | 900 px | **1,350 px** |
| Collision grid cell / margin | 32 / 64 | **48 / 96** (cells 16×11 → 18×11) |
| Stage length (zone A) | 9,000 px | **13,500 px** after the port; **~20,000 px** after R5's expansion |
| Upscale | ×5 (1080p), ×3 + bars (720p) | **×3 (1080p), ×2 (720p)**, ×4 (1440p), ×6 (4K) |
| Frame render target | 512×256 (0.5 MB) | **1024×512 (2 MB)** |
| e2e viewport | 1152×648 (×3) | **1280×720 (×2)** |
| Electron default window | scale 3 = 1152×648 | **scale 2 = 1280×720**; max scale 10 → 6 |
| CRT scanline pitch at 1080p | 5 | **3** (`CRT_MIN_PITCH` 2 still holds at 720p) |

---

## 3. Versions and branches

### 3.1 What exists now

- Tag **`v1.0.0`** → `f82e183` with a published GitHub release "v1.0.0" (2026-10-16). *Note:* at that tag
  `package.json` still says `1.0.0-rc.1` and the CHANGELOG's top section is "[Unreleased]". The first v1.x
  release fixes both (R0-01).
- Branch **`v1.x`** → `f82e183`, pushed to `origin`, tracking `origin/v1.x`.
- **The v1 game has still never been installed on the M7s** (`docs/client/outstanding-work.md` §1). The first
  device session (R0-03) is the natural time to do that too, from `v1.x`.

### 3.2 The two lines

| | `v1.x` | `master` |
|---|---|---|
| Resolution | 384×216, forever | 640×360 from R2-01 |
| Versions | `1.0.1`, `1.0.2`, … (tags `v1.0.N`) | `2.0.0-alpha.N` → `2.0.0-beta.N` → `2.0.0` |
| What goes in | bug fixes, fixes from the first hardware runs, store-submission changes, translation corrections | everything in this plan |
| What never goes in | resolution, art, level or balance changes | — |
| Releases | GitHub releases from tags on `v1.x` | GitHub releases from tags on `master` |

### 3.3 Moving fixes between the lines

- A fix that applies to both lines lands on **`v1.x` first**.
- **Until R2-01 lands,** merge `v1.x` into `master` (`git merge v1.x`) whenever it moves; the trees are still
  nearly identical.
- **From R2-01 on,** content, art and frame constants diverge everywhere, so **cherry-pick code fixes**
  (`git cherry-pick -x <sha>`) and port content fixes by hand. Never merge `v1.x` into `master` again.
- A v2-only change never goes back to `v1.x`.

### 3.4 App identity, saves and replays

- v2 ships as an **update of the same apps**: Tizen `ShmpCupGam.ShmupCup` (`config.xml` `version` 2.0.0), webOS
  `dev.shmupcup.game`, the same Electron / Steam app. Players keep their saves.
- **Saves** (`packages/core/src/save/index.ts`, key `save.v1`, `SAVE_VERSION` 2): options keep their meaning
  (scale mode, aspect, CRT, controls, language). **Hi-score tables do not** — v1 scores were made in a different
  game. R2-01 adds migration 2 → 3, which moves the v1 tables into a read-only `legacyScores` field (kept, not shown
  by default) and starts the v2 tables from the default rows.
- **Replays** (`packages/core/src/replay/format.ts:38` `REPLAY_FORMAT_VERSION` 1; `run.ts:74`
  `RUN_REPLAY_FORMAT_VERSION` 1): `decodeReplay` rejects only a different `formatVersion`, so **a v1 replay would
  decode under v2 and then desync**. R2-01 bumps both to 2 and also checks the header's
  `internalWidth`/`internalHeight`, so a v1 replay is refused with a clear "recorded by v1" message.
- **Electron** `window.json` (`version: 1`, `scale`) is bumped and re-fitted (scale 3 at 640×360 is a 1920×1080
  window).

### 3.5 CI, the agent workflow and the board

- `.github/workflows/ci.yml` ran on `push: branches: [master]` and on pull requests only. **Done 2026-10-16:**
  both branches' `ci.yml` now push-trigger on `[master, v1.x]`, so a push to `v1.x` runs the full CI.
- Optional: protect `v1.x` against force-push and deletion (`gh api -X PUT
  repos/detain/shmup-cup/branches/v1.x/protection …`).
- `.claude/workflows/shmup-plan-batch.js` is hard-wired to `shmup_plan.md` and to pushing `master`. R0-01 lets it
  take the plan file as an argument (`args.plan`, default the v1 plan), so this plan's steps can run through the
  same build → review → fix → test → docs pipeline. v1.x fixes are done by hand.
- **The GitHub project board** ("Shmup Cup", users/detain/projects/4) has one GitHub milestone per R milestone
  and **one issue per step of this plan** (labels `plan-step` + `v2`, hidden marker
  `<!-- shmup-plan-step:R0-01 -->`), next to v1's M-step issues, plus a "v2 board" view. After a batch of steps,
  set the step's status in §17 and resync with `python3 .claude/plan_board_v2.py` (local — `.claude/` is
  git-ignored). The script is idempotent and reads this file from `origin/master`.

---

## 4. How this plan is executed

- **The same pipeline as v1** (`docs/old/shmup_plan.md` §1.2): per step, BUILD → REVIEW ⇄ FIX → TEST → DOCS, every
  agent pushing straight to `master`. Each step below has the v1 shape: `### <ID> — <Title>`, with **Goal**,
  **Depends on**, **Scope**, **Acceptance**, **Manual (owner)** and **Refs**. Deviations go into an **As built**
  list under the step.
- **v1's definition of done still applies** (§1.3 there), with these v2 changes:
  1. **Real art is allowed and expected.** v1's rule "nothing requires human-made art" is lifted for R3–R5:
     committed PNG sources under `assets/source/` (made with the R3-02 ingest tool and documented in its
     provenance files) are the normal way art arrives. Procedural generators remain for what is better generated
     (bullets, colour-blind variants, debug art).
  2. **Golden replays are re-blessed** in every step that changes the simulation — expected in R2 and in each R5
     zone step — with the reason in the commit message, as before.
  3. **Steps that need the owner's hands** (running the TV bench, AI generation runs on the owner's GPU server,
     hand-cleaning sprites, playtesting) list those parts under **Manual (owner)**. Code and tooling are never
     blocked on them: agents build the tools and use the interim art, and the owner's output drops in later.
- **Interim art is fine on `master`.** Between R2 and the end of R5, `master` will mix interim (×1.5 upscaled v1)
  art and new art. `v1.x` is the shipping line meanwhile.
- Zero allocation, determinism, the Chromium 68 floor, the bundle budget (`APP_JS_GZIP_BUDGET` 512 KB: ~376 KB
  used after R1-05 moved the atlas manifest out, ~380 KB after R2-01's flip — check-bundle's 380.2 KB at `bc8e05d`)
  and "original names, art and music only" all hold in every step.
- **From 2026-10-18 the run continues on the host myadmin1**, driven by opencode with about 10 agents at once, in
  the waves of **§18**; their work orders, decisions and helpers are committed under
  [`docs/v2-run/`](docs/v2-run/README.md). Tests run there, targeted, and nobody waits for GitHub CI; the one full
  suite runs at the end of the run (§18.1).

---

## 5. Milestones at a glance

| Milestone | Steps | Outcome | Golden replays |
|---|---|---|---|
| **R0** Branches, versions, TV benchmark | R0-01 … R0-04 | `v1.x` maintained with CI; a benchmark `.wgt` that measures 384×216 / 640×360 / 960×540 on the M7 (results non-blocking); the early AI art round — two candidates per subject, the owner's picks, followups from the winners (non-blocking) | unchanged |
| **R1** Resolution-independent engine | R1-01 … R1-05 | every frame-dependent number derives from a handful of constants; content schemas know which numbers are world pixels; atlas paging and memory ready for detailed art. **Still 384×216, pixel-identical.** | **unchanged** (the safety net) |
| **R2** The switch | R2-01 … R2-04 | the game runs at 640×360 with every zone ported ×1.5, interim upscaled art, playtest bot green, saves and replays versioned. Tag `v2.0.0-alpha.1` | re-blessed |
| **R3** Art pipeline | R3-01 … R3-06 | art bible v2; the AI-to-sprite ingest tool with provenance; variants, palettes and tiles from real art; zone-grouped atlas pages within memory; stage art features (decor, painted backdrops, more parallax) | unchanged (R3-06 may add new stage fields) |
| **R4** Shared art redo | R4-01 … R4-05 | ships, shots, Options, shields, bullets, items, FX, font, HUD, UI, title, endings, store and doc images — all new | re-blessed only if sprite ids change |
| **R5** Zone remasters | R5-01 … R5-10 | each zone's tileset, backdrops, enemies and boss redrawn and its level expanded to ~4.5–5.5 min, plus bonus stages, boss rush, loops and the escape. Tag `v2.0.0-beta.1` after R5-10 | re-blessed per zone |
| **R6** Balance, performance, release | R6-01 … R6-04 | difficulty and scoring retuned, on-device performance confirmed, the GRAPHICS options page with the sweep's recommended defaults (R6-04, added 2026-10-20 by decision W5-20), docs and store assets refreshed, **v2.0.0** | final re-bless |

Dependencies: R0 ∥ R1 → R2 → R3 → R4 ∥ R5 (R5 zone steps need R3 and R4-01 … R4-03) → R6. **R0-02, R0-03 and R0-04
block nothing.** Two R3 steps do not wait for R2: **R3-01**'s prompt-library half is done (`b938d5a`) and its art bible
half depends on nothing; **R3-02** depends only on R3-01, and its output is staged until R2-01. R3-03 … R3-06 still
follow R2.

**The schedule (§18) tightens these where the files allow it:** R3-03 and R3-04 need only R2-01 and run beside R2-02's
prep; R3-06 and R4's prep run beside R2-04; R4-01 … R4-05 follow R2-04; and the R5 zones build in parallel and land one
at a time (decision R5-D1 in [`docs/v2-run/decisions.md`](docs/v2-run/decisions.md)), with zone A first.

---

## 6. R0 — Branches, versions and the TV benchmark

### R0-01 — Maintenance branch, version lines and CI

- **Goal:** both lines build, test and release independently, and agents can run this plan.
- **Depends on:** — (the branch already exists).
- **Scope:**
  - *(Already done 2026-10-16: `ci.yml` on both branches push-triggers on `[master, v1.x]`.)*
  - **On `v1.x`:** `package.json` version → `1.0.1-dev`; add a CHANGELOG "[1.0.0] — 2026-10-16" heading for what
    the tag shipped; a short "this is the maintenance line" note in `README.md`.
  - **On `master`:** `package.json` (root and workspace packages that carry a version) → `2.0.0-alpha.0`; Tizen
    `config.xml` `version` and webOS `appinfo.json` `version` → 2.0.0; CHANGELOG "[Unreleased] — v2" section;
    README and `docs/client/` state that v2 is in development and where v1 lives.
  - `.claude/workflows/shmup-plan-batch.js`: accept `args.plan` (the plan file path) and use it in every prompt
    instead of the literal `shmup_plan.md`; default to the v1 plan.
  - `docs/dev/build-test-deploy.md`: a "Release lines" section — §3.2 and §3.3 of this plan (what goes where,
    merge before R2-01, cherry-pick after).
- **Acceptance:** CI runs on a push to either branch; `pnpm build` is green on both; the workflow runs a step from
  this plan by name.
- **Manual (owner):** optionally protect `v1.x` against force-push and deletion (§3.5,
  `gh api -X PUT repos/detain/shmup-cup/branches/v1.x/protection …`) — still open. *(Adding this plan to the project
  board is done: one issue per step since 2026-10-16, §17.)*
- **Refs:** §3 of this plan.
- **As built** (2026-10-17; both sides reviewed clean):
  - **`master`** (`7e46ee8`): all ten `package.json` files say `2.0.0-alpha.0`; the Tizen `config.xml` and the webOS
    `appinfo.json` say `2.0.0` (both TVs take `major.minor.patch` only), and so does `STORE_LISTING.version` in
    `scripts/store-assets.mjs`, which the store-assets test ties to `config.xml` (not named in the scope). The
    CHANGELOG's new first section is `[Unreleased] — v2`, and **master too renames v1's old `[Unreleased]` to
    `[1.0.0] — 2026-10-16`** (the scope names that heading only for `v1.x`) so that `master` never carries two
    `[Unreleased]` sections. README and `docs/client/README.md` say v2 is in development and where v1 lives;
    `build-test-deploy.md` gained "Release lines". `tooling-config.test.ts` pins the release version
    (`2.0.0-alpha.0` then, `2.0.0-alpha.1` since `R2-04.REL` `5aad58e`) and the CHANGELOG order; the
    `config.xml` variants edge test now breaks the widget version whatever it is.
  - **`v1.x`** (`bde77b5`, CI run 39020883321 green): every `package.json` says `1.0.1-dev`; `config.xml`,
    `appinfo.json` and the store listing say `1.0.1` (the scope named only the manifests); the CHANGELOG names the
    tagged section `[1.0.0] — 2026-10-16` under a new `[Unreleased]`; README, `apps/tizen/README.md` and
    `install-on-tv.md` carry the maintenance-line note. A second, owner-approved `v1.x` commit (`ef6605c`, CI run
    39022048800 green) made v1.x's docs describe the 1.0.0 release and the `1.0.1-dev` line instead of the RC.
  - **Both `v1.x` commits reached `master` as `git merge -s ours`** (`f74cf95`, `b37bc69`): the merges record them
    and keep `master`'s tree, so v1-only versions and text stay on `v1.x` and the next plain merge brings only later
    commits (`build-test-deploy.md` § Release lines). `master`'s own docs were brought in line separately by the
    wave's docs pass.
  - **The workflow** (`.claude/workflows/shmup-plan-batch.js`, local and git-ignored, installed in the main tree)
    takes `args.plan` (default `docs/old/shmup_plan.md`; `plan_resolution.md` for v2) and uses it in every prompt;
    steps may be bare ids (`steps: ["R0-02"]`) or `{ id, title }`. For a v2 plan its agents read §1, §2.6, §2.7 and
    §4, and its docs agent sets §17 and resyncs the board. Checked by a dry run with stub agents (a v2 step and a v1
    step, every stage), not by a live run.
  - `pnpm build` is green in `v1.x`'s CI; on `master` the builder ran the Tizen and webOS builds (bundle checks OK),
    and the full build runs in `master`'s CI.

### R0-02 — The TV render benchmark (`bench:tv`)

- **Goal:** a self-running `.wgt` that measures what a frame costs on the M7 at **384×216**, **640×360** and
  **960×540**, under a load shaped like the v2 game rather than v1's. **Its results never block this plan**
  (§13).
- **Depends on:** — (runs alongside R1).
- **Builds on:** M3-02c's harness (`test/bench/render.perf.ts`, `test/bench/render-harness/` — `load.ts`,
  `gates.ts` and `protocol.ts` are DOM-free and reusable), M3-02f's telemetry (`packages/shell/src/telemetry/`),
  and the input-probe log server (`tools/input-probe/server/log-server.mjs`).
- **Why the existing harness is not enough:** it is an ES-module page driven by Playwright, never built for
  Tizen. And at any size other than 384×216 **the world still draws 1:1 into the top-left 384×216**
  (`renderer/index.ts:794-835` sizes only the backdrop), so its 768×432 scenario prices filter targets, not a
  denser scene.
- **Scope:**
  - **A density-scaled synthetic scene** (no game simulation): for each resolution a density factor
    `s` = 1 (384×216), **1.5** (640×360 — the v2 game), **2.25** (960×540 — the same field of view as v2, at
    1.5× its density). It is built from the real atlas, upscaled ×s with nearest-neighbour at bench-build time,
    so texture bytes, page count and binds are realistic: 2.25 overflows one 2048² page and gets two.
  - **The v2 layer stack, as a load model:** 5 parallax layers (2 full-frame, 3 partial with alpha), top and
    bottom terrain covering ~35 % of the frame at `8·s`-px tiles, a decor layer, 64 enemies at ×s sizes,
    512 enemy bullets, 512 point items, 512 particles, the HUD bars. Plus variants: a filtered layer
    (raster/palette) on, Mode-7 on, CRT `off` / `light` / `full`.
  - **The runner:** one scenario per page load (Pixi's `TexturePool` is global and never shrinks), the cursor
    kept in `localStorage`, `location.reload()` between scenarios, 10 s warm-up + 20 s measurement each. The
    whole matrix (3 sizes × ~6 scenarios) takes ~10 minutes. Remote: **Enter** starts, **Back** exits,
    **Red** re-runs the current scenario.
  - **What it measures, per scenario:**
    - `renderer.render()` CPU ms (p50/p95);
    - **synced GPU ms** — a second pass that calls `gl.finish()` after each render, because WebGL is asynchronous
      and fill cost otherwise only shows up as late frames;
    - the rAF delta histogram (the M7's buckets 12/15/17/19/21/25/33 ms) and the share of frames that needed two
      ticks;
    - draw calls, render-target bytes, texture bytes, and the coarse JS heap (`performance.memory`; no `gc()` on
      the TV).
  - **Results three ways:**
    1. an on-screen table in the bitmap font after the run, so photographing the TV is enough;
    2. a `render-bench` payload POSTed through the telemetry sender to the log server, for which the log server
       gets a `render-bench` formatter (it currently understands only `render-profile`);
    3. kept in `localStorage` until a later run overwrites them, so a crash loses nothing.
  - **The build:**
    - a Tizen widget with **its own app id** (e.g. `ShmpCupBnc.RenderBench`) and its own `dist-bench/`, so it
      never replaces the installed game;
    - the Tizen build contract: IIFE, `chrome69` + `es2018`, the `globalThis` banner and a classic script tag;
    - `apps/tizen/scripts/tizen-env.mjs:28-30` (`DIST_DIR`, `APP_ID`, today fixed) becomes env-overridable;
    - the dev-build gate `DEV_BUILD_MODES` (`vite.shared.ts:439`) learns a `bench` mode, so `__SHMUP_REPORT_URL__`
      is defined;
    - scripts `pnpm bench:tv` (build) and `pnpm bench:tv:package`, `pnpm bench:tv:install` (written, never run
      here — the owner runs them from the Windows desktop like the probe).
  - **The same scenes in `pnpm bench`** (headless Chromium, SwiftShader) as a regression gate on draw calls,
    render-target bytes and heap. Also fix the headless display size: `DISPLAY_WIDTH/HEIGHT` 960×540
    (`render.perf.ts:70-73`) is not a whole multiple of 640×360; use 1280×720.
  - **An analyzer:** `tools/input-probe/results/analyze-bench.mjs`, which groups by internal size and prints each
    scenario **relative to the 384×216 baseline of the same session**. The M7's rAF already shows a p95 of
    ~30 ms with nothing running, so absolute frame times mislead.
  - **webOS:** the same bench builds for `apps/webos` (an `.ipk` stub through the existing `ares-*` wrappers) —
    build-only, as everything webOS is today.
- **Acceptance:**
  - `pnpm bench:tv` produces a widget directory that passes the Tizen bundle checks;
  - the headless run of the same scenes reports all three sizes with their page counts (1, 1, 2);
  - the log server stores and summarises a `render-bench` session;
  - the analyzer prints a relative table from a recorded fixture session;
  - the on-screen results table is unit-tested against a fake result.
- **Manual (owner):** none in this step itself — the run is **R0-03**. Its recipe, from the Windows desktop (also
  in `apps/tizen/README.md` and [build-test-deploy.md](docs/dev/build-test-deploy.md#the-tv-render-bench-r0-02)):
  1. `npm run log-server` in `tools/input-probe/`;
  2. `$env:VITE_REPORT_URL="http://<desktop-ip>:8787"; pnpm bench:tv` (both bench widgets + their bundle checks);
  3. `$env:TIZEN_PROFILE="…"; pnpm bench:tv:package` → `apps/tizen/dist-bench/ShmupCupBench.wgt`, then
     `$env:TV_IP="…"; pnpm bench:tv:install` and `pnpm --filter @shmup/tizen bench:run`;
  4. on each monitor press **Enter** (~10 minutes, then since R1-05 about 20–30 s of the decode
     scenario); the streamed payload is the record — it carries the `DECODE (R1-05)` table in its
     `decode` field. Photograph the tables under the results page only as the fallback, when
     step 5's logs show a session's payload never reached the log server or holds no `decode`
     field — check and photograph before the TV is reset; then set
     `localStorage['shmup-cup:gl'] = '2'` (Web Inspector) and run it again on WebGL 2;
  5. the logs land in `tools/input-probe/logs/rb-*.jsonl`: commit them to `results/<date>-m7-bench/` and run
     `node results/analyze-bench.mjs <gl1>.jsonl <gl2>.jsonl`.

  The webOS stub is build-only: `pnpm --filter @shmup/webos bench:package` / `bench:install` are written, never run.
- **Refs:** `docs/dev/render-performance-review.md` §7 and F10; plan M3-02c, M3-02f; `docs/dev/input-probe.md`.
- **As built** (`ee7ef61`, `8d58a22`, `406cfd2`, `fe58bfd`, `436c0c6`; review fixes `1811cf7`, `332e581`; review
  round 3 clean, CI run 39047425890 green):
  - **The widget** is a second build of `apps/tizen`: its own entry (`bench/index.html` → `apps/tizen/src/bench/`),
    app id `ShmpCupBnc.RenderBench` (the game's `config.xml` with the ids rewritten — `config-xml.mjs`
    `benchConfigXml`), output `dist-bench/`, built by `vite.bench.config.ts` in the new dev-build mode `bench`
    (`DEV_BUILD_MODES` = `development`, `test`, `bench`). It lives under `apps/tizen/src`, so the Chromium 68 scan
    covers it. The webOS stub builds the same page with its own appinfo id (`dev.shmupcup.renderbench`); the code
    tells the host apart at runtime (Back 10009 / 461, browser keys). The game's `dist/` of both TV builds is byte
    for byte what it was before R0-02.
  - **The bundle check** takes a folder (`check-bundle.mjs dist-bench`) and has a **rule 9**: a widget with the
    bench's app id must be the bench (its `app.js` holds the bench marker), and the game must not hold it.
    `tizen-env.mjs` reads `TIZEN_DIST_DIR` / `TIZEN_APP_ID` (webOS: `WEBOS_DIST_DIR`, `WEBOS_RELEASE_DIR`,
    `WEBOS_APP_ID`), which `tizen-bench.mjs` / `webos-bench.mjs` set for the bench.
  - **Turborepo:** a `build:bench` task (`dist-bench/**`, env `VITE_REPORT_URL`, `SHMUP_BUILD_ID`), and its own
    **`@shmup/webos#build:bench`** entry whose inputs add the `apps/tizen` files the stub bundles (`bench/**`,
    `src/**`, `scripts/**`, `vite.config.ts`, `tsconfig.json`, `package.json`) — review round 1 found the generic
    task's cache key missed them, so a bench edit could restore a stale webOS stub (`1811cf7`). **A change to the
    generic `build:bench` must be repeated in that entry.**
  - **Page count:** today's frames ×2.25 fill only 2.4 Mpx and fit one 2048² page, so the bench applies the scope's
    own model, `ceil(s² · page area / 2048²)` → 1 / 1 / 2 pages (frames split in source order, each group packed by
    the pipeline's packer — `scripts/bench-atlas.mjs`). Density 1 is the shipped page byte for byte; 960×540's
    second page comes from the model, not from real overflow.
  - **The scene:** the parallax and terrain bindings are created by the bench at the scenario's width (the
    renderer's own covered only 384×216 then; R1-02 derives them). Beyond the scope: the busy frame also carries the
    ship, 4 Options and 32 shots, and a sixth variant, `worst`, turns everything on at once — 18 scenarios. The
    Mode-7 variant passes the floor tile's own atlas page to `createMode7Shader` (the page-0 bug R1-02 fixes).
    `apps/tizen/src/bench/matrix.ts` `BENCH_SIZES` keeps literal 384×216 on purpose (the v1 baseline stays after
    R2-01): R1-02's repo-wide scan must allow-list it.
  - **The TV phases:** the scope's 20 s of measurement is 14 s free-running plus 6 s with `gl.finish()` after every
    render. WebGL 2 only with `localStorage['shmup-cup:gl'] = '2'` (in a browser also `?gl=2`).
  - **Results:** the on-screen table in the bitmap font (`results.ts`, unit-tested against fake records), one
    `render-bench` POST per scenario through `@shmup/shell`'s new `sendRenderBench` (sessions `rb-…`), and the
    stored state. The log server gained a `render-bench` formatter; `tools/input-probe/results/analyze-bench.mjs`
    prints each scenario relative to the same session's 384×216 rows, applies §13's rules and compares a WebGL 1
    with a WebGL 2 session (fixture `tools/input-probe/test/fixtures/bench-session.jsonl`).
  - **Headless:** `pnpm bench` builds the widget as `bench:tv` does and opens all 18 scenarios on a **1280×720**
    display (`render.perf.ts` `DISPLAY_WIDTH/HEIGHT`, was 960×540), gating **counts only** (`tvBenchViolations`:
    the load, draw calls 11–16, pooled render targets, pages 1 / 1 / 2, the heap); headless phases need at least
    20 frames (`minFrames` — SwiftShader stalls under load). `test/integration/tv-render-bench.test.ts` (part of
    `pnpm test`) covers the gate, the driver's wiring and records → log server → analyzer.
  - **CI fix:** four `apps/tizen` bench tests read the git-ignored atlas, so master's three test shards were red from
    `ee7ef61` on (found by R1-01's step review); they now build it in memory with the pipeline (`332e581`).
  - The bench's `app.js` is ≈ 235 KB gzipped (it inlines three manifests).

### R0-03 — Run the benchmark on the M7s and record the results (owner; non-blocking)

- **Goal:** real numbers for 384×216, 640×360 and 960×540 on the hardware, written down where future steps can
  read them.
- **Depends on:** R0-02. **Blocks:** nothing.
- **Scope (owner):**
  1. Start the log server on the desktop (`npm run log-server` in `tools/input-probe/`).
  2. Build with `VITE_REPORT_URL=http://10.0.0.2:8787 pnpm bench:tv` (the owner's desktop; the TV is
     `10.0.0.224`), then package and install the bench widget. The first scenario's console summary
     line at the log server is the reachability test — if it does not appear within ~2 min, fix the
     firewall before running the matrix.
  3. The two M7 units are exactly the same model (owner, 2026-10-19), so run on **one unit** — the
     full matrix once with WebGL 1 (shipped default), once with WebGL 2
     (`localStorage['shmup-cup:gl']`), then the decode scenario; then a **repeat of the 640×360
     WebGL1 pass** on the same unit as the run-to-run stability check. Since R1-05 a run ends with
     the **decode scenario** (the 19th page load, about
     20–30 s more): its `DECODE (R1-05)` table rides in the streamed payload's `decode` field; the
     saved session, read with `analyze-bench.mjs` right after the run, is the record. Photograph
     the table under the results page's matrix table only as the fallback, when that session's
     payload never reached the log server or holds no `decode` field — check before the TV is reset.
     The second monitor is optional — only worth its time if its firmware differs; note the firmware
     build of the unit that ran (Settings → About).
  4. While the TV is set up, also do v1's first install from `v1.x` and the M3-02c measurement table
     (`docs/client/outstanding-work.md` §1.1).
- **Scope (agent, afterwards):**
  - commit the raw logs to `tools/input-probe/results/<date>-m7-bench/`;
  - write `docs/dev/input-probe-results.md` **§12 "Resolution benchmark"**: the tables, the relative costs, and
    the verdict per size using the rules in §13 — and `analyze-bench.mjs`' "Decode and upload" section, whose R3-04
    zone-load estimate R3-04 starts from;
  - set the v2 render budgets used by R3-04 and R6-02 from the 640×360 numbers;
  - record the 960×540 verdict as a note for after v2 (a possible desktop "HD" mode or a v3). It does not change
    this plan.
  - *In the run (§18):* the agent part is wave 15's `R0-03.A1` (only when the owner's logs exist: it commits them
    and analyses the bench) and `W15.DOCS-C` (§12). R3-04 runs before any log exists (its zone-load figure
    estimated or flagged unmeasured, decision W5-19), so A1 only proposes budgets in its report, never edits one;
    `R6-02.P3` measures against R6-02's budgets (wave 15, rule 2).
- **Acceptance:** §12 exists with numbers from one unit's WebGL1 + WebGL2 matrices, the decode
  record, and the 640×360 repeat pass (a second unit's run only if made — then its firmware note
  too); §13's decision table has been applied and its outcome written down; nothing else in the
  plan waits for it.

### R0-04 — The early art round: generate, pick, follow up

- **Goal:** two AI candidates for every basic image subject of `art-prompts/v2/manifest.json` (91 subjects, 203
  followups; a third for 29 of them), two clips for each of its 24 text-to-video items and one for each of its 2
  image-to-video items, the owner's pick of each, then the winners' followups and edits — so R3 … R5 start from a
  chosen visual direction, not from a blank page. **It never blocks anything:** no step waits for its images or clips,
  and nothing it makes ships before R3-02's ingest and R3-05's licence check.
- **Depends on:** — (the owner's server switch, below). **Blocks:** nothing.
- **Builds on:** R3-01's prompt-library half (`b938d5a`: the K3 kernel with the flat green key, PNG output, the
  manifest, `art-prompts/v2/gen-candidate.mjs`); the picker page `http://mystage.interserver.net/shmup-cup/` (files in
  `/home/sites/mystage/public_html/shmup-cup/`, outside this repo).
- **Scope:**
  - *(Tooling done 2026-10-16: `art-prompts/v2/server.sh` with its offline tests `server.test.sh`; the port-30000
    refusal in `generate.mjs`, `gen-candidate.mjs` and `sweep-models.sh`; the runbook
    `docs/dev/art-generation-server.md`; the driver's `ART_ROUND` setting in `prompt_resolution.md`. Then the third
    image slot and the clips: `modelC` and the 26 `video/…` items in the manifest; `gen-candidate.mjs --slot c`, its
    video jobs (`/v1/videos`, `--source` for i2v, `--job` to resume) checked offline against a mock server; the
    picker's A | B | C sets, video players served with HTTP Range by `media.php`, and the round-2 section.)*
  - **The server switch (owner, before anything runs).** The main LLM moves to GPUs 0,1 with
    `/root/run_sglang_qwenflashnext9b.sh` (port 30000 assumed — the LLM's port owner and process group are re-detected
    at run time, never hard-coded). Cards 2,3 then run **one image/video model at a time** with the unchanged
    `/root/run_sglang_images_<name>-1.sh` scripts (pinned to GPUs 2,3, port 30001). Each model server is started with
    `server.sh start` and **stopped with `server.sh stop` when its batch is done, without ever touching the LLM**;
    `server.sh verify` runs after every stop.
  - **Round 1 — two candidates per basic subject.**
    - Every manifest item gets two candidates, slot `a` and slot `b`, made by **two independent agents writing into
      different dirs** (`art-prompts/v2/candidates/a/…`, `…/b/…`). Neither agent ever reads the other slot's
      outputs.
    - A subject with several images (poses, angles, scenes) gets **one representative image** this round — the
      manifest item itself, the same subject in both slots; its other images are the item's followups (round 2).
    - Slot a uses the item's `model` (FLUX.2-dev for 84 items), slot b its `modelB` (Qwen-Image for 75; the 7 text
      items are reversed, Qwen-Image in a and FLUX.2-dev in b; SD3.5 Large is slot b of the 9 terrain swatches).
    - **Slot c (`modelC`, FLUX.1-dev — the second-best model for these types)** is a third candidate for **29 items**:
      the 11 stage scenes and the 9 terrain swatches of `50-stages`, and the 7 key moments and 2 promo items that are
      not text items (a text item — slot a `qwenvl` — gets no slot c). Its own agents write `candidates/c/…` and
      never read slots a or b.
    - **Videos — 26 items `video/<subject>`** (`"kind":"video"`, category `video-<NN-dir>`), one per basic clip of
      `art-prompts/video/*.json`; the variations of a clip are alternative takes, so the item is its first take, and
      the others are listed under `takes`. Each item carries `mode`, `prompt`, `negative` and per-model `settings`
      (resolution, num_frames, fps, seconds, steps, guidance, seed), snapped to each family's grid as `generate.mjs`
      does: Wan ÷16 and then its nearest trained bucket (1280x720, 832x480, 720x1280) at the canonical 81 frames @
      16 fps (5.06 s); LTX ÷32 at the library's LTX size for the clip's aspect (960x544, 768x512, 576x1024) and the
      take's frames, else 121 @ 24 fps (5.04 s), unguided and 8 steps for LTX-2.5's distilled DiT (SGLang's own
      LTX-2.5 defaults).
      - **24 text-to-video clips:** slot a `wan22` (Wan2.2-T2V-A14B), slot b `ltx25` (LTX-2.5,
        `Lightricks/LTX-2.5-Diffusers`, SGLang's `LTX2Pipeline`). LTX-2.5 is expected to be a video model (the LTX-2
        generation, successor of LTX-Video); the LTX session checks `/v1/models`' `task_type` first (FLUX.2 reports
        `TI2I`; a video model reports `T2V`, `I2V` or `TI2V`). If LTX-2.5 is not a T2V/I2V model or does not load,
        slot b runs with the fallback **`ltxvideo`** (Lightricks/LTX-Video, ÷32, its own `settings.ltxvideo`).
      - **2 image-to-video clips** (`"mode":"i2v"`, `"waitsFor"`: the image id of the still they start from —
        `moment/ending-citadel-falls-silent`, and `fx/black-hole/armed-scene`, a followup of `fx/black-hole`): one
        candidate, slot a `ltx25`, made in **round 2** from the owner's winning still. Wan2.2's I2V weights are not
        on skynet2.
    - The slots therefore run in separate server sessions, one model at a time: **FLUX.2-dev** (slot a's FLUX items,
      plus slot b's 7 text items by a separate slot-b agent), then **Qwen-Image** (slot b's Qwen items, plus slot a's
      7 text items by a separate slot-a agent), then **SD3.5 Large** (slot b of the 9 swatches), then **FLUX.1-dev**
      (slot c's 29 items), then **Wan2.2-T2V-A14B** (slot a of the 24 t2v clips), then **LTX-2.5** (slot b of the
      24 t2v clips; LTX-Video if it fails the check above). Video timings on skynet2 are unknown until the first clip
      of each model is measured; the sessions are sized from that.
    - Per session about **4 concurrent generation agents**, one per category or group of categories. Each composes
      its own take on the item's prompt, runs `gen-candidate.mjs`, **looks at every PNG with the Read tool** (for a
      clip: three frames pulled with `ffmpeg` into its scratchpad), and retries at most twice when it shows the wrong
      subject, no key background where one is required, stray text or a broken composition (clips: also morphing,
      a frozen picture or a cut). Candidates (`.png`, `.mp4`) and their JSON sidecars stay git-ignored.
  - **The owner picks** on the picker page. It saves every 10 s and has no login. A set shows A | B, or A | B | C when
    it has a slot c; clips play in `<video>` players (`media.php`, HTTP Range) and clicking the picture chooses; the
    image-to-video sets sit in their own "Waits for round 2" section with a link to their still's set. The choices
    land in `data/choices.json` there: `{"schema":"shmup-art-choices@1","items":{"<id>":{"winner":"a"|"b"|"c"|null,
    "comment":"…","regenerate":bool,"updatedAt":"…"}}}`. A winner and `regenerate` exclude each other. A comment on a
    winner means "update the chosen image using this text as guidance"; on a regenerate it is the guidance for the
    new idea. Agents only read that file — the page owns it.
  - **Round 2, driven from `choices.json`:**
    - **(a) Followups:** for each winner, the item's followups are generated following the winner's design — with
      **FLUX.2-dev and the winner as reference image(s)** (`gen-candidate.mjs --edit-from`), even when the winner
      came from Qwen-Image.
    - **(b) Comments:** each comment is applied as an edit of the winner — FLUX.2-dev's edit route, or Qwen-Image-Edit
      only if its weights and a launcher exist (today: cache stubs only, no launcher) — written as a **new file, never
      overwriting** the winner.
    - **(c) Regenerate:** every candidate of an item flagged `regenerate` (two, or three with a slot c; a clip's one or
      two) is made again with a new idea, with the round-1 slot models; the old files are moved to
      `candidates/history/`, never deleted.
    - **(c2) Image-to-video:** once the still an i2v clip `waitsFor` has a winner (and, for a followup still, its
      followup exists — so after the FLUX.2-dev session), an **LTX-2.5** session makes the clip with
      `gen-candidate.mjs --source <the winning still>` (LTX-Video if LTX-2.5 failed its check). The owner then picks
      or regenerates it like any other set.
    - **(d)** The owner picks again where needed, and the loop repeats until every item is decided. A ledger
      (`art-prompts/v2/candidates/ledger.json`, git-ignored) records which choice (`updatedAt`) each item's work was
      made for, so a re-run acts only on new or changed choices.
    - **(e)** Winners and their followups (with their sidecars) are copied to a tracked
      `art-prompts/v2/winners/<id>/…` and committed; candidates stay git-ignored. The ingest into the game happens
      later (R3-02, staged until R2-01).
  - **Disk (checked 2026-10-16, read-only):** 544 GiB free on skynet2's `/root`; `server.sh start` refuses below 150.
    The first starts still to come download about SD3.5 Large 67 GiB, FLUX.1-dev 54, Wan2.2-T2V-A14B 118 and
    LTX-2.5 163 (SGLang fetches the whole repo, skipping only `*.onnx` / `*.msgpack`) — all four fit, leaving about
    143 GiB. The LTX-Video fallback (237 GiB, its repo holds every LTX-Video checkpoint) then neither fits nor passes
    the floor: the runbook (§4) lists what the owner could delete first.
- **Acceptance:**
  - every image item has an `a` and a `b` candidate PNG (and a `c` where it has `modelC`) with its sidecar, and every
    text-to-video item an `a` and a `b` `.mp4` with its sidecar, or a recorded failure after two retries;
  - every image-to-video item has its clip from its still's winner, once that still is decided;
  - every item in `choices.json` is decided (a winner and no pending regenerate), and every winner has its followups
    and its comment edits;
  - `art-prompts/v2/winners/<id>/` holds each winner, its edits and followups with their sidecars, committed;
  - `server.sh verify` passed after every model session, and the LLM's launcher kept its pid and start time through
    the whole round.
- **Manual (owner):** the server switch; picking on the page after round 1 and after each round 2; fixing
  `run_sglang_images_qwenimage-1.sh`'s duplicated `--text-encoder-cpu-offload`; accepting the gated licences of
  FLUX.1-dev, SD3.5 Large and LTX-2.5 on the Hugging Face account whose token skynet2 uses (else their first start
  fails to download); freeing disk before an LTX-Video fallback (runbook §4); deciding whether committed winners —
  clips included — go into Git LFS if they turn out large; the licence reading of R3-05 before any of this art
  ships.
- **Refs:** [`docs/dev/art-generation-server.md`](docs/dev/art-generation-server.md); `prompt_resolution.md` "Art
  round"; `art-prompts/v2/manifest.json`, `art-prompts/v2/gen-candidate.mjs`, `art-prompts/v2/server.sh`;
  `art-prompts/images/00-style-kernel.md`; R3-01, R3-02, R3-05.

---

## 7. R1 — A resolution-independent engine (no visible change)

**Strategy.** v2 never needs to run at two resolutions at once — `v1.x` keeps 384×216. So R1 does **not** make
the frame size a runtime option threaded through hot paths, which would risk V8 inlining and zero allocation. It
makes every frame-dependent number **derive from a handful of compile-time constants**:

- `FRAME_W`, `FRAME_H`, `HUD_BAR_HEIGHT`, `TILE_SIZE`;
- the font metrics `GLYPH_W`, `GLYPH_H`, `LINE_H`;
- derived values: `PLAYFIELD_W/H/Y`, the centre, the edges, the schema bounds.

After R1, changing those constants is the whole resolution switch. Every R1 step keeps the game
**pixel-identical at 384×216 with the golden replays unchanged** — the strongest possible check that nothing
moved.

### R1-01 — Frame constants in core

- **Goal:** `@shmup/core` has no literal frame numbers left.
- **Depends on:** R0-01.
- **Scope:**
  - **The constants and derived values:**
    - `packages/core/src/config/index.ts`: `FRAME_W`/`FRAME_H` and the derived `PLAYFIELD_*`; `TILE_SIZE` moves
      here from `data/index.ts:1991`; font metrics as constants mirrored from the font file (a test pins them
      equal);
    - `DEFAULT_GAME_CONFIG.internalWidth/Height` reads them (today nothing reads `internalWidth` beyond a range
      check — keep it as the replay header's record of the frame).
  - **UI:**
    - `ui/index.ts`: `HUD_LAYOUT` (`:1849-1890`) laid out from the frame and glyph metrics; the bar rects
      (`:2248-2249`) use `FRAME_W`;
    - menu line heights (`ui/index.ts:1261,1763`; `scenes/index.ts:1718,3778,3913,5071`) and fixed sizes
      (`NAME_CELL_PITCH`, `SLIDER_BAR_W`, `BOSS_HP_BAR_WIDTH`) from metrics.
  - **Scenes** (`scenes/index.ts`, 9,715 lines, 224 draw calls):
    - `CX = FRAME_W / 2`;
    - the WARNING band and the zone card;
    - every `384`-wide rect (`:2795-2816`, `:6583`, `:6617`, `:7368`, `:7552`);
    - panels (`:4593`, `:5065`, `:7176`, `OPTIONS_PANEL`);
    - `PREVIEW_SHIP_X`, the map layout (`MAP_LEFT/TOP/BOTTOM`, `:5981-5996`);
    - credits and story geometry (`CREDITS_TOP`, `CREDITS_STOP_Y`, row heights).
  - **Behaviours and systems:**
    - `laserLength: 384` defaults (`behaviors/index.ts:1123,1384,1458,2024,2149,2606,2724`) → `PLAYFIELD_W`;
    - `PLAYFIELD_W - p.lineX` stays (already derived);
    - the boss `length = W`, `BOSS_REST_X = W + 40`;
    - spawn and cull edges in `enemies`, `bullets`, `weapons`, `powerups`, `player`, `stage/systems.ts`;
    - the world grid size (`world/index.ts:1849`).
  - **Content and validation:**
    - `data/campaign.ts:126,135,157` line caps from `FRAME_W / GLYPH_W`; the WARNING width note (`bosses:312`);
    - schema bounds that encode the frame (`data/index.ts:2227-2230`, `:2244`, `:2369`, `:2497`, `:2676-2697`,
      `:2867-2914`) derived from the playfield.
  - **A test that scans `packages/core/src`** for the literals 384 / 216 / 208 / 200 in frame positions (an
    allow-list for the few unrelated uses, e.g. `UI_COMMANDS 384` is a count) so they cannot creep back.
- **Acceptance:** goldens and attract demos unchanged; `pnpm test` green; the scan test passes. A throwaway branch
  that sets `FRAME_W/H` to 640×360 compiles and boots, and its title, menus and HUD lay out sensibly (content not
  yet ported).
- **Refs:** Appendix A.1.
- **Manual (owner):** none.
- **As built** (16 commits in six lanes, T0–T5, 2026-10-17; step review round 1 clean — its one finding was R0-02's red CI,
  fixed by `332e581`):
  - **The constants** (`48465fb`, `packages/core/src/config/index.ts`, exported from `@shmup/core`): `FRAME_W` 384,
    `FRAME_H` 216, `FRAME_CX` / `FRAME_CY` (the centre, beyond the scope's list — the scenes' old `CX = 192`),
    `HUD_BAR_HEIGHT` 8, `PLAYFIELD_Y`, `PLAYFIELD_W`, `PLAYFIELD_H` 200, `PLAYFIELD_CY` 100, `HUD_BOTTOM_Y` 208,
    `TILE_SIZE` 8 (moved from `core/data`, same barrel name) and the font metrics `GLYPH_W` 6, `GLYPH_H` 8, `LINE_H`
    10 — plain module constants, every one a whole number. `frame-constants.test.ts` pins their values and
    relations, the font metrics against `pixel6x8.font.json`, and `DEFAULT_GAME_CONFIG.internalWidth/Height`
    reading `FRAME_W` / `FRAME_H`.
  - **The presentation fingerprint first** (`319b7dc`, beyond the scope): the goldens hash only the simulation, so
    `test/integration/presentation-fingerprint.test.ts` hashes what core hands a renderer (UI, HUD, World view,
    screen effects) along scripted walks through every scene — **119 segments over 12 walks**, pinned on the v1.0.0
    code (`333721b`) before any change. Review round 1 of that lane found the co-op end screens, the co-op shield
    pips and the Direct co-op HUD never drawn; two co-op walks pinned on pre-change `4dfca16` were added
    (`f529135`). It stayed green, unedited, through every R1-01 commit. Re-pinning:
    [conventions.md](docs/dev/conventions.md#frame-numbers-the-literal-scan-and-the-fingerprint).
  - **Scenes** (`ee262f6`, `7a7935d`, `849b860`): menus and panels anchored to `FRAME_CX` / `FRAME_CY` and the
    edges; centred dialogs take their y from `FRAME_CY` too (beyond the scope); panel widths and heights stay
    literal — they are sized by their 6×8 text, so R2-01 / R4-03 scale them for the 9×12 font; `SCENE_EXIT_X =
    FRAME_W + 36`. The story crawl and the ending epilogue panel stay **top-anchored** on purpose (their vignettes are
    top-left art that R4-05 redraws). The co-op paths were checked by hand against v1 (46 checks).
  - **UI** (`8861c5d`, `1b3dd47`, `0e26d30`): `HUD_LAYOUT` and the UI kit's sizes from the frame and the font
    (`SLIDER_BAR_W = 8 · GLYPH_W + 2`, `NAME_CELL_PITCH`, `BOSS_HP_BAR_WIDTH` = the hi-score's width, player 2's x
    leaving room for an 11-glyph `PRESS START`), the campaign's line caps from `FRAME_W / GLYPH_W`; the co-op HUD
    checked against v1 in 25 variants; `ui-hud-layout.test.ts` writes the layout's relations in the constants.
  - **Systems** (`6d13a91`, `01ff63f`, `4dfca16`): `laserLength` defaults → `PLAYFIELD_W`, `BOSS_REST_X =
    PLAYFIELD_W + 40`, the spawn and cull edges, the point items' score targets (`POINT_ITEM_TARGETS` — its x margin
    40 may follow `HUD_LAYOUT` in R4-03); `behaviors-frame-defaults.test.ts`, `bosses-warning-width.test.ts`.
  - **Data bounds** (`6a6000e`): the schema bounds from the playfield; `DEFAULT_BOSS_X = PLAYFIELD_W − 88`,
    `DEFAULT_BOSS_Y = PLAYFIELD_CY`, `DEFAULT_BLOCK_SCREEN_X = PLAYFIELD_W + 16`; `frame-bounds.test.ts`.
  - **The scan** (`e21bdc6`, `dca4613`): `packages/core/test/frame-literals.test.ts` parses `packages/core/src` with
    the TypeScript compiler (comments never read; numbers inside strings and templates checked) and fails on the
    v1 frame's `384`, `216`, `200`, `208` **and its centre `192` / `108`**, plus whatever `FRAME_W`, `FRAME_H`,
    `PLAYFIELD_H` and `HUD_BOTTOM_Y` are now (so `640`, `360`, `336`, `348` once R2-01 flips them) — beyond the
    scope's four. `100` and the new centre `320` / `180` are left out (ticks, percentages, scores). **18 allow-list
    entries**, keyed by file, symbol path and value with a count and a reason: the constants' own definitions,
    counts (`UI_COMMANDS`, `SHOT_BATCH_CAPACITY`), a character cap, angles (135° = 384 binary units), the generated
    `ATAN_TABLE`, `bossSuction.pullRadius` 200 (a world radius), text-sized panels — `WEAPON_PANEL.h` /
    `ORDER_PANEL.h` 192 marked "R2-01 decides" —, a text column and `INVASION_BLASTS` (R4-05 art).
  - **Acceptance:** goldens and demos unchanged; the v1 baseline green (the review also ran it on pre-R1-01 core:
    equal, so R1-01 moved nothing in the simulation); `pnpm test` green after `332e581`; the scan passes.
  - **The 640×360 experiment** (local, never pushed — `FRAME_W/H` 640×360, `HUD_BAR_HEIGHT` and `TILE_SIZE` 12): core,
    render-pixi and shell type-check; the shipped content does not load as-is (the tile-size locks — expected before
    R2-02), but with tile sizes patched in memory all 13 fingerprint walks run and nothing throws; no UI or HUD
    command leaves the frame that does not already at 384×216; the hi-score table, Options pages, ending card, EXTRA
    menu and co-op game over centre on (320, 180); the HUD bars are 640×12 at y 0 and 348, the co-op halves split at
    320. A browser boot meant nothing before R1-02 (render-pixi still defaulted to 384). What it showed for later:
    - **R2-01:** the scan will ask for four entries at the flip — the 360-tick timers `EndingScene.drawCitadel.sink`
      ×2 and `StoryScene.drawDawn.rise`, and the angle `640` in `DIRECTION_HEADINGS`; `packages/core/test/index.test.ts`
      pins `internalWidth` 384; `bossWidow.maxX` 320 equals the new centre by chance.
    - **R4-03:** HUD text is 8 px tall in 12-px bars; the one-player meter slots and the Direct HUD stay packed into
      x 58–338 (the right half of the bottom bar empty); the weapon select's left panel stays 184 px wide (29 % of
      the frame); the meter-slot sprite becomes 60 px at ×1.5 against a 40-px slot; es "TIEMPO" overlaps the
      caravan clock and "¿SALIR DE SHMUP CUP?" (180 px at a 9-px font) outgrows the 176-px confirm panel.
    - **R4-05:** the story crawl (`STORY_WINDOW_TOP` 132 / `BOTTOM` 206, `STORY_PANEL.y` 128) and the epilogue panel
      (`ENDING_TEXT_PANEL.y` 124) float mid-screen with ~150 px empty below; the vignettes sit top-left; the ending
      card stretches to 560 px.
    - **Already so at 384×216:** the ship select leaves the title's EXTRA / EXIT visible below its panel; the caravan
      clock reads `TIME179` with no gap.
  - **For R2-02 — code view points no rescale tool sees** (behaviour tunables' defaults; decide frame-anchored or
    world per §2.6, [enemies-and-behaviors.md](docs/dev/enemies-and-behaviors.md)): `orbiter.loop` waypoint
    (256, 100) — test-range only; `cube.pincer` `meetX` 176; `captain.ram` `ramX` 40 and `captain.crab`'s box
    250–340 × 40–160 (both in the boss rush); `boss.widow`'s box 250–320 × 56–144 (zone C uses the defaults);
    `rear.swoop` `turnX` 280; `boss.walker` `frontX` 96 / `backX` 280; `boss.steed` stays consistent only if its
    `rx` 8 becomes 12; and `captain.circler`'s **content** home (x 332 = `cx + rx`) needs a hand fix after the port,
    because `cx` follows the frame and `rx` is world (530 ≠ 498 by ×1.5 ≠ 562 right-edge-anchored).

### R1-02 — Frame constants in presentation, hosts, scripts and tests

- **Goal:** the same for everything outside core.
- **Depends on:** R1-01.
- **Scope:**
  - **render-pixi:**
    - renderer defaults (`renderer/index.ts:745-746`) from core;
    - `LAYER_EFFECT_ROWS` (`effects/shaders.ts:64`) and `layer-effects.ts:264`;
    - Mode-7 uniforms (`mode7.ts:140-142,182-183,263-264`) and `raster.ts:134`;
    - popup clamps (`effects/index.ts:679,735`);
    - the terrain view size (`layers/index.ts:304-307`);
    - `offsetY` defaults (`sprites:277`, `particles:574`);
    - the debug overlay's literal `384`s (`debug/index.ts:1038,1083,1088`), with its `COL`/`ROW` from the font.
  - **Mode-7 multi-page bug:** the shader always binds `atlas.pages[0]` (`renderer/index.ts:892`) while
    `mode7TileRect` uses the tile's own page. Bind the tile's page. It is harmless today (one page) and a bug as
    soon as R3-04 adds pages.
  - **shell:**
    - `flight`, `showcase`, `fx-gallery` (literal bar rows 0/208, height 8);
    - `scene-view:162`;
    - `memory/index.ts:130-133` `FRAME_*`;
    - the boot passing `width`/`height` to the renderer explicitly (`boot/index.ts:956`);
    - telemetry's reported size.
  - **audio-web:** stereo pan width (`engine:386`, `sfx:242`).
  - **electron:** window defaults and max scale (`window-state.ts:40-43,182,212`, `window-options.ts:65-70`) from
    the frame.
  - **scripts:**
    - `tiled-import.mjs:76-82` (`TILED_TILE_SIZE`, `VIEW_WIDTH`, `SPAWN_LEAD`);
    - `store-assets.mjs:46-48`, `doc-screenshots.mjs:43-44,239`, `doc-images.mjs:353`.
  - **tests:**
    - one shared helper for "frame pixel → screen pixel" in `test/e2e/` (25 specs hard-code `3x+1` today), and
      the viewport (`playwright.config.ts:107,125`) from the frame (×3 at 384×216 now, ×2 at 640×360 later);
    - `stage.spec.ts` and `mode7.spec.ts` loops;
    - render-pixi unit tests with literal sizes (`layers-stage.test.ts:117,122` cell counts, `crt-blit.test.ts`,
      the viewport tests).
- **Acceptance:** goldens unchanged; `pnpm test`, `pnpm test:e2e` and `pnpm bench` green; a repo-wide scan test
  (like R1-01's) over `packages/*/src`, `apps/*/src` and `scripts/`.
- **Refs:** Appendix A.1, A.2; owner decisions O8 (pinned mirrors), O9 (the capture scale).
- **Manual (owner):** none.
- **As built** (14 commits in four lanes, a–d, plus the orchestrator's `64f106f`, 2026-10-17; review round 1 (a–c)
  found two majors, fixed by `ac4de59`; round 2 clean; round 3 (d) two minors, fixed by `6a4f5af` / `10c9811`; round
  4 clean):
  - **render-pixi** (`5ec7ac5`): the renderer, the layer effects and the Mode-7 floor default to `FRAME_W` / `FRAME_H`,
    `LAYER_EFFECT_ROWS = FRAME_H`; the debug overlay's `COL` / `ROW` are `GLYPH_W` / `LINE_H` and its `384`s
    `PLAYFIELD_W`. The scope's other lines (popup clamps, the terrain view, `offsetY`, audio-web's pan width) were
    already derived — checked only. **The Mode-7 page bug is fixed:** `Mode7Floor.bind(view, tile, page?)` passes the
    tile's own atlas page and the new `Mode7Shader.setPage(page)` swaps the shader's texture at bind time only (a new
    required member — `dimension-runtime.test.ts`'s fake gained it); `mode7-pages.test.ts` over a two-page atlas fails
    on the old code.
  - **shell and Electron** (`6007ad9`, `31d99ae`): a shell fingerprint first — `packages/shell/test/frame-fingerprint.test.ts`
    hashes five walks through flight, showcase and fx-gallery, pinned on the unchanged code (re-pin only on purpose,
    `SHMUP_FINGERPRINT_PRINT=1`); then the scenes' bars from `HUD_BOTTOM_Y` / `HUD_BAR_HEIGHT`, their labels from
    `FRAME_W` / `FRAME_CX`, the flight WARNING band at `FRAME_CY − 8 − H/2`, the memory estimator's defaults, and the
    boot passes `width: FRAME_W, height: FRAME_H`; telemetry already reported the renderer's own size
    (`renderer.width` / `height`). Electron's main process cannot import core, so `window-state.ts`
    keeps a mirror `FRAME_WIDTH` / `FRAME_HEIGHT` (O8) pinned by `window-frame.test.ts`; the default window scale is
    `floor(1280 / FRAME_WIDTH)` and the largest `floor(3840 / FRAME_WIDTH)` — 3 / 10 now, 2 / 6 at 640×360 (§2.7).
  - **Scripts and browser tests** (`2771f2d`, `72491f5`, `8c6792d`, `8a043bb`): `scripts/frame.mjs` is the Node scripts'
    plain-JS mirror of core's frame constants plus `SPAWN_LEAD` (`PLAYFIELD_W + 16`) and `CAPTURE_SCALE`
    (`floor(1280 / FRAME_W)`, O9), pinned export by export by `test/scripts/frame.test.ts`. `tiled-import.mjs`,
    `store-assets.mjs` (screenshot scale `min(⌊1920 / FRAME_W⌋, ⌊1080 / FRAME_H⌋)`, so the store shots stay 1920×1080
    after the flip instead of growing to 3200 px), `doc-screenshots.mjs`, `doc-images.mjs` and the Playwright viewport
    read it; `test/e2e/frame-pixels.ts` (`VIEWPORT`, `SCALE`, `sx`, `sy`, `pixelIndex`, the constants) replaces the
    specs' `3x + 1`, and 30 specs take their frame numbers from it. The store placeholders and doc images came out
    byte-identical. Review round 1 found HUD rows, the boss bar's x and screen-centred boxes still literal in `lives`,
    `advanced-bosses` and `fx-gallery` and in `doc-screenshots.mjs`' title blink band (`ac4de59`; the fx-gallery box
    moved 4 px to centre on the burst, flight's top scan grew to `HUD_BOTTOM_Y`). Rows that come from content (the
    zone specs' bands and skies, Mode-7 rows) stay literal for R2-03.
  - **The repo-wide scan** (`8540fc8`, `308d6e0`, `6a4f5af`): R1-01's scanner moved into the shared test helper
    `packages/core/test/helpers/frame-literal-scan.ts` (core's own scan uses it — the same 18 entries and identical
    hits). `test/integration/frame-literals-repo.test.ts` parses every other package's `src/`, every app's `src/` **and
    `scripts/`** and the root `scripts/` — 148 files today, the trees read from disk so a new package or app joins by
    itself — and bans the same numbers. **It found no real frame literal outside core** (a–c had derived them all), so
    its allow-list holds **22 entries (23 literals)**, keyed by file, symbol path and value with a reason: the four
    mirror definitions (whose entries read `value: FRAME_W` / `FRAME_H`, so they follow the flip), the TV bench's
    384×216 row (×4), five HTTP 200s, the Backquote keyCode 192, six alphas, two colour channels and a brightness sum.
    `apps/*/scripts` was beyond the acceptance's list; review round 3 added it after finding "the game renders 384x216
    x5" in `apps/webos/scripts/appinfo.mjs`, which now derives that message from `scripts/frame.mjs`. **Not scanned:**
    `test/`, the `vite*.config.ts` files and `vite.shared.ts`, `apps/*/index.html`, `apps/tizen/bench/`,
    `apps/tizen/polyfills/` and `tools/` (review round 3 found them clean, `tools/`' bench data and HTTP codes aside).
  - **The boss-bar pin** (`859632f`, `10c9811`): specs cannot import core, so `frame-pixels.ts` derives the boss HP bar's
    place the way `core/ui` does — `BOSS_LABEL_X`, `BOSS_LABEL_W`, `BOSS_BAR_X`, `BOSS_BAR_W`, `BOSS_FILL_Y` (148, 24, 176,
    64, 3 today) from `FRAME_CX` and `GLYPH_W` — and `test/scripts/frame.test.ts` checks each against what core's real
    `buildHud` draws for a frame with the bar up, and against `HUD_LAYOUT`; a 1-px move in core fails it.
  - **The render bench's ×2 scenario** (`e9e5af7`): `render.perf.ts` defaults to `FRAME_W` × `FRAME_H`, and its "knob" is
    `2·FRAME_W` × `2·FRAME_H` — still `768x432 internal (raster-range)` today, 1280×720 after the flip — with the
    pooled-target floor `nextPowerOfTwo(2·FRAME_W) · nextPowerOfTwo(2·FRAME_H) · 4` (2 MiB today, 8 MiB then).
  - **Build:** the webOS appinfo check imports `scripts/frame.mjs`, so `turbo.json`'s `globalDependencies` lists it
    (`64f106f`; master CI 39056150718 had failed `tv-engine-floor`'s cache-key test until then).
  - **Acceptance:** goldens, demos, the v1 baseline and the presentation, shell and content-DB fingerprints unchanged;
    Tizen `app.js` 397.1 KB gzip; master CI 39066101927 (at `3943f8a`) green — test shards, every e2e shard and the
    build + benchmark job.
  - Notes for later steps are in R2-01 and R2-03.

### R1-03 — Units in the content schemas, and the rescale tool

- **Goal:** the content loader knows **what every number means**, so the ×1.5 port is a tool run, not 28 stage
  files edited by hand.
- **Depends on:** R1-01.
- **Scope:**
  - **A unit on every numeric schema field** (`s.num({ unit })` / `s.int({ unit })`). The units:
    - `world-px`, `world-x`, `world-y` (absolute positions in the level);
    - `rel-px` (offsets, waypoints, part offsets);
    - `px-per-tick`, `px-per-tick2`;
    - `screen-x`, `screen-y` (edge-anchored — §2.6);
    - `tile-rows`, `ticks`, `angle`, `count`, `score`, `ratio`.
    - A test fails if any numeric field in any content kind has no unit.
  - **`scripts/content/rescale.mjs --factor 1.5 --top-pad 36 [--dry-run]`.** It walks every content file with its
    schema and applies §2.6's rules by unit:
    - world ×k plus the top pad for absolute y;
    - edge-anchored values keep their distance to their edge;
    - relative and speed values ×k;
    - ticks, angles and counts untouched.
    - **Tilemaps** gain the top rows (copies of the top row), keeping heightfield / RLE semantics; heightfield
      parameters measured from the floor stay floor-anchored.
    - **Tileset masks** (8 entries per tile) are re-sampled to 12.
  - It reports every value it could not classify, and refuses to write while any remain.
  - Tests: factor 1 is the identity on all shipped content; fixtures with known ×1.5 outputs; a round trip of a
    small stage through the loader.
- **Acceptance:** the unit test covers every kind; `rescale --factor 1 --dry-run` reports zero changes on the
  shipped content; the README of `content/` documents the units.
- **Refs:** Appendix B; `docs/dev/content-data.md`.
- **Manual (owner):** none to do. O11 (ground spawns keep their terrain spot) is built as the default and waits for
  the owner's confirmation; it blocks nothing.
- **As built** (14 commits — lanes R1-03a–b and R1-03c–d, then five fixer rounds — 2026-10-17; six review rounds —
  1: two majors, 2: one major and four minors, 3: one major and two minors, 4: three minors, 5: one minor, 6: **zero
  findings**):
  - **The content-DB fingerprint first** (`75c227c`): `test/integration/content-db-fingerprint.test.ts` hashes every
    `ContentDb` field and the sfx, music, input-profile and fx loaders' output for the shipped content and the
    examples, pinned on the unchanged loader. It stayed green unedited through every R1-03 commit: no parsed value
    moved.
  - **Schema metadata and the units** (`14dcd2a`, `c9ea100`, `7fdca2d`, `160d68f`): every schema carries a frozen `meta`
    (`SchemaMeta`, required; the parser never reads it), `s.int` / `s.num` take a `unit`, and `s.custom(typeName,
    parse, meta)` builds the hand-made schemas (the pattern DSL's expressions, speeds and node lists; a demo's opaque
    recorded config). `core/data/units.ts` has **26 units** — the scope's 14 plus `band-y`, `texels`, `tile-px`, the audio
    units of O1, O2's `seed` / `version` / `index`, and two looked up: `param` (O5's `BEHAVIOR_PARAM_UNITS`, all 65
    behaviours) and `inherit` (a pattern's `$1`…`$9`) — each with a rule (`UNIT_RULES`, `rescaleNumber`, O3's
    `edgeAnchor`), and the walkers `listNumberFields` / `walkNumbers`. All 150 `s.num` / `s.int` of `core/data` have one;
    `WORLD_COORD` split into `WORLD_X` / `WORLD_Y`, the heightfield profile into a floor (`base` `rel-px`) and a
    ceiling (`base` `world-y`). Core exports `CONTENT_FILE_SCHEMAS` (`loadContent` parses with it) and the other
    packages their file schemas (`SFX_FILE_SCHEMA`, `MUSIC_FILE_SCHEMA`, `INPUT_PROFILES_FILE_SCHEMA`, `FX_FILE_SCHEMA`).
    Classifications worth knowing: a waypoint's x is `screen-x` and its y `world-y` (like a spawn's); boss x / y are
    `screen-x` / `screen-y`; Mode-7 `scroll` / `sway` are `ratio`; five tunables differ from their names
    (`captain.circler.speed`, `boss.steed.bobSpeed`, `captain.crab.turn` are angles, `volcano.lob.spread` a speed,
    `direct.bolt.turn` a switch). The units modules are tooling only — a test keeps game code from importing them —
    so `app.js` grew by the unit strings alone (+0.7 KB gzip, 397.1 KB of 512).
  - **The tool** (`2cb59e9`, `fda9138`, `007feef`): `scripts/content/rescale.mjs` reads every content file and the
    `example.*.json` samples with its kind's file schema (the packages through Vite's `ssrLoadModule`), skips
    `content/demos/` (recordings are re-recorded), applies each unit's rule, replaces only the changed numbers in the
    source text and formats with Prettier, rounds and lists integers (O4), and refuses to write while anything is
    unclassified or invalid. `content/README.md` documents the units, the pairs and the tool.
  - **Deviations from the scope, each with its reason:**
    - **Field pairs** (review round 1; `277c709`, wired by `007feef`): a moving block's `x + screenX` is its world left
      edge, so the two port as a **world sum** — `x′ = 1.5·(x + screenX) − screenX′`, only the column snaps
      (400 → 664). Ported alone, the bonus-range and zone-b gap entrances' bricks drifted 64 px off their regions.
      Ground-enemy spawns carry the same pair (O11). A box's `y` + `h` (blocks, trigger and bonus regions) ports by its
      edges, so a box hanging from the top edge grows by the pad (0 + 24 → 0 + 72) instead of moving down.
    - **`band-y` and `rescaleBackdrop` instead of `screen-y` for `parallax[].y`** (round 1 asked for `screen-y`; tried,
      it opened 18-px gaps in 21 stages' tile stacks and lifted spires off the bottom edge, while `world-y` leaves a
      36-px empty strip above every top band and ×k alone lifts every bottom band): the bands are placed as one
      layout with the raster and Mode-7 rows from their art heights — top-edge bands ×k, bottom-edge bands stay on the
      edge, a band ending on the Mode-7 horizon sits on it, touching bands stay touching, a free band goes by the
      nearer edge — and raster rows follow the band edge they bound. Every stage of the review's table stays aligned,
      with no gap on any shipped stage. A band that touched two anchors keeps one and is listed (`BackdropConflict`,
      `a9aab9e`; none ships).
    - **Camera `yTo` is `rel-px`** (O2, revised): zone D 200 → 300, gimmick-range 72 → 108; no view passes its map.
    - **Pattern parameters are kept** (`$1`…`$9`, unit `inherit`): the fields that use them are ported where they are,
      a scaled expression string becoming `(…) * 1.5`, so each use is ported once however the action combines it
      (two rewrites, both in `example.patterns.json`).
    - **The `example.*.json` samples are ported too** — they are a validated content set of their own. The README
      format samples are not (R2-02).
    - **Timeline crossings are listed, not fixed** (round 2, `74d092a`): a world-sum event fires 64 px of camera travel
      earlier than ×k, so the tool re-sorts each stage's `events` / `remix` by the ported x (five stages, nine swaps)
      and reports each array's old → new index map, and lists every moved event that now fires on the other side of
      a checkpoint, a camera stop, a `flag` event or a trigger's armed window, every ground enemy that leaves or joins
      a `ground` bonus window and every moving block whose drift runs ahead. On shipped content that is gimmick-range's
      falling rock (`events[10]`, branch `high`), which now fires while trigger `events[8]` can still set its flag,
      so both branches could play, and zone-g `events[15]`, which leaves its bonus window. No automatic port keeps both
      the spawn column and the trigger's window, so R2-02 decides by hand; the tool names the `until` that restores
      v1's order.
    - **The map's right end is frame-anchored** (round 3, `32f2ef8`; refined by `5c8af86`, `3943f8a`): a map is
      `length + PLAYFIELD_W` wide, so its end ports to `length′ + toWidth`. A heightfield segment reaching the map's
      last column ends at the new end (zone D 9984 → 15040, gimmick-range 3584 → 5440, weapon-range 2784 → 4240 —
      ×k left the last 64 px of the last view without terrain); a segment the map never shows stays never shown; a
      region reaching the end still reaches it; an RLE row tiled in its last column repeats its last cell
      (`extendRleRow`, the token rebuilt by core's row syntax). A segment that would end before it starts and an RLE
      row core cannot read are errors. The rule lives in the tool only: no new unit, core unchanged.
    - **A strict `--art-scale`, with `--force-art-scale`** (rounds 2–3): the bands' heights come from the atlas (built
      in memory from `assets/source/`, or `--atlas`). The tool measures the art scale from the terrain tiles against
      the tilesets, refuses to run without `--art-scale` when they measure anything but ×1, and refuses a given
      `--art-scale` they contradict (exit 2). `--force-art-scale` is for an atlas whose bands are drawn at another
      scale than its tiles — the one split the measurement cannot see.
    - **Raster `bands` round at their boundaries** (round 2): raster-range's `[2,2,3,3,4,5,6,7,8,8]` →
      `[3,3,5,4,6,8,9,10,12,12]`, boundaries at `ceil(1.5·s)`, where a nearest-neighbour ×1.5 upscale puts the art's
      edges.
    - **The geometry defaults to core's frame** (today's): after R2-01 the real run passes the v1 numbers as flags.
  - **Dry runs** (O6): `--factor 1 --dry-run` — 126 files (10 skipped), 10,623 values, **0 changes**.
    `--factor 1.5 --top-pad 36 --dry-run` — 4,035 changes in 77 files, **0 unclassified, 0 errors**; it lists 1,194
    values moved by a rule other than ×k, 7 on or above the top edge (hunter-range's −24 spawn, the six hanging bricks
    and gap regions), 195 rounded integers, 66 values outside today's bounds, 21 timeline items, 11 backdrop
    placements (no seam, no conflict), 18 padded tilemaps, no view past its map and 2 expressions. Two real runs into
    copies of `content/` came out byte-identical.
  - **Tests:** `test/scripts/content/rescale.test.ts` and `rescale-edge.test.ts` (61 — the fixtures in
    `fixtures/rescale/` with their expected ×1.5 output and a round trip through the loaders, the shipped content at
    factor 1 and at the real 384×200 → 640 geometry; all pass with core flipped to 640×360 and 12-px tiles),
    `content-units.test.ts`, `content-file-units.test.ts`, `behavior-param-units.test.ts`, `schema-meta.test.ts`,
    `units-pairs.test.ts`. The reviews also swept 343,440 ported heightfield segments over 15 geometries, fuzzed 5,456
    RLE rows against core's decoder and checked every listing against independent scans.
  - **Acceptance:** met — every kind's numbers have units, factor 1 is the identity on the shipped content and
    `content/README.md` documents the units; goldens, demos, the v1 baseline and both fingerprints unchanged; master
    CI 39066101927 green.
  - Notes for R2-01 and R2-02 are in those steps.

### R1-04 — Tile size and font metrics are data

- **Goal:** 12-px tiles and a 9×12 font are possible without code edits.
- **Depends on:** R1-01.
- **Scope:**
  - **Tile size:**
    - the tileset schema lock `s.int({ min: 8, max: 8 })` (`data/index.ts:2839`, `:3018`) becomes
      `TILE_SIZE`-driven;
    - collision (`collision/index.ts:716-745`) is already tile-size generic, so prove it with tests at 12;
    - `terrain.mjs` generates any tile size;
    - `test/integration/stage-terrain.test.ts:61` (frame = tileSize², opaque pixels = mask) parametrised.
  - **Font:**
    - the font pipeline accepts any cell size, and `render-pixi/src/text` reads advance and line height from the
      font;
    - `UI_GLYPHS` equality (`ui/strings.ts:508`) unchanged;
    - `MAX_UI_TEXT_LENGTH` (48) stays a character count, but every caller that turned characters into pixels uses
      the metrics.
- **Acceptance:** a test stage at tile size 12 and a test font at 9×12 load, render (Node) and collide
  correctly; goldens unchanged at 8 / 6×8. The browser check is deferred (owner decision O7, 2026-10-17): the
  9×12 font in R2-01's e2e, 12-px terrain in R2-03's e2e.
- **Manual (owner):** none.
- **As built** (`48c8822`, `11f3df6`; review round 1's one finding was this section's text, fixed by `2285fed`;
  round 2 clean):
  - **Tile size (R1-04a):** both schema locks accept `MIN_TILE_SIZE` 8 … `MAX_TILE_SIZE` 12 (exported from
    `@shmup/core`), and `checkTileset` then allows only the set {8, 12} ("must be 8 or 12" — owner decision O10); a
    stage's tilemap must still equal its tileset's size, a check that can now fire. New
    `test/integration/tile-size.test.ts`: every shipped tileset and stage (examples included) uses `TILE_SIZE`, and
    `MAX_UI_TEXT_LENGTH · GLYPH_W ≤ FRAME_W`; `packages/core/test/data/tile-size-range.test.ts` covers the range,
    the set, and a 12-px tileset with its stage, masks and moving blocks.
  - **Terrain at any size (R1-04b):** `scripts/assets/procedural/terrain.mjs` exports `renderTerrainTiles(size,
    name)` (any even size ≥ 4), `lineMask` / `lineMaskEnds` and `resampleMask(mask, from, to)` — straight edges
    between half-tile heights move exactly (every shipped mask is one, so a resampled 8-px mask equals the opaque
    pixels of the 12-px tile), anything else nearest-neighbour; `RangeError` on a bad size or mask. `generate()`
    still draws at `TILE_SIZE`, its 8-px output pinned by a hash taken on the old code. Collision, the stage runtime
    and render-pixi's terrain layer are proven at 12 in Node (`collision-tile-size`, `stage-tile12`,
    `layers-stage-tile12`); `stage-terrain.test.ts` also checks 12-px art against its masks and a 12-px heightfield.
  - **`terrain.mjs` keeps its own `TILE_SIZE` = 8**, pinned to core's by `test/scripts/assets/terrain-size.test.ts`,
    instead of importing it: the pipeline's input hash and turbo's `//#assets` inputs cover only `scripts/assets/**`,
    so an import could leave a stale cached atlas after the flip. **R2-01 flips that copy too** (its scope says so);
    the pin fails until it does.
  - **Font:** no source change was needed — `font.mjs` and render-pixi's text module already read the cell, the
    advance and the line height from the font file. `font-cell-size.test.ts` builds a 9×12 font in the test (a ×1.5
    nearest-neighbour upscale of `pixel6x8` with exactly the `UI_GLYPHS` code points), packs it from a temporary copy
    of the sources and lays text out at advance 9 and a 15-px line; render-pixi's `text-cell-size.test.ts` lays
    out, measures and aligns text with a 9×12 fixture font.
  - **Between R2-01 and R2-02 `tile-size.test.ts` is red** (`TILE_SIZE` is 12, the shipped tilesets still 8) —
    expected; R2-02's port turns it green, never a relaxed test.
  - Kept on purpose: the `+ 200` probe and `findFloor(…, 100, 100)` in `stage-terrain.test.ts` (changing them would
    change what that test checks). Stale tile comments were fixed (`ui/strings.ts`' "widest line is 64" among them).

### R1-05 — Atlas paging and memory ready for detailed art

- **Goal:** many atlas pages are cheap and safe before any detailed art exists.
- **Depends on:** R1-02.
- **Scope:**
  - **Zone-grouped packing:**
    - the packer (`scripts/assets/packer.mjs`, sorted by size and name today) learns **groups**: a `common` group
      (ships, shots, bullets, items, fx, font, UI, HUD) and one group per zone (its tiles, backdrops, enemies,
      boss), each packed into its own page(s);
    - a group comes from the sprite's path (`enemies/zone-d/…`) or a `group` field in the source.
    - Without this, every page holds some global sprite, and the zone residency (`memory/index.ts:519,638`) can
      unload nothing.
  - **Residency:**
    - pages of other zones are unloaded on `PrepareStage` and loaded and decoded *before* the zone starts, never
      mid-play;
    - the decode time of a 2048² PNG on the M7's CPU is measured into the boot and zone-load numbers.
  - **Memory:**
    - `keepPageImages` (`memory/index.ts:284`, default true) is decided: dropping decoded images halves texture
      memory if WebGL context-loss recovery can re-fetch the page;
    - `TEXTURE_BUDGET_BYTES` (32 MiB) is re-derived against the 100 MiB budget, with the new frame and filter
      targets in `estimateMemory`.
  - **Bundle:**
    - the atlas manifest (`main.json`, ~197 KB, inlined into `app.js` at ~22 KB gzipped) moves out of `app.js`
      into a fetched file, so more frames do not eat the 512 KB `APP_JS_GZIP_BUDGET`;
    - `DIST_BUDGET` (8 MB, `check-bundle.mjs:69`) re-derived on purpose: detailed art compresses worse than flat
      placeholders; the Tizen install cap is 120 MB;
    - the repo's PNG encoder can write **indexed PNG-8** for pages whose art fits a palette (most quantised pixel
      art does), which typically cuts PNG size 2–4×.
  - **Tests:** `test/integration/cjk-budget.test.ts:82-84` (pins exactly one 1024² page) becomes a budget, not a
    page count.
- **Acceptance:** with the art artificially split into zone groups, each zone needs `common` + its own pages,
  residency unloads the others (unit test + e2e page count), memory estimates match a hand calculation, and the
  bundle check passes with the manifest outside `app.js`. Goldens unchanged (sprite ids are not reordered — if they
  must be, re-bless and say why).
- **Refs:** decisions **W3-1 … W3-12** (§1 — the wave-3 scout's defaults, adopted); `docs/dev/asset-pipeline.md`,
  `docs/dev/rendering-and-shell.md`, `docs/dev/platform-polish.md` (memory budget).
- **Manual (owner)** — on an M7, nothing blocks on it:
  - **boot a `build:dev` (or test) widget to the title.** It is the first time a TV reads `assets/atlas/main.json`
    with a `file://` XHR (W3-7, never run on hardware). If it stops on **ATLAS MANIFEST FAILED TO LOAD**, the fallback
    is one line per app — import `virtual:shmup-assets-inline` in `apps/{tizen,webos}/src/main.ts` — and relaxing the
    bundle check's rule 10 in the same change (it rejects an inlined manifest on purpose);
  - in the remote Web Inspector, read the canvas attributes **after boot** — `data-shmup-atlas-load-ms` (the atlas's
    share of the boot), `data-shmup-atlas-page-ms` (`manifest:<ms>;<file>:<load>/<decode>/<upload>;…`),
    `data-shmup-atlas-pages` (`0` plus zone A's page), `data-shmup-boot-ms` — and again **after a zone change**
    (launch zone B from the zone map: the change's unload + upload, and the pages it uploaded);
    `__shmupDebug.atlas` (`lastPrepareMs`, `timing`, `pageMs`, `prepare('zone-c')`) gives the same figures in a dev
    build;
  - **in R0-03's run, the `DECODE (R1-05)` table rides the streamed payload** (its `decode` field):
    the saved session is the record — put the "Decode and upload" section of `analyze-bench.mjs`
    (with its R3-04 zone-load estimate) into `docs/dev/input-probe-results.md` §12 (R0-03's agent
    part). Photograph the table the bench shows under its matrix table only as the fallback, when a
    session's payload never reached the log server or has no `decode` field — check right after the
    run, before the TV is reset. A page noted `decoded from the URL instead` means the TV refuses
    `file://` XHR — report it: the game's manifest fetch would fail too.
- **As built** (2026-10-17; lane A `ab400a3`, `b30bd4b`, `d4f305b`; lane B `a39de75`, `ce5408b`, `6941af7` (CI fix),
  `c6c8666` and review fix `56f9ced`; B4 `4289726`. Review loops: lane A round 1 clean; lane B round 1 found three
  majors — the weapon select's preview page, Pixi's texture GC, per-page timing — fixed by `56f9ced`, round 2 clean;
  B4 round 1 clean. Master CI green at `56f9ced`):
  - **PNG-8 (A1, W3-3):** `scripts/assets/png.mjs` `encodePng(image, { indexed: 'never' | 'auto' })`, plus
    `indexedPalette()` and `MAX_PALETTE_SIZE` (256). `'auto'` writes colour type 3 (`PLTE`, `tRNS` for the entries with
    alpha < 255 only, filter None) when a page has ≤ 256 distinct RGBA values, else RGBA; lossless (a transparent
    pixel keeps its RGB) and deterministic (palette ordered translucent-first, then by packed RGBA). Only the atlas
    pipeline and the bench atlas opt in; the default `'never'` is byte-identical to the old encoder, so the doc images
    and store icons did not move (`docs:images --check`, `store:assets --check`).
  - **Groups and manifest format 2 (A2):** `packRects` packs each `group` on its own pages — the ungrouped items
    first, then `groupOrder`, then the other groups by name; an empty group makes no page; an ungrouped result is the
    old layout exactly. `MANIFEST_FORMAT_VERSION` is **2**: `pages[i].group`, page 0 = `main.png` = `common`.
  - **The zone split (A3, W3-1)** — the plan's "a `group` field in the source" became a **content-derived groups
    file** plus a path rule (lane A review note 3; `SpriteDef.group` is set by the pipeline only):
    `assets/source/atlas-groups.json` (format `shmup-atlas-groups@1`, 125 base names) lists the sprites exactly one
    campaign zone names (its stage, enemies, children, bosses, tileset, linked bonus stage); `resolveAtlasGroup`
    reads the file by base name before `@`, then a `zone-<id>` directory segment (`enemies/zone-d/…`, for future art),
    else `common`; engine, UI and scene-view sprites and fonts always go to `common`. The file is part of the
    pipeline's input hash; `test/integration/atlas-groups.test.ts` fails while it differs from the derivation
    (`SHMUP_ATLAS_GROUPS_UPDATE=1` rewrites it). The shipped atlas is **10 pages**: `main.png` common 1024×512 (RGBA,
    79,640 B) and nine zone pages of 256×128 / 256×256, eight of them PNG-8 (zone B's sea gradient has more than 256
    colours) — **120,400 B** in all against 136,592 B for the old 1024² page; a zone keeps 2 MiB (common) + 128–256 KiB
    on the GPU instead of 4 MiB. Zone A's boss parts stay in `common` (zone H's parade reuses them). Sprite names,
    frame names and ids never depend on the grouping, so no golden moved; 53 canvas captures of the grouped and the
    ungrouped build at frozen ticks were byte-identical.
  - **Deviations in A3:** `buildAtlas({ ungrouped: true })` / `collectSprites({ ungrouped })` packs everything into
    `common` without reading the groups file — the pre-R1-05 one-page atlas byte for byte. **The TV bench builds from
    it** (`bench-atlas.mjs` `benchSourceAtlas()`), so its ×1 page is the old `main.png` and its 1 / 1 / 2 pages and
    R0-02 / R0-03's figures stay comparable. **`cjk-budget.test.ts`** keeps the M3-03 figures (1,048,576 px,
    136.6 KB, 0.95, 46 %) **live, measured on that ungrouped build**, and holds the shipped split to a budget instead of a
    page count: every page ≤ 2048², Σ PNG bytes < `ATLAS_PNG_BYTES_CAP` = 256 KiB, the same frames and area as the
    one-page build. Its `DIST_BUDGET` = 8 MiB pin moved out (the check-bundle tests and `tv-engine-floor` still pin it).
    `atlas-zone-sprites.test.ts` replays 11 goldens (zones A–I and both linked bonus stages) and finds every sprite the
    World hands the renderer in the zone's set or the global one — no gap in `stageSpriteSets`' walk.
  - **The manifest out of `app.js` (B1, W3-7):** the build emits `dist/assets/atlas/main.json` (the pipeline's own
    bytes). `virtual:shmup-assets` now exports `{ manifestUrl, atlasDir, manifestDigest }`; the inlined
    `{ manifest, pageUrls }` lives on as **`virtual:shmup-assets-inline`** (the render bench harness, and the TV
    fallback). The shell's `loadAtlasManifest` fetches it with **XHR** through audio-web `loadArrayBuffer` (status 0 =
    success on `file://`, D25; no new literal 200), checks the **digest — 32-bit FNV-1a over the file's bytes**, not its
    text (the same function in `vite.shared.ts` and the shell, pinned equal) — then the format version (1 or 2) and the
    shape. New boot error **ATLAS MANIFEST FAILED TO LOAD** (load / parse); a digest or version mismatch reuses ATLAS
    DOES NOT MATCH ITS MANIFEST. Pages load through `loadImagesTimed` (a guarded `decode()`; a rejected decode still
    counts as loaded). Bundle-check **rule 10** (Tizen's exported `checkAtlasManifest`, imported by webOS): `main.json`
    exists, parses and lists every page with its real size, no atlas PNG is unlisted, and `app.js` names at most
    `MAX_INLINED_FRAME_NAMES` (8) frames — the game widget only, the bench inlines its own atlases. Tizen `app.js`
    **406,651 → 384,287 B gzip (−22,364 B)**; 376 KB at the end of the step.
  - **Budgets and the estimate (B2, W3-4 / W3-5):** `AUDIO_BUDGET_BYTES` = **24 MiB**; `TEXTURE_BUDGET_BYTES` =
    `textureBudgetFor({ FRAME_W, FRAME_H })` = 100 − 24 heap − 24 audio − `fixedTargetBytes(frame, 1920×1080, 2
    filters)`, floored to whole MiB: **26 MiB at 384×216** (targets 26,263,552 B), **23 MiB at 640×360** (29,999,104 B).
    `estimateMemory().withinBudget` judges the atlas against `textureBudgetFor` of the estimate's own frame;
    `imagePages` and `estimateStageMemory`'s `imagePolicy: 'all' | 'resident' | 'none'` charge the decoded images of
    **every** page under the runtime's policy "all" (`keepPageImages` stays true, W3-2), `resident` models the lazy
    policy for R3-04. `DIST_BUDGET` stays 8 MiB with its derivation in `check-bundle.mjs`' docblock. `memory-hand.test.ts`
    checks every campaign zone against an independent hand calculation at the current frame, 384×216 and 640×360, and
    pins both budgets.
  - **Residency (B3a + `56f9ced`, W3-2 / W3-6 / W3-9):** render-pixi `uploadTextureSource(source)` (Pixi's
    `texture.initSource`, cold) and `createAtlasResidency(pages, needs, { upload?, onChange?, now? })`: a prepare
    unloads, then **uploads every needed page without a GPU copy**, eagerly — at boot for the boot stage (before
    `warmUp()`), on every `PrepareStage`, and on every **new World on screen**: the trigger finds the shown World
    (`worldOfView` — the game's own, or a stack scene's `world`: the attract demo, a replay), not `game.world` (the
    game scene's World, not the demo's); the weapon select's `preview` (the dev `weapon-range`) is deliberately not
    placed. Review round 1's fixes: the **self-healing unload** — a prepare unloads every page the stage does not need
    whether or not it believes it resident (the preview draws `terrain-a` from zone A's page behind its back; the
    counters still count only believed-resident pages); **atlas pages out of Pixi's texture GC** (`createAtlas` sets
    `autoGarbageCollect = false` — `ImageSource` forces it on, and the GC dropped an idle page after 60 s); and the
    per-page timing on the canvas. Timing lives in **`Shell.atlasTiming`** (the window's `performance.now()`, not
    `ShellOptions.now`, whose boot tests count calls): manifest ms and bytes, per page load / decode / upload ms,
    total. Canvas attributes `data-shmup-atlas-pages`, `data-shmup-atlas-load-ms` and **`data-shmup-atlas-page-ms`**
    (written at boot and per stage change, never per frame); `__shmupDebug.atlas` = `{ resident, unloads, uploads,
    lastPrepareMs, timing, pageMs, prepare(stageId) }` in dev / test builds. `e2e/atlas-residency.spec.ts` covers the
    fetch, both error screens, the Tizen `file://` boot, the page swap zone B → C, the attract demo's pages and the
    preview page leaving the GPU — WebGL's own view (`texImage2D` / `deleteTexture` hooked), not only the attribute.
  - **The decode scenario (B4, W3-6)** — the TV render bench's **19th page load**, after the unchanged 18-scenario matrix
    (`DECODE_SCENARIO_INDEX` 18, `BENCH_RUN_LENGTH` 19; render labels still `n/18`, the `done` flag rides on the decode
    payload): four pages generated at bench-build time (`apps/tizen/scripts/bench-decode.mjs` — a synthetic 2048² RGBA
    page, 2.50 MB; the same art as 2048² PNG-8, 0.54 MB; the shipped `common` and zone A pages), each fetched by XHR,
    decoded by an `Image` from a **blob URL** (a second load of the file URL would hit the memory cache), uploaded
    through `createAtlas` + `uploadTextureSource` (CPU time and with `gl.finish()`) and decoded by `createImageBitmap`
    for comparison — 8 repetitions on the TV, medians and p95. Results in a `DECODE (R1-05)` table under the matrix
    table, a `decode` field in the last `render-bench` payload (`DecodeBenchRecord`) and the analyzer's "Decode and
    upload" section with R3-04's zone-load estimate. `dist-bench/` grew to ≈ 4.7 MB (of 8 MiB); the game bundles are
    unchanged; `pnpm bench` opens `?scenario=decode` headlessly.
  - **Not built:** the lazy "resident" policy (B3b — deferred pages, a hold, a re-fetch after context loss; R3-04 at the
    latest, W3-2), and aliasing linked stages to their parent zone — the bonus stages, `escape`, boss rush, the dev ranges
    and the weapon select's preview still need every page (see R3-04's notes).
  - **Acceptance:** each zone needs exactly `common` + its own page (`atlas-groups.test.ts` on `buildAtlas()`, and the e2e
    page count on the real build); the residency unloads the others (`residency-eager`, `boot-residency`, the e2e with
    WebGL's view); the estimate equals a hand calculation (`memory-hand.test.ts`); both bundle checks pass with the
    manifest outside `app.js` (rule 10); goldens, demos, the v1 baseline and both fingerprints unchanged.
  - Notes for later steps are in R2-01 and R3-04.

---

## 8. R2 — The switch: 640×360 with the ×1.5 port

### R2-01 — Flip the frame; interim art; versioned saves and replays

- **Goal:** the game boots at 640×360 with everything drawn at the new size, even though the art is temporary.
- **Depends on:** R1-01 … R1-05.
- **Scope:**
  - **Constants:** `FRAME_W/H` = 640×360, `HUD_BAR_HEIGHT` = 12, `TILE_SIZE` = 12.
  - **Interim font:** the 6×8 font upscaled to 9×12 (nearest-neighbour, at pipeline time; it looks uneven and
    is temporary until R4-03).
  - **Interim art:** a pipeline stage `interimScale: 1.5` that upscales every sprite source nearest-neighbour
    (procedural generators run at their native size first). Every sprite name exists at its new size; the tiles
    are 12×12; anchors are scaled. The terrain tilesets are left out of the upscale: `terrain.mjs` already draws
    at `TILE_SIZE` (R1-04), so after the flip it draws 12-px tiles itself — and its own `TILE_SIZE` copy flips with
    core's (`terrain-size.test.ts` pins them).
  - **Saves and replays** (§3.4): save migration 2 → 3 (v1 hi-score tables → `legacyScores`);
    `REPLAY_FORMAT_VERSION` and `RUN_REPLAY_FORMAT_VERSION` → 2, plus the header's frame size checked, so v1
    replays are refused with a clear message (a string id in `DEFAULT_UI_TEXT` and the three string tables).
  - **Hosts:** Electron `window.json` version bump and re-fit; CRT pitch re-checked at ×3 / ×2.
  - **Notes from R1-02 and R1-03** (their As built and reviews):
    - **The interim upscaler is plain nearest-neighbour**, source row `floor(d / 1.5)`: the rescale tool rounds raster
      `bands` to `ceil(1.5·s)`, which is where that sampling puts the art's edges (pixel-centre sampling would land the
      `.5` boundaries 1 px higher). **The terrain tiles must come out at 12 px** (`terrain.mjs`), next to the ×1.5
      bands: R2-02's `--art-scale` guard measures the tiles and takes them for the bands.
    - **The frame-literal scans at the flip** (they then ban 640 / 360 / 336 / 348): allow-list or rework render-pixi
      particles' 360° ×5 (angles), the shell's boot-overlay window fallback (`createBootOverlay.fit` 640 × 360),
      `BENCH_SIZES`' 640×360 row ×4 (bench data, like its 384 row) and `terrain.mjs`' colour `'#336a64'` (or teach the
      scanner to skip `#rrggbb`); in core, `EndingScene.drawCitadel.sink` 360 ×2, `StoryScene.drawDawn.rise` 360 and
      the angle 640 in `DIRECTION_HEADINGS` (R1-01). The Electron and `scripts/frame.mjs` mirrors flip with core —
      their pins fail otherwise, and their allow-list entries follow `FRAME_W` / `FRAME_H`; `frame.test.ts`'s
      384-only boss-bar case switches itself off.
    - **Literal, and read by no scan:** `apps/webos/test/boot/boot-wiring.test.ts:28-31`'s fake renderer
      (384×216 ×5); `mode7.spec.ts`'s `place.scale >= 2`, which the `classic` window breaks at 640×360 in a
      1280×720 viewport (×1). (`packages/render-pixi/package.json`'s description and the shell telemetry's
      `internalWidth` / `internalHeight` docblocks no longer name a size — fixed by the wave-3 docs pass.)
    - **The render bench's ×2 scenario becomes 1280×720** (×1 on its 1280×720 display) with an 8 MiB pooled filter
      target (2048×1024): re-read its heap and p95 gates on that run.
  - **Notes from R1-05** (its As built and reviews):
    - **The atlas budget drops by itself:** `TEXTURE_BUDGET_BYTES` = `textureBudgetFor(FRAME)` goes **26 → 23 MiB** at the
      flip (`fixedTargetBytes` at 640×360 = 29,999,104 B); `memory-hand.test.ts` already pins both. The e2e page counts and
      the hand calculation read `main.json`'s groups and `FRAME_W` / `FRAME_H` — nothing to edit there.
    - **The interim ×1.5 art packs into the same zone pages** with no change to `atlas-groups.json` (the names do not
      change).
    - **`ATLAS_PNG_BYTES_CAP` (256 KiB, `cjk-budget.test.ts`) will likely be exceeded** — 120 KB × up to ≈ 2.25 ≈ 270 KB:
      raise it on purpose, with the reason in the commit and the test's docblock.
    - **The live M3-03 figures change:** 479,505 px, 136.6 KB, 46 %, 0.95 and 2.1× are measured on the ungrouped build
      of today's art, so `cjk-budget.test.ts` fails with the interim art until the six documents that quote them
      (`asset-pipeline.md`, `core/ui/strings.ts`, `docs/old/shmup_plan.md`, `docs/old/shmup_progress.md`, `CHANGELOG.md`,
      `options-rebinding-and-accessibility.md`) are updated — that is the test's purpose.
    - **Re-check the TV bench's 1 / 1 / 2 pages** (`TV_BENCH_PAGES`, `render.perf.ts`): the bench builds its density
      atlases from the ungrouped source atlas, and ≈ 2.25× the area may push ×1 onto a 2048² page and ×2.25 past 2 pages.
- **Acceptance:** boots in web, Tizen and webOS builds; title, menus and HUD lay out correctly at 640×360 (e2e
  screenshots analysed at the new viewport), with text drawn in the 9×12 interim font (R1-04's deferred browser
  check); a v1 save loads, keeps its options and archives its scores; a v1 replay is refused. Goldens are expected
  to fail here and are re-blessed in R2-03.
- **As built** (2026-10-18/19; the 61 `(R2-01)` commits `8d89dd2` … `602f8ab` in lanes A0 … A6, B1–B2, C1–C5,
  U1–U3 and the review loops; the flip `72b18a1`; the C5 loop closed at zero with reviews 5 and 6 — wave 00 is
  done; `R2-01.F1` did not run, the full Chromium e2e is 149 passed / 78 skipped / 0 failed):
  - **The sequence** (W4-2): everything buildable at 384 landed first — `ART_SCALE` (`8d89dd2`), save format 3
    (`b93b326`), the replay refusal (`691a79e`), the gates (`31c49c7`), the frame-independent test reworks
    (A3, B2, C2), Electron's window conversion (`346c430`), the interim art stage (`31c0a34`, `f7bcd33`), the
    boot-overlay derive and the scanner's hex-colour skip (`20a5b00`), the uiPx panel layout (`92120c7`) — then
    `72b18a1` flipped the frame, `ART_SCALE` and the mirrors in one commit, and the post-flip lanes (A6, A5, U3,
    C5, the comment sweeps `4b6930a`, `3623be2`, `bc8e05d`) fixed only what the flip moved.
  - **The interim art is built differently from the scope text** ("a pipeline stage `interimScale: 1.5`"): it is
    core's `ART_SCALE` plus `scripts/assets/interim.mjs` (`INTERIM_ART_SCALE`, the pipeline's `artScale` option),
    and the laser beams are drawn natively at the art scale (`16aff20`, W4-5's amendment).
  - **The flip's re-pins, with the commit body's two wrong causes corrected** (A5 review 1 #2, #3, reviewer
    measurements; `72b18a1` cannot be amended): the presentation fingerprint moved on all 119 segments (ui 113,
    hud 81, world 87, screen 3) after two walk fixes (the god-mode game walk, in-test demos); the content-DB
    `core.stages` re-pin (shipped `d6fa1ca40cde8817` → `1c02c14c0a4a7047`, examples `75374beda8914daf` →
    `26f2e401282941b6`) came **only from the map widths** — `terrain.cols` +32, 32 empty tile columns in the 17
    terrain stages — no boss / spawn / block default reaches `core.stages`; and the 3 `screen`-hash moves
    (attract, runA, runB) come from the story crawl and the credits running **longer** (`attract.story`
    1,046 → 1,074 frames, `runA` / `runB.credits` 1,989 → 2,059 frames; the credits scene itself 1,990 → 2,060
    ticks, its first tick inside the walk's Confirm press) — within 5 % of v1 (+2.7 % / +3.5 %), not equal; the
    docblocks `packages/core/src/scenes/index.ts:1649`, `:7474`, `:7651` still say "as long as at the v1 frame"
    (open — R2-03's docs pass fixes the wording).
  - **The later re-pins:** `49a8f3f` re-pinned 35 / 119 segments (all `ui` but the caravan's `hud`), `5d5a050`
    16 / 119 (`ui` only). `49a8f3f`'s body credits the `es.options` / `es.game` moves only to the HI rule; both
    also moved from the es title-cursor fix (the row reads "title cursor + HI (+ difficulty row)"), and
    `5d5a050` kept `es.options` and gave `es.game` / `ja.game` new values. The shell fingerprint: 5 / 5 at A5,
    then the 3 flight walks at `c2a9ed5`.
  - **The allow-lists:** core 14 entries today (the flip added 3 entries / 4 hits), repo 32 **at the flip** —
    `72b18a1` added A5's 9 over the pre-flip 23 (C1's `V1_WINDOW_FRAME_WIDTH` had landed earlier, in
    `346c430`) — and 33 today (`9e60df2`'s bench-matrix rewrite added one). **Not** the four entries R1-01's
    As built predicted. (Count by the `value:` key — a `file://` inside the HTTP-status reason string greps
    one extra.)
  - **The gates as built** (W4-1, W4-12, W5-6): `packages/core/test/helpers/port-pending.ts` and
    `test/golden/stale.ts` on the Vitest side; `test/e2e/gates.ts` with `test/integration/e2e-gates.test.ts`
    (10 tests) on the browser side. A full run at `bc8e05d` skips 239 (`GOLDENS_STALE`) + 80
    (`CONTENT_PORT_PENDING`) + 41 (frame `runIf`) = 360 tests, 0 failed (81 before A5 fix 1 split
    `zones-fg-runtime`). The e2e gates hold 31 `test.skip` lines (23 `PORT_UNMEASURED`, 4 `CONTENT_REASON`,
    3 `GOLDEN_REASON`, the per-file `recordingIsStale` skip in `determinism.spec.ts`), the two W4-9 inverse
    tests (`attract.spec.ts`, the two `test.skip(!R2_03_PENDING, …)` cases) and the 3 `assertionsGated`
    sites: the boss hull half-check (`boss.spec.ts`), `cameraGated` (`debug-tools.spec.ts`) and `hudGated`
    (`render-groups.spec.ts`).
  - **The e2e pacing** (C5's review loop): the flip slowed CI's SwiftShader ≈ ×1.6 (median/test ×1.83, the sums
    1,400 → 2,642 s, CI `39106182210` at 384 vs `39109703989` at 640; shards up to ~6 min), so three specs failed
    on slow runners (`39156155873` at `bc8e05d`, same three at `ac40436`). `c67c7c9` (review 2) made
    `campaign-run` (S1), `debug-tools` (S2) and `flight` (S3) wait on game ticks — `gameTick`, `waitTicks`,
    `expectScene(page, scene, ticks)`, `remoteSequence`'s unlock in one `page.evaluate`, `freezeSim` + `stepTo`
    with a `HullView` hull compare, the raster comment corrected (N1); `8ff2bf6` (review 3) added the shared
    `test/e2e/ticks.ts` (`BOOT_TIMEOUT_MS` 30 000 and the scene-flow delays as pinned mirrors of core through
    `test/integration/e2e-ticks.test.ts`; `SHIP_ENTER_TICKS` 40 joined it in `543887b`, which carried the
    boot and fly-in waits across), `0cabaec`, `424afd7`, `b0dede1` the rebind and menu taps; review 4 swept
    the remaining specs (`9da5dc2`, `72a9b65`, `409a36c`, `8e5272b`, `725297a`) and review 5's one nit closed
    in `602f8ab`; reviews 5 and 6 came back zero.
  - **Scope notes that did not happen:** `ATLAS_PNG_BYTES_CAP` was **not** exceeded (139,944 B under 262,144 B;
    the cap moved to `atlas-budget.ts`); `cjk-budget.test.ts` did **not** fail — W4-6 keeps the CJK figures on
    `buildAtlas({ ungrouped: true, artScale: 1 })` (`:58`), so the live M3-03 figures and the six documents
    quoting them stand (R2-03 decides whether the docs quote the v2 atlas); the TV bench's 1 / 1 / 2 pages held
    (v1 art for good); R1-04's "between R2-01 and R2-02 `tile-size.test.ts` is red" did not happen — A4 rewrote
    it as the "never mixed" check with a pending branch, green.
  - **Scope notes as built:** `mode7.spec`'s pass-2 blit block case (every aspect mode ≥ ×2 on its own
    `3·FRAME_W × 3·FRAME_H` `BLIT_DISPLAY` viewport; the reason is the `classic` / `wide` windows collapsing to
    ×1 on a ×2 display) runs since `293e885`; the
    webOS / web / Tizen boot-wiring fakes are frame-independent (C2); the render bench's ×2 scenario is
    1280×720 with an 8192 KB filter target and passes; `TEXTURE_BUDGET_BYTES` is 23 MiB
    (`packages/shell/src/memory/index.ts:261`), as R1-05's note predicted.
  - **The builds and the bench:** at `bc8e05d` Tizen `app.js` is 1,432,504 B raw / 386,228 B gzip-9 and
    check-bundle prints "380.2 KB gzip of 512.0 KB, 15 files, 1742.0 KB of 8192.0 KB" (379.9 KB / 1741.2 KB at
    the flip); webOS 379.9 KB gzip of 512, 16 files, 1737.8 KB (C5 at `e7ff5db`, unverified). `pnpm bench` at
    the flip passed 41 / 41, zones A–I medians 0.50–0.56 ms/tick, render worst p95 3.1 ms, 9 draw calls (A5,
    unverified). CI at `bc8e05d` was green except the three C5 specs (fixed by `c67c7c9`); `3623be2`
    (`39119741233`) had been fully green.
  - **Owner parts open** (the §17 row's parenthetical): the M7 look at the interim art and font — the title
    boot over the XHR'd manifest (W3-7) on the flipped build — and the CRT pitch re-check at ×3 / ×2.

### R2-02 — Port all content ×1.5

- **Goal:** every stage, enemy, boss, pattern, path, weapon, ship, fx preset and tileset works in the ×1.5 world.
- **Depends on:** R2-01, R1-03.
- **Scope:**
  - **Run `rescale --factor 1.5 --top-pad 36`** over `content/`: 28 stages (~750 events), 20 enemy files
    (145 entries, 28 bosses), 6 path files (146 points), 3 pattern files, 3 player files, 5 weapon files,
    2 fx files, 10 tilesets. Review the diff zone by zone.
  - **Hand-fix the frame-anchored values the tool flags** (§2.6): spawn x beyond the right edge, one-playfield
    pans (`rowsTall`; camera `yTo` is `rel-px` and the tool scales it — O2), raster `top`/`bottom`, the Mode-7 `horizon`/`bottom` of the high-speed
    dimension, boss rest positions.
  - **Scale the code constants** in core (Appendix B: margins, radii, speeds, grid cell, black hole, player
    entry, bending lasers, magnet …).
  - **Scale the 4-way design rules and the bot:**
    - `test/playtest/rules.ts:25-31`: 2.0 → 3.0 px/tick, lane gap 16 → 24, column half-width 8 → 12;
    - the capsule window 900 → 1,350 (`content.test.ts`, the three `checkpoint.x + 900` filters — :1046,
      :1785, :2170 — and the rule's docblock at :24);
    - `four-way-bot.ts:56-68`: `BOT_X` 64 → 96, `LANE_HEIGHT` 16 → 24, `TERRAIN_AHEAD` 56 → 84;
    - `remote-strict.ts` counts ticks and is unaffected.
  - **The Tiled importer** at 12-px tiles and a 640 view.
  - **What it is compared with — the v1 baseline** (`2bcabe2`): `test/golden/v1-baseline*.ts` recorded every
    shipped stage at 384×216 into `test/fixtures/v1-baseline/` (37 scenarios: event, camera and checkpoint ticks,
    every enemy's spawn, first on-screen tick and landing, the bosses' timings); until R2-01 they re-run byte for
    byte, after it they are the frozen v1 record (re-runs skipped, re-recording refused). Until then an intended
    simulation change re-records them too (`SHMUP_V1_BASELINE_UPDATE=1 …`, [test/golden/README.md](test/golden/README.md)),
    next to `pnpm golden:update`. The behaviour defaults no tool sees are listed in R1-01's As built.
  - **Notes from R1-03** (its As built and reviews):
    - **Run the tool first** — before `DEFAULT_BLOCK_SCREEN_X` / `DEFAULT_SPAWN_SCREEN_X` become `PLAYFIELD_W + 24` (the
      block pair reads its old default column from the constant) and before `DEFAULT_BONUS_WINDOW` is scaled (the
      timeline check reads core's value ×k). The real run, after R2-01: `node scripts/content/rescale.mjs --factor 1.5
      --top-pad 36 --from-width 384 --from-height 200 --tile-size 8 --to-width 640 --art-scale 1.5` — with
      `--art-scale 1.5` only once the 12-px tiles **and** the ×1.5 bands are both in the atlas (the tool refuses an art
      scale the tiles contradict; leave the flag out on any other atlas).
    - **Hand fixes it lists:** gimmick-range — give trigger `events[8]` (`took-low`) an `until` ≤ 2275, below the
      falling rock's ported 2276 (a ship within ~34 px of the left edge can then no longer set the flag in that
      stretch), or move the rock; zone-g `events[15]` leaves `events[14]`'s `ground` bonus window (3446 against 3450 —
      the pair moves ground spawns 64 px earlier while the window's `x` / `until` stay ×k); the values outside
      today's bounds — **3 since R2-01, not 66** (the frame-derived bounds widened at the flip; what is left is
      IRON LEVIATHAN's `advanced-bosses.enemies.json` `enemies[4].boss.parts[4 | 8 | 12].x`, 384 → 576,
      384 → 576 and 360 → 540, against the fixed ±512 in `core/data`; the fix is W5-8: widen to ±768);
      the 7 values on or above the top edge.
    - **Comparing with the v1 baseline:** pair events through the re-sort's index map (gimmick-range 9↔10, zone-c
      8↔9, zone-d 42↔43, zone-g 14↔15, zone-h 15↔16, 19↔20, 28↔29, 32↔33, 62↔63) — every other listing names indices
      as written; ground-enemy spawns appear 64 px of camera travel earlier at the same terrain spot, so the
      first-visible-tick check exempts them (O11).
    - **To look at by hand:** rows near the centre snap to 168 and sit 18 px above where the +36-pad mapping puts
      world content (a raid's camera pans 18 px down at its start; boss y 150 / 136 → 243 / 222, while an explicit
      spawn `y: 100` → 186); `screen-x` ranges whose ends snap to different anchors stretch (`boss.widow` 270 / 316 →
      437 / 538, `boss.walker` 110 / 300 → 197 / 514); heightfield ceilings get only part of the pad over the ~6
      columns at a segment's ends (zone A's 3440–6400 segment — visual only); zone H's top pistons (57 ± 33) no longer
      reach above the top edge; O4 rounds odd hurtbox half-extents up 0.5 px (194 entries — the ships' terrain and
      pickup boxes 1 px larger: R2-04 should know).
    - **By hand, not by the tool:** the format samples in `content/*/README.md`; retire or re-aim the real-geometry
      tests of `rescale.test.ts` and the two round-5 tests of `rescale-edge.test.ts` that read the shipped
      `terrain-a` tileset — they assume 8-px tiles.
    - **Code defaults with world units** that were missing from Appendix B are in it now: `DEFAULT_BONUS_WINDOW`,
      `DEFAULT_MODE7_FOG_DEPTH`, `DEFAULT_REVENGE_SPEED`, `DEFAULT_PATTERN_SPEED`.
  - **Notes from R2-01** (its As built, reviews and the wave-4 handoff):
    - **The four v1 geometry flags above are now required** (the tool's defaults are v2's since the flip): without
      them the run reads the content as 640×336 → 1024×540 with 12 → 18-px tiles and refuses with 28 errors;
      without `--art-scale` it exits 2, and with `--art-scale 1` too (the tiles contradict the bands). The identity
      re-run after the port (`--factor 1 --dry-run`) needs no flags. The dry run at `bc8e05d` (verified): 126
      files (10 skipped), 10,623 values, **4,035 changes in 77 files, 0 unclassified, 0 errors** — and exactly the
      3 bound errors above. (B3)
    - **Hand fix `test/integration/content.test.ts:1659` (PRISM LABYRINTH):** on the ported content it finds 0
      rising walls at row 14 and needs 6 — zone G's walls start on row 15, 12 px below the centre; raise them one
      row (add it to W5-7's list). The middle row deriving from the frame is right per §2.6. (A5 review 2 #1)
    - **Delete the content-port gate and everything on it:** `packages/core/test/helpers/port-pending.ts` and its
      test, every `itPortPending` / `describePortPending` / `CONTENT_PORT_PENDING` use (**29 test files, 80
      tests** — the list includes the drop-count gate in `powerups-direct.test.ts` and the steed-bob case in
      `behaviors-zones-de-edge`), `tile-size.test.ts`'s pending branch (its `CONTENT_TILE_SIZE` becomes
      `TILE_SIZE`), the `CONTENT_PORT_PENDING` pin in `test/integration/e2e-gates.test.ts` (the static import at
      `:15`), and the docblock mentions in `test/golden/stale.ts` and `test/e2e/gates.ts`. The golden-update
      refusal lifts by itself once the tilesets are 12 px — delete it with its pin
      `test/golden/golden-edge.test.ts:189`, or keep it, dead, for R2-03. When the gates go, all 13 gated
      `content.test.ts` cases and the zones-fg checkpoint 0 must pass on the ported content (with the gate forced
      off at the flip, 63 of the 80 failed on v1 content — the coarse thresholds were accepted).
    - **`test/golden/stale.ts` and `packages/core/test/replay/replay-version-shipped.test.ts` stay through
      R2-02** — the port writes no `*.replay.json` (`SKIPPED_DIRS = ['demos']`, `scripts/content/rescale.mjs:127`;
      the goldens live outside `content/`). Both go in R2-03, together.
    - **The port switches the e2e gate `PORT_UNMEASURED` on:** 23 specs and the `debug-tools.spec.ts` camera
      assertions then skip by design until R2-03 re-measures (W5-6); R2-02 edits no e2e gate. Watch the
      content-backed specs that are **not** gated — the port can turn CI e2e red on them. The gated dimension and
      raster tests compare the ported content with the ×1.5 art directly once the gate is gone.
    - **The muzzle sparks fix themselves with the port** (C5 review 2 S3): the `muzzle` preset's `"dx": 9`
      (`content/fx/particles.fx.json:287`) is `rel-px`, whose rule is `scale`, so the run moves it to 13.5 with
      20 other fx values — between the flip and the port those sparks draw over the KESTREL's ×1.5 nose. The
      beams likewise draw at their unported sim widths (6 / 8 px) on native frames matching their hitboxes until
      the port moves them to 9 / 12.
    - **The Tiled fixture:** redraw `test/scripts/content/fixtures/tiled-sample.tmj` and its expected
      `.stage.json` / `.paths.json` at 12 px **in the same commit that ports the tilesets** (exactly 5 tests read
      it: the fixture suite's 3, the CLI write, `--print`). The gate expires on the tilesets, not on the fixture.
    - **After the tool:** `DEFAULT_BLOCK_SCREEN_X` / `DEFAULT_SPAWN_SCREEN_X` become `PLAYFIELD_W + 24` (today
      `+ 16`) and `DEFAULT_BONUS_WINDOW` scales — the margin move does not touch the content-DB fingerprint, the
      stage lengths will. Re-pin the content-DB **and** presentation fingerprints: expect far more than 12 red
      segments, every zone A / B and campaign walk moves. The boss part offsets meet the ×1.5 art only after the
      port. `bossSuction.pullRadius` 200 (core allow-list): write a literal 300 and remove the entry, or keep
      `200 * WORLD_SCALE` with `count: 1` and a new reason.
    - **The bot geometry** (the plan's own scope list, confirmed): `rules.ts` 2.0 → 3.0 px/tick, 16 → 24, 8 → 12;
      `BOT_X` 96, `LANE_HEIGHT` 24, `TERRAIN_AHEAD` 84; the gated `content.test.ts` thresholds — ship gaps
      24 → 36 (MAGMA DEEP) and 48 → 72 (CELL VAULT), the ground probe rows `PLAYFIELD_H − 8` / `[0, 7]` and the
      sample step `y += 8` to tile-12 values, the capsule window 900 → 1,350.
    - **`test/e2e/raster.spec.ts:240-242`** — since `c67c7c9` the comment gives raster-range's playfield rows
      112 … 151 / 152 … 199 and their 640×360 frame rows (124 … 163 / 164 … 211); the port moves the bands, so
      R2-03 rewrites the comment with the `diffRows` literals. The mode7 floor rows were already fixed in
      `bc8e05d` (`test/e2e/mode7.spec.ts`, the "rows 112 … 211 of the 360-row frame" comment).
    - **No format-version bumps in R2-02** (`save-format.ts` `SAVE_FORMAT` and `gates.ts` `REPLAY_FORMAT` are
      pinned mirrors). **Build-delta baseline:** Tizen `app.js` 386,228 B gzip-9, check-bundle 380.2 KB of 512.
- **Acceptance:**
  - `pnpm content:check` is green, including the 4-way rules at their new values;
  - the playtest bot clears every zone, bonus stage and the boss rush in god mode within its budgets;
  - every zone's camera travel time is within ±2 % of v1;
  - nothing spawns visibly on screen that spawned off screen in v1 (a test compares first-visible ticks of every
    spawn between a v1 and a v2 run of each zone, ±1 tick; ground-enemy spawns are exempt from the tick comparison —
    they keep their terrain spot and come 64 px of camera travel earlier, O11);
  - every enemy that enters from above the screen reaches the same place as in v1 (×1.5 + 36 px, within 2 px):
    the §2.6 top-edge fix-ups are complete.
- **As built** (2026-10-19/20; prep `R2-02.P0` `8143c26` and `R2-02.P1` `d70399f` in wave 2, T1–T4/E0/L7/W-runs
  in wave 3, the port `R2-02.S` `8dbe858` and `R2-02.R` `4fb47e3`, `B → EF`, `U1`–`U5` and the review in wave 5;
  `R2-02.RV` at zero after its one nit (`b8b771f`)):
  - **The run** (`R2-02.S`, the one port commit): `node scripts/content/rescale.mjs --factor 1.5 --top-pad 36
    --from-width 384 --from-height 200 --tile-size 8 --to-width 640 --art-scale 1.5` — **126 files (10 skipped),
    10,623 values, 4,035 changes in 77 files, 0 unclassified, 0 errors**; the post-port identity check
    (`--factor 1 --dry-run`, no flags) reads 0 changes. The port commit is the tool's own output plus the hand
    fixes: `RV22` re-derived it **byte-exactly** from the tool and `handfix.patch` on its own tree.
  - **Hand fixes** (W5-7, 4 hunks in 3 files): gimmick-range `events[8].until` → 2275 (below the rock's ported
    2276), zone-g facet-turret `x` 3446 → 3450 (back inside the ground bonus window), captain-circler home
    562 → 530 (`cx + rx`), zone G's rising walls one row up (`rle` rows 14/15 — A5 review 2 #1). T3's landing
    check passed on the hunter dive with **no** added hunk: the 7 top-edge items needed no hand fix, the tool's
    own pad maps them.
  - **Code** (W5-1, P0 prepared, S flipped): `WORLD_SCALE` 1 → **3/2** and `WORLD_TOP_PAD` 0 → **36**
    (`core/config` — `y′ = WORLD_SCALE·y + WORLD_TOP_PAD`, negative `y` takes the scale alone), the whole
    Appendix B list rewritten as `v1 * WORLD_SCALE` in the W1–W7 lanes, the `scripts/frame.mjs` mirror with
    `SPAWN_LEAD` derived (`PLAYFIELD_W + 16 × WORLD_SCALE` = 664); the 15 frame-unit behaviour defaults became
    literal v2 numbers (R2-N6: orbiter.loop 416/186, cube.pincer 296, rear.swoop 452, captain.ram 60,
    captain.crab 407/574/60/276, boss.widow 407/544/102/234, boss.walker 176/452) — none is a banned frame
    literal, so `frame-literals.test.ts` needed no entry; the boss part bounds went ±512 → ±768 (W5-8), which
    is what the three IRON LEVIATHAN parts needed. `FORMATION_RETRACTED` / `FORMATION_SPREAD` scale
    element-wise by the owner's RV3-F1 ruling.
  - **The kit** (R2-N1): `test/port-v2/two-scale.sh` builds a throwaway worktree at any K, runs the real tool,
    applies `handfix.patch` and flips the code exactly as S did (13 unique-match replacements); modes
    `--keep` / `--reuse` / `apply`. It died with the port, as decided — `git rm`'d inside `8dbe858`.
  - **The prep reviews** (waves 1–3, both at zero): prep A's identity 0/0/0 and core CI green at `0f148fb`;
    prep B's exit check green at `3d75d73`, with three real engine fixes found under the kit — the
    simultaneous-part hit pick, the cold-compile row cache, and the port-scale trigger-probe churn (gated
    `PORT_ALLOC_CHURN`, R2-03 re-measures); `FIX2`'s K = 1 drift was adjudicated in two Direct-mode
    playthroughs — the physical nearer-target pick is more correct at both scales, its floors re-pinned
    honestly (`0264e33`, prepB.FIX8).
  - **The gates** (R2-N2): S stubbed `port-pending.ts` (`CONTENT_PORT_PENDING = false`, no import-time throw);
    U1 `a8b086d` (7 files), U2 `15fe275` (`content.test.ts` — 7 gated cases became plain tests, the file's 99
    green at K = 1 and K = 6 with the rules at their ported values), U3 `6e9dd06` (six zone suites, checkpoints
    included) and U4
    `eab6fa2` (11 files, 19 sites — 49 green at both scales) deleted the wrappers; U5 `2ce6a12` deleted the
    stub and its
    test, `tile-size.test.ts`'s pending branch (`CONTENT_TILE_SIZE` → `TILE_SIZE`), the `CONTENT_PORT_PENDING`
    pin in `e2e-gates.test.ts` (re-keyed to a `tilesetsPorted()` check reading `content/tilesets` against
    `scripts/frame.mjs`), and the last four files. **Zero `CONTENT_PORT_PENDING` on master**; the sanctioned
    residue is docblock prose (`gates.ts`, `stale.ts`, two rescale comments) collected by the wave's docs
    lanes. `PORT_ALLOC_CHURN` (2193888) is keyed on the stale goldens, not the port — it lives until R2-03.
  - **E0** (R2-N3, wave 3): pre-gated **zero** specs — every predicted candidate passed at both scales under
    the kit; the one kit-red spec (`render-profile`) failed identically on master, so it was reported as a bug
    (fixed later at `3c58cb3`), never gated. The port switched `PORT_UNMEASURED` on: 23 specs and the
    `debug-tools.spec.ts` camera assertions skip by design until R2-03 re-measures (W5-6).
  - **The v2-port comparison** (`R2-02.L7` `c62bd6f`): `test/golden/v2-port*.ts` replay every v1-baseline
    fixture's recording at the live scale — 37 scenarios, read-only, identity-skipped at K = 1. **Zero
    landing failures** anywhere (the top-edge acceptance clause, every enemy reaches ×1.5 + 36 within 2 px),
    10 scenarios fully green at the kit, the rest failing only in the bot-dependent timing classes, loudly,
    none softened; the ground-spawn first-visible exemption is O11's (they come 64 px of camera travel earlier
    by design). After the port: 40 passed / 37 identity-skipped / 0 failed. Two open rows ride to R2-03's
    re-check: the test-range orbiter's `turnX` 416 against the mapping (Δ −32) and the raid `introX` 660
    against 632 (Δ +28).
  - **Fingerprints**: all three re-pinned in S — 16 red segments measured (presentation 11, content-DB 2,
    shell 3), more than the 12 the plan expected, and all intentional; the shell scenes' tables moved with the
    ported content as they never could through R2-01.
  - **The ported tree** (B, `w05-B`, read-only at the wave base): the playtest bot clears zones A–I, the bonus
    stage and the boss rush within budget — **zone F (CELL VAULT) went green with the port itself**, the
    wave-3 scout's one real pre-port item, no Z lane needed; the sim benchmarks improved (stress 0.138 →
    0.101 ms/tick, zones 0.479–0.524 → 0.399–0.517, all under the 1 ms gate, render worst p95 5.7 → 1.60 ms at
    9 draw calls); the 29 render-bench reds were one stale Pixi-8.22 pooled-render-target assertion, proven
    pre-existing at `6080ada` and fixed at `35a80f8`; the full e2e is **129 passed / 101 skipped / 0 failed /
    0 flaky** on Chromium — exactly S's skip census — and the Firefox determinism spec 2 / 71 / 0.
  - **Build delta:** Tizen `app.js` 391,996 → **392,763 B** gzip-9 (+767 B, +0.2 %), check-bundle 386.6 KB of
    the 512 KB code budget (webOS 386.3 KB). `R2-02.R` `4fb47e3` ported the 12 format samples of the eight
    `content/*/README.md` with the tool itself (`docs(content):`, reviewed clean).
  - **Not touched, by design:** no `*.replay.json`, no `PINNED` outside the three fingerprint tables, no
    e2e gate logic beyond U5's re-key, no format-version bump — the goldens and demos stay v1 recordings
    until R2-03 (`GOLDENS_STALE`), and `pnpm golden:update` was never run.

### R2-03 — Golden replays, demos, e2e, docs images

- **Goal:** the test suite and the pictures describe the 640×360 game.
- **Depends on:** R2-02.
- **Scope:**
  - **Re-bless** the 62 golden replays (`pnpm golden:update`) and **re-record** the 9 attract demos
    (`content/demos/`), with the reason in the commit;
  - e2e at 1280×720 with the R1-02 helper; the 12 specs that count exact placeholder colours re-pointed at the
    interim art; the spec rows R1-02 left literal because they come from content (the zone specs' bands, skies and
    ridges, `mode7.spec`'s floor rows, `raster.spec`'s bands, `zone-a.spec`'s `fy < 160`, `zones-hi.spec`'s ending
    panel row, and the layouts of `doc-images.mjs` / `store-assets.mjs`) re-measured on the ported content;
  - the headless render bench's 640×360 scenario becomes the default — already true: since R1-02 (`e9e5af7`)
    `test/bench/render.perf.ts` `load()` takes `FRAME_W` / `FRAME_H`, which R2-01's flip made 640×360; nothing to
    build, `R2-03.RV` confirms it and `W06.DOCS-A` records it;
  - `pnpm docs:images`, `pnpm docs:screens` and `pnpm store:assets` regenerated (store screenshots 1920×1080 =
    640×360 × 3);
  - `docs/dev/*.md` that quote 384×216 (about 15 files, most in `api-reference.md` and
    `render-performance-review.md`) updated, with D19/D20 marked superseded by R-D1/R-D3.
  - **Notes from R2-01** (its As built and the wave-4 handoff):
    - **The gate deletions, complete:** `test/golden/stale.ts`, its re-export in `golden.ts` and every
      `GOLDENS_STALE` use (9 test files, 239 tests) go **together with**
      `packages/core/test/replay/replay-version-shipped.test.ts` (73 tests), whose cases fail by design once the
      recordings are re-blessed, each saying "R2-03 re-blessed this recording: delete
      replay-version-shipped.test.ts with the gates (test/golden/stale.ts)"; the permanent cases stay in
      `replay-version.test.ts` with `fixtures/run-replay-v1.json`. `test/e2e/gates.ts` goes with every use: the
      31 gating `test.skip` lines (23 `PORT_UNMEASURED`, 4 `CONTENT_REASON`, 3 `GOLDEN_REASON`, the per-file
      `recordingIsStale` skip in `determinism.spec.ts`), the two W4-9 inverse tests (`attract.spec.ts`, the
      two `test.skip(!R2_03_PENDING, …)` cases), the 3 `assertionsGated` sites (the boss hull half-check in
      `boss.spec.ts`, `cameraGated` in `debug-tools.spec.ts`, `hudGated` in `render-groups.spec.ts`) and
      `test/integration/e2e-gates.test.ts`. Every gate throws at import once
      its window closes, so none can be forgotten. **Since R2-02:** `test/golden/golden-edge.test.ts`'s
      golden-update refusal and its pin are dead code — delete them too (the tilesets are 12 px, the tool's
      reason cannot fire). And `PORT_ALLOC_CHURN` (`packages/core/test/helpers/port-alloc-churn.ts`,
      `2193888`) joins the list: the world-gimmicks allocation guard measures 169,160 B against its 65,536 B
      budget when the cold trigger-probe path runs at the ported scale, so R2-03's re-measure re-derives the
      budget honestly; delete the gate, its pin `port-alloc-churn.test.ts` and its single use in
      `packages/core/test/world/world-gimmicks-alloc.test.ts` with the rest (R2-02.prepB.FIX3).
      **Paid by `R2-03.G1PRE` (`e1e5374`):** the red was the guard's own fixture — at the ported scale the
      suction-pinned ship never crossed the bands still placed at v1's `y + 20`, so the window measured
      first-visit tier churn (173,544 B against the unchanged 65,536 B budget) instead of a steady trigger
      crossing; moving the bands to `SPAWN_Y + 35` (26 triggers fire through the run) makes the guard green
      at ≈ 14,584 B with `packages/core/src` untouched, per the law that a fixture failure is fixed, never
      gated. The trio is deleted as ordered.
    - **Re-measure every `PORT_REASON` and `CONTENT_REASON` test** on the ported content — the 23
      `PORT_REASON` specs passed at 640 on v1 content, so a failure after the port is the port's. Give the
      fingerprint's attract walk the shipped demos again (optional).
    - **The art switch:** `scripts/doc-images.mjs:267` moves off `collectSprites({ artScale: 1 })` to the
      default, then regenerate `pnpm docs:images` and `docs:screens`, **including `docs/images/logo.png`**.
      `scripts/store-assets.mjs:150` does **not** move here: W4-6 and RR-3 keep the store icons on the v1 art
      until R4-05, so at R2-03 `pnpm store:assets` only `--check`s that the committed icons and placeholders
      have not moved. The TV bench keeps `artScale: 1` for good (W4-6). The CJK figures: decide here whether
      the docs quote the v2 atlas (W4-6 kept them on the v1 build).
    - **The render bench needs nothing:** its 640×360 default has held since R1-02 (`e9e5af7`) —
      `test/bench/render.perf.ts` `load()` reads `FRAME_W` / `FRAME_H`.
    - **The docs sweep is 20 files, not ~15** (grep at `bc8e05d`): most mentions in `render-performance-review.md`
      (19), `api-reference.md` (13), `rendering-and-shell.md` (10).
    - **Expect e2e shards up to ~6 min** (median/test ×1.83 since the flip — SwiftShader software raster: 2.8×
      the pixels with the ×1.5 art upscaled to 1280×720; the bench's real GPU p95 rose only ≈ 30 %).
    - **Open wording from R2-01:** the story / credits docblocks (`packages/core/src/scenes/index.ts:1649`,
      `:7474`, `:7651`) still say "as long as at the v1 frame" — the durations are within 5 % of v1
      (+2.7 % / +3.5 %), not equal.
- **Acceptance:** the full definition-of-done suite is green on `master`, including an e2e run in which a stage
  with 12-px terrain renders (R1-04's deferred browser check). (That suite runs once, in wave 15 — §18, RUN-1;
  R2-03 closes on its targeted checks.)
- **Schedule (§18, wave 6):** the e2e re-measure, the doc images and the one re-bless are checked by targeted runs;
  the full definition-of-done suite runs once, at the end of the run (wave 15, decision RUN-1). R5's stable hash
  keys and capacity raise (`R5-P.P1`, `R5-P.P8`) land in this step's wave, so `R2-03.G1`'s single re-bless covers them
  (RUN-7). The store icons stay on the v1 art until R4-05 (RR-3).
- **As built** (2026-10-20; wave 6, `b8b771f..9785da0` — the e2e re-measures `E1` `1a5c487`, `E2` `91cc585`,
  `E3` `c3018db`, `E4` (nothing to remove), the gate-debt rewrite `FIXG` `bdd820a`, `G1PRE` `1096a59` +
  `e1e5374`, `R5-P.P1` `6ba1187` and `R5-P.P8` `273e081` (their §11 note), the doc images `I1` `356e7b2`,
  the one re-bless `G1` `d4ba9e8`, the screens `I3` `9785da0`; the step's targeted exit `V` all green at
  `9785da0`; `R2-03.RV` approved at zero after its review):
  - **The e2e re-measure came first, in parallel with the R5-P prep (decision R2-N4).** E1 took the five zone
    specs, E2 the five runtime specs (`stage`, `mode7`, `raster`, `gimmicks`, `campaign-run`), E3 the boss,
    raid, captain, twins, HUD-control and camera specs — every `PORT_REASON` / `CONTENT_REASON` skip removed
    and each sampled value re-derived from the shipped content, the renderer or core's constants, never
    hand-multiplied (the one exception the reviews allowed: v1-anchored numbers re-expressed through
    `test/e2e/frame-pixels.ts` and the stage files' own values). E4 found **zero** gates to remove — wave 3's
    `R2-02.E0` and `R3-04.M3d` added none. E2 also landed R1-04's deferred browser check: `stage.spec.ts:134`
    proves the drawn terrain repeats with a vertical period of exactly `TILE_SIZE` (with a `TILE_SIZE / 2`
    discriminator no 8-px tile can pass — horizontal seams are unmeasurable on this renderer, which paints
    tile interiors as a position-hash texture; deviation approved in review).
  - **The 44 gate-debt cases** (`FIXG` `bdd820a`): the three local `CONTENT_PORT_PENDING` twins in
    `packages/core/test/data/` — `tilemap`, `tilemap-edge`, `units-pairs`, self-contained and missed by
    U5's sweep — lost their wrappers and now run on the ported premise (583 green at both worker settings),
    every fixture number derived from `TILE_SIZE` / the playfield / the shipped tileset itself.
  - **The one re-bless** (`G1` `d4ba9e8`, 91 files): **62 goldens + 10 demos** (9 zone recordings and the
    format sample) rewritten at 640×360, replay format 2, in a single `pnpm golden:update` — the only bless
    of R2; the step script's sanctioned internal re-run (its determinism check, ruled in before the land)
    proved zero diff. Its commit message gives the
    three reasons the hashes had to move: the R2-02 port (`8dbe858`), `R5-P.P1`'s key-mixed hash (`6ba1187`)
    and `R5-P.P8`'s wider hashed part tables (`273e081`). All four gate artifacts died with it —
    `test/golden/stale.ts`, `test/e2e/gates.ts`, `test/integration/e2e-gates.test.ts`,
    `replay-version-shipped.test.ts` — with the `GOLDEN_REASON` skips, the two W4-9 inverse tests, the three
    `assertionsGated` sites and `scripts/golden-update.mjs`'s refusal; `1096a59` had renamed the render
    bench's budget module to `bench-gates.ts` so the gate grep can mean only the e2e gates. The grep is empty
    at the tip.
  - **The 9 narrative re-measures the first bless exposed** (each to the recorded truth, every god-mode rule
    still holding): zone A's Arcade run now dies short of the clear (deaths 5883 / 7327), the gimmick bot
    fires the region trigger and takes the low branch (3 bricks), the captain range ends with slot 0
    fighting and slot 1 dead (the circler, not the ram), zone D's dive floor is the mechanical 200 →
    `v1rel(200)` = 300, zone H's parade window is `(6600, 6780)` (×1.5), the glimmer cache no longer nets a
    1UP, zone F's Arcade run dies at 76 s, zone D's bot clears **deathless** (its dive now proven by
    max-y assertions instead), and zone C's bot falls at 86 s before the WIDOW. **Seven coverage-drift rows
    they leave behind are filed for the R5 re-records** (as code comments in `golden.test.ts` and the §11
    R5-prep note) — no scenario was invented to paper over them. Test names were kept throughout; the
    `golden` project is 272 passed / 74 skipped, and all 74 skips are the four by-design comparison-kit
    arms retiring with the kit, not gates.
  - **The pictures:** `I1` `356e7b2` moved `doc-images.mjs` off `artScale: 1` to the shipped 3/2 scale,
    re-measured the logo banner on the new art and rounded the ported half-pixel part offsets the boss
    portraits centre on (50 of the content's 238 are halves); 144 images check clean. `I3` `9785da0`
    re-shot all 18 `docs/images/screens/` at the 1280×720 capture, determinism proven by a byte-identical
    re-capture of `zone-a.png`; the title screen's blink-selection band was stale v1 geometry and now
    derives through the `frame-pixels.ts` readback. The screens' aesthetics are an **owner eyeball item** —
    geometry and content-presence are proven programmatically, taste is not.
  - **R2-03.I2, folded by RR-3:** the store icons stayed on the v1 art — `pnpm store:assets --check` only,
    green at the exit — and R4-05.E5 moves them to the v2 art once. The render bench's 640×360 default was
    **already the frame**: since R1-02 (`e9e5af7`) `test/bench/render.perf.ts` `load()` takes `FRAME_W` /
    `FRAME_H` (from `@shmup/core` directly, line 58 — strictly stronger than the `scripts/frame.mjs`
    mirror), so there was nothing to build and the exit confirmed it; `R3-04.FXB`'s budgets were untouched
    (the wave's only `test/bench` commit is the rename).
  - **The CJK figures — the decision this step owed W4-6:** the documents keep quoting the **v1 atlas**
    (`artScale: 1`). The M3-03 arithmetic is about how much art there is, and the interim ×1.5 upscale is
    stand-in art on its way out in R4 — quoting it would pin six documents to pixels nobody will ship.
    `test/integration/cjk-budget.test.ts` measures the figures at `artScale: 1` (its docblock says so) and
    the **live PNG budgets are R3-04's** (`e0a526d`), which hold the shipped split atlas whatever its scale.
  - **The exit** (`V`, read-only, at `9785da0`): `content:check` 99, the golden project 272/74-sk, the
    shell determinism batch 17, both fingerprints green unedited, `docs:images --check` 144 images,
    `store:assets --check` ok, both TV bundles inside budget (387.1 / 386.7 KB gzipped), and the full e2e —
    every batch holding a spec this wave touched, run whole: **Chromium 229 passed / 0 skipped / 0 failed /
    0 flaky, Firefox 73 / 0 / 0 / 0** (wave 5 left 129/101-sk and 2/71-sk — every gate skip became a real
    pass). `R2-03.RV` approved at zero criticals; its gate-debt rows are carried to §17 and the R5-prep note.
  - **Not touched, by design:** no behaviour change anywhere — the wave's only `packages/*/src` edits are
    P1's hashed key columns and mixers and P8's capacity constant, each reviewed under §11; no `PINNED`
    outside the content-DB's demo/key rows; no save or replay format bump (both already v2's); no `content/`.

### R2-04 — First retune at the new scale

- **Goal:** fix what does not scale linearly, so the ported game *feels* like v1.
- **Depends on:** R2-03.
- **Scope:**
  - the +11 % / +12 % field of view means enemies are seen longer before they act — check every zone's opening
    of each section, and adjust spawn lead or density where the bot or the owner finds it noticeably easier;
  - screen-shake magnitudes (whole pixels: 1/2/4 in code → 2/3/6, decision R2-N7; the owner's play session may
    change them);
  - score-popup and particle speeds; the Mega Crash and black-hole visuals;
  - the CRT `light`/`full` look at pitch 3;
  - menu cursor auto-repeat untouched (ticks).
- **Acceptance:** goldens re-blessed with reasons; an owner play session finds no zone that "feels wrong" because
  of scale (notes in the step's As built list).
- **Manual (owner):** play zones A, D and I on the M7 in a `build:dev` bundle; watch TPF and RENDER on the overlay.
- **Milestone:** tag **`v2.0.0-alpha.1`** — "plays at 640×360, interim art".
- **Schedule (§18, wave 7):** the tag is a pre-release, the wave's last action: cut after the targeted exit check and
  the docs item, on `origin/master` (wave 7's Exit check 3); the full suite runs at the end of the run (RUN-1).
- **As built** (2026-10-20/21; wave 7 on base `d48c0d2`: the presentation lanes `adcfe26` (P1) and `d5236e1` (P3),
  P2 and P4 measured **no change**; the five sim patches integrated once at `a285e0e` (G, decision R2-N5); the
  version step `5aad58e` (REL, decision R2-N8); `R2-04.RV` APPROVED with one process finding — a fold row, closed
  in the run archive — and the owner's M7 play session still pending):
  - **Shake 2 / 3 / 6 px** (F1 in the one bless, decision R2-N7 — "1/2/3" here was stale, the code was 1/2/4):
    `ShakeMagnitude.Small` 2, `Medium` 3, `Large` 6 in `core/fx`, ×1.5 of v1 with the half rounded up, every pin
    in core, render-pixi's effects tests and the shell's fx gallery recomputed inside the patch (the three stale
    render-pixi pins and the stale `shakeAmount` docblock example rode with it). The owner's session confirms or
    changes the values.
  - **Popups and the CRT followed; the rest measured exact** (P1 `adcfe26`: the score popup rises
    `((age * 3) >> 3)` px — three per 8 ticks, integer, allocation-free; P3 `d5236e1`: `CRT_LIGHT_SCAN`
    0.2 → **0.24** and `CRT_FULL_SCAN` 0.34 → **0.408** for the ×3 pitch, the duty-ratio derivation in the
    docblocks, mask 0.18 and vignette 0.22 unchanged — pitch-independent; P4: the Mega Crash flash and the
    black-hole visuals are correct at scale, `layer-effects.ts` not edited; P2: the particle audit found the
    R2-02 port internally exact — `content/fx` untouched, R4-04 owns any real particle change. The menu cursor's
    18 / 6-tick auto-repeat stayed — a tick value.
  - **The zone openings were measured, not guessed** (Z1 … Z4, reviewed by RT-Z13 / RT-Z2 / RT-Z4): all 23
    measured sections of zones A–C and G–I open tick-preserved (the only row moves are 10 zone-A `skeet` volleys
    whose turn−visible delta 14 → 15 is firstSeen edge rounding); the RT-Z2 table for zone F's own sections —
    v1 → v2-base → v2-patched median (n): sec 0 `19/7 → 20/7 → 18/7`, sec 1 `15/7 → 15/7 → 15/7`,
    sec 2 `8/15.5 → 9/10 → 9/14`, sec 3 `16/8.5 → 19/7 → 19/7`. Zones D and E measured sound and were **not
    touched** — their v1→v2 median drift is R2-02's blessed port property (their `PORT_UNMEASURED`-era README
    bands), and the bot-kill-composition reading in Z2's first commit message was corrected in review.
    **Zone F was the one real retune** (Z2): the port made it measurably **harder** — the non-god bot died 3×
    (bullet @ 4147, bullet @ 6733, contact @ 9363) into a `gameOver`; the wave-5 Z-FG symptom story (the broken
    bot, `lunges` 0) had already expired at the port, the residue was the difficulty. The patch thins the four
    lymph-mote columns (ev13 / ev26 / ev39 count 6 → 5, with ev13 interval 14 → 16, ev26 14 → 18, ev39 also
    x 9270 → 9060, ev19 x 4020 → 4080 and interval 14 → 16, ev21 interval 16 → 18), moves the section-1 ceiling
    polyp ev16 x 3476 → 3660 to de-overlap the two turret streams, and takes both polyps' `fireTicks` 170 → 190
    — the non-god bot then clears, its one death a contact at x 3161, before the first checkpoint (3300). Z4 measured all four
    bonus stages (tick-preserved openings; non-god seed-1 full-loadout runs clear 0 deaths / 0 hits at both
    scales), the boss rush (9 encounters; warn→fight 330 t for eight and 360 t for IRON SOVEREIGN — its content
    `introTicks` 180 — IDENTICAL v1↔v2; all eight inter-encounter gaps 335 t; the rush entries' `[360, 150×8]`
    delays are the owner knob), and all nine loop-2 remixes (52 remix events); the ×1.5 port moved no opening;
    no retune proposed — so Z1 / Z3 / Z4 are **empty patches by measurement**.
  - **The one re-bless** (`a285e0e`, 30 files): 17 goldens and the zone-f attract demo re-recorded (`golden:update`
    three passes, all 72 committed recordings md5-identical across passes — byte-stability proven, not assumed);
    the content-DB fingerprint re-pinned its 3 shipped rows (`core.stages`, `core.enemies`, `core.demos` — Z2's
    files and the blessed zone-f demo) and the **presentation and shell fingerprints are GREEN UNEDITED** — core's
    `renderFrame` never writes the shake, so R2-04 reaches neither (RT-F1's render-side adjudication, which held
    exactly as pinned). `test/golden/v2-port.ts` gained `PORT_EXEMPTIONS`: the 14 band-level disclosures (zone F's
    seven lines and their merged-timeline `zone-f-loop2` twins), each dropped whole-exact with its reason, and the
    table **fails if a listed line stops appearing** — it cannot rot. Disclosed deviation: `golden.test.ts`'s
    zone-f-arcade `deathTicks` narrative pin (3577/4467 → 3900/4891, the thinning's ~330-tick later deaths) moved
    **with its own blessed recording** — the wave-6 G1B bless-lane precedent: a test pinning its recording's bytes
    is part of the bless.
  - **REL** (`5aad58e`, decision R2-N8): `2.0.0-alpha.1` in the 10 manifests plus the 3 test pins (13 files); the
    TVs keep `2.0.0`; the lockfile byte-unchanged; both bundle checks green — `app.js` 1424.2 / 1423.0 KB,
    gzipped 388.6 / 388.3 KB inside the 512 KB budget. The
    **`v2.0.0-alpha.1` tag** is the wave's closing action (Exit check 3) after the docs item and the board sync —
    not this commit.
  - **Owner (Manual), still pending:** the M7 `build:dev` play of zones A, D and I (the overlay's TPF and RENDER),
    the 2 / 3 / 6 confirmation, the 1080p CRT-scanline eyeball (RTP13's tie-to-bright note), and the zone-F feel
    check beside D/E (the lever back is the lymph `interval` values before any `count` restore). The notes go in
    the As built list when the session happens.

---

## 9. R3 — The art pipeline for detailed, AI-assisted art

**What "much more detailed" means here.** Gameplay sizes (hitboxes, the ship's 24×14 footprint, bullet radii)
are fixed by k = 1.5. Detail comes from:

- **density** — ~2.25× the pixels per sprite;
- **richer palettes** — per-sprite ramps up to ~32 colours instead of SNES-style 16;
- **more animation frames** — ship banking 3 → 5, enemies 2 → 4–6, explosions 8 → 12–16;
- **art bigger than the hitbox** where readability allows (bosses up to ~60 % of the playfield height, big
  set-piece enemies);
- **painted full-width backdrops** instead of 128-px repeating bands, with 4–6 parallax layers;
- **decor layers** that break up the tile grid;
- **lighting** — additive glow sprites, palette cycling.

### R3-01 — Art bible v2 and the prompt library update

- **Goal:** one document every human, model and agent follows, so hundreds of generated images still look like
  one game.
- **Depends on:** —. **The prompt-library half is done** (`b938d5a`, 2026-10-16: the K3 kernel and v2 targets table,
  the green key, PNG output, the picks manifest and `gen-candidate.mjs`). **The art bible half depends on nothing**
  and may run any time; it should take in what R0-04's picks show.
- **Scope:**
  - **`docs/dev/art-bible-v2.md`:**
    - **target sizes and frame counts per category** (ships, Options, shields, shots, enemy bullets, lasers,
      items, enemies by size class, boss parts, explosions and FX, tiles, backdrops per layer, HUD, font, UI,
      title, ending scenes);
    - outline rule (1-px dark outline at 640×360 — the K3 kernel's "2-pixel outlines" were for 1152-px sources);
    - light direction (top-left);
    - palette rules: lifted dark backgrounds for the VA panels (never #000 behind bullets), per-zone palettes,
      **reserved palette-cycle ramps** that no other pixel may come near (R3-03 below);
    - **enemy bullets are always the brightest, highest-contrast thing on screen**;
    - no scaled or rotated pixel art at runtime (heading frames as today);
    - **no "mixels"** — every sprite is drawn at the native 640×360 density.
  - **The prompt library** *(done, `b938d5a`)*:
    - `art-prompts/images/00-style-kernel.md` K3 rewritten for in-game sprites, with target pixel sizes, frame
      counts, a pose list per frame and a sheet grid layout so the ingest tool can slice it;
    - sprite-sheet prompts' frame counts made to match the game (prompts ask 4–8, the game uses mostly 2 today
      — the bible's new counts win);
    - **a flat key background that is not navy** (today's K3 asks for "flat deep-navy background" *and*
      "near-black navy outlines", so keying the background would eat the outlines): use a flat colour far from
      every zone palette, e.g. pure green;
    - outputs as **PNG, not JPEG** (`generate.mjs` writes `.jpg` today; JPEG has no alpha and its artefacts blur
      edges).
  - **Which art is AI-assisted and which is hand-made:**

    | Category | Source |
    |---|---|
    | Parallax backdrops, painted far layers, title / ending / zone-card art, boss bodies, large enemies, set pieces | **AI-assisted** → ingest → hand cleanup |
    | Mid-size enemies, Options, shields, FX | AI concept → ingest → **heavy** hand cleanup, or hand-drawn |
    | Ship, enemy bullets, lasers, items, capsules, font, HUD icons, tiles' collision silhouettes | **hand-pixelled / procedural**, AI as reference only |
- **Acceptance:** the bible exists, every category has a size and frame table, the prompt library validates
  (`shmup-art-prompt-library@1`) with the new kernel, and a sample sheet per category has been generated and
  ingested as a proof (owner run — R0-04's round supplies the generated samples).
- **Manual (owner):** the generation runs on the GPU server, through R0-04's art round and `art-prompts/v2/server.sh`
  (runbook: `docs/dev/art-generation-server.md`). Still open after the bible (its §10):
  - **the ingest proof** — one sample sheet per category generated and ingested; it needs R3-02's tool and the art
    round's committed winners (`art-prompts/v2/winners/`, after round 2), and is the last acceptance item;
  - **confirm or override the dusk regrade** the bible proposes for the bright zones' in-game layers (DUNE EXPANSE,
    TEMPEST RIDGE, BRINE NEBULA — bible §4.1) when those layers are made;
  - the **R4-02 readability sign-off** (512 bullets over each zone's backdrop in all four bullet palettes) and the
    **R4-03 font cell** (8×12 or 9×12), both left to those steps;
  - R3-05's licence decisions before any winner ships (FLUX is on hold — R3-05);
  - **the remaining prompt-library edits were applied after round 2 of the art round** (the art round
    used the library until then; edits 5 and 6 — the KESTREL in-game sheet's 4-frame thruster loop in a strict side view,
    and the darker playfield grade for the DUNE EXPANSE / TEMPEST RIDGE / BRINE NEBULA layer followups — were
    applied to the round-2 followups early, `a092ee9`; edits 1–4 landed at `ae0b81f`, 2026-10-20):
    - *edit 1* — `art-prompts/images/00-style-kernel.md` v2 targets table: a lead line saying the bible wins over
      it; bullets 11 / 13 / 17, point item 7, particles 7 / 9 / 13; the laser beam 12 frames, node 1; the force
      field "4 wear × 1–2 shimmer"; Options "hand, or AI concept → heavy cleanup"; the backdrop lighting budget in
      the backdrops row;
    - *edit 2* — the K3 rules: point to bible §8 for the yellowish key, hole seeds and despill, and name the only
      sprites allowed on the black key (the additive and translucent ones of bible §3.6);
    - *edit 3* — `art-prompts/images/README.md` model heuristics: FLUX.2-dev first for text (it won 7 of 7),
      Qwen-Image second; SD3.5 swatches are material references only, never tiles;
    - *edit 4* — the `40-enemies` zone sheets v1–v3: one subject per sheet; drop "dithered highlights only" (zone A
      v2) and "light dithering on metal" (zone A v3); fix the stale "Grid layout on a single flat navy field"
      (zone A v1);
    - *edit 7*, optional — "SNES-era" → "16-bit console era" (the same question as R3-05's "SNES"
      decision) — **pending the owner**, still not applied as of `ae0b81f`.
- **As built** (`c3b775a`, review fixes `7a51aaf`; review round 2 clean) — where `docs/dev/art-bible-v2.md` differs
  from this scope or from the kernel's v2 targets table, which it overrides:
  - **Odd sizes for point-symmetric sprites**, so the anchor is a real centre pixel (bible §5.1): bullets
    11 / 13 / 17 (kernel 11 / 14 / 16), the point item 7 (kernel 8), particles 7 / 9 / 13 (kernel 8 / 9 / 14).
    Other sizes are v1 × 1.5 with halves rounded up.
  - **The laser beam has 12 frames**, one per band height of the 6×12 beam (the kernel's "8, as v1" only fits an
    8-px beam); beams are the one sprite the renderer rotates and stretches, so their frames are uniform along x.
  - **The force field is 4 wear states × 1–2 shimmer frames** (kernel: 6). Today every frame is a wear state
    (`FORCE_FIELD_WEAR_FRAMES`, `shieldWearFrame`), so the shimmer needs a wear × shimmer mapping where
    `PowerUpSystem.sync` picks the frame (as `armWearFrame` does tier × wear) — R4-01; until then 4 frames.
  - **Alpha is binary by default**; only the listed additive sprites (sparks, sparkles, rings, glow accents, the
    Mega Crash flash), translucent overlays (the force field's inner glow, Reduce's shimmer, bubble films, smoke)
    and haze bands on uncycled layers may be partial. R3-02's recipe takes it as a field,
    `alpha: binary | translucent | additive`. Explosions and the black hole are **normal** blend: today a preset
    without `blend` is additive, so R4-04 sets `"blend": "normal"` on `explosion.*` and `boss.chain`.
  - **The palette-cycle ramp rule is scoped**, not project-wide: on a cycled layer every other pixel stays ≥ 3/255
    (Chebyshev) from that layer's ramps — R3-03's scan, which today's atlas passes — and all new v2 art keeps that
    margin from all eight shipped ramps; v1 / interim sprites that break the project-wide margin on layers that do
    not cycle that ramp are listed as exemptions, an empty list by the end of R5. (A project-wide reservation, the
    first draft, already fails on today's HUD meter slot, boss turrets, raid hull and zone bosses.)
  - **A measured backdrop lighting budget** (the scope says only "lifted dark backgrounds"): Rec. 709 luma floor 16
    for far and mid layers; far median ≤ 64, 95th percentile ≤ 140; mid ≤ 80 / ≤ 160; light sources ≥ 24 px and
    ≤ 5 % of a layer above 200. R3-02's ingest report prints it; R4-02's sign-off is final. The bright winners'
    zones get a **dusk regrade** (owner decision, above).
  - **Ingest rules for R3-02** measured on the winners (bible §8): the models' key green is yellowish (median
    `#3cf102`), so the key is sampled from each image's border and removed by flood fill from it, with hole seeds
    or `holes: auto`, edge despill and halo removal; the black key is for the additive / translucent FX only.
  - **Ship anchors:** KESTREL v1 `[8, 4]` × 1.5 → `[12, 6]`; MANTA v1 `[8, 5]` × 1.5 → `[12, 7.5]`, so `[12, 7]` or
    `[12, 8]` — R4-01 confirms both.
  - **Options** may be hand-drawn or an AI concept with heavy cleanup (this scope's table); the kernel said hand only.
  - **The engine changes the new frame counts need** (bible §5.2, the † table): five ship bank frames are a content
    edit, `"bankFrames": 2`, that re-blesses (R4-01); the thruster is never drawn in the game today (R4-01); Options
    4 frames, the force-field shimmer and the black hole's 8 frames (`BLACK_HOLE_FRAMES`) — R4-01; item glints
    (`ITEM_KINDS` `frames: 2`) and point items (hashed, re-bless) — R4-02; the explosions' normal blend — R4-04. From
    review round 2, for R4-01: drawing the thruster behind each ship needs `playerBatch`'s capacity doubled
    (`createSpriteBatch(LayerId.Player, MAX_PLAYERS)`, `world/index.ts` ~:1815), and the shell showcase hard-codes
    the 3-frame bank order (`packages/shell/src/showcase/index.ts` ~:277).
  - `items/one-up` and `items/bonus` have sizes in the bible but are never drawn by the game today (open, R4-02).
  - The scope's "§9.3 below" pointed nowhere; the ramp rules are R3-03's, which the bible follows.
  - The kernel itself is not edited yet (the art round uses it until round 2): see the five edits under Manual.

### R3-02 — The ingest tool: AI output → clean sprite source, with provenance

- **Goal:** turning a generated image into a game-ready PNG is one repeatable command, not an afternoon in an
  image editor.
- **Depends on:** R3-01 only — it does not wait for R2. **Until R2-01 lands its output is staged:** ingested sprites
  and their provenance go to a staging folder (`art-prompts/v2/ingested/`), not to `assets/source/sprites/`, so the
  384×216 atlas and the goldens do not change; they move into `assets/source/sprites/` with R2-01 or the first R4
  step after it. Before R2-01 the acceptance below runs on the fixtures and the staged output.
- **Scope:**
  - **`art-prompts/ingest/`**, a standalone tool outside the workspace (like `tools/*`; its own `package.json`,
    so its image dependencies — a JPEG/PNG decoder, optionally a background-removal model — stay out of the
    game's dependency rules).
  - **A per-sprite recipe** (`assets/source/sprites/<path>.recipe.json`): source image(s), crop boxes or a
    sheet grid, target frame size and count, palette (named zone/ship palette or an explicit list), anchor,
    key colour, dithering off/on, outline on/off, and the palette-cycle ramps to respect.
  - **The pipeline:**
    1. crop or slice;
    2. remove the key background, with tolerance and morphological cleanup;
    3. downscale with an area filter, then pixel-snap;
    4. quantise to the recipe palette (≤ N colours; ordered dither only where the bible allows);
    5. binary alpha;
    6. outline pass;
    7. optional hand-edit layer merge — a `<name>.edit.png` the artist paints over, applied last so re-ingesting
       never loses hand work.
  - **Output:** `assets/source/sprites/<path>.png` (the existing real-art override path,
    `scripts/assets/sprite-source.mjs:572`) plus its frame sidecar, plus **`<path>.art.json` provenance**: model,
    prompt file and entry, seed, source file SHA-256, recipe hash, date, "hand-cleaned: yes/no".
  - **Determinism:** the same recipe and source give the same PNG byte for byte. The PNG is what is committed,
    so the atlas stays byte-identical on every machine, as today.
  - **Fix the override path's known problems:**
    - a code-defined anchor beats the sidecar pivot (`sprite-source.mjs:597`), so a ×1.5 PNG kept a ×1 anchor —
      make the art's sidecar win, or have ingest write the anchor into the `.sprite.json`;
    - **`docs/dev/real-assets.md:41`** claims a sidecar-less strip is sliced into frames (it is not — the whole
      PNG becomes frame 0);
    - **`:47-49`** claims colour-blind variants derive from the art (they do not — `procedural/palettes.mjs`
      redraws them).
    - Correct both docs, and give `real-assets.md` a v2 rewrite (art at 640×360 density, not "1×, 384×216").
- **Acceptance:** fixtures (a JPEG and a PNG sheet) ingest into the expected PNGs; a recipe re-run is
  byte-identical; the pipeline picks up the override and the atlas test passes; provenance is validated by a test
  (every override PNG has a `.art.json` or a `LICENSES.md` entry).
- **Manual (owner):**
  - **ingest the round-2 winners** once they are committed under `art-prompts/v2/winners/`, after the FLUX licence
    decision (R3-05, `art-provenance.md` §8 decision 1 — every FLUX model is `hold` in `models.json` today);
  - the R3-01 ingest proof, one sample sheet per category;
  - hand cleanup in each sprite's `<name>.edit.png`, and the content review recorded in its recipe's
    `provenance.reviewed`.
- **As built** (`7791ab2`, `bb3c965`, `911ed98`, `65b6a10`; review fix `2365a64`; review round 2 clean; CI's
  `ingest` job green). Built and tested **on synthetic fixtures only**; the real ingest of the winners is deferred
  (orchestrator decision W1-D3, §1):
  - **The loader** (`scripts/assets/sprite-source.mjs`) skips `*.recipe.json`, `*.art.json` and `*.edit.png`
    (`INGEST_SUFFIXES`), and a PNG sidecar's slice pivot now **wins** over a code-defined anchor (the fallback). Inert
    today — there is no override PNG, and the atlas bytes are unchanged.
  - **`art-prompts/ingest/`** — `ingest.mjs [--check] [--out] [--root] [--palettes] [--models] [--date] [--report]
    [--strict] [-q] [recipe|dir…]`; its own `package.json`, npm lockfile and `node:test` suite (178 tests); **two**
    pure-JS dependencies, `pngjs@7.0.0` and `jpeg-js@0.4.4` (no single package decodes both; no background-removal
    model); `pnpm-lock.yaml` unchanged. It implements bible §8: per-region key sampled from the border plus a
    4-connected flood fill, `holes: "auto"` or seeds, opening and islands, edge despill, the black key for
    translucent / additive art; an exact area downscale (never up), pixel snap, binary alpha at half coverage; a
    median-cut, named or explicit palette within the category's colour cap — a fixed palette larger than the cap is
    reduced deterministically (review round 1); every non-cycle colour ≥ 3/255 from every `content/stages` cycle
    ramp, cycle art exact; Bayer dither only where §3.7 allows; the outline; the hand-edit layer merged last
    (`#ff00ff` erases; `cleanup: "none"` with an edit layer that changes pixels is an error); the report (colours,
    the backdrop lighting budget, ramp near-misses, mixels).
  - **Determinism:** PNGs without ancillary chunks, compressed by the tool's own pure-JS DEFLATE (no dependence on
    Node's zlib), written indexed when they fit 256 colours; re-runs are byte-identical and `--check` verifies it
    (CI). Text files are hashed with CRLF read as LF, so a Windows checkout gives the same records (instead of a
    `.gitattributes` rule).
  - **The record** (`<name>.art.json`, `shmup-art-provenance@1`) follows `art-provenance.md` §5: `origin`
    `ai-assisted | hand`; `ingestedAt` is the scope's "date"; `handCleaned` = `cleanup ≠ none`; model, weights and
    licence **per source** (a sprite can be cut from several images); the ship / hold verdicts stay out of the
    records, as policy in `art-prompts/ingest/models.json`, joined by licence id. Review round 1 made the record the
    same on every checkout and every claim checked: an edit's input images are recorded from **committed** copies
    only (`candidates/<slot>/<id>.png` → `winners/<id>/winner.png`, or the recipe's `provenance.reference`), followed
    recursively; a missing image, sidecar or model is an error, never `null`; "unknown model" is an error, never
    `hand` (`"none"` says hand-made); paths that leave the repository are rejected, in recipes and in
    `validateRecord`.
  - **Output** is written next to its recipe, whose `name` must match that location, so the move from the staging
    folder `art-prompts/v2/ingested/` to `assets/source/sprites/` at R2-01 is a folder move. The tool reads the
    staging folder only when it exists; nothing was created under `art-prompts/v2/`. Named palettes live in
    `art-prompts/ingest/palettes/` (none yet — R5).
  - **Tests:** `test/scripts/assets/provenance.test.ts` (part of `pnpm test`) builds an atlas from an ingested
    sprite (its sidecar anchor beats the code anchor) and fails on an override PNG without a valid record or a
    `LICENSES.md` entry, a record without a PNG, a PNG changed after ingest, or a recipe never ingested. CI's new
    `ingest` job runs the tool's `npm test` and `ingest.mjs --check`.
  - **Docs:** `docs/dev/real-assets.md` rewritten for v2 (it no longer claims a sidecar-less strip is sliced or that
    the colour-blind variants derive from the art).
  - **Follow-ups:** `gen-candidate.mjs` records each edit reference's `editFromSha256` since `4873623`, so ingest can
    later check a winner copy byte for byte (today: by its sidecar's `file` and `generatedAt`). For **R3-03**: `@p2`
    cannot be an override PNG (`@` is not valid in a sprite name) — it needs a recipe field read by `coop.mjs`; tile
    "mask from art" / "art clipped to mask" is not in ingest (it guarantees binary alpha and closed tile edges); a
    cycle-art pixel 2/255 off its ramp is pushed out and stops cycling, which real lava art may need a stronger rule
    for. For **R3-05**: import `art-prompts/ingest/lib/provenance.mjs` (`validateRecord`, `checkProvenanceTree`,
    `loadModels`, `LICENCE_IDS`, `VERDICTS`, `ORIGINS`, `USES`, `CLEANUPS`), walk the nested references when flagging
    `flux-*`, take the override list from `loadSpriteSources(dir).overrides`; the hold gate is the origin report's
    (until it exists, the staging rule keeps FLUX records out of `assets/source/`); `use: "reference"` with
    `cleanup: "none"` is accepted — R3-05 may forbid it. **Done by R3-05 part 2:** the ingest tool still writes such a
    record, but the origin report (`scripts/art-origins.mjs`, rule 5) **fails** `use: "reference"` with `cleanup`
    `none` **or `light`** in the shipped tree (W3-10; in the staging folder it warns), and it is the hold gate (rule 3)
    and the review gate (rule 4, W3-11).

### R3-03 — Variants, palettes and tiles from real art

- **Goal:** the systems built for generated placeholder art keep working with real, full-colour art.
- **Depends on:** R3-02, R2-01 (it rewrites the bullet variants at the new sizes).
- **Scope:**
  - **`@flash`** (white silhouette) already derives from any art: keep it.
  - **`@p2`** today swaps red and blue channels (`coop.mjs:25-83`), which is unpredictable on full-colour art.
    Replace it with a **palette map** in the ship recipe (P1 ramp → P2 ramp).
  - **Colour-blind bullet variants:** bullets stay procedural (R3-01), so `procedural/palettes.mjs` is rewritten
    at the new sizes and keeps the core shape marks (`CORE_MARKS`). If any bullet is ever real art, a recolour
    step maps its palette per `BULLET_PALETTES` — frame for frame, as `pnpm content:check` demands.
  - **Palette cycling** (`render-pixi/src/palette`, up to 8 colours a layer, matched within 1.5/255):
    - backdrops on a cycling layer are **quantised exactly to the stage's `cycles` ramps** (the recipe names
      them);
    - **every other pixel is pushed at least 3/255 away from every ramp colour**;
    - a test scans the atlas pages of each stage's cycling layers for near-misses.
  - **Tiles:** `stage-terrain.test.ts` requires opaque pixels = the collision mask. Ingested tiles get binary alpha
    and the recipe chooses **"mask from art"** (column heights derived from the opaque pixels, checked against
    the column-height model) or **"art clipped to mask"** (keep the designed collision). Decorative detail that
    should not collide goes on the decor layer (R3-06), not into the tile.
- **Acceptance:** a real-art ship gets correct `@flash` and `@p2`; a real-art backdrop cycles with no stray pixels;
  a real-art tileset passes the terrain tests; the colour-blind bullet sets are complete.
- **As built** (2026-10-19/20; `V1` `cf30c2c` and `V3` `f7abd0d` in wave 2 (reviews SRV1/SRV2), `V2a` `8416da5`,
  `V2b`, `V4a`, `V4b`, `V4c` `07194ac` and `V5` `55b5b1b` in wave 4; `R3-03.RV` at zero after its one
  docblock nit (`1dbe091`)):
  - **Bullets native** (W5-9, V1): the bullet and bending-laser-node sprites are drawn at the bible's v2
    sizes natively — the oval drops 14 → 13×13 — not v1 art upscaled; the beams' half was moot, native since
    `16aff20` (6×12, 12 frames).
  - **`@p2`** (W5-10, V2a/V2b): `coop.mjs`'s red/blue channel swap is gone — a palette map in the ship recipe
    reproduces the swap's output exactly (byte-for-byte on the procedural ships, proven before deletion), and
    the ingest recipe learned the `p2` key, recorded into the frame sidecar as `meta.shmup.p2`.
  - **Palette cycling** (W5-12, V3): the scan enforces the bible's §4.4 — any near-miss on a cycled layer, or
    any new project-wide near-miss, fails; the exemption list is pinned in the test. One documented deviation:
    the scan's work floor scaled 1000 → 850 to keep its runtime at the bigger atlas.
  - **Tiles** (W5-11, V4a/V4b/V4c): the ingest tile gains the two collision modes — "art clipped to mask" for
    every tile the heightfield matches by mask (the default), "mask from art" for name-placed or RLE-only
    tiles — and derived masks reach `content/` only through `scripts/assets/tileset-masks.mjs --write`
    (index-matched; refuses to remap a solid tile without `--allow-remap`). `stage-terrain.test.ts` now
    imports the shared `test/integration/terrain-checks.ts` instead of keeping 72 private lines.
  - **Recolour** (W5-13, V5): the real-art bullet recolour step maps every `BULLET_PALETTES` palette
    frame-for-frame by integer BT.601 luma bands (77/150/29) and is proven on a fixture; `pnpm content:check`
    keeps the frame-for-frame completeness rule over the overrides.
  - **Acceptance met** on procedural art and fixtures — `@flash` untouched, `@p2` exact, the cycle scan green
    project-wide, the terrain checks shared, the bullet palettes complete. Real shipped art exercises the same
    gates through R4 by construction; no budget or digest moved (the V1 sizes re-pinned the presentation
    fingerprint in its own commit).

### R3-04 — Atlas pages and memory with detailed art

- **Goal:** prove the memory and size budgets with art of the density R4/R5 will produce, before producing it.
- **Depends on:** R3-02, R1-05, R2-01; uses R0-03's numbers if they exist.
- **Scope:**
  - **A stand-in set of detailed art per zone at the bible's sizes:** 4–6 full-width backdrop layers, a
    12-px tileset with variants, the zone's enemies, a boss at full size.
  - **Pack it with zone groups and measure:** pages per zone, PNG bytes (PNG-8 where possible), decode time,
    texture bytes (with and without `keepPageImages`), `estimateMemory` against the 100 MiB budget, and
    `DIST_BUDGET`.
  - **Set the v2 budgets** in `check-bundle.mjs` and `memory/index.ts` deliberately, with the reasoning in
    `docs/dev/platform-polish.md`:
    - the zone's atlas **bytes**, not a page count (restated by decision W3-8): the GPU copies of the pages a zone
      needs plus the decoded images the policy keeps — `estimateStageMemory(…)`'s `textures + images` — **≤
      `TEXTURE_BUDGET_BYTES`, 23 MiB at 640×360**, every page ≤ 2048²; the page count follows from the bytes. (The
      first target, "`common` ≤ 1 page + zone ≤ 2 pages" of 2048², is 48 MiB of GPU memory alone; even at 2048×1024 it
      is 24 MiB before any decoded image);
    - texture MiB;
    - dist MB;
    - zone-load time ≤ 2 s on the M7 (estimate from the R0 bench's decode figure until measured).
  - **Notes from R1-05** (its As built and reviews):
    - **The inputs exist:** `estimateStageMemory({ imagePolicy: 'resident' })` gives the lazy policy's figure next to
      the runtime's `all` (and `'none'` the figure without kept images); `main.json` carries `pages[].group`, which the
      residency already follows; the R0 bench's decode figure is `analyze-bench.mjs`' **`decodeZoneEstimate`** — one
      2048² RGBA page + two 2048² PNG-8 pages (medians), cold (fetch + decode + upload with `gl.finish()`) and eager
      (uploads only), against the 2 s target. **It is conservative:** under policy "all" (and a lazy zone load) `common`
      stays resident across a zone change, so a real zone change does not pay its RGBA page — subtract it (the per-page
      rows are printed); the synthetic pages are byte-sized stand-ins, so scale by bytes and megapixels (the analyzer
      prints ms / Mpx) and re-measure with this step's stand-in set.
    - **Under policy "all" every page's decoded image stays in memory** (W3-2), which detailed art cannot afford: build
      the lazy "resident" policy (scout B3b — deferred pages in `createAtlas`, a hold while the shown World's pages load,
      a re-fetch after a WebGL context loss, releasing images on unload; the manifest loader and `loadImagesTimed` are
      the pieces to reuse) when the estimate crosses the budget, here at the latest. Dropping images
      (`keepPageImages: false`) needs that context-loss re-fetch first.
    - **Linked and dev stages still keep every page** (`stagePages`: anything outside the campaign): the bonus stages,
      `escape` (the campaign's `escapeId`), boss rush, the dev ranges and the weapon select's preview
      (`memory.test.ts` pins today's "every page" for a non-campaign stage). Aliasing them to a parent zone has a trap
      (lane A review note 2): `escape`, entered from zones H and I, uses `tilesets: terrain-a`, which sits in the `zone-a`
      group — give the escape World H's or I's pages and its tiles are missing (a mid-play re-upload today, a hole under
      a lazy policy). Either make the sprite walk follow `escapeId` (then `terrain-a` is named by three zones, moves to
      `common`, and `atlas-groups.json` must be re-derived — `SHMUP_ATLAS_GROUPS_UPDATE=1`; `atlas-groups.test.ts` fails
      until then) or keep "every page" for them.
    - Detailed art quantised to a zone palette (48–64 colours, art bible) makes each zone page PNG-8 automatically; a page
      over 256 colours falls back to RGBA losslessly, and `common` stays RGBA unless its palette is constrained. Replace
      `cjk-budget.test.ts`' `ATLAS_PNG_BYTES_CAP` with the real atlas budget, and re-derive the groups file whenever
      content moves a sprite between zones.
    - **`DIST_BUDGET`:** pages × measured bytes per page + code + recorded audio (`check-bundle.mjs`' docblock gives the
      derivation). The bench widget shares it: `dist-bench/` is ≈ 4.66 MB since B4's decode pages, ≈ 3.4 MiB of headroom
      — watch it when the "v2 zone stand-in" scenario lands.
- **Acceptance:** the stand-in set passes the new budgets in CI; the render bench gains a "v2 zone stand-in"
  scenario.
- **As built** (2026-10-18/20; the residency chain `M3a`–`M3e` `e1dcedf … 338c3fe` landed in wave 2 with its
  blockers closed at `ef40bfd`, the stand-in `M1a` `341836b`/`ef7634c` and `M1b` `1f49f41`/`fc4c6cd`
  (`9979be3` docblock) in wave 4, the budgets `M2a` `2739efc` and `M2b` `e0a526d` (the derivation written up
  in `3b800ae`), the bench `M4a` `175205d` and `M4b` `5e3d25d`; `R3-04.RV` **approved at zero findings**, owner
  parts pending):
  - **Lazy residency** (W5-15, the B3b policy — shipped on `master` as the prospective default): deferred page
    loads in `createAtlas`, a hold while the shown World's pages load, decoded images released on unload, and
    a re-fetch after a WebGL context loss. *Prospective* because today's atlas crosses the derived
    `TEXTURE_BUDGET_BYTES` (23 MiB at 640×360) only at ×2.044 eager / ×2.706 lazy stand-in density — the flip
    is measured, not assumed (decision W3-8's restatement in bytes holds).
  - **The stand-in** (RR-7, W5-14, M1a/M1b): `scripts/assets/standin.mjs` is a seeded generator of bible
    density — backdrops at ≥ `FRAME_W × FRAME_H` (2× for zones b/d/f/h), 3–5 bands of 120–240 px, a 40-tile
    12-px tileset, a 56-colour palette kept ≥ `RAMP_MARGIN` off every reserved cycle ramp; `standinAtlas` adds
    10 enemies (4–6 frames, `@flash` siblings) and a 420×202 three-part boss, packed as `common` +
    `zone-a … zone-i` + `standin-zone-a … i` (19 pages, ≤ 2048²). The stand-in pages come out **PNG-8 at
    0.3–0.6 MB per 2048×1024 — R1-05's assumption, still uncalibrated**: the optional `M1c` calibration never
    ran (it is host-bound), which the generator's constants say out loud.
  - **The budgets** (M2a/M2b, W5-16): `test/integration/standin-budget.test.ts` (6 tests) gates every stand-in
    row's `textures + images` ≤ 23 MiB under `imagePolicy: 'none'` and within the 100 MiB total; the
    `'resident'` figures are printed, not gated — they exceed the atlas share by 1 MiB, exactly the crossing
    that made the lazy policy the default. `DIST_BUDGET` is 8 → **16 MiB**, derived in `check-bundle.mjs`'s
    docblock (pages × measured stand-in bytes + code + recorded audio), and `cjk-budget.test.ts`' figure is
    replaced by the real atlas PNG caps: 300 KB `common`, 600 KB per zone, 5.7 MB total
    (`test/scripts/assets/atlas-budget.ts`), all derived, not hand-set.
  - **The bench** (RR-8, W5-17/W5-19, M4a/M4b): the TV render bench's decode scenario loads the stand-in pages
    instead of the synthetic ones — `DECODE_PAGE_IDS` = `standin-zone-a`, `common`, `zone-a`
    (`bench-decode.mjs:71`), the run gains its last page load and `BENCH_RUN_LENGTH` became derived
    (`BENCH_SCENARIOS.length + 2`); `analyze-bench.mjs` reads the new ids. The render bench gained the
    **"v2 zone stand-in" scenario** (acceptance): a zone of stand-in pages loaded and drawn, with its own
    violation set (`standinBenchViolations`). The M7 zone-load estimate per W5-19: 62.3 ms per page in headless
    Chromium × R0-02's 7.5 desktop-to-M7 ratio ≈ 470 ms — a whole v2 zone A at ≈ 450–720 ms against the 2 s
    target, cheaper than the 1.5 s R0-03 measured for the synthetic campaign load.
  - **Kept as planned** (W5-18): linked and dev stages still take "every page" (`stagePages`) — the escape /
    `terrain-a` aliasing trap stands until R5-10.T8.
  - **Open after review:** the typed stale-atlas error (`F7`, a wave-3 carry) never landed; the on-device
    checks (M7 context-loss round-trip, the stand-in bench run on hardware, webOS 5) are the owner's, as is the
    bench warm-up ordering question RV44 left standing.

### R3-05 — AI art provenance and licences

- **Goal:** every shipped image can be traced, and the project can show it had the right to ship it.
- **Depends on:** R3-02.
- **Scope:**
  - `docs/dev/art-provenance.md`: which models were used and **the licence terms each grants for commercial use
    of outputs** — to be read from each model's licence, not assumed. **FLUX.1-dev in particular ships under a
    non-commercial model licence; read its clause on outputs before shipping art made with it**, and prefer
    models whose output terms are clearly commercial-friendly for shipped sprites.
  - The ingest tool's `.art.json` per image; a script that lists every shipped sprite by origin
    (procedural / hand-drawn / AI-assisted + model).
  - **"Original names, art and music only" still holds:** a test greps the prompt library for franchise and
    character names (none today), and the art bible forbids style references to named games or artists.
  - **Store disclosure:** Steam's content survey asks about AI-generated content; check itch.io, Samsung and LG
    policies at submission. The answers live in `docs/client/store-submission.md`.
- **Acceptance:** the origin report runs in CI and lists no sprite without provenance; the licence table is
  filled for every model that produced shipped art.
- **Manual (owner):** the open decisions of `docs/dev/art-provenance.md` §8 (a summary of licence texts, not legal
  advice):
  - **FLUX — before round 2** (FLUX.2-dev made 84 of the 91 winners, FLUX.1-dev one): ask Black Forest Labs the
    three questions of its §4, buy a self-hosted commercial licence, or replace the 85 FLUX winners (from the text
    prompt with an Apache 2.0 model, or by hand — an edit or a video made *from* a FLUX image inherits the question);
  - **the licensee** — a person or a company, and its group's revenue: SD3.5's limit is USD 1 M a year and LTX's
    USD 10 M, both counting affiliates and all revenue;
  - **register with Stability AI** before any SD3.5-derived pixel ships, and ask whether its "Powered by Stability
    AI" notice applies to a product holding outputs only;
  - **LTX clips:** the wording and place of the "machine generated" note each clip needs, and whether re-encoding
    a clip removes the provenance the model embeds (a question for Lightricks);
  - **credits:** whether to name the AI models in the game's credits;
  - **"SNES"** as an era word in the prompts (about 1,400 uses): keep it, or say "16-bit era" (the name check allows
    it until then);
  - **reword** the FACET MONARCH picker label "the crystal core …" (`art-prompts/v2/manifest.json`, pinned in the
    name check) and the zone-montage clip prompt's "in the style of a side-scrolling arcade game";
  - **the store disclosure texts** (`docs/client/store-submission.md`, AI-content disclosure), including the
    agent-written translations, in-game text, music and sound data and code.
- **As built** (part 1, `53bb83b`; 2026-10-17):
  - `docs/dev/art-provenance.md`: every model of the art round with its licence read for commercial use of its
    outputs — **FLUX.2-dev and FLUX.1-dev hold** (non-commercial model licences whose outputs clause and
    commercial-use bans pull in two directions; Black Forest Labs says self-hosted commercial use needs a licence);
    **SD3.5 Large ships** after a free registration, under USD 1 M a year; **Qwen-Image and Wan2.2 ship** (Apache
    2.0); **LTX-2.5 ships** under USD 10 M a year, each clip disclaimed as machine generated and its embedded
    provenance kept. Also what cleanup changes (copyright of the hand-made part, not the licence or the
    disclosure), what every shipped AI-assisted asset must record, and what part 2 needs from R3-02.
  - `test/integration/art-prompt-names.test.ts`: the name check of the prompt library (`art-prompts/**`, plus the
    provenance and recipe files R3-02 writes under `assets/source/`); no forbidden name today. It pins one hit it
    may not fix (the FACET MONARCH label in the art round's manifest) and allows "SNES" while the owner decides;
    a style reference to a named game or artist is forbidden by the art bible's §7.
  - `docs/client/store-submission.md`: an AI-content disclosure section for Steam ("Pre-Generated" in the content
    survey, shown on the store page), itch.io (its AI disclosure tags), Samsung and LG (no AI question in their
    public guides today), with draft texts.
  - **Part 2 waits for R3-02:** the origin report needs the `.art.json` schema and an importable validator, the
    list of real-art override PNGs, the `LICENSES.md` format, the staging folder handled like
    `assets/source/sprites/`, and a fixed map of licence ids to model ids.
- **As built** (part 2, the origin report — `fa72c78`, review fix `f9d3f69`; review round 2 clean; 2026-10-17):
  - **`scripts/art-origins.mjs`** (`node scripts/art-origins.mjs [--list] [--json] [--check] [--source DIR] [--staging
    DIR] [--models FILE]`; no root `package.json` script, W3-12) lists every sprite the atlas packs by origin —
    `procedural`, `hand`, `ai-assisted`, `unknown` — and kind (`generator`, `pixel-map`, `font`, `flash` / `p2` inheriting
    their base's class, `record`, `licensed`, `untraced`, `unclassified`), and the served model of every source and
    **nested** edit reference. "Procedural" is derived from the pipeline's own sprite list (`collectSprites`' origin
    strings), never declared; records are checked with the ingest tool's `lib/provenance.mjs`, never restated. Exit 1
    on a failure, a missing source folder or a broken model table; exit 2 for bad usage only.
  - **Rules 1–6** (`RULES`): 1 every `checkProvenanceTree` issue; 2 every modelled source and reference names a model
    of `models.json` with its served id and licence id; 3 nothing in a record's source or reference tree is on `hold`
    for its `use` — joined by model **and** by licence id (the FLUX gate); 4 a shipped `ai-assisted` record is reviewed
    (W3-11); 5 a `use: "reference"` record has `cleanup` `heavy` or `redrawn` — `none` / `light` fail (W3-10); 6 every
    origin is classified, the pipeline reports no source issue and no recorded path points into the git-ignored
    candidates folder. **In the shipped tree every finding fails; in the staging folder rules 3–5 only warn** (art may
    be staged before its review or the FLUX decision, never with a broken record — rules 1, 2 and 6 fail there too).
    W3-12: pixel maps, the font, generators and their siblings are `procedural` (agent authorship is a
    store-disclosure question, `art-provenance.md` §8).
  - **`test/scripts/art-origins.test.ts`** (26 tests, part of `pnpm test`): the shipped tree passes; the ingest
    fixtures copied into a temporary tree fail exactly as expected (7 failures: the three FLUX records held, three
    unreviewed, `gyre`'s reference + `none`); the staged severities (review round 1: a staged warning failed the
    shipped-tree tests — `f9d3f69` makes them require no failure and no shipped finding, and proves a staged unreviewed
    sprite passes); the CLI's exit codes, `--list` and `--json`. It also **ties `art-provenance.md` §2 to
    `models.json`**: every licence cell now ends with `; id \`<licence id>\``, every model in the table has a §2 row
    with the same pixels / reference verdicts, and the LTX-Video row reads **hold** until its checkpoint and licence
    are known (as `models.json` already said; no verdict changed).
  - **Today:** 438 procedural sprites (252 generator, 49 pixel-map, 1 font, 132 `@flash`, 4 `@p2`), no model, no staging
    folder — 0 failures. The acceptance holds trivially until the real ingest (R3-02's manual step, after the FLUX
    decision); `art-provenance.md` §9 documents the report.
  - **Open, for R3-03:** a real-art bullet's `@<palette>` variants cannot be override PNGs (`@` is not valid in a sprite
    name), so they stay `procedural:palettes` sprites and are reported as procedural even when their base is real art.
    When R3-03 decides how variants of real art are made, a derived variant should **inherit its base's provenance**,
    as `@flash` / `@p2` already do.
  - **Not done here:** the "Licences" note in `art-prompts/images/README.md` waits for round 2, with R3-01's post-round-2
    edits.

### R3-06 — Stage art features for detailed levels

- **Goal:** the engine features that detailed, expanded levels need, ready before R5 uses them.
- **Depends on:** R2-03.
- **Scope (each with zero-allocation guards and e2e coverage):**
  - **Decor layers:** non-colliding tile and sprite placements behind and in front of the terrain (stage JSON
    `decor`), culled by the camera like terrain, drawn from the zone's page.
  - **Painted backdrop layers:** a full-width image per parallax layer (in place of, or alongside, 128-px
    bands), with integer-snapped scroll factors, vertical offset with the camera, and optional slow animation
    frames.
  - **Up to 6 parallax layers**, plus an optional sparse **foreground** layer in front of the ship. It must never
    hide bullets — the draw order keeps enemy bullets above everything except the HUD.
  - **Lighting accents:** additive glow sprites attached to enemies, bosses and terrain (the existing per-layer
    blend sprites).
  - **The Tiled importer** maps decor and backdrop layers.
  - **The render bench** gets these layers (it already models them synthetically since R0-02).
- **Acceptance:** a gimmick-range-style test stage uses every feature; draw calls stay within budget
  (`DRAW_CALL_BUDGET`, raised only deliberately); goldens unchanged (presentation only).
- **As built** (2026-10-20/21; wave 7: L1 `d3a3b0e` + `003af49`, L2 `138bddb`, L3 `b6c08ec`, L4 `1ea1f8f`,
  L5 `034ecb3`, L6 `246d014` + review fix `eb0184d`, L7 `b5afd39`; the step review's two test-only fixes
  `2f2365d`; `R3-06.RV` at zero):
  - **Decor (L1 schema, L2 runtime):** a stage lists `decor[]` — `{layer: back | front, sprite | tile, frame,
    x, y}` (+ optional `glow`), capped at 256 items, non-colliding, compiled into the typed-array
    `StageDecorView`, culled by the camera window ± 512 px (`DECOR_CULL_MARGIN`), `back` drawn on
    `DecorBack` (below the terrain), `front` on `DecorFront` (above it, below the sprites).
  - **Painted bands (L1/L3):** the parallax bands are the full-width painted backdrop images themselves —
    256-px-wide art, seam-perfect because `ceil(640 / 256) + 1` tiles one playfield width at the native 3/2
    scale — with integer-snapped scroll factors, `yFactor` for the camera-follow, and `frames` / `frameTicks`
    slow animation the renderer follows through `ParallaxView.frameIndex`; a band may name the `fore` layer,
    capped at 6 background bands plus one foreground.
  - **The new layers (L2, decision RR-6):** `LayerId` grows 14 → **17** with the three inserts — `DecorBack`
    2, `DecorFront` 4, `Foreground` 12, so the sparse fore layer sits **below** `EnemyBullets` 13: bullets are
    never hidden, by construction (`createParallaxBinding` throws for any layer outside
    {`BgFar`, `BgMid`, `Foreground`}) — 13 Pixi render groups. The re-pin the decision names moved 82 of the
    presentation fingerprint's 119 rows and the shell's 4 flight/showcase world hashes, **world column only —
    re-layering, no drawn value changed** (the body of `138bddb` carries the reason verbatim).
  - **Additive glows (L4):** enemy specs, boss parts and decor entries take an optional `glow` sprite name —
    a plain `s.str`, deliberately **not** `s.ref` (a ref would write `glowId = -1` into every resolved shape
    and move the content-DB fingerprints); the loader interns the names through the sprite table, so an
    unknown glow name fails `content:check`. The World carries companion additive batches under a per-DB
    `anyGlow` rule: a DB whose stages name no glow adds no batch at all; once one stage names one, the four
    enemy/boss glow batches exist in every World, empty (zero draw calls) until an owner glows. Batch order,
    precisely: the enemy and boss glows are appended **after every body batch** (last in their layer); the
    decor glows sit right after their owners. Part glows follow the part's visibility.
  - **The Tiled importer (L5):** `decor-back` / `decor-front` tile layers (placed row-major, never the terrain
    fallback), class-`decor` objects, and image layers → bands with `far` / `mid` / `fore`, `yFactor` /
    `frames` / `frameTicks`; six refusals; the `tiled-decor` fixture pair round-trips through `loadContent`.
  - **The feature stage (L6):** `content/stages/decor-range.stage.json` — length 5400, the cap shape of **7
    bands** (6 back + 1 fore, two cloud rows cycling 2 frames at 240 / 320 `frameTicks`, ridge at 300), 12
    decor entries (sprite pillars + tile forms, one glowing `fx/glow-lantern` pillar), the `glow-mote` enemy
    and the DECOR WARDEN boss with a glowing vent — and 8 procedural sprites from the filled `decor.mjs`, which
    returns `[]` at scale 1: the `fa4198…` digest pin never moved. The stage is a **v2-only dev range** —
    carved from the v1-baseline comparison as the single `POST_V1_STAGES` entry, and the carve asserts the id
    still ships. Its `decor.spec.ts` browser line (4 tests, pixel-proven through the live frozen flight) and
    the three fingerprint re-pins landed with it (content-db 12 shipped rows; `examples` moved only at L1's
    `d3a3b0e`). Review fix `eb0184d`: the spec types its generator frames and guards the nulls (RTL6 C1).
  - **The bench (L7):** the render bench's decor scenario measures a fully decorated frame at **14 draw calls
    inside the standing 20** — the measure-first law held, the gate byte-untouched since `35a80f8`.
  - **Guards and acceptance:** the new allocation guards (`stage-decor` 64 / 32 KiB, two `layers-decor`
    256 KiB, the glow paths) are green and `git diff --diff-filter=M` over `*alloc*` in the range is empty;
    every feature is flown by the test stage; the **goldens moved for zero R3-06 commits** — the step's only
    replay-era commit in the range is `a285e0e`, R2-04's blessed re-bless. The step review closed the two
    landing-seam reds nobody's scoped list owed until then (the shell flight batch tail — the per-DB glow
    companions are in every World once decor-range ships its glows — and the pipeline spill case, moved to the
    scale-1 source set, where a genuine 15-page spill is still proven and the 256-px bands stay validated by
    the default-scale build: a fixture failure is fixed, never gated) at `2f2365d`.

---

## 10. R4 — The shared art redo

Each step: art made per the bible (R3-01) through the ingest tool (R3-02) or by hand; old names kept where the
sprite's role is the same (no id reorder, no re-bless). New frames and names are added where the bible asks, and
then re-blessed with the reason.

**R4 prep (decision RR-5 — "R4's prep runs in R2-04's wave"; landed in wave 7, reviewed by `R4-P.RV` at zero
blockers).** `R4-P.P1` (`a359b7e`) split the shared procedural generators (`direct-items`, `arm`, `blackhole`,
`logo` out of `direct` / `particles` / `ui`), registered the four planned v2 modules (`thrusters`, `title`,
`ui-kit`, `decor`), and grew the campaign credits over the new modules (+3 lines, 14 ≤ 16; its fingerprint rows
re-pinned with them) — the atlas **byte-identical** across the split at both art scales; `R4-P.P2` (`7afc838`)
split the 1362-line procedural suite into 22 per-generator files plus a shared helper. `R4-P.P3`
(`e3feb5d`, `fe940c3`) built **RR-1: the v2 sources beside v1** —
`<path>.v2.sprite.json` is a sprite's v2 pixel map (native implied, consumed only at an art scale ≠ 1), a v2
font is a `"native": true` file of the same `name`, a generator branches on `options.artScale`, and at scale 1
a PNG override of a code-sourced name is skipped — so the scale-1 build (the TV bench atlas, the CJK figures)
draws the v1 art unchanged, its digest pin `fa4198…` green and never re-pinned, until the v2.0.x clean-up that
deletes the v1 sources after the release. RR-1a (a new name may exist only as v2, absent from scale 1) and
RR-1b (frame counts the v1 sources lack are a v2-art concern; the relation tests skip native sprites) are the
decision's two allowances, both held by `R4-P.P3`'s tests. `R4-P.P4` (`aee8ec9`) added `scripts/assets/v2kit.mjs`
— the shared read-only v2 drawing kit (`outline`, `topLeftLight`, `bottomRightShade`, `outlineColour`, `offRamp`),
outside the registry on purpose, nothing shipped through it yet. The R4 steps draw on all of this: their art
arrives as v2 sources beside the v1 maps, never by moving the scale-1 build.

### R4-01 — Player crafts, Options, shields, player shots

- **Scope:**
  - **Ships:** KESTREL and MANTA (24×14 class, 5 bank frames, thrusters, `@p2` via palette map, `@flash`).
  - **Options and shields:** Options and the stolen Option; Force Field, Reduce steps, pods, the Direct-mode Arm
    tiers.
  - **Shots:** all 22 shot sprites (Types A–D, Extra Edit, the Direct families, lasers, ripples, missiles); the
    black hole and the Mega Crash flash.
  - **Fly-in / fly-out** and ship-select previews.
  - **Hitboxes unchanged** (content values already ×1.5).
- **Acceptance:** `pnpm docs:images` plates show the new art; the ship select and weapon preview e2e pass;
  provenance complete.
- **As built** (2026-10-20/21; wave 8 `w08-L1` / `L4` / `L5` / `L7`, closeout `w09-L1`; step review `R4-01.RV`
  APPROVE, zero findings including nits):
  - **Ships** (`A1a` `e90e17e`): KESTREL and MANTA native v2 pixel maps plus the KESTREL thruster
    (`ships/{kestrel,manta,kestrel-thruster}.v2.sprite.json`); the `@p2` siblings inherit a native source's
    flag — a `makeP2Sprite` deviation in `scripts/assets/coop.mjs`, needed because the `@p2` of native art
    failed the interim-pipeline anchor and upscale cases (precedent: `recoLourBulletOverrides`).
  - **Five bank frames** (`A1b` `4248f5b`): `bankFrames` 1 → 2 in `content/player/{kestrel,manta}.player.json`
    (core needs `1 + 2 × bankFrames` frames) and the shell showcase maps the five. **The wave's one sanctioned
    golden re-bless: the bank field is hashed** — `hashWorld` mixes `p.bank` (`packages/core/src/debug/index.ts:496`)
    — so 31 recordings (29 goldens and the zone-f and zone-g demos) moved in that one commit, the reason
    stated in its body; the same commit re-pinned all three fingerprint tables (the new ship art is drawn
    through the shell's scenes too).
  - **Thrusters behind every ship** (`A2` `f0942b1`): `ships/manta-thruster` is a v2-only name (RR-1a); the
    thruster fields join the player schema, the example and the content README; `syncThrusters` pre-passes the
    world sync so every flame draws before every hull — the per-player interleave was abandoned when V8 stopped
    inlining `syncWorldView` (~20 B/tick boxing, caught by `scenes-weapon-select-alloc`) — the ship batch
    capacity doubles, and the burn cycles `(tick >> 2) & 3` with MANTA's flame green (`#30c870 / #a8f8c0 /
    #f0fff4`). **No bless — the thrusters are presentation-only and never hashed**; the new names did move all
    three fingerprints' name rows (names only; the hashes stayed, and the later steps kept them pinned).
  - **Options pulse** (`A3` `7b07886`): `OPTION_FRAMES` 2 → 4, exported from `core/options`; the carried-Option
    syncs derive `floor(tick / OPTION_ANIM_TICKS) & (OPTION_FRAMES − 1)` at sync time — **not hashed**, goldens
    unmoved; the orb and the stolen Option become native 12×12×4 hand maps on the v1 palettes byte-for-byte
    (calm → glow → flare → contract; frames 0 and 2 are the exact ×1.5 upscales of v1); the TV bench draws
    frame 0 only (RR-1b); 10 presentation segments re-pinned, content-DB and shell unmoved.
  - **Force Field** (`A4` `92b4b73`): 45×36 × 8 frames = 4 wear states × 2 shimmer (a private
    `FORCE_FIELD_SHIMMER_FRAMES` 2 — no new export); the shimmer is a seeded 10 % ring-band recolour that never
    adds or drops a pixel, equal ink per pair, wear-monotone; the v1 field byte-identical (pixel-compare
    proven); 6 segments re-pinned (the four of `B2`'s landing plus the game and co-op shield walks).
  - **Shields and shots** (`A5` `1a55480`, `A6` `4a9602f`, `A7` `7de90ee`): native pod 12×12×4, Reduce 30×21×2,
    Arm 39×27×9; the eleven shot pixel maps under `shots/` redrawn with anchors `⌈1.5 × v1⌉` (the four
    anchorless maps take the centre-of-odd default `[3,3]` / `[4,4]`); the generated shots native in
    `weapons.mjs` / `direct.mjs` — blast 48², ripple 36×66 (the v1 ring exactly ×1.5, half heights 6 → 30 in
    the same frame order, which core's size pick indexes by), cyclone at the 12-px `LASER_SEGMENT_LENGTH`
    period — v1 frame counts and colour tables kept. Pure redraws: **no fingerprints moved**; the interim
    upscaled-pool floor 600 → 560 followed the a7e50d2 precedent (count 591).
  - **Black hole** (`A8` `b760dbb`): native bible 48×48 × 8 frames — `BLACK_HOLE_FRAMES` 4 → 8, the sync pick
    derived from the constant so the 96-tick pull keeps its 5-tick frames; the disc opaque `#1c0f30` (the v1
    alpha `c8` dropped per the bible rule), black core r < 10 (R2-04.P4's minimum), arms `b060f0 / 6040d0 /
    3060b0`, rim `#d8b0ff`, wind `3 · turn − d · 0.04 + f / 7` — v1's shape ÷1.5 keeps the visual pitch; frame
    7 discharges. v1 stays 32²×4 byte-identical; **no fingerprints** (the vortex frame is sync-time). P4 had
    recommended keeping 4 frames; this step's block overrode that to 8 and applied P4's other two
    recommendations.
  - **The Mega Crash flash was not touched in this round** — no `R4-01` commit carries it (R2-04.P2's measured
    values hold); the fly-in and previews needed nothing, they draw the same names.
  - **`A9` and `B4` (`w09-L1`): zero commits, VERIFIED-NO-OP.** Wave 8's E2E commits `77353fb` (browser-spec
    cures) and `75dc7c0` (plate redraw) had already consumed the block's work before wave 9 opened; the fresh
    re-derivation confirmed every acceptance line at the tip — assets byte-identical (449 sprites, 1,549
    frames), `docs:images` 145 images 0 written, the ship-select and weapon-preview e2e green with no
    assertion change, `art-origins --check` 0 / 0, the scale-1 digest pin green.
- **Manual (owner) still pending:** the ships' look and anchors on a dev build (KESTREL `[12,6]`, MANTA
  `[12,7]` — the bible allowed `[12,8]`), the five-frame bank's roll, the thruster burn's rhythm and MANTA's
  green, the Option cycle, the Force Field shimmer's density, the pods / Reduce / Arm and the eleven shots' v2
  weight, the black hole's vortex, the black hole's pull.

### R4-02 — Enemy bullets, lasers, items

- **Scope:**
  - **Bullets:** 9 kinds → bible sizes (e.g. 11 → 16–17 px); bright core and dark rim; the 1- or 8-frame rule
    (`bullets/index.ts:314-315`) kept or extended with a deliberate re-bless.
  - **Lasers:** telegraph and beam, bending-laser nodes.
  - **Items:** capsules (red, blue, bonus), point items, 1UP, Direct-mode items.
  - **All colour-blind sets** frame for frame; the e2e colour assertions (`bullet-palette.spec.ts:17-25` etc.)
    re-pointed.
- **Acceptance:** readability check — a bench screenshot with 512 bullets over each zone's stand-in backdrop
  keeps every bullet distinguishable (owner sign-off), plus `content:check` green.
- **As built** (2026-10-20/21; wave 8 `w08-L7`, closeout `w09-L1`; step review `R4-02.RV` APPROVE, zero
  blockers and zero should-fixes, two minors both carried as doc rows):
  - **Bullets and lasers: zero pixel changes.** The v2 bullets and bending-laser nodes have carried the
    bible's sizes, bright core and dark rim since `R3-03.V1` (the beams were native from the flip); the
    round's audit confirmed it, so the 1- or 8-frame rule stayed and every colour-blind set kept its
    frame-for-frame variants (the e2e colour assertions needed no re-pointing). `content:check` green
    throughout.
  - **The readability sheets** (`B1` `d875eac`): `scripts/bullet-readability.mjs` derives the acceptance's
    screenshots deterministically — nine stand-in zones × 4 palettes = 36 sheets at 640×360, 512 v2 bullets
    each scattered from `seedOf`, `--out` settable. It changed no pixels and moved no fingerprint (B1's own
    honesty, reviewed sound).
  - **Every item kind glints at 4 frames** (`B2` `ba09e57`): all ten `ITEM_KINDS` go `frames: 4` (the point
    item was `B3`'s, and stayed out); native pills 18×12×4 in `items.mjs` (dim → dim+spark → lit+spark → lit)
    and the six Direct-mode items 15×15×4 in `direct-items.mjs`; atlas frames 1,509 → 1,529; 4 presentation
    world segments re-pinned. `powerups/index.ts` touched only the table — the two docblocks the change ages
    (`ITEM_BLINK_TICKS`' "two-frame blink", `ItemKindSpec.frames`' "a blink when 2") stay for a code lane,
    which has no src sanction to edit here (`R4-02.RV` F-A).
  - **The cancel point's spark stages** (`B3` `e1ed688`): native 7×7 × 4 frames on v1's three colours only
    (`#ffc830` body, `#6a4818 → #6a4808` rim, white spark; binary alpha) — a travelling-rim spark, plain →
    cardinal → whole-rim → rim-minus-tips; the frame pick `(age >> 3) & 1 → & 3`. **The field is hashed** (the
    `cancelPoints` pool rides a batch into `hashWorld`), so exactly two goldens re-blessed in the commit —
    `twin-range-god` and `zone-h-arcade`, one state-hash line each (their late windows credit cancel points;
    no demos moved; two-pass deterministic). No fingerprints (the walks never hover-credit). The upscaled-pool
    floor's ledger: 563 → 539 (`B2`'s pills) → 537 (the native point), the > 500 floor of `fc3f78e` holding.
  - **The `B4` gate with the empty `A9` set** (`w09-L1`): honoured as fetched-verified — nothing `A9` changed
    meant nothing beyond the sheets to re-derive; the 36 sheets re-derived to
    `/home/sites/shmup-cup-run/R4-02.B4-readability/` for the sign-off.
- **Manual (owner) still pending:** the readability sign-off on the 36 sheets (owner: the `B4` row of the step
  block) — the v1-era numbers' legibility call on `w08-L7-readability/` or the fresh `R4-02.B4-readability/`.

### R4-03 — Font, HUD and the UI kit

- **Scope:**
  - **A new bitmap font:** cell 8×12 or 9×12 (decided here), all 195 glyphs including the 84 katakana and the
    Spanish accented capitals, `UI_GLYPHS` equal.
  - **The HUD redesigned** for 12-px bars: score, hi-score, lives, the power meter and its labels, the Direct
    tier pips, the co-op halves, the boss HP bar.
  - **The UI kit's** panels, cursors, sliders and toggles; the zone map, name entry, rebind screen, input test
    and credits at the new metrics.
  - Line caps re-derived (credits and story lines: 60 × 6 px → ~70 × 9 px).
- **Acceptance:** every scene's e2e and every UI-string scan pass in all three languages; nothing truncates.
- **As built** (2026-10-20/21; wave 8 `w08-L3` / `L6`; step review `R4-03.RV` REQUEST-CHANGES with one minor
  and two nits, all comment-class and cured in-wave; owner eyeball rows pending):
  - **RR-2's decision taken:** the cell is **9×12** — the values R2-01 already carried, so no layout moves.
    The scope's 8×12 alternative died with that decision.
  - **The font file** (`C1` `3c8eca8`): `assets/source/fonts/pixel9x12.font.json` — name `pixel`, cell 9×12,
    line 15, advance 9, 195 glyphs, `native: true` (RR-1's font rule: the scale-1 build keeps drawing v1's
    `pixel6x8`, which is never edited); the pipeline takes the native file at every art scale ≠ 1, and core's
    `GLYPH_W` / `GLYPH_H` / `LINE_H` (9 / 12 / 15) now have their source pinned in `config/index.ts:803-820`'s
    docblock. The atlas manifest never moves; the PNG moves from `C2` on, by design.
  - **The hand-redraws** (`C2` `2954930`, `C3` `2fe757c`, `C4a` `450349b`, `C4b` `68a6fa8`): the 95 ASCII
    glyphs first (body rows 2–9, baseline row 9, descenders into row 10, the columns relaid on ×(1,1,2,2,2,2)
    of the v1 skeleton), then the eight Spanish capitals and `¡ ¿`, the arrows, `● ★ ✕`; then the 84 katakana
    under the kana law — v1 rows 0–6 → v2 rows 3–9, row-7 tails to row 10 (shared with the Latin descenders),
    voiced bodies verbatim copies of their base rows, dakuten two dots in rows 0–2, handakuten the 3×3 ring;
    the small kana and `ー ・ 、 。` fill the rest; `ヅ`-absent / `ヵ ッ`-parity with v1's charset. The new
    `test/scripts/assets/font-v2.test.ts` pins the laws (spacing column 8 empty in all 195, every bitmap
    distinct, RR-2's metrics). No fingerprint or golden moved at any font step — text commands hash their
    strings, never the cells (rule 4).
  - **The interim-floor incident, honestly told:** `C1` landing the native font dropped the
    interim-pipeline upscaled-pool count by 195 and went red against 700 (measured 668–683); `R4-04.D2`'s
    `a7e50d2` lowered the floor to 600 and `fc3f78e` to its current form, re-measured per drop (`B2`, `B3`).
  - **The HUD for 12-px bars** (`C5` `96c4e61`): the boss bar derives `BOSS_HP_BAR_WIDTH = FRAME_W >> 2`
    (160) — the `world-scale.test.ts` pin moved 96 → the derivation (disclosed), and the e2e's
    `frame-pixels.ts` derives the same formula; the Direct groups sit on an even pitch
    (`HUD_DIRECT_PITCH`) with a 4-glyph label reservation (`HUD_DIRECT_PIPS_DX` — sized from the widest
    shipped run label, Japanese ショット, a tested guarantee, replacing the old SHOT/TIER dx pair); the
    family x anchors right (`FRAME_W − uiPx(10) − 4 · GLYPH_W`); the stock row centres on `HUD_STOCK_DY`
    (the flight scene's `LIVES_Y` derives the same 350); native `hud/meter-slot` 60×12 with light top/left
    shade bottom/right and a disabled fill `#202638` (its STORM palette-cycle exemption line deleted —
    the slot is no longer storm-blue), `hud/meter-labels` 54×8 carrying a hand-drawn 4×5 micro script (the
    bible allowed a new font; drawn without waiting on `C1`), and `hud/life` 12×8 with its `@p2` sibling —
    `pipeline.mjs` grows the same `@p2`-native propagation as `coop.mjs`'s (recoLour precedent). 10 of 12
    presentation walks re-pinned; no goldens. The landing cure `d65fcbf` followed the round's middle: the two
    test-tree reds of `B2` (a frames pin, a tsc throw), the pool-ledger floor truth and the Ü glyph law. The
    `RTC5` cure `326ff03` corrected six stale `buildHud` docblock
    rows to 134 / 210 / 286 / 350 with the boss bar at 132 / 160.
  - **The UI kit for the 9×12 font** (`C6` `dcf6380`): `drawPanel` gains the bible §2 two-tone rim — the
    outer magenta `0xb838a8` border plus cyan `0x38c8e8` side rails (`UI_COLORS.rimInner`) — and the slider
    bar grows to `SLIDER_BAR_H = uiPx(5)` centred on the glyph line; the nested double-rim alternative was
    dropped for the draw-list budget (`UI_COMMANDS` 384 — five commands overflowed a 63/8 panel, disclosed);
    explicit-border callers keep the one-colour ring; the cursor, toggles, `NameEntry`, `Confirm` and
    `RebindPanel` needed no geometry move; the 18/6-tick auto-repeat and 4-tick confirm are ticks and
    untouched; `ui-kit.mjs` stays the stub (the kit draws through commands, not sprites). The fingerprints:
    presentation re-pinned as the step's sanctioned move, content-DB and shell unmoved.
  - **The line caps re-derive** (with `C5` / `C7`): the credits' and map labels' caps come out of
    `GLYPH_W` / `LINE_H` through the panel insets (`campaign.ts` holds 47 / 67 at the v2 metrics), and the
    scope's "~70 × 9" question resolves to the tested derivation, not a literal. Every scene e2e and the
    UI-string scans pass in en / es / ja (the `L6` suite; the ja strings' `UI_GLYPHS` equality holds by rule).
  - **The R6-04 seam:** the review's fourth finding (the Electron boot's save read used the wrapped key, not
    the raw bridge key) belongs to the GRAPHICS page's boot knobs, not this lane — it was cured as `634e913`
    in wave 9's R6-04 chain.
- **Manual (owner) still pending:** the ASCII and symbol legibility at ×2 / ×3 on the M7 and a 720p desktop
  (the "100% & R&D ~3" row, 0-vs-O, 8-vs-B, % vs &); the Spanish accent line (¿LISTOS? ¡VAMOS!); a
  Japanese-reader check of the kana (dakuten dots vs the handakuten ring, small kana — the test strings
  ガソリン パン マッチ テスト データ ズッキーニ, ステージ 3); the 12×8 life miniature, the meter-slot bevel, the
  4×5 micro script, the disabled-fill restyle; the magenta-and-cyan rim over the real menus and the slider
  bar on the 12-px Options row.

### R4-04 — FX and particles

- **Scope:**
  - **Explosions:** small, medium, large and boss chains, with more frames.
  - **Small effects:** debris, sparks, clinks, cancel sparkles, the pickup ring, the muzzle flash.
  - **`content/fx` presets** retuned (speeds, radii, gravity already ×1.5; frame timing re-checked).
  - **Particle pool:** capacity (256) reviewed against the bench.
- **Acceptance:** the fx gallery (`?scene=fx-gallery`) shows every preset; allocation guards green.
- **As built** (2026-10-20; wave 8 `w08-L8`; step review `R4-04.RV` APPROVE, a true zero — no findings of any
  severity; D3 and D4 land as measured verdicts, not commits):
  - **Explosions** (`D1` `693e6ac`): native v2 sheets — small 24×24 × 12, medium 48×48 × 12–14, large 72×72 ×
    16 — opening on the bible's white flash cross at frame 0; the three explosion presets and `boss.chain`
    gain `"blend": "normal"` in `content/fx/particles.fx.json`
    (the bible's rule for the detailed bursts). The content-DB fingerprint moves its one `fx` row (the JSON
    changed — re-pinned `529cc6d6dc216563 → 110c6250dedf116b`); presentation and shell fingerprints unmoved;
    no goldens.
  - **Small effects** (`D2` `6805952`): native spark 7×7 × 4, sparkle 7×7 × 4, debris 9×9 × 4, ring 13×13 × 6
    — each frame keeping v1's four-colour budget, the ring's growth shown through the `fx_ring` shader as in
    v1. The upscaled-pool floor moved with the drop, as `R4-03`'s As built tells.
  - **The presets needed no retune** (D3, **no commit**): the frame timings read well at the ported scale —
    the R2-04.P2 measurement stands and the scope's "already ×1.5" held literally; nothing in `content/fx`
    moved beyond `D1`'s blend flip.
  - **The pool review** (D3's verdict, **no commit**): the four-way bot's peaks over every zone and the boss
    rush came in at ≤ 100 of 256 — under the 80 % line — so **the pool of 256 holds**, recorded against
    decision R5-D5; the counting fixture that measured it was deleted before the commit (verified: no R4-04
    commit touches a capacity file).
  - **The fx gallery** (D4, **no commit**): it already lists every preset — one station each, including the
    new explosion and chain frames, the allocation guards green, the shell fingerprint walk fake proving it;
    the acceptance held as of today.
- **Manual (owner) still pending:** the FX feel on `?scene=fx-gallery` at 640×360 (M7 or desktop) — the flash
  cross, the strip pacing, the spark and sparkle arm thickness at 7×7, the debris look, the ring's brightness
  during the additive bursts.

### R4-05 — Title, front end, endings, store and doc images

- **Scope:**
  - **Title and front end:** the title screen and logo from the AI key art (`art-prompts/output/*/10-logo-title`);
    attract-mode cards, the WARNING sequence, zone cards.
  - **Ending scenes:** sprite scenes and epilogues redrawn (`ui/ending-*`, today 128×72 → full-frame scenes).
  - **Store and docs:** store listing assets and icons (`pnpm store:assets`), README banner, docs images and
    screenshots.
  - **Optional trailer:** a cut from the Wan 2.2 clips plus real gameplay capture.
- **Acceptance:** `pnpm store:assets --check` and `pnpm docs:images --check` are green with the new art.
- **As built** (2026-10-20/21; wave 8 `w08-L2`, closeout `w09-L2` / `E6`; step review `R4-05.RV` APPROVE,
  zero critical and zero should-fix, two doc-prose nits — one code lane, one docs lane; owner rows pending):
  - **The logo** (`E1` `ffa083a`): native 330×54 — 53 text cells × 7 rows at advance 6 plus a 6-px margin,
    inside the bible's ~320×64 and the step's ≤ 400×80 — three flat bands (lemon `#f8f070`, orange
    `#f8a030`, red `#e04828`, the census colours the boot and scenes specs look for), a 2-px navy ring, a
    hard +4/+4 shadow, exactly v1's five colours: drawn from the bible row and v1's logo, **no key-art
    winner** (RR-4), shipped as the v2 sibling beside the v1 map byte-for-byte (the scale-1 pin green). The
    title's own layout needed no move and no fingerprint did.
  - **The title backdrop** (`E2` `73dcb6d`): full-frame v2 night from the `R4-P.P1` stub's `title.mjs` —
    navy gradient, hashed stars (`hash2` on the sprite's own seed, dim and bright pairs), the planet limb
    radius `FRAME_W × 3/4` sunk 90 px below the foot, its rim lit; inside the bible's §4.1 colour budget
    (66 colours). Deviation, forced by the packer's page-limit cases (sources build at 512²): the two ships
    draw as **native half-frames** placed at `(0,0)` and `(FRAME_CX,0)` — the common page grows 1024² →
    2048×1024 with it, 448 → 449 sprites. `ui/title-backdrop` is a v2-only name (RR-1a). Declined with
    reasons in the lane report: the title rows under panels (the C6 ruling "IT STAYS"), and the nested
    double rim (the single stands). The presentation fingerprint re-pinned on its hashes plus the content-DB
    row for the interned new name; the shell's did not move.
  - **The WARNING band and the zone cards** (`E3` `e7d379d`): band height 72 = `FRAME_H / 5`, top row 132
    (`FRAME_CY − uiPx(8) − 36`), text row 162, black ground rect alpha 144 across rows 132…204, the hazard
    fields 0…72 and 568…640 (`WARNING_FIELD_W`), alert `0xf85858` on the 45° deep-red cells (`0x881818`,
    stripe pitch 18 = h/4) — all derived from the frame constants; the zone-name and zone-clear cards share
    one `drawZoneCard` panel at `(0, 72, FRAME_W, 48)` under the C6 kit rim. 11 of 12 presentation walks
    re-pinned, the twelfth unmoved.
  - **The five endings full-frame** (`E4` `9873156`): the ending generator's v2 native path (RR-1) — citadel
    192×108, ark 168×54, blast 36²×4, bubble 9², sun 96×48, surface 96×12 (bible sizes at ⌈1.5 ×⌉), one new
    colour (`#141820`, the foundation shade); the ENDING and STORY layouts recompose centre-anchored at the
    frame constants (`ENDING_SCENE_BOTTOM` 180 stays, proven = ground + `uiPx(16)`; citadel `FRAME_CX −
    uiPx(80)`, sun `+ uiPx(96)`, ark `+ uiPx(50)`, fortress `+ uiPx(90)`, flagship `+ uiPx(140)`); the ark
    sinks 0.75 px/tick and the bubbles rise 2.5 px/step so both still finish on scene; the 360-tick timers
    and their allow-list entries are ticks and untouched; 8 walks re-pinned, no goldens.
  - **One panel rule** (`C7` `bb153bc`): the epilogue and story-crawl panels hug the scene panel line at
    `ENDING_TEXT_MARGIN` (`uiPx(4)` = 6) and span `TEXT_PANEL_INSET`; `ENDING_TEXT_PANEL` lost its hand-set
    height; the crawl starts at `STORY_SCENE_BOTTOM + uiPx(4)` (y 210 → 192); the five goal-screens
    (`map`, name entry, rebind, input test, credits) were metric already after `C6`; the campaign's 47/67
    line caps verified as derivations, unedited; the test mirror `scene-layout.ts` moved with the layouts
    (disclosed). The in-wave cure `b35cba4` followed the landing: the flight scene's mirror samples moved to
    the `E3` band's rows, and the epilogue-panel docblock now tells the `C7` truth.
  - **Store icons** (`E5` `d23fec0`; **closes RR-3** — the icons moved to the v2 art once, as the decision
    says): `store-assets.mjs` collects the default art — the final ships (`A1a` / `A1b`), the v2 font
    (`C2`), the logo (`E1`) — the backdrop's stars step with the sheet height, the ship block sizes itself
    from the drawn heights and rides the bottom edge (the 330×54 v2 logo left no room at 80×80 — the manta
    drew off-canvas until this), and the caption rows and margins derive (64×24 → 96×36 at `WORLD_SCALE`);
    all four icons re-drawn, `pnpm store:assets --check` exit 0, neither store test file needed an edit, both
    TV bundles green in budget (1,429.2 / 1,428.1 KB). No later step regenerates the icons before
    `R6-03.D3`.
  - **Docs images** (`E6` `45739d8` — the last R4 push): the final-art pass — the logo plate redrawn with it
    (the banner 1920×432; `doc-images.mjs` derives the row from the loaded height, the `E1` logo being
    thirteen rows taller than the 248×41 interim sheet — 54 over 41 — which reproduces the old y), all 18
    screens re-shot on the
    shipped v2 look; `docs:images` 145 images, 1 written, then `--check` green; the enemy, boss and shot
    plates rode `75dc7c0` (the W08.E2E pass) and the shot plates `4a9602f`. No fingerprints, no goldens.
  - **The trailer** was optional and was **not made**: no wave-8 or wave-9 commit packages clips; it stays
    the owner's cut if ever wanted (R6-03's store work).
- **Manual (owner) still pending:** the title's star density and limb height; the endings' towers, merlons,
  spine and rays taste at full frame; the logo, banner and all 18 screen plates in `docs/images/` for
  legibility (the `E6` eyeball row); the decision whether a GRAPHICS-page plate joins the next
  `docs:screens` set (the review's owner row); the owner's key-art pick, if any, stays outside the shipped
  atlas (RR-4).

---

## 11. R5 — Zone remasters: new art and expanded levels

**Every zone step has the same shape:**

- **New art for the zone:**
  - a 12-px tileset with variants and edge pieces, collision masks per R3-03;
  - 4–6 painted parallax layers;
  - a decor layer;
  - palette cycles and raster effects re-authored for 360 rows;
  - every enemy of the zone redrawn (heading frames, `@flash`);
  - the boss rebuilt bigger, with more parts and animation.
- **An expanded level:** from ~13,500–14,700 px after the port to **~20,000–22,000 px** (~4.5–5.5 min at
  ×1.5 speeds; feat §14 allows 3–6):
  - **at least two new sections** and **one new set piece** that uses the taller playfield;
  - **at least two new enemy types**, with original names, behaviours made from existing scripts and tunables
    where possible;
  - a **mid-boss** where the zone lacks one;
  - in-stage branches where they fit the theme;
  - checkpoints re-placed.
- **Authoring:** in Tiled through the importer (12-px tiles, decor and backdrop layers), or hand-written JSON as
  in v1.
- **The v1 rules, at their v2 values:**
  - the 4-way rules (§2.7);
  - ≥ 12 capsule sources before the boss and ≥ 3 within 1,350 px after every checkpoint;
  - the recovery rule;
  - the playtest bot clears the zone in god mode within its budgets.
- **Budgets:** the zone's pages within R3-04's budget; the bench's zone stand-in scenario replaced by the real
  zone.
- **Re-recorded:** the zone's golden replays and its attract demo.
- **Manual (owner):** generate and pick the AI art; hand-clean sprites; play the zone on the M7 and sign off on
  readability and feel.

| Step | Zone | Theme kept from v1 (rebuilt and expanded) | Expansion focus |
|---|---|---|---|
| **R5-01** | A — AZURE VERGE | the tutorial-paced opening, HALCYON BULWARK | a longer capsule-rich opening, one new formation section, a mid-boss |
| **R5-02** | B — BRINE NEBULA | bubbles, SPUME HERALD, GALVANIC MAW | a tall vertical bubble shaft using the new height |
| **R5-03** | C — DUNE EXPANSE | sand worms, skimmers, SANDGRAVE WIDOW | a second worm field and a dune-surfing high-speed section |
| **R5-04** | D — MAGMA DEEP | the dive, the brick maze, CINDER BASTION | a longer, branching maze with destructible shortcuts |
| **R5-05** | E — TEMPEST RIDGE | rear attackers, weather, SQUALL STEED | a storm section with layered weather parallax |
| **R5-06** | F — CELL VAULT | chasing cells, tissue walls, MANTLE REGENT | a regenerating-wall chase sequence |
| **R5-07** | G — PRISM LABYRINTH | crystal walls, cube rush, FACET MONARCH | a refraction set piece with moving crystal blocks |
| **R5-08** | H — IRON CITADEL | the piston hall, the parade, IRON SOVEREIGN | a fortress gate section with moving floors |
| **R5-09** | I — ABYSSAL THRONE | depth mines, the ABYSS ARK raid, THE HOLLOW KING | a longer descent and the ark approach |
| **R5-10** | The rest | bonus stages (`brine-grotto`, `glimmer-cache`, `bonus-vault`), boss rush, the loop remixes, the caravan, the escape sequence, the high-speed dimension (Mode-7), the test and dev ranges | ported art and layouts; the escape and the dimension get the new layers |

**Engine capacity check (inside R5-01, revisited per zone):** a bigger screen and longer levels may want more
than 64 enemy slots (`enemies/index.ts:259`) or 256 particles (`particles/index.ts:83`). Raise a pool only with
the allocation guards and the bench showing it fits.

Each step below means **the zone template above + its row in this table**. **Depends on:** R3-01 … R3-06 and
R4-01 … R4-03 for every zone step, and the previous zone step (one zone at a time keeps golden churn local).
**§18 relaxes the last part** (decision R5-D1): with content-order-independent hash keys and per-zone re-blesses, the
zones build in parallel on local branches and land one at a time; zone A lands first, and zone H's echoes wait for A,
B, D and F.

**R5 prep as built — wave 6** (RUN-7 folds `R5-P.P1` / `P8` into R2-03, decision R5-D9; `P2a` / `P2b` / `P6` /
`P5c` / `P9` are test-only splits that rode the same wave; all reviews at zero):

- **P1 — the state hash ignores content order** (`6ba1187`, reviewers RTP1 + RV-D both APPROVE at zero):
  `loadContent` computes four FNV-1a key columns on `ContentDb` — `spriteKeys`, `enemyKeys`, `pathKeys`,
  `patternKeys` (data/index.ts:2184–2195) — and `hashWorld` mixes those instead of every content-order
  ordinal: pattern-runner `entry` (hashing `pc − entry` instead), enemy and boss `specIndex`, `pathId`, the
  Path mover's `m0`, formations' enemy/path slots, and every registered pool's `sprite` field (matched by
  the new `RegisteredPool.fieldNames`, world/index.ts:493). A zone's content change now moves only that
  zone's goldens. Disclosed deviations, all reviewed sound: the FNV constants are copied locally into
  `data/index.ts` (importing `debug` from `data` would cycle `data → debug → bosses → data`; a test pins the
  copies equal), `EMPTY_CONTENT_DB.patternKeys` has length 1 (the empty bank's lone `End` offset), unmapped
  indices fall back to the raw value (shadow `referenceHash` byte-identical), and the new allocation guard
  `debug-hash-keys-alloc.test.ts` proves the key paths stay under 128 B/call. The presentation and shell
  fingerprints did not move; the content-DB fingerprint re-pinned its four new key rows per table.
- **P8 — boss-part capacity 16 → 24** (`273e081`, decision R5-D5): `MAX_BOSS_PARTS` 24 (data/index.ts:985)
  carries `BOSS_PART_SLOTS` 96, `MAX_HIT_TARGETS` 160 and the hashed part-cooldown stride with it;
  `MAX_ENEMIES` 64 and `PARTICLE_CAPACITY` 256 stand until a design peaks above 80 % — the stress bench
  re-measured 0.101 ms/tick median, inside every gate.
- **P2a / P2b — the content tests split per zone** (`46f0c14`, `05a2a9d`, `e46cfdc`): `content.test.ts`'s
  zone A–I cases became `test/integration/content-zone-a.test.ts` … `content-zone-i.test.ts` with shared
  fixtures in `zones/helpers.ts`, the DSL speed scan reads every shipped `patterns/*.patterns.json`, and
  `content:check` covers the new files (name census 99 = 99, diff empty). The per-zone files are the R5
  zone lanes' own.
- **P6 — the zone contracts** (`b6c00f4`): `zones/zone-<letter>.contract.ts` carries each zone's `v1`
  bounds verbatim, its `v2` branch as decision R5-D2, and a per-zone `remastered` flip flag — wave 9+
  flips a zone's flag as its port lands and the nine test files plus `release-audit.test.ts` move to the
  ported bounds with that one token. As-built extras, reviewed: the v2 `directItems` upper bound is
  unbounded (R5-D2 states only ≥ 30; each zone's R5 lane caps its own), and zone A's `checkpointsMin` 5
  records R5-D2 but stays advisory until `R5-P.D-A` rewrites its layout; the bot-run 4.0–6.0 min bound
  rides in every contract (`ZoneBounds.botRunSec`) for the wave-09 whole-run gates to consume.
- **P5c / P9 — generator tests and the allow-list** (`27283f5`, `381f8f1`): the eight pair-of-zones
  procedural test files became sixteen per-zone files (86 names identical before and after), and the four
  allow-listed alpha-`200` literals hoisted into `SOFT_ALPHA` (common.mjs:92), dropping the repo
  frame-literal allow-list from 33 entries to **30** — four generator rows became one (live count at the
  tip governs any brief arithmetic; atlas bytes unchanged).
- **Carried to R5 (the wave's honest debts, reviewed in `R2-03.RV`):** the seven golden coverage-drift
  rows the re-bless exposed (Arcade clears of A and F, a no-god C clear, the cube-rush death in G, the
  zone-F checkpoint/rollback instance, the cave death in D, the cache 1UP) await the zones' own re-records —
  each is named in a `golden.test.ts` comment; `l.family` stays a raw file-order ordinal (ruled: not now —
  weapon families change only in the R5 art waves; add a fifth `familyKeys` column when `content/weapons`
  grows, and give `mixWeapons` the one-line comment meanwhile); `hashWorld` of a dense live world still
  boxes its fractional fields (~300 B/call, pre-existing, no budget depends on it) — a candidate R5-P perf
  task; the trigger-probe aliveness check could pin `triggersFired`'s bit-count rather than `> 0`; and
  `BendingLaserTable.spriteId` stays unmixed in the hash (reviewed benign) unless laser identity ever needs
  coverage.

**R5 prep as built — wave 9** (the per-zone test layout, the scoped bless, the fingerprint write mode, the
LAND helper; the `RT-P3` / `RT-P4` / `RT-LAND` findings cured in-wave, the test-only splits landing with
their census and gates-absence checks green):

- **P4 — patterns one file per zone** (`a216f14`): `content/patterns/zones.patterns.json` is deleted into
  `zone-{b,c,e,f,g,i}.patterns.json`, the merged bank byte-identical (path-order sort; md5-proved, Prettier
  a no-op on the JSON), `shippedPatterns()` in `packages/core/test/helpers/shipped.ts` reads the six plus
  the common library for the 20 behaviours' call sites, and the `debug-hash-keys` tests name the zone-b
  file directly; the review's reword cure `f4b9d36` retired a docblock that still named the dead file.
- **P5a1 / P5a2 — behaviours one file per zone** (`09cf628`, `50b9bb5`): the two large behaviour suites
  became per-zone files — zones B/C/D/E then F/G/H/I — through `test/behaviors/helpers/zone-behaviors.ts`
  (the `zoneKit` / edge / roster factories) and the shared `shipped.ts`; the world-only helpers moved with
  their zone. Test count unchanged (307 titles, 859 tests — every case survived the move by census).
- **P3 — `golden:update --only`** (`c284b78`; cure `0b166c4`): `scripts/golden-update.mjs` exports
  `parseOnly` — it throws on a valueless or empty `--only` and comma-splits and trims ids — and the entry-
  gated main passes `SHMUP_GOLDEN_UPDATE` + `SHMUP_GOLDEN_ONLY` into the Vitest child; `golden.ts` gained
  `goldenStageSelected`, the zone-A monolith split into nine `test/golden/golden-zone-<letter>.test.ts`
  files, the demos suite gates its writes the same way, and the four pair recovery files became eight
  per-zone ones (the `i.outcome.ticks < …` and `h < …` assertions updated to their blessed recordings'
  real numbers, disclosed). In update mode an id outside the scenario lists fails loud (the cure); proofs:
  `--only zone-b` re-records byte-for-byte, and a tampered zone-c golden makes `--only zone-b` exit 1.
  This is decision R5-D1's scoped bless.
- **P5e — zone runtime and Direct tests per zone** (`ea2e58b`): nine pair files became eight
  `zone-<letter>-runtime.test.ts` and six `zone-<letter>-direct.test.ts` (edge cases joined, zero describe
  renames); the shared assertions moved verbatim into `zones/helpers.ts` (`steps` / `stepUntil` /
  `expectInOpenSpace` / `expectCameraAt` / `crash` — the DB-fed fixtures stay per-file to dodge the
  `stageOf` collision); concrete cases 62 → 65 under the census's +10 allowance (the sanctioned copies
  from the pair splits), and the gates-absence check passed — no skip leaked in.
- **P10 — the fingerprint write mode** (`95bc61d`): `packages/core/test/helpers/pin-writer.ts` —
  `rewritePinned(file, name, table)` parses the test file with the TypeScript compiler (as the frame-
  literal scan does), replaces the named `PINNED` entry in the tests' own Prettier-clean form, writes only
  on change, and refuses under `CI`; the presentation and content-DB suites take an `UPDATE` branch that
  rewrites the entry and skips only the equality assert (everything else still runs), the shell's walk
  gained the same branch before `PRINT`; the content-DB print moved after the load-issues check
  (disclosed hardening). Zero hash literals changed on landing; the tamper proof restored all three pins
  byte-for-byte. This is decision R5-D4's "re-pinned only by a LAND".
- **The LAND helper** (`0a3c6ad`; cures `dd8daeb` — the readability gate on the message file, the
  whitespace trim of `--only` to match `parseOnly`, the trap armed before the dry worktree):
  `docs/v2-run/helpers/land-zone.sh` is the one zone-landing flow decision R5-D1's assembly names —
  fetch, squash, rebase, `pnpm install && pnpm assets`, the atlas-groups derivation, `golden:update
  --only <zone>`, the three fingerprint update runs, `docs:images`, the full targeted gate set plus the
  release audit and the three fingerprints as-pinned, the replay-scope proof, then one commit with exactly
  the derived paths staged and the pushed sha reported — under `flock` on `/tmp/shmup-cup-land.lock`
  (`LAND_LOCK` / `LAND_LOCK_WAIT` override; it refuses under `CI` and wants `RUN_DIR`), logging to
  `$RUN_DIR/land-<zone>-<date>.log`, with `--dry-run` running steps 1–8 in a throwaway detached worktree.
  The hostile dry-runs proved the trap: a zone-a tamper makes the scoped `--only zone-b` bless desync and
  exit 1, and the step-8 abort restored the tree byte-clean (`porcelain -uall` — the plain form misses
  nested untracked, a cure). The `conventions.md` LAND paragraph is the wave's DOCS-E lane.

**R5 prep as built — wave 10** (the second prep tranche and the four zone `S2` kits that rode it; the
reviews at zero, the two P12 cures and the bless-guard cure in-wave):

- **P7 — every zone's v2 palette-cycle ramps frozen** (`3b11fbb`, reviewed APPROVE at zero on the shipped
  code): the eight stage JSONs (zones C … I plus `glimmer-cache`) carry the designs' `cycles` lists and six
  generators gained the `<X>_RAMP_V2` branch — the v1 arms byte-identical, the scale-1 digest pin unmoved,
  goldens zero (a ramp is presentation, never simulation: `hashWorld` reads no cycle colour, proven from
  source). Zone A ships no ramp (its design says so), zone B's stands verbatim. The bible's law forced one
  nudge: the abyss murk `#07131c` sits 1 Chebyshev from the new ABYSS first stop, inside the scan's
  margin 3, so `offRamp` moved it to `#05131c`. The exemption list re-measured both directions — nine rows
  genuinely clear dropped, no kept row rotted, `storm-flash` deferred until its S2 art lands; presentation
  PINNED moved 18 world cells through P10's write mode, content-DB one row, shell unmoved.
- **P5d — the zone e2e specs one per zone** (`9592777`, reviewed APPROVE, zero findings): the four pair
  specs became `zone-b.spec.ts` … `zone-i.spec.ts` plus a shared `zone-helpers.ts` (helpers verbatim, the
  four interfaces' union disclosed in its docblock); the three TV pair cases dropped exactly the
  block-enumerated first-boss `clear()` / `stepTo` / colour-check lines; the title census 307 → 310; the
  batch 19/19 green; `zone-a.spec.ts` untouched.
- **P12 — the bot clears the designed set pieces** (`5b82697`; cure `7df08dc`; guard `da1d8c9`): shaft
  tracking, fast-terrain look-ahead, branch steering, brick punching, slab riding — each behind a
  condition today's content never meets. RT-P12 measured two that did fire today (zone A's 2.25 tail key
  opened the 2.1-px/tick look-ahead; the punch's reachable-gap rule engaged the standing zone-D and zone-F
  walls — four live-bot goldens re-recorded differently) and the cure re-gated: the look-ahead gate is
  `1.6 × WORLD_SCALE` = **2.4** px/tick with the gain `120 × WORLD_SCALE` (design C's 2.55 ask still buys
  its 27 px ≈ 10.6 ticks; every shipped key ≤ 2.25 stays dead), and the punch requires closure of the
  whole camera window on the **pristine** content grid with destructible `hp > 0` cells — no shipped stage
  meets it, swept stage × lane × 480 px. The cure clone re-records all 71 goldens + 10 demos
  **byte-identically**. RT-P12b caught the new permanent guard excluding three live-bot scenarios behind
  a false sentence (`fireButtonBot` is the bot with a fire pattern on top) — so
  `test/playtest/bot-replay-identity.test.ts` now re-records **52** live-bot scenarios and byte-compares
  (~50 s at K=1, pinned honestly): a bot decision that moves a recording is a red test on the spot, never
  a bless surprise.
- **P13 — the zone-tileset pins became prefix + coverage** (`0e4a952`): the two `content.test.ts` pins now
  demand a zone tileset's tile names as an *ordered prefix* of `terrain-a`'s with one frame per tile — the
  law the remasters' variant tiles need (`tiles/terrain-dune-v2` is its first admittee); a reordered or
  truncated lead still fails.
- **P14 — the debug boss skip enters at the WARNING** (`6345f07`, reviewed APPROVE): `skipToBoss` takes the
  stage's **last** `warning`, the first `boss` only when it has none, `BOSS_SKIP_LEAD` 144 held. Exactly
  one recording re-recorded with the rule (`zone-h-boss`: 9,066 → 2,433 ticks — the shorter run no longer
  crosses the extend threshold), 11 presentation PINNED rows moved with the walk (`runA.bossH` gained
  `w.toWarning()`), content-DB and shell unmoved.
- **The stand-in kits (decision R5-D6) — the wave's `S2` legs**: zone A's azure set with
  `tiles/terrain-azure` (`8810f32`); zone C's with the first **v2 tileset sprite** `tiles/terrain-dune-v2`
  (`900d24e`; its unpainted `bg/dune-blaze` rides the palette-cycle scan's EXEMPT until its cycle row
  binds, `13d85f3`); zone D's (`75fa6d2`); zone B's (`53832f8`) — every one landed with goldens untouched,
  fingerprints green unedited, the scale-1 digest pin unmoved, stand-in caps unraised. Zones E … I ride
  their branches for the wave's fold: zone E's kit measured the **budget trap as designed** — green alone,
  green on master, red on the shared stand-in residency row only at the B+D+E union — and stood down
  without pushing; the cap stays.
- **The bless route grew to composite lists** (the S7.0 cure, `a089adb`): P3's guard made the demos suite
  throw at load for any `--only` id that is not a demo stage, which made the wave's prescribed
  `--only <zone>,bonus-range` bless unsatisfiable on master's own tooling (no pre-LAND lane had executed
  one). The guard now enforces its stated intent: a list naming **no** demo stage at all fails loud, one
  naming the zone's demo flows — the composite bless shape holds for every later zone.
- **The first LAND — the weld discipline proven** (the flow `R5-01.S7` ran; its record is R5-01's As
  built): `land-zone.sh` is the named flow, the proven shape is the 34-step weld — fetch, squash the
  branch legs, install and assets, the groups re-derive **under the stale-state digest proof** (the scale-1
  digest measured equal to the current pin *before* the re-derive — the two-state check), the composite
  bless, the goldens green unedited, the three fingerprints re-pinned and green as-pinned, `docs:images`,
  the **digest re-pin measured at the derived tree** (successor hash, page shapes, name-set / moved
  counts), the stand-in / CJK / scripts-assets re-measure, then the full battery — content:check,
  stage-runtime, the three type-checks, lint, format, art-origins, core full, shell full, the **integration
  sweep at K≤6**, e2e batch1 with the Chromium determinism leg and the **Firefox leg** — the scope proof
  (every moved replay's stage id inside the `--only` list), one commit with exactly the derived paths, and
  the push under the lock. **The land lock is held across the whole script, not around the push alone**
  (RT-P1314's third minor, now law), and the full chain runs ~10 min on this host, not the 60–120 estimated.

**R5 zone LANDs as built — wave 11** (six remasters landed, one zone per commit, under R5-D1's flow — B, E,
C, D, F, G; seven cure commits went to master ahead of them or between; zone H rides its branch's first half
for wave 12 and zone I stands down before the owner — both disclosed at the block's end):

- **The cures, first** (every one a routed review finding, cured not gated; the set-piece premise class —
  a pin that measured v1's content — admits its falsifying remaster **by shape**, at most one stage, both
  worlds proven, the law failing loud for every other stage): **MF5 `a0abbf0a`** — the corridor law counts
  a full-mask destructible cell as OPEN (zone F's tissue-seal R1 STOP: the law guards unpassable geometry
  and a drilled wall is not one; the walk became one shared predicate and an anti-rot pair proves a solid
  rock wall still fails); **MF6 `ca7c7b0a`** — the shaft premise admits zone B's deep pan (RT-BRV J1, the
  wave's only review MAJOR; the `deepestPan` rollup takes its two-arm conditional); **MF7 `38b8c8a1`** —
  the recovery rule counts a branch-gated capsule row only when it is reachable after the restart (RT-DRV
  MH7(b): zone D's 12,900 checkpoint counted 5 rows and had 3 real); **MF8** on two commits — `1030012f`
  folds the thunderhead's terminal bolt 2.4 → **2.25** (the true offender behind zone E's 4-way red was the
  pattern's terminal needle, not the gale-kite's movement; the seed-slow alternative was rejected for
  erasing the golden's scripted death) and re-blesses zone E's two goldens on master — the wave's first
  intentional-sim bless, later superseded by the LAND's own route; `e6f4760b` admits zone D's branch-steer
  choice and gives the deepest-pinned premise its middle arm (246 = the dive's 432 − 186); **MF10
  `66e54bcb`** — the memory estimator's images charge re-anchors from the fossil default `all` to
  **`resident`**, what the shipped lazy residency really uploads (zone B's and zone E's welds both stopped
  on the double count — E's page crossing measured 24,379,392 B against the 24,117,248 cap, 262,144 B
  over, where `resident` reads 20,971,520; no budget moved, the cure is model-only); **MF11 `29137363`** —
  the slab-riding premise admits zone G's dy-96 crystal shutters (a premise pin, not a playability claim:
  the god run clears over them at 315.4 s, and every other stage keeps failing loud).
- **The six LANDs and the digest chain** — B `1d3fd600`, E `fe4cdae3`, C `247e39fb`, D `927b137f`, F
  `5319d732`, G `66122e87` (each step's As built carries its record) — moved the scale-1 v1 atlas digest
  once per land, every pin measured at the derived tree: `5c35219b…` (zone A's) → `2e14bd20…` (B, moved
  324) → `cbecdd2b…` (E, 342) → `767900f6…` (C, 855) → `fe99d8a7…` (D, 765) → `20a7b109…` (F, 347) →
  `7e6fc0e9…` (G, 410) — every name set equal, added 0, removed 0: pure relocation by the groups
  re-derive, the RR-1 hold intact. Zone E's own page crossed to the 1024×512 rung first, zone D's second;
  zone G's grew within its rung; zone F's and zone B's added no page.
- **The weld discipline as run** — the wave-10 34-step chain grew as welds proved their derived trees (39
  steps at B's third attempt, E's second and G's restart; 41 at F's), the land lock held across the whole
  script (~9–13 min on this host), and every stop was a gate firing by design, adjudicated on the record:
  B's step-33 shared-kit fold stop (hash-key fixture lists and the grotto units-pairs trio falsified by
  the content — Ruling A: the fold rides the LAND atomic, R2-03.FIXG's precedent, the pair law re-verified
  15546 + 664 + 24 = 16234 = gap.x), B's step-34 fossil-charge stop (→ MF10, option C of the model
  review), E's predicted wall before the lock (never taken; after MF10: 39/39), G's duty-5 O1 window rule
  on the first bless (→ the recording law). Every land rode wave 10's three S7 rulings unchanged
  (`a089adb` / `62ac4e5` / `f5ea466`), and the residency premise held at every derived tree without a
  re-anchor.
- **The shared-file collision class** — `stage-terrain.test.ts`'s `-v2` routing grew one branch per
  landing zone (E's merge onto B's LAND was the wave's first real collision, then C, D, F and G), each
  resolution keeping master's if-chain shape and adding the symmetric branch, 6/6 green at the merged
  shape; `palette-cycle-scan`'s array-valued `CYCLE_ART.MAGMA` (D) merged beside C's scalar `DUNE_RAMP`
  binding; `procedural-zone-d-edge` and the zone-F edge loop met the same class with the same rule.
- **The recording law** (w11-G7's ruling, option (b); zone E's `golden-zone-e` has carried the shape since
  `fe4cdae3`): for a no-god outcome case the replay-hash identity is the assertion — the recorded status,
  deaths and seconds **report, never promise** — and the §12 timing band and the peaks assert on the god
  case. Zone G's re-blessed seed-91 recording ends gameOver at 156.0 s, deaths [4548, 7935, 9265], the
  first at camera x 5,458 outside the first §15 gallery window; the window list stays in the file as the
  owner's gallery-taste comment (wave 12), and the seed-1 bank at the same mouth (145.1 s, 5 deaths) is a
  volley-difficulty row with the owner. The ruling rejected re-tune and seed-change as answers: the truth
  of the run rides the record.
- **The wave's sweep numbers** (after each push, disk truth): the post-push full suites grew **10,650 →
  10,713** passed with 95 → 104 skipped and zero failures across the six lands; the integration sweep at
  K≤6 grew 2,608 → 2,646; every land's e2e ran 99 Chromium + 73 Firefox; `content:check` grew 102 → 107
  by F's land; the Tizen bundle sat at 1,467.7 KB (396.6 KB gzipped of the 512 KB budget) at F's.
- **Zone H — first half only** (§17 R5-08: `in progress`): branch `r5/zone-h` at `e2078776` carries S4a …
  S5b — the gate-sentry pair (`turret.floor`, 1.95 px/tick aims, hp 8 / 400, and its ceiling twin) and the
  iron-banner drifter (amp 30, period 90, drop capsule) landed as pure appends, putting the stage inside
  rule 3's 6–8 new-types band (seven by sprite); the OBSIDIAN parade's echo work, IRON SOVEREIGN and S6 on
  ride wave 12; no patterns file (design §16 names no `pattern.loop`); the 4-pod captain option stays
  banked (`w11-H-report.md` §S5b).
- **Zone I — owner-deferred, not landed** (§17 R5-09 stays `not started`, honestly): branch `r5/zone-i` at
  `0d4057eb` (seven legs S2 … S6, clean, never pushed) ends its god-mode 4-way bot at **369.25 s** against
  the contract's [240, 360] ceiling — the design's own scroll (233 s), captain and 51.4 s finale will not
  fit under 360. Both trim attempts STOPped on measured evidence: I6 (the §2 trims and the pinned-WARNING
  move) un-committed at pre-verify because an earlier warning **re-phases the ARK fight's RNG**; I7's
  single-knob §8 sweep STOPped again — every knob shifts the fight-cascade RNG (±20 s-class lotteries) and
  the full §8 combination poisons the kill. The wave law generalized from the two stops: fight-adjacent
  cells are RNG lotteries in §2 as well as §8, band pressure never justifies trimming them blind, and the
  only deterministic run-time is the measured one. Gates otherwise stand green (recovery 7/7, runtime 9/9,
  `content:check` 110/110, the no-god identity case); the six zone-I goldens stay red-by-honesty,
  un-blessable under law. A four-option menu stands with the owner — widen the ceiling zone-I-only, widen
  it globally, an owner-side §8 re-balance accepted on fresh measurement, or land at 369.25 s with a
  disclosed exemption and matching outcome rows — and whichever option is taken, the goldens re-bless
  **last**, on settled numbers. The resume pointer rides the run's `RESUME.md`.

**The wave-12 record as built — zone H landed, R5-10 part 1** (zone H is the eighth remaster landed of
nine — one zone per commit, under R5-D1's flow, at `a2d94928`; `R5-10.T1`, `T3` and the report-only `T6`
complete the wave's landings; four kit cures went to master beside them; zone I still stands before the
owner and `T2`/`T8` ride the wall — all disclosed at the block's end):

- **The cures, on master and between the lands** (every one a routed review finding or a weld STOP
  referral, cured not gated): **MF12 `c86ad478`** — the interim pipeline's upscaled-pool floor follows
  the natives: `500 → 450` when `T3`'s six dimension stand-ins went native and the compared pool fell
  `517 → 499` (10 body + 8 `@flash` frames left it — RT-T3's one Major; the file's own `fc3f78e6`
  chain-comment precedent, and the chain now also names the silent `533 → 517` drain waves 5–7 ran
  before T3); **MF13 `5a0673a7`** — two golden-kit laws from T1's weld STOP: the bless-list guard
  `assertDemoOnlyListKnown` takes a demo-less composite list yet fails an unknown id loud (restoring
  `0b166c41`'s strict arm over `a089adb6`'s S7.0 relaxation, with pin cases for both arms), and
  `REAUTHORED_STAGES` carves the re-authored non-zone baseline stage `bonus-vault` out of the v1-port
  comparison — the wave-12 law for such a re-author: the drop disclosed, the name asserted
  still-shipping, the list two-way pinned, and the protected `test/golden/v2-port*.ts` glob never
  touched; **MF14 `59d14ed8`** — the render-groups census follows the dimension's new fore band: the
  `dimension` pin gains `LayerId.Foreground` (the render-pixi layers docblock already prescribed the
  foreground's plainness — the sibling law passes unchanged as a real three-layer measurement) beside a
  rot-proof content census pinning the exactly eight shipped stages that carry a fore band — T3's
  battery skipped `test/scripts/assets`, master rode red through four SHAs until T1's weld sweep caught
  it, and the lesson is law now: a step moving a layer kind owes the shared-kit censuses in its gate
  set; **MF15 `cd4bb68c`** — the four-way bot's slab-ride floor admit became per-stage: zone H's six
  gate slabs pin beside zone G's four shutters, the check admits at most two slab stages (a third must
  re-earn it), both worlds proven 31/31, and the fail-loud control reproduces the welder's B-1 red
  verbatim.
- **Zone H — the eighth remaster landed** (§17 `R5-08` → `done (owner parts pending)`; its step section
  carries the record): `a2d94928` lands the citadel rebuilt to `docs/v2-run/designs/zone-h.md` —
  20,250 px of six sections (the fortress gate with its six plate slabs and plug doors, the void
  parade hall, the ten-piston hall, the ceilingless core run, the breathing throne), 103 events, eight
  camera keys, six checkpoints, `terrain-citadel-v2` and the fifth banner parallax band; **IRON
  SOVEREIGN** at 18 parts with design §7's six-pod ring out-voted by the frozen release-audit law
  (R5-D10 class, the zone-D arms precedent — option A executed, pods at four, assembled height 168
  inside the 202 cap); the four parade echoes re-rigged from the LANDED boss trees under a
  machine-asserted match law (8/5/5/14 parts; `echo-maw` byte-identical, disclosed); the S6 capsule-
  window cure (FIX1 — four in-window banner rows became single spawn rows after the adjudication
  proved the literal option-1 engine-impossible: an event row's `drop: null` suppresses only the
  formation's completion drop, every member still drops on kill); the arcade golden rewritten to
  assert its RECORDED replay (FIX3, the F/G twin law — gameOver at 5,632 ticks with two deaths is the
  §11 design's honest outcome, the bot's Arcade survival an owner taste row). The god bot clears in
  **324.5 s**, inside §17's 240–360 s band.
- **The weld discipline as run** — both LAND welds STOPped on gate evidence and restarted, adjudicated
  on the record: T1's first two steps hit kit blockers (the port comparison of a re-authored non-zone
  stage → MF13; the inherited T3 census red → MF14) and landed on resume-3 with `land-zone.sh` rc 0 and
  the bot-replay-identity suite proving the bless-cured class; H's weld STOPped once on two reds
  outside every enumerated derivation class — both cured law-side, the content unmoved (MF15 on master
  before the re-pick, FIX3 on the branch) — and restart-2 ran the 39-step chain onto `cd4bb68c`,
  proving the delta identity three ways (the bot file's land delta byte-identical to a pure MF15
  carry-through) and blessing exactly five files digit-for-digit against the banked table with every
  other recording bit-unchanged. The wave's ONE disclosed fold is the interim v1-atlas digest re-pin
  `7e6fc0e9… → da5879b4…` at H's land — pure relocation by the derived grouping (808 scale-1 positions
  moved, name set equal, added 0, removed 0, the pre-regroup build reproducing the retired digest
  exactly), healed under the docblock protocol with no cap moved; T1's digest never moved at all. The
  fingerprints' id-shift re-pins rode the lands that caused them (T3 232/14/6 rows; T1 the minimal
  4/1/0 with the shell file untouched; H 117/13/3), every step's own walks green at its derived tree.
  The wave's two e2e passes went to S6's zone-H spec (3/3, first pass) and T3's mode7 batch (8/8); the
  welds' own batches (H: chromium 100 + firefox determinism 73; T1: 7 specs exercising the re-laid
  bonus stages) ran under the e2e lock after the lands, as the wave's rules allow.
- **R5-10 part 1 records** (each step's own As built carries the detail): **T1 `cea1b20d`** re-laid
  `brine-grotto` and `glimmer-cache` to 5,400 px and `bonus-vault` to 4,200 px on the single 1.5-speed
  camera key — forced by the live loop caps (5,400 px clears in 3,615 ticks against the 4,000-tick
  runtime pins; the vault's 2,815 under its 3,000) — with every bonus outcome law authored from the new
  layouts, never pasted (the seconds windows 59–67 s: the old 30.25 / 26.9 s recordings are
  arithmetically unpastable at double the length; the cache's `lives === 3` promise became
  `lifeDelta ∈ [0, 1]` — lane-catching is not a layout law); `bonus-range` was the check case, verified
  and untouched; three goldens blessed, the bonus-range pair byte-identical, zero atlas churn — no
  sprite name entered (the carriers' art fields stay v1, RR-1 serves them ×1.5), so no plate moved;
  this was the program's first `--only` list owning zero demo stages and its first re-authored non-zone
  v1-baseline stage. **T3 `90a20a3a`** took the high-speed dimension's six stand-ins native at v2 sizes
  and added five new names — the parallax's single band became three (the sky stays index 0, the
  runtime law), six decor backdrops and glows on the pylon and the maw; the Mode-7 geometry is
  untouched (the landed horizon/bottom spec rows hold unedited) and no sim field moved; plates exactly
  four. **T6** (report-only, `w12-T6-report.md`) proved the dev ranges keep working on the new art:
  `content:check` green at the tip (10 files / 110 tests), a programmatic census resolving all 118
  art-name fields across the 19 dev-range files with no retired or renamed name found — the
  add-never-retire law held across every landed wave — and all 62 committed recordings re-verifying
  with zero range golden moved.
- **Zone I before the owner; the carried set** (§17 `R5-09` stays `not started`, honestly, and `R5-10`
  is `in progress`): the wave-11 record of the wall stands, re-disclosed — branch `r5/zone-i` parked at
  `0d4057eb`, the god run measured **369.25 s** against the contract's [240, 360] ceiling, the I6/I7
  trim attempts double-STOPped on fight-cascade RNG re-roll evidence, and the four-option menu (widen
  the ceiling zone-I-only, widen it globally, an owner-side §8 re-balance accepted on fresh
  measurement, or land at 369.25 s with a disclosed exemption and matching outcome rows) stands with
  the owner; whichever option is taken, the six zone-I goldens re-bless **last**, on settled numbers.
  **2026-10-23, ruled:** the owner took option 2 — decision R5-D13 widens the ceiling globally to
  420 s (4-to-7 min), the `w13-G1` lane carries that law change onto master in one commit, and the
  I-LAND's re-bless stays last, on settled numbers, as written here.
  Carried to wave 13: `R5-10.T2` (the escape's new layers — it repaints stage files the zone-I branch
  rewrites, so it waits the I-LAND) and `R5-10.T8` (linked stages sharing their zones' pages — it waits
  T2 and I); part 2 (`T4`, `T5`, `T7`, `T9`) was wave 13's by schedule; and every `R5-0n.S3` real-art
  drop stays owner-gated behind the FLUX decision, fresh choices.json sets and reviewed stamps — none
  dropped this wave.
  **Discharged at wave 13's I-LAND (`2d35a7a5`, below):** `T2` and `T8` no longer wait on zone I —
  they stand OPEN in their own right, part 2 runs on the wave-13 schedule, and still no `S3` drop
  has landed.
- **Zone I — the ninth remaster and the last zone LAND** (§17 `R5-09` → `done (owner parts pending)`;
  its step section carries the record): `2d35a7a5` lands the abyss rebuilt to
  `docs/v2-run/designs/zone-i.md` — 20,400 px of a **dive**: the camera sinks under a shelf lip to the
  trench floor (rows 26–27, x 156 → 12,300), runs the ceiling passage, the mine drift, the undertow,
  and climbs the full 312 px past the buttresses into the ARK's light, six keys with three holds, six
  checkpoints, 77 events in six bands, `terrain-abyss-v2`, the 320-px parallax joins over the design's
  640 (the S2 template law, the D precedent), the frozen R5-P.P7 `cycles` byte-identical; three new
  types (crawler / stinger / deep-tender) at the contract band's eight ceiling; **TH-11 THE TRENCH
  HERMIT** as the zone's first captain, no WARNING and no time limit (P14's skip law kept — the skip
  opens on the ARK alone); the ARK grown to fourteen parts over the 720-px keel with deck pods
  (box → circle, the boxes-never-turn law) and the heart at 105 hp for the 90-s budget; the KING at
  eleven parts, maw 80, lure 24, the phase lists unmoved; **R5-D13 rode the land** — the global 420-s
  ceiling, the god run measured 369.3 s inside [240, 420] with the 240-s floor untouched; and the
  wave's new law earned on this stage: where the R5-09.FIX2 checkpoint re-seat (2,880 / 6,240 — the
  clear-spawn law collided with the lip and the dive floor; the law stood, the law-weakening option
  rejected priced) moved only respawn data, the re-blessed digits re-measured **identical across the
  weld's two trees, drift 0.0 s** — bless-identity proven twice, the law green on the cure's geometry.
  Four files re-blessed (`--only zone-i`), the fold digits ride `git show 2d35a7a5`. With this land
  all nine zones are remastered at the content level; none is art-final.
- **The wave's sweep numbers** (after each push, disk truth): the post-push full suite grew **10,713 →
  10,733** passed (892 files, zero failures) across the wave's three lands; `content:check` grew 107 →
  110 tests by H's contract flip; the MF14 class-cure battery itself ran the full suite zero-red at
  the four-SHA-older tree. Wave 13's zone-I LAND grew the post-push full suite to **10,755** passed
  (890 files, zero failures).

### R5-01 — Zone A remaster: AZURE VERGE

- **Scope:** the zone template for zone A; expansion focus per the table. Also the engine capacity check below.
- **As built** (2026-10-21/22; the local branch `r5/zone-a`'s seven legs `8ac7dd1` … `98a86fc` over the
  reviewed master, the `S2` kit pushed to master at `8810f32`; review loop `R5-01.RV` (one critical) →
  `R5-01.FIX1` `732bfe1` → the scoped re-review at zero; the weld `R5-01.S7` landed **`9d0b472`** — 68
  files, +1,966/−901, the branch's 21 sources plus the whole derived regeneration):
  - **HALCYON BULWARK rebuilt to the design's §8, twelve parts, core centred at x 0** (S4b — adjudicated
    after four measured STOPs): the weak point must clear **both** shadows — the plate row's and the
    hull's — and the feasible window is core x ∈ (−8, +6], so the design's −36 became 0 — v1's own column, the design-clean point of the window;
    the hull (`x 42`, hw 30) is never vulnerable, the six plates carry 10 hp each at 9-px steps, the core
    (60 hp, `afterParts`, `requires` all six plates, 6,000) opens the row; three phases track
    .525 / .675 / .825 with margins 84 / 74 / 74, exactly two standing lasers ≥ 24 px apart, the
    assembled height 159 ≤ 202. The full-rank fight resolves in **2,186 ticks**; the design §2's 45–70 s
    fight prose measured empirically impossible for the shipped bot's digestion, so the landed cadence
    owns the pacing (an owner taste row below). Geometry note, on the record (review MINOR-1): the
    window check used the core's half-width 6 against the plates while the landed box is half-width 12 — at
    x 0 the core's west face overlaps plate-1's east face by 0.5 px, harmless and empirically moot.
  - **The stage rebuilt to §2b/§3/§17** (S5a, S5b): 21,000 px × 28 rows of `terrain-azure` heightfields
    (decision R5-D3), seven checkpoints 0 / 2,700 / 6,300 / 9,600 / 12,000 / 15,600 / 18,300, seven
    camera keys with the 2.25 px/tick hold at 12,000 and under the gate at 18,300, the WARNING at 19,950
    past the 18,600 open-space floor, the boss at 10,350, both azure parallax bands 320 apart
    (adjudicated against design §9's 640, commit-disclosed), the eight decor rows as §9 lists them, no
    `cycles` (zone A ships no ramp, P7's finding). The three spire gorges opened to the **48-px corridor
    law** (S6b → S6b.2, adjudicated): design §3 carved them 36 px (three tile rows), the stage-runtime
    law demands a ≥ 48-px flyable corridor in every pixel column of every shipped stage, four rows won —
    openings rows 0–3 / 13–16 / 24–27, the vein tiles solid.
  - **The roster and the plan** (S4a, S5b): the tender frozen; five new types — skiff, gale, gnat,
    warden, matron — original, `drop: null`; the azure-marshal captain (three parts, the frozen
    `bosses/maw-pod` tube art); 77 events (25 formations + 49 spawns + warning + boss + end) reconciling
    to the design's §2b drop line exactly; the 34-entry `directItems` plan (red 9, green 9, blue 8,
    orange 3, yellow 3, octagon 2) under the contract's new composition row (MF2 `1f3040c` — decision
    R5-D2); the 11-entry remix capped at 18,450 so the calm window holds.
  - **The playtest and the capacity check** (S6): the 4-way bot clears in **293.4 s**, inside the
    contract's 240–360 s window, one captain kill (≤ 1), recovery three deaths, scores 66,030 / 68,060;
    **the capacity check holds** (R5-D5's line): peak live enemies 12 ≤ 51 (80 % of 64) and peak boss
    parts 12 ≤ 24 — the pools stand; `content:check` 100/100 at the branch tip; the v2-port suite drops
    the zone-A family and its two feeders through the contract's flip alone — the mechanism certified for
    waves 11/12: the flip **is** the interface, `v2-port-suite.ts` is never edited again.
  - **The alloc hunt** (`79243ce`): the ported stage geometry alone broke the bulwark's allocation guard —
    the parallax and decor syncs took the camera's raw fractional numbers per call and boxed them each
    frame; the cure passes the camera object.
  - **The LAND** (attempt 5 of the weld): the 34-step discipline of §11's wave-10 record, run end to end —
    the stale-state digest proof `fa419802…` exact before the re-derive; the groups **12+/2−** (the twelve
    azure names join zone A's block, `tiles/terrain-a` and `bosses/maw-pod` demote to `common`); the
    composite bless re-recording **29 files** (26 `zone-a-*` goldens + `bonus-range-god` +
    `bonus-range-digit` + `content/demos/zone-a`) with the blessed-numbers table in the commit body and
    every other recording verified byte-unchanged (`zone-h-boss` included, blessed at P14); the three
    fingerprints re-pinned through P10's write mode and green as-pinned; the scale-1 digest re-pin
    **measured at the derived tree**, `fa419802… → 5c35219b…` (name set equal, `moved=736`; the zone-a
    page 256×128 → 256×64); 13 `docs/images` plates written (no `echo-bulwark` — zone H's frozen boss);
    the stand-in and CJK caps re-measured unraised; the battery — core 385/385 files, shell 77/77, the
    integration sweep **2,605 passed / 88 skipped / zero failures** at K≤6, e2e batch1 + determinism
    **110/110** Chromium and **73/73** Firefox, the zone-A spec green, the post-push sweeps green at the
    pushed tip.
  - **The three walls, adjudicated pre-LAND and cured on master, not bypassed**: **S7.0 `a089adb`** (the
    demos bless guard relaxed to its intent — §11's bless-route row); **S7.1 `62ac4e5`** (the shell
    residency premise re-anchored after `terrain-a`'s demotion — the class re-fires at every
    tileset-renaming zone, the pattern stable); **S7.2 `f5ea466`** (the zones contract meta-suite pins the
    flag logic, not the flip roster — closed for every later flip). The review loop's own cure **FIX1
    `732bfe1`** taught the scale-1 pipeline and the interim terrain case to take RR-1a at its word: a
    v2-only name's frames are **absent** at scale 1, and the absence is the assertion.
- **Manual (owner) still pending:** zone A's **real art** — generate, pick, hand-clean (after the FLUX
  decision; the picker needs a fresh `choices.json`, myadmin1 holds only a snapshot) — dropping later as
  `R5-01.S3` (decisions R5-D6 / R5-D7: the stand-ins ship, the §17 row stays
  `done (owner parts pending)`); the M7 play of the remaster (`build:dev`) and the readability / feel
  sign-off; the bulwark fight's pacing to the owner's eye (the landed cadence vs design §2's prose); the
  confirmation of the defaults the step adjudicated — R5-D1, R5-D2 (with zone A's composition row), R5-D3,
  R5-D6, R5-D7; the 13 `docs/images` plates.

### R5-02 — Zone B remaster: BRINE NEBULA

- **Scope:** the zone template for zone B (and the `brine-grotto` bonus stage's art); expansion focus per the table.
- **As built** (2026-10-22; the branch `r5/zone-b`'s legs `S4a … S7` squashed at the weld, the review
  `RT-BRV` routing its one MAJOR (J1) to master as MF6; the `R5-02.S7` weld landed **`1d3fd600`** — 29
  files, +1,505/−455, the branch's sources plus the whole derived regeneration — the wave's first zone
  LAND):
  - **GALVANIC MAW rebuilt to the design's §8** (S4b): ten parts, the pods at 20 hp, the core at 80 hp and
    three new spine turrets, on the 50/24 thresholds. The mid-boss **SPUME HERALD** is refit to §7 with two
    new crown fins (hurtboxes 12/4).
  - **The stage rebuilt to §2/§4/§5/§9/§10** (S5a): 20,400 px, six checkpoints, rowsTall 62 on
    `terrain-reef-v2` with nine appended variants, seven parallax bands, the 16-entry decor block and the
    raster waves; the set piece the 6600 deep pan into the **286-px shaft corridor** — its ceiling starts at
    x 6600, not the design's 6300, opening a 300-px mouth to sky because §3's own pan premises assume the
    camera has begun its dive (B6 adjudication).
  - **The roster and the plan** (S4a, S5b): the §6 new types **brine-mine** and **spume-skipper**; the
    mine's `bulletSpeed` folded 2.4 → **2.25** so its 8-way ring stays inside the 3.0 gate at the rank-16
    MANTA scale (2.849 — the same family value as the maw's phase 3); the §6/§7 hurtboxes follow the S2
    stand-in frames (mine 8/8, skipper 8/5 — art law over design geometry; real S3 art may re-widen them);
    74 x-sorted events, 38 capsule sources, the 34-entry item plan, the 13-row remix, the contract flipped.
  - **It plays** (S6): the 4-way bot clears in **321.7 s**, inside the contract's 240–360 s band, the peaks
    inside the 4-way rules; `brine-grotto`'s recordings verified byte-unchanged at the composite bless.
  - **The LAND** (attempt 3 of the weld): the shared-kit fold rode the land atomic with the content
    (Ruling A, R2-03.FIXG's precedent — the hash-key fixture lists take `paths/zone-b.paths.json` and the
    grotto units-pairs trio retargets 33/34/35 → 58/60/59, the pair law re-verified 15546 + 664 + 24 =
    16234 = gap.x); the groups re-derived **12+/1−**; the composite bless `--only zone-b,brine-grotto`
    moved **3 recordings** (god 2983410106 → 1024611368, deaths 4104396975 → 2798382645, the demo
    3480536062 → 968179879; the re-bless reason: the remaster changes the stage, roster, captain and boss)
    with every other recording byte-verified; the three fingerprints re-pinned; the scale-1 digest
    `5c35219b… → 2e14bd20…` (moved 324, name set equal); plates 2 (`galvanic-maw`, `spume-herald` — no
    `echo-maw`: zone H's frozen boss); the battery green at the pushed tip (integration 2,608 zero-red at
    K≤6, e2e 99 + 73, core 385 files, `content:check` 102). The art is the R5-D6 stand-in kit until
    `R5-02.S3` drops the real art.
  - **The two walls it built**: its step-33 fold stop became the wave's Ruling A precedent and its
    step-34 fossil-charge stop produced **MF10 `66e54bcb`** (the estimator's `all` → `resident` re-anchor —
    the cure that unblocked this land and zone E's).
- **Manual (owner) still pending:** zone B's **real art** — generate, pick, hand-clean (decision R5-D6;
  the drop rides later as `R5-02.S3`); the M7 play of the remaster (`build:dev`) and the readability / feel
  sign-off; the 2 `docs/images` plates; the row stays `done (owner parts pending)` per decision R5-D7.

### R5-03 — Zone C remaster: DUNE EXPANSE

- **Scope:** the zone template for zone C; expansion focus per the table.
- **As built** (2026-10-22; the branch `r5/zone-c`'s legs `S4a … S7` squashed at the weld, review findings
  L1 (the census wording — a docs closeout ask, not a code question) and the C5 speed fold routed through
  master; the `R5-03.S7` weld landed **`247e39fb`** — 25 files, +1,225/−490 (14 sources, the weld's kit
  admit and 10 derived paths), the wave's third zone LAND):
  - **SANDGRAVE WIDOW rebuilt to the §8 table** (S4b): eleven parts, the egg-sac decor, both fangs as
    blocker guns and the three-phase heat ladder; the phase-3 `bulletSpeed` folded 2.55 → **2.40** — 2.40 ×
    the 1.2161 fully-powered rank scale is 2.918, inside the frozen 3.0 aimed-bullet law (2.55 reached
    3.101; C5, the release-audit cure, smallest nudge — the design §8 row owes the fold). The mid-boss
    **DUNE SCORPION** arrives on `captain.launcher`, three parts, event 10,350.
  - **The stage rebuilt to §2/§3/§4** (S5a): 21,000 px, WARNING 20,100, eight camera keys over the eight
    sections (S1 open dunes, S2 canyon, S3 worm field, S4 scorpion arena, S5 second worm field, S6
    dune-surf run, S7 sandstorm, S8 calm to WARNING), the set piece the **2.55 px/tick look-down pass** to
    y 84 over 2,100 px; seven checkpoints, rowsTall 35 on `terrain-dune-v2`, seven parallax bands, the one
    palette-cycle entry (layer mid, `DUNE_RAMP`) and three raster rows.
  - **The roster and the plan** (S4a, S5b): the §6 new types **spine-burrower** (`turret.floor`, 2.25
    px/tick aims) and **dune-lance** (`rear.swoop`, 2.7 swoop / 2.4 leaveSpeed); **dust-devil retired to
    zero placements** on the §11 ledger — the design §2 census names seven new sprites in events, §6 places
    six, the contract's [6, 8] floor taken exactly (the census row's wording is the docs closeout, RV L1);
    the timeline ships the §5 rhythm, 33 capsule sources, the two-tender calm at 19,500 and 19,850 with
    nothing else, the 33-entry item plan, the 12-row remix, the contract flipped.
  - **It plays** (S6): the 4-way bot clears in **296.5 s** (17,790 ticks, the §15 band), widow fight
    21.9 s, 0 deaths, score 74,770, 24 capsules, equips 2/1/0/0/4/0/0, peaks 12 live / 11 parts against
    51 / 24; the no-god run falls at 84.7 s with three deaths past the 3,900 checkpoint line; the design
    §8's 40–50 s fight band stands as the owner's taste row.
  - **The LAND**: the weld carried the kit admit as its seventh leg — the 2.55 dune-surf key through the
    shared look-ahead gate **by shape** (the first shipped key above v1rel(1.6) = 2.4; the J1 deepestPan
    shape, ≤1 fast stage, the key pinned to v1rel(1.7) exactly, both worlds proven — atomic with this
    content, the SW-B ruling); MF7's reach law re-ran green at the rebased tip (7 + 3 cases; the zone never
    touched `recovery.ts` itself) and the `zone-c-direct` handed:10 pin re-confirmed as the disclosed
    non-event; the rebase took the router collision leg (reef → dune → ridge order); the groups re-derived
    **10/2** (the retired dust-devil and the superseded v1 dune tiles leave the page; `bg/stars-far` is
    drawn by ten-plus stages and stays common), the page grows `main-3` 1024×512; the bless moved **3
    recordings** (god 2011324472 → 2076447240, bot 774973277 → 2884637366, the demo 2045317902 →
    538773143 — the remaster moves the simulation); the digest `cbecdd2b… → 767900f6…` (moved 855, name
    set equal); plates 2 (`dune-scorpion`, `sandgrave-widow`); integration 2,626/95 zero-red, whole-core
    K=1 5,236 green pre-check, post-push 10,659/97, build rc 0. The art is the R5-D6 stand-in kit until
    `R5-03.S3` drops the real art.
- **Manual (owner) still pending:** zone C's **real art** — generate, pick, hand-clean (decision R5-D6;
  the drop rides later as `R5-03.S3`); the M7 play and the readability / feel sign-off; the widow's 40–50 s
  design band vs the landed 21.9 s as an owner-taste row; the 2 `docs/images` plates; the row stays
  `done (owner parts pending)` per decision R5-D7.

### R5-04 — Zone D remaster: MAGMA DEEP

- **Scope:** the zone template for zone D; re-derive the dive's one-playfield pans for the 336-px playfield.
- **As built** (2026-10-22; the branch `r5/zone-d`'s legs `S4a … S7` squashed at the weld, the review
  RT-DRV routing its MH7(b) to master as MF7 and its branch-steer red as MF8-c2 — both this land's briefed
  prerequisites, verified in-run at the rebased tip; the `R5-04.S7` weld landed **`927b137f`** — 31 files,
  +1,826/−706, the wave's fourth zone LAND):
  - **CINDER BASTION rebuilt to §8** (S4b, plus the FIX leg): **17 parts** of the named table (§15's
    inherited "19" is a row-span count — adjudicated away; the ≤ 24 cap holds), prow, tower, pods and the
    six-segment turning chain, three phases on the design's ladder (spin +4 / −6 rev 240 / +8 rev 165,
    lanes 140/120/115, aimed 3-ways 1.95/2.025, ring-10 at 1.725); the full-loadout corridor law then made
    the **arms destructible** (hp 12/10/8 per side, scores 600/450/300) and moved the core to part index 1
    — the HALCYON BULWARK's own shape: a piercing beam that overlaps armour and core dies on the armour's
    clink, so zone A's two-shadow law extends to the arms as a third shadow (the release audit ran red on
    it, 68/68 after the FIX; the fight's 17.1 → 14.0 s is the arms-fall measured, not drift). The mid-boss
    **OBSIDIAN CLAW** arrives on `captain.crab` at x 514 (the ported captain screen-x, never re-derived),
    sidestepping the 400…560 × 140…260 shelf, spitting turning rings of 10 at 1.725, +24 units a volley.
  - **The stage rebuilt to §2/§4/§5/§9/§10/§11** (S5a): 21,150 px, seven camera keys with the **two-step
    dive** as the set piece (5,400 hold 150 → y 186; 8,700 hold 165 → y 432 — the Scope's re-derivation
    done: rowsTall 64 from the 432 anchor law), six checkpoints 0/3600/6600/9900/12900/16200,
    `terrain-magma-v2` with four appended variants (obsidian, brick-hot, lava-drip, vent), six parallax
    layers including the new `bg/magma-deep`, `bg/magma-chimney` and `bg/cinder-drift` bands, eight vent
    glows and the §9 raster rows verbatim; the ground-on-rock law moved the ground-row lips with
    first-bad-column arithmetic (magma-cone 4980 → 4900, cinder-rock 8550 → 8120, the deep pair 11150 →
    10760 and 11200 → 10800), the cinder-drift seam authored 12770–13800 across the trench, band yFactors
    deep .35 / chimney .6 / lava .5 / drift 1.15; `bg/magma-chimney` retired its EXEMPT row and joined the
    array-valued `CYCLE_ART.MAGMA` (wave 10's prescription); the demo window is the surface pass (the kit
    records 40 s from stage start, the trench sits beyond it).
  - **The roster and the plan** (S4a, S5b): the §6 new types **slag-mine** (`mine.burst`, ring 8-way at
    1.8; a 10×10 hurtbox where the design quotes 9×9 — the box is not representable, the nearest lawful
    one wins) and **magma-geode** (`hatch.spawner` — four cinder-bats, stands spent); seven new-by-sprite
    types placed while **slag-crawler stays rostered and unplaced, never deleted**; 75 events on the §5
    rhythm, the captain at x 7,650 before half length, the §4 channel's lower/flank branch regions, 43
    capsule sources (36 unconditional, 1 blue), the two-carrier calm from 18,300 to the 20,400 WARNING,
    the 37-entry item plan, the 10-row remix, the contract flipped.
  - **It plays** (S6, on the cured kit): the 4-way bot clears in **318.5 s**, boss 14.0 s, 0 deaths, score
    87,045, 27 capsules, equips 2/1/0/0/4/0/0, phases 0/1/2; the no-god run clears at **317.6 s**, boss
    13.1 s, 0 deaths (≤ 2 allowed at trench and river), score 85,773, 24 capsules; MF7's REACH law cures
    the cp-12900 recovery red (7/7 green) and MF8-c2's branch carve the four-way-bot red (31/31) — both
    routed reds CURED, not gated.
  - **The LAND**: the **doctrine fold** rode the eighth squashed commit (`d8cf901c`) — `units-pairs`'
    deepestPan pin (v1's playfield ported, 200 × WORLD_SCALE = 300) is falsified by design §4's dive, and
    the pin becomes the derived dive bottom 64 × TILE_SIZE − PLAYFIELD_H = 432 with the `v1rel` /
    `V1_FRAME` import retiring (whole-core K=1 5,244 green pre-lock); deepestPan's middle arm at 246 =
    432 − 186 is the dive geometry MF8-c2 demanded; the groups re-derived **10/2** and the page crosses to
    the **1024×512 rung, the wave's second** after zone E's; the bless moved **4 recordings** (demo
    2612028713 → 1570545633, boss 3313480029 → 3729852638, bot 1006087127 → 1783286111, god 2872977811 →
    1715133579 — the goldens ran full UNBLESSED green first, 268 + 87 skipped); the digest `767900f6… →
    fe99d8a7…` (moved 765, name set equal); plates 2 (`cinder-bastion` regenerated, `obsidian-claw` new);
    two shared-file collisions healed in the rebase (the router; `procedural-zone-d-edge` — the third
    merge site, a docs-fold row for `zones-d-and-e.md`); integration 2,630/97/0, post-push 10,671/99,
    `content:check` 106, v2-port 27 + 50 skips. The art is the R5-D6 stand-in kit until `R5-04.S3` drops
    the real art.
- **Manual (owner) still pending:** zone D's **real art** — generate, pick, hand-clean (decision R5-D6;
  the drop rides later as `R5-04.S3`); the M7 play of the dive and the readability / feel sign-off (the
  trench sections under MF7's reach law); the 2 `docs/images` plates; the row stays
  `done (owner parts pending)` per decision R5-D7.

### R5-05 — Zone E remaster: TEMPEST RIDGE

- **Scope:** the zone template for zone E; expansion focus per the table.
- **As built** (2026-10-22; the branch `r5/zone-e`'s legs `S4a … S7` squashed at the weld, the review
  R5-05.RV routing F1 (the hail-drifter drop) and MH2 (the swirl-ring hit-law cure), and the RT-ERV finding
  that the 4-way red's true offender was the thunderhead's **terminal needle**, not the gale-kite's
  movement — cured as MF8-c1 `1030012f` (2.4 → 2.25, the two zone-E goldens re-blessed on master, the
  wave's first intentional-sim bless, superseded at the LAND); MF10 `66e54bcb` was this land's estimator
  prerequisite; the `R5-05.S7` weld landed **`fe4cdae3`** — 32 files, +2,599/−458, the wave's second zone
  LAND):
  - **SQUALL STEED rebuilt to §8** (S4b): twelve parts — the mane, the crest and both flank plates — the
    snout at 26 hp, the chest 64 hp when open, and the three-phase heat ladder verbatim (P1 bulletSpeed
    2.025, P2 75/2.1, P3 65/2.175, ring 1.8) with no parameter moved to rescue the design's 40–50 s window.
    The mid-boss **THE STORM EYE** arrives on `captain.circler`, orbiting a 195×84 ellipse with two cloud
    guns; its swirl ring ships as **decor without a hurtbox** — under the entry-first `offerHit` law a
    concentric never-vulnerable cell would shield the 12×12 core from every heading (S4a; the hit law
    beats the design box, audited sound in RV MH2).
  - **The stage rebuilt to §2/§4/§9/§10** (S5a): 21,000 px, seven camera keys — the set piece the 12,900
    eye-of-the-storm dip to y 60 and the 15,600 gale lift — seven checkpoints, rowsTall 33 on
    `terrain-ridge-v2` with ten appended variants, seven parallax bands and three raster rows; the two
    floor turrets move to x 1908 and 4672, the first columns whose terrain reaches them under the
    ground-on-rock law (design §2's 1886/5006 snap into wave troughs); `EXEMPT.STORM` keeps the flat-art
    strobe band out of the ramp law, and the scan enforces the exemption's truth both ways.
  - **The roster and the plan** (S4a, S5b): the §6 new types **ice-slab** and **lightbird** — their plates
    ride this land (branch-carried S2 art, unlike zone B's pre-banked pair); the un-designed v1
    hail-drifter row at x 4290 dropped (RV F1); 77 events on the §2 rhythm, 38 capsule sources, the
    two-carrier calm, the 31-entry item plan, the 12-row remix, the contract flipped.
  - **It plays** (S6, on the MF8-c1-cured kit): the 4-way bot clears in **311.8 s**, boss phase 26.9 s,
    0 deaths, score 75,730, 21 capsules, peaks 23/12; the no-god run clears at **341.4 s** with 2 deaths
    (contact at x 13730 and 14171); the quoted windows (49.4 s pre-geometry, 27.7 s at S4b, 17.9 s at S6,
    26.9 s final) are different measurement windows over the same §8 content, not four runs of one number.
  - **The LAND**: the weld STOPped first — it measured the memory wall at its derived groups before taking
    the lock (the same fossil-charge class as zone B's; the RT-ERV PNG-byte relief proved orthogonal to
    the RGBA wall) — and after MF10 ran 39/39 rc 0 in 12 m 56 s of lock, taking a mid-weld tip-move to B's
    LAND. `stage-terrain.test.ts` took the wave's **first real shared-file collision** (B's reef-v2 branch,
    E's ridge/tempest branch — master's if-shape kept, a symmetric add, 6/6 green, tsc clean); the groups
    re-derived **12+/1−** and zone E's page crossed to the **1024×512 rung — the wave's first**, exactly
    what the fossil whole-atlas charge broke (no budget moved; MF10's model-only cure was the
    prerequisite); the bless moved **3 recordings** (demo 420997558 → 3667733317, bot 22471250 →
    3610953754, god 3153483302 → 4064933591) SUPERSEDING MF8-c1's master-side pair on the remastered
    content; the digest `2e14bd20… → cbecdd2b…` (moved 342, name set equal); plates 4 (`squall-steed`
    moved, `storm-eye`, `ice-slab`, `lightbird` new); integration 2,624/93 zero-red, e2e 99 + 73,
    post-push 10,650/95, build 10/10. The art is the R5-D6 stand-in kit until `R5-05.S3` drops the real
    art.
- **Manual (owner) still pending:** zone E's **real art** — generate, pick, hand-clean (decision R5-D6;
  the drop rides later as `R5-05.S3`); the M7 play and the readability / feel sign-off; the steed's
  landed heat against the design's 40–50 s window as an owner-taste row; the 4 `docs/images` plates; the
  row stays `done (owner parts pending)` per decision R5-D7.

### R5-06 — Zone F remaster: CELL VAULT

- **Scope:** the zone template for zone F; expansion focus per the table.
- **As built** (2026-10-22; the branch `r5/zone-f`'s legs `S4a … S7` squashed at the weld, its own
  tissue-seal R1 STOP having produced MF5 `a0abbf0a` (the corridor adjudication) ahead of it on master, and
  the review cures F6b (the contract composition row and the two procedural `-v2` name-pins) landing with
  the leg; the `R5-06.S7` weld landed **`5319d732`** — 31 files, +2,338/−481, parent `927b137f`, the wave's
  fifth zone LAND):
  - **MANTLE REGENT rebuilt to §8** (S4b): 13 parts become **19** — the eye core at 108 hp, each tentacle
    growing a fourth segment, the never-vulnerable mantle plates at (0, ∓30), 14-hp blisters worth 800 at
    (±20, ∓10) — three phases at fireTicks 85 → 78 → 70 with the §8 cadence verbatim, assembled height
    84 px inside the 202-px cap, and the six v1 `regent-*` names KEPT for zone H's echo; the alloc guard
    took setup-line edits only, its 64 KB budget unraised. The mid-boss **NUCLEUS WARDEN** on
    `captain.circler`: a 48-hp shell, two guns and two claws orbiting the 210×84 ellipse about the
    320×168 centre at 2.25, entered at x 514 (settling onto its ellipse within the circler's 16-px
    first-tick motion the design anticipated), on shared captain-shell / shield-plate art — purely
    additive, zero new boss art.
  - **The stage rebuilt to §2/§4/§10** (S5a): 21,000 px; the k3 hold-descent pans y 0 → 96 (exactly the
    rowsTall-36 margin over the 336-px playfield) into the sub-vault; the chase punches **three gapless
    regrowing `tissue-live` walls** at 11,040 / 11,700 / 12,360 — MF5's adjudication makes the seal lawful
    and the shipped bot's punch gate latches on all three, probe-proven, while the punch look-ahead itself
    stays unarmed (max key 1.95 < 2.4, no admit owed — four-way-bot.ts untouched); seven checkpoints,
    seven parallax bands (the schema cap), three raster windows inside the 0…335 / 1…336 bounds with the
    P7 ramp untouched; `terrain-vault-v2` flipped.
  - **The roster and the plan** (S4a, S5b): the §6 new types to the eight-sprite cap — **tissue-cyst**
    floor and ceiling pods on `hatch.spawner` releasing three chaser-cells each, and **viral-dart** on
    `rocket.homing` at 1.95 px/tick (turn cap 4 and homeTicks 110 — the price of the speed); the passage
    walls ship **seven pairs verbatim** — design §2's prose says eight, §10's own "as today" law and the
    never-edit rule won (a design-amendment ask, not a lane call); 85 events on the §2 rhythm, the warden
    at 9,450 before the half, the WARNING at 20,250, 41 capsule sources with the one blue at 14,100, the
    exactly-two-tender calm from 18,600 to the WARNING, the §11 35-name directItems plan, the 8-row remix;
    the contract flipped with the new composition row `{ octagons 2, maxRare 2 }` and the honest census
    (red 11 / green 10 / blue 9, octagons 9 & 30, orange 21, yellow 15 & 35 — S5b's summing-31 tally was a
    mis-count, record-only); no patterns file, no paths file (design governs the block's file list).
  - **It plays** (S6): the 4-way bot clears in **331.1 s**, boss fight 35.6 s, 0 deaths, score 71,476,
    9 capsules, peaks 17 live / 19 parts against 51 / 24 (§12's law: the captain observed, the phases
    boss-only); the no-god record case ends at 135.2 s with three deaths (terrain at 4973, contact at
    7068 and 8830), its replay-hash identity green; 290.6 s at S5a and 331.1 s banked are different
    windows over the same §2 content.
  - **The LAND** (weld run 4; 41 steps rc 0; two mid-queue tip-moves, C then D landed, and two router
    heals): the bless moved **5 recordings** (god 754014578 → 2830844142, boss 1548984531 → 258808902,
    deaths 199743605 → 1360583343, arcade 2488162144 → 3084421441, demo 3325973347 → 143204486 — the
    remaster moves the simulation: rebuilt stage, new types, warden, 19-part regent) and the **Arcade
    outcome heal** — a run-2 new class: `golden-zone-f`'s hand-pinned v1-era death list [3900, 4891]
    softened to the two-deaths count assertion zone-b/c/e's outcome files already use (the one expected
    non-derived path in the commit-replay check, cured inside F's scope and disclosed); the groups
    re-derived **9/1** with NO page added; the digest `fe99d8a7… → 20a7b109…` (moved 347, name set equal);
    plates 4 (`mantle-regent`, `nucleus-warden`, `tissue-cyst`, `viral-dart` — echo plates not moved); the
    e2e `REGENT_SKIN` probe narrowed to the mantle's own hue (the ribcage band paints its back tone
    legitimately); integration 2,646/99 zero-red, the MF10 memory duty re-measured green (the wave's
    proven duty — F adds no page), e2e 99 + 73, `content:check` 107, post-push 10,692/101, Tizen bundle
    1,467.7 KB (gzip 396.6 of the 512 KB budget). The art is the R5-D6 stand-in kit until `R5-06.S3`
    drops the real art.
- **Manual (owner) still pending:** zone F's **real art** — generate, pick, hand-clean (decision R5-D6;
  the drop rides later as `R5-06.S3`); the M7 play of the descent and the seal-punch section and the
  readability / feel sign-off; the 4 `docs/images` plates; the row stays `done (owner parts pending)` per
  decision R5-D7.

### R5-07 — Zone G remaster: PRISM LABYRINTH

- **Scope:** the zone template for zone G (and the `glimmer-cache` bonus stage's art); expansion focus per the table.
- **As built** (2026-10-22; the branch `r5/zone-g`'s legs `S2 … S7` squashed at the weld — the RLE cure
  `b61c63a0` (S5a.2) and the O1-law leg G7b rode it — over the base MF11 `29137363` (the set-piece admit
  this land's shutters demanded, from RT-GRV/RT-GRV2 and the first weld STOP); the `R5-07.S7` weld landed
  **`66122e87`** — 35 files, +2,939/−630, the wave's sixth and final zone LAND, the run's tip):
  - **FACET MONARCH rebuilt to §8** (S4b): 13 parts become **20** — the 84-hp core gated at 42, two
    16-hp / 900-point gun emitters at boss-x +45 on the ∓66 rows (hurtboxes adjudicated 14×14 by the
    hurtboxesInside law over §8's printed 16×16), crown, shoulders and swept-back wings all unhittable,
    the needle volleys now from all four guns (4 at phase 1, 12 under the crystals), the red rings at 1.5
    and 1.575 and the telegraphed lane unchanged from the shipped cadence; assembled height 147 px inside
    the 202-px cap, the core proven reachable (boss rush 3/3 and the zone's own 4-way case); §12's
    20-of-24 capacity flag disclosed, no capacity ask; the core's 4-frame pulse deferred to the real-art
    round (the anim stays {2, 12}, the widow precedent). The mid-boss **PRISM SENTINEL** on
    `captain.circler`: the WARDEN kit per §7's table as printed (core + four never-vulnerable orbs at
    ±30, hp 6 / score 250 each, the kill cascading 4,000 + 4 × 250 = 5,000), an ellipse 200×120 about the
    chamber centre at speed 2.4, entered at x 530, fought at the 8,040 boss event **without a warning**
    (P14: the debug skip still enters at the stage's last one).
  - **The stage rebuilt to §2/§9/§10** (S5a, S5a.2): 21,300 px over 56 tile rows; three diving camera
    keys (y 168 / 312 / 168 with holds) into the deep band and back; six heightfield segments, twelve
    gallery walls, the heart ring's crystal hangs and shard-floor risings with three gas holes, ten run
    geysers; the set piece the four **crystal shutters** (24×48 at y 408, swinging dy 96, period 240,
    phases 0/256/512/768 at x 10,080 … 13,600) plus four floor riders at y 456 — the wide swing rides
    MF11's by-shape admit; the two five-column pinch seal bands at 8,640 and 9,072 ship **MF5-open,
    entirely destructible** (band 2 drilled live by the shipped bot; band 1 stays open-lane by design,
    the RT-GRV2 restatement of the earlier ×2 claim); the §10 crystal lining holds every pixel column
    ≥ 48 px (worst exactly 48 at x 8,903; twelve 48–54-px columns in the slide's lining family — the
    S5a.2 correction truth); the **1-based RLE cure** (S5a.2 `b61c63a0`, RT-GRV C1): heightfield RLE tile
    ids count from one against the tileset order (tilemap.ts:118) — a 30-row remap whose consequences
    are the bands' destructibility and the bank's capsules 6 → 12; seven parallax bands at their 320-px
    frame width (wave-10 law; the design's 640 returns with the real art); 22 glow-prism-vent anchors all
    on Empty cells; `terrain-prism-v2` flipped with the four §10 variants appended after the twenty
    verbatim.
  - **The roster and the plan** (S4a, S5b): the §6 new types **prism-shard** (`drifter.sine` 1.5, the
    geode's new child, 1 hp / 75 — the child swap keeps `geode-shard` shipped-unreferenced by the freeze
    law), **prism-glint** (the silent capsule drifter, 2 hp / 150, drop capsule, amp 27 on a 200-tick
    period) and **prisma** (`cube.pincer` mirroring the shipped carrier cube); the 81-event §5 timeline —
    the eight moving blocks, the bonus entrance re-placed at 4,800 with its four window turrets, 33
    capsule sources with the one blue at 18,900, the calm pair at 19,500 / 20,150, the WARNING at 20,550,
    the end at 21,300; the §11 37-entry directItems plan (census 12/10/9/3/2/1), the 10-row remix, the
    contract flipped with `{ octagons 3, maxRare 2 }`; deliberately **no paths file** (the two halo rows
    ride the ids v1 already used from zone A's file — paths resolve globally by id) and the design's
    no-patterns note holds (`zone-g.patterns.json` byte-identical).
  - **It plays** (S6): the 4-way god bot clears in **315.4 s**, boss fight 31.2 s, 0 deaths, score
    70,761, 12 capsules, equips 2/1/0/0/1/0/0, peaks 15 live / 20 parts, 4 rush cubes stacked. The no-god
    case follows the **O1 identity law** ruled in this weld (w11-G7, option (b); `golden-zone-e` is its
    twin since `fe4cdae3`): the replay-hash identity asserts, the recorded status, deaths and seconds
    report — the re-blessed seed-91 recording ends gameOver at 156.0 s, deaths [4548, 7935, 9265], the
    first at camera x 5,458 outside the §15 window 1; the §15 windows [[8400, 9600], [9600, 13800],
    [16800, 19200]] stay in the file as the owner's gallery-taste comment (wave 12); the seed-1 bank at
    the same gallery mouth (145.1 s, 5 deaths, first at 5,153) is a volley-difficulty row with the owner,
    non-blocking.
  - **The LAND**: the duty-5 O1 window rule STOPped the first weld **by design** (the old promised-clear
    law fired red on the re-recorded bot — the ruling's evidence); the restart ran 39/39 rc 0 and the five
    bless hashes came out **bit-identical across both attempts** (the determinism proof): demo 3546822199
    → 3434717621, `glimmer-cache-god` 3837097707 → 304382126 (the cache's hash moves with the 24-tile
    strip its map shares — its ids 1–20 never moved, only the loaded tileset JSON shifted the playback
    hash), boss 181898252 → 2688009023, bot 3607442514 → 1696120078, god 952979388 → 1057997520; the
    groups re-derived **11+/2−** (`geode-shard` leaves the reachable set, the v1 prism tiles demote), the
    page grows `main-7` 512×128 → 512×512 with NO page added and no memory-budget suite moved (MF10
    holds — the pre-lock shell FULL at a throwaway derived file ran 613/617 with only the two proven
    stale-derivative classes red, both healed by the land); the digest `20a7b109… → 7e6fc0e9…` (moved
    410, name set equal; full `7e6fc0e9cf2f16c1…`); plates exactly 4 (`facet-monarch`,
    `prism-sentinel`, `prism-glint`, `prism-shard`; no echo plate); the LAND fold of
    `procedural-zone-f.test.ts`'s stale prism-on-v1-sheet assertion (RT-GRV2 🟠-2, proven red-before /
    green-after, 13/13); the shared-kit doctrine ran GREEN whole-core K=1 (385 files / 5,256 tests — no
    fold class this time, the B precedent examined and closed); integration FULL zero-red, e2e 99 + 73
    with the facets floor at 14,000 needing no retime, post-push 10,713/104, build rc 0. The art is the
    R5-D6 stand-in kit until `R5-07.S3` drops the real art (`glimmer-cache`'s among it).
- **Manual (owner) still pending:** zone G's **real art** — generate, pick, hand-clean (decision R5-D6;
  the drop rides later as `R5-07.S3`, and with it the core's 4-frame pulse and the bands' design 640
  widths); the M7 play of the labyrinth (the dive, the drilled bands, the shutter parade) and the
  readability / feel sign-off; the §15 gallery windows and the gallery-mouth volley difficulty as the
  owner's taste rows (wave 12); the 4 `docs/images` plates; the row stays `done (owner parts pending)`
  per decision R5-D7.

### R5-08 — Zone H remaster: IRON CITADEL

- **Scope:** the zone template for zone H; expansion focus per the table.
- **As built** (2026-10-22; the branch `r5/zone-h`'s legs — wave 11's first half `S4a`/`S4b` at
  `e2078776` (the roster and stage appends) and wave 12's `S4c` (the sovereign, the echoes, FIX1/FIX2),
  `S6` (the retargets and FIX3) and `S7` (the weld) — squashed over the base MF15 `cd4bb68c`; the
  `R5-08.S7` weld landed **`a2d94928`** — 33 files, +3,454/−598, the wave's zone LAND, the run's eighth
  remaster of nine):
  - **IRON SOVEREIGN rebuilt to §7** (S4c): **18 parts** — crown and prow on the `sovereign-hatch`
    frames, skirts on the plate tiles, vents on the emitter, and the ring at FOUR pods. Design §7's
    six-pod row is out-voted by the frozen release-audit law (the R5-D10 class, zone D's arms
    precedent): the fully-powered MANTA stalls past 36,000 ticks in phase 0 against the 20-part ring
    and clears the 18-part trimmed tree in 2,670 (probes A–C; option A ruled and executed, `pod-e` and
    `pod-f` deleted); the destroyable 260 stays UNMOVED — the pods were never vulnerable — and the
    hatches case and the ≥ 4-pod floor hold at four; assembled height 168 px inside the 202-px cap,
    identity fields frozen (x 514, y 168, code IS-08, four phases); release-audit 68/68. (The design
    file's own §7 and §2b rewordings ride the run's closeout —
    `docs/v2-run/designs/zone-h.md` is in no docs lane's file list.)
  - **The OBSIDIAN parade re-rigged** (S4c): the four echoes rebuilt from the LANDED boss trees under
    a machine-asserted match law over `zone-{a,b,d,f}.enemies.json` (names, parents, offsets, sprites
    and gun-core roles equal to the boss; echo HP fewer; no boss-never part flipped vulnerable):
    `echo-bulwark` 8 parts (wings to the hull at x 0 y ∓60, guns −6 ∓13.5), `echo-maw` BYTE-IDENTICAL
    at its shipped five (disclosed zero change), `echo-bastion` 5 (arms take the landed inner names
    `arm-a`/`arm-b-inner`, the destroyable flip rides at hp 8 against the boss's 12), `echo-regent`
    8 → 14 (four segments a side, parent-chained at −16.5/−15 with radius 7.5, tips re-parented off
    `seg-*-4`); the parade row counts 8/5/5/14 against the zones' 12/10/17/19.
  - **The stage rebuilt to §2–§5/§9/§10** (wave 11's `S4a`/`S4b`, `S5c`, `S6`): 20,250 px over six
    sections — the byte-kept outer walls (the attract demo's ground), the fortress gate with its two
    flat 120-px corridors, six plate slabs (period 240, binary phases) and the gate-door plug walls,
    the keep's ramped wall, the terrain-void parade hangar (the 0.9 key), the piston hall (ten pistons
    in the old pair shape, 33-px throws), the ceilingless core run and the breathing throne; 103
    x-sorted events (81 spawn/formation, 16 block, the four parade rows at 7,830 / 8,670 / 9,510 /
    10,350, the calm pair at 18,810 / 19,230, the WARNING at 19,500); eight camera keys at 1.05–1.95
    px/tick, the k5 dash into the core run; six checkpoints at 0 / 3,300 / 7,650 / 10,950 / 13,650 /
    16,200; `tiles/terrain-citadel-v2` flipped (the twenty base frames verbatim before §9's plate,
    rivet-plate, grate and gate-door); the fifth parallax band rides the banners at 0.6 on the 320-px
    spacing; the §5 roster — the gate-sentry pair on `turret.floor` (hp 8, score 400, one quantised
    1.95-px/tick volley every 150) and the iron-banner drifter (hp 2, 150, drops a capsule) — seven
    new-by-sprite types inside rule 3's 6–8 band; directItems 26 → 32; the remix is §10's eight sorted
    rows; the contract flipped with §5's census {octagons 1, maxRare 2}; the v2-port reports "zone H
    is remastered (R5)".
  - **The capsule-window cure** (S6 STOP → FIX1, option 1 adjudicated to a spawn-row amendment): the
    four §2b multi-member banner rows inside checkpoint windows counted ONE source each while every
    member dropped its own capsule — 13 against the window's 3 at checkpoint 1, 14 against 3 at five;
    the frozen recovery law wins (R5-D10 class) and the literal option-1 is engine-impossible: an
    event row's `drop: null` suppresses only the formation's COMPLETION drop (the shipped
    `checkFormation`), while every member of a `drop: 'capsule'` entry still drops on kill. The cure:
    the rows at 3,720 / 4,380 / 16,900 / 17,420 became single iron-banner SPAWN rows (their y lanes
    kept), each window now holds §4's exact three sources, and the total stays 42 inside [18, 48] —
    option 1's 42 → 46 arithmetic was vacuous (disclosed); §2b's multi-member wave survives OUT of
    window at x 9,300 as the identity row, and the completion bonuses left with the rows (the god
    score 139,610 → 130,390); recovery 7/7 green.
  - **The arcade golden asserts its recording** (RT-H B-2 → FIX3, law-side only): the S6 arm was
    mis-authored — it promised the god scenario's outcome (stageClear, 0 deaths, 240–360 s) against an
    Arcade recording — and was rewritten in the F/G twins' own words: assert the RECORDED replay —
    identity (assisted false, stage `zone-h`, difficulty `arcade`, the arcade death penalty, seed 91
    unmoved) and outcome coherence (status ∈ {stageClear, gameOver}; gameOver ⇒ lives 0 and the boss
    standing; death ticks at most TWO as a COUNT, never a tick list — zone F's softened rule). The
    blessed recording tells the truth: gameOver at 5,632 ticks (93.9 s), deaths [4,113, 5,539], score
    3,130 — design §11's honest Arcade outcome; whether the four-way bot should survive Arcade rank is
    the owner's taste row (the cure's content rebalance was REJECTED — it would move all four
    difficulty digits tables); `golden.test.ts`'s arcade description follows the cure in zone A's
    honest-outcome idiom. The procedural anti-rot cure (RT-H F-1 → FIX2): `procedural-zone-h.test.ts`'s
    ROUNDED_BOXES list carried two stale `echo-regent` seg-top/seg-bottom labels — the re-rig's
    radius-7.5 rows falsified them at allowance 0; the entries were DELETED, and the lesson rode the
    body: an echo re-rig must re-run its zone's procedural test pair (the file is outside the rule-9
    derived roster — no LAND regenerates a test fixture). The S4c chain also repaired
    `test/integration/stage-terrain.test.ts`: truncated to zero bytes by a leg's `git show :2` redirect
    accident and carried empty in `b558418c`, it was restored to master's 254 lines plus the three
    `terrain-citadel-v2` routing branches (net +9/−1 at the LAND against the MF15 base, 6/6 green).
  - **It plays** (S6, re-measured after FIX1 — this is the record line, not the pre-cure
    307.9 s / 139,610): the 4-way god bot clears in **324.5 s**, inside §17's 240–360 s band, boss
    fight 42.9 s, 0 deaths, score 130,390, 14 capsules, equips 2/1/0/0/2/0/0, four parade captains,
    2,580 emitter-lane ticks; the no-god identity case records 397.6 s with two deaths (contact at
    4,708, bullet at 16,710) and replays to hash. All S6 retargets are DERIVED from the landed tree,
    never pasted (RT-H's adjudication): the practice skip starts at the stage's own first boss event
    minus `BOSS_SKIP_LEAD` (7,830 − 144 = 7,686), the key-ramp bound computes from the camera table,
    the gate-mouth law reads |camera.y| ≤ TILE_SIZE/2, the slab-shadow rows read the block body at
    event x + 664 (checkpoint 1's slab at 2,820 occupies world x 3,484, rows 144–276), the e2e
    cycling-wall case abandons the shared sky window for the wall-face rows 192..263 (the 144-px
    banner band buries the top two bands; the art-side sim measures 513 lit and ≥ 45 stepped against
    the landed > 50 / > 10 bounds), and P14's land 19,356 = 19,500 − 144.
  - **The LAND**: the weld STOPped once (STOP-1) on two reds outside every enumerated derivation class
    — B-1, the four-way bot's slab floor naming only zone G (cured on master as MF15 before the
    re-pick) and B-2, the arcade law (cured on the branch as FIX3) — both law-side, content unmoved;
    restart-2 ran the 39-step chain onto `cd4bb68c` with the delta identity proven three ways (the bot
    file's land delta byte-identical to a pure MF15 carry-through) and blessed EXACTLY five files,
    every final hash digit-for-digit against the banked table (god 1,072,895,145, boss 3,266,164,439,
    deaths 2,906,790,926, arcade 1,343,190,531, demo 415,361,455) with every non-zone-H recording
    bit-unchanged; the groups re-derived +5/−1 (zone H gains `bg/citadel-banner`,
    `bosses/sovereign-hatch`, `enemies/gate-sentry`, `enemies/iron-banner`; `tiles/terrain-citadel`
    retires to `-v2`) and the interim v1-atlas digest re-pinned `7e6fc0e9… → da5879b4…` — the wave's
    one disclosed fold, pure relocation (808 scale-1 positions moved, name set equal, added 0, removed
    0; the pre-regroup build reproduces the retired digest exactly), healed under the docblock
    protocol with MF12's precedent line and no cap moved; the fingerprints re-pinned at the derived
    tree — 117 presentation rows, 13 content-DB entries, 3 shell flight rows (the id-shift class;
    every walk's own expectation green); `docs/images` plates EXACTLY five (new `enemies/gate-sentry`
    and `enemies/iron-banner`; moved `bosses/iron-sovereign`, `bosses/echo-bulwark`,
    `bosses/echo-regent` — the maw's and bastion's plates stay valid); post-push full suite 892 files
    / 10,733 tests zero red, the weld's e2e batch under the lock (chromium 100, firefox determinism
    73), and the shell residency premise reds self-cured at the derived state without a fold. The art
    is the R5-D6 stand-in kit until `R5-08.S3` drops the real art.
- **Manual (owner) still pending:** zone H's **real art** — generate, pick, hand-clean (decision
  R5-D6; the drop rides later as `R5-08.S3`); the M7 play of the citadel (the gate-mouth slabs, the
  piston hall, the parade, the breathing throne) and the readability / feel sign-off; the Arcade
  recording's honest gameOver outcome — and whether the four-way bot should survive Arcade rank at all
  — as the owner's taste row FIX3 leaves on record (the rebalance cure rejected); the 5
  `docs/images` plates; the row stays `done (owner parts pending)` per decision R5-D7.

### R5-09 — Zone I remaster: ABYSSAL THRONE

- **Scope:** the zone template for zone I, plus the ending hook; expansion focus per the table.

### R5-10 — Bonus stages, boss rush, loops, escape, dimension and the ranges

- **Scope:** per the table's last row. The loop remixes and the caravan follow the remastered zones. The boss rush
  uses the new bosses. The test and dev ranges (`test-range`, `weapon-range`, `gimmick-range`, `raster-range`, …)
  get ported art only.
- **As built** (part 1, wave 12; 2026-10-22 — the §11 wave-12 block carries the cure ledger MF12–MF15 and the
  carried-state record; part 2 (`T4`, `T5`, `T7`, `T9`) rides wave 13 by schedule):
  - **`R5-10.T1` — the bonus stages laid out for v2** (`cea1b20d`): `brine-grotto` and `glimmer-cache` doubled
    from 2,700 to **5,400 px**, `bonus-vault` from 2,400 to **4,200 px** — terrain-reef, terrain-prism and
    terrain-a tables untouched, the B and G looks (parallax, raster, palette cycles) byte-identical; the
    grotto's mouth/gallery/heart heights (floor 36 / ceiling 36 with ±12 ramps, then 72 over 96 on a 144-px
    corridor, heart 48), twelve three-carrier groups (36 capsules), nine froth and two 24×108 brick walls at
    world x 1,140 / 3,064, the 1UP at x 3,975; the cache's gallery 84/72 with the 84–240 corridor, eight
    carrier groups (24 capsules), three six-cube prism rushes at 1,860 / 2,160 / 4,320, six glint-motes, two
    geodes, cube walls at world 1,140 / 3,544, the 1UP at 4,620; the vault's 404 RLE columns, three pillar
    pairs at columns 90 / 192 / 294, the 72-px open eye at rows 13–18, fourteen carrier groups (42 capsules)
    and the 1UP at x 2,040 y 186 bracketed by four mid-lane groups — the +1-life law is geometry-critical
    there; all three ride the single {x: 0, speed: 1.5, ramp: 30} key, forced by the live loop caps (5,400 px
    clears in 3,615 ticks against the 4,000-tick runtime pins; the vault's 2,815 under its 3,000);
    `bonus-range` was the check case — verified, not edited, its zone-A feed untouched. Every bonus outcome
    law authored from the new layout, never pasted: the grotto's 1UP promise `lives − 3 − extends ≥ 1`, the
    cache's relaxation to `lifeDelta ∈ [0, 1]` (the old `lives === 3` asserted the old run's accident —
    lane-catching is not a layout law), the vault's killed > 10 / score > 10 × 1,000 / `bonus.count === 0` /
    +1 life; seconds windows 59–67 s (the 30.25 / 26.9 s the old content recorded are arithmetically
    unpastable at double the length). Blessed three (grotto 2,143,762,895; cache 904,451,765; vault
    73,544,239), the `bonus-range` pair byte-identical; zero atlas churn — the carriers' art fields stay v1
    (RR-1 serves ×1.5), no sprite name entered, no plate moved, the fingerprint delta minimal (4 presentation
    rows, 1 content-DB row, the shell file untouched). The program's first `--only` bless list owning ZERO
    demo stages and its first re-authored non-zone v1-baseline stage — its two weld STOPs became MF13's two
    kit laws and MF14, and resume-3 landed zero-red with a seven-spec e2e batch exercising the re-laid bonus
    stages in the browser.
  - **`R5-10.T3` — the high-speed dimension's v2 stand-in art** (`90a20a3a`): the `dimension.mjs` generator
    (+625 lines) goes native at v2 sizes for SIX names (floor 48² seamless, sky 192×72, pylon 24×60×2f, maw
    42²×2f, claw, leg) and adds FIVE new names — `bg/dimension-rift` (320×84×2f mid band, the monolith
    skyline), `bg/dimension-strands` (320×48×2f fore band, sagging into rows 0..43, never the ship's lane),
    `decor/dimension-shard-a` / `-b`, `fx/glow-rift`; the stage's parallax goes 1 → 3 bands (the sky stays
    index 0 — the runtime law), six decor back entries with glows on two, and the extras roster hangs a glow
    on `dim-pylon` and the grasping-bloom's maw — every added line presentation-only, no sim field moves; the
    Mode-7 pass is untouched (the landed horizon/bottom 168/336 ports — every mode7 spec row held unedited,
    8/8 green, budget 16 unraised); v1 bytes unchanged at scale 1 (RR-1); plates exactly four; RT-T3's one
    Major (the upscaled-pool floor crossing as the six names went native, 517 → 499) was cured on master as
    MF12 before the wave's welds.
  - **`R5-10.T6` — the dev ranges keep working on the new art** (report-only, `w12-T6-report.md`, no commit):
    `content:check` green at the `a2d94928` tip (10 files / 110 tests); a programmatic census resolves all
    118 art-name fields across the work order's 19 dev-range files (the three terrain-bearing ranges share
    `terrain-a`; the eight boss ranges carry four fields each); NO retired or renamed name found — the R5
    add-never-retire art law held across every landed wave; all 62 committed recordings re-verify with zero
    range golden moved (no sim change since their bless — no bug); the run-wide ranges (test-, weapon-,
    hunter-, direct-, gauntlet-range) keep no golden recordings by design, exercised by the runtime suites.
    The waiver on record: T6 ran with zone I unlanded (owner-walled); zone I's weld re-runs `content:check`
    at its own LAND.
  - **Carried to wave 13** (never landed here — `T2` and `T8` are wave-12 work items the zone-I wall moves,
    disclosed rather than described as done): `R5-10.T2` (the escape sequence's new layers — it repaints the
    stage files the zone-I branch rewrites, so it waits the I-LAND) and `R5-10.T8` (linked stages sharing
    their zones' pages — it waits T2 and I); every `R5-0n.S3` real-art drop stays owner-gated (the FLUX
    decision, fresh choices.json sets, reviewed stamps) — none dropped in wave 12.
- **After R5-10:** tag **`v2.0.0-beta.1`** — a pre-release, wave 13's last action: cut after its targeted exit and its
  docs item, on `origin/master` (wave 13's rule 4); the milestone's full suite runs with the run's one full suite in
  wave 15 (§18, RUN-1).

---

## 12. R6 — Balance, performance and v2.0.0

### R6-01 — Balance and difficulty

- **Scope:**
  - **Rank and presets:** rank growth and the four presets re-checked over the longer zones.
  - **Extends:** the thresholds (20,000 / every 70,000) re-derived from v2 run scores.
  - **Scoring:** the milking cap, and point values where expanded levels changed the score curve.
  - **The extra modes:** caravan and boss-rush timing.
- **Method:** the playtest bot's score and death statistics over every route × both ships, plus owner play
  sessions.
- **Acceptance:** goldens re-blessed with reasons; `docs/client/` difficulty notes updated.

### R6-02 — Performance and memory on the TV with the final art

- **Scope:**
  - **The guided capture:** re-run M3-02f's guided render capture (telemetry) on the real v2 game on both M7s, and
    the R0 bench for comparison.
  - **Confirm the budgets:** render ≤ 8 ms (feat §22), TPF reading 1 with the vsync lock, zone-load ≤ 2 s,
    boot ≤ 10 s, memory < 100 MiB.
  - **Mitigations, only if needed (§13):** a TV profile with fewer parallax layers, far layers at half
    resolution, CRT off by default, WebGL 2, PNG-8 everywhere. Of these, **the WebGL 2 entry is superseded** by
    R6-04 (decision W5-20, 2026-10-20): the renderer choice is the user-facing RENDERER row there — Auto keeps
    the directive's conservative floor, and the sweep measured the win as 1080p-fill-only — so no P4 mitigation
    may flip the default; P4d, if P3 calls for it, retunes R6-04's Auto floor (the probe becomes primary on the
    TVs) rather than flipping a hidden default. The CRT row likewise lives on R6-04's GRAPHICS page from that
    step on, so P4c ships as a default there.
- **Acceptance:** numbers recorded in `docs/dev/input-probe-results.md` §12; every budget met or a mitigation
  shipped and documented.

### R6-03 — Docs, store refresh and the v2.0.0 release

- **Scope:**
  - **Docs:** CHANGELOG `[2.0.0]`; README; `docs/client/` (controls, bestiary, arsenal — all with new images);
    `docs/client/outstanding-work.md` for v2.
  - **Store:** store listings and AI disclosures (R3-05).
  - **Release:** Tizen `config.xml` / webOS `appinfo.json` / Electron at 2.0.0, then the GitHub release
    **`v2.0.0`** (`gh release create v2.0.0 …`).
  - **v1.x's future:** write down what happens to `v1.x` now — security and crash fixes only for one year after
    v2.0.0 (owner, Q-12), then end of life.
- **Acceptance:** the full definition-of-done suite green; the release published.

### R6-04 — Graphics options: output resolution, renderer, and the recommended defaults

Added 2026-10-20 on the owner's directive (decision **W5-20**): a graphics settings section in the Options
screen — "where we can tune things like native resolution and gl1/gl2 etc… with recommended/good defaults set".
The evidence for the defaults is the R0-03 follow-up sweep: the 172-scenario bench matrix run on the real M7 at
three canvas outputs × both WebGL versions, twelve sessions over ≈ 14 h of TV time
([`tools/input-probe/results/2026-10-19-m7-bench-resolutions/`](tools/input-probe/results/2026-10-19-m7-bench-resolutions/README.md),
recorded in §17's R0-03 row).

- **Scope:**
  - A new Options page **GRAPHICS**, placed after CONTROLS / DISPLAY / GAME (before the M3-02 EXTRAS row):
    - **OUTPUT** — `Auto | 1920×1080 | 1280×720 | 960×540`: the cap on the canvas backbuffer that the TV's (or
      the window's) compositor upscales — the bench's build-output mechanism
      ([`apps/tizen/src/bench/output.ts`](apps/tizen/src/bench/output.ts)), *the lever the sweep measured*, made
      user-facing ("what a real 720p / 540p output mode would do", says its docblock). **Auto is 1280×720 on the
      TVs and the window's native size on desktop and web.** From the sweep: the M7's cost is the full-screen
      fill, not the 640×360 scene, so at 720p output the two-tick share of every 640×360 variant but the stress
      row collapses to ≤ 0.8 % (busy 7.5 → 0.8, filter 22.6 → 0.2, mode7 10.4 → 0.3, crt-light 8.8 → 0.4,
      crt-full 42.3 → 0.2 — §13's tv-profile band is reached at 720p by crt-full on both GLs and by busy and
      mode7 on GL 2), and the 640×360-worst row itself moves 59.5 % → 11.3 % → 1.8 % across the three outputs;
      540p only helps those heaviest rows — a few light native rows are 1–4 points *worse* there. Synced p95
      stays flat ≈ 12–16 ms at every output (the scene's own render barely moves). Native art from 1280×720n up
      is dead at any setting; ≤ 640×360n is fine.
    - **RENDERER** — `Auto | WebGL 2 | WebGL 1`: Auto asks the engine for WebGL 2 only where the directive's
      floor clears it — **Chromium ≥ 71** — and the context actually exists; **both TVs (68 / 69) therefore keep
      WebGL 1, exactly today's shipped behaviour**, even though the M7s do expose WebGL 2
      (measured 2026-09-15; the sweep's GL-2 campaigns ran on it). The conservatism is the sweep's own finding:
      GL 2's win is 1080p-fill-only (21 better / 0 worse at 1080p output; mixed at 720p, within noise at 540p),
      so at the recommended Auto output Auto never loses either way — and webOS 5 (Chromium 68, never run on
      hardware) may expose no WebGL 2 at all, which is why the rule is a floor plus a runtime probe, never a
      version guess alone. **This supersedes R6-02's "WebGL 2" mitigation bullet** (cross-referenced there):
      the choice is a user option and §13's row now, not a last-minute default flip.
    - The DISPLAY page's **CRT** and **ASPECT** rows **move to GRAPHICS**: they belong to the same
      present-the-frame chain as OUTPUT (CRT filters the upscaled frame, ASPECT sets the window's shape and its
      side panels), while DISPLAY keeps what changes how the game looks tick to tick — the bullet palette,
      hitbox, shake, flashing and scale. This is a lane decision, stated with its reason; the rows' save fields
      and live `UserOption` events do not move, only their page.
  - **Both new knobs are boot-time values.** Changing one marks **`APPLIES AT RESTART`** on the row — the
    pattern the GAME and EXTRAS pages carry with `APPLIES FROM THE NEXT GAME` — and the hosts honour the
    restart: Tizen and webOS relaunch the app, the web host reloads the page, Electron rebuilds the window.
    Nothing in the simulation moves — the two knobs are presentation-only (plan §1.5): a walk that flips them
    changes no golden and no sim hash, and the fingerprint tables stay clean through the options-page change
    except the sanctioned UI re-pin the new page itself causes.
  - **Save:** the `UserOptions.display` section gains the two fields; a format bump (3 → 4) with the 3 → 4
    migration and the defensive-parse law (M1-17 / M2-16 pattern: `resolveUserOptions` clamps and falls back —
    an unknown enum name reads as `Auto`). The defaults are the recommended values — **`Auto` everywhere** — so
    an untouched save needs nothing from anyone. What that means per host: RENDERER `Auto` is today's shipped
    behaviour (WebGL 1 on the TVs), while OUTPUT `Auto` is the sweep's cure taken as the default — on a 1080p
    panel the canvas stops filling the window (1920×1080 backbuffer) and caps at 1280×720 (the exact ×2 from
    640×360), the set's own scaler taking the last step to the panel: R-D1's ×3-on-1080p becomes ×2 on the GPU
    plus the compositor (the 59.5 % → 11.3 % two-tick move of 640×360-worst is bought with that last step — the
    sweep ran exactly this mode, and the sharpness call is listed under Owner parts). `test/e2e/save-format.ts`
    and its pin flip with the version; a `v1.x` app reading a format-4 save falls back to defaults (decision
    W4-14 — no back-migration).
- **Method:** the page is the `core/ui` list-menu machinery and the boot order the shell already walks
  (`ShellOptions` → `createPixiRenderer`); no new renderer concept, no new draw calls beyond the page itself.
- **Acceptance:**
  - the sweep's numbers restated in `docs/dev/platform-polish.md`'s graphics-options row;
  - the page tested at the UI-kit level (the `packages/core/test/scenes/` options suites: the rows, the hint,
    the store-on-back, the moved CRT / ASPECT rows on their new page) with its allocation guards green;
  - the presentation fingerprint re-pinned for the new page with the reason disclosed (never silently);
  - e2e: the new page is walked, `display-options.spec.ts` follows the moved rows, and the save round trip
    proves a boot-time value lands after the restart path;
  - R6-02's budgets re-confirmed **per output** with the shipped defaults — the final audit (does the shipped
    Auto still match what the final art needs?) rides R6-02's W13–W15 chain (P1's re-measure, P3's verdict —
    which already pools the WebGL 1-vs-2 comparison — and P4c / P4d only if a budget misses), not a step of its
    own.
- **Owner parts:** the §17 row and the R6 milestone join GitHub issues only on the owner's say-so (§3.5's
  rule); the on-device check of the shipped Auto settings — including the OUTPUT `Auto` sharpness call on the
  1080p M7 (the compositor's last step, above) — is R6-02's guided capture, not new owner work.

---

## 13. The benchmarks: what they measure and how the results are used

**They never block the plan.** R1 starts without them, R2 switches to 640×360 whatever they say, and every
outcome below maps to an action, not a stop.

| What is measured (R0-02 / R0-03) | Why |
|---|---|
| 384×216, s = 1 | the baseline: v1 as it ships, measured in the same session |
| **640×360, s = 1.5** | **the v2 game's frame and density** |
| 960×540, s = 2.25 | the "hi-bit" alternative at the same field of view — for the record and for a possible later desktop/HD mode |
| Each at: plain busy frame, + filtered layer, + Mode-7, + CRT light / full, WebGL 1 and 2 | separates fill, filter, Mode-7 and CRT costs; settles the WebGL 1-vs-2 question (review F8) |

| Outcome at 640×360 (relative to the same session's 384×216 baseline) | Action — none of them blocks |
|---|---|
| Two-tick frames within +2 percentage points, synced render ≤ 8 ms | proceed as planned; record the headroom as the R3-04 / R6-02 budget |
| Two-tick frames +2–10 points, or synced render 8–12 ms | proceed; R3-06 and R5 adopt the TV profile from the start: parallax layers capped at 4 on Tizen, the far backdrop at half resolution, CRT `off` default on TV |
| Worse than that | proceed; open a performance step before R5 (render groups per layer revisited, `ParticleContainer` for the big pools — review F1(b), PNG-8, WebGL 2 if it measured better); re-measure after it |
| WebGL 2 clearly better (≥ 10 % synced render) | a step to make WebGL 2 the TV default with a WebGL 1 fallback — **R6-04 exposes the choice** (decision W5-20: the sweep's verdict is 1080p-fill-only, so it is a user option with a probing Auto, not a default flip) |

| Outcome at 960×540 | Action |
|---|---|
| holds the same as 640×360 | note "960×540 is viable on the M7" for after v2 (desktop HD mode / v3); it still has no whole-number scale on 720p TVs |
| clearly worse | note it; nothing changes |

---

## 14. Risks and fallbacks

| Risk | Likelihood | Fallback |
|---|---|---|
| **The M7 cannot hold 60 fps at 640×360 with detailed art** | low–medium (+25 % fill estimate; CPU follows object counts) | §13's actions; the TV profile; the headless bench gates catch regressions early |
| **AI art looks inconsistent** across hundreds of generations | high without rules | the art bible, fixed palettes and quantisation in ingest, one kernel per category, per-zone palettes, hand cleanup as the last pass |
| **AI art is poor at small sizes** (a 24×14 ship, 16-px bullets) | certain | those categories are hand-pixelled from the start (R3-01) |
| **Model licences** restrict commercial use of outputs | medium | R3-05 checks every model's terms before art ships; regenerate with a permissive model if one does not allow it. For R0-04's models: **Qwen-Image is Apache 2.0**; the **FLUX.1-dev / FLUX.2-dev weights are under a non-commercial licence** — read its clause on outputs before any FLUX-made winner ships, else redraw it with Qwen-Image or by hand, using the winner as a design reference only; SD3.5 Large has its own Stability AI licence to read too; for the clips, **Wan2.2 is Apache 2.0** and **LTX-2.5 is under the LTX-2.x Community License Agreement** (LTX-Video, the fallback, has its own licence). Every sidecar records the model that made the image or clip |
| **Killing the main LLM by accident** while stopping an image model on skynet2 (both run SGLang; renamed children; the stock stop tools — `pkill -f sglang`, `sglang killall`, `killall_sglang.sh` — match by name) | low with the tooling, severe if it happens | only `art-prompts/v2/server.sh stop`: the target is the :30001 listener with the expected `--model-path`, the LLM's process group is refused, every check repeats before each signal, `verify` runs after every stop; `generate.mjs`, `gen-candidate.mjs` and `sweep-models.sh` refuse port 30000 ([runbook](docs/dev/art-generation-server.md)) |
| **First-start weight downloads** — each model's first start downloads its whole repo (FLUX.2-dev's took ~195 GB on 2026-10-16; 348 GB were left; six models are still uncached) | certain, once per model | `server.sh status` shows free disk and each model's cache; `start` needs ≥ 150 GB free; `wait` allows 3 h; one model at a time |
| **Style drift between the two slots** — FLUX.2-dev and Qwen-Image read the same prompt differently, so winners mixing both models look like two games | high | one kernel for both slots; every followup and edit made by FLUX.2-dev with the winner as reference; the art bible (R3-01), palette quantisation in ingest (R3-02) and hand cleanup unify the result |
| **Repository growth** from committed winner PNGs (≈ 300 images of 1–3 MB) | medium | candidates stay git-ignored; only winners and followups are committed; the owner decides on Git LFS if the total gets large |
| **Texture memory** with detailed art (one 2048² page = 32 MiB with its image) | high | zone-grouped pages, residency, `keepPageImages` off, PNG-8, budgets set by R3-04 before R4/R5 produce art |
| **Bundle budget** (512 KB gzip, ~403 KB used before R1-05, ~376 KB after) | medium | the atlas manifest moved out of `app.js` (R1-05, −22 KB); new code stays lean |
| **Mechanical port misplaces frame-anchored values** | medium | units on every schema field (R1-03), a tool that refuses unclassified values, the first-visible-tick comparison test (R2-02) |
| **Golden churn** hides an unintended sim change | medium | R1 keeps goldens unchanged as proof; R2 re-blesses once with a full bot pass; each R5 zone re-blesses only its own zone |
| **Fix porting between `v1.x` and `master` gets painful** | certain after R2 | merge until R2-01, then cherry-pick code fixes only (§3.3) |
| **Scope creep in level expansion** | high | each zone step has fixed minimums; anything beyond them is a new step, not part of the zone's |
| **Palette cycling flickers** on full-colour art | high without the rule | reserved ramps and the near-miss scan (R3-03) |
| **720p TVs** get ×2 — fine. **960×540** would not have been | — | another reason 640×360 was chosen |

---

## 15. Appendix A — what is coupled to 384×216 today

(From the 2026-10-16 survey. Line numbers are as of `f82e183`.)

### A.1 Code

- **core:**
  - **config:** `config/index.ts:728-751` holds the constants.
  - **UI:** `ui/index.ts` `HUD_LAYOUT` `:1849-1890` and bars `:2248-2249` (73 draw calls).
  - **scenes** (`scenes/index.ts`, 224 draw calls, 159 uses of `CX = 192`): `CREDITS_TOP 216`, `CREDITS_STOP_Y 100`,
    the WARNING band 76/48, zone card 36, 384-wide rects, `OPTIONS_PANEL` 288×192, `PREVIEW_SHIP_X 232`, map
    `MAP_LEFT/TOP 40`, `MAP_BOTTOM 136`.
  - **behaviours:** `behaviors/index.ts` `laserLength 384` ×7, `HUNTER_EDGE 12`, `PLAYFIELD_H − 24`,
    `pullRadius 200`, 13 × `track(…, PLAYFIELD_H − margin)`.
  - **data and stage:** schema bounds in `data/index.ts`; terrain column formulas `data:5383`, `stage:1413`.
  - **cull and spawn edges:** in `bosses`, `enemies`, `bullets`, `weapons`, `powerups`, `player`,
    `stage/systems`, `world:1849`.
  - **campaign:** `data/campaign.ts` line caps.
- **render-pixi:** renderer defaults `:745-746`; `LAYER_EFFECT_ROWS 216`; `layer-effects:264`;
  `mode7:140-142,263-264`; `raster:134`; `effects:679,735`; `layers:304-307`; `sprites:277`; `particles:574`; debug
  `:1038,1083,1088` and `COL 6`/`ROW 10`.
- **shell:** `flight`, `showcase`, `fx-gallery`, `scene-view:162`, `memory:130-133`, `telemetry:160`, `debug:522`;
  boot passes no size (`boot:956`).
- **audio-web:** pan width (`engine:386`, `sfx:242`).
- **electron:** `window-state.ts`, `window-options.ts`.
- **scripts:** `tiled-import.mjs:76-82`, `store-assets.mjs:46-48`, `doc-screenshots.mjs:43-44,239`,
  `doc-images.mjs:353`.
- **Font metrics:** `pixel6x8.font.json` (cell 6×8, line 10, advance 6); menu line heights 11–14.

### A.2 Tests

- **Unit and integration:** 183 test files reference the playfield constants or literal 384/216; 63 reference
  8-px tiles.
- **e2e:**
  - 33 specs analyse screenshots; 25 hard-code the `3x+1` pixel mapping; the viewport is 1152×648;
  - 12 specs count exact placeholder colours (e.g. `zone-a.spec.ts:16`, `bullet-palette.spec.ts:17-25`,
    `raster.spec.ts:112`).
- **Replays:** 62 golden replays; 9 attract demos (+ example) with `internalWidth: 384` in their headers.
- **Playtest:** thresholds in `test/playtest/rules.ts:25-31` and `four-way-bot.ts:56-68`.

### A.3 Content

| Folder | Files | Pixel-valued fields (examples) |
|---|---|---|
| stages | 28 (~750 events) | `length`, camera `{x, speed}`, `checkpoints`, event `x`/`y`, heightfield `base`/`amp`/`period`, parallax `y`/`spacing`, raster `top`/`bottom`, `rowsTall`, `yTo` |
| enemies | 20 (145 entries, 28 bosses) | `hurtbox {hw, hh}`, `radius`, `params` speeds and amplitudes, boss `x`/`y`, part offsets |
| paths | 6 (18 paths, 146 points) | waypoints |
| patterns | 3 | `speed`, `accel` |
| player | 3 | speed levels, `hurtRadius`, terrain / pickup boxes, margins |
| weapons | 5 (43) | shot speeds, laser speed |
| fx | 2 (16 presets) | `speed`, `radius`, `gravity`, `dx`/`dy` |
| tilesets | 10 | `tileSize 8`, 8-entry column masks |
| campaign, rules, demos, audio, input, strings | — | no world pixels (demos carry the frame size in their header) |

### A.4 Art

438 sprites / 1,411 frames on one 1024² page (zone-split since R1-05: a 1024×512 `common` page and nine zone pages, 120 KB); 49 pixel-map sources and 26 procedural generators; 195-glyph font;
9 tilesets × 20 tiles; ~145 doc plates and 18 doc screenshots; store icons (Tizen 512×423, Electron 512²,
webOS 80² / 130²).

---

## 16. Appendix B — the ×1.5 port table

**Code constants (world pixels → ×1.5):**

| Constant | Where | v1 | v2 |
|---|---|---|---|
| `WORLD_SCALE` | config | — (R2-02.P0 prepared it at 1) | **3/2** — every world value this table ports reads `v1 × WORLD_SCALE` |
| `WORLD_TOP_PAD` | config | — (prepared at 0) | **36** — the top-edge map `y′ = 1.5·y + 36`; a negative `y` takes the scale alone |
| `BULLET_CULL_MARGIN` / `SHOT_CULL_MARGIN` | bullets / weapons | 16 | 24 |
| `MAX_BULLET_SPEED` | bullets | 16 | 24 |
| `LASER_WIDTH`, `BENDING_LASER_WIDTH` | bullets | 6 | 9 |
| bending laser speed / length | bullets | 3 / 48 | 4.5 / 72 |
| `GRAZE_MARGIN` | bullets | 7 | 10.5 |
| `POINT_ITEM_MAX_SPEED`, `POINT_ITEM_ACCEL` | bullets | 9, 0.35 | 13.5, 0.525 |
| `LASER_SEGMENT_LENGTH`, `RIPPLE_RING_WIDTH` | weapons | 8, 4 | 12, 6 |
| `ITEM_RADIUS`, `PICKUP_MAGNET_RANGE` / `SPEED`, `ITEM_CULL_MARGIN`, `COOP_EXTRA_OFFSET` | powerups | 5, 16 / 2, 32, 12 | 7.5, 24 / 3, 48, 18 |
| `OPTION_RADIUS`, `ROTATE_RADIUS` | options | 4, 20 / 40 | 6, 30 / 60 |
| `SNAKE_LINK` | options | 16 | 24 |
| `FORMATION_RETRACTED` / `FORMATION_SPREAD` (per element) | options | `number[]` | scaled element-wise by `WORLD_SCALE` — owner ruling RV3-F1; the A1 audit in `world-scale.test.ts` walks every frozen array export so none can hide (`UNSCALED_ARRAYS` empty) |
| `POD_RADIUS` | shields | 4 | 6 |
| `POD_ORBIT`, `ROTATE_POD_ORBIT` | shields | 13, 16 | 19.5, 24 |
| `CRAWL_STEP` | patterns | 8 | 12 |
| `DESPAWN_MARGIN`, `UNSEEN_MARGIN` / `GHOST_MARGIN`, `CARRIED_OPTION_SPACING` | enemies | 32, 128, 10 | 48, 192, 15 |
| `BLOCK_DESPAWN_MARGIN` | stage/systems | 128 | 192 |
| `GRID_MARGIN`, `DEFAULT_GRID_CELL_SIZE` | world / collision | 64, 32 | 96, 48 |
| black hole `RADIUS`, `CORE`, `PULL`, enemy pull, `DRIFT`, `THROW_X` | blackhole | 88, 10, 2, 1, 0.25, 48 | 132, 15, 3, 1.5, 0.375, 72 |
| `ENTER_START_X`, `ENTER_END_X`, `LEAVE_MAX_SPEED` | player | −24, 64, 8 | −36, 96, 12 |
| `LEAVE_ACCELERATION`, `LEAVE_END_X` | player | 0.125, `PLAYFIELD_W + 32` | 0.1875; edge stays, margin ×k → `PLAYFIELD_W + 48` |
| `BOSS_ENTRY_MARGIN` / `BOSS_FIRE_MARGIN` | bosses | 8 | 12 |
| `BOSS_REST_X`, `CHAIN_SPREAD` | bosses | `PLAYFIELD_W + 40`, 8 | edge stays, margin ×k → `PLAYFIELD_W + 60`; 12 |
| `BOSS_SKIP_LEAD` | debug | 96 | 144 |
| `HUNTER_EDGE` (module-private), the ram's inside clamp | behaviors | 12, `PLAYFIELD_H − 24` | 18, `PLAYFIELD_H − 36` |
| `DEFAULT_BOSS_X` / `DEFAULT_BOSS_Y` | data | 296 / 100 | frame-anchored: right edge − 132 / playfield centre (168) |
| `DEFAULT_SPAWN_SCREEN_X`, `DEFAULT_BLOCK_SCREEN_X` | enemies / data | `W + 16`, 400 | frame-anchored: `PLAYFIELD_W + 24`. A block's `x` and `screenX` port **together** (R1-03: `x + screenX` is its world left edge, ×1.5; `x′ = 1.5·(x + screenX) − screenX′`), and so do a ground enemy's (O11). Change these defaults only **after** R2-02's rescale run: the block pair reads its old default column from `DEFAULT_BLOCK_SCREEN_X` |
| the map's right end (`length + PLAYFIELD_W`, `stageMapWidth`) | stage | `length + 384` | frame-anchored: `length′ + 640` — not a constant, but a heightfield segment, region or RLE row reaching it ports to it (the rescale tool's map-end rule, R1-03) |
| `DEFAULT_BONUS_WINDOW` (a `ground` entrance's window) | data | 600 | 900 — scale it after the rescale run (its timeline check reads core's value ×k) |
| `DEFAULT_MODE7_FOG_DEPTH` (texels) | data | 96 | 144 |
| `DEFAULT_REVENGE_SPEED`, `DEFAULT_PATTERN_SPEED` | data / patterns | 1.25, 1 | 1.875, 1.5 |
| `TILE_SIZE` | data → config | 8 | 12 |
| `HUD_BAR_HEIGHT` | config | 8 | 12 |

**Unchanged:** `OPTION_SPACING` (ticks), every timer and telegraph, aim directions, `MAX_ENEMY_BULLETS` 512,
`MAX_ENEMIES` 64, `MAX_PLAYER_SHOTS` 96, `MAX_ITEMS` 32, `PARTICLE_CAPACITY` 256 (pool sizes are reviewed in R5,
not scaled), score values, and the drifts `FREE_OPTION_DRIFT` / `DIRECT_ITEM_DRIFT` 1.25 (wave-5 scout §0.5 —
left by decision, not oversight).

**O4's integer rounding (W5-3).** Odd integers turn fractional at ×1.5; the tool rounds each one and lists it —
195 entries in the port run. The hurtbox half-extents among them grow their box by at most 1 px — the entries
the W5-3 allowance names (F 6, G 7, H 6, I 1, ≈ 20 boxes, all ≤ 1 px over the interim art frame, from T4c's
`w5pre/hurtbox.mjs` tally as kept in [`decisions.md`](docs/v2-run/decisions.md) §3): the ships' terrain and
pickup boxes are that much larger, the schema was never relaxed, the
hurtbox-inside-art tests allow exactly the listed entries, and R2-04's retune should know the 1 px.

**Fractional results.** Values that become fractional (10.5, 7.5, 0.375) are fine in the simulation — it already
uses sub-pixel positions. Where a constant feeds a whole-pixel draw or a per-tick call, the zero-allocation rules
(`conventions.md`: whole-pixel arguments, fractions in typed arrays) are checked by the allocation guards.

---

## 17. Progress

| Step | Title | Status |
|---|---|---|
| — | `v1.x` branch created from `v1.0.0` and pushed | **done** (2026-10-16) |
| — | CI runs on pushes to `v1.x` (`ci.yml` on both branches) | **done** (2026-10-16) |
| — | One board issue per step on the GitHub project | **done** (2026-10-16) |
| — | R3-01's prompt-library update done early | **done** (2026-10-16) |
| — | R1 exit gate: every golden, demo and the v1 baseline (268 passed) plus master CI with all e2e shards, on `56f9ced` | **done** (2026-10-17) |
| R0-01 | Maintenance branch, version lines and CI | done (owner parts pending) — 2026-10-17 |
| R0-02 | The TV render benchmark (`bench:tv`) | done — 2026-10-17 (owner parts: the M7 runs, R0-03, landed 2026-10-20) |
| R0-03 | Run the benchmark on the M7s (owner; non-blocking) | done — 2026-10-20 (three campaigns, twelve sessions: the 1080p / 720p / 540p sweep in `tools/input-probe/results/2026-10-19-m7-bench-resolutions/`; the output size is the lever — a 720p backbuffer clears 640×360 on the M7, the WebGL 2 step only matters at 1080p, the decode page loads ≤ 1.56 s / ≤ 0.77 s; R2-03 sets its budgets from it) |
| R0-04 | The early art round: generate, pick, follow up | in progress — round 1 done and picked (91 image sets, 33 video sets); round 2 generated and reviewed by the owner, every request done (animation frames made in code); waiting for the owner's last review, then winners to `art-prompts/v2/winners/`; see `art-prompts/v2/STATUS.md` |
| R1-01 | Frame constants in core | done — 2026-10-17 |
| R1-02 | Frame constants in presentation, hosts, scripts and tests | done — 2026-10-17 |
| R1-03 | Units in the content schemas, and the rescale tool | done — 2026-10-17 |
| R1-04 | Tile size and font metrics are data | done — 2026-10-17 |
| R1-05 | Atlas paging and memory ready for detailed art | done (owner parts pending) — 2026-10-17 |
| R2-01 | Flip the frame; interim art; versioned saves and replays | done (owner parts pending) — 2026-10-19 |
| R2-02 | Port all content ×1.5 | done — 2026-10-20 (the port `8dbe858`: tool run 4,035 changes in 77 files, 0 unclassified, 0 errors plus the four hand fixes; `WORLD_SCALE` 3/2 / `WORLD_TOP_PAD` 36; the content-port gate gone U1 … U5, zero `CONTENT_PORT_PENDING`; 16 fingerprint segments re-pinned; `v2-port` landing checks zero-fail, the bot clears every zone — CELL VAULT green with the port — benchmarks improved, build +767 B gzip; `R2-02.RV` at zero on `b8b771f`; the goldens and demos stay v1 recordings by design until R2-03) |
| R2-03 | Golden replays, demos, e2e, docs images | done (owner eyeball pending: the 18 screens) — 2026-10-20 (e2e re-measured first in parallel, decision R2-N4 — E1 `1a5c487`, E2 `91cc585` (R1-04's 12-px browser check landed in `stage.spec.ts`), E3 `c3018db`, E4 found zero gates; the 44 gate-debt cases rewritten derived `bdd820a`, the churn debt paid at the fixture `e1e5374`, the bench budget module renamed `1096a59`; the one re-bless `d4ba9e8`: 62 goldens + 10 demos at 640×360 format 2 for three stated reasons (the port, P1's keys, P8's capacity), all four gates deleted, 9 narrative tests re-measured to recorded truth with 7 coverage rows filed for R5; doc images at the shipped scale `356e7b2`, 18 screens re-shot `9785da0`, store icons only `--check`ed (RR-3); the CJK figures stay on the v1 atlas, the live budgets R3-04's; exit battery green at `9785da0` — e2e 229/0-sk Chromium + 73/0 Firefox, zero gate skips left; `R2-03.RV` approved at zero) |
| R2-04 | First retune at the new scale (→ `v2.0.0-alpha.1`) | done (owner parts pending: the M7 `build:dev` play of zones A / D / I) — 2026-10-21 (shake **2 / 3 / 6** (R2-N7) and the zone-F retune re-blessed in the ONE bless `a285e0e` — 17 goldens + the zone-f demo, three byte-stable passes, content-DB 3 rows re-pinned, presentation + shell fingerprints GREEN unedited (RT-F1 adjudication), the 14 `PORT_EXEMPTIONS` disclosures fail-loud; popups 3 px / 8 ticks (`adcfe26`), CRT 0.24 / 0.408 at pitch 3 (`d5236e1`); P2 / P4 measured no change; Z1 / Z3 / Z4 measured the 23 A–C / G–I sections, the four bonus stages, the boss rush (warn→fight 330 / 360 t, gaps 335 t — identical v1↔v2) and all nine loop-2 remixes tick-preserved — empty patches; zone F was the one real retune (non-god `gameOver` 3 deaths → `stageClear` 1, RT-Z2 evidence); `2.0.0-alpha.1` across the workspace (`5aad58e`, R2-N8); `R2-04.RV` APPROVED (zero blockers; its one process finding — a missing fold row — appended in the run archive); the `v2.0.0-alpha.1` tag is the wave's closing action) |
| R3-01 | Art bible v2 and the prompt library update | done (owner parts pending) — 2026-10-17 |
| R3-02 | The ingest tool, with provenance | done (owner parts pending) — 2026-10-17 |
| R3-03 | Variants, palettes and tiles from real art | done — 2026-10-20 (V1 … V5 landed and reviewed: bullets and bend nodes native at the bible's sizes, `@p2` palette maps replacing the channel swap, the cycle scan enforcing the bible's §4.4, the tile mask rules with `tileset-masks.mjs --write`, the bullet recolour step proven frame-for-frame; the shipped real art exercises the same gates through R4; `R3-03.RV` at zero on `1dbe091`) |
| R3-04 | Atlas pages and memory with detailed art | done (owner parts pending) — 2026-10-20 (lazy residency built and made the prospective default; the stand-in generator, budget gate, `DIST_BUDGET` 16 MiB and the derived PNG caps; the TV bench decodes the stand-in pages and the render bench gained the "v2 zone stand-in" scenario; zone loads estimate ≈ 450–720 ms on the M7 vs the 2 s target; `R3-04.RV` approved at zero. Owner parts: the M7 runs of the stand-in decode pages and the context-loss round-trip, webOS hardware; open carry: the typed stale-atlas error F7 — see the step's As built) |
| R3-05 | AI art provenance and licences | done (owner parts pending) — 2026-10-17 |
| R3-06 | Stage art features for detailed levels | done — 2026-10-21 (decor list `back` / `front` (256 items, typed-array `StageDecorView`, camera cull ± 512 px), painted 256-px seam bands with `yFactor` / `frames` / `frameTicks` and the `Foreground` band below `EnemyBullets` — `LayerId` 14 → 17, decision RR-6, 13 render groups, fingerprints re-pinned for the re-layering (82 world rows presentation, 4 shell) with no drawn value changed, additive glows on enemies / boss parts / decor behind the per-DB `anyGlow` rule (an `s.str` name interned at load, unknown names fail `content:check`), the Tiled importer maps decor layers / objects / image layers (`034ecb3`), decor-range flies every feature as the v2-only dev range (`POST_V1_STAGES`, 7 bands, 12 decor entries, the glowing DECOR WARDEN, 8 procedural sprites with `decor.mjs` empty at scale 1 — the `fa4198` pin untouched), the render bench's decor scenario measures 14 draw calls of the 20 budget untouched (`b5afd39`); zero goldens moved by the step; `R3-06.RV` at zero after its two test-only fixes `2f2365d`) |
| R4-01 | Player crafts, Options, shields, player shots | done (owner parts pending: the M7 ships / Options / Force Field / black-hole looks) — 2026-10-21 (ships native `e90e17e`; five bank frames `4248f5b` with **the wave's one golden re-bless** — `p.bank` is hashed, 31 recordings, reason in the body; thrusters `f0942b1` presentation-only no bless; Options 4 frames `7b07886`, Force Field 45×36×8 `92b4b73`, pod / Reduce / Arm `1a55480`, shots `4a9602f` + `7de90ee`, black hole 48²×8 `b760dbb` — sync-time frames, no sim move; `A9` / `B4` VERIFIED-NO-OP at the closeout; `R4-01.RV` APPROVE zero findings) |
| R4-02 | Enemy bullets, lasers, items | done (owner parts pending: the `B4` readability sign-off on the 36 sheets) — 2026-10-21 (bullets and lasers unchanged — the `R3-03.V1` art already bible-complete, audit `d875eac` proves it; every item kind 4 glint frames `ba09e57`; the cancel point 4 spark stages `e1ed688` with its sanctioned two-golden re-bless (the field is hashed); `R4-02.RV` APPROVE, both minors doc rows) |
| R4-03 | Font, HUD and the UI kit | done (owner parts pending: the font legibility rows — ASCII / Spanish / katakana reader — and the HUD / kit looks) — 2026-10-21 (RR-2's 9×12 `pixel9x12` native font `3c8eca8`, all 195 glyphs hand-redrawn `2954930` `2fe757c` `450349b` `68a6fa8`, zero fingerprints moved; the HUD for 12-px bars `96c4e61` (boss bar `FRAME_W >> 2`, Direct pitch, micro script, `hud/life`); the kit's two-tone rim + slider `dcf6380`; cures `d65fcbf` `326ff03`) |
| R4-04 | FX and particles | done (owner parts pending: the fx-gallery feel) — 2026-10-21 (explosions 24² / 48² / 72² with the white flash cross and `"blend": "normal"` `693e6ac`, content-DB `fx` row re-pinned; spark / sparkle / debris / ring native `6805952`; presets measured no-change; **Decision (R5-D5): the pool of 256 holds** — bot peaks ≤ 100/256, D3 / D4 no-commit verdicts; `R4-04.RV` APPROVE true zero) |
| R4-05 | Title, front end, endings, store and doc images | done (owner parts pending: the title / endings / logo / screens eyeball rows, the GRAPHICS-plate decision, the optional trailer stays owner's) — 2026-10-21 (logo 330×54 `ffa083a`, title backdrop full-frame `73dcb6d` (native half-ship deviation), WARNING band + zone cards frame-derived `e7d379d`, five endings full-frame `9873156`, one-panel rule `bb153bc`, store icons on v2 art `d23fec0` (**RR-3 closed** — the icons moved once), docs plates + 18 screens re-shot `45739d8`, cure `b35cba4`; `R4-05.RV` APPROVE zero-code nits) |
| R5-01 | Zone A remaster: AZURE VERGE | done (owner parts pending: the `R5-01.S3` real-art drop after the FLUX decision, the M7 play and sign-off — decision R5-D7) — 2026-10-22 (the LAND `9d0b472`: zone A rebuilt to `docs/v2-run/designs/zone-a.md` — 21,000 px, 77 events, seven checkpoints, `terrain-azure` heightfields (R5-D3), the five new types + the azure-marshal captain, HALCYON BULWARK's twelve parts with the core centred at x 0 (the S4b adjudication: clear both plate and hull shadows, the feasible window (−8, +6]), the spires opened to the 48-px corridor law over design §3's 36-px gorges (S6b.2), the 34-entry item plan under the contract's new `directItemComposition` row (MF2 `1f3040c`); the 4-way bot clears in 293.4 s inside every 4-way window, the capacity check holds (peaks 12 ≤ 51 / 12 ≤ 24, R5-D5); the loop: `R5-01.RV`'s one critical cured by `R5-01.FIX1` `732bfe1`, the scoped re-review at zero; the 34-step weld in five attempts, three walls adjudicated pre-LAND — `a089adb` / `62ac4e5` / `f5ea466`; the LAND: 29 recordings re-blessed through the composite `--only zone-a,bonus-range`, three fingerprints re-pinned, groups re-derived 12+/2−, the scale-1 digest measured `fa419802… → 5c35219b…`, 13 plates, caps unraised; the battery at the pushed tip: integration 2,605 / zero failures, e2e 110 Chromium + 73 Firefox, core 385 / shell 77 files; the art is stand-in per R5-D6 until `S3`) |
| R5-02 | Zone B remaster: BRINE NEBULA | done (owner parts pending: the `R5-02.S3` real-art drop after the FLUX decision, the M7 play and sign-off — decision R5-D7) — 2026-10-22 (the LAND `1d3fd600`: zone B rebuilt to `docs/v2-run/designs/zone-b.md` — 20,400 px, 74 events, six checkpoints, the 6600 deep pan into the 286-px shaft corridor (the wave's first kit admit, MF6 `ca7c7b0a`), `terrain-reef-v2` + nine variants, the brine-mine (2.25 ring fold) and spume-skipper, the SPUME HERALD refit with two crown fins, GALVANIC MAW's ten parts (pods 20 / core 80, three spine turrets) on the 50/24 thresholds; the 4-way bot clears in 321.7 s; the weld ran three attempts — its step-33 stop made Ruling A's fold precedent, its step-34 stop produced the MF10 `66e54bcb` estimator cure; 3 recordings re-blessed through `--only zone-b,brine-grotto` (the grotto verified unchanged), groups 12+/1−, the digest `5c35219b… → 2e14bd20…` (moved 324), plates 2; the art is stand-in per R5-D6 until `S3`) |
| R5-03 | Zone C remaster: DUNE EXPANSE | done (owner parts pending: the `R5-03.S3` real-art drop after the FLUX decision, the M7 play and sign-off, the widow's 40–50 s design band vs the landed 21.9 s as a taste row — decision R5-D7) — 2026-10-22 (the LAND `247e39fb`: zone C rebuilt to `docs/v2-run/designs/zone-c.md` — 21,000 px, eight keys over eight sections with the 2.55 px/tick look-down dune-surf pass (admitted through the shared gate by shape, atomic with the land, both worlds proven), seven checkpoints, `terrain-dune-v2`, the one `DUNE_RAMP` cycle; the spine-burrower and dune-lance new, dust-devil retired to zero placements (the [6,8] floor taken exactly), the DUNE SCORPION on `captain.launcher`, SANDGRAVE WIDOW's eleven parts with the phase-3 fold 2.55 → 2.40 holding the 3.0 law (C5); the 4-way bot clears in 296.5 s, 0 deaths; MF7's reach law re-run green at the rebased tip; 3 recordings re-blessed, groups 10/2, the page grows `main-3` 1024×512, the digest `cbecdd2b… → 767900f6…` (moved 855), plates 2; the art is stand-in per R5-D6 until `S3`) |
| R5-04 | Zone D remaster: MAGMA DEEP | done (owner parts pending: the `R5-04.S3` real-art drop after the FLUX decision, the M7 play of the dive and sign-off — decision R5-D7) — 2026-10-22 (the LAND `927b137f`: zone D rebuilt to `docs/v2-run/designs/zone-d.md` — 21,150 px, the two-step dive y 186 → 432 (rowsTall 64, the Scope's re-derivation), six checkpoints, `terrain-magma-v2` + four variants, six parallax layers, 75 events, 43 capsule sources (36 unconditional), the §4 channel's branch regions, the 37-entry item plan; the slag-mine (10×10 lawful box) and magma-geode (four cinder-bats) new, slag-crawler rostered-unplaced; the OBSIDIAN CLAW on `captain.crab`; CINDER BASTION's 17 parts with the chain arms made destructible and the core to part index 1 — zone A's two-shadow law extended to a third shadow (the release-audit FIX; fight 17.1 → 14.0 s); MF7 `38b8c8a1` and MF8-c2 `e6f4760b` its briefed prerequisites, both routed reds cured not gated; the doctrine fold `d8cf901c` refounds the deepestPan pin on the dive (432, whole-core K=1 5,244 pre-lock); the 4-way bot clears in 318.5 s (no-god 317.6 s, 0 deaths); 4 recordings re-blessed, groups 10/2, the page crosses to 1024×512 (the wave's second), the digest `767900f6… → fe99d8a7…` (moved 765), plates 2; the art is stand-in per R5-D6 until `S3`) |
| R5-05 | Zone E remaster: TEMPEST RIDGE | done (owner parts pending: the `R5-05.S3` real-art drop after the FLUX decision, the M7 play and sign-off, the steed's landed heat vs the design's 40–50 s window as a taste row — decision R5-D7) — 2026-10-22 (the LAND `fe4cdae3`: zone E rebuilt to `docs/v2-run/designs/zone-e.md` — 21,000 px, seven keys with the 12,900 eye-of-the-storm dip to y 60 and the 15,600 gale lift, seven checkpoints, `terrain-ridge-v2` + ten variants, the ice-slab and lightbird new, 77 events, 38 capsule sources, the 31-entry item plan; THE STORM EYE's swirl ring ships as decor without a hurtbox (the entry-first hit law, RV MH2); SQUALL STEED's twelve parts on the §8 heat ladder verbatim; MF8-c1 `1030012f`'s 2.25 terminal-bolt fold (the thunderhead's needle, the wave's first master-side intentional-sim bless, superseded here) and MF10 `66e54bcb` its prerequisites; the 4-way bot clears in 311.8 s, no-god 341.4 s; the weld STOPped on the predicted memory wall before the lock, then 39/39; 3 recordings re-blessed, groups 12+/1−, the page's 1024×512 crossing the wave's first, the wave's first real shared-file merge (the tileset router), the digest `2e14bd20… → cbecdd2b…` (moved 342), plates 4; the art is stand-in per R5-D6 until `S3`) |
| R5-06 | Zone F remaster: CELL VAULT | done (owner parts pending: the `R5-06.S3` real-art drop after the FLUX decision, the M7 play of the descent and sign-off — decision R5-D7) — 2026-10-22 (the LAND `5319d732`: zone F rebuilt to `docs/v2-run/designs/zone-f.md` — 21,000 px, the k3 hold-descent into the sub-vault, the three gapless regrowing tissue-live seal walls at 11,040/11,700/12,360 lawful under MF5 `a0abbf0a` (this zone's own R1 STOP) and drilled live by the shipped bot, seven checkpoints, `terrain-vault-v2`, 85 events, 41 capsule sources, the 35-name item plan with the F6b composition row; the tissue-cyst and viral-dart new to the eight-sprite cap; the NUCLEUS WARDEN on shared captain art (zero new boss art); MANTLE REGENT's 19 parts, phases at 85/78/70, the six `regent-*` names kept for zone H's echo; the passage walls ship seven pairs (design-amendment ask on record); the 4-way bot clears in 331.1 s (no-god record case 135.2 s, identity green); 5 recordings re-blessed with the Arcade outcome heal (the death-tick pin softened to the count assertion, disclosed), groups 9/1 no page added, the digest `fe99d8a7… → 20a7b109…` (moved 347), plates 4; the art is stand-in per R5-D6 until `S3`) |
| R5-07 | Zone G remaster: PRISM LABYRINTH | done (owner parts pending: the `R5-07.S3` real-art drop after the FLUX decision (with it the core's pulse and the bands' 640 widths), the M7 play and sign-off, the §15 gallery windows and the mouth's volley difficulty as taste rows (wave 12) — decision R5-D7) — 2026-10-22 (the LAND `66122e87` on the MF11 `29137363` base: zone G rebuilt to `docs/v2-run/designs/zone-g.md` — 21,300 px over 56 rows, three diving keys, the four dy-96 crystal shutters by-shape-admitted (MF11; a premise pin — the god run clears over them), the two pinch seal bands MF5-open and band 2 drilled, the 1-based RLE cure `b61c63a0` (30 rows remapped, capsules 6 → 12), the §10 lining ≥ 48 px everywhere, `terrain-prism-v2` + four variants, 81 events, 33 capsule sources, the 37-entry item plan, deliberately no paths file and the patterns file byte-identical; the prism-shard / prism-glint / prisma new, the geode's child moved by the freeze law; the PRISM SENTINEL fought at 8,040 without a warning (P14 holds); FACET MONARCH's 20 parts, the emitters' 14×14 boxes, height 147 ≤ 202, the core proven reachable, 20-of-24 disclosed; the god bot clears in 315.4 s; the w11-G7 O1 ruling — the no-god case reports (gameOver 156.0 s, deaths at the gallery mouth), the identity law asserts, the §15 windows the owner's comment; 5 recordings re-blessed bit-identical across the two weld attempts, groups 11+/2−, `main-7` grows to 512×512 with no page added, the digest `20a7b109… → 7e6fc0e9…` (moved 410), plates 4; the art is stand-in per R5-D6 until `S3`) |
| R5-08 | Zone H remaster: IRON CITADEL | done (owner parts pending: the `R5-08.S3` real-art drop after the FLUX decision, the M7 play and sign-off, the Arcade recording's honest gameOver outcome and the bot's Arcade survival as taste rows — decision R5-D7) — 2026-10-22 (the LAND `a2d94928` on the MF15 `cd4bb68c` base: zone H rebuilt to `docs/v2-run/designs/zone-h.md` — 20,250 px, six sections (the gate's six plate slabs + plug doors, the void parade hall, the ten-piston hall, the ceilingless core run, the breathing throne), 103 events, eight keys, six checkpoints, `terrain-citadel-v2` with §9's four appended tiles, the fifth banner parallax band; the gate-sentry pair + iron-banner, seven new-by-sprite types inside rule 3's band; IRON SOVEREIGN at 18 parts, design §7's six-pod ring out-voted by the frozen release-audit law (R5-D10 class; option A, pods at four, height 168 ≤ 202, destroyables unmoved); the four parade echoes re-rigged from landed boss trees under the machine-asserted match law (8/5/5/14 parts, `echo-maw` byte-identical disclosed); the S6 capsule-window cure FIX1 (four in-window banner rows → spawn rows, each window §4's exact 3 — the literal option-1 engine-impossible, row `drop: null` suppresses only completion drops); the arcade golden asserts its RECORDED replay (FIX3, the F/G twin law; gameOver 5,632 t, deaths [4,113, 5,539], the rebalance cure rejected); the god bot clears in 324.5 s, score 130,390 (the FIX1 re-measure — the record line); weld STOP-1 cured law-side (MF15 + FIX3), restart-2 blessed 5 files digit-for-digit, groups +5/−1, the wave's one disclosed fold — interim digest `7e6fc0e9… → da5879b4…` (808 relocated, name set equal), fingerprints 117/13/3, plates 5, post-push 10,733 zero-red; the art is stand-in per R5-D6 until `S3`) |
| R5-09 | Zone I remaster: ABYSSAL THRONE | done (owner parts pending: the `R5-09.S3` real-art drop after the FLUX decision, the M7 play of the descent and sign-off, TH-11's no-warning placement and the bot's three no-god deaths as taste rows — decision R5-D7) — 2026-10-23 (the LAND `2d35a7a5`: zone I rebuilt to `docs/v2-run/designs/zone-i.md` — 20,400 px over 56 rows, six camera keys with three holds and the 312-px ascent, the shelf lip at rows 26–27 (x 156 → 12,300), the four coral punch columns and the two basalt buttresses, the void segment to base 0 past 12,300, `terrain-abyss-v2` (v1's twenty verbatim + coral + `abyss-glow`), the 320-px parallax joins (deepwall, vents, fore flakes — the S2 template law adjudicated over the design's 640, the D precedent), sixteen vent-glow decor, the ascent's `lines` raster, the R5-P.P7 six-colour `cycles` byte-identical (frozen), 77 events in six bands, 34 `directItems` (the v1 26 verbatim + an eight-colour boss-prep tail), remix 10; `abyss-crawler`, `stinger`, `deep-tender` new — eight new-by-sprite types at the v2 band's [6, 8] ceiling; **TH-11 THE TRENCH HERMIT**, the zone's first captain, on the ORBIT WARDEN's kit, no WARNING and no time limit (P14 keeps the skip law — the skip lands on the ARK's 19,650 warning alone); the **ABYSS ARK** at fourteen parts (was eleven) — the 720-px five-section keel, turret rows three-over-three with heading frames, the new deck pods (box → circle adjudication, the boxes-never-turn law), the heart 130 → 105 hp, intro 240 → 180, the raid widened −190 → +10 → −190; **THE HOLLOW KING** at eleven parts (was nine) — the new fin armour (16×10 hurtboxes), the maw 96 → 80, the lure 30 → 24, phase thresholds 54/24, the phase lists byte-identical, `angler-alloc`'s SETUP 40 → 30 disclosed; R5-D13's global 420-s ceiling rode the land: the god run measures **369.3 s** inside [240, 420], the 240-s floor untouched; the R5-09.FIX2 checkpoint re-seat 2,880 / 6,240 (the clear-spawn law collided with the lip and the dive floor — the law stood, the law-weakening option rejected priced) and the bless identity re-proven: four files digit-for-digit identical across the weld's two trees, drift 0.0 s; the boss skip run 51.4 s, 140,470 points, both ARK phases and all three king phases; the escape recording stands at 5,970 ticks, 4,500 points, the flag case; the no-god run records three deaths (contact 2,983 / terrain 6,000 / bullet 19,846), identity green — reported, not promised; four recordings re-blessed (god 46871372 → 2490693452, boss 2920641436 → 1288749321, escape 3347605274 → 2353493228, the demo 3902439478 → 2234731965), groups +10/−1, the wave's disclosed fold — interim digest `da5879b4… → 611190ef…` (471 relocated, name set equal, added 0, removed 0) — beside the two kit-census admits (`tilesetFramesAt`, `foreStages`), fingerprints 117/10/3, plates 6, post-push FULL 10,755 passed / 890 files zero-red, e2e chromium 100 + firefox 73, the campaign audit 68/68 held (its [180, 360] tripwire untripped), the v1-port `zone-i` rows drop under the remastered condition, disclosed; the art is stand-in per R5-D6 until `S3`) |
| R5-10 | Bonus stages, boss rush, loops, escape, dimension, ranges (→ `v2.0.0-beta.1`) | in progress — 2026-10-22 (wave 12's part 1 landed: `R5-10.T1` `cea1b20d` — the bonus stages re-laid, grotto and cache 2,700 → 5,400 px, the vault 2,400 → 4,200 px, the single 1.5 key forced by the live loop caps, every outcome law authored from the layouts (seconds 59–67 s, the cache's `lifeDelta ∈ [0, 1]`), 3 goldens blessed with the bonus-range pair byte-identical, `bonus-range` itself the verified check case, first `--only` list owning zero demo stages + first re-authored non-zone v1-baseline stage (→ MF13's bless guard and `REAUTHORED_STAGES` carve); `T3` `90a20a3a` — the dimension's six stand-ins native + five new names, parallax 1 → 3 bands (sky still index 0), decor + glows, mode7 rows held unedited, no sim field moved, 4 plates, RT-T3's floor Major cured as MF12 `c86ad478`; `T6` report-only (`w12-T6-report.md`) — dev ranges clean at the H tip, 118/118 art fields resolve, zero golden moved, add-never-retire held; the census cure MF14 `59d14ed8` rode the wave (master rode red through four SHAs — a layer-moving step now owes the shared-kit censuses); `T2` (the escape) and `T8` (linked pages) wait the zone-I wall and CARRY to wave 13 with part 2 (`T4`, `T5`, `T7`, `T9`); the S3 real-art drops all owner-gated, none landed; wave 13's docs agent sets it done (owner parts pending) and the `v2.0.0-beta.1` tag follows) |
| R6-01 | Balance and difficulty | not started |
| R6-02 | Performance and memory on the TV with the final art | not started |
| R6-03 | Docs, store refresh and the v2.0.0 release | not started |
| R6-04 | Graphics options: output resolution, renderer, and the recommended defaults (added 2026-10-20, decision W5-20; the page rides wave 9, the final-default audit rides R6-02's W13–W15 chain) | page landed — 2026-10-21 (decision W5-20, wave 9: the GRAPHICS options page, save format 4 and the boot knobs — `9f7ea14`…`46b722c` with cures `634e913`/`7d60515`/`8006dd0`, `RT-R604B` at zero; §11 and the CHANGELOG carry the record; the audit line rides wave 15's R6-02 chain) |

---

## 18. Execution waves for the ~10-agent run

Written 2026-10-18, when the run moved to the host **myadmin1** (opencode with Qwen 3.8 Flash agents, about 10 at
once; the driver prompt is [`prompt_resolution.md`](prompt_resolution.md)). It schedules **every step of §17 that is
not `done…`** — except R0-03's TV run (the owner's; its agent part is wave 15's `R0-03.A1`, when the logs exist)
and R0-04's owner parts — from Wave 0 to `v2.0.0`, in 16 waves.
This section holds the rules and one row per wave; the work orders — every subtask with its exact files, tests,
acceptance, token and traps — are in [`docs/v2-run/`](docs/v2-run/README.md), one file per wave (`wave-00.md` … `wave-15.md`), with the decisions in
[`docs/v2-run/decisions.md`](docs/v2-run/decisions.md). The step sections above stay the specification: where a
wave file and a step section disagree on *how* (order, lanes, tokens), the wave file wins; on *what* (scope,
acceptance), the step section wins — except the full-suite items (R2-03's acceptance, the R2-04 and R5-10 milestone
suites), which RUN-1 moves to wave 15's one full suite.

### 18.1 The rules of the run

- **Lanes come from file lists.** The re-plan scouts listed the files of every subtask. Subtasks with disjoint files
  run in parallel; subtasks that share a file run one after another in one lane. A wave runs at most **8 builders and
  2 review agents** at once; the re-check scouts (the driver's wave loop, step 1) and the fix agents take builder
  slots, and the cap is 10 agents in all. When a lane ends, the next queued lane or a listed filler starts.
- **Tokens** name who may change a hot or a derived file ([`docs/v2-run/README.md`](docs/v2-run/README.md) § Tokens):
  work-time tokens (one lane edits `behaviors/index.ts`, `scenes/index.ts`, `content.test.ts`, …) and push-time
  tokens (GOLDEN, FINGERPRINTS, GROUPS, DOCS-IMAGES, STORE, LAND, GLOBAL). Every push that regenerates a derived file
  holds the **land lock** (`/tmp/shmup-cup-land.lock`) from the fetch to the push and **regenerates, never merges**
  a derived file.
- **Push protocol:** explicit `git add`, `git fetch origin && git rebase origin/master`, the targeted tests again if
  the rebase touched the agent's files, `git push origin HEAD:master`; on a rejection, repeat from the fetch (at most
  5 times, then report). Straight to `master`: no
  branch is pushed, no pull request is opened, nothing goes to `v1.x`. In wave 4 nobody else pushes while the port
  commit is verified (the PORT window).
- **Review loops:** every subtask that pushed is reviewed; a finding goes to a fix agent; then a **new** review agent
  looks again; the loop ends when a review reports zero findings, nits included. Work on a lane worktree's local
  branch is reviewed on the branch, before its LAND (the fixer commits on the same branch); waves 13 and 14 split such
  a subtask into two agent turns around that review (turn 1 commits and stops; turn 2, a new agent, runs the LAND).
  The on-demand fixes have ids and reviews of their own: a timeout fix `R5-0n.TO` → `R5-0n.TO.RV` (wave 11 rule 13)
  and a zone fix `R5-0n.ZFIX<n>` → `R5-0n.ZFIX<n>.RV` (wave 13 rule 1).
- **Docs:** builders never edit docs unless their block's **Files** list names the file (a **DOCS-IMAGES** holder's
  `docs/images/**`, `R2-02.R`'s `content/*/README.md`, the zone designers' `docs/v2-run/designs/zone-<x>.md`,
  `R5-P.LAND`'s helper — README rule 7); otherwise they list their docs needs in their report. Each wave ends with its docs item
  (waves 7 and 13 then cut their pre-release tag, below): one docs agent holds `plan_resolution.md` and `CHANGELOG.md` (the As built notes, §1's decisions, the §17 rows; the
  orchestrator then runs `python3 .claude/plan_board_v2.py` in the main checkout), and further docs agents with
  disjoint files may run beside it.
- **Tests run locally on myadmin1**, targeted: `VITEST_MAX_WORKERS=6` per agent; e2e only through
  `docs/v2-run/helpers/e2e-batch.sh` under `/tmp/shmup-cup-e2e.lock` (one batch at a time on the host, at most two
  agents of a wave doing e2e); `pnpm docs:screens` and single bench files under the same lock. **Nobody waits for
  GitHub CI**; a wave's close may look at it.
- **The one full suite runs at the end of the run** (wave 15): `pnpm test`, `pnpm test:e2e`, the whole `pnpm bench`
  with the soak, every golden and demo, the image and icon checks. It updates whatever tracks the changes, with the
  reasons. Deferred to it: R2-03's full definition-of-done suite, the milestone suites of R2-04 and R5-10, the soak.
  The pre-release tags `v2.0.0-alpha.1` and `v2.0.0-beta.1` are their wave's **last** action, without a full suite
  (RUN-1): after the targeted exit check and once every review and the docs item are at zero, the orchestrator writes
  the full SHA of `origin/master` at that moment to `RUN_DIR/w07-tag.txt` (`w13-tag.txt`) and runs
  `gh release create … --target "$(cat …)"` from the main checkout — never on the version bump's own commit. That
  SHA must be a commit the exit's targeted checks ran on; if `origin/master` moved since, they run again on it first
  (wave 7's Exit check 3, wave 13's rule 4).
- **Owner-only work never blocks a wave.** Each wave file lists its Manual (owner) items; agents build the tools and
  keep the interim art.
- **The agents:** a blank reply is answered with `continue`, up to 10 times, before the agent is replaced; every
  agent is told that near the end of its task it should finish rather than compress its context; an agent whose
  context gets high finishes its current edit, pushes what is consistent (in a lane worktree or a patch subtask:
  commits it locally) and returns an exact LEFT TO DO list, which a **fresh** agent with the same file ownership
  finishes — the old agent is not resumed.

### 18.2 The waves

*Lanes / agents* counts the builder lanes (≤ 8 at once) and the review slots (2). *e2e* names the agents doing e2e
work (≤ 2 per wave). Ids are `<step>.<subtask>` ([`docs/v2-run/README.md`](docs/v2-run/README.md) § Subtask ids).

| Wave | Steps | Lanes / agents | Tokens | e2e | Gate to start | Exit |
|---|---|---|---|---|---|---|
| **W00** | R2-01's review loops | the orchestrator before the hand-off: C5 review 2 → C5 fix 2 (`c67c7c9`, which also fixed the CI e2e shard-1 triage and the `flight.spec.ts:114` flake) → C5 review 3 (with the full Chromium e2e on myadmin1) → fix → new review, to zero | — | the triage; C5 review 4 | — | closed — the C5 loop reached zero findings, nits included, at reviews 5 and 6 (2026-10-19, `r2-01C5-review5.md`; the full Chromium e2e 149/78/0, zero flaky); the orchestrator closed the wave before the hand-off, so nothing became `R2-01.F1` in W01 |
| **W01** | R2-01 docs pass; R2-02 opening | 8: `R2-01.D1` … `D7` (seven docs agents, disjoint files), `R2-02.P0 → P1`; `R2-01.F1` first if open; + 2 reviews | PLAN (D1), CORE-CONFIG and E2E-MIRROR (P0), KIT (P1) | `R2-01.F1` and `R2-01.F1.RV` only, one after the other | W00 closed, or its open item handed over as `R2-01.F1` | docs review at zero; §17 R2-01 done (owner parts pending); the F1 loop (if it ran) at zero and `wave-00.md` closed; `WORLD_SCALE` = 1 (`WORLD_TOP_PAD` 0) and the two-scale kit `test/port-v2/` on master, neutral |
| **W02** | R2-02 prep A; R3-03 and R3-04 side lanes | 8: `W6 → W7`, `T0 → A1 → T4b`, `W2`, `W1 → T4c`, `W3 → W5`, `W4 → T4a`, `R3-03.V1 → V3`, `R3-04.M3a → … → M3e`; + 2 reviews, then `R2-02.RV-A2` | BEHAVIOR, DATA-INDEX, RP-BARREL and SHELL-BARREL (M3) | V1, M3d / M3e | W01 exit | prep A on master, reviewed and neutral (fingerprints unedited); RV-A2's failure lists written; V1 on master |
| **W03** | R2-02 prep B | 8: `T1a → T2c`, `T1b → T2d`, `T1c → T2e`, `T1d → T1e`, `T2a`, `T2b`, `T3`, one side lane (an R3 carry-over or the filler `R3-03.V2a`); then `R2-02.E0`; + a fix agent `R2-02.prepB.FIX<n>` on demand (rule "Your list": `other.txt`'s unowned lines, a builder slot); + 2 reviews | CONTENT-TEST (T2a), BOT (T2b), KIT (T3) | E0, M3* | W02 exit | every test pin and the v2-port comparison green under the kit; E0: zero e2e failures under the kit, master unchanged |
| **W04** | R2-02 barrier and port; R3-03 and R3-04 side lanes; R0-04's agent parts | `R2-02.RV-pre` (the barrier) → `R2-02.S` alone; side lanes `V2a → V5`, `V2b → V4a → V4b`, `M1a → M1b → M2a → M2b`, `M4a → M4b`, carry-overs, `R0-04.W2`, `R0-04.W1` (owner-gated), optional `R3-04.M1c` | the PORT window; S: content, CORE-CONFIG, BEHAVIOR, KIT, FP; RP-BARREL, SHELL-BARREL (the M3 carry-over) | S, M3* | W03 exit (every prep subtask reviewed to zero, T3's findings folded into `handfix.patch`); `R2-02.RV-pre` is this wave's own barrier before `R2-02.S` (Lanes cell) | the port commit on master; `rescale --factor 1 --dry-run` 0 / 0 / 0; S's verify list green; every side-lane push reviewed to zero or carried over into W05 |
| **W05** | R2-02 after the port; R3-03 and R3-04 close | 8: `U1`, `U2`, `U3`, `U4 → R3-03.V4c`, `R`, `B → EF`, `U5`, `Z-*` (red zones only), R3 left-overs; + 2 reviews (`R2-02.RV`, `R3-03.RV`, `R3-04.RV`) | CONTENT-TEST (U2), FP (Z-*), CORE-CONFIG (U5, a comment) | B → EF; pass 2: a Z, an M3 carry-over or `R3-04.RV` | W04 exit | the port gates gone (the docblock mentions in `stale.ts` / `gates.ts` and `R2-02.T4b`'s two rescale-test warning comments stay); the expected skips re-derived from a full-suite run at the port (the old 286 = 239 + 41 + 6 does not reproduce: `GOLDENS_STALE` skips 223 in 4 files, not 239 — 260 skips across the 7 `test/golden` files, the extra 37 from the v1-baseline suites' own frame gate; the 41 frame `runIf` leg is not countable from `test/golden`), plus `R2-02.T4b`'s 6 retired cases (or T4b's own number if its report gives another); step reviews at zero; docs `W05.DOCS-A` … `F`; §17 R2-02, R3-03, R3-04 done (owner parts pending where the step has some) |
| **W06** | R2-03; R5's stable hash keys and capacity; R5's first test splits | 8: `E1 → E2`, `E3 → E4`, `I1`, `R5-P.P1 → P8`, `R5-P.P2a → P2b → P6`, `R5-P.P5c → P9`, then `G1`, `I3`, `G2` (optional — it re-pins the presentation fingerprint's attract walk), `R2-03.V`; + 2 reviews | GOLDEN + FP (G1, one commit), FP (P1: content-DB; P8: only the table of a fingerprint that really moved; G2: presentation), DATA-INDEX (P1, P8), CORE-CONFIG (P1, a barrel export only), DOCS-IMAGES (I1, I3), CONTENT-TEST (P2a → P2b → P6), the repo allow-list (P9, wave rule 6) | E1 / E2, E3 / E4, then G1 and V (batches A, B, C, F, and every other batch with a spec E1–E4 or G1 edited); P8's stress bench and I3's `docs:screens` run under the e2e lock and do not count toward the two | W05 code exit, incl. `R3-03.RV` and `R3-04.RV` at zero | goldens and demos re-blessed once, with reasons; every e2e gate removed; content-order-independent hashes; docs `W06.DOCS-A` … `D`; §17 R2-03 done |
| **W07** | R2-04; R3-06; R4's prep | 8: `R2-04.F1 → P2 → G → REL`, `R2-04.P1 → P3 → P4`, `Z1 → Z3`, `Z2 → Z4`, `R3-06.L1 → L2 → L4 → L6`, `L5 → L3 → L7`, `R4-P.P1 → P2`, `R4-P.P3 → P4`; + 2 reviews | GOLDEN (`R2-04.G`), FP (`R2-04.P2`, `R2-04.G`, `R3-06.L1` — the content-DB `examples` only —, `R3-06.L2`, `L4`, `L6`, `R4-P.P1` — the credits line only —), DATA-INDEX (the `R3-06.L1` lane), the core barrel (CORE-CONFIG: `R3-06.L2`, then `L4`), RP-BARREL (`R3-06.L3`), `layer-effects.ts` (`R2-04.P4`, then `R3-06.L3`), `test/scripts/assets/pipeline-edge.test.ts` (`R4-P.P1`, then `R4-P.P3`; wave rule 10), the registry `scripts/assets/procedural/index.mjs` and `content/campaign/main.campaign.json` (`R4-P.P1`; the campaign file for the credits only) | `R2-04.P3` and `R3-06.L2` first, then `R3-06.L6`, `R2-04.G` last | W06 exit | the retune re-blessed with reasons; the `2.0.0-alpha.1` version line; the decor layers; the RR-1 pipeline; docs `W07.DOCS-A` … `E`; §17 R2-04, R3-06 done; **last**, the pre-release tag `v2.0.0-alpha.1` on `origin/master` once every review and the docs item are at zero (its SHA in `RUN_DIR/w07-tag.txt`, a commit Exit check 2 ran on — Exit check 3) |
| **W08** | R4-01 … R4-05, all but the integrators | 8: ships `A1a → A1b → A2`; scenes `E3 → E4 → C7 → E2 → E1`; HUD and kit `C5 → C6`; `A3 → B2 → A4`; `A5 → A7 → A6`; the font `C1 → … → C4b`; `A8 → B1 → B3`; FX `D1 → … → D4`; fillers: the zone designs; + 2 reviews | GOLDEN (A1b, B3), FP, SCENES, UI-FILE, STRINGS, POWERUPS, E2E-MIRROR, DOCS-IMAGES (A1a, A6: their own folders), DATA-INDEX (A2; also `DEFAULT_PLAYER_SHIP` in `core/player`), CORE-CONFIG (C1, then A3) | the ships and HUD lanes, then scenes; at the end `W08.E2E` (batches A, C without `boss`, D, E without `flight` / `ship-select` / `weapon-select`, G and F, plus `enemies` and `coop-gamepad`) | W07 exit | all on master and reviewed; the scale-1 digest pin unchanged; the origin report at 0 failures; `W08.E2E` green |
| **W09** | R4's integrators; R5 prep; the R5 designs; R6-04 (the GRAPHICS options page, decision W5-20) | 8: `A9 → B4` (A9 edits `powerups.spec.ts`; B4 only re-runs it), `E5 → E6`, `R5-P.P4 → P5a1 → P5a2`, `R5-P.P3 → P10 → LAND`, `R5-P.P5e`, `R6-04` (lane 6 of the glance), the designs `R5-P.D-A` … `D-I` fill the free slots in order; + 2 reviews (one is the design review) | DOCS-IMAGES (A9, B4: their own folders; E6: all), STORE (E5), FP (P10; R6-04's sanctioned re-pin, the two serialise on the land lock), GOLDEN (`R5-P.P3`, verify only), SCENES, STRINGS and CORE-CONFIG (R6-04, work-time) | A9 / B4, then R6-04's spec run and E6's screens on the freed passes | W08 exit | R4 complete; the split `vitest list` comparisons match, apart from each block's allowed differences; `land-zone.sh` tested; designs reviewed to zero; R6-04's page on master with its loop at zero (E6 shoots the final Options screen); docs `W09.DOCS-A` … `E`; §17 R4-01 … R4-05 done (owner parts pending), R6-04 the page landed (its audit line closes in wave 15's R6-02 chain) |
| **W10** | R5 prep 2; the zones' stand-in art; the zone-A pilot | 8: `R5-P.P7`, `R5-P.P12 → P13 → P14`, `R5-P.P5d` (after P7's review is at zero), zone A `S2 → S4a → … → S6b → S7` (LAND), `R5-03.S2`, then the S2s of B, D, E, F, G, H, I; + the `R5-01.TO` timeout fix on demand (`R5-01.S6`'s Traps: a builder slot, while zone A's lane waits); + 2 reviews | BOT (`R5-P.P12`, for the whole wave), GLOBAL (`R5-P.P12`, only for its fallback re-bless), CONTENT-TEST (`R5-P.P13`), FINGERPRINTS and GOLDEN (`R5-P.P14`, inside the land lock), FP (`R5-P.P7`; `R5-01.S2` — the credits line only), the registry `scripts/assets/procedural/index.mjs` and `content/campaign/main.campaign.json` (`R5-01.S2`, work-time, the credits only), LAND (zone A, `R5-01.S7`) | pass 1: `R5-P.P7`'s pair-spec batch (only if a ramp changed), then P5d; pass 2: zone A | W09 exit | every S2 on master; zone A landed first, with only its own goldens and `bonus-range`'s moved; docs; §17 R5-01 done (owner parts pending) |
| **W11** | R5-02 … R5-07, R5-09; zone H's first half | 8: zones B, C, D, E, F, G, I (local branches, one worktree each) and zone H `S4a → S4b → S5a → S5b` (no echo change); + `R5-0n.TO` timeout fixes on demand (rule 13: a builder slot, while its zone's lane waits); + 2 reviews | LAND (one at a time; B, D and F before H's echoes) | two passes for the wave: each zone's S6, each post-LAND check's e2e run and each RV's re-run of the spec (when the branch changed after S6), in lane order | W10 exit | seven zones landed with their post-LAND checks; zone H's S4a … S5b on its branch; docs `W11.DOCS-A` … `E`; their §17 rows done (owner parts pending), R5-08 in progress |
| **W12** | R5-08; R5-10 part 1; the real-art drops | `R5-08.S4c → S6 → RV → S7` (+ `R5-08.TO` on demand, wave 12 rule 1), `R5-10.T1`, `T2 → T8`, `T3`, `T6`, up to two `S3` drops (owner-gated); + 2 reviews | LAND (H, T1, T2), GROUPS (T8; the shell memory module work-time), DOCS-IMAGES (T3: its four plates; the S3 drops; + LAND if a frame count moves), FP (T3 — always: the content-DB table re-pins with its content edits, the presentation and shell tables only when a new name shifts ids; `R5-10.T6`, only if a content file changed), the registry `scripts/assets/procedural/index.mjs` and `content/campaign/main.campaign.json` (T2, work-time) | two passes, handed out in this order: `R5-08.S6` (zone H), `R5-10.T3`, `R5-10.T8`, then the S3 drops; a post-LAND check's e2e run and an RV's re-run of a spec take a pass too | W11 exit | H landed; the bonus stages, the escape, the dimension, the ranges and the linked pages done; docs `W12.DOCS-A`, `B`; §17 R5-08 done (owner parts pending), R5-10 in progress |
| **W13** | R5-10 part 2; R6's opening | `R5-10.T4`, `T5`, `T7`, `T9`; `R6-01.B1 → B2 → B2.DOCS`; `R6-02.P1` (after T7), `P2`; zone fixes `R5-0n.ZFIX<n>` on demand (rule 1: a lane worktree `wt/fix-zone-<x>`, turn 1 → its `.RV` loop to zero → turn 2, the LAND); fillers: owner-ready `R5-0n.S3` drops; + 2 reviews | FP (T4), LAND (a zone fix's turn 2, only if one runs) | none, except a late `R5-0n.S3` drop's own zone spec (wave rule 5: one of the wave's two e2e agents); the benches run under the e2e lock and do not count | W12 exit | the `2.0.0-beta.1` version line; the balance report (committed by `R6-01.B2.DOCS`); R6-02.P1's re-measure and the TV capture kit reported; docs `W13.DOCS-A` … `C`; §17 R5-10 done (owner parts pending), R6-01 and R6-02 in progress; **last**, the pre-release tag `v2.0.0-beta.1` on `origin/master` once every review and the docs item are at zero (its SHA in `RUN_DIR/w13-tag.txt`, with exit checks 2 and 3 run again on it — rule 4, Exit check 5) |
| **W14** | R6-01 balance | up to 8 of `R6-01.B3a` … `B3i`, then `B4 → B5` alone; fillers: an owner-ready `R5-0n.S3` drop; + 2 reviews | LAND (B3x), GLOBAL and CORE-CONFIG (B4), SCENES and STRINGS ⇒ FP (B5, a normal push under the land lock) | none, except a late `R5-0n.S3` drop's own zone spec — one of the wave's two e2e agents (wave rule 6); R6-03.D6's Chromium run in W15 covers the zone specs | W13 exit | the nine zone passes LANDed, B4's global re-bless and B5 pushed (or B5's no-change report), each with its reason; docs `W14.DOCS-A`, `B`; §17 R6-01 done (owner parts pending) |
| **W15** | R6-02, R6-03, R0-03's agent part (if the owner's logs exist); **the one full suite** | `R0-03.A1` (only with the owner's logs) `→ R6-02.P3 → P4a … P4d` (only if a budget is missed), `R6-03.D3`, `D4`, `D1` = `W15.DOCS-A` (2.0.0 and the CHANGELOG `[2.0.0]` in one push; §17 at the release), `W15.DOCS-B`, `W15.DOCS-C`, then `R6-03.D6` (the full suite; `R6-03.D6.DOCS` before its last run if a fix changed a documented number), then `D7`, then `R6-03.D7.DOCS` (§17 R6-03 → done); + 2 reviews | STORE (D3), DOCS-IMAGES (D4), PLAN (D1, `R6-03.D6.DOCS` if it edits the plan or the CHANGELOG, then D7.DOCS), CORE-CONFIG (P4c), the render-pixi `layers` / `renderer` files, the shell boot and the TV boots (P4a → P4c → P4d, work-time); D6: all (the land lock for re-blesses) | P4a … P4d (only if they run) and a late drop's zone spec (rule 6) — two passes in all; then D6 alone; D4's `docs:screens` under the e2e lock (it does not count) | W14 exit; A1 and P3 also need the owner's capture logs (without them R0-03 and R6-02 stay `waiting on owner`) | the full suite green on myadmin1 and a CI look; every §17 row `done…` or `waiting on owner` with its reason (R0-03, R0-04 and R6-02 may wait), set by `W15.DOCS-A` (R6-03 by `R6-03.D7.DOCS`); the owner's OK; `gh release create v2.0.0` |

### 18.3 Open owner decisions and the defaults adopted

None blocks a wave; each default holds until the owner says otherwise. On 2026-10-18 the owner confirmed RR-1a,
RR-1b and Q-13 and decided Q-12 (one year); those rows say so. The full list, with where each one lands, is
[`docs/v2-run/decisions.md`](docs/v2-run/decisions.md); its built rows reach §1's register through each wave's docs
agent.

| ID | Default adopted |
|---|---|
| RUN-1 … RUN-14 | this schedule's rules: one full suite at the end of the run and pre-release tags after the targeted exits and the docs items; waves overlap only at their edges; the land lock; the e2e batches and passes; the run directory; home waves and fillers; R5's hash keys and capacity folded into R2-03; the R2-03 store check (RR-3); single bench files; R2-01.F1 only if wave 0 leaves it open; one worktree per zone lane; the committed LAND helper; several docs agents per wave; 6 Vitest workers per agent |
| W4-1 … W4-14 | built in R2-01; recorded in §1 by wave 1's docs agent |
| W5-1 … W5-19 | adopted (W5-6 done in R2-01; W5-9's beam half moot); the owner confirmed W5-2, W5-10 … W5-13, W5-15 and W5-16 on 2026-10-19 |
| R2-N1 … R2-N6, R2-N8 | the port kit committed and deleted by the port; the gate stub at the port; the e2e pre-gate; the e2e re-measure before the one re-bless; patches and one integrator in R2-04; literal v2 values for the 15 frame-unit defaults; `2.0.0-alpha.1` everywhere before the tag |
| R2-N7 | `ShakeMagnitude` 2 / 3 / 6 (from 1 / 2 / 4) until the owner's play session decides |
| RR-1 | v2 art beside v1 (`*.v2.sprite.json`, generator branches on `artScale`, a native font file); scale 1 stays the v1 art until a v2.0.x clean-up after the release (deferred from R6-03: it would move the whole pipeline right before the one full suite) |
| RR-1a, RR-1b (new in the re-plan; owner-confirmed 2026-10-18) | a v2-only sprite name is absent from the scale-1 build; frame counts beyond a v1 source exist only in the v2 art |
| RR-2 … RR-8 | the 9×12 font cell; the store icons on the v1 art until R4-05; no FLUX reference while FLUX is on hold; R4 after R2-03 (its re-blesses after R2-04); the new `LayerId`s; the stand-in uncalibrated on myadmin1; stand-in pages in the TV bench |
| R5-D1 … R5-D9, R6-D1 … R6-D3 | parallel zones that land one at a time; the v2 zone contract; `terrain-azure`; `MAX_BOSS_PARTS` 24; stand-ins for new names only; one LAND per zone; a 3-min caravan; the 2.0.0 bump with its CHANGELOG section in one push; `v2.0.0` only after the owner's OK |
| Q-1 … Q-13 | is picking finished; Git LFS for the winners; the FLUX licence; prompt-library edit 7; the FACET MONARCH label; v1.0.0's TV title overlap (no `v1.x` push without the owner); the HI-line rule; the crawl and credits durations; 1080p screenshots (O9); the "owner may confirm" rows (all confirmed 2026-10-19); the shake and spawn-row feel — each keeps its default until answered; Q-12 (new in the re-plan; decided by the owner 2026-10-18): security and crash fixes on `v1.x` for one year after v2.0.0, written by `W15.DOCS-C`; Q-13 (new in the re-plan; owner-confirmed 2026-10-18): the escape keeps `terrain-a`, `R5-10.T2` registers `escape.mjs` |
