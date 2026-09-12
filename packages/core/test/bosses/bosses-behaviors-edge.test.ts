/**
 * Edge cases of the M1 boss roster (`core/behaviors`, plan M1-13) on the shipped test boss,
 * beyond `bosses-behaviors.test.ts`: `boss.hover` floors / clamps `ways`, never opens its
 * `whenOpen` parts with the default `openTicks` 0 (and closes one the data left open), a new phase
 * closes what the last one opened; `boss.lanes` holds still by default, alternates its lanes
 * between the standing guns only and fires nothing once every gun is gone; the roster's registry.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOSS_BEHAVIOR_IDS,
  DEFAULT_BOSS_BEHAVIORS,
  KNOWN_SCRIPT_IDS,
  createBossBehaviorRegistry,
  defineBossBehavior,
} from '../../src/behaviors/index.js';
import { BossHit, BossState } from '../../src/bosses/index.js';
import { LaserPhase } from '../../src/bullets/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
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

/** Part indices of the shipped test boss. */
const T = { vent: 3, gunTop: 7, gunBottom: 8 } as const;

/**
 * The shipped test boss with its phases replaced.
 *
 * @param phases - The phase list.
 * @param ventOpen - Start with the vent open (data `open`).
 * @returns The DB.
 */
function db(phases: unknown[], ventOpen = false): ContentDb {
  const boss = shipped('enemies/test-boss.enemies.json');
  const data = boss.data as {
    enemies: { boss: { phases: unknown[]; parts: Array<Record<string, unknown>> } }[];
  };
  data.enemies[0].boss.phases = phases;
  if (ventOpen) data.enemies[0].boss.parts[T.vent].open = true;
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
 * Steps a world, events dropped.
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

/**
 * A world on the boss range whose boss fights (its first phase's script has run), god mode on,
 * no autofire.
 *
 * @param content - The DB.
 * @returns The world.
 */
function fighting(content: ContentDb): World {
  const w = createWorld(
    resolveGameConfig({ stage: 'test-boss', seed: 21, autofire: false }),
    content,
  );
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
 * The y of the only laser in telegraph (the one just fired), or `null`.
 *
 * @param w - The world.
 * @returns Its y.
 */
function newLaserY(w: World): number | null {
  const lasers = w.bullets.lasers;
  const lf = lasers.fields;
  let y: number | null = null;
  for (let i = 0; i < lasers.count; i++) {
    if (lf.phase[i] === LaserPhase.Telegraph) {
      expect(y).toBeNull();
      y = lf.y[i];
    }
  }
  return y;
}

describe('core/behaviors — boss roster edge cases (M1-13)', () => {
  it('lists the boss behaviours among the known script ids, and registries stay separate', () => {
    for (const id of BOSS_BEHAVIOR_IDS) expect(KNOWN_SCRIPT_IDS).toContain(id);
    const own = defineBossBehavior('boss.own', { speed: 1 }, function* own(): Script {
      yield SLEEP_FOREVER;
    });
    const registry = createBossBehaviorRegistry([own]);
    expect(registry.ids).toEqual(['boss.own']);
    expect(registry.get('boss.hover')).toBeUndefined();
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.own')).toBeUndefined();
    expect(Object.isFrozen(own)).toBe(true);
    expect(Object.isFrozen(registry.ids)).toBe(true);
    // The tunables are copied: changing the object passed in changes nothing.
    const params = { speed: 1 };
    const def = defineBossBehavior('boss.copy', params, function* copy(): Script {
      yield SLEEP_FOREVER;
    });
    params.speed = 9;
    expect(def.params).toEqual({ speed: 1 });
  });

  it.each([
    [0.4, 1],
    [1, 1],
    [2.7, 2],
  ])('boss.hover with ways %f fires %i bullet(s) per gun', (ways, perGun) => {
    const w = fighting(db([{ script: 'boss.hover', params: { fireTicks: 30, ways } }]));
    run(w, 29);
    expect(w.bullets.count).toBe(0);
    run(w, 1);
    expect(w.bullets.count).toBe(2 * perGun);
  });

  it('boss.hover with the default openTicks never opens, and closes a part the data left open', () => {
    const w = fighting(db([{ script: 'boss.hover' }], true));
    const vent = w.bosses.boss.parts[T.vent];
    expect(vent.open).toBe(false);
    for (let i = 0; i < 12; i++) {
      run(w, 50);
      expect(vent.open).toBe(false);
    }
    expect(w.bosses.damagePart(T.vent, 1, 0)).toBe(BossHit.Clink);
  });

  it('a new phase closes what the last one opened', () => {
    const w = fighting(
      db([
        {
          script: 'boss.hover',
          params: { openTicks: 10, closedTicks: 10, fireTicks: 1000 },
          until: { ticks: 15 },
        },
        { script: 'boss.hover', params: { fireTicks: 1000 } },
      ]),
    );
    const boss = w.bosses.boss;
    const vent = boss.parts[T.vent];
    run(w, 10);
    expect(vent.open).toBe(true);
    run(w, 5);
    expect(boss.phase).toBe(1);
    expect(vent.open).toBe(true); // the new script first runs next tick
    run(w, 1);
    expect(vent.open).toBe(false);
    run(w, 200);
    expect(vent.open).toBe(false);
  });

  it('boss.lanes holds still by default, alternates lanes between the standing guns only', () => {
    const w = fighting(
      db([
        {
          script: 'boss.lanes',
          params: { laserTicks: 40, fireTicks: 10000, telegraph: 5, active: 5 },
        },
      ]),
    );
    const boss = w.bosses.boss;
    const ship = w.players[0];
    ship.y = 20;
    const y = boss.screenY;
    const top = boss.parts[T.gunTop];
    const bottom = boss.parts[T.gunBottom];
    const lanes: string[] = [];
    /** Records which gun the next laser came from. */
    const next = (): void => {
      run(w, 40);
      const ly = newLaserY(w);
      lanes.push(
        ly === null
          ? 'none'
          : Math.abs(ly - top.y) < 1
            ? 'top'
            : Math.abs(ly - bottom.y) < 1
              ? 'bottom'
              : 'other',
      );
    };
    next();
    next();
    next();
    expect(w.bosses.damagePart(T.gunTop, 99, 0)).toBe(BossHit.Destroyed);
    next();
    next();
    expect(w.bosses.damagePart(T.gunBottom, 99, 0)).toBe(BossHit.Destroyed);
    next();
    next();
    expect(lanes).toEqual(['top', 'bottom', 'top', 'bottom', 'bottom', 'none', 'none']);
    expect(boss.screenY).toBe(y);
    expect(w.bullets.count).toBe(0);
  });
});
