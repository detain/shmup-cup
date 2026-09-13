/**
 * Raster (per-scanline) offset tables of the `effects` module (plan M2-08, shmup_feat.md §18
 * "Raster/HDMA-style effects: per-scanline offset table (1×H data texture)"): pure builders — no
 * Pixi — so they are unit-tested in Node and cost no allocation per frame.
 *
 * A {@link RasterTable} holds one horizontal offset and one wrap period per frame row (216 rows).
 * Each frame the layer effects clear the table, add every active stage raster effect of the layer
 * ({@link addRasterEffect}: wavy water, heat haze, line-band parallax floor) and encode it into the
 * RGBA8 bytes of the 1 × 216 texture the layer shader samples ({@link encodeRasterTable}).
 *
 * The sines come from the core's committed tables (`sinB`, 1024 binary units per turn), so the
 * same tick and camera always give the same table on every engine — screenshots stay comparable.
 *
 * @module
 */
import { PLAYFIELD_Y, RasterKind, sinB, type CameraView, type RasterEffectView } from '@shmup/core';
import { LAYER_EFFECT_ROWS } from './shaders.js';

/** Largest offset / wrap period (pixels) the texture encoding carries (the shader's mediump range). */
export const RASTER_MAX_OFFSET = 2047;

/** Binary-angle units per turn (`sinB`). */
const TURN = 1024;

/**
 * Frequency of the heat haze's second sine relative to the first (an irrational-looking ratio, so
 * the two never line up into a plain wave).
 */
const HAZE_RATIO = 2.3;

/** One offset and wrap period per frame row. */
export interface RasterTable {
  /** Rows (216 for the 384×216 frame). */
  readonly rows: number;
  /** Horizontal offset of each row in pixels (the layer is sampled that far to the right). */
  readonly offset: Float64Array;
  /** Wrap period of each row in pixels (0 = clamp at the layer's edges). */
  readonly wrap: Float64Array;
}

/**
 * Allocates an empty table (load time).
 *
 * @param rows - Rows (default 216, the frame height).
 * @returns The table, every row 0.
 * @throws {RangeError} When `rows` is not a positive integer.
 *
 * @example
 * ```ts
 * const table = createRasterTable();
 * const bytes = new Uint8Array(table.rows * 4);
 * ```
 */
export function createRasterTable(rows: number = LAYER_EFFECT_ROWS): RasterTable {
  if (!Number.isInteger(rows) || rows <= 0) {
    throw new RangeError('raster table rows must be a positive integer');
  }
  return { rows, offset: new Float64Array(rows), wrap: new Float64Array(rows) };
}

/**
 * Resets every row to offset 0, no wrap. Never allocates.
 *
 * @param table - The table.
 */
export function clearRasterTable(table: RasterTable): void {
  table.offset.fill(0);
  table.wrap.fill(0);
}

/**
 * Whether a stage effect (raster effect or palette cycle) is on at the camera's position:
 * `from ≤ camera.x < to`.
 *
 * @remarks
 * Takes the camera object rather than its x: a fractional number passed to a call V8 does not
 * inline is boxed — an allocation per call on a per-frame path.
 *
 * @param effect - The effect's range.
 * @param effect.from - First camera x of the range.
 * @param effect.to - Camera x where it ends.
 * @param camera - The camera.
 * @returns `true` inside the range.
 */
export function stageEffectActive(
  effect: { readonly from: number; readonly to: number },
  camera: CameraView,
): boolean {
  const x = camera.x;
  return x >= effect.from && x < effect.to;
}

/**
 * Adds one raster effect's offsets to its rows of a table. Never allocates.
 *
 * @remarks
 * Playfield row `r ∈ [top, bottom)` is frame row `r + rowOffset`; rows outside the table are
 * skipped. With `k = r − top`:
 *
 * - `Wave`: `amplitude · sin(k / wavelength + tick / period)` (turns);
 * - `Haze`: `amplitude · (sin(k / wavelength + tick / period) + ½ · sin(2.3 · k / wavelength −
 *   2 · tick / period)) / 1.5` — a shimmer whose two components never line up;
 * - `Lines`: `cameraX · lerp(factorTop, factorBottom, k / (rows − 1))`, taken modulo `wrap` when it
 *   is positive (that row's wrap period is set to `wrap`) — the art's rows scroll at their own
 *   speed, near rows faster: a pseudo-3D floor. With `bands` (strip heights) `k` counts strips
 *   instead of rows (`k / (strips − 1)`), so each strip of the art scrolls as one piece — rows past
 *   the listed strips take the last one's factor.
 *
 * Offsets of several effects on a row add up; a `Lines` effect's wrap replaces the row's.
 *
 * The camera arrives as an object (see {@link stageEffectActive}); the sine arguments are
 * whole binary units. Never allocates.
 *
 * @param table - The table.
 * @param effect - The stage raster effect.
 * @param tick - The tick (a whole number; animates `Wave` / `Haze`).
 * @param camera - The camera (its x scrolls `Lines`).
 * @param rowOffset - Frame row of playfield row 0 (default `PLAYFIELD_Y`).
 *
 * @example
 * ```ts
 * clearRasterTable(table);
 * addRasterEffect(table, water, frame.tick, world.camera);
 * encodeRasterTable(table, bytes);
 * ```
 */
export function addRasterEffect(
  table: RasterTable,
  effect: RasterEffectView,
  tick: number,
  camera: CameraView,
  rowOffset: number = PLAYFIELD_Y,
): void {
  const cameraX = camera.x;
  const top = effect.top;
  const bottom = effect.bottom;
  const rows = table.rows;
  const offset = table.offset;
  const span = bottom - top;
  if (!(span > 0)) return;
  if (effect.kind === RasterKind.Lines) {
    const wrap = effect.wrap > 0 ? effect.wrap : 0;
    const f0 = effect.factorTop;
    const df = effect.factorBottom - f0;
    const bands = effect.bands;
    const strips = bands.length;
    // Rows (or strips) are numbered 0 … last; the factor runs from factorTop to factorBottom.
    const last = strips > 0 ? (strips > 1 ? strips - 1 : 1) : span > 1 ? span - 1 : 1;
    let strip = 0;
    let stripEnd = strips > 0 ? top + bands[0] : bottom;
    for (let r = top; r < bottom; r++) {
      while (strips > 0 && r >= stripEnd && strip < strips - 1) {
        strip++;
        stripEnd += bands[strip];
      }
      const row = r + rowOffset;
      if (row < 0 || row >= rows) continue;
      const k = strips > 0 ? strip : r - top;
      let shift = cameraX * (f0 + (df * k) / last);
      if (wrap > 0) {
        shift -= Math.floor(shift / wrap) * wrap;
        table.wrap[row] = wrap;
      }
      offset[row] += shift;
    }
    return;
  }
  const amplitude = effect.amplitude;
  const wavelength = effect.wavelength > 0 ? effect.wavelength : 1;
  // The time part of the phase: (tick mod period) / period of a turn (0 with period ≤ 0).
  const period = effect.period;
  let t = period > 0 ? tick % period : 0;
  if (t < 0) t += period;
  const time = period > 0 ? (t * TURN) / period : 0;
  const haze = effect.kind === RasterKind.Haze;
  for (let r = top; r < bottom; r++) {
    const row = r + rowOffset;
    if (row < 0 || row >= rows) continue;
    const k = ((r - top) * TURN) / wavelength;
    // Whole binary units (`| 0`): sinB masks them anyway, and small integers are never boxed.
    if (haze) {
      const a = sinB((k + time) | 0);
      const b = sinB((k * HAZE_RATIO - 2 * time + TURN * 4096) | 0);
      offset[row] += (amplitude * (a + 0.5 * b)) / 1.5;
    } else {
      offset[row] += amplitude * sinB((k + time) | 0);
    }
    if (effect.wrap > 0) table.wrap[row] = effect.wrap;
  }
}

/**
 * Encodes a table into the RGBA8 texels of the 1 × `rows` texture the layer shader samples
 * (`LAYER_EFFECT_FRAGMENT`). Never allocates.
 *
 * @remarks
 * Row `i` is texel `i`: R, G = the offset rounded to whole pixels, clamped to ±
 * {@link RASTER_MAX_OFFSET}, as `offset + 32768` (R the high byte — `(R − 128) · 256 + G` decodes
 * it); B, A = the wrap period, rounded and clamped to `0 … RASTER_MAX_OFFSET` (B high, A low).
 * Whole pixels keep the pixel art crisp — the frame is sampled nearest-neighbour anyway.
 *
 * @param table - The table.
 * @param out - `rows · 4` bytes (the texture's pixels).
 * @returns Whether any byte changed (the texture needs uploading).
 *
 * @example
 * ```ts
 * if (encodeRasterTable(table, bytes)) source.update();
 * ```
 */
export function encodeRasterTable(table: RasterTable, out: Uint8Array): boolean {
  const rows = Math.min(table.rows, out.length >> 2);
  let changed = false;
  for (let i = 0; i < rows; i++) {
    let o = Math.round(table.offset[i]);
    if (!(o >= -RASTER_MAX_OFFSET)) o = -RASTER_MAX_OFFSET;
    else if (o > RASTER_MAX_OFFSET) o = RASTER_MAX_OFFSET;
    let w = Math.round(table.wrap[i]);
    if (!(w >= 0)) w = 0;
    else if (w > RASTER_MAX_OFFSET) w = RASTER_MAX_OFFSET;
    const value = (o + 32768) | 0;
    const hi = value >> 8;
    const lo = value & 0xff;
    const k = i << 2;
    if (out[k] !== hi || out[k + 1] !== lo || out[k + 2] !== w >> 8 || out[k + 3] !== (w & 0xff)) {
      out[k] = hi;
      out[k + 1] = lo;
      out[k + 2] = w >> 8;
      out[k + 3] = w & 0xff;
      changed = true;
    }
  }
  return changed;
}

/**
 * Decodes one row of an encoded table (the shader's arithmetic, for tests and tools).
 *
 * @param bytes - The encoded texels.
 * @param row - The row.
 * @returns `[offset, wrap]` in whole pixels.
 */
export function decodeRasterRow(bytes: Uint8Array, row: number): [number, number] {
  const k = row << 2;
  return [(bytes[k] - 128) * 256 + bytes[k + 1], bytes[k + 2] * 256 + bytes[k + 3]];
}
