/**
 * Invariants of the repo-root tooling: pnpm / Node pins, workspace membership, Turborepo
 * tasks, TypeScript and browser targets, CI steps and ignore rules.
 *
 * Includes the regression test for review round 1 ("declared minimum Node version is
 * lower than the pinned toolchain supports"): the root `engines.node` range must be
 * supported by every installed package that declares `engines.node`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import { describe, expect, it } from 'vitest';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string): string => readFileSync(join(repo, file), 'utf8');
const readJson = <T>(file: string): T => JSON.parse(read(file)) as T;

interface PackageJson {
  name?: string;
  version?: string;
  private?: boolean;
  type?: string;
  packageManager?: string;
  engines?: { node?: string };
  devEngines?: { runtime?: { name?: string; version?: string; onFail?: string } };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const root = readJson<PackageJson>('package.json');
const nodeRange = root.engines?.node ?? '';

/** Workspace projects: every directory under packages/ and apps/. */
const projects = ['packages', 'apps'].flatMap((group) =>
  readdirSync(join(repo, group))
    .filter((name) => statSync(join(repo, group, name)).isDirectory())
    .map((name) => `${group}/${name}`),
);

/**
 * Every installed package (name, version, engines.node) in pnpm's virtual store.
 *
 * @returns Installed packages that declare `engines.node`.
 */
function installedEngines(): Array<{ id: string; node: string }> {
  const store = join(repo, 'node_modules', '.pnpm');
  const found: Array<{ id: string; node: string }> = [];
  for (const entry of readdirSync(store)) {
    const modules = join(store, entry, 'node_modules');
    if (!existsSync(modules)) continue;
    for (const scopeOrName of readdirSync(modules)) {
      const names = scopeOrName.startsWith('@')
        ? readdirSync(join(modules, scopeOrName)).map((name) => `${scopeOrName}/${name}`)
        : [scopeOrName];
      for (const name of names) {
        // Only the package this store entry is for (the rest are symlinked dependencies).
        if (!entry.startsWith(`${name.replace('/', '+')}@`)) continue;
        const manifest = join(modules, name, 'package.json');
        if (!existsSync(manifest)) continue;
        const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as PackageJson;
        const node = pkg.engines?.node;
        if (typeof node === 'string' && node.trim() !== '') {
          found.push({ id: `${pkg.name ?? name}@${pkg.version ?? '?'}`, node });
        }
      }
    }
  }
  return found;
}

describe('tooling: Node.js version (regression: review round 1)', () => {
  it('declares a valid engines.node range and enforces the same range through devEngines', () => {
    expect(semver.validRange(nodeRange)).not.toBeNull();
    expect(root.devEngines?.runtime).toEqual({ name: 'node', version: nodeRange, onFail: 'error' });
  });

  it('is supported by every installed package that declares engines.node', () => {
    const packages = installedEngines();
    // The toolchain packages whose floors defined the range must be among them.
    const ids = packages.map((pkg) => pkg.id.replace(/@[^@]+$/, ''));
    for (const name of ['vitest', 'eslint', 'electron', 'eslint-plugin-jsdoc', 'vite']) {
      expect(ids, name).toContain(name);
    }
    const unsupported = packages.filter((pkg) => !semver.subset(nodeRange, pkg.node));
    expect(unsupported, 'packages that do not support every Node version we declare').toEqual([]);
  });

  it('no longer claims Node 20 (or the old 20.19.0 floor) and skips odd, non-LTS majors', () => {
    for (const version of [
      '20.19.0',
      '20.99.0',
      '22.12.0',
      '22.22.1',
      '23.11.0',
      '24.14.0',
      '25.0.0',
    ]) {
      expect(semver.satisfies(version, nodeRange), version).toBe(false);
    }
    for (const version of ['22.22.2', '22.99.0', '24.15.0', '24.99.0', '26.0.0']) {
      expect(semver.satisfies(version, nodeRange), version).toBe(true);
    }
  });

  it('pins .nvmrc (used by CI) to a major the range supports, and the running Node satisfies it', () => {
    const nvmrc = read('.nvmrc').trim();
    expect(nvmrc).toMatch(/^\d+$/);
    expect(semver.intersects(`${nvmrc}.x`, nodeRange)).toBe(true);
    expect(semver.satisfies(process.versions.node, nodeRange)).toBe(true);
  });

  it('documents the same floor in the README', () => {
    expect(read('README.md')).toMatch(/22\.22\.2/);
    expect(read('README.md')).toMatch(/24\.15/);
  });
});

describe('tooling: package manager and workspace', () => {
  it('pins an exact pnpm version via packageManager', () => {
    expect(root.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    expect(root.private).toBe(true);
    expect(root.type).toBe('module');
  });

  it('lists only packages/* and apps/* as workspace members', () => {
    const packagesBlock = /^packages:\n((?:\s+-.*\n)+)/m.exec(read('pnpm-workspace.yaml'))?.[1];
    const members = (packagesBlock ?? '')
      .split('\n')
      .map((line) => line.replace(/^\s*-\s*/, '').trim())
      .filter((line) => line !== '');
    expect(members).toEqual(['packages/*', 'apps/*']);
  });

  it('has the root scripts dev, build, typecheck, lint, test, format and clean', () => {
    for (const script of ['dev', 'build', 'typecheck', 'lint', 'test', 'format', 'clean']) {
      expect(root.scripts?.[script], script).toBeTruthy();
    }
    expect(root.scripts?.test).toContain('test:integration');
  });

  it('orchestrates every root task with Turborepo, including the root-only tasks', () => {
    const turbo = readJson<{ tasks: Record<string, unknown> }>('turbo.json');
    for (const task of ['build', 'typecheck', 'lint', 'test', 'dev', 'clean']) {
      expect(turbo.tasks, task).toHaveProperty(task);
    }
    for (const rootTask of ['typecheck:root', 'lint:root', 'test:integration']) {
      expect(turbo.tasks, rootTask).toHaveProperty(`//#${rootTask}`);
      expect(root.scripts?.[rootTask], rootTask).toBeTruthy();
    }
  });

  it.each(projects)(
    '%s has the standard scripts, is private and uses workspace deps',
    (project) => {
      const pkg = readJson<PackageJson>(`${project}/package.json`);
      expect(pkg.name).toMatch(/^@shmup\//);
      expect(pkg.private).toBe(true);
      for (const script of ['build', 'typecheck', 'lint', 'test', 'clean']) {
        expect(pkg.scripts?.[script], `${project} ${script}`).toBeTruthy();
      }
      expect(pkg.scripts?.test).toBe('vitest run');
      for (const [name, spec] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
        if (name.startsWith('@shmup/')) expect(spec, name).toBe('workspace:*');
      }
      expect(existsSync(join(repo, project, 'vitest.config.ts'))).toBe(true);
    },
  );

  it('keeps @shmup/core free of runtime dependencies (the bottom of the graph)', () => {
    const core = readJson<PackageJson>('packages/core/package.json');
    expect(Object.keys(core.dependencies ?? {})).toEqual([]);
  });

  it('never lets a UI framework into shipped code', () => {
    for (const project of projects) {
      const pkg = readJson<PackageJson>(`${project}/package.json`);
      for (const name of Object.keys(pkg.dependencies ?? {})) {
        expect(name, project).not.toMatch(/^(react|react-dom|vue|svelte|solid-js|preact)$/);
      }
    }
  });
});

describe('tooling: TypeScript and browser targets', () => {
  it('compiles runtime code strictly for ES2018', () => {
    const base = readJson<{ compilerOptions: Record<string, unknown> }>('tsconfig.base.json');
    expect(base.compilerOptions).toMatchObject({ strict: true, target: 'ES2018', lib: ['ES2018'] });
  });

  it.each(projects)('%s extends the shared base config', (project) => {
    const tsconfig = read(`${project}/tsconfig.json`);
    expect(tsconfig).toMatch(/"extends": "\.\.\/\.\.\/tsconfig\.base\.json"/);
  });

  it('keeps the runtime packages on the ES2018 library (core without DOM)', () => {
    for (const project of [
      'packages/core',
      'packages/input-web',
      'packages/audio-web',
      'packages/render-pixi',
      'packages/shell',
      'apps/web',
      'apps/tizen',
    ]) {
      const options = readJson<{ compilerOptions?: { lib?: string[]; target?: string } }>(
        `${project}/tsconfig.json`,
      ).compilerOptions;
      const lib = options?.lib ?? ['ES2018'];
      expect(
        lib.filter((entry) => /^ES\d/i.test(entry)),
        project,
      ).toEqual(['ES2018']);
      expect(options?.target ?? 'ES2018', project).toBe('ES2018');
      if (project === 'packages/core') expect(lib, project).not.toContain('DOM');
    }
  });

  it('pins TypeScript to 6.0.x (typescript-eslint does not support TS 7 yet) and uses it everywhere', () => {
    const catalog = /^\s*typescript:\s*(\S+)/m.exec(read('pnpm-workspace.yaml'))?.[1];
    expect(catalog).toBe('~6.0.3');
    expect(root.devDependencies?.typescript).toBe('catalog:');
    for (const project of projects) {
      const pkg = readJson<PackageJson>(`${project}/package.json`);
      expect(pkg.devDependencies?.typescript, project).toBe('catalog:');
    }
  });

  it('targets Chrome 69 in browserslist (read by eslint-plugin-compat)', () => {
    const queries = read('.browserslistrc')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));
    expect(queries).toEqual(['chrome >= 69']);
  });
});

describe('tooling: CI and repository hygiene', () => {
  const ci = read('.github/workflows/ci.yml');

  it('runs install (frozen lockfile), lint, typecheck, test and build in that order', () => {
    const steps = [
      'pnpm install --frozen-lockfile',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm test',
      'pnpm build',
    ];
    const positions = steps.map((step) => ci.indexOf(`run: ${step}`));
    for (const [index, position] of positions.entries()) {
      expect(position, steps[index]).toBeGreaterThan(-1);
    }
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('never downloads the Electron binary and uses the pinned Node and pnpm', () => {
    expect(ci).toMatch(/ELECTRON_SKIP_BINARY_DOWNLOAD:\s*'1'/);
    expect(ci).toContain('node-version-file: .nvmrc');
    expect(ci).toContain('pnpm/action-setup');
  });

  it('ignores build output, packages, logs, caches and secrets', () => {
    const ignored = read('.gitignore')
      .split('\n')
      .map((line) => line.trim());
    for (const entry of [
      'node_modules/',
      'dist/',
      '*.wgt',
      'coverage/',
      'logs/',
      '.turbo/',
      '.caliber/',
      '*.p12',
      '.env',
    ]) {
      expect(ignored, entry).toContain(entry);
    }
  });

  it('has .editorconfig and a Prettier config', () => {
    expect(read('.editorconfig')).toMatch(/root\s*=\s*true/);
    expect(() => readJson<object>('.prettierrc.json')).not.toThrow();
  });
});
