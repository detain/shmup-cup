/**
 * Enemy bullets end to end (plan M1-09): the shipped `test-range` timeline played by headless
 * games built from the real `content/` files with the engine's own sprites interned (the way the
 * shell loads them).
 *
 * - The roster fires as specified: turrets (floor and ceiling) aimed round pink bullets at 1.5
 *   px/tick snapped to 32 directions, walkers aimed 3-ways of red ovals 48 units apart, orbiters
 *   rings of 8 purple bullets; nothing else fires and no laser is ever fired by the roster.
 * - Invariants after every tick of the whole stage: at most 512 bullets, every bullet within the
 *   view ± 16 px, no terrain-dying bullet inside solid terrain, every bullet drawn with a sprite
 *   the content resolved.
 * - A ship that never moves is hit by the timeline's bullets (`PlayerHitCause.Bullet`).
 * - Difficulty reaches the bullets: Arcade's turret shots are `1.5 × rankScale(6)` fast.
 * - Two sessions fed the same wandering input keep equal bullet pools and `hashWorld`s.
 */
import {
  Action,
  BULLET_CULL_MARGIN,
  BULLET_SPEED_RANK_CURVE,
  BulletFlag,
  BulletKind,
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  MAX_ENEMY_BULLETS,
  PLAYFIELD_H,
  PLAYFIELD_W,
  PlayerHitCause,
  SpriteFlag,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  hashWorld,
  loadContent,
  rankScale,
  terrainSolidAt,
  type ContentDb,
  type DifficultyPreset,
  type Game,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

/**
 * The shipped content with the engine sprites, validated like the shell does.
 *
 * @returns The DB (asserted issue-free).
 */
function shipped(): ContentDb {
  const { db, issues } = loadContent(readContentFiles(), {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  return db;
}

const DB = shipped();

/**
 * A headless game on the test range.
 *
 * @param seed - Seed.
 * @param difficulty - Difficulty preset.
 * @returns The game.
 */
function game(seed = 21, difficulty: DifficultyPreset = 'normal'): Game {
  return createGame(createHeadlessPlatform(), { seed, stage: 'test-range', difficulty }, DB);
}

/** One shot: a bullet seen at age 1 (it moved for the first time this tick). */
interface Shot {
  /** Bullet kind. */
  readonly kind: number;
  /** Heading. */
  readonly angle: number;
  /** Speed. */
  readonly speed: number;
  /** Tick it moved first. */
  readonly tick: number;
}

/**
 * Plays the stage to the end, recording every shot and calling a hook after each tick.
 *
 * @param g - The game.
 * @param after - Called after each tick.
 * @returns The shots.
 */
function playThrough(g: Game, after: () => void = () => {}): Shot[] {
  const w = g.world;
  const f = w.bullets.pool.fields;
  const shots: Shot[] = [];
  for (let t = 0; t < 20000 && w.status === 'playing'; t++) {
    g.step();
    for (let i = 0; i < w.bullets.count; i++) {
      if (f.age[i] === 1 && f.delay[i] === 0) {
        shots.push({ kind: f.kind[i], angle: f.angle[i], speed: f.speed[i], tick: w.tick - 1 });
      }
    }
    after();
    w.events.clear();
  }
  expect(w.status).toBe('stageClear');
  return shots;
}

describe('integration: enemy bullets on the test range', () => {
  it('fires the roster patterns and keeps every bullet in bounds, off terrain and drawn', () => {
    const g = game();
    const w = g.world;
    w.debugFlags.godMode = true;
    const map = w.terrain;
    if (map === null) throw new Error('no terrain');
    const f = w.bullets.pool.fields;
    let peak = 0;
    let lasers = 0;
    const shots = playThrough(g, () => {
      const n = w.bullets.count;
      peak = Math.max(peak, n);
      expect(n).toBeLessThanOrEqual(MAX_ENEMY_BULLETS);
      lasers = Math.max(lasers, w.bullets.lasers.count);
      const left = w.camera.x - BULLET_CULL_MARGIN;
      const top = w.camera.y - BULLET_CULL_MARGIN;
      for (let i = 0; i < n; i++) {
        const x = f.x[i];
        const y = f.y[i];
        expect(x).toBeGreaterThanOrEqual(left);
        expect(x).toBeLessThanOrEqual(left + PLAYFIELD_W + 2 * BULLET_CULL_MARGIN);
        expect(y).toBeGreaterThanOrEqual(top);
        expect(y).toBeLessThanOrEqual(top + PLAYFIELD_H + 2 * BULLET_CULL_MARGIN);
        if ((f.flags[i] & BulletFlag.DieOnTerrain) !== 0) {
          expect(terrainSolidAt(map, Math.floor(x), Math.floor(y))).toBe(false);
        }
        expect(f.draw[i] & SpriteFlag.Hidden).toBe(0);
        expect(DB.sprites.names[f.sprite[i]]).toMatch(/^bullets\//);
      }
    });
    expect(lasers).toBe(0);
    expect(peak).toBeGreaterThan(8);
    const kinds = new Set(shots.map((s) => s.kind));
    expect([...kinds].sort()).toEqual(
      [BulletKind.RoundPink, BulletKind.OvalRed, BulletKind.RoundPurple].sort(),
    );
    const pink = shots.filter((s) => s.kind === BulletKind.RoundPink);
    expect(pink.length).toBeGreaterThan(4);
    expect(pink.every((s) => s.speed === 1.5 && s.angle % 32 === 0)).toBe(true);
    // Walkers: 3-ways on one tick, 48 units apart, the middle one on a 32-step aim.
    const walkerTicks = [
      ...new Set(shots.filter((s) => s.kind === BulletKind.OvalRed).map((s) => s.tick)),
    ];
    expect(walkerTicks.length).toBeGreaterThan(0);
    let volleys = 0;
    for (const tick of walkerTicks) {
      const volley = shots.filter((s) => s.kind === BulletKind.OvalRed && s.tick === tick);
      expect(volley.length % 3).toBe(0);
      expect(volley.every((s) => s.speed === 1.25)).toBe(true);
      if (volley.length !== 3) continue; // two walkers stopping on the same tick
      // The middle bullet is on the aim, its neighbours 48 units either side (mod one turn).
      const angles = volley.map((s) => s.angle);
      const mid = angles.find((m) =>
        [(m + 1024 - 48) % 1024, (m + 48) % 1024].every((n) => angles.includes(n)),
      );
      expect(mid, `volley ${angles.join(', ')}`).toBeDefined();
      expect((mid ?? 1) % 32).toBe(0);
      volleys++;
    }
    expect(volleys).toBeGreaterThan(0);
    // Orbiters: rings of 8, evenly spaced.
    const ringTicks = [
      ...new Set(shots.filter((s) => s.kind === BulletKind.RoundPurple).map((s) => s.tick)),
    ];
    expect(ringTicks.length).toBeGreaterThanOrEqual(2);
    for (const tick of ringTicks) {
      const ring = shots
        .filter((s) => s.kind === BulletKind.RoundPurple && s.tick === tick)
        .map((s) => s.angle)
        .sort((a, b) => a - b);
      expect(ring.length % 8).toBe(0);
      if (ring.length === 8) {
        for (let k = 1; k < 8; k++) expect(ring[k] - ring[k - 1]).toBe(128);
      }
    }
  });

  it('hits a ship that never moves (bullet hits recorded, no laser hits)', () => {
    const g = game(5);
    const ship = g.world.players[0];
    let bullet = 0;
    let other = 0;
    let lastHits = 0;
    playThrough(g, () => {
      if (ship.hits !== lastHits) {
        if (ship.hitCause === PlayerHitCause.Bullet) bullet += ship.hits - lastHits;
        else if (ship.hitCause === PlayerHitCause.Laser) other++;
        lastHits = ship.hits;
      }
    });
    expect(bullet).toBeGreaterThan(0);
    expect(other).toBe(0);
  });

  it('speeds bullets up with the difficulty (Arcade: 1.5 × rankScale(6))', () => {
    const g = game(21, 'arcade');
    expect(g.world.rank).toBe(6);
    g.world.debugFlags.godMode = true;
    const shots = playThrough(g);
    const pink = shots.filter((s) => s.kind === BulletKind.RoundPink);
    expect(pink.length).toBeGreaterThan(0);
    const expected = 1.5 * rankScale(6, BULLET_SPEED_RANK_CURVE);
    expect(expected).toBeGreaterThan(1.5);
    for (const shot of pink) expect(shot.speed).toBe(expected);
  });

  it('keeps two sessions fed the same wandering input in lockstep, bullets included', () => {
    const pa = createHeadlessPlatform();
    const pb = createHeadlessPlatform();
    const a = createGame(pa, { seed: 33, stage: 'test-range' }, DB);
    const b = createGame(pb, { seed: 33, stage: 'test-range' }, DB);
    const masks = [Action.Up, Action.Right | Action.Down, Action.Down, Action.Left, 0];
    let checks = 0;
    let fired = 0;
    for (let t = 0; t < 20000 && a.world.status === 'playing'; t++) {
      const held = masks[(t >> 4) % masks.length];
      commitPlayerInput(pa.snapshot.players[0], held);
      commitPlayerInput(pb.snapshot.players[0], held);
      a.step();
      b.step();
      a.world.events.clear();
      b.world.events.clear();
      fired = Math.max(fired, a.world.bullets.count);
      if (t % 200 === 0) {
        const n = a.world.bullets.count;
        expect(b.world.bullets.count).toBe(n);
        expect(Array.from(b.world.bullets.pool.fields.x.subarray(0, n))).toEqual(
          Array.from(a.world.bullets.pool.fields.x.subarray(0, n)),
        );
        expect(hashWorld(a.world), `tick ${t}`).toBe(hashWorld(b.world));
        checks++;
      }
    }
    expect(checks).toBeGreaterThan(15);
    expect(fired).toBeGreaterThan(0);
    expect(a.world.players[0].hits).toBe(b.world.players[0].hits);
    expect(hashWorld(a.world)).toBe(hashWorld(b.world));
  });
});
