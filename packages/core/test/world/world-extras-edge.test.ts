/**
 * The M3-02 extras in the tick pipeline at their edges (`world-extras.test.ts` covers the happy
 * paths): what the **authentic slowdown** counts and how it shares a tick with hit-stop, and the
 * **death-bomb window**'s bookkeeping — the window that is never reopened for the same hit, the
 * ship that runs out of bombs, the meter ship whose `!` slot is not available, and the window a
 * death clears.
 */
import { describe, expect, it } from 'vitest';
import { BulletKind } from '../../src/bullets/index.js';
import { EnemyState } from '../../src/enemies/index.js';
import {
  SLOWDOWN_RUN_TICKS,
  SLOWDOWN_THRESHOLD,
  resolveGameConfig,
} from '../../src/config/index.js';
import { Action, createInputSnapshot } from '../../src/input/index.js';
import { PlayerHitCause, playerHit } from '../../src/player/index.js';
import { MeterSlot } from '../../src/powerups/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';
import { aliveWorld, directDb, run } from '../helpers/direct.js';

const db = directDb();

/** A meter world on the still stage with player 1 alive. */
function meterWorld(extra: Record<string, unknown> = {}): World {
  const w = createWorld(resolveGameConfig({ seed: 11, stage: 'still', ...extra }), db);
  const input = createInputSnapshot();
  for (let i = 0; i < 200 && w.players[0].state !== 'alive'; i++) stepWorld(w, input);
  return w;
}

/**
 * Fills the bullet pool past the slowdown threshold.
 *
 * @param w - The world.
 * @param count - Bullets.
 */
function flood(w: World, count: number): void {
  for (let i = 0; i < count; i++) {
    w.bullets.spawn(w.camera.x + 40 + (i % 40) * 4, w.camera.y + 120, 0, 0, BulletKind.RoundRed);
  }
}

describe('core/world — the authentic slowdown at its edges (M3-02)', () => {
  it('a skipped tick is not a hit-stop tick: the effects keep running', () => {
    const w = meterWorld({ slowdown: true });
    const input = createInputSnapshot();
    flood(w, SLOWDOWN_THRESHOLD + 20);
    stepWorld(w, input);
    stepWorld(w, input);
    expect(w.slowSkip).toBe(true);
    // Hit-stop freezes the FX; a slowdown skip does not — the screen still animates.
    expect(w.fx.frozen).toBe(false);
    w.hitStop = 3;
    stepWorld(w, input);
    expect(w.fx.frozen).toBe(true);
  });

  it('a skipped tick does not count towards the next skip', () => {
    const w = meterWorld({ slowdown: true });
    const input = createInputSnapshot();
    flood(w, SLOWDOWN_THRESHOLD + 20);
    stepWorld(w, input);
    expect(w.slowRun).toBe(SLOWDOWN_RUN_TICKS);
    stepWorld(w, input); // skipped: the clock restarts at 0 and stays there
    expect(w.slowSkip).toBe(true);
    expect(w.slowRun).toBe(0);
    stepWorld(w, input); // run: the clock fills again
    expect(w.slowSkip).toBe(false);
    expect(w.slowRun).toBe(SLOWDOWN_RUN_TICKS);
  });

  it('counts the player`s shots and the items, not only the enemy bullets', () => {
    const w = meterWorld({ slowdown: true, loadout: 'full' });
    const input = createInputSnapshot();
    // A quiet screen: the load is whatever the ship itself puts on it.
    for (let i = 0; i < 30; i++) run(w, input, Action.Shot);
    expect(w.slowLoad).toBe(
      w.bullets.count +
        w.bullets.lasers.count +
        w.weapons.pool.count +
        w.powerups.count +
        w.enemies.enemies.filter((e) => e.state === EnemyState.Live).length,
    );
    expect(w.weapons.pool.count).toBeGreaterThan(0);
  });

  it('stops counting the moment the option goes off between Worlds', () => {
    const on = meterWorld({ slowdown: true });
    const off = meterWorld();
    const input = createInputSnapshot();
    flood(on, SLOWDOWN_THRESHOLD + 20);
    flood(off, SLOWDOWN_THRESHOLD + 20);
    stepWorld(on, input);
    stepWorld(off, input);
    expect(on.slowLoad).toBeGreaterThan(SLOWDOWN_THRESHOLD);
    expect(off.slowLoad).toBe(0);
    expect(off.slowRun).toBe(0);
    expect(off.slowSkip).toBe(false);
  });
});

describe('core/world — the death-bomb window at its edges (M3-02)', () => {
  it('never reopens for the same hit once it has run out', () => {
    const w = aliveWorld(db, { blackHole: true, deathBomb: 3 });
    const input = createInputSnapshot();
    const ship = w.players[0];
    ship.invulnTicks = 0;
    playerHit(ship, PlayerHitCause.Bullet, w.tick, w.debugFlags);
    stepWorld(w, input);
    expect(ship.bombTicks).toBe(3);
    run(w, input, 0, 3);
    // The window closed and marked itself spent (-1) so phase 7 does not open a second one.
    expect(ship.state).toBe('dying');
    // The death clears it for the respawn.
    expect(ship.bombTicks).toBe(0);
  });

  it('a press without a bomb left does not cancel the death', () => {
    const w = aliveWorld(db, { blackHole: true, deathBomb: 10 });
    const input = createInputSnapshot();
    const ship = w.players[0];
    ship.invulnTicks = 0;
    ship.bombs = 1;
    playerHit(ship, PlayerHitCause.Bullet, w.tick, w.debugFlags);
    stepWorld(w, input);
    expect(ship.bombTicks).toBe(10);
    // The stock is emptied behind its back: the press finds nothing to spend.
    ship.bombs = 0;
    run(w, input, Action.Special, 2);
    expect(ship.state).toBe('alive');
    expect(ship.bombTicks).toBeGreaterThan(0);
    run(w, input, 0, 10);
    expect(ship.state).toBe('dying');
  });

  it('the meter ship spends its `!` slot on a Special press too', () => {
    const w = meterWorld({ deathBomb: 8 });
    const input = createInputSnapshot();
    const ship = w.players[0];
    ship.invulnTicks = 0;
    // The meter ship's bomb is Mega Crash on `!`, which it may always equip.
    expect(w.powerups.canEquip(0, MeterSlot.Mega)).toBe(true);
    playerHit(ship, PlayerHitCause.Bullet, w.tick, w.debugFlags);
    stepWorld(w, input);
    expect(ship.bombTicks).toBe(8);
    // Either of the two presses spends it (`DEATH_BOMB_ACTIONS`).
    run(w, input, Action.Special);
    expect(ship.state).toBe('alive');
    expect(ship.hitCause).toBe(PlayerHitCause.None);
    expect(ship.bombTicks).toBe(0);
  });

  it('a Special press throws a vortex without a death-bomb window at all', () => {
    const w = aliveWorld(db, { blackHole: true });
    expect(w.config.deathBomb).toBe(0);
    const input = createInputSnapshot();
    run(w, input, Action.Special);
    expect(w.blackholes.count).toBe(1);
  });

  it('the meter ship`s Special never throws one, whatever the option says', () => {
    const w = meterWorld({ blackHole: true });
    const input = createInputSnapshot();
    w.players[0].bombs = 3;
    run(w, input, Action.Special, 4);
    expect(w.blackholes.enabled).toBe(false);
    expect(w.blackholes.count).toBe(0);
  });
});
