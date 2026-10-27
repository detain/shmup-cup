/**
 * The stage's weighted drop table (w15-C V3): the schema of a `dropWeights` row (a known
 * `ENEMY_DROPS` name and a weight of 1…1000), the 12-row cap, the loader default of an empty
 * table, the duplicate-name rule (a table names a drop at most once), and the four new drop
 * names (`freeOption`, `mega`, `weaponPick`, `speedOnly`) accepted on enemies and formations.
 */
import { describe, expect, it } from 'vitest';
import { MAX_DROP_WEIGHT_ROWS, loadContent, type ContentFile } from '../../src/data/index.js';

/**
 * A content file.
 *
 * @param path - Path.
 * @param body - Fields besides the header.
 * @returns The file.
 */
function stageFile(path: string, body: Record<string, unknown>): ContentFile {
  return {
    path,
    data: {
      formatVersion: 1,
      kind: 'stage',
      id: 'st',
      name: 'ST',
      music: { stage: 'Stage', boss: 'Boss' },
      length: 1000,
      camera: [{ x: 0, speed: 1 }],
      checkpoints: [],
      parallax: [],
      tilemap: null,
      events: [],
      ...body,
    },
  };
}

/**
 * The issue paths of a stage carrying one `dropWeights` value.
 *
 * @param rows - The table.
 * @returns The paths.
 */
function tableIssues(rows: unknown): string[] {
  const { issues } = loadContent([stageFile('stages/a.stage.json', { dropWeights: rows })]);
  return issues.map((i) => i.path);
}

describe('core/data — the weighted drop table (w15-C V3)', () => {
  it('loads a full table of the new drop names, in the file`s order', () => {
    const rows = [
      { drop: 'capsule', weight: 55 },
      { drop: 'weaponPick', weight: 15 },
      { drop: 'speedOnly', weight: 8 },
      { drop: 'mega', weight: 7 },
      { drop: 'freeOption', weight: 6 },
      { drop: 'blueCapsule', weight: 4 },
      { drop: 'oneUp', weight: 3 },
      { drop: 'bonusCapsule', weight: 2 },
    ];
    const { db, issues } = loadContent([stageFile('stages/a.stage.json', { dropWeights: rows })]);
    expect(issues).toEqual([]);
    expect(db.stages[0].dropWeights).toEqual(rows);
  });

  it('defaults the table to empty when the file holds no `dropWeights`', () => {
    const { db, issues } = loadContent([stageFile('stages/a.stage.json', {})]);
    expect(issues).toEqual([]);
    expect(db.stages[0].dropWeights).toEqual([]);
  });

  it('rejects a zero, negative or oversized weight, and a fractional one', () => {
    expect(tableIssues([{ drop: 'capsule', weight: 0 }])).toEqual([
      'stages/a.stage.json:dropWeights[0].weight',
    ]);
    expect(tableIssues([{ drop: 'capsule', weight: -3 }])).toEqual([
      'stages/a.stage.json:dropWeights[0].weight',
    ]);
    expect(tableIssues([{ drop: 'capsule', weight: 1001 }])).toEqual([
      'stages/a.stage.json:dropWeights[0].weight',
    ]);
    expect(tableIssues([{ drop: 'capsule', weight: 2.5 }])).toEqual([
      'stages/a.stage.json:dropWeights[0].weight',
    ]);
  });

  it('rejects an unknown drop name and a row that is not an object', () => {
    expect(tableIssues([{ drop: 'spreadgun', weight: 5 }])).toEqual([
      'stages/a.stage.json:dropWeights[0].drop',
    ]);
    expect(tableIssues(['capsule'])).toEqual(['stages/a.stage.json:dropWeights[0]']);
  });

  it('caps the table at the row budget and refuses an empty one', () => {
    const many = Array.from({ length: MAX_DROP_WEIGHT_ROWS + 1 }, (_, i) => ({
      drop: 'capsule',
      weight: i + 1,
    }));
    expect(tableIssues(many)).toEqual(['stages/a.stage.json:dropWeights']);
    expect(tableIssues([])).toEqual(['stages/a.stage.json:dropWeights']);
  });

  it('refuses a table that names one drop twice (the loader rule, not a doubled weight)', () => {
    const { issues } = loadContent([
      stageFile('stages/a.stage.json', {
        dropWeights: [
          { drop: 'mega', weight: 5 },
          { drop: 'capsule', weight: 70 },
          { drop: 'mega', weight: 6 },
        ],
      }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe('stages/a.stage.json:dropWeights[2].drop');
    expect(issues[0].message).toBe('names "mega" twice (row 0 has it)');
  });

  it('accepts the four new drop names on an enemy and on a formation', () => {
    const enemies: ContentFile = {
      path: 'enemies/e.enemies.json',
      data: {
        formatVersion: 1,
        kind: 'enemies',
        enemies: (['freeOption', 'mega', 'weaponPick', 'speedOnly'] as const).map((drop) => ({
          id: 'e-' + drop,
          hp: 1,
          score: 100,
          hurtbox: { hw: 4, hh: 4 },
          script: 'test.idle',
          sprite: 'enemies/drifter',
          drop,
        })),
      },
    };
    const events = (['freeOption', 'mega', 'weaponPick', 'speedOnly'] as const).map((drop) => ({
      x: 0,
      type: 'formation',
      enemy: 'e-mega',
      count: 1,
      interval: 10,
      y: 100,
      drop,
    }));
    const { db, issues } = loadContent([enemies, stageFile('stages/a.stage.json', { events })]);
    expect(issues).toEqual([]);
    expect(db.enemies.map((e) => e.drop)).toEqual([
      'freeOption',
      'mega',
      'weaponPick',
      'speedOnly',
    ]);
    expect(db.stages[0].events.map((e) => (e.type === 'formation' ? e.drop : null))).toEqual([
      'freeOption',
      'mega',
      'weaponPick',
      'speedOnly',
    ]);
  });
});
