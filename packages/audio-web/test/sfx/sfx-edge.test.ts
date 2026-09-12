/**
 * Edge cases of the SFX voice manager (plan M1-15) against a fake `AudioContext`: voices that
 * played out neither count toward a cue's instance cap nor get "stolen", the instance cap wins
 * over the global cap, ties go to the oldest voice (by start order, not slot), a priority hint
 * out of range falls back to the cue's tier while one in range can also lower it, a dropped sound
 * does not close its dedupe window, the `ui` bus defaults to the `sfx` bus, a one-voice player,
 * `playAt()` (the pan from a whole-pixel x, computed only once a voice starts), the counters, and
 * malformed cue ids (fractional, holes) ignored instead of throwing.
 */
import { SfxPriority } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_VOICES, createSfxPlayer, type SfxVoiceSpec } from '../../src/sfx/index.js';
import { FakeContext, bufferOf } from '../helpers/fake-context.js';

/** Cue ids of the test bank. */
const CUE = { shot: 0, boom: 1, death: 2, menu: 3, blast: 4 } as const;

/**
 * A test bank.
 *
 * @returns The specs (shot low ×2, boom normal ×8, death critical ×1, menu ui ×1, blast high ×2).
 */
function bank(): Array<SfxVoiceSpec | null> {
  return [
    { buffer: bufferOf(0.1), tier: SfxPriority.Low, maxInstances: 2, bus: 'sfx' },
    { buffer: bufferOf(0.5), tier: SfxPriority.Normal, maxInstances: 8, bus: 'sfx' },
    { buffer: bufferOf(1), tier: SfxPriority.Critical, maxInstances: 1, bus: 'sfx' },
    { buffer: bufferOf(0.05), tier: SfxPriority.Normal, maxInstances: 1, bus: 'ui' },
    { buffer: bufferOf(2), tier: SfxPriority.High, maxInstances: 2, bus: 'sfx' },
  ];
}

/**
 * A player on a fresh fake context.
 *
 * @param maxVoices - Voice cap.
 * @returns The context, bus and player.
 */
function setup(maxVoices = DEFAULT_MAX_VOICES) {
  const context = new FakeContext();
  const sfxBus = context.createGain();
  const uiBus = context.createGain();
  const cues = bank();
  const player = createSfxPlayer({ context, sfxBus, uiBus, cues, maxVoices });
  return { context, sfxBus, uiBus, cues, player };
}

describe('audio-web/sfx (edge)', () => {
  it('does not count or steal voices that have played out', () => {
    const { context, player } = setup();
    expect(player.play(CUE.shot)).toBe(0);
    player.endFrame();
    context.currentTime = 0.05;
    expect(player.play(CUE.shot)).toBe(1);
    player.endFrame();
    // The first shot ended at 0.1 s: the cap of 2 is not reached, its slot is simply free again.
    context.currentTime = 0.12;
    expect(player.play(CUE.shot)).toBe(0);
    expect(player.stolen).toBe(0);
    expect(player.activeVoices()).toBe(2);
  });

  it('frees a voice exactly at the end of its buffer', () => {
    const { context, player } = setup();
    player.play(CUE.boom);
    context.currentTime = 0.4999;
    expect(player.voiceCue(0)).toBe(CUE.boom);
    context.currentTime = 0.5;
    expect(player.voiceCue(0)).toBe(-1);
    expect(player.activeVoices()).toBe(0);
  });

  it('applies the instance cap before the global cap (the same cue restarts, not the lowest)', () => {
    const { context, player } = setup(3);
    // Slots: 0 shot (low), 1 blast (high), 2 blast (high) — every voice busy.
    [CUE.shot, CUE.blast, CUE.blast].forEach((cue, i) => {
      context.currentTime = i * 0.001;
      player.play(cue);
      player.endFrame();
    });
    // blast is at its cap of 2: its oldest instance (slot 1) restarts; the low shot survives.
    expect(player.play(CUE.blast)).toBe(1);
    expect(player.voiceCue(0)).toBe(CUE.shot);
    expect(player.stolen).toBe(1);
  });

  it('breaks priority ties by start order, not by slot', () => {
    const { context, player } = setup(3);
    const slots: number[] = [];
    for (let i = 0; i < 7; i++) {
      context.currentTime = i * 0.01;
      slots.push(player.play(CUE.boom));
      player.endFrame();
    }
    // Three voices fill up, then each new boom takes the oldest one in turn.
    expect(slots).toEqual([0, 1, 2, 0, 1, 2, 0]);
    expect(player.stolen).toBe(4);
  });

  it('falls back to the cue tier for a hint out of range; a hint in range can lower it too', () => {
    const { player } = setup(2);
    player.play(CUE.boom);
    player.play(CUE.blast);
    player.endFrame();
    for (const hint of [0, 5, -1, 99]) {
      expect(player.play(CUE.shot, 0, hint), `hint ${hint}`).toBe(-1); // still low
    }
    expect(player.dropped).toBe(4);
    expect(player.play(CUE.shot, 0, SfxPriority.Normal)).toBe(0); // takes the normal boom

    // A critical cue played with a Low hint is a low voice: a normal sound may take it.
    const one = setup(1);
    one.player.play(CUE.death, 0, SfxPriority.Low);
    one.player.endFrame();
    expect(one.player.play(CUE.boom)).toBe(0);
    expect(one.player.voiceCue(0)).toBe(CUE.boom);
  });

  it('keeps the dedupe window open for a sound that was dropped', () => {
    const { player } = setup(1);
    player.play(CUE.death);
    player.endFrame();
    expect(player.play(CUE.shot)).toBe(-1);
    expect(player.play(CUE.shot)).toBe(-1);
    // Both were dropped (no voice), neither deduped: the cue never started this frame.
    expect(player.dropped).toBe(2);
    expect(player.deduped).toBe(0);
    // Not even a critical hint takes the critical voice.
    expect(player.play(CUE.menu, 0, SfxPriority.Critical)).toBe(-1);
    expect(player.dropped).toBe(3);
    // Once the voice is free, the cue starts in the same frame and only then closes the window.
    player.stopAll();
    expect(player.play(CUE.shot)).toBe(0);
    expect(player.play(CUE.shot)).toBe(-1);
    expect(player.deduped).toBe(1);
  });

  it('plays one sound at a time with a single voice', () => {
    const { player } = setup(1);
    expect(player.maxVoices).toBe(1);
    expect(player.play(CUE.boom)).toBe(0);
    player.endFrame();
    expect(player.play(CUE.shot)).toBe(-1); // low cannot take normal
    expect(player.play(CUE.blast)).toBe(0); // high can
    expect(player.voiceCue(0)).toBe(CUE.blast);
    expect([player.started, player.stolen, player.dropped, player.deduped]).toEqual([2, 1, 1, 0]);
  });

  it('routes ui cues to the sfx bus when no ui bus is given', () => {
    for (const uiBus of [undefined, null]) {
      const context = new FakeContext();
      const sfxBus = context.createGain();
      const player = createSfxPlayer({ context, sfxBus, uiBus, cues: bank() });
      player.play(CUE.menu, 0.8);
      expect(context.sources[0]?.connections).toEqual([sfxBus]);
      // A ui cue never touches its slot's panner.
      expect(context.panners[0]?.pan.value).toBe(0);
    }
  });

  it('clamps the pan to −1…1 and passes values inside through unchanged', () => {
    const { context, player } = setup();
    const pans: number[] = [];
    for (const pan of [3, -0.25, 0.6, -7]) {
      const slot = player.play(CUE.boom, pan);
      pans.push(context.panners[slot]?.pan.value ?? Number.NaN);
      player.endFrame();
    }
    expect(pans).toEqual([1, -0.25, 0.6, -1]);
    // The default pan is centre.
    const slot = player.play(CUE.shot);
    expect(context.panners[slot]?.pan.value).toBe(0);
  });

  it('playAt() pans from a whole-pixel x over the pan field, clamped at its edges', () => {
    const context = new FakeContext();
    const player = createSfxPlayer({
      context,
      sfxBus: context.createGain(),
      cues: bank(),
      panField: 200,
      panWidth: 0.5,
    });
    const pans: number[] = [];
    for (const x of [0, 50, 100, 200, -1000, 5000]) {
      const slot = player.playAt(CUE.boom, x, 0);
      pans.push(context.panners[slot]?.pan.value ?? Number.NaN);
      player.endFrame();
    }
    expect(pans).toEqual([-0.5, -0.25, 0, 0.5, -0.5, 0.5]);
    // Same voice policy as play(): deduped within a frame, the hint honoured, ui cues centred.
    expect(player.playAt(CUE.boom, 0, 0)).toBeGreaterThanOrEqual(0);
    expect(player.playAt(CUE.boom, 0, 0)).toBe(-1);
    expect(player.deduped).toBe(1);
    const menu = player.playAt(CUE.menu, 0, SfxPriority.High);
    expect(context.panners[menu]?.pan.value).toBe(0);
  });

  it('playAt() defaults to the playfield width and full pan; stays centred without panners', () => {
    const { context, player } = setup();
    const left = player.playAt(CUE.boom, 0, 0);
    player.endFrame();
    const right = player.playAt(CUE.boom, 384, 0); // PLAYFIELD_W
    expect([context.panners[left]?.pan.value, context.panners[right]?.pan.value]).toEqual([-1, 1]);
    const bare = new FakeContext();
    bare.hasPanner = false;
    const sfxBus = bare.createGain();
    const centred = createSfxPlayer({ context: bare, sfxBus, cues: bank() });
    expect(centred.playAt(CUE.boom, 0, 0)).toBe(0);
    expect(bare.sources[0]?.connections).toEqual([sfxBus]);
  });

  it('plays a buffer swapped in between two sounds, and times the voice by that buffer', () => {
    const { context, cues, player } = setup();
    const boom = cues[CUE.boom];
    if (boom === null) throw new Error('bank changed');
    boom.buffer = bufferOf(3);
    player.play(CUE.boom);
    expect(context.sources[0]?.buffer).toBe(boom.buffer);
    context.currentTime = 2.9;
    expect(player.activeVoices()).toBe(1);
  });

  it('stopAll() stops each sound once; voiceCue() rejects slots out of range', () => {
    const { context, player } = setup();
    player.play(CUE.boom);
    player.stopAll();
    player.stopAll();
    expect(context.sources[0]?.stops).toBe(1);
    expect(player.voiceCue(-1)).toBe(-1);
    expect(player.voiceCue(DEFAULT_MAX_VOICES)).toBe(-1);
    expect(player.voiceCue(0)).toBe(-1);
    player.destroy();
    expect(() => player.stopAll()).not.toThrow();
    expect(player.activeVoices()).toBe(0);
    expect(player.play(CUE.boom)).toBe(-1);
  });

  it('rejects a voice cap that is not a positive integer', () => {
    const context = new FakeContext();
    const sfxBus = context.createGain();
    for (const maxVoices of [0, -1, 2.5, Number.NaN, Infinity]) {
      expect(
        () => createSfxPlayer({ context, sfxBus, cues: [], maxVoices }),
        String(maxVoices),
      ).toThrow(RangeError);
    }
    expect(createSfxPlayer({ context, sfxBus, cues: [] }).maxVoices).toBe(DEFAULT_MAX_VOICES);
  });

  it('ignores malformed cue ids (fractional, holes in the bank) instead of throwing', () => {
    const { player } = setup();
    expect(player.play(1.5)).toBe(-1);
    expect(player.play(Number.NaN)).toBe(-1);
    const context = new FakeContext();
    // A bank with a hole at index 1, on purpose.
    const sparse = new Array<SfxVoiceSpec | null>(3);
    sparse[0] = bank()[0] ?? null;
    sparse[2] = bank()[1] ?? null;
    const holey = createSfxPlayer({ context, sfxBus: context.createGain(), cues: sparse });
    expect(holey.play(1)).toBe(-1);
    expect(holey.play(2)).toBe(0);
    expect(player.dropped).toBe(2);
    expect(holey.dropped).toBe(1);
  });
});
