/**
 * Edge cases of the audio loader (plan M1-15): schema errors of both content kinds with their
 * JSON paths, relative-URL rules, frozen results, bindings of invalid tracks not claimed, cue
 * resolution whatever the file order, `stageMusicCues` corner cases (Silence themes, the sim's own
 * cues first named by events, a final zone's ending and credits themes — M2-14), `toAudioBuffer`
 * of an empty sound, every XHR outcome, callback-only decoders, and the default OGG path through
 * the **global** `XMLHttpRequest` and `OfflineAudioContext(2, 1, 32000)` (decision D22) with loop
 * points scaled to the decoded rate.
 */
import {
  MUSIC_CUES,
  MUSIC_CUE_NAMES,
  SFX_CUES,
  SFX_CUE_NAMES,
  type ContentFile,
  type StageEvent,
  type StageSpec,
} from '@shmup/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AudioLoadError,
  DECODE_SAMPLE_RATE,
  EMPTY_MUSIC_CONTENT,
  EMPTY_SFX_CONTENT,
  createAudioLoader,
  decodeAudioFile,
  loadArrayBuffer,
  loadMusicContent,
  loadSfxContent,
  parseMusicContent,
  parseSfxContent,
  resolveMusicCues,
  stageMusicCues,
  toAudioBuffer,
  type MusicTrackDef,
  type XhrLike,
} from '../../src/loader/index.js';
import { renderSfx, renderSong, songRowSamples, type Song } from '../../src/synth/index.js';
import { FakeBuffer, FakeContext } from '../helpers/fake-context.js';

/** A minimal valid song (4 channels, intro + loop). */
const SONG: Song = {
  speed: 6,
  instruments: { lead: { wave: 'pulse25' } },
  channels: [
    { instrument: 'lead' },
    { instrument: 'lead' },
    { instrument: 'lead' },
    { instrument: 'lead' },
  ],
  patterns: { intro: { rows: 2, tracks: ['C4:2'] }, a: { rows: 2, tracks: ['E4:2'] } },
  order: ['intro', 'a'],
  loopFromOrder: 1,
};

/**
 * A music content file over a valid song track.
 *
 * @param name - File name / track id.
 * @param data - Fields over the track.
 * @returns The file.
 */
const track = (name: string, data: Record<string, unknown> = {}): ContentFile => ({
  path: `audio/music/${name}.music.json`,
  data: { formatVersion: 1, kind: 'music', id: name, title: name, song: SONG, ...data },
});

/**
 * An `sfx` document with the given cues.
 *
 * @param cues - Cue entries.
 * @returns The document.
 */
const sfxDoc = (cues: Record<string, unknown>) => ({ formatVersion: 1, kind: 'sfx', cues });

/**
 * The paths of a list of issues.
 *
 * @param issues - Issues.
 * @returns Their paths.
 */
const paths = (issues: ReadonlyArray<{ path: string }>): string[] => issues.map((i) => i.path);

/** A recording fake `XMLHttpRequest`. */
class FakeXhr implements XhrLike {
  static readonly made: FakeXhr[] = [];
  responseType = '';
  status = 0;
  response: unknown = null;
  onload: ((event: never) => unknown) | null = null;
  onerror: ((event: never) => unknown) | null = null;
  url = '';
  constructor() {
    FakeXhr.made.push(this);
  }
  open(_method: string, url: string): void {
    this.url = url;
  }
  send(): void {}
  /**
   * Completes the request.
   *
   * @param status - HTTP status.
   * @param response - Body.
   */
  finish(status: number, response: unknown): void {
    this.status = status;
    this.response = response;
    this.onload?.(undefined as never);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeXhr.made.length = 0;
});

describe('audio-web/loader sfx content (edge)', () => {
  it('gives an empty, frozen bank for no files', () => {
    const { content, issues } = loadSfxContent([]);
    expect(issues).toEqual([]);
    expect(content.cues).toHaveLength(SFX_CUE_NAMES.length);
    expect(content.cues.every((cue) => cue === null)).toBe(true);
    expect(Object.isFrozen(content.cues)).toBe(true);
    expect(EMPTY_SFX_CONTENT.cues).toHaveLength(SFX_CUE_NAMES.length);
    expect(Object.isFrozen(EMPTY_SFX_CONTENT.cues)).toBe(true);
    expect(EMPTY_MUSIC_CONTENT.tracks).toEqual([]);
    expect(EMPTY_MUSIC_CONTENT.trackIndex.size).toBe(0);
  });

  it('reports schema errors of the file and of each parameter with their paths', () => {
    expect(
      paths(parseSfxContent({ formatVersion: 2, kind: 'sfx', cues: {} }, 'a.json').issues),
    ).toEqual(['a.json:formatVersion']);
    expect(paths(parseSfxContent({ formatVersion: 1, kind: 'music', cues: {} }).issues)).toEqual([
      'kind',
    ]);
    expect(paths(parseSfxContent(null).issues)).toHaveLength(1);
    const { content, issues } = parseSfxContent(
      sfxDoc({
        PlayerShot: {
          priority: 'low',
          maxInstances: 1,
          params: { bitCrush: 1.5, duty: 0.01, seed: 2 ** 32, tremoloRate: -1, frequency: 30000 },
        },
        EnemyHit: { priority: 'low', maxInstances: 0, volume: 1.5, params: {} },
        MenuMove: { priority: 'low', maxInstances: 1, bus: 'music', params: {} },
      }),
    );
    expect(paths(issues).sort()).toEqual(
      [
        'cues.EnemyHit.maxInstances',
        'cues.EnemyHit.volume',
        'cues.MenuMove.bus',
        'cues.PlayerShot.params.bitCrush',
        'cues.PlayerShot.params.duty',
        'cues.PlayerShot.params.frequency',
        'cues.PlayerShot.params.seed',
        'cues.PlayerShot.params.tremoloRate',
      ].sort(),
    );
    // A file with a schema error contributes nothing.
    expect(content.cues.every((cue) => cue === null)).toBe(true);
  });

  it('rejects cue names that are not PascalCase and unknown parameter fields', () => {
    const lower = parseSfxContent(
      sfxDoc({ playerShot: { priority: 'low', maxInstances: 1, params: {} } }),
    );
    expect(lower.issues).toHaveLength(1);
    expect(lower.issues[0]?.path).toMatch(/^cues/);
    const extra = parseSfxContent(
      sfxDoc({ PlayerShot: { priority: 'low', maxInstances: 1, params: { wobble: 1 } } }),
    );
    expect(extra.issues).toHaveLength(1);
    expect(extra.issues[0]?.path).toMatch(/^cues\.PlayerShot\.params/);
  });

  it('accepts only relative audio URLs for recorded sounds', () => {
    const file = (url: string) =>
      parseSfxContent(sfxDoc({ Clink: { priority: 'low', maxInstances: 1, file: url } })).issues;
    for (const url of ['audio/sfx/clink.ogg', 'clink.wav', 'a/b-c_d.mp3', 'x.m4a']) {
      expect(file(url), url).toEqual([]);
    }
    for (const url of [
      '../clink.ogg',
      'audio/../clink.ogg',
      '/audio/clink.ogg',
      'http://example.com/clink.ogg',
      'audio/clink.flac',
      'audio/clink',
      'audio\\clink.ogg',
    ]) {
      expect(paths(file(url)), url).toEqual(['cues.Clink.file']);
    }
  });

  it('derives positional from the bus unless pan says otherwise, and freezes a copy of params', () => {
    const params = { frequency: 300 };
    const { content } = parseSfxContent(
      sfxDoc({
        PlayerShot: { priority: 'low', maxInstances: 1, params },
        MegaCrash: { priority: 'high', maxInstances: 1, pan: false, params: {} },
        MenuMove: { priority: 'normal', maxInstances: 1, bus: 'ui', pan: true, params: {} },
        MenuSelect: { priority: 'normal', maxInstances: 1, bus: 'ui', volume: 0, params: {} },
      }),
    );
    const cue = (id: number) => content.cues[id];
    expect(cue(SFX_CUES.PlayerShot)?.positional).toBe(true);
    expect(cue(SFX_CUES.MegaCrash)?.positional).toBe(false);
    expect(cue(SFX_CUES.MenuMove)?.positional).toBe(true);
    expect(cue(SFX_CUES.MenuSelect)).toMatchObject({ positional: false, volume: 0, tier: 2 });
    const shot = cue(SFX_CUES.PlayerShot);
    expect(Object.isFrozen(shot)).toBe(true);
    expect(shot?.params).toEqual(params);
    expect(shot?.params).not.toBe(params);
    expect(Object.isFrozen(shot?.params)).toBe(true);
  });
});

describe('audio-web/loader music content (edge)', () => {
  it('reports schema errors of tracks and songs with their paths', () => {
    const bad = (data: Record<string, unknown>) =>
      paths(loadMusicContent([track('t', data)]).issues);
    const at = 'audio/music/t.music.json:';
    expect(bad({ id: 'Zone_A' })).toEqual([`${at}id`]);
    expect(bad({ title: 'X'.repeat(41) })).toEqual([`${at}title`]);
    expect(bad({ cue: 'stage' })).toEqual([`${at}cue`]);
    expect(bad({ song: { ...SONG, speed: 0 } })).toEqual([`${at}song.speed`]);
    expect(bad({ song: { ...SONG, loopFromOrder: -1 } })).toEqual([`${at}song.loopFromOrder`]);
    expect(
      bad({
        song: { ...SONG, channels: Array.from({ length: 7 }, () => ({ instrument: 'lead' })) },
      }),
    ).toEqual([`${at}song.channels`]);
    expect(
      bad({ song: { ...SONG, patterns: { ...SONG.patterns, a: { rows: 0, tracks: [''] } } } }),
    ).toEqual([`${at}song.patterns.a.rows`]);
    expect(
      bad({ song: { ...SONG, instruments: { lead: { wave: 'pulse25', arpeggio: [] } } } }),
    ).toEqual([`${at}song.instruments.lead.arpeggio`]);
    expect(bad({ song: undefined, file: 'x.ogg', loopStart: -1, loopEnd: 5 })).toEqual([
      `${at}loopStart`,
    ]);
    expect(bad({ song: undefined, file: 'x.ogg', sampleRate: 4000 })).toEqual([`${at}sampleRate`]);
  });

  it('validates every pattern, also those the order list never plays', () => {
    const issues = loadMusicContent([
      track('t', {
        song: { ...SONG, patterns: { ...SONG.patterns, spare: { rows: 2, tracks: ['X1'] } } },
      }),
    ]).issues;
    expect(issues).toEqual([
      { path: 'audio/music/t.music.json:song.patterns.spare.tracks[0]', message: 'bad token "X1"' },
    ]);
  });

  it('accepts a one-shot song (loopFromOrder null or absent) and a file without loop points', () => {
    const { content, issues } = loadMusicContent([
      track('a', { song: { ...SONG, loopFromOrder: null } }),
      track('b', { song: { ...SONG, loopFromOrder: undefined } }),
      track('c', { song: undefined, file: 'audio/music/c.ogg', sampleRate: 44100 }),
      track('d', { song: undefined, file: 'audio/music/d.ogg', loopStart: 0, loopEnd: 1 }),
    ]);
    expect(issues).toEqual([]);
    expect(content.tracks.map((t) => t.file)).toEqual([
      null,
      null,
      { url: 'audio/music/c.ogg', loopStart: -1, loopEnd: -1, sampleRate: 44100 },
      { url: 'audio/music/d.ogg', loopStart: 0, loopEnd: 1, sampleRate: DECODE_SAMPLE_RATE },
    ]);
    expect([...content.trackIndex.entries()]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 3],
    ]);
    expect(Object.isFrozen(content.tracks)).toBe(true);
    expect(Object.isFrozen(content.tracks[0])).toBe(true);
  });

  it('does not let a track with an issue claim its id or cue binding', () => {
    const { content, issues } = loadMusicContent([
      track('a', { id: 'boss', cue: 'Boss', song: { ...SONG, order: ['intro', 'nope'] } }),
      track('b', { id: 'boss', cue: 'Boss' }),
    ]);
    expect(issues).toEqual([
      { path: 'audio/music/a.music.json:song.order[1]', message: 'unknown pattern "nope"' },
    ]);
    expect(content.tracks.map((t) => t.id)).toEqual(['boss']);
    expect(content.tracks[0]?.title).toBe('b');
  });

  it('lets one cue have a default and several stage-specific tracks', () => {
    const { content, issues } = loadMusicContent([
      track('a-default', { cue: 'Stage' }),
      track('b-zones', { cue: 'Stage', stages: ['zone-b', 'zone-c'] }),
      track('c-zone-d', { cue: 'Stage', stages: ['zone-d'] }),
      track('d-clash', { cue: 'Stage', stages: ['zone-e', 'zone-c'] }),
      track('e-by-id', {}),
      track('f-silence', { cue: 'Silence' }),
    ]);
    expect(issues).toEqual([
      {
        path: 'audio/music/d-clash.music.json:cue',
        message: '"Stage" for stage "zone-c" is already bound to "b-zones"',
      },
    ]);
    const stageTrack = (stageId: string | null): string | undefined =>
      content.tracks[resolveMusicCues(content, stageId)[MUSIC_CUES.Stage]]?.id;
    expect(stageTrack('zone-b')).toBe('b-zones');
    expect(stageTrack('zone-c')).toBe('b-zones');
    expect(stageTrack('zone-d')).toBe('c-zone-d');
    expect(stageTrack('zone-e')).toBe('a-default'); // d-clash was left out entirely
    expect(stageTrack(null)).toBe('a-default');
    // A track bound to no cue, or to Silence, is never picked for a cue.
    const table = resolveMusicCues(content, 'zone-b');
    expect(table).toBeInstanceOf(Int16Array);
    expect(table).toHaveLength(MUSIC_CUE_NAMES.length);
    expect(table[MUSIC_CUES.Silence]).toBe(-1);
    expect(content.tracks.find((t) => t.id === 'e-by-id')?.cueId).toBe(-1);
  });

  it('resolves a stage-specific track over the default whatever the file order', () => {
    for (const [specific, fallback] of [
      ['a-special', 'z-theme'],
      ['z-special', 'a-theme'],
    ]) {
      const { content } = loadMusicContent([
        track(specific, { cue: 'Boss', stages: ['zone-b'] }),
        track(fallback, { cue: 'Boss' }),
      ]);
      const pick = (stage: string) =>
        content.tracks[resolveMusicCues(content, stage)[MUSIC_CUES.Boss]]?.id;
      expect(pick('zone-b')).toBe(specific);
      expect(pick('zone-a')).toBe(fallback);
    }
  });
});

describe('audio-web/loader stageMusicCues (edge)', () => {
  /**
   * A stage's music-relevant parts.
   *
   * @param theme - Theme cue id.
   * @param boss - Boss cue id.
   * @param events - Timeline events.
   * @returns The stage parts.
   */
  const stage = (
    theme: number,
    boss: number,
    events: StageEvent[] = [],
  ): Pick<StageSpec, 'music' | 'events'> => ({
    music: { stage: '', stageId: theme, boss: '', bossId: boss },
    events,
  });
  const music = (cueId: number): StageEvent => ({ x: 0, type: 'music', cue: '', cueId });

  it('leaves out Silence themes: a silent boss needs no track', () => {
    expect(stageMusicCues(stage(MUSIC_CUES.Silence, MUSIC_CUES.Silence))).toEqual([
      MUSIC_CUES.StageClear,
      MUSIC_CUES.GameOver,
    ]);
  });

  it("keeps first-use order when events name the sim's own cues first", () => {
    expect(
      stageMusicCues(
        stage(MUSIC_CUES.Stage, MUSIC_CUES.Stage, [
          music(MUSIC_CUES.GameOver),
          music(MUSIC_CUES.StageClear),
          music(MUSIC_CUES.Stage),
          music(MUSIC_CUES.Escape),
        ]),
      ),
    ).toEqual([MUSIC_CUES.Stage, MUSIC_CUES.GameOver, MUSIC_CUES.StageClear, MUSIC_CUES.Escape]);
  });

  it("adds a final zone's ending and credits themes once, last; Silence, -1 and absent add nothing (M2-14)", () => {
    const final = (
      ending: number | undefined,
      credits: number | undefined,
      events: StageEvent[] = [],
    ): Pick<StageSpec, 'music' | 'events'> => ({
      music: {
        stage: '',
        stageId: MUSIC_CUES.Stage,
        boss: '',
        bossId: MUSIC_CUES.FinalBoss,
        ...(ending === undefined ? {} : { ending: '', endingId: ending }),
        ...(credits === undefined ? {} : { credits: '', creditsId: credits }),
      },
      events,
    });
    const base = [
      MUSIC_CUES.Stage,
      MUSIC_CUES.FinalBoss,
      MUSIC_CUES.StageClear,
      MUSIC_CUES.GameOver,
    ];
    // Absent on a hand-built spec, unresolved (-1) or Silence: nothing more.
    expect(stageMusicCues(final(undefined, undefined))).toEqual(base);
    expect(stageMusicCues(final(-1, -1))).toEqual(base);
    expect(stageMusicCues(final(MUSIC_CUES.Silence, MUSIC_CUES.Silence))).toEqual(base);
    // One theme for both: listed once.
    expect(stageMusicCues(final(MUSIC_CUES.Ending, MUSIC_CUES.Ending))).toEqual([
      ...base,
      MUSIC_CUES.Ending,
    ]);
    // Only the credits theme.
    expect(stageMusicCues(final(undefined, MUSIC_CUES.Credits))).toEqual([
      ...base,
      MUSIC_CUES.Credits,
    ]);
    // A theme the stage already uses keeps its first-use place (a music event, the boss theme).
    expect(
      stageMusicCues(final(MUSIC_CUES.Ending, MUSIC_CUES.FinalBoss, [music(MUSIC_CUES.Ending)])),
    ).toEqual([
      MUSIC_CUES.Stage,
      MUSIC_CUES.FinalBoss,
      MUSIC_CUES.Ending,
      MUSIC_CUES.StageClear,
      MUSIC_CUES.GameOver,
    ]);
  });

  it('returns a new array each time', () => {
    const spec = stage(MUSIC_CUES.Stage, MUSIC_CUES.Boss);
    const a = stageMusicCues(spec);
    a.push(99);
    expect(stageMusicCues(spec)).not.toContain(99);
  });
});

describe('audio-web/loader loading (edge)', () => {
  it('copies an empty prepared sound into a one-frame silent buffer at its rate', () => {
    const context = new FakeContext();
    const sound = { pcm: null, buffer: null, sampleRate: 11025 };
    const buffer = toAudioBuffer(context, sound);
    expect([buffer.length, buffer.sampleRate, buffer.numberOfChannels]).toEqual([1, 11025, 1]);
    expect(buffer.getChannelData(0)[0]).toBe(0);
    expect(sound.buffer).toBe(buffer);
  });

  it('resolves 2xx and status 0 (file://) with a body; rejects every other outcome', async () => {
    const outcome = (status: number, body: unknown): Promise<ArrayBuffer> => {
      const pending = loadArrayBuffer('a.ogg', () => new FakeXhr());
      FakeXhr.made[FakeXhr.made.length - 1]?.finish(status, body);
      return pending;
    };
    const bytes = new ArrayBuffer(4);
    await expect(outcome(200, bytes)).resolves.toBe(bytes);
    await expect(outcome(299, bytes)).resolves.toBe(bytes);
    await expect(outcome(0, bytes)).resolves.toBe(bytes);
    await expect(outcome(300, bytes)).rejects.toThrow('could not load a.ogg: status 300');
    await expect(outcome(199, bytes)).rejects.toThrow(/status 199/);
    await expect(outcome(500, bytes)).rejects.toThrow(/status 500/);
    await expect(outcome(204, new ArrayBuffer(0))).rejects.toThrow(/status 204/);
    await expect(outcome(0, new ArrayBuffer(0))).rejects.toThrow(/status 0/);
    await expect(outcome(200, 'text')).rejects.toBeInstanceOf(AudioLoadError);
    await expect(outcome(200, null)).rejects.toMatchObject({
      name: 'AudioLoadError',
      url: 'a.ogg',
    });
    expect(FakeXhr.made.every((xhr) => xhr.responseType === 'arraybuffer')).toBe(true);
  });

  it('decodes through callback-only engines, and reports a failing factory', async () => {
    const decoded = new FakeBuffer(1, 8, DECODE_SAMPLE_RATE);
    await expect(
      decodeAudioFile(new ArrayBuffer(8), () => ({
        decodeAudioData(_data, success) {
          success(decoded);
          return undefined; // no promise: the old callback form only
        },
      })),
    ).resolves.toBe(decoded);
    await expect(
      decodeAudioFile(
        new ArrayBuffer(8),
        () => {
          throw 'no audio'; // eslint-disable-line @typescript-eslint/only-throw-error -- a non-Error, on purpose
        },
        'x.ogg',
      ),
    ).rejects.toThrow('could not load x.ogg: no audio');
    await expect(
      decodeAudioFile(new ArrayBuffer(8), () => ({
        decodeAudioData(_data, _success, error) {
          error(null);
          return undefined;
        },
      })),
    ).rejects.toThrow('could not load (buffer): decode failed (null)');
  });

  it('rejects the default decode when the engine has no OfflineAudioContext', async () => {
    vi.stubGlobal('OfflineAudioContext', undefined);
    await expect(decodeAudioFile(new ArrayBuffer(8))).rejects.toThrow(/no OfflineAudioContext/);
  });

  it('OGG path by default: global XHR as arraybuffer → OfflineAudioContext(2, 1, 32000), loop points scaled', async () => {
    const constructed: unknown[][] = [];
    const decoded = new FakeBuffer(2, 64000, DECODE_SAMPLE_RATE);
    class FakeOffline {
      constructor(...args: unknown[]) {
        constructed.push(args);
      }
      decodeAudioData(
        data: ArrayBuffer,
        success: (buffer: FakeBuffer) => void,
      ): Promise<FakeBuffer> {
        expect(data.byteLength).toBe(16);
        success(decoded);
        return Promise.resolve(decoded);
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    vi.stubGlobal('OfflineAudioContext', FakeOffline);
    const { content } = parseMusicContent({
      formatVersion: 1,
      kind: 'music',
      id: 'zone-a-ogg',
      title: 'OGG',
      file: 'audio/music/zone-a.ogg',
      loopStart: 22050,
      loopEnd: 88200,
      sampleRate: 44100,
    });
    const loader = createAudioLoader();
    const pending = loader.loadTrack(content.tracks[0]);
    await Promise.resolve();
    const request = FakeXhr.made[0];
    expect([request?.url, request?.responseType]).toEqual([
      'audio/music/zone-a.ogg',
      'arraybuffer',
    ]);
    request?.finish(0, new ArrayBuffer(16));
    const prepared = await pending;
    expect(constructed).toEqual([[2, 1, 32000]]);
    // 44.1 kHz loop points → 32 kHz frames: 0.5 s … 2 s (the end clamped to the 64,000 frames).
    expect(prepared).toMatchObject({
      buffer: decoded,
      sampleRate: 32000,
      loopStart: 16000,
      loopEnd: 64000,
    });
  });

  it('scales loop points to a decoded rate other than 32 kHz and clamps the end to the buffer', async () => {
    const loadTrack = (file: MusicTrackDef['file'], decoded: FakeBuffer) =>
      createAudioLoader({
        loadFile: () => Promise.resolve(new ArrayBuffer(8)),
        decode: () => Promise.resolve(decoded),
      }).loadTrack({
        id: 'x',
        title: 'X',
        cue: null,
        cueId: -1,
        stages: null,
        song: null,
        file,
        module: null,
      });
    const at48k = await loadTrack(
      { url: 'x.ogg', loopStart: 32000, loopEnd: 96000, sampleRate: 32000 },
      new FakeBuffer(2, 1_000_000, 48000),
    );
    expect([at48k.loopStart, at48k.loopEnd]).toEqual([48000, 144000]);
    const clamped = await loadTrack(
      { url: 'x.ogg', loopStart: 100, loopEnd: 1e9, sampleRate: 32000 },
      new FakeBuffer(1, 5000, 32000),
    );
    expect([clamped.loopStart, clamped.loopEnd]).toEqual([100, 5000]);
    const oneShot = await loadTrack(
      { url: 'x.ogg', loopStart: -1, loopEnd: -1, sampleRate: 32000 },
      new FakeBuffer(1, 5000, 32000),
    );
    expect([oneShot.loopStart, oneShot.loopEnd]).toEqual([-1, -1]);
  });

  it('rejects a track with neither song nor file, and a file that cannot be fetched', async () => {
    const loader = createAudioLoader({
      loadFile: (url) => Promise.reject(new AudioLoadError(url, 'status 404')),
    });
    const def = {
      id: 'x',
      title: 'X',
      cue: null,
      cueId: -1,
      stages: null,
      song: null,
      module: null,
    };
    await expect(loader.loadTrack({ ...def, file: null })).rejects.toThrow(
      'could not load x: track has no song or file',
    );
    await expect(
      loader.loadTrack({
        ...def,
        file: { url: 'gone.ogg', loopStart: -1, loopEnd: -1, sampleRate: 32000 },
      }),
    ).rejects.toThrow('could not load gone.ogg: status 404');
  });

  it('renders at the loader rate: SFX length and song loop points follow it', async () => {
    const loader = createAudioLoader({ sampleRate: 11025 });
    expect(loader.sampleRate).toBe(11025);
    expect(createAudioLoader().sampleRate).toBe(22050);
    const { content } = parseSfxContent(
      sfxDoc({ PlayerShot: { priority: 'low', maxInstances: 1, params: { sustain: 0.02 } } }),
    );
    const sounds = await loader.loadSfx(content);
    expect(sounds[SFX_CUES.PlayerShot]?.sampleRate).toBe(11025);
    expect(sounds[SFX_CUES.PlayerShot]?.pcm).toEqual(renderSfx({ sustain: 0.02 }, 11025));
    const music = loadMusicContent([track('t')]).content;
    const prepared = await loader.loadTrack(music.tracks[0]);
    const spr = songRowSamples(SONG, 11025);
    expect([prepared.sampleRate, prepared.loopStart, prepared.loopEnd]).toEqual([
      11025,
      2 * spr,
      4 * spr,
    ]);
    expect(prepared.pcm).toEqual(renderSong(SONG, 11025).pcm);
  });

  it('reports progress 1 at once for an empty bank; monotonic to 1 for a mixed one', async () => {
    const loader = createAudioLoader({
      loadFile: () => Promise.resolve(new ArrayBuffer(8)),
      decode: () => Promise.resolve(new FakeBuffer(1, 4, 32000)),
    });
    const empty: number[] = [];
    const none = await loader.loadSfx(EMPTY_SFX_CONTENT, (f) => empty.push(f));
    expect(empty).toEqual([1]);
    expect(none.every((sound) => sound === null)).toBe(true);
    const { content } = parseSfxContent(
      sfxDoc({
        PlayerShot: { priority: 'low', maxInstances: 1, file: 'shot.ogg' },
        EnemyHit: { priority: 'low', maxInstances: 1, params: { sustain: 0.01 } },
        Clink: { priority: 'low', maxInstances: 1, file: 'clink.ogg' },
        MenuMove: { priority: 'low', maxInstances: 1, params: { sustain: 0.01 } },
      }),
    );
    const progress: number[] = [];
    const sounds = await loader.loadSfx(content, (f) => progress.push(f));
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(1);
    expect(progress).toHaveLength(5);
    for (let i = 1; i < progress.length; i++) expect(progress[i]).toBeGreaterThan(progress[i - 1]);
    expect(sounds.filter((sound) => sound !== null)).toHaveLength(4);
    expect(sounds[SFX_CUES.PlayerShot]?.pcm).toBeNull();
    expect(sounds[SFX_CUES.EnemyHit]?.buffer).toBeNull();
  });

  it('leaves a recorded sound at volume 1 untouched', async () => {
    const decoded = new FakeBuffer(1, 3, 32000);
    decoded.channels[0]?.set([0.25, -0.5, 1]);
    const loader = createAudioLoader({
      loadFile: () => Promise.resolve(new ArrayBuffer(8)),
      decode: () => Promise.resolve(decoded),
    });
    const { content } = parseSfxContent(
      sfxDoc({ Clink: { priority: 'low', maxInstances: 1, file: 'clink.ogg' } }),
    );
    await loader.loadSfx(content);
    expect(Array.from(decoded.channels[0] ?? [])).toEqual([0.25, -0.5, 1]);
  });
});
