/**
 * The advanced bosses’ parts (`scripts/assets/procedural/bosses.mjs`). Split out of
 * `procedural.test.ts` by plan R4-P.P2.
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import * as bossParts from '../../../scripts/assets/procedural/bosses.mjs';
import { PROCEDURAL_GENERATORS } from '../../../scripts/assets/procedural/index.mjs';
import { byName, opaque, key } from './procedural-helpers.js';

describe('scripts/assets/procedural/bosses (M2-09)', () => {
  const sprites = bossParts.generate();

  it('draws the advanced bosses’ parts, each with a hit flash', () => {
    expect(sprites.map((s) => s.name)).toEqual([
      'bosses/turret',
      'bosses/orb',
      'bosses/raid-hull',
      'bosses/captain-shell',
    ]);
    const sizes = sprites.map((s) => [s.frames[0].width, s.frames[0].height, s.frames.length]);
    expect(sizes).toEqual([
      [16, 16, 16],
      [12, 12, 2],
      [96, 40, 1],
      [28, 20, 2],
    ]);
    for (const sprite of sprites) expect(sprite.hitFlash, sprite.name).toBe(true);
  });

  it('points the turret’s barrel along each frame’s heading (k × 22.5°, clockwise from +x)', () => {
    const turret = byName(sprites, 'bosses/turret');
    const muzzle = key([0xf8, 0xd0, 0x30, 255]);
    // The muzzle (the barrel's last pixels) lies 6–8 px from the centre along the heading.
    const headings: Array<[number, number]> = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ];
    for (let q = 0; q < 4; q++) {
      const frame = turret.frames[q * 4];
      const [dx, dy] = headings[q];
      const x = Math.round(7.5 + dx * 7);
      const y = Math.round(7.5 + dy * 7);
      expect(key(getPixel(frame, x, y)), `frame ${String(q * 4)}`).toBe(muzzle);
      // …and never on the opposite side.
      const ox = Math.round(7.5 - dx * 7);
      const oy = Math.round(7.5 - dy * 7);
      expect(key(getPixel(frame, ox, oy))).not.toBe(muzzle);
    }
  });

  it('keeps the orb round and the hull opaque edge to edge', () => {
    const [orb] = byName(sprites, 'bosses/orb').frames;
    expect(opaque(orb, 0, 0)).toBe(false);
    expect(opaque(orb, 5, 5)).toBe(true);
    const [hull] = byName(sprites, 'bosses/raid-hull').frames;
    for (const [x, y] of [
      [0, 0],
      [95, 39],
      [48, 20],
    ]) {
      expect(opaque(hull, x, y)).toBe(true);
    }
  });

  it('is deterministic and registered with the procedural generators', () => {
    const again = bossParts.generate();
    for (let i = 0; i < sprites.length; i++) {
      for (let f = 0; f < sprites[i].frames.length; f++) {
        expect(
          Buffer.from(again[i].frames[f].data).equals(Buffer.from(sprites[i].frames[f].data)),
        ).toBe(true);
      }
    }
    expect(PROCEDURAL_GENERATORS.map((g) => g.id)).toContain('bosses');
  });
});
