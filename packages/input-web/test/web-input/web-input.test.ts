import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as inputWeb from '../../src/index.js';
import { createWebInput, moduleInfo } from '../../src/web-input/index.js';
import type { GamepadLike } from '../../src/gamepad/index.js';
import { key, pad } from '../helpers.js';

describe('input-web/web-input createWebInput', () => {
  it('describes itself and is exported from the package entry', () => {
    expect(moduleInfo.name).toBe('web-input');
    expect(inputWeb.createWebInput).toBe(createWebInput);
  });

  it('reuses one snapshot and derives edges per poll', () => {
    const input = createWebInput({ keyTarget: null, keyDevice: 'remote' });
    input.keyboard.handleEvent(key('keydown', 'ArrowLeft'));
    const first = input.poll();
    expect(first.players[0]?.held).toBe(Action.Left);
    expect(first.players[0]?.pressed).toBe(Action.Left);
    expect(first.players[0]?.device).toBe('remote');

    const second = input.poll();
    expect(second).toBe(first);
    expect(second.players[0]?.pressed).toBe(0);

    input.keyboard.handleEvent(key('keyup', 'ArrowLeft'));
    expect(input.poll().players[0]?.released).toBe(Action.Left);
  });

  it('never loses a remote tap shorter than a tick', () => {
    const input = createWebInput({ keyTarget: null });
    input.keyboard.handleEvent(key('keydown', '', 13));
    input.keyboard.handleEvent(key('keyup', '', 13));
    const p1 = input.poll().players[0];
    expect(p1?.held).toBe(0);
    expect(p1?.pressed).toBe(Action.Confirm | Action.PowerUp);
  });

  it('merges every gamepad into player 1 with one seat, a joined pad into player 2 with two', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [0]), pad(1, [15])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    let snapshot = input.poll();
    expect(snapshot.players[0]?.held).toBe(Action.Shot | Action.Confirm | Action.Right);
    expect(snapshot.players[0]?.device).toBe('gamepad');
    expect(snapshot.players[1]?.held).toBe(0);

    // A co-op game (M2-06): pad 1's START takes player 2's seat.
    input.setSeats(2);
    pads = [pad(0, [0]), pad(1, [15, 9])];
    snapshot = input.poll();
    expect(snapshot.players[0]?.held).toBe(Action.Shot | Action.Confirm);
    expect(snapshot.players[1]?.held).toBe(Action.Right | Action.Pause);
    expect(snapshot.players[1]?.pressed).toBe(Action.Right | Action.Pause | Action.Confirm);
    expect(snapshot.players[1]?.device).toBe('gamepad');

    pads = [null, null];
    expect(input.poll().players[1]?.released).toBe(Action.Right | Action.Pause);
  });

  it('clear() drops held input', () => {
    const input = createWebInput({ keyTarget: null });
    input.keyboard.handleEvent(key('keydown', 'Space'));
    input.poll();
    input.clear();
    expect(input.poll().players[0]?.held).toBe(0);
  });
});
