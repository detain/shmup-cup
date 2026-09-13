# Shmup Cup

A modern TypeScript 2D horizontal-scrolling shoot-'em-up in the spirit of **Gradius III** and **Darius Twin** —
retro SNES-era look, fast and fluid 60 fps gameplay — targeting **Samsung Tizen** (TVs / Smart Monitors, Tizen 5.5+),
with the browser and Electron as additional targets.

## Status

The [implementation plan](shmup_plan.md) is approved and under way. Progress per step is tracked in
[`shmup_progress.md`](shmup_progress.md); milestone **M1 — playable vertical slice** is code-complete
as version **0.1.0** ([`CHANGELOG.md`](CHANGELOG.md)) — its on-device release check on the monitors
is next — and **M2 — complete v1.0** is under way (M2-01, M2-02 and M2-03 done).

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
    the menu sounds) and **CONTROLS**, the remote / keyboard profile (`SAFE 4-WAY (DEFAULT)` /
    `FAST 8-WAY` on the TV), switched at once; BACK keeps them.
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
    BARRIER; the `?` choice (the Force Field until M2-04).
  - **WEAPON SELECT** screen after the difficulty box (one more OK to start): TYPE A–D / EDIT, the
    slot weapons, `?`, `!`, AUTO and an **editable Auto Power-Up order** (the AUTO ORDER box) —
    remote-navigable, with a **live preview**: a private, silent mini World flying the chosen
    weapons over `content/stages/weapon-range.stage.json`, drawn behind the panel.
  - Golden replays re-blessed (sprite ids, the hashed Free Way direction — same outcomes) and four
    new boss runs cover every new weapon.
  - Docs: [developer guide](docs/dev/meter-arsenal.md) ·
    [what testers should check](docs/client/preview-build.md#choosing-your-weapons)

### Hardware spike

- The **input probe** — a diagnostic Tizen app that measures the Samsung remote, gamepads and
  display on the real monitors — is built and tested
  ([`tools/input-probe/`](tools/input-probe/README.md)). It is waiting to be packaged and run on
  the M7 monitors.

## Documents

| File | Contents |
|---|---|
| [`shmup_feat.md`](shmup_feat.md) | Feature & functionality catalog (P0/P1/P2), design decisions, reference data from both source games |
| [`shmup_tech.md`](shmup_tech.md) | Language/platform verdict, Tizen 5.5 constraints, test-hardware notes, library comparisons, recommended stack |
| [`input_probe_spec.md`](input_probe_spec.md) | Spec for the first spike: a diagnostic Tizen app that measures the Samsung remote / gamepad / display behavior |
| [`shmup_plan.md`](shmup_plan.md) | Implementation plan: resolved design decisions, milestones M1 (vertical slice) → M2 (v1.0) → M3, ordered agent-sized build steps, manual on-device checklist, "as built" notes per step |
| [`shmup_progress.md`](shmup_progress.md) | Execution progress: one row per plan step (status, review rounds, tests, commits, deviations) |
| [`CHANGELOG.md`](CHANGELOG.md) | Release notes per version (0.1.0 = milestone M1) |
| [`shmup_prompt.md`](shmup_prompt.md) | Paste-into-a-new-session prompt that drives execution of the plan (workflow: build → review/fix loop → tests → docs → CI gate per step, progress in `shmup_progress.md`) |
| [`docs/`](docs/README.md) | Player and developer documentation (start with [`docs/dev/repo-layout.md`](docs/dev/repo-layout.md)) |

Game docs — testers: [preview build (the title screen, menus, HUD and pause menu, the weapon select (weapon types A–D, Weapon Edit, the `?` / `!` choices, Auto Power-Up), the Options screen — volumes, controls and the colour-blind bullet colours — and saved settings and high scores, the game-over and stage-clear screens, the difficulties, extra ships and continues, zone A — AZURE VERGE and its boss HALCYON BULWARK —, test stage, its enemies and their bullets, your weapons, power-ups, lives and score, the boss and its WARNING, explosions, shake and flashes, sound and music)](docs/client/preview-build.md) ·
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
[saves & options](docs/dev/saves-and-options.md) ·
[zone A & playtest](docs/dev/zone-a-and-playtest.md) ·
[difficulty, rank, extends & continues](docs/dev/difficulty-and-rank.md) ·
[pattern DSL, bending lasers & palettes](docs/dev/pattern-dsl.md) ·
[meter arsenal & weapon select](docs/dev/meter-arsenal.md) ·
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
pnpm dev              # browser dev app → http://localhost:5173 (F1–F8: debug tools): the title (Enter four times — PRESS OK, START, NORMAL, START in the weapon select — starts zone A, AZURE VERGE; in the weapon select ↑ / ←→ choose the weapon type, EDIT, the ! choice and Auto Power-Up; ?skip=boss starts right before its boss HALCYON BULWARK; Enter, Down, Enter opens OPTIONS — volumes, controls and bullet colours, saved in localStorage; Esc pauses), then fly the KESTREL (arrows/WASD, gamepad; the first key press turns the sound on; Enter/C takes a power-up; ?scene=flight skips the title; ?stage=test-range scrolls the test stage, its enemies, their bullets and the power capsules; ?stage=test-boss plays the WARNING and the test boss; ?profile=keyboard-remote-emulation feels like the TV remote; ?scene=showcase / ?scene=calibration / ?scene=fx-gallery)
pnpm lint             # ESLint (typescript-eslint + compat: chrome >= 69)
pnpm typecheck        # tsc --noEmit everywhere
pnpm test             # Vitest per package + repo integration tests
pnpm test:e2e         # build web + Tizen test builds, boot both in headless Chromium (once: pnpm exec playwright install --with-deps chromium)
pnpm build            # packages → dist/, apps/web, apps/tizen (one ES2018 IIFE within its size budgets), apps/electron
pnpm bench            # stress benchmark: ms per tick and heap growth under maximum load
pnpm golden:update    # re-bless the golden replays (only for an intended simulation change)
pnpm format           # Prettier
pnpm trig:tables      # regenerate the committed core trig tables (a test checks they are current)
pnpm content:check    # validate every JSON under content/ + its sprite names exist in the atlas + zone A's 4-way design rules (part of pnpm test)
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
| [`packages/core`](packages/core/README.md) | `@shmup/core` — pure-TS deterministic simulation: the World and its tick pipeline, all game systems, the scene stack and flow, the canvas UI kit and HUD, saves, debug controls, replays, the `Platform` interface |
| [`packages/render-pixi`](packages/render-pixi/README.md) | `@shmup/render-pixi` — PixiJS v8 renderer (WebGL1, 384×216 → integer upscale); particles, screen shake / flash / dim, score popups; the debug overlay |
| [`packages/audio-web`](packages/audio-web/README.md) | `@shmup/audio-web` — Web Audio back-end (interactive latency, buses) and the game's audio: deterministic synth, SFX voice manager, looping music with fades and ducking, the engine fed by sim events |
| [`packages/input-web`](packages/input-web/README.md) | `@shmup/input-web` — keyboard / Samsung remote / gamepad → action snapshots, driven by the input profiles (debounce, diagonal / SOCD policies, game / menu tables) |
| [`packages/shell`](packages/shell/README.md) | `@shmup/shell` — shared browser host of web + Tizen: boot / loading (content, atlas, sounds and the stage's music), boot error screen, event dispatch (game-feel events → renderer, sound events → audio engine), frame loop, the scene flow's view (the default), the free-flight scene, the fx gallery, the dev builds' debug tools |
| [`apps/web`](apps/web/README.md) | Vite browser dev target (also Electron's renderer) |
| [`apps/tizen`](apps/tizen/README.md) | Samsung Tizen `.wgt` (Chromium 69 classic IIFE build, config.xml, CLI scripts) |
| [`apps/electron`](apps/electron/README.md) | Electron desktop shell |
| [`content/`](content/README.md) | Game data: player ships, stages, terrain tilesets, enemies, movement paths, weapons, bullet patterns (`patterns/`), the difficulty presets and scoring values (`rules/`), input profiles, particle presets, sound effects and music (JSON, `formatVersion` 1) |
| `types/` | Ambient declarations for the Vite virtual modules (`virtual:shmup-content`, `virtual:shmup-assets`) and the build-info defines (`__SHMUP_DEV__`, `__SHMUP_BUILD__`) |
| [`assets/`](assets/README.md) | Art/audio sources (`source/`: sprite pixel maps, fonts) and pipeline output (`generated/`: atlas pages + manifest, ignored) |
| [`scripts/`](scripts/README.md) | Repo-level Node scripts |
| [`test/`](test/README.md) | Cross-package integration tests; `test/playtest/` the 4-way playtest bot; `test/golden/` golden replays; `test/bench/` the stress benchmark; `test/e2e/` browser smoke tests (Playwright) |
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

On hardware: the **M1 release check** (plan §8.4) on both monitors with the debug build —
launch ≤ 10 s, a crisp picture, AZURE VERGE played through with the remote alone, Back / Home /
exit behaviour, sound, saves kept after a relaunch and an update install, 15 minutes without a
hitch in the overlay's frame graph, gamepad and keyboard — checklist in
[`docs/client/debug-tools.md`](docs/client/debug-tools.md#the-m1-release-check). The M1 release
is tagged `v0.1.0` on the final commit of step M1-19.

Code: plan step **M2-04** (Option & shield variants + Option Hunter) — M2-01 (rank, difficulty
presets, extends & continues) opened milestone **M2 — complete v1.0**, M2-02 (pattern DSL, bending
lasers, bullet cancel & readability) and M2-03 (meter arsenal: loadouts B–D, Weapon Edit, parking
& weapon select) followed; every simulation change re-blesses the golden replays in the same
commit. The per-step status board is [`shmup_progress.md`](shmup_progress.md).

Also on hardware (unchanged, and still the gate for the remote control scheme): package and
deploy the input probe from the **Windows desktop** that sits on the same LAN as the monitors and holds
the Samsung certificate profile, run the test protocol on both monitors, and record the results in `shmup_tech.md`
§2.7 (they decide the remote control scheme in `shmup_feat.md` §4). Since M1-05 the verdicts
become edits to `content/input/remote.input-profiles.json` (`releaseDebounceTicks`,
`diagonals`, `register`) — recipes in [`content/input/README.md`](content/input/README.md).
Since M1-06 the preview build is worth installing too: flying the KESTREL with the real remote
is the first hands-on check of the control scheme — since M1-16 moving through the title and
pause menus and quitting with Back, since M1-17 the Options screen, settings kept after a
relaunch and the FAST 8-WAY profile, since M1-18 **playing zone A through with the remote**
— the plan's manual M1-18 check: every bullet and laser dodgeable with single arrow presses —
since M2-01 the DIFFICULTY box, the extra-ship jingle and the CONTINUE? countdown, since
M2-02 the colour-blind **BULLETS** option and the points of cancelled bullets, and since M2-03 the
**WEAPON SELECT** screen and the new weapon types (checklist in
[`docs/client/preview-build.md`](docs/client/preview-build.md#on-the-samsung-smart-monitor--tv)).

Desktop prerequisites: Git, Node 24 (22.12+), Tizen Studio **or** VS Code + Samsung Tizen extension (with a Samsung
certificate profile whose distributor cert includes both monitors' DUIDs), monitors in Developer Mode pointing at the
desktop's IP — step by step in [`docs/client/install-on-tv.md`](docs/client/install-on-tv.md).

## License

[MPL-2.0](LICENSE)
