/**
 * The World's rank (plan M2-01, shmup_feat.md §15 / §11): rank growth from the power-ups of the
 * most powerful ship (Missile, Double / Laser, Options, shield), the stage / loop inputs, the cap
 * of 16 on loop 1, a constant rank with growth 0, the bullet system following every change; enemy
 * rank modifiers changing bullet speed and fire intervals deterministically (`1 + k · (scale − 1)`,
 * × 1 on Normal's base whatever `k`); the Easy preset's bullet speed and 16 aim directions; revenge
 * bullets (only at `minRank` or above, on screen, killed by a player, never on a Mega Crash; the
 * `aimed` / `spread3` / `ring8` patterns).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BEHAVIOR_DEFS,
  createBehaviorRegistry,
  defineBehavior,
} from '../../src/behaviors/index.js';
import { BulletFlag, BulletKind, BulletOrigin } from '../../src/bullets/index.js';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import type { Enemy, ScriptApi } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { MoverKind, SLEEP_FOREVER, rankedWait, type Script } from '../../src/patterns/index.js';
import { PlayerHitCause } from '../../src/player/index.js';
import { BULLET_SPEED_RANK_CURVE, FIRE_RATE_RANK_CURVE, rankScale } from '../../src/rank/index.js';
import { grantShield } from '../../src/shields/index.js';
import { MainWeapon, applyLoadoutPreset } from '../../src/weapons/index.js';
import {
  ENGINE_SPRITES,
  createWorld,
  stepWorld,
  updateWorldRank,
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
 * A test enemy.
 *
 * @param id - Its id.
 * @param extra - More fields (rank modifiers, revenge).
 * @returns The entry.
 */
function enemy(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    hp: 5,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    script: 'test.shooter',
    sprite: 'enemies/drifter',
    drop: null,
    settleTicks: 0,
    ...extra,
  };
}

const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'enemies/t.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            enemy('plain'),
            enemy('steady', { rank: { bulletSpeed: 0, fireRate: 0 } }),
            enemy('keen', { rank: { bulletSpeed: 2, fireRate: 2 } }),
            enemy('avenger', {
              script: 'test.idle',
              revenge: { minRank: 10, pattern: 'aimed', speed: 1 },
            }),
            enemy('fan', { script: 'test.idle', revenge: { minRank: 0, pattern: 'spread3' } }),
            enemy('ring', {
              script: 'test.idle',
              revenge: { minRank: 0, pattern: 'ring8', speed: 2 },
            }),
          ],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/** The last shooter's `fireWait(60)`, recorded when it fired. */
let lastWait = -1;

/** Fires one aimed bullet (speed 1 on Normal) as soon as it may, records `fireWait(60)`. */
const shooter = defineBehavior('test.shooter', {}, function* shoot(api: ScriptApi): Script {
  api.setMover(MoverKind.None);
  for (;;) {
    if (api.aimed(1, BulletKind.RoundPink) >= 0) {
      lastWait = api.fireWait(60);
      yield SLEEP_FOREVER;
    }
    yield 1;
  }
});

/** Stands still, never fires. */
const idle = defineBehavior('test.idle', {}, function* stand(api: ScriptApi): Script {
  api.setMover(MoverKind.None);
  yield SLEEP_FOREVER;
});

const REGISTRY = createBehaviorRegistry([...DEFAULT_BEHAVIOR_DEFS, shooter, idle]);

/**
 * A free-flight World (god mode) past the ship's fly-in.
 *
 * @param overrides - Config overrides.
 * @returns The World.
 */
function world(overrides: Partial<GameConfig> = {}): World {
  const w = createWorld(resolveGameConfig({ seed: 5, ...overrides }), DB, { behaviors: REGISTRY });
  w.debugFlags.godMode = true;
  run(w, 45);
  return w;
}

/**
 * Steps a World with no input.
 *
 * @param w - The World.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) stepWorld(w, input);
}

/**
 * Spawns an enemy at a view position.
 *
 * @param w - The World.
 * @param id - Enemy id.
 * @returns The enemy.
 */
function spawn(w: World, id: string): Enemy {
  const e = w.enemies.spawn(DB.enemyIndex.get(id) ?? -1, w.camera.x + 300, w.camera.y + 100);
  if (e === null) throw new Error('could not spawn ' + id);
  return e;
}

/**
 * Speeds of the live enemy bullets.
 *
 * @param w - The World.
 * @returns Speeds, in slot order.
 */
function bulletSpeeds(w: World): number[] {
  const f = w.bullets.pool.fields;
  const out: number[] = [];
  for (let i = 0; i < w.bullets.pool.count; i++) {
    if ((f.flags[i] & BulletFlag.Dead) === 0) out.push(f.speed[i]);
  }
  return out;
}

/**
 * Spawns one shooter, runs until it fired, and returns its bullet's speed.
 *
 * @param w - The World.
 * @param id - The shooter's id.
 * @returns The bullet speed and the recorded `fireWait(60)`.
 */
function shot(w: World, id: string): { speed: number; wait: number } {
  w.bullets.pool.clear();
  lastWait = -1;
  const e = spawn(w, id);
  for (let t = 0; t < 30 && bulletSpeeds(w).length === 0; t++) run(w, 1);
  const speeds = bulletSpeeds(w);
  expect(speeds, id).toHaveLength(1);
  w.enemies.kill(e);
  run(w, 1);
  return { speed: speeds[0], wait: lastWait };
}

describe('core/world rank growth (M2-01)', () => {
  it('starts at the base and grows with the most powerful ship', () => {
    const w = world();
    expect(w.rank).toBe(2);
    const loadout = w.weapons.loadouts[0];
    loadout.missile = true;
    run(w, 1);
    expect(w.rank).toBe(3);
    loadout.main = MainWeapon.Double;
    run(w, 1);
    expect(w.rank).toBe(5);
    loadout.main = MainWeapon.Laser;
    loadout.options = 2;
    run(w, 1);
    expect(w.rank).toBe(8);
    grantShield(w.players[0].shield);
    run(w, 1);
    expect([w.rank, w.rankInputs.power]).toEqual([12, 10]);
    expect(w.bullets.rank).toBe(12);
    expect(w.bullets.speedScale).toBe(rankScale(12, BULLET_SPEED_RANK_CURVE));
    // Player 2 (inactive) counts for nothing until it plays.
    applyLoadoutPreset(w.weapons.loadouts[1], w.players[1], 'full');
    expect(updateWorldRank(w)).toBe(12);
    w.players[1].active = true;
    expect(updateWorldRank(w)).toBe(14);
  });

  it('adds the stage and loop terms and caps loop 1 at 16', () => {
    const w = world({ difficulty: 'arcade', loadout: 'full' });
    expect(w.rank).toBe(16); // 6 + 12 = 18 → the loop-1 cap
    w.rankInputs.loop = 2;
    expect(updateWorldRank(w)).toBe(26); // 6 + 8 + 12
    const easy = world({ difficulty: 'easy' }); // growth 0.5
    easy.rankInputs.stage = 5;
    expect(updateWorldRank(easy)).toBe(2); // floor(0.5 × 4)
  });

  it('keeps a constant rank with growth 0', () => {
    const w = world({ rankGrowth: 0, loadout: 'full' });
    expect(w.rank).toBe(2);
    w.rankInputs.stage = 9;
    run(w, 1);
    expect(w.rank).toBe(2);
  });

  it('drops the rank with the power a death takes', () => {
    const w = world({ loadout: 'full', deathPenalty: 'arcade' });
    expect(w.rank).toBe(14);
    w.debugFlags.godMode = false;
    w.players[0].invulnTicks = 0;
    w.players[0].shield.hits = 0;
    w.players[0].shield.kind = 0;
    // A hit recorded for the coming tick: its phase 7 runs the death sequence.
    w.players[0].hitTick = w.tick;
    w.players[0].hitCause = PlayerHitCause.Bullet;
    run(w, 20);
    expect(w.rank).toBe(2);
  });
});

describe('core/world rank modifiers (M2-01)', () => {
  it('fires at Normal speed on the base rank, whatever the modifier', () => {
    const w = world();
    for (const id of ['plain', 'steady', 'keen']) {
      expect(shot(w, id), id).toEqual({ speed: 1, wait: 60 });
    }
  });

  it('scales each enemy by its own modifier at a high rank, the same in every run', () => {
    const run1 = world({ loadout: 'full' });
    const run2 = world({ loadout: 'full' });
    expect(run1.rank).toBe(14);
    const speed = rankScale(14, BULLET_SPEED_RANK_CURVE);
    const fire = rankScale(14, FIRE_RATE_RANK_CURVE);
    const a = ['plain', 'steady', 'keen'].map((id) => shot(run1, id));
    const b = ['plain', 'steady', 'keen'].map((id) => shot(run2, id));
    expect(a).toEqual(b);
    expect(hashWorld(run1)).toBe(hashWorld(run2));
    expect(a[0].speed).toBeCloseTo(speed, 12);
    expect(a[1].speed).toBe(1);
    expect(a[2].speed).toBeCloseTo(1 + 2 * (speed - 1), 12);
    expect(a[0].wait).toBe(Math.round(60 / fire));
    expect(a[1].wait).toBe(60);
    expect(a[2].wait).toBe(Math.round(60 / (1 + 2 * (fire - 1))));
    // Outside a script the session's scales are back.
    expect(run1.bullets.speedScale).toBe(run1.bullets.rankSpeedScale);
    expect(rankedWait(run1.bullets, 60)).toBe(a[0].wait);
  });

  it('slows bullets on Easy and snaps aimed shots to 16 directions', () => {
    const w = world({ difficulty: 'easy' });
    expect(shot(w, 'plain').speed).toBeCloseTo(0.85 * rankScale(0, BULLET_SPEED_RANK_CURVE), 12);
    expect(w.bullets.aimDirections).toBe(16);
    const origin = new BulletOrigin();
    origin.x = w.players[0].x + 100;
    origin.y = w.players[0].y + 37;
    expect(w.bullets.aimFrom(origin) % 64).toBe(0);
  });
});

describe('core/world revenge bullets (M2-01)', () => {
  it('fires only from minRank on, for a kill credited to a player', () => {
    const low = world(); // rank 2 < 10
    low.enemies.kill(spawnSettled(low, 'avenger'), 0);
    expect(bulletSpeeds(low)).toEqual([]);
    const high = world({ loadout: 'full' }); // rank 14
    high.enemies.kill(spawnSettled(high, 'avenger'), -1); // nobody: no revenge
    expect(bulletSpeeds(high)).toEqual([]);
    high.enemies.kill(spawnSettled(high, 'avenger'), 0);
    expect(bulletSpeeds(high)).toHaveLength(1);
    expect(bulletSpeeds(high)[0]).toBeCloseTo(rankScale(14, BULLET_SPEED_RANK_CURVE), 12);
  });

  it('fires nothing on a Mega Crash or off screen', () => {
    const w = world({ loadout: 'full' });
    spawnSettled(w, 'avenger');
    expect(w.enemies.megaCrash(0)).toBe(1);
    expect(bulletSpeeds(w)).toEqual([]);
    const off = w.enemies.spawn(DB.enemyIndex.get('avenger') ?? -1, w.camera.x + 900, 100);
    w.enemies.kill(off!, 0);
    expect(bulletSpeeds(w)).toEqual([]);
  });

  it('fires the spread3 and ring8 patterns', () => {
    const w = world();
    w.enemies.kill(spawnSettled(w, 'fan'), 0);
    expect(bulletSpeeds(w)).toEqual([1.25, 1.25, 1.25]);
    w.bullets.pool.clear();
    w.enemies.kill(spawnSettled(w, 'ring'), 0);
    expect(bulletSpeeds(w)).toEqual(new Array(8).fill(2));
  });
});

/**
 * Spawns an enemy and steps until it is on screen.
 *
 * @param w - The World.
 * @param id - Enemy id.
 * @returns The enemy.
 */
function spawnSettled(w: World, id: string): Enemy {
  const e = spawn(w, id);
  run(w, 2);
  return e;
}
