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
 * X(2)=PowerUp, Y(3)=Special, LB(4)/RB(5)=Speed, Select(8)=Back, Start(9)=Pause.
 *
 * **Implements.** shmup_feat.md §4 input requirements (Gamepad API standard mapping,
 * D-pad 12–15, radial deadzone ~0.2, stick → 8-way with hysteresis, polled once per
 * frame), shmup_tech.md §2.3 (≤ 4 pads, activation by first press).
 *
 * **Public API.** {@link readGamepadActions}, {@link GamepadLike},
 * {@link GamepadReadState}, {@link DEFAULT_GAMEPAD_BUTTONS}, {@link STICK_DEADZONE}.
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
  readonly index: number;
  readonly connected: boolean;
  readonly mapping: string;
  readonly buttons: ReadonlyArray<{ readonly pressed: boolean }>;
  readonly axes: readonly number[];
}

/** Per-pad state carried between polls (for stick hysteresis). */
export interface GamepadReadState {
  /** Direction bits produced by the stick on the previous poll. */
  stickDirections: ActionMask;
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
 * @param pad - The gamepad (should use `mapping === 'standard'`).
 * @param state - Per-pad state, updated in place.
 * @param buttons - Button index → actions table.
 * @returns Held actions for this pad.
 */
export function readGamepadActions(
  pad: GamepadLike,
  state: GamepadReadState,
  buttons: readonly ActionMask[] = DEFAULT_GAMEPAD_BUTTONS,
): ActionMask {
  if (!pad.connected) {
    state.stickDirections = 0;
    return 0;
  }
  let mask = 0;
  const count = Math.min(pad.buttons.length, buttons.length);
  for (let i = 0; i < count; i++) {
    const button = pad.buttons[i];
    if (button !== undefined && button.pressed) mask |= buttons[i] ?? 0;
  }
  const stick = stickDirections(pad.axes[0] ?? 0, pad.axes[1] ?? 0, state.stickDirections);
  state.stickDirections = stick;
  return mask | stick;
}
