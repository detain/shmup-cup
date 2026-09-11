/**
 * scripts/generate-assets.mjs (`pnpm assets`) is still a placeholder: it must run
 * cross-platform with plain Node, prepare assets/generated/ and report every planned
 * pipeline stage without converting anything.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('scripts/generate-assets.mjs', () => {
  it('reports the four pipeline stages and leaves only the placeholder in assets/generated', () => {
    const before = readdirSync(join(repo, 'assets', 'generated')).sort();
    const result = spawnSync(process.execPath, [join(repo, 'scripts', 'generate-assets.mjs')], {
      cwd: repo,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    for (const stage of ['sprites', 'tilesets', 'fonts', 'audio']) {
      expect(result.stdout).toMatch(new RegExp(`${stage}\\s+→ .*: \\d+ source file\\(s\\)`));
    }
    expect(result.stdout).toContain('nothing is converted yet');
    expect(existsSync(join(repo, 'assets', 'generated'))).toBe(true);
    expect(readdirSync(join(repo, 'assets', 'generated')).sort()).toEqual(before);
  });
});
