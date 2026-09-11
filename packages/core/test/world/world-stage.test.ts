/**
 * The World running a stage (plan M1-07): `config.stage` selects it (unknown ids throw), the
 * runner drives the camera in phase 3 and the ship rides along, the stage theme and timeline
 * music become presentation events, `end` clears the stage, a checkpoint restart empties the
 * pools, the view carries the parallax bands and the terrain, the ship's terrain box against the
 * terrain is reported through `playerHit` (not while flying in, not in god mode), and a stage
 * world stays deterministic and allocation-free.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { MUSIC_CUES, SimEventKind } from '../../src/events/index.js';
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { PlayerHitCause } from '../../src/player/index.js';
import { createSoaPool } from '../../src/pools/index.js';
import { LayerId } from '../../src/presentation/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

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
 * Content with the KESTREL, the `terrain-a` tileset and a test stage.
 *
 * @param stage - Stage fields over the defaults (a floor from x 0 at 48 px, speed 1).
 * @returns The DB.
 */
function stageDb(stage: Record<string, unknown> = {}): ContentDb {
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
        length: 3000,
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [{ x: 0 }, { x: 600 }],
        parallax: [{ layer: 'far', sprite: 'bg/stars-far', factor: 0.5, y: 0, spacing: 128 }],
        tilemap: {
          tileSize: 8,
          tileset: 'terrain-a',
          rowsTall: 25,
          generator: {
            type: 'heightfield',
            segments: [{ from: 0, to: 3384, floor: { base: 48, amp: 0, period: 64, seed: 1 } }],
          },
        },
        events: [
          { x: 100, type: 'music', cue: 'Boss' },
          { x: 3000, type: 'end' },
        ],
        ...stage,
      },
    },
  ]);
  expect(issues).toEqual([]);
  return db;
}

/**
 * A world on the test stage.
 *
 * @param db - Content.
 * @param seed - Config seed.
 * @returns The world.
 */
function world(db = stageDb(), seed = 1): World {
  return createWorld(resolveGameConfig({ seed, stage: 't' }), db);
}

/**
 * Steps a world `n` times with one held mask for player 1.
 *
 * @param w - The world.
 * @param input - Snapshot to reuse.
 * @param held - Held actions.
 * @param n - Ticks.
 */
function run(w: World, input: InputSnapshot, held: number, n: number): void {
  for (let i = 0; i < n; i++) {
    commitPlayerInput(input.players[0], held);
    stepWorld(w, input);
  }
}

/** Drains a world's events into `[kind, id]` pairs. */
function drain(w: World): [number, number][] {
  const out: [number, number][] = [];
  w.events.drain((event) => out.push([event.kind, event.id]));
  return out;
}

describe('core/world with a stage — setup', () => {
  it('throws for a stage id the content does not have; null keeps free flight', () => {
    expect(() => createWorld(resolveGameConfig({ stage: 'nope' }), stageDb())).toThrow(
      /no stage "nope"/,
    );
    const free = createWorld(resolveGameConfig({}), stageDb());
    expect([free.stage, free.terrain, free.parallax, free.view.terrain]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('rejects an empty or non-string stage id in the config', () => {
    expect(() => resolveGameConfig({ stage: '' })).toThrow(RangeError);
    expect(() => resolveGameConfig({ stage: 7 as unknown as string })).toThrow(RangeError);
    expect(resolveGameConfig({}).stage).toBeNull();
  });

  it('exposes the runner, the terrain copy and the parallax / terrain views', () => {
    const db = stageDb();
    const w = world(db);
    expect(w.stage?.stage.id).toBe('t');
    expect(w.stage?.camera).toBe(w.camera);
    expect(w.terrain?.tiles).not.toBe(db.stages[0].terrain?.tiles);
    expect(w.view.terrain?.tiles).toBe(w.terrain?.tiles);
    expect(w.view.parallax).toBe(w.parallax);
    expect(w.parallax?.layer[0]).toBe(LayerId.BgFar);
  });

  it('queues the stage theme as a music event at creation', () => {
    expect(drain(world())).toEqual([[SimEventKind.Music, MUSIC_CUES.Stage]]);
  });
});

describe('core/world with a stage — ticking', () => {
  it('scrolls the camera from the stage path; the ship rides along', () => {
    const w = world();
    const input = createInputSnapshot();
    run(w, input, 0, 60);
    expect(w.camera.x).toBe(60);
    expect(w.camera.dx).toBe(1);
    const screenX = w.players[0].x - w.camera.x;
    run(w, input, 0, 30);
    expect(w.players[0].x - w.camera.x).toBe(screenX);
    expect(w.parallax?.offsetX[0]).toBe(45); // 90 × 0.5
  });

  it('turns timeline music into a presentation event and clears the stage at `end`', () => {
    const w = world(
      stageDb({
        length: 300,
        checkpoints: [],
        events: [
          { x: 100, type: 'music', cue: 'Boss' },
          { x: 300, type: 'end' },
        ],
      }),
    );
    const input = createInputSnapshot();
    drain(w);
    run(w, input, 0, 100);
    expect(drain(w)).toEqual([[SimEventKind.Music, MUSIC_CUES.Boss]]);
    expect(w.status).toBe('playing');
    run(w, input, 0, 200);
    expect(w.status).toBe('stageClear');
    expect(w.stage?.ended).toBe(true);
  });

  it('empties the pools on a checkpoint restart', () => {
    const w = world();
    const pool = w.pools.register('bullets', createSoaPool(4, { x: 'f64' }));
    pool.alloc();
    pool.alloc();
    w.stage?.restartAt(1);
    expect(pool.count).toBe(0);
    expect(w.camera.x).toBe(600);
  });
});

describe('core/world with a stage — terrain hits', () => {
  it('reports the terrain box touching the floor through playerHit (after the fly-in)', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    // The floor top is at world y 200 - 48 = 152; the ship spawns at y 100.
    run(w, input, Action.Down, 20); // still flying in: ignored
    expect(ship.hits).toBe(0);
    run(w, input, Action.Down, 60);
    expect(ship.state).toBe('alive');
    expect(ship.hits).toBeGreaterThan(0);
    expect(ship.hitCause).toBe(PlayerHitCause.Terrain);
    expect(ship.hitTick).toBe(w.tick - 1);
    // Clear of the floor again: no new hits.
    run(w, input, Action.Up, 40);
    const hits = ship.hits;
    run(w, input, 0, 10);
    expect(ship.hits).toBe(hits);
  });

  it('ignores terrain in god mode and while invulnerable', () => {
    const w = world();
    const input = createInputSnapshot();
    w.debugFlags.godMode = true;
    run(w, input, Action.Down, 120);
    expect(w.players[0].hits).toBe(0);
    w.debugFlags.godMode = false;
    w.players[0].invulnTicks = 30;
    run(w, input, Action.Down, 20);
    expect(w.players[0].hits).toBe(0);
    run(w, input, Action.Down, 20);
    expect(w.players[0].hits).toBeGreaterThan(0);
  });
});

describe('core/world with a stage — determinism and allocation', () => {
  it('gives equal hashes for equal inputs and covers the stage state', () => {
    const db = stageDb();
    const a = world(db, 9);
    const b = world(db, 9);
    const input = createInputSnapshot();
    const masks = [Action.Down, Action.Right | Action.Down, Action.Up, 0, Action.Left];
    for (let i = 0; i < 5000; i++) {
      commitPlayerInput(input.players[0], masks[(i >> 4) % masks.length]);
      stepWorld(a, input);
      stepWorld(b, input);
      if (i === 2000) {
        a.stage?.restartAt(1);
        b.stage?.restartAt(1);
      }
    }
    expect(hashWorld(a)).toBe(hashWorld(b));
    b.stage?.unlock(); // no effect on an unlocked runner
    expect(hashWorld(a)).toBe(hashWorld(b));
    b.stage?.restartAt(0);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('allocates nothing per tick while scrolling, colliding and firing events', () => {
    const events: unknown[] = [];
    for (let x = 50; x < 2900; x += 50) {
      events.push(
        x % 100 === 0 ? { x, type: 'music', cue: 'Stage' } : { x, type: 'flag', flag: 'f' },
      );
    }
    const w = world(
      stageDb({
        camera: [
          { x: 0, speed: 1.25, ramp: 30 },
          { x: 1500, speed: 0.75, ramp: 20 },
        ],
        events,
      }),
    );
    const input = createInputSnapshot();
    const masks = [Action.Down, Action.Down | Action.Right, Action.Up, Action.Up | Action.Left];
    const growth = measureHeapGrowth(
      (i) => {
        commitPlayerInput(input.players[0], masks[(i >> 5) & 3]);
        if (i % 3000 === 2999) w.stage?.restartAt(i % 6000 === 2999 ? 0 : 1);
        stepWorld(w, input);
        w.events.clear();
      },
      10_000,
      20_000,
    );
    expect(w.players[0].hits).toBeGreaterThan(0);
    expect(growth.bytes).toBeLessThan(256 * 1024);
  });
});
