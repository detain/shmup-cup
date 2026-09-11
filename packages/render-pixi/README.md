# @shmup/render-pixi

`IRenderer` implementation on **PixiJS v8**, used as a *renderer only* — no `Application`,
no Pixi ticker; the host's fixed-step loop calls `render()` (`shmup_tech.md` §4.1).

- **WebGL1 first** (`preferWebGLVersion: 1`; WebGL2 on Tizen 5.5 GPUs is unverified —
  `webGLVersion` reports what was obtained).
- The game is drawn into a **384×216 render texture** (nearest-neighbour), then presented
  with **one integer-scaled quad**, centred with a letterbox: ×5 on 1080p, ×3 on 720p,
  ×10 on 4K (`shmup_feat.md` §3, `shmup_tech.md` §2.2).
- Until real scenes exist it shows a **calibration test pattern**: 1-px checker border,
  16-px grid, colour bars, a placeholder ship and a marker that moves one pixel per tick.

```ts
import { createPixiRenderer } from '@shmup/render-pixi';

const renderer = await createPixiRenderer({ canvas, displayWidth: innerWidth, displayHeight: innerHeight });
renderer.render(game.renderFrame());
```

## Modules

| Module | Status | Responsibility |
|---|---|---|
| `renderer` | partial | Pixi WebGL renderer, low-res target, upscale pass |
| `viewport` | partial | Integer-scale letterbox math (pure) |
| `test-pattern` | implemented | Calibration scene |
| `palette` | partial | Placeholder colours (VA-panel-friendly, no pure black) |
| `atlas` | placeholder | Texture atlases ≤ 2048² — will load the `virtual:shmup-assets` manifest and pages built by the asset pipeline ([`docs/dev/asset-pipeline.md`](../../docs/dev/asset-pipeline.md), M1-04) |
| `layers` | placeholder | Draw-order layer stack (bullets above explosions) |
| `sprites` | placeholder | Sprite views over sim pools, interpolation, hit flash (swap to the `<name>@flash` sprite) |
| `text` | placeholder | Bitmap-font text |
| `ui` | placeholder | HUD + canvas menus |
| `particles` | placeholder | Pooled cosmetic particles |
| `effects` | placeholder | Shake/flash application, raster & palette effects, CRT |
| `debug` | placeholder | Debug overlay |

Tests run in Node: pure modules are tested fully; Pixi objects that need no GPU (the test
pattern's display tree) are exercised too. The WebGL path runs in `apps/web` / `apps/tizen`.

**Bundle size note:** importing from `'pixi.js'` pulls Pixi's default extension set; the
whole Tizen `app.js` is ~129 KB gzip today. Dropping unused Pixi subsystems
(accessibility, DOM, filters, events, …) is a later optimisation step.
