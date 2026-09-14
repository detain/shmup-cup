/**
 * The M2-10 campaign run through the scene flow, headless: a small map (start `S` → upper `U` |
 * lower `L`, both final) on tiny stages. A game on the start zone's stage is a campaign run: the
 * zone's title card, the zone result tally after its clear (kill rate, time bonus — paid, the run
 * not recorded yet), the zone map (Up / Down, OK launches — `PrepareStage` —, Back asks), the next
 * zone's World with the players carried in and the rank's stage term, RETRY STAGE from the zone's
 * entry state, the ending after the final zone (picked by the run's flags, the run recorded), the
 * practice plumbing, and the hidden bonus stage (entry, boss skipped on its clear, the death that
 * locks the players out).
 */
import { describe, expect, it } from 'vitest';
import type { ContentDb } from '../../src/data/index.js';
import { MUSIC_CUES, SimEventKind } from '../../src/events/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { PlayerHitCause, playerHit } from '../../src/player/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import { createSaveStore, type SaveStore } from '../../src/save/index.js';
import {
  BONUS_FAIL_TICKS,
  BONUS_WARP_TICKS,
  ENDING_LOCK_TICKS,
  KILL_BONUS_PER_PERCENT,
  MAP_LAUNCH_TICKS,
  RunFlag,
  ZONE_CARD_TICKS,
  ZONE_TALLY_TICKS,
  type SceneFlow,
} from '../../src/scenes/index.js';
import { campaignContent as content } from '../helpers/campaign.js';

/** A headless campaign session. */
class Session {
  readonly game: Game;
  readonly flow: SceneFlow;
  readonly platform = createHeadlessPlatform();
  readonly save: SaveStore = createSaveStore(null);
  /** Drained events: `[kind, id, param]`. */
  readonly events: Array<[number, number, number]> = [];

  /**
   * Starts a game on the campaign's start zone.
   *
   * @param db - The content.
   * @param stage - The host config's stage (the start zone's: a campaign run).
   */
  constructor(db: ContentDb = content(), stage = 't-s') {
    this.game = createGame(this.platform, { seed: 11, stage }, db, {
      scenes: 'game',
      save: this.save,
    });
    this.flow = this.game.scenes as SceneFlow;
    this.game.debug.godMode = true;
  }

  /** The top scene's id. */
  get top(): string | undefined {
    return this.flow.stack.top?.id;
  }

  /**
   * Runs ticks with a held mask.
   *
   * @param held - Actions held.
   * @param ticks - Ticks.
   */
  hold(held: ActionMask, ticks = 1): void {
    for (let t = 0; t < ticks; t++) {
      commitPlayerInput(this.platform.snapshot.players[0], held);
      this.game.step();
      this.game.events.drain((e) => {
        this.events.push([e.kind, e.id, e.param]);
      });
    }
  }

  /**
   * One press (a tick down, a tick up).
   *
   * @param action - The action.
   */
  press(action: ActionMask): void {
    this.hold(action);
    this.hold(0);
  }

  /**
   * Runs until a scene is on top (or a limit).
   *
   * @param id - Scene id.
   * @param limit - Tick limit.
   */
  until(id: string, limit = 2000): void {
    for (let i = 0; i < limit && this.top !== id; i++) this.hold(0);
    expect(this.top).toBe(id);
  }

  /**
   * The texts of the frame's UI list.
   *
   * @returns The strings of its text commands.
   */
  uiTexts(): string[] {
    const ui = this.game.renderFrame().ui;
    const out: string[] = [];
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] === DrawOp.Text) out.push(ui.strings[ui.ref[i]]);
    }
    return out;
  }

  /** The id of the stage the game World plays. */
  get stageId(): string | null {
    const stage = this.game.world.stage;
    return stage === null ? null : stage.stage.id;
  }
}

describe('core/scenes campaign run (M2-10)', () => {
  it('plays a campaign run from the start zone, with its title card', () => {
    const s = new Session();
    expect(s.flow.campaign?.id).toBe('test');
    expect(s.flow.run.campaign).toBe(s.flow.campaign);
    expect(s.flow.run.zone).toBe(0);
    expect(s.stageId).toBe('t-s');
    expect(s.game.world.rankInputs.stage).toBe(1);
    expect(s.uiTexts()).toEqual(['ZONE S', 'START ZONE']);
    s.hold(0, ZONE_CARD_TICKS);
    expect(s.uiTexts()).toEqual([]);
  });

  it('plays single stages when the host stage is not the start zone`s (no card, M1 clear)', () => {
    const s = new Session(content(), 't-u');
    expect(s.flow.campaign).toBeNull();
    expect(s.flow.run.campaign).toBeNull();
    expect(s.uiTexts()).toEqual([]);
    s.until('stageClear');
    expect(s.uiTexts()).toEqual(['STAGE CLEAR', 'SCORE', 'HI']);
  });

  it('tallies the zone, pays the bonuses and opens the map — the run is not recorded yet', () => {
    const s = new Session();
    s.until('stageClear');
    expect(s.game.world.status).toBe('stageClear');
    expect(s.game.world.players[0].state).toBe('leaving');
    const result = s.flow.run.result;
    // No enemies and no boss: 100 % and no time bonus.
    expect([result.killPercent, result.killBonus, result.bossSeconds, result.timeBonus]).toEqual([
      100,
      100 * KILL_BONUS_PER_PERCENT,
      -1,
      0,
    ]);
    expect(s.game.world.scoring.board.scores[0].score).toBe(10_000);
    expect(s.flow.run.carry.players[0].score).toBe(10_000);
    const texts = s.uiTexts();
    expect(texts).toEqual(
      expect.arrayContaining(['ZONE S CLEAR', 'START ZONE', 'KILLS', 'KILL BONUS', 'NO BOSS TIME']),
    );
    expect(s.save.hiScores('meter-normal')).toEqual([]);
    expect(s.save.data.stats.stagesCleared).toBe(1);
    expect(
      s.events.some((e) => e[0] === SimEventKind.Music && e[1] === MUSIC_CUES.StageClear),
    ).toBe(true);
    s.hold(0, ZONE_TALLY_TICKS);
    expect(s.top).toBe('map');
    expect(s.flow.stack.depth).toBe(1);
    expect(s.game.renderFrame().world).toBeNull();
  });

  it('navigates the map with Up / Down, launches with OK and plays the chosen zone', () => {
    const s = new Session();
    s.until('stageClear');
    s.press(Action.Confirm);
    expect(s.top).toBe('map');
    const map = s.flow.map;
    expect(map.focusedZone).toBe(1); // the upper exit first
    expect(s.uiTexts()).toEqual(
      expect.arrayContaining(['TEST MAP', 'ZONE', 'U', 'UPPER ZONE', 'HIGH.', 'ROAD.']),
    );
    s.hold(0, 3);
    s.press(Action.Down);
    expect(map.focusedZone).toBe(2);
    expect(s.uiTexts()).toContain('LOWER ZONE');
    s.press(Action.Down); // wraps
    expect(map.focusedZone).toBe(1);
    s.press(Action.Up);
    expect(map.focusedZone).toBe(2);
    const from = s.events.length;
    s.press(Action.Confirm);
    expect(map.launch).toBeGreaterThanOrEqual(0);
    const lower = s.game.content.stageIndex.get('t-l');
    expect(s.events.slice(from).filter((e) => e[0] === SimEventKind.PrepareStage)).toEqual([
      [SimEventKind.PrepareStage, lower, 0],
    ]);
    expect(s.uiTexts()).toContain('LAUNCH');
    s.hold(0, MAP_LAUNCH_TICKS);
    expect(s.top).toBe('game');
    expect(s.stageId).toBe('t-l');
    expect(s.flow.run.route).toEqual([0, 2]);
    expect(s.flow.run.depth).toBe(1);
    // The players carried in: the score of the start zone, the rank's stage term 2.
    expect(s.game.world.scoring.board.scores[0].score).toBe(10_000);
    expect(s.game.world.rankInputs.stage).toBe(2);
    expect(s.uiTexts()).toEqual(['ZONE L', 'LOWER ZONE']);
  });

  it('Back on the map asks "quit to title?"', () => {
    const s = new Session();
    s.until('map', 3000);
    s.hold(0, 3);
    s.press(Action.Back);
    expect(s.flow.stack.sceneAt(1)?.id).toBe('confirm');
    expect(s.uiTexts()).toContain('QUIT TO TITLE?');
    s.press(Action.Back); // NO
    expect(s.top).toBe('map');
  });

  it('RETRY STAGE starts the zone again from its entry state', () => {
    const s = new Session();
    s.until('map', 3000);
    s.hold(0, 3);
    s.press(Action.Confirm);
    s.until('game');
    const world = s.game.world;
    s.hold(0, 20);
    world.scoring.board.scores[0].score = 55_550;
    world.players[0].lives = 1;
    s.press(Action.Pause);
    expect(s.top).toBe('pause');
    s.press(Action.Down);
    s.press(Action.Down);
    s.press(Action.Confirm); // RETRY STAGE
    expect(s.top).toBe('game');
    expect(s.game.world).not.toBe(world);
    expect(s.stageId).toBe('t-u');
    expect(s.game.world.scoring.board.scores[0].score).toBe(10_000);
    expect(s.game.world.players[0].lives).toBe(3);
  });

  it('ends the run at the final zone with the ending the flags pick, and records it', () => {
    const s = new Session();
    s.until('map', 3000);
    s.hold(0, 3);
    s.press(Action.Down);
    s.press(Action.Confirm);
    s.until('game');
    s.until('stageClear');
    expect(s.flow.run.ending?.id).toBe('l-clean'); // no ship lost (god mode)
    expect(s.flow.run.endingFlags & RunFlag.NoDeath).toBe(RunFlag.NoDeath);
    expect(s.save.hiScores('meter-normal')).toHaveLength(1);
    expect(s.save.hiScores('meter-normal')[0]).toMatchObject({ score: 20_000, reached: 't-l' });
    expect(s.save.data.stats.stagesCleared).toBe(2);
    s.press(Action.Confirm);
    expect(s.top).toBe('ending');
    expect(s.uiTexts()).toEqual(
      expect.arrayContaining(['ENDING', 'LOWER CLEAN', 'ROUTE', 'S L', 'NO MISS', 'NO CONTINUE']),
    );
    s.press(Action.Confirm); // locked
    expect(s.top).toBe('ending');
    s.hold(0, ENDING_LOCK_TICKS);
    expect(s.uiTexts()).toContain('OK: TITLE');
    s.press(Action.Confirm);
    expect(s.top).toBe('title');
  });

  it('counts a lost ship against the run: the plain ending', () => {
    const s = new Session();
    s.game.debug.godMode = false;
    s.hold(0, 50);
    const world = s.game.world;
    playerHit(world.players[0], PlayerHitCause.Bullet, world.tick, world.debugFlags);
    s.until('stageClear', 3000);
    expect(s.flow.run.deaths).toBe(1);
    s.press(Action.Confirm);
    s.hold(0, 3);
    s.press(Action.Down);
    s.press(Action.Confirm);
    s.until('game');
    s.game.debug.godMode = true;
    s.until('stageClear');
    expect(s.flow.run.ending?.id).toBe('l');
  });

  it('starts a practice run at a zone and checkpoint: fresh, depth-ranked, no record, title after', () => {
    const s = new Session();
    expect(s.flow.startPractice('nowhere')).toBe(false);
    expect(s.flow.startPractice('l', 5)).toBe(false);
    expect(s.flow.startPractice('l', 1)).toBe(true);
    s.hold(0);
    expect(s.top).toBe('game');
    expect(s.flow.run.practice).toBe(true);
    expect(s.stageId).toBe('t-l');
    expect(s.game.world.camera.x).toBeGreaterThanOrEqual(100);
    expect(s.game.world.rankInputs.stage).toBe(2);
    expect(s.game.world.scoring.board.scores[0].score).toBe(0);
    s.until('stageClear');
    s.press(Action.Confirm);
    expect(s.top).toBe('title');
    expect(s.save.hiScores('meter-normal')).toEqual([]);
  });
});

describe('core/scenes hidden bonus stages (M2-10)', () => {
  it('flies into the bonus stage when its entrance opens; its clear skips the zone`s rest', () => {
    const s = new Session(content(true));
    const zone = s.game.world;
    for (let i = 0; i < 200 && zone.bonus.entered < 0; i++) s.hold(0);
    expect(zone.bonus.entered).toBe(0);
    expect(s.stageId).toBe('t-s');
    s.hold(0, BONUS_WARP_TICKS);
    expect(s.stageId).toBe('t-v');
    expect(s.game.world).not.toBe(zone);
    expect(s.flow.run.inBonus).toBe(true);
    expect(s.uiTexts()).toEqual(['BONUS STAGE', 'T-V']);
    s.until('stageClear');
    expect(s.uiTexts()).toContain('BONUS STAGE CLEAR');
    expect(s.flow.run.flags & RunFlag.Bonus).toBe(RunFlag.Bonus);
    s.press(Action.Confirm);
    expect(s.top).toBe('map');
    s.hold(0, 3);
    s.press(Action.Confirm);
    s.until('game');
    s.until('stageClear');
    expect(s.flow.run.ending?.id).toBe('u-bonus');
  });

  it('a death in the bonus stage sends the players back to the entrance, locked out', () => {
    const s = new Session(content(true));
    s.game.debug.godMode = false;
    for (let i = 0; i < 300 && s.stageId !== 't-v'; i++) s.hold(0);
    expect(s.stageId).toBe('t-v');
    for (let i = 0; i < 100 && s.game.world.players[0].state !== 'alive'; i++) s.hold(0);
    const bonus = s.game.world;
    playerHit(bonus.players[0], PlayerHitCause.Bullet, bonus.tick, bonus.debugFlags);
    s.hold(0);
    expect(bonus.players[0].state).toBe('dying');
    s.hold(0, BONUS_FAIL_TICKS + 2);
    expect(s.stageId).toBe('t-s');
    const back = s.game.world;
    expect(back.camera.x).toBeGreaterThanOrEqual(40);
    expect(back.bonus.locked).toBe(true);
    expect(back.players[0].lives).toBe(2);
    expect(back.players[0].state).toBe('respawning');
    expect(s.flow.run.inBonus).toBe(false);
    expect(s.flow.run.bonusLocked).toBe(true);
    s.hold(0, 200);
    expect(back.bonus.entered).toBe(-1);
    expect(s.flow.run.deaths).toBe(1);
  });
});
