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
  scene: sceneFromSearch(location.search), // 'showcase' (default) | 'calibration'
  audioUnlock: 'gesture', // 'immediate' on TV
});
shell.events.on(SimEventKind.Shake, (event) => { /* presentation handler */ });
```

Boot sequence: progress bar (plain 2D overlay canvas) → content validation (core kinds + the
owners of foreign kinds; any issue → **boot error screen** listing `path: message`) → atlas
pages via `new Image()` from relative URLs (no `fetch`, decision D25) → atlas → renderer
(WebGL1 first) → platform → game → lifecycle / audio unlock / resize wiring → rAF frame loop
(`game.frame` → `game.events.drain(dispatch)` → `renderer.render`, plan §3.3). The canvas
carries `data-shmup-state="loading" | "running" | "error"`.

## Modules

| Module | Status | Responsibility |
|---|---|---|
| `boot` | implemented | `bootShell()`, `sceneFromSearch()`, `ShellBootError` |
| `loader` | implemented | Atlas page images (`loadImages`), content validation routed by kind (`loadGameContent`) |
| `dispatch` | implemented | Sim event → presentation handler routing, allocation-free |
| `error-screen` | implemented | Boot overlay: progress bar and error screen (Canvas 2D) |
| `frame-loop` | implemented | `requestAnimationFrame` driver (moved here from the apps) |
| `showcase` | implemented | Default dev scene until the World exists (M1-06): parallax stars, KESTREL, HUD, bitmap text |

Boot error screen titles: `CONTENT COULD NOT BE READ`, `CONTENT ERRORS: N PROBLEMS` (one
`<file>:<json path>: message` line per issue), `ATLAS PAGE FAILED TO LOAD`,
`ATLAS DOES NOT MATCH ITS MANIFEST`, `WEBGL IS NOT AVAILABLE`, `SHMUP CUP FAILED TO START`.
`bootShell` then rejects with a `ShellBootError` (`lines`, `issues`, `reason`) after releasing
everything it created. Content kinds that are neither core kinds nor claimed by a
`contentOwners` entry are issues, so a new kind cannot ship unvalidated.

Dependency direction (plan §3.1): `apps/* → @shmup/shell → {render-pixi, audio-web, input-web}
→ core`. Today the shell imports only `@shmup/core` and `@shmup/render-pixi`; the apps create
the input and audio adapters and pass them in as core interfaces (`PlatformInput`, `IAudio`).

Guide: [`docs/dev/rendering-and-shell.md`](../../docs/dev/rendering-and-shell.md#the-browser-shell-shmupshell);
exports: [`docs/dev/api-reference.md`](../../docs/dev/api-reference.md#shmupshell).

Tests run in Node with fakes for the window, images and the WebGL renderer; the real browser
path is covered by `pnpm test:e2e` (headless Chromium, `test/e2e/`).
