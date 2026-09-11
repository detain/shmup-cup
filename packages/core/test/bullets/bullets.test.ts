/**
 * `core/bullets` inside a World (plan M1-09): spawning (kind table, sprites, directional frames),
 * the kinematics (acceleration clamped to min / max speed, angular velocity), the camera ride,
 * delayed / changing / homing bullets, aimed quantisation (32 directions, 16 by config), pool
 * exhaustion (dropped quietly), off-screen and terrain culling, bullets × players, lasers (phase
 * timing, hitbox only at full width, attachment and detachment, blink), cancel (cancelable only,
 * sparkle budget) and determinism of `spray` (the allocation guards are in
 * `bullets-alloc.test.ts`, a fresh worker: V8's type feedback from the many small worlds here
 * would skew the measurement).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AIM_AT_TARGET,
  BULLET_CULL_MARGIN,
  BULLET_KINDS,
  BULLET_SPRITES,
  BulletFlag,
  BulletKind,
  BulletOrigin,
  CANCEL_SPARKLE_LIMIT,
  CancelMode,
  LASER_SPRITE,
  LaserPhase,
  MAX_ENEMY_BULLETS,
  MAX_ENEMY_LASERS,
  NO_TARGET_ANGLE,
  UNCHANGED,
  cancelAllBullets,
  fireLaser,
  moduleInfo,
  spawnBullet,
} from '../../src/bullets/index.js';
import { findFloor, terrainSolidAt } from '../../src/collision/index.js';
import { PLAYFIELD_H, PLAYFIELD_W, resolveGameConfig } from '../../src/config/index.js';
import {
  EMPTY_CONTENT_DB,
  loadContent,
  type ContentDb,
  type ContentFile,
} from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { FX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { fireAimed, fireNWay, fireSpray } from '../../src/patterns/index.js';
import { PlayerHitCause } from '../../src/player/index.js';
import { LayerId, SpriteFlag } from '../../src/presentation/index.js';
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
 * Test content: the KESTREL, the shipped tileset and a static stage with a flat 32-px floor.
 *
 * @param extraSprites - Engine sprites to intern (default {@link ENGINE_SPRITES}).
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
 * A world on the test stage (or in free flight), stepped until the ship is alive and parked at
 * `(192, 100)` with god mode off.
 *
 * @param options - Config overrides and the content.
 * @returns The world.
 */
function world(
  options: {
    stage?: string | null;
    seed?: number;
    aimDirections?: number;
    content?: ContentDb;
  } = {},
): World {
  const w = createWorld(
    resolveGameConfig({
      stage: options.stage === undefined ? 't' : options.stage,
      seed: options.seed ?? 7,
      aimDirections: options.aimDirections ?? 32,
    }),
    options.content ?? DB,
  );
  run(w, 60);
  park(w, 192, 100);
  return w;
}

/**
 * Moves player 1 (no input keeps it still on a static camera).
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

/** The bullet pool's fields. */
const fields = (w: World) => w.bullets.pool.fields;

describe('core/bullets', () => {
  it('describes itself as implemented', () => {
    expect(moduleInfo.name).toBe('bullets');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('has 9 built-in kinds whose sprites (and the beam) are the engine sprites', () => {
    expect(BULLET_KINDS).toHaveLength(9);
    expect(BULLET_KINDS[BulletKind.NeedlePurple].sprite).toBe('bullets/needle-purple');
    expect(BULLET_SPRITES).toEqual([...BULLET_KINDS.map((k) => k.sprite), LASER_SPRITE]);
    expect(ENGINE_SPRITES).toEqual([
      ...BULLET_SPRITES,
      'options/orb',
      'items/capsule',
      'shields/force-field',
    ]);
    for (const kind of BULLET_KINDS) {
      expect(kind.flags).toBe(BulletFlag.DieOnTerrain | BulletFlag.Cancelable);
      expect(kind.frames).toBe(kind.sprite.includes('round') ? 1 : 8);
    }
  });
});

describe('core/bullets spawning', () => {
  it('spawns with the kind radius, resolved sprite, velocity from the table and default clamps', () => {
    const w = world();
    const i = spawnBullet(w, 100, 50, 256, 2, BulletKind.OvalRed);
    expect(i).toBe(0);
    const f = fields(w);
    expect([f.x[i], f.y[i], f.angle[i], f.speed[i]]).toEqual([100, 50, 256, 2]);
    expect(f.vx[i]).toBeCloseTo(0, 12);
    expect(f.vy[i]).toBe(2);
    expect(f.radius[i]).toBe(BULLET_KINDS[BulletKind.OvalRed].radius);
    expect(f.sprite[i]).toBe(DB.sprites.index.get('bullets/oval-red'));
    expect(f.draw[i]).toBe(0);
    expect(f.frame[i]).toBe(4); // 90° = frame 4 (22.5° steps)
    expect([f.minSpeed[i], f.maxSpeed[i], f.accel[i], f.angVel[i]]).toEqual([0, 16, 0, 0]);
    expect(w.bullets.count).toBe(1);
    expect(w.bullets.batch.count).toBe(1);
    expect(w.bullets.batch.layer).toBe(LayerId.EnemyBullets);
  });

  it('picks the directional frame from the heading (8 frames of 22.5°, point-symmetric art)', () => {
    const w = world();
    const frame = (angle: number): number => {
      const i = w.bullets.spawn(100, 50, angle, 1, BulletKind.NeedlePink);
      return fields(w).frame[i];
    };
    expect([frame(0), frame(31), frame(32), frame(64), frame(256), frame(512), frame(992)]).toEqual(
      [0, 0, 1, 1, 4, 0, 0],
    );
    const round = w.bullets.spawn(100, 50, 64, 1, BulletKind.RoundPink);
    expect(fields(w).frame[round]).toBe(0);
  });

  it('wraps angles and hides bullets whose sprites the content table lacks', () => {
    const w = world({ content: db([]) });
    const i = w.bullets.spawn(100, 50, -256, 1, BulletKind.RoundRed);
    expect(fields(w).angle[i]).toBe(768);
    expect(fields(w).draw[i]).toBe(SpriteFlag.Hidden);
    const empty = createWorld(resolveGameConfig({}), EMPTY_CONTENT_DB);
    expect(empty.bullets.spawn(10, 10, 0, 1, 0)).toBe(0);
    expect(empty.bullets.pool.fields.draw[0]).toBe(SpriteFlag.Hidden);
  });

  it('drops bad spawns quietly: unknown / fractional kinds, non-finite angles', () => {
    const w = world();
    expect(w.bullets.spawn(0, 0, 0, 1, 9)).toBe(-1);
    expect(w.bullets.spawn(0, 0, 0, 1, -1)).toBe(-1);
    expect(w.bullets.spawn(0, 0, 0, 1, 0.5)).toBe(-1);
    expect(w.bullets.spawn(0, 0, Number.NaN, 1, 0)).toBe(-1);
    expect(w.bullets.spawn(0, 0, -Infinity, 1, 0)).toBe(-1);
    expect(w.bullets.count).toBe(0);
  });

  it('drops spawns quietly once the 512-slot pool is exhausted', () => {
    const w = world();
    for (let k = 0; k < MAX_ENEMY_BULLETS; k++) {
      expect(w.bullets.spawn(150 + (k % 20), 60 + (k >> 5), k, 0, k % 9)).toBe(k);
    }
    expect(w.bullets.spawn(100, 100, 0, 0, 0)).toBe(-1);
    expect(fireNWay(w.bullets, origin(100, 100), 5, 32, 1, 0)).toBe(0);
    expect(w.bullets.count).toBe(MAX_ENEMY_BULLETS);
    w.debugFlags.godMode = true;
    run(w, 3);
    expect(w.bullets.count).toBe(MAX_ENEMY_BULLETS); // resting bullets stay
  });
});

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

describe('core/bullets kinematics', () => {
  it('accelerates up to maxSpeed, integrating position each tick', () => {
    const w = world();
    park(w, 20, 180);
    const i = w.bullets.spawn(100, 50, 0, 1, BulletKind.RoundPink);
    w.bullets.setMotion(i, 0.5, 0, 0, 2);
    const f = fields(w);
    const speeds: number[] = [];
    const xs: number[] = [];
    for (let t = 0; t < 4; t++) {
      run(w, 1);
      speeds.push(f.speed[0]);
      xs.push(f.x[0]);
    }
    expect(speeds).toEqual([1.5, 2, 2, 2]);
    expect(xs).toEqual([101.5, 103.5, 105.5, 107.5]);
  });

  it('decelerates down to minSpeed (and may clamp to a negative minimum = reverse)', () => {
    const w = world();
    park(w, 20, 180);
    const a = w.bullets.spawn(100, 50, 0, 2, BulletKind.RoundPink);
    w.bullets.setMotion(a, -0.5, 0, 0.5, 4);
    const b = w.bullets.spawn(200, 50, 0, 0.5, BulletKind.RoundPink);
    w.bullets.setMotion(b, -0.5, 0, -1, 4);
    const f = fields(w);
    const trace: number[][] = [];
    for (let t = 0; t < 4; t++) {
      run(w, 1);
      trace.push([f.speed[0], f.speed[1]]);
    }
    expect(trace).toEqual([
      [1.5, 0],
      [1, -0.5],
      [0.5, -1],
      [0.5, -1],
    ]);
    expect(f.x[1]).toBe(200 + 0 - 0.5 - 1 - 1);
  });

  it('turns by angVel per tick (wrapping), recomputing velocity and frame from the tables', () => {
    const w = world();
    park(w, 20, 180);
    const i = w.bullets.spawn(150, 100, 1000, 1, BulletKind.OvalPink);
    w.bullets.setMotion(i, 0, 16, 0, 16);
    run(w, 4);
    const f = fields(w);
    expect(f.angle[0]).toBe(40);
    expect(f.vx[0]).toBeCloseTo(Math.cos((40 * 2 * Math.PI) / 1024), 4);
    expect(f.vy[0]).toBeCloseTo(Math.sin((40 * 2 * Math.PI) / 1024), 4);
    expect(f.frame[0]).toBe(1);
  });

  it('orbits: constant speed + angVel traces a closed circle', () => {
    const w = world();
    park(w, 20, 180);
    w.bullets.setMotion(w.bullets.spawn(200, 100, 0, 1, 0), 0, 8, 0, 16);
    run(w, 128);
    expect(fields(w).x[0]).toBeCloseTo(200, 6);
    expect(fields(w).y[0]).toBeCloseTo(100, 6);
  });

  it('rides the camera: a resting bullet keeps its screen position while the view scrolls', () => {
    const w = world({ stage: null });
    w.camera.vx = 1.5;
    w.debugFlags.godMode = true;
    w.bullets.spawn(w.camera.x + 200, 80, 0, 0, 0);
    run(w, 10);
    expect(fields(w).x[0] - w.camera.x).toBe(200);
  });

  it('delays: the bullet rests `delay` ticks, then launches (re-aimed when asked)', () => {
    const w = world();
    park(w, 100, 150);
    const i = w.bullets.spawn(200, 50, 0, 2, BulletKind.RoundPink);
    w.bullets.setDelay(i, 3, true);
    const f = fields(w);
    const xs: number[] = [];
    for (let t = 0; t < 3; t++) {
      run(w, 1);
      xs.push(f.x[0]);
    }
    expect(xs).toEqual([200, 200, 200]);
    expect(f.age[0]).toBe(0);
    park(w, 200, 150); // straight below at launch
    run(w, 1);
    expect(f.angle[0]).toBe(256);
    expect([f.x[0], f.y[0], f.age[0]]).toEqual([200, 52, 1]);
  });

  it('changes speed and / or heading when its age reaches changeAt (NaN keeps, AIM re-aims)', () => {
    const w = world();
    park(w, 150, 190);
    const a = w.bullets.spawn(100, 40, 0, 1, 0);
    w.bullets.setChange(a, 3, 0.25, UNCHANGED);
    const b = w.bullets.spawn(150, 40, 0, 1, 0);
    w.bullets.setChange(b, 2, UNCHANGED, AIM_AT_TARGET);
    const f = fields(w);
    run(w, 2);
    expect([f.speed[0], f.angle[1]]).toEqual([1, 256]); // b re-aimed straight down at age 2
    run(w, 1);
    expect([f.speed[0], f.angle[0], f.speed[1]]).toEqual([0.25, 0, 1]);
    expect(f.x[0]).toBe(100 + 1 + 1 + 0.25);
  });

  it('homes by at most turnRate per tick for its lifetime, then flies straight', () => {
    const w = world();
    park(w, 100, 190);
    const i = w.bullets.spawn(100, 40, 0, 1, 0);
    w.bullets.setHoming(i, 8, 5);
    const f = fields(w);
    const angles: number[] = [];
    for (let t = 0; t < 7; t++) {
      run(w, 1);
      angles.push(f.angle[0]);
    }
    expect(angles).toEqual([8, 16, 24, 32, 40, 40, 40]);
    expect(f.homing[0]).toBe(0);
  });
});

describe('core/bullets aiming', () => {
  it('quantises aimed shots to 32 directions (the nearest step)', () => {
    const w = world();
    const o = origin(192, 100);
    for (let k = 0; k < 200; k++) {
      const a = (k * 2 * Math.PI) / 200;
      park(w, 192 + Math.cos(a) * 80, 100 + Math.sin(a) * 80);
      const angle = w.bullets.aimFrom(o);
      expect(angle % 32).toBe(0);
      const exact = ((a * 1024) / (2 * Math.PI)) % 1024;
      const error = Math.abs(((angle - exact + 1536) % 1024) - 512);
      expect(error).toBeLessThanOrEqual(16.5);
    }
  });

  it('quantises to config.aimDirections (16 → multiples of 64)', () => {
    const w = world({ aimDirections: 16 });
    park(w, 192 + 80, 100 + 30);
    expect(w.bullets.aimFrom(origin(192, 100))).toBe(64);
    const i = fireAimed(w.bullets, origin(192, 100), 1, 0);
    expect(fields(w).angle[i]).toBe(64);
  });

  it('aims at the nearest living player and straight left without one', () => {
    const w = world();
    park(w, 300, 100);
    w.players[1].active = true;
    w.players[1].state = 'alive';
    w.players[1].x = 100;
    w.players[1].y = 100;
    expect(w.bullets.aimFrom(origin(150, 100))).toBe(512);
    expect(w.bullets.aimFrom(origin(250, 100))).toBe(0);
    w.players[0].state = 'dead';
    w.players[1].state = 'dead';
    expect(w.bullets.aimFrom(origin(250, 100))).toBe(NO_TARGET_ANGLE);
    const i = w.bullets.spawn(10, 10, AIM_AT_TARGET, 1, 0);
    expect(fields(w).angle[i]).toBe(NO_TARGET_ANGLE);
  });
});

describe('core/bullets culling', () => {
  it('removes a bullet once it is more than 16 px outside the view (frees in phase 8)', () => {
    const w = world();
    const right = w.camera.x + PLAYFIELD_W + BULLET_CULL_MARGIN;
    w.bullets.spawn(right - 1, 60, 0, 1, 0);
    w.bullets.spawn(w.camera.x + 100, w.camera.y - BULLET_CULL_MARGIN + 1, 768, 1, 0);
    run(w, 1);
    expect(w.bullets.count).toBe(2); // exactly on the margin: still in
    run(w, 1);
    expect(w.bullets.count).toBe(0);
    expect(w.camera.y + PLAYFIELD_H).toBeGreaterThan(0);
  });

  it('removes a bullet on the first tick its centre pixel is solid terrain', () => {
    const w = world();
    park(w, 20, 20);
    const map = w.terrain!;
    const surface = findFloor(map, 200, 0, 400);
    expect(surface).toBeGreaterThan(100);
    const i = w.bullets.spawn(200.5, surface - 3.5, 256, 1, 0);
    const passer = w.bullets.spawn(210.5, surface - 3.5, 256, 1, 0);
    w.bullets.setFlags(passer, BulletFlag.Cancelable); // no DieOnTerrain
    expect(i).toBe(0);
    const alive: number[] = [];
    for (let t = 0; t < 5; t++) {
      run(w, 1);
      alive.push(w.bullets.count);
    }
    expect(terrainSolidAt(map, 200, surface - 1)).toBe(false);
    expect(terrainSolidAt(map, 200, surface)).toBe(true);
    // y: surface − 2.5, − 1.5, − 0.5, + 0.5 (solid → removed), …
    expect(alive).toEqual([2, 2, 2, 1, 1]);
    expect(fields(w).x[0]).toBe(210.5);
  });
});

describe('core/bullets vs players', () => {
  it('hits a ship whose hurt circle touches the bullet, removes that bullet, one hit per tick', () => {
    const w = world();
    const ship = w.players[0];
    const reach = w.ship.hurtRadius + BULLET_KINDS[0].radius;
    w.bullets.spawn(192 + reach, 100, 0, 0, 0); // touching (closed test)
    w.bullets.spawn(192 - 1, 100, 0, 0, 0);
    run(w, 1);
    expect([ship.hits, ship.hitCause]).toEqual([1, PlayerHitCause.Bullet]);
    expect(w.bullets.count).toBe(1);
    run(w, 1);
    expect(ship.hits).toBe(2);
    expect(w.bullets.count).toBe(0);
  });

  it('ignores bullets just out of reach, and passes through god mode / invulnerable ships', () => {
    const w = world();
    const ship = w.players[0];
    const reach = w.ship.hurtRadius + BULLET_KINDS[0].radius;
    w.bullets.spawn(192 + reach + 0.01, 100, 0, 0, 0);
    run(w, 1);
    expect(ship.hits).toBe(0);
    w.bullets.spawn(192, 100, 0, 0, 0);
    w.debugFlags.godMode = true;
    run(w, 1);
    expect([ship.hits, w.bullets.count]).toEqual([0, 2]);
  });
});

describe('core/bullets lasers', () => {
  it('runs telegraph → grow → active → fade with the given lengths, then removes the laser', () => {
    const w = world();
    park(w, 20, 20);
    const i = fireLaser(w, { slot: -1, x: 380, y: 150 }, 512, 300, 3, 2, 2, 6, 2);
    expect(i).toBe(0);
    const f = w.bullets.lasers.fields;
    const phases: number[] = [];
    for (let t = 0; t < 11; t++) {
      run(w, 1);
      phases.push(w.bullets.lasers.count === 0 ? -1 : f.phase[0]);
    }
    expect(phases).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3, -1, -1]);
  });

  it('has a hitbox only at full width (never while telegraphing, growing or fading)', () => {
    const w = world();
    const ship = w.players[0];
    park(w, 192, 100); // on the beam
    fireLaser(w, { slot: -1, x: 380, y: 100 }, 512, 300, 5, 3, 4, 6, 3);
    const hits: number[] = [];
    const phases: number[] = [];
    for (let t = 0; t < 16; t++) {
      run(w, 1);
      hits.push(ship.hits);
      phases.push(w.bullets.lasers.count === 0 ? -1 : w.bullets.lasers.fields.phase[0]);
    }
    const firstActive = phases.indexOf(LaserPhase.Active);
    expect(hits.slice(0, firstActive).every((h) => h === 0)).toBe(true);
    expect(hits[firstActive]).toBe(1);
    const activeTicks = phases.filter((p) => p === LaserPhase.Active).length;
    expect(activeTicks).toBe(4);
    expect(ship.hitCause).toBe(PlayerHitCause.Laser);
    expect(hits[hits.length - 1]).toBe(4);
  });

  it('draws a blinking warning line (width 0), then a growing, full and shrinking beam', () => {
    const w = world();
    park(w, 20, 20);
    fireLaser(w, { slot: -1, x: 300, y: 150 }, 512, 200, 10, 3, 2, 6, 3);
    const view = w.bullets.laserView;
    const trace: Array<[number, number]> = [];
    for (let t = 0; t < 18; t++) {
      run(w, 1);
      trace.push([view.width[0], view.flags[0] & SpriteFlag.Hidden]);
    }
    const hidden = SpriteFlag.Hidden;
    expect(trace.slice(0, 10)).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, hidden],
      [0, hidden],
      [0, hidden],
      [0, hidden],
      [0, 0],
      [0, 0],
    ]);
    expect(trace.slice(10, 18).map(([width]) => width)).toEqual([
      6 / 4,
      12 / 4,
      18 / 4,
      6,
      6,
      18 / 4,
      12 / 4,
      6 / 4,
    ]);
    expect([view.length[0], view.angle[0], view.spriteId[0]]).toEqual([
      200,
      512,
      DB.sprites.index.get(LASER_SPRITE),
    ]);
  });

  it('follows its source enemy; a removed source cancels a warning and fades an active beam', () => {
    const w = world();
    park(w, 20, 20);
    const src = w.enemies.enemies[5];
    Object.assign(src, { x: 300, y: 60 });
    fireLaser(w, { slot: 5, x: 290, y: 64 }, 512, 200, 4, 1, 50, 6, 5);
    fireLaser(w, { slot: 5, x: 300, y: 60 }, 512, 200, 40, 1, 50, 6, 5);
    const f = w.bullets.lasers.fields;
    src.x = 310;
    run(w, 1);
    expect([f.x[0], f.y[0], f.x[1]]).toEqual([300, 64, 310]);
    run(w, 5);
    expect([f.phase[0], f.phase[1]]).toEqual([LaserPhase.Active, LaserPhase.Telegraph]);
    w.bullets.detachLasers(5);
    expect([f.phase[0], f.src[0]]).toEqual([LaserPhase.Fade, -1]);
    run(w, 1);
    expect(w.bullets.lasers.count).toBe(1); // the warning was removed
    src.x = 400;
    run(w, 1);
    expect(f.x[0]).toBe(300); // detached: no longer follows
  });

  it('rejects empty lasers and drops lasers beyond the 16-slot pool', () => {
    const w = world();
    const at = { slot: -1, x: 100, y: 100 };
    expect(fireLaser(w, at, 0, 0, 0, 0, 0, 6, 0)).toBe(-1);
    expect(fireLaser(w, at, 0, 100, 1, 1, 1, 0)).toBe(-1);
    expect(fireLaser(w, at, 0, 0)).toBe(-1);
    expect(fireLaser(w, at, Number.NaN, 100)).toBe(-1);
    for (let k = 0; k < MAX_ENEMY_LASERS; k++) expect(fireLaser(w, at, 0, 100)).toBe(k);
    expect(fireLaser(w, at, 0, 100)).toBe(-1);
  });
});

describe('core/bullets cancel', () => {
  it('clears cancelable bullets and lasers only, sparkling at each bullet', () => {
    const w = world();
    park(w, 20, 20);
    for (let k = 0; k < 10; k++) w.bullets.spawn(100 + k * 10, 50, 0, 0, 0);
    for (const k of [2, 5, 7]) w.bullets.setFlags(k, BulletFlag.DieOnTerrain);
    fireLaser(w, { slot: -1, x: 300, y: 50 }, 512, 100);
    drain(w);
    expect(cancelAllBullets(w, CancelMode.Sparkle)).toBe(7);
    const sparkles = drain(w).filter((e) => e.kind === SimEventKind.Particles);
    expect(sparkles.map((e) => [e.id, e.x])).toEqual(
      [0, 1, 3, 4, 6, 8, 9].map((k) => [FX_CUES.BulletCancel, 100 + k * 10]),
    );
    run(w, 1);
    expect(w.bullets.count).toBe(3);
    expect([...fields(w).x.subarray(0, 3)].sort()).toEqual([120, 150, 170]);
    expect(w.bullets.lasers.count).toBe(0);
  });

  it('spreads at most CANCEL_SPARKLE_LIMIT sparkles over a big cancel', () => {
    const w = world();
    park(w, 20, 20);
    for (let k = 0; k < 400; k++) w.bullets.spawn(100 + (k % 200), 40 + (k >> 3), 0, 0, 0);
    drain(w);
    expect(cancelAllBullets(w, CancelMode.Sparkle)).toBe(400);
    const sparkles = drain(w).filter((e) => e.kind === SimEventKind.Particles);
    expect(sparkles.length).toBeLessThanOrEqual(CANCEL_SPARKLE_LIMIT);
    expect(sparkles.length).toBeGreaterThan(CANCEL_SPARKLE_LIMIT / 2);
  });
});

describe('core/bullets determinism', () => {
  it('sprays identically for equal seeds (gameplay RNG, two draws per bullet)', () => {
    const shoot = (seed: number): number[] => {
      const w = world({ seed });
      const before = w.rng.gameplay.callCount;
      expect(fireSpray(w.bullets, origin(300, 100), w.rng.gameplay, 12, 128, 0.5, 2, 0)).toBe(12);
      expect(w.rng.gameplay.callCount - before).toBe(24);
      const f = fields(w);
      return [...f.angle.subarray(0, 12), ...f.speed.subarray(0, 12)];
    };
    const a = shoot(11);
    expect(shoot(11)).toEqual(a);
    expect(shoot(12)).not.toEqual(a);
    const angles = a.slice(0, 12);
    for (const angle of angles) {
      const delta = ((angle - 512 + 1536) % 1024) - 512; // centred on the aim (left, 512)
      expect(Math.abs(delta)).toBeLessThanOrEqual(64);
    }
  });

  it('two worlds firing the same patterns hash equal after many ticks', () => {
    const make = (): World => {
      const w = world({ seed: 99 });
      w.debugFlags.godMode = true;
      return w;
    };
    const a = make();
    const b = make();
    const input = createInputSnapshot();
    const o = origin(300, 100);
    for (let t = 0; t < 600; t++) {
      if (t % 20 === 0) {
        for (const w of [a, b]) {
          fireSpray(w.bullets, o, w.rng.gameplay, 5, 200, 0.5, 1.5, t % 9);
          fireNWay(w.bullets, o, 3, 48, 1, 3);
        }
      }
      stepWorld(a, input);
      stepWorld(b, input);
    }
    expect(a.bullets.count).toBeGreaterThan(0);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});
