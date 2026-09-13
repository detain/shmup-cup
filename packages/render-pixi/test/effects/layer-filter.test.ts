/**
 * The layer-effect filter itself (plan M2-08, `createLayerEffectFilter`) — built in Node with
 * PixiJS's `GlProgram.from` faked (the real one probes a WebGL context for the GPU's precision):
 * the program gets the GLSL ES 1.0 sources, the offset table is a neutral 1 × rows RGBA8 texture
 * sampled nearest with clamped edges and uploaded as-is, the uniforms the shader declares are the
 * ones the effect sets, `apply` writes them and re-uploads only a changed table, `destroy` frees
 * the texture.
 *
 * Plus a JavaScript port of the fragment shader's arithmetic (the raster lookup's wrap and the
 * palette match), checked against what the table and colour pairs are meant to do.
 */
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import {
  LAYER_EFFECT_FRAGMENT,
  LAYER_EFFECT_MAX_COLORS,
  LAYER_EFFECT_ROWS,
  LAYER_EFFECT_VERTEX,
  createLayerEffectFilter,
} from '../../src/effects/index.js';
import { writeColorUnit } from '../../src/palette/index.js';

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

/** The uniform group the filter carries (the fields the effect sets). */
interface Uniforms {
  uRows: number;
  uRaster: number;
  uRowShift: number;
  uCycleCount: number;
  uCycleFrom: Float32Array;
  uCycleTo: Float32Array;
}

/**
 * The filter's resources.
 *
 * @param filter - The filter.
 * @returns The table texture source and the uniforms.
 */
function resources(filter: Pixi.Filter): { table: Pixi.BufferImageSource; uniforms: Uniforms } {
  const res = filter.resources as Record<string, unknown>;
  const group = res.layerEffectUniforms as { uniforms: Uniforms };
  return { table: res.uRasterTable as Pixi.BufferImageSource, uniforms: group.uniforms };
}

describe('render-pixi/effects createLayerEffectFilter', () => {
  it('builds the GLSL ES 1.0 program and a neutral 1 × rows RGBA8 table texture', () => {
    const effect = createLayerEffectFilter();
    const program = programs[programs.length - 1];
    expect(program).toEqual({
      vertex: LAYER_EFFECT_VERTEX,
      fragment: LAYER_EFFECT_FRAGMENT,
      name: 'shmup-layer-effect',
    });
    expect(program.fragment).not.toContain('#version');
    const { table } = resources(effect.filter);
    expect(table.resource).toBe(effect.bytes);
    expect([table.width, table.height, table.format]).toEqual([1, LAYER_EFFECT_ROWS, 'rgba8unorm']);
    expect([table.scaleMode, table.addressMode, table.autoGenerateMipmaps]).toEqual([
      'nearest',
      'clamp-to-edge',
      false,
    ]);
    // Its alpha channel is data: uploaded as-is, never multiplied into the colour.
    expect(table.alphaMode).toBe('premultiplied-alpha');
    expect(effect.bytes).toHaveLength(LAYER_EFFECT_ROWS * 4);
    for (let row = 0; row < LAYER_EFFECT_ROWS; row++) {
      expect([...effect.bytes.slice(row * 4, row * 4 + 4)]).toEqual([128, 0, 0, 0]);
    }
    expect(effect.table.rows).toBe(LAYER_EFFECT_ROWS);
    expect([effect.filter.resolution, effect.filter.antialias]).toEqual([1, 'off']);
  });

  it('sets the uniforms the shader declares, sized to its colour arrays', () => {
    const effect = createLayerEffectFilter(40);
    const { uniforms } = resources(effect.filter);
    expect(Object.keys(uniforms).sort()).toEqual(
      ['uCycleCount', 'uCycleFrom', 'uCycleTo', 'uRaster', 'uRowShift', 'uRows'].sort(),
    );
    for (const name of Object.keys(uniforms)) {
      expect(LAYER_EFFECT_FRAGMENT).toMatch(new RegExp(`uniform (float|vec3) ${name}\\b`));
    }
    expect(uniforms.uRows).toBe(40);
    expect(uniforms.uCycleFrom).toBe(effect.cycleFrom);
    expect(uniforms.uCycleTo).toBe(effect.cycleTo);
    expect(effect.cycleFrom).toHaveLength(LAYER_EFFECT_MAX_COLORS * 3);
    expect(effect.bytes).toHaveLength(160);
    // The table texture is bound under the sampler name the shader reads.
    expect(LAYER_EFFECT_FRAGMENT).toContain('uniform sampler2D uRasterTable;');
  });

  it('writes the frame state and re-uploads only a changed table; destroy frees the texture', () => {
    const effect = createLayerEffectFilter();
    const { table, uniforms } = resources(effect.filter);
    const update = vi.spyOn(table, 'update');
    effect.apply(true, 3, -2, true);
    expect([uniforms.uRaster, uniforms.uCycleCount, uniforms.uRowShift]).toEqual([1, 3, -2]);
    expect(update).toHaveBeenCalledTimes(1);
    effect.apply(false, 0, 0, false);
    expect([uniforms.uRaster, uniforms.uCycleCount, uniforms.uRowShift]).toEqual([0, 0, 0]);
    expect(update).toHaveBeenCalledTimes(1);
    const destroy = vi.spyOn(table, 'destroy');
    effect.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('refuses a table without rows', () => {
    expect(() => createLayerEffectFilter(0)).toThrow(RangeError);
  });
});

/**
 * The fragment shader's raster lookup in JavaScript: where a fragment at frame pixel `x` samples
 * the layer (`LAYER_EFFECT_FRAGMENT`, before the clamp).
 *
 * @param x - The fragment's x in frame pixels (a pixel centre, `i + 0.5`).
 * @param offset - The row's offset.
 * @param period - The row's wrap period (0 = none).
 * @param width - The output frame's width.
 * @returns The sampled x.
 */
function sampleX(x: number, offset: number, period: number, width: number): number {
  let s = x + offset;
  if (period > 0.5) {
    if (s >= width) s -= period * (Math.floor((s - width) / period) + 1);
    if (s < 0) s += period * (Math.floor(-s / period) + 1);
  }
  return s;
}

describe('render-pixi/effects layer shader arithmetic (a JavaScript port)', () => {
  it('samples `offset` pixels to the right; wrapped, a sample stays on screen and in phase', () => {
    const width = 384;
    const failures: string[] = [];
    for (const period of [1, 16, 48, 64, 128, 384]) {
      for (let offset = -2047; offset <= 2047; offset += 13) {
        for (let i = 0; i < width; i += 7) {
          const x = i + 0.5;
          const s = sampleX(x, offset, period, width);
          const k = (s - (x + offset)) / period;
          if (!(s >= 0 && s < width) || Math.abs(k - Math.round(k)) > 1e-9) {
            failures.push(`period ${period} offset ${offset} x ${x} → ${s}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
    // No wrap: the plain shift (clamped by the shader at the input's edges).
    expect(sampleX(10.5, 5, 0, 384)).toBe(15.5);
    expect(sampleX(380.5, 20, 0, 384)).toBe(400.5);
    expect(sampleX(3.5, -10, 0, 384)).toBe(-6.5);
  });

  it('recolours exactly the ramp colours: the match tolerance lets 1 per channel through, not 2', () => {
    const from = new Float32Array(3);
    writeColorUnit(0x3474bc, from, 0);
    const threshold = Number(/\) < ([0-9.]+)\)/.exec(LAYER_EFFECT_FRAGMENT)?.[1]);
    expect(threshold).toBeCloseTo(1.5 / 255, 4);
    /**
     * Whether the shader's test matches an opaque pixel of a colour with the key.
     *
     * @param color - The pixel colour.
     * @returns The match.
     */
    const matches = (color: number): boolean => {
      const r = ((color >> 16) & 255) / 255;
      const g = ((color >> 8) & 255) / 255;
      const b = (color & 255) / 255;
      return (
        Math.max(Math.abs(r - from[0]), Math.abs(g - from[1]), Math.abs(b - from[2])) < threshold
      );
    };
    expect(matches(0x3474bc)).toBe(true);
    expect(matches(0x3574bc)).toBe(true);
    expect(matches(0x3373bd)).toBe(true);
    expect(matches(0x3674bc)).toBe(false);
    expect(matches(0x3474be)).toBe(false);
  });
});
