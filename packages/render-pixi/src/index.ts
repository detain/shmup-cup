/**
 * `@shmup/render-pixi` — PixiJS v8 implementation of the core's `IRenderer`.
 *
 * WebGL1-first, draws the game into a 384×216 render texture and presents it with a
 * single nearest-neighbour, integer-scaled quad. Pixi is a renderer only (no
 * `Application`, no ticker). The simulation never imports this package: it fills the core's
 * render contract (`RenderFrame`: world sprite batches, the stage's terrain and parallax, the
 * enemy lasers, HUD / UI draw lists, screen effects) and the host hands it to
 * {@link createPixiRenderer | the renderer}, which draws it from the sprite atlas
 * ({@link createAtlas}) in the fixed layer order ({@link createLayerStack}) without per-frame
 * allocation. It also draws the game feel fed by the sim's events (plan M1-14): particle presets
 * from `content/fx/` ({@link createParticleSystem}, {@link loadFxContent} — the owner of the `fx`
 * content kind), score popups and the screen shake / flash / dim ({@link createScreenEffects}).
 *
 * @packageDocumentation
 */
export {
  createPixiRenderer,
  type PixiRenderer,
  type PixiRendererOptions,
} from './renderer/index.js';
export { computeIntegerViewport, type Viewport } from './viewport/index.js';
export {
  createTestPattern,
  pixelArtToRects,
  PLACEHOLDER_SHIP,
  type PixelRect,
  type TestPattern,
} from './test-pattern/index.js';
export { PALETTE, type PaletteColor } from './palette/index.js';
export {
  MAX_ATLAS_SIZE,
  MISSING_SPRITE,
  PIXEL_SPRITE,
  createAtlas,
  type Atlas,
  type AtlasFontInfo,
  type AtlasFrameInfo,
  type AtlasGlyphInfo,
  type AtlasManifest,
  type AtlasOptions,
  type AtlasPageImage,
  type AtlasPageInfo,
  type AtlasSpriteInfo,
  type FrameId,
} from './atlas/index.js';
export {
  LASER_WARNING_TINT,
  WORLD_LAYER_COUNT,
  createLaserBinding,
  createLayerStack,
  createParallaxBinding,
  createTerrainBinding,
  type LaserBinding,
  type LaserBindingOptions,
  type LayerStack,
  type ParallaxBinding,
  type ParallaxBindingOptions,
  type TerrainBinding,
  type TerrainBindingOptions,
} from './layers/index.js';
export {
  createQuadPool,
  createSpriteLayerBinding,
  createSpriteTables,
  resolveFrame,
  type QuadPool,
  type QuadPoolOptions,
  type SpriteLayerBinding,
  type SpriteLayerBindingOptions,
  type SpriteTables,
} from './sprites/index.js';
export {
  DEFAULT_FONT,
  DEFAULT_GLYPH_CAPACITY,
  createBitmapFont,
  createTextMetrics,
  drawNumber,
  drawText,
  measureNumber,
  type BitmapFont,
  type GlyphSink,
} from './text/index.js';
export { createDrawListView, type DrawListView, type DrawListViewOptions } from './ui/index.js';
export {
  EMPTY_FX_CONTENT,
  FX_CONTENT_KIND,
  MAX_PARTICLE_STEP,
  MAX_TRIGGERS_PER_CUE,
  PARTICLE_CAPACITY,
  createParticleSystem,
  fxSpriteNames,
  loadFxContent,
  parseFxContent,
  type FxContent,
  type FxContentResult,
  type FxTriggerDef,
  type FxTriggerEvent,
  type ParticleBlend,
  type ParticlePresetDef,
  type ParticleRange,
  type ParticleSystem,
  type ParticleSystemOptions,
} from './particles/index.js';
export {
  BONUS_POPUP_COLOR,
  DEFAULT_EFFECT_SETTINGS,
  DEFAULT_FLASH_LOOK,
  DIM_FADE_IN_TICKS,
  DIM_FADE_OUT_TICKS,
  FLASH_LIMIT,
  FLASH_LOOKS,
  FLASH_WINDOW_TICKS,
  REDUCED_FLASH_ALPHA,
  SCORE_POPUP_COLOR,
  SCORE_POPUP_SLOTS,
  SCORE_POPUP_TICKS,
  SHAKE_PATTERN_X,
  SHAKE_PATTERN_Y,
  createScorePopups,
  createScreenEffects,
  type EffectSettings,
  type FlashLook,
  type ScorePopups,
  type ScorePopupsOptions,
  type ScreenEffects,
} from './effects/index.js';
