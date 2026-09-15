/**
 * `core` — the content-driven parts of plan M3-01, on small test content: the score-milking cap
 * (`ScoringRules.repeatKills` / `repeatPercent` — enemies a script or a boss spawned score less
 * after the cap, the stage's own spawns never), the loops' remix (`StageSpec.remix` merged into the
 * timeline from loop 2 by `stageForLoop`; the runner's `minLoop` / `maxLoop` filter; the loader's
 * checks), the revenge bullets of every kill from loop 2, the config's new fields and the save's
 * unlocks and assisted rows.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAY_OPTIONS,
  GAME_SPEEDS,
  MAX_LOOP,
  resolveGameConfig,
  resolveUserOptions,
  userGameOverrides,
  withUserGameOptions,
  type GameConfig,
} from '../../src/config/index.js';
import {
  loadContent,
  stageEventInLoop,
  stageForLoop,
  type ContentDb,
  type ContentFile,
} from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import {
  createHiScoreEntry,
  createSaveStore,
  parseSave,
  serializeSave,
} from '../../src/save/index.js';
import { DEFAULT_SCORING_RULES } from '../../src/scoring/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

/** One test enemy (idle, 100 points, killed by one hit). */
const ENEMY = {
  id: 'target',
  hp: 1,
  score: 100,
  hurtbox: { hw: 4, hh: 4 },
  script: 'test.idle',
  sprite: 'enemies/drifter',
  drop: null,
};

/**
 * Loads the test content: the KESTREL, a target enemy, a scoring rule and stages.
 *
 * @param scoring - The scoring section (`null`: none — the built-in rules).
 * @param stage - Extra fields of the open-space stage `t` (its events, remix …).
 * @returns The DB and the issues.
 */
function content(
  scoring: Record<string, number> | null,
  stage: Record<string, unknown> = {},
): { db: ContentDb; issues: readonly { path: string; message: string }[] } {
  const files: ContentFile[] = [
    shipped('player/kestrel.player.json'),
    {
      path: 'enemies/t.enemies.json',
      data: { formatVersion: 1, kind: 'enemies', enemies: [ENEMY] },
    },
    {
      path: 'stages/t.stage.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 't',
        name: 'T',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 4000,
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [{ x: 0 }],
        parallax: [],
        tilemap: null,
        events: [],
        ...stage,
      },
    },
  ];
  if (scoring !== null) {
    files.push({ path: 'rules/s.rules.json', data: { formatVersion: 1, kind: 'rules', scoring } });
  }
  const { db, issues } = loadContent(files, { knownScripts: ['test.idle'] });
  return { db, issues };
}

/**
 * Kills every live enemy for player 1 and runs a tick (the kills are credited).
 *
 * @param world - The World.
 * @returns The points of the kills.
 */
function killAll(world: World): number {
  const before = world.scoring.board.scores[0].score;
  for (const enemy of world.enemies.enemies) world.enemies.kill(enemy, 0);
  stepWorld(world, createInputSnapshot());
  return world.scoring.board.scores[0].score - before;
}

/**
 * A World of the test content.
 *
 * @param db - Content.
 * @param overrides - Config fields.
 * @returns The World (its ship flown in).
 */
function world(db: ContentDb, overrides: Partial<GameConfig> = {}): World {
  const w = createWorld(resolveGameConfig({ seed: 2, stage: 't', ...overrides }), db);
  for (let t = 0; t < 60; t++) stepWorld(w, createInputSnapshot());
  return w;
}

describe('core score-milking cap (M3-01)', () => {
  it('caps the kills of script- and boss-spawned enemies of a kind, per World', () => {
    const { db, issues } = content({ bulletCancel: 10, repeatKills: 4, repeatPercent: 10 });
    expect(issues).toEqual([]);
    expect(db.scoring).toEqual({ bulletCancel: 10, repeatKills: 4, repeatPercent: 10 });
    const w = world(db);
    // Six spawned "children": four at full score, then 10 %.
    for (let i = 0; i < 6; i++) w.enemies.spawn(0, w.camera.x + 200, 40 + i * 20);
    expect(killAll(w)).toBe(4 * 100 + 2 * 10);
    // The count lasts the whole World.
    w.enemies.spawn(0, w.camera.x + 200, 60);
    expect(killAll(w)).toBe(10);
  });

  it('never caps the stage timeline`s own spawns, nor kills nobody is credited with', () => {
    const events: Record<string, unknown>[] = [];
    for (let i = 0; i < 8; i++)
      events.push({ x: 10, type: 'spawn', enemy: 'target', y: 20 + i * 20 });
    const { db } = content({ bulletCancel: 10, repeatKills: 2, repeatPercent: 0 }, { events });
    const w = world(db);
    expect(killAll(w)).toBe(8 * 100);
    // A 0 cap means none at all; the built-in rules cap at 40.
    const none = world(content({ bulletCancel: 10, repeatKills: 0 }).db);
    for (let i = 0; i < 6; i++) none.enemies.spawn(0, none.camera.x + 200, 40 + i * 20);
    expect(killAll(none)).toBe(600);
    expect(DEFAULT_SCORING_RULES).toMatchObject({ repeatKills: 40, repeatPercent: 10 });
  });
});

describe('core loops: the remix and the runner`s loop filter (M3-01)', () => {
  const remix = [
    { x: 100, type: 'spawn', enemy: 'target', y: 50 },
    { x: 100, type: 'formation', enemy: 'target', count: 2, interval: 5, y: 80, drop: null },
  ];
  const events = [
    { x: 100, type: 'spawn', enemy: 'target', y: 120 },
    { x: 300, type: 'spawn', enemy: 'target', y: 130, maxLoop: 1 },
    { x: 300, type: 'spawn', enemy: 'target', y: 140, minLoop: 3 },
  ];

  it('merges the remix into the timeline from loop 2, after the events of its x', () => {
    const { db, issues } = content(null, { events, remix });
    expect(issues).toEqual([]);
    const stage = db.stages[db.stageIndex.get('t')!];
    expect(stage.remix).toHaveLength(2);
    expect(stageForLoop(stage, 1)).toBe(stage);
    const two = stageForLoop(stage, 2);
    expect(two.events.map((e) => [e.x, e.type])).toEqual([
      [100, 'spawn'],
      [100, 'spawn'],
      [100, 'formation'],
      [300, 'spawn'],
      [300, 'spawn'],
    ]);
    expect(stageEventInLoop(stage.events[1], 1)).toBe(true);
    expect(stageEventInLoop(stage.events[1], 2)).toBe(false);
    expect(stageEventInLoop(stage.events[2], 2)).toBe(false);
    expect(stageEventInLoop(stage.events[2], MAX_LOOP)).toBe(true);
    // The Worlds: loop 1 spawns 2 (x 100, the loop-1 one at 300); loop 2: 1 + 1 + 2 remix;
    // loop 3: 1 + 3 remix + the loop-3 one.
    const spawned = (loop: number): number => {
      const w = createWorld(resolveGameConfig({ seed: 1, stage: 't', loop }), db);
      for (let t = 0; t < 420; t++) stepWorld(w, createInputSnapshot());
      return w.enemies.stats.spawned;
    };
    expect([spawned(1), spawned(2), spawned(3)]).toEqual([2, 4, 5]);
  });

  it('refuses a remix it cannot play', () => {
    const bad = (entry: Record<string, unknown>): string[] =>
      content(null, { remix: [entry] }).issues.map((i) => i.path + ': ' + i.message);
    expect(bad({ x: 5, type: 'end' }).join()).toContain('remix[0].type');
    expect(bad({ x: 5000, type: 'spawn', enemy: 'target' }).join()).toContain('remix[0].x');
    expect(bad({ x: 5, type: 'spawn', enemy: 'target', minLoop: 3, maxLoop: 2 }).join()).toContain(
      'remix[0].maxLoop',
    );
    const unsorted = content(null, {
      remix: [
        { x: 50, type: 'spawn', enemy: 'target' },
        { x: 10, type: 'spawn', enemy: 'target' },
      ],
    });
    expect(unsorted.issues.map((i) => i.path).join()).toContain('remix[1].x');
    const events2 = content(null, {
      events: [{ x: 5, type: 'spawn', enemy: 'target', minLoop: 4, maxLoop: 1 }],
    });
    expect(events2.issues.map((i) => i.path).join()).toContain('events[0].maxLoop');
  });

  it('from loop 2 every kill fires a revenge bullet, whatever the rank', () => {
    const { db } = content(null);
    for (const loop of [1, 2]) {
      const w = world(db, { loop, rankGrowth: 0 });
      w.enemies.spawn(0, w.camera.x + 200, 100);
      stepWorld(w, createInputSnapshot());
      expect(w.bullets.count).toBe(0);
      for (const enemy of w.enemies.enemies) w.enemies.kill(enemy, 0);
      expect(w.bullets.count, `loop ${loop}`).toBe(loop === 1 ? 0 : 1);
    }
  });
});

describe('core config and save additions (M3-01)', () => {
  it('validates the loop, the clock and the assists; lives up to nine', () => {
    const config = resolveGameConfig({ loop: 3, timeLimit: 600, invincible: true });
    expect([config.loop, config.timeLimit, config.invincible, config.optionRecovery]).toEqual([
      3,
      600,
      true,
      false,
    ]);
    expect(resolveGameConfig({ startingLives: 9 }).startingLives).toBe(9);
    expect(() => resolveGameConfig({ loop: 0 })).toThrow(RangeError);
    expect(() => resolveGameConfig({ loop: MAX_LOOP + 1 })).toThrow(RangeError);
    expect(() => resolveGameConfig({ timeLimit: -1 })).toThrow(RangeError);
    expect(() => resolveGameConfig({ invincible: 1 as unknown as boolean })).toThrow(RangeError);
    expect(() => resolveGameConfig({ optionRecovery: 'yes' as unknown as boolean })).toThrow(
      RangeError,
    );
  });

  it('reads the assists and feel defensively and folds the sim-affecting ones into configs', () => {
    expect(resolveUserOptions({}).play).toEqual(DEFAULT_PLAY_OPTIONS);
    expect(GAME_SPEEDS).toEqual([100, 75, 50]);
    const options = resolveUserOptions({
      play: { speed: 75, invincible: true, optionRecovery: true, rumble: false },
    });
    expect(options.play).toEqual({
      speed: 75,
      invincible: true,
      optionRecovery: true,
      rumble: false,
    });
    expect(resolveUserOptions({ play: { speed: 60, invincible: 'y', rumble: 0 } }).play).toEqual(
      DEFAULT_PLAY_OPTIONS,
    );
    expect(userGameOverrides(options)).toMatchObject({ invincible: true, optionRecovery: true });
    const base = resolveGameConfig();
    const armed = withUserGameOptions(base, options);
    expect([armed.invincible, armed.optionRecovery]).toEqual([true, true]);
    // The game speed is not sim config: nothing to fold without the other two.
    const speedOnly = resolveUserOptions({ play: { speed: 50 } });
    expect(withUserGameOptions(base, speedOnly)).toBe(base);
  });

  it('keeps unlocks and assisted rows, written only when set', async () => {
    const store = createSaveStore(null);
    expect(store.unlocked('extraEdit')).toBe(false);
    expect(serializeSave(store.data)).not.toContain('unlocks');
    expect(store.unlock('extraEdit')).toBe(true);
    expect(store.unlock('extraEdit')).toBe(false);
    expect(store.unlocked('loop2')).toBe(false);
    store.recordScore('meter-normal-bossrush', createHiScoreEntry(5000, { assisted: true }));
    store.recordScore('meter-normal-caravan', createHiScoreEntry(4000));
    const text = serializeSave(store.data);
    expect(text).toContain('"unlocks":{"extraEdit":true,"loop2":false}');
    const back = parseSave(text);
    expect(back.status).toBe('ok');
    expect(back.data.unlocks).toEqual({ extraEdit: true, loop2: false });
    expect(back.data.hiScores['meter-normal-bossrush'][0].assisted).toBe(true);
    expect(back.data.hiScores['meter-normal-caravan'][0]).not.toHaveProperty('assisted');
    expect(serializeSave(back.data)).toBe(text);
    // Garbage unlocks are nothing unlocked.
    expect(parseSave('{"version":2,"unlocks":{"extraEdit":"yes"}}').data.unlocks).toBeUndefined();
    expect(await store.flush()).toBe(false); // memory only
  });
});
