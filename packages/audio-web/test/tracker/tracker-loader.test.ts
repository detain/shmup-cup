/**
 * The music loader's side of the tracker path (plan M3-03): the `module` field of a `music` file,
 * its validation, and `AudioLoader.musicPath` — which never answers `'tracker'` in a build with no
 * backend, while `loadTrack` always prepares the song or file so nothing can fall silent.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import { createAudioLoader, parseMusicContent } from '../../src/loader/index.js';
import { type TrackerBackend } from '../../src/tracker/index.js';

/** The smallest song the schema accepts: four channels, one pattern. */
const SONG = {
  speed: 8,
  instruments: { lead: { wave: 'pulse50' } },
  channels: [
    { instrument: 'lead' },
    { instrument: 'lead' },
    { instrument: 'lead' },
    { instrument: 'lead' },
  ],
  patterns: { a: { rows: 4, tracks: ['C4 . . .'] } },
  order: ['a'],
};

/**
 * A `music` document.
 *
 * @param over - Fields over the base track.
 * @returns The document.
 */
function doc(over: Record<string, unknown> = {}) {
  return { formatVersion: 1, kind: 'music', id: 'zone-a', title: 'AZURE', song: SONG, ...over };
}

/** A backend that would play modules, if this repo depended on one. */
const FAKE_BACKEND: TrackerBackend = {
  load: () =>
    Promise.resolve({
      start: () => Promise.resolve(),
      stop: () => undefined,
      setVolume: () => undefined,
    }),
  dispose: () => undefined,
};

describe('audio-web/loader tracker modules (M3-03)', () => {
  it('accepts a module alongside a song and keeps it on the track', () => {
    const { content, issues } = parseMusicContent(doc({ module: 'audio/music/zone-a.xm' }));
    expect(issues).toEqual([]);
    expect(content.tracks[0].module).toBe('audio/music/zone-a.xm');
    expect(content.tracks[0].song).not.toBeNull();
  });

  it('leaves `module` null when a track has none', () => {
    expect(parseMusicContent(doc()).content.tracks[0].module).toBeNull();
  });

  it('refuses a "module" that is not a tracker module', () => {
    const { issues } = parseMusicContent(doc({ module: 'audio/music/zone-a.ogg' }), 'm.json');
    expect(issues).toEqual([
      {
        path: 'm.json:module',
        message: '"audio/music/zone-a.ogg" is not a tracker module (.mod, .xm, .it, .s3m)',
      },
    ]);
  });

  it('still needs exactly one of song or file: a module is never a source of its own', () => {
    const { issues } = parseMusicContent(
      { formatVersion: 1, kind: 'music', id: 'z', title: 'Z', module: 'a.xm' },
      'm.json',
    );
    expect(issues.map((issue) => issue.message)).toContain('needs exactly one of "song" or "file"');
  });

  it('answers "song" for a module track in a build with no backend, and prepares the song', async () => {
    const { content } = parseMusicContent(doc({ module: 'audio/music/zone-a.xm' }));
    const loader = createAudioLoader();
    const track = content.tracks[0];
    expect(loader.musicPath(track)).toBe('song');
    const prepared = await loader.loadTrack(track);
    expect(prepared.id).toBe('zone-a');
    expect(prepared.pcm?.length).toBeGreaterThan(0);
  });

  it('answers "tracker" once a build supplies a backend — and still prepares the fallback', async () => {
    const { content } = parseMusicContent(doc({ module: 'audio/music/zone-a.xm' }));
    const loader = createAudioLoader({
      tracker: { caps: { audioWorklet: true, wasm: true }, backend: FAKE_BACKEND },
    });
    const track = content.tracks[0];
    expect(loader.musicPath(track)).toBe('tracker');
    const prepared = await loader.loadTrack(track);
    expect(prepared.pcm?.length).toBeGreaterThan(0);
  });

  it('answers "song" for every track of the shipped content (no module ships)', () => {
    const loader = createAudioLoader({
      tracker: { caps: { audioWorklet: true, wasm: true }, backend: FAKE_BACKEND },
    });
    const { content } = parseMusicContent(doc());
    expect(loader.musicPath(content.tracks[0])).toBe('song');
  });
});
