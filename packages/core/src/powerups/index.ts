/**
 * # powerups — power-up economy (Meter mode + Direct mode) and pickups
 *
 * **Status: partial.** Meter mode is implemented (plan M1-11): the 7-slot power meter, equipping
 * on the PowerUp press, Auto Power-Up, power capsules (item pool, pickup magnet, pickups), the
 * Force Field grant (`core/shields`) and Mega Crash. Direct-mode items arrive with M2-05; Weapon
 * Edit / parking UI with M2-03.
 *
 * **Responsibility.** Both power-up models. **Meter mode** (Gradius): the 7-slot meter
 * `SPEED UP | MISSILE | DOUBLE | LASER | OPTION | ? | !`, each capsule advances the cursor
 * (wrapping), the PowerUp action equips the highlighted slot, maxed slots are greyed,
 * DOUBLE/LASER are exclusive, optional Auto Power-Up, and — unlike Gradius III — capsules
 * grabbed in quick succession each count. **Direct mode** (Darius): coloured items
 * (red shot, green sub, blue shield, orange 1UP, yellow smart bomb, red-octagon family
 * switch) dropped by cube carriers. Also pickup entities (drift, despawn) and pickup
 * feedback events.
 *
 * **The meter** ({@link PowerMeter}, one per player). `cursor` is -1 (nothing highlighted) or a
 * {@link MeterSlot}. A capsule advances it ({@link advanceMeter}: −1 → Speed, then one slot per
 * capsule, wrapping after `!`). The **pressed edge** of `Action.PowerUp` (remote OK in the game
 * context — holding it never re-equips) equips the highlighted slot when {@link canEquipSlot}
 * allows it and resets the cursor to -1; otherwise it pushes `SFX PowerUpDenied`. Slot rules:
 *
 * | Slot | Equips | Greyed (cannot be equipped) when |
 * |---|---|---|
 * | Speed | ship speed level + 1 | at the top speed (`speeds.length − 1`: 5 Speed Ups) |
 * | Missile | the Missile | already owned |
 * | Double | main = Double (replaces the Laser) | Double already current |
 * | Laser | main = Laser (replaces the Double) | Laser already current |
 * | Option | one more Option | 4 Options |
 * | `?` | a fresh Force Field (`core/shields`) | a shield is up |
 * | `!` | Mega Crash | never |
 *
 * **Auto Power-Up** (`GameConfig.autoPowerUp`, decision D2): the order
 * (`GameConfig.autoPowerUpOrder`, default Speed → Missile → Laser → Option ×4 → `?`) is compiled at
 * creation; the **next wanted slot** is the first entry the loadout does not satisfy yet (a slot
 * listed `n` times wants level `n` — capped at the maximum; a Double / Laser entry is also
 * satisfied by a later Double / Laser entry of the order; `?` wants a shield up; `!` is never
 * satisfied). When a capsule moves the cursor onto the next wanted slot and it can be equipped,
 * it is equipped at once. The order is re-evaluated every time, so losses (a broken shield, a
 * death penalty) are wanted again.
 *
 * **Items** — a struct-of-arrays pool of {@link MAX_ITEMS} (32) registered with the World as
 * `items` (flushed in phase 8, hashed). Capsules ({@link ItemKind.Capsule}) are world-space: they
 * stay where they dropped and scroll away with the terrain; they are removed
 * {@link ITEM_CULL_MARGIN} px outside the view. With `GameConfig.pickupMagnet` (decision D33) an
 * item within {@link PICKUP_MAGNET_RANGE} px of an alive ship's pickup box drifts towards the
 * nearest such ship at {@link PICKUP_MAGNET_SPEED} px/tick. A ship collects every item whose
 * circle ({@link ITEM_RADIUS}) touches its pickup box (closed test; the lowest player slot wins
 * a tie); **every pickup advances the meter** (no merging, shmup_feat.md §6A), pushes the meter
 * "ding" (`SFX MeterAdvance`) and records {@link CAPSULE_SCORE} (300) points in
 * {@link PowerUpSystem.outcomes} for scoring (M1-12).
 *
 * **Capsule sources** — every drop in the enemy system's tick outcomes (`drop: 'capsule'` enemies
 * and completed formations, M1-08) becomes a capsule where it happened, at the end of phase 7 (and,
 * for kills made between ticks by tools, at the start of the next phase 3).
 *
 * **Mega Crash** (the `!` slot): equipping it arms a detonation that runs in phase 7 of the same
 * tick (so its kills are scored and drop capsules like any other): every cancelable enemy bullet
 * and laser is cancelled with sparkles (`core/bullets` `cancelAllBullets`), every enemy that is not
 * `megaCrashImmune` is destroyed and credited to the player (`EnemySystem.megaCrash`), and a
 * {@link MEGA_CRASH_FLASH_TICKS}-tick screen flash (`SimEventKind.Flash`) and `SFX MegaCrash` are
 * pushed. Bosses (M1-13) take no damage.
 *
 * **Shields.** The `?` slot grants the Force Field on `PlayerShip.shield`; this system counts its
 * i-frames down in phase 7 and pushes `SFX ShieldHit` / `SFX ShieldBreak` + `FX ShieldBreak` for
 * the tick's absorbed hits in phase 7; the view shows it as a sprite around the ship in its wear
 * frame (blinking during its i-frames).
 *
 * **Tick.** Phase 2 — {@link PowerUpSystem.updatePlayers} (after the ships moved, before the
 * weapons fire, so a new weapon or Option fires on the tick it is equipped). Phase 3 —
 * {@link PowerUpSystem.beginTick} (before the enemy outcomes reset). Phase 5 —
 * {@link PowerUpSystem.update}. Phase 6 — {@link PowerUpSystem.collide}. Phase 7 —
 * {@link PowerUpSystem.resolve} (after the player shots' hits). Phase 9 —
 * {@link PowerUpSystem.sync}.
 *
 * **Zero allocation.** The pool, meters, tables and batches are built by
 * {@link createPowerUpSystem}; per-tick code writes numbers and pushes events at whole pixels.
 *
 * **Implements.**
 * - shmup_feat.md §6 Power-up systems — 6A the 7-slot meter, cursor advance and wrap, equip on the
 *   power-up button, maxed slots greyed, Double / Laser exclusive, capsule sources (red enemies,
 *   whole formations), 300-point capsules, every quick pickup counts, Auto Power-Up; 6C pickup
 *   feedback
 * - shmup_feat.md §7A — the `!` slot: Mega Crash (bullets and small enemies, no boss damage)
 * - shmup_feat.md §4 rule 4 — OK = equip, a rare non-urgent press; Auto Power-Up for the remote
 * - shmup_feat.md §11 — capsule carriers and formation-kill drops
 *
 * **Public API.** {@link createPowerUpSystem}, {@link PowerUpSystem}, {@link PowerUpHost},
 * {@link PowerUpOutcomes}, {@link PowerMeter}, {@link createPowerMeter}, {@link advanceMeter},
 * {@link canEquipSlot}, {@link equipSlot}, {@link equippableSlots}, {@link meterSlotOf},
 * {@link MeterSlot}, {@link METER_SLOT_COUNT}, {@link METER_LABELS}, {@link ItemKind},
 * {@link ITEM_KINDS}, {@link ItemKindSpec}, {@link ItemFlag}, {@link ITEM_SCHEMA},
 * {@link ItemSchema}, {@link ITEM_SPRITES}, {@link CAPSULE_SPRITE}, {@link MAX_ITEMS},
 * {@link CAPSULE_SCORE}, {@link ITEM_RADIUS}, {@link PICKUP_MAGNET_RANGE},
 * {@link PICKUP_MAGNET_SPEED}, {@link ITEM_CULL_MARGIN}, {@link ITEM_BLINK_TICKS},
 * {@link MEGA_CRASH_FLASH_TICKS}, {@link DirectItem}.
 *
 * **Planned API.** Direct-mode items `applyDirectItem(player, item)` (M2-05); `!`-slot variants
 * and Weapon Edit (M2-03).
 *
 * @module
 */
import { CancelMode } from '../bullets/index.js';
import {
  METER_SLOT_NAMES,
  PLAYFIELD_H,
  PLAYFIELD_W,
  type GameConfig,
  type MeterSlotName,
} from '../config/index.js';
import type { ContentDb, PlayerShipSpec } from '../data/index.js';
import { DropKind, type EnemyOutcomes } from '../enemies/index.js';
import { FX_CUES, SFX_CUES, SimEventKind, type EventQueue } from '../events/index.js';
import { Action, MAX_PLAYERS } from '../input/index.js';
import { defineModule } from '../module-info.js';
import { MAX_OPTIONS } from '../options/index.js';
import type { PlayerCamera, PlayerIntent, PlayerShip } from '../player/index.js';
import { createSoaPool, type SoaPool, type SoaSchema } from '../pools/index.js';
import { LayerId, SpriteFlag, createSpriteBatch, type SpriteBatch } from '../presentation/index.js';
import {
  FORCE_FIELD,
  grantShield,
  shieldActive,
  shieldWearFrame,
  tickShield,
} from '../shields/index.js';
import { MainWeapon, type Loadout } from '../weapons/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'powerups',
  status: 'partial',
  specRefs: ['shmup_feat.md §6', 'shmup_feat.md §7', 'shmup_feat.md §4', 'shmup_feat.md §11'],
});

/** Darius-style direct items (M2-05). */
export type DirectItem = 'red' | 'green' | 'blue' | 'orange' | 'yellow' | 'octagon';

/** The power-meter slots as codes, in meter order (`config` `METER_SLOT_NAMES` order). */
export const MeterSlot = {
  /** SPEED UP: one more speed level. */
  Speed: 0,
  /** MISSILE. */
  Missile: 1,
  /** DOUBLE (exclusive with the Laser). */
  Double: 2,
  /** LASER (exclusive with the Double). */
  Laser: 3,
  /** OPTION: one more Option (up to 4). */
  Option: 4,
  /** `?`: the Force Field. */
  Shield: 5,
  /** `!`: Mega Crash. */
  Mega: 6,
} as const;

/** A {@link MeterSlot} code. */
export type MeterSlot = (typeof MeterSlot)[keyof typeof MeterSlot];

/** Slots on the meter. */
export const METER_SLOT_COUNT = 7;

/** HUD labels of the slots, by code (shmup_feat.md §6A; the `hud/meter-labels` frames). */
export const METER_LABELS: readonly string[] = Object.freeze([
  'SPEED',
  'MISSILE',
  'DOUBLE',
  'LASER',
  'OPTION',
  '?',
  '!',
]);

/**
 * The code of a slot name.
 *
 * @param name - A `config` {@link MeterSlotName}.
 * @returns Its {@link MeterSlot} code (-1 for an unknown name).
 */
export function meterSlotOf(name: MeterSlotName): number {
  return METER_SLOT_NAMES.indexOf(name);
}

/** Item slots of a session (both players' capsules). */
export const MAX_ITEMS = 32;

/** Points a capsule is worth (shmup_feat.md §6A; scored by M1-12). */
export const CAPSULE_SCORE = 300;

/** Collision radius of an item (the 12×8 capsule). */
export const ITEM_RADIUS = 5;

/** The pickup magnet reaches items this many pixels outside a ship's pickup box (D33). */
export const PICKUP_MAGNET_RANGE = 16;

/** Speed in px/tick at which the magnet pulls an item towards the ship. */
export const PICKUP_MAGNET_SPEED = 2;

/** Items are removed once they are this many pixels outside the camera view. */
export const ITEM_CULL_MARGIN = 32;

/** Ticks per frame of an item's two-frame blink. */
export const ITEM_BLINK_TICKS = 8;

/** Length of Mega Crash's screen flash in ticks (`SimEventKind.Flash` param). */
export const MEGA_CRASH_FLASH_TICKS = 12;

/** The power capsule's sprite (an engine sprite — see core `world` `ENGINE_SPRITES`). */
export const CAPSULE_SPRITE = 'items/capsule';

/** Kinds of item. Codes are hashed: append, never renumber. */
export const ItemKind = {
  /** A meter-mode power capsule. */
  Capsule: 0,
} as const;

/** An {@link ItemKind} code. */
export type ItemKind = (typeof ItemKind)[keyof typeof ItemKind];

/** One item kind (built in until Direct-mode items bring data). */
export interface ItemKindSpec {
  /** Sprite name. */
  readonly sprite: string;
  /** Animation frames (a blink when 2). */
  readonly frames: number;
  /** Points recorded when collected. */
  readonly score: number;
}

/** Item kinds by {@link ItemKind} code. */
export const ITEM_KINDS: readonly ItemKindSpec[] = Object.freeze([
  Object.freeze({ sprite: CAPSULE_SPRITE, frames: 2, score: CAPSULE_SCORE }),
]);

/** The sprites of every item kind (part of the World's `ENGINE_SPRITES`). */
export const ITEM_SPRITES: readonly string[] = Object.freeze(ITEM_KINDS.map((kind) => kind.sprite));

/** Flag bits of an item ({@link ITEM_SCHEMA} `flags`). */
export const ItemFlag = {
  /** Collected or culled this tick (the slot is freed in phase 8). */
  Dead: 1,
  /** Pulled by the pickup magnet this tick. */
  Magnet: 2,
} as const;

/** Field layout of the item pool (hashed in sorted field order). */
export const ITEM_SCHEMA = Object.freeze({
  /** World x of the centre. */
  x: 'f64',
  /** World y of the centre. */
  y: 'f64',
  /** Own velocity x in world px/tick (0 for capsules: they stay with the terrain). */
  vx: 'f64',
  /** Own velocity y. */
  vy: 'f64',
  /** {@link ItemKind}. */
  kind: 'u8',
  /** Ticks since it dropped. */
  age: 'i32',
  /** {@link ItemFlag} bits. */
  flags: 'u8',
} as const);

/** The item pool's schema type. */
export type ItemSchema = typeof ITEM_SCHEMA;

/** One player's power meter (a class: its field stays an unboxed small integer). */
export class PowerMeter {
  /** Highlighted {@link MeterSlot}, or -1 for none. */
  cursor = -1;
}

/**
 * Creates a meter with nothing highlighted.
 *
 * @returns The meter.
 */
export function createPowerMeter(): PowerMeter {
  return new PowerMeter();
}

/**
 * Advances the cursor by one slot (a capsule): −1 → Speed, … `!` → Speed (wraps).
 *
 * @remarks
 * A cursor that is not a slot or -1 (a debug tool wrote it — NaN included) comes back to Speed
 * instead of staying out of range.
 *
 * @param meter - The meter.
 * @returns The new cursor.
 *
 * @example
 * ```ts
 * const meter = createPowerMeter();
 * advanceMeter(meter); // → MeterSlot.Speed
 * ```
 */
export function advanceMeter(meter: PowerMeter): number {
  const next = meter.cursor + 1;
  // "Not a slot", so a NaN cursor recovers too.
  meter.cursor = next >= 0 && next < METER_SLOT_COUNT ? next : 0;
  return meter.cursor;
}

/**
 * Whether a slot can be equipped now (see the module docs' table: maxed slots are greyed).
 *
 * @param slot - {@link MeterSlot} code.
 * @param ship - The player's ship (speed level, shield).
 * @param loadout - The player's loadout.
 * @param maxSpeedLevel - The ship's top speed level (`speeds.length − 1`).
 * @returns `false` for a maxed slot or an unknown code.
 */
export function canEquipSlot(
  slot: number,
  ship: Readonly<Pick<PlayerShip, 'speedLevel' | 'shield'>>,
  loadout: Readonly<Loadout>,
  maxSpeedLevel: number,
): boolean {
  switch (slot) {
    case MeterSlot.Speed:
      return ship.speedLevel < maxSpeedLevel;
    case MeterSlot.Missile:
      return !loadout.missile;
    case MeterSlot.Double:
      return loadout.main !== MainWeapon.Double;
    case MeterSlot.Laser:
      return loadout.main !== MainWeapon.Laser;
    case MeterSlot.Option:
      return loadout.options < MAX_OPTIONS;
    case MeterSlot.Shield:
      return !shieldActive(ship.shield);
    case MeterSlot.Mega:
      return true;
    default:
      return false;
  }
}

/**
 * Bit mask of the slots that can be equipped now (bit `slot`; the HUD greys the others).
 *
 * @param ship - The player's ship.
 * @param loadout - The player's loadout.
 * @param maxSpeedLevel - The ship's top speed level.
 * @returns The mask (bits 0–6).
 */
export function equippableSlots(
  ship: Readonly<Pick<PlayerShip, 'speedLevel' | 'shield'>>,
  loadout: Readonly<Loadout>,
  maxSpeedLevel: number,
): number {
  let mask = 0;
  for (let slot = 0; slot < METER_SLOT_COUNT; slot++) {
    if (canEquipSlot(slot, ship, loadout, maxSpeedLevel)) mask |= 1 << slot;
  }
  return mask;
}

/**
 * Applies a slot's effect to a ship and loadout when {@link canEquipSlot} allows it. Mega Crash
 * has no lasting effect: the caller detonates it ({@link PowerUpSystem.detonateMegaCrash}).
 *
 * @param slot - {@link MeterSlot} code.
 * @param ship - The player's ship (speed level, shield).
 * @param loadout - The player's loadout.
 * @param maxSpeedLevel - The ship's top speed level.
 * @returns Whether it was equipped.
 *
 * @example
 * ```ts
 * equipSlot(MeterSlot.Laser, ship, loadout, 5); // main = Laser (the Double is gone)
 * ```
 */
export function equipSlot(
  slot: number,
  ship: Pick<PlayerShip, 'speedLevel' | 'shield'>,
  loadout: Loadout,
  maxSpeedLevel: number,
): boolean {
  if (!canEquipSlot(slot, ship, loadout, maxSpeedLevel)) return false;
  switch (slot) {
    case MeterSlot.Speed:
      ship.speedLevel++;
      break;
    case MeterSlot.Missile:
      loadout.missile = true;
      break;
    case MeterSlot.Double:
      loadout.main = MainWeapon.Double;
      break;
    case MeterSlot.Laser:
      loadout.main = MainWeapon.Laser;
      break;
    case MeterSlot.Option:
      loadout.options++;
      break;
    case MeterSlot.Shield:
      grantShield(ship.shield, FORCE_FIELD);
      break;
    default:
      break;
  }
  return true;
}

/** Pickups of the last collision phase (reset at the start of phase 6). */
export interface PowerUpOutcomes {
  /** Items collected. */
  readonly pickupCount: number;
  /** Player slot per pickup. */
  readonly pickupPlayer: Int8Array;
  /** {@link ItemKind} per pickup. */
  readonly pickupKind: Uint8Array;
  /** World x per pickup. */
  readonly pickupX: Float64Array;
  /** World y per pickup. */
  readonly pickupY: Float64Array;
  /** Points per pickup (scoring: M1-12). */
  readonly pickupScore: Float64Array;
}

/** What the power-up system needs from its World (the World implements it). */
export interface PowerUpHost {
  /** The tick being run. */
  readonly tick: number;
  /** The session config (Auto Power-Up and its order, the magnet). */
  readonly config: GameConfig;
  /** The camera (culling). */
  readonly camera: PlayerCamera;
  /** The player ships (speed level, shield, pickups). */
  readonly players: readonly PlayerShip[];
  /** Per-player intents (the PowerUp press). */
  readonly intents: readonly PlayerIntent[];
  /** The spec the ships fly (top speed, pickup box). */
  readonly ship: Readonly<Pick<PlayerShipSpec, 'speeds' | 'pickupBox'>>;
  /** The content (sprite ids). */
  readonly content: ContentDb;
  /** Presentation events. */
  readonly events: EventQueue;
  /** The World's pool registry (the item pool is registered at creation). */
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
  /** The enemies (drops, Mega Crash). */
  readonly enemies: {
    /** Kills and drops of the tick. */
    readonly outcomes: EnemyOutcomes;
    /**
     * Kills every enemy that is not `megaCrashImmune` (`EnemySystem.megaCrash`).
     *
     * @param by - Player credited.
     * @returns Enemies killed.
     */
    megaCrash(by: number): number;
  };
  /** The enemy bullets (Mega Crash cancels them). */
  readonly bullets: {
    /**
     * Cancels every cancelable bullet and laser (`BulletSystem.cancelAll`).
     *
     * @param mode - `CancelMode`.
     * @returns Bullets cancelled.
     */
    cancelAll(mode: CancelMode): number;
  };
  /** The weapons (the loadouts the meter equips). */
  readonly weapons: {
    /** One loadout per player slot. */
    readonly loadouts: readonly Loadout[];
  };
}

/** The meter-mode power-ups of one World (see the module docs). */
export interface PowerUpSystem {
  /** The item pool (registered as `items`). */
  readonly pool: SoaPool<ItemSchema>;
  /** The items' mirror batch (`LayerId.Items`). */
  readonly itemBatch: SpriteBatch;
  /** The shields' mirror batch (`LayerId.Player`, drawn over the ships). */
  readonly shieldBatch: SpriteBatch;
  /** One power meter per player slot. */
  readonly meters: readonly PowerMeter[];
  /** 1 per player whose Mega Crash detonates in phase 7 of this tick (hashed). */
  readonly megaPending: Uint8Array;
  /** Pickups of the last collision phase. */
  readonly outcomes: PowerUpOutcomes;
  /** Drops of the enemy outcomes already turned into items this tick (hashed). */
  readonly dropsTaken: number;
  /** Live items (removed-this-tick ones included until phase 8). */
  readonly count: number;
  /** The ship's top speed level (`speeds.length − 1`). */
  readonly maxSpeedLevel: number;
  /**
   * Drops an item (enemy drops go through here; tests and tools may call it).
   *
   * @param kind - {@link ItemKind}.
   * @param x - World x.
   * @param y - World y.
   * @returns The item slot (stable within the tick), or -1 (bad kind, full pool — dropped
   *   quietly).
   *
   * @example
   * ```ts
   * world.powerups.spawnItem(ItemKind.Capsule, world.camera.x + 200, world.camera.y + 100);
   * ```
   */
  spawnItem(kind: number, x: number, y: number): number;
  /**
   * Whether a player can equip a slot now.
   *
   * @param player - Player slot.
   * @param slot - {@link MeterSlot}.
   * @returns See {@link canEquipSlot} (`false` for a bad player).
   */
  canEquip(player: number, slot: number): boolean;
  /**
   * The slots a player can equip now, as a bit mask (the HUD greys the rest).
   *
   * @param player - Player slot.
   * @returns Bits 0–6 (0 for a bad player).
   */
  equippable(player: number): number;
  /**
   * The next slot Auto Power-Up wants for a player (see the module docs).
   *
   * @param player - Player slot.
   * @returns A {@link MeterSlot}, or -1 when the order is satisfied (or empty).
   */
  nextAutoSlot(player: number): number;
  /**
   * The PowerUp press: equips the highlighted slot, or pushes `SFX PowerUpDenied`.
   *
   * @remarks
   * An empty cursor or a greyed slot is denied (the cursor stays). Equipping applies
   * {@link equipSlot}, arms Mega Crash for `!` (it detonates in phase 7 — or at once with
   * {@link PowerUpSystem.detonateMegaCrash}), resets the cursor to -1 and pushes
   * `SFX PowerUpEquip` + `SimEventKind.PowerUp` (id = slot, param = player).
   *
   * @param player - Player slot.
   * @returns Whether a slot was equipped.
   */
  equipHighlighted(player: number): boolean;
  /**
   * A capsule's effect on a player's meter (every pickup calls it): advances the cursor, pushes
   * the meter ding and applies Auto Power-Up.
   *
   * @param player - Player slot.
   * @returns The new cursor (-1 when Auto Power-Up equipped it, or for a bad player).
   */
  collect(player: number): number;
  /**
   * Detonates a Mega Crash for a player now (see the module docs).
   *
   * @remarks
   * Needs no equip and no cursor (tests and debug tools call it directly; the `!` slot arms it
   * for phase 7 instead). For a bad player slot the kills are credited to nobody (-1) and
   * `SFX MegaCrash` is pushed at (0, 0). Never allocates.
   *
   * @param player - Player slot credited with the kills.
   * @returns Enemies destroyed.
   *
   * @example
   * ```ts
   * world.powerups.detonateMegaCrash(0); // → enemies destroyed, bullets cancelled with sparkles
   * ```
   */
  detonateMegaCrash(player: number): number;
  /**
   * Phase 2, after the ships moved and before the weapons fire: the PowerUp press of every active
   * ship that is not `dying` / `dead` (pressed edge only). Never allocates.
   */
  updatePlayers(): void;
  /**
   * Phase 3, before the enemy system resets its outcomes: drops recorded since the last
   * {@link PowerUpSystem.resolve} (kills made between ticks) become items; resets the count of
   * taken drops.
   */
  beginTick(): void;
  /** Phase 5: item age, drift, magnet and culling. Never allocates. */
  update(): void;
  /**
   * Phase 6: every live item against every alive ship's pickup box (closed circle-vs-box test,
   * lowest player slot first); collected items are recorded in {@link PowerUpSystem.outcomes} and
   * removed. Never allocates.
   */
  collide(): void;
  /**
   * Phase 7, after the player shots' hits: applies the pickups in order
   * ({@link PowerUpSystem.collect}), detonates armed Mega Crashes, counts the shields' i-frames
   * down (`core/shields` `tickShield` — not on the tick of a hit, so a hit on tick `t` blocks
   * ticks `t + 1 … t + 8`) and pushes their hit / break events of the tick, then turns the tick's
   * enemy drops into capsules. Never allocates.
   */
  resolve(): void;
  /** Phase 9: refills the item and shield batches. Never allocates. */
  sync(): void;
  /**
   * Checkpoint restart: forgets pickups, pending Mega Crashes and taken drops (the World clears
   * the pool).
   */
  clear(): void;
}

/** The {@link PowerUpOutcomes} class. */
class PickupLists implements PowerUpOutcomes {
  /** See {@link PowerUpOutcomes.pickupCount}. */
  pickupCount = 0;
  /** See {@link PowerUpOutcomes.pickupPlayer}. */
  readonly pickupPlayer = new Int8Array(MAX_ITEMS);
  /** See {@link PowerUpOutcomes.pickupKind}. */
  readonly pickupKind = new Uint8Array(MAX_ITEMS);
  /** See {@link PowerUpOutcomes.pickupX}. */
  readonly pickupX = new Float64Array(MAX_ITEMS);
  /** See {@link PowerUpOutcomes.pickupY}. */
  readonly pickupY = new Float64Array(MAX_ITEMS);
  /** See {@link PowerUpOutcomes.pickupScore}. */
  readonly pickupScore = new Float64Array(MAX_ITEMS);
}

/** The power-up system (a class: monomorphic methods, typed-array fields). */
class PowerUpSystemImpl implements PowerUpSystem {
  /** See {@link PowerUpSystem.pool}. */
  readonly pool: SoaPool<ItemSchema>;
  /** See {@link PowerUpSystem.itemBatch}. */
  readonly itemBatch: SpriteBatch;
  /** See {@link PowerUpSystem.shieldBatch}. */
  readonly shieldBatch: SpriteBatch;
  /** See {@link PowerUpSystem.meters}. */
  readonly meters: readonly PowerMeter[];
  /** See {@link PowerUpSystem.megaPending}. */
  readonly megaPending = new Uint8Array(MAX_PLAYERS);
  /** See {@link PowerUpSystem.outcomes}. */
  readonly outcomes = new PickupLists();
  /** See {@link PowerUpSystem.dropsTaken}. */
  dropsTaken = 0;
  /** See {@link PowerUpSystem.maxSpeedLevel}. */
  readonly maxSpeedLevel: number;
  /** Sprite id per item kind (-1 = not drawn). */
  private readonly itemSprite: Int32Array;
  /** Animation frames per item kind. */
  private readonly itemFrames: Int32Array;
  /** Score per item kind. */
  private readonly itemScore: Float64Array;
  /** The Force Field's sprite id (-1 = not drawn). */
  private readonly shieldSprite: number;
  /** The Auto Power-Up order as {@link MeterSlot} codes. */
  private readonly autoSlots: Int8Array;
  /** Per order entry: how many entries of the same slot up to and including it. */
  private readonly autoNth: Uint8Array;
  /** Per Double / Laser entry: bit `MainWeapon` set for every main weapon that satisfies it. */
  private readonly autoMain: Uint8Array;
  /** `config.autoPowerUp`. */
  private readonly auto: boolean;
  /** `config.pickupMagnet`. */
  private readonly magnet: boolean;
  /** Pickup box half width (copied from the spec once: its shape varies). */
  private readonly boxHw: number;
  /** Pickup box half height. */
  private readonly boxHh: number;
  /** The World. */
  private readonly host: PowerUpHost;

  /**
   * Builds the pool, meters, tables and batches (see {@link createPowerUpSystem}).
   *
   * @param host - The World.
   */
  constructor(host: PowerUpHost) {
    this.host = host;
    this.pool = host.pools.register('items', createSoaPool(MAX_ITEMS, ITEM_SCHEMA));
    this.itemBatch = createSpriteBatch(LayerId.Items, MAX_ITEMS);
    this.shieldBatch = createSpriteBatch(LayerId.Player, MAX_PLAYERS);
    const meters: PowerMeter[] = [];
    for (let p = 0; p < MAX_PLAYERS; p++) meters.push(createPowerMeter());
    this.meters = meters;
    const sprites = host.content.sprites.index;
    const kinds = ITEM_KINDS.length;
    this.itemSprite = new Int32Array(kinds);
    this.itemFrames = new Int32Array(kinds);
    this.itemScore = new Float64Array(kinds);
    for (let k = 0; k < kinds; k++) {
      const spec = ITEM_KINDS[k];
      this.itemSprite[k] = sprites.get(spec.sprite) ?? -1;
      this.itemFrames[k] = spec.frames;
      this.itemScore[k] = spec.score;
    }
    this.shieldSprite = sprites.get(FORCE_FIELD.sprite) ?? -1;
    const speeds = host.ship.speeds;
    this.maxSpeedLevel = speeds.length > 0 ? speeds.length - 1 : 0;
    this.boxHw = host.ship.pickupBox.hw;
    this.boxHh = host.ship.pickupBox.hh;
    const config = host.config;
    this.auto = config.autoPowerUp;
    this.magnet = config.pickupMagnet;
    const order = config.autoPowerUpOrder;
    const n = order.length;
    this.autoSlots = new Int8Array(n);
    this.autoNth = new Uint8Array(n);
    this.autoMain = new Uint8Array(n);
    const seen = new Int32Array(METER_SLOT_COUNT);
    for (let i = 0; i < n; i++) {
      const slot = meterSlotOf(order[i]);
      this.autoSlots[i] = slot;
      if (slot >= 0) this.autoNth[i] = ++seen[slot];
    }
    // A Double / Laser entry is satisfied by its own weapon or any later Double / Laser entry's.
    let later = 0;
    for (let i = n - 1; i >= 0; i--) {
      const slot = this.autoSlots[i];
      if (slot === MeterSlot.Double) later |= 1 << MainWeapon.Double;
      else if (slot === MeterSlot.Laser) later |= 1 << MainWeapon.Laser;
      else continue;
      this.autoMain[i] = later;
    }
  }

  /** See {@link PowerUpSystem.count}. */
  get count(): number {
    return this.pool.count;
  }

  /** See {@link PowerUpSystem.spawnItem}. */
  spawnItem(kind: number, x: number, y: number): number {
    if (!(kind >= 0 && kind < ITEM_KINDS.length && kind % 1 === 0)) return -1;
    const i = this.pool.alloc();
    if (i < 0) return -1;
    const f = this.pool.fields;
    f.x[i] = x;
    f.y[i] = y;
    f.kind[i] = kind;
    return i;
  }

  /**
   * Whether a player index is valid.
   *
   * @param player - Player slot.
   * @returns `true` for a whole index of an existing ship.
   */
  private valid(player: number): boolean {
    return (
      player >= 0 && player < this.host.players.length && player < MAX_PLAYERS && player % 1 === 0
    );
  }

  /** See {@link PowerUpSystem.canEquip}. */
  canEquip(player: number, slot: number): boolean {
    if (!this.valid(player)) return false;
    return canEquipSlot(
      slot,
      this.host.players[player],
      this.host.weapons.loadouts[player],
      this.maxSpeedLevel,
    );
  }

  /** See {@link PowerUpSystem.equippable}. */
  equippable(player: number): number {
    if (!this.valid(player)) return 0;
    return equippableSlots(
      this.host.players[player],
      this.host.weapons.loadouts[player],
      this.maxSpeedLevel,
    );
  }

  /** See {@link PowerUpSystem.nextAutoSlot}. */
  nextAutoSlot(player: number): number {
    if (!this.valid(player)) return -1;
    const ship = this.host.players[player];
    const loadout = this.host.weapons.loadouts[player];
    const slots = this.autoSlots;
    const top = this.maxSpeedLevel;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const nth = this.autoNth[i];
      let satisfied: boolean;
      switch (slot) {
        case MeterSlot.Speed:
          satisfied = ship.speedLevel >= (nth < top ? nth : top);
          break;
        case MeterSlot.Missile:
          satisfied = loadout.missile;
          break;
        case MeterSlot.Double:
        case MeterSlot.Laser:
          satisfied = ((this.autoMain[i] >> loadout.main) & 1) === 1;
          break;
        case MeterSlot.Option:
          satisfied = loadout.options >= (nth < MAX_OPTIONS ? nth : MAX_OPTIONS);
          break;
        case MeterSlot.Shield:
          satisfied = shieldActive(ship.shield);
          break;
        case MeterSlot.Mega:
          satisfied = false;
          break;
        default:
          satisfied = true;
      }
      if (!satisfied) return slot;
    }
    return -1;
  }

  /** See {@link PowerUpSystem.equipHighlighted}. */
  equipHighlighted(player: number): boolean {
    if (!this.valid(player)) return false;
    const ship = this.host.players[player];
    const slot = this.meters[player].cursor;
    if (slot < 0 || !this.canEquip(player, slot)) {
      this.pushAtShip(SimEventKind.Sfx, SFX_CUES.PowerUpDenied, ship, 0);
      return false;
    }
    this.equip(player, slot);
    return true;
  }

  /**
   * Equips a slot that can be equipped: effect, Mega Crash arming, cursor reset, events.
   *
   * @param player - Player slot (valid).
   * @param slot - {@link MeterSlot} (equippable).
   */
  private equip(player: number, slot: number): void {
    const ship = this.host.players[player];
    equipSlot(slot, ship, this.host.weapons.loadouts[player], this.maxSpeedLevel);
    if (slot === MeterSlot.Mega) this.megaPending[player] = 1;
    this.meters[player].cursor = -1;
    this.pushAtShip(SimEventKind.Sfx, SFX_CUES.PowerUpEquip, ship, 0);
    this.pushAtShip(SimEventKind.PowerUp, slot, ship, player);
  }

  /**
   * Pushes an event at a ship's position in whole pixels (fractional arguments of a call V8 does
   * not inline would be boxed).
   *
   * @param kind - `SimEventKind`.
   * @param id - Event id.
   * @param ship - The ship.
   * @param param - Event param.
   */
  private pushAtShip(kind: SimEventKind, id: number, ship: PlayerShip, param: number): void {
    this.host.events.push(kind, id, Math.floor(ship.x) | 0, Math.floor(ship.y) | 0, param);
  }

  /** See {@link PowerUpSystem.collect}. */
  collect(player: number): number {
    if (!this.valid(player)) return -1;
    const meter = this.meters[player];
    const cursor = advanceMeter(meter);
    this.pushAtShip(SimEventKind.Sfx, SFX_CUES.MeterAdvance, this.host.players[player], 0);
    if (this.auto && cursor === this.nextAutoSlot(player) && this.canEquip(player, cursor)) {
      this.equip(player, cursor);
    }
    return meter.cursor;
  }

  /** See {@link PowerUpSystem.detonateMegaCrash}. */
  detonateMegaCrash(player: number): number {
    const host = this.host;
    host.bullets.cancelAll(CancelMode.Sparkle);
    const killed = host.enemies.megaCrash(this.valid(player) ? player : -1);
    host.events.push(SimEventKind.Flash, 0, 0, 0, MEGA_CRASH_FLASH_TICKS);
    if (this.valid(player)) {
      this.pushAtShip(SimEventKind.Sfx, SFX_CUES.MegaCrash, host.players[player], 0);
    } else {
      host.events.push(SimEventKind.Sfx, SFX_CUES.MegaCrash, 0, 0, 0);
    }
    return killed;
  }

  /** See {@link PowerUpSystem.updatePlayers}. */
  updatePlayers(): void {
    const players = this.host.players;
    const intents = this.host.intents;
    for (let p = 0; p < players.length && p < MAX_PLAYERS; p++) {
      const ship = players[p];
      if (!ship.active || ship.state === 'dying' || ship.state === 'dead') continue;
      if (p < intents.length && (intents[p].pressed & Action.PowerUp) !== 0) {
        this.equipHighlighted(p);
      }
    }
  }

  /** See {@link PowerUpSystem.beginTick}. */
  beginTick(): void {
    this.takeDrops();
    this.dropsTaken = 0;
  }

  /**
   * Turns the enemy outcomes' drops not taken yet into items.
   */
  private takeDrops(): void {
    const o = this.host.enemies.outcomes;
    const n = o.dropCount;
    for (let d = this.dropsTaken; d < n; d++) {
      if (o.dropKind[d] === DropKind.Capsule)
        this.spawnItem(ItemKind.Capsule, o.dropX[d], o.dropY[d]);
    }
    if (n > this.dropsTaken) this.dropsTaken = n;
  }

  /**
   * Removes an item (freed in phase 8).
   *
   * @param i - The slot.
   */
  private kill(i: number): void {
    this.pool.fields.flags[i] |= ItemFlag.Dead;
    this.pool.free(i);
  }

  /** See {@link PowerUpSystem.update}. */
  update(): void {
    const pool = this.pool;
    const f = pool.fields;
    const n = pool.count;
    const camera = this.host.camera;
    const left = camera.x - ITEM_CULL_MARGIN;
    const top = camera.y - ITEM_CULL_MARGIN;
    const right = camera.x + PLAYFIELD_W + ITEM_CULL_MARGIN;
    const bottom = camera.y + PLAYFIELD_H + ITEM_CULL_MARGIN;
    const players = this.host.players;
    const magnet = this.magnet;
    const hw = this.boxHw;
    const hh = this.boxHh;
    const reach = ITEM_RADIUS + PICKUP_MAGNET_RANGE;
    for (let i = 0; i < n; i++) {
      let flags = f.flags[i];
      if ((flags & ItemFlag.Dead) !== 0) continue;
      f.age[i]++;
      let x = f.x[i] + f.vx[i];
      let y = f.y[i] + f.vy[i];
      flags &= ~ItemFlag.Magnet;
      if (magnet) {
        // The nearest alive ship whose pickup box is within reach pulls the item.
        let best = -1;
        let bestD = 0;
        for (let p = 0; p < players.length; p++) {
          const ship = players[p];
          if (!ship.active || ship.state !== 'alive') continue;
          const cx = ship.x - x;
          const cy = ship.y - y;
          const ox = (cx < 0 ? -cx : cx) - hw;
          const oy = (cy < 0 ? -cy : cy) - hh;
          const gx = ox > 0 ? ox : 0;
          const gy = oy > 0 ? oy : 0;
          if (!(gx * gx + gy * gy <= reach * reach)) continue;
          const d = cx * cx + cy * cy;
          if (best < 0 || d < bestD) {
            best = p;
            bestD = d;
          }
        }
        if (best >= 0) {
          const ship = players[best];
          const cx = ship.x - x;
          const cy = ship.y - y;
          const d = Math.sqrt(bestD);
          if (d <= PICKUP_MAGNET_SPEED) {
            x = ship.x;
            y = ship.y;
          } else {
            x += (cx / d) * PICKUP_MAGNET_SPEED;
            y += (cy / d) * PICKUP_MAGNET_SPEED;
          }
          flags |= ItemFlag.Magnet;
        }
      }
      f.x[i] = x;
      f.y[i] = y;
      f.flags[i] = flags;
      // "Not inside", so a NaN position is culled too.
      if (!(x >= left && x <= right && y >= top && y <= bottom)) this.kill(i);
    }
  }

  /** See {@link PowerUpSystem.collide}. */
  collide(): void {
    const o = this.outcomes;
    o.pickupCount = 0;
    const f = this.pool.fields;
    const n = this.pool.count;
    const players = this.host.players;
    const hw = this.boxHw;
    const hh = this.boxHh;
    const r = ITEM_RADIUS;
    for (let i = 0; i < n; i++) {
      if ((f.flags[i] & ItemFlag.Dead) !== 0) continue;
      const x = f.x[i];
      const y = f.y[i];
      for (let p = 0; p < players.length && p < MAX_PLAYERS; p++) {
        const ship = players[p];
        if (!ship.active || ship.state !== 'alive') continue;
        // `circleAabb` inlined (closed: touching counts; NaN never overlaps).
        const ox = Math.abs(x - ship.x) - hw;
        const oy = Math.abs(y - ship.y) - hh;
        const dx = ox > 0 ? ox : 0;
        const dy = oy > 0 ? oy : 0;
        if (!(dx * dx + dy * dy <= r * r)) continue;
        const k = o.pickupCount;
        if (k < MAX_ITEMS) {
          const kind = f.kind[i];
          o.pickupPlayer[k] = p;
          o.pickupKind[k] = kind;
          o.pickupX[k] = x;
          o.pickupY[k] = y;
          o.pickupScore[k] = this.itemScore[kind];
          o.pickupCount = k + 1;
        }
        this.kill(i);
        break;
      }
    }
  }

  /** See {@link PowerUpSystem.resolve}. */
  resolve(): void {
    const o = this.outcomes;
    for (let k = 0; k < o.pickupCount; k++) {
      if (o.pickupKind[k] === ItemKind.Capsule) this.collect(o.pickupPlayer[k]);
    }
    const pending = this.megaPending;
    for (let p = 0; p < pending.length; p++) {
      if (pending[p] === 0) continue;
      pending[p] = 0;
      this.detonateMegaCrash(p);
    }
    const host = this.host;
    const tick = host.tick;
    const players = host.players;
    for (let p = 0; p < players.length; p++) {
      const ship = players[p];
      const shield = ship.shield;
      tickShield(shield, tick);
      if (shield.hitTick !== tick) continue;
      if (shield.brokeTick === tick) {
        this.pushAtShip(SimEventKind.Sfx, SFX_CUES.ShieldBreak, ship, 0);
        this.pushAtShip(SimEventKind.Particles, FX_CUES.ShieldBreak, ship, 1);
      } else {
        this.pushAtShip(SimEventKind.Sfx, SFX_CUES.ShieldHit, ship, 0);
      }
    }
    this.takeDrops();
  }

  /** See {@link PowerUpSystem.sync}. */
  sync(): void {
    const items = this.itemBatch;
    items.count = 0;
    const f = this.pool.fields;
    const n = this.pool.count;
    const blink = this.host.tick;
    for (let i = 0; i < n; i++) {
      if ((f.flags[i] & ItemFlag.Dead) !== 0) continue;
      const kind = f.kind[i];
      const sprite = this.itemSprite[kind];
      if (sprite < 0) continue;
      const slot = items.count;
      if (slot >= items.capacity) break;
      const frames = this.itemFrames[kind];
      items.x[slot] = f.x[i];
      items.y[slot] = f.y[i];
      items.spriteId[slot] = sprite;
      items.frame[slot] = frames > 1 ? Math.floor(blink / ITEM_BLINK_TICKS) % frames : 0;
      items.flags[slot] = 0;
      items.count = slot + 1;
    }
    const shields = this.shieldBatch;
    shields.count = 0;
    const sprite = this.shieldSprite;
    if (sprite < 0) return;
    const players = this.host.players;
    for (let p = 0; p < players.length; p++) {
      const ship = players[p];
      if (!ship.active || ship.state === 'dying' || ship.state === 'dead') continue;
      const shield = ship.shield;
      if (!shieldActive(shield)) continue;
      const slot = shields.count;
      if (slot >= shields.capacity) break;
      // Blinks with the ship's invulnerability and during its own shield-hit i-frames.
      const hidden =
        (ship.invulnTicks > 0 && (ship.invulnTicks & 4) !== 0) ||
        (shield.iFrames > 0 && (shield.iFrames & 2) !== 0);
      shields.x[slot] = ship.x;
      shields.y[slot] = ship.y;
      shields.spriteId[slot] = sprite;
      shields.frame[slot] = shieldWearFrame(shield, FORCE_FIELD.wearFrames);
      shields.flags[slot] = hidden ? SpriteFlag.Hidden : 0;
      shields.count = slot + 1;
    }
  }

  /** See {@link PowerUpSystem.clear}. */
  clear(): void {
    this.outcomes.pickupCount = 0;
    this.megaPending.fill(0);
    this.dropsTaken = 0;
    this.itemBatch.count = 0;
    this.shieldBatch.count = 0;
  }
}

/**
 * Creates the power-up system of a World (load time): the item pool (registered as `items`), one
 * meter per player, the item and shield batches, the compiled Auto Power-Up order and the sprite
 * ids of the item kinds and the Force Field.
 *
 * @param host - The World (read at every call — pass the World itself).
 * @returns The system.
 * @throws {Error} When the World already registered a pool named `items`.
 *
 * @example
 * ```ts
 * const powerups = createPowerUpSystem(world);
 * powerups.spawnItem(ItemKind.Capsule, world.camera.x + 200, world.camera.y + 100);
 * ```
 */
export function createPowerUpSystem(host: PowerUpHost): PowerUpSystem {
  return new PowerUpSystemImpl(host);
}
