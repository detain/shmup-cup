/**
 * # world — the gameplay session state and the fixed tick pipeline
 *
 * **Responsibility.** {@link World} holds everything one gameplay session simulates: the tick
 * counter, the two RNG streams, the presentation event queue, the player ships and their
 * intents, the camera, the session status, hit-stop, debug switches, the registry of
 * struct-of-arrays pools and the read-only {@link WorldView} the renderer draws.
 * {@link stepWorld} advances it by exactly one tick by running the systems of
 * {@link WORLD_PHASES} **in their fixed order** (plan §3.2, shmup_feat.md §22):
 *
 * ```
 * 1 input      per-player intents from the InputSnapshot (context 'game')
 * 2 players    movement, state timers, respawn / game over, PowerUp press (meter equip), weapon
 *              fire, option trails
 * 3 stage      late drops → capsules, late kills → score, boss timers (WARNING, intro, death
 *              sequence), camera path, event cursor, formation spawns, checkpoints
 * 4 scripts    wake sleeping enemy/boss coroutines; patterns fire bullets
 * 5 movement   movers (enemies), the boss and its parts, bullets, player shots, items, lasers
 * 6 collision  grid build; shots×enemies/boss parts, bullets/lasers×players, enemies/boss
 *              parts×players, items×players, terrain
 * 7 damage     apply hits, boss phases, deaths, drops, pickups, Mega Crash, score, player deaths
 *              + penalty
 * 8 removal    deferred pool flushes
 * 9 fx         hit-stop/shake/flash timers, emit presentation events, view mirrors, debug counters
 * ```
 *
 * Later steps fill the slots (M1-07 stage, M1-08 enemies, M1-09 … M1-12 bullets, shots, items
 * and damage); the order never changes. While {@link World.hitStop} is non-zero at the start of a
 * tick, phases 2–8 are skipped but the tick counter and phase 9 (which counts the hit-stop down)
 * still run, so hit-stop is deterministic and replays stay in sync.
 *
 * **State built in M1-06.** Player 1's KESTREL (spec from `content/player/`, fly-in at session
 * start); player 2's ship exists but stays inactive until it joins a co-op game (M2-06). The
 * view's sprite batches — the ground and flying enemies (M1-08) and the players
 * (`LayerId.Player`) — are mirrored from the objects at the end of every tick.
 *
 * **The stage (M1-07).** With `config.stage` set, the World runs that stage: its
 * {@link World.stage | runner} drives the camera in phase 3 (keys, ramps, pans, locks) and fires
 * the timeline through the World's stage hooks — `music` events become `SimEventKind.Music`
 * presentation events (the stage theme is queued at creation), `end` sets the status to
 * `stageClear`, `spawn` / `formation` go to the enemy system, `warning` / `boss` to the boss system
 * (M1-13), a checkpoint restart clears every pool, every enemy and the boss. Phase 6 tests each
 * alive ship's terrain box against the stage's {@link World.terrain | collision map} and reports
 * contact through `playerHit` (a death, M1-12). The view carries the stage's parallax bands
 * (scrolled in phase 9) and terrain. Without a stage (`stage: null`) the camera is static unless
 * something sets its scroll velocity (`camera.vx` / `camera.vy`) — free flight.
 *
 * **Enemies (M1-08).** {@link World.enemies} (`core/enemies`, behaviours from `core/behaviors`)
 * takes part in phases 3 (spawns: stage events and due formation members), 4 (behaviour
 * coroutines that wake), 5 (movers, off-screen rules), 6 (hurtboxes into the grid, contact with
 * the ships → `playerHit(Contact)`), 8 (freeing removed slots) and 9 (the ground / air sprite
 * batches, drawn below the ships).
 *
 * **Enemy bullets and lasers (M1-09).** {@link World.bullets} (`core/bullets`) owns the
 * `enemyBullets` / `enemyLasers` pools: scripts fire in phase 4, bullets and lasers move in
 * phase 5 (after the enemies, so attached lasers follow their enemy's new position) and hit the
 * players in phase 6 (`playerHit(Bullet / Laser)`); the view carries the bullet pool as the
 * `LayerId.EnemyBullets` batch and the lasers as `view.lasers`. {@link World.rank} is the
 * session's rank (`core/rank`); the bullet system scales bullet speeds and fire intervals by it.
 * The engine's own sprites (bullets, laser beam, bending laser segment, point item) are
 * {@link ENGINE_SPRITES} — hosts load content with `extraSprites: ENGINE_SPRITES` so they draw.
 *
 * **Pattern DSL, bending lasers, cancel points (M2-02).** {@link World.patterns} (`core/patterns`
 * `PatternVm`) interprets the content's DSL patterns: enemy behaviours step their emitters in
 * phase 4, bullets fired with `actions` run their own programs in phase 5 (it is the bullet
 * system's program runner); a checkpoint restart frees every bullet program
 * (`BulletSystem.clear`). The bending lasers move in phase 5 and hit in phase 6 like the lasers
 * (the view carries them as `view.bendingLasers`); the point items of a boss's death or a Mega
 * Crash (`CancelMode.Points`; the player's death still only sparkles) fly in phase 5 and are
 * drawn as the `cancelPoints` batch on `ITEMS`. `hashWorld` covers the bending lasers and the
 * interpreter's runners.
 *
 * **Meter arsenal (M2-03).** The weapon system fires the config's arsenal (`weaponPreset` /
 * `weaponEdit` — `core/weapons` `resolveArsenal`, which throws for a bad Weapon Edit) and the
 * power-up system applies its `!` / `?` choices; a `'full'` starting loadout grants the `?`
 * choice's shield (at creation and on a continue).
 *
 * **Option types, meter shields, Option Hunter (M2-04).** The option groups fly the config's
 * `optionChoice` (trail, Snake, Formation, Rotate — steered by the players' hold / toggle in
 * phase 2); the `?` slot grants its `shieldChoice` — pods are placed round their ship in phase 2,
 * stop the bullets (phase 6, `core/bullets`) and bodies (`core/enemies`) that touch them, and
 * Reduce shrinks every hurt-circle test; in phase 7, after the shots' hits, the Option Hunters
 * take the Options they touch (`EnemySystem.huntOptions`) before the power-ups (whose Mega Crash,
 * or a blue capsule, may free them again as drifting items). The rank's power term counts Reduce
 * +2 instead of a shield's +4. The view carries the Options a hunter carries as the last batch
 * (`EnemySystem.carriedBatch`).
 *
 * **Direct mode and the ship (M2-05).** The players fly the config's ship (`shipId` — the
 * KESTREL, or the MANTA of the ship select; `core/player` `resolvePlayerShip`). With
 * `powerUpMode: 'direct'` the weapons fire the content's shot families at the loadouts' levels, the
 * power-up system turns the tick's `powerup` / `capsule` drops into the stage's planned colour
 * items (red, green, blue, orange, yellow, octagon — its `directItems`) and reads the Speed toggle
 * in phase 2 instead of the PowerUp press, the blue items grow the Arm (which absorbs terrain
 * contact too), a death costs {@link applyDirectDeathPenalty}'s power, the starting loadout is
 * `core/weapons` `applyDirectLoadout` (the ship's `startSpeedLevel`) and the rank's power term is
 * `core/rank` `directPowerRank` (half the shot and sub levels plus the Arm's tier).
 *
 * **Player weapons (M1-10).** {@link World.weapons} (`core/weapons`, Options from `core/options`)
 * owns the `playerShots` pool, one loadout (`config.loadout` at creation) and one option group per
 * player: after the ships move in phase 2 the option trails advance and every shooter (ship and
 * Options) autofires; shots move in phase 5 (after the enemies and bullets), find their hits
 * through the grid in phase 6 and apply them in phase 7 (`EnemySystem.damage`); the view carries
 * the `LayerId.PlayerShots` batch and the Options' batch (below the ships). The Option sprite is
 * one of the {@link ENGINE_SPRITES}.
 *
 * **Power-ups (M1-11).** {@link World.powerups} (`core/powerups`, shields from `core/shields`)
 * owns the power meters, the `items` pool (capsules) and Mega Crash: in phase 2, between the
 * ships' movement and the weapons, the PowerUp press equips the highlighted slot (so a new weapon
 * fires at once); phase 3 turns drops of kills made between ticks into capsules; items move and
 * feel the pickup magnet in phase 5, are collected in phase 6 and applied in phase 7 (meter
 * advance, Auto Power-Up), where an armed Mega Crash then detonates, the shields' i-frames count
 * down and their hit / break events are pushed, and the tick's enemy drops become capsules. Every
 * ship's Force Field (`PlayerShip.shield`) absorbs hits inside `playerHit`. The view carries the
 * items (`LayerId.Items`) and the shields (`LayerId.Player`, over the ships); their sprites are
 * {@link ENGINE_SPRITES} too.
 *
 * **Death, respawn, lives and score (M1-12).** A hit that gets through to a ship during phase 6
 * (`playerHit` records it) becomes the **death sequence** in phase 7, after the shots' hits, the
 * power-ups and the tick's score: the ship is `dying` and loses a life (`core/player`
 * `killPlayer`), `SFX PlayerDeath`, `FX ExplosionLarge` + `FX Debris`, a gamepad rumble and a
 * `SimEventKind.MusicDuck` ({@link DEATH_MUSIC_DUCK_TICKS}) are pushed, a
 * {@link DEATH_HIT_STOP_TICKS}-tick hit-stop and a medium shake are requested (`core/fx`), every
 * cancelable enemy bullet and laser is cancelled with sparkles, and the death penalty of
 * `config.deathPenalty` applies (`core/powerups` `applyDeathPenalty`, decision D6). The ship
 * explodes (`dying`), then waits (`dead`); in phase 2 of the tick its dead time ends in, the World
 * respawns it when it has a life left (`respawnPlayer`: a blinking fly-in, invulnerable
 * afterwards) — with the `arcade` penalty after restarting the stage at its last checkpoint
 * (`StageRunner.restartAt`, which clears enemies, bullets, lasers, shots and items; in free flight
 * the same clear without a camera move; other ships in play fly in again). When no active ship
 * has a life left, the status becomes `gameOver` (from `playing` / `bossWarning`). Scores
 * (`core/scoring`, {@link World.scoring}) are credited in phase 7 (kills, formation bonuses,
 * pickups) and phase 3 (kills made between ticks); the effect timers ({@link World.fx}) count
 * down in phase 9.
 *
 * **Bosses (M1-13).** {@link World.bosses} (`core/bosses`, boss behaviours from `core/behaviors`)
 * runs the World's boss: a stage `warning` event starts the WARNING (status `bossWarning` for 180
 * ticks, the camera braking to a scroll lock, siren / dim / flash / music events — the text is
 * `view.warning`), then the boss flies in; its timers advance at the start of phase 3, its phase
 * script wakes in phase 4, it moves and places its parts in phase 5, its parts join the grid (ids
 * after the enemy slots) and touch the ships in phase 6, the player shots damage them in phase 7
 * (`core/weapons`), followed by the phase changes. Its death sequence (bullet cancel, chained
 * explosions, final blast with hit-stop, tally, stage-clear jingle) ends in status `stageClear`
 * and releases the scroll lock. With `config.stageSkip: 'boss'` the World starts its stage a
 * little before the boss (`core/debug` `skipToBoss`, the debug stage skip of M1-18). The parts
 * are drawn from the boss batch (`LayerId.AirEnemies`, after the other batches);
 * {@link World.laserSources} lists enemies then parts, so lasers can stay attached to either.
 * Since M2-09 the boss system has four slots (captains, double bosses and inner bosses share the
 * stage with the main boss; a resting half of a double boss is drawn from `bosses.backBatch`),
 * the stage's boss rush is handed to it at creation, a raid makes the stage runner's camera follow
 * the boss, and a stage boss's escape sets {@link World.endingFlags}.
 *
 * **Rank, extends and continues (M2-01).** At the end of phase 3 the World recomputes its rank
 * ({@link updateWorldRank}): `core/rank` `computeRank` over {@link World.rankInputs} — the
 * config's `rankBase` / `rankGrowth`, the loop and stage number (1 / 1 at creation; a campaign
 * run — M2-10, `core/scenes` `prepareRunWorld` — sets the stage term to the zones cleared + 1, the
 * loop stays 1) and the power term of the most powerful active ship (`powerRank`: Missile,
 * Double / Laser, Options, shield) — and hands a changed rank to the bullet system, so the fire
 * primitives of phase 4 use it. The scores give extra lives (`core/scoring` extends). When the
 * game is over and continues are left ({@link canContinue}: `config.continues` minus
 * {@link World.continuesUsed}), the scene flow's continue countdown may call
 * {@link continueWorld}: every active ship gets `config.startingLives` again, loses its power
 * (the `arcade` penalty, then the config's starting loadout), the score's last digit counts the
 * continue (`core/scoring` `markContinue`), the stage restarts at its last checkpoint and the
 * ships fly in — status `playing`.
 *
 * **Two-player co-op (M2-06).** With `config.coop` (the title's `2 PLAYERS`) player 2 **drops in**:
 * a {@link JOIN_ACTIONS} press (`Confirm` or `Pause` — the HUD's `PRESS START`) on its input slot
 * while it may join ({@link playerCanJoin}) brings it in during phase 1 ({@link joinPlayer}: a
 * blinking fly-in with the config's lives, `SFX PlayerJoin`). Each player keeps its own lives,
 * score, meter / items, shield and **continues** ({@link continuesLeft}: `config.continues` per
 * player, counted in its score's last digit): a player out of lives leaves play while the other
 * plays on, and comes back the same way with a continue (no stage restart); the game is over only
 * when every active player is out, and the continue countdown then continues the players who
 * press OK ({@link continueWorld}'s `who`). Items go to whoever touches them first (player 1 on a
 * tie), aimed shots target the nearest living player (player 1 on a tie), and while two ships are
 * in play every power-up drop adds `config.coopExtra` to a credit that drops extra items
 * (`core/powerups`). Player 2 is drawn with the ship's palette swap (`<sprite>@p2`,
 * `PlayerShipSpec.spriteP2Id`). Replays record both players' input, so a join replays too.
 *
 * **Advanced stage systems (M2-07).** {@link World.gimmicks} (`core/stage` `StageGimmicks`) owns
 * the stage's destructible terrain, moving blocks, and the pull fields and chains of gimmick
 * scripts: in phase 2, after the ships moved, the pull fields draw them (`applyFields`); in phase
 * 3, after the stage runner, the living ships probe the armed region triggers, the moving blocks
 * move (a stage `block` event creates one through the stage hooks) and the destructible terrain
 * heals / regrows around the ships' terrain boxes (`updateStage`); in phase 5 the player shots
 * that meet the terrain damage its destructible tiles (`core/weapons` → `hitTerrain`: points to
 * the shooter); in phase 9 the blocks' and chains' batches are refilled. A checkpoint restart
 * restores the stage's own tiles and brings back the blocks whose events lie behind the camera.
 * Moving blocks live in {@link World.terrain}'s `blocks`, so the ship's terrain test, the shots,
 * the bullets and the ground movers all treat them as rock. The view carries the chain batch
 * (`LayerId.GroundEnemies`) and, on a stage with blocks, the block batch (`LayerId.Terrain`) as its
 * last batches, and `view.terrain.changes` (the renderer's change log).
 *
 * **Presentation mirrors (M2-08).** The view also carries the stage's raster effects and palette
 * cycles (`view.effects` — `core/stage` `createStageEffectsView`, static data built once, `null` in
 * free flight) and the ships' hurtboxes for the "show hitbox" display option (`view.hitboxes` =
 * {@link World.hitboxBatch}, refilled in phase 9 by {@link syncWorldView}). The simulation never
 * reads either and `hashWorld` skips them.
 *
 * **Campaign support (M2-10).** {@link World.bonus} (`core/stage` `BonusEntrances`) holds the
 * stage's hidden bonus-stage entrances: the stage hook arms them (`bonus` events), phase 3 tests them
 * after the stage runner (a ship in a marked gap, every ground enemy of a window destroyed, a
 * score digit) and a checkpoint restart re-arms the open windows behind the camera; the scene flow
 * reads the entry. The enemy system counts its spawns and kills (`EnemySystem.stats`, the zone
 * tally's kill rate). Once the status is `stageClear` every ship in control flies out on the next
 * phase 2 (`core/player` `flyOutPlayer`). The campaign sets {@link World.rankInputs}'s `stage` to
 * the zone's depth + 1 (`core/scenes` `prepareRunWorld`). `hashWorld` covers the entrances and
 * the enemy totals.
 *
 * **Extra modes and assists (M3-01).** A World of loop 2+ (`GameConfig.loop` — the ARCADE mode)
 * plays its stage with the loops' remix merged in (`core/data` `stageForLoop`, applied in
 * {@link createWorld}; loop 1 plays the stage as it is) and passes the loop to the rank, the stage
 * runner, the enemy system (revenge bullets from every kill) and the bullet system (faster
 * bullets). A World with a time limit (`GameConfig.timeLimit` — the CARAVAN) counts
 * {@link World.timeLeft} down in phase 9 while the stage is played; at 0 it ends as `stageClear`
 * with {@link World.timeUp}; a stage cleared with time left pays {@link CARAVAN_TIME_BONUS} a whole
 * second to every player in play, once ({@link World.clockPaid}). `GameConfig.invincible` makes
 * every ship ignore hits (the assist), and with `GameConfig.optionRecovery` the Options a death
 * penalty takes drop at the wreck as Free Option items. Between ticks the scene flow may call
 * {@link grantFullPower} and {@link selfDestruct} (the pause menu's secret codes — a run replay
 * records them as flow actions).
 *
 * **Zero allocation.** Everything is allocated by {@link createWorld}; {@link stepWorld} and the
 * systems only write numbers into existing objects and typed arrays.
 *
 * **Implements.**
 * - shmup_feat.md §22 — architecture (sim/presentation split, event queue), fixed tick order,
 *   determinism (seeded RNG streams), hybrid data layout (SoA pools + objects)
 * - shmup_feat.md §5 — the player ship inside the session
 * - shmup_feat.md §18 — hit-stop freezes the simulation, not the presentation
 * - shmup_feat.md §15 — the rank recomputed every tick from the preset's base / growth and the
 *   strongest ship's power ({@link updateWorldRank})
 * - shmup_feat.md §10 — continues: restart at the last checkpoint with fresh lives, the continue
 *   count in the score's last digit ({@link canContinue}, {@link continueWorld})
 * - shmup_feat.md §16 — 2-player simultaneous co-op: drop-in join, separate lives and continues
 *   ({@link joinPlayer}, M2-06)
 * - shmup_feat.md §14 — destructible terrain, moving floors / ceilings, stage gimmicks and region
 *   triggers wired into the tick (M2-07, {@link World.gimmicks})
 * - shmup_feat.md §18 / §21 — the view's presentation mirrors for raster effects, palette cycling
 *   and the hitbox display option (M2-08; drawn by the renderer, never read by the sim)
 * - shmup_feat.md §14 — hidden bonus-stage entrances; §5 — the stage-clear fly-out (M2-10)
 * - shmup_feat.md §15 — the 2nd loop's remixed layouts, faster bullets and revenge bullets;
 *   §16 — the caravan's time limit; §4 — the pause-menu secrets; §8 — option recovery; §21 — the
 *   invincibility assist (M3-01)
 *
 * **Public API.** {@link createWorld}, {@link WorldOptions}, {@link stepWorld}, {@link World},
 * {@link WorldCamera},
 * {@link WorldStatus}, {@link WORLD_STATUSES}, {@link WorldPhase}, {@link WORLD_PHASE_NAMES},
 * {@link WORLD_PHASES}, {@link WorldPhaseEntry}, {@link WorldSystem}, {@link PoolRegistry},
 * {@link RegisteredPool}, {@link syncWorldView}, {@link GRID_MARGIN}, {@link resolveWorldStage},
 * {@link ENGINE_SPRITES}, {@link DEATH_HIT_STOP_TICKS}, {@link DEATH_SHAKE_TICKS},
 * {@link DEATH_MUSIC_DUCK_TICKS}, {@link updateWorldRank}, {@link canContinue},
 * {@link continueWorld}; co-op (M2-06): {@link JOIN_ACTIONS}, {@link playerCanJoin},
 * {@link joinPlayer}, {@link continuesLeft}; M3-01: {@link grantFullPower},
 * {@link selfDestruct}, {@link CARAVAN_TIME_BONUS}.
 *
 * @module
 */
import { Action, MAX_PLAYERS, type InputSnapshot } from '../input/index.js';
import { PLAYFIELD_H, PLAYFIELD_W, type GameConfig } from '../config/index.js';
import {
  TerrainType,
  createSpatialGrid,
  terrainRectHit,
  type SpatialGrid,
  type TerrainMap,
} from '../collision/index.js';
import { DEFAULT_BEHAVIORS, DEFAULT_BOSS_BEHAVIORS } from '../behaviors/index.js';
import { createBossSystem, type BossBehaviorLookup, type BossSystem } from '../bosses/index.js';
import {
  BULLET_SPRITES,
  CancelMode,
  createBulletSystem,
  type BulletSystem,
  type LaserSource,
} from '../bullets/index.js';
import {
  stageForLoop,
  type ContentDb,
  type PlayerShipSpec,
  type StageBossEvent,
  type StageMusicEvent,
  type StageSpec,
} from '../data/index.js';
import { createDebugFlags, skipToBoss, type DebugFlags } from '../debug/index.js';
import {
  DropKind,
  createEnemySystem,
  type EnemyBehaviorLookup,
  type EnemySystem,
} from '../enemies/index.js';
import {
  ShakeMagnitude,
  createFxState,
  requestHitStop,
  requestShake,
  tickFx,
  type FxState,
} from '../fx/index.js';
import { OPTION_SPRITE } from '../options/index.js';
import { createPatternVm, type PatternVm } from '../patterns/index.js';
import {
  ITEM_SPRITES,
  applyDeathPenalty,
  applyDirectDeathPenalty,
  createPowerUpSystem,
  type PowerUpSystem,
} from '../powerups/index.js';
import {
  addScore,
  createScoringSystem,
  markContinue,
  type ScoringSystem,
} from '../scoring/index.js';
import { SHIELD_SPRITES, ShieldKind, shieldActive, shieldSpecOf } from '../shields/index.js';
import {
  MainWeapon,
  WEAPON_SPRITES,
  applyDirectLoadout,
  applyLoadoutPreset,
  createWeaponSystem,
  type WeaponSystem,
} from '../weapons/index.js';
import { UI_SPRITES } from '../ui/index.js';
import {
  FX_CUES,
  MUSIC_CUES,
  SFX_CUES,
  SfxPriority,
  SimEventKind,
  createEventQueue,
  type EventQueue,
} from '../events/index.js';
import { defineModule } from '../module-info.js';
import {
  PLAYER_DEAD_TICKS,
  PlayerHitCause,
  createPlayer,
  createPlayerIntent,
  flyOutPlayer,
  killPlayer,
  playerBankFrame,
  playerHit,
  playerOut,
  readPlayerIntent,
  resolvePlayerShip,
  respawnPlayer,
  spawnPlayer,
  updatePlayer,
  type PlayerCamera,
  type PlayerIntent,
  type PlayerShip,
} from '../player/index.js';
import type { SoaArray, SoaPool, SoaSchema } from '../pools/index.js';
import {
  LayerId,
  SpriteFlag,
  createHitboxBatch,
  createSpriteBatch,
  pushSprite,
  type HitboxBatch,
  type SpriteBatch,
  type BendingLaserView,
  type LaserView,
  type SpriteBatchView,
  type TerrainView,
  type WarningView,
  type WorldView,
} from '../presentation/index.js';
import {
  computeRank,
  createRankInputs,
  directPowerRank,
  powerRank,
  type RankInputs,
} from '../rank/index.js';
import { createRngStreams, type RngStreams } from '../rng/index.js';
import {
  GIMMICK_SPRITES,
  StageEventCode,
  createBonusEntrances,
  createParallaxView,
  createStageCamera,
  createStageEffectsView,
  createStageGimmicks,
  createStageRunner,
  createStageTerrain,
  createTerrainView,
  updateParallaxView,
  type BonusEntrances,
  type StageGimmicks,
  type StageHooks,
  type StageParallaxView,
  type StageRunner,
} from '../stage/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'world',
  status: 'implemented',
  specRefs: [
    'shmup_feat.md §22',
    'shmup_feat.md §5',
    'shmup_feat.md §18',
    'shmup_feat.md §15',
    'shmup_feat.md §10',
    'shmup_feat.md §16',
    'shmup_feat.md §14',
  ],
});

/** What the session is doing (the scene stack of M1-16 reacts to it). */
export type WorldStatus = 'playing' | 'bossWarning' | 'stageClear' | 'gameOver';

/** Every {@link WorldStatus}; the index is the status code in state hashes. */
export const WORLD_STATUSES: readonly WorldStatus[] = Object.freeze([
  'playing',
  'bossWarning',
  'stageClear',
  'gameOver',
] as WorldStatus[]);

/**
 * The world camera: the world-space top-left corner of the playfield view, its scroll velocity
 * and its last movement. The renderer reads `x` / `y` (it is the view's {@link CameraView}).
 */
export interface WorldCamera extends PlayerCamera {
  /** World x of the playfield's left edge. */
  x: number;
  /** World y of the playfield's top edge. */
  y: number;
  /** Camera x movement of the last stage phase (players ride along with it). */
  dx: number;
  /** Camera y movement of the last stage phase. */
  dy: number;
  /** Horizontal scroll velocity in px/tick (0 = static; the stage runner sets it every tick). */
  vx: number;
  /** Vertical scroll velocity in px/tick. */
  vy: number;
}

/** A struct-of-arrays pool as the world tracks it (flushes, hashing, clearing). */
export interface RegisteredPool {
  /** Registry name, e.g. `enemyBullets`. */
  readonly name: string;
  /** The pool. */
  readonly pool: Pick<SoaPool<SoaSchema>, 'count' | 'capacity' | 'flush' | 'clear'>;
  /** The pool's field arrays in sorted field-name order (the state-hash order). */
  readonly arrays: readonly SoaArray[];
}

/**
 * The pools of a world. Systems register their SoA pools at creation; the removal phase flushes
 * them all, `hashWorld` hashes their live slots.
 */
export interface PoolRegistry {
  /** Registered pools, in registration order. */
  readonly entries: readonly RegisteredPool[];
  /**
   * Adds a pool (load time only).
   *
   * @param name - Unique name.
   * @param pool - The pool.
   * @returns The same pool, for chaining.
   * @throws {Error} When `name` is already registered.
   */
  register<S extends SoaSchema>(name: string, pool: SoaPool<S>): SoaPool<S>;
  /** Applies every pool's deferred frees (tick phase 8). */
  flushAll(): void;
  /** Empties every pool (stage restart). */
  clearAll(): void;
}

/** One gameplay session (see the module docs for the tick pipeline). */
export interface World {
  /** The session's configuration. */
  readonly config: GameConfig;
  /** Validated content. */
  readonly content: ContentDb;
  /** The ship the players fly (spec from `content/player/`, or the built-in default). */
  readonly ship: PlayerShipSpec;
  /** Ticks simulated so far (during a tick: the index of the tick being run). */
  tick: number;
  /** Gameplay and cosmetic RNG streams, seeded from `config.seed`. */
  readonly rng: RngStreams;
  /** Presentation events (SFX, particles, shake …); the host drains it once per frame. */
  readonly events: EventQueue;
  /**
   * Exactly {@link MAX_PLAYERS} ships; index 0 = player 1 (player 2 inactive until it joins a co-op
   * game — {@link joinPlayer}, M2-06).
   */
  readonly players: readonly PlayerShip[];
  /** Per-player intents of the current tick (phase 1). */
  readonly intents: readonly PlayerIntent[];
  /** The camera. */
  readonly camera: WorldCamera;
  /** Session status. */
  status: WorldStatus;
  /**
   * Remaining hit-stop ticks: a tick that starts with it > 0 skips phases 2–8 and counts it down
   * (`core/fx` `requestHitStop` raises it — the player's death).
   */
  hitStop: number;
  /** Shake and flash timers (`core/fx`); counted down in phase 9. */
  readonly fx: FxState;
  /**
   * Debug switches (god mode, outlines, frame advance, slow motion, overlay) — the game's shared
   * set (`WorldOptions.debugFlags`); only god mode changes what a tick does.
   */
  readonly debugFlags: DebugFlags;
  /** Struct-of-arrays pools of the session's systems. */
  readonly pools: PoolRegistry;
  /** Broad-phase grid over the camera view (+ {@link GRID_MARGIN}), rebuilt in phase 6. */
  readonly grid: SpatialGrid;
  /** The player ships' mirror batch (`LayerId.Player`). */
  readonly playerBatch: SpriteBatch;
  /**
   * The ships' hurtboxes (M2-08, `view.hitboxes`): refilled with {@link World.playerBatch} at the
   * end of every tick — each live ship's centre and hurt radius (× its shield's hurt
   * scale). Drawn only while the "show hitbox" display option is on; never read by the sim.
   */
  readonly hitboxBatch: HitboxBatch;
  /** The stage runner (`config.stage`), or `null` in free flight. */
  readonly stage: StageRunner | null;
  /** The stage's collision map (a private copy of its tiles), or `null` in open space. */
  readonly terrain: TerrainMap | null;
  /** The stage's parallax bands (also `view.parallax`), or `null`. */
  readonly parallax: StageParallaxView | null;
  /**
   * The stage gimmicks (M2-07, `core/stage` `StageGimmicks`): the destructible terrain of
   * {@link World.terrain}, the moving blocks, the pull fields and chains of enemy scripts.
   */
  readonly gimmicks: StageGimmicks;
  /**
   * The stage's hidden bonus-stage entrances (M2-10, `core/stage` `BonusEntrances`): armed by its
   * `bonus` events, tested in phase 3; {@link BonusEntrances.entered} tells the scene flow to fly
   * the players into the bonus stage. None in free flight.
   */
  readonly bonus: BonusEntrances;
  /** The enemies (spawns, formations, scripts, movers, contact; `core/enemies`). */
  readonly enemies: EnemySystem;
  /** Enemy bullets and lasers (`core/bullets`). */
  readonly bullets: BulletSystem;
  /**
   * The DSL pattern interpreter (`core/patterns`, M2-02): enemies' emitters and the bullets' own
   * programs (installed as the bullet system's program runner).
   */
  readonly patterns: PatternVm;
  /** The players' weapons, loadouts and Options (`core/weapons`, `core/options`). */
  readonly weapons: WeaponSystem;
  /** Power meters, capsules, Mega Crash and the shields' feedback (`core/powerups`). */
  readonly powerups: PowerUpSystem;
  /** Per-player scores and the session hi-score, credited every tick (`core/scoring`). */
  readonly scoring: ScoringSystem;
  /** The boss, its WARNING and its death sequence (`core/bosses`, M1-13). */
  readonly bosses: BossSystem;
  /**
   * Every laser source by id (`core/bullets`): the enemy slots, then the boss parts (from
   * `core/bosses` `BOSS_PART_ID_BASE`), so enemy and boss lasers can stay attached to their gun.
   */
  readonly laserSources: readonly LaserSource[];
  /**
   * The session's rank, 0–31 (`core/rank`; recomputed at the end of phase 3 —
   * {@link updateWorldRank}).
   */
  rank: number;
  /**
   * What the rank is computed from (mutable): the config's base and growth, `loop` / `stage` (1 / 1
   * until the campaign of M2-10 sets them), the `power` term of the most powerful active ship
   * (written by {@link updateWorldRank}) and `special` (0).
   */
  readonly rankInputs: { -readonly [K in keyof RankInputs]: RankInputs[K] };
  /**
   * Continues used so far this game (M2-01): one per {@link continueWorld} (whoever continued) and
   * one per co-op player continuing mid-game ({@link joinPlayer}, M2-06). The per-player budget is
   * {@link continuesLeft}.
   */
  continuesUsed: number;
  /**
   * Ending flags of the session (M2-09, `core/bosses` `EndingFlag`): a stage boss that escaped
   * when its time limit ran out sets `BossEscaped`. The campaign (M2-10) carries them between
   * zones and picks the ending with them. Hashed.
   */
  endingFlags: number;
  /**
   * The caravan's clock (M3-01 — `GameConfig.timeLimit`): ticks left to play, -1 without a limit.
   * Counted down in phase 9 while the stage is played (`playing` / `bossWarning`); at 0 the World
   * ends ({@link World.timeUp}). Hashed only with a time limit.
   */
  timeLeft: number;
  /** The caravan's time ran out (M3-01): the status became `stageClear` at the clock's 0. */
  timeUp: boolean;
  /**
   * Whether the caravan's time bonus of a stage cleared with time left was paid (M3-01 —
   * {@link CARAVAN_TIME_BONUS} per second left; once).
   */
  clockPaid: boolean;
  /** What the renderer draws: live references, refreshed at the end of every tick. */
  readonly view: WorldView;
}

/**
 * Options of {@link createWorld} beyond the config (tests and tools). Not part of `GameConfig`:
 * nothing here is recorded in a replay header, so a session must use the defaults.
 *
 * @example
 * ```ts
 * const probe = defineBehavior('probe', {}, function* (api) {
 *   api.setMover(MoverKind.Straight, -1, 0);
 *   yield SLEEP_FOREVER;
 * });
 * const behaviors = createBehaviorRegistry([...DEFAULT_BEHAVIOR_DEFS, probe]);
 * const world = createWorld(config, db, { behaviors });
 * ```
 */
export interface WorldOptions {
  /**
   * Enemy behaviours by script id (default: `core/behaviors` `DEFAULT_BEHAVIORS`). A spec whose
   * `script` the lookup does not know spawns without a script (it only runs its spec mover).
   */
  readonly behaviors?: EnemyBehaviorLookup;
  /**
   * Boss behaviours by script id (default: `core/behaviors` `DEFAULT_BOSS_BEHAVIORS`). A boss
   * phase whose `script` the lookup does not know runs no script.
   */
  readonly bossBehaviors?: BossBehaviorLookup;
  /**
   * The presentation event queue to push into (default: a new one). A game that creates several
   * Worlds over its life (the scene flow of M1-16 — one per game start) hands every World the
   * game's one queue, so the host keeps draining one queue (`Game.events`) whichever World runs.
   */
  readonly events?: EventQueue;
  /**
   * The debug switches to share (default: new ones, everything off). A game hands every World of
   * the session its one set (`Game.debug`), so god mode or the outlines survive a new game start.
   * God mode is sim-affecting: a replay header records it as `assisted` (`core/replay`).
   */
  readonly debugFlags?: DebugFlags;
}

/**
 * A system function of one tick phase.
 *
 * @param world - The world.
 * @param input - The tick's input snapshot (read-only).
 */
export type WorldSystem = (world: World, input: Readonly<InputSnapshot>) => void;

/** Tick phases in order (plan §3.2); the value is the position in {@link WORLD_PHASES}. */
export const WorldPhase = {
  /** 1 — per-player intents from the input snapshot. */
  Input: 0,
  /** 2 — player movement, state timers, fire requests, option trail. */
  Players: 1,
  /** 3 — camera path, event cursor, spawns, checkpoints. */
  Stage: 2,
  /** 4 — enemy / boss coroutines and attack patterns. */
  Scripts: 3,
  /** 5 — movers, bullets, shots, items, lasers. */
  Movement: 4,
  /** 6 — broad phase and every overlap test. */
  Collision: 5,
  /** 7 — hits, deaths, drops, score, respawn. */
  Damage: 6,
  /** 8 — deferred pool flushes. */
  Removal: 7,
  /** 9 — effect timers, presentation events, view mirrors. */
  Fx: 8,
} as const;

/** A {@link WorldPhase} value. */
export type WorldPhase = (typeof WorldPhase)[keyof typeof WorldPhase];

/** Phase names by {@link WorldPhase} (debug overlays, profiling). */
export const WORLD_PHASE_NAMES: readonly string[] = Object.freeze([
  'input',
  'players',
  'stage',
  'scripts',
  'movement',
  'collision',
  'damage',
  'removal',
  'fx',
]);

/** One entry of the tick pipeline. */
export interface WorldPhaseEntry {
  /** The phase. */
  readonly phase: WorldPhase;
  /** Its name (see {@link WORLD_PHASE_NAMES}). */
  readonly name: string;
  /** Whether the phase also runs during hit-stop (only input and fx do). */
  readonly runsDuringHitStop: boolean;
  /** The system function. */
  readonly run: WorldSystem;
}

/** Extra border of the broad-phase grid around the camera view, in pixels. */
export const GRID_MARGIN = 64;

/**
 * Phase 1: copies each player's input into its intent (every slot, active or not, so a joining
 * player's device is known); in a co-op game (M2-06) a {@link JOIN_ACTIONS} press of a player who
 * may join ({@link playerCanJoin}) then brings that player in ({@link joinPlayer}). Runs during
 * hit-stop too, so a join press is never lost to one.
 *
 * @param world - The world.
 * @param input - The tick's input.
 */
const inputSystem: WorldSystem = (world, input) => {
  const players = input.players;
  const intents = world.intents;
  for (let i = 0; i < intents.length && i < players.length; i++) {
    readPlayerIntent(intents[i], players[i]);
  }
  if (!world.config.coop) return;
  for (let i = 0; i < intents.length; i++) {
    if ((intents[i].pressed & JOIN_ACTIONS) !== 0) joinPlayer(world, i);
  }
};

/**
 * Phase 2: once the stage is cleared, every ship in control starts its fly-out (M2-10 —
 * `core/player` `flyOutPlayer`); then it moves the ships and advances their state timers, then the
 * life cycle (respawns and game over — `lifecycleSystem`), then the PowerUp presses equip the
 * meter (before the weapons, so a new weapon or Option fires on this tick), then the weapons
 * follow the ships: option trails, autofire.
 *
 * @param world - The world.
 */
const playersSystem: WorldSystem = (world) => {
  const players = world.players;
  // The stage-clear fly-out (M2-10): every ship in control leaves once the stage is cleared.
  if (world.status === 'stageClear') {
    for (let i = 0; i < players.length; i++) {
      if (players[i].active && players[i].state === 'alive') flyOutPlayer(players[i]);
    }
  }
  for (let i = 0; i < players.length; i++) {
    updatePlayer(players[i], world.ship, world.intents[i], world.camera);
  }
  // Pull fields (M2-07: suction, the tentacle's grab) draw the ships after they moved.
  world.gimmicks.applyFields();
  lifecycleSystem(world);
  world.powerups.updatePlayers();
  world.weapons.updatePlayers();
};

/**
 * Part of phase 2, after the ships' timers advanced: respawns every ship whose dead time is over
 * and that has a life left (the `arcade` penalty restarts the stage at its last checkpoint first),
 * then ends the game when no active ship has a life left.
 *
 * @param world - The world.
 */
function lifecycleSystem(world: World): void {
  const players = world.players;
  let active = 0;
  let out = 0;
  for (let i = 0; i < players.length; i++) {
    const ship = players[i];
    if (!ship.active) continue;
    active++;
    if (ship.state === 'dead' && ship.stateTicks >= PLAYER_DEAD_TICKS && ship.lives > 0) {
      respawnShip(world, i);
    }
    if (playerOut(ship)) out++;
  }
  if (
    active > 0 &&
    out === active &&
    (world.status === 'playing' || world.status === 'bossWarning')
  ) {
    world.status = 'gameOver';
  }
}

/**
 * Brings a ship back after its dead time (rare, cold path). With the `arcade` penalty the stage
 * restarts at its last checkpoint first (`StageRunner.restartAt` — its `clear` hook empties every
 * pool and system; in free flight the same clear runs without a camera move) and every other ship
 * in play flies in again with it.
 *
 * @param world - The world.
 * @param slot - The ship's player slot.
 */
function respawnShip(world: World, slot: number): void {
  const players = world.players;
  const camera = world.camera;
  if (world.config.deathPenalty === 'arcade') {
    const stage = world.stage;
    if (stage !== null) stage.restartAt(stage.checkpoint);
    else clearSession(world);
    for (let i = 0; i < players.length; i++) {
      const other = players[i];
      if (i === slot || !other.active || other.state === 'dying' || other.state === 'dead') {
        continue;
      }
      respawnPlayer(other, world.ship, camera);
    }
  }
  respawnPlayer(players[slot], world.ship, camera);
}

/**
 * Empties every pool and system of the session (a checkpoint restart — the stage hooks' `clear` —
 * or the `arcade` respawn in free flight).
 *
 * @param world - The world.
 */
function clearSession(world: World): void {
  world.pools.clearAll();
  world.bullets.clear();
  world.enemies.clear();
  world.bosses.clear();
  world.weapons.clear();
  world.powerups.clear();
  world.scoring.clear();
  // The stage's own terrain again, no fields or chains, the blocks before the camera (M2-07).
  world.gimmicks.clear(world.stage, world.camera.x);
  // The bonus entrances behind the camera with an open window re-arm (M2-10).
  world.bonus.clear(world.stage, world.camera.x);
}

/**
 * Phase 3: first the power-ups and the scores take what was recorded between ticks (drops →
 * capsules, kills → score — the tools' kills), then the enemy outcomes reset; the stage runner
 * moves the camera and fires the due timeline events; without a stage the camera moves by its
 * scroll velocity (`vx` / `vy`, static by default). Either way `dx` / `dy` record the step players
 * ride along with next tick. Last, the rank is recomputed ({@link updateWorldRank}) for the
 * scripts of phase 4.
 *
 * @param world - The world.
 */
const stageSystem: WorldSystem = (world) => {
  const enemies = world.enemies;
  world.powerups.beginTick();
  world.scoring.beginTick();
  enemies.beginTick();
  world.bosses.update();
  const stage = world.stage;
  if (stage !== null) {
    stage.tick();
  } else {
    const camera = world.camera;
    camera.dx = camera.vx;
    camera.dy = camera.vy;
    camera.x += camera.dx;
    camera.y += camera.dy;
  }
  // Region triggers, moving blocks, terrain regrowth (M2-07).
  world.gimmicks.updateStage(stage);
  // The hidden bonus-stage entrances (M2-10).
  world.bonus.update();
  enemies.spawnPending();
  updateWorldRank(world);
};

/**
 * Phase 4: resumes the enemy coroutines that wake this tick, then the boss's (they fire bullets
 * and lasers).
 *
 * @param world - The world.
 */
const scriptsSystem: WorldSystem = (world) => {
  world.enemies.runScripts();
  world.bosses.runScript();
};

/**
 * Phase 5: enemy movers and the off-screen rules, then the boss (fly-in, motion, part
 * transforms), then enemy bullets and lasers (attached ones follow their enemy or part), then the
 * player shots, then the items (drift, pickup magnet, culling).
 *
 * @param world - The world.
 */
const movementSystem: WorldSystem = (world) => {
  world.enemies.move();
  world.bosses.move();
  world.bullets.update();
  world.weapons.update();
  world.powerups.update();
};

/**
 * Phase 6: rebuilds the broad-phase grid around the camera view with the enemy and boss-part
 * hurtboxes, then the overlap tests: enemies and boss parts × players (contact), player shots ×
 * enemies and boss parts (hits found here, applied in phase 7), bullets / lasers × players,
 * terrain × players, items × players (pickups, applied in phase 7).
 *
 * @remarks
 * The grid origin is the camera position floored to whole pixels: it only decides which cell a
 * box lands in (queries test the stored boxes exactly), and whole numbers travel as small
 * integers, whereas a fractional camera position would be boxed into a 16-byte heap number per
 * argument whenever V8 does not inline the call — an allocation per scrolling axis per tick.
 *
 * @param world - The world.
 */
const collisionSystem: WorldSystem = (world) => {
  const grid = world.grid;
  const camera = world.camera;
  const enemies = world.enemies;
  grid.begin(Math.floor(camera.x) - GRID_MARGIN, Math.floor(camera.y) - GRID_MARGIN);
  enemies.insertColliders(grid);
  world.bosses.insertColliders(grid);
  grid.build();
  enemies.collidePlayers(grid);
  world.bosses.collidePlayers();
  world.weapons.collide(grid);
  world.bullets.collidePlayers();
  const terrain = world.terrain;
  if (terrain !== null) terrainSystem(world, terrain);
  world.powerups.collide();
};

/**
 * Part of phase 6: each alive ship's terrain box against the stage terrain; contact is reported
 * through `playerHit` (cause `Terrain` — the Force Field does not absorb it: a death).
 *
 * @param world - The world.
 * @param terrain - The stage's collision map.
 */
function terrainSystem(world: World, terrain: TerrainMap): void {
  const box = world.ship.terrainBox;
  const players = world.players;
  for (let i = 0; i < players.length; i++) {
    const ship = players[i];
    if (!ship.active || ship.state !== 'alive') continue;
    // Whole-pixel bounds (as `boxHitsTerrain` computes them): fractional arguments would be
    // boxed into heap numbers by a call V8 does not inline.
    const x0 = Math.floor(ship.x - box.hw);
    const y0 = Math.floor(ship.y - box.hh);
    const x1 = Math.ceil(ship.x + box.hw) - 1;
    const y1 = Math.ceil(ship.y + box.hh) - 1;
    const hit = terrainRectHit(terrain, x0, y0, x1 < x0 ? x0 : x1, y1 < y0 ? y0 : y1);
    if (hit !== TerrainType.Empty) {
      playerHit(ship, PlayerHitCause.Terrain, world.tick, world.debugFlags);
    }
  }
}

/**
 * Phase 7: applies the player shots' hits (damage, deaths, drops, kill records — `core/weapons`;
 * boss parts through `core/bosses`), then the boss's phase changes, then the Option Hunters take
 * the Options they touch (`EnemySystem.huntOptions`, M2-04), then the power-ups
 * (`core/powerups`: pickups and Auto Power-Up, Mega Crash, shield feedback, capsules from the
 * tick's drops), then credits the tick's score (`core/scoring`), then starts the death sequence
 * of every ship hit this tick.
 *
 * @param world - The world.
 */
const damageSystem: WorldSystem = (world) => {
  world.weapons.applyHits();
  world.bosses.resolve();
  world.enemies.huntOptions();
  world.powerups.resolve();
  world.scoring.resolve();
  const players = world.players;
  const tick = world.tick;
  for (let i = 0; i < players.length; i++) {
    const ship = players[i];
    if (!ship.active || ship.state !== 'alive') continue;
    if (ship.hitTick === tick && ship.hitCause !== PlayerHitCause.None) killShip(world, i);
  }
};

/**
 * Recomputes the World's rank (shmup_feat.md §15): the power term of the most powerful active
 * ship — dying, dead and respawning ones included (see the remarks) — (`core/rank` `powerRank`:
 * Missile +1, Double +2, Laser +3, each Option +1, a shield +4 — Reduce +2 instead, M2-04; in
 * Direct mode `directPowerRank`: half the shot and sub levels plus +2 / +3 / +4 for the Arm's
 * tier, M2-05) goes
 * into {@link World.rankInputs}, `computeRank` gives the rank, and a changed rank is handed to the
 * bullet system (`BulletSystem.setRank` — the curves are only
 * evaluated then). The World calls it at the end of phase 3; call it after changing
 * `rankInputs` (the campaign's loop / stage) outside a tick. Never allocates.
 *
 * @remarks
 * A ship that died keeps counting until the death penalty took its power (the same tick, phase
 * 7): from the next phase 3 its reduced loadout counts, while it is dead and while it flies back
 * in. Without an active ship the power term is 0.
 *
 * @param world - The world.
 * @returns The rank.
 *
 * @example
 * ```ts
 * world.weapons.loadouts[0].options = 4;
 * updateWorldRank(world); // → 6 on Normal (base 2 + four Options)
 * ```
 */
export function updateWorldRank(world: World): number {
  const players = world.players;
  const loadouts = world.weapons.loadouts;
  let power = 0;
  const direct = world.config.powerUpMode === 'direct';
  for (let i = 0; i < players.length; i++) {
    const ship = players[i];
    if (!ship.active) continue;
    const loadout = loadouts[i];
    if (direct) {
      // Direct mode (M2-05): half the shot and sub levels, plus the Arm's tier.
      const shielded = shieldActive(ship.shield) && ship.shield.kind === ShieldKind.Arm;
      const d = directPowerRank(loadout.shot, loadout.sub, shielded ? ship.shield.tier : 0);
      if (d > power) power = d;
      continue;
    }
    const main = loadout.main;
    const shielded = shieldActive(ship.shield);
    const reduced = shielded && ship.shield.kind === ShieldKind.Reduce;
    const p = powerRank(
      loadout.missile ? 1 : 0,
      main === MainWeapon.Double ? 1 : 0,
      main === MainWeapon.Laser ? 1 : 0,
      loadout.options,
      shielded && !reduced ? 1 : 0,
      reduced ? 1 : 0,
    );
    if (p > power) power = p;
  }
  const inputs = world.rankInputs;
  inputs.power = power;
  const rank = computeRank(inputs);
  if (rank !== world.rank) {
    world.rank = rank;
    world.bullets.setRank(rank);
  }
  return rank;
}

/**
 * The presses that bring a player into a co-op game (plan M2-06, shmup_feat.md §16 "drop-in"):
 * `Confirm` (an unassigned controller's first OK — the input adapter forwards it on the free
 * player slot) or `Pause` (the controller's START, the HUD's `PRESS START`). The World reads them in
 * phase 1 on every slot that may join ({@link playerCanJoin}); the scene flow's game scene does not
 * pause on such a press.
 */
export const JOIN_ACTIONS = Action.Confirm | Action.Pause;

/** Every player slot, as a {@link continueWorld} mask. */
const ALL_PLAYERS = (1 << MAX_PLAYERS) - 1;

/**
 * How many continues a player has left (shmup_feat.md §10 continues, per player since M2-06):
 * `config.continues` minus the continues its score counts (`core/scoring`
 * `PlayerScore.continues`), never below 0.
 *
 * @param world - The world.
 * @param slot - The player slot.
 * @returns Continues left (0 for a bad slot).
 *
 * @example
 * ```ts
 * continuesLeft(world, 1); // → 3 on Normal before player 2 ever continued
 * ```
 */
export function continuesLeft(world: World, slot: number): number {
  const scores = world.scoring.board.scores;
  if (!(slot >= 0 && slot < scores.length && slot % 1 === 0)) return 0;
  const left = world.config.continues - scores[slot].continues;
  return left > 0 ? left : 0;
}

/**
 * Whether a player may drop into the running game now (plan M2-06): the game is a co-op one
 * (`config.coop`), it is being played (`playing` or `bossWarning`) and the slot is either
 * **inactive** (it never joined — a fresh ship) or **out** (`core/player` `playerOut`) with
 * continues left ({@link continuesLeft} — it comes back with a continue while the other player
 * plays on). Never allocates.
 *
 * @param world - The world.
 * @param slot - The player slot.
 * @returns `true` when a {@link JOIN_ACTIONS} press of that player would {@link joinPlayer}.
 *
 * @example
 * ```ts
 * playerCanJoin(world, 1); // → true in a co-op game until player 2 presses START
 * ```
 */
export function playerCanJoin(world: World, slot: number): boolean {
  if (!world.config.coop) return false;
  const status = world.status;
  if (status !== 'playing' && status !== 'bossWarning') return false;
  const players = world.players;
  if (!(slot >= 0 && slot < players.length && slot % 1 === 0)) return false;
  const ship = players[slot];
  if (!ship.active) return true;
  return playerOut(ship) && continuesLeft(world, slot) > 0;
}

/**
 * Brings a player into the running co-op game (plan M2-06 — drop-in join and per-player
 * continues, shmup_feat.md §16): a cold path, deterministic, called by phase 1 on a
 * {@link JOIN_ACTIONS} press (tests and tools may call it directly).
 *
 * @remarks
 * Does nothing unless {@link playerCanJoin}. An **inactive** slot becomes active with
 * `config.startingLives` and the loadout it was given at creation (the config's starting loadout);
 * its score starts at 0. A player who is **out** continues instead: lives back to
 * `config.startingLives`, power gone and the starting loadout again (as {@link continueWorld}
 * does), the continue written into its score's last digit (`core/scoring` `markContinue`) and
 * counted in {@link World.continuesUsed} — the stage does **not** restart (the other player is
 * still playing). Either way the ship flies in blinking from the left edge of the view
 * (`core/player` `respawnPlayer`, invulnerable like after a death) and `SFX PlayerJoin` is pushed
 * where it enters.
 *
 * @param world - The world.
 * @param slot - The player slot.
 * @returns `true` when the player joined or continued.
 *
 * @example
 * ```ts
 * const world = createWorld(resolveGameConfig({ coop: true, stage: 'zone-a' }), db);
 * joinPlayer(world, 1); // → true: player 2 flies in
 * ```
 */
export function joinPlayer(world: World, slot: number): boolean {
  if (!playerCanJoin(world, slot)) return false;
  const config = world.config;
  const ship = world.players[slot];
  if (!ship.active) {
    ship.active = true;
    ship.lives = config.startingLives;
  } else {
    world.continuesUsed++;
    ship.lives = config.startingLives;
    resetPower(world, slot);
    markContinue(world.scoring.board, slot);
  }
  respawnPlayer(ship, world.ship, world.camera);
  world.events.push(
    SimEventKind.Sfx,
    SFX_CUES.PlayerJoin,
    Math.floor(ship.x) | 0,
    Math.floor(ship.y) | 0,
    SfxPriority.High,
  );
  return true;
}

/**
 * Whether the game can go on with a continue (shmup_feat.md §10): the status is `gameOver` and at
 * least one active player has continues left ({@link continuesLeft} — per player since M2-06; in a
 * one-player game that is `config.continues` more than the continues used).
 *
 * @param world - The world.
 * @returns `true` when {@link continueWorld} would continue.
 *
 * @example
 * ```ts
 * if (world.status === 'gameOver' && canContinue(world)) flow.stack.push(flow.continueScreen);
 * ```
 */
export function canContinue(world: World): boolean {
  if (world.status !== 'gameOver') return false;
  const players = world.players;
  for (let i = 0; i < players.length; i++) {
    if (players[i].active && continuesLeft(world, i) > 0) return true;
  }
  return false;
}

/**
 * Continues a game that is over (shmup_feat.md §10 "continue at checkpoint; continue count shown
 * in the score's last digit"): see the module docs. Deterministic — the same continue at the same
 * tick reproduces the same state — and a cold path (it restarts the stage).
 *
 * @remarks
 * Every active player in `who` that has continues left ({@link continuesLeft}): lives back to
 * `config.startingLives`, power gone (`applyDeathPenalty` `arcade`: no shield, basic shot, no
 * Missile / Options, speed 0, meter cursor reset — in Direct mode `applyDirectDeathPenalty`), then
 * the config's starting loadout (`applyLoadoutPreset`, or `applyDirectLoadout` in Direct mode),
 * and its score marks the continue (`markContinue`). The stage restarts at its last checkpoint
 * (`StageRunner.restartAt`, which empties every pool and system — the boss and its WARNING too)
 * and its stage theme is queued again (`SimEventKind.Music`; the continue countdown faded the music
 * out), or the session is cleared in free flight; the continued ships fly in at the view, the
 * hit-stop ends and the status becomes `playing`. {@link World.continuesUsed} counts it once. A
 * co-op player who did not continue stays out — with continues left it may drop back in later
 * ({@link joinPlayer}).
 *
 * @param world - The world.
 * @param who - Bit mask of the player slots that continue (bit 0 = player 1; default: every
 *   player — M2-06, the co-op continue countdown passes the players who pressed OK).
 * @returns `true` when it continued; `false` when {@link canContinue} is `false` or no player of
 *   `who` has continues left (nothing changes).
 *
 * @example
 * ```ts
 * if (canContinue(world)) continueWorld(world); // world.status → 'playing'
 * continueWorld(world, 1 << 1); // only player 2 continues (co-op)
 * ```
 */
export function continueWorld(world: World, who: number = ALL_PLAYERS): boolean {
  if (world.status !== 'gameOver') return false;
  const players = world.players;
  let chosen = 0;
  for (let i = 0; i < players.length; i++) {
    if ((who & (1 << i)) !== 0 && players[i].active && continuesLeft(world, i) > 0) {
      chosen |= 1 << i;
    }
  }
  if (chosen === 0) return false;
  world.continuesUsed++;
  const config = world.config;
  const board = world.scoring.board;
  for (let i = 0; i < players.length; i++) {
    if ((chosen & (1 << i)) === 0) continue;
    players[i].lives = config.startingLives;
    resetPower(world, i);
    markContinue(board, i);
  }
  const stage = world.stage;
  if (stage !== null) {
    stage.restartAt(stage.checkpoint);
    // The stage theme again (the continue countdown faded the music out).
    const theme = stage.stage.music.stageId;
    if (theme >= 0) world.events.push(SimEventKind.Music, theme, 0, 0, 0);
  } else {
    clearSession(world);
  }
  const camera = world.camera;
  for (let i = 0; i < players.length; i++) {
    if ((chosen & (1 << i)) !== 0) respawnPlayer(players[i], world.ship, camera);
  }
  world.hitStop = 0;
  world.status = 'playing';
  updateWorldRank(world);
  syncWorldView(world);
  return true;
}

/**
 * Takes all of a player's power (the `arcade` penalty — in Direct mode `applyDirectDeathPenalty`
 * — whatever the config's), then gives the config's starting loadout: what a continue does to a
 * ship (cold path).
 *
 * @param world - The world.
 * @param slot - The player slot.
 */
function resetPower(world: World, slot: number): void {
  const ship = world.players[slot];
  const loadout = world.weapons.loadouts[slot];
  if (world.config.powerUpMode === 'direct') applyDirectDeathPenalty('arcade', ship, loadout);
  else applyDeathPenalty('arcade', ship, loadout, world.powerups.meters[slot]);
  applyStartingLoadout(world, slot);
}

/** Hit-stop of a player's death, in ticks (plan M1-12). */
export const DEATH_HIT_STOP_TICKS = 8;

/** Length of the medium screen shake of a player's death, in ticks. */
export const DEATH_SHAKE_TICKS = 20;

/** How long the music stays ducked after a player's death (`SimEventKind.MusicDuck` param). */
export const DEATH_MUSIC_DUCK_TICKS = 120;

/**
 * The death sequence of one ship (rare, cold path — see the module docs): `killPlayer`, the
 * explosion / debris / rumble / music-duck events, hit-stop, shake, bullet cancel, death penalty.
 *
 * @param world - The world.
 * @param slot - The ship's player slot.
 */
function killShip(world: World, slot: number): void {
  const ship = world.players[slot];
  killPlayer(ship);
  const events = world.events;
  const x = Math.floor(ship.x) | 0;
  const y = Math.floor(ship.y) | 0;
  events.push(SimEventKind.Sfx, SFX_CUES.PlayerDeath, x, y, 0);
  events.push(SimEventKind.Particles, FX_CUES.ExplosionLarge, x, y, 1);
  events.push(SimEventKind.Particles, FX_CUES.Debris, x, y, 1);
  events.push(SimEventKind.Rumble, slot, x, y, 1);
  events.push(SimEventKind.MusicDuck, slot, 0, 0, DEATH_MUSIC_DUCK_TICKS);
  requestHitStop(world, DEATH_HIT_STOP_TICKS);
  requestShake(world, ShakeMagnitude.Medium, DEATH_SHAKE_TICKS);
  world.bullets.cancelAll(CancelMode.Sparkle);
  if (world.config.powerUpMode === 'direct') {
    applyDirectDeathPenalty(world.config.deathPenalty, ship, world.weapons.loadouts[slot]);
  } else {
    const loadout = world.weapons.loadouts[slot];
    const options = loadout.options;
    applyDeathPenalty(world.config.deathPenalty, ship, loadout, world.powerups.meters[slot]);
    // Option recovery (M3-01): the Options the penalty took drift away from the wreck as grey
    // items (the M2-04 freed Options — next tick's phase 3 turns the drops into items).
    if (world.config.optionRecovery) {
      for (let k = loadout.options; k < options; k++) {
        world.enemies.dropAt(DropKind.FreeOption, x, y);
      }
    }
  }
}

/**
 * The pause menu's FULL POWER secret (M3-01 — shmup_feat.md §4 "[P2] secrets: pause + code = full
 * power-up"): an alive meter ship gets the `'full'` loadout (speed 2, Missile, Laser, four Options,
 * the `?` choice's shield); a Direct-mode ship both levels at the top and the gold Arm. Called by
 * the scene flow between ticks (a replay records it as a flow action — `core/replay`); cold path.
 *
 * @param world - The world.
 * @param slot - The player slot.
 * @returns `true` when the ship was alive and powered up.
 *
 * @example
 * ```ts
 * grantFullPower(world, 0); // → true: player 1 fully powered
 * ```
 */
export function grantFullPower(world: World, slot: number): boolean {
  const players = world.players;
  if (!(slot >= 0 && slot < players.length && slot % 1 === 0)) return false;
  const ship = players[slot];
  if (!ship.active || ship.state !== 'alive') return false;
  const config = world.config;
  const loadout = world.weapons.loadouts[slot];
  if (config.powerUpMode === 'direct') {
    const speed = ship.speedLevel;
    applyDirectLoadout(loadout, ship, 'full', world.ship.startSpeedLevel);
    ship.speedLevel = speed;
  } else {
    applyLoadoutPreset(loadout, ship, 'full', shieldSpecOf(config.shieldChoice));
  }
  world.events.push(SimEventKind.Sfx, SFX_CUES.PowerUpEquip, 0, 0, SfxPriority.High);
  updateWorldRank(world);
  syncWorldView(world);
  return true;
}

/**
 * The pause menu's self-destruct joke (M3-01 — shmup_feat.md §4 "[P2] … self-destruct joke"): an
 * alive ship is hit as if by a bullet the moment play resumes (its shield does not help; god mode
 * and the invincibility assist still do). Called by the scene flow between ticks (recorded as a
 * flow action like {@link grantFullPower}); cold path.
 *
 * @param world - The world.
 * @param slot - The player slot.
 * @returns `true` when the hit was recorded (the death sequence runs in the next tick's phase 7).
 */
export function selfDestruct(world: World, slot: number): boolean {
  const players = world.players;
  if (!(slot >= 0 && slot < players.length && slot % 1 === 0)) return false;
  const ship = players[slot];
  if (!ship.active || ship.state !== 'alive' || ship.invulnTicks > 0) return false;
  if (world.debugFlags.godMode || ship.invincible) return false;
  // Recorded for the next tick: its damage phase kills a ship hit "during" that tick.
  ship.hitCause = PlayerHitCause.Bullet;
  ship.hitTick = world.tick;
  ship.hits++;
  return true;
}

/**
 * Applies the config's starting loadout to one player (creation, a continue): `applyLoadoutPreset`
 * with the `?` choice's shield for the meter, `applyDirectLoadout` with the ship's
 * `startSpeedLevel` in Direct mode (M2-05). Cold path.
 *
 * @param world - The world (its weapons exist).
 * @param slot - The player slot.
 */
function applyStartingLoadout(world: WorldUnderConstruction | World, slot: number): void {
  const config = world.config;
  const loadout = world.weapons.loadouts[slot];
  const ship = world.players[slot];
  if (config.powerUpMode === 'direct') {
    applyDirectLoadout(loadout, ship, config.loadout, world.ship.startSpeedLevel);
  } else {
    applyLoadoutPreset(loadout, ship, config.loadout, shieldSpecOf(config.shieldChoice));
  }
}

/**
 * Phase 8: applies every pool's deferred frees.
 *
 * @param world - The world.
 */
const removalSystem: WorldSystem = (world) => {
  world.pools.flushAll();
  world.enemies.flush();
};

/**
 * Phase 9: counts the hit-stop down (on frozen ticks) and the shake / flash timers (`core/fx`
 * `tickFx`), then refreshes the view mirrors.
 *
 * @param world - The world.
 */
const fxSystem: WorldSystem = (world) => {
  tickFx(world);
  if (world.timeLeft >= 0) updateClock(world);
  syncWorldView(world);
};

/** Points per second left on the caravan's clock when its stage is cleared (M3-01). */
export const CARAVAN_TIME_BONUS = 1000;

/**
 * Part of phase 9 in a World with a time limit (M3-01 — the caravan, shmup_feat.md §16 "score
 * attack / caravan (time-limited)"): while the stage is played the clock counts down (hit-stop
 * ticks too — it is the player's time); at 0 the World ends — status `stageClear`,
 * {@link World.timeUp}, the enemy bullets cancelled, the stage-clear jingle queued (the ships then
 * fly out like after a boss). A stage cleared another way with time left pays
 * {@link CARAVAN_TIME_BONUS} per whole second left to every player in play, once. Never allocates.
 *
 * @param world - The world (its `timeLeft` ≥ 0).
 */
function updateClock(world: World): void {
  const status = world.status;
  if (status === 'playing' || status === 'bossWarning') {
    if (world.timeLeft > 0) world.timeLeft--;
    if (world.timeLeft > 0) return;
    world.timeUp = true;
    world.status = 'stageClear';
    world.bullets.cancelAll(CancelMode.Sparkle);
    world.events.push(SimEventKind.Music, MUSIC_CUES.StageClear, 0, 0, 0);
    return;
  }
  if (status !== 'stageClear' || world.timeUp || world.clockPaid) return;
  world.clockPaid = true;
  const seconds = Math.floor(world.timeLeft / 60);
  if (seconds <= 0) return;
  const players = world.players;
  for (let p = 0; p < players.length; p++) {
    if (players[p].active && !playerOut(players[p]))
      addScore(world, p, seconds * CARAVAN_TIME_BONUS);
  }
  world.scoring.checkExtends();
}

/**
 * The tick pipeline in its fixed order (plan §3.2). {@link stepWorld} runs it front to back;
 * later steps fill the empty slots — never reorder it.
 */
export const WORLD_PHASES: readonly WorldPhaseEntry[] = Object.freeze([
  { phase: WorldPhase.Input, name: 'input', runsDuringHitStop: true, run: inputSystem },
  { phase: WorldPhase.Players, name: 'players', runsDuringHitStop: false, run: playersSystem },
  { phase: WorldPhase.Stage, name: 'stage', runsDuringHitStop: false, run: stageSystem },
  { phase: WorldPhase.Scripts, name: 'scripts', runsDuringHitStop: false, run: scriptsSystem },
  { phase: WorldPhase.Movement, name: 'movement', runsDuringHitStop: false, run: movementSystem },
  {
    phase: WorldPhase.Collision,
    name: 'collision',
    runsDuringHitStop: false,
    run: collisionSystem,
  },
  { phase: WorldPhase.Damage, name: 'damage', runsDuringHitStop: false, run: damageSystem },
  { phase: WorldPhase.Removal, name: 'removal', runsDuringHitStop: false, run: removalSystem },
  { phase: WorldPhase.Fx, name: 'fx', runsDuringHitStop: true, run: fxSystem },
]);

/**
 * Creates an empty pool registry.
 *
 * @returns The registry.
 */
function createPoolRegistry(): PoolRegistry {
  const entries: RegisteredPool[] = [];
  return {
    entries,
    register(name, pool) {
      for (const entry of entries) {
        if (entry.name === name) throw new Error(`pool "${name}" is already registered`);
      }
      const fields = pool.fields as Readonly<Record<string, SoaArray>>;
      const arrays: SoaArray[] = [];
      for (const key of Object.keys(fields).sort()) arrays.push(fields[key]);
      entries.push({ name, pool, arrays });
      return pool;
    },
    flushAll() {
      for (let i = 0; i < entries.length; i++) entries[i].pool.flush();
    },
    clearAll() {
      for (let i = 0; i < entries.length; i++) entries[i].pool.clear();
    },
  };
}

/**
 * Looks up the stage a config asks for.
 *
 * @param config - The session config.
 * @param content - Validated content.
 * @returns The stage spec, or `null` when `config.stage` is `null` (free flight).
 * @throws {RangeError} When `config.stage` names a stage the content does not have.
 *
 * @example
 * ```ts
 * resolveWorldStage(resolveGameConfig({ stage: 'test-range' }), db)?.name; // → 'TEST RANGE'
 * ```
 */
export function resolveWorldStage(config: GameConfig, content: ContentDb): StageSpec | null {
  const id = config.stage;
  if (id === null) return null;
  const index = content.stageIndex.get(id);
  if (index === undefined) {
    throw new RangeError(`GameConfig.stage: no stage "${id}" in the content`);
  }
  return content.stages[index];
}

/** A {@link World} while {@link createWorld} assembles it (the stage fields are set last). */
type WorldUnderConstruction = Omit<
  World,
  | 'stage'
  | 'enemies'
  | 'bullets'
  | 'patterns'
  | 'weapons'
  | 'powerups'
  | 'scoring'
  | 'bosses'
  | 'laserSources'
  | 'gimmicks'
  | 'bonus'
> & {
  /** See {@link World.stage}. */
  stage: StageRunner | null;
  /** See {@link World.enemies}. */
  enemies: EnemySystem;
  /** See {@link World.bullets}. */
  bullets: BulletSystem;
  /** See {@link World.patterns}. */
  patterns: PatternVm;
  /** See {@link World.weapons}. */
  weapons: WeaponSystem;
  /** See {@link World.powerups}. */
  powerups: PowerUpSystem;
  /** See {@link World.scoring}. */
  scoring: ScoringSystem;
  /** See {@link World.bosses}. */
  bosses: BossSystem;
  /** See {@link World.laserSources}. */
  laserSources: readonly LaserSource[];
  /** See {@link World.gimmicks}. */
  gimmicks: StageGimmicks;
  /** See {@link World.bonus}. */
  bonus: BonusEntrances;
};

/**
 * The sprites the engine draws on its own, whatever the content: the enemy bullet kinds, the
 * laser beam, the bending laser segment and the cancel point item (`core/bullets`
 * `BULLET_SPRITES`; the last two since M2-02), the Spread Bomb's blast (`core/weapons`
 * `WEAPON_SPRITES`, M2-03), the Option (`core/options` `OPTION_SPRITE`), the
 * items (`core/powerups` `ITEM_SPRITES`: the power capsule, the blue capsule and the grey stolen
 * Option — M2-04, also the Option Hunter's carried ones) and the shields (`core/shields`
 * `SHIELD_SPRITES`: the Force Field, the shield pod and Reduce's shimmer — M2-04), plus the
 * HUD pieces and the title logo the scene flow draws (`core/ui` `UI_SPRITES`, M1-16) and the
 * stage gimmicks' chain link (`core/stage` `GIMMICK_SPRITES`, M2-07). Hosts pass
 * it as `loadContent`'s `extraSprites` (the shell's loader does by default) so the World and the
 * scenes can resolve their sprite ids and
 * `pnpm content:check` verifies them against the atlas.
 */
export const ENGINE_SPRITES: readonly string[] = Object.freeze([
  ...BULLET_SPRITES,
  ...WEAPON_SPRITES,
  OPTION_SPRITE,
  ...ITEM_SPRITES,
  ...SHIELD_SPRITES,
  ...UI_SPRITES,
  ...GIMMICK_SPRITES,
]);

/**
 * Creates a gameplay session: RNG streams from `config.seed`, the ship `config.shipId` from
 * `content` (M2-05; the content's first ship when it has no such one), the stage
 * `config.stage` (camera at its start — or just before its boss with `config.stageSkip: 'boss'` —,
 * stage theme queued as a music event) or a static camera,
 * the enemy system (specs and the stage's spawn events compiled, 64 free slots), player 1
 * starting its fly-in at the left edge of the view, player 2 inactive. The weapons fire the
 * config's arsenal (`weaponPreset` / `weaponEdit`, M2-03) and the `?` / `!` slots follow its
 * `shieldChoice` / `megaChoice`; the starting loadout (`config.loadout`) is applied to every
 * player (a `'full'` one with the `?` choice's shield; in Direct mode — M2-05 — the levels, the
 * Arm and the ship's starting speed of `applyDirectLoadout`).
 *
 * @param config - The resolved session config (`resolveGameConfig`).
 * @param content - Validated content (`loadContent(...).db`; `EMPTY_CONTENT_DB` gives the
 *   built-in default ship, which is not drawn).
 * @param options - Extra options (a behaviour registry for tests; the event queue and debug flags
 *   to use instead of new ones — the weapon select's preview passes its own).
 * @returns The world at tick 0, view already filled (the first frame shows the ship).
 * @throws {RangeError} When `config.stage` names a stage the content does not have, or
 *   `config.weaponEdit` names a weapon the content does not have or one of another slot
 *   (`core/weapons` `resolveArsenal`).
 *
 * @example
 * ```ts
 * const world = createWorld(resolveGameConfig({ seed: 7 }), db);
 * const input = createInputSnapshot();
 * for (let i = 0; i < 60; i++) stepWorld(world, input);
 * world.players[0].state; // → 'alive' (the 40-tick fly-in is over)
 * ```
 */
export function createWorld(
  config: GameConfig,
  content: ContentDb,
  options: WorldOptions = {},
): World {
  const ship = resolvePlayerShip(content, config.shipId);
  // The loops' remix (M3-01): from loop 2 the stage's timeline has its remix merged in.
  const contentStage = resolveWorldStage(config, content);
  const stageSpec = contentStage === null ? null : stageForLoop(contentStage, config.loop);
  // A class instance, not a literal: see `createStageCamera` (keeps the fields unboxed doubles).
  const camera: WorldCamera = createStageCamera();
  const players: PlayerShip[] = [];
  const intents: PlayerIntent[] = [];
  for (let slot = 0; slot < MAX_PLAYERS; slot++) {
    players.push(createPlayer(slot, config.startingLives, config.invincible));
    intents.push(createPlayerIntent());
  }
  players[0].active = true;
  spawnPlayer(players[0], camera);

  const playerBatch = createSpriteBatch(LayerId.Player, MAX_PLAYERS);
  const hitboxBatch = createHitboxBatch(MAX_PLAYERS);
  const terrain = stageSpec === null ? null : createStageTerrain(stageSpec, content);
  const parallax = stageSpec === null ? null : createParallaxView(stageSpec);
  const batches: SpriteBatchView[] = [];
  // Mutable until the bullet system exists (its laser view is filled in below).
  const view = {
    camera,
    parallax,
    // Filled in below, once the destructible terrain (its change log) exists.
    terrain: null as TerrainView | null,
    batches,
    lasers: null as LaserView | null,
    bendingLasers: null as BendingLaserView | null,
    warning: null as WarningView | null,
    // Presentation only (M2-08): the stage's raster effects / palette cycles, the ships' hurtboxes.
    effects: stageSpec === null ? null : createStageEffectsView(stageSpec),
    hitboxes: hitboxBatch,
  };
  const world: WorldUnderConstruction = {
    config,
    content,
    ship,
    tick: 0,
    rng: createRngStreams(config.seed),
    events: options.events ?? createEventQueue(),
    players,
    intents,
    camera,
    status: 'playing',
    hitStop: 0,
    fx: createFxState(),
    debugFlags: options.debugFlags ?? createDebugFlags(),
    pools: createPoolRegistry(),
    grid: createSpatialGrid(PLAYFIELD_W + 2 * GRID_MARGIN, PLAYFIELD_H + 2 * GRID_MARGIN),
    playerBatch,
    hitboxBatch,
    stage: null,
    terrain,
    parallax,
    // Replaced right below: the enemy and bullet systems read the World they belong to.
    enemies: null as unknown as EnemySystem,
    bullets: null as unknown as BulletSystem,
    patterns: null as unknown as PatternVm,
    weapons: null as unknown as WeaponSystem,
    powerups: null as unknown as PowerUpSystem,
    scoring: null as unknown as ScoringSystem,
    bosses: null as unknown as BossSystem,
    gimmicks: null as unknown as StageGimmicks,
    bonus: null as unknown as BonusEntrances,
    laserSources: [],
    rank: 0,
    rankInputs: createRankInputs(config),
    continuesUsed: 0,
    endingFlags: 0,
    timeLeft: config.timeLimit > 0 ? config.timeLimit : -1,
    timeUp: false,
    clockPaid: false,
    view,
  };
  world.rank = computeRank(world.rankInputs);
  world.bullets = createBulletSystem(world);
  world.bullets.setRank(world.rank);
  world.patterns = createPatternVm(world);
  world.bullets.setProgramRunner(world.patterns);
  world.enemies = createEnemySystem(world, options.behaviors ?? DEFAULT_BEHAVIORS, stageSpec);
  world.bosses = createBossSystem(
    world,
    options.bossBehaviors ?? DEFAULT_BOSS_BEHAVIORS,
    stageSpec,
  );
  // Every boss slot's parts (M2-09: four slots of 16), after the enemy slots.
  world.laserSources = Object.freeze([...world.enemies.enemies, ...world.bosses.parts]);
  world.gimmicks = createStageGimmicks(world, world.enemies.enemies, stageSpec, terrain, content);
  world.bonus = createBonusEntrances(world, world.enemies.stats, stageSpec);
  if (stageSpec !== null && terrain !== null) {
    view.terrain = createTerrainView(terrain, stageSpec, content, world.gimmicks.destructible);
  }
  world.weapons = createWeaponSystem(world);
  world.powerups = createPowerUpSystem(world, stageSpec);
  world.scoring = createScoringSystem(world);
  for (let slot = 0; slot < MAX_PLAYERS; slot++) applyStartingLoadout(world, slot);
  // The starting loadout counts towards the rank from the first tick.
  updateWorldRank(world);
  // Same-layer batches draw in list order: the Options below the ships, the shields over them.
  batches.push(
    world.enemies.groundBatch,
    world.enemies.airBatch,
    world.weapons.batch,
    world.weapons.optionBatch,
    playerBatch,
    world.bullets.batch,
    world.powerups.shieldBatch,
    world.powerups.itemBatch,
    world.bullets.pointBatch,
    // A double boss's resting half is drawn behind (ground-enemy layer; M2-09).
    world.bosses.backBatch,
    world.bosses.batch,
    world.enemies.carriedBatch,
    // The stage gimmicks (M2-07): the chains' links (over the ground enemies), then — on a stage
    // with `block` events — the moving blocks (over the terrain grid, which is bound first).
    world.gimmicks.chainBatch,
  );
  const blocks = world.gimmicks.blocks;
  if (blocks !== null) batches.push(blocks.batch);
  view.lasers = world.bullets.laserView;
  view.bendingLasers = world.bullets.bending;
  view.warning = world.bosses.warning;
  if (stageSpec !== null) {
    world.stage = createStageRunner(stageSpec, createWorldStageHooks(world), camera, config.loop);
    if (stageSpec.music.stageId >= 0) {
      world.events.push(SimEventKind.Music, stageSpec.music.stageId, 0, 0, 0);
    }
    // The debug stage skip (M1-18): start a little before the boss.
    if (config.stageSkip === 'boss') skipToBoss(world);
  }
  syncWorldView(world);
  return world;
}

/**
 * The World's side of the stage runner: timeline events it acts on now, and checkpoint clears.
 *
 * @param world - The world being built.
 * @returns The hooks.
 */
function createWorldStageHooks(world: WorldUnderConstruction): StageHooks {
  return {
    /**
     * `spawn` / `formation` → the enemy system, `music` → a `SimEventKind.Music` presentation
     * event, `end` → status `stageClear`, `warning` → `BossSystem.startWarning`, `boss` →
     * `BossSystem.startBoss` (M1-13); `speed` and `flag` are the runner's own. Never allocates
     * (the event queue stores numbers).
     *
     * @param code - The event's code.
     * @param event - The event (content data).
     * @param index - The event's index in the stage's timeline (the enemy system's key).
     */
    event(code, event, index) {
      if (code === StageEventCode.Spawn || code === StageEventCode.Formation) {
        world.enemies.onStageEvent(index);
      } else if (code === StageEventCode.Block) {
        world.gimmicks.blocks?.spawn(index);
      } else if (code === StageEventCode.Music) {
        world.events.push(SimEventKind.Music, (event as StageMusicEvent).cueId, 0, 0, 0);
      } else if (code === StageEventCode.End) {
        world.status = 'stageClear';
      } else if (code === StageEventCode.Warning) {
        world.bosses.startWarning((event as StageBossEvent).enemyId);
      } else if (code === StageEventCode.Boss) {
        world.bosses.startBoss((event as StageBossEvent).enemyId);
      } else if (code === StageEventCode.Bonus) {
        world.bonus.arm(index);
      }
    },
    /**
     * A checkpoint restart: empties every pool and the enemy, boss, weapon, power-up and score
     * systems.
     */
    clear() {
      clearSession(world);
    },
  };
}

/**
 * Advances the world by exactly one tick: runs {@link WORLD_PHASES} in order (skipping phases
 * 2–8 while hit-stop is active), then increments {@link World.tick}. Never allocates.
 *
 * @remarks
 * Whether the tick is frozen is decided once, before phase 1 (`hitStop > 0`), and recorded in
 * `world.fx.frozen`: phase 9 (`core/fx` `tickFx`) counts the hit-stop down only on such ticks, so
 * a hit-stop of `n` requested during tick `t` (the player's death in phase 7) freezes exactly
 * ticks `t + 1 … t + n`.
 *
 * @param world - The world.
 * @param input - This tick's input (read-only; typically `platform.input.poll()`).
 *
 * @example
 * ```ts
 * const input = platform.input.poll();
 * stepWorld(world, input);
 * renderer.render(frame); // frame.world === world.view
 * ```
 */
export function stepWorld(world: World, input: Readonly<InputSnapshot>): void {
  const frozen = world.hitStop > 0;
  world.fx.frozen = frozen;
  for (let i = 0; i < WORLD_PHASES.length; i++) {
    const entry = WORLD_PHASES[i];
    if (frozen && !entry.runsDuringHitStop) continue;
    entry.run(world, input);
  }
  world.tick++;
}

/**
 * Refills {@link World.hitboxBatch}: one marker per live ship (active, not `dying` / `dead`),
 * at its centre, radius = the ship's hurt radius × its shield's hurt scale (Reduce shrinks it —
 * M2-04). Never allocates.
 *
 * @param world - The world.
 */
function syncHitboxes(world: World): void {
  const hitboxes = world.hitboxBatch;
  const players = world.players;
  const hurt = world.ship.hurtRadius;
  let n = 0;
  for (let i = 0; i < players.length && n < hitboxes.capacity; i++) {
    const p = players[i];
    if (!p.active || p.state === 'dying' || p.state === 'dead') continue;
    hitboxes.x[n] = p.x;
    hitboxes.y[n] = p.y;
    hitboxes.radius[n] = hurt * p.shield.hurtScale;
    n++;
  }
  hitboxes.count = n;
}

/**
 * Refreshes the mirror batches of {@link World.view} (the enemies, the player shots and Options,
 * the items and shields, the player ships) and scrolls the parallax bands with the camera. Runs
 * at the end of every tick (phase 9) and once at creation. Never allocates.
 *
 * @remarks
 * A ship is drawn when its slot is active, it is not `dying` / `dead` and its spec has a sprite;
 * during invulnerability it blinks (`SpriteFlag.Hidden` every other 4 ticks). Player 2 is drawn
 * with the ship's palette-swap sprite (`PlayerShipSpec.spriteP2Id`, M2-06) when the content has
 * it. Since M2-08 it also refills {@link World.hitboxBatch} (every active ship not `dying` /
 * `dead` — also a ship blinking or without a sprite — at its hurt radius × its shield's
 * `hurtScale`).
 *
 * @param world - The world.
 */
export function syncWorldView(world: World): void {
  const parallax = world.parallax;
  if (parallax !== null) updateParallaxView(parallax, world.camera.x, world.camera.y);
  world.gimmicks.sync();
  world.enemies.sync();
  world.bosses.sync();
  world.weapons.sync();
  world.powerups.sync();
  const batch = world.playerBatch;
  batch.count = 0;
  const spec = world.ship;
  syncHitboxes(world);
  if (spec.spriteId < 0) return;
  // Player 2 flies the palette swap (M2-06), when the content has it.
  const p2Sprite = spec.spriteP2Id >= 0 ? spec.spriteP2Id : spec.spriteId;
  const players = world.players;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p.active || p.state === 'dying' || p.state === 'dead') continue;
    const flags = p.invulnTicks > 0 && (p.invulnTicks & 4) !== 0 ? SpriteFlag.Hidden : 0;
    const sprite = i === 1 ? p2Sprite : spec.spriteId;
    pushSprite(batch, p.x, p.y, sprite, playerBankFrame(p.bank, spec.bankFrames), flags);
  }
}
