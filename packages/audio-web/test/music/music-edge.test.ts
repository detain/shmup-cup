/**
 * Edge cases of the music player (plan M1-15) against a fake `AudioContext`: loop points that do
 * not make a loop, a loop over the whole buffer, the one-shot's end boundary, bad fade lengths,
 * a custom tick length, a second fade-out (re-scheduled from the current level, and safe on
 * engines that throw on a second `stop()`), a new track over a fading one, a duck replacing a
 * duck, duck level clamping, the duck's attack length, and an inert player after `destroy()`.
 */
import { describe, expect, it } from 'vitest';
import {
  DUCK_ATTACK_TICKS,
  TICK_SECONDS,
  createMusicPlayer,
  type MusicBuffer,
} from '../../src/music/index.js';
import {
  FakeBuffer,
  FakeContext,
  type FakeGain,
  type FakeSource,
} from '../helpers/fake-context.js';

/**
 * A player on a fresh fake context.
 *
 * @param tickSeconds - Seconds per tick (default: the player's).
 * @returns The context, gains and player.
 */
function setup(tickSeconds?: number) {
  const context = new FakeContext();
  const bus = context.createGain();
  const player = createMusicPlayer({ context, destination: bus, tickSeconds });
  const [fade, duck] = context.gains.slice(1) as [FakeGain, FakeGain];
  return { context, fade, duck, player };
}

/**
 * A 22,050 Hz track.
 *
 * @param seconds - Length.
 * @param loopStart - Loop start in samples.
 * @param loopEnd - Loop end in samples.
 * @returns The track.
 */
const trackOf = (seconds: number, loopStart: number, loopEnd: number): MusicBuffer => ({
  id: `t${seconds}`,
  buffer: new FakeBuffer(1, seconds * 22050, 22050),
  loopStart,
  loopEnd,
});

/**
 * The n-th source the player created.
 *
 * @param context - The fake context.
 * @param index - Creation order.
 * @returns The source.
 */
const sourceAt = (context: FakeContext, index: number): FakeSource => {
  const found = context.sources[index];
  if (found === undefined) throw new Error(`no source ${index}`);
  return found;
};

/**
 * Makes a source behave like engines that throw `InvalidStateError` on a second `stop()`.
 *
 * @param source - The source.
 */
function strictStop(source: FakeSource): void {
  const stop = source.stop.bind(source);
  source.stop = (when?: number) => {
    if (source.stops > 0) throw new Error('InvalidStateError: stop() already called');
    stop(when);
  };
}

describe('audio-web/music (edge)', () => {
  it('plays loop points that do not make a loop as a one-shot', () => {
    for (const [start, end] of [
      [22050, 22050],
      [44100, 22050],
      [-1, 44100],
      [-1, -1],
    ]) {
      const { context, player } = setup();
      player.play(trackOf(2, start, end));
      const source = sourceAt(context, 0);
      expect(source.loop, `${start}…${end}`).toBe(false);
      expect([source.loopStart, source.loopEnd]).toEqual([0, 0]);
      context.currentTime = 2;
      expect(player.playing).toBe(false);
    }
  });

  it('loops a whole buffer (loopStart 0) and never reports it finished', () => {
    const { context, player } = setup();
    player.play(trackOf(3, 0, 3 * 22050));
    const source = sourceAt(context, 0);
    expect([source.loop, source.loopStart, source.loopEnd]).toEqual([true, 0, 3]);
    context.currentTime = 1e6;
    expect(player.playing).toBe(true);
  });

  it('reports a one-shot playing until exactly its duration', () => {
    const { context, player } = setup();
    context.currentTime = 10;
    player.play(trackOf(2, -1, -1));
    context.currentTime = 11.999;
    expect(player.playing).toBe(true);
    context.currentTime = 12;
    expect(player.playing).toBe(false);
  });

  it('starts at full volume for a fade-in that is 0, negative or not a number', () => {
    for (const fadeInTicks of [0, -30, Number.NaN]) {
      const { fade, player } = setup();
      player.play(trackOf(1, -1, -1), { fadeInTicks });
      expect(fade.gain.calls, String(fadeInTicks)).toEqual([
        { op: 'cancel', time: 0 },
        { op: 'set', value: 1, time: 0 },
      ]);
    }
  });

  it('schedules fades and ducks with a custom tick length', () => {
    const { context, fade, duck, player } = setup(0.02);
    context.currentTime = 1;
    player.play(trackOf(1, -1, -1), { fadeInTicks: 30 });
    expect(fade.gain.calls[2]).toEqual({ op: 'ramp', value: 1, time: 1 + 30 * 0.02 });
    player.duck(0.5, 100);
    expect(duck.gain.calls.slice(2)).toEqual([
      { op: 'ramp', value: 0.5, time: 1 + DUCK_ATTACK_TICKS * 0.02 },
      { op: 'set', value: 0.5, time: 1 + 50 * 0.02 },
      { op: 'ramp', value: 1, time: 1 + 100 * 0.02 },
    ]);
  });

  it('re-schedules a second fade-out from the current level (engines that throw on a second stop() included)', () => {
    const { context, fade, player } = setup();
    player.play(trackOf(4, 22050, 4 * 22050));
    const source = sourceAt(context, 0);
    strictStop(source);
    context.currentTime = 1;
    player.stop(60);
    expect(source.stopped).toBe(1 + 60 * TICK_SECONDS);
    // Halfway down the ramp, a second fade-out (a `Silence` over a `Silence`).
    context.currentTime = 1.5;
    fade.gain.value = 0.5;
    fade.gain.calls.length = 0;
    expect(() => player.stop(30)).not.toThrow();
    expect(fade.gain.calls).toEqual([
      { op: 'cancel', time: 1.5 },
      { op: 'set', value: 0.5, time: 1.5 },
      { op: 'ramp', value: 0, time: 1.5 + 30 * TICK_SECONDS },
    ]);
    expect(player.current).toBeNull();
    // And a hard stop after that still detaches the source.
    expect(() => player.stop()).not.toThrow();
    expect(source.disconnected).toBe(1);
  });

  it('hard-stops a fading track when a new one starts, and resets the fade gain', () => {
    const { context, fade, player } = setup();
    player.play(trackOf(4, 22050, 4 * 22050));
    context.currentTime = 2;
    player.stop(120);
    context.currentTime = 2.5;
    fade.gain.calls.length = 0;
    player.play(trackOf(2, -1, -1));
    const fading = sourceAt(context, 0);
    expect(fading.stops).toBe(2); // the scheduled stop, then the hard stop
    expect(fading.stopped).toBe(0);
    expect(fading.disconnected).toBe(1);
    expect(fade.gain.calls).toEqual([
      { op: 'cancel', time: 2.5 },
      { op: 'set', value: 1, time: 2.5 },
    ]);
    expect(player.playing).toBe(true);
  });

  it('restarts the same track from its beginning on a second play()', () => {
    const { context, player } = setup();
    const track = trackOf(4, 22050, 4 * 22050);
    player.play(track);
    player.play(track);
    expect(context.sources).toHaveLength(2);
    expect(sourceAt(context, 0).stops).toBe(1);
    expect(sourceAt(context, 1).started).toBe(0);
    expect(player.current).toBe(track);
  });

  it('replaces a running duck from the level it has reached', () => {
    const { context, duck, player } = setup();
    player.play(trackOf(4, 22050, 4 * 22050));
    player.duck(0.35, 120);
    context.currentTime = 0.5;
    duck.gain.value = 0.35;
    duck.gain.calls.length = 0;
    player.duck(0.2, 60);
    expect(duck.gain.calls.slice(0, 3)).toEqual([
      { op: 'cancel', time: 0.5 },
      { op: 'set', value: 0.35, time: 0.5 },
      { op: 'ramp', value: 0.2, time: 0.5 + DUCK_ATTACK_TICKS * TICK_SECONDS },
    ]);
  });

  it('clamps the duck level to 0…1 and keeps its attack within a quarter of it', () => {
    const level = (value: number): number | undefined => {
      const { duck, player } = setup();
      player.duck(value, 120);
      return duck.gain.calls[2]?.op === 'ramp' ? duck.gain.calls[2].value : undefined;
    };
    expect([level(-0.5), level(Number.NaN), level(0), level(0.4), level(1), level(3)]).toEqual([
      0, 0, 0, 0.4, 1, 1,
    ]);
    const attack = (ticks: number): number | undefined => {
      const { duck, player } = setup();
      player.duck(0.5, ticks);
      return duck.gain.calls[2]?.time;
    };
    expect(attack(16)).toBeCloseTo(4 * TICK_SECONDS, 12); // = a quarter, = DUCK_ATTACK_TICKS
    expect(attack(100)).toBeCloseTo(DUCK_ATTACK_TICKS * TICK_SECONDS, 12);
    expect(attack(2)).toBeCloseTo(0.5 * TICK_SECONDS, 12);
  });

  it('ducks with no track playing (the next track starts ducked) and ignores stop() when idle', () => {
    const { context, duck, player } = setup();
    player.duck(0.35, 60);
    expect(duck.gain.calls).toHaveLength(5);
    expect(() => player.stop(30)).not.toThrow();
    expect(() => player.stop()).not.toThrow();
    expect(context.sources).toHaveLength(0);
    expect(player.current).toBeNull();
    expect(player.playing).toBe(false);
  });

  it('schedules nothing after destroy()', () => {
    const { context, fade, duck, player } = setup();
    player.play(trackOf(1, -1, -1));
    player.destroy();
    const fadeCalls = fade.gain.calls.length;
    player.play(trackOf(1, -1, -1), { fadeInTicks: 30 });
    player.stop(30);
    player.duck(0.3, 30);
    expect(fade.gain.calls).toHaveLength(fadeCalls);
    expect(duck.gain.calls).toHaveLength(0);
    expect(context.sources).toHaveLength(1);
    expect(player.playing).toBe(false);
  });
});
