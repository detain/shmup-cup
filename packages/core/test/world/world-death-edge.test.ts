/**
 * Edge cases of the life cycle inside the World (plan M1-12), beyond `world-death.test.ts`:
 *
 * - co-op deaths on the same tick (both ships die, one hit-stop, one shake, a duck and a rumble
 *   per ship) and a shared game over, also from `bossWarning`;
 * - what the death leaves alone (uncancelable bullets) and what the hit-stop freezes (autofire,
 *   events, tools' kills — credited once when the World thaws);
 * - the death tick still scores (pickups, kills) and the penalty comes after the pickup;
 * - after a respawn: bullets pass through and stay, enemy contact does not kill, the view blinks
 *   the ship; dying / dead ships are not drawn;
 * - lives: five ships take five deaths; the classic penalty strips one level per death down to
 *   the basic ship, the casual one never does;
 * - arcade restarts: at the stage start without checkpoints, the timeline after the checkpoint
 *   plays again (events before it do not), the score survives the restart without double credit,
 *   a co-op partner still exploding is left alone, two ships that died together respawn together;
 * - lockstep determinism (per-tick `hashWorld`) through co-op deaths, arcade restarts and the
 *   game over.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BulletFlag, BulletKind, spawnBullet } from '../../src/bullets/index.js';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { EnemyState, type Enemy } from '../../src/enemies/index.js';
import { SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import {
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { MAX_OPTIONS } from '../../src/options/index.js';
import {
  ENTER_START_X,
  PLAYER_DEAD_TICKS,
  PLAYER_DYING_TICKS,
  PlayerHitCause,
  playerHit,
  playerOut,
  spawnPlayer,
  type PlayerShip,
} from '../../src/player/index.js';
import { CAPSULE_SCORE, ItemKind, MeterSlot } from '../../src/powerups/index.js';
import { SpriteFlag } from '../../src/presentation/index.js';
import { MainWeapon } from '../../src/weapons/index.js';
import {
  DEATH_HIT_STOP_TICKS,
  DEATH_SHAKE_TICKS,
  ENGINE_SPRITES,
  createWorld,
  stepWorld,
  type World,
} from '../../src/world/index.js';

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
 * An open stage (no terrain) scrolling at 1 px/tick.
 *
 * @param id - Stage id.
 * @param checkpoints - Checkpoint xs.
 * @param events - Timeline events.
 * @returns The stage file.
 */
function stage(id: string, checkpoints: number[], events: unknown[] = []): ContentFile {
  return {
    path: `stages/${id}.stage.json`,
    data: {
      formatVersion: 1,
      kind: 'stage',
      id,
      name: id.toUpperCase(),
      music: { stage: 'Stage', boss: 'Boss' },
      length: 5000,
      camera: [{ x: 0, speed: 1 }],
      checkpoints: checkpoints.map((x) => ({ x })),
      parallax: [],
      tilemap: { tileSize: 8, tileset: 'terrain-a', rowsTall: 25, rle: Array(25).fill('') },
      events,
    },
  };
}

/**
 * Test content: the KESTREL, Type A, scriptless test enemies (`target` 1000 hp / 100 points,
 * `weak` 1 hp / 250 points) and three open stages — `run` (checkpoints 0 and 300), `bare` (no
 * checkpoint) and `timeline` (checkpoint 300, a `weak` spawn at 100 and a `target` spawn at 450,
 * both high above the ship's line).
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const enemy = (id: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id,
    hp: 1000,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    script: 'test.idle',
    sprite: 'enemies/drifter',
    drop: null,
    ...over,
  });
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      shipped('tilesets/terrain-a.tileset.json'),
      {
        path: 'enemies/t.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [enemy('target'), enemy('weak', { hp: 1, score: 250 })],
        },
      },
      stage('run', [0, 300]),
      stage('bare', []),
      stage(
        'timeline',
        [0, 300],
        [
          { x: 100, type: 'spawn', enemy: 'weak', y: 20 },
          { x: 450, type: 'spawn', enemy: 'target', y: 24 },
        ],
      ),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/** The shared DB (read-only). */
const DB = db();

/**
 * A world whose player 1 is alive (autofire off unless asked), events drained.
 *
 * @param config - Config overrides (default: the `run` stage).
 * @returns The world.
 */
function world(config: Partial<GameConfig> = {}): World {
  const w = createWorld(
    resolveGameConfig({ seed: 5, stage: 'run', autofire: false, remoteMode: false, ...config }),
    DB,
  );
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  w.events.clear();
  return w;
}

/**
 * Brings player 2 into a world (co-op), alive `dy` pixels below player 1.
 *
 * @param w - The world.
 * @param dy - Vertical offset from player 1.
 * @returns Player 2's ship.
 */
function joinP2(w: World, dy = 40): PlayerShip {
  const p2 = w.players[1];
  p2.active = true;
  spawnPlayer(p2, w.camera);
  const input = createInputSnapshot();
  while (p2.state !== 'alive') stepWorld(w, input);
  p2.y = w.players[0].y + dy;
  w.events.clear();
  return p2;
}

/**
 * Steps a world, player 1 holding `held`, and returns the tick's events.
 *
 * @param w - The world.
 * @param input - The snapshot (kept across ticks).
 * @param held - Actions held.
 * @returns The events.
 */
function tick(w: World, input: InputSnapshot, held = 0): SimEvent[] {
  commitPlayerInput(input.players[0], held);
  stepWorld(w, input);
  const out: SimEvent[] = [];
  w.events.drain((e) => out.push({ ...e }));
  return out;
}

/**
 * Steps a world `n` times without input (events drained).
 *
 * @param w - The world.
 * @param n - Ticks.
 */
function run(w: World, n: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < n; i++) stepWorld(w, input);
  w.events.clear();
}

/**
 * Puts a stationary pink bullet on a ship's hurt circle.
 *
 * @param w - The world.
 * @param ship - The target.
 * @returns The bullet's slot.
 */
function aim(w: World, ship: PlayerShip): number {
  return spawnBullet(w, ship.x, ship.y, 0, 0, BulletKind.RoundPink);
}

/**
 * Spawns a test enemy at a view position.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - X relative to the camera.
 * @param y - Y relative to the camera.
 * @returns The enemy.
 */
function spawn(w: World, id: string, x: number, y: number): Enemy {
  const e = w.enemies.spawn(w.content.enemyIndex.get(id)!, w.camera.x + x, w.camera.y + y);
  expect(e).not.toBeNull();
  return e!;
}

/**
 * Live enemies of one spec.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @returns How many.
 */
function liveOf(w: World, id: string): number {
  const spec = w.content.enemyIndex.get(id)!;
  return w.enemies.enemies.filter((e) => e.state === EnemyState.Live && e.specIndex === spec)
    .length;
}

/**
 * Events of one kind.
 *
 * @param events - The events.
 * @param kind - `SimEventKind`.
 * @returns Those events.
 */
function ofKind(events: readonly SimEvent[], kind: number): SimEvent[] {
  return events.filter((e) => e.kind === kind);
}

/**
 * Steps until a ship reaches a state (at most `limit` ticks).
 *
 * @param w - The world.
 * @param ship - The ship.
 * @param state - The state to wait for.
 * @param limit - Tick limit.
 * @returns Ticks stepped.
 */
function until(w: World, ship: PlayerShip, state: PlayerShip['state'], limit = 1000): number {
  const input = createInputSnapshot();
  let n = 0;
  while (ship.state !== state && n < limit) {
    stepWorld(w, input);
    n++;
  }
  expect(ship.state).toBe(state);
  w.events.clear();
  return n;
}

describe('core/world death sequence — co-op and shared game over', () => {
  it('two ships hit on the same tick both die: one hit-stop, one shake, a duck and a rumble each', () => {
    const w = world();
    const input = createInputSnapshot();
    const [p1] = w.players;
    const p2 = joinP2(w);
    aim(w, p1);
    aim(w, p2);
    const events = tick(w, input);
    expect([p1.state, p1.lives, p2.state, p2.lives]).toEqual(['dying', 2, 'dying', 2]);
    expect(w.hitStop).toBe(DEATH_HIT_STOP_TICKS);
    // Each death requests its hit-stop (the counter keeps the longer one: still 8).
    expect(ofKind(events, SimEventKind.HitStop).map((e) => e.param)).toEqual([
      DEATH_HIT_STOP_TICKS,
      DEATH_HIT_STOP_TICKS,
    ]);
    // The second medium shake is no stronger than the first: ignored.
    expect(ofKind(events, SimEventKind.Shake)).toHaveLength(1);
    expect(ofKind(events, SimEventKind.MusicDuck).map((e) => e.id)).toEqual([0, 1]);
    expect(ofKind(events, SimEventKind.Rumble).map((e) => e.id)).toEqual([0, 1]);
    expect(
      ofKind(events, SimEventKind.Sfx).filter((e) => e.id === SFX_CUES.PlayerDeath),
    ).toHaveLength(2);
    // Both ships run the same timeline.
    until(w, p1, 'respawning');
    expect(p2.state).toBe('respawning');
  });

  it('both ships on their last ship, hit together: game over exactly when the dead time ends', () => {
    const w = world({ startingLives: 1 });
    const input = createInputSnapshot();
    const [p1] = w.players;
    const p2 = joinP2(w);
    aim(w, p1);
    aim(w, p2);
    tick(w, input);
    expect([p1.lives, p2.lives]).toEqual([0, 0]);
    let ticks = 0;
    while (w.status === 'playing' && ticks < 500) {
      tick(w, input);
      ticks++;
    }
    expect(w.status).toBe('gameOver');
    expect(ticks).toBe(DEATH_HIT_STOP_TICKS + PLAYER_DYING_TICKS + PLAYER_DEAD_TICKS);
    expect([playerOut(p1), playerOut(p2)]).toEqual([true, true]);
  });

  it('game over also ends a boss warning, and an inactive player 2 never counts', () => {
    const w = world({ startingLives: 1 });
    const input = createInputSnapshot();
    w.status = 'bossWarning';
    expect(w.players[1].active).toBe(false);
    aim(w, w.players[0]);
    tick(w, input);
    run(w, DEATH_HIT_STOP_TICKS + PLAYER_DYING_TICKS + PLAYER_DEAD_TICKS);
    expect(w.status).toBe('gameOver');
  });

  it('the World keeps simulating after the game over (the camera scrolls on)', () => {
    const w = world({ startingLives: 1 });
    aim(w, w.players[0]);
    run(w, 200);
    expect(w.status).toBe('gameOver');
    const x = w.camera.x;
    const t = w.tick;
    run(w, 10);
    expect([w.camera.x, w.tick]).toEqual([x + 10, t + 10]);
  });
});

describe('core/world death sequence — what the death and its hit-stop touch', () => {
  it('leaves a bullet that is not cancelable where it is', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    const keep = spawnBullet(w, ship.x + 150, ship.y - 60, 0, 0, BulletKind.OvalRed);
    w.bullets.setFlags(keep, BulletFlag.DieOnTerrain); // not cancelable
    spawnBullet(w, ship.x + 150, ship.y + 60, 0, 0, BulletKind.OvalRed); // cancelable
    aim(w, ship);
    tick(w, input);
    expect(ship.state).toBe('dying');
    expect(w.bullets.count).toBe(1);
    const f = w.bullets.pool.fields;
    expect(f.flags[0] & BulletFlag.Cancelable).toBe(0);
    expect(f.y[0]).toBe(ship.y - 60);
  });

  it('runs nothing during the hit-stop: no autofire, no events, shots frozen in place', () => {
    const w = world({ autofire: true, remoteMode: true });
    const input = createInputSnapshot();
    const ship = w.players[0];
    run(w, 20); // some shots in flight
    const shots = w.weapons.pool;
    expect(shots.count).toBeGreaterThan(0);
    aim(w, ship);
    tick(w, input);
    expect(ship.state).toBe('dying');
    const count = shots.count;
    const xs = Array.from(shots.fields.x.subarray(0, count));
    const frozen: SimEvent[] = [];
    for (let t = 0; t < DEATH_HIT_STOP_TICKS; t++) frozen.push(...tick(w, input));
    expect(frozen).toEqual([]);
    expect(shots.count).toBe(count);
    expect(Array.from(shots.fields.x.subarray(0, count))).toEqual(xs);
    expect(w.hitStop).toBe(0);
    tick(w, input); // thawed: the shots fly on
    expect(shots.fields.x[0]).not.toBe(xs[0]);
  });

  it("credits a tool's kill made during the hit-stop once, when the World thaws", () => {
    const w = world();
    const input = createInputSnapshot();
    const score = w.scoring.board.scores[0];
    const weak = spawn(w, 'weak', 250, 30);
    aim(w, w.players[0]);
    tick(w, input);
    expect(w.hitStop).toBe(DEATH_HIT_STOP_TICKS);
    w.enemies.kill(weak, 0);
    for (let t = 0; t < DEATH_HIT_STOP_TICKS; t++) tick(w, input);
    expect(score.score).toBe(0); // phase 3 has not run yet
    tick(w, input);
    expect(score.score).toBe(250);
    run(w, 5);
    expect(score.score).toBe(250);
  });
});

describe('core/world death tick — score and penalty order', () => {
  it('a capsule picked up and a kill credited on the tick of the death still score', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    const weak = spawn(w, 'weak', 250, 30);
    w.enemies.kill(weak, 0); // credited in this tick's phase 3
    w.powerups.spawnItem(ItemKind.Capsule, ship.x, ship.y);
    aim(w, ship);
    tick(w, input);
    expect(ship.state).toBe('dying');
    expect(w.scoring.board.scores[0].score).toBe(250 + CAPSULE_SCORE);
    // Classic: the pickup advanced the cursor, the penalty keeps it (nothing to lose here).
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Speed);
  });

  it('arcade: the penalty runs after the pickup, so the cursor the capsule advanced is reset', () => {
    const w = world({ deathPenalty: 'arcade' });
    const input = createInputSnapshot();
    const ship = w.players[0];
    w.powerups.meters[0].cursor = MeterSlot.Double;
    w.powerups.spawnItem(ItemKind.Capsule, ship.x, ship.y);
    aim(w, ship);
    tick(w, input);
    expect(ship.state).toBe('dying');
    expect(w.scoring.board.scores[0].score).toBe(CAPSULE_SCORE);
    expect(w.powerups.meters[0].cursor).toBe(-1);
  });
});

describe('core/world after a respawn', () => {
  it('bullets pass through the blinking ship and stay; enemy contact does not kill it', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    aim(w, ship);
    tick(w, input);
    until(w, ship, 'alive');
    expect(ship.invulnTicks).toBeGreaterThan(0);
    const hits = ship.hits;
    const bullet = aim(w, ship);
    const enemy = spawn(w, 'target', ship.x - w.camera.x, ship.y - w.camera.y);
    for (let t = 0; t < 10; t++) tick(w, input);
    expect([ship.state, ship.hits, ship.lives]).toEqual(['alive', hits, 2]);
    expect(w.bullets.pool.fields.flags[bullet] & BulletFlag.Dead).toBe(0);
    expect(w.bullets.count).toBe(1);
    expect(enemy.state).toBe(EnemyState.Live);
  });

  it('draws nothing while dying or dead, blinks every 4 ticks while invulnerable, then shows steadily', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    const batch = w.playerBatch;
    expect(w.ship.spriteId).toBeGreaterThanOrEqual(0);
    expect([batch.count, batch.flags[0]]).toEqual([1, 0]);
    aim(w, ship);
    tick(w, input);
    let drawn = 0;
    while (ship.state === 'dying' || ship.state === 'dead') {
      drawn += batch.count;
      tick(w, input);
    }
    expect(drawn).toBe(0);
    // From the first fly-in tick to the end of the invulnerability: Hidden when bit 2 is set.
    const hidden: boolean[] = [];
    while (ship.invulnTicks > 0) {
      expect(batch.count).toBe(1);
      const flag = (batch.flags[0] & SpriteFlag.Hidden) !== 0;
      expect(flag).toBe((ship.invulnTicks & 4) !== 0);
      hidden.push(flag);
      tick(w, input);
    }
    expect(hidden.filter(Boolean).length).toBeGreaterThan(20);
    expect(hidden.filter((h) => !h).length).toBeGreaterThan(20);
    for (let t = 0; t < 20; t++) {
      expect(batch.flags[0] & SpriteFlag.Hidden).toBe(0);
      tick(w, input);
    }
  });
});

describe('core/world lives and penalties over many deaths', () => {
  it('five ships take five deaths: lives 4, 3, 2, 1, 0, then the game is over', () => {
    const w = world({ startingLives: 5 });
    const input = createInputSnapshot();
    const ship = w.players[0];
    expect(ship.lives).toBe(5);
    const lives: number[] = [];
    for (let death = 0; death < 5; death++) {
      if (ship.state !== 'alive') until(w, ship, 'alive');
      ship.invulnTicks = 0;
      aim(w, ship);
      tick(w, input);
      expect(ship.state).toBe('dying');
      lives.push(ship.lives);
      expect(w.status).toBe('playing');
      if (death < 4) until(w, ship, 'respawning');
    }
    expect(lives).toEqual([4, 3, 2, 1, 0]);
    run(w, DEATH_HIT_STOP_TICKS + PLAYER_DYING_TICKS + PLAYER_DEAD_TICKS);
    expect(w.status).toBe('gameOver');
  });

  it('classic strips one level per death in the D6 order, down to the basic ship', () => {
    const w = world({ loadout: 'full' });
    const input = createInputSnapshot();
    const ship = w.players[0];
    const loadout = w.weapons.loadouts[0];
    const snapshot = (): unknown[] => [
      loadout.options,
      loadout.main,
      loadout.missile,
      ship.speedLevel,
    ];
    const start = ship.speedLevel;
    expect(snapshot()).toEqual([MAX_OPTIONS, MainWeapon.Laser, true, start]);
    const seen: unknown[][] = [];
    for (let death = 0; death < MAX_OPTIONS + 2 + start + 1; death++) {
      if (ship.state !== 'alive') until(w, ship, 'alive');
      ship.invulnTicks = 0;
      ship.lives = 3;
      playerHit(ship, PlayerHitCause.Terrain, w.tick, w.debugFlags); // passes any shield
      tick(w, input);
      expect(ship.state).toBe('dying');
      seen.push(snapshot());
    }
    const expected: unknown[][] = [];
    for (let o = MAX_OPTIONS - 1; o >= 0; o--) expected.push([o, MainWeapon.Laser, true, start]);
    expected.push([0, MainWeapon.Basic, true, start]);
    expected.push([0, MainWeapon.Basic, false, start]);
    for (let s = start - 1; s >= 0; s--) expected.push([0, MainWeapon.Basic, false, s]);
    expected.push([0, MainWeapon.Basic, false, 0]); // nothing left to lose
    expect(seen).toEqual(expected);
  });

  it('casual keeps the whole loadout through repeated deaths', () => {
    const w = world({ loadout: 'full', deathPenalty: 'casual' });
    const input = createInputSnapshot();
    const ship = w.players[0];
    const loadout = w.weapons.loadouts[0];
    const before = [loadout.options, loadout.main, loadout.missile, ship.speedLevel];
    for (let death = 0; death < 3; death++) {
      if (ship.state !== 'alive') until(w, ship, 'alive');
      ship.invulnTicks = 0;
      ship.lives = 3;
      playerHit(ship, PlayerHitCause.Terrain, w.tick, w.debugFlags);
      tick(w, input);
      expect(ship.state).toBe('dying');
      expect([loadout.options, loadout.main, loadout.missile, ship.speedLevel]).toEqual(before);
    }
  });
});

describe('core/world arcade restarts', () => {
  it('restarts at the stage start when no checkpoint was passed', () => {
    const w = world({ stage: 'bare', deathPenalty: 'arcade' });
    const input = createInputSnapshot();
    const ship = w.players[0];
    run(w, 150);
    expect(w.stage?.checkpoint).toBe(-1);
    expect(w.camera.x).toBeGreaterThan(150);
    aim(w, ship);
    tick(w, input);
    until(w, ship, 'respawning');
    expect(w.camera.x).toBeLessThanOrEqual(1); // back at x 0, one tick of scroll at most
  });

  it('plays the timeline after the checkpoint again (and not the events before it)', () => {
    const w = world({ stage: 'timeline', deathPenalty: 'arcade' });
    const input = createInputSnapshot();
    const ship = w.players[0];
    run(w, 470 - Math.floor(w.camera.x));
    expect(w.stage?.checkpoint).toBe(1);
    expect([liveOf(w, 'weak'), liveOf(w, 'target')]).toEqual([1, 1]);
    aim(w, ship);
    tick(w, input);
    until(w, ship, 'respawning');
    expect(w.enemies.count).toBe(0);
    expect(w.camera.x).toBeLessThan(302);
    run(w, 465 - Math.floor(w.camera.x)); // past x 450 again
    expect([liveOf(w, 'weak'), liveOf(w, 'target')]).toEqual([0, 1]);
  });

  it('keeps the score through the restart and credits later kills once', () => {
    const w = world({ deathPenalty: 'arcade' });
    const input = createInputSnapshot();
    const ship = w.players[0];
    const score = w.scoring.board.scores[0];
    w.enemies.kill(spawn(w, 'weak', 250, 30), 0);
    tick(w, input);
    expect(score.score).toBe(250);
    aim(w, ship);
    tick(w, input);
    until(w, ship, 'respawning');
    expect(score.score).toBe(250);
    expect([w.scoring.killsScored, w.scoring.bonusesScored]).toEqual([0, 0]);
    w.enemies.kill(spawn(w, 'weak', 250, 30), 0);
    run(w, 3);
    expect(score.score).toBe(500);
    expect(w.scoring.board.hiScore).toBe(500);
  });

  it('co-op: a partner still exploding is left alone by the restart, and respawns on its own', () => {
    const w = world({ deathPenalty: 'arcade' });
    const input = createInputSnapshot();
    const [p1] = w.players;
    const p2 = joinP2(w);
    aim(w, p1);
    tick(w, input);
    // Player 2 dies half-way through player 1's dead time.
    run(w, DEATH_HIT_STOP_TICKS + PLAYER_DYING_TICKS + PLAYER_DEAD_TICKS / 2);
    p2.invulnTicks = 0;
    aim(w, p2);
    tick(w, input);
    expect(p2.state).toBe('dying');
    const at = [p2.x, p2.y];
    until(w, p1, 'respawning');
    expect(['dying', 'dead']).toContain(p2.state);
    expect([p2.x, p2.y]).toEqual(at);
    expect(p2.lives).toBe(2);
    until(w, p2, 'respawning');
    // Its own arcade restart flies player 1 in again with it.
    expect(p1.state).toBe('respawning');
  });
});

describe('core/world arcade restart — both ships at once', () => {
  it('two ships that died together respawn together from the same restarted view', () => {
    const w = world({ deathPenalty: 'arcade' });
    const input = createInputSnapshot();
    const [p1] = w.players;
    const p2 = joinP2(w);
    run(w, 400 - Math.floor(w.camera.x)); // past the checkpoint at 300
    aim(w, p1);
    aim(w, p2);
    tick(w, input);
    expect([p1.state, p2.state]).toEqual(['dying', 'dying']);
    until(w, p1, 'respawning');
    expect(p2.state).toBe('respawning');
    expect([p1.lives, p2.lives]).toEqual([2, 2]);
    expect(w.stage?.checkpoint).toBe(1);
    expect(w.camera.x - w.camera.dx).toBe(300);
    expect([p1.x, p2.x]).toEqual([300 + ENTER_START_X, 300 + ENTER_START_X]);
    until(w, p1, 'alive');
    expect(p2.state).toBe('alive');
    expect(p2.invulnTicks).toBe(p1.invulnTicks);
  });
});

describe('core/world life-cycle determinism', () => {
  it('lockstep: equal per-tick hashes through co-op deaths, arcade restarts and the game over', () => {
    const play = (): { hashes: number[]; w: World } => {
      const w = world({ deathPenalty: 'arcade', startingLives: 2, loadout: 'full' });
      joinP2(w);
      const input = createInputSnapshot();
      const hashes: number[] = [];
      for (let t = 0; t < 4000 && w.status === 'playing'; t++) {
        for (const ship of w.players) if (t % 45 === 0 && ship.state === 'alive') aim(w, ship);
        tick(w, input, t % 32 < 16 ? 0 : 1);
        hashes.push(hashWorld(w));
      }
      return { hashes, w };
    };
    const a = play();
    const b = play();
    expect(a.w.status).toBe('gameOver');
    expect(a.w.players.map((p) => p.hits)).toEqual([2, 2]);
    expect(b.hashes).toEqual(a.hashes);
    expect(a.w.fx.shakeDuration).toBe(DEATH_SHAKE_TICKS);
  });
});
