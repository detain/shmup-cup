/**
 * The renderer side of the video surface (v2 R7-VID): with `options.video` the layer stack's root
 * group carries the quad — by default over the world group and under the HUD and UI (the world
 * band; the screen band moves it over the UI, see the video module's own tests), the CRT pass
 * filters it with the whole frame, `render()` pulls the current video frame once per moved
 * presentation time and not for a still one, and `destroy()` releases the surface. Without the
 * option there is no surface at all and the frame path costs one `null` comparison. The faked
 * `WebGLRenderer` is the pattern of `renderer-render-groups-alloc.test.ts` (Pixi probes GL); the
 * surface's element and source are the video module's fakes.
 */
import { createDrawList, type RenderFrame } from '@shmup/core';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createAtlas } from '../../src/atlas/index.js';
import { createPixiRenderer } from '../../src/renderer/index.js';
import type {
  VideoElementLike,
  VideoFrameBitmapLike,
  VideoSourceLike,
  VideoSurface,
} from '../../src/video/index.js';
import { pageImages, testManifest } from '../helpers.js';

vi.mock('pixi.js', async (importOriginal) => {
  const real = await importOriginal<typeof Pixi>();
  /** Stands in for Pixi's `GlProgram`, whose constructor probes a WebGL context (M3-02d). */
  class FakeGlProgram {
    /**
     * Ignores the sources.
     *
     * @param options - The program options.
     * @returns A plain stand-in program.
     */
    static from(options: object): object {
      return { ...options, destroy: (): void => {} };
    }
  }
  const CANVAS_TARGET = { label: 'canvas render target' };
  /** A renderer that records nothing — this test needs the scene graph, not the pixels. */
  class FakeWebGLRenderer {
    readonly context = { webGLVersion: 1 };
    init(): Promise<void> {
      return Promise.resolve();
    }
    resize(): void {}
    render(options: { container: Pixi.Container }): void {
      const writable = options as Record<string, unknown>;
      writable.target ??= CANVAS_TARGET;
      writable.transform ??= options.container.localTransform;
    }
    destroy(): void {}
  }
  const FakeRenderTexture = {
    create(options: { width: number; height: number }): Pixi.Texture {
      return new real.Texture({
        source: new real.TextureSource({ width: options.width, height: options.height }),
      });
    },
  };
  return {
    ...real,
    WebGLRenderer: FakeWebGLRenderer,
    RenderTexture: FakeRenderTexture,
    GlProgram: FakeGlProgram,
  };
});

const canvas = { width: 0, height: 0 } as HTMLCanvasElement;

/** The scene's element, driven by hand. */
class FakeElement implements VideoElementLike {
  src = '';
  loop = false;
  preload = '';
  ready = 4;
  time = 0;
  end = false;
  get currentTime(): number {
    return this.time;
  }
  get readyState(): number {
    return this.ready;
  }
  get ended(): boolean {
    return this.end;
  }
  load(): void {}
  play(): Promise<void> {
    return Promise.resolve();
  }
  pause(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}

/** The reused frame snapshot. */
const SHARED_BITMAP: VideoFrameBitmapLike = {
  width: 640,
  height: 360,
  close(): void {},
};

/** The scene's texture source: counts the swaps `render()` pulls in. */
class FakeSource implements VideoSourceLike {
  resource: VideoFrameBitmapLike | null = null;
  pixelWidth = 640;
  pixelHeight = 360;
  updates = 0;
  destroyed = false;

  update(): void {
    this.updates++;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

/**
 * A renderer with a fresh atlas and a fresh pair of surface fakes.
 *
 * @param video - Whether to build with the video option.
 * @returns The renderer and the two fakes.
 */
async function makeRenderer(video: boolean): Promise<{
  renderer: Awaited<ReturnType<typeof createPixiRenderer>>;
  element: FakeElement;
  source: FakeSource;
}> {
  const manifest = testManifest();
  const element = new FakeElement();
  const source = new FakeSource();
  const surfaceFakes = {
    createVideoElement: () => element,
    createVideoSource: (bitmap: VideoFrameBitmapLike) => {
      source.resource = bitmap;
      return source;
    },
    createFrameBitmap: () => Promise.resolve(SHARED_BITMAP),
  };
  const renderer = await createPixiRenderer({
    canvas,
    displayWidth: 960,
    displayHeight: 540,
    atlas: createAtlas(manifest, pageImages(manifest), { onWarning: () => {} }),
    ...(video ? { video: surfaceFakes } : {}),
  });
  renderer.setSpriteNames(['ships/a']);
  return { renderer, element, source };
}

/**
 * The surface of a renderer built with the option, narrowed for the test bodies.
 *
 * @param renderer - A renderer from {@link makeRenderer} with `video: true`.
 * @returns Its video surface.
 * @throws {Error} When the renderer came without one (the test's premise broken).
 */
function surfaceOf(renderer: Awaited<ReturnType<typeof createPixiRenderer>>): VideoSurface {
  const video = renderer.video;
  if (video === null) throw new Error('renderer has no video surface');
  return video;
}

/** The title's frame shape: no world, empty lists. */
const titleFrame = (): RenderFrame => ({
  tick: 0,
  alpha: 0,
  world: null,
  hud: createDrawList(8, 1),
  ui: createDrawList(8, 1),
  screen: { shakeX: 0, shakeY: 0, flash: 0, dim: 0 },
});

describe('render-pixi/renderer — video surface wiring', () => {
  it('has no surface at all without the option', async () => {
    const { renderer } = await makeRenderer(false);
    expect(renderer.video).toBeNull();
    renderer.render(titleFrame()); // the plain frame path still runs
    renderer.destroy();
  });

  it('the quad container joins the layer stack root, over the world and under the HUD', async () => {
    const { renderer } = await makeRenderer(true);
    const video = surfaceOf(renderer);
    const children = renderer.layers.root.children;
    const videoIndex = children.indexOf(video.container);
    expect(renderer.scene.children).not.toContain(video.container); // not beside the stack — inside it
    expect(videoIndex).toBe(1); // right after the world group: [world, video, HUD, UI, DEBUG]
    expect(children.indexOf(renderer.layers.layers[15])).toBeGreaterThan(videoIndex); // UI above
    expect(video.band).toBe('world');
    renderer.destroy();
  });

  it('render() pulls the moved frame and not the still one', async () => {
    const { renderer, element, source } = await makeRenderer(true);
    const video = surfaceOf(renderer);
    await expect(video.play('assets/video/title-sting.mp4', false)).resolves.toBe(true);
    // `play` built the quad over the first frame (no update event: the first draw uploads);
    // a render with an unchanged time must not pull at all.
    expect(source.updates).toBe(0);
    renderer.render(titleFrame());
    expect(source.updates).toBe(0);
    element.time = 0.5;
    renderer.render(titleFrame()); // the copy starts; the swap lands on the microtask
    await Promise.resolve();
    await Promise.resolve();
    expect(source.updates).toBe(1);
    renderer.render(titleFrame());
    expect(source.updates).toBe(1);
    renderer.destroy();
    expect(source.destroyed).toBe(true);
  });
});
