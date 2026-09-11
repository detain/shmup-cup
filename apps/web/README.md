# @shmup/web

The **browser dev target** (Vite dev server with HMR) and the renderer that
`apps/electron` loads. Wires `@shmup/core` + `@shmup/render-pixi` + `@shmup/audio-web` +
`@shmup/input-web` together and, for now, shows the pixel-art calibration test pattern.

```sh
pnpm dev                          # from the repo root (= turbo run dev --filter=@shmup/web)
# → http://localhost:5173 — arrows/WASD, gamepads; the marker moves 60 px per second
pnpm --filter @shmup/web build    # → apps/web/dist (relocatable, base './')
```

Workspace packages are resolved to their TypeScript sources (`@shmup/source` export
condition), so edits in `packages/*` hot-reload without a package build.

## Modules

| Module | Status | Responsibility |
|---|---|---|
| `main.ts` | — | Entry: boots into `#game`, disposes on HMR |
| `boot` | partial | Composition root: input, audio, renderer, platform, game, rAF loop, resize, audio unlock on first gesture |
| `platform` | partial | Browser `Platform`: localStorage (memory fallback), visibility lifecycle, no `exit` |
| `frame-loop` | implemented | `requestAnimationFrame` driver |

The browser build uses Vite's default modern target — it is the *dev* target. Anything
that must run on the TV is built by `apps/tizen` (Chromium 69, classic IIFE).
