/**
 * `web-input` rebinding capture (plan M2-16 — `WebInput.beginCapture` / `capture` / `endCapture`,
 * the Options screen's rebind prompt): a key capture completes on the next new key seen by a
 * `poll()`; Escape and the remote's Back (key code 10009) cancel it — a key or a button capture;
 * a button capture takes the lowest gamepad button newly pressed on a poll (buttons held when it
 * began do not count) and ignores other keys (the keyboard re-arms); `endCapture` returns to idle
 * and disarms the keyboard; a new capture clears what the last one caught; the captured press is
 * still handled as usual.
 */
import { Action, CaptureStatus } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as inputWeb from '../../src/index.js';
import type { GamepadLike } from '../../src/gamepad/index.js';
import { InputCaptureState, createWebInput } from '../../src/web-input/index.js';
import { key, pad } from '../helpers.js';

/**
 * A web input over a gamepad slot the test swaps.
 *
 * @returns The input and a setter for the pad's pressed buttons.
 */
function setup(): { input: ReturnType<typeof createWebInput>; press: (buttons: number[]) => void } {
  let pads: Array<GamepadLike | null> = [pad(0)];
  const input = createWebInput({ keyTarget: null, getGamepads: () => pads });
  return {
    input,
    press: (buttons) => {
      pads = [pad(0, buttons)];
    },
  };
}

describe('input-web/web-input rebinding capture (M2-16)', () => {
  it('is exported and idle before a capture', () => {
    expect(inputWeb.InputCaptureState).toBe(InputCaptureState);
    const { input } = setup();
    expect(input.capture).toBeInstanceOf(InputCaptureState);
    expect([
      input.capture.status,
      input.capture.kind,
      input.capture.code,
      input.capture.keyCode,
      input.capture.button,
    ]).toEqual([CaptureStatus.Idle, 'keys', '', 0, -1]);
    input.keyboard.handleEvent(key('keydown', 'KeyJ', 74));
    input.poll();
    expect(input.capture.status).toBe(CaptureStatus.Idle);
  });

  it('captures the next key on the next poll, and the key still acts', () => {
    const { input } = setup();
    input.beginCapture('keys');
    expect(input.capture.status).toBe(CaptureStatus.Waiting);
    expect(input.keyboard.capture.armed).toBe(true);
    input.poll();
    expect(input.capture.status).toBe(CaptureStatus.Waiting);
    input.keyboard.handleEvent(key('keydown', 'ArrowUp', 38));
    // Nothing changes until a poll reads the catch.
    expect(input.capture.status).toBe(CaptureStatus.Waiting);
    const snapshot = input.poll();
    expect([
      input.capture.status,
      input.capture.code,
      input.capture.keyCode,
      input.capture.button,
    ]).toEqual([CaptureStatus.Captured, 'ArrowUp', 38, -1]);
    expect(snapshot.players[0]?.held).toBe(Action.Up);
    // Later keys change nothing: the capture holds the first one.
    input.keyboard.handleEvent(key('keydown', 'KeyJ', 74));
    input.poll();
    expect(input.capture.code).toBe('ArrowUp');
  });

  it('a key held when the capture began does not count', () => {
    const { input } = setup();
    input.keyboard.handleEvent(key('keydown', 'Enter', 13));
    input.poll();
    input.beginCapture('keys');
    input.keyboard.handleEvent(key('keydown', 'Enter', 13)); // a repeat without the flag
    input.poll();
    expect(input.capture.status).toBe(CaptureStatus.Waiting);
    input.keyboard.handleEvent(key('keydown', 'Space', 32));
    input.poll();
    expect([input.capture.status, input.capture.code]).toEqual([CaptureStatus.Captured, 'Space']);
  });

  it('Escape and the remote’s Back cancel a key capture', () => {
    const { input } = setup();
    input.beginCapture('keys');
    input.keyboard.handleEvent(key('keydown', 'Escape', 27));
    input.poll();
    expect(input.capture.status).toBe(CaptureStatus.Cancelled);
    input.keyboard.handleEvent(key('keyup', 'Escape', 27));
    input.poll();
    input.beginCapture('keys');
    input.keyboard.handleEvent(key('keydown', '', 10009));
    input.poll();
    expect(input.capture.status).toBe(CaptureStatus.Cancelled);
    // The remote's Back sent with a code as well cancels too.
    input.keyboard.handleEvent(key('keyup', '', 10009));
    input.poll();
    input.beginCapture('keys');
    input.keyboard.handleEvent(key('keydown', 'XF86Back', 10009));
    input.poll();
    expect(input.capture.status).toBe(CaptureStatus.Cancelled);
  });

  it('a button capture takes the lowest button newly pressed; buttons held before do not count', () => {
    const { input, press } = setup();
    press([2]);
    input.poll();
    input.beginCapture('buttons');
    expect([input.capture.kind, input.capture.status]).toEqual(['buttons', CaptureStatus.Waiting]);
    input.poll(); // X still held
    expect(input.capture.status).toBe(CaptureStatus.Waiting);
    press([2, 9, 5]);
    input.poll();
    expect([
      input.capture.status,
      input.capture.button,
      input.capture.code,
      input.capture.keyCode,
    ]).toEqual([CaptureStatus.Captured, 5, '', 0]);
    // Captured: the next buttons change nothing.
    press([0]);
    input.poll();
    expect(input.capture.button).toBe(5);
  });

  it('a button capture ignores keys (the keyboard re-arms) but Escape still cancels it', () => {
    const { input, press } = setup();
    input.beginCapture('buttons');
    input.keyboard.handleEvent(key('keydown', 'KeyK', 75));
    input.poll();
    expect(input.capture.status).toBe(CaptureStatus.Waiting);
    expect(input.keyboard.capture.armed).toBe(true);
    input.keyboard.handleEvent(key('keydown', 'KeyL', 76));
    input.poll();
    expect(input.capture.status).toBe(CaptureStatus.Waiting);
    press([1]);
    input.poll();
    expect([input.capture.status, input.capture.button]).toEqual([CaptureStatus.Captured, 1]);
    // Another capture: Escape cancels a button capture as well.
    press([]);
    input.poll();
    input.beginCapture('buttons');
    input.keyboard.handleEvent(key('keydown', 'Escape', 27));
    input.poll();
    expect(input.capture.status).toBe(CaptureStatus.Cancelled);
  });

  it('a key capture ignores gamepad buttons', () => {
    const { input, press } = setup();
    input.beginCapture('keys');
    press([0]);
    input.poll();
    expect(input.capture.status).toBe(CaptureStatus.Waiting);
  });

  it('endCapture returns to idle and disarms the keyboard; a key then is not caught', () => {
    const { input } = setup();
    input.beginCapture('keys');
    input.endCapture();
    expect(input.capture.status).toBe(CaptureStatus.Idle);
    expect(input.keyboard.capture.armed).toBe(false);
    input.keyboard.handleEvent(key('keydown', 'KeyJ', 74));
    input.poll();
    expect(input.capture.status).toBe(CaptureStatus.Idle);
    expect(input.keyboard.capture.count).toBe(0);
  });

  it('a new capture forgets what the last one caught; any other kind means keys', () => {
    const { input, press } = setup();
    press([3]);
    input.beginCapture('buttons');
    input.poll();
    expect(input.capture.button).toBe(3);
    input.beginCapture('bogus' as never);
    expect([
      input.capture.kind,
      input.capture.status,
      input.capture.code,
      input.capture.keyCode,
      input.capture.button,
    ]).toEqual(['keys', CaptureStatus.Waiting, '', 0, -1]);
    // A key caught by the keyboard before this capture began is not this capture's.
    input.endCapture();
    input.keyboard.capture.armed = true;
    input.keyboard.handleEvent(key('keydown', 'KeyQ', 81));
    input.beginCapture('keys');
    input.poll();
    expect(input.capture.status).toBe(CaptureStatus.Waiting);
    input.keyboard.handleEvent(key('keydown', 'KeyW', 87));
    input.poll();
    expect([input.capture.status, input.capture.code]).toEqual([CaptureStatus.Captured, 'KeyW']);
  });

  it('works without any gamepad accessor (keys only)', () => {
    const input = createWebInput({ keyTarget: null });
    input.beginCapture('buttons');
    input.poll();
    expect(input.capture.status).toBe(CaptureStatus.Waiting);
    input.keyboard.handleEvent(key('keydown', 'Escape', 27));
    input.poll();
    expect(input.capture.status).toBe(CaptureStatus.Cancelled);
  });
});
