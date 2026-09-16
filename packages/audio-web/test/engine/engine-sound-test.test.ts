/**
 * The audio engine's sound test (plan M2-15, `AudioEngine.playTrack`): any library track plays by
 * index — a track outside the prepared set is loaded first and kept as the one extra track (the
 * previous extra one released, the prepared set never), a resident one is not loaded again, a
 * replay restarts it, the title theme takes over again after it, and unknown indices or a
 * detached / destroyed engine start nothing.
 */
import { MUSIC_CUES, type ContentFile } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { createAudioEngine, type AudioGraphLike } from '../../src/engine/index.js';
import {
  createAudioLoader,
  loadMusicContent,
  loadSfxContent,
  type AudioLoader,
  type MusicTrackDef,
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
const LOADED = loadMusicContent([
  trackFile('boss', 'Boss'),
  trackFile('ending', 'Ending'),
  trackFile('theme', 'Stage'),
  trackFile('title', 'Title'),
]);
const MUSIC = LOADED.content;

const SFX = loadSfxContent([]).content;

/** A loader that counts the tracks it prepares. */
function countingLoader(): AudioLoader & { tracks: string[] } {
  const real = createAudioLoader();
  const tracks: string[] = [];
  return {
    tracks,
    sampleRate: real.sampleRate,
    musicPath: (track) => real.musicPath(track),
    loadSfx: (content, onProgress) => real.loadSfx(content, onProgress),
    loadTrack: (track: MusicTrackDef) => {
      tracks.push(track.id);
      return real.loadTrack(track);
    },
  };
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

describe('audio-web/engine sound test (M2-15)', () => {
  it('has a valid test library', () => {
    expect(LOADED.issues).toEqual([]);
    expect(MUSIC.tracks.map((track) => track.id)).toEqual(['boss', 'ending', 'theme', 'title']);
  });

  it('plays any track by index, loading one outside the set and keeping one extra', async () => {
    const loader = countingLoader();
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC, loader });
    await engine.prepareMusic(null, [MUSIC_CUES.Title, MUSIC_CUES.Stage]);
    expect([...engine.residentTracks].sort()).toEqual(['theme', 'title']);
    const context = new FakeContext();
    engine.attach(graphOf(context));
    // The ending (1) is not resident: loaded, then played.
    expect(await engine.playTrack(1)).toBe(true);
    expect(loader.tracks).toEqual(['title', 'theme', 'ending']);
    expect(engine.music?.current?.id).toBe('ending');
    expect(engine.musicCue).toBe(-1);
    // Again: restarts from its start, not loaded again.
    expect(await engine.playTrack(1, 30)).toBe(true);
    expect(context.sources).toHaveLength(2);
    expect(loader.tracks).toHaveLength(3);
    // The boss (0) replaces the ending as the extra track; the prepared set stays.
    expect(await engine.playTrack(0)).toBe(true);
    expect([...engine.residentTracks].sort()).toEqual(['boss', 'theme', 'title']);
    // A prepared track (the theme, 2) plays without a load; the extra one goes.
    expect(await engine.playTrack(2)).toBe(true);
    expect(loader.tracks).toEqual(['title', 'theme', 'ending', 'boss']);
    expect([...engine.residentTracks].sort()).toEqual(['theme', 'title']);
    await engine.playTrack(1); // the ending again: loaded again
    expect(loader.tracks).toEqual(['title', 'theme', 'ending', 'boss', 'ending']);
    expect([...engine.residentTracks].sort()).toEqual(['ending', 'theme', 'title']);
    // Leaving the sound test, the title theme takes over.
    engine.playMusic(MUSIC_CUES.Title, 30);
    expect(engine.music?.current?.id).toBe('title');
    // The next loading phase drops the sound test's track (it is not playing).
    await engine.prepareMusic(null, [MUSIC_CUES.Title]);
    expect(engine.residentTracks).toEqual(['title']);
  });

  it('starts nothing for an unknown index, before the unlock or after destroy', async () => {
    const loader = countingLoader();
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC, loader });
    expect(await engine.playTrack(-1)).toBe(false);
    expect(await engine.playTrack(4)).toBe(false);
    expect(await engine.playTrack(1.5)).toBe(false);
    expect(loader.tracks).toEqual([]);
    // Not attached: the track is loaded (resident) but does not start.
    expect(await engine.playTrack(3)).toBe(false);
    expect(engine.residentTracks).toEqual(['title']);
    engine.destroy();
    expect(await engine.playTrack(3)).toBe(false);
  });
});
