/**
 * `scripts/assets/sprite-source.mjs` and `flash.mjs` edge cases: the name patterns,
 * palette-key and colour limits, issue collection (every problem at once, no follow-up
 * floods), Aseprite sidecar corner cases (empty exports, tag directions, slices, trimmed
 * frames), loader error paths on disk, override merging and input immutability.
 *
 * Regression (M1-03 test pass): an Aseprite sidecar listing no frames produced a sprite
 * with zero frames and no issue, and `buildAtlas()` then crashed with a TypeError instead
 * of reporting the file.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { makeFlashSprite, whiteSilhouette } from '../../../scripts/assets/flash.mjs';
import { createImage, getPixel, setPixel, type Image } from '../../../scripts/assets/image.mjs';
import { AssetSourceError, buildAtlas } from '../../../scripts/assets/pipeline.mjs';
import { encodePng } from '../../../scripts/assets/png.mjs';
import {
  ANIMATION_NAME_PATTERN,
  SPRITE_NAME_PATTERN,
  applyPngOverrides,
  listFiles,
  loadSpriteSources,
  parseSpriteSource,
  readPngFrames,
  type AssetIssue,
  type PngSprite,
  type SpriteDef,
} from '../../../scripts/assets/sprite-source.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'shmup-sprite-source-edge-'));

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
 * A solid-colour image.
 *
 * @param w - Width.
 * @param h - Height.
 * @param rgba - Fill colour.
 * @returns The image.
 */
function solid(w: number, h: number, rgba: [number, number, number, number]): Image {
  const image = createImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPixel(image, x, y, rgba);
  return image;
}

/** A minimal valid source. */
const MINI = { name: 'ui/dot', palette: { x: '#fff', '.': null }, frames: [{ rows: ['x.'] }] };

/**
 * Parses a sidecar against a sheet and returns the parts plus the issues.
 *
 * @param sidecar - Sidecar JSON.
 * @param sheet - The PNG pixels (default 8×2 transparent).
 * @returns Parts and issues.
 */
function sidecarParts(sidecar: unknown, sheet: Image = createImage(8, 2)) {
  const issues: AssetIssue[] = [];
  const parts = readPngFrames(sheet, sidecar, 's.json', issues);
  return { ...parts, issues };
}

describe('scripts/assets/sprite-source — name patterns', () => {
  it.each([
    'ships/kestrel',
    'enemies/carrier-red',
    'a',
    'a/b/c',
    'x1/2y',
    'bullets/round-pink',
    'tiles/terrain-a',
  ])('accepts the sprite name %s', (name) => {
    expect(SPRITE_NAME_PATTERN.test(name)).toBe(true);
  });

  it.each([
    '',
    'Ships/kestrel',
    'ships/',
    '/ships',
    'ships//kestrel',
    'ships/-kestrel',
    'ships/kestrel-',
    'ships/kes--trel',
    'ships/kes_trel',
    'ships/kestrel@flash',
    'ships/kestrel#0',
    'ships\\kestrel',
    'ships/kestrel ',
    'ships/kestrel.png',
  ])('rejects the sprite name %j', (name) => {
    expect(SPRITE_NAME_PATTERN.test(name)).toBe(false);
  });

  it.each(['idle', 'fly-left', 'fly_left', 'a1', 'slope-up-low'])(
    'accepts the animation name %s',
    (name) => {
      expect(ANIMATION_NAME_PATTERN.test(name)).toBe(true);
    },
  );

  it.each(['', 'Idle', 'fly left', '-idle', 'idle-', 'idle__x', 'fly.left'])(
    'rejects the animation name %j',
    (name) => {
      expect(ANIMATION_NAME_PATTERN.test(name)).toBe(false);
    },
  );
});

describe('scripts/assets/sprite-source — parseSpriteSource (edge)', () => {
  it('reports every problem of a document at once', () => {
    const { sprite, issues } = parseSpriteSource(
      {
        name: 'Bad Name',
        extra: 1,
        palette: { x: 'nope' },
        frames: [{ rows: ['x'] }, { rows: [] }],
        anchor: 'centre',
        hitFlash: 1,
        animations: { idle: [5] },
      },
      'f',
    );
    expect(sprite).toBeNull();
    expect(issues.map((i) => i.path)).toEqual([
      'f:extra',
      'f:name',
      'f:palette.x',
      'f:frames[1].rows',
      'f:anchor',
      'f:hitFlash',
      'f:animations.idle[0]',
    ]);
  });

  it('accepts the printable ASCII range ! … ~ as palette keys and nothing else', () => {
    const palette = { '!': '#111', '~': '#222', '#': '#333', '0': '#444', '"': null };
    const { sprite, issues } = parseSpriteSource(
      { ...MINI, palette, frames: [{ rows: ['!~#0"'] }] },
      'f',
    );
    expect(issues).toEqual([]);
    expect(sprite?.frames[0].width).toBe(5);
    for (const key of [' ', '', 'é', '\t', '']) {
      const result = parseSpriteSource(
        { ...MINI, palette: { ...MINI.palette, [key]: '#fff' } },
        'f',
      );
      expect(
        result.issues.map((i) => i.path),
        JSON.stringify(key),
      ).toContain(`f:palette.${key}`);
    }
  });

  it('rejects non-string colours, and a "__proto__" key parsed from JSON without polluting', () => {
    for (const value of [0xffffff, true, ['#fff'], {}]) {
      const { issues } = parseSpriteSource(
        { ...MINI, palette: { ...MINI.palette, x: value } },
        'f',
      );
      expect(issues.map((i) => i.path)).toEqual(['f:palette.x']);
    }
    const json = JSON.parse(
      '{"name":"ui/dot","palette":{"x":"#fff","__proto__":"#000"},"frames":[{"rows":["x"]}]}',
    ) as unknown;
    const { issues } = parseSpriteSource(json, 'f');
    expect(issues.map((i) => i.path)).toEqual(['f:palette.__proto__']);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('does not flood the rows with unknown-character issues when the palette itself is bad', () => {
    const { issues } = parseSpriteSource({ ...MINI, palette: 'none' }, 'f');
    expect(issues.map((i) => i.path)).toEqual(['f:palette']);
    const colourIssue = parseSpriteSource({ ...MINI, palette: { x: 'bad', '.': null } }, 'f');
    expect(colourIssue.issues.map((i) => i.path)).toEqual(['f:palette.x']);
  });

  it('reports only the first unknown character of a row (one issue per row)', () => {
    const { issues } = parseSpriteSource({ ...MINI, frames: [{ rows: ['xyz', 'x.q'] }] }, 'f');
    expect(issues).toEqual([
      { path: 'f:frames[0].rows[0]', message: 'column 1: character "y" is not in the palette' },
      { path: 'f:frames[0].rows[1]', message: 'column 2: character "q" is not in the palette' },
    ]);
  });

  it('reports non-string and empty rows', () => {
    const { issues } = parseSpriteSource(
      { ...MINI, frames: [{ rows: [3, 'x.'] }, { rows: ['x.', ''] }] },
      'f',
    );
    expect(issues.map((i) => i.path)).toEqual([
      'f:frames[0].rows[0]',
      'f:frames[0].rows[1]', // row 0 has no width to compare against
      'f:frames[1].rows[1]',
    ]);
  });

  it('accepts any valid name when no location is implied', () => {
    expect(parseSpriteSource({ ...MINI, name: 'any/where' }, 'f', null).issues).toEqual([]);
    expect(parseSpriteSource({ ...MINI, name: 'any/where' }, 'f').issues).toEqual([]);
  });

  it('accepts anchors outside the frame (things drawn behind or beside the ship)', () => {
    for (const anchor of [
      [-4, 1],
      [20, -3],
      [0, 0],
    ]) {
      expect(parseSpriteSource({ ...MINI, anchor }, 'f').sprite?.anchor).toEqual(anchor);
    }
  });

  it.each([
    ['three numbers', [1, 2, 3]],
    ['a string', '1,2'],
    ['an object', { x: 1, y: 2 }],
    ['a null coordinate', [1, null]],
    ['one number', [1]],
  ])('rejects an anchor given as %s', (_label, anchor) => {
    expect(parseSpriteSource({ ...MINI, anchor }, 'f').issues.map((i) => i.path)).toEqual([
      'f:anchor',
    ]);
  });

  it.each([
    ['an array', [[0]], 'f:animations'],
    ['null', null, 'f:animations'],
    ['a non-array sequence', { idle: 0 }, 'f:animations.idle'],
    ['a negative index', { idle: [-1] }, 'f:animations.idle[0]'],
    ['a fractional index', { idle: [0.5] }, 'f:animations.idle[0]'],
    ['a string index', { idle: ['0'] }, 'f:animations.idle[0]'],
  ])('rejects animations given as %s', (_label, animations, path) => {
    expect(parseSpriteSource({ ...MINI, animations }, 'f').issues.map((i) => i.path)).toEqual([
      path,
    ]);
  });

  it('validates animation indices against the declared frame count', () => {
    const two = { ...MINI, frames: [{ rows: ['x.'] }, { rows: ['.x'] }] };
    expect(parseSpriteSource({ ...two, animations: { a: [1, 0, 1] } }, 'f').issues).toEqual([]);
    expect(parseSpriteSource({ ...two, animations: { a: [2] } }, 'f').issues[0].message).toBe(
      'must be a frame index 0…1',
    );
  });

  it('copies its input: later edits to the JSON do not reach the sprite', () => {
    const json = { ...MINI, animations: { idle: [0] }, anchor: [1, 1] };
    const { sprite } = parseSpriteSource(json, 'f');
    json.animations.idle.push(0);
    json.anchor[0] = 9;
    expect(sprite?.animations).toEqual({ idle: [0] });
    expect(sprite?.anchor).toEqual([1, 1]);
  });

  it('makes null palette entries and "." transparent, colours straight', () => {
    const { sprite } = parseSpriteSource(
      { ...MINI, palette: { a: '#ff000080', '.': null }, frames: [{ rows: ['a.'] }] },
      'f',
    );
    expect(sprite === null ? null : getPixel(sprite.frames[0], 0, 0)).toEqual([255, 0, 0, 128]);
    expect(sprite === null ? null : getPixel(sprite.frames[0], 1, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe('scripts/assets/sprite-source — Aseprite sidecars (edge)', () => {
  it('reports an export without frames (regression: it made a zero-frame sprite)', () => {
    for (const sidecar of [{ frames: [] }, { frames: {} }]) {
      const { frames, issues } = sidecarParts(sidecar);
      expect(frames).toEqual([]);
      expect(issues.map((i) => i.path)).toEqual(['s.json:frames']);
    }
  });

  it('turns a frameless export on disk into an issue, not a crash, in buildAtlas()', () => {
    const png = encodePng(solid(2, 2, [1, 2, 3, 255]));
    const dir = tree('frameless', {
      'sprites/items/empty.png': png,
      'sprites/items/empty.json': JSON.stringify({ frames: [] }),
    });
    let error: unknown;
    try {
      buildAtlas({ sourceDir: dir });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AssetSourceError);
    const { issues } = error as AssetSourceError;
    expect(issues).toHaveLength(1);
    expect(issues[0].path.endsWith('/sprites/items/empty.json:frames'), issues[0].path).toBe(true);
    expect(issues[0].message).toBe('the Aseprite export lists no frames');
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['frames as a string', { frames: 'a' }],
    ['frames as a number', { frames: 3 }],
  ])('rejects a sidecar that is %s', (_label, sidecar) => {
    expect(sidecarParts(sidecar).issues.map((i) => i.path)).toEqual(['s.json:frames']);
  });

  it.each([
    ['a non-object entry', ['x']],
    ['a missing w', [{ frame: { x: 0, y: 0, h: 1 } }]],
    ['a zero width', [{ frame: { x: 0, y: 0, w: 0, h: 1 } }]],
    ['a negative x', [{ frame: { x: -1, y: 0, w: 1, h: 1 } }]],
    ['a fractional size', [{ frame: { x: 0, y: 0, w: 1.5, h: 1 } }]],
    ['a bottom overhang', [{ frame: { x: 0, y: 1, w: 1, h: 2 } }]],
  ])('reports a frame rectangle with %s', (_label, frames) => {
    const { issues } = sidecarParts({ frames });
    expect(issues).toEqual([
      { path: 's.json:frames[0].frame', message: 'must be a rectangle inside the PNG' },
    ]);
  });

  it('defaults a missing rectangle origin to 0,0', () => {
    const sheet = createImage(2, 1);
    setPixel(sheet, 0, 0, [7, 7, 7, 255]);
    const { frames, issues } = sidecarParts({ frames: [{ frame: { w: 1, h: 1 } }] }, sheet);
    expect(issues).toEqual([]);
    expect(getPixel(frames[0], 0, 0)).toEqual([7, 7, 7, 255]);
  });

  it('keeps the hash-format frames in their listed order', () => {
    const sheet = createImage(3, 1);
    for (let x = 0; x < 3; x++) setPixel(sheet, x, 0, [x + 1, 0, 0, 255]);
    const { frames } = sidecarParts(
      {
        frames: {
          'z 2': { frame: { x: 2, y: 0, w: 1, h: 1 } },
          'a 0': { frame: { x: 0, y: 0, w: 1, h: 1 } },
        },
      },
      sheet,
    );
    expect(frames.map((f) => getPixel(f, 0, 0)[0])).toEqual([3, 1]);
  });

  it.each([
    ['no sourceSize', { spriteSourceSize: { x: 0, y: 0, w: 1, h: 1 } }],
    ['no spriteSourceSize', { sourceSize: { w: 4, h: 4 } }],
    [
      'a frame that overflows the source size',
      { spriteSourceSize: { x: 3, y: 0, w: 2, h: 1 }, sourceSize: { w: 4, h: 4 } },
    ],
    [
      'a fractional source size',
      { spriteSourceSize: { x: 0, y: 0, w: 2, h: 1 }, sourceSize: { w: 4.5, h: 4 } },
    ],
  ])('reports a trimmed frame with %s', (_label, extra) => {
    const { frames, issues } = sidecarParts({
      frames: [{ frame: { x: 0, y: 0, w: 2, h: 1 }, trimmed: true, ...extra }],
    });
    expect(frames).toEqual([]);
    expect(issues).toEqual([
      {
        path: 's.json:frames[0]',
        message: 'trimmed frame needs valid spriteSourceSize/sourceSize',
      },
    ]);
  });

  it('ignores trim data when "trimmed" is not true', () => {
    const { frames, issues } = sidecarParts({
      frames: [{ frame: { x: 0, y: 0, w: 2, h: 1 }, trimmed: false, sourceSize: { w: 9, h: 9 } }],
    });
    expect(issues).toEqual([]);
    expect([frames[0].width, frames[0].height]).toEqual([2, 1]);
  });

  it('expands tag directions, including one- and two-frame ping-pongs', () => {
    const frames = Array.from({ length: 4 }, (_, i) => ({ frame: { x: i, y: 0, w: 1, h: 1 } }));
    const { animations, issues } = sidecarParts({
      frames,
      meta: {
        frameTags: [
          { name: 'one', from: 2, to: 2, direction: 'pingpong' },
          { name: 'two', from: 0, to: 1, direction: 'pingpong' },
          { name: 'all', from: 0, to: 3, direction: 'pingpong' },
          { name: 'rev', from: 1, to: 3, direction: 'reverse' },
          { name: 'plain', from: 1, to: 2 },
          { name: 'odd', from: 0, to: 1, direction: 'sideways' },
        ],
      },
    });
    expect(issues).toEqual([]);
    expect(animations).toEqual({
      one: [2],
      two: [0, 1],
      all: [0, 1, 2, 3, 2, 1],
      rev: [3, 2, 1],
      plain: [1, 2],
      odd: [0, 1],
    });
  });

  it.each([
    ['a non-object tag', 'x'],
    ['a tag without a name', { from: 0, to: 0 }],
    ['a badly named tag', { name: 'Walk Left', from: 0, to: 0 }],
    ['from after to', { name: 't', from: 1, to: 0 }],
    ['a negative from', { name: 't', from: -1, to: 0 }],
    ['to past the last frame', { name: 't', from: 0, to: 2 }],
    ['fractional bounds', { name: 't', from: 0.5, to: 1 }],
  ])('reports %s', (_label, tag) => {
    const { animations, issues } = sidecarParts({
      frames: [{ frame: { x: 0, y: 0, w: 1, h: 1 } }, { frame: { x: 1, y: 0, w: 1, h: 1 } }],
      meta: { frameTags: [tag] },
    });
    expect(animations).toEqual({});
    expect(issues.map((i) => i.path)).toEqual(['s.json:meta.frameTags[0]']);
  });

  it('takes the anchor from the first slice that has a valid pivot', () => {
    const { anchor, issues } = sidecarParts({
      frames: [{ frame: { x: 0, y: 0, w: 1, h: 1 } }],
      meta: {
        slices: [
          'junk',
          { name: 'no keys' },
          { name: 'no pivot', keys: [{ bounds: { x: 0, y: 0, w: 4, h: 4 } }] },
          {
            name: 'bad pivot',
            keys: [{ bounds: { x: 0, y: 0, w: 4, h: 4 }, pivot: { x: 0.5, y: 1 } }],
          },
          { name: 'no bounds', keys: [{ pivot: { x: 1, y: 1 } }] },
          { name: 'good', keys: [{ bounds: { x: 2, y: 3, w: 4, h: 4 }, pivot: { x: 1, y: 2 } }] },
          { name: 'later', keys: [{ bounds: { x: 0, y: 0, w: 1, h: 1 }, pivot: { x: 0, y: 0 } }] },
        ],
      },
    });
    expect(issues).toEqual([]);
    expect(anchor).toEqual([3, 5]);
  });

  it('ignores meta that is not an object, and missing tags / slices', () => {
    const one = [{ frame: { x: 0, y: 0, w: 1, h: 1 } }];
    for (const meta of [undefined, null, 'x', { frameTags: 'x', slices: 3 }]) {
      const parts = sidecarParts({ frames: one, meta });
      expect(parts.issues).toEqual([]);
      expect(parts.animations).toEqual({});
      expect(parts.anchor).toBeNull();
    }
  });
});

describe('scripts/assets/sprite-source — loading from disk (edge)', () => {
  const png = encodePng(solid(2, 2, [0, 128, 255, 255]));

  it('reports bad PNG names, unreadable PNGs and broken sidecars, and skips those PNGs', () => {
    const dir = tree('disk-errors', {
      'Ships/Big.png': png,
      'ships/garbage.png': 'not a png at all',
      'ships/broken.png': png,
      'ships/broken.json': '{ nope',
      'ships/badframe.png': png,
      'ships/badframe.json': JSON.stringify({ frames: [{ frame: { x: 0, y: 0, w: 9, h: 9 } }] }),
      'ships/good.png': png,
    });
    const { sprites, overrides, issues } = loadSpriteSources(dir, 'src');
    expect(sprites).toEqual([]);
    expect(overrides.map((o) => o.name)).toEqual(['ships/good']);
    expect(issues.map((i) => [i.path, i.message.split(':')[0]])).toEqual([
      ['src/Ships/Big.png:', '"Ships/Big" is not a valid sprite name'],
      ['src/ships/badframe.json:frames[0].frame', 'must be a rectangle inside the PNG'],
      ['src/ships/broken.json:', 'invalid JSON'],
      ['src/ships/garbage.png:', 'unreadable PNG'],
    ]);
  });

  it('ignores documentation, editor files and anything that is not JSON or PNG', () => {
    const dir = tree('disk-ignored', {
      '.gitkeep': '',
      'README.md': '# x',
      'LICENSES.md': '# y',
      'ships/kestrel.aseprite': 'binary',
      'ships/notes.txt': 'notes',
      'ships/kestrel.sprite.json': JSON.stringify({ ...MINI, name: 'ships/kestrel' }),
    });
    const { sprites, overrides, issues } = loadSpriteSources(dir, 'src');
    expect(issues).toEqual([]);
    expect(overrides).toEqual([]);
    expect(sprites.map((s) => s.name)).toEqual(['ships/kestrel']);
  });

  it('derives names from nested paths, pairs sidecars only in the same folder', () => {
    const dir = tree('disk-nested', {
      'a/b/c.sprite.json': JSON.stringify({ ...MINI, name: 'a/b/c' }),
      'top.sprite.json': JSON.stringify({ ...MINI, name: 'top' }),
      'x/pic.png': png,
      'y/pic.json': JSON.stringify({ frames: [] }),
    });
    const { sprites, overrides, issues } = loadSpriteSources(dir, 'root');
    expect(sprites.map((s) => [s.name, s.origin])).toEqual([
      ['a/b/c', 'root/a/b/c.sprite.json'],
      ['top', 'root/top.sprite.json'],
    ]);
    expect(overrides.map((o) => [o.name, o.frames.length])).toEqual([['x/pic', 1]]);
    expect(issues.map((i) => i.path)).toEqual(['root/y/pic.json:']);
  });

  it('includes the JSON parser message for a broken source', () => {
    const dir = tree('disk-json', { 'bad.sprite.json': '{"name": }' });
    const { issues } = loadSpriteSources(dir, 'src');
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe('src/bad.sprite.json:');
    expect(issues[0].message).toMatch(/^invalid JSON: .+/);
  });

  it('listFiles walks folders in sorted order with "/" separators', () => {
    const dir = tree('disk-list', {
      'b/z.txt': '',
      'a.txt': '',
      'b/a/y.txt': '',
      'c.png/d.txt': '',
    });
    expect(listFiles(dir)).toEqual(['a.txt', 'b/a/y.txt', 'b/z.txt', 'c.png/d.txt']);
    expect(listFiles(join(dir, 'missing'))).toEqual([]);
  });
});

describe('scripts/assets/sprite-source — applyPngOverrides (edge)', () => {
  const base: SpriteDef = {
    name: 'ships/a',
    anchor: null,
    hitFlash: false,
    frames: [solid(2, 2, [1, 1, 1, 255])],
    animations: { idle: [0] },
    origin: 'code',
  };
  const png = (overrides: Partial<PngSprite> = {}): PngSprite => ({
    name: 'ships/a',
    origin: 'a.png',
    frames: [solid(2, 2, [9, 9, 9, 255])],
    animations: {},
    anchor: null,
    ...overrides,
  });

  it('takes the sidecar anchor when the code sprite has none', () => {
    const [out] = applyPngOverrides([base], [png({ anchor: [0, 1] })]);
    expect(out.anchor).toEqual([0, 1]);
  });

  it('lets a sidecar tag replace a code animation of the same name', () => {
    const [out] = applyPngOverrides([base], [png({ animations: { idle: [0, 0] } })]);
    expect(out.animations).toEqual({ idle: [0, 0] });
    expect(base.animations).toEqual({ idle: [0] });
  });

  it('returns a new list and leaves sprites without an override untouched (same object)', () => {
    const other: SpriteDef = { ...base, name: 'ships/b' };
    const list = [base, other];
    const out = applyPngOverrides(list, [png()]);
    expect(out).not.toBe(list);
    expect(out[1]).toBe(other);
    expect(list[0]).toBe(base);
    expect(base.frames[0].data[0]).toBe(1);
  });

  it('with no overrides returns an equal copy', () => {
    const out = applyPngOverrides([base], []);
    expect(out).toEqual([base]);
  });

  it('merges two overrides for the same new sprite into one entry', () => {
    const out = applyPngOverrides(
      [],
      [
        png({ name: 'items/new', origin: 'one.png' }),
        png({
          name: 'items/new',
          origin: 'two.png',
          frames: [createImage(1, 1), createImage(1, 1)],
        }),
      ],
    );
    expect(out).toHaveLength(1);
    expect(out[0].frames).toHaveLength(2);
    expect(out[0].origin).toBe('one.png + two.png');
  });
});

describe('scripts/assets/flash — edge', () => {
  it('drops the colour of fully transparent pixels and keeps any alpha > 0', () => {
    const frame = createImage(3, 1);
    frame.data.set([10, 20, 30, 0, 0, 0, 0, 1, 255, 255, 255, 255]);
    expect(Array.from(whiteSilhouette(frame).data)).toEqual([
      0, 0, 0, 0, 255, 255, 255, 1, 255, 255, 255, 255,
    ]);
  });

  it('never modifies its input and returns fresh frames and animations', () => {
    const frame = solid(2, 1, [5, 6, 7, 200]);
    const sprite: SpriteDef = {
      name: 'enemies/x',
      anchor: [0, 0],
      hitFlash: true,
      frames: [frame],
      animations: { spin: [0] },
      origin: 'code',
    };
    const flash = makeFlashSprite(sprite);
    expect(flash.frames[0]).not.toBe(frame);
    expect(Array.from(frame.data)).toEqual([5, 6, 7, 200, 5, 6, 7, 200]);
    flash.animations.extra = [0];
    expect(sprite.animations).toEqual({ spin: [0] });
    expect(flash.origin).toBe('flash:enemies/x');
  });
});
