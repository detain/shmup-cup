/**
 * The interim art stage in the asset pipeline (plan_resolution.md R2-01, decisions W4-4 … W4-6):
 * `buildAtlas({ artScale: 1.5 })` against `buildAtlas({ artScale: 1 })`, both built in memory.
 *
 * - The same sprite names, animations and atlas groups at both scales (sprite ids,
 *   `atlas-groups.json` and the goldens' view of the atlas never move), and the same frame counts
 *   but the laser beams': one frame per band height, 8 at scale 1 and 12 at 3/2.
 * - Every frame of a v1-scale source `⌈1.5·w⌉ × ⌈1.5·h⌉`, its pixels the nearest-neighbour
 *   upscale, an explicit anchor `⌈1.5·a⌉`, a default one the centre of the scaled frame 0.
 * - What is never upscaled (W4-5): the terrain tilesets come out 12 × 12 — drawn by `terrain.mjs`
 *   at that size, their opaque pixels every shipped mask resampled to 12 — `ui/pixel` stays 1 × 1,
 *   every laser beam frame `k` is a band `k + 1` px tall (the renderer reads the frame's number as
 *   the beam's thickness; `lasers.mjs` draws them at the art scale), a real-art PNG override keeps
 *   its size and its sidecar anchor, a `"native": true` map its size.
 * - The interim font (W4-4): 9 × 12 cells, a 15-px line, a 9-px advance — since R4-03.C1 taken
 *   from the committed native font file (`fonts/pixel9x12.font.json`, `native: true`, unscaled)
 *   rather than scaled here; the file was derived through exactly this upscale, so the two agree
 *   byte for byte (proved by R4-03.C1's ATLAS-SHA, not by a pixel pin in this file).
 * - The budget: every page within 2048², every group's PNG bytes under its R3-04 cap, and the
 *   whole atlas under the total cap.
 * - The guard: at scale 1 the stage is a no-op — the v1 atlas, pinned by digest, at either frame.
 *
 * Nothing here depends on the frame: both scales are asked for explicitly, so the file passes
 * unchanged before and after R2-01's flip (only the default scale moves).
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createImage,
  getPixel,
  imagesEqual,
  setPixel,
  type Image,
} from '../../../scripts/assets/image.mjs';
import { INTERIM_ART_SCALE, scaleImage, scaleLength } from '../../../scripts/assets/interim.mjs';
import { formatManifest } from '../../../scripts/assets/manifest.mjs';
import { COMMON_GROUP, DEFAULT_SOURCE_DIR, buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import { encodePng } from '../../../scripts/assets/png.mjs';
import { BULLET_COLORS } from '../../../scripts/assets/procedural/bullets.mjs';
import { generateProceduralSprites } from '../../../scripts/assets/procedural/index.mjs';
import { BEAM_HEIGHT, BEAM_WIDTH } from '../../../scripts/assets/procedural/lasers.mjs';
import { BULLET_PALETTES } from '../../../scripts/assets/procedural/palettes.mjs';
import { TERRAIN_PALETTES, resampleMask } from '../../../scripts/assets/procedural/terrain.mjs';
import { loadSpriteSources, type SpriteDef } from '../../../scripts/assets/sprite-source.mjs';
import { ATLAS_COMMON_PNG_CAP, ATLAS_PNG_BYTES_CAP, ATLAS_ZONE_PNG_CAP } from './atlas-budget.js';

/** The atlas page limit (the packer's `MAX_PAGE_SIZE`). */
const MAX_PAGE = 2048;

/** The v1 art: the stage does nothing (W4-6's consumers keep it). */
const v1 = buildAtlas({ artScale: 1 });

/** The interim ×1.5 art (the shipped atlas from R2-01's flip on). */
const v2 = buildAtlas({ artScale: 1.5 });

const tmp = mkdtempSync(join(tmpdir(), 'shmup-interim-pipeline-'));
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** A built atlas. */
type Atlas = ReturnType<typeof buildAtlas>;

/**
 * The pixels of one atlas frame, cut out of its page (one copy per row: fast enough to cut every
 * frame of both atlases).
 *
 * @param atlas - The atlas.
 * @param name - Frame name (`<sprite>#<i>`).
 * @returns The frame's pixels.
 */
function framePixels(atlas: Atlas, name: string): Image {
  const f = atlas.manifest.frames[name];
  const page = atlas.pages[f.p].image;
  const out = createImage(f.w, f.h);
  for (let y = 0; y < f.h; y++) {
    const from = ((f.y + y) * page.width + f.x) * 4;
    out.data.set(page.data.subarray(from, from + f.w * 4), y * f.w * 4);
  }
  return out;
}

/**
 * Lower-case hex of an image's bytes (a fast exact comparison for `toBe`).
 *
 * @param image - The image.
 * @returns `<w>x<h>:<hex>`.
 */
const hex = (image: Image): string =>
  `${image.width}x${image.height}:${Buffer.from(image.data).toString('hex')}`;

/** The sprites whose frames are drawn at their v2 size already (native, W4-5), by name. */
const NATIVE = new Set(v2.sprites.filter((s) => s.native === true).map((s) => s.name));

/** The laser beams: one per bullet colour, plus its variant for each colour-blind palette. */
const BEAMS = Object.keys(BULLET_COLORS).flatMap((colour) =>
  ['', ...Object.keys(BULLET_PALETTES).map((palette) => `@${palette}`)].map(
    (suffix) => `lasers/beam-${colour}${suffix}`,
  ),
);

/**
 * The frame names of a sprite with `count` frames.
 *
 * @param name - Sprite name.
 * @param count - Frame count.
 * @returns `<name>#0` … `<name>#<count − 1>`.
 */
const frameNames = (name: string, count: number): string[] =>
  Array.from({ length: count }, (_, k) => `${name}#${k}`);

/** The sources' own anchors (`null` = the default centre), by sprite name. */
const SOURCE_ANCHORS = new Map<string, [number, number] | null>(
  [
    ...loadSpriteSources(join(DEFAULT_SOURCE_DIR, 'sprites'), 'sprites').sprites,
    ...generateProceduralSprites(),
  ].map((sprite: SpriteDef) => [sprite.name, sprite.anchor]),
);

/**
 * The source anchor of a sprite or of the sprite a generated sibling (`@flash`, `@p2`) copies.
 *
 * @param name - Sprite name.
 * @returns The anchor (`null` = default), or `undefined` for a font.
 */
function sourceAnchor(name: string): [number, number] | null | undefined {
  if (SOURCE_ANCHORS.has(name)) return SOURCE_ANCHORS.get(name);
  const at = name.lastIndexOf('@');
  return at < 0 ? undefined : SOURCE_ANCHORS.get(name.slice(0, at));
}

describe('scripts/assets/pipeline — the interim ×1.5 stage keeps the atlas’s shape (R2-01)', () => {
  it('has the same sprites, frame counts (but the beams), animations and groups', () => {
    // v2 sources beside v1 (R4-P.P3, decision RR-1): a name only the art-scale build has is a
    // new v2-only native (RR-1a — absent at scale 1), and native art is drawn per scale (the
    // generators) or replaced wholesale (a `*.v2.sprite.json`), so natives are skipped for the
    // frame-table, frame-name and animation comparisons; sizes and anchors already skip them.
    const v1Names = Object.keys(v1.manifest.sprites);
    const onlyV2 = Object.keys(v2.manifest.sprites).filter((n) => !v1Names.includes(n));
    for (const name of onlyV2) expect(NATIVE.has(name), name).toBe(true);
    expect(Object.keys(v2.manifest.sprites).filter((n) => !onlyV2.includes(n))).toEqual(v1Names);
    for (const [name, sprite] of Object.entries(v1.manifest.sprites)) {
      if (NATIVE.has(name)) continue;
      expect(v2.manifest.sprites[name], name).toEqual(sprite);
    }
    // Frame names (`<sprite>#<i>`) of the shared non-native art are the same at both scales;
    // beams, v2-only names and v2-replaced natives may carry frames the other build lacks
    // (RR-1b: an extra v2 frame belongs to a native sprite, never to a scaled v1 name).
    const scaledFrame = (frame: string): boolean => {
      const at = frame.lastIndexOf('#');
      const name = at < 0 ? frame : frame.slice(0, at);
      return !NATIVE.has(name) && !onlyV2.includes(name);
    };
    expect(Object.keys(v2.manifest.frames).filter(scaledFrame).sort()).toEqual(
      Object.keys(v1.manifest.frames).filter(scaledFrame).sort(),
    );
    const sharedAnimations = (animations: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(animations).filter(([name]) => !NATIVE.has(name)));
    expect(sharedAnimations(v2.manifest.animations)).toEqual(
      sharedAnimations(v1.manifest.animations),
    );
    expect(
      v2.sprites.filter((s) => !onlyV2.includes(s.name)).map((s) => [s.name, s.group]),
    ).toEqual(v1.sprites.map((s) => [s.name, s.group]));
    // A v2-only name may add a page to its own group, never a new group (RR-1a): the page
    // groups match as sets.
    expect(new Set(v2.manifest.pages.map((p) => p.group))).toEqual(
      new Set(v1.manifest.pages.map((p) => p.group)),
    );
    expect(BEAMS.length).toBe(12); // still 3 colours × 4 palettes (their frames ride the skip)
  });

  it('upscales every v1-scale frame to ⌈1.5·w⌉ × ⌈1.5·h⌉, nearest-neighbour', () => {
    let scaled = 0;
    const wrongPixels: string[] = [];
    for (const sprite of v1.sprites) {
      if (NATIVE.has(sprite.name)) continue;
      for (const frame of v1.manifest.sprites[sprite.name].frames) {
        const a = v1.manifest.frames[frame];
        const b = v2.manifest.frames[frame];
        expect([b.w, b.h], frame).toEqual([Math.ceil(1.5 * a.w), Math.ceil(1.5 * a.h)]);
        const upscaled = scaleImage(framePixels(v1, frame), 1.5);
        if (!imagesEqual(framePixels(v2, frame), upscaled)) wrongPixels.push(frame);
        scaled++;
      }
    }
    // R3-03.V1: the v2 bullets, bend nodes and their variants are native, so 216 frames left the
    // upscaled pool; since R4-03.C1 the native font too (its 195 glyph frames are unscaled).
    // Since R4-04.D1/D2 the explosions (21 frames) and the small particles (15) are native at
    // scale ≠ 1, so 36 more left; since R4-01.A7 and R4-01.A6 the generated shots and the eleven
    // shot maps (47 + 14 frames) joined them. Measured at their SHAs and missing from this chain:
    // R4-01.A1a's three v2 ship maps (-16, e90e17e) and R4-03.C5's HUD life-bar map (-28,
    // 96c4e61); A6 set 560 from a pre-rebase count while its landed tree compared 563 — a margin
    // of three. R4-03.C2/C3/C4a moved no frame of this pool (their font left it at C1: still 563
    // at 450349b); R4-01.A3's orb+stolen (−4, 7b07886) and R4-02.B2's ten native pills (−20)
    // took it to 539 at ba09e57, and R4-02.B3's native point −2 more (537 measured on the landing
    // tree). R4-01.A2's thruster is v2-only (RR-1a: absent at scale 1), so it moves none of
    // this pool; R4-01.A4's native force field −4 more (its v1 frames leave the comparison).
    // 533 measured at tip 92b4b73. The floor measures what is still compared, not the natives.
    expect(scaled).toBeGreaterThan(500);
    expect(wrongPixels).toEqual([]);
  });

  it('scales an explicit anchor ⌈1.5·a⌉ and centres a default one on the scaled frame', () => {
    let explicit = 0;
    for (const sprite of v2.sprites) {
      if (NATIVE.has(sprite.name)) continue;
      const frame = v2.manifest.frames[`${sprite.name}#0`];
      const source = sourceAnchor(sprite.name);
      const expected =
        source === undefined
          ? [0, 0] // a font: the cell's top-left
          : source === null
            ? [Math.floor(frame.w / 2), Math.floor(frame.h / 2)]
            : [Math.ceil(1.5 * source[0]), Math.ceil(1.5 * source[1])];
      if (source !== null && source !== undefined) explicit++;
      expect([frame.ax, frame.ay], sprite.name).toEqual(expected);
    }
    expect(explicit).toBeGreaterThan(10);
  });
});

describe('scripts/assets/pipeline — what the interim stage never upscales (W4-5)', () => {
  it('marks at least the terrain tilesets, ui/pixel, the laser beams and the native v2 bullets and bend nodes (the native set is derived)', () => {
    // The v2 bullets and bend nodes: `bullets.mjs` / `lasers.mjs` draw them at the art bible
    // §5.4 sizes on the `artScale !== 1` path (R3-03.V1), the palette variants with them.
    const V2_SHOTS = Object.keys(BULLET_COLORS).flatMap((colour) =>
      ['', ...Object.keys(BULLET_PALETTES).map((palette) => `@${palette}`)].flatMap((suffix) => [
        `bullets/round-${colour}${suffix}`,
        `bullets/oval-${colour}${suffix}`,
        `bullets/needle-${colour}${suffix}`,
        `lasers/bend-${colour}${suffix}`,
      ]),
    );
    expect(BEAMS).toHaveLength(12); // 3 colours × (standard + 3 colour-blind palettes)
    expect(V2_SHOTS).toHaveLength(48); // 3 colours × 4 sprites × (standard + 3 palettes)
    // R4-P.P3 (RR-1): `NATIVE` is derived from the build, and v2 pixel maps and v2 fonts are
    // native too — the list below is the floor, never a pin. What the extra natives are is
    // pinned by the relation case (a new v2-only name is absent at scale 1) and by
    // `pipeline-v2-sources.test.ts`.
    for (const name of [...Object.keys(TERRAIN_PALETTES), 'ui/pixel', ...BEAMS, ...V2_SHOTS])
      expect(NATIVE.has(name), name).toBe(true);
  });

  it('draws laser beam frame k as a band k + 1 px tall at both scales', () => {
    // The renderer draws a beam `w` px wide as frame `w − 1` unscaled (render-pixi
    // `createLaserBinding`), so frame k must be k + 1 px thick at every scale: 8 frames of 4 × 8
    // for the v1 art, 12 of 6 × 12 at 3/2 — R2-02 ports the shipped widths 6 and 8 to 9 and 12.
    for (const [atlas, scale, count] of [
      [v1, 1, 8],
      [v2, 1.5, 12],
    ] as const) {
      expect(scaleLength(BEAM_HEIGHT, scale)).toBe(count);
      const size = [scaleLength(BEAM_WIDTH, scale), count];
      for (const name of BEAMS) {
        const frames = atlas.manifest.sprites[name].frames;
        expect(frames, `${name} at ${scale}`).toEqual(frameNames(name, count));
        frames.forEach((frame, k) => {
          const pixels = framePixels(atlas, frame);
          expect([pixels.width, pixels.height], `${frame} at ${scale}`).toEqual(size);
          let rows = 0;
          for (let y = 0; y < pixels.height; y++) if (getPixel(pixels, 0, y)[3] > 0) rows++;
          expect(rows, `${frame} at ${scale}`).toBe(k + 1);
        });
      }
    }
  });

  it('draws the terrain tiles at 12 px (8 px for the v1 art), masks resampled from the content', () => {
    const tilesets = fileURLToPath(new URL('../../../content/tilesets', import.meta.url));
    let checked = 0;
    for (const file of readdirSync(tilesets).filter((f) => f.endsWith('.tileset.json'))) {
      const tileset = JSON.parse(readFileSync(join(tilesets, file), 'utf8')) as {
        sprite: string;
        tileSize: number;
        tiles: { name: string; type: string; frame: number; anchor: string; mask: number[] }[];
      };
      // R5-01.FIX1 (decision RR-1a): a tileset whose art lives only on the v2 path (a generator's
      // v2 branch, a `*.v2.sprite.json`, a `native: true` v2 font) is legitimately ABSENT from the
      // digest-pinned scale-1 atlas. The scale gate is data-driven off the two builds: every tile
      // of one tileset answers alike (a mixed file is a break), and a v2-only tileset asserts
      // absence at scale 1 where the v1-served ones keep their 8 px presence pin.
      const atScale1 = tileset.tiles.map(
        (tile) => `${tileset.sprite}#${tile.frame}` in v1.manifest.frames,
      );
      const served = atScale1.every((seen) => seen);
      expect(served || atScale1.every((seen) => !seen), `${file}: v1 and v2 tiles mixed`).toBe(
        true,
      );
      for (let i = 0; i < tileset.tiles.length; i++) {
        const tile = tileset.tiles[i];
        const name = `${tileset.sprite}#${tile.frame}`;
        if (atScale1[i])
          expect([v1.manifest.frames[name].w, v1.manifest.frames[name].h], name).toEqual([8, 8]);
        else expect(v1.manifest.frames[name], name).toBeUndefined();
        const frame = framePixels(v2, name);
        expect([frame.width, frame.height], name).toEqual([12, 12]);
        if (tile.type === 'empty') continue; // decoration: its frame need not match a mask
        const heights: number[] = [];
        for (let x = 0; x < 12; x++) {
          let h = 0;
          const row = (k: number) => (tile.anchor === 'floor' ? 11 - k : k);
          while (h < 12 && getPixel(frame, x, row(h))[3] > 0) h++;
          heights.push(h);
        }
        expect(heights, `${file} ${tile.name}`).toEqual(
          resampleMask(tile.mask, tileset.tileSize, 12),
        );
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('keeps ui/pixel one opaque white texel', () => {
    const f = v2.manifest.frames['ui/pixel#0'];
    expect([f.w, f.h, f.ax, f.ay]).toEqual([1, 1, 0, 0]);
    expect(getPixel(v2.pages[f.p].image, f.x, f.y)).toEqual([255, 255, 255, 255]);
  });

  it('never scales a real-art PNG override (its sidecar anchor kept) nor a native map', () => {
    const sourceDir = join(tmp, 'override');
    cpSync(DEFAULT_SOURCE_DIR, sourceDir, { recursive: true });
    const sprites = join(sourceDir, 'sprites');
    // A 20 × 10 v2-native frame 0 for the KESTREL, pivot (9, 4) — frames 1… stay code-drawn.
    const art = createImage(20, 10);
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 20; x++) setPixel(art, x, y, [200, 40, 9, 255]);
    writeFileSync(join(sprites, 'ships', 'kestrel.png'), encodePng(art));
    writeFileSync(
      join(sprites, 'ships', 'kestrel.json'),
      JSON.stringify({
        frames: [{ frame: { x: 0, y: 0, w: 20, h: 10 } }],
        meta: {
          slices: [{ keys: [{ bounds: { x: 0, y: 0, w: 20, h: 10 }, pivot: { x: 9, y: 4 } }] }],
        },
      }),
    );
    // A PNG-only sprite and a native pixel map, both new.
    mkdirSync(join(sprites, 'items', 'v2'), { recursive: true });
    writeFileSync(join(sprites, 'items', 'v2', 'gem.png'), encodePng(createImage(7, 5)));
    writeFileSync(
      join(sprites, 'items', 'v2', 'chip.sprite.json'),
      JSON.stringify({
        name: 'items/v2/chip',
        palette: { x: '#fff' },
        native: true,
        frames: [{ rows: ['xxx', 'xxx'] }],
      }),
    );
    const built = buildAtlas({ sourceDir, artScale: 1.5 });
    const kestrel = built.manifest.sprites['ships/kestrel'].frames;
    const first = built.manifest.frames[kestrel[0]];
    expect([first.w, first.h, first.ax, first.ay]).toEqual([20, 10, 9, 4]);
    expect(hex(framePixels(built, kestrel[0]))).toBe(hex(art));
    // The code-drawn frames beside it are upscaled; player 2's swap follows frame 0 unscaled.
    expect(built.manifest.frames[kestrel[1]].w).toBe(v2.manifest.frames[kestrel[1]].w);
    expect(built.manifest.frames['ships/kestrel@p2#0'].w).toBe(20);
    const gem = built.manifest.frames['items/v2/gem#0'];
    expect([gem.w, gem.h]).toEqual([7, 5]);
    const chip = built.manifest.frames['items/v2/chip#0'];
    expect([chip.w, chip.h]).toEqual([3, 2]);
  });
});

describe('scripts/assets/pipeline — the interim font (W4-4, native file since R4-03.C1)', () => {
  it('is the shipped font at 9 × 12, a 15-px line and a 9-px advance', () => {
    const font = v2.manifest.fonts.pixel;
    // Since R4-03.C1 the default-scale font comes from the native pixel9x12.font.json unscaled:
    // it is in NATIVE (so the upscale cases skip it, like every native source), and its names,
    // cells, line and advance are exactly the scaled v1 file's (the pixels may diverge from the
    // v1 upscale only once R4-03.C2 … C4b redraw the glyphs — never pinned here).
    expect(NATIVE.has('font/pixel')).toBe(true);
    expect([font.cellWidth, font.cellHeight, font.lineHeight]).toEqual([9, 12, 15]);
    expect(Object.keys(font.glyphs)).toEqual(Object.keys(v1.manifest.fonts.pixel.glyphs));
    for (const [code, glyph] of Object.entries(font.glyphs)) {
      expect(glyph.advance, code).toBe(9);
      expect(glyph.frame).toBe(v1.manifest.fonts.pixel.glyphs[code].frame);
      expect(v2.manifest.frames[glyph.frame]).toMatchObject({ w: 9, h: 12, ax: 0, ay: 0 });
    }
  });
});

describe('scripts/assets/pipeline — the interim atlas stays inside the budget (R2-01)', () => {
  it('keeps every page within 2048², each group under its cap and the atlas under the total', () => {
    for (const page of v2.manifest.pages) {
      expect(page.w, page.file).toBeLessThanOrEqual(MAX_PAGE);
      expect(page.h, page.file).toBeLessThanOrEqual(MAX_PAGE);
    }
    // R3-04.M2b caps per group: `common` its own, every zone page the stand-in band's top.
    const byGroup = new Map<string, number>();
    v2.manifest.pages.forEach((page, p) => {
      const group = page.group ?? '';
      byGroup.set(group, (byGroup.get(group) ?? 0) + v2.pages[p].png.length);
    });
    for (const [group, bytes] of byGroup) {
      const cap = group === COMMON_GROUP ? ATLAS_COMMON_PNG_CAP : ATLAS_ZONE_PNG_CAP;
      expect(bytes, group).toBeLessThanOrEqual(cap);
    }
    const bytes = v2.pages.reduce((sum, page) => sum + page.png.length, 0);
    expect(bytes).toBeLessThan(ATLAS_PNG_BYTES_CAP);
  });
});

describe('scripts/assets/pipeline — scale 1 is the v1 atlas, at either frame (R2-01 guard)', () => {
  it('builds the default scale unless asked for another', () => {
    expect([1, 1.5]).toContain(INTERIM_ART_SCALE);
    const scale = INTERIM_ART_SCALE === 1 ? v1 : v2;
    expect(buildAtlas().manifest.pages).toEqual(scale.manifest.pages);
  });

  it('pins the v1 atlas: every page’s pixels and the manifest, by digest', () => {
    // Pinned when R2-01 landed the stage (the atlas `pnpm assets` wrote before it, byte for byte).
    // Only an edit of the v1 sprite sources or generators may move it — or a real-art PNG override,
    // a `native` source or a v2 font file landing in `assets/source/` (R3, R4-03): overrides and
    // native sources pass through unscaled at every scale, so they put v2-size frames into the
    // scale-1 build too. Then re-pin and say why; never the interim stage, the art scale's default
    // or the frame.
    const hash = createHash('sha256');
    for (const page of v1.pages) {
      hash.update(`${page.file} ${page.image.width}x${page.image.height}\0`);
      hash.update(page.image.data);
    }
    hash.update(formatManifest(v1.manifest));
    expect(hash.digest('hex')).toBe(
      '20a7b1099cc61b5435c38a5745ef0fe675b6c5815753c7946974c6597a70872d',
    );
  });
});
