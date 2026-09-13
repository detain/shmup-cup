/**
 * Tests for the World and its tick pipeline (plan M1-06): the initial session, the fixed phase
 * order of plan §3.2, the fly-in and movement through `stepWorld`, hit-stop skipping phases 2–8,
 * the camera scroll the ship rides along with, deferred pool flushes, the players' mirror batch,
 * determinism (equal `hashWorld` after 5,000 ticks with the same seed and inputs) and the
 * allocation guard (< 256 KB over 10,000 `stepWorld` calls after warm-up).
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB, loadContent, type ContentDb } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { DIAGONAL_SCALE, ENTER_END_X, ENTER_START_X, SPAWN_Y } from '../../src/player/index.js';
import { createSoaPool } from '../../src/pools/index.js';
import { LayerId, SpriteFlag } from '../../src/presentation/index.js';
import { createRng } from '../../src/rng/index.js';
import {
  WORLD_PHASES,
  WORLD_PHASE_NAMES,
  WORLD_STATUSES,
  WorldPhase,
  createWorld,
  moduleInfo,
  stepWorld,
  syncWorldView,
  type World,
} from '../../src/world/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/** A content DB with one ship, `kestrel`, whose sprite is `ships/kestrel`. */
function kestrelDb(): ContentDb {
  const { db, issues } = loadContent([
    {
      path: 'player/kestrel.player.json',
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
 * @returns The world.
 */
function world(seed = 1): World {
  return createWorld(resolveGameConfig({ seed }), kestrelDb());
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

describe('core/world', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('world');
    expect(moduleInfo.status).toBe('implemented');
    expect(WORLD_STATUSES).toEqual(['playing', 'bossWarning', 'stageClear', 'gameOver']);
  });

  it('starts at tick 0 with P1 entering from the left, P2 inactive, a static camera', () => {
    const w = world(9);
    expect(w.tick).toBe(0);
    expect(w.status).toBe('playing');
    expect(w.hitStop).toBe(0);
    expect(w.ship.id).toBe('kestrel');
    expect(w.players).toHaveLength(2);
    expect(w.intents).toHaveLength(2);
    const [p1, p2] = w.players;
    expect([p1.active, p1.state, p1.x, p1.y, p1.lives]).toEqual([
      true,
      'entering',
      ENTER_START_X,
      SPAWN_Y,
      3,
    ]);
    expect([p2.active, p2.slot]).toEqual([false, 1]);
    expect(w.camera).toEqual({ x: 0, y: 0, dx: 0, dy: 0, vx: 0, vy: 0 });
    expect(w.debugFlags).toEqual({
      godMode: false,
      showHitboxes: false,
      showGrid: false,
      frameAdvance: false,
      slowMo: 1,
      overlay: false,
    });
    expect(w.rng.gameplay.nextU32()).toBe(createRng(9).nextU32());
  });

  it('exposes a WorldView: live camera, no parallax/terrain yet, enemy, shot, option, player, bullet, shield, item and boss batches', () => {
    const w = world();
    expect(w.view.camera).toBe(w.camera);
    expect([w.view.parallax, w.view.terrain]).toEqual([null, null]);
    expect(w.view.batches).toHaveLength(10);
    expect(w.view.batches[0]).toBe(w.enemies.groundBatch);
    expect(w.view.batches[1]).toBe(w.enemies.airBatch);
    expect(w.view.batches[2]).toBe(w.weapons.batch);
    expect(w.view.batches[3]).toBe(w.weapons.optionBatch);
    expect(w.view.batches[4]).toBe(w.playerBatch);
    expect(w.view.batches[5]).toBe(w.bullets.batch);
    expect(w.view.batches[6]).toBe(w.powerups.shieldBatch);
    expect(w.view.batches[7]).toBe(w.powerups.itemBatch);
    expect(w.view.batches[8]).toBe(w.bullets.pointBatch);
    expect(w.view.batches[9]).toBe(w.bosses.batch);
    expect(w.view.lasers).toBe(w.bullets.laserView);
    expect(w.view.bendingLasers).toBe(w.bullets.bending);
    expect(w.view.warning).toBe(w.bosses.warning);
    expect(w.view.batches.map((b) => b.layer)).toEqual([
      LayerId.GroundEnemies,
      LayerId.AirEnemies,
      LayerId.PlayerShots,
      LayerId.Player,
      LayerId.Player,
      LayerId.EnemyBullets,
      LayerId.Player,
      LayerId.Items,
      LayerId.Items,
      LayerId.AirEnemies,
    ]);
    expect(w.playerBatch.layer).toBe(LayerId.Player);
    // Filled at creation, so the first frame already shows the ship.
    expect(w.playerBatch.count).toBe(1);
    expect(w.content.sprites.names[w.playerBatch.spriteId[0]]).toBe('ships/kestrel');
    expect([w.playerBatch.x[0], w.playerBatch.y[0], w.playerBatch.frame[0]]).toEqual([
      ENTER_START_X,
      SPAWN_Y,
      0,
    ]);
  });

  it('does not draw the built-in default ship of an empty content DB', () => {
    const w = createWorld(resolveGameConfig({}), EMPTY_CONTENT_DB);
    expect(w.ship.spriteId).toBe(-1);
    expect(w.playerBatch.count).toBe(0);
    stepWorld(w, createInputSnapshot());
    expect(w.players[0].x).toBeGreaterThan(ENTER_START_X); // it still flies
  });

  it('runs the phases of plan §3.2 in their fixed order', () => {
    expect(WORLD_PHASES.map((phase) => phase.name)).toEqual([...WORLD_PHASE_NAMES]);
    expect(WORLD_PHASE_NAMES).toEqual([
      'input',
      'players',
      'stage',
      'scripts',
      'movement',
      'collision',
      'damage',
      'removal',
      'fx',
    ]);
    WORLD_PHASES.forEach((entry, i) => expect(entry.phase).toBe(i));
    expect(WORLD_PHASES.filter((p) => p.runsDuringHitStop).map((p) => p.phase)).toEqual([
      WorldPhase.Input,
      WorldPhase.Fx,
    ]);
    expect(Object.isFrozen(WORLD_PHASES)).toBe(true);
  });

  it('flies in for 40 ticks, then moves with the input', () => {
    const w = world();
    const input = createInputSnapshot();
    run(w, input, Action.Down, 39);
    expect(w.players[0].state).toBe('entering');
    run(w, input, Action.Down, 1);
    expect(w.tick).toBe(40);
    expect([w.players[0].state, w.players[0].x, w.players[0].y]).toEqual([
      'alive',
      ENTER_END_X,
      SPAWN_Y,
    ]);
    run(w, input, Action.Down | Action.Right, 1);
    expect(w.players[0].x).toBe(ENTER_END_X + 1.5 * DIAGONAL_SCALE);
    expect(w.players[0].y).toBe(SPAWN_Y + 1.5 * DIAGONAL_SCALE);
    expect(w.intents[0].moveY).toBe(1);
    expect(w.players[0].device).toBe('none'); // the snapshot's device kind
    // The mirror batch follows, with the banking-down frame.
    expect([w.playerBatch.x[0], w.playerBatch.y[0], w.playerBatch.frame[0]]).toEqual([
      w.players[0].x,
      w.players[0].y,
      2,
    ]);
  });

  it('hit-stop skips phases 2–8 but the tick and the fx countdown advance', () => {
    const w = world();
    const input = createInputSnapshot();
    run(w, input, 0, 40);
    w.camera.vx = 1;
    w.hitStop = 3;
    const x = w.players[0].x;
    const pool = w.pools.register('shots', createSoaPool(8, { x: 'f64' }));
    pool.alloc();
    pool.free(0);
    run(w, input, Action.Right, 3);
    expect(w.tick).toBe(43);
    expect(w.hitStop).toBe(0);
    expect(w.players[0].x).toBe(x); // players phase skipped
    expect(w.camera.x).toBe(0); // stage phase skipped
    expect(pool.count).toBe(1); // removal phase skipped
    expect(w.intents[0].held).toBe(Action.Right); // the input phase still ran
    run(w, input, Action.Right, 1);
    expect(w.players[0].x).toBe(x + 1.5);
    expect(w.camera.x).toBe(1);
    expect(pool.count).toBe(0);
  });

  it('scrolls the camera by its velocity; the ship keeps its screen position', () => {
    const w = world();
    const input = createInputSnapshot();
    w.camera.vx = 0.5;
    run(w, input, 0, 40);
    // The fly-in is camera-relative.
    expect(w.players[0].x - w.camera.x).toBe(ENTER_END_X - 0.5); // camera moved after the players
    const screenX = w.players[0].x - w.camera.x;
    run(w, input, 0, 100);
    expect(w.camera.x).toBe(70);
    expect(w.camera.dx).toBe(0.5);
    expect(w.players[0].x - w.camera.x).toBeCloseTo(screenX, 12);
  });

  it('registers pools once and flushes their deferred frees in the removal phase', () => {
    const w = world();
    const pool = w.pools.register('bullets', createSoaPool(4, { y: 'f64', x: 'f64' }));
    expect(() => w.pools.register('bullets', createSoaPool(4, { x: 'f64' }))).toThrow(
      /already registered/,
    );
    // The bullet, weapon and power-up systems registered their pools first (M1-09 … M1-11).
    expect(w.pools.entries.map((e) => e.name)).toEqual([
      'enemyBullets',
      'enemyLasers',
      'cancelPoints',
      'playerShots',
      'items',
      'bullets',
    ]);
    expect(w.pools.entries[5].arrays).toEqual([pool.fields.x, pool.fields.y]);
    pool.alloc();
    pool.alloc();
    pool.free(1);
    stepWorld(w, createInputSnapshot());
    expect(pool.count).toBe(1);
    w.pools.clearAll();
    expect(pool.count).toBe(0);
  });

  it('blinks the ship while invulnerable and hides dead ships', () => {
    const w = world();
    const p1 = w.players[0];
    p1.invulnTicks = 4;
    syncWorldView(w);
    expect(w.playerBatch.flags[0] & SpriteFlag.Hidden).toBe(SpriteFlag.Hidden);
    p1.invulnTicks = 3;
    syncWorldView(w);
    expect(w.playerBatch.flags[0]).toBe(0);
    p1.state = 'dead';
    syncWorldView(w);
    expect(w.playerBatch.count).toBe(0);
    w.players[1].active = true;
    w.players[1].state = 'alive';
    syncWorldView(w);
    expect(w.playerBatch.count).toBe(1);
  });

  it('is deterministic: same seed and inputs give equal hashes after 5,000 ticks', () => {
    /**
     * Runs a world over a pseudo-random input script (its own RNG, so both runs see the same).
     *
     * @param seed - World seed.
     * @param scriptSeed - Input script seed.
     * @returns The final hash.
     */
    const simulate = (seed: number, scriptSeed: number): number => {
      const w = world(seed);
      const input = createInputSnapshot();
      const script = createRng(scriptSeed);
      let held = 0;
      for (let t = 0; t < 5000; t++) {
        if (t % 7 === 0) held = script.rangeInt(0, 0xfff);
        if (t === 2500) w.camera.vx = 0.75;
        if (t === 3000) w.hitStop = 8;
        if (t % 400 === 0) w.players[0].speedLevel = script.rangeInt(0, 5);
        commitPlayerInput(input.players[0], held);
        stepWorld(w, input);
      }
      expect(w.tick).toBe(5000);
      return hashWorld(w);
    };
    const a = simulate(42, 7);
    expect(simulate(42, 7)).toBe(a);
    expect(simulate(42, 8)).not.toBe(a); // other inputs
    expect(simulate(43, 7)).not.toBe(a); // other seed (RNG state is hashed)
  });

  it('allocates nothing per tick: < 256 KB over 10,000 stepWorld calls after warm-up', () => {
    const w = world();
    const pool = w.pools.register('dummy', createSoaPool(64, { x: 'f64', flags: 'u8' }));
    const input = createInputSnapshot();
    const masks = [Action.Up, Action.Up | Action.Right, Action.Right, 0, Action.Down | Action.Left];
    w.camera.vx = 0.25;
    const growth = measureHeapGrowth((i) => {
      commitPlayerInput(input.players[0], masks[(i >> 3) % masks.length]);
      if ((i & 63) === 0) w.hitStop = 2;
      const slot = pool.alloc();
      if (slot >= 0) pool.free(slot);
      stepWorld(w, input);
    }, 10_000);
    expect(growth.bytes).toBeLessThan(256 * 1024);
  });
});
