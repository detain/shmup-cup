/**
 * The life cycle inside the World (plan M1-12 acceptance): the death sequence (events, hit-stop,
 * shake, bullet cancel, one life gone), its timing (`dying` → `dead` → the respawn fly-in), the
 * invulnerability after a respawn, each death-penalty preset's outcome (loadout, meter cursor,
 * camera, cleared pools), game over, hit-stop determinism, and the score credited by the World
 * (per-player totals, formation bonus to the last killer). The allocation guard lives in
 * `world-death-alloc.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BulletKind, fireLaser, spawnBullet } from '../../src/bullets/index.js';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { DropKind, type Enemy } from '../../src/enemies/index.js';
import { FX_CUES, SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import {
  ENTER_START_X,
  PLAYER_DEAD_TICKS,
  PLAYER_DYING_TICKS,
  PlayerHitCause,
  playerHit,
  playerOut,
  spawnPlayer,
  type PlayerState,
} from '../../src/player/index.js';
import { ItemKind, MeterSlot } from '../../src/powerups/index.js';
import { MAX_SCORE } from '../../src/scoring/index.js';
import { ShieldKind, shieldActive } from '../../src/shields/index.js';
import { MAX_OPTIONS } from '../../src/options/index.js';
import { MainWeapon } from '../../src/weapons/index.js';
import {
  DEATH_HIT_STOP_TICKS,
  DEATH_MUSIC_DUCK_TICKS,
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
 * Test content: the KESTREL, Type A, scriptless test enemies and an open stage `run` scrolling at
 * 1 px/tick with checkpoints at 0, 300 and 600 (no terrain — only what the tests fire kills).
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
      {
        path: 'stages/run.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 'run',
          name: 'RUN',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 5000,
          camera: [{ x: 0, speed: 1 }],
          checkpoints: [{ x: 0 }, { x: 300 }, { x: 600 }],
          parallax: [],
          tilemap: { tileSize: 8, tileset: 'terrain-a', rowsTall: 25, rle: Array(25).fill('') },
          events: [],
        },
      },
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
 * Steps a world `n` times without input.
 *
 * @param w - The world.
 * @param n - Ticks.
 */
function run(w: World, n: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < n; i++) stepWorld(w, input);
}

/**
 * Kills player 1 on the next tick with a bullet on its hurt circle (no shield in the way).
 *
 * @param w - The world.
 * @param input - The snapshot.
 * @returns The death tick's events.
 */
function shoot(w: World, input: InputSnapshot): SimEvent[] {
  const ship = w.players[0];
  spawnBullet(w, ship.x, ship.y, 0, 0, BulletKind.RoundPink);
  return tick(w, input);
}

/**
 * Where a ship respawned during the last tick starts: the left edge of the view as phase 2 saw it
 * (phase 3 scrolled the camera on afterwards).
 *
 * @param w - The world.
 * @returns The world x.
 */
function spawnX(w: World): number {
  return w.camera.x - w.camera.dx + ENTER_START_X;
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

describe('core/world death sequence (M1-12)', () => {
  it('turns a hit into dying: one life, explosion, debris, rumble, duck, hit-stop, shake, cancel', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    spawnBullet(w, ship.x + 100, ship.y, 0, 0, BulletKind.OvalRed); // survives the hit, not the death
    const events = shoot(w, input);
    expect([ship.state, ship.stateTicks, ship.lives, ship.hitCause]).toEqual([
      'dying',
      0,
      2,
      PlayerHitCause.Bullet,
    ]);
    expect(w.bullets.count).toBe(0);
    expect(w.hitStop).toBe(DEATH_HIT_STOP_TICKS);
    const x = Math.floor(ship.x);
    const y = Math.floor(ship.y);
    const find = (kind: number, id: number): SimEvent | undefined =>
      events.find((e) => e.kind === kind && e.id === id);
    expect(find(SimEventKind.Sfx, SFX_CUES.PlayerDeath)).toMatchObject({ x, y });
    expect(find(SimEventKind.Particles, FX_CUES.ExplosionLarge)).toMatchObject({ x, y });
    expect(find(SimEventKind.Particles, FX_CUES.Debris)).toMatchObject({ x, y });
    expect(find(SimEventKind.Rumble, 0)).toMatchObject({ x, y, param: 1 });
    expect(find(SimEventKind.MusicDuck, 0)?.param).toBe(DEATH_MUSIC_DUCK_TICKS);
    expect(find(SimEventKind.HitStop, 0)?.param).toBe(DEATH_HIT_STOP_TICKS);
    expect(find(SimEventKind.Shake, DEATH_SHAKE_TICKS)?.param).toBe(2);
    expect(
      events.some((e) => e.kind === SimEventKind.Particles && e.id === FX_CUES.BulletCancel),
    ).toBe(true);
    expect(w.fx.shakeTicks).toBe(DEATH_SHAKE_TICKS);
  });

  it('cancels lasers too, and a second hit on the same tick costs no second life', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    fireLaser(w, { slot: -1, x: w.camera.x + 380, y: ship.y }, 512, 380, 0, 0, 30, 6, 0);
    spawnBullet(w, ship.x, ship.y, 0, 0, BulletKind.RoundPink);
    tick(w, input);
    expect([ship.hits, ship.lives, ship.state]).toEqual([2, 2, 'dying']);
    expect(w.bullets.lasers.count).toBe(0);
  });

  it('runs dying → dead → respawning → alive on the documented ticks, then 150 ticks of invulnerability', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    shoot(w, input);
    const states: PlayerState[] = [];
    for (let t = 0; t < DEATH_HIT_STOP_TICKS + PLAYER_DYING_TICKS + PLAYER_DEAD_TICKS + 45; t++) {
      tick(w, input);
      states.push(ship.state);
    }
    const first = (state: PlayerState): number => states.indexOf(state) + 1; // ticks after the hit
    // Frozen for the hit-stop, then 24 ticks of explosion, 60 dead, the 40-tick fly-in.
    expect(states.slice(0, DEATH_HIT_STOP_TICKS).every((s) => s === 'dying')).toBe(true);
    expect(first('dead')).toBe(DEATH_HIT_STOP_TICKS + PLAYER_DYING_TICKS);
    expect(first('respawning')).toBe(first('dead') + PLAYER_DEAD_TICKS);
    expect(first('alive')).toBe(first('respawning') + w.ship.enterTicks);
    expect(ship.lives).toBe(2);
    // The ship blinked through the fly-in and has exactly respawnInvulnTicks left now…
    const aliveFor = states.length - states.indexOf('alive');
    expect(ship.invulnTicks).toBe(w.ship.respawnInvulnTicks - (aliveFor - 1));
    // …so bullets pass until the 150th tick after control returned, and the next one kills.
    let hitAt = -1;
    for (let t = aliveFor; t < 400 && hitAt < 0; t++) {
      spawnBullet(w, ship.x, ship.y, 0, 0, BulletKind.RoundPink);
      tick(w, input);
      if (ship.state === 'dying') hitAt = t;
    }
    expect(w.ship.respawnInvulnTicks).toBe(150);
    expect(hitAt).toBe(150);
    expect(ship.lives).toBe(1);
  });

  it('keeps firing while invulnerable after a respawn', () => {
    const w = world({ autofire: true, remoteMode: true });
    const input = createInputSnapshot();
    const ship = w.players[0];
    shoot(w, input);
    while (ship.state !== 'alive') tick(w, input);
    expect(ship.invulnTicks).toBeGreaterThan(100);
    for (let t = 0; t < 10; t++) tick(w, input);
    expect(w.weapons.pool.count).toBeGreaterThan(0);
  });

  it('freezes phases 2–8 during the hit-stop (camera, bullets, timers) but not the tick counter', () => {
    const w = world();
    const input = createInputSnapshot();
    const ship = w.players[0];
    shoot(w, input);
    const i = spawnBullet(w, w.camera.x + 300, 20, 0, 1, BulletKind.RoundPink);
    const camera = w.camera.x;
    const tick0 = w.tick;
    for (let t = 0; t < DEATH_HIT_STOP_TICKS; t++) tick(w, input);
    expect([w.camera.x, w.bullets.pool.fields.x[i], ship.stateTicks]).toEqual([
      camera,
      w.camera.x + 300,
      0,
    ]);
    expect(w.tick).toBe(tick0 + DEATH_HIT_STOP_TICKS);
    expect(w.hitStop).toBe(0);
    expect(w.fx.shakeTicks).toBe(DEATH_SHAKE_TICKS - DEATH_HIT_STOP_TICKS); // fx timers run on
    tick(w, input);
    expect(w.camera.x).toBe(camera + 1);
    expect(ship.stateTicks).toBe(1);
  });

  it('is deterministic: equal hashes for equal inputs through deaths and hit-stops', () => {
    const play = (): World => {
      const w = world({ autofire: true, remoteMode: true, loadout: 'full' });
      const input = createInputSnapshot();
      for (let t = 0; t < 1500; t++) {
        const ship = w.players[0];
        if (t % 50 === 0) spawnBullet(w, ship.x, ship.y, 0, 0, BulletKind.RoundPink);
        if (t % 40 === 0) spawn(w, 'target', 300, 40 + (t % 120));
        tick(w, input, (t >> 4) & 1 ? Action.Up : Action.Down);
      }
      return w;
    };
    const a = play();
    const b = play();
    expect(a.players[0].hits).toBeGreaterThan(2);
    expect(hashWorld(a)).toBe(hashWorld(b));
    b.hitStop++;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});

describe('core/world death penalties (decision D6)', () => {
  it('classic: one level lost (Option first), the shield lost, cursor kept, back in at the current scroll', () => {
    const w = world({ loadout: 'full' });
    const input = createInputSnapshot();
    const ship = w.players[0];
    const loadout = w.weapons.loadouts[0];
    const target = spawn(w, 'target', 250, 150);
    w.powerups.meters[0].cursor = MeterSlot.Laser;
    // Terrain passes the Force Field (decision D8): a death with the shield up.
    expect(shieldActive(ship.shield)).toBe(true);
    playerHit(ship, PlayerHitCause.Terrain, w.tick, w.debugFlags);
    tick(w, input);
    expect(ship.state).toBe('dying');
    expect(ship.shield.kind).toBe(ShieldKind.None);
    expect([loadout.options, loadout.main, loadout.missile, ship.speedLevel]).toEqual([
      MAX_OPTIONS - 1,
      MainWeapon.Laser,
      true,
      2,
    ]);
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Laser);
    const checkpoint = w.stage?.checkpoint;
    const cameraAtDeath = w.camera.x;
    while (ship.state !== 'respawning') tick(w, input);
    expect(ship.x).toBe(spawnX(w)); // the view before this tick's scroll
    // The scroll went on (frozen only during the hit-stop), no restart.
    expect(w.camera.x).toBe(cameraAtDeath + PLAYER_DYING_TICKS + PLAYER_DEAD_TICKS);
    expect(w.stage?.checkpoint).toBe(checkpoint);
    expect(target.state).not.toBe(0); // enemies stay
    expect(w.enemies.count).toBe(1);
  });

  it('a Force Field still takes a bullet first: no death while it holds', () => {
    const w = world({ loadout: 'full' });
    const input = createInputSnapshot();
    const ship = w.players[0];
    expect(shieldActive(ship.shield)).toBe(true);
    spawnBullet(w, ship.x, ship.y, 0, 0, BulletKind.RoundPink);
    tick(w, input);
    expect([ship.state, ship.lives, ship.shield.hits]).toEqual(['alive', 3, 4]);
  });

  it('casual: keeps the loadout, loses the shield, flies in at the current scroll', () => {
    const w = world({ loadout: 'full', deathPenalty: 'casual' });
    const input = createInputSnapshot();
    const ship = w.players[0];
    const loadout = w.weapons.loadouts[0];
    expect(shieldActive(ship.shield)).toBe(true);
    playerHit(ship, PlayerHitCause.Terrain, w.tick, w.debugFlags); // passes the Force Field
    tick(w, input);
    expect(ship.state).toBe('dying');
    expect([loadout.options, loadout.main, loadout.missile, ship.speedLevel]).toEqual([
      MAX_OPTIONS,
      MainWeapon.Laser,
      true,
      2,
    ]);
    expect(ship.shield.kind).toBe(ShieldKind.None);
    while (ship.state !== 'respawning') tick(w, input);
    expect(ship.x).toBe(spawnX(w)); // the view before this tick's scroll
  });

  it('arcade: everything lost, cursor reset, the stage restarts at the last checkpoint with every pool cleared', () => {
    const w = world({ loadout: 'full', deathPenalty: 'arcade', autofire: true, remoteMode: true });
    const input = createInputSnapshot();
    const ship = w.players[0];
    const loadout = w.weapons.loadouts[0];
    run(w, 400 - Math.floor(w.camera.x)); // past the checkpoint at 300
    expect(w.stage?.checkpoint).toBe(1);
    ship.shield.kind = ShieldKind.None;
    ship.shield.hits = 0;
    w.powerups.meters[0].cursor = MeterSlot.Option;
    spawn(w, 'target', 250, 40);
    shoot(w, input);
    expect([loadout.options, loadout.main, loadout.missile, ship.speedLevel]).toEqual([
      0,
      MainWeapon.Basic,
      false,
      0,
    ]);
    expect(w.powerups.meters[0].cursor).toBe(-1);
    // Until the respawn the stage scrolls on and things live.
    while (ship.state !== 'dead') tick(w, input);
    spawnBullet(w, w.camera.x + 300, 20, 0, 0, BulletKind.RoundPink);
    fireLaser(w, { slot: -1, x: w.camera.x + 380, y: 30 }, 512, 100);
    w.powerups.spawnItem(ItemKind.Capsule, w.camera.x + 200, 180);
    expect(w.enemies.count).toBe(1);
    while (ship.state === 'dead') tick(w, input);
    expect(ship.state).toBe('respawning');
    expect(w.stage?.checkpoint).toBe(1);
    expect(w.camera.x).toBeGreaterThanOrEqual(300);
    expect(w.camera.x).toBeLessThan(302); // restarted at x 300, one tick of scroll at most
    expect(ship.x).toBe(spawnX(w)); // the view before this tick's scroll
    expect([
      w.enemies.count,
      w.bullets.count,
      w.bullets.lasers.count,
      w.powerups.count,
      w.weapons.pool.count,
    ]).toEqual([0, 0, 0, 0, 0]);
  });

  it('arcade in free flight: the same clear without a camera move', () => {
    const w = world({ stage: null, deathPenalty: 'arcade' });
    const input = createInputSnapshot();
    const ship = w.players[0];
    spawn(w, 'target', 250, 40);
    shoot(w, input);
    while (ship.state !== 'respawning') tick(w, input);
    expect([w.enemies.count, w.camera.x]).toEqual([0, 0]);
  });

  it('arcade in co-op: the other ship in play flies in again with the restart', () => {
    const w = world({ deathPenalty: 'arcade' });
    const input = createInputSnapshot();
    const [p1, p2] = w.players;
    p2.active = true;
    spawnPlayer(p2, w.camera);
    while (p2.state !== 'alive') tick(w, input);
    const p2Loadout = w.weapons.loadouts[1];
    p2Loadout.options = 2;
    shoot(w, input);
    while (p1.state !== 'respawning') tick(w, input);
    expect(p2.state).toBe('respawning');
    expect(p2.x).toBe(spawnX(w));
    expect(p2Loadout.options).toBe(2); // no penalty for the survivor
    expect(p2.lives).toBe(3);
  });
});

describe('core/world lives and game over', () => {
  it('counts ships including the one in play; the last death ends the game once its dead time is over', () => {
    const w = world({ startingLives: 2 });
    const input = createInputSnapshot();
    const ship = w.players[0];
    expect(ship.lives).toBe(2);
    shoot(w, input);
    expect(ship.lives).toBe(1);
    while (ship.state !== 'alive') tick(w, input);
    ship.invulnTicks = 0;
    shoot(w, input);
    expect([ship.lives, ship.state, w.status]).toEqual([0, 'dying', 'playing']);
    let ticks = 0;
    while (w.status === 'playing' && ticks < 500) {
      tick(w, input);
      ticks++;
    }
    expect(w.status).toBe('gameOver');
    expect(ticks).toBe(DEATH_HIT_STOP_TICKS + PLAYER_DYING_TICKS + PLAYER_DEAD_TICKS);
    expect(ship.state).toBe('dead');
    expect(playerOut(ship)).toBe(true);
    run(w, 300);
    expect([ship.state, w.status]).toEqual(['dead', 'gameOver']); // never respawns
  });

  it('a single life means game over after the first death; stage clear is never overridden', () => {
    const over = world({ startingLives: 1 });
    const input = createInputSnapshot();
    shoot(over, input);
    run(over, 100);
    expect(over.status).toBe('gameOver');
    const clear = world({ startingLives: 1 });
    shoot(clear, createInputSnapshot());
    clear.status = 'stageClear';
    run(clear, 100);
    expect(clear.status).toBe('stageClear');
  });

  it('in co-op the game goes on while one player has a ship', () => {
    const w = world({ startingLives: 1 });
    const input = createInputSnapshot();
    const [p1, p2] = w.players;
    p2.active = true;
    spawnPlayer(p2, w.camera);
    shoot(w, input);
    run(w, 200);
    expect([playerOut(p1), p2.state, w.status]).toEqual([true, 'alive', 'playing']);
    p2.invulnTicks = 0;
    playerHit(p2, PlayerHitCause.Contact, w.tick, w.debugFlags);
    run(w, 200);
    expect(w.status).toBe('gameOver');
  });
});

describe('core/world score (M1-12)', () => {
  it('credits enemy kills to the killer, capsules to the collector, nothing for anonymous kills', () => {
    const w = world();
    const input = createInputSnapshot();
    const scores = w.scoring.board.scores;
    const weak = spawn(w, 'weak', 250, 60);
    w.enemies.kill(weak, 0); // between ticks: credited at the next phase 3
    const other = spawn(w, 'weak', 250, 90);
    w.enemies.kill(other); // nobody
    tick(w, input);
    expect(scores[0].score).toBe(250);
    tick(w, input); // credited once only
    expect(scores[0].score).toBe(250);
    const ship = w.players[0];
    w.powerups.spawnItem(ItemKind.Capsule, ship.x, ship.y);
    tick(w, input);
    expect(scores[0].score).toBe(550);
    expect(scores[0].displayDirty).toBe(true);
    expect(w.scoring.board.hiScore).toBe(550);
  });

  it('keeps per-player totals: a kill by player 2 and a formation bonus to its last killer', () => {
    const w = world();
    const input = createInputSnapshot();
    const scores = w.scoring.board.scores;
    const weak = w.content.enemyIndex.get('weak')!;
    w.enemies.startFormation(weak, 2, 1, 300, 100, -1, DropKind.None, 1000);
    tick(w, input);
    tick(w, input);
    const members = w.enemies.enemies.filter((e) => e.state === 1 && e.formation >= 0);
    expect(members).toHaveLength(2);
    w.enemies.damage(members[0], 5, 0);
    w.enemies.damage(members[1], 5, 1); // completes the formation: the bonus is player 2's
    tick(w, input);
    expect([scores[0].score, scores[1].score]).toEqual([250, 250 + 1000]);
    expect(w.scoring.board.hiScore).toBe(1250);
  });

  it('clamps at 99,999,990 and keeps the score through deaths', () => {
    const w = world();
    const input = createInputSnapshot();
    const scores = w.scoring.board.scores;
    scores[0].score = MAX_SCORE - 100;
    const weak = spawn(w, 'weak', 250, 60);
    w.enemies.kill(weak, 0);
    tick(w, input);
    expect(scores[0].score).toBe(MAX_SCORE);
    shoot(w, input);
    run(w, 200);
    expect(scores[0].score).toBe(MAX_SCORE);
  });
});
