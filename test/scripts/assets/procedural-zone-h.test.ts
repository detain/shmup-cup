/**
 * The zone H placeholder art of plan M2-14 (`scripts/assets/procedural/citadel.mjs`, with the
 * abyss and ending generators and the zone tilesets of `terrain.mjs` this pair file held — split
 * out of `procedural-zones-hi.test.ts` by R5-P.P5c; the tests that examine more than one zone
 * stayed with the earlier zone of the pair): the zone H sprite list drawn in its documented order,
 * registered and deterministic, its citadel wall's running lights painted only in the ramp the
 * zone's palette cycle names, the conduits repeating every 32 px, two more tilesets with their own
 * rims, and every hurtbox of the zone H and I rosters inside the sprite drawn for it. The tests
 * that examine only zone I's art and the ending pieces are in `procedural-zone-i.test.ts`.
 *
 * Since R5-08.S2 the file also holds the zone-H v2 stand-ins of design §13 (the mirror of
 * `procedural-zone-d.test.ts`'s block): the four new names at their design sizes, all `native`
 * and absent at art scale 1 (RR-1a) — the gate sentry and the drifting standard, the tapestry
 * band seamless on a period that divides its half-frame tile, and `tiles/terrain-citadel-v2`
 * carrying `terrain-citadel`'s twenty tiles verbatim before the four §9 variants. Nothing is
 * drawn for the parade's echoes or the rebuilt Sovereign (§7): they reuse the existing sprites.
 * Every lit colour of every new sprite stands at Chebyshev distance ≥ 3 from every reserved
 * palette-cycle ramp — no EXEMPT row was needed (brine's route).
 *
 * @module
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPixel, imagesEqual, type Image } from '../../../scripts/assets/image.mjs';
import { FRAME_W, WORLD_SCALE } from '../../../scripts/frame.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import * as abyss from '../../../scripts/assets/procedural/abyss.mjs';
import * as citadel from '../../../scripts/assets/procedural/citadel.mjs';
import * as ending from '../../../scripts/assets/procedural/ending.mjs';
import { PROCEDURAL_GENERATORS } from '../../../scripts/assets/procedural/index.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import { bytes, byName, content, drawn, framesDiffer, seam } from './procedural-zone-helpers.js';

/**
 * The zone H and I boxes W5-3 allows 1 px outside their art: entries whose half-extent is odd, so
 * the port's ×1.5 lands on a `.5` that the rescale tool rounds up (owner decision O4) — a v1 box
 * half of 5 becomes 8, a 16×16 box against the interim segment's 15×15 frame. The w5pre helper
 * (`docs/v2-run/helpers/w5pre/hurtbox.mjs`) counted six and one for zones H and I on the pre-S4c
 * rosters; R5-08.S4c re-rigs the regent echo's tentacles to seg-top/bottom-1..4 rows at radius
 * 7.5, whose 15-px box sits inside that 15×15 frame at no allowance, so those two rounded entries
 * left this list with R5-08.FIX2 (RT-H F-1) — the anti-rot check below keeps the two in step.
 * A box not named here must sit inside the atlas frame at both scales; a named box may exceed it
 * by at most the one rounded pixel.
 */
const ROUNDED_BOXES: ReadonlySet<string> = new Set([
  'echo-bulwark plate-1',
  'echo-bulwark plate-2',
  'iron-sovereign emitter-top',
  'iron-sovereign emitter-bottom',
  'abyss-ark heart',
]);

/**
 * The `#rrggbb` colours of an image's opaque pixels, with their counts.
 *
 * @param image - The image.
 * @returns Colour → pixel count.
 */
function colours(image: Image): Map<string, number> {
  const out = new Map<string, number>();
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const [r, g, b, a] = getPixel(image, x, y);
      if (a !== 255) continue;
      const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
      out.set(hex, (out.get(hex) ?? 0) + 1);
    }
  }
  return out;
}

/**
 * The share of a tile's edge pixels whose opposite edge pixel matches (within 48 per channel).
 *
 * @param image - The tile.
 * @param down - Compare the top and bottom rows instead of the first and last columns.
 * @returns 0 … 1.
 */
function wraps(image: Image, down = false): number {
  const n = down ? image.width : image.height;
  let same = 0;
  for (let k = 0; k < n; k++) {
    const a = down ? getPixel(image, k, 0) : getPixel(image, 0, k);
    const b = down ? getPixel(image, k, image.height - 1) : getPixel(image, image.width - 1, k);
    if (a.every((v, c) => Math.abs(v - b[c]) <= 48)) same++;
  }
  return same / n;
}

describe('scripts/assets/procedural — zones H and I, the ending scenes (M2-14)', () => {
  const h = citadel.generate();
  const i = abyss.generate();
  const e = ending.generate();

  it('draws every sprite in order, registered, deterministic, hittable ones with a hit flash', () => {
    expect(h.map((s) => s.name)).toEqual([...citadel.CITADEL_SPRITES]);
    expect(i.map((s) => s.name)).toEqual([...abyss.ABYSS_SPRITES]);
    expect(e.map((s) => s.name)).toEqual([...ending.ENDING_SPRITES]);
    const ids = PROCEDURAL_GENERATORS.map((g) => g.id);
    for (const id of ['citadel', 'abyss', 'ending']) expect(ids).toContain(id);
    for (const [gen, out] of [
      [citadel, h],
      [abyss, i],
      [ending, e],
    ] as const) {
      const again = gen.generate();
      out.forEach((sprite, k) => {
        expect(sprite.frames.length, sprite.name).toBeGreaterThan(0);
        sprite.frames.forEach((frame, f) =>
          expect(imagesEqual(frame, again[k].frames[f]), sprite.name).toBe(true),
        );
      });
    }
    for (const sprite of [...h, ...i]) {
      const decoration = sprite.name.startsWith('bg/') || /ark-(bow|hull|stern)$/.test(sprite.name);
      expect(sprite.hitFlash, sprite.name).toBe(!decoration);
    }
    for (const sprite of e) expect(sprite.hitFlash, sprite.name).toBe(false);
    // Frames of animated sprites differ.
    for (const sprite of [...h, ...i, ...e]) {
      if (sprite.frames.length < 2) continue;
      expect(imagesEqual(sprite.frames[0], sprite.frames[1]), sprite.name).toBe(false);
    }
  });

  it("paints the citadel's running lights and the deep's specks only in their cycles' ramps", () => {
    for (const [band, ramp, w, hgt] of [
      [
        byName(h, 'bg/citadel-wall'),
        citadel.CITADEL_RAMP,
        citadel.WALL_TILE_W,
        citadel.WALL_TILE_H,
      ],
      [byName(i, 'bg/abyss-murk'), abyss.ABYSS_RAMP, abyss.MURK_TILE_W, abyss.MURK_TILE_H],
    ] as const) {
      const image = band.frames[0];
      expect([image.width, image.height]).toEqual([w, hgt]);
      const used = colours(image);
      // All four ramp colours appear (the cycle has something to roll), and they are a few pixels.
      for (const colour of ramp) expect(used.get(colour) ?? 0, colour).toBeGreaterThan(0);
      let rampPixels = 0;
      for (const colour of ramp) rampPixels += used.get(colour) ?? 0;
      expect(rampPixels).toBeLessThan((w * hgt) / 8);
      // An opaque tile that repeats across and down.
      expect([...used.values()].reduce((a, b) => a + b, 0)).toBe(w * hgt);
      expect(wraps(image)).toBeGreaterThan(0.9);
      expect(wraps(image, true)).toBeGreaterThan(0.8);
    }
    // The conduits repeat every 32 px (their periods divide the tile), the spires join up.
    const pipes = byName(h, 'bg/citadel-pipes').frames[0];
    expect(citadel.PIPES_TILE_W % 32).toBe(0);
    for (let x = 0; x + 32 < pipes.width; x++) {
      for (let y = 0; y < pipes.height; y++) {
        expect(getPixel(pipes, x, y), `${String(x)}, ${String(y)}`).toEqual(
          getPixel(pipes, x + 32, y),
        );
      }
    }
    expect(abyss.SPIRES_TILE_W % 32).toBe(0);
    expect(wraps(byName(i, 'bg/abyss-spires').frames[0])).toBeGreaterThan(0.75);
  });

  it('draws two more tilesets with their own rims', () => {
    const sets = terrain.generate().map((s) => s.name);
    expect(sets).toEqual(expect.arrayContaining(['tiles/terrain-citadel', 'tiles/terrain-abyss']));
    const rims = Object.values(terrain.TERRAIN_PALETTES).map((p) => p.surface);
    expect(new Set(rims).size).toBe(rims.length);
  });

  it('fits every hurtbox of the zone H and I rosters inside the sprite drawn for it', () => {
    const { manifest } = buildAtlas();
    const size = (sprite: string): [number, number] => {
      const frame = manifest.frames[manifest.sprites[sprite]?.frames[0] ?? ''];
      return frame === undefined ? [0, 0] : [frame.w, frame.h];
    };
    let boxes = 0;
    const roundedSeen = new Set<string>();
    for (const roster of ['zone-h', 'zone-i']) {
      const { enemies } = JSON.parse(
        readFileSync(
          new URL(`../../../content/enemies/${roster}.enemies.json`, import.meta.url),
          'utf8',
        ),
      ) as {
        enemies: Array<{
          id: string;
          sprite?: string;
          hurtbox?: { hw: number; hh: number };
          boss?: {
            parts: Array<{
              name: string;
              sprite?: string;
              hurtbox?: { hw: number; hh: number };
              radius?: number;
            }>;
          };
        }>;
      };
      for (const enemy of enemies) {
        const all: Array<[string, string | undefined, number, number]> = [];
        if (enemy.hurtbox !== undefined)
          all.push([enemy.id, enemy.sprite, enemy.hurtbox.hw, enemy.hurtbox.hh]);
        for (const part of enemy.boss?.parts ?? []) {
          if (part.hurtbox !== undefined)
            all.push([part.name, part.sprite, part.hurtbox.hw, part.hurtbox.hh]);
          if (part.radius !== undefined)
            all.push([part.name, part.sprite, part.radius, part.radius]);
        }
        for (const [who, sprite, hw, hh] of all) {
          if (sprite === undefined) continue; // an armour box without a sprite
          const label = `${enemy.id} ${who}`;
          const [w, hgt] = size(sprite);
          const allowance = ROUNDED_BOXES.has(label) ? 1 : 0;
          if (allowance === 1) roundedSeen.add(label);
          expect(2 * hw, label).toBeLessThanOrEqual(w + allowance);
          expect(2 * hh, label).toBeLessThanOrEqual(hgt + allowance);
          boxes++;
        }
      }
    }
    expect(boxes).toBeGreaterThan(40);
    // The allowance list must not rot: every named box has to be a box of these rosters.
    expect([...roundedSeen].sort()).toEqual([...ROUNDED_BOXES].sort());
  });
});

/** A `cycles` entry of a stage file (only what the ramp margin tests read). */
interface CycleEntry {
  layer: string;
  colors: string[];
}
interface StageFile {
  cycles?: CycleEntry[];
}

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
const reservedRamps = (() => {
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

describe('scripts/assets/procedural/citadel — R5-08.S2 v2 stand-ins (zone-h.md §13)', () => {
  const sprites = citadel.generate({ artScale: WORLD_SCALE, tileSize: terrain.TILE_SIZE });
  const v2 = sprites.slice(citadel.CITADEL_SPRITES.length);

  it('keeps the fourteen v1 names at scale 1 and adds the §13 list only above it', () => {
    const atOne = citadel.generate();
    expect(atOne.map((s) => s.name)).toEqual([...citadel.CITADEL_SPRITES]);
    for (const sprite of atOne) expect(sprite.native, sprite.name).toBeFalsy();
    expect(Object.isFrozen(citadel.CITADEL_V2_SPRITES)).toBe(true);
    expect(citadel.CITADEL_V2_SPRITES.length).toBe(4);
    expect(sprites.map((s) => s.name)).toEqual([
      ...citadel.CITADEL_SPRITES,
      ...citadel.CITADEL_V2_SPRITES,
    ]);
    for (const sprite of v2) {
      expect(sprite.native, sprite.name).toBe(true);
      expect(sprite.origin, sprite.name).toBe('procedural:citadel');
    }
    expect(citadel.CITADEL_V2_TILE_NAMES.length).toBe(24);
    expect(citadel.CITADEL_V2_TILE_NAMES.slice(0, 20)).toEqual([...terrain.TERRAIN_TILES]);
    expect(citadel.CITADEL_V2_TILE_NAMES.slice(20)).toEqual([
      'plate',
      'rivet-plate',
      'grate',
      'gate-door',
    ]);
    expect([...citadel.CITADEL_V2_TILES]).toEqual([...citadel.CITADEL_V2_TILE_NAMES.slice(20)]);
  });

  it('draws every new name at its design size and frame count', () => {
    const table: Record<string, [number, number, number]> = {
      'enemies/gate-sentry': [2, 20, 16],
      'enemies/iron-banner': [2, 16, 16],
      'bg/citadel-banner': [1, citadel.BAND_TILE_W, citadel.BANNER_H],
      'tiles/terrain-citadel-v2': [24, terrain.TILE_SIZE, terrain.TILE_SIZE],
    };
    for (const [name, [frames, w, h]] of Object.entries(table)) {
      const sprite = byName(sprites, name);
      expect(sprite.frames, name).toHaveLength(frames);
      for (const frame of sprite.frames) {
        expect([frame.width, frame.height], name).toEqual([w, h]);
      }
    }
    // the §13 box law: the sentry's 8×8 hurtbox needs 16 px in both axes — it has them
    expect(citadel.BAND_TILE_W * 2).toBe(FRAME_W);
    expect(citadel.BANNER_H).toBe(12 * terrain.TILE_SIZE);
  });

  it('marks the sentry and the standard hittable, the band and the tiles not', () => {
    const sentry = byName(sprites, 'enemies/gate-sentry');
    const standard = byName(sprites, 'enemies/iron-banner');
    expect(sentry.hitFlash).toBe(true);
    expect(standard.hitFlash).toBe(true);
    expect(byName(sprites, 'bg/citadel-banner').hitFlash === true).toBe(false);
    expect(byName(sprites, 'tiles/terrain-citadel-v2').hitFlash === true).toBe(false);
    expect(sentry.animations).toEqual({ charge: [0, 1] });
    expect(standard.animations).toEqual({ wave: [0, 1] });
    expect(byName(sprites, 'bg/citadel-banner').anchor).toEqual([0, 0]);
    expect(Object.keys(byName(sprites, 'tiles/terrain-citadel-v2').animations ?? {})).toEqual([
      ...citadel.CITADEL_V2_TILE_NAMES,
    ]);
    for (const frame of [...sentry.frames, ...standard.frames]) {
      expect(drawn(frame)).toBe(true);
    }
    framesDiffer([sentry, standard]);
  });

  it('seams the tapestry band — an 80-px period dividing the tile, fully opaque', () => {
    const band = byName(sprites, 'bg/citadel-banner').frames[0];
    const period = 80;
    expect(band.width % period).toBe(0);
    for (let y = 0; y < band.height; y++) {
      for (let x = 0; x < band.width; x++) {
        const a = getPixel(band, x, y);
        const b = getPixel(band, (x + period) % band.width, y);
        expect(a, `${x},${y}`).toEqual(b);
      }
    }
    for (let i = 3; i < band.data.length; i += 4) expect(band.data[i]).toBe(255);
    expect(seam(band)).toBe(0);
    // a background draws no transparency and no alpha beyond the binary pair
    const colours = new Set<string>();
    for (let i = 0; i < band.data.length; i += 4) {
      colours.add(`${band.data[i]},${band.data[i + 1]},${band.data[i + 2]}`);
    }
    expect(colours.size).toBeLessThanOrEqual(8);
  });

  it('carries terrain-citadel’s twenty tiles verbatim before the four §9 variants', () => {
    const tiles = byName(sprites, 'tiles/terrain-citadel-v2');
    const base = terrain.renderTerrainTiles(terrain.TILE_SIZE, 'tiles/terrain-citadel');
    expect(tiles.frames).toHaveLength(24);
    for (let i = 0; i < 20; i++) {
      expect(imagesEqual(tiles.frames[i], base[i]), citadel.CITADEL_V2_TILE_NAMES[i]).toBe(true);
    }
    for (const name of ['plate', 'rivet-plate', 'gate-door'] as const) {
      const frame = tiles.frames[citadel.CITADEL_V2_TILE_NAMES.indexOf(name)];
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          expect(getPixel(frame, x, y)[3], `${name} ${x},${y}`).toBe(255);
        }
      }
    }
    // the grate is the §9 decor: empty mask, binary pixels, sparse enough to never hide a lane
    const grate = tiles.frames[citadel.CITADEL_V2_TILE_NAMES.indexOf('grate')];
    let opaque = 0;
    for (let i = 3; i < grate.data.length; i += 4) {
      expect(grate.data[i] === 0 || grate.data[i] === 255, `grate ${i}`).toBe(true);
      if (grate.data[i] === 255) opaque++;
    }
    expect(opaque).toBeGreaterThan(8);
    expect(opaque).toBeLessThan(grate.width * grate.height - 8);
    // the variants are the citadel’s own work, not a base tile restated
    for (const i of [20, 21, 22, 23]) {
      expect(
        base.some((b) => imagesEqual(tiles.frames[i], b)),
        citadel.CITADEL_V2_TILE_NAMES[i],
      ).toBe(false);
    }
    // and not each other’s restatement either
    const variantKeys = ['plate', 'rivet-plate', 'grate', 'gate-door'] as const;
    for (let a = 0; a < variantKeys.length; a++) {
      for (let b = a + 1; b < variantKeys.length; b++) {
        expect(
          imagesEqual(tiles.frames[20 + a], tiles.frames[20 + b]),
          `${variantKeys[a]} vs ${variantKeys[b]}`,
        ).toBe(false);
      }
    }
  });

  it('keeps every v2 lit colour at distance ≥ 3 from the reserved ramps', () => {
    for (const sprite of v2) {
      for (const frame of sprite.frames) {
        const seen = new Map<string, number[]>();
        for (const rgb of litColours(frame)) {
          const key = rgb.map((v) => String(v).padStart(3, '0')).join();
          if (seen.has(key)) continue;
          seen.set(key, rgb);
        }
        for (const [key, rgb] of seen) {
          for (const [hex, ramp] of reservedRamps) {
            expect(chebyshev(rgb, ramp), `${sprite.name} #${key} vs ${hex}`).toBeGreaterThanOrEqual(
              3,
            );
          }
        }
      }
    }
  });

  it('runs byte-identical twice', () => {
    const again = citadel.generate({ artScale: WORLD_SCALE, tileSize: terrain.TILE_SIZE });
    expect(bytes(again)).toEqual(bytes(sprites));
  });
});
