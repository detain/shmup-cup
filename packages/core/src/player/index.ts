/**
 * # player — player ship
 *
 * **Status: partial.** Movement, speed levels, clamping to the camera view, banking and the
 * fly-in are implemented (plan M1-06); hits, the death sequence, respawn by death-penalty preset
 * and lives arrive in M1-12, terrain kills with the stage runtime (M1-07).
 *
 * **Responsibility.** The player ship: 8-way movement with no inertia, speed levels (meter Speed Ups or
 * a fixed Direct-mode speed), a tiny centred hurtbox plus a separate terrain box,
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
 * **Implements.**
 * - shmup_feat.md §5 Player ship
 * - shmup_feat.md §10 Death, respawn & checkpoints
 *
 * **Public API.** {@link PlayerShip}, {@link PlayerState}, {@link PLAYER_STATES},
 * {@link PlayerIntent}, {@link PlayerCamera}, {@link createPlayer}, {@link createPlayerIntent},
 * {@link readPlayerIntent}, {@link spawnPlayer}, {@link setPlayerState}, {@link updatePlayer},
 * {@link playerBankFrame}, {@link resolvePlayerShip}, {@link DEFAULT_PLAYER_SHIP},
 * {@link DIAGONAL_SCALE}, {@link ENTER_START_X}, {@link ENTER_END_X}, {@link SPAWN_Y}.
 *
 * **Planned API.** `playerHit(world, player, cause)`, `killPlayer`, `respawnPlayer` by
 * death-penalty preset (M1-12); terrain-box checks (M1-07).
 *
 * @module
 */
import { PLAYFIELD_H, PLAYFIELD_W } from '../config/index.js';
import type { ContentDb, PlayerShipSpec } from '../data/index.js';
import { Action, type InputDeviceKind, type PlayerInput } from '../input/index.js';
import { EASINGS } from '../math/index.js';
import { defineModule } from '../module-info.js';
import type { CameraView } from '../presentation/index.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'player',
  status: 'partial',
  specRefs: ['shmup_feat.md §5', 'shmup_feat.md §10'],
});

/** Life-cycle state of a ship (the M1-12 death sequence fills `dying` / `dead`). */
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

/** Runtime state of one player ship. */
export interface PlayerShip {
  /** 0 = player 1, 1 = player 2. */
  readonly slot: number;
  /** `false` for a player slot nobody plays (P2 until co-op, M2-06): never updated or drawn. */
  active: boolean;
  /** World x of the ship's centre, sub-pixel (the renderer rounds). */
  x: number;
  /** World y of the ship's centre, sub-pixel (the renderer rounds). */
  y: number;
  /** Life-cycle state. */
  state: PlayerState;
  /** Ticks spent in the current state (1 after the first update in it). */
  stateTicks: number;
  /** Index into the ship's `speeds` (0 = base speed; meter Speed Ups add levels). */
  speedLevel: number;
  /** Remaining invulnerability ticks (respawn blink, M1-12); 0 = vulnerable. */
  invulnTicks: number;
  /** Bank (tilt) step: negative = banking up, positive = down, 0 = level. */
  bank: number;
  /** Device that last produced input for this player (prompts and glyphs). */
  device: InputDeviceKind;
  /** Ships left including the current one (M1-12 applies the loss). */
  lives: number;
  /** `true` when the ship had movement input this tick (the Option trail records only then, D26). */
  moving: boolean;
}

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
  speeds: Object.freeze([1.5, 2.0, 2.5, 3.0, 3.5, 4.0]),
  hurtRadius: 1.5,
  terrainBox: Object.freeze({ hw: 5, hh: 3 }),
  pickupBox: Object.freeze({ hw: 8, hh: 6 }),
  margins: Object.freeze({ left: 8, right: 8, top: 6, bottom: 6 }),
  enterTicks: 40,
  respawnInvulnTicks: 120,
  bankFrames: 1,
});

/**
 * Picks the ship a session flies: `content.ships` entry `id` when it exists, else the first
 * ship, else {@link DEFAULT_PLAYER_SHIP}.
 *
 * @remarks
 * Load-time lookup (it reads a `Map`); systems keep the returned spec.
 *
 * @param content - Validated content.
 * @param id - Preferred ship id (default `'kestrel'`, the meter ship of decision D36).
 * @returns The ship spec.
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
  };
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
 * Inactive ships are skipped. `dying` and `dead` only advance their timers here — the death
 * sequence and respawn are M1-12's. Invulnerability counts down in every state.
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
    const t = duration <= 0 || ship.stateTicks >= duration ? 1 : ship.stateTicks / duration;
    ship.x = camera.x + ENTER_START_X + (ENTER_END_X - ENTER_START_X) * EASINGS.outCubic(t);
    ship.y += camera.dy;
    ship.bank = 0;
    if (t >= 1) setPlayerState(ship, 'alive');
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
