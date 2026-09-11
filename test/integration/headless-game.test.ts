import { Action, createGame, type Platform } from '@shmup/core';
import { createWebInput } from '@shmup/input-web';
import { describe, expect, it } from 'vitest';

const STEP = 1000 / 60;

/** A headless platform whose input comes from the real browser input adapter. */
function platformWithWebInput() {
  const keys = new EventTarget();
  const input = createWebInput({ keyTarget: keys, keyDevice: 'remote' });
  const platform: Platform = {
    id: 'headless',
    input,
    storage: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    audio: { unlock: () => Promise.resolve() },
    lifecycle: { onSuspend: () => {}, onResume: () => {} },
    exit: null,
    display: { cssWidth: 1920, cssHeight: 1080 },
    caps: { gamepad: false, remoteOnly: true, webgl2: false },
  };
  const press = (type: 'keydown' | 'keyup', keyCode: number) => {
    keys.dispatchEvent(Object.assign(new Event(type), { code: '', keyCode, repeat: false }));
  };
  return { platform, press };
}

describe('integration: core + input-web', () => {
  it('runs 10 simulated seconds at exactly 60 ticks per second', () => {
    const { platform } = platformWithWebInput();
    const game = createGame(platform);
    game.frame(0);
    for (let frame = 1; frame <= 600; frame++) game.frame(frame * STEP);
    expect(game.state.tick).toBe(600);
  });

  it('delivers a Samsung-remote key press (keyCode only) to the simulation as an action', () => {
    const { platform, press } = platformWithWebInput();
    const game = createGame(platform);
    game.frame(0);

    press('keydown', 39); // remote → arrow
    game.frame(STEP);
    const p1 = game.state.input?.players[0];
    expect(p1?.held).toBe(Action.Right);
    expect(p1?.pressed).toBe(Action.Right);
    expect(p1?.device).toBe('remote');

    press('keyup', 39);
    press('keydown', 10009); // Back, tapped between two ticks
    press('keyup', 10009);
    game.frame(2 * STEP);
    expect(p1?.released).toBe(Action.Right);
    expect(p1?.pressed).toBe(Action.Back);
  });
});
