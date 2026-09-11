/**
 * Edge-case suite for the World and its tick pipeline (plan M1-06), beyond `world.test.ts`:
 *
 * - a phase trace: every phase runs exactly once per tick, in the §3.2 order, and only `input`
 *   and `fx` run during hit-stop; hit-stop lengths are exact and the view keeps refreshing;
 * - the ship keeps its screen position across hit-stop while the camera scrolls (every camera
 *   step is ridden exactly once);
 * - player 2: read but not moved while inactive, independent once active, drawn in slot order;
 *   short input snapshots;
 * - content-driven tunables (fly-in length, speeds), `startingLives`, status untouched;
 * - pools (registration order, sorted arrays, flush/clear across pools), the grid left built,
 *   stable view identities, the invulnerability blink through `stepWorld`;
 * - lockstep determinism (equal hashes at every checkpoint, one flipped input bit diverges) and
 *   the allocation budget with both players, vertical scroll, hit-stop and pools.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB, loadContent, type ContentDb } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { ENTER_END_X, spawnPlayer } from '../../src/player/index.js';
import { createSoaPool } from '../../src/pools/index.js';
import { SpriteFlag } from '../../src/presentation/index.js';
import { createRng } from '../../src/rng/index.js';
import {
  GRID_MARGIN,
  WORLD_PHASES,
  createWorld,
  stepWorld,
  type World,
  type WorldSystem,
} from '../../src/world/index.js';
import { PLAYFIELD_H, PLAYFIELD_W } from '../../src/config/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/**
 * A content DB with one ship.
 *
 * @param overrides - Fields to change from the KESTREL tunables.
 * @returns The DB.
 */
function shipDb(overrides: Record<string, unknown> = {}): ContentDb {
  const { db, issues } = loadContent([
    {
      path: 'player/test.player.json',
      data: {
        formatVersion: 1,
        kind: 'player',
        ships: [
          {
            id: 'kestrel',
            name: 'KESTREL',
            sprite: 'ships/kestrel',
            speeds: [1.5, 2, 2.5, 3, 3.5, 4],
            hurtRadius: 1.5,
            terrainBox: { hw: 5, hh: 3 },
            pickupBox: { hw: 8, hh: 6 },
            margins: { left: 8, right: 8, top: 6, bottom: 6 },
            enterTicks: 40,
            respawnInvulnTicks: 120,
            bankFrames: 1,
            ...overrides,
          },
        ],
      },
    },
  ]);
  expect(issues).toEqual([]);
  return db;
}

/**
 * A world on the test ship.
 *
 * @param seed - Config seed.
 * @param db - Content.
 * @returns The world.
 */
function world(seed = 1, db: ContentDb = shipDb()): World {
  return createWorld(resolveGameConfig({ seed }), db);
}

/**
 * Steps a world `n` times with held masks for both players.
 *
 * @param w - The world.
 * @param input - Snapshot to reuse.
 * @param n - Ticks.
 * @param p1 - Player 1's held mask.
 * @param p2 - Player 2's held mask.
 */
function run(w: World, input: InputSnapshot, n: number, p1 = 0, p2 = 0): void {
  for (let i = 0; i < n; i++) {
    commitPlayerInput(input.players[0], p1);
    commitPlayerInput(input.players[1], p2);
    stepWorld(w, input);
  }
}

/** The original system functions, restored after each trace test. */
const originalRuns: WorldSystem[] = WORLD_PHASES.map((entry) => entry.run);

afterEach(() => {
  WORLD_PHASES.forEach((entry, i) => {
    (entry as { run: WorldSystem }).run = originalRuns[i];
  });
});

/**
 * Wraps every phase so it logs its name (tick-tagged) before running the real system.
 *
 * @param log - Receives `"<tick>:<name>"` entries.
 */
function tracePhases(log: string[]): void {
  WORLD_PHASES.forEach((entry, i) => {
    const real = originalRuns[i];
    (entry as { run: WorldSystem }).run = (w, input) => {
      log.push(`${w.tick}:${entry.name}`);
      real(w, input);
    };
  });
}

describe('core/world edge cases — the pipeline', () => {
  it('runs every phase once per tick in the §3.2 order; hit-stop keeps only input and fx', () => {
    const log: string[] = [];
    tracePhases(log);
    const w = world();
    const input = createInputSnapshot();
    stepWorld(w, input);
    w.hitStop = 2;
    stepWorld(w, input);
    stepWorld(w, input);
    stepWorld(w, input);
    const all = ['input', 'players', 'stage', 'scripts', 'movement', 'collision', 'damage'];
    expect(log).toEqual([
      ...[...all, 'removal', 'fx'].map((name) => `0:${name}`),
      '1:input',
      '1:fx',
      '2:input',
      '2:fx',
      ...[...all, 'removal', 'fx'].map((name) => `3:${name}`),
    ]);
    expect(w.tick).toBe(4);
  });

  it('freezes for exactly hitStop ticks, never counting below zero', () => {
    for (const length of [1, 2, 7]) {
      const w = world();
      const input = createInputSnapshot();
      run(w, input, 40); // fly-in over
      const x = w.players[0].x;
      w.hitStop = length;
      const frozenTicks: boolean[] = [];
      for (let i = 0; i < length + 3; i++) {
        const before = w.players[0].x;
        run(w, input, 1, Action.Right);
        frozenTicks.push(w.players[0].x === before);
        expect(w.hitStop).toBeGreaterThanOrEqual(0);
      }
      expect(frozenTicks).toEqual([...Array.from({ length }, () => true), false, false, false]);
      expect(w.players[0].x).toBe(x + 3 * 1.5);
    }
  });

  it('keeps refreshing the view during hit-stop (fx runs)', () => {
    const w = world();
    const input = createInputSnapshot();
    run(w, input, 40);
    w.hitStop = 5;
    run(w, input, 1);
    expect(w.playerBatch.count).toBe(1);
    w.players[0].state = 'dead'; // e.g. the damage phase of the previous tick
    run(w, input, 1);
    expect(w.hitStop).toBe(3);
    expect(w.playerBatch.count).toBe(0);
  });

  it('the ship rides every camera step exactly once, across hit-stop too', () => {
    const w = world();
    const input = createInputSnapshot();
    w.camera.vx = 0.75;
    w.camera.vy = -0.25;
    run(w, input, 45); // alive, riding
    const sx = w.players[0].x - w.camera.x;
    const sy = w.players[0].y - w.camera.y;
    w.hitStop = 6;
    run(w, input, 30);
    expect(w.players[0].x - w.camera.x).toBeCloseTo(sx, 9);
    expect(w.players[0].y - w.camera.y).toBeCloseTo(sy, 9);
    // The camera itself did not move during the six frozen ticks.
    expect(w.camera.x).toBeCloseTo(0.75 * (45 + 30 - 6), 9);
  });

  it('leaves the status alone and keeps ticking whatever it is', () => {
    const w = world();
    const input = createInputSnapshot();
    for (const status of ['bossWarning', 'stageClear', 'gameOver', 'playing'] as const) {
      w.status = status;
      run(w, input, 3);
      expect(w.status).toBe(status);
    }
    expect(w.tick).toBe(12);
  });

  it('draws no randomness in the M1-06 systems (both RNG streams untouched)', () => {
    const w = world();
    const input = createInputSnapshot();
    const rng = createRng(0);
    for (let i = 0; i < 500; i++) {
      commitPlayerInput(input.players[0], rng.rangeInt(0, 15));
      stepWorld(w, input);
    }
    expect([w.rng.gameplay.callCount, w.rng.cosmetic.callCount]).toEqual([0, 0]);
    expect(w.events.length).toBe(0); // nothing emits presentation events yet
  });
});

describe('core/world edge cases — players', () => {
  it('reads an inactive P2 (intent and device) but never moves or draws it', () => {
    const w = world();
    const input = createInputSnapshot();
    input.players[1].device = 'gamepad';
    const p2 = w.players[1];
    const before = { x: p2.x, y: p2.y, state: p2.state, stateTicks: p2.stateTicks };
    run(w, input, 50, 0, Action.Down | Action.Left);
    expect(w.intents[1]).toMatchObject({ held: Action.Down | Action.Left, moveX: -1, moveY: 1 });
    expect(w.intents[1].device).toBe('gamepad');
    expect({ x: p2.x, y: p2.y, state: p2.state, stateTicks: p2.stateTicks }).toEqual(before);
    expect(p2.device).toBe('none'); // the ship itself is not updated
    expect(w.playerBatch.count).toBe(1);
  });

  it('moves an activated P2 by its own input, independently of P1', () => {
    const w = world();
    const input = createInputSnapshot();
    const [p1, p2] = w.players;
    p2.active = true;
    spawnPlayer(p2, w.camera);
    run(w, input, 40);
    expect([p1.state, p2.state]).toEqual(['alive', 'alive']);
    run(w, input, 10, Action.Up, Action.Down);
    expect(p1.y).toBe(PLAYFIELD_H / 2 - 15);
    expect(p2.y).toBe(PLAYFIELD_H / 2 + 15);
    expect([p1.x, p2.x]).toEqual([ENTER_END_X, ENTER_END_X]);
    // Both drawn, slot order, each with its own bank frame (up = 1, down = 2).
    expect(w.playerBatch.count).toBe(2);
    expect([w.playerBatch.y[0], w.playerBatch.y[1]]).toEqual([p1.y, p2.y]);
    expect([w.playerBatch.frame[0], w.playerBatch.frame[1]]).toEqual([1, 2]);
    // P1 dead: P2 moves up to index 0.
    p1.state = 'dead';
    run(w, input, 1);
    expect(w.playerBatch.count).toBe(1);
    expect(w.playerBatch.y[0]).toBe(p2.y);
  });

  it('tolerates an input snapshot with fewer entries than players', () => {
    const w = world();
    const short: InputSnapshot = {
      players: [{ held: Action.Right, pressed: 0, released: 0, device: 'keyboard' }],
    };
    for (let i = 0; i < 41; i++) stepWorld(w, short);
    expect(w.players[0].x).toBe(ENTER_END_X + 1.5);
    expect(w.intents[1].held).toBe(0);
  });

  it('takes the fly-in length and speeds from the content', () => {
    const w = world(1, shipDb({ enterTicks: 10, speeds: [3] }));
    const input = createInputSnapshot();
    run(w, input, 9);
    expect(w.players[0].state).toBe('entering');
    run(w, input, 1);
    expect([w.players[0].state, w.players[0].x]).toEqual(['alive', ENTER_END_X]);
    run(w, input, 2, Action.Right);
    expect(w.players[0].x).toBe(ENTER_END_X + 6);
  });

  it('gives both ships config.startingLives', () => {
    const w = createWorld(resolveGameConfig({ startingLives: 5 }), EMPTY_CONTENT_DB);
    expect(w.players.map((p) => p.lives)).toEqual([5, 5]);
    expect(w.players.map((p) => p.slot)).toEqual([0, 1]);
  });

  it('blinks through stepWorld: hidden while invulnTicks & 4 after the players phase', () => {
    const w = world();
    const input = createInputSnapshot();
    run(w, input, 40);
    w.players[0].invulnTicks = 10;
    const hidden: boolean[] = [];
    for (let i = 0; i < 10; i++) {
      run(w, input, 1);
      hidden.push((w.playerBatch.flags[0] & SpriteFlag.Hidden) !== 0);
    }
    // invulnTicks after each tick: 9 8 7 6 5 4 3 2 1 0.
    expect(hidden).toEqual([false, false, true, true, true, true, false, false, false, false]);
    expect(w.playerBatch.count).toBe(1);
  });
});

describe('core/world edge cases — pools, grid and view', () => {
  it('keeps pools in registration order and flushes / clears every one', () => {
    const w = world();
    const a = w.pools.register('a', createSoaPool(4, { z: 'f64', a: 'u8', m: 'i32' }));
    const b = w.pools.register('b', createSoaPool(4, { x: 'f32' }));
    expect(w.pools.entries.map((e) => e.name)).toEqual(['a', 'b']);
    expect(w.pools.entries[0].arrays).toEqual([a.fields.a, a.fields.m, a.fields.z]);
    expect(w.pools.entries[1].pool).toBe(b);
    a.alloc();
    a.alloc();
    b.alloc();
    a.free(0);
    b.free(0);
    expect([a.count, b.count]).toEqual([2, 1]); // frees are deferred
    stepWorld(w, createInputSnapshot());
    expect([a.count, b.count]).toEqual([1, 0]);
    b.alloc();
    w.pools.clearAll();
    expect([a.count, b.count]).toEqual([0, 0]);
  });

  it('leaves the broad-phase grid built and empty after every tick, sized to the view', () => {
    const w = world();
    expect([w.grid.cols, w.grid.rows]).toEqual([
      Math.ceil((PLAYFIELD_W + 2 * GRID_MARGIN) / 32),
      Math.ceil((PLAYFIELD_H + 2 * GRID_MARGIN) / 32),
    ]);
    w.camera.vx = 3;
    run(w, createInputSnapshot(), 5);
    expect([w.grid.count, w.grid.dropped]).toEqual([0, 0]);
    expect(w.grid.query(-1e9, -1e9, 1e9, 1e9, () => {})).toBe(0); // queryable (built)
  });

  it('keeps the view objects stable across ticks (the renderer binds them once)', () => {
    const w = world();
    const view = w.view;
    const batches = view.batches;
    const batch = w.playerBatch;
    w.camera.vx = 1;
    run(w, createInputSnapshot(), 100, Action.Up);
    expect(w.view).toBe(view);
    expect(w.view.batches).toBe(batches);
    expect(w.view.batches[2]).toBe(batch);
    expect(w.view.batches[0]).toBe(w.enemies.groundBatch);
    expect(w.view.camera).toBe(w.camera);
    expect(w.view.camera.x).toBe(100);
  });
});

describe('core/world edge cases — determinism and allocation', () => {
  /**
   * A scripted session with both players, scrolling in both axes, hit-stops and a pool.
   *
   * @param seed - World seed.
   * @param flip - Tick at which P1's input gets its Up bit flipped (-1 = never).
   * @returns `hashWorld` after every tick.
   */
  const session = (seed: number, flip = -1): number[] => {
    const w = world(seed);
    const input = createInputSnapshot();
    const script = createRng(99);
    const pool = w.pools.register('shots', createSoaPool(16, { x: 'f64', y: 'f64' }));
    w.players[1].active = true;
    spawnPlayer(w.players[1], w.camera);
    const hashes: number[] = [];
    let p1 = 0;
    let p2 = 0;
    for (let t = 0; t < 2000; t++) {
      if (t % 5 === 0) p1 = script.rangeInt(0, 15);
      if (t % 9 === 0) p2 = script.rangeInt(0, 15);
      if (t % 250 === 0) {
        w.camera.vx = script.rangeInt(0, 4) / 4;
        w.camera.vy = script.rangeInt(-2, 2) / 8;
      }
      if (t % 333 === 0) w.hitStop = script.rangeInt(1, 6);
      const slot = pool.alloc();
      if (slot >= 0) pool.fields.x[slot] = w.players[0].x;
      if (t % 3 === 0 && pool.count > 0) pool.free(0);
      commitPlayerInput(input.players[0], t === flip ? p1 ^ Action.Up : p1);
      commitPlayerInput(input.players[1], p2);
      stepWorld(w, input);
      hashes.push(hashWorld(w));
    }
    return hashes;
  };

  it('two worlds in lockstep hash equal after every one of 2,000 ticks', () => {
    const a = session(5);
    expect(a).toHaveLength(2000);
    expect(session(5)).toEqual(a);
    expect(session(6)).not.toEqual(a);
  });

  it('one flipped input bit on one tick changes the hash from that tick on', () => {
    const a = session(5);
    const b = session(5, 1010); // outside the hit-stop that starts at tick 999
    expect(b.slice(0, 1010)).toEqual(a.slice(0, 1010));
    expect(b[1010]).not.toBe(a[1010]);
  });

  it('stays within the allocation budget with both players, 2-axis scroll and hit-stop', () => {
    const w = world();
    const input = createInputSnapshot();
    const pool = w.pools.register('dummy', createSoaPool(32, { x: 'f64' }));
    w.players[1].active = true;
    spawnPlayer(w.players[1], w.camera);
    w.camera.vx = 0.5;
    w.camera.vy = 0.125;
    const masks = [Action.Up, Action.Down | Action.Right, 0, Action.Left, Action.Up | Action.Left];
    const growth = measureHeapGrowth(
      (i) => {
        commitPlayerInput(input.players[0], masks[(i >> 3) % masks.length]);
        commitPlayerInput(input.players[1], masks[(i >> 4) % masks.length]);
        if ((i & 255) === 0) w.hitStop = 3;
        if ((i & 511) === 0) w.camera.vy = -w.camera.vy;
        const slot = pool.alloc();
        if (slot >= 0) pool.free(slot);
        stepWorld(w, input);
      },
      10_000,
      20_000,
    );
    expect(growth.bytes).toBeLessThan(256 * 1024);
  });

  it('does not box the fractional camera position into the grid every tick (regression)', () => {
    // Regression: phase 6 passed `camera.x - GRID_MARGIN` (fractional while scrolling) to
    // `grid.begin`, and V8 boxed each fractional argument (16 B per scrolling axis per tick,
    // ~32 B/tick here — past the plan's 256 KB per 10,000 ticks once M1-07 scrolls).
    const w = world();
    const input = createInputSnapshot();
    w.camera.vx = 0.3;
    w.camera.vy = 0.17;
    const growth = measureHeapGrowth(
      (i) => {
        if ((i & 1023) === 0) {
          w.camera.vx = -w.camera.vx;
          w.camera.vy = -w.camera.vy;
        }
        stepWorld(w, input);
      },
      10_000,
      20_000,
    );
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });

  it('allocates nothing per tick on the built-in default ship (empty content) either', () => {
    const w = createWorld(resolveGameConfig({ seed: 3 }), EMPTY_CONTENT_DB);
    const input = createInputSnapshot();
    w.camera.vx = 0.5;
    const masks = [Action.Right, Action.Right | Action.Up, Action.Down, Action.Down | Action.Left];
    const growth = measureHeapGrowth(
      (i) => {
        commitPlayerInput(input.players[0], masks[i & 3]);
        stepWorld(w, input);
      },
      10_000,
      20_000,
    );
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
