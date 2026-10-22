/**
 * The zone E placeholder art of plan M2-12 (`scripts/assets/procedural/tempest.mjs`, split out of
 * `procedural-zones-de.test.ts` by R5-P.P5c): every zone E sprite drawn in its documented order,
 * size and frame count, with hit flashes on everything that can be hit; the storm clouds painted
 * only in the ramp zone E's palette cycle names, open sky between; the ridge and rain bands
 * repeating along x; mirrored chest lids; every hurtbox of the roster inside the sprite drawn for
 * it. Zone D's art is in `procedural-zone-d.test.ts`.
 *
 * Since R5-05.S2 the file also holds the zone-E v2 stand-ins of design §14 (the mirror of
 * `procedural-zone-c.test.ts`'s dune block): the twelve new names at their design sizes, all
 * `native` and absent at art scale 1 (RR-1a), the `tiles/terrain-ridge-v2` grid carrying
 * `terrain-ridge`'s twenty tiles verbatim before its sixteen §10 variants, the three bands of §9
 * seamless at the half-frame period — `bg/storm-flash` painted in exactly the stage's frozen
 * STORM ramp colours — and every other new colour at Chebyshev distance ≥ 3 from every reserved
 * palette-cycle ramp.
 *
 * @module
 */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPixel, imagesEqual, type Image } from '../../../scripts/assets/image.mjs';
import { FRAME_H, FRAME_W, PLAYFIELD_H, TILE_SIZE, WORLD_SCALE } from '../../../scripts/frame.mjs';
import * as tempest from '../../../scripts/assets/procedural/tempest.mjs';
import {
  renderTerrainTiles,
  TERRAIN_TILES,
  TILE_SIZE as TERRAIN_TILE_SIZE,
} from '../../../scripts/assets/procedural/terrain.mjs';
import {
  byName,
  bytes,
  content,
  framesDiffer,
  hurtboxesInside,
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

describe('scripts/assets/procedural/tempest (M2-12)', () => {
  const sprites = tempest.generate();

  it('draws the zone E sprites in the documented order, hit flashes on everything that is hit', () => {
    expect(sprites.map((s) => s.name)).toEqual([...tempest.TEMPEST_SPRITES]);
    for (const sprite of sprites) {
      const decoration =
        sprite.name.startsWith('bg/') ||
        sprite.name === 'bosses/steed-tail' ||
        sprite.name === 'bosses/steed-fin';
      expect(sprite.hitFlash, sprite.name).toBe(!decoration);
      expect(sprite.origin).toBe('procedural:tempest');
    }
    expect(byName(sprites, 'enemies/thunderhead').animations).toEqual({ flicker: [0, 1, 2] });
    const top = byName(sprites, 'bosses/steed-lid-top').frames[0];
    const bottom = byName(sprites, 'bosses/steed-lid-bottom').frames[0];
    for (let y = 0; y < top.height; y++) {
      for (let x = 0; x < top.width; x++) {
        expect(getPixel(top, x, y).join()).toBe(getPixel(bottom, x, top.height - 1 - y).join());
      }
    }
    hurtboxesInside('enemies/zone-e.enemies.json');
  });

  it('paints the storm clouds only in the four ramp colours zone E cycles, open sky between', () => {
    const image = byName(sprites, 'bg/storm-clouds').frames[0];
    expect([image.width, image.height]).toEqual([tempest.CLOUDS_TILE_W, tempest.CLOUDS_TILE_H]);
    const colours = opaqueColours(image);
    expect([...colours].sort()).toEqual([...tempest.STORM_RAMP].sort());
    let open = 0;
    for (let i = 3; i < image.data.length; i += 4) {
      expect([0, 255]).toContain(image.data[i]);
      if (image.data[i] === 0) open++;
    }
    expect(open).toBeGreaterThan(200);
    expect(seam(image)).toBeLessThan(24);
    const stage = content<{ cycles: { colors: string[] }[] }>('stages/zone-e.stage.json');
    expect(stage.cycles[0].colors).toEqual([...tempest.STORM_RAMP_V2]);
  });

  it('draws a jagged ridge band and a translucent rain band, both repeating along x', () => {
    const ridge = byName(sprites, 'bg/storm-ridge').frames[0];
    expect([ridge.width, ridge.height]).toEqual([tempest.RIDGE_TILE_W, tempest.RIDGE_TILE_H]);
    expect(seam(ridge)).toBeLessThan(24);
    for (let x = 0; x < ridge.width; x++) expect(getPixel(ridge, x, ridge.height - 1)[3]).toBe(255);
    const rain = byName(sprites, 'bg/storm-rain').frames[0];
    expect([rain.width, rain.height]).toEqual([tempest.RAIN_TILE_W, tempest.RAIN_TILE_H]);
    let drops = 0;
    for (let i = 3; i < rain.data.length; i += 4) {
      expect(rain.data[i]).toBeLessThan(255); // never opaque: the sky shows through
      if (rain.data[i] > 0) drops++;
    }
    expect(drops).toBeGreaterThan(100);
  });

  it('is deterministic', () => {
    expect(tempest.generate().map((s) => Array.from(s.frames[0].data).join())).toEqual(
      sprites.map((s) => Array.from(s.frames[0].data).join()),
    );
  });
});

describe('scripts/assets/procedural/tempest — R5-05.S2 v2 stand-ins (zone-e.md §14)', () => {
  const sprites = tempest.generate({ artScale: ART_SCALE, tileSize: TERRAIN_TILE_SIZE });
  const v2 = sprites.slice(tempest.TEMPEST_SPRITES.length);

  it('keeps the v1 set byte of the scale-1 path and adds the §14 list only above it', () => {
    expect(tempest.generate().map((s) => s.name)).toEqual([...tempest.TEMPEST_SPRITES]);
    expect(tempest.generate({ artScale: 1 }).map((s) => s.name)).toEqual([
      ...tempest.TEMPEST_SPRITES,
    ]);
    expect(v2.map((s) => s.name)).toEqual([...tempest.TEMPEST_V2_SPRITES]);
    for (const sprite of v2) {
      expect(sprite.native, sprite.name).toBe(true);
      expect(sprite.origin, sprite.name).toBe('procedural:tempest');
    }
    expect(tempest.RIDGE_V2_TILE_NAMES.slice(0, 20)).toEqual([...TERRAIN_TILES]);
    expect(tempest.RIDGE_V2_TILES.length).toBe(16);
  });

  it('draws every new name at its design size and frame count', () => {
    const table: Record<string, [number, number, number]> = {
      'enemies/ice-slab': [4, 21, 21],
      'enemies/lightbird': [4, 24, 12],
      'bosses/storm-eye-core': [4, 24, 24],
      'bosses/storm-eye-cloud': [2, 27, 18],
      'bosses/storm-eye-ring': [4, 45, 45],
      'bosses/steed-mane': [4, 27, 24],
      'bosses/steed-crest': [2, 30, 18],
      'bosses/steed-flank': [1, 15, 27],
      'bg/storm-sky': [1, tempest.BAND_TILE_W, tempest.SKY_H],
      'bg/storm-flash': [1, tempest.BAND_TILE_W, tempest.FLASH_H],
      'bg/storm-gust': [1, tempest.BAND_TILE_W, tempest.GUST_H],
    };
    for (const [name, [frames, w, h]] of Object.entries(table)) {
      const sprite = byName(sprites, name);
      expect(sprite.frames, name).toHaveLength(frames);
      for (const frame of sprite.frames) {
        expect([frame.width, frame.height], name).toEqual([w, h]);
      }
    }
    // the sky stands at the full frame height design §14 asks it (the width is the bands' §9
    // half-frame deviation, asserted in its own case)
    expect(tempest.SKY_H).toBe(FRAME_H);
    // the eye's ring under the bible §5.7 height cap, like zone C's scorpion shell
    expect(byName(sprites, 'bosses/storm-eye-ring').frames[0].height).toBeLessThanOrEqual(
      Math.round(0.6 * PLAYFIELD_H),
    );
    const tiles = byName(sprites, 'tiles/terrain-ridge-v2');
    expect(tiles.frames).toHaveLength(tempest.RIDGE_V2_TILE_NAMES.length);
    expect(tiles.frames).toHaveLength(36);
    for (const frame of tiles.frames) {
      expect([frame.width, frame.height]).toEqual([TILE_SIZE, TILE_SIZE]);
    }
  });

  it('marks the two enemies, the eye and the crest hittable, the decor and the bands not', () => {
    const hittable = new Set([
      'enemies/ice-slab',
      'enemies/lightbird',
      'bosses/storm-eye-core',
      'bosses/storm-eye-cloud',
      // R5-05.S4b: design §8 places the crest as armour with a hurtbox — it takes the
      // player's shots (clink) exactly like the lids, so its stand-in needs the flash sibling.
      'bosses/steed-crest',
    ]);
    for (const sprite of v2) {
      expect(sprite.hitFlash, sprite.name).toBe(hittable.has(sprite.name));
    }
    expect(byName(sprites, 'enemies/ice-slab').animations).toEqual({ tumble: [0, 1, 2, 3] });
    expect(byName(sprites, 'enemies/lightbird').animations).toEqual({ flap: [0, 1, 2, 3] });
    expect(byName(sprites, 'bosses/storm-eye-core').animations).toEqual({ pulse: [0, 1, 2, 3] });
    expect(byName(sprites, 'bosses/storm-eye-cloud').animations).toEqual({ puff: [0, 1] });
    expect(byName(sprites, 'bosses/storm-eye-ring').animations).toEqual({ swirl: [0, 1, 2, 3] });
    expect(byName(sprites, 'bosses/steed-mane').animations).toEqual({ drift: [0, 1, 2, 3] });
    expect(byName(sprites, 'bosses/steed-crest').animations).toEqual({ turn: [0, 1] });
    framesDiffer(v2);
  });

  it('repeats the bands on a period that fills the frame exactly twice', () => {
    expect(tempest.BAND_TILE_W * 2).toBe(FRAME_W);
  });

  it('draws the sky fully opaque, the flash flat in the ramp and the gust sparse binaries', () => {
    const sky = byName(sprites, 'bg/storm-sky').frames[0];
    for (let i = 3; i < sky.data.length; i += 4) expect(sky.data[i]).toBe(255);
    const flash = byName(sprites, 'bg/storm-flash').frames[0];
    for (let x = 0; x < flash.width; x++) {
      const t = topOf(flash, x);
      expect(t, `column ${x}`).toBeLessThan(flash.height);
      for (let y = t; y < flash.height; y++) expect(getPixel(flash, x, y)[3]).toBe(255);
      expect(flash.height - t).toBeGreaterThanOrEqual(24);
      expect(Math.abs(t - topOf(flash, (x + 1) % flash.width)), `step at ${x}`).toBeLessThanOrEqual(
        3,
      );
    }
    expect(seam(flash)).toBeLessThan(24);
    for (let i = 3; i < flash.data.length; i += 4) {
      expect(flash.data[i] === 0 || flash.data[i] === 255, `pixel ${i}`).toBe(true);
    }
    const gust = byName(sprites, 'bg/storm-gust').frames[0];
    let streaks = 0;
    for (let i = 3; i < gust.data.length; i += 4) {
      expect(gust.data[i] === 0 || gust.data[i] === 255, `pixel ${i}`).toBe(true);
      if (gust.data[i] === 255) streaks++;
    }
    expect(streaks).toBeGreaterThan(80);
    expect(streaks).toBeLessThan((gust.width * gust.height) / 8);
  });

  it('paints the flash in exactly the stage-cycled STORM colours', () => {
    const stage = content<StageFile>('stages/zone-e.stage.json');
    const far = (stage.cycles ?? []).find((c) => c.layer === 'far');
    expect(far?.colors.length).toBeGreaterThan(0);
    expect([...tempest.STORM_RAMP_V2].sort()).toEqual([...(far?.colors ?? [])].sort());
    const seen = opaqueColours(byName(sprites, 'bg/storm-flash').frames[0]);
    expect([...seen].sort()).toEqual([...(far?.colors ?? [])].sort());
  });

  it('carries terrain-ridge’s twenty tiles verbatim before the sixteen variants', () => {
    const tiles = byName(sprites, 'tiles/terrain-ridge-v2');
    expect(tiles.anchor).toEqual([0, 0]);
    const base = renderTerrainTiles(TERRAIN_TILE_SIZE, 'tiles/terrain-ridge');
    for (let i = 0; i < base.length; i++) {
      expect(imagesEqual(tiles.frames[i], base[i]), tempest.RIDGE_V2_TILE_NAMES[i]).toBe(true);
    }
    expect(Object.keys(tiles.animations)).toEqual([...tempest.RIDGE_V2_TILE_NAMES]);
    // the solid classes are fully opaque, the corners are stepped binaries, the fringe is
    // contiguous from the ceiling, and the decor keys
    for (const name of [
      'solid-2',
      'solid-3',
      'floor-2',
      'floor-3',
      'brick-crack',
      'brick-crack-2',
    ] as const) {
      const frame = tiles.frames[tempest.RIDGE_V2_TILE_NAMES.indexOf(name)];
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          expect(getPixel(frame, x, y)[3], `${name} ${x},${y}`).toBe(255);
        }
      }
    }
    for (const name of [
      'corner-outer-left',
      'corner-outer-right',
      'corner-inner-left',
      'corner-inner-right',
      'ceil-corner-outer',
      'ceil-corner-inner',
    ] as const) {
      const frame = tiles.frames[tempest.RIDGE_V2_TILE_NAMES.indexOf(name)];
      const ceil = name.startsWith('ceil-');
      let open = 0;
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          const a = getPixel(frame, x, y)[3];
          expect(a === 0 || a === 255, `${name} ${x},${y} alpha`).toBe(true);
          if (a === 0) open++;
        }
      }
      expect(open, name).toBeGreaterThanOrEqual(8);
      const edgeRow = ceil ? 0 : frame.height - 1;
      for (let x = 0; x < frame.width; x++) {
        expect(getPixel(frame, x, edgeRow)[3], `${name} attach row ${x}`).toBe(255);
      }
    }
    const fringe = tiles.frames[tempest.RIDGE_V2_TILE_NAMES.indexOf('ceiling-2')];
    for (let x = 0; x < fringe.width; x++) {
      expect(getPixel(fringe, x, 0)[3]).toBe(255);
      let hole = false;
      for (let y = 0; y < fringe.height; y++) {
        const on = getPixel(fringe, x, y)[3] > 0;
        expect(on && hole, `ceiling-2 column ${x} floats`).toBe(false);
        if (!on) hole = true;
        expect(on ? 255 : 0, `ceiling-2 ${x},${y} alpha`).toBe(getPixel(fringe, x, y)[3]);
      }
    }
    for (const name of ['decor-scree', 'decor-ice-patch', 'decor-pine'] as const) {
      const frame = tiles.frames[tempest.RIDGE_V2_TILE_NAMES.indexOf(name)];
      let opaque = 0;
      for (let i = 3; i < frame.data.length; i += 4) {
        expect(frame.data[i] === 0 || frame.data[i] === 255, `${name} ${i}`).toBe(true);
        if (frame.data[i] === 255) opaque++;
      }
      expect(opaque, name).toBeGreaterThan(8);
      expect(opaque, name).toBeLessThan(frame.width * frame.height - 8);
    }
  });

  it('keeps every lit colour except the flash at distance ≥ 3 from the reserved ramps', () => {
    for (const sprite of v2) {
      if (sprite.name === 'bg/storm-flash') continue; // the flat band IS the ramp (§9, R5-P.P7)
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
    const again = tempest.generate({ artScale: ART_SCALE, tileSize: TERRAIN_TILE_SIZE });
    expect(bytes(again)).toEqual(bytes(sprites));
  });
});
