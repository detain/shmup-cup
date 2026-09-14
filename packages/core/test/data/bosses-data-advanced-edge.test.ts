/**
 * Edge cases of the M2-09 boss and stage fields in `core/data`, beyond
 * `bosses-data-advanced.test.ts`: every numeric limit of the new fields at both ends (accepted on
 * the bound, refused one step past it — time limits, circle radii, angles, spins, heading frames,
 * turns, enrage factors and phases, raid segments and their count, rush delays and their count),
 * an unknown stage type, a partner with a raid of its own, a three-boss inner chain that loops, a
 * captain's time limit and minion (allowed), and the rush of a stage that also has other events.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_RAID_SEGMENTS,
  MAX_RUSH_BOSSES,
  MAX_TURN_FRAMES,
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
const grunt = (id = 'grunt'): Record<string, unknown> => ({
  id,
  hp: 1,
  score: 10,
  hurtbox: { hw: 2, hh: 2 },
  script: 'x.y',
  sprite: 's/t',
  drop: null,
});

/**
 * A boss entry: one circle core, two phases, plus overrides of the section.
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
    parts: [{ name: 'core', hp: 20, radius: 8, core: true }],
    phases: [{ script: 'boss.hover', until: { ticks: 60 } }, { script: 'boss.lanes' }],
    ...over,
  },
});

/**
 * A boss whose core has extra fields (angle, spin, radius, turn …).
 *
 * @param part - Fields over the core part.
 * @returns The entry.
 */
const withCore = (part: Record<string, unknown>): Record<string, unknown> =>
  boss({ parts: [{ name: 'core', hp: 20, radius: 8, core: true, ...part }] });

/**
 * A stage file.
 *
 * @param over - Fields over a minimal stage.
 * @returns The file.
 */
const stageFile = (over: Record<string, unknown>): ContentFile => ({
  path: 'stages/s.stage.json',
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
    events: [],
    ...over,
  },
});

/**
 * The issues of loading files, without the unknown-script / unknown-sprite noise of a DB with no
 * scripts or sprites.
 *
 * @param files - The files.
 * @returns The issues.
 */
const issuesOf = (...files: ContentFile[]): readonly ValidationIssue[] =>
  loadContent(files).issues.filter((issue) => !/^unknown (script|sprite) id /.test(issue.message));

/**
 * The paths of the issues of one boss entry, relative to its boss section.
 *
 * @param entry - The entry.
 * @returns The paths.
 */
const bossPaths = (entry: Record<string, unknown>): string[] =>
  issuesOf(enemiesFile([entry])).map((issue) => issue.path.replace('e.json:enemies[0].boss.', ''));

/**
 * A raid of `n` segments.
 *
 * @param n - Segments.
 * @param segment - Fields over each segment.
 * @returns The raid.
 */
const raid = (n: number, segment: Record<string, unknown> = {}): Record<string, unknown> => ({
  segments: Array.from({ length: n }, () => ({ x: 0, y: 0, ...segment })),
});

describe('core/data — advanced boss limits (M2-09 edges)', () => {
  it.each([
    ['timeLimit', { timeLimit: 60 }, { timeLimit: 59 }, 'timeLimit'],
    ['timeLimit (max)', { timeLimit: 36000 }, { timeLimit: 36001 }, 'timeLimit'],
    [
      'enrage.fireRate',
      { enrage: { fireRate: 0.1 } },
      { enrage: { fireRate: 0.09 } },
      'enrage.fireRate',
    ],
    [
      'enrage.fireRate (max)',
      { enrage: { fireRate: 1 } },
      { enrage: { fireRate: 1.01 } },
      'enrage.fireRate',
    ],
    ['enrage.speed', { enrage: { speed: 1 } }, { enrage: { speed: 0.99 } }, 'enrage.speed'],
    ['enrage.speed (max)', { enrage: { speed: 4 } }, { enrage: { speed: 4.01 } }, 'enrage.speed'],
    ['enrage.phase', { enrage: { phase: 0 } }, { enrage: { phase: -1 } }, 'enrage.phase'],
    ['enrage.phase (a phase)', { enrage: { phase: 1 } }, { enrage: { phase: 2 } }, 'enrage.phase'],
    [
      'raid segments',
      { raid: raid(MAX_RAID_SEGMENTS) },
      { raid: raid(MAX_RAID_SEGMENTS + 1) },
      'raid.segments',
    ],
    ['a raid without segments', { raid: raid(1) }, { raid: raid(0) }, 'raid.segments'],
    [
      'segment x',
      { raid: raid(1, { x: 2048 }) },
      { raid: raid(1, { x: 2049 }) },
      'raid.segments[0].x',
    ],
    [
      'segment y',
      { raid: raid(1, { y: -2048 }) },
      { raid: raid(1, { y: -2049 }) },
      'raid.segments[0].y',
    ],
    [
      'segment ticks',
      { raid: raid(1, { ticks: 0 }) },
      { raid: raid(1, { ticks: -1 }) },
      'raid.segments[0].ticks',
    ],
    [
      'segment ticks (max)',
      { raid: raid(1, { ticks: 3600 }) },
      { raid: raid(1, { ticks: 3601 }) },
      'raid.segments[0].ticks',
    ],
    [
      'segment hold',
      { raid: raid(1, { hold: 36000 }) },
      { raid: raid(1, { hold: 36001 }) },
      'raid.segments[0].hold',
    ],
  ])('%s: accepted on the bound, refused past it', (_label, good, bad, path) => {
    expect(bossPaths(boss(good))).toEqual([]);
    expect(bossPaths(boss(bad))).toContain(path);
  });

  it.each([
    ['radius', { radius: 1 }, { radius: 0.5 }, 'radius'],
    ['radius (max)', { radius: 128 }, { radius: 129 }, 'radius'],
    ['angle', { angle: -1023 }, { angle: -1024 }, 'angle'],
    ['angle (max)', { angle: 1023 }, { angle: 1024 }, 'angle'],
    ['a fractional angle', { angle: 3 }, { angle: 3.5 }, 'angle'],
    ['spin', { spin: -32 }, { spin: -32.5 }, 'spin'],
    ['spin (max)', { spin: 32 }, { spin: 33 }, 'spin'],
    ['turn', { turn: 2 }, { turn: 1 }, 'turn'],
    ['turn (max)', { turn: MAX_TURN_FRAMES }, { turn: MAX_TURN_FRAMES + 1 }, 'turn'],
  ])('part %s: accepted on the bound, refused past it', (_label, good, bad, field) => {
    expect(bossPaths(withCore(good))).toEqual([]);
    expect(bossPaths(withCore(bad))).toContain('parts[0].' + field);
  });

  it('keeps turns (alternate) within 1 … 3600 ticks', () => {
    const pair = (alternate: number): ContentFile =>
      enemiesFile([boss({ partner: 'mate', alternate }, 'lead'), boss({}, 'mate')]);
    expect(issuesOf(pair(1))).toEqual([]);
    expect(issuesOf(pair(3600))).toEqual([]);
    expect(issuesOf(pair(0)).map((issue) => issue.path)).toContain(
      'e.json:enemies[0].boss.alternate',
    );
    expect(issuesOf(pair(3601)).map((issue) => issue.path)).toContain(
      'e.json:enemies[0].boss.alternate',
    );
  });

  it('refuses a partner with a raid of its own, and a three-boss inner chain that loops', () => {
    const issues = issuesOf(
      enemiesFile([
        boss({ partner: 'raider' }, 'lead'),
        boss({ raid: raid(1) }, 'raider'),
        boss({ inner: 'b' }, 'a'),
        boss({ inner: 'c' }, 'b'),
        boss({ inner: 'a' }, 'c'),
        boss({ inner: 'grunt' }, 'wrong'),
        grunt(),
      ]),
    );
    expect(issues).toEqual([
      {
        path: 'e.json:enemies[0].boss.partner',
        message: 'the partner must not have a partner or raid of its own',
      },
      {
        path: 'e.json:enemies[2].boss.inner',
        message: 'the inner-boss chain loops back to this boss',
      },
      {
        path: 'e.json:enemies[3].boss.inner',
        message: 'the inner-boss chain loops back to this boss',
      },
      {
        path: 'e.json:enemies[4].boss.inner',
        message: 'the inner-boss chain loops back to this boss',
      },
      { path: 'e.json:enemies[5].boss.inner', message: 'must name a boss of role "boss"' },
    ]);
  });

  it('accepts a leader with a raid, a captain’s time limit and minion, and a non-looping chain', () => {
    const { db, issues } = loadContent([
      enemiesFile([
        boss({ partner: 'mate', raid: raid(2) }, 'lead'),
        boss({}, 'mate'),
        boss({ role: 'captain', timeLimit: 600, minion: 'grunt' }, 'cap'),
        boss({ inner: 'b' }, 'a'),
        boss({ inner: 'c' }, 'b'),
        boss({}, 'c'),
        grunt(),
      ]),
    ]);
    expect(issues.filter((issue) => !/^unknown (script|sprite) id /.test(issue.message))).toEqual(
      [],
    );
    const cap = db.enemies[db.enemyIndex.get('cap') ?? -1].boss;
    expect([cap?.role, cap?.timeLimit, cap?.minionId]).toEqual([
      'captain',
      600,
      db.enemyIndex.get('grunt'),
    ]);
    expect(db.enemies[db.enemyIndex.get('lead') ?? -1].boss?.raid?.segments).toHaveLength(2);
  });
});

describe('core/data — boss-rush limits (M2-09 edges)', () => {
  /**
   * The issues of a stage over a file with the boss `a`.
   *
   * @param over - Stage fields.
   * @returns The issue paths below the stage file.
   */
  const stagePaths = (over: Record<string, unknown>): string[] =>
    issuesOf(enemiesFile([boss({}, 'a')]), stageFile(over)).map((issue) =>
      issue.path.replace('stages/s.stage.json:', ''),
    );

  it('keeps the rush within 1 … 16 bosses and each delay within 0 … 3600 ticks', () => {
    const rush = (n: number, entry: Record<string, unknown> = {}): Record<string, unknown> => ({
      type: 'bossRush',
      rush: Array.from({ length: n }, () => ({ enemy: 'a', ...entry })),
    });
    expect(stagePaths(rush(MAX_RUSH_BOSSES))).toEqual([]);
    expect(stagePaths(rush(MAX_RUSH_BOSSES + 1))).toContain('rush');
    expect(stagePaths(rush(1, { delay: 0 }))).toEqual([]);
    expect(stagePaths(rush(1, { delay: 3600 }))).toEqual([]);
    expect(stagePaths(rush(1, { delay: -1 }))).toContain('rush[0].delay');
    expect(stagePaths(rush(1, { delay: 3601 }))).toContain('rush[0].delay');
    expect(stagePaths(rush(1, { delay: 1.5 }))).toContain('rush[0].delay');
    // An empty list is refused by the schema too (a bossRush stage needs its bosses).
    expect(stagePaths({ type: 'bossRush', rush: [] }).length).toBeGreaterThan(0);
  });

  it('refuses an unknown stage type and keeps the other events of a boss rush', () => {
    expect(stagePaths({ type: 'marathon' })).toContain('type');
    const { db, issues } = loadContent([
      enemiesFile([boss({}, 'a'), grunt()]),
      stageFile({
        type: 'bossRush',
        rush: [{ enemy: 'a' }],
        events: [
          { x: 40, type: 'spawn', enemy: 'grunt', y: 70 },
          { x: 80, type: 'music', cue: 'Boss' },
        ],
      }),
    ]);
    expect(issues.filter((issue) => !/^unknown (script|sprite) id /.test(issue.message))).toEqual(
      [],
    );
    expect(db.stages[0].events.map((event) => event.type)).toEqual(['spawn', 'music']);
  });
});
