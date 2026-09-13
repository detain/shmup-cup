/**
 * Edge cases of the raster offset-table builders (plan M2-08), next to `raster.test.ts`: line-band
 * floors with negative factors / cameras, a one-row band, strips cut by the table's edges and
 * strips that do not add up; waves and hazes with a degenerate wavelength or period, their exact
 * formulas and phases; wrap periods set, kept and replaced by the effects on a row; the RGBA8
 * encoding's rounding, clamps and change detection; the shader's decode of every table value and
 * row under the TV GPU's `mediump` precision (IEEE half-float arithmetic).
 */
import { PLAYFIELD_Y, RasterKind, sinB, type RasterEffectView } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  LAYER_EFFECT_ROWS,
  RASTER_MAX_OFFSET,
  addRasterEffect,
  clearRasterTable,
  createRasterTable,
  decodeRasterRow,
  encodeRasterTable,
  stageEffectActive,
} from '../../src/effects/index.js';

/**
 * A camera at an x.
 *
 * @param x - Camera x.
 * @returns The camera.
 */
const cam = (x: number): { x: number; y: number } => ({ x, y: 0 });

/**
 * A raster effect with defaults.
 *
 * @param fields - Fields to set.
 * @returns The effect.
 */
function effect(fields: Partial<RasterEffectView>): RasterEffectView {
  return {
    layer: 1,
    kind: RasterKind.Wave,
    top: 0,
    bottom: 10,
    amplitude: 0,
    wavelength: 32,
    period: 0,
    factorTop: 0,
    factorBottom: 0,
    bands: [],
    wrap: 0,
    from: 0,
    to: Number.POSITIVE_INFINITY,
    ...fields,
  };
}

/**
 * Rounds a number to the nearest IEEE 754 binary16 value (round-half-even) — the arithmetic of a
 * `mediump` float on GPUs that implement it as a half float (the minimum GLSL ES 1.0 allows is
 * a 10-bit mantissa, which binary16 has exactly).
 *
 * @param value - The number.
 * @returns The binary16 value.
 */
function half(value: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  if (abs >= 65520) return sign * Number.POSITIVE_INFINITY;
  // Exponent of the leading bit (subnormals share the smallest normal exponent, -14).
  const exponent = Math.max(-14, Math.floor(Math.log2(abs)));
  const quantum = 2 ** (exponent - 10);
  const scaled = abs / quantum;
  let rounded = Math.round(scaled);
  // Round half to even.
  if (Math.abs(scaled - Math.trunc(scaled) - 0.5) < 1e-12 && rounded % 2 === 1) rounded--;
  return sign * rounded * quantum;
}

/**
 * The fragment shader's decode of one texel, every operation rounded to binary16 (`byteOf` on a
 * channel the texture unit hands over as `byte / 255`).
 *
 * @param bytes - The encoded texels.
 * @param row - The row.
 * @returns `[offset, period]` as the shader computes them.
 */
function decodeMediump(bytes: Uint8Array, row: number): [number, number] {
  const k = row * 4;
  const byteOf = (byte: number): number => Math.floor(half(half(half(byte / 255) * 255) + 0.5));
  const offset = half(half(half(byteOf(bytes[k]) - 128) * 256) + byteOf(bytes[k + 1]));
  const period = half(half(byteOf(bytes[k + 2]) * 256) + byteOf(bytes[k + 3]));
  return [offset, period];
}

describe('render-pixi/effects raster tables: line-band floors (edges)', () => {
  it('keeps wrapped offsets in [0, wrap) for negative factors and cameras', () => {
    for (const [factorTop, factorBottom, x] of [
      [-1.5, -0.25, 1000],
      [0.5, 1.5, -777],
      [-4, 4, 12345.5],
    ]) {
      const table = createRasterTable();
      addRasterEffect(
        table,
        effect({ kind: RasterKind.Lines, top: 0, bottom: 200, factorTop, factorBottom, wrap: 48 }),
        0,
        cam(x),
      );
      for (let r = 0; r < 200; r++) {
        const row = r + PLAYFIELD_Y;
        const raw = x * (factorTop + ((factorBottom - factorTop) * r) / 199);
        expect(table.offset[row]).toBeGreaterThanOrEqual(0);
        expect(table.offset[row]).toBeLessThan(48);
        // Congruent to the unwrapped shift modulo the wrap.
        const k = (raw - table.offset[row]) / 48;
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
        expect(table.wrap[row]).toBe(48);
      }
    }
  });

  it('gives a one-row band the top factor and ignores the tick', () => {
    const table = createRasterTable();
    const one = effect({
      kind: RasterKind.Lines,
      top: 50,
      bottom: 51,
      factorTop: 0.5,
      factorBottom: 3,
    });
    addRasterEffect(table, one, 0, cam(100));
    expect(table.offset[50 + PLAYFIELD_Y]).toBe(50);
    const later = createRasterTable();
    addRasterEffect(later, one, 9999, cam(100));
    expect([...later.offset]).toEqual([...table.offset]);
    // Camera 0: no shift at all, whatever the factors.
    const still = createRasterTable();
    addRasterEffect(still, effect({ ...one, bottom: 150, wrap: 32 }), 0, cam(0));
    expect(still.offset.every((v) => v === 0)).toBe(true);
    expect(still.wrap[100 + PLAYFIELD_Y]).toBe(32);
  });

  it('numbers strips from the band top even when the table cuts some rows off', () => {
    // Rows 0 … 9 in four strips; a row offset of -3 puts rows 0 … 2 above the table.
    const lines = effect({
      kind: RasterKind.Lines,
      top: 0,
      bottom: 10,
      factorTop: 0,
      factorBottom: 3,
      bands: [2, 2, 3, 3],
    });
    const full = createRasterTable(20);
    addRasterEffect(full, lines, 0, cam(10), 0);
    expect([...full.offset.slice(0, 10)]).toEqual([0, 0, 10, 10, 20, 20, 20, 30, 30, 30]);
    const cut = createRasterTable(20);
    addRasterEffect(cut, lines, 0, cam(10), -3);
    expect([...cut.offset.slice(0, 7)]).toEqual([10, 20, 20, 20, 30, 30, 30]);
    // And at the bottom edge: a 6-row table keeps rows 0 … 5 only.
    const short = createRasterTable(6);
    addRasterEffect(short, lines, 0, cam(10), 0);
    expect([...short.offset]).toEqual([0, 0, 10, 10, 20, 20]);
  });

  it('copes with strips that add up to more or fewer rows than the band', () => {
    const table = createRasterTable(20);
    // More: the band ends inside the last strip.
    addRasterEffect(
      table,
      effect({
        kind: RasterKind.Lines,
        top: 0,
        bottom: 4,
        factorTop: 1,
        factorBottom: 2,
        bands: [3, 9],
      }),
      0,
      cam(10),
      0,
    );
    expect([...table.offset.slice(0, 5)]).toEqual([10, 10, 10, 20, 0]);
  });

  it('adds a floor on top of a wave on the same rows, the floor setting the wrap', () => {
    const table = createRasterTable(10);
    addRasterEffect(
      table,
      effect({ top: 0, bottom: 10, amplitude: 2, wavelength: 4 }),
      0,
      cam(0),
      0,
    );
    const wave = [...table.offset];
    addRasterEffect(
      table,
      effect({
        kind: RasterKind.Lines,
        top: 5,
        bottom: 10,
        factorTop: 1,
        factorBottom: 1,
        wrap: 16,
      }),
      0,
      cam(20),
      0,
    );
    for (let r = 0; r < 10; r++) {
      expect(table.offset[r]).toBeCloseTo(wave[r] + (r >= 5 ? 4 : 0), 12);
      expect(table.wrap[r]).toBe(r >= 5 ? 16 : 0);
    }
  });
});

describe('render-pixi/effects raster tables: waves and hazes (edges)', () => {
  it('computes the wave exactly: whole binary units of sinB', () => {
    const table = createRasterTable();
    const wave = effect({ top: 3, bottom: 40, amplitude: 2.5, wavelength: 7, period: 50 });
    addRasterEffect(table, wave, 123, cam(0));
    const time = ((123 % 50) * 1024) / 50;
    for (let r = 3; r < 40; r++) {
      const k = ((r - 3) * 1024) / 7;
      expect(table.offset[r + PLAYFIELD_Y]).toBe(2.5 * sinB((k + time) | 0));
    }
  });

  it('computes the haze exactly: two sines, the second at 2.3× the frequency running back', () => {
    const table = createRasterTable();
    const haze = effect({
      kind: RasterKind.Haze,
      top: 0,
      bottom: 60,
      amplitude: 3,
      wavelength: 9,
      period: 37,
    });
    addRasterEffect(table, haze, 1000, cam(0));
    const time = ((1000 % 37) * 1024) / 37;
    for (let r = 0; r < 60; r++) {
      const k = (r * 1024) / 9;
      const a = sinB((k + time) | 0);
      const b = sinB((k * 2.3 - 2 * time + 1024 * 4096) | 0);
      expect(table.offset[r + PLAYFIELD_Y]).toBe((3 * (a + 0.5 * b)) / 1.5);
    }
    // Row 0 at tick 0 sits on both sines' zero.
    const zero = createRasterTable();
    addRasterEffect(zero, haze, 0, cam(0));
    expect(zero.offset[PLAYFIELD_Y]).toBeCloseTo(0, 12);
  });

  it('repeats a haze every period, also for negative ticks', () => {
    const haze = effect({
      kind: RasterKind.Haze,
      top: 0,
      bottom: 100,
      amplitude: 2,
      wavelength: 6,
      period: 40,
    });
    const a = createRasterTable();
    const b = createRasterTable();
    const c = createRasterTable();
    addRasterEffect(a, haze, 13, cam(0));
    addRasterEffect(b, haze, 13 + 40 * 77, cam(0));
    addRasterEffect(c, haze, 13 - 40 * 5, cam(0));
    for (let i = 0; i < 216; i++) {
      expect(b.offset[i]).toBeCloseTo(a.offset[i], 9);
      expect(c.offset[i]).toBeCloseTo(a.offset[i], 9);
    }
  });

  it('treats a wavelength ≤ 0 as 1 row and a negative period as still', () => {
    const table = createRasterTable();
    addRasterEffect(table, effect({ top: 0, bottom: 5, amplitude: 4, wavelength: 0 }), 0, cam(0));
    // One row per turn: every row lands on sin(0).
    for (let r = 0; r < 5; r++) expect(table.offset[r + PLAYFIELD_Y]).toBe(0);
    const negative = createRasterTable();
    addRasterEffect(
      negative,
      effect({ top: 0, bottom: 5, amplitude: 4, wavelength: -3 }),
      0,
      cam(0),
    );
    expect([...negative.offset]).toEqual([...table.offset]);
    const still = effect({ top: 0, bottom: 20, amplitude: 3, wavelength: 16, period: -60 });
    const t0 = createRasterTable();
    const t1 = createRasterTable();
    addRasterEffect(t0, still, 0, cam(0));
    addRasterEffect(t1, still, 31, cam(0));
    expect([...t1.offset]).toEqual([...t0.offset]);
    expect(t0.offset[PLAYFIELD_Y + 4]).toBe(3 * sinB(256));
  });

  it('lets a wave carry a wrap period and keeps a zero one from clearing an earlier wrap', () => {
    const table = createRasterTable(10);
    addRasterEffect(table, effect({ top: 0, bottom: 6, amplitude: 1, wrap: 128 }), 0, cam(0), 0);
    addRasterEffect(table, effect({ top: 3, bottom: 10, amplitude: 1, wrap: 0 }), 0, cam(0), 0);
    expect([...table.wrap]).toEqual([128, 128, 128, 128, 128, 128, 0, 0, 0, 0]);
  });

  it('never touches rows outside the band or the table, and ignores inverted bands', () => {
    const table = createRasterTable(8);
    addRasterEffect(
      table,
      effect({ top: 5, bottom: 2, amplitude: 9, wavelength: 4 }),
      0,
      cam(0),
      0,
    );
    addRasterEffect(
      table,
      effect({ top: 0, bottom: 5, amplitude: 9, wavelength: 4 }),
      0,
      cam(0),
      100,
    );
    addRasterEffect(
      table,
      effect({ top: 0, bottom: 5, amplitude: 9, wavelength: 4 }),
      0,
      cam(0),
      -50,
    );
    addRasterEffect(
      table,
      effect({ kind: RasterKind.Lines, top: 9, bottom: 3, factorTop: 1, factorBottom: 1 }),
      0,
      cam(100),
      0,
    );
    expect([...table.offset, ...table.wrap].every((v) => v === 0)).toBe(true);
  });
});

describe('render-pixi/effects stage effect ranges (edges)', () => {
  it('is never on for a NaN camera and runs from -Infinity when asked', () => {
    expect(stageEffectActive({ from: 0, to: 100 }, cam(Number.NaN))).toBe(false);
    expect(stageEffectActive({ from: Number.NEGATIVE_INFINITY, to: 0 }, cam(-1e9))).toBe(true);
    expect(stageEffectActive({ from: 50, to: 50 }, cam(50))).toBe(false);
  });
});

describe('render-pixi/effects raster table encoding (edges)', () => {
  it('rounds half-pixels as Math.round does and clamps just past the range', () => {
    const table = createRasterTable(6);
    table.offset.set([2.5, -2.5, -0.4, RASTER_MAX_OFFSET + 0.4, -RASTER_MAX_OFFSET - 0.6, -0]);
    table.wrap.set([0.5, 2047.4, 2047.6, Number.NaN, Number.POSITIVE_INFINITY, 1]);
    const bytes = new Uint8Array(24);
    encodeRasterTable(table, bytes);
    expect([0, 1, 2, 3, 4, 5].map((row) => decodeRasterRow(bytes, row))).toEqual([
      [3, 1],
      [-2, 2047],
      [0, 2047],
      [RASTER_MAX_OFFSET, 0],
      [-RASTER_MAX_OFFSET, 2047],
      [0, 1],
    ]);
  });

  it('reports a change only when a byte changes, row by row', () => {
    const table = createRasterTable(3);
    const bytes = new Uint8Array(12);
    // Fresh zero bytes differ from the neutral encoding (R = 128).
    expect(encodeRasterTable(table, bytes)).toBe(true);
    expect(encodeRasterTable(table, bytes)).toBe(false);
    table.offset[1] = 0.4; // still rounds to 0
    expect(encodeRasterTable(table, bytes)).toBe(false);
    table.offset[2] = 0.6;
    expect(encodeRasterTable(table, bytes)).toBe(true);
    table.wrap[0] = 64;
    expect(encodeRasterTable(table, bytes)).toBe(true);
    expect(encodeRasterTable(table, bytes)).toBe(false);
  });

  it('leaves texels past the table untouched when the byte array is longer', () => {
    const table = createRasterTable(2);
    table.offset.fill(5);
    const bytes = new Uint8Array(16).fill(7);
    encodeRasterTable(table, bytes);
    expect(decodeRasterRow(bytes, 1)).toEqual([5, 0]);
    expect([...bytes.slice(8)]).toEqual(new Array(8).fill(7));
  });

  it('round-trips a whole frame of mixed effects through encode and decode', () => {
    const table = createRasterTable();
    addRasterEffect(
      table,
      effect({ top: 0, bottom: 100, amplitude: 3, wavelength: 20, period: 96 }),
      77,
      cam(0),
    );
    addRasterEffect(
      table,
      effect({
        kind: RasterKind.Lines,
        top: 100,
        bottom: 200,
        factorTop: 0.25,
        factorBottom: 1.5,
        bands: [10, 20, 30, 40],
        wrap: 64,
      }),
      77,
      cam(3333.3),
    );
    const bytes = new Uint8Array(table.rows * 4);
    encodeRasterTable(table, bytes);
    for (let row = 0; row < table.rows; row++) {
      expect(decodeRasterRow(bytes, row)).toEqual([
        Math.round(table.offset[row]) + 0,
        Math.round(table.wrap[row]),
      ]);
    }
  });
});

describe("render-pixi/effects the shader's decode under mediump (IEEE half floats)", () => {
  it('the half-float model rounds as binary16 does', () => {
    expect(half(2049)).toBe(2048); // 11 significant bits: odd integers above 2048 are lost
    expect(half(2051)).toBe(2052);
    expect(half(2047)).toBe(2047);
    expect(half(1 / 3)).toBeCloseTo(0.333251953125, 12);
    expect(half(70000)).toBe(Number.POSITIVE_INFINITY);
  });

  it('decodes every whole offset and wrap period exactly', () => {
    const table = createRasterTable(1);
    const bytes = new Uint8Array(4);
    for (let o = -RASTER_MAX_OFFSET; o <= RASTER_MAX_OFFSET; o++) {
      table.offset[0] = o;
      table.wrap[0] = Math.abs(o);
      encodeRasterTable(table, bytes);
      expect(decodeMediump(bytes, 0)).toEqual([o, Math.abs(o)]);
    }
  });

  it('samples the right texel for every frame row', () => {
    // texture2D(uRasterTable, vec2(0.5, (row + 0.5) / uRows)) under nearest sampling.
    for (let row = 0; row < LAYER_EFFECT_ROWS; row++) {
      const v = half(half(row + 0.5) / LAYER_EFFECT_ROWS);
      expect(Math.floor(v * LAYER_EFFECT_ROWS)).toBe(row);
    }
  });
});

describe('render-pixi/effects clearRasterTable', () => {
  it('clears offsets and wraps of any table size', () => {
    const table = createRasterTable(3);
    table.offset.set([1, -2, 3]);
    table.wrap.set([4, 5, 6]);
    clearRasterTable(table);
    expect([...table.offset, ...table.wrap]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
