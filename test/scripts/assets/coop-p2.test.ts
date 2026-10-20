/**
 * `scripts/assets/coop.mjs` / the pipeline's player 2 palette map (R3-03.V2a): the shipped maps
 * draw exactly what the deleted red ↔ blue channel swap drew (pixel-for-pixel, at both art
 * scales), the three pipeline issues (`collectSprites` demands a map from every `wantsP2Variant`
 * sprite, refuses colours the art does not contain and maps that change no pixel), and the real
 * path of a PNG override whose sidecar carries `meta.shmup.p2`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { P2_SUFFIX, wantsP2Variant } from '../../../scripts/assets/coop.mjs';
import { createImage, getPixel, setPixel } from '../../../scripts/assets/image.mjs';
import { collectSprites } from '../../../scripts/assets/pipeline.mjs';
import { encodePng } from '../../../scripts/assets/png.mjs';
import type { Image } from '../../../scripts/assets/image.mjs';
import type { SpriteDef } from '../../../scripts/assets/sprite-source.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'shmup-coop-p2-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Writes files into a fresh directory under the temp root.
 *
 * @param name - Directory name.
 * @param files - Relative path → contents.
 * @returns The directory.
 */
function tree(name: string, files: Record<string, string | Uint8Array>): string {
  const root = join(tmp, name);
  mkdirSync(root, { recursive: true });
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

/**
 * The deleted channel swap, recomputed in the test under its own name (R3-03.V2a deleted the
 * old red ↔ blue function entirely): a copy of a frame with R and B exchanged.
 *
 * @param frame - Source pixels.
 * @returns Swapped pixels.
 */
function redBlueSwap(frame: Image): Image {
  const out = createImage(frame.width, frame.height);
  for (let i = 0; i < frame.data.length; i += 4) {
    out.data[i] = frame.data[i + 2];
    out.data[i + 1] = frame.data[i + 1];
    out.data[i + 2] = frame.data[i];
    out.data[i + 3] = frame.data[i + 3];
  }
  return out;
}

/** A one-frame pixel-map source with the given palette and map. */
function shipSource(p2: Record<string, string> | undefined): string {
  const json = {
    name: 'ships/boat',
    palette: { '.': null, r: '#ff0000' },
    ...(p2 === undefined ? {} : { p2 }),
    frames: [{ rows: ['r'] }],
  };
  return JSON.stringify(json);
}

describe('player 2 by palette map — the maps draw what the swap drew (R3-03.V2a)', () => {
  for (const artScale of [1, undefined]) {
    const label = artScale === undefined ? 'the default scale' : 'art scale 1';
    it(`reproduces the red ↔ blue swap on every shipped variant, pixel for pixel (${label})`, () => {
      const { sprites, issues } = collectSprites(artScale === undefined ? {} : { artScale: 1 });
      expect(issues).toEqual([]);
      const byName = new Map(sprites.map((s) => [s.name, s] as const));
      const sources = sprites.filter((s) => wantsP2Variant(s.name));
      expect(sources.length).toBeGreaterThanOrEqual(4);
      for (const source of sources) {
        const variant = byName.get(source.name + P2_SUFFIX) as SpriteDef;
        expect(variant.name).toBe(source.name + P2_SUFFIX);
        expect(variant.anchor).toEqual(source.anchor);
        expect(variant.hitFlash).toBe(false);
        expect(variant.origin).toBe(`p2:${source.name}`);
        expect(variant.animations).toEqual(source.animations);
        // And every pixel of it equals what the channel swap produced.
        variant.frames.forEach((frame, i) => {
          const expected = redBlueSwap(source.frames[i]);
          expect(Array.from(frame.data), `${source.name}#${i}`).toEqual(Array.from(expected.data));
        });
      }
    });
  }
});

describe('player 2 by palette map — the pipeline issues (R3-03.V2a)', () => {
  it('demands a map from a wantsP2Variant sprite that has none', () => {
    const dir = tree('no-map', { 'sprites/ships/boat.sprite.json': shipSource(undefined) });
    const { issues } = collectSprites({ sourceDir: dir, artScale: 1 });
    expect(issues).toHaveLength(1);
    expect(issues[0].path.endsWith('/sprites/ships/boat.sprite.json:p2'), issues[0].path).toBe(
      true,
    );
    expect(issues[0].message).toBe(
      '"ships/boat" gets a "@p2" variant and needs a "p2" palette map',
    );
  });

  it('reports a map colour the art does not contain', () => {
    const dir = tree('missing-colour', {
      'sprites/ships/boat.sprite.json': shipSource({ '#ff0000': '#00ff00', '#123456': '#654321' }),
    });
    const { issues } = collectSprites({ sourceDir: dir, artScale: 1 });
    expect(issues).toHaveLength(1);
    expect(issues[0].path.endsWith('/sprites/ships/boat.sprite.json:p2.#123456')).toBe(true);
    expect(issues[0].message).toBe('colour "#123456" is not in the art of "ships/boat"');
  });

  it('reports a map that changes no pixel', () => {
    const dir = tree('identity-map', {
      'sprites/ships/boat.sprite.json': shipSource({ '#ff0000': '#ff0000' }),
    });
    const { issues } = collectSprites({ sourceDir: dir, artScale: 1 });
    expect(issues).toHaveLength(1);
    expect(issues[0].path.endsWith('/sprites/ships/boat.sprite.json:p2')).toBe(true);
    expect(issues[0].message).toBe('changes no pixel of "ships/boat"');
  });

  it('keeps a valid variant out of the atlas when its map is broken', () => {
    const dir = tree('broken-map', {
      'sprites/ships/boat.sprite.json': shipSource({ '#123456': '#654321' }),
    });
    const { sprites } = collectSprites({ sourceDir: dir, artScale: 1 });
    expect(sprites.map((s) => s.name)).not.toContain('ships/boat@p2');
  });
});

describe('player 2 by palette map — PNG overrides carry meta.shmup.p2 (R3-03.V2a)', () => {
  const art = createImage(1, 1);
  setPixel(art, 0, 0, [0, 255, 0, 255]);
  const png = encodePng(art);

  it('maps an override’s pixels through the sidecar map, not the code map', () => {
    const dir = tree('override', {
      'sprites/ships/boat.sprite.json': shipSource({ '#ff0000': '#0000ff' }),
      'sprites/ships/boat.png': png,
      'sprites/ships/boat.json': JSON.stringify({
        frames: [{ frame: { x: 0, y: 0, w: 1, h: 1 } }],
        meta: { shmup: { p2: { '#00ff00': '#ff0000' } } },
      }),
    });
    const { sprites, issues } = collectSprites({ sourceDir: dir, artScale: 1 });
    expect(issues).toEqual([]);
    const variant = sprites.find((s) => s.name === 'ships/boat@p2');
    expect(variant).toBeDefined();
    expect(getPixel(variant!.frames[0], 0, 0)).toEqual([255, 0, 0, 255]);
  });

  it('draws a variant of a PNG-only ship from its sidecar map', () => {
    const dir = tree('png-only', {
      'sprites/ships/rogue.png': png,
      'sprites/ships/rogue.json': JSON.stringify({
        frames: [{ frame: { x: 0, y: 0, w: 1, h: 1 } }],
        meta: { shmup: { p2: { '#00ff00': '#0000ff' } } },
      }),
    });
    const { sprites, issues } = collectSprites({ sourceDir: dir, artScale: 1 });
    expect(issues).toEqual([]);
    const variant = sprites.find((s) => s.name === 'ships/rogue@p2');
    expect(getPixel(variant!.frames[0], 0, 0)).toEqual([0, 0, 255, 255]);
    expect(variant!.origin).toBe('p2:ships/rogue');
  });

  it('demands a map from an override whose sidecar carries none', () => {
    const dir = tree('override-no-map', {
      'sprites/ships/rogue.png': png,
      'sprites/ships/rogue.json': JSON.stringify({
        frames: [{ frame: { x: 0, y: 0, w: 1, h: 1 } }],
      }),
    });
    const { issues } = collectSprites({ sourceDir: dir, artScale: 1 });
    expect(issues.map((i) => i.message)).toContain(
      '"ships/rogue" gets a "@p2" variant and needs a "p2" palette map',
    );
  });
});
