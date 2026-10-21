/**
 * The raster effect bands (`scripts/assets/procedural/raster-bands.mjs`). Split out of
 * `procedural.test.ts` by plan R4-P.P2.
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import * as rasterBands from '../../../scripts/assets/procedural/raster-bands.mjs';
import { PROCEDURAL_GENERATORS } from '../../../scripts/assets/procedural/index.mjs';
import { byName, key } from './procedural-helpers.js';

describe('scripts/assets/procedural/raster-bands (M2-08)', () => {
  const sprites = rasterBands.generate();

  it('draws the sea swell and the checker floor as top-left-anchored, opaque tiles', () => {
    expect(sprites.map((s) => s.name)).toEqual(['bg/sea-swell', 'bg/checker-floor']);
    const [sea, floor] = sprites;
    expect([sea.frames[0].width, sea.frames[0].height]).toEqual([
      rasterBands.SEA_TILE_W,
      rasterBands.SEA_TILE_H,
    ]);
    expect([floor.frames[0].width, floor.frames[0].height]).toEqual([
      rasterBands.FLOOR_TILE_W,
      rasterBands.FLOOR_TILE_H,
    ]);
    for (const sprite of sprites) {
      expect(sprite.anchor).toEqual([0, 0]);
      const [frame] = sprite.frames;
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) expect(getPixel(frame, x, y)[3]).toBe(255);
      }
    }
  });

  it('paints the sea only in the four ramp colours a palette cycle names, every one of them', () => {
    const [frame] = byName(sprites, 'bg/sea-swell').frames;
    const ramp = rasterBands.SEA_RAMP.map((hex) => {
      const n = parseInt(hex.slice(1), 16);
      return key([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]);
    });
    const seen = new Set<string>();
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) seen.add(key(getPixel(frame, x, y)));
    }
    expect([...seen].sort()).toEqual([...ramp].sort());
  });

  it('builds the floor from strips whose checker widens towards the bottom and repeats seamlessly', () => {
    const [frame] = byName(sprites, 'bg/checker-floor').frames;
    expect(rasterBands.FLOOR_BANDS.reduce((a, b) => a + b, 0)).toBe(rasterBands.FLOOR_TILE_H);
    expect(rasterBands.FLOOR_SQUARES).toHaveLength(rasterBands.FLOOR_BANDS.length);
    let y = 0;
    for (let band = 0; band < rasterBands.FLOOR_BANDS.length; band++) {
      const width = rasterBands.FLOOR_SQUARES[band];
      expect((rasterBands.FLOOR_TILE_W / 2) % width).toBe(0);
      const row = y === 0 ? 1 : y; // row 0 is the horizon line
      if (row < y + rasterBands.FLOOR_BANDS[band]) {
        // Tone changes exactly every `width` px.
        for (let x = 1; x < frame.width; x++) {
          const same = key(getPixel(frame, x, row)) === key(getPixel(frame, x - 1, row));
          expect(same, `band ${String(band)} x ${String(x)}`).toBe(x % width !== 0);
        }
      }
      y += rasterBands.FLOOR_BANDS[band];
    }
    const horizon = new Set<string>();
    for (let x = 0; x < frame.width; x++) horizon.add(key(getPixel(frame, x, 0)));
    expect(horizon.size).toBe(1);
  });

  it('is deterministic and registered with the procedural generators', () => {
    const [a] = rasterBands.generate();
    const [b] = rasterBands.generate();
    expect(Buffer.from(b.frames[0].data).equals(Buffer.from(a.frames[0].data))).toBe(true);
    expect(PROCEDURAL_GENERATORS.map((g) => g.id)).toContain('raster-bands');
  });
});
