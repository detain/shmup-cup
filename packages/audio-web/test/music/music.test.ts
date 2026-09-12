/**
 * The music player against a fake `AudioContext` (plan M1-15): loop points from sample indices,
 * one track resident, fade-in / fade-out ramps, and ducking scheduled as gain ramps on the
 * context clock.
 */
import { describe, expect, it } from 'vitest';
import * as audioWeb from '../../src/index.js';
import {
  DUCK_ATTACK_TICKS,
  TICK_SECONDS,
  createMusicPlayer,
  moduleInfo,
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
 * @returns The context, bus, gains and player.
 */
function setup() {
  const context = new FakeContext();
  const bus = context.createGain();
  const player = createMusicPlayer({ context, destination: bus });
  const [fade, duck] = context.gains.slice(1) as [FakeGain, FakeGain];
  return { context, bus, fade, duck, player };
}

/** A looping track at 22,050 Hz: 1 s intro, 3 s loop. */
const LOOPING: MusicBuffer = {
  id: 'zone-a',
  buffer: new FakeBuffer(1, 4 * 22050, 22050),
  loopStart: 22050,
  loopEnd: 4 * 22050,
};

/** A one-shot jingle of 2 s. */
const JINGLE: MusicBuffer = {
  id: 'stage-clear',
  buffer: new FakeBuffer(1, 2 * 22050, 22050),
  loopStart: -1,
  loopEnd: -1,
};

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

describe('audio-web/music', () => {
  it('describes itself and is exported from the package entry', () => {
    expect(moduleInfo.name).toBe('music');
    expect(moduleInfo.status).toBe('implemented');
    expect(audioWeb.createMusicPlayer).toBe(createMusicPlayer);
  });

  it('wires source → fade → duck → music bus', () => {
    const { context, bus, fade, duck, player } = setup();
    expect(fade.connections).toEqual([duck]);
    expect(duck.connections).toEqual([bus]);
    player.play(LOOPING);
    expect(sourceAt(context, 0).connections).toEqual([fade]);
  });

  it('sets loop / loopStart / loopEnd from the sample indices (sample-exact)', () => {
    const { context, player } = setup();
    player.play(LOOPING);
    const source = sourceAt(context, 0);
    expect(source.buffer).toBe(LOOPING.buffer);
    expect(source.loop).toBe(true);
    expect(source.loopStart).toBe(1);
    expect(source.loopEnd).toBe(4);
    // Odd sample counts survive the trip through seconds exactly.
    const odd: MusicBuffer = { ...LOOPING, loopStart: 141120, loopEnd: 1128961 };
    player.play(odd);
    const second = sourceAt(context, 1);
    expect(Math.round(second.loopStart * 22050)).toBe(141120);
    expect(Math.round(second.loopEnd * 22050)).toBe(1128961);
    expect(Math.abs(second.loopEnd * 22050 - 1128961)).toBeLessThan(1e-6);
    expect(source.started).toBe(0);
    expect(player.playing).toBe(true);
    expect(player.current).toBe(odd);
  });

  it('plays a one-shot without looping, then reports it finished', () => {
    const { context, player } = setup();
    player.play(JINGLE);
    expect(sourceAt(context, 0).loop).toBe(false);
    expect(player.playing).toBe(true);
    context.currentTime = 2;
    expect(player.playing).toBe(false);
    expect(player.current).toBe(JINGLE);
  });

  it('keeps one track resident: a new track hard-stops the previous one', () => {
    const { context, player } = setup();
    player.play(LOOPING);
    player.play(JINGLE);
    const first = sourceAt(context, 0);
    expect(first.stops).toBe(1);
    expect(first.stopped).toBe(0);
    expect(first.disconnected).toBe(1);
    expect(context.sources).toHaveLength(2);
    expect(player.current).toBe(JINGLE);
  });

  it('fades in with a ramp from 0 over the given ticks', () => {
    const { context, fade, player } = setup();
    context.currentTime = 10;
    player.play(LOOPING, { fadeInTicks: 30 });
    expect(fade.gain.calls).toEqual([
      { op: 'cancel', time: 10 },
      { op: 'set', value: 0, time: 10 },
      { op: 'ramp', value: 1, time: 10 + 30 * TICK_SECONDS },
    ]);
    player.play(JINGLE);
    expect(fade.gain.calls.slice(3)).toEqual([
      { op: 'cancel', time: 10 },
      { op: 'set', value: 1, time: 10 },
    ]);
  });

  it('fades out and stops the source when the ramp ends; stop(0) cuts at once', () => {
    const { context, fade, player } = setup();
    player.play(LOOPING);
    context.currentTime = 5;
    fade.gain.calls.length = 0;
    player.stop(60);
    expect(fade.gain.calls).toEqual([
      { op: 'cancel', time: 5 },
      { op: 'set', value: 1, time: 5 },
      { op: 'ramp', value: 0, time: 5 + 60 * TICK_SECONDS },
    ]);
    expect(sourceAt(context, 0).stopped).toBe(5 + 60 * TICK_SECONDS);
    expect(player.current).toBeNull();
    expect(player.playing).toBe(false);
    player.play(JINGLE);
    player.stop();
    expect(sourceAt(context, 1).stops).toBe(1);
    expect(sourceAt(context, 1).stopped).toBe(0);
    player.stop(30); // nothing playing: no-op
    expect(context.sources).toHaveLength(2);
  });

  it('ducks: a quick fall to the level, held for half the time, back to 1 at the end', () => {
    const { context, duck, player } = setup();
    player.play(LOOPING);
    context.currentTime = 3;
    player.duck(0.35, 120);
    const whole = 120 * TICK_SECONDS;
    expect(duck.gain.calls).toEqual([
      { op: 'cancel', time: 3 },
      { op: 'set', value: 1, time: 3 },
      { op: 'ramp', value: 0.35, time: 3 + DUCK_ATTACK_TICKS * TICK_SECONDS },
      { op: 'set', value: 0.35, time: 3 + whole / 2 },
      { op: 'ramp', value: 1, time: 3 + whole },
    ]);
    // A short duck keeps its fall within a quarter of it; bad values are clamped / ignored.
    duck.gain.calls.length = 0;
    player.duck(2, 8);
    expect(duck.gain.calls[2]).toEqual({ op: 'ramp', value: 1, time: 3 + 2 * TICK_SECONDS });
    duck.gain.calls.length = 0;
    player.duck(0.5, 0);
    player.duck(0.5, Number.NaN);
    expect(duck.gain.calls).toEqual([]);
  });

  it('destroy() stops the music, detaches the gains and makes the player inert', () => {
    const { context, fade, duck, player } = setup();
    player.play(LOOPING);
    player.destroy();
    player.destroy();
    expect(sourceAt(context, 0).stops).toBe(1);
    expect(fade.disconnected).toBe(1);
    expect(duck.disconnected).toBe(1);
    player.play(JINGLE);
    player.duck(0.3, 60);
    expect(context.sources).toHaveLength(1);
    expect(player.current).toBeNull();
  });
});
