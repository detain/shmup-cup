/**
 * Edge cases of `boss.bulwark` (plan M1-18), beyond `behaviors-bulwark.test.ts`. The behaviour is
 * put on the shipped test boss (whose two guns can be destroyed, unlike HB-01's armoured emitters)
 * by replacing its phases, and checked on HALCYON BULWARK itself for its phase changes:
 *
 * - the registered defaults (the module docs' numbers), frozen;
 * - lanes to the left, horizontal, with the given length / width / timings, attached to their gun
 *   (a destroyed gun's warning lane vanishes, an active one fades); the lanes rotate between the
 *   **standing** guns only and stop once no gun stands;
 * - `firstLaser` below 1 means the first tick, fractions floor; `ways` floors, below 1 = no spread;
 * - tracking at `trackSpeed` at most, within `margin` of the playfield edges;
 * - the rank shortens the lane interval (Arcade vs Normal vs Easy);
 * - a new phase restarts the timers: HB-01's phase 1 fires its first lane `firstLaser` ticks and
 *   its first spread `fireTicks` ticks after the second plate falls.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BOSS_BEHAVIORS } from '../../src/behaviors/index.js';
import { BOSS_PART_ID_BASE, BossHit, BossState } from '../../src/bosses/index.js';
import {
  BulletFlag,
  LASER_FADE_TICKS,
  LASER_GROW_TICKS,
  LaserPhase,
} from '../../src/bullets/index.js';
import { PLAYFIELD_H, resolveGameConfig, type DifficultyPreset } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { ANGLE_UNITS } from '../../src/math/index.js';
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

/** Part indices of the shipped test boss (its guns have 12 hp). */
const T = { core: 4, gunTop: 7, gunBottom: 8 } as const;

/** HB-01's part indices. */
const HB = { emitterTop: 3, emitterBottom: 4, plates: [6, 7, 8, 9] } as const;

/**
 * The shipped test boss fighting with one `boss.bulwark` phase.
 *
 * @param params - The phase's tunables.
 * @returns The DB.
 */
function testBossDb(params: Record<string, number>): ContentDb {
  const boss = shipped('enemies/test-boss.enemies.json');
  const data = boss.data as { enemies: { boss: { phases: unknown[] } }[] };
  data.enemies[0].boss.phases = [{ script: 'boss.bulwark', params }];
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
 * A world whose boss has just started to fight (god mode, no autofire).
 *
 * @param content - The DB.
 * @param stage - Stage id.
 * @param extra - More config.
 * @returns The world.
 */
function fighting(
  content: ContentDb,
  stage = 'test-boss',
  extra: { difficulty?: DifficultyPreset; stageSkip?: 'boss' } = {},
): World {
  const w = createWorld(
    resolveGameConfig({ stage, seed: 13, autofire: false, remoteMode: false, ...extra }),
    content,
  );
  w.debugFlags.godMode = true;
  for (let i = 0; i < 4000 && w.bosses.boss.state !== BossState.Fight; i++) run(w, 1);
  expect(w.bosses.boss.state).toBe(BossState.Fight);
  return w;
}

/**
 * The live lasers.
 *
 * @param w - The world.
 * @returns Slot, source id and phase of each.
 */
function lasers(w: World): { slot: number; src: number; phase: number }[] {
  const pool = w.bullets.lasers;
  const f = pool.fields;
  const out: { slot: number; src: number; phase: number }[] = [];
  for (let i = 0; i < pool.count; i++) {
    if ((f.flags[i] & BulletFlag.Dead) !== 0) continue;
    out.push({ slot: i, src: f.src[i], phase: f.phase[i] });
  }
  return out;
}

/**
 * The source of the laser fired on the last tick (its telegraph counter reads 1 after that
 * tick's update), if any.
 *
 * @param w - The world.
 * @returns Its `src`, or `null`.
 */
function freshLaser(w: World): number | null {
  const f = w.bullets.lasers.fields;
  for (const l of lasers(w)) {
    if (l.phase === LaserPhase.Telegraph && f.ticks[l.slot] === 1) return l.src;
  }
  return null;
}

const QUIET = { fireTicks: 10_000, trackSpeed: 0 } as const;

describe('core/behaviors boss.bulwark — edge cases (M1-18)', () => {
  it('registers the documented defaults, frozen', () => {
    const def = DEFAULT_BOSS_BEHAVIORS.get('boss.bulwark');
    expect(def?.params).toEqual({
      trackSpeed: 0.35,
      margin: 40,
      laserTicks: 110,
      firstLaser: 60,
      laserLength: 384,
      laserWidth: 8,
      telegraph: 45,
      active: 50,
      fireTicks: 120,
      bulletSpeed: 1.5,
      ways: 0,
      spread: 40,
    });
    expect(Object.isFrozen(def?.params)).toBe(true);
  });

  it('fires horizontal lanes to the left with the given length, width and timings', () => {
    const telegraph = 7;
    const active = 9;
    const w = fighting(
      testBossDb({
        ...QUIET,
        firstLaser: 5,
        laserTicks: 1000,
        laserLength: 200,
        laserWidth: 10,
        telegraph,
        active,
      }),
    );
    run(w, 5);
    const live = lasers(w);
    expect(live).toHaveLength(1);
    const f = w.bullets.lasers.fields;
    const i = live[0].slot;
    expect(live[0].src).toBe(BOSS_PART_ID_BASE + T.gunTop);
    expect(f.angle[i]).toBe(ANGLE_UNITS / 2);
    expect(f.length[i]).toBe(200);
    expect(f.width[i]).toBe(10);
    expect(f.ex[i]).toBeCloseTo(f.x[i] - 200, 9);
    expect(f.ey[i]).toBeCloseTo(f.y[i], 9);
    expect([f.telegraph[i], f.grow[i], f.active[i], f.fade[i]]).toEqual([
      telegraph,
      LASER_GROW_TICKS,
      active,
      LASER_FADE_TICKS,
    ]);
    // Each phase lasts exactly its ticks, then the lane is gone.
    const phases: number[] = [];
    for (let t = 0; t < 60 && lasers(w).length > 0; t++) {
      phases.push(lasers(w)[0].phase);
      run(w, 1);
    }
    const count = (p: number): number => phases.filter((x) => x === p).length;
    expect([
      count(LaserPhase.Telegraph),
      count(LaserPhase.Grow),
      count(LaserPhase.Active),
      count(LaserPhase.Fade),
    ]).toEqual([telegraph, LASER_GROW_TICKS, active, LASER_FADE_TICKS]);
    expect(w.bullets.count).toBe(0);
  });

  it('rotates its lanes between the standing guns only and stops once none stands', () => {
    const w = fighting(
      testBossDb({ ...QUIET, firstLaser: 40, laserTicks: 40, telegraph: 5, active: 5 }),
    );
    const order: string[] = [];
    const name = (src: number | null): string =>
      src === BOSS_PART_ID_BASE + T.gunTop
        ? 'top'
        : src === BOSS_PART_ID_BASE + T.gunBottom
          ? 'bottom'
          : String(src);
    const next = (): void => {
      run(w, 40);
      order.push(name(freshLaser(w)));
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
    expect(order).toEqual(['top', 'bottom', 'top', 'bottom', 'bottom', 'null', 'null']);
    expect(w.bullets.count).toBe(0);
  });

  it('keeps a lane attached to its gun: a warning lane vanishes with it, an active one fades', () => {
    const w = fighting(
      testBossDb({ ...QUIET, firstLaser: 1, laserTicks: 30, telegraph: 20, active: 40 }),
    );
    run(w, 1);
    expect(lasers(w).map((l) => [l.src, l.phase])).toEqual([
      [BOSS_PART_ID_BASE + T.gunTop, LaserPhase.Telegraph],
    ]);
    w.bosses.damagePart(T.gunTop, 99, 0);
    run(w, 1);
    expect(lasers(w)).toEqual([]);
    // The bottom gun's lane (fired 30 ticks after the first) reaches its beam, then its gun falls.
    run(w, 29 + 20 + LASER_GROW_TICKS + 2);
    const beam = lasers(w).find((l) => l.src === BOSS_PART_ID_BASE + T.gunBottom);
    expect(beam?.phase).toBe(LaserPhase.Active);
    w.bosses.damagePart(T.gunBottom, 99, 0);
    run(w, 1);
    const fading = lasers(w);
    expect(fading).toHaveLength(1);
    expect(fading[0].phase).toBe(LaserPhase.Fade);
    run(w, LASER_FADE_TICKS + 1);
    expect(lasers(w)).toEqual([]);
  });

  it.each([
    [0, 1],
    [-5, 1],
    [0.5, 1],
    [10.9, 10],
  ])('firstLaser %f fires the first lane after %i tick(s)', (firstLaser, ticks) => {
    const w = fighting(testBossDb({ ...QUIET, firstLaser, laserTicks: 1000 }));
    run(w, ticks - 1);
    expect(lasers(w)).toEqual([]);
    run(w, 1);
    expect(lasers(w)).toHaveLength(1);
  });

  it.each([
    [0.5, 0],
    [-1, 0],
    [1, 1],
    [2.7, 2],
  ])('ways %f fires %i needle(s) per gun', (ways, perGun) => {
    const w = fighting(
      testBossDb({ ways, fireTicks: 30, firstLaser: 5000, laserTicks: 5000, trackSpeed: 0 }),
    );
    run(w, 29);
    expect(w.bullets.count).toBe(0);
    run(w, 1);
    expect(w.bullets.count).toBe(2 * perGun);
    run(w, 300);
    if (perGun === 0) expect(w.bullets.count).toBe(0);
  });

  it('tracks the ship at trackSpeed at most, never closer than margin to the edges', () => {
    const w = fighting(testBossDb({ trackSpeed: 0.35, margin: 40, firstLaser: 5000 }));
    const boss = w.bosses.boss;
    const ship = w.players[0];
    for (const [shipY, goal] of [
      [4, 40],
      [PLAYFIELD_H - 4, PLAYFIELD_H - 40],
    ] as const) {
      let previous = boss.screenY;
      for (let i = 0; i < 800; i++) {
        ship.y = w.camera.y + shipY;
        run(w, 1);
        expect(Math.abs(boss.screenY - previous)).toBeLessThanOrEqual(0.35 + 1e-9);
        expect(boss.screenY).toBeGreaterThanOrEqual(40 - 1e-9);
        expect(boss.screenY).toBeLessThanOrEqual(PLAYFIELD_H - 40 + 1e-9);
        previous = boss.screenY;
      }
      expect(boss.screenY).toBeCloseTo(goal, 9);
    }
  });

  it('fires its lanes more often on a higher rank (the interval is rank-scaled)', () => {
    const interval = (difficulty: DifficultyPreset): number => {
      const w = fighting(
        testBossDb({ ...QUIET, firstLaser: 1, laserTicks: 100, telegraph: 5, active: 5 }),
        'test-boss',
        { difficulty },
      );
      const at: number[] = [];
      for (let t = 1; t <= 400 && at.length < 3; t++) {
        run(w, 1);
        if (freshLaser(w) !== null) at.push(t);
      }
      expect(at[0], difficulty).toBe(1); // firstLaser is not rank-scaled
      expect(at[2] - at[1], difficulty).toBe(at[1] - at[0]);
      return at[1] - at[0];
    };
    expect(interval('normal')).toBe(100);
    expect(interval('arcade')).toBeLessThan(100);
    expect(interval('hard')).toBeLessThan(100);
    expect(interval('easy')).toBeGreaterThan(100);
  });

  it("restarts the timers on HB-01's phase change: firstLaser and fireTicks from then on", () => {
    const content = (() => {
      const { db, issues } = loadContent(
        [
          'player/kestrel.player.json',
          'tilesets/terrain-a.tileset.json',
          'paths/zone-a.paths.json',
          'enemies/zone-a.enemies.json',
          'stages/zone-a.stage.json',
        ].map(shipped),
        { extraSprites: ENGINE_SPRITES },
      );
      expect(issues).toEqual([]);
      return db;
    })();
    const w = fighting(content, 'zone-a', { stageSkip: 'boss' });
    const boss = w.bosses.boss;
    run(w, 100);
    w.bosses.damagePart(HB.plates[3], 99, 0);
    w.bosses.damagePart(HB.plates[2], 99, 0);
    let laserAt = -1;
    let spreadAt = -1;
    let phaseAt = -1;
    for (let t = 1; t <= 200 && (laserAt < 0 || spreadAt < 0); t++) {
      run(w, 1);
      if (phaseAt < 0 && boss.phase === 1) phaseAt = t;
      const src = freshLaser(w);
      if (laserAt < 0 && phaseAt >= 0 && src !== null) {
        laserAt = t - phaseAt;
        // The emitters take turns afresh: the new script starts with the top one.
        expect(src).toBe(BOSS_PART_ID_BASE + HB.emitterTop);
      }
      if (spreadAt < 0 && w.bullets.count > 0) spreadAt = t - phaseAt;
    }
    expect(phaseAt).toBe(1);
    // Phase 1's tunables: firstLaser 40, fireTicks 120 (the script first runs the tick after).
    expect(laserAt).toBe(41);
    expect(spreadAt).toBe(121);
    expect(w.bullets.count).toBe(6);
    expect(boss.parts[HB.emitterBottom].destroyed).toBe(false);
  });
});
