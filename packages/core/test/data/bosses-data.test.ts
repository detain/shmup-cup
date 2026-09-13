/**
 * The boss section of the `enemies` kind (plan M1-13): defaults and resolved indices / masks, the
 * regular fields a boss entry gets, every structural check of `completeBoss`, the fields a boss
 * must omit and a regular enemy must have, and the fourth pass that keeps bosses and regular
 * enemies in their places (stage events, spawner children).
 */
import { describe, expect, it } from 'vitest';
import {
  BOSS_VULNERABILITIES,
  DEFAULT_BOSS_INTRO_TICKS,
  DEFAULT_BOSS_X,
  DEFAULT_BOSS_Y,
  MAX_BOSS_PARTS,
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

/** A regular enemy entry. */
const grunt = (id = 'grunt', over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  hp: 1,
  score: 10,
  hurtbox: { hw: 2, hh: 2 },
  script: 'x.y',
  sprite: 's/t',
  drop: null,
  ...over,
});

/**
 * A boss entry: one core, one phase, plus overrides of the section.
 *
 * @param over - Overrides of the boss section.
 * @param id - Enemy id.
 * @returns The entry.
 */
const boss = (over: Record<string, unknown> = {}, id = 'warden'): Record<string, unknown> => ({
  id,
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

describe('core/data — boss section (M1-13)', () => {
  it('exports the limits and vulnerabilities', () => {
    expect([MAX_BOSS_PARTS, MAX_BOSS_PHASES]).toEqual([16, 8]);
    expect([...BOSS_VULNERABILITIES]).toEqual(['always', 'afterParts', 'whenOpen', 'never']);
  });

  it('completes a boss: defaults, parent indices, masks, and the regular fields', () => {
    const { db, issues } = loadContent([
      enemiesFile([
        boss({
          parts: [
            { name: 'hull', hurtbox: { hw: 8, hh: 8 }, vulnerable: 'never', sprite: 'b/hull' },
            { name: 'plate', parent: 'hull', x: -12, hp: 6, hurtbox: { hw: 2, hh: 6 } },
            {
              name: 'core',
              parent: 'hull',
              x: -6,
              hp: 30,
              hurtbox: { hw: 4, hh: 4 },
              vulnerable: 'afterParts',
              requires: ['plate'],
              core: true,
            },
            { name: 'eye', parent: 'core', hp: 9, hurtbox: { hw: 2, hh: 2 }, core: true },
          ],
          phases: [
            { script: 'boss.hover', until: { partsDestroyed: ['plate', 'hull'], count: 1 } },
            { script: 'boss.hover', params: { ways: 3 }, until: { hpBelow: 20, ticks: 600 } },
            { script: 'boss.lanes' },
          ],
        }),
      ]),
    ]);
    expect(issues).toEqual([]);
    const spec = db.enemies[0];
    expect(spec).toMatchObject({
      hp: 39,
      score: 0,
      script: '',
      scriptId: -1,
      sprite: '',
      spriteId: -1,
      drop: null,
      ground: null,
      mover: null,
      megaCrashImmune: true,
      explosion: 'large',
      child: null,
      childId: -1,
    });
    const b = spec.boss;
    expect(b).not.toBeNull();
    expect(b).toMatchObject({
      code: 'WD-01',
      displayName: 'WARDEN',
      introTicks: DEFAULT_BOSS_INTRO_TICKS,
      score: 0,
      x: DEFAULT_BOSS_X,
      y: DEFAULT_BOSS_Y,
    });
    const parts = b?.parts ?? [];
    expect(parts.map((p) => p.parentIndex)).toEqual([-1, 0, 0, 2]);
    expect(parts[0]).toMatchObject({
      parent: null,
      x: 0,
      y: 0,
      hp: 1,
      vulnerable: 'never',
      requires: [],
      requiresMask: 0,
      core: false,
      gun: false,
      open: false,
      anim: { frames: 1, ticks: 1 },
      score: 0,
      explosion: 'medium',
      spriteId: db.sprites.index.get('b/hull'),
    });
    expect(parts[1]).toMatchObject({ vulnerable: 'always', spriteId: -1, hurtbox: { hw: 2 } });
    expect(parts[1]).not.toHaveProperty('sprite');
    expect(parts[2]).toMatchObject({ requires: ['plate'], requiresMask: 2, core: true });
    const phases = b?.phases ?? [];
    expect(phases.map((p) => p.until?.partsMask ?? null)).toEqual([3, 0, null]);
    expect(phases[0]).toMatchObject({ params: {}, until: { count: 1 } });
    expect(phases[1]).toMatchObject({ params: { ways: 3 }, until: { hpBelow: 20, ticks: 600 } });
    expect(phases[2].until).toBeNull();
    expect(phases.map((p) => db.scripts.names[p.scriptId])).toEqual([
      'boss.hover',
      'boss.hover',
      'boss.lanes',
    ]);
    // A regular enemy gets `boss: null`.
    expect(loadContent([enemiesFile([grunt()])]).db.enemies[0].boss).toBeNull();
  });

  it('checks the phase scripts against the registry like any script', () => {
    const { issues } = loadContent([enemiesFile([boss({ phases: [{ script: 'boss.nope' }] })])], {
      knownScripts: ['boss.hover'],
    });
    expect(issues).toEqual([
      { path: 'e.json:enemies[0].boss.phases[0].script', message: 'unknown script id "boss.nope"' },
    ]);
  });

  it.each([
    [
      'a duplicate part name',
      {
        parts: [
          { name: 'core', hp: 5, hurtbox: { hw: 1, hh: 1 }, core: true },
          { name: 'core', hurtbox: { hw: 1, hh: 1 } },
        ],
      },
      [['parts[1].name', 'duplicate part "core"']],
    ],
    [
      'a parent that is not an earlier part',
      {
        parts: [
          { name: 'core', parent: 'hull', hp: 5, hurtbox: { hw: 1, hh: 1 }, core: true },
          { name: 'hull' },
        ],
      },
      [['parts[0].parent', 'must name an earlier part (parents come first)']],
    ],
    [
      'afterParts without requires',
      {
        parts: [
          { name: 'core', hp: 5, hurtbox: { hw: 1, hh: 1 }, core: true, vulnerable: 'afterParts' },
        ],
      },
      [['parts[0].requires', 'is required for vulnerable "afterParts"']],
    ],
    [
      'requires on a part that is not afterParts',
      {
        parts: [
          { name: 'core', hp: 5, hurtbox: { hw: 1, hh: 1 }, core: true },
          { name: 'x', requires: ['core'] },
        ],
      },
      [['parts[1].requires', 'is only used by vulnerable "afterParts"']],
    ],
    [
      'requires naming an unknown part or itself',
      {
        parts: [
          {
            name: 'core',
            hp: 5,
            hurtbox: { hw: 1, hh: 1 },
            core: true,
            vulnerable: 'afterParts',
            requires: ['ghost', 'core'],
          },
        ],
      },
      [
        ['parts[0].requires[0]', 'unknown part "ghost"'],
        ['parts[0].requires[1]', 'must name another part'],
      ],
    ],
    [
      'no core',
      { parts: [{ name: 'hull', hurtbox: { hw: 1, hh: 1 } }] },
      [['parts', 'needs at least one core ("core": true)']],
    ],
    [
      'an armoured core without a hurtbox',
      { parts: [{ name: 'core', core: true, vulnerable: 'never' }] },
      [
        ['parts[0].vulnerable', 'a core cannot be "never" (the boss could not die)'],
        ['parts[0].hurtbox', 'is required for a core (a hurtbox or a radius)'],
      ],
    ],
    [
      'a phase without until before the last',
      { phases: [{ script: 'a' }, { script: 'b' }] },
      [['phases[0].until', 'is required (every phase but the last ends on it)']],
    ],
    [
      'until on the last phase',
      { phases: [{ script: 'a', until: { ticks: 5 } }] },
      [['phases[0].until', 'must be omitted on the last phase (it runs to the end)']],
    ],
    [
      'an empty until, a count without parts',
      {
        phases: [{ script: 'a', until: {} }, { script: 'b', until: { count: 1 } }, { script: 'c' }],
      },
      [
        ['phases[0].until', 'needs hpBelow, partsDestroyed or ticks'],
        ['phases[1].until', 'needs hpBelow, partsDestroyed or ticks'],
        ['phases[1].until.count', 'needs partsDestroyed'],
      ],
    ],
    [
      'a count above the list, unknown parts, hpBelow above the cores',
      {
        phases: [
          { script: 'a', until: { partsDestroyed: ['core', 'nope'], count: 3, hpBelow: 21 } },
          { script: 'b' },
        ],
      },
      [
        ['phases[0].until.count', 'must be <= the number of partsDestroyed'],
        ['phases[0].until.hpBelow', "must be <= the cores' total hp (20)"],
        ['phases[0].until.partsDestroyed[1]', 'unknown part "nope"'],
      ],
    ],
  ])('reports %s', (_label, over, expected) => {
    expect(issuesOf([boss(over)])).toEqual(
      expected.map(([path, message]) => ({ path: 'e.json:enemies[0].boss.' + path, message })),
    );
  });

  it('checks the section schema: code, name, limits', () => {
    expect(issuesOf([boss({ code: 'hb-01', displayName: 'Halcyon "Bulwark"' })])).toEqual([
      {
        path: 'e.json:enemies[0].boss.code',
        message: 'must be a string of length in 1..8 matching /^[A-Z0-9][A-Z0-9-]*$/',
      },
      {
        path: 'e.json:enemies[0].boss.displayName',
        message: "must be a string of length in 1..24 matching /^[A-Z0-9][A-Z0-9 .'-]*$/",
      },
    ]);
    const many = Array.from({ length: 17 }, (_, i) => ({ name: 'p' + String(i) }));
    expect(issuesOf([boss({ parts: many })])).toEqual([
      { path: 'e.json:enemies[0].boss.parts', message: 'must have at most 16 items' },
    ]);
    expect(issuesOf([boss({ introTicks: 601, x: 500 })]).map((i) => i.path)).toEqual([
      'e.json:enemies[0].boss.introTicks',
      'e.json:enemies[0].boss.x',
    ]);
  });

  it('a boss entry names nothing but its id and section; a regular enemy needs its fields', () => {
    const { db, issues } = loadContent([
      enemiesFile([grunt('ok'), { ...boss(), hp: 5, script: 'x', drop: null }]),
    ]);
    const message = 'must be omitted for a boss (its boss section describes it)';
    expect(issues).toEqual([
      { path: 'e.json:enemies[1].hp', message },
      { path: 'e.json:enemies[1].script', message },
      { path: 'e.json:enemies[1].drop', message },
    ]);
    // Like a schema failure, a bad entry fails its whole file.
    expect(db.enemies).toEqual([]);
    expect(issuesOf([{ id: 'bare' }])).toEqual(
      ['hp', 'score', 'hurtbox', 'script', 'sprite', 'drop'].map((field) => ({
        path: 'e.json:enemies[0].' + field,
        message: 'is required',
      })),
    );
  });

  it('keeps bosses out of spawns and children, and warning / boss events on bosses', () => {
    const stage = (events: unknown[]): ContentFile => ({
      path: 's.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 's',
        name: 'S',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 1000,
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [],
        parallax: [],
        tilemap: null,
        events,
      },
    });
    const { issues } = loadContent([
      enemiesFile([grunt(), grunt('hatch', { child: 'warden' }), boss()]),
      stage([
        { x: 0, type: 'spawn', enemy: 'warden' },
        { x: 0, type: 'formation', enemy: 'warden', count: 2, interval: 5 },
        { x: 0, type: 'warning', enemy: 'grunt' },
        { x: 0, type: 'boss', enemy: 'grunt' },
        { x: 0, type: 'warning', enemy: 'warden' },
        { x: 0, type: 'boss', enemy: 'ghost' },
      ]),
    ]);
    const start = 'is a boss: start it with a "warning" or "boss" event';
    const named = 'must name an enemy with a boss section';
    expect(issues).toEqual([
      { path: 's.json:events[5].enemy', message: 'unknown enemy id "ghost"' },
      { path: 's.json:events[0].enemy', message: start },
      { path: 's.json:events[1].enemy', message: start },
      { path: 's.json:events[2].enemy', message: named },
      { path: 's.json:events[3].enemy', message: named },
      { path: 'e.json:enemies[1].child', message: 'is a boss: a spawner cannot release it' },
    ]);
  });
});
