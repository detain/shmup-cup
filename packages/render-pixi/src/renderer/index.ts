/**
 * # renderer — the PixiJS v8 `IRenderer` implementation
 *
 * **Responsibility.** Owns the Pixi `WebGLRenderer` (WebGL1 preferred — the conservative default
 * for the older sets the project also targets; the M7 probe of 2026-09-15 found WebGL **1 and 2**
 * both available on Tizen 5.5 / Chromium 69 with `MAX_TEXTURE_SIZE` 8192, so 2 is *possible*, not
 * *better* — see `docs/dev/input-probe-results.md` §9 and the review's F8. Dev builds can A/B it
 * with `?gl=2`), a 384×216 render texture with nearest-neighbour
 * sampling, and the two-pass frame: (1) draw the low-res scene into the render texture,
 * (2) draw that texture once, integer-scaled and letterboxed, to the canvas. Pixi is
 * used as a *renderer only*: no `Application`, no Pixi ticker — the host's fixed-step
 * loop calls {@link PixiRenderer.render}.
 *
 * The low-res scene is the render contract of plan §3.4 drawn from a core `RenderFrame`:
 * a lifted navy background, the layer stack (`layers`), one sprite binding per
 * `SpriteBatchView` of the frame's `WorldView` (`sprites`), the HUD and UI draw lists
 * (`ui` + `text`), the world's parallax bands and tile terrain (`layers`: repeated sprites on
 * `BG_FAR` / `BG_MID`, a ring-buffered tile-sprite grid on `TERRAIN` — plan M1-07), the enemy
 * lasers (`layers`: rotated warning lines / stretched beams on `ENEMY_BULLETS`, above the bullet
 * batch — plan M1-09), the bending lasers (`layers`: a segment sprite per node, above the lasers —
 * plan M2-02), screen shake
 * (the world group is offset by the rounded `shakeX/Y`) and the flash / dim overlays. Optionally
 * the calibration test pattern sits below the layers (`?scene=calibration`).
 *
 * **Game feel (plan M1-14).** The renderer also owns the presentation effects the host feeds from
 * the sim's events: the particle pool and the score popups on the `FX` layer (`particles`,
 * `effects` — under the enemy bullets), and the {@link PixiRenderer.effects | screen effects}
 * (shake, a flash tinted per `FlashKind` behind the ≤ 3-a-second limiter, a playfield dim drawn
 * over the world layers but under the flash and the HUD). `render()` advances them by the
 * frame's **simulated ticks** (`frame.tick` minus the last frame's — 0 while paused; a tick
 * counter that goes back clears them), converts particle and popup positions with the world's
 * camera, and adds its shake / flash / dim on top of `frame.screen`.
 *
 * **Bullet palettes (plan M2-02).** {@link PixiRenderer.setBulletPalette} re-resolves the sprite
 * tables with the chosen colour-blind variants (`palette` `resolveBulletPaletteTable`): every
 * binding reads the shared tables, so the swap takes effect on the next frame without re-binding.
 *
 * **Presentation polish (plan M2-08).** The world's `effects` (the stage's raster effects and
 * palette cycles) are bound to the `effects` module's layer effects — a GLSL ES 1.0 filter on each
 * layer while one of its effects is on screen, off with `effects.settings.rasterEffects`; the
 * Mega Crash flash is additive (a second, `add`-blended flash overlay). Display options:
 * {@link PixiRenderer.setScaleMode} (integer / fit / stretch — `viewport`),
 * `effects.settings.screenShake` / `reduceFlashing`, {@link PixiRenderer.setShowHitbox} (the
 * `HITBOX` layer with a marker per `WorldView.hitboxes` slot). **Render interpolation**
 * ({@link PixiRenderer.setInterpolation}; the shell turns it on for displays faster than the tick
 * rate): the camera, the parallax bands, every sprite batch and the hitbox markers are drawn
 * between the previous and the current tick by `frame.alpha` (see `sprites` for the slot rules); at
 * 60 Hz it stays off, so nothing lags a tick behind.
 *
 * **Debug (plan M1-19).** With {@link PixiRendererOptions.countDrawCalls} (the shell sets it only
 * in dev / test builds, together with its debug tools) the WebGL context's draw entry points are
 * wrapped with a counter and {@link PixiRenderer.drawCalls} reports the last frame's calls (both
 * passes; -1 when not counting). With {@link PixiRendererOptions.countStructureRebuilds} (M3-02c)
 * {@link PixiRenderer.structureRebuilds} counts the frames on which Pixi rebuilt the scene's whole
 * instruction set rather than updating what moved — the overlay's REB figure, the review's F1 —
 * and {@link PixiRenderer.groupRebuilds} the same over every render group of the scene (M3-02e),
 * so the first figure cannot fall merely because the churn moved into a layer group. The
 * debug overlay (`debug` module) adds its own containers to
 * the `DEBUG` layer; the renderer draws that layer like the others.
 *
 * **Scene structure (plan M3-02e, the review's F1).** The layers that toggle sprites every frame
 * are each their own Pixi render group (`layers`' `RENDER_GROUP_LAYERS`), so hiding one bullet
 * rebuilds that layer's instruction set instead of the whole scene's ~6,400 display objects.
 * {@link PixiRendererOptions.renderGroups} `= false` restores the single-group scene, for
 * measuring the difference in one run.
 *
 * **Allocation.** Pixi objects are created in {@link createPixiRenderer} and when a new
 * `WorldView` object is bound ({@link PixiRenderer.bindWorld} — once per world, called
 * automatically by `render()` when `frame.world` changes identity). A frame showing an already
 * bound world only assigns numbers and existing textures; the two passes reuse option objects
 * allocated with the renderer.
 *
 * **Implements.** shmup_tech.md §2.2 (WebGL1-first, low-res render texture + one
 * nearest upscale quad), §4.1 (Pixi as renderer only), shmup_feat.md §3 (integer
 * scaling, pixel-perfect), §18 (draw order, one atlas, flash/dim, shake, particles), §20 (juice),
 * §22 Rendering pipeline (raster-effect shader), §21 display options (scale mode, shake, flash
 * reduction, hitbox).
 *
 * **Public API.** {@link createPixiRenderer}, {@link PixiRenderer} (incl. `drawCalls`, M1-19; the
 * scale mode, hitbox, interpolation and layer effects, M2-08; M3-02 the Mode-7 floor, the CRT
 * filter — {@link PixiRenderer.setCrtFilter} — and the aspect modes —
 * {@link PixiRenderer.setAspect}, {@link PANEL_ALPHA}), {@link PixiRendererOptions} (incl.
 * `countDrawCalls` and M3-02c's `countStructureRebuilds`, M1-19;
 * `scaleMode`, `showHitbox`, `interpolation`, `createLayerEffectFilter`,
 * M2-08; `aspect`, `createCrtFilter` and `createMode7Shader`, M3-02; `screenPass`,
 * `createCrtBlit` and {@link PixiRenderer.warmUp}, M3-02d).
 *
 * **The extras of M3-02.** The renderer owns three presentation-only additions, each idle until
 * asked for: the **Mode-7 floor** (`effects` {@link createMode7Floor} — a full-frame mesh at the
 * bottom of `BG_MID`, bound from the world view's `mode7` section and given the plane's turned
 * axes every frame), the **CRT / scanline pass** (`effects` {@link createCrtPass}, folded into
 * pass 2's blit since M3-02d) and the **aspect modes** (`viewport`
 * {@link computeAspectViewport}: the frame is placed in the largest ultra-wide or 4:3 window that
 * fits and the leftover width becomes two dimmed side panels at {@link PANEL_ALPHA} — a window on
 * the display, never a crop, and the internal 384×216 playfield is unchanged).
 *
 * **The render review's fixes (M3-02d).** Pass 2 draws the frame with a `Mesh` whose shader is
 * the CRT program (`effects` `createCrtBlit`), so CRT `full` costs one draw call and no pooled
 * 2048² render target (**F2**), and the Mode-7 floor is a mesh rather than a filter over an
 * invisible sprite (**F6**). {@link PixiRenderer.warmUp} draws one throwaway frame with every
 * program and every pooled sprite in it, so no GL program links and no batch buffer grows
 * mid-gameplay (**F4** / **F5**). `screenPass: 'filter'` restores the pre-M3-02d sprite + filter
 * pass-2 as an escape hatch.
 *
 * **Teardown.** `destroy()` frees the scene *and* the two things that hang off the renderer rather
 * than off it: the Mode-7 floor (`bindWorld(null)` only hides its mesh, so the mesh, geometry and
 * GL program would outlive the renderer) and the second pass's own container with the CRT pass's
 * frame quad and the two side-panel sprites. Both were leaking until M3-02d's tests caught them.
 *
 * @module
 */
import {
  ASPECT_MODES,
  LayerId,
  defineModule,
  type AspectMode,
  type BulletPalette,
  type CameraView,
  type CrtFilter,
  type IRenderer,
  type ScaleMode,
  type RenderFrame,
  type TextMetrics,
  type WorldView,
} from '@shmup/core';
import {
  Container,
  RenderTexture,
  Sprite,
  Texture,
  WebGLRenderer,
  type RenderOptions,
} from 'pixi.js';
import type { Atlas } from '../atlas/index.js';
import {
  createCrtPass,
  createLayerEffects,
  createMode7Floor,
  createMode7Shader,
  createScorePopups,
  createScreenEffects,
  type CrtBlitHandle,
  type CrtFilterHandle,
  type CrtPass,
  type EffectSettings,
  type LayerEffectFilter,
  type LayerEffects,
  type Mode7Floor,
  type Mode7Shader,
  type ScorePopups,
  type ScreenEffects,
  type ScreenPassMode,
} from '../effects/index.js';
import {
  createBendingLaserBinding,
  createHitboxBinding,
  createLayerStack,
  createLaserBinding,
  createParallaxBinding,
  createTerrainBinding,
  type BendingLaserBinding,
  type HitboxBinding,
  type LaserBinding,
  type LayerStack,
  type ParallaxBinding,
  type TerrainBinding,
} from '../layers/index.js';
import { PALETTE, resolveBulletPaletteTable } from '../palette/index.js';
import {
  PARTICLE_CAPACITY,
  createParticleSystem,
  type FxContent,
  type ParticleSystem,
} from '../particles/index.js';
import {
  createSpriteLayerBinding,
  createSpriteTables,
  type RenderBlend,
  type SpriteLayerBinding,
  type SpriteTables,
} from '../sprites/index.js';
import { createTestPattern, type TestPattern } from '../test-pattern/index.js';
import {
  DEFAULT_FONT,
  DEFAULT_GLYPH_CAPACITY,
  createBitmapFont,
  createTextMetrics,
  type BitmapFont,
} from '../text/index.js';
import { createDrawListView, type DrawListView } from '../ui/index.js';
import { computeAspectViewport, type AspectViewport, type Viewport } from '../viewport/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'renderer',
  status: 'partial',
  specRefs: [
    'shmup_tech.md §2.2',
    'shmup_tech.md §4.1',
    'shmup_feat.md §3',
    'shmup_feat.md §18',
    'shmup_feat.md §20',
    'shmup_feat.md §22',
  ],
});

/** Pixels the flash overlay extends past each frame edge (it moves with screen shake). */
const OVERLAY_MARGIN = 32;

/** Most ticks one frame advances the effects (a longer gap — a hitch — is cut). */
const MAX_EFFECT_STEP = 60;

/**
 * Opacity of the aspect modes' side panels (plan M3-02): a dim surround, never bright enough to
 * pull the eye off the picture.
 */
export const PANEL_ALPHA = 0.35;

/**
 * The atlas rectangle of a Mode-7 floor's tile, for {@link Mode7Floor.bind} (plan M3-02).
 *
 * @param atlas - The atlas, or `null`.
 * @param names - The world's sprite name table, or `null`.
 * @param spriteId - Index of the floor's sprite in that table (-1 = none).
 * @returns `[x, y, w, h, pageWidth, pageHeight]` of the sprite's frame 0, or `null` when the atlas
 *   does not have it.
 */
function mode7TileRect(
  atlas: Atlas | null,
  names: readonly string[] | null,
  spriteId: number,
): readonly number[] | null {
  if (atlas === null || names === null || spriteId < 0 || spriteId >= names.length) return null;
  const manifest = atlas.manifest;
  const sprite = manifest.sprites[names[spriteId]] as { frames?: readonly string[] } | undefined;
  const frameName = sprite?.frames?.[0];
  if (frameName === undefined) return null;
  const info = manifest.frames[frameName] as
    { x: number; y: number; w: number; h: number; p: number } | undefined;
  if (info === undefined) return null;
  const page = manifest.pages[info.p] as { w: number; h: number } | undefined;
  if (page === undefined) return null;
  return [info.x, info.y, info.w, info.h, page.w, page.h];
}

/** Camera of frames without a world (particles and popups then use frame pixels). */
const NO_CAMERA: CameraView = Object.freeze({ x: 0, y: 0 });

/**
 * The camera drawn this frame when render interpolation is on (a class instance: its fields stay
 * unboxed doubles, so writing fractional positions every frame allocates nothing).
 */
class DrawnCamera implements CameraView {
  /** World x. */
  x = 0;
  /** World y. */
  y = 0;
}

/** The frame's render interpolation handed to the bindings (a class: unboxed fields). */
class FrameBlend implements RenderBlend {
  /** Blend factor 0 … 1. */
  alpha = 0;
  /** Ticks since the last interpolated frame (-1 = reset). */
  advance = -1;
}

/** Options for {@link createPixiRenderer}. */
export interface PixiRendererOptions {
  /** Canvas to draw into (its drawing buffer is resized to the display size). */
  readonly canvas: HTMLCanvasElement;
  /** Initial display width in CSS pixels. */
  readonly displayWidth: number;
  /** Initial display height in CSS pixels. */
  readonly displayHeight: number;
  /** Internal frame width (default 384). */
  readonly width?: number;
  /** Internal frame height (default 216). */
  readonly height?: number;
  /** WebGL version to try first (default 1; Pixi falls back automatically). */
  readonly preferWebGLVersion?: 1 | 2;
  /**
   * Sprite atlas. Without one the renderer can only show the background and the test
   * pattern (world batches and draw lists need textures).
   */
  readonly atlas?: Atlas | null;
  /** Bitmap font for draw-list text (default `'pixel'`; ignored when the atlas lacks it). */
  readonly font?: string;
  /** Show the calibration test pattern below the layers (default `false`). */
  readonly testPattern?: boolean;
  /** Quads preallocated for each of the HUD and UI layers (default 1024). */
  readonly glyphCapacity?: number;
  /** Effect settings to change from the defaults (screen shake on, normal flashing). */
  readonly effects?: Partial<EffectSettings>;
  /** Seed of the particles' presentation RNG (default 1; the shell passes the game's seed). */
  readonly fxSeed?: number;
  /** Particle pool size (default 256). */
  readonly particleCapacity?: number;
  /**
   * Count the WebGL draw calls of every frame ({@link PixiRenderer.drawCalls} — the debug overlay,
   * M1-19). Wraps the context's `drawElements` / `drawArrays` (and their instanced variants) with a
   * counter; dev / test builds only (default `false`).
   */
  readonly countDrawCalls?: boolean;
  /**
   * Count the frames whose scene rebuilt Pixi's instruction set
   * ({@link PixiRenderer.structureRebuilds} — the debug overlay's REB figure, plan M3-02c). Reads
   * the scene render group's `structureDidChange` before each pass 1; dev / test builds only
   * (default `false`).
   */
  readonly countStructureRebuilds?: boolean;
  /**
   * Give the high-churn layers their own Pixi render group (default `true` — plan M3-02e, the
   * review's **F1**; see `layers`' {@link RENDER_GROUP_LAYERS}).
   *
   * `false` builds the single-render-group scene of before, where hiding one sprite makes Pixi
   * re-walk and re-pack every one of the ~6,400 display objects. It exists so the cost of that
   * rebuild can be measured against itself in one run (`pnpm bench`, the review's measurement
   * **M1**); nothing shipped turns it off.
   */
  readonly renderGroups?: boolean;
  /** How the frame fills the display (default `'integer'` — plan M2-08, the scale modes). */
  readonly scaleMode?: ScaleMode;
  /** Draw the ships' hitbox markers (default `false` — the "show hitbox" display option, M2-08). */
  readonly showHitbox?: boolean;
  /**
   * Render interpolation from the start (default `false`; see
   * {@link PixiRenderer.setInterpolation}).
   */
  readonly interpolation?: boolean;
  /**
   * Creates the layer effects' filters (default the `effects` module's `createLayerEffectFilter`).
   * Tests in Node — where Pixi cannot probe a WebGL context to build a program — pass a fake.
   *
   * @param rows - Offset table rows.
   * @returns The filter.
   */
  readonly createLayerEffectFilter?: (rows: number) => LayerEffectFilter;
  /** How the picture is shaped on the display (plan M3-02; default `normal`). */
  readonly aspect?: AspectMode;
  /**
   * How the second pass draws the frame (plan M3-02d): `blit` (default) binds the CRT program to
   * the blit mesh — one draw call whatever the CRT setting is; `filter` restores M3-02's sprite
   * plus a Pixi filter, which pools a full-display render target and runs a second full-screen
   * pass (the render review's **F2**). The escape hatch, not a setting players see.
   */
  readonly screenPass?: ScreenPassMode;
  /**
   * Creates the pass-2 blit (default the `effects` module's `createCrtBlit`). Tests in Node —
   * where Pixi cannot probe a WebGL context — pass a fake.
   *
   * @param frame - The frame texture pass 1 renders into.
   * @param width - The frame's width in pixels.
   * @param height - The frame's height in pixels.
   * @returns The blit.
   */
  readonly createCrtBlit?: (frame: Texture, width: number, height: number) => CrtBlitHandle;
  /**
   * Creates the legacy CRT filter of `screenPass: 'filter'` (default the `effects` module's
   * `createCrtFilter`). Tests in Node pass a fake.
   *
   * @returns The filter.
   */
  readonly createCrtFilter?: () => CrtFilterHandle;
  /**
   * Creates the Mode-7 floor's mesh and shader (default the `effects` module's
   * `createMode7Shader` on the atlas's first page; without an atlas there is none). Tests pass a
   * fake.
   *
   * @param width - The frame's width in pixels.
   * @param height - The frame's height in pixels.
   * @returns The mesh and its uniforms.
   */
  readonly createMode7Shader?: (width: number, height: number) => Mode7Shader;
}

/** The Pixi-backed renderer. */
export interface PixiRenderer extends IRenderer {
  /** WebGL version actually obtained (1 or 2). */
  readonly webGLVersion: number;
  /**
   * WebGL draw calls of the last `render()` (both passes), or -1 when the renderer was created
   * without {@link PixiRendererOptions.countDrawCalls} (or the context could not be wrapped).
   */
  readonly drawCalls: number;
  /**
   * Frames since creation whose scene render group had `structureDidChange` set when `render()`
   * was called — the frames on which Pixi threw the whole instruction set away and re-walked the
   * scene instead of taking its cheap "update what moved" path (the review's F1). -1 when the
   * renderer was created without {@link PixiRendererOptions.countStructureRebuilds}.
   */
  readonly structureRebuilds: number;
  /**
   * Render-group rebuilds since creation, counting **every** group in the scene — the root's and
   * each layer group's (plan M3-02e). {@link PixiRenderer.structureRebuilds} says how often the
   * expensive whole-scene rebuild happened; this says where that churn went instead, so a fall in
   * the first figure cannot be read as work that merely moved out of sight. -1 without
   * {@link PixiRendererOptions.countStructureRebuilds}.
   */
  readonly groupRebuilds: number;
  /** Current placement of the scaled frame on the canvas. */
  readonly viewport: Viewport;
  /** The scale mode in use (plan M2-08). */
  readonly scaleMode: ScaleMode;
  /**
   * Switches the scale mode (integer / fit / stretch — the Options screen's SCALE, plan M2-08) and
   * re-places the frame at once.
   *
   * @param mode - The mode.
   */
  setScaleMode(mode: ScaleMode): void;
  /** How the picture is shaped on the display (plan M3-02). */
  readonly aspect: AspectMode;
  /**
   * Switches the aspect mode (normal / ultra-wide / classic 4:3 — the Options screen's ASPECT,
   * plan M3-02) and re-places the frame and its side panels at once.
   *
   * @param mode - The mode.
   */
  setAspect(mode: AspectMode): void;
  /** The frame's window on the display and the side panels beside it (plan M3-02). */
  readonly panels: AspectViewport;
  /** The CRT / scanline setting in use (plan M3-02). */
  readonly crtFilter: CrtFilter;
  /**
   * Switches the CRT / scanline filter (off / light / full — the Options screen's CRT, plan
   * M3-02); since M3-02d it only writes the blit shader's three uniforms.
   *
   * @param setting - One of `core/config` `CRT_FILTERS`.
   */
  setCrtFilter(setting: CrtFilter): void;
  /** The CRT pass (plan M3-02; folded into pass 2's blit since M3-02d). */
  readonly crt: CrtPass;
  /** How the second pass draws the frame (plan M3-02d). */
  readonly screenPass: ScreenPassMode;
  /**
   * Draws **one throwaway frame** into an off-screen target with every GL program the bound world
   * can use and every pooled sprite in it, then puts everything back (plan M3-02d, the render
   * review's **F4** / **F5**).
   *
   * @remarks
   * Pixi links a GL program the first time it *draws* with it and grows its batch attribute
   * buffer by doubling as frames get busier, so without this the layer-effect, Mode-7 and CRT
   * programs link mid-stage (5–50 ms on a Mali-G51) and the first really busy frame allocates and
   * copies a few hundred KB inside `renderer.render()`. Call it once at boot, behind the loading
   * screen, **after** `bindWorld`: it never presents anything, never touches the tick the
   * particles are stepped from and leaves the effect state exactly as it found it. Calling it
   * again is allowed (it is idempotent in effect, not a no-op) but pointless.
   */
  warmUp(): void;
  /** The bound world's Mode-7 floor (plan M3-02; idle without one). */
  readonly mode7: Mode7Floor;
  /** Whether the ships' hitbox markers are drawn (plan M2-08). */
  readonly showHitbox: boolean;
  /**
   * Shows or hides the `HITBOX` layer — the ships' hitbox markers of `WorldView.hitboxes` (the
   * Options screen's HITBOX, plan M2-08).
   *
   * @param on - `true` to draw them.
   */
  setShowHitbox(on: boolean): void;
  /** Whether render interpolation is on (plan M2-08). */
  readonly interpolation: boolean;
  /**
   * Turns render interpolation on or off (plan M2-08, decision D32): with it, the camera, the
   * parallax bands, every sprite batch and the hitbox markers are drawn between the previous and
   * the current tick by `frame.alpha` — for displays that show more than one frame per tick
   * (> 60 Hz). Off (the default) draws the current tick, which on a 60 Hz display is always right
   * and a tick fresher.
   *
   * @remarks
   * Switching resets the interpolation history, so the next frame draws the current tick and the
   * blending starts from there (so does binding a new world). The shell switches it from its
   * refresh-rate probe (`ShellOptions.interpolation`).
   *
   * @param on - `true` to interpolate.
   */
  setInterpolation(on: boolean): void;
  /** The layer effects: the bound world's raster effects and palette cycles (plan M2-08). */
  readonly layerEffects: LayerEffects;
  /** Hitbox markers of the bound world (`null` without a hitbox view or atlas — plan M2-08). */
  readonly hitboxes: HitboxBinding | null;
  /** Low-res scene root (384×216 coordinates). */
  readonly scene: Container;
  /** The layer containers (one per core `LayerId`). */
  readonly layers: LayerStack;
  /** The atlas the renderer draws from (`null` when created without one). */
  readonly atlas: Atlas | null;
  /** Bitmap-text metrics for layout code (`null` without an atlas font). */
  readonly metrics: TextMetrics | null;
  /** Sprite bindings of the currently bound world, in `WorldView.batches` order. */
  readonly bindings: readonly SpriteLayerBinding[];
  /** Tile grid of the bound world's terrain (`null` without terrain or atlas). */
  readonly terrain: TerrainBinding | null;
  /** Band sprites of the bound world's parallax (`null` without parallax or atlas). */
  readonly parallax: ParallaxBinding | null;
  /** Laser sprites of the bound world (`null` without a laser view or atlas). */
  readonly lasers: LaserBinding | null;
  /** Bending laser segments of the bound world (`null` without a bending laser view or atlas). */
  readonly bendingLasers: BendingLaserBinding | null;
  /** The enemy bullet palette in use (`standard` until {@link PixiRenderer.setBulletPalette}). */
  readonly bulletPalette: BulletPalette;
  /**
   * Switches the enemy bullets, lasers and bending lasers to a colour-blind palette's sprite
   * variants (`<sprite>@<palette>`, plan M2-02) — or back to `standard`. Re-resolves the sprite
   * tables (allocates: call it when the option changes, not per frame); sprites without a variant
   * keep their frames.
   *
   * @param palette - The palette (core `BULLET_PALETTES`).
   */
  setBulletPalette(palette: BulletPalette): void;
  /**
   * The screen effects (shake, flash, playfield dim — plan M1-14): the host feeds them from the
   * `Shake` / `Flash` / `Dim` events; `render()` advances them by the frame's ticks and draws
   * them on top of `frame.screen`.
   */
  readonly effects: ScreenEffects;
  /**
   * The particle pool on the `FX` layer (`null` without an atlas): the host emits into it from
   * the `Particles` / `Sfx` events; `render()` advances and draws it.
   */
  readonly particles: ParticleSystem | null;
  /**
   * The score popups on the `FX` layer, above the particles (`null` without an atlas font).
   */
  readonly popups: ScorePopups | null;
  /**
   * Gives the particle system its presets and triggers (load time — `content/fx/`, validated by
   * `loadFxContent`). Without it no particle is ever drawn.
   *
   * @param content - The validated fx content.
   */
  setFxContent(content: FxContent): void;
  /**
   * Sets the sprite name table that `spriteId`s in world batches and draw lists index —
   * normally `ContentDb.sprites.names`. Resolved against the atlas now (load time); unknown
   * names draw `ui/missing`. Until it is called every sprite id draws `ui/missing`.
   *
   * @param names - Sprite names by sprite id.
   */
  setSpriteNames(names: readonly string[]): void;
  /**
   * Binds a world view: creates the parallax band sprites (on `BG_FAR` / `BG_MID`), the terrain
   * tile grid (on `TERRAIN`), one sprite binding per batch (in its layer, batch order) and the
   * laser sprites of `world.lasers` and the segment sprites of `world.bendingLasers` (on
   * `ENEMY_BULLETS`, after the batches, in that order), the hitbox markers of `world.hitboxes` (on
   * `HITBOX`) and binds `world.effects` to the layer effects (M2-08), and destroys the
   * previous world's bindings. `render()` does this automatically when
   * `frame.world` is a different object; hosts call it at load time so the first frame does
   * not create Pixi objects.
   *
   * @remarks
   * The view's structure is read once, here: bindings are created per `world.batches` entry
   * and `render()` syncs binding `i` from `batches[i]`; the parallax band count / spacings and
   * the terrain's size are fixed too — replace the whole `WorldView` object to change them.
   * Parallax and terrain containers are added before the batches, so batches on the same layer
   * draw on top. Without an atlas nothing is bound (the world is remembered but not drawn).
   * Every batch's layer and every parallax band is validated before anything is created, so a
   * bad view leaves the renderer unbound rather than half-bound.
   *
   * @param world - The world to draw, or `null` to unbind.
   * @throws {RangeError} When a batch's `layer` is not a core `LayerId`, or a parallax band is
   *   not on `BG_FAR` / `BG_MID` (the previous world's bindings are already destroyed then).
   */
  bindWorld(world: WorldView | null): void;
}

/** Draw-call counts of the renderer (see {@link installDrawCallCounter}). */
interface DrawCallCounter {
  /** Calls since the frame began. */
  calls: number;
  /** Calls of the last whole frame (-1 = not counting). */
  last: number;
}

/** The draw entry points of a WebGL context the counter wraps (WebGL2 adds the instanced ones). */
const DRAW_METHODS = [
  'drawElements',
  'drawArrays',
  'drawElementsInstanced',
  'drawArraysInstanced',
] as const;

/**
 * Wraps a WebGL context's draw calls with a counter (dev builds: the debug overlay's draw calls).
 *
 * @remarks
 * Each wrapper forwards up to five arguments explicitly (no `arguments` object, no rest array —
 * `drawElementsInstanced` takes five), so a counted draw call allocates nothing. A missing context
 * or method is skipped.
 *
 * @param gl - The context (`WebGLRenderer.gl`), or `undefined` (test fakes).
 * @param counter - The counter to increment.
 * @returns `true` when at least `drawElements` or `drawArrays` was wrapped.
 */
function installDrawCallCounter(gl: unknown, counter: DrawCallCounter): boolean {
  if (typeof gl !== 'object' || gl === null) return false;
  const context = gl as Record<string, unknown>;
  let wrapped = false;
  for (const name of DRAW_METHODS) {
    const original = context[name];
    if (typeof original !== 'function') continue;
    const call = original as (a: unknown, b: unknown, c: unknown, d: unknown, e?: unknown) => void;
    context[name] = function countedDraw(
      a: unknown,
      b: unknown,
      c: unknown,
      d: unknown,
      e: unknown,
    ) {
      counter.calls++;
      call.call(gl, a, b, c, d, e);
    };
    if (name === 'drawElements' || name === 'drawArrays') wrapped = true;
  }
  return wrapped;
}

/**
 * Clamps to 0…1 (NaN → 0).
 *
 * @param value - Value.
 * @returns Clamped value.
 */
const unit = (value: number): number => (value > 0 ? (value < 1 ? value : 1) : 0);

/**
 * Restores a preallocated pass-options object to what a fresh `{ container, target, clear }`
 * literal would be, and returns it.
 *
 * Pixi's `render(options)` writes into the object it is given: it fills `target` (the canvas)
 * and, for the canvas, `clearColor` and `clear`; it caches `transform` (and then skips
 * `updateLocalTransform()`); the back-buffer system may swap `target` for its own texture. Resetting
 * those fields before every call keeps each frame independent of the last without allocating.
 *
 * @param pass - The pass options (its `container` is left as is).
 * @param target - Render target, or `undefined` for the canvas.
 * @param clear - Clear flag, or `undefined` for Pixi's default.
 * @returns `pass`.
 */
const resetPass = (
  pass: RenderOptions,
  target: RenderTexture | undefined,
  clear: boolean | undefined,
): RenderOptions => {
  pass.target = target;
  pass.clear = clear;
  pass.clearColor = undefined;
  pass.transform = undefined;
  return pass;
};

/**
 * The part of Pixi's `RenderGroup` this module reads. Structural, because Pixi v8 does not export
 * the class from its public entry point.
 */
interface SceneRenderGroup {
  /** Set when the group's whole instruction set has to be rebuilt on the next render. */
  readonly structureDidChange: boolean;
  /** The render groups nested inside this one (the layer groups of M3-02e). */
  readonly renderGroupChildren: readonly SceneRenderGroup[];
}

/**
 * Counts the render groups Pixi is about to rebuild: the given group and every group below it
 * (plan M3-02e — {@link PixiRenderer.groupRebuilds}).
 *
 * @remarks
 * Called once per frame in dev / test builds only, over the dozen groups of the scene, and it
 * allocates nothing.
 *
 * @param group - A render group (normally the scene's root one).
 * @returns How many groups in that tree have `structureDidChange` set.
 */
const countGroupRebuilds = (group: SceneRenderGroup): number => {
  let count = group.structureDidChange ? 1 : 0;
  const children = group.renderGroupChildren;
  for (let i = 0; i < children.length; i++) count += countGroupRebuilds(children[i]);
  return count;
};

/**
 * Creates and initialises the renderer.
 *
 * @remarks
 * - Pixi is initialised with `resolution: 1`, `autoDensity: false`, no antialiasing and
 *   `roundPixels`, so one canvas pixel is one CSS pixel and nothing is filtered.
 * - `preferWebGLVersion` defaults to 1; if WebGL1 is unavailable Pixi tries WebGL2.
 *   Read {@link PixiRenderer.webGLVersion} to see what was obtained.
 * - `render()` makes two passes: scene → 384×216 render texture, then the texture as
 *   one integer-scaled sprite → canvas. `resize()` floors its arguments and never goes
 *   below 1×1.
 * - The HUD and UI layers each get a quad pool of `glyphCapacity` sprites; world batches get
 *   bindings sized to their capacity when bound.
 * - `render(frame)` binds `frame.world` itself when it is a new object (so it throws the
 *   {@link PixiRenderer.bindWorld} `RangeError` for a batch on an unknown layer), skips a HUD /
 *   UI draw list whose `revision` did not change, and never allocates for an already bound
 *   world.
 * - Without `setSpriteNames()` every sprite id draws `ui/missing`; call it once the content
 *   (or a dev scene's name table) is known.
 * - Debug (M1-19): with `countDrawCalls` the context's draw entry points are wrapped with a
 *   counter and {@link PixiRenderer.drawCalls} reports the last frame's calls (else -1); with
 *   `countStructureRebuilds` (M3-02c) {@link PixiRenderer.structureRebuilds} counts the frames
 *   Pixi rebuilt the *scene's* instruction set on and {@link PixiRenderer.groupRebuilds} the
 *   rebuilds of every render group in it (both -1 without the option); the debug
 *   overlay (`debug` module) adds its own containers to the `DEBUG` layer.
 * - Game feel (M1-14): with an atlas, a particle pool of `particleCapacity` sprites per blend
 *   mode (seeded with `fxSeed`) and, with a font too, the 16 score popups are created on the
 *   `FX` layer; the screen effects always exist. Without `setFxContent()` no particle is
 *   drawn. `render(frame)` steps them by the ticks since the previous frame (`frame.tick` minus
 *   the last one: nothing on the first frame or while paused, at most 60 per frame; a tick that
 *   goes back clears them all), then syncs particles and popups with the world's camera (0, 0
 *   without a world).
 *
 * @param options - Canvas, display size, internal resolution, atlas, scene and effect options.
 * @returns A promise of a ready {@link PixiRenderer}.
 * @throws Rejects when Pixi cannot create a WebGL context at all (no WebGL on the
 *   device, context creation blocked).
 *
 * @example
 * ```ts
 * const renderer = await createPixiRenderer({
 *   canvas,
 *   displayWidth: window.innerWidth,
 *   displayHeight: window.innerHeight,
 *   atlas,
 * });
 * renderer.setSpriteNames(game.content.sprites.names);
 * renderer.setFxContent(loadFxContent(fxFiles).content); // particle presets (M1-14)
 * renderer.effects.shake(ShakeMagnitude.Medium, 20); // normally from a drained Shake event
 * renderer.render(game.renderFrame());
 * window.addEventListener('resize', () => renderer.resize(innerWidth, innerHeight));
 * ```
 */
export async function createPixiRenderer(options: PixiRendererOptions): Promise<PixiRenderer> {
  const width = options.width ?? 384;
  const height = options.height ?? 216;
  const atlas = options.atlas ?? null;

  const renderer = new WebGLRenderer();
  const drawCounter: DrawCallCounter = { calls: 0, last: -1 };
  await renderer.init({
    canvas: options.canvas,
    width: options.displayWidth,
    height: options.displayHeight,
    resolution: 1,
    autoDensity: false,
    antialias: false,
    roundPixels: true,
    preferWebGLVersion: options.preferWebGLVersion ?? 1,
    powerPreference: 'high-performance',
    background: PALETTE.letterbox,
    hello: false,
  });
  const countDraws =
    options.countDrawCalls === true &&
    installDrawCallCounter((renderer as unknown as { gl?: unknown }).gl, drawCounter);
  if (countDraws) drawCounter.last = 0;
  // M3-02c: frames on which Pixi rebuilt the scene's whole instruction set (the review's F1).
  const countRebuilds = options.countStructureRebuilds === true;
  let structureRebuilds = countRebuilds ? 0 : -1;
  // M3-02e: the same flag over every render group in the scene, root included — where the churn
  // the root no longer carries actually went.
  let groupRebuilds = countRebuilds ? 0 : -1;

  // Pass 1 target: the internal frame, sampled nearest-neighbour when upscaled.
  const frameTexture = RenderTexture.create({
    width,
    height,
    resolution: 1,
    antialias: false,
    scaleMode: 'nearest',
  });

  // The review's **F9** (M3-02e): the full-screen overlays of the low-res pass — the backdrop,
  // the two flashes and the two dims — draw the atlas' own `ui/pixel` rather than Pixi's global
  // `Texture.WHITE`, so pass 1 samples a single texture. (`createAtlas` falls back to
  // `Texture.WHITE` itself when a manifest has no `ui/pixel`, and a renderer built without an
  // atlas — the dev scenes and most tests — has nothing else to use.)
  const overlayTexture = atlas !== null ? atlas.textures[atlas.pixelFrame] : Texture.WHITE;

  const scene = new Container({ label: 'scene' });
  // Lifted navy, never black (VA panels — shmup_feat.md §18).
  const background = new Sprite(overlayTexture);
  background.scale.set(width, height);
  background.tint = PALETTE.space;
  scene.addChild(background);

  let pattern: TestPattern | null = null;
  if (options.testPattern === true) {
    pattern = createTestPattern(width, height);
    scene.addChild(pattern.root);
  }

  const layers = createLayerStack({ renderGroups: options.renderGroups !== false });
  scene.addChild(layers.root);

  // Screen flash: last children of the world group (over every world layer, under the HUD) — an
  // ordinary overlay and an additive one (M2-08: the Mega Crash palette flash). Two sprites, so a
  // flash never changes a sprite's blend mode (that rebuilds Pixi's render group).
  const flash = new Sprite(overlayTexture);
  flash.position.set(-OVERLAY_MARGIN, -OVERLAY_MARGIN);
  flash.scale.set(width + 2 * OVERLAY_MARGIN, height + 2 * OVERLAY_MARGIN);
  flash.visible = false;
  layers.world.addChild(flash);
  const flashAdd = new Sprite(overlayTexture);
  flashAdd.position.set(-OVERLAY_MARGIN, -OVERLAY_MARGIN);
  flashAdd.scale.set(width + 2 * OVERLAY_MARGIN, height + 2 * OVERLAY_MARGIN);
  flashAdd.blendMode = 'add';
  flashAdd.visible = false;
  layers.world.addChild(flashAdd);

  // Playfield dim (the boss WARNING): over every world layer, under the flash and the HUD.
  const playfieldDim = new Sprite(overlayTexture);
  playfieldDim.position.set(-OVERLAY_MARGIN, -OVERLAY_MARGIN);
  playfieldDim.scale.set(width + 2 * OVERLAY_MARGIN, height + 2 * OVERLAY_MARGIN);
  playfieldDim.tint = 0x000000;
  playfieldDim.visible = false;
  layers.world.addChildAt(playfieldDim, layers.world.children.length - 2);
  let flashTint = 0xffffff;
  let flashAddTint = 0xffffff;

  // Dim: first child of the UI layer (darkens world + HUD under a menu).
  const uiLayer = layers.layers[LayerId.Ui];
  const dim = new Sprite(overlayTexture);
  dim.scale.set(width, height);
  dim.tint = 0x000000;
  dim.visible = false;
  uiLayer.addChild(dim);

  const tables: SpriteTables = { base: new Int32Array(0), flash: new Int32Array(0) };
  let font: BitmapFont | null = null;
  let metrics: TextMetrics | null = null;
  let hudView: DrawListView | null = null;
  let uiView: DrawListView | null = null;
  if (atlas !== null) {
    const fontName = options.font ?? DEFAULT_FONT;
    if (Object.prototype.hasOwnProperty.call(atlas.manifest.fonts, fontName)) {
      font = createBitmapFont(atlas, fontName);
      metrics = createTextMetrics([font]);
    }
    const capacity = options.glyphCapacity ?? DEFAULT_GLYPH_CAPACITY;
    hudView = createDrawListView({ atlas, font, tables, capacity, label: 'hud' });
    uiView = createDrawListView({ atlas, font, tables, capacity, label: 'ui' });
    layers.layers[LayerId.Hud].addChild(hudView.container);
    uiLayer.addChild(uiView.container);
  }

  // Game feel (plan M1-14): particles, then popups, on the FX layer — under the enemy bullets.
  const effects = createScreenEffects(options.effects ?? {});
  const fxLayer = layers.layers[LayerId.Fx];
  let particles: ParticleSystem | null = null;
  let popups: ScorePopups | null = null;
  if (atlas !== null) {
    particles = createParticleSystem({
      atlas,
      capacity: options.particleCapacity ?? PARTICLE_CAPACITY,
      seed: options.fxSeed ?? 1,
    });
    fxLayer.addChild(particles.container);
    if (font !== null) {
      popups = createScorePopups({ atlas, font });
      fxLayer.addChild(popups.container);
    }
  }
  let lastTick = -1;

  // Presentation polish (plan M2-08): the layer effects, the hitbox layer, interpolation.
  const layerEffects = createLayerEffects({
    layers: layers.layers,
    width,
    height,
    createFilter: options.createLayerEffectFilter,
  });
  // The Mode-7 floor (M3-02; a mesh since M3-02d) at the bottom of the mid-background layer.
  const mode7: Mode7Floor = createMode7Floor({
    layer: layers.layers[LayerId.BgMid],
    width,
    height,
    createShader:
      options.createMode7Shader ??
      (atlas !== null && atlas.pages.length > 0
        ? (w: number, h: number): Mode7Shader => createMode7Shader(atlas.pages[0], w, h)
        : undefined),
  });
  const hitboxLayer = layers.layers[LayerId.Hitbox];
  let showHitbox = options.showHitbox === true;
  hitboxLayer.visible = showHitbox;
  let interpolation = options.interpolation === true;
  // Interpolation history: the tick of the last frame drawn with it (-1 = reset next frame).
  let interpolatedTick = -1;
  // Camera at the previous tick and at the last tick seen, and the camera drawn this frame.
  const cameraHistory = new Float64Array(4);
  const drawnCamera = new DrawnCamera();
  const blend = new FrameBlend();
  // The hitbox markers' blend (they are synced only while shown) and whether the last frame drew
  // them interpolated — their history is stale otherwise.
  const hitboxBlend = new FrameBlend();
  let hitboxHistory = false;

  // Pass 2: one quad showing the frame texture, integer-scaled and centred. Since M3-02d the
  // quad is a mesh whose shader *is* the CRT program (`createCrtPass` owns it, and adds it to the
  // screen container below the panels' `addChildAt(0)`), so the CRT costs no extra pass.
  const screen = new Container({ label: 'screen' });

  let scaleMode: ScaleMode = options.scaleMode ?? 'integer';
  let aspect: AspectMode = options.aspect ?? 'normal';
  let displayW = Math.max(1, Math.floor(options.displayWidth));
  let displayH = Math.max(1, Math.floor(options.displayHeight));
  let placement: AspectViewport = computeAspectViewport(
    ASPECT_MODES.indexOf(aspect),
    scaleMode,
    displayW,
    displayH,
    width,
    height,
  );
  let viewport: Viewport = placement.viewport;

  // The CRT / scanline pass (M3-02): since M3-02d it owns the node the second pass draws the
  // frame with — a mesh carrying the CRT program, or (with `screenPass: 'filter'`) M3-02's sprite
  // with the filter over the whole pass.
  const screenPass: ScreenPassMode = options.screenPass ?? 'blit';
  const crt: CrtPass = createCrtPass({
    screen,
    frame: frameTexture,
    width,
    height,
    mode: screenPass,
    createBlit: options.createCrtBlit,
    createFilter: options.createCrtFilter,
  });

  // The side panels of the `wide` / `classic` aspect modes (M3-02): two rectangles beside the
  // window, tinted with the frame's own backdrop so the picture sits in a lit surround instead of
  // black. They are behind the frame quad in the screen pass.
  // `Texture.WHITE`, not the atlas pixel of the overlays above: the only other node of pass 2 is
  // the blit mesh sampling the frame texture, so the atlas page would be an extra binding here,
  // not one saved (the review's F9 is about pass 1).
  const panelLeftSprite = new Sprite(Texture.WHITE);
  const panelRightSprite = new Sprite(Texture.WHITE);
  for (const panel of [panelLeftSprite, panelRightSprite]) {
    panel.tint = PALETTE.space;
    panel.alpha = PANEL_ALPHA;
    panel.visible = false;
    screen.addChildAt(panel, 0);
  }

  /** Positions and scales the frame quad and the side panels for the current placement. */
  const applyViewport = (): void => {
    const left = placement.panelLeft;
    const right = placement.panelRight;
    panelLeftSprite.visible = left > 0;
    panelLeftSprite.position.set(0, 0);
    panelLeftSprite.scale.set(left > 0 ? left : 1, displayH);
    panelRightSprite.visible = right > 0;
    panelRightSprite.position.set(displayW - (right > 0 ? right : 0), 0);
    panelRightSprite.scale.set(right > 0 ? right : 1, displayH);
    // The pass owns the frame quad: it places it and follows it with the scanline pitch.
    crt.setViewport(
      viewport.scale,
      viewport.x,
      viewport.y,
      viewport.width,
      viewport.height,
      viewport.scaleX,
      viewport.scaleY,
      displayH,
    );
  };

  /** Recomputes the placement from the display size, the scale mode and the aspect mode. */
  const place = (): void => {
    placement = computeAspectViewport(
      ASPECT_MODES.indexOf(aspect),
      scaleMode,
      displayW,
      displayH,
      width,
      height,
    );
    viewport = placement.viewport;
    applyViewport();
  };
  applyViewport();

  // The two passes' render options, allocated once (no per-frame literals — plan §1.3);
  // `resetPass` restores them before every call.
  const scenePass: RenderOptions = { container: scene, target: frameTexture, clear: true };
  const displayPass: RenderOptions = { container: screen };

  /**
   * Shows every hidden descendant of a container, collecting the ones it changed.
   *
   * @param node - The container to walk.
   * @param hidden - Collects the nodes that were hidden (so they can be hidden again).
   */
  const showAll = (node: Container, hidden: Container[]): void => {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child.visible) {
        child.visible = true;
        hidden.push(child);
      }
      if (child.children.length > 0) showAll(child, hidden);
    }
  };

  /**
   * The boot warm-up frame (plan M3-02d; see {@link PixiRenderer.warmUp}). A cold path: it walks
   * the whole scene and allocates freely.
   */
  const warmUp = (): void => {
    const hidden: Container[] = [];
    layerEffects.attachAll(true);
    showAll(scene, hidden);
    const calls = drawCounter.last;
    renderer.render(resetPass(scenePass, frameTexture, true));
    // Pass 2 goes into a throwaway target, never the canvas: presenting it would flash a frame of
    // nonsense over the loading screen, and the frame texture is the blit's own input so it
    // cannot be the target either. Eight rows are enough to link the program.
    const scratch = RenderTexture.create({
      width: 8,
      height: 8,
      resolution: 1,
      antialias: false,
      scaleMode: 'nearest',
    });
    renderer.render({ container: screen, target: scratch, clear: true });
    scratch.destroy(true);
    for (let i = 0; i < hidden.length; i++) hidden[i].visible = false;
    // The next `sync()` re-attaches whatever the camera really needs.
    layerEffects.attachAll(false);
    drawCounter.calls = 0;
    drawCounter.last = calls;
  };

  let boundWorld: WorldView | null = null;
  let bindings: SpriteLayerBinding[] = [];
  let terrain: TerrainBinding | null = null;
  let parallax: ParallaxBinding | null = null;
  let lasers: LaserBinding | null = null;
  let bendingLasers: BendingLaserBinding | null = null;
  let hitboxes: HitboxBinding | null = null;
  let bulletPalette: BulletPalette = 'standard';
  let spriteNames: readonly string[] | null = null;

  /**
   * Replaces the world bindings (see {@link PixiRenderer.bindWorld}).
   *
   * @param world - World to bind or `null`.
   */
  const bindWorld = (world: WorldView | null): void => {
    for (const binding of bindings) binding.destroy();
    bindings = [];
    terrain?.destroy();
    terrain = null;
    parallax?.destroy();
    parallax = null;
    lasers?.destroy();
    lasers = null;
    bendingLasers?.destroy();
    bendingLasers = null;
    hitboxes?.destroy();
    hitboxes = null;
    mode7.bind(null, null);
    layerEffects.bind(null);
    interpolatedTick = -1;
    boundWorld = null;
    if (world !== null) {
      // Validate first, so a bad view leaves nothing half-bound.
      for (const batch of world.batches) {
        if (!(batch.layer >= 0 && batch.layer < layers.layers.length)) {
          throw new RangeError(`sprite batch has an unknown layer ${batch.layer}`);
        }
      }
      const bands = world.parallax;
      if (bands !== null) {
        for (let i = 0; i < bands.count; i++) {
          const layer = bands.layer[i];
          if (layer !== LayerId.BgFar && layer !== LayerId.BgMid) {
            throw new RangeError(
              `parallax band ${i} has layer ${layer} (BG_FAR or BG_MID expected)`,
            );
          }
        }
      }
      if (atlas !== null) {
        if (bands !== null) {
          parallax = createParallaxBinding({ atlas, tables, view: bands });
          for (let i = 0; i < parallax.containers.length; i++) {
            layers.layers[parallax.layers[i]].addChild(parallax.containers[i]);
          }
        }
        if (world.terrain !== null) {
          terrain = createTerrainBinding({ atlas, tables, view: world.terrain });
          layers.layers[LayerId.Terrain].addChild(terrain.container);
        }
        for (const batch of world.batches) {
          const binding = createSpriteLayerBinding({
            atlas,
            tables,
            capacity: batch.capacity,
            layer: batch.layer,
          });
          layers.layers[batch.layer].addChild(binding.container);
          bindings.push(binding);
        }
        const laserView = world.lasers ?? null;
        if (laserView !== null) {
          lasers = createLaserBinding({ atlas, tables, capacity: laserView.capacity });
          layers.layers[LayerId.EnemyBullets].addChild(lasers.container);
        }
        const bendView = world.bendingLasers ?? null;
        if (bendView !== null) {
          bendingLasers = createBendingLaserBinding({
            atlas,
            tables,
            capacity: bendView.capacity,
            nodes: bendView.nodes,
          });
          layers.layers[LayerId.EnemyBullets].addChild(bendingLasers.container);
        }
        const hitboxView = world.hitboxes ?? null;
        if (hitboxView !== null) {
          hitboxes = createHitboxBinding({ atlas, capacity: hitboxView.capacity });
          hitboxLayer.addChild(hitboxes.container);
        }
      }
      // Presentation effects (M2-08) — also without an atlas (they only filter layers).
      layerEffects.bind(world.effects ?? null);
      // The Mode-7 floor (M3-02): it samples the atlas page the tile sits on.
      const floor = world.effects?.mode7 ?? null;
      mode7.bind(floor, floor === null ? null : mode7TileRect(atlas, spriteNames, floor.spriteId));
    }
    boundWorld = world;
  };

  return {
    width,
    height,
    scene,
    layers,
    atlas,
    get metrics() {
      return metrics;
    },
    get bindings() {
      return bindings;
    },
    get terrain() {
      return terrain;
    },
    get parallax() {
      return parallax;
    },
    get lasers() {
      return lasers;
    },
    get bendingLasers() {
      return bendingLasers;
    },
    get hitboxes() {
      return hitboxes;
    },
    layerEffects,
    get scaleMode() {
      return scaleMode;
    },
    setScaleMode(mode) {
      if (mode === scaleMode) return;
      scaleMode = mode;
      place();
    },
    get aspect() {
      return aspect;
    },
    setAspect(mode: AspectMode) {
      if (mode === aspect) return;
      aspect = mode;
      place();
    },
    get panels() {
      return placement;
    },
    get crtFilter() {
      return crt.setting;
    },
    setCrtFilter(setting: CrtFilter) {
      crt.setSetting(setting);
    },
    crt,
    screenPass,
    mode7,
    warmUp,
    get showHitbox() {
      return showHitbox;
    },
    setShowHitbox(on) {
      showHitbox = on;
      hitboxLayer.visible = on;
    },
    get interpolation() {
      return interpolation;
    },
    setInterpolation(on) {
      if (on === interpolation) return;
      interpolation = on;
      interpolatedTick = -1;
    },
    get bulletPalette() {
      return bulletPalette;
    },
    setBulletPalette(palette) {
      if (palette === bulletPalette) return;
      bulletPalette = palette;
      if (atlas === null || spriteNames === null) return;
      tables.base = resolveBulletPaletteTable(atlas, spriteNames, palette);
      hudView?.invalidate();
      uiView?.invalidate();
    },
    effects,
    particles,
    popups,
    setFxContent(content) {
      particles?.setContent(content);
    },
    get viewport() {
      return viewport;
    },
    get webGLVersion() {
      return renderer.context.webGLVersion;
    },
    get drawCalls() {
      return drawCounter.last;
    },
    get structureRebuilds() {
      return structureRebuilds;
    },
    get groupRebuilds() {
      return groupRebuilds;
    },
    setSpriteNames(names) {
      if (atlas === null) return;
      spriteNames = names;
      const resolved = createSpriteTables(atlas, names);
      tables.base =
        bulletPalette === 'standard'
          ? resolved.base
          : resolveBulletPaletteTable(atlas, names, bulletPalette);
      tables.flash = resolved.flash;
      hudView?.invalidate();
      uiView?.invalidate();
    },
    bindWorld,
    resize(cssWidth, cssHeight) {
      const w = Math.max(1, Math.floor(cssWidth));
      const h = Math.max(1, Math.floor(cssHeight));
      renderer.resize(w, h);
      displayW = w;
      displayH = h;
      place();
    },
    render(frame: RenderFrame) {
      if (pattern !== null) pattern.update(frame.tick);
      // Effects run on simulated ticks: they freeze with a paused game; a tick counter that went
      // back (a new session) ends every running effect.
      const tick = frame.tick;
      let ticks = 0;
      if (lastTick >= 0 && tick >= lastTick) ticks = tick - lastTick;
      else if (lastTick >= 0) {
        effects.clear();
        particles?.clear();
        popups?.clear();
      }
      lastTick = tick;
      if (ticks > 0) {
        if (ticks > MAX_EFFECT_STEP) ticks = MAX_EFFECT_STEP;
        effects.step(ticks);
        particles?.step(ticks);
        popups?.step(ticks);
      }
      const world = frame.world;
      if (world !== boundWorld) bindWorld(world);
      // Render interpolation (M2-08): ticks since the last interpolated frame (anything but 0 or 1
      // resets the bindings' history), and the camera between the previous and current tick.
      let camera: CameraView = world !== null ? world.camera : NO_CAMERA;
      if (interpolation && world !== null) {
        const advance =
          interpolatedTick >= 0 && tick >= interpolatedTick ? tick - interpolatedTick : -1;
        interpolatedTick = tick;
        // Clamped inline (a fractional result returned from a call V8 does not inline is boxed).
        const raw = frame.alpha;
        const alpha = raw > 0 ? (raw < 1 ? raw : 1) : 0;
        blend.advance = advance;
        blend.alpha = alpha;
        const cam = world.camera;
        if (advance === 1) {
          cameraHistory[0] = cameraHistory[2];
          cameraHistory[1] = cameraHistory[3];
        } else if (advance !== 0) {
          cameraHistory[0] = cam.x;
          cameraHistory[1] = cam.y;
        }
        cameraHistory[2] = cam.x;
        cameraHistory[3] = cam.y;
        drawnCamera.x = cameraHistory[0] + (cam.x - cameraHistory[0]) * alpha;
        drawnCamera.y = cameraHistory[1] + (cam.y - cameraHistory[1]) * alpha;
        camera = drawnCamera;
      }
      particles?.sync(camera);
      popups?.sync(camera);
      const screen = frame.screen;
      const shakeX = (Math.round(screen.shakeX) + effects.shakeX) | 0;
      const shakeY = (Math.round(screen.shakeY) + effects.shakeY) | 0;
      let hitboxesInterpolated = false;
      if (world !== null) {
        const camX = camera.x;
        const camY = camera.y;
        const interpolate = interpolation;
        const bands = world.parallax;
        if (parallax !== null && bands !== null) {
          if (interpolate) parallax.syncInterpolated(bands, blend);
          else parallax.sync(bands);
        }
        if (terrain !== null && world.terrain !== null) terrain.sync(world.terrain, camera);
        const batches = world.batches;
        for (let i = 0; i < bindings.length; i++) {
          if (interpolate) bindings[i].syncInterpolated(batches[i], camera, blend);
          else bindings[i].sync(batches[i], camX, camY);
        }
        const laserView = world.lasers;
        if (lasers !== null && laserView !== undefined && laserView !== null) {
          lasers.sync(laserView, camera);
        }
        const bendView = world.bendingLasers;
        if (bendingLasers !== null && bendView !== undefined && bendView !== null) {
          bendingLasers.sync(bendView, camera);
        }
        const hitboxView = world.hitboxes;
        if (showHitbox && hitboxes !== null && hitboxView !== undefined && hitboxView !== null) {
          if (interpolate) {
            // On the interpolated ship; a history older than the last frame (the markers were
            // hidden) is reset rather than blended from.
            hitboxBlend.alpha = blend.alpha;
            hitboxBlend.advance = hitboxHistory ? blend.advance : -1;
            hitboxes.syncInterpolated(hitboxView, camera, hitboxBlend);
            hitboxesInterpolated = true;
          } else {
            hitboxes.sync(hitboxView, camera);
          }
        }
        layerEffects.sync(tick, camera, shakeY, effects.settings.rasterEffects);
        mode7.sync(camera);
      }
      hitboxHistory = hitboxesInterpolated;
      layers.world.position.set(shakeX, shakeY);
      // The brighter of the frame's own flash (white) and the event-driven one (its look's colour;
      // an additive look — the Mega Crash, M2-08 — goes to the additive overlay).
      const frameFlash = unit(screen.flash);
      const eventFlash = unit(effects.flashAlpha);
      const eventWins = eventFlash > frameFlash;
      const additive = eventWins && effects.flashAdditive;
      const flashAlpha = eventWins ? eventFlash : frameFlash;
      const tint = eventWins ? effects.flashColor : 0xffffff;
      if (additive) {
        if (tint !== flashAddTint) {
          flashAddTint = tint;
          flashAdd.tint = tint;
        }
        flashAdd.alpha = flashAlpha;
        flashAdd.visible = true;
        flash.visible = false;
      } else {
        if (flashAlpha > 0 && tint !== flashTint) {
          flashTint = tint;
          flash.tint = tint;
        }
        flash.alpha = flashAlpha;
        flash.visible = flashAlpha > 0;
        flashAdd.visible = false;
      }
      const playfieldAlpha = unit(effects.dimAlpha);
      playfieldDim.alpha = playfieldAlpha;
      playfieldDim.visible = playfieldAlpha > 0;
      const dimAlpha = unit(screen.dim);
      dim.alpha = dimAlpha;
      dim.visible = dimAlpha > 0;
      if (hudView !== null) hudView.draw(frame.hud);
      if (uiView !== null) uiView.draw(frame.ui);
      drawCounter.calls = 0;
      // Before pass 1: Pixi clears the flag while rendering, so it has to be read now.
      if (countRebuilds) {
        const group = scene.renderGroup;
        if (group !== null && group !== undefined) {
          if (group.structureDidChange) structureRebuilds++;
          groupRebuilds += countGroupRebuilds(group);
        }
      }
      renderer.render(resetPass(scenePass, frameTexture, true));
      renderer.render(resetPass(displayPass, undefined, undefined));
      if (countDraws) drawCounter.last = drawCounter.calls;
    },
    destroy() {
      bindWorld(null);
      layerEffects.destroy();
      // The floor's mesh, geometry and GL program are the pass's own, not the scene's: unbinding
      // only hides them (plan M3-02d — `bindWorld(null)` above keeps the mesh for the next world).
      mode7.destroy();
      hudView?.destroy();
      uiView?.destroy();
      crt.destroy();
      // The second pass's own container: the frame quad is the CRT pass's, the side panels are
      // this container's (`Container.destroy` ignores an already-destroyed child).
      screen.destroy({ children: true });
      scene.destroy({ children: true });
      frameTexture.destroy(true);
      renderer.destroy();
    },
  };
}
