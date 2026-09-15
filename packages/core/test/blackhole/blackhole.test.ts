/**
 * `core/blackhole` (plan M3-02): the black-hole bomb of the Direct ship — the stock, the throw,
 * the vortex's pull, the bullets it swallows, its lightning burst — and the death-bomb window the
 * World opens around it (`GameConfig.deathBomb`).
 */
import { describe, expect, it } from 'vitest';
import {
  BLACK_HOLE_BOLT_INTERVAL,
  BLACK_HOLE_BURST_TICKS,
  BLACK_HOLE_CORE_RADIUS,
  BLACK_HOLE_PULL_TICKS,
  BLACK_HOLE_RADIUS,
  BLACK_HOLE_SPRITE,
  BLACK_HOLE_START_STOCK,
  BLACK_HOLE_THROW_X,
  MAX_BLACK_HOLES,
  MAX_BLACK_HOLE_STOCK,
} from '../../src/blackhole/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { Action, createInputSnapshot } from '../../src/input/index.js';
import { PlayerHitCause, playerHit } from '../../src/player/index.js';
import { MeterSlot } from '../../src/powerups/index.js';
import { DEATH_BOMB_INVULN_TICKS, createWorld, stepWorld } from '../../src/world/index.js';
import { MANTA, aliveWorld, directDb, run } from '../helpers/direct.js';

const db = directDb();

/** A Direct-mode world with the black-hole bomb on. */
const bombWorld = (extra = {}): ReturnType<typeof aliveWorld> =>
  aliveWorld(db, { blackHole: true, ...extra });

describe('core/blackhole — the stock', () => {
  it('is off in meter mode and on for the Direct ship with the option', () => {
    expect(aliveWorld(db).blackholes.enabled).toBe(false);
    expect(aliveWorld(db, { blackHole: true }).blackholes.enabled).toBe(true);
    const meter = createWorld(resolveGameConfig({ seed: 3, stage: 'still', blackHole: true }), db);
    expect(meter.blackholes.enabled).toBe(false);
    expect(meter.players[0].bombs).toBe(0);
  });

  it('gives every ship its starting stock and caps what the yellow item adds', () => {
    const w = bombWorld();
    expect(w.players[0].bombs).toBe(BLACK_HOLE_START_STOCK);
    const holes = w.blackholes;
    for (let i = 0; i < 10; i++) holes.addStock(0);
    expect(w.players[0].bombs).toBe(MAX_BLACK_HOLE_STOCK);
    expect(holes.addStock(0)).toBe(false);
    expect(holes.addStock(-1)).toBe(false);
    expect(holes.addStock(1)).toBe(false); // player 2 is not active
  });

  it('the yellow item stocks a bomb instead of detonating a smart bomb', () => {
    const w = bombWorld();
    w.players[0].bombs = 0;
    expect(w.powerups.collectDirect(0, 4)).toBe(true);
    expect(w.players[0].bombs).toBe(1);
  });

  it('the yellow item still detonates a smart bomb without the option', () => {
    const w = aliveWorld(db);
    expect(w.powerups.collectDirect(0, 4)).toBe(true);
    expect(w.players[0].bombs).toBe(0);
  });
});

describe('core/blackhole — throwing a vortex', () => {
  it('a Special press opens one ahead of the ship and spends a bomb', () => {
    const w = bombWorld();
    const input = createInputSnapshot();
    const ship = w.players[0];
    const x = ship.x;
    run(w, input, Action.Special);
    expect(ship.bombs).toBe(BLACK_HOLE_START_STOCK - 1);
    expect(w.blackholes.count).toBe(1);
    const hole = w.blackholes.holes[0];
    expect(hole.owner).toBe(0);
    // Thrown ahead of the ship (it has drifted one tick by now).
    expect(hole.x).toBeGreaterThanOrEqual(x + BLACK_HOLE_THROW_X);
    expect(w.view.batches).toContain(w.blackholes.batch);
    expect(w.blackholes.batch.count).toBe(1);
  });

  it('refuses without a bomb, with every slot open, and for a ship that is not in play', () => {
    const w = bombWorld();
    const holes = w.blackholes;
    w.players[0].bombs = 0;
    expect(holes.fire(0)).toBe(false);
    w.players[0].bombs = MAX_BLACK_HOLE_STOCK;
    for (let i = 0; i < MAX_BLACK_HOLES; i++) expect(holes.fire(0)).toBe(true);
    expect(holes.fire(0)).toBe(false);
    expect(holes.fire(1)).toBe(false);
    expect(holes.fire(-1)).toBe(false);
    holes.clear();
    expect(holes.count).toBe(0);
    w.players[0].state = 'dead';
    expect(holes.fire(0)).toBe(false);
  });

  it('is drawn with the engine sprite the content ships', () => {
    expect(db.sprites.index.get(BLACK_HOLE_SPRITE)).toBeGreaterThanOrEqual(0);
  });
});

describe('core/blackhole — the vortex', () => {
  it('pulls enemy bullets in and swallows the ones that reach the core', () => {
    const w = bombWorld();
    const input = createInputSnapshot();
    run(w, input, Action.Special);
    const hole = w.blackholes.holes[0];
    // A still bullet just inside the reach, and one well outside it.
    const near = w.bullets.spawn(hole.x + BLACK_HOLE_RADIUS / 2, hole.y, 0, 0, BulletKind.RoundRed);
    const far = w.bullets.spawn(hole.x + BLACK_HOLE_RADIUS + 60, hole.y, 0, 0, BulletKind.RoundRed);
    expect(near).toBeGreaterThanOrEqual(0);
    const farX = w.bullets.pool.fields.x[far];
    const nearX = w.bullets.pool.fields.x[near];
    run(w, input, 0);
    expect(w.bullets.pool.fields.x[near]).toBeLessThan(nearX);
    expect(w.bullets.pool.fields.x[far]).toBe(farX);
    // It reaches the core and is swallowed as a point item for the thrower.
    let points = 0;
    let bullets = w.bullets.count;
    for (let i = 0; i < BLACK_HOLE_PULL_TICKS; i++) {
      run(w, input, 0);
      points = Math.max(points, w.bullets.points.count);
      bullets = Math.min(bullets, w.bullets.count);
    }
    expect(points).toBeGreaterThan(0);
    // Only the bullet inside the reach went: the far one is still flying.
    expect(bullets).toBe(1);
  });

  it('pulls enemies towards its centre', () => {
    const w = bombWorld();
    const input = createInputSnapshot();
    run(w, input, Action.Special);
    const hole = w.blackholes.holes[0];
    const enemy = w.enemies.enemies.find((e) => e.state === 0);
    expect(enemy).toBeDefined();
    const pulled = w.enemies.pullTowards(hole.x, hole.y, BLACK_HOLE_RADIUS, 1);
    expect(pulled).toBe(0); // nothing alive on the empty stage
  });

  it('discharges after the pull: bolts every few ticks, then it closes', () => {
    const w = bombWorld();
    const input = createInputSnapshot();
    run(w, input, Action.Special);
    const hole = w.blackholes.holes[0];
    run(w, input, 0, BLACK_HOLE_PULL_TICKS - 1);
    expect(hole.active).toBe(true);
    expect(hole.age).toBe(BLACK_HOLE_PULL_TICKS);
    // The burst: the first bolt goes off on the first tick past the pull.
    run(w, input, 0);
    expect(hole.bolt).toBe(BLACK_HOLE_BOLT_INTERVAL - 1);
    run(w, input, 0, BLACK_HOLE_BURST_TICKS);
    expect(hole.active).toBe(false);
    expect(w.blackholes.count).toBe(0);
  });

  it('swallows only what is inside the core radius', () => {
    const w = bombWorld();
    const holes = w.blackholes;
    holes.fire(0);
    const hole = holes.holes[0];
    const inside = w.bullets.spawn(hole.x, hole.y, 0, 0, BulletKind.RoundRed);
    expect(inside).toBeGreaterThanOrEqual(0);
    const swallowed = w.bullets.vortex(
      hole.x,
      hole.y,
      BLACK_HOLE_RADIUS,
      BLACK_HOLE_CORE_RADIUS,
      2,
      0,
    );
    expect(swallowed).toBe(1);
  });
});

describe('core/world — the death-bomb window (M3-02)', () => {
  it('a fatal hit opens the window instead of killing, and a bomb press cancels the death', () => {
    const w = bombWorld({ deathBomb: 8 });
    const input = createInputSnapshot();
    const ship = w.players[0];
    ship.invulnTicks = 0;
    expect(playerHit(ship, PlayerHitCause.Bullet, w.tick, w.debugFlags)).toBe(true);
    stepWorld(w, input);
    expect(ship.state).toBe('alive');
    expect(ship.bombTicks).toBe(8);
    // Hits are ignored while the window is open.
    expect(playerHit(ship, PlayerHitCause.Bullet, w.tick, w.debugFlags)).toBe(false);
    run(w, input, Action.Special);
    expect(ship.state).toBe('alive');
    expect(ship.bombTicks).toBe(0);
    expect(ship.hitCause).toBe(PlayerHitCause.None);
    expect(ship.invulnTicks).toBe(DEATH_BOMB_INVULN_TICKS);
    expect(w.blackholes.count).toBe(1);
  });

  it('a window that runs out kills the ship on the tick it closes', () => {
    const w = bombWorld({ deathBomb: 4 });
    const input = createInputSnapshot();
    const ship = w.players[0];
    ship.invulnTicks = 0;
    const lives = ship.lives;
    playerHit(ship, PlayerHitCause.Bullet, w.tick, w.debugFlags);
    stepWorld(w, input);
    expect(ship.bombTicks).toBe(4);
    run(w, input, 0, 4);
    expect(ship.state).toBe('dying');
    expect(ship.lives).toBe(lives - 1);
  });

  it('never opens without a bomb, and without the option the ship dies at once', () => {
    const w = bombWorld({ deathBomb: 8 });
    const input = createInputSnapshot();
    const ship = w.players[0];
    ship.invulnTicks = 0;
    ship.bombs = 0;
    playerHit(ship, PlayerHitCause.Bullet, w.tick, w.debugFlags);
    stepWorld(w, input);
    expect(ship.state).toBe('dying');

    const off = bombWorld();
    const other = off.players[0];
    other.invulnTicks = 0;
    playerHit(other, PlayerHitCause.Bullet, off.tick, off.debugFlags);
    stepWorld(off, createInputSnapshot());
    expect(other.state).toBe('dying');
    expect(other.bombTicks).toBe(0);
  });

  it('the meter ship spends its armed `!` slot instead', () => {
    const w = createWorld(resolveGameConfig({ seed: 5, stage: 'still', deathBomb: 8 }), db);
    const input = createInputSnapshot();
    for (let i = 0; i < 200 && w.players[0].state !== 'alive'; i++) stepWorld(w, input);
    const ship = w.players[0];
    ship.invulnTicks = 0;
    // Park the meter cursor on `!` so the bomb is available.
    w.powerups.meters[0].cursor = MeterSlot.Mega;
    expect(w.powerups.canEquip(0, MeterSlot.Mega)).toBe(true);
    playerHit(ship, PlayerHitCause.Bullet, w.tick, w.debugFlags);
    stepWorld(w, input);
    expect(ship.bombTicks).toBe(8);
    run(w, input, Action.PowerUp);
    expect(ship.state).toBe('alive');
    expect(ship.hitCause).toBe(PlayerHitCause.None);
  });
});

describe('core/blackhole — a checkpoint restart (M3-02)', () => {
  it('closes every open vortex with the rest of the session', () => {
    const w = bombWorld();
    const input = createInputSnapshot();
    run(w, input, Action.Special);
    expect(w.blackholes.count).toBe(1);
    const hole = w.blackholes.holes[0];
    expect(hole.active).toBe(true);
    // The stage hooks' `clear()` — every checkpoint restart and the `arcade` death penalty.
    const stage = w.stage;
    expect(stage).not.toBeNull();
    stage?.restartAt(stage.checkpoint);
    expect(w.blackholes.count).toBe(0);
    expect(hole.active).toBe(false);
    expect(hole.owner).toBe(-1);
    // And the restarted session never sees a bolt from it.
    run(w, input, 0, BLACK_HOLE_PULL_TICKS + BLACK_HOLE_BURST_TICKS + 2);
    expect(w.blackholes.count).toBe(0);
  });
});

describe('core/blackhole — the config', () => {
  it('rejects a death-bomb window that is not a whole number of ticks in range', () => {
    expect(() => resolveGameConfig({ deathBomb: -1 })).toThrow(RangeError);
    expect(() => resolveGameConfig({ deathBomb: 31 })).toThrow(RangeError);
    expect(resolveGameConfig({ deathBomb: 8 }).deathBomb).toBe(8);
    expect(() => resolveGameConfig({ blackHole: 1 as unknown as boolean })).toThrow(RangeError);
  });

  it('the MANTA config the tests use is the Direct ship', () => {
    expect(MANTA.powerUpMode).toBe('direct');
  });
});
