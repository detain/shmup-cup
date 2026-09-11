/**
 * # input — actions, per-tick input snapshots, remote-first action policy
 *
 * **Responsibility.** Defines the *action* vocabulary the simulation understands and
 * the per-tick {@link InputSnapshot} that platform adapters fill in. The core never
 * sees key codes, gamepad button indices or remote keys — adapters
 * (`@shmup/input-web`, the Tizen adapter, …) translate devices into action bits.
 * Snapshots are plain bitmasks so they are deterministic, cheap to copy and
 * trivially recordable for replays.
 *
 * **Implements.**
 * - shmup_tech.md §3.2 (`Platform.input.poll(): InputSnapshot`), §4.4 (action bitmask snapshot)
 * - shmup_feat.md §4 Controls & input — action table, remote-first control design,
 *   edge latching ("pressed since last tick" so taps are never lost)
 *
 * **Public API (implemented now).**
 * - {@link Action}, {@link ActionName}, {@link ActionMask}, {@link ACTION_NAMES}
 * - {@link InputSnapshot}, {@link PlayerInput}, {@link InputDeviceKind}, {@link MAX_PLAYERS}
 * - {@link createInputSnapshot}, {@link resetInputSnapshot}, {@link commitPlayerInput},
 *   {@link copyInputSnapshot}, {@link hasAction}
 *
 * **Planned API (later steps).**
 * - `RemotePolicy` — forced autofire for Shot/Sub, 4-way assumption, release debounce hints
 *   (shmup_feat.md §4 "Design rules for remote play")
 * - `SocdMode` (`'neutral' | 'last-wins'`) + `resolveSocd(mask, prev)` (shmup_feat.md §4 [P1])
 * - `InputBuffer` — 8–16 tick ring buffer for menu / power-meter presses (shmup_tech.md §4.4)
 * - `AutofireState` — deterministic autofire cadence whose rate is stored in replay headers
 *
 * No DOM, no key codes, no allocation in the per-tick path.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'input',
  status: 'partial',
  specRefs: ['shmup_tech.md §3.2', 'shmup_tech.md §4.4', 'shmup_feat.md §4'],
});

/**
 * Game actions as single bits. Adapters OR these together into an {@link ActionMask}.
 *
 * Menus reuse the same bits (`Confirm`, `Back`, directions), so one input path drives
 * both gameplay and the canvas-drawn UI.
 *
 * @remarks
 * Bit positions are part of the replay format (snapshots are recorded as raw masks):
 * append new actions at the end, never renumber existing ones.
 *
 * @example
 * ```ts
 * const mask = Action.Up | Action.Shot;
 * hasAction(mask, Action.Shot); // → true
 * ```
 */
export const Action = {
  /** Move / focus up. */
  Up: 1 << 0,
  /** Move / focus down. */
  Down: 1 << 1,
  /** Move / focus left. */
  Left: 1 << 2,
  /** Move / focus right. */
  Right: 1 << 3,
  /** Main shot (autofire when held or when remote mode forces it). */
  Shot: 1 << 4,
  /** Sub-weapon / missile. */
  Sub: 1 << 5,
  /** Meter mode: equip the highlighted power-up slot. */
  PowerUp: 1 << 6,
  /** Special / bomb (Mega-Crash-style screen clear, if equipped). */
  Special: 1 << 7,
  /** Optional ship-speed cycle (Direct mode). */
  Speed: 1 << 8,
  /** Pause / resume. */
  Pause: 1 << 9,
  /** Menu confirm (remote OK, Enter, gamepad A). */
  Confirm: 1 << 10,
  /** Menu back (remote Back 10009, Esc, gamepad B/Select). */
  Back: 1 << 11,
} as const;

/** Name of an action, e.g. `'Shot'`. */
export type ActionName = keyof typeof Action;

/** A bitwise OR of {@link Action} values. */
export type ActionMask = number;

/** All action names in bit order — handy for debug overlays and rebinding UIs. */
export const ACTION_NAMES: readonly ActionName[] = Object.freeze([
  'Up',
  'Down',
  'Left',
  'Right',
  'Shot',
  'Sub',
  'PowerUp',
  'Special',
  'Speed',
  'Pause',
  'Confirm',
  'Back',
] as ActionName[]);

/** Maximum simultaneous local players (2-player co-op, shmup_feat.md §16). */
export const MAX_PLAYERS = 2;

/** Which kind of device last produced input for a player. */
export type InputDeviceKind = 'none' | 'keyboard' | 'remote' | 'gamepad';

/** One player's actions for one simulation tick. */
export interface PlayerInput {
  /** Actions held during this tick. */
  held: ActionMask;
  /** Actions that went down since the previous tick (includes taps released before the poll). */
  pressed: ActionMask;
  /** Actions that went up since the previous tick. */
  released: ActionMask;
  /** Device that produced the most recent input for this player. */
  device: InputDeviceKind;
}

/**
 * Everything the simulation reads from input for one tick.
 *
 * Adapters own one snapshot object and mutate it in place on every poll
 * (zero allocations per tick); the simulation must treat it as read-only.
 */
export interface InputSnapshot {
  /** Exactly {@link MAX_PLAYERS} entries; index 0 = player 1. */
  readonly players: PlayerInput[];
}

/**
 * Allocates a snapshot with {@link MAX_PLAYERS} idle players. Call once at startup.
 *
 * @returns A fresh, empty snapshot (all masks `0`, every `device` `'none'`).
 *
 * @example
 * ```ts
 * const snapshot = createInputSnapshot(); // owned by the adapter, mutated every poll
 * ```
 */
export function createInputSnapshot(): InputSnapshot {
  const players: PlayerInput[] = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    players.push({ held: 0, pressed: 0, released: 0, device: 'none' });
  }
  return { players };
}

/**
 * Clears every player's actions (e.g. on window blur or scene change).
 *
 * @remarks
 * Only the masks are cleared; `device` keeps the last device kind so UI prompts do not
 * flicker back to a default glyph set.
 *
 * @param snapshot - Snapshot to reset in place.
 */
export function resetInputSnapshot(snapshot: InputSnapshot): void {
  const players = snapshot.players;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    p.held = 0;
    p.pressed = 0;
    p.released = 0;
  }
}

/**
 * Writes one tick of input for a player and derives edge flags.
 *
 * `pressed` = newly held bits ∪ `latchedPressed` (bits that went down and up again
 * between two polls — a quick remote tap must still register). `released` = bits
 * that were held last tick and are not held now.
 *
 * @remarks
 * A latched tap that is no longer held shows up in `pressed` but not in `held` or
 * `released` for that tick. `device` is left untouched — adapters set it themselves.
 *
 * @param player - Player entry to update in place.
 * @param held - Actions currently held.
 * @param latchedPressed - Actions pressed at any time since the previous poll.
 *
 * @example
 * ```ts
 * const p = createInputSnapshot().players[0];
 * commitPlayerInput(p, Action.Shot);       // pressed = Shot, held = Shot
 * commitPlayerInput(p, Action.Shot);       // pressed = 0 (still held)
 * commitPlayerInput(p, 0);                 // released = Shot
 * commitPlayerInput(p, 0, Action.Confirm); // a tap between polls: pressed = Confirm
 * ```
 */
export function commitPlayerInput(
  player: PlayerInput,
  held: ActionMask,
  latchedPressed: ActionMask = 0,
): void {
  const previous = player.held;
  player.pressed = (held & ~previous) | latchedPressed;
  player.released = previous & ~held;
  player.held = held;
}

/**
 * Copies `source` into `target` without allocating (replay recording/playback).
 *
 * @remarks
 * Copies `min(source.players.length, target.players.length)` entries; extra players in
 * `target` are left as they were.
 *
 * @param source - Snapshot to read.
 * @param target - Snapshot to overwrite.
 */
export function copyInputSnapshot(source: InputSnapshot, target: InputSnapshot): void {
  const n = Math.min(source.players.length, target.players.length);
  for (let i = 0; i < n; i++) {
    const s = source.players[i];
    const t = target.players[i];
    t.held = s.held;
    t.pressed = s.pressed;
    t.released = s.released;
    t.device = s.device;
  }
}

/**
 * Tests whether any bit of `action` is set in `mask`.
 *
 * @param mask - An action mask (`held`, `pressed` or `released`).
 * @param action - One or more {@link Action} bits.
 * @returns `true` when at least one of the bits is set.
 *
 * @example
 * ```ts
 * if (hasAction(input.pressed, Action.Pause)) game.pause();
 * hasAction(Action.Left, Action.Left | Action.Right); // → true (any bit)
 * ```
 */
export function hasAction(mask: ActionMask, action: ActionMask): boolean {
  return (mask & action) !== 0;
}
