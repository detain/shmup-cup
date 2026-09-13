/**
 * `scripts/assets/coop.mjs` — player 2's palette swap (plan M2-06): which sprites get a
 * `<name>@p2` sibling (every player ship, the HUD's stock icon; never a generated name), the exact
 * red ↔ blue channel swap, and the real atlas: every ship and `hud/life` has its variant with the
 * same frames and anchor, pixel for pixel the swapped source.
 */
import { describe, expect, it } from 'vitest';
import {
  P2_SUFFIX,
  makeP2Sprite,
  swapRedBlue,
  wantsP2Variant,
} from '../../../scripts/assets/coop.mjs';
import { createImage, getPixel } from '../../../scripts/assets/image.mjs';
import { buildAtlas, collectSprites } from '../../../scripts/assets/pipeline.mjs';
import { P2_SPRITE_SUFFIX } from '@shmup/core';

describe('scripts/assets/coop (M2-06)', () => {
  it('uses the core`s suffix and picks the ships and the stock icon only', () => {
    expect(P2_SUFFIX).toBe(P2_SPRITE_SUFFIX);
    for (const name of ['ships/kestrel', 'ships/manta', 'ships/kestrel-thruster', 'hud/life']) {
      expect(wantsP2Variant(name), name).toBe(true);
    }
    for (const name of [
      'ships/kestrel@flash',
      'ships/kestrel@p2',
      'hud/meter-slot',
      'enemies/drifter',
      'shipsx/kestrel',
    ]) {
      expect(wantsP2Variant(name), name).toBe(false);
    }
  });

  it('swaps red and blue exactly, keeping green and alpha', () => {
    const frame = createImage(2, 1);
    frame.data.set([10, 20, 30, 255, 200, 100, 0, 128]);
    const out = swapRedBlue(frame);
    expect(Array.from(out.data)).toEqual([30, 20, 10, 255, 0, 100, 200, 128]);
    expect(Array.from(frame.data)).toEqual([10, 20, 30, 255, 200, 100, 0, 128]); // untouched
  });

  it('builds the sibling with the same anchor, frames and animations', () => {
    const frame = createImage(1, 1);
    frame.data.set([1, 2, 3, 4]);
    const sprite = {
      name: 'ships/test',
      anchor: [0, 0] as [number, number],
      hitFlash: true,
      frames: [frame, frame],
      animations: { idle: [0, 1] },
      origin: 'test',
    };
    const p2 = makeP2Sprite(sprite);
    expect(p2.name).toBe('ships/test@p2');
    expect(p2.anchor).toEqual([0, 0]);
    expect(p2.hitFlash).toBe(false);
    expect(p2.frames).toHaveLength(2);
    expect(p2.animations).toEqual({ idle: [0, 1] });
    expect(p2.animations).not.toBe(sprite.animations);
    expect(p2.origin).toBe('p2:ships/test');
  });

  it('puts every ship`s and the stock icon`s palette swap into the atlas', () => {
    const { sprites } = collectSprites();
    const byName = new Map(sprites.map((s) => [s.name, s]));
    const { manifest } = buildAtlas();
    const sources = sprites.filter((s) => wantsP2Variant(s.name));
    expect(sources.map((s) => s.name)).toEqual(
      expect.arrayContaining(['ships/kestrel', 'ships/manta', 'hud/life']),
    );
    for (const source of sources) {
      const variant = byName.get(source.name + P2_SUFFIX);
      expect(variant, source.name).toBeDefined();
      expect(variant!.anchor).toEqual(source.anchor);
      expect(variant!.frames).toHaveLength(source.frames.length);
      source.frames.forEach((frame, i) => {
        const swapped = variant!.frames[i];
        expect([swapped.width, swapped.height]).toEqual([frame.width, frame.height]);
        const [r, g, b, a] = getPixel(frame, frame.width >> 1, frame.height >> 1);
        expect(getPixel(swapped, frame.width >> 1, frame.height >> 1)).toEqual([b, g, r, a]);
      });
      expect(manifest.sprites[source.name + P2_SUFFIX]?.frames).toHaveLength(source.frames.length);
    }
  });
});
