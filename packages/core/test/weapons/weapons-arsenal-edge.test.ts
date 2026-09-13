/**
 * `core/weapons` — edge cases of the meter arsenal of plan M2-03 (the main suite is
 * `weapons-arsenal.test.ts`): the behaviour tables (appended `ShotKind` codes, one kind / slot /
 * label / tunables per behaviour), `resolveArsenal` / Weapon Edit errors and fallbacks, each new
 * behaviour's spawn geometry, every 8-way Free Way heading and when it is (not) recorded, the
 * Spread Bomb's reserved hit-cooldown table, blast frames, burst events, camera anchoring and cull,
 * the Photon Torpedo in the air and on armour, the Ripple ring's exact edges, caps below a pair
 * (Double kinds, 2-Way, Twin), Twin beams against terrain, the Cyclone's segment frames,
 * `setArsenal`'s resets and the tunables' clamping.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { EnemyFlag, type Enemy } from '../../src/enemies/index.js';
import { FX_CUES, SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { killPlayer } from '../../src/player/index.js';
import { METER_LABEL_FRAMES } from '../../src/ui/index.js';
import {
  LASER_SEGMENT_LENGTH,
  MainWeapon,
  PIERCE_TABLES,
  RIPPLE_RING_WIDTH,
  ShotFlag,
  ShotKind,
  WEAPON_BEHAVIOR_KINDS,
  WEAPON_BEHAVIOR_LABELS,
  WEAPON_BEHAVIOR_PARAMS,
  WEAPON_BEHAVIOR_SLOTS,
  WEAPON_SCRIPT_IDS,
  WeaponRole,
  checkWeaponBehaviors,
  resolveArsenal,
  weaponLabel,
  weaponsOfSlot,
} from '../../src/weapons/index.js';
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
 * An enemy entry: a scriptless target that stays where it spawns.
 *
 * @param id - Enemy id.
 * @param over - Fields to change.
 * @returns The entry.
 */
function enemy(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    hp: 1000,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    script: 'test.idle',
    sprite: 'enemies/drifter',
    drop: null,
    ...over,
  };
}

/**
 * A stage with a flat floor 32 px high (its surface at y 168).
 *
 * @param id - Stage id.
 * @param speed - Camera speed (px/tick).
 * @returns The file.
 */
function stage(id: string, speed: number): ContentFile {
  return {
    path: `stages/${id}.stage.json`,
    data: {
      formatVersion: 1,
      kind: 'stage',
      id,
      name: id.toUpperCase(),
      music: { stage: 'Stage', boss: 'Boss' },
      length: 3000,
      camera: [{ x: 0, speed }],
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
  };
}

/**
 * A custom weapon entry.
 *
 * @param id - Weapon id.
 * @param slot - Slot.
 * @param behavior - Behaviour id.
 * @param over - Fields to change.
 * @returns The entry.
 */
function weapon(
  id: string,
  slot: string,
  behavior: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    slot,
    behavior,
    damage: 1,
    speed: 6,
    cap: 2,
    pierce: false,
    sprite: 'shots/basic',
    sfx: 'PlayerShot',
    ...over,
  };
}

/** The shared content files: the KESTREL, the tileset, test enemies, a static and a scrolling stage. */
const BASE_FILES: readonly ContentFile[] = [
  shipped('player/kestrel.player.json'),
  shipped('tilesets/terrain-a.tileset.json'),
  {
    path: 'enemies/t.enemies.json',
    data: {
      formatVersion: 1,
      kind: 'enemies',
      enemies: [enemy('target'), enemy('weak', { hp: 1 }), enemy('armor', { hp: 5 })],
    },
  },
  stage('t', 0),
  stage('s', 1),
];

/** The shipped Type A and Types B–D weapons over the base files. */
const DB: ContentDb = ((): ContentDb => {
  const { db, issues } = loadContent(
    [
      ...BASE_FILES,
      shipped('weapons/type-a.weapons.json'),
      shipped('weapons/types-b-d.weapons.json'),
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/**
 * Custom weapons over the base files: caps below a pair, a Twin Laser of cap 3 / 1, a Ripple whose
 * `maxSize` is below its `startSize`, a Spread Bomb with out-of-range tunables. Preset `x-a` flies
 * the capped ones.
 */
const CUSTOM: ContentDb = ((): ContentDb => {
  const { db, issues } = loadContent(
    [
      ...BASE_FILES,
      {
        path: 'weapons/x.weapons.json',
        data: {
          formatVersion: 1,
          kind: 'weapons',
          weapons: [
            weapon('x.main', 'main', 'shot.straight', { cap: 4 }),
            weapon('x.tail1', 'double', 'shot.tailGun', { cap: 1 }),
            weapon('x.free1', 'double', 'shot.freeWay', { cap: 1 }),
            weapon('x.twoWay1', 'missile', 'missile.twoWay', { cap: 1 }),
            weapon('x.bomb', 'missile', 'missile.spreadBomb', {
              cap: 1,
              params: { blastTicks: 0, hitCooldownTicks: 300 },
            }),
            weapon('x.twin3', 'laser', 'laser.twin', { cap: 3, speed: 12 }),
            weapon('x.twin1', 'laser', 'laser.twin', { cap: 1, speed: 12 }),
            weapon('x.ripple', 'laser', 'laser.ripple', {
              cap: 1,
              params: { startSize: 6, maxSize: 2, growth: -1 },
            }),
          ],
          presets: [
            {
              id: 'x-a',
              main: 'x.main',
              missile: 'x.twoWay1',
              double: 'x.tail1',
              laser: 'x.twin3',
            },
          ],
        },
      },
    ],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/** Autofire off: only `spawnShot` and held buttons fire. */
const MANUAL: Partial<GameConfig> = { autofire: false, remoteMode: false };

/**
 * A world whose player 1 is alive, parked at (`x`, `y`) in the view.
 *
 * @param config - Config overrides.
 * @param x - Ship x relative to the camera.
 * @param y - Ship y relative to the camera.
 * @param content - The content (default {@link DB}).
 * @returns The world.
 */
function world(config: Partial<GameConfig> = {}, x = 40, y = 100, content = DB): World {
  const w = createWorld(resolveGameConfig({ seed: 5, ...config }), content);
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  w.players[0].x = w.camera.x + x;
  w.players[0].y = w.camera.y + y;
  w.events.clear();
  return w;
}

/**
 * Steps a world, dropping its events.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 * @param input - Input (default idle).
 */
function run(w: World, ticks: number, input: InputSnapshot = createInputSnapshot()): void {
  for (let i = 0; i < ticks; i++) {
    stepWorld(w, input);
    w.events.clear();
  }
}

/**
 * Steps a world once and returns its events.
 *
 * @param w - The world.
 * @returns The tick's events (copies).
 */
function stepEvents(w: World): SimEvent[] {
  const out: SimEvent[] = [];
  stepWorld(w, createInputSnapshot());
  w.events.drain((e) => out.push({ ...e }));
  return out;
}

/**
 * Spawns a test enemy at a world position.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - World x.
 * @param y - World y.
 * @returns The enemy.
 */
function spawnAt(w: World, id: string, x: number, y: number): Enemy {
  const e = w.enemies.spawn(w.content.enemyIndex.get(id)!, x, y);
  expect(e).not.toBeNull();
  return e!;
}

/** A live shot as a plain record. */
interface ShotRecord {
  readonly slot: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly hw: number;
  readonly hh: number;
  readonly length: number;
  readonly flags: number;
  readonly frame: number;
  readonly sprite: number;
  readonly table: number;
  readonly age: number;
}

/**
 * A shot slot as a plain record.
 *
 * @param w - The world.
 * @param i - The slot.
 * @returns The record.
 */
function shotAt(w: World, i: number): ShotRecord {
  const f = w.weapons.pool.fields;
  return {
    slot: i,
    x: f.x[i],
    y: f.y[i],
    vx: f.vx[i],
    vy: f.vy[i],
    hw: f.hw[i],
    hh: f.hh[i],
    length: f.length[i],
    flags: f.flags[i],
    frame: f.frame[i],
    sprite: f.sprite[i],
    table: f.table[i],
    age: f.age[i],
  };
}

/**
 * The live shots of a kind.
 *
 * @param w - The world.
 * @param kind - `ShotKind`.
 * @returns The shots in pool order.
 */
function shots(w: World, kind: number): ShotRecord[] {
  const f = w.weapons.pool.fields;
  const out: ShotRecord[] = [];
  for (let i = 0; i < w.weapons.pool.count; i++) {
    if ((f.flags[i] & ShotFlag.Dead) === 0 && f.kind[i] === kind) out.push(shotAt(w, i));
  }
  return out;
}

/**
 * A sprite id of the content.
 *
 * @param name - Sprite name.
 * @returns Its id.
 */
function spriteId(name: string): number {
  const id = DB.sprites.index.get(name);
  expect(id).toBeDefined();
  return id!;
}

/** cos 45° (the 2-Way's 128-unit headings; the trig table is accurate to 1e-4). */
const SQRT_HALF = Math.SQRT1_2;

describe('core/weapons arsenal edges (M2-03): the behaviour tables', () => {
  it('appends ShotKind codes 4–9 after Type A (hashed: never renumbered)', () => {
    expect(ShotKind).toEqual({
      Straight: 0,
      Double: 1,
      Laser: 2,
      Missile: 3,
      SpreadBomb: 4,
      TwoWay: 5,
      Torpedo: 6,
      FreeWay: 7,
      Ripple: 8,
      Twin: 9,
    });
    expect(ShotFlag.Blast).toBe(16);
    // The Tail Gun / Vertical are Double kinds, the Cyclone Laser a Laser kind.
    expect(WEAPON_BEHAVIOR_KINDS['shot.tailGun']).toBe(ShotKind.Double);
    expect(WEAPON_BEHAVIOR_KINDS['shot.vertical']).toBe(ShotKind.Double);
    expect(WEAPON_BEHAVIOR_KINDS['laser.cyclone']).toBe(ShotKind.Laser);
  });

  it('gives every behaviour one kind, slot list, label and tunables', () => {
    const ids = Object.keys(WEAPON_BEHAVIOR_KINDS).sort();
    // Types A–D (13) and the two Direct-mode behaviours of M2-05.
    expect(ids).toHaveLength(15);
    expect(WEAPON_SCRIPT_IDS).toEqual(ids);
    expect(Object.keys(WEAPON_BEHAVIOR_PARAMS).sort()).toEqual(ids);
    expect(Object.keys(WEAPON_BEHAVIOR_SLOTS).sort()).toEqual(ids);
    expect(Object.keys(WEAPON_BEHAVIOR_LABELS).sort()).toEqual(ids);
    for (const table of [
      WEAPON_BEHAVIOR_KINDS,
      WEAPON_BEHAVIOR_PARAMS,
      WEAPON_BEHAVIOR_SLOTS,
      WEAPON_BEHAVIOR_LABELS,
      WEAPON_SCRIPT_IDS,
    ]) {
      expect(Object.isFrozen(table)).toBe(true);
    }
    for (const id of ids) {
      expect(Object.isFrozen(WEAPON_BEHAVIOR_PARAMS[id]), id).toBe(true);
      // `direct.bolt` fires in a main-shot and a sub-weapon family (M2-05).
      expect(WEAPON_BEHAVIOR_SLOTS[id], id).toHaveLength(id === 'direct.bolt' ? 2 : 1);
    }
    // The slots of the M2-03 behaviours (shmup_feat.md §7A table).
    const slotOf = (id: string): string => WEAPON_BEHAVIOR_SLOTS[id][0];
    expect(['missile.spreadBomb', 'missile.twoWay', 'missile.torpedo'].map(slotOf)).toEqual([
      'missile',
      'missile',
      'missile',
    ]);
    expect(['shot.tailGun', 'shot.vertical', 'shot.freeWay'].map(slotOf)).toEqual([
      'double',
      'double',
      'double',
    ]);
    expect(['laser.ripple', 'laser.cyclone', 'laser.twin'].map(slotOf)).toEqual([
      'laser',
      'laser',
      'laser',
    ]);
    // Every label but the main shot's has a hud/meter-labels frame, no two alike.
    const labels = ids.map((id) => WEAPON_BEHAVIOR_LABELS[id]);
    expect(new Set(labels).size).toBe(labels.length);
    for (const id of ids) {
      // The meter's MISSILE / DOUBLE / LASER weapons name their slots (not the Direct-mode ones).
      if (WEAPON_BEHAVIOR_SLOTS[id][0] === 'main' || id.startsWith('direct.')) continue;
      expect(METER_LABEL_FRAMES, id).toContain(WEAPON_BEHAVIOR_LABELS[id]);
    }
    // The Ripple ring width is thinner than the ring can get.
    expect(RIPPLE_RING_WIDTH).toBeLessThan(WEAPON_BEHAVIOR_PARAMS['laser.ripple'].maxSize);
  });

  it('checkWeaponBehaviors flags an M2-03 behaviour in the wrong slot or with a foreign tunable', () => {
    const { db } = loadContent([
      shipped('player/kestrel.player.json'),
      {
        path: 'weapons/bad.weapons.json',
        data: {
          formatVersion: 1,
          kind: 'weapons',
          weapons: [
            weapon('b.bomb', 'laser', 'missile.spreadBomb'),
            weapon('b.twin', 'laser', 'laser.twin', { params: { gravity: 1, gap: 4 } }),
            weapon('b.free', 'double', 'shot.freeWay', { params: { angle: 64 } }),
            weapon('b.ripple', 'main', 'laser.ripple', { params: { blastRadius: 2 } }),
          ],
        },
      },
    ]);
    const issues = checkWeaponBehaviors(db);
    expect(issues.map((i) => i.path)).toEqual([
      'weapons:b.bomb.slot',
      'weapons:b.twin.params.gravity',
      'weapons:b.ripple.params.blastRadius',
      'weapons:b.ripple.slot',
    ]);
    expect(issues[0].message).toMatch(/belongs in slot missile/);
    expect(issues[1].message).toMatch(/maxLength, gap, ox, oy, hh/);
  });
});

describe('core/weapons arsenal edges (M2-03): resolveArsenal and the select lists', () => {
  it('reports the first bad slot of a Weapon Edit, missile first', () => {
    const edit = { missile: 'missile.spread', double: 'shot.tail', laser: 'laser.ripple' };
    const arsenal = (over: Partial<typeof edit>): unknown =>
      resolveArsenal(DB, { weaponPreset: 'type-a', weaponEdit: { ...edit, ...over } });
    expect(() => arsenal({ missile: 'shot.basic' })).toThrow(
      'GameConfig.weaponEdit.missile: weapon "shot.basic" belongs in slot main',
    );
    expect(() => arsenal({ double: 'laser.twin', laser: 'nope' })).toThrow(
      /weaponEdit\.double: weapon "laser\.twin" belongs in slot laser/,
    );
    expect(() => arsenal({ laser: 'nope' })).toThrow(
      'GameConfig.weaponEdit.laser: no weapon "nope" in the content',
    );
    expect(() => arsenal({ missile: 'nope', laser: 'nope' })).toThrow(/weaponEdit\.missile/);
    for (const over of [{ missile: 'shot.basic' }, { laser: 'nope' }]) {
      expect(() => arsenal(over)).toThrow(RangeError);
    }
  });

  it('keeps the preset`s main shot under a Weapon Edit, and returns a new list each call', () => {
    const edit = { missile: 'missile.torpedo', double: 'shot.double', laser: 'laser.pierce' };
    const a = resolveArsenal(DB, { weaponPreset: 'type-c', weaponEdit: edit });
    expect(a.map((w) => w?.id)).toEqual([
      'shot.basic',
      'shot.double',
      'laser.pierce',
      'missile.torpedo',
    ]);
    // Edited weapons are the content's own specs.
    expect(a[WeaponRole.Missile]).toBe(DB.weapons[DB.weaponIndex.get('missile.torpedo')!]);
    const b = resolveArsenal(DB, { weaponPreset: 'type-c', weaponEdit: edit });
    expect(b).not.toBe(a);
    expect(b).toEqual(a);
    // The preset's main shot wins over another main-slot weapon: the custom content's own preset.
    expect(
      resolveArsenal(CUSTOM, {
        weaponPreset: 'nope',
        weaponEdit: { missile: 'x.bomb', double: 'x.free1', laser: 'x.ripple' },
      }).map((w) => w?.id),
    ).toEqual(['x.main', 'x.free1', 'x.ripple', 'x.bomb']);
  });

  it('without presets: the first weapon of each slot, still editable; without weapons: empty or throws', () => {
    const { db } = loadContent([
      shipped('player/kestrel.player.json'),
      {
        path: 'weapons/np.weapons.json',
        data: {
          formatVersion: 1,
          kind: 'weapons',
          weapons: [
            weapon('n.laser2', 'laser', 'laser.cyclone'),
            weapon('n.main', 'main', 'shot.straight'),
            weapon('n.laser1', 'laser', 'laser.ripple'),
            weapon('n.missile', 'missile', 'missile.torpedo'),
          ],
        },
      },
    ]);
    expect(
      resolveArsenal(db, { weaponPreset: 'type-a', weaponEdit: null }).map((w) => w?.id ?? null),
    ).toEqual(['n.main', null, 'n.laser2', 'n.missile']);
    expect(() =>
      resolveArsenal(db, {
        weaponPreset: 'type-a',
        weaponEdit: { missile: 'n.missile', double: 'n.laser1', laser: 'n.laser1' },
      }),
    ).toThrow(/weaponEdit\.double: weapon "n\.laser1" belongs in slot laser/);
    // Without weapons every role is empty — and any Weapon Edit names a missing weapon.
    const empty = loadContent([]).db;
    expect(resolveArsenal(empty, { weaponPreset: 'type-a', weaponEdit: null })).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(() =>
      resolveArsenal(empty, {
        weaponPreset: 'type-a',
        weaponEdit: { missile: 'm', double: 'd', laser: 'l' },
      }),
    ).toThrow(/no weapon "m"/);
    expect(weaponsOfSlot(empty, 'laser')).toEqual([]);
  });

  it('weaponsOfSlot lists every preset`s weapons in content order; weaponLabel prefers the name', () => {
    expect(weaponsOfSlot(DB, 'double').map((w) => w.id)).toEqual([
      'shot.double',
      'shot.tail',
      'shot.vertical',
      'shot.free',
    ]);
    expect(weaponsOfSlot(DB, 'laser').map(weaponLabel)).toEqual([
      'LASER',
      'RIPPLE LASER',
      'CYCLONE LASER',
      'TWIN LASER',
    ]);
    expect(weaponsOfSlot(DB, 'main').map((w) => w.id)).toEqual(['shot.basic']);
    const list = weaponsOfSlot(DB, 'missile');
    list.pop();
    expect(weaponsOfSlot(DB, 'missile')).toHaveLength(4);
    expect(weaponLabel({ id: 'x.twin3' })).toBe('X.TWIN3');
    expect(weaponLabel({ id: 'a', name: 'NAMED' })).toBe('NAMED');
  });
});

describe('core/weapons arsenal edges (M2-03): spawn geometry', () => {
  it('Tail Gun / Vertical: the turned shot`s offsets, hitbox, velocity and sprite', () => {
    const b = world({ ...MANUAL, weaponPreset: 'type-b' });
    const [sx, sy] = [b.players[0].x, b.players[0].y];
    const tail = shotAt(b, b.weapons.spawnShot(WeaponRole.Double, 0, sx, sy));
    expect([tail.x, tail.y, tail.hw, tail.hh]).toEqual([sx - 6, sy, 4, 2]);
    expect(tail.vx).toBe(-7);
    expect(Math.abs(tail.vy)).toBeLessThan(1e-9);
    expect(tail.sprite).toBe(spriteId('shots/tail'));
    const c = world({ ...MANUAL, weaponPreset: 'type-c' });
    const up = shotAt(c, c.weapons.spawnShot(WeaponRole.Double, 0, sx, sy));
    expect([up.x, up.y, up.hw, up.hh]).toEqual([sx, sy - 6, 2, 4]);
    expect(up.vy).toBe(-7);
    expect(Math.abs(up.vx)).toBeLessThan(1e-9);
    expect(up.sprite).toBe(spriteId('shots/vertical'));
  });

  it('a pair`s forward shot is sized, placed and drawn like the main shot', () => {
    const w = world({ weaponPreset: 'type-c' }, 150, 100);
    w.weapons.loadouts[0].main = MainWeapon.Double;
    while (w.weapons.countShots(0, WeaponRole.Double) < 2) run(w, 1);
    const pair = shots(w, ShotKind.Double).filter((s) => s.age <= 1);
    expect(pair).toHaveLength(2);
    const forward = pair.find((s) => s.vx > 0)!;
    const turned = pair.find((s) => s.vy < 0)!;
    expect([forward.hw, forward.hh, forward.sprite]).toEqual([4, 2, spriteId('shots/basic')]);
    expect([turned.hw, turned.hh, turned.sprite]).toEqual([2, 4, spriteId('shots/vertical')]);
    expect(forward.vx).toBe(7);
  });

  it('2-Way, Torpedo, Spread Bomb, Ripple, Twin and Cyclone launch as tuned', () => {
    const [sx, sy] = [100, 100];
    // 2-Way: spawnShot fires the climbing one (45°, frame 0).
    const c = world({ ...MANUAL, weaponPreset: 'type-c' });
    const climb = shotAt(c, c.weapons.spawnShot(WeaponRole.Missile, 0, sx, sy));
    expect(climb.frame).toBe(0);
    expect(climb.vx).toBeCloseTo(3 * SQRT_HALF, 3);
    expect(climb.vy).toBeCloseTo(-3 * SQRT_HALF, 3);
    expect([climb.x, climb.y, climb.hw, climb.hh, climb.table]).toEqual([sx + 2, sy, 3, 3, 0]);
    // The Cyclone: a thicker piercing beam with a hit-cooldown table.
    const cyclone = shotAt(c, c.weapons.spawnShot(WeaponRole.Laser, 0, sx, sy));
    expect([cyclone.x, cyclone.y, cyclone.hh, cyclone.length]).toEqual([sx + 8, sy, 4, 0]);
    expect([cyclone.vx, cyclone.vy]).toEqual([10, 0]);
    expect(cyclone.flags).toBe(ShotFlag.Pierce);
    expect(cyclone.table).toBeGreaterThan(0);
    // Torpedo: falls 96 units (≈34°) below forward at 4 px/tick.
    const d = world({ ...MANUAL, weaponPreset: 'type-d' });
    const torpedo = shotAt(d, d.weapons.spawnShot(WeaponRole.Missile, 0, sx, sy));
    expect([torpedo.x, torpedo.y, torpedo.hw, torpedo.hh, torpedo.flags]).toEqual([
      sx,
      sy + 4,
      5,
      1.5,
      0,
    ]);
    expect(Math.hypot(torpedo.vx, torpedo.vy)).toBeCloseTo(4, 3);
    expect(torpedo.vy).toBeGreaterThan(0);
    expect(torpedo.vx).toBeGreaterThan(torpedo.vy);
    // Twin: spawnShot fires the upper beam of a pair, its lane kept in `vy`.
    const twin = shotAt(d, d.weapons.spawnShot(WeaponRole.Laser, 0, sx, sy));
    expect([twin.x, twin.y, twin.vx, twin.vy, twin.length, twin.hh]).toEqual([
      sx + 8,
      sy - 4,
      12,
      -4,
      0,
      1.5,
    ]);
    expect(twin.table).toBe(0);
    // Spread Bomb: 64 units below forward, not piercing until it bursts, its table reserved.
    const b = world({ ...MANUAL, weaponPreset: 'type-b' });
    const bomb = shotAt(b, b.weapons.spawnShot(WeaponRole.Missile, 0, sx, sy));
    expect([bomb.x, bomb.y, bomb.hw, bomb.hh, bomb.flags]).toEqual([sx + 2, sy + 4, 3, 3, 0]);
    expect(Math.hypot(bomb.vx, bomb.vy)).toBeCloseTo(2.5, 3);
    expect(bomb.vy).toBeGreaterThan(0);
    expect(bomb.table).toBeGreaterThan(0);
    // Ripple: a 4-px ring (half width 2) flying straight at 6 px/tick.
    const ring = shotAt(b, b.weapons.spawnShot(WeaponRole.Laser, 0, sx, sy));
    expect([ring.x, ring.y, ring.vx, ring.vy, ring.hw, ring.hh, ring.table]).toEqual([
      sx + 8,
      sy,
      6,
      0,
      2,
      4,
      0,
    ]);
  });
});

describe('core/weapons arsenal edges (M2-03): the Free Way heading', () => {
  it('maps every 8-way direction to its heading, kept after release', () => {
    const w = world({ ...MANUAL, weaponPreset: 'type-d' });
    const input = createInputSnapshot();
    for (const [held, heading, sx, sy] of [
      [Action.Up | Action.Left, 640, -1, -1],
      [Action.Up, 768, 0, -1],
      [Action.Up | Action.Right, 896, 1, -1],
      [Action.Left, 512, -1, 0],
      [Action.Right, 0, 1, 0],
      [Action.Down | Action.Left, 384, -1, 1],
      [Action.Down, 256, 0, 1],
      [Action.Down | Action.Right, 128, 1, 1],
    ] as const) {
      commitPlayerInput(input.players[0], held);
      run(w, 1, input);
      commitPlayerInput(input.players[0], 0);
      run(w, 1, input);
      expect(w.weapons.freeWayHeading[0], String(held)).toBe(heading);
      const ship = w.players[0];
      const s = shotAt(w, w.weapons.spawnShot(WeaponRole.Double, 0, ship.x, ship.y));
      const sign = (v: number): number => Math.sign(Math.round(v * 1e6));
      expect([sign(s.vx), sign(s.vy)], String(held)).toEqual([sx, sy]);
      expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(7, 3);
    }
    // Opposite directions cancel: no direction, the heading stays.
    commitPlayerInput(input.players[0], Action.Up | Action.Down);
    run(w, 1, input);
    expect(w.weapons.freeWayHeading[0]).toBe(128);
  });

  it('records directions only while the ship is alive, and the World hash sees it', () => {
    const w = createWorld(resolveGameConfig({ seed: 5, weaponPreset: 'type-d' }), DB);
    const input = createInputSnapshot();
    commitPlayerInput(input.players[0], Action.Down);
    let entering = 0;
    while (w.players[0].state !== 'alive') {
      expect(w.weapons.freeWayHeading[0]).toBe(-1);
      stepWorld(w, input);
      entering++;
    }
    expect(entering).toBeGreaterThan(2);
    // The fly-in's last step already counts (the ship is alive in that phase 2).
    expect(w.weapons.freeWayHeading[0]).toBe(256);
    killPlayer(w.players[0]);
    commitPlayerInput(input.players[0], Action.Left);
    for (let t = 0; t < 10; t++) stepWorld(w, input);
    expect(w.players[0].state).not.toBe('alive');
    expect(w.weapons.freeWayHeading[0]).toBe(256);
    // Player 2 (not in play) never records one.
    expect(w.weapons.freeWayHeading[1]).toBe(-1);
    // The heading is part of the World hash.
    const before = hashWorld(w);
    w.weapons.freeWayHeading[0] = 512;
    expect(hashWorld(w)).not.toBe(before);
    w.weapons.freeWayHeading[0] = 256;
    expect(hashWorld(w)).toBe(before);
  });

  it('a non-Free-Way Double ignores the heading', () => {
    const w = world({ ...MANUAL, weaponPreset: 'type-a' });
    w.weapons.freeWayHeading[0] = 256;
    const s = shotAt(w, w.weapons.spawnShot(WeaponRole.Double, 0, 100, 100));
    expect(s.vx).toBeGreaterThan(0);
    expect(s.vy).toBeLessThan(0);
  });
});

describe('core/weapons arsenal edges (M2-03): Spread Bomb', () => {
  it('holds a hit-cooldown table while falling: 32 bombs exhaust them, other shots still fire', () => {
    const w = world({ ...MANUAL, weaponPreset: 'type-b' });
    const slots: number[] = [];
    for (let k = 0; k < PIERCE_TABLES; k++) {
      slots.push(w.weapons.spawnShot(WeaponRole.Missile, 0, 100, 20));
    }
    expect(slots.every((i) => i >= 0)).toBe(true);
    const tables = new Set(slots.map((i) => w.weapons.pool.fields.table[i]));
    expect(tables.size).toBe(PIERCE_TABLES);
    expect(w.weapons.spawnShot(WeaponRole.Missile, 0, 100, 20)).toBe(-1);
    // A Tail Gun shot needs no table; a piercing beam would.
    expect(w.weapons.spawnShot(WeaponRole.Double, 0, 100, 20)).toBeGreaterThanOrEqual(0);
    // setArsenal clears them: a piercing Cyclone finds a table again.
    w.weapons.setArsenal(resolveArsenal(DB, { weaponPreset: 'type-c', weaponEdit: null }));
    expect(w.weapons.spawnShot(WeaponRole.Laser, 0, 100, 20)).toBeGreaterThanOrEqual(0);
  });

  it('bursts with an explosion sound and particles; its frames run 0–3 over the 12 ticks', () => {
    const w = world({ ...MANUAL, stage: 't', weaponPreset: 'type-b' }, 40, 150);
    w.weapons.spawnShot(WeaponRole.Missile, 0, w.players[0].x, w.players[0].y);
    let burst: SimEvent[] = [];
    for (let t = 0; t < 60; t++) {
      const events = stepEvents(w);
      const [bomb] = shots(w, ShotKind.SpreadBomb);
      if ((bomb.flags & ShotFlag.Blast) !== 0) {
        burst = events;
        break;
      }
    }
    const [blast] = shots(w, ShotKind.SpreadBomb);
    expect(blast.frame).toBe(0);
    expect(blast.age).toBe(0);
    expect(
      burst.some((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.EnemyExplodeSmall),
    ).toBe(true);
    const particles = burst.find((e) => e.kind === SimEventKind.Particles);
    expect(particles).toMatchObject({
      id: FX_CUES.ExplosionSmall,
      x: Math.floor(blast.x),
      y: Math.floor(blast.y),
    });
    const frames: number[] = [];
    for (;;) {
      run(w, 1);
      const [now] = shots(w, ShotKind.SpreadBomb);
      if (now === undefined) break;
      frames.push(now.frame);
    }
    expect(frames).toEqual([0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
  });

  it('rides the camera while falling; the blast stays put in the world as the view scrolls', () => {
    const w = world({ ...MANUAL, stage: 's', weaponPreset: 'type-b' }, 40, 150);
    expect(w.camera.vx).toBe(1);
    w.weapons.spawnShot(WeaponRole.Missile, 0, w.players[0].x, w.players[0].y);
    let previous = shots(w, ShotKind.SpreadBomb)[0];
    for (let t = 0; t < 60; t++) {
      run(w, 1);
      const [bomb] = shots(w, ShotKind.SpreadBomb);
      if ((bomb.flags & ShotFlag.Blast) !== 0) break;
      // Screen-relative flight: the camera's 1 px plus its own vx.
      expect(bomb.x - previous.x).toBeCloseTo(1 + previous.vx, 9);
      previous = bomb;
    }
    const [blast] = shots(w, ShotKind.SpreadBomb);
    expect(blast.flags & ShotFlag.Blast).toBe(ShotFlag.Blast);
    const camera = w.camera.x;
    run(w, 6);
    expect(w.camera.x).toBe(camera + 6);
    expect(shots(w, ShotKind.SpreadBomb)[0].x).toBe(blast.x);
  });

  it('without terrain or targets it falls out of the view and is removed unburst', () => {
    const w = world({ ...MANUAL, weaponPreset: 'type-b' }, 40, 150);
    w.weapons.spawnShot(WeaponRole.Missile, 0, w.players[0].x, w.players[0].y);
    let ticks = 0;
    while (shots(w, ShotKind.SpreadBomb).length > 0 && ticks < 200) {
      expect(shots(w, ShotKind.SpreadBomb)[0].flags & ShotFlag.Blast).toBe(0);
      run(w, 1);
      ticks++;
    }
    expect(ticks).toBeLessThan(200);
    expect(w.weapons.count).toBe(0);
  });

  it('bursts on armour without a clink; the blast then clinks and burns on', () => {
    const w = world({ ...MANUAL, weaponPreset: 'type-b' }, 40, 100);
    const armour = spawnAt(w, 'armor', w.camera.x + 60, w.camera.y + 104);
    armour.flags |= EnemyFlag.Invulnerable;
    w.weapons.spawnShot(WeaponRole.Missile, 0, w.players[0].x, w.players[0].y);
    let clinks = 0;
    let burstAt = -1;
    let gone = -1;
    for (let t = 0; t < 40; t++) {
      const events = stepEvents(w);
      clinks += events.filter((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.Clink).length;
      const [bomb] = shots(w, ShotKind.SpreadBomb);
      if (bomb !== undefined && (bomb.flags & ShotFlag.Blast) !== 0 && burstAt < 0) {
        burstAt = t;
        expect(clinks).toBe(0);
      }
      if (bomb === undefined && burstAt >= 0 && gone < 0) gone = t;
    }
    expect(burstAt).toBeGreaterThanOrEqual(0);
    // The blast outlives its clinks (12 ticks; hit at most every 6).
    expect(gone - burstAt).toBe(12);
    expect(clinks).toBe(2);
    expect(armour.hp).toBe(5);
  });

  it('clamps its tunables: a blast of 0 ticks lasts one, a 300-tick cooldown 255', () => {
    const w = world(
      {
        ...MANUAL,
        stage: 't',
        weaponPreset: 'x-a',
        weaponEdit: { missile: 'x.bomb', double: 'x.tail1', laser: 'x.twin3' },
      },
      40,
      150,
      CUSTOM,
    );
    w.weapons.spawnShot(WeaponRole.Missile, 0, w.players[0].x, w.players[0].y);
    let blastTicks = 0;
    for (let t = 0; t < 80; t++) {
      run(w, 1);
      const [bomb] = shots(w, ShotKind.SpreadBomb);
      if (bomb === undefined) break;
      if ((bomb.flags & ShotFlag.Blast) !== 0) blastTicks++;
    }
    expect(blastTicks).toBe(1);
  });
});

describe('core/weapons arsenal edges (M2-03): Photon Torpedo', () => {
  it('flies on through a kill in the air; armour stops it with a clink', () => {
    const w = world({ ...MANUAL, weaponPreset: 'type-d' }, 40, 60);
    const ship = w.players[0];
    const s = shotAt(w, w.weapons.spawnShot(WeaponRole.Missile, 0, ship.x, ship.y));
    // In its path after 5 and 12 ticks of flight (no terrain: it never slides).
    const first = spawnAt(w, 'weak', s.x + 5 * s.vx, s.y + 5 * s.vy);
    const armour = spawnAt(w, 'armor', s.x + 12 * s.vx, s.y + 12 * s.vy);
    armour.flags |= EnemyFlag.Invulnerable;
    const beyond = spawnAt(w, 'weak', s.x + 18 * s.vx, s.y + 18 * s.vy);
    let clinks = 0;
    for (let t = 0; t < 30; t++) {
      const events = stepEvents(w);
      clinks += events.filter((e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.Clink).length;
      const [torpedo] = shots(w, ShotKind.Torpedo);
      if (torpedo !== undefined) expect(torpedo.flags & ShotFlag.Sliding).toBe(0);
    }
    expect(first.hp).toBeLessThanOrEqual(0);
    expect(armour.hp).toBe(5);
    expect(clinks).toBe(1);
    expect(beyond.hp).toBe(1);
    expect(shots(w, ShotKind.Torpedo)).toEqual([]);
  });

  it('animates two frames, 4 ticks each, and is culled when it falls out of the view', () => {
    const w = world({ ...MANUAL, weaponPreset: 'type-d' }, 40, 100);
    w.weapons.spawnShot(WeaponRole.Missile, 0, w.players[0].x, w.players[0].y);
    const frames: number[] = [];
    for (let t = 0; t < 12; t++) {
      run(w, 1);
      frames.push(shots(w, ShotKind.Torpedo)[0].frame);
    }
    expect(frames).toEqual([0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1]);
    run(w, 100);
    expect(shots(w, ShotKind.Torpedo)).toEqual([]);
  });
});

describe('core/weapons arsenal edges (M2-03): the Ripple ring`s edges', () => {
  /**
   * A Type B world with one full-grown Ripple (half height 20, half width 10) whose centre will be
   * at (`cx`, `cy`) in the next tick's collision.
   *
   * @returns The world and the ring's next centre.
   */
  const grown = (): { w: World; cx: number; cy: number } => {
    const w = world({ ...MANUAL, weaponPreset: 'type-b' }, 40, 100);
    const i = w.weapons.spawnShot(WeaponRole.Laser, 0, w.players[0].x, w.players[0].y);
    w.weapons.pool.fields.age[i] = 100;
    return { w, cx: w.weapons.pool.fields.x[i] + 6, cy: w.weapons.pool.fields.y[i] };
  };

  /**
   * Whether a target at an offset from the ring's next centre is hit by it.
   *
   * @param dx - X offset of the target's centre.
   * @param dy - Y offset.
   * @returns Whether it lost hp (and the ring is gone).
   */
  const hits = (dx: number, dy: number): boolean => {
    const { w, cx, cy } = grown();
    const e = spawnAt(w, 'target', cx + dx, cy + dy);
    run(w, 1);
    const ring = shots(w, ShotKind.Ripple);
    const hit = e.hp < 1000;
    // A non-piercing ring dies on its hit.
    expect(ring.length, `${dx},${dy}`).toBe(hit ? 0 : 1);
    if (!hit) expect([ring[0].hh, ring[0].hw]).toEqual([20, 10]);
    return hit;
  };

  it('misses a target wholly inside the inner edge, hits one reaching into the ring band', () => {
    expect(hits(0, 0)).toBe(false);
    expect(hits(0, 9.8)).toBe(false); // farthest corner √(8² + 13.8²) < 16 = 20 − ring width
    expect(hits(0, 10)).toBe(true); // √(8² + 14²) ≥ 16
    expect(hits(0, -10)).toBe(true);
    expect(hits(0, 14)).toBe(true);
  });

  it('is closed at the outer edge (vertically and horizontally, the width half the height)', () => {
    expect(hits(0, 24)).toBe(true); // the box's top edge on the ring's bottom
    expect(hits(0, 24.5)).toBe(false);
    expect(hits(14, 0)).toBe(true); // half width 10 + the box's 4
    expect(hits(-14, 0)).toBe(true);
    expect(hits(14.5, 0)).toBe(false);
    // A corner beyond the ellipse while inside its bounding box: missed.
    expect(hits(12, 20)).toBe(false);
  });

  it('hits only the lowest slot of two targets on the ring', () => {
    const { w, cx, cy } = grown();
    const a = spawnAt(w, 'target', cx, cy - 18);
    const b = spawnAt(w, 'target', cx, cy + 18);
    run(w, 1);
    const [low, high] = a.slot < b.slot ? [a, b] : [b, a];
    expect([low.hp, high.hp]).toEqual([999, 1000]);
    expect(shots(w, ShotKind.Ripple)).toEqual([]);
  });

  it('a maxSize below startSize holds the ring at startSize (frame 0), growth taken as a magnitude', () => {
    const w = world(
      {
        ...MANUAL,
        weaponPreset: 'x-a',
        weaponEdit: { missile: 'x.twoWay1', double: 'x.tail1', laser: 'x.ripple' },
      },
      40,
      100,
      CUSTOM,
    );
    w.weapons.spawnShot(WeaponRole.Laser, 0, w.players[0].x, w.players[0].y);
    for (let t = 0; t < 10; t++) {
      run(w, 1);
      const [ring] = shots(w, ShotKind.Ripple);
      expect([ring.hh, ring.hw, ring.frame]).toEqual([6, 3, 0]);
    }
  });
});

describe('core/weapons arsenal edges (M2-03): caps below a pair', () => {
  it('a Double-kind or Free Way of cap 1 fires only its forward shot', () => {
    for (const double of ['x.tail1', 'x.free1']) {
      const w = world(
        { weaponPreset: 'x-a', weaponEdit: { missile: 'x.twoWay1', double, laser: 'x.twin3' } },
        150,
        100,
        CUSTOM,
      );
      w.weapons.loadouts[0].main = MainWeapon.Double;
      let most = 0;
      for (let t = 0; t < 60; t++) {
        run(w, 1);
        const n = w.weapons.countShots(0, WeaponRole.Double);
        most = Math.max(most, n);
        const kind = double === 'x.tail1' ? ShotKind.Double : ShotKind.FreeWay;
        for (const s of shots(w, kind)) expect(s.vx, double).toBeGreaterThan(0);
      }
      expect(most, double).toBe(1);
    }
  });

  it('a 2-Way of cap 1 fires only the climbing missile', () => {
    const w = world({ weaponPreset: 'x-a' }, 100, 150, CUSTOM);
    w.weapons.loadouts[0].missile = true;
    let volleys = 0;
    let previous = 0;
    for (let t = 0; t < 200; t++) {
      run(w, 1);
      const live = shots(w, ShotKind.TwoWay);
      expect(live.length).toBeLessThanOrEqual(1);
      if (live.length > previous) {
        volleys++;
        expect(live[0].vy).toBeLessThan(0);
        expect(live[0].frame).toBe(0);
      }
      previous = live.length;
    }
    expect(volleys).toBeGreaterThanOrEqual(2);
  });

  it('a Twin Laser of cap 3 keeps one pair; of cap 1 a single beam on the shooter`s row', () => {
    const w3 = world({ weaponPreset: 'x-a' }, 30, 100, CUSTOM);
    w3.weapons.loadouts[0].main = MainWeapon.Laser;
    let most = 0;
    for (let t = 0; t < 60; t++) {
      run(w3, 1);
      const beams = shots(w3, ShotKind.Twin);
      most = Math.max(most, beams.length);
      for (const beam of beams) expect(Math.abs(beam.y - w3.players[0].y)).toBe(4);
    }
    expect(most).toBe(2);
    const w1 = world(
      {
        weaponPreset: 'x-a',
        weaponEdit: { missile: 'x.twoWay1', double: 'x.tail1', laser: 'x.twin1' },
      },
      30,
      100,
      CUSTOM,
    );
    w1.weapons.loadouts[0].main = MainWeapon.Laser;
    most = 0;
    for (let t = 0; t < 60; t++) {
      run(w1, 1);
      const beams = shots(w1, ShotKind.Twin);
      most = Math.max(most, beams.length);
      for (const beam of beams) {
        expect(beam.y).toBe(w1.players[0].y);
        expect(beam.vy).toBe(0);
      }
    }
    expect(most).toBe(1);
  });
});

describe('core/weapons arsenal edges (M2-03): beams', () => {
  it('Twin Laser: a beam whose row is in the floor is blocked at once and vanishes', () => {
    const w = world({ ...MANUAL, stage: 't', weaponPreset: 'type-d' }, 40, 164);
    const ship = w.players[0];
    w.weapons.loadouts[0].main = MainWeapon.Laser;
    // One held tick of Shot fires one pair: the upper beam (row 160) flies, its lower twin (row
    // 168) is in the floor (its surface).
    const input = createInputSnapshot();
    commitPlayerInput(input.players[0], Action.Shot);
    run(w, 1, input);
    const pair = shots(w, ShotKind.Twin);
    expect(pair).toHaveLength(2);
    const lower = pair.find((s) => s.vy > 0)!;
    const upper = pair.find((s) => s.vy < 0)!;
    expect([lower.y, upper.y]).toEqual([ship.y + 4, ship.y - 4]);
    expect(lower.flags & ShotFlag.Blocked).toBe(ShotFlag.Blocked);
    expect(lower.length).toBe(1);
    expect(upper.flags & ShotFlag.Blocked).toBe(0);
    expect(upper.length).toBe(12);
    commitPlayerInput(input.players[0], 0);
    run(w, 1, input);
    const beams = shots(w, ShotKind.Twin);
    expect(beams).toHaveLength(1);
    expect(beams[0].y).toBe(ship.y - 4);
    expect(beams[0].length).toBe(16);
  });

  it('Twin Laser: each beam draws ceil(length / 8) segments; Cyclone segments step the swirl frames', () => {
    const d = world({ ...MANUAL, weaponPreset: 'type-d' }, 40, 100);
    d.weapons.spawnShot(WeaponRole.Laser, 0, d.players[0].x, d.players[0].y);
    run(d, 1); // length 12 → 2 segments
    expect(shots(d, ShotKind.Twin)[0].length).toBe(12);
    expect(d.weapons.batch.count).toBe(2);
    const c = world({ ...MANUAL, weaponPreset: 'type-c' }, 40, 100);
    const i = c.weapons.spawnShot(WeaponRole.Laser, 0, c.players[0].x, c.players[0].y);
    run(c, 12);
    const beam = shotAt(c, i);
    expect([beam.length, beam.age]).toEqual([80, 12]);
    const batch = c.weapons.batch;
    const segments = Math.ceil(80 / LASER_SEGMENT_LENGTH);
    const frames: number[] = [];
    const xs: number[] = [];
    for (let s = 0; s < batch.count; s++) {
      if (batch.spriteId[s] !== spriteId('shots/cyclone')) continue;
      frames.push(batch.frame[s]);
      xs.push(batch.x[s]);
    }
    // phase = age >> 2 = 3: frame (3 + s) % 4 for s = 1 … 10, laid back from the head.
    expect(frames).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1]);
    expect(xs).toHaveLength(segments);
    expect(xs[0]).toBe(beam.x - LASER_SEGMENT_LENGTH);
    expect(xs[segments - 1]).toBe(beam.x - 80);
    // The Type A beam has one frame: every segment frame 0.
    const a = world({ ...MANUAL, weaponPreset: 'type-a' }, 40, 100);
    a.weapons.spawnShot(WeaponRole.Laser, 0, a.players[0].x, a.players[0].y);
    run(a, 12);
    for (let s = 0; s < a.weapons.batch.count; s++) expect(a.weapons.batch.frame[s]).toBe(0);
  });
});

describe('core/weapons arsenal edges (M2-03): setArsenal', () => {
  it('restarts every timer, forgets the counts and hits, ignores extra entries', () => {
    const w = world({ loadout: 'full', weaponPreset: 'type-b' }, 60, 100);
    spawnAt(w, 'target', w.camera.x + 120, w.camera.y + 100);
    run(w, 20);
    expect(Array.from(w.weapons.timers).some((t) => t > 0)).toBe(true);
    const d = resolveArsenal(DB, { weaponPreset: 'type-d', weaponEdit: null });
    w.weapons.setArsenal([...d, d[0], null]);
    expect(Array.from(w.weapons.timers).every((t) => t === 0)).toBe(true);
    expect(Array.from(w.weapons.liveCounts).every((n) => n === 0)).toBe(true);
    expect([w.weapons.count, w.weapons.hitCount, w.weapons.batch.count]).toEqual([0, 0, 0]);
    expect(w.weapons.roleWeapons).toHaveLength(4);
    // The next tick fires at once (timers 0): every shooter's main weapon and missile.
    run(w, 1);
    expect(w.weapons.countShots(0, WeaponRole.Laser)).toBe(2);
    expect(w.weapons.countShots(0, WeaponRole.Missile)).toBe(1);
  });

  it('`undefined` and missing entries empty their roles; an empty main role never fires', () => {
    const w = world({ weaponPreset: 'type-b' }, 60, 100);
    const b = resolveArsenal(DB, { weaponPreset: 'type-b', weaponEdit: null });
    w.weapons.setArsenal([undefined as never, b[1]]);
    expect(w.weapons.roleWeapons.map((r) => r?.id ?? null)).toEqual([
      null,
      'shot.tail',
      null,
      null,
    ]);
    // Basic main shot on an empty main role: nothing; the Double still fires its pair.
    run(w, 20);
    expect(w.weapons.count).toBe(0);
    w.weapons.loadouts[0].main = MainWeapon.Double;
    run(w, 5);
    expect(w.weapons.countShots(0, WeaponRole.Double)).toBe(2);
    // Laser on an empty Laser role falls back to the (empty) main role: nothing more.
    w.weapons.loadouts[0].main = MainWeapon.Laser;
    w.weapons.setArsenal([undefined as never, b[1]]);
    run(w, 20);
    expect(w.weapons.count).toBe(0);
    expect(w.weapons.spawnShot(WeaponRole.Main, 0, 100, 100)).toBe(-1);
  });
});
