# @shmup/render-pixi

`IRenderer` implementation on **PixiJS v8**, used as a *renderer only* — no `Application`,
no Pixi ticker; the host's fixed-step loop calls `render()` (`shmup_tech.md` §4.1).

- **WebGL1 first** (`preferWebGLVersion: 1`; WebGL2 on Tizen 5.5 GPUs is unverified —
  `webGLVersion` reports what was obtained).
- The game is drawn into a **384×216 render texture** (nearest-neighbour), then presented
  with **one integer-scaled quad**, centred with a letterbox: ×5 on 1080p, ×3 on 720p,
  ×10 on 4K (`shmup_feat.md` §3, `shmup_tech.md` §2.2).
- It draws the core's render contract (plan §3.4) from the sprite atlas with zero per-frame
  allocation: world sprite batches bound once per `WorldView` (the enemy bullets are one), the
  enemy lasers (rotated warning lines and stretched beams, M1-09), the bending lasers (one
  un-rotated segment sprite per node, M2-02), HUD / UI draw lists as glyph
  and rect quads, screen shake / flash / dim. Since M1-14 it also owns the **game feel** the
  host feeds from the sim's events: a 256-particle pool driven by the presets of `content/fx/`
  (`loadFxContent` is the owner of the `fx` content kind), 16 rising score popups, and screen
  effects — an integer shake mirroring the sim's, a flash tinted per kind behind a ≤ 3-a-second
  limiter (reduced flashing), a playfield dim — all advanced by simulated ticks, under the enemy
  bullets. In dev / test builds it also draws the **debug overlay** (M1-19, `createDebugOverlay`):
  a panel with FPS, tick / render ms, draw calls (`countDrawCalls` → `renderer.drawCalls`), pool
  usage, rank, RNG calls, the state hash, WebGL version, boot ms and a 60-frame graph, plus
  hitbox / grid outlines — core draw lists, one colour per list, no allocation per frame.
  Since M2-02 it swaps the enemy bullet, beam and bend sprites for the player's **colour-blind
  palette** (`renderer.setBulletPalette`, `resolveBulletPaletteTable`: the pipeline's
  `<sprite>@<palette>` variants in place of the plain frames — no rebinding, no sim change).
  With `testPattern: true` it also shows the
  **calibration test pattern** (1-px checker border, 16-px grid, colour bars, a placeholder
  ship, a marker moving one pixel per tick).

```ts
import { FX_CUES } from '@shmup/core';
import { createAtlas, createPixiRenderer, loadFxContent } from '@shmup/render-pixi';

const atlas = createAtlas(assets.manifest, pageImages); // pages loaded with new Image()
const renderer = await createPixiRenderer({ canvas, displayWidth: innerWidth, displayHeight: innerHeight, atlas });
renderer.setSpriteNames(game.content.sprites.names);
renderer.setFxContent(loadFxContent(fxFiles).content); // particle presets (content/fx/)
renderer.particles?.emitFxCue(FX_CUES.ExplosionSmall, x, y, 1); // normally from a drained event
renderer.render(game.renderFrame()); // steps particles / popups / effects by the tick delta
```

## Modules

| Module | Status | Responsibility |
|---|---|---|
| `renderer` | partial | Pixi WebGL renderer, low-res target, upscale pass; draws a core `RenderFrame` (world batches, lasers, bending lasers — M2-02 —, HUD / UI draw lists, shake, flash, dim); `setBulletPalette` (M2-02); owns the particles, popups and screen effects and steps them by the `frame.tick` delta (M1-14); optional calibration pattern; optional draw-call counter (`countDrawCalls` → `drawCalls`, M1-19) |
| `viewport` | partial | Integer-scale letterbox math (pure) |
| `test-pattern` | implemented | Calibration scene (`?scene=calibration`) |
| `palette` | partial | Placeholder colours (VA-panel-friendly, no pure black); the colour-blind bullet palettes (M2-02: `bulletPaletteSpriteName`, `resolveBulletPaletteTable`, `BULLET_PALETTE_SUFFIX`); palette cycling later |
| `atlas` | implemented | `createAtlas(manifest, images)`: one nearest-neighbour source per page, consecutive frame ids per sprite, `resolveSpriteTable` / `resolveFlashTable` (unknown → `ui/missing`, warned once) |
| `layers` | implemented | One container per core `LayerId` in §18 draw order; world group (shake) under HUD / UI / DEBUG; the stage's terrain as a ring-buffered 49 × 26 tile-sprite grid (re-textured one column / row as the camera crosses tile edges) and its parallax bands as repeated sprites (M1-07) — since M2-07 following the view's `changes` log (only the changed cells in view re-textured; a reset or an overflowing gap redraws the grid); the enemy lasers (`createLaserBinding`, M1-09: two sprites per slot — a tinted 1-px warning line and a beam frame picked by width — on `ENEMY_BULLETS`); the bending lasers (`createBendingLaserBinding`, M2-02: one never-rotated segment sprite per ring node, tail first, after the lasers) |
| `sprites` | implemented | `createSpriteLayerBinding` (preallocated sprites per `SpriteBatchView`: camera, `PLAYFIELD_Y`, anchors, flips, blink, hit flash), ordered `QuadPool` |
| `text` | implemented | Bitmap font from the atlas, `TextMetrics`, allocation-free text and number layout |
| `ui` | implemented | Draws a core `DrawList` (rect, sprite, text, number) into the HUD or UI layer — the core HUD and the scene flow's menus since M1-16 |
| `particles` | implemented | `content/fx/` presets (kind `fx`: `loadFxContent`) and the 256-particle pool on the FX layer (additive / normal, presentation RNG, oldest recycled, world space, ticks not frames), spawned by FX and SFX cues (M1-14) |
| `effects` | partial | Screen shake (3 magnitudes, decaying, off switch), per-kind flash behind a ≤ 3-a-second limiter, playfield dim, score popups (M1-14); raster & palette effects, CRT later |
| `debug` | implemented | The debug overlay on the `DEBUG` layer (M1-19): `createDebugOverlay`, the pure builders `buildDebugPanel` (five lines + the frame graph) and `buildDebugOutlines` (hurt circles, terrain boxes, enemy / boss-part hurtboxes, shot boxes, bullet circles, items, laser capsules, grid cells) — sixteen one-colour draw lists, allocation-free; created only by dev / test builds |

Guide (sprite ids → frames, bindings, quad pools, the terrain ring and parallax bands, text,
the two passes, gotchas): [`docs/dev/rendering-and-shell.md`](../../docs/dev/rendering-and-shell.md);
what the terrain and parallax views contain: [`docs/dev/stage-runtime.md`](../../docs/dev/stage-runtime.md);
the laser view and the beam art: [`docs/dev/bullets-and-patterns.md`](../../docs/dev/bullets-and-patterns.md#drawing-bullets-and-lasers);
the bending lasers and the colour-blind palettes: [`docs/dev/rendering-and-shell.md`](../../docs/dev/rendering-and-shell.md#colour-blind-bullet-palettes), [`docs/dev/pattern-dsl.md`](../../docs/dev/pattern-dsl.md);
particles, screen effects, score popups and the `fx` content: [`docs/dev/fx-and-game-feel.md`](../../docs/dev/fx-and-game-feel.md);
the debug overlay and the draw-call counter: [`docs/dev/debug-and-replays.md`](../../docs/dev/debug-and-replays.md#the-overlay-shmuprender-pixi-debug);
exports: [`docs/dev/api-reference.md`](../../docs/dev/api-reference.md#shmuprender-pixi).

Tests run in Node: pure modules are tested fully; Pixi display objects need no GPU, so the
atlas (over fake page images), bindings, quad pools, the particle pool, the popups and the
renderer (with WebGL faked) are exercised too, including their per-frame allocation. The real WebGL path is covered by `pnpm test:e2e` (headless Chromium).

**Bundle size note:** importing from `'pixi.js'` pulls Pixi's default extension set; the
whole Tizen `app.js` is ~129 KB gzip today. Dropping unused Pixi subsystems
(accessibility, DOM, filters, events, …) is a later optimisation step.
