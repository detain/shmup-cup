/**
 * `core/weapons` — the meter arsenal of plan M2-03 inside a World (acceptance: "each behaviour's
 * caps / hit rules"): the Types B–D presets and Weapon Edit (`resolveArsenal`), the Spread Bomb
 * (arc, burst on terrain or contact, a world-anchored blast that hits each target at most twice,
 * armour does not stop it), the 2-Way Missile (a climbing and a diving missile, one volley at a
 * time), the Photon Torpedo (ground slider that flies on through what it destroys), the Tail Gun
 * and the Vertical (Double pairs turned back / up), the Free Way (the last 8-way direction held),
 * the Ripple (a growing, non-piercing ring whose ring — not its box — hits), the Cyclone Laser
 * (a thicker piercing beam with swirling segments) and the Twin Laser (beam pairs that follow the
 * shooter), Options copying them with their own caps, `setArsenal` and determinism. The
 * allocation guard lives in `weapons-arsenal-alloc.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { EnemyFlag, type Enemy } from '../../src/enemies/index.js';
import {
  Action,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import {
  MainWeapon,
  RIPPLE_RING_WIDTH,
  SHOOTERS_PER_PLAYER,
  SPREAD_BLAST_SPRITE,
  ShotFlag,
  ShotKind,
  WEAPON_BEHAVIOR_LABELS,
  WEAPON_BEHAVIOR_PARAMS,
  WEAPON_SPRITES,
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
 * An enemy entry: a scriptless flying target that stays where it spawns.
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
 * Test content: the KESTREL, the shipped Type A and Types B–D weapons, the shipped tileset, test
 * enemies (`target` 1000 hp, `weak` 1 hp, `armor`) and a static stage `t` with a flat floor 32 px
 * high (its surface at y 168).
 */
const DB: ContentDb = ((): ContentDb => {
  const files: ContentFile[] = [
    shipped('player/kestrel.player.json'),
    shipped('tilesets/terrain-a.tileset.json'),
    shipped('weapons/type-a.weapons.json'),
    shipped('weapons/types-b-d.weapons.json'),
    {
      path: 'enemies/t.enemies.json',
      data: {
        formatVersion: 1,
        kind: 'enemies',
        enemies: [enemy('target'), enemy('weak', { hp: 1 }), enemy('armor', { hp: 5 })],
      },
    },
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
  ];
  const { db, issues } = loadContent(files, { extraSprites: ENGINE_SPRITES });
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
 * @returns The world.
 */
function world(config: Partial<GameConfig> = {}, x = 40, y = 100): World {
  const w = createWorld(resolveGameConfig({ seed: 5, ...config }), DB);
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  w.players[0].x = w.camera.x + x;
  w.players[0].y = w.camera.y + y;
  w.events.clear();
  return w;
}

/**
 * Steps a world.
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
 * Spawns a test enemy at a view position.
 *
 * @param w - The world.
 * @param id - Enemy id.
 * @param x - X relative to the camera.
 * @param y - Y relative to the camera.
 * @returns The enemy.
 */
function spawn(w: World, id: string, x: number, y: number): Enemy {
  const e = w.enemies.spawn(w.content.enemyIndex.get(id)!, w.camera.x + x, w.camera.y + y);
  expect(e).not.toBeNull();
  return e!;
}

/** A live shot as a plain record. */
interface ShotRecord {
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
  readonly shooter: number;
  readonly role: number;
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
    if ((f.flags[i] & ShotFlag.Dead) !== 0 || f.kind[i] !== kind) continue;
    out.push({
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
      shooter: f.shooter[i],
      role: f.role[i],
    });
  }
  return out;
}

/**
 * The ids of a World's role weapons.
 *
 * @param w - The world.
 * @returns Ids in `WeaponRole` order (`null` for an empty role).
 */
function roleIds(w: World): (string | null)[] {
  return w.weapons.roleWeapons.map((spec) => spec?.id ?? null);
}

describe('core/weapons arsenal (M2-03): presets and Weapon Edit', () => {
  it('ships Types B–D as presets over the Types B–D behaviours, all valid', () => {
    expect(checkWeaponBehaviors(DB)).toEqual([]);
    expect(DB.weaponPresets.map((p) => p.id)).toEqual(['type-a', 'type-b', 'type-c', 'type-d']);
    const ids = (preset: string): (string | null)[] =>
      resolveArsenal(DB, { weaponPreset: preset, weaponEdit: null }).map((w) => w?.id ?? null);
    // WeaponRole order: main, Double slot, Laser slot, Missile slot (shmup_feat.md §7A table).
    expect(ids('type-a')).toEqual(['shot.basic', 'shot.double', 'laser.pierce', 'missile.ground']);
    expect(ids('type-b')).toEqual(['shot.basic', 'shot.tail', 'laser.ripple', 'missile.spread']);
    expect(ids('type-c')).toEqual([
      'shot.basic',
      'shot.vertical',
      'laser.cyclone',
      'missile.twoWay',
    ]);
    expect(ids('type-d')).toEqual(['shot.basic', 'shot.free', 'laser.twin', 'missile.torpedo']);
    // A preset the content lacks falls back to its first one.
    expect(ids('type-z')).toEqual(ids('type-a'));
    // The weapon select's names and lists.
    expect(weaponsOfSlot(DB, 'missile').map(weaponLabel)).toEqual([
      'MISSILE',
      'SPREAD BOMB',
      '2-WAY MISSILE',
      'PHOTON TORPEDO',
    ]);
    expect(weaponLabel({ id: 'x.y' })).toBe('X.Y');
    // Every behaviour has a meter label, and the blast is an engine sprite.
    expect(Object.keys(WEAPON_BEHAVIOR_LABELS).sort()).toEqual(
      Object.keys(WEAPON_BEHAVIOR_PARAMS).sort(),
    );
    expect(WEAPON_SPRITES).toEqual([SPREAD_BLAST_SPRITE]);
    expect(ENGINE_SPRITES).toContain(SPREAD_BLAST_SPRITE);
  });

  it('Weapon Edit picks each slot among every preset`s weapons; bad edits throw', () => {
    const edit = { missile: 'missile.torpedo', double: 'shot.tail', laser: 'laser.cyclone' };
    const w = world({ weaponPreset: 'type-c', weaponEdit: edit });
    expect(roleIds(w)).toEqual(['shot.basic', 'shot.tail', 'laser.cyclone', 'missile.torpedo']);
    expect(() =>
      createWorld(resolveGameConfig({ weaponEdit: { ...edit, missile: 'nope' } }), DB),
    ).toThrow(/no weapon "nope"/);
    expect(() =>
      createWorld(resolveGameConfig({ weaponEdit: { ...edit, laser: 'shot.tail' } }), DB),
    ).toThrow(/belongs in slot double/);
  });

  it('setArsenal swaps the weapons in place and removes every shot', () => {
    const w = world({ loadout: 'full' });
    run(w, 30);
    expect(w.weapons.count).toBeGreaterThan(0);
    const roles = w.weapons.roleWeapons;
    w.weapons.setArsenal(resolveArsenal(DB, { weaponPreset: 'type-d', weaponEdit: null }));
    expect(w.weapons.roleWeapons).toBe(roles);
    expect(roleIds(w)).toEqual(['shot.basic', 'shot.free', 'laser.twin', 'missile.torpedo']);
    expect(w.weapons.count).toBe(0);
    run(w, 10);
    expect(shots(w, ShotKind.Twin).length).toBeGreaterThan(0);
    expect(shots(w, ShotKind.Laser)).toEqual([]);
    // Missing and empty roles.
    w.weapons.setArsenal([null]);
    run(w, 10);
    expect(roleIds(w)).toEqual([null, null, null, null]);
    expect(w.weapons.count).toBe(0);
  });
});

describe('core/weapons arsenal (M2-03): missile slot', () => {
  it('Spread Bomb: falls in an arc, bursts on the floor into a blast that burns 12 ticks', () => {
    const w = world({ ...MANUAL, stage: 't', weaponPreset: 'type-b' }, 40, 100);
    w.weapons.spawnShot(WeaponRole.Missile, 0, w.players[0].x, w.players[0].y);
    const falls: ShotRecord[] = [];
    let blast: ShotRecord | undefined;
    let blastTick = -1;
    for (let t = 0; t < 120 && blast === undefined; t++) {
      run(w, 1);
      const [bomb] = shots(w, ShotKind.SpreadBomb);
      expect(bomb).toBeDefined();
      if ((bomb.flags & ShotFlag.Blast) !== 0) {
        blast = bomb;
        blastTick = t;
      } else {
        falls.push(bomb);
      }
    }
    expect(blast).toBeDefined();
    // An arc: it keeps flying forward while its fall speeds up.
    expect(falls.length).toBeGreaterThan(5);
    for (let k = 1; k < falls.length; k++) {
      expect(falls[k].x).toBeGreaterThan(falls[k - 1].x);
      expect(falls[k].vy).toBeGreaterThan(falls[k - 1].vy);
    }
    // It burst where it met the floor (y 168): a piercing 28×28 blast drawn with the blast sprite.
    const b = blast!;
    expect(b.y + 3).toBeGreaterThanOrEqual(168);
    expect(b.y).toBeLessThan(172);
    expect(b.flags & ShotFlag.Pierce).toBe(ShotFlag.Pierce);
    expect([b.hw, b.hh, b.vx, b.vy]).toEqual([14, 14, 0, 0]);
    expect(b.sprite).toBe(DB.sprites.index.get(SPREAD_BLAST_SPRITE));
    // World-anchored and gone after 12 ticks; the next bomb waits for it (cap 1).
    let ticks = 0;
    while (shots(w, ShotKind.SpreadBomb).length > 0) {
      const [now] = shots(w, ShotKind.SpreadBomb);
      expect([now.x, now.y]).toEqual([b.x, b.y]);
      run(w, 1);
      ticks++;
    }
    expect(ticks).toBe(12);
    expect(blastTick).toBeGreaterThan(0);
  });

  it('Spread Bomb: bursts on contact without damage; its blast hits each target at most twice', () => {
    const b = world({ ...MANUAL, weaponPreset: 'type-b' }, 40, 100);
    const hit = spawn(b, 'target', 60, 104);
    const side = spawn(b, 'target', 70, 116);
    const out = spawn(b, 'target', 120, 104);
    b.weapons.spawnShot(WeaponRole.Missile, 0, b.players[0].x, b.players[0].y);
    let burst = -1;
    for (let t = 0; t < 60; t++) {
      run(b, 1);
      const [bomb] = shots(b, ShotKind.SpreadBomb);
      if (bomb !== undefined && (bomb.flags & ShotFlag.Blast) !== 0 && burst < 0) {
        burst = t;
        // The bomb itself did no damage.
        expect(hit.hp).toBe(1000);
      }
    }
    expect(burst).toBeGreaterThanOrEqual(0);
    // Damage 2 per hit, at most two hits per target in the blast's 12 ticks (cooldown 6).
    expect(hit.hp).toBe(1000 - 4);
    expect(side.hp).toBe(1000 - 4);
    expect(out.hp).toBe(1000);
    expect(shots(b, ShotKind.SpreadBomb)).toEqual([]);
  });

  it('Spread Bomb: armour clinks but does not put the blast out', () => {
    const w = world({ ...MANUAL, weaponPreset: 'type-b' }, 40, 100);
    const armour = spawn(w, 'armor', 60, 104);
    armour.flags |= EnemyFlag.Invulnerable;
    const behind = spawn(w, 'target', 64, 112);
    w.weapons.spawnShot(WeaponRole.Missile, 0, w.players[0].x, w.players[0].y);
    run(w, 30);
    expect(armour.hp).toBe(5);
    expect(behind.hp).toBe(1000 - 4);
  });

  it('2-Way Missile: a climbing and a diving missile, one volley at a time', () => {
    const w = world({ weaponPreset: 'type-c' }, 60, 100);
    w.weapons.loadouts[0].missile = true;
    let volleys = 0;
    let previous = 0;
    for (let t = 0; t < 300; t++) {
      run(w, 1);
      const n = w.weapons.countShots(0, WeaponRole.Missile);
      if (n > previous) {
        expect(previous).toBe(0);
        expect(n).toBe(2);
        volleys++;
        const pair = shots(w, ShotKind.TwoWay);
        const up = pair.find((s) => s.vy < 0)!;
        const down = pair.find((s) => s.vy > 0)!;
        expect(up.frame).toBe(0);
        expect(down.frame).toBe(1);
        expect(up.vx).toBeGreaterThan(0);
        expect(down.vx).toBeCloseTo(up.vx, 9);
        expect(down.vy).toBeCloseTo(-up.vy, 9);
      }
      previous = n;
    }
    expect(volleys).toBeGreaterThanOrEqual(2);
  });

  it('2-Way Missile: dies on its first hit', () => {
    const w = world({ ...MANUAL, weaponPreset: 'type-c' }, 40, 100);
    const e = spawn(w, 'target', 70, 70);
    w.weapons.spawnShot(WeaponRole.Missile, 0, w.players[0].x, w.players[0].y); // the climbing one
    let hits = 0;
    let hp = e.hp;
    for (let t = 0; t < 40; t++) {
      run(w, 1);
      if (e.hp < hp) hits++;
      hp = e.hp;
    }
    expect(hits).toBe(1);
    expect(e.hp).toBe(998);
    expect(shots(w, ShotKind.TwoWay)).toEqual([]);
  });

  it('Photon Torpedo: slides fast along the floor through what it destroys, stops at a survivor', () => {
    const w = world({ ...MANUAL, stage: 't', weaponPreset: 'type-d' }, 30, 150);
    const weak1 = spawn(w, 'weak', 150, 164);
    const weak2 = spawn(w, 'weak', 190, 164);
    const wall = spawn(w, 'target', 260, 164);
    const beyond = spawn(w, 'weak', 320, 164);
    w.weapons.spawnShot(WeaponRole.Missile, 0, w.players[0].x, w.players[0].y);
    const xs: number[] = [];
    for (let t = 0; t < 120; t++) {
      run(w, 1);
      const [torpedo] = shots(w, ShotKind.Torpedo);
      if (torpedo === undefined) break;
      if ((torpedo.flags & ShotFlag.Sliding) !== 0) xs.push(torpedo.x);
    }
    // Sliding at 5 px/tick (the static camera adds nothing).
    expect(xs.length).toBeGreaterThan(5);
    for (let k = 1; k < xs.length; k++) expect(xs[k] - xs[k - 1]).toBeCloseTo(5, 9);
    // Through both 1-hp enemies, stopped by the 1000-hp one (damage 2), never reached the last.
    expect(weak1.hp).toBeLessThanOrEqual(0);
    expect(weak2.hp).toBeLessThanOrEqual(0);
    expect(wall.hp).toBe(998);
    expect(beyond.hp).toBe(1);
    expect(shots(w, ShotKind.Torpedo)).toEqual([]);
  });
});

describe('core/weapons arsenal (M2-03): double slot', () => {
  it('Tail Gun and Vertical: a forward shot and one straight back / straight up, paired', () => {
    for (const [preset, check] of [
      ['type-b', (s: ShotRecord) => s.vx < 0 && s.vy === 0],
      ['type-c', (s: ShotRecord) => Math.abs(s.vx) < 1e-9 && s.vy < 0],
    ] as const) {
      const w = world({ weaponPreset: preset }, 150, 100);
      w.weapons.loadouts[0].main = MainWeapon.Double;
      let volleys = 0;
      let previous = 0;
      for (let t = 0; t < 200; t++) {
        run(w, 1);
        const n = w.weapons.countShots(0, WeaponRole.Double);
        if (n > previous) {
          expect(previous, preset).toBe(0);
          expect(n, preset).toBe(2);
          volleys++;
          const pair = shots(w, ShotKind.Double);
          expect(pair.filter((s) => s.vx > 0 && s.vy === 0).length, preset).toBe(1);
          expect(pair.filter(check).length, preset).toBe(1);
        }
        previous = n;
      }
      expect(volleys, preset).toBeGreaterThanOrEqual(2);
    }
  });

  it('Free Way: the second shot flies in the last 8-way direction held (up-forward before any)', () => {
    const w = world({ weaponPreset: 'type-d' }, 150, 100);
    w.weapons.loadouts[0].main = MainWeapon.Double;
    expect(w.weapons.freeWayHeading[0]).toBe(-1);
    /**
     * The direction of the newest Free Way pair's second shot.
     *
     * @returns Its velocity's signs `[sx, sy]`.
     */
    const second = (): [number, number] => {
      const pair = shots(w, ShotKind.FreeWay);
      const s = pair.find((p) => !(p.vx > 0 && p.vy === 0)) ?? pair[pair.length - 1];
      return [Math.sign(Math.round(s.vx * 1e6)), Math.sign(Math.round(s.vy * 1e6))];
    };
    while (shots(w, ShotKind.FreeWay).length < 2) run(w, 1);
    expect(second()).toEqual([1, -1]); // up-forward (angle 128) before any input
    const input = createInputSnapshot();
    for (const [held, heading, dir] of [
      [Action.Down, 256, [0, 1]],
      [Action.Left, 512, [-1, 0]],
      [Action.Up | Action.Left, 640, [-1, -1]],
      [Action.Right, 0, [1, 0]],
    ] as const) {
      commitPlayerInput(input.players[0], held);
      run(w, 1, input);
      commitPlayerInput(input.players[0], 0);
      expect(w.weapons.freeWayHeading[0]).toBe(heading);
      // Released: the heading is kept for the next pair.
      while (w.weapons.countShots(0, WeaponRole.Double) > 0) run(w, 1);
      while (shots(w, ShotKind.FreeWay).length < 2) run(w, 1);
      expect(w.weapons.freeWayHeading[0]).toBe(heading);
      expect(second()).toEqual(dir);
    }
  });
});

describe('core/weapons arsenal (M2-03): laser slot', () => {
  it('Ripple: a ring growing 0.5 px a tick up to 20 (half the width), 3 per shooter', () => {
    const w = world({ weaponPreset: 'type-b' }, 40, 100);
    w.weapons.loadouts[0].main = MainWeapon.Laser;
    let most = 0;
    const sizes: number[] = [];
    for (let t = 0; t < 120; t++) {
      run(w, 1);
      const rings = shots(w, ShotKind.Ripple);
      most = Math.max(most, rings.length);
      for (const ring of rings) {
        expect(ring.hw).toBeCloseTo(ring.hh / 2, 9);
        expect(ring.hh).toBeLessThanOrEqual(20);
        expect(ring.hh).toBeGreaterThanOrEqual(4);
      }
      if (rings.length > 0) sizes.push(rings[0].hh);
    }
    expect(most).toBe(3);
    expect(sizes).toContain(20);
    // The first ring's size over its first ticks: 4.5, 5, 5.5 …
    expect(sizes.slice(0, 3)).toEqual([4.5, 5, 5.5]);
  });

  it('Ripple: its ring hits (and dies on) what it touches, not what is wholly inside it', () => {
    // A small target the ring reaches while still small: hit once, the ring is gone.
    const w = world({ ...MANUAL, weaponPreset: 'type-b' }, 40, 100);
    const e = spawn(w, 'target', 90, 100);
    w.weapons.spawnShot(WeaponRole.Laser, 0, w.players[0].x, w.players[0].y);
    run(w, 30);
    expect(e.hp).toBe(999);
    expect(shots(w, ShotKind.Ripple)).toEqual([]);
    // A target wholly inside the grown ring (at its next centre) is not touched…
    const v = world({ ...MANUAL, weaponPreset: 'type-b' }, 40, 100);
    const i = v.weapons.spawnShot(WeaponRole.Laser, 0, v.players[0].x, v.players[0].y);
    expect(i).toBeGreaterThanOrEqual(0);
    run(v, 36);
    const [ring] = shots(v, ShotKind.Ripple);
    expect(ring.hh).toBe(20);
    const inside = v.enemies.spawn(v.content.enemyIndex.get('target')!, ring.x + ring.vx, ring.y)!;
    run(v, 1);
    expect(inside.hp).toBe(1000);
    expect(shots(v, ShotKind.Ripple)).toHaveLength(1);
    // …until the ring's trailing edge (RIPPLE_RING_WIDTH px thick) passes over it: hit, ring gone.
    run(v, 1);
    expect(inside.hp).toBe(999);
    expect(shots(v, ShotKind.Ripple)).toEqual([]);
    expect(RIPPLE_RING_WIDTH).toBe(4);
  });

  it('Cyclone Laser: a piercing 8-px-thick beam up to 80 px with swirling segments', () => {
    const w = world({ ...MANUAL, weaponPreset: 'type-c' }, 30, 100);
    const small = spawn(w, 'target', 70, 103);
    const wide = spawn(w, 'target', 110, 97);
    w.weapons.spawnShot(WeaponRole.Laser, 0, w.players[0].x, w.players[0].y);
    const lengths: number[] = [];
    for (let t = 0; t < 12; t++) {
      run(w, 1);
      const [beam] = shots(w, ShotKind.Laser);
      lengths.push(beam.length);
      expect(beam.hh).toBe(4);
    }
    expect(lengths[11]).toBe(80);
    // Pierced: both targets hit, several times each (cooldown 6).
    expect(small.hp).toBeLessThan(1000);
    expect(wide.hp).toBeLessThan(1000);
    // Its segments step through the swirl frames along the beam.
    const batch = w.weapons.batch;
    const frames = new Set<number>();
    for (let s = 0; s < batch.count; s++) frames.add(batch.frame[s]);
    expect(frames.size).toBeGreaterThan(1);
  });

  it('Twin Laser: pairs of short beams 8 px apart that follow the shooter, 2 pairs at a time', () => {
    const w = world({ weaponPreset: 'type-d' }, 30, 100);
    w.weapons.loadouts[0].main = MainWeapon.Laser;
    const input = createInputSnapshot();
    let most = 0;
    for (let t = 0; t < 60; t++) {
      commitPlayerInput(input.players[0], t < 30 ? Action.Down : Action.Up);
      run(w, 1, input);
      const beams = shots(w, ShotKind.Twin).filter((s) => s.shooter === 0);
      most = Math.max(most, beams.length);
      const ship = w.players[0];
      for (const beam of beams) {
        expect(Math.abs(beam.y - ship.y)).toBe(4);
        expect(beam.length).toBeLessThanOrEqual(16);
      }
    }
    expect(most).toBe(4);
  });

  it('Twin Laser: non-piercing — a beam dies on its first hit', () => {
    const w = world({ ...MANUAL, weaponPreset: 'type-d' }, 30, 100);
    const e = spawn(w, 'target', 80, 96);
    w.weapons.spawnShot(WeaponRole.Laser, 0, w.players[0].x, w.players[0].y); // the upper beam
    run(w, 20);
    expect(e.hp).toBe(999);
    expect(shots(w, ShotKind.Twin)).toEqual([]);
  });
});

describe('core/weapons arsenal (M2-03): Options and determinism', () => {
  it('Options copy the new weapons with their own caps (a Spread Bomb each)', () => {
    const w = world({ stage: 't', weaponPreset: 'type-b' }, 60, 60);
    const loadout = w.weapons.loadouts[0];
    loadout.missile = true;
    loadout.options = 4;
    const input = createInputSnapshot();
    commitPlayerInput(input.players[0], Action.Up);
    run(w, 40, input);
    let most = 0;
    for (let t = 0; t < 200; t++) {
      run(w, 1);
      let total = 0;
      for (let s = 0; s < SHOOTERS_PER_PLAYER; s++) {
        const n = w.weapons.countShots(s, WeaponRole.Missile);
        expect(n).toBeLessThanOrEqual(1);
        total += n;
      }
      most = Math.max(most, total);
    }
    expect(most).toBe(SHOOTERS_PER_PLAYER);
  });

  it('two worlds on every preset fed the same input stay in lockstep', () => {
    for (const preset of ['type-b', 'type-c', 'type-d']) {
      const hashes: number[][] = [];
      for (let k = 0; k < 2; k++) {
        const w = world({ stage: 't', weaponPreset: preset, loadout: 'full' }, 60, 100);
        w.weapons.loadouts[0].main = MainWeapon.Double;
        spawn(w, 'target', 200, 100);
        spawn(w, 'weak', 240, 160);
        const input = createInputSnapshot();
        const out: number[] = [];
        for (let t = 0; t < 240; t++) {
          commitPlayerInput(input.players[0], t % 80 < 40 ? Action.Up : Action.Down);
          if (t === 120) w.weapons.loadouts[0].main = MainWeapon.Laser;
          run(w, 1, input);
          if (t % 40 === 0) out.push(hashWorld(w));
        }
        hashes.push(out);
      }
      expect(hashes[0], preset).toEqual(hashes[1]);
    }
  });
});
