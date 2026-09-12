/**
 * `scripts/assets/pipeline.mjs` + `manifest.mjs` + the procedural generators: the whole
 * placeholder asset pipeline (decision D24).
 *
 * Acceptance (M1-03): `generateAssets()` produces the atlas pages and manifest; two runs
 * are byte-identical; the input-hash cache skips unchanged runs; every frame on a page
 * equals its source pixels (with edge extrusion); hit-flash sprites get `@flash`
 * silhouettes; the initial original sprite set is present; missing sprite names are
 * reported as issues.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { getPixel } from '../../../scripts/assets/image.mjs';
import {
  MANIFEST_FORMAT_VERSION,
  findMissingSprites,
  formatManifest,
  frameName,
} from '../../../scripts/assets/manifest.mjs';
import {
  AssetSourceError,
  CACHE_FILE,
  DEFAULT_SOURCE_DIR,
  buildAtlas,
  computeInputHash,
  generateAssets,
} from '../../../scripts/assets/pipeline.mjs';
import { decodePng, encodePng } from '../../../scripts/assets/png.mjs';
import { PROCEDURAL_GENERATORS } from '../../../scripts/assets/procedural/index.mjs';
import { TERRAIN_TILES } from '../../../scripts/assets/procedural/terrain.mjs';
import { comparableSprites } from './sprite-compare.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'shmup-asset-pipeline-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const atlas = buildAtlas();
const { manifest } = atlas;

/**
 * Copies the real asset sources into a scratch folder (for tests that edit them).
 *
 * @param name - Folder name.
 * @returns The copied source root.
 */
function copySources(name: string): string {
  const dir = join(tmp, name);
  cpSync(DEFAULT_SOURCE_DIR, dir, { recursive: true });
  return dir;
}

/**
 * Reads every file below a directory into a map (relative path → bytes).
 *
 * @param dir - Directory.
 * @returns The files.
 */
function snapshot(dir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const walk = (sub: string): void => {
    for (const entry of readdirSync(join(dir, sub), { withFileTypes: true })) {
      const rel = sub === '' ? entry.name : `${sub}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else out.set(rel, readFileSync(join(dir, rel)));
    }
  };
  walk('');
  return out;
}

describe('scripts/assets/pipeline — buildAtlas', () => {
  it('describes one page within 2048² and every sprite/frame consistently', () => {
    expect(manifest.formatVersion).toBe(MANIFEST_FORMAT_VERSION);
    expect(manifest.pages.map((page) => page.file)).toEqual(['main.png']);
    for (const page of manifest.pages) {
      expect(page.w).toBeLessThanOrEqual(2048);
      expect(page.h).toBeLessThanOrEqual(2048);
    }
    const listed = Object.values(manifest.sprites).flatMap((s) => s.frames);
    expect(listed.sort()).toEqual(Object.keys(manifest.frames).sort());
    for (const [name, sprite] of Object.entries(manifest.sprites)) {
      sprite.frames.forEach((frame, i) => expect(frame).toBe(frameName(name, i)));
    }
  });

  it('writes sections with sorted keys (byte-stable manifest)', () => {
    const sprites = Object.keys(manifest.sprites);
    expect(sprites).toEqual(sprites.slice().sort());
    expect(Object.keys(manifest.fonts)).toEqual(['pixel']);
    expect(formatManifest(manifest).endsWith('}\n')).toBe(true);
    expect(JSON.parse(formatManifest(manifest))).toEqual(manifest);
  });

  it('places every frame pixel-exact on its page (also after the PNG round trip)', () => {
    const decoded = atlas.pages.map((page) => decodePng(page.png));
    for (const sprite of atlas.sprites) {
      sprite.frames.forEach((frame, i) => {
        const at = manifest.frames[frameName(sprite.name, i)];
        expect(at.w).toBe(frame.width);
        expect(at.h).toBe(frame.height);
        expect([at.ax, at.ay]).toEqual(sprite.anchor);
        const page = decoded[at.p];
        for (let y = 0; y < frame.height; y++) {
          for (let x = 0; x < frame.width; x++) {
            const expected = getPixel(frame, x, y);
            const actual = getPixel(page, at.x + x, at.y + y);
            if (actual.join() !== expected.join()) {
              throw new Error(`${sprite.name}#${i} differs at ${x},${y}`);
            }
          }
        }
      });
    }
  });

  it('extrudes each frame by one pixel (edges repeated, corners included)', () => {
    const page = atlas.pages[0].image;
    for (const name of ['ui/pixel#0', 'tiles/terrain-a#0', 'bg/stars-far#0']) {
      const f = manifest.frames[name];
      for (let x = -1; x <= f.w; x++) {
        const sx = Math.min(Math.max(x, 0), f.w - 1);
        expect(getPixel(page, f.x + x, f.y - 1)).toEqual(getPixel(page, f.x + sx, f.y));
        expect(getPixel(page, f.x + x, f.y + f.h)).toEqual(getPixel(page, f.x + sx, f.y + f.h - 1));
      }
      for (let y = 0; y < f.h; y++) {
        expect(getPixel(page, f.x - 1, f.y + y)).toEqual(getPixel(page, f.x, f.y + y));
        expect(getPixel(page, f.x + f.w, f.y + y)).toEqual(getPixel(page, f.x + f.w - 1, f.y + y));
      }
    }
  });

  it('adds a white @flash silhouette sibling for every hitFlash sprite (D30)', () => {
    const withFlash = Object.entries(manifest.sprites).filter(([, s]) => s.flash !== null);
    expect(withFlash.length).toBeGreaterThanOrEqual(10);
    const page = atlas.pages[0].image;
    for (const [name, sprite] of withFlash) {
      expect(sprite.flash).toBe(`${name}@flash`);
      const flash = manifest.sprites[`${name}@flash`];
      expect(flash.frames).toHaveLength(sprite.frames.length);
      expect(flash.flash).toBeNull();
      sprite.frames.forEach((frame, i) => {
        const a = manifest.frames[frame];
        const b = manifest.frames[flash.frames[i]];
        expect([b.w, b.h, b.ax, b.ay]).toEqual([a.w, a.h, a.ax, a.ay]);
        for (let y = 0; y < a.h; y++) {
          for (let x = 0; x < a.w; x++) {
            const src = getPixel(page, a.x + x, a.y + y);
            const white = getPixel(page, b.x + x, b.y + y);
            expect(white).toEqual(src[3] === 0 ? [0, 0, 0, 0] : [255, 255, 255, src[3]]);
          }
        }
      });
    }
    expect(manifest.sprites['ships/kestrel'].flash).toBeNull();
  });

  it('contains the initial original sprite set', () => {
    const count = (name: string): number => manifest.sprites[name]?.frames.length ?? 0;
    expect(count('ships/kestrel')).toBe(3);
    expect(count('ships/kestrel-thruster')).toBe(2);
    expect(manifest.animations['ships/kestrel']).toEqual({ down: [2], level: [0], up: [1] });
    expect(count('options/orb')).toBeGreaterThan(0);
    for (const shot of ['basic', 'double', 'laser', 'missile'])
      expect(count(`shots/${shot}`)).toBeGreaterThan(0);
    const enemies = Object.keys(manifest.sprites).filter(
      (n) => n.startsWith('enemies/') && !n.endsWith('@flash'),
    );
    // The six initial enemies plus the ground hatch of M1-08.
    expect(enemies).toHaveLength(7);
    expect(count('enemies/hatch')).toBe(2);
    expect(manifest.sprites['enemies/hatch'].flash).toBe('enemies/hatch@flash');
    for (const part of ['core', 'shield-plate', 'hull-block', 'emitter']) {
      expect(count(`bosses/${part}`)).toBeGreaterThan(0);
      expect(manifest.sprites[`bosses/${part}`].flash).toBe(`bosses/${part}@flash`);
    }
    for (const name of [
      'items/capsule',
      'items/one-up',
      'items/bonus',
      'hud/life',
      'hud/meter-slot',
      'hud/meter-labels',
      'shields/force-field',
      'fx/explosion-small',
      'fx/explosion-medium',
      'fx/explosion-large',
      'fx/spark',
      'fx/debris',
      'fx/sparkle',
      'fx/ring',
      'bg/stars-far',
      'bg/stars-mid',
      'bg/stars-near',
      'ui/pixel',
      'ui/missing',
    ]) {
      expect(count(name), name).toBeGreaterThan(0);
    }
    expect(count('items/capsule')).toBe(2);
    expect(count('shields/force-field')).toBe(4);
    expect(count('hud/meter-labels')).toBe(7);
    for (const shape of ['round', 'oval', 'needle']) {
      for (const colour of ['pink', 'red', 'purple']) {
        expect(count(`bullets/${shape}-${colour}`)).toBe(shape === 'round' ? 1 : 8);
      }
    }
    expect(count('tiles/terrain-a')).toBe(TERRAIN_TILES.length);
    expect(manifest.animations['tiles/terrain-a']?.['slope-up']).toEqual([
      TERRAIN_TILES.indexOf('slope-up'),
    ]);
  });

  it('makes ui/pixel a single opaque white pixel and uses 8×8 tiles', () => {
    const f = manifest.frames['ui/pixel#0'];
    expect([f.w, f.h, f.ax, f.ay]).toEqual([1, 1, 0, 0]);
    expect(getPixel(atlas.pages[0].image, f.x, f.y)).toEqual([255, 255, 255, 255]);
    for (const frame of manifest.sprites['tiles/terrain-a'].frames) {
      expect([manifest.frames[frame].w, manifest.frames[frame].h]).toEqual([8, 8]);
    }
  });

  it('describes the pixel font: glyph frames in the atlas, metrics in the manifest', () => {
    const font = manifest.fonts.pixel;
    expect(font).toMatchObject({
      sprite: 'font/pixel',
      lineHeight: 10,
      cellWidth: 6,
      cellHeight: 8,
    });
    for (let code = 32; code <= 126; code++) {
      const glyph = font.glyphs[String(code)];
      expect(glyph, String.fromCharCode(code)).toBeDefined();
      expect(glyph.advance).toBe(6);
      expect(manifest.frames[glyph.frame]).toMatchObject({ w: 6, h: 8, ax: 0, ay: 0 });
    }
    expect(manifest.sprites['font/pixel'].frames).toHaveLength(Object.keys(font.glyphs).length);
  });

  it('can spill onto several pages when the page limit is small', () => {
    const small = buildAtlas({ maxPageSize: 256 });
    expect(small.manifest.pages.length).toBeGreaterThan(1);
    expect(small.manifest.pages.map((p) => p.file).slice(0, 2)).toEqual(['main.png', 'main-1.png']);
    for (const frame of Object.values(small.manifest.frames)) {
      expect(frame.p).toBeLessThan(small.manifest.pages.length);
    }
  });

  it('reports invalid sources with every issue instead of writing a broken atlas', () => {
    const src = copySources('invalid');
    writeFileSync(join(src, 'sprites', 'ships', 'broken.sprite.json'), '{"name":"ships/broken"}');
    mkdirSync(join(src, 'sprites', 'ui'), { recursive: true });
    writeFileSync(
      join(src, 'sprites', 'ui', 'pixel.sprite.json'),
      JSON.stringify({ name: 'ui/pixel', palette: { x: '#fff' }, frames: [{ rows: ['x'] }] }),
      { flag: 'w' },
    );
    let error: unknown;
    try {
      buildAtlas({ sourceDir: src });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(AssetSourceError);
    const issues = (error as AssetSourceError).issues.map((i) => i.path);
    expect(issues).toContain(
      `${join(src, 'sprites').split('\\').join('/')}/ships/broken.sprite.json:palette`,
    );
    expect(issues.some((p) => p.startsWith('procedural:ui'))).toBe(true); // ui/pixel defined twice
    expect((error as Error).message).toContain('asset sources are invalid');
  });

  it('lets a PNG with a sprite name override the procedural frame', () => {
    const src = copySources('override');
    const red = { width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]) };
    mkdirSync(join(src, 'sprites', 'ui'), { recursive: true });
    writeFileSync(join(src, 'sprites', 'ui', 'pixel.png'), encodePng(red));
    const overridden = buildAtlas({ sourceDir: src });
    const f = overridden.manifest.frames['ui/pixel#0'];
    expect(getPixel(overridden.pages[0].image, f.x, f.y)).toEqual([255, 0, 0, 255]);
  });
});

describe('scripts/assets/procedural — generators', () => {
  it('are deterministic: two runs draw identical pixels', () => {
    for (const generator of PROCEDURAL_GENERATORS) {
      expect(comparableSprites(generator.generate()), generator.id).toEqual(
        comparableSprites(generator.generate()),
      );
    }
  });

  it('only produce valid sprite names, each from one generator', () => {
    const names = PROCEDURAL_GENERATORS.flatMap((g) => g.generate().map((s) => s.name));
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z0-9-]+(\/[a-z0-9-]+)+$/);
  });

  it('never use engine-dependent maths (Math.sin/cos/…, **) — byte-identical on any engine', () => {
    const dir = join(repo, 'scripts', 'assets');
    const files = [
      ...readdirSync(dir)
        .filter((f) => f.endsWith('.mjs'))
        .map((f) => join(dir, f)),
      ...readdirSync(join(dir, 'procedural')).map((f) => join(dir, 'procedural', f)),
    ];
    for (const file of files) {
      // Code only: docblocks may name the functions they avoid.
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(code, file).not.toMatch(
        /Math\.(sin|cos|tan|asin|acos|atan2?|exp|log|pow|hypot|cbrt)\b/,
      );
      expect(code, file).not.toMatch(/Math\.random|\*\*\s*\d/);
    }
  });
});

describe('scripts/assets/manifest — findMissingSprites', () => {
  it('returns no issue when every name exists', () => {
    expect(findMissingSprites(manifest, ['ships/kestrel', 'shots/basic'])).toEqual([]);
  });

  it('returns one issue per missing name with its index', () => {
    const issues = findMissingSprites(
      manifest,
      ['ships/kestrel', 'ships/nope', 'x/y'],
      'db.sprites',
    );
    expect(issues.map((i) => i.path)).toEqual(['db.sprites[1]', 'db.sprites[2]']);
    expect(issues[0].message).toContain('"ships/nope"');
    expect(issues[0].message).toContain('assets/source/sprites/ships/nope.sprite.json');
  });

  it('does not treat inherited object keys as sprites', () => {
    expect(findMissingSprites(manifest, ['toString', 'constructor'])).toHaveLength(2);
  });
});

describe('scripts/assets/pipeline — generateAssets (disk, cache)', () => {
  it('writes pages + manifest, and two forced runs are byte-identical', () => {
    const out1 = join(tmp, 'out1');
    const out2 = join(tmp, 'out2');
    const first = generateAssets({ outDir: out1, force: true });
    generateAssets({ outDir: out2, force: true });
    expect(first.cached).toBe(false);
    expect(first.files).toEqual(['atlas/main.png', 'atlas/main.json']);
    const a = snapshot(out1);
    const b = snapshot(out2);
    expect([...a.keys()].sort()).toEqual([CACHE_FILE, 'atlas/main.json', 'atlas/main.png'].sort());
    for (const [file, bytes] of a)
      expect(Buffer.compare(bytes, b.get(file) ?? Buffer.alloc(0)), file).toBe(0);
    expect(JSON.parse(a.get('atlas/main.json')?.toString() ?? '')).toEqual(manifest);
    expect(Buffer.compare(a.get('atlas/main.png') ?? Buffer.alloc(0), atlas.pages[0].png)).toBe(0);
  });

  it('skips unchanged inputs, and rebuilds when an output is missing or edited', () => {
    const out = join(tmp, 'cache');
    const logs: string[] = [];
    const log = (m: string): void => {
      logs.push(m);
    };
    expect(generateAssets({ outDir: out, log }).cached).toBe(false);
    const second = generateAssets({ outDir: out, log });
    expect(second.cached).toBe(true);
    expect(second.manifest).toEqual(manifest);
    expect(logs[1]).toContain('up to date');
    writeFileSync(join(out, 'atlas', 'main.png'), 'tampered');
    expect(generateAssets({ outDir: out }).cached).toBe(false);
    rmSync(join(out, 'atlas', 'main.json'));
    expect(generateAssets({ outDir: out }).cached).toBe(false);
    expect(existsSync(join(out, 'atlas', 'main.json'))).toBe(true);
    writeFileSync(join(out, CACHE_FILE), '{ corrupt');
    expect(generateAssets({ outDir: out }).cached).toBe(false);
    expect(generateAssets({ outDir: out }).cached).toBe(true);
  }, 60_000); // four full atlas builds: ~3 s on a busy CI runner

  it('rebuilds when a source changes and removes stale pages', () => {
    const src = copySources('changing');
    const out = join(tmp, 'changing-out');
    const before = generateAssets({ sourceDir: src, outDir: out });
    mkdirSync(join(out, 'atlas'), { recursive: true });
    writeFileSync(join(out, 'atlas', 'main-3.png'), 'stale page');
    writeFileSync(join(out, 'atlas', 'notes.txt'), 'kept');
    const file = join(src, 'sprites', 'items', 'bonus.sprite.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('#f8d030', '#f8d040'));
    const after = generateAssets({ sourceDir: src, outDir: out });
    expect(after.cached).toBe(false);
    expect(after.inputHash).not.toBe(before.inputHash);
    expect(existsSync(join(out, 'atlas', 'main-3.png'))).toBe(false);
    expect(existsSync(join(out, 'atlas', 'notes.txt'))).toBe(true);
  });

  it('hashes sources but ignores READMEs', () => {
    const src = copySources('readme');
    const hash = computeInputHash(src);
    writeFileSync(join(src, 'sprites', 'README.md'), '# docs');
    expect(computeInputHash(src)).toBe(hash);
    writeFileSync(join(src, 'fonts', 'extra.font.json'), '{}');
    expect(computeInputHash(src)).not.toBe(hash);
  });

  it('caches against the pipeline code that ran, not the code on disk now', () => {
    // A long-lived process (the `pnpm dev` server) loads the pipeline once. If a pipeline
    // script is edited afterwards and that process regenerates, it runs the OLD code; the
    // cache must record the old code's hash, so the next fresh process rebuilds instead of
    // treating the stale atlas as current. Both processes run the pipeline from a scratch
    // copy (with the repo's node_modules linked in for pngjs), so the edit touches no repo file.
    const root = join(tmp, 'stale-code');
    const pipelineDir = join(root, 'scripts', 'assets');
    cpSync(join(repo, 'scripts', 'assets'), pipelineDir, { recursive: true });
    symlinkSync(join(repo, 'node_modules'), join(root, 'node_modules'), 'junction');
    const ui = join(pipelineDir, 'procedural', 'ui.mjs');
    const options = { sourceDir: DEFAULT_SOURCE_DIR, outDir: join(root, 'generated') };
    const prelude =
      "import { readFileSync, writeFileSync } from 'node:fs';\n" +
      `const pipeline = await import(${JSON.stringify(pathToFileURL(join(pipelineDir, 'pipeline.mjs')).href)});\n` +
      `const options = ${JSON.stringify(options)};\n` +
      `const ui = ${JSON.stringify(ui)};\n` +
      `const png = ${JSON.stringify(join(options.outDir, 'atlas', 'main.png'))};\n`;
    /**
     * Runs an ES-module snippet (after the prelude) in a fresh Node process.
     *
     * @param code - Snippet that prints one JSON line.
     * @returns The parsed JSON.
     */
    const node = (code: string): Record<string, unknown> =>
      JSON.parse(
        execFileSync(process.execPath, ['--input-type=module', '-e', prelude + code], {
          cwd: root,
          encoding: 'utf8',
        }),
      ) as Record<string, unknown>;

    const longLived = node(
      'const first = pipeline.generateAssets(options).cached;\n' +
        "writeFileSync(ui, readFileSync(ui, 'utf8').replace(\"'#ff00ff'\", \"'#00ff00'\"));\n" +
        'const second = pipeline.generateAssets(options).cached;\n' +
        'console.log(JSON.stringify({ first, second }));\n',
    );
    expect(readFileSync(ui, 'utf8')).toContain("'#00ff00'");
    // Same code ran, same sources: nothing to do (the old code cannot draw the new colour).
    expect(longLived).toEqual({ first: false, second: true });

    const fresh = node(
      'const { cached } = pipeline.generateAssets(options);\n' +
        'const expected = pipeline.buildAtlas({ sourceDir: options.sourceDir }).pages[0].png;\n' +
        'const current = Buffer.compare(readFileSync(png), expected) === 0;\n' +
        'console.log(JSON.stringify({ cached, current }));\n',
    );
    expect(fresh).toEqual({ cached: false, current: true });
    const written = readFileSync(join(options.outDir, 'atlas', 'main.png'));
    expect(Buffer.compare(written, atlas.pages[0].png)).not.toBe(0); // the edit shows
    expect(
      node('console.log(JSON.stringify({ cached: pipeline.generateAssets(options).cached }));\n'),
    ).toEqual({ cached: true });
  }, 60_000);

  it('writes nothing when the sources are invalid', () => {
    const src = copySources('bad-out');
    writeFileSync(join(src, 'sprites', 'bad.sprite.json'), '[]');
    const out = join(tmp, 'bad-out-dir');
    expect(() => generateAssets({ sourceDir: src, outDir: out })).toThrow(AssetSourceError);
    expect(existsSync(out)).toBe(false);
  });
});
