/**
 * # data — content schemas and loaders (player, weapons, enemies, paths, stages, tilesets JSON)
 *
 * **Status: partial.** The loader, the schema combinators and the `player`, `weapons`,
 * `enemies` (with its boss section, M1-13), `paths`, `stage`, `tileset`, `rules` (M2-01, its
 * `scoring` section M2-02), `patterns` (M2-02), `campaign` (M2-10) and `replay` (M2-15 — the
 * attract loop's demos) formats are implemented; later steps add their kinds.
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
 * **Stage presentation effects (M2-08).** A stage may list `raster` effects
 * ({@link StageRasterEffect}: wavy water, heat haze or a line-band parallax floor on the `far` /
 * `mid` background or the terrain, over a band of playfield rows and a camera-x range) and palette
 * `cycles` ({@link StageColorCycle}: a ramp of `#rrggbb` colours rotated every `ticks` ticks on a
 * background, the terrain or an enemy layer). The loader checks the ranges, the fields each raster
 * kind needs and that no layer cycles more than {@link MAX_CYCLE_COLORS_PER_LAYER} distinct
 * colours, fills the defaults and resolves the colours to numbers. The simulation never reads them
 * — the World hands them to the renderer through its view (`WorldView.effects`).
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
 * **Advanced bosses (M2-09).** A boss section may give a `role` (`boss` — the default — or
 * `captain`, a mid-boss that stays until destroyed and never locks the scroll or clears the
 * stage; {@link BossRoleName}), a `timeLimit` (fight ticks before it escapes), a `raid`
 * ({@link BossRaidSpec}: boss-relative camera segments — a battleship larger than the screen), a
 * `partner` (a second boss that enters with it — a double boss — with `alternate` turns and the
 * survivor's `enrage`, {@link BossEnrageSpec}), an `inner` boss (a boss inside a boss, revealed by
 * its final blast) and a `minion` enemy its behaviours launch. Parts may be turned (`angle`, `spin`
 * in binary units — children follow the turned offsets), hit by a circle (`radius` instead of a
 * `hurtbox`) and drawn from heading frames (`turn`). A stage of `type: 'bossRush'` runs its `rush`
 * list of bosses one after another ({@link StageRushEntry}). The reference pass checks that
 * partners, inner bosses and rush entries are bosses of role `boss`, minions are regular enemies,
 * no `warning` event names a captain and no inner-boss chain loops.
 *
 * **Campaign and bonus stages (M2-10).** A `campaign` file (`content/campaign/*.campaign.json`,
 * one per content set — `./campaign.ts`) holds the zone map: zones (a stage each, a map label,
 * a name, preview lines), the edges between them and the endings; the loader checks the graph
 * (every zone reachable, every edge one level deeper — so every route ends in a final zone —,
 * an unconditional ending per final zone) and derives depths, rows, exits and the route count
 * into {@link ContentDb.campaign}; a zone's stage must not be a bonus stage. A stage may be of
 * type `bonus` (a hidden bonus stage: no boss, no entrances, an `end`) and any stage may carry
 * `bonus` events ({@link StageBonusEvent}: an entrance — a marked `gap`, all `ground` targets
 * destroyed, a score `digit` — naming the bonus stage, at most {@link MAX_BONUS_ENTRANCES});
 * enemies may drop `oneUp` and `bonusCapsule`.
 *
 * **Rules (M2-01).** A `rules` file (`content/rules/*.rules.json`) holds game-wide tables; its
 * optional `difficulty` section gives the four difficulty presets (`core/config`
 * {@link DifficultyRules}: rank base and growth, lives, extends, continues, death penalty, aim
 * directions, bullet speed multiplier) as {@link ContentDb.difficulty} — frozen, `aimDirections`
 * checked to be powers of two, defined by one file only. Enemies may carry rank modifiers
 * ({@link EnemyRankSpec}: how strongly they follow the rank's curves) and revenge bullets
 * ({@link EnemyRevengeSpec}).
 *
 * **Implements.**
 * - shmup_feat.md §15 — difficulty presets as data (rank base / growth, lives, extends)
 * - shmup_feat.md §14 — stage data format (JSON validated with a schema), tilemap terrain with
 *   collision types and slope masks, parallax layers, sorted event timeline
 * - shmup_feat.md §10 — invisible checkpoints in the stage data
 * - shmup_feat.md §22 — data-driven content (`enemies.json`, `weapons.json`, `stages/*.json`)
 * - shmup_feat.md §21 — localization "JSON string tables" (the `strings` kind — M2-16)
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
 * - Per-kind spec types: {@link PlayerShipSpec} ({@link BoxSpec}, {@link MarginSpec},
 *   {@link P2_SPRITE_SUFFIX} — M2-06),
 *   {@link WeaponSpec} ({@link WeaponSlot}, {@link WEAPON_SLOTS}), {@link WeaponPresetSpec},
 *   {@link WeaponFamilySpec} ({@link WeaponLevelSpec}, {@link WeaponEmitterSpec},
 *   {@link WeaponFamilySlot}, {@link MAX_FAMILY_LEVELS}, {@link MAX_LEVEL_SHOTS} — M2-05),
 *   {@link DIRECT_ITEMS} / {@link DirectItemName} / {@link MAX_DIRECT_ITEM_PLAN} (M2-05),
 *   {@link EnemySpec} ({@link EnemyRankSpec}, {@link EnemyRevengeSpec}, {@link RevengePattern},
 *   {@link REVENGE_PATTERNS}, {@link DEFAULT_REVENGE_SPEED}, {@link EnemyAnimSpec},
 *   {@link EnemyMoverSpec},
 *   {@link MoverType}, {@link MOVER_TYPES}, {@link EnemyGround}, {@link ENEMY_GROUNDS},
 *   {@link EnemyExplosion}, {@link ENEMY_EXPLOSIONS}, {@link EnemyDrop}, {@link ENEMY_DROPS},
 *   {@link DEFAULT_SETTLE_TICKS}), {@link BossSpec} ({@link BossPartSpec}, {@link BossPhaseSpec},
 *   {@link BossUntilSpec}, {@link BossVulnerability}, {@link BOSS_VULNERABILITIES},
 *   {@link MAX_BOSS_PARTS}, {@link MAX_BOSS_PHASES}, {@link DEFAULT_BOSS_X},
 *   {@link DEFAULT_BOSS_Y}, {@link DEFAULT_BOSS_INTRO_TICKS}; M2-09 {@link BossRoleName},
 *   {@link BOSS_ROLES}, {@link BossRaidSpec}, {@link BossRaidSegmentSpec},
 *   {@link BossEnrageSpec}, {@link MAX_RAID_SEGMENTS}, {@link DEFAULT_RAID_SEGMENT_TICKS},
 *   {@link DEFAULT_ENRAGE_FIRE_RATE}, {@link DEFAULT_ENRAGE_SPEED}, {@link MAX_TURN_FRAMES}),
 *   {@link StageType}, {@link STAGE_TYPES}, {@link StageRushEntry}, {@link MAX_RUSH_BOSSES},
 *   {@link DEFAULT_RUSH_DELAY} (M2-09), {@link MAX_STAGE_REMIX}, {@link stageEventInLoop},
 *   {@link stageForLoop} (M3-01), {@link PathSpec}
 *   ({@link PathPointSpec}, {@link PathTable}, {@link bakePath}, {@link PATH_SAMPLE_STEP},
 *   {@link MAX_PATH_LENGTH}), {@link StageSpec} and its parts ({@link StageMusic},
 *   {@link StageCameraKey}, {@link StageCheckpoint}, {@link StageParallaxLayer},
 *   {@link StageParallaxLayerName}, {@link StageTilemapSpec}, {@link HeightfieldSpec},
 *   {@link HeightfieldSegment}, {@link HeightfieldProfile}, {@link StageTerrain},
 *   {@link StageEvent} and its variants, {@link STAGE_EVENT_TYPES},
 *   M2-08 {@link STAGE_RASTER_LAYERS} / {@link StageRasterLayerName}, {@link STAGE_RASTER_KINDS} /
 *   {@link StageRasterKindName}, {@link STAGE_CYCLE_LAYERS} / {@link StageCycleLayerName},
 *   {@link MAX_STAGE_RASTER_EFFECTS}, {@link MAX_STAGE_COLOR_CYCLES}, {@link MAX_RASTER_BANDS},
 *   {@link DEFAULT_RASTER_PERIOD}; M3-02 {@link StageMode7} (the pseudo-3D floor — presentation
 *   only, never read by the simulation), {@link DEFAULT_MODE7_SCROLL},
 *   {@link DEFAULT_MODE7_FOG_DEPTH},
 *   {@link MAX_STAGE_FLAGS}; M2-07 {@link StageEventBase}, {@link StageBranch},
 *   {@link StageTriggerEvent}, {@link StageRegion}, {@link StageBlockEvent},
 *   {@link MAX_STAGE_TRIGGERS}, {@link MAX_STAGE_BRANCHES}, {@link MAX_BLOCK_CELLS},
 *   {@link DEFAULT_BLOCK_SCREEN_X}, {@link DEFAULT_BLOCK_PERIOD}, {@link BallisticLandName},
 *   {@link BALLISTIC_LANDS}), {@link TilesetSpec} ({@link TileSpec}, {@link TileType},
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
 * **Patterns and scoring rules (M2-02).** A `patterns` file (`content/patterns/*.patterns.json`)
 * holds BulletML-inspired actions and bullets (`core/patterns` `dsl.ts`: the format, the
 * expression compiler and the pattern compiler). Every valid file is collected, then — before the
 * references are resolved — all of them are compiled into one {@link ContentDb.patterns} bank;
 * enemies refer to an action with `pattern` (→ `patternId`). A `rules` file's optional `scoring`
 * section gives {@link ContentDb.scoring} (the points of a bullet cancelled into a point item).
 *
 * **Direct mode (M2-05).** A player ship names its power-up model (`mode`: `meter` — the default —
 * or `direct`) and its starting speed level (`startSpeedLevel`); a `weapons` file may hold
 * Direct-mode shot **families** ({@link WeaponFamilySpec}: up to {@link MAX_FAMILY_LEVELS} levels,
 * each a volley of weapon emitters — {@link WeaponLevelSpec}, {@link WeaponEmitterSpec}) collected
 * into {@link ContentDb.weaponFamilies}; a stage may carry its **direct item plan**
 * (`directItems`: the {@link DIRECT_ITEMS} colours, in the order its `powerup` drops hand them out
 * in Direct mode); enemies and formations may drop `powerup` — a capsule in meter mode, the next
 * planned item in Direct mode.
 *
 * **Advanced stages (M2-07).** Tiles may be destructible (`hp`, `regen`, `score` —
 * {@link TileSpec}); camera keys gain timed stops (`hold`) and diagonal pans (`yOver`); a stage may
 * declare **branches** ({@link StageBranch}: a flag and the value that takes it) and any event may
 * name one (`branch` → `branchId`), `trigger` events arm world regions that set flags when a ship
 * enters them and `block` events create moving blocks from a tileset tile (`tile` → `tileId`,
 * resolved in the terrain pass). Enemy movers gain `ballistic` (thrown / falling bodies with an
 * optional proximity trigger and a landing rule).
 *
 * **Co-op (M2-06).** Player 2 flies the same ship in its palette-swap colours: for every ship the
 * loader interns the sprite `<sprite>@p2` (the asset pipeline derives it — {@link P2_SPRITE_SUFFIX})
 * and resolves it into {@link PlayerShipSpec.spriteP2Id}; `pnpm content:check` verifies the atlas
 * has it like every other sprite name the content uses.
 *
 * M2-10: {@link CampaignSpec} and its parts ({@link CampaignZoneSpec}, {@link CampaignEdgeSpec},
 * {@link CampaignEndingSpec}), {@link RUN_FLAG_NAMES}, {@link RunFlagName}, {@link runFlagMask},
 * {@link campaignRoutes}, {@link countCampaignRoutes}, {@link campaignZoneIndex},
 * {@link selectCampaignEnding}, {@link completeCampaign}, the limits ({@link MAX_CAMPAIGN_ZONES},
 * {@link MAX_ZONE_EXITS}, {@link MAX_ZONE_PREVIEW_LINES}, {@link MAX_CAMPAIGN_ENDINGS}), the bonus
 * entrances ({@link StageBonusEvent}, {@link BonusEntranceName}, {@link BONUS_ENTRANCES},
 * {@link BONUS_PLACES}, {@link DEFAULT_BONUS_WINDOW}, {@link DEFAULT_BONUS_PLACE},
 * {@link MAX_BONUS_ENTRANCES}).
 *
 * M2-14: the endings' scenes and texts and the campaign's credits ({@link ENDING_SCENES},
 * {@link EndingSceneName}, {@link CampaignCreditsSection}, {@link creditsLineCount} and the limits
 * {@link MAX_ENDING_TEXT_LINES}, {@link MAX_ENDING_LINE_LENGTH}, {@link MAX_CREDITS_SECTIONS},
 * {@link MAX_CREDITS_LINES}, {@link MAX_CREDITS_LINE_LENGTH}); a stage's music may name the
 * `ending` and `credits` cues its final zone needs ({@link StageMusic}).
 *
 * M2-15: the attract loop. A `replay` file (`content/demos/*.replay.json`) is a demo — a
 * `core/replay` recording of the 4-way bot with an `id` and a `description` ({@link DemoSpec},
 * {@link ContentDb.demos}, {@link MAX_DEMO_TICKS}); the loader checks its structure and that its
 * stage exists, `core/replay` decodes the recording when it plays. The campaign gained the
 * attract **story** ({@link CampaignStoryPage}, {@link STORY_SCENES}, {@link StorySceneName},
 * {@link MAX_STORY_PAGES}, {@link MAX_STORY_LINES}, {@link MAX_STORY_LINE_LENGTH}).
 *
 * M2-16: kind `strings` — the UI string tables (`content/strings/<language>.strings.json`,
 * {@link UiStringsSpec}, {@link ContentDb.uiStrings}): known ids only (`core/ui` `UI_TEXT_IDS`),
 * the bitmap font's glyphs only, one table per language.
 *
 * M3-01: the loops and the Extra Edit. A stage may carry a loop **remix** ({@link StageSpec.remix}:
 * up to {@link MAX_STAGE_REMIX} `spawn` / `formation` events, sorted, no branch) and any event may
 * name the loops it plays in (`minLoop` / `maxLoop` on {@link StageEventBase}, 1 – `MAX_LOOP`);
 * {@link stageEventInLoop} tests an event and {@link stageForLoop} builds the timeline of a loop
 * (loop 1 is the stage itself, so its event indices never change). A weapon may be an **Extra
 * Edit** weapon ({@link WeaponSpec.extra}). A `rules` file's `scoring` section gained the
 * score-milking cap (`repeatKills` / `repeatPercent` — `core/scoring` `ScoringRules`), and a demo's
 * header the optional `assists` flags (`core/replay` `ReplayHeader.assists`).
 *
 * **Other kinds.** `input-profiles`, `sfx`/`music` and `fx` files stay *foreign* here and are
 * validated by their owning packages (see plan §3.5). Hosts pass `knownScripts` (`core/behaviors`
 * `KNOWN_SCRIPT_IDS`) so script ids are checked; M1-03 checks `db.sprites` against the atlas.
 *
 * @remarks
 * Nothing in this module runs per tick: it allocates freely, uses `Map`s and reports **all**
 * problems of a load instead of throwing. {@link loadContent} throws only for a programming
 * error (a bad `files` argument). Developer guide: `docs/dev/content-data.md`.
 *
 * @module
 */
import {
  DEATH_PENALTY_PRESETS,
  DIFFICULTY_PRESETS,
  POWER_UP_MODES,
  MAX_BULLET_SPEED_MUL,
  MAX_CONTINUES,
  MAX_EXTEND_SCORE,
  MAX_LOOP,
  MAX_RANK_GROWTH,
  MIN_BULLET_SPEED_MUL,
  PLAYFIELD_H,
  PLAYFIELD_W,
  type DifficultyRules,
  type DifficultyTable,
  type PowerUpMode,
} from '../config/index.js';
import { MUSIC_CUES, SFX_CUES } from '../events/index.js';
import { MAX_PLAYERS } from '../input/index.js';
import { defineModule } from '../module-info.js';
import {
  EMPTY_PATTERN_BANK,
  PATTERNS_FILE_SCHEMA,
  compilePatternBank,
  type CollectedPatterns,
  type PatternBank,
} from '../patterns/dsl.js';
import {
  MAX_BULLET_CANCEL_POINTS,
  MAX_GRAZE_POINTS,
  MAX_REPEAT_KILLS,
  type ScoringRules,
} from '../scoring/index.js';
import {
  ENDING_SCENES,
  MAX_CAMPAIGN_ENDINGS,
  MAX_CAMPAIGN_ZONES,
  MAX_CREDITS_LINES,
  MAX_CREDITS_LINE_LENGTH,
  MAX_CREDITS_SECTIONS,
  MAX_ENDING_LINE_LENGTH,
  MAX_ENDING_TEXT_LINES,
  MAX_STORY_LINES,
  MAX_STORY_LINE_LENGTH,
  MAX_STORY_PAGES,
  MAX_ZONE_EXITS,
  MAX_ZONE_PREVIEW_LINES,
  RUN_FLAG_NAMES,
  STORY_SCENES,
  completeCampaign,
  type CampaignSpec,
} from './campaign.js';
import { bakePath, type PathTable } from './paths.js';
import { s, type RefSite, type Schema, type ValidationIssue } from './schema.js';
import { buildTilesetTables, expandTilemap, type TilesetTables } from './tilemap.js';
import {
  DEFAULT_UI_TEXT,
  MAX_UI_TEXT_LENGTH,
  UI_TEXT_IDS,
  isFixedUiTextId,
  isUiTextDrawable,
} from '../ui/strings.js';

export type { TilesetTables } from './tilemap.js';
export { MAX_PATH_LENGTH, PATH_SAMPLE_STEP, bakePath, type PathTable } from './paths.js';
export {
  ENDING_SCENES,
  MAX_CAMPAIGN_ENDINGS,
  MAX_CAMPAIGN_ZONES,
  MAX_CREDITS_LINES,
  MAX_CREDITS_LINE_LENGTH,
  MAX_CREDITS_SECTIONS,
  MAX_ENDING_LINE_LENGTH,
  MAX_ENDING_TEXT_LINES,
  MAX_STORY_LINES,
  MAX_STORY_LINE_LENGTH,
  MAX_STORY_PAGES,
  MAX_ZONE_EXITS,
  MAX_ZONE_PREVIEW_LINES,
  RUN_FLAG_NAMES,
  STORY_SCENES,
  campaignRoutes,
  campaignZoneIndex,
  completeCampaign,
  countCampaignRoutes,
  creditsLineCount,
  runFlagMask,
  selectCampaignEnding,
  type CampaignCreditsSection,
  type CampaignEdgeSpec,
  type CampaignEndingSpec,
  type CampaignSpec,
  type CampaignStoryPage,
  type CampaignZoneSpec,
  type EndingSceneName,
  type RunFlagName,
  type StorySceneName,
} from './campaign.js';

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
  specRefs: [
    'shmup_feat.md §14',
    'shmup_feat.md §22',
    'shmup_feat.md §7',
    'shmup_feat.md §11',
    'shmup_feat.md §15',
    'shmup_feat.md §21',
  ],
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
  'rules',
  'patterns',
  'campaign',
  'replay',
  'strings',
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
  /**
   * Resolved {@link ContentDb.sprites} index of player 2's palette-swap variant
   * `<sprite>`{@link P2_SPRITE_SUFFIX} (M2-06 — interned by {@link loadContent} for every ship; -1
   * without it, e.g. the built-in default ship: player 2 then uses {@link PlayerShipSpec.spriteId}).
   */
  readonly spriteP2Id: number;
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
  /**
   * The ship's power-up model (M2-05, shmup_feat.md §5 ship selection): `meter` (the KESTREL — the
   * default when omitted) or `direct` (the MANTA). The ship select sets `GameConfig.powerUpMode`
   * from it.
   */
  readonly mode: PowerUpMode;
  /**
   * Speed level a Direct-mode session starts the ship with (`core/weapons` `applyDirectLoadout` —
   * also after a continue) — an index into {@link PlayerShipSpec.speeds} (default 0). The MANTA
   * starts in the middle of its three speeds (decision D3: 2.25 px/tick; the Speed toggle cycles
   * the others). The meter's Speed Ups always start from level 0.
   */
  readonly startSpeedLevel: number;
}

/**
 * Suffix of player 2's palette-swap sprite of a ship (plan M2-06, shmup_feat.md §5 "co-op ships in
 * different colors"): the asset pipeline derives `ships/kestrel@p2` from `ships/kestrel`, and
 * {@link loadContent} interns `<sprite>@p2` for every ship ({@link PlayerShipSpec.spriteP2Id}).
 */
export const P2_SPRITE_SUFFIX = '@p2';

/** Where a weapon sits in a loadout (shmup_feat.md §7A/§7B). */
export type WeaponSlot = 'main' | 'double' | 'laser' | 'missile' | 'sub';

/** Every {@link WeaponSlot} value, for validation and menus. */
export const WEAPON_SLOTS = Object.freeze(['main', 'double', 'laser', 'missile', 'sub'] as const);

/** The slot of a Direct-mode shot family: the main shot (red items) or the sub-weapon (green). */
export type WeaponFamilySlot = 'main' | 'sub';

/** Most levels a Direct-mode family may have (shmup_feat.md §7B: 9 — levels 0 … 8). */
export const MAX_FAMILY_LEVELS = 9;

/** Most weapon emitters one level of a family may fire at once. */
export const MAX_LEVEL_SHOTS = 8;

/**
 * One projectile of a Direct-mode level's volley (M2-05): which weapon it fires and from where,
 * in which direction.
 */
export interface WeaponEmitterSpec {
  /** Weapon id (`weapons[].id`; its slot must be the family's). */
  readonly weapon: string;
  /** Resolved {@link ContentDb.weapons} index of {@link WeaponEmitterSpec.weapon}. */
  readonly weaponId: number;
  /**
   * Heading in binary units (1024 per turn, 0 = forward, 256 = down, 768 = up; default 0), on
   * top of nothing — the weapon's own `angle` tunable is not used by family volleys.
   */
  readonly angle?: number;
  /** Extra spawn offset x in pixels (added to the weapon's `ox`; default 0). */
  readonly ox?: number;
  /** Extra spawn offset y in pixels (added to the weapon's `oy`; default 0). */
  readonly oy?: number;
}

/** One level of a Direct-mode family: the volley it fires (M2-05). */
export interface WeaponLevelSpec {
  /** The volley's projectiles (1 … {@link MAX_LEVEL_SHOTS}). */
  readonly shots: readonly WeaponEmitterSpec[];
  /**
   * Ticks between volleys; omitted = the config's `autofireInterval` (main) or `missileInterval`
   * (sub).
   */
  readonly refireTicks?: number;
  /**
   * How many of this level's volleys may fly at once per shooter (1–16): a volley's shots of one
   * weapon fire only while `live + n ≤ volleys × n` (`n` = that weapon's shots in the volley);
   * omitted = the weapon's own `cap`.
   */
  readonly volleys?: number;
}

/**
 * A Direct-mode shot family (`content/weapons/*.weapons.json` `families`, shmup_feat.md §7B, plan
 * M2-05): the volleys of its levels 0 … `levels.length − 1`. The MANTA's main shot runs the
 * content's `main` families (the red octagon switches to the next one), its sub-weapon the first
 * `sub` family.
 */
export interface WeaponFamilySpec {
  /** Unique id, e.g. `beam-disc`. */
  readonly id: string;
  /** Name (upper case, ≤ 16 characters, e.g. `BEAM TO DISC`); omitted = the id in upper case. */
  readonly name?: string;
  /** The HUD's short label (upper case, ≤ 5 characters, e.g. `DISC`). */
  readonly label: string;
  /** Main shot or sub-weapon. */
  readonly slot: WeaponFamilySlot;
  /** The levels (1 … {@link MAX_FAMILY_LEVELS}). */
  readonly levels: readonly WeaponLevelSpec[];
}

/**
 * The Direct-mode item colours (shmup_feat.md §6B, plan M2-05): red (main shot +1 level), green
 * (sub-weapon +1 level), blue (the Arm shield: grant / repair / next tier), orange (1UP), yellow
 * (smart bomb), octagon (switch the main-shot family). A stage's `directItems` plan lists them.
 */
export const DIRECT_ITEMS = Object.freeze([
  'red',
  'green',
  'blue',
  'orange',
  'yellow',
  'octagon',
] as const);

/** One of {@link DIRECT_ITEMS}. */
export type DirectItemName = (typeof DIRECT_ITEMS)[number];

/** Most entries of a stage's `directItems` plan. */
export const MAX_DIRECT_ITEM_PLAN = 256;

/** One player weapon (`content/weapons/*.weapons.json`, shmup_feat.md §7C). */
export interface WeaponSpec {
  /** Unique id, e.g. `shot.basic`. */
  readonly id: string;
  /**
   * Name shown by the weapon select (upper case, ≤ 16 characters, e.g. `SPREAD BOMB` — plan
   * M2-03); omitted = the id in upper case.
   */
  readonly name?: string;
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
  /**
   * An **Extra Edit** weapon (M3-01 — shmup_feat.md §7A "[P2] Extra Edit (any combo) as an
   * unlock"): the weapon select's EDIT leaves it out; its EXTRA (unlocked by reaching an ending, or
   * by the title's secret code) offers every weapon of each slot, these included. Omitted = `false`.
   */
  readonly extra?: boolean;
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

/**
 * Optional per-enemy rank modifiers (shmup_feat.md §11 "rank modifiers per enemy", §15): how
 * strongly the enemy follows the rank's curves (`core/rank` `rankSensitivity`) — 1 (the default)
 * = the session's multiplier, 0 = unaffected by rank, 2 = twice the effect. At Normal's base rank
 * every value gives × 1, so the content's speeds and intervals stay the Normal values.
 */
export interface EnemyRankSpec {
  /** Modifier of the fire-rate curve (its fire intervals), 0–8 (default 1). */
  readonly fireRate?: number;
  /** Modifier of the bullet-speed curve, 0–8 (default 1). */
  readonly bulletSpeed?: number;
}

/**
 * The revenge ("suicide") bullet patterns an enemy may fire when it is shot down at a high rank
 * (shmup_feat.md §11): `aimed` — one bullet at the nearest player; `spread3` — an aimed 3-way
 * spread; `ring8` — eight bullets evenly round the circle, the first aimed.
 */
export const REVENGE_PATTERNS = Object.freeze(['aimed', 'spread3', 'ring8'] as const);

/** A {@link REVENGE_PATTERNS} name. */
export type RevengePattern = (typeof REVENGE_PATTERNS)[number];

/**
 * Revenge bullets (shmup_feat.md §11 "revenge (suicide) bullets on higher rank / loop 2+"): when a
 * player shoots the enemy down on screen while the rank is at least `minRank`, it fires `pattern`
 * from where it died (`core/enemies`; rank-scaled like every enemy bullet — not on a Mega Crash).
 */
export interface EnemyRevengeSpec {
  /** Lowest rank (0–31) at which the enemy fires revenge bullets. */
  readonly minRank: number;
  /** What it fires. */
  readonly pattern: RevengePattern;
  /** Bullet speed on Normal in px/tick (default {@link DEFAULT_REVENGE_SPEED}). */
  readonly speed?: number;
}

/** Default {@link EnemyRevengeSpec.speed} (px/tick on Normal). */
export const DEFAULT_REVENGE_SPEED = 1.25;

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

/**
 * What an enemy (or a completed formation) leaves behind: a power capsule (M1-11), the rare blue
 * capsule that clears the screen's enemies (meter mode, M2-04), or `powerup` (M2-05) — the
 * mode-agnostic power-up: a capsule in meter mode, the stage's next planned item in Direct mode
 * (the direct ship has no meter, so a `capsule` becomes that item too).
 */
export type EnemyDrop = 'capsule' | 'blueCapsule' | 'powerup' | 'oneUp' | 'bonusCapsule';

/** Every {@link EnemyDrop}, in code order (the index + 1 is the drop code; 0 = none). */
export const ENEMY_DROPS = Object.freeze([
  'capsule',
  'blueCapsule',
  'powerup',
  'oneUp',
  'bonusCapsule',
] as const);

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
  'ballistic',
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
    }
  | {
      /**
       * Thrown or falling (M2-07): starts at (`vx`, `vy`), `gravity` adds to `vy` every tick (at
       * most `maxFall`); with `trigger` > 0 it waits, still, until the nearest player is within
       * `trigger` px horizontally (falling rocks); `land` says what terrain does to it.
       */
      readonly type: 'ballistic';
      /** Starting horizontal velocity. */
      readonly vx: number;
      /** Starting vertical velocity (negative = up). */
      readonly vy: number;
      /** Added to `vy` every tick (default 0). */
      readonly gravity?: number;
      /** Fastest fall in px/tick (default 0 = no limit). */
      readonly maxFall?: number;
      /** Proximity trigger distance in px (default 0 = moves at once). */
      readonly trigger?: number;
      /** `pass` through terrain, `stop` on it (default) or `shatter` (destroyed on landing). */
      readonly land?: BallisticLandName;
    };

/** What terrain does to a `ballistic` mover (M2-07): the index is the `core/patterns` code. */
export type BallisticLandName = 'pass' | 'stop' | 'shatter';

/** Every {@link BallisticLandName}, in code order. */
export const BALLISTIC_LANDS = Object.freeze(['pass', 'stop', 'shatter'] as const);

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
  /**
   * Whether it is an **Option Hunter** (plan M2-04, shmup_feat.md §8 / §11; default `false`): it
   * spawns only while some ship owns an Option (with an alarm), steals the Options it touches,
   * never hurts a ship by contact, and frees what it carries when it dies (`core/enemies`).
   */
  readonly optionHunter: boolean;
  /** Enemy a spawner releases (`hatch.spawner`), or `null` (default). */
  readonly child: string | null;
  /** Resolved {@link ContentDb.enemies} index of {@link EnemySpec.child} (-1 = none). */
  readonly childId: number;
  /**
   * The `content/patterns/` action the enemy's behaviour runs (plan M2-02 — the `pattern.loop`
   * behaviour and `ScriptApi.startPattern`), or `null` (default).
   */
  readonly pattern: string | null;
  /** Resolved {@link ContentDb.patterns} action index of {@link EnemySpec.pattern} (-1 = none). */
  readonly patternId: number;
  /** Rank modifiers (default: none — both 1). */
  readonly rank?: EnemyRankSpec;
  /** Revenge bullets (default: none). */
  readonly revenge?: EnemyRevengeSpec;
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
 * What a boss is to its stage (M2-09, shmup_feat.md §13): `boss` — a stage boss (the WARNING, the
 * scroll lock, the stage clear after its death sequence); `captain` — a mid-boss that flies in
 * with a `boss` event, rides the scrolling camera until destroyed, never locks the scroll, keeps
 * the stage music and ends with a short death sequence (no stage clear).
 */
export type BossRoleName = 'boss' | 'captain';

/** Every {@link BossRoleName}, in code order (the index is the `core/bosses` `BossRole` code). */
export const BOSS_ROLES = Object.freeze(['boss', 'captain'] as const);

/** Most camera segments one raid may list. */
export const MAX_RAID_SEGMENTS = 16;

/** Default length of a raid camera segment's move, in ticks. */
export const DEFAULT_RAID_SEGMENT_TICKS = 120;

/** Default fire-interval factor of an enraged boss (its partner died): shorter waits. */
export const DEFAULT_ENRAGE_FIRE_RATE = 0.625;

/** Default motion-speed factor of an enraged boss. */
export const DEFAULT_ENRAGE_SPEED = 1.5;

/** Most heading frames a turned part's sprite may have (`BossPartSpec.turn`). */
export const MAX_TURN_FRAMES = 64;

/**
 * One segment of a raid's camera path (M2-09): the camera's top-left corner moves to `x` / `y`
 * **relative to the boss's origin** (eased in-out over `ticks`), then stays there `hold` ticks
 * while the boss moves — so the camera keeps following the boss.
 */
export interface BossRaidSegmentSpec {
  /** Camera left edge minus the boss's origin x, in pixels. */
  readonly x: number;
  /** Camera top edge minus the boss's origin y, in pixels. */
  readonly y: number;
  /** Ticks of the move to this offset (default {@link DEFAULT_RAID_SEGMENT_TICKS}; 0 = at once). */
  readonly ticks: number;
  /** Ticks the camera then stays at the offset (default 0). */
  readonly hold: number;
}

/**
 * A **battleship raid** (M2-09, shmup_feat.md §13 "huge bosses bigger than the screen that you fly
 * around"): the boss is anchored in the world where it entered instead of riding the camera, and
 * from the start of its fight the camera pans around it along `segments` (boss-relative).
 */
export interface BossRaidSpec {
  /** The camera path (1–{@link MAX_RAID_SEGMENTS}). */
  readonly segments: readonly BossRaidSegmentSpec[];
  /** Start again from the first segment after the last (default `true`; `false` = stay). */
  readonly loop: boolean;
}

/**
 * How a boss of a double boss enrages when its partner dies (M2-09, "survivor speeds up"): its
 * fire intervals are multiplied by `fireRate`, its motion speeds by `speed`, and — when `phase` is
 * a later phase than the running one — it jumps to that phase.
 */
export interface BossEnrageSpec {
  /** Fire-interval factor (0.1–1; default {@link DEFAULT_ENRAGE_FIRE_RATE}). */
  readonly fireRate: number;
  /** Motion-speed factor (1–4; default {@link DEFAULT_ENRAGE_SPEED}). */
  readonly speed: number;
  /** Phase index to jump to (default -1 = keep the phase). */
  readonly phase: number;
}

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
  /**
   * Half-extents of the hurtbox (also the contact box), or `null`: never hit, never touched
   * (unless it has a {@link BossPartSpec.radius}).
   */
  readonly hurtbox: BoxSpec | null;
  /**
   * A **circle** hurtbox instead of the box (M2-09 — rotated parts are hit as circles): its radius
   * in pixels, 0 = none (default). Not with `hurtbox`.
   */
  readonly radius: number;
  /**
   * The part's turn relative to its parent, in binary angle units (1024 per turn, clockwise;
   * default 0, M2-09): the offsets of the parts attached to it are turned by its world angle (the
   * parent's plus its own).
   */
  readonly angle: number;
  /** Turn speed in binary units per tick (default 0; M2-09): a rotating arm, a ring of pods. */
  readonly spin: number;
  /**
   * Heading frames (M2-09; default 0 = none): the sprite's frames show the part turned to
   * `frame × 1024 / turn` units, and the part is drawn with the frame nearest its world angle (a
   * turret). Not with `anim`; needs a circle hurtbox (`radius`) when it has one — boxes never turn.
   */
  readonly turn: number;
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
  /** Stage boss or mid-boss (default `boss`; M2-09 — {@link BossRoleName}). */
  readonly role: BossRoleName;
  /**
   * Fight ticks after which the boss **escapes** (M2-09, shmup_feat.md §13 "boss timer / escape"):
   * it stops fighting, flies off and the World records the `BossEscaped` ending flag; 0 (default)
   * = no limit.
   */
  readonly timeLimit: number;
  /** A battleship raid's camera path (M2-09), or `null` (default: the boss rides the camera). */
  readonly raid: BossRaidSpec | null;
  /** The boss that enters together with this one — a double boss (M2-09), or `null`. */
  readonly partner: string | null;
  /** Resolved {@link ContentDb.enemies} index of {@link BossSpec.partner} (-1 = none). */
  readonly partnerId: number;
  /**
   * With a partner: ticks each of the pair fights in turn while the other withdraws to the back
   * (M2-09, "alternating"); 0 (default) = both fight at once.
   */
  readonly alternate: number;
  /** How this boss enrages when its partner dies (M2-09; defaults when omitted). */
  readonly enrage: BossEnrageSpec;
  /** The boss inside this one, revealed by its final blast (M2-09), or `null`. */
  readonly inner: string | null;
  /** Resolved {@link ContentDb.enemies} index of {@link BossSpec.inner} (-1 = none). */
  readonly innerId: number;
  /** A regular enemy its behaviours launch (`BossScriptApi.launch`, M2-09), or `null`. */
  readonly minion: string | null;
  /** Resolved {@link ContentDb.enemies} index of {@link BossSpec.minion} (-1 = none). */
  readonly minionId: number;
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
   * A **diagonal** pan (M2-07): the camera y moves linearly to `yTo` while the camera scrolls this
   * many pixels past `x` (needs `yTo`; not with `yTicks`).
   */
  readonly yOver?: number;
  /**
   * Scroll lock (bosses): the camera stops exactly at `x` and stays until the runner is
   * unlocked (the boss dies, M1-13); then it scrolls on at `speed`.
   */
  readonly lock?: boolean;
  /**
   * A timed **scroll stop** (M2-07 — vertical sections): the camera stops exactly at `x`, stays
   * this many ticks (a `yTo` pan runs meanwhile), then scrolls on at `speed` (with `ramp`). Not
   * with `lock`.
   */
  readonly hold?: number;
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

/** The layers a stage's raster effect may distort (M2-08): the backgrounds and the terrain. */
export const STAGE_RASTER_LAYERS = Object.freeze(['far', 'mid', 'terrain'] as const);

/** One of {@link STAGE_RASTER_LAYERS}. */
export type StageRasterLayerName = (typeof STAGE_RASTER_LAYERS)[number];

/**
 * Raster effect kinds (M2-08; the index is the core `presentation` `RasterKind` code): `wave`
 * (wavy water), `haze` (heat haze), `lines` (line-band parallax floor).
 */
export const STAGE_RASTER_KINDS = Object.freeze(['wave', 'haze', 'lines'] as const);

/** One of {@link STAGE_RASTER_KINDS}. */
export type StageRasterKindName = (typeof STAGE_RASTER_KINDS)[number];

/**
 * The layers a stage's palette cycle may recolour (M2-08): the backgrounds, the terrain and the
 * enemy layers (`ground`, `air` — glowing cores).
 */
export const STAGE_CYCLE_LAYERS = Object.freeze([
  'far',
  'mid',
  'terrain',
  'ground',
  'air',
] as const);

/** One of {@link STAGE_CYCLE_LAYERS}. */
export type StageCycleLayerName = (typeof STAGE_CYCLE_LAYERS)[number];

/** Most raster effects one stage may have. */
export const MAX_STAGE_RASTER_EFFECTS = 8;

/** Most palette cycles one stage may have. */
export const MAX_STAGE_COLOR_CYCLES = 8;

/**
 * Most cycled colours on one layer (all its cycles together — the layer shader compares every
 * pixel with each of them).
 */
export const MAX_CYCLE_COLORS_PER_LAYER = 8;

/** Most bands one `lines` raster effect may list ({@link StageRasterEffect.bands}). */
export const MAX_RASTER_BANDS = 64;

/** Default {@link StageRasterEffect.period}: two seconds per sine period. */
export const DEFAULT_RASTER_PERIOD = 120;

/**
 * One **raster effect** of a stage (M2-08, shmup_feat.md §18 "Raster/HDMA-style effects"): a
 * per-scanline horizontal offset the renderer applies to one layer while the camera is inside
 * `[from, to)` — presentation only, the simulation never reads it.
 *
 * @remarks
 * `top` / `bottom` are playfield rows on screen (0 = just under the top HUD bar). `wave` and
 * `haze` need `amplitude` and `wavelength`; `lines` needs `factorTop` and `factorBottom` (and
 * usually `wrap`, the distorted art's repeat, so the rows wrap seamlessly; with `bands` the rows
 * scroll in strips). Effects on the same layer add up.
 */
export interface StageRasterEffect {
  /** The layer distorted. */
  readonly layer: StageRasterLayerName;
  /** Effect kind. */
  readonly kind: StageRasterKindName;
  /** First playfield row affected (0 … 199). */
  readonly top: number;
  /** Row after the last affected (`top < bottom ≤ 200`). */
  readonly bottom: number;
  /** Peak offset in pixels (`wave`, `haze`; 0 in `lines`). */
  readonly amplitude: number;
  /** Rows per sine period (`wave`, `haze`; default 32). */
  readonly wavelength: number;
  /**
   * Ticks per sine period over time (`wave`, `haze`; default {@link DEFAULT_RASTER_PERIOD};
   * 0 = still).
   */
  readonly period: number;
  /** Scroll factor of the top row (`lines`; default 0). */
  readonly factorTop: number;
  /** Scroll factor of the bottom row (`lines`; default 0). */
  readonly factorBottom: number;
  /**
   * `lines` only: heights of the art's horizontal bands, top → bottom (they sum to `bottom − top`;
   * ≤ 64 bands). Every row of band `i` scrolls at the factor interpolated for the band
   * (`factorTop` … `factorBottom` by `i / (n − 1)`), so a band moves as one strip; empty (the
   * default) = every row its own factor.
   */
  readonly bands: readonly number[];
  /** Horizontal repeat of the distorted art in pixels (default 0 = clamp at the screen edges). */
  readonly wrap: number;
  /** Camera x from which the effect is on (default 0). */
  readonly from: number;
  /** Camera x from which it is off (default `Infinity` — to the stage's end). */
  readonly to: number;
}

/** Default {@link StageMode7.scroll}: a quarter of a texel forward per pixel of camera x. */
export const DEFAULT_MODE7_SCROLL = 0.25;

/** Default {@link StageMode7.fogDepth} in texels. */
export const DEFAULT_MODE7_FOG_DEPTH = 96;

/**
 * A stage's **Mode-7 floor** (M3-02, shmup_feat.md §18 "[P2] Mode 7-style effects: scaling /
 * rotation, pseudo-3D floor (per-row affine matrix in shader)", §14 "[P2] pseudo-3D high-speed
 * dimension stage"): a ground plane drawn under the horizon by `render-pixi`'s Mode-7 filter while
 * the camera is inside `[from, to)` — presentation only, the simulation never reads it.
 *
 * @remarks
 * The plane is tiled with frame 0 of `sprite`, one tile per `1 × 1` of plane space. Every row `y`
 * below `horizon` sees the plane at depth `height / (y − horizon)`, so `height` sets how fast it
 * rushes past; the plane's own position follows the **camera** (`scroll` texels forward per pixel
 * of camera x, `sway` texels sideways per pixel of camera y), so the floor and the stage never
 * drift apart and nothing has to be simulated.
 */
export interface StageMode7 {
  /** Atlas sprite whose frame 0 tiles the plane. */
  readonly sprite: string;
  /** Resolved {@link ContentDb.sprites} index of {@link StageMode7.sprite}. */
  readonly spriteId: number;
  /** Playfield row of the horizon (the plane vanishes there; 0 … `PLAYFIELD_H` − 2). */
  readonly horizon: number;
  /** Last playfield row the plane is drawn on (`horizon < bottom ≤ PLAYFIELD_H`). */
  readonly bottom: number;
  /** Camera height above the plane in texels: the bigger, the further the view reaches. */
  readonly height: number;
  /** Texels the plane moves forward per pixel of camera x (default {@link DEFAULT_MODE7_SCROLL}). */
  readonly scroll: number;
  /** Texels the plane slides sideways per pixel of camera y (default 0). */
  readonly sway: number;
  /** How far the plane is turned, in binary units `[0, 1024)` (default 0 — straight ahead). */
  readonly turn: number;
  /** Fog colour at the horizon as written (`#rrggbb`). */
  readonly fog: string;
  /** Fog colour as 0xRRGGBB (resolved by the loader). */
  readonly fogRgb: number;
  /** Depth in texels over which the plane fades into the fog (default {@link DEFAULT_MODE7_FOG_DEPTH}). */
  readonly fogDepth: number;
  /** Opacity of the whole floor, 0 … 1 (default 1). */
  readonly alpha: number;
  /** Camera x from which the floor is drawn (default 0). */
  readonly from: number;
  /** Camera x from which it stops (default `Infinity`). */
  readonly to: number;
}

/**
 * One **palette cycle** of a stage (M2-08, shmup_feat.md §18 "palette cycling (glowing cores,
 * water, lava)"): pixels of the layer drawn in `colors[i]` show `colors[(i + step) mod n]`, `step`
 * advancing every `ticks` ticks while the camera is inside `[from, to)`. The art has to use the
 * ramp's exact colours. Presentation only.
 */
export interface StageColorCycle {
  /** The layer recoloured. */
  readonly layer: StageCycleLayerName;
  /** The ramp as written (`#rrggbb`, 2 … 8, distinct). */
  readonly colors: readonly string[];
  /** The ramp as 0xRRGGBB numbers (resolved by the loader). */
  readonly rgb: readonly number[];
  /** Ticks per step. */
  readonly ticks: number;
  /** Camera x from which the cycle runs (default 0). */
  readonly from: number;
  /** Camera x from which it stops (default `Infinity`). */
  readonly to: number;
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
  /**
   * Cue of the ending theme the campaign's ending screen plays after this stage (M2-14 — a final
   * zone names `Ending`, so the host prepares it with the zone's set; absent for other stages).
   */
  readonly ending?: string;
  /** Resolved music cue id of {@link StageMusic.ending} (-1 = none; absent on hand-built specs). */
  readonly endingId?: number;
  /** Cue of the credits theme that follows the ending (M2-14; absent = none). */
  readonly credits?: string;
  /** Resolved music cue id of {@link StageMusic.credits} (-1 = none). */
  readonly creditsId?: number;
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

/**
 * What every stage event has: its camera x and, since M2-07, an optional **branch** (in-stage
 * branching paths, shmup_feat.md §14): an event naming a branch fires only while that branch is
 * taken (its flag has the branch's value — {@link StageBranch}); otherwise the camera passes it.
 */
export interface StageEventBase {
  /** Camera X that fires the event. */
  readonly x: number;
  /** Id of the {@link StageBranch} the event belongs to (omitted = always). */
  readonly branch?: string;
  /** Index of {@link StageEventBase.branch} in {@link StageSpec.branches} (-1 = none). */
  readonly branchId?: number;
  /**
   * The first loop the event plays in (M3-01 — shmup_feat.md §15 "2nd loop with remixed layouts";
   * `GameConfig.loop`): 1–8, omitted = 1. A `spawn` / `formation` event with `minLoop: 2` is part
   * of the loops' remix; the camera passes it on loop 1 like an event of a branch not taken.
   */
  readonly minLoop?: number;
  /**
   * The last loop the event plays in (M3-01): 1–8, omitted = every loop. `maxLoop: 1` keeps a part
   * of the layout that a loop remix replaces.
   */
  readonly maxLoop?: number;
}

/**
 * Whether a stage event plays in a loop (M3-01): its `minLoop` (default 1) ≤ `loop` ≤ its `maxLoop`
 * (default every loop).
 *
 * @param event - The event.
 * @param loop - The loop (`GameConfig.loop`).
 * @returns `true` when the stage runner fires it in that loop (its branch permitting).
 *
 * @example
 * ```ts
 * stageEventInLoop({ x: 0, minLoop: 2 }, 1); // → false (the loop-2 remix)
 * ```
 */
export function stageEventInLoop(
  event: Readonly<Pick<StageEventBase, 'minLoop' | 'maxLoop'>>,
  loop: number,
): boolean {
  const min = event.minLoop ?? 1;
  const max = event.maxLoop ?? MAX_LOOP;
  return loop >= min && loop <= max;
}

/** Spawn one enemy when the camera reaches `x` (`core/enemies` spawns it). */
export interface StageSpawnEvent extends StageEventBase {
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
export interface StageFormationEvent extends StageEventBase {
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
  /**
   * What the completed formation drops (default `capsule`; `blueCapsule` — M2-04; `null` =
   * nothing).
   */
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
export interface StageBossEvent extends StageEventBase {
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
export interface StageMusicEvent extends StageEventBase {
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
export interface StageSpeedEvent extends StageEventBase {
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
export interface StageFlagEvent extends StageEventBase {
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
export interface StageEndEvent extends StageEventBase {
  /** Camera X that fires the event. */
  readonly x: number;
  /** Discriminator. */
  readonly type: 'end';
}

/** A world-space rectangle in pixels (a trigger's region). */
export interface StageRegion {
  /** Left edge (world x). */
  readonly x: number;
  /** Top edge (world y). */
  readonly y: number;
  /** Width (> 0). */
  readonly w: number;
  /** Height (> 0). */
  readonly h: number;
}

/**
 * A **region trigger** (M2-07, in-stage branches): from the camera reaching `x` until it passes
 * `until`, the first living player ship whose centre enters `region` sets (or clears) `flag` —
 * branches ({@link StageBranch}) then pick the events that follow.
 */
export interface StageTriggerEvent extends StageEventBase {
  /** Camera X that arms the trigger. */
  readonly x: number;
  /** Discriminator. */
  readonly type: 'trigger';
  /** Flag name (per stage). */
  readonly flag: string;
  /** Index of the flag in {@link StageSpec.flagNames}. */
  readonly flagId: number;
  /** `true` (default) sets the flag, `false` clears it. */
  readonly value?: boolean;
  /** World rectangle a ship's centre must enter. */
  readonly region: StageRegion;
  /** Camera x where the trigger disarms (default: `region.x + region.w`, the region gone by). */
  readonly until?: number;
}

/**
 * A **moving block** (M2-07, shmup_feat.md §14 moving floors / ceilings): a `w` × `h` box of the
 * tileset's tile `tile` (drawn tile by tile) appearing at world x `x + screenX`, world y `y`, that
 * moves `vx` / `vy` px per tick and swings `dx` / `dy` px around that path (a table sine of
 * `period` ticks from `phase`). Every terrain query treats it as terrain of the tile's type.
 */
export interface StageBlockEvent extends StageEventBase {
  /** Camera X that creates the block. */
  readonly x: number;
  /** Discriminator. */
  readonly type: 'block';
  /** Left edge relative to the event's `x` (default 400: just past the view's right edge). */
  readonly screenX?: number;
  /** Top edge in world pixels. */
  readonly y: number;
  /** Width in pixels (a multiple of the tile size). */
  readonly w: number;
  /** Height in pixels (a multiple of the tile size). */
  readonly h: number;
  /** Name of the tileset tile that draws it and gives its collision type (default `solid`). */
  readonly tile?: string;
  /** Resolved tile id of {@link StageBlockEvent.tile} (set by the loader's terrain pass). */
  readonly tileId: number;
  /** Drift in px/tick (default 0). */
  readonly vx?: number;
  /** Drift in px/tick (default 0). */
  readonly vy?: number;
  /** Swing amplitude in px (default 0). */
  readonly dx?: number;
  /** Swing amplitude in px (default 0). */
  readonly dy?: number;
  /** Swing period in ticks (default 120). */
  readonly period?: number;
  /** Swing phase in binary-angle units (default 0). */
  readonly phase?: number;
}

/**
 * How a hidden bonus stage's entrance opens (M2-10, shmup_feat.md §14 "hidden bonus stages"):
 * `gap` — a living ship flies into a marked region; `ground` — every ground enemy that appeared in
 * the window was destroyed by the players; `digit` — a playing ship's score shows a given digit
 * when the window closes.
 */
export type BonusEntranceName = 'gap' | 'ground' | 'digit';

/** Every {@link BonusEntranceName}, in code order (the index is the entrance's code). */
export const BONUS_ENTRANCES = Object.freeze(['gap', 'ground', 'digit'] as const);

/** Default length of a `ground` entrance's window, in camera pixels. */
export const DEFAULT_BONUS_WINDOW = 600;

/** Default place of a `digit` entrance's digit (100 = the hundreds). */
export const DEFAULT_BONUS_PLACE = 100;

/** Places a `digit` entrance may read (the last digit is the continue count — never read). */
export const BONUS_PLACES = Object.freeze([10, 100, 1000, 10000, 100000] as const);

/** Most `bonus` events one stage may have. */
export const MAX_BONUS_ENTRANCES = 8;

/**
 * A **hidden bonus-stage entrance** (M2-10, shmup_feat.md §14): from the camera reaching `x`
 * until it passes `until`, the entrance waits for its condition ({@link BonusEntranceName}); when
 * it opens the World records it (`core/stage` `BonusEntrances.entered`) and the scene flow flies
 * the players into `stage` (a stage of type `bonus`). Clearing the bonus stage skips the zone's
 * boss; a death in it sends the players back here and locks the entrance.
 */
export interface StageBonusEvent extends StageEventBase {
  /** Camera X that arms the entrance. */
  readonly x: number;
  /** Discriminator. */
  readonly type: 'bonus';
  /** The bonus stage (a stage of type `bonus`). */
  readonly stage: string;
  /** Resolved `ContentDb.stages` index of {@link StageBonusEvent.stage}. */
  readonly stageId: number;
  /** What opens it. */
  readonly entrance: BonusEntranceName;
  /** `gap`: the world rectangle a living ship's centre must enter. */
  readonly region?: StageRegion;
  /**
   * Camera x where the window closes (the loader fills the default: `gap` the region's right
   * edge, `ground` `x +` {@link DEFAULT_BONUS_WINDOW}, `digit` `x` — the digit is read on
   * arrival).
   */
  readonly until: number;
  /** `digit`: the digit 0–9 the score must show. */
  readonly digit?: number;
  /** `digit`: which place ({@link BONUS_PLACES}; the loader fills {@link DEFAULT_BONUS_PLACE}). */
  readonly place: number;
}

/** One entry of a stage timeline, fired when the camera reaches its `x`. */
export type StageEvent =
  | StageSpawnEvent
  | StageFormationEvent
  | StageBossEvent
  | StageMusicEvent
  | StageSpeedEvent
  | StageFlagEvent
  | StageEndEvent
  | StageTriggerEvent
  | StageBlockEvent
  | StageBonusEvent;

/**
 * Every stage event `type`, in schema order (M2-07 appended `trigger` and `block`, M2-10
 * `bonus`).
 */
export const STAGE_EVENT_TYPES = Object.freeze([
  'spawn',
  'formation',
  'warning',
  'boss',
  'music',
  'speed',
  'flag',
  'end',
  'trigger',
  'block',
  'bonus',
] as const);

/** Most distinct flags one stage may use (they are bits of one 32-bit mask). */
export const MAX_STAGE_FLAGS = 32;

/** Most `trigger` events one stage may have (their states are bits of 32-bit masks). */
export const MAX_STAGE_TRIGGERS = 32;

/** Most branches one stage may declare. */
export const MAX_STAGE_BRANCHES = 32;

/** Most tiles (cells) one moving block may cover. */
export const MAX_BLOCK_CELLS = 64;

/** Default {@link StageBlockEvent.screenX}: the block appears just past the view's right edge. */
export const DEFAULT_BLOCK_SCREEN_X = 400;

/** Default swing period of a moving block, in ticks. */
export const DEFAULT_BLOCK_PERIOD = 120;

/**
 * An in-stage **branch** (M2-07, shmup_feat.md §14 "in-stage branching paths"): the events naming
 * it fire only while stage flag `flag` equals `value` — region triggers and `flag` events set the
 * flags, branches select the event groups.
 */
export interface StageBranch {
  /** Unique id inside the stage (lower-case kebab), named by events' `branch`. */
  readonly id: string;
  /** The flag it reads. */
  readonly flag: string;
  /** Index of the flag in {@link StageSpec.flagNames}. */
  readonly flagId: number;
  /** The flag value that takes the branch (default `true`). */
  readonly value: boolean;
}

/**
 * What kind of stage it is (M2-09): `normal` — a zone with its timeline; `bossRush` — a boss-rush
 * sequence (shmup_feat.md §13 "boss rush stage"): its `rush` bosses come one after another and the
 * last one's death clears the stage; `bonus` (M2-10) — a hidden bonus stage entered from a zone's
 * `bonus` event: no boss, no rush, an `end` event, no entrances of its own (shmup_feat.md §14).
 */
export type StageType = 'normal' | 'bossRush' | 'bonus';

/** Every {@link StageType} (M2-10 appended `bonus`). */
export const STAGE_TYPES = Object.freeze(['normal', 'bossRush', 'bonus'] as const);

/** Most bosses one boss rush may list. */
export const MAX_RUSH_BOSSES = 16;

/** Most events one stage's loop remix may list (M3-01 — {@link StageSpec.remix}). */
export const MAX_STAGE_REMIX = 64;

/** Default wait before a boss of a rush comes (after the stage start or the last one's end). */
export const DEFAULT_RUSH_DELAY = 60;

/** One boss of a boss rush (`StageSpec.rush`, M2-09). */
export interface StageRushEntry {
  /** The boss (an enemy with a `boss` section of role `boss`). */
  readonly enemy: string;
  /** Resolved {@link ContentDb.enemies} index of {@link StageRushEntry.enemy}. */
  readonly enemyId: number;
  /** Ticks to wait before it comes (default {@link DEFAULT_RUSH_DELAY}). */
  readonly delay: number;
  /** Whether it comes with the WARNING (default `false`: it flies in at once). */
  readonly warning: boolean;
}

/** One stage/zone (`content/stages/*.stage.json`, shmup_feat.md §14). */
export interface StageSpec {
  /** Unique id, referenced by the zone map. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** `normal` (default) or `bossRush` (M2-09 — {@link StageType}). */
  readonly type: StageType;
  /**
   * The bosses of a `bossRush` stage, in order (M2-09; empty — and not allowed — on a `normal`
   * one).
   */
  readonly rush: readonly StageRushEntry[];
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
  /** Raster effects (M2-08; omitted in the file = none). Presentation only. */
  readonly raster: readonly StageRasterEffect[];
  /** Palette cycles (M2-08; omitted in the file = none). Presentation only. */
  readonly cycles: readonly StageColorCycle[];
  /** The Mode-7 floor (M3-02; omitted in the file = none). Presentation only. */
  readonly mode7: StageMode7 | null;
  /** Terrain block, or `null` for an open-space stage. */
  readonly tilemap: StageTilemapSpec | null;
  /** Timeline, sorted by `x` (several events may share one `x`; they fire in file order). */
  readonly events: readonly StageEvent[];
  /**
   * The loops' **remix** (M3-01 — shmup_feat.md §15 "2nd loop with remixed layouts"): extra
   * `spawn` / `formation` events, sorted by `x`, that join the timeline from loop 2
   * (`GameConfig.loop` — {@link stageForLoop} merges them by `x` after the events of the same `x`;
   * their own `minLoop` / `maxLoop` still apply). No `branch`, at most {@link MAX_STAGE_REMIX}.
   * Omitted in the file = none. Loop 1 plays {@link StageSpec.events} alone, so the remix never
   * changes it.
   */
  readonly remix: readonly StageEvent[];
  /**
   * Distinct flag names of the `flag` and `trigger` events and the branches, sorted (a flag's
   * index is its bit).
   */
  readonly flagNames: readonly string[];
  /** The in-stage branches (M2-07; omitted in the file = none). */
  readonly branches: readonly StageBranch[];
  /**
   * The Direct-mode item plan (M2-05): the colours the stage's `powerup` (and `capsule`) drops
   * hand out in Direct mode, in order, cycling — empty (omitted) = `core/powerups`
   * `DEFAULT_DIRECT_ITEM_PLAN`. Meter mode ignores it, so the stage data stays mode-agnostic.
   */
  readonly directItems: readonly DirectItemName[];
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
  /**
   * Hit points: the tile is **destructible** (M2-07, shmup_feat.md §14) and breaks after this much
   * damage from player shots (omitted = indestructible; not for `empty` tiles).
   */
  readonly hp?: number;
  /**
   * Ticks a destructible tile takes to heal its damage and to grow back after breaking (organic
   * walls; omitted = never).
   */
  readonly regen?: number;
  /** Points for breaking the tile (omitted = 0). */
  readonly score?: number;
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
  /** Direct-mode shot families (M2-05), in file order. */
  readonly weaponFamilies: readonly WeaponFamilySpec[];
  /** Family id → {@link ContentDb.weaponFamilies} index. */
  readonly weaponFamilyIndex: ReadonlyMap<string, number>;
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
  /**
   * The difficulty presets of a `rules` file's `difficulty` section (M2-01,
   * `content/rules/difficulty.rules.json`), or `null` when no file has one — sessions then use
   * `core/config` `DEFAULT_DIFFICULTY_TABLE` (`createGame` passes this to `resolveGameConfig`).
   */
  readonly difficulty: DifficultyTable | null;
  /**
   * The `scoring` section of a `rules` file (M2-02, `content/rules/scoring.rules.json`), or `null`
   * when no file has one — the World then uses `core/scoring` `DEFAULT_SCORING_RULES`.
   */
  readonly scoring: ScoringRules | null;
  /**
   * The compiled bullet patterns of every `content/patterns/` file (M2-02, `core/patterns`
   * `PatternBank`): enemies refer to an action by id (`pattern` → `patternId`). Empty without
   * pattern files.
   */
  readonly patterns: PatternBank;
  /**
   * The zone map of the `content/campaign/` file (M2-10, `data/campaign` {@link CampaignSpec}):
   * zones, edges and endings — or `null` when no file has one (the scene flow then plays single
   * stages).
   */
  readonly campaign: CampaignSpec | null;
  /**
   * The attract loop's demos (M2-15): the `content/demos/*.replay.json` files, in path order
   * ({@link DemoSpec}; empty without any — the attract loop then has no demo play).
   */
  readonly demos: readonly DemoSpec[];
  /** Demo id → index in {@link ContentDb.demos}. */
  readonly demoIndex: ReadonlyMap<string, number>;
  /**
   * The UI string tables (M2-16): one per `content/strings/*.strings.json` file (a language), in
   * path order — the scene flow shows `core/ui` `DEFAULT_LANGUAGE`'s, over the built-in English
   * table (`core/ui` `resolveUiText`). Empty without any.
   */
  readonly uiStrings: readonly UiStringsSpec[];
}

/**
 * A UI string table (M2-16 — `content/strings/<language>.strings.json`, kind `strings`): the
 * labels of the canvas UI by id (`core/ui` `UI_TEXT_IDS`) in one language. The loader checks every
 * id is known and every text is 1–{@link MAX_UI_TEXT_LENGTH} characters of the bitmap font's glyph
 * set (printable ASCII and `← ↑ → ↓ ● ★ ✕`); missing ids fall back to English when resolved.
 */
export interface UiStringsSpec {
  /** Language id (`en`, `fr`, `pt-br` — lower-case ISO 639-1, optionally a region). */
  readonly language: string;
  /** Id → text. */
  readonly strings: Readonly<Record<string, string>>;
}

/** Longest recording a demo file may hold: 5 minutes at 60 Hz (M2-15). */
export const MAX_DEMO_TICKS = 18_000;

/**
 * One demo of the attract loop (M2-15 — shmup_feat.md §16 "attract / demo mode plays bundled
 * replays"): a `content/demos/*.replay.json` file, a `core/replay` recording of the 4-way playtest
 * bot. The loader checks the document's structure and its stage; `core/replay` `decodeReplay`
 * decodes {@link DemoSpec.document} when the attract loop plays it.
 */
export interface DemoSpec {
  /** Unique id (the zone it shows, e.g. `zone-a`). */
  readonly id: string;
  /** What it shows (default `''`). */
  readonly description: string;
  /** The recorded stage id (`header.stageId`; `null` = free flight). */
  readonly stage: string | null;
  /** Resolved `ContentDb.stages` index of {@link DemoSpec.stage} (-1 for free flight or unknown). */
  readonly stageIndex: number;
  /** Recorded ticks (1–{@link MAX_DEMO_TICKS}). */
  readonly ticks: number;
  /** The validated replay document (`decodeReplay(document)` gives the `Replay`). */
  readonly document: Readonly<Record<string, unknown>>;
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
const SHIP_SCHEMA: Schema<
  Omit<PlayerShipSpec, 'spriteId' | 'spriteP2Id' | 'mode' | 'startSpeedLevel'> & {
    mode?: PowerUpMode;
    startSpeedLevel?: number;
  }
> = s.object(
  {
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
    mode: s.enumOf(POWER_UP_MODES),
    startSpeedLevel: s.int({ min: 0, max: 15 }),
  },
  { optional: ['mode', 'startSpeedLevel'] },
);

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
    name: s.str({ maxLength: 16, pattern: /^[A-Z0-9 .-]+$/ }),
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
    extra: s.bool(),
  },
  { optional: ['name', 'refireTicks', 'sfx', 'params', 'extra'] },
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

/** One projectile of a family level's volley (M2-05). */
const WEAPON_EMITTER_SCHEMA: Schema<Omit<WeaponEmitterSpec, 'weaponId'>> = s.object(
  {
    weapon: s.ref('weapon'),
    angle: s.int({ min: -1024, max: 1024 }),
    ox: s.num({ min: -64, max: 64 }),
    oy: s.num({ min: -64, max: 64 }),
  },
  { optional: ['angle', 'ox', 'oy'] },
);

/** One level of a family (M2-05). */
const WEAPON_LEVEL_SCHEMA = s.object(
  {
    shots: s.array(WEAPON_EMITTER_SCHEMA, { min: 1, max: MAX_LEVEL_SHOTS }),
    refireTicks: s.int({ min: 1, max: 600 }),
    volleys: s.int({ min: 1, max: 16 }),
  },
  { optional: ['refireTicks', 'volleys'] },
);

/** One entry of `families` in a `weapons` file (M2-05). */
const WEAPON_FAMILY_SCHEMA = s.object(
  {
    id: s.str(),
    name: s.str({ maxLength: 16, pattern: /^[A-Z0-9 .>-]+$/ }),
    label: s.str({ maxLength: 5, pattern: /^[A-Z0-9 .-]+$/ }),
    slot: s.enumOf(['main', 'sub'] as const),
    levels: s.array(WEAPON_LEVEL_SCHEMA, { min: 1, max: MAX_FAMILY_LEVELS }),
  },
  { optional: ['name'] },
);

/** A `content/weapons/*.weapons.json` file. */
const WEAPONS_FILE_SCHEMA = s.object(
  {
    ...HEADER_SHAPE,
    kind: s.enumOf(['weapons'] as const),
    weapons: s.array(WEAPON_SCHEMA, { min: 1 }),
    presets: s.array(WEAPON_PRESET_SCHEMA),
    families: s.array(WEAPON_FAMILY_SCHEMA),
  },
  { optional: ['presets', 'families'] },
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
  ballistic: s.object(
    {
      type: s.enumOf(['ballistic'] as const),
      vx: VELOCITY,
      vy: VELOCITY,
      gravity: s.num({ min: -1, max: 1 }),
      maxFall: s.num({ min: 0, max: 16 }),
      trigger: s.num({ min: 0, max: 1024 }),
      land: s.enumOf(BALLISTIC_LANDS),
    },
    { optional: ['gravity', 'maxFall', 'trigger', 'land'] },
  ),
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
    radius: s.num({ min: 1, max: 128 }),
    angle: s.int({ min: -1023, max: 1023 }),
    spin: s.num({ min: -32, max: 32 }),
    turn: s.int({ min: 2, max: MAX_TURN_FRAMES }),
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
      'radius',
      'angle',
      'spin',
      'turn',
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

/** One segment of `boss.raid.segments` (M2-09). */
const RAID_SEGMENT_SCHEMA = s.object(
  {
    x: s.num({ min: -2048, max: 2048 }),
    y: s.num({ min: -2048, max: 2048 }),
    ticks: s.int({ min: 0, max: 3600 }),
    hold: s.int({ min: 0, max: 36000 }),
  },
  { optional: ['ticks', 'hold'] },
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
    role: s.enumOf(BOSS_ROLES),
    timeLimit: s.int({ min: 60, max: 36000 }),
    raid: s.object(
      {
        segments: s.array(RAID_SEGMENT_SCHEMA, { min: 1, max: MAX_RAID_SEGMENTS }),
        loop: s.bool(),
      },
      { optional: ['loop'] },
    ),
    partner: s.ref('enemy'),
    alternate: s.int({ min: 1, max: 3600 }),
    enrage: s.object(
      {
        fireRate: s.num({ min: 0.1, max: 1 }),
        speed: s.num({ min: 1, max: 4 }),
        phase: s.int({ min: 0, max: MAX_BOSS_PHASES - 1 }),
      },
      { optional: ['fireRate', 'speed', 'phase'] },
    ),
    inner: s.ref('enemy'),
    minion: s.ref('enemy'),
  },
  {
    optional: [
      'introTicks',
      'score',
      'x',
      'y',
      'role',
      'timeLimit',
      'raid',
      'partner',
      'alternate',
      'enrage',
      'inner',
      'minion',
    ],
  },
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
  'optionHunter',
  'child',
  'pattern',
  'rank',
  'revenge',
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
    optionHunter: s.bool(),
    child: s.nullable(s.ref('enemy')),
    pattern: s.nullable(s.ref('pattern')),
    rank: s.object(
      { fireRate: s.num({ min: 0, max: 8 }), bulletSpeed: s.num({ min: 0, max: 8 }) },
      { optional: ['fireRate', 'bulletSpeed'] },
    ),
    revenge: s.object(
      {
        minRank: s.int({ min: 0, max: 31 }),
        pattern: s.enumOf(REVENGE_PATTERNS),
        speed: s.num({ min: 0.25, max: 4 }),
      },
      { optional: ['speed'] },
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
      'optionHunter',
      'child',
      'pattern',
      'rank',
      'revenge',
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

/** A loop number of a remixed event (M3-01 — `minLoop` / `maxLoop`). */
const LOOP_NUMBER = s.int({ min: 1, max: MAX_LOOP });

/** A stage flag or branch name (lower-case kebab). */
const STAGE_NAME = s.str({ maxLength: 64, pattern: /^[a-z][a-z0-9-]*$/ });

/** A world coordinate of a trigger region or a block, in pixels. */
const WORLD_COORD = s.num({ min: -4096, max: 1001000 });

/** One entry of `events` in a `stage` file (every variant may name a `branch` — M2-07). */
const STAGE_EVENT_SCHEMA: Schema<
  Omit<StageEvent, 'enemyId' | 'cueId' | 'flagId' | 'pathId' | 'tileId' | 'stageId'>
> = s.oneOf('type', {
  spawn: s.object(
    {
      x: EVENT_X,
      type: s.enumOf(['spawn'] as const),
      enemy: s.ref('enemy'),
      y: SPAWN_Y,
      screenX: SPAWN_SCREEN_X,
      path: s.ref('path'),
      branch: STAGE_NAME,
      minLoop: LOOP_NUMBER,
      maxLoop: LOOP_NUMBER,
    },
    { optional: ['y', 'screenX', 'path', 'branch', 'minLoop', 'maxLoop'] },
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
      branch: STAGE_NAME,
      minLoop: LOOP_NUMBER,
      maxLoop: LOOP_NUMBER,
    },
    { optional: ['y', 'screenX', 'path', 'drop', 'bonus', 'branch', 'minLoop', 'maxLoop'] },
  ),
  warning: s.object(
    { x: EVENT_X, type: s.enumOf(['warning'] as const), enemy: s.ref('enemy'), branch: STAGE_NAME },
    { optional: ['branch'] },
  ),
  boss: s.object(
    { x: EVENT_X, type: s.enumOf(['boss'] as const), enemy: s.ref('enemy'), branch: STAGE_NAME },
    { optional: ['branch'] },
  ),
  music: s.object(
    { x: EVENT_X, type: s.enumOf(['music'] as const), cue: s.ref('music'), branch: STAGE_NAME },
    { optional: ['branch'] },
  ),
  speed: s.object(
    {
      x: EVENT_X,
      type: s.enumOf(['speed'] as const),
      speed: SPEED,
      ramp: TICKS,
      branch: STAGE_NAME,
    },
    { optional: ['ramp', 'branch'] },
  ),
  flag: s.object(
    {
      x: EVENT_X,
      type: s.enumOf(['flag'] as const),
      flag: STAGE_NAME,
      value: s.bool(),
      branch: STAGE_NAME,
    },
    { optional: ['value', 'branch'] },
  ),
  end: s.object(
    { x: EVENT_X, type: s.enumOf(['end'] as const), branch: STAGE_NAME },
    { optional: ['branch'] },
  ),
  trigger: s.object(
    {
      x: EVENT_X,
      type: s.enumOf(['trigger'] as const),
      flag: STAGE_NAME,
      value: s.bool(),
      region: s.object({
        x: WORLD_COORD,
        y: WORLD_COORD,
        w: s.num({ min: 1, max: 65536 }),
        h: s.num({ min: 1, max: 65536 }),
      }),
      until: EVENT_X,
      branch: STAGE_NAME,
    },
    { optional: ['value', 'until', 'branch'] },
  ),
  block: s.object(
    {
      x: EVENT_X,
      type: s.enumOf(['block'] as const),
      screenX: s.num({ min: -1024, max: 4096 }),
      y: WORLD_COORD,
      w: s.int({ min: 1, max: 1024 }),
      h: s.int({ min: 1, max: 1024 }),
      tile: s.str({ maxLength: 64 }),
      vx: VELOCITY,
      vy: VELOCITY,
      dx: s.num({ min: -1024, max: 1024 }),
      dy: s.num({ min: -1024, max: 1024 }),
      period: s.int({ min: 1, max: 36000 }),
      phase: s.int({ min: 0, max: 1023 }),
      branch: STAGE_NAME,
    },
    { optional: ['screenX', 'tile', 'vx', 'vy', 'dx', 'dy', 'period', 'phase', 'branch'] },
  ),
  bonus: s.object(
    {
      x: EVENT_X,
      type: s.enumOf(['bonus'] as const),
      stage: s.ref('stage'),
      entrance: s.enumOf(BONUS_ENTRANCES),
      region: s.object({
        x: WORLD_COORD,
        y: WORLD_COORD,
        w: s.num({ min: 1, max: 65536 }),
        h: s.num({ min: 1, max: 65536 }),
      }),
      until: EVENT_X,
      digit: s.int({ min: 0, max: 9 }),
      place: s.int({ min: 10, max: 100000 }),
      branch: STAGE_NAME,
    },
    { optional: ['region', 'until', 'digit', 'place', 'branch'] },
  ),
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

/** One entry of a stage's `raster` list (M2-08). */
const RASTER_EFFECT_SCHEMA = s.object(
  {
    layer: s.enumOf(STAGE_RASTER_LAYERS),
    kind: s.enumOf(STAGE_RASTER_KINDS),
    top: s.int({ min: 0, max: PLAYFIELD_H - 1 }),
    bottom: s.int({ min: 1, max: PLAYFIELD_H }),
    amplitude: s.num({ min: 0, max: 32 }),
    wavelength: s.num({ min: 2, max: 1024 }),
    period: s.int({ min: 0, max: 36000 }),
    factorTop: s.num({ min: -4, max: 4 }),
    factorBottom: s.num({ min: -4, max: 4 }),
    bands: s.array(s.int({ min: 1, max: PLAYFIELD_H }), { min: 1, max: MAX_RASTER_BANDS }),
    wrap: s.int({ min: 0, max: 1024 }),
    from: EVENT_X,
    to: EVENT_X,
  },
  {
    optional: [
      'amplitude',
      'wavelength',
      'period',
      'factorTop',
      'factorBottom',
      'bands',
      'wrap',
      'from',
      'to',
    ],
  },
);

/** A `#rrggbb` colour. */
const HEX_COLOR = s.str({ maxLength: 7, pattern: /^#[0-9a-fA-F]{6}$/ });

/** One entry of a stage's `cycles` list (M2-08). */
const COLOR_CYCLE_SCHEMA = s.object(
  {
    layer: s.enumOf(STAGE_CYCLE_LAYERS),
    colors: s.array(HEX_COLOR, { min: 2, max: MAX_CYCLE_COLORS_PER_LAYER }),
    ticks: s.int({ min: 1, max: 600 }),
    from: EVENT_X,
    to: EVENT_X,
  },
  { optional: ['from', 'to'] },
);

/** The `mode7` section of a stage file (M3-02, {@link StageMode7}). */
const MODE7_SCHEMA = s.object(
  {
    sprite: s.ref('sprite'),
    horizon: s.int({ min: 0, max: PLAYFIELD_H - 2 }),
    bottom: s.int({ min: 1, max: PLAYFIELD_H }),
    height: s.num({ min: 1, max: 4096 }),
    scroll: s.num({ min: -64, max: 64 }),
    sway: s.num({ min: -64, max: 64 }),
    turn: s.int({ min: 0, max: 1023 }),
    fog: HEX_COLOR,
    fogDepth: s.num({ min: 1, max: 100000 }),
    alpha: s.num({ min: 0, max: 1 }),
    from: EVENT_X,
    to: EVENT_X,
  },
  { optional: ['bottom', 'scroll', 'sway', 'turn', 'fogDepth', 'alpha', 'from', 'to'] },
);

/** A `content/stages/*.stage.json` file. */
const STAGE_FILE_SCHEMA = s.object(
  {
    ...HEADER_SHAPE,
    kind: s.enumOf(['stage'] as const),
    id: s.str(),
    name: s.str(),
    music: s.object(
      {
        stage: s.ref('music'),
        boss: s.ref('music'),
        ending: s.ref('music'),
        credits: s.ref('music'),
      },
      { optional: ['ending', 'credits'] },
    ),
    length: s.int({ min: 1, max: 1000000 }),
    camera: s.array(
      s.object(
        {
          x: EVENT_X,
          speed: SPEED,
          ramp: TICKS,
          yTo: s.num({ min: 0, max: 4096 }),
          yTicks: TICKS,
          yOver: s.int({ min: 1, max: 1000000 }),
          lock: s.bool(),
          hold: s.int({ min: 1, max: 36000 }),
        },
        { optional: ['ramp', 'yTo', 'yTicks', 'yOver', 'lock', 'hold'] },
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
    directItems: s.array(s.enumOf(DIRECT_ITEMS), { min: 1, max: MAX_DIRECT_ITEM_PLAN }),
    branches: s.array(
      s.object({ id: STAGE_NAME, flag: STAGE_NAME, value: s.bool() }, { optional: ['value'] }),
      { max: MAX_STAGE_BRANCHES },
    ),
    raster: s.array(RASTER_EFFECT_SCHEMA, { max: MAX_STAGE_RASTER_EFFECTS }),
    cycles: s.array(COLOR_CYCLE_SCHEMA, { max: MAX_STAGE_COLOR_CYCLES }),
    mode7: MODE7_SCHEMA,
    type: s.enumOf(STAGE_TYPES),
    rush: s.array(
      s.object(
        { enemy: s.ref('enemy'), delay: s.int({ min: 0, max: 3600 }), warning: s.bool() },
        { optional: ['delay', 'warning'] },
      ),
      { min: 1, max: MAX_RUSH_BOSSES },
    ),
    remix: s.array(STAGE_EVENT_SCHEMA, { max: MAX_STAGE_REMIX }),
  },
  {
    optional: ['directItems', 'branches', 'raster', 'cycles', 'mode7', 'type', 'rush', 'remix'],
  },
);

/** One entry of `tiles` in a `tileset` file. */
const TILE_SCHEMA: Schema<TileSpec> = s.object(
  {
    name: s.str({ maxLength: 64 }),
    type: s.enumOf(TILE_TYPES),
    frame: s.int({ min: 0, max: 1023 }),
    anchor: s.enumOf(TILE_ANCHORS),
    mask: s.array(s.int({ min: 0, max: 64 }), { min: 1, max: 64 }),
    hp: s.int({ min: 1, max: 255 }),
    regen: s.int({ min: 1, max: 36000 }),
    score: s.int({ min: 0, max: 65535 }),
  },
  { optional: ['hp', 'regen', 'score'] },
);

/** A `content/tilesets/*.tileset.json` file (one tileset per file). */
const TILESET_FILE_SCHEMA = s.object({
  ...HEADER_SHAPE,
  kind: s.enumOf(['tileset'] as const),
  id: s.str(),
  sprite: s.ref('sprite'),
  tileSize: s.int({ min: TILE_SIZE, max: TILE_SIZE }),
  tiles: s.array(TILE_SCHEMA, { min: 1, max: 255 }),
});

/** A score threshold of the difficulty presets (whole points, 0 = none). */
const EXTEND_SCORE = s.int({ min: 0, max: MAX_EXTEND_SCORE });

/** One difficulty preset of a `rules` file ({@link DifficultyRules}). */
const DIFFICULTY_RULES_SCHEMA = s.object({
  rankBase: s.int({ min: 0, max: 31 }),
  rankGrowth: s.num({ min: 0, max: MAX_RANK_GROWTH }),
  lives: s.int({ min: 1, max: 5 }),
  extends: s.object({ first: EXTEND_SCORE, every: EXTEND_SCORE }),
  continues: s.int({ min: 0, max: MAX_CONTINUES }),
  deathPenalty: s.enumOf(DEATH_PENALTY_PRESETS),
  aimDirections: s.int({ min: 4, max: 1024 }),
  bulletSpeedMul: s.num({ min: MIN_BULLET_SPEED_MUL, max: MAX_BULLET_SPEED_MUL }),
});

/** The `difficulty` section of a `rules` file: one row per preset, all four required. */
const DIFFICULTY_TABLE_SCHEMA = s.object({
  easy: DIFFICULTY_RULES_SCHEMA,
  normal: DIFFICULTY_RULES_SCHEMA,
  hard: DIFFICULTY_RULES_SCHEMA,
  arcade: DIFFICULTY_RULES_SCHEMA,
});

/** The `scoring` section of a `rules` file (plan M2-02, `core/scoring` {@link ScoringRules}). */
const SCORING_RULES_SCHEMA = s.object(
  {
    bulletCancel: s.int({ min: 0, max: MAX_BULLET_CANCEL_POINTS }),
    repeatKills: s.int({ min: 0, max: MAX_REPEAT_KILLS }),
    repeatPercent: s.int({ min: 0, max: 100 }),
    graze: s.int({ min: 0, max: MAX_GRAZE_POINTS }),
  },
  { optional: ['repeatKills', 'repeatPercent', 'graze'] },
);

/**
 * A `content/rules/*.rules.json` file (M2-01, plan §3.5): game-wide rule tables. Every section is
 * optional and may appear in one file only: `difficulty` (M2-01) and `scoring` (M2-02).
 */
const RULES_FILE_SCHEMA = s.object(
  {
    ...HEADER_SHAPE,
    kind: s.enumOf(['rules'] as const),
    difficulty: DIFFICULTY_TABLE_SCHEMA,
    scoring: SCORING_RULES_SCHEMA,
  },
  { optional: ['difficulty', 'scoring'] },
);

/** A campaign zone id (lower-case kebab). */
const ZONE_ID = s.str({ maxLength: 32, pattern: /^[a-z][a-z0-9-]*$/ });

/** A `content/campaign/*.campaign.json` file (M2-10 — `data/campaign`). */
const CAMPAIGN_FILE_SCHEMA = s.object(
  {
    ...HEADER_SHAPE,
    kind: s.enumOf(['campaign'] as const),
    id: s.str({ maxLength: 32 }),
    name: s.str({ maxLength: 24 }),
    start: ZONE_ID,
    zones: s.array(
      s.object(
        {
          id: ZONE_ID,
          label: s.str({ maxLength: 2, pattern: /^[A-Z0-9]+$/ }),
          name: s.str({ maxLength: 24 }),
          stage: s.ref('stage'),
          preview: s.array(s.str({ maxLength: 40 }), { max: MAX_ZONE_PREVIEW_LINES }),
          escape: s.ref('stage'),
        },
        { optional: ['preview', 'escape'] },
      ),
      { min: 1, max: MAX_CAMPAIGN_ZONES },
    ),
    edges: s.array(s.object({ from: ZONE_ID, to: ZONE_ID }), {
      max: MAX_CAMPAIGN_ZONES * MAX_ZONE_EXITS,
    }),
    endings: s.array(
      s.object(
        {
          id: ZONE_ID,
          name: s.str({ maxLength: 32 }),
          zone: ZONE_ID,
          all: s.array(s.enumOf(RUN_FLAG_NAMES), { max: RUN_FLAG_NAMES.length }),
          none: s.array(s.enumOf(RUN_FLAG_NAMES), { max: RUN_FLAG_NAMES.length }),
          scene: s.enumOf(ENDING_SCENES),
          text: s.array(s.str({ maxLength: MAX_ENDING_LINE_LENGTH }), {
            max: MAX_ENDING_TEXT_LINES,
          }),
        },
        { optional: ['all', 'none', 'scene', 'text'] },
      ),
      { min: 1, max: MAX_CAMPAIGN_ENDINGS },
    ),
    credits: s.array(
      s.object(
        {
          title: s.str({ maxLength: MAX_CREDITS_LINE_LENGTH }),
          lines: s.array(s.str({ maxLength: MAX_CREDITS_LINE_LENGTH }), {
            max: MAX_CREDITS_LINES,
          }),
        },
        { optional: ['lines'] },
      ),
      { max: MAX_CREDITS_SECTIONS },
    ),
    story: s.array(
      s.object(
        {
          scene: s.enumOf(STORY_SCENES),
          lines: s.array(s.str({ maxLength: MAX_STORY_LINE_LENGTH }), { max: MAX_STORY_LINES }),
        },
        { optional: ['scene', 'lines'] },
      ),
      { max: MAX_STORY_PAGES },
    ),
  },
  { optional: ['name', 'credits', 'story'] },
);

/**
 * A JSON object of any shape (a demo's recorded `GameConfig`: `core/replay` `decodeReplay`
 * validates it field by field when the demo is played).
 */
const JSON_OBJECT_SCHEMA: Schema<Readonly<Record<string, unknown>>> = Object.freeze({
  typeName: 'object',
  refKind: null,
  parse(value: unknown, path: string, issues: ValidationIssue[]) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Readonly<Record<string, unknown>>;
    }
    issues.push({ path, message: 'must be an object' });
    return undefined;
  },
});

/** An unsigned 32-bit integer (a state hash, a seed). */
const U32_SCHEMA = s.int({ min: 0, max: 0xffffffff });

/**
 * A `content/demos/*.replay.json` file (M2-15): a `core/replay` document (`encodeReplay`'s
 * fields) with the content header, an `id` and a `description`. The structure is checked here;
 * the recording itself (config, input runs, hash count) is decoded by `core/replay` `decodeReplay`
 * when the attract loop plays it — `test/golden/demos.test.ts` (part of `pnpm test`) plays every
 * shipped demo back with every state hash.
 */
const DEMO_FILE_SCHEMA = s.object(
  {
    ...HEADER_SHAPE,
    kind: s.enumOf(['replay'] as const),
    id: s.str({ maxLength: 32, pattern: /^[a-z0-9][a-z0-9-]*$/ }),
    description: s.str({ maxLength: 200 }),
    header: s.object(
      {
        formatVersion: s.int({ min: 1 }),
        buildId: s.str({ minLength: 0, maxLength: 64 }),
        seed: U32_SCHEMA,
        stageId: s.nullable(s.str({ maxLength: 64 })),
        checkpoint: s.int({ min: -1 }),
        loadout: s.str({ maxLength: 16 }),
        assisted: s.bool(),
        // M3-01: the assist flags (`core/replay` `ReplayHeader.assists`; older demos have none).
        assists: s.int({ min: 0, max: 255 }),
        config: JSON_OBJECT_SCHEMA,
      },
      { optional: ['assists'] },
    ),
    ticks: s.int({ min: 1, max: MAX_DEMO_TICKS }),
    hashInterval: s.int({ min: 1 }),
    inputs: s.array(s.str({ minLength: 0 }), { min: MAX_PLAYERS, max: MAX_PLAYERS }),
    hashes: s.array(U32_SCHEMA),
    finalHash: U32_SCHEMA,
  },
  { optional: ['description'] },
);

/** A `content/strings/*.strings.json` file (M2-16): a language's UI string table. */
const STRINGS_FILE_SCHEMA = s.object({
  ...HEADER_SHAPE,
  kind: s.enumOf(['strings'] as const),
  language: s.str({ maxLength: 5, pattern: /^[a-z]{2}(?:-[a-z]{2})?$/ }),
  strings: s.record(
    s.str({ minLength: 1, maxLength: MAX_UI_TEXT_LENGTH }),
    /^[A-Za-z][A-Za-z0-9.]*$/,
  ),
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
  /** Collected Direct-mode families (M2-05). */
  weaponFamilies: WeaponFamilySpec[];
  /** Family id → position in {@link DbBuilder.weaponFamilies}. */
  weaponFamilyIndex: Map<string, number>;
  /** Issue path (`<file>:families[i]`) of every collected family (the family pass). */
  familyPaths: string[];
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
  /** The difficulty presets (the first `rules` file with a `difficulty` section), or `null`. */
  difficulty: DifficultyTable | null;
  /** The scoring rules (the first `rules` file with a `scoring` section), or `null`. */
  scoring: ScoringRules | null;
  /** Every valid `patterns` file, in path order (compiled once all files are collected). */
  patternFiles: CollectedPatterns[];
  /** The campaign (the first `campaign` file — M2-10), or `null`. */
  campaign: CampaignSpec | null;
  /** Repo-relative path of the campaign's file (issue paths of the reference pass). */
  campaignPath: string;
  /** Collected demos (M2-15). */
  demos: DemoSpec[];
  /** Demo id → position in {@link DbBuilder.demos}. */
  demoIndex: Map<string, number>;
  /** Repo-relative file path of every collected demo (issue paths of the reference pass). */
  demoPaths: string[];
  /** Collected UI string tables (M2-16). */
  uiStrings: UiStringsSpec[];
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
  weaponFamilies: Object.freeze([]),
  weaponFamilyIndex: new Map<string, number>(),
  enemies: Object.freeze([]),
  enemyIndex: new Map<string, number>(),
  paths: Object.freeze([]),
  pathIndex: new Map<string, number>(),
  stages: Object.freeze([]),
  stageIndex: new Map<string, number>(),
  tilesets: Object.freeze([]),
  tilesetIndex: new Map<string, number>(),
  difficulty: null,
  scoring: null,
  patterns: EMPTY_PATTERN_BANK,
  campaign: null,
  demos: Object.freeze([]),
  demoIndex: new Map<string, number>(),
  uiStrings: Object.freeze([]),
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
 * @param patterns - The compiled pattern bank (pattern action ids).
 * @param issues - Collector.
 */
function resolveRef(
  site: RefSite,
  db: DbBuilder,
  sprites: StringTable,
  scripts: StringTable,
  knownScripts: ReadonlySet<string> | null,
  patterns: PatternBank,
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
    case 'pattern':
      resolved = patterns.actionIndex.get(id);
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
 * file), boss sections are completed, and paths are baked into arc-length tables
 * ({@link bakePath}; a path with coincident neighbours or an overlong curve is an issue and is
 * left out).
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
    weaponFamilies: [],
    weaponFamilyIndex: new Map(),
    familyPaths: [],
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
    difficulty: null,
    scoring: null,
    patternFiles: [],
    campaign: null,
    campaignPath: '',
    demos: [],
    demoIndex: new Map(),
    demoPaths: [],
    uiStrings: [],
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
  // Player 2's palette swap of every ship (M2-06).
  for (const ship of db.ships) spriteNames.add(ship.sprite + P2_SPRITE_SUFFIX);
  const sprites = buildStringTable(spriteNames);
  const scripts = buildStringTable(scriptNames);
  const patterns = compilePatternBank(db.patternFiles, issues);
  for (const site of refs) resolveRef(site, db, sprites, scripts, knownScripts, patterns, issues);
  for (const ship of db.ships) {
    (ship as { spriteP2Id: number }).spriteP2Id =
      sprites.index.get(ship.sprite + P2_SPRITE_SUFFIX) ?? -1;
  }
  checkBossReferences(db, issues);
  checkWeaponFamilies(db, issues);
  checkBonusReferences(db, issues);
  checkCampaignStages(db, issues);
  checkDemoStages(db, issues);
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
      weaponFamilies: db.weaponFamilies,
      weaponFamilyIndex: db.weaponFamilyIndex,
      enemies: db.enemies,
      enemyIndex: db.enemyIndex,
      paths: db.paths,
      pathIndex: db.pathIndex,
      stages: db.stages,
      stageIndex: db.stageIndex,
      tilesets: db.tilesets,
      tilesetIndex: db.tilesetIndex,
      difficulty: db.difficulty,
      scoring: db.scoring,
      patterns,
      campaign: db.campaign,
      demos: db.demos,
      demoIndex: db.demoIndex,
      uiStrings: db.uiStrings,
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
    case 'rules':
      return RULES_FILE_SCHEMA.parse(data, '', issues, refs);
    case 'patterns':
      return PATTERNS_FILE_SCHEMA.parse(data, '', issues, refs);
    case 'campaign':
      return CAMPAIGN_FILE_SCHEMA.parse(data, '', issues, refs);
    case 'replay':
      return DEMO_FILE_SCHEMA.parse(data, '', issues, refs);
    case 'strings':
      return STRINGS_FILE_SCHEMA.parse(data, '', issues, refs);
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
      const ships = parsed['ships'] as Array<
        Omit<PlayerShipSpec, 'mode' | 'startSpeedLevel' | 'spriteP2Id'> & {
          mode?: PowerUpMode;
          startSpeedLevel?: number;
          spriteP2Id?: number;
        }
      >;
      for (let i = 0; i < ships.length; i++) {
        const ship = ships[i];
        // Optional since M2-05: the meter ship's defaults, so every spec has the same fields.
        if (ship.mode === undefined) ship.mode = 'meter';
        // Resolved with the references (M2-06: player 2's palette swap).
        ship.spriteP2Id = -1;
        const start = ship.startSpeedLevel ?? 0;
        ship.startSpeedLevel = start;
        if (start >= ship.speeds.length) {
          issue(
            issues,
            at(path, 'ships[' + String(i) + '].startSpeedLevel'),
            'must be < the number of speeds (' + String(ship.speeds.length) + ')',
          );
          continue;
        }
        addEntry(
          db.ships,
          db.shipIndex,
          ship as PlayerShipSpec,
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
      const families = (parsed['families'] ?? []) as WeaponFamilySpec[];
      for (let i = 0; i < families.length; i++) {
        const before = db.weaponFamilies.length;
        addEntry(
          db.weaponFamilies,
          db.weaponFamilyIndex,
          families[i],
          at(path, 'families[' + String(i) + '].id'),
          'weapon family',
          issues,
        );
        if (db.weaponFamilies.length > before) {
          db.familyPaths.push(at(path, 'families[' + String(i) + ']'));
        }
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
    case 'rules': {
      const scoring = parsed['scoring'] as ScoringRules | undefined;
      if (scoring !== undefined) {
        if (db.scoring !== null) {
          issue(issues, at(path, 'scoring'), 'scoring rules are already defined by another file');
        } else {
          db.scoring = Object.freeze(scoring);
        }
      }
      const table = parsed['difficulty'] as DifficultyTable | undefined;
      if (table === undefined) return;
      if (!checkDifficultyTable(table, path, issues)) return;
      if (db.difficulty !== null) {
        issue(
          issues,
          at(path, 'difficulty'),
          'difficulty rules are already defined by another file',
        );
        return;
      }
      db.difficulty = freezeDifficultyTable(table);
      return;
    }
    case 'patterns':
      db.patternFiles.push({ path, file: parsed });
      return;
    case 'campaign': {
      if (db.campaign !== null) {
        issue(issues, at(path, 'id'), 'the campaign is already defined by another file');
        return;
      }
      const campaign = completeCampaign(parsed, (inner) => at(path, inner), issues);
      if (campaign === null) return;
      db.campaign = campaign;
      db.campaignPath = path;
      return;
    }
    case 'replay': {
      const header = parsed['header'] as { stageId: string | null };
      const before = db.demos.length;
      addEntry(
        db.demos,
        db.demoIndex,
        Object.freeze({
          id: parsed['id'] as string,
          description: (parsed['description'] as string | undefined) ?? '',
          stage: header.stageId,
          stageIndex: -1,
          ticks: parsed['ticks'] as number,
          document: Object.freeze(parsed),
        }),
        at(path, 'id'),
        'demo',
        issues,
      );
      if (db.demos.length > before) db.demoPaths.push(path);
      return;
    }
    case 'strings':
      collectUiStrings(parsed, path, db, issues);
      return;
  }
}

/**
 * Collects a `strings` file (M2-16): every id must be a `core/ui` UI string id, every text drawable
 * by the bitmap font (`core/ui` `UI_GLYPHS`), and a `FIXED_UI_TEXT_IDS` id must keep its English
 * text (M3-03 — the HUD's fixed-width codes); a second table of the same language is an issue. The file's valid entries
 * are kept (a bad entry falls back to English when the table is resolved).
 *
 * @param parsed - The validated file.
 * @param path - Repo-relative file path.
 * @param db - The builder.
 * @param issues - Collector.
 */
function collectUiStrings(
  parsed: Record<string, unknown>,
  path: string,
  db: DbBuilder,
  issues: ValidationIssue[],
): void {
  const language = parsed['language'] as string;
  for (const table of db.uiStrings) {
    if (table.language === language) {
      issue(issues, at(path, 'language'), `UI strings for "${language}" are already defined`);
      return;
    }
  }
  const raw = parsed['strings'] as Record<string, string>;
  const known = new Set(UI_TEXT_IDS);
  const strings: Record<string, string> = {};
  for (const id of Object.keys(raw)) {
    const text = raw[id];
    if (!known.has(id)) {
      issue(issues, at(path, 'strings.' + id), `unknown UI string id "${id}"`);
    } else if (!isUiTextDrawable(text)) {
      issue(issues, at(path, 'strings.' + id), 'uses a character the bitmap font does not have');
    } else if (isFixedUiTextId(id) && text !== DEFAULT_UI_TEXT[id]) {
      issue(
        issues,
        at(path, 'strings.' + id),
        `"${id}" is the same in every language: it must stay "${DEFAULT_UI_TEXT[id]}"`,
      );
    } else {
      strings[id] = text;
    }
  }
  db.uiStrings.push(Object.freeze({ language, strings: Object.freeze(strings) }));
}

/**
 * The M2-15 part of the reference pass for the demos: a demo's recorded stage must be a stage of
 * the content (free flight — `null` — needs none).
 *
 * @param db - The builder (stages collected).
 * @param issues - Collector.
 */
function checkDemoStages(db: DbBuilder, issues: ValidationIssue[]): void {
  const demos = db.demos;
  for (let i = 0; i < demos.length; i++) {
    const demo = demos[i];
    if (demo.stage === null) continue;
    const index = db.stageIndex.get(demo.stage);
    if (index === undefined) {
      issue(issues, at(db.demoPaths[i], 'header.stageId'), 'unknown stage id "' + demo.stage + '"');
      continue;
    }
    demos[i] = Object.freeze({ ...demo, stageIndex: index });
  }
}

/**
 * The M2-10 part of the reference pass for the campaign: every zone's stage resolved to a stage
 * that is not a bonus stage (a zone is a full stage; bonus stages are entered from inside one).
 *
 * @param db - The builder (references already resolved).
 * @param issues - Collector.
 */
function checkCampaignStages(db: DbBuilder, issues: ValidationIssue[]): void {
  const campaign = db.campaign;
  if (campaign === null) return;
  const zones = campaign.zones;
  for (let i = 0; i < zones.length; i++) {
    const id = zones[i].stageId;
    if (id < 0 || id >= db.stages.length) continue; // an unknown id is already an issue
    if (db.stages[id].type === 'bonus') {
      issue(
        issues,
        at(db.campaignPath, 'zones[' + String(i) + '].stage'),
        'is a bonus stage: a zone plays a normal or bossRush stage',
      );
    }
  }
}

/**
 * The M2-10 part of the reference pass for the bonus entrances: a `bonus` event must name a
 * stage of type `bonus`.
 *
 * @param db - The builder (references already resolved).
 * @param issues - Collector.
 */
function checkBonusReferences(db: DbBuilder, issues: ValidationIssue[]): void {
  const stages = db.stages;
  for (let s = 0; s < stages.length; s++) {
    const events = stages[s].events;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.type !== 'bonus') continue;
      const target = event.stageId;
      if (target < 0 || target >= stages.length) continue; // already an issue
      if (stages[target].type !== 'bonus') {
        issue(
          issues,
          at(db.stagePaths[s], 'events[' + String(i) + '].stage'),
          'must name a stage of type "bonus"',
        );
      }
    }
  }
}

/**
 * Checks what the difficulty schema cannot: every preset's `aimDirections` is a power of two.
 *
 * @param table - The parsed section.
 * @param path - Repo-relative file path.
 * @param issues - Collector.
 * @returns `true` when the table is usable.
 */
function checkDifficultyTable(
  table: DifficultyTable,
  path: string,
  issues: ValidationIssue[],
): boolean {
  let ok = true;
  for (const preset of DIFFICULTY_PRESETS) {
    const dirs = table[preset].aimDirections;
    if ((dirs & (dirs - 1)) !== 0) {
      ok = issue(
        issues,
        at(path, 'difficulty.' + preset + '.aimDirections'),
        'must be a power of two (4, 8, 16 … 1024)',
      );
    }
  }
  return ok;
}

/**
 * Freezes a parsed difficulty table (rows and their `extends`), so a session's config tables stay
 * immutable like the built-in one.
 *
 * @param table - The parsed, checked section.
 * @returns The same object, frozen.
 */
function freezeDifficultyTable(table: DifficultyTable): DifficultyTable {
  for (const preset of DIFFICULTY_PRESETS) {
    const rules: DifficultyRules = table[preset];
    Object.freeze(rules.extends);
    Object.freeze(rules);
  }
  return Object.freeze(table);
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
    if (enemy.optionHunter === undefined) enemy.optionHunter = false;
    if (enemy.child === undefined) enemy.child = null;
    if (enemy.pattern === undefined) enemy.pattern = null;
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
  enemy.optionHunter = false;
  enemy.child = null;
  enemy.pattern = null;
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
 * `partsDestroyed` or above its length, unknown or repeated `partsDestroyed` names, an `hpBelow`
 * above the cores' total.
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
    // M2-09: circle hurtboxes, turns, heading frames.
    if (part.radius === undefined) part.radius = 0;
    if (part.angle === undefined) part.angle = 0;
    if (part.spin === undefined) part.spin = 0;
    if (part.turn === undefined) part.turn = 0;
    if (part.radius > 0 && part.hurtbox !== null) {
      ok = issue(issues, where + '.radius', 'a part is hit by a hurtbox or a radius, not both');
    }
    if (part.turn > 0 && part.anim !== undefined) {
      ok = issue(issues, where + '.turn', 'heading frames (turn) and anim cannot be combined');
    }
    if (part.turn > 0 && part.hurtbox !== null) {
      ok = issue(
        issues,
        where + '.turn',
        'a part drawn turned needs a circle hurtbox (radius): boxes never turn',
      );
    }
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
      if (part.hurtbox === null && part.radius <= 0) {
        ok = issue(issues, where + '.hurtbox', 'is required for a core (a hurtbox or a radius)');
      }
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
      } else if (destroyed.indexOf(destroyed[k]) < k) {
        // A repeated name adds no bit to the mask but counts toward the list's length (the
        // default `count`), so the part condition could never be met.
        ok = issue(
          issues,
          where + '.until.partsDestroyed[' + String(k) + ']',
          'duplicate part "' + destroyed[k] + '"',
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
  if (!completeAdvancedBoss(boss, path, issues)) ok = false;
  return ok ? coreHp : -1;
}

/**
 * Checks and completes the M2-09 fields of a boss section in place: `role` (default `boss`),
 * `timeLimit` (0), `raid` (`null`; segment defaults, `loop` `true`), `partner` / `inner` /
 * `minion` (`null` when absent — their ids come from the reference resolution), `alternate` (0),
 * `enrage` (the defaults, `phase` -1).
 *
 * @remarks
 * Reported: a captain with a `raid`, a `partner`, an `inner` boss or an `alternate`; `alternate`
 * without a `partner`; an `enrage.phase` past the last phase. The reference checks (partners and
 * inner bosses must be bosses of role `boss`, minions regular enemies, no loops) run once the
 * references are resolved ({@link checkBossReferences}).
 *
 * @param boss - The parsed boss section.
 * @param path - Issue path of the section.
 * @param issues - Collector.
 * @returns `true` when these fields are usable.
 */
function completeAdvancedBoss(boss: MutableBoss, path: string, issues: ValidationIssue[]): boolean {
  let ok = true;
  const record = boss as unknown as Record<string, unknown>;
  // Which of the pair / nesting fields the file gave (before the defaults fill them).
  const given = {
    raid: record['raid'] !== undefined,
    partner: record['partner'] !== undefined,
    inner: record['inner'] !== undefined,
    alternate: record['alternate'] !== undefined,
  };
  if (boss.role === undefined) boss.role = 'boss';
  if (boss.timeLimit === undefined) boss.timeLimit = 0;
  if (boss.alternate === undefined) boss.alternate = 0;
  if (record['partner'] === undefined) boss.partner = null;
  if (record['inner'] === undefined) boss.inner = null;
  if (record['minion'] === undefined) boss.minion = null;
  const raid = record['raid'] as
    { segments: Array<{ ticks?: number; hold?: number }>; loop?: boolean } | undefined;
  if (raid === undefined) {
    boss.raid = null;
  } else {
    for (const segment of raid.segments) {
      if (segment.ticks === undefined) segment.ticks = DEFAULT_RAID_SEGMENT_TICKS;
      if (segment.hold === undefined) segment.hold = 0;
    }
    if (raid.loop === undefined) raid.loop = true;
  }
  const enrage = record['enrage'] as
    { fireRate?: number; speed?: number; phase?: number } | undefined;
  const filled = enrage ?? {};
  if (filled.fireRate === undefined) filled.fireRate = DEFAULT_ENRAGE_FIRE_RATE;
  if (filled.speed === undefined) filled.speed = DEFAULT_ENRAGE_SPEED;
  if (filled.phase === undefined) filled.phase = -1;
  if (filled.phase >= boss.phases.length) {
    ok = issue(issues, path + '.enrage.phase', 'must name one of the phases (0-based)');
  }
  boss.enrage = filled as BossEnrageSpec;
  if (boss.role === 'captain') {
    for (const field of ['raid', 'partner', 'inner', 'alternate'] as const) {
      if (given[field]) {
        ok = issue(issues, path + '.' + field, 'is only for bosses of role "boss" (not captains)');
      }
    }
  }
  if (given.alternate && !given.partner) {
    ok = issue(issues, path + '.alternate', 'needs a partner (the pair takes turns)');
  }
  return ok;
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
  checkAdvancedBossReferences(db, issues);
}

/**
 * The M2-09 part of the reference pass: a `warning` event must not name a captain (captains fly
 * in with a `boss` event); a boss's `partner` must be another boss of role `boss` without a
 * partner or raid of its own; an `inner` boss must be a boss of role `boss` other than itself and
 * the inner chain must not loop; a `minion` must be a regular enemy; every entry of a stage's
 * `rush` must be a boss of role `boss`.
 *
 * @param db - The builder (references already resolved).
 * @param issues - Collector.
 */
function checkAdvancedBossReferences(db: DbBuilder, issues: ValidationIssue[]): void {
  const enemies = db.enemies;
  /**
   * The boss section of a resolved enemy index.
   *
   * @param index - The index (-1 = none).
   * @returns The section, or `null` for a regular enemy / no enemy.
   */
  const bossOf = (index: number): BossSpec | null =>
    index >= 0 && index < enemies.length ? enemies[index].boss : null;
  for (let s = 0; s < db.stages.length; s++) {
    const stage = db.stages[s];
    const file = db.stagePaths[s];
    for (let i = 0; i < stage.events.length; i++) {
      const event = stage.events[i];
      if (event.type !== 'warning') continue;
      if (bossOf(event.enemyId)?.role === 'captain') {
        issue(
          issues,
          at(file, 'events[' + String(i) + '].enemy'),
          'is a captain: captains fly in with a "boss" event (no WARNING)',
        );
      }
    }
    for (let i = 0; i < stage.rush.length; i++) {
      const entry = stage.rush[i];
      const boss = bossOf(entry.enemyId);
      if (entry.enemyId >= 0 && (boss === null || boss.role !== 'boss')) {
        issue(issues, at(file, 'rush[' + String(i) + '].enemy'), 'must name a boss of role "boss"');
      }
    }
  }
  for (let e = 0; e < enemies.length; e++) {
    const boss = enemies[e].boss;
    if (boss === null) continue;
    const path = db.enemyPaths[e] + '.boss';
    if (boss.partnerId >= 0) {
      const partner = bossOf(boss.partnerId);
      if (boss.partnerId === e) {
        issue(issues, path + '.partner', 'must name another boss');
      } else if (partner === null || partner.role !== 'boss') {
        issue(issues, path + '.partner', 'must name a boss of role "boss"');
      } else if (partner.partnerId >= 0 || partner.raid !== null) {
        issue(issues, path + '.partner', 'the partner must not have a partner or raid of its own');
      }
    }
    if (boss.innerId >= 0) {
      const inner = bossOf(boss.innerId);
      if (boss.innerId === e) {
        issue(issues, path + '.inner', 'must name another boss');
      } else if (inner === null || inner.role !== 'boss') {
        issue(issues, path + '.inner', 'must name a boss of role "boss"');
      } else {
        // Follow the chain: it must end (at most one step per boss).
        let cursor = boss.innerId;
        for (let step = 0; cursor >= 0 && step <= enemies.length; step++) {
          if (cursor === e) {
            issue(issues, path + '.inner', 'the inner-boss chain loops back to this boss');
            break;
          }
          const next = bossOf(cursor);
          cursor = next === null ? -1 : next.innerId;
        }
      }
    }
    if (boss.minionId >= 0 && bossOf(boss.minionId) !== null) {
      issue(issues, path + '.minion', 'must name a regular enemy (not a boss)');
    }
  }
}

/**
 * Fifth pass of {@link loadContent} (references resolved): every weapon a Direct-mode family's
 * volley fires must belong in the family's slot (a `main` family fires `main`-slot weapons, a
 * `sub` family `sub`-slot ones — M2-05).
 *
 * @param db - The builder (references already resolved).
 * @param issues - Collector.
 */
function checkWeaponFamilies(db: DbBuilder, issues: ValidationIssue[]): void {
  const weapons = db.weapons;
  for (let f = 0; f < db.weaponFamilies.length; f++) {
    const family = db.weaponFamilies[f];
    for (let l = 0; l < family.levels.length; l++) {
      const shots = family.levels[l].shots;
      for (let k = 0; k < shots.length; k++) {
        const index = shots[k].weaponId;
        if (!(index >= 0 && index < weapons.length)) continue; // already an issue
        if (weapons[index].slot !== family.slot) {
          issue(
            issues,
            db.familyPaths[f] + '.levels[' + String(l) + '].shots[' + String(k) + '].weapon',
            'weapon "' +
              weapons[index].id +
              '" belongs in slot ' +
              weapons[index].slot +
              ', not in a "' +
              family.slot +
              '" family',
          );
        }
      }
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
type MutableStage = Omit<
  StageSpec,
  | 'flagNames'
  | 'terrain'
  | 'events'
  | 'directItems'
  | 'branches'
  | 'raster'
  | 'cycles'
  | 'mode7'
  | 'type'
  | 'rush'
  | 'remix'
> & {
  /** See {@link StageSpec.remix} (optional in the file — M3-01). */
  remix?: Array<
    StageEvent & {
      /** Always -1 once checked: a remix event never names a branch. */
      branchId?: number;
    }
  >;
  /** See {@link StageSpec.type} (optional in the file). */
  type?: StageType;
  /** See {@link StageSpec.rush} (optional in the file; the loader fills the defaults). */
  rush?: Array<{ -readonly [K in keyof StageRushEntry]?: StageRushEntry[K] }>;
  /** See {@link StageSpec.raster} (optional in the file; the loader fills the defaults). */
  raster?: Array<{ -readonly [K in keyof StageRasterEffect]?: StageRasterEffect[K] }>;
  /** See {@link StageSpec.cycles} (optional in the file; the loader resolves the colours). */
  cycles?: Array<{ -readonly [K in keyof StageColorCycle]?: StageColorCycle[K] }>;
  /** See {@link StageSpec.mode7} (optional in the file; the loader fills the defaults — M3-02). */
  mode7?: { -readonly [K in keyof StageMode7]?: StageMode7[K] } | null;
  /** See {@link StageSpec.directItems} (optional in the file). */
  directItems?: DirectItemName[];
  /** See {@link StageSpec.branches} (optional in the file; the loader resolves the flags). */
  branches?: Array<{ id: string; flag: string; value?: boolean; flagId?: number }>;
  /** See {@link StageSpec.events}. */
  events: Array<StageEvent & { flagId?: number; branchId?: number; tileId?: number }>;
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
 * `from < to`, at most {@link MAX_STAGE_FLAGS} flags; since M2-07 also diagonal pans (`yOver`
 * needs `yTo`, not with `yTicks`), holds (not with `lock`), branches (unique ids, events naming
 * known ones), triggers (at most {@link MAX_STAGE_TRIGGERS}, `until` not before the event) and
 * blocks (sizes in whole tiles, at most {@link MAX_BLOCK_CELLS} of them, a tilemap to live in).
 * Assigns the flag ids (of `flag` and `trigger` events and branches) and the branch ids, and
 * initialises `terrain` (filled by {@link expandStageTerrains}).
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
    if (key.yOver !== undefined && key.yTo === undefined) {
      ok = issue(issues, at(file, path + '.yOver'), 'needs yTo');
    }
    if (key.yOver !== undefined && key.yTicks !== undefined) {
      ok = issue(issues, at(file, path + '.yOver'), 'a pan is either yTicks or yOver, not both');
    }
    if (key.hold !== undefined && key.lock === true) {
      ok = issue(issues, at(file, path + '.hold'), 'a lock key cannot hold (it waits for unlock)');
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
  const branches = stage.branches ?? [];
  const branchIds: string[] = [];
  const flags: string[] = [];
  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];
    if (branchIds.indexOf(branch.id) >= 0) {
      ok = issue(
        issues,
        at(file, 'branches[' + String(i) + '].id'),
        'duplicate branch "' + branch.id + '"',
      );
    }
    branchIds.push(branch.id);
    if (flags.indexOf(branch.flag) < 0) flags.push(branch.flag);
  }
  const events = stage.events;
  let triggers = 0;
  let bonuses = 0;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const base = 'events[' + String(i) + ']';
    const path = base + '.x';
    if (i > 0 && event.x < events[i - 1].x) {
      ok = issue(
        issues,
        at(file, path),
        'must be >= events[' + String(i - 1) + '].x (events are sorted by x)',
      );
    }
    if (event.x > length) ok = issue(issues, at(file, path), 'must be <= length');
    if ((event.type === 'flag' || event.type === 'trigger') && flags.indexOf(event.flag) < 0) {
      flags.push(event.flag);
    }
    const branch = event.branch;
    if (branch !== undefined && branchIds.indexOf(branch) < 0) {
      ok = issue(issues, at(file, base + '.branch'), 'no branch "' + branch + '" in branches');
    }
    // M3-01: a remixed event's loops must leave at least one loop to play in.
    if (event.minLoop !== undefined && event.maxLoop !== undefined) {
      if (event.maxLoop < event.minLoop) {
        ok = issue(issues, at(file, base + '.maxLoop'), 'must be >= minLoop');
      }
    }
    if (event.type === 'trigger') {
      triggers++;
      const until = event.until ?? event.region.x + event.region.w;
      if (until < event.x) {
        ok = issue(
          issues,
          at(file, base + '.until'),
          'must be >= x (the trigger disarms when the camera passes it)',
        );
      }
    } else if (event.type === 'bonus') {
      bonuses++;
      if (!checkBonusEvent(event, base, file, issues)) ok = false;
    } else if (event.type === 'block') {
      if (stage.tilemap === null) {
        ok = issue(issues, at(file, base), 'a block needs the stage to have a tilemap');
      }
      const size = stage.tilemap?.tileSize ?? TILE_SIZE;
      if (event.w % size !== 0 || event.h % size !== 0) {
        ok = issue(
          issues,
          at(file, base + '.w'),
          'w and h must be multiples of the tile size (' + String(size) + ')',
        );
      } else if ((event.w / size) * (event.h / size) > MAX_BLOCK_CELLS) {
        ok = issue(
          issues,
          at(file, base + '.w'),
          'covers more than ' + String(MAX_BLOCK_CELLS) + ' tiles',
        );
      }
    }
  }
  if (bonuses > MAX_BONUS_ENTRANCES) {
    ok = issue(
      issues,
      at(file, 'events'),
      'has ' + String(bonuses) + ' bonus entrances (at most ' + String(MAX_BONUS_ENTRANCES) + ')',
    );
  }
  if (triggers > MAX_STAGE_TRIGGERS) {
    ok = issue(
      issues,
      at(file, 'events'),
      'has ' + String(triggers) + ' triggers (at most ' + String(MAX_STAGE_TRIGGERS) + ')',
    );
  }
  flags.sort();
  if (flags.length > MAX_STAGE_FLAGS) {
    ok = issue(
      issues,
      at(file, 'events'),
      'uses ' + String(flags.length) + ' flags (at most ' + String(MAX_STAGE_FLAGS) + ')',
    );
  }
  for (const event of events) {
    if (event.type === 'flag' || event.type === 'trigger') event.flagId = flags.indexOf(event.flag);
    event.branchId = event.branch === undefined ? -1 : branchIds.indexOf(event.branch);
    if (event.type === 'block') event.tileId = -1;
  }
  for (const branch of branches) {
    branch.flagId = flags.indexOf(branch.flag);
    if (branch.value === undefined) branch.value = true;
  }
  stage.branches = branches;
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
  // The loops' remix (M3-01): spawns and formations only, sorted, inside the stage, no branch.
  if (!checkStageRemix(stage, file, issues)) ok = false;
  // Optional since M2-05: an empty plan means the engine's default one.
  if (stage.directItems === undefined) stage.directItems = [];
  // Boss rushes (M2-09).
  if (!checkStageRush(stage, file, issues)) ok = false;
  // Presentation effects (M2-08).
  if (!checkStageEffects(stage, file, issues)) ok = false;
  return ok;
}

/**
 * Checks and completes a stage's loop remix (M3-01 — {@link StageSpec.remix}) in place: omitted →
 * none; every entry a `spawn` or `formation` (no `branch`), sorted by `x`, inside the stage, with
 * `minLoop ≤ maxLoop`; each gets `branchId` -1.
 *
 * @param stage - The parsed stage.
 * @param file - Repo-relative file path.
 * @param issues - Collector.
 * @returns `true` when the remix is usable.
 */
function checkStageRemix(stage: MutableStage, file: string, issues: ValidationIssue[]): boolean {
  let ok = true;
  const remix = stage.remix ?? [];
  stage.remix = remix;
  for (let i = 0; i < remix.length; i++) {
    const event = remix[i];
    const path = 'remix[' + String(i) + ']';
    if (event.type !== 'spawn' && event.type !== 'formation') {
      ok = issue(issues, at(file, path + '.type'), 'a remix holds spawn and formation events only');
    }
    if (event.branch !== undefined) {
      ok = issue(issues, at(file, path + '.branch'), 'a remix event cannot name a branch');
    }
    if (i > 0 && event.x < remix[i - 1].x) {
      ok = issue(issues, at(file, path + '.x'), 'must be >= remix[' + String(i - 1) + '].x');
    }
    if (event.x > stage.length) ok = issue(issues, at(file, path + '.x'), 'must be <= length');
    if (
      event.minLoop !== undefined &&
      event.maxLoop !== undefined &&
      event.maxLoop < event.minLoop
    ) {
      ok = issue(issues, at(file, path + '.maxLoop'), 'must be >= minLoop');
    }
    event.branchId = -1;
  }
  return ok;
}

/**
 * The stage a World of a loop plays (M3-01): the stage itself on loop 1 (or without a remix), else
 * a copy whose timeline is its events with its {@link StageSpec.remix} merged in by `x` (a remix
 * event after the events of its `x`). Load time (allocates the copy — `core/world` calls it once
 * per World).
 *
 * @param stage - The stage.
 * @param loop - The loop (`GameConfig.loop`).
 * @returns The stage to run.
 *
 * @example
 * ```ts
 * stageForLoop(zoneA, 2).events.length; // → zone A's events + its remix
 * ```
 */
export function stageForLoop(stage: StageSpec, loop: number): StageSpec {
  const remix = stage.remix;
  if (!(loop >= 2) || remix === undefined || remix.length === 0) return stage;
  const events = stage.events;
  const merged: StageEvent[] = [];
  let r = 0;
  for (const event of events) {
    while (r < remix.length && remix[r].x < event.x) merged.push(remix[r++]);
    merged.push(event);
  }
  while (r < remix.length) merged.push(remix[r++]);
  return Object.freeze({ ...stage, events: Object.freeze(merged) });
}

/**
 * Checks and completes a stage's type and boss rush (M2-09) in place: `type` defaults to
 * `normal`; a `bossRush` stage needs a `rush` list and no `end` event (the last rush boss ends
 * it), a `normal` one must not have a `rush`; rush entries get their defaults (`delay`
 * {@link DEFAULT_RUSH_DELAY}, `warning` `false`). That the entries name bosses of role `boss` is
 * checked once the references are resolved ({@link checkBossReferences}).
 *
 * @param stage - The parsed stage.
 * @param file - Repo-relative file path.
 * @param issues - Collector.
 * @returns `true` when the rush part is usable.
 */
function checkStageRush(stage: MutableStage, file: string, issues: ValidationIssue[]): boolean {
  let ok = true;
  if (stage.type === undefined) stage.type = 'normal';
  const rush = stage.rush ?? [];
  if (stage.type === 'bossRush') {
    if (rush.length === 0) ok = issue(issues, at(file, 'rush'), 'is required for a bossRush stage');
    const events = stage.events;
    for (let i = 0; i < events.length; i++) {
      if (events[i].type === 'end') {
        ok = issue(
          issues,
          at(file, 'events[' + String(i) + ']'),
          'a bossRush stage has no end event (its last boss ends it)',
        );
      }
    }
  } else if (rush.length > 0) {
    ok = issue(issues, at(file, 'rush'), 'is only used by a bossRush stage (type "bossRush")');
  }
  if (stage.type === 'bonus') {
    // A hidden bonus stage (M2-10): no boss, no entrances of its own, an end to clear it by.
    const events = stage.events;
    let ends = 0;
    for (let i = 0; i < events.length; i++) {
      const type = events[i].type;
      if (type === 'end') ends++;
      else if (type === 'warning' || type === 'boss' || type === 'bonus') {
        ok = issue(
          issues,
          at(file, 'events[' + String(i) + ']'),
          'a bonus stage has no ' + type + ' event',
        );
      }
    }
    if (ends === 0) ok = issue(issues, at(file, 'events'), 'a bonus stage needs an end event');
  }
  for (const entry of rush) {
    if (entry.delay === undefined) entry.delay = DEFAULT_RUSH_DELAY;
    if (entry.warning === undefined) entry.warning = false;
  }
  stage.rush = rush;
  return ok;
}

/**
 * Checks and completes one `bonus` event (M2-10) in place: a `gap` needs its `region`, a `digit`
 * its `digit`, `place` must be one of {@link BONUS_PLACES}; `until` (defaulting as
 * {@link StageBonusEvent.until} says) must not lie before `x`. That `stage` names a bonus stage is
 * checked once the references are resolved.
 *
 * @param event - The parsed event (completed in place).
 * @param base - Its JSON path inside the file (`events[3]`).
 * @param file - Repo-relative file path.
 * @param issues - Collector.
 * @returns `true` when the event is usable.
 */
function checkBonusEvent(
  event: StageBonusEvent,
  base: string,
  file: string,
  issues: ValidationIssue[],
): boolean {
  let ok = true;
  const e = event as { -readonly [K in keyof StageBonusEvent]?: StageBonusEvent[K] };
  const region = event.region;
  if (event.entrance === 'gap' && region === undefined) {
    ok = issue(issues, at(file, base + '.region'), 'a gap entrance needs its region');
  }
  if (event.entrance === 'digit' && event.digit === undefined) {
    ok = issue(issues, at(file, base + '.digit'), 'a digit entrance needs its digit');
  }
  if (e.place === undefined) e.place = DEFAULT_BONUS_PLACE;
  else if ((BONUS_PLACES as readonly number[]).indexOf(e.place) < 0) {
    ok = issue(issues, at(file, base + '.place'), 'must be one of ' + BONUS_PLACES.join(', '));
  }
  if (e.until === undefined) {
    e.until =
      event.entrance === 'gap' && region !== undefined
        ? region.x + region.w
        : event.entrance === 'ground'
          ? event.x + DEFAULT_BONUS_WINDOW
          : event.x;
  }
  if ((e.until ?? 0) < event.x) {
    ok = issue(issues, at(file, base + '.until'), 'must be >= x (the window closes there)');
  }
  return ok;
}

/**
 * Checks and completes a stage's **Mode-7 floor** (M3-02) in place: `horizon < bottom`,
 * `from < to`, then the defaults (`bottom` {@link PLAYFIELD_H}, `scroll`
 * {@link DEFAULT_MODE7_SCROLL}, `sway` / `turn` / `from` 0, `fogDepth`
 * {@link DEFAULT_MODE7_FOG_DEPTH}, `alpha` 1, `to` `Infinity`) and the fog colour as 0xRRGGBB.
 * Load time.
 *
 * @param stage - The parsed stage (completed in place).
 * @param file - Repo-relative file path.
 * @param issues - Collector.
 * @returns `true` when the floor is usable (a stage without one always is).
 */
function checkStageMode7(stage: MutableStage, file: string, issues: ValidationIssue[]): boolean {
  const mode7 = stage.mode7;
  if (mode7 === undefined || mode7 === null) {
    stage.mode7 = null;
    return true;
  }
  let ok = true;
  if (mode7.bottom !== undefined && mode7.bottom <= (mode7.horizon ?? 0)) {
    ok = issue(issues, at(file, 'mode7.bottom'), 'must be greater than horizon');
  }
  if (mode7.to !== undefined && mode7.to <= (mode7.from ?? 0)) {
    ok = issue(issues, at(file, 'mode7.to'), 'must be greater than from');
  }
  if (mode7.bottom === undefined) mode7.bottom = PLAYFIELD_H;
  if (mode7.scroll === undefined) mode7.scroll = DEFAULT_MODE7_SCROLL;
  if (mode7.sway === undefined) mode7.sway = 0;
  if (mode7.turn === undefined) mode7.turn = 0;
  if (mode7.fogDepth === undefined) mode7.fogDepth = DEFAULT_MODE7_FOG_DEPTH;
  if (mode7.alpha === undefined) mode7.alpha = 1;
  if (mode7.from === undefined) mode7.from = 0;
  if (mode7.to === undefined) mode7.to = Number.POSITIVE_INFINITY;
  mode7.fogRgb = parseInt(String(mode7.fog).slice(1), 16);
  // `mode7.spriteId` is filled by the loader's reference pass (`s.ref('sprite')`).
  return ok;
}

/**
 * Checks and completes a stage's raster effects and palette cycles (M2-08) in place.
 *
 * @remarks
 * Checks: `top < bottom`; `from < to` (`from` defaulting to 0, so a lone `to: 0` is an empty range
 * too); the fields each raster kind needs (`wave` / `haze`: `amplitude` and `wavelength`; `lines`:
 * `factorTop` and `factorBottom`; `bands` only on `lines`, adding up to the rows); and for the
 * cycles distinct colours — at least 2 apart in some channel ({@link nearColor}), so the layer
 * shader can tell them apart — with at most {@link MAX_CYCLE_COLORS_PER_LAYER} per layer (all the
 * layer's cycles together). Then it fills the defaults (`period` {@link DEFAULT_RASTER_PERIOD},
 * `wavelength` 32, factors / `wrap` / `from` 0, `to` `Infinity`, `bands` `[]`) and resolves every
 * cycle colour to 0xRRGGBB (`rgb`). Load time (allocates).
 *
 * @param stage - The parsed stage (completed in place).
 * @param file - Repo-relative file path.
 * @param issues - Collector.
 * @returns `true` when the effects are usable.
 */
function checkStageEffects(stage: MutableStage, file: string, issues: ValidationIssue[]): boolean {
  let ok = true;
  const raster = stage.raster ?? [];
  for (let i = 0; i < raster.length; i++) {
    const effect = raster[i];
    const path = 'raster[' + String(i) + ']';
    if ((effect.bottom ?? 0) <= (effect.top ?? 0)) {
      ok = issue(issues, at(file, path + '.bottom'), 'must be greater than top');
    }
    // `from` defaults to 0: a `to` of 0 alone is an empty range too.
    if (effect.to !== undefined && effect.to <= (effect.from ?? 0)) {
      ok = issue(issues, at(file, path + '.to'), 'must be greater than from');
    }
    if (effect.kind === 'lines') {
      if (effect.factorTop === undefined || effect.factorBottom === undefined) {
        ok = issue(issues, at(file, path), 'a lines effect needs factorTop and factorBottom');
      }
      const bands = effect.bands;
      if (bands !== undefined) {
        let rows = 0;
        for (const height of bands) rows += height;
        if (rows !== (effect.bottom ?? 0) - (effect.top ?? 0)) {
          ok = issue(
            issues,
            at(file, path + '.bands'),
            'must add up to bottom - top (' + String(rows) + ' rows listed)',
          );
        }
      }
    } else if (effect.bands !== undefined) {
      ok = issue(issues, at(file, path + '.bands'), 'only a lines effect has bands');
    } else if (effect.amplitude === undefined || effect.wavelength === undefined) {
      ok = issue(
        issues,
        at(file, path),
        'a ' + String(effect.kind) + ' effect needs amplitude and wavelength',
      );
    }
    if (effect.amplitude === undefined) effect.amplitude = 0;
    if (effect.wavelength === undefined) effect.wavelength = 32;
    if (effect.period === undefined) effect.period = DEFAULT_RASTER_PERIOD;
    if (effect.factorTop === undefined) effect.factorTop = 0;
    if (effect.factorBottom === undefined) effect.factorBottom = 0;
    if (effect.bands === undefined) effect.bands = [];
    if (effect.wrap === undefined) effect.wrap = 0;
    if (effect.from === undefined) effect.from = 0;
    if (effect.to === undefined) effect.to = Number.POSITIVE_INFINITY;
  }
  stage.raster = raster;
  ok = checkStageMode7(stage, file, issues) && ok;
  const cycles = stage.cycles ?? [];
  // Colours already cycled on each layer (the shader's key colours must be distinct).
  const layerColors = new Map<string, number[]>();
  for (let i = 0; i < cycles.length; i++) {
    const cycle = cycles[i];
    const path = 'cycles[' + String(i) + ']';
    const layer = String(cycle.layer);
    const used = layerColors.get(layer) ?? [];
    layerColors.set(layer, used);
    const rgb: number[] = [];
    const colors = cycle.colors ?? [];
    for (let c = 0; c < colors.length; c++) {
      const value = parseInt(colors[c].slice(1), 16);
      if (rgb.indexOf(value) >= 0 || used.indexOf(value) >= 0) {
        ok = issue(
          issues,
          at(file, path + '.colors[' + String(c) + ']'),
          'colour ' + colors[c] + ' is already cycled on layer "' + layer + '"',
        );
      } else {
        // The layer shader matches a pixel within 1.5 / 255 per channel: key colours one step
        // apart would both match the first of them.
        const near = nearColor(value, rgb, used);
        if (near >= 0) {
          ok = issue(
            issues,
            at(file, path + '.colors[' + String(c) + ']'),
            'colour ' +
              colors[c] +
              ' is too close to #' +
              ('00000' + near.toString(16)).slice(-6) +
              ', cycled on layer "' +
              layer +
              '" (the layer shader matches colours within 1 per channel)',
          );
        }
      }
      rgb.push(value);
    }
    for (const value of rgb) used.push(value);
    if (used.length > MAX_CYCLE_COLORS_PER_LAYER) {
      ok = issue(
        issues,
        at(file, path + '.colors'),
        'layer "' +
          layer +
          '" cycles more than ' +
          String(MAX_CYCLE_COLORS_PER_LAYER) +
          ' colours (all its cycles together)',
      );
    }
    if (cycle.to !== undefined && cycle.to <= (cycle.from ?? 0)) {
      ok = issue(issues, at(file, path + '.to'), 'must be greater than from');
    }
    cycle.rgb = rgb;
    if (cycle.from === undefined) cycle.from = 0;
    if (cycle.to === undefined) cycle.to = Number.POSITIVE_INFINITY;
  }
  stage.cycles = cycles;
  return ok;
}

/**
 * Finds a colour the layer shader could not tell from `value`: another one at most 1 away in
 * every channel (`LAYER_EFFECT_FRAGMENT` in `@shmup/render-pixi` matches within 1.5 / 255).
 *
 * @param value - The colour, 0xRRGGBB.
 * @param a - Colours to compare with.
 * @param b - More colours to compare with.
 * @returns The first such colour, or -1.
 */
function nearColor(value: number, a: readonly number[], b: readonly number[]): number {
  for (const list of [a, b]) {
    for (const other of list) {
      if (other === value) continue;
      const dr = ((other >> 16) & 0xff) - ((value >> 16) & 0xff);
      const dg = ((other >> 8) & 0xff) - ((value >> 8) & 0xff);
      const db = (other & 0xff) - (value & 0xff);
      if (dr >= -1 && dr <= 1 && dg >= -1 && dg <= 1 && db >= -1 && db <= 1) return other;
    }
  }
  return -1;
}

/**
 * The checks a tileset needs beyond its schema: unique tile names, masks of `tileSize` columns
 * with heights in `0 … tileSize`; since M2-07 `hp` only on colliding tiles and `regen` only with
 * `hp`.
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
    // Destructible tiles (M2-07): only rock breaks, and only a breakable tile regrows.
    if (tile.hp !== undefined && tile.type === 'empty') {
      ok = issue(issues, at(file, path + '.hp'), 'an empty (decorative) tile cannot be destroyed');
    }
    if (tile.regen !== undefined && tile.hp === undefined) {
      ok = issue(issues, at(file, path + '.regen'), 'needs hp (only destructible tiles regrow)');
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
    // Moving blocks (M2-07) name a tile of the tileset: resolve it (default `solid`).
    for (let e = 0; e < stage.events.length; e++) {
      const event = stage.events[e];
      if (event.type !== 'block') continue;
      const name = event.tile ?? 'solid';
      const id = tileset.tables.byName.get(name);
      if (id === undefined) {
        issue(
          issues,
          at(db.stagePaths[i], 'events[' + String(e) + '].tile'),
          'tileset "' + tileset.id + '" has no tile named "' + name + '"',
        );
      } else {
        event.tileId = id;
      }
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
