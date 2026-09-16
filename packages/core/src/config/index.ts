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
 *   (the presentation-only {@link UserOptions}); M2-16: the Controls group (autofire mode & rate,
 *   SOCD, the remote's debounce, the rebinding), the Game group (difficulty, lives, death penalty,
 *   Auto Power-Up, pickup magnet) and the one-button preset ({@link UserGameOptions})
 * - shmup_feat.md §4 — [P0] autofire: hold-to-fire, toggle mode, configurable rate
 *   ({@link GameConfig.autofireMode}); [P1] rebinding per device + persistence and SOCD resolution
 *   (the saved {@link BindingOverrides} and {@link SocdChoice} — M2-16)
 * - shmup_feat.md §15 / §16 — loops and the caravan's time limit; §21 — the game-speed and
 *   invincibility assists; §8 — option recovery after death; §4 — rumble (M3-01)
 *
 * **Public API (implemented now).** {@link GameConfig}, {@link DEFAULT_GAME_CONFIG},
 * {@link resolveGameConfig}, the difficulty presets ({@link DIFFICULTY_PRESETS},
 * {@link DifficultyRules}, {@link DifficultyExtends}, {@link DifficultyTable},
 * {@link DEFAULT_DIFFICULTY_TABLE}, {@link difficultyOverrides}, {@link withDifficulty},
 * {@link MAX_RANK_GROWTH}, {@link MAX_CONTINUES}, {@link MAX_EXTEND_SCORE},
 * {@link MIN_BULLET_SPEED_MUL}, {@link MAX_BULLET_SPEED_MUL}, {@link DEATH_PENALTY_PRESETS},
 * {@link DifficultyPreset}, {@link DeathPenaltyPreset}), the
 * preset types ({@link StartingLoadout}, {@link StageSkip} …), the power-meter slot names
 * ({@link MeterSlotName}, {@link METER_SLOT_NAMES}, {@link DEFAULT_AUTO_POWER_UP_ORDER},
 * {@link MAX_AUTO_POWER_UP_ORDER}), the meter arsenal of M2-03 ({@link MegaChoice},
 * {@link MEGA_CHOICES}, {@link ShieldChoice}, {@link SHIELD_CHOICES}, {@link WeaponEdit},
 * {@link WEAPON_EDIT_SLOTS}, {@link ArsenalChoice}, {@link withArsenal}, {@link arsenalMatches};
 * M2-04: {@link OptionChoice}, {@link OPTION_CHOICES}; M2-05: the ship choice {@link ShipChoice},
 * {@link withShip}, {@link shipMatches}, {@link POWER_UP_MODES}, {@link PowerUpMode},
 * {@link DEFAULT_SHIP_ID}; M2-06:
 * the co-op choice {@link withCoop}, {@link DEFAULT_COOP_EXTRA}, {@link MAX_COOP_EXTRA}) and the
 * screen layout constants {@link HUD_BAR_HEIGHT}, {@link PLAYFIELD_Y}, {@link PLAYFIELD_W},
 * {@link PLAYFIELD_H} (decision D20: two 8-px HUD bars outside a 384×200 playfield). User options:
 * {@link UserOptions}, {@link AudioOptions}, {@link InputOptions}, {@link DisplayOptions},
 * {@link DEFAULT_USER_OPTIONS}, {@link VOLUME_LEVELS}, {@link volumeGain},
 * {@link resolveUserOptions}, {@link InputProfileChoice}, {@link INPUT_PROFILE_ID_PATTERN},
 * {@link RETIRED_INPUT_PROFILE_IDS}, {@link migrateInputProfileId},
 * {@link BULLET_PALETTES}, {@link BulletPalette}, {@link SCALE_MODES}, {@link ScaleMode} (M2-08).
 * M2-16: the autofire mode {@link AutofireMode} / {@link AUTOFIRE_MODES}
 * ({@link GameConfig.autofireMode}) and rates {@link AUTOFIRE_INTERVALS}; the controls options
 * ({@link SocdChoice}, {@link SOCD_CHOICES}, {@link MAX_DEBOUNCE_OPTION}, the rebinding
 * {@link BindingOverrides}, {@link ProfileBindingOverride}, {@link ContextBindingOverride},
 * {@link BINDING_TOKEN_PATTERN}, {@link MAX_BINDING_PROFILES}, {@link MAX_ACTION_TOKENS},
 * {@link resolveBindingOverrides}); the game options ({@link UserGameOptions},
 * {@link DEFAULT_USER_GAME_OPTIONS}, {@link userGameOverrides}, {@link withUserGameOptions}).
 * M3-01: the loop, the caravan's clock, the invincibility assist and option recovery
 * ({@link GameConfig.loop}, {@link GameConfig.timeLimit}, {@link GameConfig.invincible},
 * {@link GameConfig.optionRecovery}; {@link MAX_LOOP}, {@link MAX_TIME_LIMIT},
 * {@link MAX_STARTING_LIVES}) and the assists / feel options ({@link PlayOptions},
 * {@link DEFAULT_PLAY_OPTIONS}, {@link GAME_SPEEDS} — `UserOptions.play`).
 * M3-02: the visual & mechanic extras — {@link GameConfig.slowdown} ({@link SLOWDOWN_THRESHOLD},
 * {@link SLOWDOWN_RUN_TICKS}), {@link GameConfig.graze}, {@link GameConfig.deathBomb}
 * ({@link MAX_DEATH_BOMB_TICKS}, {@link DEFAULT_DEATH_BOMB_TICKS}) and
 * {@link GameConfig.blackHole}, all four offered as `UserOptions.play` rows — and the display
 * options {@link DisplayOptions.crtFilter} ({@link CRT_FILTERS}, {@link CrtFilter},
 * {@link CRT_MAX_HEIGHT}) and {@link DisplayOptions.aspect} ({@link ASPECT_MODES},
 * {@link AspectMode}).
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
 * {@link InputProfileChoice} (one entry of the Options screen's profile selector). Since M2-16 the
 * document also carries **sim-affecting** choices — the autofire mode and rate
 * ({@link InputOptions.autofire}, {@link InputOptions.autofireInterval}) and the game options
 * ({@link UserOptions.game}) — which never act on a World directly: the scene flow folds them into
 * the configs of the games it starts ({@link withUserGameOptions}), so a replay header records the
 * result and a World's hash never depends on the save.
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
 * **Controls and game options (M2-16).** {@link InputOptions} grew the controls the Options screen
 * sets — the autofire mode and rate (sim-affecting: applied to the next games' configs), the SOCD
 * policy and the remote's release debounce (the input adapter's) and the player's rebinding
 * ({@link BindingOverrides}: per profile and binding context, the keys of each rebound action) —
 * and {@link UserOptions.game} the game options (difficulty, lives, death penalty, Auto Power-Up,
 * pickup magnet, the one-button preset). The scene flow folds the sim-affecting ones into every
 * game's config with {@link withUserGameOptions} (a replay header records the result).
 *
 * @module
 */
import { ACTION_NAMES, type ActionName } from '../input/index.js';
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
    'shmup_feat.md §4',
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

/**
 * Highest {@link GameConfig.loop} (M3-01 — shmup_feat.md §15 "loops"): the rank's loop term reaches
 * its cap of 31 long before.
 */
export const MAX_LOOP = 8;

/**
 * Longest {@link GameConfig.timeLimit} in ticks (M3-01 — the caravan's clock; one hour at 60 Hz).
 */
export const MAX_TIME_LIMIT = 216_000;

/**
 * Most ships a game may start with (M3-01: {@link GameConfig.startingLives} reaches it through the
 * title's secret code — shmup_feat.md §15 "secret code for more"; the menus offer 1–5). Equal to
 * `core/scoring` `MAX_LIVES`.
 */
export const MAX_STARTING_LIVES = 9;

/**
 * Longest {@link GameConfig.deathBomb} window in ticks (M3-02 — shmup_feat.md §10 "[P2] death-bomb
 * window: bomb within a few frames after hit cancels death"; half a second at 60 Hz).
 */
export const MAX_DEATH_BOMB_TICKS = 30;

/**
 * On-screen objects a tick must carry before the **authentic slowdown** kicks in (M3-02 —
 * shmup_feat.md §3 "[P2] optional authentic slowdown: deterministic tick-skipping when on-screen
 * object load exceeds a threshold"): enemy bullets + lasers + enemies + boss parts + player shots +
 * items of the tick just simulated ({@link GameConfig.slowdown}).
 */
export const SLOWDOWN_THRESHOLD = 96;

/**
 * Ticks the authentic slowdown runs for every tick it skips (M3-02): 1 = the classic every-other
 * frame halving of the SNES.
 */
export const SLOWDOWN_RUN_TICKS = 1;

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

/**
 * How autofire fires (M2-16 — {@link GameConfig.autofireMode}): with no button, toggled by `Shot`
 * presses, or while `Shot` is held.
 */
export type AutofireMode = 'always' | 'toggle' | 'hold';

/** Every {@link AutofireMode}, in menu order (the Options screen's AUTOFIRE). */
export const AUTOFIRE_MODES: readonly AutofireMode[] = Object.freeze([
  'always',
  'toggle',
  'hold',
] as AutofireMode[]);

/**
 * The autofire rates the Options screen's RATE offers, as {@link GameConfig.autofireInterval}
 * ticks between main shots, slowest first: 8, 6, 5, 4 (the default — 15 shots a second), 3, 2
 * (M2-16).
 */
export const AUTOFIRE_INTERVALS: readonly number[] = Object.freeze([8, 6, 5, 4, 3, 2]);

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
  /**
   * Autofire on (remote play requires it): how it fires is {@link GameConfig.autofireMode}. `false`
   * = the main shot and the missiles fire only while `Shot` / `Sub` are held (the same as the
   * `'hold'` mode).
   */
  readonly autofire: boolean;
  /**
   * How autofire works (shmup_feat.md §4 "[P0] Autofire: hold-to-fire, toggle mode, configurable
   * rate"; M2-16 — the Options screen's AUTOFIRE): `'always'` (the default) fires with no button
   * held; `'toggle'` — each `Shot` press switches firing on / off (it starts on, per player, and
   * `Sub` held still fires the missiles); `'hold'` — fire while `Shot` (missiles: `Sub`) is held.
   * {@link GameConfig.remoteMode} forces `'always'` (the remote has no fire button); with
   * {@link GameConfig.autofire} `false` the mode is ignored (hold to fire).
   */
  readonly autofireMode: AutofireMode;
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
  /**
   * The loop the World plays (M3-01 — shmup_feat.md §15 "loops: 2nd loop with remixed layouts,
   * faster bullets, revenge bullets"; §16 "Loop 2 / Arcade mode"): 1 (the default) … {@link MAX_LOOP}.
   * From loop 2 the rank's loop term counts (`core/rank` — `8 × (loop − 1)`, the loop-1 cap of 16
   * lifted), enemy bullets fly faster (`core/rank` `loopBulletSpeedScale`), every regular enemy the
   * players shoot down fires a revenge bullet (its own `revenge` pattern, else an aimed one — at any
   * rank) and the stage plays its remixed timeline (events with `minLoop` / `maxLoop` — `core/data`
   * `StageEventBase`). The ARCADE mode's run moves on to the next loop after its final zone.
   */
  readonly loop: number;
  /**
   * The caravan's clock (M3-01 — shmup_feat.md §16 "score attack / caravan (time-limited)"): ticks
   * the World may play, 0 (the default: no limit) … {@link MAX_TIME_LIMIT}. When it runs out while
   * the stage is being played the World ends with `stageClear` and `World.timeUp`; a stage cleared
   * with time left pays `core/world` `CARAVAN_TIME_BONUS` points per second left.
   */
  readonly timeLimit: number;
  /**
   * The invincibility assist (M3-01 — shmup_feat.md §21 accessibility "[P2] invincibility assist"):
   * nothing hurts the ships (like the debug god mode, but a game option — recorded in the replay
   * header like everything here). A game played with it counts as **assisted** (its hi-score row and
   * replay are flagged). Default `false`.
   */
  readonly invincible: boolean;
  /**
   * Option recovery after death (M3-01 — shmup_feat.md §8 "[P2] Option recovery after death (Gradius
   * V style: options drift away and can be re-grabbed)"): the Options a death penalty takes drift
   * away from the wreck as grey items any ship can collect again (`core/powerups` freed Options).
   * Meter mode only (the Direct-mode ship has no Options). Default `false`.
   */
  readonly optionRecovery: boolean;
  /**
   * **Authentic slowdown** (M3-02 — shmup_feat.md §3 "[P2] optional authentic slowdown:
   * deterministic tick-skipping when on-screen object load exceeds a threshold (Gradius III SNES
   * feel)"): while a tick ends with more than {@link SLOWDOWN_THRESHOLD} live objects on screen the
   * World runs only every other tick (`core/world` — the skipped ticks behave like hit-stop:
   * phases 2–8 do not run). Computed from simulation state alone, so it is deterministic and
   * replays stay in sync. Default `false`.
   */
  readonly slowdown: boolean;
  /**
   * **Graze scoring** (M3-02 — shmup_feat.md §22 "[P2] graze detection (radius > hurtbox,
   * per-bullet grazed bit) if we add grazing score"): an enemy bullet that passes within
   * `core/bullets` `GRAZE_MARGIN` of a living ship without hitting it is *grazed* once (the
   * bullet's `BulletFlag.Grazed` bit) and pays the content's `ContentDb.scoring.graze` points.
   * Default `false`.
   */
  readonly graze: boolean;
  /**
   * The **death-bomb window** in ticks (M3-02 — shmup_feat.md §10 "[P2] death-bomb window (bomb
   * within a few frames after hit cancels death) — only if we include bombs"): a fatal hit on a
   * ship that still holds a bomb (`PlayerShip.bombs`, the Direct ship's black holes) does not kill
   * it at once — for this many ticks a Special press spends a bomb and cancels the death. 0 (the
   * default) = off; at most {@link MAX_DEATH_BOMB_TICKS}.
   */
  readonly deathBomb: number;
  /**
   * The **black-hole bomb** (M3-02 — shmup_feat.md §7C "[P2] modern series mechanics … black-hole
   * bomb (vortex pulls bullets/enemies, then lightning)"): the Direct-mode ship's signature
   * special. The stage's yellow item **stocks** a black hole (`core/blackhole`
   * `MAX_BLACK_HOLE_STOCK`) instead of detonating a smart bomb at once, and a Special press throws
   * one. Ignored in meter mode (whose Special steers the Options). Default `false`.
   */
  readonly blackHole: boolean;
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
  autofireMode: 'always',
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
  loop: 1,
  timeLimit: 0,
  invincible: false,
  optionRecovery: false,
  slowdown: false,
  graze: false,
  deathBomb: 0,
  blackHole: false,
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
 * `startingLives` 1–9, `aimDirections` a power of two in 4–1024, `autofireInterval` /
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
 * a {@link ShieldChoice} (M2-03), `optionChoice` an {@link OptionChoice} (M2-04),
 * `autofireMode` an {@link AutofireMode} (M2-16); M3-01: `loop` an integer 1–{@link MAX_LOOP},
 * `timeLimit` an integer 0–{@link MAX_TIME_LIMIT}, `invincible` / `optionRecovery` booleans, and
 * `startingLives` reaches {@link MAX_STARTING_LIVES} (the secret code's lives); M3-02: `slowdown` /
 * `graze` / `blackHole` booleans and `deathBomb` an integer 0–{@link MAX_DEATH_BOMB_TICKS}. Other
 * string presets
 * and booleans are not validated at runtime — the types cover them.
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
 *   `weaponEdit`, `megaChoice`, `shieldChoice`, `optionChoice` or `autofireMode` is malformed,
 *   `coop` is not a boolean or `coopExtra` is out of range.
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
  requireInteger('startingLives', config.startingLives, 1, MAX_STARTING_LIVES);
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
  requireInteger('loop', config.loop, 1, MAX_LOOP);
  requireInteger('timeLimit', config.timeLimit, 0, MAX_TIME_LIMIT);
  requireInteger('deathBomb', config.deathBomb, 0, MAX_DEATH_BOMB_TICKS);
  const coop: unknown = config.coop;
  if (typeof coop !== 'boolean') {
    throw new RangeError(`GameConfig.coop must be a boolean, got ${String(coop)}`);
  }
  for (const name of ['invincible', 'optionRecovery', 'slowdown', 'graze', 'blackHole'] as const) {
    const flag: unknown = config[name];
    if (typeof flag !== 'boolean') {
      throw new RangeError(`GameConfig.${name} must be a boolean, got ${String(flag)}`);
    }
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
  const autofireMode: unknown = config.autofireMode;
  if (AUTOFIRE_MODES.indexOf(autofireMode as AutofireMode) < 0) {
    throw new RangeError(
      `GameConfig.autofireMode must be one of ${AUTOFIRE_MODES.join(', ')}, got ${String(autofireMode)}`,
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

/**
 * How opposite directions held together resolve (shmup_feat.md §4 "[P1] SOCD resolution"): the
 * `@shmup/input-web` policies `neutral` (they cancel) and `lastWins` (the later press wins).
 */
export type SocdChoice = 'neutral' | 'lastWins';

/** Every {@link SocdChoice}, in menu order. */
export const SOCD_CHOICES: readonly SocdChoice[] = Object.freeze([
  'neutral',
  'lastWins',
] as SocdChoice[]);

/** Highest release debounce the Options screen's DEBOUNCE offers, in ticks (M2-16). */
export const MAX_DEBOUNCE_OPTION = 10;

/**
 * Shape of a **binding token** — one key or button of a rebound action (M2-16): `code:<code>` (a
 * `KeyboardEvent.code`, e.g. `code:KeyZ` — keyboards), `key:<keyCode>` (a legacy key code, e.g.
 * `key:13` — the TV remote) or `button:<index>` (a standard-mapping gamepad button 0–31).
 */
export const BINDING_TOKEN_PATTERN =
  /^(?:code:[A-Za-z][A-Za-z0-9]{0,31}|key:[1-9][0-9]{0,5}|button:(?:[0-9]|[12][0-9]|3[01]))$/;

/** Most profiles a save keeps binding overrides for (M2-16). */
export const MAX_BINDING_PROFILES = 16;

/** Most binding tokens one action keeps in an override (M2-16). */
export const MAX_ACTION_TOKENS = 4;

/**
 * One binding context's rebound actions (M2-16): action name (`core/input` `ActionName`) → the
 * binding tokens ({@link BINDING_TOKEN_PATTERN}) that trigger it — the action's whole key set in
 * that context, replacing the profile's.
 */
export type ContextBindingOverride = Readonly<Partial<Record<ActionName, readonly string[]>>>;

/** One input profile's rebound actions, per binding context (M2-16). */
export interface ProfileBindingOverride {
  /** The gameplay table's rebound actions (absent = the profile's own table). */
  readonly game?: ContextBindingOverride;
  /** The menu table's rebound actions (absent = the profile's own table). */
  readonly menu?: ContextBindingOverride;
}

/**
 * The player's rebinding (M2-16 — shmup_feat.md §4 "[P1] Rebinding per device … persistence"): the
 * overrides of each input profile, by profile id. A profile without an entry keeps its content
 * bindings.
 */
export type BindingOverrides = Readonly<Record<string, ProfileBindingOverride>>;

/** Input options (M1-17 — the profile; M2-16 — autofire, SOCD, debounce, rebinding). */
export interface InputOptions {
  /**
   * Id of the keyboard / remote input profile the player chose in the Options screen
   * (`content/input/`, e.g. `tizen-remote-safe`), or `null` for the platform's default.
   */
  readonly profileId: string | null;
  /**
   * AUTOFIRE (M2-16): the {@link GameConfig.autofireMode} of the next games, or `null` for the host
   * config's (always on). Sim-affecting — applied to the configs of the games the flow starts
   * ({@link withUserGameOptions}), so replays record it.
   */
  readonly autofire: AutofireMode | null;
  /**
   * RATE (M2-16): the {@link GameConfig.autofireInterval} of the next games (ticks between main
   * shots, 1–60 — the screen offers {@link AUTOFIRE_INTERVALS}), or `null` for the host config's.
   */
  readonly autofireInterval: number | null;
  /**
   * SOCD (M2-16): how opposite directions resolve on every input profile, or `null` for each
   * profile's own policy. Presentation-side (the input adapter), not recorded.
   */
  readonly socd: SocdChoice | null;
  /**
   * DEBOUNCE (M2-16, the advanced remote tuning): the release debounce of the keyboard / remote
   * profile in ticks, `0…`{@link MAX_DEBOUNCE_OPTION}, or `null` for the profile's own
   * (`tizen-remote-safe`: 2).
   */
  readonly releaseDebounce: number | null;
  /** Rebound keys and buttons, per input profile ({@link BindingOverrides}; M2-16). */
  readonly bindings: BindingOverrides;
}

/**
 * Game options (M2-16 — shmup_feat.md §21 "Game: difficulty, starting lives, death-penalty preset,
 * auto power-up"; §4 rule 4 / §21 accessibility "one-button play"). Sim-affecting: the flow applies
 * them to the configs of the games it starts ({@link withUserGameOptions}), so replays record the
 * result. `null` = the host config's (or the difficulty preset's) value.
 */
export interface UserGameOptions {
  /**
   * The difficulty preset the difficulty menu offers first — the last one chosen there (M2-01's
   * "saved with the options of M2-16"), or `null` for the host config's.
   */
  readonly difficulty: DifficultyPreset | null;
  /** Ships at game start, 1–5, replacing the preset's (`null` = the preset's). */
  readonly lives: number | null;
  /** The death penalty, replacing the preset's (`null` = the preset's). */
  readonly deathPenalty: DeathPenaltyPreset | null;
  /** Auto Power-Up (decision D2), or `null` for the host config's / the weapon select's. */
  readonly autoPowerUp: boolean | null;
  /** The pickup magnet (decision D33), or `null` for the host config's (on). */
  readonly pickupMagnet: boolean | null;
  /**
   * The **one-button preset** (M2-16): autofire always on, Auto Power-Up on and the casual death
   * penalty, whatever the other options say — a game played with the directions alone.
   */
  readonly oneButton: boolean;
}

/** Game options that change nothing: every field `null`, the one-button preset off. */
export const DEFAULT_USER_GAME_OPTIONS: UserGameOptions = Object.freeze({
  difficulty: null,
  lives: null,
  deathPenalty: null,
  autoPowerUp: null,
  pickupMagnet: null,
  oneButton: false,
});

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
 * The CRT / scanline filter (M3-02, shmup_feat.md §18 "[P2] CRT / scanline filter: Off / Light /
 * Full (cap output to 1080p on TV for cost)"): `off` (the default), `light` (scanlines only) and
 * `full` (scanlines, an aperture-grille mask and a vignette). `render-pixi` `effects`
 * ({@link CRT_LOOKS}) runs it over the **upscaled** frame in the second pass, at most
 * {@link CRT_MAX_HEIGHT} rows on a TV.
 */
export const CRT_FILTERS = Object.freeze(['off', 'light', 'full'] as const);

/** One of {@link CRT_FILTERS}. */
export type CrtFilter = (typeof CRT_FILTERS)[number];

/**
 * Display rows the CRT filter is computed at, at most (shmup_feat.md §18 "cap output to 1080p on
 * TV"): a 4K TV still pays for a 1080p filter pass, the result scaled up by the canvas.
 */
export const CRT_MAX_HEIGHT = 1080;

/**
 * How the frame's picture is shaped on the display (M3-02, shmup_feat.md §18 "[P2] widescreen
 * Darius-style ultra-wide mode for desktop" and §3 "classic 4:3 mode with pillarbox side art"):
 *
 * - `normal` (the default) — the frame fills the display as {@link DisplayOptions.scaleMode} says;
 *   what is left over is plain letterbox.
 * - `wide` — **ultra-wide desktop**: the frame keeps the same picture but the space beside it is
 *   filled with **side panels** (a dimmed extension of the stage's backdrop) instead of black, so a
 *   21:9 monitor shows a Darius-style wide cabinet rather than two black bars.
 * - `classic` — **4:3 pillarbox**: the frame is confined to the largest 4:3 window of the display
 *   (the picture is never cropped — it is letterboxed inside that window) and the rest of the width
 *   becomes side panels, the console look on a widescreen TV.
 *
 * Presentation only: the playfield stays 384×216 in every mode, so the simulation never changes.
 */
export const ASPECT_MODES = Object.freeze(['normal', 'wide', 'classic'] as const);

/** One of {@link ASPECT_MODES}. */
export type AspectMode = (typeof ASPECT_MODES)[number];

/**
 * Display options (presentation only). M2-02 brought the bullet palette, M2-08 the scale mode, the
 * screen-shake switch, reduced flashing and the hitbox marker, M2-09 the boss HP bar.
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
  /**
   * Show the boss HP bar in the top HUD bar during boss fights (default `false` — neither source
   * game had one; M2-09, shmup_feat.md §13).
   */
  readonly bossHpBar: boolean;
  /**
   * The CRT / scanline filter ({@link CRT_FILTERS}; default `off`; M3-02). Costs one full-screen
   * pass over the upscaled frame, capped at {@link CRT_MAX_HEIGHT} rows.
   */
  readonly crtFilter: CrtFilter;
  /** How the picture is shaped on the display ({@link ASPECT_MODES}; default `normal`; M3-02). */
  readonly aspect: AspectMode;
}

/**
 * The game-speed assist's choices (M3-01 — shmup_feat.md §21 accessibility "[P2] game-speed assist
 * (e.g. 75%)"): percent of the normal speed, normal first.
 */
export const GAME_SPEEDS: readonly number[] = Object.freeze([100, 75, 50]);

/**
 * Assists and feel (M3-01 — shmup_feat.md §21 accessibility "[P2] game-speed assist,
 * invincibility assist — both flag scores/replays as assisted", §8 "[P2] option recovery after
 * death", §4 "[P2] rumble"): the GAME page's SPEED / INVINCIBLE / OPT RECOVERY rows and the CONTROLS
 * page's RUMBLE. The invincibility assist and option recovery are sim-affecting (folded into the
 * next games' configs by {@link withUserGameOptions}); the game speed only slows the clock that
 * feeds the fixed step (`core/game` — every tick still runs whole, so replays are unaffected) and
 * marks the game's score and replay as assisted; rumble is the host's.
 */
export interface PlayOptions {
  /** SPEED: the game's speed in percent — one of {@link GAME_SPEEDS} (100 = normal). */
  readonly speed: number;
  /** INVINCIBLE: the invincibility assist ({@link GameConfig.invincible}) of the next games. */
  readonly invincible: boolean;
  /**
   * OPT RECOVERY: {@link GameConfig.optionRecovery} of the next games, or `null` for the host
   * config's (off).
   */
  readonly optionRecovery: boolean | null;
  /** RUMBLE: gamepads rumble on deaths and boss blasts (`vibrationActuator`; default on). */
  readonly rumble: boolean;
  /** SLOWDOWN: {@link GameConfig.slowdown} of the next games (M3-02; default off). */
  readonly slowdown: boolean;
  /** GRAZE: {@link GameConfig.graze} of the next games (M3-02; default off). */
  readonly graze: boolean;
  /**
   * DEATH BOMB: turns on {@link GameConfig.deathBomb} for the next games (M3-02) — the window is
   * {@link DEFAULT_DEATH_BOMB_TICKS} ticks. Default off.
   */
  readonly deathBomb: boolean;
  /** BLACK HOLE: {@link GameConfig.blackHole} of the next games (M3-02; default off). */
  readonly blackHole: boolean;
}

/**
 * The death-bomb window the DEATH BOMB option asks for, in ticks (M3-02): eight ticks — a touch
 * over an eighth of a second, the classic "one blink" reaction window.
 */
export const DEFAULT_DEATH_BOMB_TICKS = 8;

/** Assists off, the normal speed, rumble on, every M3-02 extra off. */
export const DEFAULT_PLAY_OPTIONS: PlayOptions = Object.freeze({
  speed: 100,
  invincible: false,
  optionRecovery: null,
  rumble: true,
  slowdown: false,
  graze: false,
  deathBomb: false,
  blackHole: false,
});

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
  /**
   * Game (M2-16): difficulty, lives, death penalty, Auto Power-Up, the pickup magnet, the
   * one-button preset — sim-affecting choices the flow folds into the next games' configs.
   */
  readonly game: UserGameOptions;
  /** Assists and feel (M3-01): game speed, invincibility, option recovery, rumble. */
  readonly play: PlayOptions;
}

/**
 * Defaults: every volume at full level (the mix the audio content was made for), no profile, the
 * profiles' own tuning and bindings, the host config's game settings.
 */
export const DEFAULT_USER_OPTIONS: UserOptions = Object.freeze({
  audio: Object.freeze({ master: VOLUME_LEVELS, music: VOLUME_LEVELS, sfx: VOLUME_LEVELS }),
  input: Object.freeze({
    profileId: null,
    autofire: null,
    autofireInterval: null,
    socd: null,
    releaseDebounce: null,
    bindings: Object.freeze({}),
  }),
  game: DEFAULT_USER_GAME_OPTIONS,
  display: Object.freeze({
    bulletPalette: 'standard',
    scaleMode: 'integer',
    screenShake: true,
    reduceFlashing: false,
    showHitbox: false,
    bossHpBar: false,
    crtFilter: 'off',
    aspect: 'normal',
  }),
  play: DEFAULT_PLAY_OPTIONS,
});

/** Shape of an input profile id (lower-case kebab, as `content/input/` requires), ≤ 64 characters. */
export const INPUT_PROFILE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Input profiles that no longer ship, and what a save that names one is migrated to (M3-02b).
 *
 * @remarks
 * `tizen-remote-diagonal` ("FAST 8-WAY") only differed from the TV default by its release
 * debounce; the 2026-09-15 input probe showed the remote cannot send diagonals at all and needs
 * no debounce, so the two profiles became one and a save that picked the retired id resolves to
 * the remaining remote profile (`docs/dev/input-probe-results.md` findings 1–2).
 */
export const RETIRED_INPUT_PROFILE_IDS: Readonly<Record<string, string>> = Object.freeze({
  'tizen-remote-diagonal': 'tizen-remote-safe',
});

/**
 * Migrates a saved input profile id (M3-02b): a retired id becomes its replacement, every other
 * id is returned unchanged.
 *
 * @param id - The id as saved.
 * @returns The id to use.
 *
 * @example
 * ```ts
 * migrateInputProfileId('tizen-remote-diagonal'); // → 'tizen-remote-safe'
 * ```
 */
export function migrateInputProfileId(id: string): string {
  // Own keys only: a plain object literal also answers to `constructor` and friends, and
  // `constructor` passes INPUT_PROFILE_ID_PATTERN (`Object.hasOwn` is banned for Chromium 69).
  if (!Object.prototype.hasOwnProperty.call(RETIRED_INPUT_PROFILE_IDS, id)) return id;
  const next = RETIRED_INPUT_PROFILE_IDS[id];
  return typeof next === 'string' ? next : id;
}

/** One entry of the Options screen's CONTROLS selector: a keyboard / remote input profile. */
export interface InputProfileChoice {
  /** Profile id (`content/input/`). */
  readonly id: string;
  /** Text shown in the selector (upper case, e.g. `REMOTE (DEFAULT)`). */
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
 * characters, else `null` — a retired id is migrated ({@link migrateInputProfileId}, M3-02b).
 * `display.bulletPalette`: one of {@link BULLET_PALETTES}, else
 * `standard`; `display.scaleMode`: one of {@link SCALE_MODES}, else `integer` (M2-08);
 * `display.screenShake`, `reduceFlashing`, `showHitbox` and `bossHpBar` (M2-09): booleans, else
 * their defaults (M2-08 — a save written before them resolves without a migration; unknown display
 * fields are dropped).
 * Whether the profile id names an existing profile is the host's business (an unknown one is
 * skipped when applied).
 *
 * M2-16: `input.autofire` an {@link AutofireMode}, `input.autofireInterval` an integer 1–60,
 * `input.socd` a {@link SocdChoice}, `input.releaseDebounce` an integer
 * `0…`{@link MAX_DEBOUNCE_OPTION} — each else `null`; `input.bindings` through
 * {@link resolveBindingOverrides}; `game.difficulty` a {@link DifficultyPreset}, `game.lives` an
 * integer 1–5, `game.deathPenalty` a {@link DeathPenaltyPreset}, `game.autoPowerUp` /
 * `game.pickupMagnet` booleans — each else `null`; `game.oneButton` a boolean, else `false`.
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
  const game = isRecord(root.game) ? root.game : {};
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
        typeof id === 'string' && id.length <= 64 && INPUT_PROFILE_ID_PATTERN.test(id)
          ? migrateInputProfileId(id)
          : null,
      autofire: oneOf(input.autofire, AUTOFIRE_MODES),
      autofireInterval: wholeOrNull(input.autofireInterval, 1, 60),
      socd: oneOf(input.socd, SOCD_CHOICES),
      releaseDebounce: wholeOrNull(input.releaseDebounce, 0, MAX_DEBOUNCE_OPTION),
      bindings: resolveBindingOverrides(input.bindings),
    }),
    game: Object.freeze({
      difficulty: oneOf(game.difficulty, DIFFICULTY_PRESETS),
      lives: wholeOrNull(game.lives, 1, 5),
      deathPenalty: oneOf(game.deathPenalty, DEATH_PENALTY_PRESETS),
      autoPowerUp: typeof game.autoPowerUp === 'boolean' ? game.autoPowerUp : null,
      pickupMagnet: typeof game.pickupMagnet === 'boolean' ? game.pickupMagnet : null,
      oneButton: game.oneButton === true,
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
      bossHpBar: typeof display.bossHpBar === 'boolean' ? display.bossHpBar : dd.bossHpBar,
      crtFilter: oneOf(display.crtFilter, CRT_FILTERS) ?? dd.crtFilter,
      aspect: oneOf(display.aspect, ASPECT_MODES) ?? dd.aspect,
    }),
    play: resolvePlayOptions(root.play),
  });
}

/**
 * Reads the assists and feel (M3-01) defensively.
 *
 * @param value - Anything (`options.play` of a save).
 * @returns Frozen options: `speed` one of {@link GAME_SPEEDS} (else 100), `invincible` / `rumble`
 *   booleans (else their defaults), `optionRecovery` a boolean or `null`.
 */
function resolvePlayOptions(value: unknown): PlayOptions {
  const play = isRecord(value) ? value : {};
  const d = DEFAULT_PLAY_OPTIONS;
  const speed = play.speed;
  return Object.freeze({
    speed: typeof speed === 'number' && GAME_SPEEDS.indexOf(speed) >= 0 ? speed : d.speed,
    invincible: typeof play.invincible === 'boolean' ? play.invincible : d.invincible,
    optionRecovery: typeof play.optionRecovery === 'boolean' ? play.optionRecovery : null,
    rumble: typeof play.rumble === 'boolean' ? play.rumble : d.rumble,
    slowdown: typeof play.slowdown === 'boolean' ? play.slowdown : d.slowdown,
    graze: typeof play.graze === 'boolean' ? play.graze : d.graze,
    deathBomb: typeof play.deathBomb === 'boolean' ? play.deathBomb : d.deathBomb,
    blackHole: typeof play.blackHole === 'boolean' ? play.blackHole : d.blackHole,
  });
}

/**
 * Reads a value that must be one of a list.
 *
 * @param value - Anything.
 * @param list - The allowed values.
 * @returns The value, or `null` when it is not in the list.
 */
function oneOf<T extends string>(value: unknown, list: readonly T[]): T | null {
  return typeof value === 'string' && (list as readonly string[]).indexOf(value) >= 0
    ? (value as T)
    : null;
}

/**
 * Reads a whole number within a range.
 *
 * @param value - Anything.
 * @param min - Smallest allowed value.
 * @param max - Largest allowed value.
 * @returns The number, or `null` when it is not an integer in `min…max` (a `-0` reads as 0).
 */
function wholeOrNull(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  // `value <= 0` turns a stored -0 into 0 (V8 boxes -0 like a fraction).
  return value <= 0 ? 0 : value;
}

/**
 * Reads one binding context's overrides defensively.
 *
 * @param value - Anything (`{ [actionName]: token[] }`).
 * @returns The valid entries (known action names, valid tokens without duplicates, at most
 *   {@link MAX_ACTION_TOKENS} each; an action with no valid token is kept as an empty list — the
 *   action is unbound), or `null` when nothing is usable.
 */
function resolveContextOverride(value: unknown): ContextBindingOverride | null {
  if (!isRecord(value)) return null;
  const out: Partial<Record<ActionName, readonly string[]>> = {};
  let count = 0;
  for (const name of ACTION_NAMES) {
    const list = value[name];
    if (!Array.isArray(list)) continue;
    const tokens: string[] = [];
    for (const token of list as unknown[]) {
      if (typeof token !== 'string' || !BINDING_TOKEN_PATTERN.test(token)) continue;
      if (tokens.indexOf(token) >= 0 || tokens.length >= MAX_ACTION_TOKENS) continue;
      tokens.push(token);
    }
    out[name] = Object.freeze(tokens);
    count++;
  }
  return count === 0 ? null : Object.freeze(out);
}

/**
 * Builds valid {@link BindingOverrides} from anything (a parsed save) — never throws.
 *
 * @remarks
 * Keeps at most {@link MAX_BINDING_PROFILES} profiles (in key order) whose id matches
 * {@link INPUT_PROFILE_ID_PATTERN} (≤ 64 characters); per profile the `game` and `menu` contexts,
 * each `{ [actionName]: token[] }` with known action names (`core/input` `ACTION_NAMES`) and tokens
 * matching {@link BINDING_TOKEN_PATTERN} (duplicates dropped, at most {@link MAX_ACTION_TOKENS}).
 * Whether a profile or a key exists is the host's business (`@shmup/input-web` applies what it
 * can). Unknown fields are dropped; a profile left without a context is dropped.
 *
 * @param value - Candidate overrides.
 * @returns Frozen overrides (an empty object for anything unusable).
 *
 * @example
 * ```ts
 * resolveBindingOverrides({ 'keyboard-default': { game: { Shot: ['code:KeyJ'] } } });
 * ```
 */
export function resolveBindingOverrides(value: unknown): BindingOverrides {
  const out: Record<string, ProfileBindingOverride> = {};
  if (!isRecord(value)) return Object.freeze(out);
  let count = 0;
  for (const id of Object.keys(value).sort()) {
    if (count >= MAX_BINDING_PROFILES) break;
    if (id.length > 64 || !INPUT_PROFILE_ID_PATTERN.test(id)) continue;
    const entry = value[id];
    if (!isRecord(entry)) continue;
    const game = resolveContextOverride(entry.game);
    const menu = resolveContextOverride(entry.menu);
    if (game === null && menu === null) continue;
    const profile: { game?: ContextBindingOverride; menu?: ContextBindingOverride } = {};
    if (game !== null) profile.game = game;
    if (menu !== null) profile.menu = menu;
    out[id] = Object.freeze(profile);
    count++;
  }
  return Object.freeze(out);
}

/**
 * The {@link GameConfig} fields the saved options set (M2-16): the game options' lives, death
 * penalty, Auto Power-Up and pickup magnet, the controls' autofire mode and rate — and the
 * one-button preset over them (autofire always on, Auto Power-Up, the casual penalty).
 *
 * @param options - The player's options.
 * @returns Only the fields the options set (`null` options set nothing; a fresh object).
 */
export function userGameOverrides(options: UserOptions): Partial<GameConfig> {
  const game = options.game;
  const input = options.input;
  const out: {
    -readonly [K in keyof GameConfig]?: GameConfig[K];
  } = {};
  if (game.lives !== null) out.startingLives = game.lives;
  if (game.deathPenalty !== null) out.deathPenalty = game.deathPenalty;
  if (game.autoPowerUp !== null) out.autoPowerUp = game.autoPowerUp;
  if (game.pickupMagnet !== null) out.pickupMagnet = game.pickupMagnet;
  if (input.autofire !== null) out.autofireMode = input.autofire;
  if (input.autofireInterval !== null) out.autofireInterval = input.autofireInterval;
  // M3-01: the assists that change what a tick does (the game speed does not).
  const play = options.play;
  if (play !== undefined) {
    if (play.invincible) out.invincible = true;
    if (play.optionRecovery !== null) out.optionRecovery = play.optionRecovery;
    // M3-02: the visual & mechanic extras that change what a tick does.
    if (play.slowdown) out.slowdown = true;
    if (play.graze) out.graze = true;
    if (play.deathBomb) out.deathBomb = DEFAULT_DEATH_BOMB_TICKS;
    if (play.blackHole) out.blackHole = true;
  }
  if (game.oneButton) {
    out.autofire = true;
    out.autofireMode = 'always';
    out.autoPowerUp = true;
    out.deathPenalty = 'casual';
  }
  return out;
}

/**
 * Applies the player's sim-affecting options to a resolved config (M2-16 — what every game the
 * scene flow starts gets): {@link userGameOverrides}; everything else stays.
 *
 * @param config - A resolved config (a difficulty's, with the loadout and ship chosen).
 * @param options - The player's options (`core/save` `SaveStore.options`).
 * @returns A frozen, validated config — the same object when the options change nothing.
 * @throws RangeError when the result fails {@link resolveGameConfig} (never for resolved options).
 *
 * @example
 * ```ts
 * const options = resolveUserOptions({ game: { lives: 5, oneButton: true } });
 * withUserGameOptions(resolveGameConfig(), options).deathPenalty; // → 'casual'
 * ```
 */
export function withUserGameOptions(config: GameConfig, options: UserOptions): GameConfig {
  const overrides = userGameOverrides(options);
  const source = overrides as Readonly<Record<string, unknown>>;
  const own = config as unknown as Readonly<Record<string, unknown>>;
  let changed = false;
  for (const key of Object.keys(source)) if (source[key] !== own[key]) changed = true;
  if (!changed) return config;
  return resolveGameConfig({ ...config, ...overrides });
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
