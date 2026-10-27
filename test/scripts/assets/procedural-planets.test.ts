/**
 * The zone-map planet generator (`scripts/assets/procedural/planets.mjs`) — the nine unique
 * procedural worlds the campaign map draws behind its letters (w15).
 *
 * The names are the nine `map/planet-<letter>` sprites `core/ui`'s `MAP_PLANET_SPRITES` lists and
 * the `planets` generator registers. Like the title backdrop they are v2-only (decision RR-1a: at
 * scale 1 the generator answers nothing, so the scale-1 atlas and its digest pin never move), each
 * ships as one **native** frame of the map node class (`scaleLength(18, 3/2)` = 27 px at 3/2, the
 * sphere 25 px inside it), anchored at the disc's centre — the point `MapScene` places on the
 * node. Test files hold literal sizes by convention (`docs/dev/conventions.md` § Frame numbers).
 */
import { describe, expect, it } from 'vitest';
import { generate, PLANET_SPRITES } from '../../../scripts/assets/procedural/planets.mjs';
import { bytes, byName, opaqueColours } from './procedural-zone-helpers.js';

/** The v2 build's planets. */
const v2 = generate({ artScale: 3 / 2 });

describe('scripts/assets/procedural/planets.mjs — the nine zone-map planets (w15)', () => {
  it('draws nothing at scale 1 (RR-1a: no v1 stand-in, the digest pin never moves)', () => {
    expect(generate()).toEqual([]);
    expect(generate({ artScale: 1 })).toEqual([]);
  });

  it('draws the nine letters, in a–i order', () => {
    expect(PLANET_SPRITES).toEqual([
      'map/planet-a',
      'map/planet-b',
      'map/planet-c',
      'map/planet-d',
      'map/planet-e',
      'map/planet-f',
      'map/planet-g',
      'map/planet-h',
      'map/planet-i',
    ]);
    expect(v2.map((s) => s.name)).toEqual([...PLANET_SPRITES]);
  });

  it('ships one centred native frame per planet at the map node class size', () => {
    for (const sprite of v2) {
      expect(sprite.native).toBe(true);
      expect(sprite.origin).toBe('procedural:planets');
      expect(sprite.frames.length).toBe(1);
      const frame = sprite.frames[0];
      expect([frame.width, frame.height], sprite.name).toEqual([27, 27]);
      expect(sprite.anchor, sprite.name).toEqual([13, 13]); // the disc's centre (27 >> 1)
      expect(frame.width * frame.height).toBeLessThan(510 * 510); // the pipeline's page limit
    }
  });

  it('paints every pixel fully opaque or fully transparent, on a 25-px sphere', () => {
    for (const sprite of v2) {
      const frame = sprite.frames[0];
      let opaque = 0;
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          const i = (y * frame.width + x) * 4;
          const alpha = frame.data[i + 3];
          expect(alpha === 0 || alpha === 255, `${sprite.name} ${x},${y}`).toBe(true);
          if (alpha !== 0) opaque++;
          const dx = x - 13;
          const dy = y - 13;
          // The disc: nothing outside the radius-12 sphere, the outline keeps it inside the frame.
          if (dx * dx + dy * dy > 12 * 12) expect(alpha, `${sprite.name} ${x},${y}`).toBe(0);
        }
      }
      expect(opaque).toBeGreaterThan(380); // the sphere fills most of the frame (π·12² ≈ 452)
    }
  });

  it('keeps every planet a distinct, multi-colour world', () => {
    expect(new Set(bytes(v2)).size).toBe(9); // no two planets are the same pixels
    for (const sprite of v2) {
      const colours = opaqueColours(sprite.frames[0]);
      expect(colours.size, sprite.name).toBeGreaterThanOrEqual(5);
      expect(
        [...colours].every((hex) => /^#[0-9a-f]{6}$/.test(hex)),
        sprite.name,
      ).toBe(true);
    }
    // Pairwise palette distance: no two planets share most of their colours.
    for (let a = 0; a < v2.length; a++) {
      for (let b = a + 1; b < v2.length; b++) {
        const ca = opaqueColours(v2[a].frames[0]);
        let shared = 0;
        for (const hex of opaqueColours(v2[b].frames[0])) if (ca.has(hex)) shared++;
        expect(shared, `${v2[a].name} vs ${v2[b].name}`).toBeLessThan(3);
      }
    }
  });

  it('is deterministic: two runs are byte-identical', () => {
    expect(bytes(generate({ artScale: 3 / 2 }))).toEqual(bytes(v2));
  });

  it('sizes with the art scale and seeds each planet from its own name', () => {
    const one = byName(generate({ artScale: 4 / 3 }), 'map/planet-d');
    expect(one.frames[0].width).toBe(24); // ⌈18 · 4/3⌉ at 4/3, the 27 of the shipped 3/2
    expect(one.frames[0].width).not.toBe(byName(v2, 'map/planet-d').frames[0].width);
  });
});
