/**
 * Edge cases and error paths of `loadContent`: header and migration failures, per-kind
 * schema bounds, reference resolution corner cases (prototype names, cross-file refs,
 * interning order), duplicate ids, issue ordering, input immutability and full-database
 * determinism under every file order. Includes the regression test for absent optional
 * references (`sfxId` / `mainId` are `-1`, not missing).
 */
import { describe, expect, it } from 'vitest';
import { MUSIC_CUES, SFX_CUES } from '../../src/events/index.js';
import {
  CONTENT_FORMAT_VERSION,
  CONTENT_MIGRATIONS,
  EMPTY_CONTENT_DB,
  WEAPON_SLOTS,
  isContentKind,
  loadContent,
  type ContentDb,
  type ContentFile,
} from '../../src/data/index.js';

/** Deep copy of a JSON value. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** A valid ship entry. */
const ship = (id = 'kestrel'): Record<string, unknown> => ({
  id,
  name: id.toUpperCase(),
  sprite: 'ships/' + id,
  speeds: [1.5, 2, 2.5, 3, 3.5, 4],
  hurtRadius: 1.5,
  terrainBox: { hw: 5, hh: 3 },
  pickupBox: { hw: 8, hh: 6 },
  margins: { left: 8, right: 8, top: 6, bottom: 6 },
  enterTicks: 40,
  respawnInvulnTicks: 120,
  bankFrames: 1,
});

/** A valid weapon entry. */
const weapon = (id: string, slot = 'main'): Record<string, unknown> => ({
  id,
  slot,
  behavior: 'shot.straight',
  damage: 1,
  speed: 7,
  cap: 2,
  pierce: false,
  sprite: 'shots/basic',
});

/** A valid enemy entry. */
const enemy = (id: string): Record<string, unknown> => ({
  id,
  hp: 1,
  score: 100,
  hurtbox: { hw: 6, hh: 5 },
  script: 'drifter.sine',
  sprite: 'enemies/' + id,
  drop: null,
});

/** A content file of the given kind. */
const file = (path: string, kind: string, body: Record<string, unknown>): ContentFile => ({
  path,
  data: { formatVersion: 1, kind, ...body },
});

/** A valid stage body with the given events. */
const stageBody = (id: string, events: unknown[]): Record<string, unknown> => ({
  id,
  name: 'Zone',
  music: { stage: 'Stage', boss: 'Boss' },
  length: 4096,
  camera: [{ x: 0, speed: 1 }],
  checkpoints: [],
  parallax: [],
  tilemap: null,
  events,
});

/** Loads one file of the given kind and returns the issues. */
const issuesOf = (path: string, kind: string, body: Record<string, unknown>) =>
  loadContent([file(path, kind, body)]).issues;

/** A JSON-comparable dump of a database (Maps become entry lists). */
const dump = (db: ContentDb): string =>
  JSON.stringify(db, (_key, value: unknown) =>
    value instanceof Map ? [...(value as Map<unknown, unknown>).entries()] : value,
  );

/** Every permutation of a list. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const tail of permutations(rest)) out.push([item, ...tail]);
  });
  return out;
}

/** A complete set of the four kinds that resolves without issues. */
const fullSet = (): ContentFile[] => [
  file('player/kestrel.player.json', 'player', { ships: [ship('kestrel'), ship('wren')] }),
  file('weapons/type-a.weapons.json', 'weapons', {
    weapons: [
      { ...weapon('shot.basic'), sfx: 'PlayerShot', params: { angle: 128 } },
      {
        ...weapon('missile.ground', 'missile'),
        behavior: 'missile.slide',
        sprite: 'shots/missile',
      },
    ],
    presets: [
      { id: 'type-a', main: 'shot.basic', missile: 'missile.ground', double: null, laser: null },
    ],
  }),
  file('enemies/zone-a.enemies.json', 'enemies', {
    enemies: [enemy('drifter'), { ...enemy('warden'), script: 'boss.warden' }],
  }),
  file(
    'stages/zone-a.stage.json',
    'stage',
    stageBody('zone-a', [
      { x: 10, type: 'formation', enemy: 'drifter', path: 'sine', y: 40, count: 5, interval: 8 },
      { x: 20, type: 'spawn', enemy: 'warden', y: -8 },
      { x: 30, type: 'warning', enemy: 'warden' },
      { x: 40, type: 'boss', enemy: 'warden' },
      { x: 50, type: 'music', cue: 'Boss' },
      { x: 60, type: 'speed', speed: 0, ramp: 30 },
      { x: 70, type: 'flag', flag: 'lower-path', value: false },
      { x: 70, type: 'end' },
    ]),
  ),
];

describe('core/data loadContent — absent optional references (regression)', () => {
  it('writes -1 into sfxId when a weapon has no sfx field', () => {
    const { db, issues } = loadContent([
      file('weapons/w.weapons.json', 'weapons', { weapons: [weapon('shot.basic')] }),
    ]);
    expect(issues).toEqual([]);
    expect(db.weapons[0]?.sfxId).toBe(-1);
    expect(db.weapons[0]).not.toHaveProperty('sfx');
  });

  it('writes -1 into mainId when a preset omits main', () => {
    const { db, issues } = loadContent([
      file('weapons/w.weapons.json', 'weapons', {
        weapons: [weapon('laser.beam', 'laser')],
        presets: [{ id: 'p', missile: null, double: null, laser: 'laser.beam' }],
      }),
    ]);
    expect(issues).toEqual([]);
    expect(db.weaponPresets[0]).toMatchObject({
      mainId: -1,
      missileId: -1,
      doubleId: -1,
      laserId: 0,
    });
  });

  it('gives every loaded weapon and preset the same set of fields (stable shapes)', () => {
    const { db } = loadContent(fullSet());
    for (const entry of db.weapons) expect(typeof entry.sfxId).toBe('number');
    for (const preset of db.weaponPresets) expect(typeof preset.mainId).toBe('number');
  });
});

describe('core/data loadContent — headers', () => {
  it.each([
    [null, 'x.json', 'must be a JSON object'],
    ['{"kind":"player"}', 'x.json', 'must be a JSON object'],
    [42, 'x.json', 'must be a JSON object'],
    [{ kind: '', formatVersion: 1 }, 'x.json:kind', 'must be a non-empty string'],
    [{ kind: 7, formatVersion: 1 }, 'x.json:kind', 'must be a non-empty string'],
    [{ kind: 'player', formatVersion: -1 }, 'x.json:formatVersion', 'must be an integer >= 0'],
    [{ kind: 'player', formatVersion: 1.5 }, 'x.json:formatVersion', 'must be an integer >= 0'],
    [{ kind: 'player', formatVersion: '1' }, 'x.json:formatVersion', 'must be an integer >= 0'],
  ])('rejects the document %o', (data, path, message) => {
    const { issues, foreign } = loadContent([{ path: 'x.json', data }]);
    expect(issues).toEqual([{ path, message }]);
    expect(foreign).toEqual([]);
  });

  it('checks the kind before the version and stops at the first header problem', () => {
    expect(loadContent([{ path: 'x.json', data: { formatVersion: 'x' } }]).issues).toEqual([
      { path: 'x.json:kind', message: 'must be a non-empty string' },
    ]);
  });

  it('validates the header of foreign files too, but never migrates or validates their body', () => {
    const future: ContentFile = {
      path: 'input/p.json',
      data: { formatVersion: 99, kind: 'input-profiles', x: [] },
    };
    const broken: ContentFile = { path: 'input/q.json', data: { kind: 'input-profiles' } };
    const { issues, foreign } = loadContent([future, broken]);
    expect(foreign).toEqual([future]);
    expect(foreign[0]).toBe(future);
    expect(issues).toEqual([
      { path: 'input/q.json:formatVersion', message: 'must be an integer >= 0' },
    ]);
  });

  it('returns foreign files in path order whatever order they were given in', () => {
    const a: ContentFile = { path: 'a/x.json', data: { formatVersion: 1, kind: 'sfx' } };
    const b: ContentFile = { path: 'b/x.json', data: { formatVersion: 1, kind: 'music' } };
    const c: ContentFile = { path: 'c/x.json', data: { formatVersion: 1, kind: 'fx' } };
    expect(loadContent([c, a, b]).foreign.map((f) => f.path)).toEqual([
      'a/x.json',
      'b/x.json',
      'c/x.json',
    ]);
  });

  it('treats kinds case-sensitively and ignores prototype names', () => {
    expect(isContentKind('Player')).toBe(false);
    expect(isContentKind('toString')).toBe(false);
    expect(isContentKind('')).toBe(false);
    const upper = file('p.json', 'Player', { ships: [ship()] });
    expect(loadContent([upper]).foreign).toEqual([upper]);
  });

  it('reports a body that does not match its declared kind at the file path', () => {
    expect(issuesOf('p.json', 'player', {})).toEqual([
      { path: 'p.json:ships', message: 'is required' },
    ]);
    expect(issuesOf('w.json', 'weapons', { ships: [ship()] })).toEqual([
      { path: 'w.json:weapons', message: 'is required' },
      { path: 'w.json:ships', message: 'unknown field' },
    ]);
  });
});

describe('core/data loadContent — migrations', () => {
  it('rewrites the version even when a migration leaves the old one in place', () => {
    const old = file('e.json', 'enemies', { enemies: [enemy('a')] });
    (old.data as { formatVersion: number }).formatVersion = 0;
    const { db, issues } = loadContent([old], {
      migrations: { enemies: { 0: (data) => ({ ...data, formatVersion: 0 }) } },
    });
    expect(issues).toEqual([]);
    expect(db.enemies).toHaveLength(1);
  });

  it('replaces the default table completely when a table is injected', () => {
    const old = file('e.json', 'enemies', { enemies: [enemy('a')] });
    (old.data as { formatVersion: number }).formatVersion = 0;
    expect(loadContent([old], { migrations: {} }).issues).toEqual([
      { path: 'e.json:formatVersion', message: 'no migration for enemies from formatVersion 0' },
    ]);
  });

  it('validates the migrated body and reports its problems at the file path', () => {
    const old = file('w.json', 'weapons', { weapons: [weapon('a')] });
    (old.data as { formatVersion: number }).formatVersion = 0;
    const { issues } = loadContent([old], {
      migrations: { weapons: { 0: (data) => ({ ...data, kind: 'stage', legacy: true }) } },
    });
    expect(issues).toEqual([
      { path: 'w.json:kind', message: 'must be one of: weapons' },
      { path: 'w.json:legacy', message: 'unknown field' },
    ]);
  });

  it('migrates every kind that existed in format 0 without touching the input', () => {
    // (`tileset` did not exist in format 0 either; the full set has none.)
    const files = fullSet().filter((f) => !f.path.startsWith('player/'));
    for (const f of files) (f.data as { formatVersion: number }).formatVersion = 0;
    const before = clone(files);
    const { db, issues } = loadContent(files);
    expect(issues).toEqual([]);
    expect(db.weapons).toHaveLength(2);
    expect(db.enemies).toHaveLength(2);
    expect(db.stages).toHaveLength(1);
    expect(files).toEqual(before);
  });

  it('ships frozen default migrations that copy their input', () => {
    expect(Object.isFrozen(CONTENT_MIGRATIONS)).toBe(true);
    const step = CONTENT_MIGRATIONS.weapons?.[0];
    const input = { kind: 'weapons', formatVersion: 0 };
    const output = step?.(input);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(CONTENT_FORMAT_VERSION).toBe(1);
  });

  it('rejects every version above the current one, not just the next', () => {
    const future = file('e.json', 'enemies', { enemies: [enemy('a')] });
    (future.data as { formatVersion: number }).formatVersion = 1000;
    expect(loadContent([future]).issues).toEqual([
      {
        path: 'e.json:formatVersion',
        message: 'formatVersion 1000 is newer than this build reads (1)',
      },
    ]);
  });
});

describe('core/data loadContent — per-kind schemas', () => {
  it.each([
    ['speeds', [], 'ships[0].speeds', 'must have at least 1 items'],
    ['speeds', new Array(17).fill(1), 'ships[0].speeds', 'must have at most 16 items'],
    ['speeds', [0], 'ships[0].speeds[0]', 'must be a finite number in 0.1..16'],
    ['hurtRadius', 0.2, 'ships[0].hurtRadius', 'must be a finite number in 0.25..16'],
    ['terrainBox', { hw: 0, hh: 1 }, 'ships[0].terrainBox.hw', 'must be an integer in 1..512'],
    ['pickupBox', { hw: 1, hh: 513 }, 'ships[0].pickupBox.hh', 'must be an integer in 1..512'],
    [
      'margins',
      { left: 0, right: 193, top: 0, bottom: 0 },
      'ships[0].margins.right',
      'must be an integer in 0..192',
    ],
    [
      'margins',
      { left: 0, right: 0, top: 101, bottom: 0 },
      'ships[0].margins.top',
      'must be an integer in 0..100',
    ],
    ['enterTicks', 1.5, 'ships[0].enterTicks', 'must be an integer in 0..600'],
    ['respawnInvulnTicks', 601, 'ships[0].respawnInvulnTicks', 'must be an integer in 0..600'],
    ['bankFrames', 9, 'ships[0].bankFrames', 'must be an integer in 0..8'],
    ['name', '', 'ships[0].name', 'must be a non-empty string'],
    ['sprite', '', 'ships[0].sprite', 'must be a non-empty sprite id'],
  ])('player: rejects %s = %o', (field, value, path, message) => {
    expect(issuesOf('p.json', 'player', { ships: [{ ...ship(), [field]: value }] })).toEqual([
      { path: 'p.json:' + path, message },
    ]);
  });

  it('player: accepts the bounds themselves and a file with no ships is an error', () => {
    const edge = {
      ...ship(),
      speeds: new Array(16).fill(16),
      hurtRadius: 0.25,
      margins: { left: 192, right: 0, top: 100, bottom: 0 },
      enterTicks: 0,
      respawnInvulnTicks: 600,
      bankFrames: 8,
    };
    expect(issuesOf('p.json', 'player', { ships: [edge] })).toEqual([]);
    expect(issuesOf('p.json', 'player', { ships: [] })).toEqual([
      { path: 'p.json:ships', message: 'must have at least 1 items' },
    ]);
  });

  it.each([
    ['slot', 'bomb', 'weapons[0].slot', 'must be one of: ' + WEAPON_SLOTS.join(', ')],
    ['damage', 10000, 'weapons[0].damage', 'must be an integer in 0..9999'],
    ['speed', 64.5, 'weapons[0].speed', 'must be a finite number in 0..64'],
    ['cap', 0, 'weapons[0].cap', 'must be an integer in 1..64'],
    ['pierce', 'yes', 'weapons[0].pierce', 'must be a boolean'],
    ['refireTicks', 0, 'weapons[0].refireTicks', 'must be an integer in 1..600'],
    ['sfx', 3, 'weapons[0].sfx', 'must be a non-empty sfx id'],
    [
      'params',
      { 'max-length': 1 },
      'weapons[0].params.max-length',
      'is not a valid key (must match /^[a-zA-Z][a-zA-Z0-9]*$/)',
    ],
    [
      'params',
      { '1st': 1 },
      'weapons[0].params.1st',
      'is not a valid key (must match /^[a-zA-Z][a-zA-Z0-9]*$/)',
    ],
    ['params', { angle: '128' }, 'weapons[0].params.angle', 'must be a finite number'],
    ['behavior', '', 'weapons[0].behavior', 'must be a non-empty script id'],
  ])('weapons: rejects %s = %o', (field, value, path, message) => {
    expect(
      issuesOf('w.json', 'weapons', { weapons: [{ ...weapon('a'), [field]: value }] }),
    ).toEqual([{ path: 'w.json:' + path, message }]);
  });

  it('weapons: every slot is accepted and presets are optional', () => {
    const weapons = WEAPON_SLOTS.map((slot) => weapon('w.' + slot, slot));
    const { db, issues } = loadContent([file('w.json', 'weapons', { weapons })]);
    expect(issues).toEqual([]);
    expect(db.weapons.map((w) => w.slot)).toEqual([...WEAPON_SLOTS]);
    expect(db.weaponPresets).toEqual([]);
  });

  it('weapons: a preset must list missile, double and laser (null allowed) but may omit main', () => {
    expect(
      issuesOf('w.json', 'weapons', { weapons: [weapon('a')], presets: [{ id: 'p', main: null }] }),
    ).toEqual([
      { path: 'w.json:presets[0].missile', message: 'is required' },
      { path: 'w.json:presets[0].double', message: 'is required' },
      { path: 'w.json:presets[0].laser', message: 'is required' },
    ]);
  });

  it.each([
    ['hp', 0, 'enemies[0].hp', 'must be an integer in 1..100000'],
    ['score', -1, 'enemies[0].score', 'must be an integer in 0..1000000'],
    ['hurtbox', { hw: 1 }, 'enemies[0].hurtbox.hh', 'is required'],
    ['drop', '', 'enemies[0].drop', 'must be a non-empty string'],
    ['rank', { fireRate: 9 }, 'enemies[0].rank.fireRate', 'must be a finite number in 0..8'],
    ['rank', { spread: 1 }, 'enemies[0].rank.spread', 'unknown field'],
    ['script', null, 'enemies[0].script', 'must be a non-empty script id'],
  ])('enemies: rejects %s = %o', (field, value, path, message) => {
    expect(issuesOf('e.json', 'enemies', { enemies: [{ ...enemy('a'), [field]: value }] })).toEqual(
      [{ path: 'e.json:' + path, message }],
    );
  });

  it('enemies: rank is optional, its fields too, and drops are plain strings (not refs)', () => {
    const { db, issues } = loadContent([
      file('e.json', 'enemies', {
        enemies: [
          { ...enemy('a'), rank: {} },
          { ...enemy('b'), rank: { bulletSpeed: 8 }, drop: 'item:red' },
        ],
      }),
    ]);
    expect(issues).toEqual([]);
    expect(db.enemies[1]).toMatchObject({ drop: 'item:red', rank: { bulletSpeed: 8 } });
    expect(db.enemies[1]).not.toHaveProperty('dropId');
  });

  it('stage: validates every event variant and resolves their references', () => {
    const { db, issues } = loadContent(fullSet());
    expect(issues).toEqual([]);
    const events = db.stages[0]?.events ?? [];
    const warden = db.enemyIndex.get('warden');
    expect(events.map((e) => e.type)).toEqual([
      'formation',
      'spawn',
      'warning',
      'boss',
      'music',
      'speed',
      'flag',
      'end',
    ]);
    expect(events[0]).toMatchObject({
      enemyId: db.enemyIndex.get('drifter'),
      count: 5,
      interval: 8,
      y: 40,
    });
    for (const e of events.slice(1, 4)) expect(e).toMatchObject({ enemyId: warden });
    expect(events[4]).toMatchObject({ cueId: MUSIC_CUES.Boss });
    expect(events[6]).toMatchObject({ flag: 'lower-path', flagId: 0, value: false });
    expect(db.stages[0]?.flagNames).toEqual(['lower-path']);
    expect(db.stages[0]?.music).toMatchObject({
      stageId: MUSIC_CUES.Stage,
      bossId: MUSIC_CUES.Boss,
    });
  });

  it.each([
    [
      { x: 0, type: 'midboss', enemy: 'a' },
      'events[0].type',
      'type must be one of: spawn, formation, warning, boss, music, speed, flag, end',
    ],
    [
      { x: 0, type: 'branch' },
      'events[0].type',
      'type must be one of: spawn, formation, warning, boss, music, speed, flag, end',
    ],
    [{ x: -1, type: 'end' }, 'events[0].x', 'must be a finite number in 0..1000000'],
    [{ x: 0, type: 'speed', speed: 17 }, 'events[0].speed', 'must be a finite number in 0..16'],
    [
      { x: 0, type: 'formation', enemy: 'a', count: 0, interval: 4 },
      'events[0].count',
      'must be an integer in 1..64',
    ],
    [{ x: 0, type: 'formation', enemy: 'a', count: 3 }, 'events[0].interval', 'is required'],
    [{ x: 0, type: 'spawn', enemy: 'a', count: 3 }, 'events[0].count', 'unknown field'],
    [
      { x: 0, type: 'flag', flag: 'Upper Path' },
      'events[0].flag',
      'must be a string of length in 1..64 matching /^[a-z][a-z0-9-]*$/',
    ],
    [
      { x: 0, type: 'spawn', enemy: 'a', y: 321 },
      'events[0].y',
      'must be a finite number in -64..320',
    ],
    [{ x: 0, type: 'boss', enemy: 'a', path: 'p' }, 'events[0].path', 'unknown field'],
    [{ x: 0, type: 'music' }, 'events[0].cue', 'is required'],
  ])('stage: rejects the event %o', (event, path, message) => {
    const issues = loadContent([
      file('s.json', 'stage', stageBody('s', [event])),
      file('e.json', 'enemies', { enemies: [enemy('a')] }),
    ]).issues;
    expect(issues).toEqual([{ path: 's.json:' + path, message }]);
  });

  it('stage: checks the camera, tilemap and parallax blocks', () => {
    expect(issuesOf('s.json', 'stage', { ...stageBody('s', []), camera: [] })).toEqual([
      { path: 's.json:camera', message: 'must have at least 1 items' },
    ]);
    expect(
      issuesOf('s.json', 'stage', {
        ...stageBody('s', []),
        camera: [{ x: 0, speed: 1, lock: 'boss' }],
        tilemap: { tileSize: 16, tileset: 't', rowsTall: 25 },
        parallax: [{ layer: 'near', sprite: 'bg/x', factor: 5, y: 0, spacing: 4 }],
        length: 0,
      }),
    ).toEqual([
      { path: 's.json:length', message: 'must be an integer in 1..1000000' },
      { path: 's.json:camera[0].lock', message: 'must be a boolean' },
      { path: 's.json:parallax[0].layer', message: 'must be one of: far, mid' },
      { path: 's.json:parallax[0].factor', message: 'must be a finite number in 0..4' },
      { path: 's.json:parallax[0].spacing', message: 'must be an integer in 8..1024' },
      { path: 's.json:tilemap.tileSize', message: 'must be an integer in 8..8' },
      // References of an invalid file are still resolved (one load reports everything).
      { path: 's.json:tilemap.tileset', message: 'unknown tileset id "t"' },
    ]);
    const { db, issues } = loadContent([
      file('s.json', 'stage', {
        ...stageBody('s', []),
        tilemap: { tileSize: 8, tileset: 't', rowsTall: 25 },
      }),
    ]);
    expect(issues).toEqual([{ path: 's.json:tilemap.tileset', message: 'unknown tileset id "t"' }]);
    expect(db.stages[0]?.tilemap).toEqual({
      tileSize: 8,
      tileset: 't',
      tilesetId: -1,
      rowsTall: 25,
    });
    expect(db.stages[0]?.terrain).toBeNull();
  });
});

describe('core/data loadContent — reference resolution', () => {
  it('resolves every sfx and music cue name to its registry id', () => {
    const sfxNames = Object.keys(SFX_CUES);
    const weapons = sfxNames.map((cue, i) => ({ ...weapon('w' + String(i)), sfx: cue }));
    const musicNames = Object.keys(MUSIC_CUES);
    const events = musicNames.map((cue, i) => ({ x: i, type: 'music', cue }));
    const { db, issues } = loadContent([
      file('w.json', 'weapons', { weapons }),
      file('s.json', 'stage', stageBody('s', events)),
    ]);
    expect(issues).toEqual([]);
    expect(db.weapons.map((w) => w.sfxId)).toEqual(
      sfxNames.map((cue) => (SFX_CUES as Record<string, number>)[cue]),
    );
    expect(db.stages[0]?.events.map((e) => ('cueId' in e ? e.cueId : -2))).toEqual(
      musicNames.map((cue) => (MUSIC_CUES as Record<string, number>)[cue]),
    );
  });

  it.each([['toString'], ['constructor'], ['__proto__'], ['playershot']])(
    'does not resolve the cue name %s (own registry keys only, case-sensitive)',
    (cue) => {
      const { db, issues } = loadContent([
        file('w.json', 'weapons', { weapons: [{ ...weapon('a'), sfx: cue }] }),
        file('s.json', 'stage', stageBody('s', [{ x: 0, type: 'music', cue }])),
      ]);
      expect(issues).toEqual([
        { path: 's.json:events[0].cue', message: 'unknown music id "' + cue + '"' },
        { path: 'w.json:weapons[0].sfx', message: 'unknown sfx id "' + cue + '"' },
      ]);
      expect(db.weapons[0]?.sfxId).toBe(-1);
    },
  );

  it('does not resolve enemy or weapon ids through the prototype', () => {
    const { issues } = loadContent([
      file('w.json', 'weapons', {
        weapons: [weapon('a')],
        presets: [{ id: 'p', missile: 'toString', double: null, laser: null }],
      }),
      file('s.json', 'stage', stageBody('s', [{ x: 0, type: 'boss', enemy: 'constructor' }])),
    ]);
    expect(issues.map((issue) => issue.message)).toEqual([
      'unknown enemy id "constructor"',
      'unknown weapon id "toString"',
    ]);
  });

  it('resolves references across files and to entries of any list position', () => {
    const { db, issues } = loadContent([
      file('weapons/a.weapons.json', 'weapons', { weapons: [weapon('one'), weapon('two')] }),
      file('weapons/b.weapons.json', 'weapons', {
        weapons: [weapon('three', 'laser')],
        presets: [{ id: 'p', main: 'two', missile: null, double: 'one', laser: 'three' }],
      }),
    ]);
    expect(issues).toEqual([]);
    expect(db.weaponPresets[0]).toMatchObject({ mainId: 1, doubleId: 0, laserId: 2 });
    expect(db.weapons[2]?.id).toBe('three');
  });

  it('reports a reference to an entry of a file that failed validation', () => {
    const { issues } = loadContent([
      file('weapons/a.weapons.json', 'weapons', { weapons: [{ ...weapon('one'), cap: 0 }] }),
      file('weapons/b.weapons.json', 'weapons', {
        weapons: [weapon('two')],
        presets: [{ id: 'p', missile: 'one', double: null, laser: null }],
      }),
    ]);
    expect(issues).toEqual([
      { path: 'weapons/a.weapons.json:weapons[0].cap', message: 'must be an integer in 1..64' },
      { path: 'weapons/b.weapons.json:presets[0].missile', message: 'unknown weapon id "one"' },
    ]);
  });

  it('interns a sprite or script used many times once, in code-unit order', () => {
    const { db } = loadContent([
      file('e.json', 'enemies', {
        enemies: [
          { ...enemy('a'), sprite: 'b', script: 'Zed' },
          { ...enemy('b'), sprite: 'B', script: 'alpha' },
          { ...enemy('c'), sprite: 'b', script: 'Zed' },
        ],
      }),
    ]);
    expect(db.sprites.names).toEqual(['B', 'b']);
    expect(db.scripts.names).toEqual(['Zed', 'alpha']);
    expect(db.enemies.map((e) => e.spriteId)).toEqual([1, 0, 1]);
    expect(db.enemies.map((e) => e.scriptId)).toEqual([0, 1, 0]);
    expect(db.sprites.index.size).toBe(2);
  });

  it('shares one script table between weapon behaviours and enemy scripts', () => {
    const { db } = loadContent([
      file('w.json', 'weapons', { weapons: [{ ...weapon('a'), behavior: 'shared.id' }] }),
      file('e.json', 'enemies', { enemies: [{ ...enemy('a'), script: 'shared.id' }] }),
    ]);
    expect(db.scripts.names).toEqual(['shared.id']);
    expect(db.weapons[0]?.behaviorId).toBe(0);
    expect(db.enemies[0]?.scriptId).toBe(0);
  });

  it('keeps the interned index of a script the engine does not know, and reports each use', () => {
    const { db, issues } = loadContent(
      [file('e.json', 'enemies', { enemies: [enemy('a'), enemy('b')] })],
      { knownScripts: [] },
    );
    expect(issues.map((issue) => issue.path)).toEqual([
      'e.json:enemies[0].script',
      'e.json:enemies[1].script',
    ]);
    expect(db.enemies.map((e) => e.scriptId)).toEqual([0, 0]);
  });

  it('checks known scripts for weapon behaviours but never for sprites', () => {
    const { issues } = loadContent([file('w.json', 'weapons', { weapons: [weapon('a')] })], {
      knownScripts: new Set(['ships/kestrel']),
    });
    expect(issues).toEqual([
      { path: 'w.json:weapons[0].behavior', message: 'unknown script id "shot.straight"' },
    ]);
  });
});

describe('core/data loadContent — duplicates and partial loads', () => {
  it('reports a duplicate inside one file at the later entry', () => {
    const { db, issues } = loadContent([
      file('e.json', 'enemies', { enemies: [enemy('a'), enemy('b'), enemy('a')] }),
    ]);
    expect(issues).toEqual([{ path: 'e.json:enemies[2].id', message: 'duplicate enemy id "a"' }]);
    expect(db.enemies.map((e) => e.id)).toEqual(['a', 'b']);
    expect(db.enemyIndex.get('b')).toBe(1);
  });

  it('reports duplicate ships across player files', () => {
    const { db, issues } = loadContent([
      file('player/b.player.json', 'player', { ships: [ship('kestrel')] }),
      file('player/a.player.json', 'player', { ships: [ship('kestrel'), ship('wren')] }),
    ]);
    expect(issues).toEqual([
      { path: 'player/b.player.json:ships[0].id', message: 'duplicate ship id "kestrel"' },
    ]);
    expect(db.ships.map((s) => s.id)).toEqual(['kestrel', 'wren']);
  });

  it('allows the same id in different kinds', () => {
    const { issues } = loadContent([
      file('w.json', 'weapons', {
        weapons: [weapon('same')],
        presets: [{ id: 'same', missile: null, double: null, laser: null }],
      }),
      file('e.json', 'enemies', { enemies: [enemy('same')] }),
      file('s.json', 'stage', stageBody('same', [])),
    ]);
    expect(issues).toEqual([]);
  });

  it('skips a whole file when one of its entries is invalid', () => {
    const { db, issues } = loadContent([
      file('e.json', 'enemies', { enemies: [enemy('a'), { ...enemy('b'), hp: 0 }] }),
    ]);
    expect(issues).toHaveLength(1);
    expect(db.enemies).toEqual([]);
    expect(db.enemyIndex.size).toBe(0);
  });

  it('lists validation issues of all files first, then unresolved references', () => {
    const { issues } = loadContent([
      file('a.json', 'stage', stageBody('s', [{ x: 0, type: 'boss', enemy: 'ghost' }])),
      file('b.json', 'enemies', { enemies: [{ ...enemy('x'), hp: 0 }] }),
    ]);
    expect(issues).toEqual([
      { path: 'b.json:enemies[0].hp', message: 'must be an integer in 1..100000' },
      { path: 'a.json:events[0].enemy', message: 'unknown enemy id "ghost"' },
    ]);
  });
});

describe('core/data loadContent — purity and determinism', () => {
  it('returns an empty database for no files', () => {
    const { db, issues, foreign } = loadContent([]);
    expect(issues).toEqual([]);
    expect(foreign).toEqual([]);
    expect(dump(db)).toBe(dump(EMPTY_CONTENT_DB));
  });

  it('never mutates the files it is given and can load them again', () => {
    const files = fullSet();
    const before = clone(files);
    const first = loadContent(files);
    expect(files).toEqual(before);
    const second = loadContent(files);
    expect(dump(second.db)).toBe(dump(first.db));
    expect(second.db.stages[0]).not.toBe(first.db.stages[0]);
  });

  it('builds a byte-identical database for every order of the input files', () => {
    const files = fullSet();
    const expected = dump(loadContent(files).db);
    const orders = permutations(files);
    expect(orders).toHaveLength(24);
    for (const order of orders) expect(dump(loadContent(order).db)).toBe(expected);
  });

  it('reports the same issues in the same order for every order of the input files', () => {
    const files = fullSet();
    (files[1]?.data as { presets: { laser: string }[] }).presets[0].laser = 'missing';
    (files[2]?.data as { enemies: { hp: number }[] }).enemies[1].hp = 0;
    const expected = loadContent(files).issues;
    expect(expected.length).toBeGreaterThan(1);
    for (const order of permutations(files)) expect(loadContent(order).issues).toEqual(expected);
  });

  it('loads a large set quickly with every index consistent', () => {
    const enemies = Array.from({ length: 2000 }, (_, i) => enemy('e' + String(i).padStart(4, '0')));
    const { db, issues } = loadContent([file('e.json', 'enemies', { enemies })]);
    expect(issues).toEqual([]);
    expect(db.enemies).toHaveLength(2000);
    expect(db.sprites.names).toHaveLength(2000);
    for (let i = 0; i < db.enemies.length; i++) {
      const entry = db.enemies[i];
      expect(db.enemyIndex.get(entry?.id ?? '')).toBe(i);
      expect(db.sprites.names[entry?.spriteId ?? -1]).toBe(entry?.sprite);
    }
  });

  it('keeps the shared empty database empty and frozen', () => {
    expect(Object.isFrozen(EMPTY_CONTENT_DB.ships)).toBe(true);
    expect(Object.isFrozen(EMPTY_CONTENT_DB.sprites)).toBe(true);
    expect(Object.isFrozen(EMPTY_CONTENT_DB.sprites.names)).toBe(true);
    for (const table of [EMPTY_CONTENT_DB.scripts, EMPTY_CONTENT_DB.sprites]) {
      expect(table.names).toEqual([]);
      expect(table.index.size).toBe(0);
    }
    for (const index of [
      EMPTY_CONTENT_DB.shipIndex,
      EMPTY_CONTENT_DB.weaponIndex,
      EMPTY_CONTENT_DB.weaponPresetIndex,
      EMPTY_CONTENT_DB.enemyIndex,
      EMPTY_CONTENT_DB.stageIndex,
    ]) {
      expect(index.size).toBe(0);
    }
  });

  it.each([[null], [{}], ['player/kestrel.player.json'], [42]])(
    'throws a TypeError for the non-array argument %o',
    (files) => {
      expect(() => loadContent(files as unknown as ContentFile[])).toThrow(
        /files must be an array/,
      );
    },
  );
});
