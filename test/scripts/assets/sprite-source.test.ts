/**
 * `scripts/assets/sprite-source.mjs` and `flash.mjs` — parsing of the `*.sprite.json`
 * pixel maps (every failure reported with a `<file>:<json path>`), real-art PNG overrides
 * with Aseprite sidecars, and hit-flash silhouettes (decision D30).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FLASH_SUFFIX, makeFlashSprite, whiteSilhouette } from '../../../scripts/assets/flash.mjs';
import { createImage, getPixel, setPixel } from '../../../scripts/assets/image.mjs';
import { encodePng } from '../../../scripts/assets/png.mjs';
import {
  applyPngOverrides,
  loadSpriteSources,
  parseSpriteSource,
  readPngFrames,
  type SpriteDef,
} from '../../../scripts/assets/sprite-source.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'shmup-sprite-source-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** A valid two-frame source. */
const GOOD = {
  name: 'enemies/test',
  description: 'fixture',
  palette: { '.': null, a: '#ff0000', b: '#00ff0080' },
  anchor: [1, 0],
  hitFlash: true,
  frames: [{ rows: ['.a.', 'aba'] }, { rows: ['a.a', '.b.'] }],
  animations: { idle: [0, 1] },
};

/**
 * Writes files into a fresh directory under the temp root.
 *
 * @param name - Directory name.
 * @param files - Relative path → contents.
 * @returns The directory.
 */
function tree(name: string, files: Record<string, string | Uint8Array>): string {
  const root = join(tmp, name);
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

/**
 * A solid-colour image.
 *
 * @param w - Width.
 * @param h - Height.
 * @param rgba - Fill colour.
 * @returns The image.
 */
function solid(w: number, h: number, rgba: [number, number, number, number]) {
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPixel(image, x, y, rgba);
  return image;
}

describe('scripts/assets/sprite-source — parseSpriteSource', () => {
  it('draws the frames with the palette and keeps the metadata', () => {
    const { sprite, issues } = parseSpriteSource(GOOD, 'f.json', 'enemies/test');
    expect(issues).toEqual([]);
    expect(sprite).not.toBeNull();
    if (sprite === null) return;
    expect(sprite.name).toBe('enemies/test');
    expect(sprite.anchor).toEqual([1, 0]);
    expect(sprite.hitFlash).toBe(true);
    expect(sprite.animations).toEqual({ idle: [0, 1] });
    expect(sprite.frames).toHaveLength(2);
    expect(sprite.frames[0].width).toBe(3);
    expect(sprite.frames[0].height).toBe(2);
    expect(getPixel(sprite.frames[0], 0, 0)).toEqual([0, 0, 0, 0]);
    expect(getPixel(sprite.frames[0], 1, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(sprite.frames[0], 1, 1)).toEqual([0, 255, 0, 128]);
    expect(sprite.origin).toBe('f.json');
  });

  it('defaults anchor to null (frame centre later), hitFlash to false, no animations', () => {
    const { sprite } = parseSpriteSource(
      { name: 'ui/dot', palette: { x: '#fff' }, frames: [{ rows: ['x'] }] },
      'f',
    );
    expect(sprite).toMatchObject({ anchor: null, hitFlash: false, animations: {} });
  });

  it.each([
    ['not an object', [], 'f:', 'must be a JSON object'],
    ['an unknown field', { ...GOOD, colour: 1 }, 'f:colour', 'unknown field'],
    ['a bad name', { ...GOOD, name: 'Enemies/Test' }, 'f:name', 'sprite name'],
    ['a reserved @ in the name', { ...GOOD, name: 'a@flash' }, 'f:name', 'sprite name'],
    [
      'a name that does not match the path',
      { ...GOOD, name: 'enemies/other' },
      'f:name',
      'expected "enemies/test"',
    ],
    ['a non-string description', { ...GOOD, description: 3 }, 'f:description', 'string'],
    ['a missing palette', { ...GOOD, palette: undefined }, 'f:palette', 'object'],
    [
      'a two-character palette key',
      { ...GOOD, palette: { ...GOOD.palette, ab: '#fff' } },
      'f:palette.ab',
      'single',
    ],
    ['a bad colour', { ...GOOD, palette: { ...GOOD.palette, a: 'red' } }, 'f:palette.a', 'colour'],
    ['no frames', { ...GOOD, frames: [] }, 'f:frames', 'non-empty'],
    ['a frame that is not an object', { ...GOOD, frames: ['..'] }, 'f:frames[0]', 'object'],
    [
      'an unknown frame field',
      { ...GOOD, frames: [{ rows: ['a'], x: 1 }] },
      'f:frames[0].x',
      'unknown',
    ],
    ['empty rows', { ...GOOD, frames: [{ rows: [] }] }, 'f:frames[0].rows', 'non-empty'],
    [
      'a ragged row',
      { ...GOOD, frames: [{ rows: ['aa', 'a'] }] },
      'f:frames[0].rows[1]',
      '1 pixels wide',
    ],
    [
      'an unknown character',
      { ...GOOD, frames: [{ rows: ['az'] }] },
      'f:frames[0].rows[0]',
      'column 1: character "z"',
    ],
    [
      'frames of different sizes',
      { ...GOOD, frames: [{ rows: ['aa'] }, { rows: ['a'] }] },
      'f:frames[1].rows',
      'frame 0 is 2×1',
    ],
    ['a bad anchor', { ...GOOD, anchor: [1.5, 0] }, 'f:anchor', '[x, y]'],
    ['a non-boolean hitFlash', { ...GOOD, hitFlash: 'yes' }, 'f:hitFlash', 'boolean'],
    [
      'an out-of-range animation frame',
      { ...GOOD, animations: { idle: [0, 2] } },
      'f:animations.idle[1]',
      '0…1',
    ],
    [
      'a badly named animation',
      { ...GOOD, animations: { 'Idle Loop': [0] } },
      'f:animations.Idle Loop',
      'case',
    ],
    ['an empty animation', { ...GOOD, animations: { idle: [] } }, 'f:animations.idle', 'non-empty'],
  ])('reports %s', (_label, json, path, message) => {
    const { sprite, issues } = parseSpriteSource(json, 'f', 'enemies/test');
    expect(sprite).toBeNull();
    const issue = issues.find((i) => i.path === path);
    expect(issue, JSON.stringify(issues)).toBeDefined();
    expect(issue?.message).toContain(message);
  });
});

describe('scripts/assets/sprite-source — PNG sources', () => {
  it('uses the whole PNG as frame 0 without a sidecar', () => {
    const image = solid(4, 3, [9, 8, 7, 255]);
    const issues: { path: string; message: string }[] = [];
    const parts = readPngFrames(image, undefined, 's.json', issues);
    expect(issues).toEqual([]);
    expect(parts.frames).toEqual([image]);
    expect(parts.anchor).toBeNull();
  });

  it('cuts Aseprite hash-format frames, tags (forward/reverse/pingpong) and the slice pivot', () => {
    const sheet = createImage(8, 2);
    for (let x = 0; x < 8; x++) setPixel(sheet, x, 0, [x * 10, 0, 0, 255]);
    const sidecar = {
      frames: {
        'a 0.aseprite': { frame: { x: 0, y: 0, w: 2, h: 2 } },
        'a 1.aseprite': { frame: { x: 2, y: 0, w: 2, h: 2 } },
        'a 2.aseprite': { frame: { x: 4, y: 0, w: 2, h: 2 } },
      },
      meta: {
        frameTags: [
          { name: 'fly', from: 0, to: 2, direction: 'forward' },
          { name: 'back', from: 0, to: 2, direction: 'reverse' },
          { name: 'bounce', from: 0, to: 2, direction: 'pingpong' },
        ],
        slices: [
          {
            name: 'pivot',
            keys: [{ frame: 0, bounds: { x: 0, y: 0, w: 2, h: 2 }, pivot: { x: 1, y: 1 } }],
          },
        ],
      },
    };
    const issues: { path: string; message: string }[] = [];
    const parts = readPngFrames(sheet, sidecar, 's.json', issues);
    expect(issues).toEqual([]);
    expect(parts.frames).toHaveLength(3);
    expect(getPixel(parts.frames[1], 0, 0)).toEqual([20, 0, 0, 255]);
    expect(parts.animations).toEqual({ fly: [0, 1, 2], back: [2, 1, 0], bounce: [0, 1, 2, 1] });
    expect(parts.anchor).toEqual([1, 1]);
  });

  it('restores trimmed frames to their source size', () => {
    const sheet = solid(2, 1, [1, 2, 3, 255]);
    const sidecar = {
      frames: [
        {
          frame: { x: 0, y: 0, w: 2, h: 1 },
          trimmed: true,
          spriteSourceSize: { x: 1, y: 2, w: 2, h: 1 },
          sourceSize: { w: 4, h: 4 },
        },
      ],
    };
    const issues: { path: string; message: string }[] = [];
    const [frame] = readPngFrames(sheet, sidecar, 's.json', issues).frames;
    expect(issues).toEqual([]);
    expect(frame.width).toBe(4);
    expect(frame.height).toBe(4);
    expect(getPixel(frame, 1, 2)).toEqual([1, 2, 3, 255]);
    expect(getPixel(frame, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it.each([
    ['not an Aseprite export', { hello: 1 }, 's.json:frames'],
    [
      'a frame outside the PNG',
      { frames: [{ frame: { x: 0, y: 0, w: 9, h: 1 } }] },
      's.json:frames[0].frame',
    ],
    [
      'an invalid tag',
      {
        frames: [{ frame: { x: 0, y: 0, w: 1, h: 1 } }],
        meta: { frameTags: [{ name: 't', from: 0, to: 5 }] },
      },
      's.json:meta.frameTags[0]',
    ],
  ])('reports %s', (_label, sidecar, path) => {
    const issues: { path: string; message: string }[] = [];
    readPngFrames(solid(2, 2, [0, 0, 0, 255]), sidecar, 's.json', issues);
    expect(issues.map((i) => i.path)).toContain(path);
  });

  it('loads sources from disk, pairs PNGs with sidecars and flags stray JSON', () => {
    const png = encodePng(solid(2, 2, [255, 255, 0, 255]));
    const dir = tree('load', {
      'ships/a.sprite.json': JSON.stringify({ ...GOOD, name: 'ships/a' }),
      'ships/b.sprite.json': JSON.stringify({ ...GOOD, name: 'ships/wrong' }),
      'ships/a.png': png,
      'ships/a.json': JSON.stringify({ frames: [{ frame: { x: 0, y: 0, w: 1, h: 2 } }] }),
      'items/new.png': png,
      'items/stray.json': '{}',
      'items/broken.sprite.json': '{ nope',
      'README.md': '# notes',
      'ships/a.aseprite': 'binary',
    });
    const { sprites, overrides, issues } = loadSpriteSources(dir, 'src');
    expect(sprites.map((s) => s.name)).toEqual(['ships/a']);
    expect(sprites[0].origin).toBe('src/ships/a.sprite.json');
    expect(overrides.map((o) => o.name).sort()).toEqual(['items/new', 'ships/a']);
    expect(overrides.find((o) => o.name === 'ships/a')?.frames[0].width).toBe(1);
    const paths = issues.map((i) => i.path).sort();
    expect(paths).toEqual([
      'src/items/broken.sprite.json:',
      'src/items/stray.json:',
      'src/ships/b.sprite.json:name',
    ]);
  });

  it('returns nothing for a missing directory', () => {
    expect(loadSpriteSources(join(tmp, 'nope'), 'x')).toEqual({
      sprites: [],
      overrides: [],
      issues: [],
    });
  });
});

describe('scripts/assets/sprite-source — applyPngOverrides', () => {
  const base: SpriteDef = {
    name: 'ships/a',
    anchor: [3, 3],
    hitFlash: true,
    frames: [solid(2, 2, [1, 1, 1, 255]), solid(2, 2, [2, 2, 2, 255])],
    animations: { idle: [0, 1] },
    origin: 'code',
  };

  it('replaces frames by index, appends extras, keeps anchor and flash, merges tags', () => {
    const replacement = solid(3, 3, [9, 9, 9, 255]);
    const extra = solid(3, 3, [8, 8, 8, 255]);
    const [out] = applyPngOverrides(
      [base],
      [
        {
          name: 'ships/a',
          origin: 'a.png',
          frames: [replacement, replacement, extra],
          animations: { fly: [2] },
          anchor: [0, 0],
        },
      ],
    );
    expect(out.frames).toEqual([replacement, replacement, extra]);
    expect(out.anchor).toEqual([3, 3]);
    expect(out.hitFlash).toBe(true);
    expect(out.animations).toEqual({ idle: [0, 1], fly: [2] });
    expect(out.origin).toBe('code + a.png');
    expect(base.frames[0].data[0]).toBe(1); // input untouched
  });

  it('keeps code frames the PNG does not provide', () => {
    const replacement = solid(2, 2, [5, 5, 5, 255]);
    const [out] = applyPngOverrides(
      [base],
      [{ name: 'ships/a', origin: 'p', frames: [replacement], animations: {}, anchor: null }],
    );
    expect(out.frames[0]).toBe(replacement);
    expect(out.frames[1]).toBe(base.frames[1]);
  });

  it('adds PNG-only sprites with their sidecar anchor and no hit flash', () => {
    const frame = solid(2, 2, [5, 5, 5, 255]);
    const out = applyPngOverrides(
      [base],
      [{ name: 'items/new', origin: 'n.png', frames: [frame], animations: {}, anchor: [1, 0] }],
    );
    expect(out.map((s) => s.name)).toEqual(['ships/a', 'items/new']);
    expect(out[1]).toMatchObject({ anchor: [1, 0], hitFlash: false, origin: 'n.png' });
  });
});

describe('scripts/assets/flash — hit-flash silhouettes', () => {
  it('turns every visible pixel white and keeps alpha', () => {
    const image = createImage(3, 1);
    setPixel(image, 0, 0, [10, 20, 30, 255]);
    setPixel(image, 1, 0, [200, 0, 0, 64]);
    const white = whiteSilhouette(image);
    expect([...white.data]).toEqual([255, 255, 255, 255, 255, 255, 255, 64, 0, 0, 0, 0]);
  });

  it('builds the <name>@flash sibling with the same frames, anchor and tags', () => {
    const sprite: SpriteDef = {
      name: 'enemies/x',
      anchor: [1, 2],
      hitFlash: true,
      frames: [solid(2, 2, [1, 2, 3, 255]), solid(2, 2, [4, 5, 6, 255])],
      animations: { spin: [0, 1] },
      origin: 'code',
    };
    const flash = makeFlashSprite(sprite);
    expect(flash.name).toBe(`enemies/x${FLASH_SUFFIX}`);
    expect(flash.anchor).toEqual([1, 2]);
    expect(flash.hitFlash).toBe(false);
    expect(flash.animations).toEqual({ spin: [0, 1] });
    expect(flash.frames.map((f) => getPixel(f, 1, 1))).toEqual([
      [255, 255, 255, 255],
      [255, 255, 255, 255],
    ]);
  });
});
