/**
 * # gamepad — W3C Gamepad API → action masks
 *
 * **Responsibility.** Converts one `Gamepad` (standard mapping) into an action mask:
 * D-pad buttons 12–15 and the left stick (radial deadzone, 8-way digital with
 * hysteresis) → directions; face/shoulder/meta buttons → actions. Pads are polled once
 * per frame right before the simulation ticks. A pad is invisible to the page until its
 * first button press (browser rule, also on Samsung TVs), which doubles as "press any
 * button to activate".
 *
 * Default button map (standard layout): A(0)=Shot+Confirm, B(1)=Sub+Back,
 * X(2)=PowerUp, Y(3)=Special, LB(4)/RB(5)=Speed, Select(8)=Back, Start(9)=Pause. It is the
 * fallback used before a `gamepad` input profile is applied; `gamepad-standard` in
 * `content/input/` splits it into `game` and `menu` tables (decision D15). A button held while
 * the table changes is *stale* until released: it keeps only the actions both tables give it
 * ({@link GamepadReadState.staleButtons}).
 *
 * **Implements.** shmup_feat.md §4 input requirements (Gamepad API standard mapping,
 * D-pad 12–15, radial deadzone ~0.2, stick → 8-way with hysteresis, polled once per
 * frame), shmup_tech.md §2.3 (≤ 4 pads, activation by first press).
 *
 * **Public API.** {@link readGamepadActions}, {@link GamepadLike},
 * {@link GamepadReadState}, {@link DEFAULT_GAMEPAD_BUTTONS}, {@link STICK_DEADZONE},
 * {@link STICK_HYSTERESIS}; M3-01: rumble — {@link rumblePad}, {@link RUMBLE_EFFECTS},
 * {@link RumbleEffect}, {@link GamepadHapticLike} (`vibrationActuator.playEffect('dual-rumble')`,
 * shmup_feat.md §4 "[P2] Rumble").
 *
 * @module
 */
import { Action, defineModule, type ActionMask } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'gamepad',
  status: 'implemented',
  specRefs: ['shmup_feat.md §4', 'shmup_tech.md §2.3'],
});

/** Radial deadzone of the left stick (fraction of full deflection). */
export const STICK_DEADZONE = 0.2;

/** Extra deflection needed to *enter* a direction vs. leave it (hysteresis). */
export const STICK_HYSTERESIS = 0.1;

/** The parts of `Gamepad` this module reads. */
export interface GamepadLike {
  /** Slot index assigned by the browser (0–3). */
  readonly index: number;
  /** `false` once the pad was unplugged (the object may linger for a poll). */
  readonly connected: boolean;
  /** `'standard'` when the browser knows the W3C standard layout, else `''`. */
  readonly mapping: string;
  /** Buttons in standard-mapping order; only `pressed` is read (triggers are digital). */
  readonly buttons: ReadonlyArray<{
    /** `true` while the button is down. */
    readonly pressed: boolean;
  }>;
  /** Axes; `[0]` / `[1]` are the left stick X / Y (−1 … +1, +Y = down). */
  readonly axes: readonly number[];
  /**
   * The pad's rumble motors (M3-01 — `Gamepad.vibrationActuator`, a `GamepadHapticActuator`:
   * Chrome 68+, Samsung TVs with a pad), when it has them.
   */
  readonly vibrationActuator?: GamepadHapticLike | null;
}

/** The parts of `GamepadHapticActuator` rumble uses (M3-01). */
export interface GamepadHapticLike {
  /**
   * Plays an effect (`'dual-rumble'`).
   *
   * @param type - The effect type.
   * @param params - Duration and the two motors' strengths.
   * @returns Resolves when the effect ends (or is replaced).
   */
  playEffect?(type: 'dual-rumble', params: RumbleEffect): Promise<unknown>;
}

/** A `'dual-rumble'` effect's parameters (the `GamepadEffectParameters` rumble reads). */
export interface RumbleEffect {
  /** Delay before the effect, ms. */
  readonly startDelay: number;
  /** Length, ms. */
  readonly duration: number;
  /** The light (high-frequency) motor, 0–1. */
  readonly weakMagnitude: number;
  /** The heavy (low-frequency) motor, 0–1. */
  readonly strongMagnitude: number;
}

/**
 * The rumble effects by strength (M3-01 — the core's `SimEventKind.Rumble` `param`: 1 = a ship's
 * death, 2 = a boss's final blast); index 0 is unused. Frozen constants: playing one allocates only
 * what the browser's `playEffect` does.
 */
export const RUMBLE_EFFECTS: readonly RumbleEffect[] = Object.freeze([
  Object.freeze({ startDelay: 0, duration: 0, weakMagnitude: 0, strongMagnitude: 0 }),
  Object.freeze({ startDelay: 0, duration: 260, weakMagnitude: 0.6, strongMagnitude: 0.8 }),
  Object.freeze({ startDelay: 0, duration: 520, weakMagnitude: 0.8, strongMagnitude: 1 }),
]);

/**
 * Rumbles one pad (M3-01 — shmup_feat.md §4 "[P2] Rumble via `vibrationActuator.playEffect()`").
 * Does nothing for a pad without motors; a rejected effect is ignored.
 *
 * @param pad - The pad.
 * @param strength - 1 (a death) or 2 (a boss blast); clamped into {@link RUMBLE_EFFECTS}.
 * @returns Whether an effect was started.
 */
export function rumblePad(pad: GamepadLike, strength: number): boolean {
  const actuator = pad.vibrationActuator;
  if (actuator === undefined || actuator === null || typeof actuator.playEffect !== 'function') {
    return false;
  }
  const index = strength >= 2 ? 2 : 1;
  try {
    const done = actuator.playEffect('dual-rumble', RUMBLE_EFFECTS[index]);
    if (done !== undefined && typeof done.catch === 'function') done.catch(ignoreRumbleError);
  } catch (_error) {
    return false;
  }
  return true;
}

/** Swallows a rejected rumble effect (a pad unplugged, an effect not supported). */
function ignoreRumbleError(): void {
  // Rumble is best effort.
}

/** Per-pad state carried between polls (stick hysteresis, buttons held across a table swap). */
export interface GamepadReadState {
  /** Direction bits produced by the stick on the previous poll. */
  stickDirections: ActionMask;
  /**
   * Bitmask of the button indices (0–31) pressed on the previous poll; written by
   * {@link readGamepadActions}.
   */
  pressedButtons?: number;
  /**
   * Button indices (bitmask) that were held when the binding table changed (a new profile or
   * a `game`/`menu` context switch). Until released they contribute only the actions they have
   * in both tables, so no action appears without a press. Set it to
   * {@link GamepadReadState.pressedButtons} at the switch; {@link readGamepadActions} clears
   * the bits of released buttons.
   */
  staleButtons?: number;
}

/** Standard-mapping button index → actions. */
export const DEFAULT_GAMEPAD_BUTTONS: readonly ActionMask[] = Object.freeze([
  Action.Shot | Action.Confirm, // 0 A / Cross
  Action.Sub | Action.Back, // 1 B / Circle
  Action.PowerUp, // 2 X / Square
  Action.Special, // 3 Y / Triangle
  Action.Speed, // 4 LB
  Action.Speed, // 5 RB
  0, // 6 LT
  0, // 7 RT
  Action.Back, // 8 Select / Back
  Action.Pause, // 9 Start
  0, // 10 L3
  0, // 11 R3
  Action.Up, // 12 D-pad up
  Action.Down, // 13 D-pad down
  Action.Left, // 14 D-pad left
  Action.Right, // 15 D-pad right
]);

/** The four direction bits (used to tell whether the stick was active last poll). */
const DIRECTION_MASK = Action.Up | Action.Down | Action.Left | Action.Right;

/**
 * Stick → 8-way directions. Uses a radial deadzone; an axis component turns into a
 * direction when it exceeds `sin(22.5°)` of the stick vector (8 equal sectors), with
 * hysteresis so a direction does not flicker at sector borders.
 *
 * @param x - Horizontal axis (−1 left … +1 right).
 * @param y - Vertical axis (−1 up … +1 down).
 * @param previous - Direction bits from the previous poll.
 * @returns Direction bits.
 */
function stickDirections(x: number, y: number, previous: ActionMask): ActionMask {
  const magnitude = Math.sqrt(x * x + y * y);
  const wasActive = (previous & DIRECTION_MASK) !== 0;
  const deadzone = wasActive ? STICK_DEADZONE : STICK_DEADZONE + STICK_HYSTERESIS;
  if (magnitude < deadzone) return 0;
  const nx = x / magnitude;
  const ny = y / magnitude;
  const enter = 0.3827 + STICK_HYSTERESIS; // sin(22.5°) + hysteresis
  const stay = 0.3827 - STICK_HYSTERESIS;
  let mask = 0;
  if (nx > ((previous & Action.Right) !== 0 ? stay : enter)) mask |= Action.Right;
  if (nx < -((previous & Action.Left) !== 0 ? stay : enter)) mask |= Action.Left;
  if (ny > ((previous & Action.Down) !== 0 ? stay : enter)) mask |= Action.Down;
  if (ny < -((previous & Action.Up) !== 0 ? stay : enter)) mask |= Action.Up;
  return mask;
}

/**
 * Reads one pad into an action mask.
 *
 * @remarks
 * The mapping is not checked: a non-standard pad is read as if it were standard (best
 * effort until rebinding lands). A disconnected pad returns 0 and resets its state.
 * Button bits and stick directions are OR-ed, so D-pad and stick combine. A button listed in
 * `state.staleButtons` contributes `buttons[i] & previousButtons[i]` (see
 * {@link GamepadReadState.staleButtons}); buttons beyond the table contribute nothing. Buttons
 * above index 31 are read but never tracked as pressed or stale.
 * No allocation.
 *
 * @param pad - The gamepad (should use `mapping === 'standard'`).
 * @param state - Per-pad state, updated in place.
 * @param buttons - Button index → actions table.
 * @param previousButtons - The table in use before the last switch (for stale buttons;
 *   defaults to `buttons`).
 * @returns Held actions for this pad.
 *
 * @example
 * ```ts
 * const state: GamepadReadState = { stickDirections: 0 };
 * const pad = navigator.getGamepads()[0];
 * const held = pad ? readGamepadActions(pad, state) : 0;
 * ```
 */
export function readGamepadActions(
  pad: GamepadLike,
  state: GamepadReadState,
  buttons: readonly ActionMask[] = DEFAULT_GAMEPAD_BUTTONS,
  previousButtons: readonly ActionMask[] = buttons,
): ActionMask {
  if (!pad.connected) {
    state.stickDirections = 0;
    state.pressedButtons = 0;
    state.staleButtons = 0;
    return 0;
  }
  let mask = 0;
  let pressed = 0;
  const stale = state.staleButtons ?? 0;
  const count = pad.buttons.length;
  for (let i = 0; i < count; i++) {
    const button = pad.buttons[i];
    if (button === undefined || !button.pressed) continue;
    const bit = i < 32 ? 1 << i : 0;
    pressed |= bit;
    const actions = buttons[i] ?? 0;
    mask |= (stale & bit) !== 0 ? actions & (previousButtons[i] ?? 0) : actions;
  }
  state.pressedButtons = pressed;
  if (stale !== 0) state.staleButtons = stale & pressed;
  const stick = stickDirections(pad.axes[0] ?? 0, pad.axes[1] ?? 0, state.stickDirections);
  state.stickDirections = stick;
  return mask | stick;
}
