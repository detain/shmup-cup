/**
 * `scripts/generate-assets.mjs` (`pnpm assets`) edge cases: argument parsing corner cases,
 * paths relative to the caller's working directory, custom source folders, every issue
 * listed on failure (exit 1, no stack trace — including a real-art frame too large for a
 * page), and importing the module without running it. Every run writes into a temporary
 * folder, never into the real `assets/generated/`.
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { createImage } from '../../scripts/assets/image.mjs';
import { encodePng } from '../../scripts/assets/png.mjs';
import { parseArgs } from '../../scripts/generate-assets.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = join(repo, 'scripts', 'generate-assets.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'shmup-generate-assets-edge-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Runs the CLI as a child process.
 *
 * @param cwd - Working directory.
 * @param args - Arguments after the script path.
 * @returns Exit status and output.
 */
function run(cwd: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: String(result.stdout), stderr: String(result.stderr) };
}

/**
 * Copies the real sources into a scratch folder.
 *
 * @param name - Folder name.
 * @returns The copy.
 */
function copySources(name: string): string {
  const dir = join(tmp, name);
  cpSync(join(repo, 'assets', 'source'), dir, { recursive: true });
  return dir;
}

describe('scripts/generate-assets.mjs — parseArgs (edge)', () => {
  it('lets a repeated option win with its last value', () => {
    const options = parseArgs(['--out', 'a', '--out', 'b', '--force', '--force']);
    expect(options.outDir).toBe(resolve('b'));
    expect(options.force).toBe(true);
  });

  it('resolves directories against the working directory (absolute stays absolute)', () => {
    expect(parseArgs(['--source', '/abs/src']).sourceDir).toBe(resolve('/abs/src'));
    expect(parseArgs(['--out', 'rel/out']).outDir).toBe(join(process.cwd(), 'rel', 'out'));
  });

  it.each([
    [['--out=dir'], 'unknown argument "--out=dir"'],
    [['-f'], 'unknown argument "-f"'],
    [['build'], 'unknown argument "build"'],
    [['--source'], '--source needs a directory'],
    [['--out', '--quiet'], '--out needs a directory'],
  ])('rejects %j', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message);
  });

  it('accepts a directory name that merely contains dashes', () => {
    expect(parseArgs(['--out', 'my--dir']).outDir).toBe(resolve('my--dir'));
    expect(parseArgs(['--out', '-dir']).outDir).toBe(resolve('-dir'));
  });
});

describe('scripts/generate-assets.mjs — CLI (edge)', () => {
  it('writes a relative --out below the caller’s working directory', () => {
    const cwd = join(tmp, 'cwd');
    mkdirSync(cwd, { recursive: true });
    const result = run(cwd, '--out', 'gen', '--quiet');
    expect(result).toMatchObject({ status: 0, stdout: '', stderr: '' });
    expect(existsSync(join(cwd, 'gen', 'atlas', 'main.png'))).toBe(true);
    expect(existsSync(join(cwd, 'gen', '.asset-cache.json'))).toBe(true);
  });

  it('reads sprites from --source (a custom sprite reaches the manifest)', () => {
    const source = copySources('custom-source');
    writeFileSync(
      join(source, 'sprites', 'items', 'medal.sprite.json'),
      JSON.stringify({ name: 'items/medal', palette: { x: '#fc0' }, frames: [{ rows: ['xx'] }] }),
    );
    const out = join(tmp, 'custom-out');
    expect(run(repo, '--source', source, '--out', out, '--quiet').status).toBe(0);
    const manifest = JSON.parse(readFileSync(join(out, 'atlas', 'main.json'), 'utf8')) as {
      sprites: Record<string, { frames: string[] }>;
    };
    expect(manifest.sprites['items/medal']).toEqual({ frames: ['items/medal#0'], flash: null });
  });

  it('lists every invalid source (with the count) and prints no stack trace', () => {
    const source = copySources('two-bad');
    writeFileSync(join(source, 'sprites', 'a.sprite.json'), '[]');
    writeFileSync(join(source, 'fonts', 'b.font.json'), '{ nope');
    const result = run(repo, '--source', source, '--out', join(tmp, 'two-bad-out'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('asset sources are invalid (2 issues):');
    expect(result.stderr).toMatch(/ {2}- .*sprites\/a\.sprite\.json: must be a JSON object/);
    expect(result.stderr).toMatch(/ {2}- .*fonts\/b\.font\.json: invalid JSON/);
    expect(result.stderr).not.toMatch(/^\s+at /m);
    expect(result.stdout).toBe('');
  });

  it('reports a real-art frame too large for a page as an issue (exit 1, no stack trace)', () => {
    const source = copySources('too-big');
    mkdirSync(join(source, 'sprites', 'bg'), { recursive: true });
    writeFileSync(join(source, 'sprites', 'bg', 'wide.png'), encodePng(createImage(3000, 2)));
    const out = join(tmp, 'too-big-out');
    const result = run(repo, '--source', source, '--out', out);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('asset sources are invalid (1 issue):');
    expect(result.stderr).toContain('bg/wide.png:frames[0] sprite "bg/wide" frame 0 is 3000×2');
    expect(result.stderr).not.toMatch(/^\s+at /m);
    expect(existsSync(out)).toBe(false);
  });

  it('prints the usage line on stderr only for argument errors', () => {
    const bad = run(repo, '--nope');
    expect(bad.status).toBe(2);
    expect(bad.stderr.split('\n')).toEqual([
      'generate-assets: unknown argument "--nope"',
      'usage: node scripts/generate-assets.mjs [--force] [--quiet] [--out DIR] [--source DIR]',
      '',
    ]);
    expect(bad.stdout).toBe('');
  });

  it('does not run when imported (the test import above wrote nothing)', () => {
    expect(typeof parseArgs).toBe('function');
    expect(existsSync(join(tmp, 'atlas'))).toBe(false);
  });
});
