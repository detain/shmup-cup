/**
 * M2-16 review round 1: a campaign run keeps the config it began with. Options changed from the
 * pause menu (the GAME page, the CONTROLS page's autofire) reach neither the World in play nor the
 * next zone or a bonus stage of the run — only a RETRY STAGE and the next game take them, and a
 * run never changes its difficulty (the GAME page's DIFFICULTY is disabled over the pause menu),
 * so its score is recorded in the table of the difficulty it was played on.
 */
import { describe, expect, it } from 'vitest';
import type { ContentDb } from '../../src/data/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import { createSaveStore, type SaveStore } from '../../src/save/index.js';
import {
  BONUS_WARP_TICKS,
  GameOptionsItem,
  OptionsItem,
  PauseItem,
  type SceneFlow,
} from '../../src/scenes/index.js';
import { campaignContent as content } from '../helpers/campaign.js';

/** A headless campaign session started in the game. */
class Session {
  readonly game: Game;
  readonly flow: SceneFlow;
  readonly platform = createHeadlessPlatform();
  readonly save: SaveStore = createSaveStore(null);

  /**
   * Starts a campaign run.
   *
   * @param db - The content.
   */
  constructor(db: ContentDb = content()) {
    this.game = createGame(this.platform, { seed: 11, stage: 't-s' }, db, {
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

  /** The id of the stage the game World plays. */
  get stageId(): string | null {
    const stage = this.game.world.stage;
    return stage === null ? null : stage.stage.id;
  }

  /**
   * Runs ticks with a held mask (events dropped).
   *
   * @param held - Actions held.
   * @param ticks - Ticks.
   */
  hold(held: ActionMask, ticks = 1): void {
    for (let t = 0; t < ticks; t++) {
      commitPlayerInput(this.platform.snapshot.players[0], held);
      this.game.step();
      this.game.events.clear();
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
  until(id: string, limit = 3000): void {
    for (let i = 0; i < limit && this.top !== id; i++) this.hold(0);
    expect(this.top).toBe(id);
  }

  /**
   * From the game: pause, OPTIONS, the GAME page; flips MAGNET off and closes back to the game.
   */
  magnetOffFromPause(): void {
    expect(this.top).toBe('game');
    this.press(Action.Pause);
    while (this.flow.pause.menu.focus !== PauseItem.Options) this.press(Action.Down);
    this.press(Action.Confirm);
    this.hold(0, 2);
    while (this.flow.options.menu.focus !== OptionsItem.Game) this.press(Action.Down);
    this.press(Action.Confirm);
    this.hold(0, 2);
    const page = this.flow.gameOptionsPage;
    expect(page.menu.enabled(GameOptionsItem.Difficulty)).toBe(false);
    while (page.menu.focus !== GameOptionsItem.Magnet) this.press(Action.Down);
    this.press(Action.Left); // OFF
    expect(page.magnet.value).toBe(false);
    this.press(Action.Back);
    this.hold(0, 2);
    this.press(Action.Back); // the Options screen
    expect(this.top).toBe('pause');
    this.hold(0, 2);
    this.press(Action.Pause); // resume
    expect(this.top).toBe('game');
  }

  /** From the game: pause, RETRY STAGE. */
  retry(): void {
    this.press(Action.Pause);
    while (this.flow.pause.menu.focus !== PauseItem.Retry) this.press(Action.Down);
    this.press(Action.Confirm);
    expect(this.top).toBe('game');
  }
}

describe('core/scenes run config (M2-16 review round 1)', () => {
  it('the next zone keeps the run’s config; a RETRY STAGE takes the options changed since', () => {
    const s = new Session();
    const first = s.game.world;
    const runConfig = s.flow.gameConfig;
    expect(first.config.pickupMagnet).toBe(true);
    s.magnetOffFromPause();
    // The next games' configs have it, the World in play does not.
    expect(s.save.options.game.pickupMagnet).toBe(false);
    expect(s.flow.gameConfig.pickupMagnet).toBe(false);
    expect(s.game.world).toBe(first);
    expect(first.config.pickupMagnet).toBe(true);
    s.until('stageClear');
    s.press(Action.Confirm);
    expect(s.top).toBe('map');
    s.hold(0, 3);
    s.press(Action.Confirm);
    s.until('game');
    expect(s.stageId).toBe('t-u');
    // The next zone of the same run: the run's config with the zone's stage.
    const next = s.game.world;
    expect(next).not.toBe(first);
    expect(next.config).toMatchObject({
      pickupMagnet: true,
      difficulty: runConfig.difficulty,
      startingLives: runConfig.startingLives,
      deathPenalty: runConfig.deathPenalty,
    });
    // RETRY STAGE takes the option (the zone's entry state still carries in).
    s.retry();
    expect(s.game.world).not.toBe(next);
    expect(s.stageId).toBe('t-u');
    expect(s.game.world.config).toMatchObject({
      pickupMagnet: false,
      difficulty: runConfig.difficulty,
    });
    expect(s.game.world.scoring.board.scores[0].score).toBe(10_000);
  });

  it('a bonus stage and the way back keep the run’s config', () => {
    const s = new Session(content(true));
    s.magnetOffFromPause();
    const zone = s.game.world;
    for (let i = 0; i < 200 && zone.bonus.entered < 0; i++) s.hold(0);
    expect(zone.bonus.entered).toBe(0);
    s.hold(0, BONUS_WARP_TICKS);
    expect(s.stageId).toBe('t-v');
    expect(s.flow.run.inBonus).toBe(true);
    expect(s.game.world.config.pickupMagnet).toBe(true);
    expect(s.flow.gameConfig.pickupMagnet).toBe(false);
  });

  it('a practice run keeps the config it started with too', () => {
    const s = new Session();
    expect(s.flow.startPractice('l')).toBe(true);
    s.hold(0);
    expect(s.top).toBe('game');
    expect(s.stageId).toBe('t-l');
    expect(s.flow.run.practice).toBe(true);
    const world = s.game.world;
    s.magnetOffFromPause();
    expect(s.game.world).toBe(world);
    expect(world.config.pickupMagnet).toBe(true);
    s.retry();
    expect(s.flow.run.practice).toBe(true);
    expect(s.game.world.config.pickupMagnet).toBe(false);
  });
});
