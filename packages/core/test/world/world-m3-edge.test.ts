/**
 * `core` — edge cases of plan M3-01's simulation rules beyond `world-m3.test.ts` and
 * `world-m3-content.test.ts`: the loops' bullet speed at every loop and its cap, `stageForLoop` /
 * `stageEventInLoop` at their bounds, the caravan clock's limits (the config's range, the states it
 * runs in, the bonus's whole seconds, the players it pays), the score-milking cap's arithmetic
 * (floored to tens, 0 % and 100 %, kills nobody is credited with, the rules' bounds) and the new
 * hi-score tables' keys.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAX_LOOP,
  MAX_TIME_LIMIT,
  resolveGameConfig,
  type GameConfig,
} from '../../src/config/index.js';
import {
  EMPTY_CONTENT_DB,
  loadContent,
  stageEventInLoop,
  stageForLoop,
  type ContentDb,
  type ContentFile,
} from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import {
  LOOP_BULLET_SPEED_MAX,
  LOOP_BULLET_SPEED_STEP,
  loopBulletSpeedScale,
} from '../../src/rank/index.js';
import { HI_SCORE_MODES, hiScoreModeKey } from '../../src/save/index.js';
import { MAX_REPEAT_KILLS } from '../../src/scoring/index.js';
import { hudClockSeconds } from '../../src/ui/index.js';
import { CARAVAN_TIME_BONUS, createWorld, stepWorld, type World } from '../../src/world/index.js';

const INPUT = createInputSnapshot();

/**
 * Steps a World.
 *
 * @param w - The World.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  for (let t = 0; t < ticks; t++) stepWorld(w, INPUT);
}

/**
 * A free-flight World.
 *
 * @param overrides - Config fields.
 * @returns The World.
 */
function world(overrides: Partial<GameConfig> = {}): World {
  return createWorld(resolveGameConfig({ seed: 12, ...overrides }), EMPTY_CONTENT_DB);
}

/**
 * Loads the KESTREL, one enemy of a score and an open stage `t`, with a scoring section.
 *
 * @param score - The enemy's score.
 * @param scoring - The scoring section (`null`: none).
 * @param stage - More fields of the stage.
 * @returns The DB and the issues' paths.
 */
function content(
  score: number,
  scoring: Record<string, number> | null,
  stage: Record<string, unknown> = {},
): { db: ContentDb; issues: string[] } {
  const files: ContentFile[] = [
    {
      path: 'player/kestrel.player.json',
      data: JSON.parse(
        readFileSync(
          new URL('../../../../content/player/kestrel.player.json', import.meta.url),
          'utf8',
        ),
      ) as unknown,
    },
    {
      path: 'enemies/t.enemies.json',
      data: {
        formatVersion: 1,
        kind: 'enemies',
        enemies: [
          {
            id: 'target',
            hp: 1,
            score,
            hurtbox: { hw: 4, hh: 4 },
            script: 'test.idle',
            sprite: 'enemies/drifter',
            drop: null,
          },
        ],
      },
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
  return { db, issues: issues.map((i) => i.path) };
}

/**
 * Spawns script children of the target and kills them all, for a player or nobody.
 *
 * @param w - The World.
 * @param count - Enemies to spawn.
 * @param by - The killer (-1 = nobody).
 * @returns Player 1's points from the kills.
 */
function spawnAndKill(w: World, count: number, by = 0): number {
  for (let i = 0; i < count; i++) w.enemies.spawn(0, w.camera.x + 200, 30 + i * 16);
  const before = w.scoring.board.scores[0].score;
  for (const enemy of w.enemies.enemies) w.enemies.kill(enemy, by);
  stepWorld(w, INPUT);
  return w.scoring.board.scores[0].score - before;
}

describe('core/rank the loops` bullet speed (M3-01)', () => {
  it('adds a step a loop from loop 2 up to its cap', () => {
    expect([LOOP_BULLET_SPEED_STEP, LOOP_BULLET_SPEED_MAX]).toEqual([0.15, 1.6]);
    for (const loop of [Number.NaN, -3, 0, 1, 1.9]) expect(loopBulletSpeedScale(loop)).toBe(1);
    expect(loopBulletSpeedScale(2)).toBeCloseTo(1.15, 12);
    expect(loopBulletSpeedScale(2.7)).toBeCloseTo(1.15, 12); // whole loops only
    expect(loopBulletSpeedScale(3)).toBeCloseTo(1.3, 12);
    expect(loopBulletSpeedScale(4)).toBeCloseTo(1.45, 12);
    expect(loopBulletSpeedScale(5)).toBeCloseTo(1.6, 12);
    for (let loop = 5; loop <= MAX_LOOP; loop++) {
      expect(loopBulletSpeedScale(loop)).toBeLessThanOrEqual(LOOP_BULLET_SPEED_MAX);
    }
    expect(loopBulletSpeedScale(MAX_LOOP)).toBe(LOOP_BULLET_SPEED_MAX);
    // Every loop the config allows builds a World; the bullets never slow down with the loop.
    let last = 0;
    for (let loop = 1; loop <= MAX_LOOP; loop++) {
      const w = world({ loop, rankGrowth: 0 });
      expect(w.bullets.speedScale, `loop ${loop}`).toBeGreaterThanOrEqual(last);
      last = w.bullets.speedScale;
    }
  });
});

describe('core/data stageForLoop / stageEventInLoop bounds (M3-01)', () => {
  it('leaves a stage without a remix alone and appends a remix past the last event', () => {
    const plain = content(100, null, {
      events: [{ x: 50, type: 'spawn', enemy: 'target', y: 20 }],
    }).db;
    const stage = plain.stages[plain.stageIndex.get('t')!];
    for (const loop of [1, 2, MAX_LOOP, Number.NaN]) expect(stageForLoop(stage, loop)).toBe(stage);
    const late = content(100, null, {
      events: [{ x: 50, type: 'spawn', enemy: 'target', y: 20 }],
      remix: [
        { x: 50, type: 'spawn', enemy: 'target', y: 60 },
        { x: 900, type: 'spawn', enemy: 'target', y: 40 },
      ],
    });
    expect(late.issues).toEqual([]);
    const spec = late.db.stages[late.db.stageIndex.get('t')!];
    const two = stageForLoop(spec, 2);
    expect(two).not.toBe(spec);
    expect(two.events.map((e) => e.x)).toEqual([50, 50, 900]);
    // The timeline's own event comes first at an equal x.
    expect((two.events[0] as { y?: number }).y).toBe(20);
    expect(Object.isFrozen(two.events)).toBe(true);
    expect(spec.events).toHaveLength(1); // the loop-1 stage is untouched
  });

  it('plays an event without bounds in every loop, and none outside 1 … MAX_LOOP', () => {
    for (let loop = 1; loop <= MAX_LOOP; loop++) expect(stageEventInLoop({}, loop)).toBe(true);
    expect(stageEventInLoop({}, 0)).toBe(false);
    expect(stageEventInLoop({}, MAX_LOOP + 1)).toBe(false);
    expect(stageEventInLoop({ minLoop: 2, maxLoop: 2 }, 2)).toBe(true);
    expect(stageEventInLoop({ minLoop: 2, maxLoop: 2 }, 3)).toBe(false);
    expect(stageEventInLoop({ maxLoop: 1 }, 1)).toBe(true);
  });
});

describe('core/world the caravan clock`s limits (M3-01)', () => {
  it('takes 0 (none) to MAX_TIME_LIMIT ticks, whole numbers only', () => {
    expect(resolveGameConfig({ timeLimit: MAX_TIME_LIMIT }).timeLimit).toBe(MAX_TIME_LIMIT);
    expect(MAX_TIME_LIMIT).toBe(60 * 60 * 60);
    expect(() => resolveGameConfig({ timeLimit: MAX_TIME_LIMIT + 1 })).toThrow(RangeError);
    expect(() => resolveGameConfig({ timeLimit: 90.5 })).toThrow(RangeError);
    expect(() => resolveGameConfig({ loop: 1.5 })).toThrow(RangeError);
    const none = world({ timeLimit: 0 });
    expect([none.timeLeft, hudClockSeconds(none)]).toEqual([-1, 0]);
    run(none, 30);
    expect([none.timeLeft, none.timeUp, none.status]).toEqual([-1, false, 'playing']);
  });

  it('runs during the boss warning, stops once the World is over', () => {
    const w = world({ timeLimit: 300 });
    w.status = 'bossWarning';
    run(w, 10);
    expect(w.timeLeft).toBe(290);
    const over = world({ timeLimit: 300 });
    run(over, 10);
    over.status = 'gameOver';
    run(over, 50);
    expect([over.timeLeft, over.timeUp, over.clockPaid]).toEqual([290, false, false]);
    expect(over.scoring.board.scores[0].score).toBe(0);
  });

  it('pays whole seconds only: under one second left pays nothing, once', () => {
    const w = world({ timeLimit: 120 });
    run(w, 61); // 59 ticks left
    w.status = 'stageClear';
    run(w, 1);
    expect([w.clockPaid, w.scoring.board.scores[0].score]).toEqual([true, 0]);
    const exact = world({ timeLimit: 180 });
    run(exact, 60); // 120 ticks left: 2 seconds
    exact.status = 'stageClear';
    run(exact, 3);
    expect(exact.scoring.board.scores[0].score).toBe(2 * CARAVAN_TIME_BONUS);
    // The clock stands still after a clear.
    expect(exact.timeLeft).toBe(120);
  });

  it('pays every player in play, not one who has not joined', () => {
    const w = world({ timeLimit: 600, coop: true });
    run(w, 60);
    const joined = w.players[1].active;
    w.status = 'stageClear';
    run(w, 1);
    const scores = w.scoring.board.scores;
    expect(scores[0].score).toBe(9 * CARAVAN_TIME_BONUS);
    expect(scores[1].score).toBe(joined ? 9 * CARAVAN_TIME_BONUS : 0);
  });
});

describe('core the score-milking cap`s arithmetic (M3-01)', () => {
  it('floors a capped kill`s share to tens', () => {
    const { db, issues } = content(150, { bulletCancel: 10, repeatKills: 1, repeatPercent: 50 });
    expect(issues).toEqual([]);
    const w = createWorld(resolveGameConfig({ seed: 2, stage: 't' }), db);
    run(w, 60);
    // 150, then 50 % = 75, floored to 70.
    expect(spawnAndKill(w, 3)).toBe(150 + 70 + 70);
  });

  it('gives nothing at 0 %, the full score at 100 %', () => {
    const zero = content(150, { bulletCancel: 10, repeatKills: 2, repeatPercent: 0 }).db;
    const w0 = createWorld(resolveGameConfig({ seed: 2, stage: 't' }), zero);
    run(w0, 60);
    expect(spawnAndKill(w0, 4)).toBe(300);
    const full = content(150, { bulletCancel: 10, repeatKills: 2, repeatPercent: 100 }).db;
    const w1 = createWorld(resolveGameConfig({ seed: 2, stage: 't' }), full);
    run(w1, 60);
    expect(spawnAndKill(w1, 4)).toBe(600);
  });

  it('counts only kills a player is credited with, per World', () => {
    const { db } = content(100, { bulletCancel: 10, repeatKills: 3, repeatPercent: 10 });
    const w = createWorld(resolveGameConfig({ seed: 2, stage: 't' }), db);
    run(w, 60);
    // Five children lost by nobody (-1): no points, not counted.
    expect(spawnAndKill(w, 5, -1)).toBe(0);
    expect(spawnAndKill(w, 4)).toBe(3 * 100 + 10);
    // A new World counts from zero again.
    const next = createWorld(resolveGameConfig({ seed: 2, stage: 't' }), db);
    run(next, 60);
    expect(spawnAndKill(next, 3)).toBe(300);
  });

  it('refuses rules out of range', () => {
    const bad = (scoring: Record<string, number>): string =>
      content(100, { bulletCancel: 10, ...scoring }).issues.join();
    expect(bad({ repeatKills: MAX_REPEAT_KILLS })).toBe('');
    expect(bad({ repeatKills: MAX_REPEAT_KILLS + 1 })).toContain('repeatKills');
    expect(bad({ repeatKills: -1 })).toContain('repeatKills');
    expect(bad({ repeatPercent: 101 })).toContain('repeatPercent');
    expect(bad({ repeatPercent: 12.5 })).toContain('repeatPercent');
  });
});

describe('core/save the extra modes` tables (M3-01)', () => {
  it('keys one table per mode, difficulty and power-up model', () => {
    expect(HI_SCORE_MODES).toEqual(expect.arrayContaining(['bossrush', 'caravan', 'arcade']));
    const config = resolveGameConfig({ difficulty: 'hard' });
    expect(hiScoreModeKey(config, 'bossrush')).toBe('meter-hard-bossrush');
    expect(hiScoreModeKey(config, 'caravan')).toBe('meter-hard-caravan');
    expect(hiScoreModeKey(config, 'arcade')).toBe('meter-hard-arcade');
    expect(hiScoreModeKey(config)).toBe('meter-hard');
  });
});
