/**
 * Edge cases of the audio engine (plan M1-15): the order of boot steps (attach before the SFX
 * bank is ready, destroy while it renders), graphs missing a bus, options passed through (voice
 * cap, pan width, duck level), cue ids out of range, music requested and cancelled before the
 * unlock or re-resolved by a later loading phase, the playing track kept resident across a
 * loading phase, a finished jingle replayed, a loader failure, and — the review finding of round 1
 * — a stage's own music set (`stageMusicCues`: a FinalBoss boss theme, a mid-stage music event)
 * played, where the fixed default set left those cues silent.
 */
import { MUSIC_CUES, SFX_CUES, SfxPriority, type ContentFile, type StageSpec } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { createAudioEngine, type AudioGraphLike } from '../../src/engine/index.js';
import {
  AudioLoadError,
  STAGE_MUSIC_CUES,
  createAudioLoader,
  loadMusicContent,
  loadSfxContent,
  stageMusicCues,
  type AudioLoader,
} from '../../src/loader/index.js';
import type { Song } from '../../src/synth/index.js';
import { FakeContext, type FakeGain } from '../helpers/fake-context.js';

/** A short looping 4-channel song. */
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
 * @param extra - Cue, stages, song overrides.
 * @returns The file.
 */
const trackFile = (id: string, extra: Record<string, unknown>): ContentFile => ({
  path: `audio/music/${id}.music.json`,
  data: { formatVersion: 1, kind: 'music', id, title: id, song: SONG, ...extra },
});

/** A one-shot variant of the song (≈ 0.24 s + its tail). */
const JINGLE: Song = { ...SONG, loopFromOrder: null };

const MUSIC = loadMusicContent([
  trackFile('theme', { cue: 'Stage' }),
  trackFile('zone-b', { cue: 'Stage', stages: ['zone-b'] }),
  trackFile('boss', { cue: 'Boss' }),
  trackFile('final', { cue: 'FinalBoss' }),
  trackFile('map', { cue: 'ZoneMap' }),
  trackFile('clear', { cue: 'StageClear', song: JINGLE }),
  trackFile('over', { cue: 'GameOver', song: JINGLE }),
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

/**
 * A web-audio-like graph on a fake context.
 *
 * @param context - The context.
 * @param missing - Buses the graph does not have.
 * @returns The graph and its buses.
 */
function graphOf(context: FakeContext, missing: readonly string[] = []) {
  const buses: Record<string, FakeGain> = {
    sfx: context.createGain(),
    ui: context.createGain(),
    music: context.createGain(),
  };
  const graph: AudioGraphLike = {
    context,
    bus: (name) => (missing.includes(name) ? null : (buses[name] ?? null)),
  };
  return { graph, buses };
}

/**
 * An engine attached to a fresh fake context.
 *
 * @param options - Extra engine options.
 * @returns The engine, context and buses.
 */
async function attached(options: Parameters<typeof createAudioEngine>[0] | null = null) {
  const engine = createAudioEngine(options ?? { sfx: SFX, music: MUSIC });
  await engine.loadSfx();
  const context = new FakeContext();
  const { graph, buses } = graphOf(context);
  expect(engine.attach(graph)).toBe(true);
  return { engine, context, buses };
}

/**
 * The id of the track the engine plays now.
 *
 * @param engine - The engine.
 * @returns The id, or `null`.
 */
const playing = (engine: ReturnType<typeof createAudioEngine>): string | null =>
  engine.music?.current?.id ?? null;

describe('audio-web/engine (edge)', () => {
  it('creates the SFX buffers when the bank finishes after the attach', async () => {
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC });
    const context = new FakeContext();
    engine.attach(graphOf(context).graph);
    expect(engine.playSfx(SFX_CUES.EnemyHit, 100, 0)).toBe(-1); // not rendered yet
    expect(context.buffers).toHaveLength(0);
    await engine.loadSfx();
    expect(context.buffers).toHaveLength(3);
    expect(engine.playSfx(SFX_CUES.EnemyHit, 100, 0)).toBe(0);
  });

  it('creates no buffers when destroyed while the bank renders', async () => {
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC });
    const context = new FakeContext();
    engine.attach(graphOf(context).graph);
    const pending = engine.loadSfx();
    engine.destroy();
    await pending;
    expect(context.buffers).toHaveLength(0);
    expect(engine.playSfx(SFX_CUES.EnemyHit, 0, 0)).toBe(-1);
  });

  it('does not attach to a graph missing the sfx or music bus; plays ui cues on sfx without a ui bus', async () => {
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC });
    await engine.loadSfx();
    expect(engine.attach(graphOf(new FakeContext(), ['sfx']).graph)).toBe(false);
    expect(engine.attach(graphOf(new FakeContext(), ['music']).graph)).toBe(false);
    expect(engine.attached).toBe(false);
    const context = new FakeContext();
    const { graph, buses } = graphOf(context, ['ui']);
    expect(engine.attach(graph)).toBe(true);
    engine.playSfx(SFX_CUES.MenuMove, 0, 0);
    expect(context.sources[0]?.connections).toEqual([buses.sfx]);
  });

  it('passes the voice cap, pan width and duck level through', async () => {
    const { engine, context } = await attached({
      sfx: SFX,
      music: MUSIC,
      maxVoices: 3,
      panWidth: 1,
      duckLevel: 0.5,
    });
    expect(engine.sfx?.maxVoices).toBe(3);
    const left = engine.playSfx(SFX_CUES.EnemyHit, 0, 0);
    engine.endFrame();
    const right = engine.playSfx(SFX_CUES.EnemyHit, 384, 0);
    expect(context.panners[left]?.pan.value).toBe(-1);
    expect(context.panners[right]?.pan.value).toBe(1);
    engine.duckMusic(60);
    const duck = context.gains[context.gains.length - 1];
    expect(duck?.gain.calls.find((call) => call.op === 'ramp')?.value).toBe(0.5);
  });

  it('forwards the priority hint to the voice manager', async () => {
    const { engine } = await attached({ sfx: SFX, music: MUSIC, maxVoices: 1 });
    expect(engine.playSfx(SFX_CUES.MegaCrash, 0, 0)).toBe(0);
    engine.endFrame();
    expect(engine.playSfx(SFX_CUES.EnemyHit, 0, 0)).toBe(-1); // low cannot take high
    expect(engine.playSfx(SFX_CUES.EnemyHit, 0, SfxPriority.Critical)).toBe(0);
  });

  it('ignores SFX and music cue ids out of range', async () => {
    const { engine } = await attached();
    await engine.prepareMusic('zone-a');
    for (const cue of [-1, 999, 1.5]) expect(engine.playSfx(cue, 100, 0), String(cue)).toBe(-1);
    engine.playMusic(MUSIC_CUES.Stage, 0);
    for (const cue of [-3, 99, 2.5]) engine.playMusic(cue, 0);
    expect(engine.missedMusic).toBe(3);
    // A missed request changes neither the cue nor the track.
    expect(engine.musicCue).toBe(MUSIC_CUES.Stage);
    expect(playing(engine)).toBe('theme');
  });

  it('misses every music cue before any loading phase', async () => {
    const { engine } = await attached();
    engine.playMusic(MUSIC_CUES.Stage, 0);
    expect(engine.missedMusic).toBe(1);
    expect(engine.musicCue).toBe(-1);
    expect(engine.residentTracks).toEqual([]);
  });

  it('prepares a set once per track, skipping Silence, unknown ids and duplicates', async () => {
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC });
    const progress: number[] = [];
    await engine.prepareMusic(
      'zone-a',
      [MUSIC_CUES.Silence, 99, -1, MUSIC_CUES.Stage, MUSIC_CUES.Stage, MUSIC_CUES.Ending],
      (fraction) => progress.push(fraction),
    );
    expect(engine.residentTracks).toEqual(['theme']);
    expect(progress).toEqual([0, 1]);
    const none: number[] = [];
    await engine.prepareMusic(null, [], (fraction) => none.push(fraction));
    expect(none).toEqual([1]);
    expect(engine.residentTracks).toEqual([]);
  });

  it('keeps the playing track resident across a loading phase until it is silenced', async () => {
    const { engine } = await attached();
    await engine.prepareMusic('zone-a');
    engine.playMusic(MUSIC_CUES.Stage, 0);
    await engine.prepareMusic(null, [MUSIC_CUES.Title]);
    expect([...engine.residentTracks].sort()).toEqual(['theme', 'title']);
    expect(playing(engine)).toBe('theme');
    engine.playMusic(MUSIC_CUES.Silence, 30);
    await engine.prepareMusic(null, [MUSIC_CUES.Title]);
    expect(engine.residentTracks).toEqual(['title']);
  });

  it("plays the stage's own track of a cue after a loading phase for that stage", async () => {
    const { engine } = await attached();
    await engine.prepareMusic('zone-b');
    engine.playMusic(MUSIC_CUES.Stage, 0);
    expect(playing(engine)).toBe('zone-b');
    await engine.prepareMusic('zone-a');
    // The cue now means the default theme: a new request switches tracks.
    engine.playMusic(MUSIC_CUES.Stage, 0);
    expect(playing(engine)).toBe('theme');
  });

  it('resolves a request made before the unlock against the set prepared last', async () => {
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC });
    await engine.prepareMusic('zone-a');
    engine.playMusic(MUSIC_CUES.Stage, 0);
    await engine.prepareMusic('zone-b');
    engine.attach(graphOf(new FakeContext()).graph);
    expect(playing(engine)).toBe('zone-b');
  });

  it('starts nothing on attach when the request was silenced before the unlock', async () => {
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC });
    await engine.prepareMusic('zone-a');
    engine.playMusic(MUSIC_CUES.Stage, 0);
    engine.playMusic(MUSIC_CUES.Silence, 30);
    const context = new FakeContext();
    engine.attach(graphOf(context).graph);
    expect(context.sources).toHaveLength(0);
    expect(engine.musicCue).toBe(-1);
  });

  it('replays a finished jingle and restarts a track after Silence', async () => {
    const { engine, context } = await attached();
    await engine.prepareMusic('zone-a');
    engine.playMusic(MUSIC_CUES.StageClear, 0);
    engine.playMusic(MUSIC_CUES.StageClear, 0); // still playing: not restarted
    expect(context.sources).toHaveLength(1);
    context.currentTime = 10; // the jingle is over
    engine.playMusic(MUSIC_CUES.StageClear, 0);
    expect(context.sources).toHaveLength(2);
    engine.playMusic(MUSIC_CUES.Stage, 0);
    engine.playMusic(MUSIC_CUES.Silence, 60);
    engine.playMusic(MUSIC_CUES.Stage, 15);
    expect(context.sources).toHaveLength(4);
    expect(playing(engine)).toBe('theme');
    // The restarted theme fades in over the requested ticks.
    const fade = context.gains[context.gains.length - 2];
    expect(fade?.gain.calls.slice(-2)).toEqual([
      { op: 'set', value: 0, time: 10 },
      { op: 'ramp', value: 1, time: 10 + 15 / 60 },
    ]);
  });

  it('survives a Silence over a Silence (the fade-out re-scheduled)', async () => {
    const { engine, context } = await attached();
    await engine.prepareMusic('zone-a');
    engine.playMusic(MUSIC_CUES.Stage, 0);
    context.currentTime = 1;
    engine.playMusic(MUSIC_CUES.Silence, 30);
    context.currentTime = 1.2;
    expect(() => engine.playMusic(MUSIC_CUES.Silence, 30)).not.toThrow();
    expect(context.sources[0]?.stopped).toBe(1.2 + 30 / 60);
  });

  it('rejects prepareMusic with the loader error; the releases of the failed phase stand', async () => {
    const real = createAudioLoader();
    const failing: AudioLoader = {
      sampleRate: real.sampleRate,
      musicPath: (track) => real.musicPath(track),
      loadSfx: (content, onProgress) => real.loadSfx(content, onProgress),
      loadTrack: (track) =>
        track.id === 'boss'
          ? Promise.reject(new AudioLoadError('audio/music/boss.ogg', 'status 404'))
          : real.loadTrack(track),
    };
    const { engine } = await attached({ sfx: SFX, music: MUSIC, loader: failing });
    await engine.prepareMusic('zone-b', [MUSIC_CUES.Stage]);
    await expect(engine.prepareMusic('zone-a')).rejects.toThrow(/boss\.ogg: status 404/);
    // The zone-b table still answers the Stage cue (its track resident, though not playing).
    engine.playMusic(MUSIC_CUES.Stage, 0);
    expect(engine.missedMusic).toBe(1); // zone-b's theme was released by the failed phase
    expect(playing(engine)).toBeNull();
  });

  it('is safe to feed before the attach and after destroy()', async () => {
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC });
    expect(() => {
      engine.duckMusic(120);
      engine.endFrame();
      engine.playMusic(MUSIC_CUES.Silence, 30);
    }).not.toThrow();
    expect(engine.sfx).toBeNull();
    expect(engine.music).toBeNull();
    await engine.prepareMusic('zone-a');
    engine.destroy();
    expect(engine.residentTracks).toEqual([]);
    expect(() => {
      engine.duckMusic(120);
      engine.endFrame();
      engine.playMusic(MUSIC_CUES.Stage, 0);
    }).not.toThrow();
    expect(engine.musicCue).toBe(-1);
  });

  it('plays centred on an engine without StereoPannerNode', async () => {
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC });
    await engine.loadSfx();
    const context = new FakeContext();
    context.hasPanner = false;
    const { graph, buses } = graphOf(context);
    engine.attach(graph);
    expect(engine.playSfx(SFX_CUES.EnemyHit, 0, 0)).toBe(0);
    expect(context.sources[0]?.connections).toEqual([buses.sfx]);
  });
});

describe('audio-web/engine stage music set (review round 1 regression)', () => {
  /** A stage whose boss theme is FinalBoss and which switches to ZoneMap mid-stage. */
  const FINAL_STAGE: Pick<StageSpec, 'music' | 'events'> = {
    music: {
      stage: 'Stage',
      stageId: MUSIC_CUES.Stage,
      boss: 'FinalBoss',
      bossId: MUSIC_CUES.FinalBoss,
    },
    events: [{ x: 500, type: 'music', cue: 'ZoneMap', cueId: MUSIC_CUES.ZoneMap }],
  };

  it("prepares and plays every cue the stage's own data names", async () => {
    const { engine } = await attached();
    await engine.prepareMusic('zone-a', stageMusicCues(FINAL_STAGE));
    expect([...engine.residentTracks].sort()).toEqual(['clear', 'final', 'map', 'over', 'theme']);
    // The sim's music for that stage, in order: theme, the mid-stage event, the boss, the jingle.
    const heard: Array<string | null> = [];
    for (const cue of [
      MUSIC_CUES.Stage,
      MUSIC_CUES.ZoneMap,
      MUSIC_CUES.FinalBoss,
      MUSIC_CUES.StageClear,
    ]) {
      engine.playMusic(cue, 0);
      heard.push(playing(engine));
    }
    expect(heard).toEqual(['theme', 'map', 'final', 'clear']);
    expect(engine.missedMusic).toBe(0);
  });

  it('left those cues silent with the fixed default set (the bug)', async () => {
    const { engine } = await attached();
    await engine.prepareMusic('zone-a', STAGE_MUSIC_CUES);
    engine.playMusic(MUSIC_CUES.ZoneMap, 0);
    engine.playMusic(MUSIC_CUES.FinalBoss, 0);
    expect(engine.missedMusic).toBe(2);
    expect(playing(engine)).toBeNull();
  });
});
