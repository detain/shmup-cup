/**
 * Edge cases of the enemy system's **proximity wake** (plan M2-14, `ScriptApi.sleepUntilNear`,
 * `Enemy.nearRange`) — the engine addition behind zone I's depth mines — on test enemies whose
 * behaviour logs every resume:
 *
 * - it returns `SLEEP_FOREVER` and arms `nearRange`; the enemy system wakes the script **on the
 *   tick after** the nearest living player's centre is within the range horizontally **and**
 *   vertically (the edge counts: `<=`), then clears the field — one wake, never another;
 * - one axis in range is not enough; a range ≤ 0 or NaN never wakes (the script sleeps for good);
 * - only while the enemy may fire: on screen **and** settled (`settleTicks` after it was first
 *   seen) — a ship on top of an unsettled enemy waits for the settle;
 * - the nearest **living** player: a dying ship wakes nothing, player 2 near in co-op does;
 * - a waiting enemy costs no script wakes however long it waits, a woken script can wait again,
 *   and a respawn in the slot clears a stale range;
 * - `hashWorld` mixes the field (two waits of different ranges hash apart).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BEHAVIOR_DEFS,
  createBehaviorRegistry,
  defineBehavior,
} from '../../src/behaviors/index.js';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { EnemyFlag, EnemyState, type Enemy, type ScriptApi } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { MoverKind, SLEEP_FOREVER, type Script } from '../../src/patterns/index.js';
import { PlayerHitCause, playerHit } from '../../src/player/index.js';
import { createWorld, joinPlayer, stepWorld, type World } from '../../src/world/index.js';

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
 * A test enemy entry.
 *
 * @param id - Enemy id.
 * @param params - Its behaviour's params.
 * @param over - More fields.
 * @returns The entry.
 */
function enemy(
  id: string,
  params: Record<string, number>,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    hp: 3,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    script: 'probe.near',
    params,
    sprite: 'enemies/drifter',
    drop: null,
    settleTicks: 0,
    ...over,
  };
}

/** The KESTREL and the probe enemies (ranges 40, 0, -5, 25; a slow settler; a re-arming one). */
const DB: ContentDb = (() => {
  const { db, issues } = loadContent([
    shipped('player/kestrel.player.json'),
    {
      path: 'enemies/near.enemies.json',
      data: {
        formatVersion: 1,
        kind: 'enemies',
        enemies: [
          enemy('near-40', { range: 40 }),
          enemy('near-25', { range: 25 }),
          enemy('near-0', { range: 0 }),
          enemy('near-neg', { range: -5 }),
          enemy('near-slow', { range: 40 }, { settleTicks: 40 }),
          enemy('near-again', { range: 30, again: 1 }),
          enemy('plain', {}, { script: 'probe.sleep' }),
        ],
      },
    },
  ]);
  expect(issues).toEqual([]);
  return db;
})();

/** Every resume of a `probe.near` script: `[slot, tick]` (the start, then each wake). */
const log: Array<[number, number]> = [];

/** The value `sleepUntilNear` returned, per call. */
const returned: number[] = [];

/** The API the last `probe.sleep` start received. */
let captured: ScriptApi | null = null;

/** The probe behaviours: `probe.near` logs its start, waits for a ship in `range`, logs the wake. */
const REGISTRY = createBehaviorRegistry([
  ...DEFAULT_BEHAVIOR_DEFS,
  defineBehavior('probe.near', { range: 40, again: 0 }, function* near(api, p): Script {
    api.setMover(MoverKind.None);
    log.push([api.self.slot, api.tick]);
    do {
      const sleep = api.sleepUntilNear(Number.isNaN(p.range) ? Number.NaN : p.range);
      returned.push(sleep);
      yield sleep;
      log.push([api.self.slot, api.tick]);
    } while (p.again > 0);
    yield SLEEP_FOREVER;
  }),
  defineBehavior('probe.sleep', {}, function* sleep(api): Script {
    captured = api;
    yield SLEEP_FOREVER;
  }),
]);

/**
 * A free-flight world (static camera), the ship invulnerable and holding its fire.
 *
 * @param over - Config overrides.
 * @returns The world.
 */
function world(over: Partial<GameConfig> = {}): World {
  const w = createWorld(
    resolveGameConfig({ seed: 5, autofire: false, remoteMode: false, ...over }),
    DB,
    { behaviors: REGISTRY },
  );
  w.debugFlags.godMode = true;
  run(w, 90); // the ship's fly-in
  return w;
}

/**
 * Steps a world with no input.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) {
    stepWorld(w, input);
    w.events.clear();
  }
}

/**
 * Spawns a probe enemy at an offset from player 1.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param dx - X offset from the ship.
 * @param dy - Y offset.
 * @returns The enemy.
 */
function spawnNear(w: World, id: string, dx: number, dy: number): Enemy {
  const ship = w.players[0];
  const e = w.enemies.spawn(DB.enemyIndex.get(id) ?? -1, ship.x + dx, ship.y + dy);
  expect(e).not.toBeNull();
  if (e === null) throw new Error('no slot');
  return e;
}

/**
 * The ticks a slot's script resumed on.
 *
 * @param slot - Enemy slot.
 * @returns Ticks (the start first).
 */
function resumes(slot: number): number[] {
  return log.filter(([s]) => s === slot).map(([, tick]) => tick);
}

describe('core/enemies — the proximity wake (M2-14 sleepUntilNear)', () => {
  it('wakes the script on the tick after a ship comes within range, the edge included, once', () => {
    log.length = 0;
    returned.length = 0;
    const w = world();
    const e = spawnNear(w, 'near-40', 200, 0);
    run(w, 1);
    expect(returned).toEqual([SLEEP_FOREVER]);
    expect(e.nearRange).toBe(40);
    const start = resumes(e.slot);
    expect(start).toHaveLength(1);
    run(w, 30); // far: nothing
    expect(resumes(e.slot)).toHaveLength(1);
    expect(e.nearRange).toBe(40);
    // Put it exactly 40 px away on both axes: the range's edge counts.
    const ship = w.players[0];
    e.x = ship.x + 40;
    e.y = ship.y - 40;
    const tick = w.tick;
    run(w, 1); // the proximity test (movement phase) sees it and clears the field …
    expect(e.nearRange).toBe(0);
    expect(resumes(e.slot)).toHaveLength(1);
    run(w, 1); // … the script wakes on the next tick
    expect(resumes(e.slot)).toEqual([start[0], tick + 1]);
    // One wake only: it stays near, nothing more.
    run(w, 60);
    expect(resumes(e.slot)).toHaveLength(2);
  });

  it('needs both axes in range: a ship level with it but farther, or right under it, wakes nothing', () => {
    log.length = 0;
    const w = world();
    const ship = w.players[0];
    const level = spawnNear(w, 'near-25', 26, 0); // 26 px to the right, same row
    const under = spawnNear(w, 'near-25', 0, 26); // same column, 26 px down
    run(w, 60);
    expect(resumes(level.slot)).toHaveLength(1);
    expect(resumes(under.slot)).toHaveLength(1);
    expect([level.nearRange, under.nearRange]).toEqual([25, 25]);
    // Half a pixel closer on the far axis: both wake.
    level.x = ship.x + 25;
    under.y = ship.y + 25;
    run(w, 2);
    expect(resumes(level.slot)).toHaveLength(2);
    expect(resumes(under.slot)).toHaveLength(2);
  });

  it('never wakes with a range of 0, below 0 or NaN — the script sleeps for good', () => {
    log.length = 0;
    returned.length = 0;
    const w = world();
    const zero = spawnNear(w, 'near-0', 0, 0);
    const negative = spawnNear(w, 'near-neg', 0, 0);
    run(w, 120); // right on top of the ship
    expect(resumes(zero.slot)).toHaveLength(1);
    expect(resumes(negative.slot)).toHaveLength(1);
    expect([zero.nearRange, negative.nearRange]).toEqual([0, 0]);
    expect(returned).toEqual([SLEEP_FOREVER, SLEEP_FOREVER]);
    expect([zero.state, negative.state]).toEqual([EnemyState.Live, EnemyState.Live]);
    // Through the API directly: NaN and negative ranges arm nothing, a fraction is kept.
    const plain = spawnNear(w, 'plain', 150, 0);
    run(w, 1);
    const api = captured;
    if (api === null) throw new Error('probe.sleep never started');
    expect(api.self).toBe(plain);
    expect(api.sleepUntilNear(Number.NaN)).toBe(SLEEP_FOREVER);
    expect(plain.nearRange).toBe(0);
    expect(api.sleepUntilNear(-3)).toBe(SLEEP_FOREVER);
    expect(plain.nearRange).toBe(0);
    expect(api.sleepUntilNear(12.5)).toBe(SLEEP_FOREVER);
    expect(plain.nearRange).toBe(12.5);
  });

  it('waits for the enemy to settle: a ship on top of an unsettled enemy wakes it settleTicks after it was seen', () => {
    log.length = 0;
    const w = world();
    const e = spawnNear(w, 'near-slow', 0, 0);
    run(w, 2);
    expect(e.flags & EnemyFlag.OnScreen).toBe(EnemyFlag.OnScreen);
    expect(e.flags & EnemyFlag.Settled).toBe(0);
    const seen = e.firstSeenTick;
    expect(seen).toBeGreaterThanOrEqual(0);
    let woke = -1;
    for (let t = 0; t < 80 && woke < 0; t++) {
      run(w, 1);
      if (resumes(e.slot).length > 1) woke = resumes(e.slot)[1];
    }
    // Settled `settleTicks` (40) after it was first seen; the proximity test then wakes it next tick.
    expect(woke).toBeGreaterThanOrEqual(seen + 40);
    expect(woke).toBeLessThanOrEqual(seen + 42);
  });

  it('only a living ship counts: a dying ship wakes nothing; player 2 near in co-op does', () => {
    log.length = 0;
    const w = world();
    const ship = w.players[0];
    w.debugFlags.godMode = false;
    expect(playerHit(ship, PlayerHitCause.Bullet, w.tick, w.debugFlags)).toBe(true);
    run(w, 1);
    expect(ship.state).not.toBe('alive');
    const e = spawnNear(w, 'near-40', 0, 0);
    run(w, 20);
    expect(ship.state).not.toBe('alive');
    expect(resumes(e.slot)).toHaveLength(1);
    expect(e.nearRange).toBe(40);

    // Co-op: player 2 drops in; the probe sits by player 2, far from player 1.
    const coop = world({ coop: true });
    expect(joinPlayer(coop, 1)).toBe(true);
    const p1 = coop.players[0];
    const p2 = coop.players[1];
    for (let t = 0; t < 400 && !(p2.state === 'alive' && p2.stateTicks > 60); t++) run(coop, 1);
    expect(p2.state).toBe('alive');
    p1.y = p2.y > 108 ? p2.y - 100 : p2.y + 100; // player 1 well out of reach
    log.length = 0; // the first world's probe had the same slot
    const by2 = coop.enemies.spawn(DB.enemyIndex.get('near-40') ?? -1, p2.x + 10, p2.y);
    expect(by2).not.toBeNull();
    if (by2 === null) return;
    expect(Math.abs(p1.y - by2.y)).toBeGreaterThan(40);
    run(coop, 3);
    expect(resumes(by2.slot)).toHaveLength(2);
  });

  it('costs no script wakes while it waits, however long; a woken script can wait again', () => {
    log.length = 0;
    const w = world();
    const e = spawnNear(w, 'near-again', 150, 0);
    run(w, 600);
    expect(resumes(e.slot)).toHaveLength(1); // only its start in 600 ticks
    const ship = w.players[0];
    e.x = ship.x + 20;
    run(w, 2);
    expect(resumes(e.slot)).toHaveLength(2);
    // It waits again (the ship still in reach): woken again at once, the tick after.
    expect(e.nearRange).toBe(0);
    run(w, 2);
    expect(resumes(e.slot).length).toBeGreaterThanOrEqual(3);
    // Out of reach, it waits again for good.
    e.x = ship.x + 200;
    run(w, 3);
    const woken = resumes(e.slot).length;
    expect(e.nearRange).toBe(30);
    run(w, 300);
    expect(resumes(e.slot)).toHaveLength(woken);
  });

  it('clears a stale range when the slot is reused', () => {
    log.length = 0;
    const w = world();
    const e = spawnNear(w, 'near-40', 150, 0);
    run(w, 1);
    expect(e.nearRange).toBe(40);
    const slot = e.slot;
    w.enemies.kill(e, 0);
    run(w, 1);
    expect(e.state).not.toBe(EnemyState.Live);
    const next = spawnNear(w, 'plain', 150, 0);
    expect(next.slot).toBe(slot);
    expect(next.nearRange).toBe(0);
  });

  it('is part of the state hash', () => {
    const a = world();
    const b = world();
    spawnNear(a, 'near-40', 150, 0);
    spawnNear(b, 'near-25', 150, 0);
    run(a, 1);
    run(b, 1);
    const ea = a.enemies.enemies.find((e) => e.state === EnemyState.Live);
    const eb = b.enemies.enemies.find((e) => e.state === EnemyState.Live);
    expect([ea?.nearRange, eb?.nearRange]).toEqual([40, 25]);
    // The same world but for the range (spec index aside): make the spec index equal too.
    if (ea !== undefined && eb !== undefined) eb.specIndex = ea.specIndex;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
    if (eb !== undefined) eb.nearRange = 40;
    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});
