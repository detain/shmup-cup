/**
 * # powerups — power-up economy (Meter mode + Direct mode) and pickups
 *
 * **Status: implemented.** Meter mode (plan M1-11): the 7-slot power meter, equipping on the
 * PowerUp press, Auto Power-Up, power capsules (item pool, pickup magnet, pickups), the Force Field
 * grant (`core/shields`) and Mega Crash; since M2-03 the `!` choices (Mega Crash, NORMAL, SPEED
 * DOWN, LIFE OPTION, FULL BARRIER) and the `?` choice of the weapon select, and the MISSILE /
 * DOUBLE / LASER slots equip the session's arsenal (`core/weapons` `resolveArsenal`); since M2-04
 * the other `?` shields (pods, Reduce), the rare blue capsule and the Options an Option Hunter let
 * go of. Since M2-05 **Direct mode**: the six colour items, the stage's item plan, the Arm and the
 * Speed toggle.
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
 * | `?` | the `?` shield (`GameConfig.shieldChoice` — Force Field, Shield, Free Shield, Rotate Shield, Reduce); a Free Shield on a Free Shield adds a pod pair | a shield is up (a Free Shield: four fresh pods) |
 * | `!` Mega Crash | the screen clear (the default `GameConfig.megaChoice`) | never |
 * | `!` NORMAL | main = the basic shot | the basic shot is current |
 * | `!` SPEED DOWN | ship speed level − 1 | at speed level 0 |
 * | `!` LIFE OPTION | spare ships (`lives − 1`) become Options, up to 4 Options | no spare ship or 4 Options |
 * | `!` FULL BARRIER | the `?` shield back to full strength (every pod slot; a fresh one when none stands) | the shield is up at full strength |
 *
 * The MISSILE / DOUBLE / LASER slots equip whatever weapon the session's arsenal puts in that role
 * (Type A–D or Weapon Edit — the loadout → meter mapping of M2-03); the HUD shows its name.
 *
 * **Auto Power-Up** (`GameConfig.autoPowerUp`, decision D2): the order
 * (`GameConfig.autoPowerUpOrder`, default Speed → Missile → Laser → Option ×4 → `?`) is compiled at
 * creation; the **next wanted slot** is the first entry the loadout does not satisfy yet (a slot
 * listed `n` times wants level `n` — capped at the maximum; a Double / Laser entry is also
 * satisfied by a later Double / Laser entry of the order; `?` wants a shield up; `!` is never
 * satisfied). When a capsule moves the cursor onto the next wanted slot and it can be equipped,
 * it is equipped at once. The order is re-evaluated every time, so losses (a broken shield, a
 * death penalty) are wanted again. A `!` entry applies the session's `!` choice (M2-03); while
 * that choice is greyed (SPEED DOWN at level 0 …) the cursor parks there like on any greyed slot.
 *
 * **Items** — a struct-of-arrays pool of {@link MAX_ITEMS} (32) registered with the World as
 * `items` (flushed in phase 8, hashed). Capsules ({@link ItemKind.Capsule}) are world-space: they
 * stay where they dropped and scroll away with the terrain; they are removed
 * {@link ITEM_CULL_MARGIN} px outside the view. With `GameConfig.pickupMagnet` (decision D33) an
 * item within {@link PICKUP_MAGNET_RANGE} px of an alive ship's pickup box drifts towards the
 * nearest such ship at {@link PICKUP_MAGNET_SPEED} px/tick. A ship collects every item whose
 * circle ({@link ITEM_RADIUS}) touches its pickup box (closed test; the lowest player slot wins
 * a tie); **every capsule pickup advances the meter** (no merging, shmup_feat.md §6A), pushes the
 * meter "ding" (`SFX MeterAdvance`) and records {@link CAPSULE_SCORE} (300) points in
 * {@link PowerUpSystem.outcomes} for scoring (M1-12).
 *
 * **The blue capsule** (M2-04, shmup_feat.md §6A — {@link ItemKind.BlueCapsule}, dropped by
 * `drop: 'blueCapsule'` enemies and formations): world-space like a capsule, 300 points; collecting
 * it destroys every enemy on screen ({@link PowerUpSystem.clearScreen} — Mega Crash's flash and
 * sound, no bullet cancel, the meter untouched).
 *
 * **Freed Options** (M2-04, {@link ItemKind.FreeOption}): every Option a dead Option Hunter carried
 * (`DropKind.FreeOption`) becomes a grey item that drifts with the view
 * ({@link FREE_OPTION_DRIFT}, bouncing off the playfield's top and bottom, the magnet pulls it
 * too) and vanishes after {@link FREE_OPTION_TICKS} ticks (blinking for the last
 * {@link ITEM_EXPIRY_BLINK_TICKS}); collecting one gives an Option back
 * ({@link PowerUpSystem.regainOption}), whoever grabs it.
 *
 * **Capsule sources** — every drop in the enemy system's tick outcomes (`drop: 'capsule'` enemies
 * and completed formations, M1-08) becomes a capsule where it happened, at the end of phase 7 (and,
 * for kills made between ticks by tools, at the start of the next phase 3).
 *
 * **Mega Crash** (the `!` slot's default choice): equipping it arms a detonation that runs in phase
 * 7 of the same
 * tick (so its kills are scored and drop capsules like any other): every cancelable enemy bullet
 * and laser is cancelled — sparkles, and point items for the bomber (`core/bullets`
 * `cancelAllBullets` with `CancelMode.Points`, M2-02) —, every enemy that is not
 * `megaCrashImmune` is destroyed and credited to the player (`EnemySystem.megaCrash`), and a
 * {@link MEGA_CRASH_FLASH_TICKS}-tick screen flash (`SimEventKind.Flash`) and `SFX MegaCrash` are
 * pushed. Bosses (M1-13) take no damage.
 *
 * **Shields.** The `?` slot (and the `!` choice FULL BARRIER) grants the session's `?` shield
 * ({@link PowerUpSystem.choices}: Force Field, Shield, Free Shield — its pairs attach where the
 * player last flew (`WeaponSystem.freeWayHeading`) —, Rotate Shield or Reduce, M2-04) on
 * `PlayerShip.shield`; this system places the pods round the ship in phase 2
 * (`core/shields` `placeShieldPods`), counts the i-frames down (and spins the Rotate Shield) in
 * phase 7 and pushes `SFX ShieldHit` / `SFX ShieldBreak` + `FX ShieldBreak` for the tick's absorbed
 * hits (a pod breaking too) in phase 7; the view shows a field as a sprite around the ship in its
 * wear frame and every standing pod as its own sprite in its own wear frame (blinking during
 * their i-frames).
 *
 * **Direct mode** (M2-05, shmup_feat.md §6B — `GameConfig.powerUpMode: 'direct'`, the MANTA).
 * There is no meter: every `powerup` or `capsule` drop becomes the stage's **next planned item**
 * (`StageSpec.directItems`, else {@link DEFAULT_DIRECT_ITEM_PLAN}; the plan cycles and never
 * rewinds — {@link PowerUpSystem.planCursor}), so the stage data stays mode-agnostic. The items
 * ({@link ItemKind.DirectRed} … {@link ItemKind.DirectOctagon}, {@link DIRECT_ITEM_SCORE} points)
 * drift slowly left with the view and bounce off the playfield's top and bottom
 * ({@link DIRECT_ITEM_DRIFT}), and vanish after {@link DIRECT_ITEM_TICKS} ticks (blinking the last
 * {@link ITEM_EXPIRY_BLINK_TICKS}); whoever grabs one gets it
 * ({@link PowerUpSystem.collectDirect}):
 *
 * | Item | Effect | At the cap |
 * |---|---|---|
 * | red | main shot + 1 level (`Loadout.shot`) | its family's top level: points only |
 * | green | sub-weapon + 1 level (`Loadout.sub`) | the top level: points only |
 * | blue | the Arm: grant / repair / next tier (`core/shields` `collectArm`) | repairs |
 * | orange | 1UP (`lives + 1`, the `ExtraLife` SFX) | 9 lives: points only |
 * | yellow | smart bomb: Mega Crash's screen clear (bullets → points, enemies, flash) | — |
 * | octagon | the next main-shot family (Beam → Disc ↔ Laser → Wave), level kept | one family |
 *
 * Every pickup pushes `SFX CapsulePickup`; an effect that changed something `SFX PowerUpEquip` and
 * `SimEventKind.PowerUp` (id {@link DIRECT_POWER_UP_EVENT_BASE} + the item's {@link DIRECT_ITEMS}
 * index). The **Speed toggle** (the `Speed` press — remote Ch−, decision D3) cycles the ship's
 * speed level through its `speeds` (the MANTA: 2.25 → 2.75 → 1.75 px/tick) with the meter ding;
 * the PowerUp press does nothing. The death penalty is {@link applyDirectDeathPenalty}.
 *
 * **Bonus-stage items (M2-10, shmup_feat.md §14 "1UPs, bonus capsules (1,000 pts)").** The
 * content drops `oneUp` and `bonusCapsule` become world-space items like the capsule, in both
 * power-up modes: {@link ItemKind.OneUp} (`items/1up`, +1 life up to 9 with the critical `ExtraLife`
 * cue; at the cap only the pickup sound) and {@link ItemKind.BonusCapsule} (`items/capsule-bonus`,
 * {@link BONUS_CAPSULE_SCORE} points with the pickup sound).
 *
 * **Death penalty** (M1-12, decision D6): {@link applyDeathPenalty} — called by the World when a
 * ship dies — takes the shield in every preset, and `arcade` everything else too (cursor back to
 * -1), `classic` one level ({@link loseOneLevel}: Option → Double / Laser → Missile → Speed),
 * `casual` nothing more.
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
 * - shmup_feat.md §7A — the `!` slot: Mega Crash (bullets and small enemies, no boss damage),
 *   Normal, Speed Down, Life Option, Full Barrier (M2-03)
 * - shmup_feat.md §4 rule 4 — OK = equip, a rare non-urgent press; Auto Power-Up for the remote
 * - shmup_feat.md §11 — capsule carriers and formation-kill drops
 * - shmup_feat.md §6A — the blue capsule (a rare pickup that clears the screen's enemies); §8 —
 *   the Options an Option Hunter stole, freed and re-collectable (M2-04)
 * - shmup_feat.md §6B — Direct-mode items (red, green, blue, orange 1UP, yellow smart bomb, red
 *   octagon family switch), dropped by carriers, drifting and despawning; §6C pickup feedback;
 *   §4 — the optional Speed toggle (M2-05)
 *
 * **Public API.** {@link createPowerUpSystem}, {@link PowerUpSystem}, {@link PowerUpHost},
 * {@link PowerUpOutcomes}, {@link PowerMeter}, {@link createPowerMeter}, {@link advanceMeter},
 * {@link canEquipSlot}, {@link equipSlot}, {@link equippableSlots}, {@link meterSlotOf},
 * {@link MeterSlot}, {@link METER_SLOT_COUNT}, {@link METER_LABELS}, {@link ItemKind},
 * {@link ITEM_KINDS}, {@link ItemKindSpec}, {@link ItemFlag}, {@link ITEM_SCHEMA},
 * {@link ItemSchema}, {@link ITEM_SPRITES}, {@link CAPSULE_SPRITE}, {@link MAX_ITEMS},
 * {@link CAPSULE_SCORE}, {@link ITEM_RADIUS}, {@link PICKUP_MAGNET_RANGE},
 * {@link PICKUP_MAGNET_SPEED}, {@link ITEM_CULL_MARGIN}, {@link ITEM_BLINK_TICKS},
 * {@link MEGA_CRASH_FLASH_TICKS}, {@link DirectItem}, {@link applyDeathPenalty},
 * {@link loseOneLevel}; M2-03: {@link MegaEffect}, {@link megaEffectOf}, {@link MeterChoices},
 * {@link DEFAULT_METER_CHOICES}, {@link meterChoicesOf}, {@link MeterShip},
 * {@link lifeOptionCount}; M2-04: {@link BLUE_CAPSULE_SPRITE}, {@link FREE_OPTION_TICKS},
 * {@link FREE_OPTION_DRIFT}, {@link ITEM_EXPIRY_BLINK_TICKS}.
 *
 * M2-05: {@link DIRECT_ITEMS}, {@link DIRECT_ITEM_KINDS}, {@link directItemKind},
 * {@link DIRECT_ITEM_SPRITES}, {@link DIRECT_ITEM_SCORE}, {@link DIRECT_ITEM_TICKS},
 * {@link DIRECT_ITEM_DRIFT}, {@link DEFAULT_DIRECT_ITEM_PLAN}, {@link DIRECT_POWER_UP_EVENT_BASE},
 * {@link applyDirectDeathPenalty}, {@link directMaxLevel}. M2-10: {@link ONE_UP_SPRITE},
 * {@link BONUS_CAPSULE_SPRITE}, {@link BONUS_CAPSULE_SCORE}.
 *
 * **Co-op (M2-06).** Every player has its own meter (or Direct-mode levels) and shield; an item
 * goes to whoever touches it first (player 1 when both touch it on the same tick). While two ships
 * are in play, power-up drops are scaled by `GameConfig.coopExtra`
 * ({@link PowerUpSystem.coopCredit}, {@link COOP_EXTRA_OFFSET}).
 *
 * @module
 */
import { CancelMode } from '../bullets/index.js';
import {
  MEGA_CHOICES,
  METER_SLOT_NAMES,
  PLAYFIELD_H,
  PLAYFIELD_W,
  type DeathPenaltyPreset,
  type GameConfig,
  type MegaChoice,
  type MeterSlotName,
} from '../config/index.js';
import {
  DIRECT_ITEMS,
  type ContentDb,
  type DirectItemName,
  type PlayerShipSpec,
  type StageSpec,
  type WeaponFamilySpec,
} from '../data/index.js';
import { DropKind, type EnemyOutcomes } from '../enemies/index.js';
import { FX_CUES, SFX_CUES, SfxPriority, SimEventKind, type EventQueue } from '../events/index.js';
import { FLASH_KIND_TICKS, FlashKind, requestFlash, type FxState } from '../fx/index.js';
import { Action, MAX_PLAYERS } from '../input/index.js';
import { defineModule } from '../module-info.js';
import { MAX_OPTIONS, STOLEN_OPTION_SPRITE } from '../options/index.js';
import {
  playerOut,
  type PlayerCamera,
  type PlayerIntent,
  type PlayerShip,
} from '../player/index.js';
import { createSoaPool, type SoaPool, type SoaSchema } from '../pools/index.js';
import { LayerId, SpriteFlag, createSpriteBatch, type SpriteBatch } from '../presentation/index.js';
import { MAX_LIVES } from '../scoring/index.js';
import {
  ShieldKind,
  armWearFrame,
  collectArm,
  FORCE_FIELD,
  MAX_SHIELD_PODS,
  SHIELD_SPECS,
  canGrantShield,
  clearShield,
  grantShield,
  placeShieldPods,
  podWearFrame,
  refillShield,
  shieldActive,
  shieldFull,
  shieldSpecOf,
  shieldWearFrame,
  tickShield,
  type ShieldSpec,
} from '../shields/index.js';
import { DIRECT_MAX_LEVEL, MainWeapon, type Loadout } from '../weapons/index.js';

/**
 * How far below a power-up drop the co-op extra item appears, in pixels (M2-06 —
 * `GameConfig.coopExtra`), so the two items do not overlap.
 */
export const COOP_EXTRA_OFFSET = 12;

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'powerups',
  status: 'implemented',
  specRefs: [
    'shmup_feat.md §6',
    'shmup_feat.md §7',
    'shmup_feat.md §4',
    'shmup_feat.md §11',
    'shmup_feat.md §8',
  ],
});

/** A Darius-style Direct-mode item colour (M2-05; `core/data` {@link DIRECT_ITEMS}). */
export type DirectItem = DirectItemName;

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
 * What the `!` slot does, as codes in `config` `MEGA_CHOICES` order (`GameConfig.megaChoice`,
 * plan M2-03).
 */
export const MegaEffect = {
  /** Mega Crash: the screen clear (the default). */
  MegaCrash: 0,
  /** NORMAL: the Double / Laser back to the basic shot. */
  Normal: 1,
  /** SPEED DOWN: one speed level less. */
  SpeedDown: 2,
  /** LIFE OPTION: spare ships become Options. */
  LifeOption: 3,
  /** FULL BARRIER: the `?` shield back to full strength. */
  FullBarrier: 4,
} as const;

/** A {@link MegaEffect} code. */
export type MegaEffect = (typeof MegaEffect)[keyof typeof MegaEffect];

/**
 * The code of a `!` choice.
 *
 * @param choice - A `config` `MegaChoice`.
 * @returns Its {@link MegaEffect} (Mega Crash for an unknown name).
 */
export function megaEffectOf(choice: MegaChoice): MegaEffect {
  const index = MEGA_CHOICES.indexOf(choice);
  return (index >= 0 ? index : MegaEffect.MegaCrash) as MegaEffect;
}

/**
 * What the `?` and `!` slots do in a session (plan M2-03; built from the config by the power-up
 * system). A class so its fields stay monomorphic.
 */
export class MeterChoices {
  /** The `!` slot's {@link MegaEffect}. */
  mega: MegaEffect = MegaEffect.MegaCrash;
  /** The shield the `?` slot (and FULL BARRIER) grants. */
  shield: ShieldSpec = FORCE_FIELD;
}

/** The defaults: Mega Crash on `!`, the Force Field on `?` (Type A of M1-11). */
export const DEFAULT_METER_CHOICES: Readonly<MeterChoices> = Object.freeze(new MeterChoices());

/**
 * Builds the meter choices of a config.
 *
 * @param config - The session config (`megaChoice`, `shieldChoice`).
 * @returns A fresh {@link MeterChoices} (load time — it allocates).
 *
 * @example
 * ```ts
 * const choices = meterChoicesOf(resolveGameConfig({ megaChoice: 'lifeOption' }));
 * equipSlot(MeterSlot.Mega, ship, loadout, maxSpeedLevel, choices); // spare ships → Options
 * ```
 */
export function meterChoicesOf(
  config: Readonly<Pick<GameConfig, 'megaChoice' | 'shieldChoice'>>,
): MeterChoices {
  const choices = new MeterChoices();
  choices.mega = megaEffectOf(config.megaChoice);
  choices.shield = shieldSpecOf(config.shieldChoice);
  return choices;
}

/** The ship fields the meter reads and changes (`lives` only for LIFE OPTION). */
export type MeterShip = Pick<PlayerShip, 'speedLevel' | 'shield'> & {
  /** Ships left including the one in play (LIFE OPTION turns the spare ones into Options). */
  lives?: number;
};

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

/**
 * Length of Mega Crash's screen flash in ticks (`SimEventKind.Flash` param; `core/fx`
 * `FLASH_KIND_TICKS[FlashKind.MegaCrash]`).
 */
export const MEGA_CRASH_FLASH_TICKS = FLASH_KIND_TICKS[FlashKind.MegaCrash];

/** The power capsule's sprite (an engine sprite — see core `world` `ENGINE_SPRITES`). */
export const CAPSULE_SPRITE = 'items/capsule';

/** The blue capsule's sprite (an engine sprite, M2-04). */
export const BLUE_CAPSULE_SPRITE = 'items/capsule-blue';

/** The 1UP item's sprite (an engine sprite, M2-10 — the bonus stages). */
export const ONE_UP_SPRITE = 'items/1up';

/** The bonus capsule's sprite (an engine sprite, M2-10 — the bonus stages). */
export const BONUS_CAPSULE_SPRITE = 'items/capsule-bonus';

/** Points a bonus capsule is worth (shmup_feat.md §14 / §15 "bonus capsule 1,000"). */
export const BONUS_CAPSULE_SCORE = 1000;

/**
 * Ticks a freed Option drifts before it vanishes (it blinks for the last
 * {@link ITEM_EXPIRY_BLINK_TICKS}).
 */
export const FREE_OPTION_TICKS = 600;

/** Ticks an expiring item blinks before it vanishes. */
export const ITEM_EXPIRY_BLINK_TICKS = 120;

/**
 * Drift velocities of freed Options (screen px/tick, `[vx0, vy0, vx1, vy1, …]`): the `n`-th Option
 * a dead Option Hunter lets go of in a tick takes entry `n mod 8`.
 */
export const FREE_OPTION_DRIFT: readonly number[] = Object.freeze([
  -0.5, -0.6, -0.5, 0.6, -0.9, -0.3, -0.9, 0.3, -0.3, -0.9, -0.3, 0.9, -1.1, 0, -0.2, 0,
]);

/** Points of every Direct-mode item (M2-05; the capsule's value). */
export const DIRECT_ITEM_SCORE = 300;

/** Ticks a Direct-mode item drifts before it vanishes (shmup_feat.md §6B "despawn after time"). */
export const DIRECT_ITEM_TICKS = 600;

/**
 * Drift velocities of Direct-mode items (screen px/tick, `[vx0, vy0, vx1, vy1]`): an item takes
 * pair `plan cursor & 1` — slowly left, alternately up and down (it bounces off the playfield's
 * top and bottom).
 */
export const DIRECT_ITEM_DRIFT: readonly number[] = Object.freeze([-0.35, -0.3, -0.35, 0.3]);

/**
 * The item plan of a stage without `directItems` (M2-05): red and green a level each for every
 * two blue items, an octagon, a yellow bomb and an orange 1UP along the way (cycling).
 */
export const DEFAULT_DIRECT_ITEM_PLAN: readonly DirectItemName[] = Object.freeze([
  'red',
  'blue',
  'green',
  'blue',
  'red',
  'green',
  'blue',
  'octagon',
  'red',
  'blue',
  'green',
  'yellow',
  'red',
  'blue',
  'green',
  'blue',
  'orange',
] as DirectItemName[]);

/**
 * `SimEventKind.PowerUp` id of a Direct-mode item's effect: this base + its {@link DIRECT_ITEMS}
 * index (the meter's slot codes stay below it).
 */
export const DIRECT_POWER_UP_EVENT_BASE = 16;

/** Kinds of item. Codes are hashed: append, never renumber. */
export const ItemKind = {
  /** A meter-mode power capsule. */
  Capsule: 0,
  /**
   * The rare blue capsule (M2-04, shmup_feat.md §6A): collecting it destroys every enemy on screen
   * (not the meter).
   */
  BlueCapsule: 1,
  /**
   * An Option a dead Option Hunter let go of (M2-04): grey, it drifts with the view for
   * {@link FREE_OPTION_TICKS} ticks; collecting it gives an Option back.
   */
  FreeOption: 2,
  /** Direct mode (M2-05): the red item — main shot + 1 level. */
  DirectRed: 3,
  /** Direct mode: the green item — sub-weapon + 1 level. */
  DirectGreen: 4,
  /** Direct mode: the blue item — the Arm (grant / repair / next tier). */
  DirectBlue: 5,
  /** Direct mode: the orange item — 1UP. */
  DirectOrange: 6,
  /** Direct mode: the yellow item — smart bomb. */
  DirectYellow: 7,
  /** Direct mode: the red octagon — the next main-shot family. */
  DirectOctagon: 8,
  /**
   * A 1UP (M2-10 — the hidden bonus stages, shmup_feat.md §14): +1 life (up to `MAX_LIVES`) in
   * either power-up mode. World-space like a capsule.
   */
  OneUp: 9,
  /** A bonus capsule (M2-10): {@link BONUS_CAPSULE_SCORE} points, nothing else. World-space. */
  BonusCapsule: 10,
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

/** The Direct-mode items' sprites, in {@link DIRECT_ITEMS} order (engine sprites, M2-05). */
export const DIRECT_ITEM_SPRITES: readonly string[] = Object.freeze(
  DIRECT_ITEMS.map((item) => 'items/direct-' + item),
);

/** The {@link ItemKind} of each Direct-mode item, in {@link DIRECT_ITEMS} order. */
export const DIRECT_ITEM_KINDS: readonly ItemKind[] = Object.freeze([
  ItemKind.DirectRed,
  ItemKind.DirectGreen,
  ItemKind.DirectBlue,
  ItemKind.DirectOrange,
  ItemKind.DirectYellow,
  ItemKind.DirectOctagon,
] as ItemKind[]);

/**
 * The item kind of a Direct-mode colour.
 *
 * @param item - A {@link DirectItem}.
 * @returns Its {@link ItemKind} (-1 for an unknown name).
 */
export function directItemKind(item: DirectItem): number {
  const index = DIRECT_ITEMS.indexOf(item);
  return index >= 0 ? DIRECT_ITEM_KINDS[index] : -1;
}

/** Item kinds by {@link ItemKind} code. */
export const ITEM_KINDS: readonly ItemKindSpec[] = Object.freeze([
  Object.freeze({ sprite: CAPSULE_SPRITE, frames: 2, score: CAPSULE_SCORE }),
  Object.freeze({ sprite: BLUE_CAPSULE_SPRITE, frames: 2, score: CAPSULE_SCORE }),
  Object.freeze({ sprite: STOLEN_OPTION_SPRITE, frames: 2, score: 0 }),
  ...DIRECT_ITEM_SPRITES.map((sprite) =>
    Object.freeze({ sprite, frames: 2, score: DIRECT_ITEM_SCORE }),
  ),
  Object.freeze({ sprite: ONE_UP_SPRITE, frames: 2, score: 0 }),
  Object.freeze({ sprite: BONUS_CAPSULE_SPRITE, frames: 2, score: BONUS_CAPSULE_SCORE }),
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
  /**
   * Own velocity x in px/tick (0 for capsules: they stay with the terrain; a freed Option's drift,
   * on top of the camera's scroll).
   */
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
 * The Options a LIFE OPTION would make now: the spare ships (`lives − 1`), at most the room left
 * for Options.
 *
 * @param ship - The ship (`lives`; none = 0 spare ships).
 * @param loadout - The loadout (its Options).
 * @returns The count (0 when nothing would change).
 */
export function lifeOptionCount(ship: Readonly<MeterShip>, loadout: Readonly<Loadout>): number {
  const spare = (ship.lives ?? 1) - 1;
  const room = MAX_OPTIONS - loadout.options;
  const n = spare < room ? spare : room;
  return n > 0 ? n : 0;
}

/**
 * Whether the `!` slot can be equipped now (by its {@link MegaEffect}).
 *
 * @param ship - The ship.
 * @param loadout - The loadout.
 * @param choices - The session's choices.
 * @returns See the module docs' table.
 */
function canEquipMega(
  ship: Readonly<MeterShip>,
  loadout: Readonly<Loadout>,
  choices: Readonly<MeterChoices>,
): boolean {
  switch (choices.mega) {
    case MegaEffect.Normal:
      return loadout.main !== MainWeapon.Basic;
    case MegaEffect.SpeedDown:
      return ship.speedLevel > 0;
    case MegaEffect.LifeOption:
      return lifeOptionCount(ship, loadout) > 0;
    case MegaEffect.FullBarrier:
      return !(shieldFull(ship.shield) && ship.shield.kind === choices.shield.kind);
    default:
      return true;
  }
}

/**
 * Whether a slot can be equipped now (see the module docs' table: maxed slots are greyed).
 *
 * @param slot - {@link MeterSlot} code.
 * @param ship - The player's ship (speed level, shield; `lives` for LIFE OPTION).
 * @param loadout - The player's loadout.
 * @param maxSpeedLevel - The ship's top speed level (`speeds.length − 1`).
 * @param choices - What `?` and `!` do (default {@link DEFAULT_METER_CHOICES}: the Force Field and
 *   Mega Crash).
 * @returns `false` for a maxed slot or an unknown code.
 */
export function canEquipSlot(
  slot: number,
  ship: Readonly<MeterShip>,
  loadout: Readonly<Loadout>,
  maxSpeedLevel: number,
  choices: Readonly<MeterChoices> = DEFAULT_METER_CHOICES,
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
      return canGrantShield(ship.shield, choices.shield);
    case MeterSlot.Mega:
      return canEquipMega(ship, loadout, choices);
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
 * @param choices - What `?` and `!` do (default {@link DEFAULT_METER_CHOICES}).
 * @returns The mask (bits 0–6).
 */
export function equippableSlots(
  ship: Readonly<MeterShip>,
  loadout: Readonly<Loadout>,
  maxSpeedLevel: number,
  choices: Readonly<MeterChoices> = DEFAULT_METER_CHOICES,
): number {
  let mask = 0;
  for (let slot = 0; slot < METER_SLOT_COUNT; slot++) {
    if (canEquipSlot(slot, ship, loadout, maxSpeedLevel, choices)) mask |= 1 << slot;
  }
  return mask;
}

/**
 * Applies a slot's effect to a ship and loadout when {@link canEquipSlot} allows it. Mega Crash
 * has no lasting effect: the caller detonates it ({@link PowerUpSystem.detonateMegaCrash}); the
 * other `!` choices act here (M2-03): NORMAL (main = the basic shot), SPEED DOWN (speed level − 1),
 * LIFE OPTION ({@link lifeOptionCount} spare ships become Options), FULL BARRIER (a fresh `?`
 * shield).
 *
 * @param slot - {@link MeterSlot} code.
 * @param ship - The player's ship (speed level, shield; `lives` for LIFE OPTION).
 * @param loadout - The player's loadout.
 * @param maxSpeedLevel - The ship's top speed level.
 * @param choices - What `?` and `!` do (default {@link DEFAULT_METER_CHOICES}).
 * @param heading - Where a Free Shield pair attaches, in binary units (default 0 = ahead; the
 *   power-up system passes the player's last 8-way direction — M2-04).
 * @returns Whether it was equipped.
 *
 * @example
 * ```ts
 * equipSlot(MeterSlot.Laser, ship, loadout, 5); // main = Laser (the Double is gone)
 * ```
 */
export function equipSlot(
  slot: number,
  ship: MeterShip,
  loadout: Loadout,
  maxSpeedLevel: number,
  choices: Readonly<MeterChoices> = DEFAULT_METER_CHOICES,
  heading = 0,
): boolean {
  if (!canEquipSlot(slot, ship, loadout, maxSpeedLevel, choices)) return false;
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
      grantShield(ship.shield, choices.shield, heading);
      break;
    case MeterSlot.Mega:
      applyMega(ship, loadout, choices, heading);
      break;
    default:
      break;
  }
  return true;
}

/**
 * The lasting effect of an equippable `!` slot (none for Mega Crash).
 *
 * @param ship - The ship.
 * @param loadout - The loadout.
 * @param choices - The session's choices.
 * @param heading - Where a fresh Free Shield pair attaches (FULL BARRIER).
 */
function applyMega(
  ship: MeterShip,
  loadout: Loadout,
  choices: Readonly<MeterChoices>,
  heading: number,
): void {
  switch (choices.mega) {
    case MegaEffect.Normal:
      loadout.main = MainWeapon.Basic;
      break;
    case MegaEffect.SpeedDown:
      ship.speedLevel--;
      break;
    case MegaEffect.LifeOption: {
      const n = lifeOptionCount(ship, loadout);
      loadout.options += n;
      ship.lives = (ship.lives ?? 1) - n;
      break;
    }
    case MegaEffect.FullBarrier:
      refillShield(ship.shield, choices.shield, heading);
      break;
    default:
      break;
  }
}

/**
 * Classic death penalty (decision D6): takes **one** power level, the first the ship has in the
 * order Option → Double / Laser (back to the basic shot) → Missile → Speed. Never allocates.
 *
 * @param ship - The player's ship (speed level).
 * @param loadout - The player's loadout.
 * @returns The {@link MeterSlot} of the level lost (`Double` / `Laser` for the main weapon), or -1
 *   when there was nothing to lose.
 *
 * @example
 * ```ts
 * loseOneLevel(ship, loadout); // 4 Options → 3
 * ```
 */
export function loseOneLevel(ship: Pick<PlayerShip, 'speedLevel'>, loadout: Loadout): number {
  if (loadout.options > 0) {
    loadout.options--;
    return MeterSlot.Option;
  }
  if (loadout.main === MainWeapon.Laser || loadout.main === MainWeapon.Double) {
    const slot = loadout.main === MainWeapon.Laser ? MeterSlot.Laser : MeterSlot.Double;
    loadout.main = MainWeapon.Basic;
    return slot;
  }
  if (loadout.missile) {
    loadout.missile = false;
    return MeterSlot.Missile;
  }
  if (ship.speedLevel > 0) {
    ship.speedLevel--;
    return MeterSlot.Speed;
  }
  return -1;
}

/**
 * Applies what a death costs (shmup_feat.md §10, decision D6) to a player's power-up state. Never
 * allocates.
 *
 * @remarks
 * Every preset loses the shield (without a break event). `arcade`: everything — basic shot, no
 * Missile, no Options, speed level 0 — and the meter cursor back to -1 (the World also restarts the
 * stage at the last checkpoint when the ship respawns). `classic`: {@link loseOneLevel}, the cursor
 * is kept. `casual`: nothing else. A pending Mega Crash is not touched (it detonates this tick).
 *
 * @param preset - `GameConfig.deathPenalty`.
 * @param ship - The player's ship (speed level, shield).
 * @param loadout - The player's loadout.
 * @param meter - The player's power meter.
 * @returns The {@link MeterSlot} `classic` took (-1 otherwise, or when nothing was left).
 *
 * @example
 * ```ts
 * applyDeathPenalty('classic', ship, loadout, meter); // one level and the shield gone
 * ```
 */
export function applyDeathPenalty(
  preset: DeathPenaltyPreset,
  ship: Pick<PlayerShip, 'speedLevel' | 'shield'>,
  loadout: Loadout,
  meter: PowerMeter,
): number {
  clearShield(ship.shield);
  if (preset === 'arcade') {
    loadout.main = MainWeapon.Basic;
    loadout.missile = false;
    loadout.options = 0;
    ship.speedLevel = 0;
    meter.cursor = -1;
    return -1;
  }
  if (preset === 'classic') return loseOneLevel(ship, loadout);
  return -1;
}

/**
 * Direct-mode death penalty (M2-05, shmup_feat.md §10 / decision D6 for the direct ship). Never
 * allocates.
 *
 * @remarks
 * Every preset loses the Arm (and its blue-item count). `arcade`: both levels to 0 and the first
 * family (the stage also restarts at the last checkpoint, as in meter mode). `classic`: one level —
 * the main shot's if it has any, else the sub-weapon's. `casual` (Darius Twin): nothing more. The
 * Speed toggle's level is the player's choice and stays.
 *
 * @param preset - `GameConfig.deathPenalty`.
 * @param ship - The player's ship (its shield).
 * @param loadout - The player's loadout (`shot`, `sub`, `family`).
 * @returns What `classic` took: 0 a main-shot level, 1 a sub-weapon level, -1 nothing (or another
 *   preset).
 *
 * @example
 * ```ts
 * applyDirectDeathPenalty('classic', ship, loadout); // → 0: shot level 5 → 4, the Arm gone
 * ```
 */
export function applyDirectDeathPenalty(
  preset: DeathPenaltyPreset,
  ship: Pick<PlayerShip, 'shield'>,
  loadout: Loadout,
): number {
  clearShield(ship.shield);
  if (preset === 'arcade') {
    loadout.shot = 0;
    loadout.sub = 0;
    loadout.family = 0;
    return -1;
  }
  if (preset !== 'classic') return -1;
  if (loadout.shot > 0) {
    loadout.shot--;
    return 0;
  }
  if (loadout.sub > 0) {
    loadout.sub--;
    return 1;
  }
  return -1;
}

/**
 * The top level a Direct-mode family allows: its `levels.length − 1`, at most
 * {@link DIRECT_MAX_LEVEL} (0 without a family).
 *
 * @param family - The family, or `null` / `undefined`.
 * @returns The top level.
 */
export function directMaxLevel(family: Readonly<WeaponFamilySpec> | null | undefined): number {
  if (family === null || family === undefined) return 0;
  const top = family.levels.length - 1;
  return top < 0 ? 0 : top > DIRECT_MAX_LEVEL ? DIRECT_MAX_LEVEL : top;
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
  /** The World's effect timers (Mega Crash's flash — `core/fx` `requestFlash`). */
  readonly fx: FxState;
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
    /**
     * Kills every enemy on screen that is not `megaCrashImmune` (`EnemySystem.clearOnScreen` — the
     * blue capsule, M2-04).
     *
     * @param by - Player credited.
     * @returns Enemies killed.
     */
    clearOnScreen(by: number): number;
  };
  /** The enemy bullets (Mega Crash cancels them). */
  readonly bullets: {
    /**
     * Cancels every cancelable bullet and laser (`BulletSystem.cancelAll`).
     *
     * @param mode - `CancelMode`.
     * @param player - Player credited with the point items of `CancelMode.Points`.
     * @returns Bullets cancelled.
     */
    cancelAll(mode: CancelMode, player?: number): number;
  };
  /** The weapons (the loadouts the meter equips). */
  readonly weapons: {
    /** One loadout per player slot. */
    readonly loadouts: readonly Loadout[];
    /**
     * The Direct-mode main families (`WeaponSystem.mainFamilies`, M2-05): the red items' cap and
     * the octagon's cycle. Absent: none.
     */
    readonly mainFamilies?: readonly WeaponFamilySpec[];
    /** The Direct-mode sub family (`WeaponSystem.subFamily`): the green items' cap. */
    readonly subFamily?: WeaponFamilySpec | null;
    /**
     * Per player: the heading of the last 8-way direction held (`WeaponSystem.freeWayHeading`, -1
     * before any) — where a Free Shield pair attaches (M2-04). Absent: ahead.
     */
    readonly freeWayHeading?: Int32Array;
  };
}

/** The meter-mode power-ups of one World (see the module docs). */
export interface PowerUpSystem {
  /** The item pool (registered as `items`). */
  readonly pool: SoaPool<ItemSchema>;
  /** The items' mirror batch (`LayerId.Items`). */
  readonly itemBatch: SpriteBatch;
  /**
   * The shields' mirror batch (`LayerId.Player`, drawn over the ships): a field's sprite, or one
   * sprite per standing pod (M2-04).
   */
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
  /** What the `?` and `!` slots do in this session (from the config — M2-03). */
  readonly choices: Readonly<MeterChoices>;
  /** Whether the session plays Direct mode (`GameConfig.powerUpMode === 'direct'`, M2-05). */
  readonly direct: boolean;
  /**
   * The Direct-mode item plan as {@link DIRECT_ITEMS} indices (the stage's `directItems`, else
   * {@link DEFAULT_DIRECT_ITEM_PLAN}).
   */
  readonly plan: Uint8Array;
  /**
   * Direct-mode items handed out so far (hashed): the next drop is `plan[planCursor % plan.length]`
   * — the plan cycles, and a checkpoint restart does not rewind it.
   */
  readonly planCursor: number;
  /**
   * The co-op drop scaling credit (M2-06, hashed): while two ships are in play (active and not out)
   * every capsule / power-up drop adds `config.coopExtra` to it, and each whole credit drops one
   * more item ({@link COOP_EXTRA_OFFSET} px below the first — a capsule, or the plan's next item in
   * Direct mode). Never reset (like the plan cursor).
   */
  readonly coopCredit: number;
  /**
   * A Direct-mode item's effect on a player (every pickup of one calls it — M2-05; see the module
   * docs' table). Never allocates.
   *
   * @param player - Player slot.
   * @param item - The item's {@link DIRECT_ITEMS} index.
   * @returns Whether it changed something (a level, the Arm, a life, the family, a smart bomb);
   *   `false` without any event for a bad player slot or item index.
   */
  collectDirect(player: number, item: number): boolean;
  /**
   * Drops the next planned Direct-mode item (M2-05; what a `powerup` / `capsule` drop becomes in
   * Direct mode — tests and tools may call it): advances {@link PowerUpSystem.planCursor}.
   *
   * @param x - World x.
   * @param y - World y.
   * @returns The item slot, or -1 (full pool — the plan still advances).
   */
  dropDirect(x: number, y: number): number;
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
   * {@link equipSlot} with the session's {@link PowerUpSystem.choices} (the other `!` choices act
   * there — M2-03), arms Mega Crash for `!` only when the `!` choice is Mega Crash (it detonates in
   * phase 7 — or at once with {@link PowerUpSystem.detonateMegaCrash}), resets the cursor to -1
   * and pushes
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
   * The blue capsule's effect (M2-04): every enemy on screen that is not `megaCrashImmune` is
   * destroyed and credited to the player (`EnemySystem.clearOnScreen` — an Option Hunter among
   * them lets its Options go), with Mega Crash's flash and sound; bullets and the meter are not
   * touched. Never allocates.
   *
   * @param player - Player slot credited (a bad slot credits nobody).
   * @returns Enemies destroyed.
   */
  clearScreen(player: number): number;
  /**
   * A freed Option's effect (M2-04): one more Option (`SFX PowerUpEquip` + `SimEventKind.PowerUp`
   * for the Option slot), or — with {@link MAX_OPTIONS} already — only the meter ding.
   *
   * @param player - Player slot.
   * @returns Whether an Option was added.
   */
  regainOption(player: number): boolean;
  /**
   * Phase 2, after the ships moved and before the weapons fire: the PowerUp press of every active
   * ship that is not `dying` / `dead` (pressed edge only) — in Direct mode the Speed press instead
   * (the toggle, M2-05) —, then its shield pods are placed round it (`core/shields`
   * `placeShieldPods`, M2-04) for this tick's collisions. Never allocates.
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
   * ({@link PowerUpSystem.collect} for a capsule; the blue capsule, a freed Option and — M2-05 —
   * a Direct-mode colour item, {@link PowerUpSystem.collectDirect}, each their own), detonates
   * armed Mega Crashes, counts the shields' i-frames down (`core/shields` `tickShield` — not on
   * the tick of a hit, so a hit on tick `t` blocks ticks `t + 1 … t + 8`) and pushes their hit /
   * break events of the tick, then turns the tick's enemy drops into items (capsules; in Direct
   * mode a `capsule` or `powerup` drop becomes the plan's next colour item —
   * {@link PowerUpSystem.dropDirect}). Never allocates.
   */
  resolve(): void;
  /** Phase 9: refills the item and shield batches. Never allocates. */
  sync(): void;
  /**
   * Checkpoint restart: forgets pickups, pending Mega Crashes and taken drops (the World clears
   * the pool). The Direct-mode {@link PowerUpSystem.planCursor} stays: the item plan never rewinds
   * (M2-05).
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
  /** See {@link PowerUpSystem.choices}. */
  readonly choices: MeterChoices;
  /** See {@link PowerUpSystem.direct}. */
  readonly direct: boolean;
  /** See {@link PowerUpSystem.plan}. */
  readonly plan: Uint8Array;
  /** See {@link PowerUpSystem.planCursor}. */
  planCursor = 0;
  /** The co-op credit (a typed array: a fraction in a closure or field write could box). */
  private readonly credit = new Float64Array(1);
  /** `config.coopExtra` (0 = no co-op drop scaling). */
  private readonly coopExtra: number;
  /** Ticks an item lives per kind (0 = until it leaves the view). */
  private readonly itemLife: Int32Array;
  /** 1 per kind that drifts with the view and bounces (freed Options, Direct-mode items). */
  private readonly itemDrift: Uint8Array;
  /** Sprite id per item kind (-1 = not drawn). */
  private readonly itemSprite: Int32Array;
  /** Animation frames per item kind. */
  private readonly itemFrames: Int32Array;
  /** Score per item kind. */
  private readonly itemScore: Float64Array;
  /** Sprite id per `ShieldKind` (-1 = not drawn). */
  private readonly shieldSprites: Int32Array;
  /** Wear frames per `ShieldKind`. */
  private readonly shieldFrames: Int32Array;
  /** Freed Options spawned this tick (picks their drift — {@link FREE_OPTION_DRIFT}). */
  private freed = 0;
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
   * @param stage - The stage the World plays (its Direct-mode item plan), or `null`.
   */
  constructor(host: PowerUpHost, stage: StageSpec | null) {
    this.host = host;
    this.pool = host.pools.register('items', createSoaPool(MAX_ITEMS, ITEM_SCHEMA));
    this.itemBatch = createSpriteBatch(LayerId.Items, MAX_ITEMS);
    this.shieldBatch = createSpriteBatch(LayerId.Player, MAX_PLAYERS * (1 + MAX_SHIELD_PODS));
    const meters: PowerMeter[] = [];
    for (let p = 0; p < MAX_PLAYERS; p++) meters.push(createPowerMeter());
    this.meters = meters;
    const sprites = host.content.sprites.index;
    const kinds = ITEM_KINDS.length;
    this.itemSprite = new Int32Array(kinds);
    this.itemFrames = new Int32Array(kinds);
    this.itemScore = new Float64Array(kinds);
    this.itemLife = new Int32Array(kinds);
    this.itemDrift = new Uint8Array(kinds);
    for (let k = 0; k < kinds; k++) {
      const spec = ITEM_KINDS[k];
      this.itemSprite[k] = sprites.get(spec.sprite) ?? -1;
      this.itemFrames[k] = spec.frames;
      this.itemScore[k] = spec.score;
      const drifts =
        k === ItemKind.FreeOption || (k >= ItemKind.DirectRed && k <= ItemKind.DirectOctagon);
      this.itemDrift[k] = drifts ? 1 : 0;
      this.itemLife[k] =
        k === ItemKind.FreeOption ? FREE_OPTION_TICKS : drifts ? DIRECT_ITEM_TICKS : 0;
    }
    const config = host.config;
    this.coopExtra = config.coopExtra > 0 ? config.coopExtra : 0;
    this.choices = meterChoicesOf(config);
    this.direct = config.powerUpMode === 'direct';
    const planned = stage !== null && stage.directItems.length > 0 ? stage.directItems : null;
    const plan = planned ?? DEFAULT_DIRECT_ITEM_PLAN;
    this.plan = new Uint8Array(plan.length);
    for (let i = 0; i < plan.length; i++) {
      const index = DIRECT_ITEMS.indexOf(plan[i]);
      this.plan[i] = index >= 0 ? index : 0;
    }
    const shieldKinds = SHIELD_SPECS.length;
    this.shieldSprites = new Int32Array(shieldKinds).fill(-1);
    this.shieldFrames = new Int32Array(shieldKinds).fill(1);
    for (let k = 0; k < shieldKinds; k++) {
      const spec = SHIELD_SPECS[k];
      if (spec === null) continue;
      this.shieldSprites[k] = sprites.get(spec.sprite) ?? -1;
      this.shieldFrames[k] = spec.wearFrames;
    }
    const speeds = host.ship.speeds;
    this.maxSpeedLevel = speeds.length > 0 ? speeds.length - 1 : 0;
    this.boxHw = host.ship.pickupBox.hw;
    this.boxHh = host.ship.pickupBox.hh;
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
      this.choices,
    );
  }

  /** See {@link PowerUpSystem.equippable}. */
  equippable(player: number): number {
    if (!this.valid(player)) return 0;
    return equippableSlots(
      this.host.players[player],
      this.host.weapons.loadouts[player],
      this.maxSpeedLevel,
      this.choices,
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
    equipSlot(
      slot,
      ship,
      this.host.weapons.loadouts[player],
      this.maxSpeedLevel,
      this.choices,
      this.headingOf(player),
    );
    if (slot === MeterSlot.Mega && this.choices.mega === MegaEffect.MegaCrash) {
      this.megaPending[player] = 1;
    }
    this.meters[player].cursor = -1;
    this.pushAtShip(SimEventKind.Sfx, SFX_CUES.PowerUpEquip, ship, 0);
    this.pushAtShip(SimEventKind.PowerUp, slot, ship, player);
  }

  /**
   * Where a Free Shield pair of a player attaches: the last 8-way direction the player held
   * (`WeaponSystem.freeWayHeading`), ahead before any.
   *
   * @param player - Player slot (valid).
   * @returns Binary units.
   */
  private headingOf(player: number): number {
    const headings = this.host.weapons.freeWayHeading;
    if (headings === undefined || player >= headings.length) return 0;
    const heading = headings[player];
    return heading >= 0 ? heading : 0;
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
    // The cancelled bullets turn into points for the bomber (M2-02).
    host.bullets.cancelAll(CancelMode.Points, this.valid(player) ? player : -1);
    const killed = host.enemies.megaCrash(this.valid(player) ? player : -1);
    requestFlash(host, FlashKind.MegaCrash);
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
    const direct = this.direct;
    for (let p = 0; p < players.length && p < MAX_PLAYERS; p++) {
      const ship = players[p];
      if (!ship.active || ship.state === 'dying' || ship.state === 'dead') continue;
      const pressed = p < intents.length ? intents[p].pressed : 0;
      if (direct) {
        // The Speed toggle (remote Ch−, decision D3): the next of the ship's speeds, wrapping.
        if ((pressed & Action.Speed) !== 0) this.toggleSpeed(ship);
      } else if ((pressed & Action.PowerUp) !== 0) {
        this.equipHighlighted(p);
      }
      // The pods sit where this tick's collisions test them (after the move and the equip).
      placeShieldPods(ship.shield, ship);
    }
  }

  /**
   * The Direct-mode Speed toggle: the next speed level, back to 0 after the last (with the meter
   * ding).
   *
   * @param ship - The ship.
   */
  private toggleSpeed(ship: PlayerShip): void {
    const count = this.host.ship.speeds.length;
    const next = ship.speedLevel + 1;
    ship.speedLevel = next >= 0 && next < count ? next : 0;
    this.pushAtShip(SimEventKind.Sfx, SFX_CUES.MeterAdvance, ship, 0);
  }

  /** See {@link PowerUpSystem.beginTick}. */
  beginTick(): void {
    this.takeDrops();
    this.dropsTaken = 0;
    this.freed = 0;
  }

  /** See {@link PowerUpSystem.coopCredit}. */
  get coopCredit(): number {
    return this.credit[0];
  }

  /**
   * Whether two ships are in play (active and not out): the co-op drop scaling applies.
   *
   * @returns `true` with two or more such ships.
   */
  private twoInPlay(): boolean {
    const players = this.host.players;
    let n = 0;
    for (let p = 0; p < players.length; p++) {
      const ship = players[p];
      if (ship.active && !playerOut(ship)) n++;
    }
    return n >= 2;
  }

  /**
   * Turns the enemy outcomes' drops not taken yet into items (M2-06: with two ships in play, a
   * power-up drop adds `config.coopExtra` to the co-op credit and each whole credit drops one more
   * item — {@link PowerUpSystem.coopCredit}).
   */
  private takeDrops(): void {
    const o = this.host.enemies.outcomes;
    const n = o.dropCount;
    const scaled = n > this.dropsTaken && this.coopExtra > 0 && this.twoInPlay();
    const credit = this.credit;
    for (let d = this.dropsTaken; d < n; d++) {
      const kind = o.dropKind[d];
      if (kind === DropKind.Capsule || kind === DropKind.PowerUp) {
        // Mode-agnostic (M2-05): a capsule for the meter, the next planned item in Direct mode.
        if (this.direct) this.dropDirect(o.dropX[d], o.dropY[d]);
        else this.spawnItem(ItemKind.Capsule, o.dropX[d], o.dropY[d]);
        if (!scaled) continue;
        credit[0] += this.coopExtra;
        while (credit[0] >= 1) {
          credit[0] -= 1;
          const y = o.dropY[d] + COOP_EXTRA_OFFSET;
          if (this.direct) this.dropDirect(o.dropX[d], y);
          else this.spawnItem(ItemKind.Capsule, o.dropX[d], y);
        }
      } else if (kind === DropKind.BlueCapsule) {
        this.spawnItem(ItemKind.BlueCapsule, o.dropX[d], o.dropY[d]);
      } else if (kind === DropKind.OneUp) {
        this.spawnItem(ItemKind.OneUp, o.dropX[d], o.dropY[d]);
      } else if (kind === DropKind.BonusCapsule) {
        this.spawnItem(ItemKind.BonusCapsule, o.dropX[d], o.dropY[d]);
      } else if (kind === DropKind.FreeOption) {
        const i = this.spawnItem(ItemKind.FreeOption, o.dropX[d], o.dropY[d]);
        if (i >= 0) {
          const k = (this.freed & 7) * 2;
          this.pool.fields.vx[i] = FREE_OPTION_DRIFT[k];
          this.pool.fields.vy[i] = FREE_OPTION_DRIFT[k + 1];
          this.freed++;
        }
      }
    }
    if (n > this.dropsTaken) this.dropsTaken = n;
  }

  /** See {@link PowerUpSystem.dropDirect}. */
  dropDirect(x: number, y: number): number {
    const plan = this.plan;
    const cursor = this.planCursor;
    this.planCursor = cursor + 1;
    const code = plan.length > 0 ? plan[cursor % plan.length] : 0;
    const i = this.spawnItem(DIRECT_ITEM_KINDS[code], x, y);
    if (i >= 0) {
      const k = (cursor & 1) * 2;
      this.pool.fields.vx[i] = DIRECT_ITEM_DRIFT[k];
      this.pool.fields.vy[i] = DIRECT_ITEM_DRIFT[k + 1];
    }
    return i;
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
    const dx = camera.dx;
    const dy = camera.dy;
    for (let i = 0; i < n; i++) {
      let flags = f.flags[i];
      if ((flags & ItemFlag.Dead) !== 0) continue;
      f.age[i]++;
      let x = f.x[i] + f.vx[i];
      let y = f.y[i] + f.vy[i];
      const kind = f.kind[i];
      if (this.itemDrift[kind] === 1) {
        // Freed Options (M2-04) and Direct-mode items (M2-05) drift with the view and bounce off
        // its top and bottom until their time is up.
        x += dx;
        y += dy;
        const vy = f.vy[i];
        if (
          (y < top + ITEM_CULL_MARGIN + ITEM_RADIUS && vy < 0) ||
          (y > bottom - ITEM_CULL_MARGIN - ITEM_RADIUS && vy > 0)
        ) {
          f.vy[i] = -vy;
        }
        if (f.age[i] >= this.itemLife[kind]) {
          f.x[i] = x;
          f.y[i] = y;
          this.kill(i);
          continue;
        }
      }
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
      const kind = o.pickupKind[k];
      if (kind === ItemKind.Capsule) this.collect(o.pickupPlayer[k]);
      else if (kind === ItemKind.BlueCapsule) this.clearScreen(o.pickupPlayer[k]);
      else if (kind === ItemKind.FreeOption) this.regainOption(o.pickupPlayer[k]);
      else if (kind >= ItemKind.DirectRed && kind <= ItemKind.DirectOctagon) {
        this.collectDirect(o.pickupPlayer[k], kind - ItemKind.DirectRed);
      } else if (kind === ItemKind.OneUp) this.collectOneUp(o.pickupPlayer[k]);
      else if (kind === ItemKind.BonusCapsule) this.collectBonus(o.pickupPlayer[k]);
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

  /**
   * A 1UP was collected (M2-10): +1 life up to `MAX_LIVES` with the critical `ExtraLife` cue; at
   * the cap only the pickup sound (its 0 points are the item's).
   *
   * @param player - The collector's slot.
   */
  private collectOneUp(player: number): void {
    if (!this.valid(player)) return;
    const ship = this.host.players[player];
    if (ship.lives < MAX_LIVES) {
      ship.lives++;
      this.pushAtShip(SimEventKind.Sfx, SFX_CUES.ExtraLife, ship, SfxPriority.Critical);
    } else {
      this.pushAtShip(SimEventKind.Sfx, SFX_CUES.CapsulePickup, ship, 0);
    }
  }

  /**
   * A bonus capsule was collected (M2-10): the pickup sound (its {@link BONUS_CAPSULE_SCORE}
   * points are the item's, credited with the tick's score).
   *
   * @param player - The collector's slot.
   */
  private collectBonus(player: number): void {
    if (!this.valid(player)) return;
    this.pushAtShip(SimEventKind.Sfx, SFX_CUES.CapsulePickup, this.host.players[player], 0);
  }

  /** See {@link PowerUpSystem.clearScreen}. */
  clearScreen(player: number): number {
    const host = this.host;
    const by = this.valid(player) ? player : -1;
    const killed = host.enemies.clearOnScreen(by);
    requestFlash(host, FlashKind.MegaCrash);
    if (by >= 0) this.pushAtShip(SimEventKind.Sfx, SFX_CUES.MegaCrash, host.players[by], 0);
    else host.events.push(SimEventKind.Sfx, SFX_CUES.MegaCrash, 0, 0, 0);
    return killed;
  }

  /** See {@link PowerUpSystem.regainOption}. */
  regainOption(player: number): boolean {
    if (!this.valid(player)) return false;
    const ship = this.host.players[player];
    const loadout = this.host.weapons.loadouts[player];
    if (loadout.options >= MAX_OPTIONS) {
      this.pushAtShip(SimEventKind.Sfx, SFX_CUES.MeterAdvance, ship, 0);
      return false;
    }
    loadout.options++;
    this.pushAtShip(SimEventKind.Sfx, SFX_CUES.PowerUpEquip, ship, 0);
    this.pushAtShip(SimEventKind.PowerUp, MeterSlot.Option, ship, player);
    return true;
  }

  /** See {@link PowerUpSystem.collectDirect}. */
  collectDirect(player: number, item: number): boolean {
    // A bad player or item is no pickup: no cue either.
    if (!this.valid(player) || !(item >= 0 && item < DIRECT_ITEMS.length && item % 1 === 0)) {
      return false;
    }
    const host = this.host;
    const ship = host.players[player];
    const loadout = host.weapons.loadouts[player];
    this.pushAtShip(SimEventKind.Sfx, SFX_CUES.CapsulePickup, ship, 0);
    const mains = host.weapons.mainFamilies;
    const count = mains === undefined ? 0 : mains.length;
    let changed = false;
    switch (item) {
      case 0: {
        // Red: the main shot's next level (its family's top level caps it; a negative family index
        // is the first family, as `core/weapons` fires it).
        const index = loadout.family >= 0 ? loadout.family % count : 0;
        const top = count > 0 && mains !== undefined ? directMaxLevel(mains[index]) : 0;
        if (loadout.shot < top) {
          loadout.shot++;
          changed = true;
        }
        break;
      }
      case 1: {
        // Green: the sub-weapon's next level.
        if (loadout.sub < directMaxLevel(host.weapons.subFamily)) {
          loadout.sub++;
          changed = true;
        }
        break;
      }
      case 2:
        // Blue: the Arm — grant, repair, next tier.
        collectArm(ship.shield);
        changed = true;
        break;
      case 3:
        // Orange: 1UP.
        if (ship.lives < MAX_LIVES) {
          ship.lives++;
          this.pushAtShip(SimEventKind.Sfx, SFX_CUES.ExtraLife, ship, SfxPriority.Critical);
          changed = true;
        }
        break;
      case 4:
        // Yellow: the smart bomb.
        this.detonateMegaCrash(player);
        changed = true;
        break;
      case 5:
        // The red octagon: the next main-shot family, the level kept (capped by the new family).
        if (count > 1 && mains !== undefined) {
          loadout.family = ((loadout.family >= 0 ? loadout.family % count : 0) + 1) % count;
          const top = directMaxLevel(mains[loadout.family]);
          if (loadout.shot > top) loadout.shot = top;
          changed = true;
        }
        break;
      default:
        return false;
    }
    if (changed && item !== 3 && item !== 4) {
      this.pushAtShip(SimEventKind.Sfx, SFX_CUES.PowerUpEquip, ship, 0);
    }
    if (changed) {
      this.pushAtShip(SimEventKind.PowerUp, DIRECT_POWER_UP_EVENT_BASE + item, ship, player);
    }
    return changed;
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
      // A drifting item (a freed Option, a Direct-mode item) blinks through its last ticks.
      const life = this.itemLife[kind];
      const expiring =
        life > 0 && f.age[i] >= life - ITEM_EXPIRY_BLINK_TICKS && (f.age[i] & 4) !== 0;
      items.x[slot] = f.x[i];
      items.y[slot] = f.y[i];
      items.spriteId[slot] = sprite;
      items.frame[slot] = frames > 1 ? Math.floor(blink / ITEM_BLINK_TICKS) % frames : 0;
      items.flags[slot] = expiring ? SpriteFlag.Hidden : 0;
      items.count = slot + 1;
    }
    const shields = this.shieldBatch;
    shields.count = 0;
    const players = this.host.players;
    for (let p = 0; p < players.length; p++) {
      const ship = players[p];
      if (!ship.active || ship.state === 'dying' || ship.state === 'dead') continue;
      const shield = ship.shield;
      if (!shieldActive(shield)) continue;
      const sprite = this.shieldSprites[shield.kind];
      if (sprite < 0) continue;
      const frames = this.shieldFrames[shield.kind];
      // Blinks with the ship's invulnerability and during its own shield-hit i-frames.
      const blinking = ship.invulnTicks > 0 && (ship.invulnTicks & 4) !== 0;
      if (shield.podCount === 0) {
        const slot = shields.count;
        if (slot >= shields.capacity) break;
        const hidden = blinking || (shield.iFrames > 0 && (shield.iFrames & 2) !== 0);
        shields.x[slot] = ship.x;
        shields.y[slot] = ship.y;
        shields.spriteId[slot] = sprite;
        // The Arm (M2-05) draws its tier's colour block of wear frames.
        shields.frame[slot] =
          shield.kind === ShieldKind.Arm ? armWearFrame(shield) : shieldWearFrame(shield, frames);
        shields.flags[slot] = hidden ? SpriteFlag.Hidden : 0;
        shields.count = slot + 1;
        continue;
      }
      // Pods: one sprite each, where they are after this tick's spin (M2-04).
      placeShieldPods(shield, ship);
      for (let k = 0; k < shield.podCount; k++) {
        if (shield.podHits[k] <= 0) continue;
        const slot = shields.count;
        if (slot >= shields.capacity) return;
        const pi = shield.podIFrames[k];
        shields.x[slot] = shield.podX[k];
        shields.y[slot] = shield.podY[k];
        shields.spriteId[slot] = sprite;
        shields.frame[slot] = podWearFrame(shield, k, frames);
        shields.flags[slot] = blinking || (pi > 0 && (pi & 2) !== 0) ? SpriteFlag.Hidden : 0;
        shields.count = slot + 1;
      }
    }
  }

  /** See {@link PowerUpSystem.clear}. */
  clear(): void {
    this.outcomes.pickupCount = 0;
    this.megaPending.fill(0);
    this.dropsTaken = 0;
    this.freed = 0;
    this.itemBatch.count = 0;
    this.shieldBatch.count = 0;
  }
}

/**
 * Creates the power-up system of a World (load time): the item pool (registered as `items`), one
 * meter per player, the item and shield batches, the compiled Auto Power-Up order, the session's
 * `?` / `!` choices ({@link meterChoicesOf} of the config — M2-03) and the sprite ids of the item
 * kinds and the `?` shield, and the Direct-mode item plan (the stage's `directItems`, else
 * {@link DEFAULT_DIRECT_ITEM_PLAN} — M2-05).
 *
 * @param host - The World (read at every call — pass the World itself).
 * @param stage - The stage the World plays (its item plan), or `null` (default — free flight).
 * @returns The system.
 * @throws {Error} When the World already registered a pool named `items`.
 *
 * @example
 * ```ts
 * const powerups = createPowerUpSystem(world);
 * powerups.spawnItem(ItemKind.Capsule, world.camera.x + 200, world.camera.y + 100);
 * ```
 */
export function createPowerUpSystem(
  host: PowerUpHost,
  stage: StageSpec | null = null,
): PowerUpSystem {
  return new PowerUpSystemImpl(host, stage);
}
