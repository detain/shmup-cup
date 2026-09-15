# @shmup/shell

The shared **browser host** of `apps/web` and `apps/tizen` (plan decision D34): one boot path
for the browser and the TV, so the two apps stay thin adapters (input, audio, platform, the
Tizen Back key).

```ts
import contentFiles from 'virtual:shmup-content';
import assets from 'virtual:shmup-assets';
import { bootShell, defaultStageId, sceneFromSearch } from '@shmup/shell';

const shell = await bootShell({
  canvas,
  win: window,
  contentFiles,
  assets,
  input, // createWebInput(...)
  audio, // createWebAudio() — its context / bus() graph is what the audio engine plays through
  platform: (renderer) => createWebPlatform({ input, audio, webgl2: renderer.webGLVersion === 2, ... }),
  gameConfig: { remoteMode: false, stage: defaultStageId(contentFiles) }, // zone A (M1-18) — the campaign's start zone (M2-10)
  scene: sceneFromSearch(location.search), // 'game' (default: the scene flow) | 'flight' | 'showcase' | 'calibration' | 'fx-gallery'
  audioUnlock: 'gesture', // 'immediate' on TV
  contentOwners: { 'input-profiles': profiles.load }, // optional: keep the parsed input profiles
  effects: { screenShake: true, reduceFlashing: false }, // optional (M1-14; the defaults)
  inputProfiles: { choices, active, apply }, // optional (M1-17): the Options screen's CONTROLS
  debugTools: __SHMUP_DEV__ ? debugToolsFactory({ buildId: __SHMUP_BUILD__ }) : null, // M1-19
});
shell.debug?.api.sceneId; // dev / test builds: the tools, also window.__shmupDebug (M1-19)
shell.loadedSave.status; // 'empty' | 'ok' | 'migrated' | 'corrupt' | 'unreadable' (M1-17)
shell.bootTiming.readyMs; // launch-to-ready time, also on the canvas as data-shmup-boot-ms
shell.events.on(SimEventKind.Music, (event) => { /* presentation handler */ });
// the scene flow and free flight already feed the game's events to the renderer's particles,
// shake, flash, dim and score popups (connectFxEvents, M1-14) and to the audio engine
// (connectAudioEvents, M1-15); the scene flow's Options screen reaches the audio buses and the
// app's input profile through connectOptionEvents (M1-17); the flow's PrepareStage events (the
// zone map's launch, the title, a run or practice start) prepare that stage's music set through
// connectStagePreparation (M2-10)
```

Boot sequence: progress bar (plain 2D overlay canvas) → content validation (core kinds + the
owners of foreign kinds — `contentOwners`, then `DEFAULT_CONTENT_OWNERS` (`input-profiles` →
`@shmup/input-web`, `fx` → `@shmup/render-pixi`, whose parsed presets the shell keeps as
`shell.fx`, `sfx` / `music` → `@shmup/audio-web`, whose bank and music library the shell keeps
for its audio engine); any issue → **boot error screen** listing `path: message`) → atlas pages
via `new Image()` from relative URLs (no `fetch`, decision D25) → atlas → renderer (WebGL1
first; particles seeded from the game's seed, presets via `setFxContent`) → platform (the apps
apply their input profiles in this factory) → **save** (M1-17: `loadSave(platform.storage)` —
a corrupt or unreadable save means defaults, never a boot error — then the saved volumes through
`applyAudioOptions` and the saved input profile through `inputProfiles.apply(id, 'save')`) → game
(the scene flow gets the `SaveStore` and the profile choices) → audio (M1-15: the engine renders the SFX
bank — `LOADING SOUND` — and prepares the booted stage's music set, `stageMusicCues`, plus the
title theme for the scene flow — `LOADING MUSIC`; nothing is rendered or decoded during play —
since M2-10 another stage's set is prepared between Worlds on `PrepareStage`; then
`game.scenes.finishBoot()`) → scene (the default `game` runs the core **scene flow** — the game is
created with `{ scenes: 'boot' }` and drawn through `createSceneView`; the scene flow and free
flight connect the game's events to the renderer's effects — `connectFxEvents` — and to the
audio engine — `connectAudioEvents`; the scene flow also applies the Options screen's `UserOption`
events — `connectOptionEvents` — and, since M2-10, answers `PrepareStage` —
`connectStagePreparation`) → lifecycle (suspend; window `blur` clears held input — M1-17) /
audio unlock (the engine attaches right after `unlock()`) / resize wiring → rAF frame loop (`input.setContext` when `game.inputContext` changed
→ `game.frame` → `sceneView.follow()` → `game.events.drain(dispatch)` →
`shell.audioEngine.endFrame()` → `renderer.render`, plan §3.3). The canvas carries
`data-shmup-state="loading" | "running" | "error"`, `data-shmup-scene` (the scene flow's top
scene — `title`, `difficulty`, `weaponSelect`, `autoOrder`, `game`, `pause`, `options`, `continue`, `confirm`, `stageClear`, `map`, `ending`, … — or the dev scene's name) and, once
running, `data-shmup-boot-ms` (the launch-to-ready time, `Shell.bootTiming` — M1-17). With a
`debugTools` factory (dev / test builds only, M1-19) the renderer also counts its draw calls, and
once boot is done the **debug tools** bind their keys — F1–F8 on the web; on the TV nothing until
the remote's Pause, Ch+, Ch+, Ch+ (then 1–8) — publish `window.__shmupDebug`, time each frame's
ticks and render and rebuild the overlay before `renderer.render`
([`docs/dev/debug-and-replays.md`](../../docs/dev/debug-and-replays.md)). Scenes, menus
and the HUD: [`docs/dev/scenes-and-ui.md`](../../docs/dev/scenes-and-ui.md); the save, the user
options and the Options screen: [`docs/dev/saves-and-options.md`](../../docs/dev/saves-and-options.md);
the display options and render interpolation (M2-08):
[`docs/dev/presentation-polish.md`](../../docs/dev/presentation-polish.md).

## Modules

| Module | Status | Responsibility |
|---|---|---|
| `boot` | implemented | `bootShell()`, `sceneFromSearch()`, `ShellBootError`; `DEFAULT_STAGE_ID` / `defaultStageId(files)` — the stage the apps' scene flow plays, zone A (M1-18 — [`docs/dev/zone-a-and-playtest.md`](../../docs/dev/zone-a-and-playtest.md#the-game-plays-zone-a)); owns the audio engine (`Shell.audioEngine`, M1-15); reads the save before the title and exposes it (`Shell.loadedSave`, `Shell.save`), applies the saved volumes, input profile (`ShellOptions.inputProfiles`) and display options (`applyDisplayOptions`: the bullet palette — M2-02 —, the scale mode, shake, flashing and hitbox markers — M2-08; `ShellOptions.effects` wins), switches render interpolation from the refresh probe (`ShellOptions.interpolation`, `Shell.refresh` — M2-08), times the boot (`ShellOptions.now`, `Shell.bootTiming`, `BOOT_MS_ATTRIBUTE`) and clears held input on `blur` (M1-17) |
| `loader` | implemented | Atlas page images (`loadImages`), content validation routed by kind (`loadGameContent`, `DEFAULT_CONTENT_OWNERS` — `input-profiles`, `fx`, `sfx`, `music`; script ids checked against the core's `KNOWN_SCRIPT_IDS` and enemies against their behaviours since M1-08, weapons against theirs (`checkWeaponBehaviors`) since M1-10; the core's `ENGINE_SPRITES` — bullets, laser beam, since M1-10 the Option orb, since M1-11 the power capsule and the Force Field — interned by default since M1-09) |
| `dispatch` | implemented | Sim event → presentation handler routing, allocation-free; `connectFxEvents` feeds the renderer's particles, shake / flash / dim and score popups from the World's events (M1-14); `connectAudioEvents` feeds `Sfx` / `Music` / `MusicDuck` to the audio engine (M1-15); `connectOptionEvents` turns the Options screen's `UserOption` events into bus volumes (`volumeGain`; SFX drives `sfx` and `ui`) and profile switches, `applyAudioOptions` sets the saved volumes at boot (M1-17); since M2-02 also the bullet palette event → a callback (the renderer's `setBulletPalette`); since M2-08 the SCALE / SHAKE / FLASHES / HITBOX events → a `DisplayTarget` (the renderer) and `applyDisplayOptions` for the saved ones; M2-09's BOSS HP event is ignored — the core HUD reads the saved option; since M2-10 `connectStagePreparation` answers `PrepareStage` — the audio engine prepares that stage's music set plus the title theme (`StagePreparationTarget`) |
| `error-screen` | implemented | Boot overlay: progress bar and error screen (Canvas 2D) |
| `frame-loop` | implemented | `requestAnimationFrame` driver (moved here from the apps); the refresh-rate probe `createRefreshMonitor` (M2-08: the interquartile mean of the last 31 rAF deltas — `INTERPOLATION_MIN_HZ` 70 decides render interpolation) |
| `scene-view` | implemented | The scene flow's picture (M1-16, the default scene `game`): the core flow's frame plus a drifting starfield behind the title and under a game in open space (a stage's own view as is), the camera the audio pans against, a count of new Worlds (the shell then clears particles and popups); since M2-03 it wraps whichever World view the flow's frame shows — the game's, or the weapon select's live preview; the canvas carries `data-shmup-scene` (the top scene's id) |
| `flight` | implemented | Dev scene since M1-06 ("free flight", `?scene=flight` — the default until M1-16): the game's World (the KESTREL under player control) over a drifting starfield — or, with a stage (`?stage=` in the web app, M1-07), the stage's parallax and terrain, the enemies its timeline spawns (M1-08) and their bullets and lasers (M1-09) — HUD bars; the ship's autofired shots and its Options are World batches too (M1-10), and so are the power capsules and the Force Field (M1-11 — the power meter is drawn by the M1-16 HUD); the HUD shows player 1's score, `HI` and the session hi-score, `lives − 1` stock ships and `GAME OVER` (red) in place of the title once the World's status says so, rebuilt only on a change (M1-12); a boss's parts are a World batch, and a running boss WARNING (`view.warning`) is drawn as its text on a translucent band in the UI list, red / yellow every 16 ticks, rebuilt only on a change (M1-13, `?stage=test-boss`); its sprites are appended to the content's sprite table |
| `showcase` | implemented | The M1-04 sprite showcase (`?scene=showcase`): parallax stars, KESTREL, HUD, bitmap text |
| `fx-gallery` | implemented | `?scene=fx-gallery` (M1-14): every particle preset of `content/fx/`, then the shakes, flashes, the dim and the score popups, one station a second |
| `debug` | implemented | The dev / test builds' debug tools (M1-19; not named in the plan — keys and timing are host work): `debugToolsFactory` / `createDebugTools` (core `createDebugControls` + render-pixi `createDebugOverlay`), `DEBUG_KEYS` (F1–F8, and 1–8 on the TV), the TV unlock `DEBUG_UNLOCK_SEQUENCE` (Pause, Ch+ ×3 within 3 s), per-frame timing hooks, `window.__shmupDebug` (`ShmupDebugApi`; its `renderer` since M2-08) |

Boot error screen titles: `CONTENT COULD NOT BE READ`, `CONTENT ERRORS: N PROBLEMS` (one
`<file>:<json path>: message` line per issue), `ATLAS PAGE FAILED TO LOAD`,
`ATLAS DOES NOT MATCH ITS MANIFEST`, `WEBGL IS NOT AVAILABLE`, `SHMUP CUP FAILED TO START`,
`AUDIO FAILED TO LOAD` (a recorded sound or track of `content/audio/` could not be fetched or
decoded, M1-15).
`bootShell` then rejects with a `ShellBootError` (`lines`, `issues`, `reason`) after releasing
everything it created. Content kinds that are neither core kinds nor claimed by an owner
(`contentOwners` or `DEFAULT_CONTENT_OWNERS`) are issues, so a new kind cannot ship
unvalidated.

The input adapter must implement `ShellInput`: `PlatformInput` plus `clear()` (suspend),
`setContext(ctx)` (the `game` / `menu` binding tables, decision D15 — called once at boot and
before a frame's ticks whenever `game.inputContext` changed), optionally `setSeats(count)` (M2-06 —
the player seats for two-player co-op, forwarded the same way from `game.inputSeats`; an adapter
without it routes every device to player 1) and `destroy()`. `@shmup/input-web`'s
`WebInput` is one; see [`docs/dev/input-profiles.md`](../../docs/dev/input-profiles.md).

Dependency direction (plan §3.1): `apps/* → @shmup/shell → {render-pixi, audio-web, input-web}
→ core`. Today the shell imports `@shmup/core`, `@shmup/render-pixi` and `@shmup/input-web`
(only `loadInputProfiles` for the default `input-profiles` owner, M1-05); render-pixi also
provides the `fx` owner (`loadFxContent`) and the effect types (M1-14); `@shmup/audio-web`
provides the `sfx` / `music` owners and the audio engine (`createAudioEngine`, M1-15: the boot
renders the SFX bank and the running stage's music set, the engine attaches to the audio
back-end's buses once `unlock()` has created the context). The apps create the input and audio
adapters and pass them in as interfaces (`ShellInput`, `IAudio` — a `WebAudio` also exposes its
graph, `context` and `bus()`, which the engine plays through).

Guide: [`docs/dev/rendering-and-shell.md`](../../docs/dev/rendering-and-shell.md#the-browser-shell-shmupshell);
the game-feel wiring and the fx gallery: [`docs/dev/fx-and-game-feel.md`](../../docs/dev/fx-and-game-feel.md);
the audio wiring: [`docs/dev/audio.md`](../../docs/dev/audio.md#the-shells-wiring);
exports: [`docs/dev/api-reference.md`](../../docs/dev/api-reference.md#shmupshell).

Tests run in Node with fakes for the window, images and the WebGL renderer; the workers get
`ALLOCATION_GUARD_EXEC_ARGV` (`--expose-gc --allow-natives-syntax`), so the scene view's, the free-flight scene's and the fx gallery's per-frame
`update()` and the
whole game-feel event path (`connectFxEvents` → particles / effects / popups) and the audio
event path (`connectAudioEvents` → a real `AudioEngine` on a fake Web Audio context: dropped,
deduped and unchanged sounds and music) are checked with the core's allocation guard;
`dispatch-audio-runtime` plays the shipped boss range from the real sim through the engine. The real browser path is covered by `pnpm test:e2e` (headless Chromium,
`test/e2e/` — `scenes.spec.ts` starts a game from the title with Enter / OK and pauses it with
Esc / Back in both builds (and the Tizen exit confirmation), `flight.spec.ts` flies the KESTREL
with arrow keys in both builds (on `?scene=flight`), `boss.spec.ts`
checks the WARNING band and the boss on `?stage=test-boss`, `fx-gallery.spec.ts` the gallery's
label and explosions in both builds, `audio.spec.ts` the first-key-press unlock and the zone
theme's exact loop points in the web build and the shots' sounds from boot in the Tizen build,
`smoke.spec.ts` the M1 gameplay smoke and the debug keys / TV unlock on the test builds —
M1-19). How the World the scene draws works:
[`docs/dev/sim-world.md`](../../docs/dev/sim-world.md); the boss and its WARNING:
[`docs/dev/bosses-and-warning.md`](../../docs/dev/bosses-and-warning.md).
