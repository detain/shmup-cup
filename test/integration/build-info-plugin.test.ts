/**
 * The `shmupBuildInfo()` Vite plugin and its helpers (plan M1-19, `vite.shared.ts`):
 *
 * - `isDevBuild`: the dev server and `--mode development | test` are dev / test builds (debug
 *   tools bundled), `vite build` (mode `production`) and any other mode are release builds;
 * - `buildId`: `SHMUP_BUILD_ID` wins, else the short git SHA of `HEAD` with a `+` for uncommitted
 *   changes to tracked files (untracked files do not count), else `'unknown'` (no git repository);
 * - the plugin defines `__SHMUP_DEV__` / `__SHMUP_BUILD__` as JSON literals;
 * - both apps use the plugin, and their `build` / `build:test` / `build:dev` scripts give a
 *   release, test and dev build respectively.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConfigEnv, UserConfig } from 'vite';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEV_BUILD_MODES, buildId, isDevBuild, shmupBuildInfo } from '../../vite.shared.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'shmup-build-info-'));

/** The environment variable that overrides the build id. */
const ENV = 'SHMUP_BUILD_ID';
/** Git never looks for a repository above the temp folder (it may live inside a checkout). */
const CEILING = 'GIT_CEILING_DIRECTORIES';
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of [ENV, CEILING]) saved[name] = process.env[name];
  delete process.env[ENV];
  process.env[CEILING] = dirname(tmp);
});

afterEach(() => {
  for (const name of [ENV, CEILING]) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Runs git in a folder (with a fixed identity, so commits work on any machine).
 *
 * @param cwd - The folder.
 * @param args - Git arguments.
 * @returns Its trimmed output.
 */
function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
}

/**
 * The plugin's `config` hook result for an environment.
 *
 * @param env - Vite's config environment.
 * @returns The partial config it returns.
 */
function configFor(env: Pick<ConfigEnv, 'command' | 'mode'>): UserConfig {
  const hook = shmupBuildInfo().config as (config: UserConfig, env: ConfigEnv) => UserConfig;
  return hook({}, env);
}

describe('integration: isDevBuild', () => {
  it('knows the dev / test modes', () => {
    expect(DEV_BUILD_MODES).toEqual(['development', 'test']);
    expect(Object.isFrozen(DEV_BUILD_MODES)).toBe(true);
  });

  it.each<[string, string, boolean]>([
    ['serve', 'development', true],
    ['serve', 'production', true],
    ['serve', 'anything', true],
    ['build', 'production', false],
    ['build', 'development', true],
    ['build', 'test', true],
    ['build', 'staging', false],
    ['build', 'TEST', false],
    ['build', '', false],
  ])('%s --mode %j → dev build %s', (command, mode, dev) => {
    expect(isDevBuild({ command, mode })).toBe(dev);
  });
});

describe('integration: buildId', () => {
  it('prefers SHMUP_BUILD_ID, but not an empty one', () => {
    process.env[ENV] = 'ci-42';
    expect(buildId(tmp)).toBe('ci-42');
    process.env[ENV] = '';
    expect(buildId(tmp)).toBe('unknown'); // tmp is no git repository
  });

  it("is 'unknown' outside a git repository", () => {
    expect(buildId(tmp)).toBe('unknown');
  });

  it('is the short SHA of HEAD, with + for uncommitted changes to tracked files only', () => {
    const repoDir = mkdtempSync(join(tmp, 'repo-'));
    git(repoDir, 'init', '-q');
    writeFileSync(join(repoDir, 'a.txt'), 'one\n');
    git(repoDir, 'add', 'a.txt');
    git(repoDir, 'commit', '-q', '-m', 'first');
    const sha = git(repoDir, 'rev-parse', '--short=7', 'HEAD');
    expect(sha).toMatch(/^[0-9a-f]{7}$/);
    expect(buildId(repoDir)).toBe(sha);
    writeFileSync(join(repoDir, 'untracked.txt'), 'new\n');
    expect(buildId(repoDir)).toBe(sha);
    writeFileSync(join(repoDir, 'a.txt'), 'two\n');
    expect(buildId(repoDir)).toBe(`${sha}+`);
  });

  it("is 'unknown' in a repository without a commit", () => {
    const empty = mkdtempSync(join(tmp, 'empty-'));
    git(empty, 'init', '-q');
    expect(buildId(empty)).toBe('unknown');
  });

  it('names this checkout by its SHA by default', () => {
    delete process.env[CEILING];
    expect(buildId()).toMatch(/^([0-9a-f]{7,}\+?|unknown)$/);
  });
});

describe('integration: shmupBuildInfo() Vite plugin', () => {
  it('defines __SHMUP_DEV__ and __SHMUP_BUILD__ as JSON literals', () => {
    process.env[ENV] = 'abc1234';
    expect(shmupBuildInfo().name).toBe('shmup:build-info');
    expect(configFor({ command: 'build', mode: 'production' }).define).toEqual({
      __SHMUP_DEV__: 'false',
      __SHMUP_BUILD__: '"abc1234"',
    });
    expect(configFor({ command: 'build', mode: 'test' }).define?.__SHMUP_DEV__).toBe('true');
    expect(configFor({ command: 'serve', mode: 'development' }).define?.__SHMUP_DEV__).toBe('true');
  });

  it('escapes a build id with quotes into a valid string literal', () => {
    process.env[ENV] = 'weird "id"\\';
    const literal = configFor({ command: 'build', mode: 'production' }).define
      ?.__SHMUP_BUILD__ as string;
    expect(JSON.parse(literal)).toBe('weird "id"\\');
  });

  it.each(['web', 'tizen'])(
    'is used by apps/%s, whose build scripts pick the right mode',
    (app) => {
      const viteConfig = readFileSync(join(repo, 'apps', app, 'vite.config.ts'), 'utf8');
      expect(viteConfig).toMatch(/plugins:\s*\[[^\]]*shmupBuildInfo\(\)/);
      const scripts = (
        JSON.parse(readFileSync(join(repo, 'apps', app, 'package.json'), 'utf8')) as {
          scripts: Record<string, string>;
        }
      ).scripts;
      /**
       * The Vite mode a script builds with.
       *
       * @param script - Script name.
       * @returns The `--mode` value, or `production` without one.
       */
      const mode = (script: string): string =>
        /vite build(?: --mode (\S+))?/.exec(scripts[script])?.[1] ?? 'production';
      expect(scripts.build).toMatch(/vite build/);
      expect(isDevBuild({ command: 'build', mode: mode('build') })).toBe(false);
      expect(isDevBuild({ command: 'build', mode: mode('build:test') })).toBe(true);
      expect(isDevBuild({ command: 'build', mode: mode('build:dev') })).toBe(true);
      expect([mode('build:test'), mode('build:dev')]).toEqual(['test', 'development']);
    },
  );
});
