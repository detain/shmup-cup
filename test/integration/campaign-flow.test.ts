/**
 * The shipped zone map through the real scene flow (plan M2-10, "map navigation headless"): core
 * on the shipped content, the menus driven by action presses and the 4-way bot at the controls
 * while a zone plays (god mode, the debug boss skip so each zone is its boss fight). A game on zone
 * A is a campaign run: the title card, the zone result tally, the map — Down chooses the lower
 * exit, OK launches and asks the host to prepare the next stage — then zones C, E, G and I with
 * the players carried in (score, lives, loadout) and the rank's stage term growing, and the ending
 * of zone I at the end; the run lands in the saved hi-score table then (and only then). Since
 * M2-14 the ending plays its scene and epilogue, then the result card, then the credits roll to
 * the title.
 */
import {
  Action,
  ENDING_LINE_TICKS,
  ENDING_LOCK_TICKS,
  ENDING_STORY_HOLD_TICKS,
  HI_SCORE_LOCK_TICKS,
  ENGINE_SPRITES,
  KNOWN_SCRIPT_IDS,
  MUSIC_CUES,
  SimEventKind,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  createSaveStore,
  loadContent,
  type ContentDb,
  type SceneFlow,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';
import { fourWayBot } from '../playtest/four-way-bot.js';

/**
 * The shipped content, validated like the shell does.
 *
 * @returns The DB.
 */
function shipped(): ContentDb {
  const { db, issues } = loadContent(readContentFiles(), {
    knownScripts: KNOWN_SCRIPT_IDS,
    extraSprites: ENGINE_SPRITES,
  });
  expect(issues).toEqual([]);
  return db;
}

describe('integration: the zone map in the scene flow (M2-10)', () => {
  it('plays the route A-C-E-G-I through the menus to its ending', () => {
    const db = shipped();
    const platform = createHeadlessPlatform();
    const save = createSaveStore(null);
    const game = createGame(platform, { seed: 21, stage: 'zone-a', stageSkip: 'boss' }, db, {
      scenes: 'game',
      save,
    });
    game.debug.godMode = true;
    const flow = game.scenes as SceneFlow;
    const campaign = flow.campaign;
    expect(campaign?.id).toBe('main');
    const player = platform.snapshot.players[0];
    const prepared: number[] = [];
    let bot = fourWayBot();
    let world = game.world;
    const zones: string[] = [];
    const ranks: number[] = [];
    const scores: number[] = [];
    let pressed = 0;
    /**
     * One tick: the bot plays the game scene; on the map Down once, then OK; OK skips the tally.
     *
     * @returns The top scene's id after the tick.
     */
    const tick = (): string | undefined => {
      const top = flow.stack.top?.id;
      let held = 0;
      if (top === 'game') {
        if (game.world !== world) {
          world = game.world;
          bot = fourWayBot();
          zones.push(world.stage?.stage.id ?? '');
          ranks.push(world.rankInputs.stage);
          scores.push(world.scoring.board.scores[0].score);
        }
        held = bot.decide(game.world);
      } else if (top === 'map') {
        pressed++;
        // Wait out the map's open lock, press Down (the lower exit), then OK.
        if (pressed === 10) held = Action.Down;
        else if (pressed === 20) held = Action.Confirm;
      } else if (top === 'stageClear') {
        pressed = 0;
      }
      commitPlayerInput(player, held);
      game.step();
      game.events.drain((e) => {
        if (e.kind === SimEventKind.PrepareStage) prepared.push(e.id);
      });
      return flow.stack.top?.id;
    };
    zones.push(world.stage?.stage.id ?? '');
    ranks.push(world.rankInputs.stage);
    scores.push(0);
    let top: string | undefined = 'game';
    for (let i = 0; i < 60 * 60 * 15 && top !== 'ending'; i++) top = tick();
    expect(top).toBe('ending');
    expect(zones).toEqual(['zone-a', 'zone-c', 'zone-e', 'zone-g', 'zone-i']);
    expect(ranks).toEqual([1, 2, 3, 4, 5]);
    // The score is carried from zone to zone (and grows with each tally).
    for (let z = 1; z < scores.length; z++) expect(scores[z]).toBeGreaterThan(scores[z - 1]);
    expect(prepared.map((i) => db.stages[i].id)).toEqual(['zone-c', 'zone-e', 'zone-g', 'zone-i']);
    expect(flow.run.route.map((z) => campaign?.zones[z].label).join('')).toBe('ACEGI');
    expect(flow.run.ending?.zone).toBe('i');
    const table = save.hiScores('meter-normal');
    expect(table).toHaveLength(1);
    expect(table[0].reached).toBe('zone-i');
    expect(save.data.stats.stagesCleared).toBe(5);
    // M2-14: the ending the flags chose (no ship lost in god mode) plays the deep's scene and its
    // epilogue to the ending theme, then the result card, then the credits to theirs, then the title.
    expect(flow.run.ending?.id).toBe('throne-flawless');
    expect(flow.run.ending?.scene).toBe('abyss');
    const music: number[] = [];
    const step = (held: number): void => {
      commitPlayerInput(player, held);
      game.step();
      game.events.drain((e) => {
        if (e.kind === SimEventKind.Music) music.push(e.id);
      });
    };
    const lines = flow.run.ending?.text.length ?? 0;
    expect(lines).toBeGreaterThan(0);
    for (let t = 0; t < lines * ENDING_LINE_TICKS + 1; t++) step(0);
    expect(flow.ending.shown).toBe(lines);
    for (let t = 0; t < ENDING_STORY_HOLD_TICKS + ENDING_LOCK_TICKS + 2; t++) step(0);
    expect(flow.ending.phase).toBe(1); // the result card
    step(Action.Confirm);
    step(0);
    expect(flow.stack.top?.id).toBe('credits');
    expect(flow.credits.rows.length).toBeGreaterThanOrEqual(40);
    expect(music).toEqual(expect.arrayContaining([MUSIC_CUES.Credits]));
    for (let t = 0; t < 60 * 60 * 2 && flow.stack.top?.id === 'credits'; t++) step(0);
    // M2-15: the run's score entered its table — the name entry, with the four directions and OK
    // only (the remote): A (as it starts), Right, Up ×3 → C, Right, Up ×5 → E, Right → END, OK.
    expect(flow.stack.top?.id).toBe('nameEntry');
    const tap = (action: number): void => {
      step(action);
      step(0);
    };
    step(0);
    step(0); // the entry's lock
    const keys = [Action.Right, Action.Up, Action.Up, Action.Up, Action.Right];
    for (let i = 0; i < 5; i++) keys.push(Action.Up);
    keys.push(Action.Right);
    for (const key of keys) tap(key);
    expect(flow.nameEntry.entry.name).toBe('ACE');
    tap(Action.Confirm);
    expect(save.hiScores('meter-normal')[0]).toMatchObject({ name: 'ACE', reached: 'zone-i' });
    // The table with the new row, then (after its lock) OK → the title.
    expect(flow.stack.top?.id).toBe('hiScore');
    expect(flow.hiScores.key).toBe('meter-normal');
    for (let t = 0; t < HI_SCORE_LOCK_TICKS; t++) step(0);
    tap(Action.Confirm);
    expect(flow.stack.top?.id).toBe('title');
  }, 60_000);
});
