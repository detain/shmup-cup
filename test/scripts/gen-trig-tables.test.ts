/**
 * `scripts/gen-trig-tables.mjs` (`pnpm trig:tables`) — the generator behind the
 * committed `packages/core/src/math/trig-table.ts`.
 *
 * The core may only read numbers that are in the source tree (shmup_feat.md §22), so
 * this script has to be reproducible: it computes both tables with BigInt fixed-point
 * arithmetic instead of `Math.*`, which is what makes "re-running it reproduces the
 * file byte-for-byte" true on any engine. These tests cover the CLI contract
 * (`--check`, `--out`, exit codes) and that the mathematics really is engine
 * independent.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = join(repo, 'scripts', 'gen-trig-tables.mjs');
const committed = join(repo, 'packages', 'core', 'src', 'math', 'trig-table.ts');
const scratch = mkdtempSync(join(tmpdir(), 'shmup-trig-cli-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/**
 * Runs the generator as a child process.
 *
 * @param args - Arguments after the script path.
 * @returns The finished process result.
 */
function runScript(...args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8' });
}

describe('scripts/gen-trig-tables.mjs — CLI', () => {
  it('reports the committed table as up to date and exits 0', () => {
    const result = runScript('--check');
    expect(result.status).toBe(0);
    expect(String(result.stdout)).toContain('up to date');
    expect(String(result.stderr)).toBe('');
  });

  it('writes to --out without touching the committed file', () => {
    const before = readFileSync(committed, 'utf8');
    const out = join(scratch, 'written.ts');
    const result = runScript('--out', out);
    expect(result.status).toBe(0);
    expect(String(result.stdout)).toContain(out);
    expect(readFileSync(out, 'utf8')).toBe(before);
    expect(readFileSync(committed, 'utf8')).toBe(before);
  });

  it('produces identical bytes on every run (no Math.*, no ordering nondeterminism)', () => {
    const first = join(scratch, 'run-1.ts');
    const second = join(scratch, 'run-2.ts');
    execFileSync(process.execPath, [script, '--out', first], { cwd: repo });
    execFileSync(process.execPath, [script, '--out', second], { cwd: repo });
    expect(readFileSync(second, 'utf8')).toBe(readFileSync(first, 'utf8'));
    // Two child processes: the full parallel `pnpm test` load pushed it past the default 5 s once.
  }, 30_000);

  it('fails with a usable message when --out has no path', () => {
    const result = runScript('--out');
    expect(result.status).toBe(1);
    expect(String(result.stderr)).toContain('--out needs a file path');
  });

  it('lets --check win over --out (it never writes)', () => {
    const out = join(scratch, 'never-written.ts');
    const result = runScript('--check', '--out', out);
    expect(result.status).toBe(0);
    expect(String(result.stdout)).toContain('up to date');
    expect(() => readFileSync(out, 'utf8')).toThrow();
  });

  it('exits 1 and names the fix when the committed file is stale', () => {
    // The script derives the table path from its own location, so the stale case is
    // staged in a throw-away copy of the tree rather than by touching the real file
    // (which other suites read concurrently).
    const fake = join(scratch, 'stale-tree');
    mkdirSync(join(fake, 'scripts'), { recursive: true });
    mkdirSync(join(fake, 'packages', 'core', 'src', 'math'), { recursive: true });
    copyFileSync(script, join(fake, 'scripts', 'gen-trig-tables.mjs'));
    copyFileSync(join(repo, '.prettierrc.json'), join(fake, '.prettierrc.json'));
    symlinkSync(join(repo, 'node_modules'), join(fake, 'node_modules'), 'dir');
    writeFileSync(
      join(fake, 'packages', 'core', 'src', 'math', 'trig-table.ts'),
      'export const SIN_TABLE_Q16: readonly number[] = [0];\n',
    );

    const result = spawnSync(
      process.execPath,
      [join(fake, 'scripts', 'gen-trig-tables.mjs'), '--check'],
      { cwd: fake, encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(String(result.stderr)).toContain('stale');
    expect(String(result.stderr)).toContain('gen-trig-tables.mjs');
    expect(String(result.stdout)).toBe('');

    // Writing in that tree makes the check pass again, which proves --check compares
    // against the file the script would write.
    expect(
      spawnSync(process.execPath, [join(fake, 'scripts', 'gen-trig-tables.mjs')], {
        cwd: fake,
        encoding: 'utf8',
      }).status,
    ).toBe(0);
    expect(
      spawnSync(process.execPath, [join(fake, 'scripts', 'gen-trig-tables.mjs'), '--check'], {
        cwd: fake,
        encoding: 'utf8',
      }).status,
    ).toBe(0);
    expect(
      readFileSync(join(fake, 'packages', 'core', 'src', 'math', 'trig-table.ts'), 'utf8'),
    ).toBe(readFileSync(committed, 'utf8'));
  });
});

describe('scripts/gen-trig-tables.mjs — generated module', () => {
  it('contains no Math call and no ** operator in its own source', () => {
    const source = readFileSync(script, 'utf8');
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join('\n');
    // `selfCheck` deliberately cross-checks against the host Math before writing; every
    // other use would make the output engine dependent.
    const allowed = ['Math.sin', 'Math.atan', 'Math.abs', 'Math.PI'];
    const unexpected = (code.match(/Math\.[A-Za-z]+/g) ?? []).filter(
      (call) => !allowed.includes(call),
    );
    expect(unexpected).toEqual([]);
    expect(code).not.toMatch(/[^*]\*\*[^*]/);
  });

  it('emits the constants and both tables the core imports', () => {
    const source = readFileSync(committed, 'utf8');
    for (const name of [
      'ANGLE_UNITS',
      'ANGLE_MASK',
      'ANGLE_QUARTER',
      'TRIG_SCALE',
      'ATAN_TABLE_STEPS',
      'SIN_TABLE_Q16',
      'ATAN_TABLE',
    ]) {
      expect(source, name).toContain(`export const ${name}`);
    }
    expect(source).toContain('GENERATED FILE — do not edit');
    expect(source).toContain('@module');
  });
});
