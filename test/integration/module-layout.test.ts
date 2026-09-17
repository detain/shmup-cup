/**
 * Skeleton invariants across every workspace project: each `src/<module>/index.ts` is a
 * documented module (responsibility, implemented spec sections, public API) with a
 * `moduleInfo` descriptor, is mirrored by a `test/<module>/` folder with a test, and its
 * spec references point at sections that exist in shmup_feat.md / shmup_tech.md.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Sub-directories of a directory.
 *
 * @param dir - Absolute directory.
 */
const subdirs = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).filter((entry) => statSync(join(dir, entry)).isDirectory())
    : [];

const projects = ['packages', 'apps'].flatMap((group) =>
  subdirs(join(repo, group)).map((name) => `${group}/${name}`),
);

/** Every `<project>/src/<module>/index.ts` (Electron uses main/preload/shared files instead). */
const modules = projects.flatMap((project) =>
  subdirs(join(repo, project, 'src'))
    .filter((dir) => existsSync(join(repo, project, 'src', dir, 'index.ts')))
    .map((dir) => ({ project, dir, file: join(repo, project, 'src', dir, 'index.ts') })),
);

/**
 * Where each design document a `specRefs` entry may cite lives today.
 *
 * @remarks
 * `moduleInfo.specRefs` cites the documents by their bare names (`'shmup_feat.md §22'`) — a
 * citation vocabulary hundreds of source files share — but the documents themselves have moved
 * out of the repository root (`docs/old/` for the four research documents, `docs/dev/` for the
 * input-probe spec). This map is the one place that has to know, so a later move is one edit.
 */
const SPEC_FILES: Record<string, string> = {
  'shmup_feat.md': 'docs/old/shmup_feat.md',
  'shmup_tech.md': 'docs/old/shmup_tech.md',
  'input_probe_spec.md': 'docs/dev/input_probe_spec.md',
};

/**
 * Numbered section headings (`## 3.`, `### 2.3`) of a design document.
 *
 * @param file - The document's name as `specRefs` cites it (a key of {@link SPEC_FILES}).
 */
function sections(file: string): Set<string> {
  const found = new Set<string>();
  for (const match of readFileSync(join(repo, SPEC_FILES[file] ?? file), 'utf8').matchAll(
    /^#{2,4} (\d+(?:\.\d+)?)[.\s]/gm,
  )) {
    if (match[1] !== undefined) found.add(match[1]);
  }
  return found;
}

const docSections: Record<string, Set<string>> = {
  'shmup_feat.md': sections('shmup_feat.md'),
  'shmup_tech.md': sections('shmup_tech.md'),
};

/**
 * Parses the `moduleInfo` descriptor out of a module's source.
 *
 * @param source - File contents.
 */
function parseModuleInfo(source: string): { name?: string; status?: string; refs: string[] } {
  const block = /export const moduleInfo = defineModule\(\{([\s\S]*?)\}\);/.exec(source)?.[1] ?? '';
  const refsBlock = /specRefs:\s*\[([\s\S]*?)\]/.exec(block)?.[1] ?? '';
  return {
    name: /name:\s*'([^']+)'/.exec(block)?.[1],
    status: /status:\s*'([^']+)'/.exec(block)?.[1],
    refs: [...refsBlock.matchAll(/'([^']+)'/g)].map((match) => match[1] ?? ''),
  };
}

describe('integration: module skeleton across all packages and apps', () => {
  it('finds modules in every package and in the web and Tizen apps', () => {
    const withModules = new Set(modules.map((module) => module.project));
    for (const project of projects.filter((p) => p !== 'apps/electron')) {
      expect(withModules, project).toContain(project);
    }
    expect(modules.length).toBeGreaterThan(50);
  });

  it.each(modules.map((m) => [`${m.project}/src/${m.dir}`, m] as const))(
    '%s is documented, described and mirrored by a test folder',
    (_label, { project, dir, file }) => {
      const source = readFileSync(file, 'utf8');
      expect(source.trimStart().startsWith('/**'), 'module docblock first').toBe(true);
      expect(source).toContain('**Responsibility.**');
      expect(source).toContain('**Implements.**');
      expect(source).toMatch(/Public API/i);

      const info = parseModuleInfo(source);
      expect(info.name).toBe(dir);
      expect(['placeholder', 'partial', 'implemented']).toContain(info.status);
      expect(info.refs.length).toBeGreaterThan(0);
      if (info.status === 'placeholder') expect(source).toContain('**Status: placeholder.**');

      const testDir = join(repo, project, 'test', dir);
      expect(existsSync(testDir), `${project}/test/${dir}/`).toBe(true);
      expect(readdirSync(testDir).some((entry) => entry.endsWith('.test.ts'))).toBe(true);
    },
  );

  it('every spec reference points at an existing numbered section', () => {
    const broken: string[] = [];
    for (const { project, dir, file } of modules) {
      for (const ref of parseModuleInfo(readFileSync(file, 'utf8')).refs) {
        const match = /^(shmup_feat\.md|shmup_tech\.md) §(\d+(?:\.\d+)?)$/.exec(ref);
        if (match === null) {
          if (ref !== 'input_probe_spec.md')
            broken.push(`${project}/${dir}: unrecognised "${ref}"`);
          else if (!existsSync(join(repo, SPEC_FILES[ref] ?? ref)))
            broken.push(`${project}/${dir}: missing ${ref}`);
          continue;
        }
        const [, doc = '', section = ''] = match;
        if (docSections[doc]?.has(section) !== true) broken.push(`${project}/${dir}: ${ref}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('the core covers every engine/game system named in the step plan', () => {
    const coreModules = new Set(
      modules.filter((m) => m.project === 'packages/core').map((m) => m.dir),
    );
    for (const name of [
      'loop',
      'rng',
      'math',
      'events',
      'pools',
      'input',
      'player',
      'weapons',
      'options',
      'shields',
      'powerups',
      'enemies',
      'bullets',
      'patterns',
      'bosses',
      'collision',
      'stage',
      'scoring',
      'rank',
      'scenes',
      'ui',
      'replay',
      'save',
      'config',
      'data',
    ]) {
      expect(coreModules, name).toContain(name);
    }
  });

  it('every Electron source file carries a module docblock', () => {
    const electronSrc = join(repo, 'apps', 'electron', 'src');
    for (const folder of subdirs(electronSrc)) {
      for (const file of readdirSync(join(electronSrc, folder))) {
        const source = readFileSync(join(electronSrc, folder, file), 'utf8');
        expect(source.trimStart().startsWith('/**'), `${folder}/${file}`).toBe(true);
        expect(source, `${folder}/${file}`).toContain('**Responsibility.**');
      }
    }
  });

  it('no test lives next to sources anywhere in the workspace', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });
    for (const project of projects) {
      const offenders = walk(join(repo, project, 'src')).filter((file) =>
        /\.(test|spec)\.[cm]?[jt]sx?$/.test(file),
      );
      expect(offenders, project).toEqual([]);
    }
  });
});
