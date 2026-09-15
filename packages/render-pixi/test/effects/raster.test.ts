/**
 * The raster offset-table builders (plan M2-08): wavy water, heat haze and line-band floors added
 * row by row from the core's sine table, their camera ranges, and the RGBA8 encoding the layer
 * shader decodes — exact values, edges, and no allocation per frame.
 */
import { PLAYFIELD_Y, RasterKind, sinB, type RasterEffectView } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  RASTER_MAX_OFFSET,
  addRasterEffect,
  clearRasterTable,
  createRasterTable,
  decodeRasterRow,
  encodeRasterTable,
  stageEffectActive,
} from '../../src/effects/index.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

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

describe('render-pixi/effects raster tables', () => {
  it('creates an empty 216-row table and refuses a bad size', () => {
    const table = createRasterTable();
    expect(table.rows).toBe(216);
    expect([...table.offset].every((v) => v === 0)).toBe(true);
    expect(createRasterTable(4).offset.length).toBe(4);
    expect(() => createRasterTable(0)).toThrow(RangeError);
    expect(() => createRasterTable(2.5)).toThrow(RangeError);
  });

  it('adds a wave: amplitude · sin(k / wavelength + tick / period) on the playfield rows', () => {
    const table = createRasterTable();
    const wave = effect({ top: 10, bottom: 20, amplitude: 3, wavelength: 8, period: 64 });
    addRasterEffect(table, wave, 16, cam(0));
    for (let r = 10; r < 20; r++) {
      const k = ((r - 10) * 1024) / 8;
      expect(table.offset[r + PLAYFIELD_Y]).toBeCloseTo(3 * sinB(k + (16 * 1024) / 64), 10);
    }
    // Rows outside the effect stay 0; a row offset of 0 puts it at frame rows 10 … 19.
    expect(table.offset[PLAYFIELD_Y + 9]).toBe(0);
    expect(table.offset[PLAYFIELD_Y + 20]).toBe(0);
    const bare = createRasterTable();
    addRasterEffect(bare, wave, 16, cam(0), 0);
    expect(bare.offset[10]).toBeCloseTo(table.offset[10 + PLAYFIELD_Y], 10);
  });

  it('keeps a wave with period 0 still and repeats every period', () => {
    const still = effect({ bottom: 5, amplitude: 2, wavelength: 4, period: 0 });
    const a = createRasterTable();
    const b = createRasterTable();
    addRasterEffect(a, still, 0, cam(0));
    addRasterEffect(b, still, 12345, cam(0));
    expect([...b.offset]).toEqual([...a.offset]);
    const moving = effect({ bottom: 5, amplitude: 2, wavelength: 4, period: 30 });
    const c = createRasterTable();
    const d = createRasterTable();
    addRasterEffect(c, moving, 7, cam(0));
    addRasterEffect(d, moving, 7 + 30 * 1000, cam(0));
    for (let i = 0; i < 216; i++) expect(d.offset[i]).toBeCloseTo(c.offset[i], 9);
    // Negative ticks wrap the same way.
    const e = createRasterTable();
    addRasterEffect(e, moving, 7 - 30 * 3, cam(0));
    for (let i = 0; i < 216; i++) expect(e.offset[i]).toBeCloseTo(c.offset[i], 9);
  });

  it('adds a heat haze that stays within its amplitude and shimmers over time', () => {
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
    addRasterEffect(a, haze, 0, cam(0));
    addRasterEffect(b, haze, 5, cam(0));
    let moved = 0;
    for (let i = 0; i < 216; i++) {
      expect(Math.abs(a.offset[i])).toBeLessThanOrEqual(2 + 1e-9);
      if (Math.abs(a.offset[i] - b.offset[i]) > 0.25) moved++;
    }
    expect(moved).toBeGreaterThan(50);
  });

  it('adds a line-band floor: per-row factors × camera, wrapped, and the wrap period', () => {
    const lines = effect({
      kind: RasterKind.Lines,
      top: 100,
      bottom: 110,
      factorTop: 0.5,
      factorBottom: 1.4,
      wrap: 64,
    });
    const table = createRasterTable();
    addRasterEffect(table, lines, 0, cam(1000));
    for (let r = 100; r < 110; r++) {
      const raw = 1000 * (0.5 + (0.9 * (r - 100)) / 9);
      const row = r + PLAYFIELD_Y;
      expect(table.offset[row]).toBeCloseTo(raw - Math.floor(raw / 64) * 64, 9);
      expect(table.offset[row]).toBeGreaterThanOrEqual(0);
      expect(table.offset[row]).toBeLessThan(64);
      expect(table.wrap[row]).toBe(64);
    }
    // Without a wrap the offset is not reduced and no wrap period is set.
    const open = createRasterTable();
    addRasterEffect(open, effect({ ...lines, wrap: 0 }), 0, cam(1000));
    expect(open.offset[109 + PLAYFIELD_Y]).toBeCloseTo(1400, 9);
    expect(open.wrap[109 + PLAYFIELD_Y]).toBe(0);
  });

  it('scrolls a floor in strips when it lists bands', () => {
    const lines = effect({
      kind: RasterKind.Lines,
      top: 0,
      bottom: 10,
      factorTop: 0,
      factorBottom: 1,
      bands: [2, 3, 5],
    });
    const table = createRasterTable();
    addRasterEffect(table, lines, 0, cam(100), 0);
    expect([...table.offset.slice(0, 10)]).toEqual([0, 0, 50, 50, 50, 100, 100, 100, 100, 100]);
    // Rows past the listed strips take the last strip's factor; one strip is factorTop.
    const short = createRasterTable();
    addRasterEffect(short, effect({ ...lines, bands: [2, 3] }), 0, cam(100), 0);
    expect([...short.offset.slice(0, 10)]).toEqual([0, 0, 100, 100, 100, 100, 100, 100, 100, 100]);
    const one = createRasterTable();
    addRasterEffect(one, effect({ ...lines, bands: [10] }), 0, cam(100), 0);
    expect([...one.offset.slice(0, 10)]).toEqual(new Array(10).fill(0));
  });

  it('adds effects up, skips rows outside the table and empty ranges, and clears', () => {
    const table = createRasterTable(20);
    addRasterEffect(
      table,
      effect({ kind: RasterKind.Lines, top: 0, bottom: 30, factorTop: 1, factorBottom: 1 }),
      0,
      cam(5),
      0,
    );
    addRasterEffect(
      table,
      effect({ kind: RasterKind.Lines, top: 0, bottom: 30, factorTop: 1, factorBottom: 1 }),
      0,
      cam(5),
      0,
    );
    expect(table.offset[19]).toBe(10);
    addRasterEffect(table, effect({ top: 5, bottom: 5, amplitude: 9 }), 0, cam(0), 0);
    expect(table.offset[5]).toBe(10);
    clearRasterTable(table);
    expect([...table.offset, ...table.wrap].every((v) => v === 0)).toBe(true);
  });

  it('knows when an effect is on: from ≤ camera x < to', () => {
    const range = { from: 100, to: 200 };
    expect(stageEffectActive(range, cam(99.9))).toBe(false);
    expect(stageEffectActive(range, cam(100))).toBe(true);
    expect(stageEffectActive(range, cam(199.9))).toBe(true);
    expect(stageEffectActive(range, cam(200))).toBe(false);
    expect(stageEffectActive({ from: 0, to: Number.POSITIVE_INFINITY }, cam(1e9))).toBe(true);
  });
});

describe('render-pixi/effects raster table encoding', () => {
  it('encodes whole-pixel offsets and wraps as RGBA bytes the shader decodes', () => {
    const table = createRasterTable(6);
    table.offset.set([0, 3.4, -3.6, 1000, -5000, 99999]);
    table.wrap.set([0, 64, 1023.6, 5000, -1, 256]);
    const bytes = new Uint8Array(24);
    expect(encodeRasterTable(table, bytes)).toBe(true);
    expect([...bytes.slice(0, 4)]).toEqual([128, 0, 0, 0]);
    expect(decodeRasterRow(bytes, 1)).toEqual([3, 64]);
    expect(decodeRasterRow(bytes, 2)).toEqual([-4, 1024]);
    expect(decodeRasterRow(bytes, 3)).toEqual([1000, RASTER_MAX_OFFSET]);
    expect(decodeRasterRow(bytes, 4)).toEqual([-RASTER_MAX_OFFSET, 0]);
    expect(decodeRasterRow(bytes, 5)).toEqual([RASTER_MAX_OFFSET, 256]);
    // Unchanged → false (no re-upload); NaN counts as the clamp's lower bound.
    expect(encodeRasterTable(table, bytes)).toBe(false);
    table.offset[0] = Number.NaN;
    expect(encodeRasterTable(table, bytes)).toBe(true);
    expect(decodeRasterRow(bytes, 0)[0]).toBe(-RASTER_MAX_OFFSET);
  });

  it('round-trips every whole offset in range through the shader arithmetic', () => {
    const table = createRasterTable(1);
    const bytes = new Uint8Array(4);
    for (let o = -RASTER_MAX_OFFSET; o <= RASTER_MAX_OFFSET; o += 7) {
      table.offset[0] = o;
      encodeRasterTable(table, bytes);
      // GLSL: (floor(r·255 + .5) − 128) · 256 + floor(g·255 + .5), with r, g = byte / 255.
      const r = Math.floor((bytes[0] / 255) * 255 + 0.5);
      const g = Math.floor((bytes[1] / 255) * 255 + 0.5);
      expect((r - 128) * 256 + g).toBe(o);
    }
  });

  it('writes only as many rows as the byte array holds', () => {
    const table = createRasterTable(10);
    table.offset.fill(1);
    const bytes = new Uint8Array(8);
    encodeRasterTable(table, bytes);
    expect(decodeRasterRow(bytes, 1)).toEqual([1, 0]);
  });

  it('builds and encodes a frame of effects without allocating', () => {
    const table = createRasterTable();
    const bytes = new Uint8Array(table.rows * 4);
    const wave = effect({ top: 100, bottom: 150, amplitude: 3, wavelength: 20, period: 96 });
    const haze = effect({
      kind: RasterKind.Haze,
      top: 20,
      bottom: 100,
      amplitude: 2,
      wavelength: 8,
      period: 40,
    });
    const floor = effect({
      kind: RasterKind.Lines,
      top: 150,
      bottom: 200,
      factorTop: 0.25,
      factorBottom: 1.5,
      bands: [5, 5, 10, 10, 20],
      wrap: 64,
    });
    const camera = cam(0);
    const bytesUsed = measureHeapGrowth(
      (tick) => {
        camera.x = tick * 0.75;
        clearRasterTable(table);
        addRasterEffect(table, wave, tick, camera);
        addRasterEffect(table, haze, tick, camera);
        addRasterEffect(table, floor, tick, camera);
        encodeRasterTable(table, bytes);
      },
      5000,
      20_000,
    ).bytes;
    expect(bytesUsed).toBeLessThan(64 * 1024);
  });
});
