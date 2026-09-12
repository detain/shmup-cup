/**
 * Edge cases of `core/bullets` (plan M1-09) beyond the functional suite:
 *
 * - spawning: the directional frame of every whole heading, `spawn` ≡ `emit`, fractional / huge /
 *   negative angles, `AIM_AT_TARGET` at 4 and 1024 directions, bad kinds;
 * - the setters: no-ops on slots that are out of range or removed this tick, `setFlags` keeping
 *   the internal bits, `setDelay` / `setChange` / `setHoming` argument edges, the order "change
 *   → homing → acceleration → angular velocity", homing the short way round and without a target;
 * - culling exactly at the view ± 16 px on all four sides while the camera scrolls both ways,
 *   non-finite positions (regression: a NaN bullet was never culled and hit every ship it was
 *   tested against), terrain only for `DieOnTerrain` bullets and only inside the map, the pool
 *   compacting in phase 8 with every field of a moved bullet intact, spawns after a cancel in the
 *   same tick;
 * - players: two ships, a bullet over both (taken by the first), the first overlap deciding for
 *   a ship, bullets removed this tick never hitting, a bullet and a laser hit in one tick;
 * - lasers: every combination of empty phases lasting exactly the sum of its timings, fractional
 *   / negative timings, the drawn width of each grow / fade tick, the blink, the capsule's exact
 *   reach (sides, both caps, diagonal), aimed / wrapped / rounded angles, fixed lasers riding the
 *   camera, unknown sources, detach edge cases, no beam sprite;
 * - cancel: the sparkle count formula for 1 … 512 bullets, repeated cancels, non-cancelable
 *   lasers, cancelled bullets hidden at once;
 * - a checkpoint restart empties both pools.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AIM_AT_TARGET,
  BULLET_CULL_MARGIN,
  BULLET_KINDS,
  BULLET_SCHEMA,
  BulletFlag,
  BulletKind,
  BulletOrigin,
  CANCEL_SPARKLE_LIMIT,
  CancelMode,
  LASER_ACTIVE_TICKS,
  LASER_BLINK_TICKS,
  LASER_FADE_TICKS,
  LASER_GROW_TICKS,
  LASER_TELEGRAPH_TICKS,
  LASER_WIDTH,
  LaserPhase,
  MAX_BULLET_SPEED,
  MAX_ENEMY_BULLETS,
  NO_TARGET_ANGLE,
  UNCHANGED,
  cancelAllBullets,
  fireLaser,
  spawnBullet,
} from '../../src/bullets/index.js';
import { findFloor, terrainSolidAt } from '../../src/collision/index.js';
import { PLAYFIELD_H, PLAYFIELD_W, resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { FX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { SIN_TABLE_Q16, TRIG_SCALE } from '../../src/math/trig-table.js';
import { atan2B, quantizeAngle } from '../../src/math/index.js';
import { PlayerHitCause } from '../../src/player/index.js';
import { SpriteFlag } from '../../src/presentation/index.js';
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
 * The KESTREL, the shipped tileset and a static stage `t` with a flat 32-px floor (one checkpoint,
 * at 0).
 *
 * @param extraSprites - Engine sprites to intern.
 * @returns The DB.
 */
function db(extraSprites: readonly string[] = ENGINE_SPRITES): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('tilesets/terrain-a.tileset.json'),
      {
        path: 'stages/t.stage.json',
        data: {
          formatVersion: 1,
          kind: 'stage',
          id: 't',
          name: 'T',
          music: { stage: 'Stage', boss: 'Boss' },
          length: 3000,
          camera: [{ x: 0, speed: 0 }],
          checkpoints: [{ x: 0 }],
          parallax: [],
          tilemap: {
            tileSize: 8,
            tileset: 'terrain-a',
            rowsTall: 25,
            generator: {
              type: 'heightfield',
              segments: [{ from: 0, to: 3384, floor: { base: 32, amp: 0, period: 64, seed: 1 } }],
            },
          },
          events: [],
        },
      },
    ],
    { extraSprites },
  );
  expect(issues).toEqual([]);
  return content;
}

/** Shared DB (read-only). */
const DB = db();

/**
 * A world (the flat stage by default, or free flight), stepped until the ship is alive, then the
 * ship parked at `(20, 20)` out of the way with god mode off.
 *
 * @param options - Stage, aim directions, content.
 * @returns The world.
 */
function world(
  options: { stage?: string | null; aimDirections?: number; content?: ContentDb } = {},
): World {
  const w = createWorld(
    resolveGameConfig({
      stage: options.stage === undefined ? 't' : options.stage,
      seed: 5,
      aimDirections: options.aimDirections ?? 32,
    }),
    options.content ?? DB,
  );
  run(w, 60);
  park(w, 20, 20);
  return w;
}

/**
 * Moves player 1.
 *
 * @param w - The world.
 * @param x - World x.
 * @param y - World y.
 */
function park(w: World, x: number, y: number): void {
  w.players[0].x = x;
  w.players[0].y = y;
}

/**
 * Steps a world with no input.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) stepWorld(w, input);
}

/**
 * Drains the world's events into plain records.
 *
 * @param w - The world.
 * @returns The events.
 */
function drain(w: World): SimEvent[] {
  const out: SimEvent[] = [];
  w.events.drain((e) => out.push({ ...e }));
  return out;
}

/**
 * An origin.
 *
 * @param x - World x.
 * @param y - World y.
 * @returns A fresh origin.
 */
function origin(x: number, y: number): BulletOrigin {
  const o = new BulletOrigin();
  o.x = x;
  o.y = y;
  return o;
}

/**
 * Every field of one bullet slot.
 *
 * @param w - The world.
 * @param i - The slot.
 * @returns Field name → value (sorted names).
 */
function slot(w: World, i: number): Record<string, number> {
  const f = w.bullets.pool.fields as unknown as Record<string, ArrayLike<number>>;
  const out: Record<string, number> = {};
  for (const name of Object.keys(BULLET_SCHEMA).sort()) out[name] = f[name][i];
  return out;
}

/**
 * Every field of every live bullet slot.
 *
 * @param w - The world.
 * @returns One record per slot.
 */
function slots(w: World): Array<Record<string, number>> {
  const out: Array<Record<string, number>> = [];
  for (let i = 0; i < w.bullets.count; i++) out.push(slot(w, i));
  return out;
}

/** The bullet pool's fields. */
const fields = (w: World) => w.bullets.pool.fields;

/** The laser pool's fields. */
const laserFields = (w: World) => w.bullets.lasers.fields;

describe('core/bullets edge: spawning', () => {
  it('gives 8-frame kinds frame ((a + 32) >> 6) & 7 for every whole heading, round kinds 0', () => {
    const w = world();
    const f = fields(w);
    for (let a = 0; a < 1024; a++) {
      w.bullets.pool.clear();
      const oval = w.bullets.spawn(100, 100, a, 1, BulletKind.OvalPurple);
      const needle = w.bullets.spawn(100, 100, a, 1, BulletKind.NeedleRed);
      const round = w.bullets.spawn(100, 100, a, 1, BulletKind.RoundRed);
      const expected = ((a + 32) >> 6) & 7;
      expect([f.frame[oval], f.frame[needle], f.frame[round]], `angle ${a}`).toEqual([
        expected,
        expected,
        0,
      ]);
      expect(f.vx[oval]).toBe((SIN_TABLE_Q16[(a + 256) & 1023] / TRIG_SCALE) * 1);
      expect(f.vy[oval]).toBe(SIN_TABLE_Q16[a] / TRIG_SCALE);
    }
  });

  it('gives every kind its radius, flags and resolved sprite id', () => {
    const w = world();
    const f = fields(w);
    BULLET_KINDS.forEach((kind, k) => {
      const i = w.bullets.spawn(100, 100, 0, 1, k);
      expect([f.kind[i], f.radius[i], f.flags[i], f.sprite[i], f.draw[i]]).toEqual([
        k,
        kind.radius,
        kind.flags,
        DB.sprites.index.get(kind.sprite),
        0,
      ]);
    });
  });

  it('spawn and emit (and spawnBullet) fill identical slots, AIM_AT_TARGET included', () => {
    for (const angle of [0, 300.25, -7, AIM_AT_TARGET]) {
      const a = world();
      const b = world();
      const c = world();
      park(a, 150, 170);
      park(b, 150, 170);
      park(c, 150, 170);
      const i = a.bullets.spawn(210.5, 60.25, angle, 1.75, BulletKind.OvalRed);
      const j = b.bullets.emit(origin(210.5, 60.25), angle, 1.75, BulletKind.OvalRed);
      const k = spawnBullet(c, 210.5, 60.25, angle, 1.75, BulletKind.OvalRed);
      expect([i, j, k]).toEqual([0, 0, 0]);
      expect(slot(b, j), String(angle)).toEqual(slot(a, i));
      expect(slot(c, k), String(angle)).toEqual(slot(a, i));
    }
  });

  it('keeps fractional headings but takes the velocity and frame from the rounded one', () => {
    const w = world();
    const f = fields(w);
    const i = w.bullets.spawn(100, 100, 10.4, 2, BulletKind.NeedlePink);
    expect(f.angle[i]).toBe(10.4);
    expect(f.vy[i]).toBe((SIN_TABLE_Q16[10] / TRIG_SCALE) * 2);
    const j = w.bullets.spawn(100, 100, 1023.6, 2, BulletKind.NeedlePink);
    expect(f.angle[j]).toBeCloseTo(1023.6, 10);
    expect([f.vy[j], f.frame[j]]).toEqual([0, 0]); // rounds to 1024 ≡ 0
    expect(f.vx[j]).toBe(2);
  });

  it('wraps huge and negative finite headings into [0, 1024)', () => {
    const w = world();
    const f = fields(w);
    const cases: Array<[number, number]> = [
      [1024, 0],
      [2048 + 5, 5],
      [1e6 + 3, (1e6 + 3) % 1024],
      [-1, 1023],
      [-0.5, 1023.5],
      [-1024 * 7 - 256, 768],
    ];
    for (const [angle, expected] of cases) {
      const i = w.bullets.spawn(100, 100, angle, 1, 0);
      expect(f.angle[i], String(angle)).toBe(expected);
      expect(f.angle[i]).toBeGreaterThanOrEqual(0);
      expect(f.angle[i]).toBeLessThan(1024);
    }
  });

  it('snaps AIM_AT_TARGET to config.aimDirections: 4 → quarter turns, 1024 → the exact table aim', () => {
    const four = world({ aimDirections: 4 });
    park(four, 100 + 80, 100 + 70); // ≈ 41°: nearest quarter is 0
    expect(four.bullets.aimFrom(origin(100, 100))).toBe(0);
    park(four, 100 + 60, 100 + 70); // ≈ 49°: nearest quarter is 90° (256)
    expect(four.bullets.aimFrom(origin(100, 100))).toBe(256);
    const fine = world({ aimDirections: 1024 });
    for (const [dx, dy] of [
      [80, 30],
      [-13, 57],
      [-90, -1],
      [5, -120],
    ]) {
      park(fine, 150 + dx, 100 + dy);
      const exact = atan2B(dy * 64, dx * 64);
      expect(fine.bullets.aimFrom(origin(150, 100))).toBe(quantizeAngle(exact, 1024));
      const i = fine.bullets.spawn(150, 100, AIM_AT_TARGET, 1, 0);
      expect(fields(fine).angle[i]).toBe(quantizeAngle(exact, 1024));
    }
  });

  it('breaks aim ties towards player 1 and ignores inactive and non-alive ships', () => {
    const w = world();
    park(w, 100, 100);
    const p2 = w.players[1];
    p2.active = true;
    p2.state = 'alive';
    p2.x = 300;
    p2.y = 100;
    expect(w.bullets.aimFrom(origin(200, 100))).toBe(512); // equal distance: player 1 (left)
    p2.x = 290;
    expect(w.bullets.aimFrom(origin(200, 100))).toBe(0);
    p2.active = false;
    expect(w.bullets.aimFrom(origin(200, 100))).toBe(512);
    p2.active = true;
    w.players[0].state = 'dying';
    p2.x = 200;
    p2.y = 190; // straight below
    expect(w.bullets.aimFrom(origin(200, 100))).toBe(256);
    p2.state = 'respawning';
    expect(w.bullets.aimFrom(origin(200, 100))).toBe(NO_TARGET_ANGLE);
  });

  it('drops non-integer, non-finite and out-of-range kinds', () => {
    const w = world();
    for (const kind of [Number.NaN, Infinity, -Infinity, BULLET_KINDS.length, 1e9, -0.5, 2.0001]) {
      expect(w.bullets.spawn(100, 100, 0, 1, kind), String(kind)).toBe(-1);
      expect(w.bullets.emit(origin(100, 100), 0, 1, kind)).toBe(-1);
    }
    expect(w.bullets.spawn(100, 100, 0, 1, 8)).toBe(0);
    expect(w.bullets.count).toBe(1);
  });
});

describe('core/bullets edge: setters', () => {
  it('ignore slots out of range and slots removed this tick', () => {
    const w = world();
    park(w, 20, 190);
    w.debugFlags.godMode = true; // parked in the floor: no terrain death (M1-12)
    w.bullets.spawn(100, 100, 0, 1, 0);
    w.bullets.spawn(120, 100, 0, 1, 0);
    cancelAllBullets(w, CancelMode.Sparkle);
    w.bullets.spawn(140, 100, 0, 1, 0); // slot 2, live
    const before = slots(w);
    for (const index of [-1, 0, 1, 3, 600]) {
      w.bullets.setMotion(index, 1, 1, 1, 1);
      w.bullets.setChange(index, 3, 1, 1);
      w.bullets.setDelay(index, 3, true);
      w.bullets.setHoming(index, 3, 3);
      w.bullets.setFlags(index, 0);
    }
    expect(slots(w)).toEqual(before);
    w.bullets.setMotion(2, 0.5, 0, 0, 4);
    expect(fields(w).accel[2]).toBe(0.5);
  });

  it('setFlags replaces only the public bits and keeps the internal ones', () => {
    const w = world();
    const f = fields(w);
    const i = w.bullets.spawn(100, 100, 0, 1, 0);
    w.bullets.setDelay(i, 5, true);
    expect(f.flags[i]).toBe(
      BulletFlag.DieOnTerrain | BulletFlag.Cancelable | BulletFlag.AimOnLaunch,
    );
    w.bullets.setFlags(i, 0);
    expect(f.flags[i]).toBe(BulletFlag.AimOnLaunch);
    w.bullets.setFlags(i, 0xff);
    expect(f.flags[i]).toBe(
      BulletFlag.DieOnTerrain | BulletFlag.Cancelable | BulletFlag.Grazed | BulletFlag.AimOnLaunch,
    );
    w.bullets.setFlags(i, BulletFlag.Dead); // an internal bit: ignored
    expect(f.flags[i]).toBe(BulletFlag.AimOnLaunch);
    expect(w.bullets.count).toBe(1);
  });

  it('setDelay: < 1 / NaN launch at once (no re-aim), fractions floor, 0 cancels a delay', () => {
    const w = world();
    park(w, 20, 190);
    w.debugFlags.godMode = true; // parked in the floor: no terrain death (M1-12)
    const f = fields(w);
    const cases: Array<[number, number]> = [
      [0, 0],
      [-3, 0],
      [0.9, 0],
      [Number.NaN, 0],
      [2.7, 2],
      [1, 1],
    ];
    const index: number[] = [];
    for (const [ticks] of cases) {
      const i = w.bullets.spawn(100 + index.length * 10, 60, 256, 1, 0);
      w.bullets.setDelay(i, ticks, true);
      index.push(i);
    }
    const cancelled = w.bullets.spawn(200, 60, 256, 1, 0);
    w.bullets.setDelay(cancelled, 4, true);
    w.bullets.setDelay(cancelled, 0, true);
    expect(f.flags[cancelled] & BulletFlag.AimOnLaunch).toBe(0);
    const firstMove: number[] = index.map(() => -1);
    for (let t = 1; t <= 5; t++) {
      run(w, 1);
      index.forEach((i, k) => {
        if (firstMove[k] < 0 && f.y[i] > 60) firstMove[k] = t;
      });
    }
    // Wait n ticks → the first move is n ticks after the firing tick's own.
    expect(firstMove).toEqual(cases.map(([, waits]) => waits + 1));
    expect(f.y[cancelled]).toBe(65);
    // A bullet that launched at once kept its heading (256: straight down), never re-aimed left.
    expect(f.angle[index[0]]).toBe(256);
  });

  it('setDelay without aimOnLaunch keeps the heading; with it the launch re-aims (velocity too)', () => {
    const w = world();
    const f = fields(w);
    park(w, 100, 100);
    const kept = w.bullets.spawn(200, 60, 0, 1, BulletKind.OvalPink);
    w.bullets.setDelay(kept, 2, false);
    const aimed = w.bullets.spawn(200, 60, 0, 1, BulletKind.OvalPink);
    w.bullets.setDelay(aimed, 2, true);
    run(w, 2);
    expect([f.angle[kept], f.angle[aimed]]).toEqual([0, 0]);
    park(w, 200, 180); // straight below the bullets at launch
    w.debugFlags.godMode = true; // parked in the floor: no terrain death (M1-12)
    run(w, 1);
    expect([f.angle[kept], f.angle[aimed]]).toEqual([0, 256]);
    expect([f.vx[aimed], f.vy[aimed], f.frame[aimed]]).toEqual([0, 1, 4]);
    expect(f.flags[aimed] & BulletFlag.AimOnLaunch).toBe(0);
    expect([f.x[kept], f.y[aimed]]).toEqual([201, 61]);
  });

  it('a delayed bullet rides the camera both ways and can hit while it waits', () => {
    const w = world({ stage: null });
    w.camera.vx = 1.25;
    w.camera.vy = -0.5;
    const f = fields(w);
    const i = w.bullets.spawn(w.camera.x + 200, w.camera.y + 80, 0, 3, 0);
    w.bullets.setDelay(i, 20, false);
    run(w, 10);
    expect([f.x[i] - w.camera.x, f.y[i] - w.camera.y]).toEqual([200, 80]);
    park(w, f.x[i], f.y[i]);
    const hits = w.players[0].hits;
    run(w, 1);
    expect(w.players[0].hits).toBe(hits + 1);
    expect(w.players[0].hitCause).toBe(PlayerHitCause.Bullet);
    expect(w.bullets.count).toBe(0);
  });

  it('setChange: 0 / negative cancel, fractions floor, a past age never fires, angles wrap', () => {
    const w = world();
    park(w, 20, 190);
    w.debugFlags.godMode = true; // parked in the floor: no terrain death (M1-12)
    const f = fields(w);
    const a = w.bullets.spawn(100, 60, 0, 1, 0);
    w.bullets.setChange(a, 2, 3, UNCHANGED);
    w.bullets.setChange(a, 0, 3, UNCHANGED); // cancelled
    const b = w.bullets.spawn(100, 70, 0, 1, 0);
    w.bullets.setChange(b, -4, 3, UNCHANGED);
    const c = w.bullets.spawn(100, 80, 0, 1, 0);
    w.bullets.setChange(c, 2.9, UNCHANGED, -256); // at age 2, heading 768
    const d = w.bullets.spawn(100, 90, 0, 1, 0);
    w.bullets.setChange(d, 1, UNCHANGED, UNCHANGED); // a change of nothing
    expect([f.changeAt[a], f.changeAt[b], f.changeAt[c]]).toEqual([0, 0, 2]);
    run(w, 3);
    expect([f.speed[a], f.speed[b], f.angle[a], f.angle[b]]).toEqual([1, 1, 0, 0]);
    expect(f.angle[c]).toBe(768);
    expect([f.speed[d], f.angle[d], f.x[d]]).toEqual([1, 0, 103]);
    // Scheduling a change for an age the bullet already passed: never applies.
    w.bullets.setChange(d, 2, 0, UNCHANGED);
    run(w, 5);
    expect(f.speed[d]).toBe(1);
  });

  it('applies a change before homing, acceleration and angular velocity of the same tick', () => {
    const w = world();
    park(w, 20, 190);
    w.debugFlags.godMode = true; // parked in the floor: no terrain death (M1-12)
    const f = fields(w);
    const i = w.bullets.spawn(150, 60, 0, 1, 0);
    w.bullets.setMotion(i, 0.5, 4, 0, 16);
    w.bullets.setChange(i, 1, 3, 100);
    run(w, 1);
    expect([f.speed[i], f.angle[i]]).toEqual([3.5, 104]);
  });

  it('counts a change on a delayed bullet in moving ticks', () => {
    const w = world();
    park(w, 20, 190);
    w.debugFlags.godMode = true; // parked in the floor: no terrain death (M1-12)
    const f = fields(w);
    const i = w.bullets.spawn(150, 60, 0, 1, 0);
    w.bullets.setDelay(i, 5, false);
    w.bullets.setChange(i, 2, 0, UNCHANGED);
    const xs: number[] = [];
    for (let t = 0; t < 9; t++) {
      run(w, 1);
      xs.push(f.x[i]);
    }
    // 5 waiting ticks + the firing tick's own, then age 1 moves 1 px, age 2 stops (speed 0).
    expect(xs).toEqual([150, 150, 150, 150, 150, 151, 151, 151, 151]);
  });

  it('setHoming: negative turn rate never turns, lifetime < 1 / NaN is off, fractions floor', () => {
    const w = world();
    park(w, 100, 190);
    w.debugFlags.godMode = true; // parked in the floor: no terrain death (M1-12)
    const f = fields(w);
    const a = w.bullets.spawn(100, 40, 0, 0, 0);
    w.bullets.setHoming(a, -8, 5);
    const b = w.bullets.spawn(110, 40, 0, 0, 0);
    w.bullets.setHoming(b, 8, 0.5);
    const c = w.bullets.spawn(120, 40, 0, 0, 0);
    w.bullets.setHoming(c, 8, Number.NaN);
    const d = w.bullets.spawn(130, 40, 0, 0, 0);
    w.bullets.setHoming(d, 8, 2.9);
    expect([f.turnRate[a], f.homing[a], f.homing[b], f.homing[c], f.homing[d]]).toEqual([
      0, 5, 0, 0, 2,
    ]);
    run(w, 4);
    expect([f.angle[a], f.angle[b], f.angle[c]]).toEqual([0, 0, 0]);
    expect(f.homing[a]).toBe(1);
    expect(f.angle[d]).toBe(16); // two homing ticks of 8
  });

  it('homes the short way across 0, snaps onto the target with a big turn rate', () => {
    const w = world();
    park(w, 300, 100);
    const f = fields(w);
    const across = w.bullets.spawn(200, 110, 1000, 0, 0); // target ≈ 5.7° up-right (≈ 1008)
    w.bullets.setHoming(across, 3, 100);
    const back = w.bullets.spawn(200, 90, 40, 0, 0); // target ≈ -5.7° (≈ 16)
    w.bullets.setHoming(back, 3, 100);
    const snap = w.bullets.spawn(250, 150, 0, 0, 0);
    w.bullets.setHoming(snap, 1000, 1);
    run(w, 1);
    expect(f.angle[across]).toBe(1003);
    expect(f.angle[back]).toBe(37);
    const exact = atan2B((100 - 150) * 64, (300 - 250) * 64);
    expect(f.angle[snap]).toBe(exact); // unquantised: homing is not snapped to 32 steps
    run(w, 10);
    expect(f.angle[across]).toBe(atan2B((100 - 110) * 64, (300 - 200) * 64));
    expect(f.angle[back]).toBe(atan2B((100 - 90) * 64, (300 - 200) * 64));
  });

  it('turns anticlockwise for a target straight behind, and flies straight without a target', () => {
    const w = world();
    park(w, 100, 100);
    const f = fields(w);
    const i = w.bullets.spawn(200, 100, 0, 0, 0); // target at 512 = exactly behind
    w.bullets.setHoming(i, 10, 3);
    run(w, 1);
    expect(f.angle[i]).toBe(1014);
    w.players[0].state = 'dead';
    run(w, 1);
    expect([f.angle[i], f.homing[i]]).toEqual([1014, 1]); // no target: straight, still counting
    run(w, 1);
    expect(f.homing[i]).toBe(0);
  });

  it('clamps a bullet above maxSpeed on its first accelerating tick; accel 0 never clamps', () => {
    const w = world();
    park(w, 20, 190);
    w.debugFlags.godMode = true; // parked in the floor: no terrain death (M1-12)
    const f = fields(w);
    const fast = w.bullets.spawn(100, 60, 0, 6, 0);
    w.bullets.setMotion(fast, 0.25, 0, 0, 4);
    const coast = w.bullets.spawn(100, 80, 0, 6, 0);
    w.bullets.setMotion(coast, 0, 0, 0, 4);
    run(w, 1);
    expect([f.speed[fast], f.x[fast], f.speed[coast], f.x[coast]]).toEqual([4, 104, 6, 106]);
    expect(f.maxSpeed[w.bullets.spawn(0, 0, 0, 1, 0)]).toBe(MAX_BULLET_SPEED);
  });

  it('wraps negative angular velocity below 0 and keeps fractional headings', () => {
    const w = world();
    park(w, 20, 190);
    w.debugFlags.godMode = true; // parked in the floor: no terrain death (M1-12)
    const f = fields(w);
    const i = w.bullets.spawn(150, 100, 4, 1, BulletKind.NeedlePurple);
    w.bullets.setMotion(i, 0, -2.5, 0, 16);
    run(w, 2);
    expect(f.angle[i]).toBe(1023);
    run(w, 1);
    expect(f.angle[i]).toBe(1020.5);
    expect(f.frame[i]).toBe(0);
  });

  it('recomputes the velocity only when the speed or the heading changed', () => {
    const w = world();
    park(w, 20, 190);
    w.debugFlags.godMode = true; // parked in the floor: no terrain death (M1-12)
    const f = fields(w);
    const plain = w.bullets.spawn(150, 100, 0, 1, 0);
    f.vx[plain] = 0.5; // e.g. a pattern that set its own velocity
    run(w, 2);
    expect(f.x[plain]).toBe(151);
    const turning = w.bullets.spawn(150, 120, 0, 1, 0);
    w.bullets.setMotion(turning, 0, 1, 0, 16);
    f.vx[turning] = 0.5;
    run(w, 1);
    expect(f.vx[turning]).toBe(SIN_TABLE_Q16[257] / TRIG_SCALE);
  });
});

describe('core/bullets edge: culling', () => {
  it('culls exactly past view ± 16 px on all four sides while the camera scrolls both ways', () => {
    const w = world({ stage: null });
    w.debugFlags.godMode = true;
    w.camera.vx = 2;
    w.camera.vy = 1;
    const m = BULLET_CULL_MARGIN;
    // Resting bullets, placed relative to the view the update will see (the camera moves first
    // in the tick and the bullets ride it, so their view position is kept).
    const at = (sx: number, sy: number): number =>
      w.bullets.spawn(w.camera.x + sx, w.camera.y + sy, 0, 0, 0);
    const inside = [
      at(-m, 50),
      at(PLAYFIELD_W + m, 50),
      at(100, -m),
      at(100, PLAYFIELD_H + m),
      at(-m, -m),
      at(PLAYFIELD_W + m, PLAYFIELD_H + m),
    ];
    const f = fields(w);
    const tags = new Map(inside.map((i) => [f.x[i] * 1000 + f.y[i], i]));
    const outside = [
      at(-m - 0.001, 50),
      at(PLAYFIELD_W + m + 0.001, 50),
      at(100, -m - 0.001),
      at(100, PLAYFIELD_H + m + 0.001),
    ];
    expect(outside).toEqual([6, 7, 8, 9]);
    run(w, 1);
    expect(w.bullets.count).toBe(inside.length);
    for (let i = 0; i < w.bullets.count; i++) {
      expect(tags.has((f.x[i] - 2) * 1000 + (f.y[i] - 1))).toBe(true);
    }
    run(w, 20);
    expect(w.bullets.count).toBe(inside.length); // riding the camera: they never drift out
  });

  it('culls a moving bullet on the first tick it is past the margin', () => {
    const w = world({ stage: null });
    w.debugFlags.godMode = true;
    const right = w.camera.x + PLAYFIELD_W + BULLET_CULL_MARGIN;
    w.bullets.spawn(right - 2.5, 60, 0, 1, 0);
    const counts: number[] = [];
    for (let t = 0; t < 4; t++) {
      run(w, 1);
      counts.push(w.bullets.count);
    }
    expect(counts).toEqual([1, 1, 0, 0]); // right − 1.5, right − 0.5, right + 0.5 → culled
  });

  it('culls bullets with a non-finite position or velocity at once (they never hit)', () => {
    const w = world();
    park(w, 192, 100);
    const ship = w.players[0];
    w.bullets.spawn(Number.NaN, 100, 0, 1, 0);
    w.bullets.spawn(192, Number.NaN, 0, 1, 0);
    w.bullets.spawn(192, 100, 0, Number.NaN, 0);
    w.bullets.spawn(Infinity, 100, 0, 1, 0);
    const odd = w.bullets.spawn(150, 100, 0, 1, 0);
    w.bullets.setMotion(odd, Number.NaN, 0, 0, 16);
    run(w, 1);
    expect(w.bullets.count).toBe(0);
    expect(ship.hits).toBe(0);
    // Tested against the ships directly (e.g. spawned between the phases): still no hit.
    w.bullets.spawn(Number.NaN, Number.NaN, 0, 0, 0);
    w.bullets.collidePlayers();
    expect(ship.hits).toBe(0);
  });

  it('kills a bullet inside solid terrain even at rest; only DieOnTerrain bullets', () => {
    const w = world();
    const map = w.terrain!;
    const surface = findFloor(map, 200, 0, 400);
    expect(terrainSolidAt(map, 200, surface + 4)).toBe(true);
    w.bullets.spawn(200.5, surface + 4, 0, 0, 0);
    const passer = w.bullets.spawn(210.5, surface + 4, 0, 0, 0);
    w.bullets.setFlags(passer, BulletFlag.Cancelable);
    run(w, 1);
    expect(w.bullets.count).toBe(1);
    expect(fields(w).x[0]).toBe(210.5);
    // The one terrain lookup is the centre pixel: a bullet whose rim overlaps survives.
    w.bullets.spawn(220.5, surface - 0.5, 0, 0, 0);
    run(w, 1);
    expect(w.bullets.count).toBe(2);
  });

  it('never kills on terrain outside the map or without one', () => {
    const w = world();
    w.debugFlags.godMode = true;
    w.bullets.spawn(-10, PLAYFIELD_H - 2, 0, 0, 0); // left of the map, at floor height
    run(w, 3);
    expect(w.bullets.count).toBe(1);
    const open = world({ stage: null });
    open.debugFlags.godMode = true;
    open.bullets.spawn(200, PLAYFIELD_H - 2, 0, 0, 0);
    run(open, 3);
    expect(open.bullets.count).toBe(1);
  });

  it('keeps a removed bullet hidden in [0, count) until phase 8, then compacts with fields intact', () => {
    const w = world();
    park(w, 20, 190);
    w.debugFlags.godMode = true; // parked in the floor: no terrain death (M1-12)
    const f = fields(w);
    w.bullets.spawn(100, 60, 0, 0, 0); // 0: stays
    w.bullets.spawn(-40, 60, 0, 0, 0); // 1: culled
    w.bullets.spawn(120, 60, 0, 0, 0); // 2: stays
    w.bullets.spawn(-40, 70, 0, 0, 0); // 3: culled
    const last = w.bullets.spawn(140, 60, 512, 0.25, BulletKind.NeedlePurple); // 4: moves to 1
    w.bullets.setMotion(last, 0.01, 1, 0.1, 2);
    w.bullets.setChange(last, 50, 1, 7);
    w.bullets.setHoming(last, 2, 40);
    w.bullets.setFlags(last, BulletFlag.Cancelable | BulletFlag.Grazed);
    // Phase by phase: after the move the culled bullets are still in the pool, Dead and hidden.
    w.bullets.update();
    expect(w.bullets.count).toBe(5);
    expect([f.flags[1] & BulletFlag.Dead, f.draw[1] & SpriteFlag.Hidden]).not.toContain(0);
    expect(w.bullets.pool.pendingFreeCount).toBe(2);
    const moved = slot(w, last);
    w.bullets.pool.flush();
    expect(w.bullets.count).toBe(3);
    expect(slot(w, 1)).toEqual(moved);
    expect([f.x[0], f.x[2]]).toEqual([100, 120]);
  });

  it('lets a bullet spawned after a cancel in the same tick survive the flush', () => {
    const w = world();
    park(w, 20, 190);
    w.debugFlags.godMode = true; // parked in the floor: no terrain death (M1-12)
    for (let k = 0; k < 5; k++) w.bullets.spawn(100 + k * 10, 60, 0, 0, 0);
    expect(cancelAllBullets(w, CancelMode.Sparkle)).toBe(5);
    const fresh = w.bullets.spawn(250, 80, 256, 0.5, BulletKind.OvalRed);
    expect(fresh).toBe(5); // appended: removed slots are only freed in phase 8
    run(w, 1);
    expect(w.bullets.count).toBe(1);
    const f = fields(w);
    expect([f.x[0], f.y[0], f.kind[0], f.flags[0] & BulletFlag.Dead]).toEqual([
      250,
      80.5,
      BulletKind.OvalRed,
      0,
    ]);
  });

  it('keeps a full pool full for the rest of the tick after a cancel (frees in phase 8)', () => {
    const w = world();
    w.debugFlags.godMode = true;
    for (let k = 0; k < MAX_ENEMY_BULLETS; k++)
      w.bullets.spawn(100 + (k % 50), 60 + (k >> 4), 0, 0, 0);
    expect(cancelAllBullets(w, CancelMode.Sparkle)).toBe(MAX_ENEMY_BULLETS);
    expect(w.bullets.spawn(100, 100, 0, 0, 0)).toBe(-1);
    run(w, 1);
    expect(w.bullets.count).toBe(0);
    expect(w.bullets.spawn(100, 100, 0, 0, 0)).toBe(0);
  });
});

describe('core/bullets edge: players', () => {
  /**
   * A world with both ships alive.
   *
   * @returns The world.
   */
  function twoShips(): World {
    const w = world();
    const p2 = w.players[1];
    p2.active = true;
    p2.state = 'alive';
    p2.invulnTicks = 0;
    park(w, 100, 100);
    p2.x = 250;
    p2.y = 100;
    return w;
  }

  it('hits both ships with their own bullets in one tick', () => {
    const w = twoShips();
    w.bullets.spawn(100, 101, 0, 0, 0);
    w.bullets.spawn(250, 99, 0, 0, 0);
    w.bullets.spawn(200, 150, 0, 0, 0); // neither
    w.bullets.collidePlayers();
    expect([w.players[0].hits, w.players[1].hits]).toEqual([1, 1]);
    expect([w.players[0].hitTick, w.players[1].hitTick]).toEqual([w.tick, w.tick]);
    w.pools.flushAll();
    expect(w.bullets.count).toBe(1);
    // The next tick is the one the hits were recorded for: both ships die (M1-12), and the death
    // sequence cancels the bullet that hit neither.
    run(w, 1);
    expect([w.players[0].state, w.players[1].state, w.bullets.count]).toEqual([
      'dying',
      'dying',
      0,
    ]);
  });

  it('gives a bullet over both ships to the first one only (an accepted bullet is removed)', () => {
    const w = twoShips();
    w.players[1].x = 101;
    w.bullets.spawn(100.5, 100, 0, 0, 0);
    w.bullets.collidePlayers();
    expect([w.players[0].hits, w.players[1].hits]).toEqual([1, 0]);
    // With player 1 protected the same bullet reaches player 2.
    w.bullets.spawn(100.5, 100, 0, 0, 0);
    w.players[0].invulnTicks = 5;
    w.bullets.collidePlayers();
    expect([w.players[0].hits, w.players[1].hits]).toEqual([1, 1]);
  });

  it('skips inactive and non-alive ships', () => {
    const w = twoShips();
    w.players[1].active = false;
    w.bullets.spawn(250, 100, 0, 0, 0);
    w.players[0].state = 'dying';
    w.bullets.spawn(100, 100, 0, 0, 0);
    w.bullets.collidePlayers();
    expect([w.players[0].hits, w.players[1].hits]).toEqual([0, 0]);
    expect(w.bullets.count).toBe(2);
  });

  it('lets the first overlapping bullet decide: rejected → no bullet removed this tick', () => {
    const w = twoShips();
    w.players[1].active = false;
    w.bullets.spawn(100, 100, 0, 0, 0);
    w.bullets.spawn(100.5, 100.5, 0, 0, 0);
    w.players[0].invulnTicks = 1;
    w.bullets.collidePlayers();
    expect(w.players[0].hits).toBe(0);
    w.players[0].invulnTicks = 0;
    w.bullets.collidePlayers();
    w.bullets.collidePlayers();
    expect(w.players[0].hits).toBe(2); // one per call, first-come
    w.bullets.collidePlayers();
    expect(w.players[0].hits).toBe(2); // both removed
  });

  it('never hits with a bullet removed earlier in the tick', () => {
    const w = twoShips();
    w.bullets.spawn(100, 100, 0, 0, 0);
    cancelAllBullets(w, CancelMode.Sparkle);
    w.bullets.collidePlayers();
    expect(w.players[0].hits).toBe(0);
  });

  it('uses a closed circle test on the diagonal too (needle radius 1.5 + hurt radius 1.5)', () => {
    const w = twoShips();
    w.players[1].active = false;
    const reach = BULLET_KINDS[BulletKind.NeedlePink].radius + w.ship.hurtRadius;
    const d = reach / Math.SQRT2;
    w.bullets.spawn(100 + d - 1e-9, 100 + d - 1e-9, 0, 0, BulletKind.NeedlePink);
    w.bullets.collidePlayers();
    expect(w.players[0].hits).toBe(1);
    w.bullets.spawn(100 - d - 1e-6, 100 - d - 1e-6, 0, 0, BulletKind.NeedlePink);
    w.bullets.collidePlayers();
    expect(w.players[0].hits).toBe(1);
  });

  it('records a bullet hit and a laser hit on the same ship in one tick (cause: the laser)', () => {
    const w = twoShips();
    w.players[1].active = false;
    w.bullets.spawn(100, 100, 0, 0, 0);
    fireLaser(w, { slot: -1, x: 300, y: 100 }, 512, 300, 0, 0, 10, 6, 0);
    w.bullets.collidePlayers();
    expect(w.players[0].hits).toBe(2);
    expect(w.players[0].hitCause).toBe(PlayerHitCause.Laser);
  });
});

describe('core/bullets edge: lasers', () => {
  it('lives exactly telegraph + grow + active + fade ticks for every mix of empty phases', () => {
    for (let mask = 1; mask < 16; mask++) {
      const t = mask & 1 ? 3 : 0;
      const g = mask & 2 ? 2 : 0;
      const a = mask & 4 ? 4 : 0;
      const d = mask & 8 ? 1 : 0;
      const w = world();
      expect(fireLaser(w, { slot: -1, x: 380, y: 150 }, 512, 100, t, g, a, 6, d)).toBe(0);
      const f = laserFields(w);
      const expected: number[] = [];
      for (const [phase, ticks] of [
        [LaserPhase.Telegraph, t],
        [LaserPhase.Grow, g],
        [LaserPhase.Active, a],
        [LaserPhase.Fade, d],
      ]) {
        for (let k = 0; k < ticks; k++) expected.push(phase);
      }
      expect(f.phase[0], `first phase, mask ${mask}`).toBe(expected[0]);
      const seen: number[] = [];
      for (let k = 0; k < expected.length + 2; k++) {
        run(w, 1);
        seen.push(w.bullets.lasers.count === 0 ? -1 : f.phase[0]);
      }
      expect(seen, `mask ${mask}`).toEqual([...expected, -1, -1]);
    }
  });

  it('floors fractional timings and treats negative / NaN ones as 0', () => {
    const w = world();
    const at = { slot: -1, x: 380, y: 150 };
    fireLaser(w, at, 512, 100, 2.9, -3, Number.NaN, 6, 1.5);
    const f = laserFields(w);
    expect([f.telegraph[0], f.grow[0], f.active[0], f.fade[0]]).toEqual([2, 0, 0, 1]);
    expect(fireLaser(w, at, 512, 100, 0.9, -1, Number.NaN, 6, 0.99)).toBe(-1);
    expect(fireLaser(w, at, 512, 100, 1, 1, 1, Number.NaN, 1)).toBe(-1); // width
    expect(fireLaser(w, at, 512, -5, 1, 1, 1, 6, 1)).toBe(-1); // length
    expect(fireLaser(w, at, Infinity - Infinity, 100)).toBe(-1);
    expect(w.bullets.lasers.count).toBe(1);
  });

  it('uses the documented defaults (40 / 8 / 60 / 8 ticks, 6 px)', () => {
    const w = world();
    fireLaser(w, { slot: -1, x: 380, y: 150 }, 512, 100);
    const f = laserFields(w);
    expect([f.telegraph[0], f.grow[0], f.active[0], f.fade[0], f.width[0]]).toEqual([
      LASER_TELEGRAPH_TICKS,
      LASER_GROW_TICKS,
      LASER_ACTIVE_TICKS,
      LASER_FADE_TICKS,
      LASER_WIDTH,
    ]);
    expect([f.telegraph[0], f.grow[0], f.active[0], f.fade[0], f.width[0]]).toEqual([
      40, 8, 60, 8, 6,
    ]);
  });

  it('draws width w·k/(grow+1) growing and w·(fade+1−k)/(fade+1) fading, full when active', () => {
    const w = world();
    fireLaser(w, { slot: -1, x: 380, y: 150 }, 512, 100, 0, 5, 2, 12, 5);
    const view = w.bullets.laserView;
    expect(view.width[0]).toBe(12 / 6); // right after firing: the first grow tick's width
    const widths: number[] = [];
    for (let t = 0; t < 12; t++) {
      run(w, 1);
      widths.push(w.bullets.lasers.count === 0 ? -1 : view.width[0]);
    }
    expect(widths).toEqual([2, 4, 6, 8, 10, 12, 12, 10, 8, 6, 4, 2]);
  });

  it(`blinks the warning line ${LASER_BLINK_TICKS} ticks on, ${LASER_BLINK_TICKS} off, from the firing tick`, () => {
    const w = world();
    fireLaser(w, { slot: -1, x: 380, y: 150 }, 512, 100, 20, 1, 1, 6, 1);
    const view = w.bullets.laserView;
    expect(view.flags[0] & SpriteFlag.Hidden).toBe(0);
    const shown: number[] = [];
    for (let t = 0; t < 21; t++) {
      run(w, 1);
      shown.push((view.flags[0] & SpriteFlag.Hidden) === 0 ? 1 : 0);
    }
    const expected = [];
    for (let k = 1; k <= 20; k++)
      expected.push(Math.floor((k - 1) / LASER_BLINK_TICKS) % 2 === 0 ? 1 : 0);
    expect(shown).toEqual([...expected, 1]); // then the grow tick is drawn
    expect(view.width[0]).toBe(3);
  });

  it('hides every phase of a laser whose beam sprite the content lacks', () => {
    const w = world({ content: db([]) });
    fireLaser(w, { slot: -1, x: 380, y: 150 }, 512, 100, 3, 2, 2, 6, 2);
    const view = w.bullets.laserView;
    for (let t = 0; t < 9; t++) {
      expect(view.flags[0] & SpriteFlag.Hidden, `tick ${t}`).toBe(SpriteFlag.Hidden);
      expect(view.spriteId[0]).toBe(0);
      run(w, 1);
    }
  });

  it('has an exact capsule reach: both sides, both round caps, and on the diagonal', () => {
    const w = world();
    fireLaser(w, { slot: -1, x: 300, y: 100 }, 512, 200, 0, 0, 1000, 6, 0); // x 100 … 300
    const f = laserFields(w);
    expect([f.x[0], f.ex[0], f.y[0], f.ey[0], f.phase[0]]).toEqual([
      300,
      100,
      100,
      100,
      LaserPhase.Active,
    ]);
    const reach = 3 + w.ship.hurtRadius;
    const probe = (x: number, y: number): boolean => {
      const ship = w.players[0];
      const before = ship.hits;
      park(w, x, y);
      w.bullets.collidePlayers();
      return ship.hits > before;
    };
    expect(probe(200, 100 + reach)).toBe(true); // touching the side (closed test)
    expect(probe(200, 100 - reach)).toBe(true);
    expect(probe(200, 100 + reach + 0.001)).toBe(false);
    expect(probe(100 - reach, 100)).toBe(true); // the far cap
    expect(probe(100 - reach - 0.001, 100)).toBe(false);
    expect(probe(300 + reach, 100)).toBe(true); // the cap behind the origin
    expect(probe(300 + reach + 0.001, 100)).toBe(false);
    const d = reach / Math.SQRT2;
    expect(probe(100 - d + 0.001, 100 + d - 0.001)).toBe(true); // round corner
    expect(probe(100 - d - 0.001, 100 + d + 0.001)).toBe(false);
    expect(w.players[0].hitCause).toBe(PlayerHitCause.Laser);
  });

  it('hits along a diagonal laser and misses beside it', () => {
    const w = world();
    fireLaser(w, { slot: -1, x: 100, y: 50 }, 128, 150, 0, 0, 1000, 6, 0); // 45° down-right
    const ship = w.players[0];
    const along = SIN_TABLE_Q16[128] / TRIG_SCALE;
    park(w, 100 + 80 * along, 50 + 80 * along);
    w.bullets.collidePlayers();
    expect(ship.hits).toBe(1);
    park(w, 100 + 80 * along + 4, 50 + 80 * along - 4); // ≈ 5.66 px off the axis
    w.bullets.collidePlayers();
    expect(ship.hits).toBe(1);
  });

  it('never hits from a laser with a non-finite origin', () => {
    const w = world();
    park(w, 200, 100);
    fireLaser(w, { slot: -1, x: Number.NaN, y: 100 }, 512, 200, 0, 0, 1000, 6, 0);
    w.bullets.collidePlayers();
    run(w, 3);
    expect(w.players[0].hits).toBe(0);
  });

  it('aims AIM_AT_TARGET lasers once (quantised), rounds and wraps fixed angles', () => {
    const w = world();
    park(w, 100, 140);
    const f = laserFields(w);
    const at = { slot: -1, x: 300, y: 100 };
    fireLaser(w, at, AIM_AT_TARGET, 100, 50, 1, 1, 6, 1);
    fireLaser(w, at, -256, 100, 50, 1, 1, 6, 1);
    fireLaser(w, at, 100.6, 100, 50, 1, 1, 6, 1);
    fireLaser(w, at, 3 * 1024 + 7, 100, 50, 1, 1, 6, 1);
    const aim = w.bullets.aimFrom(origin(300, 100));
    expect(aim % 32).toBe(0);
    expect([f.angle[0], f.angle[1], f.angle[2], f.angle[3]]).toEqual([aim, 768, 101, 7]);
    park(w, 300, 190);
    w.debugFlags.godMode = true; // parked in the floor: no terrain death (M1-12)
    run(w, 5);
    expect(f.angle[0]).toBe(aim); // the aim is not tracked
    expect(f.ex[1]).toBeCloseTo(300, 9);
    expect(f.ey[1]).toBe(100 - 100); // 768 = straight up
  });

  it('fixed lasers ride the camera (origin and end); unknown sources make fixed lasers', () => {
    const w = world({ stage: null });
    w.camera.vx = 1.5;
    w.camera.vy = 0.5;
    const f = laserFields(w);
    for (const src of [-1, 999, 2.5, -7]) {
      fireLaser(
        w,
        { slot: src, x: w.camera.x + 300, y: w.camera.y + 60 },
        512,
        100,
        30,
        1,
        1,
        6,
        1,
      );
    }
    expect([f.src[0], f.src[1], f.src[2], f.src[3]]).toEqual([-1, -1, -1, -1]);
    run(w, 10);
    for (let i = 0; i < 4; i++) {
      expect([f.x[i] - w.camera.x, f.y[i] - w.camera.y]).toEqual([300, 60]);
      expect(f.ex[i] - w.camera.x).toBeCloseTo(200, 9);
    }
  });

  it('detach: a fading laser keeps fading, an active one without fade goes, others stay', () => {
    const w = world();
    const f = laserFields(w);
    const src = w.enemies.enemies[3];
    Object.assign(src, { x: 300, y: 60 });
    fireLaser(w, { slot: 3, x: 300, y: 60 }, 512, 100, 0, 0, 2, 6, 5); // → fade after 2
    fireLaser(w, { slot: 3, x: 300, y: 70 }, 512, 100, 0, 0, 50, 6, 0); // active, no fade
    fireLaser(w, { slot: 4, x: 300, y: 80 }, 512, 100, 0, 0, 50, 6, 0); // another source
    run(w, 3);
    expect([f.phase[0], f.phase[1], f.phase[2]]).toEqual([
      LaserPhase.Fade,
      LaserPhase.Active,
      LaserPhase.Active,
    ]);
    const fadeTicks = f.ticks[0];
    w.bullets.detachLasers(3);
    w.bullets.detachLasers(3); // twice: harmless
    expect([f.phase[0], f.ticks[0], f.src[0]]).toEqual([LaserPhase.Fade, fadeTicks, -1]);
    expect(f.flags[1] & BulletFlag.Dead).toBe(BulletFlag.Dead);
    expect(f.src[2]).toBe(4);
    run(w, 1);
    expect(w.bullets.lasers.count).toBe(2);
    expect([f.src[0], f.src[1]].sort()).toEqual([-1, 4]);
  });

  it('keeps the origin offset of an attached laser to its enemy', () => {
    const w = world();
    const f = laserFields(w);
    const src = w.enemies.enemies[7];
    Object.assign(src, { x: 200, y: 80 });
    fireLaser(w, { slot: 7, x: 200, y: 80 }, 0, 100, 30, 1, 1, 6, 1);
    const frame = new BulletOrigin();
    frame.x = 195;
    frame.y = 88;
    w.bullets.fireLaser(frame, 0, 100, 6, 30, 1, 1, 1, 7); // offset (−5, +8)
    src.x = 250;
    src.y = 40;
    run(w, 1);
    expect([f.x[0], f.y[0], f.x[1], f.y[1]]).toEqual([250, 40, 245, 48]);
    expect([f.ex[1], f.ey[1]]).toEqual([345, 48]);
  });
});

describe('core/bullets edge: cancel', () => {
  it('sparkles every bullet up to 64, beyond that ceil(n / ceil(n / 64)) evenly spread', () => {
    for (const n of [1, 63, 64, 65, 100, 128, 129, 300, 511, 512]) {
      const w = world();
      w.debugFlags.godMode = true;
      for (let k = 0; k < n; k++) w.bullets.spawn(40 + (k % 256), 20 + (k >> 8) * 50, 0, 0, 0);
      drain(w);
      expect(cancelAllBullets(w, CancelMode.Sparkle)).toBe(n);
      const sparkles = drain(w);
      const stride = n > CANCEL_SPARKLE_LIMIT ? Math.ceil(n / CANCEL_SPARKLE_LIMIT) : 1;
      expect(sparkles.length, `n = ${n}`).toBe(Math.ceil(n / stride));
      expect(sparkles.length).toBeLessThanOrEqual(CANCEL_SPARKLE_LIMIT);
      expect(sparkles[0]).toEqual({
        kind: SimEventKind.Particles,
        id: FX_CUES.BulletCancel,
        x: 40,
        y: 20,
        param: 1,
      });
      expect(sparkles.map((e) => e.x - 40 + ((e.y - 20) / 50) * 256)).toEqual(
        sparkles.map((_, k) => k * stride),
      );
    }
  });

  it('cancels nothing the second time in a tick, and nothing in an empty world', () => {
    const w = world();
    expect(cancelAllBullets(w, CancelMode.Sparkle)).toBe(0);
    expect(drain(w).filter((e) => e.kind === SimEventKind.Particles)).toEqual([]);
    w.bullets.spawn(100, 100, 0, 0, 0);
    expect(cancelAllBullets(w, CancelMode.Sparkle)).toBe(1);
    drain(w);
    expect(cancelAllBullets(w, CancelMode.Sparkle)).toBe(0);
    expect(drain(w)).toEqual([]);
  });

  it('hides cancelled bullets and lasers at once (the renderer draws the tick they vanish)', () => {
    const w = world();
    w.bullets.spawn(100, 100, 0, 0, 0);
    fireLaser(w, { slot: -1, x: 300, y: 100 }, 512, 100);
    cancelAllBullets(w, CancelMode.Sparkle);
    expect(w.bullets.batch.flags[0] & SpriteFlag.Hidden).toBe(SpriteFlag.Hidden);
    expect(w.bullets.laserView.flags[0] & SpriteFlag.Hidden).toBe(SpriteFlag.Hidden);
    expect([w.bullets.count, w.bullets.lasers.count]).toEqual([1, 1]); // until phase 8
  });

  it('spares non-cancelable bullets and a laser whose Cancelable bit is cleared', () => {
    const w = world();
    w.debugFlags.godMode = true;
    const keep = w.bullets.spawn(100, 100, 0, 0, 0);
    w.bullets.setFlags(keep, BulletFlag.DieOnTerrain | BulletFlag.Grazed);
    w.bullets.spawn(110, 100, 0, 0, 0);
    fireLaser(w, { slot: -1, x: 300, y: 100 }, 512, 100);
    fireLaser(w, { slot: -1, x: 300, y: 120 }, 512, 100);
    laserFields(w).flags[1] = 0;
    expect(cancelAllBullets(w, CancelMode.Sparkle)).toBe(1);
    run(w, 1);
    expect(w.bullets.count).toBe(1);
    expect(w.bullets.lasers.count).toBe(1);
    expect(laserFields(w).y[0]).toBe(120);
  });
});

describe('core/bullets edge: world integration', () => {
  it('a checkpoint restart empties both pools', () => {
    const w = world();
    w.debugFlags.godMode = true;
    for (let k = 0; k < 20; k++) w.bullets.spawn(100 + k, 60, 0, 0, 0);
    fireLaser(w, { slot: -1, x: 300, y: 100 }, 512, 100);
    run(w, 1);
    expect([w.bullets.count, w.bullets.lasers.count]).toEqual([20, 1]);
    w.stage!.restartAt(-1);
    expect([w.bullets.count, w.bullets.lasers.count]).toEqual([0, 0]);
    run(w, 1);
    expect(w.bullets.spawn(100, 60, 0, 0, 0)).toBe(0);
  });

  it('views the pools directly: the batch and laser view share the pool arrays', () => {
    const w = world();
    const f = fields(w);
    const lf = laserFields(w);
    const batch = w.bullets.batch;
    expect([batch.x, batch.y, batch.spriteId, batch.frame, batch.flags]).toEqual([
      f.x,
      f.y,
      f.sprite,
      f.frame,
      f.draw,
    ]);
    expect(batch.x).toBe(f.x);
    expect(batch.flags).toBe(f.draw);
    expect(batch.capacity).toBe(MAX_ENEMY_BULLETS);
    const view = w.bullets.laserView;
    expect(view.width).toBe(lf.drawWidth);
    expect(view.angle).toBe(lf.angle);
    expect(view.flags).toBe(lf.draw);
    expect(view.count).toBe(0);
    fireLaser(w, { slot: -1, x: 300, y: 100 }, 512, 100);
    w.bullets.spawn(1, 2, 0, 0, 0);
    expect([view.count, batch.count]).toEqual([1, 1]);
  });

  it('hashes a bullet field change and a laser phase difference', () => {
    const a = world();
    const b = world();
    a.bullets.spawn(100, 60, 0, 1, 0);
    b.bullets.spawn(100, 60, 0, 1, 0);
    expect(hashWorld(a)).toBe(hashWorld(b));
    fields(b).homing[0] = 1;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
    fields(b).homing[0] = 0;
    fireLaser(a, { slot: -1, x: 300, y: 100 }, 512, 100);
    fireLaser(b, { slot: -1, x: 300, y: 100 }, 512, 100);
    expect(hashWorld(a)).toBe(hashWorld(b));
    laserFields(b).phase[0] = LaserPhase.Grow;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('moves a bullet spawned between ticks in the next tick, and it hits in that tick', () => {
    const w = world();
    park(w, 104, 100);
    w.bullets.spawn(100, 100, 0, 2, 0);
    run(w, 1);
    // Phase 5 moved it to 102 (reach 3.5 from 104) and phase 6 took the hit.
    expect(w.players[0].hits).toBe(1);
    expect(w.bullets.count).toBe(0);
    // That hit killed the ship (hit-stop follows): a second world shows the between-ticks spawn.
    const v = world();
    v.debugFlags.godMode = true;
    v.bullets.spawn(90, 100, 0, 2, 0);
    run(v, 1);
    expect([fields(v).x[0], fields(v).age[0]]).toEqual([92, 1]);
  });
});
