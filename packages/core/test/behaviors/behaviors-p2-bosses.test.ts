/**
 * The three **P2 bosses** of plan M3-02 (shmup_feat.md §13 "[P2] suction boss (pulls ship toward
 * it — Choking Weed), grabber boss, invincible walker that must be dodged — Shadow Gear"), driven
 * on the shipped test boss with each script as its only phase:
 *
 * - `boss.suction` breathes in with a wide pull field open and the `whenOpen` parts vulnerable,
 *   then out — the field shut and the guns answering;
 * - `boss.grabber` telegraphs with the claw open, lunges with a short, very strong field that
 *   closes itself, then recovers and fires;
 * - `boss.walker` paces between two screen columns, sweeping the lane with aimed fire, and never
 *   takes a hit (its parts are armour in the content).
 *
 * Their tunables are checked at their edges too — a zero `ways`, a zero-tick phase, a `fireTicks`
 * of 0 — and `checkEnemyBehaviors` is required to know all three.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOSS_BEHAVIOR_IDS,
  DEFAULT_BOSS_BEHAVIORS,
  checkEnemyBehaviors,
} from '../../src/behaviors/index.js';
import { BossState } from '../../src/bosses/index.js';
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

/**
 * A world on the boss range whose boss fights (god mode, events drained).
 *
 * @param phases - The boss phases.
 * @returns The world.
 */
function fighting(phases: unknown[]): World {
  const w = createWorld(resolveGameConfig({ stage: 'test-boss', seed: 5 }), db(phases));
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

/** Part indices of the shipped test boss (`vent` is its `whenOpen` part). */
const T = { vent: 3, gunTop: 7 } as const;

describe('core/behaviors — boss.suction (M3-02)', () => {
  it('breathes in with the field open and the vent vulnerable, then out', () => {
    const w = fighting([
      {
        script: 'boss.suction',
        params: { pullTicks: 30, restTicks: 40, fireTicks: 1000, pullRadius: 160, pullStrength: 2 },
      },
    ]);
    const boss = w.bosses.boss;
    // The first resume opens the field before the first tick is simulated.
    expect(boss.pullRadius).toBe(160);
    expect(boss.pullStrength).toBe(2);
    expect(boss.pullTicks).toBe(-1);
    expect(boss.parts[T.vent].open).toBe(true);
    expect(w.bosses.isArmoured(T.vent)).toBe(false);
    // It drags the ship in while it breathes.
    const ship = w.players[0];
    ship.x = boss.x - 60;
    ship.y = boss.y;
    run(w, 1);
    expect(ship.x).toBeGreaterThan(boss.x - 60);
    // Breathe out: the field shuts and the vent closes with it.
    run(w, 30);
    expect(boss.pullRadius).toBe(0);
    expect(boss.pullStrength).toBe(0);
    expect(boss.parts[T.vent].open).toBe(false);
    // And it opens again for the next breath.
    run(w, 40);
    expect(boss.pullRadius).toBe(160);
    expect(boss.parts[T.vent].open).toBe(true);
  });

  it('fires its aimed spread only while the field is shut', () => {
    const w = fighting([
      {
        script: 'boss.suction',
        params: { pullTicks: 40, restTicks: 60, fireTicks: 20, ways: 3 },
      },
    ]);
    const boss = w.bosses.boss;
    run(w, 40);
    expect(w.bullets.count).toBe(0); // the whole breath-in passed without a shot
    expect(boss.pullRadius).toBe(0);
    run(w, 20);
    expect(w.bullets.count).toBeGreaterThan(0);
  });

  it('survives zero-tick phases and a ways below one', () => {
    const w = fighting([
      {
        script: 'boss.suction',
        params: { pullTicks: 0, restTicks: 0, fireTicks: 1, ways: 0, openTicks: 0 },
      },
    ]);
    const boss = w.bosses.boss;
    run(w, 120);
    expect(boss.state).toBe(BossState.Fight);
    // `openTicks` 0 leaves the parts as they are; one bullet a way still comes out.
    expect(boss.parts[T.vent].open).toBe(false);
    expect(w.bullets.count).toBeGreaterThan(0);
  });
});

describe('core/behaviors — boss.grabber (M3-02)', () => {
  it('telegraphs with the claw open, then lunges with a field that closes itself', () => {
    const w = fighting([
      {
        script: 'boss.grabber',
        params: { windUp: 20, grabTicks: 10, restTicks: 30, grabRadius: 90, grabStrength: 3 },
      },
    ]);
    const boss = w.bosses.boss;
    // Wind-up: the claw is open, no field yet.
    expect(boss.parts[T.vent].open).toBe(true);
    expect(boss.pullRadius).toBe(0);
    run(w, 20);
    expect(boss.pullRadius).toBe(90);
    expect(boss.pullStrength).toBe(3);
    expect(boss.pullTicks).toBeGreaterThan(0);
    // The lunge is short: it ends whether or not the script releases it.
    run(w, 10);
    expect(boss.pullRadius).toBe(0);
    expect(boss.pullTicks).toBe(-1);
    expect(boss.parts[T.vent].open).toBe(false);
  });

  it('fires a spread on every recovery, and none at all with zero ways', () => {
    const w = fighting([
      {
        script: 'boss.grabber',
        params: { windUp: 5, grabTicks: 5, restTicks: 5, fireTicks: 0, ways: 2 },
      },
    ]);
    run(w, 11);
    expect(w.bullets.count).toBeGreaterThan(0);

    const quiet = fighting([
      {
        script: 'boss.grabber',
        params: { windUp: 5, grabTicks: 5, restTicks: 5, fireTicks: 0, ways: 0 },
      },
    ]);
    run(quiet, 60);
    expect(quiet.bullets.count).toBe(0);
    expect(quiet.bosses.boss.state).toBe(BossState.Fight);
  });
});

describe('core/behaviors — boss.walker (M3-02)', () => {
  it('paces between the two columns and sweeps the lane with aimed fire', () => {
    const w = fighting([
      {
        script: 'boss.walker',
        params: { frontX: 100, backX: 280, stepTicks: 30, pauseTicks: 10, fireTicks: 15, ways: 3 },
      },
    ]);
    const boss = w.bosses.boss;
    run(w, 30);
    expect(boss.screenX).toBeCloseTo(100, 3);
    expect(w.bullets.count).toBeGreaterThan(0);
    // The pause, then the stride back.
    run(w, 10 + 30);
    expect(boss.screenX).toBeCloseTo(280, 3);
    // It never opens a pull field: the walker is a dodging section, not a grab.
    expect(boss.pullRadius).toBe(0);
  });

  it('cannot be shot down — its guns fire on whatever the players do', () => {
    const w = fighting([
      { script: 'boss.walker', params: { stepTicks: 20, pauseTicks: 5, fireTicks: 10 } },
    ]);
    const boss = w.bosses.boss;
    const hp = boss.parts[T.gunTop].hp;
    // Content decides the armour; here the gun is a normal part, so a hit still lands. What the
    // behaviour must never do is stop walking or firing because of it.
    w.bosses.damagePart(T.gunTop, 1, 0);
    expect(boss.parts[T.gunTop].hp).toBeLessThanOrEqual(hp);
    run(w, 120);
    expect(boss.state).toBe(BossState.Fight);
    expect(w.bullets.count).toBeGreaterThan(0);
  });

  it('survives zero-tick strides and a ways below one', () => {
    const w = fighting([
      {
        script: 'boss.walker',
        params: { stepTicks: 0, pauseTicks: 0, fireTicks: 1, ways: 0 },
      },
    ]);
    run(w, 90);
    expect(w.bosses.boss.state).toBe(BossState.Fight);
    expect(w.bullets.count).toBeGreaterThan(0);
  });
});

describe('core/behaviors — the P2 roster (M3-02)', () => {
  it('registers all three with their tunables', () => {
    for (const id of ['boss.suction', 'boss.grabber', 'boss.walker']) {
      expect(BOSS_BEHAVIOR_IDS).toContain(id);
      expect(DEFAULT_BOSS_BEHAVIORS.get(id)).toBeDefined();
    }
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.suction')?.params).toMatchObject({
      pullRadius: 200,
      pullStrength: 1.1,
    });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.grabber')?.params).toMatchObject({ grabRadius: 104 });
    expect(DEFAULT_BOSS_BEHAVIORS.get('boss.walker')?.params).toMatchObject({ frontX: 96 });
  });

  it('reports an unknown tunable on each of them', () => {
    const content = db([
      { script: 'boss.suction', params: { nope: 1 }, until: { ticks: 10 } },
      { script: 'boss.grabber', params: { nope: 1 }, until: { ticks: 10 } },
      { script: 'boss.walker', params: { nope: 1 } },
    ]);
    const issues = checkEnemyBehaviors(content);
    expect(issues).toHaveLength(3);
    for (const issue of issues) expect(issue.message).toMatch(/^unknown param for behaviour/);
  });

  it('the shipped P2 boss content uses them without an issue', () => {
    const { db: content, issues } = loadContent(
      [
        shipped('player/kestrel.player.json'),
        shipped('enemies/extras.enemies.json'),
        {
          path: 'stages/bare.stage.json',
          data: {
            formatVersion: 1,
            kind: 'stage',
            id: 'bare',
            name: 'BARE',
            music: { stage: 'Stage', boss: 'Boss' },
            length: 2000,
            camera: [{ x: 0, speed: 0 }],
            checkpoints: [{ x: 0 }],
            parallax: [],
            tilemap: null,
            events: [],
          },
        },
      ],
      { extraSprites: ENGINE_SPRITES },
    );
    expect(issues).toEqual([]);
    expect(checkEnemyBehaviors(content)).toEqual([]);
    // The three P2 bosses really are in there.
    const scripts = new Set<string>();
    for (const e of content.enemies) {
      for (const phase of e.boss?.phases ?? []) scripts.add(phase.script);
    }
    expect(scripts).toContain('boss.suction');
    expect(scripts).toContain('boss.grabber');
    expect(scripts).toContain('boss.walker');
  });
});
