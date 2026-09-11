/**
 * # weapons — player weapons
 *
 * **Status: partial.** Meter mode's **Type A** arsenal is implemented (plan M1-10): the main
 * shot, Double, Laser and ground Missile, fired with always-on autofire by the ship and its
 * Options, with per-shooter caps, piercing beams and grid-based hits. Types B–D and Weapon Edit
 * arrive with M2-03, the Direct-mode families with M2-05.
 *
 * **Responsibility.** The players' projectiles of a World ({@link WeaponSystem}):
 *
 * - **Shots** — a struct-of-arrays pool of {@link MAX_PLAYER_SHOTS} (96) registered with the
 *   World as `playerShots` (flushed in phase 8, hashed by `hashWorld`). Each shot belongs to a
 *   **shooter** — the ship or one of its four Options ({@link SHOOTERS_PER_PLAYER} per player) —
 *   and a **role** ({@link WeaponRole}: main shot, Double, Laser, Missile), and flies by its
 *   role's behaviour ({@link ShotKind}).
 * - **Loadouts** — one {@link Loadout} per player: `main` (basic / double / laser), `missile`,
 *   `options` (0–4) and `shield`, plus the ship's own `speedLevel` (`core/player`). The meter of
 *   M1-11 changes them; `GameConfig.loadout: 'full'` starts a session fully powered (dev).
 * - **Options** — one `core/options` {@link OptionGroup} per player (the trail of decision D26);
 *   every Option fires every weapon of the loadout with its own caps.
 * - **Hits** — enemy hurtboxes are in the World's grid (phase 6); each shot queries the cells
 *   under its box and tests the hurtboxes exactly. A non-piercing shot hits the overlapping enemy
 *   with the lowest slot and dies; a piercing shot hits every overlapping enemy whose entry in the
 *   shot's hit-cooldown table (`Uint8Array`, one entry per enemy slot) is 0, then waits its
 *   role's cooldown before hitting that enemy again (damage over time). Armoured enemies
 *   (`EnemyFlag.Invulnerable`) take no damage: the shot dies with a `Clink`. Hits are found in
 *   phase 6 ({@link WeaponSystem.collide}) and applied in phase 7
 *   ({@link WeaponSystem.applyHits}) through `EnemySystem.damage`, which pushes the explosion
 *   events and records the kill (spec, position, score, killer) for scoring.
 *
 * **Type A behaviours** (tunables from `content/weapons/*.weapons.json`, behaviour-specific ones
 * in `params` — defaults in {@link WEAPON_BEHAVIOR_PARAMS}):
 *
 * - `shot.straight` — flies forward at `speed`; dies on hit, on terrain and outside the view.
 * - `shot.double` — a forward shot (drawn and sized like the main shot) and one `angle` binary
 *   units up from forward (45°); the pair fires only when **both** earlier shots are gone.
 * - `laser.beam` — a piercing beam: its head moves `speed` px/tick, its length grows to
 *   `maxLength`, it follows its shooter vertically, and it hits each enemy at most once every
 *   `hitCooldownTicks`. Terrain stops the head; the tail then catches up and the beam vanishes.
 *   The whole beam is the hitbox (the Gradius "enemies entering the middle are missed" quirk is
 *   deliberately not copied, shmup_feat.md §7A).
 * - `missile.groundSlide` — falls `angle` units down from forward (45°) at `speed`; on floor
 *   contact it slides along the surface (`findFloor`) at `slideSpeed`, climbing and descending
 *   slopes; a wall (a step higher than the slide can climb) destroys it; over a cliff it falls
 *   again.
 *
 * **Autofire** (shmup_feat.md §4 rule 1). While a ship is `alive`, every shooter fires its main
 * weapon whenever its timer allows (every `config.autofireInterval` ticks, or the weapon's
 * `refireTicks`) and its cap has room, if `config.autofire || config.remoteMode` or the player
 * holds `Shot`; missiles likewise every `config.missileInterval` ticks when equipped and
 * `autofire || remoteMode || held(Sub)`. Firing pushes the weapon's SFX cue, at most once every
 * {@link SFX_RATE_TICKS} ticks per cue.
 *
 * **Frames.** Shots live in world pixels and ride the camera like enemy bullets (`x += camera.dx`
 * every tick), so their on-screen speed does not depend on the scroll; a sliding missile re-snaps
 * to the world-anchored floor each tick, and a blocked laser head stays at its wall.
 *
 * **Tick.** Phase 2 — {@link WeaponSystem.updatePlayers} (after the ships moved): option trails,
 * timers, firing. Phase 5 — {@link WeaponSystem.update}: movement, terrain, culling, cooldowns.
 * Phase 6 — {@link WeaponSystem.collide}. Phase 7 — {@link WeaponSystem.applyHits}. Phase 8 —
 * the World flushes the pool. Phase 9 — {@link WeaponSystem.sync}: the `PlayerShots` batch
 * (lasers as rows of 8-px beam segments) and the Options batch (`Player` layer).
 *
 * **Content.** Without a weapons file (or with nothing usable in a role) the role is empty: a
 * World built from content without weapons never fires. The preset `type-a` (else the first
 * preset, else the first weapon of each slot) decides which weapon each role uses.
 *
 * **Zero allocation.** Pools, tables, batches and the grid visitor are built by
 * {@link createWeaponSystem}; per-tick code passes whole numbers across calls (positions travel
 * through class fields) and writes typed arrays.
 *
 * **Implements.**
 * - shmup_feat.md §7 Weapons catalog — 7A Type A (Missile, Double, Laser), 7C on-screen caps,
 *   piercing vs non-piercing, per-projectile damage, damage over time for beams, ground-following
 *   projectiles, Options copy all weapons, weapons defined in data
 * - shmup_feat.md §4 — always-on autofire for main shot and missile (remote rule 1)
 * - shmup_feat.md §22 — shots × enemies through the uniform grid, SoA shot pool
 *
 * **Public API.** {@link createWeaponSystem}, {@link WeaponSystem}, {@link WeaponHost},
 * {@link Loadout}, {@link applyLoadoutPreset}, {@link MainWeapon},
 * {@link WeaponRole}, {@link WEAPON_ROLE_COUNT}, {@link ShotKind}, {@link ShotFlag},
 * {@link WEAPON_BEHAVIOR_KINDS}, {@link WEAPON_BEHAVIOR_PARAMS}, {@link WEAPON_BEHAVIOR_SLOTS},
 * {@link WEAPON_SCRIPT_IDS}, {@link WeaponBehaviorId}, {@link resolveWeaponPreset},
 * {@link resolveRoleWeapons}, {@link checkWeaponBehaviors}, {@link SHOT_SCHEMA},
 * {@link ShotSchema}, {@link MAX_PLAYER_SHOTS}, {@link SHOOTERS_PER_PLAYER}, {@link MAX_SHOOTERS},
 * {@link SHOT_CULL_MARGIN}, {@link SFX_RATE_TICKS}, {@link PIERCE_TABLES},
 * {@link MAX_SHOT_HITS}, {@link SHOT_BATCH_CAPACITY}, {@link LASER_SEGMENT_LENGTH},
 * {@link DEFAULT_WEAPON_PRESET}, {@link FULL_LOADOUT_SPEED_LEVEL}.
 *
 * **Planned API.** Loadouts B–D, Weapon Edit and weapon select (M2-03); Direct-mode families and
 * sub-weapons (M2-05); Snake / Formation / Rotate options firing (M2-04).
 *
 * @module
 */
import {
  TerrainType,
  findFloor,
  terrainAt,
  type SpatialGrid,
  type SpatialGridVisitor,
  type TerrainMap,
} from '../collision/index.js';
import {
  PLAYFIELD_H,
  PLAYFIELD_W,
  type GameConfig,
  type StartingLoadout,
} from '../config/index.js';
import type {
  ContentDb,
  PlayerShipSpec,
  ValidationIssue,
  WeaponPresetSpec,
  WeaponSlot,
  WeaponSpec,
} from '../data/index.js';
import { EnemyFlag, EnemyState, MAX_ENEMIES, type Enemy } from '../enemies/index.js';
import { SFX_CUES, SFX_CUE_NAMES, SimEventKind, type EventQueue } from '../events/index.js';
import { Action, MAX_PLAYERS } from '../input/index.js';
import { ANGLE_MASK, ANGLE_QUARTER, ANGLE_UNITS } from '../math/index.js';
import { SIN_TABLE_Q16, TRIG_SCALE } from '../math/trig-table.js';
import { defineModule } from '../module-info.js';
import {
  MAX_OPTIONS,
  OPTION_ANIM_TICKS,
  OPTION_SPRITE,
  createOptionGroup,
  type OptionGroup,
} from '../options/index.js';
import type { PlayerCamera, PlayerIntent, PlayerShip } from '../player/index.js';
import { createSoaPool, type SoaPool, type SoaSchema } from '../pools/index.js';
import { LayerId, SpriteFlag, createSpriteBatch, type SpriteBatch } from '../presentation/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'weapons',
  status: 'partial',
  specRefs: ['shmup_feat.md §7', 'shmup_feat.md §4', 'shmup_feat.md §22'],
});

/** Player shot slots (the whole session: both players, ships and Options). */
export const MAX_PLAYER_SHOTS = 96;

/** Shooters per player: the ship (0) and its Options (1 … {@link MAX_OPTIONS}). */
export const SHOOTERS_PER_PLAYER = 1 + MAX_OPTIONS;

/** Shooter ids of a session: `player × SHOOTERS_PER_PLAYER + k`. */
export const MAX_SHOOTERS = MAX_PLAYERS * SHOOTERS_PER_PLAYER;

/** Shots are removed once they are this many pixels outside the camera view. */
export const SHOT_CULL_MARGIN = 16;

/** A weapon's SFX cue is pushed at most once per this many ticks (per cue). */
export const SFX_RATE_TICKS = 4;

/** Hit-cooldown tables for piercing shots alive at the same time (each one per enemy slot). */
export const PIERCE_TABLES = 32;

/** Shot × enemy hits one tick can record (later ones are dropped and counted). */
export const MAX_SHOT_HITS = 1024;

/** Capacity of the `PlayerShots` sprite batch: the shots plus the extra laser segments. */
export const SHOT_BATCH_CAPACITY = 192;

/** Laser beams are drawn as rows of segments this many pixels long (the `shots/laser` art). */
export const LASER_SEGMENT_LENGTH = 8;

/** The preset a session uses when the content has it (meter-mode Type A). */
export const DEFAULT_WEAPON_PRESET = 'type-a';

/** Speed level of the `'full'` dev loadout (level 2 = the third speed of the ship). */
export const FULL_LOADOUT_SPEED_LEVEL = 2;

/** Identifier of a coded weapon behaviour (a content `behavior` / script id), e.g. `laser.beam`. */
export type WeaponBehaviorId = string;

/** How a shot flies (the coded behaviours of Type A). Codes are hashed: append, never renumber. */
export const ShotKind = {
  /** `shot.straight`: forward at constant speed. */
  Straight: 0,
  /** `shot.double`: the angled (and forward) shots of a Double pair. */
  Double: 1,
  /** `laser.beam`: a growing, piercing beam that follows its shooter vertically. */
  Laser: 2,
  /** `missile.groundSlide`: falls, then slides along the floor. */
  Missile: 3,
} as const;

/** A {@link ShotKind} code. */
export type ShotKind = (typeof ShotKind)[keyof typeof ShotKind];

/** Coded weapon behaviours by script id → {@link ShotKind}. */
export const WEAPON_BEHAVIOR_KINDS: Readonly<Record<WeaponBehaviorId, ShotKind>> = Object.freeze({
  'shot.straight': ShotKind.Straight,
  'shot.double': ShotKind.Double,
  'laser.beam': ShotKind.Laser,
  'missile.groundSlide': ShotKind.Missile,
});

/**
 * Behaviour tunables (content `params`) with their defaults, per behaviour. Angles are binary
 * units (1024 per turn); `ox` / `oy` place the new shot relative to its shooter's centre; `hw` /
 * `hh` are the hitbox half sizes.
 */
export const WEAPON_BEHAVIOR_PARAMS: Readonly<
  Record<WeaponBehaviorId, Readonly<Record<string, number>>>
> = Object.freeze({
  'shot.straight': Object.freeze({ ox: 8, oy: 0, hw: 4, hh: 2 }),
  'shot.double': Object.freeze({ angle: 128, ox: 4, oy: -2, hw: 3, hh: 3 }),
  'laser.beam': Object.freeze({ maxLength: 64, hitCooldownTicks: 6, ox: 8, oy: 0, hh: 2 }),
  'missile.groundSlide': Object.freeze({
    slideSpeed: 3,
    angle: 128,
    ox: 0,
    oy: 4,
    hw: 4,
    hh: 1.5,
    frames: 2,
  }),
});

/** The loadout slot each behaviour belongs in (checked by {@link checkWeaponBehaviors}). */
export const WEAPON_BEHAVIOR_SLOTS: Readonly<Record<WeaponBehaviorId, readonly WeaponSlot[]>> =
  Object.freeze({
    'shot.straight': Object.freeze(['main'] as WeaponSlot[]),
    'shot.double': Object.freeze(['double'] as WeaponSlot[]),
    'laser.beam': Object.freeze(['laser'] as WeaponSlot[]),
    'missile.groundSlide': Object.freeze(['missile'] as WeaponSlot[]),
  });

/**
 * Every weapon behaviour id, sorted. Weapon and enemy behaviours share the content's one script
 * table, so `core/behaviors` `KNOWN_SCRIPT_IDS` includes these.
 */
export const WEAPON_SCRIPT_IDS: readonly string[] = Object.freeze(
  Object.keys(WEAPON_BEHAVIOR_KINDS).sort(),
);

/** The weapon roles of a meter-mode loadout (index into the role tables). */
export const WeaponRole = {
  /** The basic main shot. */
  Main: 0,
  /** The Double slot's weapon. */
  Double: 1,
  /** The Laser slot's weapon. */
  Laser: 2,
  /** The Missile slot's weapon. */
  Missile: 3,
} as const;

/** A {@link WeaponRole} code. */
export type WeaponRole = (typeof WeaponRole)[keyof typeof WeaponRole];

/** Number of {@link WeaponRole}s. */
export const WEAPON_ROLE_COUNT = 4;

/** What a loadout's main weapon is (Double and Laser are mutually exclusive, shmup_feat.md §6A). */
export const MainWeapon = {
  /** The basic shot. */
  Basic: 0,
  /** The Double. */
  Double: 1,
  /** The Laser. */
  Laser: 2,
} as const;

/** A {@link MainWeapon} code. */
export type MainWeapon = (typeof MainWeapon)[keyof typeof MainWeapon];

/** Flag bits of a shot ({@link SHOT_SCHEMA} `flags`). */
export const ShotFlag = {
  /** Survives hits (keeps a hit-cooldown table). */
  Pierce: 1,
  /** A laser whose head was stopped by terrain (it shrinks away). */
  Blocked: 2,
  /** A missile sliding along the floor. */
  Sliding: 4,
  /** Removed this tick (the slot is freed in phase 8). */
  Dead: 8,
} as const;

/** Field layout of the shot pool (hashed in sorted field order). */
export const SHOT_SCHEMA = Object.freeze({
  /** World x: the centre (a laser's head). */
  x: 'f64',
  /** World y of the centre. */
  y: 'f64',
  /** Velocity x (px/tick, before the camera ride). */
  vx: 'f64',
  /** Velocity y. */
  vy: 'f64',
  /** Laser length in pixels (the tail is at `x − length`); 0 for other shots. */
  length: 'f64',
  /** Hitbox half width (a laser's box spans its length). */
  hw: 'f64',
  /** Hitbox half height. */
  hh: 'f64',
  /** Damage per hit. */
  damage: 'i32',
  /** {@link WeaponRole}. */
  role: 'u8',
  /** {@link ShotKind}. */
  kind: 'u8',
  /** Shooter id (`player × SHOOTERS_PER_PLAYER + k`, k 0 = ship). */
  shooter: 'u8',
  /** {@link ShotFlag} bits. */
  flags: 'u8',
  /** Sprite id (0 with `draw` Hidden when the role has no drawable sprite). */
  sprite: 'u16',
  /** Animation frame. */
  frame: 'u16',
  /** `SpriteFlag` bits for the renderer. */
  draw: 'u8',
  /** Ticks the shot has moved. */
  age: 'i32',
  /** Hit-cooldown table index + 1 (0 = none: a non-piercing shot). */
  table: 'i32',
} as const);

/** The shot pool's schema type. */
export type ShotSchema = typeof SHOT_SCHEMA;

/**
 * One player's meter-mode loadout (plan M1-10). The ship's speed level lives on the ship
 * (`PlayerShip.speedLevel`); M1-11's power meter equips these fields.
 */
export class Loadout {
  /** The main weapon ({@link MainWeapon}). */
  main: MainWeapon = MainWeapon.Basic;
  /** Whether the Missile is equipped. */
  missile = false;
  /** Options owned (0–{@link MAX_OPTIONS}). */
  options = 0;
  /** Shield hits left (0 = none; the Force Field of M1-11 uses it). */
  shield = 0;
}

/**
 * Applies a starting loadout to a player.
 *
 * @remarks
 * `'default'` = the basic shot, no missile, no options, no shield, speed level 0. `'full'` (the
 * web app's `?loadout=full` dev override) = speed level {@link FULL_LOADOUT_SPEED_LEVEL}, the
 * Missile, the Laser and four Options (shields arrive with M1-11).
 *
 * @param loadout - The player's loadout.
 * @param ship - The player's ship (its speed level).
 * @param preset - Which loadout.
 *
 * @example
 * ```ts
 * applyLoadoutPreset(world.weapons.loadouts[0], world.players[0], 'full');
 * ```
 */
export function applyLoadoutPreset(
  loadout: Loadout,
  ship: PlayerShip,
  preset: StartingLoadout,
): void {
  const full = preset === 'full';
  loadout.main = full ? MainWeapon.Laser : MainWeapon.Basic;
  loadout.missile = full;
  loadout.options = full ? MAX_OPTIONS : 0;
  loadout.shield = 0;
  ship.speedLevel = full ? FULL_LOADOUT_SPEED_LEVEL : 0;
}

/**
 * Picks the weapon preset of a session: `id` when the content has it, else the first preset.
 *
 * @param content - Validated content.
 * @param id - Preferred preset id (default {@link DEFAULT_WEAPON_PRESET}).
 * @returns The preset, or `null` when the content has none.
 */
export function resolveWeaponPreset(
  content: ContentDb,
  id: string = DEFAULT_WEAPON_PRESET,
): WeaponPresetSpec | null {
  const index = content.weaponPresetIndex.get(id);
  if (index !== undefined) return content.weaponPresets[index];
  return content.weaponPresets.length > 0 ? content.weaponPresets[0] : null;
}

/**
 * The weapon of each {@link WeaponRole} (load time): the preset's weapons, the main role falling
 * back to the first `main`-slot weapon; without a preset, the first weapon of each slot.
 *
 * @param content - Validated content.
 * @param preset - The session's preset ({@link resolveWeaponPreset}), or `null`.
 * @returns Four entries in {@link WeaponRole} order, `null` for an empty role.
 */
export function resolveRoleWeapons(
  content: ContentDb,
  preset: WeaponPresetSpec | null,
): (WeaponSpec | null)[] {
  const weapons = content.weapons;
  /**
   * The first weapon of a slot.
   *
   * @param slot - The slot.
   * @returns It, or `null`.
   */
  const firstOf = (slot: WeaponSlot): WeaponSpec | null => {
    for (const weapon of weapons) if (weapon.slot === slot) return weapon;
    return null;
  };
  /**
   * A resolved preset reference.
   *
   * @param index - Resolved weapon index (`-1` = none).
   * @returns The weapon, or `null`.
   */
  const at = (index: number | undefined): WeaponSpec | null =>
    index !== undefined && index >= 0 && index < weapons.length ? weapons[index] : null;
  if (preset === null) {
    return [firstOf('main'), firstOf('double'), firstOf('laser'), firstOf('missile')];
  }
  return [
    at(preset.mainId) ?? firstOf('main'),
    at(preset.doubleId),
    at(preset.laserId),
    at(preset.missileId),
  ];
}

/**
 * Checks weapons against their behaviours: the `behavior` must be a weapon behaviour, every
 * `params` name must be a tunable of it, and the weapon's `slot` must suit it.
 *
 * @remarks
 * Ids the engine does not know at all are `loadContent`'s job (through `knownScripts`); this
 * catches a known **enemy** behaviour named by a weapon (`weapons:<id>.behavior`, and its params
 * are then not checked). Names are tested as own properties, so `constructor` or `__proto__`
 * are never taken for a behaviour or a tunable. Load time only (it allocates).
 *
 * @param db - Validated content.
 * @returns Issues with paths `weapons:<id>.behavior`, `weapons:<id>.params.<name>` and
 *   `weapons:<id>.slot`, in weapon order.
 *
 * @example
 * ```ts
 * const { db, issues } = loadContent(files, { knownScripts: KNOWN_SCRIPT_IDS });
 * issues.push(...checkWeaponBehaviors(db));
 * ```
 */
export function checkWeaponBehaviors(db: ContentDb): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const weapon of db.weapons) {
    const behavior = weapon.behavior;
    if (!Object.prototype.hasOwnProperty.call(WEAPON_BEHAVIOR_KINDS, behavior)) {
      issues.push({
        path: 'weapons:' + weapon.id + '.behavior',
        message:
          '"' +
          behavior +
          '" is not a weapon behaviour (known: ' +
          WEAPON_SCRIPT_IDS.join(', ') +
          ')',
      });
      continue;
    }
    const known = WEAPON_BEHAVIOR_PARAMS[behavior];
    for (const name of Object.keys(weapon.params ?? {})) {
      if (!Object.prototype.hasOwnProperty.call(known, name)) {
        issues.push({
          path: 'weapons:' + weapon.id + '.params.' + name,
          message:
            'unknown param for behaviour "' +
            behavior +
            '" (known: ' +
            Object.keys(known).join(', ') +
            ')',
        });
      }
    }
    const slots = WEAPON_BEHAVIOR_SLOTS[behavior];
    if (slots.indexOf(weapon.slot) < 0) {
      issues.push({
        path: 'weapons:' + weapon.id + '.slot',
        message: 'behaviour "' + behavior + '" belongs in slot ' + slots.join(' or '),
      });
    }
  }
  return issues;
}

/** What the weapon system needs from its World (the World implements it). */
export interface WeaponHost {
  /** The tick being run. */
  readonly tick: number;
  /** The session config (autofire, intervals). */
  readonly config: GameConfig;
  /** The camera (shots ride its scroll; culling uses its view; option trails are screen-space). */
  readonly camera: PlayerCamera;
  /** The player ships (shooters). */
  readonly players: readonly PlayerShip[];
  /**
   * The spec the ships fly (`enterTicks`: a fly-in of at most one tick ends inside the same
   * phase 2 that starts it, so the ship is `alive` the first time the weapons see it).
   */
  readonly ship: Readonly<Pick<PlayerShipSpec, 'enterTicks'>>;
  /** Per-player intents of the tick (`Shot` / `Sub` held). */
  readonly intents: readonly PlayerIntent[];
  /** The stage's collision map, or `null`. */
  readonly terrain: TerrainMap | null;
  /** The content (weapons, presets, sprite ids). */
  readonly content: ContentDb;
  /** Presentation events (SFX). */
  readonly events: EventQueue;
  /** The World's pool registry (the shot pool is registered at creation). */
  readonly pools: {
    /**
     * Registers a pool (load time).
     *
     * @param name - Unique name.
     * @param pool - The pool.
     * @returns The pool.
     */
    register<S extends SoaSchema>(name: string, pool: SoaPool<S>): SoaPool<S>;
  };
  /** The enemies (hit targets). */
  readonly enemies: {
    /** Every enemy slot. */
    readonly enemies: readonly Enemy[];
    /**
     * Damages an enemy (`EnemySystem.damage`).
     *
     * @param enemy - The enemy.
     * @param amount - Damage.
     * @param by - Player slot credited with a kill.
     * @returns `true` when it died from this hit.
     */
    damage(enemy: Enemy, amount: number, by: number): boolean;
  };
}

/** The player weapons of one World (see the module docs). */
export interface WeaponSystem {
  /** The shot pool (registered as `playerShots`). */
  readonly pool: SoaPool<ShotSchema>;
  /** The `LayerId.PlayerShots` mirror batch (lasers take several sprites). */
  readonly batch: SpriteBatch;
  /** The Options' mirror batch (`LayerId.Player`, drawn below the ships). */
  readonly optionBatch: SpriteBatch;
  /** One loadout per player slot. */
  readonly loadouts: readonly Loadout[];
  /** One option group per player slot. */
  readonly options: readonly OptionGroup[];
  /** The weapon of each {@link WeaponRole} (`null` = the role is empty). */
  readonly roleWeapons: readonly (WeaponSpec | null)[];
  /** Autofire timers per shooter: `[shooter × 2]` main, `[shooter × 2 + 1]` missile (hashed). */
  readonly timers: Int32Array;
  /**
   * Live shots per shooter and role, `[shooter × WEAPON_ROLE_COUNT + role]` (recounted at the
   * start of phase 2, raised by every shot fired).
   */
  readonly liveCounts: Int32Array;
  /**
   * Hit-cooldown tables of piercing shots ({@link PIERCE_TABLES} of them): table `t` is
   * `[t × MAX_ENEMIES, (t + 1) × MAX_ENEMIES)`, one entry per enemy slot (ticks left).
   */
  readonly cooldowns: Uint8Array;
  /** Shot slot per hit found by the last {@link WeaponSystem.collide}. */
  readonly hitShot: Int32Array;
  /** Enemy slot per hit (same order: shot order, then enemy slot). */
  readonly hitEnemy: Int32Array;
  /** Hits found by the last {@link WeaponSystem.collide}. */
  readonly hitCount: number;
  /** Hits dropped because {@link MAX_SHOT_HITS} was reached (since creation). */
  readonly hitsDropped: number;
  /** Live shots (removed-this-tick ones included until phase 8). */
  readonly count: number;
  /**
   * Fires one projectile of a role as if its shooter were at (`x`, `y`) — the role's offsets and
   * velocity apply; for the Double it is the angled shot. Ignores caps and timers (tests, debug).
   *
   * @param role - {@link WeaponRole}.
   * @param shooter - Shooter id (`player × SHOOTERS_PER_PLAYER + k`).
   * @param x - Shooter world x.
   * @param y - Shooter world y.
   * @returns The shot slot (stable within the tick), or -1: an empty role, a bad shooter, a full
   *   pool, or no free hit-cooldown table for a piercing shot.
   */
  spawnShot(role: number, shooter: number, x: number, y: number): number;
  /**
   * Live (not removed) shots of a shooter and role, counted now.
   *
   * @param shooter - Shooter id.
   * @param role - {@link WeaponRole}.
   * @returns The count.
   */
  countShots(shooter: number, role: number): number;
  /**
   * Phase 2, after the ships moved: option trails and positions, autofire timers, firing. Never
   * allocates.
   *
   * @remarks
   * Recounts {@link WeaponSystem.liveCounts} and the tables in use, counts every timer down,
   * then per active ship: a fly-in resets the trail on its first tick and records every tick
   * (no firing) — a fly-in of 0 or 1 ticks (`enterTicks ≤ 1`) is over before the weapons see it,
   * so an `alive` ship with `stateTicks` 0 then resets the trail instead; a `dying` / `dead`
   * ship hides its options; an `alive` ship places its options (the trail records with movement
   * input, and on the tick its fly-in ended — the fly-in's last step) and every shooter — ship
   * first, then the options in order — fires its main weapon and its missile when its timer is
   * 0, its cap has room and firing is wanted (see the module docs); a successful fire restarts
   * that timer.
   */
  updatePlayers(): void;
  /**
   * Phase 5: moves every shot (camera ride, behaviour), removes those on terrain or outside the
   * view, counts hit cooldowns down. Never allocates.
   *
   * @remarks
   * Per live shot: `age + 1`, its cooldown table (if any) counted down by one per entry, then by
   * kind —
   * - Straight / Double: `x += camera.dx + vx`, `y += camera.dy + vy`; removed outside the view
   *   ± {@link SHOT_CULL_MARGIN} or on a non-empty terrain pixel;
   * - Laser: its row follows the shooter while that shooter is in play; unblocked, the head
   *   rides the camera and advances `speed`, stopping at the first non-empty terrain column it
   *   crosses (→ `Blocked`), and the length grows by the step up to `maxLength`; blocked, the
   *   head stays put and the length shrinks by `speed + camera.dx` until the beam is gone.
   *   Removed when tail > right edge, head < left edge or its row is outside the view (± margin);
   * - Missile: falling, it rides the camera along its heading and lands when its bottom pixel
   *   meets terrain (a solid pixel at the top of the scan = a wall → removed); sliding, it moves
   *   `slideSpeed` screen-relative and re-snaps to `findFloor` within
   *   `ceil(slideSpeed) + 1` px up or down — a higher step removes it, no floor makes it fall
   *   again. Non-finite positions never touch terrain and are culled.
   */
  update(): void;
  /**
   * Phase 6, after the enemies' hurtboxes are in the grid and it is built: finds this tick's
   * shot × enemy hits ({@link WeaponSystem.hitShot} / {@link WeaponSystem.hitEnemy}). Never
   * allocates.
   *
   * @remarks
   * Each live shot queries the grid with its box (a laser's spans tail to head) and tests the
   * hurtboxes exactly (closed: touching hits; ghost and removed enemies never). A non-piercing
   * shot records the overlapping enemy with the lowest slot; a piercing one every overlapping
   * enemy whose cooldown entry is 0 (armoured ones always), in slot order. The result equals a
   * brute-force test of every shot against every enemy.
   *
   * @param grid - The World's grid.
   */
  collide(grid: SpatialGrid): void;
  /**
   * Phase 7: applies the hits in order. Never allocates.
   *
   * @remarks
   * A hit whose shot is already gone or whose enemy is no longer live (killed by an earlier hit)
   * is skipped — the shot flies on. An armoured enemy (`EnemyFlag.Invulnerable`) takes nothing:
   * the shot dies with a `Clink` SFX. Otherwise `enemies.damage(enemy, damage, player)` (hit
   * flash, `EnemyHit` or the explosion events and the kill record); a non-piercing shot dies, a
   * piercing one starts its cooldown for that enemy.
   */
  applyHits(): void;
  /**
   * Phase 9: refills the shot and option batches. Never allocates.
   *
   * @remarks
   * Live, drawable shots go into {@link WeaponSystem.batch} in pool order; a laser takes
   * `ceil(length / LASER_SEGMENT_LENGTH)` sprites, laid back from its head, the last one clamped
   * to the tail. A full batch ({@link SHOT_BATCH_CAPACITY}) drops what does not fit (drawing only
   * — the shots still simulate). Every option flying this tick goes into
   * {@link WeaponSystem.optionBatch} with the pulse frame `floor(tick / OPTION_ANIM_TICKS) & 1`;
   * nothing when the content's sprites lack `options/orb`.
   */
  sync(): void;
  /**
   * Checkpoint restart: forgets the hits and empties the batches (the pool is cleared by the
   * World).
   */
  clear(): void;
}

/** The shot pool's type. */
type ShotPool = SoaPool<ShotSchema>;

/** Compiled tables of the four roles (load time). */
class RoleTables {
  /** {@link ShotKind} per role, -1 = empty role. */
  readonly kind = new Int32Array(WEAPON_ROLE_COUNT).fill(-1);
  /** Damage per hit. */
  readonly damage = new Int32Array(WEAPON_ROLE_COUNT);
  /** Speed (px/tick). */
  readonly speed = new Float64Array(WEAPON_ROLE_COUNT);
  /** Cap per shooter. */
  readonly cap = new Int32Array(WEAPON_ROLE_COUNT);
  /** 1 = piercing. */
  readonly pierce = new Uint8Array(WEAPON_ROLE_COUNT);
  /** Sprite id (-1 = not drawn). */
  readonly sprite = new Int32Array(WEAPON_ROLE_COUNT).fill(-1);
  /** Ticks between shots. */
  readonly interval = new Int32Array(WEAPON_ROLE_COUNT);
  /** SFX cue (-1 = silent). */
  readonly sfx = new Int32Array(WEAPON_ROLE_COUNT).fill(-1);
  /** Angle parameter (binary units). */
  readonly angle = new Int32Array(WEAPON_ROLE_COUNT);
  /** Laser maximum length. */
  readonly maxLength = new Float64Array(WEAPON_ROLE_COUNT);
  /** Piercing hit cooldown in ticks. */
  readonly cooldown = new Int32Array(WEAPON_ROLE_COUNT);
  /** Missile slide speed. */
  readonly slide = new Float64Array(WEAPON_ROLE_COUNT);
  /** Missile: pixels a slide may climb or drop per tick before it is a wall / a cliff. */
  readonly step = new Int32Array(WEAPON_ROLE_COUNT);
  /** Hitbox half width. */
  readonly hw = new Float64Array(WEAPON_ROLE_COUNT);
  /** Hitbox half height. */
  readonly hh = new Float64Array(WEAPON_ROLE_COUNT);
  /** Spawn offset x. */
  readonly ox = new Float64Array(WEAPON_ROLE_COUNT);
  /** Spawn offset y. */
  readonly oy = new Float64Array(WEAPON_ROLE_COUNT);
  /** Animation frames. */
  readonly frames = new Int32Array(WEAPON_ROLE_COUNT).fill(1);
}

/**
 * A behaviour tunable of a weapon: its `params` value, else the behaviour's default.
 *
 * @param spec - The weapon.
 * @param name - Tunable name.
 * @returns The value (0 when neither exists).
 */
function tunable(spec: WeaponSpec, name: string): number {
  const params = spec.params;
  if (params !== undefined && Object.prototype.hasOwnProperty.call(params, name)) {
    return params[name];
  }
  const defaults = WEAPON_BEHAVIOR_PARAMS[spec.behavior];
  return defaults !== undefined && Object.prototype.hasOwnProperty.call(defaults, name)
    ? defaults[name]
    : 0;
}

/**
 * Compiles the role tables from the content (load time).
 *
 * @param roles - The weapon per role.
 * @param config - Autofire intervals.
 * @returns The tables.
 */
function compileRoles(roles: readonly (WeaponSpec | null)[], config: GameConfig): RoleTables {
  const t = new RoleTables();
  for (let r = 0; r < WEAPON_ROLE_COUNT; r++) {
    const spec = roles[r];
    if (spec === null) continue;
    const kind = Object.prototype.hasOwnProperty.call(WEAPON_BEHAVIOR_KINDS, spec.behavior)
      ? WEAPON_BEHAVIOR_KINDS[spec.behavior]
      : -1;
    if (kind < 0) continue;
    t.kind[r] = kind;
    t.damage[r] = spec.damage;
    t.speed[r] = spec.speed;
    t.cap[r] = spec.cap;
    t.pierce[r] = spec.pierce ? 1 : 0;
    t.sprite[r] = spec.spriteId;
    const fallback = r === WeaponRole.Missile ? config.missileInterval : config.autofireInterval;
    t.interval[r] = spec.refireTicks ?? fallback;
    t.sfx[r] = spec.sfxId ?? -1;
    t.angle[r] = Math.round(tunable(spec, 'angle')) & ANGLE_MASK;
    const maxLength = tunable(spec, 'maxLength');
    t.maxLength[r] = maxLength > 0 ? maxLength : 0;
    const cooldown = Math.round(tunable(spec, 'hitCooldownTicks'));
    t.cooldown[r] = cooldown < 1 ? 1 : cooldown > 255 ? 255 : cooldown;
    const slide = tunable(spec, 'slideSpeed');
    t.slide[r] = slide > 0 ? slide : 0;
    t.step[r] = Math.ceil(t.slide[r]) + 1;
    t.hw[r] = Math.abs(tunable(spec, 'hw'));
    t.hh[r] = Math.abs(tunable(spec, 'hh'));
    t.ox[r] = tunable(spec, 'ox');
    t.oy[r] = tunable(spec, 'oy');
    const frames = Math.floor(tunable(spec, 'frames'));
    t.frames[r] = frames >= 1 ? frames : 1;
  }
  return t;
}

/** The weapon system (a class: monomorphic methods, typed-array fields). */
class WeaponSystemImpl implements WeaponSystem {
  /** See {@link WeaponSystem.pool}. */
  readonly pool: ShotPool;
  /** See {@link WeaponSystem.batch}. */
  readonly batch: SpriteBatch;
  /** See {@link WeaponSystem.optionBatch}. */
  readonly optionBatch: SpriteBatch;
  /** See {@link WeaponSystem.loadouts}. */
  readonly loadouts: readonly Loadout[];
  /** See {@link WeaponSystem.options}. */
  readonly options: readonly OptionGroup[];
  /** See {@link WeaponSystem.roleWeapons}. */
  readonly roleWeapons: readonly (WeaponSpec | null)[];
  /** See {@link WeaponSystem.timers}. */
  readonly timers = new Int32Array(MAX_SHOOTERS * 2);
  /** See {@link WeaponSystem.liveCounts}. */
  readonly liveCounts = new Int32Array(MAX_SHOOTERS * WEAPON_ROLE_COUNT);
  /** See {@link WeaponSystem.cooldowns}. */
  readonly cooldowns = new Uint8Array(PIERCE_TABLES * MAX_ENEMIES);
  /** See {@link WeaponSystem.hitShot}. */
  readonly hitShot = new Int32Array(MAX_SHOT_HITS);
  /** See {@link WeaponSystem.hitEnemy}. */
  readonly hitEnemy = new Int32Array(MAX_SHOT_HITS);
  /** See {@link WeaponSystem.hitCount}. */
  hitCount = 0;
  /** See {@link WeaponSystem.hitsDropped}. */
  hitsDropped = 0;
  /** 1 per hit-cooldown table in use (rebuilt in phase 2, set on allocation). */
  private readonly tableUsed = new Uint8Array(PIERCE_TABLES);
  /** Tick each SFX cue was last pushed (rate limit). */
  private readonly sfxTicks: Float64Array;
  /** The role tables. */
  private readonly roles: RoleTables;
  /** Whether firing needs no button (`autofire || remoteMode`). */
  private readonly alwaysFire: boolean;
  /** The option sprite id (-1 = not drawn). */
  private readonly optionSprite: number;
  /** The World. */
  private readonly host: WeaponHost;
  /** Shooter x of the current fire / lookup (class fields keep fractions unboxed). */
  private fx = 0;
  /** Shooter y of the current fire / lookup. */
  private fy = 0;
  /** Query box of {@link WeaponSystemImpl.visit}: left. */
  private qx0 = 0;
  /** Query box: top. */
  private qy0 = 0;
  /** Query box: right. */
  private qx1 = 0;
  /** Query box: bottom. */
  private qy1 = 0;
  /** Whether the queried shot pierces. */
  private qPierce = false;
  /** The queried shot's cooldown-table offset (table × MAX_ENEMIES). */
  private qTable = 0;
  /** Lowest overlapping enemy slot of a non-piercing query (-1 = none). */
  private qBest = -1;
  /** The queried shot's slot. */
  private qShot = 0;
  /** First hit of the queried shot in the hit list. */
  private qStart = 0;
  /** The grid visitor (bound once). */
  private readonly visitor: SpatialGridVisitor;

  /**
   * Builds the pool, tables, groups and batches (see {@link createWeaponSystem}).
   *
   * @param host - The World.
   */
  constructor(host: WeaponHost) {
    this.host = host;
    this.pool = host.pools.register('playerShots', createSoaPool(MAX_PLAYER_SHOTS, SHOT_SCHEMA));
    this.batch = createSpriteBatch(LayerId.PlayerShots, SHOT_BATCH_CAPACITY);
    this.optionBatch = createSpriteBatch(LayerId.Player, MAX_PLAYERS * MAX_OPTIONS);
    const loadouts: Loadout[] = [];
    const options: OptionGroup[] = [];
    for (let p = 0; p < MAX_PLAYERS; p++) {
      loadouts.push(new Loadout());
      options.push(createOptionGroup());
    }
    this.loadouts = loadouts;
    this.options = options;
    const content = host.content;
    this.roleWeapons = Object.freeze(resolveRoleWeapons(content, resolveWeaponPreset(content)));
    this.roles = compileRoles(this.roleWeapons, host.config);
    this.alwaysFire = host.config.autofire || host.config.remoteMode;
    this.optionSprite = content.sprites.index.get(OPTION_SPRITE) ?? -1;
    this.sfxTicks = new Float64Array(SFX_CUE_NAMES.length).fill(-Infinity);
    this.visitor = (slot: number): void => {
      this.visit(slot);
    };
  }

  /** See {@link WeaponSystem.count}. */
  get count(): number {
    return this.pool.count;
  }

  /** See {@link WeaponSystem.spawnShot}. */
  spawnShot(role: number, shooter: number, x: number, y: number): number {
    if (!(role >= 0 && role < WEAPON_ROLE_COUNT && role % 1 === 0)) return -1;
    if (!(shooter >= 0 && shooter < MAX_SHOOTERS && shooter % 1 === 0)) return -1;
    const kind = this.roles.kind[role];
    if (kind < 0) return -1;
    this.fx = x;
    this.fy = y;
    const t = this.roles;
    if (kind === ShotKind.Double) {
      return this.emit(role, shooter, (ANGLE_UNITS - t.angle[role]) & ANGLE_MASK, 0);
    }
    return this.emit(role, shooter, kind === ShotKind.Missile ? t.angle[role] : 0, 0);
  }

  /** See {@link WeaponSystem.countShots}. */
  countShots(shooter: number, role: number): number {
    const f = this.pool.fields;
    const n = this.pool.count;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if ((f.flags[i] & ShotFlag.Dead) === 0 && f.shooter[i] === shooter && f.role[i] === role) {
        count++;
      }
    }
    return count;
  }

  /**
   * Recounts the live shots per shooter / role and the hit-cooldown tables in use.
   */
  private recount(): void {
    const counts = this.liveCounts;
    counts.fill(0);
    const used = this.tableUsed;
    used.fill(0);
    const f = this.pool.fields;
    const n = this.pool.count;
    for (let i = 0; i < n; i++) {
      if ((f.flags[i] & ShotFlag.Dead) !== 0) continue;
      counts[f.shooter[i] * WEAPON_ROLE_COUNT + f.role[i]]++;
      const table = f.table[i];
      if (table > 0) used[table - 1] = 1;
    }
  }

  /** See {@link WeaponSystem.updatePlayers}. */
  updatePlayers(): void {
    this.recount();
    const timers = this.timers;
    for (let i = 0; i < timers.length; i++) if (timers[i] > 0) timers[i]--;
    const host = this.host;
    const players = host.players;
    const intents = host.intents;
    const camera = host.camera;
    const t = this.roles;
    const missileReady = t.kind[WeaponRole.Missile] >= 0;
    for (let p = 0; p < players.length && p < MAX_PLAYERS; p++) {
      const ship = players[p];
      const group = this.options[p];
      const loadout = this.loadouts[p];
      if (!ship.active) {
        group.hide();
        continue;
      }
      const state = ship.state;
      if (state === 'entering' || state === 'respawning') {
        if (ship.stateTicks <= 1) group.reset(ship, camera);
        else group.follow(ship, camera, loadout.options, true);
        continue;
      }
      if (state !== 'alive') {
        group.hide();
        continue;
      }
      // `stateTicks` 0: the fly-in ended in this phase 2 (updatePlayer moved the ship its last
      // step and switched it to `alive`), so that step is recorded like every fly-in step. A
      // fly-in of at most one tick ended before the weapons ever saw it: the fresh trail starts
      // here, or the options would stay on the zeroed trail (the view's corner) or on the trail
      // from before a death.
      const entered = ship.stateTicks === 0;
      if (entered && host.ship.enterTicks <= 1) group.reset(ship, camera);
      group.follow(ship, camera, loadout.options, entered || ship.moving);
      const held = p < intents.length ? intents[p].held : 0;
      const wantMain = this.alwaysFire || (held & Action.Shot) !== 0;
      const wantSub =
        missileReady && loadout.missile && (this.alwaysFire || (held & Action.Sub) !== 0);
      if (!wantMain && !wantSub) continue;
      const main = this.mainRole(loadout.main);
      const base = p * SHOOTERS_PER_PLAYER;
      const shooters = 1 + group.count;
      for (let k = 0; k < shooters; k++) {
        if (k === 0) {
          this.fx = ship.x;
          this.fy = ship.y;
        } else {
          this.fx = group.x[k - 1];
          this.fy = group.y[k - 1];
        }
        const s = base + k;
        if (wantMain && main >= 0 && timers[s * 2] === 0 && this.fire(main, s)) {
          timers[s * 2] = t.interval[main];
        }
        if (wantSub && timers[s * 2 + 1] === 0 && this.fire(WeaponRole.Missile, s)) {
          timers[s * 2 + 1] = t.interval[WeaponRole.Missile];
        }
      }
    }
  }

  /**
   * The role a loadout's main weapon fires (an empty Double / Laser role falls back to the main
   * shot).
   *
   * @param main - {@link MainWeapon}.
   * @returns The role, or -1 when even the main shot is empty.
   */
  private mainRole(main: number): number {
    const kinds = this.roles.kind;
    if (main === MainWeapon.Double && kinds[WeaponRole.Double] >= 0) return WeaponRole.Double;
    if (main === MainWeapon.Laser && kinds[WeaponRole.Laser] >= 0) return WeaponRole.Laser;
    return kinds[WeaponRole.Main] >= 0 ? WeaponRole.Main : -1;
  }

  /**
   * Fires a role from {@link WeaponSystemImpl.fx} / `fy` when the shooter's cap allows.
   *
   * @param role - The role (non-empty).
   * @param s - Shooter id.
   * @returns Whether anything was fired.
   */
  private fire(role: number, s: number): boolean {
    const t = this.roles;
    const kind = t.kind[role];
    const live = this.liveCounts[s * WEAPON_ROLE_COUNT + role];
    let fired: boolean;
    if (kind === ShotKind.Double) {
      // "No refire until both are gone": the pair needs every earlier shot of the role gone.
      if (live > 0 || t.cap[role] < 1) return false;
      fired = this.emit(role, s, 0, 1) >= 0;
      if (
        t.cap[role] >= 2 &&
        this.emit(role, s, (ANGLE_UNITS - t.angle[role]) & ANGLE_MASK, 0) >= 0
      ) {
        fired = true;
      }
    } else {
      if (live >= t.cap[role]) return false;
      fired = this.emit(role, s, kind === ShotKind.Missile ? t.angle[role] : 0, 0) >= 0;
    }
    if (fired) this.sfx(t.sfx[role]);
    return fired;
  }

  /**
   * Pushes an SFX cue at the shooter (whole pixels) unless the same cue was pushed less than
   * {@link SFX_RATE_TICKS} ticks ago.
   *
   * @param cue - The cue (-1 = none).
   */
  private sfx(cue: number): void {
    if (cue < 0 || cue >= this.sfxTicks.length) return;
    const tick = this.host.tick;
    if (tick - this.sfxTicks[cue] < SFX_RATE_TICKS) return;
    this.sfxTicks[cue] = tick;
    // Whole pixels (plenty for panning): fractional arguments of a call V8 does not inline are
    // boxed into heap numbers — an allocation per sound.
    this.host.events.push(
      SimEventKind.Sfx,
      cue,
      Math.floor(this.fx) | 0,
      Math.floor(this.fy) | 0,
      0,
    );
  }

  /**
   * Allocates and fills one shot at the shooter position {@link WeaponSystemImpl.fx} / `fy`.
   *
   * @param role - The role (non-empty).
   * @param s - Shooter id.
   * @param angle - Heading (whole binary units).
   * @param forward - 1 = the forward shot of a Double (drawn, offset and sized like the main
   *   shot), 0 = the role's own shot.
   * @returns The slot, or -1.
   */
  private emit(role: number, s: number, angle: number, forward: number): number {
    const t = this.roles;
    const pierce = t.pierce[role] === 1;
    let table = 0;
    if (pierce) {
      const used = this.tableUsed;
      for (let k = 0; k < PIERCE_TABLES; k++) {
        if (used[k] === 0) {
          table = k + 1;
          break;
        }
      }
      if (table === 0) return -1;
    }
    const i = this.pool.alloc();
    if (i < 0) return -1;
    if (table > 0) {
      this.tableUsed[table - 1] = 1;
      const base = (table - 1) * MAX_ENEMIES;
      this.cooldowns.fill(0, base, base + MAX_ENEMIES);
    }
    const f = this.pool.fields;
    const look = forward === 1 && t.kind[WeaponRole.Main] >= 0 ? WeaponRole.Main : role;
    f.x[i] = this.fx + t.ox[look];
    f.y[i] = this.fy + t.oy[look];
    const a = angle & ANGLE_MASK;
    const speed = t.speed[role];
    const kind = t.kind[role];
    if (kind === ShotKind.Laser) {
      f.vx[i] = speed;
      f.vy[i] = 0;
    } else {
      f.vx[i] = (SIN_TABLE_Q16[a + ANGLE_QUARTER] / TRIG_SCALE) * speed;
      f.vy[i] = (SIN_TABLE_Q16[a] / TRIG_SCALE) * speed;
    }
    f.hw[i] = t.hw[look];
    f.hh[i] = t.hh[look];
    f.damage[i] = t.damage[role];
    f.role[i] = role;
    f.kind[i] = kind;
    f.shooter[i] = s;
    f.flags[i] = pierce ? ShotFlag.Pierce : 0;
    const sprite = forward === 1 && t.sprite[look] >= 0 ? t.sprite[look] : t.sprite[role];
    f.sprite[i] = sprite < 0 ? 0 : sprite;
    f.draw[i] = sprite < 0 ? SpriteFlag.Hidden : 0;
    f.table[i] = table;
    this.liveCounts[s * WEAPON_ROLE_COUNT + role]++;
    return i;
  }

  /**
   * Looks a shooter up: sets {@link WeaponSystemImpl.fx} / `fy` to its position when it is in
   * play (an `alive` ship, or an option it currently flies).
   *
   * @param s - Shooter id.
   * @returns Whether it is in play.
   */
  private locate(s: number): boolean {
    const p = (s / SHOOTERS_PER_PLAYER) | 0;
    const k = s - p * SHOOTERS_PER_PLAYER;
    const players = this.host.players;
    if (p >= players.length) return false;
    const ship = players[p];
    if (!ship.active || ship.state !== 'alive') return false;
    if (k === 0) {
      this.fx = ship.x;
      this.fy = ship.y;
      return true;
    }
    const group = this.options[p];
    if (k - 1 >= group.count) return false;
    this.fx = group.x[k - 1];
    this.fy = group.y[k - 1];
    return true;
  }

  /**
   * Removes a shot (freed in phase 8).
   *
   * @param i - The slot.
   */
  private kill(i: number): void {
    const f = this.pool.fields;
    f.flags[i] |= ShotFlag.Dead;
    f.draw[i] |= SpriteFlag.Hidden;
    this.pool.free(i);
  }

  /**
   * See {@link WeaponSystem.update}.
   *
   * @remarks
   * One method with every behaviour inline (see `core/bullets` `update` for why a hot per-tick
   * loop stays in the method the World calls).
   */
  update(): void {
    const pool = this.pool;
    const f = pool.fields;
    const n = pool.count;
    const camera = this.host.camera;
    const dx = camera.dx;
    const dy = camera.dy;
    const left = camera.x - SHOT_CULL_MARGIN;
    const top = camera.y - SHOT_CULL_MARGIN;
    const right = camera.x + PLAYFIELD_W + SHOT_CULL_MARGIN;
    const bottom = camera.y + PLAYFIELD_H + SHOT_CULL_MARGIN;
    const map = this.host.terrain;
    const t = this.roles;
    const cooldowns = this.cooldowns;
    for (let i = 0; i < n; i++) {
      let flags = f.flags[i];
      if ((flags & ShotFlag.Dead) !== 0) continue;
      const age = f.age[i] + 1;
      f.age[i] = age;
      const role = f.role[i];
      const kind = f.kind[i];
      const table = f.table[i];
      if (table > 0) {
        const base = (table - 1) * MAX_ENEMIES;
        for (let e = base; e < base + MAX_ENEMIES; e++) if (cooldowns[e] > 0) cooldowns[e]--;
      }
      if (kind === ShotKind.Laser) {
        if (this.locate(f.shooter[i])) f.y[i] = this.fy;
        const y = f.y[i];
        const speed = t.speed[role];
        if ((flags & ShotFlag.Blocked) === 0) {
          const from = f.x[i] + dx;
          let head = from + speed;
          if (map !== null) {
            const row = Math.floor(y) | 0;
            const c1 = Math.floor(head) | 0;
            for (let c = (Math.floor(from) | 0) + 1; c <= c1; c++) {
              if (terrainAt(map, c, row) !== TerrainType.Empty) {
                head = c;
                flags |= ShotFlag.Blocked;
                f.flags[i] = flags;
                break;
              }
            }
          }
          f.x[i] = head;
          let length = f.length[i] + (head - from);
          if (length > t.maxLength[role]) length = t.maxLength[role];
          f.length[i] = length;
        } else {
          // The head stays at its wall (world-anchored); the tail rides the camera and advances.
          const length = f.length[i] - (speed + dx);
          if (!(length > 0)) {
            this.kill(i);
            continue;
          }
          f.length[i] = length;
        }
        const x = f.x[i];
        // "Not inside", so NaN positions are culled too.
        if (!(x - f.length[i] <= right && x >= left && y >= top && y <= bottom)) this.kill(i);
        continue;
      }
      if (kind === ShotKind.Missile) {
        const frames = t.frames[role];
        f.frame[i] = frames > 1 ? (age >> 2) % frames : 0;
        const hh = f.hh[i];
        const foot = hh + 0.5;
        if ((flags & ShotFlag.Sliding) === 0) {
          const x = f.x[i] + dx + f.vx[i];
          const y = f.y[i] + dy + f.vy[i];
          f.x[i] = x;
          f.y[i] = y;
          // A non-finite position (`| 0` would read it as pixel 0 and land it on row 0's rock)
          // never touches terrain: the cull below removes it.
          if (map !== null && x - x === 0 && y - y === 0) {
            const px = Math.floor(x) | 0;
            const low = Math.floor(y + hh) | 0;
            if (terrainAt(map, px, low) !== TerrainType.Empty) {
              // Landed (or flew into a wall): the surface above the contact, if any.
              const scan = (Math.floor(y - hh) | 0) - t.step[role];
              const surface = findFloor(map, px, scan, low - scan);
              if (!(surface > scan)) {
                this.kill(i);
                continue;
              }
              f.y[i] = surface - foot;
              f.flags[i] = flags | ShotFlag.Sliding;
            }
          }
        } else if (map !== null) {
          const x = f.x[i] + dx + t.slide[role];
          const step = t.step[role];
          // Scan rows surface − step − 1 … surface + step: a surface at the first row is a wall.
          const scan = (Math.floor(f.y[i] + foot) | 0) - step - 1;
          const surface = findFloor(map, Math.floor(x) | 0, scan, 2 * step + 1);
          f.x[i] = x;
          if (surface !== surface) {
            // A cliff: fall again along the launch heading.
            f.flags[i] = flags & ~ShotFlag.Sliding;
            f.y[i] += dy;
          } else if (!(surface > scan)) {
            this.kill(i);
            continue;
          } else {
            f.y[i] = surface - foot;
          }
        } else {
          f.flags[i] = flags & ~ShotFlag.Sliding;
        }
        const mx = f.x[i];
        const my = f.y[i];
        if (!(mx >= left && mx <= right && my >= top && my <= bottom)) this.kill(i);
        continue;
      }
      // Straight and Double shots.
      const x = f.x[i] + dx + f.vx[i];
      const y = f.y[i] + dy + f.vy[i];
      f.x[i] = x;
      f.y[i] = y;
      if (!(x >= left && x <= right && y >= top && y <= bottom)) {
        this.kill(i);
      } else if (
        map !== null &&
        terrainAt(map, Math.floor(x) | 0, Math.floor(y) | 0) !== TerrainType.Empty
      ) {
        this.kill(i);
      }
    }
  }

  /** See {@link WeaponSystem.collide}. */
  collide(grid: SpatialGrid): void {
    this.hitCount = 0;
    const f = this.pool.fields;
    const n = this.pool.count;
    for (let i = 0; i < n; i++) {
      const flags = f.flags[i];
      if ((flags & ShotFlag.Dead) !== 0) continue;
      const x = f.x[i];
      const y = f.y[i];
      const hh = f.hh[i];
      if (f.kind[i] === ShotKind.Laser) {
        this.qx0 = x - f.length[i];
        this.qx1 = x;
      } else {
        this.qx0 = x - f.hw[i];
        this.qx1 = x + f.hw[i];
      }
      this.qy0 = y - hh;
      this.qy1 = y + hh;
      // "Not a box" (NaN) queries nothing.
      if (!(this.qx0 <= this.qx1 && this.qy0 <= this.qy1)) continue;
      const pierce = (flags & ShotFlag.Pierce) !== 0;
      this.qPierce = pierce;
      this.qTable = pierce ? (f.table[i] - 1) * MAX_ENEMIES : 0;
      this.qBest = -1;
      this.qShot = i;
      this.qStart = this.hitCount;
      grid.query(
        Math.floor(this.qx0) | 0,
        Math.floor(this.qy0) | 0,
        Math.ceil(this.qx1) | 0,
        Math.ceil(this.qy1) | 0,
        this.visitor,
      );
      if (!pierce && this.qBest >= 0) this.addHit(i, this.qBest);
    }
  }

  /**
   * Grid visitor of {@link WeaponSystemImpl.collide}: exact box test against one enemy.
   *
   * @param slot - The enemy slot the grid returned.
   */
  private visit(slot: number): void {
    const enemies = this.host.enemies.enemies;
    if (!(slot >= 0 && slot < enemies.length)) return;
    const e = enemies[slot];
    if (e.state !== EnemyState.Live || (e.flags & EnemyFlag.Ghost) !== 0) return;
    const ex = e.x;
    const ey = e.y;
    // Closed test written as "not overlapping", so NaN never overlaps.
    if (!(
      ex + e.hw >= this.qx0 &&
      ex - e.hw <= this.qx1 &&
      ey + e.hh >= this.qy0 &&
      ey - e.hh <= this.qy1
    )) {
      return;
    }
    if (!this.qPierce) {
      if (this.qBest < 0 || slot < this.qBest) this.qBest = slot;
      return;
    }
    if ((e.flags & EnemyFlag.Invulnerable) === 0 && this.cooldowns[this.qTable + slot] > 0) return;
    // Insert in enemy-slot order among this shot's hits (grid order is cell order).
    if (this.hitCount >= MAX_SHOT_HITS) {
      this.hitsDropped++;
      return;
    }
    let k = this.hitCount;
    const start = this.qStart;
    while (k > start && this.hitEnemy[k - 1] > slot) {
      this.hitShot[k] = this.hitShot[k - 1];
      this.hitEnemy[k] = this.hitEnemy[k - 1];
      k--;
    }
    this.hitShot[k] = this.qShot;
    this.hitEnemy[k] = slot;
    this.hitCount++;
  }

  /**
   * Appends a hit to the list.
   *
   * @param shot - Shot slot.
   * @param enemy - Enemy slot.
   */
  private addHit(shot: number, enemy: number): void {
    const k = this.hitCount;
    if (k >= MAX_SHOT_HITS) {
      this.hitsDropped++;
      return;
    }
    this.hitShot[k] = shot;
    this.hitEnemy[k] = enemy;
    this.hitCount = k + 1;
  }

  /** See {@link WeaponSystem.applyHits}. */
  applyHits(): void {
    const f = this.pool.fields;
    const enemySystem = this.host.enemies;
    const enemies = enemySystem.enemies;
    const t = this.roles;
    for (let k = 0; k < this.hitCount; k++) {
      const i = this.hitShot[k];
      const flags = f.flags[i];
      if ((flags & ShotFlag.Dead) !== 0) continue;
      const e = enemies[this.hitEnemy[k]];
      if (e.state !== EnemyState.Live || (e.flags & EnemyFlag.Ghost) !== 0) continue;
      if ((e.flags & EnemyFlag.Invulnerable) !== 0) {
        this.fx = f.x[i];
        this.fy = f.y[i];
        this.sfx(SFX_CUES.Clink);
        this.kill(i);
        continue;
      }
      enemySystem.damage(e, f.damage[i], (f.shooter[i] / SHOOTERS_PER_PLAYER) | 0);
      if ((flags & ShotFlag.Pierce) !== 0) {
        this.cooldowns[(f.table[i] - 1) * MAX_ENEMIES + e.slot] = t.cooldown[f.role[i]];
      } else {
        this.kill(i);
      }
    }
  }

  /** See {@link WeaponSystem.sync}. */
  sync(): void {
    const batch = this.batch;
    batch.count = 0;
    const f = this.pool.fields;
    const n = this.pool.count;
    const cap = batch.capacity;
    for (let i = 0; i < n; i++) {
      const draw = f.draw[i];
      if ((f.flags[i] & ShotFlag.Dead) !== 0 || (draw & SpriteFlag.Hidden) !== 0) continue;
      const x = f.x[i];
      const y = f.y[i];
      const sprite = f.sprite[i];
      if (f.kind[i] === ShotKind.Laser) {
        const length = f.length[i];
        const tail = x - length;
        const segments = Math.ceil(length / LASER_SEGMENT_LENGTH) | 0;
        for (let s = 1; s <= segments; s++) {
          let sx = x - s * LASER_SEGMENT_LENGTH;
          if (sx < tail) sx = tail;
          const slot = batch.count;
          if (slot >= cap) break;
          batch.x[slot] = sx;
          batch.y[slot] = y;
          batch.spriteId[slot] = sprite;
          batch.frame[slot] = 0;
          batch.flags[slot] = draw;
          batch.count = slot + 1;
        }
        continue;
      }
      const slot = batch.count;
      if (slot >= cap) continue;
      batch.x[slot] = x;
      batch.y[slot] = y;
      batch.spriteId[slot] = sprite;
      batch.frame[slot] = f.frame[i];
      batch.flags[slot] = draw;
      batch.count = slot + 1;
    }
    const options = this.optionBatch;
    options.count = 0;
    const sprite = this.optionSprite;
    if (sprite < 0) return;
    const frame = Math.floor(this.host.tick / OPTION_ANIM_TICKS) & 1;
    for (let p = 0; p < this.options.length; p++) {
      const group = this.options[p];
      for (let k = 0; k < group.count; k++) {
        const slot = options.count;
        if (slot >= options.capacity) return;
        options.x[slot] = group.x[k];
        options.y[slot] = group.y[k];
        options.spriteId[slot] = sprite;
        options.frame[slot] = frame;
        options.flags[slot] = 0;
        options.count = slot + 1;
      }
    }
  }

  /** See {@link WeaponSystem.clear}. */
  clear(): void {
    this.hitCount = 0;
    this.batch.count = 0;
    this.optionBatch.count = 0;
    this.tableUsed.fill(0);
    this.liveCounts.fill(0);
  }
}

/**
 * Creates the weapon system of a World (load time): the shot pool (registered as `playerShots`),
 * one loadout and option group per player, the role tables compiled from the content's preset
 * (sprite ids, SFX, tunables, intervals from the config), the hit list and the batches.
 *
 * @param host - The World (read at every call — pass the World itself).
 * @returns The system.
 * @throws {Error} When the World already registered a pool named `playerShots`.
 *
 * @example
 * ```ts
 * const weapons = createWeaponSystem(world);
 * applyLoadoutPreset(weapons.loadouts[0], world.players[0], 'full');
 * ```
 */
export function createWeaponSystem(host: WeaponHost): WeaponSystem {
  return new WeaponSystemImpl(host);
}
