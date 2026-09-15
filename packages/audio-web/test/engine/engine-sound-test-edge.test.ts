/**
 * Edge cases of the audio engine's sound test (plan M2-15, `AudioEngine.playTrack`) beyond
 * `engine-sound-test.test.ts`: a track that fails to load rejects with the loader's error and
 * leaves the engine as it was, an engine destroyed while a track loads starts nothing, an extra
 * track that is playing survives the next loading phase and goes with the next sound-test track,
 * STOP (the `Silence` cue) followed by another play, and the title theme played from the sound
 * test not restarted when the title asks for it again.
 */
import { MUSIC_CUES, type ContentFile } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { createAudioEngine, type AudioGraphLike } from '../../src/engine/index.js';
import {
  AudioLoadError,
  createAudioLoader,
  loadMusicContent,
  loadSfxContent,
  type AudioLoader,
  type MusicTrackDef,
  type PreparedTrack,
} from '../../src/loader/index.js';
import type { Song } from '../../src/synth/index.js';
import { FakeContext } from '../helpers/fake-context.js';

/** A short 4-channel song. */
const SONG: Song = {
  speed: 6,
  instruments: { lead: { wave: 'pulse25' } },
  channels: [
    { instrument: 'lead' },
    { instrument: 'lead' },
    { instrument: 'lead' },
    { instrument: 'lead' },
  ],
  patterns: { a: { rows: 2, tracks: ['C4:2'] } },
  order: ['a', 'a'],
  loopFromOrder: 1,
};

/**
 * A music file.
 *
 * @param id - Track id.
 * @param cue - Its cue.
 * @returns The file.
 */
const trackFile = (id: string, cue: string): ContentFile => ({
  path: `audio/music/${id}.music.json`,
  data: { formatVersion: 1, kind: 'music', id, title: id.toUpperCase(), cue, song: SONG },
});

// Library order: boss (0), ending (1), theme (2), title (3).
const MUSIC = loadMusicContent([
  trackFile('boss', 'Boss'),
  trackFile('ending', 'Ending'),
  trackFile('theme', 'Stage'),
  trackFile('title', 'Title'),
]).content;

const SFX = loadSfxContent([]).content;

/** A loader whose track loads can be held back, failed, and counted. */
interface ControlledLoader extends AudioLoader {
  /** Track ids asked for, in order. */
  readonly asked: string[];
  /** Track ids that fail to load. */
  readonly failing: Set<string>;
  /** Hold every load until {@link ControlledLoader.release} (default: resolve at once). */
  hold: boolean;
  /** Lets the held loads finish. */
  release(): void;
}

/**
 * Creates a {@link ControlledLoader}.
 *
 * @returns The loader.
 */
function controlledLoader(): ControlledLoader {
  const real = createAudioLoader();
  const waiting: Array<() => void> = [];
  const loader: ControlledLoader = {
    asked: [],
    failing: new Set(),
    hold: false,
    sampleRate: real.sampleRate,
    loadSfx: (content, onProgress) => real.loadSfx(content, onProgress),
    loadTrack(track: MusicTrackDef): Promise<PreparedTrack> {
      loader.asked.push(track.id);
      const run = (): Promise<PreparedTrack> =>
        loader.failing.has(track.id)
          ? Promise.reject(new AudioLoadError(track.id, 'decode failed'))
          : real.loadTrack(track);
      if (!loader.hold) return run();
      return new Promise<void>((resolve) => waiting.push(resolve)).then(run);
    },
    release() {
      for (const resolve of waiting.splice(0)) resolve();
    },
  };
  return loader;
}

/**
 * A graph on a fake context.
 *
 * @param context - The context.
 * @returns The graph.
 */
function graphOf(context: FakeContext): AudioGraphLike {
  const buses = {
    sfx: context.createGain(),
    ui: context.createGain(),
    music: context.createGain(),
  };
  return { context, bus: (name) => (name === 'master' ? null : buses[name]) };
}

describe('audio-web/engine sound test — edge cases (M2-15)', () => {
  it('rejects with the loader`s error for a track that cannot load, and changes nothing', async () => {
    const loader = controlledLoader();
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC, loader });
    await engine.prepareMusic(null, [MUSIC_CUES.Title]);
    const context = new FakeContext();
    engine.attach(graphOf(context));
    engine.playMusic(MUSIC_CUES.Title, 0);
    expect(engine.music?.current?.id).toBe('title');
    loader.failing.add('ending');
    await expect(engine.playTrack(1)).rejects.toBeInstanceOf(AudioLoadError);
    expect(engine.residentTracks).toEqual(['title']);
    expect(engine.music?.current?.id).toBe('title');
    expect(engine.musicCue).toBe(MUSIC_CUES.Title);
    // The engine goes on: another track plays.
    expect(await engine.playTrack(0)).toBe(true);
    expect(engine.music?.current?.id).toBe('boss');
  });

  it('starts nothing when the engine is destroyed while the track loads', async () => {
    const loader = controlledLoader();
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC, loader });
    const context = new FakeContext();
    engine.attach(graphOf(context));
    loader.hold = true;
    const pending = engine.playTrack(2);
    expect(loader.asked).toEqual(['theme']);
    engine.destroy();
    loader.release();
    expect(await pending).toBe(false);
    expect(engine.residentTracks).toEqual([]);
    expect(context.sources).toHaveLength(0);
  });

  it('keeps an extra track that is playing through a loading phase; the next one replaces it', async () => {
    const loader = controlledLoader();
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC, loader });
    engine.attach(graphOf(new FakeContext()));
    await engine.prepareMusic(null, [MUSIC_CUES.Title]);
    expect(await engine.playTrack(1)).toBe(true); // the ending: extra
    await engine.prepareMusic(null, [MUSIC_CUES.Title, MUSIC_CUES.Stage]);
    expect([...engine.residentTracks].sort()).toEqual(['ending', 'theme', 'title']);
    expect(engine.music?.current?.id).toBe('ending');
    // The next sound-test track goes in its place (the prepared set stays).
    expect(await engine.playTrack(0)).toBe(true);
    expect([...engine.residentTracks].sort()).toEqual(['boss', 'theme', 'title']);
    // STOP, then the next loading phase lets the extra track go.
    engine.playMusic(MUSIC_CUES.Silence, 30);
    expect(engine.musicCue).toBe(-1);
    await engine.prepareMusic(null, [MUSIC_CUES.Title]);
    expect(engine.residentTracks).toEqual(['title']);
  });

  it('plays again after STOP; a resident extra track is not loaded twice', async () => {
    const loader = controlledLoader();
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC, loader });
    const context = new FakeContext();
    engine.attach(graphOf(context));
    expect(await engine.playTrack(1)).toBe(true);
    engine.playMusic(MUSIC_CUES.Silence, 0);
    expect(await engine.playTrack(1)).toBe(true);
    expect(loader.asked).toEqual(['ending']);
    expect(engine.music?.current?.id).toBe('ending');
    expect(context.sources).toHaveLength(2);
  });

  it('does not restart the title theme it played when the title asks for it again', async () => {
    const loader = controlledLoader();
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC, loader });
    await engine.prepareMusic(null, [MUSIC_CUES.Title]);
    const context = new FakeContext();
    engine.attach(graphOf(context));
    expect(await engine.playTrack(3)).toBe(true); // the title theme, from the sound test
    expect(engine.musicCue).toBe(-1);
    const sources = context.sources.length;
    engine.playMusic(MUSIC_CUES.Title, 30); // BACK: the title theme — already playing
    expect(engine.musicCue).toBe(MUSIC_CUES.Title);
    expect(context.sources).toHaveLength(sources);
    expect(engine.music?.current?.id).toBe('title');
    expect(loader.asked).toEqual(['title']);
  });
});
