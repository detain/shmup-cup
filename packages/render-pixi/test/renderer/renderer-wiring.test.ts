/**
 * Tests createPixiRenderer() with PixiJS's WebGL classes replaced by recording fakes
 * (headless Node has no WebGL). Checks the contract from shmup_tech.md §2.2: WebGL1
 * preferred, no antialiasing, a 384×216 nearest-neighbour render texture, a two-pass
 * frame (scene → texture, texture → screen) and integer-scaled letterboxing on resize.
 */
import type * as Pixi from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PALETTE } from '../../src/palette/index.js';
import { createPixiRenderer } from '../../src/renderer/index.js';

const record = vi.hoisted(() => ({
  init: null as Record<string, unknown> | null,
  renders: [] as Array<{ container: unknown; target?: unknown; clear?: boolean }>,
  resizes: [] as Array<[number, number]>,
  textures: [] as Array<{ options: Record<string, unknown>; destroyed: unknown[] }>,
  sprites: [] as Array<{ texture: unknown; scale: number; x: number; y: number }>,
  rendererDestroyed: 0,
  webGLVersion: 1,
}));

vi.mock('pixi.js', async (importOriginal) => {
  const real = await importOriginal<typeof Pixi>();
  class FakeContainer {
    readonly children: unknown[] = [];
    addChild<T>(child: T): T {
      this.children.push(child);
      return child;
    }
  }
  class FakeSprite {
    readonly state: { texture: unknown; scale: number; x: number; y: number };
    readonly scale = { set: (value: number) => (this.state.scale = value) };
    readonly position = {
      set: (x: number, y: number) => {
        this.state.x = x;
        this.state.y = y;
      },
    };
    constructor(texture: unknown) {
      this.state = { texture, scale: 1, x: 0, y: 0 };
      record.sprites.push(this.state);
    }
  }
  class FakeWebGLRenderer {
    readonly context = {
      get webGLVersion() {
        return record.webGLVersion;
      },
    };
    init(options: Record<string, unknown>): Promise<void> {
      record.init = options;
      return Promise.resolve();
    }
    resize(width: number, height: number): void {
      record.resizes.push([width, height]);
    }
    render(options: { container: unknown; target?: unknown; clear?: boolean }): void {
      record.renders.push(options);
    }
    destroy(): void {
      record.rendererDestroyed++;
    }
  }
  const FakeRenderTexture = {
    create(options: Record<string, unknown>) {
      const texture = {
        options,
        destroyed: [] as unknown[],
        destroy(...args: unknown[]) {
          texture.destroyed.push(args);
        },
      };
      record.textures.push(texture);
      return texture;
    },
  };
  return {
    ...real,
    Container: FakeContainer,
    Sprite: FakeSprite,
    WebGLRenderer: FakeWebGLRenderer,
    RenderTexture: FakeRenderTexture,
  };
});

const canvas = { width: 0, height: 0 } as HTMLCanvasElement;

beforeEach(() => {
  record.init = null;
  record.renders.length = 0;
  record.resizes.length = 0;
  record.textures.length = 0;
  record.sprites.length = 0;
  record.rendererDestroyed = 0;
  record.webGLVersion = 1;
});

describe('render-pixi/renderer createPixiRenderer (mocked WebGL)', () => {
  it('initialises Pixi for crisp pixel art: WebGL1 first, no AA, 1:1 resolution, letterbox colour', async () => {
    await createPixiRenderer({ canvas, displayWidth: 1920, displayHeight: 1080 });
    expect(record.init).toMatchObject({
      canvas,
      width: 1920,
      height: 1080,
      resolution: 1,
      autoDensity: false,
      antialias: false,
      roundPixels: true,
      preferWebGLVersion: 1,
      background: PALETTE.letterbox,
      hello: false,
    });
  });

  it('can be asked to try WebGL2 first and reports the version obtained', async () => {
    record.webGLVersion = 2;
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 800,
      displayHeight: 600,
      preferWebGLVersion: 2,
    });
    expect(record.init?.preferWebGLVersion).toBe(2);
    expect(renderer.webGLVersion).toBe(2);
  });

  it('renders into a 384x216 nearest-neighbour render texture by default', async () => {
    const renderer = await createPixiRenderer({ canvas, displayWidth: 1920, displayHeight: 1080 });
    expect([renderer.width, renderer.height]).toEqual([384, 216]);
    expect(record.textures).toHaveLength(1);
    expect(record.textures[0]?.options).toEqual({
      width: 384,
      height: 216,
      resolution: 1,
      antialias: false,
      scaleMode: 'nearest',
    });
  });

  it('honours a custom internal resolution', async () => {
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 1280,
      displayHeight: 720,
      width: 320,
      height: 180,
    });
    expect([renderer.width, renderer.height]).toEqual([320, 180]);
    expect(record.textures[0]?.options).toMatchObject({ width: 320, height: 180 });
    expect(renderer.viewport.scale).toBe(4);
  });

  it('presents the frame texture once, scaled x5 with no letterbox on 1080p', async () => {
    const renderer = await createPixiRenderer({ canvas, displayWidth: 1920, displayHeight: 1080 });
    expect(record.sprites).toHaveLength(1);
    const sprite = record.sprites[0];
    expect(sprite?.texture).toBe(record.textures[0]);
    expect(sprite).toMatchObject({ scale: 5, x: 0, y: 0 });
    expect(renderer.viewport).toEqual({ scale: 5, x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('draws each frame in two passes: scene → render texture (cleared), then texture → screen', async () => {
    const renderer = await createPixiRenderer({ canvas, displayWidth: 1920, displayHeight: 1080 });
    renderer.render({ tick: 10, alpha: 0 });
    expect(record.renders).toHaveLength(2);
    const [lowRes, present] = record.renders;
    expect(lowRes?.container).toBe(renderer.scene);
    expect(lowRes?.target).toBe(record.textures[0]);
    expect(lowRes?.clear).toBe(true);
    expect(present?.container).not.toBe(renderer.scene);
    expect(present?.target).toBeUndefined();
  });

  it('puts the calibration pattern in the scene and animates it by simulation tick', async () => {
    const renderer = await createPixiRenderer({ canvas, displayWidth: 1920, displayHeight: 1080 });
    const scene = renderer.scene as unknown as {
      children: Array<{ children: Array<{ x: number }> }>;
    };
    expect(scene.children).toHaveLength(1);
    const marker = scene.children[0]?.children[1];
    renderer.render({ tick: 0, alpha: 0 });
    const x0 = marker?.x ?? 0;
    renderer.render({ tick: 7, alpha: 0.5 });
    expect((marker?.x ?? 0) - x0).toBe(7);
  });

  it('resize() floors and clamps the size, resizes the canvas and re-centres the frame', async () => {
    const renderer = await createPixiRenderer({ canvas, displayWidth: 1920, displayHeight: 1080 });
    renderer.resize(1280.9, 720.4);
    expect(record.resizes).toEqual([[1280, 720]]);
    expect(renderer.viewport).toEqual({ scale: 3, x: 64, y: 36, width: 1152, height: 648 });
    expect(record.sprites[0]).toMatchObject({ scale: 3, x: 64, y: 36 });

    renderer.resize(0, -5);
    expect(record.resizes[1]).toEqual([1, 1]);
    expect(renderer.viewport.scale).toBe(1);
  });

  it('destroy() releases the render texture (with its source) and the renderer', async () => {
    const renderer = await createPixiRenderer({ canvas, displayWidth: 1920, displayHeight: 1080 });
    renderer.destroy();
    expect(record.textures[0]?.destroyed).toEqual([[true]]);
    expect(record.rendererDestroyed).toBe(1);
  });
});
