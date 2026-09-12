/**
 * # bullets — enemy bullets and lasers
 *
 * **Status: implemented** for P0 (plan M1-09). Bending lasers, bullet cancel into points and the
 * pattern DSL arrive with M2-02; player shots are `core/weapons` (M1-10).
 *
 * **Responsibility.** The enemy projectiles of a World ({@link BulletSystem}):
 *
 * - **Bullets** — a struct-of-arrays pool of {@link MAX_ENEMY_BULLETS} (512, shmup_feat.md §12
 *   budget) with the P0 kinematics: position, velocity, speed, angle (binary units), acceleration
 *   clamped to `[minSpeed, maxSpeed]`, angular velocity, delayed bullets (wait, then launch —
 *   optionally re-aimed), changing bullets (new speed / angle at a given age), turn-rate-capped
 *   homing, a hit radius and the sprite / frame the renderer draws. The pool is registered with
 *   the World (`enemyBullets`: flushed in phase 8, hashed by `hashWorld`) and **is** the
 *   `LayerId.EnemyBullets` sprite batch ({@link BulletSystem.batch}) — no mirror copy.
 * - **Lasers** — a pool of {@link MAX_ENEMY_LASERS} straight lasers (`enemyLasers`): an origin
 *   (fixed, or attached to the enemy that fired it), angle, length and width, going through the
 *   phases **telegraph → grow → active → fade** ({@link LaserPhase}). Only the active phase —
 *   the beam at full width — has a hitbox (a capsule); the telegraph is drawn as a blinking 1-px
 *   warning line (shmup_feat.md §20 telegraphing). {@link BulletSystem.laserView} is the render
 *   contract's `LaserView`.
 * - **Collision** with the players (brute force, shmup_feat.md §22): bullet circles against each
 *   ship's hurt radius, laser capsules against it → `playerHit(Bullet)` / `playerHit(Laser)`, at
 *   most one accepted hit of each cause per ship and tick; an accepted bullet is removed.
 * - **Cancel** ({@link cancelAllBullets}): cancelable bullets and lasers vanish in sparkles
 *   (`FX_CUES.BulletCancel` events; points mode with M2-02).
 *
 * **Frames.** Bullets and fixed lasers live in world pixels but **ride the camera** like flying
 * enemies (`x += camera.dx` every tick, delayed bullets included): patterns keep their shape on
 * screen while the stage scrolls and an aimed shot flies at the player, who rides the camera too.
 * A bullet fired in phase 4 starts at its enemy's pre-move position and rides this tick's scroll
 * in phase 5 together with that enemy. Attached lasers follow their enemy.
 *
 * **Tick.** Phase 4 — scripts fire (`core/patterns` primitives through the enemy `ScriptApi`).
 * Phase 5 — {@link BulletSystem.update}: camera ride; a delayed bullet counts down (and launches);
 * `age++`; a due change; homing; acceleration / angular velocity (velocity recomputed from the
 * sine table only when speed or angle changed); move; removal outside the view + {@link
 * BULLET_CULL_MARGIN} px or on terrain (one pixel lookup, bullets flagged
 * {@link BulletFlag.DieOnTerrain}); lasers follow / ride and step their phase. Phase 6 —
 * {@link BulletSystem.collidePlayers}. Phase 8 — the World flushes both pools.
 *
 * **Kinds.** {@link BULLET_KINDS} is the built-in table of bullet looks and hit radii (the
 * readability palette of shmup_feat.md §12: round, oval and needle bullets in pink, red and
 * purple; oval and needle sprites have 8 directional frames, picked from the heading). Their
 * sprites and the laser beam are the engine's own sprites ({@link BULLET_SPRITES}; core `world`
 * `ENGINE_SPRITES`), resolved through `ContentDb.sprites` at creation — a content database loaded
 * without them (`loadContent`'s `extraSprites`) simulates bullets but does not draw them.
 *
 * **Rank.** {@link BulletSystem.speedScale} / {@link BulletSystem.fireScale} come from the rank
 * (`core/rank`: constant in M1) and are applied by the pattern primitives, not by
 * {@link BulletSystem.spawn}, which takes raw values.
 *
 * **Zero allocation.** Both pools, the views and the kind tables are built by
 * {@link createBulletSystem}; per-tick code reads and writes typed arrays only, passes whole
 * numbers across calls and returns whole numbers (V8 boxes fractional arguments and results of
 * calls it does not inline).
 *
 * **Implements.**
 * - shmup_feat.md §12 Enemy bullets & attack patterns — kinematics, lasers (telegraph → grow →
 *   capsule hitbox only at full width), bullets die on terrain, cancel, ~512 bullet budget
 * - shmup_feat.md §15 — rank hook (bullet speed and fire-rate multipliers)
 * - shmup_feat.md §20 — telegraphing (laser warning lines), visible bullet origins
 * - shmup_feat.md §22 — SoA pools, brute-force bullets × players, capsules for lasers
 *
 * **Public API.** {@link createBulletSystem}, {@link BulletSystem}, {@link BulletHost},
 * {@link BulletOwner}, {@link BulletOrigin}, {@link LaserSource}, {@link spawnBullet},
 * {@link fireLaser}, {@link cancelAllBullets}, {@link CancelMode}, {@link BulletFlag},
 * {@link BulletKind}, {@link BulletKindSpec}, {@link BULLET_KINDS}, {@link BULLET_SPRITES},
 * {@link LASER_SPRITE}, {@link LaserPhase}, {@link BULLET_SCHEMA}, {@link BulletSchema},
 * {@link LASER_SCHEMA}, {@link LaserSchema},
 * {@link AIM_AT_TARGET}, {@link UNCHANGED}, {@link MAX_ENEMY_BULLETS}, {@link MAX_ENEMY_LASERS},
 * {@link MAX_BULLET_SPEED}, {@link BULLET_CULL_MARGIN}, {@link CANCEL_SPARKLE_LIMIT},
 * {@link NO_TARGET_ANGLE}, {@link LASER_TELEGRAPH_TICKS}, {@link LASER_GROW_TICKS},
 * {@link LASER_ACTIVE_TICKS}, {@link LASER_FADE_TICKS}, {@link LASER_WIDTH},
 * {@link LASER_BLINK_TICKS}.
 *
 * **Planned API.** Bending lasers, bullet cancel into points and `$rank`-driven DSL patterns
 * (M2-02); graze detection (P2 — the {@link BulletFlag.Grazed} bit is reserved).
 *
 * @module
 */
import { TerrainType, terrainAt, type TerrainMap } from '../collision/index.js';
import { PLAYFIELD_H, PLAYFIELD_W, type GameConfig } from '../config/index.js';
import type { ContentDb, PlayerShipSpec } from '../data/index.js';
import type { DebugFlags } from '../debug/index.js';
import { FX_CUES, SimEventKind, type EventQueue } from '../events/index.js';
import { ANGLE_MASK, ANGLE_QUARTER, ANGLE_UNITS, atan2B, quantizeAngle } from '../math/index.js';
import { SIN_TABLE_Q16, TRIG_SCALE } from '../math/trig-table.js';
import { defineModule } from '../module-info.js';
import { PlayerHitCause, playerHit, type PlayerCamera, type PlayerShip } from '../player/index.js';
import { createSoaPool, type SoaPool, type SoaSchema } from '../pools/index.js';
import {
  LayerId,
  SpriteFlag,
  type LaserView,
  type SpriteBatchView,
} from '../presentation/index.js';
import { BULLET_SPEED_RANK_CURVE, FIRE_RATE_RANK_CURVE, rankScale } from '../rank/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'bullets',
  status: 'implemented',
  specRefs: ['shmup_feat.md §12', 'shmup_feat.md §15', 'shmup_feat.md §20', 'shmup_feat.md §22'],
});

/** Enemy bullet slots (shmup_feat.md §12 / §22 budget, decision D17). */
export const MAX_ENEMY_BULLETS = 512;

/** Enemy laser slots. */
export const MAX_ENEMY_LASERS = 16;

/** Bullets are removed once they are this many pixels outside the camera view. */
export const BULLET_CULL_MARGIN = 16;

/** Default `maxSpeed` of a bullet (px/tick): the upper clamp of accelerating bullets. */
export const MAX_BULLET_SPEED = 16;

/** Most `BulletCancel` particle events one {@link cancelAllBullets} call emits (event budget). */
export const CANCEL_SPARKLE_LIMIT = 64;

/** Where aimed shots go when no player is alive: straight left. */
export const NO_TARGET_ANGLE = ANGLE_UNITS / 2;

/**
 * Angle argument meaning "at the nearest living player" (quantised to `config.aimDirections`),
 * accepted wherever a primitive takes an angle; as a change angle it re-aims at change time.
 */
export const AIM_AT_TARGET = Infinity;

/** Change argument meaning "keep the current value" ({@link BulletSystem.setChange}). */
export const UNCHANGED = NaN;

/** Default laser telegraph (warning line) in ticks. */
export const LASER_TELEGRAPH_TICKS = 40;

/** Default laser grow time in ticks. */
export const LASER_GROW_TICKS = 8;

/** Default laser active (full width, hitbox on) time in ticks. */
export const LASER_ACTIVE_TICKS = 60;

/** Default laser fade time in ticks. */
export const LASER_FADE_TICKS = 8;

/** Default laser width in pixels (the capsule radius is half of it). */
export const LASER_WIDTH = 6;

/** The warning line blinks: shown this many ticks, hidden as many. */
export const LASER_BLINK_TICKS = 4;

/** Sprite of the laser beam (a horizontal strip, stretched by the renderer). */
export const LASER_SPRITE = 'lasers/beam-pink';

/**
 * Flag bits of a bullet ({@link BulletSchema} `flags`). Bits 0–2 are public
 * ({@link BulletSystem.setFlags}); the rest are the system's own.
 */
export const BulletFlag = {
  /** Removed when its centre enters solid terrain (shmup_feat.md §12). */
  DieOnTerrain: 1,
  /** Removed by {@link cancelAllBullets}. */
  Cancelable: 2,
  /** Reserved for graze scoring (shmup_feat.md §22 [P2]); never set in M1. */
  Grazed: 4,
  /** Internal: a delayed bullet re-aims when it launches. */
  AimOnLaunch: 8,
  /** Internal: removed this tick (the slot is freed in phase 8). */
  Dead: 16,
} as const;

/** The public {@link BulletFlag} bits. */
const PUBLIC_FLAGS = BulletFlag.DieOnTerrain | BulletFlag.Cancelable | BulletFlag.Grazed;

/** How {@link cancelAllBullets} turns bullets into something else. */
export const CancelMode = {
  /** Sparkles only (`FX_CUES.BulletCancel` particle events). Points mode arrives in M2-02. */
  Sparkle: 0,
} as const;

/** A {@link CancelMode} code. */
export type CancelMode = (typeof CancelMode)[keyof typeof CancelMode];

/** One entry of {@link BULLET_KINDS}. */
export interface BulletKindSpec {
  /** Name (debug output). */
  readonly name: string;
  /** Sprite name (an engine sprite — {@link BULLET_SPRITES}). */
  readonly sprite: string;
  /** Hit radius in pixels (smaller than the art, as usual). */
  readonly radius: number;
  /** Directional frames: 1 (round) or 8 (see {@link BULLET_KINDS}). */
  readonly frames: number;
  /** {@link BulletFlag} bits a new bullet of this kind gets. */
  readonly flags: number;
}

/** Bullet kind codes (the `kind` argument of every spawn); the index into {@link BULLET_KINDS}. */
export const BulletKind = {
  /** 7×7 round, pink. */
  RoundPink: 0,
  /** 7×7 round, red. */
  RoundRed: 1,
  /** 7×7 round, purple. */
  RoundPurple: 2,
  /** 9×9 oval, pink, 8 directions. */
  OvalPink: 3,
  /** 9×9 oval, red, 8 directions. */
  OvalRed: 4,
  /** 9×9 oval, purple, 8 directions. */
  OvalPurple: 5,
  /** 11×11 needle (fast bullets), pink, 8 directions. */
  NeedlePink: 6,
  /** 11×11 needle, red, 8 directions. */
  NeedleRed: 7,
  /** 11×11 needle, purple, 8 directions. */
  NeedlePurple: 8,
} as const;

/** A {@link BulletKind} code. */
export type BulletKind = (typeof BulletKind)[keyof typeof BulletKind];

/** Flags of every built-in kind: dies on terrain, cancelable. */
const KIND_FLAGS = BulletFlag.DieOnTerrain | BulletFlag.Cancelable;

/**
 * The built-in bullet kinds (index = {@link BulletKind} code). Directional frame of an 8-frame
 * kind for heading `a` (whole binary units): `((a + 32) >> 6) & 7` — frame `k` points
 * `k · 22.5°` clockwise from +x; the art is point-symmetric, so 8 frames cover every heading
 * (the M1-03 bullet generator's convention).
 */
export const BULLET_KINDS: readonly BulletKindSpec[] = Object.freeze(
  (function buildKinds(): BulletKindSpec[] {
    const kinds: BulletKindSpec[] = [];
    for (const shape of ['round', 'oval', 'needle']) {
      for (const color of ['pink', 'red', 'purple']) {
        kinds.push(
          Object.freeze({
            name: shape + '-' + color,
            sprite: 'bullets/' + shape + '-' + color,
            radius: shape === 'needle' ? 1.5 : 2,
            frames: shape === 'round' ? 1 : 8,
            flags: KIND_FLAGS,
          }),
        );
      }
    }
    return kinds;
  })(),
);

/** Every sprite the bullet system draws: the kinds' sprites, then {@link LASER_SPRITE}. */
export const BULLET_SPRITES: readonly string[] = Object.freeze([
  ...BULLET_KINDS.map((kind) => kind.sprite),
  LASER_SPRITE,
]);

/** Laser phases, in order. */
export const LaserPhase = {
  /** The blinking warning line: no hitbox. */
  Telegraph: 0,
  /** The beam widens: no hitbox. */
  Grow: 1,
  /** Full width: the capsule hitbox is on. */
  Active: 2,
  /** The beam narrows: no hitbox; then the laser is removed. */
  Fade: 3,
} as const;

/** A {@link LaserPhase} code. */
export type LaserPhase = (typeof LaserPhase)[keyof typeof LaserPhase];

/** Field layout of the bullet pool (hashed in sorted field order). */
export const BULLET_SCHEMA = Object.freeze({
  /** World x of the centre. */
  x: 'f64',
  /** World y of the centre. */
  y: 'f64',
  /** Velocity x (px/tick, before the camera ride). */
  vx: 'f64',
  /** Velocity y. */
  vy: 'f64',
  /** Speed (px/tick). */
  speed: 'f64',
  /** Heading in binary units `[0, 1024)` (may be fractional; rounded for the tables). */
  angle: 'f64',
  /** Speed change per tick. */
  accel: 'f64',
  /** Heading change per tick (binary units). */
  angVel: 'f64',
  /** Lower speed clamp while accelerating. */
  minSpeed: 'f64',
  /** Upper speed clamp while accelerating. */
  maxSpeed: 'f64',
  /** Hit radius. */
  radius: 'f64',
  /** Sprite id (0 with `draw` Hidden when the sprite is not in the table). */
  sprite: 'u16',
  /** Frame (directional kinds). */
  frame: 'u16',
  /** `SpriteFlag` bits for the renderer. */
  draw: 'u8',
  /** {@link BulletKind}. */
  kind: 'u8',
  /** {@link BulletFlag} bits. */
  flags: 'u8',
  /** Ticks the bullet has moved (a delayed bullet starts counting when it launches). */
  age: 'i32',
  /** Ticks left before a delayed bullet launches (0 = moving). */
  delay: 'i32',
  /** Age at which the change applies (0 = none). */
  changeAt: 'i32',
  /** Speed after the change (NaN = keep). */
  changeSpeed: 'f64',
  /** Angle after the change (NaN = keep, `Infinity` = re-aim). */
  changeAngle: 'f64',
  /** Homing turn rate (binary units per tick). */
  turnRate: 'f64',
  /** Homing ticks left (0 = not homing). */
  homing: 'i32',
} as const);

/** The bullet pool's schema type. */
export type BulletSchema = typeof BULLET_SCHEMA;

/** Field layout of the laser pool (hashed in sorted field order). */
export const LASER_SCHEMA = Object.freeze({
  /** World x of the origin. */
  x: 'f64',
  /** World y of the origin. */
  y: 'f64',
  /** Origin offset from the source enemy (attached lasers). */
  ox: 'f64',
  /** Origin offset from the source enemy. */
  oy: 'f64',
  /** World x of the far end. */
  ex: 'f64',
  /** World y of the far end. */
  ey: 'f64',
  /** Direction (whole binary units). */
  angle: 'f64',
  /** Length in pixels. */
  length: 'f64',
  /** Full width in pixels. */
  width: 'f64',
  /** Drawn width this tick (0 = telegraph line). */
  drawWidth: 'f64',
  /** {@link LaserPhase}. */
  phase: 'u8',
  /** Ticks into the current phase. */
  ticks: 'i32',
  /** Telegraph ticks. */
  telegraph: 'i32',
  /** Grow ticks. */
  grow: 'i32',
  /** Active ticks. */
  active: 'i32',
  /** Fade ticks. */
  fade: 'i32',
  /** Enemy slot it is attached to, or -1 (fixed: rides the camera). */
  src: 'i32',
  /** Beam sprite id. */
  sprite: 'u16',
  /** `SpriteFlag` bits for the renderer. */
  draw: 'u8',
  /** {@link BulletFlag} bits (`Cancelable`, `Dead`). */
  flags: 'u8',
} as const);

/** The laser pool's schema type. */
export type LaserSchema = typeof LASER_SCHEMA;

/**
 * Where a pattern fires from: one reused object per firing system (the enemy system sets it to
 * the enemy's centre before each primitive). A class so its fields stay unboxed doubles.
 */
export class BulletOrigin {
  /** World x. */
  x = 0;
  /** World y. */
  y = 0;
}

/** What a laser can be fired from: an enemy (it follows it) or a fixed point (`slot` -1). */
export interface LaserSource {
  /** Enemy slot the laser stays attached to, or -1 for a fixed origin. */
  readonly slot: number;
  /** World x of the source. */
  readonly x: number;
  /** World y of the source. */
  readonly y: number;
}

/** What the bullet system needs from its World (the World implements it). */
export interface BulletHost {
  /** The tick being run. */
  readonly tick: number;
  /** The session config (`aimDirections`). */
  readonly config: GameConfig;
  /** The camera (bullets ride its scroll; culling uses its view). */
  readonly camera: PlayerCamera;
  /** The player ships (aim targets, collision). */
  readonly players: readonly PlayerShip[];
  /** The ship spec (hurt radius). */
  readonly ship: PlayerShipSpec;
  /** The stage's collision map, or `null`. */
  readonly terrain: TerrainMap | null;
  /** The content (sprite ids of the bullet kinds). */
  readonly content: ContentDb;
  /** Presentation events (cancel sparkles). */
  readonly events: EventQueue;
  /** Debug switches (god mode). */
  readonly debugFlags: DebugFlags;
  /** The World's pool registry (both pools are registered at creation). */
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
  /** The enemies (read when attached lasers follow their source). */
  readonly enemies: {
    /** Every enemy slot. */
    readonly enemies: readonly LaserSource[];
  };
  /**
   * Every laser source by id, when the host has more than enemies (the World: the enemy slots,
   * then the boss parts — `core/bosses` `BOSS_PART_ID_BASE`, M1-13). Absent = `enemies.enemies`.
   */
  readonly laserSources?: readonly LaserSource[];
}

/** The bullets and lasers of one World (see the module docs). */
export interface BulletSystem {
  /** The bullet pool (registered as `enemyBullets`). */
  readonly pool: SoaPool<BulletSchema>;
  /** The laser pool (registered as `enemyLasers`). */
  readonly lasers: SoaPool<LaserSchema>;
  /** The bullet pool as the `LayerId.EnemyBullets` sprite batch (live view of the pool). */
  readonly batch: SpriteBatchView;
  /** The laser pool as the render contract's `LaserView`. */
  readonly laserView: LaserView;
  /** Live bullets (removed-this-tick ones included until phase 8). */
  readonly count: number;
  /** The rank the scales below were computed for. */
  readonly rank: number;
  /** Bullet speed multiplier of the rank (`core/rank` `BULLET_SPEED_RANK_CURVE`). */
  readonly speedScale: number;
  /** Fire-rate multiplier of the rank (`FIRE_RATE_RANK_CURVE`; intervals are divided by it). */
  readonly fireScale: number;
  /** Directions aimed shots snap to (`config.aimDirections`). */
  readonly aimDirections: number;
  /**
   * Sets the rank and recomputes {@link BulletSystem.speedScale} / {@link BulletSystem.fireScale}
   * (world creation in M1; rank growth in M2-01).
   *
   * @param rank - The rank (0–31).
   */
  setRank(rank: number): void;
  /**
   * Spawns one bullet with raw values (no rank scaling).
   *
   * @remarks
   * The bullet gets its kind's radius, sprite, frame and flags, `minSpeed` 0 and `maxSpeed`
   * {@link MAX_BULLET_SPEED}, and its velocity from `angle` and `speed`. A full pool, an unknown
   * or fractional kind and a non-finite angle other than {@link AIM_AT_TARGET} drop the spawn
   * quietly. The bullet moves (and rides the camera) from this tick's phase 5 on; one whose
   * position turns non-finite (a NaN speed, say) is culled there and never hits.
   *
   * @param x - World x.
   * @param y - World y.
   * @param angle - Heading in binary units (any finite number, wrapped), or
   *   {@link AIM_AT_TARGET}.
   * @param speed - Pixels per tick.
   * @param kind - {@link BulletKind}.
   * @returns The slot, or -1 (dropped). Slots are only stable within the tick.
   */
  spawn(x: number, y: number, angle: number, speed: number, kind: number): number;
  /**
   * {@link BulletSystem.spawn} at an origin (the pattern primitives use it).
   *
   * @param origin - Where the bullet starts.
   * @param angle - Heading or {@link AIM_AT_TARGET}.
   * @param speed - Pixels per tick.
   * @param kind - {@link BulletKind}.
   * @returns The slot, or -1.
   */
  emit(origin: BulletOrigin, angle: number, speed: number, kind: number): number;
  /**
   * The angle from an origin to the nearest living player, quantised to
   * {@link BulletSystem.aimDirections} ({@link NO_TARGET_ANGLE} without one).
   *
   * @param origin - The origin.
   * @returns A whole binary angle in `[0, 1024)`.
   */
  aimFrom(origin: BulletOrigin): number;
  /**
   * Gives a bullet acceleration and angular velocity.
   *
   * @param index - Bullet slot (this tick).
   * @param accel - Speed change per tick.
   * @param angVel - Heading change per tick (binary units).
   * @param minSpeed - Lower clamp of the speed while accelerating.
   * @param maxSpeed - Upper clamp.
   */
  setMotion(index: number, accel: number, angVel: number, minSpeed: number, maxSpeed: number): void;
  /**
   * Schedules a change: on the tick the bullet's age reaches `atAge` its speed and / or heading
   * switch (before that tick's acceleration and move).
   *
   * @param index - Bullet slot.
   * @param atAge - Age of the change (≥ 1; 0 cancels a pending change).
   * @param speed - New speed, or {@link UNCHANGED}.
   * @param angle - New heading, {@link UNCHANGED}, or {@link AIM_AT_TARGET} (re-aim then).
   */
  setChange(index: number, atAge: number, speed: number, angle: number): void;
  /**
   * Makes a bullet wait before it moves (it still rides the camera and can hit).
   *
   * @param index - Bullet slot.
   * @param ticks - Ticks to wait (its first move is `ticks` ticks after this tick's).
   * @param aimOnLaunch - Re-aim at the nearest player when it launches.
   */
  setDelay(index: number, ticks: number, aimOnLaunch: boolean): void;
  /**
   * Makes a bullet home: for `lifetime` moving ticks it turns towards the nearest living player
   * by at most `turnRate` binary units per tick, then flies straight.
   *
   * @param index - Bullet slot.
   * @param turnRate - Maximum turn per tick.
   * @param lifetime - Homing ticks.
   */
  setHoming(index: number, turnRate: number, lifetime: number): void;
  /**
   * Replaces a bullet's public {@link BulletFlag} bits (`DieOnTerrain`, `Cancelable`, `Grazed`).
   *
   * @param index - Bullet slot.
   * @param flags - The new public bits (others are ignored).
   */
  setFlags(index: number, flags: number): void;
  /**
   * Fires a straight laser.
   *
   * @remarks
   * Timings of 0 skip their phase (a laser with every timing 0 is not fired). With a source
   * (`src` ≥ 0 — an enemy slot) the origin keeps its offset to that enemy until the enemy is
   * removed ({@link BulletSystem.detachLasers}); a fixed laser (`src` -1) rides the camera.
   *
   * @param origin - Origin (world).
   * @param angle - Direction (rounded to whole units) or {@link AIM_AT_TARGET}.
   * @param length - Length in pixels.
   * @param width - Full width in pixels (hitbox radius = half of it).
   * @param telegraph - Warning-line ticks.
   * @param grow - Grow ticks.
   * @param active - Full-width (hitbox) ticks.
   * @param fade - Fade ticks.
   * @param src - Enemy slot it follows, or -1.
   * @returns The laser slot, or -1 (pool full, nothing to show, bad length / width).
   */
  fireLaser(
    origin: BulletOrigin,
    angle: number,
    length: number,
    width: number,
    telegraph: number,
    grow: number,
    active: number,
    fade: number,
    src: number,
  ): number;
  /**
   * The source of attached lasers is gone (the enemy system calls it when an enemy is removed or
   * becomes a ghost): lasers still warning or growing are removed, active ones fade; either way
   * they stop following it.
   *
   * @param slot - The enemy slot.
   */
  detachLasers(slot: number): void;
  /**
   * Phase 5: moves bullets and lasers, culls, steps laser phases. Never allocates.
   *
   * @remarks
   * Per live bullet, in slot order: ride the camera step (`camera.dx` / `dy`); a delayed bullet
   * counts down (and re-aims on launch when asked); a moving one ages, applies a due change,
   * homes, accelerates (clamped to `[minSpeed, maxSpeed]`) and turns, recomputes its velocity
   * only if speed or heading changed, and moves; then it is removed when it is not inside the
   * view ± {@link BULLET_CULL_MARGIN} px (NaN positions included) or, with
   * {@link BulletFlag.DieOnTerrain}, when its centre pixel is terrain. Then every live laser
   * follows its source enemy (or rides the camera) and steps its phase — each phase lasts
   * exactly its tick count; the last one ends with the laser's removal. Removed slots stay in
   * `[0, count)` (flagged dead, hidden) until the World flushes the pools in phase 8.
   */
  update(): void;
  /**
   * Phase 6: bullets and active lasers against the players. Never allocates.
   *
   * @remarks
   * Brute force per active, `alive` ship: bullet circles (`radius`) against the ship's
   * `hurtRadius` (closed — touching hits), then — if the ship is still alive — the capsules of
   * lasers in the `Active` phase (half the width + the hurt radius). The first overlap ends
   * each test for that ship, so at most one bullet hit and one laser hit are offered per ship
   * and tick (`playerHit(Bullet)` / `playerHit(Laser)`). An accepted bullet hit removes the
   * bullet; a refused one (fly-in, invulnerable, god mode) leaves it flying.
   */
  collidePlayers(): void;
  /**
   * Removes every cancelable bullet and laser (see {@link cancelAllBullets}).
   *
   * @param mode - {@link CancelMode}.
   * @returns Bullets cancelled.
   */
  cancelAll(mode: CancelMode): number;
}

/** Anything that owns a bullet system (the World). */
export interface BulletOwner {
  /** The bullet system. */
  readonly bullets: BulletSystem;
}

/**
 * The bullet pool seen as a sprite batch (plan §3.4: SoA pools implement the view directly).
 */
class BulletBatchView implements SpriteBatchView {
  /** See {@link SpriteBatchView.layer}. */
  readonly layer = LayerId.EnemyBullets;
  /** See {@link SpriteBatchView.capacity}. */
  readonly capacity: number;
  /** See {@link SpriteBatchView.x}. */
  readonly x: Float64Array;
  /** See {@link SpriteBatchView.y}. */
  readonly y: Float64Array;
  /** See {@link SpriteBatchView.spriteId}. */
  readonly spriteId: Uint16Array;
  /** See {@link SpriteBatchView.frame}. */
  readonly frame: Uint16Array;
  /** See {@link SpriteBatchView.flags}. */
  readonly flags: Uint8Array;
  /** The pool. */
  private readonly pool: SoaPool<BulletSchema>;

  /**
   * Wraps the pool.
   *
   * @param pool - The bullet pool.
   */
  constructor(pool: SoaPool<BulletSchema>) {
    this.pool = pool;
    const f = pool.fields;
    this.capacity = pool.capacity;
    this.x = f.x;
    this.y = f.y;
    this.spriteId = f.sprite;
    this.frame = f.frame;
    this.flags = f.draw;
  }

  /** See {@link SpriteBatchView.count}. */
  get count(): number {
    return this.pool.count;
  }
}

/** The laser pool seen as the render contract's `LaserView`. */
class LaserPoolView implements LaserView {
  /** See {@link LaserView.capacity}. */
  readonly capacity: number;
  /** See {@link LaserView.x}. */
  readonly x: Float64Array;
  /** See {@link LaserView.y}. */
  readonly y: Float64Array;
  /** See {@link LaserView.angle}. */
  readonly angle: Float64Array;
  /** See {@link LaserView.length}. */
  readonly length: Float64Array;
  /** See {@link LaserView.width}. */
  readonly width: Float64Array;
  /** See {@link LaserView.spriteId}. */
  readonly spriteId: Uint16Array;
  /** See {@link LaserView.flags}. */
  readonly flags: Uint8Array;
  /** The pool. */
  private readonly pool: SoaPool<LaserSchema>;

  /**
   * Wraps the pool.
   *
   * @param pool - The laser pool.
   */
  constructor(pool: SoaPool<LaserSchema>) {
    this.pool = pool;
    const f = pool.fields;
    this.capacity = pool.capacity;
    this.x = f.x;
    this.y = f.y;
    this.angle = f.angle;
    this.length = f.length;
    this.width = f.drawWidth;
    this.spriteId = f.sprite;
    this.flags = f.draw;
  }

  /** See {@link LaserView.count}. */
  get count(): number {
    return this.pool.count;
  }
}

/** Sub-pixel scale of the vectors handed to `atan2B` (whole-number arguments, never boxed). */
const AIM_SCALE = 64;

/**
 * Normalises an angle into `[0, 1024)` (fractions kept — the velocity tables round later).
 *
 * @param angle - Any finite binary angle (negative or past one turn).
 * @returns The same heading in `[0, 1024)`.
 */
function wrapUnits(angle: number): number {
  const a = angle % ANGLE_UNITS;
  return a < 0 ? a + ANGLE_UNITS : a;
}

/** The bullet system (a class: monomorphic methods, typed-array fields). */
class BulletSystemImpl implements BulletSystem {
  /** See {@link BulletSystem.pool}. */
  readonly pool: SoaPool<BulletSchema>;
  /** See {@link BulletSystem.lasers}. */
  readonly lasers: SoaPool<LaserSchema>;
  /** See {@link BulletSystem.batch}. */
  readonly batch: SpriteBatchView;
  /** See {@link BulletSystem.laserView}. */
  readonly laserView: LaserView;
  /** See {@link BulletSystem.rank}. */
  rank = 0;
  /** See {@link BulletSystem.speedScale}. */
  speedScale = 1;
  /** See {@link BulletSystem.fireScale}. */
  fireScale = 1;
  /**
   * The ships' hurt radius (`host.ship.hurtRadius`, fixed for a World), cached in a field: the
   * content's ship spec and the built-in default have different shapes, so reading it through
   * `host.ship` in the collision loops is a polymorphic load that boxes the number.
   */
  private readonly hurtRadius: number;
  /** X of the ship {@link BulletSystemImpl.collidePlayers} is testing (see there). */
  private shipX = 0;
  /** Y of the ship being tested. */
  private shipY = 0;
  /** See {@link BulletSystem.aimDirections}. */
  readonly aimDirections: number;
  /** The World. */
  private readonly host: BulletHost;
  /** Sprite id per kind (-1 = not in the sprite table). */
  private readonly kindSprite: Int32Array;
  /** Hit radius per kind. */
  private readonly kindRadius: Float64Array;
  /** Directional frames per kind. */
  private readonly kindFrames: Uint8Array;
  /** Flags per kind. */
  private readonly kindFlags: Uint8Array;
  /** Beam sprite id (-1 = not in the table). */
  private readonly laserSprite: number;

  /**
   * Builds the pools, views and kind tables (see {@link createBulletSystem}).
   *
   * @param host - The World.
   */
  constructor(host: BulletHost) {
    this.host = host;
    this.aimDirections = host.config.aimDirections;
    this.hurtRadius = host.ship.hurtRadius;
    this.pool = host.pools.register(
      'enemyBullets',
      createSoaPool(MAX_ENEMY_BULLETS, BULLET_SCHEMA),
    );
    this.lasers = host.pools.register('enemyLasers', createSoaPool(MAX_ENEMY_LASERS, LASER_SCHEMA));
    this.batch = new BulletBatchView(this.pool);
    this.laserView = new LaserPoolView(this.lasers);
    const n = BULLET_KINDS.length;
    this.kindSprite = new Int32Array(n);
    this.kindRadius = new Float64Array(n);
    this.kindFrames = new Uint8Array(n);
    this.kindFlags = new Uint8Array(n);
    const sprites = host.content.sprites.index;
    for (let i = 0; i < n; i++) {
      const kind = BULLET_KINDS[i];
      this.kindSprite[i] = sprites.get(kind.sprite) ?? -1;
      this.kindRadius[i] = kind.radius;
      this.kindFrames[i] = kind.frames;
      this.kindFlags[i] = kind.flags;
    }
    this.laserSprite = sprites.get(LASER_SPRITE) ?? -1;
  }

  /** See {@link BulletSystem.count}. */
  get count(): number {
    return this.pool.count;
  }

  /** See {@link BulletSystem.setRank}. */
  setRank(rank: number): void {
    this.rank = rank;
    this.speedScale = rankScale(rank, BULLET_SPEED_RANK_CURVE);
    this.fireScale = rankScale(rank, FIRE_RATE_RANK_CURVE);
  }

  /** See {@link BulletSystem.spawn}. */
  spawn(x: number, y: number, angle: number, speed: number, kind: number): number {
    if (!(kind >= 0 && kind < this.kindSprite.length && kind % 1 === 0)) return -1;
    if (angle !== AIM_AT_TARGET && !(angle - angle === 0)) return -1;
    const i = this.pool.alloc();
    if (i < 0) return -1;
    const f = this.pool.fields;
    f.x[i] = x;
    f.y[i] = y;
    f.angle[i] = angle === AIM_AT_TARGET ? this.aimSlot(i, true) : wrapUnits(angle);
    this.initSlot(i, speed, kind);
    return i;
  }

  /** See {@link BulletSystem.emit}. */
  emit(origin: BulletOrigin, angle: number, speed: number, kind: number): number {
    if (!(kind >= 0 && kind < this.kindSprite.length && kind % 1 === 0)) return -1;
    if (angle !== AIM_AT_TARGET && !(angle - angle === 0)) return -1;
    const i = this.pool.alloc();
    if (i < 0) return -1;
    const f = this.pool.fields;
    f.x[i] = origin.x;
    f.y[i] = origin.y;
    f.angle[i] = angle === AIM_AT_TARGET ? this.aimSlot(i, true) : wrapUnits(angle);
    this.initSlot(i, speed, kind);
    return i;
  }

  /**
   * Fills a freshly allocated slot (position and angle already written).
   *
   * @param i - The slot.
   * @param speed - Speed.
   * @param kind - Kind code (validated).
   */
  private initSlot(i: number, speed: number, kind: number): void {
    const f = this.pool.fields;
    f.speed[i] = speed;
    f.maxSpeed[i] = MAX_BULLET_SPEED;
    f.radius[i] = this.kindRadius[kind];
    f.kind[i] = kind;
    f.flags[i] = this.kindFlags[kind];
    const sprite = this.kindSprite[kind];
    f.sprite[i] = sprite < 0 ? 0 : sprite;
    f.draw[i] = sprite < 0 ? SpriteFlag.Hidden : 0;
    this.velocity(i);
  }

  /**
   * Recomputes a bullet's velocity and directional frame from its speed and heading.
   *
   * @param i - The slot.
   */
  private velocity(i: number): void {
    const f = this.pool.fields;
    const a = Math.round(f.angle[i]) & ANGLE_MASK;
    const speed = f.speed[i];
    f.vx[i] = (SIN_TABLE_Q16[a + ANGLE_QUARTER] / TRIG_SCALE) * speed;
    f.vy[i] = (SIN_TABLE_Q16[a] / TRIG_SCALE) * speed;
    f.frame[i] = this.kindFrames[f.kind[i]] > 1 ? ((a + 32) >> 6) & 7 : 0;
  }

  /**
   * The angle from a bullet slot to the nearest living player.
   *
   * @param i - The slot (its position).
   * @param quantize - Snap to {@link BulletSystem.aimDirections}.
   * @returns A whole angle, or {@link NO_TARGET_ANGLE} without a target (`-1` never).
   */
  private aimSlot(i: number, quantize: boolean): number {
    const f = this.pool.fields;
    const x = f.x[i];
    const y = f.y[i];
    const players = this.host.players;
    let best = -1;
    let bestDistance = 0;
    for (let p = 0; p < players.length; p++) {
      const ship = players[p];
      if (!ship.active || ship.state !== 'alive') continue;
      const dx = ship.x - x;
      const dy = ship.y - y;
      const d = dx * dx + dy * dy;
      if (best < 0 || d < bestDistance) {
        best = p;
        bestDistance = d;
      }
    }
    if (best < 0) return NO_TARGET_ANGLE;
    const target = players[best];
    const angle = atan2B(((target.y - y) * AIM_SCALE) | 0, ((target.x - x) * AIM_SCALE) | 0);
    return quantize ? quantizeAngle(angle, this.aimDirections) : angle;
  }

  /** See {@link BulletSystem.aimFrom}. */
  aimFrom(origin: BulletOrigin): number {
    const x = origin.x;
    const y = origin.y;
    const players = this.host.players;
    let best = -1;
    let bestDistance = 0;
    for (let p = 0; p < players.length; p++) {
      const ship = players[p];
      if (!ship.active || ship.state !== 'alive') continue;
      const dx = ship.x - x;
      const dy = ship.y - y;
      const d = dx * dx + dy * dy;
      if (best < 0 || d < bestDistance) {
        best = p;
        bestDistance = d;
      }
    }
    if (best < 0) return NO_TARGET_ANGLE;
    const target = players[best];
    const angle = atan2B(((target.y - y) * AIM_SCALE) | 0, ((target.x - x) * AIM_SCALE) | 0);
    return quantizeAngle(angle, this.aimDirections);
  }

  /**
   * Whether a slot holds a bullet that is live this tick.
   *
   * @param index - The slot.
   * @returns `false` for an out-of-range slot or a bullet removed this tick.
   */
  private live(index: number): boolean {
    return (
      index >= 0 &&
      index < this.pool.count &&
      (this.pool.fields.flags[index] & BulletFlag.Dead) === 0
    );
  }

  /** See {@link BulletSystem.setMotion}. */
  setMotion(
    index: number,
    accel: number,
    angVel: number,
    minSpeed: number,
    maxSpeed: number,
  ): void {
    if (!this.live(index)) return;
    const f = this.pool.fields;
    f.accel[index] = accel;
    f.angVel[index] = angVel;
    f.minSpeed[index] = minSpeed;
    f.maxSpeed[index] = maxSpeed;
  }

  /** See {@link BulletSystem.setChange}. */
  setChange(index: number, atAge: number, speed: number, angle: number): void {
    if (!this.live(index)) return;
    const f = this.pool.fields;
    f.changeAt[index] = atAge > 0 ? Math.floor(atAge) : 0;
    f.changeSpeed[index] = speed;
    f.changeAngle[index] = angle;
  }

  /** See {@link BulletSystem.setDelay}. */
  setDelay(index: number, ticks: number, aimOnLaunch: boolean): void {
    if (!this.live(index)) return;
    const f = this.pool.fields;
    // The countdown runs once in this tick's update too, so `ticks` waits = `ticks + 1` counts.
    f.delay[index] = ticks >= 1 ? Math.floor(ticks) + 1 : 0;
    if (aimOnLaunch && ticks >= 1) f.flags[index] |= BulletFlag.AimOnLaunch;
    else f.flags[index] &= ~BulletFlag.AimOnLaunch;
  }

  /** See {@link BulletSystem.setHoming}. */
  setHoming(index: number, turnRate: number, lifetime: number): void {
    if (!this.live(index)) return;
    const f = this.pool.fields;
    f.turnRate[index] = turnRate > 0 ? turnRate : 0;
    f.homing[index] = lifetime >= 1 ? Math.floor(lifetime) : 0;
  }

  /** See {@link BulletSystem.setFlags}. */
  setFlags(index: number, flags: number): void {
    if (!this.live(index)) return;
    const f = this.pool.fields;
    f.flags[index] = (f.flags[index] & ~PUBLIC_FLAGS) | (flags & PUBLIC_FLAGS);
  }

  /** See {@link BulletSystem.fireLaser}. */
  fireLaser(
    origin: BulletOrigin,
    angle: number,
    length: number,
    width: number,
    telegraph: number,
    grow: number,
    active: number,
    fade: number,
    src: number,
  ): number {
    const t = telegraph >= 1 ? Math.floor(telegraph) : 0;
    const g = grow >= 1 ? Math.floor(grow) : 0;
    const a = active >= 1 ? Math.floor(active) : 0;
    const d = fade >= 1 ? Math.floor(fade) : 0;
    if (t + g + a + d === 0 || !(length > 0) || !(width > 0)) return -1;
    if (angle !== AIM_AT_TARGET && !(angle - angle === 0)) return -1;
    const i = this.lasers.alloc();
    if (i < 0) return -1;
    const f = this.lasers.fields;
    const heading = angle === AIM_AT_TARGET ? this.aimFrom(origin) : Math.round(angle) & ANGLE_MASK;
    f.x[i] = origin.x;
    f.y[i] = origin.y;
    const sources = this.host.laserSources ?? this.host.enemies.enemies;
    if (src >= 0 && src < sources.length && src % 1 === 0) {
      f.src[i] = src;
      f.ox[i] = origin.x - sources[src].x;
      f.oy[i] = origin.y - sources[src].y;
    } else {
      f.src[i] = -1;
    }
    f.angle[i] = heading;
    f.length[i] = length;
    f.width[i] = width;
    f.telegraph[i] = t;
    f.grow[i] = g;
    f.active[i] = a;
    f.fade[i] = d;
    f.phase[i] =
      t > 0
        ? LaserPhase.Telegraph
        : g > 0
          ? LaserPhase.Grow
          : a > 0
            ? LaserPhase.Active
            : LaserPhase.Fade;
    f.ticks[i] = 0;
    f.flags[i] = BulletFlag.Cancelable;
    f.sprite[i] = this.laserSprite < 0 ? 0 : this.laserSprite;
    this.laserShape(i);
    return i;
  }

  /** See {@link BulletSystem.detachLasers}. */
  detachLasers(slot: number): void {
    const f = this.lasers.fields;
    const n = this.lasers.count;
    for (let i = 0; i < n; i++) {
      if (f.src[i] !== slot || (f.flags[i] & BulletFlag.Dead) !== 0) continue;
      f.src[i] = -1;
      const phase = f.phase[i];
      if (phase === LaserPhase.Telegraph || phase === LaserPhase.Grow) {
        this.killLaser(i);
      } else if (phase === LaserPhase.Active) {
        if (f.fade[i] > 0) {
          f.phase[i] = LaserPhase.Fade;
          f.ticks[i] = 0;
          this.laserShape(i);
        } else {
          this.killLaser(i);
        }
      }
    }
  }

  /**
   * Removes a laser (freed in phase 8).
   *
   * @param i - The slot.
   */
  private killLaser(i: number): void {
    const f = this.lasers.fields;
    f.flags[i] |= BulletFlag.Dead;
    f.draw[i] = SpriteFlag.Hidden;
    this.lasers.free(i);
  }

  /**
   * Recomputes a laser's end point, drawn width and blink from its origin, phase and ticks.
   *
   * @param i - The slot.
   */
  private laserShape(i: number): void {
    const f = this.lasers.fields;
    const a = f.angle[i] & ANGLE_MASK;
    const length = f.length[i];
    f.ex[i] = f.x[i] + (SIN_TABLE_Q16[a + ANGLE_QUARTER] / TRIG_SCALE) * length;
    f.ey[i] = f.y[i] + (SIN_TABLE_Q16[a] / TRIG_SCALE) * length;
    // Ticks spent in the phase, this one included (1 … its length; 0 right after firing).
    const k = f.ticks[i] > 1 ? f.ticks[i] : 1;
    const width = f.width[i];
    let draw = this.laserSprite < 0 ? SpriteFlag.Hidden : 0;
    switch (f.phase[i]) {
      case LaserPhase.Telegraph:
        f.drawWidth[i] = 0;
        if ((Math.floor((k - 1) / LASER_BLINK_TICKS) & 1) === 1) draw = SpriteFlag.Hidden;
        break;
      case LaserPhase.Grow:
        f.drawWidth[i] = (width * k) / (f.grow[i] + 1);
        break;
      case LaserPhase.Active:
        f.drawWidth[i] = width;
        break;
      default:
        f.drawWidth[i] = (width * (f.fade[i] + 1 - k)) / (f.fade[i] + 1);
        break;
    }
    f.draw[i] = draw;
  }

  /**
   * See {@link BulletSystem.update}: the bullets, then the lasers.
   *
   * @remarks
   * One method with both loops, on purpose: V8's mid tier (Maglev) compiles a small loop-free
   * method called once per tick — such as a wrapper calling a bullet and a laser method — and
   * keeps it there, inlining the small laser loop into that code, which boxed a heap number per
   * laser per tick (the allocation guard caught ~400 B per tick). A method whose own loops are
   * hot is tiered up to TurboFan quickly.
   */
  update(): void {
    const pool = this.pool;
    const f = pool.fields;
    const n = pool.count;
    const camera = this.host.camera;
    const dx = camera.dx;
    const dy = camera.dy;
    const left = camera.x - BULLET_CULL_MARGIN;
    const top = camera.y - BULLET_CULL_MARGIN;
    const right = camera.x + PLAYFIELD_W + BULLET_CULL_MARGIN;
    const bottom = camera.y + PLAYFIELD_H + BULLET_CULL_MARGIN;
    const map = this.host.terrain;
    const xs = f.x;
    const ys = f.y;
    const flags = f.flags;
    for (let i = 0; i < n; i++) {
      const bits = flags[i];
      if ((bits & BulletFlag.Dead) !== 0) continue;
      xs[i] += dx;
      ys[i] += dy;
      const delay = f.delay[i];
      let moving = true;
      if (delay > 0) {
        f.delay[i] = delay - 1;
        if (delay > 1) {
          moving = false;
        } else if ((bits & BulletFlag.AimOnLaunch) !== 0) {
          flags[i] = bits & ~BulletFlag.AimOnLaunch;
          f.angle[i] = this.aimSlot(i, true);
          this.velocity(i);
        }
      }
      if (moving) {
        const age = f.age[i] + 1;
        f.age[i] = age;
        let dirty = false;
        if (age === f.changeAt[i]) {
          const speed = f.changeSpeed[i];
          if (speed === speed) f.speed[i] = speed;
          const angle = f.changeAngle[i];
          if (angle === AIM_AT_TARGET) f.angle[i] = this.aimSlot(i, true);
          else if (angle === angle) f.angle[i] = wrapUnits(angle);
          dirty = true;
        }
        const homing = f.homing[i];
        if (homing > 0) {
          f.homing[i] = homing - 1;
          const target = this.aimSlotOrNone(i);
          if (target >= 0) {
            // `turnToward` inlined over whole units (the heading may be fractional).
            const from = Math.round(f.angle[i]) & ANGLE_MASK;
            const delta = ((target - from + ANGLE_UNITS / 2) & ANGLE_MASK) - ANGLE_UNITS / 2;
            const step = f.turnRate[i];
            // Wrapped inline: a fractional argument of a call V8 does not inline is boxed.
            let turned = delta > step ? from + step : delta < -step ? from - step : from + delta;
            if (turned >= ANGLE_UNITS) turned -= ANGLE_UNITS;
            else if (turned < 0) turned += ANGLE_UNITS;
            f.angle[i] = turned;
            dirty = true;
          }
        }
        const accel = f.accel[i];
        if (accel !== 0) {
          let speed = f.speed[i] + accel;
          if (speed < f.minSpeed[i]) speed = f.minSpeed[i];
          if (speed > f.maxSpeed[i]) speed = f.maxSpeed[i];
          f.speed[i] = speed;
          dirty = true;
        }
        const angVel = f.angVel[i];
        if (angVel !== 0) {
          let angle = (f.angle[i] + angVel) % ANGLE_UNITS;
          if (angle < 0) angle += ANGLE_UNITS;
          f.angle[i] = angle;
          dirty = true;
        }
        if (dirty) this.velocity(i);
        xs[i] += f.vx[i];
        ys[i] += f.vy[i];
      }
      const x = xs[i];
      const y = ys[i];
      // Written as "not inside" so a non-finite (NaN) position is culled too: NaN fails every
      // comparison, and such a bullet would otherwise live forever and "hit" every ship.
      if (!(x >= left && x <= right && y >= top && y <= bottom)) {
        this.killBullet(i);
      } else if (
        map !== null &&
        (flags[i] & BulletFlag.DieOnTerrain) !== 0 &&
        terrainAt(map, Math.floor(x) | 0, Math.floor(y) | 0) !== TerrainType.Empty
      ) {
        this.killBullet(i);
      }
    }
    // Lasers: follow the source or ride the camera, step the phase, reshape.
    const lasers = this.lasers;
    const lf = lasers.fields;
    const ln = lasers.count;
    const sources = this.host.laserSources ?? this.host.enemies.enemies;
    for (let i = 0; i < ln; i++) {
      if ((lf.flags[i] & BulletFlag.Dead) !== 0) continue;
      const src = lf.src[i];
      if (src >= 0) {
        const source = sources[src];
        lf.x[i] = source.x + lf.ox[i];
        lf.y[i] = source.y + lf.oy[i];
      } else {
        lf.x[i] += dx;
        lf.y[i] += dy;
      }
      // A phase of length d lasts exactly d updates (a laser fired in phase 4 spends its first
      // telegraph tick in the same tick's update).
      let phase: number = lf.phase[i];
      let ticks = lf.ticks[i] + 1;
      const length =
        phase === LaserPhase.Telegraph
          ? lf.telegraph[i]
          : phase === LaserPhase.Grow
            ? lf.grow[i]
            : phase === LaserPhase.Active
              ? lf.active[i]
              : lf.fade[i];
      if (ticks > length) {
        ticks = 1;
        // The next phase with a length (fired lasers always have one after the first).
        if (phase < LaserPhase.Grow && lf.grow[i] > 0) phase = LaserPhase.Grow;
        else if (phase < LaserPhase.Active && lf.active[i] > 0) phase = LaserPhase.Active;
        else if (phase < LaserPhase.Fade && lf.fade[i] > 0) phase = LaserPhase.Fade;
        else {
          this.killLaser(i);
          continue;
        }
        lf.phase[i] = phase;
      }
      lf.ticks[i] = ticks;
      this.laserShape(i);
    }
  }

  /**
   * The unquantised angle from a bullet to the nearest living player (homing).
   *
   * @param i - The slot.
   * @returns A whole angle, or -1 without a target.
   */
  private aimSlotOrNone(i: number): number {
    const players = this.host.players;
    for (let p = 0; p < players.length; p++) {
      const ship = players[p];
      if (ship.active && ship.state === 'alive') return this.aimSlot(i, false);
    }
    return -1;
  }

  /**
   * Removes a bullet (freed in phase 8).
   *
   * @param i - The slot.
   */
  private killBullet(i: number): void {
    this.pool.fields.flags[i] |= BulletFlag.Dead;
    this.pool.fields.draw[i] |= SpriteFlag.Hidden;
    this.pool.free(i);
  }

  /**
   * See {@link BulletSystem.collidePlayers}.
   *
   * @remarks
   * The ship's position is copied into {@link BulletSystemImpl.shipX} / `shipY` here and the
   * tests read it from there: loading `ship.x` inside the laser test allocated a heap number per
   * load in V8's optimised code (the allocation guard caught it); class fields do not.
   */
  collidePlayers(): void {
    const players = this.host.players;
    for (let p = 0; p < players.length; p++) {
      const ship = players[p];
      if (!ship.active || ship.state !== 'alive') continue;
      this.shipX = ship.x;
      this.shipY = ship.y;
      this.bulletsVs(ship);
      if (!ship.active || ship.state !== 'alive') continue;
      this.lasersVs(ship);
    }
  }

  /**
   * Bullets against one ship (circle vs circle, closed: touching hits); the first overlap ends
   * the test for this ship — an accepted hit removes its bullet.
   *
   * @remarks
   * Takes only the ship (the hurt radius is read here): V8 boxes a fractional argument of a call
   * it does not inline.
   *
   * @param ship - The ship.
   */
  private bulletsVs(ship: PlayerShip): void {
    const f = this.pool.fields;
    const n = this.pool.count;
    const sx = this.shipX;
    const sy = this.shipY;
    const host = this.host;
    const r = this.hurtRadius;
    for (let i = 0; i < n; i++) {
      if ((f.flags[i] & BulletFlag.Dead) !== 0) continue;
      const dx = f.x[i] - sx;
      const dy = f.y[i] - sy;
      const reach = f.radius[i] + r;
      // "Not within reach", so a NaN distance is a miss.
      if (!(dx * dx + dy * dy <= reach * reach)) continue;
      if (playerHit(ship, PlayerHitCause.Bullet, host.tick, host.debugFlags)) {
        this.killBullet(i);
        return;
      }
      // Not accepted (invulnerable, god mode): no later bullet is accepted either.
      return;
    }
  }

  /**
   * Active lasers against one ship (capsule vs circle; `capsuleCircle` inlined); the first
   * overlap ends the test for this ship.
   *
   * @param ship - The ship.
   */
  private lasersVs(ship: PlayerShip): void {
    const f = this.lasers.fields;
    const n = this.lasers.count;
    const px = this.shipX;
    const py = this.shipY;
    const host = this.host;
    const r = this.hurtRadius;
    for (let i = 0; i < n; i++) {
      if (f.phase[i] !== LaserPhase.Active || (f.flags[i] & BulletFlag.Dead) !== 0) continue;
      const x1 = f.x[i];
      const y1 = f.y[i];
      const sx = f.ex[i] - x1;
      const sy = f.ey[i] - y1;
      const lengthSq = sx * sx + sy * sy;
      let t = 0;
      if (lengthSq > 0) {
        t = ((px - x1) * sx + (py - y1) * sy) / lengthSq;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
      }
      const dx = px - (x1 + sx * t);
      const dy = py - (y1 + sy * t);
      const reach = f.width[i] / 2 + r;
      // "Not within reach", so a laser with a NaN origin never hits.
      if (!(dx * dx + dy * dy <= reach * reach)) continue;
      playerHit(ship, PlayerHitCause.Laser, host.tick, host.debugFlags);
      return;
    }
  }

  /** See {@link BulletSystem.cancelAll}. */
  cancelAll(_mode: CancelMode): number {
    const f = this.pool.fields;
    const n = this.pool.count;
    let cancelable = 0;
    for (let i = 0; i < n; i++) {
      const bits = f.flags[i];
      if ((bits & BulletFlag.Dead) === 0 && (bits & BulletFlag.Cancelable) !== 0) cancelable++;
    }
    const stride =
      cancelable > CANCEL_SPARKLE_LIMIT ? Math.ceil(cancelable / CANCEL_SPARKLE_LIMIT) : 1;
    const events = this.host.events;
    let cancelled = 0;
    for (let i = 0; i < n; i++) {
      const bits = f.flags[i];
      if ((bits & BulletFlag.Dead) !== 0 || (bits & BulletFlag.Cancelable) === 0) continue;
      if (cancelled % stride === 0) {
        // Whole pixels: fractional arguments of the (not inlined) push would be boxed — every
        // death cancels the bullets (M1-12), so this is no longer a rare path.
        const x = Math.floor(f.x[i]) | 0;
        const y = Math.floor(f.y[i]) | 0;
        events.push(SimEventKind.Particles, FX_CUES.BulletCancel, x, y, 1);
      }
      cancelled++;
      this.killBullet(i);
    }
    const lf = this.lasers.fields;
    const ln = this.lasers.count;
    for (let i = 0; i < ln; i++) {
      const bits = lf.flags[i];
      if ((bits & BulletFlag.Dead) === 0 && (bits & BulletFlag.Cancelable) !== 0) {
        this.killLaser(i);
      }
    }
    return cancelled;
  }
}

/**
 * Creates the bullet system of a World (load time): both pools (registered with the World as
 * `enemyBullets` and `enemyLasers`), their views and the kind tables (sprite ids resolved through
 * `content.sprites`). The rank starts at 0 — the World calls {@link BulletSystem.setRank}.
 *
 * @param host - The World (read at every call — pass the World itself).
 * @returns The system.
 * @throws {Error} When the World already registered pools with these names.
 *
 * @example
 * ```ts
 * const bullets = createBulletSystem(world);
 * bullets.setRank(computeRank(difficultyRankInputs(config.difficulty)));
 * ```
 */
export function createBulletSystem(host: BulletHost): BulletSystem {
  return new BulletSystemImpl(host);
}

/**
 * Spawns one enemy bullet (raw values — the pattern primitives of `core/patterns` add rank
 * scaling and the fire rules).
 *
 * @param owner - The World (anything with a bullet system).
 * @param x - World x.
 * @param y - World y.
 * @param angle - Heading in binary units, or {@link AIM_AT_TARGET}.
 * @param speed - Pixels per tick.
 * @param kind - {@link BulletKind}.
 * @returns The slot (stable within this tick), or -1 when the spawn was dropped (full pool, bad
 *   kind or angle).
 *
 * @example
 * ```ts
 * const i = spawnBullet(world, enemy.x, enemy.y, AIM_AT_TARGET, 1.5, BulletKind.RoundPink);
 * if (i >= 0) world.bullets.setMotion(i, 0.02, 0, 0, 3); // speeds up to 3 px/tick
 * ```
 */
export function spawnBullet(
  owner: BulletOwner,
  x: number,
  y: number,
  angle: number,
  speed: number,
  kind: number,
): number {
  return owner.bullets.spawn(x, y, angle, speed, kind);
}

/** Scratch origin of {@link fireLaser} (module-level: firing never allocates). */
const laserOrigin = new BulletOrigin();

/**
 * Fires a straight laser from a source: an enemy (`slot` ≥ 0 — the laser follows it) or a fixed
 * point (`slot` -1 — the laser rides the camera).
 *
 * @remarks
 * A raw call, like {@link spawnBullet}: no fire rule (the enemy `ScriptApi.laser` checks
 * `canFire()` first) and no rank scaling. Timings are floored and a timing of 0 skips its
 * phase; the laser warns for `telegraph` ticks (blinking line, no hitbox), widens for `grow`,
 * has its capsule hitbox for `active` ticks at full `width`, then narrows for `fade` and is
 * removed. Positional timings instead of an options object keep the call allocation-free
 * (plan M1-09 as built). An attached laser detaches when its enemy is removed or turns ghost:
 * warning / growing lasers vanish, an active one fades.
 *
 * @param owner - The World.
 * @param src - The source (an `Enemy` works as it is).
 * @param angle - Direction in binary units, or {@link AIM_AT_TARGET}.
 * @param length - Length in pixels.
 * @param telegraph - Warning-line ticks (default {@link LASER_TELEGRAPH_TICKS}).
 * @param grow - Grow ticks (default {@link LASER_GROW_TICKS}).
 * @param active - Full-width ticks (default {@link LASER_ACTIVE_TICKS}).
 * @param width - Width in pixels (default {@link LASER_WIDTH}).
 * @param fade - Fade ticks (default {@link LASER_FADE_TICKS}).
 * @returns The laser slot (stable within this tick), or -1 when nothing was fired: the 16-slot
 *   pool is full, every timing is 0, the length or width is not positive, or the angle is
 *   neither finite nor {@link AIM_AT_TARGET}.
 *
 * @example
 * ```ts
 * fireLaser(world, turret, ANGLE_UNITS / 2, 300); // 40 ticks of warning, then 60 of beam
 * ```
 */
export function fireLaser(
  owner: BulletOwner,
  src: LaserSource,
  angle: number,
  length: number,
  telegraph: number = LASER_TELEGRAPH_TICKS,
  grow: number = LASER_GROW_TICKS,
  active: number = LASER_ACTIVE_TICKS,
  width: number = LASER_WIDTH,
  fade: number = LASER_FADE_TICKS,
): number {
  laserOrigin.x = src.x;
  laserOrigin.y = src.y;
  return owner.bullets.fireLaser(
    laserOrigin,
    angle,
    length,
    width,
    telegraph,
    grow,
    active,
    fade,
    src.slot,
  );
}

/**
 * Cancels every cancelable enemy bullet and laser at once (boss death, player death, Mega Crash —
 * shmup_feat.md §12): they are removed this tick and sparkle.
 *
 * @remarks
 * `CancelMode.Sparkle` pushes a `SimEventKind.Particles` event with `FX_CUES.BulletCancel` at the
 * bullets' positions (whole pixels, floored) — every bullet up to {@link CANCEL_SPARKLE_LIMIT},
 * beyond that an evenly spread subset (the event ring is shared with everything else). Bullets
 * without `BulletFlag.Cancelable` survive. Points mode arrives with M2-02.
 *
 * @param owner - The World.
 * @param mode - {@link CancelMode}.
 * @returns How many bullets were cancelled.
 *
 * @example
 * ```ts
 * cancelAllBullets(world, CancelMode.Sparkle); // the boss exploded
 * ```
 */
export function cancelAllBullets(owner: BulletOwner, mode: CancelMode): number {
  return owner.bullets.cancelAll(mode);
}
