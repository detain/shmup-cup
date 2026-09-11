# @shmup/web

The **browser dev target** (Vite dev server with HMR) and the renderer that
`apps/electron` loads. Wires `@shmup/core` + `@shmup/render-pixi` + `@shmup/audio-web` +
`@shmup/input-web` together through the shared shell [`@shmup/shell`](../../packages/shell/README.md).
It boots behind a loading bar (or a boot error screen listing every problem) into the
**sprite showcase**; `?scene=calibration` shows the pixel-art calibration test pattern
instead. There is no gameplay yet.

```sh
pnpm dev                          # from the repo root (= turbo run dev --filter=@shmup/web)
# → http://localhost:5173 (showcase) · http://localhost:5173/?scene=calibration (test pattern)
pnpm --filter @shmup/web build    # → apps/web/dist (relocatable, base './')
pnpm --filter @shmup/web exec vite preview   # serve the production build (what pnpm test:e2e opens)
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
| `main.ts` | — | Entry: boots into `#game`, disposes on HMR |
| `boot` | implemented | Composition root: keyboard/gamepad input, Web Audio and the browser platform handed to `@shmup/shell`'s `bootShell` (content + atlas loading, boot error screen, renderer, game, rAF loop, audio unlock on first gesture); `?scene=calibration` for the test pattern |
| `platform` | partial | Browser `Platform`: localStorage (memory fallback), visibility lifecycle, no `exit` |

The rAF frame loop moved to [`@shmup/shell`](../../packages/shell/README.md) (M1-04).

The browser build uses Vite's default modern target — it is the *dev* target. Anything
that must run on the TV is built by `apps/tizen` (Chromium 69, classic IIFE).
