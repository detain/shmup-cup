/**
 * `isPlaybackContext` (plan M1-15): the run-time check that decides whether the audio engine can
 * attach to a context — a real `AudioContext` (and the recording fake of the audio tests) can play
 * buffers; the minimal contexts of the boot tests cannot, and audio then stays silent instead of
 * failing.
 */
import { describe, expect, it } from 'vitest';
import * as audioWeb from '../../src/index.js';
import { isPlaybackContext, type AudioContextLike } from '../../src/web-audio/index.js';
import { FakeContext } from '../helpers/fake-context.js';

/**
 * A context with only the bus-graph members of `AudioContextLike`, plus extra fields.
 *
 * @param extra - Members to add.
 * @returns The context.
 */
function minimal(extra: Record<string, unknown> = {}): AudioContextLike {
  return {
    state: 'running',
    destination: {},
    createGain: () => ({ gain: { value: 1 }, connect: () => undefined, disconnect: () => {} }),
    resume: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
    close: () => Promise.resolve(),
    ...extra,
  };
}

describe('audio-web/web-audio isPlaybackContext', () => {
  it('accepts a context that has a clock, createBuffer and createBufferSource', () => {
    expect(isPlaybackContext(new FakeContext())).toBe(true);
    expect(
      isPlaybackContext(
        minimal({ currentTime: 0, createBuffer: () => null, createBufferSource: () => null }),
      ),
    ).toBe(true);
    expect(audioWeb.isPlaybackContext).toBe(isPlaybackContext);
  });

  it('rejects null and contexts missing any of the three', () => {
    expect(isPlaybackContext(null)).toBe(false);
    expect(isPlaybackContext(minimal())).toBe(false);
    const full = { currentTime: 0, createBuffer: () => null, createBufferSource: () => null };
    expect(isPlaybackContext(minimal({ ...full, currentTime: undefined }))).toBe(false);
    expect(isPlaybackContext(minimal({ ...full, currentTime: '0' }))).toBe(false);
    expect(isPlaybackContext(minimal({ ...full, createBuffer: undefined }))).toBe(false);
    expect(isPlaybackContext(minimal({ ...full, createBufferSource: {} }))).toBe(false);
  });
});
