/**
 * Allocation guard of the M3-02 mechanic extras (definition of done: zero allocations per tick),
 * in its own file so the worker's V8 type feedback comes only from this world: the MANTA with the
 * **black-hole bomb**, the **death-bomb window**, **graze** scoring and the **authentic slowdown**
 * all on, under a steady rain of enemy bullets it keeps grazing, throwing a vortex whenever it has
 * one — so every tick of the measured window runs the vortex's drift, pull, swallow and lightning,
 * the graze scan, the slowdown's load count and its skipped ticks.
 *
 * Enemy spawns stay out of the measured window (each coroutine allocates its generator — D29): the
 * bullets are pushed straight into the bullet system instead.
 */
import { describe, expect, it } from 'vitest';
import { BLACK_HOLE_RADIUS, MAX_BLACK_HOLE_STOCK } from '../../src/blackhole/index.js';
import { BulletKind } from '../../src/bullets/index.js';
import { PLAYFIELD_H, PLAYFIELD_W, SLOWDOWN_THRESHOLD } from '../../src/config/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { ANGLE_UNITS } from '../../src/math/index.js';
import { stepWorld } from '../../src/world/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';
import { aliveWorld, directDb } from '../helpers/direct.js';

describe('core/blackhole allocation — the M3-02 extras (bomb, graze, slowdown)', () => {
  it('allocates nothing over ticks of vortices, grazes and skipped ticks', () => {
    const w = aliveWorld(directDb(), {
      blackHole: true,
      deathBomb: 12,
      graze: true,
      slowdown: true,
    });
    w.debugFlags.godMode = true;
    const ship = w.players[0];
    const input = createInputSnapshot();
    let t = 0;
    let bullets = 0;
    let load = 0;
    let vortices = 0;
    const growth = measureHeapGrowth(
      (i) => {
        // A bullet stream across the ship's row every tick: some pass close (a graze), some are
        // swallowed by an open vortex, and the load pushes the slowdown over its threshold.
        const left = ANGLE_UNITS / 2;
        w.bullets.spawn(PLAYFIELD_W - 4, ship.y - 12 + (i % 24), left, 2.5, BulletKind.RoundRed);
        w.bullets.spawn(PLAYFIELD_W - 4, i % PLAYFIELD_H, left, 3, BulletKind.RoundRed);
        // The Special is pressed every 16th tick, and the stock topped up so it always fires.
        const special = i % 16 === 0;
        if (special) w.blackholes.addStock(0);
        commitPlayerInput(input.players[0], Action.Shot | (special ? Action.Special : 0));
        t++;
        stepWorld(w, input);
        // Plain numbers only: the window must stay allocation-free.
        if (w.bullets.count > bullets) bullets = w.bullets.count;
        if (w.slowLoad > load) load = w.slowLoad;
        if (w.blackholes.count > vortices) vortices = w.blackholes.count;
        w.events.clear();
      },
      10_000,
      20_000,
    );
    // The window really exercised the three systems.
    expect(t).toBeGreaterThan(10_000);
    expect(bullets).toBeGreaterThan(0);
    expect(vortices).toBeGreaterThan(0);
    expect(load).toBeGreaterThan(SLOWDOWN_THRESHOLD);
    expect(w.scoring.board.scores[0].score).toBeGreaterThan(0);
    expect(ship.bombs).toBeLessThanOrEqual(MAX_BLACK_HOLE_STOCK);
    expect(BLACK_HOLE_RADIUS).toBeGreaterThan(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  }, 120_000);
});
