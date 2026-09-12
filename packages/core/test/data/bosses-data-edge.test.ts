/**
 * Edge cases of the boss section of the `enemies` kind (plan M1-13), beyond
 * `bosses-data.test.ts`: a part naming itself as parent, the limits of the section and of a part
 * (phase and part counts, positions, animation), several cores adding up, boundary values that
 * are allowed (`count` = the list, `hpBelow` = the cores' total), a `requires` naming a later part,
 * a `boss: null` entry, unknown section fields, and — a regression — duplicate names in a phase's
 * `partsDestroyed`, which made the phase's part condition impossible to meet.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_BOSS_PHASES,
  loadContent,
  type ContentFile,
  type ValidationIssue,
} from '../../src/data/index.js';

/**
 * An `enemies` file.
 *
 * @param enemies - Its entries.
 * @returns The file.
 */
const enemiesFile = (enemies: unknown[]): ContentFile => ({
  path: 'e.json',
  data: { formatVersion: 1, kind: 'enemies', enemies },
});

/**
 * A boss entry: one core, one phase, plus overrides of the section.
 *
 * @param over - Overrides of the boss section.
 * @returns The entry.
 */
const boss = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'warden',
  boss: {
    code: 'WD-01',
    displayName: 'WARDEN',
    parts: [{ name: 'core', hp: 20, hurtbox: { hw: 8, hh: 8 }, core: true }],
    phases: [{ script: 'boss.hover' }],
    ...over,
  },
});

/**
 * The issues of loading one enemies file.
 *
 * @param enemies - Its entries.
 * @returns The issues.
 */
const issuesOf = (enemies: unknown[]): readonly ValidationIssue[] =>
  loadContent([enemiesFile(enemies)]).issues;

/** Three parts a phase condition can name. */
const THREE_PARTS = [
  { name: 'core', hp: 20, hurtbox: { hw: 8, hh: 8 }, core: true },
  { name: 'a', hurtbox: { hw: 2, hh: 2 } },
  { name: 'b', hurtbox: { hw: 2, hh: 2 } },
];

describe('core/data — boss section edge cases (M1-13)', () => {
  it('reports a part that names itself as its parent', () => {
    expect(
      issuesOf([
        boss({
          parts: [{ name: 'core', parent: 'core', hp: 1, hurtbox: { hw: 1, hh: 1 }, core: true }],
        }),
      ]),
    ).toEqual([
      {
        path: 'e.json:enemies[0].boss.parts[0].parent',
        message: 'must name an earlier part (parents come first)',
      },
    ]);
  });

  it('reports duplicate names in a phase condition (regression: the phase could never end)', () => {
    // Two entries, one part: the mask had one bit but the phase waited for two destroyed parts.
    expect(
      issuesOf([
        boss({
          parts: THREE_PARTS,
          phases: [
            { script: 'a', until: { partsDestroyed: ['a', 'a'] } },
            { script: 'b', until: { partsDestroyed: ['b', 'a', 'b'], count: 1 } },
            { script: 'c' },
          ],
        }),
      ]),
    ).toEqual([
      {
        path: 'e.json:enemies[0].boss.phases[0].until.partsDestroyed[1]',
        message: 'duplicate part "a"',
      },
      {
        path: 'e.json:enemies[0].boss.phases[1].until.partsDestroyed[2]',
        message: 'duplicate part "b"',
      },
    ]);
  });

  it('accepts the boundary values: count = the list, hpBelow = the cores’ total', () => {
    const { db, issues } = loadContent([
      enemiesFile([
        boss({
          parts: THREE_PARTS,
          phases: [
            { script: 'a', until: { partsDestroyed: ['a', 'b'], count: 2 } },
            { script: 'b', until: { hpBelow: 20 } },
            { script: 'c' },
          ],
        }),
      ]),
    ]);
    expect(issues).toEqual([]);
    const phases = db.enemies[0].boss?.phases ?? [];
    expect(phases[0].until).toMatchObject({ partsMask: 0b110, count: 2 });
    // Without `count`, the loader keeps it absent (the boss system then waits for the whole list).
    expect(phases[1].until).toMatchObject({ hpBelow: 20, partsMask: 0 });
    expect(phases[1].until).not.toHaveProperty('count');
  });

  it('adds up several cores for the entry hp and the hpBelow bound', () => {
    const parts = [
      { name: 'left', hp: 7, hurtbox: { hw: 2, hh: 2 }, core: true },
      { name: 'right', hp: 5, hurtbox: { hw: 2, hh: 2 }, core: true, vulnerable: 'whenOpen' },
      { name: 'armour', hp: 99, hurtbox: { hw: 2, hh: 2 } },
    ];
    const { db, issues } = loadContent([enemiesFile([boss({ parts })])]);
    expect(issues).toEqual([]);
    expect(db.enemies[0].hp).toBe(12);
    expect(
      issuesOf([
        boss({
          parts,
          phases: [{ script: 'a', until: { hpBelow: 13 } }, { script: 'b' }],
        }),
      ]),
    ).toEqual([
      {
        path: 'e.json:enemies[0].boss.phases[0].until.hpBelow',
        message: "must be <= the cores' total hp (12)",
      },
    ]);
  });

  it('lets an afterParts part require a later part (the mask is by index)', () => {
    const { db, issues } = loadContent([
      enemiesFile([
        boss({
          parts: [
            {
              name: 'core',
              hp: 5,
              hurtbox: { hw: 1, hh: 1 },
              core: true,
              vulnerable: 'afterParts',
              requires: ['c', 'b'],
            },
            { name: 'b', hurtbox: { hw: 1, hh: 1 } },
            { name: 'c', hurtbox: { hw: 1, hh: 1 } },
          ],
        }),
      ]),
    ]);
    expect(issues).toEqual([]);
    expect(db.enemies[0].boss?.parts[0]).toMatchObject({
      requires: ['c', 'b'],
      requiresMask: 0b110,
    });
  });

  it('checks the limits of the section and its parts', () => {
    const phases = Array.from({ length: MAX_BOSS_PHASES + 1 }, (_, i) =>
      i === MAX_BOSS_PHASES ? { script: 's' } : { script: 's', until: { ticks: 1 } },
    );
    expect(issuesOf([boss({ phases })])).toEqual([
      { path: 'e.json:enemies[0].boss.phases', message: 'must have at most 8 items' },
    ]);
    expect(issuesOf([boss({ parts: [] })])).toEqual([
      { path: 'e.json:enemies[0].boss.parts', message: 'must have at least 1 items' },
    ]);
    expect(issuesOf([boss({ phases: [] })])).toEqual([
      { path: 'e.json:enemies[0].boss.phases', message: 'must have at least 1 items' },
    ]);
    const paths = (over: Record<string, unknown>): string[] =>
      issuesOf([boss(over)]).map((i) => i.path.replace('e.json:enemies[0].boss.', ''));
    expect(paths({ x: -1, y: 201, introTicks: -1, score: -5 })).toEqual([
      'introTicks',
      'score',
      'x',
      'y',
    ]);
    expect(
      paths({
        parts: [
          {
            name: 'Core',
            x: 513,
            hp: 0,
            core: true,
            hurtbox: { hw: 1, hh: 1 },
            anim: { frames: 0, ticks: 601 },
            explosion: 'huge',
            vulnerable: 'sometimes',
          },
        ],
      }),
    ).toEqual([
      'parts[0].name',
      'parts[0].x',
      'parts[0].hp',
      'parts[0].vulnerable',
      'parts[0].anim.frames',
      'parts[0].anim.ticks',
      'parts[0].explosion',
    ]);
    // The largest legal values load.
    const { issues } = loadContent([
      enemiesFile([
        boss({
          code: 'ABCDEFGH',
          displayName: 'X'.repeat(24),
          introTicks: 600,
          x: 384,
          y: 200,
          parts: [
            {
              name: 'core',
              x: -512,
              y: 512,
              hp: 100000,
              hurtbox: { hw: 1, hh: 1 },
              core: true,
              anim: { frames: 64, ticks: 600 },
            },
          ],
        }),
      ]),
    ]);
    expect(issues).toEqual([]);
  });

  it('rejects a boss section that is not an object and unknown section fields', () => {
    expect(issuesOf([{ id: 'nil', boss: null }]).map((i) => i.path)).toContain(
      'e.json:enemies[0].boss',
    );
    expect(issuesOf([boss({ hp: 5 })])).toEqual([
      expect.objectContaining({ path: 'e.json:enemies[0].boss.hp' }),
    ]);
  });
});
