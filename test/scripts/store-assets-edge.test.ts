/**
 * Edge cases of `scripts/store-assets.mjs` (plan M2-18, `pnpm store:assets`), beyond
 * `store-assets.test.ts`:
 *
 * - the command line: `--check` passes on the committed icons, anything but `--check` alone or
 *   `--out DIR` prints the usage and exits 2 (without writing a file);
 * - `staleIcons` compares decoded pixels, not PNG bytes: an icon re-encoded by another encoder is
 *   fresh, one with a single pixel changed or of another size is stale — and only that one;
 * - `renderScreenshot` rejects every index outside the list;
 * - the listing agrees with the rest of the repository: its version is the widget's `config.xml`
 *   version, its app icon has the Tizen icon's size, each placeholder screenshot is captioned with a
 *   shipped zone's name; the store folder is ignored by git (generated, never committed).
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { decodePng, encodePng } from '../../scripts/assets/png.mjs';
import {
  ICON_TARGETS,
  SCREENSHOTS,
  STORE_DIR,
  STORE_LISTING,
  renderIcon,
  renderIcons,
  renderScreenshot,
  staleIcons,
} from '../../scripts/store-assets.mjs';

/** The untyped pngjs module (no @types dependency), loaded through `require` — another encoder. */
const PNG = (
  createRequire(import.meta.url)('pngjs') as {
    PNG: {
      new (options: { width: number; height: number }): { data: Buffer };
      sync: {
        write(
          png: { data: Buffer },
          options?: { deflateLevel?: number; filterType?: number },
        ): Buffer;
      };
    };
  }
).PNG;

/** The repository root. */
const repo = fileURLToPath(new URL('../../', import.meta.url));

/** The script. */
const script = join(repo, 'scripts', 'store-assets.mjs');

/** Temporary folders to remove. */
const temps: string[] = [];

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/**
 * A fresh temporary folder, removed after the tests.
 *
 * @param prefix - Name prefix.
 * @returns Its path.
 */
function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

/**
 * Runs the script.
 *
 * @param args - Command-line arguments.
 * @param cwd - Working directory (default a fresh temporary folder).
 * @returns Its exit status and output.
 */
function runScript(
  args: string[],
  cwd = temp('shmup-store-cli-'),
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Writes a PNG at a repository path below a root, creating its folder.
 *
 * @param root - The root.
 * @param path - Repository path.
 * @param bytes - PNG bytes.
 */
function put(root: string, path: string, bytes: Uint8Array): void {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}

describe('scripts/store-assets — command line (M2-18 tests)', () => {
  it('--check passes on the committed icons', () => {
    const result = runScript(['--check']);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('prints the usage and exits 2 for anything else, writing nothing', () => {
    for (const args of [['--bogus'], ['--out'], ['--check', 'extra'], ['--out', 'a', 'b'], ['x']]) {
      const cwd = temp('shmup-store-usage-');
      const result = runScript(args, cwd);
      expect(result.status, args.join(' ')).toBe(2);
      expect(result.stderr, args.join(' ')).toContain(
        'usage: node scripts/store-assets.mjs [--check | --out DIR]',
      );
      expect(result.stdout).toBe('');
      expect(readdirSync(cwd)).toEqual([]);
    }
  });
});

describe('scripts/store-assets — staleIcons compares pixels (M2-18 tests)', () => {
  it('accepts an icon re-encoded by another PNG encoder (other bytes, same pixels)', () => {
    const root = temp('shmup-store-reencoded-');
    for (const { path, image } of renderIcons()) {
      const png = new PNG({ width: image.width, height: image.height });
      png.data = Buffer.from(image.data);
      const bytes = PNG.sync.write(png, { deflateLevel: 1, filterType: 4 });
      expect(Buffer.from(bytes).equals(Buffer.from(encodePng(image)))).toBe(false);
      put(root, path, bytes);
    }
    expect(staleIcons(root)).toEqual([]);
  });

  it('flags exactly the icon with one pixel changed', () => {
    const root = temp('shmup-store-pixel-');
    const icons = renderIcons();
    for (const { path, image } of icons) put(root, path, encodePng(image));
    const [first] = icons;
    const changed = { ...first.image, data: Uint8Array.from(first.image.data) };
    changed.data[4 * 1000] ^= 0x01; // one red channel, one bit
    put(root, first.path, encodePng(changed));
    expect(staleIcons(root)).toEqual([first.path]);
  });

  it('flags an icon of another size', () => {
    const root = temp('shmup-store-size-');
    const icons = renderIcons();
    for (const { path, image } of icons) put(root, path, encodePng(image));
    // Overwrite one target with an icon of a different shape: only that one is stale.
    const last = icons[icons.length - 1];
    const target = ICON_TARGETS[ICON_TARGETS.length - 1];
    expect([target.width, target.height]).not.toEqual([512, 423]);
    put(root, last.path, encodePng(renderIcon(512, 423)));
    expect(staleIcons(root)).toEqual([last.path]);
  });
});

describe('scripts/store-assets — rendering (M2-18 tests)', () => {
  it('rejects every screenshot index outside the list', () => {
    for (const index of [-1, SCREENSHOTS.length, 1.5, Number.NaN]) {
      expect(() => renderScreenshot(index), String(index)).toThrow(RangeError);
    }
  });

  it('renders an icon of any requested size, opaque', () => {
    const image = renderIcon(200, 160);
    expect([image.width, image.height]).toEqual([200, 160]);
    for (let i = 3; i < image.data.length; i += 4) expect(image.data[i]).toBe(255);
    // A PNG round trip keeps every pixel.
    const back = decodePng(encodePng(image));
    expect(Buffer.from(back.data).equals(Buffer.from(image.data))).toBe(true);
  });
});

describe('scripts/store-assets — the listing agrees with the repository (M2-18 tests)', () => {
  it('names the widget’s config.xml version', () => {
    const xml = readFileSync(join(repo, 'apps', 'tizen', 'public', 'config.xml'), 'utf8');
    const version = /<widget\b[^>]*\bversion="([^"]+)"/.exec(xml)?.[1];
    expect(version).toBe('1.0.0');
    expect(STORE_LISTING.version).toBe(version);
    // The numeric core of the release candidate's semver.
    const root = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(root.version.split('-')[0]).toBe(STORE_LISTING.version);
  });

  it('lists the app icon at the Tizen icon’s size and one 1920 × 1080 image per screenshot', () => {
    const tv = ICON_TARGETS.find((t) => t.path.startsWith('apps/tizen/'));
    const icon = STORE_LISTING.images.find((i) => i.use === 'app icon');
    expect([icon?.width, icon?.height]).toEqual([tv?.width, tv?.height]);
    const shots = STORE_LISTING.images.filter((i) => i.use === 'screenshot');
    expect(shots).toHaveLength(SCREENSHOTS.length);
    for (const shot of shots) {
      expect([shot.width, shot.height]).toEqual([1920, 1080]);
      expect(shot.file).toMatch(/^screenshot-\d-1920x1080\.png$/);
    }
    expect(new Set(STORE_LISTING.images.map((i) => i.file)).size).toBe(STORE_LISTING.images.length);
  });

  it('captions each screenshot with a shipped zone’s name', () => {
    const stages = join(repo, 'content', 'stages');
    const names = new Set(
      readdirSync(stages)
        .filter((file) => file.startsWith('zone-') && file.endsWith('.stage.json'))
        .map(
          (file) => (JSON.parse(readFileSync(join(stages, file), 'utf8')) as { name: string }).name,
        ),
    );
    expect(names.size).toBe(9);
    for (const shot of SCREENSHOTS) expect(names, shot.zone).toContain(shot.zone);
  });

  it('writes the store folder where git ignores it', () => {
    expect(STORE_DIR).toBe(join(repo, 'assets', 'generated', 'store'));
    for (const file of ['listing.json', 'icon-512x423.png']) {
      const result = spawnSync('git', ['check-ignore', '-q', join(STORE_DIR, file)], { cwd: repo });
      expect(result.status, file).toBe(0);
    }
    // The committed icons are not ignored.
    for (const target of ICON_TARGETS) {
      const result = spawnSync('git', ['check-ignore', '-q', target.path], { cwd: repo });
      expect(result.status, target.path).toBe(1);
    }
  });
});
