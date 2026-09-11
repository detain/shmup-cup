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

  it('gives the KESTREL the six speed levels of decision D3', () => {
    const { db } = loadContent(shippedFiles);
    const kestrel = db.ships[db.shipIndex.get('kestrel') ?? -1];
    expect(kestrel?.speeds).toEqual([1.5, 2, 2.5, 3, 3.5, 4]);
    expect(kestrel?.hurtRadius).toBe(1.5);
  });
});
