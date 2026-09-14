/**
 * The M2-09 fields of the boss section and of stages (plan M2-09): roles, time limits, raids,
 * partners with turns and enrage, inner bosses, minions, turned parts (angle, spin, circle
 * hurtboxes, heading frames) and boss-rush stages — their defaults, their resolved ids and every
 * check of the loader, including the reference pass (partners, inner bosses and rush entries are
 * stage bosses, minions regular enemies, captains never come with a WARNING, no inner-boss loops).
 */
import { describe, expect, it } from 'vitest';
import {
  BOSS_ROLES,
  DEFAULT_ENRAGE_FIRE_RATE,
  DEFAULT_ENRAGE_SPEED,
  DEFAULT_RAID_SEGMENT_TICKS,
  DEFAULT_RUSH_DELAY,
  MAX_RAID_SEGMENTS,
  MAX_RUSH_BOSSES,
  MAX_TURN_FRAMES,
  STAGE_TYPES,
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
 * The issues of loading files.
 *
 * @param files - The files.
 * @returns The issues.
 */
const issuesOf = (...files: ContentFile[]): readonly ValidationIssue[] => loadContent(files).issues;

describe('core/data — advanced bosses (M2-09)', () => {
  it('exports the roles, limits and defaults', () => {
    expect([...BOSS_ROLES]).toEqual(['boss', 'captain']);
    expect([...STAGE_TYPES]).toEqual(['normal', 'bossRush', 'bonus']);
    expect([MAX_RAID_SEGMENTS, MAX_RUSH_BOSSES, MAX_TURN_FRAMES]).toEqual([16, 16, 64]);
    expect([DEFAULT_RAID_SEGMENT_TICKS, DEFAULT_RUSH_DELAY]).toEqual([120, 60]);
    expect([DEFAULT_ENRAGE_FIRE_RATE, DEFAULT_ENRAGE_SPEED]).toEqual([0.625, 1.5]);
  });

  it('fills the defaults of a plain boss section', () => {
    const { db, issues } = loadContent([enemiesFile([boss()])]);
    expect(issues).toEqual([]);
    const b = db.enemies[0].boss;
    expect(b).toMatchObject({
      role: 'boss',
      timeLimit: 0,
      raid: null,
      partner: null,
      partnerId: -1,
      alternate: 0,
      enrage: { fireRate: 0.625, speed: 1.5, phase: -1 },
      inner: null,
      innerId: -1,
      minion: null,
      minionId: -1,
    });
    expect(b?.parts[0]).toMatchObject({ radius: 0, angle: 0, spin: 0, turn: 0 });
  });

  it('resolves partners, inner bosses, minions, raids and turned parts', () => {
    const { db, issues } = loadContent([
      enemiesFile([
        boss(
          {
            partner: 'mate',
            alternate: 90,
            enrage: { phase: 1 },
            inner: 'heart',
            minion: 'grunt',
            timeLimit: 600,
            phases: [{ script: 'boss.hover', until: { ticks: 60 } }, { script: 'boss.lanes' }],
            parts: [
              { name: 'core', hp: 20, radius: 9, core: true, spin: 2.5, angle: -256 },
              { name: 'tip', parent: 'core', x: 12, radius: 3, turn: 16, sprite: 'b/t' },
            ],
          },
          'lead',
        ),
        boss({}, 'mate'),
        boss(
          {
            raid: {
              segments: [
                { x: -40, y: -60 },
                { x: 10, y: 0, ticks: 30, hold: 20 },
              ],
            },
          },
          'heart',
        ),
        grunt(),
      ]),
    ]);
    expect(issues).toEqual([]);
    const lead = db.enemies[db.enemyIndex.get('lead') ?? -1].boss;
    expect(lead?.partnerId).toBe(db.enemyIndex.get('mate'));
    expect(lead?.innerId).toBe(db.enemyIndex.get('heart'));
    expect(lead?.minionId).toBe(db.enemyIndex.get('grunt'));
    expect(lead?.enrage).toEqual({ fireRate: 0.625, speed: 1.5, phase: 1 });
    expect([lead?.alternate, lead?.timeLimit]).toEqual([90, 600]);
    expect(lead?.parts[0]).toMatchObject({ radius: 9, spin: 2.5, angle: -256, hurtbox: null });
    expect(lead?.parts[1]).toMatchObject({ turn: 16, radius: 3 });
    const heart = db.enemies[db.enemyIndex.get('heart') ?? -1].boss;
    expect(heart?.raid).toEqual({
      segments: [
        { x: -40, y: -60, ticks: 120, hold: 0 },
        { x: 10, y: 0, ticks: 30, hold: 20 },
      ],
      loop: true,
    });
  });

  it.each([
    [
      'a part with both a hurtbox and a radius',
      { parts: [{ name: 'core', hp: 1, hurtbox: { hw: 2, hh: 2 }, radius: 3, core: true }] },
      [['parts[0].radius', 'a part is hit by a hurtbox or a radius, not both']],
    ],
    [
      'heading frames with an animation',
      {
        parts: [
          { name: 'core', hp: 1, radius: 3, core: true },
          { name: 't', radius: 2, turn: 8, anim: { frames: 2, ticks: 4 } },
        ],
      },
      [['parts[1].turn', 'heading frames (turn) and anim cannot be combined']],
    ],
    [
      'heading frames on a box',
      {
        parts: [
          { name: 'core', hp: 1, radius: 3, core: true },
          { name: 't', hurtbox: { hw: 2, hh: 2 }, turn: 8 },
        ],
      },
      [['parts[1].turn', 'a part drawn turned needs a circle hurtbox (radius): boxes never turn']],
    ],
    [
      'a core without a hurtbox or radius',
      { parts: [{ name: 'core', hp: 1, core: true }] },
      [['parts[0].hurtbox', 'is required for a core (a hurtbox or a radius)']],
    ],
    [
      'a captain with a raid, a partner, an inner boss and turns',
      {
        role: 'captain',
        raid: { segments: [{ x: 0, y: 0 }] },
        partner: 'x',
        inner: 'y',
        alternate: 30,
      },
      [
        ['raid', 'is only for bosses of role "boss" (not captains)'],
        ['partner', 'is only for bosses of role "boss" (not captains)'],
        ['inner', 'is only for bosses of role "boss" (not captains)'],
        ['alternate', 'is only for bosses of role "boss" (not captains)'],
      ],
    ],
    [
      'turns without a partner',
      { alternate: 30 },
      [['alternate', 'needs a partner (the pair takes turns)']],
    ],
    [
      'an enrage phase past the last one',
      { enrage: { phase: 1 } },
      [['enrage.phase', 'must name one of the phases (0-based)']],
    ],
  ])('reports %s', (_label, over, expected) => {
    const issues = issuesOf(enemiesFile([boss(over)])).filter(
      (issue) => !/^unknown \w+ id /.test(issue.message),
    );
    expect(issues).toEqual(
      expected.map(([path, message]) => ({ path: 'e.json:enemies[0].boss.' + path, message })),
    );
  });

  it('keeps partners, inner bosses and minions in their places', () => {
    const issues = issuesOf(
      enemiesFile([
        boss({ partner: 'solo' }, 'self-pair'),
        boss({ partner: 'grunt', inner: 'grunt', minion: 'self-pair' }, 'wrong'),
        boss({ partner: 'paired' }, 'chained'),
        boss({ partner: 'mate' }, 'paired'),
        boss({}, 'mate'),
        boss({ role: 'captain' }, 'cap'),
        boss({ partner: 'cap', inner: 'cap' }, 'cap-user'),
        boss({ inner: 'loop-b' }, 'loop-a'),
        boss({ inner: 'loop-a' }, 'loop-b'),
        boss({ inner: 'selfish' }, 'selfish'),
        boss({}, 'solo'),
        grunt(),
      ]),
    );
    expect(issues).toEqual([
      {
        path: 'e.json:enemies[1].boss.partner',
        message: 'must name a boss of role "boss"',
      },
      { path: 'e.json:enemies[1].boss.inner', message: 'must name a boss of role "boss"' },
      {
        path: 'e.json:enemies[1].boss.minion',
        message: 'must name a regular enemy (not a boss)',
      },
      {
        path: 'e.json:enemies[2].boss.partner',
        message: 'the partner must not have a partner or raid of its own',
      },
      {
        path: 'e.json:enemies[6].boss.partner',
        message: 'must name a boss of role "boss"',
      },
      { path: 'e.json:enemies[6].boss.inner', message: 'must name a boss of role "boss"' },
      {
        path: 'e.json:enemies[7].boss.inner',
        message: 'the inner-boss chain loops back to this boss',
      },
      {
        path: 'e.json:enemies[8].boss.inner',
        message: 'the inner-boss chain loops back to this boss',
      },
      { path: 'e.json:enemies[9].boss.inner', message: 'must name another boss' },
    ]);
  });

  it('refuses a WARNING for a captain', () => {
    const issues = issuesOf(
      enemiesFile([boss({ role: 'captain' }, 'cap')]),
      stageFile({
        events: [
          { x: 10, type: 'warning', enemy: 'cap' },
          { x: 20, type: 'boss', enemy: 'cap' },
        ],
      }),
    );
    expect(issues).toEqual([
      {
        path: 'stages/s.stage.json:events[0].enemy',
        message: 'is a captain: captains fly in with a "boss" event (no WARNING)',
      },
    ]);
  });
});

describe('core/data — boss-rush stages (M2-09)', () => {
  it('fills a stage’s type and a rush’s defaults', () => {
    const { db, issues } = loadContent([
      enemiesFile([boss({}, 'a'), boss({}, 'b')]),
      stageFile({
        type: 'bossRush',
        rush: [{ enemy: 'a' }, { enemy: 'b', delay: 10, warning: true }],
      }),
    ]);
    expect(issues).toEqual([]);
    const stage = db.stages[0];
    expect(stage.type).toBe('bossRush');
    expect(stage.rush).toEqual([
      { enemy: 'a', enemyId: db.enemyIndex.get('a'), delay: 60, warning: false },
      { enemy: 'b', enemyId: db.enemyIndex.get('b'), delay: 10, warning: true },
    ]);
    const plain = loadContent([stageFile({})]).db.stages[0];
    expect([plain.type, plain.rush]).toEqual(['normal', []]);
  });

  it.each([
    [
      'a boss rush without bosses',
      { type: 'bossRush' },
      [['rush', 'is required for a bossRush stage']],
    ],
    [
      'a rush on a normal stage',
      { rush: [{ enemy: 'a' }] },
      [['rush', 'is only used by a bossRush stage (type "bossRush")']],
    ],
    [
      'an end event in a boss rush',
      { type: 'bossRush', rush: [{ enemy: 'a' }], events: [{ x: 500, type: 'end' }] },
      [['events[0]', 'a bossRush stage has no end event (its last boss ends it)']],
    ],
  ])('reports %s', (_label, over, expected) => {
    expect(issuesOf(enemiesFile([boss({}, 'a')]), stageFile(over))).toEqual(
      expected.map(([path, message]) => ({ path: 'stages/s.stage.json:' + path, message })),
    );
  });

  it('keeps regular enemies and captains out of a rush', () => {
    const issues = issuesOf(
      enemiesFile([boss({ role: 'captain' }, 'cap'), grunt()]),
      stageFile({ type: 'bossRush', rush: [{ enemy: 'cap' }, { enemy: 'grunt' }] }),
    );
    expect(issues).toEqual([
      { path: 'stages/s.stage.json:rush[0].enemy', message: 'must name a boss of role "boss"' },
      { path: 'stages/s.stage.json:rush[1].enemy', message: 'must name a boss of role "boss"' },
    ]);
  });
});
