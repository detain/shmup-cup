import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { moduleInfo, readGamepadActions } from '../../src/gamepad/index.js';
import { pad } from '../helpers.js';

describe('input-web/gamepad readGamepadActions', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('gamepad');
  });

  it('maps standard buttons and the D-pad', () => {
    const state = { stickDirections: 0 };
    expect(readGamepadActions(pad(0, [0, 12]), state)).toBe(
      Action.Shot | Action.Confirm | Action.Up,
    );
    expect(readGamepadActions(pad(0, [9]), state)).toBe(Action.Pause);
  });

  it('applies a radial deadzone and 8-way directions to the left stick', () => {
    const state = { stickDirections: 0 };
    expect(readGamepadActions(pad(0, [], [0.15, 0.1]), state)).toBe(0);
    expect(readGamepadActions(pad(0, [], [0.9, 0]), state)).toBe(Action.Right);
    const diag = { stickDirections: 0 };
    expect(readGamepadActions(pad(0, [], [0.7, -0.7]), diag)).toBe(Action.Right | Action.Up);
  });

  it('uses hysteresis so a held direction does not flicker at the edge', () => {
    const state = { stickDirections: 0 };
    // 0.25 is inside the "enter" threshold (0.3) → nothing yet.
    expect(readGamepadActions(pad(0, [], [0.25, 0]), state)).toBe(0);
    expect(readGamepadActions(pad(0, [], [0.5, 0]), state)).toBe(Action.Right);
    // Once active, 0.25 (above the 0.2 deadzone) keeps it.
    expect(readGamepadActions(pad(0, [], [0.25, 0]), state)).toBe(Action.Right);
  });

  it('returns nothing for a disconnected pad', () => {
    const state = { stickDirections: Action.Left };
    expect(readGamepadActions({ ...pad(0, [0]), connected: false }, state)).toBe(0);
    expect(state.stickDirections).toBe(0);
  });
});
