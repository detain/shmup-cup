/**
 * # config — game configuration and option presets
 *
 * **Responsibility.** The typed {@link GameConfig} that parameterises a run: internal
 * resolution, tick rate, seed and every *sim-affecting* option (difficulty, power-up
 * model, death penalty, lives, autofire and its intervals, remote mode, the stage, the starting
 * loadout, Auto Power-Up and its order, the pickup magnet, the weapon preset / Weapon Edit and the
 * `!` / `?` slot choices of the weapon select — M2-03 —, the Option type, M2-04 — and the ship
 * with its power-up model, M2-05 — and two-player co-op with its drop scaling, M2-06). Everything
 * here is copied into replay headers, so it must stay plain serialisable data.
 *
 * **Implements.**
 * - shmup_feat.md §2 (design forks: Meter vs Direct, death-penalty presets, difficulty)
 * - shmup_feat.md §3 (384×216 internal resolution, 60 Hz fixed step, max ticks/frame)
 * - shmup_feat.md §15 (lives 1–5; the difficulty presets Easy / Normal / Hard / Arcade — rank base
 *   and growth, lives, extend thresholds, continues, death-penalty preset — M2-01), §21 Options
 *   menu (sim-affecting subset)
 * - shmup_feat.md §6 (Meter mode by default — decision D1; Auto Power-Up — D2; the pickup
 *   magnet — D33)
 * - shmup_feat.md §7A (the preset loadouts Types A–D, Weapon Edit, the `!` slot choices) and §16
 *   (the weapon select that sets them) — M2-03
 * - shmup_feat.md §8 (the Option types) and §9 (the meter-mode `?` shields) — M2-04
 * - shmup_feat.md §5 (ship selection: the meter ship KESTREL, the direct ship MANTA) and §6B
 *   (Direct mode — `powerUpMode: 'direct'`) — M2-05
 * - shmup_feat.md §16 (2-player simultaneous co-op — {@link GameConfig.coop}, the item count
 *   scaled for two ships — {@link GameConfig.coopExtra}; M2-06)
 * - shmup_feat.md §21 Options menu — audio master / music / SFX sliders, the controls profile
 *   (the presentation-only {@link UserOptions})
 *
 * **Public API (implemented now).** {@link GameConfig}, {@link DEFAULT_GAME_CONFIG},
 * {@link resolveGameConfig}, the difficulty presets ({@link DIFFICULTY_PRESETS},
 * {@link DifficultyRules}, {@link DifficultyExtends}, {@link DifficultyTable},
 * {@link DEFAULT_DIFFICULTY_TABLE}, {@link difficultyOverrides}, {@link withDifficulty},
 * {@link MAX_RANK_GROWTH}, {@link MAX_CONTINUES}, {@link MAX_EXTEND_SCORE},
 * {@link MIN_BULLET_SPEED_MUL}, {@link MAX_BULLET_SPEED_MUL}, {@link DEATH_PENALTY_PRESETS}), the
 * preset types ({@link StartingLoadout}, {@link StageSkip} …), the
 * power-meter slot names ({@link MeterSlotName}, {@link METER_SLOT_NAMES},
 * {@link DEFAULT_AUTO_POWER_UP_ORDER}, {@link MAX_AUTO_POWER_UP_ORDER}), the meter arsenal of
 * M2-03 ({@link MegaChoice}, {@link MEGA_CHOICES}, {@link ShieldChoice}, {@link SHIELD_CHOICES},
 * {@link WeaponEdit}, {@link WEAPON_EDIT_SLOTS}, {@link ArsenalChoice}, {@link withArsenal},
 * {@link arsenalMatches}; M2-04: {@link OptionChoice}, {@link OPTION_CHOICES}; M2-05: the ship
 * choice {@link ShipChoice}, {@link withShip}, {@link shipMatches}, {@link POWER_UP_MODES},
 * {@link DEFAULT_SHIP_ID}; M2-06: the co-op choice {@link withCoop}, {@link DEFAULT_COOP_EXTRA},
 * {@link MAX_COOP_EXTRA}) and the screen
 * layout constants {@link HUD_BAR_HEIGHT}, {@link PLAYFIELD_Y}, {@link PLAYFIELD_W},
 * {@link PLAYFIELD_H} (decision D20: two 8-px HUD bars outside a 384×200 playfield). User options:
 * {@link UserOptions}, {@link AudioOptions}, {@link InputOptions}, {@link DisplayOptions},
 * {@link DEFAULT_USER_OPTIONS}, {@link VOLUME_LEVELS}, {@link volumeGain},
 * {@link resolveUserOptions}, {@link InputProfileChoice}, {@link INPUT_PROFILE_ID_PATTERN},
 * {@link BULLET_PALETTES}, {@link BulletPalette}, {@link SCALE_MODES}, {@link ScaleMode} (M2-08).
 *
 * **User options (M1-17).** {@link UserOptions} — the *presentation-only* options the player sets
 * in the Options screen and `core/save` persists (plan §1.5: sim-affecting options live in
 * {@link GameConfig}, the rest here): the audio volumes MASTER / MUSIC / SFX as levels
 * `0…`{@link VOLUME_LEVELS} ({@link volumeGain} turns a level into the linear bus gain), the chosen
 * keyboard / remote input profile ({@link InputOptions.profileId}, `null` = the platform's default)
 * and the display options (M2-02: the enemy bullet colour set, {@link DisplayOptions.bulletPalette}
 * — {@link BULLET_PALETTES}; M2-08: the scale mode {@link DisplayOptions.scaleMode} —
 * {@link SCALE_MODES} —, the screen-shake switch, reduced flashing and the hitbox marker).
 * {@link DEFAULT_USER_OPTIONS},
 * {@link resolveUserOptions} (defensive: anything malformed falls back field by field),
 * {@link InputProfileChoice} (one entry of the Options screen's profile selector).
 *
 * **Difficulty presets (M2-01).** Easy / Normal / Hard / Arcade ({@link DIFFICULTY_PRESETS},
 * shmup_feat.md §15) each map to a row of a {@link DifficultyTable} ({@link DifficultyRules}: rank
 * base and growth, lives, extend thresholds, continues, death penalty, aimed-shot directions and a
 * bullet speed multiplier). The shipped table is content (`content/rules/difficulty.rules.json`,
 * kind `rules`, validated by `core/data`); {@link DEFAULT_DIFFICULTY_TABLE} is the built-in copy
 * used without content. {@link resolveGameConfig} fills the preset fields of
 * `overrides.difficulty` from the table under the explicit overrides, so a config always carries
 * the resolved values and a replay header records every one of them;
 * {@link difficultyOverrides} gives one row as config fields and {@link withDifficulty} switches a
 * resolved config to another preset (the difficulty menu under START, `core/scenes`).
 *
 * **Planned API.** The remaining option groups of the Options screen (controls, game — M2-16).
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'config',
  status: 'partial',
  specRefs: [
    'shmup_feat.md §2',
    'shmup_feat.md §3',
    'shmup_feat.md §15',
    'shmup_feat.md §21',
    'shmup_feat.md §6',
    'shmup_feat.md §7',
    'shmup_feat.md §16',
    'shmup_feat.md §8',
    'shmup_feat.md §9',
    'shmup_feat.md §5',
  ],
});

/** Power-up model: Gradius-style meter or Darius-style direct items (shmup_feat.md §6). */
export type PowerUpMode = 'meter' | 'direct';

/** Every {@link PowerUpMode}: the meter (KESTREL, decision D1) first. */
export const POWER_UP_MODES: readonly PowerUpMode[] = Object.freeze([
  'meter',
  'direct',
] as PowerUpMode[]);

/** The ship a session flies unless the config names another: the meter ship (decision D36). */
export const DEFAULT_SHIP_ID = 'kestrel';

/** What a death costs (shmup_feat.md §10). */
export type DeathPenaltyPreset = 'arcade' | 'classic' | 'casual';

/** Every {@link DeathPenaltyPreset}, in menu order. */
export const DEATH_PENALTY_PRESETS: readonly DeathPenaltyPreset[] = Object.freeze([
  'arcade',
  'classic',
  'casual',
] as DeathPenaltyPreset[]);

/** Difficulty presets (shmup_feat.md §15). */
export type DifficultyPreset = 'easy' | 'normal' | 'hard' | 'arcade';

/** Every {@link DifficultyPreset}, easiest first (the difficulty menu's order; hi-score tables). */
export const DIFFICULTY_PRESETS: readonly DifficultyPreset[] = Object.freeze([
  'easy',
  'normal',
  'hard',
  'arcade',
] as DifficultyPreset[]);

/** Score thresholds of the extra lives of a preset (shmup_feat.md §15 extends). */
export interface DifficultyExtends {
  /** Score of the first extend (0 = no extends at all). */
  readonly first: number;
  /** Points between later extends (0 = only the first one). */
  readonly every: number;
}

/**
 * One difficulty preset (shmup_feat.md §15 "difficulty presets": each maps to rank base, rank
 * growth, lives, extend thresholds and a death-penalty preset). A row of a {@link DifficultyTable};
 * {@link difficultyOverrides} turns it into {@link GameConfig} fields.
 */
export interface DifficultyRules {
  /** Base rank, 0–31 (`GameConfig.rankBase`; Easy 0 / Normal 2 / Hard 4 / Arcade 6). */
  readonly rankBase: number;
  /**
   * How fast rank grows with the stage, loop and power-ups, 0–{@link MAX_RANK_GROWTH}
   * (`GameConfig.rankGrowth`; 0 = constant rank, 1 = the Gradius III formula).
   */
  readonly rankGrowth: number;
  /** Ships at game start, 1–5 (`GameConfig.startingLives`). */
  readonly lives: number;
  /** Extra-life thresholds (`GameConfig.extendFirst` / `extendEvery`). */
  readonly extends: DifficultyExtends;
  /** Continues (credits) per game, 0–{@link MAX_CONTINUES} (`GameConfig.continues`). */
  readonly continues: number;
  /** What a death costs (`GameConfig.deathPenalty`). */
  readonly deathPenalty: DeathPenaltyPreset;
  /** Directions aimed shots snap to: a power of two, 4–1024 (`GameConfig.aimDirections`). */
  readonly aimDirections: number;
  /**
   * Enemy bullet speed multiplier on top of the rank's, {@link MIN_BULLET_SPEED_MUL}–
   * {@link MAX_BULLET_SPEED_MUL} (`GameConfig.bulletSpeedMul`).
   */
  readonly bulletSpeedMul: number;
}

/** A {@link DifficultyRules} row per {@link DifficultyPreset}. */
export type DifficultyTable = Readonly<Record<DifficultyPreset, DifficultyRules>>;

/** Highest {@link GameConfig.rankGrowth}. */
export const MAX_RANK_GROWTH = 4;

/** Most continues a preset may give (the score's last digit counts them — 0–9). */
export const MAX_CONTINUES = 9;

/** Highest extend threshold (the scores' clamp: 99,999,990). */
export const MAX_EXTEND_SCORE = 99_999_990;

/** Lowest {@link GameConfig.bulletSpeedMul}. */
export const MIN_BULLET_SPEED_MUL = 0.25;

/** Highest {@link GameConfig.bulletSpeedMul}. */
export const MAX_BULLET_SPEED_MUL = 4;

/**
 * Builds one frozen {@link DifficultyRules} row.
 *
 * @param rankBase - Base rank.
 * @param rankGrowth - Rank growth.
 * @param lives - Starting lives.
 * @param continues - Continues.
 * @param deathPenalty - Death penalty.
 * @param aimDirections - Aimed-shot directions.
 * @param bulletSpeedMul - Bullet speed multiplier.
 * @returns The row (extends at 20,000, then every 70,000 — shmup_feat.md §15, decision D7).
 */
function preset(
  rankBase: number,
  rankGrowth: number,
  lives: number,
  continues: number,
  deathPenalty: DeathPenaltyPreset,
  aimDirections: number,
  bulletSpeedMul: number,
): DifficultyRules {
  return Object.freeze({
    rankBase,
    rankGrowth,
    lives,
    extends: Object.freeze({ first: 20_000, every: 70_000 }),
    continues,
    deathPenalty,
    aimDirections,
    bulletSpeedMul,
  });
}

/**
 * The built-in difficulty table — the same values as the shipped
 * `content/rules/difficulty.rules.json` (a test keeps them equal), used when the content has no
 * `rules` file with a `difficulty` section:
 *
 * | Preset | rank base | growth | lives | continues | death penalty | aim dirs | bullet × |
 * |---|---|---|---|---|---|---|---|
 * | easy | 0 | 0.5 | 5 | 5 | casual | 16 | 0.85 |
 * | normal | 2 | 1 | 3 | 3 | classic | 32 | 1 |
 * | hard | 4 | 1 | 3 | 2 | classic | 32 | 1 |
 * | arcade | 6 | 1 | 2 | 0 | arcade | 32 | 1 |
 *
 * Every preset extends at 20,000 and then every 70,000 points (decision D7).
 */
export const DEFAULT_DIFFICULTY_TABLE: DifficultyTable = Object.freeze({
  easy: preset(0, 0.5, 5, 5, 'casual', 16, 0.85),
  normal: preset(2, 1, 3, 3, 'classic', 32, 1),
  hard: preset(4, 1, 3, 2, 'classic', 32, 1),
  arcade: preset(6, 1, 2, 0, 'arcade', 32, 1),
});

/** Starting loadouts of {@link GameConfig.loadout}. */
export type StartingLoadout = 'default' | 'full';

/**
 * The debug stage skip of {@link GameConfig.stageSkip}: `'none'` plays the stage from its start,
 * `'boss'` starts a little before its boss (the WARNING — `core/debug` `skipToBoss`).
 */
export type StageSkip = 'none' | 'boss';

/**
 * Names of the seven power-meter slots (shmup_feat.md §6A), in meter order:
 * `SPEED UP | MISSILE | DOUBLE | LASER | OPTION | ? | !` — `shield` is the `?` slot (Force Field),
 * `mega` the `!` slot (Mega Crash). `core/powerups` numbers them in this order (`MeterSlot`).
 */
export type MeterSlotName = 'speed' | 'missile' | 'double' | 'laser' | 'option' | 'shield' | 'mega';

/** Every {@link MeterSlotName}, in meter order (the index is the slot's `MeterSlot` code). */
export const METER_SLOT_NAMES: readonly MeterSlotName[] = Object.freeze([
  'speed',
  'missile',
  'double',
  'laser',
  'option',
  'shield',
  'mega',
] as MeterSlotName[]);

/**
 * The default Auto Power-Up order (shmup_feat.md §6A, the "semi-auto" idea): Speed → Missile →
 * Laser → Option ×4 → `?` (Force Field).
 */
export const DEFAULT_AUTO_POWER_UP_ORDER: readonly MeterSlotName[] = Object.freeze([
  'speed',
  'missile',
  'laser',
  'option',
  'option',
  'option',
  'option',
  'shield',
] as MeterSlotName[]);

/** Most entries {@link GameConfig.autoPowerUpOrder} may have. */
export const MAX_AUTO_POWER_UP_ORDER = 32;

/**
 * What the meter's `!` slot does (shmup_feat.md §7A "`!` slot", plan M2-03), chosen before the
 * game with the loadout:
 *
 * - `megaCrash` — the screen clear (bullets and small enemies, no boss damage; the default);
 * - `normal` — the Double / Laser back to the basic shot;
 * - `speedDown` — one speed level less;
 * - `lifeOption` — spare ships become Options (as many as there is room for);
 * - `fullBarrier` — the `?` shield back to full (or a fresh one).
 */
export type MegaChoice = 'megaCrash' | 'normal' | 'speedDown' | 'lifeOption' | 'fullBarrier';

/** Every {@link MegaChoice}, in menu order (the index is `core/powerups` `MegaEffect`'s code). */
export const MEGA_CHOICES: readonly MegaChoice[] = Object.freeze([
  'megaCrash',
  'normal',
  'speedDown',
  'lifeOption',
  'fullBarrier',
] as MegaChoice[]);

/**
 * What the meter's `?` slot grants (shmup_feat.md §9 meter-mode shields; `core/shields` maps each
 * to its spec):
 *
 * - `forceField` — the barrier round the ship (M1-11; the default);
 * - `shield` — two front pods at the nose, each wearing out on its own (M2-04);
 * - `freeShield` — pods attached where the ship last flew towards; `?` adds a pair each time
 *   (M2-04);
 * - `rotateShield` — two pods orbiting the ship (M2-04);
 * - `reduce` — the ship's hurtbox shrinks two steps and grows back one per hit (M2-04).
 */
export type ShieldChoice = 'forceField' | 'shield' | 'freeShield' | 'rotateShield' | 'reduce';

/** Every {@link ShieldChoice}, in menu order (`core/shields` `shieldSpecOf` maps them to specs). */
export const SHIELD_CHOICES: readonly ShieldChoice[] = Object.freeze([
  'forceField',
  'shield',
  'freeShield',
  'rotateShield',
  'reduce',
] as ShieldChoice[]);

/**
 * How the meter's Options fly (shmup_feat.md §8, plan M2-04; `core/options`):
 *
 * - `trail` — follow the ship's flown path (M1-10; the default);
 * - `snake` — a chain pulled along behind the ship, away from where it moves, that keeps its shape
 *   when the ship stops;
 * - `formation` — a fixed `>` behind the ship that spreads into a wide `V`;
 * - `rotate` — orbiting the ship, the orbit widening when extended.
 */
export type OptionChoice = 'trail' | 'snake' | 'formation' | 'rotate';

/** Every {@link OptionChoice}, in menu order (the index is `core/options` `OptionMode`'s code). */
export const OPTION_CHOICES: readonly OptionChoice[] = Object.freeze([
  'trail',
  'snake',
  'formation',
  'rotate',
] as OptionChoice[]);

/**
 * Weapon Edit (shmup_feat.md §7A "Weapon Edit", plan M2-03): the weapon of each of the meter's
 * Missile / Double / Laser slots, by content weapon id (`content/weapons/`) — any weapon of that
 * slot, whatever preset it comes from. The main shot stays the preset's.
 */
export interface WeaponEdit {
  /** Weapon of the MISSILE slot (a `missile`-slot weapon id). */
  readonly missile: string;
  /** Weapon of the DOUBLE slot (a `double`-slot weapon id). */
  readonly double: string;
  /** Weapon of the LASER slot (a `laser`-slot weapon id). */
  readonly laser: string;
}

/** The meter slots a {@link WeaponEdit} names, in meter order. */
export const WEAPON_EDIT_SLOTS = Object.freeze(['missile', 'double', 'laser'] as const);

/**
 * The loadout choice of the weapon select (plan M2-03): the {@link GameConfig} fields it sets.
 * {@link withArsenal} applies one to a resolved config.
 */
export type ArsenalChoice = Partial<
  Pick<
    GameConfig,
    | 'weaponPreset'
    | 'weaponEdit'
    | 'megaChoice'
    | 'shieldChoice'
    | 'optionChoice'
    | 'autoPowerUp'
    | 'autoPowerUpOrder'
  >
>;

/**
 * The default {@link GameConfig.coopExtra}: half an extra item per power-up drop while two ships
 * play (plan M2-06).
 */
export const DEFAULT_COOP_EXTRA = 0.5;

/** Highest {@link GameConfig.coopExtra}. */
export const MAX_COOP_EXTRA = 4;

/** Parameters of one game session. All fields are sim-affecting and replay-recorded. */
export interface GameConfig {
  /** Internal render width in pixels (384 → ×5 on 1080p). */
  readonly internalWidth: number;
  /** Internal render height in pixels (216 → ×5 on 1080p). */
  readonly internalHeight: number;
  /** Simulation ticks per second (fixed step). */
  readonly tickRate: number;
  /** Upper bound of ticks run per rendered frame (anti spiral-of-death). */
  readonly maxTicksPerFrame: number;
  /** Seed of the gameplay RNG stream. Unsigned 32-bit. */
  readonly seed: number;
  /**
   * Difficulty preset (shmup_feat.md §15). {@link resolveGameConfig} fills the preset's fields —
   * {@link GameConfig.rankBase}, {@link GameConfig.rankGrowth}, {@link GameConfig.startingLives},
   * {@link GameConfig.extendFirst}, {@link GameConfig.extendEvery}, {@link GameConfig.continues},
   * {@link GameConfig.deathPenalty}, {@link GameConfig.aimDirections},
   * {@link GameConfig.bulletSpeedMul} — from its {@link DifficultyRules} unless overridden; it
   * also names the saved hi-score table (`core/save` `hiScoreModeKey`).
   */
  readonly difficulty: DifficultyPreset;
  /** Base rank, 0–31 (`core/rank`; the preset's `rankBase` — Normal 2). */
  readonly rankBase: number;
  /**
   * Rank growth, 0–{@link MAX_RANK_GROWTH}: the stage, loop, power-up and special terms of the rank
   * formula are multiplied by it (`core/rank` `computeRank`; 0 = constant rank, 1 = Normal).
   */
  readonly rankGrowth: number;
  /**
   * Score of the first extra life (shmup_feat.md §15 extends; 0 = no extends), a whole number up
   * to {@link MAX_EXTEND_SCORE}. `core/scoring` gives +1 life (capped at 9) when a score reaches
   * it.
   */
  readonly extendFirst: number;
  /** Points between the later extra lives (0 = only the first), up to {@link MAX_EXTEND_SCORE}. */
  readonly extendEvery: number;
  /**
   * Continues per game, 0–{@link MAX_CONTINUES} (shmup_feat.md §10): after a game over the scene
   * flow offers this many restarts at the last checkpoint (`core/world` `continueWorld`).
   */
  readonly continues: number;
  /**
   * Enemy bullet speed multiplier on top of the rank's curve, {@link MIN_BULLET_SPEED_MUL}–
   * {@link MAX_BULLET_SPEED_MUL} (`core/bullets` `speedScale`; 1 on Normal).
   */
  readonly bulletSpeedMul: number;
  /**
   * Power-up model: `'meter'` (Gradius-style bar, the default — decision D1) or `'direct'`
   * (Darius-style colour items, 9-level shot families and the Arm shield — M2-05). The ship select
   * sets it from the chosen ship's `mode` (KESTREL meter, MANTA direct).
   */
  readonly powerUpMode: PowerUpMode;
  /**
   * Id of the ship every player flies (`content/player/`, plan M2-05 — default
   * {@link DEFAULT_SHIP_ID}): `createWorld` takes that ship, or the content's first one when it has
   * no such ship (`core/player` `resolvePlayerShip`).
   */
  readonly shipId: string;
  /** How much power a death costs (shmup_feat.md §10; the preset's value — Normal `classic`). */
  readonly deathPenalty: DeathPenaltyPreset;
  /** Lives at game start (1–5; the preset's value — Normal 3). */
  readonly startingLives: number;
  /** Always-on autofire (remote play requires it). */
  readonly autofire: boolean;
  /** Remote-first control scheme: forced autofire, 4-way-friendly defaults. */
  readonly remoteMode: boolean;
  /**
   * Id of the stage the session plays (`content/stages/`), or `null` for free flight in open
   * space with a static camera (the dev default until the scene flow of M1-16 picks stages).
   */
  readonly stage: string | null;
  /**
   * Debug stage skip (plan M1-18; the e2e smoke and the playtest reach the boss with it):
   * `'boss'` makes every World of the session jump its stage to just before the first `warning`
   * / `boss` event at creation (`core/debug` `skipToBoss`); `'none'` (the default) plays the
   * stage from its start. Sim-affecting, so it lives here (a replay records it). Ignored in free
   * flight and on a stage without a boss.
   */
  readonly stageSkip: StageSkip;
  /**
   * Directions aimed enemy shots snap to (decision D17: 32 on Normal for the retro feel, 16 on
   * Easy — the preset's value). A power of two from 4 to 1024 (the binary-angle circle).
   */
  readonly aimDirections: number;
  /**
   * Ticks between main-weapon shots under autofire (shmup_feat.md §4: configurable rate, replay
   * recorded); a weapon's own `refireTicks` overrides it. 1–60.
   */
  readonly autofireInterval: number;
  /**
   * Ticks between missile launches under autofire (a weapon's `refireTicks` overrides it).
   * 1–60.
   */
  readonly missileInterval: number;
  /**
   * The loadout every player starts with (`core/weapons` `applyLoadoutPreset`): `'default'` (the
   * basic shot) or `'full'` (speed 2, Missile, Laser, four Options — the web app's
   * `?loadout=full` dev override).
   */
  readonly loadout: StartingLoadout;
  /**
   * Auto Power-Up (decision D2, shmup_feat.md §4 rule 4): when a capsule moves the meter cursor
   * onto the next wanted slot of {@link GameConfig.autoPowerUpOrder} and that slot can be equipped,
   * it is equipped at once — no OK press needed. Off by default ("parking" stays possible).
   */
  readonly autoPowerUp: boolean;
  /**
   * The slots Auto Power-Up equips, in order (default {@link DEFAULT_AUTO_POWER_UP_ORDER}); a slot
   * listed `n` times asks for `n` levels (Speed, Option). 0–{@link MAX_AUTO_POWER_UP_ORDER}
   * entries.
   */
  readonly autoPowerUpOrder: readonly MeterSlotName[];
  /**
   * The gentle pickup magnet (decision D33): items within 16 px of a ship's pickup box drift
   * towards it. On by default.
   */
  readonly pickupMagnet: boolean;
  /**
   * The meter-mode weapon preset (shmup_feat.md §7A "Preset loadouts", plan M2-03): the id of a
   * `content/weapons/` preset — `type-a` (the default) … `type-d`. It decides which weapon each of
   * the meter's MISSILE / DOUBLE / LASER slots equips (`core/weapons` `resolveArsenal`); a content
   * without that preset falls back to its first one.
   */
  readonly weaponPreset: string;
  /**
   * Weapon Edit (plan M2-03): the weapon of each of the Missile / Double / Laser slots, overriding
   * the preset's — or `null` (the default) for the preset's weapons. `createWorld` throws for an id
   * the content does not have or a weapon of another slot.
   */
  readonly weaponEdit: WeaponEdit | null;
  /** What the `!` slot does ({@link MegaChoice}; default `megaCrash`). */
  readonly megaChoice: MegaChoice;
  /** What the `?` slot grants ({@link ShieldChoice}; default `forceField`). */
  readonly shieldChoice: ShieldChoice;
  /**
   * How the Options fly ({@link OptionChoice}; default `trail` — plan M2-04). Chosen in the weapon
   * select with the loadout; session-wide (both players).
   */
  readonly optionChoice: OptionChoice;
  /**
   * Two-player simultaneous co-op (shmup_feat.md §16, plan M2-06 — the title's `2 PLAYERS`):
   * player 1 starts, player 2 **drops in** with a join press (`core/world` `JOIN_ACTIONS`) on its
   * controller, each player has their own lives, score, meter / items and continues — a player
   * out of lives with continues left drops back in the same way while the other plays on — and
   * the game is over when both are out. `false` (the default): one player, the second player slot
   * never joins.
   */
  readonly coop: boolean;
  /**
   * Co-op drop scaling (shmup_feat.md §6B "consider scaling item count in co-op", plan M2-06):
   * while two ships are in play, every power-up drop (a capsule, or a Direct-mode item) adds this
   * much to a credit, and each whole credit drops one more item beside it — 0.5 (the default,
   * {@link DEFAULT_COOP_EXTRA}) = every second drop comes twice. A finite number 0–
   * {@link MAX_COOP_EXTRA}; ignored with one ship in play.
   */
  readonly coopExtra: number;
}

/** Height in pixels of each HUD bar outside the playfield (decision D20). */
export const HUD_BAR_HEIGHT = 8;

/**
 * Screen row where the playfield starts: the top HUD bar occupies rows `0…7`
 * (decision D20). World-space `y` maps to screen `y - camera.y + PLAYFIELD_Y`.
 */
export const PLAYFIELD_Y = HUD_BAR_HEIGHT;

/** Playfield width in pixels — the full internal width (decision D20). */
export const PLAYFIELD_W = 384;

/** Playfield height in pixels: 216 − two 8-px HUD bars (decision D20). */
export const PLAYFIELD_H = 200;

/**
 * Defaults: remote-first, Normal difficulty (its {@link DEFAULT_DIFFICULTY_TABLE} row: rank base 2,
 * growth 1, 3 lives, extends at 20,000 / every 70,000, 3 continues, Classic death penalty, 32 aim
 * directions, bullet speed × 1), the power meter with Type A, Mega Crash on `!`, the Force Field
 * on `?` and trailing Options; one player (co-op off, its drop scaling at
 * {@link DEFAULT_COOP_EXTRA}).
 */
export const DEFAULT_GAME_CONFIG: GameConfig = Object.freeze({
  internalWidth: 384,
  internalHeight: 216,
  tickRate: 60,
  maxTicksPerFrame: 4,
  seed: 0x5eedc0de,
  difficulty: 'normal',
  rankBase: 2,
  rankGrowth: 1,
  extendFirst: 20_000,
  extendEvery: 70_000,
  continues: 3,
  bulletSpeedMul: 1,
  powerUpMode: 'meter',
  shipId: DEFAULT_SHIP_ID,
  deathPenalty: 'classic',
  startingLives: 3,
  autofire: true,
  remoteMode: true,
  stage: null,
  stageSkip: 'none',
  aimDirections: 32,
  autofireInterval: 4,
  missileInterval: 10,
  loadout: 'default',
  autoPowerUp: false,
  autoPowerUpOrder: DEFAULT_AUTO_POWER_UP_ORDER,
  pickupMagnet: true,
  weaponPreset: 'type-a',
  weaponEdit: null,
  megaChoice: 'megaCrash',
  shieldChoice: 'forceField',
  optionChoice: 'trail',
  coop: false,
  coopExtra: DEFAULT_COOP_EXTRA,
});

/**
 * The {@link GameConfig} fields a difficulty preset sets (shmup_feat.md §15).
 *
 * @param difficulty - The preset.
 * @param table - The difficulty table (default {@link DEFAULT_DIFFICULTY_TABLE}; the content's
 *   `ContentDb.difficulty` when it has one).
 * @returns A fresh object: `difficulty`, `rankBase`, `rankGrowth`, `startingLives`,
 *   `extendFirst`, `extendEvery`, `continues`, `deathPenalty`, `aimDirections`,
 *   `bulletSpeedMul`.
 * @throws RangeError when `difficulty` is not a {@link DifficultyPreset}.
 *
 * @example
 * ```ts
 * difficultyOverrides('easy').aimDirections; // → 16
 * ```
 */
export function difficultyOverrides(
  difficulty: DifficultyPreset,
  table: DifficultyTable = DEFAULT_DIFFICULTY_TABLE,
): Partial<GameConfig> {
  if (DIFFICULTY_PRESETS.indexOf(difficulty) < 0) {
    throw new RangeError(
      `GameConfig.difficulty must be one of ${DIFFICULTY_PRESETS.join(', ')}, got ${String(difficulty)}`,
    );
  }
  const rules = table[difficulty];
  return {
    difficulty,
    rankBase: rules.rankBase,
    rankGrowth: rules.rankGrowth,
    startingLives: rules.lives,
    extendFirst: rules.extends.first,
    extendEvery: rules.extends.every,
    continues: rules.continues,
    deathPenalty: rules.deathPenalty,
    aimDirections: rules.aimDirections,
    bulletSpeedMul: rules.bulletSpeedMul,
  };
}

/**
 * Switches a resolved config to another difficulty preset: every preset field (see
 * {@link difficultyOverrides}) comes from the table's row, everything else stays.
 *
 * @remarks
 * What the difficulty menu under START does (`core/scenes`). Overrides of preset fields the
 * config had (e.g. `startingLives: 5`) are replaced by the new preset's values.
 *
 * @param config - A resolved config.
 * @param difficulty - The new preset.
 * @param table - The difficulty table (default {@link DEFAULT_DIFFICULTY_TABLE}).
 * @returns A frozen, validated config.
 * @throws RangeError when `difficulty` is not a preset or the result fails
 *   {@link resolveGameConfig}.
 *
 * @example
 * ```ts
 * withDifficulty(resolveGameConfig({ seed: 3 }), 'hard').rankBase; // → 4 (seed stays 3)
 * ```
 */
export function withDifficulty(
  config: GameConfig,
  difficulty: DifficultyPreset,
  table: DifficultyTable = DEFAULT_DIFFICULTY_TABLE,
): GameConfig {
  return resolveGameConfig({ ...config, ...difficultyOverrides(difficulty, table) }, table);
}

/**
 * Merges overrides onto {@link DEFAULT_GAME_CONFIG} and validates the result.
 *
 * @remarks
 * The difficulty preset (`overrides.difficulty`, default `'normal'`) fills its fields from `table`
 * first ({@link difficultyOverrides}); explicit overrides of those fields win. Validated ranges
 * (integers unless noted, inclusive): `internalWidth` / `internalHeight`
 * 16–4096, `tickRate` 1–1000, `maxTicksPerFrame` 1–60, `seed` 0–0xFFFFFFFF,
 * `startingLives` 1–5, `aimDirections` a power of two in 4–1024, `autofireInterval` /
 * `missileInterval` 1–60, `rankBase` 0–31, `rankGrowth` a finite number 0–{@link MAX_RANK_GROWTH},
 * `extendFirst` / `extendEvery` 0–{@link MAX_EXTEND_SCORE}, `continues` 0–{@link MAX_CONTINUES},
 * `bulletSpeedMul` a finite number {@link MIN_BULLET_SPEED_MUL}–{@link MAX_BULLET_SPEED_MUL},
 * `coopExtra` a finite number 0–{@link MAX_COOP_EXTRA} and `coop` a boolean (M2-06).
 * `difficulty` must be a {@link DifficultyPreset} and `deathPenalty` a {@link DeathPenaltyPreset};
 * `stage` must be `null` or a non-empty string (whether the id exists is
 * checked by `createWorld` against the content); `stageSkip` must be `'none'` or `'boss'`;
 * `loadout` must be `'default'` or `'full'`;
 * `powerUpMode` must be a {@link PowerUpMode} (`'direct'` since M2-05) and `shipId` a non-empty
 * string (whether the content has that ship is `createWorld`'s business — it falls back);
 * `autoPowerUpOrder` must be an array of at most {@link MAX_AUTO_POWER_UP_ORDER}
 * {@link MeterSlotName}s — the result holds a frozen copy of it; `weaponPreset` must be a non-empty
 * string (whether the content has it is `core/weapons`' business), `weaponEdit` `null` or an object
 * of three non-empty weapon ids (frozen copy), `megaChoice` a {@link MegaChoice} and `shieldChoice`
 * a {@link ShieldChoice} (M2-03), `optionChoice` an {@link OptionChoice} (M2-04). Other string
 * presets and booleans are not validated at runtime — the types cover them.
 *
 * @param overrides - Fields to change.
 * @param table - The difficulty table the preset fields come from (default
 *   {@link DEFAULT_DIFFICULTY_TABLE}; `createGame` passes the content's).
 * @returns A frozen, validated config.
 * @throws RangeError when a numeric field is not an integer (or not finite) or is out of range,
 *   `aimDirections` is not a power of two, `difficulty` or `deathPenalty` is not a preset,
 *   `stage` is neither `null` nor a non-empty string,
 *   `stageSkip` is not a {@link StageSkip}, `loadout` is not a {@link StartingLoadout},
 *   `powerUpMode` is not a {@link PowerUpMode}, `shipId` is not a non-empty string,
 *   `autoPowerUpOrder` is not an array of meter slot names (or is too long), `weaponPreset`,
 *   `weaponEdit`, `megaChoice`, `shieldChoice` or `optionChoice` is malformed, `coop` is not a
 *   boolean or `coopExtra` is out of range.
 *
 * @example
 * ```ts
 * const config = resolveGameConfig({ seed: 42, startingLives: 5 });
 * resolveGameConfig({ difficulty: 'easy' }).aimDirections; // → 16 (the Easy preset)
 * resolveGameConfig({ tickRate: 0 }); // throws RangeError
 * ```
 */
export function resolveGameConfig(
  overrides: Partial<GameConfig> = {},
  table: DifficultyTable = DEFAULT_DIFFICULTY_TABLE,
): GameConfig {
  const difficulty = overrides.difficulty ?? DEFAULT_GAME_CONFIG.difficulty;
  const config: GameConfig = {
    ...DEFAULT_GAME_CONFIG,
    ...difficultyOverrides(difficulty, table),
    ...overrides,
    // The preset the fields came from (an explicit `difficulty: undefined` must not survive).
    difficulty,
  };
  requireInteger('internalWidth', config.internalWidth, 16, 4096);
  requireInteger('internalHeight', config.internalHeight, 16, 4096);
  requireInteger('tickRate', config.tickRate, 1, 1000);
  requireInteger('maxTicksPerFrame', config.maxTicksPerFrame, 1, 60);
  requireInteger('seed', config.seed, 0, 0xffffffff);
  requireInteger('startingLives', config.startingLives, 1, 5);
  requireInteger('aimDirections', config.aimDirections, 4, 1024);
  requireInteger('autofireInterval', config.autofireInterval, 1, 60);
  requireInteger('missileInterval', config.missileInterval, 1, 60);
  requireInteger('rankBase', config.rankBase, 0, 31);
  requireNumber('rankGrowth', config.rankGrowth, 0, MAX_RANK_GROWTH);
  requireInteger('extendFirst', config.extendFirst, 0, MAX_EXTEND_SCORE);
  requireInteger('extendEvery', config.extendEvery, 0, MAX_EXTEND_SCORE);
  requireInteger('continues', config.continues, 0, MAX_CONTINUES);
  requireNumber(
    'bulletSpeedMul',
    config.bulletSpeedMul,
    MIN_BULLET_SPEED_MUL,
    MAX_BULLET_SPEED_MUL,
  );
  requireNumber('coopExtra', config.coopExtra, 0, MAX_COOP_EXTRA);
  const coop: unknown = config.coop;
  if (typeof coop !== 'boolean') {
    throw new RangeError(`GameConfig.coop must be a boolean, got ${String(coop)}`);
  }
  if ((config.aimDirections & (config.aimDirections - 1)) !== 0) {
    throw new RangeError(
      `GameConfig.aimDirections must be a power of two, got ${config.aimDirections}`,
    );
  }
  const penalty: unknown = config.deathPenalty;
  if (DEATH_PENALTY_PRESETS.indexOf(penalty as DeathPenaltyPreset) < 0) {
    throw new RangeError(
      `GameConfig.deathPenalty must be one of ${DEATH_PENALTY_PRESETS.join(', ')}, got ${String(penalty)}`,
    );
  }
  const stage: unknown = config.stage;
  if (stage !== null && (typeof stage !== 'string' || stage === '')) {
    throw new RangeError(
      `GameConfig.stage must be null or a non-empty stage id, got ${typeof stage === 'string' ? '""' : typeof stage}`,
    );
  }
  const skip: unknown = config.stageSkip;
  if (skip !== 'none' && skip !== 'boss') {
    throw new RangeError(`GameConfig.stageSkip must be 'none' or 'boss', got ${String(skip)}`);
  }
  const loadout: unknown = config.loadout;
  if (loadout !== 'default' && loadout !== 'full') {
    throw new RangeError(`GameConfig.loadout must be 'default' or 'full', got ${String(loadout)}`);
  }
  const mode: unknown = config.powerUpMode;
  if (POWER_UP_MODES.indexOf(mode as PowerUpMode) < 0) {
    throw new RangeError(`GameConfig.powerUpMode must be 'meter' or 'direct', got ${String(mode)}`);
  }
  const ship: unknown = config.shipId;
  if (typeof ship !== 'string' || ship === '') {
    throw new RangeError(
      `GameConfig.shipId must be a non-empty ship id, got ${typeof ship === 'string' ? '""' : typeof ship}`,
    );
  }
  const order: unknown = config.autoPowerUpOrder;
  if (!Array.isArray(order) || order.length > MAX_AUTO_POWER_UP_ORDER) {
    throw new RangeError(
      `GameConfig.autoPowerUpOrder must be an array of at most ${MAX_AUTO_POWER_UP_ORDER} meter slots`,
    );
  }
  for (let i = 0; i < order.length; i++) {
    const slot: unknown = order[i];
    if (METER_SLOT_NAMES.indexOf(slot as MeterSlotName) < 0) {
      throw new RangeError(
        `GameConfig.autoPowerUpOrder[${i}] must be one of ${METER_SLOT_NAMES.join(', ')}, got ${String(slot)}`,
      );
    }
  }
  const preset: unknown = config.weaponPreset;
  if (typeof preset !== 'string' || preset === '') {
    throw new RangeError(
      `GameConfig.weaponPreset must be a non-empty weapon preset id, got ${typeof preset === 'string' ? '""' : typeof preset}`,
    );
  }
  const mega: unknown = config.megaChoice;
  if (MEGA_CHOICES.indexOf(mega as MegaChoice) < 0) {
    throw new RangeError(
      `GameConfig.megaChoice must be one of ${MEGA_CHOICES.join(', ')}, got ${String(mega)}`,
    );
  }
  const shield: unknown = config.shieldChoice;
  if (SHIELD_CHOICES.indexOf(shield as ShieldChoice) < 0) {
    throw new RangeError(
      `GameConfig.shieldChoice must be one of ${SHIELD_CHOICES.join(', ')}, got ${String(shield)}`,
    );
  }
  const option: unknown = config.optionChoice;
  if (OPTION_CHOICES.indexOf(option as OptionChoice) < 0) {
    throw new RangeError(
      `GameConfig.optionChoice must be one of ${OPTION_CHOICES.join(', ')}, got ${String(option)}`,
    );
  }
  const resolved: GameConfig = {
    ...config,
    autoPowerUpOrder:
      order === DEFAULT_AUTO_POWER_UP_ORDER
        ? DEFAULT_AUTO_POWER_UP_ORDER
        : Object.freeze((order as MeterSlotName[]).slice()),
    weaponEdit: resolveWeaponEdit(config.weaponEdit),
  };
  return Object.freeze(resolved);
}

/**
 * Validates a {@link GameConfig.weaponEdit} and returns a frozen copy of it.
 *
 * @param edit - The candidate (`null` or `{ missile, double, laser }`; `undefined` — an explicit
 *   `weaponEdit: undefined` override — counts as `null`).
 * @returns `null`, or a frozen copy with exactly the three fields.
 * @throws RangeError when it is neither `null` nor an object whose three fields are non-empty
 *   strings.
 */
function resolveWeaponEdit(edit: unknown): WeaponEdit | null {
  if (edit === null || edit === undefined) return null;
  if (!isRecord(edit)) {
    throw new RangeError('GameConfig.weaponEdit must be null or { missile, double, laser }');
  }
  for (const slot of WEAPON_EDIT_SLOTS) {
    const id = edit[slot];
    if (typeof id !== 'string' || id === '') {
      throw new RangeError(`GameConfig.weaponEdit.${slot} must be a non-empty weapon id`);
    }
  }
  return Object.freeze({
    missile: edit.missile as string,
    double: edit.double as string,
    laser: edit.laser as string,
  });
}

/**
 * Whether a config already has every field of a loadout choice (so {@link withArsenal} would
 * change nothing).
 *
 * @param config - A resolved config.
 * @param arsenal - The loadout choice.
 * @returns `true` when every field the choice sets (not `undefined`) equals the config's — the
 *   Weapon Edit and the order compared by value.
 */
export function arsenalMatches(config: GameConfig, arsenal: ArsenalChoice): boolean {
  if (arsenal.weaponPreset !== undefined && arsenal.weaponPreset !== config.weaponPreset) {
    return false;
  }
  if (arsenal.megaChoice !== undefined && arsenal.megaChoice !== config.megaChoice) return false;
  if (arsenal.shieldChoice !== undefined && arsenal.shieldChoice !== config.shieldChoice) {
    return false;
  }
  if (arsenal.optionChoice !== undefined && arsenal.optionChoice !== config.optionChoice) {
    return false;
  }
  if (arsenal.autoPowerUp !== undefined && arsenal.autoPowerUp !== config.autoPowerUp) {
    return false;
  }
  const edit = arsenal.weaponEdit;
  if (edit !== undefined) {
    const own = config.weaponEdit;
    if (edit === null || own === null) {
      if (edit !== own) return false;
    } else if (
      edit.missile !== own.missile ||
      edit.double !== own.double ||
      edit.laser !== own.laser
    ) {
      return false;
    }
  }
  const order = arsenal.autoPowerUpOrder;
  if (order !== undefined) {
    const own = config.autoPowerUpOrder;
    if (order.length !== own.length) return false;
    for (let i = 0; i < order.length; i++) if (order[i] !== own[i]) return false;
  }
  return true;
}

/**
 * Applies the weapon select's loadout choice to a resolved config (plan M2-03): the preset,
 * Weapon Edit, the `!` and `?` choices, the Option type (M2-04) and Auto Power-Up with its order;
 * everything else stays.
 *
 * @param config - A resolved config.
 * @param arsenal - The fields to change ({@link ArsenalChoice}).
 * @returns A frozen, validated config.
 * @throws RangeError when the result fails {@link resolveGameConfig}.
 *
 * @example
 * ```ts
 * withArsenal(resolveGameConfig({ seed: 3 }), { weaponPreset: 'type-c' }).weaponPreset; // 'type-c'
 * ```
 */
export function withArsenal(config: GameConfig, arsenal: ArsenalChoice): GameConfig {
  // Every field of `config` is explicit, so the table's preset fields never replace them; fields
  // the choice leaves `undefined` keep the config's value.
  const merged: Record<string, unknown> = { ...config };
  const source = arsenal as Readonly<Record<string, unknown>>;
  for (const key of Object.keys(source)) {
    if (source[key] !== undefined) merged[key] = source[key];
  }
  return resolveGameConfig(merged);
}

/**
 * The ship choice of the ship select (plan M2-05): the ship every player flies and its power-up
 * model. {@link withShip} applies one to a resolved config.
 */
export interface ShipChoice {
  /** The ship's content id (`content/player/`, e.g. `manta`). */
  readonly shipId: string;
  /** Its power-up model (the ship's `mode`: KESTREL `meter`, MANTA `direct`). */
  readonly powerUpMode: PowerUpMode;
}

/**
 * Whether a config already flies a ship choice (so {@link withShip} would change nothing).
 *
 * @param config - A resolved config.
 * @param ship - The ship choice.
 * @returns `true` when both the ship id and the power-up mode are the config's.
 */
export function shipMatches(config: GameConfig, ship: ShipChoice): boolean {
  return config.shipId === ship.shipId && config.powerUpMode === ship.powerUpMode;
}

/**
 * Applies the ship select's choice to a resolved config (plan M2-05): the ship and its power-up
 * model; everything else stays (a meter loadout of the weapon select is simply unused by a direct
 * ship).
 *
 * @param config - A resolved config.
 * @param ship - The ship choice.
 * @returns A frozen, validated config (the same object when it already flies that ship).
 * @throws RangeError when the result fails {@link resolveGameConfig} (an empty id, an unknown
 *   mode).
 *
 * @example
 * ```ts
 * const manta = withShip(resolveGameConfig(), { shipId: 'manta', powerUpMode: 'direct' });
 * manta.powerUpMode; // → 'direct'
 * ```
 */
export function withShip(config: GameConfig, ship: ShipChoice): GameConfig {
  if (shipMatches(config, ship)) return config;
  return resolveGameConfig({ ...config, shipId: ship.shipId, powerUpMode: ship.powerUpMode });
}

/**
 * Switches a resolved config to one or two players (plan M2-06 — the title's `1 PLAYER` /
 * `2 PLAYERS`): {@link GameConfig.coop}; everything else stays.
 *
 * @param config - A resolved config.
 * @param coop - `true` for a two-player co-op game.
 * @returns A frozen, validated config (the same object when it already has that value).
 *
 * @example
 * ```ts
 * withCoop(resolveGameConfig(), true).coop; // → true
 * ```
 */
export function withCoop(config: GameConfig, coop: boolean): GameConfig {
  if (config.coop === coop) return config;
  return resolveGameConfig({ ...config, coop });
}

/**
 * Throws unless `value` is an integer within `[min, max]`.
 *
 * @param name - Field name for the error message.
 * @param value - Value to check.
 * @param min - Inclusive lower bound.
 * @param max - Inclusive upper bound.
 * @throws RangeError naming the field, the range and the offending value.
 */
function requireInteger(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`GameConfig.${name} must be an integer in [${min}, ${max}], got ${value}`);
  }
}

/**
 * Throws unless `value` is a finite number within `[min, max]`.
 *
 * @param name - Field name for the error message.
 * @param value - Value to check.
 * @param min - Inclusive lower bound.
 * @param max - Inclusive upper bound.
 * @throws RangeError naming the field, the range and the offending value.
 */
function requireNumber(name: string, value: number, min: number, max: number): void {
  if (typeof value !== 'number' || !(value >= min && value <= max)) {
    throw new RangeError(`GameConfig.${name} must be a number in [${min}, ${max}], got ${value}`);
  }
}

// ------------------------------------------------------------------------------ user options

/** Highest volume level of the Options screen's sliders (levels run `0…VOLUME_LEVELS`). */
export const VOLUME_LEVELS = 10;

/** Audio volumes as slider levels `0…`{@link VOLUME_LEVELS} (shmup_feat.md §21). */
export interface AudioOptions {
  /** MASTER — every sound. */
  readonly master: number;
  /** MUSIC — the music bus. */
  readonly music: number;
  /** SFX — the sound effects and the menu sounds (the `sfx` and `ui` buses). */
  readonly sfx: number;
}

/** Input options. */
export interface InputOptions {
  /**
   * Id of the keyboard / remote input profile the player chose in the Options screen
   * (`content/input/`, e.g. `tizen-remote-safe`), or `null` for the platform's default.
   */
  readonly profileId: string | null;
}

/**
 * The enemy bullet colour sets the renderer can draw (plan M2-02, shmup_feat.md §21 "colorblind
 * bullet palettes + shape coding"): `standard` (pink / red / purple), and one set per kind of
 * colour blindness — the asset pipeline draws every bullet, beam and bending laser segment again as
 * `<sprite>@<palette>` (recoloured, the cores shape-coded).
 */
export const BULLET_PALETTES = Object.freeze([
  'standard',
  'deuteranopia',
  'protanopia',
  'tritanopia',
] as const);

/** One of {@link BULLET_PALETTES}. */
export type BulletPalette = (typeof BULLET_PALETTES)[number];

/**
 * How the 384×216 frame fills the display (plan M2-08, shmup_feat.md §3): `integer` — the largest
 * whole multiple that fits, letterboxed (the default: every frame pixel the same size); `fit` — the
 * largest scale that fits keeping the aspect ratio, not a whole number (nearest-neighbour, so some
 * pixel rows / columns are one screen pixel wider); `stretch` — the whole display, aspect ratio
 * ignored.
 */
export const SCALE_MODES = Object.freeze(['integer', 'fit', 'stretch'] as const);

/** One of {@link SCALE_MODES}. */
export type ScaleMode = (typeof SCALE_MODES)[number];

/**
 * Display options (presentation only). M2-02 brought the bullet palette, M2-08 the scale mode, the
 * screen-shake switch, reduced flashing and the hitbox marker.
 */
export interface DisplayOptions {
  /** The enemy bullet colour set ({@link BULLET_PALETTES}; default `standard`). */
  readonly bulletPalette: BulletPalette;
  /** How the frame is scaled to the display ({@link SCALE_MODES}; default `integer`). */
  readonly scaleMode: ScaleMode;
  /** Screen shake on (default `true`; shmup_feat.md §18 "off switch", §21 accessibility). */
  readonly screenShake: boolean;
  /**
   * Reduced flashing (default `false`): at most one full-screen flash a second at a capped opacity
   * (shmup_feat.md §21 — the ≤ 3 flashes a second limit applies either way).
   */
  readonly reduceFlashing: boolean;
  /** Draw a marker on each ship's hurtbox (default `false`; shmup_feat.md §5, §21). */
  readonly showHitbox: boolean;
}

/**
 * The player's presentation-only options (plan §1.5: they never affect the simulation, so they are
 * not in {@link GameConfig} or replays). Persisted by `core/save` (`SaveData.options`).
 */
export interface UserOptions {
  /** Volumes. */
  readonly audio: AudioOptions;
  /** Controls. */
  readonly input: InputOptions;
  /** Display (empty in M1). */
  readonly display: DisplayOptions;
}

/** Defaults: every volume at full level (the mix the audio content was made for), no profile. */
export const DEFAULT_USER_OPTIONS: UserOptions = Object.freeze({
  audio: Object.freeze({ master: VOLUME_LEVELS, music: VOLUME_LEVELS, sfx: VOLUME_LEVELS }),
  input: Object.freeze({ profileId: null }),
  display: Object.freeze({
    bulletPalette: 'standard',
    scaleMode: 'integer',
    screenShake: true,
    reduceFlashing: false,
    showHitbox: false,
  }),
});

/** Shape of an input profile id (lower-case kebab, as `content/input/` requires), ≤ 64 characters. */
export const INPUT_PROFILE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** One entry of the Options screen's CONTROLS selector: a keyboard / remote input profile. */
export interface InputProfileChoice {
  /** Profile id (`content/input/`). */
  readonly id: string;
  /** Text shown in the selector (upper case, e.g. `SAFE 4-WAY (DEFAULT)`). */
  readonly label: string;
}

/**
 * The linear bus gain of a volume level: `(level / VOLUME_LEVELS)²` — a perceptual curve, so the
 * slider's middle sounds about half as loud (level 5 → 0.25, about −12 dB) and level 0 is silent.
 *
 * @param level - A volume level (clamped to `0…`{@link VOLUME_LEVELS}; NaN → 0).
 * @returns The gain for `IAudio.setBusVolume`, 0…1.
 *
 * @example
 * ```ts
 * audio.setBusVolume('music', volumeGain(options.audio.music)); // level 10 → 1, 5 → 0.25
 * ```
 */
export function volumeGain(level: number): number {
  if (!(level > 0)) return 0;
  const x = level >= VOLUME_LEVELS ? 1 : level / VOLUME_LEVELS;
  return x * x;
}

/**
 * Reads a volume level defensively.
 *
 * @param value - Anything.
 * @param fallback - Level used when `value` is not a finite number.
 * @returns An integer level in `0…VOLUME_LEVELS` (rounded, clamped).
 */
function volumeLevel(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const level = Math.round(value);
  // `<= 0` also turns -0 (from -0.4, say) into 0 (V8 boxes -0 like a fraction).
  return level <= 0 ? 0 : level > VOLUME_LEVELS ? VOLUME_LEVELS : level;
}

/**
 * Builds valid {@link UserOptions} from anything (a parsed save, a partial update), falling back to
 * {@link DEFAULT_USER_OPTIONS} field by field — never throws (shmup_feat.md §21: never crash on a
 * bad save).
 *
 * @remarks
 * Volumes: finite numbers are rounded and clamped to `0…`{@link VOLUME_LEVELS}; anything else takes
 * the default. `input.profileId`: a string matching {@link INPUT_PROFILE_ID_PATTERN} of at most 64
 * characters, else `null`. `display.bulletPalette`: one of {@link BULLET_PALETTES}, else
 * `standard`; `display.scaleMode`: one of {@link SCALE_MODES}, else `integer` (M2-08);
 * `display.screenShake`, `reduceFlashing`, `showHitbox`: booleans, else their defaults (M2-08 —
 * a save written before them resolves without a migration; unknown display fields are dropped).
 * Whether the profile id names an existing profile is the host's business (an unknown one is
 * skipped when applied).
 *
 * @param value - Candidate options (e.g. `JSON.parse(text).options`).
 * @returns Frozen, valid options.
 *
 * @example
 * ```ts
 * resolveUserOptions({ audio: { music: 7.4 } }); // → master 10, music 7, sfx 10, profileId null
 * resolveUserOptions('garbage');                  // → DEFAULT_USER_OPTIONS' values
 * ```
 */
export function resolveUserOptions(value: unknown): UserOptions {
  const root = isRecord(value) ? value : {};
  const audio = isRecord(root.audio) ? root.audio : {};
  const input = isRecord(root.input) ? root.input : {};
  const display = isRecord(root.display) ? root.display : {};
  const palette = display.bulletPalette;
  const scaleMode = display.scaleMode;
  const dd = DEFAULT_USER_OPTIONS.display;
  const d = DEFAULT_USER_OPTIONS.audio;
  const id = input.profileId;
  return Object.freeze({
    audio: Object.freeze({
      master: volumeLevel(audio.master, d.master),
      music: volumeLevel(audio.music, d.music),
      sfx: volumeLevel(audio.sfx, d.sfx),
    }),
    input: Object.freeze({
      profileId:
        typeof id === 'string' && id.length <= 64 && INPUT_PROFILE_ID_PATTERN.test(id) ? id : null,
    }),
    display: Object.freeze({
      bulletPalette:
        typeof palette === 'string' && (BULLET_PALETTES as readonly string[]).indexOf(palette) >= 0
          ? (palette as BulletPalette)
          : dd.bulletPalette,
      scaleMode:
        typeof scaleMode === 'string' && (SCALE_MODES as readonly string[]).indexOf(scaleMode) >= 0
          ? (scaleMode as ScaleMode)
          : dd.scaleMode,
      screenShake: typeof display.screenShake === 'boolean' ? display.screenShake : dd.screenShake,
      reduceFlashing:
        typeof display.reduceFlashing === 'boolean' ? display.reduceFlashing : dd.reduceFlashing,
      showHitbox: typeof display.showHitbox === 'boolean' ? display.showHitbox : dd.showHitbox,
    }),
  });
}

/**
 * Whether a value is a plain (non-array, non-null) object.
 *
 * @param value - Anything.
 * @returns `true` for an object whose fields can be read.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
