/**
 * # renderer — the PixiJS v8 `IRenderer` implementation
 *
 * **Responsibility.** Owns the Pixi `WebGLRenderer` (WebGL1 preferred — WebGL2 on
 * Tizen 5.5 GPUs is unverified), a 384×216 render texture with nearest-neighbour
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
 * batch — plan M1-09), screen shake
 * (the world group is offset by the rounded `shakeX/Y`) and the flash / dim overlays. Optionally
 * the calibration test pattern sits below the layers (`?scene=calibration`).
 *
 * **Allocation.** Pixi objects are created in {@link createPixiRenderer} and when a new
 * `WorldView` object is bound ({@link PixiRenderer.bindWorld} — once per world, called
 * automatically by `render()` when `frame.world` changes identity). A frame showing an already
 * bound world only assigns numbers and existing textures; the two passes reuse option objects
 * allocated with the renderer.
 *
 * **Implements.** shmup_tech.md §2.2 (WebGL1-first, low-res render texture + one
 * nearest upscale quad), §4.1 (Pixi as renderer only), shmup_feat.md §3 (integer
 * scaling, pixel-perfect), §18 (draw order, one atlas, flash/dim), §22 Rendering pipeline.
 *
 * **Public API.** {@link createPixiRenderer}, {@link PixiRenderer},
 * {@link PixiRendererOptions}.
 *
 * @module
 */
import {
  LayerId,
  defineModule,
  type IRenderer,
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
  createLayerStack,
  createLaserBinding,
  createParallaxBinding,
  createTerrainBinding,
  type LaserBinding,
  type LayerStack,
  type ParallaxBinding,
  type TerrainBinding,
} from '../layers/index.js';
import { PALETTE } from '../palette/index.js';
import {
  createSpriteLayerBinding,
  createSpriteTables,
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
import { computeIntegerViewport, type Viewport } from '../viewport/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'renderer',
  status: 'partial',
  specRefs: [
    'shmup_tech.md §2.2',
    'shmup_tech.md §4.1',
    'shmup_feat.md §3',
    'shmup_feat.md §18',
    'shmup_feat.md §22',
  ],
});

/** Pixels the flash overlay extends past each frame edge (it moves with screen shake). */
const OVERLAY_MARGIN = 32;

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
}

/** The Pixi-backed renderer. */
export interface PixiRenderer extends IRenderer {
  /** WebGL version actually obtained (1 or 2). */
  readonly webGLVersion: number;
  /** Current placement of the scaled frame on the canvas. */
  readonly viewport: Viewport;
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
   * laser sprites of `world.lasers` (on `ENEMY_BULLETS`, after the batches), and destroys the
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
 *
 * @param options - Canvas, display size, internal resolution, atlas and scene options.
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
 * renderer.render(game.renderFrame());
 * window.addEventListener('resize', () => renderer.resize(innerWidth, innerHeight));
 * ```
 */
export async function createPixiRenderer(options: PixiRendererOptions): Promise<PixiRenderer> {
  const width = options.width ?? 384;
  const height = options.height ?? 216;
  const atlas = options.atlas ?? null;

  const renderer = new WebGLRenderer();
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

  // Pass 1 target: the internal frame, sampled nearest-neighbour when upscaled.
  const frameTexture = RenderTexture.create({
    width,
    height,
    resolution: 1,
    antialias: false,
    scaleMode: 'nearest',
  });

  const scene = new Container({ label: 'scene' });
  // Lifted navy, never black (VA panels — shmup_feat.md §18).
  const background = new Sprite(Texture.WHITE);
  background.scale.set(width, height);
  background.tint = PALETTE.space;
  scene.addChild(background);

  let pattern: TestPattern | null = null;
  if (options.testPattern === true) {
    pattern = createTestPattern(width, height);
    scene.addChild(pattern.root);
  }

  const layers = createLayerStack();
  scene.addChild(layers.root);

  // Screen flash: last child of the world group (over every world layer, under the HUD).
  const flash = new Sprite(Texture.WHITE);
  flash.position.set(-OVERLAY_MARGIN, -OVERLAY_MARGIN);
  flash.scale.set(width + 2 * OVERLAY_MARGIN, height + 2 * OVERLAY_MARGIN);
  flash.visible = false;
  layers.world.addChild(flash);

  // Dim: first child of the UI layer (darkens world + HUD under a menu).
  const uiLayer = layers.layers[LayerId.Ui];
  const dim = new Sprite(Texture.WHITE);
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

  // Pass 2: one sprite showing the frame texture, integer-scaled and centred.
  const screen = new Container({ label: 'screen' });
  const frameSprite = new Sprite(frameTexture);
  screen.addChild(frameSprite);

  let viewport = computeIntegerViewport(options.displayWidth, options.displayHeight, width, height);

  /** Positions and scales the frame sprite according to the current `viewport`. */
  const applyViewport = (): void => {
    frameSprite.scale.set(viewport.scale);
    frameSprite.position.set(viewport.x, viewport.y);
  };
  applyViewport();

  // The two passes' render options, allocated once (no per-frame literals — plan §1.3);
  // `resetPass` restores them before every call.
  const scenePass: RenderOptions = { container: scene, target: frameTexture, clear: true };
  const screenPass: RenderOptions = { container: screen };

  let boundWorld: WorldView | null = null;
  let bindings: SpriteLayerBinding[] = [];
  let terrain: TerrainBinding | null = null;
  let parallax: ParallaxBinding | null = null;
  let lasers: LaserBinding | null = null;

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
      }
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
    get viewport() {
      return viewport;
    },
    get webGLVersion() {
      return renderer.context.webGLVersion;
    },
    setSpriteNames(names) {
      if (atlas === null) return;
      const resolved = createSpriteTables(atlas, names);
      tables.base = resolved.base;
      tables.flash = resolved.flash;
      hudView?.invalidate();
      uiView?.invalidate();
    },
    bindWorld,
    resize(cssWidth, cssHeight) {
      const w = Math.max(1, Math.floor(cssWidth));
      const h = Math.max(1, Math.floor(cssHeight));
      renderer.resize(w, h);
      viewport = computeIntegerViewport(w, h, width, height);
      applyViewport();
    },
    render(frame: RenderFrame) {
      if (pattern !== null) pattern.update(frame.tick);
      const world = frame.world;
      if (world !== boundWorld) bindWorld(world);
      if (world !== null) {
        const camX = world.camera.x;
        const camY = world.camera.y;
        if (parallax !== null && world.parallax !== null) parallax.sync(world.parallax);
        if (terrain !== null && world.terrain !== null) terrain.sync(world.terrain, world.camera);
        const batches = world.batches;
        for (let i = 0; i < bindings.length; i++) {
          bindings[i].sync(batches[i], camX, camY);
        }
        const laserView = world.lasers;
        if (lasers !== null && laserView !== undefined && laserView !== null) {
          lasers.sync(laserView, world.camera);
        }
      }
      const effects = frame.screen;
      layers.world.position.set(Math.round(effects.shakeX), Math.round(effects.shakeY));
      const flashAlpha = unit(effects.flash);
      flash.alpha = flashAlpha;
      flash.visible = flashAlpha > 0;
      const dimAlpha = unit(effects.dim);
      dim.alpha = dimAlpha;
      dim.visible = dimAlpha > 0;
      if (hudView !== null) hudView.draw(frame.hud);
      if (uiView !== null) uiView.draw(frame.ui);
      renderer.render(resetPass(scenePass, frameTexture, true));
      renderer.render(resetPass(screenPass, undefined, undefined));
    },
    destroy() {
      bindWorld(null);
      hudView?.destroy();
      uiView?.destroy();
      scene.destroy({ children: true });
      frameTexture.destroy(true);
      renderer.destroy();
    },
  };
}
