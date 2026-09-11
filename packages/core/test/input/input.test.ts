import { describe, expect, it } from 'vitest';
import {
  ACTION_NAMES,
  Action,
  MAX_PLAYERS,
  commitPlayerInput,
  copyInputSnapshot,
  createInputSnapshot,
  hasAction,
  moduleInfo,
  resetInputSnapshot,
} from '../../src/input/index.js';

describe('core/input', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('input');
  });

  it('defines one distinct bit per action', () => {
    const bits = ACTION_NAMES.map((name) => Action[name]);
    expect(new Set(bits).size).toBe(ACTION_NAMES.length);
    for (const bit of bits) expect(bit & (bit - 1)).toBe(0);
    expect(Object.keys(Action)).toEqual([...ACTION_NAMES]);
  });

  it('creates a snapshot with MAX_PLAYERS idle players', () => {
    const snapshot = createInputSnapshot();
    expect(snapshot.players).toHaveLength(MAX_PLAYERS);
    for (const p of snapshot.players)
      expect(p).toEqual({ held: 0, pressed: 0, released: 0, device: 'none' });
  });

  it('derives pressed/released edges and keeps latched taps', () => {
    const p = createInputSnapshot().players[0];
    commitPlayerInput(p, Action.Right | Action.Shot);
    expect(p.pressed).toBe(Action.Right | Action.Shot);
    expect(p.released).toBe(0);

    commitPlayerInput(p, Action.Shot);
    expect(p.pressed).toBe(0);
    expect(p.released).toBe(Action.Right);

    // A tap that went down and up between two polls still counts as pressed.
    commitPlayerInput(p, Action.Shot, Action.Confirm);
    expect(hasAction(p.pressed, Action.Confirm)).toBe(true);
    expect(hasAction(p.held, Action.Confirm)).toBe(false);
  });

  it('copies and resets without replacing objects', () => {
    const a = createInputSnapshot();
    const b = createInputSnapshot();
    const target = b.players[1];
    commitPlayerInput(a.players[1], Action.Pause);
    a.players[1].device = 'gamepad';
    copyInputSnapshot(a, b);
    expect(b.players[1]).toBe(target);
    expect(target.held).toBe(Action.Pause);
    expect(target.device).toBe('gamepad');
    resetInputSnapshot(b);
    expect(target.held).toBe(0);
    expect(target.pressed).toBe(0);
  });
});
