/**
 * Edge cases of the gamepad reader: the full default button table, short / odd pads,
 * the stick's 8-way sectors and hysteresis in both directions.
 */
import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAMEPAD_BUTTONS,
  STICK_DEADZONE,
  STICK_HYSTERESIS,
  readGamepadActions,
  type GamepadLike,
} from '../../src/gamepad/index.js';
import { pad } from '../helpers.js';

/**
 * Reads a pad with a fresh (idle) stick state.
 *
 * @param p - The pad.
 */
const readOnce = (p: GamepadLike) => readGamepadActions(p, { stickDirections: 0 });

/**
 * A pad whose stick points at `degrees` (0 = right, 90 = down) with the given deflection.
 *
 * @param degrees - Angle.
 * @param magnitude - Deflection 0…1.
 */
const stick = (degrees: number, magnitude = 1) => {
  const radians = (degrees * Math.PI) / 180;
  return pad(0, [], [Math.cos(radians) * magnitude, Math.sin(radians) * magnitude]);
};

describe('input-web/gamepad default button map (standard mapping)', () => {
  const expected: Array<[number, number]> = [
    [0, Action.Shot | Action.Confirm],
    [1, Action.Sub | Action.Back],
    [2, Action.PowerUp],
    [3, Action.Special],
    [4, Action.Speed],
    [5, Action.Speed],
    [6, 0],
    [7, 0],
    [8, Action.Back],
    [9, Action.Pause],
    [10, 0],
    [11, 0],
    [12, Action.Up],
    [13, Action.Down],
    [14, Action.Left],
    [15, Action.Right],
    [16, 0], // Home / guide: reserved for the system
  ];

  it.each(expected)('button %i → %i', (index, actions) => {
    expect(readOnce(pad(0, [index]))).toBe(actions);
  });

  it('has 16 entries and is frozen', () => {
    expect(DEFAULT_GAMEPAD_BUTTONS).toHaveLength(16);
    expect(Object.isFrozen(DEFAULT_GAMEPAD_BUTTONS)).toBe(true);
  });

  it('ORs simultaneous buttons together', () => {
    expect(readOnce(pad(0, [0, 1, 9, 12, 15]))).toBe(
      Action.Shot |
        Action.Confirm |
        Action.Sub |
        Action.Back |
        Action.Pause |
        Action.Up |
        Action.Right,
    );
  });
});

describe('input-web/gamepad odd pads', () => {
  it('handles pads with fewer buttons and no axes', () => {
    const tiny: GamepadLike = {
      index: 0,
      connected: true,
      mapping: '',
      buttons: [{ pressed: true }, { pressed: false }],
      axes: [],
    };
    expect(readOnce(tiny)).toBe(Action.Shot | Action.Confirm);
  });

  it('treats NaN axes as centred', () => {
    expect(readOnce(pad(0, [], [Number.NaN, Number.NaN]))).toBe(0);
  });

  it('uses a custom button table', () => {
    const table = [Action.Pause];
    expect(readGamepadActions(pad(0, [0, 12]), { stickDirections: 0 }, table)).toBe(Action.Pause);
  });

  it('ignores the right stick (axes 2/3)', () => {
    expect(readOnce(pad(0, [], [0, 0, 1, 1]))).toBe(0);
  });
});

describe('input-web/gamepad stick → 8-way', () => {
  it('uses a 0.2 radial deadzone and 0.1 hysteresis', () => {
    expect(STICK_DEADZONE).toBe(0.2);
    expect(STICK_HYSTERESIS).toBe(0.1);
  });

  it.each([
    [0, Action.Right],
    [45, Action.Right | Action.Down],
    [90, Action.Down],
    [135, Action.Down | Action.Left],
    [180, Action.Left],
    [225, Action.Left | Action.Up],
    [270, Action.Up],
    [315, Action.Up | Action.Right],
  ])('%i° → %i', (degrees, mask) => {
    expect(readOnce(stick(degrees))).toBe(mask);
  });

  it('never reports opposite directions together', () => {
    for (let degrees = 0; degrees < 360; degrees += 5) {
      const mask = readOnce(stick(degrees));
      expect(mask & (Action.Left | Action.Right)).not.toBe(Action.Left | Action.Right);
      expect(mask & (Action.Up | Action.Down)).not.toBe(Action.Up | Action.Down);
      expect(mask).not.toBe(0);
    }
  });

  it('a radial deadzone: small deflections in any direction are ignored', () => {
    for (let degrees = 0; degrees < 360; degrees += 15) {
      expect(readOnce(stick(degrees, 0.19))).toBe(0);
    }
  });

  it('needs deadzone + hysteresis to activate but only the deadzone to stay active', () => {
    const state = { stickDirections: 0 };
    expect(readGamepadActions(stick(0, 0.28), state)).toBe(0);
    expect(readGamepadActions(stick(0, 0.31), state)).toBe(Action.Right);
    expect(readGamepadActions(stick(0, 0.21), state)).toBe(Action.Right);
    expect(readGamepadActions(stick(0, 0.19), state)).toBe(0);
    expect(state.stickDirections).toBe(0);
  });

  it('keeps a diagonal near the sector border but needs a clear angle to enter it', () => {
    // 20° below the x axis: the Down component (0.34) is below the enter threshold
    // (sin 22.5° + 0.1 ≈ 0.48) but above the stay threshold (≈ 0.28).
    const fresh = { stickDirections: 0 };
    expect(readGamepadActions(stick(20), fresh)).toBe(Action.Right);
    const held = { stickDirections: Action.Right | Action.Down };
    expect(readGamepadActions(stick(20), held)).toBe(Action.Right | Action.Down);
    // Rolling further towards the axis drops the diagonal.
    expect(readGamepadActions(stick(10), held)).toBe(Action.Right);
  });

  it('stores the stick result in the state and merges it with buttons', () => {
    const state = { stickDirections: 0 };
    expect(readGamepadActions(pad(0, [0], [-1, 0]), state)).toBe(
      Action.Left | Action.Shot | Action.Confirm,
    );
    expect(state.stickDirections).toBe(Action.Left);
  });
});
