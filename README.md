# Shmup Cup

A modern TypeScript 2D horizontal-scrolling shoot-'em-up in the spirit of **Gradius III** and **Darius Twin** —
retro SNES-era look, fast and fluid 60 fps gameplay — targeting **Samsung Tizen** (TVs / Smart Monitors, Tizen 5.5+),
with the browser and Electron as additional targets.

**Status:** the [implementation plan](shmup_plan.md) is approved and under way; progress per
step is tracked in [`shmup_progress.md`](shmup_progress.md).
The monorepo skeleton is in place (every planned system has a module with its API declared
and TSDoc-documented) and the **engine foundations** are implemented: seeded RNG streams,
committed trigonometry tables with binary angles, the sim → presentation event queue and the
zero-GC pools ([developer guide](docs/dev/engine-foundations.md)). **Game data** is
schema-validated JSON under [`content/`](content/README.md) — the KESTREL ship, the Type A
weapons, the test-range stage with its terrain tileset, enemy roster and movement paths, and
the boss range with its test boss, the particle presets, and the sound effects and music so far — checked by `pnpm content:check`, served to the app builds as the virtual
module `virtual:shmup-content` and loaded by `loadContent()` with every string id resolved
to a number ([developer guide](docs/dev/content-data.md)). **Placeholder art** is code:
sprite pixel maps under [`assets/source/`](assets/README.md), seeded procedural generators
and an original 6×8 pixel font are packed by `pnpm assets` into a texture atlas plus
manifest (the KESTREL, shots, seven enemies, boss parts, bullets, laser beams, explosions, items,
particles, HUD pieces, the title logo, terrain tiles, star layers), served to the builds as `virtual:shmup-assets`;
real art can later replace any frame by name ([developer guide](docs/dev/asset-pipeline.md)).
Both apps now boot through the shared browser shell [`@shmup/shell`](packages/shell/README.md)
(M1-04): it validates the content, loads the atlas pages behind a loading bar (or shows a boot
error screen listing every problem), and renders the core's render contract — sprite batches,
bitmap text, HUD / UI command lists — with zero per-frame allocation
([developer guide](docs/dev/rendering-and-shell.md)). `pnpm test:e2e` boots the web build and
the Tizen `dist/` (via `file://`) in headless Chromium.
**The simulation World runs** (M1-06): `createWorld` / `stepWorld` advance one gameplay
session through the fixed 9-phase tick pipeline (input → players → stage → scripts →
movement → collision → damage → removal → fx, with deterministic hit-stop), the **KESTREL
flies** under remote, keyboard or gamepad control (six speed levels from content, diagonals ×
0.7071, no inertia, clamped to the playfield, banking, a 40-tick fly-in), the collision toolkit
(closed shape tests, layer masks, a counting-sort grid whose queries equal brute force) is in
place, and `hashWorld` fingerprints the simulated state for lockstep and replay tests. An
allocation-guard test keeps the tick free of garbage. **Free flight** — the ship over an empty
starfield between the HUD bars — was the start-up picture until M1-16 and is now
`?scene=flight`, with the M1-04 sprite showcase at `?scene=showcase` and the test pattern at
`?scene=calibration` ([developer guide](docs/dev/sim-world.md),
[what testers should check](docs/client/preview-build.md)).
**Stages scroll** (M1-07): a stage file carries a scripted camera path (speed keys with
linear ramps, eased vertical pans, scroll locks that stop the camera exactly), invisible
checkpoints with a deterministic restart, parallax star bands and tile terrain — generated at
load by a deterministic heightfield generator (or given as RLE rows) over a
[tileset](content/tilesets/README.md) whose per-tile column-height masks give pixel-exact
slopes. The stage runner fires the sorted event timeline through a cursor, the World tests
the ship's terrain box against the tiles (a crash is a death since M1-12), and the renderer draws the terrain as a ring-buffered sprite grid. Fly the dev stage
with `pnpm dev` and `?stage=test-range` ([developer guide](docs/dev/stage-runtime.md)).
**Enemies fly** (M1-08): data-defined enemies from [`content/enemies/`](content/enemies/README.md)
are spawned by the stage timeline — alone or as formations whose members fly one behind the
other and drop a capsule (and pay a bonus) only when every one of them is destroyed. What an
enemy does is a TypeScript **behaviour coroutine** that sleeps between decisions (resumed only
on the tick it wakes) — the M1 roster covers popcorn, formation fliers, capsule carriers,
floor and ceiling turrets, walkers, hatches that release fighters, rammers and orbiters —
while per-tick **movers** do the moving: straight, sine waves, centripetal Catmull-Rom
[paths](content/paths/README.md) baked at load into 1-px arc-length tables, enter-hold-leave
waypoints, follow-the-leader, ground crawling over the terrain slopes, capped-turn homing and
aimed dashes. Off-screen / settle rules, contact with the ship, hit flash, explosion events and
the tick's kill / drop outcomes are in place; 64 scripted enemies stay within the allocation
guard, and enemies are part of `hashWorld`. The test stage now sends all eight behaviours at
you ([developer guide](docs/dev/enemies-and-behaviors.md)).
**Enemies shoot back** (M1-09): a 512-slot enemy bullet pool — which is also the renderer's
enemy-bullet sprite batch — with acceleration, turning, delayed launches, mid-flight changes
and capped homing; bullets ride the camera, die on the rock or just off screen, and are aimed
on 32 directions (decision D17). Behaviour scripts fire through rank-scaled pattern primitives
(aimed, N-way, ring, spiral, stack, seeded spray, homing, delayed) that only fire from an enemy
on screen and settled; the turrets, walkers and orbiters of the test stage now shoot aimed
shots, three-way fans and rings. Telegraphed lasers (a blinking warning line, then a beam
whose hitbox exists only at full width) and bullet cancel with sparkle events are in place (the
bosses fire both since M1-13), and rank runs at the difficulty's constant base (Normal = 2) with curves
that growth will scale in M2. A bullet or laser hit costs a ship since M1-12
([developer guide](docs/dev/bullets-and-patterns.md), [what testers should check](docs/client/preview-build.md#enemy-bullets)).
**The ship shoots back** (M1-10): the KESTREL fires on its own — always-on autofire, the
remote-first rule — with the Gradius-style Type A arsenal defined in
[`content/weapons/`](content/weapons/README.md): a main shot limited to two on screen, the
Double's forward-and-climbing pair, a piercing Laser that grows to 64 px, follows the ship up
and down and hurts each enemy at most every sixth tick, and a Missile that drops to the ground
and slides along the slopes until a wall stops it. Shots live in a 96-slot pool, ride the
scroll, die on the rock and hit enemies through the collision grid (armoured parts clink, every
kill is credited to a player — the score since M1-12). Up to four **Options** follow the ship's
flown path — bunched while it idles during scrolling, spread out when it moves — and copy every
weapon with their own caps; `?loadout=full` in a browser starts fully powered
([developer guide](docs/dev/weapons-and-options.md), [what testers should check](docs/client/preview-build.md#your-weapons)).
**The ship powers up** (M1-11): the Gradius-style **power meter** — `SPEED UP | MISSILE |
DOUBLE | LASER | OPTION | ? | !` — per player. Capsule carriers and formations wiped out to the
last member drop blinking **power capsules** (world-space, a 16-px pickup magnet pulls them in,
every quick pickup counts, 300 points each — scored since M1-12); each capsule moves the
highlight one slot, and **OK on the remote** (the `PowerUp` action, on its pressed edge only —
holding it never re-equips) takes the highlighted power-up: maxed slots are greyed, Double and
Laser are exclusive, and an optional Auto Power-Up equips a configurable order by itself. The
`?` slot puts up a **Force Field** that absorbs five bullets, lasers or rammed enemies (never
the rock) with short shield-hit i-frames and visible wear; `!` is **Mega Crash**, which cancels
every enemy bullet and destroys every enemy that is not immune. The meter itself is drawn by
the HUD since M1-16 ([developer guide](docs/dev/powerups-and-shields.md), [what testers should check](docs/client/preview-build.md#power-ups)).
**The ship can be lost, and the score counts** (M1-12): a hit the Force Field does not absorb —
rock, an enemy, a bullet or a laser — starts the **death sequence** in the same tick's damage
phase: a life gone, explosion and debris events, an exact 8-tick **hit-stop**, a medium screen
shake, every cancelable enemy bullet and laser cancelled, and the **death penalty** of the
session (decision D6): *Classic* (the default) loses one power level (Option → Double / Laser →
Missile → Speed) and the shield, *Arcade* loses everything and restarts the stage at its last
checkpoint, *Casual* only loses the shield. After its explosion and dead time the ship flies
back in, blinking, and stays invulnerable for 150 ticks once it is under control again; when
no active ship has a life left the World's status is `gameOver`. Per-player **scores** credit
every kill to its killer, a formation's bonus to the killer of its last member and 300 per
capsule — exactly once, clamped at 99,999,990 — with a session hi-score, and the sim-side
game-feel timers (hit-stop, decaying integer shake, flash kinds) push the events the effects of
M1-14 draws. The flight HUD shows the score, `HI`, the spare ships and `GAME OVER`
([developer guide](docs/dev/death-and-scoring.md), [what testers should check](docs/client/preview-build.md#lives-losing-your-ship-and-the-score)).
**Bosses arrive with a WARNING** (M1-13): a boss is an `enemies` entry with a `boss` section —
up to 16 parts attached to each other (translation only), each with its own hit points,
hurtbox, sprite and weak-point rule (always, only after other parts are destroyed, only while
the boss holds it open, or armour), cores whose destruction kills it, and up to 8 phases that
swap the running boss behaviour when the cores' HP falls below a threshold, given parts are
destroyed or time runs out. Its parts share the enemies' hit path (grid ids after the enemy
slots, piercing cooldowns per part); a hit on a part that cannot take damage — or on anything
during the invulnerable fly-in — **clinks**. A stage `warning` event brakes the camera into a
scroll lock, sets the status to `bossWarning` for three seconds of siren pulses (a critical
priority hint), flashes, dim and music stop, and shows the game's own text (`WARNING!!` /
`GIANT HOSTILE "TRIAL WARDEN"` / `CLOSING IN - CODE TW-00`, decision D10) on a band in the
flight scene; then the boss flies in with its theme. Destroying the last core cancels every
bullet, chains explosions for two seconds, ends in a final blast with a 5-tick hit-stop, pays
the boss's points to whoever destroyed it, plays the stage-clear jingle and clears the stage.
The first boss behaviours (`boss.hover`, `boss.lanes` — aimed spreads and telegraphed lane
lasers from the gun parts) and TRIAL WARDEN on the BOSS RANGE (`?stage=test-boss`) exercise it
all ([developer guide](docs/dev/bosses-and-warning.md), [what testers should check](docs/client/preview-build.md#the-boss-range-and-the-warning-browser-only)).
**Hits feel like hits** (M1-14): particle presets in [`content/fx/`](content/fx/README.md) —
explosions larger than the enemy, sparks, debris, clinks, bullet-cancel sparkles, the pickup
ring and a muzzle flash — are bound to the sim's particle cues and to the sounds that imply a
visual, and drawn from a 256-particle pool in world space on its own seeded RNG (never touching
the simulation), below the enemy bullets so an explosion never hides one. The renderer's screen
effects shake the playfield by whole pixels exactly as the sim's shake decays (with a global
off switch), flash it in a colour per kind behind a limit of three flashes a second (and a
reduced-flashing setting), and darken it during the boss WARNING; 16 score popups rise from
every kill (a new `Score` event) and every bonus. Everything runs on simulated ticks, so it
freezes with a paused game, and allocates nothing per frame. `?scene=fx-gallery` cycles through
every preset and effect ([developer guide](docs/dev/fx-and-game-feel.md), [what testers should check](docs/client/preview-build.md#explosions-sparks-shake-and-flashes)).
**The game sounds** (M1-15): every placeholder sound and tune is data in
[`content/audio/`](content/audio/README.md) — a ZzFX-style parameter set per `SFX_CUES` cue (with
a priority tier, an instance cap, a volume and a bus) and original chip songs (AZURE VERGE, the
stage theme with a 6.4-s intro and a 44.8-s loop; BULWARK ASSAULT for the boss; a title theme;
stage-clear and game-over jingles) bound to `MUSIC_CUES`, optionally per stage — rendered while
the game loads by a deterministic pure-TS synth (table sines and seeded noise, bit-identical on
every engine; song rows are whole samples, so loop points are exact and the loop seam equals an
unrolled render). Nothing is rendered or decoded mid-stage: the shell's boot renders the SFX bank
and the running stage's music set (every cue its data names), and an OGG path (XHR +
`OfflineAudioContext(2, 1, 32000)`) is ready for recorded tracks. The sim's `Sfx` / `Music` /
`MusicDuck` events reach an audio engine on the Web Audio buses: a 14-voice SFX manager (per-frame
dedupe, per-cue instance caps, priority stealing, the WARNING siren and the ship's death never
cut), sounds panned from where they happen, and a looping music player with fades and ducking
scheduled as sample-accurate ramps — with no allocation unless a sound starts. In a browser the
sound starts with the first key press; the TV plays from boot (the title theme since M1-16; a
game there flies in open space, which has no stage music yet). `pnpm audio:preview` writes every
sound and song as WAV files
([developer guide](docs/dev/audio.md), [what testers should check](docs/client/preview-build.md#sound-and-music)).
**The game has screens, menus and a HUD** (M1-16): a fixed-depth **scene stack** with deferred
transitions runs the M1 flow — boot → **title** (the procedural SHMUP CUP logo, `PRESS OK`,
START / OPTIONS / EXIT) → **game** (a fresh World per start and per RETRY STAGE, all pushing into
one event queue) ⇄ **pause** (RESUME / RETRY STAGE / QUIT TO TITLE) → **stage clear** (tally,
`TO BE CONTINUED`) / **game over** → title — with a YES / NO dialog focused on NO. Everything is
canvas-drawn by the core into draw lists (no UI framework) and fully navigable with the remote's
D-pad, OK and Back: menus auto-repeat held directions (18 / 6 ticks), buffer a Confirm pressed
while they open, answer to any player, and play their sounds through the same event queue.
**Back** goes through the scenes — game → pause, pause → resume, menus → back, and on the TV the
title's **exit confirmation** → `platform.exit()` only after YES; a platform resume during a
game opens the pause menu. The in-game **HUD** (`1P` / `HI` / `2P`, stock icons, the 7-slot power
meter with its flashing highlight and greyed slots, Force Field pips) is rebuilt only when
something it shows changed, without allocating. The shell's default scene is now this flow;
`createGame` without `options.scenes` keeps bare gameplay for tests and tools
([developer guide](docs/dev/scenes-and-ui.md), [what testers should check](docs/client/preview-build.md#the-title-screen-and-the-menus)).
**Input is remote-first and data-driven** (M1-05): control profiles in
[`content/input/`](content/input/README.md) map keys, remote buttons and gamepad buttons to
actions with separate **game** and **menu** tables, and carry the Samsung remote's quirks as
settings — a release debounce against fake key-up/key-down pairs, diagonal and SOCD policies,
the Tizen keys to register. The TV uses `tizen-remote-safe`, the browser `keyboard-default`
(`?profile=keyboard-remote-emulation` lets a desktop keyboard feel like the remote), so the
input probe's results will change a JSON file, not code
([developer guide](docs/dev/input-profiles.md), [controls](docs/client/controls.md)).
The **input probe** — a diagnostic Tizen app that measures the Samsung remote, gamepads and
display on the real monitors — is built and tested ([`tools/input-probe/`](tools/input-probe/README.md));
it is waiting to be packaged and run on the M7 monitors.

## Documents

| File | Contents |
|---|---|
| [`shmup_feat.md`](shmup_feat.md) | Feature & functionality catalog (P0/P1/P2), design decisions, reference data from both source games |
| [`shmup_tech.md`](shmup_tech.md) | Language/platform verdict, Tizen 5.5 constraints, test-hardware notes, library comparisons, recommended stack |
| [`input_probe_spec.md`](input_probe_spec.md) | Spec for the first spike: a diagnostic Tizen app that measures the Samsung remote / gamepad / display behavior |
| [`shmup_plan.md`](shmup_plan.md) | Implementation plan: resolved design decisions, milestones M1 (vertical slice) → M2 (v1.0) → M3, ordered agent-sized build steps, manual on-device checklist, "as built" notes per step |
| [`shmup_progress.md`](shmup_progress.md) | Execution progress: one row per plan step (status, review rounds, tests, commits, deviations) |
| [`shmup_prompt.md`](shmup_prompt.md) | Paste-into-a-new-session prompt that drives execution of the plan (workflow: build → review/fix loop → tests → docs → CI gate per step, progress in `shmup_progress.md`) |
| [`docs/`](docs/README.md) | Player and developer documentation (start with [`docs/dev/repo-layout.md`](docs/dev/repo-layout.md)) |

Game docs — testers: [preview build (the title screen, menus, HUD and pause menu, the game-over and stage-clear screens, test stage, its enemies and their bullets, your weapons, power-ups, lives and score, the boss and its WARNING, explosions, shake and flashes, sound and music)](docs/client/preview-build.md) ·
[controls](docs/client/controls.md) · [monitor setup & install](docs/client/install-on-tv.md).
Developers: [repo layout](docs/dev/repo-layout.md) · [architecture](docs/dev/architecture.md) ·
[engine foundations](docs/dev/engine-foundations.md) · [content data](docs/dev/content-data.md) ·
[asset pipeline](docs/dev/asset-pipeline.md) ·
[rendering & browser shell](docs/dev/rendering-and-shell.md) ·
[sim World & collision](docs/dev/sim-world.md) ·
[stage runtime](docs/dev/stage-runtime.md) ·
[enemies & behaviours](docs/dev/enemies-and-behaviors.md) ·
[bullets, lasers & patterns](docs/dev/bullets-and-patterns.md) ·
[weapons & Options](docs/dev/weapons-and-options.md) ·
[power-ups & shields](docs/dev/powerups-and-shields.md) ·
[death, respawn & score](docs/dev/death-and-scoring.md) ·
[bosses & the WARNING](docs/dev/bosses-and-warning.md) ·
[FX & game feel](docs/dev/fx-and-game-feel.md) ·
[audio](docs/dev/audio.md) ·
[scenes, menus & HUD](docs/dev/scenes-and-ui.md) ·
[input profiles](docs/dev/input-profiles.md) ·
[API reference](docs/dev/api-reference.md) ·
[build, test & deploy](docs/dev/build-test-deploy.md) · [conventions](docs/dev/conventions.md).

Input probe docs: [tester guide](docs/client/input-probe.md) · [monitor setup & install](docs/client/install-on-tv.md) ·
[developer guide](docs/dev/input-probe.md) · [build / package / deploy README](tools/input-probe/README.md).

## Key decisions so far

- **Language:** TypeScript, shipped as a Tizen web app (`.wgt`).
- **Target:** Tizen 5.5+ (Chromium 69). Test hardware: 2× Samsung Smart Monitor M7 43" (LS43AM702UNXZA, M70A).
- **Primary controller:** the Samsung Smart Remote (gamepad & keyboard also supported).
- **No UI framework** (no React/Vue) in the game — canvas-drawn UI. Vite is the build tool.
- **Recommended stack:** PixiJS v8 (renderer only) + custom fixed-step deterministic loop, custom input/audio/collision, Vite + TypeScript + Vitest, Electron for desktop.
- **Repo:** one pnpm-workspace monorepo (`packages/*`, `apps/*`; `tools/*` stay standalone) orchestrated by Turborepo.

## Quick start

Prerequisites: Node 22.22.2+ or 24.15+ (24 recommended, see `.nvmrc`; Node 23/25 are not
supported) and pnpm 12 (`npm i -g pnpm@latest`; the exact version is pinned in
`package.json` → `packageManager`). pnpm refuses to install or run scripts on other Node
versions (`devEngines.runtime`).

```sh
pnpm -v               # must print 12.x — an older global pnpm fails with ERR_PNPM_BROKEN_LOCKFILE
pnpm install          # set ELECTRON_SKIP_BINARY_DOWNLOAD=1 to skip the Electron binary
pnpm dev              # browser dev app → http://localhost:5173: the title (Enter twice starts a game; Esc pauses), then fly the KESTREL (arrows/WASD, gamepad; the first key press turns the sound on; Enter/C takes a power-up; ?scene=flight skips the title; ?stage=test-range scrolls the test stage, its enemies, their bullets and the power capsules; ?stage=test-boss plays the WARNING and the test boss; ?profile=keyboard-remote-emulation feels like the TV remote; ?scene=showcase / ?scene=calibration / ?scene=fx-gallery)
pnpm lint             # ESLint (typescript-eslint + compat: chrome >= 69)
pnpm typecheck        # tsc --noEmit everywhere
pnpm test             # Vitest per package + repo integration tests
pnpm test:e2e         # build web + Tizen, boot both in headless Chromium (once: pnpm exec playwright install --with-deps chromium)
pnpm build            # packages → dist/, apps/web, apps/tizen (one ES2018 IIFE), apps/electron
pnpm format           # Prettier
pnpm trig:tables      # regenerate the committed core trig tables (a test checks they are current)
pnpm content:check    # validate every JSON under content/ + its sprite names exist in the atlas (part of pnpm test)
pnpm assets           # rebuild the placeholder sprite atlas (automatic before build/dev; skipped when unchanged)
pnpm audio:preview    # render every placeholder sound and song to WAV files in assets/generated/audio-preview/
pnpm clean            # remove build output
```

Samsung TV: `pnpm --filter @shmup/tizen build`, then the `tizen:package` / `tizen:install` /
`tizen:run` scripts on a machine with the Tizen CLI and certificate — step by step in
[`docs/client/install-on-tv.md`](docs/client/install-on-tv.md#installing-the-game-preview); all
variables and the Chromium 69 build contract in
[`docs/dev/build-test-deploy.md`](docs/dev/build-test-deploy.md) and
[`apps/tizen/README.md`](apps/tizen/README.md).

Desktop: `pnpm build && pnpm --filter @shmup/electron start` (needs the Electron binary).

### Input probe (standalone npm project)

```sh
cd tools/input-probe
npm install
npm run dev           # desktop-browser preview → http://localhost:5173 (arrows / Enter / R)
npm run verify        # typecheck + tests + build + Chromium 69 compat check
```

On the Windows desktop with the Tizen CLI and the Samsung certificate (`cmd.exe`):

```bat
cd tools\input-probe
set TIZEN_PROFILE=shmupcup
set TV_IP=192.168.1.50,192.168.1.51
npm run package
npm run deploy
```

`package` builds and signs `dist\InputProbe.wgt`; `deploy` runs `sdb connect` → `tizen install` → `tizen run` for
each monitor.

Then follow the on-device test protocol in [`docs/client/input-probe.md`](docs/client/input-probe.md).

## Repository layout

pnpm workspace (`packages/*`, `apps/*`) + Turborepo. Full annotated tree:
[`docs/dev/repo-layout.md`](docs/dev/repo-layout.md).

| Path | What |
|---|---|
| [`packages/core`](packages/core/README.md) | `@shmup/core` — pure-TS deterministic simulation: the World and its tick pipeline, all game systems, the scene stack and flow, the canvas UI kit and HUD, the `Platform` interface |
| [`packages/render-pixi`](packages/render-pixi/README.md) | `@shmup/render-pixi` — PixiJS v8 renderer (WebGL1, 384×216 → integer upscale); particles, screen shake / flash / dim, score popups |
| [`packages/audio-web`](packages/audio-web/README.md) | `@shmup/audio-web` — Web Audio back-end (interactive latency, buses) and the game's audio: deterministic synth, SFX voice manager, looping music with fades and ducking, the engine fed by sim events |
| [`packages/input-web`](packages/input-web/README.md) | `@shmup/input-web` — keyboard / Samsung remote / gamepad → action snapshots, driven by the input profiles (debounce, diagonal / SOCD policies, game / menu tables) |
| [`packages/shell`](packages/shell/README.md) | `@shmup/shell` — shared browser host of web + Tizen: boot / loading (content, atlas, sounds and the stage's music), boot error screen, event dispatch (game-feel events → renderer, sound events → audio engine), frame loop, the scene flow's view (the default), the free-flight scene, the fx gallery |
| [`apps/web`](apps/web/README.md) | Vite browser dev target (also Electron's renderer) |
| [`apps/tizen`](apps/tizen/README.md) | Samsung Tizen `.wgt` (Chromium 69 classic IIFE build, config.xml, CLI scripts) |
| [`apps/electron`](apps/electron/README.md) | Electron desktop shell |
| [`content/`](content/README.md) | Game data: player ships, stages, terrain tilesets, enemies, movement paths, weapons, input profiles, particle presets, sound effects and music (JSON, `formatVersion` 1) |
| `types/` | Ambient declarations for the Vite virtual modules (`virtual:shmup-content`, `virtual:shmup-assets`) |
| [`assets/`](assets/README.md) | Art/audio sources (`source/`: sprite pixel maps, fonts) and pipeline output (`generated/`: atlas pages + manifest, ignored) |
| [`scripts/`](scripts/README.md) | Repo-level Node scripts |
| [`test/`](test/README.md) | Cross-package integration tests; `test/e2e/` browser smoke tests (Playwright) |
| [`docs/`](docs/README.md) | Player (`client/`) and developer (`dev/`) documentation |
| `tools/` | Standalone dev tools with their own npm projects (not workspace members) |
| [`tools/input-probe`](tools/input-probe/README.md) | Input probe `.wgt`: remote / gamepad / display diagnostics for the M7 monitors (npm, Vite, Vitest; log server) |

Toolchain note: TypeScript is pinned to **6.0.x** — TypeScript 7 (native) has no JS API
until 7.1 and typescript-eslint 8.x requires `typescript < 6.1`. The Node floor is
`^22.22.2 || ^24.15.0 || >=26` rather than the original `>=20` because the pinned dev
toolchain requires it: Vitest 5 (`^22.12 || ^24 || >=26`), Electron 44 (`>=22.12`) and
eslint-plugin-jsdoc 64 (`^22.22.2 || >=24.15`). This only affects the machines that build
the game — the shipped Tizen bundle still targets Chromium 69.

## Next step

Code: plan step **M1-17** (saves, audio options & platform integration: `SaveData` v1 with
migrations and a corrupt-save fallback, persisted hi-scores and options, an Options screen with
MASTER / MUSIC / SFX sliders and the remote-profile choice, the saved hi-score and volumes applied
at boot) — the per-step status board is [`shmup_progress.md`](shmup_progress.md).

On hardware (unchanged, and still the gate for the remote control scheme): package and
deploy the input probe from the **Windows desktop** that sits on the same LAN as the monitors and holds
the Samsung certificate profile, run the test protocol on both monitors, and record the results in `shmup_tech.md`
§2.7 (they decide the remote control scheme in `shmup_feat.md` §4). Since M1-05 the verdicts
become edits to `content/input/remote.input-profiles.json` (`releaseDebounceTicks`,
`diagonals`, `register`) — recipes in [`content/input/README.md`](content/input/README.md).
Since M1-06 the preview build is worth installing too: flying the KESTREL with the real remote
is the first hands-on check of the control scheme — and since M1-16 moving through the title and
pause menus and quitting with Back (checklist in
[`docs/client/preview-build.md`](docs/client/preview-build.md#on-the-samsung-smart-monitor--tv)).

Desktop prerequisites: Git, Node 24 (22.12+), Tizen Studio **or** VS Code + Samsung Tizen extension (with a Samsung
certificate profile whose distributor cert includes both monitors' DUIDs), monitors in Developer Mode pointing at the
desktop's IP — step by step in [`docs/client/install-on-tv.md`](docs/client/install-on-tv.md).

## License

[MPL-2.0](LICENSE)
