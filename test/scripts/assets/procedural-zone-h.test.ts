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
 * @module
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPixel, imagesEqual, type Image } from '../../../scripts/assets/image.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import * as abyss from '../../../scripts/assets/procedural/abyss.mjs';
import * as citadel from '../../../scripts/assets/procedural/citadel.mjs';
import * as ending from '../../../scripts/assets/procedural/ending.mjs';
import { PROCEDURAL_GENERATORS } from '../../../scripts/assets/procedural/index.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import { byName } from './procedural-zone-helpers.js';

/**
 * The zone H and I boxes W5-3 allows 1 px outside their art: entries whose half-extent is odd, so
 * the port's ×1.5 lands on a `.5` that the rescale tool rounds up (owner decision O4) — a v1 box
 * half of 5 becomes 8, a 16×16 box against the interim segment's 15×15 frame. Exactly the entries
 * `docs/v2-run/helpers/w5pre/hurtbox.mjs` counts for zones H and I (six and one), keyed by this
 * file's `enemy-id part-name` labels. A box not named here must sit inside the atlas frame at
 * both scales; a named box may exceed it by at most the one rounded pixel.
 */
const ROUNDED_BOXES: ReadonlySet<string> = new Set([
  'echo-bulwark plate-1',
  'echo-bulwark plate-2',
  'echo-regent seg-top',
  'echo-regent seg-bottom',
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
