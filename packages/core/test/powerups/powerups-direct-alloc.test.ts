/**
 * Allocation guard of Direct mode (plan M2-05; definition of done: zero allocations per tick), in
 * its own file so the worker's V8 type feedback comes only from these worlds: two MANTA worlds on
 * the still stage — one fully powered (level-8 discs, level-6 double piercing sub lasers, the Hyper
 * Arm), one at the low levels (bombs, missiles) — firing every tick, weaving, toggling the speed,
 * picking up drifting colour items (levels, the Arm, the family switch) and planned drops
 * (`dropDirect`, what a carrier's `powerup` becomes), bullets reaching the Arm. No enemy spawns:
 * every spawn creates its behaviour coroutine (decision D29), which the World guards of zone A
 * account for — the direct range would measure its pincer waves' coroutines, not Direct mode.
 */
import { describe, expect, it } from 'vitest';
import { BulletKind, spawnBullet } from '../../src/bullets/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { ItemKind } from '../../src/powerups/index.js';
import { collectArm } from '../../src/shields/index.js';
import { stepWorld } from '../../src/world/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';
import { aliveWorld, directDb } from '../helpers/direct.js';

describe('M2-05 Direct mode allocation', () => {
  it('allocates nothing over ticks of family volleys, colour items, the Arm and the Speed toggle', () => {
    const db = directDb();
    const full = aliveWorld(db, { loadout: 'full', seed: 31 });
    full.weapons.loadouts[0].sub = 6;
    const low = aliveWorld(db, { seed: 32 });
    low.weapons.loadouts[0].sub = 2;
    const worlds = [full, low];
    const input = createInputSnapshot();
    let t = 0;
    const growth = measureHeapGrowth(
      () => {
        let held = (t / 30) % 2 < 1 ? Action.Up : Action.Down;
        if (t % 120 === 0) held |= Action.Speed;
        commitPlayerInput(input.players[0], held);
        for (let k = 0; k < worlds.length; k++) {
          const w = worlds[k];
          const ship = w.players[0];
          const sx = Math.floor(ship.x) | 0;
          const sy = Math.floor(ship.y) | 0;
          if (t % 9 === 0) spawnBullet(w, sx + 14, sy, 0, 0, BulletKind.RoundPink);
          if (t % 97 === 0) w.powerups.spawnItem(ItemKind.DirectBlue, sx + 20, sy);
          if (t % 131 === 0) w.powerups.spawnItem(ItemKind.DirectOctagon, sx + 20, sy);
          if (t % 173 === 0) w.powerups.spawnItem(ItemKind.DirectRed, sx + 20, sy);
          if (t % 211 === 0) w.powerups.dropDirect(sx + 120, sy);
          if (ship.shield.hits <= 0) collectArm(ship.shield);
          if (ship.lives < 3) ship.lives = 3;
          stepWorld(w, input);
          w.events.clear();
          if (w.status !== 'playing') {
            w.stage?.restartAt(0);
            w.status = 'playing';
          }
        }
        t++;
      },
      6_000,
      12_000,
    );
    expect(full.weapons.pool.count).toBeGreaterThan(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 180_000);
});
