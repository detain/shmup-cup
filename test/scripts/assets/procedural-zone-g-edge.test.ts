/**
 * Edge cases of the zone G placeholder art (split out of `procedural-zones-fg-edge.test.ts` by
 * R5-P.P5c), beyond `procedural-zone-g.test.ts`: the prism generator — frozen, unique,
 * lower-case kebab path names, the same pixels in **every** frame every run, every frame of a
 * sprite the same size, every sprite that can be hit clearly visible in every frame (a quarter of
 * it ≥ half opaque), animations naming existing frames, backdrops never flashing — and the zone G
 * tileset: the destructible tiles exactly zone A's, the rock only in the set's own colours,
 * opaque.
 *
 * The F/G pair's shared checks (the square arm pieces, the two ramps, the registry, the tileset
 * name files, the rims of every set) stayed with the earlier zone in
 * `procedural-zone-f-edge.test.ts`.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import * as prism from '../../../scripts/assets/procedural/prism.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';
import { byName, bytes, drawn, opaqueColours } from './procedural-zone-helpers.js';

describe('scripts/assets/procedural vault / prism — every sprite (M2-13)', () => {
  const sets: readonly [string, readonly string[], () => SpriteDef[]][] = [
    ['prism', prism.PRISM_SPRITES, prism.generate],
  ];

  it.each(sets)('%s: frozen, unique, kebab path names', (_id, names) => {
    expect(Object.isFrozen(names)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^(bg|enemies|bosses)\/[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(names).toHaveLength(14);
  });

  it.each(sets)(
    '%s: frames of one size, hit sprites clearly visible, animations naming real frames',
    (_id, _names, generate) => {
      for (const sprite of generate()) {
        const [first, ...rest] = sprite.frames;
        for (const frame of rest) {
          expect([frame.width, frame.height], sprite.name).toEqual([first.width, first.height]);
        }
        if (sprite.name.startsWith('bg/')) expect(sprite.hitFlash, sprite.name).toBe(false);
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
});

describe('scripts/assets/procedural/terrain — zones F and G tilesets (M2-13)', () => {
  const sets = terrain.generate();
  const a = byName(sets, 'tiles/terrain-a');

  it.each(['tiles/terrain-prism'])(
    '%s: bricks, cubes and tissue exactly as in zone A; the rock in its own colours only',
    (name) => {
      const set = byName(sets, name);
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
