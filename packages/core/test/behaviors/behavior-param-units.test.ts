/**
 * `BEHAVIOR_PARAM_UNITS` (plan_resolution.md R1-03, owner decision O5): the unit of every
 * behaviour tunable. Its names must equal each behaviour's tunables exactly — the enemy and boss
 * behaviours' `params` and the weapons' `WEAPON_BEHAVIOR_PARAMS` — so a tunable added, renamed or
 * removed fails here until the table follows; every unit is a real one with a rule; and every
 * `params` entry of the shipped content resolves to a unit through its owner's behaviour (what
 * `scripts/content/rescale.mjs` does with a `param` number).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as core from '../../src/index.js';
import {
  DEFAULT_BEHAVIOR_DEFS,
  DEFAULT_BOSS_BEHAVIOR_DEFS,
  KNOWN_SCRIPT_IDS,
} from '../../src/behaviors/index.js';
import { BEHAVIOR_PARAM_UNITS } from '../../src/behaviors/units.js';
import { CONTENT_FILE_SCHEMAS } from '../../src/data/index.js';
import { NUMBER_UNITS, UNIT_RULES, walkNumbers } from '../../src/data/units.js';
import { WEAPON_BEHAVIOR_PARAMS } from '../../src/weapons/index.js';

/** Every behaviour's tunables with their defaults, by id. */
const TUNABLES: Record<string, Readonly<Record<string, number>>> = {};
for (const def of DEFAULT_BEHAVIOR_DEFS) TUNABLES[def.id] = def.params;
for (const def of DEFAULT_BOSS_BEHAVIOR_DEFS) TUNABLES[def.id] = def.params;
for (const [id, params] of Object.entries(WEAPON_BEHAVIOR_PARAMS)) TUNABLES[id] = params;

const contentRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'content',
);

/**
 * Every `*.json` file below a directory.
 *
 * @param dir - Absolute directory.
 * @returns The absolute paths, sorted.
 */
function jsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...jsonFiles(path));
    else if (entry.endsWith('.json')) out.push(path);
  }
  return out;
}

describe('core/behaviors BEHAVIOR_PARAM_UNITS', () => {
  it('has an entry for every behaviour the engine knows, and no other', () => {
    expect(Object.keys(BEHAVIOR_PARAM_UNITS).sort()).toEqual([...KNOWN_SCRIPT_IDS]);
    expect(Object.keys(TUNABLES).sort()).toEqual([...KNOWN_SCRIPT_IDS]);
  });

  it('names exactly the tunables of every behaviour', () => {
    const wrong: string[] = [];
    for (const id of Object.keys(TUNABLES)) {
      const expected = Object.keys(TUNABLES[id] ?? {}).sort();
      const actual = Object.keys(BEHAVIOR_PARAM_UNITS[id] ?? {}).sort();
      if (actual.join(' ') !== expected.join(' ')) {
        wrong.push(`${id}: has [${actual.join(' ')}], tunables [${expected.join(' ')}]`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('gives every tunable a unit with a rule of its own', () => {
    const bad: string[] = [];
    for (const id of Object.keys(BEHAVIOR_PARAM_UNITS)) {
      const table = BEHAVIOR_PARAM_UNITS[id] ?? {};
      for (const name of Object.keys(table)) {
        const unit = table[name];
        if (unit === undefined || NUMBER_UNITS.indexOf(unit) < 0 || UNIT_RULES[unit] === 'lookup') {
          bad.push(`${id}.${name}: ${String(unit)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('classifies the tunables whose name means something else in one behaviour', () => {
    expect(BEHAVIOR_PARAM_UNITS['drifter.sine']?.speed).toBe('px-per-tick');
    // An orbit's speed is a turn per tick.
    expect(BEHAVIOR_PARAM_UNITS['captain.circler']?.speed).toBe('angle');
    expect(BEHAVIOR_PARAM_UNITS['boss.steed']?.bobSpeed).toBe('angle');
    // Stones are thrown sideways at up to `spread` px/tick; elsewhere `spread` is a fan's angle.
    expect(BEHAVIOR_PARAM_UNITS['volcano.lob']?.spread).toBe('px-per-tick');
    expect(BEHAVIOR_PARAM_UNITS['walker.floor']?.spread).toBe('angle');
    // The crab's rings turn `turn` units; a Direct-mode bolt's `turn` is a switch.
    expect(BEHAVIOR_PARAM_UNITS['captain.crab']?.turn).toBe('angle');
    expect(BEHAVIOR_PARAM_UNITS['direct.bolt']?.turn).toBe('index');
    // A lane laser is one playfield long (plan §2.6); a player laser's length is a world length.
    expect(BEHAVIOR_PARAM_UNITS['boss.lanes']?.laserLength).toBe('screen-x');
    expect(BEHAVIOR_PARAM_UNITS['laser.beam']?.maxLength).toBe('world-px');
    // Screen positions a boss moves to, and a waypoint's row.
    expect(BEHAVIOR_PARAM_UNITS['captain.circler']?.cx).toBe('screen-x');
    expect(BEHAVIOR_PARAM_UNITS['captain.circler']?.cy).toBe('screen-y');
    expect(BEHAVIOR_PARAM_UNITS['orbiter.loop']?.y).toBe('world-y');
    expect(BEHAVIOR_PARAM_UNITS['boss.suction']?.pullRadius).toBe('world-px');
  });

  it('is frozen and re-exported from the package entry', () => {
    expect(Object.isFrozen(BEHAVIOR_PARAM_UNITS)).toBe(true);
    for (const id of Object.keys(BEHAVIOR_PARAM_UNITS)) {
      expect(Object.isFrozen(BEHAVIOR_PARAM_UNITS[id]), id).toBe(true);
    }
    expect(core.BEHAVIOR_PARAM_UNITS).toBe(BEHAVIOR_PARAM_UNITS);
  });

  it('resolves every params entry of the shipped content through its owner’s behaviour', () => {
    const unresolved: string[] = [];
    let resolved = 0;
    for (const file of jsonFiles(contentRoot)) {
      const data = JSON.parse(readFileSync(file, 'utf8')) as { kind?: string };
      if (data.kind !== 'enemies' && data.kind !== 'weapons') continue;
      const name = file.slice(contentRoot.length + 1);
      walkNumbers(CONTENT_FILE_SCHEMAS[data.kind], data, (leaf) => {
        if (leaf.unit !== 'param') return;
        const owner = leaf.parents[leaf.parents.length - 2] as Record<string, unknown> | undefined;
        const behavior = owner?.script ?? owner?.behavior;
        const unit =
          typeof behavior === 'string' ? BEHAVIOR_PARAM_UNITS[behavior]?.[leaf.key] : undefined;
        if (unit === undefined) unresolved.push(`${name}: ${leaf.path}`);
        else resolved++;
      });
    }
    expect(unresolved).toEqual([]);
    expect(resolved).toBeGreaterThan(200);
  });
});
