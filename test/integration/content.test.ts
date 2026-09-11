/**
 * `pnpm content:check` — every JSON file under `content/` validates against the schemas in
 * `@shmup/core`'s `data` module, and every string id it uses resolves.
 *
 * The shipped files (what `virtual:shmup-content` inlines into a build) and the
 * `example.*.json` format samples are loaded as two independent sets: the examples are
 * documentation, so they may reuse the ids of the real content without clashing with it.
 * Every sprite name the shipped content uses must exist in the atlas the asset pipeline
 * builds (M1-03) — a typo is reported as an issue here, not as a magenta box in the game.
 * Kinds the core does not own go to their owning package, like the shell does at boot
 * (plan §3.5): `input-profiles` → `@shmup/input-web` (M1-05). The shipped set is loaded with the
 * engine's script registry (`KNOWN_SCRIPT_IDS`, M1-08), so an unknown behaviour id is an issue,
 * and its enemies are checked against their behaviours' tunables (`checkEnemyBehaviors`).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KNOWN_SCRIPT_IDS,
  checkEnemyBehaviors,
  loadContent,
  type ContentFile,
  type ValidationIssue,
} from '@shmup/core';
import { loadInputProfiles, parseInputProfiles } from '@shmup/input-web';
import { describe, expect, it } from 'vitest';
import { findMissingSprites } from '../../scripts/assets/manifest.mjs';
import { buildAtlas } from '../../scripts/assets/pipeline.mjs';
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

/** Validators of the foreign kinds, as the shell registers them (plan §3.5). */
const OWNERS: Record<string, (files: readonly ContentFile[]) => readonly ValidationIssue[]> = {
  'input-profiles': (files) => loadInputProfiles(files).issues,
};

/**
 * Validates the foreign files of a load with their owners.
 *
 * @param foreign - `loadContent(...).foreign`.
 * @returns Every owner issue, plus one per file of a kind nobody owns.
 */
function ownerIssues(foreign: readonly ContentFile[]): ValidationIssue[] {
  const byKind = new Map<string, ContentFile[]>();
  for (const file of foreign) {
    const kind = (file.data as { kind: string }).kind;
    byKind.set(kind, [...(byKind.get(kind) ?? []), file]);
  }
  const issues: ValidationIssue[] = [];
  for (const [kind, files] of byKind) {
    const owner = OWNERS[kind];
    if (owner === undefined) {
      for (const file of files) issues.push({ path: file.path, message: `no owner for "${kind}"` });
    } else {
      issues.push(...owner(files));
    }
  }
  return issues;
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
    const { db, issues, foreign } = loadContent(shippedFiles, { knownScripts: KNOWN_SCRIPT_IDS });
    expect(issues).toEqual([]);
    expect(checkEnemyBehaviors(db)).toEqual([]);
    // Foreign kinds go to their owner; a kind nobody owns must not silently fall through.
    expect(foreign.map((file) => file.path)).toEqual(['input/remote.input-profiles.json']);
    expect(ownerIssues(foreign)).toEqual([]);
    expect(db.ships.map((ship) => ship.id)).toContain('kestrel');
    expect(db.weaponPresets.map((preset) => preset.id)).toContain('type-a');
  });

  it('reports a shipped enemy whose script the engine does not know', () => {
    const edited = shippedFiles.map((file) =>
      file.path === 'enemies/test-range.enemies.json'
        ? {
            ...file,
            data: JSON.parse(
              JSON.stringify(file.data).replace('"drifter.sine"', '"drifter.sinus"'),
            ) as unknown,
          }
        : file,
    );
    const { issues } = loadContent(edited, { knownScripts: KNOWN_SCRIPT_IDS });
    expect(issues).toEqual([
      {
        path: 'enemies/test-range.enemies.json:enemies[0].script',
        message: 'unknown script id "drifter.sinus"',
      },
    ]);
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
    const { db, issues, foreign } = loadContent(read(examplePaths));
    expect(issues).toEqual([]);
    expect(foreign.map((file) => file.path)).toEqual(['input/example.input-profiles.json']);
    expect(ownerIssues(foreign)).toEqual([]);
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
      paths: 'paths',
      stages: 'stage',
      tilesets: 'tileset',
      input: 'input-profiles',
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
        if ((data as { kind?: unknown }).kind === 'input-profiles') {
          expect(parseInputProfiles(data, `${folder}/README.md`).issues).toEqual([]);
          continue;
        }
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

describe('integration: content/ sprites exist in the atlas', () => {
  const { manifest } = buildAtlas();

  it('finds every sprite name of the shipped content in the atlas manifest', () => {
    const { db } = loadContent(shippedFiles);
    expect(db.sprites.names.length).toBeGreaterThan(0);
    expect(findMissingSprites(manifest, db.sprites.names, 'db.sprites.names')).toEqual([]);
  });

  it('reports a sprite name that is not in the atlas as an issue', () => {
    const edited = shippedFiles.map((file) =>
      file.path === 'player/kestrel.player.json'
        ? {
            ...file,
            data: JSON.parse(
              JSON.stringify(file.data).replace('ships/kestrel', 'ships/kestrell'),
            ) as unknown,
          }
        : file,
    );
    const { db, issues } = loadContent(edited);
    expect(issues).toEqual([]);
    const missing = findMissingSprites(manifest, db.sprites.names, 'db.sprites.names');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.message).toContain('"ships/kestrell"');
  });
});
