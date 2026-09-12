/**
 * `core/data` for plan M2-01: the `rules` kind (the difficulty presets — every range, all four
 * presets required, `aimDirections` a power of two, one file only, frozen rows) and the enemy
 * `rank` / `revenge` fields (schema, bosses must leave them out).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFFICULTY_TABLE } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB, loadContent, type ContentFile } from '../../src/data/index.js';

/** One preset row of a rules body being edited. */
type Row = Record<string, unknown> & { extends: Record<string, unknown> };

/** A rules body being edited. */
interface RulesBody {
  /** The difficulty rows by preset. */
  difficulty: Record<string, Row>;
}

/**
 * A `rules` file with the built-in table, some fields changed.
 *
 * @param path - File path.
 * @param edit - Changes the parsed body in place.
 * @returns The file.
 */
function rules(path: string, edit?: (body: RulesBody) => void): ContentFile {
  const body = JSON.parse(
    JSON.stringify({ formatVersion: 1, kind: 'rules', difficulty: DEFAULT_DIFFICULTY_TABLE }),
  ) as RulesBody;
  edit?.(body);
  return { path, data: body };
}

/**
 * An enemies file with one drifter, some fields added.
 *
 * @param extra - Fields merged into the enemy.
 * @returns The file.
 */
function enemies(extra: Record<string, unknown>): ContentFile {
  return {
    path: 'enemies/e.enemies.json',
    data: {
      formatVersion: 1,
      kind: 'enemies',
      enemies: [
        {
          id: 'drifter',
          hp: 1,
          score: 100,
          hurtbox: { hw: 4, hh: 4 },
          script: 'drifter.sine',
          sprite: 'enemies/drifter',
          drop: null,
          ...extra,
        },
      ],
    },
  };
}

describe('core/data rules kind (M2-01)', () => {
  it('loads the difficulty table into ContentDb.difficulty, frozen', () => {
    const { db, issues } = loadContent([rules('rules/difficulty.rules.json')]);
    expect(issues).toEqual([]);
    expect(db.difficulty).toEqual(DEFAULT_DIFFICULTY_TABLE);
    expect(Object.isFrozen(db.difficulty)).toBe(true);
    expect(Object.isFrozen(db.difficulty?.hard)).toBe(true);
    expect(Object.isFrozen(db.difficulty?.hard.extends)).toBe(true);
    expect(EMPTY_CONTENT_DB.difficulty).toBeNull();
    expect(loadContent([]).db.difficulty).toBeNull();
  });

  it('accepts a rules file without a difficulty section', () => {
    const { db, issues } = loadContent([
      { path: 'rules/empty.rules.json', data: { formatVersion: 1, kind: 'rules' } },
    ]);
    expect(issues).toEqual([]);
    expect(db.difficulty).toBeNull();
  });

  it('reports every out-of-range field with its path', () => {
    const { db, issues } = loadContent([
      rules('rules/bad.rules.json', (b) => {
        b.difficulty.easy.rankBase = 32;
        b.difficulty.easy.rankGrowth = 4.5;
        b.difficulty.normal.lives = 0;
        b.difficulty.normal.extends.first = -5;
        b.difficulty.hard.continues = 10;
        b.difficulty.hard.deathPenalty = 'hardcore';
        b.difficulty.arcade.bulletSpeedMul = 5;
        b.difficulty.arcade.aimDirections = 2048;
      }),
    ]);
    expect(db.difficulty).toBeNull();
    expect(issues.map((i) => i.path)).toEqual([
      'rules/bad.rules.json:difficulty.easy.rankBase',
      'rules/bad.rules.json:difficulty.easy.rankGrowth',
      'rules/bad.rules.json:difficulty.normal.lives',
      'rules/bad.rules.json:difficulty.normal.extends.first',
      'rules/bad.rules.json:difficulty.hard.continues',
      'rules/bad.rules.json:difficulty.hard.deathPenalty',
      'rules/bad.rules.json:difficulty.arcade.aimDirections',
      'rules/bad.rules.json:difficulty.arcade.bulletSpeedMul',
    ]);
  });

  it('requires all four presets and every field of a preset', () => {
    const { issues } = loadContent([
      rules('rules/bad.rules.json', (b) => {
        delete b.difficulty.arcade;
        delete b.difficulty.easy.continues;
      }),
    ]);
    expect(issues.map((i) => [i.path, i.message])).toEqual([
      ['rules/bad.rules.json:difficulty.easy.continues', 'is required'],
      ['rules/bad.rules.json:difficulty.arcade', 'is required'],
    ]);
  });

  it('wants aimDirections to be a power of two', () => {
    const { db, issues } = loadContent([
      rules('rules/bad.rules.json', (b) => {
        b.difficulty.normal.aimDirections = 24;
      }),
    ]);
    expect(db.difficulty).toBeNull();
    expect(issues).toEqual([
      {
        path: 'rules/bad.rules.json:difficulty.normal.aimDirections',
        message: 'must be a power of two (4, 8, 16 … 1024)',
      },
    ]);
  });

  it('keeps the first difficulty section (by path) and reports a second one', () => {
    const { db, issues } = loadContent([
      rules('rules/b.rules.json', (b) => {
        b.difficulty.easy.lives = 1;
      }),
      rules('rules/a.rules.json'),
    ]);
    expect(db.difficulty?.easy.lives).toBe(5);
    expect(issues).toEqual([
      {
        path: 'rules/b.rules.json:difficulty',
        message: 'difficulty rules are already defined by another file',
      },
    ]);
  });
});

describe('core/data enemy rank modifiers and revenge (M2-01)', () => {
  it('keeps the modifiers and the revenge section as written', () => {
    const { db, issues } = loadContent([
      enemies({
        rank: { bulletSpeed: 2, fireRate: 0 },
        revenge: { minRank: 8, pattern: 'ring8', speed: 1.5 },
      }),
    ]);
    expect(issues).toEqual([]);
    expect(db.enemies[0].rank).toEqual({ bulletSpeed: 2, fireRate: 0 });
    expect(db.enemies[0].revenge).toEqual({ minRank: 8, pattern: 'ring8', speed: 1.5 });
    const plain = loadContent([enemies({})]).db.enemies[0];
    expect([plain.rank, plain.revenge]).toEqual([undefined, undefined]);
    expect(loadContent([enemies({ revenge: { minRank: 0, pattern: 'aimed' } })]).issues).toEqual(
      [],
    );
  });

  it('reports a bad revenge section', () => {
    const { issues } = loadContent([
      enemies({ revenge: { minRank: 40, pattern: 'spiral', speed: 9, extra: 1 } }),
    ]);
    expect(issues.map((i) => i.path)).toEqual([
      'enemies/e.enemies.json:enemies[0].revenge.minRank',
      'enemies/e.enemies.json:enemies[0].revenge.pattern',
      'enemies/e.enemies.json:enemies[0].revenge.speed',
      'enemies/e.enemies.json:enemies[0].revenge.extra',
    ]);
    const missing = loadContent([enemies({ revenge: { pattern: 'aimed' } })]).issues;
    expect(missing.map((i) => [i.path, i.message])).toEqual([
      ['enemies/e.enemies.json:enemies[0].revenge.minRank', 'is required'],
    ]);
  });

  it('refuses revenge on a boss entry', () => {
    const { issues } = loadContent([
      {
        path: 'enemies/boss.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            {
              id: 'boss',
              revenge: { minRank: 1, pattern: 'aimed' },
              boss: {
                code: 'B-1',
                displayName: 'BOSS',
                parts: [{ name: 'core', hp: 5, hurtbox: { hw: 4, hh: 4 }, core: true }],
                phases: [{ script: 'boss.hover' }],
              },
            },
          ],
        },
      },
    ]);
    expect(issues.map((i) => i.path)).toContain('enemies/boss.enemies.json:enemies[0].revenge');
  });
});
