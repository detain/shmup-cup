/**
 * The playtest harness (`harness.ts`, plan M1-18) with scripted bots, on short runs:
 *
 * - `shippedContent()` loads the shipped content once (the same DB every call);
 * - `runStage` records exactly what the bot held, calls the observer once per tick, stops at the
 *   tick limit (status `playing`, no clear, no boss) and reports the defaults (seed 1, no god
 *   mode); it counts the ticks on which two or more directions were held and the ship's x range;
 * - a ship steered into zone A's floor with one life dies of `terrain` and ends the run in
 *   `gameOver`; the recording replays to the same death tick, status and hash — and only with the
 *   same options (another seed diverges); god mode lets the same input live;
 * - the flags reach the session (`stageSkip`, `config`);
 * - `describeRun` summarises a run, deaths and boss included.
 */
import { Action, type World } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_TICKS,
  DIRECTIONS,
  TICKS_PER_SECOND,
  describeRun,
  replayStage,
  runStage,
  shippedContent,
  type PlaytestBot,
  type PlaytestResult,
} from './harness.js';

/**
 * A bot that holds the masks of a script in turn (then the last one).
 *
 * @param masks - Masks per tick.
 * @param name - Its name.
 * @returns The bot, with the masks it answered.
 */
function scripted(
  masks: readonly number[],
  name = 'scripted',
  remoteStrict = false,
): PlaytestBot & { said: number[] } {
  const said: number[] = [];
  return {
    name,
    said,
    remoteStrict,
    decide() {
      const mask = masks[Math.min(said.length, masks.length - 1)];
      said.push(mask);
      return mask;
    },
  };
}

describe('playtest harness: shippedContent', () => {
  it('loads the shipped content once, with zone A in it', () => {
    const db = shippedContent();
    expect(shippedContent()).toBe(db);
    expect(db.stageIndex.has('zone-a')).toBe(true);
  });
});

describe('playtest harness: runStage', () => {
  it('records the held masks, observes every tick and stops at the tick limit', () => {
    const masks = [0, Action.Up, Action.Up | Action.Right, Action.Down, Action.PowerUp];
    const bot = scripted(masks);
    let observed = 0;
    let lastTick = -1;
    const run = runStage('zone-a', bot, {
      maxTicks: 300,
      observe(world: World) {
        observed++;
        lastTick = world.tick;
      },
    });
    expect(DEFAULT_MAX_TICKS).toBe(10 * 60 * TICKS_PER_SECOND);
    expect(run).toMatchObject({
      stageId: 'zone-a',
      bot: 'scripted',
      godMode: false,
      seed: 1,
      status: 'playing',
      ticks: 300,
      clearTick: -1,
      bossDefeated: false,
      bossFightTicks: -1,
      deaths: [],
    });
    expect(run.seconds).toBe(300 / TICKS_PER_SECOND);
    expect(observed).toBe(300);
    expect(lastTick).toBe(300);
    expect(Array.from(run.inputs)).toEqual(bot.said);
    expect(run.inputs[2]).toBe(Action.Up | Action.Right);
    // Up + Right (tick 2) is the only diagonal of the script.
    expect(run.diagonalTicks).toBe(1);
    expect(run.equips).toHaveLength(7);
    expect(run.shipX.min).toBeLessThanOrEqual(run.shipX.max);
  });

  it('counts every tick on which two or more directions are held', () => {
    const run = runStage('zone-a', scripted([Action.Down | Action.Left | Action.Right]), {
      maxTicks: 50,
      godMode: true,
    });
    expect(run.diagonalTicks).toBe(50);
    expect(run.godMode).toBe(true);
    const straight = runStage('zone-a', scripted([Action.Down]), { maxTicks: 50 });
    expect(straight.diagonalTicks).toBe(0);
    expect(straight.remoteViolations, straight.remoteViolation).toBe(0);
    expect(straight.inputs.every((m) => (m & DIRECTIONS) === Action.Down)).toBe(true);
  });

  it('checks a remote-strict bot against the remote model, and only that bot (M3-02b)', () => {
    // A direction and a button in one tick: impossible on the single-key remote.
    const script = [Action.Down | Action.PowerUp];
    const loose = runStage('zone-a', scripted(script), { maxTicks: 30, godMode: true });
    expect(loose.remoteViolations).toBe(0);
    expect(loose.remoteViolation).toBe('');
    const strict = runStage('zone-a', scripted(script, 'strict', true), {
      maxTicks: 30,
      godMode: true,
    });
    expect(strict.remoteViolations).toBeGreaterThan(0);
    expect(strict.remoteViolation).toMatch(/^direction-with-button@/);
  });

  it('reports a crash into the floor with one life as a terrain death and game over', () => {
    const flags = { maxTicks: 3000, config: { startingLives: 1 } } as const;
    const run = runStage('zone-a', scripted([Action.Down]), flags);
    expect(run.status).toBe('gameOver');
    expect(run.deaths).toHaveLength(1);
    const [death] = run.deaths;
    expect(death.cause).toBe('terrain');
    expect(death.boss).toBe(false);
    expect(death.livesLeft).toBe(0);
    expect(death.y).toBeGreaterThan(100); // the floor, at the bottom of the playfield
    expect(death.cameraX).toBeGreaterThan(0);
    expect(run.ticks).toBeLessThan(3000);
    expect(run.clearTick).toBe(-1);
    expect(run.seconds).toBe(run.ticks / TICKS_PER_SECOND);
    // The recording replays: same death, same end state — with the same options only.
    const replay = replayStage('zone-a', run.inputs, flags);
    expect(replay).toEqual({
      status: 'gameOver',
      ticks: run.ticks,
      deathTicks: [death.tick],
      hash: run.hash,
    });
    expect(replayStage('zone-a', run.inputs, { ...flags, seed: 2 }).hash).not.toBe(run.hash);
    // God mode: the same input lives on (hits are ignored).
    const god = runStage('zone-a', scripted([Action.Down]), { ...flags, godMode: true });
    expect(god.deaths).toEqual([]);
    expect(god.status).toBe('playing');
    expect(god.ticks).toBe(3000);
  });

  it('passes the stage skip and the session options through', () => {
    let cameraX = -1;
    let difficulty = '';
    const run = runStage('zone-a', scripted([0]), {
      maxTicks: 1,
      stageSkip: 'boss',
      seed: 7,
      config: { difficulty: 'hard' },
      observe(world) {
        cameraX = world.camera.x;
        difficulty = world.config.difficulty;
      },
    });
    const warning = shippedContent()
      .stages.find((s) => s.id === 'zone-a')
      ?.events.find((e) => e.type === 'warning');
    expect(cameraX).toBeGreaterThan((warning?.x ?? 0) - 100);
    expect(difficulty).toBe('hard');
    expect(run.seed).toBe(7);
  });

  it('replays an empty recording into the untouched start state', () => {
    const replay = replayStage('zone-a', new Uint16Array(0));
    expect(replay.ticks).toBe(0);
    expect(replay.status).toBe('playing');
    expect(replay.deathTicks).toEqual([]);
    const run = runStage('zone-a', scripted([0]), { maxTicks: 0 });
    expect(run.ticks).toBe(0);
    expect(run.inputs).toHaveLength(0);
    expect(run.hash).toBe(replay.hash);
  });
});

describe('playtest harness: describeRun', () => {
  it('summarises the status, length, boss, deaths, score and equips', () => {
    const base: PlaytestResult = {
      stageId: 'zone-a',
      bot: 'four-way',
      godMode: true,
      seed: 1,
      status: 'stageClear',
      ticks: 12_600,
      clearTick: 12_612,
      seconds: 210.2,
      bossDefeated: true,
      bossFightTicks: 1302,
      deaths: [],
      score: 63_900,
      pickups: 19,
      equips: [2, 1, 0, 0, 3, 0, 0],
      diagonalTicks: 0,
      remoteViolations: 0,
      remoteViolation: '',
      shipX: { min: 62.5, max: 64 },
      inputs: new Uint16Array(0),
      hash: 0,
    };
    expect(describeRun(base)).toBe(
      'zone-a four-way (god mode): stageClear after 210.2 s, boss 21.7 s, 0 death(s), ' +
        'score 63900, 19 capsules, equips 2/1/0/0/3/0/0',
    );
    const lost: PlaytestResult = {
      ...base,
      godMode: false,
      status: 'gameOver',
      seconds: 95,
      bossDefeated: false,
      bossFightTicks: -1,
      deaths: [
        { tick: 100, cameraX: 820, cause: 'bullet', y: 90, boss: false, livesLeft: 2 },
        { tick: 900, cameraX: 8600, cause: 'laser', y: 60, boss: true, livesLeft: 1 },
      ],
    };
    expect(describeRun(lost)).toBe(
      'zone-a four-way: gameOver after 95.0 s, boss not defeated, 2 death(s) ' +
        '[bullet@x820, laser@x8600 (boss)], score 63900, 19 capsules, equips 2/1/0/0/3/0/0',
    );
  });
});
