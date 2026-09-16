/**
 * The **Mode-7 floor** of plan M3-02, rewritten as a mesh by M3-02d (`createMode7Shader`,
 * `createMode7Floor`), built in Node with PixiJS's `GlProgram.from` faked (the real one probes a
 * WebGL context for the GPU's precision):
 *
 * - the shader gets the GLSL ES 1.0 sources — the **mesh** vertex shader since M3-02d — declares
 *   the uniforms the shader reads, turns a stage floor into the plane's rotated axes (from the
 *   core's angle tables — no trigonometry), its origin, fog colour and rows, and maps a tile
 *   rectangle into atlas UV;
 * - the floor manages the mesh: nothing is created for a stage without a floor or without the
 *   sprite in the atlas, the mesh is drawn only while the camera is inside `[from, to)`, drawn
 *   again when it comes back, and a frame inside the range allocates nothing;
 * - no Pixi filter is involved at all any more (the render review's **F6**: the old shape pooled a
 *   512 × 256 render target and ran a pass whose input the shader never read);
 * - `destroy` frees the mesh and the shader.
 */
import { PLAYFIELD_H, PLAYFIELD_W, PLAYFIELD_Y, cosB, sinB, type Mode7View } from '@shmup/core';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';
import { Container } from 'pixi.js';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import {
  EFFECT_MESH_VERTEX,
  MODE7_ANGLE_UNITS,
  MODE7_FRAGMENT,
  MODE7_MAX_SCALE,
  createMode7Floor,
  createMode7Shader,
  type Mode7Shader,
} from '../../src/effects/index.js';

/** What the fake `GlProgram.from` was given. */
const programs = vi.hoisted((): Array<{ vertex: string; fragment: string; name: string }> => []);

vi.mock('pixi.js', async (importOriginal) => {
  const real = await importOriginal<typeof Pixi>();
  /** Stands in for Pixi's GlProgram (whose constructor needs a WebGL context). */
  class FakeGlProgram {
    /**
     * Records the sources.
     *
     * @param options - The program options.
     * @returns A plain stand-in program.
     */
    static from(options: { vertex: string; fragment: string; name: string }): object {
      programs.push(options);
      return { ...options, destroy: (): void => {} };
    }
  }
  return { ...real, GlProgram: FakeGlProgram };
});

/** The uniform fields the Mode-7 shader writes. */
interface Uniforms {
  uTileRect: Float32Array;
  uRight: Float32Array;
  uForward: Float32Array;
  uOrigin: Float32Array;
  uFog: Float32Array;
  uHorizon: number;
  uBottom: number;
  uCentre: number;
  uHeight: number;
  uFogDepth: number;
  uMaxScale: number;
  uAlpha: number;
}

/**
 * The mesh shader's uniform group.
 *
 * @param mode7 - The shader handle.
 * @returns Its uniforms.
 */
function uniformsOf(mode7: Mode7Shader): Uniforms {
  const group = mode7.mesh.shader?.resources.mode7Uniforms as Pixi.UniformGroup;
  return group.uniforms as unknown as Uniforms;
}

/**
 * A stage floor.
 *
 * @param over - Fields to override.
 * @returns The view.
 */
function view(over: Partial<Mode7View> = {}): Mode7View {
  return {
    spriteId: 7,
    horizon: 100,
    bottom: 200,
    height: 34,
    scroll: 0.5,
    sway: 0.25,
    turn: 0,
    fog: 0x20_12_4a,
    fogDepth: 220,
    alpha: 1,
    from: 0,
    to: Number.POSITIVE_INFINITY,
    ...over,
  };
}

/**
 * A camera view with only the fields the floor reads.
 *
 * @param x - Camera x.
 * @param y - Camera y.
 * @returns The camera.
 */
const camera = (x: number, y = 0): { x: number; y: number } => ({ x, y });

/** A fake shader that records what the floor asks of it. */
interface FakeShader extends Mode7Shader {
  /** Every `apply` call. */
  readonly applied: Array<[Mode7View, number, number]>;
  /** Every `setTile` call. */
  readonly tiles: number[][];
  /** Times `destroy` was called. */
  destroyed: number;
}

/**
 * Builds a fake shader (a plain container stands in for the mesh).
 *
 * @returns The shader.
 */
function fakeShader(): FakeShader {
  const fake: FakeShader = {
    mesh: new Container() as unknown as Mode7Shader['mesh'],
    applied: [],
    tiles: [],
    destroyed: 0,
    apply(floor, originU, originV) {
      fake.applied.push([floor, originU, originV]);
    },
    setTile(x, y, w, h, pw, ph) {
      fake.tiles.push([x, y, w, h, pw, ph]);
    },
    destroy() {
      fake.destroyed++;
    },
  };
  return fake;
}

describe('render-pixi/effects Mode-7 shader (M3-02, a mesh since M3-02d)', () => {
  it('is built from the GLSL ES 1.0 sources with the uniforms the shader reads', () => {
    const before = programs.length;
    const mode7 = createMode7Shader({} as Pixi.TextureSource, 384, 216);
    expect(programs.slice(before)).toEqual([
      { vertex: EFFECT_MESH_VERTEX, fragment: MODE7_FRAGMENT, name: 'shmup-mode7' },
    ]);
    const u = uniformsOf(mode7);
    expect([...u.uTileRect]).toEqual([0, 0, 1, 1]);
    expect(u.uCentre).toBe(PLAYFIELD_W / 2);
    expect(u.uBottom).toBe(PLAYFIELD_Y + PLAYFIELD_H);
    expect(u.uMaxScale).toBe(MODE7_MAX_SCALE);
    // The quad is the frame, hidden until the camera reaches the floor's range.
    expect(mode7.mesh.visible).toBe(false);
    expect([...mode7.mesh.geometry.positions]).toEqual([0, 0, 384, 0, 384, 216, 0, 216]);
    mode7.destroy();
  });

  it('maps a tile rectangle into atlas UV', () => {
    const mode7 = createMode7Shader({} as Pixi.TextureSource, 384, 216);
    mode7.setTile(64, 32, 32, 16, 1024, 512);
    expect([...uniformsOf(mode7).uTileRect]).toEqual([64 / 1024, 32 / 512, 32 / 1024, 16 / 512]);
    mode7.destroy();
  });

  it('turns a floor into the plane rows, axes, origin and fog', () => {
    const mode7 = createMode7Shader({} as Pixi.TextureSource, 384, 216);
    mode7.apply(view({ turn: 0 }), 12, -4);
    const u = uniformsOf(mode7);
    expect(u.uHorizon).toBe(PLAYFIELD_Y + 100);
    expect(u.uBottom).toBe(PLAYFIELD_Y + 200);
    expect(u.uHeight).toBe(34);
    expect(u.uFogDepth).toBe(220);
    expect(u.uAlpha).toBe(1);
    // `originU` goes down the forward axis (uOrigin.y), `originV` sideways (uOrigin.x).
    expect([...u.uOrigin]).toEqual([-4, 12]);
    // turn 0: the axes are the unit axes.
    expect([...u.uRight]).toEqual([1, -0]);
    expect([...u.uForward]).toEqual([0, 1]);
    // The fog colour is split into RGB units.
    expect([...u.uFog].map((c) => Math.round(c * 255))).toEqual([0x20, 0x12, 0x4a]);
    mode7.destroy();
  });

  it('takes the turned axes from the core angle tables, never trigonometry', () => {
    const mode7 = createMode7Shader({} as Pixi.TextureSource, 384, 216);
    const u = uniformsOf(mode7);
    for (const turn of [0, 64, 256, 511, MODE7_ANGLE_UNITS - 1]) {
      mode7.apply(view({ turn }), 0, 0);
      expect([...u.uRight]).toEqual([cosB(turn), -sinB(turn)]);
      expect([...u.uForward]).toEqual([sinB(turn), cosB(turn)]);
      // A unit vector either way (the plane is rotated, never scaled).
      expect(u.uRight[0] ** 2 + u.uRight[1] ** 2).toBeCloseTo(1, 4);
    }
    expect(MODE7_ANGLE_UNITS).toBe(1024);
    mode7.destroy();
  });
});

describe('render-pixi/effects Mode-7 floor (M3-02)', () => {
  it('draws nothing for a stage without a floor', () => {
    const layer = new Container();
    const fake = fakeShader();
    const floor = createMode7Floor({ layer, createShader: () => fake });
    // Nothing is even created until a world with a floor is bound (M3-02d).
    expect(layer.children).toHaveLength(0);
    expect(floor.view).toBeNull();
    floor.bind(null, [0, 0, 8, 8, 64, 64]);
    floor.sync(camera(10));
    expect(floor.active).toBe(false);
    expect(floor.shader).toBeNull();
    expect(floor.view).toBeNull();
    expect(fake.applied).toEqual([]);
    floor.destroy();
  });

  it('draws nothing when the atlas has no tile, or the view has no sprite', () => {
    for (const [v, tile] of [
      [view(), null],
      [view({ spriteId: -1 }), [0, 0, 8, 8, 64, 64]],
    ] as Array<[Mode7View, number[] | null]>) {
      const fake = fakeShader();
      const floor = createMode7Floor({ layer: new Container(), createShader: () => fake });
      floor.bind(v, tile);
      floor.sync(camera(0));
      expect(floor.active).toBe(false);
      expect(fake.tiles).toEqual([]);
      floor.destroy();
    }
  });

  it('binds the tile once and draws the mesh only inside the floor range', () => {
    const layer = new Container();
    const fake = fakeShader();
    const floor = createMode7Floor({ layer, createShader: () => fake });
    floor.bind(view({ from: 100, to: 300 }), [16, 8, 32, 32, 512, 256]);
    expect(fake.tiles).toEqual([[16, 8, 32, 32, 512, 256]]);
    expect(floor.shader).toBe(fake);
    expect(floor.view).toBe(fake.mesh);
    // Before the range: hidden, nothing applied — and never a filter on the layer (review F6).
    floor.sync(camera(99));
    expect(floor.active).toBe(false);
    expect(fake.mesh.visible).toBe(false);
    expect(layer.filters ?? []).toEqual([]);
    expect(fake.applied).toHaveLength(0);
    // Inside: drawn, the origin from the camera.
    floor.sync(camera(120, 40));
    expect(floor.active).toBe(true);
    expect(fake.mesh.visible).toBe(true);
    expect(fake.applied.at(-1)?.slice(1)).toEqual([120 * 0.5, 40 * 0.25]);
    // Past it: hidden again, and back when the camera returns (a vertical section).
    floor.sync(camera(300));
    expect(floor.active).toBe(false);
    expect(fake.mesh.visible).toBe(false);
    floor.sync(camera(299));
    expect(floor.active).toBe(true);
    expect(fake.mesh.visible).toBe(true);
    floor.destroy();
    expect(fake.destroyed).toBe(1);
    expect(floor.active).toBe(false);
  });

  it('covers the whole frame and sits under everything on its layer', () => {
    const layer = new Container();
    const other = new Container();
    layer.addChild(other);
    const sizes: Array<[number, number]> = [];
    /**
     * A fake shader that records the frame size the floor asked for.
     *
     * @param w - Frame width.
     * @param h - Frame height.
     * @returns The fake.
     */
    const sizing = (w: number, h: number): Mode7Shader => {
      sizes.push([w, h]);
      return fakeShader();
    };
    const floor = createMode7Floor({ layer, createShader: sizing });
    floor.bind(view(), [0, 0, 8, 8, 64, 64]);
    expect(layer.children[0]).toBe(floor.view);
    expect(layer.children[1]).toBe(other);
    expect(sizes).toEqual([[PLAYFIELD_W, PLAYFIELD_Y * 2 + PLAYFIELD_H]]);
    const sized = createMode7Floor({ layer, width: 320, height: 180, createShader: sizing });
    sized.bind(view(), [0, 0, 8, 8, 64, 64]);
    expect(sizes.at(-1)).toEqual([320, 180]);
    floor.destroy();
    sized.destroy();
  });

  it('a frame inside the range allocates nothing (plan §1.3)', () => {
    // A filter that records nothing: the recording fake would allocate itself.
    const quiet: Mode7Shader = {
      mesh: new Container() as unknown as Mode7Shader['mesh'],
      apply() {},
      setTile() {},
      destroy() {},
    };
    const floor = createMode7Floor({ layer: new Container(), createShader: () => quiet });
    floor.bind(view(), [0, 0, 32, 32, 256, 256]);
    const cam = { x: 0, y: 0 };
    const { bytes } = measureHeapGrowth(
      (i) => {
        // The camera walks forward as it does in play; its row cycles inside the playfield.
        cam.x = i;
        cam.y = i % 216;
        floor.sync(cam);
      },
      20_000,
      40_000,
    );
    expect(bytes).toBeLessThan(16 * 1024);
    floor.destroy();
  });
});
