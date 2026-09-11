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

Dependency direction: `apps/* → @shmup/shell → {render-pixi, audio-web, input-web} → core`.
Tests run in Node with fakes for the window, images and the WebGL renderer; the real browser
path is covered by `pnpm test:e2e` (headless Chromium, `test/e2e/`).
