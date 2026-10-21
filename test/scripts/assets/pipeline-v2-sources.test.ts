/**
 * v2 sources beside v1 in the pipeline (R4-P.P3, decision RR-1): a `<path>.v2.sprite.json` is
 * the v2 pixel map of `<path>` (native implied) and a font file with `"native": true` is the v2
 * font of its `name`. The four rules, proved on a temporary source tree:
 *
 * 1. at an art scale ≠ 1 a v2 source replaces the v1 source of its name, unscaled, and a
 *    v2-only name joins the build (RR-1a: it is absent at scale 1);
 * 2. at scale 1 every v2 source is ignored — the v1 build stays the v1 art;
 * 3. at scale 1 a PNG override of a name that has a code source is skipped (a PNG-only name
 *    still applies at every scale);
 * 4. the v2 font (native) replaces its v1 namesake at the art scale, unscaled, and is ignored
 *    at scale 1.
 *
 * Guide: `docs/dev/asset-pipeline.md` (v2 sources beside v1).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createImage, setPixel } from '../../../scripts/assets/image.mjs';
import { buildAtlas, collectSprites } from '../../../scripts/assets/pipeline.mjs';
import { encodePng } from '../../../scripts/assets/png.mjs';
import { SPRITE_SOURCE_V2_SUFFIX } from '../../../scripts/assets/sprite-source.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'shmup-pipeline-v2-sources-'));

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
 * A pixel-map JSON body of one `c`-coloured rectangle per frame.
 *
 * @param name - Declared sprite name.
 * @param size - `[width, height]` of every frame.
 * @param count - Frame count.
 * @param extra - Extra top-level fields (the ships need their `p2` map).
 * @returns The document as a string.
 */
function mapJson(
  name: string,
  size: [number, number],
  count: number,
  extra: Record<string, unknown> = {},
): string {
  const row = 'o'.repeat(size[0]);
  return JSON.stringify({
    name,
    palette: { o: '#c8d0e0' },
    ...extra,
    frames: Array.from({ length: count }, () => ({
      rows: Array.from({ length: size[1] }, () => row),
    })),
  });
}

/**
 * A solid PNG frame for use as an override.
 *
 * @param w - Width.
 * @param h - Height.
 * @returns The encoded PNG bytes.
 */
function solidPng(w: number, h: number): Uint8Array {
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPixel(image, x, y, [200, 40, 9, 255]);
  return encodePng(image);
}

/** The ships' player 2 map (R3-03.V2a): every ship source must carry one. */
const P2 = { p2: { '#c8d0e0': '#101828' } };

/** A 2-frame v1 KESTREL map at v1 size 2×2 (scale 1 keeps it, ×1.5 would make it 3×3). */
const V1_KESTREL = mapJson('ships/kestrel', [2, 2], 2, P2);
/** The v2 map of the same name: 3 frames at the v2 size 4×2 (never scaled, never v1's count). */
const V2_KESTREL = mapJson('ships/kestrel', [4, 2], 3, P2);
/** A v2-only native name (RR-1a): absent at scale 1, unscaled at the art scale. */
const V2_ONLY = mapJson('items/gem-v2', [3, 3], 1);

/** A 2-glyph 6×8 v1 font named `pixel`. */
const FONT_V1 = JSON.stringify({
  name: 'pixel',
  cellWidth: 6,
  cellHeight: 8,
  lineHeight: 10,
  advance: 6,
  glyphs: {
    A: ['.####.', '#....#', '#....#', '######', '#....#', '#....#', '#....#', '......'],
    B: ['####..', '#...#.', '#...#.', '####..', '#...#.', '#...#.', '####..', '......'],
  },
});
/** The v2 (native) font of the same name: one glyph, its own 5×7 cells, built unscaled. */
const FONT_V2 = JSON.stringify({
  name: 'pixel',
  native: true,
  cellWidth: 5,
  cellHeight: 7,
  lineHeight: 9,
  advance: 5,
  glyphs: { A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '.....'] },
});

/** The shared fixture tree: v1+v2 KESTREL, a v2-only name, the PNG rules and both fonts. */
const sourceDir = tree('rules', {
  'sprites/ships/kestrel.sprite.json': V1_KESTREL,
  [`sprites/ships/kestrel${SPRITE_SOURCE_V2_SUFFIX}`]: V2_KESTREL,
  [`sprites/items/gem-v2${SPRITE_SOURCE_V2_SUFFIX}`]: V2_ONLY,
  'sprites/ships/kestrel.png': solidPng(4, 4),
  'sprites/ui/medal.png': solidPng(5, 5),
  'fonts/pixel6x8.font.json': FONT_V1,
  'fonts/pixel5x7.font.json': FONT_V2,
});

/** Look one sprite up in a clean `collectSprites` result of the tree. */
function findSprites(
  dir: string,
  artScale: number,
): Map<string, ReturnType<typeof collectSprites>['sprites'][number]> {
  const result = collectSprites({ sourceDir: dir, artScale });
  expect(result.issues).toEqual([]);
  return new Map(result.sprites.map((s) => [s.name, s] as const));
}

describe('scripts/assets/pipeline — v2 sources beside v1 (R4-P.P3, RR-1)', () => {
  it('rule 1: at the art scale the v2 map replaces the v1 source unscaled, and the v2-only name joins', () => {
    const byName = findSprites(sourceDir, 1.5);
    const kestrel = byName.get('ships/kestrel');
    expect(kestrel).toBeDefined();
    expect(kestrel?.origin.includes(SPRITE_SOURCE_V2_SUFFIX), kestrel?.origin).toBe(true);
    // The PNG override applies at the art scale: frame 0 is the 4×4 PNG, frames 1 … 2 are the
    // v2 map's own 4×2 pixels — never the ×1.5 of anything (native is implied).
    expect(kestrel?.frames.length).toBe(3);
    expect([kestrel?.frames[2].width, kestrel?.frames[2].height]).toEqual([4, 2]);
    expect([kestrel?.frames[0].width, kestrel?.frames[0].height]).toEqual([4, 4]);
    expect(kestrel?.native).toBe(true);
    const gem = byName.get('items/gem-v2');
    expect(gem).toBeDefined();
    expect(gem?.native).toBe(true);
    expect([gem?.frames[0].width, gem?.frames[0].height]).toEqual([3, 3]);
  });

  it('rule 2: at scale 1 the v2 sources are ignored — the v1 build stays the v1 art', () => {
    const byName = findSprites(sourceDir, 1);
    const kestrel = byName.get('ships/kestrel');
    expect(kestrel).toBeDefined();
    // No v2 merge, and no PNG either (rule 3): the origin is exactly the v1 file.
    expect(kestrel?.origin.endsWith('kestrel.sprite.json'), kestrel?.origin).toBe(true);
    expect(kestrel?.origin.includes(' + '), kestrel?.origin).toBe(false);
    expect(kestrel?.native).toBeUndefined();
    expect(kestrel?.frames.length).toBe(2);
    expect([kestrel?.frames[0].width, kestrel?.frames[0].height]).toEqual([2, 2]);
    expect(byName.has('items/gem-v2')).toBe(false); // RR-1a: a v2-only name is absent at scale 1
  });

  it('rule 3: a scale-1 PNG override only survives for a name without a code source', () => {
    // `ui/medal` is PNG-only: it applies at every scale, unscaled (the M3-03 figures' case).
    for (const artScale of [1, 1.5]) {
      const medal = findSprites(sourceDir, artScale).get('ui/medal');
      expect(medal, String(artScale)).toBeDefined();
      expect([medal?.frames[0].width, medal?.frames[0].height], String(artScale)).toEqual([5, 5]);
    }
    // `ships/kestrel` has code sources: its PNG applied at 1.5 (rule 1) is skipped at 1 (rule 2).
    expect(findSprites(sourceDir, 1).get('ships/kestrel')?.frames[0].width).toBe(2);
  });

  it('rule 4: the v2 font replaces its v1 namesake at the art scale unscaled; scale 1 keeps v1', () => {
    const at1 = buildAtlas({ sourceDir, ungrouped: true, artScale: 1 }).manifest;
    expect(at1.fonts.pixel.cellWidth).toBe(6);
    expect(at1.fonts.pixel.cellHeight).toBe(8);
    expect(at1.sprites['font/pixel'].frames).toEqual(['font/pixel#0', 'font/pixel#1']);
    const at15 = buildAtlas({ sourceDir, ungrouped: true, artScale: 1.5 }).manifest;
    // The v2 font's own cells — not the v1 font scaled (which would be 9 × 12), and only its
    // one glyph: the native font replaced the v1 one wholesale.
    expect(at15.fonts.pixel.cellWidth).toBe(5);
    expect(at15.fonts.pixel.cellHeight).toBe(7);
    expect(at15.sprites['font/pixel'].frames).toEqual(['font/pixel#0']);
    const native = new Map(
      buildAtlas({ sourceDir, ungrouped: true, artScale: 1.5 }).sprites.map((s) => [s.name, s]),
    );
    expect(native.get('font/pixel')?.native).toBe(true);
  });

  it('reports a v2 file whose declared name is not its path (R4-P.P3)', () => {
    const dir = tree('wrong-name', {
      [`sprites/items/bad${SPRITE_SOURCE_V2_SUFFIX}`]: mapJson('items/wrong', [2, 2], 1),
    });
    const { issues } = collectSprites({ sourceDir: dir, artScale: 1.5 });
    expect(issues.map((i) => i.path)).toEqual([
      expect.stringContaining(`items/bad${SPRITE_SOURCE_V2_SUFFIX}:name`),
    ]);
  });

  it('loads a v2 map as native even when the file declares native: false', () => {
    const dir = tree('declared-false', {
      [`sprites/ui/dot${SPRITE_SOURCE_V2_SUFFIX}`]: JSON.stringify({
        name: 'ui/dot',
        native: false,
        palette: { o: '#ffffff' },
        frames: [{ rows: ['oo'] }],
      }),
    });
    const dot = findSprites(dir, 1.5).get('ui/dot');
    expect(dot?.native).toBe(true);
    expect(findSprites(dir, 1).has('ui/dot')).toBe(false);
  });

  it('shows the rule at the manifest level: the scale-1 atlas lacks the v2-only name, the art-scale atlas has it', () => {
    // RR-1a across a real build: the scale-1 atlas of this tree holds every v1 name and none of
    // the v2-only one; the art-scale atlas holds both — the interim relation test generalises.
    const at1 = buildAtlas({ sourceDir, ungrouped: true, artScale: 1 }).manifest;
    const at15 = buildAtlas({ sourceDir, ungrouped: true, artScale: 1.5 }).manifest;
    for (const name of ['ships/kestrel', 'font/pixel', 'ui/medal'])
      expect(name in at1.sprites, name).toBe(true);
    expect('items/gem-v2' in at1.sprites).toBe(false);
    expect('items/gem-v2' in at15.sprites).toBe(true);
  });
});
