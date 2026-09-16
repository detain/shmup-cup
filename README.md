# Shmup Cup

A modern TypeScript 2D horizontal-scrolling shoot-'em-up in the spirit of **Gradius III** and **Darius Twin** —
retro SNES-era look, fast and fluid 60 fps gameplay — targeting **Samsung Tizen** (TVs / Smart Monitors, Tizen 5.5+),
with the browser and Electron as additional targets.

## Status

The [implementation plan](shmup_plan.md) is approved and under way. Progress per step is tracked in
[`shmup_progress.md`](shmup_progress.md); milestone **M1 — playable vertical slice** is code-complete
as version **0.1.0** ([`CHANGELOG.md`](CHANGELOG.md)) — its on-device release check on the monitors
is next — and **M2 — complete v1.0** is code-complete as the release candidate **1.0.0-rc.1**
(M2-01 … M2-18: all nine zones, the endings and the credits — the game can be played from the
title to its credits —, the complete arcade front end: the attract loop, the mode select, name
entry, high-score tables, practice and the sound test —, the complete Options screen: autofire
modes, rebinding per device, the input test, the game options, one-button play and every UI label
in a string table —, the platform polish: a first-class desktop app with file saves, a remembered
window and packaging, the TV's game-mode build, device info and live reload, storage quota checks
and the memory budget — and the v1.0 hardening: every route with both ships, the release audit,
cross-engine determinism, the soak, the release checks, the icons). Its on-device checklist
(plan §8.5, §8.6) on the monitors is next — the player-facing guide with the checklist is
[`docs/client/release-candidate.md`](docs/client/release-candidate.md). Milestone **M3 — extras**
has begun: M3-01 added the title's EXTRA menu (boss rush, the caravan score attack, the looping
arcade mode), whole-run replays with a browser, fast-forward and sharing, the Extra Edit weapons,
secret codes and the game-speed / invincibility assists
([`docs/client/extra-modes-and-replays.md`](docs/client/extra-modes-and-replays.md)), M3-02 the
visual & mechanic extras, and **M3-02b tuned the game to the hardware it is played on** — the
measured single-key Samsung remote, Home as a `blur`-only overlay, and a vsync-locked loop for the
M7's jittery 60 Hz ([`docs/dev/input-probe-results.md`](docs/dev/input-probe-results.md)).

<!--
  Keep this section scannable: one entry per plan step, in plan order — a bold headline with the
  step id, a few short sub-bullets, and a final "Docs:" bullet. Details belong in docs/dev/ and
  docs/client/, not here.
-->

### What works so far

- **Monorepo skeleton** — every planned system has a module with its API declared and
  TSDoc-documented.

- **Engine foundations** (M1-01)
  - Seeded RNG streams, committed trigonometry tables with binary angles, the sim → presentation
    event queue and zero-GC pools.
  - Docs: [developer guide](docs/dev/engine-foundations.md)

- **Game data** (M1-02)
  - Schema-validated JSON under [`content/`](content/README.md): the KESTREL ship, the Type A–D
    weapons and presets (M2-03), the test-range stage with its terrain tileset, enemy roster and movement paths, the
    boss range with its test boss, zone A with its roster and boss (M1-18), particle presets, sound
    effects and music, the difficulty presets (M2-01), the bullet pattern library (M2-02) and the
    weapon select's practice range (M2-03).
  - Checked by `pnpm content:check`, served to the builds as the virtual module
    `virtual:shmup-content`, and loaded by `loadContent()` with every string id resolved to a
    number.
  - Docs: [developer guide](docs/dev/content-data.md)

- **Placeholder art is code** (M1-03)
  - Sprite pixel maps under [`assets/source/`](assets/README.md), seeded procedural generators and
    an original 6×8 pixel font are packed by `pnpm assets` into a texture atlas plus manifest,
    served to the builds as `virtual:shmup-assets`.
  - Covers the KESTREL, shots (the Types B–D weapons' since M2-03), nine enemies, boss parts (the test boss's and, since M1-18,
    HALCYON BULWARK's), bullets, laser beams, bending laser segments and their colour-blind
    variants (M2-02), explosions, items, particles, HUD pieces, the title logo, terrain tiles, star
    layers and zone A's planet band.
  - Real art can later replace any frame by name.
  - Docs: [developer guide](docs/dev/asset-pipeline.md)

- **Shared browser shell** (M1-04)
  - Both apps boot through [`@shmup/shell`](packages/shell/README.md): it validates the content and
    loads the atlas pages behind a loading bar — or shows a boot error screen listing every
    problem.
  - Renders the core's render contract (sprite batches, bitmap text, HUD / UI command lists) with
    zero per-frame allocation.
  - `pnpm test:e2e` boots the web build and the Tizen `dist/` (via `file://`) in headless Chromium.
  - Docs: [developer guide](docs/dev/rendering-and-shell.md)

- **Remote-first, data-driven input** (M1-05)
  - Control profiles in [`content/input/`](content/input/README.md) map keys, remote buttons and
    gamepad buttons to actions, with separate **game** and **menu** tables.
  - The Samsung remote's quirks are settings: a release debounce against fake key-up/key-down
    pairs, diagonal and SOCD policies, and the Tizen keys to register.
  - The TV uses `tizen-remote-safe`, the browser `keyboard-default`;
    `?profile=keyboard-remote-emulation` makes a desktop keyboard feel like the remote.
  - The input probe's results will change a JSON file, not code.
  - Docs: [developer guide](docs/dev/input-profiles.md) · [controls](docs/client/controls.md)

- **The simulation World runs** (M1-06)
  - `createWorld` / `stepWorld` advance a session through the fixed 9-phase tick pipeline (input →
    players → stage → scripts → movement → collision → damage → removal → fx), with deterministic
    hit-stop.
  - The **KESTREL flies** under remote, keyboard or gamepad control: six speed levels from content,
    diagonals × 0.7071, no inertia, clamped to the playfield, banking, a 40-tick fly-in.
  - Collision toolkit: closed shape tests, layer masks, and a counting-sort grid whose queries equal
    brute force.
  - `hashWorld` fingerprints the simulated state for lockstep and replay tests; an allocation-guard
    test keeps the tick free of garbage.
  - Dev scenes: `?scene=flight` (free flight — the start-up picture until M1-16),
    `?scene=showcase` (the M1-04 sprite showcase) and `?scene=calibration` (the test pattern).
  - Docs: [developer guide](docs/dev/sim-world.md) ·
    [what testers should check](docs/client/preview-build.md)

- **Stages scroll** (M1-07)
  - A stage file carries a scripted camera path (speed keys with linear ramps, eased vertical pans,
    scroll locks that stop the camera exactly), invisible checkpoints with a deterministic restart,
    parallax star bands and tile terrain.
  - Terrain is generated at load by a deterministic heightfield generator (or given as RLE rows)
    over a [tileset](content/tilesets/README.md) whose per-tile column-height masks give pixel-exact
    slopes.
  - The stage runner fires the sorted event timeline through a cursor; the ship's terrain box is
    tested against the tiles (a crash is a death since M1-12); the renderer draws the terrain as a
    ring-buffered sprite grid.
  - Try it: `pnpm dev` with `?stage=test-range`.
  - Docs: [developer guide](docs/dev/stage-runtime.md)

- **Enemies fly** (M1-08)
  - Data-defined enemies from [`content/enemies/`](content/enemies/README.md) are spawned by the
    stage timeline — alone, or as formations whose members fly one behind the other and drop a
    capsule (and pay a bonus) only when every one of them is destroyed.
  - An enemy's behaviour is a TypeScript **coroutine** that sleeps between decisions, resumed only
    on the tick it wakes. The M1 roster: popcorn, formation fliers, capsule carriers, floor and
    ceiling turrets, walkers, hatches that release fighters, rammers and orbiters.
  - Per-tick **movers** do the moving: straight, sine waves, centripetal Catmull-Rom
    [paths](content/paths/README.md) baked at load into 1-px arc-length tables, enter-hold-leave
    waypoints, follow-the-leader, ground crawling over the terrain slopes, capped-turn homing and
    aimed dashes.
  - Off-screen / settle rules, contact with the ship, hit flash, explosion events and kill / drop
    outcomes are in place; 64 scripted enemies stay within the allocation guard, and enemies are
    part of `hashWorld`. The test stage sends all eight behaviours at you.
  - Docs: [developer guide](docs/dev/enemies-and-behaviors.md)

- **Enemies shoot back** (M1-09)
  - A 512-slot enemy bullet pool — also the renderer's enemy-bullet sprite batch — with
    acceleration, turning, delayed launches, mid-flight changes and capped homing. Bullets ride the
    camera, die on the rock or just off screen, and are aimed on 32 directions (decision D17).
  - Behaviour scripts fire through rank-scaled pattern primitives (aimed, N-way, ring, spiral,
    stack, seeded spray, homing, delayed), only from an enemy that is on screen and settled; the
    test stage's turrets, walkers and orbiters shoot aimed shots, three-way fans and rings.
  - Telegraphed lasers (a blinking warning line, then a beam whose hitbox exists only at full
    width) and bullet cancel with sparkle events — the bosses fire both since M1-13.
  - Rank runs at the difficulty's constant base (Normal = 2); M2 adds growth. A bullet or laser hit
    costs a ship since M1-12.
  - Docs: [developer guide](docs/dev/bullets-and-patterns.md) ·
    [what testers should check](docs/client/preview-build.md#enemy-bullets)

- **The ship shoots back** (M1-10)
  - Always-on autofire (the remote-first rule) with the Gradius-style Type A arsenal defined in
    [`content/weapons/`](content/weapons/README.md):
    - **Shot** — the main shot, two on screen at most;
    - **Double** — a forward-and-climbing pair;
    - **Laser** — pierces, grows to 64 px, follows the ship up and down, and hurts each enemy at
      most every sixth tick;
    - **Missile** — drops to the ground and slides along the slopes until a wall stops it.
  - Shots live in a 96-slot pool, ride the scroll, die on the rock and hit enemies through the
    collision grid; armoured parts clink, and every kill is credited to a player.
  - Up to four **Options** follow the ship's flown path — bunched while it idles, spread out when
    it moves — and copy every weapon with their own caps.
  - `?loadout=full` in a browser starts fully powered.
  - Docs: [developer guide](docs/dev/weapons-and-options.md) ·
    [what testers should check](docs/client/preview-build.md#your-weapons)

- **The ship powers up** (M1-11)
  - A Gradius-style **power meter** per player: `SPEED UP | MISSILE | DOUBLE | LASER | OPTION | ? | !`
    (drawn by the HUD since M1-16).
  - Capsule carriers and formations wiped out to the last member drop blinking **power capsules**
    (world-space, pulled in by a 16-px pickup magnet, 300 points each); each capsule moves the
    highlight one slot.
  - **OK on the remote** (the `PowerUp` action, on its pressed edge only — holding it never
    re-equips) takes the highlighted power-up. Maxed slots are greyed, Double and Laser are
    exclusive, and an optional Auto Power-Up equips a configurable order by itself.
  - `?` is a **Force Field** that absorbs five bullets, lasers or rammed enemies (never the rock),
    with short shield-hit i-frames and visible wear.
  - `!` is **Mega Crash**: it cancels every enemy bullet and destroys every enemy that is not
    immune.
  - Docs: [developer guide](docs/dev/powerups-and-shields.md) ·
    [what testers should check](docs/client/preview-build.md#power-ups)

- **The ship can be lost, and the score counts** (M1-12)
  - A hit the Force Field does not absorb — rock, an enemy, a bullet or a laser — starts the
    **death sequence** in the same tick's damage phase: a life gone, explosion and debris events,
    an exact 8-tick hit-stop, a medium screen shake, and every cancelable enemy bullet and laser
    cancelled.
  - The session's **death penalty** (decision D6): _Classic_ (the default) loses one power level
    (Option → Double / Laser → Missile → Speed) and the shield, _Arcade_ loses everything and
    restarts the stage at its last checkpoint, _Casual_ only loses the shield.
  - The ship flies back in blinking and stays invulnerable for 150 ticks once under control; when
    no active ship has a life left, the World's status is `gameOver`.
  - Per-player **scores** credit every kill to its killer, a formation's bonus to the killer of its
    last member and 300 per capsule — exactly once, clamped at 99,999,990 — with a session
    hi-score.
  - Sim-side game-feel timers (hit-stop, decaying integer shake, flash kinds) push the events that
    M1-14 draws; the flight HUD shows the score, `HI`, the spare ships and `GAME OVER`.
  - Docs: [developer guide](docs/dev/death-and-scoring.md) ·
    [what testers should check](docs/client/preview-build.md#lives-losing-your-ship-and-the-score)

- **Bosses arrive with a WARNING** (M1-13)
  - A boss is an `enemies` entry with a `boss` section: up to 16 parts attached to each other
    (translation only), each with its own hit points, hurtbox, sprite and weak-point rule (always,
    only after other parts are destroyed, only while the boss holds it open, or armour); cores
    whose destruction kills it; and up to 8 phases that swap the running behaviour when the cores'
    HP falls below a threshold, given parts are destroyed, or time runs out.
  - Parts share the enemies' hit path (grid ids after the enemy slots, piercing cooldowns per
    part); a hit on a part that cannot take damage — or on anything during the invulnerable fly-in
    — **clinks**.
  - A stage `warning` event brakes the camera into a scroll lock and sets the status to
    `bossWarning` for three seconds: siren pulses, flashes, dim, music stop, and the game's own
    banner (`WARNING!!` / `GIANT HOSTILE "TRIAL WARDEN"` / `CLOSING IN - CODE TW-00`, decision
    D10). Then the boss flies in with its theme.
  - Destroying the last core cancels every bullet, chains explosions for two seconds, ends in a
    final blast with a 5-tick hit-stop, pays the boss's points to whoever destroyed it, plays the
    stage-clear jingle and clears the stage.
  - The first boss behaviours (`boss.hover`, `boss.lanes` — aimed spreads and telegraphed lane
    lasers from the gun parts) and TRIAL WARDEN on the BOSS RANGE (`?stage=test-boss`) exercise it
    all.
  - Docs: [developer guide](docs/dev/bosses-and-warning.md) ·
    [what testers should check](docs/client/preview-build.md#the-boss-range-and-the-warning-browser-only)

- **Hits feel like hits** (M1-14)
  - Particle presets in [`content/fx/`](content/fx/README.md) — explosions larger than the enemy,
    sparks, debris, clinks, bullet-cancel sparkles, the pickup ring and a muzzle flash — are bound
    to the sim's particle cues and to the sounds that imply a visual.
  - They are drawn from a 256-particle pool in world space on their own seeded RNG (never touching
    the simulation), below the enemy bullets so an explosion never hides one.
  - Screen effects: whole-pixel shake that follows the sim's decay (with a global off switch),
    per-kind colour flashes limited to three a second (plus a reduced-flashing setting), and a
    darkened playfield during the boss WARNING; 16 score popups rise from every kill (a new `Score`
    event) and every bonus.
  - Everything runs on simulated ticks, so it freezes with a paused game, and allocates nothing
    per frame. `?scene=fx-gallery` cycles through every preset and effect.
  - Docs: [developer guide](docs/dev/fx-and-game-feel.md) ·
    [what testers should check](docs/client/preview-build.md#explosions-sparks-shake-and-flashes)

- **The game sounds** (M1-15)
  - Every placeholder sound and tune is data in [`content/audio/`](content/audio/README.md): a
    ZzFX-style parameter set per `SFX_CUES` cue (priority tier, instance cap, volume, bus), and
    original chip songs bound to `MUSIC_CUES`, optionally per stage — AZURE VERGE (the stage theme:
    6.4-s intro, 44.8-s loop), BULWARK ASSAULT (the boss), a title theme, and stage-clear and
    game-over jingles.
  - Rendered while the game loads by a deterministic pure-TS synth (table sines and seeded noise,
    bit-identical on every engine; song rows are whole samples, so loop points are exact). Nothing
    is rendered or decoded mid-stage; an OGG path (XHR + `OfflineAudioContext(2, 1, 32000)`) is
    ready for recorded tracks.
  - The sim's `Sfx` / `Music` / `MusicDuck` events drive an audio engine on the Web Audio buses: a
    14-voice SFX manager (per-frame dedupe, per-cue instance caps, priority stealing; the WARNING
    siren and the ship's death are never cut), sounds panned from where they happen, and a looping
    music player with fades and ducking as sample-accurate ramps — no allocation unless a sound
    starts.
  - In a browser the sound starts with the first key press; the TV plays from boot (the title
    theme since M1-16, zone A's stage and boss themes since M1-18).
  - `pnpm audio:preview` writes every sound and song as WAV files.
  - Docs: [developer guide](docs/dev/audio.md) ·
    [what testers should check](docs/client/preview-build.md#sound-and-music)

- **Screens, menus and a HUD** (M1-16)
  - A fixed-depth **scene stack** with deferred transitions runs the M1 flow: boot → **title** (the
    procedural SHMUP CUP logo, `PRESS OK`, START / OPTIONS / EXIT; START opens the difficulty menu
    since M2-01) → **game** ⇄ **pause** (RESUME /
    RETRY STAGE / QUIT TO TITLE) → **stage clear** (tally, `TO BE CONTINUED`) or **game over** →
    title, with a YES / NO dialog focused on NO.
  - Everything is canvas-drawn by the core into draw lists (no UI framework) and fully navigable
    with the remote's D-pad, OK and Back: held directions auto-repeat (18 / 6 ticks), a Confirm
    pressed while a menu opens is buffered, any player can answer, and sounds go through the same
    event queue.
  - **Back** walks the scenes — game → pause, pause → resume, menus → back — and on the TV the
    title's **exit confirmation** calls `platform.exit()` only after YES; a platform resume during
    a game opens the pause menu.
  - The in-game **HUD** (`1P` / `HI` / `2P`, stock icons, the 7-slot power meter with its flashing
    highlight and greyed slots, Force Field pips) is rebuilt only when something it shows changed,
    without allocating.
  - The shell's default scene is now this flow; `createGame` without `options.scenes` keeps bare
    gameplay for tests and tools.
  - Docs: [developer guide](docs/dev/scenes-and-ui.md) ·
    [what testers should check](docs/client/preview-build.md#the-title-screen-and-the-menus)

- **Options and saves** (M1-17)
  - **OPTIONS** on the title and in the pause menu opens the Options screen: MASTER / MUSIC / SFX
    sliders (0–10, applied live as bus volumes on a perceptual curve — the SFX slider also drives
    the menu sounds) and **CONTROLS**, the remote / keyboard profile (`REMOTE (DEFAULT)` on the TV
    since M3-02b folded the two remote profiles into one), switched at once; BACK keeps them.
  - A versioned save (`save.v1` in `Platform.storage`) keeps the options, the hi-score tables and
    play stats: forward migrations, field-by-field sanitising, and a corrupt save falls back to
    defaults (the text kept under `save.corrupt`) instead of breaking the boot.
  - The shell reads it before the title and applies the volumes and profile; the game writes it
    only when something changed — when the Options screen closes and when a game ends — so a
    killed TV app loses nothing.
  - Finished games enter the top-10 table (`NEW HI-SCORE` on the game-over screen) and the
    title's `HI` starts from the saved best; the boot time is measured
    (`data-shmup-boot-ms`, shown as `BOOT` in the M1-19 debug overlay).
  - Docs: [developer guide](docs/dev/saves-and-options.md) ·
    [what testers should check](docs/client/preview-build.md#the-options-screen)

- **Zone A, its boss and a 4-way playtest bot** (M1-18)
  - **START plays AZURE VERGE** on every build, the TV included: a 9,000-px zone in five sections
    (popcorn and capsule carriers, fan formations and rammers, a floor-and-ceiling corridor with
    turrets, walkers and hatches, orbiters at 1.5 px/tick, a calm), checkpoints at 0 / 3,500 /
    6,000, a planet-rim parallax band, 28 capsule sources — about 3½ minutes.
  - The boss **HALCYON BULWARK (HB-01)**: an armoured battleship whose four shield plates stand in
    front of its core, and whose two emitters fire telegraphed lane lasers that move with it (new
    boss behaviour `boss.bulwark`), aimed 3-ways once two plates are down, overlapping lanes at
    the end.
  - **4-way design rules** in `pnpm content:check`: no aimed bullet over 2 px/tick, no two
    simultaneous laser lanes closer than 16 px (checked statically and over a whole HB-01 fight),
    ≥ 3 capsule sources within 900 px after every checkpoint.
  - **Headless playtest** (`test/playtest/`): `runStage(stageId, bot, flags)` records and reports a
    run, `replayStage` replays it, and `fourWayBot()` plays like a remote player — never a
    diagonal, a 16-px lane danger scan, OK only for Speed / Missile / Option. With god mode it
    kills the boss and clears the zone in 3–6 minutes (≈ 3.5 min today, also without god mode).
  - Debug stage skip: `GameConfig.stageSkip`, `StageRunner.jumpTo`, `skipToBoss`; the web app's
    `?skip=boss` starts a game right before the WARNING (the e2e smoke reaches the boss with it).
  - Docs: [developer guide](docs/dev/zone-a-and-playtest.md) ·
    [what testers should check](docs/client/preview-build.md#the-first-zone-azure-verge)

- **Debug tools, replays, golden tests and the M1 release** (M1-19)
  - **Debug tools** in dev and test builds only (`__SHMUP_DEV__`; `pnpm build` carries none): god
    mode, hitbox / grid outlines, frame advance with single steps, slow motion ×½ / ×¼, jump to the
    next checkpoint, skip to the boss, and an **overlay** — FPS, tick / render ms, draw calls, pool
    usage, rank, RNG calls, state hash, WebGL version, boot ms, build id and a 60-frame graph.
    F1–F8 in the browser; on the TV's debug build (`pnpm --filter @shmup/tizen build:dev`) the
    remote's **Play/Pause, Ch+, Ch+, Ch+** unlocks them and 1–8 run them. `window.__shmupDebug`
    for the console and the e2e suite.
  - **Replays** (`core/replay`): a header with everything that recreates the start (the whole
    `GameConfig`, stage, checkpoint, god mode as `assisted`, build id), `held | pressed << 16` per
    tick and player — run-length encoded, base64 — and a state hash every 600 ticks; playback
    reports the first diverging tick.
  - **Golden replays** of zone A (`test/golden/`: god mode, Arcade, deaths, the boss) are checked
    by every `pnpm test`; an intended simulation change re-blesses them with `pnpm golden:update`.
  - **Budgets**: `pnpm bench` (20,000 ticks with 512 bullets, 64 enemies, the full loadout and
    lasers — median ≈ 0.12 ms/tick against a 1.0 ms budget, no heap growth; run in CI) and the
    Tizen bundle check (`app.js` 228.6 KB of 350 KB gzipped, atlas pages ≤ 2048², `dist/` ≤ 8 MB).
  - An e2e gameplay smoke on both builds (title → OK → hold the arrows → the game scene, no
    errors), frame-advance helpers that make the scroll checks exact, version **0.1.0**
    everywhere and a [`CHANGELOG.md`](CHANGELOG.md).
  - Docs: [developer guide](docs/dev/debug-and-replays.md) ·
    [the tools and the M1 release check for testers](docs/client/debug-tools.md)

- **Rank, difficulty presets, extends and continues** (M2-01)
  - **Difficulty presets** Easy / Normal / Hard / Arcade as data (`content/rules/difficulty.rules.json`,
    kind `rules`): rank base 0 / 2 / 4 / 6, rank growth, lives 5 / 3 / 3 / 2, continues
    5 / 3 / 2 / 0, death penalty, 16 or 32 aim directions, a bullet speed multiplier;
    `resolveGameConfig` fills the chosen preset under explicit overrides and a replay header
    records every value.
  - **Rank grows**: `base + floor(growth × (8·(loop − 1) + (stage − 1) + power))`, 0–31, at most 16
    on loop 1 — the power term counts Missile, Double / Laser, Options and the shield of the
    strongest ship; recomputed at the end of phase 3, it scales enemy fire rates and bullet speeds.
    Per-enemy **rank modifiers** and **revenge bullets** (zone A's fan fliers from rank 12).
  - **Extends** at 20,000 then every 70,000 points (cap 9, a critical-priority 1UP sound);
    **continues**: a 10-s countdown after the game over, a restart at the last checkpoint with fresh
    lives, the continue count in the score's last digit.
  - A **DIFFICULTY** menu under START (one more OK to start a game) and a hi-score table per
    difficulty; golden replays re-blessed with the same outcomes.
  - Docs: [developer guide](docs/dev/difficulty-and-rank.md) ·
    [what testers should check](docs/client/preview-build.md#difficulty-extra-ships-and-continues)

- **Pattern DSL, bending lasers, bullet cancel & readability** (M2-02)
  - **Bullet patterns as data** ([`content/patterns/`](content/patterns/README.md), kind
    `patterns`): BulletML-inspired actions and bullets — `fire`, `wait` (optionally rank-scaled),
    `repeat`, `changeSpeed`, `changeDirection`, `accel`, `vanish`, `actionRef`, `bulletRef` —
    with `aim` / `absolute` / `relative` / `sequence` directions and expressions over `$rank`,
    `$rand`, `$loop`, `$i` and params, compiled at load by a small recursive-descent parser into
    one `Float64Array` program bank (no `eval`); references inlined, params passed as values.
  - A zero-allocation interpreter (`PatternVm`: 64 enemy emitters + 512 bullet programs in typed
    arrays, hashed) stepped by the script runner — the new `pattern.loop` behaviour — and inside
    the bullet update; DSL patterns fire exactly what the hand-written primitives fire (lockstep
    hashes). The test enemy `sentry` runs `common.spiral`; zone A is unchanged.
  - **Bending lasers**: 8 homing heads recording 64-node rings, hit by chains of overlapping
    circles, drawn as round segment sprites.
  - **Cancel into points**: a boss's death and a Mega Crash turn every cancelled bullet into a
    gold point item that flies to the credited player's score (`bulletCancel` in
    `content/rules/scoring.rules.json`, 10).
  - **Colour-blind bullet palettes**: OPTIONS → **BULLETS** (standard, deuteranopia, protanopia,
    tritanopia — saved, applied live); the asset pipeline draws every bullet, beam and bend again
    as `<sprite>@<palette>`, recoloured and shape-coded; the renderer swaps its sprite tables.
  - Golden replays re-blessed (new bullet fields, the point item pool, cancel points) with the
    same outcomes.
  - Docs: [developer guide](docs/dev/pattern-dsl.md) ·
    [what testers should check](docs/client/preview-build.md#the-options-screen)

- **Meter arsenal: weapon types B–D, Weapon Edit and the weapon select** (M2-03)
  - **Nine new weapons** in `content/weapons/types-b-d.weapons.json` with presets **Type B–D**
    (original names): Spread Bomb (arcs down, bursts into a world-anchored blast that hits twice),
    2-Way Missile, Photon Torpedo (slides and flies on through what it destroys), Tail Gun,
    Vertical, Free Way (second shot in the last 8-way direction held), Ripple Laser (a growing
    ring whose *ring* is the hitbox), Cyclone Laser, Twin Laser.
  - **`GameConfig`** gained `weaponPreset`, `weaponEdit` (Weapon Edit: any weapon per slot),
    `megaChoice` and `shieldChoice` (recorded in replay headers); `withArsenal` applies the
    weapon select's choice; the meter's MISSILE / DOUBLE / LASER equip the session's arsenal and
    the HUD names them after it.
  - **`!` choices**: Mega Crash, NORMAL, SPEED DOWN, LIFE OPTION (spare ships → Options), FULL
    BARRIER; the `?` choice (the Force Field — the other shields came with M2-04).
  - **WEAPON SELECT** screen after the difficulty box (one more OK to start): TYPE A–D / EDIT, the
    slot weapons, `?`, `!`, AUTO and an **editable Auto Power-Up order** (the AUTO ORDER box) —
    remote-navigable, with a **live preview**: a private, silent mini World flying the chosen
    weapons over `content/stages/weapon-range.stage.json`, drawn behind the panel.
  - Golden replays re-blessed (sprite ids, the hashed Free Way direction — same outcomes) and four
    new boss runs cover every new weapon.
  - Docs: [developer guide](docs/dev/meter-arsenal.md) ·
    [what testers should check](docs/client/preview-build.md#choosing-your-weapons)

- **Option & shield variants + Option Hunter** (M2-04)
  - **Option types** (`GameConfig.optionChoice`, the weapon select's new **OPTION** row):
    TRAIL, **SNAKE** (a screen-space chain that is only pulled — it swings out behind and holds
    its shape), **FORMATION** (a `>` that spreads into a `V`), **ROTATE** (an orbit, 20 → 40 px);
    spread / extend with **Special** (remote Ch+) or by holding PowerUp ≥ 15 ticks.
  - **Meter shields** on `?`: the front **Shield**, **Free Shield** (pairs at the last 8-way
    direction, up to four pods) and **Rotate Shield** — pods with 14 hits and i-frames each that
    stop only what touches them — and **Reduce** (2 hits; the hurt radius ⅓ → ⅔ → 1 in every
    hurt-circle test, the terrain box unchanged; rank +2). FULL BARRIER refills pods in place.
  - **Option Hunter**: an enemy flag (`optionHunter`) + behaviour `hunter.option` (rear / front /
    dive): spawns only while someone has Options, with an alarm; armoured and harmless; steals
    the touched Option and the chain behind it (`huntOptions`, phase 7, before the power-ups);
    a Mega Crash or the new rare **blue capsule** (clears the enemies on screen) frees them as
    drifting, re-collectable items. Dev stage `?stage=hunter-range`; zone A unchanged.
  - Golden replays re-blessed (new hashed state, shifted enemy spec indices — same outcomes); four
    new runs cover every Option type and meter shield.
  - Docs: [developer guide](docs/dev/options-shields-hunter.md) ·
    [what testers should check](docs/client/preview-build.md#choosing-your-weapons) ·
    [the hunter range](docs/client/preview-build.md#the-option-hunter-range-browser-only)

- **Direct mode & ship select** (M2-05)
  - **SHIP SELECT** box after the difficulty box (skipped with a single ship): the **KESTREL**
    (power meter → the weapon select) or the new Darius-style **MANTA** (Direct mode → the game at
    once); `GameConfig.shipId` + `powerUpMode: 'direct'` (`withShip`), recorded in replay headers.
  - **Colour items** instead of capsules: the mode-agnostic `drop: "powerup"` (and a `capsule`)
    becomes the stage's next planned item (`directItems`, cycling, never rewound) — red / green
    shot and sub levels, blue the **Arm**, orange 1UP, yellow smart bomb, the octagon switches the
    main-shot family; they drift, bounce and vanish after 600 ticks. Zone A's events unchanged.
  - **9-level shot families** as data (`content/weapons/direct.weapons.json`: BEAM > DISC, LASER >
    WAVE and the sub-weapon), fired as level volleys through direct roles (`direct.bolt`,
    `direct.bomb`); the **Arm** (green 3 / silver 4 / gold 5 hits after 1 / 4 / 9 blue items)
    absorbs terrain too; the **Speed toggle** on Ch−; the Direct death penalty; the rank's power
    term (max 12, like the meter); the HUD's **tier pips**; per-mode hi-score tables.
  - Carriers: six-cube **pincer waves** (`cube.pincer`) and coloured lead carriers — dev stage
    `?stage=direct-range`.
  - Golden replays re-blessed (new hashed state and content — same outcomes); three new MANTA runs.
  - Docs: [developer guide](docs/dev/direct-mode.md) ·
    [what testers should check](docs/client/preview-build.md#choosing-your-ship) ·
    [the MANTA](docs/client/preview-build.md#the-manta-colour-items-weapons-and-the-arm)

- **Two-player simultaneous co-op** (M2-06)
  - Title menu **1 PLAYER** / **2 PLAYERS** / OPTIONS / EXIT (`GameConfig.coop`, `withCoop`,
    recorded in replay headers). Player 2 **drops in** any time with START (`JOIN_ACTIONS`,
    `joinPlayer` in tick phase 1 — also during hit-stop); both fly the session's ship and loadout,
    player 2 in a generated **palette swap** (`<sprite>@p2`, red ↔ blue).
  - Separate lives, scores, meters / items, shields and **per-player continues**: a player out of
    lives leaves play while the other plays on and comes back with START (no stage restart); the
    game is over only when both are out; the CONTINUE? countdown continues whoever presses OK.
    Items go to whoever touches them first, aimed shots target the nearest living ship (P1 on a
    tie), and `coopExtra` (0.5) drops extra items while two ships play.
  - **Device routing by seats** (`WebInput.setSeats` ← `Game.inputSeats`): the remote / keyboard
    is player 1's, a gamepad takes player 2's seat with its first A / START, and the new
    **SPLIT KEYBOARD** profile (`keyboard-split`: WASD + F / G vs arrows + K / L, Enter = player 2's
    START) puts two players on one keyboard in the browser. In menus every device drives player 1;
    seat changes never make phantom presses.
  - Co-op HUD: a blinking `PRESS START`, the bottom bar split into two compact halves,
    `PRESS START` / `GAME OVER` for an out player; both scores on the end screens (`2p` hi-score
    rows); a new join sound.
  - Golden replays re-blessed (new hashed co-op credit and `@p2` sprite names — same outcomes); two
    new co-op runs.
  - Docs: [developer guide](docs/dev/coop.md) ·
    [what testers should check](docs/client/preview-build.md#two-players) ·
    [two-player controls](docs/client/controls.md#two-players)

- **Advanced stage systems & Tiled import** (M2-07)
  - **Destructible tiles** are tileset data (`hp`, `regen`, `score`): player shots damage the
    cell they meet (`DestructibleTerrain`, 512 tracked cells), regenerating walls grow back
    around the ships, and every checkpoint restart rolls the terrain back to the stage's own
    tiles; the renderer re-textures only the changed cells (`TerrainChanges`). `terrain-a` gained
    `brick`, `cube` and `tissue`.
  - **Moving floors / ceilings** (`block` events) live inside every terrain query
    (`TerrainBlocks`, ≤ 16), so ships, shots, bullets and crawlers treat them as rock;
    **falling rocks** ride a new `Ballistic` mover with a proximity trigger and a landing rule.
  - **In-stage branches** (`branches`, any event's `branch`) chosen by **region triggers** the
    ships fly into; camera **holds** (vertical sections), **diagonal pans** (`yOver`) and
    high-speed sections up to 16 px/tick; restarts reproduce all of it.
  - **Gimmick behaviours**: `rock.fall`, `bubble.split`, `volcano.lob`, `field.suction`,
    `tentacle.grab`, `cube.stack` (the seeded cube rush that stacks into walls), with pull fields
    and chains in `world.gimmicks`. Dev stage `?stage=gimmick-range`; zone A unchanged.
  - **`pnpm content:tiled <map.tmj>`** converts a Tiled map (tile layer → RLE rows, objects →
    events at scroll x, polylines → paths) into stage JSON; a committed fixture pins it.
  - Golden replays re-blessed (new hashed state and an engine sprite — zone A's simulation
    unchanged); three new `gimmick-range` runs.
  - Docs: [developer guide](docs/dev/advanced-stages.md) ·
    [what testers should check](docs/client/preview-build.md#the-gimmick-range-browser-only) ·
    [authoring stages](content/stages/README.md#holds-diagonal-pans-and-branches-m2-07)

- **Presentation polish: raster effects, palettes, visual options** (M2-08)
  - **Raster effects** as stage data (`raster`: wavy water, heat haze, line-band parallax floors
    whose strips scroll as one piece) and **palette cycling** (`cycles`: ramps of exact colours in
    the RGBA art), drawn by one **GLSL ES 1.0** filter per layer from a 1 × 216 RGBA8 offset table —
    attached only while an effect is in camera range (2 → 5 → 7 draw calls, budget 12).
  - The **Mega Crash** flash is additive (the picture brightens instead of being covered).
  - **Display options** in OPTIONS, saved and applied at boot and live: **SCALE** (integer / fit /
    stretch — `computeViewport`), **SHAKE**, **FLASHES** (reduced), **HITBOX** (a marker on each
    ship's hurtbox — `WorldView.hitboxes`).
  - **Render interpolation** for displays faster than 60 Hz, switched on by the shell's refresh
    probe (interquartile mean of the rAF deltas, > 70 Hz); off on the TV.
  - Dev stage `?stage=raster-range` with the procedural `bg/sea-swell` and `bg/checker-floor`;
    zone A unchanged. Golden replays re-blessed (two new sprites shift the sprite ids — the
    simulation is unchanged); a new `raster-range` run proves the effects presentation-only.
  - Docs: [developer guide](docs/dev/presentation-polish.md) ·
    [the Options screen for testers](docs/client/preview-build.md#the-options-screen) ·
    [the Raster range](docs/client/preview-build.md#the-raster-range-browser-only) ·
    [authoring effects](content/stages/README.md#raster-effects-and-palette-cycles-m2-08)

- **Advanced bosses: mid-bosses, raids, multi-bosses** (M2-09)
  - **Four boss slots** (part hit ids `64 + slot × 16 + i`, `MAX_HIT_TARGETS` 128); **turned
    parts** — binary-angle transforms from the sine table, spins, circle hurtboxes, heading frames
    instead of rotated sprites (turrets that aim with `aimPart`).
  - **Captains** (mid-bosses, `role: "captain"`): a `boss` event, riding the scrolling camera, a
    short death, no lock, music or stage clear; four archetypes — `captain.ram`,
    `captain.launcher`, `captain.circler`, `captain.crab`.
  - **Battleship raids** larger than the screen: anchored where they enter, the camera following
    boss-relative segments (`StageRunner.follow` — the stage timeline waits), eased back at the
    end; turrets fire only on screen (`boss.raid`).
  - **Double bosses** (turns, the resting half drawn behind, the survivor's enrage), a **boss
    inside a boss**, **time limits** (an escape — `BossState.Escape`, `SimEventKind.BossEscaped`,
    `World.endingFlags`), the **boss HP bar** in the top HUD bar (OPTIONS → BOSS HP, off by
    default) and **boss rushes** (`type: "bossRush"` stages).
  - Dev stages `?stage=captain-range`, `raid-range`, `twin-range`, `gauntlet-range` with the
    procedural `bosses/*` art; zone A unchanged. Golden replays re-blessed (the hash layout —
    same inputs, ticks and outcomes); four new advanced-boss runs.
  - Docs: [developer guide](docs/dev/advanced-bosses.md) ·
    [what testers should check](docs/client/preview-build.md#the-advanced-boss-ranges-browser-only) ·
    [the boss HP bar](docs/client/preview-build.md#the-boss-hp-bar-every-device) ·
    [authoring bosses](content/enemies/README.md#advanced-bosses-m2-09)

- **Zone map, campaign flow, transitions & bonus stages** (M2-10)
  - The **`campaign`** content kind: the 9-zone diamond `A → B|C → D|E → F|G → H|I` (16 routes,
    two final zones), checked as a layered graph so every route reaches a final zone; endings
    picked by the final zone and the run's flags (`selectCampaignEnding`).
  - **Campaign runs** on zone A: every zone a fresh World with the players carried in (score,
    lives, loadout, meter cursor, shield), the rank's stage term per zone, the zone title card, the
    stage-clear **fly-out**, the **zone result tally** (kill rate, boss time bonus), the **ZONE
    MAP** (Up / Down, OK, Back), the next zone's music prepared on the map
    (`SimEventKind.PrepareStage`), a placeholder **ending** card; practice plumbing
    (`startPractice`).
  - **Hidden bonus stages**: `bonus` entrances (a marked gap, all ground targets, a score digit),
    stage type `bonus`, the warp, the lock-out after a death, 1UPs and 1,000-point capsules; dev
    stages `?stage=bonus-range` → `bonus-vault`.
  - Stub zones B–I (zone A's roster, reused bosses); the 4-way bot flies all 16 routes in god mode.
    Golden replays re-blessed (hash layout, ids — zone A's outcomes unchanged); three bonus-stage
    runs added.
  - Docs: [developer guide](docs/dev/campaign-and-bonus-stages.md) ·
    [the zone map for testers](docs/client/preview-build.md#the-zone-map-a-run-through-nine-zones) ·
    [hidden bonus stages](docs/client/preview-build.md#hidden-bonus-stages) ·
    [authoring the map](content/campaign/README.md)

- **Zones B & C** (M2-11)
  - **Zone B, BRINE NEBULA**: splitting bubbles, fish inside bubbles, jellyfish ring-firers, reef
    urchins, wavy raster water over a palette-cycled sea, a riptide, the mid-boss **SPUME HERALD**
    (a captain) and the mechanical fish **GALVANIC MAW** — a `whenOpen` mouth weak point whose jaws
    gape, cutters, and homing rockets launched as shootable minions.
  - **Zone C, DUNE EXPANSE**: sand worms bursting from the dunes, beetles walking on the ceiling,
    dust devils, sand geysers, heat haze, a sandstorm run and the arachnid **SANDGRAVE WIDOW** —
    fangs guarding its head, spider drones, silk-line lasers.
  - Zone B's hidden bonus stage **PEARL GROTTO** behind a marked gap — the first real bonus
    entrance; both zones with their own songs, recoloured tilesets, Direct-mode item plans and
    procedural art (`brine.mjs`, `dune.mjs`).
  - New behaviours `rocket.homing`, `worm.burst`, `boss.maw`, `boss.widow`; `BossPart.restX` /
    `restY` so moved boss parts never drift between phases.
  - The 4-way bot clears both zones in 3–6 minutes; the recovery rule holds at every checkpoint
    (shared `test/playtest/recovery.ts`). Golden replays re-blessed (ids — same inputs, ticks and
    outcomes); five zone B / C runs added.
  - Docs: [developer guide](docs/dev/zones-b-and-c.md) ·
    [zone B for testers](docs/client/preview-build.md#zone-b-brine-nebula) ·
    [zone C for testers](docs/client/preview-build.md#zone-c-dune-expanse) ·
    [authoring enemies](content/enemies/README.md)

- **Zones D & E** (M2-12)
  - **Zone D, MAGMA DEEP**: erupting volcanoes, ember streams and ash-bat swoops over the caldera,
    then **the dive** — a scroll stop that pans the camera 200 px down into the caves of a 400-px-tall
    map —, rocks falling from the cave roofs, a **destructible brick maze** (seven walls, a gap in
    each, shoot through for the shortcut), a lava river over a palette-cycled lake that rises with
    the dive, and the core battleship **CINDER BASTION** — its **rotating shield arms** are plain
    boss parts on a spinning hub, plus attached lane lasers.
  - **Zone E, TEMPEST RIDGE**: storm clouds, rain and jagged peaks in six parallax bands, **rear
    attackers** (kites on rear-entry paths, jets on the new `rear.swoop`) that overtake the ship,
    thunderheads firing needle streaks, a gale run and the seahorse **SQUALL STEED** — a chest that
    opens to launch homing minis.
  - New behaviours `rear.swoop`, `boss.bastion`, `boss.steed`; no engine change. Both zones with their
    own songs, recoloured tilesets, Direct-mode item plans and procedural art (`magma.mjs`,
    `tempest.mjs`).
  - The 4-way bot clears both in 3–6 minutes (and, without god mode, with one death each); its runs
    shaped the balance (gaps in every maze wall, a lower seahorse bob, a tougher core). The content
    and corridor checks measure at the camera's height. Golden replays re-blessed (ids — same inputs,
    ticks and outcomes); five zone D / E runs added. Tizen bundle 313.5 of 350 KB gzip.
  - Docs: [developer guide](docs/dev/zones-d-and-e.md) ·
    [zone D for testers](docs/client/preview-build.md#zone-d-magma-deep) ·
    [zone E for testers](docs/client/preview-build.md#zone-e-tempest-ridge) ·
    [authoring stages](content/stages/README.md)

- **Zones F & G** (M2-13)
  - **Zone F, CELL VAULT**: a pulsing wall of cells, **chasing cells** (the new `cell.chase`: in
    along their row, then after the ship with a capped turn for a while, then straight on), cells
    that **divide** into two chasers when shot, a passage of seven **regenerating tissue walls**
    (shoot a hole and it grows back four seconds later — never into the ship; a 56-px gap in each),
    a garden of **grabbing tentacles** and hovering spore sacs, a pulse run, and the squid **MANTLE
    REGENT** — its two tentacles curl in front of its eye to guard it, and breaking one changes its
    behaviour.
  - **Zone G, PRISM LABYRINTH**: glinting crystal facets, a **crystal labyrinth** of walls from the
    ceiling and the floor in turn, four **seeded cube rushes** that stack onto crystal pillars as
    breakable walls, a refraction run, the crystal core **FACET MONARCH** (its core behind two
    crystals, two tentacle arms waving like claws, lane lasers) and the **second hidden bonus
    stage**, GLIMMER CACHE, behind a `ground` entrance: shoot down all four turrets of the prism
    gallery.
  - New behaviours `cell.chase`, `boss.squid`, `boss.facet` — the bosses on one **curling-arm** rule
    (chains of circle-hit parts turned alike, mirrored, never jumping at a phase change); no engine
    change. Both zones with their own songs, recoloured tilesets, Direct-mode item plans and
    procedural art (`vault.mjs`, `prism.mjs`).
  - The 4-way bot clears both in 3–6 minutes (and, without god mode, with no death); its runs shaped
    the balance (fewer, slower turrets, lenses and sacs hovering at the right edge, pillars for the
    cube rush). The review caught the gallery opening with a turret left standing — a ground enemy
    of an earlier event counted — and the content test now holds every `ground` window to it; the
    test round fixed the arms jumping when a phase inherited a wider curl. Golden replays re-blessed
    (ids — same inputs, ticks and outcomes); eight zone F / G runs added (46 in all). Tizen bundle
    320.3 of 350 KB gzip.
  - Docs: [developer guide](docs/dev/zones-f-and-g.md) ·
    [zone F for testers](docs/client/preview-build.md#zone-f-cell-vault) ·
    [zone G for testers](docs/client/preview-build.md#zone-g-prism-labyrinth) ·
    [authoring stages](content/stages/README.md)

- **Zones H & I, the endings and the credits** (M2-14)
  - **Zone H, IRON CITADEL**, the enemy fortress: running lights chasing along its steel walls,
    floor and ceiling **hatches** releasing drones, a **piston hall** of eleven moving floors and
    ceilings with **laser emitters** (the new `emitter.laser`), a **parade of four earlier bosses in
    reduced form** (BULWARK, MAW, BASTION and REGENT ECHO — mid-bosses that leave after 16 s), a
    core run, and the finale **IRON SOVEREIGN**: four phases — shield plates and lanes, a turning
    and reversing shield wheel with rings, drones, then an overdrive spiral.
  - **Zone I, ABYSSAL THRONE**, the deep: twinkling specks, gulpers, **depth mines** that arm when the
    ship comes near (the new `mine.burst`), eels bursting from a trench, an undertow, and the **ABYSS
    ARK** — a whale-class battleship raid (turret rows, homing hooks) that sails away after 90 s;
    its final blast reveals **THE HOLLOW KING**, an anglerfish with a mouth that opens and a swaying
    lure.
  - **Endings and credits**: a sprite scene per final zone (the citadel falling behind the ship; the
    ship rising out of the deep while the ARK sinks — or sails off after an escape), a dawn for a
    no-death run, a five- or six-line epilogue, the result card, then the credits scrolling to their
    own song — five endings chosen by the final zone and the run's flags (an escape never earns the
    flawless zone I ending — the review fix).
  - Engine: `ScriptApi.sleepUntilNear` (a proximity wake — a waiting mine costs no script wakes) and
    `BossScriptApi.spiral` (a spiral stream the boss system fires itself); `core/behaviors` is
    complete. Six songs (the final bosses on `FinalBoss`, `Ending`, `Credits`), procedural art
    (`citadel.mjs`, `abyss.mjs`, `ending.mjs`), recoloured tilesets, Direct-mode item plans.
  - The 4-way bot clears both in 3–6 minutes (and, without god mode, with no death); every one of
    the 16 routes now ends in a real finale with its ending scene. The test round fixed the ARK's
    hooks and the spiral's heading at a phase change. Golden replays re-blessed (ids and hash
    fields — same inputs, ticks and outcomes); seven zone H / I runs added (53 in all). Tizen bundle
    331.5 of 350 KB gzip.
  - Docs: [developer guide](docs/dev/zones-h-and-i.md) ·
    [zone H for testers](docs/client/preview-build.md#zone-h-iron-citadel) ·
    [zone I for testers](docs/client/preview-build.md#zone-i-abyssal-throne) ·
    [the endings for testers](docs/client/preview-build.md#the-endings-and-the-credits) ·
    [authoring endings and credits](content/campaign/README.md)

- **Front-end screens & attract mode** (M2-15)
  - **Mode select** — the title's menu: 1 PLAYER / 2 PLAYERS / **PRACTICE** / OPTIONS /
    **SOUND TEST** / EXIT (EXIT on the TV only; OPTIONS moved to the fourth row).
  - **Attract loop** — left alone for 12 s on `PRESS OK`, the title hands over to a **demo play**
    (a bundled recording of the 4-way bot, one per zone, played through the replay path with every
    hash checked — silent), the **high-score tables**, an original **story crawl** over sprite scenes,
    then the title; any input returns. The demos are content (`content/demos/`, kind `replay`),
    re-recorded by `pnpm golden:update` and locked by `test/golden/demos.test.ts`.
  - **Name entry** — a score that enters its table is named with three letters using only the four
    directions and OK (the Samsung remote is enough), then the table shows it lit. Tables are kept
    per **difficulty × ship × mode** (1 PLAYER, 2 PLAYERS, PRACTICE; old co-op rows move into their
    own table when a save is read).
  - **Practice** — zone, checkpoint and loadout (STANDARD / FULL POWER), then the usual difficulty /
    ship / weapon select; its scores go to separate tables and never touch the 1P high score.
  - **Sound test** — every music track (loaded on demand, `AudioEngine.playTrack`) and every sound
    effect; the **continue countdown** got a draining bar, the score and a `PRESS OK` prompt.
  - Three review fixes: CHECKPOINT wraps backwards within the zone, the sound test's effects play
    centred, and a practice score no longer leaks into the next game's HI. No simulation change
    (no golden re-bless); Tizen bundle 343.8 of 350 KB gzip.
  - Docs: [developer guide](docs/dev/front-end-and-attract.md) ·
    [the front end for testers](docs/client/preview-build.md#the-front-end-attract-mode-high-scores-practice-and-the-sound-test) ·
    [controls](docs/client/controls.md) · [authoring demos](content/demos/README.md) ·
    [the story](content/campaign/README.md)

- **Options, rebinding & accessibility** (M2-16)
  - **Options regrouped** — MASTER / MUSIC / SFX, then three pages: **CONTROLS**, **DISPLAY** (the
    earlier picture settings, unchanged) and **GAME**.
  - **CONTROLS** — the profile, **AUTOFIRE** always / toggle / hold (a replay-recorded
    `GameConfig.autofireMode`; the TV stays always-on) and **RATE**, **SOCD**, the remote's
    **DEBOUNCE**, **REBIND KEYS / PAD** and an **INPUT TEST** (the game table live; three Pause
    presses — or a one-second hold — leave, M3-02b).
  - **Rebinding** — per device (the key profile in use, the gamepad profile) and binding context,
    with a capture prompt, **conflict detection** (a key another action has is moved, or the two
    swap; nothing required is ever left without a key; Esc / the remote's Back never move; a split
    keyboard's player-2 keys stay player 2's) and **reset** — stored per profile in the save,
    applied at once (`@shmup/input-web` `rebind`, the core `RebindPanel`, the shell's
    `createShellControls`).
  - **GAME** — difficulty (now remembered), lives 1–5, death penalty, Auto Power-Up, pickup magnet
    and the **one-button preset** (autofire + Auto Power-Up + casual), folded into the next games'
    configs — a run keeps the config it began with, RETRY STAGE takes the new options.
  - **String table** — every canvas-UI label in `content/strings/en.strings.json` (kind `strings`,
    checked against the built-in English table and a source scan) — the infrastructure for M3's
    localization. **Save v2** with a migration from v1 (which also moves old co-op / practice rows).
  - Two review rounds: a run no longer switches difficulty or config when options change from the
    pause menu, the difficulty menu shows the LIVES the game gets; the rebinding names keys the way
    the profile binds them (`code:` / `key:`) and keeps split-keyboard keys to player 2. Golden
    replays and demos re-blessed for the header only (`autofireMode`); two autofire goldens added
    (55 in all). UI string slots 384 → 512; Tizen bundle ≈ 359 of 384 KB gzip (budget raised from 350).
  - Docs: [developer guide](docs/dev/options-rebinding-and-accessibility.md) ·
    [the Options screen for testers](docs/client/preview-build.md#the-options-screen) ·
    [rebinding and the CONTROLS page](docs/client/controls.md#rebinding-keys-and-buttons) ·
    [saves](docs/dev/saves-and-options.md) · [translating the UI](content/strings/README.md)

- **Platform polish: Electron, Tizen extras, storage** (M2-17)
  - **Desktop saves** — JSON files in the user-data folder (`save.v1.json`, `window.json`), written
    atomically (temp file + fsync + rename) with the previous text kept as a `.bak` and read back
    when a file is missing or damaged; 1 MiB a value, 8 MiB the folder; through IPC channels whose
    handlers refuse any page but the game's and any bad key or value.
  - **Desktop window** — remembered fullscreen (**F11** / **Alt+Enter**), scale of the 384×216 frame
    (**Ctrl+=** / **Ctrl+-** / **Ctrl+0**, fitted to the screen) and position (also on Linux / the
    Steam Deck); no navigation away, no pop-ups. The web build knows it runs in Electron: EXIT on the
    title, sound from boot. **Packaging** config for electron-builder (Windows, Linux AppImage,
    macOS; never in CI).
  - **Tizen extras** — opt-in `config.xml` variants (`build:game-mode` for the `use.game.mode`
    latency A/B test; the launch-time gamepad check only on request — it pops up without a pad),
    validated by the bundle check; the `productinfo` privilege and **device info** (model, firmware)
    as the debug overlay's sixth line; **live reload** to the TV (`tizen:watch` — a Node HTTP +
    WebSocket dev server, no dependency).
  - **Storage quota checks** — one shared `localStorage` adapter for web and TV (`createWebStorage`:
    the app's 1 MiB budget, a full storage keeps only that value in memory); the **debug save export
    / import** (`__shmupDebug.save`).
  - **Memory budget** — an estimator that keeps every campaign zone under 100 MB (A–G ≈ 67 MiB, I ≈
    74 MiB) and atlas-page unloading between zones on `PrepareStage` (nothing to unload with today's
    single page).
  - Review fixes: the device line no longer allocates a string per frame, and the window position
    is saved on Linux (`move` + a 400 ms settle, `will-quit` waiting for the write). No simulation
    change (no golden re-bless); Tizen bundle ≈ 361 of 384 KB gzip.
  - Docs: [developer guide](docs/dev/platform-polish.md) · [the desktop app](docs/client/desktop-app.md) ·
    [game-mode build and live reload on the TV](docs/client/install-on-tv.md#the-game-mode-build-latency-ab-test) ·
    [the device line and the save export](docs/client/debug-tools.md#the-device-line)

- **v1.0 hardening & release candidate** (M2-18) — version **1.0.0-rc.1**
  - **Every route with both ships** — the 4-way bot clears all 16 routes with the KESTREL and with
    the MANTA in god mode, every zone in 3–6 minutes, the 4-way rules checked on every tick
    (`test/playtest/campaign-routes*.test.ts`).
  - **Release audit** — capsule and item budgets, the recovery rule after every checkpoint, every
    bullet pattern at Normal and at loop 1's top rank (speed, rank scaling, the ship's open
    column), every boss fight's laser lanes with both ships (`test/integration/release-audit.test.ts`).
  - **What it found** — the MANTA's waves could not pass armour (a new `passArmour` tunable lets
    them clink through), its fifth disc level left a gap straight ahead, GALVANIC MAW's mouth was too
    narrow for the biggest disc, SANDGRAVE WIDOW's silk lines could come 16 px apart at a high rank;
    `zone-b-god` re-blessed.
  - **Cross-engine determinism** — every golden replay and attract demo reproduces its state hashes
    in Chromium and Firefox against the web build (`?determinism`, `test/e2e/determinism.spec.ts`;
    a Firefox job in CI).
  - **Performance** — every zone under stress and a 30-minute soak through the scene flow with a
    flat heap (`pnpm bench`); boot to title under 3 s and the Tizen certification self-checks — Back /
    exit, multitasking, resume, user data — in the browser tests (`test/e2e/release-check.spec.ts`).
  - **Icons and store placeholders** — `pnpm store:assets` draws the TV and desktop icons and
    placeholder store screenshots and listing text from the game's placeholder art.
  - Docs: [developer guide](docs/dev/release-hardening.md) ·
    [the release candidate and the v1.0 checklist](docs/client/release-candidate.md) ·
    [API reference](docs/dev/api-reference.md) (`determinism`, `passArmour`, the playtest and bench
    additions)

- **Extra modes & replay features** (M3-01)
  - **EXTRA** on the title: **BOSS RUSH** (the nine zone bosses in a row — the shipped `boss-rush`
    stage), **CARAVAN** (one zone against a three-minute clock — `GameConfig.timeLimit`, TIME UP, a
    time bonus) and **ARCADE** (the campaign looping on — `GameConfig.loop`: each zone's `remix`
    waves, faster bullets, a revenge bullet from every kill), each with its own hi-score tables.
  - **Replays of whole runs** (`core/replay` `run.ts`): one segment per World with its start state
    and the flow's between-tick actions; the last game and three kept ones in platform storage,
    sized to the storage adapter; a browser with PLAY (×1 / ×2 / ×4), KEEP, SHARE (the web's
    clipboard and paste) and DELETE.
  - **Extra Edit** weapons (seven, the Spread Gun equipped twice) and **LOOP 2**, unlocked by an
    ending; four original **secret codes**; a **score-milking cap** on spawned enemies.
  - **Assists** — game speed (the clock only) and invincibility, flagged in hi-score rows and the
    replay header's `assists` —, **option recovery** and gamepad **rumble** (`vibrationActuator`).
  - Six new golden replays (loop 2, the caravan, the Extra Edit, option recovery, invincibility);
    every golden re-blessed for its header, `captain-range-god` for the milking cap.
  - Docs: [developer guide](docs/dev/extra-modes-and-replays.md) ·
    [the extra modes and replays for players](docs/client/extra-modes-and-replays.md) ·
    [API reference](docs/dev/api-reference.md) (`replay/run.ts`, the EXTRA scenes, `PlayOptions`,
    rumble)

- **Visual & mechanic extras** (M3-02)
  - **Mode-7 floor** — one GLSL ES 1.0 filter evaluates mode 7's per-row affine matrix over a
    full-frame sprite at the bottom of `BG_MID`, driven by a stage's new optional `mode7` section
    (presentation only, so no hash moved); the plane's turned axes come from the core's angle
    tables, so the shader has no trigonometry. The pseudo-3D **HIGH-SPEED DIMENSION** dev stage
    (`?stage=dimension`) flies over it.
  - **CRT / scanline filter** (OFF / LIGHT / FULL) over the upscaled picture, capped at 1080 rows
    so a 4K TV pays for a 1080p pass, and two **aspect modes** — ultra-wide 64:27 and classic 4:3 —
    that place the frame in a window with dimmed side panels instead of black bars (never a crop:
    the playfield stays 384×216).
  - The **black-hole bomb**, the game's one signature mechanic (`core/blackhole`): the MANTA's
    yellow items stock a bomb, `Special` throws a vortex that pulls enemy bullets in, swallows the
    ones reaching its core and then discharges lightning; one vortex per player.
  - Deterministic **authentic slowdown** (a sim-side tick skip once the on-screen load passes 96
    objects), **graze** scoring, the **death-bomb window**, and the three P2 bosses on boss **pull
    fields** — GRASPING BLOOM (suction), IRON TALON (grabber) and SHADOW STRIDER (the invincible
    walker).
  - The final zone's **escape sequence** (a collapsing corridor before the ending; not a zone of its
    own), a new **EXTRAS** options page for the four sim-affecting extras and CRT / ASPECT rows on
    the DISPLAY page.
  - One new golden replay (zone A with every extra on); all goldens and demos re-blessed once for
    the four new header fields — no expected score, status or tick count moved.
  - Docs: [developer guide](docs/dev/visual-and-mechanic-extras.md) ·
    [the extras for players](docs/client/visual-and-mechanic-extras.md) ·
    [API reference](docs/dev/api-reference.md) (`core/blackhole`, `StageMode7`, the `effects` and
    `viewport` additions)

- **Remote & hardware tuning** (M3-02b) — the probe's findings turned into the game
  - **The remote profile is measured, not guessed**: `tizen-remote-safe` is labelled `REMOTE`,
    debounces **0** ticks, carries the new `singleKey` knob (while a key is down, another key's
    `keydown` is dropped — as the hardware does) and registers Guide 458 / Extra 10253 so REBIND
    can capture them. `tizen-remote-diagonal` was retired; a save naming it resolves through
    `core/config` `migrateInputProfileId`. `keyboard-remote-emulation` now feels like the real
    remote.
  - **Nothing asks for a held Back or Play/Pause** (they arrive only on release): the INPUT TEST
    leaves on three Pause presses inside 90 ticks (`PAUSE X3 OR HOLD TO EXIT`), and the debug
    unlock is four taps. The shell's debug tools track held keys themselves — the remote's
    auto-repeats carry `repeat === false` — and an ESLint rule forbids `.timeStamp` in runtime
    sources (Tizen 5.5 advances it in whole seconds).
  - **Pause on Home**: both hosts' lifecycles take a focus source and are edge-triggered over
    hidden ∨ unfocused, so the Home overlay opens the pause menu and suspends the audio, and the
    return resumes with no catch-up burst.
  - **Vsync lock** (`core/loop` `setVsyncLock`, shell `framePacing`, `VSYNC_LOCK_MIN_HZ … MAX_HZ`
    55–65): one tick per frame on a fixed ~60 Hz display, a second only when the frame's delta plus
    the carried debt covers two whole steps; debt bounded to ±1 step. Presentation only — no replay
    or golden hash moved. The debug overlay gained a **TPF** line (0 / 1 / 2 / 3+ ticks per frame),
    a rAF-delta histogram and a `LOCK` alert for the on-device check.
  - **The playtest bot flies the remote's model** (`test/playtest/remote-strict.ts`): one key a
    tick, an equip is a direction-free tap, a direction change costs a tick. Every zone, all 16
    routes, the boss rush and the caravan still clear inside their budgets — **no zone content
    needed re-tuning**; three bot changes and one golden expectation did.
  - **The probe was fixed**: handler time only, a raw rAF-delta histogram, and the verdict
    `NO — not delivered` for a key the hardware swallows.
  - Docs: [controls](docs/client/controls.md#samsung-smart-remote) ·
    [input profiles](docs/dev/input-profiles.md#what-the-2026-09-15-input-probe-changed-m3-02b) ·
    [architecture](docs/dev/architecture.md#fixed-step-loop-coreloop) ·
    [debug tools](docs/client/debug-tools.md#frame-pacing-tpf-and-the-raf-histogram) ·
    [API reference](docs/dev/api-reference.md)

- **Render profiling: on-device numbers and a render benchmark** (M3-02c) — an instrument, not a
  fix: it deliberately changes nothing it measures.
  - **A render benchmark** (`pnpm bench` → `test/bench/render.perf.ts`): until now nothing here
    measured `renderer.render()` at all. It builds a purpose-made page with Vite (the repo's own
    content and asset plugins, so the real atlas and the real simulation go in) and drives it in
    Playwright's Chromium — worst-case frames (512 enemy bullets, a bomber's screen clear filling
    the point-item pool, the particle pool full) with CRT off / light / full, a filtered layer, the
    Mode-7 floor, and **the internal frame size as a parameter** (384×216 and 768×432), reporting
    render-ms p95, draw calls, pooled render-target bytes, structure rebuilds and a JS-heap delta
    over 600 frames. A deliberately leaky fixture proves the heap gate fails when it should. Its
    load is asserted as a **per-frame floor**, and its DOM-free core (`render-harness/load.ts`,
    `gates.ts`, `protocol.ts`) is driven in Node by `pnpm test`, so a bench that would measure an
    empty scene fails loudly.
  - **It renders through SwiftShader**, so its milliseconds are a regression gate and never a
    prediction of the TV's Mali-G51. What transfers is the counted quantities — draw calls, pooled
    render-target bytes, structure rebuilds, heap delta — and the comparisons between scenarios.
  - What it already settles, without the hardware: **655–659 of 660 frames rebuild the scene's
    whole instruction set**, CRT `light` costs exactly what `full` costs and pools the same target,
    and a 384×216 filter pass really is pooled as 512×256.
  - **Two figures on the TV**: the debug overlay's seventh line shows `REB` (frames Pixi rebuilt
    the instruction set on) and `RT` (pooled render-target kilobytes) — both allocation-free, the
    second measured with one hook on Pixi's `TexturePool` rather than a per-frame scan.
  - **WebGL1 vs 2**: the probe verified both on Tizen 5.5, so the stale "WebGL2 is unverified"
    note is gone; `?gl=2` (web) and `localStorage['shmup-cup:gl']` (TV, dev builds only) A/B it.
    **WebGL1 stays the shipped default.**
  - Docs: [measuring render performance](docs/dev/rendering-and-shell.md#measuring-render-performance-m3-02c) ·
    [the overlay's render profile](docs/client/debug-tools.md#render-profile-reb-and-rt) ·
    [results](docs/dev/input-probe-results.md#11-render-profile-m3-02c) ·
    [the review behind it](docs/dev/render-performance-review.md)


### Hardware spike

- The **input probe** — a diagnostic Tizen app that measures the Samsung remote, gamepads and
  display on the real monitors ([`tools/input-probe/`](tools/input-probe/README.md)) — **ran on both
  M7 monitors on 2026-09-15**
  - The remote sends one key at a time: no diagonals, and no OK or another button while an arrow is held.
  - Held keys repeat as flagless keydowns with no fake key-ups.
  - Back and Play/Pause arrive only when released.
  - Home is an overlay that fires only `blur`, so the game did not pause (it does since M3-02b).
  - rAF jitters enough to double-step the loop (the vsync lock answers it — M3-02b).
  - DualShock 4, WebGL2 (Mali-G51), 1920×1080 and Chromium 69 are confirmed.
  - Docs: [results](docs/dev/input-probe-results.md) · raw logs and analyzer in
    [`tools/input-probe/results/`](tools/input-probe/results/README.md) · applied by plan step
    **M3-02b**

## Documents

| File | Contents |
|---|---|
| [`shmup_feat.md`](shmup_feat.md) | Feature & functionality catalog (P0/P1/P2), design decisions, reference data from both source games |
| [`shmup_tech.md`](shmup_tech.md) | Language/platform verdict, Tizen 5.5 constraints, test-hardware notes, library comparisons, recommended stack |
| [`input_probe_spec.md`](input_probe_spec.md) | Spec for the first spike: a diagnostic Tizen app that measures the Samsung remote / gamepad / display behavior |
| [`shmup_plan.md`](shmup_plan.md) | Implementation plan: resolved design decisions, milestones M1 (vertical slice) → M2 (v1.0) → M3, ordered agent-sized build steps, manual on-device checklist, "as built" notes per step |
| [`shmup_progress.md`](shmup_progress.md) | Execution progress: one row per plan step (status, review rounds, tests, commits, deviations) |
| [`CHANGELOG.md`](CHANGELOG.md) | Release notes per version (0.1.0 = milestone M1, 1.0.0-rc.1 = milestone M2's release candidate) |
| [`shmup_prompt.md`](shmup_prompt.md) | Paste-into-a-new-session prompt that drives execution of the plan (workflow: build → review/fix loop → tests → docs → CI gate per step, progress in `shmup_progress.md`) |
| [`docs/`](docs/README.md) | Player and developer documentation (start with [`docs/dev/repo-layout.md`](docs/dev/repo-layout.md)) |

Game docs — testers: [preview build (the title screen, menus, HUD and pause menu, the ship select (the KESTREL or the MANTA), the weapon select (weapon types A–D, Weapon Edit, the Option types, the `?` shields and `!` choices, Auto Power-Up), two players at once (2 PLAYERS, joining with START, the split keyboard), the Options screen — volumes, controls and the colour-blind bullet colours — and saved settings and high scores, the game-over and stage-clear screens, the difficulties, extra ships and continues, zone A — AZURE VERGE and its boss HALCYON BULWARK —, the zone map and the real zones B–I, the endings and the credits, the front end — the attract loop, typing your initials, the high-score tables, practice and the sound test —, test stage, its enemies and their bullets, your weapons, power-ups, the MANTA's colour items, weapons and Arm, lives and score, the boss and its WARNING, the Option Hunter range, the Direct range, explosions, shake and flashes, sound and music)](docs/client/preview-build.md) ·
[controls](docs/client/controls.md) · [monitor setup & install](docs/client/install-on-tv.md) ·
[debug tools & release checks](docs/client/debug-tools.md) · [the desktop app](docs/client/desktop-app.md) ·
[the v1.0 release candidate & checklist](docs/client/release-candidate.md) ·
[extra modes, replays & assists](docs/client/extra-modes-and-replays.md) ·
[the visual & mechanic extras](docs/client/visual-and-mechanic-extras.md).
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
[saves & options](docs/dev/saves-and-options.md) ·
[zone A & playtest](docs/dev/zone-a-and-playtest.md) ·
[difficulty, rank, extends & continues](docs/dev/difficulty-and-rank.md) ·
[pattern DSL, bending lasers & palettes](docs/dev/pattern-dsl.md) ·
[meter arsenal & weapon select](docs/dev/meter-arsenal.md) ·
[Option types, shields & the Option Hunter](docs/dev/options-shields-hunter.md) ·
[Direct mode, the MANTA & the ship select](docs/dev/direct-mode.md) ·
[two-player co-op](docs/dev/coop.md) ·
[advanced stage systems](docs/dev/advanced-stages.md) ·
[presentation polish](docs/dev/presentation-polish.md) ·
[advanced bosses](docs/dev/advanced-bosses.md) ·
[zone map, campaign runs & bonus stages](docs/dev/campaign-and-bonus-stages.md) ·
[zones B & C](docs/dev/zones-b-and-c.md) ·
[zones D & E](docs/dev/zones-d-and-e.md) ·
[zones F & G](docs/dev/zones-f-and-g.md) ·
[zones H & I, endings & credits](docs/dev/zones-h-and-i.md) ·
[front end & attract mode](docs/dev/front-end-and-attract.md) ·
[options, rebinding & accessibility](docs/dev/options-rebinding-and-accessibility.md) ·
[platform polish: Electron, Tizen extras, storage & memory](docs/dev/platform-polish.md) ·
[v1.0 hardening & the release candidate](docs/dev/release-hardening.md) ·
[extra modes, replays & assists](docs/dev/extra-modes-and-replays.md) ·
[visual & mechanic extras](docs/dev/visual-and-mechanic-extras.md) ·
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

Prerequisites: Node 24.15+ (see `.nvmrc`; Node 26+ also works, Node 22 and the odd majors 23/25
are not supported) and pnpm 12 (`npm i -g pnpm@latest`; the exact version is pinned in
`package.json` → `packageManager`). pnpm refuses to install or run scripts on other Node
versions (`devEngines.runtime`).

```sh
pnpm -v               # must print 12.x — an older global pnpm fails with ERR_PNPM_BROKEN_LOCKFILE
pnpm install          # set ELECTRON_SKIP_BINARY_DOWNLOAD=1 to skip the Electron binary
pnpm dev              # browser dev app → http://localhost:5173 (F1–F8: debug tools): the title (Enter five times — PRESS OK, 1 PLAYER, NORMAL, KESTREL in the ship select, START in the weapon select — starts zone A, AZURE VERGE, the first of a run across the zone map (after each boss the tally, then Up / Down + Enter on the ZONE MAP choose the next zone); Down on the title picks 2 PLAYERS — a gamepad's START (or Enter with ?profile=keyboard-split) drops player 2 in; Down + Enter in the ship select flies the MANTA instead — its colour items power up on contact, Left Shift toggles its speed; in the weapon select ↑ / ←→ choose the weapon type, EDIT, the Option type, the ? shield, the ! choice and Auto Power-Up — V or a held Enter spreads FORMATION / ROTATE Options in the game; ?skip=boss starts every zone right before its boss (HALCYON BULWARK in zone A); Enter, Down ×3, Enter opens OPTIONS — volumes and the CONTROLS (profile, AUTOFIRE always / toggle / hold, RATE, SOCD, DEBOUNCE, REBIND KEYS / PAD — press a key to rebind, Esc cancels —, INPUT TEST — P / Esc three times, or held, leaves), DISPLAY (bullet colours, SCALE, SHAKE, FLASHES, HITBOX, BOSS HP) and GAME (difficulty, LIVES, PENALTY, AUTO POWER, MAGNET, ONE BUTTON — from the next game) pages (M2-16), saved in localStorage; Enter, Down ×2, Enter opens PRACTICE, Enter, Down ×4, Enter the SOUND TEST and Enter, Down ×5, Enter the EXTRA menu — BOSS RUSH, CARAVAN, ARCADE and REPLAYS (the last game at ×1 / ×2 / ×4 with → / ←; SHARE copies it, Ctrl+V on the page loads a shared one — M3-01); left alone for 12 s the title plays the attract loop — a zone demo, the high-score tables, the story; after a high score type your initials with the arrows and Enter (M2-15); Esc pauses), then fly the KESTREL (arrows/WASD, gamepad; the first key press turns the sound on; Enter/C takes a power-up; ?scene=flight skips the title; ?stage=test-range scrolls the test stage, its enemies, their bullets and the power capsules; ?stage=test-boss plays the WARNING and the test boss; ?stage=hunter-range&loadout=full sends in the Option Hunters; ?stage=direct-range (then the MANTA) sends pincer waves of item carriers; ?stage=gimmick-range tries the M2-07 stage systems — bricks to shoot through, regrowing walls, rocks, bubbles, a volcano, suction, tentacles, the cube rush, moving blocks, a pan, a fork; ?stage=raster-range shows the M2-08 raster effects and palette cycling — a waving, colour-rolling sea, a line-band floor, heat haze; ?stage=captain-range / raid-range / twin-range / gauntlet-range play the M2-09 advanced bosses — mid-bosses on the scrolling screen, the IRON LEVIATHAN raid with its heart and time limit, the twins' turns, a boss rush; ?stage=bonus-range tries the M2-10 hidden bonus entrances into the bonus vault; ?stage=zone-b / zone-c plays BRINE NEBULA / DUNE EXPANSE alone and ?stage=brine-grotto zone B's bonus stage PEARL GROTTO (M2-11); ?stage=zone-d / zone-e plays MAGMA DEEP (the dive, the brick maze, CINDER BASTION) / TEMPEST RIDGE (rear attackers, SQUALL STEED) alone (M2-12); ?stage=zone-f / zone-g plays CELL VAULT (tissue walls, tentacles, MANTLE REGENT) / PRISM LABYRINTH (crystal walls, the cube rush, FACET MONARCH — shoot the gallery's four turrets for ?stage=glimmer-cache, its bonus stage) alone (M2-13); ?stage=zone-h / zone-i plays the finales IRON CITADEL (the piston hall, the parade, IRON SOVEREIGN) / ABYSSAL THRONE (depth mines, the ABYSS ARK raid, THE HOLLOW KING) alone (M2-14 — a whole run from the title ends in an ending scene and the credits); ?profile=keyboard-remote-emulation feels like the TV remote; ?profile=keyboard-split puts two players on one keyboard; ?scene=showcase / ?scene=calibration / ?scene=fx-gallery)
pnpm lint             # ESLint (typescript-eslint + compat: chrome >= 69)
pnpm typecheck        # tsc --noEmit everywhere
pnpm test             # every package's Vitest tests + repo integration tests, one process, one worker pool (VITEST_MAX_WORKERS=n to throttle)
pnpm test:e2e         # build web + Tizen test builds, boot both in headless Chromium (plus the determinism spec in headless Firefox), tests in parallel (E2E_WORKERS=n; --project=chromium / firefox for one engine; once: pnpm exec playwright install --with-deps chromium firefox)
pnpm build            # packages → dist/, apps/web, apps/tizen (one ES2018 IIFE within its size budgets), apps/electron
pnpm bench            # benchmarks: the stress run, every zone under stress, the 30-minute soak (ms per tick, heap) and the render bench (worst-case frames through the real renderer in Playwright's Chromium — once: pnpm exec playwright install --with-deps chromium)
pnpm golden:update    # re-bless the golden replays and the attract demos (only for an intended simulation change)
pnpm store:assets     # regenerate the TV / desktop icons and the store-listing placeholders (assets/generated/store/)
pnpm format           # Prettier
pnpm trig:tables      # regenerate the committed core trig tables (a test checks they are current)
pnpm content:check    # validate every JSON under content/ + its sprite names exist in the atlas + zone A's 4-way design rules + en.strings.json equals the built-in UI table (part of pnpm test)
pnpm content:tiled level.tmj  # convert a Tiled map into content/stages/<id>.stage.json (+ paths); --print to preview
pnpm assets           # rebuild the placeholder sprite atlas (automatic before build/dev; skipped when unchanged)
pnpm audio:preview    # render every placeholder sound and song to WAV files in assets/generated/audio-preview/
pnpm clean            # remove build output
```

Samsung TV: `pnpm --filter @shmup/tizen build` (or `build:dev` for the debug build with the
developer tools — [`docs/client/debug-tools.md`](docs/client/debug-tools.md)), then the
`tizen:package` / `tizen:install` / `tizen:run` scripts on a machine with the Tizen CLI and
certificate — step by step in
[`docs/client/install-on-tv.md`](docs/client/install-on-tv.md#installing-the-game-preview); all
variables and the Chromium 69 build contract in
[`docs/dev/build-test-deploy.md`](docs/dev/build-test-deploy.md) and
[`apps/tizen/README.md`](apps/tizen/README.md).

Desktop: `pnpm build && pnpm --filter @shmup/electron start` (needs the Electron binary; F11
fullscreen, Ctrl+= / Ctrl+- window size), installers with `pnpm --filter @shmup/electron package` —
[`docs/client/desktop-app.md`](docs/client/desktop-app.md). TV extras: `pnpm --filter @shmup/tizen
build:game-mode` (the latency A/B build) and `tizen:watch` (live reload) —
[`docs/client/install-on-tv.md`](docs/client/install-on-tv.md#the-game-mode-build-latency-ab-test).

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
| [`packages/core`](packages/core/README.md) | `@shmup/core` — pure-TS deterministic simulation: the World and its tick pipeline, all game systems, the scene stack and flow, the canvas UI kit and HUD, saves, debug controls, replays, the `Platform` interface |
| [`packages/render-pixi`](packages/render-pixi/README.md) | `@shmup/render-pixi` — PixiJS v8 renderer (WebGL1, 384×216 → integer upscale); particles, screen shake / flash / dim, score popups; the debug overlay |
| [`packages/audio-web`](packages/audio-web/README.md) | `@shmup/audio-web` — Web Audio back-end (interactive latency, buses) and the game's audio: deterministic synth, SFX voice manager, looping music with fades and ducking, the engine fed by sim events |
| [`packages/input-web`](packages/input-web/README.md) | `@shmup/input-web` — keyboard / Samsung remote / gamepad → action snapshots, driven by the input profiles (debounce, diagonal / SOCD policies, game / menu tables); the player's rebinding with conflict detection and the key / button capture |
| [`packages/shell`](packages/shell/README.md) | `@shmup/shell` — shared browser host of web + Tizen: boot / loading (content, atlas, sounds and the stage's music), boot error screen, event dispatch (game-feel events → renderer, sound events → audio engine), frame loop, the scene flow's view (the default), the rebind screen's host side, the free-flight scene, the fx gallery, the dev builds' debug tools |
| [`apps/web`](apps/web/README.md) | Vite browser dev target (also Electron's renderer) |
| [`apps/tizen`](apps/tizen/README.md) | Samsung Tizen `.wgt` (Chromium 69 classic IIFE build, config.xml, CLI scripts) |
| [`apps/electron`](apps/electron/README.md) | Electron desktop shell |
| [`content/`](content/README.md) | Game data: player ships, stages, terrain tilesets, enemies, movement paths, weapons, bullet patterns (`patterns/`), the difficulty presets and scoring values (`rules/`), input profiles, particle presets, sound effects and music, the campaign, the attract demos, the UI string tables (`strings/`) (JSON, `formatVersion` 1) |
| `types/` | Ambient declarations for the Vite virtual modules (`virtual:shmup-content`, `virtual:shmup-assets`) and the build-info defines (`__SHMUP_DEV__`, `__SHMUP_BUILD__`) |
| [`assets/`](assets/README.md) | Art/audio sources (`source/`: sprite pixel maps, fonts) and pipeline output (`generated/`: atlas pages + manifest, ignored) |
| [`scripts/`](scripts/README.md) | Repo-level Node scripts (asset pipeline, trig tables, audio preview, golden update, the Tiled importer `content/tiled-import.mjs`) |
| [`test/`](test/README.md) | Cross-package integration tests; `test/playtest/` the 4-way playtest bot; `test/golden/` golden replays; `test/bench/` the benchmarks (stress, every zone, the 30-minute soak); `test/e2e/` browser smoke tests (Playwright) |
| [`docs/`](docs/README.md) | Player (`client/`) and developer (`dev/`) documentation |
| `tools/` | Standalone dev tools with their own npm projects (not workspace members) |
| [`tools/input-probe`](tools/input-probe/README.md) | Input probe `.wgt`: remote / gamepad / display diagnostics for the M7 monitors (npm, Vite, Vitest; log server) |

Toolchain note: TypeScript is pinned to **6.0.x** — TypeScript 7 (native) has no JS API
until 7.1 and typescript-eslint 8.x requires `typescript < 6.1`. The Node floor is
`^24.15.0 || >=26` rather than the original `>=20`. The pinned dev toolchain alone would allow
`^22.22.2` too — Vitest 5 (`^22.12 || ^24 || >=26`), Electron 44 (`>=22.12`),
eslint-plugin-jsdoc 64 (`^22.22.2 || >=24.15`) — but the allocation guards are calibrated on
Node 24's V8, and 17 of them fail on Node 22's older V8 (12.4), so Node 22 is not supported.
This only affects the machines that build the game — the shipped Tizen bundle still targets
Chromium 69.

## Next step

On hardware: the **M1 release check** (plan §8.4) on both monitors with the debug build —
launch ≤ 10 s, a crisp picture, AZURE VERGE played through with the remote alone, Back / Home /
exit behaviour, sound, saves kept after a relaunch and an update install, 15 minutes without a
hitch in the overlay's frame graph, gamepad and keyboard — checklist in
[`docs/client/debug-tools.md`](docs/client/debug-tools.md#the-m1-release-check). The M1 release
is tagged `v0.1.0` on the final commit of step M1-19.

Also on hardware: the **v1.0 checklist** (plan §8.5 on-device checks and §8.6 store readiness) on
both monitors with the release candidate 1.0.0-rc.1 — the checklist in
[`docs/client/release-candidate.md`](docs/client/release-candidate.md#the-v10-checklist-both-monitors),
background in [`docs/dev/release-hardening.md`](docs/dev/release-hardening.md#what-stays-manual).

Code: milestone **M2** is complete with plan step **M2-18** (v1.0 hardening & release candidate) — M2-01
(rank, difficulty presets, extends & continues) opened milestone **M2 — complete v1.0**, M2-02
(pattern DSL, bending lasers, bullet cancel & readability), M2-03 (meter arsenal: loadouts B–D,
Weapon Edit, parking & weapon select), M2-04 (Option & shield variants + Option Hunter), M2-05
(Direct mode & ship select), M2-06 (two-player simultaneous co-op), M2-07 (advanced stage
systems & Tiled import), M2-08 (presentation polish: raster effects, palettes, visual options) and
M2-09 (advanced bosses: mid-bosses, raids, multi-bosses), M2-10 (zone map, campaign flow,
transitions & bonus stages), M2-11 (zones B & C), M2-12 (zones D & E), M2-13 (zones F & G), M2-14 (final zones H & I, endings
& credits), M2-15 (front-end screens & attract mode), M2-16 (options, rebinding & accessibility), M2-17 (platform polish: Electron, Tizen extras, storage) and M2-18 followed. Milestone **M3** is under way: M3-01 (extra modes & replay features) and M3-02 (visual & mechanic
extras: the Mode-7 floor and the dimension stage, the CRT filter, the ultra-wide and 4:3 aspect
modes, authentic slowdown, graze, the death-bomb window, the black-hole bomb, the P2 bosses and the
final zone's escape sequence) and M3-02b (remote & hardware tuning from the input-probe results) are
done, and **M3-02c** (render profiling) with them; next are M3-02d / M3-02e (the rest of the
render-performance work M3-02b exposed —
[`docs/dev/render-performance-review.md`](docs/dev/render-performance-review.md)) and M3-03. Every
simulation change re-blesses the golden replays in the same
commit. The per-step status board is [`shmup_progress.md`](shmup_progress.md).

The input probe ran on both monitors (2026-09-15). Its results are recorded in `shmup_tech.md` §2.7 and
[`docs/dev/input-probe-results.md`](docs/dev/input-probe-results.md), and plan step **M3-02b** applied them: the
remote profile debounces 0 ticks and carries the `singleKey` model, the game pauses on Home's `blur`, the loop is
vsync-locked on the jittery 60 Hz panel, no gesture asks for a held Back or Play/Pause any more, and every zone was
re-flown by a bot that plays like the single-key remote (no zone needed re-tuning).
Since M1-06 the preview build is worth installing too: flying the KESTREL with the real remote
is the first hands-on check of the control scheme — since M1-16 moving through the title and
pause menus and quitting with Back, since M1-17 the Options screen, settings kept after a
relaunch and the control profile, since M1-18 **playing zone A through with the remote**
— the plan's manual M1-18 check: every bullet and laser dodgeable with single arrow presses —
since M2-01 the DIFFICULTY box, the extra-ship jingle and the CONTINUE? countdown, since
M2-02 the colour-blind **BULLETS** option and the points of cancelled bullets, since M2-03 the
**WEAPON SELECT** screen and the new weapon types, since M2-04 the Option types (spread with
the remote's Ch+) and the pod shields and REDUCE, since M2-05 the SHIP SELECT box and the
MANTA — its colour items, the Arm and the speed toggle on the remote's Ch−, and since M2-06
**two players** — the remote plus a USB / Bluetooth gamepad joining with START — and since M2-08
the Options screen's SCALE, SHAKE, FLASHES and HITBOX and the brighter Mega Crash flash, and since
M2-09 the BOSS HP bar during HALCYON BULWARK, and since M2-10 a whole **run across the zone map**
with the remote — the zone tally, the ZONE MAP, the stub zones and an ending —, and since M2-11
the real zones **BRINE NEBULA** and **DUNE EXPANSE**, their bosses and zone B's secret bonus stage,
and since M2-12 **MAGMA DEEP** (the dive and the brick maze with the remote) and **TEMPEST RIDGE**
(enemies from behind) with CINDER BASTION and SQUALL STEED, and since M2-13 **CELL VAULT** (the
regrowing tissue walls and the tentacles' tug with the remote) and **PRISM LABYRINTH** (the crystal
walls, the cube rush, the gallery into GLIMMER CACHE) with MANTLE REGENT and FACET MONARCH, and
since M2-14 the finales **IRON CITADEL** (the pistons and the parade) and **ABYSSAL THRONE** (the ARK
raid and THE HOLLOW KING), the ending scenes and the credits — a whole run to its ending —, and since
M2-15 the attract loop, typing initials with the remote's arrows and OK, the high-score tables,
practice and the sound test, and since M2-16 the Options pages — rebinding remote buttons, the input
test, RATE, DEBOUNCE and the GAME options with the remote —, and since M2-17 the game-mode build's
latency A/B test, the debug panel's device line, the memory over a long run and live reload
(`tizen:watch`), and since M3-01 the EXTRA modes, a replay played back and kept across a relaunch,
the secret codes on the remote, SPEED 50 % and a gamepad's rumble
([`docs/client/extra-modes-and-replays.md`](docs/client/extra-modes-and-replays.md#on-the-tv)) (checklist in
[`docs/client/preview-build.md`](docs/client/preview-build.md#on-the-samsung-smart-monitor--tv)).

Desktop prerequisites: Git, Node 24.15+, Tizen Studio **or** VS Code + Samsung Tizen extension (with a Samsung
certificate profile whose distributor cert includes both monitors' DUIDs), monitors in Developer Mode pointing at the
desktop's IP — step by step in [`docs/client/install-on-tv.md`](docs/client/install-on-tv.md).

## License

[MPL-2.0](LICENSE)
