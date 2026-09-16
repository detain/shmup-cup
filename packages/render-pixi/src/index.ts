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
 * interpolation for displays faster than the tick rate. Plan M3-02 adds the **Mode-7 floor**
 * ({@link createMode7Floor}: mode 7's per-row affine matrix in a GLSL ES 1.0 filter — the pseudo-3D
 * high-speed stage), the **CRT / scanline filter** ({@link createCrtPass}: off / light / full over
 * the upscaled picture, capped at 1080p) and the **aspect modes**
 * ({@link computeAspectViewport}: the ultra-wide desktop window and the classic 4:3 one, with side
 * panels instead of black bars).
 * Plan M3-02e makes each layer whose bindings toggle `visible` while the game runs its own Pixi
 * **render group** ({@link RENDER_GROUP_LAYERS}, {@link LayerStackOptions}), so hiding one sprite
 * rebuilds that layer's instruction set instead of the whole ~6,400-object scene's — the render
 * review's **F1**, at the price of one batch boundary per group.
 * Dev and test builds add the debug overlay (plan M1-19, {@link createDebugOverlay}): a stats panel
 * with a frame graph and the hitbox / grid outlines on the `DEBUG` layer (deliberately *not* a
 * render group, which is why the panel's own quads move {@link PixiRenderer.structureRebuilds} —
 * read that figure with the panel hidden).
 *
 * @packageDocumentation
 */
export {
  createPixiRenderer,
  type PixiRenderer,
  type PixiRendererOptions,
} from './renderer/index.js';
export {
  ASPECT_RATIOS,
  computeAspectViewport,
  computeIntegerViewport,
  computeViewport,
  type AspectViewport,
  type Viewport,
} from './viewport/index.js';
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
  RENDER_GROUP_LAYERS,
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
  type LayerStackOptions,
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
  MODE7_ANGLE_UNITS,
  MODE7_FRAGMENT,
  MODE7_MAX_SCALE,
  MODE7_VERTEX,
  CRT_FRAGMENT,
  CRT_FULL_MASK,
  CRT_FULL_SCAN,
  CRT_FULL_VIGNETTE,
  CRT_LIGHT_SCAN,
  CRT_LOOKS,
  CRT_MIN_PITCH,
  CRT_VERTEX,
  EFFECT_MESH_VERTEX,
  RASTER_MAX_OFFSET,
  REDUCED_FLASH_ALPHA,
  SCORE_POPUP_COLOR,
  SCORE_POPUP_SLOTS,
  SCORE_POPUP_TICKS,
  SHAKE_PATTERN_X,
  SHAKE_PATTERN_Y,
  addRasterEffect,
  clearRasterTable,
  createCrtBlit,
  createCrtFilter,
  createCrtPass,
  createLayerEffectFilter,
  createLayerEffects,
  createMode7Floor,
  createMode7Shader,
  createRasterTable,
  crtResolution,
  createScorePopups,
  createScreenEffects,
  decodeRasterRow,
  encodeRasterTable,
  stageEffectActive,
  type CrtBlitHandle,
  type CrtFilterHandle,
  type CrtLook,
  type CrtPass,
  type CrtPassOptions,
  type EffectSettings,
  type FlashLook,
  type Mode7Floor,
  type Mode7FloorOptions,
  type Mode7Shader,
  type ScreenPassMode,
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
  RAF_BUCKETS,
  RAF_BUCKET_EDGES_MS,
  buildDebugOutlines,
  buildDebugPanel,
  buildRafHistogram,
  createDebugOutlineLists,
  createDebugOverlay,
  createDebugOverlayStats,
  createDebugPanelLists,
  createFrameGraph,
  createRenderTargetMeter,
  debugDeviceText,
  rafDeltaBucket,
  setDebugPanelDevice,
  type DebugOutlineLists,
  type DebugOverlay,
  type DebugOverlayOptions,
  type DebugOverlayStats,
  type DebugPanelLists,
  type FrameGraph,
  type RenderTargetMeter,
} from './debug/index.js';
