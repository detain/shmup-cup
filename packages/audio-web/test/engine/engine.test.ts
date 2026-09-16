/**
 * The audio engine (plan M1-15): SFX rendered at boot and turned into buffers on attach, the
 * stage's music set prepared in the loading phase (one set resident, nothing rendered for a cue
 * outside it), music requested before the unlock started on attach, pan from the event's screen
 * x, the track already playing not restarted, `Silence` fading out, ducking, and a context
 * without buffer playback leaving the engine silent.
 */
import { MUSIC_CUES, SFX_CUES, type ContentFile } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as audioWeb from '../../src/index.js';
import {
  DEFAULT_DUCK_LEVEL,
  DEFAULT_PAN_WIDTH,
  createAudioEngine,
  moduleInfo,
  type AudioGraphLike,
} from '../../src/engine/index.js';
import {
  createAudioLoader,
  loadMusicContent,
  loadSfxContent,
  type AudioLoader,
  type MusicTrackDef,
} from '../../src/loader/index.js';
import type { Song } from '../../src/synth/index.js';
import { FakeContext, type FakeGain } from '../helpers/fake-context.js';

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
 * A music file of the test library.
 *
 * @param id - Track id.
 * @param extra - Cue and stages.
 * @returns The file.
 */
const trackFile = (id: string, extra: Record<string, unknown>): ContentFile => ({
  path: `audio/music/${id}.music.json`,
  data: { formatVersion: 1, kind: 'music', id, title: id, song: SONG, ...extra },
});

const MUSIC = loadMusicContent([
  trackFile('theme', { cue: 'Stage' }),
  trackFile('zone-b', { cue: 'Stage', stages: ['zone-b'] }),
  trackFile('boss', { cue: 'Boss' }),
  trackFile('clear', { cue: 'StageClear', song: { ...SONG, loopFromOrder: null } }),
  trackFile('title', { cue: 'Title' }),
]).content;

const SFX = loadSfxContent([
  {
    path: 'audio/test.sfx.json',
    data: {
      formatVersion: 1,
      kind: 'sfx',
      cues: {
        EnemyHit: { priority: 'low', maxInstances: 2, params: { sustain: 0.02 } },
        MegaCrash: { priority: 'high', maxInstances: 1, pan: false, params: { sustain: 0.02 } },
        MenuMove: { priority: 'normal', maxInstances: 1, bus: 'ui', params: { sustain: 0.01 } },
      },
    },
  },
]).content;

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
 * A web-audio-like graph on a fake context.
 *
 * @param context - The context (`null` = not unlocked yet).
 * @returns The graph and its buses.
 */
function graphOf(context: FakeContext | null) {
  const buses =
    context === null
      ? null
      : { sfx: context.createGain(), ui: context.createGain(), music: context.createGain() };
  const graph: AudioGraphLike = {
    context,
    bus: (name) => (buses === null || name === 'master' ? null : buses[name]),
  };
  return { graph, buses };
}

describe('audio-web/engine', () => {
  it('describes itself and is exported from the package entry', () => {
    expect(moduleInfo.name).toBe('engine');
    expect(moduleInfo.status).toBe('implemented');
    expect(audioWeb.createAudioEngine).toBe(createAudioEngine);
  });

  it('prepares a stage music set during loading and releases the others (one set resident)', async () => {
    const loader = countingLoader();
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC, loader });
    const progress: number[] = [];
    await engine.prepareMusic('zone-a', undefined, (fraction) => progress.push(fraction));
    expect(loader.tracks).toEqual(['theme', 'boss', 'clear']); // no GameOver track in this library
    expect(progress).toEqual([0, 1 / 3, 2 / 3, 1]);
    expect([...engine.residentTracks].sort()).toEqual(['boss', 'clear', 'theme']);
    await engine.prepareMusic('zone-b');
    // zone-b has its own theme; boss and clear stay prepared (not rendered again).
    expect(loader.tracks).toEqual(['theme', 'boss', 'clear', 'zone-b']);
    expect([...engine.residentTracks].sort()).toEqual(['boss', 'clear', 'zone-b']);
    await engine.prepareMusic(null, [MUSIC_CUES.Title]);
    expect(engine.residentTracks).toEqual(['title']);
  });

  it('ignores music outside the prepared set — nothing is rendered mid-stage', async () => {
    const loader = countingLoader();
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC, loader });
    await engine.prepareMusic('zone-a');
    const { graph } = graphOf(new FakeContext());
    engine.attach(graph);
    engine.playMusic(MUSIC_CUES.Title, 0);
    engine.playMusic(MUSIC_CUES.Ending, 0);
    expect(engine.missedMusic).toBe(2);
    expect(engine.music?.current).toBeNull();
    expect(loader.tracks).toEqual(['theme', 'boss', 'clear']);
  });

  it('starts the music requested before the unlock once attached; plays SFX only when attached', async () => {
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC });
    await engine.loadSfx();
    await engine.prepareMusic('zone-a');
    expect(engine.playSfx(SFX_CUES.EnemyHit, 192, 0)).toBe(-1);
    engine.playMusic(MUSIC_CUES.Stage, 0);
    expect(engine.musicCue).toBe(MUSIC_CUES.Stage);
    expect(engine.attach(graphOf(null).graph)).toBe(false);
    const context = new FakeContext();
    const { graph, buses } = graphOf(context);
    expect(engine.attach(graph)).toBe(true);
    expect(engine.attach(graph)).toBe(true);
    expect(engine.attached).toBe(true);
    // The pending stage theme started on its own track buffer (22,050 Hz, loop points kept).
    expect(engine.music?.current?.id).toBe('theme');
    const theme = context.sources[0];
    expect(theme?.loop).toBe(true);
    const current = engine.music?.current;
    expect(current?.loopStart).toBe(2 * 2205);
    expect(theme?.loopStart).toBe((current?.loopStart ?? Number.NaN) / 22050);
    // The fade/duck chain feeds the music bus; SFX buffers exist now.
    const [fade, duck] = context.gains.slice(3) as [FakeGain, FakeGain];
    expect(fade.connections).toEqual([duck]);
    expect(duck.connections).toEqual([buses?.music]);
    expect(context.buffers.length).toBeGreaterThanOrEqual(4); // 3 SFX + the theme
    expect(engine.playSfx(SFX_CUES.EnemyHit, 192, 0)).toBeGreaterThanOrEqual(0);
  });

  it('pans a positional cue from its screen x and keeps whole-screen cues centred', async () => {
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC });
    await engine.loadSfx();
    const context = new FakeContext();
    engine.attach(graphOf(context).graph);
    const pan = (cue: number, x: number): number | undefined => {
      const slot = engine.playSfx(cue, x, 0);
      engine.endFrame();
      return context.panners[slot]?.pan.value;
    };
    expect(pan(SFX_CUES.EnemyHit, 0)).toBeCloseTo(-DEFAULT_PAN_WIDTH, 10);
    expect(pan(SFX_CUES.EnemyHit, 384)).toBeCloseTo(DEFAULT_PAN_WIDTH, 10);
    expect(pan(SFX_CUES.MegaCrash, 0)).toBe(0);
    expect(pan(SFX_CUES.EnemyHit, 192)).toBe(0);
    // Off-screen sounds clamp to the edge.
    expect(pan(SFX_CUES.EnemyHit, -500)).toBeCloseTo(-DEFAULT_PAN_WIDTH, 10);
    // Deduped within a frame until endFrame().
    expect(engine.playSfx(SFX_CUES.MenuMove, 0, 0)).toBeGreaterThanOrEqual(0);
    expect(engine.playSfx(SFX_CUES.MenuMove, 0, 0)).toBe(-1);
    engine.endFrame();
    expect(engine.playSfx(SFX_CUES.MenuMove, 0, 0)).toBeGreaterThanOrEqual(0);
  });

  it('does not restart the track already playing; Silence fades out; ducks to the duck level', async () => {
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC });
    await engine.prepareMusic('zone-a');
    const context = new FakeContext();
    engine.attach(graphOf(context).graph);
    engine.playMusic(MUSIC_CUES.Stage, 30);
    engine.playMusic(MUSIC_CUES.Stage, 0);
    expect(context.sources).toHaveLength(1);
    engine.playMusic(MUSIC_CUES.Boss, 0);
    expect(context.sources).toHaveLength(2);
    expect(context.sources[0]?.stops).toBe(1);
    context.currentTime = 1;
    engine.playMusic(MUSIC_CUES.Silence, 60);
    expect(engine.musicCue).toBe(-1);
    expect(engine.music?.current).toBeNull();
    expect(context.sources[1]?.stopped).toBe(2);
    // Back to the theme (a new source).
    engine.playMusic(MUSIC_CUES.Stage, 0);
    expect(context.sources).toHaveLength(3);
    const duck = context.gains[4];
    engine.duckMusic(120);
    expect(
      duck.gain.calls.some((call) => call.op === 'ramp' && call.value === DEFAULT_DUCK_LEVEL),
    ).toBe(true);
  });

  it('stays silent on a context without buffer playback, and is inert after destroy()', async () => {
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC });
    await engine.loadSfx();
    const minimal = {
      state: 'running',
      destination: {},
      createGain: () => ({
        gain: { value: 1 },
        connect: () => undefined,
        disconnect: () => undefined,
      }),
      resume: () => Promise.resolve(),
      suspend: () => Promise.resolve(),
      close: () => Promise.resolve(),
    };
    const graph: AudioGraphLike = { context: minimal, bus: () => minimal.createGain() };
    expect(engine.attach(graph)).toBe(false);
    expect(engine.playSfx(SFX_CUES.EnemyHit, 0, 0)).toBe(-1);
    const context = new FakeContext();
    engine.attach(graphOf(context).graph);
    engine.playSfx(SFX_CUES.EnemyHit, 0, 0);
    engine.destroy();
    engine.destroy();
    expect(context.sources[0]?.stops).toBe(1);
    expect(engine.attached).toBe(false);
    expect(engine.attach(graphOf(new FakeContext()).graph)).toBe(false);
    engine.playMusic(MUSIC_CUES.Stage, 0);
    expect(engine.playSfx(SFX_CUES.EnemyHit, 0, 0)).toBe(-1);
  });
});
