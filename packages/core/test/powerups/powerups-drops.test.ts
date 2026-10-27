/**
 * The w15-C drop-variety mechanism in the World: the four new droppable kinds reach the item
 * pool from content drops (V2 explicit), their pickups act per mode (the mega crate arms the
 * Mega Crash, the weapon crate walks the MISSILE → DOUBLE → LASER → OPTION cursor skipping
 * maxed slots, the speed capsule parks SPEED, Direct mode spends the matching planned item
 * instead), the weighted per-stage drop tables roll the gameplay stream deterministically and
 * are ignored in Direct mode (V3), and the flavored capsule icon follows the cursor's next stop
 * while the pickup stays the plain capsule (V1).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import {
  MAX_DROP_WEIGHT_ROWS,
  loadContent,
  type ContentDb,
  type ContentFile,
} from '../../src/data/index.js';
import { SFX_CUES, SimEventKind, type SimEvent } from '../../src/events/index.js';
import { commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { MAX_OPTIONS } from '../../src/options/index.js';
import { spawnPlayer } from '../../src/player/index.js';
import {
  CAPSULE_FLAVOR_SPRITES,
  FREE_OPTION_DRIFT,
  ItemKind,
  MAX_ITEMS,
  METER_SLOT_COUNT,
  MeterSlot,
  firstWeaponStop,
} from '../../src/powerups/index.js';
import { MainWeapon, WeaponRole } from '../../src/weapons/index.js';
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
 * A scriptless flying target.
 *
 * @param id - Enemy id.
 * @param over - Fields to change.
 * @returns The entry.
 */
function enemy(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    hp: 1,
    score: 100,
    hurtbox: { hw: 4, hh: 4 },
    script: 'test.idle',
    sprite: 'enemies/drifter',
    drop: null,
    ...over,
  };
}

/**
 * A static open-space stage.
 *
 * @param id - Stage id.
 * @param over - Fields over the minimal body (a `dropWeights` table …).
 * @returns The file.
 */
function stageFile(id: string, over: Record<string, unknown> = {}): ContentFile {
  return {
    path: `stages/${id}.stage.json`,
    data: {
      formatVersion: 1,
      kind: 'stage',
      id,
      name: id.toUpperCase(),
      music: { stage: 'Stage', boss: 'Boss' },
      length: 3000,
      camera: [{ x: 0, speed: 0 }],
      checkpoints: [{ x: 0 }],
      parallax: [],
      tilemap: null,
      events: [],
      ...over,
    },
  };
}

/** The weighted table of the `weight` stage: the capsule holds most of the mass. */
const TABLE = [
  { drop: 'capsule', weight: 55 },
  { drop: 'weaponPick', weight: 15 },
  { drop: 'powerup', weight: 10 },
  { drop: 'speedOnly', weight: 8 },
  { drop: 'mega', weight: 5 },
  { drop: 'freeOption', weight: 4 },
  { drop: 'blueCapsule', weight: 2 },
  { drop: 'oneUp', weight: 1 },
];

/**
 * Content for both modes: the two ships, Type A and the Direct families, the drop carriers.
 *
 * @param exclude - Sprite names to keep out of `extraSprites` (the flavor fallback).
 * @returns The DB.
 */
function dropDb(exclude: readonly string[] = []): ContentDb {
  const extras = ENGINE_SPRITES.filter((n) => !exclude.includes(n));
  const { db, issues } = loadContent(
    [
      shipped('player/kestrel.player.json'),
      shipped('player/manta.player.json'),
      shipped('weapons/type-a.weapons.json'),
      // The W15-A Extra guns, for the crate seam (w15-C LAND): the slot tables are content-wide.
      shipped('weapons/types-e.weapons.json'),
      shipped('weapons/direct.weapons.json'),
      {
        path: 'enemies/t.enemies.json',
        data: {
          formatVersion: 1,
          kind: 'enemies',
          enemies: [
            enemy('caps', { drop: 'capsule' }),
            enemy('mega', { drop: 'mega' }),
            enemy('weapon', { drop: 'weaponPick' }),
            enemy('speed', { drop: 'speedOnly' }),
            enemy('option', { drop: 'freeOption' }),
          ],
        },
      },
      stageFile('quiet'),
      stageFile('weight', { dropWeights: TABLE }),
    ],
    { extraSprites: extras },
  );
  expect(issues).toEqual([]);
  return db;
}

/** The shared DBs (content is read-only). */
const DB = dropDb();
const NO_FLAVOR_DB = dropDb([
  'items/capsule-weapon',
  'items/capsule-option',
  'items/capsule-power',
  'items/capsule-speed',
]);

/**
 * A world whose player 1 is alive, parked at the view (60, 100).
 *
 * @param config - Config overrides (default: the KESTREL, meter, the quiet stage).
 * @param db - The content.
 * @returns The world.
 */
function world(config: Partial<GameConfig> = {}, db: ContentDb = DB): World {
  const w = createWorld(
    resolveGameConfig({
      seed: 7,
      stage: 'quiet',
      autofire: false,
      remoteMode: false,
      ...config,
    }),
    db,
  );
  const input = createInputSnapshot();
  for (let i = 0; i < 400 && w.players[0].state !== 'alive'; i++) stepWorld(w, input);
  expect(w.players[0].state).toBe('alive');
  w.players[0].x = w.camera.x + 60;
  w.players[0].y = w.camera.y + 100;
  w.events.clear();
  return w;
}

/**
 * Kills a carrier between ticks (its drop is taken on the next tick's phase 3).
 *
 * @param w - The world.
 * @param id - Enemy id.
 */
function killFor(w: World, id: string): void {
  const e = w.enemies.spawn(w.content.enemyIndex.get(id) ?? -1, w.camera.x + 250, w.camera.y + 60);
  expect(e).not.toBeNull();
  w.enemies.kill(e!, 0);
  stepWorld(w, createInputSnapshot());
}

/**
 * Drops an item of a kind onto player 1 and steps one tick.
 *
 * @param w - The world.
 * @param kind - The {@link ItemKind}.
 * @returns The tick's events.
 */
function pickUp(w: World, kind: ItemKind): SimEvent[] {
  expect(w.powerups.spawnItem(kind, w.players[0].x, w.players[0].y)).toBeGreaterThanOrEqual(0);
  const input = createInputSnapshot();
  commitPlayerInput(input.players[0], 0);
  stepWorld(w, input);
  const out: SimEvent[] = [];
  w.events.drain((e) => out.push({ ...e }));
  return out;
}

/**
 * Whether a drain's events hold the sfx cue.
 *
 * @param events - Drained events.
 * @param cue - `SFX_CUES` id.
 * @returns `true` when seen.
 */
function hasSfx(events: readonly SimEvent[], cue: number): boolean {
  for (const e of events) if (e.kind === SimEventKind.Sfx && e.id === cue) return true;
  return false;
}

describe('w15-C V2 — the new drop kinds reach the world', () => {
  it('spawns one item per kind from a content enemy drop', () => {
    const w = world();
    killFor(w, 'mega');
    expect(w.powerups.pool.fields.kind[0]).toBe(ItemKind.Mega);
    killFor(w, 'weapon');
    expect(w.powerups.pool.fields.kind[1]).toBe(ItemKind.WeaponPick);
    killFor(w, 'speed');
    expect(w.powerups.pool.fields.kind[2]).toBe(ItemKind.SpeedOnly);
    killFor(w, 'option');
    expect(w.powerups.pool.fields.kind[3]).toBe(ItemKind.FreeOption);
    // The freed Option drifts (the first pair of FREE_OPTION_DRIFT) like the hunter's drops.
    const f = w.powerups.pool.fields;
    expect([f.vx[3], f.vy[3]]).toEqual([FREE_OPTION_DRIFT[0], FREE_OPTION_DRIFT[1]]);
    expect(w.powerups.count).toBe(4);
  });

  it('spawns at most the item pool (the cap is never raised)', () => {
    const w = world();
    for (let i = 0; i < MAX_ITEMS + 4; i++) {
      expect(w.powerups.spawnItem(ItemKind.Mega, w.camera.x + 250, w.camera.y + 60)).toBe(
        i < MAX_ITEMS ? i : -1,
      );
    }
    expect(w.powerups.count).toBe(MAX_ITEMS);
  });
});

describe('w15-C V2 — the crate pickups in meter mode', () => {
  it('parks the cursor on `!` and the next press arms the Mega Crash', () => {
    const w = world();
    const events = pickUp(w, ItemKind.Mega);
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Mega);
    expect(hasSfx(events, SFX_CUES.MeterAdvance)).toBe(true);
    expect(w.powerups.equipHighlighted(0)).toBe(true);
    expect(w.powerups.meters[0].cursor).toBe(-1);
    expect(w.powerups.megaPending[0]).toBe(1);
  });

  it('walks MISSILE → DOUBLE → LASER → OPTION and wraps (nothing auto-equipped while parked)', () => {
    const w = world();
    for (const stop of [
      MeterSlot.Missile,
      MeterSlot.Double,
      MeterSlot.Laser,
      MeterSlot.Option,
      MeterSlot.Missile,
    ]) {
      pickUp(w, ItemKind.WeaponPick);
      expect(w.powerups.meters[0].cursor).toBe(stop);
    }
  });

  it('skips the stops that cannot be equipped (a maxed walk lands on the first open one)', () => {
    const w = world();
    const loadout = w.weapons.loadouts[0];
    loadout.missile = true; // MISSILE maxed
    loadout.main = MainWeapon.Double; // DOUBLE taken by the main
    loadout.options = MAX_OPTIONS; // OPTION full
    pickUp(w, ItemKind.WeaponPick);
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Laser);
  });

  it('grants the arsenal’s own role weapons on the W15-A preset (crate seam, w15-C LAND)', () => {
    // The Extra guns (FLAK CONE on the DOUBLE role, SEEKER DRONE on MISSILE) ride the same slot
    // enums: the crate walks unchanged and an equip on a walked stop fires the preset's weapon.
    const w = world({ weaponPreset: 'type-e' });
    expect(w.weapons.roleWeapons[WeaponRole.Double]?.id).toBe('shot.flak');
    expect(w.weapons.roleWeapons[WeaponRole.Missile]?.id).toBe('shot.drone');
    pickUp(w, ItemKind.WeaponPick);
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Missile);
    expect(w.powerups.equipHighlighted(0)).toBe(true); // arms the MISSILE role (the drone)
    pickUp(w, ItemKind.WeaponPick);
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Double);
    expect(w.powerups.equipHighlighted(0)).toBe(true);
    expect(w.weapons.loadouts[0].main).toBe(MainWeapon.Double); // the FLAK fires as the main
  });

  it('parks SPEED from any stop', () => {
    const w = world();
    w.powerups.meters[0].cursor = MeterSlot.Option;
    const events = pickUp(w, ItemKind.SpeedOnly);
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Speed);
    expect(hasSfx(events, SFX_CUES.MeterAdvance)).toBe(true);
  });

  it('firstWeaponStop walks the weapon ring and re-enters from anywhere else', () => {
    expect([
      firstWeaponStop(NaN),
      firstWeaponStop(-1),
      firstWeaponStop(MeterSlot.Speed),
      firstWeaponStop(MeterSlot.Missile),
      firstWeaponStop(MeterSlot.Double),
      firstWeaponStop(MeterSlot.Laser),
      firstWeaponStop(MeterSlot.Option),
      firstWeaponStop(MeterSlot.Shield),
      firstWeaponStop(MeterSlot.Mega),
    ]).toEqual([
      MeterSlot.Missile,
      MeterSlot.Missile,
      MeterSlot.Missile,
      MeterSlot.Double,
      MeterSlot.Laser,
      MeterSlot.Option,
      MeterSlot.Missile,
      MeterSlot.Missile,
      MeterSlot.Missile,
    ]);
  });
});

describe('w15-C V2 — the crate pickups in Direct mode', () => {
  const DIRECT: Partial<GameConfig> = { shipId: 'manta', powerUpMode: 'direct' };

  it('never touches the (unused) meter: no ding, no parked cursor', () => {
    const w = world(DIRECT);
    for (const kind of [
      ItemKind.Mega,
      ItemKind.WeaponPick,
      ItemKind.SpeedOnly,
      ItemKind.FreeOption,
    ]) {
      const events = pickUp(w, kind);
      expect(w.powerups.meters[0].cursor).toBe(-1);
      expect(hasSfx(events, SFX_CUES.MeterAdvance)).toBe(false);
    }
    expect(w.powerups.count).toBe(0);
  });

  it('reads the freed Option like the speed crate — the sound, points only, never an orb (LAND amend)', () => {
    // The MANTA has no Options to regain (WDESIGN §1.6: escort orbs are the meter model); an
    // explicit `freeOption` drop or a table roll must not arm the orb system for it
    // (review w15-WC-RV Law 6, owner-standard doctrine 2026-10-26).
    const w = world(DIRECT);
    const events = pickUp(w, ItemKind.FreeOption);
    expect(hasSfx(events, SFX_CUES.CapsulePickup)).toBe(true);
    expect(w.weapons.loadouts[0].options).toBe(0);
    // In meter mode the same pickup still regains an escort orb (whoever grabs it): the loadout
    // option count is the state the Option system follows.
    const k = world();
    pickUp(k, ItemKind.FreeOption);
    expect(k.weapons.loadouts[0].options).toBe(1);
  });
});

describe('w15-C V3 — the weighted per-stage drop table', () => {
  it('rolls the gameplay stream: the same seed replays the same kinds', () => {
    const a = world({ stage: 'weight', seed: 42 });
    const b = world({ stage: 'weight', seed: 42 });
    const kinds = (w: World): number[] => {
      for (let i = 0; i < 30; i++) killFor(w, 'caps');
      const out: number[] = [];
      const f = w.powerups.pool.fields;
      for (let i = 0; i < w.powerups.count; i++) out.push(f.kind[i]);
      return out;
    };
    const ka = kinds(a);
    const kb = kinds(b);
    expect(ka).toEqual(kb);
    expect(ka).toHaveLength(30);
    // The table spread: the plain capsule alone is NOT the outcome of a weighted stage.
    expect(ka.some((k) => k !== ItemKind.Capsule)).toBe(true);
    // Every rolled kind is a drop, never a Direct-mode item.
    const allowed = new Set<number>([
      ItemKind.Capsule,
      ItemKind.BlueCapsule,
      ItemKind.OneUp,
      ItemKind.FreeOption,
      ItemKind.Mega,
      ItemKind.WeaponPick,
      ItemKind.SpeedOnly,
    ]);
    for (const k of ka) expect(allowed.has(k), `kind ${k}`).toBe(true);
    expect(ka.includes(ItemKind.Capsule)).toBe(true);
  });

  it('a different seed rolls a different sequence', () => {
    const roll = (seed: number): number[] => {
      const w = world({ stage: 'weight', seed });
      for (let i = 0; i < 30; i++) killFor(w, 'caps');
      const out: number[] = [];
      const f = w.powerups.pool.fields;
      for (let i = 0; i < w.powerups.count; i++) out.push(f.kind[i]);
      return out;
    };
    expect(roll(42)).not.toEqual(roll(43));
  });

  it('a stage without a table keeps the plain capsule', () => {
    const w = world();
    for (let i = 0; i < 12; i++) killFor(w, 'caps');
    const f = w.powerups.pool.fields;
    for (let i = 0; i < w.powerups.count; i++) expect(f.kind[i]).toBe(ItemKind.Capsule);
    expect(w.powerups.count).toBe(12);
  });

  it('Direct mode ignores the table: its variety is the item plan', () => {
    const w = world({ stage: 'weight', shipId: 'manta', powerUpMode: 'direct' });
    for (let i = 0; i < 15; i++) killFor(w, 'caps');
    const f = w.powerups.pool.fields;
    expect(w.powerups.count).toBe(15);
    expect(w.powerups.planCursor).toBe(15);
    for (let i = 0; i < w.powerups.count; i++) {
      expect(f.kind[i]).toBeGreaterThanOrEqual(ItemKind.DirectRed);
      expect(f.kind[i]).toBeLessThanOrEqual(ItemKind.DirectOctagon);
    }
  });

  it('the compiled table row budget bounds the stage schema', () => {
    expect(MAX_DROP_WEIGHT_ROWS).toBe(12);
  });
});

describe('w15-C V1 — the flavored capsule icon', () => {
  /**
   * The drawn sprite name of the live capsule.
   *
   * @param w - The world (one capsule is live).
   * @returns The sprite name.
   */
  const drawn = (w: World): string => {
    stepWorld(w, createInputSnapshot());
    return w.content.sprites.names[w.powerups.itemBatch.spriteId[0]];
  };

  it('follows the cursor`s next stop over the seven slots', () => {
    const w = world();
    w.powerups.spawnItem(ItemKind.Capsule, w.camera.x + 250, w.camera.y + 60);
    const seen: string[] = [];
    for (let cursor = -1; cursor < METER_SLOT_COUNT; cursor++) {
      w.powerups.meters[0].cursor = cursor;
      const stop = cursor + 1 >= METER_SLOT_COUNT ? 0 : cursor + 1;
      seen.push(drawn(w));
      expect(w.powerups.itemBatch.count).toBe(1);
      expect(seen[seen.length - 1], `cursor ${cursor}`).toBe(
        w.content.sprites.names[w.content.sprites.index.get(CAPSULE_FLAVOR_SPRITES[stop]) ?? -1],
      );
    }
    // The fresh cursor (-1) reads green: the first stop of the meter is SPEED.
    expect(seen[0]).toBe('items/capsule-speed');
    expect(seen[5]).toBe('items/capsule-power'); // cursor 4, next `?` (Shield) gold
    expect(seen[6]).toBe('items/capsule-power'); // cursor 5, next `!` (Mega) gold
    expect(seen[7]).toBe('items/capsule-speed'); // cursor 6 (`!`), next wraps to SPEED
  });

  it('falls back to the base icon with no ship shown', () => {
    const w = world();
    w.powerups.spawnItem(ItemKind.Capsule, w.camera.x + 250, w.camera.y + 60);
    w.players[0].active = false;
    expect(drawn(w)).toBe('items/capsule');
    w.players[0].active = true;
    expect(drawn(w)).toBe('items/capsule-speed');
  });

  it('falls back to the base icon when the content has no flavor sprites', () => {
    const w = world({}, NO_FLAVOR_DB);
    w.powerups.spawnItem(ItemKind.Capsule, w.camera.x + 250, w.camera.y + 60);
    expect(drawn(w)).toBe('items/capsule');
  });

  it('shows the SPEED-flavor green on a fresh cursor and the `!` gold after six stops', () => {
    // Presentation of state only: the pickup behavior is unchanged (the capsule still advances).
    const w = world();
    w.powerups.meters[0].cursor = MeterSlot.Shield; // next stop `!` → gold
    const events = pickUp(w, ItemKind.Capsule);
    expect(w.powerups.meters[0].cursor).toBe(MeterSlot.Mega);
    expect(hasSfx(events, SFX_CUES.MeterAdvance)).toBe(true);
  });

  it('draws co-op on the lowest-numbered alive ship`s flavor (P1 wins)', () => {
    const w = world();
    const p2 = w.players[1];
    p2.active = true;
    spawnPlayer(p2, w.camera);
    const input = createInputSnapshot();
    for (let i = 0; i < 400 && p2.state !== 'alive'; i++) {
      commitPlayerInput(input.players[0], 0);
      commitPlayerInput(input.players[1], 0);
      stepWorld(w, input);
    }
    expect(p2.state).toBe('alive');
    // P1 heads to `!` (gold), P2 to MISSILE (weapon, red) — the icon follows P1.
    w.powerups.meters[0].cursor = MeterSlot.Shield;
    w.powerups.meters[1].cursor = MeterSlot.Speed;
    w.powerups.spawnItem(ItemKind.Capsule, w.camera.x + 250, w.camera.y + 60);
    expect(drawn(w)).toBe('items/capsule-power');
  });

  it('colors only capsules: a crate beside a capsule keeps its own sprite', () => {
    const w = world();
    w.powerups.spawnItem(ItemKind.Mega, w.camera.x + 250, w.camera.y + 60);
    w.powerups.spawnItem(ItemKind.Capsule, w.camera.x + 240, w.camera.y + 60);
    stepWorld(w, createInputSnapshot());
    const names = w.content.sprites.names;
    const b = w.powerups.itemBatch;
    expect(b.count).toBe(2);
    expect([names[b.spriteId[0]], names[b.spriteId[1]]]).toEqual([
      'items/crate-mega',
      'items/capsule-speed',
    ]);
  });
});
