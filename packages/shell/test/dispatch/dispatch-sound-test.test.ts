/**
 * `dispatch` (plan M2-15): `connectSoundTest` answers the sound test's `SoundTest` event — the
 * audio engine plays the library track the event names; a failed load goes to the error callback
 * and never throws; unregistering stops it. And the boot wiring: the scene flow's sound test gets
 * the music library's titles.
 */
import { SimEventKind, createEventQueue } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { connectSoundTest, createEventDispatcher } from '../../src/dispatch/index.js';

describe('shell/dispatch sound test (M2-15)', () => {
  it('plays the track the event names, from its start', async () => {
    const dispatcher = createEventDispatcher();
    const calls: Array<[number, number | undefined]> = [];
    const off = connectSoundTest(dispatcher, {
      playTrack: (index, fade) => {
        calls.push([index, fade]);
        return Promise.resolve(true);
      },
    });
    const queue = createEventQueue(8);
    queue.push(SimEventKind.SoundTest, 3, 0, 0, 0);
    queue.push(SimEventKind.SoundTest, 0, 0, 0, 0);
    dispatcher.drain(queue);
    await Promise.resolve();
    expect(calls).toEqual([
      [3, 0],
      [0, 0],
    ]);
    off();
    queue.push(SimEventKind.SoundTest, 1, 0, 0, 0);
    dispatcher.drain(queue);
    expect(calls).toHaveLength(2);
  });

  it('reports a failed load to the callback without throwing', async () => {
    const dispatcher = createEventDispatcher();
    const errors: unknown[] = [];
    connectSoundTest(
      dispatcher,
      { playTrack: () => Promise.reject(new Error('decode failed')) },
      (error) => errors.push(error),
    );
    const queue = createEventQueue(8);
    queue.push(SimEventKind.SoundTest, 2, 0, 0, 0);
    expect(() => dispatcher.drain(queue)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errors).toHaveLength(1);
    // Without a callback the failure is swallowed.
    const quiet = createEventDispatcher();
    connectSoundTest(quiet, { playTrack: () => Promise.reject(new Error('x')) });
    queue.push(SimEventKind.SoundTest, 2, 0, 0, 0);
    expect(() => quiet.drain(queue)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
