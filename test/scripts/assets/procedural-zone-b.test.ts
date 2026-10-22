/**
 * The zone B placeholder art of plan M2-11 (`scripts/assets/procedural/brine.mjs`), with the
 * shape helpers of `common.mjs` and the zone tilesets of `terrain.mjs` the B/C pair file held
 * (R5-P.P5c split `procedural-zones.test.ts` per zone; cross-zone tests stayed with the earlier
 * zone of their pair): every zone B sprite drawn in its documented order, size and frame count,
 * with hit flashes on everything that can be hit; the brine sea painted only in the ramp zone B's
 * palette cycle names; mirrored jaws; the tilesets sharing every tile's shape in their own colours.
 * Zone C's art is in `procedural-zone-c.test.ts`.
 *
 * Since R5-02.S2 the file also holds the zone-B v2 stand-ins of design §14 (the mirror of
 * `procedural-zone-c.test.ts`'s dune block): the twelve new names at their design sizes, all
 * `native` and absent at art scale 1 (RR-1a), `bg/brine-deep-v2` and `fore/brine-foam` seamless
 * at the half-frame period, `tiles/terrain-reef-v2` carrying `terrain-reef`'s twenty tiles
 * verbatim before its nine §14 variants, and every lit colour of every new sprite at Chebyshev
 * distance ≥ 3 from every reserved palette-cycle ramp (no exemption — no new band rides a cycle).
 *
 * @module
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createImage, getPixel, imagesEqual, type Image } from '../../../scripts/assets/image.mjs';
import { FRAME_H, FRAME_W, WORLD_SCALE } from '../../../scripts/frame.mjs';
import * as brine from '../../../scripts/assets/procedural/brine.mjs';
import { color, drawLine, fillEllipse } from '../../../scripts/assets/procedural/common.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import {
  bytes,
  byName,
  content,
  framesDiffer,
  mirroredVertically,
  opaqueColours,
  seam,
} from './procedural-zone-helpers.js';

interface CycleEntry {
  layer: string;
  colors: string[];
}
interface StageFile {
  cycles?: CycleEntry[];
}

/** The shipped art scale (3/2 — the value the pipeline builds at after R2-01's flip). */
const ART_SCALE = WORLD_SCALE;

/** The shipped tile side at that scale. */
const TERRAIN_TILE_SIZE = terrain.TILE_SIZE;

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

describe('scripts/assets/procedural/common — shape helpers (M2-11)', () => {
  it('fillEllipse paints only the pixels inside the ellipse, handing out their offsets', () => {
    const image = createImage(9, 5);
    const seen: number[] = [];
    fillEllipse(image, 4, 2, 4, 2, (u, v, e) => {
      seen.push(e);
      expect(Math.abs(u)).toBeLessThanOrEqual(1);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      return color('#ffffff');
    });
    expect(Math.max(...seen)).toBeLessThanOrEqual(1);
    expect(getPixel(image, 4, 2)[3]).toBe(255);
    expect(getPixel(image, 0, 0)[3]).toBe(0); // a corner lies outside
    // `null` leaves a pixel alone; shapes overhanging the image are clipped.
    const other = createImage(4, 4);
    fillEllipse(other, 0, 0, 6, 6, () => null);
    expect(Array.from(other.data).every((v) => v === 0)).toBe(true);
  });

  it('drawLine sets both end points, and a wider line more pixels', () => {
    const thin = createImage(10, 10);
    drawLine(thin, 1, 1, 8, 6, color('#ff0000'));
    expect(getPixel(thin, 1, 1)[0]).toBe(255);
    expect(getPixel(thin, 8, 6)[0]).toBe(255);
    const wide = createImage(10, 10);
    drawLine(wide, 1, 1, 8, 6, color('#ff0000'), 3);
    const count = (image: Image): number =>
      Array.from({ length: 100 }, (_v, i) => getPixel(image, i % 10, Math.floor(i / 10))[3]).filter(
        (a) => a > 0,
      ).length;
    expect(count(wide)).toBeGreaterThan(count(thin));
  });
});

describe('scripts/assets/procedural/brine (M2-11)', () => {
  const sprites = brine.generate();

  it('draws the zone B sprites in the documented order, hit flashes on everything that is hit', () => {
    expect(sprites.map((s) => s.name)).toEqual([...brine.BRINE_SPRITES]);
    for (const sprite of sprites) {
      const decoration = sprite.name.startsWith('bg/') || sprite.name === 'bosses/maw-fin';
      expect(sprite.hitFlash, sprite.name).toBe(!decoration);
      expect(sprite.origin).toBe('procedural:brine');
    }
    expect(byName(sprites, 'enemies/froth').frames).toHaveLength(2);
    expect(byName(sprites, 'enemies/froth-bead').frames[0].width).toBe(8);
    expect(byName(sprites, 'bosses/maw-hull').frames[0].width).toBe(64);
    expect(
      mirroredVertically(
        byName(sprites, 'bosses/maw-jaw-top').frames[0],
        byName(sprites, 'bosses/maw-jaw-bottom').frames[0],
      ),
    ).toBe(true);
  });

  it('paints the brine sea only in the four ramp colours zone B cycles (and its bubble rings)', () => {
    const sea = byName(sprites, 'bg/brine-sea');
    expect(sea.anchor).toEqual([0, 0]);
    const image = sea.frames[0];
    expect([image.width, image.height]).toEqual([brine.BRINE_SEA_W, brine.BRINE_SEA_H]);
    const colours = opaqueColours(image);
    for (const tone of brine.BRINE_RAMP) expect(colours.has(tone), tone).toBe(true);
    expect([...colours].filter((c) => !brine.BRINE_RAMP.includes(c))).toEqual(['#8ad0d8']);
    // Every pixel opaque (a band the layer's cycle can repaint), the same ramp as the stage's.
    for (let i = 3; i < image.data.length; i += 4) expect(image.data[i]).toBe(255);
    const stage = JSON.parse(
      readFileSync(new URL('../../../content/stages/zone-b.stage.json', import.meta.url), 'utf8'),
    ) as { cycles: { colors: string[] }[] };
    expect(stage.cycles[0].colors).toEqual([...brine.BRINE_RAMP]);
  });

  it('draws a translucent nebula band that repeats along x', () => {
    const image = byName(sprites, 'bg/brine-nebula').frames[0];
    expect([image.width, image.height]).toEqual([brine.NEBULA_TILE_W, brine.NEBULA_TILE_H]);
    let translucent = 0;
    for (let i = 3; i < image.data.length; i += 4) {
      if (image.data[i] > 0 && image.data[i] < 255) translucent++;
    }
    expect(translucent).toBeGreaterThan(500);
    // The first and last columns join (the cloud density wraps round the tile width).
    let step = 0;
    for (let y = 0; y < image.height; y++) {
      step += Math.abs(getPixel(image, 0, y)[3] - getPixel(image, image.width - 1, y)[3]);
    }
    expect(step / image.height).toBeLessThan(24);
  });

  it('is deterministic', () => {
    const again = brine.generate();
    expect(again.map((s) => Array.from(s.frames[0].data).join())).toEqual(
      sprites.map((s) => Array.from(s.frames[0].data).join()),
    );
  });
});

describe('scripts/assets/procedural/terrain — the zone tilesets (M2-11)', () => {
  const sets = terrain.generate();

  it('draws terrain-a and the zone sets (M2-11 … M2-14) with the same tiles in their own colours', () => {
    expect(sets.map((s) => s.name)).toEqual(Object.keys(terrain.TERRAIN_PALETTES));
    expect(sets.map((s) => s.name)).toEqual([
      'tiles/terrain-a',
      'tiles/terrain-reef',
      'tiles/terrain-dune',
      'tiles/terrain-magma',
      'tiles/terrain-ridge',
      'tiles/terrain-vault',
      'tiles/terrain-prism',
      'tiles/terrain-citadel',
      'tiles/terrain-abyss',
    ]);
    const [a, ...zones] = sets;
    for (const set of zones) {
      expect(set.frames).toHaveLength(a.frames.length);
      expect(set.animations).toEqual(a.animations);
      set.frames.forEach((frame, i) => {
        // The same shape (alpha) in every frame; the rock tiles recoloured.
        const alpha = (image: Image): string =>
          Array.from(image.data)
            .filter((_v, k) => k % 4 === 3)
            .join();
        expect(alpha(frame), `${set.name}#${String(i)}`).toBe(alpha(a.frames[i]));
      });
      const floor = terrain.TERRAIN_TILES.indexOf('floor');
      const palette = terrain.TERRAIN_PALETTES[set.name];
      expect(opaqueColours(set.frames[floor]).has(palette.surface)).toBe(true);
      expect(opaqueColours(set.frames[floor]).has('#8ad0a8')).toBe(false);
    }
    // Zone A's rock keeps its colours.
    expect(opaqueColours(a.frames[terrain.TERRAIN_TILES.indexOf('floor')]).has('#8ad0a8')).toBe(
      true,
    );
  });
});

describe('scripts/assets/procedural/brine — R5-02.S2 v2 stand-ins (zone-b.md §14)', () => {
  const sprites = brine.generate({ artScale: ART_SCALE, tileSize: TERRAIN_TILE_SIZE });
  const v2 = sprites.slice(brine.BRINE_SPRITES.length);

  it('keeps the v1 set byte of the scale-1 path and adds the §14 list only above it', () => {
    expect(brine.generate().map((s) => s.name)).toEqual([...brine.BRINE_SPRITES]);
    expect(brine.generate({ artScale: 1 }).map((s) => s.name)).toEqual([...brine.BRINE_SPRITES]);
    expect(bytes(sprites.slice(0, brine.BRINE_SPRITES.length))).toEqual(bytes(brine.generate()));
    expect(v2.map((s) => s.name)).toEqual([...brine.BRINE_V2_SPRITES]);
    for (const sprite of v2) {
      expect(sprite.native, sprite.name).toBe(true);
      expect(sprite.origin, sprite.name).toBe('procedural:brine');
    }
    expect(brine.BRINE_V2_TILE_NAMES.slice(0, 20)).toEqual([...terrain.TERRAIN_TILES]);
  });

  it('draws every new name at its design size and frame count', () => {
    const table: Record<string, [number, number, number]> = {
      'enemies/brine-mine': [4, 16, 16],
      'enemies/spume-skipper': [4, 18, 11],
      'bosses/herald-fin': [1, 24, 9],
      'bosses/maw-spine': [2, 18, 18],
      'bg/brine-deep-v2': [1, brine.BAND_TILE_W, brine.DEEP_H],
      'fore/brine-foam': [2, brine.BAND_TILE_W, brine.FOAM_H],
      'decor/brine-fan-1': [1, 30, 24],
      'decor/brine-fan-2': [1, 30, 24],
      'decor/brine-fan-3': [1, 30, 24],
      'decor/brine-kelp': [4, 12, 48],
      'decor/brine-glow-vent': [2, 24, 24],
    };
    for (const [name, [frames, w, h]] of Object.entries(table)) {
      const sprite = byName(sprites, name);
      expect(sprite.frames, name).toHaveLength(frames);
      for (const frame of sprite.frames) {
        expect([frame.width, frame.height], name).toEqual([w, h]);
      }
    }
    // the far band spans the full frame; the foam sits under the §14 height cap
    expect(brine.DEEP_H).toBe(FRAME_H);
    expect(brine.FOAM_H).toBe(48);
    const tiles = byName(sprites, 'tiles/terrain-reef-v2');
    expect(tiles.frames).toHaveLength(brine.BRINE_V2_TILE_NAMES.length);
    expect(tiles.frames).toHaveLength(29);
    for (const frame of tiles.frames) {
      expect([frame.width, frame.height]).toEqual([TERRAIN_TILE_SIZE, TERRAIN_TILE_SIZE]);
    }
  });

  it('marks the two enemies and the two boss parts hittable, the decor and bands not', () => {
    const hittable = new Set([
      'enemies/brine-mine',
      'enemies/spume-skipper',
      'bosses/herald-fin',
      'bosses/maw-spine',
    ]);
    for (const sprite of v2) {
      expect(sprite.hitFlash, sprite.name).toBe(hittable.has(sprite.name));
    }
    expect(byName(sprites, 'enemies/brine-mine').animations).toEqual({
      idle: [0, 1],
      armed: [2, 3],
    });
    expect(byName(sprites, 'enemies/spume-skipper').animations).toEqual({ flap: [0, 1, 2, 3] });
    expect(byName(sprites, 'bosses/maw-spine').animations).toEqual({ flex: [0, 1] });
    expect(byName(sprites, 'fore/brine-foam').animations).toEqual({ drift: [0, 1] });
    expect(byName(sprites, 'decor/brine-kelp').animations).toEqual({ sway: [0, 1, 2, 3] });
    expect(byName(sprites, 'decor/brine-glow-vent').animations).toEqual({ pulse: [0, 1] });
    framesDiffer(v2);
  });

  it('repeats the bands on a period that fills the frame exactly twice', () => {
    expect(brine.BAND_TILE_W * 2).toBe(FRAME_W);
  });

  it('draws the deep band fully opaque and wrapping seamless, the foam binary and sparse', () => {
    const deep = byName(sprites, 'bg/brine-deep-v2').frames[0];
    for (let i = 3; i < deep.data.length; i += 4) expect(deep.data[i]).toBe(255);
    expect(seam(deep)).toBe(0);
    // across the wrap seam the pixels stay continuous (streaks and nubs keep off the boundary)
    for (let y = 0; y < deep.height; y++) {
      const a = getPixel(deep, 0, y);
      const b = getPixel(deep, deep.width - 1, y);
      const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
      expect(d, `row ${String(y)}`).toBeLessThanOrEqual(40);
    }
    // the water column reads top-to-bottom and the reef silhouette sits at its foot
    const colours = opaqueColours(deep);
    expect(colours.has('#3d607f')).toBe(true);
    expect(colours.has('#0c1826')).toBe(true);
    expect(colours.has('#1a2f4a')).toBe(true);
    const foam = byName(sprites, 'fore/brine-foam').frames[0];
    let opaque = 0;
    for (let i = 3; i < foam.data.length; i += 4) {
      expect(foam.data[i] === 0 || foam.data[i] === 255, `pixel ${String(i)}`).toBe(true);
      if (foam.data[i] === 255) opaque++;
    }
    expect(opaque).toBeGreaterThan(100);
    expect(opaque).toBeLessThan(foam.width * 22);
    for (let y = 22; y < foam.height; y++) {
      for (let x = 0; x < foam.width; x++) {
        expect(getPixel(foam, x, y)[3], `foam at ${String(x)},${String(y)}`).toBe(0);
      }
    }
    expect(seam(foam)).toBeLessThan(24);
    const drift = byName(sprites, 'fore/brine-foam').frames[1];
    expect(imagesEqual(foam, drift)).toBe(false);
  });

  it('keeps the decor binary except the two design-named glows at the soft alpha', () => {
    for (const name of [
      'decor/brine-fan-1',
      'decor/brine-fan-2',
      'decor/brine-fan-3',
      'decor/brine-kelp',
    ]) {
      for (const frame of byName(sprites, name).frames) {
        for (let i = 3; i < frame.data.length; i += 4) {
          expect(frame.data[i] === 0 || frame.data[i] === 255, `${name} ${String(i)}`).toBe(true);
        }
      }
    }
    // 200 = the SOFT_ALPHA of common.mjs, the only value allowed between the binary two here
    const softCount = (image: Image): number =>
      Array.from(image.data).filter((_v, i) => i % 4 === 3 && image.data[i] === 200).length;
    for (const name of ['enemies/brine-mine', 'decor/brine-glow-vent']) {
      for (const frame of byName(sprites, name).frames) {
        for (let i = 3; i < frame.data.length; i += 4) {
          const a = frame.data[i];
          expect(a === 0 || a === 200 || a === 255, `${name} ${String(i)}`).toBe(true);
        }
      }
    }
    expect(softCount(byName(sprites, 'enemies/brine-mine').frames[2])).toBe(0);
    expect(softCount(byName(sprites, 'enemies/brine-mine').frames[3])).toBe(12);
    expect(softCount(byName(sprites, 'decor/brine-glow-vent').frames[0])).toBe(12);
    expect(softCount(byName(sprites, 'decor/brine-glow-vent').frames[1])).toBe(16);
  });

  it('carries terrain-reef’s twenty tiles verbatim before the nine variants', () => {
    const tiles = byName(sprites, 'tiles/terrain-reef-v2');
    expect(tiles.anchor).toEqual([0, 0]);
    const base = terrain.renderTerrainTiles(TERRAIN_TILE_SIZE, 'tiles/terrain-reef');
    expect(base).toHaveLength(20);
    for (let i = 0; i < base.length; i++) {
      expect(imagesEqual(tiles.frames[i], base[i]), brine.BRINE_V2_TILE_NAMES[i]).toBe(true);
    }
    expect(Object.keys(tiles.animations)).toEqual([...brine.BRINE_V2_TILE_NAMES]);
    // the fill, floor, ceiling and vent classes are fully opaque …
    for (const name of [
      'coral-floor-a',
      'coral-floor-b',
      'coral-floor-c',
      'floor-edge',
      'ceil-edge',
      'vent-rock',
      'vent-rock-broken',
    ] as const) {
      const frame = tiles.frames[brine.BRINE_V2_TILE_NAMES.indexOf(name)];
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          expect(getPixel(frame, x, y)[3], `${name} ${String(x)},${String(y)}`).toBe(255);
        }
      }
    }
    // … and the corners are stepped binaries that attach solid along the floor and open above
    for (const name of ['coral-corner-outer', 'coral-corner-inner'] as const) {
      const frame = tiles.frames[brine.BRINE_V2_TILE_NAMES.indexOf(name)];
      let open = 0;
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          const a = getPixel(frame, x, y)[3];
          expect(a === 0 || a === 255, `${name} ${String(x)},${String(y)} alpha`).toBe(true);
          if (a === 0) open++;
        }
      }
      expect(open, name).toBeGreaterThanOrEqual(8);
      for (let x = 0; x < frame.width; x++) {
        expect(getPixel(frame, x, frame.height - 1)[3], `${name} attach row ${String(x)}`).toBe(
          255,
        );
      }
    }
  });

  it('keeps every lit colour at distance ≥ 3 from the reserved ramps', () => {
    for (const sprite of v2) {
      for (const frame of sprite.frames) {
        const seen = new Set<string>();
        for (const rgb of litColours(frame)) {
          const key = rgb.join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          for (const [hex, ramp] of ramps) {
            expect(
              chebyshev(rgb, ramp),
              `${sprite.name} rgb(${key}) vs ${hex}`,
            ).toBeGreaterThanOrEqual(3);
          }
        }
      }
    }
  });

  it('runs byte-identical twice', () => {
    const again = brine.generate({ artScale: ART_SCALE, tileSize: TERRAIN_TILE_SIZE });
    expect(bytes(again)).toEqual(bytes(sprites));
  });
});
