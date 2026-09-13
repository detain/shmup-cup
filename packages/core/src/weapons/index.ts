/**
 * # weapons — player weapons
 *
 * **Status: implemented**: the meter mode's **Type A** arsenal of M1-10 (the main shot, Double,
 * Laser and ground Missile, fired with always-on autofire by the ship and its Options, with
 * per-shooter caps, piercing beams and grid-based hits), the **Types B–D** behaviours, presets
 * and Weapon Edit of M2-03, and the Direct mode's 9-level shot **families** of M2-05.
 *
 * **Responsibility.** The players' projectiles of a World ({@link WeaponSystem}):
 *
 * - **Shots** — a struct-of-arrays pool of {@link MAX_PLAYER_SHOTS} (96) registered with the
 *   World as `playerShots` (flushed in phase 8, hashed by `hashWorld`). Each shot belongs to a
 *   **shooter** — the ship or one of its four Options ({@link SHOOTERS_PER_PLAYER} per player) —
 *   and a **role** ({@link WeaponRole}: main shot, Double, Laser, Missile), and flies by its
 *   role's behaviour ({@link ShotKind}).
 * - **Loadouts** — one {@link Loadout} per player: `main` (basic / double / laser), `missile` and
 *   `options` (0–4), plus the ship's own `speedLevel` and `shield` (`core/player`,
 *   `core/shields`). The power meter of M1-11 (`core/powerups`) changes them;
 *   `GameConfig.loadout: 'full'` starts a session fully powered (dev).
 * - **The arsenal** (M2-03) — which weapon each role fires: the preset `GameConfig.weaponPreset`
 *   (`type-a` … `type-d`) with `GameConfig.weaponEdit` overriding the Missile / Double / Laser
 *   roles ({@link resolveArsenal}); the MISSILE, DOUBLE and LASER meter slots equip those roles.
 *   {@link WeaponSystem.setArsenal} swaps it in place (the weapon select's preview).
 * - **Options** — one `core/options` {@link OptionGroup} per player, of the session's type
 *   (`GameConfig.optionChoice`: trail, Snake, Formation or Rotate — M2-04; steered by the
 *   player's hold / toggle every tick); every Option fires every weapon of the loadout with its own
 *   caps, wherever its type puts it.
 * - **Hits** — enemy hurtboxes are in the World's grid (phase 6); each shot queries the cells
 *   under its box and tests the hurtboxes exactly. A non-piercing shot hits the overlapping enemy
 *   with the lowest slot and dies; a piercing shot hits every overlapping enemy whose entry in the
 *   shot's hit-cooldown table (`Uint8Array`, one entry per enemy slot) is 0, then waits its
 *   role's cooldown before hitting that enemy again (damage over time). Armoured enemies
 *   (`EnemyFlag.Invulnerable`) take no damage: the shot dies with a `Clink`. Hits are found in
 *   phase 6 ({@link WeaponSystem.collide}) and applied in phase 7
 *   ({@link WeaponSystem.applyHits}) through `EnemySystem.damage`, which pushes the explosion
 *   events and records the kill (spec, position, score, killer) for scoring.
 * - **Boss parts** (M1-13) are hit targets too: their ids in the grid and in the hit list follow
 *   the enemy slots (`core/bosses` `BOSS_PART_ID_BASE` + part index), piercing shots keep a
 *   second cooldown table for them ({@link WeaponSystem.partCooldowns}), and a hit goes through
 *   `BossSystem.damagePart` — a part that cannot take damage now (the intro, armour, a closed or
 *   still shielded weak point) answers with a `Clink` and the shot dies, like armour.
 *
 * **Type A behaviours** (tunables from `content/weapons/*.weapons.json`, behaviour-specific ones
 * in `params` — defaults in {@link WEAPON_BEHAVIOR_PARAMS}):
 *
 * - `shot.straight` — flies forward at `speed`; dies on hit, on terrain and outside the view.
 *   (Since M2-07 every shot that dies on terrain — a straight flight, a laser head it blocks, a
 *   Spread Bomb bursting on it, a missile flying into a wall — hits the destructible tile at that
 *   pixel with its damage through the World's stage gimmicks, `WeaponHost.gimmicks`.)
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
 * **Types B–D behaviours** (M2-03, shmup_feat.md §7A; defaults in {@link WEAPON_BEHAVIOR_PARAMS}):
 *
 * - `missile.spreadBomb` — falls in an arc (`angle` down, `gravity`) and bursts on terrain or on
 *   the first target it touches into a piercing, world-anchored blast of `blastRadius` that burns
 *   `blastTicks` ticks and hits each target at most once every `hitCooldownTicks` — twice with the
 *   defaults (12 / 6). A blast is not stopped by armour (it clinks, at most once per cooldown).
 *   Cap: bombs and blasts together.
 * - `missile.twoWay` — a volley of two missiles, one `angle` units up from forward, one down; each
 *   dies on its first hit or on terrain; the next volley waits until both are gone.
 * - `missile.torpedo` — a fast `missile.groundSlide` (falls, then slides) that flies on through
 *   every enemy its hit destroys ("pierces small enemies"); a survivor, armour or a boss part
 *   stops it.
 * - `shot.tailGun` / `shot.vertical` — Doubles whose second shot flies straight back / straight up.
 * - `shot.freeWay` — a Double whose second shot flies in the last 8-way direction the player held
 *   ({@link WeaponSystem.freeWayHeading}; `angle` up from forward before any).
 * - `laser.ripple` — a non-piercing ring flying forward that grows from `startSize` by `growth` per
 *   tick up to `maxSize` (half heights; the width is `aspect` × the height). Its ring is the
 *   hitbox: a target touches it when it reaches into the ellipse without being wholly inside the
 *   ring's inner edge ({@link RIPPLE_RING_WIDTH} px in).
 * - `laser.cyclone` — a `laser.beam` with a thicker box and swirling segments (`frames`).
 * - `laser.twin` — two short beams `gap` px apart that follow their shooter; a pair fires while two
 *   more fit under the cap (non-piercing in the shipped content).
 *
 * **Direct mode** (M2-05, shmup_feat.md §7B — `GameConfig.powerUpMode: 'direct'`, the MANTA). The
 * content's shot **families** (`content/weapons/` `families`, `core/data` `WeaponFamilySpec`) are
 * compiled at creation: every weapon a family's volleys fire gets a **direct role** of its own
 * (roles {@link WEAPON_ROLE_COUNT} … — up to {@link MAX_DIRECT_WEAPONS} weapons, with the same
 * tables as the meter roles), and every level becomes a list of emitters (weapon, heading, offset)
 * grouped by weapon. The main shot fires the level {@link Loadout.shot} of the main family
 * {@link Loadout.family} (the content's `main` families in order — Beam → Disc, Laser → Wave), the
 * sub-weapon the level {@link Loadout.sub} of the first `sub` family, each on its own autofire
 * timer (the level's `refireTicks`, else `config.autofireInterval` / `missileInterval`); a volley
 * fires each weapon's shots only while `live + n` fits its cap (the level's `volleys × n`, else
 * the weapon's `cap`). Two behaviours are made for the families: `direct.bolt` (a straight shot in
 * the emitter's heading, optionally piercing; its sprite frame is the `frame` tunable, or with
 * `turn` the heading's octant — un-rotated art) and `direct.bomb` (a Spread Bomb fired in the
 * emitter's heading: `gravity` bends it, it bursts on terrain or its first target into a small
 * blast). {@link applyDirectLoadout} sets a Direct-mode starting loadout. Meter mode never fires
 * the families; Direct mode never fires the meter roles.
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
 * World built from content without weapons never fires. The config's preset (`type-a` by default;
 * else the first preset, else the first weapon of each slot) and its Weapon Edit decide which
 * weapon each role uses ({@link resolveArsenal}).
 *
 * **Zero allocation.** Pools, tables, batches and the grid visitor are built by
 * {@link createWeaponSystem}; per-tick code passes whole numbers across calls (positions travel
 * through class fields) and writes typed arrays.
 *
 * **Implements.**
 * - shmup_feat.md §7 Weapons catalog — 7A Type A (Missile, Double, Laser), Types B–D (Spread
 *   Bomb, 2-Way Missile, Photon Torpedo, Tail Gun, Vertical, Free Way, Ripple, Cyclone Laser, Twin
 *   Laser), the preset loadouts and Weapon Edit, 7C on-screen caps,
 *   piercing vs non-piercing, per-projectile damage, damage over time for beams, ground-following
 *   projectiles, Options copy all weapons, weapons defined in data
 * - shmup_feat.md §7B — the Direct-mode main-shot families (Beam → Disc, Laser → Wave, 9 levels
 *   each) and the 9-level sub-weapon, as data (M2-05)
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
 * {@link DEFAULT_WEAPON_PRESET}, {@link FULL_LOADOUT_SPEED_LEVEL}; M2-03: {@link resolveArsenal},
 * {@link weaponsOfSlot}, {@link weaponLabel}, {@link WEAPON_BEHAVIOR_LABELS},
 * {@link SPREAD_BLAST_SPRITE}, {@link WEAPON_SPRITES}, {@link RIPPLE_RING_WIDTH}; M2-05:
 * {@link applyDirectLoadout}, {@link DIRECT_MAX_LEVEL}, {@link MAX_DIRECT_WEAPONS},
 * {@link WEAPON_ROLE_SLOTS}, {@link resolveFamilies}.
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
import { BOSS_PART_ID_BASE, BossHit, type BossPart } from '../bosses/index.js';
import {
  MAX_BOSS_PARTS,
  type ContentDb,
  type PlayerShipSpec,
  type ValidationIssue,
  type WeaponFamilySpec,
  type WeaponPresetSpec,
  type WeaponSlot,
  type WeaponSpec,
} from '../data/index.js';
import { EnemyFlag, EnemyState, MAX_ENEMIES, type Enemy } from '../enemies/index.js';
import {
  FX_CUES,
  SFX_CUES,
  SFX_CUE_NAMES,
  SimEventKind,
  type EventQueue,
} from '../events/index.js';
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
import {
  ARM_TIERS,
  FORCE_FIELD,
  clearShield,
  collectArm,
  grantShield,
  type ShieldSpec,
} from '../shields/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'weapons',
  status: 'implemented',
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
  /** `missile.spreadBomb`: falls in an arc, then bursts into a blast that hits twice (M2-03). */
  SpreadBomb: 4,
  /** `missile.twoWay`: a volley of two missiles, one climbing, one diving (M2-03). */
  TwoWay: 5,
  /** `missile.torpedo`: a fast ground slider that flies on through what it destroys (M2-03). */
  Torpedo: 6,
  /** `shot.freeWay`: forward + a shot in the ship's last 8-way direction (M2-03). */
  FreeWay: 7,
  /** `laser.ripple`: a ring that grows as it flies (M2-03). */
  Ripple: 8,
  /** `laser.twin`: two short parallel beams (M2-03). */
  Twin: 9,
} as const;

/** A {@link ShotKind} code. */
export type ShotKind = (typeof ShotKind)[keyof typeof ShotKind];

/**
 * Coded weapon behaviours by script id → {@link ShotKind}. Several behaviours share a kind with
 * other defaults: the Tail Gun and the Vertical are Doubles whose second shot turns 180° / 90°,
 * the Cyclone Laser is a thicker, swirling beam.
 */
export const WEAPON_BEHAVIOR_KINDS: Readonly<Record<WeaponBehaviorId, ShotKind>> = Object.freeze({
  'shot.straight': ShotKind.Straight,
  'shot.double': ShotKind.Double,
  'laser.beam': ShotKind.Laser,
  'missile.groundSlide': ShotKind.Missile,
  'missile.spreadBomb': ShotKind.SpreadBomb,
  'missile.twoWay': ShotKind.TwoWay,
  'missile.torpedo': ShotKind.Torpedo,
  'shot.tailGun': ShotKind.Double,
  'shot.vertical': ShotKind.Double,
  'shot.freeWay': ShotKind.FreeWay,
  'laser.ripple': ShotKind.Ripple,
  'laser.cyclone': ShotKind.Laser,
  'laser.twin': ShotKind.Twin,
  'direct.bolt': ShotKind.Straight,
  'direct.bomb': ShotKind.SpreadBomb,
});

/**
 * Behaviour tunables (content `params`) with their defaults, per behaviour. Angles are binary
 * units (1024 per turn); `ox` / `oy` place the new shot relative to its shooter's centre; `hw` /
 * `hh` are the hitbox half sizes. The M2-03 behaviours add: `gravity` (px/tick² of the Spread
 * Bomb's fall), `blastRadius` / `blastTicks` (its blast's half size and life), `startSize` /
 * `maxSize` / `growth` / `aspect` (the Ripple's half height when fired, at most, its growth per
 * tick and width ÷ height), `gap` (the distance between the Twin Laser's beams) and `frames` (the
 * blast's, ring's or swirl's animation frames). The M2-05 Direct-mode behaviours add `frame`
 * (the still frame a `direct.bolt` / `direct.bomb` shows) and `turn` (1 = a `direct.bolt` shows the
 * frame of its heading's octant instead: 0 right, 1 down-right … 7 up-right).
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
  'missile.spreadBomb': Object.freeze({
    angle: 64,
    gravity: 0.12,
    ox: 2,
    oy: 4,
    hw: 3,
    hh: 3,
    blastRadius: 14,
    blastTicks: 12,
    hitCooldownTicks: 6,
    frames: 4,
  }),
  'missile.twoWay': Object.freeze({ angle: 128, ox: 2, oy: 0, hw: 3, hh: 3 }),
  'missile.torpedo': Object.freeze({
    slideSpeed: 5,
    angle: 96,
    ox: 0,
    oy: 4,
    hw: 5,
    hh: 1.5,
    frames: 2,
  }),
  'shot.tailGun': Object.freeze({ angle: 512, ox: -6, oy: 0, hw: 4, hh: 2 }),
  'shot.vertical': Object.freeze({ angle: 256, ox: 0, oy: -6, hw: 2, hh: 4 }),
  'shot.freeWay': Object.freeze({ angle: 128, ox: 0, oy: 0, hw: 3, hh: 3 }),
  'laser.ripple': Object.freeze({
    startSize: 4,
    maxSize: 20,
    growth: 0.5,
    aspect: 0.5,
    ox: 8,
    oy: 0,
    frames: 6,
  }),
  'laser.cyclone': Object.freeze({
    maxLength: 80,
    hitCooldownTicks: 6,
    ox: 8,
    oy: 0,
    hh: 4,
    frames: 4,
  }),
  'laser.twin': Object.freeze({ maxLength: 16, gap: 8, ox: 8, oy: 0, hh: 1.5 }),
  'direct.bolt': Object.freeze({
    ox: 8,
    oy: 0,
    hw: 4,
    hh: 2,
    frame: 0,
    turn: 0,
    hitCooldownTicks: 6,
  }),
  'direct.bomb': Object.freeze({
    gravity: 0,
    ox: 2,
    oy: 0,
    hw: 3,
    hh: 3,
    blastRadius: 8,
    blastTicks: 8,
    hitCooldownTicks: 6,
    frames: 4,
    frame: 0,
  }),
});

/** The loadout slot each behaviour belongs in (checked by {@link checkWeaponBehaviors}). */
export const WEAPON_BEHAVIOR_SLOTS: Readonly<Record<WeaponBehaviorId, readonly WeaponSlot[]>> =
  Object.freeze({
    'shot.straight': Object.freeze(['main'] as WeaponSlot[]),
    'shot.double': Object.freeze(['double'] as WeaponSlot[]),
    'laser.beam': Object.freeze(['laser'] as WeaponSlot[]),
    'missile.groundSlide': Object.freeze(['missile'] as WeaponSlot[]),
    'missile.spreadBomb': Object.freeze(['missile'] as WeaponSlot[]),
    'missile.twoWay': Object.freeze(['missile'] as WeaponSlot[]),
    'missile.torpedo': Object.freeze(['missile'] as WeaponSlot[]),
    'shot.tailGun': Object.freeze(['double'] as WeaponSlot[]),
    'shot.vertical': Object.freeze(['double'] as WeaponSlot[]),
    'shot.freeWay': Object.freeze(['double'] as WeaponSlot[]),
    'laser.ripple': Object.freeze(['laser'] as WeaponSlot[]),
    'laser.cyclone': Object.freeze(['laser'] as WeaponSlot[]),
    'laser.twin': Object.freeze(['laser'] as WeaponSlot[]),
    'direct.bolt': Object.freeze(['main', 'sub'] as WeaponSlot[]),
    'direct.bomb': Object.freeze(['sub'] as WeaponSlot[]),
  });

/**
 * The power meter's label of each behaviour (the HUD draws it in the slot the weapon sits in —
 * `core/ui` `METER_LABEL_FRAMES` holds the matching `hud/meter-labels` frames, shmup_feat.md §6A).
 */
export const WEAPON_BEHAVIOR_LABELS: Readonly<Record<WeaponBehaviorId, string>> = Object.freeze({
  'shot.straight': 'SHOT',
  'shot.double': 'DOUBLE',
  'laser.beam': 'LASER',
  'missile.groundSlide': 'MISSILE',
  'missile.spreadBomb': 'SPREAD',
  'missile.twoWay': '2-WAY',
  'missile.torpedo': 'TORPEDO',
  'shot.tailGun': 'TAIL',
  'shot.vertical': 'VERTICAL',
  'shot.freeWay': 'FREE WAY',
  'laser.ripple': 'RIPPLE',
  'laser.cyclone': 'CYCLONE',
  'laser.twin': 'TWIN',
  'direct.bolt': 'BOLT',
  'direct.bomb': 'BOMB',
});

/**
 * Width of the Ripple's ring in pixels (measured on its height): a target the ring has grown
 * around further than this is inside it and no longer hit.
 */
export const RIPPLE_RING_WIDTH = 4;

/** The Spread Bomb's blast sprite (an engine sprite — see core `world` `ENGINE_SPRITES`). */
export const SPREAD_BLAST_SPRITE = 'shots/blast';

/** The sprites the weapons draw on their own, whatever the content (part of `ENGINE_SPRITES`). */
export const WEAPON_SPRITES: readonly string[] = Object.freeze([SPREAD_BLAST_SPRITE]);

/**
 * The Free Way's heading per 8-way direction, `[(moveY + 1) × 3 + (moveX + 1)]` (binary units; -1
 * for no direction).
 */
const DIRECTION_HEADINGS = Object.freeze([640, 768, 896, 512, -1, 0, 384, 256, 128]);

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

/**
 * Most distinct weapons the Direct-mode families may fire (M2-05): each gets a direct role
 * `WEAPON_ROLE_COUNT + k`; the weapons of later families beyond it are left out.
 */
export const MAX_DIRECT_WEAPONS = 32;

/**
 * Role slots of the role tables and of {@link WeaponSystem.liveCounts}' stride: the meter roles,
 * then the direct roles (M2-05).
 */
export const WEAPON_ROLE_SLOTS = WEAPON_ROLE_COUNT + MAX_DIRECT_WEAPONS;

/** Highest Direct-mode shot / sub-weapon level (shmup_feat.md §7B: levels 0 … 8). */
export const DIRECT_MAX_LEVEL = 8;

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
  /** A Spread Bomb that burst: the blast (piercing, world-anchored — M2-03). */
  Blast: 16,
} as const;

/** Field layout of the shot pool (hashed in sorted field order). */
export const SHOT_SCHEMA = Object.freeze({
  /** World x: the centre (a laser's head). */
  x: 'f64',
  /** World y of the centre. */
  y: 'f64',
  /** Velocity x (px/tick, before the camera ride). */
  vx: 'f64',
  /** Velocity y (a Twin Laser beam: its row offset from the shooter's). */
  vy: 'f64',
  /** Laser length in pixels (the tail is at `x − length`); 0 for other shots. */
  length: 'f64',
  /** Hitbox half width (a laser's box spans its length). */
  hw: 'f64',
  /** Hitbox half height. */
  hh: 'f64',
  /** Damage per hit. */
  damage: 'i32',
  /** {@link WeaponRole}, or a Direct-mode role (≥ {@link WEAPON_ROLE_COUNT}, M2-05). */
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
  /** Ticks the shot has moved (a Spread Bomb's blast: ticks since it burst). */
  age: 'i32',
  /** Hit-cooldown table index + 1 (0 = none: a non-piercing shot). */
  table: 'i32',
} as const);

/** The shot pool's schema type. */
export type ShotSchema = typeof SHOT_SCHEMA;

/**
 * One player's loadout (plan M1-10). The ship's speed level and shield live on the ship
 * (`PlayerShip.speedLevel`, `PlayerShip.shield`); the power meter (`core/powerups`, M1-11) equips
 * the meter fields, the Direct-mode items (M2-05) the direct ones.
 */
export class Loadout {
  /** The main weapon ({@link MainWeapon}). */
  main: MainWeapon = MainWeapon.Basic;
  /** Whether the Missile is equipped. */
  missile = false;
  /** Options owned (0–{@link MAX_OPTIONS}). */
  options = 0;
  /** Direct mode: the main shot's level, 0 … {@link DIRECT_MAX_LEVEL} (red items — M2-05). */
  shot = 0;
  /** Direct mode: the sub-weapon's level, 0 … {@link DIRECT_MAX_LEVEL} (green items). */
  sub = 0;
  /**
   * Direct mode: the main-shot family, an index into the content's `main` families (0 = the
   * first — Beam → Disc; the red octagon moves on to the next).
   */
  family = 0;
}

/**
 * Applies a starting loadout to a player.
 *
 * @remarks
 * `'default'` = the basic shot, no missile, no options, no shield, speed level 0. `'full'` (the
 * web app's `?loadout=full` dev override) = speed level {@link FULL_LOADOUT_SPEED_LEVEL}, the
 * Missile, the Laser, four Options and a fresh Force Field (`core/shields`). The Direct-mode
 * fields go to 0 (a Direct-mode session uses {@link applyDirectLoadout}).
 *
 * @param loadout - The player's loadout.
 * @param ship - The player's ship (its speed level and shield).
 * @param preset - Which loadout.
 * @param shield - The shield `'full'` grants (default the Force Field; the session's `?` choice —
 *   `core/shields` `shieldSpecOf(config.shieldChoice)`).
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
  shield: ShieldSpec = FORCE_FIELD,
): void {
  const full = preset === 'full';
  loadout.main = full ? MainWeapon.Laser : MainWeapon.Basic;
  loadout.missile = full;
  loadout.options = full ? MAX_OPTIONS : 0;
  loadout.shot = 0;
  loadout.sub = 0;
  loadout.family = 0;
  ship.speedLevel = full ? FULL_LOADOUT_SPEED_LEVEL : 0;
  if (full) grantShield(ship.shield, shield);
  else clearShield(ship.shield);
}

/**
 * Applies a Direct-mode starting loadout to a player (M2-05): the meter fields empty and
 *
 * - `'default'` — main shot and sub-weapon at level 0, the first family, no Arm;
 * - `'full'` (the web app's `?loadout=full`) — both at {@link DIRECT_MAX_LEVEL}, the first family,
 *   the gold Hyper Arm (9 blue items).
 *
 * The speed level becomes the ship's `startSpeedLevel` in both (the Speed toggle is the player's
 * choice, not power).
 *
 * @param loadout - The player's loadout.
 * @param ship - The player's ship (speed level, shield).
 * @param preset - Which loadout.
 * @param startSpeedLevel - The ship spec's `startSpeedLevel` (default 0).
 *
 * @example
 * ```ts
 * const start = world.ship.startSpeedLevel;
 * applyDirectLoadout(world.weapons.loadouts[0], world.players[0], 'full', start);
 * ```
 */
export function applyDirectLoadout(
  loadout: Loadout,
  ship: PlayerShip,
  preset: StartingLoadout,
  startSpeedLevel = 0,
): void {
  const full = preset === 'full';
  loadout.main = MainWeapon.Basic;
  loadout.missile = false;
  loadout.options = 0;
  loadout.shot = full ? DIRECT_MAX_LEVEL : 0;
  loadout.sub = full ? DIRECT_MAX_LEVEL : 0;
  loadout.family = 0;
  ship.speedLevel = startSpeedLevel > 0 ? startSpeedLevel : 0;
  clearShield(ship.shield);
  if (full) {
    // The gold Hyper Arm: as many blue items as its tier needs.
    while (ship.shield.tier < ARM_TIERS) collectArm(ship.shield);
  }
}

/**
 * The Direct-mode families of a content (M2-05), as the weapons fire them.
 *
 * @param content - Validated content.
 * @returns `main`: the content's `main` families in content order (the red octagon cycles through
 *   them); `sub`: its first `sub` family, or `null`. New arrays (load time).
 */
export function resolveFamilies(content: ContentDb): {
  main: WeaponFamilySpec[];
  sub: WeaponFamilySpec | null;
} {
  const main: WeaponFamilySpec[] = [];
  let sub: WeaponFamilySpec | null = null;
  for (const family of content.weaponFamilies) {
    if (family.slot === 'main') main.push(family);
    else if (sub === null) sub = family;
  }
  return { main, sub };
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
 * The session's arsenal (plan M2-03): the weapon of each {@link WeaponRole} for a config's
 * `weaponPreset` ({@link resolveWeaponPreset} — a content without it falls back to its first
 * preset) with `weaponEdit` overriding the Missile / Double / Laser roles.
 *
 * @remarks
 * Load time only (it allocates the result).
 *
 * @param content - Validated content.
 * @param config - The session config (`weaponPreset`, `weaponEdit`).
 * @returns Four entries in {@link WeaponRole} order, `null` for an empty role.
 * @throws {RangeError} When `weaponEdit` names a weapon the content does not have, or one of
 *   another slot.
 *
 * @example
 * ```ts
 * resolveArsenal(db, resolveGameConfig({ weaponPreset: 'type-b' }))[WeaponRole.Laser]?.id;
 * // → 'laser.ripple'
 * ```
 */
export function resolveArsenal(
  content: ContentDb,
  config: Readonly<Pick<GameConfig, 'weaponPreset' | 'weaponEdit'>>,
): (WeaponSpec | null)[] {
  const roles = resolveRoleWeapons(content, resolveWeaponPreset(content, config.weaponPreset));
  const edit = config.weaponEdit;
  if (edit !== null) {
    roles[WeaponRole.Missile] = editedWeapon(content, edit.missile, 'missile');
    roles[WeaponRole.Double] = editedWeapon(content, edit.double, 'double');
    roles[WeaponRole.Laser] = editedWeapon(content, edit.laser, 'laser');
  }
  return roles;
}

/**
 * One weapon of a Weapon Edit.
 *
 * @param content - Validated content.
 * @param id - The weapon id.
 * @param slot - The slot it must sit in.
 * @returns The weapon.
 * @throws {RangeError} When the content has no such weapon or it belongs in another slot.
 */
function editedWeapon(content: ContentDb, id: string, slot: WeaponSlot): WeaponSpec {
  const index = content.weaponIndex.get(id);
  if (index === undefined) {
    throw new RangeError(`GameConfig.weaponEdit.${slot}: no weapon "${id}" in the content`);
  }
  const weapon = content.weapons[index];
  if (weapon.slot !== slot) {
    throw new RangeError(
      `GameConfig.weaponEdit.${slot}: weapon "${id}" belongs in slot ${weapon.slot}`,
    );
  }
  return weapon;
}

/**
 * The content's weapons of one slot, in content order (the weapon select's Weapon Edit lists).
 *
 * @param content - Validated content.
 * @param slot - The slot.
 * @returns A new array (load time).
 */
export function weaponsOfSlot(content: ContentDb, slot: WeaponSlot): WeaponSpec[] {
  const out: WeaponSpec[] = [];
  for (const weapon of content.weapons) if (weapon.slot === slot) out.push(weapon);
  return out;
}

/**
 * The name the weapon select shows for a weapon: its `name`, else its id in upper case.
 *
 * @param weapon - The weapon.
 * @returns The label.
 */
export function weaponLabel(weapon: Readonly<Pick<WeaponSpec, 'id' | 'name'>>): string {
  return weapon.name ?? weapon.id.toUpperCase();
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
  /**
   * The stage gimmicks (M2-07, `core/stage` `StageGimmicks`): a shot that meets the terrain hits
   * the destructible tile there (`hitTerrain`). Absent / `null` = terrain never breaks.
   */
  readonly gimmicks?: {
    /**
     * A shot met the terrain at a pixel.
     *
     * @param px - Pixel column.
     * @param py - Pixel row.
     * @param amount - The shot's damage.
     * @param by - The shooter's player slot.
     * @returns The `core/collision` `TerrainHit` code.
     */
    hitTerrain(px: number, py: number, amount: number, by: number): number;
  } | null;
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
  /** The boss (its parts are hit targets — `core/bosses`, M1-13). */
  readonly bosses: {
    /** The boss slot's parts (`target` / `armoured` refreshed in phase 6). */
    readonly boss: {
      /** Every part slot. */
      readonly parts: readonly BossPart[];
    };
    /**
     * A hit on a part (`BossSystem.damagePart`).
     *
     * @param index - Part index.
     * @param amount - Damage.
     * @param by - Player slot credited.
     * @returns A `BossHit` code.
     */
    damagePart(index: number, amount: number, by: number): number;
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
  /**
   * The weapon of each {@link WeaponRole} (`null` = the role is empty): the session's arsenal
   * ({@link resolveArsenal} of the config). Not frozen since M2-03 —
   * {@link WeaponSystem.setArsenal} rewrites it in place; read it, never keep a copy across a swap.
   */
  readonly roleWeapons: readonly (WeaponSpec | null)[];
  /** Autofire timers per shooter: `[shooter × 2]` main, `[shooter × 2 + 1]` missile (hashed). */
  readonly timers: Int32Array;
  /**
   * Per player: the heading (binary units) of the last 8-way direction held while alive, or -1
   * before any — the Free Way's second shot flies that way (M2-03; hashed).
   */
  readonly freeWayHeading: Int32Array;
  /**
   * Live shots per shooter and role, `[shooter × WEAPON_ROLE_SLOTS + role]` (recounted at the
   * start of phase 2, raised by every shot fired; the Direct-mode roles after the meter ones).
   */
  readonly liveCounts: Int32Array;
  /**
   * Whether the session fires the Direct-mode families (`GameConfig.powerUpMode === 'direct'`,
   * M2-05) instead of the meter roles.
   */
  readonly direct: boolean;
  /**
   * The content's `main` families (M2-05, `resolveFamilies`): {@link Loadout.family} indexes it
   * (read-only content — the HUD shows the family's `label`, the power-ups cap the levels at
   * `levels.length − 1`).
   */
  readonly mainFamilies: readonly WeaponFamilySpec[];
  /** The sub-weapon's family (the content's first `sub` family), or `null`. */
  readonly subFamily: WeaponFamilySpec | null;
  /**
   * Hit-cooldown tables of piercing shots ({@link PIERCE_TABLES} of them): table `t` is
   * `[t × MAX_ENEMIES, (t + 1) × MAX_ENEMIES)`, one entry per enemy slot (ticks left).
   */
  readonly cooldowns: Uint8Array;
  /**
   * Hit-cooldown tables of piercing shots for the boss parts: table `t` is
   * `[t × MAX_BOSS_PARTS, (t + 1) × MAX_BOSS_PARTS)` (same table index as
   * {@link WeaponSystem.cooldowns}).
   */
  readonly partCooldowns: Uint8Array;
  /** Shot slot per hit found by the last {@link WeaponSystem.collide}. */
  readonly hitShot: Int32Array;
  /**
   * Target per hit (same order: shot order, then target): an enemy slot, or a boss part as
   * `BOSS_PART_ID_BASE` + part index.
   */
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
   * ship hides its options; an `alive` ship steers its group (`OptionGroup.steer`: the Formation /
   * Rotate spread — M2-04), places its options (the trail records with movement
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
   * enemy whose cooldown entry is 0 (armoured ones always — the shot dies on them — except for a
   * Spread Bomb's blast, which burns on), in slot order. The result equals a brute-force test of
   * every shot against every enemy.
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
  /**
   * Swaps the arsenal in place (the weapon select's live preview, M2-03): recompiles the role
   * tables from `roles`, removes every shot at once and restarts the autofire timers.
   *
   * @remarks
   * Never allocates (`roles` is copied into {@link WeaponSystem.roleWeapons}); a cold path — a
   * gameplay session keeps the arsenal of its config (`resolveArsenal`). The loadouts, Options and
   * Free Way directions are kept; the hit list and cooldown tables are freed with the shots. The
   * role tables are not hashed, but the emptied pool is: a recorded session must never call it
   * (a replay header only knows the config's arsenal). The weapons are not checked against their
   * slots here — {@link resolveArsenal} does that for a config.
   *
   * @param roles - The weapon of each {@link WeaponRole} (`null` = empty; missing entries too).
   *
   * @example
   * ```ts
   * preview.weapons.setArsenal(resolveArsenal(db, resolveGameConfig({ weaponPreset: 'type-c' })));
   * ```
   */
  setArsenal(roles: readonly (WeaponSpec | null)[]): void;
}

/** The shot pool's type. */
type ShotPool = SoaPool<ShotSchema>;

/** Compiled tables of the roles: the four meter roles, then the direct ones (load time). */
class RoleTables {
  /** {@link ShotKind} per role, -1 = empty role. */
  readonly kind = new Int32Array(WEAPON_ROLE_SLOTS).fill(-1);
  /** Damage per hit. */
  readonly damage = new Int32Array(WEAPON_ROLE_SLOTS);
  /** Speed (px/tick). */
  readonly speed = new Float64Array(WEAPON_ROLE_SLOTS);
  /** Cap per shooter. */
  readonly cap = new Int32Array(WEAPON_ROLE_SLOTS);
  /** 1 = piercing. */
  readonly pierce = new Uint8Array(WEAPON_ROLE_SLOTS);
  /** Sprite id (-1 = not drawn). */
  readonly sprite = new Int32Array(WEAPON_ROLE_SLOTS).fill(-1);
  /** Ticks between shots. */
  readonly interval = new Int32Array(WEAPON_ROLE_SLOTS);
  /** SFX cue (-1 = silent). */
  readonly sfx = new Int32Array(WEAPON_ROLE_SLOTS).fill(-1);
  /** Angle parameter (binary units). */
  readonly angle = new Int32Array(WEAPON_ROLE_SLOTS);
  /** Laser maximum length. */
  readonly maxLength = new Float64Array(WEAPON_ROLE_SLOTS);
  /** Piercing hit cooldown in ticks. */
  readonly cooldown = new Int32Array(WEAPON_ROLE_SLOTS);
  /** Missile slide speed. */
  readonly slide = new Float64Array(WEAPON_ROLE_SLOTS);
  /** Missile: pixels a slide may climb or drop per tick before it is a wall / a cliff. */
  readonly step = new Int32Array(WEAPON_ROLE_SLOTS);
  /** Hitbox half width. */
  readonly hw = new Float64Array(WEAPON_ROLE_SLOTS);
  /** Hitbox half height. */
  readonly hh = new Float64Array(WEAPON_ROLE_SLOTS);
  /** Spawn offset x. */
  readonly ox = new Float64Array(WEAPON_ROLE_SLOTS);
  /** Spawn offset y. */
  readonly oy = new Float64Array(WEAPON_ROLE_SLOTS);
  /** Animation frames. */
  readonly frames = new Int32Array(WEAPON_ROLE_SLOTS).fill(1);
  /** 1 = the shot needs a hit-cooldown table (piercing, or a Spread Bomb's blast). */
  readonly table = new Uint8Array(WEAPON_ROLE_SLOTS);
  /** Spread Bomb: fall acceleration (px/tick²). */
  readonly gravity = new Float64Array(WEAPON_ROLE_SLOTS);
  /** Spread Bomb: the blast's half size. */
  readonly blastRadius = new Float64Array(WEAPON_ROLE_SLOTS);
  /** Spread Bomb: the blast's life in ticks. */
  readonly blastTicks = new Int32Array(WEAPON_ROLE_SLOTS);
  /** Ripple: half height when fired. */
  readonly startSize = new Float64Array(WEAPON_ROLE_SLOTS);
  /** Ripple: largest half height. */
  readonly maxSize = new Float64Array(WEAPON_ROLE_SLOTS);
  /** Ripple: half-height growth per tick. */
  readonly growth = new Float64Array(WEAPON_ROLE_SLOTS);
  /** Ripple: half width ÷ half height. */
  readonly aspect = new Float64Array(WEAPON_ROLE_SLOTS);
  /** Twin Laser: half the distance between the two beams. */
  readonly halfGap = new Float64Array(WEAPON_ROLE_SLOTS);
  /** Direct mode: 1 = the shot shows its heading's octant frame (`turn`). */
  readonly turn = new Uint8Array(WEAPON_ROLE_SLOTS);
  /** Direct mode: the still frame of a `direct.bolt` / `direct.bomb` (`frame`). */
  readonly frame0 = new Int32Array(WEAPON_ROLE_SLOTS);
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
 * Compiles the meter roles' tables from the weapons into existing tables (creation, and
 * {@link WeaponSystem.setArsenal}); the direct roles are not touched. Never allocates.
 *
 * @param t - The tables (every meter entry rewritten).
 * @param roles - The weapon per role (a missing entry = an empty role).
 * @param config - Autofire intervals.
 */
function compileRoles(
  t: RoleTables,
  roles: readonly (WeaponSpec | null)[],
  config: GameConfig,
): void {
  for (let r = 0; r < WEAPON_ROLE_COUNT; r++) {
    const spec = r < roles.length ? roles[r] : null;
    const fallback = r === WeaponRole.Missile ? config.missileInterval : config.autofireInterval;
    compileRole(t, r, spec === undefined ? null : spec, fallback);
  }
}

/**
 * Compiles one role's tables from its weapon (every entry rewritten; `null` = an empty role).
 * Never allocates.
 *
 * @param t - The tables.
 * @param r - The role slot (a meter role, or a direct one ≥ {@link WEAPON_ROLE_COUNT}).
 * @param spec - Its weapon, or `null`.
 * @param fallback - Ticks between shots when the weapon has no `refireTicks`.
 */
function compileRole(t: RoleTables, r: number, spec: WeaponSpec | null, fallback: number): void {
  t.kind[r] = -1;
  t.damage[r] = 0;
  t.speed[r] = 0;
  t.cap[r] = 0;
  t.pierce[r] = 0;
  t.sprite[r] = -1;
  t.interval[r] = 0;
  t.sfx[r] = -1;
  t.angle[r] = 0;
  t.maxLength[r] = 0;
  t.cooldown[r] = 1;
  t.slide[r] = 0;
  t.step[r] = 1;
  t.hw[r] = 0;
  t.hh[r] = 0;
  t.ox[r] = 0;
  t.oy[r] = 0;
  t.frames[r] = 1;
  t.table[r] = 0;
  t.gravity[r] = 0;
  t.blastRadius[r] = 0;
  t.blastTicks[r] = 0;
  t.startSize[r] = 0;
  t.maxSize[r] = 0;
  t.growth[r] = 0;
  t.aspect[r] = 0;
  t.halfGap[r] = 0;
  t.turn[r] = 0;
  t.frame0[r] = 0;
  if (spec === null) return;
  const kind = Object.prototype.hasOwnProperty.call(WEAPON_BEHAVIOR_KINDS, spec.behavior)
    ? WEAPON_BEHAVIOR_KINDS[spec.behavior]
    : -1;
  if (kind < 0) return;
  t.kind[r] = kind;
  t.damage[r] = spec.damage;
  t.speed[r] = spec.speed;
  t.cap[r] = spec.cap;
  t.pierce[r] = spec.pierce ? 1 : 0;
  t.sprite[r] = spec.spriteId;
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
  t.table[r] = spec.pierce || kind === ShotKind.SpreadBomb ? 1 : 0;
  const gravity = tunable(spec, 'gravity');
  t.gravity[r] = gravity > 0 ? gravity : 0;
  t.blastRadius[r] = Math.abs(tunable(spec, 'blastRadius'));
  const blastTicks = Math.round(tunable(spec, 'blastTicks'));
  t.blastTicks[r] = blastTicks >= 1 ? blastTicks : 1;
  const start = Math.abs(tunable(spec, 'startSize'));
  const max = Math.abs(tunable(spec, 'maxSize'));
  t.startSize[r] = start;
  t.maxSize[r] = max > start ? max : start;
  t.growth[r] = Math.abs(tunable(spec, 'growth'));
  t.aspect[r] = Math.abs(tunable(spec, 'aspect'));
  t.halfGap[r] = Math.abs(tunable(spec, 'gap')) / 2;
  t.turn[r] = tunable(spec, 'turn') > 0 ? 1 : 0;
  const frame0 = Math.floor(tunable(spec, 'frame'));
  t.frame0[r] = frame0 > 0 ? frame0 : 0;
}

/**
 * The Direct-mode families compiled for firing (M2-05, load time): every level's emitters grouped
 * by weapon, in typed arrays.
 */
class FamilyTables {
  /** Levels per family (index: `mainFamilies` order, then the sub family last). */
  readonly levels: Int32Array;
  /** First level (into the level arrays) per family. */
  readonly base: Int32Array;
  /** First emitter per level. */
  readonly start: Int32Array;
  /** Emitters per level. */
  readonly count: Int32Array;
  /** Ticks between volleys per level (the config's interval when the level has none). */
  readonly interval: Int32Array;
  /** Volleys at once per level (0 = the weapons' own caps). */
  readonly volleys: Int32Array;
  /** Role per emitter (a direct role). */
  readonly role: Int32Array;
  /** Heading per emitter (binary units). */
  readonly angle: Int32Array;
  /** Extra offset x per emitter. */
  readonly ox: Float64Array;
  /** Extra offset y per emitter. */
  readonly oy: Float64Array;
  /** Shots of the emitter's weapon in its level, on the group's first emitter (0 on the others). */
  readonly group: Int32Array;

  /**
   * Compiles the families (see the class docs).
   *
   * @param families - The main families, then the sub family (if any).
   * @param subIndex - Index of the sub family in `families` (-1 = none).
   * @param roleOf - Weapon index → direct role (-1 = none).
   * @param config - The config (the intervals of levels without `refireTicks`).
   */
  constructor(
    families: readonly WeaponFamilySpec[],
    subIndex: number,
    roleOf: (weaponId: number) => number,
    config: GameConfig,
  ) {
    const n = families.length;
    this.levels = new Int32Array(n);
    this.base = new Int32Array(n);
    let levelTotal = 0;
    let emitterTotal = 0;
    for (const family of families) {
      levelTotal += family.levels.length;
      for (const level of family.levels) emitterTotal += level.shots.length;
    }
    this.start = new Int32Array(levelTotal);
    this.count = new Int32Array(levelTotal);
    this.interval = new Int32Array(levelTotal);
    this.volleys = new Int32Array(levelTotal);
    this.role = new Int32Array(emitterTotal);
    this.angle = new Int32Array(emitterTotal);
    this.ox = new Float64Array(emitterTotal);
    this.oy = new Float64Array(emitterTotal);
    this.group = new Int32Array(emitterTotal);
    let lv = 0;
    let e = 0;
    for (let f = 0; f < n; f++) {
      const family = families[f];
      this.levels[f] = family.levels.length;
      this.base[f] = lv;
      const fallback = f === subIndex ? config.missileInterval : config.autofireInterval;
      for (const level of family.levels) {
        this.start[lv] = e;
        this.interval[lv] = level.refireTicks ?? fallback;
        this.volleys[lv] = level.volleys ?? 0;
        // Group the shots by weapon (first appearance order), content order within a group.
        const shots = level.shots;
        const done: boolean[] = [];
        for (let k = 0; k < shots.length; k++) {
          if (done[k] === true) continue;
          const role = roleOf(shots[k].weaponId);
          const first = e;
          let groupSize = 0;
          for (let j = k; j < shots.length; j++) {
            if (done[j] === true || roleOf(shots[j].weaponId) !== role) continue;
            done[j] = true;
            if (role < 0) continue;
            const shot = shots[j];
            this.role[e] = role;
            this.angle[e] = Math.round(shot.angle ?? 0) & ANGLE_MASK;
            this.ox[e] = shot.ox ?? 0;
            this.oy[e] = shot.oy ?? 0;
            this.group[e] = 0;
            e++;
            groupSize++;
          }
          if (groupSize > 0) this.group[first] = groupSize;
        }
        this.count[lv] = e - this.start[lv];
        lv++;
      }
    }
  }
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
  /**
   * See {@link WeaponSystem.roleWeapons} (rewritten in place by {@link WeaponSystem.setArsenal}).
   */
  readonly roleWeapons: (WeaponSpec | null)[];
  /** See {@link WeaponSystem.timers}. */
  readonly timers = new Int32Array(MAX_SHOOTERS * 2);
  /** See {@link WeaponSystem.freeWayHeading}. */
  readonly freeWayHeading = new Int32Array(MAX_PLAYERS).fill(-1);
  /** See {@link WeaponSystem.liveCounts}. */
  readonly liveCounts = new Int32Array(MAX_SHOOTERS * WEAPON_ROLE_SLOTS);
  /** See {@link WeaponSystem.direct}. */
  readonly direct: boolean;
  /** See {@link WeaponSystem.mainFamilies}. */
  readonly mainFamilies: readonly WeaponFamilySpec[];
  /** See {@link WeaponSystem.subFamily}. */
  readonly subFamily: WeaponFamilySpec | null;
  /** The families compiled for firing (`mainFamilies`, then the sub family). */
  private readonly families: FamilyTables;
  /** Index of the sub family in {@link WeaponSystemImpl.families} (-1 = none). */
  private readonly subIndex: number;
  /** Extra spawn offset x of the next shot {@link WeaponSystemImpl.emit} fills (family volleys). */
  private offX = 0;
  /** Extra spawn offset y of the next shot. */
  private offY = 0;
  /** See {@link WeaponSystem.cooldowns}. */
  readonly cooldowns = new Uint8Array(PIERCE_TABLES * MAX_ENEMIES);
  /** See {@link WeaponSystem.partCooldowns}. */
  readonly partCooldowns = new Uint8Array(PIERCE_TABLES * MAX_BOSS_PARTS);
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
  private readonly roles = new RoleTables();
  /** Whether firing needs no button (`autofire || remoteMode`). */
  private readonly alwaysFire: boolean;
  /** The option sprite id (-1 = not drawn). */
  private readonly optionSprite: number;
  /** The Spread Bomb blast's sprite id (-1 = not drawn). */
  private readonly blastSprite: number;
  /** Row offset of the next Twin Laser beam {@link WeaponSystemImpl.emit} fills (a class field). */
  private lane = 0;
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
  /** The queried shot's boss-part cooldown-table offset (table × MAX_BOSS_PARTS). */
  private qPartTable = 0;
  /** Lowest overlapping enemy slot of a non-piercing query (-1 = none). */
  private qBest = -1;
  /** Whether the queried shot is a Ripple (its ring, not its box, is the hitbox). */
  private qRing = false;
  /**
   * Whether the queried shot is a Spread Bomb's blast (its cooldown applies to armour too: it
   * clinks and burns on instead of dying).
   */
  private qBlast = false;
  /** The ring's centre x. */
  private qcx = 0;
  /** The ring's centre y. */
  private qcy = 0;
  /** The ring's outer half height. */
  private qb = 0;
  /** Horizontal scale that turns the ring's ellipse into a circle (half height ÷ half width). */
  private qk = 1;
  /** The ring's inner half height (outer − {@link RIPPLE_RING_WIDTH}). */
  private qInner = 0;
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
      // The session's Option type (M2-04; a host config without one flies the trail).
      options.push(createOptionGroup(host.config.optionChoice));
    }
    this.loadouts = loadouts;
    this.options = options;
    const content = host.content;
    this.roleWeapons = resolveArsenal(content, host.config);
    compileRoles(this.roles, this.roleWeapons, host.config);
    // The Direct-mode families (M2-05): a direct role per distinct weapon they fire.
    this.direct = host.config.powerUpMode === 'direct';
    const families = resolveFamilies(content);
    this.mainFamilies = Object.freeze(families.main);
    this.subFamily = families.sub;
    const compiled: WeaponFamilySpec[] = families.main.slice();
    this.subIndex = families.sub === null ? -1 : compiled.length;
    if (families.sub !== null) compiled.push(families.sub);
    const roleOfWeapon = new Map<number, number>();
    let directRoles = 0;
    for (const family of compiled) {
      for (const level of family.levels) {
        for (const shot of level.shots) {
          const id = shot.weaponId;
          if (roleOfWeapon.has(id) || !(id >= 0 && id < content.weapons.length)) continue;
          if (directRoles >= MAX_DIRECT_WEAPONS) continue;
          const role = WEAPON_ROLE_COUNT + directRoles++;
          roleOfWeapon.set(id, role);
          compileRole(this.roles, role, content.weapons[id], host.config.autofireInterval);
        }
      }
    }
    this.families = new FamilyTables(
      compiled,
      this.subIndex,
      (id) => roleOfWeapon.get(id) ?? -1,
      host.config,
    );
    this.alwaysFire = host.config.autofire || host.config.remoteMode;
    this.optionSprite = content.sprites.index.get(OPTION_SPRITE) ?? -1;
    this.blastSprite = content.sprites.index.get(SPREAD_BLAST_SPRITE) ?? -1;
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
    if (!(role >= 0 && role < WEAPON_ROLE_SLOTS && role % 1 === 0)) return -1;
    if (!(shooter >= 0 && shooter < MAX_SHOOTERS && shooter % 1 === 0)) return -1;
    const kind = this.roles.kind[role];
    if (kind < 0) return -1;
    this.fx = x;
    this.fy = y;
    const t = this.roles;
    if (kind === ShotKind.Double || kind === ShotKind.FreeWay) {
      return this.emit(role, shooter, this.secondHeading(role, shooter), 0);
    }
    if (kind === ShotKind.TwoWay) {
      return this.emit(role, shooter, (ANGLE_UNITS - t.angle[role]) & ANGLE_MASK, 0);
    }
    if (kind === ShotKind.Twin) {
      this.lane = -t.halfGap[role];
      const i = this.emit(role, shooter, 0, 0);
      this.lane = 0;
      return i;
    }
    return this.emit(role, shooter, this.launchHeading(role), 0);
  }

  /**
   * The heading of a role's single shot: the fall angle of the missiles, forward otherwise.
   *
   * @param role - The role (non-empty).
   * @returns Binary units.
   */
  private launchHeading(role: number): number {
    const kind = this.roles.kind[role];
    return kind === ShotKind.Missile || kind === ShotKind.Torpedo || kind === ShotKind.SpreadBomb
      ? this.roles.angle[role]
      : 0;
  }

  /**
   * The heading of the second shot of a Double-kind pair: `angle` units up from forward (the
   * Double, Tail Gun and Vertical), or for the Free Way the shooter's player's last direction
   * ({@link WeaponSystem.freeWayHeading}; `angle` up before any).
   *
   * @param role - The role (a Double or Free Way).
   * @param s - Shooter id.
   * @returns Binary units.
   */
  private secondHeading(role: number, s: number): number {
    const fallback = (ANGLE_UNITS - this.roles.angle[role]) & ANGLE_MASK;
    if (this.roles.kind[role] !== ShotKind.FreeWay) return fallback;
    const heading = this.freeWayHeading[(s / SHOOTERS_PER_PLAYER) | 0];
    return heading >= 0 ? heading : fallback;
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
      counts[f.shooter[i] * WEAPON_ROLE_SLOTS + f.role[i]]++;
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
      // Formation / Rotate: spread or extend on the player's hold / toggle (M2-04).
      if (p < intents.length) group.steer(intents[p]);
      group.follow(ship, camera, loadout.options, entered || ship.moving);
      if (p < intents.length) {
        // The Free Way aims where the ship last flew (8-way; the last direction is kept).
        const mx = intents[p].moveX;
        const my = intents[p].moveY;
        if ((mx !== 0 || my !== 0) && mx >= -1 && mx <= 1 && my >= -1 && my <= 1) {
          this.freeWayHeading[p] = DIRECTION_HEADINGS[(my + 1) * 3 + (mx + 1)];
        }
      }
      const held = p < intents.length ? intents[p].held : 0;
      if (this.direct) {
        this.fireDirect(p, held, 1 + group.count);
        continue;
      }
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
   * Direct-mode firing of one alive player's shooters (M2-05): the main family's level volley and
   * the sub family's, each when its timer allows and it is wanted (`autofire || remoteMode`, or
   * `Shot` / `Sub` held); a volley that fired restarts its timer with the level's interval.
   *
   * @param p - Player slot.
   * @param held - The player's held actions.
   * @param shooters - The ship plus its Options in play.
   */
  private fireDirect(p: number, held: number, shooters: number): void {
    const loadout = this.loadouts[p];
    const ship = this.host.players[p];
    const group = this.options[p];
    const timers = this.timers;
    const wantMain = this.alwaysFire || (held & Action.Shot) !== 0;
    const wantSub = this.subIndex >= 0 && (this.alwaysFire || (held & Action.Sub) !== 0);
    const mains = this.mainFamilies.length;
    const family = mains > 0 ? (loadout.family >= 0 ? loadout.family % mains : 0) : -1;
    const base = p * SHOOTERS_PER_PLAYER;
    for (let k = 0; k < shooters; k++) {
      if (k === 0) {
        this.fx = ship.x;
        this.fy = ship.y;
      } else {
        this.fx = group.x[k - 1];
        this.fy = group.y[k - 1];
      }
      const s = base + k;
      if (wantMain && family >= 0 && timers[s * 2] === 0) {
        const lv = this.fireLevel(family, loadout.shot, s);
        if (lv >= 0) timers[s * 2] = this.families.interval[lv];
      }
      if (wantSub && timers[s * 2 + 1] === 0) {
        const lv = this.fireLevel(this.subIndex, loadout.sub, s);
        if (lv >= 0) timers[s * 2 + 1] = this.families.interval[lv];
      }
    }
  }

  /**
   * Fires one volley of a family's level from {@link WeaponSystemImpl.fx} / `fy` (M2-05): each
   * weapon's shots of the level (a group) fire together when `live + n` fits the cap — the level's
   * `volleys × n`, else the weapon's `cap` —, each from its emitter's offset in its heading; every
   * group that fired pushes its weapon's SFX (rate-limited).
   *
   * @param family - Index into the compiled families.
   * @param level - The loadout's level (clamped to the family's levels).
   * @param s - Shooter id.
   * @returns The level index fired (into the level tables), or -1 when nothing fired.
   */
  private fireLevel(family: number, level: number, s: number): number {
    const f = this.families;
    const levels = f.levels[family];
    if (!(levels > 0)) return -1;
    const lv = f.base[family] + (level >= levels ? levels - 1 : level > 0 ? level | 0 : 0);
    const start = f.start[lv];
    const end = start + f.count[lv];
    const volleys = f.volleys[lv];
    const t = this.roles;
    const live = this.liveCounts;
    let fits = false;
    let fired = false;
    for (let e = start; e < end; e++) {
      const role = f.role[e];
      const n = f.group[e];
      if (n > 0) {
        const cap = volleys > 0 ? volleys * n : t.cap[role];
        fits = t.kind[role] >= 0 && live[s * WEAPON_ROLE_SLOTS + role] + n <= cap;
        if (fits) this.sfx(t.sfx[role]);
      }
      if (!fits) continue;
      this.offX = f.ox[e];
      this.offY = f.oy[e];
      if (this.emit(role, s, f.angle[e], 0) >= 0) fired = true;
    }
    this.offX = 0;
    this.offY = 0;
    return fired ? lv : -1;
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
    const live = this.liveCounts[s * WEAPON_ROLE_SLOTS + role];
    const cap = t.cap[role];
    let fired: boolean;
    if (kind === ShotKind.Double || kind === ShotKind.FreeWay) {
      // "No refire until both are gone": the pair needs every earlier shot of the role gone.
      if (live > 0 || cap < 1) return false;
      fired = this.emit(role, s, 0, 1) >= 0;
      if (cap >= 2 && this.emit(role, s, this.secondHeading(role, s), 0) >= 0) fired = true;
    } else if (kind === ShotKind.TwoWay) {
      // One volley at a time: a climbing and a diving missile, refired once both are gone.
      if (live > 0 || cap < 1) return false;
      fired = this.emit(role, s, (ANGLE_UNITS - t.angle[role]) & ANGLE_MASK, 0) >= 0;
      if (cap >= 2 && this.emit(role, s, t.angle[role], 0) >= 0) fired = true;
    } else if (kind === ShotKind.Twin && cap >= 2) {
      // A pair of beams side by side while two more fit under the cap.
      if (live + 2 > cap) return false;
      this.lane = -t.halfGap[role];
      fired = this.emit(role, s, 0, 0) >= 0;
      this.lane = t.halfGap[role];
      if (this.emit(role, s, 0, 0) >= 0) fired = true;
      this.lane = 0;
    } else {
      if (live >= cap) return false;
      fired = this.emit(role, s, this.launchHeading(role), 0) >= 0;
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
    if (t.table[role] === 1) {
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
      const partBase = (table - 1) * MAX_BOSS_PARTS;
      this.partCooldowns.fill(0, partBase, partBase + MAX_BOSS_PARTS);
    }
    const f = this.pool.fields;
    const look = forward === 1 && t.kind[WeaponRole.Main] >= 0 ? WeaponRole.Main : role;
    const kind = t.kind[role];
    const lane = kind === ShotKind.Twin ? this.lane : 0;
    f.x[i] = this.fx + t.ox[look] + this.offX;
    f.y[i] = this.fy + t.oy[look] + lane + this.offY;
    const a = angle & ANGLE_MASK;
    const speed = t.speed[role];
    if (kind === ShotKind.Laser || kind === ShotKind.Twin) {
      f.vx[i] = speed;
      // A beam's `vy` is its row offset from the shooter's (the Twin Laser's lanes).
      f.vy[i] = lane;
    } else {
      f.vx[i] = (SIN_TABLE_Q16[a + ANGLE_QUARTER] / TRIG_SCALE) * speed;
      f.vy[i] = (SIN_TABLE_Q16[a] / TRIG_SCALE) * speed;
    }
    if (kind === ShotKind.Ripple) {
      f.hh[i] = t.startSize[role];
      f.hw[i] = t.startSize[role] * t.aspect[role];
    } else {
      f.hw[i] = t.hw[look];
      f.hh[i] = t.hh[look];
    }
    // The Two-Way's two missiles: frame 0 climbs, frame 1 dives.
    if (kind === ShotKind.TwoWay) f.frame[i] = a > ANGLE_UNITS / 2 ? 0 : 1;
    // Direct-mode shots (M2-05): the heading's octant (un-rotated art), or a still frame.
    else if (t.turn[role] === 1) f.frame[i] = ((a + 64) >> 7) & 7;
    else if (t.frame0[role] > 0) f.frame[i] = t.frame0[role];
    f.damage[i] = t.damage[role];
    f.role[i] = role;
    f.kind[i] = kind;
    f.shooter[i] = s;
    // A Spread Bomb is not piercing until it bursts (its blast is — `detonate`).
    f.flags[i] = pierce && kind !== ShotKind.SpreadBomb ? ShotFlag.Pierce : 0;
    const sprite = forward === 1 && t.sprite[look] >= 0 ? t.sprite[look] : t.sprite[role];
    f.sprite[i] = sprite < 0 ? 0 : sprite;
    f.draw[i] = sprite < 0 ? SpriteFlag.Hidden : 0;
    f.table[i] = table;
    this.liveCounts[s * WEAPON_ROLE_SLOTS + role]++;
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
   * Bursts a falling Spread Bomb where it is: it becomes a piercing blast of `blastRadius` that
   * stays put for `blastTicks` ticks and hits each target at most once every `hitCooldownTicks`
   * (twice with the defaults), drawn with the blast sprite; pushes an explosion sound and
   * particles at whole pixels. Its cooldown table was reserved when the bomb was fired.
   *
   * @param i - The shot slot (a Spread Bomb that has not burst).
   */
  private detonate(i: number): void {
    const f = this.pool.fields;
    const role = f.role[i];
    const radius = this.roles.blastRadius[role];
    f.flags[i] = (f.flags[i] | ShotFlag.Blast | ShotFlag.Pierce) & ~ShotFlag.Sliding;
    f.vx[i] = 0;
    f.vy[i] = 0;
    f.hw[i] = radius;
    f.hh[i] = radius;
    f.age[i] = 0;
    f.frame[i] = 0;
    const sprite = this.blastSprite;
    f.sprite[i] = sprite < 0 ? 0 : sprite;
    f.draw[i] = sprite < 0 ? SpriteFlag.Hidden : 0;
    this.fx = f.x[i];
    this.fy = f.y[i];
    this.sfx(SFX_CUES.EnemyExplodeSmall);
    const x = Math.floor(this.fx) | 0;
    const y = Math.floor(this.fy) | 0;
    this.host.events.push(SimEventKind.Particles, FX_CUES.ExplosionSmall, x, y, 1);
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
    const partCooldowns = this.partCooldowns;
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
        const partBase = (table - 1) * MAX_BOSS_PARTS;
        for (let e = partBase; e < partBase + MAX_BOSS_PARTS; e++) {
          if (partCooldowns[e] > 0) partCooldowns[e]--;
        }
      }
      if (kind === ShotKind.Laser || kind === ShotKind.Twin) {
        // The beam keeps its row relative to its shooter (`vy` = a Twin beam's lane).
        if (this.locate(f.shooter[i])) f.y[i] = this.fy + t.oy[role] + f.vy[i];
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
                this.hitTerrain(i, c, row);
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
      if (kind === ShotKind.SpreadBomb) {
        if ((flags & ShotFlag.Blast) !== 0) {
          // The blast stays where it burst (world-anchored) and burns `blastTicks` ticks.
          const life = t.blastTicks[role];
          if (age >= life) {
            this.kill(i);
            continue;
          }
          const frames = t.frames[role];
          const frame = ((age * frames) / life) | 0;
          f.frame[i] = frame < frames ? frame : frames - 1;
        } else {
          const vy = f.vy[i] + t.gravity[role];
          f.vy[i] = vy;
          const x = f.x[i] + dx + f.vx[i];
          const y = f.y[i] + dy + vy;
          f.x[i] = x;
          f.y[i] = y;
          // Bursts where its bottom (or its centre — a wall) meets terrain; finite positions only.
          if (map !== null && x - x === 0 && y - y === 0) {
            const px = Math.floor(x) | 0;
            const low = Math.floor(y + f.hh[i]) | 0;
            const mid = Math.floor(y) | 0;
            const hitLow = terrainAt(map, px, low) !== TerrainType.Empty;
            if (hitLow || terrainAt(map, px, mid) !== TerrainType.Empty) {
              this.hitTerrain(i, px, hitLow ? low : mid);
              this.detonate(i);
              continue;
            }
          }
        }
        const bx = f.x[i];
        const by = f.y[i];
        if (!(bx >= left && bx <= right && by >= top && by <= bottom)) this.kill(i);
        continue;
      }
      if (kind === ShotKind.Missile || kind === ShotKind.Torpedo) {
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
                // Flew into a wall: it dies there (and hits a destructible tile — M2-07).
                this.hitTerrain(i, px, low);
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
            this.hitTerrain(i, Math.floor(x) | 0, scan);
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
      // Straight flights: the main shot, the Double pairs (Tail Gun, Vertical, Free Way), the
      // Two-Way missiles and the Ripple, whose ring grows as it flies.
      if (kind === ShotKind.Ripple) {
        const grown = t.startSize[role] + t.growth[role] * age;
        const size = grown < t.maxSize[role] ? grown : t.maxSize[role];
        f.hh[i] = size;
        f.hw[i] = size * t.aspect[role];
        const frames = t.frames[role];
        const span = t.maxSize[role] - t.startSize[role];
        f.frame[i] =
          frames > 1 && span > 0
            ? Math.round(((size - t.startSize[role]) * (frames - 1)) / span) | 0
            : 0;
      }
      const x = f.x[i] + dx + f.vx[i];
      const y = f.y[i] + dy + f.vy[i];
      f.x[i] = x;
      f.y[i] = y;
      if (!(x >= left && x <= right && y >= top && y <= bottom)) {
        this.kill(i);
      } else if (map !== null) {
        const px = Math.floor(x) | 0;
        const py = Math.floor(y) | 0;
        if (terrainAt(map, px, py) !== TerrainType.Empty) {
          this.hitTerrain(i, px, py);
          this.kill(i);
        }
      }
    }
  }

  /**
   * A shot met the terrain at a pixel (M2-07): the stage gimmicks damage the destructible tile
   * there with the shot's damage, credited to its player. Whole pixels only (never boxed).
   *
   * @param i - The shot slot.
   * @param px - Pixel column.
   * @param py - Pixel row.
   */
  private hitTerrain(i: number, px: number, py: number): void {
    const gimmicks = this.host.gimmicks;
    if (gimmicks === undefined || gimmicks === null) return;
    const f = this.pool.fields;
    gimmicks.hitTerrain(px, py, f.damage[i], (f.shooter[i] / SHOOTERS_PER_PLAYER) | 0);
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
      const kind = f.kind[i];
      if (kind === ShotKind.Laser || kind === ShotKind.Twin) {
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
      this.qBlast = (flags & ShotFlag.Blast) !== 0;
      // A Ripple hits with its ring: targets it touches, not those wholly inside it.
      const ring = kind === ShotKind.Ripple && f.hw[i] > 0 && hh > 0;
      this.qRing = ring;
      if (ring) {
        this.qcx = x;
        this.qcy = y;
        this.qb = hh;
        this.qk = hh / f.hw[i];
        this.qInner = hh > RIPPLE_RING_WIDTH ? hh - RIPPLE_RING_WIDTH : 0;
      }
      this.qTable = pierce ? (f.table[i] - 1) * MAX_ENEMIES : 0;
      this.qPartTable = pierce ? (f.table[i] - 1) * MAX_BOSS_PARTS : 0;
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
    if (slot >= BOSS_PART_ID_BASE) {
      this.visitPart(slot);
      return;
    }
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
    if (this.qRing && !this.ringTouches(ex - e.hw, ey - e.hh, ex + e.hw, ey + e.hh)) return;
    if (!this.qPierce) {
      if (this.qBest < 0 || slot < this.qBest) this.qBest = slot;
      return;
    }
    // Armour is hit whatever the cooldown (the shot dies on it) — except by a blast, which burns
    // on and clinks at most once per cooldown.
    const armoured = (e.flags & EnemyFlag.Invulnerable) !== 0 && !this.qBlast;
    if (!armoured && this.cooldowns[this.qTable + slot] > 0) return;
    this.insertHit(slot);
  }

  /**
   * The grid visitor's boss-part case: exact box test against a part that is a target this tick
   * (an armoured one ignores the piercing cooldown, like armour — except for a Spread Bomb's
   * blast, which clinks at most once per cooldown).
   *
   * @param id - The part's hit id (`BOSS_PART_ID_BASE` + index).
   */
  private visitPart(id: number): void {
    const index = id - BOSS_PART_ID_BASE;
    const parts = this.host.bosses.boss.parts;
    if (!(index >= 0 && index < parts.length)) return;
    const part = parts[index];
    if (!part.target) return;
    const px = part.x;
    const py = part.y;
    if (!(
      px + part.hw >= this.qx0 &&
      px - part.hw <= this.qx1 &&
      py + part.hh >= this.qy0 &&
      py - part.hh <= this.qy1
    )) {
      return;
    }
    if (this.qRing && !this.ringTouches(px - part.hw, py - part.hh, px + part.hw, py + part.hh)) {
      return;
    }
    if (!this.qPierce) {
      if (this.qBest < 0 || id < this.qBest) this.qBest = id;
      return;
    }
    if ((!part.armoured || this.qBlast) && this.partCooldowns[this.qPartTable + index] > 0) return;
    this.insertHit(id);
  }

  /**
   * Whether a target box touches the queried Ripple's ring: it reaches into the ring's outer
   * ellipse (closed) and is not wholly inside its inner one. Exact on the ellipse scaled to a
   * circle; never allocates.
   *
   * @param x0 - Box left.
   * @param y0 - Box top.
   * @param x1 - Box right.
   * @param y1 - Box bottom.
   * @returns Whether the ring hits it.
   */
  private ringTouches(x0: number, y0: number, x1: number, y1: number): boolean {
    const cx = this.qcx;
    const cy = this.qcy;
    const k = this.qk;
    const nx = (x0 > cx ? x0 - cx : x1 < cx ? cx - x1 : 0) * k;
    const ny = y0 > cy ? y0 - cy : y1 < cy ? cy - y1 : 0;
    const b = this.qb;
    if (!(nx * nx + ny * ny <= b * b)) return false;
    const ax = x0 - cx;
    const bx = x1 - cx;
    const ay = y0 - cy;
    const by = y1 - cy;
    const fx = (ax < 0 ? -ax : ax) > (bx < 0 ? -bx : bx) ? ax * k : bx * k;
    const fy = (ay < 0 ? -ay : ay) > (by < 0 ? -by : by) ? ay : by;
    const inner = this.qInner;
    return fx * fx + fy * fy >= inner * inner;
  }

  /**
   * Adds a piercing shot's hit on a target, kept in target order among the shot's hits.
   *
   * @param slot - The target id.
   */
  private insertHit(slot: number): void {
    // Insert in target order among this shot's hits (grid order is cell order).
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
      const target = this.hitEnemy[k];
      if (target >= BOSS_PART_ID_BASE) {
        this.applyPartHit(i, target - BOSS_PART_ID_BASE);
        continue;
      }
      const e = enemies[target];
      if (e.state !== EnemyState.Live || (e.flags & EnemyFlag.Ghost) !== 0) continue;
      const kind = f.kind[i];
      if (kind === ShotKind.SpreadBomb && (flags & ShotFlag.Blast) === 0) {
        // A falling Spread Bomb bursts on contact (armour too); the blast does the damage.
        this.detonate(i);
        continue;
      }
      if ((e.flags & EnemyFlag.Invulnerable) !== 0) {
        this.fx = f.x[i];
        this.fy = f.y[i];
        this.sfx(SFX_CUES.Clink);
        // A blast keeps burning (its cooldown spaces the clinks); every other shot dies.
        if ((flags & ShotFlag.Blast) !== 0) {
          this.cooldowns[(f.table[i] - 1) * MAX_ENEMIES + e.slot] = t.cooldown[f.role[i]];
        } else {
          this.kill(i);
        }
        continue;
      }
      const died = enemySystem.damage(e, f.damage[i], (f.shooter[i] / SHOOTERS_PER_PLAYER) | 0);
      if ((flags & ShotFlag.Pierce) !== 0) {
        this.cooldowns[(f.table[i] - 1) * MAX_ENEMIES + e.slot] = t.cooldown[f.role[i]];
      } else if (!(died && kind === ShotKind.Torpedo)) {
        // The Photon Torpedo flies on through what it destroys ("pierces small enemies").
        this.kill(i);
      }
    }
  }

  /**
   * Applies one shot's hit on a boss part (phase 7): a clink kills the shot, damage kills a
   * non-piercing shot or starts a piercing one's cooldown for that part, a part already gone
   * lets the shot fly on.
   *
   * @param i - The shot slot.
   * @param index - The part index.
   */
  private applyPartHit(i: number, index: number): void {
    const f = this.pool.fields;
    if (f.kind[i] === ShotKind.SpreadBomb && (f.flags[i] & ShotFlag.Blast) === 0) {
      this.detonate(i);
      return;
    }
    const result = this.host.bosses.damagePart(
      index,
      f.damage[i],
      (f.shooter[i] / SHOOTERS_PER_PLAYER) | 0,
    );
    if (result === BossHit.None) return;
    if (result === BossHit.Clink) {
      this.fx = f.x[i];
      this.fy = f.y[i];
      this.sfx(SFX_CUES.Clink);
      if ((f.flags[i] & ShotFlag.Blast) !== 0) {
        this.partCooldowns[(f.table[i] - 1) * MAX_BOSS_PARTS + index] =
          this.roles.cooldown[f.role[i]];
      } else {
        this.kill(i);
      }
      return;
    }
    if ((f.flags[i] & ShotFlag.Pierce) !== 0) {
      this.partCooldowns[(f.table[i] - 1) * MAX_BOSS_PARTS + index] =
        this.roles.cooldown[f.role[i]];
    } else {
      this.kill(i);
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
      const kind = f.kind[i];
      if (kind === ShotKind.Laser || kind === ShotKind.Twin) {
        const length = f.length[i];
        const tail = x - length;
        const segments = Math.ceil(length / LASER_SEGMENT_LENGTH) | 0;
        // A swirling beam (the Cyclone Laser) steps its segments' frames along the beam.
        const frames = this.roles.frames[f.role[i]];
        const phase = f.age[i] >> 2;
        for (let s = 1; s <= segments; s++) {
          let sx = x - s * LASER_SEGMENT_LENGTH;
          if (sx < tail) sx = tail;
          const slot = batch.count;
          if (slot >= cap) break;
          batch.x[slot] = sx;
          batch.y[slot] = y;
          batch.spriteId[slot] = sprite;
          batch.frame[slot] = frames > 1 ? (phase + s) % frames : 0;
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

  /** See {@link WeaponSystem.setArsenal}. */
  setArsenal(roles: readonly (WeaponSpec | null)[]): void {
    const own = this.roleWeapons;
    for (let r = 0; r < WEAPON_ROLE_COUNT; r++) {
      const spec = r < roles.length ? roles[r] : null;
      own[r] = spec === undefined ? null : spec;
    }
    compileRoles(this.roles, own, this.host.config);
    this.pool.clear();
    this.clear();
    this.timers.fill(0);
  }
}

/**
 * Creates the weapon system of a World (load time): the shot pool (registered as `playerShots`),
 * one loadout and option group per player, the role tables compiled from the config's arsenal
 * ({@link resolveArsenal}: `weaponPreset` and `weaponEdit` — sprite ids, SFX, tunables, intervals
 * from the config), the hit list and the batches.
 *
 * @param host - The World (read at every call — pass the World itself).
 * @returns The system.
 * @throws {Error} When the World already registered a pool named `playerShots`.
 * @throws {RangeError} When `config.weaponEdit` names a weapon the content does not have, or one of
 *   another slot ({@link resolveArsenal}).
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
