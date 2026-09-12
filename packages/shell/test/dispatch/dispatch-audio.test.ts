/**
 * Tests for connectAudioEvents() (plan M1-15 "event bridge mapping"): `Sfx` events reach the
 * audio engine's `playSfx` with the cue, the x relative to the camera in whole pixels (read live
 * when the event is handled) and the priority hint; `Music` reaches `playMusic` with the fade;
 * `MusicDuck` reaches `duckMusic`; other kinds are not routed there, and disconnecting removes
 * exactly these handlers. End to end, a real `AudioEngine` on a fake Web Audio context starts
 * the sounds and the stage theme from drained events.
 */
import { MUSIC_CUES, SFX_CUES, SfxPriority, SimEventKind, createEventQueue } from '@shmup/core';
import { createAudioEngine, loadMusicContent, loadSfxContent } from '@shmup/audio-web';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../../../vite.shared.js';
import {
  connectAudioEvents,
  createEventDispatcher,
  type AudioEventTarget,
} from '../../src/dispatch/index.js';

/** A target that records its calls. */
function recorder(): AudioEventTarget & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    playSfx: (...args: unknown[]) => calls.push(['sfx', ...args]),
    playMusic: (...args: unknown[]) => {
      calls.push(['music', ...args]);
    },
    duckMusic: (...args: unknown[]) => {
      calls.push(['duck', ...args]);
    },
  };
}

describe('shell/dispatch connectAudioEvents', () => {
  it('maps Sfx / Music / MusicDuck events onto the audio engine', () => {
    const audio = recorder();
    const dispatcher = createEventDispatcher();
    const camera = { x: 1000.75 };
    connectAudioEvents(dispatcher, audio, camera);
    const queue = createEventQueue();
    queue.push(SimEventKind.Sfx, SFX_CUES.EnemyExplodeSmall, 1100, 90, 0);
    queue.push(SimEventKind.Sfx, SFX_CUES.WarningSiren, 1192, 0, SfxPriority.Critical);
    queue.push(SimEventKind.Music, MUSIC_CUES.Silence, 0, 0, 30);
    queue.push(SimEventKind.Music, MUSIC_CUES.Boss, 0, 0, 0);
    queue.push(SimEventKind.MusicDuck, 0, 0, 0, 120);
    queue.push(SimEventKind.Shake, 20, 0, 0, 2);
    dispatcher.drain(queue);
    expect(audio.calls).toEqual([
      ['sfx', SFX_CUES.EnemyExplodeSmall, 99, 0],
      ['sfx', SFX_CUES.WarningSiren, 191, SfxPriority.Critical],
      ['music', MUSIC_CUES.Silence, 30],
      ['music', MUSIC_CUES.Boss, 0],
      ['duck', 120],
    ]);
    // The camera is read when the event is handled (it scrolls between frames).
    camera.x = 0;
    queue.push(SimEventKind.Sfx, SFX_CUES.EnemyHit, 10.9, 0, 0);
    dispatcher.drain(queue);
    expect(audio.calls[5]).toEqual(['sfx', SFX_CUES.EnemyHit, 10, 0]);
  });

  it('disconnects exactly its handlers (idempotent)', () => {
    const audio = recorder();
    const dispatcher = createEventDispatcher();
    const other: number[] = [];
    dispatcher.on(SimEventKind.Sfx, (event) => other.push(event.id));
    const disconnect = connectAudioEvents(dispatcher, audio, { x: 0 });
    expect(dispatcher.handlerCount(SimEventKind.Sfx)).toBe(2);
    expect(dispatcher.handlerCount(SimEventKind.Music)).toBe(1);
    expect(dispatcher.handlerCount(SimEventKind.MusicDuck)).toBe(1);
    disconnect();
    disconnect();
    expect(dispatcher.handlerCount(SimEventKind.Sfx)).toBe(1);
    expect(dispatcher.handlerCount(SimEventKind.Music)).toBe(0);
    const queue = createEventQueue();
    queue.push(SimEventKind.Sfx, SFX_CUES.Clink, 0, 0, 0);
    dispatcher.drain(queue);
    expect(other).toEqual([SFX_CUES.Clink]);
    expect(audio.calls).toEqual([]);
  });

  it('plays the shipped sounds and the stage theme through a real engine (fake context)', async () => {
    const files = readContentFiles();
    const kind = (name: string) =>
      files.filter((file) => (file.data as { kind: string }).kind === name);
    const engine = createAudioEngine({
      sfx: loadSfxContent(kind('sfx')).content,
      music: loadMusicContent(kind('music')).content,
    });
    await engine.loadSfx();
    await engine.prepareMusic('test-range');
    const sources: Array<{ buffer: unknown; loop: boolean }> = [];
    const node = () => ({ connect: () => undefined, disconnect: () => undefined });
    const param = () => ({
      value: 0,
      setValueAtTime: () => undefined,
      linearRampToValueAtTime: () => undefined,
      cancelScheduledValues: () => undefined,
    });
    const context = {
      state: 'running',
      currentTime: 0,
      sampleRate: 48000,
      destination: {},
      createGain: () => ({ ...node(), gain: param() }),
      createStereoPanner: () => ({ ...node(), pan: param() }),
      createBuffer: (channels: number, length: number, sampleRate: number) => {
        const data = new Float32Array(length);
        return {
          numberOfChannels: channels,
          length,
          sampleRate,
          duration: length / sampleRate,
          getChannelData: () => data,
        };
      },
      createBufferSource: () => {
        const source = {
          ...node(),
          buffer: null,
          loop: false,
          loopStart: 0,
          loopEnd: 0,
          start: () => undefined,
          stop: () => undefined,
        };
        sources.push(source);
        return source;
      },
      resume: () => Promise.resolve(),
      suspend: () => Promise.resolve(),
      close: () => Promise.resolve(),
    };
    const buses = {
      master: context.createGain(),
      sfx: context.createGain(),
      ui: context.createGain(),
      music: context.createGain(),
    };
    expect(engine.attach({ context, bus: (name) => buses[name] })).toBe(true);
    const dispatcher = createEventDispatcher();
    connectAudioEvents(dispatcher, engine, { x: 0 });
    const queue = createEventQueue();
    queue.push(SimEventKind.Music, MUSIC_CUES.Stage, 0, 0, 0);
    queue.push(SimEventKind.Sfx, SFX_CUES.PlayerShot, 40, 100, 0);
    queue.push(SimEventKind.Sfx, SFX_CUES.PlayerShot, 40, 100, 0); // same frame: deduped
    queue.push(SimEventKind.Sfx, SFX_CUES.EnemyExplodeSmall, 300, 100, 0);
    dispatcher.drain(queue);
    engine.endFrame();
    expect(engine.music?.current?.id).toBe('zone-a');
    expect(sources).toHaveLength(3);
    expect(sources[0]?.loop).toBe(true);
    expect(engine.sfx?.deduped).toBe(1);
    engine.destroy();
  });
});
