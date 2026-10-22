/**
 * The zone D placeholder art of plan M2-12 (`scripts/assets/procedural/magma.mjs`, split out of
 * `procedural-zones-de.test.ts` by R5-P.P5c): every zone D sprite drawn in its documented order,
 * size and frame count, with hit flashes on everything that can be hit; the lava lake painted only
 * in the ramp zone D's palette cycle names; volcano peaks that join at the tile edge; every
 * hurtbox of the roster inside the sprite drawn for it. Zone E's art is in
 * `procedural-zone-e.test.ts`.
 *
 * Since R5-04.S2 the file also holds the zone-D v2 stand-ins of design §14 (the mirror of
 * `procedural-zone-c.test.ts`'s block): the ten new names at their design sizes, all `native` and
 * absent at art scale 1 (RR-1a), the `tiles/terrain-magma-v2` grid carrying `terrain-magma`'s
 * twenty tiles verbatim before its four §10 variants, the bands of §9 seamless at the half-frame
 * period — `bg/magma-chimney`'s glowing tips painted in exactly the stage's frozen MAGMA ramp
 * colours (rule 2 of the palette-cycle scan names it in its EXEMPT row until S5a lays the §9
 * stack) — and every other lit colour at Chebyshev distance ≥ 3 from every reserved
 * palette-cycle ramp.
 *
 * @module
 */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPixel, imagesEqual, type Image } from '../../../scripts/assets/image.mjs';
import { FRAME_W, PLAYFIELD_H, TILE_SIZE, WORLD_SCALE } from '../../../scripts/frame.mjs';
import * as magma from '../../../scripts/assets/procedural/magma.mjs';
import {
  renderTerrainTiles,
  TERRAIN_TILES,
  TILE_SIZE as TERRAIN_TILE_SIZE,
} from '../../../scripts/assets/procedural/terrain.mjs';
import {
  bytes,
  byName,
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

describe('scripts/assets/procedural/magma (M2-12)', () => {
  const sprites = magma.generate();

  it('draws the zone D sprites in the documented order, hit flashes on everything that is hit', () => {
    expect(sprites.map((s) => s.name)).toEqual([...magma.MAGMA_SPRITES]);
    for (const sprite of sprites) {
      expect(sprite.hitFlash, sprite.name).toBe(!sprite.name.startsWith('bg/'));
      expect(sprite.origin).toBe('procedural:magma');
      const [first, ...rest] = sprite.frames;
      for (const frame of rest)
        expect([frame.width, frame.height]).toEqual([first.width, first.height]);
    }
    expect(byName(sprites, 'enemies/magma-cone').frames).toHaveLength(2);
    expect(byName(sprites, 'bosses/bastion-core').animations).toEqual({ glow: [0, 1] });
    expect(byName(sprites, 'bosses/bastion-hull').frames[0].width).toBe(56);
    hurtboxesInside('enemies/zone-d.enemies.json');
  });

  it('paints the lava lake only in the four ramp colours zone D cycles (and its crust floes)', () => {
    const lava = byName(sprites, 'bg/magma-lava');
    expect(lava.anchor).toEqual([0, 0]);
    const image = lava.frames[0];
    expect([image.width, image.height]).toEqual([magma.LAVA_TILE_W, magma.LAVA_TILE_H]);
    const colours = opaqueColours(image);
    for (const tone of magma.MAGMA_RAMP) expect(colours.has(tone), tone).toBe(true);
    expect([...colours].filter((c) => !magma.MAGMA_RAMP.includes(c))).toEqual(['#2a1a18']);
    for (let i = 3; i < image.data.length; i += 4) expect(image.data[i]).toBe(255);
    const stage = content<{ cycles: { colors: string[] }[] }>('stages/zone-d.stage.json');
    expect(stage.cycles[0].colors).toEqual([...magma.MAGMA_RAMP_V2]);
  });

  it('draws volcano peaks with glowing craters and smoke that join at the tile edge', () => {
    const image = byName(sprites, 'bg/magma-peaks').frames[0];
    expect([image.width, image.height]).toEqual([magma.PEAKS_TILE_W, magma.PEAKS_TILE_H]);
    expect(seam(image)).toBeLessThan(24);
    expect(opaqueColours(image).has('#f8b048')).toBe(true); // a crater
    let smoke = 0;
    for (let i = 3; i < image.data.length; i += 4) {
      if (image.data[i] > 0 && image.data[i] < 255) smoke++;
    }
    expect(smoke).toBeGreaterThan(20);
  });

  it('is deterministic', () => {
    expect(magma.generate().map((s) => Array.from(s.frames[0].data).join())).toEqual(
      sprites.map((s) => Array.from(s.frames[0].data).join()),
    );
  });
});

describe('scripts/assets/procedural/magma — R5-04.S2 v2 stand-ins (zone-d.md §14)', () => {
  const sprites = magma.generate({ artScale: ART_SCALE, tileSize: TERRAIN_TILE_SIZE });
  const v2 = sprites.slice(magma.MAGMA_SPRITES.length);

  it('keeps the v1 set of the scale-1 path and adds the §14 list only above it', () => {
    expect(magma.generate().map((s) => s.name)).toEqual([...magma.MAGMA_SPRITES]);
    expect(magma.generate({ artScale: 1 }).map((s) => s.name)).toEqual([...magma.MAGMA_SPRITES]);
    expect(v2.map((s) => s.name)).toEqual([...magma.MAGMA_V2_SPRITES]);
    for (const sprite of v2) {
      expect(sprite.native, sprite.name).toBe(true);
      expect(sprite.origin, sprite.name).toBe('procedural:magma');
    }
    expect(magma.MAGMA_V2_TILE_NAMES.slice(0, 20)).toEqual([...TERRAIN_TILES]);
  });

  it('draws every new name at its design size and frame count', () => {
    const table: Record<string, [number, number, number]> = {
      'enemies/slag-mine': [4, 15, 15],
      'enemies/magma-geode': [4, 24, 18],
      'bosses/bastion-prow': [1, 27, 39],
      'bosses/bastion-tower': [2, 36, 27],
      'bosses/bastion-pod': [4, 18, 18],
      'bg/magma-deep': [1, magma.BAND_TILE_W, magma.DEEP_H],
      'bg/magma-chimney': [1, magma.BAND_TILE_W, magma.CHIMNEY_H],
      'bg/cinder-drift': [2, magma.BAND_TILE_W, magma.DRIFT_H],
      'fx/glow-magma-vent': [2, 36, 24],
    };
    for (const [name, [frames, w, h]] of Object.entries(table)) {
      const sprite = byName(sprites, name);
      expect(sprite.frames, name).toHaveLength(frames);
      for (const frame of sprite.frames) {
        expect([frame.width, frame.height], name).toEqual([w, h]);
      }
    }
    // the bastion's prow under the bible §5.7 height cap, like zone C's scorpion shell
    expect(byName(sprites, 'bosses/bastion-prow').frames[0].height).toBeLessThanOrEqual(
      Math.round(0.6 * PLAYFIELD_H),
    );
    const tiles = byName(sprites, 'tiles/terrain-magma-v2');
    expect(tiles.frames).toHaveLength(magma.MAGMA_V2_TILE_NAMES.length);
    expect(tiles.frames).toHaveLength(24); // design §14's count, met exactly
    for (const frame of tiles.frames) {
      expect([frame.width, frame.height]).toEqual([TILE_SIZE, TILE_SIZE]);
    }
  });

  it('marks the §14 flash column hittable, the bands, the glow and the tiles not', () => {
    const hittable = new Set([
      'enemies/slag-mine',
      'enemies/magma-geode',
      'bosses/bastion-prow',
      'bosses/bastion-tower',
      'bosses/bastion-pod',
    ]);
    for (const sprite of v2) {
      expect(sprite.hitFlash, sprite.name).toBe(hittable.has(sprite.name));
    }
    expect(byName(sprites, 'enemies/slag-mine').animations).toEqual({ pulse: [0, 1, 2, 3] });
    expect(byName(sprites, 'enemies/magma-geode').animations).toEqual({
      idle: [0, 1],
      hatch: [2, 3],
    });
    expect(byName(sprites, 'bosses/bastion-tower').animations).toEqual({ turn: [0, 1] });
    expect(byName(sprites, 'bosses/bastion-pod').animations).toEqual({ pulse: [0, 1, 2, 3] });
    expect(byName(sprites, 'bg/cinder-drift').animations).toEqual({ drift: [0, 1] });
    expect(byName(sprites, 'fx/glow-magma-vent').animations).toEqual({ pulse: [0, 1] });
    framesDiffer(v2);
  });

  it('repeats the bands on a period that fills the frame exactly twice', () => {
    expect(magma.BAND_TILE_W * 2).toBe(FRAME_W);
  });

  it('draws the cave depth fully opaque and the fringe and veil keyed, seamless, binary', () => {
    const deep = byName(sprites, 'bg/magma-deep').frames[0];
    for (let i = 3; i < deep.data.length; i += 4) expect(deep.data[i]).toBe(255);
    const chimney = byName(sprites, 'bg/magma-chimney').frames[0];
    const bottomOf = (image: Image, x: number): number => {
      for (let y = image.height - 1; y >= 0; y--) if (getPixel(image, x, y)[3] > 0) return y;
      return -1;
    };
    for (let x = 0; x < chimney.width; x++) {
      const t = topOf(chimney, x);
      expect(t, `column ${x}`).toBe(0); // hung from the ceiling edge — no floating strand
      let hole = false;
      for (let y = 0; y < chimney.height; y++) {
        const a = getPixel(chimney, x, y)[3];
        expect(a === 0 || a === 255, `chimney ${x},${y} alpha`).toBe(true);
        expect(a > 0 && hole, `column ${x} floats`).toBe(false);
        if (a === 0) hole = true;
      }
      const b = bottomOf(chimney, x);
      expect(chimney.height - b).toBeGreaterThanOrEqual(40); // key room under every strand
      expect(
        Math.abs(b - bottomOf(chimney, (x + 1) % chimney.width)),
        `fringe step ${x}`,
      ).toBeLessThanOrEqual(3);
    }
    expect(seam(chimney)).toBeLessThan(24);
    for (const frame of byName(sprites, 'bg/cinder-drift').frames) {
      let opaque = 0;
      for (let i = 3; i < frame.data.length; i += 4) {
        expect(frame.data[i] === 0 || frame.data[i] === 255, `pixel ${i}`).toBe(true);
        if (frame.data[i] === 255) opaque++;
      }
      expect(opaque).toBeGreaterThan(8);
      // the §9 veil law: sparse enough to never hide a bullet lane
      expect(opaque).toBeLessThan((frame.width * frame.height) / 12);
      expect(seam(frame)).toBeLessThan(24);
    }
    const glow = byName(sprites, 'fx/glow-magma-vent').frames[0];
    expect(byName(sprites, 'fx/glow-magma-vent').anchor).toEqual([18, 12]);
    for (let i = 3; i < glow.data.length; i += 4) {
      expect([0, 110, 204, 255], `glow alpha ${glow.data[i]}`).toContain(glow.data[i]);
    }
  });

  it('paints the chimney tips in exactly the stage-cycled MAGMA colours', () => {
    const stage = content<StageFile>('stages/zone-d.stage.json');
    const mid = (stage.cycles ?? []).find((c) => c.layer === 'mid');
    expect(mid?.colors.length).toBeGreaterThan(0);
    expect([...magma.MAGMA_RAMP_V2].sort()).toEqual([...(mid?.colors ?? [])].sort());
    const seen = opaqueColours(byName(sprites, 'bg/magma-chimney').frames[0]);
    const ramp = new Set(magma.MAGMA_RAMP_V2);
    const inRamp = [...seen].filter((c) => ramp.has(c));
    // the glowing tiers are ramp[1] … ramp[5] — five exact ramp colours
    expect(inRamp.sort()).toEqual(['#7c1e08', '#b0330c', '#d95f14', '#ef8a26', '#f7bd4d']);
    // the strand body is the zone's own rock palette only
    const rock = new Set(['#3a2a2a', '#2c2020', '#4a3432', '#8a3a24', '#1c1414']);
    for (const c of seen) expect(ramp.has(c) || rock.has(c), c).toBe(true);
  });

  it('carries terrain-magma’s twenty tiles verbatim before the four §10 variants', () => {
    const tiles = byName(sprites, 'tiles/terrain-magma-v2');
    expect(tiles.anchor).toEqual([0, 0]);
    const base = renderTerrainTiles(TERRAIN_TILE_SIZE, 'tiles/terrain-magma');
    for (let i = 0; i < base.length; i++) {
      expect(imagesEqual(tiles.frames[i], base[i]), magma.MAGMA_V2_TILE_NAMES[i]).toBe(true);
    }
    expect(Object.keys(tiles.animations)).toEqual([...magma.MAGMA_V2_TILE_NAMES]);
    // the three colliding variants are fully opaque (all-12 masks, W5-11), the decor keys
    for (const name of ['obsidian', 'brick-hot', 'lava-drip'] as const) {
      const frame = tiles.frames[magma.MAGMA_V2_TILE_NAMES.indexOf(name)];
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          expect(getPixel(frame, x, y)[3], `${name} ${x},${y}`).toBe(255);
        }
      }
    }
    const drip = tiles.frames[magma.MAGMA_V2_TILE_NAMES.indexOf('lava-drip')];
    for (let x = 0; x < drip.width; x++) {
      expect(getPixel(drip, x, 0)[3], `lava-drip attach ${x}`).toBe(255);
    }
    const vent = tiles.frames[magma.MAGMA_V2_TILE_NAMES.indexOf('vent')];
    let opaque = 0;
    for (let i = 3; i < vent.data.length; i += 4) {
      expect(vent.data[i] === 0 || vent.data[i] === 255, `vent ${i}`).toBe(true);
      if (vent.data[i] === 255) opaque++;
    }
    expect(opaque).toBeGreaterThan(8);
    expect(opaque).toBeLessThan(vent.width * vent.height - 8);
    // brick-hot is the brick scoured, not a foreign tile: most of its pixels are the base's
    const brick = base[17];
    const hot = tiles.frames[magma.MAGMA_V2_TILE_NAMES.indexOf('brick-hot')];
    let same = 0;
    for (let y = 0; y < brick.height; y++) {
      for (let x = 0; x < brick.width; x++) {
        const a = getPixel(brick, x, y);
        const b = getPixel(hot, x, y);
        if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]) same++;
      }
    }
    expect(same).toBeGreaterThan((brick.width * brick.height) / 2);
  });

  it('keeps every lit colour except the chimney at distance ≥ 3 from the reserved ramps', () => {
    for (const sprite of v2) {
      if (sprite.name === 'bg/magma-chimney') continue; // the glowing tips ARE the ramp (§9, P7)
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
    const again = magma.generate({ artScale: ART_SCALE, tileSize: TERRAIN_TILE_SIZE });
    expect(bytes(again)).toEqual(bytes(sprites));
  });
});
