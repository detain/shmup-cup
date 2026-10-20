/**
 * Edge cases of the zone I and ending placeholder art (split out of
 * `procedural-zones-hi-edge.test.ts` by R5-P.P5c), beyond `procedural-zone-i.test.ts`:
 *
 * - the abyss and ending generators: frozen, unique, lower-case kebab path names (19 / 6), every
 *   frame of a sprite the same size, every sprite that can be hit clearly visible in every frame
 *   (a quarter of it ≥ half opaque), animations naming existing frames, the same pixels every run;
 * - the ARK turret's sixteen heading frames all different (a half turn of `DIRECTIONS_8` and its
 *   mirror), square so a turned turret keeps its size;
 * - the ending pieces: the silhouettes and the blast frames drawn, every blast frame one size, a
 *   bubble small, the surface a 64 × 8 band drawn in every column;
 * - the zone tileset: the destructible tiles exactly zone A's; the rock only in the set's own
 *   colours, opaque.
 *
 * The M2-14 trio's shared checks (the ramps of the two backdrops, the registry, every sprite the
 * zone H and I content names in the atlas, the tileset name files, the citadel and abyss sets
 * against zone A) stayed with the earlier zone in `procedural-zone-h-edge.test.ts`.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel, imagesEqual, type Image } from '../../../scripts/assets/image.mjs';
import * as abyss from '../../../scripts/assets/procedural/abyss.mjs';
import * as ending from '../../../scripts/assets/procedural/ending.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';
import { byName, bytes, drawn, opaqueColours } from './procedural-zone-helpers.js';

/**
 * The number of pixels of a frame that are not fully transparent.
 *
 * @param image - The frame.
 * @returns Count.
 */
function inked(image: Image): number {
  let n = 0;
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] > 0) n++;
  return n;
}

describe('scripts/assets/procedural citadel / abyss / ending — every sprite (M2-14 tests)', () => {
  const sets: readonly [string, readonly string[], () => SpriteDef[], number][] = [
    ['abyss', abyss.ABYSS_SPRITES, abyss.generate, 19],
    ['ending', ending.ENDING_SPRITES, ending.generate, 6],
  ];

  it.each(sets)('%s: frozen, unique, kebab path names', (_id, names, _generate, count) => {
    expect(Object.isFrozen(names)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^(bg|enemies|bosses|ui)\/[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    expect(names).toHaveLength(count);
  });

  it.each(sets)(
    '%s: frames of one size, hit sprites clearly visible, animations naming real frames',
    (_id, _names, generate) => {
      for (const sprite of generate()) {
        const [first, ...rest] = sprite.frames;
        for (const frame of rest) {
          expect([frame.width, frame.height], sprite.name).toEqual([first.width, first.height]);
        }
        if (sprite.name.startsWith('bg/') || sprite.name.startsWith('ui/')) {
          expect(sprite.hitFlash === true, sprite.name).toBe(false);
        }
        if (sprite.hitFlash === true) {
          for (const frame of sprite.frames) expect(drawn(frame), sprite.name).toBe(true);
        }
        for (const [clip, frames] of Object.entries(sprite.animations ?? {})) {
          expect(frames.length, `${sprite.name}.${clip}`).toBeGreaterThan(0);
          for (const f of frames) {
            expect(f, `${sprite.name}.${clip}`).toBeGreaterThanOrEqual(0);
            expect(f, `${sprite.name}.${clip}`).toBeLessThan(sprite.frames.length);
          }
        }
      }
    },
  );

  it.each(sets)('%s: draws the same pixels in every frame, every run', (_id, _names, generate) => {
    expect(bytes(generate())).toEqual(bytes(generate()));
  });

  it("draws the ARK turret's sixteen headings all different, square frames", () => {
    const turret = byName(abyss.generate(), 'bosses/ark-turret');
    expect(turret.frames).toHaveLength(16);
    for (const frame of turret.frames) {
      expect(frame.width).toBe(frame.height);
      expect(drawn(frame)).toBe(true);
    }
    for (let a = 0; a < 16; a++) {
      for (let b = a + 1; b < 16; b++) {
        expect(imagesEqual(turret.frames[a], turret.frames[b]), `${String(a)} / ${String(b)}`).toBe(
          false,
        );
      }
    }
  });

  it('draws the ending pieces: silhouettes, a four-frame blast of one size, a small bubble', () => {
    const e = ending.generate();
    const citadelShape = byName(e, 'ui/ending-citadel').frames[0];
    const ark = byName(e, 'ui/ending-ark').frames[0];
    // Wide silhouettes (the citadel on the horizon, the whale-class hull).
    expect(citadelShape.width).toBeGreaterThan(40);
    expect(ark.width).toBeGreaterThan(ark.height);
    expect(inked(citadelShape)).toBeGreaterThan((citadelShape.width * citadelShape.height) / 4);
    expect(inked(ark)).toBeGreaterThan((ark.width * ark.height) / 4);
    const blast = byName(e, 'ui/ending-blast');
    expect(blast.frames).toHaveLength(4);
    for (const frame of blast.frames) expect(inked(frame)).toBeGreaterThan(0);
    const bubble = byName(e, 'ui/ending-bubble').frames[0];
    expect(bubble.width).toBeLessThanOrEqual(8);
    expect(inked(bubble)).toBeGreaterThan(0);
    // The surface seen from below: a 64×8 band of light, drawn across its whole width.
    const surface = byName(e, 'ui/ending-surface').frames[0];
    expect([surface.width, surface.height]).toEqual([64, 8]);
    for (let x = 0; x < surface.width; x++) {
      let column = 0;
      for (let y = 0; y < surface.height; y++) if (getPixel(surface, x, y)[3] > 0) column++;
      expect(column, String(x)).toBeGreaterThan(0);
    }
  });
});

describe('scripts/assets/procedural/terrain — zones H and I tilesets (M2-14 tests)', () => {
  const sets = terrain.generate();
  const a = byName(sets, 'tiles/terrain-a');

  it.each(['tiles/terrain-abyss'])(
    '%s: bricks, cubes and tissue exactly as in zone A; the rock in its own colours only',
    (name) => {
      const set = byName(sets, name);
      expect(set.frames).toHaveLength(terrain.TERRAIN_TILES.length);
      for (const tile of ['brick', 'cube', 'tissue'] as const) {
        const i = terrain.TERRAIN_TILES.indexOf(tile);
        expect(Buffer.from(set.frames[i].data).equals(Buffer.from(a.frames[i].data)), tile).toBe(
          true,
        );
      }
      const palette = terrain.TERRAIN_PALETTES[name];
      const solid = set.frames[terrain.TERRAIN_TILES.indexOf('solid')];
      const colours = opaqueColours(solid);
      expect(colours.size).toBeGreaterThan(0);
      for (const c of colours) expect(palette.rock, c).toContain(c);
      for (let i = 3; i < solid.data.length; i += 4) expect(solid.data[i]).toBe(255);
    },
  );
});
