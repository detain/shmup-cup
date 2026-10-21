/**
 * The player shot frames (`scripts/assets/procedural/weapons.mjs`). Split out of
 * `procedural.test.ts` by plan R4-P.P2.
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import * as weapons from '../../../scripts/assets/procedural/weapons.mjs';
import { byName, opaque, eachOpaque } from './procedural-helpers.js';

describe('scripts/assets/procedural/weapons (M2-03)', () => {
  const sprites = weapons.generate();

  it('draws the Spread Bomb blast: four centred 32×32 frames, a disc opening into a ring', () => {
    const blast = byName(sprites, 'shots/blast');
    expect(blast.anchor).toBeNull();
    expect(blast.frames).toHaveLength(4);
    for (const frame of blast.frames) {
      expect([frame.width, frame.height]).toEqual([weapons.BLAST_SIZE, weapons.BLAST_SIZE]);
    }
    // Frame 0 is solid at its centre, the last frames are hollow there and reach further out.
    expect(opaque(blast.frames[0], 16, 16)).toBe(true);
    expect(opaque(blast.frames[3], 16, 16)).toBe(false);
    expect(opaque(blast.frames[3], 16, 2)).toBe(true);
    expect(opaque(blast.frames[0], 16, 2)).toBe(false);
  });

  it('draws the Ripple ring growing over six centred 24×44 frames', () => {
    const ripple = byName(sprites, 'shots/ripple');
    expect(ripple.anchor).toBeNull();
    expect(ripple.frames).toHaveLength(weapons.RIPPLE_FRAMES);
    let previous = 0;
    for (const frame of ripple.frames) {
      expect([frame.width, frame.height]).toEqual([weapons.RIPPLE_W, weapons.RIPPLE_H]);
      // A ring: empty in the middle, the rows it covers growing frame by frame.
      expect(opaque(frame, 11, 21)).toBe(false);
      let top = frame.height;
      eachOpaque(frame, (_x, y) => {
        top = Math.min(top, y);
      });
      const span = frame.height - 2 * top;
      expect(span).toBeGreaterThan(previous);
      previous = span;
    }
  });

  it('draws four 8×9 Cyclone segments anchored at the left end of their bright core row', () => {
    const cyclone = byName(sprites, 'shots/cyclone');
    expect(cyclone.anchor).toEqual([0, 4]);
    expect(cyclone.frames).toHaveLength(4);
    const looks = new Set<string>();
    for (const frame of cyclone.frames) {
      expect([frame.width, frame.height]).toEqual([weapons.CYCLONE_W, weapons.CYCLONE_H]);
      for (let x = 0; x < frame.width; x++)
        expect(getPixel(frame, x, 4)).toEqual([255, 255, 255, 255]);
      looks.add(Buffer.from(frame.data).toString('hex'));
    }
    expect(looks.size).toBe(4);
  });
});
