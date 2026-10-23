/**
 * The zone I and ending placeholder art of plan M2-14 (`scripts/assets/procedural/abyss.mjs` and
 * `ending.mjs`, split out of `procedural-zones-hi.test.ts` by R5-P.P5c): the ARK's turret with its
 * sixteen heading frames, the ending pieces with their shapes, and the ending sprite list matching
 * exactly the core's ending UI sprites. The tests that examine more than one zone (the three
 * generators' order, registration, determinism and hit flashes, the two palette-cycled walls, the
 * two more tilesets, the zone H and I roster hurtboxes) stayed with the earlier zone in
 * `procedural-zone-h.test.ts`.
 *
 * Since R5-09.S2 the file also holds the zone-I v2 stand-ins of design §14 (the mirror of
 * `procedural-zone-g.test.ts`'s block): the ten new names at their design sizes, all `native` and
 * absent at art scale 1 (RR-1a), the `tiles/terrain-abyss-v2` grid carrying `terrain-abyss`'s
 * twenty tiles verbatim before the two §10 additions, the §9 bands seamless at the half-frame
 * period — and, on the zone-B brine route, **every** new lit colour at Chebyshev distance ≥ 3
 * from every reserved palette-cycle ramp.
 *
 * @module
 */
import { UI_SPRITES } from '@shmup/core';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPixel, imagesEqual, type Image } from '../../../scripts/assets/image.mjs';
import * as abyss from '../../../scripts/assets/procedural/abyss.mjs';
import * as ending from '../../../scripts/assets/procedural/ending.mjs';
import {
  renderTerrainTiles,
  TERRAIN_TILES,
  TILE_SIZE as TERRAIN_TILE_SIZE,
} from '../../../scripts/assets/procedural/terrain.mjs';
import { FRAME_W, PLAYFIELD_H, TILE_SIZE, WORLD_SCALE } from '../../../scripts/frame.mjs';
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

/** The first opaque row of a column, or the image height when the column is empty. */
function topOf(image: Image, x: number): number {
  for (let y = 0; y < image.height; y++) if (getPixel(image, x, y)[3] > 0) return y;
  return image.height;
}

describe('scripts/assets/procedural — zones H and I, the ending scenes (M2-14)', () => {
  const i = abyss.generate();
  const e = ending.generate();

  it("gives the ARK's turret sixteen heading frames and the ending pieces their shapes", () => {
    const turret = byName(i, 'bosses/ark-turret');
    expect(turret.frames).toHaveLength(16);
    const blast = byName(e, 'ui/ending-blast');
    expect(blast.frames).toHaveLength(4);
    const opaque = (image: Image): number => {
      let n = 0;
      for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++) if (getPixel(image, x, y)[3] > 0) n++;
      return n;
    };
    // The blast grows from a small flash to a wide ring.
    expect(opaque(blast.frames[0])).toBeLessThan(opaque(blast.frames[1]));
    const sun = byName(e, 'ui/ending-sun').frames[0];
    expect(getPixel(sun, 32, sun.height - 1)[3]).toBe(255); // the half disc sits on its bottom row
    expect(getPixel(sun, 4, 4)[3]).toBe(0); // a transparent sky round it
    const surface = byName(e, 'ui/ending-surface').frames[0];
    expect(surface.width).toBe(64);
    // Its waves repeat every 32 px, so copies side by side join without a seam.
    for (let x = 0; x < 32; x++) {
      for (let y = 0; y < surface.height; y++) {
        expect(getPixel(surface, x, y)).toEqual(getPixel(surface, x + 32, y));
      }
    }
  });

  it("names exactly the core's ending UI sprites", () => {
    expect([...ending.ENDING_SPRITES].sort()).toEqual(
      UI_SPRITES.filter((name) => name.startsWith('ui/ending-')).sort(),
    );
  });

  it("draws the v2 ending path native at the bible's sizes, the v1 path untouched", () => {
    const v2 = ending.generate({ artScale: 3 / 2 });
    expect(v2.map((s) => s.name)).toEqual([...ending.ENDING_SPRITES]);
    for (const s of v2) expect(s.native, s.name).toBe(true);
    // Art bible v2 §5.11: ⌈1.5·⌉ of every v1 size, the blast 24² → 36² over its four frames.
    expect(v2.map((s) => [s.name, s.frames[0].width, s.frames[0].height, s.frames.length])).toEqual(
      [
        ['ui/ending-citadel', 192, 108, 1],
        ['ui/ending-ark', 168, 54, 1],
        ['ui/ending-blast', 36, 36, 4],
        ['ui/ending-bubble', 9, 9, 1],
        ['ui/ending-sun', 96, 48, 1],
        ['ui/ending-surface', 96, 12, 1],
      ],
    );
    // Deterministic: two runs byte for byte.
    expect(bytes(v2)).toEqual(bytes(ending.generate({ artScale: 3 / 2 })));
    // Every frame draws something.
    for (const s of v2)
      for (const frame of s.frames) {
        let lit = 0;
        for (let i = 3; i < frame.data.length; i += 4) if (frame.data[i] > 0) lit++;
        expect(lit, s.name).toBeGreaterThan(0);
      }
    // The blast still grows; the sun sits on its bottom row under a transparent sky corner.
    const blast = byName(v2, 'ui/ending-blast');
    expect(blast.frames[0].data.join()).not.toEqual(blast.frames[1].data.join());
    const sun = byName(v2, 'ui/ending-sun').frames[0];
    expect(getPixel(sun, 48, sun.height - 1)[3]).toBe(255);
    expect(getPixel(sun, 0, 0)[3]).toBe(0);
    // The surface tiles: its 48-px period divides the 96-px width.
    const surface = byName(v2, 'ui/ending-surface').frames[0];
    for (let x = 0; x < 48; x++)
      for (let y = 0; y < surface.height; y++)
        expect(getPixel(surface, x, y)).toEqual(getPixel(surface, x + 48, y));
    // Scale 1 keeps drawing the v1 art, unmarked and byte-identical.
    const one = ending.generate({ artScale: 1 });
    for (const s of one) expect(s.native).toBeUndefined();
    expect(bytes(one)).toEqual(bytes(e));
    expect(bytes(ending.generate())).toEqual(bytes(e));
  });
});

describe('scripts/assets/procedural/abyss — R5-09.S2 v2 stand-ins (zone-i.md §14)', () => {
  const sprites = abyss.generate({ artScale: ART_SCALE, tileSize: TERRAIN_TILE_SIZE });
  const v2 = sprites.slice(abyss.ABYSS_SPRITES.length);

  it('keeps the v1 set of the scale-1 path and adds the §14 list only above it', () => {
    expect(abyss.generate().map((s) => s.name)).toEqual([...abyss.ABYSS_SPRITES]);
    expect(abyss.generate({ artScale: 1 }).map((s) => s.name)).toEqual([...abyss.ABYSS_SPRITES]);
    expect(v2.map((s) => s.name)).toEqual([...abyss.ABYSS_V2_SPRITES]);
    for (const sprite of v2) {
      expect(sprite.native, sprite.name).toBe(true);
      expect(sprite.origin, sprite.name).toBe('procedural:abyss');
    }
    for (const sprite of sprites.slice(0, abyss.ABYSS_SPRITES.length)) {
      if (sprite.name !== 'bg/abyss-murk') expect(sprite.native, sprite.name).toBeUndefined();
    }
    expect(abyss.ABYSS_V2_TILE_NAMES.slice(0, 20)).toEqual([...TERRAIN_TILES]);
  });

  it('draws every new name at its design size and frame count', () => {
    const table: Record<string, [number, number, number]> = {
      'enemies/abyss-crawler': [4, 24, 15],
      'enemies/stinger': [4, 18, 10],
      'enemies/deep-tender': [4, 18, 12],
      'bosses/ark-pod': [4, 27, 15],
      'bosses/king-fin': [1, 33, 21],
      'bg/abyss-deepwall': [1, abyss.BAND_TILE_W, abyss.DEEP_H],
      'bg/abyss-vents': [1, abyss.BAND_TILE_W, abyss.VENTS_H],
      'bg/abyss-flakes': [2, abyss.BAND_TILE_W, abyss.FLAKES_H],
      'fx/glow-abyss-vent': [2, 36, 24],
    };
    for (const [name, [frames, w, h]] of Object.entries(table)) {
      const sprite = byName(sprites, name);
      expect(sprite.frames, name).toHaveLength(frames);
      for (const frame of sprite.frames) {
        expect([frame.width, frame.height], name).toEqual([w, h]);
      }
    }
    // the new boss parts under the bible §5.7 height cap, like zone G's crown and wing
    for (const name of ['bosses/ark-pod', 'bosses/king-fin']) {
      expect(byName(sprites, name).frames[0].height, name).toBeLessThanOrEqual(
        Math.round(0.6 * PLAYFIELD_H),
      );
    }
    const tiles = byName(sprites, 'tiles/terrain-abyss-v2');
    expect(tiles.frames).toHaveLength(abyss.ABYSS_V2_TILE_NAMES.length);
    expect(tiles.frames).toHaveLength(22); // design §14's count, met exactly
    for (const frame of tiles.frames) {
      expect([frame.width, frame.height]).toEqual([TILE_SIZE, TILE_SIZE]);
    }
  });

  it('marks the §14 flash column hittable, the bands, the glow and the tiles not', () => {
    const hittable = new Set([
      'enemies/abyss-crawler',
      'enemies/stinger',
      'enemies/deep-tender',
      'bosses/ark-pod',
      'bosses/king-fin',
    ]);
    for (const sprite of v2) {
      expect(sprite.hitFlash, sprite.name).toBe(hittable.has(sprite.name));
    }
    expect(byName(sprites, 'enemies/abyss-crawler').animations).toEqual({ walk: [0, 1, 2, 3] });
    expect(byName(sprites, 'enemies/stinger').animations).toEqual({ dart: [0, 1, 2, 3] });
    expect(byName(sprites, 'enemies/deep-tender').animations).toEqual({ pulse: [0, 1, 2, 3] });
    expect(byName(sprites, 'bosses/ark-pod').animations).toEqual({ charge: [0, 1, 2, 3] });
    expect(byName(sprites, 'bg/abyss-flakes').animations).toEqual({ drift: [0, 1] });
    expect(byName(sprites, 'fx/glow-abyss-vent').animations).toEqual({ pulse: [0, 1] });
    framesDiffer(v2);
  });

  it('repeats the bands on a period that fills the frame exactly twice', () => {
    expect(abyss.BAND_TILE_W * 2).toBe(FRAME_W);
  });

  it('draws the wall fully opaque, the vents floor-attached, the flakes sparse, all keyed', () => {
    const wall = byName(sprites, 'bg/abyss-deepwall').frames[0];
    for (let i = 3; i < wall.data.length; i += 4) expect(wall.data[i]).toBe(255);
    expect(seam(wall)).toBeLessThan(24);
    const vents = byName(sprites, 'bg/abyss-vents').frames[0];
    for (let x = 0; x < vents.width; x++) {
      expect(getPixel(vents, x, vents.height - 1)[3], `base ${x}`).toBe(255); // solid base
      const t = topOf(vents, x);
      expect(t, `column ${x}`).toBeLessThan(vents.height);
      expect(t, `headroom ${x}`).toBeGreaterThanOrEqual(4); // key room over every plume
      for (let y = t; y < vents.height; y++) {
        const a = getPixel(vents, x, y)[3];
        expect(a === 0 || a === 255, `vent ${x},${y} alpha`).toBe(true);
        expect(a, `column ${x} row ${y} run`).toBe(255); // one run, solid to the floor
      }
    }
    let tall = 0;
    for (let x = 0; x < vents.width; x++) if (topOf(vents, x) < vents.height - 40) tall++;
    expect(tall).toBeGreaterThan(20); // the smoker field stands
    expect(seam(vents)).toBeLessThan(24);
    for (const frame of byName(sprites, 'bg/abyss-flakes').frames) {
      let opaque = 0;
      for (let i = 3; i < frame.data.length; i += 4) {
        expect(frame.data[i] === 0 || frame.data[i] === 255, `pixel ${i}`).toBe(true);
        if (frame.data[i] === 255) opaque++;
      }
      expect(opaque).toBeGreaterThan(8);
      // the §9 flake law: sparse enough to never hide a bullet lane
      expect(opaque).toBeLessThan((frame.width * frame.height) / 12);
      expect(seam(frame)).toBeLessThan(24);
    }
    const glow = byName(sprites, 'fx/glow-abyss-vent').frames[0];
    expect(byName(sprites, 'fx/glow-abyss-vent').anchor).toEqual([18, 12]);
    for (let i = 3; i < glow.data.length; i += 4) {
      expect([0, 110, 204, 255], `glow alpha ${glow.data[i]}`).toContain(glow.data[i]);
    }
  });

  it('carries terrain-abyss’s twenty tiles verbatim before the two §10 variants', () => {
    const tiles = byName(sprites, 'tiles/terrain-abyss-v2');
    expect(tiles.anchor).toEqual([0, 0]);
    const base = renderTerrainTiles(TERRAIN_TILE_SIZE, 'tiles/terrain-abyss');
    for (let i = 0; i < base.length; i++) {
      expect(imagesEqual(tiles.frames[i], base[i]), abyss.ABYSS_V2_TILE_NAMES[i]).toBe(true);
    }
    expect(Object.keys(tiles.animations)).toEqual([...abyss.ABYSS_V2_TILE_NAMES]);
    // the coral is fully opaque (all-12 mask, W5-11), the gas decor keys
    const coral = tiles.frames[abyss.ABYSS_V2_TILE_NAMES.indexOf('coral')];
    for (let y = 0; y < coral.height; y++) {
      for (let x = 0; x < coral.width; x++) {
        expect(getPixel(coral, x, y)[3], `coral ${x},${y}`).toBe(255);
      }
    }
    const decor = tiles.frames[abyss.ABYSS_V2_TILE_NAMES.indexOf('abyss-glow')];
    let opaque = 0;
    for (let i = 3; i < decor.data.length; i += 4) {
      expect(decor.data[i] === 0 || decor.data[i] === 255, `abyss-glow ${i}`).toBe(true);
      if (decor.data[i] === 255) opaque++;
    }
    expect(opaque).toBeGreaterThan(8);
    expect(opaque).toBeLessThan(decor.width * decor.height - 8);
    // the coral is abyss rock with coral on it, not a foreign tile: most pixels are the set's own
    const rock = tiles.frames[abyss.ABYSS_V2_TILE_NAMES.indexOf('solid')];
    let same = 0;
    for (let y = 0; y < coral.height; y++) {
      for (let x = 0; x < coral.width; x++) {
        const a = getPixel(rock, x, y);
        const b = getPixel(coral, x, y);
        if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]) same++;
      }
    }
    expect(same).toBeGreaterThan(0); // the ground shares the set's rock tones
    const rockColours = new Set(litColours(rock).map((c) => c.join(',')));
    let ground = 0;
    for (const c of litColours(coral)) if (rockColours.has(c.join(','))) ground++;
    expect(ground).toBeGreaterThan((coral.width * coral.height) / 2);
  });

  it('keeps every v2 lit colour at distance ≥ 3 from the reserved ramps', () => {
    // the brine route: no EXEMPT row and no own-ramp skip — the §9 "paint exactly" line belongs
    // to the R5-D6 real art; the stand-ins keep the 3/255 margin (design §14's last paragraph)
    expect(ramps.size).toBeGreaterThanOrEqual(40);
    for (const sprite of v2) {
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
    const again = abyss.generate({ artScale: ART_SCALE, tileSize: TERRAIN_TILE_SIZE });
    expect(bytes(again)).toEqual(bytes(sprites));
  });
});
