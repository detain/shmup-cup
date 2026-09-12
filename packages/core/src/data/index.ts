/**
 * # data — content schemas and loaders (player, weapons, enemies, paths, stages, tilesets JSON)
 *
 * **Status: partial.** The loader, the schema combinators and the `player`, `weapons`,
 * `enemies` (with its boss section, M1-13), `paths`, `stage` and `tileset` formats are
 * implemented; later steps add their kinds.
 *
 * **Responsibility.** Data-driven content (design pillar 4). Declares the shape of every
 * file under `content/`, validates it at load time with the in-house combinators in
 * {@link ./schema.js | data/schema} (decision D28 — no runtime dependency), migrates older
 * `formatVersion`s and **resolves every string id to a numeric index once**, so the
 * per-tick path only touches numbers (convention 1.5). Behaviour lives in TypeScript and is
 * referenced from data by id; tunables live in data.
 *
 * **Stages (M1-07).** A stage carries its music, length, camera keys, checkpoints, parallax
 * bands, an optional tilemap and an event timeline. Beyond the schema the loader checks that
 * camera keys, checkpoints and events are sorted by `x` (keys and checkpoints strictly, the
 * first key at 0), that nothing lies past the stage `length`, numbers the `flag` names, and —
 * in a third pass once tileset ids are resolved — expands the tilemap (`heightfield` generator
 * and/or RLE rows, {@link ./tilemap.js | data/tilemap}) into {@link StageSpec.terrain}. Tilesets
 * get per-tile-id lookup tables ({@link TilesetSpec.tables}) the terrain queries read.
 *
 * **Enemies and paths (M1-08).** An enemy names its behaviour coroutine (`script`, checked against
 * the engine's registry when `knownScripts` is given), its sprite and animation, hit points,
 * score, hurtbox, ground anchor, settle time, explosion size, drop, behaviour tunables
 * (`params`), an optional starting mover and an optional `child` enemy (spawners); optional
 * fields get their defaults at load, so every {@link EnemySpec} has the same fields. Paths
 * (`content/paths/`) are control-point lists baked at load into arc-length tables
 * ({@link ./paths.js | data/paths}); stage `spawn` / `formation` events and `path` movers refer to
 * them by id.
 *
 * **Bosses (M1-13).** An enemy entry with a `boss` section ({@link BossSpec}) is a boss: its
 * WARNING `code` and `displayName`, intro length, home position, tally score, up to
 * {@link MAX_BOSS_PARTS} parts ({@link BossPartSpec}: parent, offset, hit points, hurtbox, sprite,
 * weak-point rule — {@link BossVulnerability}) and up to {@link MAX_BOSS_PHASES} phases
 * ({@link BossPhaseSpec}: a boss behaviour and the condition that ends it). Such an entry names
 * nothing else; the loader resolves part names to indices and bit masks. After the references are
 * resolved, stage `spawn` / `formation` events and enemy `child`ren must name regular enemies and
 * `warning` / `boss` events bosses.
 *
 * **Implements.**
 * - shmup_feat.md §14 — stage data format (JSON validated with a schema), tilemap terrain with
 *   collision types and slope masks, parallax layers, sorted event timeline
 * - shmup_feat.md §10 — invisible checkpoints in the stage data
 * - shmup_feat.md §22 — data-driven content (`enemies.json`, `weapons.json`, `stages/*.json`)
 * - shmup_feat.md §7 / §11 — weapons and enemies defined in data
 * - shmup_feat.md §13 — multi-part bosses with weak points and phases defined in data
 *
 * **Public API.**
 * - Loading: {@link loadContent} (+ {@link LoadContentOptions}, {@link LoadContentResult},
 *   {@link ContentFile}), {@link isContentKind}.
 * - The database: {@link ContentDb}, {@link StringTable}, {@link EMPTY_CONTENT_DB}.
 * - File format: {@link CONTENT_FORMAT_VERSION}, {@link CONTENT_KINDS} / {@link ContentKind},
 *   {@link ContentFileHeader}, {@link CONTENT_MIGRATIONS} ({@link ContentMigration},
 *   {@link ContentMigrationTable}).
 * - Per-kind spec types: {@link PlayerShipSpec} ({@link BoxSpec}, {@link MarginSpec}),
 *   {@link WeaponSpec} ({@link WeaponSlot}, {@link WEAPON_SLOTS}), {@link WeaponPresetSpec},
 *   {@link EnemySpec} ({@link EnemyRankSpec}, {@link EnemyAnimSpec}, {@link EnemyMoverSpec},
 *   {@link MoverType}, {@link MOVER_TYPES}, {@link EnemyGround}, {@link ENEMY_GROUNDS},
 *   {@link EnemyExplosion}, {@link ENEMY_EXPLOSIONS}, {@link EnemyDrop}, {@link ENEMY_DROPS},
 *   {@link DEFAULT_SETTLE_TICKS}), {@link BossSpec} ({@link BossPartSpec}, {@link BossPhaseSpec},
 *   {@link BossUntilSpec}, {@link BossVulnerability}, {@link BOSS_VULNERABILITIES},
 *   {@link MAX_BOSS_PARTS}, {@link MAX_BOSS_PHASES}, {@link DEFAULT_BOSS_X},
 *   {@link DEFAULT_BOSS_Y}, {@link DEFAULT_BOSS_INTRO_TICKS}), {@link PathSpec} ({@link PathPointSpec}, {@link PathTable},
 *   {@link bakePath}, {@link PATH_SAMPLE_STEP}, {@link MAX_PATH_LENGTH}), {@link StageSpec} and its
 *   parts
 *   ({@link StageMusic}, {@link StageCameraKey}, {@link StageCheckpoint},
 *   {@link StageParallaxLayer}, {@link StageParallaxLayerName}, {@link StageTilemapSpec},
 *   {@link HeightfieldSpec}, {@link HeightfieldSegment}, {@link HeightfieldProfile},
 *   {@link StageTerrain}, {@link StageEvent} and its variants, {@link STAGE_EVENT_TYPES},
 *   {@link MAX_STAGE_FLAGS}), {@link TilesetSpec} ({@link TileSpec}, {@link TileType},
 *   {@link TILE_TYPES}, {@link TileAnchor}, {@link TILE_ANCHORS}, {@link TILE_SIZE},
 *   {@link TilesetTables}).
 * - Everything re-exported from {@link ./schema.js | data/schema}: the combinators `s`,
 *   `Schema`, `Infer`, `ObjectShape`, `ObjectValue`, `RefSite`, `ContentRefKind`,
 *   `ValidationIssue`.
 *
 * **Id resolution convention.** A field declared with `s.ref(kind)` keeps its string and
 * gains a sibling `<field>Id` holding the resolved numeric index (`sprite` → `spriteId`,
 * `behavior` → `behaviorId`, `enemy` → `enemyId`, `cue` → `cueId`, `tileset` → `tilesetId`,
 * `path` → `pathId`, `child` → `childId`); `-1` means null, absent or unresolved. Systems read
 * only the numbers.
 *
 * **Planned API (later steps).** Kinds `rules`,
 * `patterns`, `campaign`, `strings` (M2); `input-profiles`, `sfx`/`music` and `fx` files stay
 * *foreign* here and are validated by their owning packages (see plan §3.5). Hosts pass
 * `knownScripts` (`core/behaviors` `KNOWN_SCRIPT_IDS`) so script ids are checked; M1-03 checks
 * `db.sprites` against the atlas.
 *
 * @remarks
 * Nothing in this module runs per tick: it allocates freely, uses `Map`s and reports **all**
 * problems of a load instead of throwing. {@link loadContent} throws only for a programming
 * error (a bad `files` argument). Developer guide: `docs/dev/content-data.md`.
 *
 * @module
 */
import { PLAYFIELD_H, PLAYFIELD_W } from '../config/index.js';
import { MUSIC_CUES, SFX_CUES } from '../events/index.js';
import { defineModule } from '../module-info.js';
import { bakePath, type PathTable } from './paths.js';
import { s, type RefSite, type Schema, type ValidationIssue } from './schema.js';
import { buildTilesetTables, expandTilemap, type TilesetTables } from './tilemap.js';

export type { TilesetTables } from './tilemap.js';
export { MAX_PATH_LENGTH, PATH_SAMPLE_STEP, bakePath, type PathTable } from './paths.js';

export {
  s,
  type ContentRefKind,
  type Infer,
  type ObjectShape,
  type ObjectValue,
  type RefSite,
  type Schema,
  type ValidationIssue,
} from './schema.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'data',
  status: 'partial',
  specRefs: ['shmup_feat.md §14', 'shmup_feat.md §22', 'shmup_feat.md §7', 'shmup_feat.md §11'],
});

/**
 * Format version every content file carries from the first playable slice on.
 *
 * @remarks
 * Files written for an older version are migrated by {@link CONTENT_MIGRATIONS}; newer ones
 * are rejected with an issue (an old build must not guess at a future format).
 */
export const CONTENT_FORMAT_VERSION = 1;

/**
 * Kinds of content file this module owns. Other kinds are returned as *foreign*.
 *
 * @remarks
 * The `kind` header field selects the schema; the file's folder and name do not matter to
 * the loader (the `pnpm content:check` test additionally checks that `*.<kind>.json` names
 * match). A later step that adds a kind appends it here, to {@link ContentDb} and to the
 * internal `parseFile` / `collect` switches.
 */
export const CONTENT_KINDS = Object.freeze([
  'player',
  'weapons',
  'enemies',
  'paths',
  'stage',
  'tileset',
] as const);

/** Kinds of content file this module owns (`content/player/`, `weapons/`, …). */
export type ContentKind = (typeof CONTENT_KINDS)[number];

/** Common header of every content JSON file. */
export interface ContentFileHeader {
  /** Bumped on breaking format changes; loaders migrate or reject. */
  readonly formatVersion: number;
  /** Which schema the file follows. */
  readonly kind: string;
}

/** One content file as handed to {@link loadContent}. */
export interface ContentFile {
  /** Repo-relative path, e.g. `player/kestrel.player.json` — used in issue messages. */
  readonly path: string;
  /** The parsed JSON (`JSON.parse` output; never a string). */
  readonly data: unknown;
}

/**
 * Upgrades one file body from format `v` to `v + 1`.
 *
 * @param data - The file body at format `v` (a JSON object; treat it as read-only).
 * @returns A new body in format `v + 1`.
 *
 * @remarks
 * Return a fresh object instead of mutating `data` — the caller's parsed JSON must stay
 * untouched. The loader writes `formatVersion = v + 1` into the result itself, so a
 * migration only has to reshape the fields that changed.
 */
export type ContentMigration = (data: Readonly<Record<string, unknown>>) => Record<string, unknown>;

/**
 * Per-kind migrations, keyed by the version they upgrade *from*.
 *
 * @example
 * ```ts
 * const table: ContentMigrationTable = {
 *   weapons: { 0: (data) => ({ ...data }), 1: (data) => ({ ...data, presets: [] }) },
 * };
 * ```
 */
export type ContentMigrationTable = {
  readonly [K in ContentKind]?: { readonly [fromVersion: number]: ContentMigration };
};

/**
 * Returns a shallow copy of its input (a format change that did not reshape the body).
 *
 * @param data - The file body.
 * @returns A copy; the loader then bumps its `formatVersion`.
 */
const identityMigration: ContentMigration = (data) => ({ ...data });

/**
 * Migrations applied by {@link loadContent}, by kind and source version.
 *
 * @remarks
 * Format 0 was the pre-release design format: for `weapons`, `enemies` and `stage` it is
 * structurally identical to format 1, so the 0 → 1 step only rewrites the header. The
 * `player` kind did not exist in format 0, so a format-0 player file is an error.
 */
export const CONTENT_MIGRATIONS: ContentMigrationTable = Object.freeze({
  weapons: Object.freeze({ 0: identityMigration }),
  enemies: Object.freeze({ 0: identityMigration }),
  stage: Object.freeze({ 0: identityMigration }),
});

/** Half-extents of an axis-aligned box, in playfield pixels. */
export interface BoxSpec {
  /** Half width. */
  readonly hw: number;
  /** Half height. */
  readonly hh: number;
}

/** How close to the playfield edges the ship may fly, in pixels. */
export interface MarginSpec {
  /** Distance kept from the left camera edge. */
  readonly left: number;
  /** Distance kept from the right camera edge. */
  readonly right: number;
  /** Distance kept from the top of the playfield. */
  readonly top: number;
  /** Distance kept from the bottom of the playfield. */
  readonly bottom: number;
}

/** One player ship (`content/player/*.player.json`, shmup_feat.md §5). */
export interface PlayerShipSpec {
  /** Unique id, e.g. `kestrel`. */
  readonly id: string;
  /** Display name, e.g. `KESTREL`. */
  readonly name: string;
  /** Atlas sprite name. */
  readonly sprite: string;
  /** Resolved {@link ContentDb.sprites} index of {@link PlayerShipSpec.sprite}. */
  readonly spriteId: number;
  /** Movement speed per speed level, in pixels per tick (decision D3). */
  readonly speeds: readonly number[];
  /** Radius of the tiny centred hurtbox, in pixels. */
  readonly hurtRadius: number;
  /** Box tested against terrain. */
  readonly terrainBox: BoxSpec;
  /** Box that collects items (the pickup magnet works on top of it, D33). */
  readonly pickupBox: BoxSpec;
  /** Distance kept from the camera view edges. */
  readonly margins: MarginSpec;
  /** Uncontrollable fly-in after a spawn, in ticks. */
  readonly enterTicks: number;
  /** Respawn invincibility, in ticks. */
  readonly respawnInvulnTicks: number;
  /** Number of bank (tilt) frames on each side of the idle frame. */
  readonly bankFrames: number;
}

/** Where a weapon sits in a loadout (shmup_feat.md §7A/§7B). */
export type WeaponSlot = 'main' | 'double' | 'laser' | 'missile' | 'sub';

/** Every {@link WeaponSlot} value, for validation and menus. */
export const WEAPON_SLOTS = Object.freeze(['main', 'double', 'laser', 'missile', 'sub'] as const);

/** One player weapon (`content/weapons/*.weapons.json`, shmup_feat.md §7C). */
export interface WeaponSpec {
  /** Unique id, e.g. `shot.basic`. */
  readonly id: string;
  /** Loadout slot. */
  readonly slot: WeaponSlot;
  /** Coded behaviour id (core `weapons`), e.g. `shot.straight`. */
  readonly behavior: string;
  /** Resolved {@link ContentDb.scripts} index of {@link WeaponSpec.behavior}. */
  readonly behaviorId: number;
  /** Damage per hit. */
  readonly damage: number;
  /** Travel speed in pixels per tick. */
  readonly speed: number;
  /** Maximum live projectiles per shooter (Gradius-style). */
  readonly cap: number;
  /** Whether the projectile survives a hit. */
  readonly pierce: boolean;
  /** Atlas sprite name. */
  readonly sprite: string;
  /** Resolved {@link ContentDb.sprites} index of {@link WeaponSpec.sprite}. */
  readonly spriteId: number;
  /** Ticks between shots of this weapon (autofire cadence); omitted = use the config default. */
  readonly refireTicks?: number;
  /** Cue name from `SFX_CUES` played on fire, or `null` for a silent weapon. */
  readonly sfx?: string | null;
  /** Resolved SFX cue id, or `-1` when absent/null. */
  readonly sfxId?: number;
  /** Behaviour-specific tunables (e.g. laser length, missile slide speed). */
  readonly params?: Readonly<Record<string, number>>;
}

/** A meter-mode loadout: which weapon each equip slot gives (shmup_feat.md §7A). */
export interface WeaponPresetSpec {
  /** Unique id, e.g. `type-a`. */
  readonly id: string;
  /** Main-shot weapon id, or `null` to use the default. */
  readonly main?: string | null;
  /** Resolved {@link ContentDb.weapons} index of {@link WeaponPresetSpec.main} (`-1` if none). */
  readonly mainId?: number;
  /** Missile weapon id, or `null` when the preset has no missile. */
  readonly missile: string | null;
  /** Resolved weapon index of {@link WeaponPresetSpec.missile} (`-1` if none). */
  readonly missileId: number;
  /** Double weapon id, or `null`. */
  readonly double: string | null;
  /** Resolved weapon index of {@link WeaponPresetSpec.double} (`-1` if none). */
  readonly doubleId: number;
  /** Laser weapon id, or `null`. */
  readonly laser: string | null;
  /** Resolved weapon index of {@link WeaponPresetSpec.laser} (`-1` if none). */
  readonly laserId: number;
}

/** Optional per-enemy rank modifiers (shmup_feat.md §15). */
export interface EnemyRankSpec {
  /** Extra shots per second at maximum rank. */
  readonly fireRate?: number;
  /** Extra bullet speed (px/tick) at maximum rank. */
  readonly bulletSpeed?: number;
}

/** Sprite animation of an enemy: `frames` frames of its sprite, `ticks` ticks each, looping. */
export interface EnemyAnimSpec {
  /** Frames in the loop (1 = a still sprite). */
  readonly frames: number;
  /** Ticks each frame is shown. */
  readonly ticks: number;
}

/** Where a ground enemy is anchored (shmup_feat.md §11 turrets, walkers, hatches). */
export type EnemyGround = 'floor' | 'ceiling';

/** Every {@link EnemyGround}, in code order (the index + 1 is the anchor code; 0 = flying). */
export const ENEMY_GROUNDS = Object.freeze(['floor', 'ceiling'] as const);

/** Size of an enemy's death explosion (effects and SFX). */
export type EnemyExplosion = 'small' | 'medium' | 'large';

/** Every {@link EnemyExplosion}, in code order. */
export const ENEMY_EXPLOSIONS = Object.freeze(['small', 'medium', 'large'] as const);

/** What an enemy (or a completed formation) leaves behind (M1: power capsules). */
export type EnemyDrop = 'capsule';

/** Every {@link EnemyDrop}, in code order (the index + 1 is the drop code; 0 = none). */
export const ENEMY_DROPS = Object.freeze(['capsule'] as const);

/** Default {@link EnemySpec.settleTicks}: half a second on screen before an enemy may fire. */
export const DEFAULT_SETTLE_TICKS = 30;

/**
 * The movers (per-tick motion primitives of `core/patterns`, shmup_feat.md §11), by their content
 * name; the position + 1 is the `MoverKind` code (0 = none).
 */
export const MOVER_TYPES = Object.freeze([
  'straight',
  'sine',
  'path',
  'waypoint',
  'follow',
  'groundCrawl',
  'homing',
  'aimedDash',
] as const);

/** A mover's content name. */
export type MoverType = (typeof MOVER_TYPES)[number];

/**
 * An enemy's starting mover (`core/patterns` documents each one). Velocities are in pixels per
 * tick, relative to the view for flying enemies (they ride the camera scroll) and to the world
 * for ground enemies; angles are binary units (1024 per turn).
 */
export type EnemyMoverSpec =
  | {
      /** Constant velocity. */
      readonly type: 'straight';
      /** Horizontal velocity. */
      readonly vx: number;
      /** Vertical velocity. */
      readonly vy: number;
    }
  | {
      /** Horizontal drift with a vertical sine wave. */
      readonly type: 'sine';
      /** Horizontal velocity. */
      readonly vx: number;
      /** Wave amplitude in pixels. */
      readonly amp: number;
      /** Wave period in ticks. */
      readonly period: number;
      /** Starting phase in binary-angle units (default 0). */
      readonly phase?: number;
    }
  | {
      /** Follow a path from `content/paths/` at constant speed. */
      readonly type: 'path';
      /** Path id; omitted = the spawn event's `path`. */
      readonly path?: string;
      /** Resolved {@link ContentDb.paths} index (-1 = use the spawn event's path). */
      readonly pathId: number;
      /** Pixels per tick along the curve. */
      readonly speed: number;
    }
  | {
      /** Enter → stop → leave: fly to a point of the view, hold, fly off. */
      readonly type: 'waypoint';
      /** Target x in playfield pixels (camera-relative). */
      readonly x: number;
      /** Target y in playfield pixels. */
      readonly y: number;
      /** Approach speed in pixels per tick. */
      readonly speed: number;
      /** Ticks to hold at the target. */
      readonly hold: number;
      /** Leaving velocity x. */
      readonly leaveVx: number;
      /** Leaving velocity y. */
      readonly leaveVy: number;
    }
  | {
      /** Formation member: replay the formation leader's recorded path with a delay. */
      readonly type: 'follow';
    }
  | {
      /** Walk along the floor / ceiling, turning at walls and edges (ground enemies). */
      readonly type: 'groundCrawl';
      /** Signed walking speed (negative = left). */
      readonly speed: number;
    }
  | {
      /** Steer towards the nearest player with a capped turn rate. */
      readonly type: 'homing';
      /** Pixels per tick. */
      readonly speed: number;
      /** Largest turn per tick, in whole binary-angle units. */
      readonly turnRate: number;
    }
  | {
      /** Hold for `windup` ticks, aim at the nearest player once, then dash straight. */
      readonly type: 'aimedDash';
      /** Dash speed in pixels per tick. */
      readonly speed: number;
      /** Ticks before the dash. */
      readonly windup: number;
    };

/**
 * One enemy (`content/enemies/*.enemies.json`, shmup_feat.md §11). Optional fields of the file
 * get their defaults at load, so every spec has every field.
 */
export interface EnemySpec {
  /** Unique id, referenced by stage events. */
  readonly id: string;
  /** Hit points. */
  readonly hp: number;
  /** Score awarded on death. */
  readonly score: number;
  /** Half-extents of the hurtbox, in pixels (also the contact box against players). */
  readonly hurtbox: BoxSpec;
  /** Behaviour coroutine id (core `behaviors`). */
  readonly script: string;
  /** Resolved {@link ContentDb.scripts} index of {@link EnemySpec.script}. */
  readonly scriptId: number;
  /** Atlas sprite name. */
  readonly sprite: string;
  /** Resolved {@link ContentDb.sprites} index of {@link EnemySpec.sprite}. */
  readonly spriteId: number;
  /** Sprite animation (default: frame 0, still). */
  readonly anim: EnemyAnimSpec;
  /** Behaviour tunables by name (default none; each behaviour documents its names). */
  readonly params: Readonly<Record<string, number>>;
  /** Starting mover (default `null`: none — scripts set one). */
  readonly mover: EnemyMoverSpec | null;
  /** What the enemy drops on death, or `null`. */
  readonly drop: EnemyDrop | null;
  /** Ground anchor, or `null` for a flying enemy (default). */
  readonly ground: EnemyGround | null;
  /** Ticks on screen before the enemy may fire (default {@link DEFAULT_SETTLE_TICKS}). */
  readonly settleTicks: number;
  /** Death explosion size (default `small`). */
  readonly explosion: EnemyExplosion;
  /** Whether the Mega Crash leaves it alive (M1-11; default `false`). */
  readonly megaCrashImmune: boolean;
  /** Enemy a spawner releases (`hatch.spawner`), or `null` (default). */
  readonly child: string | null;
  /** Resolved {@link ContentDb.enemies} index of {@link EnemySpec.child} (-1 = none). */
  readonly childId: number;
  /** Rank modifiers. */
  readonly rank?: EnemyRankSpec;
  /**
   * The boss section (M1-13), or `null` for a regular enemy (default). A boss entry has only an
   * `id` and this section in the file; the loader fills the regular fields for it (`hp` = the
   * cores' total hit points, `score` = `boss.score`, `script` / `sprite` empty with ids -1, a
   * 1-px `hurtbox`, `megaCrashImmune`) — the enemy system never spawns it, `core/bosses` runs it.
   */
  readonly boss: BossSpec | null;
}

/** Most parts one boss may have (shmup_feat.md §13 multi-part bosses; plan M1-13). */
export const MAX_BOSS_PARTS = 16;

/** Most phases one boss may have. */
export const MAX_BOSS_PHASES = 8;

/**
 * When a boss part takes damage (shmup_feat.md §13 weak points): `always`; `afterParts` — only
 * once every part of its `requires` list is destroyed (a core behind shield plates); `whenOpen`
 * — only while its behaviour holds it open (a mouth, a hatch); `never` — armour (every hit
 * `clink`s).
 */
export type BossVulnerability = 'always' | 'afterParts' | 'whenOpen' | 'never';

/** Every {@link BossVulnerability}, in code order (the index is the `core/bosses` code). */
export const BOSS_VULNERABILITIES = Object.freeze([
  'always',
  'afterParts',
  'whenOpen',
  'never',
] as const);

/** Default home position of a boss (playfield pixels, where its intro ends). */
export const DEFAULT_BOSS_X = 296;

/** Default home row of a boss (the playfield's middle). */
export const DEFAULT_BOSS_Y = 100;

/** Default length of a boss's invulnerable intro (the fly-in), in ticks. */
export const DEFAULT_BOSS_INTRO_TICKS = 120;

/**
 * One part of a boss (`boss.parts[]`): a translation from its parent (or from the boss's origin),
 * hit points, a hurtbox, a sprite and its weak-point rule. Parts are listed parents first; later
 * parts are drawn over earlier ones.
 */
export interface BossPartSpec {
  /** Unique name inside the boss (lower-case kebab), e.g. `core`, `plate-top`. */
  readonly name: string;
  /** Name of the part it is attached to (an earlier part), or `null` for the boss's origin. */
  readonly parent: string | null;
  /** Resolved index of {@link BossPartSpec.parent} in `parts` (-1 = the origin). */
  readonly parentIndex: number;
  /** X offset from the parent, in pixels (default 0). */
  readonly x: number;
  /** Y offset from the parent, in pixels (default 0). */
  readonly y: number;
  /** Hit points (default 1; unused by `never` parts). */
  readonly hp: number;
  /** Half-extents of the hurtbox (also the contact box), or `null`: never hit, never touched. */
  readonly hurtbox: BoxSpec | null;
  /** When it takes damage (default `always`). */
  readonly vulnerable: BossVulnerability;
  /** Parts that must be destroyed first (`afterParts` only). */
  readonly requires: readonly string[];
  /** {@link BossPartSpec.requires} as a bit mask of part indices. */
  readonly requiresMask: number;
  /** A core: the boss dies when every core is destroyed (default `false`; at least one). */
  readonly core: boolean;
  /** A gun: the generic boss behaviours fire from it (default `false`). */
  readonly gun: boolean;
  /** Starts open (`whenOpen` parts; default `false`). */
  readonly open: boolean;
  /** Atlas sprite name (omitted: not drawn). */
  readonly sprite?: string;
  /** Resolved {@link ContentDb.sprites} index of {@link BossPartSpec.sprite} (-1 = none). */
  readonly spriteId: number;
  /** Sprite animation (default: frame 0). */
  readonly anim: EnemyAnimSpec;
  /** Points for destroying it (default 0). */
  readonly score: number;
  /** Size of its explosion when destroyed (default `medium`). */
  readonly explosion: EnemyExplosion;
}

/**
 * When a boss phase ends (any condition met ends it; the next phase starts on the same tick).
 */
export interface BossUntilSpec {
  /** The cores' total hit points fell below this. */
  readonly hpBelow?: number;
  /** At least `count` of these parts are destroyed (all of them without `count`). */
  readonly partsDestroyed?: readonly string[];
  /** How many of {@link BossUntilSpec.partsDestroyed} (default: all). */
  readonly count?: number;
  /** The phase has run this many ticks. */
  readonly ticks?: number;
  /** {@link BossUntilSpec.partsDestroyed} as a bit mask (0 when absent). */
  readonly partsMask: number;
}

/** One phase of a boss: the behaviour it runs and when it gives way to the next one. */
export interface BossPhaseSpec {
  /** Boss behaviour id (`core/behaviors` boss roster). */
  readonly script: string;
  /** Resolved {@link ContentDb.scripts} index of {@link BossPhaseSpec.script}. */
  readonly scriptId: number;
  /** The behaviour's tunables by name (default none). */
  readonly params: Readonly<Record<string, number>>;
  /** When the phase ends; `null` for the last phase (it runs until the boss dies). */
  readonly until: BossUntilSpec | null;
}

/**
 * The boss section of an enemy entry (shmup_feat.md §13, plan M1-13): the WARNING text, the
 * intro, the parts and the phase list.
 */
export interface BossSpec {
  /** Code shown by the WARNING, e.g. `HB-01` (upper case, digits, `-`; ≤ 8). */
  readonly code: string;
  /** Name shown by the WARNING, e.g. `HALCYON BULWARK` (upper case; ≤ 24). */
  readonly displayName: string;
  /** Length of the invulnerable fly-in, in ticks (default {@link DEFAULT_BOSS_INTRO_TICKS}). */
  readonly introTicks: number;
  /** Points awarded at the score tally of its death sequence (default 0). */
  readonly score: number;
  /** Home x of the boss's origin in playfield pixels (default {@link DEFAULT_BOSS_X}). */
  readonly x: number;
  /** Home y (default {@link DEFAULT_BOSS_Y}). */
  readonly y: number;
  /** The parts (1–{@link MAX_BOSS_PARTS}), parents first. */
  readonly parts: readonly BossPartSpec[];
  /** The phases (1–{@link MAX_BOSS_PHASES}), in order. */
  readonly phases: readonly BossPhaseSpec[];
}

/** One control point of a path, in pixels relative to where the mover starts. */
export interface PathPointSpec {
  /** X offset. */
  readonly x: number;
  /** Y offset (down is positive). */
  readonly y: number;
}

/**
 * A movement path (`content/paths/*.paths.json`): control points of a centripetal Catmull-Rom
 * spline, baked at load into an arc-length table (plan M1-08).
 */
export interface PathSpec {
  /** Unique id, referenced by stage events and `path` movers. */
  readonly id: string;
  /** Control points (2–64), relative to the start; consecutive points differ. */
  readonly points: readonly PathPointSpec[];
  /** The baked table the `path` mover samples. */
  readonly table: PathTable;
}

/**
 * One camera-path key of a stage (shmup_feat.md §14 "scripted camera path"). Keys are sorted by
 * `x` (strictly increasing, the first at 0); each takes effect when the camera reaches its `x`.
 */
export interface StageCameraKey {
  /** Camera X where the key takes effect. */
  readonly x: number;
  /** Target scroll speed in pixels per tick (0 = scroll stop). */
  readonly speed: number;
  /** Ticks to reach `speed` linearly from the current speed (0 / omitted = at once). */
  readonly ramp?: number;
  /** Vertical pan: world y of the camera's top edge to move to (vertical sections). */
  readonly yTo?: number;
  /** Ticks the vertical pan takes (0 / omitted = at once; needs `yTo`). */
  readonly yTicks?: number;
  /**
   * Scroll lock (bosses): the camera stops exactly at `x` and stays until the runner is
   * unlocked (the boss dies, M1-13); then it scrolls on at `speed`.
   */
  readonly lock?: boolean;
}

/** An invisible restart point (shmup_feat.md §10); sorted by `x`, strictly increasing. */
export interface StageCheckpoint {
  /** Camera X the player restarts at. */
  readonly x: number;
}

/** Which background layer a parallax band is drawn on. */
export type StageParallaxLayerName = 'far' | 'mid';

/**
 * One parallax background band: a sprite repeated every `spacing` pixels along x at playfield row
 * `y`, scrolling at `factor` × the camera (shmup_feat.md §14, integer-snapped by the renderer).
 */
export interface StageParallaxLayer {
  /** `far` (`BG_FAR`) or `mid` (`BG_MID`). */
  readonly layer: StageParallaxLayerName;
  /** Atlas sprite repeated along the band (frame 0). */
  readonly sprite: string;
  /** Resolved {@link ContentDb.sprites} index of {@link StageParallaxLayer.sprite}. */
  readonly spriteId: number;
  /** Scroll factor relative to the camera (0 = static, 1 = playfield speed). */
  readonly factor: number;
  /** Playfield row of the band's top edge (at camera y 0). */
  readonly y: number;
  /** Horizontal repeat distance in pixels (normally the sprite's width). */
  readonly spacing: number;
}

/** Music of a stage (cue names from `MUSIC_CUES`). */
export interface StageMusic {
  /** Cue of the stage theme. */
  readonly stage: string;
  /** Resolved music cue id of {@link StageMusic.stage}. */
  readonly stageId: number;
  /** Cue of the boss theme. */
  readonly boss: string;
  /** Resolved music cue id of {@link StageMusic.boss}. */
  readonly bossId: number;
}

/** One wave profile of a heightfield segment (floor or ceiling). */
export interface HeightfieldProfile {
  /** Average height in pixels, measured from the map's bottom (floor) or top (ceiling). */
  readonly base: number;
  /** Wave amplitude in pixels. */
  readonly amp: number;
  /** Wavelength in pixels. */
  readonly period: number;
  /** Seed of the wave's phases (unsigned 32-bit). */
  readonly seed: number;
}

/** A stretch of generated terrain: `[from, to)` in world pixels. */
export interface HeightfieldSegment {
  /** First world x (pixels). */
  readonly from: number;
  /** End world x (exclusive, > `from`). */
  readonly to: number;
  /** Floor profile (omit for no floor). */
  readonly floor?: HeightfieldProfile;
  /** Ceiling profile (omit for no ceiling). */
  readonly ceiling?: HeightfieldProfile;
}

/** Procedural terrain, expanded deterministically at load (`data/tilemap`). */
export interface HeightfieldSpec {
  /** Generator kind. */
  readonly type: 'heightfield';
  /** Segments, any order. */
  readonly segments: readonly HeightfieldSegment[];
}

/** A stage's terrain block: where its tiles come from. */
export interface StageTilemapSpec {
  /** Tile edge in pixels (8). */
  readonly tileSize: number;
  /** Tileset id (`content/tilesets/`). */
  readonly tileset: string;
  /** Resolved {@link ContentDb.tilesets} index of {@link StageTilemapSpec.tileset}. */
  readonly tilesetId: number;
  /** Map height in tiles (25 = the 200-px playfield). */
  readonly rowsTall: number;
  /** Explicit run-length encoded rows, top to bottom (`"40*0, 3*2"`), applied last. */
  readonly rle?: readonly string[];
  /** Procedural terrain. */
  readonly generator?: HeightfieldSpec;
}

/** A stage's expanded tile grid (built by {@link loadContent}; never in the JSON). */
export interface StageTerrain {
  /** Tile edge in pixels. */
  readonly tileSize: number;
  /** Width in tiles: `ceil((length + PLAYFIELD_W) / tileSize)`. */
  readonly cols: number;
  /** Height in tiles (`rowsTall`). */
  readonly rows: number;
  /** Tile id per cell, row-major; 0 = empty. Shared content — copy it before mutating. */
  readonly tiles: Uint8Array;
  /** {@link ContentDb.tilesets} index. */
  readonly tilesetId: number;
}

/** Spawn one enemy when the camera reaches `x` (`core/enemies` spawns it). */
export interface StageSpawnEvent {
  /** Camera X that fires the event. */
  readonly x: number;
  /** Discriminator. */
  readonly type: 'spawn';
  /** Enemy id. */
  readonly enemy: string;
  /** Resolved {@link ContentDb.enemies} index. */
  readonly enemyId: number;
  /**
   * Spawn y in playfield pixels (camera-relative). Omitted: mid-playfield for a flying enemy;
   * ground enemies snap to the floor / ceiling below / above it.
   */
  readonly y?: number;
  /** Spawn x in playfield pixels (default 400: just beyond the right edge; negative = behind). */
  readonly screenX?: number;
  /** Movement path id (`content/paths/`) for `path` movers and path-following behaviours. */
  readonly path?: string;
  /** Resolved {@link ContentDb.paths} index (-1 = none). */
  readonly pathId: number;
}

/**
 * Spawn a formation: `count` enemies, one every `interval` ticks, all at the same spawn point;
 * killing every member (none escaped) drops a capsule and awards the bonus (`core/enemies`).
 */
export interface StageFormationEvent {
  /** Camera X that fires the event. */
  readonly x: number;
  /** Discriminator. */
  readonly type: 'formation';
  /** Enemy id of every member. */
  readonly enemy: string;
  /** Resolved {@link ContentDb.enemies} index. */
  readonly enemyId: number;
  /** Members (1–64). */
  readonly count: number;
  /** Ticks between two members. */
  readonly interval: number;
  /** Spawn y in playfield pixels (see {@link StageSpawnEvent.y}). */
  readonly y?: number;
  /** Spawn x in playfield pixels (see {@link StageSpawnEvent.screenX}). */
  readonly screenX?: number;
  /** Movement path id. */
  readonly path?: string;
  /** Resolved {@link ContentDb.paths} index (-1 = none). */
  readonly pathId: number;
  /** What the completed formation drops (default `capsule`; `null` = nothing). */
  readonly drop?: EnemyDrop | null;
  /**
   * Bonus points for destroying the whole formation (default 0) — credited to the player who kills
   * its last member (`core/scoring`, M1-12).
   */
  readonly bonus?: number;
}

/**
 * Start a boss (shmup_feat.md §13, M1-13): `warning` plays the WARNING sequence (the camera brakes
 * to a lock, 180 ticks of siren and text) and then the boss flies in; `boss` brings it in at once.
 */
export interface StageBossEvent {
  /** Camera X that fires the event. */
  readonly x: number;
  /** Discriminator. */
  readonly type: 'boss' | 'warning';
  /** Boss enemy id (an entry with a `boss` section). */
  readonly enemy: string;
  /** Resolved {@link ContentDb.enemies} index. */
  readonly enemyId: number;
}

/** Change the music track. */
export interface StageMusicEvent {
  /** Camera X that fires the event. */
  readonly x: number;
  /** Discriminator. */
  readonly type: 'music';
  /** Cue name from `MUSIC_CUES`. */
  readonly cue: string;
  /** Resolved music cue id. */
  readonly cueId: number;
}

/** Change the scroll speed between camera keys (scripted sections, high-speed runs). */
export interface StageSpeedEvent {
  /** Camera X that fires the event. */
  readonly x: number;
  /** Discriminator. */
  readonly type: 'speed';
  /** New target speed in pixels per tick. */
  readonly speed: number;
  /** Ticks to reach it (0 / omitted = at once). */
  readonly ramp?: number;
}

/** Set or clear a named stage flag (in-stage branches, M2). */
export interface StageFlagEvent {
  /** Camera X that fires the event. */
  readonly x: number;
  /** Discriminator. */
  readonly type: 'flag';
  /** Flag name (per stage). */
  readonly flag: string;
  /** Index of the flag in {@link StageSpec.flagNames} (its bit in the runner's `flags`). */
  readonly flagId: number;
  /** `true` (default) sets the flag, `false` clears it. */
  readonly value?: boolean;
}

/** The end of the stage (stage clear). */
export interface StageEndEvent {
  /** Camera X that fires the event. */
  readonly x: number;
  /** Discriminator. */
  readonly type: 'end';
}

/** One entry of a stage timeline, fired when the camera reaches its `x`. */
export type StageEvent =
  | StageSpawnEvent
  | StageFormationEvent
  | StageBossEvent
  | StageMusicEvent
  | StageSpeedEvent
  | StageFlagEvent
  | StageEndEvent;

/** Every stage event `type`, in schema order. */
export const STAGE_EVENT_TYPES = Object.freeze([
  'spawn',
  'formation',
  'warning',
  'boss',
  'music',
  'speed',
  'flag',
  'end',
] as const);

/** Most distinct flags one stage may use (they are bits of one 32-bit mask). */
export const MAX_STAGE_FLAGS = 32;

/** One stage/zone (`content/stages/*.stage.json`, shmup_feat.md §14). */
export interface StageSpec {
  /** Unique id, referenced by the zone map. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Stage and boss music. */
  readonly music: StageMusic;
  /** Camera-X length in pixels (the camera never scrolls past it). */
  readonly length: number;
  /** Camera path keys, sorted by `x` (the first at 0). */
  readonly camera: readonly StageCameraKey[];
  /** Restart points, sorted by `x`. */
  readonly checkpoints: readonly StageCheckpoint[];
  /** Background bands, far to near. */
  readonly parallax: readonly StageParallaxLayer[];
  /** Terrain block, or `null` for an open-space stage. */
  readonly tilemap: StageTilemapSpec | null;
  /** Timeline, sorted by `x` (several events may share one `x`; they fire in file order). */
  readonly events: readonly StageEvent[];
  /** Distinct flag names of the `flag` events, sorted (a flag's index is its bit). */
  readonly flagNames: readonly string[];
  /** The expanded tile grid (`null` without a tilemap or when it failed to expand). */
  readonly terrain: StageTerrain | null;
}

/** Collision type of a tile (shmup_feat.md §14): the index is the `TerrainType` code. */
export type TileType = 'empty' | 'solid' | 'hazard';

/** Every {@link TileType}, in code order. */
export const TILE_TYPES = Object.freeze(['empty', 'solid', 'hazard'] as const);

/** Edge a tile's column heights grow from: the index is the `TerrainAnchor` code. */
export type TileAnchor = 'floor' | 'ceiling';

/** Every {@link TileAnchor}, in code order. */
export const TILE_ANCHORS = Object.freeze(['floor', 'ceiling'] as const);

/** Tile edge in pixels every tileset and tilemap uses (M1). */
export const TILE_SIZE = 8;

/** One tile of a tileset. */
export interface TileSpec {
  /** Name, unique inside the tileset (`solid`, `floor`, `slope-up` …). */
  readonly name: string;
  /** Collision type (`empty` = decoration only). */
  readonly type: TileType;
  /** Frame of the tileset sprite that draws the tile. */
  readonly frame: number;
  /** Edge the heights grow from. */
  readonly anchor: TileAnchor;
  /** Solid height of every pixel column (`tileSize` entries, 0 … tileSize). */
  readonly mask: readonly number[];
}

/**
 * A terrain tileset (`content/tilesets/*.tileset.json`): collision shape and art frame of every
 * tile id. Tile id `i + 1` is `tiles[i]`; id 0 is the empty cell.
 */
export interface TilesetSpec {
  /** Unique id, referenced by `stage.tilemap.tileset`. */
  readonly id: string;
  /** Atlas sprite whose frames draw the tiles. */
  readonly sprite: string;
  /** Resolved {@link ContentDb.sprites} index of {@link TilesetSpec.sprite}. */
  readonly spriteId: number;
  /** Tile edge in pixels (8). */
  readonly tileSize: number;
  /** The tiles (at most 255). */
  readonly tiles: readonly TileSpec[];
  /** Lookup tables by tile id (built at load). */
  readonly tables: TilesetTables;
}

/**
 * Interned string ids: `names[i]` is the name of index `i`.
 *
 * @remarks
 * Used for names the content only *mentions* (atlas sprites, behaviour scripts): every
 * distinct name referenced by any file gets an index, whether or not something defines it.
 * Later steps check the names against their registries (M1-03 the atlas, M1-08 the
 * behaviour table).
 */
export interface StringTable {
  /** Names in ascending order (so indices do not depend on file order). */
  readonly names: readonly string[];
  /** Name → index. */
  readonly index: ReadonlyMap<string, number>;
}

/**
 * Everything the simulation needs from `content/`, with string ids already resolved.
 *
 * @remarks
 * Built once at boot by {@link loadContent} and handed to `createGame`. Systems keep the
 * numeric indices (`spriteId`, `enemyId`, …) and index the arrays per tick; the `…Index`
 * maps are for load-time lookups only (convention 1.5: no string lookups per tick). Lists
 * are in the order their files sort by path, then in document order.
 */
export interface ContentDb {
  /**
   * Atlas sprite names used by content, plus `LoadContentOptions.extraSprites` (the engine's own
   * sprites); `pnpm content:check` checks them against the atlas.
   */
  readonly sprites: StringTable;
  /** Behaviour/script ids used by content (M1-08 registers the implementations). */
  readonly scripts: StringTable;
  /** Player ships, in file order. */
  readonly ships: readonly PlayerShipSpec[];
  /** Ship id → {@link ContentDb.ships} index. */
  readonly shipIndex: ReadonlyMap<string, number>;
  /** Weapons, in file order. */
  readonly weapons: readonly WeaponSpec[];
  /** Weapon id → {@link ContentDb.weapons} index. */
  readonly weaponIndex: ReadonlyMap<string, number>;
  /** Meter-mode loadouts, in file order. */
  readonly weaponPresets: readonly WeaponPresetSpec[];
  /** Preset id → {@link ContentDb.weaponPresets} index. */
  readonly weaponPresetIndex: ReadonlyMap<string, number>;
  /** Enemies, in file order. */
  readonly enemies: readonly EnemySpec[];
  /** Enemy id → {@link ContentDb.enemies} index. */
  readonly enemyIndex: ReadonlyMap<string, number>;
  /** Movement paths, in file order. */
  readonly paths: readonly PathSpec[];
  /** Path id → {@link ContentDb.paths} index. */
  readonly pathIndex: ReadonlyMap<string, number>;
  /** Stages, in file order. */
  readonly stages: readonly StageSpec[];
  /** Stage id → {@link ContentDb.stages} index. */
  readonly stageIndex: ReadonlyMap<string, number>;
  /** Terrain tilesets, in file order. */
  readonly tilesets: readonly TilesetSpec[];
  /** Tileset id → {@link ContentDb.tilesets} index. */
  readonly tilesetIndex: ReadonlyMap<string, number>;
}

/** Options of {@link loadContent}. */
export interface LoadContentOptions {
  /**
   * Script ids the engine implements (enemy behaviours and weapon behaviours share the
   * {@link ContentDb.scripts} table — pass `core/behaviors` `KNOWN_SCRIPT_IDS`). When given,
   * content referring to an unknown script reports an issue; when omitted, script ids are only
   * interned.
   */
  readonly knownScripts?: readonly string[] | ReadonlySet<string>;
  /** Migration table; defaults to {@link CONTENT_MIGRATIONS} (tests inject their own). */
  readonly migrations?: ContentMigrationTable;
  /**
   * Sprite names the engine draws on its own (core `world` `ENGINE_SPRITES`: enemy bullets and
   * laser beams, plan M1-09), interned into {@link ContentDb.sprites} even though no content file
   * mentions them — so the World resolves them to sprite ids and the atlas check of
   * `pnpm content:check` covers them. Hosts pass `ENGINE_SPRITES` (the shell's loader does by
   * default); omitted, the engine's sprites are not in the table and are not drawn.
   */
  readonly extraSprites?: readonly string[];
}

/** What {@link loadContent} produces. */
export interface LoadContentResult {
  /** The resolved database (partial when `issues` is non-empty — bad files are skipped). */
  readonly db: ContentDb;
  /**
   * Every problem found: header, migration, schema and duplicate-id problems in file then
   * document order, followed by the reference problems of the second pass (same order).
   * Empty means the content is sound.
   */
  readonly issues: readonly ValidationIssue[];
  /** Files whose `kind` this module does not own, untouched, in path order. */
  readonly foreign: readonly ContentFile[];
}

/**
 * The `formatVersion` field shared by every file schema. Each file schema adds its own
 * `kind: s.enumOf([...])`; by the time a body reaches it, migration has already raised the
 * version to {@link CONTENT_FORMAT_VERSION}.
 */
const HEADER_SHAPE = {
  formatVersion: s.int({ min: CONTENT_FORMAT_VERSION, max: CONTENT_FORMAT_VERSION }),
} as const;

/** Half-extent box with integer pixels. */
const BOX_SCHEMA = s.object({ hw: s.int({ min: 1, max: 512 }), hh: s.int({ min: 1, max: 512 }) });

/** Playfield margins in whole pixels. */
const MARGIN_SCHEMA = s.object({
  left: s.int({ min: 0, max: 192 }),
  right: s.int({ min: 0, max: 192 }),
  top: s.int({ min: 0, max: 100 }),
  bottom: s.int({ min: 0, max: 100 }),
});

/** One entry of `ships` in a `player` file. */
const SHIP_SCHEMA: Schema<Omit<PlayerShipSpec, 'spriteId'>> = s.object({
  id: s.str(),
  name: s.str(),
  sprite: s.ref('sprite'),
  speeds: s.array(s.num({ min: 0.1, max: 16 }), { min: 1, max: 16 }),
  hurtRadius: s.num({ min: 0.25, max: 16 }),
  terrainBox: BOX_SCHEMA,
  pickupBox: BOX_SCHEMA,
  margins: MARGIN_SCHEMA,
  enterTicks: s.int({ min: 0, max: 600 }),
  respawnInvulnTicks: s.int({ min: 0, max: 600 }),
  bankFrames: s.int({ min: 0, max: 8 }),
});

/** A `content/player/*.player.json` file. */
const PLAYER_FILE_SCHEMA = s.object({
  ...HEADER_SHAPE,
  kind: s.enumOf(['player'] as const),
  ships: s.array(SHIP_SCHEMA, { min: 1 }),
});

/** One entry of `weapons` in a `weapons` file. */
const WEAPON_SCHEMA: Schema<Omit<WeaponSpec, 'behaviorId' | 'spriteId' | 'sfxId'>> = s.object(
  {
    id: s.str(),
    slot: s.enumOf(WEAPON_SLOTS),
    behavior: s.ref('script'),
    damage: s.int({ min: 0, max: 9999 }),
    speed: s.num({ min: 0, max: 64 }),
    cap: s.int({ min: 1, max: 64 }),
    pierce: s.bool(),
    sprite: s.ref('sprite'),
    refireTicks: s.int({ min: 1, max: 600 }),
    sfx: s.nullable(s.ref('sfx')),
    params: s.record(s.num(), /^[a-zA-Z][a-zA-Z0-9]*$/),
  },
  { optional: ['refireTicks', 'sfx', 'params'] },
);

/** One entry of `presets` in a `weapons` file. */
const WEAPON_PRESET_SCHEMA: Schema<
  Omit<WeaponPresetSpec, 'mainId' | 'missileId' | 'doubleId' | 'laserId'>
> = s.object(
  {
    id: s.str(),
    main: s.nullable(s.ref('weapon')),
    missile: s.nullable(s.ref('weapon')),
    double: s.nullable(s.ref('weapon')),
    laser: s.nullable(s.ref('weapon')),
  },
  { optional: ['main'] },
);

/** A `content/weapons/*.weapons.json` file. */
const WEAPONS_FILE_SCHEMA = s.object(
  {
    ...HEADER_SHAPE,
    kind: s.enumOf(['weapons'] as const),
    weapons: s.array(WEAPON_SCHEMA, { min: 1 }),
    presets: s.array(WEAPON_PRESET_SCHEMA),
  },
  { optional: ['presets'] },
);

/** A velocity component in pixels per tick. */
const VELOCITY = s.num({ min: -16, max: 16 });

/** A positive speed in pixels per tick. */
const MOVER_SPEED = s.num({ min: 0, max: 16 });

/** An enemy's starting mover. */
const MOVER_SCHEMA: Schema<Omit<EnemyMoverSpec, 'pathId'>> = s.oneOf('type', {
  straight: s.object({ type: s.enumOf(['straight'] as const), vx: VELOCITY, vy: VELOCITY }),
  sine: s.object(
    {
      type: s.enumOf(['sine'] as const),
      vx: VELOCITY,
      amp: s.num({ min: 0, max: 256 }),
      period: s.int({ min: 1, max: 36000 }),
      phase: s.int({ min: 0, max: 1023 }),
    },
    { optional: ['phase'] },
  ),
  path: s.object(
    { type: s.enumOf(['path'] as const), path: s.ref('path'), speed: MOVER_SPEED },
    { optional: ['path'] },
  ),
  waypoint: s.object({
    type: s.enumOf(['waypoint'] as const),
    x: s.num({ min: -64, max: 448 }),
    y: s.num({ min: -64, max: 264 }),
    speed: s.num({ min: 0.01, max: 16 }),
    hold: s.int({ min: 0, max: 36000 }),
    leaveVx: VELOCITY,
    leaveVy: VELOCITY,
  }),
  follow: s.object({ type: s.enumOf(['follow'] as const) }),
  groundCrawl: s.object({ type: s.enumOf(['groundCrawl'] as const), speed: VELOCITY }),
  homing: s.object({
    type: s.enumOf(['homing'] as const),
    speed: MOVER_SPEED,
    turnRate: s.int({ min: 0, max: 512 }),
  }),
  aimedDash: s.object({
    type: s.enumOf(['aimedDash'] as const),
    speed: MOVER_SPEED,
    windup: s.int({ min: 0, max: 36000 }),
  }),
});

/** A boss part name (lower-case kebab). */
const PART_NAME = s.str({ maxLength: 32, pattern: /^[a-z][a-z0-9-]*$/ });

/** A sprite animation (`frames` frames, `ticks` ticks each). */
const ANIM_SCHEMA = s.object({
  frames: s.int({ min: 1, max: 64 }),
  ticks: s.int({ min: 1, max: 600 }),
});

/** Behaviour tunables by name. */
const PARAMS_SCHEMA = s.record(s.num(), /^[a-zA-Z][a-zA-Z0-9]*$/);

/** One entry of `boss.parts` (optional fields get their defaults at load). */
const BOSS_PART_SCHEMA = s.object(
  {
    name: PART_NAME,
    parent: PART_NAME,
    x: s.num({ min: -512, max: 512 }),
    y: s.num({ min: -512, max: 512 }),
    hp: s.int({ min: 1, max: 100000 }),
    hurtbox: BOX_SCHEMA,
    vulnerable: s.enumOf(BOSS_VULNERABILITIES),
    requires: s.array(PART_NAME, { min: 1, max: MAX_BOSS_PARTS }),
    core: s.bool(),
    gun: s.bool(),
    open: s.bool(),
    sprite: s.ref('sprite'),
    anim: ANIM_SCHEMA,
    score: s.int({ min: 0, max: 1000000 }),
    explosion: s.enumOf(ENEMY_EXPLOSIONS),
  },
  {
    optional: [
      'parent',
      'x',
      'y',
      'hp',
      'hurtbox',
      'vulnerable',
      'requires',
      'core',
      'gun',
      'open',
      'sprite',
      'anim',
      'score',
      'explosion',
    ],
  },
);

/** One entry of `boss.phases`. */
const BOSS_PHASE_SCHEMA = s.object(
  {
    script: s.ref('script'),
    params: PARAMS_SCHEMA,
    until: s.object(
      {
        hpBelow: s.int({ min: 1, max: 1600000 }),
        partsDestroyed: s.array(PART_NAME, { min: 1, max: MAX_BOSS_PARTS }),
        count: s.int({ min: 1, max: MAX_BOSS_PARTS }),
        ticks: s.int({ min: 1, max: 36000 }),
      },
      { optional: ['hpBelow', 'partsDestroyed', 'count', 'ticks'] },
    ),
  },
  { optional: ['params', 'until'] },
);

/** The `boss` section of an enemy entry. */
const BOSS_SCHEMA = s.object(
  {
    code: s.str({ maxLength: 8, pattern: /^[A-Z0-9][A-Z0-9-]*$/ }),
    displayName: s.str({ maxLength: 24, pattern: /^[A-Z0-9][A-Z0-9 .'-]*$/ }),
    introTicks: s.int({ min: 0, max: 600 }),
    score: s.int({ min: 0, max: 10000000 }),
    x: s.num({ min: 0, max: PLAYFIELD_W }),
    y: s.num({ min: 0, max: PLAYFIELD_H }),
    parts: s.array(BOSS_PART_SCHEMA, { min: 1, max: MAX_BOSS_PARTS }),
    phases: s.array(BOSS_PHASE_SCHEMA, { min: 1, max: MAX_BOSS_PHASES }),
  },
  { optional: ['introTicks', 'score', 'x', 'y'] },
);

/**
 * The fields a regular enemy must have (they are optional in the schema because a boss entry
 * omits them — {@link completeEnemy} reports them).
 */
const ENEMY_REQUIRED = Object.freeze([
  'hp',
  'score',
  'hurtbox',
  'script',
  'sprite',
  'drop',
] as const);

/** The fields a boss entry must leave out (the loader fills them from the `boss` section). */
const BOSS_OMITTED = Object.freeze([
  'hp',
  'score',
  'hurtbox',
  'script',
  'sprite',
  'anim',
  'params',
  'mover',
  'drop',
  'ground',
  'settleTicks',
  'explosion',
  'megaCrashImmune',
  'child',
  'rank',
] as const);

/** One entry of `enemies` in an `enemies` file (optional fields are filled in by the loader). */
const ENEMY_SCHEMA = s.object(
  {
    id: s.str(),
    hp: s.int({ min: 1, max: 100000 }),
    score: s.int({ min: 0, max: 1000000 }),
    hurtbox: BOX_SCHEMA,
    script: s.ref('script'),
    sprite: s.ref('sprite'),
    anim: ANIM_SCHEMA,
    params: PARAMS_SCHEMA,
    mover: s.nullable(MOVER_SCHEMA),
    drop: s.nullable(s.enumOf(ENEMY_DROPS)),
    ground: s.nullable(s.enumOf(ENEMY_GROUNDS)),
    settleTicks: s.int({ min: 0, max: 36000 }),
    explosion: s.enumOf(ENEMY_EXPLOSIONS),
    megaCrashImmune: s.bool(),
    child: s.nullable(s.ref('enemy')),
    rank: s.object(
      { fireRate: s.num({ min: 0, max: 8 }), bulletSpeed: s.num({ min: 0, max: 8 }) },
      { optional: ['fireRate', 'bulletSpeed'] },
    ),
    boss: BOSS_SCHEMA,
  },
  {
    optional: [
      // Required for regular enemies, left out by bosses: `completeEnemy` checks them.
      'hp',
      'score',
      'hurtbox',
      'script',
      'sprite',
      'drop',
      'boss',
      'anim',
      'params',
      'mover',
      'ground',
      'settleTicks',
      'explosion',
      'megaCrashImmune',
      'child',
      'rank',
    ],
  },
);

/** A `content/enemies/*.enemies.json` file. */
const ENEMIES_FILE_SCHEMA = s.object({
  ...HEADER_SHAPE,
  kind: s.enumOf(['enemies'] as const),
  enemies: s.array(ENEMY_SCHEMA, { min: 1 }),
});

/** A path control-point coordinate in pixels. */
const PATH_COORD = s.num({ min: -4096, max: 4096 });

/**
 * The shape of one path control point, built by adding the keys to an empty object instead of
 * writing an `{ x, y }` literal.
 *
 * @remarks
 * V8 shares hidden classes between object literals with the same number of keys in the same
 * order: an `{ x: <schema>, y: <schema> }` literal would turn the fields of every `{ x, y }`
 * literal holding numbers (cameras, points in hot code) "tagged", and each fractional write to
 * them would then allocate a heap number (see `docs/dev/stage-runtime.md` gotchas).
 */
const PATH_POINT_SHAPE: { x: Schema<number>; y: Schema<number> } = Object.create(
  Object.prototype,
) as { x: Schema<number>; y: Schema<number> };
PATH_POINT_SHAPE.x = PATH_COORD;
PATH_POINT_SHAPE.y = PATH_COORD;

/** One entry of `paths` in a `paths` file. */
const PATH_SCHEMA = s.object({
  id: s.str(),
  points: s.array(s.object(PATH_POINT_SHAPE), { min: 2, max: 64 }),
});

/** A `content/paths/*.paths.json` file. */
const PATHS_FILE_SCHEMA = s.object({
  ...HEADER_SHAPE,
  kind: s.enumOf(['paths'] as const),
  paths: s.array(PATH_SCHEMA, { min: 1 }),
});

/** Camera-X of a timeline entry. */
const EVENT_X = s.num({ min: 0, max: 1000000 });

/** Scroll speed in pixels per tick. */
const SPEED = s.num({ min: 0, max: 16 });

/** A ramp or pan length in ticks. */
const TICKS = s.int({ min: 0, max: 36000 });

/** Spawn y in playfield pixels. */
const SPAWN_Y = s.num({ min: -64, max: 320 });

/** Spawn x in playfield pixels. */
const SPAWN_SCREEN_X = s.num({ min: -128, max: 512 });

/** One entry of `events` in a `stage` file. */
const STAGE_EVENT_SCHEMA: Schema<Omit<StageEvent, 'enemyId' | 'cueId' | 'flagId' | 'pathId'>> =
  s.oneOf('type', {
    spawn: s.object(
      {
        x: EVENT_X,
        type: s.enumOf(['spawn'] as const),
        enemy: s.ref('enemy'),
        y: SPAWN_Y,
        screenX: SPAWN_SCREEN_X,
        path: s.ref('path'),
      },
      { optional: ['y', 'screenX', 'path'] },
    ),
    formation: s.object(
      {
        x: EVENT_X,
        type: s.enumOf(['formation'] as const),
        enemy: s.ref('enemy'),
        count: s.int({ min: 1, max: 64 }),
        interval: s.int({ min: 1, max: 600 }),
        y: SPAWN_Y,
        screenX: SPAWN_SCREEN_X,
        path: s.ref('path'),
        drop: s.nullable(s.enumOf(ENEMY_DROPS)),
        bonus: s.int({ min: 0, max: 1000000 }),
      },
      { optional: ['y', 'screenX', 'path', 'drop', 'bonus'] },
    ),
    warning: s.object({ x: EVENT_X, type: s.enumOf(['warning'] as const), enemy: s.ref('enemy') }),
    boss: s.object({ x: EVENT_X, type: s.enumOf(['boss'] as const), enemy: s.ref('enemy') }),
    music: s.object({ x: EVENT_X, type: s.enumOf(['music'] as const), cue: s.ref('music') }),
    speed: s.object(
      { x: EVENT_X, type: s.enumOf(['speed'] as const), speed: SPEED, ramp: TICKS },
      { optional: ['ramp'] },
    ),
    flag: s.object(
      {
        x: EVENT_X,
        type: s.enumOf(['flag'] as const),
        flag: s.str({ maxLength: 64, pattern: /^[a-z][a-z0-9-]*$/ }),
        value: s.bool(),
      },
      { optional: ['value'] },
    ),
    end: s.object({ x: EVENT_X, type: s.enumOf(['end'] as const) }),
  });

/** One wave profile of a heightfield segment. */
const HEIGHTFIELD_PROFILE_SCHEMA = s.object({
  base: s.num({ min: 0, max: 2048 }),
  amp: s.num({ min: 0, max: 1024 }),
  period: s.num({ min: 16, max: 65536 }),
  seed: s.int({ min: 0, max: 0xffffffff }),
});

/** A `stage.tilemap` block. */
const TILEMAP_SCHEMA: Schema<Omit<StageTilemapSpec, 'tilesetId'>> = s.object(
  {
    tileSize: s.int({ min: TILE_SIZE, max: TILE_SIZE }),
    tileset: s.ref('tileset'),
    rowsTall: s.int({ min: 1, max: 255 }),
    rle: s.array(s.str({ minLength: 0, maxLength: 100000 }), { max: 255 }),
    generator: s.object({
      type: s.enumOf(['heightfield'] as const),
      segments: s.array(
        s.object(
          {
            from: s.int({ min: 0, max: 1000000 }),
            to: s.int({ min: 1, max: 1001000 }),
            floor: HEIGHTFIELD_PROFILE_SCHEMA,
            ceiling: HEIGHTFIELD_PROFILE_SCHEMA,
          },
          { optional: ['floor', 'ceiling'] },
        ),
        { min: 1, max: 256 },
      ),
    }),
  },
  { optional: ['rle', 'generator'] },
);

/** A `content/stages/*.stage.json` file. */
const STAGE_FILE_SCHEMA = s.object({
  ...HEADER_SHAPE,
  kind: s.enumOf(['stage'] as const),
  id: s.str(),
  name: s.str(),
  music: s.object({ stage: s.ref('music'), boss: s.ref('music') }),
  length: s.int({ min: 1, max: 1000000 }),
  camera: s.array(
    s.object(
      {
        x: EVENT_X,
        speed: SPEED,
        ramp: TICKS,
        yTo: s.num({ min: 0, max: 4096 }),
        yTicks: TICKS,
        lock: s.bool(),
      },
      { optional: ['ramp', 'yTo', 'yTicks', 'lock'] },
    ),
    { min: 1 },
  ),
  checkpoints: s.array(s.object({ x: EVENT_X })),
  parallax: s.array(
    s.object({
      layer: s.enumOf(['far', 'mid'] as const),
      sprite: s.ref('sprite'),
      factor: s.num({ min: 0, max: 4 }),
      y: s.num({ min: -512, max: 512 }),
      spacing: s.int({ min: 8, max: 1024 }),
    }),
    { max: 8 },
  ),
  tilemap: s.nullable(TILEMAP_SCHEMA),
  events: s.array(STAGE_EVENT_SCHEMA),
});

/** One entry of `tiles` in a `tileset` file. */
const TILE_SCHEMA: Schema<TileSpec> = s.object({
  name: s.str({ maxLength: 64 }),
  type: s.enumOf(TILE_TYPES),
  frame: s.int({ min: 0, max: 1023 }),
  anchor: s.enumOf(TILE_ANCHORS),
  mask: s.array(s.int({ min: 0, max: 64 }), { min: 1, max: 64 }),
});

/** A `content/tilesets/*.tileset.json` file (one tileset per file). */
const TILESET_FILE_SCHEMA = s.object({
  ...HEADER_SHAPE,
  kind: s.enumOf(['tileset'] as const),
  id: s.str(),
  sprite: s.ref('sprite'),
  tileSize: s.int({ min: TILE_SIZE, max: TILE_SIZE }),
  tiles: s.array(TILE_SCHEMA, { min: 1, max: 255 }),
});

/** Mutable working copy of a {@link ContentDb} while a load runs. */
interface DbBuilder {
  /** Collected player ships (see {@link ContentDb.ships}). */
  ships: PlayerShipSpec[];
  /** Ship id → position in {@link DbBuilder.ships}. */
  shipIndex: Map<string, number>;
  /** Collected weapons. */
  weapons: WeaponSpec[];
  /** Weapon id → position in {@link DbBuilder.weapons}. */
  weaponIndex: Map<string, number>;
  /** Collected meter-mode presets. */
  weaponPresets: WeaponPresetSpec[];
  /** Preset id → position in {@link DbBuilder.weaponPresets}. */
  weaponPresetIndex: Map<string, number>;
  /** Collected enemies. */
  enemies: EnemySpec[];
  /** Enemy id → position in {@link DbBuilder.enemies}. */
  enemyIndex: Map<string, number>;
  /** Collected paths. */
  paths: PathSpec[];
  /** Path id → position in {@link DbBuilder.paths}. */
  pathIndex: Map<string, number>;
  /** Collected stages. */
  stages: StageSpec[];
  /** Stage id → position in {@link DbBuilder.stages}. */
  stageIndex: Map<string, number>;
  /** Repo-relative file path of every collected stage (issue paths of the terrain pass). */
  stagePaths: string[];
  /** Issue path (`<file>:enemies[i]`) of every collected enemy (the boss reference pass). */
  enemyPaths: string[];
  /** Collected tilesets. */
  tilesets: TilesetSpec[];
  /** Tileset id → position in {@link DbBuilder.tilesets}. */
  tilesetIndex: Map<string, number>;
}

/** Empty {@link StringTable}. */
const EMPTY_STRING_TABLE: StringTable = Object.freeze({
  names: Object.freeze([]),
  index: new Map<string, number>(),
});

/**
 * An empty database — what {@link createGame} uses when no content is supplied.
 *
 * @remarks
 * Frozen and shared: every lookup misses, so systems fall back to their defaults. The
 * arrays are frozen; the `Map`s are typed `ReadonlyMap` but are ordinary maps at runtime —
 * never cast them to `Map` and write to them, or every game created without content sees
 * the change.
 */
export const EMPTY_CONTENT_DB: ContentDb = Object.freeze({
  sprites: EMPTY_STRING_TABLE,
  scripts: EMPTY_STRING_TABLE,
  ships: Object.freeze([]),
  shipIndex: new Map<string, number>(),
  weapons: Object.freeze([]),
  weaponIndex: new Map<string, number>(),
  weaponPresets: Object.freeze([]),
  weaponPresetIndex: new Map<string, number>(),
  enemies: Object.freeze([]),
  enemyIndex: new Map<string, number>(),
  paths: Object.freeze([]),
  pathIndex: new Map<string, number>(),
  stages: Object.freeze([]),
  stageIndex: new Map<string, number>(),
  tilesets: Object.freeze([]),
  tilesetIndex: new Map<string, number>(),
});

/** `Object.prototype.hasOwnProperty` (Chromium 69 has no `Object.hasOwn`). */
const hasOwn = (target: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(target, key);

/**
 * Prefixes a JSON path with the file it came from.
 *
 * @param file - Repo-relative file path.
 * @param path - JSON path inside the file (`''` for the whole document).
 * @returns `file` or `file:path`.
 */
const at = (file: string, path: string): string => (path === '' ? file : file + ':' + path);

/**
 * Tests whether a string names a kind this module owns.
 *
 * @param kind - The `kind` field of a content file.
 * @returns `true` for {@link CONTENT_KINDS} members.
 *
 * @example
 * ```ts
 * isContentKind('weapons'); // → true
 * isContentKind('input-profiles'); // → false (loadContent returns such files in `foreign`)
 * ```
 */
export function isContentKind(kind: string): kind is ContentKind {
  return (CONTENT_KINDS as readonly string[]).indexOf(kind) >= 0;
}

/**
 * Adds one entry to a kind's list, reporting duplicate ids.
 *
 * @param list - Target list.
 * @param index - Target id → position map.
 * @param entry - The entry (its `id` must be unique across all files of the kind).
 * @param idPath - Issue path of the entry's `id` field (`<file>:<json path>`, built with `at`).
 * @param kind - Name used in the duplicate message.
 * @param issues - Collector.
 */
function addEntry<T extends { readonly id: string }>(
  list: T[],
  index: Map<string, number>,
  entry: T,
  idPath: string,
  kind: string,
  issues: ValidationIssue[],
): void {
  if (index.has(entry.id)) {
    issues.push({ path: idPath, message: 'duplicate ' + kind + ' id "' + entry.id + '"' });
    return;
  }
  index.set(entry.id, list.length);
  list.push(entry);
}

/**
 * Builds a sorted {@link StringTable} from interned names.
 *
 * @param names - The collected names (order irrelevant).
 * @returns The table; indices follow the ascending name order, so they do not depend on
 *   which file mentioned a name first.
 */
function buildStringTable(names: Set<string>): StringTable {
  const sorted: string[] = [];
  names.forEach((name) => sorted.push(name));
  sorted.sort();
  const index = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) index.set(sorted[i], i);
  return { names: sorted, index };
}

/**
 * Reads and validates the `kind` / `formatVersion` header of one file.
 *
 * @param file - The file.
 * @param issues - Collector.
 * @returns The header, or `undefined` when the file is not a usable content document.
 */
function readHeader(file: ContentFile, issues: ValidationIssue[]): ContentFileHeader | undefined {
  const data = file.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    issues.push({ path: file.path, message: 'must be a JSON object' });
    return undefined;
  }
  const record = data as Record<string, unknown>;
  const kind = record['kind'];
  const formatVersion = record['formatVersion'];
  if (typeof kind !== 'string' || kind === '') {
    issues.push({ path: at(file.path, 'kind'), message: 'must be a non-empty string' });
    return undefined;
  }
  if (typeof formatVersion !== 'number' || !Number.isInteger(formatVersion) || formatVersion < 0) {
    issues.push({ path: at(file.path, 'formatVersion'), message: 'must be an integer >= 0' });
    return undefined;
  }
  return { kind, formatVersion };
}

/**
 * Migrates a file body up to {@link CONTENT_FORMAT_VERSION}.
 *
 * @param file - The file (for issue paths).
 * @param kind - Content kind.
 * @param from - The file's `formatVersion`.
 * @param migrations - Table to use.
 * @param issues - Collector.
 * @returns The migrated body, or `undefined` when no migration path exists.
 */
function migrate(
  file: ContentFile,
  kind: ContentKind,
  from: number,
  migrations: ContentMigrationTable,
  issues: ValidationIssue[],
): unknown {
  if (from > CONTENT_FORMAT_VERSION) {
    issues.push({
      path: at(file.path, 'formatVersion'),
      message:
        'formatVersion ' +
        String(from) +
        ' is newer than this build reads (' +
        String(CONTENT_FORMAT_VERSION) +
        ')',
    });
    return undefined;
  }
  let data = file.data as Record<string, unknown>;
  for (let version = from; version < CONTENT_FORMAT_VERSION; version++) {
    const step = migrations[kind]?.[version];
    if (step === undefined) {
      issues.push({
        path: at(file.path, 'formatVersion'),
        message: 'no migration for ' + kind + ' from formatVersion ' + String(version),
      });
      return undefined;
    }
    data = step(data);
    data['formatVersion'] = version + 1;
  }
  return data;
}

/**
 * Resolves one recorded reference and writes the numeric index into `<field>Id`.
 *
 * @param site - The reference.
 * @param db - The builder holding the per-kind indices.
 * @param sprites - Interned sprite table.
 * @param scripts - Interned script table.
 * @param knownScripts - Script ids the engine implements, or `null` to skip the check.
 * @param issues - Collector.
 */
function resolveRef(
  site: RefSite,
  db: DbBuilder,
  sprites: StringTable,
  scripts: StringTable,
  knownScripts: ReadonlySet<string> | null,
  issues: ValidationIssue[],
): void {
  const target = site.container;
  const field = site.field + 'Id';
  if (site.id === null) {
    target[field] = -1;
    return;
  }
  const id = site.id;
  let resolved: number | undefined;
  switch (site.kind) {
    case 'sprite':
      resolved = sprites.index.get(id);
      break;
    case 'script':
      resolved = scripts.index.get(id);
      if (knownScripts !== null && !knownScripts.has(id)) {
        issues.push({ path: site.path, message: 'unknown script id "' + id + '"' });
      }
      break;
    case 'ship':
      resolved = db.shipIndex.get(id);
      break;
    case 'weapon':
      resolved = db.weaponIndex.get(id);
      break;
    case 'enemy':
      resolved = db.enemyIndex.get(id);
      break;
    case 'stage':
      resolved = db.stageIndex.get(id);
      break;
    case 'tileset':
      resolved = db.tilesetIndex.get(id);
      break;
    case 'path':
      resolved = db.pathIndex.get(id);
      break;
    case 'sfx':
      resolved = hasOwn(SFX_CUES, id) ? (SFX_CUES as Record<string, number>)[id] : undefined;
      break;
    case 'music':
      resolved = hasOwn(MUSIC_CUES, id) ? (MUSIC_CUES as Record<string, number>)[id] : undefined;
      break;
  }
  if (resolved === undefined) {
    issues.push({ path: site.path, message: 'unknown ' + site.kind + ' id "' + id + '"' });
    target[field] = -1;
    return;
  }
  target[field] = resolved;
}

/**
 * Guards the public argument of {@link loadContent} — a bad one is a programming error.
 *
 * @param files - The value passed by the caller.
 * @throws TypeError when it is not an array.
 */
function assertFileList(files: unknown): void {
  if (!Array.isArray(files)) {
    throw new TypeError('loadContent(files): files must be an array of { path, data }');
  }
}

/**
 * Validates content files and builds the {@link ContentDb} the simulation reads.
 *
 * @remarks
 * Three passes: every file is validated and its entries collected (in ascending path order,
 * so the result never depends on how the host listed the files), then every string id
 * recorded by {@link s.ref} is resolved and written back as `<field>Id`. Sprite and script
 * names are *interned* (sorted, then numbered); ids pointing at ships, weapons, enemies,
 * paths, stages, tilesets or audio cues must resolve, or an issue is reported and the id becomes
 * `-1`. With `options.knownScripts` an interned script id outside that list is an issue too;
 * `options.extraSprites` (the engine's own sprites) are interned with the content's sprite
 * names, so they get ids in the same sorted table. Then bosses and regular enemies are checked
 * against the places that name them (stage events, `child`ren), and a last pass expands every
 * stage tilemap against its resolved tileset ({@link StageSpec.terrain}); its issues come last.
 * While collecting, enemies get the defaults of their optional fields (a regular enemy missing
 * `hp`, `score`, `hurtbox`, `script`, `sprite` or `drop`, or a bad boss section, fails its whole
 * file),
 * boss sections are completed, and paths are baked into arc-length tables ({@link bakePath}; a
 * path with coincident neighbours or an overlong curve is an issue and is left out).
 *
 * Bad files are skipped, not fatal: the caller (the boot error screen, `pnpm content:check`)
 * shows `issues` and may still run with the partial database. A file with a bad header or
 * no migration path is skipped whole; a file that fails its schema contributes nothing,
 * but the references it recorded are still resolved, so one load reports every problem.
 *
 * The input is never mutated: migrations return new bodies and the schemas build new
 * objects, so the resolved `<field>Id` values only appear on the returned specs. The
 * function is pure and deterministic — the same files give a byte-identical database and
 * issue list in any input order.
 *
 * @param files - The content files, typically from `virtual:shmup-content`.
 * @param options - Known script ids, the engine's extra sprite names and a migration table
 *   override.
 * @returns The database, every {@link ValidationIssue} found and the files of foreign kinds.
 * @throws TypeError when `files` is not an array (a programming error, unlike bad content).
 *
 * @example
 * ```ts
 * const { db, issues } = loadContent(contentFiles, { knownScripts: KNOWN_SCRIPT_IDS });
 * if (issues.length > 0) showBootErrors(issues);
 * const ship = db.ships[db.shipIndex.get('kestrel') ?? 0];
 * ```
 */
export function loadContent(
  files: readonly ContentFile[],
  options: LoadContentOptions = {},
): LoadContentResult {
  assertFileList(files);
  const issues: ValidationIssue[] = [];
  const foreign: ContentFile[] = [];
  const refs: RefSite[] = [];
  const spriteNames = new Set<string>();
  const scriptNames = new Set<string>();
  const migrations = options.migrations ?? CONTENT_MIGRATIONS;
  const knownScripts =
    options.knownScripts === undefined
      ? null
      : options.knownScripts instanceof Set
        ? (options.knownScripts as ReadonlySet<string>)
        : new Set<string>(options.knownScripts as readonly string[]);
  const db: DbBuilder = {
    ships: [],
    shipIndex: new Map(),
    weapons: [],
    weaponIndex: new Map(),
    weaponPresets: [],
    weaponPresetIndex: new Map(),
    enemies: [],
    enemyIndex: new Map(),
    paths: [],
    pathIndex: new Map(),
    stages: [],
    stageIndex: new Map(),
    stagePaths: [],
    enemyPaths: [],
    tilesets: [],
    tilesetIndex: new Map(),
  };

  const sorted = files.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const file of sorted) {
    const header = readHeader(file, issues);
    if (header === undefined) continue;
    if (!isContentKind(header.kind)) {
      foreign.push(file);
      continue;
    }
    const data = migrate(file, header.kind, header.formatVersion, migrations, issues);
    if (data === undefined) continue;

    const fileIssues: ValidationIssue[] = [];
    const refStart = refs.length;
    const parsed = parseFile(header.kind, data, fileIssues, refs);
    for (const issue of fileIssues) {
      issues.push({ path: at(file.path, issue.path), message: issue.message });
    }
    for (let i = refStart; i < refs.length; i++) {
      const site = refs[i];
      site.path = at(file.path, site.path);
      if (site.id !== null) {
        if (site.kind === 'sprite') spriteNames.add(site.id);
        else if (site.kind === 'script') scriptNames.add(site.id);
      }
    }
    if (parsed === undefined) continue;
    collect(header.kind, parsed, file.path, db, issues);
  }

  if (options.extraSprites !== undefined) {
    for (const name of options.extraSprites) spriteNames.add(name);
  }
  const sprites = buildStringTable(spriteNames);
  const scripts = buildStringTable(scriptNames);
  for (const site of refs) resolveRef(site, db, sprites, scripts, knownScripts, issues);
  checkBossReferences(db, issues);
  expandStageTerrains(db, issues);

  return {
    db: {
      sprites,
      scripts,
      ships: db.ships,
      shipIndex: db.shipIndex,
      weapons: db.weapons,
      weaponIndex: db.weaponIndex,
      weaponPresets: db.weaponPresets,
      weaponPresetIndex: db.weaponPresetIndex,
      enemies: db.enemies,
      enemyIndex: db.enemyIndex,
      paths: db.paths,
      pathIndex: db.pathIndex,
      stages: db.stages,
      stageIndex: db.stageIndex,
      tilesets: db.tilesets,
      tilesetIndex: db.tilesetIndex,
    },
    issues,
    foreign,
  };
}

/**
 * Validates one file body against its kind's schema.
 *
 * @param kind - The content kind.
 * @param data - The (migrated) file body.
 * @param issues - Collector, with document-relative paths.
 * @param refs - Reference collector.
 * @returns The parsed document, or `undefined` when it is invalid.
 */
function parseFile(
  kind: ContentKind,
  data: unknown,
  issues: ValidationIssue[],
  refs: RefSite[],
): Record<string, unknown> | undefined {
  switch (kind) {
    case 'player':
      return PLAYER_FILE_SCHEMA.parse(data, '', issues, refs);
    case 'weapons':
      return WEAPONS_FILE_SCHEMA.parse(data, '', issues, refs);
    case 'enemies':
      return ENEMIES_FILE_SCHEMA.parse(data, '', issues, refs);
    case 'paths':
      return PATHS_FILE_SCHEMA.parse(data, '', issues, refs);
    case 'stage':
      return STAGE_FILE_SCHEMA.parse(data, '', issues, refs);
    case 'tileset':
      return TILESET_FILE_SCHEMA.parse(data, '', issues, refs);
  }
}

/**
 * Moves the entries of one validated file into the builder.
 *
 * @param kind - The content kind.
 * @param parsed - The validated document.
 * @param path - Repo-relative file path, for issue messages.
 * @param db - The builder.
 * @param issues - Collector.
 */
function collect(
  kind: ContentKind,
  parsed: Record<string, unknown>,
  path: string,
  db: DbBuilder,
  issues: ValidationIssue[],
): void {
  switch (kind) {
    case 'player': {
      const ships = parsed['ships'] as PlayerShipSpec[];
      for (let i = 0; i < ships.length; i++) {
        addEntry(
          db.ships,
          db.shipIndex,
          ships[i],
          at(path, 'ships[' + String(i) + '].id'),
          'ship',
          issues,
        );
      }
      return;
    }
    case 'weapons': {
      const weapons = parsed['weapons'] as WeaponSpec[];
      for (let i = 0; i < weapons.length; i++) {
        addEntry(
          db.weapons,
          db.weaponIndex,
          weapons[i],
          at(path, 'weapons[' + String(i) + '].id'),
          'weapon',
          issues,
        );
      }
      const presets = (parsed['presets'] ?? []) as WeaponPresetSpec[];
      for (let i = 0; i < presets.length; i++) {
        addEntry(
          db.weaponPresets,
          db.weaponPresetIndex,
          presets[i],
          at(path, 'presets[' + String(i) + '].id'),
          'weapon preset',
          issues,
        );
      }
      return;
    }
    case 'enemies': {
      const enemies = parsed['enemies'] as MutableEnemy[];
      const complete: EnemySpec[] = [];
      let ok = true;
      for (let i = 0; i < enemies.length; i++) {
        const spec = completeEnemy(enemies[i], at(path, 'enemies[' + String(i) + ']'), issues);
        if (spec === null) ok = false;
        else complete.push(spec);
      }
      // Like a schema failure: a file with one bad entry contributes nothing.
      if (!ok) return;
      for (let i = 0; i < complete.length; i++) {
        const before = db.enemies.length;
        addEntry(
          db.enemies,
          db.enemyIndex,
          complete[i],
          at(path, 'enemies[' + String(i) + '].id'),
          'enemy',
          issues,
        );
        if (db.enemies.length > before) db.enemyPaths.push(at(path, 'enemies[' + String(i) + ']'));
      }
      return;
    }
    case 'paths': {
      const paths = parsed['paths'] as Array<Omit<PathSpec, 'table'> & { table?: PathTable }>;
      for (let i = 0; i < paths.length; i++) {
        const entry = paths[i];
        const table = bakePathEntry(entry, at(path, 'paths[' + String(i) + ']'), issues);
        if (table === null) continue;
        entry.table = table;
        addEntry(
          db.paths,
          db.pathIndex,
          entry as PathSpec,
          at(path, 'paths[' + String(i) + '].id'),
          'path',
          issues,
        );
      }
      return;
    }
    case 'stage': {
      const stage = parsed as unknown as MutableStage;
      if (!checkStage(stage, path, issues)) return;
      const before = db.stages.length;
      addEntry(db.stages, db.stageIndex, stage as StageSpec, at(path, 'id'), 'stage', issues);
      if (db.stages.length > before) db.stagePaths.push(path);
      return;
    }
    case 'tileset': {
      const tileset = parsed as unknown as Omit<TilesetSpec, 'tables'> & {
        tables?: TilesetTables;
      };
      if (!checkTileset(tileset, path, issues)) return;
      tileset.tables = buildTilesetTables(tileset.tiles, tileset.tileSize);
      addEntry(
        db.tilesets,
        db.tilesetIndex,
        tileset as TilesetSpec,
        at(path, 'id'),
        'tileset',
        issues,
      );
      return;
    }
  }
}

/** An enemy as the schema parsed it: the optional fields may still be missing. */
type MutableEnemy = { -readonly [K in keyof EnemySpec]?: EnemySpec[K] };

/** A boss part as the schema parsed it (the loader completes it in place). */
type MutableBossPart = { -readonly [K in keyof BossPartSpec]?: BossPartSpec[K] };

/** A boss phase condition as parsed. */
type MutableBossUntil = { -readonly [K in keyof BossUntilSpec]?: BossUntilSpec[K] };

/** A boss phase as parsed. */
type MutableBossPhase = Omit<
  { -readonly [K in keyof BossPhaseSpec]?: BossPhaseSpec[K] },
  'until'
> & {
  /** See {@link BossPhaseSpec.until}. */
  until?: MutableBossUntil | null;
};

/** A boss section as parsed. */
type MutableBoss = Omit<{ -readonly [K in keyof BossSpec]?: BossSpec[K] }, 'parts' | 'phases'> & {
  /** See {@link BossSpec.parts}. */
  parts: MutableBossPart[];
  /** See {@link BossSpec.phases}. */
  phases: MutableBossPhase[];
};

/**
 * Checks an enemy entry and fills the defaults of its optional fields in place (the parsed object
 * is the loader's own), so every {@link EnemySpec} has the same fields.
 *
 * @remarks
 * A regular enemy must have `hp`, `score`, `hurtbox`, `script`, `sprite` and `drop`. A boss entry
 * (with a `boss` section, M1-13) must leave those — and every other enemy field but `id` — out:
 * its boss section is checked and completed ({@link completeBoss}) and the regular fields are
 * filled from it (`hp` = the cores' total, `score` = `boss.score`, an empty `script` / `sprite`,
 * a 1-px `hurtbox`, `explosion` large, `megaCrashImmune`).
 *
 * @param enemy - The parsed enemy.
 * @param entry - Issue path of the entry (`<file>:enemies[i]`).
 * @param issues - Collector.
 * @returns The same object, complete, or `null` when it is unusable (issues reported).
 */
function completeEnemy(
  enemy: MutableEnemy,
  entry: string,
  issues: ValidationIssue[],
): EnemySpec | null {
  const record = enemy as Record<string, unknown>;
  const boss = record['boss'] as MutableBoss | undefined;
  if (boss === undefined) {
    let ok = true;
    for (const field of ENEMY_REQUIRED) {
      if (record[field] === undefined) ok = issue(issues, entry + '.' + field, 'is required');
    }
    if (!ok) return null;
    if (enemy.anim === undefined) enemy.anim = { frames: 1, ticks: 1 };
    if (enemy.params === undefined) enemy.params = {};
    if (enemy.mover === undefined) enemy.mover = null;
    if (enemy.ground === undefined) enemy.ground = null;
    if (enemy.settleTicks === undefined) enemy.settleTicks = DEFAULT_SETTLE_TICKS;
    if (enemy.explosion === undefined) enemy.explosion = 'small';
    if (enemy.megaCrashImmune === undefined) enemy.megaCrashImmune = false;
    if (enemy.child === undefined) enemy.child = null;
    enemy.boss = null;
    return enemy as EnemySpec;
  }
  let ok = true;
  for (const field of BOSS_OMITTED) {
    if (record[field] !== undefined) {
      ok = issue(
        issues,
        entry + '.' + field,
        'must be omitted for a boss (its boss section describes it)',
      );
    }
  }
  const coreHp = completeBoss(boss, entry + '.boss', issues);
  if (!ok || coreHp < 0) return null;
  enemy.hp = coreHp;
  enemy.score = boss.score;
  enemy.hurtbox = { hw: 1, hh: 1 };
  enemy.script = '';
  enemy.sprite = '';
  enemy.anim = { frames: 1, ticks: 1 };
  enemy.params = {};
  enemy.mover = null;
  enemy.drop = null;
  enemy.ground = null;
  enemy.settleTicks = 0;
  enemy.explosion = 'large';
  enemy.megaCrashImmune = true;
  enemy.child = null;
  return enemy as EnemySpec;
}

/**
 * Checks a boss section and completes it in place: part defaults, parent indices, `requires`
 * masks, phase defaults and condition masks.
 *
 * @remarks
 * Reported: duplicate part names; a `parent` that is not an earlier part; `requires` on a part
 * that is not `afterParts`, missing on one that is, naming an unknown part or the part itself;
 * no `core` part, a core that is `never` vulnerable or has no hurtbox; a phase other than the last
 * without `until`, the last one with it, an `until` without a condition, a `count` without
 * `partsDestroyed` or above its length, unknown `partsDestroyed` names, an `hpBelow` above the
 * cores' total.
 *
 * @param boss - The parsed boss section.
 * @param path - Issue path of the section (`<file>:enemies[i].boss`).
 * @param issues - Collector.
 * @returns The cores' total hit points, or -1 when the section is unusable.
 */
function completeBoss(boss: MutableBoss, path: string, issues: ValidationIssue[]): number {
  let ok = true;
  const parts = boss.parts;
  const names: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const name = parts[i].name ?? '';
    if (names.indexOf(name) >= 0) {
      ok = issue(issues, path + '.parts[' + String(i) + '].name', 'duplicate part "' + name + '"');
    }
    names.push(name);
  }
  let coreHp = 0;
  let cores = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const where = path + '.parts[' + String(i) + ']';
    const parent = part.parent;
    let parentIndex = -1;
    if (parent !== undefined && parent !== null) {
      parentIndex = names.indexOf(parent);
      if (parentIndex < 0 || parentIndex >= i) {
        ok = issue(issues, where + '.parent', 'must name an earlier part (parents come first)');
        parentIndex = -1;
      }
    }
    part.parent = parent ?? null;
    part.parentIndex = parentIndex;
    if (part.x === undefined) part.x = 0;
    if (part.y === undefined) part.y = 0;
    if (part.hp === undefined) part.hp = 1;
    if (part.hurtbox === undefined) part.hurtbox = null;
    if (part.vulnerable === undefined) part.vulnerable = 'always';
    const requires = part.requires ?? [];
    let mask = 0;
    if (part.vulnerable === 'afterParts' && requires.length === 0) {
      ok = issue(issues, where + '.requires', 'is required for vulnerable "afterParts"');
    } else if (part.vulnerable !== 'afterParts' && requires.length > 0) {
      ok = issue(issues, where + '.requires', 'is only used by vulnerable "afterParts"');
    }
    for (let k = 0; k < requires.length; k++) {
      const index = names.indexOf(requires[k]);
      if (index < 0) {
        ok = issue(
          issues,
          where + '.requires[' + String(k) + ']',
          'unknown part "' + requires[k] + '"',
        );
      } else if (index === i) {
        ok = issue(issues, where + '.requires[' + String(k) + ']', 'must name another part');
      } else {
        mask |= 1 << index;
      }
    }
    part.requires = requires;
    part.requiresMask = mask >>> 0;
    if (part.core === undefined) part.core = false;
    if (part.gun === undefined) part.gun = false;
    if (part.open === undefined) part.open = false;
    if (part.anim === undefined) part.anim = { frames: 1, ticks: 1 };
    if (part.score === undefined) part.score = 0;
    if (part.explosion === undefined) part.explosion = 'medium';
    if (part.core) {
      cores++;
      coreHp += part.hp;
      if (part.vulnerable === 'never') {
        ok = issue(
          issues,
          where + '.vulnerable',
          'a core cannot be "never" (the boss could not die)',
        );
      }
      if (part.hurtbox === null) ok = issue(issues, where + '.hurtbox', 'is required for a core');
    }
  }
  if (cores === 0) ok = issue(issues, path + '.parts', 'needs at least one core ("core": true)');
  const phases = boss.phases;
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const where = path + '.phases[' + String(i) + ']';
    if (phase.params === undefined) phase.params = {};
    const until = phase.until;
    const last = i === phases.length - 1;
    if (until === undefined || until === null) {
      phase.until = null;
      if (!last) {
        ok = issue(issues, where + '.until', 'is required (every phase but the last ends on it)');
      }
      continue;
    }
    if (last) {
      ok = issue(
        issues,
        where + '.until',
        'must be omitted on the last phase (it runs to the end)',
      );
    }
    const destroyed = until.partsDestroyed;
    if (until.hpBelow === undefined && destroyed === undefined && until.ticks === undefined) {
      ok = issue(issues, where + '.until', 'needs hpBelow, partsDestroyed or ticks');
    }
    if (until.count !== undefined && destroyed === undefined) {
      ok = issue(issues, where + '.until.count', 'needs partsDestroyed');
    } else if (until.count !== undefined && destroyed !== undefined) {
      if (until.count > destroyed.length) {
        ok = issue(issues, where + '.until.count', 'must be <= the number of partsDestroyed');
      }
    }
    if (until.hpBelow !== undefined && cores > 0 && until.hpBelow > coreHp) {
      ok = issue(
        issues,
        where + '.until.hpBelow',
        "must be <= the cores' total hp (" + String(coreHp) + ')',
      );
    }
    let mask = 0;
    for (let k = 0; destroyed !== undefined && k < destroyed.length; k++) {
      const index = names.indexOf(destroyed[k]);
      if (index < 0) {
        ok = issue(
          issues,
          where + '.until.partsDestroyed[' + String(k) + ']',
          'unknown part "' + destroyed[k] + '"',
        );
      } else {
        mask |= 1 << index;
      }
    }
    until.partsMask = mask >>> 0;
  }
  if (boss.introTicks === undefined) boss.introTicks = DEFAULT_BOSS_INTRO_TICKS;
  if (boss.score === undefined) boss.score = 0;
  if (boss.x === undefined) boss.x = DEFAULT_BOSS_X;
  if (boss.y === undefined) boss.y = DEFAULT_BOSS_Y;
  return ok ? coreHp : -1;
}

/**
 * Fourth pass of {@link loadContent} (references resolved): bosses and regular enemies must be
 * used where they belong — a stage `spawn` / `formation` event or an enemy `child` naming a boss,
 * or a `warning` / `boss` event naming a regular enemy, is an issue.
 *
 * @param db - The builder (references already resolved).
 * @param issues - Collector.
 */
function checkBossReferences(db: DbBuilder, issues: ValidationIssue[]): void {
  const enemies = db.enemies;
  /**
   * Whether a resolved enemy index names a boss (-1 = unresolved: already an issue).
   *
   * @param index - The index.
   * @returns `true` for a boss, `false` otherwise, `null` when unresolved.
   */
  const isBoss = (index: number): boolean | null =>
    index >= 0 && index < enemies.length ? enemies[index].boss !== null : null;
  for (let s = 0; s < db.stages.length; s++) {
    const events = db.stages[s].events;
    const file = db.stagePaths[s];
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const path = at(file, 'events[' + String(i) + '].enemy');
      if (event.type === 'spawn' || event.type === 'formation') {
        if (isBoss(event.enemyId) === true) {
          issue(issues, path, 'is a boss: start it with a "warning" or "boss" event');
        }
      } else if (event.type === 'warning' || event.type === 'boss') {
        if (isBoss(event.enemyId) === false) {
          issue(issues, path, 'must name an enemy with a boss section');
        }
      }
    }
  }
  for (let e = 0; e < enemies.length; e++) {
    if (isBoss(enemies[e].childId) === true) {
      issue(issues, db.enemyPaths[e] + '.child', 'is a boss: a spawner cannot release it');
    }
  }
}

/**
 * Bakes one path entry, reporting problems instead of throwing.
 *
 * @param entry - The parsed path.
 * @param path - Issue path of the entry (`<file>:paths[i]`).
 * @param issues - Collector.
 * @returns The table, or `null` when the path is unusable.
 */
function bakePathEntry(
  entry: Omit<PathSpec, 'table'>,
  path: string,
  issues: ValidationIssue[],
): PathTable | null {
  const points = entry.points;
  let ok = true;
  for (let i = 1; i < points.length; i++) {
    if (points[i].x === points[i - 1].x && points[i].y === points[i - 1].y) {
      ok = issue(
        issues,
        path + '.points[' + String(i) + ']',
        'must differ from points[' + String(i - 1) + ']',
      );
    }
  }
  if (!ok) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const point of points) {
    xs.push(point.x);
    ys.push(point.y);
  }
  try {
    return bakePath(xs, ys);
  } catch (error) {
    issue(issues, path + '.points', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** A stage while the loader completes it (the fields it adds after the schema). */
type MutableStage = Omit<StageSpec, 'flagNames' | 'terrain' | 'events'> & {
  /** See {@link StageSpec.events}. */
  events: Array<StageEvent & { flagId?: number }>;
  /** See {@link StageSpec.flagNames}. */
  flagNames: string[];
  /** See {@link StageSpec.terrain}. */
  terrain: StageTerrain | null;
};

/**
 * Reports `path: message` and returns `false`.
 *
 * @param issues - Collector.
 * @param path - Issue path.
 * @param message - Message.
 * @returns `false`.
 */
function issue(issues: ValidationIssue[], path: string, message: string): false {
  issues.push({ path, message });
  return false;
}

/**
 * The checks a stage needs beyond its schema: sorted camera keys (the first at 0), checkpoints
 * and events inside the stage length, pan keys with a target, heightfield segments with
 * `from < to`, at most {@link MAX_STAGE_FLAGS} flags. Assigns the flag ids and initialises
 * `terrain` (filled by {@link expandStageTerrains}).
 *
 * @param stage - The parsed stage.
 * @param file - Repo-relative file path.
 * @param issues - Collector.
 * @returns `true` when the stage is usable.
 */
function checkStage(stage: MutableStage, file: string, issues: ValidationIssue[]): boolean {
  let ok = true;
  const length = stage.length;
  const keys = stage.camera;
  if (keys[0].x !== 0) {
    ok = issue(
      issues,
      at(file, 'camera[0].x'),
      'must be 0 (the camera path starts at the stage start)',
    );
  }
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const path = 'camera[' + String(i) + ']';
    if (i > 0 && key.x <= keys[i - 1].x) {
      ok = issue(
        issues,
        at(file, path + '.x'),
        'must be greater than camera[' + String(i - 1) + '].x (keys are sorted by x)',
      );
    }
    if (key.x > length) ok = issue(issues, at(file, path + '.x'), 'must be <= length');
    if (key.yTicks !== undefined && key.yTo === undefined) {
      ok = issue(issues, at(file, path + '.yTicks'), 'needs yTo');
    }
  }
  const checkpoints = stage.checkpoints;
  for (let i = 0; i < checkpoints.length; i++) {
    const path = 'checkpoints[' + String(i) + '].x';
    if (i > 0 && checkpoints[i].x <= checkpoints[i - 1].x) {
      ok = issue(
        issues,
        at(file, path),
        'must be greater than checkpoints[' + String(i - 1) + '].x (checkpoints are sorted by x)',
      );
    }
    if (checkpoints[i].x > length) ok = issue(issues, at(file, path), 'must be <= length');
  }
  const events = stage.events;
  const flags: string[] = [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const path = 'events[' + String(i) + '].x';
    if (i > 0 && event.x < events[i - 1].x) {
      ok = issue(
        issues,
        at(file, path),
        'must be >= events[' + String(i - 1) + '].x (events are sorted by x)',
      );
    }
    if (event.x > length) ok = issue(issues, at(file, path), 'must be <= length');
    if (event.type === 'flag' && flags.indexOf(event.flag) < 0) flags.push(event.flag);
  }
  flags.sort();
  if (flags.length > MAX_STAGE_FLAGS) {
    ok = issue(
      issues,
      at(file, 'events'),
      'uses ' + String(flags.length) + ' flags (at most ' + String(MAX_STAGE_FLAGS) + ')',
    );
  }
  for (const event of events) if (event.type === 'flag') event.flagId = flags.indexOf(event.flag);
  stage.flagNames = flags;
  const segments = stage.tilemap?.generator?.segments ?? [];
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].to <= segments[i].from) {
      ok = issue(
        issues,
        at(file, 'tilemap.generator.segments[' + String(i) + '].to'),
        'must be greater than from',
      );
    }
  }
  stage.terrain = null;
  return ok;
}

/**
 * The checks a tileset needs beyond its schema: unique tile names, masks of `tileSize` columns
 * with heights in `0 … tileSize`.
 *
 * @param tileset - The parsed tileset.
 * @param file - Repo-relative file path.
 * @param issues - Collector.
 * @returns `true` when the tileset is usable.
 */
function checkTileset(
  tileset: Omit<TilesetSpec, 'tables'>,
  file: string,
  issues: ValidationIssue[],
): boolean {
  let ok = true;
  const size = tileset.tileSize;
  const names = new Set<string>();
  for (let i = 0; i < tileset.tiles.length; i++) {
    const tile = tileset.tiles[i];
    const path = 'tiles[' + String(i) + ']';
    if (names.has(tile.name))
      ok = issue(issues, at(file, path + '.name'), 'duplicate tile name "' + tile.name + '"');
    names.add(tile.name);
    if (tile.mask.length !== size) {
      ok = issue(
        issues,
        at(file, path + '.mask'),
        'must have tileSize (' + String(size) + ') entries',
      );
    }
    for (let c = 0; c < tile.mask.length; c++) {
      if (tile.mask[c] > size) {
        ok = issue(
          issues,
          at(file, path + '.mask[' + String(c) + ']'),
          'must be <= tileSize (' + String(size) + ')',
        );
      }
    }
  }
  return ok;
}

/**
 * Third pass of {@link loadContent}: expands every stage's tilemap against its (now resolved)
 * tileset into {@link StageSpec.terrain}.
 *
 * @param db - The builder (references already resolved).
 * @param issues - Collector.
 */
function expandStageTerrains(db: DbBuilder, issues: ValidationIssue[]): void {
  for (let i = 0; i < db.stages.length; i++) {
    const stage = db.stages[i] as unknown as MutableStage;
    const tilemap = stage.tilemap;
    if (tilemap === null) continue;
    const tileset = tilemap.tilesetId >= 0 ? db.tilesets[tilemap.tilesetId] : undefined;
    if (tileset === undefined) continue; // the unknown id is already an issue
    const path = at(db.stagePaths[i], 'tilemap');
    if (tileset.tileSize !== tilemap.tileSize) {
      issue(
        issues,
        path + '.tileSize',
        "must equal the tileset's tileSize (" + String(tileset.tileSize) + ')',
      );
      continue;
    }
    const cols = Math.ceil((stage.length + PLAYFIELD_W) / tilemap.tileSize);
    const tiles = expandTilemap(tilemap, cols, tileset.tables, tileset.id, path, issues);
    if (tiles === null) continue;
    stage.terrain = {
      tileSize: tilemap.tileSize,
      cols,
      rows: tilemap.rowsTall,
      tiles,
      tilesetId: tilemap.tilesetId,
    };
  }
}
