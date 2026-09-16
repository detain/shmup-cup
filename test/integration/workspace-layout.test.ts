import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Workspace projects: every directory under packages/ and apps/. */
const projects = ['packages', 'apps'].flatMap((group) =>
  readdirSync(join(repo, group))
    .filter((name) => statSync(join(repo, group, name)).isDirectory())
    .map((name) => `${group}/${name}`),
);

/** All files below a directory (skips node_modules / dist). */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === 'dist') return [];
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('integration: repository skeleton', () => {
  it('has all planned workspace projects', () => {
    expect(projects.sort()).toEqual(
      [
        'apps/electron',
        'apps/tizen',
        'apps/web',
        'apps/webos',
        'packages/audio-web',
        'packages/core',
        'packages/input-web',
        'packages/render-pixi',
        'packages/shell',
      ].sort(),
    );
  });

  it.each(projects)(
    '%s has package.json, tsconfig.json, README.md, src/ and a separate test/',
    (project) => {
      for (const entry of ['package.json', 'tsconfig.json', 'README.md', 'src', 'test']) {
        expect(existsSync(join(repo, project, entry)), `${project}/${entry}`).toBe(true);
      }
      const sources = walk(join(repo, project, 'src'));
      expect(
        sources.some((file) => /\.test\.ts$/.test(file)),
        'tests must live in test/, not src/',
      ).toBe(false);
      expect(walk(join(repo, project, 'test')).some((file) => file.endsWith('.test.ts'))).toBe(
        true,
      );
    },
  );

  it('keeps tools/* out of the pnpm workspace', () => {
    const workspace = readFileSync(join(repo, 'pnpm-workspace.yaml'), 'utf8');
    expect(workspace).toMatch(/- packages\/\*/);
    expect(workspace).toMatch(/- apps\/\*/);
    expect(workspace).not.toMatch(/^\s*- ['"]?tools/m);
  });

  it('ships a documented, parseable example for every content format', () => {
    const contentRoot = join(repo, 'content');
    expect(existsSync(join(contentRoot, 'README.md'))).toBe(true);
    const kinds = readdirSync(contentRoot).filter((entry) =>
      statSync(join(contentRoot, entry)).isDirectory(),
    );
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) {
      const dir = join(contentRoot, kind);
      expect(existsSync(join(dir, 'README.md')), `content/${kind}/README.md`).toBe(true);
      const files = readdirSync(dir).filter((file) => file.endsWith('.json'));
      expect(
        files.filter((file) => file.startsWith('example.')).length,
        `content/${kind}/example.*.json`,
      ).toBeGreaterThan(0);
      for (const file of files) {
        const data = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
          formatVersion?: unknown;
          kind?: unknown;
        };
        expect(data.formatVersion, file).toBe(1);
        expect(typeof data.kind, file).toBe('string');
      }
    }
  });
});
