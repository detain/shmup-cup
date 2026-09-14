/**
 * `dispatch` + the scene flow (plan M2-10, review round 1): the music set the audio engine holds
 * follows the stage about to play across runs. A campaign run goes through the zone map to a
 * zone with its own `Stage` track, ends, returns to the title and starts again: the second run's
 * start zone must hear its own theme (not the last zone's, and never a missed cue). Wired the way
 * the shell does it: a `createGame` flow's drained events into `connectAudioEvents` and
 * `connectStagePreparation` (`stageMusicCues`) over a real `AudioEngine` on a fake context.
 */
import {
  Action,
  ENDING_LOCK_TICKS,
  MUSIC_CUES,
  SimEventKind,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  type ContentFile,
  type SceneFlow,
} from '@shmup/core';
import {
  createAudioEngine,
  loadMusicContent,
  loadSfxContent,
  stageMusicCues,
  type AudioEngine,
} from '@shmup/audio-web';
import { describe, expect, it } from 'vitest';
import type { Song } from '../../../audio-web/src/synth/index.js';
import { FakeContext } from '../../../audio-web/test/helpers/fake-context.js';
import { campaignContent } from '../../../core/test/helpers/campaign.js';
import {
  connectAudioEvents,
  connectStagePreparation,
  createEventDispatcher,
} from '../../src/dispatch/index.js';

/** A short looping song. */
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
 * @param extra - Cue and stages.
 * @returns The file.
 */
const trackFile = (id: string, extra: Record<string, unknown>): ContentFile => ({
  path: `audio/music/${id}.music.json`,
  data: { formatVersion: 1, kind: 'music', id, title: id, song: SONG, ...extra },
});

/** The generic theme, the upper zone's own theme, the boss, the jingles, the title. */
const MUSIC_LOAD = loadMusicContent([
  trackFile('theme', { cue: 'Stage' }),
  trackFile('upper', { cue: 'Stage', stages: ['t-u'] }),
  trackFile('boss', { cue: 'Boss' }),
  trackFile('clear', { cue: 'StageClear', song: { ...SONG, loopFromOrder: null } }),
  trackFile('over', { cue: 'GameOver', song: { ...SONG, loopFromOrder: null } }),
  trackFile('title', { cue: 'Title' }),
]);
const MUSIC = MUSIC_LOAD.content;

const SFX = loadSfxContent([
  {
    path: 'audio/test.sfx.json',
    data: {
      formatVersion: 1,
      kind: 'sfx',
      cues: { MenuMove: { priority: 'normal', maxInstances: 1, params: { sustain: 0.01 } } },
    },
  },
]).content;

/**
 * The id of the track the engine plays now.
 *
 * @param engine - The engine.
 * @returns The id, or `null`.
 */
const playing = (engine: AudioEngine): string | null => engine.music?.current?.id ?? null;

describe('shell/dispatch stage preparation through the flow (M2-10, review round 1)', () => {
  it('a second run`s start zone plays its own theme after a run that ended in another zone', async () => {
    expect(MUSIC_LOAD.issues).toEqual([]);
    const db = campaignContent();
    const platform = createHeadlessPlatform();
    const game = createGame(platform, { seed: 3, stage: 't-s' }, db, { scenes: 'game' });
    const flow = game.scenes as SceneFlow;
    game.debug.godMode = true;
    const engine = createAudioEngine({ sfx: SFX, music: MUSIC });
    // The loading phase, as the shell boots a flow: the host stage's set plus the title theme.
    const start = db.stages[db.stageIndex.get('t-s') ?? -1];
    await engine.loadSfx();
    await engine.prepareMusic('t-s', [MUSIC_CUES.Title, ...stageMusicCues(start)]);
    const context = new FakeContext();
    const buses = {
      sfx: context.createGain(),
      ui: context.createGain(),
      music: context.createGain(),
    };
    expect(
      engine.attach({ context, bus: (name) => (name === 'master' ? null : buses[name]) }),
    ).toBe(true);
    const dispatcher = createEventDispatcher();
    connectAudioEvents(dispatcher, engine, game.world.view.camera);
    const failures: unknown[] = [];
    connectStagePreparation(dispatcher, engine, db.stages, stageMusicCues, (e) => failures.push(e));
    let preparations = 0;
    dispatcher.on(SimEventKind.PrepareStage, () => preparations++);

    /**
     * Steps the game (the loading phases the preparations started run between ticks).
     *
     * @param ticks - Ticks.
     * @param confirm - Hold OK on the first tick.
     */
    const step = async (ticks: number, confirm = false): Promise<void> => {
      for (let t = 0; t < ticks; t++) {
        commitPlayerInput(platform.snapshot.players[0], confirm && t === 0 ? Action.Confirm : 0);
        const before = preparations;
        game.step();
        dispatcher.drain(game.events);
        engine.endFrame();
        if (preparations !== before) await new Promise((resolve) => setTimeout(resolve, 0));
      }
    };
    /**
     * Steps until a scene is on top.
     *
     * @param id - Scene id.
     */
    const until = async (id: string): Promise<void> => {
      for (let i = 0; i < 4000 && flow.stack.top?.id !== id; i++) await step(1);
      expect(flow.stack.top?.id).toBe(id);
    };
    /** One OK press (a tick down, a tick up). */
    const press = async (): Promise<void> => {
      await step(1, true);
      await step(1);
    };

    await step(1); // the first run's theme (queued by its World) reaches the engine
    expect(playing(engine)).toBe('theme');
    await until('map');
    await step(3);
    await press(); // the upper zone
    await until('game');
    await step(2);
    expect(game.world.stage?.stage.id).toBe('t-u');
    expect(playing(engine)).toBe('upper');
    await until('stageClear');
    await press();
    await until('ending');
    await step(ENDING_LOCK_TICKS);
    await press();
    expect(flow.stack.top?.id).toBe('title');
    expect(playing(engine)).toBe('title');
    // A new run from the title: the start zone's theme through its own table.
    flow.stack.reset(flow.game);
    await step(2);
    expect(game.world.stage?.stage.id).toBe('t-s');
    expect(playing(engine)).toBe('theme');
    expect(engine.missedMusic).toBe(0);
    expect(failures).toEqual([]);
    expect(engine.residentTracks).not.toContain('upper');
  });
});
