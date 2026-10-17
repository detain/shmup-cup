/**
 * `scripts/assets/pipeline.mjs` — atlas groups (R1-05): the groups file
 * (`assets/source/atlas-groups.json`, format `shmup-atlas-groups@1`), the group rules
 * (`resolveAtlasGroup`: the file by base name, then a `zone-<id>` directory, then
 * `common`), and what a grouped build writes — manifest format 2 with `pages[i].group`,
 * page 0 = `main.png` = `common`, each group on its own pages, PNG-8 where a page fits a
 * palette, sprite and frame names unchanged, every frame's pixels unchanged.
 *
 * Every build here runs on a scratch copy of `assets/source/` with its own groups file (or
 * none), so the tests hold whatever the shipped groups file says.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createImage, type Image } from '../../../scripts/assets/image.mjs';
import { packRects } from '../../../scripts/assets/packer.mjs';
import {
  ATLAS_EXTRUDE,
  ATLAS_GROUPS_FILE,
  ATLAS_GROUPS_FORMAT,
  ATLAS_PADDING,
  AssetSourceError,
  COMMON_GROUP,
  DEFAULT_SOURCE_DIR,
  buildAtlas,
  collectSprites,
  computeInputHash,
  generateAssets,
  loadAtlasGroups,
  resolveAtlasGroup,
} from '../../../scripts/assets/pipeline.mjs';
import { encodePng, indexedPalette } from '../../../scripts/assets/png.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'shmup-pipeline-groups-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Copies the real asset sources into a scratch folder, without any groups file.
 *
 * @param name - Folder name.
 * @returns The copied source root.
 */
function copySources(name: string): string {
  const dir = join(tmp, name);
  cpSync(DEFAULT_SOURCE_DIR, dir, { recursive: true });
  rmSync(join(dir, ATLAS_GROUPS_FILE), { force: true });
  return dir;
}

/**
 * Writes a file, creating its folder.
 *
 * @param file - Absolute path.
 * @param contents - Contents.
 */
function put(file: string, contents: string | Uint8Array): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

/**
 * Writes a groups file into a source folder.
 *
 * @param dir - Source root.
 * @param groups - Group → base sprite names.
 * @param extra - Extra top-level fields (or overrides of `format`).
 */
function writeGroups(
  dir: string,
  groups: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): void {
  put(
    join(dir, ATLAS_GROUPS_FILE),
    JSON.stringify({ format: ATLAS_GROUPS_FORMAT, groups, ...extra }, null, 2),
  );
}

/**
 * Runs code expected to throw an `AssetSourceError` and returns its issues.
 *
 * @param run - The code.
 * @returns `path message` per issue.
 */
function issuesOf(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AssetSourceError);
    return (error as AssetSourceError).issues.map((i) => `${i.path} ${i.message}`);
  }
  throw new Error('expected an AssetSourceError');
}

/**
 * Cuts one frame's pixels out of a page.
 *
 * @param page - Page pixels.
 * @param f - The frame's rectangle.
 * @param f.x - Left column.
 * @param f.y - Top row.
 * @param f.w - Width.
 * @param f.h - Height.
 * @returns The frame's RGBA bytes, row by row.
 */
function cut(page: Image, f: { x: number; y: number; w: number; h: number }): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < f.h; y++) {
    const at = ((f.y + y) * page.width + f.x) * 4;
    rows.push(Buffer.from(page.data.subarray(at, at + f.w * 4)));
  }
  return Buffer.concat(rows);
}

/** A 6×5 PNG override in a zone directory: the path rule puts it in `zone-q`. */
function blobPng(): Uint8Array {
  const art = createImage(6, 5);
  for (let i = 0; i < art.data.length; i += 4) art.data.set([200, 40, 90, 255], i);
  return encodePng(art);
}

/** The grouped fixture: three listed sprites (with siblings) and one path-rule sprite. */
const FIXTURE_GROUPS = {
  'zone-a': ['enemies/drifter', 'bullets/round-pink'],
  'zone-b': ['ships/kestrel'],
};

const groupedDir = copySources('grouped');
writeGroups(groupedDir, FIXTURE_GROUPS, { comment: 'test fixture' });
put(join(groupedDir, 'sprites', 'enemies', 'zone-q', 'blob.png'), blobPng());
const grouped = buildAtlas({ sourceDir: groupedDir });

// The same sources without the groups file (the blob still has its own zone-q page).
const plainDir = copySources('plain');
put(join(plainDir, 'sprites', 'enemies', 'zone-q', 'blob.png'), blobPng());
const plain = buildAtlas({ sourceDir: plainDir });

describe('scripts/assets/pipeline — resolveAtlasGroup', () => {
  const table = new Map([
    ['enemies/drifter', 'zone-a'],
    ['bg/zone-c/far', 'common'],
  ]);

  it('looks the base name up in the table, so every @ sibling follows its sprite', () => {
    expect(resolveAtlasGroup('enemies/drifter', table)).toBe('zone-a');
    expect(resolveAtlasGroup('enemies/drifter@flash', table)).toBe('zone-a');
    expect(resolveAtlasGroup('enemies/drifter@deuteranopia', table)).toBe('zone-a');
    expect(resolveAtlasGroup('enemies/drifter-big', table)).toBe(COMMON_GROUP);
  });

  it('takes a zone-<id> directory segment next, and the table wins over it', () => {
    expect(resolveAtlasGroup('enemies/zone-d/bat', table)).toBe('zone-d');
    expect(resolveAtlasGroup('bg/zone-a/sky/far@p2', table)).toBe('zone-a');
    expect(resolveAtlasGroup('bg/zone-c/far', table)).toBe('common');
    // Only directories count, and only an exact zone-<id> segment.
    expect(resolveAtlasGroup('bg/zone-a', table)).toBe(COMMON_GROUP);
    expect(resolveAtlasGroup('bg/zone-a-sky/far', table)).toBe(COMMON_GROUP);
    expect(resolveAtlasGroup('bg/my-zone-a/far', table)).toBe(COMMON_GROUP);
  });

  it('defaults to common', () => {
    expect(resolveAtlasGroup('ui/pixel', new Map())).toBe('common');
    expect(COMMON_GROUP).toBe('common');
  });
});

describe('scripts/assets/pipeline — loadAtlasGroups', () => {
  it('returns an empty table and no issue without a file', () => {
    const dir = join(tmp, 'no-groups');
    mkdirSync(dir, { recursive: true });
    const result = loadAtlasGroups(dir);
    expect(result.present).toBe(false);
    expect(result.table.size).toBe(0);
    expect(result.issues).toEqual([]);
  });

  it('reads base name → group in file order', () => {
    const result = loadAtlasGroups(groupedDir);
    expect(result.present).toBe(true);
    expect(result.issues).toEqual([]);
    expect([...result.table]).toEqual([
      ['enemies/drifter', 'zone-a'],
      ['bullets/round-pink', 'zone-a'],
      ['ships/kestrel', 'zone-b'],
    ]);
    expect(result.file.endsWith(ATLAS_GROUPS_FILE)).toBe(true);
  });

  it.each([
    ['invalid JSON', '{ nope', /: is not valid JSON/],
    ['an array', '[]', /: must be a JSON object$/],
    [
      'another format',
      JSON.stringify({ format: 'x@2', groups: {} }),
      /:format must be "shmup-atlas-groups@1"$/,
    ],
    [
      'an unknown field',
      JSON.stringify({ format: ATLAS_GROUPS_FORMAT, groups: {}, extra: 1 }),
      /:extra is not a known field$/,
    ],
    [
      'a non-string comment',
      JSON.stringify({ format: ATLAS_GROUPS_FORMAT, groups: {}, comment: 3 }),
      /:comment must be a string$/,
    ],
    [
      'groups as an array',
      JSON.stringify({ format: ATLAS_GROUPS_FORMAT, groups: [] }),
      /:groups must be an object/,
    ],
    [
      'a bad group name',
      JSON.stringify({ format: ATLAS_GROUPS_FORMAT, groups: { 'Zone A': [] } }),
      /:groups\.Zone A is not a lower-case kebab name$/,
    ],
    [
      'names not in an array',
      JSON.stringify({ format: ATLAS_GROUPS_FORMAT, groups: { 'zone-a': 'x' } }),
      /:groups\.zone-a must be an array of names$/,
    ],
    [
      'an empty name',
      JSON.stringify({ format: ATLAS_GROUPS_FORMAT, groups: { 'zone-a': [''] } }),
      /:groups\.zone-a\[0\] must be a sprite name$/,
    ],
    [
      'a sibling name',
      JSON.stringify({
        format: ATLAS_GROUPS_FORMAT,
        groups: { 'zone-a': ['enemies/drifter@flash'] },
      }),
      /\[0\] "enemies\/drifter@flash" is a sibling sprite/,
    ],
    [
      'a name in two groups',
      JSON.stringify({
        format: ATLAS_GROUPS_FORMAT,
        groups: { 'zone-a': ['x/y'], 'zone-b': ['x/y'] },
      }),
      /:groups\.zone-b\[0\] "x\/y" is already in group "zone-a"$/,
    ],
  ])('reports %s', (_label, text, pattern) => {
    const dir = join(tmp, `bad-${_label.replace(/\W+/g, '-')}`);
    put(join(dir, ATLAS_GROUPS_FILE), text);
    const { issues } = loadAtlasGroups(dir);
    expect(issues.map((i) => `${i.path} ${i.message}`).some((line) => pattern.test(line))).toBe(
      true,
    );
  });
});

describe('scripts/assets/pipeline — a grouped build', () => {
  const { manifest } = grouped;
  const groupOf = (frame: string): string | undefined =>
    manifest.pages[manifest.frames[frame].p].group;

  it('writes manifest format 2: page 0 = main.png = common, then each group by name', () => {
    expect(manifest.formatVersion).toBe(2);
    expect(manifest.pages[0]).toMatchObject({ file: 'main.png', group: 'common' });
    expect(manifest.pages.map((page) => page.group)).toEqual([
      'common',
      'zone-a',
      'zone-b',
      'zone-q',
    ]);
    expect(manifest.pages.map((page) => page.file)).toEqual([
      'main.png',
      'main-1.png',
      'main-2.png',
      'main-3.png',
    ]);
    expect(grouped.pages.map((page) => page.file)).toEqual(manifest.pages.map((p) => p.file));
  });

  it('puts the listed sprites and all their siblings on their group pages, the rest on common', () => {
    const expected: Record<string, string> = {
      'enemies/drifter': 'zone-a',
      'enemies/drifter@flash': 'zone-a',
      'bullets/round-pink': 'zone-a',
      'bullets/round-pink@deuteranopia': 'zone-a',
      'bullets/round-pink@protanopia': 'zone-a',
      'bullets/round-pink@tritanopia': 'zone-a',
      'ships/kestrel': 'zone-b',
      'ships/kestrel@p2': 'zone-b',
      'ships/kestrel-thruster': 'common', // another base name
      'ships/kestrel-thruster@p2': 'common',
      'enemies/zone-q/blob': 'zone-q', // the path rule
      'font/pixel': 'common', // fonts always
      'ui/pixel': 'common',
    };
    for (const [sprite, group] of Object.entries(expected)) {
      for (const frame of manifest.sprites[sprite].frames)
        expect(groupOf(frame), frame).toBe(group);
    }
    const zonePages = new Set(['zone-a', 'zone-b', 'zone-q']);
    for (const [sprite, entry] of Object.entries(manifest.sprites)) {
      if (sprite in expected) continue;
      for (const frame of entry.frames) {
        expect(zonePages.has(groupOf(frame) ?? ''), `${frame} left common`).toBe(false);
      }
    }
  });

  it('records the group on every collected sprite', () => {
    const { sprites, issues } = collectSprites({ sourceDir: groupedDir });
    expect(issues).toEqual([]);
    const byName = new Map(sprites.map((s) => [s.name, s.group]));
    expect(byName.get('enemies/drifter@flash')).toBe('zone-a');
    expect(byName.get('ships/kestrel@p2')).toBe('zone-b');
    expect(byName.get('font/pixel')).toBe('common');
    expect(byName.get('ui/missing')).toBe('common');
  });

  it('keeps sprite names, their order and every frame name (sprite ids never move)', () => {
    expect(plain.manifest.pages.map((page) => page.group)).toEqual(['common', 'zone-q']);
    expect(Object.keys(manifest.sprites)).toEqual(Object.keys(plain.manifest.sprites));
    expect(manifest.sprites).toEqual(plain.manifest.sprites);
    expect(Object.keys(manifest.frames).sort()).toEqual(Object.keys(plain.manifest.frames).sort());
    expect(manifest.animations).toEqual(plain.manifest.animations);
    expect(manifest.fonts).toEqual(plain.manifest.fonts);
  });

  it('places every frame pixel-exactly with its anchor (only p / x / y change)', () => {
    for (const [frame, f] of Object.entries(manifest.frames)) {
      const other = plain.manifest.frames[frame];
      expect({ w: f.w, h: f.h, ax: f.ax, ay: f.ay }, frame).toEqual({
        w: other.w,
        h: other.h,
        ax: other.ax,
        ay: other.ay,
      });
      const a = cut(grouped.pages[f.p].image, f);
      const b = cut(plain.pages[other.p].image, other);
      expect(a.equals(b), frame).toBe(true);
    }
  });

  it('writes a page that fits a palette as PNG-8 and the others as RGBA', () => {
    for (const page of grouped.pages) {
      expect(page.png[25], page.file).toBe(indexedPalette(page.image) === null ? 6 : 3);
    }
    // The three small zone pages hold few colours.
    expect(grouped.pages.slice(1).every((page) => page.png[25] === 3)).toBe(true);
  });
});

describe('scripts/assets/pipeline — without a groups file', () => {
  it('lays the atlas out exactly as the ungrouped packer would (one common group)', () => {
    const dir = copySources('ungrouped');
    const { manifest } = buildAtlas({ sourceDir: dir });
    const { sprites } = collectSprites({ sourceDir: dir });
    const items = sprites.flatMap((s) =>
      s.frames.map((frame, i) => ({ name: `${s.name}#${i}`, w: frame.width, h: frame.height })),
    );
    const packing = packRects(items, { padding: ATLAS_PADDING, extrude: ATLAS_EXTRUDE });
    expect(manifest.pages).toEqual(
      packing.pages.map((p, i) => ({
        file: i === 0 ? 'main.png' : `main-${i}.png`,
        w: p.w,
        h: p.h,
        group: 'common',
      })),
    );
    for (const placed of packing.placements) {
      const f = manifest.frames[placed.name];
      expect({ p: f.p, x: f.x, y: f.y }, placed.name).toEqual({
        p: placed.p,
        x: placed.x,
        y: placed.y,
      });
    }
    for (const sprite of sprites) expect(sprite.group, sprite.name).toBe('common');
  });
});

describe('scripts/assets/pipeline — groups file issues', () => {
  it('reports a name the atlas lacks (renamed or removed sprite)', () => {
    const dir = copySources('stale');
    writeGroups(dir, { 'zone-a': ['enemies/drifter', 'enemies/no-such-thing'] });
    expect(issuesOf(() => buildAtlas({ sourceDir: dir }))).toEqual([
      `${join(dir, ATLAS_GROUPS_FILE)}:groups.zone-a "enemies/no-such-thing" is not a sprite of the atlas (renamed or removed?)`,
    ]);
  });

  it('refuses to move a font off the common pages', () => {
    const dir = copySources('font');
    writeGroups(dir, { 'zone-a': ['font/pixel'] });
    const issues = issuesOf(() => buildAtlas({ sourceDir: dir }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(
      /:groups\.zone-a "font\/pixel" is a font sprite — fonts always pack into "common"$/,
    );
  });

  it('refuses a file that leaves common empty (page 0 must be main.png = common)', () => {
    const dir = copySources('no-common');
    rmSync(join(dir, 'fonts'), { recursive: true });
    const names = collectSprites({ sourceDir: dir })
      .sprites.map((s) => s.name)
      .filter((name) => !name.includes('@'));
    writeGroups(dir, { 'zone-a': names });
    const issues = issuesOf(() => buildAtlas({ sourceDir: dir }));
    expect(issues).toEqual([
      `${join(dir, ATLAS_GROUPS_FILE)}:groups leaves the "common" group empty — page 0 (main.png) must hold it`,
    ]);
  });

  it('collects the file issues with the other source issues instead of throwing early', () => {
    const dir = copySources('both');
    writeGroups(dir, { 'zone-a': ['enemies/gone'] });
    put(join(dir, 'sprites', 'bad.sprite.json'), '{}');
    const issues = issuesOf(() => buildAtlas({ sourceDir: dir }));
    expect(issues.some((line) => line.includes('bad.sprite.json:palette'))).toBe(true);
    expect(issues.some((line) => line.includes('"enemies/gone" is not a sprite'))).toBe(true);
  });
});

describe('scripts/assets/pipeline — grouped output on disk', () => {
  it('writes every group page, hashes the groups file, and removes stale pages on ungrouping', () => {
    const dir = copySources('disk');
    const out = join(tmp, 'disk-out');
    const before = computeInputHash(dir);
    writeGroups(dir, FIXTURE_GROUPS);
    const withGroups = computeInputHash(dir);
    expect(withGroups).not.toBe(before);
    writeGroups(dir, { 'zone-a': ['enemies/drifter'] });
    expect(computeInputHash(dir)).not.toBe(withGroups);
    writeGroups(dir, FIXTURE_GROUPS);
    expect(computeInputHash(dir)).toBe(withGroups);

    const logs: string[] = [];
    const first = generateAssets({ sourceDir: dir, outDir: out, log: (m) => logs.push(m) });
    expect(first.files).toEqual([
      'atlas/main.png',
      'atlas/main-1.png',
      'atlas/main-2.png',
      'atlas/main.json',
    ]);
    expect(first.manifest.pages.map((p) => p.group)).toEqual(['common', 'zone-a', 'zone-b']);
    expect(logs[0]).toMatch(
      /main\.png \d+×\d+ common, main-1\.png \d+×\d+ zone-a, main-2\.png \d+×\d+ zone-b;/,
    );
    expect(generateAssets({ sourceDir: dir, outDir: out }).cached).toBe(true);

    // Editing the groups file alone invalidates the cache.
    writeGroups(dir, { 'zone-a': ['enemies/drifter', 'bullets/round-pink'] });
    const second = generateAssets({ sourceDir: dir, outDir: out });
    expect(second.cached).toBe(false);
    expect(second.manifest.pages.map((p) => p.group)).toEqual(['common', 'zone-a']);
    expect(readdirSync(join(out, 'atlas')).sort()).toEqual(['main-1.png', 'main.json', 'main.png']);

    // No groups file: one common page again, the zone pages removed.
    rmSync(join(dir, ATLAS_GROUPS_FILE));
    const third = generateAssets({ sourceDir: dir, outDir: out });
    expect(third.cached).toBe(false);
    expect(third.manifest.pages).toHaveLength(1);
    expect(third.manifest.pages[0].group).toBe('common');
    expect(readdirSync(join(out, 'atlas')).sort()).toEqual(['main.json', 'main.png']);
    expect(existsSync(join(out, 'atlas', 'main-1.png'))).toBe(false);
  }, 60_000);
});
