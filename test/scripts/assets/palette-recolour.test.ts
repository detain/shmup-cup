/**
 * R3-03.V5 — the colour-blind variants of an overridden bullet, beam or bend recolour the
 * override (decision W5-13): `collectSprites` drops the procedural `@<palette>` sibling of a
 * sprite whose frames come from a PNG and rebuilds it — pixels classified into the v1 art's
 * rim / body / core bands by luma (integer weights, identical on every engine), recoloured to
 * the palette's body with the `bullets.mjs` mix ratios, re-marked with the family's shape code,
 * frame for frame, with the base's sizes and anchor. The variant's origin is `palette:<base>`.
 *
 * The fixtures are throwaway PNGs in a copy of `assets/source/`:
 * - **`bullets/oval-red`** — an eight-frame 9×9 strip (sidecar): the ring mark puts the dark
 *   plus over the core, the per-frame marker on row 1 proves every frame is recoloured, and the
 *   transparent corners stay;
 * - **`bullets/round-purple`** — one 7×7 frame: the dot mark drops the core band to the body
 *   and paints the centre plus bright;
 * - **`lasers/bend-purple`** — one 11×11 frame: the beams and bend nodes carry no mark, so the
 *   core band stays and a body pixel at the centre stays body;
 * - **`lasers/beam-pink`** — a one-frame override of the twelve-frame beam: the variant keeps
 *   the base's frame count and the untouched code frames are recoloured too.
 * Untouched procedural sprites (a needle, a bend node) and the standard sprites themselves prove
 * the stage changes nothing else.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createImage, getPixel, setPixel } from '../../../scripts/assets/image.mjs';
import type { Rgba } from '../../../scripts/assets/image.mjs';
import { DEFAULT_SOURCE_DIR, buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import { color, mix } from '../../../scripts/assets/procedural/common.mjs';
import { BULLET_PALETTES } from '../../../scripts/assets/procedural/palettes.mjs';
import { encodePng } from '../../../scripts/assets/png.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'shmup-palette-recolour-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** The fixture bands: dark rim, grey body, light core (lumas 32 / 144 / 240). */
const RIM: Rgba = [0x20, 0x20, 0x20, 255];
const BODY: Rgba = [0x90, 0x90, 0x90, 255];
const CORE: Rgba = [0xf0, 0xf0, 0xf0, 255];

/**
 * The band colours a family's palette variant is recoloured to — the same derivation
 * `bullets.mjs` draws the procedural bands with.
 *
 * @param palette - The colour-blind palette id.
 * @param family - The colour family.
 * @returns The rim, body and core colours.
 */
function target(palette: string, family: 'pink' | 'red' | 'purple') {
  const body = color(BULLET_PALETTES[palette][family]);
  return {
    rim: mix(body, color('#000000'), 0.68),
    body,
    core: mix(body, color('#ffffff'), 0.75),
  };
}

describe('R3-03.V5 — palette variants recolour the PNG override', () => {
  let atlas: ReturnType<typeof buildAtlas>;

  beforeAll(() => {
    const src = join(tmp, 'source');
    cpSync(DEFAULT_SOURCE_DIR, src, { recursive: true });
    const spritesDir = join(src, 'sprites');

    // bullets/oval-red: eight 9×9 frames side by side, a sidecar cutting the strip.
    const oval = createImage(72, 9);
    for (let i = 0; i < 8; i++) {
      for (let y = 0; y < 9; y++) {
        for (let x = 0; x < 9; x++) {
          if ((x === 0 || x === 8) && (y === 0 || y === 8)) continue; // transparent corners
          let colour = RIM;
          if (x >= 3 && x <= 5 && y >= 3 && y <= 5) colour = CORE;
          if (x === i && y === 1) colour = BODY; // the per-frame marker
          setPixel(oval, i * 9 + x, y, colour);
        }
      }
    }
    mkdirSync(join(spritesDir, 'bullets'), { recursive: true });
    writeFileSync(join(spritesDir, 'bullets', 'oval-red.png'), encodePng(oval));
    writeFileSync(
      join(spritesDir, 'bullets', 'oval-red.json'),
      JSON.stringify({
        frames: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
          frame: { x: 9 * i, y: 0, w: 9, h: 9 },
        })),
        meta: {},
      }),
    );

    // bullets/round-purple: one 7×7 frame, a 3×3 core at the centre, transparent corners.
    const round = createImage(7, 7);
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        if ((x === 0 || x === 6) && (y === 0 || y === 6)) continue;
        setPixel(round, x, y, x >= 2 && x <= 4 && y >= 2 && y <= 4 ? CORE : RIM);
      }
    }
    writeFileSync(join(spritesDir, 'bullets', 'round-purple.png'), encodePng(round));

    // lasers/bend-purple: one 11×11 frame, a 3×3 core with a body pixel at its centre.
    const bend = createImage(11, 11);
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        if ((x === 0 || x === 10) && (y === 0 || y === 10)) continue;
        let colour = RIM;
        if (x >= 4 && x <= 6 && y >= 4 && y <= 6) colour = CORE;
        if (x === 5 && y === 5) colour = BODY;
        setPixel(bend, x, y, colour);
      }
    }
    mkdirSync(join(spritesDir, 'lasers'), { recursive: true });
    writeFileSync(join(spritesDir, 'lasers', 'bend-purple.png'), encodePng(bend));

    // lasers/beam-pink: one 7×7 frame of rim / body / rim rows (the beam has no mark).
    const beam = createImage(7, 7);
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        if ((x === 0 || x === 6) && (y === 0 || y === 6)) continue;
        setPixel(beam, x, y, y === 2 ? BODY : y === 4 ? CORE : RIM);
      }
    }
    writeFileSync(join(spritesDir, 'lasers', 'beam-pink.png'), encodePng(beam));

    atlas = buildAtlas({ sourceDir: src });
  });

  /**
   * Reads one packed pixel of a manifest frame.
   *
   * @param key - The manifest frame key (`<sprite>#<i>`).
   * @param x - Column in the frame.
   * @param y - Row in the frame.
   * @returns The RGBA quadruple.
   */
  const pixel = (key: string, x: number, y: number) => {
    const f = atlas.manifest.frames[key];
    return getPixel(atlas.pages[f.p].image, f.x + x, f.y + y);
  };

  it('recolours the oval-red override ring, marker and alpha, frame for frame', () => {
    const { manifest, sprites } = atlas;
    const base = manifest.sprites['bullets/oval-red'];
    const variant = manifest.sprites['bullets/oval-red@deuteranopia'];
    expect(variant).toBeDefined();
    // The override path: the procedural v2 oval is 13×13, this strip's frames are 9×9.
    expect(base.frames.length).toBe(8);
    expect(variant.frames).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `bullets/oval-red@${'deuteranopia'}#${i}`),
    );
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) {
      expect(manifest.frames[`bullets/oval-red#${i}`].w).toBe(9);
    }
    // Same frame anchor as the base (the renderer swaps sprite bases only).
    const baseFrame0 = manifest.frames['bullets/oval-red#0'];
    const variantFrame0 = manifest.frames['bullets/oval-red@deuteranopia#0'];
    expect([variantFrame0.ax, variantFrame0.ay]).toEqual([baseFrame0.ax, baseFrame0.ay]);
    expect(sprites.find((s) => s.name === 'bullets/oval-red@deuteranopia')?.origin).toBe(
      'palette:bullets/oval-red',
    );

    for (const palette of ['deuteranopia', 'protanopia', 'tritanopia']) {
      const q = target(palette, 'red');
      const name = `bullets/oval-red@${palette}`;
      expect(atlas.manifest.sprites[name].frames.length).toBe(8);
      for (let i = 0; i < 8; i++) {
        const key = `${name}#${i}`;
        const f = atlas.manifest.frames[key];
        expect([f.w, f.h]).toEqual([9, 9]);
        for (let y = 0; y < 9; y++) {
          for (let x = 0; x < 9; x++) {
            const dx = x - 4;
            const dy = y - 4;
            let want: number[];
            if ((x === 0 || x === 8) && (y === 0 || y === 8)) want = [0, 0, 0, 0];
            else if (dx * dx + dy * dy <= 1)
              want = q.rim; // the ring's dark plus
            else if (x === i && y === 1)
              want = q.body; // the marker
            else if (x >= 3 && x <= 5 && y >= 3 && y <= 5) want = q.core;
            else want = q.rim;
            expect(pixel(key, x, y), `${key} ${x},${y}`).toEqual(want);
          }
        }
      }
    }
  });

  it('drops the dot family core to the body and paints the bright centre', () => {
    const q = target('protanopia', 'purple');
    const name = 'bullets/round-purple@protanopia';
    expect(atlas.manifest.sprites[name]).toBeDefined();
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const dx = x - 3;
        const dy = y - 3;
        let want: number[];
        if ((x === 0 || x === 6) && (y === 0 || y === 6)) want = [0, 0, 0, 0];
        else if (dx * dx + dy * dy <= 1)
          want = q.core; // the dot's bright plus
        else if (x >= 2 && x <= 4 && y >= 2 && y <= 4)
          want = q.body; // no core band
        else want = q.rim;
        expect(pixel(`${name}#0`, x, y), `${x},${y}`).toEqual(want);
      }
    }
  });

  it('marks nothing on the bend node and keeps its core band', () => {
    const q = target('tritanopia', 'purple');
    const name = 'lasers/bend-purple@tritanopia';
    expect(atlas.manifest.sprites[name]).toBeDefined();
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        let want: number[];
        if ((x === 0 || x === 10) && (y === 0 || y === 10)) want = [0, 0, 0, 0];
        else if (x === 5 && y === 5)
          want = q.body; // the centre is NOT painted
        else if (x >= 4 && x <= 6 && y >= 4 && y <= 6) want = q.core;
        else want = q.rim;
        expect(pixel(`${name}#0`, x, y), `${x},${y}`).toEqual(want);
      }
    }
  });

  it('keeps the twelve-frame beam count and recolours the code frames too', () => {
    const base = atlas.manifest.sprites['lasers/beam-pink'];
    const q = target('protanopia', 'pink');
    const name = 'lasers/beam-pink@protanopia';
    const variant = atlas.manifest.sprites[name];
    expect(variant.frames.length).toBe(base.frames.length);
    expect(base.frames.length).toBe(12);
    // Frame 0 is the fixture: rim rows, a body row and a core row, unmixed.
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        let want: number[];
        if ((x === 0 || x === 6) && (y === 0 || y === 6)) want = [0, 0, 0, 0];
        else if (y === 2) want = q.body;
        else if (y === 4) want = q.core;
        else want = q.rim;
        expect(pixel(`${name}#0`, x, y), `${x},${y}`).toEqual(want);
      }
    }
    // Frame 11 is the untouched procedural drawing — recoloured, every opaque pixel a target
    // colour and the core band present.
    const f = atlas.manifest.frames[`${name}#11`];
    const baseFrame11 = atlas.manifest.frames['lasers/beam-pink#11'];
    expect([f.w, f.h]).toEqual([baseFrame11.w, baseFrame11.h]);
    const same = (c: number[], t: number[]) => c[0] === t[0] && c[1] === t[1] && c[2] === t[2];
    let cores = 0;
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const c = pixel(`${name}#11`, x, y);
        if (c[3] === 0) continue;
        expect([same(c, q.rim), same(c, q.body), same(c, q.core)].includes(true)).toBe(true);
        if (same(c, q.core)) cores++;
      }
    }
    expect(cores).toBeGreaterThan(0);
  });

  it('leaves the procedural sprites alone', () => {
    const origins = new Map(atlas.sprites.map((s) => [s.name, s.origin]));
    expect(origins.get('bullets/needle-red@deuteranopia')).toBe('procedural:palettes');
    expect(origins.get('lasers/bend-red@deuteranopia')).toBe('procedural:palettes');
    expect(origins.get('bullets/round-pink@tritanopia')).toBe('procedural:palettes');
    // The needle keeps its procedural geometry (an override would replace the frames).
    expect(atlas.manifest.frames['bullets/needle-red@deuteranopia#0'].w).toBe(17);
    // And the standard sprites themselves never change colour.
    expect(atlas.manifest.sprites['bullets/oval-red'].frames.length).toBe(8);
  });
});
