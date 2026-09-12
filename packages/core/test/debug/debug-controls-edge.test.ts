/**
 * Edge cases of the M1-19 debug tools in the core:
 *
 * - determinism: a session run under slow motion or frame advance (frame by frame through
 *   `Game.frame`) reaches exactly the states of the same input run with `Game.step`, and two
 *   sessions that jump to a checkpoint at the same tick stay in lockstep;
 * - `Game.frame` timing: frame advance ignores the clock, queued steps survive a pause and are
 *   dropped when frame advance is switched off, slow motion never bursts (a clock jump, a resume,
 *   a 2 → 4 switch) and never runs more than `maxTicksPerFrame`; `Game.step` ignores the switches;
 * - the controls: the slow-motion cycle recovers from a foreign value, the stage jumps work in the
 *   boss WARNING but not after the stage ended, a jump keeps score and lives and leaves a dying
 *   ship alone;
 * - the overlay counters read the World only (no RNG draw, no state change) and rehash exactly
 *   every {@link DEBUG_HASH_INTERVAL} ticks.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import {
  EMPTY_CONTENT_DB,
  loadContent,
  type ContentDb,
  type ContentFile,
} from '../../src/data/index.js';
import {
  DEBUG_COMMAND_NAMES,
  DEBUG_HASH_INTERVAL,
  DebugCommand,
  collectDebugCounters,
  createDebugControls,
  createDebugCounters,
  hashWorld,
  jumpToCheckpoint,
  type DebugCommand as DebugCommandCode,
  type SlowMo,
} from '../../src/debug/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld } from '../../src/world/index.js';

/** One 60 Hz frame in ms. */
const FRAME = 1000 / 60;

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

/**
 * Content with the KESTREL, zone A and a flat scrolling stage `t` (checkpoints at 0, 600, 1800).
 *
 * @returns The DB.
 */
function contentDb(): ContentDb {
  const { db, issues } = loadContent(
    [
      ...[
        'player/kestrel.player.json',
        'weapons/type-a.weapons.json',
        'tilesets/terrain-a.tileset.json',
        'paths/zone-a.paths.json',
        'enemies/zone-a.enemies.json',
        'stages/zone-a.stage.json',
      ].map(shipped),
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
          checkpoints: [{ x: 0 }, { x: 600 }, { x: 1800 }],
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-a',
            rowsTall: 25,
            generator: {
              type: 'heightfield',
              segments: [{ from: 0, to: 4384, floor: { base: 32, amp: 0, period: 64, seed: 1 } }],
            },
          },
          events: [{ x: 4000, type: 'end' }],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
}

const DB = contentDb();

/**
 * The scripted input of a tick.
 *
 * @param tick - The tick about to run.
 * @returns The held actions.
 */
function pilot(tick: number): number {
  let held = (tick >> 4) % 3 === 0 ? Action.Up : (tick >> 4) % 3 === 1 ? Action.Down : Action.Right;
  if (tick % 40 < 20) held |= Action.Shot;
  return held;
}

/**
 * A session on stage `t` and its platform.
 *
 * @returns Both.
 */
function session(): { game: Game; platform: HeadlessPlatform } {
  const platform = createHeadlessPlatform();
  const game = createGame(platform, resolveGameConfig({ seed: 12, stage: 't' }), DB);
  return { game, platform };
}

/**
 * The hash after every tick of the reference run (`Game.step`, the pilot's input).
 *
 * @param ticks - Ticks.
 * @returns Hashes, index = tick − 1.
 */
function referenceHashes(ticks: number): number[] {
  const { game, platform } = session();
  const out: number[] = [];
  for (let i = 0; i < ticks; i++) {
    commitPlayerInput(platform.snapshot.players[0], pilot(i));
    game.step();
    out.push(hashWorld(game.world));
  }
  return out;
}

describe('core/debug — determinism under the debug timing', () => {
  const TICKS = 240;
  const reference = referenceHashes(TICKS);

  it.each<SlowMo>([2, 4])('slow motion ×%i reaches the same state at every tick', (slowMo) => {
    const { game, platform } = session();
    game.debug.slowMo = slowMo;
    const hashes: number[] = [];
    for (let frame = 0; hashes.length < TICKS; frame++) {
      commitPlayerInput(platform.snapshot.players[0], pilot(game.state.tick));
      const ran = game.frame(frame * FRAME);
      expect(ran).toBeLessThanOrEqual(1);
      if (ran === 1) hashes.push(hashWorld(game.world));
      expect(frame).toBeLessThan(TICKS * slowMo + 10);
    }
    expect(hashes).toEqual(reference);
  });

  it('frame advance with single steps reaches the same state at every tick', () => {
    const { game, platform } = session();
    const controls = createDebugControls(game);
    const hashes: number[] = [];
    for (let frame = 0; hashes.length < TICKS; frame++) {
      // Step every third frame; the frames in between run nothing.
      if (frame % 3 === 0) controls.run(DebugCommand.Step);
      commitPlayerInput(platform.snapshot.players[0], pilot(game.state.tick));
      const ran = game.frame(frame * FRAME);
      expect(ran).toBe(frame % 3 === 0 ? 1 : 0);
      if (ran === 1) hashes.push(hashWorld(game.world));
    }
    expect(hashes).toEqual(reference);
  });

  it('two sessions that jump to a checkpoint at the same tick stay in lockstep', () => {
    const run = (): number[] => {
      const { game, platform } = session();
      const out: number[] = [];
      for (let i = 0; i < 200; i++) {
        if (i === 50) expect(createDebugControls(game).run(DebugCommand.NextCheckpoint)).toBe(true);
        commitPlayerInput(platform.snapshot.players[0], pilot(i));
        game.step();
        out.push(hashWorld(game.world));
      }
      return out;
    };
    const a = run();
    expect(run()).toEqual(a);
    // The jump changed the run (it is not the reference).
    expect(a[199]).not.toBe(referenceHashes(200)[199]);
  });
});

describe('core/debug — Game.frame timing edge cases', () => {
  it('frame advance ignores the clock: a jump of minutes runs nothing', () => {
    const { game } = session();
    game.debug.frameAdvance = true;
    expect(game.frame(0)).toBe(0);
    expect(game.frame(5 * 60_000)).toBe(0);
    game.requestStep();
    expect(game.frame(5 * 60_000 + FRAME)).toBe(1);
    expect(game.state.tick).toBe(1);
  });

  it('keeps queued steps through a pause and a suspend; runs them after', () => {
    const { game, platform } = session();
    game.debug.frameAdvance = true;
    game.frame(0);
    game.requestStep(3);
    game.pause();
    expect(game.frame(FRAME)).toBe(0);
    game.resume();
    platform.suspend();
    expect(game.frame(2 * FRAME)).toBe(0);
    platform.resume();
    expect(game.frame(3 * FRAME)).toBe(3);
    expect(game.frame(4 * FRAME)).toBe(0);
  });

  it('drops queued steps when frame advance is switched off before they ran', () => {
    const { game } = session();
    game.debug.frameAdvance = true;
    game.frame(0);
    game.requestStep(5);
    game.debug.frameAdvance = false;
    game.frame(FRAME); // back to normal timing: the loop starts over, the queue is dropped
    const before = game.state.tick;
    game.debug.frameAdvance = true;
    expect(game.frame(2 * FRAME)).toBe(0);
    expect(game.state.tick).toBe(before);
  });

  it('Game.step ignores frame advance and slow motion', () => {
    const { game } = session();
    game.debug.frameAdvance = true;
    game.debug.slowMo = 4;
    game.step();
    game.step();
    expect(game.state.tick).toBe(2);
  });

  it('slow motion caps a clock jump at maxTicksPerFrame and never bursts after a resume', () => {
    const { game, platform } = session();
    game.debug.slowMo = 2;
    for (let i = 0; i < 10; i++) game.frame(i * FRAME);
    const jumped = game.frame(10 * FRAME + 10_000); // the tab was hidden for 10 s
    expect(jumped).toBe(game.config.maxTicksPerFrame);
    platform.suspend();
    platform.resume();
    const after: number[] = [];
    for (let i = 0; i < 5; i++) after.push(game.frame(20_000 + i * FRAME));
    expect(after[0]).toBe(0);
    expect(Math.max(...after)).toBe(1);
  });

  it('switching slow motion 2 → 4 restarts the loop (no catch-up for the time at ×2)', () => {
    const { game } = session();
    game.debug.slowMo = 2;
    for (let i = 0; i < 9; i++) game.frame(i * FRAME);
    game.debug.slowMo = 4;
    const ran: number[] = [];
    for (let i = 9; i < 9 + 65; i++) ran.push(game.frame(i * FRAME));
    expect(ran[0]).toBe(0);
    expect(Math.max(...ran)).toBe(1);
    // 64 frame times at a quarter speed = 16 tick periods (the slowed clock runs in whole ms, so
    // the last period may still be accumulating).
    expect(ran.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(15);
    expect(ran.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(16);
  });

  it('ignores slow-motion time running backwards', () => {
    const { game } = session();
    game.debug.slowMo = 2;
    game.frame(1000);
    game.frame(1000 + FRAME);
    const tick = game.state.tick;
    expect(game.frame(500)).toBe(0);
    expect(game.frame(400)).toBe(0);
    expect(game.state.tick).toBe(tick);
  });
});

describe('core/debug — controls edge cases', () => {
  it('names the commands in a frozen table, one name per code', () => {
    expect(Object.isFrozen(DEBUG_COMMAND_NAMES)).toBe(true);
    expect(DEBUG_COMMAND_NAMES).toHaveLength(Object.keys(DebugCommand).length + 1);
    expect(new Set(DEBUG_COMMAND_NAMES.slice(1)).size).toBe(Object.keys(DebugCommand).length);
  });

  it('the slow-motion cycle recovers from a value outside 1 | 2 | 4', () => {
    const { game } = session();
    game.debug.slowMo = 3 as SlowMo;
    createDebugControls(game).run(DebugCommand.SlowMo);
    expect(game.debug.slowMo).toBe(1);
  });

  it('unknown command codes change nothing', () => {
    const { game } = session();
    const controls = createDebugControls(game);
    const before = JSON.stringify(game.debug);
    for (const code of [0, 10, -1, 1.5, 99]) {
      expect(controls.run(code as DebugCommandCode)).toBe(false);
    }
    expect(JSON.stringify(game.debug)).toBe(before);
  });

  it('jumps during the boss WARNING, but not once the stage has ended', () => {
    const game = createGame(
      createHeadlessPlatform(),
      resolveGameConfig({ seed: 3, stage: 'zone-a', stageSkip: 'boss' }),
      DB,
    );
    const controls = createDebugControls(game);
    for (let i = 0; i < 400 && game.world.status !== 'bossWarning'; i++) game.step();
    expect(game.world.status).toBe('bossWarning');
    expect(controls.run(DebugCommand.SkipToBoss)).toBe(true);
    expect(game.world.status).toBe('playing');
    game.world.status = 'stageClear';
    expect(controls.run(DebugCommand.SkipToBoss)).toBe(false);
    expect(controls.run(DebugCommand.NextCheckpoint)).toBe(false);
    game.world.status = 'gameOver';
    expect(controls.run(DebugCommand.SkipToBoss)).toBe(false);
  });

  it('a stage jump keeps score, lives and loadout, clears the bullets and leaves a dying ship alone', () => {
    const { game } = session();
    for (let i = 0; i < 120; i++) game.step();
    const world = game.world;
    const ship = world.players[0];
    world.scoring.board.scores[0].score = 12_340;
    ship.lives = 2;
    world.bullets.spawn(world.camera.x + 200, 100, 0, 0, 0);
    expect(world.bullets.pool.count).toBe(1);
    ship.state = 'dying';
    expect(jumpToCheckpoint(world, 1)).toBe(true);
    expect(world.camera.x).toBe(600);
    expect(world.bullets.pool.count).toBe(0);
    expect(world.scoring.board.scores[0].score).toBe(12_340);
    expect(ship.lives).toBe(2);
    expect(ship.state).toBe('dying'); // not flown in again
    ship.state = 'alive';
    expect(jumpToCheckpoint(world, 2)).toBe(true);
    expect(ship.state).toBe('entering');
  });

  it('stage jumps from the controls act on the frozen game at once', () => {
    const { game } = session();
    const controls = createDebugControls(game);
    controls.run(DebugCommand.Step);
    expect(game.frame(0)).toBe(1); // the queued step runs at the next frame
    expect(controls.run(DebugCommand.NextCheckpoint)).toBe(true);
    expect(game.world.camera.x).toBe(600);
    expect(game.frame(2 * FRAME)).toBe(0); // still frozen
  });
});

describe('core/debug — overlay counters edge cases', () => {
  it('reads the World only: no RNG draw, the same state hash before and after', () => {
    const world = createWorld(resolveGameConfig({ seed: 8, stage: 't' }), DB);
    const input = createInputSnapshot();
    for (let i = 0; i < 90; i++) stepWorld(world, input);
    const hash = hashWorld(world);
    const calls = world.rng.gameplay.callCount;
    const counters = createDebugCounters();
    for (let i = 0; i < 3; i++) collectDebugCounters(world, counters);
    expect(hashWorld(world)).toBe(hash);
    expect(world.rng.gameplay.callCount).toBe(calls);
    expect(counters.rngCalls).toBe(calls);
  });

  it('rehashes exactly every DEBUG_HASH_INTERVAL ticks', () => {
    const world = createWorld(resolveGameConfig({ seed: 8 }), EMPTY_CONTENT_DB);
    const input = createInputSnapshot();
    const counters = createDebugCounters();
    const hashTicks: number[] = [];
    for (let i = 0; i <= 3 * DEBUG_HASH_INTERVAL; i++) {
      collectDebugCounters(world, counters);
      if (hashTicks[hashTicks.length - 1] !== counters.hashTick) hashTicks.push(counters.hashTick);
      stepWorld(world, input);
    }
    expect(hashTicks).toEqual([0, 60, 120, 180]);
    // Collected only every 25 ticks: the hash follows at the first collection 60+ ticks on.
    const sparse = createDebugCounters();
    const seen: number[] = [];
    const other = createWorld(resolveGameConfig({ seed: 8 }), EMPTY_CONTENT_DB);
    for (let i = 0; i <= 150; i++) {
      if (i % 25 === 0) {
        collectDebugCounters(other, sparse);
        if (seen[seen.length - 1] !== sparse.hashTick) seen.push(sparse.hashTick);
      }
      stepWorld(other, input);
    }
    expect(seen).toEqual([0, 75, 150]);
  });
});
