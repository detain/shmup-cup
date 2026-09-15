import type { GamepadLike, KeyEventLike } from '../src/index.js';

/** A plain key event object with a spy-able `preventDefault`. */
export interface FakeKeyEvent extends KeyEventLike {
  prevented: boolean;
}

/**
 * Builds a fake keyboard event.
 *
 * @param type - `keydown` or `keyup`.
 * @param code - `KeyboardEvent.code` ('' for TV remote keys).
 * @param keyCode - Legacy key code.
 * @param extra - Optional overrides (repeat, modifiers).
 */
export function key(
  type: 'keydown' | 'keyup',
  code: string,
  keyCode = 0,
  extra: Partial<Pick<KeyEventLike, 'repeat' | 'ctrlKey' | 'metaKey'>> = {},
): FakeKeyEvent {
  const event: FakeKeyEvent = {
    type,
    code,
    keyCode,
    repeat: extra.repeat ?? false,
    ctrlKey: extra.ctrlKey ?? false,
    metaKey: extra.metaKey ?? false,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
  };
  return event;
}

/**
 * Builds a fake standard-mapping gamepad.
 *
 * @param index - Pad slot.
 * @param pressed - Indices of pressed buttons.
 * @param axes - Axis values.
 */
export function pad(
  index: number,
  pressed: number[] = [],
  axes: number[] = [0, 0, 0, 0],
): GamepadLike {
  const buttons = [];
  for (let i = 0; i < 17; i++) buttons.push({ pressed: pressed.includes(i) });
  return { index, connected: true, mapping: 'standard', buttons, axes };
}
