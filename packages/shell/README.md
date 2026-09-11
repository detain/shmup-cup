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
  scene: sceneFromSearch(location.search), // 'flight' (default) | 'showcase' | 'calibration'
  audioUnlock: 'gesture', // 'immediate' on TV
  contentOwners: { 'input-profiles': profiles.load }, // optional: keep the parsed input profiles
});
shell.events.on(SimEventKind.Shake, (event) => { /* presentation handler */ });
```

Boot sequence: progress bar (plain 2D overlay canvas) → content validation (core kinds + the
owners of foreign kinds — `contentOwners`, then `DEFAULT_CONTENT_OWNERS` (`input-profiles` →
`@shmup/input-web`); any issue → **boot error screen** listing `path: message`) → atlas pages
via `new Image()` from relative URLs (no `fetch`, decision D25) → atlas → renderer (WebGL1
first) → platform (the apps apply their input profiles in this factory) → game → lifecycle /
audio unlock / resize wiring → rAF frame loop (`input.setContext` when `game.inputContext`
changed → `game.frame` → `game.events.drain(dispatch)` → `renderer.render`, plan §3.3). The
canvas carries `data-shmup-state="loading" | "running" | "error"`.

## Modules

| Module | Status | Responsibility |
|---|---|---|
| `boot` | implemented | `bootShell()`, `sceneFromSearch()`, `ShellBootError` |
| `loader` | implemented | Atlas page images (`loadImages`), content validation routed by kind (`loadGameContent`, `DEFAULT_CONTENT_OWNERS`) |
| `dispatch` | implemented | Sim event → presentation handler routing, allocation-free |
| `error-screen` | implemented | Boot overlay: progress bar and error screen (Canvas 2D) |
| `frame-loop` | implemented | `requestAnimationFrame` driver (moved here from the apps) |
| `flight` | implemented | Default dev scene since M1-06 ("free flight"): the game's World (the KESTREL under player control) over a drifting starfield — or, with a stage (`?stage=` in the web app, M1-07), the stage's parallax and terrain — HUD bars; its sprites are appended to the content's sprite table |
| `showcase` | implemented | The M1-04 sprite showcase (`?scene=showcase`): parallax stars, KESTREL, HUD, bitmap text |

Boot error screen titles: `CONTENT COULD NOT BE READ`, `CONTENT ERRORS: N PROBLEMS` (one
`<file>:<json path>: message` line per issue), `ATLAS PAGE FAILED TO LOAD`,
`ATLAS DOES NOT MATCH ITS MANIFEST`, `WEBGL IS NOT AVAILABLE`, `SHMUP CUP FAILED TO START`.
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
(only `loadInputProfiles` for the default `input-profiles` owner, M1-05); the apps create the
input and audio adapters and pass them in as interfaces (`ShellInput`, `IAudio`).

Guide: [`docs/dev/rendering-and-shell.md`](../../docs/dev/rendering-and-shell.md#the-browser-shell-shmupshell);
exports: [`docs/dev/api-reference.md`](../../docs/dev/api-reference.md#shmupshell).

Tests run in Node with fakes for the window, images and the WebGL renderer; the workers get
`--expose-gc`, so the free-flight scene's per-frame `update()` is checked with the core's
allocation guard. The real browser path is covered by `pnpm test:e2e` (headless Chromium,
`test/e2e/` — `flight.spec.ts` flies the KESTREL with arrow keys in both builds). How the World
the scene draws works: [`docs/dev/sim-world.md`](../../docs/dev/sim-world.md).
