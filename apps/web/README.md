# @shmup/web

The **browser dev target** (Vite dev server with HMR) and the renderer that
`apps/electron` loads. Wires `@shmup/core` + `@shmup/render-pixi` + `@shmup/audio-web` +
`@shmup/input-web` together through the shared shell [`@shmup/shell`](../../packages/shell/README.md).
It boots behind a loading bar (or a boot error screen listing every problem) into **free
flight** (M1-06): the game's World with the KESTREL under keyboard / gamepad control over an
empty starfield. `?scene=showcase` shows the M1-04 sprite showcase and `?scene=calibration`
the pixel-art calibration test pattern instead. `?stage=<id>` runs that stage instead of
open space (M1-07 — `?stage=test-range` is the dev stage: scrolling camera, generated
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
drawn by the M1-16 HUD (guide: [`docs/dev/powerups-and-shields.md`](../../docs/dev/powerups-and-shields.md)).
Since M1-12 rock, enemies, bullets and lasers **destroy the ship** (a Force Field takes all but
the rock): it flies back in blinking with one power level less (the default `classic` penalty),
the HUD shows the score, `HI` and the spare ships, and after the third ship the top bar says
`GAME OVER` — reload to play again (guide:
[`docs/dev/death-and-scoring.md`](../../docs/dev/death-and-scoring.md)). There is no URL
parameter for the penalty or the lives yet.

Input uses the data-driven profiles of `content/input/` (decision D13): `keyboard-default`
(or the saved choice) and `gamepad-standard`. Dev overrides: `?profile=<id>` picks another
keyboard/remote profile — `?profile=keyboard-remote-emulation` makes the keyboard behave like
the Samsung remote (arrows only, the second arrow replaces the first, Enter = OK,
Backspace = Back, P = Play/Pause) — and `?debounce=<ticks>` (0–10) overrides its release
debounce. An unknown `?profile=` logs a `console.warn` and falls back to `keyboard-default`.
Guide: [`docs/dev/input-profiles.md`](../../docs/dev/input-profiles.md).

```sh
pnpm dev                          # from the repo root (= turbo run dev --filter=@shmup/web)
# → http://localhost:5173 (free flight) · ?stage=test-range (scrolling test stage) · &loadout=full (fully powered) · ?scene=showcase (sprite showcase) · ?scene=calibration (test pattern)
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
| `boot` | implemented | Composition root: keyboard/gamepad input with the input profiles (`?profile=`, `?debounce=`, saved choice), Web Audio and the browser platform handed to `@shmup/shell`'s `bootShell` (content + atlas loading, boot error screen, renderer, game, rAF loop, audio unlock on first gesture); free flight by default, `?stage=<id>` (`stageFromSearch`, checked with `contentStageIds`), `?loadout=full` (`loadoutFromSearch`, M1-10), `?scene=showcase` / `?scene=calibration` |
| `platform` | partial | Browser `Platform`: localStorage (memory fallback), visibility lifecycle, no `exit` |

The rAF frame loop moved to [`@shmup/shell`](../../packages/shell/README.md) (M1-04).

The browser build uses Vite's default modern target — it is the *dev* target. Anything
that must run on the TV is built by `apps/tizen` (Chromium 69, classic IIFE).
