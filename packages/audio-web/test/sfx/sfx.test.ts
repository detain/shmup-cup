/**
 * The SFX voice manager against a fake `AudioContext` (plan M1-15): per-tick dedupe, per-cue
 * instance caps (the oldest instance is restarted), the global cap of 14 (lowest priority, then
 * oldest, is stolen; critical voices never), priority hints, pan and bus routing, voices freed
 * when their sound has played out.
 */
import { SfxPriority } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as audioWeb from '../../src/index.js';
import {
  DEFAULT_MAX_VOICES,
  SFX_PRIORITY_TIERS,
  createSfxPlayer,
  moduleInfo,
  type SfxVoiceSpec,
} from '../../src/sfx/index.js';
import { FakeContext, bufferOf, type FakeSource } from '../helpers/fake-context.js';

/** Cue ids of the test bank. */
const CUE = { shot: 0, boom: 1, death: 2, menu: 3, siren: 4, silent: 5 } as const;

/**
 * A test bank: one spec per cue.
 *
 * @returns The specs.
 */
function bank(): Array<SfxVoiceSpec | null> {
  return [
    { buffer: bufferOf(0.1), tier: SfxPriority.Low, maxInstances: 2, bus: 'sfx' },
    { buffer: bufferOf(0.5), tier: SfxPriority.Normal, maxInstances: 8, bus: 'sfx' },
    { buffer: bufferOf(1), tier: SfxPriority.Critical, maxInstances: 1, bus: 'sfx' },
    { buffer: bufferOf(0.05), tier: SfxPriority.Normal, maxInstances: 1, bus: 'ui' },
    { buffer: bufferOf(1), tier: SfxPriority.Critical, maxInstances: 8, bus: 'sfx' },
    null,
  ];
}

/**
 * A player on a fresh fake context.
 *
 * @param maxVoices - Voice cap.
 * @returns The context, buses and player.
 */
function setup(maxVoices = DEFAULT_MAX_VOICES) {
  const context = new FakeContext();
  const sfxBus = context.createGain();
  const uiBus = context.createGain();
  const cues = bank();
  const player = createSfxPlayer({ context, sfxBus, uiBus, cues, maxVoices });
  return { context, sfxBus, uiBus, cues, player };
}

/**
 * The source a voice started with.
 *
 * @param context - The fake context.
 * @param index - Creation order.
 * @returns The source.
 */
const source = (context: FakeContext, index: number): FakeSource => {
  const found = context.sources[index];
  if (found === undefined) throw new Error(`no source ${index}`);
  return found;
};

describe('audio-web/sfx', () => {
  it('describes itself and is exported from the package entry', () => {
    expect(moduleInfo.name).toBe('sfx');
    expect(moduleInfo.status).toBe('implemented');
    expect(audioWeb.createSfxPlayer).toBe(createSfxPlayer);
    expect(DEFAULT_MAX_VOICES).toBe(14);
    expect(SFX_PRIORITY_TIERS).toEqual({ low: 1, normal: 2, high: 3, critical: 4 });
  });

  it('starts a sound through its slot panner, with the pan clamped', () => {
    const { context, sfxBus, cues, player } = setup();
    expect(context.panners).toHaveLength(DEFAULT_MAX_VOICES);
    for (const panner of context.panners) expect(panner.connections).toEqual([sfxBus]);
    const slot = player.play(CUE.boom, -3);
    expect(slot).toBe(0);
    const started = source(context, 0);
    expect(started.buffer).toBe(cues[CUE.boom]?.buffer);
    expect(started.started).toBe(0);
    expect(started.connections).toEqual([context.panners[0]]);
    expect(context.panners[0]?.pan.value).toBe(-1);
    expect(player.voiceCue(0)).toBe(CUE.boom);
    expect(player.activeVoices()).toBe(1);
    expect(player.started).toBe(1);
  });

  it('routes ui cues straight into the ui bus, unpanned', () => {
    const { context, uiBus, player } = setup();
    player.play(CUE.menu, 0.9);
    expect(source(context, 0).connections).toEqual([uiBus]);
    expect(context.panners[0]?.pan.value).toBe(0);
  });

  it('plays centred into the sfx bus when the engine has no StereoPannerNode', () => {
    const context = new FakeContext();
    context.hasPanner = false;
    const sfxBus = context.createGain();
    const player = createSfxPlayer({ context, sfxBus, cues: bank() });
    player.play(CUE.boom, 0.5);
    expect(context.panners).toHaveLength(0);
    expect(source(context, 0).connections).toEqual([sfxBus]);
  });

  it('dedupes a cue within one frame, not across frames', () => {
    const { context, player } = setup();
    expect(player.play(CUE.boom)).toBe(0);
    expect(player.play(CUE.boom)).toBe(-1);
    expect(player.deduped).toBe(1);
    player.play(CUE.shot);
    player.endFrame();
    expect(player.play(CUE.boom)).toBe(2);
    expect(context.sources).toHaveLength(3);
  });

  it('restarts the oldest instance of a cue at its instance cap', () => {
    const { context, player } = setup();
    expect(player.play(CUE.shot)).toBe(0);
    player.endFrame();
    context.currentTime = 0.01;
    expect(player.play(CUE.shot)).toBe(1);
    player.endFrame();
    context.currentTime = 0.02;
    // Cap 2 reached: the first (oldest) instance is cut and its slot reused.
    expect(player.play(CUE.shot)).toBe(0);
    expect(source(context, 0).stops).toBe(1);
    expect(source(context, 0).disconnected).toBe(1);
    expect(player.stolen).toBe(1);
    player.endFrame();
    context.currentTime = 0.03;
    expect(player.play(CUE.shot)).toBe(1);
    expect(player.activeVoices()).toBe(2);
  });

  it('frees a voice once its sound has played out', () => {
    const { context, player } = setup();
    player.play(CUE.shot);
    expect(player.activeVoices()).toBe(1);
    context.currentTime = 0.1; // the 0.1 s buffer ended
    expect(player.activeVoices()).toBe(0);
    expect(player.voiceCue(0)).toBe(-1);
    player.endFrame();
    expect(player.play(CUE.boom)).toBe(0);
    expect(source(context, 0).disconnected).toBe(1);
    expect(player.stolen).toBe(0);
  });

  it('at the global cap steals the lowest priority first, then the oldest', () => {
    const { context, player } = setup(4);
    // Slots: 0 boom (normal), 1 shot (low), 2 boom (normal), 3 shot (low, newer).
    const order = [CUE.boom, CUE.shot, CUE.boom, CUE.shot];
    order.forEach((cue, i) => {
      context.currentTime = i * 0.001;
      expect(player.play(cue)).toBe(i);
      player.endFrame();
    });
    context.currentTime = 0.01;
    // A normal sound takes the oldest low voice (slot 1), not the older normal one.
    expect(player.play(CUE.boom)).toBe(1);
    player.endFrame();
    // The next one takes the remaining low voice (slot 3).
    expect(player.play(CUE.boom)).toBe(3);
    player.endFrame();
    // Only normal voices left: the oldest (slot 0) goes.
    expect(player.play(CUE.boom)).toBe(0);
    expect(player.stolen).toBe(3);
  });

  it('never steals a voice of higher priority for a lower one', () => {
    const { player } = setup(2);
    player.play(CUE.boom);
    player.play(CUE.death);
    player.endFrame();
    expect(player.play(CUE.shot)).toBe(-1); // low cannot take normal or critical
    expect(player.dropped).toBe(1);
    // A priority hint raises a cue's tier for one sound.
    expect(player.play(CUE.shot, 0, SfxPriority.High)).toBe(0);
  });

  it('never steals a critical voice, not even for another critical cue', () => {
    const { context, player } = setup(2);
    player.play(CUE.death);
    player.play(CUE.siren);
    player.endFrame();
    expect(player.play(CUE.boom, 0, SfxPriority.Critical)).toBe(-1);
    expect(player.voiceCue(0)).toBe(CUE.death);
    expect(player.voiceCue(1)).toBe(CUE.siren);
    // A critical cue at its own cap restarts itself (the WARNING siren's next wail).
    player.endFrame();
    context.currentTime = 0.5;
    expect(player.play(CUE.death)).toBe(0);
  });

  it('drops cues without a sound and ignores unknown ids', () => {
    const { player, cues } = setup();
    expect(player.play(CUE.silent)).toBe(-1);
    expect(player.play(99)).toBe(-1);
    expect(player.play(-1)).toBe(-1);
    const shot = cues[CUE.shot];
    if (shot !== null) shot.buffer = null;
    expect(player.play(CUE.shot)).toBe(-1);
    expect(player.dropped).toBe(4);
    // A buffer filled in later is picked up.
    if (shot !== null) shot.buffer = bufferOf(0.1);
    expect(player.play(CUE.shot)).toBe(0);
  });

  it('stopAll() cuts every voice; destroy() also detaches the panners and goes inert', () => {
    const { context, player } = setup();
    player.play(CUE.boom);
    player.play(CUE.shot);
    player.stopAll();
    expect(player.activeVoices()).toBe(0);
    expect(context.sources.map((s) => s.stops)).toEqual([1, 1]);
    player.endFrame();
    player.play(CUE.boom);
    player.destroy();
    player.destroy();
    expect(context.panners.every((panner) => panner.disconnected === 1)).toBe(true);
    player.endFrame();
    expect(player.play(CUE.boom)).toBe(-1);
    expect(() =>
      createSfxPlayer({ context, sfxBus: context.createGain(), cues: [], maxVoices: 0 }),
    ).toThrow(RangeError);
  });

  it('survives engines that throw on a second stop()', () => {
    const { context, player } = setup();
    player.play(CUE.shot);
    const first = source(context, 0);
    first.stop = () => {
      throw new Error('InvalidStateError');
    };
    expect(() => player.stopAll()).not.toThrow();
    expect(first.disconnected).toBe(1);
  });
});
