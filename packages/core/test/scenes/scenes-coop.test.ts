/**
 * Two-player co-op in the scene flow (plan M2-06), headless through `createGame(…, { scenes })`:
 * `2 PLAYERS` on the title makes the next games co-op ones (`GameConfig.coop`, `1 PLAYER` switches
 * back); `Game.inputSeats` is 2 only while a co-op game (or its continue countdown) is on top;
 * player 2's START joins instead of pausing (player 1's START still pauses, and so does player 2's
 * once it plays); the continue countdown continues only the players who press OK and shows both
 * players' credits; the end screens show both scores; a co-op game's scores go into the tables
 * with the mode `2p`.
 */
import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../../src/config/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { PLAYER_DEAD_TICKS } from '../../src/player/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import { createSaveStore, type SaveStore } from '../../src/save/index.js';
import {
  CONTINUE_LOCK_TICKS,
  GAME_OVER_DELAY_TICKS,
  GAME_OVER_LOCK_TICKS,
  STAGE_CLEAR_DELAY_TICKS,
  TitleItem,
  type SceneFlow,
} from '../../src/scenes/index.js';

/** A headless session with the scene flow and two controllers. */
class Session {
  readonly platform: HeadlessPlatform = createHeadlessPlatform();
  readonly game: Game;
  readonly flow: SceneFlow;

  /**
   * Creates the session on the title.
   *
   * @param config - Config overrides.
   * @param save - The save (default: memory only).
   */
  constructor(config: Partial<GameConfig> = {}, save: SaveStore | null = null) {
    this.game = createGame(this.platform, { seed: 4, ...config }, undefined, {
      scenes: 'title',
      save,
    });
    this.flow = this.game.scenes!;
  }

  /** Scene ids, bottom to top. */
  get ids(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.flow.stack.depth; i++) out.push(this.flow.stack.sceneAt(i)!.id);
    return out;
  }

  /**
   * Runs ticks with held masks (player 1, player 2).
   *
   * @param held1 - Player 1's held actions.
   * @param held2 - Player 2's held actions.
   * @param ticks - Ticks.
   */
  hold(held1: ActionMask, held2 = 0, ticks = 1): void {
    for (let t = 0; t < ticks; t++) {
      commitPlayerInput(this.platform.snapshot.players[0], held1);
      commitPlayerInput(this.platform.snapshot.players[1], held2);
      this.game.step();
      this.game.events.clear();
    }
  }

  /**
   * Presses and releases an action on one controller.
   *
   * @param action - The action.
   * @param player - 0 or 1.
   */
  press(action: ActionMask, player = 0): void {
    if (player === 0) this.hold(action);
    else this.hold(0, action);
    this.hold(0);
  }

  /**
   * Starts a game from the title: PRESS OK, the players' item, NORMAL, the weapon select's START.
   *
   * @param coop - `2 PLAYERS`.
   */
  start(coop: boolean): void {
    this.press(Action.Confirm);
    if (coop) this.press(Action.Down);
    expect(this.flow.title.menu.focus).toBe(coop ? TitleItem.TwoPlayers : TitleItem.Start);
    this.press(Action.Confirm);
    expect(this.ids).toEqual(['title', 'difficulty']);
    this.hold(0, 0, 2);
    this.press(Action.Confirm);
    expect(this.ids).toEqual(['title', 'difficulty', 'weaponSelect']);
    this.press(Action.Confirm);
    expect(this.ids).toEqual(['game']);
  }

  /** The texts of the frame's UI list. */
  uiTexts(): string[] {
    const ui = this.game.renderFrame().ui;
    const out: string[] = [];
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] === DrawOp.Text) out.push(ui.strings[ui.ref[i]] ?? '');
    }
    return out;
  }

  /** The numbers of the frame's UI list. */
  uiNumbers(): number[] {
    const ui = this.game.renderFrame().ui;
    const out: number[] = [];
    for (let i = 0; i < ui.count; i++) if (ui.op[i] === DrawOp.Number) out.push(ui.value[i]);
    return out;
  }
}

/**
 * Knocks both ships of the running game out (every life lost, dead time over).
 *
 * @param s - The session.
 */
function bothOut(s: Session): void {
  for (const ship of s.game.world.players) {
    if (!ship.active) continue;
    ship.state = 'dead';
    ship.stateTicks = PLAYER_DEAD_TICKS + 5;
    ship.lives = 0;
  }
  s.hold(0, 0, GAME_OVER_DELAY_TICKS + 1);
}

describe('core/scenes co-op: 2 PLAYERS and the input seats (M2-06)', () => {
  it('starts a co-op game from 2 PLAYERS and a one-player one from 1 PLAYER', () => {
    const s = new Session();
    expect(s.flow.coop).toBe(false);
    s.start(true);
    expect(s.flow.coop).toBe(true);
    expect(s.game.world.config.coop).toBe(true);
    expect(s.flow.gameConfig.coop).toBe(true);
    expect(s.game.inputSeats).toBe(2);
    s.press(Action.Pause);
    expect(s.ids).toEqual(['game', 'pause']);
    expect(s.game.inputSeats).toBe(1); // menus: every controller drives player 1
    s.flow.stack.reset(s.flow.title);
    s.hold(0);
    expect(s.game.inputSeats).toBe(1);
    s.start(false);
    expect(s.game.world.config.coop).toBe(false);
    expect(s.game.inputSeats).toBe(1);
  });

  it('is one seat in bare gameplay unless the session config is a co-op one', () => {
    expect(createGame(createHeadlessPlatform()).inputSeats).toBe(1);
    expect(createGame(createHeadlessPlatform(), { coop: true }).inputSeats).toBe(2);
  });

  it('joins player 2 on its START without pausing; player 1`s START pauses', () => {
    const s = new Session();
    s.start(true);
    s.hold(0, 0, 10);
    s.press(Action.Pause, 1);
    expect(s.ids).toEqual(['game']);
    expect(s.game.world.players[1].active).toBe(true);
    s.press(Action.Pause, 0);
    expect(s.ids).toEqual(['game', 'pause']);
    s.press(Action.Pause, 0); // resume
    expect(s.ids).toEqual(['game']);
    s.press(Action.Pause, 1); // player 2 plays now: its START pauses
    expect(s.ids).toEqual(['game', 'pause']);
  });

  it('pauses on player 2`s START in a one-player game', () => {
    const s = new Session();
    s.start(false);
    s.hold(0, 0, 10);
    s.press(Action.Pause, 1);
    expect(s.ids).toEqual(['game', 'pause']);
    expect(s.game.world.players[1].active).toBe(false);
  });
});

describe('core/scenes co-op: continues and end screens (M2-06)', () => {
  it('continues only the player who presses OK, and shows both players` credits', () => {
    const s = new Session();
    s.start(true);
    s.hold(0, 0, 10);
    s.press(Action.Pause, 1);
    s.hold(0, 0, 60);
    bothOut(s);
    expect(s.ids).toEqual(['game', 'continue']);
    expect(s.game.inputSeats).toBe(2); // the countdown's OK is per player
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['CONTINUE?', '1P', '2P']));
    expect(s.uiNumbers().slice(-2)).toEqual([3, 3]); // each player's own continues
    s.hold(0, 0, CONTINUE_LOCK_TICKS);
    s.press(Action.Confirm, 1);
    expect(s.ids).toEqual(['game']);
    const [p1, p2] = s.game.world.players;
    expect([p1.lives, p2.lives]).toEqual([0, 3]);
    expect(s.game.world.scoring.board.scores.map((b) => b.continues)).toEqual([0, 1]);
    // Player 1 drops back in with its START while player 2 plays.
    s.hold(0, 0, 5);
    s.press(Action.Pause, 0);
    expect(s.ids).toEqual(['game']);
    expect(p1.lives).toBe(3);
  });

  it('shows both scores on the game-over screen and records both with the mode 2p', () => {
    const save = createSaveStore(null);
    const s = new Session({ continues: 0 }, save);
    s.start(true);
    s.hold(0, 0, 10);
    s.press(Action.Pause, 1);
    s.game.world.scoring.board.scores[0].score = 1_200;
    s.game.world.scoring.board.scores[1].score = 3_400;
    bothOut(s);
    expect(s.ids).toEqual(['game', 'gameOver']);
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['GAME OVER', '1P', '2P']));
    expect(s.uiNumbers()).toEqual(expect.arrayContaining([1_200, 3_400]));
    const rows = save.data.hiScores[s.flow.modeKey] ?? [];
    expect(rows.filter((r) => r.mode === '2p').map((r) => r.score)).toEqual([3_400, 1_200]);
    s.hold(0, 0, GAME_OVER_LOCK_TICKS + 1);
  });

  it('shows both scores in the stage-clear tally', () => {
    const s = new Session();
    s.start(true);
    s.hold(0, 0, 10);
    s.press(Action.Pause, 1);
    s.game.world.scoring.board.scores[1].score = 5_600;
    s.game.world.status = 'stageClear';
    s.hold(0, 0, STAGE_CLEAR_DELAY_TICKS);
    expect(s.ids).toEqual(['game', 'stageClear']);
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['STAGE CLEAR', '1P', '2P', 'HI']));
    expect(s.uiNumbers()).toContain(5_600);
  });
});
