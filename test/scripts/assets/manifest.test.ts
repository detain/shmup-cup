/**
 * `scripts/assets/manifest.mjs` — the atlas manifest's serialiser (diff-friendly, exact
 * layout), `frameName`, `findMissingSprites` edge cases — and the self-consistency of the
 * real manifest `buildAtlas()` produces: every reference (sprite → frames, flash sibling,
 * animation indices, font glyph frames) resolves, and frames sit on their page without
 * overlapping any other frame's cell.
 */
import { describe, expect, it } from 'vitest';
import {
  MANIFEST_FORMAT_VERSION,
  findMissingSprites,
  formatManifest,
  frameName,
  type AtlasManifest,
} from '../../../scripts/assets/manifest.mjs';
import { ATLAS_EXTRUDE, ATLAS_PADDING, buildAtlas } from '../../../scripts/assets/pipeline.mjs';

const { manifest } = buildAtlas();

/** A tiny manifest with every section. */
const TINY: AtlasManifest = {
  formatVersion: 1,
  pages: [{ file: 'main.png', w: 64, h: 64 }],
  frames: {
    'a#0': { p: 0, x: 1, y: 1, w: 2, h: 2, ax: 1, ay: 1 },
    'a#1': { p: 0, x: 5, y: 1, w: 2, h: 2, ax: 1, ay: 1 },
  },
  sprites: { a: { frames: ['a#0', 'a#1'], flash: null } },
  animations: { a: { spin: [0, 1] } },
  fonts: {},
};

describe('scripts/assets/manifest — formatManifest', () => {
  it('writes sections one entry per line, each entry compact, with a final newline', () => {
    expect(formatManifest(TINY)).toBe(
      [
        '{',
        '  "formatVersion": 1,',
        '  "pages": [',
        '    {"file":"main.png","w":64,"h":64}',
        '  ],',
        '  "frames": {',
        '    "a#0": {"p":0,"x":1,"y":1,"w":2,"h":2,"ax":1,"ay":1},',
        '    "a#1": {"p":0,"x":5,"y":1,"w":2,"h":2,"ax":1,"ay":1}',
        '  },',
        '  "sprites": {',
        '    "a": {"frames":["a#0","a#1"],"flash":null}',
        '  },',
        '  "animations": {',
        '    "a": {"spin":[0,1]}',
        '  },',
        '  "fonts": {}',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('writes empty sections compactly and escapes names as JSON', () => {
    const text = formatManifest({
      ...TINY,
      pages: [],
      frames: {},
      sprites: { 'q"uote\\': { frames: [], flash: null } },
      animations: {},
    });
    expect(text).toContain('  "pages": [],\n');
    expect(text).toContain('  "frames": {},\n');
    expect(text).toContain('    "q\\"uote\\\\": {"frames":[],"flash":null}\n');
    expect((JSON.parse(text) as AtlasManifest).sprites).toHaveProperty('q"uote\\');
  });

  it('round-trips the real manifest and keeps one line per frame (diff-friendly)', () => {
    const text = formatManifest(manifest);
    expect(JSON.parse(text)).toEqual(manifest);
    const lines = text.split('\n');
    const frameLines = lines.filter((line) => /^ {4}"[^"]+#\d+": \{"p":/.test(line));
    expect(frameLines).toHaveLength(Object.keys(manifest.frames).length);
    expect(text).toBe(formatManifest(JSON.parse(text) as AtlasManifest)); // stable
  });
});

describe('scripts/assets/manifest — frameName', () => {
  it('joins sprite and index with "#"', () => {
    expect(frameName('ships/kestrel', 0)).toBe('ships/kestrel#0');
    expect(frameName('font/pixel', 101)).toBe('font/pixel#101');
    expect(frameName('enemies/drifter@flash', 2)).toBe('enemies/drifter@flash#2');
  });
});

describe('scripts/assets/manifest — findMissingSprites (edge)', () => {
  it('returns nothing for an empty list and uses the default "sprites" label', () => {
    expect(findMissingSprites(manifest, [])).toEqual([]);
    expect(findMissingSprites(manifest, ['nope/x']).map((i) => i.path)).toEqual(['sprites[0]']);
  });

  it('reports every occurrence of a repeated missing name', () => {
    expect(
      findMissingSprites(manifest, ['a/b', 'ships/kestrel', 'a/b']).map((i) => i.path),
    ).toEqual(['sprites[0]', 'sprites[2]']);
  });

  it('treats generated @flash siblings and font sprites as existing names', () => {
    expect(
      findMissingSprites(manifest, ['enemies/drifter@flash', 'font/pixel', 'ui/pixel']),
    ).toEqual([]);
  });

  it('does not match frame names, prefixes or prototype keys', () => {
    const names = ['ships/kestrel#0', 'ships', 'ships/kestre', '__proto__', 'hasOwnProperty'];
    expect(findMissingSprites(manifest, names)).toHaveLength(names.length);
  });

  it('works on a manifest parsed from JSON (no prototype surprises)', () => {
    const parsed = JSON.parse(formatManifest(TINY)) as AtlasManifest;
    expect(findMissingSprites(parsed, ['a', 'b'], 'x')).toEqual([
      {
        path: 'x[1]',
        message:
          'sprite "b" is not in the atlas — add assets/source/sprites/b.sprite.json, a PNG of ' +
          'that name, or a procedural generator',
      },
    ]);
  });
});

describe('the atlas manifest buildAtlas() produces — self-consistency', () => {
  it('has the documented top-level keys in order and the current format version', () => {
    expect(Object.keys(manifest)).toEqual([
      'formatVersion',
      'pages',
      'frames',
      'sprites',
      'animations',
      'fonts',
    ]);
    expect(manifest.formatVersion).toBe(MANIFEST_FORMAT_VERSION);
    expect(MANIFEST_FORMAT_VERSION).toBe(1);
  });

  it('lists each frame under exactly one sprite, in index order', () => {
    const owners = new Map<string, string>();
    for (const [name, sprite] of Object.entries(manifest.sprites)) {
      expect(sprite.frames.length, name).toBeGreaterThan(0);
      sprite.frames.forEach((frame, i) => {
        expect(frame).toBe(`${name}#${i}`);
        expect(owners.has(frame)).toBe(false);
        owners.set(frame, name);
      });
    }
    expect([...owners.keys()].sort()).toEqual(Object.keys(manifest.frames).sort());
  });

  it('shares one anchor across the frames of a sprite', () => {
    for (const [name, sprite] of Object.entries(manifest.sprites)) {
      const anchors = new Set(
        sprite.frames.map((f) => `${manifest.frames[f].ax},${manifest.frames[f].ay}`),
      );
      expect(anchors.size, name).toBe(1);
    }
  });

  it('resolves every flash sibling, animation index and font glyph frame', () => {
    for (const [name, sprite] of Object.entries(manifest.sprites)) {
      if (sprite.flash === null) continue;
      expect(sprite.flash).toBe(`${name}@flash`);
      expect(manifest.sprites[sprite.flash].frames).toHaveLength(sprite.frames.length);
      expect(manifest.sprites[sprite.flash].flash).toBeNull();
    }
    for (const name of Object.keys(manifest.sprites).filter((n) => n.endsWith('@flash'))) {
      expect(manifest.sprites[name.slice(0, -'@flash'.length)].flash).toBe(name);
    }
    for (const [name, tags] of Object.entries(manifest.animations)) {
      const count = manifest.sprites[name]?.frames.length ?? 0;
      expect(count, name).toBeGreaterThan(0);
      expect(Object.keys(tags)).toEqual(Object.keys(tags).sort());
      for (const [tag, sequence] of Object.entries(tags)) {
        expect(sequence.length, `${name}.${tag}`).toBeGreaterThan(0);
        for (const index of sequence) expect(index).toBeLessThan(count);
      }
    }
    for (const font of Object.values(manifest.fonts)) {
      expect(manifest.sprites[font.sprite].frames).toHaveLength(Object.keys(font.glyphs).length);
      for (const glyph of Object.values(font.glyphs)) {
        expect(manifest.frames[glyph.frame]).toMatchObject({
          w: font.cellWidth,
          h: font.cellHeight,
        });
      }
    }
  });

  it('keeps every frame (with its extrusion border) on its page and no two cells overlapping', () => {
    const frames = Object.entries(manifest.frames);
    for (const [name, f] of frames) {
      const page = manifest.pages[f.p];
      expect(page, name).toBeDefined();
      expect(f.x - ATLAS_EXTRUDE).toBeGreaterThanOrEqual(0);
      expect(f.y - ATLAS_EXTRUDE).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w + ATLAS_EXTRUDE).toBeLessThanOrEqual(page.w);
      expect(f.y + f.h + ATLAS_EXTRUDE).toBeLessThanOrEqual(page.h);
    }
    const grow = ATLAS_EXTRUDE;
    const cells = frames
      .map(([name, f]) => ({
        name,
        p: f.p,
        x0: f.x - grow,
        y0: f.y - grow,
        x1: f.x + f.w + grow + ATLAS_PADDING,
        y1: f.y + f.h + grow + ATLAS_PADDING,
      }))
      .sort((a, b) => a.p - b.p || a.x0 - b.x0);
    for (let a = 0; a < cells.length; a++) {
      for (let b = a + 1; b < cells.length; b++) {
        const A = cells[a];
        const B = cells[b];
        if (B.p !== A.p || B.x0 >= A.x1) break;
        const overlap = A.y0 < B.y1 && B.y0 < A.y1;
        expect(overlap, `${A.name} overlaps ${B.name}`).toBe(false);
      }
    }
  });

  it('writes page file names main.png, main-1.png, … with power-of-two sizes ≤ 2048', () => {
    manifest.pages.forEach((page, i) => {
      expect(page.file).toBe(i === 0 ? 'main.png' : `main-${i}.png`);
      for (const side of [page.w, page.h]) {
        expect(side & (side - 1)).toBe(0);
        expect(side).toBeLessThanOrEqual(2048);
      }
    });
  });
});
