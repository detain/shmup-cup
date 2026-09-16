/**
 * The **pass-2 blit** of plan M3-02d (`createCrtBlit`) on its own — `crt.test.ts` drives it
 * through {@link createCrtPass} with a fake; this file builds the real one (with PixiJS's
 * `GlProgram.from` faked, since the real one probes a WebGL context for the GPU's precision) and
 * pins what the frame is actually drawn with:
 *
 * - the **quad** is the frame's own `width × height` at the origin with `0 … 1` UVs, so placing
 *   and scaling the mesh is the whole of "where the picture goes" (decision D19: the mesh is
 *   never sub-pixel-positioned by its own geometry);
 * - its **indices are a `Uint32Array`**, which is what `MeshGeometry` takes — so both of this
 *   step's meshes need WebGL1's `OES_element_index_uint`. Pixi requests the extension and it is
 *   effectively universal (the TV's Mali-G51 has it), but it is a dependency M3-02d introduced
 *   and this test is where it is written down;
 * - `uInputClamp` is the frame texture's own half-texel inset, so the blit can never sample
 *   outside the picture;
 * - `apply` writes the picture's **centre and half-size** (the `vec4 uHalf` of M3-02d), which is
 *   what lets the vignette follow a letterboxed or pillarboxed picture — the legacy filter's
 *   `apply`, which runs over the whole display, still writes the old display-centred pair;
 * - a size of zero never divides by zero, and writing a frame's uniforms allocates nothing.
 */
import { Texture, type UniformGroup } from 'pixi.js';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';
import {
  CRT_FRAGMENT,
  CRT_LOOKS,
  CRT_MIN_PITCH,
  EFFECT_MESH_VERTEX,
  createCrtBlit,
  createCrtFilter,
  type CrtBlitHandle,
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

/** The uniform fields the blit writes. */
interface BlitUniforms {
  uHalf: Float32Array;
  uLinePitch: number;
  uScan: number;
  uMask: number;
  uVignette: number;
  uInputClamp: Float32Array;
}

/**
 * The blit's uniform group.
 *
 * @param blit - The blit.
 * @returns Its uniforms.
 */
function uniformsOf(blit: CrtBlitHandle): BlitUniforms {
  const group = blit.mesh.shader?.resources.crtUniforms as UniformGroup;
  return group.uniforms as unknown as BlitUniforms;
}

describe('render-pixi/effects the pass-2 blit (M3-02d)', () => {
  it('is a frame-sized quad carrying the CRT program over the frame texture', () => {
    const before = programs.length;
    const blit = createCrtBlit(Texture.WHITE, 384, 216);
    expect(programs.slice(before)).toEqual([
      { vertex: EFFECT_MESH_VERTEX, fragment: CRT_FRAGMENT, name: 'shmup-crt-blit' },
    ]);
    // The quad is the frame's own size at the origin: the renderer places it, the geometry never
    // does (a fractional vertex would blur the picture — decision D19).
    expect([...blit.mesh.geometry.positions]).toEqual([0, 0, 384, 0, 384, 216, 0, 216]);
    expect([...blit.mesh.geometry.uvs]).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    expect(blit.mesh.texture).toBe(Texture.WHITE);
    expect(blit.mesh.shader?.resources.uTexture).toBe(Texture.WHITE.source);
    expect(blit.mesh.label).toBe('crt-blit');
    blit.destroy();
  });

  it('draws two triangles indexed by a Uint32Array — WebGL1 needs OES_element_index_uint', () => {
    // `MeshGeometry` takes `Uint32Array` indices and nothing else (pixi.js 8.20.1), so every mesh
    // M3-02d added depends on WebGL1's `OES_element_index_uint`. Pixi asks for the extension in
    // `GlContextSystem` and reports `supports.uint32Indices`; every GPU the game targets has it
    // (the TV's Mali-G51 included), but this is the dependency the fold introduced — if it ever
    // has to go, these two meshes are what change. `test/e2e/mode7.spec.ts` asserts the real
    // browser context offers it.
    const blit = createCrtBlit(Texture.WHITE, 384, 216);
    const indices = blit.mesh.geometry.indices;
    expect(indices).toBeInstanceOf(Uint32Array);
    expect([...indices]).toEqual([0, 1, 2, 0, 2, 3]);
    // Two triangles sharing the 0–2 diagonal: four vertices, six indices, one draw call.
    expect(blit.mesh.geometry.positions).toHaveLength(8);
    blit.destroy();
  });

  it('clamps sampling to the frame texture’s own half texel', () => {
    const blit = createCrtBlit(Texture.WHITE, 384, 216);
    const clamp = [...uniformsOf(blit).uInputClamp];
    // A `Float32Array`, so the check is to single precision.
    expect(clamp[0]).toBeCloseTo(0.5 / 384, 7);
    expect(clamp[1]).toBeCloseTo(0.5 / 216, 7);
    expect(clamp[2]).toBeCloseTo(383.5 / 384, 7);
    expect(clamp[3]).toBeCloseTo(215.5 / 216, 7);
    // Every component stays inside the texture, low edge below high edge.
    expect(clamp[0]).toBeGreaterThan(0);
    expect(clamp[2]).toBeLessThan(1);
    expect(clamp[0]).toBeLessThan(clamp[2]);
    expect(clamp[1]).toBeLessThan(clamp[3]);
    blit.destroy();
  });

  it('survives a degenerate frame size instead of dividing by zero', () => {
    for (const [w, h] of [
      [0, 0],
      [-4, 216],
      [384, -1],
      [Number.NaN, Number.NaN],
    ]) {
      const blit = createCrtBlit(Texture.WHITE, w, h);
      const width = w > 0 ? w : 1;
      const height = h > 0 ? h : 1;
      expect([...blit.mesh.geometry.positions]).toEqual([0, 0, width, 0, width, height, 0, height]);
      for (const value of uniformsOf(blit).uInputClamp) expect(Number.isFinite(value)).toBe(true);
      blit.destroy();
    }
  });

  it('starts with the look off, so `off` is a plain upscale and not a second program', () => {
    const blit = createCrtBlit(Texture.WHITE, 384, 216);
    const u = uniformsOf(blit);
    expect([u.uScan, u.uMask, u.uVignette]).toEqual([0, 0, 0]);
    expect(u.uLinePitch).toBe(CRT_MIN_PITCH);
    // `off` written explicitly is the same three zeroes: one program, whatever the setting.
    blit.apply(CRT_LOOKS[0], 5, 0, 0, 1920, 1080);
    expect([u.uScan, u.uMask, u.uVignette]).toEqual([0, 0, 0]);
    blit.destroy();
  });

  it('centres the look on the picture, not on the display (the vec4 uHalf of M3-02d)', () => {
    const blit = createCrtBlit(Texture.WHITE, 384, 216);
    const u = uniformsOf(blit);
    // Filling a 1920×1080 display: centre and half-size are the same numbers as before M3-02d.
    blit.apply(CRT_LOOKS[2], 5, 0, 0, 1920, 1080);
    expect([...u.uHalf]).toEqual([960, 540, 960, 540]);
    expect([u.uScan, u.uMask, u.uVignette]).toEqual([
      CRT_LOOKS[2].scan,
      CRT_LOOKS[2].mask,
      CRT_LOOKS[2].vignette,
    ]);
    // Pillarboxed (`classic` on a 1152×648 display): the picture is 768×432 at (192, 108), so the
    // vignette is centred on it and reaches full strength at *its* corners.
    blit.apply(CRT_LOOKS[2], 2, 192, 108, 768, 432);
    expect([...u.uHalf]).toEqual([576, 324, 384, 216]);
    // Letterboxed with an off-centre origin: the centre follows the picture both ways.
    blit.apply(CRT_LOOKS[1], 3, 40, 300, 600, 300);
    expect([...u.uHalf]).toEqual([340, 450, 300, 150]);
    blit.destroy();
  });

  it('keeps the legacy filter’s display-centred pair, which is why the blit needed its own', () => {
    // The filter runs over the whole second pass, so its `apply` still takes only a size and
    // centres on the display's own middle (`crt.ts`) — this is exactly where the two paths differ.
    const filter = createCrtFilter();
    const group = filter.filter.resources.crtUniforms as UniformGroup;
    const u = group.uniforms as unknown as BlitUniforms;
    filter.apply(CRT_LOOKS[2], 2, 768, 432);
    expect([...u.uHalf]).toEqual([384, 216, 384, 216]);
    filter.destroy();
  });

  it('clamps the scanline pitch and never lets a zero-sized picture divide by zero', () => {
    const blit = createCrtBlit(Texture.WHITE, 384, 216);
    const u = uniformsOf(blit);
    for (const pitch of [Number.NaN, -1, 0, 1, CRT_MIN_PITCH - 0.5]) {
      blit.apply(CRT_LOOKS[1], pitch, 0, 0, 384, 216);
      expect(u.uLinePitch).toBe(CRT_MIN_PITCH);
    }
    blit.apply(CRT_LOOKS[1], 7, 0, 0, 384, 216);
    expect(u.uLinePitch).toBe(7);
    // A zero-sized picture: the half-size falls back to 1, so `d = (vScreen − centre) / half` is
    // finite and the vignette cannot produce a NaN colour.
    blit.apply(CRT_LOOKS[2], 4, 0, 0, 0, 0);
    expect([...u.uHalf]).toEqual([0, 0, 1, 1]);
    blit.destroy();
  });

  it('writes a frame’s uniforms without allocating (plan §1.3)', () => {
    const blit = createCrtBlit(Texture.WHITE, 384, 216);
    const { bytes } = measureHeapGrowth(
      (i) => {
        blit.apply(CRT_LOOKS[i & 1 ? 2 : 1], 3 + (i & 3), i & 7, i & 3, 1152, 648);
      },
      20_000,
      40_000,
    );
    expect(bytes).toBeLessThan(16 * 1024);
    blit.destroy();
  });

  it('destroy() frees the mesh, its geometry and its shader', () => {
    const blit = createCrtBlit(Texture.WHITE, 384, 216);
    const geometry = blit.mesh.geometry;
    const shader = blit.mesh.shader;
    blit.destroy();
    expect(blit.mesh.destroyed).toBe(true);
    // Pixi nulls a destroyed geometry's attributes and a destroyed shader's resources and its
    // `glProgram` — the GL program M3-02d added is released with the pass, not leaked.
    expect(geometry.attributes).toBeNull();
    expect(shader?.resources).toBeNull();
    expect(shader?.glProgram).toBeNull();
    // The frame texture is the renderer's, not the blit's: it survives.
    expect(Texture.WHITE.source.destroyed).toBe(false);
  });
});
