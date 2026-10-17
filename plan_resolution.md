# Shmup Cup v2 — the 640×360 remaster plan

> **Status:** drafted 2026-10-16 — **0 of 37 steps done.** The `v1.x` maintenance branch exists (created from
> the `v1.0.0` tag, commit `f82e183`, and pushed to `origin`). Everything below happens on `master`, which from
> now on is the **v2** line.
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
  zone-grouped pages. Note that **one 2048² page is 32 MiB including its decoded image**, which is the whole of
  today's `TEXTURE_BUDGET_BYTES` (`packages/shell/src/memory/index.ts:93`).

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
| **Frame- or edge-anchored** (defined by "the right edge", "one playfield", "the screen centre") | **re-derive from the new frame**, never ×1.5 | spawn x 400 = right edge + 16 → `PLAYFIELD_W + 24`; `laserLength 384` = one screen width → `PLAYFIELD_W`; zone-d `yTo 200` = one playfield; `rowsTall 25` → 28; raster `top`/`bottom`; Mode-7 `horizon 100` / `bottom 200`; `DEFAULT_BOSS_Y 100` (centre); `CX = 192` |
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
- Zero allocation, determinism, the Chromium 68 floor, the bundle budget (`APP_JS_GZIP_BUDGET` 512 KB, ~403 KB
  used) and "original names, art and music only" all hold in every step.

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
| **R6** Balance, performance, release | R6-01 … R6-03 | difficulty and scoring retuned, on-device performance confirmed, docs and store assets refreshed, **v2.0.0** | final re-bless |

Dependencies: R0 ∥ R1 → R2 → R3 → R4 ∥ R5 (R5 zone steps need R3 and R4-01 … R4-03) → R6. **R0-02, R0-03 and R0-04
block nothing.** Two R3 steps do not wait for R2: **R3-01**'s prompt-library half is done (`b938d5a`) and its art bible
half depends on nothing; **R3-02** depends only on R3-01, and its output is staged until R2-01. R3-03 … R3-06 still
follow R2.

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
- **Manual (owner):** optionally protect `v1.x` (§3.5); optionally add this plan to the project board.
- **Refs:** §3 of this plan.

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
- **Manual (owner):** none in this step (the run is R0-03).
- **Refs:** `docs/dev/render-performance-review.md` §7 and F10; plan M3-02c, M3-02f; `docs/dev/input-probe.md`.

### R0-03 — Run the benchmark on the M7s and record the results (owner; non-blocking)

- **Goal:** real numbers for 384×216, 640×360 and 960×540 on the hardware, written down where future steps can
  read them.
- **Depends on:** R0-02. **Blocks:** nothing.
- **Scope (owner):**
  1. Start the log server on the desktop (`npm run log-server` in `tools/input-probe/`).
  2. Build with `VITE_REPORT_URL=http://<desktop-ip>:8787 pnpm bench:tv`, then package and install the bench
     widget.
  3. Run the full matrix on **both monitors**, once with WebGL 1 (shipped default) and once with WebGL 2
     (`localStorage['shmup-cup:gl']`).
  4. While the TVs are set up, also do v1's first install from `v1.x` and the M3-02c measurement table
     (`docs/client/outstanding-work.md` §1.1).
- **Scope (agent, afterwards):**
  - commit the raw logs to `tools/input-probe/results/<date>-m7-bench/`;
  - write `docs/dev/input-probe-results.md` **§12 "Resolution benchmark"**: the tables, the relative costs, and
    the verdict per size using the rules in §13;
  - set the v2 render budgets used by R3-04 and R6-02 from the 640×360 numbers;
  - record the 960×540 verdict as a note for after v2 (a possible desktop "HD" mode or a v3). It does not change
    this plan.
- **Acceptance:** §12 exists with numbers from both monitors; §13's decision table has been applied and its
  outcome written down; nothing else in the plan waits for it.

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
- **Acceptance:** a test stage at tile size 12 and a test font at 9×12 load, render (Node + e2e) and collide
  correctly; goldens unchanged at 8 / 6×8.

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
    are 12×12; anchors are scaled.
  - **Saves and replays** (§3.4): save migration 2 → 3 (v1 hi-score tables → `legacyScores`);
    `REPLAY_FORMAT_VERSION` and `RUN_REPLAY_FORMAT_VERSION` → 2, plus the header's frame size checked, so v1
    replays are refused with a clear message (a string id in `DEFAULT_UI_TEXT` and the three string tables).
  - **Hosts:** Electron `window.json` version bump and re-fit; CRT pitch re-checked at ×3 / ×2.
- **Acceptance:** boots in web, Tizen and webOS builds; title, menus and HUD lay out correctly at 640×360 (e2e
  screenshots analysed at the new viewport); a v1 save loads, keeps its options and archives its scores; a v1
  replay is refused. Goldens are expected to fail here and are re-blessed in R2-03.

### R2-02 — Port all content ×1.5

- **Goal:** every stage, enemy, boss, pattern, path, weapon, ship, fx preset and tileset works in the ×1.5 world.
- **Depends on:** R2-01, R1-03.
- **Scope:**
  - **Run `rescale --factor 1.5 --top-pad 36`** over `content/`: 28 stages (~750 events), 20 enemy files
    (145 entries, 28 bosses), 6 path files (146 points), 3 pattern files, 3 player files, 5 weapon files,
    2 fx files, 10 tilesets. Review the diff zone by zone.
  - **Hand-fix the frame-anchored values the tool flags** (§2.6): spawn x beyond the right edge, one-playfield
    pans (zone-d `yTo`, `rowsTall`), raster `top`/`bottom`, the Mode-7 `horizon`/`bottom` of the high-speed
    dimension, boss rest positions.
  - **Scale the code constants** in core (Appendix B: margins, radii, speeds, grid cell, black hole, player
    entry, bending lasers, magnet …).
  - **Scale the 4-way design rules and the bot:**
    - `test/playtest/rules.ts:25-31`: 2.0 → 3.0 px/tick, lane gap 16 → 24, column half-width 8 → 12;
    - the capsule window 900 → 1,350 (`content.test.ts:1035,1762`);
    - `four-way-bot.ts:56-68`: `BOT_X` 64 → 96, `LANE_HEIGHT` 16 → 24, `TERRAIN_AHEAD` 56 → 84;
    - `remote-strict.ts` counts ticks and is unaffected.
  - **The Tiled importer** at 12-px tiles and a 640 view.
- **Acceptance:**
  - `pnpm content:check` is green, including the 4-way rules at their new values;
  - the playtest bot clears every zone, bonus stage and the boss rush in god mode within its budgets;
  - every zone's camera travel time is within ±2 % of v1;
  - nothing spawns visibly on screen that spawned off screen in v1 (a test compares first-visible ticks of every
    spawn between a v1 and a v2 run of each zone, ±1 tick);
  - every enemy that enters from above the screen reaches the same place as in v1 (×1.5 + 36 px, within 2 px):
    the §2.6 top-edge fix-ups are complete.

### R2-03 — Golden replays, demos, e2e, docs images

- **Goal:** the test suite and the pictures describe the 640×360 game.
- **Depends on:** R2-02.
- **Scope:**
  - **Re-bless** the 62 golden replays (`pnpm golden:update`) and **re-record** the 9 attract demos
    (`content/demos/`), with the reason in the commit;
  - e2e at 1280×720 with the R1-02 helper; the 12 specs that count exact placeholder colours re-pointed at the
    interim art;
  - the headless render bench's 640×360 scenario becomes the default;
  - `pnpm docs:images`, `pnpm docs:screens` and `pnpm store:assets` regenerated (store screenshots 1920×1080 =
    640×360 × 3);
  - `docs/dev/*.md` that quote 384×216 (about 15 files, most in `api-reference.md` and
    `render-performance-review.md`) updated, with D19/D20 marked superseded by R-D1/R-D3.
- **Acceptance:** the full definition-of-done suite is green on `master`.

### R2-04 — First retune at the new scale

- **Goal:** fix what does not scale linearly, so the ported game *feels* like v1.
- **Depends on:** R2-03.
- **Scope:**
  - the +11 % / +12 % field of view means enemies are seen longer before they act — check every zone's opening
    of each section, and adjust spawn lead or density where the bot or the owner finds it noticeably easier;
  - screen-shake magnitudes (whole pixels: 1/2/3 → 2/3/4 or 2/3/5);
  - score-popup and particle speeds; the Mega Crash and black-hole visuals;
  - the CRT `light`/`full` look at pitch 3;
  - menu cursor auto-repeat untouched (ticks).
- **Acceptance:** goldens re-blessed with reasons; an owner play session finds no zone that "feels wrong" because
  of scale (notes in the step's As built list).
- **Manual (owner):** play zones A, D and I on the M7 in a `build:dev` bundle; watch TPF and RENDER on the overlay.
- **Milestone:** tag **`v2.0.0-alpha.1`** — "plays at 640×360, interim art".

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
      **reserved palette-cycle ramps** that no other pixel may come near (§9.3 below);
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
  (runbook: `docs/dev/art-generation-server.md`).

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
    - pages per zone (target: `common` ≤ 1 page + zone ≤ 2 pages);
    - texture MiB;
    - dist MB;
    - zone-load time ≤ 2 s on the M7 (estimate from the R0 bench's decode figure until measured).
- **Acceptance:** the stand-in set passes the new budgets in CI; the render bench gains a "v2 zone stand-in"
  scenario.

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

---

## 10. R4 — The shared art redo

Each step: art made per the bible (R3-01) through the ingest tool (R3-02) or by hand; old names kept where the
sprite's role is the same (no id reorder, no re-bless). New frames and names are added where the bible asks, and
then re-blessed with the reason.

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

### R4-04 — FX and particles

- **Scope:**
  - **Explosions:** small, medium, large and boss chains, with more frames.
  - **Small effects:** debris, sparks, clinks, cancel sparkles, the pickup ring, the muzzle flash.
  - **`content/fx` presets** retuned (speeds, radii, gravity already ×1.5; frame timing re-checked).
  - **Particle pool:** capacity (256) reviewed against the bench.
- **Acceptance:** the fx gallery (`?scene=fx-gallery`) shows every preset; allocation guards green.

### R4-05 — Title, front end, endings, store and doc images

- **Scope:**
  - **Title and front end:** the title screen and logo from the AI key art (`art-prompts/output/*/10-logo-title`);
    attract-mode cards, the WARNING sequence, zone cards.
  - **Ending scenes:** sprite scenes and epilogues redrawn (`ui/ending-*`, today 128×72 → full-frame scenes).
  - **Store and docs:** store listing assets and icons (`pnpm store:assets`), README banner, docs images and
    screenshots.
  - **Optional trailer:** a cut from the Wan 2.2 clips plus real gameplay capture.
- **Acceptance:** `pnpm store:assets --check` and `pnpm docs:images --check` are green with the new art.

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

### R5-01 — Zone A remaster: AZURE VERGE

- **Scope:** the zone template for zone A; expansion focus per the table. Also the engine capacity check below.

### R5-02 — Zone B remaster: BRINE NEBULA

- **Scope:** the zone template for zone B (and the `brine-grotto` bonus stage's art); expansion focus per the table.

### R5-03 — Zone C remaster: DUNE EXPANSE

- **Scope:** the zone template for zone C; expansion focus per the table.

### R5-04 — Zone D remaster: MAGMA DEEP

- **Scope:** the zone template for zone D; re-derive the dive's one-playfield pans for the 336-px playfield.

### R5-05 — Zone E remaster: TEMPEST RIDGE

- **Scope:** the zone template for zone E; expansion focus per the table.

### R5-06 — Zone F remaster: CELL VAULT

- **Scope:** the zone template for zone F; expansion focus per the table.

### R5-07 — Zone G remaster: PRISM LABYRINTH

- **Scope:** the zone template for zone G (and the `glimmer-cache` bonus stage's art); expansion focus per the table.

### R5-08 — Zone H remaster: IRON CITADEL

- **Scope:** the zone template for zone H; expansion focus per the table.

### R5-09 — Zone I remaster: ABYSSAL THRONE

- **Scope:** the zone template for zone I, plus the ending hook; expansion focus per the table.

### R5-10 — Bonus stages, boss rush, loops, escape, dimension and the ranges

- **Scope:** per the table's last row. The loop remixes and the caravan follow the remastered zones. The boss rush
  uses the new bosses. The test and dev ranges (`test-range`, `weapon-range`, `gimmick-range`, `raster-range`, …)
  get ported art only.
- **After R5-10:** tag **`v2.0.0-beta.1`**.

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
    resolution, CRT off by default, WebGL 2, PNG-8 everywhere.
- **Acceptance:** numbers recorded in `docs/dev/input-probe-results.md` §12; every budget met or a mitigation
  shipped and documented.

### R6-03 — Docs, store refresh and the v2.0.0 release

- **Scope:**
  - **Docs:** CHANGELOG `[2.0.0]`; README; `docs/client/` (controls, bestiary, arsenal — all with new images);
    `docs/client/outstanding-work.md` for v2.
  - **Store:** store listings and AI disclosures (R3-05).
  - **Release:** Tizen `config.xml` / webOS `appinfo.json` / Electron at 2.0.0, then the GitHub release
    **`v2.0.0`** (`gh release create v2.0.0 …`).
  - **v1.x's future:** write down what happens to `v1.x` now — security and crash fixes only for a stated time,
    then end of life.
- **Acceptance:** the full definition-of-done suite green; the release published.

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
| WebGL 2 clearly better (≥ 10 % synced render) | a step to make WebGL 2 the TV default with a WebGL 1 fallback |

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
| **Bundle budget** (512 KB gzip, ~403 KB used) | medium | the atlas manifest moves out of `app.js` (R1-05); new code stays lean |
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

438 sprites / 1,411 frames on one 1024² page; 49 pixel-map sources and 26 procedural generators; 195-glyph font;
9 tilesets × 20 tiles; ~145 doc plates and 18 doc screenshots; store icons (Tizen 512×423, Electron 512²,
webOS 80² / 130²).

---

## 16. Appendix B — the ×1.5 port table

**Code constants (world pixels → ×1.5):**

| Constant | Where | v1 | v2 |
|---|---|---|---|
| `BULLET_CULL_MARGIN` / `SHOT_CULL_MARGIN` | bullets / weapons | 16 | 24 |
| `MAX_BULLET_SPEED` | bullets | 16 | 24 |
| `LASER_WIDTH`, bending laser width | bullets | 6 | 9 |
| bending laser speed / length | bullets | 3 / 48 | 4.5 / 72 |
| `GRAZE_MARGIN` | bullets | 7 | 10.5 |
| `POINT_ITEM_MAX_SPEED` | bullets | 9 | 13.5 |
| `LASER_SEGMENT_LENGTH`, `RIPPLE_RING_WIDTH` | weapons | 8, 4 | 12, 6 |
| `ITEM_RADIUS`, `PICKUP_MAGNET_RANGE` / `SPEED`, `ITEM_CULL_MARGIN`, `COOP_EXTRA_OFFSET` | powerups | 5, 16 / 2, 32, 12 | 7.5, 24 / 3, 48, 18 |
| `OPTION_RADIUS`, `ROTATE_RADIUS` | options | 4, 20 / 40 | 6, 30 / 60 |
| `POD_RADIUS` | shields | 4 | 6 |
| `DESPAWN_MARGIN`, `UNSEEN_MARGIN` / `GHOST_MARGIN`, `CARRIED_OPTION_SPACING` | enemies | 32, 128, 10 | 48, 192, 15 |
| `BLOCK_DESPAWN_MARGIN` | stage/systems | 128 | 192 |
| `GRID_MARGIN`, `DEFAULT_GRID_CELL_SIZE` | world / collision | 64, 32 | 96, 48 |
| black hole `RADIUS`, `CORE`, `PULL`, enemy pull, `DRIFT`, `THROW_X` | blackhole | 88, 10, 2, 1, 0.25, 48 | 132, 15, 3, 1.5, 0.375, 72 |
| `ENTER_START_X`, `ENTER_END_X`, `LEAVE_MAX_SPEED` | player | −24, 64, 8 | −36, 96, 12 |
| `BOSS_ENTRY_MARGIN` / `BOSS_FIRE_MARGIN` | bosses | 8 | 12 |
| `DEFAULT_BOSS_X` / `DEFAULT_BOSS_Y` | data | 296 / 100 | frame-anchored: right edge − 132 / playfield centre (168) |
| `DEFAULT_SPAWN_SCREEN_X`, `DEFAULT_BLOCK_SCREEN_X` | enemies / data | `W + 16`, 400 | frame-anchored: `PLAYFIELD_W + 24` |
| `TILE_SIZE` | data → config | 8 | 12 |
| `HUD_BAR_HEIGHT` | config | 8 | 12 |

**Unchanged:** `OPTION_SPACING` (ticks), every timer and telegraph, aim directions, `MAX_ENEMY_BULLETS` 512,
`MAX_ENEMIES` 64, `MAX_PLAYER_SHOTS` 96, `MAX_ITEMS` 32, `PARTICLE_CAPACITY` 256 (pool sizes are reviewed in R5,
not scaled), score values.

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
| R0-01 | Maintenance branch, version lines and CI | not started |
| R0-02 | The TV render benchmark (`bench:tv`) | not started |
| R0-03 | Run the benchmark on the M7s (owner; non-blocking) | not started |
| R0-04 | The early art round: generate, pick, follow up | waiting on owner |
| R1-01 | Frame constants in core | not started |
| R1-02 | Frame constants in presentation, hosts, scripts and tests | not started |
| R1-03 | Units in the content schemas, and the rescale tool | not started |
| R1-04 | Tile size and font metrics are data | not started |
| R1-05 | Atlas paging and memory ready for detailed art | not started |
| R2-01 | Flip the frame; interim art; versioned saves and replays | not started |
| R2-02 | Port all content ×1.5 | not started |
| R2-03 | Golden replays, demos, e2e, docs images | not started |
| R2-04 | First retune at the new scale (→ `v2.0.0-alpha.1`) | not started |
| R3-01 | Art bible v2 and the prompt library update | not started |
| R3-02 | The ingest tool, with provenance | not started |
| R3-03 | Variants, palettes and tiles from real art | not started |
| R3-04 | Atlas pages and memory with detailed art | not started |
| R3-05 | AI art provenance and licences | not started |
| R3-06 | Stage art features for detailed levels | not started |
| R4-01 | Player crafts, Options, shields, player shots | not started |
| R4-02 | Enemy bullets, lasers, items | not started |
| R4-03 | Font, HUD and the UI kit | not started |
| R4-04 | FX and particles | not started |
| R4-05 | Title, front end, endings, store and doc images | not started |
| R5-01 | Zone A remaster: AZURE VERGE | not started |
| R5-02 | Zone B remaster: BRINE NEBULA | not started |
| R5-03 | Zone C remaster: DUNE EXPANSE | not started |
| R5-04 | Zone D remaster: MAGMA DEEP | not started |
| R5-05 | Zone E remaster: TEMPEST RIDGE | not started |
| R5-06 | Zone F remaster: CELL VAULT | not started |
| R5-07 | Zone G remaster: PRISM LABYRINTH | not started |
| R5-08 | Zone H remaster: IRON CITADEL | not started |
| R5-09 | Zone I remaster: ABYSSAL THRONE | not started |
| R5-10 | Bonus stages, boss rush, loops, escape, dimension, ranges (→ `v2.0.0-beta.1`) | not started |
| R6-01 | Balance and difficulty | not started |
| R6-02 | Performance and memory on the TV with the final art | not started |
| R6-03 | Docs, store refresh and the v2.0.0 release | not started |
