/**
 * # data — content schemas and loaders (player, weapons, enemies, stages JSON)
 *
 * **Status: partial.** The loader, the schema combinators and the `player` / `weapons`
 * formats are implemented; `enemies` and `stage` have working *stub* schemas that the
 * steps owning those systems (M1-07 … M1-13) extend.
 *
 * **Responsibility.** Data-driven content (design pillar 4). Declares the shape of every
 * file under `content/`, validates it at load time with the in-house combinators in
 * {@link ./schema.js | data/schema} (decision D28 — no runtime dependency), migrates older
 * `formatVersion`s and **resolves every string id to a numeric index once**, so the
 * per-tick path only touches numbers (convention 1.5). Behaviour lives in TypeScript and is
 * referenced from data by id; tunables live in data.
 *
 * **Implements.**
 * - shmup_feat.md §14 — stage data format (JSON validated with a schema)
 * - shmup_feat.md §22 — data-driven content (`enemies.json`, `weapons.json`, `stages/*.json`)
 * - shmup_feat.md §7 / §11 — weapons and enemies defined in data
 *
 * **Public API.** {@link loadContent}, {@link ContentDb}, {@link EMPTY_CONTENT_DB},
 * {@link CONTENT_FORMAT_VERSION}, {@link CONTENT_KINDS}, {@link CONTENT_MIGRATIONS},
 * the per-kind spec types ({@link PlayerShipSpec}, {@link WeaponSpec}, {@link WeaponPresetSpec},
 * {@link EnemySpec}, {@link StageSpec}) and everything re-exported from
 * {@link ./schema.js | data/schema}.
 *
 * **Planned API (later steps).** Kinds `paths`, `tilesets`, `rules`, `patterns`, `campaign`,
 * `strings` (M1-07 … M2); `input-profiles`, `sfx`/`music` and `fx` files stay *foreign* here
 * and are validated by their owning packages (see plan §3.5).
 *
 * @remarks
 * Nothing in this module runs per tick: it allocates freely, uses `Map`s and reports **all**
 * problems of a load instead of throwing. {@link loadContent} throws only for a programming
 * error (a bad `files` argument).
 *
 * @module
 */
import { MUSIC_CUES, SFX_CUES } from '../events/index.js';
import { defineModule } from '../module-info.js';
import { s, type RefSite, type Schema, type ValidationIssue } from './schema.js';

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

/** Kinds of content file this module owns. Other kinds are returned as *foreign*. */
export const CONTENT_KINDS = Object.freeze(['player', 'weapons', 'enemies', 'stage'] as const);

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

/** Upgrades one file body from format `v` to `v + 1`. */
export type ContentMigration = (data: Readonly<Record<string, unknown>>) => Record<string, unknown>;

/** Per-kind migrations, keyed by the version they upgrade *from*. */
export type ContentMigrationTable = {
  readonly [K in ContentKind]?: { readonly [fromVersion: number]: ContentMigration };
};

/** Returns its input unchanged (a format change that only relaxed validation). */
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

/** One enemy (`content/enemies/*.enemies.json`, shmup_feat.md §11). Stub — M1-08 extends it. */
export interface EnemySpec {
  /** Unique id, referenced by stage events. */
  readonly id: string;
  /** Hit points. */
  readonly hp: number;
  /** Score awarded on death. */
  readonly score: number;
  /** Half-extents of the hurtbox, in pixels. */
  readonly hurtbox: BoxSpec;
  /** Behaviour coroutine id (core `behaviors`, M1-08). */
  readonly script: string;
  /** Resolved {@link ContentDb.scripts} index of {@link EnemySpec.script}. */
  readonly scriptId: number;
  /** Atlas sprite name. */
  readonly sprite: string;
  /** Resolved {@link ContentDb.sprites} index of {@link EnemySpec.sprite}. */
  readonly spriteId: number;
  /** What the enemy drops (`capsule`, `item:red`, …) or `null`. */
  readonly drop: string | null;
  /** Rank modifiers. */
  readonly rank?: EnemyRankSpec;
}

/** One camera-path key of a stage (speed in px/tick from this camera-X on). */
export interface StageCameraKey {
  /** Camera X where the key takes effect. */
  readonly x: number;
  /** Scroll speed in pixels per tick from here on. */
  readonly speed: number;
  /** Optional lock reason (`boss` stops the camera until the boss dies). */
  readonly lock?: string;
}

/** A restart point for the `arcade` death penalty (shmup_feat.md §10). */
export interface StageCheckpoint {
  /** Camera X the player restarts at. */
  readonly x: number;
}

/** One parallax background layer. */
export interface StageParallaxLayer {
  /** Layer id (resolved against the atlas/tileset in M1-07). */
  readonly id: string;
  /** Scroll factor relative to the camera (0 = static, 1 = playfield speed). */
  readonly factor: number;
}

/** Reference to an exported tilemap (Tiled/LDtk), resolved in M1-07. */
export interface StageTilemapRef {
  /** Tile edge length in pixels. */
  readonly tileSize: number;
  /** Path of the tilemap file, relative to `content/`. */
  readonly file: string;
}

/** Spawn one enemy (or a formation of them) when the camera reaches `x`. */
export interface StageSpawnEvent {
  /** Camera X that fires the event. */
  readonly x: number;
  /** Discriminator. */
  readonly type: 'spawn';
  /** Enemy id. */
  readonly enemy: string;
  /** Resolved {@link ContentDb.enemies} index. */
  readonly enemyId: number;
  /** Formation id (M1-08); a single enemy when omitted. */
  readonly formation?: string;
  /** Movement path id (M1-07). */
  readonly path?: string;
  /** Spawn Y in playfield pixels; the path decides when omitted. */
  readonly y?: number;
  /** How many enemies the formation spawns. */
  readonly count?: number;
}

/** Start a boss, mid-boss or its WARNING intro (shmup_feat.md §13). */
export interface StageBossEvent {
  /** Camera X that fires the event. */
  readonly x: number;
  /** Discriminator. */
  readonly type: 'boss' | 'midboss' | 'warning';
  /** Boss enemy id. */
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

/** Change the scroll speed outside the camera key list (scripted sections). */
export interface StageScrollEvent {
  /** Camera X that fires the event. */
  readonly x: number;
  /** Discriminator. */
  readonly type: 'scroll';
  /** New scroll speed in pixels per tick. */
  readonly speed: number;
}

/** Mark a restart point inline in the timeline. */
export interface StageCheckpointEvent {
  /** Camera X that fires the event. */
  readonly x: number;
  /** Discriminator. */
  readonly type: 'checkpoint';
}

/** One entry of a stage timeline, fired when the camera reaches its `x`. */
export type StageEvent =
  StageSpawnEvent | StageBossEvent | StageMusicEvent | StageScrollEvent | StageCheckpointEvent;

/** One stage/zone (`content/stages/*.stage.json`, shmup_feat.md §14). Stub — M1-07 extends it. */
export interface StageSpec {
  /** Unique id, referenced by the zone map. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Camera-X length in pixels. */
  readonly length: number;
  /** Camera path keys, sorted by `x`. */
  readonly camera: readonly StageCameraKey[];
  /** Restart points. */
  readonly checkpoints: readonly StageCheckpoint[];
  /** Background layers, far to near. */
  readonly parallax: readonly StageParallaxLayer[];
  /** Terrain tilemap, or `null` for an open-space stage. */
  readonly tilemap: StageTilemapRef | null;
  /** Timeline, sorted by `x`. */
  readonly events: readonly StageEvent[];
}

/** Interned string ids: `names[i]` is the name of index `i`. */
export interface StringTable {
  /** Names in ascending order (so indices do not depend on file order). */
  readonly names: readonly string[];
  /** Name → index. */
  readonly index: ReadonlyMap<string, number>;
}

/** Everything the simulation needs from `content/`, with string ids already resolved. */
export interface ContentDb {
  /** Atlas sprite names used by content (M1-03 checks them against the atlas). */
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
  /** Stages, in file order. */
  readonly stages: readonly StageSpec[];
  /** Stage id → {@link ContentDb.stages} index. */
  readonly stageIndex: ReadonlyMap<string, number>;
}

/** Options of {@link loadContent}. */
export interface LoadContentOptions {
  /**
   * Behaviour ids the engine implements. When given, content referring to an unknown
   * script reports an issue; when omitted (M1-02 … M1-07) script ids are only interned.
   */
  readonly knownScripts?: readonly string[] | ReadonlySet<string>;
  /** Migration table; defaults to {@link CONTENT_MIGRATIONS} (tests inject their own). */
  readonly migrations?: ContentMigrationTable;
}

/** What {@link loadContent} produces. */
export interface LoadContentResult {
  /** The resolved database (partial when `issues` is non-empty — bad files are skipped). */
  readonly db: ContentDb;
  /** Every problem found, in file then document order. Empty means the content is sound. */
  readonly issues: readonly ValidationIssue[];
  /** Files whose `kind` this module does not own, untouched, in path order. */
  readonly foreign: readonly ContentFile[];
}

/** `formatVersion` and `kind` fields shared by every file schema. */
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

/** One entry of `enemies` in an `enemies` file. */
const ENEMY_SCHEMA: Schema<Omit<EnemySpec, 'scriptId' | 'spriteId'>> = s.object(
  {
    id: s.str(),
    hp: s.int({ min: 1, max: 100000 }),
    score: s.int({ min: 0, max: 1000000 }),
    hurtbox: BOX_SCHEMA,
    script: s.ref('script'),
    sprite: s.ref('sprite'),
    drop: s.nullable(s.str()),
    rank: s.object(
      { fireRate: s.num({ min: 0, max: 8 }), bulletSpeed: s.num({ min: 0, max: 8 }) },
      { optional: ['fireRate', 'bulletSpeed'] },
    ),
  },
  { optional: ['rank'] },
);

/** A `content/enemies/*.enemies.json` file. */
const ENEMIES_FILE_SCHEMA = s.object({
  ...HEADER_SHAPE,
  kind: s.enumOf(['enemies'] as const),
  enemies: s.array(ENEMY_SCHEMA, { min: 1 }),
});

/** Camera-X of a timeline entry. */
const EVENT_X = s.num({ min: 0, max: 1000000 });

/** One entry of `events` in a `stage` file (stub — M1-07 adds `formation` and `branch`). */
const STAGE_EVENT_SCHEMA: Schema<Omit<StageEvent, 'enemyId' | 'cueId'>> = s.oneOf('type', {
  spawn: s.object(
    {
      x: EVENT_X,
      type: s.enumOf(['spawn'] as const),
      enemy: s.ref('enemy'),
      formation: s.str(),
      path: s.str(),
      y: s.num({ min: -64, max: 320 }),
      count: s.int({ min: 1, max: 64 }),
    },
    { optional: ['formation', 'path', 'y', 'count'] },
  ),
  boss: s.object({ x: EVENT_X, type: s.enumOf(['boss'] as const), enemy: s.ref('enemy') }),
  midboss: s.object({ x: EVENT_X, type: s.enumOf(['midboss'] as const), enemy: s.ref('enemy') }),
  warning: s.object({ x: EVENT_X, type: s.enumOf(['warning'] as const), enemy: s.ref('enemy') }),
  music: s.object({ x: EVENT_X, type: s.enumOf(['music'] as const), cue: s.ref('music') }),
  scroll: s.object({
    x: EVENT_X,
    type: s.enumOf(['scroll'] as const),
    speed: s.num({ min: 0, max: 16 }),
  }),
  checkpoint: s.object({ x: EVENT_X, type: s.enumOf(['checkpoint'] as const) }),
});

/** A `content/stages/*.stage.json` file. */
const STAGE_FILE_SCHEMA = s.object({
  ...HEADER_SHAPE,
  kind: s.enumOf(['stage'] as const),
  id: s.str(),
  name: s.str(),
  length: s.int({ min: 1, max: 1000000 }),
  camera: s.array(
    s.object(
      { x: EVENT_X, speed: s.num({ min: 0, max: 16 }), lock: s.str() },
      { optional: ['lock'] },
    ),
    { min: 1 },
  ),
  checkpoints: s.array(s.object({ x: EVENT_X })),
  parallax: s.array(s.object({ id: s.str(), factor: s.num({ min: 0, max: 4 }) })),
  tilemap: s.nullable(s.object({ tileSize: s.int({ min: 1, max: 64 }), file: s.str() })),
  events: s.array(STAGE_EVENT_SCHEMA),
});

/** Mutable working copy of a {@link ContentDb} while a load runs. */
interface DbBuilder {
  ships: PlayerShipSpec[];
  shipIndex: Map<string, number>;
  weapons: WeaponSpec[];
  weaponIndex: Map<string, number>;
  weaponPresets: WeaponPresetSpec[];
  weaponPresetIndex: Map<string, number>;
  enemies: EnemySpec[];
  enemyIndex: Map<string, number>;
  stages: StageSpec[];
  stageIndex: Map<string, number>;
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
 * Frozen and shared: every lookup misses, so systems fall back to their defaults.
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
  stages: Object.freeze([]),
  stageIndex: new Map<string, number>(),
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
 * Two passes: every file is validated and its entries collected (in ascending path order,
 * so the result never depends on how the host listed the files), then every string id
 * recorded by {@link s.ref} is resolved and written back as `<field>Id`. Sprite and script
 * names are *interned* (sorted, then numbered); ids pointing at ships, weapons, enemies,
 * stages or audio cues must resolve, or an issue is reported and the id becomes `-1`.
 *
 * Bad files are skipped, not fatal: the caller (the boot error screen, `pnpm content:check`)
 * shows `issues` and may still run with the partial database.
 *
 * @param files - The content files, typically from `virtual:shmup-content`.
 * @param options - Known script ids and a migration table override.
 * @returns The database, every {@link ValidationIssue} found and the files of foreign kinds.
 * @throws TypeError when `files` is not an array (a programming error, unlike bad content).
 *
 * @example
 * ```ts
 * const { db, issues } = loadContent(contentFiles);
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
    stages: [],
    stageIndex: new Map(),
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

  const sprites = buildStringTable(spriteNames);
  const scripts = buildStringTable(scriptNames);
  for (const site of refs) resolveRef(site, db, sprites, scripts, knownScripts, issues);

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
      stages: db.stages,
      stageIndex: db.stageIndex,
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
    case 'stage':
      return STAGE_FILE_SCHEMA.parse(data, '', issues, refs);
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
      const enemies = parsed['enemies'] as EnemySpec[];
      for (let i = 0; i < enemies.length; i++) {
        addEntry(
          db.enemies,
          db.enemyIndex,
          enemies[i],
          at(path, 'enemies[' + String(i) + '].id'),
          'enemy',
          issues,
        );
      }
      return;
    }
    case 'stage':
      addEntry(
        db.stages,
        db.stageIndex,
        parsed as unknown as StageSpec,
        at(path, 'id'),
        'stage',
        issues,
      );
      return;
  }
}
