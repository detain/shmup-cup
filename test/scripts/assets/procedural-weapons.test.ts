/**
 * The player shot frames (`scripts/assets/procedural/weapons.mjs`). Split out of
 * `procedural.test.ts` by plan R4-P.P2. R4-01.A7 adds the native v2 paths of the blast, the
 * ripple ring and the cyclone segment (the art bible §5's 48×48, 36×66 and 12×14).
 * @module
 */
import { describe, expect, it } from 'vitest';
import { getPixel, imagesEqual } from '../../../scripts/assets/image.mjs';
import { buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import * as weapons from '../../../scripts/assets/procedural/weapons.mjs';
import { color } from '../../../scripts/assets/procedural/common.mjs';
import { byName, opaque, eachOpaque, key } from './procedural-helpers.js';

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

  describe('the native v2 path (R4-01.A7)', () => {
    const sprites = weapons.generate({ artScale: 1.5 });

    it('draws the blast native: four centred 48×48 frames, a disc opening into a ring', () => {
      const blast = byName(sprites, 'shots/blast');
      expect(blast.name).toBe('shots/blast');
      expect(blast.native).toBe(true);
      expect(blast.anchor).toBeNull();
      expect(blast.animations).toEqual({ burst: [0, 1, 2, 3] });
      expect(blast.frames).toHaveLength(4);
      for (const frame of blast.frames) expect([frame.width, frame.height]).toEqual([48, 48]);
      expect(weapons.BLAST_SIZE_V2).toBe(48);
      // Frame 0 is a solid hot disc, the last frame a cool ring with a hollow centre.
      expect(opaque(blast.frames[0], 23, 24)).toBe(true);
      expect(opaque(blast.frames[3], 23, 24)).toBe(false);
      expect(opaque(blast.frames[3], 23, 1)).toBe(true);
      expect(opaque(blast.frames[0], 23, 1)).toBe(false);
      // RT-L5: pixels beyond the old v1 window draw too (the clipped loop bounded
      // every frame at (31, 31); these two pins sit past it, on the ring's body).
      expect(opaque(blast.frames[0], 35, 24)).toBe(true);
      expect(opaque(blast.frames[3], 23, 46)).toBe(true);
      // The opaque bbox is centred on (23.5, 23.5): equal margins on both axes,
      // and the ring reaches past the 32-px v1 window in every frame.
      for (let i = 0; i < blast.frames.length; i++) {
        const frame = blast.frames[i];
        let minX = frame.width;
        let maxX = -1;
        let minY = frame.height;
        let maxY = -1;
        eachOpaque(frame, (x, y) => {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        });
        expect(maxX, `frame ${i}`).toBeGreaterThan(31);
        expect(maxY, `frame ${i}`).toBeGreaterThan(31);
        expect(minX + maxX, `frame ${i}`).toBe(47);
        expect(minY + maxY, `frame ${i}`).toBe(47);
      }
    });

    it('draws the ripple ring native over six centred 36×66 frames, the same size order', () => {
      const ripple = byName(sprites, 'shots/ripple');
      expect(ripple.native).toBe(true);
      expect(ripple.anchor).toBeNull();
      expect(ripple.animations).toEqual({ grow: [0, 1, 2, 3, 4, 5] });
      expect(ripple.frames).toHaveLength(weapons.RIPPLE_FRAMES);
      expect(weapons.RIPPLE_W_V2).toBe(36);
      expect(weapons.RIPPLE_H_V2).toBe(66);
      let previous = 0;
      for (const frame of ripple.frames) {
        expect([frame.width, frame.height]).toEqual([36, 66]);
        // A ring: empty in the middle, the rows it covers growing frame by frame (the order
        // core's `laser.ripple` size pick indexes — rule: keep it).
        expect(opaque(frame, 17, 32)).toBe(false);
        let top = frame.height;
        eachOpaque(frame, (_x, y) => {
          top = Math.min(top, y);
        });
        const span = frame.height - 2 * top;
        expect(span).toBeGreaterThan(previous);
        previous = span;
      }
    });

    it('draws four native 12×14 cyclone segments on a 12-px wave period anchored [0, 6]', () => {
      const cyclone = byName(sprites, 'shots/cyclone');
      expect(cyclone.native).toBe(true);
      expect(cyclone.anchor).toEqual([0, 6]);
      expect(cyclone.animations).toEqual({ swirl: [0, 1, 2, 3] });
      expect(cyclone.frames).toHaveLength(4);
      const core = key(color('#ffffff'));
      const strand = key(color('#c890ff'));
      const glow = key(color('#6040c0'));
      const looks = new Set<string>();
      for (const frame of cyclone.frames) {
        expect([frame.width, frame.height]).toEqual([12, 14]);
        const colours = new Set<string>();
        // The glow fills rows 2…11 in every column and nothing paints outside them; the
        // strands swing inside it and the two core rows are whole across the segment.
        for (let x = 0; x < 12; x++) {
          expect(key(getPixel(frame, x, 6))).toBe(core);
          expect(key(getPixel(frame, x, 7))).toBe(core);
          let strandSeen = false;
          for (let y = 0; y < 14; y++) {
            if (y < 2 || y > 11) {
              expect(opaque(frame, x, y), `${x},${y}`).toBe(false);
              continue;
            }
            expect(opaque(frame, x, y), `${x},${y}`).toBe(true);
            const c = key(getPixel(frame, x, y));
            expect(c === core || c === strand || c === glow, `${x},${y}`).toBe(true);
            colours.add(c);
            if (c === strand) strandSeen = true;
          }
          expect(strandSeen, `column ${x}`).toBe(true);
        }
        expect([...colours].sort()).toEqual([core, glow, strand].sort());
        looks.add(Buffer.from(frame.data).toString('hex'));
      }
      expect(looks.size).toBe(4);
    });

    it('leaves art scale 1 byte-identical to the unmarked call, native unmarked', () => {
      const plain = weapons.generate();
      const one = weapons.generate({ artScale: 1 });
      expect(one.map((s) => s.name)).toEqual(plain.map((s) => s.name));
      for (let i = 0; i < plain.length; i++) {
        expect(plain[i].native).toBeUndefined();
        expect(one[i].native).toBeUndefined();
        expect(one[i].anchor).toEqual(plain[i].anchor);
        for (let f = 0; f < plain[i].frames.length; f++)
          expect(imagesEqual(one[i].frames[f], plain[i].frames[f]), `${plain[i].name}#${f}`).toBe(
            true,
          );
      }
    });

    it('is deterministic: two v2 runs draw the same pixels', () => {
      const again = weapons.generate({ artScale: 1.5 });
      for (let i = 0; i < sprites.length; i++)
        for (let f = 0; f < sprites[i].frames.length; f++)
          expect(imagesEqual(sprites[i].frames[f], again[i].frames[f])).toBe(true);
    });

    it('ships the shot sizes and counts core reads at the default scale', () => {
      const two = buildAtlas({ artScale: 1.5 });
      expect(two.manifest.sprites['shots/blast'].frames).toHaveLength(4);
      expect(two.manifest.sprites['shots/ripple'].frames).toHaveLength(6);
      expect(two.manifest.sprites['shots/cyclone'].frames).toHaveLength(4);
      // Native frames arrive at the atlas unscaled: the bible's sizes, the segment 12 wide.
      expect(two.manifest.frames['shots/blast#0'].w).toBe(48);
      expect(two.manifest.frames['shots/ripple#0'].h).toBe(66);
      expect(two.manifest.frames['shots/cyclone#0'].w).toBe(12);
      expect(two.manifest.frames['shots/cyclone#0'].h).toBe(14);
      const one = buildAtlas({ artScale: 1 });
      // The interim build path is untouched: v1 sizes still scale by 3/2 there.
      expect(one.manifest.frames['shots/blast#0'].w).toBe(weapons.BLAST_SIZE);
      expect(one.manifest.frames['shots/cyclone#0'].w).toBe(weapons.CYCLONE_W);
    });
  });
});
