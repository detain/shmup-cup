/**
 * How `content/` is wired into the repo: both apps build with the `shmupContent()` plugin
 * and type the virtual module, Turborepo hashes `content/` and `types/` (regression: a
 * content-only edit used to replay a cached app build with stale inlined data),
 * `pnpm content:check` runs the content test, and a headless game runs on the real content.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, createHeadlessPlatform, loadContent } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Reads a repo file as text. */
const text = (path: string): string => readFileSync(join(repo, path), 'utf8');

/** Reads a repo JSON file. */
const json = <T>(path: string): T => JSON.parse(text(path)) as T;

describe('integration: content wiring', () => {
  it('hashes content/ and types/ into every Turborepo task (regression)', () => {
    const turbo = json<{ globalDependencies: string[] }>('turbo.json');
    expect(turbo.globalDependencies).toContain('content/**');
    expect(turbo.globalDependencies).toContain('types/**');
    expect(turbo.globalDependencies).toContain('vite.shared.ts');
  });

  it.each([['apps/web'], ['apps/tizen']])(
    '%s builds with shmupContent() and types the virtual module',
    (app) => {
      const config = text(`${app}/vite.config.ts`);
      expect(config).toMatch(
        /import \{[^}]*\bshmupContent\b[^}]*\} from '\.\.\/\.\.\/vite\.shared\.js'/,
      );
      expect(config).toMatch(/plugins:\s*\[[^\]]*\bshmupContent\(\)/);
      const tsconfig = json<{ include: string[] }>(`${app}/tsconfig.json`);
      expect(tsconfig.include).toContain('../../types/virtual-modules.d.ts');
    },
  );

  it('declares the virtual module where the root tsconfig (and ESLint) can see it', () => {
    expect(existsSync(join(repo, 'types/virtual-modules.d.ts'))).toBe(true);
    expect(text('types/virtual-modules.d.ts')).toContain("declare module 'virtual:shmup-content'");
    expect(json<{ include: string[] }>('tsconfig.json').include).toContain(
      'types/virtual-modules.d.ts',
    );
  });

  it('runs the content test from `pnpm content:check`', () => {
    const scripts = json<{ scripts: Record<string, string> }>('package.json').scripts;
    const check = scripts['content:check'] ?? '';
    expect(check).toContain('--project integration');
    const target = /(\S+\.test\.ts)/.exec(check)?.[1] ?? '';
    expect(target).toBe('test/integration/content.test.ts');
    expect(existsSync(join(repo, target))).toBe(true);
  });

  it('hands the shipped content to a headless game session', () => {
    const { db, issues } = loadContent(readContentFiles());
    expect(issues).toEqual([]);
    const game = createGame(createHeadlessPlatform(), { seed: 7 }, db);
    for (let i = 0; i < 120; i++) game.step();
    expect(game.state.tick).toBe(120);
    expect(game.content).toBe(db);
    expect(game.content.ships[game.content.shipIndex.get('kestrel') ?? -1]?.name).toBe('KESTREL');
  });
});
