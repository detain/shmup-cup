/**
 * `@shmup/render-pixi` — PixiJS v8 implementation of the core's `IRenderer`.
 *
 * WebGL1-first, draws the game into a 384×216 render texture and presents it with a
 * single nearest-neighbour, integer-scaled quad. Pixi is a renderer only (no
 * `Application`, no ticker). The simulation never imports this package.
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
