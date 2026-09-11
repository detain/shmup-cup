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
 * Today the low-res scene contains only the calibration test pattern; later steps add
 * the layer stack (`layers`), sprite views over sim pools (`sprites`), HUD/menus (`ui`),
 * text, particles, effects and the debug overlay.
 *
 * **Implements.** shmup_tech.md §2.2 (WebGL1-first, low-res render texture + one
 * nearest upscale quad), §4.1 (Pixi as renderer only), shmup_feat.md §3 (integer
 * scaling, pixel-perfect), §22 Rendering pipeline.
 *
 * **Public API.** {@link createPixiRenderer}, {@link PixiRenderer},
 * {@link PixiRendererOptions}.
 *
 * @module
 */
import { defineModule, type IRenderer, type RenderFrame } from '@shmup/core';
import { Container, RenderTexture, Sprite, WebGLRenderer } from 'pixi.js';
import { PALETTE } from '../palette/index.js';
import { createTestPattern } from '../test-pattern/index.js';
import { computeIntegerViewport, type Viewport } from '../viewport/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'renderer',
  status: 'partial',
  specRefs: ['shmup_tech.md §2.2', 'shmup_tech.md §4.1', 'shmup_feat.md §3', 'shmup_feat.md §22'],
});

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
}

/** The Pixi-backed renderer. */
export interface PixiRenderer extends IRenderer {
  /** WebGL version actually obtained (1 or 2). */
  readonly webGLVersion: number;
  /** Current placement of the scaled frame on the canvas. */
  readonly viewport: Viewport;
  /** Low-res scene root (384×216 coordinates). Later steps attach layers here. */
  readonly scene: Container;
}

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
 *
 * @param options - Canvas, display size and internal resolution.
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
 * });
 * renderer.render(game.renderFrame());
 * window.addEventListener('resize', () => renderer.resize(innerWidth, innerHeight));
 * ```
 */
export async function createPixiRenderer(options: PixiRendererOptions): Promise<PixiRenderer> {
  const width = options.width ?? 384;
  const height = options.height ?? 216;

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

  const scene = new Container();
  const pattern = createTestPattern(width, height);
  scene.addChild(pattern.root);

  // Pass 2: one sprite showing the frame texture, integer-scaled and centred.
  const screen = new Container();
  const frameSprite = new Sprite(frameTexture);
  screen.addChild(frameSprite);

  let viewport = computeIntegerViewport(options.displayWidth, options.displayHeight, width, height);

  /** Positions and scales the frame sprite according to the current `viewport`. */
  const applyViewport = (): void => {
    frameSprite.scale.set(viewport.scale);
    frameSprite.position.set(viewport.x, viewport.y);
  };
  applyViewport();

  return {
    width,
    height,
    scene,
    get viewport() {
      return viewport;
    },
    get webGLVersion() {
      return renderer.context.webGLVersion;
    },
    resize(cssWidth, cssHeight) {
      const w = Math.max(1, Math.floor(cssWidth));
      const h = Math.max(1, Math.floor(cssHeight));
      renderer.resize(w, h);
      viewport = computeIntegerViewport(w, h, width, height);
      applyViewport();
    },
    render(frame: RenderFrame) {
      pattern.update(frame.tick);
      renderer.render({ container: scene, target: frameTexture, clear: true });
      renderer.render({ container: screen });
    },
    destroy() {
      frameTexture.destroy(true);
      renderer.destroy();
    },
  };
}
