/**
 * `core/blackhole` at its edges (plan M3-02), beside the happy paths of `blackhole.test.ts`:
 *
 * - the slots' bookkeeping — a bad player index, a ship that is not in play, the free-slot search,
 *   what `clear()` resets;
 * - `update()`: the vortex rides the camera as well as drifting forward, and hands whole-pixel
 *   centres to the pull calls;
 * - `resolve()`: the burst's bolt cadence, the enemies its lightning destroys (the
 *   `megaCrashImmune` ones survive), the boss parts it damages (a destroyed or non-target part is
 *   skipped) and the tick the vortex closes on;
 * - `sync()`: the swirl's animation frames, the discharge frame and a session without the sprite;
 * - a World with the option off never steps the system at all.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BLACK_HOLE_BOLT_DAMAGE,
  BLACK_HOLE_BOLT_INTERVAL,
  BLACK_HOLE_BURST_TICKS,
  BLACK_HOLE_DRIFT,
  BLACK_HOLE_FRAMES,
  BLACK_HOLE_FRAME_TICKS,
  BLACK_HOLE_PULL_TICKS,
  BLACK_HOLE_RADIUS,
  BLACK_HOLE_SPRITE,
  BLACK_HOLE_THROW_X,
  MAX_BLACK_HOLES,
  createBlackHoleSystem,
} from '../../src/blackhole/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyState, type Enemy } from '../../src/enemies/index.js';
import { FX_CUES, SimEventKind } from '../../src/events/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { BossState } from '../../src/bosses/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';
import { aliveWorld, directDb, run } from '../helpers/direct.js';

const db = directDb();

/** A Direct-mode world on the still stage with the black-hole bomb on. */
const bombWorld = (extra = {}): World => aliveWorld(db, { blackHole: true, ...extra });

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
 * The boss range's content plus an enemy the lightning cannot touch.
 *
 * @returns The DB.
 */
function bossDb(): ContentDb {
  const enemies = shipped('enemies/test-range.enemies.json');
  const data = enemies.data as { enemies: Record<string, unknown>[] };
  data.enemies.push({
    id: 'anchor',
    hp: 4,
    score: 10,
    hurtbox: { hw: 4, hh: 4 },
    script: 'drifter.sine',
    sprite: 'enemies/drifter',
    drop: null,
    megaCrashImmune: true,
  });
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      enemies,
      shipped('enemies/test-boss.enemies.json'),
      shipped('stages/test-boss.stage.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

const BOSS_DB = bossDb();

/**
 * A world on the boss range whose boss fights, with a bomb in player 1's hold.
 *
 * @returns The world.
 */
function bossWorld(): World {
  const w = createWorld(resolveGameConfig({ stage: 'test-boss', seed: 5 }), BOSS_DB);
  w.debugFlags.godMode = true;
  const input = createInputSnapshot();
  for (let i = 0; i < 3000 && w.bosses.boss.state !== BossState.Fight; i++) {
    stepWorld(w, input);
    w.events.clear();
  }
  expect(w.bosses.boss.state).toBe(BossState.Fight);
  w.players[0].bombs = 1;
  return w;
}

/**
 * Spawns an enemy.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - World x.
 * @param y - World y.
 * @returns The enemy.
 */
function put(w: World, id: string, x: number, y: number): Enemy {
  const index = w.content.enemyIndex.get(id);
  expect(index).toBeGreaterThanOrEqual(0);
  const e = w.enemies.spawn(index ?? -1, x, y);
  expect(e).not.toBeNull();
  return e as Enemy;
}

describe('core/blackhole — the slots (M3-02)', () => {
  it('refuses a fractional or out-of-range player for the stock and the throw', () => {
    const w = bombWorld();
    const holes = w.blackholes;
    for (const bad of [-1, 0.5, 2, 99, Number.NaN]) {
      expect(holes.addStock(bad)).toBe(false);
      expect(holes.fire(bad)).toBe(false);
    }
    expect(holes.count).toBe(0);
  });

  it('refuses a dying ship but not a merely invulnerable one', () => {
    const w = bombWorld();
    const ship = w.players[0];
    ship.bombs = 2;
    ship.state = 'dying';
    expect(w.blackholes.fire(0)).toBe(false);
    expect(ship.bombs).toBe(2);
    ship.state = 'alive';
    ship.invulnTicks = 120;
    expect(w.blackholes.fire(0)).toBe(true);
    expect(ship.bombs).toBe(1);
  });

  it('hands out both slots and takes them back on `clear`', () => {
    const w = bombWorld();
    const holes = w.blackholes;
    w.players[0].bombs = MAX_BLACK_HOLES + 1;
    for (let i = 0; i < MAX_BLACK_HOLES; i++) expect(holes.fire(0)).toBe(true);
    expect(holes.count).toBe(MAX_BLACK_HOLES);
    expect(holes.fire(0)).toBe(false);
    holes.holes[0].age = 40;
    holes.holes[0].bolt = 3;
    holes.sync();
    expect(holes.batch.count).toBe(MAX_BLACK_HOLES);
    holes.clear();
    expect(holes.count).toBe(0);
    expect(holes.batch.count).toBe(0);
    for (const hole of holes.holes) {
      expect(hole.active).toBe(false);
      expect(hole.owner).toBe(-1);
      expect(hole.age).toBe(0);
      expect(hole.bolt).toBe(0);
    }
    // A cleared slot can be thrown again at once.
    expect(holes.fire(0)).toBe(true);
  });

  it('opens the vortex ahead of the ship and announces it', () => {
    const w = bombWorld();
    const ship = w.players[0];
    w.events.clear();
    expect(w.blackholes.fire(0)).toBe(true);
    const hole = w.blackholes.holes[0];
    expect(hole.x).toBe(ship.x + BLACK_HOLE_THROW_X);
    expect(hole.y).toBe(ship.y);
    expect(hole.age).toBe(0);
    expect(hole.bolt).toBe(0);
    let sfx = 0;
    let fx = 0;
    w.events.drain((e) => {
      if (e.kind === SimEventKind.Sfx) sfx++;
      if (e.kind === SimEventKind.Particles && e.id === FX_CUES.BlackHole) {
        fx++;
        expect(e.x % 1).toBe(0);
        expect(e.y % 1).toBe(0);
      }
    });
    expect(sfx).toBe(1);
    expect(fx).toBe(1);
  });
});

describe('core/blackhole — the vortex rides the camera (M3-02)', () => {
  it('drifts forward and follows the camera on both axes', () => {
    const w = bombWorld();
    const holes = w.blackholes;
    expect(holes.fire(0)).toBe(true);
    const hole = holes.holes[0];
    const x = hole.x;
    const y = hole.y;
    w.camera.dx = 2;
    w.camera.dy = -1;
    holes.update();
    expect(hole.x).toBeCloseTo(x + 2 + BLACK_HOLE_DRIFT, 9);
    expect(hole.y).toBeCloseTo(y - 1, 9);
    expect(hole.age).toBe(1);
  });

  it('leaves a closed slot where it is', () => {
    const w = bombWorld();
    const holes = w.blackholes;
    const hole = holes.holes[1];
    hole.x = 5;
    hole.y = 6;
    w.camera.dx = 9;
    holes.update();
    expect([hole.x, hole.y, hole.age]).toEqual([5, 6, 0]);
  });
});

describe('core/blackhole — the burst (M3-02)', () => {
  it('strikes on the first tick past the pull and then every interval', () => {
    const w = bombWorld();
    const holes = w.blackholes;
    expect(holes.fire(0)).toBe(true);
    const hole = holes.holes[0];
    hole.age = BLACK_HOLE_PULL_TICKS;
    // Still pulling: the last tick of the pull phase does not strike.
    holes.resolve();
    expect(hole.bolt).toBe(0);
    const strikes: number[] = [];
    for (let i = 1; i <= BLACK_HOLE_BURST_TICKS; i++) {
      hole.age = BLACK_HOLE_PULL_TICKS + i;
      const before = hole.bolt;
      holes.resolve();
      if (before === 0) strikes.push(i);
    }
    expect(strikes[0]).toBe(1);
    for (let i = 1; i < strikes.length; i++) {
      expect(strikes[i] - strikes[i - 1]).toBe(BLACK_HOLE_BOLT_INTERVAL);
    }
    // The last tick of the burst closes it.
    expect(hole.active).toBe(false);
    expect(hole.owner).toBe(-1);
    expect(holes.count).toBe(0);
  });

  it('destroys the enemies in reach, spares the immune ones and damages the boss parts', () => {
    const w = bossWorld();
    const holes = w.blackholes;
    const boss = w.bosses.boss;
    expect(holes.fire(0)).toBe(true);
    const hole = holes.holes[0];
    const part = boss.parts.find(
      (p) => p.active && !p.destroyed && p.target && !w.bosses.isArmoured(p.global),
    );
    expect(part).toBeDefined();
    hole.x = part?.x ?? 0;
    hole.y = part?.y ?? 0;
    const hp = part?.hp ?? 0;
    const doomed = put(w, 'drifter', hole.x + 10, hole.y + 10);
    const anchor = put(w, 'anchor', hole.x - 10, hole.y);
    const far = put(w, 'drifter', hole.x + BLACK_HOLE_RADIUS + 40, hole.y);
    hole.age = BLACK_HOLE_PULL_TICKS + 1;
    w.events.clear();
    holes.resolve();
    expect(doomed.state).not.toBe(EnemyState.Live);
    expect(anchor.state).toBe(EnemyState.Live);
    expect(far.state).toBe(EnemyState.Live);
    expect(part?.hp).toBe(hp - BLACK_HOLE_BOLT_DAMAGE);
    let fx = 0;
    w.events.drain((e) => {
      if (e.kind === SimEventKind.Particles && e.id === FX_CUES.BlackHole) fx++;
    });
    expect(fx).toBe(1);
  });

  it('skips a destroyed boss part and one that is out of reach', () => {
    const w = bossWorld();
    const holes = w.blackholes;
    const boss = w.bosses.boss;
    expect(holes.fire(0)).toBe(true);
    const hole = holes.holes[0];
    const targets = boss.parts.filter(
      (p) => p.active && !p.destroyed && p.target && !w.bosses.isArmoured(p.global),
    );
    expect(targets.length).toBeGreaterThan(0);
    const part = targets[0];
    w.bosses.damagePart(part.global, 9999, 0);
    expect(part.destroyed).toBe(true);
    const hpBefore = targets.map((p) => p.hp);
    // Far from every part: nothing takes a bolt.
    hole.x = boss.x + 4000;
    hole.y = boss.y;
    hole.age = BLACK_HOLE_PULL_TICKS + 1;
    holes.resolve();
    expect(targets.map((p) => p.hp)).toEqual(hpBefore);
  });
});

describe('core/blackhole — the sprite batch (M3-02)', () => {
  it('cycles the swirl frames while it pulls and holds the discharge frame', () => {
    const w = bombWorld();
    const holes = w.blackholes;
    expect(holes.fire(0)).toBe(true);
    const hole = holes.holes[0];
    const frames = holes.batch.frame;
    for (const [age, frame] of [
      [0, 0],
      [BLACK_HOLE_FRAME_TICKS, 1],
      [BLACK_HOLE_FRAME_TICKS * 2, 2],
      [BLACK_HOLE_FRAME_TICKS * 3, 0],
      [BLACK_HOLE_PULL_TICKS, ((BLACK_HOLE_PULL_TICKS / BLACK_HOLE_FRAME_TICKS) | 0) % 3],
      [BLACK_HOLE_PULL_TICKS + 1, BLACK_HOLE_FRAMES - 1],
    ]) {
      hole.age = age;
      holes.sync();
      expect(holes.batch.count).toBe(1);
      expect(frames[0]).toBe(frame);
    }
  });

  it('draws nothing when the content has no vortex sprite', () => {
    const w = bombWorld();
    const holes = createBlackHoleSystem(w, -1);
    w.players[0].bombs = 1;
    expect(holes.fire(0)).toBe(true);
    holes.sync();
    expect(holes.batch.count).toBe(0);
    expect(holes.count).toBe(1);
    // The shipped content does have it.
    expect(db.sprites.index.get(BLACK_HOLE_SPRITE)).toBeGreaterThanOrEqual(0);
  });
});

describe('core/blackhole — a World with the option off (M3-02)', () => {
  it('keeps the system idle and its batch out of the view', () => {
    const w = aliveWorld(db);
    const holes = w.blackholes;
    expect(holes.enabled).toBe(false);
    expect(w.view.batches).not.toContain(holes.batch);
    // A Special press steers the Options instead of throwing anything.
    const input = createInputSnapshot();
    w.players[0].bombs = 3;
    run(w, input, 0x40 /* Action.Special */, 4);
    expect(holes.count).toBe(0);
    // Even a hand-thrown vortex is never stepped by the tick pipeline.
    expect(holes.fire(0)).toBe(true);
    const hole = holes.holes[0];
    const age = hole.age;
    run(w, input, 0, 10);
    expect(hole.age).toBe(age);
    holes.sync();
    expect(holes.batch.count).toBe(1);
  });
});
