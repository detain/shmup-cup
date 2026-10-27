/**
 * `core/weapons` — the five W15-A main weapon types inside a World: the Flak Cone (an eight-pellet
 * cone that dies at its lifetime, one volley at a time), the Rail Lance (a born-extended piercing
 * bolt with a per-target hit cooldown that armour does not stop), the Seeker Drone (a dart that
 * turns toward the nearest enemy inside its seek radius and dies on its hit), the Chain Arc (a
 * bolt whose hit forks two short-lived arcs at the two nearest other enemies, room inside the cap
 * only) and the Sky Marker (a lobbed beacon that sticks the terrain, blinks without hurting, then
 * opens a full-height strike column that burns each target once). Preset wiring over the shipped
 * `weapons/types-e.weapons.json`. The allocation guard lives in `weapons-types-e-alloc.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLAYFIELD_H, resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { EnemyFlag } from '../../src/enemies/index.js';
import {
  MainWeapon,
  ShotFlag,
  ShotKind,
  WeaponRole,
  checkWeaponBehaviors,
  resolveArsenal,
  weaponLabel,
  weaponsOfSlot,
} from '../../src/weapons/index.js';
import { ENGINE_SPRITES, createWorld, stepWorld, type World } from '../../src/world/index.js';
import { createInputSnapshot } from '../../src/input/index.js';

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

/** The shipped tileset's tile size. */
const TILE = (shipped('tilesets/terrain-a.tileset.json').data as { tileSize: number }).tileSize;

/** Rows of the test stage's map: one playfield tall. */
const ROWS = PLAYFIELD_H / TILE;

/** The flat floor's surface. */
const SURF = PLAYFIELD_H - 4 * TILE;

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
    hurtbox: { hw: 6, hh: 6 },
    script: 'test.idle',
    sprite: 'enemies/drifter',
    drop: null,
    ...over,
  };
}

/**
 * Test content: the KESTREL, the shipped Type A (its `shot.basic` is the new presets' main), the
 * shipped Types E weapons and presets, the shipped tileset, 1000-hp targets and a static stage
 * `t` one playfield tall with a flat four-row floor.
 */
const DB: ContentDb = ((): ContentDb => {
  const files: ContentFile[] = [
    shipped('player/kestrel.player.json'),
    shipped('tilesets/terrain-a.tileset.json'),
    shipped('weapons/type-a.weapons.json'),
    shipped('weapons/types-e.weapons.json'),
    {
      path: 'enemies/t.enemies.json',
      data: {
        formatVersion: 1,
        kind: 'enemies',
        enemies: [enemy('target')],
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
          tileSize: TILE,
          tileset: 'terrain-a',
          rowsTall: ROWS,
          generator: {
            type: 'heightfield',
            segments: [
              { from: 0, to: 3384, floor: { base: 4 * TILE, amp: 0, period: 64, seed: 1 } },
            ],
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

/** Manual fire: only `spawnShot` fires, plus the flak tests' own autofire. */
const MANUAL: Partial<GameConfig> = { autofire: false, remoteMode: false };

/**
 * A world whose player 1 is alive, parked at (`x`, `y`) in the view (the camera stands at 0 and
 * never scrolls) with the ship permanently invulnerable.
 *
 * @param config - Config overrides.
 * @param x - Ship x relative to the camera.
 * @param y - Ship y relative to the camera.
 * @returns The world.
 */
function world(config: Partial<GameConfig> = {}, x = 40, y = 100): World {
  const w = createWorld(resolveGameConfig({ seed: 5, stage: 't', ...MANUAL, ...config }), DB);
  const input = createInputSnapshot();
  while (w.players[0].state !== 'alive') stepWorld(w, input);
  w.players[0].x = w.camera.x + x;
  w.players[0].y = w.camera.y + y;
  w.players[0].invulnTicks = 1e9;
  w.events.clear();
  return w;
}

/**
 * Steps a world.
 *
 * @param w - The world.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    stepWorld(w, createInputSnapshot());
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
function spawn(w: World, id: string, x: number, y: number) {
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
  readonly kind: number;
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
    out.push(rec(f, i));
  }
  return out;
}

/**
 * Reads slot `i` of the pool's fields as a record.
 *
 * @param f - The pool fields.
 * @param i - The slot.
 * @returns The record.
 */
function rec(
  f: {
    x: { readonly [k: number]: number };
    y: { readonly [k: number]: number };
    vx: { readonly [k: number]: number };
    vy: { readonly [k: number]: number };
    hw: { readonly [k: number]: number };
    hh: { readonly [k: number]: number };
    length: { readonly [k: number]: number };
    flags: { readonly [k: number]: number };
    frame: { readonly [k: number]: number };
    kind: { readonly [k: number]: number };
    role: { readonly [k: number]: number };
    [key: string]: unknown;
  },
  i: number,
): ShotRecord {
  return {
    x: f.x[i],
    y: f.y[i],
    vx: f.vx[i],
    vy: f.vy[i],
    hw: f.hw[i],
    hh: f.hh[i],
    length: f.length[i],
    flags: f.flags[i],
    frame: f.frame[i],
    kind: f.kind[i],
    role: f.role[i],
  };
}

/**
 * The live shot at a pool slot while it still carries `kind`, or `null` once the slot died or was
 * recycled into another shot (pool slots are reused the same tick a shot frees).
 *
 * @param w - The world.
 * @param slot - The slot `spawnShot` returned.
 * @param kind - The `ShotKind` expected there.
 * @returns The record, or `null`.
 */
function shotAt(w: World, slot: number, kind: number): ShotRecord | null {
  const f = w.weapons.pool.fields;
  if (slot < 0 || (f.flags[slot] & ShotFlag.Dead) !== 0 || f.kind[slot] !== kind) return null;
  return rec(f, slot);
}

describe('core/weapons W15-A: Types E arsenal wiring', () => {
  it('validates the shipped file and slots the new weapons into both presets', () => {
    expect(checkWeaponBehaviors(DB)).toEqual([]);
    const ids = (preset: string): (string | null)[] =>
      resolveArsenal(DB, { weaponPreset: preset, weaponEdit: null }).map((wp) => wp?.id ?? null);
    expect(ids('type-e')).toEqual(['shot.basic', 'shot.flak', 'shot.rail', 'shot.drone']);
    expect(ids('type-f')).toEqual(['shot.basic', 'shot.flak', 'laser.chain', 'missile.beacon']);
    expect(weaponsOfSlot(DB, 'double').map(weaponLabel)).toEqual(['DOUBLE', 'FLAK CONE']);
    expect(weaponsOfSlot(DB, 'laser').map(weaponLabel)).toEqual([
      'LASER',
      'RAIL LANCE',
      'CHAIN ARC',
    ]);
    expect(weaponsOfSlot(DB, 'missile').map(weaponLabel)).toEqual([
      'MISSILE',
      'SEEKER DRONE',
      'SKY MARKER',
    ]);
  });
});

describe('core/weapons W15-A: Flak Cone (shot.flak)', () => {
  it('fires eight pellets in a symmetric cone that die at their lifetime', () => {
    const w = world({ weaponPreset: 'type-e', autofire: true }, 60, 100);
    w.weapons.loadouts[0].main = MainWeapon.Double;
    w.weapons.loadouts[0].missile = false;
    let born = false;
    for (let t = 0; t < 60 && !born; t++) {
      run(w, 1);
      born = shots(w, ShotKind.Flak).length > 0;
    }
    expect(born).toBe(true);
    const volley = shots(w, ShotKind.Flak);
    expect(volley.length).toBe(8);
    const vys = volley.map((s) => s.vy).sort((a, b) => a - b);
    for (const s of volley) expect(s.vx).toBeGreaterThan(10);
    for (let j = 0; j < 4; j++) expect(Math.abs(vys[j] + vys[7 - j])).toBeLessThan(0.25);
    expect(vys[3]).toBeLessThan(0);
    expect(vys[4]).toBeGreaterThan(0);
    run(w, 24); // age 25 of 26: the whole volley is still in play
    expect(shots(w, ShotKind.Flak).length).toBe(8);
    run(w, 1); // age 26: every pellet dies the same tick (its fire gate saw them alive)
    expect(shots(w, ShotKind.Flak).length).toBe(0);
    run(w, 1); // the pool was empty at the fire phase: the next volley opens
    expect(shots(w, ShotKind.Flak).length).toBe(8);
  });

  it('holds its volley: no pellet joins a volley that is still alive', () => {
    const w = world({ weaponPreset: 'type-e', autofire: true }, 60, 100);
    w.weapons.loadouts[0].main = MainWeapon.Double;
    w.weapons.loadouts[0].missile = false;
    let volleys = 0;
    let previous = 0;
    let most = 0;
    for (let t = 0; t < 90; t++) {
      run(w, 1);
      const n = w.weapons.countShots(0, WeaponRole.Double);
      most = Math.max(most, n);
      if (n > previous) {
        expect(previous).toBe(0); // every volley starts from an empty pool
        volleys++;
      }
      previous = n;
    }
    expect(most).toBe(8); // cap 8 with an all-gone gate: never more than one volley alive
    expect(volleys).toBeGreaterThanOrEqual(3); // 90 ticks against a 26-tick lifetime
  });
});

describe('core/weapons W15-A: Rail Lance (shot.rail)', () => {
  // The subjects fly the y = 160 row, far off the ship's autofiring main-gun line at y 100.
  it('is born extended at its max length and flies straight', () => {
    const w = world({ weaponPreset: 'type-e' }, 100, 100);
    const ship = w.players[0];
    const slot = w.weapons.spawnShot(WeaponRole.Laser, 0, ship.x, 160);
    expect(slot).toBeGreaterThanOrEqual(0);
    const s = shotAt(w, slot, ShotKind.Rail)!;
    expect(s.length).toBe(144);
    expect(s.vx).toBe(12);
    expect(s.vy).toBe(0);
    expect(s.flags & ShotFlag.Pierce).not.toBe(0);
    expect(s.flags & ShotFlag.PassArmour).not.toBe(0);
    run(w, 1);
    const moved = shotAt(w, slot, ShotKind.Rail)!;
    expect(moved.x).toBeCloseTo(s.x + 12, 6);
    expect(moved.length).toBe(144); // constant: no growth, no shrinking while unblocked
  });

  it('pierces a line of enemies, each hit once per cooldown while the trail covers it', () => {
    const w = world({ weaponPreset: 'type-e' }, 100, 100);
    const near = spawn(w, 'target', 260, 160);
    const far = spawn(w, 'target', 330, 160);
    const ship = w.players[0];
    const slot = w.weapons.spawnShot(WeaponRole.Laser, 0, ship.x, 160);
    run(w, 30);
    expect(1000 - near.hp).toBeGreaterThanOrEqual(6);
    expect(1000 - near.hp).toBeLessThanOrEqual(12);
    expect(1000 - far.hp).toBeGreaterThanOrEqual(6);
    expect(1000 - far.hp).toBeLessThanOrEqual(12);
    expect(shotAt(w, slot, ShotKind.Rail)).not.toBeNull(); // the bolt flew on through both
  });

  it('passArmour: armour neither damages nor stops the bolt — it flies on to what is behind', () => {
    const w = world({ weaponPreset: 'type-e' }, 100, 100);
    const armoured = spawn(w, 'target', 260, 160);
    armoured.flags |= EnemyFlag.Invulnerable;
    const behind = spawn(w, 'target', 330, 160);
    const ship = w.players[0];
    const slot = w.weapons.spawnShot(WeaponRole.Laser, 0, ship.x, 160);
    run(w, 20);
    expect(armoured.hp).toBe(1000); // armour is invulnerable — the bolt only clinks on it
    expect(1000 - behind.hp).toBeGreaterThanOrEqual(6); // and the bolt was not stopped
    expect(shotAt(w, slot, ShotKind.Rail)).not.toBeNull();
  });

  it('dies when its head crosses a terrain column', () => {
    const w = world({ weaponPreset: 'type-e' }, 100, 100);
    const ship = w.players[0];
    const slot = w.weapons.spawnShot(WeaponRole.Laser, 0, ship.x, SURF + 2);
    expect(slot).toBeGreaterThanOrEqual(0);
    run(w, 1);
    expect(shotAt(w, slot, ShotKind.Rail)).toBeNull();
  });
});

describe('core/weapons W15-A: Seeker Drone (shot.drone)', () => {
  it('turns toward the nearest enemy inside its radius and dies on its hit', () => {
    const w = world({ weaponPreset: 'type-e' }, 100, 100);
    const near = spawn(w, 'target', 240, 172);
    spawn(w, 'target', 420, 160); // out of the radius at launch, never the target
    const ship = w.players[0];
    const slot = w.weapons.spawnShot(WeaponRole.Missile, 0, ship.x, 160);
    const born = shotAt(w, slot, ShotKind.Drone)!;
    expect(born.vx).toBe(10.5);
    expect(born.vy).toBe(0);
    expect(born.frame).toBe(0);
    let sawTurn = false;
    for (let t = 0; t < 40 && shotAt(w, slot, ShotKind.Drone) !== null; t++) {
      run(w, 1);
      const s = shotAt(w, slot, ShotKind.Drone);
      if (s !== null && s.vy > 0.5) sawTurn = true;
    }
    expect(sawTurn).toBe(true);
    expect(shotAt(w, slot, ShotKind.Drone)).toBeNull(); // died on its hit (non-piercing)
    expect(1000 - near.hp).toBe(1);
  });

  it('flies straight and culls with no target inside its radius', () => {
    const w = world({ weaponPreset: 'type-e' }, 100, 100);
    const ship = w.players[0];
    const slot = w.weapons.spawnShot(WeaponRole.Missile, 0, ship.x, 160);
    run(w, 20);
    const m = shotAt(w, slot, ShotKind.Drone)!;
    expect(m).not.toBeNull();
    expect(m.vy).toBe(0);
    expect(m.frame).toBe(0);
    expect(m.x).toBeCloseTo(109 + 10.5 * 20, 6);
    run(w, 40);
    expect(shotAt(w, slot, ShotKind.Drone)).toBeNull(); // culled past the right edge
  });

  it('ignores armoured and ghosted enemies', () => {
    const w = world({ weaponPreset: 'type-e' }, 100, 100);
    const arm = spawn(w, 'target', 240, 172);
    arm.flags |= EnemyFlag.Invulnerable;
    const ship = w.players[0];
    const slot = w.weapons.spawnShot(WeaponRole.Missile, 0, ship.x, 160);
    run(w, 20);
    const m = shotAt(w, slot, ShotKind.Drone);
    if (m !== null) expect(m.vy).toBe(0); // never steered at armour
    expect(arm.hp).toBe(1000);
  });
});

describe('core/weapons W15-A: Chain Arc (laser.chain)', () => {
  it('forks two arcs at the two nearest other enemies on its hit, and they die young', () => {
    const w = world({ weaponPreset: 'type-f' }, 100, 100);
    const victim = spawn(w, 'target', 220, 160);
    const up = spawn(w, 'target', 250, 130);
    const down = spawn(w, 'target', 250, 190);
    const far = spawn(w, 'target', 520, 160);
    const ship = w.players[0];
    w.weapons.spawnShot(WeaponRole.Laser, 0, ship.x, 160);
    let forked: ShotRecord[] = [];
    for (let t = 0; t < 30; t++) {
      run(w, 1);
      forked = shots(w, ShotKind.Arc);
      if (forked.length > 0) break;
    }
    expect(1000 - victim.hp).toBe(2); // the bolt hit it and died
    expect(forked.length).toBe(2);
    expect(forked.some((s) => s.vy < 0)).toBe(true); // one up at the first neighbour
    expect(forked.some((s) => s.vy > 0)).toBe(true); // one down at the second
    for (const s of forked) expect(s.frame).toBe(1); // the arc art frame
    expect(far.hp).toBe(1000); // only the two nearest inside the fork range
    run(w, 8); // the arcs hit their 42-px neighbours or die at forkTicks 6
    expect(shots(w, ShotKind.Arc).length).toBe(0);
    expect(1000 - up.hp).toBe(2);
    expect(1000 - down.hp).toBe(2);
  });

  it('keeps the lower slots when three neighbours tie on distance', () => {
    const w = world({ weaponPreset: 'type-f' }, 100, 100);
    const victim = spawn(w, 'target', 220, 160);
    // Three neighbours at exactly the same squared distance (30² + 24²), spawned in slot order:
    // the bounded pair keeps the two lowest slots — the third never gets an arc.
    const first = spawn(w, 'target', 250, 136);
    const second = spawn(w, 'target', 250, 184);
    const third = spawn(w, 'target', 190, 136);
    const ship = w.players[0];
    w.weapons.spawnShot(WeaponRole.Laser, 0, ship.x, 160);
    let forked: ShotRecord[] = [];
    for (let t = 0; t < 30; t++) {
      run(w, 1);
      forked = shots(w, ShotKind.Arc);
      if (forked.length > 0) break;
    }
    expect(1000 - victim.hp).toBe(2);
    expect(forked.length).toBe(2);
    for (const s of forked) expect(s.vx).toBeGreaterThan(0); // none turns back at the third
    run(w, 8);
    expect(1000 - first.hp).toBe(2);
    expect(1000 - second.hp).toBe(2);
    expect(third.hp).toBe(1000);
  });
});

describe('core/weapons W15-A: Sky Marker (missile.beacon)', () => {
  it('lobs, sticks the floor, blinks harmlessly, then strikes a once-each column', () => {
    const w = world({ weaponPreset: 'type-f' }, 100, 250);
    const ship = w.players[0];
    const slot = w.weapons.spawnShot(WeaponRole.Missile, 0, ship.x, ship.y);
    const born = shotAt(w, slot, ShotKind.Beacon)!;
    expect(born.vx).toBe(9);
    expect(born.vy).toBe(-4.5);
    let stuckX = -1;
    for (let t = 0; t < 60; t++) {
      run(w, 1);
      const s = shotAt(w, slot, ShotKind.Beacon);
      if (s !== null && (s.flags & ShotFlag.Sliding) !== 0) {
        expect(s.vx).toBe(0);
        expect(s.vy).toBe(0);
        stuckX = s.x;
        break;
      }
    }
    expect(stuckX).toBeGreaterThan(0);
    const high = spawn(w, 'target', stuckX, 100);
    const low = spawn(w, 'target', stuckX, 200);
    // The delay counts from the stick: 39 ticks of blinking marker, nobody hurt.
    for (let t = 0; t < 39; t++) {
      run(w, 1);
      expect(high.hp).toBe(1000);
      expect(low.hp).toBe(1000);
      expect(shotAt(w, slot, ShotKind.Beacon)).not.toBeNull(); // still the marker
    }
    // The next tick transforms the same slot into the full-height strike column.
    run(w, 1);
    const beam = shotAt(w, slot, ShotKind.Strike)!;
    expect(beam.hh).toBe(PLAYFIELD_H / 2);
    expect(beam.hw).toBe(12);
    expect(beam.flags & ShotFlag.Pierce).not.toBe(0);
    expect(beam.flags & ShotFlag.PassArmour).not.toBe(0);
    expect(beam.y).toBe(PLAYFIELD_H / 2); // the camera stands at 0
    expect(beam.x).toBe(stuckX); // world-anchored at the marker
    run(w, 2); // its first collision burned each target once (16-tick cooldown outlasts it)
    expect(1000 - high.hp).toBe(4);
    expect(1000 - low.hp).toBe(4);
    let sawFade = false;
    for (let t = 0; t < 14 && shotAt(w, slot, ShotKind.Strike) !== null; t++) {
      run(w, 1);
      const s = shotAt(w, slot, ShotKind.Strike);
      if (s !== null && s.frame === 1) sawFade = true;
    }
    expect(sawFade).toBe(true); // the last two of its 12 ticks show the fade frame
    expect(shotAt(w, slot, ShotKind.Strike)).toBeNull(); // and the beam is gone
    expect(1000 - high.hp).toBe(4); // once each: no second burn
  });

  it('breaks against a wall instead of sticking', () => {
    const w = world({ weaponPreset: 'type-f' }, 100, 100);
    const ship = w.players[0];
    // Thrown deep inside the floor: the scan window is solid through, there is no surface
    // above the contact — the wall arm kills the marker (it never sticks, never strikes).
    const slot = w.weapons.spawnShot(WeaponRole.Missile, 0, ship.x, SURF + 13);
    expect(slot).toBeGreaterThanOrEqual(0);
    run(w, 1);
    expect(shotAt(w, slot, ShotKind.Beacon)).toBeNull();
    run(w, 50); // no strike ever drops from a broken marker
    expect(shots(w, ShotKind.Strike).length).toBe(0);
  });
});
