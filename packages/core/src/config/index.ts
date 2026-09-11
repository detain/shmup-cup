/**
 * # config — game configuration and option presets
 *
 * **Responsibility.** The typed {@link GameConfig} that parameterises a run: internal
 * resolution, tick rate, seed and every *sim-affecting* option (difficulty, power-up
 * model, death penalty, lives, autofire and its intervals, remote mode, the stage, the starting
 * loadout, Auto Power-Up and its order, the pickup magnet). Everything here is copied into replay
 * headers, so it must stay plain serialisable data.
 *
 * **Implements.**
 * - shmup_feat.md §2 (design forks: Meter vs Direct, death-penalty presets, difficulty)
 * - shmup_feat.md §3 (384×216 internal resolution, 60 Hz fixed step, max ticks/frame)
 * - shmup_feat.md §15 (lives 1–5), §21 Options menu (sim-affecting subset)
 * - shmup_feat.md §6 (Meter mode by default — decision D1; Auto Power-Up — D2; the pickup
 *   magnet — D33)
 *
 * **Public API (implemented now).** {@link GameConfig}, {@link DEFAULT_GAME_CONFIG},
 * {@link resolveGameConfig}, the preset types ({@link StartingLoadout} …), the power-meter slot
 * names ({@link MeterSlotName}, {@link METER_SLOT_NAMES}, {@link DEFAULT_AUTO_POWER_UP_ORDER},
 * {@link MAX_AUTO_POWER_UP_ORDER}) and the screen layout
 * constants {@link HUD_BAR_HEIGHT}, {@link PLAYFIELD_Y}, {@link PLAYFIELD_W}, {@link PLAYFIELD_H}
 * (decision D20: two 8-px HUD bars outside a 384×200 playfield).
 *
 * **Planned API.** `UserOptions` (audio/display/controls options that do *not* affect
 * the sim, persisted by `save`), difficulty-preset tables mapping to rank base/growth,
 * lives and extend thresholds (shmup_feat.md §15 [P1]).
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
  ],
});

/** Power-up model: Gradius-style meter or Darius-style direct items (shmup_feat.md §6). */
export type PowerUpMode = 'meter' | 'direct';

/** What a death costs (shmup_feat.md §10). */
export type DeathPenaltyPreset = 'arcade' | 'classic' | 'casual';

/** Difficulty presets (shmup_feat.md §15). */
export type DifficultyPreset = 'easy' | 'normal' | 'hard' | 'arcade';

/** Starting loadouts of {@link GameConfig.loadout}. */
export type StartingLoadout = 'default' | 'full';

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
  /** Difficulty preset (drives rank base/growth, lives and extends in later steps). */
  readonly difficulty: DifficultyPreset;
  /**
   * Power-up model: `'meter'` (Gradius-style bar, the default — decision D1) or `'direct'`
   * (Darius-style items — rejected by {@link resolveGameConfig} until M2-05 implements it).
   */
  readonly powerUpMode: PowerUpMode;
  /** How much power a death costs (shmup_feat.md §10). */
  readonly deathPenalty: DeathPenaltyPreset;
  /** Lives at game start (1–5). */
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
   * Directions aimed enemy shots snap to (decision D17: 32 on Normal for the retro feel, 16
   * planned for Easy). A power of two from 4 to 1024 (the binary-angle circle).
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

/** Defaults: remote-first, Normal difficulty, the power meter, Classic death penalty. */
export const DEFAULT_GAME_CONFIG: GameConfig = Object.freeze({
  internalWidth: 384,
  internalHeight: 216,
  tickRate: 60,
  maxTicksPerFrame: 4,
  seed: 0x5eedc0de,
  difficulty: 'normal',
  powerUpMode: 'meter',
  deathPenalty: 'classic',
  startingLives: 3,
  autofire: true,
  remoteMode: true,
  stage: null,
  aimDirections: 32,
  autofireInterval: 4,
  missileInterval: 10,
  loadout: 'default',
  autoPowerUp: false,
  autoPowerUpOrder: DEFAULT_AUTO_POWER_UP_ORDER,
  pickupMagnet: true,
});

/**
 * Merges overrides onto {@link DEFAULT_GAME_CONFIG} and validates the result.
 *
 * @remarks
 * Validated ranges (all integers, inclusive): `internalWidth` / `internalHeight`
 * 16–4096, `tickRate` 1–1000, `maxTicksPerFrame` 1–60, `seed` 0–0xFFFFFFFF,
 * `startingLives` 1–5, `aimDirections` a power of two in 4–1024, `autofireInterval` /
 * `missileInterval` 1–60. `stage` must be `null` or a non-empty string (whether the id exists is
 * checked by `createWorld` against the content); `loadout` must be `'default'` or `'full'`;
 * `powerUpMode` must be `'meter'` (`'direct'` is not implemented until M2-05);
 * `autoPowerUpOrder` must be an array of at most {@link MAX_AUTO_POWER_UP_ORDER}
 * {@link MeterSlotName}s — the result holds a frozen copy of it. Other string presets and
 * booleans are not validated at runtime — the types cover them.
 *
 * @param overrides - Fields to change.
 * @returns A frozen, validated config.
 * @throws RangeError when a numeric field is not an integer or is out of range,
 *   `aimDirections` is not a power of two, `stage` is neither `null` nor a non-empty string,
 *   `loadout` is not a {@link StartingLoadout}, `powerUpMode` is not `'meter'`, or
 *   `autoPowerUpOrder` is not an array of meter slot names (or is too long).
 *
 * @example
 * ```ts
 * const config = resolveGameConfig({ seed: 42, startingLives: 5 });
 * resolveGameConfig({ tickRate: 0 }); // throws RangeError
 * ```
 */
export function resolveGameConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  const config: GameConfig = { ...DEFAULT_GAME_CONFIG, ...overrides };
  requireInteger('internalWidth', config.internalWidth, 16, 4096);
  requireInteger('internalHeight', config.internalHeight, 16, 4096);
  requireInteger('tickRate', config.tickRate, 1, 1000);
  requireInteger('maxTicksPerFrame', config.maxTicksPerFrame, 1, 60);
  requireInteger('seed', config.seed, 0, 0xffffffff);
  requireInteger('startingLives', config.startingLives, 1, 5);
  requireInteger('aimDirections', config.aimDirections, 4, 1024);
  requireInteger('autofireInterval', config.autofireInterval, 1, 60);
  requireInteger('missileInterval', config.missileInterval, 1, 60);
  if ((config.aimDirections & (config.aimDirections - 1)) !== 0) {
    throw new RangeError(
      `GameConfig.aimDirections must be a power of two, got ${config.aimDirections}`,
    );
  }
  const stage: unknown = config.stage;
  if (stage !== null && (typeof stage !== 'string' || stage === '')) {
    throw new RangeError(
      `GameConfig.stage must be null or a non-empty stage id, got ${typeof stage === 'string' ? '""' : typeof stage}`,
    );
  }
  const loadout: unknown = config.loadout;
  if (loadout !== 'default' && loadout !== 'full') {
    throw new RangeError(`GameConfig.loadout must be 'default' or 'full', got ${String(loadout)}`);
  }
  const mode: unknown = config.powerUpMode;
  if (mode === 'direct') {
    throw new RangeError("GameConfig.powerUpMode 'direct' is not implemented until M2-05");
  }
  if (mode !== 'meter') {
    throw new RangeError(`GameConfig.powerUpMode must be 'meter' or 'direct', got ${String(mode)}`);
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
  const resolved: GameConfig = {
    ...config,
    autoPowerUpOrder:
      order === DEFAULT_AUTO_POWER_UP_ORDER
        ? DEFAULT_AUTO_POWER_UP_ORDER
        : Object.freeze((order as MeterSlotName[]).slice()),
  };
  return Object.freeze(resolved);
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
