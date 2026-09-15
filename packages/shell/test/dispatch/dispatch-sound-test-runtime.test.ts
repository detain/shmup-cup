/**
 * The sound test end to end (plan M2-15), wired the way the shell does it: the shipped content
 * validated by the shell's loader, a `createGame` session on the title with the music library's
 * titles (`GameOptions.soundTest`), its drained events routed by `connectAudioEvents` and
 * `connectSoundTest` into a real `AudioEngine` (the shipped SFX bank and music) attached to a
 * recording fake `AudioContext`. Checked: SOUND TEST on the mode select plays the chosen library
 * track (loaded on demand), a positional SFX cue plays **centred** (review round 1 regression:
 * the sound test's `Sfx` events used to carry x 0 and came out panned 60 % left), STOP silences
 * the music and BACK brings the title theme back.
 */
import {
  Action,
  MUSIC_CUES,
  SFX_CUES,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  type Game,
  type SceneFlow,
} from '@shmup/core';
import { createAudioEngine, loadMusicContent, loadSfxContent } from '@shmup/audio-web';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../../../vite.shared.js';
import { FakeContext } from '../../../audio-web/test/helpers/fake-context.js';
import {
  connectAudioEvents,
  connectSoundTest,
  createEventDispatcher,
} from '../../src/dispatch/index.js';
import { loadGameContent } from '../../src/loader/index.js';

/**
 * Waits until a condition holds (the engine renders a track in the background).
 *
 * @param check - The condition.
 * @param what - What is awaited (for the error).
 * @returns Resolves once it holds.
 * @throws {Error} After 20 s.
 */
async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${what}`);
}

describe('shell/dispatch sound test end to end (M2-15)', () => {
  it('plays a library track, a centred SFX cue, STOP and the title theme again', async () => {
    const { db, issues, foreign } = loadGameContent(readContentFiles());
    expect(issues).toEqual([]);
    const kind = (name: string) =>
      foreign.filter((file) => (file.data as { kind?: unknown }).kind === name);
    const music = loadMusicContent(kind('music')).content;
    const engine = createAudioEngine({ sfx: loadSfxContent(kind('sfx')).content, music });
    await engine.loadSfx();
    await engine.prepareMusic('zone-a', [MUSIC_CUES.Title, MUSIC_CUES.Stage]);
    const context = new FakeContext();
    const buses = {
      sfx: context.createGain(),
      ui: context.createGain(),
      music: context.createGain(),
    };
    expect(
      engine.attach({ context, bus: (name) => (name === 'master' ? null : buses[name]) }),
    ).toBe(true);
    const titles = music.tracks.map((track) => track.title);
    const platform = createHeadlessPlatform();
    const game: Game = createGame(platform, { stage: 'zone-a' }, db, {
      scenes: 'title',
      soundTest: { music: titles },
    });
    const flow = game.scenes as SceneFlow;
    const dispatcher = createEventDispatcher();
    /** Every SFX request: cue, screen x and the voice slot it got. */
    const sfx: Array<[number, number, number]> = [];
    connectAudioEvents(
      dispatcher,
      {
        playSfx: (cue, screenX, priority) => {
          const slot = engine.playSfx(cue, screenX, priority);
          sfx.push([cue, screenX, slot]);
          return slot;
        },
        playMusic: (cue, fade) => engine.playMusic(cue, fade),
        duckMusic: (ticks) => engine.duckMusic(ticks),
      },
      game.world.view.camera,
    );
    const errors: unknown[] = [];
    connectSoundTest(dispatcher, engine, (error) => errors.push(error));
    const step = (held: number): void => {
      commitPlayerInput(platform.snapshot.players[0], held);
      game.step();
      context.currentTime += 1 / 60;
      dispatcher.drain(game.events);
      engine.endFrame();
    };
    const press = (action: number): void => {
      step(action);
      step(0);
    };
    step(0);
    await until(() => engine.music?.current?.id === 'title', 'the title theme');
    press(Action.Confirm); // PRESS OK
    step(0);
    step(0);
    for (let i = 0; i < 4; i++) press(Action.Down); // SOUND TEST
    press(Action.Confirm);
    expect(flow.stack.top?.id).toBe('soundTest');
    step(0);
    step(0);
    // MUSIC: the ending theme (not in the title's set — loaded on demand).
    const ending = music.tracks.findIndex((track) => track.id === 'ending');
    expect(ending).toBeGreaterThan(0);
    expect(engine.residentTracks).not.toContain('ending');
    for (let i = 0; i < ending; i++) press(Action.Right);
    expect(flow.soundTest.music.label).toBe(titles[ending]);
    press(Action.Confirm);
    await until(() => engine.music?.current?.id === 'ending', 'the ending theme');
    expect(errors).toEqual([]);
    // SFX: a positional cue plays centred.
    press(Action.Down);
    for (let i = 0; i < SFX_CUES.EnemyExplodeSmall; i++) press(Action.Right);
    // Every voice panner starts off-centre, so the pan the cue gets is seen.
    for (const panner of context.panners) panner.pan.value = 0.5;
    const from = sfx.length;
    const sources = context.sources.length;
    press(Action.Confirm);
    const played = sfx.slice(from).filter(([cue]) => cue === SFX_CUES.EnemyExplodeSmall);
    expect(played).toHaveLength(1);
    const [, screenX, slot] = played[0];
    expect(screenX).toBe(192);
    expect(slot).toBeGreaterThanOrEqual(0);
    const panner = context.panners[slot];
    // The cue's source plays through its voice's panner (a positional cue) …
    const source = context.sources.slice(sources).find((s) => s.connections.includes(panner));
    expect(source).toBeDefined();
    // … centred.
    expect(Math.abs(panner.pan.value)).toBeLessThan(1e-9);
    // STOP silences the music; BACK brings the title theme back.
    press(Action.Down); // STOP
    press(Action.Confirm);
    expect(engine.musicCue).toBe(-1);
    press(Action.Down); // BACK
    press(Action.Confirm);
    expect(flow.stack.top?.id).toBe('title');
    expect(engine.musicCue).toBe(MUSIC_CUES.Title);
    await until(() => engine.music?.current?.id === 'title', 'the title theme again');
    expect(engine.missedMusic).toBe(0);
    engine.destroy();
  }, 60_000);
});
