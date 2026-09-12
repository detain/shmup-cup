/**
 * Edge cases of `dispatch`'s option handlers (plan M1-17): volume levels outside 0–10 are clamped
 * by the gain curve, profile indices reach the callback unchanged (the shell's callback filters
 * them), option events live next to the audio / fx handlers without being counted as unhandled,
 * several registrations each unregister on their own, and `applyAudioOptions` writes the four
 * buses in a fixed order at every level.
 */
import {
  SimEventKind,
  UserOptionKind,
  VOLUME_LEVELS,
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

/**
 * A volume target recording `[bus, gain]`.
 *
 * @returns The target and its log.
 */
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

describe('shell/dispatch option events (edge)', () => {
  it('clamps levels outside 0–10 through the gain curve', () => {
    const dispatcher = createEventDispatcher();
    const { calls, target } = recorder();
    connectOptionEvents(dispatcher, target, null);
    const queue = createEventQueue(8);
    queue.push(SimEventKind.UserOption, UserOptionKind.MasterVolume, 0, 0, 15);
    queue.push(SimEventKind.UserOption, UserOptionKind.MusicVolume, 0, 0, -4);
    queue.push(SimEventKind.UserOption, UserOptionKind.SfxVolume, 0, 0, 1);
    dispatcher.drain(queue);
    expect(calls).toEqual([
      ['master', 1],
      ['music', 0],
      ['sfx', volumeGain(1)],
      ['ui', volumeGain(1)],
    ]);
  });

  it('passes any profile index to the callback, in event order', () => {
    const dispatcher = createEventDispatcher();
    const { calls, target } = recorder();
    const seen: number[] = [];
    connectOptionEvents(dispatcher, target, (index) => seen.push(index));
    const queue = createEventQueue(8);
    for (const index of [0, -1, 3, 255]) {
      queue.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, index);
    }
    dispatcher.drain(queue);
    expect(seen).toEqual([0, -1, 3, 255]);
    expect(calls).toEqual([]); // profiles never touch the volumes
  });

  it('ignores the other event kinds and counts nothing as unhandled', () => {
    const dispatcher = createEventDispatcher();
    const { calls, target } = recorder();
    connectOptionEvents(dispatcher, target, null);
    const queue = createEventQueue(8);
    queue.push(SimEventKind.Sfx, UserOptionKind.MasterVolume, 0, 0, 0); // an SFX cue, not a volume
    queue.push(SimEventKind.UserOption, UserOptionKind.MasterVolume, 0, 0, 5);
    dispatcher.drain(queue);
    expect(calls).toEqual([['master', 0.25]]);
    expect(dispatcher.unhandled).toBe(1); // the SFX event (no audio handler here)
  });

  it('two registrations both run, and each unregisters only itself', () => {
    const dispatcher = createEventDispatcher();
    const first = recorder();
    const second = recorder();
    const offFirst = connectOptionEvents(dispatcher, first.target, null);
    connectOptionEvents(dispatcher, second.target, null);
    const queue = createEventQueue(4);
    queue.push(SimEventKind.UserOption, UserOptionKind.MusicVolume, 0, 0, 10);
    dispatcher.drain(queue);
    offFirst();
    queue.push(SimEventKind.UserOption, UserOptionKind.MusicVolume, 0, 0, 0);
    dispatcher.drain(queue);
    expect(first.calls).toEqual([['music', 1]]);
    expect(second.calls).toEqual([
      ['music', 1],
      ['music', 0],
    ]);
    expect(dispatcher.handlerCount(SimEventKind.UserOption)).toBe(1);
  });

  it('applyAudioOptions writes master, music, sfx, ui at every level', () => {
    for (let level = 0; level <= VOLUME_LEVELS; level++) {
      const { calls, target } = recorder();
      applyAudioOptions(target, { master: level, music: VOLUME_LEVELS - level, sfx: level });
      expect(calls, String(level)).toEqual([
        ['master', volumeGain(level)],
        ['music', volumeGain(VOLUME_LEVELS - level)],
        ['sfx', volumeGain(level)],
        ['ui', volumeGain(level)],
      ]);
    }
  });
});
