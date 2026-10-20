/**
 * `core/weapons` simultaneous-overlap priority (R2-02 prepB.FIX2).
 *
 * The non-piercing pick kept the LOWEST hit id among the targets one shot overlapped in one tick.
 * Under the ×1.5 port that is a deadlock: the MANTA bolt (step 12, half width 12) straddles
 * HALCYON BULWARK's plate-1 and the armoured core every volley, and the core (lower part slot,
 * `afterParts`) steals every hit — Clink, bolt dies, plate never dies, core never opens (evidence
 * w03-L6 report § Open issues, premise confirmed by reviewer w03-RT2b; v1 was safe only by a
 * 1-px phase accident).
 *
 * The pick is now physical and scale-stable: the shot hits the target its leading edge entered
 * FIRST (the smallest forward entry gap along the shot's travel); an exact tie prefers a live
 * damageable target over an armoured one; a further tie prefers the lower hit id. This file locks
 * the rule at BOTH scales (`test/port-v2/two-scale.sh` runs the kit side, the checkout the ×1
 * side):
 *
 * - the boss case (the reported deadlock): a bolt straddling the armoured core and the plate in
 *   front hits the PLATE, the core takes nothing, and the shot is consumed with exactly ONE kill
 *   (the redirected hit must never double-kill in one tick);
 * - with the plate gone the next bolt damages the now-open core — the deadlock class end to end;
 * - the enemy side: a co-located armoured enemy does not steal a live damageable enemy's hit,
 *   co-located same-kind targets keep the lowest-slot tie, and armour ENTERED FIRST still blocks
 *   (a front shield stops the bolt — the redirect is not a pass-through).
 *
 * Every position is derived from the live boxes at run time (content here is inline, so the
 * targets keep their v1-unit boxes at both scales, while the shot's own box scales with
 * WORLD_SCALE); each asserted overlap therefore holds at world ×1 and ×1.5 unchanged.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBossBehaviorRegistry, defineBossBehavior } from '../../src/behaviors/index.js';
import { BOSS_PART_ID_BASE, BossState } from '../../src/bosses/index.js';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyFlag, type Enemy } from '../../src/enemies/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { SLEEP_FOREVER, type Script } from '../../src/patterns/index.js';
import { ShotFlag, WeaponRole } from '../../src/weapons/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';

/** The probe boss part slots (as in `test/bosses/bosses.test.ts`): the core is a LOWER slot. */
const P = { hull: 0, arm: 1, gun: 2, core: 3, plate: 4, mouth: 5 } as const;

/** The probe boss: the plate in front of the armoured core, exactly HALCYON BULWARK's shape. */
const PROBE = {
  id: 'probe',
  boss: {
    code: 'PB-07',
    displayName: 'PROBE HULK',
    introTicks: 30,
    score: 7000,
    x: 300,
    y: 100,
    parts: [
      {
        name: 'hull',
        hurtbox: { hw: 10, hh: 10 },
        vulnerable: 'never',
        sprite: 'bosses/hull-block',
      },
      {
        name: 'arm',
        parent: 'hull',
        y: -30,
        hp: 5,
        hurtbox: { hw: 4, hh: 4 },
        sprite: 'bosses/emitter',
        score: 100,
      },
      {
        name: 'gun',
        parent: 'arm',
        x: -10,
        hp: 5,
        hurtbox: { hw: 3, hh: 3 },
        gun: true,
        sprite: 'bosses/emitter',
        score: 50,
      },
      {
        name: 'core',
        parent: 'hull',
        x: -12,
        hp: 10,
        hurtbox: { hw: 5, hh: 5 },
        vulnerable: 'afterParts',
        requires: ['plate'],
        core: true,
        sprite: 'bosses/core',
        anim: { frames: 2, ticks: 12 },
        score: 1000,
        explosion: 'large',
      },
      {
        name: 'plate',
        parent: 'hull',
        x: -24,
        hp: 4,
        hurtbox: { hw: 3, hh: 8 },
        sprite: 'bosses/shield-plate',
        score: 300,
      },
      {
        name: 'mouth',
        parent: 'hull',
        x: 14,
        hp: 3,
        hurtbox: { hw: 3, hh: 3 },
        vulnerable: 'whenOpen',
      },
    ],
    phases: [
      { script: 'test.a', until: { partsDestroyed: ['plate'] } },
      { script: 'test.b', until: { hpBelow: 5 } },
      { script: 'test.c' },
    ],
  },
};

/**
 * A stage scrolling at 1 px/tick with the probe's WARNING at x 100.
 *
 * @param id - Stage id.
 * @param events - Its events.
 * @returns The stage file.
 */
function stage(id: string, events: unknown[]): ContentFile {
  return {
    path: 'stages/' + id + '.stage.json',
    data: {
      formatVersion: 1,
      kind: 'stage',
      id,
      name: id.toUpperCase(),
      music: { stage: 'Stage', boss: 'FinalBoss' },
      length: 5000,
      camera: [{ x: 0, speed: 1 }],
      checkpoints: [{ x: 0 }, { x: 50 }],
      parallax: [],
      tilemap: null,
      events,
    },
  };
}

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file (a fresh copy every call).
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
 * The KESTREL, Type A, the probe boss and one scriptless grunt (the target enemy).
 *
 * @returns The DB (asserted issue-free).
 */
function db(): ContentDb {
  const { db: content, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('weapons/type-a.weapons.json'),
      {
        path: 'enemies/t.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            PROBE,
            {
              id: 'grunt',
              hp: 1000,
              score: 100,
              hurtbox: { hw: 4, hh: 4 },
              script: 'test.none',
              sprite: 'enemies/drifter',
              drop: null,
            },
          ],
        },
      },
      stage('arena', [
        { x: 100, type: 'warning', enemy: 'probe' },
        { x: 5000, type: 'end' },
      ]),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return content;
}

/** The shared DB (read-only). */
const DB = db();

/** The sleeping boss behaviours the probe's phases name. */
const BEHAVIORS = createBossBehaviorRegistry(
  ['test.a', 'test.b', 'test.c'].map((id) =>
    defineBossBehavior(id, {}, function* sleep(): Script {
      yield SLEEP_FOREVER;
    }),
  ),
);

/**
 * A world on the arena stage, player 1 alive, god mode on, autofire off.
 *
 * @param over - Config overrides.
 * @returns The world.
 */
function world(over: Partial<GameConfig> = {}): World {
  const w = createWorld(
    resolveGameConfig({ stage: 'arena', seed: 3, autofire: false, remoteMode: false, ...over }),
    DB,
    { bossBehaviors: BEHAVIORS },
  );
  w.debugFlags.godMode = true;
  return w;
}

/**
 * Steps a world idle, draining its events.
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
 * Steps until the boss reaches a state.
 *
 * @param w - The world.
 * @param state - The `BossState`.
 * @param limit - Safety limit.
 */
function until(w: World, state: number, limit = 2000): void {
  const input = createInputSnapshot();
  for (let i = 0; i < limit; i++) {
    stepWorld(w, input);
    w.events.clear();
    if (w.bosses.boss.state === state) return;
  }
  throw new Error('boss never reached state ' + String(state));
}

/**
 * A world whose probe boss is fighting, events drained.
 *
 * @returns The world.
 */
function fighting(): World {
  const w = world();
  until(w, BossState.Fight);
  return w;
}

/**
 * Builds the World's grid with the enemy and boss-part hurtboxes, then runs `collide` — the
 * shot stays exactly where the test put it (no movement phase).
 *
 * @param w - The world.
 */
function collideNow(w: World): void {
  const grid = w.grid;
  grid.begin(Math.floor(w.camera.x) - 64, Math.floor(w.camera.y) - 64);
  w.enemies.insertColliders(grid);
  w.bosses.insertColliders(grid);
  grid.build();
  w.weapons.collide(grid);
}

/**
 * Parks a fresh Main shot so its box straddles two live target boxes across the gap between
 * them: its centre is the midpoint of the front box's far edge and the behind box's near edge,
 * its y the front box's centre (the windows below hold for every shot half width ≥ 1).
 *
 * @param w - The world.
 * @param frontX - Front target centre x.
 * @param frontHw - Front target half width.
 * @param behindX - Behind target centre x.
 * @param behindHw - Behind target half width.
 * @param y - Both boxes' centre y.
 * @returns The shot slot.
 */
function straddle(
  w: World,
  frontX: number,
  frontHw: number,
  behindX: number,
  behindHw: number,
  y: number,
): number {
  const i = w.weapons.spawnShot(WeaponRole.Main, 0, w.players[0].x, w.players[0].y);
  expect(i).toBeGreaterThanOrEqual(0);
  const f = w.weapons.pool.fields;
  f.x[i] = (frontX + frontHw + behindX - behindHw) / 2;
  f.y[i] = y;
  return i;
}

describe('core/weapons hit priority (prepB.FIX2): the boss part case', () => {
  it('a bolt straddling the armoured core and the plate in front hits the plate, not the core', () => {
    const w = fighting();
    const parts = w.bosses.boss.parts;
    const plate = parts[P.plate];
    const core = parts[P.core];
    // The deadlock's shape: the armoured core is the LOWER part id.
    expect(P.core).toBeLessThan(P.plate);
    expect(core.armoured).toBe(true);
    expect(plate.armoured).toBe(false);
    const i = straddle(w, plate.x, plate.hw, core.x, core.hw, plate.y);
    // The fixture holds at both scales: the bolt box overlaps the plate AND the core at once
    // (that is the same-tick overlap the old pick deadlocked on).
    const f = w.weapons.pool.fields;
    expect(f.x[i] - f.hw[i]).toBeLessThanOrEqual(plate.x + plate.hw);
    expect(f.x[i] + f.hw[i]).toBeGreaterThanOrEqual(core.x - core.hw);
    collideNow(w);
    // The old pick answered the core (lowest id) → Clink → bolt dies → stalemate forever.
    expect(w.weapons.hitCount).toBe(1);
    expect(w.weapons.hitShot[0]).toBe(i);
    expect(w.weapons.hitEnemy[0]).toBe(BOSS_PART_ID_BASE + P.plate);
    const before = plate.hp;
    w.weapons.applyHits();
    expect(plate.hp).toBe(before - 1);
    expect(core.hp).toBe(10);
    expect(core.destroyed).toBe(false);
    // One hit, one consumption: the shot is gone.
    expect((w.weapons.pool.fields.flags[i] & ShotFlag.Dead) !== 0).toBe(true);
  });

  it('one kill per shot: the lethal plate hit never also kills the core; the open core takes the next', () => {
    const w = fighting();
    const parts = w.bosses.boss.parts;
    const plate = parts[P.plate];
    const core = parts[P.core];
    plate.hp = 1; // one bolt is lethal
    const i = straddle(w, plate.x, plate.hw, core.x, core.hw, plate.y);
    collideNow(w);
    expect(w.weapons.hitCount).toBe(1); // exactly one target for one non-piercing shot
    expect(w.weapons.hitEnemy[0]).toBe(BOSS_PART_ID_BASE + P.plate);
    w.weapons.applyHits();
    expect(plate.destroyed).toBe(true);
    expect(core.destroyed).toBe(false);
    expect(core.hp).toBe(10);
    expect((w.weapons.pool.fields.flags[i] & ShotFlag.Dead) !== 0).toBe(true);
    // The deadlock class is cured end to end: with the plate gone the core opens, and the next
    // bolt — which at both scales overlaps the core box only — damages the core.
    run(w, 1); // the world's phase 6 recomputes `part.armoured` against the new destroyed mask
    const j = straddle(w, core.x, core.hw, core.x, core.hw, core.y);
    collideNow(w);
    expect(w.weapons.hitCount).toBe(1);
    expect(w.weapons.hitEnemy[0]).toBe(BOSS_PART_ID_BASE + P.core);
    w.weapons.applyHits();
    expect(core.hp).toBe(9);
    expect((w.weapons.pool.fields.flags[j] & ShotFlag.Dead) !== 0).toBe(true);
  });
});

describe('core/weapons hit priority (prepB.FIX2): the enemy case', () => {
  /**
   * A world before the WARNING (no boss parts in the grid) with grunts spawned at view offsets.
   *
   * @param xs - The grunts' view-relative x positions, spawn order (lower slot first).
   * @param armoured - Which spawn-order indexes are `Invulnerable`.
   * @returns The world and the enemies in spawn order.
   */
  const range = (xs: number[], armoured: number[] = []): { w: World; e: Enemy[] } => {
    const w = world();
    const input = createInputSnapshot();
    while (w.players[0].state !== 'alive') {
      stepWorld(w, input);
      w.events.clear();
    }
    run(w, 5); // still before the WARNING at x 100: no boss parts in the grid yet
    const e = xs.map((x) => {
      const enemy = w.enemies.spawn(
        DB.enemyIndex.get('grunt') ?? -1,
        w.camera.x + x,
        w.camera.y + 100,
      );
      expect(enemy).not.toBeNull();
      return enemy!;
    });
    for (const k of armoured) e[k].flags |= EnemyFlag.Invulnerable;
    return { w, e };
  };

  it('a co-located armoured enemy never steals a live damageable enemy hit', () => {
    const { w, e } = range([200, 200], [0]); // armoured = the LOWER slot (the core's trick)
    const [armor, soft] = e;
    expect(soft.slot).toBeGreaterThan(armor.slot);
    const i = straddle(w, armor.x, armor.hw, soft.x, soft.hw, soft.y);
    collideNow(w);
    expect(w.weapons.hitEnemy[0]).toBe(soft.slot); // the old pick was `armor` (lowest id → clink)
    w.weapons.applyHits();
    expect([armor.hp, soft.hp]).toEqual([1000, 999]);
    expect((w.weapons.pool.fields.flags[i] & ShotFlag.Dead) !== 0).toBe(true);
  });

  it('two co-located same-kind enemies still tie to the lowest slot', () => {
    const { w, e } = range([200, 200]); // `weapons-edge.test.ts` keeps this id-priority
    const [low, high] = e[0].slot < e[1].slot ? e : [e[1], e[0]];
    straddle(w, low.x, low.hw, high.x, high.hw, high.y);
    collideNow(w);
    expect(w.weapons.hitEnemy[0]).toBe(low.slot);
    w.weapons.applyHits();
    expect([low.hp, high.hp]).toEqual([999, 1000]);
  });

  it('among damageable overlaps the nearer leading edge takes the hit, id or not', () => {
    // The behind (higher-slot) enemy reaches 5 px further back along the bolt's travel.
    const { w, e } = range([202, 197]);
    const [behind, front] = e;
    const i = straddle(w, front.x, front.hw, behind.x, behind.hw, behind.y);
    collideNow(w);
    expect(w.weapons.hitEnemy[0]).toBe(front.slot); // lowest id would have picked `behind`
    w.weapons.applyHits();
    expect([behind.hp, front.hp]).toEqual([1000, 999]);
    expect((w.weapons.pool.fields.flags[i] & ShotFlag.Dead) !== 0).toBe(true);
  });

  it('armour entered first still blocks: the front shield eats the shot', () => {
    // The armoured box was entered first (its near edge reaches further back): no pass-through.
    const { w, e } = range([202, 197], [1]);
    const [behind, armor] = e;
    const i = straddle(w, armor.x, armor.hw, behind.x, behind.hw, behind.y);
    collideNow(w);
    expect(w.weapons.hitEnemy[0]).toBe(armor.slot);
    w.weapons.applyHits();
    expect([behind.hp, armor.hp]).toEqual([1000, 1000]); // clink: armour takes no damage
    expect((w.weapons.pool.fields.flags[i] & ShotFlag.Dead) !== 0).toBe(true);
  });
});
