/**
 * scripts/clean.mjs — the cross-platform `rm -rf` every package's `clean` script uses.
 * Runs the real script in a throw-away directory and checks it deletes only what it is
 * allowed to.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'clean.mjs');
let sandbox = '';
let cwd = '';

/**
 * Runs clean.mjs in `cwd` with the given arguments.
 *
 * @param args - Paths to delete.
 */
function clean(...args: string[]) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr };
}

/**
 * Creates a file (and its folders) below `cwd`.
 *
 * @param path - Relative path.
 */
function touch(path: string): void {
  const file = join(cwd, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, 'x');
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'shmup-clean-'));
  cwd = join(sandbox, 'pkg');
  mkdirSync(cwd);
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('scripts/clean.mjs', () => {
  it('deletes the given folders and files recursively', () => {
    touch('dist/index.js');
    touch('dist/nested/deep.js');
    touch('coverage/lcov.info');
    touch('.turbo/turbo-build.log');
    touch('src/index.ts');
    expect(clean('dist', 'coverage', '.turbo').status).toBe(0);
    expect(existsSync(join(cwd, 'dist'))).toBe(false);
    expect(existsSync(join(cwd, 'coverage'))).toBe(false);
    expect(existsSync(join(cwd, '.turbo'))).toBe(false);
    expect(existsSync(join(cwd, 'src', 'index.ts'))).toBe(true);
  });

  it('succeeds when the targets do not exist', () => {
    expect(clean('dist', 'nothing/here').status).toBe(0);
  });

  it('prints usage and fails without arguments', () => {
    const result = clean();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('usage:');
  });

  it.each([
    ['the working directory itself', '.'],
    ['the parent directory', '..'],
    ['a sibling via ..', '../other'],
    ['an absolute path outside', '/'],
    ['a path that escapes after normalisation', 'dist/../../other'],
  ])('refuses to delete %s', (_label, target) => {
    touch('dist/index.js');
    mkdirSync(join(sandbox, 'other'));
    const result = clean(target);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('refusing to delete');
    expect(existsSync(join(sandbox, 'other'))).toBe(true);
    expect(existsSync(join(cwd, 'dist', 'index.js'))).toBe(true);
  });

  it('refuses to delete node_modules at any depth', () => {
    touch('node_modules/pkg/index.js');
    touch('packages/a/node_modules/x.js');
    for (const target of ['node_modules', 'packages/a/node_modules', 'node_modules/pkg']) {
      const result = clean(target);
      expect(result.status, target).toBe(1);
      expect(result.stderr).toContain('node_modules');
    }
    expect(existsSync(join(cwd, 'node_modules', 'pkg', 'index.js'))).toBe(true);
  });

  it('stops at the first refused target (earlier targets are already gone, later ones kept)', () => {
    touch('dist/a.js');
    touch('coverage/b.info');
    expect(clean('dist', '..', 'coverage').status).toBe(1);
    expect(existsSync(join(cwd, 'dist'))).toBe(false);
    expect(existsSync(join(cwd, 'coverage'))).toBe(true);
  });

  it('accepts an absolute path inside the working directory', () => {
    touch('dist/a.js');
    expect(clean(join(cwd, 'dist')).status).toBe(0);
    expect(existsSync(join(cwd, 'dist'))).toBe(false);
  });
});
