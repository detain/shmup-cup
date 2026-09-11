/**
 * `pnpm content:check` — every JSON file under `content/` validates against the schemas in
 * `@shmup/core`'s `data` module, and every string id it uses resolves.
 *
 * The shipped files (what `virtual:shmup-content` inlines into a build) and the
 * `example.*.json` format samples are loaded as two independent sets: the examples are
 * documentation, so they may reuse the ids of the real content without clashing with it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, type ContentFile } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const contentRoot = join(repo, 'content');

/**
 * Every `*.json` below `content/`, as content-root-relative POSIX paths.
 *
 * @param dir - Absolute directory to scan.
 * @param prefix - Its path relative to `content/`.
 * @returns The paths, sorted.
 */
function listJson(dir: string, prefix = ''): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const relative = prefix === '' ? entry : `${prefix}/${entry}`;
      if (statSync(join(dir, entry)).isDirectory()) return listJson(join(dir, entry), relative);
      return entry.endsWith('.json') ? [relative] : [];
    })
    .sort();
}

/** Reads the given content files (used for the `example.*.json` set). */
const read = (paths: readonly string[]): ContentFile[] =>
  paths.map((path) => ({
    path,
    data: JSON.parse(readFileSync(join(contentRoot, path), 'utf8')) as unknown,
  }));

/**
 * Removes `//` line comments from a JSONC sample, leaving `//` inside strings alone.
 *
 * @param source - The JSONC text.
 * @returns Plain JSON text.
 */
function stripLineComments(source: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      out += ch;
      if (ch === '\\') out += source[++i] ?? '';
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      out += '\n';
    } else {
      out += ch;
    }
  }
  return out;
}

const allPaths = listJson(contentRoot);
const examplePaths = allPaths.filter((path) => path.split('/').pop()?.startsWith('example.'));
const shippedFiles = readContentFiles(contentRoot);

describe('integration: content/ validates', () => {
  it('reads exactly the non-example files into the bundle', () => {
    expect(shippedFiles.map((file) => file.path)).toEqual(
      allPaths.filter((path) => !examplePaths.includes(path)),
    );
    expect(examplePaths.length).toBeGreaterThan(0);
  });

  it('loads the shipped content without a single issue', () => {
    const { db, issues, foreign } = loadContent(shippedFiles);
    expect(issues).toEqual([]);
    // Kinds no other package owns yet must not silently fall through as foreign.
    expect(foreign.map((file) => file.path)).toEqual([]);
    expect(db.ships.map((ship) => ship.id)).toContain('kestrel');
    expect(db.weaponPresets.map((preset) => preset.id)).toContain('type-a');
  });

  it('resolves every sprite and script name the shipped content uses', () => {
    const { db } = loadContent(shippedFiles);
    for (const ship of db.ships) expect(db.sprites.names[ship.spriteId]).toBe(ship.sprite);
    for (const weapon of db.weapons) {
      expect(db.sprites.names[weapon.spriteId]).toBe(weapon.sprite);
      expect(db.scripts.names[weapon.behaviorId]).toBe(weapon.behavior);
    }
    for (const enemy of db.enemies) expect(db.scripts.names[enemy.scriptId]).toBe(enemy.script);
  });

  it('loads the example format samples without a single issue', () => {
    const { db, issues } = loadContent(read(examplePaths));
    expect(issues).toEqual([]);
    expect(db.stages.length).toBeGreaterThan(0);
    for (const stage of db.stages) {
      for (const event of stage.events) {
        if ('enemyId' in event) expect(event.enemyId).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('names every file after its kind (`<folder>/<name>.<kind>.json`)', () => {
    const suffixOf: Record<string, string> = {
      player: 'player',
      weapons: 'weapons',
      enemies: 'enemies',
      stages: 'stage',
    };
    for (const file of [...shippedFiles, ...read(examplePaths)]) {
      const [folder = '', name = ''] = file.path.split('/');
      const kind = (file.data as { kind?: unknown }).kind;
      expect(suffixOf[folder], file.path).toBeDefined();
      expect(kind, file.path).toBe(suffixOf[folder]);
      expect(name.endsWith(`.${suffixOf[folder] ?? '?'}.json`), file.path).toBe(true);
    }
  });

  it('builds weapon presets only from weapons of the matching slot', () => {
    for (const set of [shippedFiles, read(examplePaths)]) {
      const { db } = loadContent(set);
      expect(db.weaponPresets.length).toBeGreaterThan(0);
      for (const preset of db.weaponPresets) {
        const slots = {
          mainId: 'main',
          missileId: 'missile',
          doubleId: 'double',
          laserId: 'laser',
        };
        for (const [field, slot] of Object.entries(slots)) {
          const id = preset[field as keyof typeof slots] ?? -1;
          if (id >= 0) expect(db.weapons[id]?.slot, `${preset.id}.${slot}`).toBe(slot);
        }
      }
    }
  });

  it('gives every shipped weapon a cue and a sorted, deterministic sprite table', () => {
    const { db } = loadContent(shippedFiles);
    for (const weapon of db.weapons) {
      expect(weapon.sfxId ?? -1, weapon.id).toBeGreaterThanOrEqual(0);
    }
    expect(db.sprites.names).toEqual([...db.sprites.names].sort());
    expect(loadContent([...shippedFiles].reverse()).db.sprites.names).toEqual(db.sprites.names);
  });

  it('keeps the format samples in the content READMEs valid', () => {
    const readmes = allPaths
      .map((path) => path.split('/')[0] ?? '')
      .filter(
        (folder, i, list) =>
          folder !== '' && list.indexOf(folder) === i && !folder.endsWith('.json'),
      );
    expect(readmes.length).toBeGreaterThan(0);
    for (const folder of readmes) {
      const readme = readFileSync(join(contentRoot, folder, 'README.md'), 'utf8');
      const blocks = [...readme.matchAll(/```jsonc?\n([\s\S]*?)```/g)].map(
        (match) => match[1] ?? '',
      );
      expect(blocks.length, `${folder}/README.md format block`).toBeGreaterThan(0);
      for (const block of blocks) {
        const data = JSON.parse(stripLineComments(block)) as unknown;
        const { issues } = loadContent([{ path: `${folder}/README.md`, data }]);
        // A sample may name ids that only exist in a full content set; its shape must be right.
        expect(
          issues.filter((issue) => !/^unknown \w+ id /.test(issue.message)),
          `${folder}/README.md`,
        ).toEqual([]);
      }
    }
  });

  it('gives the KESTREL the six speed levels of decision D3', () => {
    const { db } = loadContent(shippedFiles);
    const kestrel = db.ships[db.shipIndex.get('kestrel') ?? -1];
    expect(kestrel?.speeds).toEqual([1.5, 2, 2.5, 3, 3.5, 4]);
    expect(kestrel?.hurtRadius).toBe(1.5);
  });
});
