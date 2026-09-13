/**
 * Edge cases of the merged browser input: device attribution, pad slots, custom
 * bindings, real DOM-style event targets and teardown.
 */
import { Action } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import type { GamepadLike } from '../../src/gamepad/index.js';
import { createWebInput } from '../../src/web-input/index.js';
import { key, pad } from '../helpers.js';

describe('input-web/web-input edge cases', () => {
  it('reports keyboard as the default key device and "none" before any input', () => {
    const input = createWebInput({ keyTarget: null });
    expect(input.poll().players[0]?.device).toBe('none');
    input.keyboard.handleEvent(key('keydown', 'KeyD'));
    expect(input.poll().players[0]?.device).toBe('keyboard');
  });

  it('remembers the last device while the player is idle', () => {
    const input = createWebInput({ keyTarget: null, keyDevice: 'remote' });
    input.keyboard.handleEvent(key('keydown', '', 37));
    input.poll();
    input.keyboard.handleEvent(key('keyup', '', 37));
    input.poll();
    expect(input.poll().players[0]?.device).toBe('remote');
  });

  it('merges keyboard and pad 0 into player 1; the pad wins device attribution', () => {
    const pads: Array<GamepadLike | null> = [pad(0, [15])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.keyboard.handleEvent(key('keydown', 'ArrowUp'));
    const p1 = input.poll().players[0];
    expect(p1?.held).toBe(Action.Up | Action.Right);
    expect(p1?.device).toBe('gamepad');
  });

  it('routes pad slots 2 and 3 to player 1 like every pad while one seat is routed (M2-06)', () => {
    const pads: Array<GamepadLike | null> = [null, null, pad(2, [0]), pad(3, [9])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    const snapshot = input.poll();
    expect(snapshot.players[0]?.held).toBe(Action.Shot | Action.Confirm | Action.Pause);
    expect(snapshot.players[1]?.held).toBe(0);
  });

  it('reads at most four pads and tolerates short or sparse arrays', () => {
    let calls = 0;
    const input = createWebInput({
      keyTarget: null,
      getGamepads: () => {
        calls++;
        return { length: 6, 0: pad(0, [9]) };
      },
    });
    expect(input.poll().players[0]?.held).toBe(Action.Pause);
    expect(calls).toBe(1);
  });

  it('keeps each pad slot’s stick hysteresis separate', () => {
    // Slot 0 has an active stick; slot 1 sees the same small deflection fresh.
    let pads: Array<GamepadLike | null> = [pad(0, [], [1, 0]), null];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.poll();
    pads = [pad(0, [], [0.25, 0]), pad(1, [], [0.25, 0])];
    const snapshot = input.poll();
    expect(snapshot.players[0]?.held).toBe(Action.Right);
    expect(snapshot.players[1]?.held).toBe(0);
  });

  it('releases a disconnected pad’s actions', () => {
    let pads: Array<GamepadLike | null> = [pad(0, [0])];
    const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
    input.poll();
    pads = [{ ...pad(0, [0]), connected: false }];
    const p1 = input.poll().players[0];
    expect(p1?.held).toBe(0);
    expect(p1?.released).toBe(Action.Shot | Action.Confirm);
  });

  it('uses custom key bindings', () => {
    const input = createWebInput({
      keyTarget: null,
      bindings: { byCode: { KeyK: Action.Special }, byKeyCode: {} },
    });
    input.keyboard.handleEvent(key('keydown', 'KeyK'));
    input.keyboard.handleEvent(key('keydown', 'ArrowUp'));
    expect(input.poll().players[0]?.held).toBe(Action.Special);
  });

  it('never assigns keyboard input to player 2', () => {
    const input = createWebInput({ keyTarget: null });
    input.keyboard.handleEvent(key('keydown', 'Space'));
    const snapshot = input.poll();
    expect(snapshot.players[1]?.held).toBe(0);
    expect(snapshot.players[1]?.device).toBe('none');
  });

  it('receives events from a real EventTarget and stops after destroy()', () => {
    const target = new EventTarget();
    const input = createWebInput({ keyTarget: target });
    const down = (code: string) =>
      target.dispatchEvent(
        Object.assign(new Event('keydown', { cancelable: true }), {
          code,
          keyCode: 0,
          repeat: false,
        }),
      );
    down('KeyA');
    expect(input.poll().players[0]?.held).toBe(Action.Left);
    target.dispatchEvent(new Event('blur'));
    expect(input.poll().players[0]?.released).toBe(Action.Left);
    input.destroy();
    down('KeyD');
    expect(input.poll().players[0]?.held).toBe(0);
  });

  it('clear() also resets the edge flags of the current snapshot', () => {
    const input = createWebInput({ keyTarget: null });
    input.keyboard.handleEvent(key('keydown', 'KeyW'));
    const snapshot = input.poll();
    expect(snapshot.players[0]?.pressed).toBe(Action.Up);
    input.clear();
    expect(snapshot.players[0]).toMatchObject({ held: 0, pressed: 0, released: 0 });
    // The next poll must not report a release for a key the game never saw go up.
    expect(input.poll().players[0]?.released).toBe(0);
  });
});
