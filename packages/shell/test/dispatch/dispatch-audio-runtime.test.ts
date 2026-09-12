/**
 * The audio of a real stage end to end (plan M1-15), the way the shell wires it: the shipped
 * content validated by the shell's loader, a `createGame` session on the boss range (fully powered
 * KESTREL, god mode), its drained events routed by `connectAudioEvents` into a real `AudioEngine`
 * (the shipped SFX bank and the stage's music set — `stageMusicCues`) attached to a recording fake
 * `AudioContext` whose clock follows the ticks. Checked: the music the player hears, in order
 * (zone theme → WARNING silence → boss theme → silence → stage-clear jingle), no music cue ever
 * missed, the WARNING siren never dropped, the loop / one-shot flags of the sources.
 *
 * Regression of review round 1 (the stage's music set was a fixed list): a stage whose own data
 * names a FinalBoss boss theme and a mid-stage ZoneMap cue plays both through the same pipeline,
 * while the fixed default set would have left them silent.
 */
import {
  BossState,
  MUSIC_CUES,
  SFX_CUES,
  createGame,
  createHeadlessPlatform,
  type ContentFile,
  type Game,
} from '@shmup/core';
import {
  STAGE_MUSIC_CUES,
  createAudioEngine,
  loadMusicContent,
  loadSfxContent,
  stageMusicCues,
  type AudioEngine,
} from '@shmup/audio-web';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../../../vite.shared.js';
import { FakeContext } from '../../../audio-web/test/helpers/fake-context.js';
import { connectAudioEvents, createEventDispatcher } from '../../src/dispatch/index.js';
import { loadGameContent } from '../../src/loader/index.js';

/** What one run heard. */
interface Heard {
  /** Track ids in the order they became current (`null` = silenced). */
  readonly music: Array<string | null>;
  /** For each track that became current: whether its source loops. */
  readonly loops: boolean[];
  /** Every SFX request: cue and the voice slot it got (−1 = not started). */
  readonly sfx: Array<readonly [number, number]>;
  /** The engine after the run. */
  readonly engine: AudioEngine;
  /** The fake context. */
  readonly context: FakeContext;
  /** The game after the run. */
  readonly game: Game;
}

/**
 * Plays the boss range (or a variant of it) with the audio pipeline until the stage-clear jingle
 * has started (or a tick limit).
 *
 * @param files - The content files.
 * @param cues - The music set to prepare (default: the stage's own, `stageMusicCues`).
 * @returns What was heard.
 */
async function play(files: readonly ContentFile[], cues?: readonly number[]): Promise<Heard> {
  const { db, issues, foreign } = loadGameContent(files);
  expect(issues).toEqual([]);
  const kind = (name: string) =>
    foreign.filter((file) => (file.data as { kind?: unknown }).kind === name);
  const engine = createAudioEngine({
    sfx: loadSfxContent(kind('sfx')).content,
    music: loadMusicContent(kind('music')).content,
  });
  const game = createGame(
    createHeadlessPlatform(),
    { seed: 4, stage: 'test-boss', loadout: 'full' },
    db,
  );
  game.world.debugFlags.godMode = true;
  const stage = game.world.stage?.stage;
  if (stage === undefined) throw new Error('no stage');
  // The loading phase: the bank, then the stage's music set.
  await engine.loadSfx();
  await engine.prepareMusic(stage.id, cues ?? stageMusicCues(stage));
  const context = new FakeContext();
  const buses = {
    sfx: context.createGain(),
    ui: context.createGain(),
    music: context.createGain(),
  };
  expect(engine.attach({ context, bus: (name) => (name === 'master' ? null : buses[name]) })).toBe(
    true,
  );

  const heard: Heard = { music: [], loops: [], sfx: [], engine, context, game };
  const dispatcher = createEventDispatcher();
  connectAudioEvents(
    dispatcher,
    {
      playSfx: (cue, screenX, priority) => {
        const slot = engine.playSfx(cue, screenX, priority);
        heard.sfx.push([cue, slot]);
        return slot;
      },
      playMusic: (cue, fade) => engine.playMusic(cue, fade),
      duckMusic: (ticks) => engine.duckMusic(ticks),
    },
    game.world.view.camera,
  );
  let last: string | null | undefined;
  for (let i = 0; i < 14_000; i++) {
    game.step();
    context.currentTime = game.world.tick / 60;
    dispatcher.drain(game.events);
    engine.endFrame();
    const track = engine.music?.current ?? null;
    const current = track === null ? null : track.id;
    if (current !== last) {
      heard.music.push(current);
      last = current;
      const source = context.sources.find((s) => track !== null && s.buffer === track.buffer);
      if (source !== undefined) heard.loops.push(source.loop);
    }
    if (current === 'stage-clear') break;
  }
  return heard;
}

describe('shell/dispatch audio of a real stage (sim → events → engine)', () => {
  it('plays the zone theme, the WARNING silence, the boss theme and the stage-clear jingle', async () => {
    const heard = await play(readContentFiles());
    const { engine, game } = heard;
    // The jingle starts with the boss's defeat, while it is still going down.
    expect([BossState.Dying, BossState.Dead]).toContain(game.world.bosses.boss.state);
    expect(heard.music).toEqual(['zone-a', null, 'boss', null, 'stage-clear']);
    expect(engine.missedMusic).toBe(0);
    // The themes loop, the jingle does not.
    expect(heard.loops).toEqual([true, true, false]);
    // The WARNING siren pulses are critical: every one of them was heard.
    const sirens = heard.sfx.filter(([cue]) => cue === SFX_CUES.WarningSiren);
    expect(sirens.length).toBeGreaterThanOrEqual(1);
    expect(sirens.every(([, slot]) => slot >= 0)).toBe(true);
    // The fight was noisy: shots and explosions started, and the voice cap held.
    expect(engine.sfx?.started ?? 0).toBeGreaterThan(50);
    expect(engine.sfx?.activeVoices() ?? 99).toBeLessThanOrEqual(engine.sfx?.maxVoices ?? 0);
    engine.destroy();
  }, 60_000);

  it("plays the cues the stage's own data names (review round 1 regression)", async () => {
    const files = readContentFiles();
    const jingle = files.find((file) => file.path === 'audio/music/stage-clear.music.json');
    const range = files.find((file) => file.path === 'stages/test-boss.stage.json');
    if (jingle === undefined || range === undefined) throw new Error('content moved');
    /**
     * A copy of the stage-clear jingle bound to another cue for the boss range only.
     *
     * @param id - Track id.
     * @param cue - `MUSIC_CUES` name.
     * @returns The file.
     */
    const track = (id: string, cue: string): ContentFile => ({
      path: `audio/music/${id}.music.json`,
      data: { ...(jingle.data as object), id, cue, stages: ['test-boss'] },
    });
    const stage = range.data as { music: object; events: Array<{ x: number }> };
    const variant: ContentFile[] = [
      ...files.filter((file) => file !== range),
      {
        path: range.path,
        data: {
          ...stage,
          music: { stage: 'Stage', boss: 'FinalBoss' },
          // Timeline events are sorted by x.
          events: [...stage.events, { x: 200, type: 'music', cue: 'ZoneMap' }].sort(
            (a, b) => a.x - b.x,
          ),
        },
      },
      track('final-boss', 'FinalBoss'),
      track('zone-map', 'ZoneMap'),
    ];
    const heard = await play(variant);
    expect(heard.music).toEqual(['zone-a', 'zone-map', null, 'final-boss', null, 'stage-clear']);
    expect(heard.engine.missedMusic).toBe(0);
    expect(heard.loops).toEqual([true, false, false, false]); // the copies are jingles
    heard.engine.destroy();

    // The fixed default set (what the shell prepared before the fix) misses both cues.
    const before = await play(variant, STAGE_MUSIC_CUES);
    expect(before.engine.missedMusic).toBe(2);
    expect(before.music).not.toContain('final-boss');
    expect(before.music).not.toContain('zone-map');
    before.engine.destroy();
    expect(MUSIC_CUES.FinalBoss).not.toBe(MUSIC_CUES.Boss);
  }, 90_000);
});
