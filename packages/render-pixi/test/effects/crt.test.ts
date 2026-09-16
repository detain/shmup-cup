/**
 * The **CRT / scanline pass** of plan M3-02 and its M3-02d rewrite (`createCrtBlit`,
 * `createCrtFilter`, `createCrtPass`, `crtResolution`), built in Node with PixiJS's
 * `GlProgram.from` faked (the real one probes a WebGL context for the GPU's precision):
 *
 * - the **blit** (the shipped path since M3-02d, the render review's **F2**) is a `Mesh` over the
 *   frame texture carrying the CRT program: it is always drawn, `off` just writes three zero
 *   uniforms, and no filter is ever attached to the screen container — so CRT `full` costs what
 *   CRT `off` costs;
 * - the legacy **filter** still gets the GLSL ES 1.0 sources and declares the uniforms the shader
 *   reads; `apply` writes a look, clamps the scanline pitch and halves the output size for the
 *   vignette;
 * - the pass places the frame quad, follows the viewport with the scanline pitch and, in `filter`
 *   mode, builds nothing until the setting leaves `off`, attaches the filter and detaches again;
 * - the legacy filter's resolution is capped at 1080 rows, so a 4K TV pays for a 1080p pass
 *   (shmup_feat.md §18).
 */
import { CRT_FILTERS, CRT_MAX_HEIGHT } from '@shmup/core';
import { Container, Texture, type Filter } from 'pixi.js';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import {
  CRT_FRAGMENT,
  CRT_FULL_MASK,
  CRT_FULL_SCAN,
  CRT_FULL_VIGNETTE,
  CRT_LIGHT_SCAN,
  CRT_LOOKS,
  CRT_MIN_PITCH,
  CRT_VERTEX,
  EFFECT_MESH_VERTEX,
  createCrtFilter,
  createCrtPass,
  crtResolution,
  type CrtBlitHandle,
  type CrtFilterHandle,
  type CrtLook,
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

/** The uniform fields the CRT filter writes. */
interface Uniforms {
  uHalf: Float32Array;
  uLinePitch: number;
  uScan: number;
  uMask: number;
  uVignette: number;
}

/**
 * The filter's uniform group.
 *
 * @param filter - The filter.
 * @returns Its uniforms.
 */
function uniformsOf(filter: Filter): Uniforms {
  const group = filter.resources.crtUniforms as Pixi.UniformGroup;
  return group.uniforms as unknown as Uniforms;
}

/** A fake filter handle that records what the pass asks of it. */
interface FakeFilter extends CrtFilterHandle {
  /** Every `apply` call. */
  readonly applied: Array<[CrtLook, number, number, number]>;
  /** Every `setDisplayHeight` call. */
  readonly heights: number[];
  /** Times `destroy` was called. */
  destroyed: number;
}

/**
 * Builds a fake filter handle.
 *
 * @returns The handle.
 */
function fakeFilter(): FakeFilter {
  const fake: FakeFilter = {
    filter: { enabled: true } as unknown as Filter,
    applied: [],
    heights: [],
    destroyed: 0,
    apply(look, pitch, width, height) {
      fake.applied.push([look, pitch, width, height]);
    },
    setDisplayHeight(height) {
      fake.heights.push(height);
    },
    destroy() {
      fake.destroyed++;
    },
  };
  return fake;
}

/** A fake blit that records what the pass asks of it. */
interface FakeBlit extends CrtBlitHandle {
  /** Every `apply` call: look, pitch, x, y, width, height. */
  readonly applied: Array<[CrtLook, number, number, number, number, number]>;
  /** Times `destroy` was called. */
  destroyed: number;
}

/**
 * Builds a fake blit (a plain container stands in for the mesh).
 *
 * @returns The blit.
 */
function fakeBlit(): FakeBlit {
  const fake: FakeBlit = {
    mesh: new Container() as unknown as CrtBlitHandle['mesh'],
    applied: [],
    destroyed: 0,
    apply(look, pitch, x, y, width, height) {
      fake.applied.push([look, pitch, x, y, width, height]);
    },
    destroy() {
      fake.destroyed++;
    },
  };
  return fake;
}

describe('render-pixi/effects CRT looks (M3-02)', () => {
  it('has one look per core CRT setting: nothing, scanlines, the full tube', () => {
    expect(CRT_FILTERS).toEqual(['off', 'light', 'full']);
    expect(CRT_LOOKS).toHaveLength(CRT_FILTERS.length);
    expect(CRT_LOOKS[0]).toEqual({ scan: 0, mask: 0, vignette: 0 });
    expect(CRT_LOOKS[1]).toEqual({ scan: CRT_LIGHT_SCAN, mask: 0, vignette: 0 });
    expect(CRT_LOOKS[2]).toEqual({
      scan: CRT_FULL_SCAN,
      mask: CRT_FULL_MASK,
      vignette: CRT_FULL_VIGNETTE,
    });
  });

  it('caps the legacy filter pass at 1080 rows however big the display is', () => {
    expect(CRT_MAX_HEIGHT).toBe(1080);
    for (const height of [0, -1, 216, 720, 1080]) expect(crtResolution(height)).toBe(1);
    expect(crtResolution(2160)).toBe(0.5);
    expect(crtResolution(1440)).toBeCloseTo(0.75, 10);
    for (const height of [1081, 1440, 2160, 4320]) {
      expect(height * crtResolution(height)).toBeCloseTo(CRT_MAX_HEIGHT, 6);
    }
    expect(crtResolution(Number.NaN)).toBe(1);
  });
});

describe('render-pixi/effects CRT filter — the legacy pass-2 path (M3-02)', () => {
  it('is built from the GLSL ES 1.0 sources, off by default', () => {
    const before = programs.length;
    const crt = createCrtFilter();
    expect(programs.slice(before)).toEqual([
      { vertex: CRT_VERTEX, fragment: CRT_FRAGMENT, name: 'shmup-crt' },
    ]);
    const u = uniformsOf(crt.filter);
    expect([u.uScan, u.uMask, u.uVignette]).toEqual([0, 0, 0]);
    expect(u.uLinePitch).toBe(CRT_MIN_PITCH);
    crt.destroy();
  });

  it('writes a look, the pitch, the picture centre and half the output size', () => {
    const crt = createCrtFilter();
    crt.apply(CRT_LOOKS[2], 5, 1920, 1080);
    const u = uniformsOf(crt.filter);
    expect([u.uScan, u.uMask, u.uVignette]).toEqual([
      CRT_FULL_SCAN,
      CRT_FULL_MASK,
      CRT_FULL_VIGNETTE,
    ]);
    expect(u.uLinePitch).toBe(5);
    expect([...u.uHalf]).toEqual([960, 540, 960, 540]);
    // A pitch below two output pixels would eat half the picture; a zero size would divide by 0.
    crt.apply(CRT_LOOKS[1], 1, 0, 0);
    expect(u.uLinePitch).toBe(CRT_MIN_PITCH);
    expect([...u.uHalf]).toEqual([0, 0, 1, 1]);
    expect([u.uScan, u.uMask]).toEqual([CRT_LIGHT_SCAN, 0]);
    crt.destroy();
  });

  it('runs at a capped resolution', () => {
    const crt = createCrtFilter();
    crt.setDisplayHeight(1080);
    expect(crt.filter.resolution).toBe(1);
    crt.setDisplayHeight(2160);
    expect(crt.filter.resolution).toBe(0.5);
    crt.destroy();
  });
});

/** Options every pass in these tests shares (the frame texture and its size). */
const frameOptions = { frame: Texture.WHITE, width: 384, height: 216 } as const;

describe('render-pixi/effects CRT pass — the blit (M3-02d)', () => {
  it('draws the frame with the CRT program and never attaches a filter', () => {
    const screen = new Container();
    const blit = fakeBlit();
    const pass = createCrtPass({ screen, ...frameOptions, createBlit: () => blit });
    expect(pass.mode).toBe('blit');
    expect(pass.view).toBe(blit.mesh);
    expect(screen.children).toEqual([blit.mesh]);
    expect(pass.filter).toBeNull();
    expect(pass.blit).toBe(blit);
    expect(pass.setting).toBe('off');
    expect(pass.active).toBe(false);
    // `off` is not "no pass": the blit still draws, with a zero look.
    pass.setViewport(5, 0, 0, 1920, 1080, 5, 5, 1080);
    expect(blit.applied.at(-1)).toEqual([CRT_LOOKS[0], 5, 0, 0, 1920, 1080]);
    expect(screen.filters ?? []).toEqual([]);
    // The frame quad is placed by the pass, so the renderer has one node to think about.
    expect([blit.mesh.position.x, blit.mesh.position.y]).toEqual([0, 0]);
    expect([blit.mesh.scale.x, blit.mesh.scale.y]).toEqual([5, 5]);
    pass.setSetting('full');
    expect(pass.active).toBe(true);
    expect(blit.applied.at(-1)).toEqual([CRT_LOOKS[2], 5, 0, 0, 1920, 1080]);
    // Still no filter, and therefore no pooled render target and no second pass (review F2).
    expect(screen.filters ?? []).toEqual([]);
    pass.setSetting('off');
    expect(pass.active).toBe(false);
    expect(blit.applied.at(-1)).toEqual([CRT_LOOKS[0], 5, 0, 0, 1920, 1080]);
    pass.destroy();
    expect(blit.destroyed).toBe(1);
  });

  it('places a letterboxed picture and centres the vignette on it', () => {
    const screen = new Container();
    const blit = fakeBlit();
    const pass = createCrtPass({ screen, ...frameOptions, createBlit: () => blit });
    pass.setSetting('full');
    pass.setViewport(3, 144, 36, 1152, 648, 3, 3, 720);
    expect(blit.applied.at(-1)).toEqual([CRT_LOOKS[2], 3, 144, 36, 1152, 648]);
    expect([blit.mesh.position.x, blit.mesh.position.y]).toEqual([144, 36]);
    pass.destroy();
  });

  it('follows the viewport: one dark line between two frame rows, whatever the zoom', () => {
    const screen = new Container();
    const blit = fakeBlit();
    const pass = createCrtPass({ screen, ...frameOptions, createBlit: () => blit });
    pass.setSetting('full');
    for (const [scale, width, height, pitch] of [
      [5, 1920, 1080, 5],
      [3, 1152, 648, 3],
      [3.33, 1280, 720, 3],
      [10, 3840, 2160, 10],
      [1, 384, 216, CRT_MIN_PITCH],
      [0.5, 192, 108, CRT_MIN_PITCH],
    ]) {
      pass.setViewport(scale, 0, 0, width, height, scale, scale, height);
      expect(blit.applied.at(-1)).toEqual([CRT_LOOKS[2], pitch, 0, 0, width, height]);
    }
    pass.destroy();
  });

  it('uses the real blit by default: the mesh vertex shader and the CRT fragment', () => {
    const screen = new Container();
    const before = programs.length;
    const pass = createCrtPass({ screen, ...frameOptions });
    expect(programs.slice(before)).toEqual([
      { vertex: EFFECT_MESH_VERTEX, fragment: CRT_FRAGMENT, name: 'shmup-crt-blit' },
    ]);
    expect(pass.blit).not.toBeNull();
    expect(pass.view).toBe(pass.blit?.mesh);
    // The blit's own uniforms: the look is off, and the clamp is the frame's half-texel inset.
    const group = pass.blit?.mesh.shader?.resources.crtUniforms as Pixi.UniformGroup;
    const u = group.uniforms as unknown as Uniforms & { uInputClamp: Float32Array };
    expect([u.uScan, u.uMask, u.uVignette]).toEqual([0, 0, 0]);
    const clamp = [0.5 / 384, 0.5 / 216, 383.5 / 384, 215.5 / 216];
    for (let i = 0; i < clamp.length; i++) expect(u.uInputClamp[i]).toBeCloseTo(clamp[i], 6);
    pass.setSetting('full');
    expect([u.uScan, u.uMask, u.uVignette]).toEqual([
      CRT_FULL_SCAN,
      CRT_FULL_MASK,
      CRT_FULL_VIGNETTE,
    ]);
    pass.destroy();
  });
});

describe('render-pixi/effects CRT pass — the legacy filter mode (M3-02)', () => {
  it('builds nothing and touches nothing while the setting is off', () => {
    const screen = new Container();
    const fake = fakeFilter();
    const pass = createCrtPass({
      screen,
      ...frameOptions,
      mode: 'filter',
      createFilter: () => fake,
    });
    expect(pass.mode).toBe('filter');
    expect(pass.blit).toBeNull();
    expect(screen.children).toEqual([pass.view]);
    expect(pass.setting).toBe('off');
    expect(pass.active).toBe(false);
    expect(pass.filter).toBeNull();
    pass.setViewport(5, 0, 0, 1920, 1080, 5, 5, 1080);
    expect(pass.filter).toBeNull();
    expect(fake.applied).toEqual([]);
    // Never touched: the screen keeps whatever filter list Pixi gave it (none).
    expect(screen.filters).toBeUndefined();
    pass.setSetting('off');
    expect(pass.filter).toBeNull();
    pass.destroy();
  });

  it('attaches the filter for `light` and `full`, and detaches it again', () => {
    const screen = new Container();
    const fake = fakeFilter();
    const pass = createCrtPass({
      screen,
      ...frameOptions,
      mode: 'filter',
      createFilter: () => fake,
    });
    pass.setViewport(5, 0, 0, 1920, 1080, 5, 5, 1080);
    pass.setSetting('light');
    expect(pass.active).toBe(true);
    expect(pass.filter).toBe(fake);
    expect(screen.filters).toEqual([fake.filter]);
    expect(fake.applied.at(-1)).toEqual([CRT_LOOKS[1], 5, 1920, 1080]);
    expect(fake.heights.at(-1)).toBe(1080);
    pass.setSetting('full');
    expect(fake.applied.at(-1)).toEqual([CRT_LOOKS[2], 5, 1920, 1080]);
    expect(screen.filters).toEqual([fake.filter]);
    pass.setSetting('off');
    expect(pass.active).toBe(false);
    expect(screen.filters).toEqual([]);
    // The handle is kept, so switching back does not build a second program.
    pass.setSetting('full');
    expect(pass.filter).toBe(fake);
    expect(screen.filters).toEqual([fake.filter]);
    pass.destroy();
    expect(fake.destroyed).toBe(1);
    expect(pass.active).toBe(false);
    expect(screen.filters).toEqual([]);
  });

  it('places its node at the same pixels whichever path draws the frame (M3-02d)', () => {
    // The renderer hands the pass one viewport and the pass places whatever node draws the frame.
    // Nothing shipped can select `filter`, so no browser exercises it — but the one thing that
    // *must* match between the two paths is where the picture lands, and that is asserted here:
    // the blit mesh and M3-02's `Sprite` are placed and scaled identically, and for a picture
    // that fills the display the look they are handed is the same one too.
    for (const viewport of [
      [3, 0, 0, 1152, 648, 3, 3, 648],
      [2, 192, 108, 768, 432, 2, 2, 648],
      [2, 192, 138, 768, 432, 2, 2, 720],
      [5, 0, 0, 1920, 1080, 5, 5, 1080],
    ] as Array<[number, number, number, number, number, number, number, number]>) {
      const blit = fakeBlit();
      const filter = fakeFilter();
      const withBlit = createCrtPass({
        screen: new Container(),
        ...frameOptions,
        createBlit: () => blit,
      });
      const withFilter = createCrtPass({
        screen: new Container(),
        ...frameOptions,
        mode: 'filter',
        createFilter: () => filter,
      });
      withBlit.setSetting('full');
      withFilter.setSetting('full');
      withBlit.setViewport(...viewport);
      withFilter.setViewport(...viewport);
      expect([withBlit.view.position.x, withBlit.view.position.y]).toEqual([
        withFilter.view.position.x,
        withFilter.view.position.y,
      ]);
      expect([withBlit.view.scale.x, withBlit.view.scale.y]).toEqual([
        withFilter.view.scale.x,
        withFilter.view.scale.y,
      ]);
      // Same look, same scanline pitch.
      expect(blit.applied.at(-1)?.[0]).toBe(filter.applied.at(-1)?.[0]);
      expect(blit.applied.at(-1)?.[1]).toBe(filter.applied.at(-1)?.[1]);
      // Both are told the picture's size; only the blit is told where it starts, which is the
      // whole of the `vec4 uHalf` change (the filter runs over the display and centres on it).
      const applied = blit.applied.at(-1) as [unknown, number, number, number, number, number];
      expect(filter.applied.at(-1)?.slice(2)).toEqual([applied[4], applied[5]]);
      expect([applied[2], applied[3]]).toEqual([viewport[1], viewport[2]]);
      withBlit.destroy();
      withFilter.destroy();
    }
  });

  it('uses the real filter when none is given', () => {
    const screen = new Container();
    const pass = createCrtPass({ screen, ...frameOptions, mode: 'filter' });
    pass.setSetting('light');
    expect(pass.filter).not.toBeNull();
    expect(screen.filters).toEqual([pass.filter?.filter]);
    pass.destroy();
  });
});
