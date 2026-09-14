# Presentation polish: raster effects, palette cycling, display options, render interpolation

How plan step **M2-08** gave the renderer its SNES-style look and the player the display options:
per-scanline **raster effects** (wavy water, heat haze, line-band parallax floors) and **palette
cycling** (water, lava, glowing cores), both driven by stage data and drawn by one **GLSL ES 1.0**
(WebGL1) filter per layer; an **additive** Mega Crash flash; the **scale modes** integer (default)
/ fit / stretch; the **screen-shake**, **reduced-flashing** and **show-hitbox** options on the
Options screen, saved and applied at boot; and **render interpolation** for displays faster than
the 60 Hz tick, switched on by a refresh-rate probe in the shell.

Everything here is **presentation only**. The simulation never reads a raster effect, a palette
cycle or a display option; none of them is in a replay or a state hash, and zone A plays and looks
as before (it has no effects yet). The dev stage `raster-range` (`?stage=raster-range` in a
browser) shows every effect; the zones of M2-11 … M2-14 (BRINE NEBULA's wavy water, MAGMA DEEP's
lava) build on it.

This page is the *how and why* and the map of the whole step. Exact signatures are in
[api-reference.md](api-reference.md#shmuprender-pixi); the TSDoc in
`packages/render-pixi/src/{effects,palette,viewport,layers,sprites,renderer}/`,
`packages/core/src/{presentation,data,stage,world,config,scenes,events,save}/` and
`packages/shell/src/{boot,dispatch,frame-loop,debug}/` is the authoritative reference. The data
format for authors is next to the data:
[`content/stages/README.md`](../../content/stages/README.md#raster-effects-and-palette-cycles-m2-08).
What testers see is in [`../client/preview-build.md`](../client/preview-build.md#the-options-screen)
and [`../client/preview-build.md`](../client/preview-build.md#the-raster-range-browser-only). The
systems this step extends have their own pages:

| Part | Home page |
|---|---|
| The render contract, the renderer's frame, the shell's boot and frame loop | [rendering-and-shell.md](rendering-and-shell.md) |
| Screen shake, the flash looks and the flash limiter | [fx-and-game-feel.md](fx-and-game-feel.md) |
| `UserOptions`, the save, the Options screen, live `UserOption` events | [saves-and-options.md](saves-and-options.md) |
| The stage format and the parallax view | [stage-runtime.md](stage-runtime.md) |
| The World's view | [sim-world.md](sim-world.md#the-view) |
| The procedural placeholder art | [asset-pipeline.md](asset-pipeline.md) |
| Golden replays | [debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden) |

Background: `shmup_feat.md` §18 (palette effects — palette cycling for glowing cores, water, lava,
the Mega Crash flash; raster / HDMA-style effects — a per-scanline offset table in a 1×H data
texture; the shake off switch), §3 (scale modes integer / fit / stretch; interpolated rendering on
120 / 144 Hz displays; the refresh rate probed), §21 (display options: scale mode, shake, flash
reduction, hitbox display), §22 (the raster-effect shader), §5 (the visible hitbox); plan §3.4 (the
render contract) and decision **D32** (render interpolation only where the display outruns the
tick).

## The picture at a glance

```text
content/stages/<id>.stage.json   raster: [{ layer, kind wave|haze|lines, top, bottom, … }]
                                 cycles: [{ layer, colors ['#rrggbb' …], ticks, from?, to? }]
        │ loadContent → StageSpec.raster / cycles (checked, defaults filled, colours → rgb)
        ▼
createWorld ── createStageEffectsView(stage) → view.effects  (frozen, read once when bound)
            ── createHitboxBatch(MAX_PLAYERS)  → view.hitboxes (refilled in phase 9)
        │ (the sim never reads either; not hashed)
        ▼
PixiRenderer.render(frame)
  camera ← world.camera, or drawn between the last two ticks by frame.alpha (interpolation)
  bindings: parallax / sprites / hitbox markers — sync, or syncInterpolated(blend)
  layerEffects.sync(tick, camera, shakeY, settings.rasterEffects)
    per layer: effects in [from, to) → RasterTable (216 rows) → 1×216 RGBA8 texture
               cycles in [from, to)  → colour pairs (≤ 8)
               filter attached only while something is active
  flash quad (normal) · flashAdd quad (blend 'add' — the Mega Crash)
  pass 2: frame texture → canvas by the scale mode (computeViewport)

Options screen (core/scenes) ── UserOption ScaleMode 5 / ScreenShake 6 / ReduceFlashing 7 /
                                ShowHitbox 8 ──► shell connectOptionEvents(…, display: renderer)
save.options.display ──► shell applyDisplayOptions(renderer, display) at boot
rAF timestamps ──► shell RefreshMonitor (IQM of 31 deltas) ──► renderer.setInterpolation(hz > 70)
```

## Stage data (`core/data`)

A stage file may list two optional arrays (at most 8 entries each). The loader validates them
(`RASTER_EFFECT_SCHEMA`, `COLOR_CYCLE_SCHEMA`, then `checkStageEffects`), fills the defaults and
resolves the cycle colours, so every `StageSpec` has `raster` and `cycles` (both `[]` when the file
omits them).

**`raster` — `StageRasterEffect`.** A per-scanline horizontal offset of one layer while the camera
x is inside `[from, to)`:

| Field | Meaning | Range / default |
|---|---|---|
| `layer` | `far`, `mid` or `terrain` (`STAGE_RASTER_LAYERS`) | required |
| `kind` | `wave`, `haze` or `lines` (`STAGE_RASTER_KINDS`; the index is `RasterKind`) | required |
| `top`, `bottom` | Playfield rows `top … bottom − 1` (0 = the row under the top HUD bar) | `0 ≤ top < bottom ≤ 200` |
| `amplitude` | Peak offset in pixels (`wave`, `haze`) | 0–32; required for them |
| `wavelength` | Rows per sine period (`wave`, `haze`) | 2–1024, default 32; required for them |
| `period` | Ticks per sine period over time (`wave`, `haze`); 0 = still | 0–36,000, default `DEFAULT_RASTER_PERIOD` 120 |
| `factorTop`, `factorBottom` | Scroll factor of the first / last row (`lines`) | −4 … 4; required for `lines` |
| `bands` | `lines` only: the art's strip heights, top → bottom, summing to `bottom − top` | 1–`MAX_RASTER_BANDS` (64) entries; default `[]` (a factor per row) |
| `wrap` | The distorted art's horizontal repeat, px (0 = clamp at the screen edges) | 0–1024, default 0 |
| `from`, `to` | Camera x range | defaults 0 and `Infinity` |

**`cycles` — `StageColorCycle`.** Every pixel of the layer drawn in `colors[i]` shows
`colors[(i + step) mod n]`, `step` advancing every `ticks` ticks while the camera x is inside
`[from, to)`: `layer` (`far`, `mid`, `terrain`, `ground`, `air` — `STAGE_CYCLE_LAYERS`; the enemy
layers are for glowing cores), `colors` (2–8 `#rrggbb`, resolved to `rgb` numbers), `ticks`
(1–600), `from` / `to`.

The checks beyond the schema: `bottom > top`; `to > from` (`from` defaulting to 0 — a lone `to: 0`
is an empty range, a bug the test round fixed); `wave` / `haze` need `amplitude` and `wavelength`,
`lines` needs `factorTop` and `factorBottom`; `bands` only on `lines` and adding up to the rows;
a cycle colour used twice on one layer, or within **1 per channel** of another colour cycled there
(`nearColor` — the layer shader matches within 1.5/255, so two such colours would both match the
first; also a test-round fix); at most `MAX_CYCLE_COLORS_PER_LAYER` (8) cycled colours per layer,
all its cycles together (the shader's uniform arrays).

## The render contract (`core/presentation`, `core/stage`, `core/world`)

Two optional members joined `WorldView`, both read once when a renderer binds the view (so a
renderer that ignores them keeps working):

- **`effects?: StageEffectsView | null`** — `{ raster: RasterEffectView[], cycles:
  ColorCycleView[] }` in file order. A `RasterEffectView` carries the layer as a `LayerId`
  (`BgFar`, `BgMid`, `Terrain`), `kind` as a `RasterKind` code (`Wave 0`, `Haze 1`, `Lines 2` —
  append, never renumber) and the numeric fields above; a `ColorCycleView` its layer, the ramp as
  0xRRGGBB numbers, `ticks`, `from`, `to`. `core/stage` `createStageEffectsView(stage)` builds the
  frozen view at load (`null` for a stage with neither list); `createWorld` puts it on the view
  (`null` in free flight).
- **`hitboxes?: HitboxView | null`** — the ships' hurtboxes for the "show hitbox" option:
  `capacity`, `count` (packed), per slot world `x`, `y` and `radius`. The World owns a
  `HitboxBatch` (`createHitboxBatch(MAX_PLAYERS)`, `World.hitboxBatch`) that `syncWorldView`
  refills at the end of every tick (phase 9): one entry per active ship that is not `dying` /
  `dead`, radius = the ship's `hurtRadius` × its shield's `hurtScale` (Reduce shrinks it — M2-04).

Both are presentation mirrors: `hashWorld` skips them (a test checks that changing them leaves the
hash alone), and the flight scene and the scene flow's view pass them through when they build
their own `WorldView` (`effects: view.effects ?? null`, `hitboxes: view.hitboxes ?? null`).

## Raster tables (`render-pixi` `effects/raster.ts`)

A `RasterTable` holds one horizontal offset and one wrap period per frame row (216 rows —
`LAYER_EFFECT_ROWS`). Every frame the layer effects clear a layer's table
(`clearRasterTable`), add each active effect of the layer (`addRasterEffect`) and encode it
(`encodeRasterTable`). Playfield row `r` is frame row `r + PLAYFIELD_Y`; rows outside the table
are skipped. With `k = r − top`:

| Kind | Offset of row `r` |
|---|---|
| `Wave` | `amplitude · sin(k / wavelength + tick / period)` (turns) — one slow sine down the rows, drifting over time |
| `Haze` | `amplitude · (sin(k / wavelength + tick / period) + ½ · sin(2.3 · k / wavelength − 2 · tick / period)) / 1.5` — two sines running against each other, a shimmer that never settles into a plain wave |
| `Lines` | `camera.x · lerp(factorTop, factorBottom, k / (rows − 1))`, taken modulo `wrap` when `wrap > 0` (the row's wrap period is then `wrap`) — each row of the art scrolls at its own speed, near rows faster: a pseudo-3D floor. With `bands`, `k` counts **strips** (`k / (strips − 1)`), so a whole strip moves as one piece; rows past the listed strips take the last one's factor |

Offsets of several effects on one row add up; a `Lines` effect's wrap replaces the row's. The
sines are the core's `sinB` table (1,024 binary units per turn, whole-unit arguments), so the same
tick and camera give the same table on every engine — screenshots stay comparable. Why `bands`:
plain per-row factors on a uniform checker pattern drift out of phase with each other after a
few hundred pixels of scroll and the floor turns into noise; strips drawn with a wider pattern
nearer the bottom (`bg/checker-floor`) and scrolled strip by strip keep their shape at any camera
x.

**Encoding.** `encodeRasterTable(table, bytes)` writes row `i` into texel `i` of the 1 × 216 RGBA8
texture: R, G = the offset rounded to whole pixels, clamped to ±`RASTER_MAX_OFFSET` (2047), as
`offset + 32768` (R the high byte — the shader decodes `(R − 128) · 256 + G`); B, A = the wrap
period rounded and clamped to 0 … 2047 (B high, A low). It returns whether a byte changed, so the
texture is re-uploaded only then. Whole pixels keep the pixel art crisp (the frame is sampled
nearest-neighbour anyway). `decodeRasterRow(bytes, row)` is the shader's arithmetic in JS for
tests and tools.

## The layer shader (`effects/shaders.ts`)

`LAYER_EFFECT_VERTEX` / `LAYER_EFFECT_FRAGMENT` are plain strings (no imports — tests and the
browser spec compile them without Pixi). A source without `#version 300 es` stays GLSL ES 1.0 in
Pixi v8, which adds only its `#define SHADER_NAME` line and compatibility macros the sources do not
use. One program does both effects, so a layer with a wave **and** a cycle costs one filter.

| Uniform | Meaning |
|---|---|
| `uRasterTable` | the offset table (1 × `uRows` RGBA8, sampled nearest, clamped) |
| `uRows` | its height (216) |
| `uRaster` | 1 when the table applies, 0 to skip the lookup |
| `uRowShift` | the world layers' vertical screen offset (screen shake), subtracted from the row so the effect stays on its rows while the picture shakes |
| `uCycleCount` | colour pairs in use (0 … 8) |
| `uCycleFrom[8]`, `uCycleTo[8]` | pixel colour `uCycleFrom[i]` is drawn as `uCycleTo[i]` (RGB 0 … 1) |

The fragment shader reads its row's texel (`vScreen.y` — the fragment's pixel row in the 384×216
render target — minus `uRowShift`), samples the layer `offset` pixels to the right, and with a wrap
period moves a sample past the layer's right edge back (or before its left edge forward) by whole
periods — seamless for art that repeats every `wrap` pixels — before clamping to the input. Then a
pixel (un-premultiplied) within 1.5/255 of `uCycleFrom[i]` takes `uCycleTo[i]`, keeping its alpha.
Loops follow WebGL1's Appendix A form (a constant-bound `for` with a `break`), there are no
integer operators, and every decoded value stays below 2,048 and is rebuilt from whole bytes
(`floor(v · 255 + 0.5)`), so `mediump` (≥ 10-bit mantissa on the TV's GPU) decodes it exactly —
`highp` is used where the GPU offers it.

## Layer effects (`effects/layer-effects.ts`)

`createLayerEffects({ layers, width?, height?, offsetY?, createFilter? })` manages the filters of
one renderer; the renderer creates it with its layer stack and exposes it as
`renderer.layerEffects`.

- **`bind(view)`** (load time, from `PixiRenderer.bindWorld`) detaches every filter, sorts the
  view's effects and cycles by layer (a layer outside the world group throws `RangeError` before
  anything is bound) and creates the filter of each layer that gets its first effect —
  `createLayerEffectFilter(rows)`: the program (cached by Pixi across filters), a 1 × 216 RGBA8
  `BufferImageSource` (nearest, clamp-to-edge, no mipmaps, `alphaMode: 'premultiplied-alpha'` —
  its alpha is data) starting as the neutral table (offset 0 = `0x80 0x00`), and the uniform
  group. Filters are kept across worlds.
- **`sync(tick, camera, rowShift, enabled)`** (every frame) per layer: the raster effects whose
  range holds `camera.x` are added to the cleared table (encoded, re-uploaded when a byte
  changed), the active cycles' pairs are written at `colorCycleStep(tick, ticks, n)`; the filter
  is **attached while at least one of them is active** and detached otherwise. `enabled = false`
  (`EffectSettings.rasterEffects`, default `true`) detaches every filter — for GPUs too weak for
  the extra passes, and for before / after comparisons in tests.
- `attachedMask` (bit `1 << layer`), `activeRaster`, `activeCycles`, `filterOf(layer)` report the
  state; `destroy()` releases everything.

**Cost.** A filtered layer is drawn into a temporary texture and composited back (two more draw
calls and one full-frame fragment pass). Measured in the e2e spec with the debug overlay's
counter: **2** draw calls for a plain frame, **5** with one filtered layer, **7** with two; the
budget asserted is **12**. A layer without an active effect carries no filter at all, so a stage
without effects renders exactly as before. The filter area is the frame plus a 64-px margin on
each side (it must cover the frame wherever the shake moves the world group). Assigning
`layer.filters` makes Pixi copy the list, so the one-element list is created with the filter and
assigned **only at a range edge**; while an effect is on screen, Pixi's own filter pass allocates
a few short-lived objects per filtered layer per frame (its filter-stack bookkeeping) — outside our
control, and only then.

The renderer passes the (interpolated) camera and the world group's rounded shake y; the filter
works on whole layers, so a raster effect on `terrain` shifts the tiles' **pixels** but not the
collision — keep it to decoration rows or small amplitudes (the authors' README says so).

## Palette cycling (`render-pixi` `palette`)

There are no indexed-colour sprites: the shader matches the ramp's **exact colours** in the
ordinary RGBA atlas art, so one sprite serves plain and cycled layers alike. The art has to use
the ramp's `#rrggbb` values (the `raster-bands` generator paints the sea only in `SEA_RAMP`), and
nothing else drawn on the cycled layer may come within 1 per channel of them — the
`raster-range-runtime` integration test checks both in the packed atlas.

- `colorCycleStep(tick, ticksPerStep, count)` → `floor(tick / ticksPerStep) mod count` (negative
  ticks count backwards; a count below 1, a non-positive step, or a NaN / infinite tick → 0 — the
  test round fixed NaN results there).
- `writeCycleColors(colors, step, from, to, start)` writes one cycle's pairs — `colors[i]` into
  `from`, `colors[(i + step) mod n]` into `to` — as RGB 0 … 1 triples from triple `start`, stops
  when the arrays are full and returns the next triple, so several cycles of a layer are written
  one after the other. `writeColorUnit(color, out, index)` is the per-colour helper.

Whole-sprite palette swaps stay pre-rendered variants (player 2's `@p2`, the colour-blind bullet
sets).

## The Mega Crash flash

`FlashLook` gained `additive`: the Mega Crash look is now white at **0.7, additive** — the SNES's
colour-addition palette flash: the world brightens towards white instead of being covered, so the
ship and the bullets stay readable. The renderer has a second flash sprite (`flashAdd`, blend mode
`add`, right after the normal one in the world group); a frame shows one or the other, because
changing a sprite's blend mode rebuilds Pixi's render group. `ScreenEffects.flashAdditive` says
which; the limiter and reduced flashing apply as before (reduced flashing still caps it at
`REDUCED_FLASH_ALPHA` 0.25). The WARNING pulse and the boss blast stay ordinary overlays.

## Display options

`UserOptions.display` (`core/config`) grew from `{ bulletPalette }` to five fields — still save
format 1: `resolveUserOptions` fills a missing field with its default, so no migration was needed:

| Field | Values (default first) | Options row | `UserOptionKind` (`param`) | Renderer |
|---|---|---|---|---|
| `bulletPalette` | `standard`, … (M2-02) | BULLETS | `BulletPalette 4` (index) | `setBulletPalette` |
| `scaleMode` | `integer`, `fit`, `stretch` (`SCALE_MODES`) | SCALE | `ScaleMode 5` (index) | `setScaleMode` |
| `screenShake` | `true`, `false` | SHAKE (toggle) | `ScreenShake 6` (1 / 0) | `effects.settings.screenShake` |
| `reduceFlashing` | `false`, `true` | FLASHES — NORMAL / REDUCED | `ReduceFlashing 7` (1 / 0) | `effects.settings.reduceFlashing` |
| `showHitbox` | `false`, `true` | HITBOX (toggle) | `ShowHitbox 8` (1 / 0) | `setShowHitbox` |

**The Options screen** (`OptionsScene`) has ten rows now — MASTER, MUSIC, SFX, CONTROLS, BULLETS,
SCALE (`Choice` of `SCALE_MODE_LABELS`: INTEGER / FIT / STRETCH), SHAKE (`Toggle`), FLASHES
(`Choice` of `FLASH_LABELS`: NORMAL / REDUCED), HITBOX (`Toggle`), BACK — so `OptionsItem.Back`
is **9** (it was 5); the panel grew to 288×182 at y 18. Every change pushes its `UserOption`
event at once; BACK or the Back button stores all of them in the save and flushes it.

**The shell.** At boot, after the save is read, `applyDisplayOptions(renderer, save.options.display)`
sets all five (the bullet palette before the sprite tables are resolved); an explicit
`ShellOptions.effects.screenShake` / `reduceFlashing` still wins (a host override) until the
Options screen changes it. In the scene flow `connectOptionEvents(…, onBulletPalette, display)`
applies the live events (`display` = the renderer — anything implementing `DisplayTarget`; a
scale-mode index outside `SCALE_MODES` is ignored).

**Scale modes** (`render-pixi` `viewport`). `computeViewport(mode, displayW, displayH, baseW,
baseH)` → `Viewport { mode, scale, scaleX, scaleY, x, y, width, height }`:

| Mode | Placement | 1280×720 display | 1000×600 display |
|---|---|---|---|
| `integer` (default) | the largest whole multiple that fits, centred, letterboxed (`computeIntegerViewport`) | ×3 = 1152×648 at (64, 36) | ×2 = 768×432 at (116, 84) |
| `fit` | the largest scale that keeps 16:9 (`min(dW / bW, dH / bH)`, below 1 on a display smaller than the frame), size rounded, centred | ×3.33 = 1280×720, no border | ×2.6 = 1000×563 at (0, 18) |
| `stretch` | the whole display, x and y scaled separately | 1280×720 | 1000×600 |

The frame is always sampled nearest-neighbour, so `fit` and `stretch` make some pixel rows /
columns one screen pixel wider than others. On the TV's 1920×1080 all three are the same (×5 fits
exactly). `renderer.setScaleMode(mode)` re-places the frame sprite at once; `resize()` keeps the
mode. Sizes that are not positive count as 1.

**Show hitbox.** `createHitboxBinding({ atlas, capacity, offsetY? })` (render-pixi `layers`): per
`HitboxView` slot a white core `2·floor(radius) + 1` px square (1 px below radius 1) inside a
1-px rim tinted `HITBOX_RIM_TINT` (`0xff3050`), both quads of the atlas's white pixel — no new
sprite; tints set once at creation. The renderer binds it on the `HITBOX` layer and shows the layer
only while `showHitbox` is on (the markers are synced only then). The KESTREL's hurt radius 1.5
draws a 3×3 core in a 5×5 rim, centred on the ship.

## Render interpolation

A 60 Hz simulation on a 120 / 144 Hz display shows each tick for two or more frames — motion
judders. With interpolation on, the renderer draws the world **between the previous and the
current tick** by `frame.alpha` (the fixed-step loop's leftover fraction). On a 60 Hz display it
would only add a tick of lag, so it is off there (decision D32).

**In the renderer** (`setInterpolation(on)`, `interpolation`, `PixiRendererOptions.interpolation`):

- the **camera**: the renderer keeps the camera of the previous and the last tick seen
  (`cameraHistory`, a `Float64Array`) and draws a `DrawnCamera` (a class — unboxed fields) between
  them; the terrain grid, the lasers, the bending lasers, the particles, the popups and the layer
  effects all take that camera;
- the **parallax bands** (`ParallaxBinding.syncInterpolated`) blend each band's offset the short
  way round its repeat seam and wrap it back into `[0, spacing)`;
- **every sprite batch** (`SpriteLayerBinding.syncInterpolated`): pools pack their slots, so a slot
  may hold another entity than a tick ago — a slot is blended only when it shows the **same sprite
  id** as a tick ago and moved at most `INTERPOLATION_MAX_STEP` (24) px on each axis; anything
  else (a new entity, a teleport, a respawn) is drawn where it is now. A binding allocates its
  history arrays on its first interpolated frame, so bindings that never interpolate carry none;
- the **hitbox markers** (`HitboxBinding.syncInterpolated`, same rules — without it they were
  drawn a tick ahead of the interpolated ship, a bug the test round fixed; the renderer resets
  their history when they were not drawn the frame before).

The blend travels as an object (`RenderBlend { alpha, advance }`, the renderer's reused
`FrameBlend`): `advance` = ticks since the last interpolated frame — 1 shifts the history by one
tick, 0 keeps it (several frames within one tick), anything else (a jump, the first frame,
interpolation just switched on, a new World) resets it, so nothing is blended then. Passing
`alpha` as a call argument instead would box it on every non-inlined call.

**In the shell** (`frame-loop` `createRefreshMonitor`, `RefreshMonitor`): every rAF timestamp is
fed to the probe; it keeps the last `REFRESH_SAMPLES` (31) deltas (≤ 0 or > 250 ms ignored),
re-estimates every 15 samples as `1000 /` the **interquartile mean** (the middle half of the sorted
deltas — an insertion sort into a preallocated array) and is `ready` after 31 deltas. A median
was tried first: with alternating jitter (16 / 17 ms …) it picked one extreme. `ready` and `hz`
are plain fields of a class — as a getter the fractional `hz` was boxed on every per-frame read
(the test round's fix). With `ShellOptions.interpolation` `'auto'` (the default; neither app
overrides it) the shell turns interpolation on while `hz > INTERPOLATION_MIN_HZ` (70 — so 75 Hz
monitors count, a jittery 60 Hz does not) and off otherwise; `'on'` / `'off'` force it. A platform
resume resets the probe (the rAF clock paused with the page). `Shell.refresh` exposes it.
Electron's own window / refresh settings are M2-17's.

## Debugging it

- `window.__shmupDebug.renderer` (dev / test builds) is the `PixiRenderer`: `scaleMode`,
  `showHitbox`, `interpolation`, `layerEffects.attachedMask`, `effects.settings` (set
  `rasterEffects = false` to compare), `setScaleMode(…)`, `setShowHitbox(…)`.
- The overlay's draw-call count (F1) shows the filter passes (2 → 5 → 7 as layers get effects).
- The debug outlines (F3) draw every hurt circle on the `DEBUG` layer; the HITBOX option is the
  player-facing marker on the `HITBOX` layer — separate things.

## Content and assets

- **`scripts/assets/procedural/raster-bands.mjs`** (generator `raster-bands`): `bg/sea-swell`
  (`SEA_TILE_W` 128 × `SEA_TILE_H` 40, painted **only** in the four colours of `SEA_RAMP`
  `#183c78 #24569c #3474bc #5096d8` — 3-px rows whose ramp index steps with the row and bumps with
  a 32-px swell profile, so cycling the ramp rolls the swell) and `bg/checker-floor`
  (`FLOOR_TILE_W` 64 × `FLOOR_TILE_H` 48 in strips `FLOOR_BANDS` 2, 2, 3, 3, 4, 5, 6, 7, 8, 8
  whose checker squares `FLOOR_SQUARES` widen towards the bottom, a horizon line on top). Both
  repeat seamlessly along x and use integer maths only.
- **`content/stages/raster-range.stage.json`** (RASTER RANGE, 3,600 px at 1 px/tick, checkpoints
  at 0 and 1,800, no terrain): far stars; on `mid` the sea band at rows 112–152 with a `wave`
  (amplitude 3, wavelength 20, period 96) and the four-colour cycle (8 ticks a step), the checker
  floor at rows 152–200 (parallax `factor` 0) with a `lines` effect (factors 0.25 → 1.5 over the
  generator's ten strips, wrap 64); a heat `haze` (amplitude 2, wavelength 8, period 40) over the
  stars at rows 40–112 between camera x 1,200 and 2,400; drifter formations and carriers from the
  test-range roster. `?stage=raster-range` plays it; the stage-runtime integration test plays it
  like every shipped stage.

## Determinism, hashing and golden replays

Nothing of this step feeds back into the simulation: `hashWorld` does not read `view.effects` or
`view.hitboxes`, the display options live in `UserOptions` (never in `GameConfig`), and the raster
tables use table sines only for identical screenshots, not for the sim. The golden replays were
**re-blessed once** (`0b7bea2`) because the two new content sprites (`bg/sea-swell`,
`bg/checker-floor`) shift the sorted sprite ids the pools hash; with the new stage file removed the
old goldens pass unchanged — the simulation is unchanged. The test round added
`raster-range-god` (the 4-way bot, god mode) and plays it back a second time on the stage with its
`raster` / `cycles` stripped (`playGolden(replay, content)`): every hash matches.

## Zero allocation and the hot-path rules

The guards (`renderer-polish.test.ts` "renders a busy frame with interpolation and effects without
allocating", `sprites-interpolation.test.ts`, `effects/raster.test.ts`, `layer-effects.test.ts`,
`frame-loop-refresh-alloc.test.ts`) keep these at zero:

- A fraction handed to several calls every frame travels in an object with class fields
  (`RenderBlend` / `FrameBlend`, `DrawnCamera`), never as a call argument; `alpha` is clamped
  inline, not by a helper that would return a boxed fraction.
- A fractional value the shell reads every frame is a plain field, not a getter (`RefreshMonitor.hz`
  — a getter boxed ~16 B a frame); the last rAF timestamp sits in a one-slot `Float64Array`.
- Positions handed to placement helpers are whole pixels (`Math.round(…) | 0`); camera-dependent
  tests (`stageEffectActive`, `addRasterEffect`) take the camera **object**, and sine arguments are
  whole binary units (`| 0`).
- Filter lists are assigned only at range edges (Pixi copies them); a texture is re-uploaded only
  when `encodeRasterTable` reports a changed byte; tints are set once (hitbox markers) or on change.
- History buffers are allocated on first use (a binding at 60 Hz never pays for them) and swapped by
  reference when a tick passes.
- Blend modes never change on a live sprite: the additive flash is its own sprite.

## Using it in code

```ts
import { createStageEffectsView, loadContent, RasterKind, PLAYFIELD_Y } from '@shmup/core';
import {
  addRasterEffect, clearRasterTable, computeViewport, createRasterTable, encodeRasterTable,
  colorCycleStep, decodeRasterRow,
} from '@shmup/render-pixi';
import { createRefreshMonitor, INTERPOLATION_MIN_HZ } from '@shmup/shell';

const stage = db.stages[db.stageIndex.get('raster-range')!];
const effects = createStageEffectsView(stage)!; // what createWorld puts on view.effects
const wave = effects.raster.find((e) => e.kind === RasterKind.Wave)!;

const table = createRasterTable(); // 216 rows
const bytes = new Uint8Array(table.rows * 4);
clearRasterTable(table);
addRasterEffect(table, wave, 30, { x: 0, y: 0 }); // tick 30, camera at 0
encodeRasterTable(table, bytes); // → true (changed)
decodeRasterRow(bytes, PLAYFIELD_Y + 112); // → [offset, wrap] of the sea's first row

colorCycleStep(25, 8, 4); // → 3: the ramp's position at tick 25
computeViewport('fit', 1280, 720, 384, 216); // → scale 3.33…, 1280×720 at (0, 0)

const refresh = createRefreshMonitor();
// per rAF: refresh.sample(now); if (refresh.ready) renderer.setInterpolation(refresh.hz > INTERPOLATION_MIN_HZ);
```

## Extending it

| Want | Do |
|---|---|
| A new raster kind | Append to `STAGE_RASTER_KINDS` (core `data`) and `RasterKind` (same index), map it in `createStageEffectsView`'s `RASTER_KINDS`, add its formula to `addRasterEffect`, its required fields to `checkStageEffects`; the shader needs no change while the effect is a per-row horizontal offset |
| A raster effect on another layer | Add the name to `STAGE_RASTER_LAYERS` and `EFFECT_LAYERS` (core `stage`); any world layer below `Hud` works in the renderer |
| More than 8 colours on one layer | Raise `LAYER_EFFECT_MAX_COLORS` **and** the shader's `uCycleFrom[8]` / `uCycleTo[8]` / loop bound together, then `MAX_CYCLE_COLORS_PER_LAYER`; every extra colour is a comparison per pixel of the layer |
| A vertical (per-column) or Mode 7 effect | A new program: the table texture's layout and the shader change (M3-02 plans Mode 7-style floors); keep GLSL ES 1.0 and run it through `glsl-es100.ts` and the WebGL1 spec |
| A new display option | A `DisplayOptions` field with a default in `DEFAULT_USER_OPTIONS` and a branch in `resolveUserOptions` (no migration when a default is safe), `serializeSave`, an Options row and `OptionsItem` (BACK moves), a `UserOptionKind` (append), `DisplayTarget` + `connectOptionEvents` + `applyDisplayOptions` — see [saves-and-options.md](saves-and-options.md#extending-it) |
| Interpolating a new binding | Give it a `syncInterpolated(view, camera, blend)` with the same history rules (`advance` 1 shifts, 0 keeps, else reset; blend only a slot that kept its sprite and moved ≤ `INTERPOLATION_MAX_STEP`) and call it from `render()` when `interpolation` is on |

## Tests

| File | Covers |
|---|---|
| `packages/core/test/data/stage-effects-data.test.ts`, `stage-effects-data-edge.test.ts` | Every field's limits at both ends, defaults, the kind rules, `bands`, `to ≤ from` (incl. a lone `to: 0`), duplicate / near colours per layer, the 8-colour cap, `createStageEffectsView` (codes, copies, `null`), the World's hitbox mirror in co-op and with Reduce, effects and hitboxes out of `hashWorld` |
| `packages/core/test/config/config-user-options.test.ts`, `save/save*.test.ts`, `events/events-edge.test.ts` | The four new display fields resolved field by field, saves without them, canonical serialisation; the new `UserOptionKind` codes |
| `packages/core/test/scenes/scenes-options*.test.ts` (incl. `scenes-options-display-edge.test.ts`) | The ten rows and their layout, SCALE / SHAKE / FLASHES / HITBOX events and wraps, no-op toggles, BACK and the Back button storing them, the pause menu's Options |
| `packages/render-pixi/test/effects/raster.test.ts`, `raster-edge.test.ts` | Wave / haze formulas and phases, negative ticks and periods, line-band floors (negative factors and cameras wrapped in phase, strips, a one-row band, cut strips), wraps, encoding (rounding, clamps, change detection), the shader's decode under an IEEE binary16 model of `mediump` |
| `packages/render-pixi/test/effects/shaders.test.ts`, `glsl-es100.ts` | Both sources pass the test-side GLSL ES 1.0 checker (ES 3.00 syntax, reserved operators, Appendix A loops, precision, unknown identifiers, swizzles) |
| `packages/render-pixi/test/effects/layer-effects.test.ts`, `layer-effects-edge.test.ts`, `layer-filter.test.ts` | Binding, attaching only while active and only at range edges, rebuilt tables, cycles outliving a raster effect, the 8-pair cap, the setting, refused views, destroy; `createLayerEffectFilter` with `GlProgram.from` faked and a JS port of the fragment arithmetic |
| `packages/render-pixi/test/palette/palette-cycle*.test.ts` | `colorCycleStep` (negative, NaN, infinite, fractional counts), `writeCycleColors` (steps, wrapping, full arrays), `writeColorUnit` |
| `packages/render-pixi/test/viewport/viewport-modes*.test.ts` | The three modes, fit / stretch invariants over thousands of sizes, degenerate sizes |
| `packages/render-pixi/test/layers/layers-hitbox*.test.ts`, `sprites/sprites-interpolation.test.ts` | Marker sizes, capacity, offset, `syncInterpolated`; the sprite bindings' history rules and the allocation guard |
| `packages/render-pixi/test/renderer/renderer-polish*.test.ts`, `renderer-fx*.test.ts` | Scale modes across resizes, the HITBOX layer, layer effects following the shake and the setting, the additive flash, interpolation (camera, bands, sprites, resets, alpha clamping, world-less frames, effect ranges on the interpolated camera), rebinding, a busy frame without allocating |
| `packages/shell/test/frame-loop/frame-loop-refresh*.test.ts` | The probe's estimate, jitter, hitches, `reset`, NaN sizes; the allocation guard in its own file |
| `packages/shell/test/dispatch/dispatch-options-display*.test.ts`, `boot/boot*.test.ts`, `flight/flight-effects.test.ts`, `scene-view/scene-view-effects.test.ts` | `connectOptionEvents`' display target and `applyDisplayOptions`; saved options applied at boot, `ShellOptions.effects` winning, interpolation modes; the dev scenes and the scene view passing `effects` / `hitboxes` through |
| `test/integration/raster-range-runtime.test.ts` | The stage's art matches its effects, the ramp only in the sea and nothing near it on the cycled layer, a headless session driving the layer effects over the whole stage within bounds |
| `test/scripts/assets/procedural.test.ts` | `raster-bands`: sizes, seamless repeat, the sea only in `SEA_RAMP`, the floor's strips |
| `test/golden/` | `raster-range-god`, also played back with `raster` / `cycles` stripped |
| `test/e2e/raster.spec.ts` | The shader compiles and links in a real WebGL1 context; `?stage=raster-range` draws the wave, cycle and floor (differing from the same frame with the effects off) within 12 draw calls, the haze only in its range, `stretch` filling what `integer` letterboxes, hitbox markers only while on; screenshots attached |
| `test/e2e/display-options.spec.ts` | Web keyboard and the Tizen build's remote keys: SCALE / SHAKE / FLASHES / HITBOX apply live, are saved on Back and applied at the next boot; without a save the frame is letterboxed and no marker shows |

## Gotchas

| Symptom | Cause |
|---|---|
| A raster effect or cycle never shows | The camera x is outside `[from, to)`, `settings.rasterEffects` is off, the scene's own `WorldView` did not pass `effects` through, or the renderer has no WebGL program (Node tests need `createLayerEffectFilter` faked) |
| A line-band floor turns into noise after a while | Per-row factors on a uniform pattern drift out of phase; draw strips (wider patterns lower down) and list them in `bands`, and give the band `"factor": 0` |
| A cycled colour flickers somewhere else | Other art on that layer uses a ramp colour or one within 1 per channel of it; the loader only checks the cycles against each other, the integration test checks the raster range's atlas — do the same for a new stage |
| `lines` effect shows a seam | `wrap` is not the art's repeat (`spacing` of the band / the tile width) |
| The terrain wobbles but the ship hits the old outline | Raster effects move pixels, not collision — keep them off gameplay rows of `terrain` |
| Draw calls jumped by 3 | A filter is attached (one filtered layer ≈ +3); expected while an effect is on screen |
| Motion looks a tick late on a 120 Hz monitor | Expected with interpolation (it draws between the last two ticks); at 60 Hz it is off |
| A sprite jumps instead of gliding with interpolation on | Its slot changed sprite id or it moved more than 24 px in one tick — drawn where it is, by design |
| The hitbox marker is not on the ship | A custom scene view without `hitboxes`, or a renderer built without an atlas (no binding) |
| `setScaleMode` seems to do nothing on the TV | At 1920×1080 all three modes are ×5 |
| A saved SHAKE / FLASHES setting is ignored at boot | The host passed `ShellOptions.effects.screenShake` / `reduceFlashing`, which win |

## Next steps that build on this page

- **M2-09** (done) — the boss HP bar followed the display-option path (`display.bossHpBar`, the
  BOSS HP row, `UserOptionKind.BossHpBar`), drawn by the core HUD from the saved value instead of
  the renderer ([advanced-bosses.md](advanced-bosses.md#the-boss-hp-bar)).
- **M2-11** (done) — BRINE NEBULA's wavy water (a `wave` on the palette-cycled `bg/brine-sea`, painted
  only in its cycle's four colours, and on the nebula band) and DUNE EXPANSE's heat `haze` over the
  suns and the dune ridge ([zones-b-and-c.md](zones-b-and-c.md)).
- **M2-12** (done) — MAGMA DEEP's palette-cycled lava lake (`bg/magma-lava`, painted only in
  `MAGMA_RAMP`, placed below the surface's view so it rises with the dive; a `haze` on the peaks
  `to` the dive, a `wave` on the lake `from` it) and TEMPEST RIDGE's heavy weather (two storm-cloud
  bands painted only in `STORM_RAMP` and cycled on the far layer with a `wave`, a mountain band,
  three rows of rain) ([zones-d-and-e.md](zones-d-and-e.md)).
- **M2-13** (done) — CELL VAULT's pulsing wall of cells (`bg/vault-membrane`, painted only in
  `VAULT_RAMP`, three rows on the far layer, cycled every 12 ticks, a slow `wave` so it breathes) and
  PRISM LABYRINTH's glinting crystal facets (`bg/prism-facets`, each facet one `PRISM_RAMP` colour by a
  position hash, so the cycle lights them in turn) with a `haze` over the spires band
  ([zones-f-and-g.md](zones-f-and-g.md)).
- **M2-14** (done) — the final zones through `raster` / `cycles` in their stage files: IRON CITADEL's
  running lights chasing along its wall and a `haze` over the core run, ABYSSAL THRONE's twinkling
  specks and two `wave`s ([zones-h-and-i.md](zones-h-and-i.md)).
- **M2-16** — the remaining option groups (controls rebinding, game options).
- **M2-17** — Electron's window, fullscreen and refresh settings.
- **M3-02** — the CRT filter (`EffectSettings.crt`) and Mode 7-style floors as further filters.
