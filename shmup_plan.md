# Shmup Cup — Implementation Plan

> **Status:** **approved — executing** (since 2026-09-10). As of 2026-09-16: **M1 and M2 complete** (`1.0.0-rc.1`),
> **M3-01, M3-02 and M3-02b done** (the last of those tuned the game to the 2026-09-15 input-probe run), then
> **M3-02c … M3-02e** (the render-performance work in
> [`docs/dev/render-performance-review.md`](docs/dev/render-performance-review.md)) and M3-03 — 40 of 44 steps. Progress, the resume point and open risks are in
> [`shmup_progress.md`](shmup_progress.md); to continue, run [`shmup_prompt.md`](shmup_prompt.md) in a new session.
> Turns the feature catalog
> ([`shmup_feat.md`](shmup_feat.md)) into an ordered sequence of agent-sized build steps on top of the
> monorepo skeleton and the input probe that already exist.
>
> Companion docs: [`shmup_feat.md`](shmup_feat.md) (what), [`shmup_tech.md`](shmup_tech.md) (stack & Tizen facts),
> [`input_probe_spec.md`](input_probe_spec.md) (the hardware spike), [`docs/dev/repo-layout.md`](docs/dev/repo-layout.md)
> (where code lives), [`docs/dev/architecture.md`](docs/dev/architecture.md), [`docs/dev/conventions.md`](docs/dev/conventions.md).

## Table of contents

1. [Overview & how the plan is executed](#1-overview--how-the-plan-is-executed)
2. [Decisions](#2-decisions)
3. [Cross-cutting architecture this plan introduces](#3-cross-cutting-architecture-this-plan-introduces)
4. [Milestones at a glance](#4-milestones-at-a-glance)
5. [M1 — Playable vertical slice](#5-m1--playable-vertical-slice)
6. [M2 — Complete v1.0](#6-m2--complete-v10)
7. [M3 — Post-launch backlog](#7-m3--post-launch-backlog)
8. [Manual verification checklist (user)](#8-manual-verification-checklist-user)
9. [Feature coverage map](#9-feature-coverage-map)
10. [Risks & fallbacks](#10-risks--fallbacks)

---

## 1. Overview & how the plan is executed

### 1.1 Starting point (already on `master`)

- **Monorepo skeleton** (pnpm 12 + Turborepo, TypeScript 6.0 strict, ESLint 10 with `compat` for Chrome 69,
  Vitest 5, Vite 8, CI): `packages/core`, `packages/render-pixi`, `packages/audio-web`, `packages/input-web`,
  `apps/web`, `apps/tizen`, `apps/electron`, `content/`, `assets/`, `scripts/`, `test/`, `docs/`.
  Every planned system is a placeholder module `src/<module>/index.ts` with its intended API declared,
  a `moduleInfo` descriptor and a smoke test (see [`docs/dev/repo-layout.md`](docs/dev/repo-layout.md)).
- **Implemented today:** core `platform`, `input`, `config`, `loop`, `game`, `presentation`; input-web `keymap`,
  `keyboard`, `gamepad`, `web-input`; audio-web `web-audio`; render-pixi `renderer`, `viewport`, `test-pattern`,
  `palette`; the apps' `boot`, `platform`, `frame-loop`; the Tizen Chromium-69 IIFE build + `check-bundle.mjs`.
- **Input probe** (`tools/input-probe/`) — built and tested, **waiting to be run on the M7 monitors**. Its results
  feed the remote profile data introduced in M1-05 (no code change needed when they arrive). *Update 2026-09-15:* it
  ran on both monitors ([`docs/dev/input-probe-results.md`](docs/dev/input-probe-results.md)); some findings do need
  code (Home is only a `blur`, rAF jitter, release-only Back / Pause) — plan step **M3-02b**.

### 1.2 Per-step pipeline (automatic — do not add separate test/doc steps)

Each step below is executed by a chain of agents, **in document order**:

```
BUILD agent ──► REVIEW agent ──(findings?)──► FIX agent ──► REVIEW … until a review comes back clean
            ──► TEST agent  (writes/extends Vitest suites for the step, fixes bugs it finds)
            ──► DOCS agent  (docs/client/ player docs, docs/dev/ developer docs, complete TSDoc,
                             README.md status/links, package READMEs, api-reference.md)
```

Every agent follows the repo's git protocol: `git fetch origin && git rebase --autostash origin/master` first,
stages only the files it changed by explicit path, commits with the `Co-Authored-By` trailer, rebases and pushes
straight to `master` (no branches/PRs, no force-push). Because tests and docs are produced by later agents, the
**BUILD agent** still owns: working code, the minimum tests its acceptance criteria name, keeping CI green, and
TSDoc on the exports it adds (the DOCS agent completes it).

### 1.3 Definition of done (applies to every step, in addition to its own acceptance list)

1. `pnpm install --frozen-lockfile` works (if the step adds a dependency, the lockfile is updated and committed;
   only dependencies named in the step are allowed).
2. `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build` are green on Linux, Node 24.
   `pnpm build` includes the Tizen bundle check (one classic ES2018 IIFE script).
3. From M1-04 on, `pnpm test:e2e` (headless Chromium via Playwright) is green; from M1-19 on, golden replays are
   green or were **intentionally re-blessed** (`pnpm golden:update`) with the reason stated in the commit message.
4. Modules the step fills in have `moduleInfo.status` updated (`partial`/`implemented`), their docblock *Public API*
   section updated, and their exports added to the package's `src/index.ts`.
5. Rules from [`docs/dev/conventions.md`](docs/dev/conventions.md) hold: `@shmup/core` stays pure and deterministic;
   **zero allocations in per-tick and per-frame paths**; Chromium-69-safe APIs only in shipped code; no UI
   framework; original names/art/music only.
6. Nothing requires the Tizen CLI, `sdb`, signing, real hardware, or human-made art/music. Placeholder assets are
   generated by committed scripts or code. Scripts that package/deploy may be written but are never run.

### 1.4 Headless verification toolbox (what "verifiable headlessly" means here)

| Tool | Introduced | Used for |
|---|---|---|
| Vitest (Node) + `createHeadlessPlatform()` | exists | Unit/integration tests of every module; sim runs without DOM |
| Content validation test (`pnpm content:check`) | M1-02 | Every JSON file in `content/` validates, every id reference resolves |
| Asset pipeline tests + `pnpm assets` | M1-03 | Deterministic atlas/font output; every sprite name used by content exists |
| Allocation guard helper (`--expose-gc` heap-delta) | M1-06 | Per-tick code does not grow the heap |
| `pnpm test:e2e` (Playwright, headless Chromium, SwiftShader WebGL) | M1-04 | Web build and Tizen `dist/` (opened via `file://`) boot, render non-blank, no console errors |
| Headless playtest bot (4-way only) | M1-18 | Stages are completable with 4-way input; duration/item budgets |
| Golden replays + state hashes (`pnpm golden:update`) | M1-19 | Determinism; unintended sim changes fail CI |
| `pnpm bench` | M1-19 | ms/tick under max load, heap growth after warm-up |

### 1.5 Conventions every step follows

- **String ids → numeric indices at load.** Content refers to enemies, sprites, scripts, SFX, paths by string; the
  loader resolves them once to integers; nothing looks up strings per tick.
- **Presentation is fed only by read-only views + the event queue** (`core/events`). Systems never call audio or
  rendering code.
- **New sim-affecting options go into `GameConfig`** (replay-recorded). Presentation-only options go into
  `UserOptions` (save data).
- **Steps that change simulation behaviour after M1-19 re-bless golden replays in the same commit.**
- **Placeholder asset rule:** every new sprite/sound a step needs is added as source data (pixel map / procedural
  generator / synth parameters) under `assets/source/` or `content/audio/`, never as a hand-drawn binary.
- **New content folders** get a `README.md` and an `example.*.json` format sample (enforced by
  `test/integration/workspace-layout.test.ts`); new modules follow the module checklist in
  [`docs/dev/conventions.md`](docs/dev/conventions.md) (docblock sections, `moduleInfo`, `test/<module>/`).

---

## 2. Decisions

Open questions from `shmup_feat.md` §2 and §27 resolved with defaults (all revisitable; anything that affects the
simulation lives in `GameConfig` or content data, so changing it later is a data edit).

### 2.1 Design forks (`shmup_feat.md` §2, §27)

| # | Topic | Decision | Rationale |
|---|---|---|---|
| D1 | Power-up model | **Meter mode** (Gradius-style 7-slot meter, Type A) is the M1 core loop and the new default (`powerUpMode: 'meter'`). **Direct mode** (Darius-style items) ships in M2 as the second ship. | Meter + Options are the P0 signature; OK = "equip" is a rare, non-urgent press that works on the remote. |
| D2 | Auto Power-Up | Available from M1 as `GameConfig.autoPowerUp` (default **off**); one-button preset in M2. | Safety net for players who never want to press OK mid-stage. |
| D3 | Ship speed | Meter ship: 6 levels `1.5, 2.0, 2.5, 3.0, 3.5, 4.0` px/tick (data). Direct ship: fixed 2.25 px/tick with a 3-step Speed toggle (Ch−). | Slightly faster base than Gradius because 4-way movement needs more reach. |
| D4 | Diagonal speed | Diagonals are **normalized** (each axis × 0.7071, constant). | 8-way devices must not out-dodge the 4-way remote. |
| D5 | Options | Up to 4 trailing Options in M1; Snake/Formation/Rotate and the Option Hunter in M2. | Gradius signature, no button needed. |
| D6 | Death penalty | Default **Classic**: lose one power level (Option → Laser/Double → Missile → Speed), lose shield, keep meter cursor, **respawn in place**. **Arcade** (lose all, restart at checkpoint, cursor reset) and **Casual** (keep all, lose shield, in place) selectable. | Recoverable deaths (Gradius III's biggest criticism) and friendlier to remote play. |
| D7 | Lives & extends | 3 ships (1–5 configurable); extends at 20,000 then every 70,000 (M2), cap 9. | Arcade convention. |
| D8 | Terrain & shields | Mix of open-space and floor/ceiling terrain sections. Meter-mode Force Field does **not** absorb terrain; Direct-mode Arm does (data flag `absorbsTerrain`). | Keeps both source games' identities; tunable per shield. |
| D9 | Stage progression | M1: one zone. v1.0: **9-zone diamond map** `A → B\|C → D\|E → F\|G → H\|I`, 5 zones per run, 16 routes, two final zones with different endings. | Branching replay value (Darius) at a content size we can finish. |
| D10 | Bosses | Both archetype families (core battleships and sea-creature war-craft). Every major boss gets the WARNING intro with **original, paraphrased text** (e.g. `WARNING!! GIANT HOSTILE "HALCYON BULWARK" CLOSING IN — CODE HB-01`). HP bar optional (M2). | Darius signature without copying protected text (§26). |
| D11 | Players | 1P in M1; simultaneous 2P co-op in M2. P2 uses a gamepad or split keyboard; a second remote is unsupported until verified. | Only one remote per display. |
| D12 | Controller | **Samsung remote is primary.** Always-on autofire for main shot *and* missiles; every pattern dodgeable with 4-way movement; OK = equip (game) / confirm (menus); Back = pause (game) / back (menus) / exit-confirm (title); Play/Pause = pause; Ch+/Ch− optional extras (never required). | `shmup_feat.md` §4 remote-first rules. |
| D13 | Remote mapping | **Data-driven input profiles** in `content/input/remote-profiles.json`: key-code → action bindings, `releaseDebounceTicks`, diagonal policy, SOCD policy, keys to register. Selectable in Options, persisted, overridable in dev (`?profile=`). | The probe results are pending; they must change data, not code. |
| D14 | Default remote profile | `tizen-remote-safe`: diagonals `combine` (harmless if the remote cannot hold two arrows), release debounce **2 ticks**, registers Play/Pause and Ch±. A `tizen-remote-diagonal` profile (debounce 0) is ready for a positive probe result. | Safe until measured; one JSON edit afterwards. |
| D15 | Binding contexts | Profiles have separate **`game`** and **`menu`** tables; the shell switches context from the top scene. (Keyboard X = Sub in game, Back in menus; remote OK = PowerUp in game, Confirm in menus.) | Removes today's `Sub\|Back` and `Shot\|Confirm` collisions. |
| D16 | Difficulty | Gradius-style rank 0–31 (§15 formula) + presets Easy / Normal / Hard / Arcade in M2. M1 runs Normal at a fixed rank (plumbing exists, growth off). | Depth without blocking the slice. |
| D17 | Bullet density | Moderate (≤ 512 enemy bullets); aimed shots quantized to **32 directions** (16 on Easy); bullet speeds tuned for 4-way dodging (aimed ≤ 2.0 px/tick on Normal in zone A). | Retro, readable, remote-friendly. |
| D18 | Slowdown | None by default; optional deterministic "authentic slowdown" in M3. | Responsiveness pillar. |
| D19 | Internal resolution | **384×216** (×5 exact on the M7's 1920×1080 web viewport; ×3 + letterbox at 720p). 320×180 rejected. | Our test hardware renders 1080p. |
| D20 | HUD placement | Two **8-px bars outside the playfield**: top = 1P score / HI / 2P score; bottom = lives + power meter (or tier pips). Playfield = **384×200** (screen y 8…207). | HUD never hides bullets or terrain; readable on VA panels. |
| D21 | Bomb / special | Mega Crash is the `!` slot (Meter, M1). Yellow smart-bomb item (Direct, M2). One modern signature mechanic (black-hole bomb) deferred to M3. | Keep v1.0 focused. |
| D22 | Music format | Final music: **OGG Vorbis** with sample-accurate `loopStart/loopEnd`, one track resident, decoded at 32 kHz through an `OfflineAudioContext`. Placeholders: **procedural chip songs** (JSON) rendered to PCM at load. chiptune3 (tracker) benchmark in M3. | Loop accuracy + memory control on Chromium 69 (no `AudioContext({sampleRate})`). |
| D23 | SFX | Pre-rendered/pre-decoded `AudioBuffer`s only; per-cue and global voice caps with priorities. Placeholder SFX synthesized from ZzFX-style parameter sets (own implementation). | No mid-game decoding on TV. |
| D24 | Placeholder art | **Art as code:** pixel-map JSON + procedural generators → zero-dependency PNG encoder → packed atlases ≤ 2048². Real PNG/Aseprite sources override frames **by name**. | No human art needed; drop-in replacement later. |
| D25 | Loading on TV | Content JSON and atlas metadata are **inlined into the IIFE bundle**; images load via `HTMLImageElement` with relative URLs; music files (later) via XHR. No `fetch()`, no Pixi `Assets`. | Tizen widgets run from `file://`, where `fetch` fails on Chromium 69. |
| D26 | Coordinate space | Every entity lives in **world-space pixels** (float64, y down); the camera scrolls; the player is clamped to the camera view. Options record the ship trail in **screen space** so they bunch when the ship is idle during scrolling. | One space for terrain, enemies and bullets; Gradius option feel. |
| D27 | Determinism | IEEE `+ − × ÷` and `Math.sqrt` allowed; sin/cos/atan2 come from **committed integer tables**; `Math.sin/cos/tan/atan/atan2/asin/acos/exp/log/pow/hypot/cbrt` and `**` are lint errors in `packages/core`. | Transcendentals differ across JS engines. |
| D28 | Content format | JSON validated by small **in-house schema combinators** in `core/data` (no zod). Behaviours/patterns in TS in M1; BulletML-style JSON pattern DSL and Tiled import in M2. | No runtime dependency; exact error paths. |
| D29 | Enemy scripting | TS generator coroutines that **sleep by yielding tick counts** (the runner only resumes them on wake) + data-driven movers for per-tick motion. | Keeps per-tick allocations at zero. |
| D30 | Hit flash | Asset pipeline auto-generates a white silhouette frame `<name>@flash`; the renderer swaps frames. Hit-stop only on big events (death, boss kill). | Keeps one-atlas batching (Pixi tint is multiply-only). |
| D31 | Saves | Versioned JSON (`save.v1`) through `Platform.storage` with migrations; Electron file store in M2. | Store requirement; uninstall deletes localStorage on Tizen. |
| D32 | Frame pacing | One tick per rAF at 60 Hz (M7 is fixed 60 Hz). Render interpolation for >60 Hz displays only in M2 (Electron). | Lowest latency on the target. |
| D33 | Pickups & shield feel | Gentle 16-px pickup magnet (config); 8-tick shield-hit i-frames. | Remote friendliness; §9/§20 open points. |
| D34 | Host composition | New package **`@shmup/shell`** holds the browser boot sequence shared by `apps/web` and `apps/tizen` (asset/content loading, event dispatch, frame loop). | Avoids two diverging boot paths. |
| D35 | Voice callouts | Placeholder synthesized stingers + on-screen text; recorded original voice lines are a manual post-v1 task. | No human assets required. |
| D36 | Names | Game "Shmup Cup"; meter ship **KESTREL**, direct ship **MANTA**; Zone A **AZURE VERGE**, its boss **HALCYON BULWARK** (code HB-01); all further names original. | `shmup_feat.md` §26. |

### 2.2 Hardware-dependent assumptions (verified later, by the user)

| Assumption | Default in code | Where it changes | Measured on the M7s (2026-09-15, [results](docs/dev/input-probe-results.md)) |
|---|---|---|---|
| Remote cannot hold two arrows; OK may drop a held arrow | 4-way-dodgeable design, `combine` policy, no chords needed | `content/input/remote-profiles.json` | **Confirmed, stricter:** a second arrow **or OK** during a hold is never delivered; the held arrow continues → M3-02b (bot model, docs) |
| Remote may send fake keyup/keydown pairs while held | `releaseDebounceTicks: 2` | same file | **No fake pairs**; repeats are flagless keydowns (≈ 355 ms, then ≈ 108 ms) → debounce 0 in M3-02b |
| Ch± / Play/Pause registrable | registered, optional | profile `register` list | **Yes** (all 45 non-`Exit` keys); Back / Play/Pause / Mute arrive only on release → no held-Pause gestures (M3-02b) |
| Web viewport 1920×1080 | ×5 integer scale | automatic (`computeIntegerViewport`) | **Confirmed** (1920×1080, DPR 1) |
| WebGL1 only | WebGL1 preferred | `preferWebGLVersion` | WebGL **2** also available (Mali-G51, 8192) — WebGL1 stays the default |
| `decodeAudioData` slow | nothing decoded mid-stage | — | not measured |
| Home hides the app (`visibilitychange`) | pause + audio suspend on hidden | `apps/tizen` lifecycle | **No:** Home is an overlay, only `blur` / `focus` → pause on blur in M3-02b |
| 60 Hz rAF → one tick per frame (D32) | accumulator, ±1 ms snap | `core/loop` | rAF jitters (27–32 % of deltas > 20 ms) → 0/2-tick frames; vsync lock in M3-02b |

---

## 3. Cross-cutting architecture this plan introduces

### 3.1 New modules and packages

| Where | What | Step |
|---|---|---|
| `packages/core/src/world/` | `World` (gameplay session state) + `stepWorld()` fixed tick pipeline | M1-06 |
| `packages/core/src/behaviors/` | Registry of enemy/boss behaviour scripts (`id → factory`) referenced by content | M1-08 |
| `packages/audio-web/src/synth/` | Pure-TS PCM synthesis (SFX parameter sets, chip songs) | M1-15 |
| `packages/shell/` (`@shmup/shell`) | Shared browser host: boot/loading, content + atlas wiring, event → renderer/audio dispatch, frame loop, boot error screen | M1-04 |
| `vite.shared.ts` | `shmupContent()` → `virtual:shmup-content`; `shmupAssets()` → `virtual:shmup-assets` + copies `assets/generated/` into builds | M1-02 / M1-03 |
| `scripts/assets/` | PNG encoder, sprite-source parser, procedural generators, packer, font builder | M1-03 |
| `content/{player,paths,tilesets,input,audio,fx,rules,patterns,campaign,strings}/` | New content kinds | as listed per step |
| `test/e2e/`, `test/playtest/`, `test/golden/` | Browser smoke tests, 4-way bot, golden replays | M1-04, M1-18, M1-19 |

Dependency direction becomes: `apps/* → @shmup/shell → {render-pixi, audio-web, input-web} → core`
(`shell` may import all three; `render-pixi`/`audio-web`/`input-web` still depend only on `core`).

### 3.2 Simulation tick (inside `stepWorld`, fixed order — `shmup_feat.md` §22)

```
1 input      per-player intents from the InputSnapshot (context 'game')
2 players    movement, state timers, weapon fire requests, option trail record
3 stage      camera path, event cursor, pending formation spawns, checkpoints
4 scripts    wake sleeping enemy/boss coroutines; patterns fire bullets
5 movement   movers (enemies), bullets, player shots, items, lasers
6 collision  grid build; shots×enemies, bullets/lasers×players, enemies×players, items×players, terrain
7 damage     apply hits, deaths, drops, score, player death/respawn, formation bonuses
8 removal    deferred pool flushes
9 fx         hit-stop/shake/flash timers, emit presentation events, debug counters
```

While hit-stop is active, phases 2–8 are skipped but ticks and fx timers still advance (deterministic).

### 3.3 Frame (host side, `@shmup/shell`)

```
rAF(now) → game.frame(now)            0..4 fixed ticks (scene stack → World)
         → game.events.drain(dispatch) sfx/music → audio-web · particles/shake/flash → render-pixi
         → renderer.render(game.renderFrame())
```

### 3.4 Render contract (defined in M1-04, filled by later steps)

`RenderFrame` grows to `{ tick, alpha, world: WorldView | null, hud: DrawList, ui: DrawList, screen: { shakeX,
shakeY, flash, dim } }`. `WorldView` exposes read-only references: `camera`, `parallax`, `terrain`, and a list of
**`SpriteBatchView`s** — `{ layer, count, x, y, spriteId, frame, flags }` typed arrays. SoA pools implement the view
directly; object-based systems (enemies, bosses, players) fill a small mirror view at the end of each tick. The
renderer keeps one preallocated sprite binding per batch view, so a new entity kind needs **no renderer change**.
`DrawList` is a fixed-capacity typed-array command buffer (`rect`, `sprite`, `text`, `number`) plus a string table
that only changes when menu text changes — HUD numbers are drawn with the `number` op (no string building).

Draw layers (bottom → top, `shmup_feat.md` §18): `BG_FAR, BG_MID, TERRAIN, GROUND_ENEMIES, AIR_ENEMIES,
PLAYER_SHOTS, PLAYER, HITBOX, ITEMS, FX, ENEMY_BULLETS, HUD, UI, DEBUG`.

### 3.5 Content kinds and who validates them

| Kind | Files | Owner (validator) |
|---|---|---|
| `player`, `weapons`, `enemies`, `stage`, `paths`, `tileset` | `content/player/`, `weapons/`, `enemies/`, `stages/`, `paths/`, `tilesets/` | `core/data` (M1-02 onward) |
| `rules` (difficulty, scoring), `patterns`, `campaign`, `strings` | `content/rules/`, `patterns/`, `campaign/`, `strings/` | `core/data` (M2) |
| `input-profiles` | `content/input/` | `input-web/remote` (M1-05) |
| `sfx`, `music` | `content/audio/` | `audio-web/loader` (M1-15) |
| `fx` (particle presets) | `content/fx/` | `render-pixi/particles` (M1-14) |

`virtual:shmup-content` exposes all files (sorted by path, `example.*.json` excluded); the shell routes each file to
its owner by `kind`. Every validator reports `ValidationIssue { path, message }`; the boot error screen lists them.

---

## 4. Milestones at a glance

| Milestone | Exit criterion | Steps |
|---|---|---|
| **M1 — Playable vertical slice** | Zone A with boss is playable start → boss → stage clear with the remote-first scheme in `pnpm dev`, and `pnpm --filter @shmup/tizen build` produces a checked `.wgt`-ready `dist/`; title/pause/game over/stage clear; HUD; audio; saves; debug tools; golden replays | M1-01 … M1-19 |
| **M2 — Complete v1.0** | All P1 features: rank/difficulty, full meter arsenal, Direct mode + ship select, co-op, 9-zone map with 16 routes, advanced stage & boss systems, front-end screens, options/rebinding/accessibility, Electron + TV polish, release candidate | M2-01 … M2-18 |
| **M3 — Post-launch backlog** | P2 features grouped coarsely, plus the hardware tuning from the input probe (M3-02b) and the render-performance work it exposed (M3-02c … M3-02e) | M3-01 … M3-03 (incl. M3-02b … M3-02e) |

| Id | Title | Fills (placeholder → implemented) |
|---|---|---|
| M1-01 | Engine foundations: RNG, trig tables, event queue, pools | core `rng`, `math`, `events`, `pools` |
| M1-02 | Content schemas, loader & content module | core `data`; `vite.shared.ts` |
| M1-03 | Placeholder asset pipeline (sprites, font, atlas) | `scripts/generate-assets.mjs`, `scripts/assets/` |
| M1-04 | Rendering foundations & shared browser shell | render-pixi `atlas`, `layers`, `sprites`, `text`, `ui`; core `presentation`; new `packages/shell` |
| M1-05 | Remote-first input profiles | input-web `remote`, `rebind` (partial) |
| M1-06 | Sim world, tick pipeline, player ship & collision | core `world` (new), `player`, `collision`, `debug` (partial), `game` |
| M1-07 | Stage runtime: camera, timeline, checkpoints, terrain, parallax | core `stage`, `collision` (terrain) |
| M1-08 | Enemies, behaviour scripts & movement | core `enemies`, `patterns` (runner/movers), `behaviors` (new) |
| M1-09 | Enemy bullets, lasers & attack patterns | core `bullets`, `patterns` (fire primitives), `rank` (partial) |
| M1-10 | Player weapons (Type A) & Options | core `weapons`, `options` |
| M1-11 | Power meter, capsules, Force Field & Mega Crash | core `powerups`, `shields`, `config` |
| M1-12 | Death, respawn, checkpoints, lives & score | core `scoring`, `fx`, `player` |
| M1-13 | Bosses & the WARNING sequence | core `bosses` |
| M1-14 | FX & game feel | render-pixi `particles`, `effects` |
| M1-15 | Audio engine & procedural placeholder SFX/music | audio-web `sfx`, `music`, `loader`, `synth` (new) |
| M1-16 | Scene flow, canvas UI kit & HUD | core `scenes`, `ui` |
| M1-17 | Saves, audio options & platform integration | core `save`, `config` (`UserOptions`) |
| M1-18 | Zone A content, boss & 4-way playtest bot | `content/`, `assets/source/`, `test/playtest/` |
| M1-19 | Debug tools, replays, golden tests & M1 release check | core `debug`, `replay`; render-pixi `debug` |
| M2-01 | Rank, difficulty presets, extends & continues | core `rank`, `scoring` |
| M2-02 | Pattern DSL, bending lasers, bullet cancel & readability | core `patterns`, `bullets` |
| M2-03 | Meter arsenal: loadouts B–D, Weapon Edit, weapon select | core `weapons`, `powerups`; scenes |
| M2-04 | Option & shield variants + Option Hunter | core `options`, `shields`, `enemies` |
| M2-05 | Direct mode & ship select | core `powerups`, `weapons`, `shields` |
| M2-06 | Two-player simultaneous co-op | core `world`, `player`; input-web |
| M2-07 | Advanced stage systems & Tiled import | core `stage`, `collision` |
| M2-08 | Presentation polish: raster effects, palettes, visual options | render-pixi `effects`, `palette`, `viewport` |
| M2-09 | Advanced bosses: mid-bosses, raids, multi-bosses | core `bosses` |
| M2-10 | Zone map, campaign flow, transitions & bonus stages | core `scenes`, `stage` |
| M2-11 | Zones B & C | content |
| M2-12 | Zones D & E | content |
| M2-13 | Zones F & G | content |
| M2-14 | Final zones H & I, endings & credits | content, scenes |
| M2-15 | Front-end screens & attract mode | core `scenes`, `ui`, `replay` |
| M2-16 | Options, rebinding & accessibility | core `ui`, `save`; input-web `rebind` |
| M2-17 | Platform polish: Electron, Tizen extras, storage | apps `electron` (`saves.ts`), `tizen` (`device-info`, `live-reload`) |
| M2-18 | v1.0 hardening & release candidate | tests, budgets, release |
| M3-01 | Extra modes & replay features | — |
| M3-02 | Visual & mechanic extras | — |
| M3-02b | Remote & hardware tuning from the input-probe results | input profiles, input-web, core `loop`, apps `tizen` lifecycle, `test/playtest`, content tuning, `tools/input-probe` |
| M3-02c | Render profiling: on-device numbers and a render benchmark | render-pixi `debug`, `test/bench`, `docs/dev` |
| M3-02d | Fold the full-screen effects into their draw passes | render-pixi `effects`, shell `memory`, shell `boot` |
| M3-02e | Cut the per-frame scene-graph rebuild | render-pixi `layers`, `sprites`, `particles` |
| M3-03 | Reach: localization, more platforms, tracker music | apps `electron` (`steam.ts`), new adapters |

---

## 5. M1 — Playable vertical slice

Goal of the milestone: every **[P0]** feature of `shmup_feat.md` for one zone with a boss, remote-first, running in
the browser dev app and as a Tizen 5.5 bundle.

### M1-01 — Engine foundations: RNG, trig tables, event queue, pools

- **Goal:** the deterministic primitives every system needs.
- **Depends on:** — (skeleton).
- **Fills:** `packages/core/src/rng/`, `math/`, `events/`, `pools/` (all `placeholder → implemented`).
- **Deliverables:**
  - `rng/index.ts`: `createRng(seed)`, `createRngStreams(seed)`; `Rng` gains `callCount` and
    `getStateInto(out: Uint32Array)` (zero-alloc variant of `getState`).
  - `math/index.ts` + committed `math/trig-table.ts` generated by `scripts/gen-trig-tables.mjs`.
  - `events/index.ts`: `createEventQueue(capacity)`, numeric `SimEventKind` codes, the canonical **cue registries**
    `SFX_CUES` / `MUSIC_CUES` (name → id) the audio content maps onto.
  - `pools/index.ts`: `createSoaPool(capacity, schema)`, `createPool(factory, capacity, reset)`.
  - ESLint: new `no-restricted-properties` entries for `Math.sin/cos/tan/asin/acos/atan/atan2/exp/log/pow/hypot/cbrt`
    and `no-restricted-syntax` for `**` in `packages/core`; fixtures added to `test/integration/eslint-rules.test.ts`.
- **Implementation notes:**
  - **sfc32** state from a 32-bit seed via splitmix32 (4 words). `nextFloat = nextU32() / 2^32`;
    `rangeInt(min,max) = min + Math.floor(nextFloat() * (max - min + 1))`. Streams: gameplay = seed,
    cosmetic = splitmix32(seed ^ 0x9e3779b9). `callCount` increments per draw (debug overlay).
  - **Binary angles:** `ANGLE_UNITS = 1024`, `ANGLE_MASK = 1023`, 0 = +x, clockwise on screen (y down).
    `SIN_TABLE_Q16` = 1024 + 256 Int32 values `round(sin(2πi/1024) · 65536)` produced by the script and committed
    (runtime converts once to a `Float64Array` by dividing by 65536 — exact). `sinB(a)`, `cosB(a)` (offset 256).
    `atan2B(dy, dx)`: octant reduction + committed table `ATAN_TABLE` of 257 entries (atan(i/256) in binary units),
    result 0…1023. `quantizeAngle(a, dirs)` rounds to `1024/dirs` steps. `angleDelta(a, b)` (signed shortest),
    `turnToward(a, target, maxStep)` (homing). Doubles are used for positions (IEEE arithmetic is deterministic), so the
    planned 16.16 helpers are **dropped** — document why in the module docblock. Easing: polynomial
    `linear, inQuad, outQuad, inOutQuad, inCubic, outCubic, inOutCubic`; `inOutSine` via `sinB`. `clamp`, `lerp`,
    `approach(v, target, step)`.
  - **EventQueue:** ring of typed arrays (`kind: Uint8Array`, `id: Uint16Array`, `x/y/param: Float64Array`), default
    capacity 256, drop-oldest with a `dropped` counter; `drain(visit)` passes one reused record object.
  - **SoaPool:** schema like `{ x: 'f64', y: 'f64', sprite: 'u16', flags: 'u8' }` → pool exposes `fields.x` etc.
    (typed via a mapped type). `alloc()` = `count++` and zero-fills the slot, `-1` when full. `free(i)` records i in a
    pending list (dedup via a `Uint8Array` mark); `flush()` sorts pending indices descending (insertion sort on the
    small list) and swap-removes. Document: *indices are only stable within a tick.*
  - `Pool<T>`: preallocated objects + free stack; `acquire()` calls `reset` and returns `null` when empty.
- **Acceptance (headless):**
  - `pnpm --filter @shmup/core test`: sfc32 known-answer vector; stream independence; `rangeInt` bounds; `sinB/cosB`
    within 2e-5 of `Math.sin` (test-side only), `atan2B` within ±1 unit for 10k random points; re-running
    `scripts/gen-trig-tables.mjs` reproduces `trig-table.ts` byte-for-byte; queue overflow/drain order; pool
    alloc/free/flush order and exhaustion.
  - Lint fixture proves `Math.sin(x)` and `x ** 2` fail in `packages/core`.
- **Refs:** `shmup_feat.md` §22 (determinism, pools), §12 (quantized angles); `shmup_tech.md` §4.2, §4.6.
- **As built:**
  - `scripts/gen-trig-tables.mjs` computes both tables with **BigInt fixed-point arithmetic**
    (Machin's formula for π, Taylor series for sin, tangent boundaries for `ATAN_TABLE`) instead of
    `Math.sin` / `Math.atan`, and formats its output through Prettier. That makes "re-running the
    script reproduces `trig-table.ts` byte-for-byte" true on *any* engine, not just the one that
    generated the committed copy, and keeps the file `format:check`-clean. It cross-checks itself
    against the host `Math` before writing. `--check` (also `pnpm trig:tables`) verifies the
    committed file; `--out FILE` writes elsewhere (used by the test).
  - `ANGLE_UNITS` / `ANGLE_MASK` / `ANGLE_QUARTER` / `TRIG_SCALE` / `ATAN_TABLE_STEPS` live in the
    generated `math/trig-table.ts` (the script owns their values) and are re-exported from
    `math/index.ts`.
  - `math` also exports `wrapAngle` (needed by every caller that keeps an angle in a variable) and
    the planned 16.16 helpers are dropped, as the step's implementation notes require.
  - `events`: `SimEventKind` became a numeric const object (`SimEventKind.Sfx === 0`) plus
    `SIM_EVENT_KIND_NAMES`; the placeholder's string union is gone. `EventQueue` gained `capacity`
    and `dropped`; `clear()` resets the drop counter too.
  - `events` (**fixed by the TEST agent**): `drain()` now releases each ring slot immediately
    before visiting it instead of releasing the whole pending block up front. The old version
    let a visitor that pushed enough events to overflow the ring overwrite the records the
    drain had not reached yet, so those pushes were visited as if they had been pending (and
    again on the next drain); a visitor calling `clear()` mid-drain read released slots the
    same way. Overflowing during a drain now drops the unvisited originals (counted in
    `dropped`) and ends the drain, and `clear()` ends it too.
  - `pools`: `SoaPool<S>` is generic over its schema so `pool.fields.x` is typed; it also exposes
    `pendingFreeCount` and `clear()`. Field arrays are created in sorted field-name order so a
    future state hash does not depend on how the schema literal was written.
  - `rng`: `setState` accepts a `Uint32Array` as well as an `RngState`, and `RNG_STATE_WORDS` is
    exported so callers can size the `getStateInto` buffer. `callCount` is diagnostic and is not
    restored by `setState`.
  - ESLint: adding the `**` ban meant re-listing the Chrome-69 `no-restricted-syntax` entries inside
    the `packages/core` block (a flat-config block replaces, not merges, a rule's options). While
    adding the rules, the Node-built-in `no-restricted-imports` **patterns** were moved to `paths`:
    ESLint ≥ 9 matches patterns gitignore-style, so the bare pattern `events` also matched the
    core's own `./events/index.js`.

### M1-02 — Content schemas, loader & content module

- **Goal:** schema-validated JSON content with numeric id resolution, available to the core, the apps and tests.
- **Depends on:** M1-01.
- **Fills:** `packages/core/src/data/` (`→ partial`; every later step adds its kinds).
- **Deliverables:**
  - `data/schema.ts`: combinators `s.int({min,max})`, `s.num`, `s.str`, `s.bool`, `s.enumOf([...])`,
    `s.array(item, {min,max})`, `s.object(shape, {optional: [...]})`, `s.nullable`, `s.ref(kind)`, `s.oneOf(tagField,
    variants)`; `Infer<typeof schema>` type; `schema.parse(json, path, issues)`.
  - `data/index.ts`: `loadContent(files, options) → { db: ContentDb, issues, foreign }` — validates core kinds, runs
    `CONTENT_MIGRATIONS[kind][fromVersion]`, resolves `ref`s in a second pass, builds numeric tables:
    `db.sprites` (unique sprite names → ids), `db.enemyIndex`, etc.; files of non-core kinds are returned in
    `foreign` untouched. Initial kinds: `player`, `weapons`, `enemies`, `stage` (shapes as needed by M1-06…M1-13;
    this step defines the file headers, `player` and `weapons` fully, and stubs for the rest that later steps extend).
  - `vite.shared.ts`: `shmupContent({ root })` plugin → `virtual:shmup-content` (`export default [{ path, data }]`,
    sorted by path, `example.*.json` skipped, full reload on change) and a Node helper `readContentFiles(root)`;
    `types/virtual-modules.d.ts` declares the module; `apps/web` and `apps/tizen` use the plugin.
  - `content/player/kestrel.player.json` (speeds, hitboxes — see M1-06) and `content/weapons/type-a.weapons.json`
    (formatVersion 1); example files move to formatVersion 1 but stay test fixtures.
  - `createGame(platform, overrides, content?)` accepts a `ContentDb` (empty DB when omitted).
  - `test/integration/content.test.ts` + root script `"content:check"` running it.
  - `test/integration/workspace-layout.test.ts` updated: it currently requires `formatVersion: 0` in every
    `content/{stages,enemies,weapons}/*.json`; it now expects `1` and covers every content folder (README +
    example per kind).
- **Implementation notes:** validators never throw on bad data — they collect `ValidationIssue`s with JSON paths
  (`enemies[3].hurtbox.hw: must be an integer ≥ 1`); `loadContent` throws only for a programming error. Maps are fine
  at load time; per-tick code reads only arrays. `formatVersion` 1 from here on (content README says so).
  Script/behaviour ids are validated against an injectable `knownScripts` set (filled by M1-08).
- **Acceptance:** combinator unit tests (valid, each failure, nested paths); ref resolution + missing-ref issues;
  deterministic `db.sprites` order; plugin test (Node) — the generated module contains every non-example file in path
  order; `pnpm content:check` green; web and Tizen builds still pass.
- **Refs:** `shmup_feat.md` §14 (stage data format), §22 (data-driven content), §7C, §11.
- **As built:**
  - `Schema.parse(value, path, issues, refs?)` takes an optional fourth argument: the collector
    of **reference sites**. The plan's three-argument call still validates; only a loader that
    wants ids resolved passes `refs`. `s.object` records a site for every field declared with
    `s.ref` (also through `s.nullable`) and `loadContent` writes the resolved index into the
    sibling field `<field>Id` (`sprite` → `spriteId`, `behavior` → `behaviorId`, `enemy` →
    `enemyId`, `-1` for a null or unresolved reference). Consequently `s.array(s.ref(...))`
    throws a `TypeError` at schema-construction time: a bare array of references has nowhere to
    put the numeric ids, so references are wrapped in objects.
  - Added combinator `s.record(value, keyPattern?)` (string-keyed maps of one value type) for
    weapon `params` and the palettes/tunable tables later kinds need.
  - `s.object` reports **unknown fields** as issues (typos in content are the common failure)
    and uses `NoInfer` on its return type, so a schema const annotated with its spec type does
    not back-infer the `optional` key set.
  - Reference kinds: `ship`, `weapon`, `enemy`, `stage` must resolve against the loaded content;
    `sprite` and `script` are **interned** (collected, sorted, numbered — indices never depend on
    file order), with `script` additionally checked against `options.knownScripts` when a caller
    supplies it (M1-08); `sfx` / `music` resolve against the `SFX_CUES` / `MUSIC_CUES` registries
    from `core/events`.
  - `db` shape: `sprites` / `scripts` are `StringTable { names, index }`; the per-kind lists are
    `ships`/`shipIndex`, `weapons`/`weaponIndex`, `weaponPresets`/`weaponPresetIndex`,
    `enemies`/`enemyIndex`, `stages`/`stageIndex`. Issue paths are `<file>:<json path>`
    (`content/enemies/x.json:enemies[3].hurtbox.hw`). Duplicate ids across files are issues.
  - `CONTENT_MIGRATIONS` ships real `0 → 1` migrations for `weapons`, `enemies` and `stage`
    (format 0 is structurally identical); the new `player` kind deliberately has none, so a
    format-0 player file reports "no migration" — both paths are covered by tests, and
    `loadContent` takes a `migrations` override for testing.
  - `pnpm content:check` validates `content/` as **two independent sets**: the shipped files
    (what `virtual:shmup-content` inlines) and the `example.*.json` samples. Examples are
    documentation and may reuse the ids of real content without clashing with it. Added
    `content/player/example.player.json` (+ `content/player/README.md`) and an `example-warden`
    enemy so the example stage's `warning`/`boss` events resolve.
  - Stage and enemy schemas are the stubs the step asks for and match the existing examples;
    stage events validated today are `spawn`, `boss`, `midboss`, `warning`, `music`, `scroll`,
    `checkpoint` (`formation` and `branch` come with the stage runtime in M1-07).
  - `shmupContent()` defaults its root to the repo's `content/` (it is resolved from
    `vite.shared.ts`'s own URL), exports `CONTENT_MODULE_ID` and `readContentFiles(root?)`, and
    triggers a full reload on any `*.json` change under the root. `types/virtual-modules.d.ts`
    is listed in the root `tsconfig.json` as well as in both apps, so ESLint's project service
    can type it.

### M1-03 — Placeholder asset pipeline (sprites, font, atlas)

- **Goal:** committed scripts turn code-defined pixel art into atlases; real art can replace frames by name later.
- **Depends on:** M1-02 (sprite names referenced by content are checked).
- **Fills:** `scripts/generate-assets.mjs` (placeholder → real orchestrator); new `scripts/assets/`.
- **Deliverables:**
  - `scripts/assets/png.mjs` — zero-dependency PNG encoder (RGBA, `zlib.deflateSync`, CRC32 table); decoding of PNG
    *sources* through the dev dependency **`pngjs`** (allowed).
  - `scripts/assets/sprite-source.mjs` — parses `assets/source/sprites/**/*.sprite.json`:
    `{ name, palette: { ".": null, "a": "#1b2a4a", … }, anchor: [x,y], hitFlash: true, frames: [{ rows: ["..aa.."] }],
    animations?: { idle: [0,1] } }`; PNG sources (`*.png` + optional Aseprite `*.json` sidecar) override frames with the
    same name.
  - `scripts/assets/procedural/*.mjs` — seeded generators (explosions small/medium/large, sparks, debris, enemy bullets
    round/oval/needle with dark rim in pink/red/purple, capsule blink, force-field wear states, starfield tiles,
    8×8 terrain tileset with slopes, HUD meter frame and slot icons, 1×1 white pixel for rects).
  - `scripts/assets/packer.mjs` — deterministic skyline/MaxRects packer, 1-px padding + edge extrusion, pages ≤ 2048².
  - `scripts/assets/font.mjs` + `assets/source/fonts/pixel6x8.font.json` — original 6×8 glyphs for ASCII 32–126 plus
    `← ↑ → ↓ ● ✕ ★`; glyph frames go into the atlas, metrics into the manifest.
  - `scripts/assets/flash.mjs` — `<frame>@flash` white silhouettes for `hitFlash` sprites.
  - Output: `assets/generated/atlas/main.png` (+ more pages if needed) and `assets/generated/atlas/main.json`:
    `{ formatVersion, pages: [{ file, w, h }], frames: { name: { p, x, y, w, h, ax, ay } }, animations, fonts: { pixel:
    { lineHeight, glyphs: { code: { frame, advance } } } } }`; input-hash cache file to skip unchanged runs.
  - Initial original sprite set: KESTREL ship (from `PLACEHOLDER_SHIP`, 3 bank frames + 2 thruster frames), option orb,
    player shots (basic, double, laser segment, missile), 6 small-enemy placeholders, boss part set (core, shield plate,
    hull block, emitter), items, HUD pieces, terrain tiles, star layers, font.
  - Turbo root task `//#assets` (inputs `assets/source/**`, `scripts/assets/**`; outputs `assets/generated/**`); `build`,
    `dev` and `test:e2e` depend on it; CI unchanged otherwise (build triggers it).
  - `vite.shared.ts`: `shmupAssets()` plugin — dev middleware serving `assets/generated/`, build-time `emitFile` into
    `dist/assets/atlas/`, and `virtual:shmup-assets` exporting the manifest JSON **inlined** plus relative page URLs.
  - `apps/tizen/scripts/check-bundle.mjs`: allow non-script files under `dist/assets/**`, still exactly one script.
- **Acceptance:** `pnpm assets` produces the files; two runs are byte-identical; PNG round-trip (encode → pngjs decode)
  equals the source pixels; packer never overlaps, respects 2048², padding; font covers ASCII 32–126;
  integration test: every sprite name in `db.sprites` exists in the manifest (missing → issue list); Tizen check-bundle
  tests updated; `pnpm build` green.
- **Refs:** `shmup_feat.md` §18 (atlas, palette, VA-friendly colours), §25; `shmup_tech.md` §4.7; `assets/README.md`.
- **As built:**
  - **Naming.** Sprite names are the source path below `assets/source/sprites/` (the names
    content already uses: `ships/kestrel`, `shots/basic`); the `name` field of a
    `*.sprite.json` must match it. Frame names are `<sprite>#<index>`. The hit-flash
    silhouettes form a **sibling sprite** `<sprite>@flash` with the same frame count (frame
    `i` = white silhouette of frame `i`, same anchor) instead of one `<frame>@flash` per
    frame, so the renderer swaps a sprite id, not frame names.
  - **Manifest additions** beyond the planned keys: `sprites: { name: { frames: [frame
    names], flash: name | null } }` (a sprite's frames in index order — what
    `resolveSpriteTable` needs), `animations` keyed per sprite (`animations[sprite][tag]`),
    and fonts carry `sprite`, `cellWidth`, `cellHeight` next to `lineHeight` / `glyphs`
    (glyphs keyed by decimal code point). Pages are `main.png`, `main-1.png`, …; sizes are
    powers of two. Today everything fits one 512×256 page (55 sprites, 272 frames).
  - **Files.** Besides the listed modules, `scripts/assets/` has `image.mjs` (RGBA raster
    helpers), `rng.mjs` (sfc32 with the `core/rng` step, own splitmix32 seeding), `manifest.mjs` (format,
    serialiser, `findMissingSprites()`) and `pipeline.mjs` (`buildAtlas()` in memory,
    `generateAssets()` with the input-hash cache in `assets/generated/.asset-cache.json`,
    atomic writes, stale-page removal). The procedural generators use only exactly-rounded
    maths (22.5° rotations from square roots), so the output is engine-independent.
  - **Initial sprites.** KESTREL is `ships/kestrel` (frames level / up / down) plus a separate
    `ships/kestrel-thruster` (2 frames) drawn behind it; the six small enemies are `drifter`,
    `turret`, `carrier-red`, `hopper`, `spinner`, `darter` (covering the example content's
    names); bullets are `bullets/{round,oval,needle}-{pink,red,purple}` (oval/needle with 8
    directional frames, `frame = ((angle + 32) >> 6) & 7`); the terrain tileset
    `tiles/terrain-a` has 17 tiles, each also listed as a one-frame animation named after its
    shape; HUD: `hud/meter-slot` (normal/highlighted/disabled), `hud/meter-labels` (7 slot
    labels), `hud/life`; `ui/pixel` and `ui/missing` (magenta checker for M1-04's missing
    frame).
  - **Plugin.** `shmupAssets()` runs the (cached) pipeline in `buildStart`, so a fresh clone
    and test-time builds work without a prior `pnpm assets` (CI runs `pnpm test` before
    `pnpm build`). `virtual:shmup-assets` exports `manifest`, `pageUrls`
    (`assets/atlas/main.png`, relative) and a default `{ manifest, pageUrls }`; the dev
    middleware serves `<base>assets/atlas/*` and edits under `assets/source/` regenerate +
    full-reload. Edits under `scripts/assets/` are not regenerated in-process (the loaded
    pipeline code is the old code): they are config dependencies of the app configs, so
    Vite restarts the server and the new `buildStart` regenerates (a warning asks for a
    restart when none is coming). The input hash uses the pipeline scripts **as loaded by
    the process** (snapshotted at import), so a long-lived process can never record new
    code's hash next to old code's pixels. Both apps register it now (pages ship in
    `dist/assets/atlas/`; the shell consumes the module in M1-04).
  - **Tooling.** `tsconfig.tooling.json` gained `allowJs` (the Node-side TS imports the
    JSDoc-typed `.mjs` pipeline; no `checkJs`); `pngjs` is loaded untyped (no `@types`
    dependency). `assets/source/` is excluded from Prettier (hand-laid pixel rows).
    `turbo.json`: `//#assets` (inputs `assets/source/**`, `scripts/assets/**`,
    `scripts/generate-assets.mjs`; outputs `assets/generated/**`) before `build`, `dev`
    and a `test:e2e` task entry reserved for M1-04; `assets/source/**` and
    `scripts/assets/**` joined `globalDependencies` (test tasks run real builds).
  - **Checks.** `check-bundle.mjs` rule 6: every file other than the four widget files must
    be under `dist/assets/` (still exactly one script anywhere). `pnpm content:check` also
    asserts that every sprite name of the shipped content exists in the atlas (the example
    files' `ships/example` / `enemies/example-warden` are documentation and not checked).

### M1-04 — Rendering foundations & shared browser shell

- **Goal:** draw sprites, terrain-ready layers and bitmap text from sim views with zero per-frame allocation; one boot
  path for web and TV; browser smoke tests.
- **Depends on:** M1-03.
- **Fills:** render-pixi `atlas`, `layers`, `sprites`, `text`, `ui` (`→ implemented`/`partial`); core `presentation`
  (`→ implemented`); new package `packages/shell` (`@shmup/shell`) with modules `boot`, `loader`, `dispatch`,
  `error-screen`; `apps/web/src/boot` and `apps/tizen/src/boot` become thin.
- **Deliverables:**
  - core `presentation`: `SpriteBatchView`, `WorldView`, `DrawList` + `createDrawList(capacity)`
    (ops `rect, sprite, text, number`; typed arrays; string table with `setString(slot, s)` only when changed),
    extended `RenderFrame` (§3.4), `LayerId` enum.
  - render-pixi `atlas`: `createAtlas(manifest, images)` → Pixi `Texture`s over one `TextureSource` per page
    (`scaleMode: 'nearest'`), `frameId(name)`, `resolveSpriteTable(names) → Int32Array` (missing → magenta
    `@missing` frame, warn once).
  - `layers`: containers in §3.4 order; `roundPixels`.
  - `sprites`: `SpriteLayerBinding(capacity, layer)` with `sync(view, camX, camY)` — sets texture from
    `spriteTable[spriteId] + frame`, `x = Math.round(x - camX)`, `y = Math.round(y - camY) + PLAYFIELD_Y`,
    flip/blink flags, hides unused slots. No allocation.
  - `text`: bitmap-font glyph-sprite pool (1024 glyphs), implements core `TextMetrics`.
  - `ui`: draws a `DrawList` into the HUD or UI layer (rects via the white pixel scaled + tinted).
  - `@shmup/shell`: `bootShell({ canvas, win, contentFiles, assets, platform, input, audio, gameConfig })` — loads
    atlas pages with `new Image()` (relative URL; no `fetch`), shows a progress bar (plain canvas), validates content
    (boot error screen listing issues), creates renderer/game, runs the frame loop, drains events to registered
    handlers. `apps/web` and `apps/tizen` import the virtual modules and pass them in.
  - Default web scene: a **sprite showcase** (parallax stars, KESTREL, bitmap text "SHMUP CUP") until M1-06;
    `?scene=calibration` keeps the old test pattern.
  - `test/e2e/` with **Playwright** (dev dependency, Chromium only): `pnpm test:e2e` builds, serves `apps/web/dist`
    (Vite preview) and opens `apps/tizen/dist/index.html` via **`file://`**; asserts no console errors, canvas
    non-uniform (screenshot variance), atlas image loaded. New CI job `e2e` (`playwright install --with-deps chromium`).
- **Implementation notes:** keep all sprites of a layer on one atlas page so Pixi v8 batches into one draw call;
  never create Pixi objects in `render()`; the upscale pass from the skeleton stays. WebGL flags for headless:
  `--use-angle=swiftshader --enable-unsafe-swiftshader`.
- **Acceptance:** unit tests for `resolveSpriteTable`, DrawList encoding, text layout/metrics, binding sync (Pixi
  objects faked); `pnpm test:e2e` green for both builds; Tizen bundle check green (assets present, one script).
- **Manual (optional):** deploy the Tizen build; the showcase renders crisp at ×5 on the M7.
- **Refs:** `shmup_feat.md` §3, §17 (canvas UI), §18 (draw order, atlas), §22 (rendering pipeline); `shmup_tech.md`
  §2.2, §4.1, §4.10.
- **As built:**
  - **Core `presentation`.** `LayerId` is a numeric const object (`LayerId.BgFar` … `LayerId.Debug`,
    codes 0…13) with `LAYER_COUNT` and `LAYER_NAMES` (the §3.4 spellings). `SpriteFlag` =
    `FlipX | FlipY | Hidden` (blink) `| Flash` (draw the `<sprite>@flash` sibling). `SpriteBatchView`
    also carries `capacity` and types its arrays `ArrayLike<number>` so SoA pools of any numeric
    field type implement it; `createSpriteBatch(layer, capacity)` + `pushSprite()` build the mirror
    views of object-based systems. `ParallaxView` / `TerrainView` are minimal shapes that M1-07 fills
    and draws. `DrawList` stores commands column-wise (`op, x, y, w, h, color, alpha, ref, frame,
    flags, value`), `ref` = sprite id or string slot, `frame` = sprite frame or the `number` op's
    zero-pad width, `flags` = sprite flags or `TextAlign`; it counts `dropped` commands and bumps a
    `revision` on every change (the renderer skips unchanged lists). `TextMetrics` moved here from the
    placeholder core `ui` (which re-exports it) so it can be public API.
  - **Core `config` / `game`.** The D20 layout constants `HUD_BAR_HEIGHT`, `PLAYFIELD_Y`,
    `PLAYFIELD_W`, `PLAYFIELD_H` were added now (M1-06 lists them) because the sprite binding needs
    `PLAYFIELD_Y`. `Game` gained `events: EventQueue` (the shell drains it; M1-06's systems push into
    it) and `renderFrame()` returns the full frame (`world: null`, empty HUD / UI lists, no effects).
  - **Sprite ids → frames.** A world batch's or draw list's `spriteId` indexes the *sprite name table*
    the host hands the renderer (`renderer.setSpriteNames(game.content.sprites.names)`); `createAtlas`
    assigns frame ids sprite by sprite, so frame = `table[spriteId] + frame`, validated against a
    per-frame `framesLeft` array. Unknown names and out-of-range frames draw `ui/missing` (the M1-03
    name, not `@missing`), warned once per name. `resolveFlashTable` serves `SpriteFlag.Flash`. The
    atlas rejects a page image whose size differs from its manifest entry (a stale atlas → boot error
    screen).
  - **render-pixi.** `createSpriteLayerBinding({ atlas, tables, capacity, layer, offsetY })`; flips
    mirror around the anchor point. `sprites` also exports an ordered `QuadPool`: the HUD and UI layers
    each own one (1024 quads = the planned glyph pool) and a `DrawListView` (`ui`) draws rects, sprites,
    text and numbers into it in command order; `text` provides `createBitmapFont`,
    `createTextMetrics`, `drawText` / `drawNumber` into a `GlyphSink` (numbers without strings; values
    capped at `Number.MAX_SAFE_INTEGER` so digit extraction stays exact). The renderer takes `atlas`,
    `testPattern`, `font`, `glyphCapacity`; adds `setSpriteNames()`, `bindWorld()` (bindings are created
    when a new `WorldView` object appears — the shell pre-binds its scene at load, so frames never
    create Pixi objects), a lifted-navy background quad, shake as a world-group offset, a flash quad
    over the world layers and a dim quad under the UI. Parallax and terrain are drawn from M1-07.
  - **`@shmup/shell` modules:** `boot`, `loader`, `dispatch`, `error-screen` as planned, plus
    `frame-loop` (moved from `apps/web` and `apps/tizen`, which each had a copy) and `showcase` (the
    default scene lives in the shell so web and TV show the same thing). `bootShell`'s `platform`
    option is a factory `(renderer) => Platform` (the platform's `caps.webgl2` is only known once the
    renderer exists); further options `scene`, `audioUnlock` (`'gesture'` web / `'immediate'` TV),
    `preferWebGLVersion`, `contentOwners`, `createImage`, `overlay`. The progress bar and the boot error
    screen are drawn on a separate 2D **overlay canvas** (a canvas that had a 2D context can never get
    WebGL, and the error screen must work when WebGL is the problem). The game canvas carries
    `data-shmup-state="loading" | "running" | "error"`. Foreign content kinds without an owner are
    issues (plan §3.5). `sceneFromSearch()` reads `?scene=`; the calibration pattern is shown only
    with `?scene=calibration`.
  - **Apps.** `bootWebApp(canvas, resources, win)` / `bootTizenApp(canvas, resources, win)` receive the
    virtual modules from `main.ts` (unit tests cannot resolve virtual modules). The Tizen Back watcher
    is installed before boot, so Back also exits from the boot error screen.
  - **Tizen bundle check** rule 7: at least one atlas page under `dist/assets/atlas/`.
  - **e2e.** `@playwright/test` (root dev dependency), `test/e2e/playwright.config.ts` + `boot.spec.ts`;
    `pnpm test:e2e` runs `turbo run build` for both apps, then Playwright (the reserved turbo
    `test:e2e` task stays unused — the root script chains the build). Chromium flags: SwiftShader,
    `--allow-file-access-from-files` (desktop Chrome treats every `file://` URL as its own origin and
    WebGL refuses the atlas upload — verified; the Tizen runtime serves the widget's files as
    same-origin) and `--autoplay-policy=no-user-gesture-required`; the browser environment drops
    `DISPLAY` (a stale forwarded X display made ANGLE's SwiftShader pick XCB and hang every WebGL
    context). Checks: running state, non-uniform ×3 screenshot with known pixels (showcase title
    yellow and HUD bar; calibration border), atlas reachable via its relative URL, no console errors,
    page errors or failed requests. New CI job `e2e`; `test-results/` and `playwright-report/` are
    git- and Prettier-ignored.

### M1-05 — Remote-first input profiles

- **Goal:** the Samsung remote mapping and its quirks become data; binding contexts end action collisions.
- **Depends on:** M1-02, M1-04 (shell wires it).
- **Fills:** input-web `remote` (`→ implemented`), `rebind` (`→ partial`: profiles, context tables, persistence hook),
  `web-input`/`keymap` (extended); apps/tizen `platform` (registration list from the profile).
- **Deliverables:**
  - `content/input/remote-profiles.json` (kind `input-profiles`): profiles
    `tizen-remote-safe` (default on Tizen), `tizen-remote-diagonal`, `keyboard-default` (default on web),
    `keyboard-remote-emulation` (arrows with `lastWins`, Enter = OK, Backspace = Back, P = Play/Pause — lets desktop
    testers feel remote limits), `gamepad-standard`.
  - Profile schema: `{ id, label, device, context: { game: Bindings, menu: Bindings }, releaseDebounceTicks,
    diagonals: 'combine' | 'lastWins' | 'firstWins', socd: 'neutral' | 'lastWins', register: string[] }` with
    `Bindings = { byCode: { [code]: ActionName[] }, byKeyCode: { [keyCode]: ActionName[] }, buttons?: { [index]:
    ActionName[] } }`. `parseInputProfiles(json) → { profiles, issues }` (reuses core schema combinators).
  - `createReleaseDebouncer(ticks)`: keyup marks `releasedAt`; the key counts as held until `ticks` polls passed; a
    keydown inside the window cancels the release (no new `pressed` edge). Runs inside `poll()`.
  - Repeat filter: a keydown for an already-held key is ignored even without the `repeat` flag.
  - Diagonal policy per device: `combine` (both arrows), `lastWins`/`firstWins` (keep one per axis pair
    pressed-order). SOCD for Left+Right / Up+Down: `neutral` (default) or `lastWins`.
  - `WebInput.setProfile(profile)`, `WebInput.setContext('game' | 'menu')`; core `Game.inputContext` getter (the top
    scene decides; until M1-16 always `'game'`); shell calls `setContext` when it changes.
  - Tizen: `registerRemoteKeys` uses the active profile's `register` list (falls back to `REMOTE_KEYS_TO_REGISTER`).
  - apps/web dev overrides: `?profile=<id>`, `?debounce=<ticks>`.
- **Acceptance:** tests replay the probe scenarios as fake event sequences with timestamps: clean hold; fake
  keyup/keydown pairs 30 ms apart → continuous `held` with debounce 2 and a stutter with debounce 0; OK pressed while
  an arrow is held; two arrows under each diagonal policy; SOCD neutral/lastWins; menu vs game context resolve X/OK
  differently; profile validation errors; the default profiles resolve every action they name.
- **Manual (optional):** after the probe run, set `releaseDebounceTicks`/`diagonals` from its verdicts (§8.2).
- **Refs:** `shmup_feat.md` §4 (remote-first rules 1–8, SOCD, buffering), §27; `input_probe_spec.md`;
  `shmup_tech.md` §2.3.
- **As built:**
  - **File name.** The profiles live in `content/input/remote.input-profiles.json` (not
    `remote-profiles.json`): `pnpm content:check` enforces `<folder>/<name>.<kind>.json`. The folder
    has its `README.md` (format samples, validated by the content test) and
    `example.input-profiles.json`. Labels are upper-case for the bitmap font.
  - **Bindings chosen.** Remote game: OK = PowerUp, Back = Pause (D12), Play/Pause = Pause,
    Ch+ = Special, Ch− = Speed; remote menu: OK = Confirm, Back = Back, Play/Pause = Pause. Keyboard
    game: Z/Space Shot, X Sub, C/Enter PowerUp, V Special, Shift Speed, P/Esc/Backspace Pause; menu:
    Enter/Space/Z Confirm, X/Backspace/Esc Back, P Pause. Gamepad game: A Shot, B Sub, X PowerUp,
    Y Special, LB/RB Speed, Start/Select Pause; menu: A Confirm, B/Select Back, Start Pause.
    `keyboard-remote-emulation` has `device: 'remote'` (the core sees a remote), debounce 2,
    `lastWins` for diagonals *and* SOCD, PgUp/PgDn = Ch±. Remote profiles bind by `keyCode` only,
    so a desktop keyboard's arrows/Enter reach them through the keyCode fallback. Profiles register
    only D14's three keys (the colour keys stay in the no-profile fallback `REMOTE_KEYS_TO_REGISTER`).
  - **Validation beyond the schema** (`rebind`): every `game` table binds the four directions and
    Pause, every `menu` table the directions, Confirm and Back (rule 8); gamepad profiles bind
    `buttons` only (indices 0–31) with `releaseDebounceTicks: 0`; key profiles never bind buttons;
    only `remote` profiles `register`, never `Exit`/`VolumeUp`/`VolumeDown`/`VolumeMute`
    (`SYSTEM_REMOTE_KEYS`, also filtered by the Tizen `registerRemoteKeys`); ids are lower-case
    kebab, unique across files. A bad profile is dropped, the others kept.
  - **API.** `parseInputProfiles(data, path?)` (one file) plus `loadInputProfiles(files)` (all
    files, duplicate ids across files), `createInputProfileRegistry()` (its `load` is the content
    owner an app passes to the shell so it keeps the parsed profiles), `chooseInputProfile(profiles,
    candidateIds, devices)`, `overrideInputTuning(profile, tuning)` (`?debounce=`), the persistence
    hook `loadInputProfileChoice` / `saveInputProfileChoice` (`Platform.storage` key
    `input.profile`), default ids `keyboard-default` / `tizen-remote-safe` / `gamepad-standard`.
    Each profile is compiled once to per-context `tables` (`KeyBindings` + button masks); keys bound
    only in the other context are listed with mask `0` so they stay tracked and
    `preventDefault()`-ed in every context (`keymap.findKeyActions` returns `-1` for unbound keys).
    The placeholder types `RemoteTuning` and `DeviceBindings` were replaced by `InputTuning` and the
    profile types.
  - **Debounce semantics** (`remote.createReleaseDebouncer(ticks, capacity = 32)`): a key released
    between polls N and N+1 stays held for polls N+1 … N+ticks and is released on poll N+ticks+1;
    a keydown inside the window returns `'resumed'` (no edge, no latch). The keyboard source now
    tracks up to 32 physical keys in fixed slots, ages the debounce in `advance()` (called first in
    `WebInput.poll()`), and resolves `resolveDirections(mask, order, diagonals, socd)` on `held`
    with the event press order (SOCD first, then the diagonal policy; same-poll ties are
    deterministic). Gamepads use `createDirectionOrder()` per pad and are never debounced.
  - **Context switches without phantom presses.** A key or pad button held across a profile or
    `game`/`menu` switch keeps only the actions it has in both tables until released (holding X
    while a menu opens does not press Back). Keyboard: `setBindings()` intersects each held key's
    mask. Gamepad: `GamepadReadState` gained optional `pressedButtons` / `staleButtons` and
    `readGamepadActions()` a `previousButtons` table.
  - **Core.** `InputContext` / `INPUT_CONTEXTS` live in core `input`; `Game.inputContext` is a
    getter returning `'game'` until M1-16.
  - **Shell.** `ShellInput` requires `setContext()`; `bootShell` calls it once at boot and, before
    the ticks of a frame, whenever `game.inputContext` changed. The loader has
    `DEFAULT_CONTENT_OWNERS` (`input-profiles` → `loadInputProfiles`), merged under the
    `contentOwners` option — so `@shmup/shell` now depends on `@shmup/input-web` (allowed by §3.1).
  - **Apps.** Both apps pass their registry's `load` as the `input-profiles` owner and apply the
    profiles in the platform factory (after validation). Tizen: `tizen-remote-safe` +
    `gamepad-standard`, `createTizenPlatform({ registerKeys })` registers the profile's list (fallback
    `REMOTE_KEYS_TO_REGISTER`); a saved choice is applied once storage answers, re-registering its
    keys. Web: `?profile=` (unknown ids → `console.warn`, default used) › saved choice ›
    `keyboard-default`; `?debounce=` via the exported `inputOverridesFromSearch()`. Both apps expose
    the registry as `app.profiles`; `WebInput` exposes `context`, `keyProfile`, `gamepadProfile`.

### M1-06 — Sim world, tick pipeline, player ship & collision

- **Goal:** a `World` with the fixed tick order, the KESTREL ship moving under remote/keyboard/gamepad input, and the
  collision toolkit.
- **Depends on:** M1-01, M1-02, M1-04, M1-05.
- **Fills:** new core module `world` (`implemented`), `player` (`partial`), `collision` (`partial`: shapes + grid),
  `debug` (`partial`: `hashWorld`), `game` (World hosted by `createGame`), `config` (playfield constants).
- **Deliverables:**
  - `world/index.ts`: `createWorld(config, content)`, `stepWorld(world, input)` with the §3.2 phase list as an explicit
    ordered array of system functions (later steps fill the slots), `World` fields: `tick`, `rng` streams, `events`,
    `players[2]`, `camera` (static until M1-07), `status`, `hitStop`, `debugFlags`, pool registry, `view: WorldView`.
  - Constants: `PLAYFIELD_Y = 8`, `PLAYFIELD_W = 384`, `PLAYFIELD_H = 200` (D20).
  - `player/index.ts`: `PlayerShip { x, y, state: 'entering'|'alive'|'dying'|'dead'|'respawning', stateTicks,
    speedLevel, invulnTicks, bank, device }`; `createPlayer`, `updatePlayer`. Movement: direction bits → unit vector,
    diagonal × 0.7071 (D4), `speeds[speedLevel]` from `content/player/kestrel.player.json`
    (`speeds`, `hurtRadius: 1.5`, `terrainBox: { hw: 5, hh: 3 }`, `pickupBox: { hw: 8, hh: 6 }`, `margins`), no inertia,
    clamp to the camera view minus margins; ship moves with camera scroll (`x += camera.dx` before input). Bank frame
    from vertical intent. `entering`: 40-tick fly-in from the left, uncontrollable.
  - `collision/index.ts`: scalar-argument tests `circleCircle`, `aabbAabb`, `circleAabb`, `capsuleCircle`
    (point–segment distance²), `segmentAabb`; `CollisionLayer` bits; `createSpatialGrid(cellSize = 32, w, h)` —
    counting-sort build (count → prefix sum → fill, `Int32Array`s), `insert(id, minX, minY, maxX, maxY)`,
    `query(minX, minY, maxX, maxY, visit)` with a per-query stamp array to avoid duplicates.
  - `debug/index.ts`: `hashWorld(world)` — FNV-1a 32 over tick, RNG states, camera, player fields and every pool's
    live slots (fixed field order).
  - Allocation guard `packages/core/test/helpers/alloc.ts` (`measureHeapGrowth(fn, iterations)` using `--expose-gc`
    via the Vitest pool `execArgv`).
  - Shell/render: KESTREL drawn from the players batch view; web default scene becomes "free flight" in an empty
    starfield.
- **Acceptance:** movement per speed level, diagonal scale, clamps, 4-way-only input, fly-in; grid query equals
  brute force for 1,000 random boxes (property test); every shape test incl. edge contact; two worlds with the same seed
  and inputs give equal `hashWorld` after 5,000 ticks; heap growth < 256 KB over 10,000 `stepWorld` calls after
  warm-up; e2e: pressing arrow keys moves the ship (pixel diff).
- **Refs:** `shmup_feat.md` §5, §22 (architecture, tick order, collision), §3 (pixel-perfect camera).
- **As built:**
  - **World.** `WORLD_PHASES` is a frozen array of `{ phase, name, runsDuringHitStop, run }` in the
    §3.2 order (`WorldPhase` codes 0–8, `WORLD_PHASE_NAMES`); only `input` and `fx` run during
    hit-stop. Phase 1 writes per-player `PlayerIntent`s (`world.intents`: masks + `moveX/moveY`,
    opposites cancel); phase 3 applies a camera **scroll velocity** `camera.vx/vy` (0 = static)
    and records `dx/dy` — the hook M1-07's stage runner drives; phase 6 begins/builds
    `world.grid` (camera view + `GRID_MARGIN` 64 px); phase 8 flushes every registered pool;
    phase 9 counts hit-stop down and refreshes the view mirrors. `World` also carries `config`,
    `content`, `ship` (the resolved spec) and `playerBatch`; `WorldStatus` is
    `playing | bossWarning | stageClear | gameOver`. The pool registry (`register`, `flushAll`,
    `clearAll`) keeps each pool's arrays in sorted field order for the hash. The view has one
    batch (`LayerId.Player`), filled at creation too, so the first frame shows the ship.
  - **Player.** `PlayerShip` adds `slot`, `active` (P2 inactive until M2-06), `lives` and
    `moving` (movement input this tick — the D26 option trail). Extra API: `createPlayer(slot,
    lives)`, `spawnPlayer`, `setPlayerState`, `readPlayerIntent`, `playerBankFrame`,
    `resolvePlayerShip` (`kestrel` › first ship › `DEFAULT_PLAYER_SHIP`, the built-in fallback
    for an empty content DB, which is not drawn). Fly-in: camera-relative `ENTER_START_X` −24 →
    `ENTER_END_X` 64 at mid-playfield, cubic ease-out over the content's `enterTicks`;
    `respawning` flies in the same way (M1-12 decides when). Banking moves one step per tick up
    to `bankFrames` (frames: 0 level, 1…N up, N+1…2N down — the `ships/kestrel` order). Only
    `ships/kestrel` is drawn (the thruster sprite is not referenced by content).
  - **Collision.** `createSpatialGrid(width, height, cellSize = 32, capacity = 256)` instead of a
    leading default parameter; per tick `begin(originX, originY)` → `insert` → `build()` →
    `query`. Queries test the stored boxes exactly (closed boxes), so they *equal* brute force
    instead of returning cell candidates; boxes outside the area clamp into the border cells, and
    boxes spanning more than 9 cells go to an overflow list every query scans (no silent misses,
    no allocation). All shape tests are closed (touching = hit). Extra exports:
    `pointSegmentDistanceSq`, `COLLISION_MASKS`, `layersInteract`.
  - **Debug.** `hashWorld` also covers camera velocity, status, hit-stop and the players'
    `active` / `lives` / `moving`; numbers are hashed as little-endian doubles (`DataView`), the
    running hash lives in a `Uint32Array`, so the only allocation is the engine boxing the
    returned 32-bit value (≤ 16 bytes per call) — call it every few ticks, not per entity.
    `createDebugFlags()` added.
  - **Allocation guard.** `measureHeapGrowth(fn, iterations, warmup?)` runs the loop under V8's
    `GCProfiler` and adds the bytes in-loop collections reclaimed, so it measures *allocations*,
    not only retained growth (self-test in `test/helpers/alloc.test.ts`). `--expose-gc` reaches the
    core's workers through a new `execArgv` option of `defineShmupProject`.
  - **Game / shell.** `game.world` is the session's World, `game.events === world.events`,
    `renderFrame().world === world.view`. New shell module `flight` (the free-flight scene): its
    own `WorldView` = two starfield batches + the World's batches on the World's camera, its
    sprite table = the content's names + `FLIGHT_SPRITES`, and a HUD (bars, `1P`, `FREE FLIGHT`,
    stock icons, `ARROWS MOVE`). `ShellScene` is `flight` (default) | `showcase`
    (`?scene=showcase`) | `calibration`; `Shell.flight` added; the calibration scene renders the
    game frame without its world. `test/e2e/flight.spec.ts` finds the KESTREL by its hull colour.
  - The D20 playfield constants already existed (added in M1-04).

### M1-07 — Stage runtime: camera, timeline, checkpoints, terrain, parallax

- **Goal:** data-driven scrolling stages with tile terrain that kills, sorted event timelines and checkpoints.
- **Depends on:** M1-06.
- **Fills:** core `stage` (`→ implemented` for P0), `collision` (`+ terrain queries`), `data` (`stage`, `tileset`
  kinds); render-pixi `layers` (terrain + parallax drawing).
- **Deliverables:**
  - Stage schema (formatVersion 1): `id, name, music: { stage, boss }, length, camera: [{ x, speed, ramp?, yTo?,
    yTicks?, lock? }], checkpoints: [{ x }], parallax: [{ layer: 'far'|'mid', sprite, factor, y, spacing }],
    tilemap: { tileSize: 8, tileset, rowsTall: 25, rle?: string[] , generator?: HeightfieldSpec }, events: [...]`
    (sorted by `x`; unsorted is a validation issue). Event types for M1: `spawn`, `formation`, `warning`, `boss`,
    `music`, `speed`, `flag`, `end`.
  - `createStageRunner(stage, hooks)`: camera speed approaches the keyframe target over `ramp` ticks; vertical pans
    (`yTo` over `yTicks`); `lock` stops scrolling; fires every event with `x ≤ camera.x` in order (cursor index);
    tracks the last passed checkpoint; `restartAt(cp)` resets camera/cursor (binary search) and calls `hooks.clear()`.
  - Tiles: `Uint8Array` map (width × 25 rows); tileset file `content/tilesets/terrain-a.tileset.json`: per tile
    `type: 'empty'|'solid'|'hazard'`, `mask`: 8 column heights + `anchor: 'floor'|'ceiling'` (slopes, half tiles).
    `generator: 'heightfield'` expands `segments: [{ from, to, floor: { base, amp, period, seed }, ceiling: {…} }]`
    deterministically at load (no committed giant arrays; explicit `rle` rows stay supported for imports).
  - Terrain queries: `terrainSolidAt(x, y)`, `boxHitsTerrain(cx, cy, hw, hh)`, `findFloor(x, y, maxDist)`,
    `findCeiling(x, y, maxDist)` (NaN when none).
  - Player terrain box vs terrain → `playerHit(cause: 'terrain')` (resolved in M1-12; logged until then).
  - Renderer: terrain drawn with a preallocated tile-sprite grid (49 × 25) updated column-wise as the camera crosses
    tile columns; parallax layers as repeated sprites (no `TilingSprite` — WebGL1 NPOT restrictions).
  - `content/stages/test-range.stage.json` (dev/test stage); web dev param `?stage=<id>`.
- **Acceptance:** camera ramp values; events fire exactly once at their `x`, in order, including several on one tick;
  checkpoint restart cursor; heightfield generator deterministic; slope masks and `findFloor` on each tile shape;
  stage validation errors (unsorted events, unknown tileset); e2e: test-range scrolls with terrain visible.
- **Refs:** `shmup_feat.md` §14 (structure, data format), §10 (checkpoints), §22 (stage runtime, terrain collision).
- **As built:**
  - **Stage schema.** `music` is `{ stage, boss }` of `MUSIC_CUES` names (resolved to `stageId` /
    `bossId`); `lock` is a boolean (the M1-02 stub had a string). Keys: the first at x 0, strictly
    increasing; checkpoints strictly increasing; events non-decreasing (ties fire in file order);
    nothing past `length`; `yTicks` needs `yTo` — all load issues. Event types are exactly the M1
    list: the stub's `midboss` (back with M2-09), `scroll` (→ `speed`, with an optional `ramp`) and
    inline `checkpoint` (→ the `checkpoints` array) are gone; `spawn` lost `formation` / `count`
    (the `formation` event has `count` + `interval`); `path` stays a plain string until M1-08's
    `paths` kind. `flag` names (lower-case kebab, ≤ 32 per stage) are numbered per stage
    (`stage.flagNames` sorted, `event.flagId` = bit). The 0 → 1 stage migration stays identity
    (format-0 stubs now report schema issues; nothing shipped used them).
  - **Camera semantics.** A key applies at the start of the tick the camera reaches its x; its
    speed ramp is linear (exact at the end), its pan eased (`inOutQuad`, `yTicks` 0 / absent = one
    tick). A lock key stops the camera **exactly** at its x (movement is clamped to the first
    pending lock key, even with other keys before it in the same tick) and stays locked until
    `runner.unlock()`; scrolling then resumes at the key's speed. `speed` events take effect from
    the next tick; events fire on the tick the camera reaches their x, keys apply one tick later,
    so a key's speed overrides a speed event at the same x. The camera never passes `length`.
  - **Tilesets** are a new content kind `tileset` (`content/tilesets/<id>.tileset.json`, one per
    file: `id, sprite, tileSize, tiles[]`); tile id = index + 1. Each tile has a `name` and a
    `frame` (not in the plan — the art frame is data, not "tile n = frame n − 1"), `type`
    `empty | solid | hazard` (`empty` = decoration) and `anchor` + 8-column `mask`. `tileSize` is
    fixed at 8 (`TILE_SIZE`). `terrain-a.tileset.json` mirrors the M1-03 generator's 17 tiles; an
    integration test compares every mask with the opaque pixels of its atlas frame.
  - **Tilemap expansion** (`core/data/tilemap.ts`) runs as a third `loadContent` pass (tilesets
    are resolved by then) into `StageSpec.terrain` (`Uint8Array`, `cols = ceil((length + 384) / 8)`).
    `generator` is an object `{ type: 'heightfield', segments }` (the plan wrote the bare string):
    wave profiles sampled per tile boundary, quantised to half tiles, ≤ one tile per column, half
    heights left by half steps (the 22.5° pairs), ramping in from 0 at `from` and out by `to`; cells
    get the tile named `solid` (buried), `floor` / `ceiling` (flat, exposed) or the solid tile whose
    anchor + mask match (slopes) — a missing one is an issue. A floor wins over an overlapping
    ceiling. `rle` rows (`"<count>*<id>, <id>"`, numeric ids, exactly `rowsTall` rows) may be
    combined with the generator and overwrite it where non-zero.
  - **Terrain queries** (`core/collision`) take the map first: `terrainAt(map, x, y)` (the
    `TerrainType` code), `terrainSolidAt`, `boxHitsTerrain(map, cx, cy, hw, hh)` (returns the
    highest `TerrainType`, 0 = none; hazard beats solid), `findFloor` / `findCeiling` (surface y or
    `NaN`), plus `terrainRectHit(map, x0, y0, x1, y1)` on whole pixels (the World uses it — V8 boxes
    fractional arguments of calls it does not inline). Terrain tests are pixel-exact and half-open
    (a box resting on a surface does not touch it), unlike the closed shape tests. The placeholder
    `TerrainQuery` interface was replaced by `TerrainMap` + these functions.
  - **Runner.** `createStageRunner(stage, hooks, camera?)`; hooks are `event(code, event, index)`
    (numeric `StageEventCode`, every event, after the runner applied `speed` / `flag` / `end`) and
    `clear()`. `restartAt(checkpointIndex)` (-1 = stage start) re-derives speed, pan and flags from
    the keys and events before the checkpoint in live order (event before key on a tie, but the
    key at 0 before the events at 0 — the first tick applies it first), applies the runner part
    of the events at exactly its x as live play did on arriving (they re-fire on
    the next tick for the hooks only — `StageSlot.Replay`; keys at its x apply on that tick), sets
    the cursor by binary search, then calls `clear()`; `unlock()` releases a lock. It is a class whose
    timeline is compiled into typed arrays at creation and whose state is one `Float64Array`
    (`runner.state`, hashed by `hashWorld`): per-instance closures ("wrong call target") and
    megamorphic loads of the content objects (their shapes vary with optional fields) kept `tick()`
    out of optimised code and allocating in the allocation guard.
  - **World.** New sim option `GameConfig.stage: string | null` (default `null` = free flight with a
    static camera, the dev default until M1-16); `createWorld` throws a `RangeError` for an unknown
    id. `World` gained `stage`, `terrain` (a private copy of the tiles) and `parallax`; the World's
    hooks turn `music` into `SimEventKind.Music` (the stage theme is queued at creation), `end` into
    status `stageClear`, and `clear()` empties every pool (`spawn` / `formation` / `warning` / `boss`
    wait for M1-08 / M1-13). The camera is now a class instance (`createStageCamera()`): V8 shares
    the hidden-class tree of object literals by key order, and the new 6-key camera-key schema
    literal starting with `x` generalised the literal camera's `x` field to "tagged", so every
    fractional camera write allocated (caught by the M1-06 allocation guard).
  - **`playerHit`** lives in `core/player` as `playerHit(ship, cause, tick, debugFlags)` with the
    numeric `PlayerHitCause` (`Terrain`, `Contact`, `Bullet`, `Laser`); it ignores inactive,
    not-`alive`, invulnerable and god-mode ships and records `hitCause` / `hitTick` / `hits` on the
    ship (hashed). Phase 6 tests each alive ship's `terrainBox`.
  - **Render contract.** `ParallaxView` gained `spacing`; its `y` is the band's playfield row after
    the vertical camera scroll (`baseY − camera.y · factor`), `offsetX = (camera.x · factor) mod
    spacing` (both computed by `updateParallaxView` in phase 9). Bands are limited to `BG_FAR` /
    `BG_MID`, ≤ 8 per stage; a band repeats horizontally only (list it twice for two rows of
    128-px star tiles). `TerrainView` gained `tileFrame` (tile id → frame, -1 = undrawn).
  - **Renderer.** `layers` gained `createTerrainBinding` (a ring-buffered grid of **49 × 26**
    sprites — one extra row for vertical pans, capped at the map's rows — re-textured one column /
    row as the camera crosses tile edges, moved as one container at `round(−camera.x)`, which lands
    integer world positions on the sprite bindings' pixels) and `createParallaxBinding` (fixed
    sprites per band, one container offset per frame). `TerrainBinding.sync(view, camera)` takes the
    camera object (no boxed arguments). `PixiRenderer.bindWorld` binds them below the batches;
    `renderer.terrain` / `renderer.parallax` expose them.
  - **Shell / apps.** The free-flight scene passes the World's parallax and terrain through and
    drops its own starfield when a stage runs; the HUD title shows the stage name. `apps/web` reads
    `?stage=<id>` (`stageFromSearch`, checked against the content's stage ids by `contentStageIds`;
    an unknown id warns and flies in open space). The Tizen app has no stage parameter.
  - **Content.** `test-range.stage.json` (4800 px, speed ramps, a 2 px/tick section, a slow
    section, three heightfield segments with floors and ceilings, star parallax, checkpoints at 0 /
    1500 / 3000, `flag` and `end` events — no spawns until M1-08 ships enemies). The example stage
    was rewritten to the new format (RLE rows over `example.tileset.json`, formations, a boss lock).

### M1-08 — Enemies, behaviour scripts & movement

- **Goal:** data-defined enemies spawned by the timeline, moved by movers and driven by sleeping coroutines;
  formations that drop capsules.
- **Depends on:** M1-07.
- **Fills:** core `enemies` (`→ partial`), `patterns` (`→ partial`: runner + movers), new `behaviors` module,
  `data` (`enemies`, `paths` kinds).
- **Deliverables:**
  - `Enemy` objects in a `Pool` (64): `specIndex, x, y, vx, vy, hp, flashTicks, age, formation, mover state,
    script, wakeTick, flags (ground, invulnerable, settled, wasOnScreen), spriteId, animFrame`; end-of-tick mirror into
    `SpriteBatchView`s for `GROUND_ENEMIES`/`AIR_ENEMIES`.
  - Enemy spec: `id, hp, score, hurtbox { hw, hh }, sprite, anim { frames, ticks }, script, mover?, drop:
    'capsule'|null, ground: 'floor'|'ceiling'|null, settleTicks, explosion: 'small'|'medium'|'large', megaCrashImmune`.
  - Movers (per tick, no generators): `straight`, `sine(baseVx, amp, period, phase)`, `path(pathId, speed)` —
    Catmull-Rom splines precomputed at load into arc-length LUTs (`content/paths/*.paths.json`, points relative to the
    spawn point), `waypoint` (enter → stop → leave), `follow` (formation members replay the leader's recorded path with
    a tick delay; per-formation ring buffer), `groundCrawl` (snap via `findFloor/findCeiling`, reverse at edges),
    `homing` (`turnToward` with max turn rate), `aimedDash`.
  - Script runner: `Script = Generator<number>`; runner stores `wakeTick = tick + yielded` and calls `next()` **only on
    wake**; one reused `ScriptApi` per enemy (`self`, `target()` = nearest alive player, `setMover(...)`, `spawn(...)`,
    fire primitives from M1-09).
  - `behaviors/index.ts`: registry `id → factory`; M1 roster: `drifter.sine` (popcorn), `fan.loop` (formation flier),
    `carrier.straight` (capsule carrier), `turret.floor`, `walker.floor`, `hatch.spawner`, `rammer.aimed`,
    `orbiter.loop`. Content validation uses the registry as `knownScripts`.
  - Formations: table (32): `total, killed, escaped`; all killed with none escaped → capsule drop at the last kill +
    formation bonus event. Spawner handles `formation` events with `count`/`interval` via a pending-spawn ring.
  - Off-screen rules: no firing before `settleTicks` after first on-screen tick or while off-screen; despawn after
    leaving the view by 32 px (counts as escaped).
  - Enemy–player contact → `playerHit('contact')`.
- **Acceptance:** mover math (sine, spline arc-length spacing uniform ±0.5 px, follow delay), runner never calls
  `next()` while sleeping (spy), formation bonus only when complete, ground crawler stays on slopes, despawn/escape
  rules, spawner spacing, unknown script id is a content issue, allocation guard over a 64-enemy tick loop.
- **Refs:** `shmup_feat.md` §11 (archetypes, requirements), §22 (hybrid data layout); `shmup_tech.md` §4.6.
- **As built:**
  - **Content.** New kind `paths` (`content/paths/*.paths.json`: `paths: [{ id, points: [{ x, y }] }]`,
    2–64 points, consecutive points distinct, ≤ 16,384 px): a **centripetal** Catmull-Rom spline
    (no cusps between close points) baked by `core/data` `bakePath` into a 1-px arc-length table
    relative to the first point; the `path` mover translates it to where it starts and continues
    along the end tangent past the end. The enemy spec gained two fields the plan lacked —
    `params` (behaviour tunables by name, like weapons) and `child` (enemy ref for spawners) — and
    its optional fields get defaults at load (`anim` 1 frame, `mover` null, `ground` null,
    `settleTicks` 30, `explosion` small, `megaCrashImmune` false); `drop` is now
    `"capsule" | null`. Stage `path` is a `paths` ref (`pathId`); `spawn` / `formation` gained
    `screenX` (default 400 = 16 px past the right edge; negative = behind), `formation` gained
    `drop` (default capsule) and `bonus` (default 0). `homing.turnRate` is whole binary units.
  - **Script ids.** Weapon and enemy behaviours share `ContentDb.scripts`, so `KNOWN_SCRIPT_IDS` =
    the roster ∪ `WEAPON_SCRIPT_IDS` (the four M1-10 ids, kept in `behaviors` because a
    placeholder module may not export runtime values; M1-10 moves them to `weapons`). The shell's
    `loadGameContent` passes it by default and appends `checkEnemyBehaviors` (unknown `params`
    names, spawners without a `child`); `pnpm content:check` does the same.
  - **Behaviours.** `BehaviorDef { id, params (defaults), create(api, params), needsChild }`,
    `defineBehavior`, `createBehaviorRegistry`, `DEFAULT_BEHAVIORS` / `DEFAULT_BEHAVIOR_DEFS`;
    `createWorld(config, content, { behaviors })` takes a registry (tests). Roster:
    `drifter.sine`, `fan.loop` (leader on the spawn path, others `follow`), `carrier.straight`,
    `turret.floor` (faces the player; floor or ceiling by its spec), `walker.floor` (walk / stop),
    `hatch.spawner` (releases `child` while it may fire, at most `max`), `rammer.aimed` (enters
    with its spec mover, then `aimedDash`), `orbiter.loop` (spawn path, else waypoint). Fire
    patterns join in M1-09.
  - **Enemies.** 64 `Enemy` class instances in slot order (lowest free slot; `createPool` has no
    deterministic iteration) with states Free / Live / Removed (freed in phase 8). Flying enemies
    ride the camera by the camera position they last saw (`camX/camY`), so a spawn in phases 3–4
    (after this tick's camera move) is not moved twice; ground enemies are world-anchored and snap
    to the surface below / above their spawn y (mid-view by default; the view edge without
    terrain). `ScriptApi`: `self`, `spec`, `tick`, `rng`, `target()`, `setMover`, `spawn`,
    `onScreen()`, `canFire()`; `EnemySystem.damage` / `kill` (for M1-10 / M1-11) emit
    `Sfx EnemyExplode*` + `Particles` with the new `FX_CUES` registry and record the tick's kills,
    drops and bonus points in `EnemySystem.outcomes` (reset in phase 3) for M1-11 / M1-12.
  - **Formations.** The "pending-spawn ring" is the formation table itself (32 slots, next spawn
    tick per slot); every member spawns at the same view point; a member that cannot spawn counts
    as escaped. Completion (all killed, none escaped) → capsule drop at the last kill + the new
    `SimEventKind.FormationBonus` (7, param = bonus). The leader records a 256-entry
    `FollowTrack` in its frame; a leader killed or escaped while members are still out becomes an
    invisible, intangible **ghost** that keeps recording until the formation resolves (or it is
    128 px outside the view), so followers keep the path.
  - **Off-screen rules.** Escaped = was on screen and 32 px outside the view; an enemy never seen
    is removed 128 px outside or after 600 ticks. `canFire` = on screen, settled, not a ghost.
  - **Collision.** Hurtboxes enter the World grid with whole-pixel bounds (the grid is only the
    broad phase); contact is an exact circle-vs-box test → `playerHit(Contact)`, at most one
    accepted hit per ship and tick. `hashWorld` covers every enemy slot and the formation table.
  - **Allocation.** D29's coroutines keep two allocations: a generator object per spawned enemy
    and V8's `{ value, done }` result per wake (≈ 40 B); sleeping scripts cost nothing — the
    64-enemy guard measures ≈ 5 KB over 10,000 ticks. Hot-path rules found on the way (documented
    in the modules): no fractional arguments or return values across calls V8 may not inline
    (table sines inline, `atan2B` on scaled integers, `samplePath` / `pushSprite` / the track
    record inlined), `| 0` on `Math.ceil` bounds (−0 is not a small integer), and no
    `{ x: <schema>, y: <schema> }` literal (it made every `{ x, y }` literal's fields tagged —
    the render-pixi terrain guard doubled — so the path point shape is built by adding keys).
  - **Content / art.** `test-range` got a roster (`content/enemies/test-range.enemies.json`),
    three paths and a timeline using all eight behaviours; new pixel-map sprite
    `enemies/hatch`. The e2e stage test compares the terrain 30 frames apart (was 60): with the
    enemies drawn, parallel e2e workers ran up to 4 ticks per frame and the scroll left the
    test's 250-px shift window.
  - **Test pass fixes.** A `waypoint` with `hold: 0` now leaves on the tick after it arrives (it
    held one tick, like `hold: 1`); `EnemySystem.spawn` / `ScriptApi.spawn` return `null` for a
    fractional spec index (it passed the range check and threw a `TypeError`).

### M1-09 — Enemy bullets, lasers & attack patterns

- **Goal:** readable retro bullet patterns and telegraphed lasers, dodgeable with 4-way movement.
- **Depends on:** M1-08.
- **Fills:** core `bullets` (`→ implemented` for P0), `patterns` (`+ fire primitives`), `rank` (`→ partial`: constant
  rank from difficulty + `rankScale`).
- **Deliverables:**
  - Bullet SoA pool (512): `x, y, vx, vy, speed, angle, accel, angVel, minSpeed, maxSpeed, radius, sprite, anim,
    flags (dieOnTerrain, cancelable, grazed), age, delay, changeAt, changeSpeed, changeAngle`. Update: delayed bullets
    wait; if `accel`/`angVel` set → update speed/angle and recompute `vx/vy` from tables; move; die outside view + 16 px
    or on terrain (one tile lookup).
  - `spawnBullet(world, x, y, angle, speed, kind) → index | -1`; primitives callable from scripts (no allocation):
    `aimed(src, speed, kind)` (quantized to `config.aimDirections` = 32), `nWay`, `ring`, `spiral` (script-held
    state), `stack`, `spray` (gameplay RNG), `homing(turnRate, lifetime)`, `delayed`.
  - Enemy lasers (pool 16): origin (attached enemy index or fixed), angle, length, width, phases
    `telegraph → grow → active → fade`; capsule hitbox **only at full width**; `fireLaser(src, angle, length,
    { telegraph: 40, grow: 8, active: 60 })`. Render: 1-px blinking warning line, then stretched beam sprites.
  - Player vs bullets (brute force per player, circle vs hurt radius) and vs lasers (capsule) → `playerHit('bullet')`.
  - `cancelAllBullets(world, mode)` (sparkle events; points mode arrives in M2-02).
  - `rank`: `computeRank` returns the difficulty base (Normal = 2) in M1; `rankScale(rank, curve)` used for bullet speed
    and fire-rate multipliers so M2 only turns growth on.
  - Behaviours from M1-08 start firing (turret aimed, orbiter ring, walker aimed 3-way, hatch none).
- **Acceptance:** kinematics (accel/angVel/min/max), aimed quantization (32 steps), pool exhaustion drops quietly,
  terrain/off-screen culling, laser hitbox inactive during telegraph/grow, deterministic `spray`, cancel clears
  cancelable only, allocation guard with 512 live bullets.
- **Refs:** `shmup_feat.md` §12, §15 (rank hook), §20 (telegraphing), §22 (collision).
- **As built:**
  - **Bullet system.** `World.bullets` (`createBulletSystem(host)`, host = the World) owns both
    pools, registered as `enemyBullets` / `enemyLasers` (flushed in phase 8, hashed). The bullet
    pool *is* the `ENEMY_BULLETS` sprite batch (`bullets.batch`, a live view — no mirror). Fields
    as planned except: `anim` → `frame` (directional frame, `((a + 32) >> 6) & 7` for the 8-frame
    kinds) + `kind`; homing needs `turnRate` + `homing` (ticks left); `draw` holds the sprite flags;
    `flags` adds internal `AimOnLaunch` / `Dead` bits (a removed bullet stays in `[0, count)`
    until phase 8, so every loop skips `Dead`). Bullets **ride the camera** like flying enemies
    (`x += camera.dx`, delayed ones too), so patterns keep their shape and aimed shots stay aimed
    while the stage scrolls; lasers without a source ride it too. `delay n` = the first move `n`
    ticks after the tick's own (age counts moving ticks); a change at age `changeAt` (speed /
    angle `NaN` = keep, `AIM_AT_TARGET` = re-aim) applies before that tick's kinematics;
    acceleration clamps to `[minSpeed 0, maxSpeed 16]` (defaults). Culling is exact at view ±
    16 px; terrain is one `terrainAt` pixel lookup (bullets with `DieOnTerrain`).
  - **Kinds and sprites.** Bullet kinds are a built-in table (`BULLET_KINDS`, 9 kinds: round / oval
    / needle × pink / red / purple, M1-03's art, hit radius 2 / 2 / 1.5), not content (the pattern
    DSL of M2-02 brings content). Their sprites and the laser beam are **engine sprites**
    (`BULLET_SPRITES`, world `ENGINE_SPRITES`): `loadContent` got `extraSprites` (interned into
    `db.sprites`), the shell's `loadGameContent` passes `ENGINE_SPRITES` by default and
    `pnpm content:check` checks them against the atlas; without them bullets simulate but are
    hidden. New procedural art `lasers/beam-<colour>` (`scripts/assets/procedural/lasers.mjs`):
    8 frames of 4×8, frame `k` a band `k + 1` px tall.
  - **API.** `spawnBullet(owner, x, y, angle, speed, kind)` / `fireLaser(owner, src, angle,
    length, telegraph = 40, grow = 8, active = 60, width = 6, fade = 8)` /
    `cancelAllBullets(owner, mode)` take anything with `.bullets` (the World); positional timings
    instead of the plan's options literal (no per-call allocation); `src` is a `LaserSource`
    (`{ slot, x, y }` — an `Enemy` works; slot -1 = fixed). Angles accept `AIM_AT_TARGET`
    (nearest living player, snapped to the new sim option `GameConfig.aimDirections` = 32, a power
    of two 4–1024; straight left without a target). Bad kinds / angles and a full pool return -1
    quietly. Raw spawns are not rank-scaled; the primitives are.
  - **Fire primitives** (`core/patterns`): `fireAimed`, `fireNWay` (`step` = units between
    neighbours), `fireRing` (from `offset`), `fireSpiral` (returns the next angle — the
    script-held state), `fireStack`, `fireSpray` (two gameplay-RNG draws per bullet), `fireHoming`,
    `fireDelayed` (aimed at launch by default), `rankedWait`; they take the bullet system and a
    reused `BulletOrigin`. The enemy `ScriptApi` wraps them (`aimed`, `nWay`, `ring`, `spiral`,
    `stack`, `spray`, `homing`, `delayed`, `laser`, `fireWait`, `bullets`) from the enemy's
    centre and enforces the fire rule itself (off screen / unsettled / ghost → -1 / 0 fired).
  - **Lasers.** Each phase lasts exactly its tick count (one fired in phase 4 spends its first
    telegraph tick in that tick's update); drawn width `w·k/(grow+1)` growing, `w·(fade+1−k)/
    (fade+1)` fading; the warning line blinks 4 on / 4 off. Attached lasers keep their offset to
    the enemy; when it is removed or turns ghost, `detachLasers` removes a warning / growing
    laser and fades an active one. Hits use `PlayerHitCause.Laser` (the plan wrote `bullet`).
    At most one accepted bullet hit and one laser hit per ship and tick; an accepted bullet is
    removed; god mode / invulnerability let bullets pass.
  - **Cancel.** `CancelMode.Sparkle` only (points: M2-02); removes cancelable bullets **and**
    lasers; new `FX_CUES.BulletCancel` (3) particle events, at most `CANCEL_SPARKLE_LIMIT` (64)
    per call, evenly spread (the event ring is shared).
  - **Rank.** `computeRank` = the preset base rounded / clamped (`DIFFICULTY_RANK_BASE`: easy 0,
    normal 2, hard 4, arcade 6 — the "very hard" base); `rankScale(rank, curve)` with `RankCurve
    { perRank, perRankSq }` is exactly 1 at Normal (`1 + a(r−2) + b(r²−4)`), so content speeds and
    intervals are Normal values. `World.rank` (hashed) → `bullets.setRank` → `speedScale`
    (`BULLET_SPEED_RANK_CURVE`) / `fireScale` (`FIRE_RATE_RANK_CURVE`).
  - **Roster.** New tunables: `turret.floor` `fireTicks` 90 / `bulletSpeed` 1.5 (counted in
    `aimTicks` steps), `walker.floor` `spread` 48 / `bulletSpeed` 1.25, `orbiter.loop`
    `ringTicks` 120 / `ringCount` 8 / `bulletSpeed` 1.
  - **Render.** Render contract: `LaserView` + optional `WorldView.lasers`; render-pixi
    `createLaserBinding` (two sprites per slot — the line tinted once at creation, the beam picks
    the frame of its rounded width — because Pixi's tint and fractional scale writes allocate),
    bound by the renderer on `ENEMY_BULLETS` after the batches (`renderer.lasers`); the shell's
    flight scene passes the World's laser view through.
  - **Zero allocation (V8 findings).** The collision tests read the ship position from class
    fields copied once per call and the hurt radius from a field cached at creation (loads through
    `ship` / `host.ship` allocated heap numbers); `update()` holds both the bullet and the laser
    loop (a small loop-free wrapper stayed in Maglev and inlined the laser loop, boxing a number per
    tick); camera deltas are read once per update. The guards live in
    `test/bullets/bullets-alloc.test.ts` (own worker, 20k-tick warm-up): type feedback from the
    many small worlds of the functional suites skewed the measurement by an order of magnitude.
  - **Test pass fixes.** A bullet whose position turned NaN (a NaN speed or acceleration) was
    never culled — NaN fails every comparison — and "hit" every ship it was tested against; the
    cull test is now "not inside the view ± 16 px" and both contact tests "not within reach", so
    such a bullet goes on its next move and a laser with a NaN origin never hits.

### M1-10 — Player weapons (Type A) & Options

- **Goal:** always-on autofire with Gradius Type A weapons and up to four Options that copy them.
- **Depends on:** M1-09.
- **Fills:** core `weapons` (`→ partial`: Type A), `options` (`→ partial`: standard trail option).
- **Deliverables:**
  - Player-shot SoA pool (96). Weapon specs in `content/weapons/type-a.weapons.json`: `shot.basic` (7 px/tick, dmg 1,
    cap 2 per shooter), `double` (forward + 45° up; no refire until both are gone), `laser` (piercing beam: head moves
    10 px/tick, length grows to 64 px, moves vertically with its shooter, per-enemy hit cooldown 6 ticks, cap 1 per
    shooter), `missile.ground` (falls 45° down at 2.5 px/tick; on floor contact slides along `findFloor` at 3 px/tick;
    dies on walls/off-screen; cap 1 per shooter). Behaviour ids: `shot.straight`, `shot.double`, `laser.beam`,
    `missile.groundSlide`.
  - Autofire: main weapon every `config.autofireInterval` (4) ticks while `config.autofire || held(Shot)`, missiles
    every 10 ticks when equipped and `config.autofire || held(Sub)` (feat §4 rule 1). Autofire values are in
    `GameConfig` (replay header).
  - Loadout per player: `speedLevel, missile, main: 'basic'|'double'|'laser', options (0–4), shield`.
  - Options: per-player ring buffer (capacity 4 × spacing 12 + 1) of **screen-space** ship positions recorded only on
    ticks with movement input (D26); option k at `history[(k + 1) × 12]` converted back to world space; options
    fire every weapon with their own caps, pass through terrain, are invulnerable.
  - Damage resolution: enemy hurtboxes inserted into the grid each tick; each shot queries its cells; non-piercing
    shots die on hit; piercing shots keep a per-shot hit-cooldown table (`Uint8Array` 64 entries); armour/invulnerable
    parts → `clink` event, shot dies. Player shots die on terrain.
  - SFX events per weapon, rate-limited (≤ 1 per 4 ticks per cue).
  - Dev override `?loadout=full` (web only).
- **Acceptance:** caps per shooter incl. options, double refire rule, laser pierce + cooldown, missile slides on
  slopes and dies at walls, options bunch when idle during scrolling and spread when moving, grid-based hits equal a
  brute-force reference, score/explosion events on kills, allocation guard with full loadout.
- **Refs:** `shmup_feat.md` §7A (Type A), §7C, §8 (standard Option), §4 (autofire).
- **As built:**
  - **Content.** `type-a.weapons.json` lost its `refireTicks` so the new sim options
    `GameConfig.autofireInterval` (4) and `missileInterval` (10, both 1–60) drive Type A; a
    weapon's own `refireTicks` still overrides them. `shot.double` now draws `shots/double` (its
    angled shot; the forward shot of the pair is drawn, offset and sized like the main shot).
    Behaviour tunables live in `params` with defaults (`WEAPON_BEHAVIOR_PARAMS`: `ox` / `oy`
    spawn offset, `hw` / `hh` hitbox, `angle` for the Double's climb and the missile's fall,
    `maxLength` / `hitCooldownTicks`, `slideSpeed`, `frames`). New `checkWeaponBehaviors`
    (unknown params, a behaviour in the wrong slot, a non-weapon behaviour) runs in the shell's
    loader and `pnpm content:check`. Roles come from preset `type-a` (else the first preset, else
    the first weapon of each slot); **content without weapons fires nothing** (no built-in
    arsenal). `WEAPON_SCRIPT_IDS` moved to `core/weapons` (`core/behaviors` re-exports it).
  - **Config / loadout.** `GameConfig.loadout: 'default' | 'full'` (validated) is applied to every
    player at world creation (`applyLoadoutPreset`); `'full'` = speed level 2, Missile, Laser,
    four Options (shields: M1-11). `Loadout` is a class `{ main: MainWeapon, missile, options,
    shield }`; the speed level stays `PlayerShip.speedLevel`. Firing needs no button when
    `autofire || remoteMode` (remote mode forces autofire, as `GameConfig` documents).
  - **Shots.** `World.weapons` (`createWeaponSystem`) registers `playerShots` (96). Shooter id =
    `player × 5 + k` (k 0 = ship, 1–4 = Options); caps count per shooter and role, recounted
    at the start of phase 2; autofire timers per shooter (main, missile) restart only when
    something fired. Shots ride the camera like enemy bullets. The laser stores its head `x` and
    `length`, follows its shooter's `y` while that shooter is in play, is stopped by terrain at
    its head (then shrinks away), hits with its whole tail→head box and is drawn as 8-px
    `shots/laser` segments (a 192-slot `PlayerShots` mirror batch). The missile lands when its
    bottom pixel meets terrain (a solid pixel at the scan start = a wall → it dies), slides
    screen-relative at `slideSpeed` re-snapping with `findFloor` (steps of `ceil(slideSpeed) + 1`
    px up or down), dies at a higher step, falls again over a cliff.
  - **Hits.** Phase 6 `collide(grid)` records hits (non-piercing: the overlapping enemy with the
    lowest slot; piercing: every overlapping enemy with a zero cooldown, armour always, in slot
    order), phase 7 `applyHits()` applies them; a hit on an enemy already killed this tick is
    skipped (the shot flies on). The per-shot cooldown tables are a pool of `PIERCE_TABLES`
    (32) 64-entry `Uint8Array` tables (shot field `table` = index + 1) instead of one per shot
    slot; a piercing shot with no free table is not fired. `EnemySystem.damage` / `kill` gained
    `by` (the player credited) → `EnemyOutcomes.killBy`. New `SFX_CUES.Clink` (21); SFX are
    rate-limited per cue and pushed at whole pixels (fractional event arguments were boxed — the
    allocation guard caught it).
  - **Options.** `core/options` `OptionGroup` (class: trail ring buffer of 49 screen-space
    entries, `head`, `count`, positions). The trail also records every tick of a fly-in
    (`entering` / `respawning` move the ship without input), including the tick it ends, and is
    reset on its first tick (a fly-in of `enterTicks` ≤ 1 is over within that tick: the reset
    then happens on the ship's first `alive` tick, `stateTicks` 0);
    options hide while the ship is not `alive`. Drawn from their own batch on `LayerId.Player`
    before the ships; `OPTION_SPRITE` (`options/orb`) joined `ENGINE_SPRITES`.
  - **World / hash / apps.** Batches: ground, air, player shots, Options, ships, enemy bullets.
    `hashWorld` covers loadouts, option groups, autofire timers and the cooldown tables of live
    piercing shots. `apps/web` reads `?loadout=full` (`loadoutFromSearch`).
  - **Tests infrastructure.** `measureHeapGrowth` gained `attempts` (the steadiest of up to N
    measured windows, default 3, the first ≤ `settled` = 32 KiB ends the search — every guard):
    the stage-runner and terrain-scan allocation guards already failed now and then on `master`
    (one window in a lower V8 tier); the terrain guard also got a 20,000-call warm-up (after the
    default 1000 it measured ~47 KB of its 64 KB). The measured loop must stay in the same
    function as the warm-up loop (V8 optimises it on stack with `fn` inlined — moved into a
    helper, every guard allocated). `enemies-runtime` integration tests that assume "nobody shoots" now turn
    autofire off; a new one checks the autofiring KESTREL kills test-range enemies. New
    `test/e2e/weapons.spec.ts`.
  - **Test pass fixes.** A falling missile at a non-finite position (a NaN / infinite spawn
    through `spawnShot`) had its terrain pixel read as row 0 (`| 0`), so rock along the map's top
    row "landed" it: it slid on at y −2, inside the cull margin, instead of being removed. The
    landing test now only runs for finite positions and such a missile is culled on its first
    move (finite positions behave exactly as before; no hash changes).

### M1-11 — Power meter, capsules, Force Field & Mega Crash

- **Goal:** the Gradius meter loop, remote-friendly (OK = equip, optional Auto Power-Up).
- **Depends on:** M1-10.
- **Fills:** core `powerups` (`→ partial`: meter), `shields` (`→ partial`: Force Field), `config`
  (`powerUpMode` default `'meter'`, new `autoPowerUp`, `pickupMagnet`, `autoPowerUpOrder`).
- **Deliverables:**
  - `PowerMeter { cursor: -1..6 }`, slots `SPEED, MISSILE, DOUBLE, LASER, OPTION, SHIELD ('?'), MEGA ('!')`;
    `advanceMeter` (−1 → 0, wraps after `!`), `canEquip(slot)` (Speed < 5, Missile not owned, Option < 4, no active
    shield, Double/Laser not already current), `equipHighlighted` on the **`pressed` edge** of `PowerUp` (remote OK in
    game context); denied press → `denied` SFX. Double/Laser mutually exclusive.
  - Auto Power-Up: when the cursor lands on the next wanted slot of `autoPowerUpOrder`
    (default `SPEED, MISSILE, LASER, OPTION ×4, SHIELD`) and it is equippable, equip immediately.
  - Item SoA pool (32): capsule (world-space, drifts with terrain), 16-px magnet when `pickupMagnet`, pickup box vs item
    circle, 300 points, meter "ding"; every pickup counts (no merging, §6A).
  - Capsule sources: `drop: 'capsule'` enemies and completed formations (M1-08 hook).
  - Force Field: `{ hits: 5, maxHits: 5, iFrames }` absorbs bullets and enemy contact, not terrain (`absorbsTerrain:
    false`); 8-tick i-frames after a hit; three wear sprites; break event. `?` greyed while active.
  - Mega Crash: cancels all cancelable bullets (sparkles), destroys every non-boss enemy without
    `megaCrashImmune` (score awarded), screen-flash event, no boss damage.
  - `powerUpMode: 'direct'` is rejected by `resolveGameConfig` with "not implemented until M2-05".
- **Acceptance:** wrap/maxed rules, exclusivity, equip only on edges (holding OK does not re-equip), auto order,
  rapid successive pickups each advance, magnet pull, shield hits + i-frames + no terrain absorb, Mega Crash effects,
  headless run: formation kill → capsule → OK press equips Speed.
- **Manual (optional):** on the M7, equip with OK while holding an arrow; note whether the arrow drops (input probe
  question 2).
- **Refs:** `shmup_feat.md` §6A, §6C, §7A (`!` slot), §9 (Force Field), §4 rule 4.
- **As built:**
  - **Config.** `DEFAULT_GAME_CONFIG.powerUpMode` is `'meter'`; `resolveGameConfig` throws
    "GameConfig.powerUpMode 'direct' is not implemented until M2-05" (and rejects any other string).
    New sim options `autoPowerUp` (false), `autoPowerUpOrder` (`DEFAULT_AUTO_POWER_UP_ORDER`, ≤ 32
    names, validated, stored as a frozen copy) and `pickupMagnet` (**true** — D33 makes the magnet
    the remote-friendly default). The slot **names** live in `config` (`MeterSlotName`,
    `METER_SLOT_NAMES`: `speed missile double laser option shield mega` — `?` = `shield`, `!` =
    `mega`; the placeholder's `special` is gone) so `config` never imports `powerups`; `powerups`
    numbers them (`MeterSlot` 0–6).
  - **Meter.** `PowerMeter { cursor }` per player (`world.powerups.meters`), `advanceMeter`,
    `canEquipSlot(slot, ship, loadout, maxSpeedLevel)` / `equipSlot` (the plan's `canEquip(slot)`
    needs the state), `PowerUpSystem.canEquip(player, slot)`, `equippable(player)` (bit mask for
    the M1-16 HUD's greyed slots — the meter is **not drawn** until M1-16), `equipHighlighted`,
    `collect` (a capsule's effect). The Speed cap is the ship spec's `speeds.length − 1` (5 for the
    KESTREL). The press is read in phase 2 between `updatePlayer` and the weapons (a new weapon or
    Option fires that tick), for every active ship that is not `dying` / `dead`.
  - **Auto Power-Up.** The "next wanted slot" is the first order entry the loadout does not
    satisfy yet, re-evaluated at every pickup (so a broken shield or a lost level is wanted again):
    a slot listed `n` times wants level `n` capped at its maximum, a Double / Laser entry is also
    satisfied by any later Double / Laser entry (no ping-pong), `mega` is never satisfied.
  - **Items.** SoA pool `items` (32: `x, y, vx, vy, kind, age, flags`) with a built-in kind table
    (`ITEM_KINDS`: the capsule, sprite `items/capsule` — an engine sprite, 300 points) instead of
    content. Capsules stay in world space (`vx/vy` 0) and are culled 32 px outside the view; the
    magnet pulls an item within 16 px of an alive ship's pickup box towards the nearest such ship
    at 2 px/tick; pickups (item radius 5 vs the pickup box, closed) are found in phase 6 and applied
    in phase 7 in item order (lowest player slot wins a tie). `PowerUpSystem.outcomes` lists the
    tick's pickups with their points for M1-12's scoring. Every capsule of the enemy outcomes'
    drops (carriers, completed formations) is spawned at the end of phase 7; drops of kills made
    between ticks (tools) are picked up at the next phase 3 (`beginTick`, `dropsTaken` hashed).
  - **Events.** Pickup = `SFX MeterAdvance` (the "ding"); equip = `SFX PowerUpEquip` + the new
    `SimEventKind.PowerUp` (8: id = slot, param = player — for callouts / HUD flash); denied = the
    new `SFX_CUES.PowerUpDenied` (22); shield hit = `SFX ShieldHit`; break = `SFX ShieldBreak` + the
    new `FX_CUES.ShieldBreak` (4); Mega Crash = `SFX MegaCrash` + `SimEventKind.Flash` (param 12).
  - **Force Field.** The shield lives on the ship (`PlayerShip.shield: ShieldState`, like
    `speedLevel`); `Loadout.shield` was removed. `playerHit` hands every hit to
    `absorbShieldHit` first: an absorbed hit is accepted (the bullet is used up) but not recorded on
    the ship; bullets, lasers and contact are absorbed, terrain never. Shield-hit i-frames swallow
    hits for free, also for the bare ship right after the break (not terrain); they count down in
    phase 7 but not on the hit's own tick, so a hit on tick `t` blocks ticks `t+1 … t+8`. The M1-03
    sprite has **four** wear frames (fresh / worn / damaged / critical — fresh at 5 and 4 hits), not
    three; the shield blinks during its i-frames and is drawn from a `LayerId.Player` batch after
    the ships. `GameConfig.loadout: 'full'` now includes a Force Field.
  - **Mega Crash.** Equipping `!` arms it; it detonates in phase 7 of the same tick (after the shot
    hits), so its kills are scored and drop capsules like any other. New
    `EnemySystem.megaCrash(by)` (compiled `megaCrashImmune` table) kills every live non-ghost enemy
    that is not immune — armour does not protect; boss parts arrive with M1-13 and are not enemies.
  - **World / hash.** `World.powerups`; batches: the shields and the items are appended after the
    enemy bullets (earlier batch indices unchanged). `hashWorld` adds the meters, pending Mega
    Crashes, every ship's shield and `dropsTaken`. Rare events (a press, a pickup) run in cold code
    and cost a few bytes each; `test/powerups/powerups-alloc.test.ts` measures ≈ 20 KB over 10,000
    busy ticks (budget 64 KB).

### M1-12 — Death, respawn, checkpoints, lives & score

- **Goal:** the full life cycle with the three death-penalty presets.
- **Depends on:** M1-11.
- **Fills:** core `scoring` (`→ partial`), `fx` (`→ partial`: hit-stop/shake/flash requests), `player`
  (`→ implemented` for P0).
- **Deliverables:**
  - `playerHit` resolution: shield absorbs if allowed, else `dying`: large explosion + debris events, hit-stop 8 ticks,
    `cancelAllBullets`, music duck event, lives −1; `dead` 60 ticks; respawn by preset (D6):
    `arcade` → `stage.restartAt(lastCheckpoint)` with enemies/bullets/items/lasers cleared, loadout reset, cursor −1;
    `classic` → lose one level (Option → Laser/Double → Missile → Speed), shield lost, cursor kept, fly in at the current
    scroll; `casual` → keep loadout, lose shield, fly in. Invulnerable 150 ticks (blink flag), may fire.
  - Lives semantic: `lives` = ships including the current one; HUD shows `lives − 1` stock icons; 0 → `status =
    'gameOver'`.
  - `scoring`: `PlayerScore { score, displayDirty }`, `addScore(world, player, points)` (clamped at 99,999,990),
    session hi-score; values from content (enemy `score`, capsule 300, formation bonus from stage data).
  - `fx`: `requestHitStop(world, ticks)`, `requestShake(world, magnitude, ticks)`, `requestFlash(world, kind)` — sim
    timers + events; world skips phases 2–8 during hit-stop.
- **Acceptance:** each preset's outcome (loadout, cursor, camera, cleared pools), invulnerability timing, hit-stop
  determinism (hash equality across runs), game over, score clamping and per-player totals.
- **Refs:** `shmup_feat.md` §10, §15 (score, lives), §18 (hit-stop), §2 (death penalty).
- **As built:**
  - **Where the death happens.** `playerHit` still only *records* a hit (so every system of
    phase 6 sees the same ships); phase 7 turns a ship hit on this tick (`hitTick === tick`) into
    the death sequence after the shots' hits, the power-ups and the tick's score (`killShip` in
    `core/world`): `core/player` `killPlayer` (`dying`, `lives − 1`, never below 0), `SFX
    PlayerDeath`, `FX ExplosionLarge` + the new `FX_CUES.Debris` (5), `SimEventKind.Rumble`, the
    new `SimEventKind.MusicDuck` (9, `param` = `DEATH_MUSIC_DUCK_TICKS` 120), `requestHitStop(8)`,
    `requestShake(Medium, 20)`, `cancelAll(Sparkle)` (lasers too), then the penalty. A shield
    absorbs first as before; terrain passes the Force Field (D8), so a terrain death takes the
    shield with it.
  - **Timing.** `dying` lasts `PLAYER_DYING_TICKS` (24, counted after the hit-stop — the plan gave
    no length), `dead` `PLAYER_DEAD_TICKS` (60); the respawn decision runs in phase 2 right after
    the ships' timers (`lifecycleSystem`), so the fly-in's first tick is the next one. A
    `respawning` ship blinks from the start of the fly-in (`invulnTicks` = `enterTicks` +
    `respawnInvulnTicks`) and gets exactly `respawnInvulnTicks` on the tick control returns;
    `kestrel.player.json` and `DEFAULT_PLAYER_SHIP` now say **150** (was 120). The invulnerable
    ship fires (weapons only need `alive`).
  - **Penalties** live in `core/powerups` (`applyDeathPenalty`, `loseOneLevel` — `player` cannot
    import the weapons' values without a cycle), applied at the death: every preset loses the
    shield; `classic` one level (Option → Double / Laser → Missile → Speed); `arcade` everything
    and cursor −1 — and at the respawn `stage.restartAt(stage.checkpoint)` (whose `clear` hook is
    now `clearSession`: pools, enemies, weapons, power-ups, score counters); without a stage the
    same clear runs with no camera move; other ships in play (co-op) fly in again without a
    penalty. Every respawn flies in from the left edge of the current view.
  - **Game over** when every active ship is out (`playerOut`: `dead`, dead time over, no lives)
    — set after the last explosion and dead time, only from `playing` / `bossWarning` (never over
    `stageClear`). The out ship stays `dead`; the World keeps simulating.
  - **Scoring.** `ScoreBoard` (`scores[]` of `PlayerScore { score, displayDirty }`, session
    `hiScore` + `hiScoreDirty`, `setHiScore` for the save of M1-17) inside a `ScoringSystem`
    (`world.scoring`). `addScore(world, player, points)` as planned (floored, clamped, ≤ 0 / NaN /
    bad slots ignored). Crediting mirrors M1-11's drops: phase 7 (after pickups and Mega Crash)
    and phase 3 (kills made between ticks), each outcome once. `EnemyOutcomes` gained
    `bonusCount` / `bonusScore` / `bonusBy` so a formation bonus goes to the killer of its last
    member. `hashWorld` covers the scores and credit counters, not the hi-score.
  - **fx.** `FxState` (`world.fx`: shake magnitude / ticks / duration, flash ticks / kind, request
    ticks) + `requestHitStop` / `requestShake` / `requestFlash` (`FlashKind.MegaCrash` — Mega Crash
    now goes through it, same event) / `tickFx` / `shakeAmount`. Hit-stop now counts down only on
    ticks that started frozen (`fx.frozen`, set by `stepWorld`), so a request during tick `t`
    freezes exactly `t + 1 … t + n`; shake / flash count down every tick except their request's.
    `SimEventKind.Shake` carries the duration in `id`, `Flash` the kind in `id`. The screen view
    stays empty until M1-14.
  - **Shell.** The flight HUD shows player 1's score, `HI` and the hi-score, `lives − 1` stock and
    `GAME OVER` as its title; it rebuilds only on a change (clearing the dirty flags).
  - **Zero-allocation fixes found on the way.** The fly-in inlines `EASINGS.outCubic` (the call
    boxed its fractional argument and result — ~1.7 KB per respawn); cancel sparkles are pushed at
    whole pixels. New guard `test/world/world-death-alloc.test.ts` (a death every ~5 s, classic
    penalty, scrolling): ≈ 10 KB / 10,000 ticks. The co-op power-up guard now re-grants broken
    shields and uses the `casual` penalty: with `classic` deaths changing loadouts late, V8 left
    `core/weapons`' shot×enemy grid visitor deoptimised (Maglev, "insufficient feedback", never
    re-tiered in the run) and it boxed doubles (≈ 80 KB) — a tiering quirk to watch in M1-19's
    bench, not a per-death cost.
  - **Tests** that parked ships inside terrain, ran full ticks after a hit or played stages
    unattended now use god mode, top up lives, or run the bullet system's phases alone.

### M1-13 — Bosses & the WARNING sequence

- **Goal:** multi-part bosses with weak points and phases, presented with the WARNING intro and a proper death sequence.
- **Depends on:** M1-12.
- **Fills:** core `bosses` (`→ partial`: P0 mechanics), `data` (boss section of the enemies kind).
- **Deliverables:**
  - `Boss { specIndex, x, y, state: 'warning'|'intro'|'fight'|'dying'|'dead', phase, phaseTicks, parts[16],
    script }`, `BossPart { name, parent, localX, localY, hp, hurtbox, vulnerable: 'always'|'afterParts'|'whenOpen',
    requires: partMask, destroyed, open, spriteId, flashTicks }`; world transforms each tick (translation only in M1).
  - Boss spec in the enemies file: `boss: { code, displayName, parts: [...], phases: [{ until: { hpBelow | partsDestroyed
    }, script }], introTicks, score }`.
  - Parts share the enemy grid/damage path (`damagePart`); gated parts `clink`; phase changes by HP threshold or
    destroyed-part mask swap the running script.
  - WARNING: stage `warning` event → camera decelerates to a lock; `world.status = 'bossWarning'` for 180 ticks with
    siren SFX (critical), music stop, dim/flash events, and a WarningView (`text` built once at load from the original
    template in D10); then the boss enters (invulnerable intro) and boss music starts.
  - Death sequence: cancel bullets, chained explosions over 120 ticks (positions from the cosmetic RNG), final blast,
    hit-stop 5 ticks, score tally, stage-clear jingle event, `status = 'stageClear'` after 180 ticks.
  - `content/enemies/test-boss.enemies.json` used by tests (zone A's real boss comes in M1-18).
- **Acceptance:** part transforms, weak-point gating, phase transitions (HP and part-mask), warning timeline incl.
  scroll lock and music events, death sequence timing, score award, bullets canceled.
- **Refs:** `shmup_feat.md` §13 (presentation, mechanics), §19 (WARNING siren), §26 (no verbatim text).
- **As built:**
  - **Content.** A boss is an `enemies` entry with only an `id` and a `boss` section; every other
    enemy field must be omitted (an issue), while a regular enemy still needs `hp`, `score`,
    `hurtbox`, `script`, `sprite` and `drop` (now checked by the loader rather than the schema — a
    bad entry still fails its whole file). The loader fills the regular fields of a boss (`hp` = the
    cores' total, `score` = `boss.score`, `script` / `sprite` empty with ids -1, a 1-px hurtbox,
    `megaCrashImmune`, `boss: null` on regular enemies). The section: `code` (A–Z, 0–9, `-`, ≤ 8),
    `displayName` (upper case, ≤ 24), `introTicks` (default 120), `score` (tally points), home `x` /
    `y` (default 296 / 100), `parts` (1–16, **parents first**: `name`, `parent`, `x` / `y` — the
    plan's `localX` / `localY` —, `hp`, `hurtbox` (none = never hit or touched), `vulnerable` plus
    **`never`** (armour), `requires` (names → `requiresMask`), **`core`** (the plan did not say how a
    boss dies: when every core is destroyed; at least one, never `never`, with a hurtbox), **`gun`**
    (where the generic behaviours fire from), `open`, `sprite`, `anim`, `score` (points for the
    part), `explosion`) and `phases` (1–8: `script`, per-phase `params`, `until: { hpBelow (the
    cores' total), partsDestroyed + optional **`count`**, **`ticks`** }` — any one ends the phase;
    every phase but the last needs `until`, the last must not have one). After the references are
    resolved a fourth loader pass reports a `spawn` / `formation` event or a `child` naming a boss
    and a `warning` / `boss` event naming a regular enemy. New `content/enemies/test-boss.enemies.json`
    (TRIAL WARDEN, TW-00: armoured hull blocks, a `whenOpen` vent, a core behind two plates, two
    guns; phases: one plate down → `hpBelow` 12 → lanes) and `content/stages/test-boss.stage.json`
    (BOSS RANGE, `?stage=test-boss`). The example warden became a boss; the samples lost their
    redundant `boss` / `music` events (the WARNING brings the boss and its music).
  - **Runtime shapes.** `Boss` / `BossPart` are classes with numeric codes (`BossState` None /
    Warning / Intro / Fight / Dying / Dead instead of strings, `BossVulnerable`), one boss per World
    with 16 part slots. The boss moves by its own motion (`hold`, `track(speed, minY, maxY)` — the
    nearest player's height —, eased `moveTo`) instead of the enemy movers, which keeps
    `updateMover` monomorphic; it rides the camera (playfield position + camera). Parts are placed
    every tick parent + local offset (translation only; behaviours may move a part —
    `setPartOffset`). Destroying a part destroys the parts attached below it (each explodes and pays
    its score).
  - **Hit path.** Parts take the ids after the enemy slots (`BOSS_PART_ID_BASE` 64 + index,
    `MAX_HIT_TARGETS` 80) in the grid, the weapons' hit list and the laser sources. `core/weapons`
    tests parts in its grid visitor and applies their hits through `BossSystem.damagePart`, which
    answers a `BossHit`: `None` (the part went this tick — the shot flies on), `Clink` (the shot dies
    with the clink SFX — the whole boss during its intro, armour, `afterParts` with parts of its
    list left, `whenOpen` while closed), `Damaged`, `Destroyed`. Piercing shots keep a second
    cooldown table for the parts (`WeaponSystem.partCooldowns`, 32 × 16 — the enemy tables keep
    their layout); a clinking part ignores it like armour. Parts touch the ships during the intro
    and the fight (brute force over ≤ 16 parts). `BulletHost` gained optional `laserSources` (the
    World: enemies, then parts), so a part's laser can stay attached; a destroyed part detaches its
    lasers.
  - **Behaviours.** Boss behaviours are a second roster in `core/behaviors` (`BossBehaviorDef`,
    `defineBossBehavior`, `createBossBehaviorRegistry`, `DEFAULT_BOSS_BEHAVIORS`,
    `BOSS_BEHAVIOR_IDS` ⊂ `KNOWN_SCRIPT_IDS`) driving a `BossScriptApi` (fire primitives per part,
    open / close, `track`, `moveTo`): the generic `boss.hover` and `boss.lanes` (HB-01's own come
    with M1-18). `checkEnemyBehaviors` checks each phase's script is a boss behaviour and its
    `params`, and flags a boss behaviour named by a regular enemy. `WorldOptions.bossBehaviors`.
  - **WARNING.** The stage `warning` event: status `bossWarning` (only from `playing`), the new
    `StageRunner.brake(60)` (speed ramps linearly to 0, then locked; keys and `speed` events met
    meanwhile only record the resume speed; `unlock()` ramps back up over the same ramp; three new
    state slots, `STAGE_STATE_SLOTS` 22), `MUSIC Silence` (fade 30), the new `SimEventKind.Dim`
    (10: 50 % for 180 ticks), and on ticks 0 / 60 / 120 the siren (with the new `SfxPriority`
    hint `Critical` in `param`) and the new `FlashKind.Warning` (8 ticks). The render contract got
    `WarningView` (`WorldView.warning`), its text built per boss at world creation from
    `WARNING_TEMPLATE` — `WARNING!!` / `GIANT HOSTILE "<NAME>"` / `CLOSING IN - CODE <CODE>` (three
    lines that fit 384 px; D10's em dash is `-`, the font is ASCII). On tick 180 the boss flies in
    from where its leftmost part edge is 8 px past the right edge (cubic ease-out over
    `introTicks`), the status returns to `playing` and the stage's `music.boss` starts (`MUSIC
    Boss` in free flight). A `boss` event skips the WARNING and the brake; a boss event while a
    boss runs is ignored. The shell's flight scene draws the text centred on a translucent band
    (red / yellow every 16 ticks), rebuilding its UI list only on changes.
  - **Death sequence.** Counted in simulated ticks (a hit-stop pauses it, like the player's
    `dying`): the last core destroyed (in phase 7, or by `defeat()`) cancels every cancelable bullet
    and laser (sparkles), fades the music (60) and starts a small shake; the new `FX_CUES.BossChain`
    (6) + `SFX BossExplode` every 8 ticks; on tick 120 the final blast (the new `FX_CUES.BossBlast`
    (7), `FlashKind.BossBlast` 24 ticks, large shake 40, rumble per active player, hit-stop 5; parts
    no longer drawn); the tally on tick 121, the first after the hit-stop (the boss's `score` to the
    player who destroyed the last core, the new `SimEventKind.BossDefeated` (11), `MUSIC
    StageClear`); on tick 180 state `Dead`, status `stageClear` (from `playing` / `bossWarning`)
    and the scroll lock released — 185 World ticks after the kill with the hit-stop.
  - **Phases** are checked in phase 7 after the shots' hits (several in one tick when the next
    ones are met too); the new script first runs the next tick; the first phase's script runs on the
    fight's first tick. The timers advance at the start of phase 3.
  - **World.** `World.bosses`, `World.laserSources`; the boss batch (`AirEnemies`) is appended after
    the other batches. A checkpoint clear removes the boss and the WARNING, turns `bossWarning`
    back into `playing` and re-queues the stage theme when the boss had changed the music.
    `hashWorld` covers the boss, its parts, the WARNING and the piercing shots' part tables. The
    enemy system never spawns a boss entry; the Mega Crash leaves the boss alone.
  - **Allocation.** `test/bosses/bosses-alloc.test.ts`: a long fight ≈ 39 KB / 10,000 ticks, each
    timed state held (WARNING, intro, death chain) ≈ 18–30 KB, whole sequences every ~500 ticks
    ≈ 70 KB (own budget 128 KB: their once-per-boss code — a new phase generator, part explosions,
    the chain's RNG draws, the lukewarm part branch of the shot visitor — partly runs in V8's lower
    tiers, which box doubles; found with the in-process sampling heap profiler). `boss.hover` keeps
    its "never" timer a small integer: an `Infinity` generator local allocated a heap number per
    wake.
  - **Tests adapted.** The data fixtures' warden is a boss (a `boss` event naming a regular enemy
    became a spawn); the integration stage-restart run defeats a boss once it fights and plays on
    to the stage end; `enemies-runtime` compares the regular enemies only; the content test checks
    a boss's phase scripts and part sprites. New e2e `boss.spec.ts` (the WARNING band on
    `?stage=test-boss`, then the boss).

### M1-14 — FX & game feel

- **Goal:** explosions, sparks, hit flash, shake and popups that make hits feel good without hurting readability.
- **Depends on:** M1-13.
- **Fills:** render-pixi `particles`, `effects` (`→ implemented` for P0); shell event dispatch for `particles`,
  `shake`, `flash`.
- **Deliverables:**
  - `content/fx/particles.json` (kind `fx`): presets `explosion.small|medium|large`, `boss.chain`, `debris`, `spark`,
    `clink`, `bullet.cancel`, `pickup`, `muzzle` (frames, count, speed range, gravity, lifetime, blend).
  - Particle pool (256 sprites, additive blend on the FX layer), presentation RNG seeded per session, spawn from drained
    events with camera conversion; capped (oldest recycled).
  - Effects: hit flash via `@flash` frames (sim `flashTicks`), invulnerability blink (every 4 ticks), integer screen
    shake (3 magnitudes, decaying, global off switch), full-screen flash/dim overlay with a ≤ 3 flashes/s limiter, score
    popups (16 bitmap-text slots, 40 ticks).
  - Dev scene `?scene=fx-gallery` cycling every preset.
- **Acceptance:** particle pool reuse without allocation, event → preset mapping, shake decay sequence, flash limiter,
  draw-order test (bullets above explosions and items), e2e screenshot of the gallery non-blank.
- **Refs:** `shmup_feat.md` §18 (explosions, hit flash, draw order, shake, particles), §20.
- **As built:**
  - **Content.** The file is `content/fx/particles.fx.json` (the `<folder>/<name>.<kind>.json`
    rule), with `README.md` and `example.fx.json`. A preset is `id`, `sprite`, optional `frames`
    (indices played evenly over the lifetime; default all), `count` (× the event's intensity
    1–4, ≤ 64 a burst), `speed` / `lifetime` / optional `delay` ranges, optional `direction` /
    `spread` (degrees), `gravity`, `drag`, `radius` and `blend` (`add` default, `normal`). Events
    reach presets through **triggers** (`{ event: 'fx' | 'sfx', cue, preset, dx?, dy? }`, ≤ 4 per
    cue): `fx` = the `Particles` events' `FX_CUES` (every cue is bound), `sfx` = the sounds that
    imply a visual — `EnemyHit` → `spark`, `Clink` → `clink`, `MeterAdvance` / `CapsulePickup` →
    `pickup`, `PlayerShot` → `muzzle` (9 px ahead). This keeps the sim unchanged for hits,
    clinks, pickups and shots. An extra preset `shield.break` serves `FX_CUES.ShieldBreak`.
    Validated by render-pixi `loadFxContent` (min ≤ max, unique ids — first file in path order
    wins, known cues and presets); the shell owns the kind (`DEFAULT_CONTENT_OWNERS.fx`, and
    `bootShell` keeps the parsed content for the renderer); `pnpm content:check` checks the
    preset sprites against the atlas. Two new procedural sprites, `fx/sparkle` (cancel twinkle)
    and `fx/ring` (pickup ring), in `scripts/assets/procedural/particles.mjs`.
  - **Pool.** Particles live in **world pixels**; the camera is applied when they are drawn (not
    at spawn), so an explosion stays on the ground it happened on while the stage scrolls. The
    pool advances by **simulated ticks** (the renderer steps it by `frame.tick` deltas: frozen
    while paused, cleared when the tick goes back); a particle emitted between steps appears on
    the next step at age 0. The presentation RNG is the core's sfc32 seeded from the game's seed
    (`^ 0x2545f491`) but stepped on a typed-array state with 16-bit draws (closure words and
    32-bit returns are boxed by V8). Normal and additive particles have their own preallocated
    sprite sets (changing a sprite's blend mode rebuilds Pixi's render group).
  - **Ownership.** The renderer owns `particles`, `popups` and `effects` (`PixiRenderer` gained
    them plus `setFxContent`, and the options `effects`, `fxSeed`, `particleCapacity`);
    `render()` steps them and adds the event shake / flash / dim on top of `frame.screen`. The
    shell's `connectFxEvents(dispatcher, renderer)` (dispatch module) wires `Particles`, `Sfx`,
    `Shake`, `Flash`, `Dim`, `Score`, `FormationBonus` and `BossDefeated` — in free flight only.
  - **Effects.** The hit flash (`@flash` frames while `flashTicks > 0`) and the invulnerability
    blink were already sim-side (M1-10 / M1-12); nothing changed there. The shake mirrors the
    sim's `shakeAmount` tick for tick (a request is not counted down on its own tick) along a
    fixed 8-step jitter pattern; `EffectSettings.screenShake` is the off switch. Flashes use a
    look per `FlashKind` (Mega Crash white 0.85, WARNING red 0.35, boss blast white 1.0) and the
    limiter allows ≤ 3 starts per 60 ticks (1 with `reduceFlashing`, which also caps the opacity
    at 0.25). The WARNING's `Dim` event dims the **playfield** through a new overlay in the world
    group (under the flash and the HUD); `frame.screen.dim` stays the menu dim under the UI list.
  - **Score popups** need points and a place, so the core gained `SimEventKind.Score` (12,
    `id` = player, `x`/`y` = the kill, `param` = points): pushed by `core/scoring` for credited
    kills and by `core/bosses` for destroyed parts worth points (presentation only, not hashed).
    Formation bonuses and the boss tally pop up from their own events (gold). Capsule pickups
    push no popup — it would cover the ship.
  - **Dev scene.** `?scene=fx-gallery` (new shell module `fx-gallery`) cycles one station a
    second: every preset (three bursts), then shake small / medium / large, the three flashes,
    the dim and the popups; the World's events are not connected there.
  - **Tests / tooling.** The root `package.json` links `@shmup/render-pixi` (workspace) as a dev
    dependency so `content:check` can validate the `fx` kind. New e2e `fx-gallery.spec.ts` (web
    and Tizen builds: station label and warm explosion pixels, screenshot attached).

### M1-15 — Audio engine & procedural placeholder SFX/music

- **Goal:** low-latency SFX with voice management and looping music with ducking, fed by sim events, using generated
  placeholder sounds.
- **Depends on:** M1-14 (event dispatch), M1-13 (cues).
- **Fills:** audio-web `sfx`, `music`, `loader` (`→ implemented`), new `synth` module.
- **Deliverables:**
  - `synth`: pure-TS, deterministic PCM generation — `renderSfx(params, sampleRate) → Float32Array` with a ZzFX-style
    parameter set (volume, frequency, attack, sustain, release, shape sine/triangle/saw/square/noise, slide, pitch jump,
    repeat, modulation, bit-crush, tremolo; "randomness" from a seeded RNG, never `Math.random`) and
    `renderSong(song, sampleRate) → { pcm, loopStart, loopEnd }`: 4–6 chip channels (pulse 12.5/25/50 %, triangle,
    noise, saw), per-instrument ADSR, vibrato, arpeggio, patterns + order list, `loopFromOrder`. Mono 22,050 Hz for
    placeholders.
  - `content/audio/sfx.json` (kind `sfx`): every `SFX_CUES` name → `{ params | file, priority: 'low'|'normal'|'high'|
    'critical', maxInstances, volume }` (≈30 cues per §19 list incl. the WARNING siren wail).
  - `content/audio/music/*.song.json` (kind `music`): original chip songs `title`, `zone-a` (intro + ~45 s loop),
    `boss`, `stage-clear` (jingle, no loop), `game-over`.
  - `sfx`: bank of pre-rendered buffers, `play(cue, pan)` with per-tick dedupe, per-cue instance cap (steal oldest),
    global cap 14 (steal lowest priority, then oldest; `critical` never stolen), `StereoPannerNode` pan from x.
  - `music`: `play(track, { fadeInTicks })`, `stop(fadeOut)`, `duck(level, ticks)`; `AudioBufferSourceNode` with
    `loop/loopStart/loopEnd` from sample indices; only one track resident. OGG path ready: manifest entry
    `{ file, loopStart, loopEnd }` → XHR `arraybuffer` → decode through `OfflineAudioContext(2, 1, 32000)`
    (D22) — tested with a fake context.
  - `loader`: SFX rendered/decoded during boot; stage music prepared during the stage-intro/loading phase, never
    mid-stage.
  - Shell dispatch: `sfx` events → `sfx.play`, `music` events → music player; volumes from options (M1-17).
  - `scripts/audio-preview.mjs` (`pnpm audio:preview`): loads `synth` through Vite `ssrLoadModule` and writes WAV files
    to `assets/generated/audio-preview/` for listening.
- **Acceptance:** PCM hash stable for fixed params; loop points sample-exact; voice-manager policy (caps, stealing,
  critical, dedupe) against a fake `AudioContext`; ducking schedules gain ramps; event bridge mapping; `pnpm build`
  size check still passes.
- **Manual (optional):** on the M7, confirm SFX latency feels immediate and the loop seam is inaudible.
- **Refs:** `shmup_feat.md` §19 (music, SFX, voice management, buses, WARNING siren); `shmup_tech.md` §2.4, §4.3.
- **As built:**
  - **Content files** follow the `<folder>/<name>.<kind>.json` rule: the bank is
    `content/audio/main.sfx.json` (kind `sfx`) and the songs are `content/audio/music/<id>.music.json`
    (kind `music`, not `*.song.json`), with `content/audio/README.md` and two samples
    (`example.sfx.json`, `example.music.json`) next to the bank. The content test's naming check
    now takes the file's basename and allows two kinds (`sfx`, `music`) in the `audio` folder.
    `SFX_CUES` has **23** cues (the whole §19 list — one shot cue for every weapon), all bound; no
    cue was added, so the sim is unchanged. The WARNING siren wail is a square wave swept by a
    1.1 Hz modulation, 0.92 s long (it ends before the next of its three wails).
  - **Music binding.** A track declares the `MUSIC_CUES` name it answers (`cue`) and optionally
    the stages it is limited to (`stages`); `resolveMusicCues(content, stageId)` picks, per cue,
    the track bound to the running stage over the cue's default. The songs are original: `zone-a`
    (AZURE VERGE, 6.4 s intro + 44.8 s loop), `boss` (BULWARK ASSAULT, 2.7 s intro + 21.3 s loop),
    `title` (3.7 s + 14.9 s), `stage-clear` and `game-over` (jingles). `title` is prepared by the
    scene flow of M1-16; nothing plays it yet.
  - **synth.** Deterministic across engines: sines come from the core's committed
    `SIN_TABLE_Q16` (interpolated), pitch ratios from 13 literal constants — no `Math.sin` /
    `Math.pow` — and randomness / noise from the core's seeded sfc32. The SFX parameter set has
    the plan's fields plus `decay`, `sustainVolume`, `pitchJumpTime`, `modulationDepth`,
    `tremoloRate`, `duty` and `seed` (Hz and seconds; `slide` is linear Hz/s; `bitCrush` = samples
    held). Songs are a small tracker format: instruments (wave, ADSR, `vibrato`, `arpeggio`,
    `sweep` — per-tick effects), 4–6 channels (a content rule; the renderer takes any count),
    patterns of whitespace-separated **text tracks** (`C4:2`, `.`, `-`, `=`, `@instrument`) and
    an order list. A row is `round(rate × speed / 60)` samples, so loop points are exact sample
    indices; the loop region holds the loop's **steady state** (each channel is advanced through
    one silent pass from its last note-on — a note-on resets a channel — then rendered), so a note
    ringing over the loop end continues across the seam exactly as in an unrolled render (tested
    against an unrolled one-shot, for the shipped songs too). `renderSong` also returns the
    `sampleRate`; a one-shot song has loop points −1 and ends with its release tails (≤ 2 s).
    `pcmHash` (FNV-1a over the float bits) pins sounds in tests.
  - **New module `engine`** (`createAudioEngine`) composes `loader`, `sfx` and `music` into the
    object the shell feeds: `loadSfx()` (boot), `prepareMusic(stageId, cues)` (loading phase; one
    set resident — tracks outside the new set are released), `attach(graph)` (after the unlock),
    `playSfx(cue, screenX, priority)`, `playMusic(cue, fade)`, `duckMusic(ticks)`, `endFrame()`.
    The web-audio module gained the structural Web Audio types (`PlaybackContextLike`,
    `isPlaybackContext` …) every module is tested against; `IAudio` in the core was **not** grown
    (its "planned API" note is replaced — playback is event-driven through the shell).
  - **"One track resident"** is the music player's rule (a new track hard-stops the previous one, a
    fading one included). The boss theme must start mid-stage without rendering, so the engine keeps
    the stage's **music set** prepared — `stageMusicCues(stage)`: the theme and boss cues the stage
    names (`music.stage` / `music.boss`), the cue of each of its `music` events, stage clear and
    game over (`STAGE_MUSIC_CUES` is only `prepareMusic`'s default; `content:check` asserts every
    cue a shipped stage references is in its set and has a track); placeholders are mono 22,050 Hz
    float (zone A ≈ 4.5 MB). A music cue outside the prepared set is ignored (`missedMusic`), never
    rendered late; the track already playing is not restarted; `Silence` fades out over the event's
    ticks; a new track fades in over them. `MusicDuck` ducks to 0.35: a 4-tick fall, held for half
    the event's ticks, back to 1 at the end — all scheduled as `AudioParam` ramps
    (`source → fade gain → duck gain → music bus`).
  - **Voice manager.** Voices are freed by the context clock (a voice is free once its buffer has
    played out — no `onended` closures). Two rules beyond the plan: a cue at its instance cap
    restarts its oldest instance even when it is `critical` (the siren's next wail), and at the
    global cap a voice of **higher priority** than the new sound is not stolen — the new sound is
    dropped. The event's `SfxPriority` hint (the siren's `Critical`) overrides a cue's tier.
    **Dedupe is per drained frame** (`endFrame()` after each drain): events carry no tick number,
    and the ticks of one frame start their sounds at the same moment anyway. A cue's `volume` is
    baked into its samples; `bus: 'ui'` cues go straight to the `ui` bus, unpanned; `pan: false`
    keeps whole-screen sounds (siren, Mega Crash, 1UP) centred; the pan is ±0.6 at the playfield
    edges from the event's x relative to the camera.
  - **Loader / OGG path.** SFX are rendered at boot, before a context exists (the web creates it at
    the first gesture): prepared sounds keep their `Float32Array` until `attach()` copies it into
    an `AudioBuffer` (`createBuffer`) and drops it. A `file` (SFX or music) is fetched with XHR
    (`arraybuffer`, status 0 accepted for `file://`) and decoded through
    `OfflineAudioContext(2, 1, 32000)` (callback form); a file track's `loopStart` / `loopEnd` are
    counted at its `sampleRate` (default 32000) and scaled to the decoded rate. Tested with fakes;
    no audio file ships yet.
  - **Shell.** `bootShell` owns the `sfx` / `music` kinds (also in `DEFAULT_CONTENT_OWNERS`),
    renders the bank and prepares the booted stage's music set behind the progress bar
    (`LOADING SOUND` / `LOADING MUSIC`; open-space free flight prepares no music — so the Tizen
    app, which has no `?stage=`, plays SFX but no music until the scene flow and zone A arrive),
    fails with the new boot error `AUDIO FAILED TO LOAD` when a file cannot be loaded, attaches the
    engine right after `audio.unlock()` (which creates the context synchronously) and again when it
    resolves, connects `Sfx` / `Music` / `MusicDuck` in free flight (`connectAudioEvents`, dispatch
    module), calls `engine.endFrame()` after each drain and destroys the engine on `stop()`.
    `ShellOptions.audio` is `IAudio & Partial<AudioGraphLike>` (a `WebAudio` exposes `context` /
    `bus()`; a plain `IAudio` leaves the game silent); new `ShellOptions.audioLoader` and
    `Shell.audioEngine`. **Volumes from options** have nothing to read until M1-17's Options
    screen — the buses keep their defaults.
  - **Tooling / tests.** The root links `@shmup/audio-web` (workspace) as a dev dependency for
    `content:check`; the shell depends on it. `scripts/audio-preview.mjs` also prints each file's
    hash and a song's loop points, writes a looping song as intro + loop + loop (the seam can be
    heard) and takes `--out` / `--only` / `--quiet`. The apps' boot tests mock `@shmup/audio-web`
    partially now (the shell imports its loaders); shell tests that used `sfx` as an unowned kind
    use `campaign`. New e2e `audio.spec.ts` (web: the first key press unlocks audio and the zone
    theme loops at the song's exact sample indices; Tizen: shots play from boot). `boss.spec.ts`
    now polls for the boss after the WARNING (and needs two band-free captures in a row) instead of
    capturing once after a fixed 150 frames: on a loaded machine the loop runs up to 4 ticks a
    frame and the autofire destroyed the test boss before the late capture (seen on the
    pre-M1-15 build too). `stage.spec.ts`'s terrain-scroll check can still miss when a screenshot
    takes so long that the terrain moves more than its 250-px search window (also reproduced on
    the pre-M1-15 build under a load average of ~40); left unchanged.

### M1-16 — Scene flow, canvas UI kit & HUD

- **Goal:** Title → Game ⇄ Pause → Stage clear / Game over, all canvas-drawn and remote-navigable; the in-game HUD.
- **Depends on:** M1-15.
- **Fills:** core `scenes` (`→ partial`), `ui` (`→ partial`); render-pixi `ui` (HUD/UI layers in use); apps/tizen
  `boot` (direct Back-exit removed).
- **Deliverables:**
  - `SceneStack` (depth 8, transitions deferred to end of tick); scenes produce `DrawList`s and declare
    `inputContext`: `BootScene` (progress), `TitleScene` (logo, `PRESS OK`, menu START / OPTIONS / EXIT — EXIT only
    when `platform.exit` exists), `GameScene` (owns the World; Pause or Back → Pause), `PauseScene` overlay (RESUME /
    OPTIONS / RETRY STAGE / QUIT TO TITLE with confirm), `StageClearScene` (tally → "TO BE CONTINUED" in M1 → title),
    `GameOverScene` (OK or 10 s → title), `ConfirmDialog` overlay (YES/NO, default NO).
  - Platform resume while in `GameScene` pushes `PauseScene` (return to a paused game); Play/Pause toggles pause.
  - Back handling on Tizen through the scene stack: game → pause, pause → resume, menus → back, **title → exit
    confirm → `platform.exit()`**; remove `watchBackKey` exit from `apps/tizen/src/boot`.
  - UI kit (`ui`): `ListMenu { items, focus, disabledMask }`, `Slider`, `Toggle`, `Confirm`; `menuTick(menu, input)` with
    held-duration auto-repeat (18-tick delay, 6-tick interval, independent of device repeat) and a 4-tick input buffer
    for Confirm; builders `drawMenu`, `drawPanel`.
  - HUD (`buildHud(world, drawList)`, rebuilt only when dirty): top bar `1P 00012300  HI 00050000  2P ------`;
    bottom bar: stock icons, the 7-slot meter (`SPEED MISSL DOUBL LASER OPTN ? !`, highlighted slot flashing every 8
    ticks, un-equippable slots dimmed), shield indicator; numbers via the `number` op.
- **Acceptance:** stack semantics and deferred transitions; menu navigation incl. repeat timing, disabled items and
  wrap; headless flow title → game → pause → quit → title via snapshot inputs; Back on title opens the confirm and
  `exit` runs only after YES (fake platform); resume pushes pause; HUD rebuild only on change without allocation;
  meter command output; e2e: Enter starts the game from the title.
- **Refs:** `shmup_feat.md` §17 (scene flow, screens, HUD, UI kit), §23 (Tizen Back/exit), §4 rule 8.
- **As built:**
  - **Two ways to run a game.** `createGame(platform, overrides, content, options)` gained
    `GameOptions.scenes: 'boot' | 'title' | 'game' | null`. Without it the session is **bare
    gameplay** exactly as before (one World from creation, stepped every tick, nothing reacting
    to its status) — every earlier test, the tools and the shell's dev scenes use it. With it the
    core `scenes` flow runs: only the top scene ticks, `game.inputContext` is the top scene's,
    `game.scenes` is the `SceneFlow`, `game.world` is the game scene's World — **a fresh World per
    game start and per RETRY STAGE** (a scene transition, never a tick; the flow's constructor
    also creates a placeholder World so `game.world` is never null, and drops its queued stage
    theme). Every World of a session pushes into the game's one `EventQueue` (new
    `WorldOptions.events`), so the host drains one queue. `renderFrame()` then carries the World's
    view and HUD only while the game scene is visible (under overlays), the composed UI list, the
    top scene's dim (`screen.dim`) and as `tick` the **World's** tick while the game shows (frozen
    under the pause menu and the end screens, so the renderer's particles, the starfield and the
    HUD flash freeze; back to 0 for a new World, which clears the renderer's effects) — the flow's
    own tick count otherwise. `game.pause()` stays a host-level freeze; the pause menu is a scene.
  - **Stack.** `SceneStack` (depth 8, `push` / `pop` / `replace` / `reset`, hooks `enter` /
    `exit` / `cover` / `uncover`): requests made while a scene ticks are queued (≤ 8) and applied
    in order at the end of the tick (also those an `enter` hook makes, in the same flush; a runaway
    chain throws); requests outside a tick (a platform resume) apply at once. The method is
    `sceneAt(i)` — ESLint's Chrome-69 rule rejects any `.at(` call.
  - **Scenes** (classes, all created with the flow): `BootScene` holds until the host calls
    `finishBoot()` (the shell does after its loading phase, so the boot scene is only up for the
    first tick — the pre-renderer loading stays on the shell's 2D overlay bar); `TitleScene` —
    the new `ui/logo` sprite, blinking `PRESS OK`, then START / OPTIONS / EXIT (EXIT only when
    `platform.exit` exists; **OPTIONS is disabled until M1-17** — the disabled-item rule in use),
    the session hi-score, the title theme; `GameScene` — Pause **or Back** pressed by any player
    opens the pause menu (the remote's game table binds Back to Pause anyway), `stageClear` /
    `gameOver` push their screens after 90 / 30 more World ticks; `PauseScene` (dim 0.5) —
    Pause or Back resumes, RETRY STAGE restarts without a confirm, QUIT TO TITLE asks;
    `StageClearScene` — tally (score, hi-score) 240 ticks → `TO BE CONTINUED` 240 ticks → title,
    OK skips; `GameOverScene` — OK / Back after a 30-tick lock or 600 ticks → title;
    `ConfirmDialog` — YES / NO focused on NO, purpose `Exit` (pops, then `platform.exit()`) or
    `QuitToTitle` (reset to the title). Back on the title opens the exit confirmation when the
    platform can exit, else (browser) it backs out of the menu to `PRESS OK`. A platform resume
    with the game on top pushes the pause menu. The session hi-score carries into every new World
    and the title (`SceneFlow.setHiScore` for M1-17's save). Menus answer to **any player's**
    input (`mergeMenuInput`). Menu sounds (`MenuMove` / `MenuSelect` / `MenuBack` /
    `PauseToggle`, all on the unpanned UI bus — a denied Confirm also plays `MenuBack`) and the
    title / stage-clear / game-over music (and a `Silence` fade when a game starts) go through the
    event queue.
  - **UI composition.** The frame has one UI draw list: every visible scene (the top one and the
    overlays' base) draws into it bottom to top through its own **string-slot range**, rebuilt only
    when a visible scene's `uiRevision` or the visible set changed. The confirm dialog therefore
    sits over the pause menu, which stays visible; its panel is opaque. The boss WARNING band
    moved from the shell's flight scene into `GameScene.drawUi` (same look).
  - **UI kit.** `ListMenu` items are actions, `Slider`s or `Toggle`s (Left / Right change them,
    Confirm flips a toggle); `menuTick` / `confirmTick` return a numeric `MenuResult`. The
    held-duration repeat fires on the press, after 18 ticks, then every 6 (the last pressed
    direction; a latched tap acts once). **Confirm buffer:** a press refills a 4-tick buffer; a
    widget's `lockTicks` (menus lock 2 ticks when they open) hold back *activation only* — the
    focus still moves and Back still answers — and the buffered press activates when the lock
    ends if it is at most 3 ticks old. Layouts passed to `drawMenu` are frozen constants (a literal
    per redraw would allocate).
  - **HUD.** `buildHud(world, list, sprites)` + `Hud.update(world, list)` (change detection over
    the scores' / hi-score's dirty flags, lives, player 2, the meter cursor, the equippable mask,
    the flash phase while a slot is highlighted, the shield). Layout: `1P` at x 8, `HI` at 156,
    `2P` at 292 (numbers 16 px after, 8 digits, the `number` op; `------` while player 2 is out);
    bottom bar: up to 5 stock icons (more: one icon and the count), the meter's seven 40-px
    `hud/meter-slot` boxes from x 58 (frame 1 highlighted on the "on" half of an 8-tick flash,
    frame 2 when the slot cannot be equipped) with the `hud/meter-labels` frames (the atlas labels
    read `SPEED MISSILE DOUBLE LASER OPTION ? !`), the Force Field as five pips from x 344. A
    content table without the UI sprites falls back to rectangles. The UI sprites (`UI_SPRITES`:
    `hud/life`, `hud/meter-slot`, `hud/meter-labels`, `ui/logo`) joined the core's
    `ENGINE_SPRITES`, so every host interns them and `content:check` verifies them.
  - **Logo.** New procedural sprite `ui/logo` (`scripts/assets/procedural/ui.mjs`: original 5×7
    block letters ×3, gradient, outline, shadow — 165×27). The atlas page grew to 512×512.
  - **Shell.** `ShellScene` gained `'game'` — the scene flow — **as the default** (`?scene=`
    missing or unknown); `?scene=flight` keeps the old bare-gameplay free flight (with its own dev
    HUD), which the gameplay e2e specs now open. New module `scene-view` (`createSceneView`): the
    flow's frame plus a drifting starfield behind the title (a pre-bound backdrop view) and under
    a game in open space (a wrapper view built once per World; a stage's own view as is), the
    camera the audio pans against (`follow()`), and a count of new Worlds (the shell clears the
    particles and popups then). The flow prepares the title theme with the stage's music set (and
    the stage-clear / game-over jingles in open space) and calls `finishBoot()` after loading. The
    canvas carries `data-shmup-scene` (the top scene's id, or the dev scene). `Shell.sceneView`,
    `SCENE_ATTRIBUTE`.
  - **Tizen.** The Back watcher no longer exits the running app: it is installed before boot and
    removed once the shell runs, so Back still exits from the loading and boot error screens (the
    root screen then) and the scene stack owns it afterwards (title → confirmation → YES →
    `platform.exit()`). The render-pixi `ui` module is marked implemented (unchanged code).
  - **Tests.** Core: `test/ui/ui.test.ts` (navigation, wrap, disabled, repeat timing, buffer,
    sliders / toggles, prompt, builders), `ui-hud.test.ts` (exact meter commands, flash, pips,
    fallbacks, change detection), `ui-alloc.test.ts`, `test/scenes/scenes.test.ts` (stack),
    `scenes-flow.test.ts` (the headless title → game → pause → quit → title run, exit only after
    YES on a fake platform, resume → pause, retry, end screens, frame composition, lockstep),
    `scenes-alloc.test.ts`, `test/game/game-scenes.test.ts`. Shell: boot tests of the flow,
    `scene-view` tests. Apps: title start and Back through the stack. New e2e `scenes.spec.ts`
    (web: Enter starts the game from the title, Esc pauses — dimmed and frozen — and resumes;
    Tizen from disk: OK starts, Back 10009 pauses and resumes); `boot.spec.ts` checks the title
    by default and free flight with `?scene=flight`.

### M1-17 — Saves, audio options & platform integration

- **Goal:** persisted hi-scores and options, an Options screen with audio sliders and the remote-profile choice.
- **Depends on:** M1-16.
- **Fills:** core `save` (`→ implemented` v1), `config` (`UserOptions`).
- **Deliverables:**
  - `SaveData v1 { version, options: { audio: { master, music, sfx }, input: { profileId }, display: {} }, hiScores: {
    [modeKey]: HiScoreEntry[10] }, stats }`; `loadSave(storage)` (key `save.v1`, migrations `SAVE_MIGRATIONS[n]`,
    corrupt JSON → defaults + copy to `save.corrupt`), `writeSave(storage, data)` only on change (menu close, game over).
  - `OptionsScene`: MASTER / MUSIC / SFX sliders (0–10, live via events → `audio.setBusVolume`), CONTROLS → remote /
    keyboard profile selector showing the profile label (e.g. `SAFE 4-WAY (DEFAULT)`), BACK saves.
  - Hi-score: loaded at boot; game over inserts into the table (name `---` until name entry in M2-15).
  - Shell: load save before the title; apply volumes and the input profile; boot time measured and exposed for the debug
    overlay; `blur` clears held input.
- **Acceptance:** round trip; v0 fixture migrates; corrupt save fallback; options change bus volumes (fake audio) and the
  active profile (fake input); hi-score persists across a new game instance on the same memory storage.
- **Manual (optional):** on the M7: change volume, quit with Back → YES, relaunch — settings and hi-score persist.
- **Refs:** `shmup_feat.md` §21 (options, saves), §23 (Tizen lifecycle), §3 (pause on hidden).
- **As built:**
  - **Save format** (`core/save`, `implemented`). `SaveData v1 { version, options, hiScores,
    stats: { gamesStarted, gameOvers, stagesCleared } }` under the key `save.v1` (the web / TV
    adapters prefix `shmup-cup:`). The key stays `save.v1` for the format family; the document's
    `version` field drives the migrations (`SAVE_MIGRATIONS[n]`: n → n + 1; no `version` = 0). The
    "v0" of the acceptance is the pre-release layout of the skeleton's placeholder `SaveData`
    (flat `hiScores` list, float volumes `masterVolume` … 0–1, `profile`, `unlocks`) — it becomes
    the `meter-normal` table, levels 0–10 and `input.profileId`; unlocks are dropped (none in v1).
    Loading never rejects: JSON → migrations → a field-by-field sanitiser (volumes clamped, bad
    rows dropped, tables sorted best first and cut to 10, ≤ 32 tables, bad mode keys dropped);
    unparsable JSON or a non-object is `corrupt`, a newer / malformed version `unreadable` — both
    fall back to defaults and copy the text to `save.corrupt`. Hi-score rows reuse the
    `core/scoring` `HiScoreEntry` that already existed (name `---`, score, `reached` = stage id or
    `''`, `mode` `1p`, difficulty); the table key is `hiScoreModeKey(config)` =
    `<powerUpMode>-<difficulty>` (`meter-normal`). A score enters when it beats the 10th row, ties
    go below the older rows, a score of 0 never enters. **`SaveStore`** (`createSaveStore`) holds
    the frozen document and the text last written; `flush()` writes only when the serialised
    document differs (best effort — never rejects, retries after a failed write), so "write only
    on change" is the store's job; `writeSave` writes unconditionally.
  - **User options** (`core/config`): `UserOptions { audio: { master, music, sfx } (levels
    0–10), input: { profileId | null }, display: {} }`, `DEFAULT_USER_OPTIONS` (all volumes 10 —
    the current mix), `resolveUserOptions` (defensive), `volumeGain(level) = (level / 10)²` (a
    perceptual curve), `InputProfileChoice { id, label }`.
  - **Live options through events.** New `SimEventKind.UserOption` (13, appended) with
    `UserOptionKind` MasterVolume / MusicVolume / SfxVolume (param = level) / InputProfile (param =
    index into the flow's profile choices). The shell's new `connectOptionEvents` sets
    `audio.setBusVolume(bus, volumeGain(level))` — **the SFX level drives the `sfx` and the `ui`
    bus** (menu sounds follow SFX) — and asks the app to apply the profile; `applyAudioOptions` does
    the same from the save at boot.
  - **Options screen** (`core/scenes` `OptionsScene`, an overlay with dim 0.5): opened by
    OPTIONS on the title and on the pause menu (both **enabled** now; the tests that navigated past
    the disabled item were updated). MASTER / MUSIC / SFX sliders (0–10, step 1, the UI kit's
    held-direction repeat), CONTROLS — a new UI-kit widget **`Choice`** (`MenuItemKind.Choice`,
    `createChoice`: Left / Right step and wrap, OK steps forward; `menuStringSlots` adds one slot
    per choice for its label) — and BACK. Every change is pushed live; BACK or the Back button
    stores the options (the profile id only when CONTROLS changed) and flushes the save. CONTROLS is
    disabled (showing `DEFAULT`) when the host offers no profiles. OK on a slider is silent.
  - **Hi-scores in the flow.** The flow plays with `GameOptions.save` (or a memory-only store):
    the session hi-score starts from the saved best of its mode; the **game-over and stage-clear
    screens** (M1's run ends at the stage clear) insert every playing player's score, count the
    stat and flush; the game-over screen shows `NEW HI-SCORE` under its panel for a new best.
    Quitting or RETRY does not record (arcade rule). Each game start counts `gamesStarted`.
    `SceneFlow` gained `options`, `save`, `modeKey`, `inputProfiles`, `activeInputProfile`;
    `GameOptions` gained `save` and `inputProfiles` (`InputProfileSetup { choices, active }`).
  - **Profile choice lives in the save now** (`options.input.profileId`): the apps no longer read
    input-web's separate `input.profile` key (`loadInputProfileChoice` / `saveInputProfileChoice`
    stay exported, unused). New input-web `selectableKeyProfiles(profiles, 'code' | 'keyCode')` /
    `inputProfileChoices(…, defaultId, extra)`: a host offers only profiles whose **menu** table its
    keys can drive (web: `keyboard-default`, `keyboard-remote-emulation`; TV: `tizen-remote-safe`,
    `tizen-remote-diagonal`), so a choice can never lock the player out; a saved id outside that
    set is ignored. The platform default is labelled with ` (DEFAULT)`. The shipped labels became
    `SAFE 4-WAY`, `FAST 8-WAY`, `KEYBOARD`, `KEYBOARD AS REMOTE` (→ `SAFE 4-WAY (DEFAULT)` on the
    TV). The web app's `?profile=` override wins over the saved choice (not over a pick in the
    Options screen) and is offered in CONTROLS too; the TV registers the new profile's keys.
  - **Shell.** New `ShellOptions.inputProfiles` (`choices()` / `active()` / `apply(id, 'save' |
    'options')`) and `ShellOptions.now`. After the platform exists (it provides the storage) the
    shell awaits `loadSave(platform.storage)`, applies the volumes and the saved profile, then
    creates the game with the store and the profile choices — in the dev scenes too (volumes,
    profile; bare gameplay ignores the store). `Shell.loadedSave`, `Shell.save`,
    `Shell.bootTiming { startMs, readyMs, bootMs }` (clock default `performance.now()`, so
    `readyMs` ≈ the launch time) and the canvas attribute `data-shmup-boot-ms`
    (`BOOT_MS_ATTRIBUTE`) for the debug overlay of M1-19. A window `blur` listener clears held
    input (removed on `stop()`).
  - **Tests.** Core: `test/save/save.test.ts` (round trip, the v0 fixture
    `test/save/fixtures/save-v0.json`, corrupt / unreadable fallback, sanitising, insertion,
    the store's write-on-change and failures), `config-user-options.test.ts`, `ui-choice.test.ts`,
    `scenes-options.test.ts` (live events, saving, hi-scores, the hi-score persisting across a new
    game instance on the same memory storage), `scenes-options-alloc.test.ts`. input-web:
    `rebind-choices.test.ts`. Shell: `dispatch-options.test.ts`; boot tests for the save (fake
    audio volumes, fake app profiles, corrupt save, Options end to end, blur, timing). Apps: the
    saved choice through the save, CONTROLS entries, a live switch (the TV registering keys). New
    e2e `options.spec.ts` (web: a MUSIC change saved on Back, read again after a reload; boot
    time < 10 s).

### M1-18 — Zone A content, boss & 4-way playtest bot

- **Goal:** the actual vertical-slice level: AZURE VERGE with the HALCYON BULWARK boss, balanced for the remote.
- **Depends on:** M1-17.
- **Fills:** content only + `test/playtest/`; new behaviours in core `behaviors`; new sprite sources/generators; new
  songs.
- **Deliverables:**
  - `content/stages/zone-a.stage.json` (~9,000 px, 3½–4½ min): (1) tutorial popcorn + first carriers
    (0–1,500); (2) fan formations and rammers (1,500–3,500); (3) floor/ceiling corridor with turrets, walkers, hatches
    (3,500–6,000, checkpoint at 3,500); (4) orbiters + high-speed section at 1.5 px/tick (6,000–8,000, checkpoint at
    6,000); (5) calm pre-boss with 2 capsules (8,000–8,600) → WARNING → boss. ≥ 12 capsule sources before the boss;
    ≥ 3 within 900 px after each checkpoint (recovery rule §10).
  - `content/enemies/zone-a.enemies.json` (6–8 types) and boss **HALCYON BULWARK (HB-01)**: invulnerable hull, 4 shield
    plates (hp 12) in front of the core (hp 40, vulnerable after plates), top/bottom emitters firing telegraphed
    horizontal lasers in alternating lanes, aimed 3-way once two plates are down, slow vertical tracking; all lanes
    reachable with 4-way movement.
  - 4-way design rules encoded as a content test: aimed bullet speed ≤ 2.0 px/tick, no simultaneous laser lanes
    leaving < 16 px of safe gap.
  - Sprites (pixel-map sources / generators) and songs `zone-a`, `boss`.
  - `test/playtest/`: `runStage(stageId, bot, flags)` harness + `fourWayBot` (never diagonal; keeps x ≈ 64; moves
    toward the lowest-danger lane using a 16-px lane danger scan; presses PowerUp when the meter reaches Speed/Missile/
    Option). Tests: with god mode the bot kills the boss and reaches stage clear; duration between 3 and 6 minutes;
    without god mode the run is recorded and its deaths are reported (not asserted).
- **Acceptance:** `pnpm content:check`; all sprite names exist; playtest passes; e2e smoke reaches the boss with a debug
  skip flag.
- **Manual (optional):** play zone A with the remote on the M7 (§8.4).
- **Refs:** `shmup_feat.md` §14 (themes, length), §11, §13 (core battleship archetype), §10 (recovery), §4 rule 2.
- **As built:**
  - **Stage.** `content/stages/zone-a.stage.json` (AZURE VERGE, `length` 9,000): camera keys 0.75
    (0) / 0.8 (1,500) / 0.6 (3,500, the corridor) / **1.5** (6,000) / 0.75 (8,000) px/tick,
    checkpoints 0 / 3,500 / 6,000, `warning` at 8,600, `end` at 9,000. Terrain from the heightfield
    generator: a low floor in section 1, floor + ceiling 3,440–6,400 (the corridor: ≥ 92 px open,
    wide enough for the ground enemies spawned up to x 5,840 + 400), a low rolling floor under the
    high-speed section. 28 capsule sources (carriers and formations) before the boss — 5 / 3 / 4
    within 900 px after the checkpoints, 2 in the calm before the WARNING. Parallax: the star bands
    plus a new far planet-rim band `bg/azure-verge` (drawn last on `mid`, so no star shows in front
    of the planet) from the new procedural generator `scripts/assets/procedural/backdrops.mjs`.
    Stage length with the bot: ≈ 3.5 min to the stage clear.
  - **Enemies.** `content/enemies/zone-a.enemies.json`: eight types on the M1 roster behaviours
    (no new enemy behaviour was needed) — `skeet` / `skeet-chain` (popcorn, `drifter.sine`),
    `vane` (fans on the new `content/paths/zone-a.paths.json` curves), `tender` (capsule carrier),
    `lancer` (rammer), `picket` / `picket-ceiling` (turrets, 1.25 px/tick), `strider` (walker),
    `burrow` + `burrow-mite` (hatch), `gyre` (orbiter). New pixel-map sprites `enemies/vane`,
    `enemies/gyre`; the others reuse the M1-03 art.
  - **Boss.** `halcyon-bulwark` (HB-01, score 30,000): armour parts `hull`, `wing-top`,
    `wing-bottom` and the two emitters (`vulnerable: never`, the emitters are the `gun`s), the core
    (`bosses/core`, hp 40, `afterParts` of the four plates), plates `plate-1 … 4` (hp 12, stacked
    along the core's lane in front of it — shots meet the outer one first). New sprites
    `bosses/bulwark-hull`, `-wing-top`, `-wing-bottom`, `-emitter`, `-plate`. New boss behaviour
    **`boss.bulwark`** (`core/behaviors`): slow `track`ing, lane lasers from the guns in turn
    (**attached** to the emitter, so a lane sweeps with the boss), optional aimed spreads (`ways`
    0 = none). Phases: lasers only → (two plates down) + 3-ways of needles at 1.5 px/tick → (all
    plates down) lanes every 55 ticks, so both emitters' lanes overlap in time, 42 px apart.
  - **Songs.** The M1-15 songs `zone-a` (AZURE VERGE) and `boss` (BULWARK ASSAULT) are zone A's —
    no new song was written; the stage names the `Stage` / `Boss` cues.
  - **4-way content test** (in `test/integration/content.test.ts`, so `pnpm content:check` runs
    it): every aimed `bulletSpeed` tunable of zone A's enemies and boss phases (behaviour
    defaults merged) ≤ 2.0; a whole HB-01 fight played by the 4-way bot (god mode, stage skip)
    with no live enemy bullet over 2.0 px/tick and no two separate simultaneous laser lanes closer
    than 16 px — a lane is a laser in its warning, grow or active phase, its beam rows widened by
    the ship's hurt radius; overlapping lanes merge (`test/playtest/rules.ts`); plus the stage
    structure and the capsule budget above. The corridor check of `stage-runtime.test.ts` now runs
    for every shipped stage with terrain.
  - **Debug skip flag** (for the e2e smoke; M1-19 builds its debug controls on it): new sim option
    `GameConfig.stageSkip: 'none' | 'boss'` (validated; replay-recorded like every config field),
    new `StageRunner.jumpTo(x)` (a `restartAt` at any scroll x — the checkpoint becomes the last
    one at or before x) and `core/debug` `skipToBoss(world)` (jump to `BOSS_SKIP_LEAD` = 96 px before
    the first `warning` / `boss` event, fly the ships in again), called by `createWorld` for
    `'boss'`. The web app reads `?skip=boss` (`stageSkipFromSearch`); the TV has no such flag.
  - **The game plays zone A.** New `@shmup/shell` `DEFAULT_STAGE_ID` (`'zone-a'`) /
    `defaultStageId(files)`: the web app's scene flow plays it unless `?stage=` names another stage
    (`?scene=flight` and the other dev scenes keep open space for the gameplay e2e specs), and the
    Tizen app's START plays it (its dev scenes too keep open space). `enemies-runtime.test.ts` now
    expects the test-range timeline to spawn the enemies *it* names (the content has zone A's too).
  - **Playtest** (`test/playtest/`, part of the `integration` project and so of `pnpm test`):
    `runStage(stageId, bot, flags)` (`flags`: `godMode`, `seed`, `stageSkip`, `config`,
    `maxTicks`, `observe`) returns a report with the recorded per-tick input; `replayStage`
    replays it. `fourWayBot()` scans 12 lanes of 16 px in 2-tick time slots (bullets and bodies
    along their velocity, boss parts, laser lanes from 12 ticks before the beam grows, terrain
    56 px ahead), picks the cheapest lane (the trip through the lanes on the way and the stay,
    preferring capsules, the core's lane and enemies ahead), moves vertically first, then back to
    x ≈ 64, and presses PowerUp for Speed (≤ level 2) / Missile / Option. The no-god-mode run is
    printed (at the time of writing it clears the stage with no death); its replay must match.
  - **e2e.** `test/e2e/zone-a.spec.ts`: web build, `?skip=boss`, title → Enter → START → WARNING
    band → HB-01's hull colour in the right half of the playfield.

### M1-19 — Debug tools, replays, golden tests & M1 release check

- **Goal:** the P0 debug features, deterministic replays with golden tests, perf/size budgets, and a tagged M1 build.
- **Depends on:** M1-18.
- **Fills:** core `debug` (`→ implemented` P0), `replay` (`→ implemented` core recorder/playback); render-pixi `debug`.
- **Deliverables:**
  - `DebugFlags { godMode, showHitboxes, showGrid, frameAdvance, slowMo: 1|2|4, overlay }` and
    `createDebugControls(game)`: stage skip (to boss), jump to next checkpoint, frame advance/step, slow-mo. Web dev keys
    F1–F8; on Tizen only in dev builds (`__SHMUP_DEV__` Vite define) via the sequence Pause, Ch+, Ch+, Ch+.
  - Debug overlay: FPS, tick ms / render ms (measured in the shell), draw calls, pool usage (bullets/enemies/shots/
    particles), rank, RNG call count, state hash every 60 ticks, WebGL version, boot ms; hitbox and grid outlines.
  - `replay`: `ReplayHeader { formatVersion, buildId, seed, config (every sim-affecting field), stageId, checkpoint,
    loadout, assisted }`; recorder stores per tick per player `held | pressed << 16` (32 bits), RLE-encoded, base64;
    state hash every 600 ticks; `createPlayback(replay)` → `PlatformInput` + desync report. `__SHMUP_BUILD__`
    (git SHA) define.
  - `test/golden/zone-a-*.replay.json` recorded from the playtest bot + expected hashes; `pnpm golden:update`
    (re-bless); golden test runs inside `pnpm test`.
  - `pnpm bench`: stress scenario (512 bullets, 64 enemies, full loadout, lasers) for 20,000 ticks — prints ms/tick;
    CI asserts median < 1.0 ms/tick and heap growth < 512 KB after warm-up.
  - Tizen bundle budgets in `check-bundle.mjs`: `app.js` ≤ 350 KB gzip, atlas pages ≤ 2048², `dist/` ≤ 8 MB.
  - e2e gameplay smoke (web + Tizen `file://`): title → OK → hold arrows 5 s → game scene active
    (`window.__shmupDebug.sceneId` in dev/test builds) → no console errors.
  - Version `0.1.0` in `apps/tizen/public/config.xml` and package manifests; `CHANGELOG.md`.
- **Acceptance:** replay round trip reproduces hashes; desync detection on a tampered replay; golden, bench, size and
  e2e checks green; CI green.
- **Manual:** the full M1 on-device checklist (§8.4).
- **Refs:** `shmup_feat.md` §24 (debug tools), §21 (replays), §22 (determinism, budgets), §23 (launch time).
- **As built:**
  - **Where the switches live.** `DebugFlags` gained `showGrid` and `overlay`; `slowMo` is typed `SlowMo`
    (`1 | 2 | 4`, `SLOW_MO_STEPS`). The flags are one object per **`Game`** (`game.debug`) handed to every World
    of the session (`WorldOptions.debugFlags`, so god mode / outlines survive a new game start). Frame advance and
    slow motion are implemented in **`Game.frame`** (frame advance runs only the ticks queued with the new
    `Game.requestStep(n)`; slow motion feeds the fixed-step loop a clock slowed 2× / 4×, passed as whole ms so it
    stays allocation-free; switching modes resets the loop — no catch-up burst). `createDebugControls(game)`
    exposes the commands through `run(DebugCommand)` (overlay, god mode, outline cycle off → hitboxes → + grid,
    grid, frame advance, step, slow-mo cycle, next checkpoint, skip to boss); the stage jumps act only while the
    game scene is on top and the World is `playing` / `bossWarning`. New core helpers: `jumpToCheckpoint`,
    `jumpToNextCheckpoint`, `collectDebugCounters` (pools, rank, gameplay RNG `callCount`, `hashWorld` every
    `DEBUG_HASH_INTERVAL` = 60 ticks).
  - **Keys.** F1 overlay, F2 god mode, F3 outlines, F4 frame advance, F5 step, F6 slow-mo, F7 next checkpoint,
    F8 skip to boss (`@shmup/shell` `DEBUG_KEYS`; defaults prevented, only the step auto-repeats). On the TV the
    sequence **Pause (10252, or 19), Ch+ ×3 within 3 s** unlocks the tools and shows the overlay; the Tizen app's
    `onUnlock` then registers the number keys and **1–8** act as F1–F8 (the M7 remote has no F-keys); the sequence
    again toggles the overlay. The keys never swallow the sequence (Pause still opens the pause menu, where Ch+ is
    unbound).
  - **New shell module `debug`** (not named in the plan — the timing and the keys are host work):
    `debugToolsFactory` / `createDebugTools`, `ShellOptions.debugTools` (a factory, so a release bundle can drop the
    whole module), `Shell.debug`, and `window.__shmupDebug` (`ShmupDebugApi`: `sceneId`, ticks, flags, counters,
    stats, `unlocked`, `buildId`, `run`, `game`). The frame loop times its ticks and the render (smoothed), feeds
    the frame graph and rebuilds the overlay just before `renderer.render` — only when tools exist.
  - **Overlay (render-pixi `debug`).** Built as core `DrawList`s drawn through the `ui` quad pools — no Pixi
    `Graphics`. Pixi's `tint` setter allocates and a shared quad pool re-tints when items shift, so every list has
    one colour: nine outline lists (grid, items, enemies, boss parts, shots, lasers, bullets, terrain boxes, hurt
    circles) and seven panel lists (backdrop, labels, values, switches, three frame-graph colours) —
    allocation-free per frame (guarded). The panel also shows lasers / items and the build id, plus a 60-frame
    **frame graph** (for the §8.4 "no hitches" check). Draw calls come from the renderer's new
    `countDrawCalls` option (wraps the context's `drawElements` / `drawArrays` / instanced variants →
    `PixiRenderer.drawCalls`, -1 when off), enabled by the shell only with debug tools.
  - **Builds.** `shmupBuildInfo()` (in `vite.shared.ts`, types in `types/build-info.d.ts`) defines
    `__SHMUP_DEV__` — true for the dev server and `vite build --mode development | test` — and `__SHMUP_BUILD__`
    (short git SHA, `+` when the work tree is dirty; `SHMUP_BUILD_ID` overrides). New app scripts **`build:test`**
    (what `pnpm test:e2e` now builds, Turborepo task `build:test`) and **`build:dev`** (the on-device debug build
    for §8.4: `pnpm --filter @shmup/tizen build:dev`, then package). `pnpm build` stays the release build: the
    `__SHMUP_DEV__ ? … : null` in `main.ts` folds away and no debug code is bundled (asserted by
    `apps/tizen/test/build`). Measured: release `app.js` 228.6 KB gzip, test build 234.3 KB.
  - **Replays (core `replay`).** Header as specified; `assisted` = god mode on for the **whole** run (playback
    turns it on — toggling it mid-recording is not reproducible and documented as such). The input device is not
    recorded (the sim never reads it). Hashes every `REPLAY_HASH_INTERVAL` (600) ticks **plus a final hash**.
    API: `createReplayHeader`, `createReplayRecorder(source, header)` (a `PlatformInput` wrapper + `check(world)`
    after each tick + `finish(world)`; preallocates 10 minutes, doubles beyond), `createPlayback(replay, {buildId})`
    (a `PlatformInput` + `check(world)` + `DesyncReport { ok, checked, desyncTick, expectedHash, actualHash,
    finished, buildMatches }`), `createReplayGame` (the same setup for recording and playback: config, god mode,
    `jumpToCheckpoint` for `checkpoint ≥ 0`), `playReplay`, `encodeReplay` / `decodeReplay` (JSON
    `{ kind: 'replay', header, ticks, hashInterval, inputs, hashes, finalHash }`, runs of `(value, count)` as LEB128
    varints then base64 — own base64, no `btoa`; strict validation). The build lock is reported, not enforced
    (`buildMatches`); golden replays use the fixed build id `golden`. Replays cover bare-gameplay sessions (one
    World); recording the scene flow (dev auto-record, attract mode) is later work (M2-15 / M3-01).
  - **Golden replays.** Four scenarios in `test/golden/golden.ts`: `zone-a-god` (4-way bot, god mode, stage
    clear), `zone-a-arcade` (4-way bot at Arcade difficulty, no god mode), `zone-a-deaths` and `zone-a-boss`
    (stage skip, full loadout, Arcade penalty). The 4-way bot clears zone A without dying even at Arcade, so the
    death scenario uses a careless **weaving pilot** (three deaths → `gameOver`). Each file also stores its
    `description` and `expected` outcome (status, ticks, score, lives, death ticks, boss kill), checked on
    playback. `pnpm golden:update` = `scripts/golden-update.mjs` (spawns Vitest with `SHMUP_GOLDEN_UPDATE=1`,
    cross-platform); re-recording an unchanged sim is byte-identical. The files are excluded from Prettier.
  - **Bench.** `pnpm bench` = Vitest with `test/bench/vitest.config.ts` (`*.perf.ts`, `--expose-gc`, not part of
    `pnpm test`); CI runs it after `pnpm build`. Free flight on the shipped content with zone A's flying enemies
    topped up to 64, bullets to 512 and four enemy lasers every tick (the top-up is timed with the ticks); heap
    growth = retained heap after forced GCs (before / after the 20,000 ticks). Measured: median ≈ 0.12 ms/tick.
  - **Bundle check.** Budgets exported (`APP_JS_GZIP_BUDGET`, `ATLAS_PAGE_MAX_SIZE`, `DIST_BUDGET`); an atlas
    page must also be a readable PNG (`pngSize`); the OK line prints the sizes against the budgets.
  - **e2e smoke** (`test/e2e/smoke.spec.ts`): holds → then ↑ for 2.5 s each (a remote holds one arrow at a time);
    also checks F1 / F2 on the web and the locked → Pause, Ch+ ×3 → unlocked TV tools.
  - **Version.** `0.1.0` in the root, every package and app manifest (Electron included) and `config.xml` (a test
    keeps `config.xml` equal to the Tizen package version). The **`v0.1.0` tag is not created by the BUILD agent**:
    the review / test / docs agents still commit to this step — tag the step's final commit.

---

## 6. M2 — Complete v1.0

Goal of the milestone: every **[P1]** feature. Steps are ordered so systems land before the content that uses them.

### M2-01 — Rank, difficulty presets, extends & continues

- **Goal:** dynamic difficulty and the classic arcade life economy.
- **Depends on:** M1-19.
- **Fills:** core `rank` (`→ implemented`), `scoring` (`+ extends, continues`), `config` (difficulty tables).
- **Deliverables:** `content/rules/difficulty.json` (kind `rules`): per preset `rankBase` (Easy 0 / Normal 2 / Hard 4 /
  Arcade 6), `rankGrowth`, `lives`, `extends: { first: 20000, every: 70000 }`, `continues`, `deathPenalty`,
  `aimDirections` (16/32/32/32), `bulletSpeedMul`. `computeRank` = difficulty + `8×(loop−1) + (stage−1)` + power terms
  (Speed 0, Missile 1, Double 2, Laser 3, each Option 1, Shield 4, Reduce 2), 0–31, capped at 16 on loop 1; enemy `rank`
  modifiers (fire rate, bullet speed) applied via `rankScale`; revenge bullets (`revenge: { minRank, pattern }`).
  Extends (+1 life, critical 1UP SFX, cap 9). Continue scene (10-s countdown, OK continues at the checkpoint, the last
  score digit counts continues). Difficulty menu under START. Rank shown in the debug overlay.
- **Acceptance:** rank formula table tests, cap on loop 1, modifiers change bullet speed deterministically, extends at
  thresholds, continue flow headless, golden replays re-blessed.
- **Refs:** `shmup_feat.md` §15, §10 (continues), §11 (rank modifiers, revenge).
- **As built:**
  - The table is `content/rules/difficulty.rules.json` (the content naming rule `<folder>/<name>.<kind>.json`), kind
    `rules` owned by `core/data` (`ContentDb.difficulty`; all four presets required, `aimDirections` a power of two, one
    file only). `core/config` keeps the same values as `DEFAULT_DIFFICULTY_TABLE` for sessions without content
    (`pnpm content:check` keeps them equal). Values: rank base 0/2/4/6, growth 0.5/1/1/1, lives 5/3/3/2, continues
    5/3/2/0, death penalty casual/classic/classic/arcade, aim directions 16/32/32/32, bullet speed ×0.85/1/1/1, extends
    20,000 then every 70,000 for all.
  - `GameConfig` gained `rankBase`, `rankGrowth`, `extendFirst`, `extendEvery`, `continues`, `bulletSpeedMul`.
    `resolveGameConfig(overrides, table)` fills the preset's fields of `overrides.difficulty` (lives, death penalty,
    aim directions too) *under* explicit overrides, so `{ difficulty: 'arcade' }` now also means 2 lives and the arcade
    penalty; `createGame` passes the content's table; `withDifficulty` switches a resolved config to another preset.
    A replay header records every resolved value (format version unchanged: a missing key resolves to the preset's).
  - `rankGrowth` is a multiplier of the growth terms: `rank = base + floor(growth × (8·(loop−1) + (stage−1) + power +
    special))`. The World recomputes it at the end of phase 3 (`updateWorldRank`; the power term is the most powerful
    active ship's; `world.rankInputs.loop / stage` stay 1 until the campaign of M2-10) and hands a changed rank to the
    bullet system. The Reduce term (+2) is defined for M2-04.
  - Enemy rank modifiers reuse the existing `rank: { fireRate, bulletSpeed }` fields (in the enemy schema, unused so far):
    they are now sensitivity multipliers, `1 + k · (scale − 1)`, applied through `BulletSystem.setShooterRank` while
    that enemy's script runs. `bulletSpeedMul` multiplies the rank's bullet speed scale.
  - Revenge bullets: `revenge: { minRank, pattern, speed? }` with built-in patterns `aimed` / `spread3` / `ring8`
    (M2-02's DSL may add pattern references); fired on a kill credited to a player, on screen, never on a Mega Crash.
    Zone A's `vane` fans use it from rank 12 (a fully powered ship on Normal); the 4-way bot never reaches that.
  - Extends live in `core/scoring` (`checkExtends` after every crediting, phases 3 and 7; `MAX_LIVES` 9; the threshold
    waits while the game is over). The `ExtraLife` SFX is pushed with `SfxPriority.Critical`.
  - Continues keep the score and write the continues used into its last digit (`markContinue`; `addScore` keeps the
    digit). `continueWorld` restarts at the last checkpoint with `startingLives`, the arcade penalty's empty loadout
    then the starting loadout, and re-queues the stage theme (the countdown fades the music out). The continue is
    decided by the scene flow between World ticks, so it is not part of a bare-gameplay replay (those end at the game
    over) — a flow-level replay is M2-15 / M3-01 material.
  - The difficulty menu is an overlay scene (`DifficultyScene`) pushed by START; OK resets the stack to the game, whose
    World gets the flow's config for that preset (the host config for its own preset). The choice lives for the
    session only (saved with the options of M2-16); each preset shows and records its own hi-score table
    (`meter-<difficulty>`). Starting a game now takes one more OK: every flow test and e2e spec was updated.
  - The boss-fight allocation guard runs at a constant rank (`rankGrowth: 0`): at rank 14 the boss fires ~40 % more
    often, i.e. more coroutine wakes (D29), not per-tick allocation. The zone A 4-way rule checks pass unchanged with
    rank growth on (the bot's power keeps Normal at rank ≤ 7).
  - Golden replays re-blessed: rank growth, extends (+1 life at 20,000) and the Arcade preset's 2 lives / arcade
    penalty change the recorded runs (all four keep their outcome: stage clear ×3, game over).

### M2-02 — Pattern DSL, bending lasers, bullet cancel & readability

- **Goal:** bullet patterns authored as data; bending lasers; score from cancels; colour-blind safe bullets.
- **Depends on:** M2-01.
- **Fills:** core `patterns` (`→ implemented`), `bullets` (`+ bending lasers, cancel→points`), `data` (`patterns`
  kind); render-pixi `palette`.
- **Deliverables:** BulletML-inspired JSON (`content/patterns/*.patterns.json`): `fire`, `wait`, `repeat`,
  `changeSpeed`, `changeDirection`, `accel`, `vanish`, `bulletRef`, `actionRef`; directions `aim | absolute | relative |
  sequence`; expressions over `$rank`, `$rand`, `$loop`, `$i` compiled at load by a tiny parser to a stack-machine
  program in a `Float64Array` (no `eval`/`new Function`); interpreter stepped by the script runner, zero allocation.
  Bending lasers: head-position ring (64 nodes), subsampled circle-chain hitbox, segment sprites. Cancel → point items
  that home to the player's score (value from rules). Colour-blind palettes (`deuteranopia`, `protanopia`, `tritanopia`)
  and shape coding generated as sprite variants by the pipeline; option selects the variant set.
- **Acceptance:** expression compiler tests, DSL patterns match hand-written TS equivalents (hash), bending laser
  collision, cancel scoring, palette variant frames exist.
- **Refs:** `shmup_feat.md` §12 (DSL, bending lasers, cancel, readability), §21 (accessibility palettes).
- **As built:**
  - **Format.** `content/patterns/*.patterns.json` holds `actions` (`{ id, body }` — a pattern an enemy runs *is* an
    action) and `bullets` (`{ id, kind?, direction?, speed?, actions? }`); ids are global. `bulletRef` is a field of
    `fire` (with `params`), not a node of its own; `actionRef` carries `params` too (`$1` … `$9`). `accel` is the
    engine's tangential acceleration (`accel`, `min`, `max`, `term` — px/tick², polar bullets), not BulletML's
    horizontal / vertical pair; in `changeSpeed` / `changeDirection` a `sequence` value is a per-tick change for
    `term` ticks (BulletML's meaning), the other types reach their target over `term` ticks and land on it exactly
    (new bullet fields `accelTerm` / `termSpeed`, `turnTerm` / `termAngle`). `wait` has a `ranked` flag (÷ the rank's
    fire rate, like `fireWait`). Directions are binary units (the placeholder type's choice); `relative` for an
    enemy's pattern measures from a heading it starts with (left) and its `changeDirection` sets; relative speed of an
    enemy is 0. Expressions add `floor`, `round`, `abs`, `min`, `max`, `sin`, `cos` (table).
  - **Compiler** (`core/patterns/dsl.ts`, run by `loadContent` after collecting, before references resolve):
    recursive-descent parser → constant folding → postfix code; `actionRef` / `bulletRef` are **inlined** (no call
    stack at run time; recursion is an issue, except a bullet firing itself without params, whose program is shared).
    Params are values (BulletML's meaning; review round 1): a constant is folded in, any other param is evaluated once
    when the reference runs into a runner local (`SetLocal` before an inlined action; a `Fire`'s args for its bullet's
    runner) that `$n` reads — ≤ 16 locals live per program. Every action firing a shared bullet program links to it,
    whatever the compile order, and an action inlining a broken action or launching a broken bullet program gets
    entry 0. `repeat` nests ≤ 4 after inlining; bank ≤ 262,144 numbers. A bad expression fails its file's schema;
    reference problems give the action entry 0 (it runs nothing). Bullet kind names come from a leaf
    `bullets/kinds.ts` so `core/data` needs no import of the bullet system. Enemies name an action with `pattern`
    (→ `patternId`, ref kind `pattern`).
  - **Interpreter** (`createPatternVm`, `World.patterns`): 576 runner slots in typed arrays — 64 emitters (one per
    enemy slot) + 512 bullet programs (a bullet stores `runner + 1`; slots handed out from a rotating hint so the
    choice depends only on hashed state). The script runner steps it: `ScriptApi.startPattern` / `stepPattern` (the
    returned `wait` is the coroutine's `yield`) and the new behaviour **`pattern.loop`** (`restTicks`, `heading`;
    `checkEnemyBehaviors` requires a `pattern`). Bullet programs run inside `BulletSystem.update` through an injected
    `BulletProgramRunner` (no module cycle). A run executes ≤ 1,024 instructions, then sleeps a tick. `$rand` draws
    through the new `Rng.nextFloatInto` (a returned fraction was boxed per draw). Fires obey the enemy fire rule (the
    pattern advances, nothing launches). `hashWorld` mixes the runners in use (locals included). Boss behaviours
    and revenge bullets do not run DSL patterns yet (M2-09 material). Shipped: `common.patterns.json` (5 patterns) and a `sentry` enemy
    (`content/enemies/test-sentry.enemies.json`, own file so suites loading the test range alone stay valid) that runs
    `common.spiral`; zone A is unchanged.
  - **Bending lasers:** 8 stable slots (`BendingLaserTable`, not a packed pool — each keeps its 64-node ring; hashed
    per active slot), fired with `fireBendingLaser` / `ScriptApi.bendingLaser` (not attached; speed × rank scale
    there); head homes for `homing` ticks at ≤ `turnRate`; after `life` ticks, or when the head leaves the view ± 16 px
    or enters terrain, the tail catches up one node per tick. Hitbox: circles of diameter `width` on every
    `floor(width / 2 / speed)`-th node (overlapping). Drawn as un-rotated round segment sprites (`lasers/bend-*`) at
    every node (Pixi rotation writes allocate), via the render contract's new `BendingLaserView`
    (`WorldView.bendingLasers`) and render-pixi `createBendingLaserBinding`. No DSL node fires lasers.
  - **Cancel → points:** `CancelMode.Points` (a boss's death → its killer, a Mega Crash → the bomber; the player's
    death still sparkles): each cancelled bullet becomes a point item (pool `cancelPoints`, the `ITEMS` batch, sprite
    `items/point`) that drifts 12 ticks, then accelerates to the credited player's score in the top HUD bar and adds
    `bulletCancel` points (`content/rules/scoring.rules.json`, kind `rules` section `scoring`, default
    `DEFAULT_SCORING_RULES` = 10) — at the latest after 180 ticks; a full item pool credits at once.
  - **Palettes:** names in core `BULLET_PALETTES` (`standard`, `deuteranopia`, `protanopia`, `tritanopia`),
    `UserOptions.display.bulletPalette` (saved; the Options screen gained **BULLETS** before BACK — `OptionsItem.Back`
    is now 5 — pushing `UserOptionKind.BulletPalette` live). The pipeline's new generator `palettes.mjs` draws every
    bullet, beam and bend again as `<sprite>@<palette>`, recoloured and shape-coded (pink solid core, red a dark
    centre, purple a single bright dot); render-pixi `resolveBulletPaletteTable` / `renderer.setBulletPalette` swap
    the sprite tables (the shell applies the saved choice at boot and the event live). Real-art PNG overrides of those
    sprites need their own `@<palette>` variants (else they keep their frames).
  - Golden replays re-blessed: new bullet pool fields and the `cancelPoints` pool change the hashes, and cancel points
    raise the scores of runs with a boss kill or a Mega Crash (outcomes unchanged).

### M2-03 — Meter arsenal: loadouts B–D, Weapon Edit, parking & weapon select

- **Goal:** the full Gradius III loadout choice.
- **Depends on:** M2-02.
- **Fills:** core `weapons` (`→ implemented` for A–D), `powerups` (`!` slot choices); scenes (weapon select).
- **Deliverables:** behaviours Spread Bomb (arc + blast hitting twice), 2-Way Missile, Photon Torpedo (pierces small
  enemies), Tail Gun, Vertical, Free Way (second shot in the last input's 8-way direction), Ripple (growing ring
  hitbox), Cyclone Laser, Twin Laser; presets A–D; Weapon Edit (choose each slot among the A–D variants); `!` choices
  Mega Crash / Normal / Speed Down / Life Option / Full Barrier; `?` choice list (shield types from M2-04); editable Auto
  Power-Up order. `WeaponSelectScene` with live preview (mini World on a "range" stage) — remote navigable.
- **Acceptance:** each behaviour's caps/hit rules, loadout → meter mapping, `!` effects, select scene flow, golden
  replays re-blessed.
- **Refs:** `shmup_feat.md` §7A, §6A (loadout, parking, Auto Power-Up), §16 (weapon select).
- **As built:**
  - **Config.** `GameConfig` gained `weaponPreset` (a `content/weapons/` preset id, default `type-a`;
    a content without it falls back to its first preset), `weaponEdit` (`null` or `{ missile, double,
    laser }` weapon ids — Weapon Edit; `createWorld` throws for an unknown id or a weapon of another
    slot), `megaChoice` (`megaCrash` | `normal` | `speedDown` | `lifeOption` | `fullBarrier`) and
    `shieldChoice` (`forceField` only — M2-04 appends the other `?` shields). `withArsenal` applies
    the weapon select's choice (`ArsenalChoice`: those four plus `autoPowerUp` / `autoPowerUpOrder`),
    `arsenalMatches` tells whether it changes a config. Replay headers record them (format version
    unchanged: a missing key resolves to the default). The loadout is session-wide (both players) and
    lives for the session only (saved with the options of M2-16).
  - **Content.** `content/weapons/types-b-d.weapons.json` (named to load after `type-a` — the select
    lists presets in content order) holds nine weapons and presets `type-b` / `type-c` / `type-d`;
    weapons gained an optional `name` (the select's label, e.g. `SPREAD BOMB`). The Twin Laser ships
    non-piercing (two beams × 2 pairs × 5 shooters would outrun the 32 hit-cooldown tables).
  - **Behaviours.** Nine ids, `ShotKind` 4–9 appended (`SpreadBomb`, `TwoWay`, `Torpedo`, `FreeWay`,
    `Ripple`, `Twin`); the Tail Gun / Vertical are Double-kind pairs turned 180° / 90° (`angle` 512 /
    256) and the Cyclone Laser a thicker `Laser` (hh 4, 80 px) whose segments step 4 swirl frames.
    Spread Bomb: `angle` 64 down + `gravity` 0.12; bursts where its bottom (or centre) meets terrain
    or on its first target (no damage of its own) into a world-anchored piercing box of
    `blastRadius` 14 for `blastTicks` 12 that hits each target at most every `hitCooldownTicks` 6 —
    twice; armour clinks without putting it out; the cooldown table is reserved at launch (new
    `ShotFlag.Blast`; `age` restarts at the burst). 2-Way: a climbing + diving volley (frames 0 / 1),
    refired once both are gone. Photon Torpedo: a `groundSlide` at 5 px/tick whose "pierces small
    enemies" means it flies on through every enemy its hit destroys (not boss parts). Free Way: the
    second shot's heading is the player's last 8-way direction held while alive
    (`WeaponSystem.freeWayHeading`, hashed; `angle` up-forward before any). Ripple: hh 4 → 20
    (+0.5/tick, width = half) and its **ring**, 4 px thick (`RIPPLE_RING_WIDTH`), is the hitbox — with
    its box, the lowest-slot rule gave every ring to HALCYON BULWARK's fringe armour plates and Type B
    could not hurt the boss. Twin: beams keep their lane as `vy` (row offset from the shooter; the
    beam follow now adds `oy` + lane, 0 for Type A); a pair fires while two more fit under the cap.
    `WeaponSystem.setArsenal` recompiles the role tables in place (the preview); `roleWeapons` is no
    longer frozen. `resolveArsenal`, `weaponsOfSlot`, `weaponLabel`, `WEAPON_BEHAVIOR_LABELS`.
  - **Power-ups.** `MeterChoices` from the config (`meterChoicesOf`); `canEquipSlot` / `equipSlot` /
    `equippableSlots` take them (default = Type A's). NORMAL greyed on the basic shot; SPEED DOWN at
    level 0; LIFE OPTION turns `min(lives − 1, 4 − options)` spare ships into Options (greyed at 0);
    FULL BARRIER grants a fresh `?` shield, also over a worn one (greyed at full strength); only Mega
    Crash arms `megaPending`. `?` grants `shieldSpecOf(shieldChoice)`.
  - **HUD.** `hud/meter-labels` grew to 16 frames (the Types B–D weapon names, new micro glyphs);
    `core/ui` `meterLabelFrame` names the MISSILE / DOUBLE / LASER slots after the arsenal (`SPREAD`,
    `TAIL`, `RIPPLE` …); `?` and `!` keep their symbols.
  - **Scenes.** The difficulty menu's OK now pushes `WeaponSelectScene` (id `weaponSelect`, a full
    screen): TYPE (the content's presets + `EDIT`), MISSILE / DOUBLE / LASER (disabled unless EDIT),
    `? SLOT`, `! SLOT`, AUTO, ORDER (one-letter summary) and START; it opens focused on START, so a
    game start takes one more OK than in M2-01 (every flow test and e2e spec was updated). ORDER opens
    `AutoOrderScene` (id `autoOrder`, overlay) over the first 12 entries (`-` = none). START →
    `chooseArsenal` (every difficulty's config; one the loadout does not change keeps its object) and
    the game; the choice is kept for RETRY and later games (`SceneFlow.arsenal`); Back → the
    difficulty menu. UI string slots 96 → 160. Parking needs nothing new: with AUTO off (the default)
    the cursor stays where the capsules left it until OK.
  - **Live preview.** "Mini World" = a private World (own event queue, cleared every tick — silent;
    own god-mode flags) drawn full screen behind the panel (the panel on the left, the ship held at x
    232, weaving), not a smaller viewport: `content/stages/weapon-range.stage.json` (floor + ceiling,
    0.75 px/tick, restarted at its `end`) with the harmless targets of
    `content/enemies/weapon-range.enemies.json`; created when the screen opens (fly-in skipped),
    dropped when it closes; its main weapon follows the focused row (TYPE: Laser / Double every 4 s).
    The flow's frame shows its view; `@shmup/shell` `scene-view` now wraps whichever World view the
    frame shows (it assumed `game.world`). The preview ticks allocation-free; the range's spawns
    create their coroutines (per spawn, D29), so its guard flies the range without targets.
  - **Assets.** Pixel maps `shots/bomb`, `two-way`, `torpedo`, `tail`, `vertical`, `free`, `twin`;
    generator `procedural/weapons.mjs` (`shots/blast`, `shots/ripple`, `shots/cyclone`);
    `ENGINE_SPRITES` gained `shots/blast` (`WEAPON_SPRITES`).
  - Golden replays re-blessed: the new content shifts sprite ids / enemy spec indices and the Free
    Way direction is hashed (the four scenarios' outcomes are unchanged); new scenarios
    `zone-a-type-b` (full Type B vs HALCYON BULWARK) and `zone-a-edit` (a Weapon Edit, LIFE OPTION).
    `terrain-edge`'s CPU-bound linear-scan test got a 30 s timeout (it timed out under machine load).

### M2-04 — Option & shield variants + Option Hunter

- **Goal:** the remaining Option and `?`-slot types and the option-stealing enemy.
- **Depends on:** M2-03.
- **Fills:** core `options` (`→ implemented`), `shields` (`→ implemented` for meter types), `enemies` (Option Hunter
  behaviour).
- **Deliverables:** Snake, Formation (V / ">" spread/retract — gamepad: hold PowerUp on the Option slot; remote: Ch+
  toggles), Rotate Option (orbit, hold to extend). Shields: front Shield pods (14 hits each, independent wear), Free
  Shield, Rotate Shield, Reduce (2 hurtbox steps, terrain box unchanged, absorbs 2 hits). Option Hunter (3 variants,
  scripted appearances only when options ≥ 1, audible cue, line up → charge → steal; stolen grey options drift and are
  re-collectable; Mega Crash frees them). Rare blue capsule (clears on-screen enemies) as a meter-mode drop.
- **Acceptance:** per-type movement tests, shield wear/independence, Reduce hurtbox sizes, Option Hunter steal/free
  cycle, golden re-bless.
- **Refs:** `shmup_feat.md` §8, §9, §6A (blue capsule), §11 (Option Hunter).
- **As built:**
  - **Config.** `GameConfig.optionChoice` (`OPTION_CHOICES`: `trail` default, `snake`, `formation`,
    `rotate`) and `ShieldChoice` grew to `forceField` / `shield` / `freeShield` / `rotateShield` /
    `reduce`; both are part of `ArsenalChoice` / `arsenalMatches` and replay headers (format version
    unchanged: a missing key resolves to the default). The weapon select gained an **OPTION** row
    between LASER and `? SLOT` (`WeaponSelectItem.Option` 4 — `?` is now 5 … START 9), labels
    `OPTION_CHOICE_LABELS` / the five `SHIELD_CHOICE_LABELS`; the preview flies the chosen type and,
    while OPTION is focused, toggles its spread every `PREVIEW_SPREAD_TICKS` (90).
  - **Option types** (`core/options` → implemented; `OptionGroup.formation` / numeric `mode`, set
    from the config at creation, `setFormation` for the preview). **Snake** = a chain in screen space:
    link `k` hangs `SNAKE_LINK` (16) px from its leader and is only *pulled* (so it swings out
    opposite to the motion and keeps its shape when the ship stops or pushes against an edge).
    **Formation** = fixed offsets, a `>` behind the ship (`FORMATION_RETRACTED`) spreading into a
    wide `V` (`FORMATION_SPREAD`). **Rotate** = an even orbit, 12 binary units per tick, radius 20 →
    40 extended. Spread / extend (`OptionGroup.steer`, phase 2, before `follow`) takes 12 ticks
    (`spreadTicks`, whole steps): **PowerUp held ≥ `OPTION_HOLD_TICKS` (15)** extends while held —
    whatever the meter cursor is on (the plan's "on the Option slot": the equip happens on the
    press edge, so a hold never conflicts; a quick tap never moves the Options) — and **Special**
    (remote Ch+, keyboard V, pad Y — an action bound but unused until now) toggles them out / in.
    The trail keeps recording under every type; `follow` stays small (the new types' placement is
    `place()`): with everything inline V8 stopped inlining it and boxed a fractional argument (the
    options allocation guard caught it).
  - **Shields** (`core/shields` → implemented for meter types). Two families: *fields* (Force Field,
    **Reduce**) cover the ship through `playerHit`; *pods* (front **Shield**, **Free Shield**,
    **Rotate Shield**) never cover the ship — each pod (radius 4, `absorbPodHit`) stops the enemy
    bullets (used up) and enemy bodies (they fly on) that touch **it**, not lasers, boss parts or
    terrain; 14 hits and its own i-frames per pod (independent wear), the state's `hits` / `maxHits`
    are the pods' sums, the shield goes with its last pod; a pod break pushes the break SFX / FX.
    Layouts (`placeShieldPods`, phase 2 after the move and the equip, and again when drawn): front
    pods ±64 units off the heading, 13 px out; Free Shield pairs attach at the player's last 8-way
    direction (`WeaponSystem.freeWayHeading`, ahead before any), 96 units apart, up to four pods —
    `?` stays equippable while a pair fits or, all four slots taken, while one is worn (the next
    `?` replaces the most worn pair); Rotate pods orbit 16 px out, 12 units per tick (`spin`, turned
    by `tickShield`). **Reduce**: 2 hits; `ShieldState.hurtScale = (steps + 1 − hits) / (steps + 1)`
    — ⅓, ⅔, 1 — scales every hurt-circle test (bullets, straight and bending lasers, enemy and boss
    contact, the debug overlay's outline); the terrain box is untouched; rank counts it +2 instead
    of a shield's +4. FULL BARRIER is `refillShield` (every pod slot back, broken ones included, in
    place; a fresh shield when none stands) and is greyed only at full strength of the same kind.
    Sprites: `shields/pod` (4 wear frames) and `shields/reduce` (2 frames) — `SHIELD_SPRITES`; the
    shield batch holds a field sprite or one sprite per standing pod.
  - **Option Hunter.** An enemy **data flag** `optionHunter` (not only a behaviour), so the enemy
    system owns the rules: a spawn of one is refused unless some active ship has an Option (a
    stage's scripted hunter simply does not come), a spawned one pushes the new `SFX_CUES.OptionHunter`
    (23, the "audible cue"), is armoured (`EnemyFlag.Invulnerable`: shots clink) and never hurts a
    ship or a pod by contact. Behaviour `hunter.option` (variants 0 rear / 1 front / 2 dive): re-aims
    a `Waypoint` mover at its line-up point (the player's row at view x 48 / 336, or view y 24 over
    the player's column) every 6 ticks for `lineUpTicks`, then holds `windup` and charges through at
    `chargeSpeed`; `ScriptApi.camera` was added for the view conversion. Stealing is
    `EnemySystem.huntOptions` in phase 7 (after the shots' hits, before the power-ups, so a Mega
    Crash in the same tick frees what was just taken): the first Option a hunter's box touches
    (radius `OPTION_RADIUS` 4) **and every Option behind it in the chain** go (the loadout loses
    them, `OptionGroup.stolen` counts them, `SFX OptionStolen` 24); it carries up to 8
    (`Enemy.carried`, hashed), drawn grey (`options/stolen`) behind it in the new
    `EnemySystem.carriedBatch` — appended as the **last** view batch. Killed (Mega Crash, the blue
    capsule) it drops one `DropKind.FreeOption` per carried Option → `ItemKind.FreeOption` items
    that drift with the view (`FREE_OPTION_DRIFT`, bouncing off the playfield's top / bottom),
    vanish after 600 ticks (blinking the last 120) and give an Option back to whoever grabs one
    (`PowerUpSystem.regainOption`; with four already only the ding, 0 points); a hunter that leaves
    the view keeps them.
  - **Blue capsule.** `ENEMY_DROPS` gained `blueCapsule` (enemy `drop` and formation `drop`),
    `DropKind.BlueCapsule` 2, `ItemKind.BlueCapsule` (`items/capsule-blue`, 300 points, not the
    meter): collecting it runs `EnemySystem.clearOnScreen` — every live enemy **on screen** that is
    not `megaCrashImmune` dies (credited, armour no help, no revenge bullets), no bullet is
    cancelled — with Mega Crash's flash and SFX (`PowerUpSystem.clearScreen`).
  - **Content / assets.** `content/enemies/option-hunters.enemies.json` (the three hunters),
    `carrier-blue` in `test-range.enemies.json`, and a new dev stage
    `content/stages/hunter-range.stage.json` (carriers, the three hunters, a `blueCapsule` formation,
    the blue carrier, two hunters at once; `?stage=hunter-range`). **Zone A is unchanged** — its
    4-way rules and playtest budgets were tuned without hunters; the zones of M2-11+ place them.
    Pixel maps `options/stolen`, `enemies/option-hunter`, `enemies/carrier-blue`; generators
    `items.mjs` (`items/capsule-blue`) and `shields.mjs` (`shields/pod`, `shields/reduce`); two
    synthesized SFX presets in `content/audio/main.sfx.json`.
  - **Hash / goldens.** `hashWorld` adds the option groups' type, spread, toggle, hold, orbit angle
    and Snake links, the shields' hurt scale and pods, and each enemy's `carried`. Golden replays
    re-blessed: the new hashed state and the new enemies file (shifting zone A's enemy spec indices)
    change every hash — all eight outcomes unchanged; new scenarios `zone-a-rotate` (Rotate Options +
    Rotate Shield) and `zone-a-reduce` (Formation Options + Reduce).
  - **Tests.** `options-types` (per-type movement, steer, allocation), `shields-pods` (pods,
    independence, Free Shield pairs, Rotate spin, Reduce steps, FULL BARRIER), `shields-world` (pods
    vs bullets / bodies in a World, Reduce hurtbox sizes against real bullets, rank, determinism),
    `shields-alloc` (pods, Reduce, every Option type, freed Options — no growth over the M1
    baseline), `enemies-hunter` (appearance only with Options, the three variants, the chain cut,
    the steal → Mega Crash / blue capsule → re-collect cycle, expiry, escape, the blue capsule's
    on-screen clear, determinism of the hunter range), config / weapon-select / remote and e2e specs
    for the OPTION row.

### M2-05 — Direct mode & ship select

- **Goal:** the Darius-style ship MANTA with colour items, 9-level weapons and the Arm shield.
- **Depends on:** M2-04.
- **Fills:** core `powerups` (`+ direct items`), `weapons` (`+ direct families`), `shields` (`+ Arm`), `config`
  (`powerUpMode: 'direct'` allowed, `shipId`); scenes (ship select).
- **Deliverables:** items red/green/blue/orange/yellow/octagon (drift + bounce, despawn after 600 ticks); carriers:
  6-cube pincer waves (last killed drops) and coloured lead enemies; per-stage deterministic `directItems` plan so
  stage data stays mode-agnostic (`drop: 'powerup'` resolves to a capsule in meter mode, the next planned item in direct
  mode); main-shot families Beam→Disc and Laser→Wave (9 levels each) and the 9-level sub-weapon table from §7B as data;
  Arm tiers green 3 / silver 4 / gold 5 hits (1/4/9 blue items) absorbing terrain; HUD tier pips; Speed toggle (Ch−);
  ship select scene (KESTREL meter / MANTA direct); rank power term for direct levels.
- **Acceptance:** item effects and caps, family switch, Arm tiers, drop resolution per mode, HUD pips, golden replays
  for both ships.
- **Refs:** `shmup_feat.md` §6B, §7B, §9 (Arm), §5 (ship selection), §2.
- **As built:**
  - **Config.** `GameConfig.shipId` (default `DEFAULT_SHIP_ID` = `kestrel`; `createWorld` flies that ship, else the
    content's first) and `powerUpMode: 'direct'` accepted (`POWER_UP_MODES`); `ShipChoice`, `withShip`,
    `shipMatches`. Replay headers record both (format version unchanged: a missing key resolves to the default).
  - **Content formats.** A player ship gained optional `mode` (`meter` default / `direct`) and `startSpeedLevel`
    (default 0; must index `speeds`): `manta.player.json` flies 1.75 / 2.25 / 2.75 px/tick starting at 2.25 (D3's
    "fixed 2.25 with a 3-step toggle" as data — the toggle steps up and wraps). A `weapons` file may hold
    `families` (`WeaponFamilySpec`: `id`, `label` ≤ 5 characters for the HUD, `slot` `main` | `sub`, 1–9 `levels`;
    a level is one volley of 1–8 emitters `{ weapon, angle?, ox?, oy? }` with optional `refireTicks` and `volleys`)
    → `ContentDb.weaponFamilies` (a family firing a weapon of another slot is an issue). A stage may carry
    `directItems` (1–256 colours; empty/omitted = `core/powerups` `DEFAULT_DIRECT_ITEM_PLAN`). `EnemyDrop` gained
    `powerup` (`DropKind.PowerUp` 3 — `DropKind.FreeOption` is 4 now, the content drops come first).
  - **Drop resolution.** Resolved when the drop becomes an item (`PowerUpSystem.takeDrops`): meter → a capsule;
    Direct → the plan's next colour (`dropDirect`, `planCursor` hashed; the plan **cycles and never rewinds** on a
    checkpoint restart). A `capsule` drop resolves like `powerup` in Direct mode (the direct ship has no meter), so
    zone A's content is unchanged apart from its new `directItems` plan (~8 red, 8 green, 7 blue, an octagon, a
    yellow, an orange); the blue capsule stays a blue capsule in both modes.
  - **Carriers.** Behaviour `cube.pincer` (+ enemy `cube`, `content/enemies/direct-carriers.enemies.json`): in a
    `formation` of six, odd members start mirrored across the playfield's middle row, every cube flies to a meeting
    point 8 px beside the middle row, then leaves left — the existing formation rule (every member killed → the
    drop at the last kill) is "the last cube destroyed drops the item". The "coloured lead enemy" is a carrier with
    `drop: "powerup"` (`lead-carrier`; zone A's red `tender` carriers act as such for the MANTA too). New dev stage
    `content/stages/direct-range.stage.json` (six pincer waves, lead carriers, every colour in its first six drops).
    **Zone A's events are unchanged** (its 4-way rules and playtest budgets).
  - **Items** (`ItemKind.DirectRed` … `DirectOctagon`, 3–8; sprites `items/direct-*`, 300 points each): they drift
    with the view like freed Options (`DIRECT_ITEM_DRIFT`: −0.35 px/tick, ±0.3 vertically, bouncing off the
    playfield's top / bottom), live `DIRECT_ITEM_TICKS` (600) and blink their last 120. Effects
    (`PowerUpSystem.collectDirect`): red / green a level up to the family's last (then points only), blue
    `collectArm`, orange +1 life up to `MAX_LIVES` (9, the `ExtraLife` cue), yellow = Mega Crash's screen clear
    (bullets → points, non-immune enemies, flash; **no boss damage** — "heavy damage to mid-bosses" waits for the
    mid-bosses of M2-09), octagon = the next `main` family keeping the level. Every pickup pushes `SFX
    CapsulePickup`; an effect `SFX PowerUpEquip` and `SimEventKind.PowerUp` with id `DIRECT_POWER_UP_EVENT_BASE`
    (16) + the colour's index.
  - **Weapons.** `core/weapons` compiles the families at creation: each distinct weapon they fire gets a **direct
    role** (`WEAPON_ROLE_COUNT` … +`MAX_DIRECT_WEAPONS` 32; `WEAPON_ROLE_SLOTS` is now the stride of `liveCounts`),
    each level a list of emitters grouped by weapon; a group fires all-or-nothing while `live + n ≤ volleys × n`
    (else the weapon's `cap`). Main and sub volleys use the ship's main / missile autofire timers. New behaviours
    `direct.bolt` (a straight shot in the emitter's heading, `frame` still frame or `turn` = the heading's octant
    frame — un-rotated art) and `direct.bomb` (a Spread Bomb fired in the emitter's heading). `Loadout` gained
    `shot`, `sub`, `family` (hashed); `applyDirectLoadout` (`'full'` = both levels 8 and the gold Hyper Arm).
    `content/weapons/direct.weapons.json`: 20 weapons and the families `beam-disc` (BEAM > DISC), `laser-wave`
    (LASER > WAVE — piercing from the round laser on) and `sub-weapon`, following §7B level by level.
  - **Arm.** `ShieldKind.Arm` (6), `ShieldState.tier` / `charge` (hashed): the tier is the highest one whose blue
    count (1 / 4 / 9) is reached, every blue item repairs to 3 / 4 / 5 hits; a field that **absorbs terrain** with
    the usual 8-tick shield-hit i-frames; breaking (or losing it with a death) starts the count over. Sprite
    `shields/arm` (9 frames: tier × fresh / worn / critical).
  - **Speed toggle, death penalty, rank.** The `Speed` press (remote Ch−, keyboard ShiftLeft, pad LB / RB) cycles
    the speed level in phase 2 (`PowerUpSystem.updatePlayers`, the meter ding); Direct mode ignores the PowerUp
    press, meter mode the Speed press. `applyDirectDeathPenalty`: every preset takes the Arm; `classic` one main-shot
    level (else one sub-weapon level), `arcade` both levels and the family, `casual` nothing more; the speed level
    stays. `core/rank` `directPowerRank` = `floor((shot + sub) / 2)` + `RANK_ARM_TIER` (2 / 3 / 4) — 12 at full
    power, like the fully powered meter ship.
  - **HUD.** In Direct mode `buildHud` draws the tier pips instead of the meter: `SHOT` (8 pips, lit in the
    family's colour), `SUB`, `ARM` (one pip per hit in the tier's colour), `SPD` and the family's label. The game's
    HUD list is `HUD_COMMAND_COUNT` (64) commands / `HUD_STRING_COUNT` (9) strings (meter HUDs still use slots 0–3).
  - **Ship select.** `ShipSelectScene` (id `shipSelect`, overlay) between the difficulty menu and the weapon select:
    the content's ships by name, the focused one's picture, power-up model and hints; OK → `withShip` for every
    difficulty's config, then the weapon select (meter ship) or the game at once (Direct mode); Back → the
    difficulty menu, and the weapon select's Back now returns to the ship select. **Skipped** when the content has a
    single ship (the flow tests on subset content are unaffected); with the shipped content every game start takes
    one more OK — the flow-driving integration, shell, app and e2e specs press it (KESTREL). The session hi-scores
    are kept per power-up mode and difficulty (the save's `direct-*` tables); UI string slots 160 → 192.
  - **Assets.** Pixel maps `ships/manta` (3 frames) and `enemies/cube`; generator `procedural/direct.mjs` (the
    shots, the six items, the Arm); the atlas stays 512×512.
  - **Goldens.** Re-blessed: the new hashed state (levels, family, Arm tier / count, the plan cursor) and the new
    content (sprite ids, enemy spec indices) change every hash — all twelve outcomes unchanged; new scenarios
    `zone-a-manta` (the whole stage in Direct mode: planned items from the carriers, the Arm, a family switch at the
    octagon — stage clear) and `zone-a-manta-boss` (HALCYON BULWARK with the full Direct loadout).
  - **Tests.** `powerups-direct` (drop resolution per mode, plans, every effect and cap, drift / bounce / despawn,
    the toggle, the penalty, loadouts, rank, determinism), `weapons-direct` (every level's volley of all three
    families, headings / offsets / octant frames, bombs, the `volleys` cap, mode separation), `shields-arm`,
    `ui-hud-direct`, `scenes-ship-select`, `behaviors-cube`, `data-direct`, `config-ship`, the
    `powerups-direct-alloc` guard (no spawns: every spawn creates its coroutine, decision D29 — the direct range
    alone measures ~70–80 KB of them, like a meter ship on it), a remote integration test (MANTA picked with the
    arrows, Ch− toggling) and `test/e2e/ship-select.spec.ts` (web + Tizen).

### M2-06 — Two-player simultaneous co-op

- **Goal:** Darius Twin-style co-op on one display.
- **Depends on:** M2-05.
- **Fills:** core `world`/`player`/`scoring` (2 players), input-web `web-input` (device routing), core `scenes`.
- **Deliverables:** "2 PLAYERS" in the title menu and drop-in "PRESS START" for P2 (first Confirm on an unassigned
  device joins); device assignment (remote/keyboard → P1, pads → P2 by default; split-keyboard preset WASD+F/G vs
  arrows+K/L); separate lives, scores, meters/items; items go to whoever grabs them; `coopExtra` drop scaling; aimed
  bullets target the nearest alive player (tie → P1); P2 palette-swap frames (`@p2` variants from the pipeline); P2 HUD
  area; game over when both are out; per-player continues; replays record both players.
- **Acceptance:** headless 2-player runs, join/leave, targeting tie-break, item ownership, HUD, replay determinism with
  two inputs.
- **Refs:** `shmup_feat.md` §16 (co-op), §4 (2P input), §6B (item sharing), §17 (P2 HUD).
- **As built:**
  - **Config.** `GameConfig.coop` (default `false`) and `coopExtra` (default `DEFAULT_COOP_EXTRA` 0.5,
    0–`MAX_COOP_EXTRA` 4) — sim-affecting, so replay headers record them (format version unchanged:
    a missing key resolves to the default); `withCoop`. `coopExtra` lives in the config (not in a
    rules file) like every other sim-affecting session value.
  - **Title.** The menu is `1 PLAYER` / `2 PLAYERS` / OPTIONS / EXIT (`TitleItem.Start` 0 is 1
    PLAYER, `TwoPlayers` 1, OPTIONS 2, EXIT 3 — every test and e2e spec that walked down to OPTIONS
    presses Down once more). Both go through the difficulty menu, ship and weapon select as before;
    `SceneFlow.coop` / `choosePlayers` fold `withCoop` into every difficulty's armed config. The
    ship and loadout are session-wide (both players fly the same ship; player 2 in its palette swap).
  - **Drop-in join** (`core/world`): `JOIN_ACTIONS` = `Confirm | Pause` pressed on an inactive slot
    of a co-op World while it is `playing` / `bossWarning` (`playerCanJoin`) joins it in **phase 1**
    (so a press during a hit-stop is not lost) — `joinPlayer`: active, `startingLives`, the starting
    loadout it got at creation, score 0, the blinking respawn fly-in, new `SFX_CUES.PlayerJoin` (25,
    a synthesized preset in `content/audio/main.sfx.json`). The join is plain input, so replays need
    nothing new. The game scene no longer pauses on a join press of a joinable player (any other
    player's Pause / Back still pauses — it now reads the per-player input instead of the merged one).
  - **Leave / per-player continues.** "Leave" is running out of lives: that player leaves play
    (`playerOut`), the other plays on, the game is over only when every active player is out (as
    before). Continues are **per player**: `continuesLeft` = `config.continues` minus the player's own
    `PlayerScore.continues` (the score digit). An out player with continues left drops back in with
    the same join press mid-game (`joinPlayer`: fresh lives, power reset + starting loadout, the
    continue digit, **no stage restart**); `continueWorld(world, who)` takes a player mask (default
    all) and the continue countdown passes the players who pressed OK in a co-op game (any
    controller's OK in a one-player game); `World.continuesUsed` counts continue events (one per
    `continueWorld`, one per mid-game continue). There is no host-driven leave (a disconnected pad's
    ship stays in play): anything that changes the sim must come through recorded input.
  - **Device routing** (`input-web` `web-input`, module now implemented): the host routes **seats**
    (`WebInput.setSeats`, forwarded by the shell from the new `Game.inputSeats` — 2 only while a
    co-op game or its continue countdown is on top). With one seat every device drives player 1 (a change: pad slot 1 used to
    be player 2 always; now pads work solo in any slot). With two seats the keyboard / remote stays
    player 1's and **pads take player 2's seat**: an unassigned pad keeps driving player 1 until its
    first join press — a button the gamepad profile's *menu* table binds to Confirm or Pause (A,
    START) — seats it (`padSeat`) and is forwarded as a latched `Confirm` on player 2's slot; the seat
    stays across games until the pad disconnects; other pads then drive player 1. The
    **split-keyboard preset** is a keyboard profile with a new optional `split` section (player 2's
    half; validated like `context`, no key in both halves, keyboard profiles only → `splitTables`):
    `keyboard-split` = WASD + F (PowerUp / OK) + G (Special + Speed / Back) + Esc / Q (Pause) vs
    arrows + K / L + Enter (Pause = player 2's START / OK in menus); a second keyboard source drives
    it; offered in Options → CONTROLS on the web (`?profile=keyboard-split`), never on the TV.
  - **Targets, items.** Aimed shots, movers and boss aims already took the nearest *living* ship
    with player 1 on a tie (strict `<` since M1-09), and items already went to the first ship that
    touches them (player 1 on a tie) — tested for co-op now, no code change.
  - **`coopExtra`** (`core/powerups`): while two ships are in play (active, not out), each capsule /
    power-up drop adds `coopExtra` to a credit (`PowerUpSystem.coopCredit`, a `Float64Array` slot,
    hashed, never reset); each whole credit drops one more item `COOP_EXTRA_OFFSET` (12) px below —
    a capsule, or the plan's next item in Direct mode. The blue capsule and freed Options are not
    scaled.
  - **Palette swap.** The asset pipeline's new `scripts/assets/coop.mjs` adds `<name>@p2` (red ↔ blue
    channels swapped — the KESTREL turns red-orange and gold) for every `ships/*` sprite and
    `hud/life`; `loadContent` interns `<ship sprite>@p2` for every ship (`P2_SPRITE_SUFFIX`,
    `PlayerShipSpec.spriteP2Id`, -1 for the built-in ship), `pnpm content:check` verifies them, the
    World draws player 2 with it and the co-op HUD its stock icon (`UI_SPRITES` gained
    `hud/life@p2`, `UiSprites.lifeP2`). The atlas stays 512×512.
  - **HUD.** `HudPlayerState` / `hudPlayerState` (Playing, Join, Continue, Out, Absent — the World's
    join rule repeated in `core/ui`, which `core/world` imports). Top bar: a joinable slot shows a
    blinking `PRESS START` (`HUD_PROMPT_BLINK_TICKS` 32) instead of `------`. While **both** ships
    are active the bottom bar splits into two 192-px halves: stock icon + count, the seven meter
    slots as 20-px boxes with two-letter labels (`METER_SHORT_LABELS`, following the arsenal), the
    shield pips — or the compact Direct-mode pips `SH` / `SB` / `AR` / `SP`; an out player's half
    shows `PRESS START` (may continue) or `GAME OVER`. `HUD_STRING_COUNT` 9 → 22,
    `HUD_COMMAND_COUNT` 64 → 96; the co-op strings are written only when drawn, so one-player HUD
    lists with 4 string slots still work. `Hud.update` compares both players' values (a typed
    array) and the blink only while a prompt shows.
  - **End screens.** Stage clear and game over show both scores in a co-op game, the continue
    countdown both players' credits; co-op scores are recorded with the hi-score mode `2p` (same
    tables per power-up mode and difficulty).
  - **Goldens.** Re-blessed: the hashed co-op credit and the sprite table's new `@p2` names change
    every hash — all fifteen outcomes unchanged. New co-op scenarios (`GoldenScenario.p2`: player 2's
    bot and join tick; the outcome gains `p2`): `zone-a-coop` (two 4-way bots, player 2 from tick
    300, stage clear) and `zone-a-coop-deaths` (the 4-way bot and a weaving player 2 that dies and
    continues with START twice while player 1 plays on). `fourWayBot(player)` flies any slot. The
    stage-long zone A playtests, the scene-flow allocation guard, the alloc helper's
    reclaimed-garbage test and the trig-table generator's two-run CLI test got a 30 s timeout (with the new suites the full parallel `pnpm test` load
    pushed each past the default 5 s once; ~1 s alone).
  - **Tests.** `world-coop` (join rules, hit-stop join, leave / continue / game over, the continue
    mask, aim tie-break, item ownership, `coopExtra` in both modes, the P2 sprite, lockstep of two
    co-op worlds with a join and a continue), `world-coop-alloc`, `ui-hud-coop`,
    `ui-hud-coop-alloc`, `scenes-coop`,
    `replay-coop`, `config-coop`, input-web `web-input-seats` (seats, join press, disconnect, split
    keyboard, allocation) and `rebind-split`, `test/scripts/assets/coop.test.ts`,
    `test/e2e/coop.spec.ts` (web, split keyboard: 2 PLAYERS, Enter joins player 2, the split HUD,
    player 2 moves, Esc still pauses).

### M2-07 — Advanced stage systems & Tiled import

- **Goal:** the stage mechanics the later zones need.
- **Depends on:** M2-06.
- **Fills:** core `stage` (`→ implemented`), `collision` (`+ destructible tiles, moving blocks`), `behaviors` (gimmick
  modules).
- **Deliverables:** destructible tiles (per-tile HP, optional regeneration for organic walls, restored on checkpoint
  rollback); falling rocks triggered by proximity; moving floors/ceilings as AABB block entities; in-stage branches
  (region triggers + flags select event branch ids); vertical/diagonal pans and high-speed sections in the camera path;
  gimmick modules (splitting bubbles, suction field, grabbing tentacle, seeded cube rush that stacks into walls,
  volcano lobs); `scripts/content/tiled-import.mjs` converting Tiled `.tmj` (tile layers → RLE rows, object layer
  entities → events at scroll x, polylines → paths).
- **Acceptance:** tile damage/regeneration, rollback restores terrain, branch selection, gimmick unit tests, Tiled
  import of a committed fixture map equals the expected stage JSON.
- **Refs:** `shmup_feat.md` §14 (destructible terrain, moving floors, gimmicks, branching, authoring in Tiled).
- **As built:**
  - **Destructible tiles are tileset data, not a new collision type.** A colliding tile gets
    optional `hp` (1–255), `regen` (ticks, needs `hp`) and `score`; it still collides as its
    `type` (so `TerrainType` keeps its codes and "hazard beats solid"). `TilesetTables` gained
    `hp` / `regen` / `score`. `terrain-a` gained `brick` (hp 4), `cube` (hp 2) and `tissue`
    (hp 3, regen 240) with their own generated frames (tile ids 18–20).
  - **`core/collision` `DestructibleTerrain`** (per World, over its private map; the stage's
    tiles are the pristine copy): a sparse table of 512 damaged / regrowing cells; a shot hits
    the **cell** of the pixel where it met the terrain (`core/weapons`: straight flights, a laser
    head it blocks, a Spread Bomb bursting on it, a missile flying into a wall); a hit on a new
    cell while the table is full is ignored unless it breaks the tile at once. A regenerating tile
    heals after `regen` ticks without a hit and grows back `regen` ticks after breaking, waiting
    while a keep-out rectangle (the ships' terrain boxes) overlaps the cell. **Rollback = the
    stage's own tiles again** on every checkpoint restart / jump / continue (broken tiles back,
    placed ones gone) — not a snapshot taken when the checkpoint was passed. Changed cells go to a
    64-entry ring (`count` / `resets` / `cells`), exposed as the new render-contract
    `TerrainChanges` (`TerrainView.changes`); render-pixi's terrain binding re-textures only the
    logged cells in view and redraws the grid after a reset or an overflow.
  - **Moving blocks live inside the terrain queries.** `TerrainMap.blocks` (optional
    `TerrainBlocks`, ≤ 16 whole-pixel boxes) is tested by `terrainAt`, `terrainRectHit`,
    `findFloor` and `findCeiling`, so ships die on them, shots / bullets stop at them and crawlers
    and sliding missiles use them without changes to those systems. They come from a new stage
    event `block` (`y`, `w`, `h` in whole tiles ≤ 64, `tile` name → `tileId` resolved in the
    terrain pass, drift `vx` / `vy`, table-sine swing `dx` / `dy` / `period` / `phase`); the
    left edge is **world** x `event.x + screenX` (default 400) rather than camera-relative, so
    blocks align with the tiles. Drawn tile by tile (`LayerId.Terrain` batch, ≤ 256 tiles), gone
    128 px behind the view, respawned at age 0 after a restart when their event lies behind the
    camera. A block needs a tilemap (load issue otherwise).
  - **Falling rocks = a mover.** New `MoverKind.Ballistic` (content `ballistic`: `vx`, `vy`,
    `gravity`, `maxFall`, `trigger`, `land` = `pass` / `stop` / `shatter`); `MoverBody` gained
    `hw` (its terrain box). The proximity trigger (nearest player within `trigger` px
    horizontally) lives in the mover, so a waiting rock costs no script wakes. On landing the
    enemy system shatters a `shatter` body (`EnemySystem.destroy`: explosion, no score / drop, a
    formation member counts as escaped) or wakes its script on the next tick.
  - **Branches and triggers.** A stage declares `branches: [{ id, flag, value }]`; every event
    may name a `branch` (→ `branchId`); an event whose branch is not taken is passed by — neither
    its runner part nor the hooks. New event `trigger` (`flag`, `value`, world `region`, `until`
    defaulting to the region's right edge; ≤ 32 per stage) arms its region; the World probes it
    with the living ships in phase 3 (`StageRunner.probe(point)` — an object, never boxed
    fractions). `StageRunner` gained `eventActive`, `setFlag`, `holding`, `triggersArmed` /
    `triggersFired`; `STAGE_STATE_SLOTS` 22 → 28 (hold, hold key, diagonal pan, trigger masks).
    A restart keeps the outcome of triggers behind it that had fired (applied at their place in
    the timeline — an approximation of the later tick they fired on) and re-arms unfired ones
    whose region is still ahead.
  - **Camera.** `hold` keys are timed scroll stops (a stop key like `lock`: the camera halts
    exactly at their x, stays `hold` ticks while a `yTo` pan runs — the vertical sections — then
    scrolls on at the key's speed / ramp; not with `lock`); `yOver` makes a pan diagonal (y linear
    in the scroll x; not with `yTicks`). High-speed sections needed no new data: speed keys and
    `speed` events up to 16 px/tick, tested to fire every event once, in order.
  - **Gimmick modules** (`core/behaviors`): `rock.fall`, `bubble.split` (via the new
    `BehaviorDef.death` / `EnemyBehavior.death` callback — not on a Mega Crash or the blue
    capsule), `volcano.lob` (children thrown with the new `ScriptApi.setMoverOf`), `field.suction`,
    `tentacle.grab` (a lunge with a short pull and a drawn chain — its body kills on contact like
    any enemy; there is no "held" ship state) and `cube.stack` (the seeded cube rush: a random
    row from the gameplay stream, aimed, becomes the tileset's `cube` tile where it stops —
    `ScriptApi.placeTile` / `tileId`). The World-side services are `core/stage` `StageGimmicks`
    (`stage/systems.ts`: destructible terrain, `MovingBlockSystem`, ≤ 8 pull fields, ≤ 8 chains of
    ≤ 16 links drawn with the new engine sprite `gimmicks/chain-link`), `World.gimmicks`; the
    view appends the chain batch (and the block batch) after the existing batches.
  - **Hashes and goldens.** `hashWorld` mixes the new runner slots and the gimmicks' state; the
    golden replays were re-blessed for the new hash layout (and the sprite ids shifted by the
    new engine sprite) — before re-blessing, the goldens were run against the old hash layout
    and passed, i.e. zone A's simulation is unchanged.
  - **Content and tools.** `gimmick-range` dev stage + `gimmick-range.enemies.json` + eight
    pixel-map enemy sprites (`?stage=gimmick-range`, e2e `gimmicks.spec.ts`);
    `scripts/content/tiled-import.mjs` (root script `pnpm content:tiled`) with the fixture map
    `test/scripts/content/fixtures/tiled-sample.tmj` and its expected stage / paths JSON. Tiled
    objects are read by class (`class`, or `type` before Tiled 1.9); spawns fire 400 px before
    their object's x (`screenX` only when nearer the start), their `y` made camera-relative with
    the camera y the imported keys give at the event (`cameraYAt`; a spawn during a timed pan is
    warned about); gids map to content tile ids by tileset order; flipped tiles and compressed /
    base64 layers are refused.

### M2-08 — Presentation polish: raster effects, palettes, visual options

- **Goal:** SNES-style raster effects and the display options.
- **Depends on:** M2-07.
- **Fills:** render-pixi `effects` (`→ implemented`), `palette`, `viewport` (scale modes).
- **Deliverables:** per-scanline offset table (216 entries encoded in an RGBA8 1×216 texture) sampled by a WebGL1
  (GLSL ES 1.0) Pixi filter on BG/terrain layers — wavy water, heat haze, line-band parallax floors, driven by stage
  data; palette cycling shader for marked layers (water, lava, glowing cores); Mega Crash flash; scale modes integer
  (default) / fit / stretch; screen-shake toggle, flash-reduction mode, show-hitbox option; render interpolation using
  previous positions when the loop runs more than one display frame per tick (>60 Hz).
- **Acceptance:** offset-table builders, shader source compiles under a GLSL ES 1.0 syntax check, e2e screenshots with
  effects on, draw-call count within budget (overlay counter in e2e).
- **Refs:** `shmup_feat.md` §18 (palette effects, raster effects, shake), §3 (scale modes), §21 (display options).
- **As built:**
  - **Stage data, presentation only.** A stage gains optional `raster` (≤ 8: `layer` far / mid / terrain, `kind`
    `wave` / `haze` / `lines`, playfield rows `top`…`bottom`, `amplitude` / `wavelength` / `period` for the sines,
    `factorTop` / `factorBottom` / `wrap` for line bands, camera-x range `from` / `to`) and `cycles` (≤ 8: `layer` far /
    mid / terrain / ground / air, 2–8 distinct `#rrggbb` `colors`, `ticks` per step, `from` / `to`; ≤ 8 cycled colours
    per layer), validated by `core/data` (`StageSpec.raster` / `cycles`, colours resolved to `rgb`). A `lines` effect may
    list `bands` (strip heights): each strip then scrolls as one piece — per-row factors on a uniform pattern desync into
    noise after a few hundred pixels of scroll, strips drawn with a wider pattern nearer the bottom keep their shape.
    The World hands them to the renderer as the new render-contract `WorldView.effects` (`StageEffectsView` /
    `RasterEffectView` / `ColorCycleView` / `RasterKind`, `core/stage` `createStageEffectsView`); the sim never reads
    them and they are not hashed.
  - **One filter per layer, both effects.** Raster offsets and palette cycling share one GLSL ES 1.0 program
    (`render-pixi/effects/shaders.ts`, plain strings — Pixi keeps a source without `#version 300 es` as ES 1.0):
    `effects/raster.ts` builds the 216-row offset table (core `sinB`, so frames are identical on every engine) and
    encodes it as a 1 × 216 RGBA8 texture — R, G = the whole-pixel offset `+ 32768`, B, A = the row's wrap period
    (decoded exactly under `mediump`: every value < 2048); `effects/layer-effects.ts` (`createLayerEffects`) attaches a
    layer's filter only while one of its effects is in camera range (the `filters` list is swapped only at range
    edges), so stages without effects render exactly as before. Palette cycling matches the ramp's exact colours in the
    RGBA art (no indexed-colour sprites). `EffectSettings.rasterEffects` (default on) turns them all off. Draw calls
    (e2e, the debug overlay's counter): 2 for a plain frame, 5 with one filtered layer, 7 with two; budget 12.
  - **GLSL ES 1.0 check.** No dependency: a test-side tokenising checker (`render-pixi/test/effects/glsl-es100.ts`:
    ES 3.00 keywords / `in`/`out` globals / `texture()`, reserved operators, Appendix A loops, precision, unknown
    identifiers, swizzles) plus the real WebGL1 compile + link in headless Chromium (`test/e2e/raster.spec.ts`).
  - **Mega Crash flash = colour addition.** `FlashLook.additive`: the Mega Crash look is additive white at 0.7 (the
    world brightens instead of being covered); the renderer has a second, `add`-blended overlay (a sprite never changes
    blend mode). The limiter and reduced flashing apply as before.
  - **Display options** join `UserOptions.display` (save v1, defaults for missing fields — no migration):
    `scaleMode` (`SCALE_MODES` integer / fit / stretch — render-pixi `computeViewport`, `renderer.setScaleMode`),
    `screenShake`, `reduceFlashing`, `showHitbox`. The Options screen got four rows (SCALE, SHAKE and HITBOX toggles,
    FLASHES normal / reduced — the panel grew to ten rows, `OptionsItem.Back` is 9) pushing `UserOptionKind`
    `ScaleMode` 5, `ScreenShake` 6, `ReduceFlashing` 7, `ShowHitbox` 8; the shell applies the saved ones at boot
    (`applyDisplayOptions`; `ShellOptions.effects` still wins) and the events live (`connectOptionEvents`' new `display`
    target). The debug API (`window.__shmupDebug`) exposes the renderer for the browser tests.
  - **Show hitbox** is a new render-contract mirror `WorldView.hitboxes` (`HitboxView`, `createHitboxBatch`; the World's
    `hitboxBatch`: every live ship's centre and hurt radius × its shield's hurt scale) drawn on the `HITBOX` layer as a
    white core in a 1-px rim (`createHitboxBinding`, quads of the atlas' white pixel — no new sprite); the layer is
    hidden while the option is off.
  - **Render interpolation** lives in the renderer (`setInterpolation`): the camera, parallax bands and every sprite
    batch are drawn between the previous and the current tick by `frame.alpha`; a pooled slot is only blended when it
    kept its sprite and moved ≤ `INTERPOLATION_MAX_STEP` (24) px. The blend travels as an object (`RenderBlend`) —
    fractional call arguments were boxed. The shell decides: `ShellOptions.interpolation` `'auto'` (default) turns it
    on while the new refresh probe (`frame-loop` `createRefreshMonitor`, the interquartile mean of the last 31 rAF
    deltas — a median picked one extreme of alternating jitter) reads above `INTERPOLATION_MIN_HZ` (70), off at 60 Hz
    (no added tick of lag on the TV); `'on'` / `'off'` force it. Electron's window / refresh settings stay M2-17.
  - **Content and goldens.** New procedural bands `bg/sea-swell` (painted only in its four-colour ramp) and
    `bg/checker-floor` (strips widening towards the bottom) — generator `raster-bands` — and the dev stage
    `raster-range` (`?stage=raster-range`: a waving, colour-cycling sea, a line-band floor, a heat haze over the stars
    between camera x 1,200 and 2,400). The two new content sprites shift the sorted sprite ids the pools hash, so the
    golden replays were re-blessed; with the new stage file removed they pass unchanged, i.e. the simulation is
    unchanged. Zone A is untouched.

### M2-09 — Advanced bosses: mid-bosses, raids, multi-bosses

- **Goal:** the Darius-style boss variety.
- **Depends on:** M2-08.
- **Fills:** core `bosses` (`→ implemented`).
- **Deliverables:** part rotation (binary-angle transforms, rotated hurtboxes as circles); mid-bosses ("captains") that
  stay until destroyed (wave-shooter + ram, splitting launcher, screen-crossing circler, ring-firing crab archetypes);
  battleship raids larger than the screen with boss-relative camera segments; boss inside a boss; double bosses
  (alternating, survivor enrages); boss HP bar in the top HUD bar (option); boss timers (escape after the limit; sets an
  ending flag); boss-rush sequence support (stage type `bossRush`).
- **Acceptance:** rotation transforms, raid camera paths, nested boss spawn, enrage rule, timer escape, HP bar model.
- **Refs:** `shmup_feat.md` §13.
- **As built:**
  - **Four boss slots.** `BossSystem.slots` (`MAX_BOSSES` 4, slot 0 is still `bosses.boss`), each
    with its 16 parts; part slot `g = slot × 16 + index` is `BossPart.global`, its hit / grid /
    laser-source id `BOSS_PART_ID_BASE + g` (`BOSS_PART_SLOTS` 64, `MAX_HIT_TARGETS` 128, the
    weapons' part cooldown tables 32 × 64, the World's `laserSources` enemies + 64 parts).
    `damagePart` / `isArmoured` take the part slot (boss slot 0's part index, as before). Stage
    bosses (role `boss`) form the **main encounter** — one at a time, as in M1; the last of it to
    end (death or escape, no other stage boss in play) releases the lock and clears the stage (or
    brings the next rush boss). A boss that enters during `update()` from another slot's timer (a
    partner, an inner boss) counts its intro from the next tick, like the boss that brought it.
  - **Rotation.** Parts gain `angle` / `spin` (binary units) and a world angle (parent's + own);
    `place()` turns the child offsets by the parent's world angle with a module-level copy of the
    committed sine table (a zero turn keeps the M1 translation exactly). Sprites are **not**
    rotated (Pixi's transform setters allocate, M2-02): a turned part shows its heading through
    **heading frames** (`turn`: frame nearest the world angle — `turnedFrame`), and is hit as a
    **circle** (`radius`, exclusive with `hurtbox`; the grid gets its square, the shots' visitor
    and the ship contact test the circle). A box never turns (the loader refuses `turn` on one).
  - **Captains** are a boss-section `role` (`captain`): any free slot, `boss` event only (a
    `warning` naming one is a content issue and `startWarning` refuses it), no lock or music,
    short death (`CAPTAIN_CHAIN_TICKS` 48, blast with a medium shake, tally at 49, `Dead` at 72).
    The four archetypes are boss behaviours `captain.ram`, `captain.launcher` (the boss's
    `minion` via `BossScriptApi.launch`), `captain.circler` (the new `BossMotion.Orbit`,
    `api.orbit`), `captain.crab`.
  - **Raids.** A boss `raid` (segments `x` / `y` relative to the boss's origin, `ticks`, `hold`,
    `loop`) anchors the boss where it entered (`Boss.anchored` / `anchorX` / `anchorY`; a `boss`
    event stops the camera at once) and, from its fight, drives the camera through the new
    `StageRunner.follow(target)` (`StageCameraTarget`; the boss system's `RaidCamera`; in free flight
    the camera's velocity): the runner's step 3 puts the camera on the target and records `dx` /
    `dy`, so ships, shots and bullets ride along; the timeline stays at the x where the follow
    began (no key, event, checkpoint or trigger disarm past it — a pan over the stage's `end`
    right after the boss clears nothing). At death / escape the camera eases back exactly to where
    the raid began (`RAID_RETURN_TICKS` / `BOSS_ESCAPE_TICKS`) and is handed back the tick after.
    A raid's parts fire only while in view (`BossPart.inView`, set in `place()`); the turrets'
    behaviour is `boss.raid` (`api.aimPart` turns a part to the aimed-shot heading —
    quantised like aimed shots, the arithmetic in the bullet system's hot `aimFrom`).
  - **Double bosses** are a `partner` (entered with the leader's intro in another slot) with
    `alternate` turns: the resting one moves to `BOSS_REST_X` over `BOSS_TURN_TICKS`, is drawn from
    the new `bosses.backBatch` (`LayerId.GroundEnemies`), is not hit / touched, its script and phase
    clock wait (and its motion before the turn resumes on its way back); a partner still flying in
    when a turn comes (its intro longer than the turn) only delays the turns by another `alternate`
    (M2-09 tests fix — they used to stop for good). The pair's link is cut
    both ways when either slot ends (a later boss in that slot is no mate). **Enrage**: the survivor
    of a death comes forward for good, `fireWait` × `enrage.fireRate`, track / orbit speed ×
    `enrage.speed`, a jump to `enrage.phase`.
  - **Boss inside a boss:** `inner`, revealed at the outer's final blast from its first core (the
    new `Boss.startX` / `startY` of the intro); the outer's tally pays, its jingle and stage clear
    wait for the inner boss.
  - **Timers:** `timeLimit` → the new `BossState.Escape` (6): no hits, flies to its entry's intro
    start past the right edge (an inner boss too — not its reveal point) over `BOSS_ESCAPE_TICKS` 90
    (its partner too), then `Dead` with `escaped`, the new
    `SimEventKind.BossEscaped` (14) and — a stage boss — `EndingFlag.BossEscaped` in the new
    `World.endingFlags` (hashed; M2-10 carries it through the run).
  - **HP bar.** Model: `bosses.hpBar` (`BossHpBar`: the cores and the parts they require of the
    main bosses in play — else of the captains —, full strength × progress during an intro, 0
    while dying). View: `core/ui` `bossHpBarFill` / `BOSS_HP_BAR_WIDTH`; `buildHud(…, bossHp)` and
    `Hud.showBossHp` draw `BOSS` and the bar in place of the hi-score. Option: the new
    `UserOptions.display.bossHpBar` (default **off**; save v1, no migration), the Options row BOSS
    HP (`OptionsItem.BossHp` 9, BACK 10, the panel taller), `UserOptionKind.BossHpBar` (9); the
    scene flow sets `Hud.showBossHp` from the saved option every displayed frame.
  - **Boss rush:** stage `type` (`normal` / `bossRush`) and `rush` (`enemy`, `delay` 60, `warning`),
    run by the boss system (`rushIndex` / `rushDelay`, hashed); a bossRush stage may not have an
    `end` event; a checkpoint restart brings the current entry again.
  - **Content.** `content/enemies/advanced-bosses.enemies.json` (four captains, IRON LEVIATHAN with
    LEVIATHAN HEART inside, the EMBER / FROST twins) and the dev stages `captain-range`,
    `raid-range`, `twin-range`, `gauntlet-range`; placeholder sprites from the new procedural
    generator `bosses` (`bosses/turret` with 16 heading frames, `bosses/orb`, `bosses/raid-hull`,
    `bosses/captain-shell`). Zone A is untouched.
  - **Goldens re-blessed**: the hash layout changed (four boss slots and their new fields, the
    part cooldown tables of 64, the rush state, the ending flags) and the new content shifts the
    sorted sprite and script ids; every replay's inputs, tick count and outcome stayed identical
    (only `hashes` / `finalHash` changed), i.e. the simulation of the existing content is
    unchanged. The stage-runtime integration test now defeats a fighting boss in any slot.

### M2-10 — Zone map, campaign flow, transitions & bonus stages

- **Goal:** the branching run from zone A to a final zone, with intro/outro animations and hidden bonus stages.
- **Depends on:** M2-09.
- **Fills:** core `scenes` (`map`, run state), `stage` (bonus stages), `data` (`campaign` kind).
- **Deliverables:** `content/campaign/campaign.json` (diamond A → B|C → D|E → F|G → H|I; edges; zone display names);
  `MapScene` (node graph drawn on canvas, Up/Down choose, OK confirm, zone preview text); run state carries score,
  lives, loadout between zones; ship launch intro and fly-out outro; zone result tally (kill %, time bonus); next zone's
  music/tileset prepared on the map screen; hidden bonus-stage framework (entrance triggers: marked gap, all ground
  targets destroyed, score digit; bonus stage kind; 1UPs and 1,000-pt bonus capsules; clearing skips the boss; dying
  locks out); ending selection hook (final zone + flags); practice-mode plumbing (start at zone/checkpoint). Stub stages
  B–I (short, placeholder) so every route is playable end-to-end now.
- **Acceptance:** graph validation (every route reaches a final zone), run-state carry-over, map navigation headless,
  bonus entrance/lock-out rules, all 16 routes completable by the bot with god mode.
- **Refs:** `shmup_feat.md` §14 (branching map, bonus stages), §5 (launch/fly-out), §17 (scene flow).
- **As built:**
  - **Campaign file.** `content/campaign/main.campaign.json` (the content naming rule
    `<folder>/<name>.<kind>.json`; + README, `example.campaign.json`), kind `campaign` owned by
    `core/data` (`data/campaign.ts`, `ContentDb.campaign`, one file per content set): `start`,
    `zones` (`id`, `label` — the map node's 1–2 letters —, `name`, `stage`, ≤ 3 `preview` lines),
    `edges` (`from` / `to`), `endings` (`zone`, optional run-flag conditions `all` / `none` over
    `RUN_FLAG_NAMES` = `bossEscaped`, `noDeath`, `noContinue`, `bonus`). Graph validation: unique
    ids, known start / edge zones, no self-loops or duplicates, ≤ 4 exits, every zone reachable and
    **every edge one depth deeper** (depth = shortest distance — so no cycles and every route ends
    in a final zone, a zone without exits), an unconditional ending per final zone, a zone's stage
    not a bonus stage. Derived: `depth`, `row`, `exits`, `final`, `depths`, `routes` (16);
    helpers `campaignRoutes`, `countCampaignRoutes`, `campaignZoneIndex`, `runFlagMask` and the
    ending hook `selectCampaignEnding` (the first ending of the final zone whose flags match).
  - **Campaign runs.** A flow game is a campaign run when the host config's stage is the start
    zone's stage (the shipped game — zone A); any other stage (the `?stage=` dev stages, open
    space) keeps the M1 single-stage flow and its stage-clear screen unchanged. The run state is
    `core/scenes` `run.ts` (`RunState`, `SceneFlow.run`): each zone is a fresh World
    (`runWorldConfig` — the zone's stage in the chosen config — and `prepareRunWorld`), the players
    are **carried** (`captureCarry` / `applyCarry`: score with the continue digit and next extend,
    lives, loadout — meter weapons, Options, the Direct-mode levels and family —, speed level,
    meter cursor, shield; a player down respawns blinking, an out player stays out, an unjoined
    player 2 stays inactive), `world.rankInputs.stage` = zones cleared + 1 (M2-01's stage term),
    RETRY STAGE restarts the zone from its entry state. The run's deaths, continues and ending flags
    (`World.endingFlags`, a cleared bonus stage) accumulate for the ending (`RunFlag`,
    `RunState.endingFlags`).
  - **Launch intro / fly-out.** The launch is the existing fly-in plus a **zone title card**
    (`ZONE B` / the zone's name, `ZONE_CARD_TICKS` 150, `BONUS STAGE` in a bonus stage). The
    fly-out is a new `PlayerState` **`leaving`** (appended, code 5; `core/player` `flyOutPlayer`,
    `LEAVE_ACCELERATION` 0.125, `LEAVE_MAX_SPEED` 8, `LEAVE_END_X`): from the tick after the status
    turns `stageClear` every `alive` ship leaves right, uncontrollable, unhittable, not firing, its
    Options trailing (a ship still flying in leaves after its fly-in). It changes only ticks after a
    stage clear (never in a golden recording).
  - **Zone result tally** (campaign runs only): the stage-clear screen in zone mode
    (`StageClearScene.zoneMode`, `ZONE_TALLY_TICKS` 300): `ZONE X CLEAR` / `BONUS STAGE CLEAR`, the
    score(s), the kill rate of the World's regular enemies (the new hashed `EnemySystem.stats` —
    `EnemyStats`: spawned, killed by a player, ground ones apart; never reset) × 100 points and the
    boss time bonus (100 points per whole second a defeated — not escaped — stage boss's fight
    stayed under 90 s), paid to every player in play (`tallyZone`, `awardZoneBonus`, extends
    checked). Then the map (a zone with exits; the save counts a cleared stage), the ending (final
    zone — the run is recorded in the hi-score table only now) or the title (practice).
  - **Zone map** (`MapScene`, id `map`, a full screen over the title's starfield): the graph —
    one column per depth, the zones of a depth in file order, dotted edges, the route lit, the
    cleared zone yellow, its exits outlined, the focused one blinking — and a preview panel (label,
    name, preview lines). Up / Down (sorted top to bottom, wrapping, the UI kit's repeat), OK
    launches (`LAUNCH` blinks `MAP_LAUNCH_TICKS` 60), Back → "quit to title?". The UI list grew to
    384 commands / 224 string slots. The map fades the music out (no `ZoneMap` track yet).
  - **Next zone prepared on the map:** OK pushes the new `SimEventKind.PrepareStage` (15, id = the
    stage index); `@shmup/shell` `connectStagePreparation` has the audio engine prepare that
    stage's music set plus the title theme (one set resident). The set follows the stage about to
    play (`FlowControl.prepareStage`, deduplicated against the last prepared stage — the host
    config's at boot): the title prepares the next run's start stage again, a run start and
    `startPractice` prepare their own stage, so a second run never plays through the last zone's
    set. Tilesets need nothing: every tile is in the one atlas (per-zone texture unloading is
    M2-17).
  - **Hidden bonus-stage framework.** Stage `type: 'bonus'` (no boss / warning / entrance events,
    an `end`); a `bonus` event (appended `STAGE_EVENT_TYPES` / `StageEventCode.Bonus` 10) names the
    bonus stage and its entrance — `gap` (a living ship's centre in `region`), `ground` (every ground
    enemy of the window destroyed by the players, ≥ 1), `digit` (`floor(score / place) mod 10` of a
    playing ship when the window closes; `place` 10 … 100,000, default 100) — with defaulted
    `until`s; at most 8 per stage. The World side is `core/stage` `bonus.ts` (`BonusEntrances`,
    `World.bonus`: armed by the stage hook, tested in phase 3, hashed; a restart re-arms the windows
    it lands in). The flow: an opened entrance → after `BONUS_WARP_TICKS` (40) the game scene swaps
    to the bonus stage's World (players carried); its clear is the zone's clear (the boss skipped;
    run flag `bonus`); the first death there → after `BONUS_FAIL_TICKS` (60, before the bonus
    stage's game over or clear screen could come) back to the zone's World at the entrance's `x`,
    entrances locked (`BonusEntrances.lock`). Items: content drops `oneUp` and `bonusCapsule`
    (`DropKind` 4 / 5 — `FreeOption` is 6 now), `ItemKind.OneUp` (9: +1 life, cap 9) and
    `ItemKind.BonusCapsule` (10: 1,000 points), world-space in both modes; sprites `items/1up` and
    `items/capsule-bonus` from the `items` generator (engine sprites). Shipped dev content:
    `bonus-range` (one entrance of each kind) and `bonus-vault` (bonus-capsule carriers, a 1UP
    carrier, brick barriers), `content/enemies/bonus.enemies.json`. No campaign zone has an entrance
    yet (M2-11 puts one in zone B).
  - **Ending hook.** `EndingScene` (id `ending`): the ending `selectCampaignEnding` picked for the
    final zone and the run's flags, the route's labels, the score(s), the flag lines, `THANK YOU FOR
    PLAYING`; OK after `ENDING_LOCK_TICKS` or `ENDING_TIMEOUT_TICKS` → title. The shipped endings are
    placeholders (H: flawless / plain; I: flawless / boss escaped / plain) until M2-14.
  - **Practice plumbing:** `SceneFlow.startPractice(zoneId, checkpoint)` — one campaign zone at a
    checkpoint with the zone's rank stage term and a fresh start; its clear returns to the title;
    `recordRun` records nothing for practice (the practice select and its table are M2-15).
  - **Stub zones B–I** (`zone-b … zone-i.stage.json`, ≈ 45–70 s each): zone A's roster (popcorn,
    capsule carriers, a fan, a rammer, an orbiter; floor turrets and walkers where there is a
    floor), heightfield floors / caves, then the WARNING and a reused boss (HALCYON BULWARK in
    B / D / F / H, the EMBER AND FROST TWINS in C / E / G, IRON LEVIATHAN in I). Names from M2-11 …
    M2-14.
  - **Playtests.** `test/playtest/campaign.ts` plays a run's zones exactly as the flow builds them
    (`runWorldConfig` + `prepareRunWorld`, tally, carry) and walks the route tree (31 zone runs for
    the 16 routes, zone A once); `campaign-routes-b` / `-c.test.ts` fly all 16 routes with the 4-way
    bot in god mode (every zone cleared, rank terms 1–5, the score growing, an ending each);
    `test/integration/campaign-flow.test.ts` drives the real flow through A-C-E-G-I (map Down + OK).
    The bot now faces the first **fighting** boss slot (`mainBoss`) — it used to look at slot 0 only
    and never found the survivor of a double boss in slot 1.
  - **Goldens re-blessed:** the hash layout grew (the bonus entrances, the enemy totals), the two
    new engine sprites shift the sorted sprite ids and `bonus.enemies.json` shifts zone A's enemy
    spec indices; every zone A scenario kept its inputs, tick count and outcome (only hashes
    changed). `captain-range-god`, `raid-range-god` and `twin-range-god` were re-recorded with the
    improved bot (same outcomes; shorter fights).
  - Shell tests used `campaign` as the example of a foreign kind nobody owns; they use `strings`
    (M2-16's kind) now. App tests that drop zone A from the content drop the campaign with it.
  - **Test round.** Edge suites for the campaign kind (one-zone and uneven maps, the schema limits,
    `completeCampaign` alone, the shipped endings under all 16 flag masks), the entrances (every
    ship state, region edges, each digit place, arming / restart edges, the data limits; an
    allocation guard of `update` with all three kinds armed), the run state (carry of every ship
    state, co-op, shields, the tally's rounding and boss rules) and the flow (Back → YES, the
    `LAUNCH` blink, map layout, a map without campaign, game over / continue / practice records,
    RETRY STAGE inside a bonus stage, an entrance opening just before the clear, a single-stage
    run's bonus stage); `test/integration/bonus-stage-runtime.test.ts` (the shipped range → vault →
    clear, and the lock-out after a death); three goldens (`bonus-range-god` — the ground
    entrance —, `bonus-range-digit`, `bonus-vault-god` — capsules and the 1UP; no existing golden
    changed); `test/e2e/campaign-run.spec.ts` (A-B-D-F-H to the ending and the saved run, the
    vault's items drawn, the remote on the Tizen build). Fixes: a self-loop edge was reported twice
    (the second as a contradictory depth error); the largest maps the validation accepts overflowed
    the 384-command UI list (a 32-zone map dropped 603 commands) — `MapScene.edgeDots` thins the
    edge dots to fit (the shipped map keeps 7); `connectStagePreparation` modified the cue picker's
    list (`unshift`) — it builds its own now, the title theme first and once.

### M2-11 — Zones B & C

- **Goal:** replace stubs B and C with full zones.
- **Depends on:** M2-10.
- **Fills:** content, behaviours, sprite sources, songs.
- **Deliverables:** **B — BRINE NEBULA** (bubbles/aqua: splitting bubbles, enemies inside bubbles, wavy raster water;
  mid-boss; boss mechanical-fish archetype with a mouth weak point and homing rockets) and **C — DUNE EXPANSE** (desert:
  sand worms from dunes, ceiling walkers; boss insect/arachnid archetype spawning spider drones). Each: stage JSON
  (3–6 min), 4–6 new enemy types, direct-mode item plan, song + boss variations, placeholder art generators. One hidden
  bonus stage in B.
- **Acceptance:** content check, sprite coverage, 4-way playtest completes both zones with god mode within 3–6 min,
  recovery rule after checkpoints, golden replay per zone.
- **Refs:** `shmup_feat.md` §14 (themes), §11, §13 (roster).
- **As built:**
  - **Zone B — BRINE NEBULA** (`content/stages/zone-b.stage.json`, 9,800 px, `terrain-reef`): the
    shallows (splitting `froth` bubbles → `froth-bead`s, bead popcorn streams, `brood-bubble`s with a
    `gill-dart` fish inside, carriers), a floor-and-ceiling reef tunnel with `urchin` turrets
    (checkpoint 2,000), the mid-boss **SPUME HERALD** (SH-02 — a captain on the M2-09
    `captain.launcher`, launching brood bubbles; `boss` event at 3,800, 30-s time limit), the deep
    current with `reef-jelly` ring-firers (`pattern.loop` + the new DSL pattern `brine.jelly-ring`)
    and the **hidden bonus entrance** (checkpoint 4,600), a 1.4 px/tick riptide (checkpoint 6,800),
    a calm with two carriers, then **GALVANIC MAW** (GM-02). Wavy water: a `wave` raster effect on
    the new sea band `bg/brine-sea` (painted in its palette cycle's four colours) and on the far
    nebula band `bg/brine-nebula`. "Enemies inside bubbles" is content: `bubble.split` with
    `count` 1 and a fish as its `child`.
  - **The bonus stage.** One `gap` entrance: a region at the top of the view (world x 5,616–5,680,
    y 0–24) marked by two 16×24 reef blocks — a ship flies under the left block, then up into the
    gap — into `brine-grotto.stage.json` (**PEARL GROTTO**, type `bonus`, 1,800 px: the bonus
    vault's carriers dropping bonus capsules, its 1UP carrier, froth bubbles, two brick barriers on a
    reef floor and ceiling); it uses the zone's music set (no own track, see M2-10's gotcha).
  - **Zone C — DUNE EXPANSE** (`zone-c.stage.json`, 9,600 px, `terrain-dune`): dunes with sand
    worms and `sand-skimmer` swoops on the new `content/paths/zone-c.paths.json`, a canyon with
    `husk-crawler` walkers on its ceiling (and floor), `dust-devil` spirals (`dune.whirl`) and
    `sand-geyser`s (a `volcano.lob` throwing `sand-clod`s) (checkpoint 2,200), the worm field
    (checkpoint 4,400), a 1.3 px/tick sandstorm run (checkpoint 6,600), the calm, then
    **SANDGRAVE WIDOW** (SW-03). Heat `haze` raster effects over the twin suns (`bg/dune-suns`) and
    the dune ridge band (`bg/dune-ridge`). No mid-boss (the plan names one only for B).
  - **New behaviours** (`core/behaviors`): `rocket.homing` (launched diagonally away from the
    middle row, homes turn-rate-capped for `homeTicks`, then flies straight on — a `Homing` mover
    with turn rate 0), `worm.burst` (a formation is one worm: the leader lies in the dune on a
    `Ballistic` mover with a proximity `trigger` — 190 px in the content, so the arc comes down in
    front of the ship — and passes through the terrain; the other members `Follow` its track), and
    the boss behaviours `boss.maw` (tracking; the `whenOpen` mouth — the core — opens / shuts on two
    timers, cutters (aimed needles) only while open, a ring as it opens from phase 1, the `minion`
    launched from the guns in turn; tunable `gape` moves the parts attached to a core — the jaws —
    apart while open, placed from their rest offsets in the boss data — the new `BossPart.restX` /
    `restY` — so a phase starting mid-gape with another `gape` cannot make them drift) and
    `boss.widow` (random sidesteps inside a box, spreads from the core — the head, `afterParts` of
    its two fangs, which stand in its lane like HB-01's plates —, spider drones from the guns — the
    spinnerets —, and from phase 1 detached silk-line lasers, one at a time). **Homing rockets are
    minions** (shootable enemies launched with `api.launch`), not homing bullets: `BossScriptApi`
    has no homing-bullet primitive and the minion route needed no engine change.
  - **Rosters** (`content/enemies/zone-b.enemies.json`, `zone-c.enemies.json`; the new files sort
    after zone A's, so zone A's spec indices did not move): six new types placed in B (froth,
    froth bead, brood bubble, gill dart, reef jelly, urchin) and five in C (dune worm, husk
    crawler, sand skimmer, dust devil, sand geyser) — the content test counts distinct sprites, so
    a floor and a ceiling variant are one type; the carriers are zone A's `tender`. Every bullet,
    rocket and dash stays ≤ 2 px/tick; patterns in `content/patterns/zones.patterns.json`.
  - **Art as code:** two new generators `scripts/assets/procedural/brine.mjs` and `dune.mjs`
    (backdrop bands, the enemies, the boss parts, the captain's shell — all procedural rather than
    pixel maps), shape helpers `fillEllipse` / `drawLine` in `common.mjs`, and `terrain.mjs` draws
    three tilesets from `TERRAIN_PALETTES` (`tiles/terrain-a` unchanged, `-reef`, `-dune`; the
    tileset files are copies of `terrain-a` with the other sprite).
  - **Songs** (chip songs, `stages`-scoped so they win over the defaults only in their zone and the
    map's `PrepareStage` loads them): `zone-b` (BRINE NEBULA) and `boss-b` (MAW OF THE NEBULA),
    `zone-c` (DUNE EXPANSE) and `boss-c` (SANDGRAVE ASSAULT) — 6.4 s intro + 44.8 s loop for the
    stage themes, the boss themes in the shipped boss song's form.
  - **Direct-mode item plans** (`directItems`, 26 entries each) in both stages.
  - **Playtests:** `test/playtest/zone-b.test.ts` / `zone-c.test.ts` (god mode: stage clear in
    3–6 min, three boss phases, the 4-way rules on every tick; the no-god-mode run is reported).
    Measured with the 4-way bot: B 225 s (GALVANIC MAW 24 s), C 243 s (SANDGRAVE WIDOW 51 s);
    without god mode B clears with no death, C with one. The harness's boss statistics now follow
    the stage's main encounter (a boss of role `boss` in any slot) — zone B's captain comes first
    in slot 0. The recovery rule is `test/playtest/recovery.ts` (zone A's test uses it too) +
    `zone-bc-recovery.test.ts` (every checkpoint of B and C). The 4-way bot does not predict the
    vertical motion of ground enemies (a rising worm) — the worms' trigger keeps their dive ahead
    of its column; balance deaths are reported, never asserted.
  - **Content check** (`content.test.ts`, block "zones B and C"): names, bosses, 3 phases, 2.5–4.5 min
    to the WARNING, a high-speed key, exactly two carriers in the calm, own tileset / songs / item
    plan, 4–6 new types, the zone's archetypes (splitting bubbles, a non-bubble child, a mid-boss
    captain in the first half, the `whenOpen` mouth and the rocket minion; worm formations,
    ceiling walkers, the fangs), the gap marked by its blocks into a bonus stage with bonus capsules and a 1UP, every speed
    tunable and DSL literal ≤ 2, the capsule budget, ground enemies standing on rock, each boss
    fight with the bot under the 4-way rules (at most one lane at a time), every hittable sprite's
    hit flash and the zone tilesets' frames. Also `zones-bc-runtime.test.ts` (the gap → PEARL
    GROTTO through the scene flow from a practice start, the captain on the scrolling camera, the
    worms rising), `behaviors-zones.test.ts` + allocation guards `behaviors-maw-alloc` /
    `behaviors-widow-alloc` (minion launches off), `procedural-zones.test.ts`.
  - **Goldens:** new `zone-b-god`, `zone-c-god` (4-way bot, god mode, start to stage clear) and
    `brine-grotto-god` (full loadout). **Re-blessed:** the new sprites and scripts shift the sorted
    sprite / script ids hashed through the pools; all 28 older files kept their inputs, tick counts,
    headers and outcomes (only hashes changed).
  - **Test round:** `behaviors-zones-edge.test.ts` (the four behaviours' defaults and tunable
    floors / clamps, rocket phase lengths, a trigger-0 and a ghost-led worm, the worm arc through
    terrain, the maw's 12-tick cutter delay, ring offsets, pods in turn, a rest-0 part that never
    moves, tracking margins, `restX` / `restY` on activation and reset for the next boss, the
    widow's swapped box, whole-pixel rests, drones per spinneret, silk lines in turn),
    `behaviors-rocket-worm-alloc` (homing rockets and waiting worms allocate nothing),
    `procedural-zones-edge.test.ts` (shape-helper edges, every hurtbox inside its sprite),
    `zones-bc-direct.test.ts` (the MANTA clears both zones in Direct mode, the carriers handing out
    each stage's own plan in order), the browser spec `zones-bc.spec.ts` (both zones' backdrops and
    bosses, the grotto, the widow on the Tizen build) and two more goldens — `zone-b-deaths` (the
    weaving pilot, Arcade penalty: checkpoint restarts, game over) and `zone-c-bot` (the 4-way bot
    without god mode: a death, the clear). No existing golden changed.
  - Tests that pin shipped lists were updated: the music tracks, the foreign content files
    (`@shmup/shell` boot / loader tests), the enemy and boss behaviour rosters, the atlas's enemy
    sprite count.
  - **Bundle:** the Tizen `app.js` is now 307.5 KB gzip of its 350 KB budget (the zone B / C
    content adds ≈ 6 KB gzip — the stages, songs and rosters are inlined); zones D–I will need the
    same care (M2-17 / M2-18 own the budget).

### M2-12 — Zones D & E

- **Goal:** full zones D and E.
- **Depends on:** M2-11.
- **Deliverables:** **D — MAGMA DEEP** (volcano → underground: erupting volcanoes, falling rocks, a dive into a
  destructible maze; boss: a second core battleship variant with rotating shield arms) and **E — TEMPEST RIDGE**
  (storm clouds over jagged mountains: rear-entering enemies, heavy weather parallax; boss seahorse archetype launching
  homing minis from its chest). Same deliverable list as M2-11.
- **Acceptance:** as M2-11.
- **Refs:** `shmup_feat.md` §14, §11, §13.
- **As built:**
  - **Zone D — MAGMA DEEP** (`content/stages/zone-d.stage.json`, 9,600 px, `terrain-magma`, a
    400-px-tall map — `rowsTall` 50): the caldera fields on the surface (`ember-wisp` streams,
    `cinder-bat` swoops on the new `content/paths/zone-d.paths.json`, erupting `magma-cone`s —
    M2-07's `volcano.lob` — lobbing `magma-bomb`s, a `basalt-turret`), the eruption field
    (checkpoint 2,200), then **the dive**: a camera key at 3,560 with `hold` 150 and `yTo` 200 stops
    the scroll over the pit (the surface floor's heightfield ramps down into it) and pans the camera
    200 px down into the caves, where it stays. The caves (checkpoint 4,000): `cinder-rock`s dropping
    from the roof (`rock.fall`), `slag-crawler`s, then the **destructible maze** — seven brick walls
    (the tileset's `brick`, hp 4, written as `rle` rows over the generated caves at world x
    4,800–5,776), each with a 48-px gap at another height; the lava river (checkpoint 6,800,
    1.3 px/tick), the calm, then **CINDER BASTION** (CB-04). Backdrops: `bg/magma-peaks` (a heat
    `haze` until the dive) and the palette-cycled lava lake `bg/magma-lava`, placed below the surface
    view (`y` 256, factor 0.5) so it rises into view with the dive (a slow `wave` after it).
  - **Zone E — TEMPEST RIDGE** (`zone-e.stage.json`, 9,800 px, `terrain-ridge`): the storm front
    over jagged peaks (heightfield floors with `amp` 9–18 % of the `period`), the ridge pass
    between jagged floors and overhangs (checkpoint 2,200), the thunderheads (checkpoint 4,600), the
    gale run (checkpoint 6,800, 1.4 px/tick), the calm, then **SQUALL STEED** (SS-05). **Rear
    attackers** throughout: `gale-kite` formations (`fan.loop` on the new rear-entry paths
    `kite-overtake-high` / `-low` of `content/paths/zone-e.paths.json`) and `squall-jumper`s (the new
    behaviour `rear.swoop`), both spawned behind the ship (a negative `screenX`) and overtaking it.
    **Heavy weather**: six parallax bands — two rows of storm clouds (`bg/storm-clouds`, painted in
    their palette cycle's four colours, rolled by a `wave`), a mountain band (`bg/storm-ridge`) and
    three rows of slanting rain (`bg/storm-rain`, factor 0.9).
  - **New behaviours** (`core/behaviors`): `rear.swoop` (one `Waypoint` mover: in along its row to
    `turnX`, a hold with one aimed shot half-way through it, then away to the left — the script
    wakes once); the boss behaviours `boss.bastion` (tracking, lane lasers from the guns in turn —
    attached, like HB-01's —, spreads and rings from the core; its **rotating shield arms** are data:
    a `hub` part attached to the core, with no hurtbox and no sprite, and four armoured arm segments
    with circle hurtboxes attached to it — the behaviour only sets the hub's `spin` per phase and
    reverses it every `reverseTicks`, so a phase change never makes the arms jump) and `boss.steed`
    (a bob on a tall ellipse — the boss system's `orbit` —, a `whenOpen` chest opening and shutting
    with its lids — `setJaws`, from the rest offsets —, the homing minis launched from the chest
    only while it is open, spreads from the snout, rings from it as the chest shuts). **No engine
    change**: the M2-09 part turns and the M2-11 minion route carried both bosses. The seahorse's
    orbit speed is the tunable `bobSpeed`, not `speed` — the content test reads a boss phase's
    `speed` as px/tick.
  - **Rosters** (`zone-d.enemies.json`, `zone-e.enemies.json`): six new types placed in D (ember
    wisp, cinder bat, magma cone, cinder rock, slag crawler, basalt turret) and five in E (hail
    drifter, gale kite, squall jumper, crag turret, thunderhead), new to every zone a run can have
    flown before (A–C); the carriers are zone A's `tender`; patterns: `tempest.bolt` in
    `zones.patterns.json` (a streak of four aimed needles, 0.85 → 1.6 px/tick).
  - **Art as code:** generators `scripts/assets/procedural/magma.mjs` (13 sprites) and
    `tempest.mjs` (17), registered in `procedural/index.mjs`; `TERRAIN_PALETTES` entries
    `tiles/terrain-magma` / `-ridge` with their tileset files (copies of `terrain-a`'s tiles).
  - **Songs:** `zone-d` (MAGMA DEEP), `boss-d` (BASTION OF CINDERS), `zone-e` (TEMPEST RIDGE),
    `boss-e` (STEED OF THE SQUALL) — `stages`-scoped chip songs in the forms of M2-11's (6.4 s intro +
    44.8 s loop; the boss themes' shape).
  - **Direct-mode item plans** (26 entries each) in both stages.
  - **Playtests:** `test/playtest/zone-d.test.ts` / `zone-e.test.ts` (god mode: stage clear in 3–6
    min, three boss phases, the 4-way rules on every tick; zone D's camera reaching y 200; the no-god
    run reported) and `zone-de-recovery.test.ts` (every checkpoint of D and E — zone D's third in the
    caves). Measured: D 228 s (CINDER BASTION 14 s), E 246 s (SQUALL STEED 51 s); without god mode
    both clear with one death.
  - **Balance found by the bot** (deaths reported, never asserted, but a zone should be survivable):
    a maze wall without a gap killed the 4-way bot — its lane-centred ship straddles two tile rows,
    so a one-row hole shot through a wall does not fit it — so every wall has a gap (48 px: the
    stage-runtime test's flyable-corridor rule) and shooting through is the shortcut; the turrets
    and crawlers left the maze (a turret passing under the ship fires straight up its column, which
    a lane-only dodger cannot leave); SQUALL STEED's first bob (40 px) made its fight last three
    minutes (the chest moved out of the lane while the shots flew), the shipped one bobs 14–18 px;
    CINDER BASTION's core got 80 hit points (a 60-hp core fell in 10 s once the bot had an Option).
  - **Content check** (`content.test.ts`, the zones block now "B–E"): the table got D and E; the
    "4–6 new types" count compares with every zone flown before (`earlier`); "ground enemies stand on
    rock" measures at the camera y each event fires at (zone D dives); the boss fight allows the
    bastion's two lanes to overlap for a moment (`lanes`, never under the 16-px gap); the rear
    attackers' speeds join the 2-px/tick check. New tests: D's volcanoes, falling rocks, the dive,
    the maze (every brick wall in the caves with a ≥ 24-px gap), the shield arms on a hub; E's rear
    attackers, weather bands, jagged floors, the seahorse's chest and minis. Also
    `zones-de-runtime.test.ts` (the dive at a scroll stop, a practice start in the caves, the maze's
    bricks broken by shots, jumpers and kites overtaking the ship), `behaviors-zones-de.test.ts`,
    allocation guards `behaviors-bastion-alloc` / `-steed-alloc` / `-swoop-alloc`,
    `procedural-zones-de.test.ts`.
  - **Goldens:** new `zone-d-god` (13,698 ticks) and `zone-e-god` (14,736 ticks), the 4-way bot with
    god mode from the start to the stage clear. **Re-blessed:** the new sprites and scripts shift the
    sorted sprite / script ids hashed through the pools; all 33 older files kept their inputs, tick
    counts, headers and outcomes (only hashes changed).
  - Tests that pin shipped lists were updated: the music tracks (content test, `@shmup/shell` boot /
    loader tests), the enemy and boss behaviour rosters, the atlas's enemy sprite count (47), the
    zone tilesets of the terrain generator test, the golden file-name pattern. The flyable-corridor
    check of `stage-runtime.test.ts` (≥ 48 open px in every column, a clear spawn at every
    checkpoint) measured the rows 0–199 of every map; it now measures the rows the camera shows when
    the ship reaches the column (zone D's caves are rows 200–399).
  - **Bundle:** the Tizen `app.js` is 313.5 KB gzip of its 350 KB budget (was 307.5 after M2-11:
    the two zones' stages, songs and rosters add ≈ 6 KB gzip).
  - **Test round:** `behaviors-zones-de-edge.test.ts` (the three behaviours' defaults; the rear
    attacker's timing — the turn point on tick ⌈distance / speed⌉, the shot on hold tick
    `(hold >> 1) + 1`, also on a scrolling camera —, `ways` / `hold` / `speed` floors, the settle
    rule; the bastion's spin rounded and set only on the hub, `reverseTicks` floored, the arms'
    angle kept through a phase change, lanes attached to their emitter in turn, floored spreads,
    ring offsets, tracking margins; the seahorse's ellipse, a still bob, the phase-change move ≤
    the radii's change, sub-1 chest timers, the 10-tick first launch, floored minis per opening,
    the foal's homing phases, snout spreads and rings only as the chest shuts, floored lid gape,
    every phase starting shut), `zones-de-runtime-edge.test.ts` (every practice start of D and E
    in open space at its camera height, the stage skip into the caves, Arcade restarts in the caves
    — the maze rolled back — and before the dive — back on the surface, diving again —, jumper
    needles only in view), `zones-de-direct.test.ts` (the MANTA clears both zones in Direct mode,
    each stage's own plan handed out in order), `procedural-zones-de-edge.test.ts` (kebab names,
    frames that animate, the rain tiling both ways, the registry, zone A's bricks in the zone
    tilesets), the browser spec `zones-de.spec.ts` (the peaks, the lava lake rising with the dive,
    the storm clouds and ridge, both bosses, both on the Tizen build) and three more goldens —
    `zone-d-bot` (the 4-way bot without god mode: a death and a respawn down in the caves, the
    clear), `zone-d-boss` (the stage skip into the caves, full loadout, Arcade penalty) and
    `zone-e-bot` (the 4-way bot without god mode: a death, the clear). No existing golden changed.
    **Fixed:** a `rear.swoop` spawned right of its `turnX` timed its shot as if it stood there
    already, so the shot fell inside the settle time and was dropped (it now times the approach from
    the distance either way); the squall jumper's two frames were identical (the flame drawn under
    the fuselage), so its jet now flickers; `boss.steed`'s docs no longer claim a phase change never
    moves it (a new `ry` moves it up to the radii's change, 2 px between the shipped phases).
  - **Gotcha:** `StageRunner.jumpTo` moves the camera, not the ships — in zone D a jump past the dive
    leaves a ship spawned at the surface clamped to the top of the view (inside the cave roof); a
    test that jumps there calls `spawnPlayer(ship, camera)` again. The game's own starts (the stage
    skip, a practice start, checkpoint restarts) spawn the ship where the camera is.

### M2-13 — Zones F & G

- **Goal:** full zones F and G.
- **Depends on:** M2-12.
- **Deliverables:** **F — CELL VAULT** (organic cells: chasing cells, regenerating tissue walls, grabbing tentacles;
  boss squid archetype whose tentacles guard the weak point) and **G — PRISM LABYRINTH** (crystal walls, seeded cube
  rush; boss crystal-core archetype with tentacle arms). Second hidden bonus stage in G. Same deliverable list as M2-11.
- **Acceptance:** as M2-11.
- **Refs:** `shmup_feat.md` §14, §11, §13.
- **As built:**
  - **Zone F — CELL VAULT** (`content/stages/zone-f.stage.json`, 9,600 px, `terrain-vault`, camera
    keys `0.8 → 0.7 → 0.75 → 1.3 → 0.75`): the membrane (`lymph-mote` streams, `chaser-cell`s,
    `mitosis-cell`s dividing into two chasing cells when shot, `polyp-turret`s), the **tissue
    passage** (checkpoint 2,200: seven regenerating walls of the tileset's `tissue` tile — hp 3,
    regen 240, never grown into a ship — written as `rle` rows at world x 2,896–3,872, 16 px thick,
    each with a 56-px gap at another height), the **tentacle garden** (checkpoint 4,400: `vault-claw`
    grabbing tentacles — M2-07's `tentacle.grab` — on the floor and ceiling, hovering `spore-sac`s
    puffing `vault.spores`), the pulse run (checkpoint 6,800, 1.3 px/tick), the calm, then **MANTLE
    REGENT** (MR-06). The far band `bg/vault-membrane` (a wall of cells in its palette cycle's four
    colours) pulses and breathes (a slow `wave`), `bg/vault-folds` in front of it.
  - **Zone G — PRISM LABYRINTH** (`zone-g.stage.json`, 9,800 px, `terrain-prism`, keys `0.8 → 0.7 →
    0.75 → 1.3 → 0.75`): the prism field (`glint-mote` streams, `halo-crystal` orbiters on zone A's
    `gyre-orbit-*` loops — no new path file —, `prism-lens`es, `geode`s shattering into
    `geode-shard`s, `facet-turret`s), the **prism gallery** (checkpoint 2,200: four turrets on the
    floor and ceiling in a `ground` entrance's window, x 2,300 until 3,100 — shoot every one down and
    the **second hidden bonus stage** `glimmer-cache.stage.json`, **GLIMMER CACHE** (type `bonus`,
    1,800 px: bonus-capsule carriers, a 1UP carrier, a cube rush, two `cube` block walls) opens;
    the turret before the gallery spawns at x 1,830 so it has scrolled off — and despawned — when
    the window arms: a `ground` window counts every ground kill made while armed, and the first
    build's turret at x 2,000 was still on screen at 2,300, so shooting it stood in for a gallery
    turret — found in review), the
    **crystal labyrinth** (seven solid crystal walls at world x 3,392–4,272, hanging from the ceiling
    and rising from the floor in turn, drawn with the tileset's wall-edge, floor and ceiling tiles),
    the **cube rush** (checkpoint 4,600: four seeded `prism-cube` rushes — `cube.stack` formations,
    `drop: null` — stacking onto 22 short crystal pillars as breakable `cube` tiles), the refraction
    run (checkpoint 6,800, 1.3 px/tick over jagged spires), the calm, then **FACET MONARCH**
    (FM-07). B's entrance was a `gap`; G's is the `ground` kind, so the two hidden stages open
    differently.
  - **New behaviours** (`core/behaviors`): `cell.chase` (drifts in along its row, then chases the
    nearest ship on a turn-rate-capped `Homing` mover for a while, then swims straight on; a cell
    thrown out of a dividing cell — `bubble.split`'s straight mover — flies out first) and two boss
    behaviours on a shared **curling-arm** rule — an arm is a chain of circle-hit parts hung from a
    part that is not one; every segment turns by the same amount relative to its parent, mirrored
    above and below (`armSide`, from the root's `restY`), so an arm curls like a tentacle; a phase
    carries the curl on from where the last one left it (`armCurl`) and sets each turn point exactly
    (`setArmCurl`), so a phase change never makes an arm jump: `boss.squid` (MANTLE REGENT: tracking,
    the tentacles straight / curling in / guarding in front of the eye / uncurling in a cycle,
    spreads from the eye, needles from the tips, rings as they open, chasing-cell launches) and
    `boss.facet` (FACET MONARCH: tracking, the arms waving between two turn points like claws,
    needles from the tips, rings and — last phase — detached lane lasers from the core). **No engine
    change**: M2-09's turned parts (`spinPart`, `setPartAngle`, circle hurtboxes) carry both.
  - **MANTLE REGENT**: mantle (armour), eye (the core, 90 hp), two tentacles of a breakable root
    (24 hp), three armoured segments and an armoured gun at the tip (13 parts); the first phase ends
    when a tentacle breaks (`partsDestroyed` of both roots, `count` 1) or the eye falls below 60 —
    "break one = changes behaviour". **FACET MONARCH**: the hexagonal housing (decoration), an
    armoured hull part without a sprite behind the core, the core `afterParts` of two crystals in
    front of it (22 hp each), two armoured four-segment arms with gun tips. The first build hung the
    armour hurtbox on the housing — it covered the core, whose hits then clinked; the hull now sits
    behind the core.
  - **Rosters** (`zone-f.enemies.json`, `zone-g.enemies.json`): six new types each by sprite — F:
    lymph mote, chaser cell, mitosis cell, vault claw, polyp turret, spore sac; G: glint mote, prism
    cube, facet turret, halo crystal, prism lens, geode (the shard is the geode's child, a
    `bubble.split` with `count` 0); floor / ceiling and hover-high / hover-low variants share a
    sprite; the carriers are zone A's `tender`. Patterns `vault.spores` and `prism.fan` in
    `zones.patterns.json`; every speed ≤ 2 px/tick (the content test now also holds the chasing
    cells' and the claws' `speed` / `retractSpeed` to it).
  - **Art as code:** `scripts/assets/procedural/vault.mjs` and `prism.mjs` (14 sprites each; the
    regent's tail fin and the monarch's housing are decoration without a hit flash),
    `TERRAIN_PALETTES` `tiles/terrain-vault` / `-prism` with their tileset files (copies of
    `terrain-a`'s tiles). The prism rock is lighter than the facet wall behind it (the first colours
    let the labyrinth's walls vanish into the backdrop).
  - **Songs:** `zone-f` (CELL VAULT), `boss-f` (REGENT OF THE VAULT), `zone-g` (PRISM LABYRINTH),
    `boss-g` (THRONE OF FACETS) — `stages`-scoped chip songs in M2-11's forms (6.4 s intro + 44.8 s
    loop; the boss themes' shape); GLIMMER CACHE plays zone G's resident set. **Direct-mode item
    plans** (26 entries each) in both stages.
  - **Playtests:** `test/playtest/zone-f.test.ts` / `zone-g.test.ts` (god mode: stage clear in 3–6
    min, three boss phases, the 4-way rules; F's shots break tissue and its claws lunge, G's rush
    stacks cubes; the no-god run reported) and `zone-fg-recovery.test.ts` (all eight checkpoints).
    Measured: F 219.8 s (MANTLE REGENT 23.5 s), G 234.1 s (FACET MONARCH 34.8 s); without god mode
    both clear with no death.
  - **Balance found by the bot:** a turret passing over or under the ship fires straight down / up
    its column, which a lane-only dodger cannot leave — fewer turrets, slower fire (170 / 180 ticks
    at 1.2), none by the labyrinth's first wall (it moved to x 3,392, past the gallery); a lens or
    sac drifting across the ship's column fired point-blank fans — they now hover at the right on a
    `waypoint` mover, then drift off up or down; zone G's first stretch was too tight for its mote
    streams (flatter floor, the ceiling from 800); the rush's cubes, aimed at the ship, mostly flew
    off the left edge — the pillars give them rock to stack on (11 cubes stacked at once in the god
    run, from 1).
  - **Content check** (`content.test.ts`, the zones block now "B–G"): the table got F and G
    (`earlier` A–E; `lanes` 0 / 1); new tests: F's chasing and dividing cells, the tissue walls (≥ 10
    columns, each with a ≥ 48-px gap), claws on both floor and ceiling, the squid's two chained
    tentacles and the tentacle-break phase change; G's hanging and rising crystal walls, ≥ 3 seeded
    rushes, the core behind its crystals, the arms, the `ground` entrance (only the gallery's
    turrets, floor and ceiling, in its window) into its own bonus stage with bonus capsules and a
    1UP; and, for every shipped stage with a `ground` entrance (`bonus-range`, `zone-g`), played
    from its start, no ground enemy of an earlier event standing when the window arms. Also
    `zones-fg-runtime.test.ts` (the gallery → GLIMMER CACHE through the scene flow from a
    practice start — the zone's clear, FACET MONARCH skipped —, the entrance shut when a turret
    survives, from checkpoint 0 and 1, and opened from the zone's start when every gallery turret
    is shot, tissue growing back but not into a ship, a claw's chain, lunge, pull and retract, the
    rush stacking and a restart rolling it back), `zones-fg-direct.test.ts` (the MANTA clears both,
    each plan in order), `behaviors-zones-fg.test.ts`, allocation guards
    `behaviors-squid-alloc` / `-facet-alloc` / `-chase-alloc`, `procedural-zones-fg.test.ts`.
  - **Goldens:** new `zone-f-god` (13,190 ticks), `zone-g-god` (14,043) and `glimmer-cache-god`
    (1,815, full loadout: the bonus capsules and the 1UP). **Re-blessed:** the new sprites and
    scripts shift the sorted sprite / script ids hashed through the pools; all 38 older files kept
    their inputs, tick counts, headers and outcomes (only hashes changed). The review fix (the
    turret moved to x 1,830) re-blessed `zone-g-god` again: the bot's inputs and the hashes
    changed, its 14,043 ticks and outcome did not.
  - Tests that pin shipped lists were updated: the music tracks (content test, `@shmup/shell` boot
    / loader tests), the enemy and boss behaviour rosters, the atlas's enemy sprite count (60), the
    zone tilesets of the terrain generator test, the golden file-name pattern. Zone G's map preview
    now reads "A RUSH OF CUBES THAT BUILD WALLS." (its cubes charge, they do not fall).
  - **Bundle:** the Tizen `app.js` is 320.3 KB gzip of its 350 KB budget (313.5 after M2-12).
  - **Test round:** `behaviors-zones-fg-edge.test.ts` (the three behaviours' defaults; the chasing
    cell's timeline — 50 ticks in, 150 chasing at 6 units, then straight on with its heading kept
    —, `speed` ≤ 0 → 1 px/tick, tick counts below 1 → one tick, `turnRate` floored and below 0 →
    no turn, the turn cap per tick, a dividing cell's halves flying out for the child's floored
    `scatterTicks`, a launched cell drifting in; the squid's cycle — open, sweep, guard, sweep, each
    hold one tick longer than its timer —, `curl` rounded, timers floored, the arms mirrored and
    every segment alike, a broken tentacle leaving the other's cycle as it was, floored spreads,
    needles from the standing tips, rings as the tentacles open turned half a gap, floored
    launches from the eye; the facet wave's turn points `2 × waveTicks` apart, `wave` rounded,
    floored needles from both tips, rings from the armoured core, detached lanes from the core one
    at a time, the shipped arms carried through the crystals breaking without a jump; tracking in
    the margins), `zones-fg-runtime-edge.test.ts` (every practice start of F and G in open space,
    the stage skips with every boss part in view, an Arcade restart in the tissue passage rolling
    the walls back before their `regen`, an Arcade restart in the prism gallery re-arming it afresh
    — all four turrets open it, three keep it shut —, a death in GLIMMER CACHE back to the gallery
    locked out, MANTLE REGENT's launches 200 ticks apart), `procedural-zones-fg-edge.test.ts`
    (kebab names, every frame visible and deterministic, square arm segments, ramps of their own,
    the registry, zone A's destructible tiles in the zone tilesets, seven distinct rims), the
    browser spec `zones-fg.spec.ts` (the cell wall and the crystal facets recoloured by their
    cycles over the folds and spires, MANTLE REGENT curling its tentacles, FACET MONARCH waving
    its arms, both bosses on the Tizen build) and five more goldens — `zone-f-arcade` (the 4-way
    bot at Arcade difficulty without god mode: no death, the clear), `zone-f-deaths` (the weaver on
    Easy under the Arcade penalty: restarts at the start and at 2,200 rolling the shot-open tissue
    back, game over), `zone-f-boss` / `zone-g-boss` (the stage skips, full loadout, Arcade
    penalty: all three phases) and `zone-g-bot` (the 4-way bot without god mode: a death in the
    cube rush, a respawn in place, the clear). No existing golden changed. **Fixed:** a
    `boss.squid` / `boss.facet` phase clamped the arms' curl to its own sweep, so a phase with a
    smaller sweep than the curl the last one left (or a squid phase after a facet wave had curled
    the arms away from the core's row) snapped the arms at its first turn point — a 50-unit jump
    in the test's squid, 67 in its facet; the arms now turn from wherever they are, however far
    (the shipped phases never exceeded their sweeps, so no golden changed). The `boss.facet` /
    `boss.squid` allocation guards now measure five windows: under the full suite's load their best
    of three came in at 66 KB of the 64 KB budget now and then (before this round's fix too).

### M2-14 — Final zones H & I, endings & credits

- **Goal:** two distinct finales, endings and credits — a complete game.
- **Depends on:** M2-13.
- **Deliverables:** **H — IRON CITADEL** (mechanical fortress: hatches, laser emitters, moving floors, "parade" of
  earlier bosses in reduced form, final boss with a real multi-phase finale) and **I — ABYSSAL THRONE** (raid on a
  whale-class battleship, then a boss-inside-boss finale). Ending scene(s): at least one per final zone plus a no-death
  variant (flags from M2-10); credits scroll (original text; lists placeholder-asset generators); ending/credits songs.
- **Acceptance:** as M2-11 plus: every route reaches an ending in the headless bot run; ending selection tests.
- **Refs:** `shmup_feat.md` §14, §13 (final boss, raids), §15 (multiple endings), §17 (ending, credits).
- **As built:**
  - **Zone H — IRON CITADEL** (`content/stages/zone-h.stage.json`, 9,600 px, `terrain-citadel`,
    camera keys `0.8 → 0.7 → 0.6 → 1.3 → 0.75`): the outer walls (`bolt-drone` streams,
    `rail-turret`s, `hatch-bay`s on the floor and ceiling releasing `hatch-mite`s, a
    `sentinel-walker`), the **piston hall** (checkpoint 2,200: eleven moving floors and ceilings —
    `block` events of the tileset's `solid` tile swinging ±22 px out of the plating, M2-07's moving
    blocks — and `laser-emitter`s on the floor and ceiling), the **parade hangar** (checkpoint
    4,400: open space at 0.6 px/tick where four earlier bosses come back in reduced form, one after
    another on `boss` events — BULWARK / MAW / BASTION / REGENT ECHO, captains with a 960-tick time
    limit that reuse the originals' sprites and behaviours with fewer parts: the plan's "parade"
    as M2-09 captains, since a `bossRush` stage cannot hold a normal zone's timeline), the core run
    (checkpoint 6,800, 1.3 px/tick), the calm, then **IRON SOVEREIGN** (IS-08) — the finale: four
    phases of the new `boss.sovereign` (the core `afterParts` of two plates with lanes from its
    emitters; a shield wheel of four armoured pods on a hub turning round the core, rings; the wheel
    reversing, 5-ways and drones — its `minion` — from the emitters; the overdrive's turning
    three-arm spiral). The wheel's hub starts turned 45° (`angle` 128): at rest a pod sat in the
    core's lane and the bot's first build spent 252 s on the plates behind it.
  - **Zone I — ABYSSAL THRONE** (`zone-i.stage.json`, 9,600 px, `terrain-abyss`): the descent
    (`lumen-mote` streams, `gulper`s — `pattern.loop` + the new DSL pattern `abyss.gulp` on a
    `waypoint` hover —, `depth-mine`s, `abyss-turret`s), the **trench** (checkpoint 2,200: floor
    and ceiling, `trench-eel`s — `worm.burst` formations — bursting out of the floor), the **mine
    field** (checkpoint 4,400: open water), the undertow (checkpoint 6,800, 1.3 px/tick — no eels
    there: at that speed the bot met a rising eel), the calm, then the **ABYSS ARK** (AA-09), a
    whale-class raid (M2-09's raid: four hull sections, two turret rows of three with heading
    frames, the heart — its core —, hooks: its `minion`, a `rocket.homing` harpoon; the new
    `boss.ark`) whose final blast reveals **THE HOLLOW KING** (HK-10, its `inner` boss — the new
    `boss.angler`: an anglerfish whose `whenOpen` mouth opens with its jaws, a lure of chained
    circle beads ending in a gun swaying in front of it). The ARK leaves after 90 s of fight (its
    `timeLimit`): the run flag `bossEscaped` → *THE FLAGSHIP SLIPS AWAY*. Open water from the calm
    on (the raid's camera pans ±12 px vertically and 80 px along the hull; it keeps the turrets
    clear of the ship's column — point-blank turrets killed the bot twice in the first build).
  - **Engine additions** (both small, both hashed): **`ScriptApi.sleepUntilNear(range)`** (core
    `enemies`: the proximity test runs in the enemy system's movement phase and wakes the script
    once — `Enemy.nearRange`; the first `mine.burst` polled every 6 ticks like `tentacle.grab` and
    four waiting mines allocated 294 KB per 10,000 ticks in its guard) and **`BossScriptApi.spiral`**
    (core `bosses`: a boss's spiral stream — `Boss.spiral*` — fired by the boss system in
    `runScript`; a spiral volley every 10 ticks woke the coroutine that often and each wake costs
    ≈ 80 bytes). New behaviours: `emitter.laser`, `mine.burst`, `boss.sovereign`, `boss.ark`,
    `boss.angler`; `core/behaviors` is `implemented` now.
  - **Endings and credits.** The `campaign` kind grew `endings[].scene` (`ENDING_SCENES`: `none` |
    `citadel` | `abyss`), `endings[].text` (≤ 8 lines of ≤ 40 characters) and `credits` (≤ 24
    sections of a title and ≤ 16 lines of ≤ 60 characters; `creditsLineCount`); stages grew the
    optional `music.ending` / `music.credits` cues, which `@shmup/audio-web` `stageMusicCues` adds to
    the prepared set (one set resident — the ending and credits themes must be resident when the
    final zone clears, so the final zones name them). `EndingScene` plays the ending's sprite scene
    (drawn into the UI list from the new `ui/ending-*` UI sprites and the run's ship: the citadel
    breaking apart in chained blasts while the ship flies away; the ship rising out of the deep
    while the ARK sinks — or sails off after an escape; a dawn sun for a flawless run) and the
    epilogue line by line (`ENDING_LINE_TICKS` 90; OK shows them all), then the result card, then
    the new **`CreditsScene`** (id `credits`: the rows scroll up 1 px every 2 ticks through 24
    string slots, hold, title; OK / Back skip after 60 ticks). The final stage's cues play (`Ending`
    / `Credits`); a stage without them keeps the music playing. The UI list has 256 string slots
    (224). The shipped endings: H *THE CITADEL FALLS SILENT* (`noDeath`) / *THE CITADEL FALLS*; I
    *THE DEEP IS STILL* (`noDeath`, not `bossEscaped`: its epilogue sinks the King with the ARK) /
    *THE FLAGSHIP SLIPS AWAY* (`bossEscaped`) / *THE THRONE IS BROKEN*, each with its scene and a
    five- or six-line epilogue; the credits (12 sections) list the zones, the bosses, the engine
    packages and every placeholder-asset generator of `scripts/assets/procedural/` (the content
    test checks the generator list against `PROCEDURAL_GENERATORS`).
  - **Art as code:** `scripts/assets/procedural/citadel.mjs` (14 sprites; the wall's running lights
    in `CITADEL_RAMP`, cycled), `abyss.mjs` (19; the murk's specks in `ABYSS_RAMP`, cycled; the ARK
    turret's 16 heading frames) and `ending.mjs` (6 UI sprites, core `UI_SPRITES` /
    `UiSprites.ending*`); `TERRAIN_PALETTES` `tiles/terrain-citadel` / `-abyss` with their tileset
    files. **Songs:** `zone-h` (IRON CITADEL), `boss-h` (SOVEREIGN OF STEEL, cue `FinalBoss`),
    `zone-i` (ABYSSAL THRONE), `boss-i` (THE HOLLOW KING, `FinalBoss`), `ending` (AFTER THE LAST
    WAVE, `Ending`), `credits` (THANK YOU, PILOT, `Credits`) — the final zones use `FinalBoss`
    (`stages`-scoped), not `Boss`. **Direct-mode item plans** (26 entries) in both stages.
  - **Playtests:** `test/playtest/zone-h.test.ts` / `zone-i.test.ts` (god mode, 3–6 min: H
    252.9 s — IRON SOVEREIGN 42.8 s, all four phases, the four echoes fought, the pistons swinging,
    emitter lanes, mites —; I 270.9 s — the raid followed, both ARK phases, the king's three, mines
    armed, eels risen; without god mode both clear with no death) and `zone-hi-recovery.test.ts`
    (all eight checkpoints). The 16 route playtests now end in the real finales (H 239 s, I 248 s
    with the carried loadout) and check that every ending reached has its scene and epilogue;
    `campaign-flow.test.ts` drives A-C-E-G-I through the ending, the card and the credits to the
    title.
  - **Tests** added: the content block "zones H and I" (the table checks of M2-11 with the
    `FinalBoss` / `Ending` / `Credits` cues; H's hatches, emitters, pistons, the parade — every
    echo's sprites an earlier boss's, fewer parts, a time limit, spaced — and the finale's parts;
    I's mines, eels, the raid, the open water, the king; speeds; recovery; rock; the fights under
    the 4-way rules — zone I's with the full loadout: a bare ship cannot beat the ARK's time
    limit —; sprites; the ending selection under all 16 flag masks; the credits);
    `behaviors-zones-hi.test.ts`, allocation guards `behaviors-mine-emitter-alloc`,
    `-sovereign-alloc`, `-ark-alloc`, `-angler-alloc`, `scenes-ending.test.ts`,
    `scenes-ending-alloc.test.ts`, `data/campaign-ending.test.ts`, `procedural-zones-hi.test.ts`,
    the audio loader's final-zone music set. The heavy boss guards (M2-13's facet / squid too) now
    allow the bytes of their coroutine's wakes (`WakeCount`, `SCRIPT_WAKE_BYTES` 96 in
    `test/helpers/alloc.ts`) on top of 64 KB — the facet guard failed the full suite once more at
    66,648 bytes during this step.
  - **Goldens:** new `zone-h-god` (15,174 ticks) and `zone-i-god` (16,256); **re-blessed:** the new
    sprites, UI sprites and scripts shift the sorted sprite / script ids and the hash gained the
    enemies' `nearRange` and the bosses' spiral fields; all 49 older files kept their inputs, tick
    counts, headers and outcomes (only hashes changed).
  - Tests that pin shipped lists were updated: the music tracks (content test, `@shmup/shell` boot
    / loader tests), the behaviour and boss behaviour rosters (and `behaviors` `implemented`), the
    UI sprites, the atlas's enemy sprite count (72), the zone tilesets, the golden file-name
    pattern; `test/e2e/campaign-run.spec.ts` walks the ending, the card and the credits.
  - **Bundle:** the Tizen `app.js` is 331.5 KB gzip of its 350 KB budget (320.3 after M2-13).
  - **Gotcha:** the debug stage skip (`?skip=boss`, `stageSkip: 'boss'`) jumps before the first
    `warning` **or `boss`** event — in zone H that is the parade's first echo (as zone B's skip
    lands before its captain), so a skipped zone H still flies the parade and the core run.

### M2-15 — Front-end screens & attract mode

- **Goal:** the complete arcade front end.
- **Depends on:** M2-14.
- **Fills:** core `scenes` (`→ implemented`), `ui` (`+ name entry`), `replay` (attract playback).
- **Deliverables:** attract loop (original story crawl over sprite scenes ⇄ title ⇄ demo play from bundled replays
  recorded by the bot per zone ⇄ hi-score table; any input → title); mode select (1P / 2P / PRACTICE / OPTIONS / SOUND
  TEST / EXIT on Tizen); name entry (D-pad letter picker: Up/Down letter, Right/OK next, Left back, END); hi-score tables
  per difficulty × ship × mode (10 entries: name, score, zone reached); continue countdown polish; sound test (music and
  SFX lists); practice select (zone, checkpoint, loadout; separate score table).
- **Acceptance:** attract cycle timing, demo replays play without desync, name entry with 4-way input only, table
  insertion/sorting, practice isolation, e2e run through the attract loop.
- **Refs:** `shmup_feat.md` §16 (attract, practice), §17 (screens), §15 (hi-score table), §21 (sound test).
- **As built:**
  - **Mode select = the title's menu** (no separate scene): 1 PLAYER / 2 PLAYERS / PRACTICE /
    OPTIONS / SOUND TEST / EXIT (EXIT only with `platform.exit` — the TV). `TitleItem` is
    `Start` 0, `TwoPlayers` 1, `Practice` 2, `Options` **3**, `SoundTest` 4, `Exit` **5**; every
    test and e2e spec that walked to OPTIONS presses Down once more. PRACTICE is disabled without a
    campaign. `core/scenes` is `implemented`; the skeleton's placeholder scene ids `attract` /
    `select` became `demo`, `story`, `practice`, `soundTest` (plus `nameEntry`, `hiScore`).
  - **Attract loop:** title (`PRESS OK` idle `TITLE_ATTRACT_TICKS` 720 — any press or held key
    resets it; the open menu never idles out) → `DemoScene` → `HiScoreScene` (attract: the chosen
    ship / difficulty's 1P table first, then every other table with rows, ≤ 4 pages of
    `HI_SCORE_PAGE_TICKS` 300) → `StoryScene` → title; any input on those three → title (Back too —
    never the exit dialog). Without demos the loop starts at the tables, without a story the tables
    return to the title. The title theme plays through the tables and the story.
  - **Demos are content:** new `core/data` kind `replay` (`content/demos/<id>.replay.json` —
    folder README + `example.replay.json`, `ContentDb.demos` / `demoIndex`, `DemoSpec`,
    `MAX_DEMO_TICKS` 18,000): an `encodeReplay` document plus the content header, `id` and
    `description`; the loader checks the structure and the recorded stage (`unknown stage id`), the
    flow decodes them once (`SceneFlow.demos`; a broken one is left out). Nine demos, one per zone,
    recorded by `test/golden/demos.ts` — the 4-way bot with god mode, 2,400 ticks (40 s) from the
    zone's start, three zones in the MANTA — with the build id `DEMO_BUILD_ID` (`demo`);
    `test/golden/demos.test.ts` plays each back through the attract path (and the golden path) with
    every hash, and **`pnpm golden:update` re-records them with the golden replays** (they are
    locked by hashes like goldens; Prettier skips them). ≈ 1.7 KB each.
  - **Attract playback (`core/replay`):** the module was split — `replay/format.ts` (header,
    recorder, playback, file format; no `core/game` import, so `core/scenes` can use it without a
    cycle) and `replay/demo.ts` (`DemoPlayback`, `createDemoPlayback(replay, content, { events })`:
    the header's World like `createReplayGame` — config re-resolved over the content's difficulty
    table, god mode from `assisted` in the World's own `DebugFlags`, the start checkpoint — stepped
    by `step()` with `createPlayback`; a desync or the recording's end stops it). `index.ts`
    re-exports everything. The `DemoScene` gives the World a private queue and forwards what the
    screen shows (particles, shake, flash, dim, popups — `DEMO_SILENT_KINDS` drops Sfx, Music,
    ducking, rumble, host requests): **the demo is silent** (the music fades out), shows its own HUD,
    `DEMO PLAY` / `PRESS OK` blinking and the zone card; the World is dropped when the scene leaves.
  - **Story crawl** is campaign content: `campaign.story` (≤ 8 pages: `scene` of `STORY_SCENES`
    none / dawn / invasion / launch, ≤ 6 lines of ≤ 40 characters; `CampaignStoryPage`). The rows
    rise 1 px every `STORY_SCROLL_TICKS` (4) through a panel under the scene (10 string slots taken
    by row number); a page's scene takes over when its first row is half-way up the panel; the
    panel goes after the last row, `STORY_HOLD_TICKS` 90. The scenes reuse existing sprites (the
    ending pieces, the ships, the logo) — **no new art**. The shipped story: three pages of
    original text (the Verge worlds, the Iron Tide, KESTREL and MANTA).
  - **Hi-score tables per difficulty × ship × mode:** `core/save` `hiScoreModeKey(config, mode)` —
    `<powerUpMode>-<difficulty>` for 1P (unchanged keys, no save migration), `-2p` for co-op,
    `-practice` for practice (`HI_SCORE_MODES`, `HiScoreMode`, `parseHiScoreModeKey`); the
    "ship" dimension is the power-up model (one ship per model in the content), named after the
    content's ship on screen (`KESTREL  NORMAL  1 PLAYER`). Co-op rows that older builds kept in
    the 1P tables move into their `-2p` table when a save is read (`sanitizeSave`; no version bump
    — M2-16 owns save v2). `SceneFlow.modeKey` names the co-op table for a co-op game; co-op and
    practice Worlds play against their own table's best and never raise the (1P) session
    hi-score. The zone column shows the campaign label of the stage reached (`-` otherwise).
  - **Name entry:** `core/ui` `NameEntry` / `createNameEntry` / `nameEntryTick` / `drawNameEntry`
    (`NAME_ENTRY_GLYPHS` A–Z 0–9 . - ! space, `NAME_ENTRY_LENGTH` 3): Up / Down the letter
    (held-duration repeat), Right / OK next, Left / Back back, OK on the `END` field finishes; the
    first letter starts on `A`, empty letters (`_`) are left out (`A`, OK ×4 = "A"; a blank name
    is `---`). `recordRun` still inserts the rows as `---` at the game's end (the save is written
    then) and keeps them as pending (`PendingName`, by object identity — player 2's row may move
    player 1's); `finishGame()` (replacing `toTitle()` after a game over, the stage clear's `TO BE
    CONTINUED`, a practice clear, an ending without credits and the credits) opens the
    `NameEntryScene` for each row still in its table (both players of a co-op game, in turn;
    `NAME_ENTRY_TIMEOUT_TICKS` 1,800 takes the name as it stands), names it
    (`SaveStore.renameScore`), writes the save and shows the table with the new rows blinking
    (`HI_SCORE_RESULT_TICKS` 900, OK / Back after `HI_SCORE_LOCK_TICKS` 30) → title. Every flow
    test and e2e spec that went from an end screen to the title passes the name entry now.
  - **Practice select** (`PracticeScene`, overlay): ZONE (`A AZURE VERGE` …), CHECKPOINT (`START`,
    `CHECKPOINT n` for the zone's checkpoints after x 0, wrapping within the zone's both ways — Left
    on `START` goes to the zone's last), LOADOUT
    (`PRACTICE_LOADOUTS` default / full — `STANDARD` / `FULL POWER`), START → the difficulty menu,
    ship and weapon select as a normal start; their last OK is `FlowControl.launchGame()` (it
    replaced the three `stack.reset(game)` calls), which starts the practice run
    (`SceneFlow.startPractice(zone, checkpoint, loadout)` — `RunState.loadout`, `runWorldConfig`
    applies it). Practice records into its table with the name entry, counts no game over /
    stage clear, and returns to the title.
  - **Sound test** (`SoundTestScene`, overlay): MUSIC (the host's titles — new
    `SceneFlowHost.soundTest` / `GameOptions.soundTest` `SoundTestSetup { music }`; disabled
    without), SFX (`SFX_TEST_LABELS`, every `SFX_CUES` cue in words), STOP, BACK. **OK plays**
    (MUSIC: new `SimEventKind.SoundTest` 16, id = the library index; SFX: an `Sfx` event at the
    playfield's centre, x = `PLAYFIELD_W / 2`, so a positional cue plays centred) — the
    scene masks OK from `menuTick` so it does not step the choice; BACK / Back bring the title
    theme back. Audio: new `AudioEngine.playTrack(index, fade)` (loads a non-resident track — a
    menu, never a stage — keeps it as the one extra track, releasing other tracks outside the
    prepared set; restarts a playing one); shell: `connectSoundTest` and the boot hands the music
    library's titles to the flow.
  - **Continue countdown polish:** a draining time bar (the last three seconds red, the digit
    flashing), the score, and — once OK counts — a blinking `PRESS OK` and `BACK: GIVE UP`.
  - UI string slots 256 → **384** (the name entry, the table's 30 row slots, the story, the new
    menus). The Tizen `app.js` is **343.8 KB gzip of its 350 KB budget** (331.5 after M2-14 —
    ~9 KB of scene code, ~3 KB of demos).
  - **Tests:** core `ui-name-entry` (4-way only, repeat, lock, trimming, drawing),
    `save-hiscore-modes` (keys, parsing, insertion / sorting, renaming by identity, the co-op rows'
    move), `replay-demo`, `data-demos` (the kind, the story), `scenes-attract` (the cycle's exact
    timings, the demo in sync with the bare replay, silence, any input → title, idle reset, missing
    demos / story, the tables' pages, the story's pages), `scenes-front-end` (name entry with the
    four directions, timeout, no entry, co-op names in the `-2p` table, the practice select and
    its isolation, the sound test's events, the continue polish), the `scenes-attract-alloc`
    guard (demo play, table paging, story, name entry); audio-web `engine-sound-test`; shell
    `dispatch-sound-test` and a boot test; integration `attract-flow` (all nine demos through the
    flow in sync, then the tables and the story), `test/golden/demos.test.ts`; e2e
    `attract.spec.ts` (web: the loop's timings under frame advance, zone A then zone B's demo, a key
    → title; Tizen from disk: the demo and the remote's OK). `campaign-flow.test.ts` enters "ACE"
    with the four directions after the credits.
  - **Gotcha (allocation guards):** a long replay-*recording* session in the same worker left V8
    feedback that made any World allocate ~12 bytes a tick afterwards (a plain game's World does
    not) — the demo guard therefore plays a synthetic weaving recording (no periodic hash) instead
    of recording one; the shipped game never records.

### M2-16 — Options, rebinding & accessibility

- **Goal:** every P1 option, per-device rebinding and the accessibility set.
- **Depends on:** M2-15.
- **Fills:** input-web `rebind` (`→ implemented`), core `ui` (`+ rebind widget`), `save` (v2 migration), `config`.
- **Deliverables:** Controls (rebind per device and context with capture prompt, conflict detection and reset; autofire
  mode always/toggle/hold and rate; SOCD; remote profile + advanced debounce slider; input test screen), Display (scale
  mode, shake, flash reduction, hitbox, colour-blind palette), Game (difficulty, lives 1–5, death penalty, auto
  power-up, pickup magnet), one-button preset (autofire + auto power-up + casual); all UI strings moved to
  `content/strings/en.json` (string-table infrastructure for M3 localization); save v2 with migration from v1.
- **Acceptance:** capture/conflict/reset tests, profile overrides persisted and applied, v1 → v2 migration, every option
  reaches its consumer (sim config or presentation), strings table covers every UI label.
- **Refs:** `shmup_feat.md` §4 (rebinding, SOCD, autofire), §21 (options, accessibility).
- **As built:**
  - **Options screen regrouped.** Root: MASTER / MUSIC / SFX sliders, then the pages CONTROLS / DISPLAY / GAME, BACK
    (`OptionsItem` Master 0 … Controls 3, Display 4, Game 5, Back 6). The M1-17 profile row moved to the CONTROLS page,
    the M2-02 / M2-08 / M2-09 display rows to the DISPLAY page (`DisplayItem`); every test and e2e spec that navigated
    the old flat screen was updated. Each page is an overlay scene (`controls`, `display`, `gameOptions`, plus `rebind`
    and `inputTest`) that stores its group into the save when it closes; the root stores the volumes.
  - **CONTROLS page** (`ControlsScene`, `ControlsItem`): PROFILE (live, as before), AUTOFIRE `ALWAYS / TOGGLE / HOLD`,
    RATE (`AUTOFIRE_INTERVALS` 8 … 2 ticks, shown as shots a second), SOCD `PROFILE / NEUTRAL / LAST WINS`, DEBOUNCE
    `AUTO / 0 … 10 TICKS` (the "advanced debounce slider" is a choice with the profile's value first), REBIND KEYS,
    REBIND PAD, INPUT TEST, BACK. AUTOFIRE is disabled on a remote-mode host (the TV: the remote has no fire button).
    SOCD / DEBOUNCE are stored at once and pushed as the new `UserOptionKind.InputSettings` (10); the host re-applies
    the save's `options.input`.
  - **Autofire modes are sim config.** `GameConfig.autofireMode` (`AUTOFIRE_MODES`, default `always`) joins the existing
    `autofire` boolean (kept — `false` still means hold-to-fire, so the many tests using it stay valid) and
    `autofireInterval` (the rate). `toggle` flips a per-player `WeaponSystem.firing` switch on each Shot press (on at the
    start; Sub held still fires missiles), hashed **only in the toggle mode**, so every golden replay's hashes are
    unchanged. `remoteMode` still forces always. Replay headers record the mode (format unchanged: a missing key is the
    default).
  - **GAME page** (`GameOptionsScene`, `GameOptionsItem`): DIFFICULTY, LIVES `PRESET / 1–5`, PENALTY `PRESET / ARCADE /
    CLASSIC / CASUAL`, AUTO POWER, MAGNET, ONE BUTTON. They are sim-affecting, so they live in the save's new
    `options.game` (`UserGameOptions`, `null` = the host config's / the preset's) and the flow folds them — with the
    controls' autofire mode and rate — into every difficulty's config (`core/config` `userGameOverrides` /
    `withUserGameOptions`, applied in the flow's `rearm`: the next game or a RETRY STAGE, never the World in play — a
    replay header records the result). A run keeps the config it began with (`FlowControl.runConfig`, taken by
    `beginRun` / a practice start) for its next zones and bonus stages; RETRY STAGE re-takes it at the run's own
    difficulty (`rearmRun`), and over the pause menu the GAME page's DIFFICULTY row is disabled, so a run is always
    recorded in the table of the difficulty it started on (review round 1). The difficulty menu previews the armed
    configs (`FlowControl.armedConfigs`: LIVES as the game gets it). The one-button preset forces autofire always,
    Auto Power-Up and the casual penalty (their rows are disabled while it is on). The difficulty menu's choice is
    remembered in the save
    (`options.game.difficulty` — M2-01's "saved with the options of M2-16"); the weapon select's loadout and the ship
    choice stay session-only (not listed in this step's deliverables).
  - **Rebinding.** Overrides are stored per profile and context as `core/config` `BindingOverrides` (action → its whole
    key set as binding tokens `code:<code>` / `key:<keyCode>` / `button:<index>`, `BINDING_TOKEN_PATTERN`; ≤ 16
    profiles, ≤ 4 tokens an action, read defensively by `resolveBindingOverrides`). The logic lives in
    `@shmup/input-web` `rebind` (→ implemented): `rebindAction` (conflict detection: a key another action has is
    **moved**, or the two **swap** keys when the other had only that one; **refused** when a required action would end
    up keyless; **rejected** for a key the device cannot hold or a reserved one), `resetBindings`, `applyBindingOverride`
    / `customizeInputProfile` (with SOCD and debounce; an override that would leave a required action unbound keeps the
    content's table — never a lock-out), `findBindingConflicts`, `captureToken`, `bindingTokenLabel` /
    `bindingKeysLabel` (key names in the bitmap font). Escape and the remote's Back (`RESERVED_BINDING_TOKENS`) cancel a
    capture and never move. Capture: `WebInput.beginCapture('keys' | 'buttons')` / `capture` / `endCapture` (a
    `KeyCapture` in the keyboard source catches the next *new* key — a remote's fake keyup/keydown pair does not count —
    and `poll()` catches the lowest newly pressed pad button). Devices = the key profile in use and the gamepad profile
    ("each gamepad" = the one gamepad profile every pad uses; the split keyboard's player-2 half is not rebindable).
    Review round 2: `captureToken(profile, captured, context, override)` names a key the way the profile binds it
    (`code:` when the context gives the code an action or the profile binds by code at all — `keyboard-remote-emulation`
    is a `remote` profile binding `byCode` — else `key:`), so the conflict detection finds the holder and a new binding
    is never hidden by an old `code:` entry; `rebindAction` also treats `code:<code>` and the `key:<keyCode>` that key
    sends as one key, and `applyBindingOverride` / `actionTokens` count a `key:` entry hidden by a `code:` entry with
    actions as no key. On a split keyboard a key player 2's half binds in the context is `Rejected` for player 1 (and
    skipped in a hand-edited override) — one key never drives both players, as `checkSplit` demands of the content.
  - **Core rebind widget** (`core/ui`: `RebindPanel`, `rebindTick`, `drawRebindPanel`, `RebindEvent`, `RebindStatus`,
    `CaptureStatus`, `REBINDABLE_ACTIONS`, `REBIND_CAPTURE_TICKS` 300): MODE (GAME / MENU), one row per action with its
    keys, RESET, DONE, the capture prompt with a draining bar and a message line. `RebindScene` drives it through the new
    `SceneFlowHost.controls` (`ControlsSetup`: devices, key labels, capture, bind, reset — `GameOptions.controls`), which
    `@shmup/shell`'s new module `controls` (`createShellControls`) implements over the app's profiles and the adapter;
    the apps gained `ShellInputProfiles.customize` / `rebindable` (they keep the profiles as written and apply them
    customised). After a capture the rows wait for a release (≤ 60 ticks), so the captured key never acts on the menu.
  - **Input test** (`InputTestScene`): the gameplay binding context, every game action lit while held (and 8 ticks
    after a press), the device, **hold Pause 1 s** to leave (every other key does what it does in a game).
  - **Save v2.** `SAVE_VERSION` 2 (the storage key stays `save.v1` — the format family's). The 1 → 2 migration adds the
    controls fields and `options.game` unset and **moves the co-op / practice rows** older builds kept in one-player
    tables (the move `sanitizeSave` did on every read since M2-15 — the sanitiser no longer does it). Fixture
    `test/save/fixtures/save-v1.json`.
  - **String table.** The file is `content/strings/en.strings.json` (the content naming rule `<name>.<kind>.json`), new
    core kind `strings` (`ContentDb.uiStrings`, `UiStringsSpec`: known ids only, the bitmap font's glyphs only, 1–48
    characters, one table per language). `core/ui/strings.ts` holds the built-in English `DEFAULT_UI_TEXT` (290 ids,
    `sfx.<Cue>` names generated from `SFX_CUE_NAMES`), `resolveUiText` (a content table over English), `formatUiText`
    (`{0}` / `{1}`). Every scene and the UI kit / HUD draw from `SceneFlow.text` (the content's `en` table) — builders
    take an optional table, `createHud(sprites, text)` — and the label lists come from `buildSceneLabels`; the exported
    English label constants stay (derived from the table). `pnpm content:check` keeps `en.strings.json` equal to the
    built-in table and a source scan (`core/test/ui/ui-strings.test.ts`) fails on any upper-case literal in the scenes /
    UI kit outside it. The shell's DOM loading / error screens (before the game exists) are not in the table.
  - **Budgets.** UI string slots 384 → 512. The Tizen `app.js` grew to ≈ 358 KB gzip (the two string tables ≈ 6 KB,
    the pages / rebinding ≈ 9 KB): `APP_JS_GZIP_BUDGET` 350 → **384 KB** (M2-18's boot-time check still guards launch).
    `drawRebindPanel` reads precomputed slot counts: `for … of` over arrays allocated iterator objects on every redraw
    (the allocation guard caught ~600 bytes a redraw).
  - **Goldens re-blessed** (`pnpm golden:update`): only the replay headers changed — every file gained
    `"autofireMode": "always"`; every hash, tick count and outcome is identical (the simulation is unchanged).
  - **Tests.** Core: `config-game-options`, `save-v2` (+ updated save tests), `weapons-autofire-modes`, `data-strings`,
    `ui-strings` (table, coverage scan, a flow on a content table), `scenes-controls` (CONTROLS / GAME pages, the
    rebind screen over a fake host, the input test), `scenes-options-pages-alloc` and `scenes-input-test-alloc`
    guards, the regrouped `scenes-options*` suites. input-web: `rebind-rebinding` (capture tokens, bind / move / swap /
    refuse / reject, reset, customise, conflicts, labels). Shell: `controls` (a real `WebInput` capture → bind → save →
    applied), boot wiring. Integration: the en table equals the built-in one. E2E: `rebind.spec.ts` (web: SHOT → J,
    saved, the input test, applied after a reload; Tizen from disk: POWER-UP ↔ CH− swap kept across a relaunch) and
    the updated options / display-options / bullet-palette specs.

### M2-17 — Platform polish: Electron, Tizen extras, storage

- **Goal:** first-class desktop build and TV-specific extras.
- **Depends on:** M2-16.
- **Fills:** apps/electron `saves.ts` (`FileStore`), apps/tizen `device-info`, `live-reload` (`→ implemented`).
- **Deliverables:** Electron: fullscreen toggle, window/scale settings, file saves via IPC (JSON in `userData`, atomic
  write + backup), gamepad, 120/144 Hz accumulator + interpolation, packaging config (not built in CI). Tizen: gamepad
  metadata and an opt-in `use.game.mode` metadata variant of `config.xml` (A/B latency test on device),
  `device-info` (model/firmware via `webapis.productinfo` when present → debug overlay), dev live-reload (WebSocket
  notify from a Node dev server → app reloads; `tizen:watch` script, never run in CI), texture/atlas unloading between
  zones to stay < 100 MB. Storage quota checks and debug save export/import.
- **Acceptance:** FileStore unit tests (temp dir), IPC contract tests, config.xml variants validated, device-info and
  live-reload tests with fakes, memory estimator test (atlas + audio budget per zone).
- **Manual:** §8.5 on-device checks for game-mode metadata and memory.
- **Refs:** `shmup_feat.md` §23 (Tizen, Electron), §24 (live reload to TV); `shmup_tech.md` §2.3, §2.5, §4.8.
- **As built:**
  - **Electron file saves.** `main/saves.ts` `createFileStore(dir)`: `<userData>/saves/<key>.json`, write = temp file
    + `fsync` + copy of the current file to `<key>.json.bak` + rename (never half-written), writes per key serialised;
    a missing or non-JSON file falls back to its backup; keys checked by `shared/ipc` `isStorageKey` (one plain file
    name); quota 1 MiB a value, 8 MiB the folder after the write (`StorageQuotaError`). The placeholder's `FileStore`
    gained `directory` and `usage()`. IPC: `shmup:storage-get` / `shmup:storage-set` (`ipcMain.handle` ↔
    `ipcRenderer.invoke`) in the new `main/ipc-handlers.ts`, which also refuses any sender that is not the game's page
    (`app://game/…`, or `SHMUP_DEV_URL`'s origin) — quit included; the window blocks navigation away and pop-ups.
  - **Web build in Electron.** `apps/web` detects the preload's bridge (`getElectronBridge`): platform id
    `'electron'`, storage through the bridge (`createBridgeStorage` — a failing read resolves from memory, a failing
    write rejects so the save store retries), `exit` = quit (the title offers EXIT), audio unlocked at boot
    (`autoplayPolicy: 'no-user-gesture-required'` in the window options). `ElectronBridge` repeats the preload's API; a
    web test runs the real compiled preload against it.
  - **Window / scale / fullscreen** (`main/window-state.ts`): remembered in `window.json` through the same store —
    fullscreen, the scale of the 384×216 frame (×1 … ×10, lowered to fit the work area; `useContentSize`), the
    position (kept only while on a screen; saved 400 ms after the last `move` and on `close` — Electron emits `moved`
    on macOS / Windows only —, the app waiting for that write in `will-quit`). Shortcuts in the main process (`before-input-event`): F11 / Alt+Enter
    fullscreen, Ctrl+= / Ctrl+- / Ctrl+0 scale (Cmd on macOS). No in-game Options entry (that would be core UI work
    outside this step; the game's own SCALE option still picks integer / fit / stretch inside the window).
  - **Gamepad and 120 / 144 Hz** needed no Electron code: the web build's Gamepad API adapter and the shell's fixed
    60 Hz step with its accumulator and render interpolation (M2-08, `createRefreshMonitor`) run in the renderer as
    they are; `backgroundThrottling: false` stays.
  - **Packaging config** `apps/electron/electron-builder.json` + `pnpm --filter @shmup/electron package` =
    `pnpm dlx electron-builder@26.15.3 … --publish never` — electron-builder is not a dependency (the step names none);
    `electronVersion` is pinned in the config (electron-builder cannot read the `catalog:` specifier; a test keeps its
    major equal to the catalog's); output `release/` is git-, Prettier- and ESLint-ignored. No icons yet (M2-18's icon
    set).
  - **Tizen config.xml variants** (`scripts/config-xml.mjs`): `public/config.xml` stays the default (no metadata) and
    gained the `http://developer.samsung.com/privilege/productinfo` privilege (Samsung's ProductInfo API needs it).
    The Vite plugin `configXmlVariant()` rewrites the copied `dist/config.xml`: `build:game-mode` (`--mode game-mode`,
    a release build) or `TIZEN_GAME_MODE=1` add `use.game.mode`; **gamepad metadata** is opt-in only
    (`TIZEN_GAMEPADS=dualshock4::usbgamepad`) — Samsung's `http://samsung.com/tv/metadata/gamepad` makes the TV check
    at launch for the named pads and show a popup when none is connected, which a remote-first game must not ship.
    `check-bundle.mjs` validates whatever variant was built (`validateConfigXml`: well-formed tags, widget parts,
    privileges, known metadata once each); its test fixtures now use the real `config.xml`.
  - **device-info** (implemented): pure `collectDeviceInfo` + `formatDeviceLine`, `loadWebapis` (adds the
    `$WEBAPIS/webapis/webapis.js` script only when `window.tizen` exists, once, 3 s timeout, never rejects);
    `DeviceInfo` gained `modelCode`. It reaches the **debug overlay** as a sixth panel line: render-pixi
    `setDebugPanelDevice` / `DebugOverlay.setDevice` (printable ASCII, ≤ 56 characters; `setDevice`, called every
    frame, compares its input first and allocates nothing while it stays the same), the shell's
    `DebugToolsOptions.device`; `tizenDebugTools(win, buildId, canvas?)` collects the facts when the remote unlock
    opens the tools (release and locked builds never load `webapis.js`) and logs the snapshot for the inspector.
  - **live-reload** (implemented): `connectLiveReload({ url }, window)` — `main.ts` calls it only under `__SHMUP_DEV__`
    with a non-empty `__SHMUP_LIVE_RELOAD__` (new define, `liveReloadDefine()` in the Tizen Vite config: the
    `SHMUP_LIVE_RELOAD_URL` of dev builds, `''` otherwise), so release bundles fold it away. `scripts/tizen-watch.mjs`
    (`tizen:watch`, never in CI): Vite build `--watch` in development mode + a Node HTTP server for `dist/` + a
    hand-written RFC 6455 WebSocket on the same port (no dependency); after each build it sends `{type:'reload', url}`.
    A page the server serves reloads in place; the installed widget navigates to the served `index.html`, so the TV
    runs new builds without repackaging — whether the Tizen runtime keeps the widget's APIs on that page is part of
    the manual §8.5 check. The placeholder's `'hot-data'` mode was dropped.
  - **Storage quota checks.** New shell module `storage`: `createWebStorage` replaces the two duplicated
    `localStorage` adapters of `apps/web` / `apps/tizen` — the app's own budget (1 MiB for all keys, 256 KiB a value,
    counted as UTF-16), a `QuotaExceededError` drops `save.corrupt` and retries once, a value that still does not fit
    stays in memory for the session (the backend stays in use — before, any error switched to memory for good; other
    errors still do), `usage()` / `issues`. **Debug save export / import**: `window.__shmupDebug.save`
    (`DebugSaveApi`: `export()`, `import(text)` — parsed like a stored save, written; reload to apply its options —,
    `usage()`), built on `exportSaveText` / `importSaveText` and the new core `SaveStore.replace(data)`.
  - **Memory budget.** New shell module `memory`: `estimateMemory` / `estimateStageMemory` (atlas pages + decoded
    images, SFX bank, the zone's music set — chip songs sized from their rows, `songFrameBound` — render targets at
    1080p, a 24 MiB heap baseline that the §8.5 on-device check must confirm). Every campaign zone is tested under
    100 MB: zones A–G ≈ 66.7 MiB, H ≈ 73.6, I ≈ 74.3 (4 MiB atlas + 4 MiB image, 0.8 MiB SFX, 9–17 MiB music,
    24.7 MiB targets). **Atlas unloading between zones**: `stageSpriteSets` (a walk of each campaign stage through its
    enemies, bosses, children, tilesets and linked stages) → `atlasPageNeeds` → `createAtlasResidency`, connected to
    `PrepareStage` in the shell's boot (`Shell.atlasResidency`): pages the next zone does not need are `unload()`ed
    (Pixi re-uploads a page on its next draw). Today's atlas is one 1024² page every zone needs, so nothing is unloaded
    yet; the mechanism is tested on a synthetic three-page atlas. Music was already one set resident (M1-15 / M2-10).
  - **Tests.** Electron: `saves` (temp dir: atomic write, backup recovery, failed rename, ordering, keys, quota),
    `ipc-contract` (compiled preload ↔ real handlers ↔ real store), `window-state`, `packaging`, updated `main` (real
    user-data folder, restore / shortcuts / navigation), preload tests. Tizen: `device-info`, `live-reload` (fakes),
    `config-xml-variants` (+ a real `build --mode game-mode` through the bundle check), `tizen-watch` (a real server
    and WebSocket client), the debug tools' device line. Shell: `memory` (per-zone budget, song bounds, residency),
    `storage`, `debug-save`. render-pixi `debug-device`, core `save-replace`, web `platform-electron`.

### M2-18 — v1.0 hardening & release candidate

- **Goal:** prove v1.0 is complete, fair, fast and deterministic, and cut the release candidate.
- **Depends on:** M2-17.
- **Deliverables:** bot runs over all 16 routes × both ships (god mode: completable; durations per zone 3–6 min);
  static content audits (capsule/item budgets, recovery rule, 4-way gap rule for every pattern and laser lane);
  cross-engine determinism — Playwright runs golden replays in Chromium **and Firefox** against the web build and
  compares hashes (§22 P1); per-zone stress benches and a 30-minute headless soak (heap stable); boot-to-title time in
  e2e (< 3 s on CI); Tizen certification self-checks automated where possible (Back/exit flows, visibility, no crash on
  resume); icon set and store-listing placeholders generated; version `1.0.0-rc.1`, CHANGELOG, docs pass.
- **Acceptance:** all of the above green in CI (browser jobs in the `e2e` workflow).
- **Manual:** the complete v1.0 checklist (§8.5, §8.6).
- **Refs:** `shmup_feat.md` §22 (budgets, determinism), §24 (automated tests), §23 (store requirements), §10
  (recovery design).
- **As built:**
  - **Routes × ships.** `test/playtest/campaign-routes.ts` `flyRoutesThrough(exit, ship)` flies the KESTREL or the
    MANTA (`ROUTE_SHIPS`); four files (`campaign-routes-b` / `-c` / `-manta-b` / `-manta-c.test.ts`) run the quarters
    in parallel. Each zone must last 3–6 min (`ZONE_MIN_SECONDS` / `ZONE_MAX_SECONDS`) and the 4-way rules are
    checked on **every tick of every route** (new `CampaignFlags.observe`). New rule `columnGap` in `rules.ts`: the
    bullets crossing the ship's column (±8 px) and every live laser lane must leave a ≥ 16-px open band — the "4-way
    gap rule" generalised from lasers to bullet walls (measured minimum over all routes: 38 px).
  - **Findings fixed (sim changes).** The MANTA could not finish several routes: (1) the LASER → WAVE family's tall
    piercing waves died on armour in front of MANTLE REGENT's, IRON SOVEREIGN's and THE HOLLOW KING's cores — new
    `direct.bolt` tunable `passArmour` / `ShotFlag.PassArmour` (clink at most once per hit cooldown and fly on, like a
    blast), set on the four waves; (2) its fifth disc level was a ±16-unit V with a blind spot straight ahead (CINDER
    BASTION) — now two parallel discs (`oy` ±4); (3) GALVANIC MAW's jaws (gape 4 / 4 / 5) always caught the HUGE
    DISC — gape 8 / 8 / 9. The boss sweep found (4) SANDGRAVE WIDOW's rank-scaled `laserTicks` bringing a second silk
    line 16 px from the first — `boss.widow` now waits a whole lane. `zone-b-god` re-blessed (the jaws; nine ticks
    longer, same outcome); no other golden or demo changed.
  - **Static audits** are `test/integration/release-audit.test.ts` (budgets: 12–32 capsule sources before the WARNING,
    ≥ 3 in 900 px after every checkpoint, the Direct item plan 20–30 with ≥ 6 red / green / blue, one octagon, ≤ 1
    orange / yellow, no meter 1UP / bonus capsule outside bonus stages, ≤ 2 blue capsules; every pattern on a probe at
    rank 2 and 16; every boss fight with both ships). "Static" is partly headless-runtime: the laser lanes are measured
    in real fights, the patterns on probes.
  - **Cross-engine determinism.** Headless Firefox on a GPU-less machine cannot create a WebGL context
    (`FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS`), so the game page cannot boot there. The replays run instead on the
    web **test build's** renderer-free `?determinism` page (`@shmup/shell` `determinism` module — the same bundle of
    the core and the content, dev / test builds only, folded out of releases); `test/e2e/determinism.spec.ts` plays
    every golden replay and attract demo in the Playwright projects `chromium` and `firefox` and compares every hash
    with the file (so Node, Chromium and Firefox agree). There is no separate `e2e` workflow: CI's `ci.yml` has the
    `e2e` shards (`--project=chromium`) and a new `e2e-firefox` job (`--project=firefox`).
  - **Benches.** `test/bench/zones.perf.ts` (each zone start → clear with the bot, full loadout, god mode, bullets
    topped up to 512: median < 1 ms/tick, < 1 MB retained) and `soak.perf.ts` (30 min through the scene flow — runs,
    endings, credits, name entry, the next run; heap flat within 1 MB). The soak measures the heap without V8's code
    and trusted spaces (`dataHeapBytes`): those grow ~1 MB over 30 min with JIT work, the objects ~300 KB, levelling.
  - **Release checks.** `test/e2e/release-check.spec.ts`: boot to title < 3 s (both builds, measured from the
    navigation by a `MutationObserver` init script; ≈ 1.1 s) and the Tizen self-checks on the Tizen build with a fake
    `window.tizen` (Back / exit, pause, `visibilitychange` suspend / resume without a catch-up burst, five resume
    cycles, user data only in `shmup-cup:` `localStorage` keys).
  - **Icons / store.** `scripts/store-assets.mjs` (`pnpm store:assets`, `--check`): the committed icons
    `apps/tizen/public/icon.png` (512 × 423, replacing the skeleton's binary) and `apps/electron/build/icon.png`
    (512 × 512, named in `electron-builder.json`) and the ignored `assets/generated/store/` (icon, four 1920 × 1080
    placeholder screenshots, `listing.json`), all from the placeholder art. The test compares decoded pixels, not PNG
    bytes (zlib versions may differ). The Seller Office sizes could not be verified online — the listing says to check
    them before a submission.
  - **Version.** Manifests `1.0.0-rc.1`; `config.xml` `1.0.0` — Tizen accepts `major.minor.patch` numbers only, so the
    widget takes the numeric core (`config-xml-consistency.test.ts`). CHANGELOG `[1.0.0-rc.1]` with an empty
    `[Unreleased]`. Docs: `docs/dev/release-hardening.md`.

---

## 7. M3 — Post-launch backlog

Coarse steps; each will be split into agent-sized sub-steps (same format as M1/M2) when M3 is scheduled.

### M3-01 — Extra modes & replay features

- **Goal:** replayability extras. **Depends on:** M2-18.
- **Scope:** boss-rush mode, score attack / caravan (timed), loop 2 / Arcade mode (remixed layouts, faster bullets,
  revenge bullets everywhere), Extra Edit unlock (Control/Upper Missile, Small Spread, Hawk Wind, 2-Way Back, Back
  Double, Spread Gun), secret input codes (original sequences), score-milking caps, replay save/share/browser and
  fast-forward, game-speed and invincibility assists (flag scores/replays as assisted), option recovery after death,
  rumble via `vibrationActuator`.
- **Acceptance:** per-feature headless tests; golden replays for loop 2; assisted flags in replay headers.
- **Refs:** `shmup_feat.md` §16, §7A (Extra Edit), §15 (loops, milking), §21 (replays, assists), §8, §4 (rumble,
  secrets).
- **As built:**
  - **EXTRA menu.** The title gained EXTRA (`TitleItem.Extra` 5, between SOUND TEST and EXIT, now 6), opening the
    `ExtraScene`: BOSS RUSH, CARAVAN (choice: the zone), ARCADE (choice: LOOP 1 / LOOP 2), REPLAYS, BACK. A row whose
    content is missing is disabled (no `boss-rush` stage, no campaign, no replay library); OK on a choice row starts
    the mode (Left / Right change the choice). Each mode has its own one-player hi-score table (`HI_SCORE_MODES` gained
    `bossrush`, `caravan`, `arcade`; `MAX_HI_SCORE_TABLES` 32 → 64).
  - **Boss rush** is shipped content: `content/stages/boss-rush.stage.json` (`type: "bossRush"`, the nine zone bosses A
    to I in turn, the M2-09 rush machinery). `test/playtest/boss-rush.test.ts`: the 4-way bot clears it with god mode
    and the full loadout (≈ 5.8 min).
  - **Caravan** = one campaign zone against a 3-minute clock (`CARAVAN_TICKS`): `GameConfig.timeLimit` (0 = none,
    ≤ 216,000 ticks) drives `World.timeLeft`; at 0 the World ends as `stageClear` with `World.timeUp` (TIME UP card, no
    bonus); a clear in time pays 1,000 points per whole second left (`CARAVAN_TIME_BONUS`). The HUD shows the seconds
    in player 2's place. The clock is hashed only when there is one (older goldens keep their hashes).
  - **Loops / ARCADE.** `GameConfig.loop` (1–8). Remixed layouts are a stage's optional `remix` list (spawn /
    formation events merged into the timeline from loop 2 by `stageForLoop`, per World, so loop-1 event indices and
    hashes are unchanged) plus `minLoop` / `maxLoop` on any event; all nine zones ship a remix. The rank's existing
    loop term applies; bullets fly `1 + 0.15·(loop − 1)` faster (cap 1.6, `loopBulletSpeedScale`); from loop 2 every
    player kill fires a revenge bullet whatever the rank (an aimed one for specs without `revenge`). The ARCADE run
    goes from the ending straight into the next loop (no credits; `LOOP n  ZONE A` cards) and is recorded when it
    ends. LOOP 2 as a start is locked until an ending (`SaveData.unlocks.loop2`).
  - **Extra Edit** weapons live in `content/weapons/types-extra.weapons.json` (`"extra": true`); new `ShotKind`s
    Control 10, Upper 11, HawkWind 12, SpreadGun 13, while Small Spread / 2-Way Back / Back Double reuse the Spread
    Bomb / Two-Way / Double kinds with new `flip` art params. The Spread Gun is equipped twice on the meter
    (`MeterChoices.doubleLevels`, `Loadout.spread` — hashed only when non-zero): diagonals, then forward too. The weapon
    select's TYPE gained EXTRA after EDIT, skipped until `unlocks.extraEdit` (any ending, or a secret code).
  - **Secret codes** are four original 8-press direction sequences (`SECRET_CODES`: ↑→↓←↑→↓← EXTRA SHIPS and ↓←↑→↓←↑→
    EXTRA EDIT on the title; ←→→←←→→← FULL POWER and →←←→→←←→ SELF DESTRUCT in the pause menu). EXTRA SHIPS starts the
    next games with 7 ships (`startingLives` now 1–9, the menus still offer 1–5); FULL POWER works once per World.
    Both are recorded (FULL POWER / SELF DESTRUCT as run-replay actions) and EXTRA SHIPS / FULL POWER mark the run
    assisted.
  - **Score-milking cap** (`ScoringRules.repeatKills` 40, `repeatPercent` 10 in `content/rules/scoring.rules.json`):
    only enemies spawned by a script or a boss count (never the timeline's), per kind per World; after 40 full-score
    kills each scores 10 % (rounded down to tens). This changed `captain-range-god` (the captains' minions: score
    25,120 → 20,980) — re-blessed; every other golden and demo changed only in its header (the new config fields and
    `assists`).
  - **Replays.** The M1-19 single-World header gained `assists` (1 god mode, 2 invincibility; decode defaults it from
    `assisted`). Whole runs use a new `run-replay` format (`core/replay` `run.ts`): one segment per World with its
    start state (carry, zone, loop …), RLE input, hashes and between-tick actions (continues, secrets), flags 4 speed /
    8 secret added. The flow records every run (`SceneFlow.recorder`); the `ReplayLibrary` keeps the last game plus 3
    kept replays in platform storage (`replay.last`, `replay.1`–`3`; ≤ 120,000 chars each — under the web / Tizen
    adapter's 256 KiB a value, UTF-16 — and ≤ 130,000 for the kept ones together, so the library never crowds the save
    out of the 1 MiB budget; KEEP / import past it say the slots are full). EXTRA → REPLAYS browses them: PLAY (the
    `ReplayScene`: Right / Left ×1 / ×2 / ×4, OK pause, desync message), KEEP, SHARE, DELETE. SHARE is a
    host hook: the web app copies the text to the clipboard and imports a replay pasted on the page; the TV has none.
  - **Assists & feel** are save options (`options.play`, save version stays 2 — every new field optional): the GAME
    page's OPT RECOVERY, SPEED (100 / 75 / 50 %) and INVINCIBLE rows, the CONTROLS page's RUMBLE. The game speed slows
    the frame clock like debug slow motion (every tick whole: simulation, replays and hashes unchanged, the run only
    flagged); invincibility is sim config (`GameConfig.invincible`, `PlayerShip.invincible`). Assisted runs' hi-score
    rows carry `assisted` (drawn with `*`).
  - **Option recovery** (`GameConfig.optionRecovery`): each Option a death takes drops as a Free Option item at the
    wreck.
  - **Rumble**: `input-web` `rumblePad` / `WebInput.rumble` (`dual-rumble`, 260 / 520 ms) for the existing
    `SimEventKind.Rumble` events (a death, a boss's final blast), wired by the shell's `connectRumbleEvents` while RUMBLE
    is on.
  - `Game.frame` became two functions (`bareFrame` / `flowFrame`) so bare gameplay's frame stays small enough to
    inline (the allocation guard); the Tizen bundle is 374.6 KB gzip of its 384 KB budget (unchanged).

### M3-02 — Visual & mechanic extras

- **Goal:** showpieces and a signature mechanic. **Depends on:** M3-01.
- **Scope:** Mode-7-style affine floor shader and a pseudo-3D "high-speed dimension" stage; escape sequence after the
  final boss; CRT/scanline filter (Off/Light/Full, capped at 1080p on TV); ultra-wide desktop mode and 4:3 pillarbox
  mode; deterministic "authentic slowdown" toggle; black-hole bomb as the signature special (Direct ship); suction,
  grabber and invincible-walker bosses; death-bomb window; graze detection and scoring.
- **Acceptance:** shader syntax checks + e2e screenshots, headless tests for slowdown determinism, bomb, graze.
- **Refs:** `shmup_feat.md` §18 (Mode 7, CRT, widescreen), §3 (slowdown), §7C, §13 (P2 bosses), §14 (escape, 3D
  stage), §10, §22 (graze).
- **As built:**
  - **Mode-7 floor.** One GLSL ES 1.0 Pixi filter (`render-pixi` `effects/shaders.ts` `MODE7_VERTEX` /
    `MODE7_FRAGMENT`, built by `effects/mode7.ts` `createMode7Filter`) evaluates mode 7's per-row affine matrix per
    pixel over a full-frame sprite at the bottom of `BG_MID`, sampling the tile straight out of the atlas with
    `fract` (no separate floor texture). The host passes the plane's **turned axes** from the core's angle tables, so
    the shader has no trigonometry; the scale is clamped (`MODE7_MAX_SCALE`) so the horizon row cannot divide by zero.
    Stages describe it in a new optional `mode7` section (`StageMode7` → `Mode7View`, presentation only — the
    simulation never reads it and a stage's hash is unchanged); `createMode7Floor` attaches the filter only while the
    camera is inside `[from, to)` and a frame writes numbers only.
  - **Pseudo-3D stage.** `content/stages/dimension.stage.json` (**HIGH-SPEED DIMENSION**) is a **dev stage**
    (`?stage=dimension`, the `raster-range` precedent), not a campaign zone: adding a tenth zone would change the
    diamond map, every route and every golden for no gain. Its art comes from the committed generator
    `scripts/assets/procedural/dimension.mjs` (a seamless neon grid tile, a violet sky band, the pylon and the three
    boss parts). `test/integration/dimension-runtime.test.ts` flies the whole stage and drives the floor.
  - **Escape sequence.** A zone's optional `escape` stage id (`CampaignZoneSpec.escape` / `escapeId`; the loader
    rejects one on a zone that still has exits). The final zone's stage-clear goes `ClearNext.Escape` →
    `FlowControl.enterEscape()`, which swaps the World for one on that stage with the run's carry (`RunState.inEscape`
    / `escapeStage`, no caravan clock), and the next clear (`ESCAPE COMPLETE`) goes to the ending. It is **not** a zone
    of its own: the route, the zone count and the hi-score row's `reached` are unchanged. Zones H and I ship
    `content/stages/escape.stage.json` with its own `content/audio/music/escape.music.json`.
  - **CRT filter.** `effects/crt.ts`: one program for both strengths (`CRT_LOOKS` — scanlines at `light`; scanlines,
    an aperture-grille mask and a vignette at `full`), run over the **upscaled** second pass and capped at
    `CRT_MAX_HEIGHT` (1080) rows through the filter's resolution (`crtResolution`), so a 4K TV pays for a 1080p pass.
    The scanline pitch follows the frame's scale on the display, and the shader only ever multiplies the colour down,
    so the flash overlay's limiter still holds.
  - **Aspect modes** are a **window** on the display, never a crop and never a wider playfield (the internal 384×216
    is fixed — D19): `computeAspectViewport` places the frame in the largest 64:27 (`wide`) or 4:3 (`classic`)
    rectangle that fits and reports the leftover width as side panels. On a real ultra-wide `wide` fills the display
    edge to edge; on a 16:9 TV it letterboxes into a cabinet window, and `classic` pillarboxes with panels. The panels
    are a dimmed space-navy surround (`PANEL_ALPHA`), not painted side art — no new art was needed for them.
  - **Authentic slowdown** is sim-side and deterministic: phase 9 counts the tick's live objects into `World.slowLoad`
    (enemy bullets + lasers + live enemies + standing boss parts + player shots + items) and steps `World.slowRun`;
    `stepWorld` then skips the next tick exactly as hit-stop does once the load is over `SLOWDOWN_THRESHOLD` (96), so
    a busy screen runs at half speed and a quiet one never slows. Both fields are hashed only in a World that has the
    option on, so older goldens keep their hashes.
  - **Graze** (`GameConfig.graze`): an enemy bullet that passes within `GRAZE_MARGIN` of a ship's hurtbox without hitting
    it is marked once (`BulletFlag.Grazed`) and pays `ContentDb.scoring.graze` points.
  - **Black-hole bomb** is the one signature mechanic (feat §7C), in the new `core/blackhole` module: the Direct
    ship's Special throws a vortex that drifts with the camera, pulls enemy bullets in and swallows the ones that
    reach its core (points like a cancel), drags enemies towards its centre, then discharges bolts that destroy every
    non-immune enemy in reach and damage boss parts. `MAX_BLACK_HOLES` 2 (one per player), stock `MAX_BLACK_HOLE_STOCK`
    3, and the yellow Direct item stocks a bomb instead of detonating a smart bomb. `update()` passes **whole-pixel**
    centres to `bullets.vortex` / `enemies.pullTowards`: a fractional argument of the six-argument (not inlined) call
    boxed a heap number every tick a vortex was open — found by the new guard
    `packages/core/test/blackhole/blackhole-alloc.test.ts`.
  - **Death-bomb window** (`GameConfig.deathBomb`, 0–`MAX_DEATH_BOMB_TICKS`): a fatal hit on a ship with a bomb opens
    the window instead of killing it; a Special (Direct) or PowerUp (meter — its armed `!` slot) press inside it wipes
    the hit and grants `DEATH_BOMB_INVULN_TICKS` of invulnerability, and a window that runs out kills on the tick it
    closes.
  - **P2 bosses** GRASPING BLOOM (suction), IRON TALON (grabber) and SHADOW STRIDER (the invincible walker that must
    be dodged) live in `content/enemies/extras.enemies.json` with their behaviours in `core/behaviors` / `core/bosses`.
  - **Options.** The four sim-affecting extras are `GameConfig` fields (replay-recorded) offered on a new **EXTRAS**
    options page (`APPLIES FROM THE NEXT GAME`); the CRT filter and the aspect mode are presentation-only
    `UserOptions.display` rows applied live through the shell's `DisplayTarget` (`setCrtFilter` / `setAspect`, both
    optional so a renderer without them is untouched).
  - **Goldens and demos re-blessed** (`pnpm golden:update`): every replay header gained the four new `GameConfig`
    fields, which changes each state hash. Nothing else moved — no `expected` status, score or tick count changed in
    any golden or attract demo, which is the evidence that the simulation is unchanged with the extras off.
  - **Review fixes (round 1).** A checkpoint restart now closes the open vortices too
    (`clearSession` calls `world.blackholes.clear()`, which had no call site), and a boss slot no
    longer inherits the pull field of the boss that vacated it (`enter()` and the session `clear()`
    reset `pullRadius` / `pullStrength` / `pullTicks`, so a `boss.walker` reusing a suction boss's
    slot cannot suck the ships in). Both have regression tests; no golden hash moved.
  - `eslint.config.js` `globalIgnores` gained the git-ignored agent / editor directories (`.claude/`, `.caliber/`,
    `.playwright-mcp/`) so `pnpm lint` does not try to parse tooling that is not ours.
  - The Tizen bundle is 383.4 KB gzip of its 512 KB budget (374.6 KB at M3-01).
  - **Test suite.** Fifteen suites were added around the step's code: `core/blackhole` edges
    (`blackhole-edge`: the slot bookkeeping, the camera ride, the burst's bolt cadence, the enemies and boss parts
    its lightning takes, the swirl's animation frames, a World with the option off) and co-op
    (`world-extras-coop`: one vortex per player, each crediting its thrower); `core/bullets`'s `vortex` and
    `grazePlayers` (`bullets-vortex-edge`); `core/enemies`'s `pullTowards` / `blast` (`enemies-vortex`);
    the bosses' pull field (`bosses-pull`, `bosses-pull-alloc`) and the three P2 boss scripts
    (`behaviors-p2-bosses`); the tick-pipeline edges of the slowdown and the death-bomb window
    (`world-extras-edge`); the graze value (`scoring-graze`); the stage `mode7` section and its view
    (`stage-mode7`) and the Mode-7 floor's rebinding (`render-pixi` `mode7-edge`); the EXTRAS options page and the
    DISPLAY page's CRT / ASPECT rows (`scenes-extras-page`); the escape sequence in the loader (`campaign-escape`)
    and through the scene flow (`scenes-escape`); and `hashWorld`'s `mixExtras`, term by term
    (`debug-extras-hash`) — the evidence that a World without an extra hashes exactly as it did.
    A new golden replay `zone-a-extras` flies the whole of zone A with the MANTA and **every extra on**, throwing a
    black hole every 90 ticks (`bomberBot`): its hashes cover the vortices' pull, their lightning and the grazes,
    and recording it moved no other golden or demo file. Both review-round-1 fixes have regression tests that fail
    with the fix removed.

### M3-02b — Remote & hardware tuning from the input-probe results

- **Goal:** make the game fit how the M7 monitors and the Smart Remote *actually* behave — measured by the input
  probe on both monitors on 2026-09-15 — and tune the game around it. **Depends on:** M3-02.
- **Source of truth:** [`docs/dev/input-probe-results.md`](docs/dev/input-probe-results.md) (numbers, per-finding
  meaning), raw logs and the analyzer in `tools/input-probe/results/2026-09-15-m7/`, `shmup_tech.md` §2.7. Every
  timing below is on the handler clock (`t + delay`), **not** the probe's verdicts (see finding "probe clock").
- **Measured facts this step designs for:**
  1. **One key at a time.** While an arrow is held a second arrow or OK is **never delivered** (not on press, not on
     release) and the held arrow keeps repeating. ⇒ no diagonals, no move + OK / Ch± / Pause, and a new direction
     only registers if pressed after the previous key is up.
  2. **Flagless auto-repeat.** Repeats are `keydown` with `repeat === false`, first after ≈ 355 ms (≈ 21 ticks), then
     every ≈ 108 ms (≈ 6.5 ticks, ± 40 ms). **No fake key-up/key-down pairs, no bounces**; the key-up comes 0–100 ms
     after the last repeat.
  3. **Taps** last 120–260 ms (7–16 ticks, median ≈ 10–12); fastest OK re-tap ≈ 276 ms.
  4. **Release-only keys:** Back (10009), Play/Pause (10252) and Mute (449) arrive as keydown + keyup together when
     the button is *released* — never holdable, ≈ one tap late.
  5. **Key codes:** Ch rocker pressed = Guide 458, screen button = Extra 10253 (both registrable), Vol rocker
     pressed = Mute 449; `registerKey` works for all 45 non-`Exit` keys (volume included — still never registered).
  6. **Home / a pad's PS button = window `blur` / `focus` only** — no `visibilitychange`; the app keeps running
     under the overlay. Today the game neither pauses nor suspends audio then.
  7. **rAF jitter:** median 16.5 ms (60 Hz) but 27–32 % of deltas > 20 ms, p95 ≈ 30 ms, ~59 fps delivered (≈ 1.5 %
     real drops). The loop's ±1 ms snap (`core/loop` `DEFAULT_SNAP_TOLERANCE_MS`) turns this into 0-tick and 2-tick
     frames (judder), against D32's "one tick per rAF at 60 Hz".
  8. **Environment:** Chromium 69.0.3497.106, 1920×1080 @1, Mali-G51 with WebGL 1 + 2 (`MAX_TEXTURE_SIZE` 8192),
     WASM / AudioWorklet / OffscreenCanvas present, no native `globalThis`, audio 44.1 kHz with 50 ms base latency,
     4 cores. DualShock 4 (Bluetooth): standard mapping, 17 buttons / 4 axes, D-pad diagonals work.
  9. **Probe clock:** Tizen 5.5's `event.timeStamp` only advances in whole seconds; the probe accepted it, so its
     on-screen verdicts were wrong.
- **Scope:**
  - **Remote profiles (data + small code):**
    - `tizen-remote-safe`: `releaseDebounceTicks` **2 → 0** (fact 2; the plan §8.2 recipe for clean / flagless
      repeats); relabel it (e.g. `REMOTE (DEFAULT)` — string table) since "SAFE 4-WAY" vs "FAST 8-WAY" no longer means
      anything: the two TV profiles differ only in this debounce and the remote cannot send diagonals.
    - Retire `tizen-remote-diagonal` from the TV's CONTROLS choices (keep it loadable, or remove it with a save
      migration: a saved `tizen-remote-diagonal` becomes the default remote profile — `save` sanitising, tested).
    - A profile knob for the **single-key remote** (e.g. `singleKey: true`: while any key of the device is down,
      further keydowns of other keys are dropped and the held one continues — fact 1). `keyboard-remote-emulation`
      uses it instead of `lastWins`, so the desktop feels like the real remote; the TV profile may set it too
      (harmless, and it makes the emulation and the bot model the same thing).
    - Register Guide 458 and Extra 10253 so the REBIND page can capture them (no default binding; allowed by the
      rebind validator); volume keys stay forbidden.
    - `content/input/README.md` "Tuning after the input probe" and `docs/dev/input-profiles.md` rewritten with the
      measured values (the recipe table in plan §8.2 becomes history).
  - **Nothing asks for a held Back / Pause or a chord (fact 4):**
    - INPUT TEST: "hold Pause 60 ticks to exit" is impossible on the remote → exit with **Back / Pause pressed three
      times within ~1.5 s** (the probe's gesture; release-only keys count at release); string
      `HOLD PAUSE TO EXIT` updated; the hold still works for keyboard / pad if kept.
    - Audit every held-key gesture and hint (scenes, the shell's debug unlock, docs) for Back / Pause holds and
      chords; remote-reachable alternatives where one is needed.
    - Regression test: keydown + keyup of Back / Play/Pause inside one frame (and inside one tick) still gives one
      pressed edge (the latch already does this — pin it).
  - **Flagless repeats (fact 2):** `@shmup/input-web` already treats a keydown of a held key as "still held" — add
    tests with the measured stream (press, 21-tick first repeat, 6.5 ± 2.4-tick repeats, all `repeat=false`, key-up
    1–6 ticks after the last one ⇒ exactly one pressed edge, held throughout, released on the key-up tick). Fix the
    places that trust `event.repeat` themselves: the shell's debug unlock sequence (flagless Ch+ repeats count as
    steps) and debug number keys (re-fire while held) must track held keys. Add a lint rule or test forbidding
    `event.timeStamp` / `.timeStamp` in shipped input code (fact 9).
  - **Pause on Home (fact 6):** the Tizen platform's lifecycle (and the web one) fires suspend on window `blur` and
    resume on `focus`, de-duplicated with `visibilitychange` (a blur + hidden pair suspends once; resume only when
    both are back). Effect: the pause menu opens and audio suspends under the Home overlay; on return the game stays
    paused (the M1-16 "platform resume opens the pause menu" path) with no catch-up burst (`refresh.reset()`, loop
    reset). Electron keeps its own policy (document it). Tests with a fake window / document.
  - **Frame pacing (fact 7):** a **vsync-locked** tick policy for fixed ~60 Hz displays (refresh monitor reading
    ≈ 55–65 Hz, or a `GameConfig`/shell option forcing it on Tizen): exactly **one tick per rAF callback** while
    deltas stay under ~1.5–1.75 steps, extra ticks only for really dropped frames, the long-run tick debt bounded
    (≤ ±1 tick, reset on resume) — replacing the drift-carrying accumulator on that path; the free-running
    accumulator stays for other rates, slow motion, frame advance and the game-speed assist. Presentation-only: the
    simulation, replays and goldens do not change. The debug overlay gains **ticks-per-frame counters (0 / 1 / 2 / 3+)
    and a rAF-delta histogram** so the on-device check can confirm it.
  - **Playtest bot learns the remote (facts 1–3) and the game is re-tuned under it:**
    - A `remote-strict` input model in `test/playtest/` (used by `fourWayBot` by default): never a direction on a
      tick that holds PowerUp / Special / Speed / Pause; such a press is a **tap of 8–15 ticks with no direction**,
      preceded by ≥ 2 empty ticks; switching from one direction to another needs ≥ 1 empty tick; Back / Pause edges
      at release. The harness enforces the model (a violation fails the run, like `diagonalTicks` today).
    - Re-run every zone A–I, all 16 routes, the boss rush, the caravan zones and practice runs with it — god mode
      within the 3–6 min budget, the recovery rule (≥ 3 capsule sources within 900 px after every checkpoint) still
      holding, and the no-god-mode expectations of M2-11 … M2-14. Where the stricter bot fails or turns marginal
      (equips it can no longer afford, dodges that needed an instant direction switch), **tune the content**:
      capsule / carrier placement before calm moments, the density or speed of aimed fire in sections that expect an
      equip, gaps and lane widths that relied on instant turns. Record every tuned value in "As built".
    - Re-bless golden replays and attract demos (content changes and the new bot inputs), reason in the commit.
    - A first-time hint for remote players that OK / Ch± need the arrow released (existing text / banner
      facilities, once per save, remote profiles only) — or record why it was left out.
  - **Probe fixes (tools/input-probe, fact 9):** `chooseEventTime` detects coarse timestamps (or simply always uses
    handler time) so the verdicts are right on Tizen; verdict "second key never arrived" for a diagonal / OK attempt
    that produced no event during a long hold (so the panel says *NO — not delivered* instead of *not tested*); the
    report carries a raw rAF-delta histogram; `results/analyze.mjs` stays as the reference re-analysis; probe tests
    updated. (Re-running it on the monitors is optional — plan §8.2.)
  - **Environment facts (fact 8):** keep WebGL1 as the renderer default (older sets), but record WebGL2 / 8192 on the
    M7 in `docs/dev/rendering-and-shell.md`; note AudioWorklet + WASM availability for M3-03's tracker-music
    benchmark; revisit the audio engine's latency hint against the 50 ms base latency (document, change only with a
    test).
  - **Docs** (the DOCS agent): `shmup_feat.md` §3 (pause on blur, frame locking) and §4 (actions: 4-way only on the
    remote, "ignore `e.repeat`" → "ignore keydowns of held keys", remote-first rules 2 and 3 rewritten with the
    measurements), `docs/client/controls.md` ("OK never stops a direction", Home pauses, input-test exit,
    troubleshooting), `docs/client/preview-build.md` TV checks, `docs/dev/input-profiles.md`,
    `docs/dev/options-rebinding-and-accessibility.md`, `docs/dev/architecture.md` (input pipeline, lifecycle table),
    `docs/dev/input-probe.md`, `docs/client/release-candidate.md` / `debug-tools.md` / `apps/tizen/README.md`
    (Home-pause wording), plan §8.2 / §8.4 items.
- **Acceptance:**
  - Profile tests: the TV default has `releaseDebounceTicks: 0`; the retired / migrated diagonal profile; the
    single-key knob drops a second key and keeps the first; Guide / Extra capturable in REBIND, volume keys rejected.
  - input-web tests: the measured flagless-repeat stream → one edge; same-frame down + up of Back / Play/Pause → one
    edge; no `timeStamp` use in shipped code.
  - Scene test: the INPUT TEST closes with three Back presses on the remote profile.
  - Lifecycle tests: blur → suspend + pause menu; focus → resume with the game still paused; blur + hidden →
    one suspend; no catch-up ticks after resume.
  - Loop tests: steady 16.67 ms → 1 tick every frame; alternating 12 / 21.3 ms → 1 tick every frame; a synthetic
    trace with the measured distribution (≈ 27 % of deltas 20–34 ms paired with short ones, ≈ 1.5 % real 33 ms
    drops) → no 0-tick frames outside real drops and ticks within 1 % of frames; 120 Hz / slow-mo / game-speed
    behaviour unchanged; allocation guard green.
  - Playtest: the `remote-strict` bot clears every zone, route and the boss rush under the M1-18 / M2 budgets with
    zero model violations; goldens and demos green after the intended re-bless.
  - Probe: `npm run verify` green; a test feeds Tizen-like whole-second timestamps and gets correct verdicts.
  - Bundle within `APP_JS_GZIP_BUDGET`.
- **Manual (user, on the monitors — plan §8.4):** with the new `build:dev`, check the overlay's ticks-per-frame
  counters stay at "1" while flying (both monitors); Home during play → the pause menu is up on return and the music
  was silent; the INPUT TEST exits with Back ×3; a **240 fps** video of the probe's flash box and of the game (the
  latency figure is still open — the first video was 30 fps); optionally re-run the fixed probe and try Back / Ch±
  during an arrow hold and two gamepads at once.
- **Refs:** [`docs/dev/input-probe-results.md`](docs/dev/input-probe-results.md), `shmup_tech.md` §2.3, §2.5, §2.7;
  `shmup_feat.md` §3, §4; decisions D2, D12–D14, D32; plan §2.2, §8.2.
- **As built:**
  - **Profiles.** `tizen-remote-safe` is now labelled `REMOTE`, debounces 0 ticks, carries the new
    `singleKey: true` knob and registers `Guide` + `Extra` as well. `tizen-remote-diagonal` was
    removed from the content; `core/config` gained `RETIRED_INPUT_PROFILE_IDS` /
    `migrateInputProfileId`, which `resolveUserOptions` applies to `options.input.profileId` (a
    saved binding override keyed by the retired id is left where it is — it is inert and costs
    bytes to migrate). `keyboard-remote-emulation` also went to `singleKey: true` with debounce 0,
    dropping its `lastWins` diagonal / SOCD policies (the hardware never delivers the second key,
    so `lastWins` was unreachable).
  - **`singleKey`** lives in `InputTuning` (`@shmup/input-web` `remote`) and is honoured by the
    keyboard source: while any tracked key is physically down, a `keydown` of an untracked key is
    dropped (a key inside its release-debounce window is already up and does not block). Gamepad
    profiles must not set it. `remote` also exports the measured `REMOTE_REPEAT_DELAY_TICKS` (21)
    and `REMOTE_REPEAT_INTERVAL_TICKS` (6.5) for the docs and the bot model.
  - **Vsync lock** (`core/loop`): the threshold turned out to be **2 whole steps of covered time**
    (delta + the debt carried from earlier frames), not 1.5–1.75 steps of raw delta as the plan
    sketched. The M7's jitter reaches a p95 of ~30 ms (1.8 steps) while the short deltas beside it
    keep the average at 60 Hz, so a raw-delta rule double-ticks on ~5 % of perfectly ordinary
    frames; the covered-time rule is self-regulating and keeps the tick count on real time. The
    debt is bounded to ±1 step, `alpha` is 0 while locked, and the locked branch lives in its own
    small helper so `advance` stays inlinable (a bigger `advance` boxed its fractional argument and
    blew the M1-06 allocation budget — caught by `core/game`'s guard, and a new guard
    `test/loop/loop-vsync-alloc.test.ts` pins it).
  - **Shell option** `framePacing: 'auto' | 'lock' | 'free'` (default `auto`) drives
    `Game.setVsyncLock` from the refresh probe inside `VSYNC_LOCK_MIN_HZ … VSYNC_LOCK_MAX_HZ`
    (55–65 Hz). `Game` suspends the lock automatically while frame advance, slow motion or the
    game-speed assist feed the loop a slowed clock.
  - **Debug overlay** gained a sixth line: `TPF` with the 0 / 1 / 2 / 3+ ticks-per-frame counters
    and an eight-bucket rAF-delta histogram (`RAF_BUCKET_EDGES_MS`), plus a `LOCK` alert while the
    vsync lock is on. The device line moved to line 7. Both counters are also on
    `window.__shmupDebug.stats` for the on-device check.
  - **Lifecycle.** `apps/web` `createVisibilityLifecycle` and the Tizen platform's lifecycle take
    an optional `focus` source (`window`) and are now **edge-triggered**: suspended while hidden or
    unfocused, resumed only when both are back. A repeat of the same state fires nothing (the old
    "repeated events fire the callbacks again" contract is gone, and `apps/web`'s tests say so).
    Electron keeps the same web lifecycle — it renders the web app —, which is the documented
    policy: an Electron window that loses focus pauses like every other host.
  - **INPUT TEST** exits on `INPUT_TEST_EXIT_PRESSES` (3) Pause presses inside
    `INPUT_TEST_EXIT_WINDOW_TICKS` (90) as well as on the 60-tick hold; the string became
    `PAUSE X3 OR HOLD TO EXIT`. No other held-key gesture or chord was left: the shell's debug
    unlock is four *taps* (Pause, Ch+, Ch+, Ch+), which release-only keys satisfy.
  - **`event.repeat`** is no longer trusted by the shell's debug tools: they track held keys
    themselves (`keydown` / `keyup` / `blur`, keyed by `keyCode` **and** `code` so a key with
    `keyCode` 0 still works), so the remote's flagless repeats neither advance the unlock sequence
    nor re-fire a toggle. A repo-wide ESLint rule now forbids `.timeStamp` in runtime sources.
  - **Playtest.** `test/playtest/remote-strict.ts` holds the model (`createRemoteStrictModel`) and
    its checker (`createRemoteStrictCheck`); `fourWayBot()` flies under it by default
    (`{ remote: false }` gives the old bot), `PlaytestBot.remoteStrict` opts a bot into the check
    and `PlaytestResult.remoteViolations` / `.remoteViolation` report it. Tap length is 10 ticks
    inside the measured 7–16 band, a release-only action (Pause) is 1 tick, and both need 2 empty
    ticks first; a direction change costs 1 empty tick.
  - **No zone content needed re-tuning.** Every zone A–I, all 16 routes, the boss rush, the caravan
    zones and the practice runs clear under the stricter bot with zero model violations, inside the
    M1-18 / M2 budgets and with the recovery rule intact. What the stricter model *did* expose was
    the bot's own play, and three bot changes fixed it (recorded here because they change every
    golden): it waits for a lane that stays clear for `EQUIP_WINDOW_TICKS` (12) before starting a
    PowerUp tap — with `EQUIP_PATIENCE_TICKS` (150) as the "take the risk anyway" deadline —, it
    prefers a boss core's lane much more strongly (`BOSS_CORE_BONUS` 160, was 60) and, **in god
    mode only**, lines up on the core's exact row instead of the lane centre. The last one is
    deliberate: the audit runs ask "does this boss go down at all", while a run that can die must
    keep dodging by lanes — sitting on the core's row is where aimed fire converges, and doing it
    always cost zones D/F/H their no-god-mode clears.
  - **One golden expectation changed.** `gimmick-range-god` no longer breaks a destructible brick:
    under the remote model the 4-way bot flies the high branch without firing into the terrain. The
    assertion is now `destroyed === 0` and the scenario description says "the high branch"; the
    brick coverage stays with `gimmick-range-weaver` (≥ 5 broken) and the rollbacks of
    `gimmick-range-deaths`. Lowering the dev tileset's brick HP was tried first and changed
    nothing — the bot never aims at it.
  - **Two tests were fixed rather than re-blessed.** `zones-bc-direct` counted Direct-mode drops by
    pool slot, which the pool's swap-remove makes unreliable; it now matches a tick that handed out
    exactly one item against the plan position it was handed out at. The `remote-strict` re-tuning
    only made the old flaw visible.
  - **Probe.** `chooseEventTime` now *always* returns handler time and keeps `event.timeStamp` only
    for the dispatch-delay statistic (the plan's simpler option — detecting coarseness would still
    leave a clock nothing can be derived from). `FrameSummary` gained a raw `histogram`
    (`FRAME_BUCKET_EDGES_MS`, `frameBucket`). The verdicts gained `NO — not delivered` for
    diagonals and OK-while-arrow, inferred from `maxSimultaneous === 1` after a long hold with the
    keys involved seen — the checklist itself cannot express "tried", because a swallowed key
    leaves no event to tick it with. The probe was **not** re-run on the monitors (optional).
  - **Still manual (hardware / account):** the on-device checks of plan §8.4 — the overlay's
    ticks-per-frame counters while flying on both monitors, Home during play, the INPUT TEST's
    Back ×3 exit, a 240 fps latency video of the flash box and of the game, and optionally a re-run
    of the fixed probe with Back / Ch± during an arrow hold and two gamepads at once.
  - **Left out:** the first-time "OK / Ch± need the arrow released" hint for remote players. The
    INPUT TEST shows it live (hold an arrow, press OK: nothing lights) and the player docs say it,
    the one-shot banner machinery would have to learn a per-save "seen" flag for a device-specific
    string, and the
    `APP_JS_GZIP_BUDGET` headroom is better spent on M3-03's localization. Recorded here so the
    decision is visible rather than forgotten.

### M3-02c — Render profiling: on-device numbers and a render benchmark

- **Goal:** find out, in milliseconds, where the M7's frame time actually goes, and gain a headless gate that stops the
  render path regressing. **Depends on:** M3-02b.
- **Source of truth:** [`docs/dev/render-performance-review.md`](docs/dev/render-performance-review.md) — findings
  **F10** (no render-side benchmark exists), **F8** (the WebGL1 justification is stale), and the harness that settles
  the open magnitudes behind **F1**, **F2**, **F4** and **F5**. Hardware facts:
  [`docs/dev/input-probe-results.md`](docs/dev/input-probe-results.md) §8–§9.
- **Why it comes first:** F1's *mechanism* is certain but its *size* is not, and no one should rewrite the frame path
  on a guess. This step makes both the headless and the on-device numbers available. It does **not** block M3-02d or
  M3-02e: those are gated by this step's headless bench, and the owner's device run confirms them afterwards.
- **Scope:**
  - **Debug overlay** (`@shmup/render-pixi` `debug`, on the existing TPF / RAF line): a **structure-rebuild counter**
    (how many frames rebuilt the scene's instruction set rather than taking Pixi's update path) and the **pooled
    render-target byte total** read from Pixi's `TexturePool`. Both allocation-free, one `DrawList` per colour, as the
    module already requires. These two numbers are what make F1 and F2 visible on the TV at all.
  - **Render benchmark** `test/bench/render.perf.ts`, driven by Playwright against the built web bundle (the existing
    `pnpm bench` suites are Node-only and measure the simulation): scripted worst-case frames — 512 enemy bullets,
    512 point items, the full particle pool, a filtered layer active, Mode-7 active, CRT `off` / `light` / `full` —
    asserting `renderer.drawCalls` (already exposed) against a documented budget and a **render-ms p95**.
  - **Take the internal frame size as a bench parameter** (default 384x216) and report render-ms p95, draw calls and
    render-target bytes per resolution. This is one parameter now and a retrofit later: the owner intends to try a
    higher internal resolution once the plan is done, and this turns "does 768x432 still hold 60 fps?" into a bench
    run rather than build-and-hope. See
    [`docs/dev/render-performance-review.md` §7](docs/dev/render-performance-review.md#7-if-the-internal-resolution-changes-later-960540-1080p-).
  - **A browser-side JS-heap delta** over ~600 frames that fails on growth. This is the gate F5 is currently invisible
    to: the allocation guards run in Node against fake atlases, so they stop at the `renderer.render()` boundary and
    cannot see Pixi's batch-buffer growth or its lazy per-sprite allocation.
  - **F8:** correct the stale docblock in `packages/render-pixi/src/renderer/index.ts` (it still says WebGL2 on Tizen
    5.5 is unverified — the probe verified WebGL 1 *and* 2 on both monitors, `MAX_TEXTURE_SIZE` 8192), and add a dev
    switch (`?gl=2` or a debug-tools toggle) so the owner can A/B the renderer on device. **Keep WebGL1 as the shipped
    default** — the project also targets older sets, and there is no evidence yet that 2 is better.
  - **Docs:** a "measuring on the TV" recipe in [`docs/dev/rendering-and-shell.md`](docs/dev/rendering-and-shell.md)
    (the review's §4 table M1–M8), and a place in `docs/dev/input-probe-results.md` for the numbers to land.
- **Acceptance:** `pnpm bench` prints render p95 and draw calls per scenario and fails on budget; the heap-delta gate
  fails on a deliberately leaky fixture; the overlay shows both new figures and the allocation guards stay green; the
  renderer docblock matches what the probe measured.
- **Manual (owner, on the monitors — plan §8.4):** with a `build:dev` bundle (debug unlock: Pause, Ch+, Ch+, Ch+) run
  the review's §4 measurement table — baseline FPS / TICK / RENDER / DRAW and the frame graph on the title, zone A and
  a boss; confirm **TPF reads 1** and LOCK is showing (if not, M3-02b's vsync lock is not engaging); **M1** the cost of
  the structure rebuild; **M2** RENDER ms with CRT off / light / full on the same stage section; **M3** a one-off hitch
  entering the Mode-7 and raster stages; **M4** a hitch on the first very dense pattern of a fresh launch; **M5** the
  WebGL1-vs-2 A/B; **M7** whether the app really stops rendering under the Home overlay.
- **Refs:** `shmup_feat.md` §22 (render <= 8 ms, 20–50 draw calls), §24; review F8, F10.
- **As built:**
  - **The overlay's two figures got their own line, not the TPF / RAF one.** Line 5 is full to
    column 46 (`TPF` and its four counters, then `RAF` and the eight-bucket histogram), so `REB`
    and `RT` are line 6 and the M2-17 device line moved to line 7 (`PANEL_LINES` 6 → 7, the
    backdrop and the frame graph follow). Same rules as the rest: one `DrawList` per colour,
    allocation-free (guarded).
  - **The pooled-target total is measured with a hook, not a scan.** `createRenderTargetMeter`
    (`@shmup/render-pixi` `debug`) wraps Pixi's global `TexturePool.createTexture` once and
    accumulates `w × h × 4`, so the overlay reads a number. Walking the pool's `_poolKeyHash` every
    frame would have allocated — the very thing the module forbids. `stop()` (called by the debug
    tools' `destroy`) puts the pool's own method back and never steals a later meter's hook.
  - **The structure-rebuild count is a renderer option**, `countStructureRebuilds`, alongside
    `countDrawCalls` and set by the shell in dev / test builds: `render()` reads the scene render
    group's `structureDidChange` *before* pass 1 (Pixi clears it while rendering).
    `PixiRenderer.structureRebuilds` is -1 when not counting, exactly like `drawCalls`.
  - **The bench drives a purpose-built page, not the game app.** The plan said "the built web
    bundle"; the bench has to choose the internal frame size, the stage and the exact scene load,
    and the shipped shell exposes none of those. `test/bench/render-harness/` is built by the bench
    itself with Vite and the repo's own `shmupContent()` / `shmupAssets()` plugins, so it runs the
    real renderer over the real simulation and the real atlas — but it needs no shipped code to
    grow a bench-only knob. It is served on an ephemeral port and driven in Playwright's Chromium;
    one page per scenario, because Pixi's `TexturePool` is a global that never releases a texture.
  - **The resolution parameter is compared on the layer-effect scenario**, where it actually moves:
    a filter pass is pooled at the *internal* frame size, so 384×216 → 768×432 takes the pooled
    target 512 KB → 2,048 KB and the frame render texture 324 KB → 1,296 KB (review §7.3's ×4).
    The scene's *content* is still 384×216 of world — rendering the same world scaled up is a
    renderer change nobody has made yet — so the knob measures fill and render-target cost, not
    content density. Recorded here so the next reader does not over-read the number.
  - **Budgets.** Draw calls (`DRAW_CALL_BUDGET = 20`, above the e2e specs' 12 because a scenario
    stacks the busy frame, a filter *and* the CRT pass) and the heap delta are the sharp gates;
    `RENDER_P95_BUDGET_MS = 16` is deliberately loose, because the bench renders through
    SwiftShader on whatever machine runs it — it catches a structural regression, not a Mali-G51
    prediction. Measured over two runs: p95 2.4–3.2 ms, 4–7 draw calls, heap 325–485 KB over
    600 frames. A leaky fixture in the same file proves the heap gate fails when it should.
  - **The claimed load is a per-frame floor, not the last frame's reading** (review round 1). The
    harness reports the *smallest* live bullet / point-item / particle count any measured frame
    carried, and the scenarios assert those floors. Getting the item pool genuinely full needed the
    tick reordered: a cancelled bullet only marks its slot dead (`pools.flushAll()` in the step's
    removal phase frees it), so the screen clear runs *before* `step()` and the bullet pool is
    topped up *after* it — and the clear re-runs on every tick that freed an item slot, where one
    clear per half-pool had let the item pool sawtooth 512 → 256. Every measured frame now carries
    512 of 512 bullets, ≥ 489 of 512 point items (the rest reached the score during that tick) and
    ≥ 489 of 512 particles.
  - **What the bench already settled** (recorded in `docs/dev/input-probe-results.md` §11.3):
    **655–659 of 660 frames rebuild the scene's whole instruction set** — F1's mechanism confirmed
    against a real browser rather than Pixi's source; CRT `light` costs what CRT `full` costs and
    pools the same target (F2); and a 384×216 filter pass really is pooled as 512×256 (F3).
  - **CI needs the browser installed** (review round 1). The `build · benchmark` job now runs
    `pnpm exec playwright install --with-deps chromium` between the build and the bench, exactly as
    the e2e jobs do — `pnpm install` downloads no browser (Playwright ships no postinstall script
    and the repo sets no `pnpm.onlyBuiltDependencies`), and `--use-angle=swiftshader` needs the
    system libraries `--with-deps` brings. The job's `timeout-minutes` went 15 → 25 for the extra
    Chromium time.
  - **F8's dev switch is two switches, because the TV has no query string.** `apps/web` reads
    `?gl=2` (`webGLVersionFromSearch`, new in `@shmup/shell` `boot`); `apps/tizen` reads
    `localStorage['shmup-cup:gl']` (`WEBGL_VERSION_KEY`) — but only in a build that has the debug
    tools, so the release bundle never looks at it and the `APP_JS_GZIP_BUDGET` is untouched.
    WebGL1 stays the shipped default everywhere.
  - **Still manual (hardware):** the owner's §4 / §8.4 measurement table M1–M8. The recipe is
    `docs/dev/rendering-and-shell.md` § "Measuring on the TV" and the numbers land in
    `docs/dev/input-probe-results.md` §11, whose baseline and per-measurement tables are already
    there to be filled in. Nothing in this step is blocked on it: M3-02d and M3-02e are gated by
    the headless bench.
  - **Deliberately not done** (it belongs to M3-02d / M3-02e, and an instrument must not fix what
    it measures): no CRT rewrite, no render groups, no boot warm-up frame, no `estimateMemory`
    correction.

### M3-02d — Fold the full-screen effects into their draw passes

- **Goal:** make the CRT and Mode-7 effects cost one draw call each instead of a pooled render target plus two passes,
  free ~17 MB of VRAM at 1080p, and stop shader compiles and buffer growth happening mid-gameplay.
  **Depends on:** M3-02c (its headless render bench is the before/after gate; the owner's device numbers confirm it
  afterwards and are not a precondition).
- **Source of truth:** [`docs/dev/render-performance-review.md`](docs/dev/render-performance-review.md) findings
  **F2**, **F6**, **F3**, **F4**, **F5**.
- **Scope:**
  - **F2 — CRT.** It is attached as a filter to the pass-2 `screen` container, so at 1920x1080 Pixi pools a
    **2048x2048 RGBA target (16.8 MB)** and runs a second full-screen pass: roughly **2x** the frame's fragment work
    and bandwidth. `light` costs exactly what `full` costs — same program, same passes, different uniforms. The
    "capped at 1080p" comment is inert on the M7, whose web viewport *is* 1080p. Replace the filter with a custom
    pass-2 blit: a `Mesh` + `Shader` built from the existing `CRT_VERTEX` / `CRT_FRAGMENT`, with `uScan` / `uMask` /
    `uVignette` at 0 when CRT is off. Retire `crtResolution` / `CRT_MAX_HEIGHT` or repurpose the constant as a
    documented TV cap.
  - **F6 — Mode-7.** Same shape: it currently renders an `alpha: 0` full-frame sprite into a pooled target purely to
    give the filter an area, and the shader never reads that input. Draw it as a `Mesh` on `BG_MID` instead.
  - **F3 — the memory estimator is wrong.** `packages/shell/src/memory/index.ts` models only
    `frame x (1 + FILTER_TARGETS)` at 384x216: it misses the CRT target entirely (16x the whole modelled figure),
    ignores Pixi's power-of-two rounding (a 384x216 target is pooled as 512x256), and its `FILTER_TARGETS = 2`
    predates M3-02. Add a `potBytes(w, h)` helper and count `1 + active filtered layers + mode7 + crt`. This function
    exists to defend the <100 MB budget, so being 16 MB out matters.
  - **F4 / F5 — boot warm-up.** GL programs compile on first *draw*, not at construction, so the layer-effect, Mode-7
    and CRT programs link mid-stage (a 5–50 ms hitch on a Mali-G51, exactly at a dramatic moment); and Pixi allocates
    a `BatchableSprite` per sprite on its first ever draw while its attribute buffer doubles from 16 bytes, so the
    first frame busier than any before it allocates and copies inside `renderer.render()`. Add one throwaway warm-up
    frame behind the loading screen: every filter the bound world can use attached, every pooled sprite drawn once.
    Never present it; do not disturb `lastTick` or effect state.
- **Acceptance:** `test/e2e/mode7.spec.ts` and `test/e2e/raster.spec.ts` pass within their draw-call budgets; a unit
  test pins `estimateMemory` against hand-computed power-of-two figures with CRT on and off; M3-02c's render bench
  shows CRT `full` within ~10 % of CRT `off` and no heap growth across the warm-up boundary; **no visual golden
  changes** (this is presentation only — the simulation never sees it).
- **Risk:** the pass-2 rewrite touches the one path every frame goes through. Keep the plain-sprite path behind a flag
  until the bench confirms the new one.
- **Refs:** `shmup_feat.md` §18 (CRT off/light/full, Mode-7 floor), §22 (memory budget); review F2, F3, F4, F5, F6.

### M3-02e — Cut the per-frame scene-graph rebuild

- **Goal:** stop one hidden bullet costing a walk over the whole ~6,400-object scene.
  **Depends on:** M3-02d (and M3-02c's bench, which decides how far this has to go).
- **Source of truth:** [`docs/dev/render-performance-review.md`](docs/dev/render-performance-review.md) findings
  **F1** and **F9**.
- **The mechanism** (certain; the magnitude is what M3-02c measures): in Pixi v8 every `sprite.visible = ...` sets
  `structureDidChange` on the *root* render group, and the renderer then throws away and rebuilds the entire
  instruction set — a full tree walk plus a re-pack of every visible quad — instead of taking the cheap "update only
  what moved" path. Our draw path toggles `visible` in every binding, every frame.
- **Scope, in the order the measurements justify — stop as soon as the bench says it is enough:**
  1. **Render groups** for the big sub-trees, since Pixi does not descend into a child render group: the terrain grid
     (up to 1,274 tiles), the enemy-bullet and point-item bindings, the particle container, the HUD and UI quad pools.
     Each group is a batch boundary, so draw calls rise by roughly the number of groups — raise `DRAW_CALL_BUDGET` in
     the two e2e specs **deliberately**, recording the new number in `shmup_feat.md` §22's budget line.
  2. If that is not enough, **park unused slots as degenerate quads** (scale 0, texture unchanged) instead of
     `visible = false`, so the structure stays stable. Keep `visible` for whole containers, which flip rarely.
  3. Only if 1 + 2 still fall short, **`ParticleContainer`** for the enemy-bullet, point-item and particle pools —
     `dynamicProperties: { position: true, uvs: true, ... }` (v8 API: the widely-copied `maxSize` / `properties` form
     is v7, and `uvs: false` would freeze every bullet on one atlas frame), `autoGarbageCollect = false`, and a
     bundle-size check. This is the review's least-certain recommendation; treat it as a last resort.
  - **F9 (opportunistic):** the background, flash, dim and Mode-7 sprites use `Texture.WHITE` while everything else
    draws from the atlas page; the atlas already has `ui/pixel`. Using it makes the low-res pass single-texture. It
    saves no draw call today — do it only if it falls out of the work above.
- **Acceptance:** M3-02c's render bench shows a measured drop in render p95 on the worst-case frame and the overlay's
  structure-rebuild counter falls; every render-pixi allocation guard still passes; **golden replays unchanged**.
- **Refs:** `shmup_feat.md` §22, decision D19, `docs/dev/conventions.md` "zero allocation in hot paths"; review F1, F9.

### M3-03 — Reach: localization, more platforms, tracker music

- **Goal:** more players and platforms. **Depends on:** M3-02e.
- **Scope:** localization via the M2-16 string tables + CJK bitmap font atlases; LG webOS adapter (`apps/webos`, Back =
  461, `appinfo.json`); public web / itch.io build; Steamworks (`steam.ts` via steamworks-ffi-node: achievements, cloud
  saves) and Steam Deck verification; chiptune3 (libopenmpt WASM + AudioWorklet) benchmark and optional tracker-music
  path; real-asset hand-off guide (Aseprite / Furnace → pipeline) and store submission (Seller Office, alpha test).
- **Acceptance:** adapter tests with fakes, string coverage per language, audio path selection tests.
- **Refs:** `shmup_feat.md` §21 (localization), §23 (webOS, Electron/Steam, web); `shmup_tech.md` §3.3, §4.3, §4.8.

---

## 8. Manual verification checklist (user)

Agents cannot touch the monitors, the Tizen CLI or the certificate. These checks are yours; each lists where results
go. Do them on **both** M7 monitors where it says so.

### 8.1 One-time Windows desktop setup

- [ ] Git, Node 24 (≥ 24.15), `npm i -g pnpm@latest` (must print 12.x), clone the repo, `pnpm install`.
- [ ] Tizen Studio **or** VS Code + Samsung Tizen extension; `tizen` and `sdb` on `PATH` (or set `TIZEN_CLI` / `SDB`).
- [ ] Samsung certificate profile: **author** certificate (back it up — every future update needs it) + **distributor**
      certificate listing **both monitors' DUIDs**. Note the profile name (`TIZEN_PROFILE`).
- [ ] Each monitor: Apps → `12345` (Color/Number pad or SmartThings virtual remote) → Developer Mode ON → host IP = the
      desktop's IP → restart the monitor. Turn **Auto Source Switch+** off.
- [ ] Details: [`docs/client/install-on-tv.md`](docs/client/install-on-tv.md).

### 8.2 Input probe protocol (do this first — it tunes the controls)

> **Done 2026-09-15** on both monitors, with the log server — results in
> [`docs/dev/input-probe-results.md`](docs/dev/input-probe-results.md), raw logs in `tools/input-probe/results/`.
> The probe's on-screen timing verdicts were wrong on Tizen 5.5 (whole-second `event.timeStamp`); the write-up
> re-times the logs, and **M3-02b fixed the probe** — `chooseEventTime` always returns handler time now, so a new run
> shows right verdicts (and `NO — not delivered` where the hardware swallows a key). The results were applied
> (profile values *and* the code changes they turned out to need) in plan step **M3-02b**; the recipe table below is
> history. Still open: the 240-fps latency video (only a 30 fps one exists), two gamepads at once — both on the §8.4
> list.

- [x] Package and deploy the probe (cmd.exe): `cd tools\input-probe`, `npm install`, `set TIZEN_PROFILE=<profile>`,
      `set TV_IP=<ip1>,<ip2>`, `npm run package`, `npm run deploy`. Optional log server: `npm run log-server` and build
      with `VITE_REPORT_URL=http://<desktop-ip>:8787`.
- [x] Run the protocol in [`docs/client/input-probe.md`](docs/client/input-probe.md) on both monitors: taps; 3-s holds
      of → and ↑; diagonal attempt; OK while holding an arrow; every extra key; 240-fps video of the flash box (~10 OK
      taps) *(open — 30 fps only)*; gamepad(s) *(one DualShock 4)*; Home and return *(monitor B)*.
- [x] Record the verdicts in `shmup_tech.md` §2.7, then apply them to `content/input/remote-profiles.json` *(the
      applying is M3-02b; the file is `content/input/remote.input-profiles.json`)*:

**What the run actually gave** (M3-02b, so the table below is kept only as the recipe it was): diagonals **NO —
not delivered**, repeats **flagless keydowns with no fake pairs** ⇒ `releaseDebounceTicks: 0`, OK while an arrow is
held **not delivered** ⇒ the new `singleKey: true` knob, every `registerKey` accepted ⇒ `Guide` and `Extra` added to
`register` (never the volume keys), viewport 1920×1080 with WebGL 1 + 2.

| Probe verdict | Set in the `tizen-remote-safe` profile |
|---|---|
| Diagonals **YES** | make `tizen-remote-diagonal` the Tizen default (or set `diagonals: 'combine'`, which is already the default) |
| Diagonals **NO / replaced** | keep `combine` (harmless) — the game is already 4-way-dodgeable |
| Key repeat = **fake keyup/keydown pairs**, gap *g* ms | `releaseDebounceTicks = ceil(g / 16.7) + 1` |
| Key repeat = clean / keydown-without-flag | `releaseDebounceTicks = 0` (sharper stops) |
| OK while arrow held = **dropped** | nothing to change (OK is only for rare equips); consider `autoPowerUp` as your default in Options |
| Ch± / Play/Pause registration failed | remove them from `register`; nothing in the game requires them |
| Viewport not 1920×1080 / WebGL2 missing / slow `decodeAudioData` | report it — the defaults already assume the worst case |

### 8.3 Build, package and deploy the game (every milestone)

```bat
git pull
pnpm install
pnpm build
set TIZEN_PROFILE=<profile>
set TV_IP=192.168.1.50
pnpm --filter @shmup/tizen tizen:package
pnpm --filter @shmup/tizen tizen:install
pnpm --filter @shmup/tizen tizen:run
```

Repeat install/run with the second monitor's `TV_IP`. Debug with Chrome DevTools remote inspector (see
[`docs/dev/build-test-deploy.md`](docs/dev/build-test-deploy.md)).

### 8.4 M1 on-device checks (both monitors)

- [ ] Launch to title in **≤ 10 s** (target 5 s); the debug overlay (dev build) shows boot ms, WebGL version, 60 FPS.
- [ ] Picture is crisp ×5 (1920×1080) with no blur, no shimmer while scrolling; bullets stay readable (VA smear check
      against the navy backgrounds).
- [ ] Remote only: title → OK starts; the ship moves on every arrow without stutter while held; equip with OK works;
      zone A is clearable without diagonals; Back pauses; Back on pause resumes; Play/Pause pauses.
- [ ] Back on title → exit confirm → YES closes the app; NO stays.
- [ ] Home during play, then return: game is paused, audio resumes without glitches, no catch-up burst. *(On the M7
      Home is an overlay that fires only `blur`; M3-02b made the lifecycles edge-triggered over hidden ∨ unfocused,
      so this should pass now — the music must be silent while the Home bar is up.)*
- [ ] Audio: SFX feel immediate; the music loop seam is inaudible; WARNING siren plays; volumes persist after relaunch.
- [ ] Hi-score and options persist across relaunch; after reinstalling the same version (update install) they persist.
- [ ] 15 minutes continuous play: no hitches > 1 frame visible in the overlay's frame graph, memory in DevTools < 100 MB.
- [ ] Gamepad and Bluetooth keyboard also work (press a button first to activate the pad).
- [ ] Optional: 240-fps video of a button press → ship reaction to estimate end-to-end latency.

**M3-02b additions (dev build, both monitors — the step's manual list):**

- [ ] Overlay line 6: while flying, only the **second** `TPF` counter climbs (0 / 2 / 3+ stay near zero) and `LOCK`
      shows among the switches; the `RAF` histogram's mass sits in the middle buckets. Photograph the panel per
      monitor. (`__shmupDebug.stats.tickFrames` / `.rafHistogram` in the remote inspector.)
- [ ] Home during play → on return the pause menu is up and the music was silent while the bar was; nothing was
      fast-forwarded.
- [ ] OPTIONS → CONTROLS → INPUT TEST closes on **Back ×3** within ~1.5 s; with > 1.5 s between presses it does not.
      Also: hold an arrow and press OK / another arrow — nothing else lights, the held arrow stays lit.
- [ ] A **240 fps** video of the probe's flash box and one of the game (the latency figure is still open — the first
      video was 30 fps).
- [ ] Optional: re-run the fixed probe (handler-clock timings, the `NO — not delivered` verdicts) and try Back / Ch±
      during an arrow hold, and two gamepads at once.

### 8.5 M2 on-device checks (both monitors)

- [ ] Co-op with remote + gamepad and with two gamepads; P2 drop-in join.
- [ ] Play at least 3 different routes to both final zones; endings and credits display.
- [ ] Attract mode runs unattended for 10 minutes; any remote key returns to the title.
- [ ] Rebinding on remote/gamepad, remote profile switch, one-button preset.
- [ ] `use.game.mode` metadata A/B test: build both config variants (`pnpm --filter @shmup/tizen build` and
      `build:game-mode`), compare 240-fps latency videos; keep the better.
- [ ] 30-minute soak: memory stable < 100 MB, no audio drift; zone transitions ≤ 2 s. Compare DevTools' heap with the
      estimator's 24 MiB heap baseline (`@shmup/shell` `HEAP_BASELINE_BYTES`) and correct it if it is off.
- [ ] Debug build (`build:dev`): after Pause, Ch+ ×3 the overlay's last line shows the monitor's model and firmware
      (`webapis.productinfo`); `__shmupDebug.save.export()` in the remote inspector prints the save.
- [ ] Live reload (`tizen:watch`, M2-17): install its first build, save a change on the desktop — the TV reloads into
      the new build without reinstalling (if the widget cannot open the served page, note it here).
- [ ] Update install over the previous version keeps saves; **uninstall removes** saves (store requirement).
- [ ] M3-02b: a save that still names the retired `tizen-remote-diagonal` profile boots on **REMOTE** with the rest of
      the save intact (CONTROLS shows `REMOTE (DEFAULT)` and the volumes / hi-scores are unchanged).
- [ ] M3-02b: CONTROLS → REBIND KEYS captures **Guide** (the Ch rocker pressed in) and **Extra** (the screen button);
      the volume keys are still refused (`THAT KEY CANNOT BE USED`) and still control the monitor's volume.

### 8.6 Store readiness (end of M2)

- [ ] Tizen mandatory checklist: launch ≤ 10 s, no crash/freeze, Back/Exit behaviour, multitasking via
      `visibilitychange`, resume from Smart Hub, uninstall deletes user data.
- [ ] Trade-dress review of title, logo and key art (no Konami/Taito names, text or look-alikes).
- [ ] TV Seller Office account (Public Seller = US only), alpha test with ≤ 50 DUIDs (M70A is in the 2020 group).

---

## 9. Feature coverage map

| `shmup_feat.md` section | P0 → step | P1 → step | P2 → step |
|---|---|---|---|
| §3 Display & timing | M1-04, M1-06, M1-16 (pause on hidden) | M2-08 (scale modes), M2-17 (>60 Hz) | M3-02, M3-02b (vsync lock, pause on blur) |
| §4 Controls & input | M1-05, M1-10 (autofire), M1-11 | M2-06, M2-16 | M3-01, M3-02b (measured remote) |
| §5 Player ship | M1-06, M1-12 | M2-05, M2-10 | — |
| §6 Power-ups | M1-11 | M2-03, M2-05 | — |
| §7 Weapons | M1-10 | M2-03, M2-05 | M3-01, M3-02 |
| §8 Options | M1-10 | M2-04 | M3-01 |
| §9 Shields | M1-11 | M2-04, M2-05 | — |
| §10 Death & checkpoints | M1-12 | M2-01, M2-15 | M3-02 |
| §11 Enemies | M1-08, M1-09 | M2-01, M2-04, M2-07 | — |
| §12 Bullets & patterns | M1-09 | M2-02 | — |
| §13 Bosses | M1-13 | M2-09 | M3-02 |
| §14 Stages | M1-07, M1-18 | M2-07, M2-10 … M2-14 | M3-02 |
| §15 Scoring, rank | M1-12 | M2-01, M2-15 | M3-01 |
| §16 Modes | M1-16 | M2-05, M2-06, M2-15 | M3-01 |
| §17 Screens, HUD, UI kit | M1-16, M1-17 | M2-10, M2-15, M2-16 | — |
| §18 Visuals | M1-03, M1-04, M1-14 | M2-08 | M3-02 |
| §19 Audio | M1-15 | M2-11 … M2-14 (tracks) | M3-03 |
| §20 Game feel | M1-14 | M2-08 | — |
| §21 Options, saves, replays, accessibility | M1-17 | M1-19, M2-15, M2-16 | M3-01, M3-03 |
| §22 Engine | M1-01 … M1-09, M1-19 | M2-18 | M3-02 |
| §23 Platform | M1-04, M1-16, M1-17 | M2-17 | M3-03 |
| §24 Dev tooling | M1-19 | M2-07 (Tiled), M2-17 (live reload), M2-18 | — |
| §25 Assets | M1-03 (+ every content step) | M2-11 … M2-14 | M3-03 (real assets) |

---

## 10. Risks & fallbacks

| Risk | Detection | Fallback |
|---|---|---|
| PixiJS v8 misbehaves on the M7 GPU / Chromium 69 | M1-04 manual check, e2e on `file://` | Replace `render-pixi` with a ~500-line WebGL1 batcher (twgl.js) behind the same `IRenderer` + batch-view contract |
| Remote cannot hold keys reliably (stutter) | Input probe, M1-05 tests | Raise `releaseDebounceTicks` in the profile; design already 4-way. *Measured 2026-09-15: holds are clean (no fake pairs) — debounce 0 in M3-02b* |
| rAF jitter on the M7 double-steps the fixed-step loop (measured 2026-09-15) | Probe frame stats; M3-02b's ticks-per-frame counters on device | Vsync-locked tick policy (M3-02b); if the counters still show 0/2-tick frames, turn on render interpolation for 60 Hz too |
| Frame budget blown on the Kant-SU2 SoC | Debug overlay tick/render ms; `pnpm bench` trends | Lower particle cap, fewer parallax layers, smaller bullet budget per zone (data) |
| Memory > 100 MB with real music | M2-17 estimator, on-device DevTools | 32-kHz mono decode, shorter loops, or `<audio>` streaming for long tracks |
| Golden replays churn on every change | CI | Re-bless in the same commit with a reason; keep golden runs short (≤ 3 min of play) |
| Determinism breaks across engines | M2-18 Chromium vs Firefox hashes | Hunt with periodic hashes in replays; replace the offending math with tables |
| Content steps too large for one session | Step review | Split a zone step into "stage + enemies" and "boss + music" sub-steps (same ids with `a`/`b` suffix) |
