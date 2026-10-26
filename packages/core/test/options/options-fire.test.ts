/**
 * The three new option types inside a World (w15-WB): the **Guard** pods' rear volley (the pod's
 * main role straight back on its own countdown, started by `core/weapons` and stepped in
 * `place`, gated off for beam weapons), the **Echo** wingmen's terrain fold (a folded wingman is
 * silent and the probe only ever sees floored whole-pixel screen positions), and the **Aegis**
 * dishes swallowing enemy bullets inside the wedge ahead of the ship through the World's movement
 * phase (with the Trail world as the control, and a bullet on a line outside the wedge the
 * dishes' reach never covers). Every world here runs with autofire off: only held buttons fire,
 * so a test's shots are exactly the ones it starts itself.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BulletFlag, BulletKind } from '../../src/bullets/index.js';
import { resolveGameConfig, type GameConfig, type OptionChoice } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { FX_CUES, SimEventKind } from '../../src/events/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { GUARD_REAR_INTERVAL } from '../../src/options/index.js';
import { MainWeapon, ShotFlag, WeaponRole } from '../../src/weapons/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';

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
 * The KESTREL, the Type A weapons and the engine sprites (free flight: no stage needed — the
 * weapon specs are what the main role compiles from).
 *
 * @returns The DB.
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [shipped('player/kestrel.player.json'), shipped('weapons/type-a.weapons.json')],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/**
 * A free-flight world of one option type, autofire off, the ship parked mid-view and
 * invulnerable, with two Options equipped.
 *
 * @param optionChoice - The option type under test.
 * @param over - Config fields to change.
 * @returns The world (ship at 150, 100; camera at the origin).
 */
function world(optionChoice: OptionChoice, over: Partial<GameConfig> = {}): World {
  const w = createWorld(
    resolveGameConfig({ seed: 4, optionChoice, autofire: false, remoteMode: false, ...over }),
    db(),
  );
  const input = createInputSnapshot();
  for (let i = 0; i < 60; i++) stepWorld(w, input);
  w.players[0].x = 150;
  w.players[0].y = 100;
  w.players[0].invulnTicks = 1e9;
  w.weapons.loadouts[0].options = 2;
  stepWorld(w, input); // one tick with the count equipped, still no button: nothing fires
  return worldPark(w);
}

/**
 * Re-park the ship (stepWorld lets it settle; with no input it does not drift) and pin the
 * invulnerability the first ticks spent.
 *
 * @param w - The world.
 * @returns The same world.
 */
function worldPark(w: World): World {
  w.players[0].x = 150;
  w.players[0].y = 100;
  w.players[0].invulnTicks = 1e9;
  return w;
}

/**
 * Live main-role shots split by direction.
 *
 * @param w - The world.
 * @param role - The main role ({@link WeaponRole}).
 * @returns `[forward, rearward]` live counts and the rearward shots' (shooter, x, y, vx).
 */
function scanShots(w: World, role: number): { fwd: number; back: number; rear: number[][] } {
  const f = w.weapons.pool.fields;
  let fwd = 0;
  let back = 0;
  const rear: number[][] = [];
  for (let i = 0; i < w.weapons.pool.count; i++) {
    if ((f.flags[i] & ShotFlag.Dead) !== 0 || f.role[i] !== role) continue;
    if (f.vx[i] < 0) {
      back++;
      rear.push([f.shooter[i], f.x[i], f.y[i], f.vx[i]]);
    } else {
      fwd++;
    }
  }
  return { fwd, back, rear };
}

/**
 * Frees every live shot so the next tick measures a clean pool (the weapons cap would otherwise
 * block a lab volley whose previous shots are still flying).
 *
 * @param w - The world.
 */
function drainShots(w: World): void {
  const n = w.weapons.pool.count;
  for (let i = 0; i < n; i++) w.weapons.pool.free(i);
  w.weapons.pool.flush();
}

describe('core/options firing — the Guard pods', () => {
  it('fires the pods rear volley on its own countdown, at the pod, straight back', () => {
    const w = world('guard');
    const g = w.weapons.options[0];
    const input = createInputSnapshot();
    drainShots(w);
    commitPlayerInput(input.players[0], Action.Shot);
    w.weapons.timers.fill(0);
    stepWorld(w, input);
    const interval = w.weapons.timers[0];
    expect(interval).toBeGreaterThan(0);
    expect(w.weapons.timers[2], 'pod 1 timer').toBe(interval);
    expect(w.weapons.timers[4], 'pod 2 timer').toBe(interval);
    const due = interval * GUARD_REAR_INTERVAL;
    // Both pods rear-fired (the countdown started at `due`) and the shots leave at the pod, back.
    expect([...g.rear], 'rear countdown').toEqual([due, due, 0, 0]);
    const s0 = scanShots(w, WeaponRole.Main);
    expect(s0.fwd, 'ship + 2 pods forward').toBe(3);
    expect(s0.back, 'two rear volleys').toBe(2);
    for (const r of s0.rear) {
      const shooter = r[0];
      expect(shooter).toBeGreaterThanOrEqual(1); // never the ship's own shooter
      const slot = shooter - 1;
      expect(r[1], 'rear shot x at the pod').toBeGreaterThan(g.x[slot] - 4);
      expect(r[1]).toBeLessThan(g.x[slot] + 4);
      expect(r[2]).toBeCloseTo(g.y[slot], 1);
      expect(r[3]).toBeLessThan(0);
    }
    // The next volley is forward only: the countdown (now `due − 1`) gates the rear volley off.
    drainShots(w);
    commitPlayerInput(input.players[0], Action.Shot);
    w.weapons.timers.fill(0);
    stepWorld(w, input);
    expect([...g.rear], 'countdown stepped').toEqual([due - 1, due - 1, 0, 0]);
    const s1 = scanShots(w, WeaponRole.Main);
    expect(s1.fwd).toBe(3);
    expect(s1.back, 'no rear volley while the countdown runs').toBe(0);
    // With the countdown spent the rear volley falls again (fresh from the pod, on the same tick).
    g.rear.fill(0);
    drainShots(w);
    commitPlayerInput(input.players[0], Action.Shot);
    w.weapons.timers.fill(0);
    stepWorld(w, input);
    expect([...g.rear], 'countdown restarted').toEqual([due, due, 0, 0]);
    const s2 = scanShots(w, WeaponRole.Main);
    expect(s2.fwd).toBe(3);
    expect(s2.back).toBe(2);
  });

  it('gates the rear volley off for beam weapons (the Laser never fires back)', () => {
    const w = world('guard');
    const g = w.weapons.options[0];
    w.weapons.loadouts[0].main = MainWeapon.Laser;
    const input = createInputSnapshot();
    for (let t = 0; t < 4; t++) {
      commitPlayerInput(input.players[0], Action.Shot);
      w.weapons.timers.fill(0);
      stepWorld(w, input);
      expect([...g.rear], `tick ${t}`).toEqual([0, 0, 0, 0]);
      expect(scanShots(w, WeaponRole.Laser).back).toBe(0);
    }
    expect(g.folded.every((v) => v === 0)).toBe(true); // Echo state untouched by a Guard group
  });
});

describe('core/options firing — the Echo wingmen', () => {
  it('silences folded wingmen and hands the probe floored screen pixels only', () => {
    const w = world('echo');
    const g = w.weapons.options[0];
    const seen: number[][] = [];
    g.setTerrainProbe((px, py) => {
      seen.push([px, py]);
      return px < 160; // the idle line mirrors every wingman onto 150, 100 → all fold
    });
    const input = createInputSnapshot();
    commitPlayerInput(input.players[0], Action.Shot);
    w.weapons.timers.fill(0);
    stepWorld(w, input);
    expect([...g.folded], 'both wingmen folded').toEqual([1, 1, 0, 0]);
    for (const p of seen) {
      expect(Number.isInteger(p[0]), `probe x ${p[0]}`).toBe(true);
      expect(Number.isInteger(p[1]), `probe y ${p[1]}`).toBe(true);
    }
    // Only the ship fired: each folded wingman slot is silent.
    expect(w.weapons.countShots(0, WeaponRole.Main)).toBe(1);
    expect(w.weapons.countShots(1, WeaponRole.Main)).toBe(0);
    expect(w.weapons.countShots(2, WeaponRole.Main)).toBe(0);
    // Open sky: the same tick unfolds the wingmen and they fire from their mirror.
    seen.length = 0;
    g.setTerrainProbe((px, py) => {
      seen.push([px, py]);
      return false;
    });
    commitPlayerInput(input.players[0], Action.Shot);
    w.weapons.timers.fill(0);
    stepWorld(w, input);
    expect([...g.folded], 'unfolded').toEqual([0, 0, 0, 0]);
    expect(w.weapons.countShots(1, WeaponRole.Main)).toBe(1);
    expect(w.weapons.countShots(2, WeaponRole.Main)).toBe(1);
    for (const p of seen) {
      expect(Number.isInteger(p[0])).toBe(true);
      expect(Number.isInteger(p[1])).toBe(true);
    }
  });
});

describe('core/options firing — the Aegis dishes', () => {
  it('swallows a bullet inside the wedge ahead, with a sparkle and a point item', () => {
    const w = world('aegis');
    const g = w.weapons.options[0];
    const input = createInputSnapshot();
    // The dishes ride the orbit radius, two opposite.
    const ship = w.players[0];
    const d0 = Math.sqrt(
      (g.x[0] - ship.x) * (g.x[0] - ship.x) + (g.y[0] - ship.y) * (g.y[0] - ship.y),
    );
    expect(Math.round(d0)).toBe(24); // AEGIS_ORBIT_RADIUS 16 × 3/2, exact
    const i = w.bullets.spawn(210, 100, 512, 2.5, BulletKind.OvalRed);
    expect(i).toBeGreaterThanOrEqual(0);
    const bf = w.bullets.pool.fields;
    expect((bf.flags[i] & BulletFlag.Dead) !== 0).toBe(false);
    let swallowedAt = -1;
    for (let t = 0; t < 40; t++) {
      stepWorld(w, input);
      if ((bf.flags[i] & BulletFlag.Dead) !== 0) {
        swallowedAt = t;
        break;
      }
    }
    expect(swallowedAt, 'swallowed within 40 ticks').toBeGreaterThanOrEqual(0);
    expect(w.bullets.points.count).toBe(1);
    let cancels = 0;
    w.events.drain((e) => {
      if (e.kind === SimEventKind.Particles && e.id === FX_CUES.BulletCancel) {
        cancels++;
        expect(e.x % 1).toBe(0);
        expect(e.y % 1).toBe(0);
      }
    });
    expect(cancels).toBe(1);
  });

  it('leaves bullets outside the wedge alone (a crossing line the reach never covers)', () => {
    const w = world('aegis');
    const input = createInputSnapshot();
    // 80 px ahead and 80 px above, straight down: it crosses the ship's line at a range of 80,
    // beyond the dishes' 24 + 30 reach, and leaves the wedge past it.
    const i = w.bullets.spawn(230, 20, 256, 2.5, BulletKind.OvalRed);
    expect(i).toBeGreaterThanOrEqual(0);
    const bf = w.bullets.pool.fields;
    for (let t = 0; t < 45; t++) stepWorld(w, input);
    expect(bf.flags[i] & BulletFlag.Dead, 'still alive').toBe(0);
    expect(w.bullets.points.count).toBe(0);
    let cancels = 0;
    w.events.drain((e) => {
      if (e.kind === SimEventKind.Particles && e.id === FX_CUES.BulletCancel) cancels++;
    });
    expect(cancels).toBe(0);
    expect(w.players[0].hits).toBe(0);
  });

  it('a Trail world swallows nothing (the control for the same bullet)', () => {
    const w = world('trail');
    const input = createInputSnapshot();
    const i = w.bullets.spawn(210, 100, 512, 2.5, BulletKind.OvalRed);
    const bf = w.bullets.pool.fields;
    for (let t = 0; t < 40; t++) stepWorld(w, input);
    expect(bf.flags[i] & BulletFlag.Dead, 'passed the ship alive').toBe(0);
    expect(bf.x[i]).toBeLessThan(w.players[0].x - 30);
    expect(w.bullets.points.count).toBe(0);
  });
});
