/**
 * # player — player ship
 *
 * **Status: implemented** for P0: movement, speed levels, clamping to the camera view, banking and
 * the fly-in (plan M1-06), hits (M1-07 … M1-11) and the life cycle — death, dead time, respawn
 * with invulnerability and lives (M1-12). Co-op (M2-06): player 2's ship joins a running co-op
 * game — and a ship out of lives comes back with a continue — through `core/world` `joinPlayer`,
 * which activates the slot and flies it in with {@link respawnPlayer} (a blinking fly-in).
 *
 * **Responsibility.** The player ship: 8-way movement with no inertia, speed levels (meter Speed
 * Ups or the Direct-mode Speed toggle), a tiny centred hurtbox plus a separate terrain box,
 * clamping to the playfield, terrain kills (unless shielded), respawn invincibility,
 * launch / fly-out animations and the death sequence (hit-stop, bullet cancel, life loss,
 * death-penalty preset). Supports up to two ships for co-op.
 *
 * **Movement rules (M1-06).**
 * - Direction bits → a unit step per axis (`Left`+`Right` or `Up`+`Down` cancel — SOCD
 *   neutral, although the input adapters already resolve SOCD per profile).
 * - Diagonals are **normalised**: each axis × {@link DIAGONAL_SCALE} (0.7071, decision D4), so
 *   8-way devices never out-dodge the 4-way remote.
 * - Speed = `spec.speeds[speedLevel]` px/tick (decision D3, `content/player/*.player.json`); no
 *   inertia — the ship stops the tick the input stops.
 * - The ship rides along with the camera (`x += camera.dx`, `y += camera.dy` before input), then
 *   is clamped to the camera view minus `spec.margins` (world-space coordinates, D26).
 * - The bank frame follows the vertical intent, one bank step per tick up to `spec.bankFrames`.
 * - `entering` / `respawning`: an uncontrollable `spec.enterTicks`-tick fly-in from the left edge
 *   ({@link ENTER_START_X} → {@link ENTER_END_X}, camera-relative, cubic ease-out), then `alive`.
 *
 * **Hits (M1-07).** {@link playerHit} is the single entry point for anything that would kill the
 * ship (terrain, enemy contact, bullets, lasers). It records the hit on the ship (`hitCause`,
 * `hitTick`, `hits`); the World turns a hit recorded during a tick into the death sequence in
 * that tick's damage phase (M1-12, below). Ships that are not `alive`, still invulnerable, or
 * protected by the debug god mode ignore hits.
 *
 * **Life cycle (M1-12, shmup_feat.md §10).**
 * `entering` (stage start fly-in) → `alive` → hit → `dying` ({@link PLAYER_DYING_TICKS}: the
 * explosion; {@link killPlayer} takes a life) → `dead` ({@link PLAYER_DEAD_TICKS}) → with a ship
 * left the World respawns it ({@link respawnPlayer}: `respawning`, a fly-in like `entering`) →
 * `alive`, invulnerable for `spec.respawnInvulnTicks` (150 for the KESTREL) ticks counted from the
 * tick control returns — it blinks from the start of the fly-in and may fire. A ship whose dead
 * time ends without lives stays `dead` for good ({@link playerOut}). `lives` counts the ships
 * including the one in play: the HUD shows `lives − 1` in stock. The death sequence's effects
 * (explosion events, hit-stop, bullet cancel, the death penalty) and the respawn decision are
 * the World's (`core/world`).
 *
 * **Shields (M1-11).** Every ship carries its {@link PlayerShip.shield} (`core/shields`); a hit
 * goes to the shield first (`absorbShieldHit`): an absorbed hit is accepted — the bullet is used
 * up — but never recorded on the ship. The Force Field does not absorb terrain; the Direct-mode
 * Arm (M2-05) does.
 *
 * **Ships (M2-05).** The content may hold several ships (`content/player/`): the World flies
 * `GameConfig.shipId` ({@link resolvePlayerShip}; the ship select sets it). A ship's `mode` names
 * its power-up model — the KESTREL `meter`, the MANTA `direct` — and `startSpeedLevel` the speed
 * level a Direct-mode session starts at (the MANTA: 2.25 of 1.75 / 2.25 / 2.75 px/tick, decision
 * D3); in Direct mode `core/powerups` steps {@link PlayerShip.speedLevel} with the Speed toggle
 * (remote Ch−), wrapping, instead of the meter's Speed Ups. Movement reads the level the same way
 * in both modes.
 *
 * **Implements.**
 * - shmup_feat.md §5 Player ship
 * - shmup_feat.md §10 Death, respawn & checkpoints
 * - shmup_feat.md §16 2-player simultaneous co-op — player 2's ship in slot 1, with its own lives
 *   and shield (M2-06; joining, leaving and continuing are `core/world`'s)
 *
 * **Public API.** {@link PlayerShip}, {@link PlayerState}, {@link PLAYER_STATES},
 * {@link PlayerIntent}, {@link PlayerCamera}, {@link createPlayer}, {@link createPlayerIntent},
 * {@link readPlayerIntent}, {@link spawnPlayer}, {@link setPlayerState}, {@link updatePlayer},
 * {@link playerBankFrame}, {@link resolvePlayerShip}, {@link DEFAULT_PLAYER_SHIP},
 * {@link DIAGONAL_SCALE}, {@link ENTER_START_X}, {@link ENTER_END_X}, {@link SPAWN_Y},
 * {@link playerHit}, {@link PlayerHitCause}, {@link PLAYER_HIT_CAUSE_NAMES}, {@link killPlayer},
 * {@link respawnPlayer}, {@link playerOut}, {@link PLAYER_DYING_TICKS}, {@link PLAYER_DEAD_TICKS}.
 *
 * **Planned API.** None (joining co-op mid-game and the per-player continues live in
 * `core/world`: `joinPlayer`, `continueWorld` — M2-01 / M2-06).
 *
 * @module
 */
import { PLAYFIELD_H, PLAYFIELD_W } from '../config/index.js';
import type { ContentDb, PlayerShipSpec } from '../data/index.js';
import { Action, type InputDeviceKind, type PlayerInput } from '../input/index.js';
import { defineModule } from '../module-info.js';
import type { CameraView } from '../presentation/index.js';
import type { DebugFlags } from '../debug/index.js';
import {
  ShieldHit,
  absorbShieldHit,
  createShieldState,
  type ShieldState,
} from '../shields/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'player',
  status: 'implemented',
  specRefs: ['shmup_feat.md §5', 'shmup_feat.md §10', 'shmup_feat.md §16'],
});

/** Life-cycle state of a ship (see the module docs' life cycle). */
export type PlayerState = 'entering' | 'alive' | 'dying' | 'dead' | 'respawning';

/** Every {@link PlayerState}, in a fixed order (the index is the state's code in state hashes). */
export const PLAYER_STATES: readonly PlayerState[] = Object.freeze([
  'entering',
  'alive',
  'dying',
  'dead',
  'respawning',
] as PlayerState[]);

/**
 * Per-axis factor applied to diagonal movement (decision D4: diagonals are normalised with a
 * constant, not a square root).
 */
export const DIAGONAL_SCALE = 0.7071;

/** Camera-relative x where the fly-in starts (the ship is off-screen to the left). */
export const ENTER_START_X = -24;

/** Camera-relative x where the fly-in ends and control starts. */
export const ENTER_END_X = 64;

/** Camera-relative y of a fresh spawn: the middle of the playfield. */
export const SPAWN_Y = PLAYFIELD_H / 2;

/**
 * Ticks a ship spends `dying` (its explosion) before it is `dead` — counted by
 * {@link updatePlayer}, so the death's hit-stop comes on top.
 */
export const PLAYER_DYING_TICKS = 24;

/** Ticks a ship stays `dead` before the World respawns it (plan M1-12). */
export const PLAYER_DEAD_TICKS = 60;

/** Runtime state of one player ship. */
export interface PlayerShip {
  /** 0 = player 1, 1 = player 2. */
  readonly slot: number;
  /**
   * `false` for a player slot nobody plays (player 2 until it joins a co-op game — `core/world`
   * `joinPlayer`, M2-06): never updated or drawn.
   */
  active: boolean;
  /** World x of the ship's centre, sub-pixel (the renderer rounds). */
  x: number;
  /** World y of the ship's centre, sub-pixel (the renderer rounds). */
  y: number;
  /** Life-cycle state. */
  state: PlayerState;
  /** Ticks spent in the current state (1 after the first update in it). */
  stateTicks: number;
  /**
   * Index into the ship's `speeds` (0 = base speed; meter Speed Ups add levels; in Direct mode the
   * Speed toggle cycles it, from the ship's `startSpeedLevel` — M2-05).
   */
  speedLevel: number;
  /** Remaining invulnerability ticks (the respawn blink); 0 = vulnerable. */
  invulnTicks: number;
  /** Bank (tilt) step: negative = banking up, positive = down, 0 = level. */
  bank: number;
  /** Device that last produced input for this player (prompts and glyphs). */
  device: InputDeviceKind;
  /** Ships left including the one in play ({@link killPlayer} takes one; HUD: `lives − 1`). */
  lives: number;
  /** `true` when the ship had movement input this tick (the Option trail records only then, D26). */
  moving: boolean;
  /** {@link PlayerHitCause} of the last accepted hit (`None` = never hit). */
  hitCause: PlayerHitCause;
  /** Tick of the last accepted hit (-1 = never). */
  hitTick: number;
  /** Hits that got through to the ship so far (each one starts a death). */
  hits: number;
  /**
   * The ship's shield (`core/shields`; M1-11): the meter's `?` slot grants a Force Field here, and
   * {@link playerHit} lets it absorb hits first. Like {@link PlayerShip.speedLevel}, part of the
   * player's power-up state that lives on the ship.
   */
  readonly shield: ShieldState;
}

/**
 * What hit a ship ({@link playerHit}). Numeric codes, stored on the ship and hashed; append new
 * causes, never renumber.
 */
export const PlayerHitCause = {
  /** No hit recorded. */
  None: 0,
  /** The terrain box touched solid or hazard terrain (M1-07). */
  Terrain: 1,
  /** An enemy's body touched the hurtbox (M1-08). */
  Contact: 2,
  /** An enemy bullet (M1-09). */
  Bullet: 3,
  /** An enemy laser (M1-09). */
  Laser: 4,
} as const;

/** A {@link PlayerHitCause} code. */
export type PlayerHitCause = (typeof PlayerHitCause)[keyof typeof PlayerHitCause];

/** Names of the {@link PlayerHitCause} codes, by code (debug overlays, logs). */
export const PLAYER_HIT_CAUSE_NAMES: readonly string[] = Object.freeze([
  'none',
  'terrain',
  'contact',
  'bullet',
  'laser',
]);

/** One player's intents for the tick, derived from the input snapshot (tick phase 1). */
export interface PlayerIntent {
  /** Actions held this tick. */
  held: number;
  /** Actions pressed since the previous tick. */
  pressed: number;
  /** Actions released since the previous tick. */
  released: number;
  /** Device that produced the input (`'none'` when idle). */
  device: InputDeviceKind;
  /** Horizontal direction: -1 left, 0 none (or both), 1 right. */
  moveX: number;
  /** Vertical direction: -1 up, 0 none (or both), 1 down. */
  moveY: number;
}

/**
 * The camera as the player sees it: the view's top-left corner plus how far it moved during the
 * previous tick (the world camera satisfies it).
 */
export interface PlayerCamera extends CameraView {
  /** Camera x movement of the last camera update, in pixels. */
  readonly dx: number;
  /** Camera y movement of the last camera update, in pixels. */
  readonly dy: number;
}

/**
 * Built-in ship used when the content has no `player` file (headless tests, calibration). Same
 * tunables as `content/player/kestrel.player.json`; `spriteId` is -1, so it is not drawn.
 */
export const DEFAULT_PLAYER_SHIP: PlayerShipSpec = Object.freeze({
  id: 'default',
  name: 'DEFAULT',
  sprite: '',
  spriteId: -1,
  spriteP2Id: -1,
  speeds: Object.freeze([1.5, 2.0, 2.5, 3.0, 3.5, 4.0]),
  hurtRadius: 1.5,
  terrainBox: Object.freeze({ hw: 5, hh: 3 }),
  pickupBox: Object.freeze({ hw: 8, hh: 6 }),
  margins: Object.freeze({ left: 8, right: 8, top: 6, bottom: 6 }),
  enterTicks: 40,
  respawnInvulnTicks: 150,
  bankFrames: 1,
  mode: 'meter',
  startSpeedLevel: 0,
});

/**
 * Picks the ship a session flies: `content.ships` entry `id` when it exists, else the first
 * ship, else {@link DEFAULT_PLAYER_SHIP}.
 *
 * @remarks
 * Load-time lookup (it reads a `Map`); systems keep the returned spec. `createWorld` passes
 * `GameConfig.shipId` (M2-05 — the ship select's choice); an unknown id falls back silently, so a
 * replay recorded with a ship the content no longer has still loads.
 *
 * @param content - Validated content.
 * @param id - Preferred ship id (default `'kestrel'`, the meter ship of decision D36 —
 *   `core/config` `DEFAULT_SHIP_ID`).
 * @returns The ship spec.
 *
 * @example
 * ```ts
 * resolvePlayerShip(content, 'manta').mode; // → 'direct' with the shipped content
 * ```
 */
export function resolvePlayerShip(content: ContentDb, id = 'kestrel'): PlayerShipSpec {
  const index = content.shipIndex.get(id);
  if (index !== undefined) return content.ships[index];
  return content.ships.length > 0 ? content.ships[0] : DEFAULT_PLAYER_SHIP;
}

/**
 * Allocates a ship in the `dead` state, off-screen (call {@link spawnPlayer} to bring it in).
 *
 * @param slot - 0 = player 1, 1 = player 2.
 * @param lives - Ships at game start (`GameConfig.startingLives`).
 * @returns The ship (inactive until the caller sets `active`).
 */
export function createPlayer(slot: number, lives: number): PlayerShip {
  return {
    slot,
    active: false,
    x: 0,
    y: 0,
    state: 'dead',
    stateTicks: 0,
    speedLevel: 0,
    invulnTicks: 0,
    bank: 0,
    device: 'none',
    lives,
    moving: false,
    hitCause: PlayerHitCause.None,
    hitTick: -1,
    hits: 0,
    shield: createShieldState(),
  };
}

/**
 * Reports that something would kill a ship (the one entry point for every hit cause). Never
 * allocates.
 *
 * @remarks
 * The hit is ignored when the ship is inactive, not `alive` (fly-in, dying, dead), still
 * invulnerable (`invulnTicks > 0`) or when the debug god mode is on. Otherwise the ship's
 * {@link PlayerShip.shield} gets it first (`core/shields` `absorbShieldHit`: the Force Field takes
 * bullets, lasers and contact — not terrain — and swallows hits during its shield-hit i-frames);
 * an absorbed hit is accepted (`true`) without touching the ship. A hit that gets through is
 * recorded on the ship (`hitCause`, `hitTick`, `hits`); the World starts the death sequence for
 * a ship hit during a tick in that tick's damage phase (the ship stays `alive` until then, so
 * every system of the collision phase sees the same ships).
 *
 * @param ship - The ship.
 * @param cause - What hit it.
 * @param tick - The current tick (`world.tick`).
 * @param debug - The world's debug switches (god mode).
 * @returns `true` when the hit was accepted — by the ship or absorbed by its shield (callers
 *   remove the bullet that caused it).
 *
 * @example
 * ```ts
 * if (boxHitsTerrain(map, ship.x, ship.y, box.hw, box.hh) !== TerrainType.Empty) {
 *   playerHit(ship, PlayerHitCause.Terrain, world.tick, world.debugFlags);
 * }
 * ```
 */
export function playerHit(
  ship: PlayerShip,
  cause: PlayerHitCause,
  tick: number,
  debug: Readonly<DebugFlags>,
): boolean {
  if (!ship.active || ship.state !== 'alive' || ship.invulnTicks > 0 || debug.godMode) {
    return false;
  }
  if (absorbShieldHit(ship.shield, cause === PlayerHitCause.Terrain, tick) !== ShieldHit.None) {
    return true;
  }
  ship.hitCause = cause;
  ship.hitTick = tick;
  ship.hits++;
  return true;
}

/**
 * Starts a ship's death: `dying` (timer restarted), one life gone (never below 0), no
 * invulnerability, level. Never allocates.
 *
 * @remarks
 * Ship-level only: the World adds the death sequence around it (explosion and debris events,
 * hit-stop, bullet cancel, music duck, the death penalty — `core/world`). Does nothing for an
 * inactive ship or one that is already `dying` / `dead`.
 *
 * @param ship - The ship.
 * @returns Lives left afterwards (-1 when nothing happened).
 *
 * @example
 * ```ts
 * killPlayer(ship); // lives 3 → 2, state 'dying'
 * ```
 */
export function killPlayer(ship: PlayerShip): number {
  if (!ship.active || ship.state === 'dying' || ship.state === 'dead') return -1;
  setPlayerState(ship, 'dying');
  ship.lives = ship.lives > 1 ? ship.lives - 1 : 0;
  ship.invulnTicks = 0;
  ship.bank = 0;
  ship.moving = false;
  return ship.lives;
}

/**
 * Brings a ship back after its dead time: a `respawning` fly-in from the left edge of the camera
 * view ({@link spawnPlayer}), blinking — `invulnTicks` covers the fly-in plus
 * `spec.respawnInvulnTicks`, and {@link updatePlayer} sets it to exactly `respawnInvulnTicks` on
 * the tick control returns. Lives are not touched (the death took one).
 *
 * @param ship - The ship.
 * @param spec - Its tunables (`enterTicks`, `respawnInvulnTicks`).
 * @param camera - The current camera (after a checkpoint restart: the restarted one).
 *
 * @example
 * ```ts
 * respawnPlayer(ship, world.ship, world.camera);
 * ```
 */
export function respawnPlayer(
  ship: PlayerShip,
  spec: Pick<PlayerShipSpec, 'enterTicks' | 'respawnInvulnTicks'>,
  camera: CameraView,
): void {
  spawnPlayer(ship, camera, 'respawning');
  const enter = spec.enterTicks > 0 ? spec.enterTicks : 0;
  ship.invulnTicks = enter + spec.respawnInvulnTicks;
}

/**
 * Whether a ship is out of the game: active, `dead`, its dead time over and no life left.
 *
 * @remarks
 * The World ends the game (`status = 'gameOver'`) once every active ship is out — after the last
 * explosion and dead time, not at the fatal hit. An inactive slot is never out.
 *
 * @param ship - The ship.
 * @returns `true` for a ship that will not respawn.
 *
 * @example
 * ```ts
 * playerOut(world.players[0]); // → true once P1's last dead time is over (lives 0)
 * ```
 */
export function playerOut(ship: Readonly<PlayerShip>): boolean {
  return (
    ship.active && ship.state === 'dead' && ship.lives <= 0 && ship.stateTicks >= PLAYER_DEAD_TICKS
  );
}

/**
 * Allocates an empty intent (all masks 0, no direction).
 *
 * @returns The intent.
 */
export function createPlayerIntent(): PlayerIntent {
  return { held: 0, pressed: 0, released: 0, device: 'none', moveX: 0, moveY: 0 };
}

/**
 * Derives a player's intents from its input for this tick. Never allocates.
 *
 * @param intent - Intent to overwrite.
 * @param input - The player's entry of the tick's input snapshot.
 *
 * @example
 * ```ts
 * readPlayerIntent(intent, { held: Action.Up | Action.Right, pressed: 0, released: 0, device: 'keyboard' });
 * intent.moveX; // → 1
 * intent.moveY; // → -1
 * ```
 */
export function readPlayerIntent(intent: PlayerIntent, input: Readonly<PlayerInput>): void {
  const held = input.held;
  intent.held = held;
  intent.pressed = input.pressed;
  intent.released = input.released;
  intent.device = input.device;
  intent.moveX = ((held & Action.Right) !== 0 ? 1 : 0) - ((held & Action.Left) !== 0 ? 1 : 0);
  intent.moveY = ((held & Action.Down) !== 0 ? 1 : 0) - ((held & Action.Up) !== 0 ? 1 : 0);
}

/**
 * Switches a ship's life-cycle state and restarts its state timer.
 *
 * @param ship - The ship.
 * @param state - New state.
 */
export function setPlayerState(ship: PlayerShip, state: PlayerState): void {
  ship.state = state;
  ship.stateTicks = 0;
}

/**
 * Starts a fly-in: places the ship left of the camera view, level, at mid-height.
 *
 * @param ship - The ship.
 * @param camera - The current camera.
 * @param state - `'entering'` (stage start, default) or `'respawning'` (after a death, M1-12).
 */
export function spawnPlayer(
  ship: PlayerShip,
  camera: CameraView,
  state: 'entering' | 'respawning' = 'entering',
): void {
  ship.x = camera.x + ENTER_START_X;
  ship.y = camera.y + SPAWN_Y;
  ship.bank = 0;
  ship.moving = false;
  setPlayerState(ship, state);
}

/**
 * Sprite frame of a bank step: 0 = level, `1 … bankFrames` = banking up (steeper), then
 * `bankFrames + 1 … 2·bankFrames` = banking down (the `ships/kestrel` frame order).
 *
 * @param bank - The ship's bank step.
 * @param bankFrames - The spec's `bankFrames`.
 * @returns The frame index.
 */
export function playerBankFrame(bank: number, bankFrames: number): number {
  if (bank < 0) return -bank;
  if (bank > 0) return bankFrames + bank;
  return 0;
}

/**
 * Advances one ship by one tick (tick phase 2): state timers, fly-in, movement, clamp, bank.
 * Never allocates.
 *
 * @remarks
 * Inactive ships are skipped. Invulnerability counts down in every state. A `dying` ship stays
 * where it was hit and becomes `dead` after {@link PLAYER_DYING_TICKS} ticks; `dead` only counts
 * its timer (the World respawns it after {@link PLAYER_DEAD_TICKS}). The tick a `respawning`
 * fly-in ends, `invulnTicks` is set to `spec.respawnInvulnTicks` — the invulnerability after a
 * respawn starts when control returns.
 *
 * @param ship - The ship to move.
 * @param spec - Its tunables (speeds, margins, fly-in length, bank frames).
 * @param intent - This tick's intents (from {@link readPlayerIntent}).
 * @param camera - The camera (view corner and last scroll step).
 *
 * @example
 * ```ts
 * readPlayerIntent(intent, input.players[0]);
 * updatePlayer(ship, spec, intent, world.camera);
 * ```
 */
export function updatePlayer(
  ship: PlayerShip,
  spec: PlayerShipSpec,
  intent: Readonly<PlayerIntent>,
  camera: PlayerCamera,
): void {
  if (!ship.active) return;
  if (intent.device !== 'none') ship.device = intent.device;
  if (ship.invulnTicks > 0) ship.invulnTicks--;
  ship.stateTicks++;
  ship.moving = false;
  const state = ship.state;
  if (state === 'entering' || state === 'respawning') {
    const duration = spec.enterTicks;
    const done = duration <= 0 || ship.stateTicks >= duration;
    // `EASINGS.outCubic` written out: a fractional argument and result of a call V8 does not
    // inline are boxed (two heap numbers per fly-in tick — every respawn flies in, M1-12).
    const u = done ? 0 : 1 - ship.stateTicks / duration;
    ship.x = camera.x + ENTER_START_X + (ENTER_END_X - ENTER_START_X) * (1 - u * u * u);
    ship.y += camera.dy;
    ship.bank = 0;
    if (done) {
      if (state === 'respawning') ship.invulnTicks = spec.respawnInvulnTicks;
      setPlayerState(ship, 'alive');
    }
    return;
  }
  if (state === 'dying') {
    if (ship.stateTicks >= PLAYER_DYING_TICKS) setPlayerState(ship, 'dead');
    return;
  }
  if (state !== 'alive') return;

  // Ride along with the scroll, then apply the input (no inertia).
  ship.x += camera.dx;
  ship.y += camera.dy;
  const mx = intent.moveX;
  const my = intent.moveY;
  if (mx !== 0 || my !== 0) {
    const speeds = spec.speeds;
    const top = speeds.length - 1;
    const level = ship.speedLevel < 0 ? 0 : ship.speedLevel > top ? top : ship.speedLevel;
    // Always a product (× 1 is exact): a branch returning the bare array element would merge
    // a tagged value with a computed double, which V8 boxes on diagonal ticks (an allocation).
    const speed = speeds[level] * (mx !== 0 && my !== 0 ? DIAGONAL_SCALE : 1);
    ship.x += mx * speed;
    ship.y += my * speed;
    ship.moving = true;
  }

  // Clamp to the camera view minus the margins.
  const margins = spec.margins;
  const minX = camera.x + margins.left;
  const maxX = camera.x + PLAYFIELD_W - margins.right;
  const minY = camera.y + margins.top;
  const maxY = camera.y + PLAYFIELD_H - margins.bottom;
  if (ship.x < minX) ship.x = minX;
  else if (ship.x > maxX) ship.x = maxX;
  if (ship.y < minY) ship.y = minY;
  else if (ship.y > maxY) ship.y = maxY;

  // Bank one step per tick towards the vertical intent.
  const target = my * spec.bankFrames;
  if (ship.bank < target) ship.bank++;
  else if (ship.bank > target) ship.bank--;
}
