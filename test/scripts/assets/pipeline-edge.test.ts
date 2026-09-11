/**
 * `scripts/assets/pipeline.mjs` edge cases: sprite collection (sorting, default anchors,
 * font-sprite clashes, overrides feeding the `@flash` silhouettes), `AssetSourceError`,
 * page limits (a real-art frame too large for a 2048² page is a source issue, not a
 * crash), the input hash (what it covers, what it ignores, path/length framing), the
 * disk cache (every way it can be stale or damaged), multi-page output on disk with
 * stale-page removal, a failed run leaving the last good atlas alone, and concurrent
 * runs into one output folder.
 *
 * Regression (M1-03 test pass): a real-art frame wider or taller than an atlas page
 * escaped as a bare `RangeError` from the packer (a stack trace from `pnpm assets`)
 * instead of an `AssetSourceError` naming the source file.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createImage, getPixel, setPixel } from '../../../scripts/assets/image.mjs';
import {
  ATLAS_DIR,
  AssetSourceError,
  CACHE_FILE,
  DEFAULT_OUT_DIR,
  DEFAULT_SOURCE_DIR,
  REPO_ROOT,
  buildAtlas,
  collectSprites,
  computeInputHash,
  generateAssets,
  pageFileName,
} from '../../../scripts/assets/pipeline.mjs';
import { decodePng, encodePng } from '../../../scripts/assets/png.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'shmup-pipeline-edge-'));
const cli = join(repo, 'scripts', 'generate-assets.mjs');

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const reference = buildAtlas();

/**
 * Copies the real asset sources into a scratch folder.
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
 * Runs `buildAtlas` / a callback and returns the error it throws.
 *
 * @param run - Code expected to throw.
 * @returns The error.
 */
function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected an error');
}

/**
 * Lists every file below a folder (relative, `/`-separated).
 *
 * @param dir - Folder.
 * @returns Sorted relative paths.
 */
function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (sub: string): void => {
    for (const entry of readdirSync(join(dir, sub), { withFileTypes: true })) {
      const rel = sub === '' ? entry.name : `${sub}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else out.push(rel);
    }
  };
  walk('');
  return out.sort();
}

/**
 * Reads the cache file of an output folder.
 *
 * @param out - Output folder.
 * @returns The parsed cache.
 */
const readCache = (
  out: string,
): { version: number; inputHash: string; outputs: Record<string, string> } =>
  JSON.parse(readFileSync(join(out, CACHE_FILE), 'utf8')) as {
    version: number;
    inputHash: string;
    outputs: Record<string, string>;
  };

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

describe('scripts/assets/pipeline — collectSprites (edge)', () => {
  const collected = collectSprites();

  it('returns sprites sorted by name with every anchor resolved', () => {
    const names = collected.sprites.map((s) => s.name);
    expect(names).toEqual(names.slice().sort());
    expect(new Set(names).size).toBe(names.length);
    for (const sprite of collected.sprites) expect(sprite.anchor, sprite.name).not.toBeNull();
    expect(collected.issues).toEqual([]);
    expect(Object.keys(collected.fonts)).toEqual(['pixel']);
  });

  it('centres a missing anchor on frame 0 (floor of half the size)', () => {
    const anchor = (name: string) => collected.sprites.find((s) => s.name === name)?.anchor;
    expect(anchor('ui/missing')).toEqual([4, 4]); // 8×8
    expect(anchor('bullets/round-pink')).toEqual([3, 3]); // 7×7
    expect(anchor('fx/explosion-small')).toEqual([8, 8]); // 16×16
    expect(anchor('items/capsule')).toEqual([6, 4]); // 12×8
    expect(anchor('ui/pixel')).toEqual([0, 0]); // explicit
  });

  it('names source files repo-relative for sources inside the repository', () => {
    const kestrel = collected.sprites.find((s) => s.name === 'ships/kestrel');
    expect(kestrel?.origin).toBe('assets/source/sprites/ships/kestrel.sprite.json');
    expect(DEFAULT_SOURCE_DIR).toBe(join(REPO_ROOT, 'assets', 'source'));
    expect(DEFAULT_OUT_DIR).toBe(join(REPO_ROOT, 'assets', 'generated'));
  });

  it('builds a procedural-only atlas from an empty source folder (no fonts)', () => {
    const empty = join(tmp, 'empty-source');
    mkdirSync(empty, { recursive: true });
    const { manifest } = buildAtlas({ sourceDir: empty });
    expect(manifest.fonts).toEqual({});
    expect(manifest.sprites['ui/pixel']).toBeDefined();
    expect(manifest.sprites['ships/kestrel']).toBeUndefined();
  });

  it('reports a sprite source that takes a font sprite name, and drops that font', () => {
    const src = copySources('font-clash');
    put(
      join(src, 'sprites', 'font', 'pixel.sprite.json'),
      JSON.stringify({ name: 'font/pixel', palette: { x: '#fff' }, frames: [{ rows: ['x'] }] }),
    );
    const result = collectSprites({ sourceDir: src });
    expect(result.fonts).toEqual({});
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].path.endsWith('/fonts/pixel6x8.font.json:name')).toBe(true);
    expect(result.issues[0].message).toMatch(
      /^font sprite "font\/pixel" clashes with .*pixel\.sprite\.json$/,
    );
  });

  it('collects sprite and font issues together', () => {
    const src = copySources('both-bad');
    put(join(src, 'sprites', 'bad.sprite.json'), '{}');
    put(join(src, 'fonts', 'bad.font.json'), '[]');
    const error = thrown(() => buildAtlas({ sourceDir: src })) as AssetSourceError;
    expect(error).toBeInstanceOf(AssetSourceError);
    const paths = error.issues.map((i) => i.path.slice(src.length + 1));
    expect(paths).toContain('sprites/bad.sprite.json:palette');
    expect(paths).toContain('fonts/bad.font.json:');
  });

  it('derives the @flash silhouette from real-art override frames', () => {
    const src = copySources('flash-override');
    const drifter = collectSprites().sprites.find((s) => s.name === 'enemies/drifter');
    if (drifter === undefined) throw new Error('drifter missing');
    const { width, height } = drifter.frames[0];
    const art = createImage(width, height);
    setPixel(art, 0, 0, [10, 200, 30, 90]);
    put(join(src, 'sprites', 'enemies', 'drifter.png'), encodePng(art));
    const { manifest, pages } = buildAtlas({ sourceDir: src });
    const frame = manifest.frames['enemies/drifter#0'];
    const flash = manifest.frames['enemies/drifter@flash#0'];
    const page = pages[0].image;
    expect(getPixel(page, frame.x, frame.y)).toEqual([10, 200, 30, 90]);
    expect(getPixel(page, flash.x, flash.y)).toEqual([255, 255, 255, 90]);
    expect(getPixel(page, flash.x + 1, flash.y)).toEqual([0, 0, 0, 0]);
    // Frames the PNG does not provide keep their code-defined pixels in both sprites.
    expect(manifest.sprites['enemies/drifter'].frames).toHaveLength(drifter.frames.length);
  });

  it('gives PNG-only sprites a centred anchor and no flash sibling', () => {
    const src = copySources('png-only');
    put(join(src, 'sprites', 'items', 'medal.png'), encodePng(createImage(5, 3)));
    const { manifest } = buildAtlas({ sourceDir: src });
    expect(manifest.sprites['items/medal']).toEqual({ frames: ['items/medal#0'], flash: null });
    expect(manifest.frames['items/medal#0']).toMatchObject({ w: 5, h: 3, ax: 2, ay: 1 });
    expect(manifest.sprites['items/medal@flash']).toBeUndefined();
  });
});

describe('scripts/assets/pipeline — AssetSourceError', () => {
  it('lists every issue, with a singular / plural count', () => {
    const one = new AssetSourceError([{ path: 'a.json:name', message: 'bad' }]);
    expect(one).toBeInstanceOf(Error);
    expect(one.name).toBe('AssetSourceError');
    expect(one.message).toBe('asset sources are invalid (1 issue):\n  - a.json:name bad');
    const two = new AssetSourceError([
      { path: 'a', message: 'x' },
      { path: 'b', message: 'y' },
    ]);
    expect(two.message).toBe('asset sources are invalid (2 issues):\n  - a x\n  - b y');
    expect(two.issues).toHaveLength(2);
  });
});

describe('scripts/assets/pipeline — page limits', () => {
  it('reports a real-art frame too large for an atlas page as a source issue (regression)', () => {
    const src = copySources('too-big');
    put(join(src, 'sprites', 'bg', 'mural.png'), encodePng(createImage(2047, 4)));
    const error = thrown(() => buildAtlas({ sourceDir: src }));
    expect(error).toBeInstanceOf(AssetSourceError);
    const { issues } = error as AssetSourceError;
    expect(issues).toHaveLength(1);
    expect(issues[0].path.endsWith('/sprites/bg/mural.png:frames[0]'), issues[0].path).toBe(true);
    expect(issues[0].message).toContain('2047×4');
    expect(issues[0].message).toContain('2046×2046');
  });

  it('checks frames against a smaller page limit the same way', () => {
    const error = thrown(() => buildAtlas({ maxPageSize: 32 })) as AssetSourceError;
    expect(error).toBeInstanceOf(AssetSourceError);
    const paths = error.issues.map((i) => i.path);
    expect(paths).toContain('procedural:explosions:frames[0]'); // 32×32 medium + border
    expect(paths).toContain('procedural:starfield:frames[0]');
    expect(paths.every((p) => !p.includes('ui'))).toBe(true); // small frames are fine
  });

  it('rejects a page limit that is not a power of two', () => {
    expect(() => buildAtlas({ maxPageSize: 1000 })).toThrow(RangeError);
  });

  it('names pages main.png, main-1.png, main-2.png, …', () => {
    expect([0, 1, 2, 10].map(pageFileName)).toEqual([
      'main.png',
      'main-1.png',
      'main-2.png',
      'main-10.png',
    ]);
  });
});

describe('scripts/assets/pipeline — computeInputHash (edge)', () => {
  it('is a stable hex SHA-256 that defaults to assets/source/', () => {
    const hash = computeInputHash();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeInputHash(DEFAULT_SOURCE_DIR)).toBe(hash);
    expect(computeInputHash()).toBe(hash);
  });

  it('hashes a missing source folder without failing (and differently)', () => {
    const missing = computeInputHash(join(tmp, 'no-such-folder'));
    expect(missing).toMatch(/^[0-9a-f]{64}$/);
    expect(missing).not.toBe(computeInputHash());
    expect(computeInputHash(join(tmp, 'other-missing-folder'))).toBe(missing);
  });

  it('ignores docs and .gitkeep anywhere in the trees, but not other files', () => {
    const src = copySources('hash-docs');
    const hash = computeInputHash(src);
    put(join(src, 'fonts', 'NOTES.md'), '# notes');
    put(join(src, 'sprites', 'ships', 'README.md'), '# ships');
    put(join(src, 'sprites', 'deep', '.gitkeep'), '');
    expect(computeInputHash(src)).toBe(hash);
    put(join(src, 'sprites', 'ships', 'kestrel.aseprite'), 'x');
    expect(computeInputHash(src)).not.toBe(hash);
  });

  it('frames file contents by path and length (renames and byte shifts change it)', () => {
    const a = join(tmp, 'hash-frame-a');
    const b = join(tmp, 'hash-frame-b');
    const c = join(tmp, 'hash-frame-c');
    const d = join(tmp, 'hash-frame-d');
    put(join(a, 'sprites', 'x.json'), 'ab');
    put(join(a, 'sprites', 'y.json'), 'c');
    put(join(b, 'sprites', 'x.json'), 'a');
    put(join(b, 'sprites', 'y.json'), 'bc');
    put(join(c, 'sprites', 'z.json'), 'ab');
    put(join(c, 'sprites', 'y.json'), 'c');
    put(join(d, 'fonts', 'x.json'), 'ab');
    put(join(d, 'sprites', 'y.json'), 'c');
    const hashes = [a, b, c, d].map((dir) => computeInputHash(dir));
    expect(new Set(hashes).size).toBe(4);
  });

  it('changes when a binary PNG source changes by one byte', () => {
    const src = copySources('hash-png');
    const art = createImage(2, 2);
    put(join(src, 'sprites', 'items', 'gem.png'), encodePng(art));
    const before = computeInputHash(src);
    setPixel(art, 1, 1, [0, 0, 1, 255]);
    put(join(src, 'sprites', 'items', 'gem.png'), encodePng(art));
    expect(computeInputHash(src)).not.toBe(before);
  });
});

describe('scripts/assets/pipeline — generateAssets cache (edge)', () => {
  it('records the input hash and the SHA-256 of every output, and leaves no temp files', () => {
    const out = join(tmp, 'cache-record');
    const result = generateAssets({ outDir: out });
    expect(result.cached).toBe(false);
    expect(result.atlasDir).toBe(join(out, ATLAS_DIR));
    expect(result.manifest).toEqual(reference.manifest);
    const cache = readCache(out);
    expect(cache.version).toBe(1);
    expect(cache.inputHash).toBe(computeInputHash());
    expect(cache.inputHash).toBe(result.inputHash);
    expect(Object.keys(cache.outputs)).toEqual(result.files);
    for (const [file, digest] of Object.entries(cache.outputs)) {
      expect(sha256(readFileSync(join(out, file)))).toBe(digest);
    }
    expect(files(out)).toEqual([CACHE_FILE, 'atlas/main.json', 'atlas/main.png']);
    const hit = generateAssets({ outDir: out });
    expect(hit).toMatchObject({ cached: true, inputHash: result.inputHash, files: result.files });
    expect(hit.manifest).toEqual(result.manifest);
  });

  it.each([
    ['another cache version', (c: Record<string, unknown>) => ({ ...c, version: 0 })],
    ['another input hash', (c: Record<string, unknown>) => ({ ...c, inputHash: 'f'.repeat(64) })],
    ['no outputs', (c: Record<string, unknown>) => ({ ...c, outputs: undefined })],
    [
      'outputs without the manifest',
      (c: Record<string, unknown>) => ({
        ...c,
        outputs: { 'atlas/main.png': (c.outputs as Record<string, string>)['atlas/main.png'] },
      }),
    ],
    [
      'a recorded output that is gone',
      (c: Record<string, unknown>) => ({
        ...c,
        outputs: { ...(c.outputs as Record<string, string>), 'atlas/main-1.png': '0'.repeat(64) },
      }),
    ],
    ['a JSON null', () => null],
    ['an array', () => []],
  ])('rebuilds when the cache has %s', (_label, edit) => {
    const out = join(tmp, `cache-${_label.replace(/\W+/g, '-')}`);
    generateAssets({ outDir: out });
    const cache = readCache(out) as unknown as Record<string, unknown>;
    writeFileSync(join(out, CACHE_FILE), JSON.stringify(edit(cache)));
    const again = generateAssets({ outDir: out });
    expect(again.cached).toBe(false);
    expect(
      Buffer.compare(readFileSync(join(out, 'atlas', 'main.png')), reference.pages[0].png),
    ).toBe(0);
    expect(generateAssets({ outDir: out }).cached).toBe(true); // repaired
  });

  it('rebuilds when the cache file is missing but the outputs exist', () => {
    const out = join(tmp, 'cache-missing');
    generateAssets({ outDir: out });
    rmSync(join(out, CACHE_FILE));
    expect(generateAssets({ outDir: out }).cached).toBe(false);
    expect(existsSync(join(out, CACHE_FILE))).toBe(true);
  });

  it('force rebuilds over a valid cache and writes the same bytes', () => {
    const out = join(tmp, 'cache-force');
    generateAssets({ outDir: out });
    const before = readFileSync(join(out, 'atlas', 'main.json'));
    const forced = generateAssets({ outDir: out, force: true });
    expect(forced.cached).toBe(false);
    expect(Buffer.compare(readFileSync(join(out, 'atlas', 'main.json')), before)).toBe(0);
  });

  it('logs a summary on a build and "up to date" on a hit', () => {
    const out = join(tmp, 'cache-log');
    const logs: string[] = [];
    generateAssets({ outDir: out, log: (m) => logs.push(m) });
    generateAssets({ outDir: out, log: (m) => logs.push(m) });
    const { manifest } = reference;
    const page = manifest.pages[0];
    expect(logs[0]).toContain(`main.png ${page.w}×${page.h}`);
    expect(logs[0]).toContain(`${Object.keys(manifest.sprites).length} sprites`);
    expect(logs[0]).toContain(`${Object.keys(manifest.frames).length} frames, 1 font(s)`);
    expect(logs[1]).toMatch(/^assets up to date \(.*atlas\/, input [0-9a-f]{12}\)$/);
  });

  it('keeps the last good atlas and cache when the sources turn invalid, and hits after a fix', () => {
    const src = copySources('last-good');
    const out = join(tmp, 'last-good-out');
    generateAssets({ sourceDir: src, outDir: out });
    const snapshot = new Map(files(out).map((f) => [f, readFileSync(join(out, f))]));
    const file = join(src, 'sprites', 'items', 'bonus.sprite.json');
    const good = readFileSync(file, 'utf8');
    writeFileSync(file, '{ broken');
    expect(() => generateAssets({ sourceDir: src, outDir: out })).toThrow(AssetSourceError);
    expect(files(out)).toEqual([...snapshot.keys()]);
    for (const [f, bytes] of snapshot)
      expect(Buffer.compare(readFileSync(join(out, f)), bytes), f).toBe(0);
    writeFileSync(file, good);
    expect(generateAssets({ sourceDir: src, outDir: out }).cached).toBe(true);
  });

  it('removes only stale main-<n>.png pages, never other files in the atlas folder', () => {
    const out = join(tmp, 'stale');
    const keep = ['main-x.png', 'other.png', 'main-1.png.bak', 'main.json.old', 'notes.txt'];
    for (const name of [...keep, 'main-1.png', 'main-02.png', 'main-17.png']) {
      put(join(out, 'atlas', name), 'old');
    }
    generateAssets({ outDir: out });
    expect(files(join(out, 'atlas'))).toEqual(['main.json', 'main.png', ...keep].sort());
  });
});

describe('scripts/assets/pipeline — multi-page output on disk', () => {
  it('writes every page, then removes the extra page once the atlas fits one page again', () => {
    const src = copySources('multi-page');
    const out = join(tmp, 'multi-page-out');
    const big = join(src, 'sprites', 'bg', 'backdrop.png');
    const art = createImage(2000, 2000);
    for (let i = 3; i < art.data.length; i += 4) art.data[i] = 255; // opaque black
    put(big, encodePng(art));

    const twoPages = generateAssets({ sourceDir: src, outDir: out });
    expect(twoPages.manifest.pages.map((p) => p.file)).toEqual(['main.png', 'main-1.png']);
    expect(twoPages.manifest.pages[0]).toEqual({ file: 'main.png', w: 2048, h: 2048 });
    expect(twoPages.files).toEqual(['atlas/main.png', 'atlas/main-1.png', 'atlas/main.json']);
    const backdrop = twoPages.manifest.frames['bg/backdrop#0'];
    expect(backdrop).toMatchObject({ p: 0, w: 2000, h: 2000 });
    const page1 = decodePng(readFileSync(join(out, 'atlas', 'main-1.png')));
    expect([page1.width, page1.height]).toEqual([
      twoPages.manifest.pages[1].w,
      twoPages.manifest.pages[1].h,
    ]);
    const onSecond = Object.entries(twoPages.manifest.frames).filter(([, f]) => f.p === 1);
    expect(onSecond.length).toBeGreaterThan(0);
    expect(generateAssets({ sourceDir: src, outDir: out }).cached).toBe(true);

    renameSync(big, join(tmp, 'backdrop-parked.png'));
    const onePage = generateAssets({ sourceDir: src, outDir: out });
    expect(onePage.cached).toBe(false);
    expect(onePage.manifest).toEqual(reference.manifest);
    expect(files(join(out, 'atlas'))).toEqual(['main.json', 'main.png']);
  }, 60_000);
});

describe('scripts/assets/pipeline — concurrent runs', () => {
  it('lets parallel `pnpm assets --force` runs share one output folder safely', async () => {
    const out = join(tmp, 'concurrent');
    const runs = Array.from(
      { length: 3 },
      () =>
        new Promise<number | null>((resolve, reject) => {
          const child = spawn(process.execPath, [cli, '--force', '--quiet', '--out', out], {
            cwd: repo,
            stdio: 'ignore',
          });
          child.on('error', reject);
          child.on('exit', (code) => resolve(code));
        }),
    );
    expect(await Promise.all(runs)).toEqual([0, 0, 0]);
    expect(files(out)).toEqual([CACHE_FILE, 'atlas/main.json', 'atlas/main.png']); // no *.tmp
    expect(
      Buffer.compare(readFileSync(join(out, 'atlas', 'main.png')), reference.pages[0].png),
    ).toBe(0);
    expect(generateAssets({ outDir: out }).cached).toBe(true);
  }, 60_000);
});
