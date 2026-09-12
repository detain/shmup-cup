# @shmup/shell

The shared **browser host** of `apps/web` and `apps/tizen` (plan decision D34): one boot path
for the browser and the TV, so the two apps stay thin adapters (input, audio, platform, the
Tizen Back key).

```ts
import contentFiles from 'virtual:shmup-content';
import assets from 'virtual:shmup-assets';
import { bootShell, sceneFromSearch } from '@shmup/shell';

const shell = await bootShell({
  canvas,
  win: window,
  contentFiles,
  assets,
  input, // createWebInput(...)
  audio, // createWebAudio()
  platform: (renderer) => createWebPlatform({ input, audio, webgl2: renderer.webGLVersion === 2, ... }),
  gameConfig: { remoteMode: false },
  scene: sceneFromSearch(location.search), // 'flight' (default) | 'showcase' | 'calibration' | 'fx-gallery'
  audioUnlock: 'gesture', // 'immediate' on TV
  contentOwners: { 'input-profiles': profiles.load }, // optional: keep the parsed input profiles
  effects: { screenShake: true, reduceFlashing: false }, // optional (M1-14; the defaults)
});
shell.events.on(SimEventKind.Music, (event) => { /* presentation handler */ });
// free flight already feeds the World's events to the renderer's particles, shake, flash, dim
// and score popups (connectFxEvents, M1-14) and to the audio engine (connectAudioEvents, M1-15)
```

Boot sequence: progress bar (plain 2D overlay canvas) → content validation (core kinds + the
owners of foreign kinds — `contentOwners`, then `DEFAULT_CONTENT_OWNERS` (`input-profiles` →
`@shmup/input-web`, `fx` → `@shmup/render-pixi`, whose parsed presets the shell keeps as
`shell.fx`); any issue → **boot error screen** listing `path: message`) → atlas pages
via `new Image()` from relative URLs (no `fetch`, decision D25) → atlas → renderer (WebGL1
first; particles seeded from the game's seed, presets via `setFxContent`) → platform (the apps
apply their input profiles in this factory) → game → scene (free flight connects the World's
events to the renderer's effects — `connectFxEvents`) → lifecycle /
audio unlock / resize wiring → rAF frame loop (`input.setContext` when `game.inputContext`
changed → `game.frame` → `game.events.drain(dispatch)` → `renderer.render`, plan §3.3). The
canvas carries `data-shmup-state="loading" | "running" | "error"`.

## Modules

| Module | Status | Responsibility |
|---|---|---|
| `boot` | implemented | `bootShell()`, `sceneFromSearch()`, `ShellBootError` |
| `loader` | implemented | Atlas page images (`loadImages`), content validation routed by kind (`loadGameContent`, `DEFAULT_CONTENT_OWNERS`; script ids checked against the core's `KNOWN_SCRIPT_IDS` and enemies against their behaviours since M1-08, weapons against theirs (`checkWeaponBehaviors`) since M1-10; the core's `ENGINE_SPRITES` — bullets, laser beam, since M1-10 the Option orb, since M1-11 the power capsule and the Force Field — interned by default since M1-09) |
| `dispatch` | implemented | Sim event → presentation handler routing, allocation-free; `connectFxEvents` feeds the renderer's particles, shake / flash / dim and score popups from the World's events (M1-14); `connectAudioEvents` feeds `Sfx` / `Music` / `MusicDuck` to the audio engine (M1-15) |
| `error-screen` | implemented | Boot overlay: progress bar and error screen (Canvas 2D) |
| `frame-loop` | implemented | `requestAnimationFrame` driver (moved here from the apps) |
| `flight` | implemented | Default dev scene since M1-06 ("free flight"): the game's World (the KESTREL under player control) over a drifting starfield — or, with a stage (`?stage=` in the web app, M1-07), the stage's parallax and terrain, the enemies its timeline spawns (M1-08) and their bullets and lasers (M1-09) — HUD bars; the ship's autofired shots and its Options are World batches too (M1-10), and so are the power capsules and the Force Field (M1-11 — the power meter is drawn by the M1-16 HUD); the HUD shows player 1's score, `HI` and the session hi-score, `lives − 1` stock ships and `GAME OVER` (red) in place of the title once the World's status says so, rebuilt only on a change (M1-12); a boss's parts are a World batch, and a running boss WARNING (`view.warning`) is drawn as its text on a translucent band in the UI list, red / yellow every 16 ticks, rebuilt only on a change (M1-13, `?stage=test-boss`); its sprites are appended to the content's sprite table |
| `showcase` | implemented | The M1-04 sprite showcase (`?scene=showcase`): parallax stars, KESTREL, HUD, bitmap text |
| `fx-gallery` | implemented | `?scene=fx-gallery` (M1-14): every particle preset of `content/fx/`, then the shakes, flashes, the dim and the score popups, one station a second |

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
before a frame's ticks whenever `game.inputContext` changed) and `destroy()`. `@shmup/input-web`'s
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
exports: [`docs/dev/api-reference.md`](../../docs/dev/api-reference.md#shmupshell).

Tests run in Node with fakes for the window, images and the WebGL renderer; the workers get
`--expose-gc`, so the free-flight scene's and the fx gallery's per-frame `update()` and the
whole game-feel event path (`connectFxEvents` → particles / effects / popups) are checked with
the core's allocation guard. The real browser path is covered by `pnpm test:e2e` (headless Chromium,
`test/e2e/` — `flight.spec.ts` flies the KESTREL with arrow keys in both builds, `boss.spec.ts`
checks the WARNING band and the boss on `?stage=test-boss`, `fx-gallery.spec.ts` the gallery's
label and explosions in both builds). How the World the scene draws works:
[`docs/dev/sim-world.md`](../../docs/dev/sim-world.md); the boss and its WARNING:
[`docs/dev/bosses-and-warning.md`](../../docs/dev/bosses-and-warning.md).
