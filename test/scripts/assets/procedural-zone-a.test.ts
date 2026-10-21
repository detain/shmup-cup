/**
 * R5-01.S2 — the zone-A stand-in art (`scripts/assets/procedural/azure.mjs`, design
 * `docs/v2-run/designs/zone-a.md` §14): every new name drawn at its design size and frame
 * count, the five enemies and the captain's shell hittable (the pipeline derives their
 * `@flash` siblings), the bands seamless and periodic — a half-frame tile that fills the frame
 * exactly twice (every atlas frame stays inside the 512-page scenario of
 * `pipeline-edge.test.ts`) — the horizon opaque below its crest with no pixel of translucency
 * and the clouds a pure haze band, the second one exactly the first drifted right; the
 * `tiles/terrain-azure` grid carrying `terrain-a`'s twenty tiles verbatim before its six
 * variants; every lit colour at Chebyshev distance ≥ 3 from every reserved palette-cycle ramp
 * (read from the shipped stages, as `palette-cycle-scan.test.ts` does); everything `native`
 * and nothing drawn at art scale 1 (RR-1a); and two runs byte-identical.
 *
 * @module
 */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPixel, imagesEqual, type Image } from '../../../scripts/assets/image.mjs';
import { FRAME_W, TILE_SIZE, WORLD_SCALE, PLAYFIELD_H } from '../../../scripts/frame.mjs';
import * as azure from '../../../scripts/assets/procedural/azure.mjs';
import {
  renderTerrainTiles,
  TERRAIN_TILES,
  TILE_SIZE as TERRAIN_TILE_SIZE,
} from '../../../scripts/assets/procedural/terrain.mjs';
import { bytes, byName, content, framesDiffer, seam } from './procedural-zone-helpers.js';

interface CycleEntry {
  layer: string;
  colors: string[];
}
interface StageFile {
  cycles?: CycleEntry[];
}

/** The shipped art scale (3/2 — the value the pipeline builds at after R2-01's flip). */
const ART_SCALE = WORLD_SCALE;

/** The generator's output at the shipped scale. */
const sprites = azure.generate({ artScale: ART_SCALE, tileSize: TERRAIN_TILE_SIZE });

/** All `[r, g, b]` of a frame's pixels that carry any alpha. */
function litColours(image: Image): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const p = getPixel(image, x, y);
      if (p[3] > 0) out.push([p[0], p[1], p[2]]);
    }
  }
  return out;
}

/** The distinct ramp colours of the shipped stages (bible §4.4). */
const ramps = (() => {
  const dir = new URL('../../../content/stages/', import.meta.url);
  const set = new Map<string, number[]>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.stage.json')) continue;
    const stage = content<StageFile>('stages/' + file);
    for (const cycle of stage.cycles ?? []) {
      for (const hex of cycle.colors) {
        set.set(
          hex,
          [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)),
        );
      }
    }
  }
  return set;
})();

/** Chebyshev distance of two colours (the metric the cycle shader compares). */
const chebyshev = (a: number[], b: number[]): number =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

describe('scripts/assets/procedural/azure (R5-01.S2)', () => {
  it('draws nothing at art scale 1 and the §14 list at the shipped scale, all native', () => {
    expect(azure.generate()).toEqual([]);
    expect(azure.generate({ artScale: 1 })).toEqual([]);
    expect(sprites.map((s) => s.name)).toEqual([...azure.AZURE_SPRITES]);
    for (const sprite of sprites) {
      expect(sprite.native, sprite.name).toBe(true);
      expect(sprite.origin, sprite.name).toBe('procedural:azure');
    }
  });

  it('draws every new name at its design size and frame count', () => {
    const table: Record<string, [number, number, number]> = {
      'enemies/azure-skiff': [4, 16, 12],
      'enemies/azure-gale': [4, 24, 18],
      'enemies/azure-gnat': [2, 12, 9],
      'enemies/azure-warden': [2, 21, 15],
      'enemies/azure-matron': [4, 36, 24],
      'bosses/azure-captain-shell': [2, 45, 36],
      'bg/azure-horizon': [1, azure.BAND_TILE_W, azure.HORIZON_H],
      'bg/azure-clouds': [2, azure.BAND_TILE_W, azure.CLOUDS_H],
      'decor/azure-crystal-a': [1, 24, 36],
      'decor/azure-crystal-b': [1, 36, 48],
      'decor/azure-arch': [1, 96, 48],
    };
    for (const [name, [frames, w, h]] of Object.entries(table)) {
      const sprite = byName(sprites, name);
      expect(sprite.frames, name).toHaveLength(frames);
      for (const frame of sprite.frames) {
        expect([frame.width, frame.height], name).toEqual([w, h]);
      }
    }
    const tiles = byName(sprites, 'tiles/terrain-azure');
    expect(tiles.frames).toHaveLength(azure.AZURE_TILE_NAMES.length);
    expect(tiles.frames).toHaveLength(26);
    for (const frame of tiles.frames) {
      expect([frame.width, frame.height]).toEqual([TILE_SIZE, TILE_SIZE]);
    }
    // the captain's shell under the bible §5.7 height cap
    expect(byName(sprites, 'bosses/azure-captain-shell').frames[0].height).toBeLessThanOrEqual(
      Math.round(0.6 * PLAYFIELD_H),
    );
  });

  it('marks the five enemies and the captain hittable, the rest not', () => {
    const hittable = new Set([
      'enemies/azure-skiff',
      'enemies/azure-gale',
      'enemies/azure-gnat',
      'enemies/azure-warden',
      'enemies/azure-matron',
      'bosses/azure-captain-shell',
    ]);
    for (const sprite of sprites) {
      expect(sprite.hitFlash, sprite.name).toBe(hittable.has(sprite.name));
    }
    expect(byName(sprites, 'enemies/azure-warden').animations).toEqual({});
    framesDiffer(sprites);
  });

  it('repeats the bands on a period that fills the frame exactly twice', () => {
    expect(azure.BAND_TILE_W * 2).toBe(FRAME_W);
  });

  it('draws the horizon opaque below its crest, seamless and binary', () => {
    const image = byName(sprites, 'bg/azure-horizon').frames[0];
    const top = (x: number): number => {
      for (let y = 0; y < image.height; y++) if (getPixel(image, x, y)[3] > 0) return y;
      return image.height;
    };
    for (let x = 0; x < image.width; x++) {
      expect(top(x), `column ${x}`).toBeLessThan(image.height);
      for (let y = top(x); y < image.height; y++) expect(getPixel(image, x, y)[3]).toBe(255);
      expect(image.height - top(x)).toBeGreaterThanOrEqual(24);
      const step = Math.abs(top(x) - top((x + 1) % image.width));
      expect(step, `step at ${x}`).toBeLessThanOrEqual(2);
    }
    expect(seam(image)).toBeLessThan(24);
    for (let i = 3; i < image.data.length; i += 4) {
      expect(image.data[i] === 0 || image.data[i] === 255, `pixel ${i}`).toBe(true);
    }
  });

  it('draws the cloud band as pure haze and frame 1 as frame 0 drifted right', () => {
    const [a, b] = byName(sprites, 'bg/azure-clouds').frames;
    let partial = 0;
    let opaque = 0;
    for (let i = 3; i < a.data.length; i += 4) {
      if (a.data[i] > 0 && a.data[i] < 255) partial++;
      if (a.data[i] === 255) opaque++;
    }
    expect(partial).toBeGreaterThan(500);
    expect(opaque).toBe(0);
    expect(seam(a)).toBeLessThan(24);
    const w = a.width;
    const shift = 24;
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < w; x++) {
        expect(getPixel(b, (x + shift) % w, y).join(','), `drift at ${x},${y}`).toBe(
          getPixel(a, x, y).join(','),
        );
      }
    }
  });

  it('carries terrain-a’s twenty tiles verbatim before the six variants', () => {
    const tiles = byName(sprites, 'tiles/terrain-azure');
    expect(tiles.anchor).toEqual([0, 0]);
    const base = renderTerrainTiles(TERRAIN_TILE_SIZE, 'tiles/terrain-a');
    for (let i = 0; i < base.length; i++) {
      expect(imagesEqual(tiles.frames[i], base[i]), azure.AZURE_TILE_NAMES[i]).toBe(true);
    }
    expect(Object.keys(tiles.animations)).toEqual([...azure.AZURE_TILE_NAMES]);
    expect(azure.AZURE_TILE_NAMES.slice(0, 20)).toEqual([...TERRAIN_TILES]);
    // the variant columns are contiguous from their attach row, binary, and the crusts are full
    for (const name of ['solid-a2', 'solid-a3', 'floor-2', 'vein', 'vein-crack'] as const) {
      const frame = tiles.frames[azure.AZURE_TILE_NAMES.indexOf(name)];
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          expect(getPixel(frame, x, y)[3], `${name} ${x},${y}`).toBe(255);
        }
      }
    }
    const fringe = tiles.frames[azure.AZURE_TILE_NAMES.indexOf('ceiling-2')];
    for (let x = 0; x < fringe.width; x++) {
      expect(getPixel(fringe, x, 0)[3]).toBe(255);
      expect(getPixel(fringe, x, 1)[3]).toBe(255);
      let hole = false;
      for (let y = 0; y < fringe.height; y++) {
        const on = getPixel(fringe, x, y)[3] > 0;
        expect(on && hole, `ceiling-2 column ${x} floats`).toBe(false);
        if (!on) hole = true;
        expect(on ? 255 : 0, `ceiling-2 ${x},${y} alpha`).toBe(getPixel(fringe, x, y)[3]);
      }
    }
  });

  it('keeps every lit colour at distance ≥ 3 from the reserved ramps', () => {
    for (const sprite of sprites) {
      for (const frame of sprite.frames) {
        const seen = new Set<string>();
        for (const rgb of litColours(frame)) {
          const key = rgb.join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          for (const [hex, ramp] of ramps) {
            expect(chebyshev(rgb, ramp), `${sprite.name} #${key} vs ${hex}`).toBeGreaterThanOrEqual(
              3,
            );
          }
        }
      }
    }
  });

  it('runs byte-identical twice', () => {
    const again = azure.generate({ artScale: ART_SCALE, tileSize: TERRAIN_TILE_SIZE });
    expect(bytes(again)).toEqual(bytes(sprites));
  });
});
