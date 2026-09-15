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
 * Plan M2-02 adds the enemy bending lasers ({@link createBendingLaserBinding}) and the colour-blind
 * bullet palettes ({@link resolveBulletPaletteTable}, the renderer's `setBulletPalette`). Plan
 * M2-08 adds the SNES-style layer effects — per-scanline raster offsets and palette cycling in one
 * GLSL ES 1.0 filter per layer ({@link createLayerEffects}, {@link addRasterEffect},
 * {@link colorCycleStep}) —, the additive Mega Crash flash, the scale modes
 * ({@link computeViewport}), the hitbox markers ({@link createHitboxBinding}) and render
 * interpolation for displays faster than the tick rate.
 * Dev and test builds add the debug overlay (plan M1-19, {@link createDebugOverlay}): a stats panel
 * with a frame graph and the hitbox / grid outlines on the `DEBUG` layer.
 *
 * @packageDocumentation
 */
export {
  createPixiRenderer,
  type PixiRenderer,
  type PixiRendererOptions,
} from './renderer/index.js';
export { computeIntegerViewport, computeViewport, type Viewport } from './viewport/index.js';
export {
  createTestPattern,
  pixelArtToRects,
  PLACEHOLDER_SHIP,
  type PixelRect,
  type TestPattern,
} from './test-pattern/index.js';
export {
  BULLET_PALETTE_SUFFIX,
  PALETTE,
  bulletPaletteSpriteName,
  colorCycleStep,
  resolveBulletPaletteTable,
  writeColorUnit,
  writeCycleColors,
  type PaletteColor,
} from './palette/index.js';
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
  HITBOX_CORE_TINT,
  HITBOX_RIM_TINT,
  LASER_WARNING_TINT,
  WORLD_LAYER_COUNT,
  createBendingLaserBinding,
  createHitboxBinding,
  createLaserBinding,
  createLayerStack,
  createParallaxBinding,
  createTerrainBinding,
  type BendingLaserBinding,
  type BendingLaserBindingOptions,
  type HitboxBinding,
  type HitboxBindingOptions,
  type LaserBinding,
  type LaserBindingOptions,
  type LayerStack,
  type ParallaxBinding,
  type ParallaxBindingOptions,
  type TerrainBinding,
  type TerrainBindingOptions,
} from './layers/index.js';
export {
  INTERPOLATION_MAX_STEP,
  createQuadPool,
  createSpriteLayerBinding,
  createSpriteTables,
  resolveFrame,
  type QuadPool,
  type QuadPoolOptions,
  type RenderBlend,
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
  LAYER_EFFECT_FRAGMENT,
  LAYER_EFFECT_MAX_COLORS,
  LAYER_EFFECT_ROWS,
  LAYER_EFFECT_VERTEX,
  RASTER_MAX_OFFSET,
  REDUCED_FLASH_ALPHA,
  SCORE_POPUP_COLOR,
  SCORE_POPUP_SLOTS,
  SCORE_POPUP_TICKS,
  SHAKE_PATTERN_X,
  SHAKE_PATTERN_Y,
  addRasterEffect,
  clearRasterTable,
  createLayerEffectFilter,
  createLayerEffects,
  createRasterTable,
  createScorePopups,
  createScreenEffects,
  decodeRasterRow,
  encodeRasterTable,
  stageEffectActive,
  type EffectSettings,
  type FlashLook,
  type LayerEffectFilter,
  type LayerEffects,
  type LayerEffectsOptions,
  type RasterTable,
  type ScorePopups,
  type ScorePopupsOptions,
  type ScreenEffects,
} from './effects/index.js';
export {
  DEBUG_DEVICE_MAX,
  FRAME_GRAPH_LENGTH,
  OUTLINE_COLORS,
  PANEL_COLORS,
  buildDebugOutlines,
  buildDebugPanel,
  createDebugOutlineLists,
  createDebugOverlay,
  createDebugOverlayStats,
  createDebugPanelLists,
  createFrameGraph,
  debugDeviceText,
  setDebugPanelDevice,
  type DebugOutlineLists,
  type DebugOverlay,
  type DebugOverlayOptions,
  type DebugOverlayStats,
  type DebugPanelLists,
  type FrameGraph,
} from './debug/index.js';
