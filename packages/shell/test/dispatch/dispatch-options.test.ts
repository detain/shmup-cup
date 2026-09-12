/**
 * `dispatch` (plan M1-17): `connectOptionEvents` turns the Options screen's `UserOption` events
 * into bus volumes (SFX drives the `ui` bus too) and profile switches; `applyAudioOptions` sets the
 * saved volumes at boot.
 */
import {
  SimEventKind,
  UserOptionKind,
  createEventQueue,
  volumeGain,
  type AudioBus,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  applyAudioOptions,
  connectOptionEvents,
  createEventDispatcher,
} from '../../src/dispatch/index.js';

/** A volume target recording `[bus, gain]`. */
function recorder() {
  const calls: Array<[AudioBus, number]> = [];
  return {
    calls,
    target: {
      setBusVolume: (bus: AudioBus, gain: number) => {
        calls.push([bus, gain]);
      },
    },
  };
}

describe('shell/dispatch option events', () => {
  it('sets bus volumes from levels and forwards profile choices', () => {
    const dispatcher = createEventDispatcher();
    const { calls, target } = recorder();
    const profiles: number[] = [];
    const off = connectOptionEvents(dispatcher, target, (index) => profiles.push(index));
    const queue = createEventQueue(16);
    queue.push(SimEventKind.UserOption, UserOptionKind.MasterVolume, 0, 0, 10);
    queue.push(SimEventKind.UserOption, UserOptionKind.MusicVolume, 0, 0, 3);
    queue.push(SimEventKind.UserOption, UserOptionKind.SfxVolume, 0, 0, 5);
    queue.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, 2);
    queue.push(SimEventKind.UserOption, 99, 0, 0, 1); // unknown option: ignored
    dispatcher.drain(queue);
    expect(calls).toEqual([
      ['master', 1],
      ['music', volumeGain(3)],
      ['sfx', 0.25],
      ['ui', 0.25],
    ]);
    expect(profiles).toEqual([2]);
    off();
    off();
    queue.push(SimEventKind.UserOption, UserOptionKind.MasterVolume, 0, 0, 0);
    dispatcher.drain(queue);
    expect(calls).toHaveLength(4);
    expect(dispatcher.handlerCount(SimEventKind.UserOption)).toBe(0);
  });

  it('ignores profile events without a callback', () => {
    const dispatcher = createEventDispatcher();
    const { calls, target } = recorder();
    connectOptionEvents(dispatcher, target, null);
    const queue = createEventQueue(4);
    queue.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, 0);
    dispatcher.drain(queue);
    expect([calls, dispatcher.unhandled]).toEqual([[], 0]);
  });

  it('applies saved audio options to all four buses', () => {
    const { calls, target } = recorder();
    applyAudioOptions(target, { master: 0, music: 10, sfx: 5 });
    expect(calls).toEqual([
      ['master', 0],
      ['music', 1],
      ['sfx', 0.25],
      ['ui', 0.25],
    ]);
  });
});
