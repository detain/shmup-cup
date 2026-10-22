/**
 * Edge cases of the zone E placeholder art (split out of `procedural-zones-de-edge.test.ts` by
 * R5-P.P5c), beyond `procedural-zone-e.test.ts`:
 *
 * - the tempest generator: frozen, unique, lower-case kebab path names, the same pixels every run,
 *   every frame of a sprite the same size, every sprite that can be hit clearly visible in every
 *   frame (a quarter of it ≥ half opaque), every animated sprite's frames really differ and its
 *   animations name existing frames, backdrops never flash — the fix of this test round: the
 *   squall jumper's two frames were identical (the flame that should flicker was drawn where the
 *   fuselage and the wings cover it), so its jet never flickered;
 * - the zone tileset: the destructible tiles (brick, cube, tissue) look exactly like zone A's; the
 *   solid rock is drawn only in the set's own rock colours.
 *
 * The D/E pair's shared checks (the registry, both bands, the tileset name files, the rims of all
 * five sets) stayed with the earlier zone in `procedural-zone-d-edge.test.ts`.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import * as tempest from '../../../scripts/assets/procedural/tempest.mjs';
import * as terrain from '../../../scripts/assets/procedural/terrain.mjs';
import { WORLD_SCALE } from '../../../scripts/frame.mjs';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';
import { byName, bytes, drawn, opaqueColours } from './procedural-zone-helpers.js';

describe('scripts/assets/procedural magma / tempest — every sprite (M2-12)', () => {
  const sets: readonly [string, readonly string[], () => SpriteDef[]][] = [
    ['tempest', tempest.TEMPEST_SPRITES, tempest.generate],
  ];

  it.each(sets)('%s: frozen, unique, kebab path names', (_id, names) => {
    expect(Object.isFrozen(names)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^(bg|enemies|bosses)\/[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it.each(sets)(
    '%s: frames of one size, hit sprites clearly visible, animations that animate',
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
        const text = sprite.frames.map((f) => Buffer.from(f.data).toString('base64'));
        if (sprite.frames.length > 1) {
          expect(new Set(text).size, sprite.name).toBe(sprite.frames.length);
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

  it.each(sets)('%s: draws the same pixels every run', (_id, _names, generate) => {
    expect(bytes(generate())).toEqual(bytes(generate()));
  });
});

describe('scripts/assets/procedural tempest — R5-05.S2 v2 stand-ins', () => {
  const sets: readonly [string, readonly string[], () => SpriteDef[]][] = [
    [
      'tempest v2',
      tempest.TEMPEST_V2_SPRITES,
      () => tempest.generate({ artScale: WORLD_SCALE, tileSize: terrain.TILE_SIZE }),
    ],
  ];

  it.each(sets)(
    '%s: frozen names, frames of one size, every hit sprite clearly visible',
    (_id, names, generate) => {
      expect(Object.isFrozen(names)).toBe(true);
      expect(new Set(names).size).toBe(names.length);
      for (const sprite of generate()) {
        const [first, ...rest] = sprite.frames;
        for (const frame of rest) {
          expect([frame.width, frame.height], sprite.name).toEqual([first.width, first.height]);
        }
        if (sprite.hitFlash === true) {
          for (const frame of sprite.frames) expect(drawn(frame), sprite.name).toBe(true);
        }
      }
    },
  );

  it.each(sets)('%s: draws the same pixels every run', (_id, _names, generate) => {
    const hash = (sprites: SpriteDef[]): string[] =>
      sprites.map(
        (s) => s.name + ':' + s.frames.map((f) => Buffer.from(f.data).toString('base64')).join('|'),
      );
    expect(hash(generate())).toEqual(hash(generate()));
  });
});

describe('scripts/assets/procedural/terrain — zones D and E tilesets (M2-12)', () => {
  const sets = terrain.generate();
  const a = byName(sets, 'tiles/terrain-a');

  it.each(['tiles/terrain-ridge'])(
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
      // Every pixel of the solid tile is rock (no hole in the ground).
      for (let i = 3; i < solid.data.length; i += 4) expect(solid.data[i]).toBe(255);
    },
  );
});
