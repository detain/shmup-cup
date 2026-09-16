/**
 * The bosses' **pull field** of plan M3-02 (shmup_feat.md §13 "[P2] suction boss (pulls ship toward
 * it — Choking Weed), grabber boss"): `BossScriptApi.pull` / `release` and the phase-2
 * `BossSystem.applyFields` that drags the living ships towards an open field's boss.
 *
 * Covered here: the linear falloff (`core/bullets` `VORTEX_FALLOFF`) and the clamp that never
 * carries a ship past the boss, the view margins the pulled ship is held inside, the ships the
 * field skips (not active, not alive, exactly on the boss), the states that switch it off (a boss
 * that is not fighting, a resting one), the `ticks` countdown that closes it by itself — and the
 * regression of review round 1: a slot never inherits the field of the boss that vacated it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOSS_BEHAVIOR_DEFS,
  createBossBehaviorRegistry,
  defineBossBehavior,
} from '../../src/behaviors/index.js';
import { BossState } from '../../src/bosses/index.js';
import { VORTEX_FALLOFF } from '../../src/bullets/index.js';
import { PLAYFIELD_H, PLAYFIELD_W, resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { SLEEP_FOREVER, type Script } from '../../src/patterns/index.js';
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
 * The shipped test boss with one phase of its own.
 *
 * @param phases - The phase list.
 * @returns The DB.
 */
function db(phases: unknown[]): ContentDb {
  const boss = shipped('enemies/test-boss.enemies.json');
  (boss.data as { enemies: { boss: { phases: unknown[] } }[] }).enemies[0].boss.phases = phases;
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('enemies/test-range.enemies.json'),
      boss,
      shipped('stages/test-boss.stage.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/** `test.pull` opens a field of its params; `test.idle` never opens one. */
const REGISTRY = createBossBehaviorRegistry([
  ...DEFAULT_BOSS_BEHAVIOR_DEFS,
  defineBossBehavior(
    'test.pull',
    { radius: 200, strength: 1, ticks: -1, release: 0 },
    function* pull(api, p): Script {
      api.pull(p.radius, p.strength, p.ticks);
      if (p.release >= 1) {
        yield p.release;
        api.release();
      }
      yield SLEEP_FOREVER;
    },
  ),
  defineBossBehavior('test.idle', {}, function* idle(): Script {
    yield SLEEP_FOREVER;
  }),
]);

/**
 * A world whose boss fights, with god mode so the contact damage of the pull never kills.
 *
 * @param phases - The boss phases.
 * @returns The world.
 */
function fighting(phases: unknown[]): World {
  const w = createWorld(resolveGameConfig({ stage: 'test-boss', seed: 5 }), db(phases), {
    bossBehaviors: REGISTRY,
  });
  w.debugFlags.godMode = true;
  const input = createInputSnapshot();
  for (let i = 0; i < 3000 && w.bosses.boss.state !== BossState.Fight; i++) {
    stepWorld(w, input);
    w.events.clear();
  }
  expect(w.bosses.boss.state).toBe(BossState.Fight);
  return w;
}

/** A phase that opens a field. */
const PULL = [{ script: 'test.pull', params: { radius: 200, strength: 1 } }];

describe('core/bosses — the pull field (M3-02)', () => {
  it('a script opens it and the phase-2 pass drags the ships in, by the linear falloff', () => {
    const w = fighting(PULL);
    const boss = w.bosses.boss;
    expect(boss.pullRadius).toBe(200);
    expect(boss.pullStrength).toBe(1);
    expect(boss.pullTicks).toBe(-1);
    const ship = w.players[0];
    ship.x = boss.x - 50;
    ship.y = boss.y;
    w.bosses.applyFields();
    const step = 1 * (1 - VORTEX_FALLOFF * (50 / 200));
    expect(ship.x - (boss.x - 50)).toBeCloseTo(step, 9);
    expect(ship.y).toBe(boss.y);
  });

  it('never carries a ship past the boss, and holds it inside the view', () => {
    const w = fighting([{ script: 'test.pull', params: { radius: 200, strength: 500 } }]);
    const boss = w.bosses.boss;
    const ship = w.players[0];
    ship.x = boss.x - 9;
    ship.y = boss.y - 12;
    w.bosses.applyFields();
    const margins = w.ship.margins;
    const maxX = w.camera.x + PLAYFIELD_W - margins.right;
    const minY = w.camera.y + margins.top;
    const maxY = w.camera.y + PLAYFIELD_H - margins.bottom;
    expect(ship.x).toBeLessThanOrEqual(maxX);
    expect(ship.x).toBeGreaterThanOrEqual(w.camera.x + margins.left);
    expect(ship.y).toBeGreaterThanOrEqual(minY);
    expect(ship.y).toBeLessThanOrEqual(maxY);
  });

  it('skips a ship that is out of reach, not alive, or exactly on the boss', () => {
    const w = fighting(PULL);
    const boss = w.bosses.boss;
    const ship = w.players[0];
    // Out of reach.
    ship.x = boss.x - 400;
    ship.y = boss.y;
    w.bosses.applyFields();
    expect(ship.x).toBe(boss.x - 400);
    // Exactly on the boss: no division by zero, no move.
    ship.x = boss.x;
    ship.y = boss.y;
    w.bosses.applyFields();
    expect([ship.x, ship.y]).toEqual([boss.x, boss.y]);
    // Not alive.
    ship.x = boss.x - 50;
    for (const state of ['dying', 'dead', 'entering'] as const) {
      ship.state = state;
      w.bosses.applyFields();
      expect(ship.x).toBe(boss.x - 50);
    }
    ship.state = 'alive';
    w.bosses.applyFields();
    expect(ship.x).toBeGreaterThan(boss.x - 50);
  });

  it('is off while the boss is not fighting or is resting between phases', () => {
    const w = fighting(PULL);
    const boss = w.bosses.boss;
    const ship = w.players[0];
    ship.x = boss.x - 50;
    ship.y = boss.y;
    boss.resting = true;
    w.bosses.applyFields();
    expect(ship.x).toBe(boss.x - 50);
    boss.resting = false;
    boss.state = BossState.Escape;
    w.bosses.applyFields();
    expect(ship.x).toBe(boss.x - 50);
    boss.state = BossState.Fight;
    w.bosses.applyFields();
    expect(ship.x).toBeGreaterThan(boss.x - 50);
  });

  it('a timed field counts down and closes itself on its last tick', () => {
    const w = fighting([{ script: 'test.pull', params: { radius: 200, strength: 1, ticks: 3 } }]);
    const boss = w.bosses.boss;
    expect(boss.pullTicks).toBe(3);
    w.bosses.applyFields();
    expect(boss.pullTicks).toBe(2);
    w.bosses.applyFields();
    expect(boss.pullTicks).toBe(1);
    w.bosses.applyFields();
    expect(boss.pullTicks).toBe(-1);
    expect(boss.pullRadius).toBe(0);
    expect(boss.pullStrength).toBe(0);
    // A closed field moves nothing.
    const ship = w.players[0];
    ship.x = boss.x - 50;
    w.bosses.applyFields();
    expect(ship.x).toBe(boss.x - 50);
  });

  it('`release` closes it, and a radius of zero or less never opens one', () => {
    const w = fighting([{ script: 'test.pull', params: { radius: 200, strength: 1, release: 2 } }]);
    const boss = w.bosses.boss;
    expect(boss.pullRadius).toBe(200);
    const input = createInputSnapshot();
    for (let i = 0; i < 3; i++) stepWorld(w, input);
    expect(boss.pullRadius).toBe(0);
    expect(boss.pullStrength).toBe(0);
    expect(boss.pullTicks).toBe(-1);

    const off = fighting([{ script: 'test.pull', params: { radius: 0, strength: -3 } }]);
    expect(off.bosses.boss.pullRadius).toBe(0);
    expect(off.bosses.boss.pullStrength).toBe(0);
  });

  it('the session clear closes every slot (review round 1)', () => {
    const w = fighting(PULL);
    const boss = w.bosses.boss;
    expect(boss.pullRadius).toBeGreaterThan(0);
    const stage = w.stage;
    expect(stage).not.toBeNull();
    stage?.restartAt(stage.checkpoint);
    for (const slot of w.bosses.slots) {
      expect(slot.pullRadius).toBe(0);
      expect(slot.pullStrength).toBe(0);
      expect(slot.pullTicks).toBe(-1);
    }
  });

  it('a fresh boss never inherits a field left on its slot (review round 1)', () => {
    // A boss that never calls `api.pull` — every M1/M2 boss and `boss.walker`.
    const w = fighting([{ script: 'test.idle' }]);
    const boss = w.bosses.boss;
    expect(boss.pullRadius).toBe(0);
    const stage = w.stage;
    expect(stage).not.toBeNull();
    stage?.restartAt(stage.checkpoint);
    // A suction boss died with its field open and left it in the slot.
    boss.pullRadius = 200;
    boss.pullStrength = 1.1;
    boss.pullTicks = -1;
    const input = createInputSnapshot();
    for (let i = 0; i < 3000 && boss.state !== BossState.Fight; i++) {
      stepWorld(w, input);
      w.events.clear();
    }
    expect(boss.state).toBe(BossState.Fight);
    expect(boss.pullRadius).toBe(0);
    expect(boss.pullStrength).toBe(0);
    expect(boss.pullTicks).toBe(-1);
    // And so the ships are left where they are.
    const ship = w.players[0];
    ship.x = boss.x - 50;
    ship.y = boss.y;
    w.bosses.applyFields();
    expect(ship.x).toBe(boss.x - 50);
  });
});
