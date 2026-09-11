/**
 * `scripts/generate-assets.mjs` (`pnpm assets`) — the command-line front end of the asset
 * pipeline: runs with plain Node, writes the atlas into `--out`, skips unchanged inputs,
 * rebuilds with `--force`, reports invalid sources with exit code 1 and bad arguments with 2.
 * Every run here writes into a temporary folder, never into the real `assets/generated/`.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { parseArgs } from '../../scripts/generate-assets.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = join(repo, 'scripts', 'generate-assets.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'shmup-generate-assets-'));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Runs the CLI as a child process.
 *
 * @param args - Arguments after the script path.
 * @returns The finished process (stdout/stderr as strings).
 */
function run(...args: string[]) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8' });
  return { status: result.status, stdout: String(result.stdout), stderr: String(result.stderr) };
}

describe('scripts/generate-assets.mjs — CLI', () => {
  const out = join(tmp, 'out');

  it('generates the atlas pages and manifest into --out', () => {
    const result = run('--out', out);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(
      /assets generated → .*: main\.png \d+×\d+; \d+ sprites, \d+ frames, 1 font/,
    );
    expect(result.stderr).toBe('');
    expect(existsSync(join(out, 'atlas', 'main.png'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(out, 'atlas', 'main.json'), 'utf8')) as {
      sprites: Record<string, unknown>;
    };
    expect(manifest.sprites['ships/kestrel']).toBeDefined();
  });

  it('skips the second run (input-hash cache) and rebuilds identically with --force', () => {
    const before = readFileSync(join(out, 'atlas', 'main.png'));
    const cached = run('--out', out);
    expect(cached.status).toBe(0);
    expect(cached.stdout).toContain('assets up to date');
    const forced = run('--out', out, '--force');
    expect(forced.stdout).toContain('assets generated');
    expect(Buffer.compare(readFileSync(join(out, 'atlas', 'main.png')), before)).toBe(0);
  });

  it('prints nothing with --quiet', () => {
    const result = run('--out', out, '--quiet');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('exits 1 and lists the problems when a source is invalid', () => {
    const source = join(tmp, 'bad-source');
    cpSync(join(repo, 'assets', 'source'), source, { recursive: true });
    writeFileSync(
      join(source, 'sprites', 'ships', 'kestrel.sprite.json'),
      '{ "name": "ships/kestrel" }',
    );
    const result = run('--source', source, '--out', join(tmp, 'bad-out'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('asset sources are invalid');
    expect(result.stderr).toContain('ships/kestrel.sprite.json:palette');
    expect(existsSync(join(tmp, 'bad-out'))).toBe(false);
  });

  it.each([['--bogus'], ['--out'], ['--source', '--force']])(
    'exits 2 on bad arguments (%s)',
    (...args) => {
      const result = run(...args);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('usage:');
    },
  );
});

describe('scripts/generate-assets.mjs — parseArgs', () => {
  it('parses flags and resolves directories', () => {
    expect(parseArgs([])).toEqual({ force: false, quiet: false });
    const options = parseArgs(['--force', '--quiet', '--out', 'x', '--source', 'y']);
    expect(options.force).toBe(true);
    expect(options.quiet).toBe(true);
    expect(options.outDir?.endsWith('x')).toBe(true);
    expect(options.sourceDir?.endsWith('y')).toBe(true);
  });

  it('throws on an unknown flag or a missing value', () => {
    expect(() => parseArgs(['--nope'])).toThrow('unknown argument');
    expect(() => parseArgs(['--out'])).toThrow('needs a directory');
  });
});
