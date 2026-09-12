/**
 * The debug tools of plan M1-19: the session's shared switches (`game.debug`, the same object in
 * every World of a session), the controls' commands (overlay, god mode, outline cycle, grid, frame
 * advance and single steps, slow-motion cycle, the stage jumps — only while a stage is being
 * played), `Game.frame` under frame advance and slow motion (no catch-up burst on a switch), the
 * checkpoint jumps and the overlay counters (pools, rank, RNG calls, a hash every 60 ticks).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB, loadContent, type ContentDb } from '../../src/data/index.js';
import {
  DEBUG_COMMAND_NAMES,
  DEBUG_HASH_INTERVAL,
  DebugCommand,
  SLOW_MO_STEPS,
  collectDebugCounters,
  createDebugControls,
  createDebugCounters,
  hashWorld,
  jumpToCheckpoint,
  jumpToNextCheckpoint,
} from '../../src/debug/index.js';
import { EnemyState } from '../../src/enemies/index.js';
import { createGame } from '../../src/game/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { createWorld, stepWorld } from '../../src/world/index.js';

/** One 60 Hz frame in ms. */
const FRAME = 1000 / 60;

/**
 * Reads a shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The parsed JSON.
 */
function shipped(path: string): unknown {
  return JSON.parse(
    readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
  ) as unknown;
}

/**
 * Content with the KESTREL and a flat scrolling stage `t` with checkpoints at 0, 600 and 1800.
 *
 * @returns The DB.
 */
function stageDb(): ContentDb {
  const { db, issues } = loadContent([
    { path: 'player/kestrel.player.json', data: shipped('player/kestrel.player.json') },
    { path: 'tilesets/terrain-a.tileset.json', data: shipped('tilesets/terrain-a.tileset.json') },
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
  ]);
  expect(issues).toEqual([]);
  return db;
}

/**
 * Feeds `frames` 60 Hz frames to a game and returns the ticks each one ran.
 *
 * @param game - The game.
 * @param frames - Frames.
 * @param start - Timestamp of the first frame.
 * @returns Ticks per frame.
 */
function frames(game: ReturnType<typeof createGame>, frames: number, start = 0): number[] {
  const ran: number[] = [];
  for (let i = 0; i < frames; i++) ran.push(game.frame(start + i * FRAME));
  return ran;
}

describe('core/debug controls', () => {
  it('names every command', () => {
    for (const code of Object.values(DebugCommand)) expect(DEBUG_COMMAND_NAMES[code]).not.toBe('');
    expect(SLOW_MO_STEPS).toEqual([1, 2, 4]);
  });

  it('shares one set of switches between the game and every World it creates', () => {
    const bare = createGame(createHeadlessPlatform());
    expect(bare.world.debugFlags).toBe(bare.debug);
    const flow = createGame(createHeadlessPlatform(), {}, EMPTY_CONTENT_DB, { scenes: 'game' });
    const first = flow.world;
    expect(first.debugFlags).toBe(flow.debug);
    flow.debug.godMode = true;
    expect(first.debugFlags.godMode).toBe(true);
    // A World created on its own keeps its own switches unless given the game's.
    const own = createWorld(resolveGameConfig(), EMPTY_CONTENT_DB);
    expect(own.debugFlags).not.toBe(flow.debug);
    const shared = createWorld(resolveGameConfig(), EMPTY_CONTENT_DB, { debugFlags: flow.debug });
    expect(shared.debugFlags).toBe(flow.debug);
  });

  it('toggles the overlay, god mode and the grid, and cycles the outlines and slow motion', () => {
    const game = createGame(createHeadlessPlatform());
    const controls = createDebugControls(game);
    expect(controls.game).toBe(game);
    expect(controls.flags).toBe(game.debug);
    expect(controls.run(DebugCommand.Overlay)).toBe(true);
    expect(controls.run(DebugCommand.GodMode)).toBe(true);
    expect([game.debug.overlay, game.debug.godMode]).toEqual([true, true]);
    controls.run(DebugCommand.GodMode);
    expect(game.debug.godMode).toBe(false);

    const outlines: Array<[boolean, boolean]> = [];
    for (let i = 0; i < 4; i++) {
      controls.run(DebugCommand.Outlines);
      outlines.push([game.debug.showHitboxes, game.debug.showGrid]);
    }
    expect(outlines).toEqual([
      [true, false],
      [true, true],
      [false, false],
      [true, false],
    ]);
    controls.run(DebugCommand.Grid);
    expect(game.debug.showGrid).toBe(true);

    const slow: number[] = [];
    for (let i = 0; i < 4; i++) {
      controls.run(DebugCommand.SlowMo);
      slow.push(game.debug.slowMo);
    }
    expect(slow).toEqual([2, 4, 1, 2]);
    expect(controls.run(0 as DebugCommand)).toBe(false);
  });

  it('frame advance freezes the game; each step runs exactly one tick at the next frame', () => {
    const game = createGame(createHeadlessPlatform());
    const controls = createDebugControls(game);
    expect(frames(game, 5)).toEqual([0, 1, 1, 1, 1]);
    controls.run(DebugCommand.FrameAdvance);
    expect(frames(game, 5, 5 * FRAME)).toEqual([0, 0, 0, 0, 0]);
    controls.run(DebugCommand.Step);
    controls.run(DebugCommand.Step);
    expect(game.state.tick).toBe(4);
    expect(frames(game, 2, 10 * FRAME)).toEqual([2, 0]);
    expect(game.state.tick).toBe(6);
    game.requestStep(3);
    game.requestStep(0);
    game.requestStep(-1);
    game.requestStep(1.5);
    expect(frames(game, 1, 12 * FRAME)).toEqual([3]);
    // Leaving frame advance: no burst for the frozen time (the loop starts over).
    controls.run(DebugCommand.FrameAdvance);
    expect(frames(game, 4, 600 * FRAME)).toEqual([0, 1, 1, 1]);
    // Steps asked for while frame advance is off are ignored.
    game.requestStep(5);
    expect(frames(game, 1, 604 * FRAME)).toEqual([1]);
    game.debug.frameAdvance = true;
    expect(frames(game, 1, 605 * FRAME)).toEqual([0]);
  });

  it('the step command switches frame advance on by itself', () => {
    const game = createGame(createHeadlessPlatform());
    frames(game, 3);
    createDebugControls(game).run(DebugCommand.Step);
    expect(game.debug.frameAdvance).toBe(true);
    expect(frames(game, 3, 3 * FRAME)).toEqual([1, 0, 0]);
  });

  it('slow motion runs a tick every 2nd / 4th frame at 60 Hz, and switching never bursts', () => {
    const game = createGame(createHeadlessPlatform());
    game.debug.slowMo = 2;
    // 42 frames = 41 frame times = 20.5 tick periods at half speed (10.25 at a quarter).
    const half = frames(game, 42);
    expect(half.reduce((a, b) => a + b, 0)).toBe(20);
    expect(Math.max(...half)).toBe(1);
    game.debug.slowMo = 4;
    const quarter = frames(game, 42, 42 * FRAME);
    expect(quarter.reduce((a, b) => a + b, 0)).toBe(10);
    game.debug.slowMo = 1;
    expect(frames(game, 4, 84 * FRAME)).toEqual([0, 1, 1, 1]);
    // Paused or suspended: nothing, whatever the switches say.
    game.debug.slowMo = 2;
    game.pause();
    expect(frames(game, 4, 90 * FRAME)).toEqual([0, 0, 0, 0]);
  });

  it('jumps to the next checkpoint of the stage being played, and never in free flight', () => {
    const db = stageDb();
    const game = createGame(createHeadlessPlatform(), { stage: 't' }, db);
    const controls = createDebugControls(game);
    for (let i = 0; i < 10; i++) game.step();
    // The checkpoint at 0 counts as passed from the first tick.
    expect(game.world.stage?.checkpoint).toBe(0);
    expect(controls.run(DebugCommand.NextCheckpoint)).toBe(true);
    expect(game.world.camera.x).toBe(600);
    expect(game.world.players[0].state).toBe('entering');
    expect(controls.run(DebugCommand.NextCheckpoint)).toBe(true);
    expect(game.world.camera.x).toBe(1800);
    expect(controls.run(DebugCommand.NextCheckpoint)).toBe(false);
    expect(controls.run(DebugCommand.SkipToBoss)).toBe(false); // no boss on this stage
    game.world.status = 'gameOver';
    expect(jumpToCheckpoint(game.world, 1)).toBe(true); // the function itself does not care
    expect(controls.run(DebugCommand.NextCheckpoint)).toBe(false);

    const free = createGame(createHeadlessPlatform());
    expect(createDebugControls(free).run(DebugCommand.NextCheckpoint)).toBe(false);
    expect(createDebugControls(free).run(DebugCommand.SkipToBoss)).toBe(false);
    expect(jumpToNextCheckpoint(free.world)).toBe(false);
  });

  it('acts on the stage only while the game scene is on top of the scene flow', () => {
    const db = stageDb();
    const title = createGame(createHeadlessPlatform(), { stage: 't' }, db, { scenes: 'title' });
    expect(createDebugControls(title).run(DebugCommand.NextCheckpoint)).toBe(false);
    const playing = createGame(createHeadlessPlatform(), { stage: 't' }, db, { scenes: 'game' });
    playing.step();
    expect(playing.scenes?.stack.top?.id).toBe('game');
    expect(createDebugControls(playing).run(DebugCommand.NextCheckpoint)).toBe(true);
    expect(playing.world.camera.x).toBe(600);
  });

  it('validates checkpoint indices; -1 is the stage start', () => {
    const world = createWorld(resolveGameConfig({ stage: 't' }), stageDb());
    const input = createInputSnapshot();
    for (let i = 0; i < 700; i++) stepWorld(world, input);
    expect(world.stage?.checkpoint).toBe(1);
    expect(jumpToCheckpoint(world, 3)).toBe(false);
    expect(jumpToCheckpoint(world, -2)).toBe(false);
    expect(jumpToCheckpoint(world, 0.5)).toBe(false);
    expect(jumpToCheckpoint(world, -1)).toBe(true);
    expect(world.camera.x).toBe(0);
    expect(world.stage?.checkpoint).toBe(-1);
  });
});

describe('core/debug counters', () => {
  it('reports pools, rank and RNG calls, and hashes every 60 ticks', () => {
    const world = createWorld(resolveGameConfig({ loadout: 'full' }), EMPTY_CONTENT_DB);
    const counters = createDebugCounters();
    expect(counters.hashTick).toBe(-1);
    collectDebugCounters(world, counters);
    expect(counters).toMatchObject({
      tick: 0,
      enemies: 0,
      enemyCapacity: 64,
      enemyBullets: 0,
      bulletCapacity: 512,
      lasers: 0,
      playerShots: 0,
      shotCapacity: 96,
      items: 0,
      rank: world.rank,
      hashTick: 0,
      stateHash: hashWorld(world),
    });
    const input = createInputSnapshot();
    for (let i = 0; i < 59; i++) stepWorld(world, input);
    world.bullets.spawn(world.camera.x + 100, 100, 0, 0.5, 0);
    world.bullets.spawn(world.camera.x + 120, 100, 0, 0.5, 0);
    world.enemies.enemies[5].state = EnemyState.Live; // a slot in use, as the counter sees it
    collectDebugCounters(world, counters);
    expect(counters.tick).toBe(59);
    expect(counters.hashTick).toBe(0); // not yet
    expect([counters.enemies, counters.enemyBullets]).toEqual([1, 2]);
    expect(counters.playerShots).toBe(world.weapons.pool.count);
    expect(counters.items).toBe(world.powerups.pool.count);
    expect(counters.rngCalls).toBe(world.rng.gameplay.callCount);
    world.enemies.enemies[5].state = EnemyState.Free;
    stepWorld(world, input);
    collectDebugCounters(world, counters);
    expect([counters.hashTick, counters.stateHash]).toEqual([
      DEBUG_HASH_INTERVAL,
      hashWorld(world),
    ]);
    // A new World (the tick went back): hashed at once.
    const fresh = createWorld(resolveGameConfig(), EMPTY_CONTENT_DB);
    collectDebugCounters(fresh, counters);
    expect([counters.tick, counters.hashTick, counters.stateHash]).toEqual([
      0,
      0,
      hashWorld(fresh),
    ]);
  });
});
