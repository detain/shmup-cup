/**
 * The zone backdrops (`scripts/assets/procedural/backdrops.mjs`). Split out of
 * `procedural.test.ts` by plan R4-P.P2.
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import * as backdrops from '../../../scripts/assets/procedural/backdrops.mjs';
import { PROCEDURAL_GENERATORS } from '../../../scripts/assets/procedural/index.mjs';
import { byName, key, luma } from './procedural-helpers.js';

describe('scripts/assets/procedural/backdrops', () => {
  const sprites = backdrops.generate();

  it("draws AZURE VERGE's planet band: one top-left-anchored 128×48 tile", () => {
    expect(sprites.map((s) => s.name)).toEqual(['bg/azure-verge']);
    const [sprite] = sprites;
    expect(sprite.anchor).toEqual([0, 0]);
    expect(sprite.frames).toHaveLength(1);
    expect([sprite.frames[0].width, sprite.frames[0].height]).toEqual([
      backdrops.AZURE_TILE_W,
      backdrops.AZURE_TILE_H,
    ]);
  });

  it('thickens the haze towards the rim, then paints an opaque planet body down to the bottom', () => {
    const [frame] = byName(sprites, 'bg/azure-verge').frames;
    const rim = backdrops.AZURE_RIM_ROW;
    let previous = -1;
    for (let y = 0; y < rim; y++) {
      const alphas = new Set<number>();
      for (let x = 0; x < frame.width; x++) alphas.add(getPixel(frame, x, y)[3]);
      // Every column of a haze row is the same: the tile repeats seamlessly.
      expect(alphas.size, `row ${String(y)}`).toBe(1);
      const [alpha] = [...alphas];
      expect(alpha).toBeGreaterThanOrEqual(previous);
      expect(alpha).toBeLessThan(255);
      previous = alpha;
    }
    expect(getPixel(frame, 0, 0)[3]).toBe(0);
    for (let x = 0; x < frame.width; x++) expect(getPixel(frame, x, rim)[3]).toBe(200);
    for (let y = rim + 1; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const rgba = getPixel(frame, x, y);
        expect(rgba[3]).toBe(255);
        // Dark enough for the pink / red / purple bullets and gold capsules, never black.
        expect(luma(rgba)).toBeGreaterThan(10);
        expect(luma(rgba)).toBeLessThan(90);
        expect(rgba[2]).toBeGreaterThan(rgba[0]); // blue, not warm: bullets stay readable
      }
    }
  });

  it('has cloud streaks that wrap around the tile edge (the band repeats every 128 px)', () => {
    const [frame] = byName(sprites, 'bg/azure-verge').frames;
    let wrapped = 0;
    let streakPixels = 0;
    for (let y = backdrops.AZURE_RIM_ROW + 1; y < frame.height; y++) {
      // A row's plain body colour is the most common colour of the row.
      const counts = new Map<string, number>();
      for (let x = 0; x < frame.width; x++) {
        const k = key(getPixel(frame, x, y));
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const plain = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const streak = (x: number): boolean => key(getPixel(frame, x, y)) !== plain;
      for (let x = 0; x < frame.width; x++) if (streak(x)) streakPixels++;
      if (streak(0) && streak(frame.width - 1)) wrapped++;
    }
    expect(streakPixels).toBeGreaterThan(200);
    expect(wrapped).toBeGreaterThan(0);
  });

  it('is deterministic (seeded by its name) and registered with the procedural generators', () => {
    const [a] = backdrops.generate();
    const [b] = backdrops.generate();
    expect(Buffer.from(b.frames[0].data).equals(Buffer.from(a.frames[0].data))).toBe(true);
    expect(PROCEDURAL_GENERATORS.map((g) => g.id)).toContain('backdrops');
    const all = PROCEDURAL_GENERATORS.flatMap((g) => g.generate().map((sprite) => sprite.name));
    expect(all.filter((name) => name === 'bg/azure-verge')).toHaveLength(1);
  });
});
