/**
 * The audio loader (plan M1-15): the `sfx` / `music` content kinds (validation issues with JSON
 * paths, per-stage cue resolution), SFX rendering with the volume baked in, song rendering, and
 * the OGG path — XHR `arraybuffer` → decode through an offline context at 32 kHz, loop points
 * converted — against fakes.
 */
import { MUSIC_CUES, SFX_CUES, SFX_CUE_NAMES, type ContentFile } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import * as audioWeb from '../../src/index.js';
import {
  AudioLoadError,
  DECODE_SAMPLE_RATE,
  STAGE_MUSIC_CUES,
  createAudioLoader,
  decodeAudioFile,
  loadArrayBuffer,
  loadMusicContent,
  loadSfxContent,
  moduleInfo,
  parseMusicContent,
  parseSfxContent,
  resolveMusicCues,
  toAudioBuffer,
  type DecodeContextLike,
  type XhrLike,
} from '../../src/loader/index.js';
import { renderSfx, renderSong, type Song } from '../../src/synth/index.js';
import { FakeBuffer, FakeContext } from '../helpers/fake-context.js';

/** A minimal valid song (4 channels, intro + loop). */
const SONG: Song = {
  speed: 6,
  instruments: { lead: { wave: 'pulse25' }, bass: { wave: 'triangle' } },
  channels: [
    { instrument: 'lead' },
    { instrument: 'lead' },
    { instrument: 'bass' },
    { instrument: 'bass' },
  ],
  patterns: {
    intro: { rows: 4, tracks: ['C4:4'] },
    a: { rows: 4, tracks: ['E4:2 G4:2', '', 'C2:4'] },
  },
  order: ['intro', 'a'],
  loopFromOrder: 1,
};

/**
 * A music content file.
 *
 * @param name - File name below `audio/music/`.
 * @param data - Fields over a valid song track.
 * @returns The file.
 */
function track(name: string, data: Record<string, unknown>): ContentFile {
  return {
    path: `audio/music/${name}.music.json`,
    data: {
      formatVersion: 1,
      kind: 'music',
      id: name,
      title: name.toUpperCase(),
      song: SONG,
      ...data,
    },
  };
}

describe('audio-web/loader sfx content', () => {
  it('describes itself and is exported from the package entry', () => {
    expect(moduleInfo.name).toBe('loader');
    expect(moduleInfo.status).toBe('implemented');
    expect(audioWeb.loadSfxContent).toBe(loadSfxContent);
    expect(audioWeb.createAudioLoader).toBe(createAudioLoader);
  });

  it('parses cues with their defaults, indexed by SFX_CUES id', () => {
    const { content, issues } = parseSfxContent({
      formatVersion: 1,
      kind: 'sfx',
      cues: {
        PlayerShot: { priority: 'low', maxInstances: 2, volume: 0.3, params: { frequency: 900 } },
        MenuMove: { priority: 'normal', maxInstances: 1, bus: 'ui', params: {} },
        WarningSiren: {
          priority: 'critical',
          maxInstances: 1,
          pan: false,
          file: 'audio/siren.ogg',
        },
      },
    });
    expect(issues).toEqual([]);
    expect(content.cues).toHaveLength(SFX_CUE_NAMES.length);
    expect(content.cues[SFX_CUES.PlayerShot]).toEqual({
      cue: 'PlayerShot',
      cueId: SFX_CUES.PlayerShot,
      priority: 'low',
      tier: 1,
      maxInstances: 2,
      volume: 0.3,
      bus: 'sfx',
      positional: true,
      params: { frequency: 900 },
      file: null,
    });
    expect(content.cues[SFX_CUES.MenuMove]).toMatchObject({
      bus: 'ui',
      positional: false,
      volume: 1,
    });
    expect(content.cues[SFX_CUES.WarningSiren]).toMatchObject({
      tier: 4,
      positional: false,
      params: null,
      file: 'audio/siren.ogg',
    });
    expect(content.cues[SFX_CUES.EnemyHit]).toBeNull();
  });

  it('reports bad entries with file paths and keeps the first definition of a cue', () => {
    const files: ContentFile[] = [
      {
        path: 'audio/c.sfx.json',
        data: {
          formatVersion: 1,
          kind: 'sfx',
          cues: { MegaCrash: { priority: 'loud', maxInstances: 9, params: { shape: 'wobble' } } },
        },
      },
      {
        path: 'audio/b.sfx.json',
        data: {
          formatVersion: 1,
          kind: 'sfx',
          cues: {
            PlayerShot: { priority: 'high', maxInstances: 1, params: {} },
            Nope: { priority: 'low', maxInstances: 1, params: {} },
          },
        },
      },
      {
        path: 'audio/a.sfx.json',
        data: {
          formatVersion: 1,
          kind: 'sfx',
          cues: { PlayerShot: { priority: 'low', maxInstances: 1, params: {} } },
        },
      },
    ];
    const { content, issues } = loadSfxContent(files);
    expect(issues).toEqual([
      { path: 'audio/b.sfx.json:cues.PlayerShot', message: 'cue "PlayerShot" is already defined' },
      { path: 'audio/b.sfx.json:cues.Nope', message: 'unknown SFX cue "Nope"' },
      {
        path: 'audio/c.sfx.json:cues.MegaCrash.priority',
        message: 'must be one of: low, normal, high, critical',
      },
      {
        path: 'audio/c.sfx.json:cues.MegaCrash.maxInstances',
        message: 'must be an integer in 1..8',
      },
      {
        path: 'audio/c.sfx.json:cues.MegaCrash.params.shape',
        message: 'must be one of: sine, triangle, saw, square, noise',
      },
    ]);
    // Files are read in path order: a.sfx.json's definition wins; c.sfx.json contributes nothing.
    expect(content.cues[SFX_CUES.PlayerShot]?.priority).toBe('low');
    expect(content.cues[SFX_CUES.MegaCrash]).toBeNull();
  });

  it('needs exactly one of params or file', () => {
    const { issues } = parseSfxContent(
      {
        formatVersion: 1,
        kind: 'sfx',
        cues: {
          EnemyHit: { priority: 'low', maxInstances: 1 },
          Clink: { priority: 'low', maxInstances: 1, params: {}, file: 'x.ogg' },
        },
      },
      'audio/x.sfx.json',
    );
    expect(issues).toEqual([
      {
        path: 'audio/x.sfx.json:cues.EnemyHit',
        message: 'needs exactly one of "params" or "file"',
      },
      { path: 'audio/x.sfx.json:cues.Clink', message: 'needs exactly one of "params" or "file"' },
    ]);
  });
});

describe('audio-web/loader music content', () => {
  it('parses tracks and resolves cues per stage (a stage binding beats the default)', () => {
    const { content, issues } = loadMusicContent([
      track('theme', { cue: 'Stage' }),
      track('special', { cue: 'Stage', stages: ['zone-b'] }),
      track('boss', { cue: 'Boss' }),
      track('free', {}),
    ]);
    expect(issues).toEqual([]);
    expect(content.tracks.map((t) => t.id)).toEqual(['boss', 'free', 'special', 'theme']);
    const ids = (stage: string | null): Array<string | null> =>
      Array.from(resolveMusicCues(content, stage), (index) =>
        index < 0 ? null : content.tracks[index].id,
      );
    expect(ids('zone-a')[MUSIC_CUES.Stage]).toBe('theme');
    expect(ids('zone-b')[MUSIC_CUES.Stage]).toBe('special');
    expect(ids(null)[MUSIC_CUES.Stage]).toBe('theme');
    expect(ids('zone-b')[MUSIC_CUES.Boss]).toBe('boss');
    expect(ids('zone-b')[MUSIC_CUES.Silence]).toBeNull();
    expect(ids('zone-b')[MUSIC_CUES.Title]).toBeNull();
    expect(STAGE_MUSIC_CUES).toEqual([
      MUSIC_CUES.Stage,
      MUSIC_CUES.Boss,
      MUSIC_CUES.StageClear,
      MUSIC_CUES.GameOver,
    ]);
  });

  it('parses a file track with its loop points', () => {
    const { content, issues } = parseMusicContent({
      formatVersion: 1,
      kind: 'music',
      id: 'zone-a-ogg',
      title: 'OGG',
      cue: 'Stage',
      file: 'audio/music/zone-a.ogg',
      loopStart: 64000,
      loopEnd: 1_600_000,
    });
    expect(issues).toEqual([]);
    expect(content.tracks[0]?.file).toEqual({
      url: 'audio/music/zone-a.ogg',
      loopStart: 64000,
      loopEnd: 1_600_000,
      sampleRate: DECODE_SAMPLE_RATE,
    });
  });

  it('reports every kind of bad track', () => {
    const bad = (name: string, data: Record<string, unknown>) =>
      loadMusicContent([track(name, data)]).issues;
    const at = (name: string) => `audio/music/${name}.music.json`;
    expect(bad('a', { cue: 'Nope' })).toEqual([
      { path: `${at('a')}:cue`, message: 'unknown music cue "Nope"' },
    ]);
    expect(bad('b', { stages: ['zone-a'] })).toEqual([
      { path: `${at('b')}:stages`, message: 'needs a "cue" to bind' },
    ]);
    expect(bad('c', { file: 'x.ogg' })).toEqual([
      { path: at('c'), message: 'needs exactly one of "song" or "file"' },
    ]);
    expect(bad('d', { loopStart: 1, loopEnd: 2 })).toEqual([
      {
        path: at('d'),
        message:
          'a song loops with "loopFromOrder"; loopStart / loopEnd / sampleRate are for files',
      },
    ]);
    expect(bad('e', { song: undefined, file: 'x.ogg', loopStart: 5 })).toEqual([
      { path: `${at('e')}:loopEnd`, message: 'loopStart and loopEnd come together' },
    ]);
    expect(bad('f', { song: undefined, file: 'x.ogg', loopStart: 5, loopEnd: 5 })).toEqual([
      { path: `${at('f')}:loopEnd`, message: 'must be greater than loopStart' },
    ]);
    const song = (patch: Partial<Song>) => bad('g', { song: { ...SONG, ...patch } });
    expect(song({ channels: SONG.channels.slice(0, 3) })).toEqual([
      { path: `${at('g')}:song.channels`, message: 'must have at least 4 items' },
    ]);
    expect(song({ channels: [...SONG.channels.slice(0, 3), { instrument: 'nope' }] })).toEqual([
      { path: `${at('g')}:song.channels[3].instrument`, message: 'unknown instrument "nope"' },
    ]);
    expect(
      song({ patterns: { ...SONG.patterns, a: { rows: 4, tracks: ['E4:3', 'X9', 'C2@drum:4'] } } }),
    ).toEqual([
      { path: `${at('g')}:song.patterns.a.tracks[0]`, message: 'covers 3 rows, the pattern has 4' },
      { path: `${at('g')}:song.patterns.a.tracks[1]`, message: 'bad token "X9"' },
      { path: `${at('g')}:song.patterns.a.tracks[2]`, message: 'unknown instrument "drum"' },
    ]);
    expect(
      song({
        patterns: { a: { rows: 4, tracks: ['', '', '', '', ''] } },
        order: ['a'],
        loopFromOrder: 0,
      }),
    ).toEqual([
      {
        path: `${at('g')}:song.patterns.a.tracks`,
        message: 'has 5 tracks, the song has 4 channels',
      },
    ]);
    expect(song({ order: ['intro', 'b'], loopFromOrder: 2 })).toEqual([
      { path: `${at('g')}:song.order[1]`, message: 'unknown pattern "b"' },
      { path: `${at('g')}:song.loopFromOrder`, message: 'must be below the order length (2)' },
    ]);
  });

  it('reports duplicate ids and cue bindings, keeping the first track', () => {
    const { content, issues } = loadMusicContent([
      track('a', { cue: 'Boss' }),
      { ...track('a', { cue: 'Title' }), path: 'audio/music/z.music.json' },
      track('b', { cue: 'Boss' }),
      track('c', { cue: 'Boss', stages: ['zone-a'] }),
      track('d', { cue: 'Boss', stages: ['zone-a'] }),
    ]);
    expect(issues).toEqual([
      { path: 'audio/music/b.music.json:cue', message: '"Boss" is already bound to "a"' },
      {
        path: 'audio/music/d.music.json:cue',
        message: '"Boss" for stage "zone-a" is already bound to "c"',
      },
      { path: 'audio/music/z.music.json:id', message: 'duplicate track id "a"' },
    ]);
    expect(content.tracks.map((t) => t.id)).toEqual(['a', 'c']);
  });
});

describe('audio-web/loader loading', () => {
  it('renders SFX with the cue volume baked in, and reports progress', async () => {
    const { content } = parseSfxContent({
      formatVersion: 1,
      kind: 'sfx',
      cues: {
        PlayerShot: {
          priority: 'low',
          maxInstances: 2,
          volume: 0.5,
          params: { frequency: 900, sustain: 0.02 },
        },
        EnemyHit: { priority: 'low', maxInstances: 2, params: { frequency: 600, sustain: 0.02 } },
      },
    });
    const loader = createAudioLoader();
    const progress: number[] = [];
    const sounds = await loader.loadSfx(content, (fraction) => progress.push(fraction));
    expect(progress).toEqual([0, 0.5, 1]);
    const shot = sounds[SFX_CUES.PlayerShot];
    const raw = renderSfx({ frequency: 900, sustain: 0.02 }, 22050);
    expect(shot?.sampleRate).toBe(22050);
    expect(shot?.pcm?.length).toBe(raw.length);
    expect(shot?.pcm?.[500]).toBe(Math.fround(raw[500] * 0.5));
    expect(sounds[SFX_CUES.EnemyHit]?.pcm).toEqual(
      renderSfx({ frequency: 600, sustain: 0.02 }, 22050),
    );
    expect(sounds[SFX_CUES.Clink]).toBeNull();
  });

  it('copies prepared samples into a buffer once and drops the array', async () => {
    const { content } = loadMusicContent([track('theme', { cue: 'Stage' })]);
    const loader = createAudioLoader();
    const prepared = await loader.loadTrack(content.tracks[0]);
    const rendered = renderSong(SONG, 22050);
    expect(prepared).toMatchObject({
      id: 'theme',
      sampleRate: 22050,
      loopStart: rendered.loopStart,
      loopEnd: rendered.loopEnd,
    });
    const context = new FakeContext();
    const buffer = toAudioBuffer(context, prepared);
    expect(buffer.sampleRate).toBe(22050);
    expect(buffer.getChannelData(0)).toEqual(rendered.pcm);
    expect(prepared.pcm).toBeNull();
    expect(toAudioBuffer(context, prepared)).toBe(buffer);
    expect(context.buffers).toHaveLength(1);
  });

  it('OGG path: fetches with XHR as an arraybuffer and decodes through an offline context', async () => {
    const requests: FakeXhr[] = [];
    class FakeXhr implements XhrLike {
      responseType = '';
      status = 0;
      response: unknown = null;
      onload: ((event: never) => unknown) | null = null;
      onerror: ((event: never) => unknown) | null = null;
      method = '';
      url = '';
      open(method: string, url: string): void {
        this.method = method;
        this.url = url;
      }
      send(): void {
        requests.push(this);
      }
    }
    const pending = loadArrayBuffer('audio/music/zone-a.ogg', () => new FakeXhr());
    const request = requests[0];
    expect([request?.method, request?.url, request?.responseType]).toEqual([
      'GET',
      'audio/music/zone-a.ogg',
      'arraybuffer',
    ]);
    const bytes = new ArrayBuffer(16);
    if (request !== undefined) {
      request.response = bytes; // status 0: a file:// response
      request.onload?.(undefined as never);
    }
    await expect(pending).resolves.toBe(bytes);

    const failing = loadArrayBuffer('missing.ogg', () => new FakeXhr());
    const second = requests[1];
    if (second !== undefined) {
      second.status = 404;
      second.onload?.(undefined as never);
    }
    await expect(failing).rejects.toBeInstanceOf(AudioLoadError);
    const network = loadArrayBuffer('down.ogg', () => new FakeXhr());
    requests[2]?.onerror?.(undefined as never);
    await expect(network).rejects.toThrow(/could not load down.ogg: network error/);

    const contexts: Array<{ data: ArrayBuffer }> = [];
    const decoded = new FakeBuffer(2, 64000, DECODE_SAMPLE_RATE);
    const decoder = (): DecodeContextLike => ({
      decodeAudioData(data, success) {
        contexts.push({ data });
        success(decoded);
        return Promise.resolve(decoded);
      },
    });
    await expect(decodeAudioFile(bytes, decoder)).resolves.toBe(decoded);
    expect(contexts[0]?.data).toBe(bytes);
    const broken = (): DecodeContextLike => ({
      decodeAudioData(_data, _success, error) {
        error(new Error('EncodingError'));
        return Promise.reject(new Error('EncodingError'));
      },
    });
    await expect(decodeAudioFile(bytes, broken, 'bad.ogg')).rejects.toThrow(
      /bad.ogg: decode failed/,
    );
    await expect(
      decodeAudioFile(bytes, () => {
        throw new Error('no OfflineAudioContext');
      }),
    ).rejects.toThrow(/no OfflineAudioContext/);
  });

  it('loads a file track and converts its loop points to the decoded rate', async () => {
    const { content } = parseMusicContent({
      formatVersion: 1,
      kind: 'music',
      id: 'zone-a-ogg',
      title: 'OGG',
      file: 'audio/music/zone-a.ogg',
      loopStart: 44100,
      loopEnd: 441000,
      sampleRate: 44100,
    });
    const urls: string[] = [];
    const decoded = new FakeBuffer(2, 320000, DECODE_SAMPLE_RATE);
    const loader = createAudioLoader({
      loadFile: (url) => {
        urls.push(url);
        return Promise.resolve(new ArrayBuffer(8));
      },
      decode: () => Promise.resolve(decoded),
    });
    const prepared = await loader.loadTrack(content.tracks[0]);
    expect(urls).toEqual(['audio/music/zone-a.ogg']);
    expect(prepared).toMatchObject({
      id: 'zone-a-ogg',
      pcm: null,
      buffer: decoded,
      sampleRate: 32000,
      loopStart: 32000,
      loopEnd: 320000,
    });
  });

  it('decodes recorded SFX with their volume applied to every channel', async () => {
    const { content } = parseSfxContent({
      formatVersion: 1,
      kind: 'sfx',
      cues: {
        MenuSelect: {
          priority: 'normal',
          maxInstances: 1,
          volume: 0.5,
          bus: 'ui',
          file: 'audio/sfx/select.ogg',
        },
      },
    });
    const decoded = new FakeBuffer(2, 4, DECODE_SAMPLE_RATE);
    decoded.channels[0]?.set([1, 1, 1, 1]);
    decoded.channels[1]?.set([-1, -1, -1, -1]);
    const loader = createAudioLoader({
      loadFile: () => Promise.resolve(new ArrayBuffer(8)),
      decode: () => Promise.resolve(decoded),
    });
    const sounds = await loader.loadSfx(content);
    expect(sounds[SFX_CUES.MenuSelect]).toEqual({
      pcm: null,
      buffer: decoded,
      sampleRate: DECODE_SAMPLE_RATE,
    });
    expect(Array.from(decoded.channels[0] ?? [])).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(Array.from(decoded.channels[1] ?? [])).toEqual([-0.5, -0.5, -0.5, -0.5]);
    const failing = createAudioLoader({
      loadFile: () => Promise.reject(new AudioLoadError('x', 'gone')),
    });
    await expect(failing.loadSfx(content)).rejects.toThrow(/gone/);
  });
});
