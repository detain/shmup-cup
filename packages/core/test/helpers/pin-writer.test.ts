/**
 * Tests for the pin writer (`helpers/pin-writer.ts`, R5-P.P10): the `PINNED` entry rewrite of
 * the update mode of the fingerprint tests. A temp file with a fake `PINNED` stands in for a
 * fingerprint test; GitHub Actions sets `CI=true` and runs this file in `pnpm test`, so the
 * rewrite cases delete `process.env.CI` first and restore it after, and the guard case sets it
 * and restores it after.
 *
 * @module
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rewritePinned } from './pin-writer.js';

/** A fake fingerprint file: a docblock that mentions `PINNED`, then the constant itself. */
const TABLES = `/**
 * Re-pin by pasting over \`PINNED\` — const PINNED = { not: 'this one' };
 */
const PINNED: Record<string, Record<string, string>> = {
  alpha: {
    one: 'aaa',
    'b.two': 'bbb',
  },
  beta: {
    x: 'xxx',
  },
};
`;

/** A fake shell-style file: one digest string per entry. */
const LINES = `const PINNED: Readonly<Record<string, string>> = {
  'flight.open': 'aaa bbb',
  showcase: 'ccc',
};
`;

/** Where the temp files live for this run. */
let dir = '';

/** The saved CI environment of this process (the rewrite cases run without it). */
let savedCi: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pin-writer-test-'));
  savedCi = process.env.CI;
  delete process.env.CI;
});

afterEach(() => {
  if (savedCi === undefined) delete process.env.CI;
  else process.env.CI = savedCi;
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Writes one fake test file into the temp dir.
 *
 * @param name - The file name.
 * @param text - Its contents.
 * @returns The absolute path.
 */
function seed(name: string, text: string): string {
  const file = join(dir, name);
  writeFileSync(file, text);
  return file;
}

describe('pin writer (R5-P.P10)', () => {
  it('rewrites one entry and leaves the rest of the file alone', () => {
    const file = seed('tables.test.ts', TABLES);
    expect(rewritePinned(file, 'alpha', { one: 'zzz', 'b.two': 'bbb' })).toBe(true);
    const text = readFileSync(file, 'utf8');
    expect(text).toContain("    one: 'zzz',\n    'b.two': 'bbb',\n  },\n  beta: {");
    expect(text).toContain('const PINNED = { not:'); // the comment mentioning PINNED was not touched
  });

  it('is a no-op the second time it writes the same table', () => {
    const file = seed('tables.test.ts', TABLES);
    const table = { one: 'aaa', 'b.two': 'bbb' };
    expect(rewritePinned(file, 'alpha', table)).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe(TABLES);
    expect(rewritePinned(file, 'alpha', { one: 'zzz' })).toBe(true);
    const once = readFileSync(file, 'utf8');
    expect(rewritePinned(file, 'alpha', { one: 'zzz' })).toBe(false);
    expect(readFileSync(file, 'utf8')).toBe(once);
  });

  it('writes Prettier-clean tables: bare keys for identifiers, quotes for the rest', () => {
    const file = seed('tables.test.ts', TABLES);
    expect(rewritePinned(file, 'beta', { plain: 'p', 'a.dot': 'q' })).toBe(true);
    expect(readFileSync(file, 'utf8')).toContain(
      "  beta: {\n    plain: 'p',\n    'a.dot': 'q',\n  },",
    );
  });

  it('rewrites one string entry (the shell form)', () => {
    const file = seed('lines.test.ts', LINES);
    expect(rewritePinned(file, 'flight.open', 'aaa bbb ccc')).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(LINES.replace("'aaa bbb'", "'aaa bbb ccc'"));
    expect(rewritePinned(file, 'flight.open', 'aaa bbb ccc')).toBe(false);
  });

  it('rewrites the whole constant under the name PINNED', () => {
    const file = seed('lines.test.ts', LINES);
    expect(
      rewritePinned(file, 'PINNED', {
        'flight.open': 'one',
        showcase: { nested: 'two' } as unknown as string,
      }),
    ).toBe(true);
    const text = readFileSync(file, 'utf8');
    expect(text).toContain("  'flight.open': 'one',\n  showcase: ");
  });

  it('fails loudly on an unknown entry or a missing PINNED', () => {
    const file = seed('tables.test.ts', TABLES);
    expect(() => rewritePinned(file, 'gamma', { one: 'x' })).toThrow(/no entry 'gamma'/);
    const bare = seed('bare.test.ts', 'const OTHER = { a: 1 };\n');
    expect(() => rewritePinned(bare, 'a', { x: 'y' })).toThrow(/no 'const PINNED'/);
  });

  it('throws while CI is set — a CI run never rewrites pins', () => {
    const file = seed('tables.test.ts', TABLES);
    process.env.CI = 'true';
    expect(() => rewritePinned(file, 'alpha', { one: 'zzz' })).toThrow(/CI is set/);
    expect(readFileSync(file, 'utf8')).toBe(TABLES);
    delete process.env.CI;
    expect(rewritePinned(file, 'alpha', { one: 'zzz' })).toBe(true);
  });

  it('leaves the other entries parseable after a rewrite of one (rewrite, then rewrite again)', () => {
    const file = seed('tables.test.ts', TABLES);
    expect(rewritePinned(file, 'alpha', { n1: 'h1 h2', n2: 'h3' })).toBe(true);
    expect(rewritePinned(file, 'beta', { x: 'yyy' })).toBe(true);
    expect(readFileSync(file, 'utf8')).toContain(
      "  alpha: {\n    n1: 'h1 h2',\n    n2: 'h3',\n  },\n  beta: {\n    x: 'yyy',\n  },\n};",
    );
  });
});
