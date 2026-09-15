/**
 * The **CRT / scanline filter** of plan M3-02 (`createCrtFilter`, `createCrtPass`,
 * `crtResolution`), built in Node with PixiJS's `GlProgram.from` faked (the real one probes a
 * WebGL context for the GPU's precision):
 *
 * - the filter gets the GLSL ES 1.0 sources and declares the uniforms the shader reads; `apply`
 *   writes a look, clamps the scanline pitch and halves the output size for the vignette;
 * - the pass builds nothing while the setting is `off`, attaches the filter to the screen the
 *   moment it is not, writes the look of `light` / `full`, follows the viewport and detaches
 *   again;
 * - the resolution is capped at 1080 rows, so a 4K TV pays for a 1080p pass (shmup_feat.md §18).
 */
import { CRT_FILTERS, CRT_MAX_HEIGHT } from '@shmup/core';
import { Container, type Filter } from 'pixi.js';
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
  createCrtFilter,
  createCrtPass,
  crtResolution,
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
      return { ...options };
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

  it('caps the pass at 1080 rows however big the display is', () => {
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

describe('render-pixi/effects CRT filter (M3-02)', () => {
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

  it('writes a look, the pitch and half the output size', () => {
    const crt = createCrtFilter();
    crt.apply(CRT_LOOKS[2], 5, 1920, 1080);
    const u = uniformsOf(crt.filter);
    expect([u.uScan, u.uMask, u.uVignette]).toEqual([
      CRT_FULL_SCAN,
      CRT_FULL_MASK,
      CRT_FULL_VIGNETTE,
    ]);
    expect(u.uLinePitch).toBe(5);
    expect([...u.uHalf]).toEqual([960, 540]);
    // A pitch below two output pixels would eat half the picture; a zero size would divide by 0.
    crt.apply(CRT_LOOKS[1], 1, 0, 0);
    expect(u.uLinePitch).toBe(CRT_MIN_PITCH);
    expect([...u.uHalf]).toEqual([1, 1]);
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

describe('render-pixi/effects CRT pass (M3-02)', () => {
  it('builds nothing and touches nothing while the setting is off', () => {
    const screen = new Container();
    const fake = fakeFilter();
    const pass = createCrtPass({ screen, createFilter: () => fake });
    expect(pass.setting).toBe('off');
    expect(pass.active).toBe(false);
    expect(pass.filter).toBeNull();
    pass.setViewport(5, 1920, 1080, 1080);
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
    const pass = createCrtPass({ screen, createFilter: () => fake });
    pass.setViewport(5, 1920, 1080, 1080);
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

  it('follows the viewport: one dark line between two frame rows, whatever the zoom', () => {
    const screen = new Container();
    const fake = fakeFilter();
    const pass = createCrtPass({ screen, createFilter: () => fake });
    pass.setSetting('full');
    for (const [scale, width, height, display, pitch] of [
      [5, 1920, 1080, 1080, 5],
      [3, 1152, 648, 720, 3],
      [3.33, 1280, 720, 720, 3],
      [10, 3840, 2160, 2160, 10],
      [1, 384, 216, 216, CRT_MIN_PITCH],
      [0.5, 192, 108, 108, CRT_MIN_PITCH],
    ]) {
      pass.setViewport(scale, width, height, display);
      expect(fake.applied.at(-1)).toEqual([CRT_LOOKS[2], pitch, width, height]);
      expect(fake.heights.at(-1)).toBe(display);
    }
    pass.destroy();
  });

  it('uses the real filter by default (the renderer passes none)', () => {
    const screen = new Container();
    const pass = createCrtPass({ screen });
    pass.setSetting('light');
    expect(pass.filter).not.toBeNull();
    expect(screen.filters).toEqual([pass.filter?.filter]);
    pass.destroy();
  });
});
