/**
 * `scripts/assets/coop.mjs` — player 2's palette map (plan M2-06, R3-03.V2a): which sprites get
 * a `<name>@p2` sibling (every player ship, the HUD's stock icon; never a generated name), the
 * exact colour mapping with unlisted colours and every alpha staying, and the real atlas: every
 * ship and `hud/life` declares a map, has its variant with the same frames and anchor, and the
 * shipped map exchanges exactly the colours the old red ↔ blue channel swap did.
 */
import { describe, expect, it } from 'vitest';
import { P2_SUFFIX, makeP2Sprite, wantsP2Variant } from '../../../scripts/assets/coop.mjs';
import { createImage, getPixel } from '../../../scripts/assets/image.mjs';
import { buildAtlas, collectSprites } from '../../../scripts/assets/pipeline.mjs';
import { P2_SPRITE_SUFFIX } from '@shmup/core';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';

describe('scripts/assets/coop (M2-06, R3-03.V2a)', () => {
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

  it('maps listed colours exactly, keeping unlisted colours and every alpha', () => {
    const frame = createImage(3, 1);
    frame.data.set([10, 20, 30, 255, 200, 100, 0, 128, 0, 0, 0, 0]);
    const out = makeP2Sprite(frameSprite(frame), { '#0a141e': '#1e140a', '#c86400': '#00c8ff' })
      .frames[0];
    expect(Array.from(out.data)).toEqual([30, 20, 10, 255, 0, 200, 255, 128, 0, 0, 0, 0]);
    expect(Array.from(frame.data)).toEqual([10, 20, 30, 255, 200, 100, 0, 128, 0, 0, 0, 0]); // input untouched
  });

  it('throws on a map entry that is not a colour pair', () => {
    const sprite = frameSprite(createImage(1, 1));
    // Typed as the parameter's map so the three literals keep their own keys: without the
    // annotation the array's element type widens to a union of optional-undefined props,
    // which is not assignable to Readonly<Record<string, string>>.
    const badMaps: Readonly<Record<string, string>>[] = [
      { '#0a141e': 'x' },
      { nope: '#000000' },
      { '#0a141e': '#ff000' },
    ];
    for (const map of badMaps) {
      expect(() => makeP2Sprite(sprite, map)).toThrow(TypeError);
    }
  });

  it('builds the sibling with the same anchor, frames and animations', () => {
    const frame = createImage(1, 1);
    frame.data.set([1, 2, 3, 4]);
    const sprite: SpriteDef = {
      name: 'ships/test',
      anchor: [0, 0] as [number, number],
      hitFlash: true,
      frames: [frame, frame],
      animations: { idle: [0, 1] },
      origin: 'test',
    };
    const p2 = makeP2Sprite(sprite, { '#010203': '#010204' });
    expect(p2.name).toBe('ships/test@p2');
    expect(p2.anchor).toEqual([0, 0]);
    expect(p2.hitFlash).toBe(false);
    expect(p2.frames).toHaveLength(2);
    expect(Array.from(p2.frames[0].data)).toEqual([1, 2, 4, 4]);
    expect(p2.animations).toEqual({ idle: [0, 1] });
    expect(p2.animations).not.toBe(sprite.animations);
    expect(p2.origin).toBe('p2:ships/test');
  });

  it('puts every ship`s and the stock icon`s palette map into the atlas', () => {
    const { sprites } = collectSprites();
    const byName = new Map(sprites.map((s) => [s.name, s]));
    const { manifest } = buildAtlas();
    const sources = sprites.filter((s) => wantsP2Variant(s.name));
    expect(sources.map((s) => s.name)).toEqual(
      expect.arrayContaining(['ships/kestrel', 'ships/manta', 'hud/life']),
    );
    for (const source of sources) {
      expect(source.p2, source.name).toBeInstanceOf(Object);
      const variant = byName.get(source.name + P2_SUFFIX);
      expect(variant, source.name).toBeDefined();
      expect(variant!.anchor).toEqual(source.anchor);
      expect(variant!.frames).toHaveLength(source.frames.length);
      source.frames.forEach((frame, i) => {
        const mapped = variant!.frames[i];
        expect([mapped.width, mapped.height]).toEqual([frame.width, frame.height]);
        // The shipped map is today's swap: its every palette colour turns R and B back to front.
        const [r, g, b, a] = getPixel(frame, frame.width >> 1, frame.height >> 1);
        expect(getPixel(mapped, frame.width >> 1, frame.height >> 1)).toEqual([b, g, r, a]);
      });
      expect(manifest.sprites[source.name + P2_SUFFIX]?.frames).toHaveLength(source.frames.length);
    }
  });
});

/**
 * A one-pixel-wide sprite carrying one frame (test helper).
 *
 * @param frame - The frame.
 * @returns The sprite.
 */
function frameSprite(frame: ReturnType<typeof createImage>): SpriteDef {
  return {
    name: 'ships/frame-test',
    anchor: null,
    hitFlash: false,
    frames: [frame],
    animations: {},
    origin: 'test',
  };
}
