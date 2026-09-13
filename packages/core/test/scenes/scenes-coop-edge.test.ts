/**
 * Edge cases of two-player co-op in the scene flow (plan M2-06), headless through
 * `createGame(…, { scenes })`: a joinable player 2's Back still pauses (only START / OK join) and
 * its OK joins without pausing; the continue countdown of a one-player game takes any
 * controller's OK, of a co-op game both OKs on one tick, never the OK of a player without
 * continues or of a player 2 who never joined (whose game shows the one-player panels and records
 * one `2p` row); `2 PLAYERS` then Back and `1 PLAYER` plays one player; RETRY STAGE keeps the
 * co-op game (player 2 has to join again); one input seat on every end screen.
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
  PauseItem,
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
    this.press(Action.Confirm);
    this.hold(0, 0, 2);
    this.press(Action.Confirm);
    this.press(Action.Confirm);
    expect(this.ids).toEqual(['game']);
  }

  /** Player 2 presses START in the running game and the fly-in plays. */
  joinP2(): void {
    this.hold(0, 0, 10);
    this.press(Action.Pause, 1);
    expect(this.game.world.players[1].active).toBe(true);
    this.hold(0, 0, 60);
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
}

/**
 * Knocks every active ship of the running game out and runs to the game-over check.
 *
 * @param s - The session.
 */
function allOut(s: Session): void {
  for (const ship of s.game.world.players) {
    if (!ship.active) continue;
    ship.state = 'dead';
    ship.stateTicks = PLAYER_DEAD_TICKS + 5;
    ship.lives = 0;
  }
  s.hold(0, 0, GAME_OVER_DELAY_TICKS + 1);
}

describe('core/scenes co-op edge: pausing and joining (M2-06)', () => {
  it('pauses on a joinable player 2`s Back (only START / OK join)', () => {
    const s = new Session();
    s.start(true);
    s.hold(0, 0, 10);
    s.press(Action.Back, 1);
    expect(s.ids).toEqual(['game', 'pause']);
    expect(s.game.world.players[1].active).toBe(false);
  });

  it('joins on player 2`s OK without pausing', () => {
    const s = new Session();
    s.start(true);
    s.hold(0, 0, 10);
    s.press(Action.Confirm, 1);
    expect(s.ids).toEqual(['game']);
    expect(s.game.world.players[1].active).toBe(true);
  });

  it('starts a one-player game after 2 PLAYERS, Back and 1 PLAYER', () => {
    const s = new Session();
    s.press(Action.Confirm);
    s.press(Action.Down);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title', 'difficulty']);
    expect(s.flow.coop).toBe(true);
    s.hold(0, 0, 2);
    s.press(Action.Back);
    expect(s.ids).toEqual(['title']);
    s.press(Action.Up);
    expect(s.flow.title.menu.focus).toBe(TitleItem.Start);
    s.press(Action.Confirm);
    expect(s.flow.coop).toBe(false);
    s.hold(0, 0, 2);
    s.press(Action.Confirm);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['game']);
    expect(s.game.world.config.coop).toBe(false);
    expect(s.game.inputSeats).toBe(1);
  });

  it('keeps the co-op game through RETRY STAGE (player 2 joins again)', () => {
    const s = new Session();
    s.start(true);
    s.joinP2();
    const old = s.game.world;
    s.press(Action.Pause);
    s.hold(0, 0, 2);
    s.press(Action.Down);
    s.press(Action.Down);
    expect(s.flow.pause.menu.focus).toBe(PauseItem.Retry);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['game']);
    expect(s.game.world).not.toBe(old);
    expect(s.game.world.config.coop).toBe(true);
    expect(s.game.world.players[1].active).toBe(false);
    expect(s.game.inputSeats).toBe(2);
    s.joinP2();
  });
});

describe('core/scenes co-op edge: the continue countdown (M2-06)', () => {
  it('continues a one-player game on player 2`s controller too', () => {
    const s = new Session();
    s.start(false);
    s.hold(0, 0, 10);
    allOut(s);
    expect(s.ids).toEqual(['game', 'continue']);
    expect(s.game.inputSeats).toBe(1);
    s.hold(0, 0, CONTINUE_LOCK_TICKS);
    s.press(Action.Confirm, 1);
    expect(s.ids).toEqual(['game']);
    expect(s.game.world.players[0].lives).toBe(s.game.world.config.startingLives);
    expect(s.game.world.players[1].active).toBe(false);
  });

  it('continues both players pressing OK on the same tick', () => {
    const s = new Session();
    s.start(true);
    s.joinP2();
    allOut(s);
    expect(s.ids).toEqual(['game', 'continue']);
    s.hold(0, 0, CONTINUE_LOCK_TICKS);
    s.hold(Action.Confirm, Action.Confirm);
    expect(s.ids).toEqual(['game']);
    const w = s.game.world;
    expect(w.players.map((p) => p.lives)).toEqual([3, 3]);
    expect(w.scoring.board.scores.map((b) => b.continues)).toEqual([1, 1]);
    expect(w.continuesUsed).toBe(1); // one continue event
  });

  it('ignores the OK of a player without continues; the other`s OK continues', () => {
    const s = new Session();
    s.start(true);
    s.joinP2();
    s.game.world.scoring.board.scores[1].continues = s.game.world.config.continues;
    allOut(s);
    expect(s.ids).toEqual(['game', 'continue']);
    s.hold(0, 0, CONTINUE_LOCK_TICKS);
    s.press(Action.Confirm, 1);
    expect(s.ids).toEqual(['game', 'continue']);
    s.press(Action.Confirm, 0);
    expect(s.ids).toEqual(['game']);
    expect(s.game.world.players.map((p) => p.lives)).toEqual([3, 0]);
  });

  it('shows one player`s credits and ignores player 2`s OK when it never joined', () => {
    const s = new Session();
    s.start(true);
    s.hold(0, 0, 10);
    allOut(s);
    expect(s.ids).toEqual(['game', 'continue']);
    expect(s.game.inputSeats).toBe(2);
    const texts = s.uiTexts();
    expect(texts).toContain('CREDITS');
    expect(texts).not.toContain('2P');
    s.hold(0, 0, CONTINUE_LOCK_TICKS);
    s.press(Action.Confirm, 1);
    expect(s.ids).toEqual(['game', 'continue']);
    s.press(Action.Confirm, 0);
    expect(s.ids).toEqual(['game']);
    expect(s.game.world.players[1].active).toBe(false);
  });
});

describe('core/scenes co-op edge: end screens and scores (M2-06)', () => {
  it('shows one score and records one 2p row when player 2 never joined', () => {
    const save = createSaveStore(null);
    const s = new Session({ continues: 0 }, save);
    s.start(true);
    s.hold(0, 0, 10);
    s.game.world.scoring.board.scores[0].score = 4_200;
    allOut(s);
    expect(s.ids).toEqual(['game', 'gameOver']);
    expect(s.game.inputSeats).toBe(1);
    const texts = s.uiTexts();
    expect(texts).toEqual(expect.arrayContaining(['GAME OVER', 'SCORE']));
    expect(texts).not.toContain('2P');
    const rows = save.data.hiScores[s.flow.modeKey] ?? [];
    expect(rows.map((r) => [r.score, r.mode])).toEqual([[4_200, '2p']]);
    s.hold(0, 0, GAME_OVER_LOCK_TICKS + 1);
  });

  it('records a one-player game with the mode 1p', () => {
    const save = createSaveStore(null);
    const s = new Session({ continues: 0 }, save);
    s.start(false);
    s.hold(0, 0, 10);
    s.game.world.scoring.board.scores[0].score = 900;
    allOut(s);
    const rows = save.data.hiScores[s.flow.modeKey] ?? [];
    expect(rows.map((r) => [r.score, r.mode])).toEqual([[900, '1p']]);
  });

  it('routes one seat on the stage-clear tally and shows one score without player 2', () => {
    const s = new Session();
    s.start(true);
    s.hold(0, 0, 10);
    s.game.world.status = 'stageClear';
    s.hold(0, 0, STAGE_CLEAR_DELAY_TICKS);
    expect(s.ids).toEqual(['game', 'stageClear']);
    expect(s.game.inputSeats).toBe(1);
    const texts = s.uiTexts();
    expect(texts).toEqual(expect.arrayContaining(['STAGE CLEAR', 'SCORE', 'HI']));
    expect(texts).not.toContain('2P');
  });
});
