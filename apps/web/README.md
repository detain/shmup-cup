# @shmup/web

The **browser dev target** (Vite dev server with HMR) and the renderer that
`apps/electron` loads. Wires `@shmup/core` + `@shmup/render-pixi` + `@shmup/audio-web` +
`@shmup/input-web` together through the shared shell [`@shmup/shell`](../../packages/shell/README.md).
It boots behind a loading bar (or a boot error screen listing every problem) into the game's
**scene flow** (M1-16): the title (`PRESS OK`, then 1 PLAYER / 2 PLAYERS / OPTIONS — no EXIT: a
browser has no `platform.exit`, so Back on the title only backs out of the menu; 2 PLAYERS is a
co-op game that player 2 joins with a gamepad's START or, with the `keyboard-split` profile, Enter
— M2-06, [`docs/dev/coop.md`](../../docs/dev/coop.md)), the difficulty menu under
1 PLAYER / 2 PLAYERS (EASY / NORMAL / HARD / ARCADE — M2-01), the ship select after it (the KESTREL or the
Direct-mode MANTA, which starts at once — M2-05, [`docs/dev/direct-mode.md`](../../docs/dev/direct-mode.md)),
the weapon select for the KESTREL (weapon types A–D /
EDIT, the `?` / `!` choices, Auto Power-Up and its order, a live preview — M2-03,
[`docs/dev/meter-arsenal.md`](../../docs/dev/meter-arsenal.md); the Option type row and the five
`?` shields — M2-04, [`docs/dev/options-shields-hunter.md`](../../docs/dev/options-shields-hunter.md)), the game with its HUD, the pause menu (Esc / P /
Backspace), stage clear, the continue countdown (M2-01) and game over — guides:
[`docs/dev/scenes-and-ui.md`](../../docs/dev/scenes-and-ui.md),
[`docs/dev/difficulty-and-rank.md`](../../docs/dev/difficulty-and-rank.md). `?scene=flight` goes straight into **free
flight** (M1-06): the game's World with the KESTREL under keyboard / gamepad control over an
empty starfield. `?scene=showcase` shows the M1-04 sprite showcase and `?scene=calibration`
the pixel-art calibration test pattern instead. Since M1-18 a game in the scene flow plays
**zone A, AZURE VERGE**, with its boss HALCYON BULWARK (`@shmup/shell` `defaultStageId`; the dev
scenes keep open space), and `?skip=boss` — the debug stage skip, `stageSkipFromSearch` → `GameConfig.stageSkip`
— starts every game a little before the boss (guide:
[`docs/dev/zone-a-and-playtest.md`](../../docs/dev/zone-a-and-playtest.md)). `?stage=<id>` runs
another stage when a game starts (M1-07 — `?stage=test-range` is the dev stage: scrolling camera, generated
terrain, star parallax and, since M1-08, its enemy roster flying the timeline — since M1-09
the turrets, walkers and orbiters fire bullets at the ship; an unknown id
logs a `console.warn` and flies in open space; guides:
[`docs/dev/stage-runtime.md`](../../docs/dev/stage-runtime.md),
[`docs/dev/enemies-and-behaviors.md`](../../docs/dev/enemies-and-behaviors.md),
[`docs/dev/bullets-and-patterns.md`](../../docs/dev/bullets-and-patterns.md)). Since M1-10
the KESTREL **autofires** (`GameConfig.autofire` stays on although this app sets
`remoteMode: false`) and shoots the enemies down; `?loadout=full` starts it fully powered —
speed 2, Missile, Laser, four Options and (since M1-11) a Force Field (dev override,
`loadoutFromSearch`; guide: [`docs/dev/weapons-and-options.md`](../../docs/dev/weapons-and-options.md)).
Since M1-11 the test stage's carriers and completed formations drop **power capsules**; C or
Enter (the game's `PowerUp`, remote OK) equips the highlighted meter slot — the meter itself is
drawn by the HUD since M1-16 (guide: [`docs/dev/powerups-and-shields.md`](../../docs/dev/powerups-and-shields.md)).
Since M1-12 rock, enemies, bullets and lasers **destroy the ship** (a Force Field takes all but
the rock): it flies back in blinking with one power level less (the default `classic` penalty),
the HUD shows the score, `HI` and the spare ships, and after the third ship the game-over
screen leads back to the title (in free flight the top bar says `GAME OVER` — reload to play
again) (guide:
[`docs/dev/death-and-scoring.md`](../../docs/dev/death-and-scoring.md)). There is no URL
parameter for the penalty or the lives yet. Since M1-13 `?stage=test-boss` (BOSS RANGE) ends in
the **boss WARNING** — the camera brakes to a stop under a flashing `WARNING!!` band for three
seconds — and the test boss TRIAL WARDEN, whose shield plates, core and guns the ship shoots
down; its death clears the stage (guide:
[`docs/dev/bosses-and-warning.md`](../../docs/dev/bosses-and-warning.md)). Since M2-04
`?stage=hunter-range` (HUNTER RANGE, best with `&loadout=full`) sends in the armoured **Option
Hunters**, which steal the Options they touch until a Mega Crash or the rare **blue capsule**
frees them as drifting items (guide:
[`docs/dev/options-shields-hunter.md`](../../docs/dev/options-shields-hunter.md)). Since M2-05
`?stage=direct-range` (DIRECT RANGE — pick the MANTA in the ship select) sends six-cube pincer
waves and lead carriers whose drops become the MANTA's colour items; Left Shift toggles its speed
(guide: [`docs/dev/direct-mode.md`](../../docs/dev/direct-mode.md)). Since M2-07
`?stage=gimmick-range` (GIMMICK RANGE) flies the advanced stage systems: destructible bricks and
regenerating tissue (rolled back on a checkpoint restart), falling rocks, splitting bubbles, a
volcano, a suction pod, tentacles, the cube rush, moving blocks, a hold with a vertical pan, a
diagonal pan, a region trigger picking a branch and a 4 px/tick section (guide:
[`docs/dev/advanced-stages.md`](../../docs/dev/advanced-stages.md)). Since M2-08
`?stage=raster-range` (RASTER RANGE) shows the raster effects and palette cycling — a waving,
colour-cycling sea, a line-band checker floor, a heat haze over the stars — and on a monitor over
70 Hz the shell draws the world interpolated between ticks (guide:
[`docs/dev/presentation-polish.md`](../../docs/dev/presentation-polish.md)). Since M2-09 the
advanced-boss ranges: `?stage=captain-range` (four mid-bosses on the scrolling camera),
`?stage=raid-range` (IRON LEVIATHAN, a battleship wider than the screen that the camera flies
around, with LEVIATHAN HEART inside and a 90-s time limit), `?stage=twin-range` (the EMBER AND
FROST TWINS taking turns; the survivor enrages) and `?stage=gauntlet-range` (a boss rush); OPTIONS
→ BOSS HP shows the boss HP bar in the top HUD bar (guide:
[`docs/dev/advanced-bosses.md`](../../docs/dev/advanced-bosses.md)). Since M2-10 a game on zone A
(the default) is a **campaign run** across the zone map — the zone tally, the ZONE MAP, the zones
B–I (stubs at first), the ending; `?skip=boss` then starts every zone near its boss — while any other `?stage=`
plays alone; `?stage=zone-b` … `zone-i` flies one zone alone, and `?stage=bonus-range` has the three
hidden bonus-stage entrances into `bonus-vault` (guide:
[`docs/dev/campaign-and-bonus-stages.md`](../../docs/dev/campaign-and-bonus-stages.md)). Since M2-11
zones B and C are real — `?stage=zone-b` is BRINE NEBULA (GALVANIC MAW, the mid-boss SPUME HERALD,
the gap into `?stage=brine-grotto`, PEARL GROTTO) and `?stage=zone-c` DUNE EXPANSE (SANDGRAVE WIDOW);
(guide: [`docs/dev/zones-b-and-c.md`](../../docs/dev/zones-b-and-c.md)); since M2-12 `?stage=zone-d` is
MAGMA DEEP (the dive into the caves, the brick maze, CINDER BASTION — with `&skip=boss` it starts
down in the caves) and `?stage=zone-e` TEMPEST RIDGE (rear attackers, SQUALL STEED) (guide:
[`docs/dev/zones-d-and-e.md`](../../docs/dev/zones-d-and-e.md)); since M2-13 `?stage=zone-f` is CELL
VAULT (regenerating tissue walls, grabbing tentacles, MANTLE REGENT) and `?stage=zone-g` PRISM
LABYRINTH (crystal walls, the cube rush, FACET MONARCH; its prism gallery's four turrets open
`?stage=glimmer-cache`, GLIMMER CACHE) (guide:
[`docs/dev/zones-f-and-g.md`](../../docs/dev/zones-f-and-g.md)); since M2-14 `?stage=zone-h` is IRON
CITADEL (the piston hall, the parade of four earlier bosses, IRON SOVEREIGN — with `&skip=boss` it
starts before the parade) and `?stage=zone-i` ABYSSAL THRONE (depth mines, the ABYSS ARK raid, THE
HOLLOW KING — add `&loadout=full` to beat the ARK's 90 s); a whole run ends with the ending scene
and the credits (guide: [`docs/dev/zones-h-and-i.md`](../../docs/dev/zones-h-and-i.md)); since M2-15 the
title left alone for 12 s plays the attract loop (a bundled zone demo, the high-score tables, the
story crawl — any key returns), a high score is named in the name entry (arrow keys and Enter), and
the mode select adds PRACTICE (a zone from a checkpoint, its own tables) and SOUND TEST (guide:
[`docs/dev/front-end-and-attract.md`](../../docs/dev/front-end-and-attract.md)). Since M1-14 hits
have **game feel**: explosions, sparks, debris, cancel sparkles and a muzzle flash from the
presets of `content/fx/`, the screen shake of a lost ship or a boss's final blast, flashes
(behind a ≤ 3-a-second limiter), the WARNING's dim and rising score numbers;
`?scene=fx-gallery` cycles through every preset and screen effect (guide:
[`docs/dev/fx-and-game-feel.md`](../../docs/dev/fx-and-game-feel.md)). The app passes no effect
settings (since M2-08 the player's saved SHAKE / FLASHES options decide — shake on and normal
flashing by default).

Since M1-19 dev and test builds (`pnpm dev`, `build:test` — what `pnpm test:e2e` opens —,
`build:dev`) carry the **debug tools**: `main.ts` passes `debugToolsFactory({ buildId:
__SHMUP_BUILD__ })` when `__SHMUP_DEV__` is true (`shmupBuildInfo()` in `vite.config.ts`), so F1
overlay (FPS, tick / render ms, draw calls, pools, rank, RNG calls, state hash, boot ms, build
id, frame graph), F2 god mode, F3 hitbox / grid outlines, F4 frame advance, F5 step, F6 slow
motion, F7 next checkpoint, F8 skip to the boss, and `window.__shmupDebug` for the console and the
e2e suite. A release build (`pnpm build`) contains none of it — guide:
[`docs/dev/debug-and-replays.md`](../../docs/dev/debug-and-replays.md).

Since M1-17 **OPTIONS** opens the Options screen (MASTER / MUSIC / SFX volume sliders, CONTROLS),
and the shell keeps the options and the hi-scores in a versioned save in `localStorage`
(`shmup-cup:save.v1`, read before the title; a corrupt one is copied to `shmup-cup:save.corrupt`
and replaced by defaults). This app gives the shell its `inputProfiles`: CONTROLS offers
`KEYBOARD (DEFAULT)`, `KEYBOARD AS REMOTE` and `SPLIT KEYBOARD` (M2-06: two players on one
keyboard — also `?profile=keyboard-split`) (plus a `?profile=` override in use) and switches
at once (with `?debounce=` applied); guide:
[`docs/dev/saves-and-options.md`](../../docs/dev/saves-and-options.md).

Input uses the data-driven profiles of `content/input/` (decision D13): `keyboard-default`
(or the choice saved from OPTIONS → CONTROLS) and `gamepad-standard`. Dev overrides: `?profile=<id>` picks another
keyboard/remote profile — `?profile=keyboard-remote-emulation` makes the keyboard behave like
the Samsung remote (arrows only, the second arrow replaces the first, Enter = OK,
Backspace = Back, P = Play/Pause) — and `?debounce=<ticks>` (0–10) overrides its release
debounce. An unknown `?profile=` logs a `console.warn` and falls back to `keyboard-default`. A
`?profile=` wins over the saved choice when the page loads (a pick in CONTROLS still switches).
Guide: [`docs/dev/input-profiles.md`](../../docs/dev/input-profiles.md).

```sh
pnpm dev                          # from the repo root (= turbo run dev --filter=@shmup/web)
# → http://localhost:5173 (title → game) · ?scene=flight (free flight at once) · ?stage=test-range (scrolling test stage) · ?stage=test-boss (the WARNING and the test boss) · ?stage=hunter-range (the Option Hunters and the blue capsule) · ?stage=direct-range (the MANTA's item carriers) · ?stage=gimmick-range (the M2-07 stage systems) · ?stage=raster-range (the M2-08 raster effects and palette cycles) · ?stage=captain-range / raid-range / twin-range / gauntlet-range (the M2-09 captains, battleship raid, double boss and boss rush) · &loadout=full (fully powered; with the MANTA both levels 8 and the Hyper Arm) · ?scene=showcase (sprite showcase) · ?scene=calibration (test pattern) · ?scene=fx-gallery (every particle preset and screen effect)
pnpm --filter @shmup/web build    # → apps/web/dist (relocatable, base './'), release: no debug tools
pnpm --filter @shmup/web build:test   # the same plus the debug tools (vite build --mode test — what pnpm test:e2e builds)
pnpm --filter @shmup/web build:dev    # likewise, --mode development
pnpm --filter @shmup/web exec vite preview   # serve the last build in apps/web/dist
```

Workspace packages are resolved to their TypeScript sources (`@shmup/source` export
condition), so edits in `packages/*` hot-reload without a package build.

`vite.config.ts` registers the repo's `shmupContent()` plugin, which serves every shipped
`content/**/*.json` as the virtual module `virtual:shmup-content` (typed by
`types/virtual-modules.d.ts`, listed in this app's `tsconfig.json`). In `pnpm dev`, saving a
content JSON file reloads the page. `main.ts` imports the module and hands it to the shared
shell, which validates it at boot; see [`docs/dev/content-data.md`](../../docs/dev/content-data.md).

It also registers **`shmupAssets()`**: the placeholder asset pipeline runs (cached) when the
dev server or a build starts, `virtual:shmup-assets` exports the atlas manifest (inlined)
and the relative page URLs (`assets/atlas/main.png`), and builds emit the pages into
`dist/assets/atlas/`. In `pnpm dev` the atlas is served from `assets/generated/atlas/`;
saving a file under `assets/source/` regenerates it and reloads the page, and editing the
pipeline code in `scripts/assets/` restarts the dev server. `main.ts` imports the module and
the shell loads the pages with `new Image()`; see
[`docs/dev/asset-pipeline.md`](../../docs/dev/asset-pipeline.md).

## Modules

| Module | Status | Responsibility |
|---|---|---|
| `main.ts` | — | Entry: boots into `#game` (with `debugToolsFactory` when `__SHMUP_DEV__`, M1-19), disposes on HMR |
| `boot` | implemented | Composition root: keyboard/gamepad input with the input profiles (`?profile=`, `?debounce=`, saved choice), Web Audio and the browser platform handed to `@shmup/shell`'s `bootShell` (content + atlas loading, boot error screen, renderer, game, rAF loop, audio unlock on the first key or pointer gesture — gamepad buttons do not count — after which the shell's audio engine plays the sounds and, with `?stage=`, the stage's music, M1-15); the scene flow by default (title → game ⇄ pause …, M1-16), `?scene=flight` for free flight, `?stage=<id>` (`stageFromSearch`, checked with `contentStageIds`), `?loadout=full` (`loadoutFromSearch`, M1-10), `?scene=showcase` / `?scene=calibration` / `?scene=fx-gallery` (M1-14) |
| `platform` | partial | Browser `Platform`: localStorage (memory fallback), visibility lifecycle, no `exit` |

The rAF frame loop moved to [`@shmup/shell`](../../packages/shell/README.md) (M1-04).

The browser build uses Vite's default modern target — it is the *dev* target. Anything
that must run on the TV is built by `apps/tizen` (Chromium 69, classic IIFE).
