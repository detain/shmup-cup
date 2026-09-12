/**
 * The M1 boss roster (`core/behaviors`, plan M1-13) driving the shipped test boss
 * (`content/enemies/test-boss.enemies.json`): `boss.hover` tracks the player's height, fires aimed
 * spreads from the gun parts only (not from destroyed ones) and opens / closes the `whenOpen`
 * parts; `boss.lanes` fires unattached lane lasers from the guns in turn; the behaviour checks of
 * `checkEnemyBehaviors` for boss phases.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOSS_BEHAVIOR_IDS,
  DEFAULT_BOSS_BEHAVIORS,
  DEFAULT_BOSS_BEHAVIOR_DEFS,
  checkEnemyBehaviors,
  createBossBehaviorRegistry,
} from '../../src/behaviors/index.js';
import { BossState } from '../../src/bosses/index.js';
import { LaserPhase } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
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
 * The shipped test boss with its phases replaced.
 *
 * @param phases - The phase list.
 * @returns The DB (the boss stage, its enemies, the KESTREL).
 */
function db(phases?: unknown[]): ContentDb {
  const boss = shipped('enemies/test-boss.enemies.json');
  if (phases !== undefined) {
    const data = boss.data as { enemies: { boss: { phases: unknown[] } }[] };
    data.enemies[0].boss.phases = phases;
  }
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

/**
 * A world on the boss range whose boss fights (events drained, god mode, no weapons).
 *
 * @param content - The DB.
 * @returns The world.
 */
function fighting(content: ContentDb): World {
  const w = createWorld(resolveGameConfig({ stage: 'test-boss', seed: 5 }), content);
  w.debugFlags.godMode = true;
  const input = createInputSnapshot();
  for (let i = 0; i < 3000 && w.bosses.boss.state !== BossState.Fight; i++) {
    stepWorld(w, input);
    w.events.clear();
  }
  expect(w.bosses.boss.state).toBe(BossState.Fight);
  return w;
}

/**
 * Steps a world.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  const input = createInputSnapshot();
  for (let i = 0; i < ticks; i++) {
    stepWorld(w, input);
    w.events.clear();
  }
}

/** Part indices of the shipped test boss. */
const T = { vent: 3, core: 4, gunTop: 7, gunBottom: 8 } as const;

describe('core/behaviors — the boss roster (M1-13)', () => {
  it('registers boss.hover and boss.lanes, frozen, next to the enemy roster', () => {
    expect(BOSS_BEHAVIOR_IDS).toEqual(['boss.hover', 'boss.lanes']);
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.hover')?.params).toMatchObject({ trackSpeed: 0.5 });
    expect(Object.isFrozen(DEFAULT_BOSS_BEHAVIOR_DEFS[0].params)).toBe(true);
    expect(() =>
      createBossBehaviorRegistry([DEFAULT_BOSS_BEHAVIOR_DEFS[0], DEFAULT_BOSS_BEHAVIOR_DEFS[0]]),
    ).toThrow(/defined twice/);
  });

  it('boss.hover fires aimed spreads from the standing guns and tracks the player', () => {
    const w = fighting(db());
    const boss = w.bosses.boss;
    const ship = w.players[0];
    // Phase 0: fireTicks 70 (Normal) — both guns fire one round red bullet at the first volley.
    run(w, 69);
    expect(w.bullets.count).toBe(0);
    run(w, 1);
    expect(w.bullets.count).toBe(2);
    const f = w.bullets.pool.fields;
    const guns = [boss.parts[T.gunTop], boss.parts[T.gunBottom]];
    const origins = [0, 1].map((i) => [f.x[i], f.y[i]]);
    // Bullets start at their gun (one move already made).
    for (let i = 0; i < 2; i++) {
      expect(Math.abs(origins[i][1] - guns[i].y)).toBeLessThan(3);
    }
    // A destroyed gun no longer fires.
    w.bosses.damagePart(T.gunTop, 99, 0);
    const before = w.bullets.count;
    run(w, 70);
    expect(w.bullets.count - before).toBeLessThanOrEqual(1);
    // Tracking: the ship high up pulls the boss up, 0.5 px/tick, no further than the margin.
    ship.y = 20;
    const y = boss.screenY;
    run(w, 10);
    expect(boss.screenY).toBeCloseTo(y - 5, 9);
    run(w, 400);
    expect(boss.screenY).toBe(32);
  });

  it('boss.hover opens the whenOpen parts for openTicks after every closedTicks', () => {
    const w = fighting(db());
    const vent = w.bosses.boss.parts[T.vent];
    expect(vent.open).toBe(false);
    run(w, 119);
    expect(vent.open).toBe(false);
    run(w, 1);
    expect(vent.open).toBe(true);
    expect(w.bosses.isArmoured(T.vent)).toBe(false);
    run(w, 59);
    expect(vent.open).toBe(true);
    run(w, 1);
    expect(vent.open).toBe(false);
  });

  it('boss.lanes fires lane lasers from the guns in turn (unattached) and spreads', () => {
    const w = fighting(db([{ script: 'boss.lanes', params: { laserTicks: 40, fireTicks: 1000 } }]));
    const boss = w.bosses.boss;
    const lasers = w.bullets.lasers;
    run(w, 40);
    expect(lasers.count).toBe(1);
    const lf = lasers.fields;
    expect(lf.src[0]).toBe(-1);
    expect(lf.angle[0]).toBe(512);
    expect(lf.phase[0]).toBe(LaserPhase.Telegraph);
    expect(Math.abs(lf.y[0] - boss.parts[T.gunTop].y)).toBeLessThan(1);
    run(w, 40);
    let bottom = false;
    for (let i = 0; i < lasers.count; i++) {
      if (Math.abs(lf.y[i] - boss.parts[T.gunBottom].y) < 1) bottom = true;
    }
    expect(bottom).toBe(true);
  });

  it('checks boss phases: boss behaviours only, their tunables, and no boss behaviour for enemies', () => {
    const content = db([
      { script: 'boss.hover', params: { fireTicks: 10, laserTicks: 3 }, until: { ticks: 10 } },
      { script: 'drifter.sine' },
    ]);
    expect(checkEnemyBehaviors(content)).toEqual([
      {
        path: 'enemies:test-boss.boss.phases[0].params.laserTicks',
        message:
          'unknown param for behaviour "boss.hover" (known: trackSpeed, margin, fireTicks, ' +
          'bulletSpeed, ways, spread, openTicks, closedTicks)',
      },
      {
        path: 'enemies:test-boss.boss.phases[1].script',
        message: '"drifter.sine" is an enemy behaviour, not a boss behaviour',
      },
    ]);
    const { db: wrong } = loadContent([
      {
        path: 'e.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            {
              id: 'x',
              hp: 1,
              score: 1,
              hurtbox: { hw: 1, hh: 1 },
              script: 'boss.lanes',
              sprite: 's',
              drop: null,
            },
          ],
        },
      },
    ]);
    expect(checkEnemyBehaviors(wrong)).toEqual([
      {
        path: 'enemies:x.script',
        message: '"boss.lanes" is a boss behaviour (use it in a boss phase)',
      },
    ]);
    expect(checkEnemyBehaviors(db())).toEqual([]);
  });
});
