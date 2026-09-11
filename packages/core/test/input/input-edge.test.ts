/**
 * Edge cases of the input snapshot helpers: edge derivation across several ticks, tap
 * latching while the key is still held, copying between snapshots of different sizes.
 */
import { describe, expect, it } from 'vitest';
import {
  ACTION_NAMES,
  Action,
  MAX_PLAYERS,
  commitPlayerInput,
  copyInputSnapshot,
  createInputSnapshot,
  hasAction,
  resetInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';

describe('core/input edge cases', () => {
  it('fits every action into 16 bits (input adapters count keys per bit in an Int16Array)', () => {
    const all = ACTION_NAMES.reduce((mask, name) => mask | Action[name], 0);
    expect(all).toBeLessThan(1 << 16);
    expect(all).toBe((1 << ACTION_NAMES.length) - 1);
  });

  it('freezes the action name list', () => {
    expect(Object.isFrozen(ACTION_NAMES)).toBe(true);
  });

  it('supports two players (co-op)', () => {
    expect(MAX_PLAYERS).toBe(2);
  });

  it('creates independent player objects', () => {
    const snapshot = createInputSnapshot();
    commitPlayerInput(snapshot.players[0], Action.Up);
    expect(snapshot.players[1].held).toBe(0);
    expect(createInputSnapshot().players[0]).not.toBe(snapshot.players[0]);
  });

  it('reports pressed for a tap even while the same action is held by another source', () => {
    const p = createInputSnapshot().players[0];
    commitPlayerInput(p, Action.Shot);
    // Still held, but a second key bound to Shot was tapped between polls.
    commitPlayerInput(p, Action.Shot, Action.Shot);
    expect(p.pressed).toBe(Action.Shot);
    expect(p.released).toBe(0);
  });

  it('derives press, hold, release over a sequence of ticks', () => {
    const p = createInputSnapshot().players[0];
    const trace: Array<[number, number, number]> = [];
    for (const held of [0, Action.Left, Action.Left | Action.Up, Action.Up, 0, 0]) {
      commitPlayerInput(p, held);
      trace.push([p.held, p.pressed, p.released]);
    }
    expect(trace).toEqual([
      [0, 0, 0],
      [Action.Left, Action.Left, 0],
      [Action.Left | Action.Up, Action.Up, 0],
      [Action.Up, 0, Action.Left],
      [0, 0, Action.Up],
      [0, 0, 0],
    ]);
  });

  it('does not change the device when committing actions', () => {
    const p = createInputSnapshot().players[0];
    p.device = 'remote';
    commitPlayerInput(p, Action.Confirm);
    expect(p.device).toBe('remote');
  });

  it('resetInputSnapshot keeps the device, so the HUD still knows the last controller', () => {
    const snapshot = createInputSnapshot();
    snapshot.players[0].device = 'gamepad';
    commitPlayerInput(snapshot.players[0], Action.Pause);
    resetInputSnapshot(snapshot);
    expect(snapshot.players[0]).toEqual({ held: 0, pressed: 0, released: 0, device: 'gamepad' });
  });

  it('after a reset the next commit does not report a spurious release', () => {
    const p = createInputSnapshot().players[0];
    commitPlayerInput(p, Action.Right);
    resetInputSnapshot({ players: [p] });
    commitPlayerInput(p, 0);
    expect(p.released).toBe(0);
  });

  it('copyInputSnapshot copies only the players both snapshots have', () => {
    const source: InputSnapshot = createInputSnapshot();
    commitPlayerInput(source.players[0], Action.Up);
    commitPlayerInput(source.players[1], Action.Down);
    const smaller: InputSnapshot = { players: [createInputSnapshot().players[0]] };
    copyInputSnapshot(source, smaller);
    expect(smaller.players).toHaveLength(1);
    expect(smaller.players[0].held).toBe(Action.Up);

    const target = createInputSnapshot();
    copyInputSnapshot(smaller, target);
    expect(target.players[0].held).toBe(Action.Up);
    expect(target.players[1].held).toBe(0);
  });

  it('hasAction tests any of several bits', () => {
    const mask = Action.Up | Action.Shot;
    expect(hasAction(mask, Action.Shot)).toBe(true);
    expect(hasAction(mask, Action.Left | Action.Shot)).toBe(true);
    expect(hasAction(mask, Action.Left | Action.Right)).toBe(false);
    expect(hasAction(0, Action.Up)).toBe(false);
    expect(hasAction(mask, 0)).toBe(false);
  });
});
