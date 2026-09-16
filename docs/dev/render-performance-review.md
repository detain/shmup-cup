# Render performance review — Samsung M7 (Tizen 5.5 / Chromium 69 / Mali-G51)

A code-level review of how the renderer behaves on the M7, written 2026-09-16 against commit `9240a24` (after
M3-02b). It reads the shipped code and Pixi v8.20.1's own source, and grounds the hardware facts in the real
[input-probe run](input-probe-results.md) on both monitors.

> **Update (M3-02e).** **F1 and F9 are fixed, and with them every finding this review raised.**
> The layers that toggle sprites every frame are each their own Pixi render group
> (`layers/index.ts` `RENDER_GROUP_LAYERS`: `TERRAIN` … `UI`), so hiding one bullet rebuilds that
> layer's instruction set instead of the whole ~6,400-object scene's, and the full-screen overlays
> of pass 1 draw the atlas' own `ui/pixel` rather than Pixi's global `Texture.WHITE`. Measured by
> the bench, over the same worst-case frame: **655–659 of 660 frames rebuilt the scene → 0 of
> 660**, at the price of 4 → 9 draw calls (one batch boundary per group; `shmup_feat.md` §22
> allows 20–50, and the two e2e specs' `DRAW_CALL_BUDGET` went 12 → 16 deliberately). The bench
> now measures the same load twice in one run, with the groups and without
> (`renderGroups: false`), which is this review's measurement **M1**.
>
> **Update (M3-02d).** **F2, F3, F4, F5 and F6 are fixed.** The CRT is the pass-2 blit's own
> shader and the Mode-7 floor a mesh on `BG_MID`, so neither pools a render target or runs a second
> full-screen pass (`effects/crt.ts` `createCrtBlit`, `effects/mode7.ts` `createMode7Shader`;
> `PixiRendererOptions.screenPass: 'filter'` keeps the old path as an escape hatch);
> `estimateMemory` models Pixi's power-of-two pooling (`potBytes`); and `PixiRenderer.warmUp()`,
> called by `bootShell` behind the loading screen, draws one throwaway off-screen frame with every
> program and every pooled sprite in it. Measured by the bench: CRT `light` / `full` went 5 draw
> calls and 2,048 KB of pooled targets → **4 and 0** (the same as CRT `off`), the Mode-7 stage
> 7 and 512 KB → **6 and 0**. F1 and F9 were left to M3-02e — see the update above.
>
> **Update (M3-02c).** The instrument this report asked for exists: `pnpm bench` →
> `test/bench/render.perf.ts` measures `renderer.render()` in a real browser (**F10**), the debug
> overlay shows the structure-rebuild count and the pooled render-target total on the TV, the stale
> WebGL2 docblock is corrected and a dev switch A/Bs the version (**F8**). What it already settles
> without the hardware is in [input-probe-results.md §11.3](input-probe-results.md#113-what-the-headless-bench-already-says):
> essentially **every** frame rebuilds the scene's instruction set (F1's mechanism, confirmed against
> a browser — M3-02e then fixed it), CRT `light` costs what CRT `full` costs (F2), and a 384×216
> filter pass really is pooled as 512×256 (F3). The *milliseconds* on the M7 still need §4's table — the recipe is in
> [rendering-and-shell.md § Measuring on the TV](rendering-and-shell.md#measuring-on-the-tv).
>
> **Nothing here was measured on the hardware.** Every claim is marked *Confirmed* (read from the code and verifiable
> headlessly) or *Needs-measurement* (mechanism certain, magnitude unknown). §4 lists exactly what has to be measured
> on the monitors, and §6 says where the author was unsure. The work it proposes is plan steps
> **M3-02c / M3-02d / M3-02e**; M3-02c builds the measurement harness that settles the open magnitudes.

## 0. Project facts established from the repo (not taken on trust)

| Fact | Evidence |
|---|---|
| **Pixi v8.20.1**, used as a *renderer only* — no `Application`, no Pixi ticker | `pnpm-workspace.yaml:18` (`pixi.js: ^8.20.1`), `node_modules/.pnpm/pixi.js@8.20.1`, `packages/render-pixi/src/renderer/index.ts:604-623` (`new WebGLRenderer()` + `renderer.init`) |
| Internal resolution **384×216**, nearest, integer upscale (decision **D19**) | `shmup_plan.md:137`; `packages/render-pixi/src/renderer/index.ts:604-606, 630-636`; `packages/render-pixi/src/viewport/index.ts:86-110` (`computeIntegerViewport`), `:216-260` (`computeAspectViewport`, M3‑02) |
| Two passes per frame: scene → 384×216 `RenderTexture`, then one scaled sprite → canvas | `renderer/index.ts:826-827, 1175-1176` |
| Context requested: `resolution 1`, `autoDensity false`, `antialias false`, `roundPixels true`, `preferWebGLVersion 1`, `powerPreference 'high-performance'`, `hello false` | `renderer/index.ts:611-623` |
| Context is **already `alpha: false`** (Pixi derives it from `background.alpha < 1`; we pass an opaque background) | `node_modules/.pnpm/pixi.js@8.20.1/.../gl/context/GlContextSystem.mjs:65` + `renderer/index.ts:621` |
| **One** atlas page, 1024×1024, 1318 frames / 438 sprites, `scaleMode 'nearest'`, `autoGenerateMipmaps: false` | `assets/generated/atlas/main.json`; `packages/render-pixi/src/atlas/index.ts:288-295`; `ATLAS_PAGE_MAX_SIZE = 2048` in `apps/tizen/scripts/check-bundle.mjs:66` |
| Vsync‑locked tick policy (M3‑02b) | `packages/core/src/loop/index.ts:59-66, 160-176, 213-219`; enabled between 55–65 Hz by `packages/shell/src/frame-loop/index.ts:110-120` and `packages/shell/src/boot/index.ts:1209-1212` |
| Shipped shaders after M3‑02: layer effect, Mode‑7, CRT — all GLSL ES 1.0, `mediump` with a `highp` upgrade guard | `packages/render-pixi/src/effects/shaders.ts` (whole file) |
| Tizen bundle: one classic ES2018 IIFE, `chrome69` target | `apps/tizen/vite.config.ts:120-140`; budget `APP_JS_GZIP_BUDGET = 512 * 1024` (`apps/tizen/scripts/check-bundle.mjs:62`). Current built `dist/app.js` = 1 542 724 B raw, **397 864 B gzip (388.5 KB)** — 76 % of budget |
| Bundle tree‑shaking is excellent: no `EventSystem`, `AccessibilitySystem`, `Graphics` pipeline, `Text`, `TilingSprite`, `NineSlice`, `ParticleContainer`, `Assets` loaders, WebGPU | measured by grepping `apps/tizen/dist/app.js` |
| Hardware (measured 2026‑09‑15, both monitors): Chromium 69.0.3497.106, **1920×1080 @ DPR 1**, **Mali‑G51**, WebGL **1 and 2**, `MAX_TEXTURE_SIZE` 8192, 4 cores, rAF median 16.5 ms, p95 ≈ 30 ms, 27–32 % of deltas > 20 ms, ~59 fps delivered | `docs/dev/input-probe-results.md` §8, §9; raw logs in `tools/input-probe/results/2026-09-15-m7/` |

**Scene size.** A bound campaign world creates roughly **6 000–6 500 Pixi display objects**, all preallocated: 1 924 sprite‑binding slots (bullets 512 + point items 512 + shots 192 + blocks 256 + chains 128 + enemies 128 + boss parts 128 + items 32 + the rest), 512 bending‑laser node sprites, 32 laser sprites, up to 1 274 terrain tiles (49 × 26 at 8 px), 512 particles, 1 024 HUD quads, 1 024 UI quads, parallax rows, popups and the overlay sprites. (Capacities: `packages/core/src/bullets/index.ts:158,161,343,346,370`, `weapons/index.ts:268`, `enemies/index.ts:259,363`, `powerups/index.ts:410`, `stage/systems.ts:75,78,90`, `bosses/index.ts:216` + `data/index.ts:944`, `render-pixi/src/layers/index.ts:238-254`, `particles/index.ts:83,607-619`, `text/index.ts:37`.)

---

## 1. Executive summary

**Best expected frame‑time payoff, in order:**

1. **Stop the whole ~6 400‑object scene graph being re‑walked and re‑batched every frame.** Every `sprite.visible = …` sets `structureDidChange = true` on the *root* render group (`Container.mjs:1060-1069`), which makes Pixi throw away and rebuild the entire instruction set — full tree walk + re‑pack of every visible quad — instead of taking the cheap "update only what moved" path (`RenderGroupSystem.mjs:92-110`). Our draw path toggles `visible` in every binding, every frame (`sprites/index.ts:311,327,337,388,405,543,565`). Isolating the big sub‑trees into their own render groups (and/or moving the bullet/point/particle pools to `ParticleContainer`) is the single largest CPU lever available. **High / Needs‑measurement (mechanism Confirmed).** — **FIXED in M3-02e** by the first of those two: one render group per high‑churn layer, which took the bench's worst‑case frame from 659 scene rebuilds in 660 frames to **0**. `ParticleContainer` was never needed.

2. **The CRT filter is far more expensive than the code comments suggest.** It is attached to the pass‑2 `screen` container (`effects/crt.ts:231`), so at 1920×1080 Pixi allocates a **2048×2048 pooled RGBA render target (16 MB)** — `TexturePool.getOptimalTexture` rounds to next‑pow‑2 (`TexturePool.mjs:51-56`) — renders the upscaled picture into it, then runs a *second* full‑screen pass. `crtResolution(1080) = 1` (`effects/crt.ts:152-155`), so the "capped at 1080p" comment buys nothing on the M7: CRT roughly **triples** the frame's fill‑rate and bandwidth. Folding the CRT into the pass‑2 blit shader makes it nearly free. **High / Confirmed.**

3. **`estimateStageMemory` does not know about that 16 MB.** `packages/shell/src/memory/index.ts:106,209-210` models only `frame × (1 + FILTER_TARGETS)` at 384×216 (≈1 MB) plus canvas buffers. The M3‑02 CRT target is 16× the whole modelled render‑target figure. **Medium / Confirmed (a real estimator bug).**

4. **GL programs compile on first *draw*, not at construction** (`GlShaderSystem.mjs:90-95`). The layer‑effect program compiles the first frame the camera enters a raster/palette range; the Mode‑7 program the first frame the camera crosses `floor.from`; the CRT program the frame the player switches CRT on in Options. On a Mali‑G51 that is a one‑off 5–50 ms stall **in gameplay**. A load‑time warm‑up frame removes it. **Medium / Confirmed.**

5. **Pixi's batcher starts at 16 bytes and grows by doubling** (`Batcher.mjs:72` + `defaultOptions.attributesInitialSize = 4`, `:369-373`), and each pooled sprite gets its `BatchableSprite` allocated **the first time it is ever drawn** (`SpritePipe.mjs:36-45`). So the first time a frame is busier than any frame before it — the first 512‑bullet boss pattern, the first big explosion — Pixi allocates and copies a several‑hundred‑KB ArrayBuffer *inside* `renderer.render()`. Our allocation guards cannot see this: `packages/render-pixi/test/helpers.ts` runs in Node against fake atlases, so the zero‑allocation guarantee stops at the `renderer.render()` boundary. **Medium / Confirmed mechanism, Needs‑measurement for size.**

**Currently at risk**

- There is **no render‑side performance test at all**. `pnpm bench` (`test/bench/*.perf.ts`) measures the *simulation* only (median ≈ 0.12 ms/tick against a 1.0 ms budget). The render budget from `shmup_feat.md:671` ("render ≤ 8 ms, 20–50 draw calls") is checked only incidentally by two e2e specs with `DRAW_CALL_BUDGET = 12` (`test/e2e/mode7.spec.ts:34`, `test/e2e/raster.spec.ts:32`). Nothing would catch a render regression from M3‑03 onwards.
- ~~The renderer's module docblock still says *"WebGL2 on Tizen 5.5 GPUs is unverified"*~~ — **fixed in M3-02c**, together with a dev switch (`?gl=2` on the web, `localStorage['shmup-cup:gl']` on the TV) so the version can be A/B'd. WebGL1 remains the shipped default.
- `docs/dev/input-probe-results.md` §7 (Home = `blur`, no `visibilitychange`) has been addressed by M3‑02b (`apps/tizen/src/boot/index.ts` passes `focus: win`), but the renderer keeps drawing under the Home overlay at ~56 fps. Worth confirming the renderer actually stops.

**Good news worth stating plainly:** the rendering architecture is *already* right for this hardware. Low‑res render texture + one nearest integer upscale (~29× less fill than drawing at 1080p), one atlas page, no mipmaps, no antialias, pixel‑snapped integer positions, pooled everything, texture bindings never changed mid‑frame in a way that breaks batching, blend modes fixed at creation, and a genuinely allocation‑free sync path. Most of the third‑party advice is either already implemented or actively wrong here.

---

## 2. Findings

### F1 — Every frame rebuilds the whole scene's instruction set because the draw path toggles `visible`
**Impact: High · Mechanism Confirmed · Size Needs‑measurement · FIXED in M3-02e**

> **What was done (M3-02e).** Option **(a)** below, taken to its conclusion: every layer whose
> bindings toggle `visible` while the game runs — `TERRAIN`, `GROUND_ENEMIES`, `AIR_ENEMIES`,
> `PLAYER_SHOTS`, `PLAYER`, `HITBOX`, `ITEMS`, `FX`, `ENEMY_BULLETS`, `HUD`, `UI` — is created as
> its own render group (`layers/index.ts` `RENDER_GROUP_LAYERS`). `BG_FAR` and `BG_MID` are not:
> the parallax bands are shown once when they are bound and only their containers move afterwards,
> so a group there would buy a batch boundary and nothing else. Neither is `DEBUG`, which is empty
> in a release build.
>
> The bench measures it both ways in one run (`createPixiRenderer({ renderGroups: false })` builds
> the old single-group scene, which is this review's measurement **M1**): over the same worst-case
> frame, **659 of 660 frames rebuilt the whole scene → 0 of 660**, while `groupRebuilds` — the same
> flag counted over *every* group of the scene, added so the fall cannot hide as churn that merely
> moved — shows about 2.4 layer groups rebuilding per frame instead of one 6,400-object one. Draw
> calls went 4 → 9 and the two e2e specs' `DRAW_CALL_BUDGET` 12 → 16 (`shmup_feat.md` §22 allows
> 20–50). Options **(b)** `ParticleContainer` and **(c)** degenerate quads were **not** done: (a)
> was enough, and the step's own rule was to stop as soon as it was.
>
> Under SwiftShader, where the bench runs, the change reads as **0.92–0.94×** the p95 of the
> single-group scene over three runs — a small gain, and the least transferable number here, because software
> WebGL charges CPU time for the extra draw calls while making the tree walk comparatively cheap
> on a desktop core. The Kant-SU2's Cortex-A55 pays the opposite way round. The **counted**
> result — 659 → 0 whole-scene rebuilds, and a terrain grid, HUD and UI whose vertex buffers are
> no longer re-uploaded every frame — is what transfers; the milliseconds are M1's job on the TV.

**Today.** `SpriteLayerBinding.sync` hides unused slots and shows live ones (`packages/render-pixi/src/sprites/index.ts:311, 327, 337`), `QuadPool.end` hides the tail (`:565`), the particle system hides its tail (`particles/index.ts:952-954`), the terrain grid hides empty cells, and the flash/dim overlays flip `visible` (`renderer/index.ts:1148-1165`). In Pixi v8, `set visible` does:

```js
if (this.parentRenderGroup) { this.parentRenderGroup.structureDidChange = true; }
```
(`Container.mjs:1063-1065`)

and `RenderGroupSystem._updateRenderGroups` then takes the expensive branch:

```js
if (renderGroup.structureDidChange) { renderGroup.structureDidChange = false; this._buildInstructions(renderGroup, renderer); }
else { this._updateRenderables(renderGroup); }
```
(`RenderGroupSystem.mjs:100-106`)

`_buildInstructions` resets the instruction set, calls `batch.buildStart`, and walks the **entire** tree via `collectRenderablesWithEffects` (`:127-139`), re‑packing every visible quad's 24 floats. The scene passed to `renderer.render()` is one render group, so one hidden bullet costs a walk over all ~6 400 objects.

**Why it matters here.** The M7 is a Kant‑SU2 with 4 cores (probe §9) — Cortex‑A55 class, ~1.1–1.4 GHz. A 6 400‑node megamorphic tree walk plus re‑packing ~1 000–1 500 visible quads is the kind of work that costs a fraction of a millisecond on a desktop and **1–4 ms** here. At a 16.7 ms budget with a game that already shows p95 rAF deltas of 30 ms, that is material.

**Concrete changes (pick by measurement, cheapest first):**

- **(a) Split the scene into render groups.** `collectRenderables` does *not* descend into a child render group — it emits one instruction (`collectRenderablesMixin.mjs:6-14`). Marking the high‑churn and the large‑but‑static sub‑trees as their own groups (`new Container({ isRenderGroup: true })`) means a bullet appearing no longer rebuilds the terrain grid's 1 274 tiles. Best candidates by size: the terrain container (`layers/index.ts:247`), the enemy‑bullet and point‑item bindings, the HUD and UI quad pools, the particle container. **Cost:** each render group is a batch boundary, so draw calls rise by roughly the number of groups. The e2e budget is 12 (`test/e2e/mode7.spec.ts:34`) and `shmup_feat.md:671` allows 20–50, so 5–6 extra groups fits, but the e2e constant would need raising — a deliberate decision, not a silent one.
- **(b) `ParticleContainer` for the pure‑quad pools.** A `ParticleContainer` is a *single* renderable: the 512 enemy bullets, 512 point items and 512 particles become 3 scene nodes instead of 1 536, and hiding is `particleChildren.length = n; update()` — contained to its own buffer instead of a scene‑wide rebuild (`ParticleContainer.mjs:34-51,135-139`). All particles must share one texture *source*, which we satisfy (one atlas page). **Caveats that make this larger than it looks:** v8 needs `dynamicProperties: { uvs: true }` for per‑slot frames (default is `false`, `:395-408`); `Particle` has no `visible`, no `Sprite` API, so `place()`/`resolveFrame` would need a parallel path; and it adds ~10 KB gzip to a bundle at 76 % of budget. Do it only if (a) is not enough.
- **(c) Stop toggling `visible` in the hottest pool.** Parking an unused slot as a degenerate quad (scale 0, texture unchanged) keeps the structure stable, so Pixi takes the `_updateRenderables` path. It costs vertex work for dead slots but zero fill. This is the surgical, minimal‑diff version.

**Hard‑rule conflicts:** none. All three are presentation‑only; `@shmup/core` is untouched, determinism and goldens unaffected. (b) costs bundle bytes.

---

### F2 — The CRT filter costs a 16 MB render target and an extra full‑screen pass at 1080p
**Impact: High · Confirmed · FIXED in M3-02d**

**Today.** `createCrtPass` attaches the filter to the pass‑2 `screen` container (`effects/crt.ts:231`). That container holds the two side panels and the frame sprite, which at 1920×1080 in `normal`/`integer` mode covers the canvas exactly (384 × 5 = 1920, 216 × 5 = 1080). Pixi clips filter bounds to the viewport (`FilterSystem.mjs:_calculateFilterBounds` → `bounds.fitBounds(0, viewPort.width/res, …)`), giving 1920×1080, then `TexturePool.getOptimalTexture` rounds **up to the next power of two on each axis** (`TexturePool.mjs:51-56`) → a **2048 × 2048 RGBA8 texture = 16.8 MB**, of which 8.3 MB is used.

Per frame, with CRT on:
- pass 1: scene → 384×216 (82 944 px)
- pass 2a: frame sprite + panels → the 2048² pooled texture, covering 1920×1080 (2 073 600 px)
- pass 2b: CRT fragment shader → canvas (2 073 600 px)

versus 82 944 + 2 073 600 with CRT off. That is **~2.0×** the fragment work and ~2.0× the framebuffer bandwidth (roughly 16 → 33 MB/frame, ~1 → 2 GB/s at 60 Hz) on a GPU that shares memory bandwidth with the TV's own compositor. The `light` setting is no cheaper than `full` — same program, same passes, only uniforms differ (`crt.ts:65-70`).

The docblock's promise — *"caps the pass at `CRT_MAX_HEIGHT` rows … a 4K TV pays for a 1080p pass"* (`crt.ts:11-13`) — is correct but **inert on the M7**, because the Tizen web viewport is 1920×1080 (probe §9) and `crtResolution(1080)` returns 1 (`crt.ts:152-155`). There is no 4K web canvas to cap.

**Concrete change.** Replace the post‑filter with a **custom pass‑2 blit**: make the frame sprite a `Mesh` with a quad `Geometry` and a `Shader` built from `CRT_VERTEX`/`CRT_FRAGMENT` plus a sampler on `frameTexture`, and pass `uScan/uMask/uVignette = 0` when CRT is off. The CRT then costs *the same* as today's plain upscale — one draw, no extra render target, no extra pass, 16 MB of VRAM freed — and `crtResolution` can go away. The shader already only multiplies down (`shaders.ts` CRT remarks), so the flash limiter still holds.

**Interim change if the rewrite is deferred:** cap the pass below 1 on TV (e.g. `CRT_MAX_HEIGHT = 720` for a TV profile) so the pooled texture drops to 1024×1024 (4 MB) and the filter fill to ~0.9 Mpx; and document in the Options screen that CRT costs frame time. Also add the target to `estimateMemory` (see F3).

**Risk/effort:** Mesh + Shader is a contained change in `effects/crt.ts` + `renderer/index.ts` pass‑2 setup; needs new unit tests and a golden/e2e screenshot check. Medium effort, low risk. **No hard‑rule conflict** (presentation only, no allocation in the per‑frame path — uniforms are written into a preallocated `UniformGroup` exactly as today).

---

### F3 — `estimateMemory` under‑counts GPU render targets (misses the CRT target entirely)
**Impact: Medium · Confirmed · FIXED in M3-02d**

**Today** (`packages/shell/src/memory/index.ts:106-109, 208-210`):

```ts
const frame = FRAME_WIDTH * FRAME_HEIGHT * 4;                       // 331 776
const targets = frame * (1 + FILTER_TARGETS)                        // FILTER_TARGETS = 2
  + display.width * display.height * 4 * CANVAS_BUFFERS;            // CANVAS_BUFFERS = 3
```

Three things are wrong or missing:
1. **No CRT target.** 2048×2048×4 = 16.8 MB when the player turns CRT on — 16× the whole `frame * 3` term.
2. **No POT rounding.** A 384×216 filter target is pooled as 512×256 = 524 288 B, not 331 776 B (`TexturePool.mjs:51-56`) — a 1.6× undercount per layer‑effect / Mode‑7 pass.
3. **`FILTER_TARGETS = 2` predates M3‑02.** A stage can have layer effects on several layers *plus* the Mode‑7 floor *plus* CRT concurrently.

**Change.** Add a `crtFilter: CrtFilter` (and display size) input; add a `potBytes(w,h)` helper; count `1 (frame RT) + activeFilterLayers + mode7 + crt` targets with POT rounding. The `CANVAS_BUFFERS = 3` term (24.9 MB at 1080p) is generously sized and already covers the always‑on `stencil: true` attachment Pixi requests (`GlContextSystem.mjs:72`), so leave it.

**Risk/effort:** small, test‑only blast radius. Worth doing because the 120 MB Tizen install cap / <100 MB budget (`shmup_feat.md:671`) is exactly what this function exists to defend.

---

### F4 — Shaders compile on first draw, mid‑gameplay
**Impact: Medium · Confirmed · FIXED in M3-02d**

`GlShaderSystem._getProgramData` compiles and links lazily: `this._programDataHash[program._key] || this._createProgramData(program)` (`GlShaderSystem.mjs:90-95`). Construction of a `Filter`/`GlProgram` does *not* touch the GL context.

So each of our three effect programs links on the frame it is first **drawn**:
- **layer effect** — the frame `layerEffects.attach(layer)` first fires (`effects/layer-effects.ts:293`), i.e. when the camera enters a raster/palette range *during a stage*;
- **Mode‑7** — the frame `camera.x` first crosses `floor.from` (`effects/mode7.ts:275-279`), also mid‑stage;
- **CRT** — the frame the player picks CRT in Options (`effects/crt.ts:227-232`).

On a Mali‑G51 with Chromium 69, a GLSL compile + link is typically 5–50 ms; Chromium's program binary cache helps only on the *second* launch. The result is a guaranteed one‑off hitch exactly at a dramatic moment (entering the water stage, the pseudo‑3D floor).

**Change.** Add a load‑time **warm‑up** in the shell's boot sequence, behind the loading screen: attach each filter that the bound world can ever use, render one throwaway frame into `frameTexture`, detach. This also warms the batch shader and the two‑pass path. Combine with F5 (same warm‑up frame).

**Risk/effort:** low; needs care that the warm‑up frame is never presented and does not disturb `lastTick` / effect state.

---

### F5 — Pixi allocates inside `renderer.render()` on "busiest frame yet" — and CI cannot see it
**Impact: Medium · Mechanism Confirmed, size Needs‑measurement · FIXED in M3-02d**

Two allocation sources live *past* the boundary our guards measure:

1. **Batcher growth.** `attributesInitialSize` defaults to 4 floats (`Batcher.mjs:369-373`), so the attribute buffer starts at 16 bytes and doubles via `_resizeAttributeBuffer` (`:305-311`) — each growth allocates a new `ViewableBuffer` and `fastCopy`s the old one. A frame with ~1 500 quads needs ~144 KB; the peak busy frame (512 bullets + 512 point items + particles + HUD) needs ~400 KB. Every new high‑water mark costs an allocate‑and‑copy **during gameplay**.
2. **Lazy `BatchableSprite`.** `SpritePipe._initGPUSprite` allocates one object per sprite, on the sprite's first ever draw (`SpritePipe.mjs:36-45`). With ~6 400 pooled sprites, these trickle in over the session — the first time the 500th bullet slot lights up, that's a fresh allocation.

Our allocation guards run in Node with fake atlases and fake images (`packages/render-pixi/test/helpers.ts:1-8`), so they prove that *our* `sync`/`draw`/`step` code allocates nothing — which it genuinely does, and beautifully (the `setTint`/`setAlpha`/`FrameBlend`/`DrawnCamera` work in `sprites/index.ts:141-183` and `renderer/index.ts:224-236` is exemplary). But the docs and `docs/dev/conventions.md:100-113` read as if `renderer.render()` is allocation‑free end to end. It is not, and cannot be made so without pre‑warming.

**Change.** The same warm‑up frame as F4: make every pooled sprite visible once (with the 1×1 pixel frame, scaled to 0 or drawn into a discarded target) so that every `BatchableSprite` exists and the batcher's buffers are already sized for the worst case before the title screen. Then document the residual: "Pixi allocates on first draw of a sprite and on batch growth; the boot warm‑up covers both."

**Hard‑rule conflict:** none — this *strengthens* the zero‑allocation rule rather than weakening it.

---

### F6 — Mode‑7 is a filter over a dummy sprite whose input the shader never reads
**Impact: Medium‑Low · Confirmed · FIXED in M3-02d**

`createMode7Floor` puts a full‑frame `Texture.WHITE` sprite with `alpha = 0` at the bottom of `BG_MID` purely to give the filter an area (`effects/mode7.ts:239-243`), and the fragment shader ignores `uTexture` entirely — it samples `uTile` from the atlas and writes the floor (`shaders.ts`, MODE7_FRAGMENT). Pixi still does the full filter dance: pool a 512×256 target (POT of 384×216 = 512 KB), render the (invisible) sprite into it, then run the filter pass. One wasted render‑target allocation, one wasted pass, one wasted clear.

**Change.** Same shape as F2: a `Mesh` with the Mode‑7 `Shader` on `BG_MID`, drawn directly. One draw call, no pooled target, no copy. Small absolute saving (~131 k fragments and 512 KB), but it also removes a filter from the *scene* pass — which currently forces `collectRenderablesWithEffects` on the `BG_MID` layer and an extra filter‑stack push/pop every frame that stage is on screen.

**Risk/effort:** low–medium, mirrors the CRT change; `test/e2e/mode7.spec.ts` already exists to catch regressions.

---

### F7 — Layer‑effect filters are correctly implemented; the 64 px margin is *not* a cost (correcting a plausible worry)
**Impact: — · Confirmed (this is a "no action needed" finding)**

`FILTER_AREA_MARGIN = 64` gives a `filterArea` of 512×344 (`effects/layer-effects.ts:56, 272-277`), which looks like a 2× fill inflation. It is not: `FilterSystem._calculateFilterBounds` clips to the render target's viewport *before* padding (`bounds.fitBounds(0, viewPort.width / rootResolution, …)`), and pass 1's viewport is 384×216. So a filtered layer costs one pooled 512×256 target and two 82 944‑px passes — about 0.2 MB and ~0.17 Mfrag. Negligible on a Mali‑G51. The `resolution: 1` + `antialias: 'off'` + nearest table texture choices (`layer-effects.ts:118-127, 148-153`) are all correct for pixel art. **Leave as is.**

---

### F8 — `preferWebGLVersion: 1` is defensible, but its stated justification is now false
**Impact: Low · Needs‑measurement · Docblock fixed and the A/B switch added in M3‑02c**

`renderer/index.ts:4-5` says *"WebGL1 preferred — WebGL2 on Tizen 5.5 GPUs is unverified"*, and `:619` defaults to 1 (both hosts pass 1: `apps/tizen/src/boot/index.ts` `preferWebGLVersion: 1`; `shell/src/boot/index.ts:922`). The probe **verified WebGL 2 (OpenGL ES 3.0) on both M7s** with `MAX_TEXTURE_SIZE 8192` (probe §9); `shmup_tech.md` §2.2 has already been annotated with the measurement but the code comment has not.

What WebGL2 would actually buy us in Pixi v8: native VAOs (WebGL1 uses the `OES_vertex_array_object` extension when present — Mali has it), UBOs for uniform groups (`GlLimitsSystem.mjs:13` reads `MAX_UNIFORM_BUFFER_BINDINGS` only on WebGL2), and `Uint32Array` indices. With 2–6 draw calls per frame and one atlas page, the CPU saving is in the tens of microseconds. What it risks: 2020‑vintage Mali WebGL2 driver paths under Chromium 69, and our three shaders are GLSL ES 1.0 which Pixi would keep as‑is anyway.

**Recommendation:** keep WebGL1 as the shipped default (it is the conservative choice for the *older* sets the project also targets), **fix the stale comment**, and add a debug‑tools toggle or a `?gl=2` dev switch so the owner can A/B it on device with the overlay's frame graph. Do not change the default on speculation.

---

### F9 — `Texture.WHITE` in the scene pass adds a second texture binding
**Impact: Low · Confirmed · FIXED in M3-02e**

> **What was done (M3-02e).** The five full-screen overlays of pass 1 — the backdrop, the two
> flashes, the playfield dim and the UI dim — take `atlas.textures[atlas.pixelFrame]` when the
> renderer has an atlas (`createAtlas` already falls back to `Texture.WHITE` itself when a
> manifest has no `ui/pixel`, and a renderer built without an atlas has nothing else to use), so
> pass 1 samples one texture. The Mode-7 sprite this finding also named stopped existing in
> M3-02d — the floor is a mesh with its own program. The **side panels stay on `Texture.WHITE`**
> on purpose: they are in pass 2, whose only other node is the blit mesh sampling the frame
> texture, so the atlas page there would be a binding added rather than one saved. As predicted,
> no draw call changed.

The background, both flash overlays, the playfield dim, the UI dim and the Mode‑7 sprite all use `Texture.WHITE` (`renderer/index.ts:642-644, 658-674, 683-689`; `effects/mode7.ts:241`), while everything else draws from the atlas page. The atlas already contains `ui/pixel` (`atlas/index.ts:47`, `PIXEL_SPRITE`) and `QuadPool.rect` correctly uses it (`sprites/index.ts:520`). Using `atlas.textures[atlas.pixelFrame]` for those six sprites too would make the whole low‑res pass single‑texture.

It does **not** save a draw call today — Pixi's multi‑texture batcher handles 2 sources in one batch — but it removes a texture unit from the batch shader's branch and removes a dependency on a Pixi‑global texture. Cheap, tidy, low value. Do it opportunistically.

---

### F10 — No render‑side benchmark or regression gate
**Impact: Medium (process) · Confirmed · Addressed by M3‑02c**

`test/bench/stress.perf.ts`, `zones.perf.ts` and `soak.perf.ts` all drive `stepWorld` / `createGame` headlessly — pure simulation. `stress.perf.ts:39-43` budgets 1.0 ms/tick and 512 KB heap; the plan records the measured median as ≈ 0.12 ms/tick (`shmup_plan.md:2039`). **Nothing measures `renderer.render()`.** The only render‑cost assertions in the repo are `DRAW_CALL_BUDGET = 12` in `test/e2e/mode7.spec.ts:246` and `test/e2e/raster.spec.ts:223,254`.

Given that this report's largest findings are all in the Pixi half of the frame, and that M3‑03 will add more, a render gate is worth a plan step:
- a Playwright bench that drives the built web bundle to a scripted busy frame (512 bullets, particles, a filtered layer, CRT on/off) and asserts `renderer.drawCalls` (already exposed, `renderer/index.ts:1177`) and a `render ms` percentile from the debug tools' `beforeRender`/`afterRender` hooks (`shell/src/boot/index.ts:1245-1247`);
- plus a browser‑side JS‑heap delta over N frames, which would catch F5 and any future Pixi‑internal allocation.

---

### F11 — Smaller notes, each Confirmed

- **`hello: false`, `powerPreference: 'high-performance'`** are set (`renderer/index.ts:620-622`). `powerPreference` is a no‑op on a single‑GPU TV SoC; harmless.
- **`stencil: true`** is hard‑coded by Pixi for every context (`GlContextSystem.mjs:72`) — an unavoidable depth/stencil attachment at 1920×1080. Already covered by the estimator's `CANVAS_BUFFERS = 3`.
- **`useBackBuffer` defaults to `false`** (`GlBackBufferSystem.mjs:135-138`), so we are not paying for the extra big‑triangle present pass. Good — and a reason *not* to enable `antialias`, which would drag the back buffer in.
- **Pixi's `GCSystem` is active** (`GCSystem.mjs:294-301`: `gcActive: true`, 60 s idle, 30 s sweep) but only manages GL textures/buffers/geometries and `Graphics`/`Text`/`TilingSprite`/`ParticleContainer` renderables — **plain `Sprite` is not GC‑managed** (`"renderable"` hashes are registered only by those pipes). So our 6 400 pooled sprites are safe. The atlas page is drawn every frame and never idles out. **No action.** (If F1(b) introduces `ParticleContainer`, it *does* become GC‑managed — worth `autoGarbageCollect = false` on it.)
- **Assigning `filters`** allocates two objects (`value.slice(0)` + `Object.freeze`, `effectsMixin.mjs:60-73`). The code already confines this to range edges and documents why (`layer-effects.ts:17-19`, `crt.ts:15-17`, `mode7.ts:16-18`). Correct.
- **`resetPass`** (`renderer/index.ts:551-563`) is a genuinely good piece of work — it keeps Pixi's mutation of the options object from leaking across frames without allocating. Worth keeping in the conventions doc as an example.
- **Audio does not threaten frame pacing.** The engine renders/decodes only in `loadSfx` / `prepareMusic`, never mid‑stage (`packages/audio-web/src/engine/index.ts:7-12`), and music decodes through an `OfflineAudioContext(2, 1, 32000)` (`loader/index.ts:868-876`). The probe's 44.1 kHz / 50 ms `baseLatency` is a latency concern, not a frame‑time one.

---

## 3. Verdict on each third‑party claim

| # | Claim | Verdict | Reason |
|---|---|---|---|
| 1 | Tizen renders web UI at 1920×1080 and upscales to 4K; don't force a 4K viewport | **Already done / correct premise** | Probe measured 1920×1080 @ DPR 1 (`input-probe-results.md` §9); D19 fixes 384×216 ×5 (`shmup_plan.md:137`); we never set a viewport meta beyond `width=device-width` (`apps/tizen/index.html:6`) |
| 2 | Use `<video>` / AVPlay for a native 4K plane | **Not applicable** | The game ships no video. Nothing to gain |
| 3 | Add `<feature name=".../screen.size.normal.1080.1920"/>` to `config.xml`; 2160.3840 is unsupported | **Wrong for us / unverifiable** | `screen.size.*` features belong to the mobile/wearable profiles. Our widget is `<tizen:profile name="tv-samsung"/>` (`apps/tizen/public/config.xml:22`), validates under `validateConfigXml` (`apps/tizen/scripts/config-xml.mjs:176-260`), installs and runs. Adding an undeclared feature risks a new compliance failure for zero benefit. Do not touch |
| 4 | Use SVG for all UI components, buttons and graphics; avoid raster | **Wrong for us — actively harmful** | The whole game is a 384×216 pixel‑art frame nearest‑upscaled ×5. There is no DOM UI: the HUD and every menu are bitmap‑font quads drawn from core `DrawList`s (`render-pixi/src/ui/index.ts`, `text/index.ts:1-25`). SVG would need rasterisation → upload, break the integer pixel grid that `roundPixels: true` + `Math.round` exist to protect, add bundle weight to a 76 %‑full budget, and destroy the art direction |
| 5 | Map px linearly out of 1080p / use percentage scaling so the hardware scaler handles the 2× push | **Already done** | `computeIntegerViewport` gives exactly ×5 at 1920×1080 (`viewport/index.ts:86-110`); the canvas backing store is sized to `innerWidth/innerHeight` (`shell/src/boot/index.ts:921-922, 1161-1162`), which is *better* than their fixed‑1920‑buffer‑stretched‑by‑CSS suggestion — that would blur on a 1280×720 FHD set |
| 6 | Log `screen.width/height` and `tizen.systeminfo` DISPLAY | **Already done** | `apps/tizen/src/device-info/` feeds the debug overlay's device line and logs `Shmup Cup device` (`apps/tizen/src/boot/index.ts:200-233`); the probe already captured both |
| 7 | `canvas.getContext('2d', { alpha: false })` | **Not applicable** | No 2D context anywhere |
| 8 | `getContext('webgl', { alpha: false, … })` | **Already done (implicitly)** | Pixi derives `alpha` from the background: `const alpha = this._renderer.background.alpha < 1` (`GlContextSystem.mjs:65`); we pass an opaque `background` and no `backgroundAlpha`, so the context is created with `alpha: false` |
| 9 | `powerPreference: "high-performance"` | **Already done** | `renderer/index.ts:620`. A no‑op on a single‑GPU TV SoC, but harmless |
| 10 | `antialias: true` | **Wrong for us** | We deliberately set `antialias: false` (`renderer/index.ts:617`) and `RenderTexture … antialias: false, scaleMode: 'nearest'` (`:630-636`). AA on an integer‑scaled pixel‑art frame produces exactly the soft, wrong‑looking edges the design forbids, costs MSAA resolve bandwidth on a bandwidth‑bound Mali, and would force Pixi's back‑buffer path on (`GlContextSystem.mjs:67`) — a whole extra full‑screen present pass |
| 11 | `app.init({ width: 1920, height: 1080, resolution: 1, autoDensity: false, hello: false })` + explicit canvas CSS | **Partly already done; the `Application` part is wrong for us** | `resolution: 1`, `autoDensity: false`, `hello: false` are all set (`renderer/index.ts:613-622`). We deliberately do **not** use `Application` — no Pixi ticker, the host's fixed‑step loop owns the frame (`renderer/index.ts:7-9`, `core/loop`). The CSS is already right (`apps/tizen/index.html:13-20`) |
| 12 | `mipmap: true` on all sprite sheets/textures | **Wrong for us — directly contradicts their own point 3.3** | Nothing is ever minified: 384×216 is *magnified* ×5 with nearest sampling. Mipmaps would add 33 % texture memory (+1.3 MB), need a POT/complete chain, and — if ever sampled — blur pixel art. We correctly set `autoGenerateMipmaps: false` (`atlas/index.ts:292`) and `scaleMode: 'nearest'` (`:291`). Their own later bullet ("initialize textures with mipmapping disabled") contradicts this one |
| 13 | Avoid heavy filters / full‑screen fragment passes; cache as static textures | **Correct in principle, and the sharpest thing in the document** | This is exactly F2/F6. But we do not use `BlurFilter`/`GlowFilter` — our three filters are hand‑written single‑pass GLSL ES 1.0 (`effects/shaders.ts`). "Cache as static textures" does not apply: ours are per‑frame parametric (raster offsets, camera‑driven Mode‑7, scanline phase). The right fix is to remove the *filter wrapper*, not the effect |
| 14 | Use `ParticleContainer` for projectiles/particles: `new ParticleContainer({ maxSize: 2000, properties: { vertices, position, rotation, uvs, alpha } })` | **Right idea, wrong reason, wrong API** | The snippet is **Pixi v7**: v8 has no `maxSize` and no `properties`; it is `dynamicProperties: { vertex, position, rotation, uvs, color }` (`ParticleContainer.mjs:395-408`), and `uvs: false` would freeze every bullet on one frame of the atlas. Their reason (draw‑call overhead) is wrong — we already render the whole low‑res pass in a handful of calls from one atlas page, budget 12 (`test/e2e/mode7.spec.ts:34`). The *real* reason to consider it is F1: it collapses 512 scene nodes into 1 renderable and stops `structureDidChange` cascading. See F1(b) |
| 15 | "Never run `new Sprite()` or `container.removeChild()` during gameplay" | **Already done** | Every sprite is created at `bindWorld` / pool construction (`renderer/index.ts:836-925`, `sprites/index.ts:270-286, 502-511`); `render()` only assigns numbers and existing textures. Documented in `docs/dev/conventions.md:110-113` |
| 16 | "Use `this.pool.find(b => !b.active)` to spawn" | **Wrong for us — would violate a hard rule** | `Array.prototype.find` takes a callback (an allocation at the call site unless V8 inlines it) and is O(n) per spawn over 512 slots. Our pools are struct‑of‑arrays typed arrays with a packed live range and O(1) `takeSlot()` (`particles/index.ts:773-783`; core `createSoaPool`). `docs/dev/conventions.md:100-104` bans `map`/`filter` and closures in per‑tick paths outright. Adopting this would break the allocation guards in `packages/core/test/helpers/alloc.ts` |
| 17 | Compile everything into one atlas; loading individual textures forces texture‑bound swaps | **Already done** | One 1024×1024 page, 1318 frames (`assets/generated/atlas/main.json`), one `ImageSource` per page, frames as `Texture` views over it (`atlas/index.ts:5-8, 288-295`). Loaded with `new Image()`, not `Assets` (decision D25) — which is why `Assets` is tree‑shaken out of the bundle |
| 18 | Optimize the ticker: keep logic separate from rendering, index loops, boundary‑check against 1080p bounds | **Already done; the "1080p bounds" part is wrong** | Logic/render separation is the whole architecture (`core/loop` → `game.frame(now)` → `renderer.render(frame)`, `shell/src/boot/index.ts:1199-1248`); every sync is a plain index loop over typed arrays. Off‑screen recycling happens in the **simulation**, in 384×216 world pixels — the renderer never sees 1080p coordinates at all |
| 19 | Handle the Tizen back button (10009) | **Already done** | `TIZEN_BACK_KEY_CODE = 10009` and `watchBackKey` (`apps/tizen/src/platform/index.ts:53, 205`); a watcher covers the loading/error screens, then the scene stack owns Back and the title's exit confirmation calls `tizen.application.getCurrentApplication().exit()` (`:408`, `apps/tizen/src/boot/index.ts:38-43`) |
| 20 | "High bullet counts tank the frame rate on the M7 due to draw‑call overhead and GC spikes" | **Half right, and the half it gets right is not the half it names** | Draw calls are not the problem (≤12 measured). GC *is* a stated TV bottleneck (`shmup_tech.md` §2.2: "fill rate and GC pauses are the real TV bottlenecks, not sprite count") — but the remaining GC in this project is inside Pixi (F5), not in our code, and the dominant bullet‑count cost is the CPU instruction rebuild (F1), which they never mention |

**Summary:** of 20 claims, 9 are already implemented, 5 are wrong or harmful for this project, 2 are inapplicable, 3 are right in principle but for the wrong reason or with the wrong (v7) API, and 1 is unverifiable without risking compliance.

---

## 4. What we cannot know without the hardware

No Tizen CLI, no `sdb`, no device here. Everything below needs the owner in front of the monitors with a `pnpm --filter @shmup/tizen build:dev` bundle (the debug tools are dev/test only — `apps/tizen/src/main.ts:36`), unlocked with **Pause, Ch+, Ch+, Ch+**.

**Baseline capture (do this first, it is the control for everything else)**

1. Title screen idle, then zone A, then the boss. For each: read the overlay's **FPS**, **TICK ms**, **RENDER ms**, **DRAW**, and photograph the **frame graph** (`render-pixi/src/debug/index.ts:724-740`) and the **RAF histogram** (`:553-583`, buckets `[12,15,17,19,21,25,33]` ms).
2. Confirm the **TPF** counters (`:716-718`) read overwhelmingly `1` and that **LOCK** is showing (`:713`). If TPF shows a meaningful share of 0s and 2s, the M3‑02b vsync lock is not engaging — check the refresh probe is landing inside 55–65 Hz (`frame-loop/index.ts:110-120`).
3. Note **boot ms** (`data-shmup-boot-ms`, `shell/src/boot/index.ts` `BOOT_MS_ATTRIBUTE`) against the 10 s store budget.

**Measurements that decide the findings in this report**

| # | Question | How |
|---|---|---|
| M1 | **How much does F1 actually cost?** | Compare RENDER ms on the title screen (few visible sprites, structure nearly static) against a busy boss frame. Then, as a throwaway experiment, comment out the `visible = false` lines in `SpriteLayerBinding.sync` for one build and compare RENDER ms — the delta is the instruction‑rebuild cost. Do not ship that build |
| M2 | **How much does CRT cost?** | Options → CRT off / light / full, reading RENDER ms and FPS each time on the *same* stage section. Expect ≈ 2× RENDER ms if F2 is right. Also watch for a one‑frame stall the moment CRT is first switched on (that is F4's shader link) |
| M3 | **Mode‑7 and layer‑effect entry hitches** | Play into the Mode‑7 stage and the water/heat‑haze stage and watch the frame graph for a single red bar at the range boundary. A ~30–50 ms bar exactly once, on the first entry of a session, confirms F4 |
| M4 | **F5's batch‑growth hitch** | Frame graph during the first very dense pattern of a fresh launch, then again after a checkpoint restart. A red bar that appears only the first time is the buffer doubling |
| M5 | **WebGL1 vs WebGL2** | Two dev builds differing only in `preferWebGLVersion` (the overlay prints the version it got). Compare RENDER ms and the rAF histogram over 60 s of the same stage. Expect little difference; the point is to retire the guess in `renderer/index.ts:4-5` |
| M6 | **Memory** | Chrome DevTools over `sdb` → Memory / `performance.memory`, and `console.log(estimateStageMemory(...))` for each zone, with CRT on and off. Cross‑check against F3's corrected numbers before trusting the estimator |
| M7 | **Does the app stop rendering under the Home overlay?** | Press Home mid‑game, wait 10 s, come back. Probe §7 recorded rAF continuing at ~56 fps with no `visibilitychange`. Confirm M3‑02b's `blur` handling now pauses and suspends audio |
| M8 | **Input‑to‑photon latency** | Still the biggest unmeasured thing (probe §10). Needs a 240 fps phone video, game‑mode build (`pnpm --filter @shmup/tizen build:game-mode`) vs default, per plan §8.4/§8.5 |

**Things the overlay cannot tell you and would be worth adding while measuring:** the `structureDidChange` rate (a counter incremented in a patched build), the pooled‑render‑target byte total from `TexturePool`, and a per‑frame JS heap delta.

---

## 5. Suggested plan steps

If the owner wants this as work rather than a memo, it splits cleanly into three agent‑sized steps in the `shmup_plan.md` §5–§7 style. **M3‑02c should come first and gates the other two** — none of the rest should be written without the device numbers.

---

### M3‑02c — On‑device render profile and the render benchmark harness

- **Goal:** know, in milliseconds, where the M7's frame time goes, and gain a CI gate that stops the render path regressing. **Depends on:** M3‑02b.
- **Scope:**
  - Extend the debug overlay (`@shmup/render-pixi` `debug`) with a **structure‑rebuild counter** (incremented from a tiny wrapper around the scene's render group) and a **pooled render‑target byte total** read from Pixi's `TexturePool`, on the existing line 5 next to TPF/RAF. Allocation‑free, one `DrawList` per colour as the module already demands.
  - New `test/bench/render.perf.ts` driven by Playwright against the built web bundle (not Node): a scripted worst‑case frame (512 enemy bullets, 512 point items, full particle pool, a filtered layer active, Mode‑7 active, CRT off then on), asserting `renderer.drawCalls` against a raised, *documented* budget and a `render ms` p95; plus a browser‑side JS heap delta over 600 frames that fails on growth — the gate F5 is currently invisible to.
  - `docs/dev/rendering-and-shell.md`: a short "measuring on the TV" recipe (the M1–M8 table above).
- **Acceptance:** `pnpm bench` prints render p95 and draw calls per scenario and fails on budget; the overlay shows the two new figures on device; `docs/dev/input-probe-results.md` gains a "render profile 2026‑xx‑xx" section with the measured numbers for all three CRT settings.
- **Refs:** `shmup_feat.md` §22 (render ≤ 8 ms, 20–50 draw calls), §24.

---

### M3‑02d — Fold the full‑screen effects into their draw passes

- **Goal:** make the CRT and Mode‑7 effects cost one draw call each instead of a pooled render target plus two passes; free ~17 MB of VRAM at 1080p. **Depends on:** M3‑02c (the before/after numbers).
- **Scope:**
  - `effects/crt.ts`: replace `CrtPass`'s `screen.filters = [...]` with a `Mesh` + `Shader` pass‑2 blit using the existing `CRT_VERTEX`/`CRT_FRAGMENT`; `off` sets `uScan = uMask = uVignette = 0` rather than swapping programs. Retire `crtResolution` / `CRT_MAX_HEIGHT` (they buy nothing at a 1080p viewport) or repurpose the constant as a documented TV cap.
  - `effects/mode7.ts`: same treatment — a `Mesh` on `BG_MID` instead of an `alpha: 0` sprite plus a filter.
  - `shell/src/memory/index.ts`: correct `estimateMemory` (F3) — POT‑rounded target sizes, a target per active filtered layer, an explicit CRT term; add a `crtFilter` input and thread it from `estimateStageMemory`.
  - Boot **warm‑up** (F4/F5): one throwaway `render()` behind the loading screen with every filter the bound world can use attached and every pooled sprite drawn once, so no GL program links and no batch buffer grows during gameplay.
- **Acceptance:** `test/e2e/mode7.spec.ts` and `test/e2e/raster.spec.ts` still pass within their draw‑call budgets; a new unit test pins `estimateMemory` against hand‑computed POT figures with CRT on; the M3‑02c render bench shows CRT `full` within ~10 % of CRT `off`; no visual golden changes.
- **Risk:** the pass‑2 rewrite touches the one code path every frame goes through. Keep the plain‑sprite path behind a flag until the device numbers land.
- **Refs:** `shmup_feat.md` §18 (CRT off/light/full, Mode‑7 floor), §22 (memory budget).

---

### M3‑02e — Cut the per‑frame scene‑graph rebuild

- **Goal:** stop one hidden bullet costing a walk over ~6 400 display objects. **Depends on:** M3‑02c (must be measured, not guessed) and M3‑02d.
- **Scope, in the order the measurements justify:**
  1. **Render groups** for the terrain grid, the two big bullet/point bindings, the particle container and the HUD/UI quad pools; raise `DRAW_CALL_BUDGET` in the two e2e specs *deliberately*, with the new number recorded in `shmup_feat.md` §22's budget line.
  2. If (1) is not enough, **degenerate‑quad parking** instead of `visible = false` in `SpriteLayerBinding` and `QuadPool` (keep `visible` for whole containers, which flip rarely).
  3. Only if (1)+(2) are still short, **`ParticleContainer`** for the enemy‑bullet, point‑item and particle pools — with `dynamicProperties: { position: true, uvs: true, rotation: false, color: false, vertex: false }`, `autoGarbageCollect = false`, and a bundle‑size check (the budget has ~124 KB of headroom, `check-bundle.mjs:62`).
- **Acceptance:** the M3‑02c render bench shows a measured drop in render p95 on the worst‑case frame; the overlay's structure‑rebuild counter falls; every render‑pixi allocation guard still passes; golden replays unchanged (this is presentation‑only — the sim never sees it).
- **Refs:** `shmup_feat.md` §22, decision D19, `docs/dev/conventions.md` §"Performance: zero allocation in hot paths".

---

## 6. Where I am unsure

- **The size of F1's win is a genuine unknown.** The mechanism is certain (I read Pixi's source), but whether the rebuild costs 0.5 ms or 4 ms on a Kant‑SU2 is not something I can derive from here. It could turn out that Pixi's early‑return on hidden children (`collectRenderablesMixin.mjs:6`) makes the walk cheap enough not to matter. M3‑02c exists precisely to settle this before anyone writes code.
- **F2's fill‑rate arithmetic** (2 Mpx × 2 passes, ~33 MB/frame) is sound, but Mali‑G51's effective throughput at 1080p under Tizen's compositor is a guess. The *structural* claims — a 2048² pooled texture and one extra full‑screen pass — are certain.
- **WebGL2 on the M7's driver** is available but untried by us. I have no basis to predict whether it is faster, slower or buggier under Chromium 69.
- **`ParticleContainer`'s real cost/benefit** in v8 with `uvs: true` (which forces per‑frame UV re‑upload for every live particle) — I read the container but not the full `ParticleContainerPipe` upload path. Treat F1(b) as the least‑certain recommendation here.
- I did **not** run any test, benchmark or build.
---

## 7. If the internal resolution changes later (960×540, 1080p, …)

The owner's intention after the plan finishes is to try a **960×540** build, and — if that holds 60 fps — perhaps a
**1920×1080** one. This section records what changes, so the findings above can be read against those targets instead
of re-derived. Nothing here is scheduled work; it is the "if we do this, then also do that" note.

### 7.1 First, decide which of two very different projects it is

| | **(A) Same world, higher raster** | **(B) Bigger playfield / redrawn art** |
|---|---|---|
| What changes | Only the resolution the frame is *rendered* at. The simulation still thinks in 384×216. | `PLAYFIELD_W` / `PLAYFIELD_H` themselves — the world gets wider, or the art gets denser. |
| Simulation | Untouched. Deterministic hashes, goldens, demos, balance all survive. | **Invalidated.** `PLAYFIELD_W = 384` / `PLAYFIELD_H = 200` (decision D20, `packages/core/src/config/index.ts:736`) are referenced ~160 times across 26 source files, and every `content/**/*.json` carries absolute world-pixel coordinates (camera keys, tilemaps, event positions). Every golden replay, attract demo, playtest budget and balance number is re-based. |
| Art | Unchanged (existing sprites upscale as today). | Every sprite, tile and font redrawn or regenerated. |
| Honest size | A render experiment. | A content project on the scale of M1+M2's stage work. |

**(A) is the cheap experiment and the one to run first.** It buys real quality where it counts — the Mode-7 floor, the
CRT scanlines and any rotation or scaling currently quantise to 216 rows, and those are exactly the things that look
coarse. It buys *nothing* on sprite crispness, because the sprites are still 384×216 art.

### 7.2 960×540 is not an integer multiple — prefer 768×432 as the first step

384×216 scales by whole numbers to **768×432 (×2)**, **1152×648 (×3)**, **1536×864 (×4)** and **1920×1080 (×5)**.
**960×540 is ×2.5**, which breaks the integer-scaling rule the whole look rests on (decision D19): existing art would
be resampled at a half-pixel cadence and shimmer. 960×540 is a perfectly good *display* size (it maps ×2 to a 1080p
panel), but as an *internal* resolution it only makes sense under (B), with art actually drawn for it.

So: **768×432 for the first "does it still hold 60 fps" test**, 1920×1080 as the stretch target.

### 7.3 Fill-rate and render-target memory — the numbers that decide it

Fill scales with pixel count; Pixi pools every render target rounded **up to the next power of two on each axis**
(finding F3), which is where the memory goes:

| Internal | Pixels | Fill vs today | Frame RT (POT) | 5 targets (frame + 3 filters + CRT) |
|---|---|---|---|---|
| 384×216 (today) | 82,944 | ×1 | 512×256 = 0.5 MB | ~2.6 MB |
| 768×432 | 331,776 | **×4** | 1024×512 = 2 MB | ~10 MB |
| 960×540 | 518,400 | **×6.25** | 1024×1024 = 4 MB | ~21 MB |
| 1920×1080 | 2,073,600 | **×25** | 2048×2048 = 16.8 MB | **~84 MB** |

Against the **<100 MB** stage budget (`shmup_feat.md` §22), 1080p-internal spends most of it on render targets alone.
**F3 stops being a tidy-up and becomes the gate**: `estimateStageMemory` must be correct *before* anyone trusts a
1080p experiment, or the first thing it will do is silently blow the budget.

### 7.4 What each finding does at higher resolution

| Finding | At 768×432 / 960×540 | At 1920×1080 |
|---|---|---|
| **F1** scene-graph rebuild (fixed in M3-02e) | Unchanged under (A) — it is CPU work over ~6,400 objects and does not care about pixels. Under (B) it gets **worse**: a wider playfield means more visible tiles, enemies and bullets, so the per-layer render groups matter more, not less. | Same. |
| **F2** CRT as a filter | Worse in proportion to fill; still worth folding into the blit. | The two-pass structure itself becomes the problem: at 1:1 the game renders 2 Mpx into a render target and then blits 2 Mpx to the canvas for no scaling at all. **M3-02d's fix is not enough here — pass 2 should collapse to a direct render when scale is 1**, keeping the render target only when an effect actually needs it. |
| **F3** memory estimator | Must be fixed first (see §7.3). | Decisive. |
| **F4** shader compile hitch | Unchanged (one-off, resolution-independent). | Unchanged. |
| **F5** Pixi allocation on first draw | Unchanged — driven by sprite/quad counts, not pixels. | Unchanged. |
| **F7** "the 64 px filter margin is free" | **Re-measure.** That verdict rests on pass-1's viewport being 384×216; the margin is clipped to the viewport, so its absolute cost scales with it. | Re-measure; likely no longer negligible. |
| **F8** WebGL1 default | Worth re-running the A/B: more fill and bigger targets is exactly where a WebGL2 path might diverge. | Same, more so. |
| **F9** `Texture.WHITE` | Unchanged (a binding, not a fill, concern). | Unchanged. |
| **F10** render bench | The instrument for the whole experiment — see §7.5. | Same. |

### 7.5 Make M3-02c's bench take the resolution as a parameter

The single cheapest thing that makes this experiment possible later is to build the knob **now**: the render benchmark
added in **M3-02c** should accept the internal frame size as a parameter and report render-ms p95, draw calls and
render-target bytes per resolution. Then "does 768×432 hold 60 fps?" is a bench run rather than a build-and-hope, and
the on-device check is just the overlay's TPF counter (a 4–25× fill increase shows up as 2-tick frames the moment the
GPU misses vsync).

### 7.6 Hard limits to check before committing to (B)

- **Atlas size.** One 1024×1024 page today (`assets/generated/atlas/main.json`), capped at
  `ATLAS_PAGE_MAX_SIZE = 2048`. Art at ×2 needs 2048² — exactly the cap, single page still possible. At ×2.5 it needs
  2560² and at ×5 about 5120²: **multiple pages**, which costs texture binds and batch breaks, and roughly 100 MB of
  texture memory at ×5. Native 1080p art does not fit the Tizen budgets as they stand.
- **`DIST_BUDGET`** is 8 MB for the whole widget and the atlas PNG lives inside it.
- **Hard-coded frame constants** that would have to become parameters: `LAYER_EFFECT_ROWS = 216`
  (`packages/render-pixi/src/effects/shaders.ts:53`) and the literal `384` in
  `packages/render-pixi/src/debug/index.ts:837`. The viewport maths is already parameterised
  (`computeIntegerViewport(displayW, displayH, baseWidth, baseHeight)`), so that part is ready.
- **Launch time** (≤ 10 s, guarded by M2-18's boot check) and the **512 KB** `APP_JS_GZIP_BUDGET` both still apply.
