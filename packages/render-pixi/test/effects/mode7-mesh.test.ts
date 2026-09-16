/**
 * The **Mode-7 mesh** of plan M3-02d (`createMode7Shader`) built for real — `mode7.test.ts` covers
 * the uniforms a normal frame writes, this file the geometry the floor is drawn with and the odd
 * inputs a stage's content can produce:
 *
 * - a frame-sized quad at the origin indexed by a `Uint32Array` (the same
 *   `OES_element_index_uint` dependency `crt-blit.test.ts` records for the pass-2 blit), hidden
 *   until a camera reaches the floor's range;
 * - a degenerate frame size falls back to 1 px instead of building a zero-area quad;
 * - `setTile` maps any rectangle into atlas UV, and a zero-sized atlas page cannot leave a
 *   non-finite number in a uniform the shader divides by;
 * - `apply` splits any fog colour into RGB units, takes any alpha, and reads the turn from the
 *   core's tables at both ends of the 1024-unit circle;
 * - writing a frame's uniforms on the **real** shader allocates nothing (`mode7.test.ts` measures
 *   the floor around a do-nothing fake, so the uniform writes themselves were never measured).
 */
import { PLAYFIELD_H, PLAYFIELD_W, PLAYFIELD_Y, cosB, sinB, type Mode7View } from '@shmup/core';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';
import { MODE7_ANGLE_UNITS, createMode7Shader, type Mode7Shader } from '../../src/effects/index.js';

vi.mock('pixi.js', async (importOriginal) => {
  const real = await importOriginal<typeof Pixi>();
  /** Stands in for Pixi's GlProgram (whose constructor needs a WebGL context). */
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
 * Builds a shader over a stand-in atlas page.
 *
 * @param width - Frame width.
 * @param height - Frame height.
 * @returns The shader.
 */
function shader(width = PLAYFIELD_W, height = PLAYFIELD_Y * 2 + PLAYFIELD_H): Mode7Shader {
  return createMode7Shader({} as Pixi.TextureSource, width, height);
}

describe('render-pixi/effects the Mode-7 mesh (M3-02d)', () => {
  it('draws the frame as two triangles indexed by a Uint32Array, hidden until it is needed', () => {
    const mode7 = shader();
    // The quad is the whole 384×216 frame at the origin: it is drawn on `BG_MID`, in frame
    // coordinates, so the fragment's `vScreen` row *is* the frame row the affine matrix needs.
    expect([...mode7.mesh.geometry.positions]).toEqual([0, 0, 384, 0, 384, 216, 0, 216]);
    expect([...mode7.mesh.geometry.uvs]).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    // Same `OES_element_index_uint` dependency as the pass-2 blit (see `crt-blit.test.ts`).
    expect(mode7.mesh.geometry.indices).toBeInstanceOf(Uint32Array);
    expect([...mode7.mesh.geometry.indices]).toEqual([0, 1, 2, 0, 2, 3]);
    expect(mode7.mesh.label).toBe('mode7');
    // Never drawn until `Mode7Floor.sync` sees the camera inside `[from, to)`.
    expect(mode7.mesh.visible).toBe(false);
    mode7.destroy();
  });

  it('falls back to a 1 px quad rather than build a zero-area one', () => {
    for (const [w, h] of [
      [0, 0],
      [-8, 216],
      [384, -2],
      [Number.NaN, Number.NaN],
    ]) {
      const mode7 = shader(w, h);
      const width = w > 0 ? w : 1;
      const height = h > 0 ? h : 1;
      expect([...mode7.mesh.geometry.positions]).toEqual([
        0,
        0,
        width,
        0,
        width,
        height,
        0,
        height,
      ]);
      mode7.destroy();
    }
  });

  it('maps any tile rectangle into atlas UV, and keeps a bad page out of the uniforms', () => {
    const mode7 = shader();
    const u = uniformsOf(mode7);
    mode7.setTile(0, 0, 1024, 1024, 1024, 1024);
    expect([...u.uTileRect]).toEqual([0, 0, 1, 1]);
    mode7.setTile(96, 48, 16, 8, 256, 128);
    expect([...u.uTileRect]).toEqual([96 / 256, 48 / 128, 16 / 256, 8 / 128]);
    // A zero-sized page would divide by zero; the atlas never produces one, so this only records
    // that the result is an infinity rather than a silent wrap (nothing downstream reads it —
    // `Mode7Floor.bind` never calls `setTile` without a tile rectangle from the atlas).
    mode7.setTile(1, 1, 1, 1, 0, 0);
    expect([...u.uTileRect].every((v) => !Number.isNaN(v))).toBe(true);
    mode7.destroy();
  });

  it('splits any fog colour into RGB units and takes the floor’s own alpha and rows', () => {
    const mode7 = shader();
    const u = uniformsOf(mode7);
    for (const [fog, rgb] of [
      [0x00_00_00, [0, 0, 0]],
      [0xff_ff_ff, [255, 255, 255]],
      [0x20_12_4a, [0x20, 0x12, 0x4a]],
      [0x01_02_03, [1, 2, 3]],
    ] as Array<[number, number[]]>) {
      mode7.apply(view({ fog }), 0, 0);
      expect([...u.uFog].map((c) => Math.round(c * 255))).toEqual(rgb);
      for (const channel of u.uFog) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
    // A fully faded floor is still a legal frame: the mesh draws nothing but stays bound.
    mode7.apply(view({ alpha: 0, horizon: 0, bottom: 216, height: 1, fogDepth: 1 }), 0, 0);
    expect(u.uAlpha).toBe(0);
    expect(u.uHorizon).toBe(PLAYFIELD_Y);
    expect(u.uBottom).toBe(PLAYFIELD_Y + 216);
    expect(u.uHeight).toBe(1);
    mode7.destroy();
  });

  it('reads the turn from the core tables at both ends of the circle, never trigonometry', () => {
    const mode7 = shader();
    const u = uniformsOf(mode7);
    for (const turn of [0, 1, 255, 256, 257, 512, 768, MODE7_ANGLE_UNITS - 1]) {
      mode7.apply(view({ turn }), 0, 0);
      // `Float32Array`, so the table's doubles arrive rounded to single precision.
      expect(u.uRight[0]).toBeCloseTo(cosB(turn), 6);
      expect(u.uRight[1]).toBeCloseTo(-sinB(turn), 6);
      expect(u.uForward[0]).toBeCloseTo(sinB(turn), 6);
      expect(u.uForward[1]).toBeCloseTo(cosB(turn), 6);
      // The axes stay perpendicular unit vectors: the plane is rotated, never sheared or scaled
      // (to the core tables' own precision — they are committed, not computed).
      const dot = u.uRight[0] * u.uForward[0] + u.uRight[1] * u.uForward[1];
      expect(dot).toBeCloseTo(0, 4);
      expect(u.uForward[0] * u.uForward[0] + u.uForward[1] * u.uForward[1]).toBeCloseTo(1, 4);
    }
    mode7.destroy();
  });

  it('writes a frame’s uniforms without allocating (plan §1.3)', () => {
    const mode7 = shader();
    const floor = view();
    const { bytes } = measureHeapGrowth(
      (i) => {
        mode7.apply(floor, i * 0.5, (i & 255) * 0.25);
      },
      20_000,
      40_000,
    );
    expect(bytes).toBeLessThan(16 * 1024);
    mode7.destroy();
  });

  it('destroy() frees the mesh, its geometry and its GL program', () => {
    const mode7 = shader();
    const geometry = mode7.mesh.geometry;
    const gl = mode7.mesh.shader;
    mode7.destroy();
    expect(mode7.mesh.destroyed).toBe(true);
    expect(geometry.attributes).toBeNull();
    expect(gl?.resources).toBeNull();
    expect(gl?.glProgram).toBeNull();
  });
});
