/**
 * Allocation guard of the audio engine's per-frame decisions (plan M1-15, zero allocation per
 * frame — plan §1.3): Sfx / Music events drained through `connectAudioEvents` into a **real**
 * `AudioEngine` (on a fake Web Audio context) allocate nothing when no new sound starts — a sound
 * dropped because every voice holds a more important one (the pan is still computed from a
 * fractional camera x), a cue without a sound, a cue deduped within the frame, the track already
 * playing requested again, a music cue outside the prepared set — nor does `endFrame()`. Starting
 * a sound creates one Web Audio source node, the allocation the engine cannot avoid, so the
 * measured loop starts none. Kept in its own file, away from suites that build many objects (see
 * docs/dev/conventions.md).
 */
import {
  MUSIC_CUES,
  SFX_CUES,
  SimEventKind,
  createEventQueue,
  type ContentFile,
} from '@shmup/core';
import { createAudioEngine, loadMusicContent, loadSfxContent } from '@shmup/audio-web';
import { describe, expect, it } from 'vitest';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';
import { FakeContext } from '../../../audio-web/test/helpers/fake-context.js';
import { connectAudioEvents, createEventDispatcher } from '../../src/dispatch/index.js';

/** A camera with its own hidden class (a shared `{ x, y }` literal shape can box its doubles). */
class Camera {
  x = 0.5;
  y = 0;
}

/** A short looping song. */
const SONG = {
  speed: 6,
  instruments: { lead: { wave: 'pulse25' } },
  channels: [
    { instrument: 'lead' },
    { instrument: 'lead' },
    { instrument: 'lead' },
    { instrument: 'lead' },
  ],
  patterns: { a: { rows: 2, tracks: ['C4:2'] } },
  order: ['a'],
  loopFromOrder: 0,
};

const MUSIC_FILES: ContentFile[] = [
  {
    path: 'audio/music/theme.music.json',
    data: { formatVersion: 1, kind: 'music', id: 'theme', title: 'T', cue: 'Stage', song: SONG },
  },
];

const SFX_FILES: ContentFile[] = [
  {
    path: 'audio/test.sfx.json',
    data: {
      formatVersion: 1,
      kind: 'sfx',
      cues: {
        EnemyHit: { priority: 'low', maxInstances: 3, params: { sustain: 0.02 } },
        WarningSiren: { priority: 'critical', maxInstances: 1, params: { sustain: 0.5 } },
      },
    },
  },
];

describe('audio-web engine through connectAudioEvents: allocation', () => {
  it('decides dropped, deduped and unchanged sounds and music without allocating', async () => {
    const engine = createAudioEngine({
      sfx: loadSfxContent(SFX_FILES).content,
      music: loadMusicContent(MUSIC_FILES).content,
      maxVoices: 1,
    });
    await engine.loadSfx();
    await engine.prepareMusic('zone-a');
    const context = new FakeContext();
    const buses = {
      sfx: context.createGain(),
      ui: context.createGain(),
      music: context.createGain(),
    };
    expect(
      engine.attach({ context, bus: (name) => (name === 'master' ? null : buses[name]) }),
    ).toBe(true);
    const camera = new Camera();
    const dispatcher = createEventDispatcher();
    connectAudioEvents(dispatcher, engine, camera);
    // The one voice holds the critical siren (the clock stands still: it never ends); the theme
    // plays.
    const queue = createEventQueue();
    queue.push(SimEventKind.Sfx, SFX_CUES.WarningSiren, 0, 0, 0);
    queue.push(SimEventKind.Music, MUSIC_CUES.Stage, 0, 0, 0);
    dispatcher.drain(queue);
    const sources = context.sources.length;
    expect(sources).toBe(2);

    const growth = measureHeapGrowth(
      (tick) => {
        camera.x = 0.5 + tick * 0.25;
        const x = Math.floor(camera.x) + (tick % 97);
        queue.push(SimEventKind.Sfx, SFX_CUES.EnemyHit, x, 40, 0); // dropped: the voice is critical
        queue.push(SimEventKind.Sfx, SFX_CUES.PlayerShot, x, 40, 0); // no sound in this bank
        queue.push(SimEventKind.Sfx, SFX_CUES.WarningSiren, x, 0, 0); // deduped: started this frame
        if (tick % 60 === 0) queue.push(SimEventKind.Music, MUSIC_CUES.Stage, 0, 0, 0); // playing
        if (tick % 90 === 0) queue.push(SimEventKind.Music, MUSIC_CUES.Title, 0, 0, 0); // missed
        dispatcher.drain(queue);
        // No endFrame(): the siren started in this "frame" stays deduped.
      },
      10_000,
      20_000,
    );
    expect(context.sources).toHaveLength(sources);
    expect(engine.sfx?.dropped ?? 0).toBeGreaterThan(20_000);
    expect(engine.sfx?.deduped ?? 0).toBeGreaterThan(10_000);
    expect(engine.missedMusic).toBeGreaterThan(100);
    expect(growth.bytes).toBeLessThan(64 * 1024);

    const frames = measureHeapGrowth(
      () => {
        engine.endFrame();
      },
      10_000,
      20_000,
      3,
      16 * 1024,
    );
    expect(frames.bytes).toBeLessThan(32 * 1024);
    engine.destroy();
  }, 60_000);
});
