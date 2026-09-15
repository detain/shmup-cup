/**
 * The scene flow of plan M2-01, headless through `createGame(…, { scenes })`:
 *
 * - **the difficulty menu under START** — EASY / NORMAL / HARD / ARCADE over the title, focused on
 *   the host config's preset, with the focused preset's lives, continues and hi-score; Back returns
 *   to the title menu; OK starts the game on the chosen preset (its World gets that preset's
 *   config: rank base, lives, aim directions), which RETRY and the next START keep; each preset
 *   records into its own hi-score table;
 * - **the continue countdown** — a game over with continues left opens it instead of the game-over
 *   screen: 10 s counting 9 … 0 with a tick sound, OK (after the lock) continues at the checkpoint
 *   and the game runs on, Back or the timeout open the game-over screen; the last continue used, a
 *   game over goes straight to the game-over screen.
 */
import { describe, expect, it } from 'vitest';
import { MUSIC_CUES, SFX_CUES, SimEventKind } from '../../src/events/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import { createHiScoreEntry, createSaveStore, type SaveStore } from '../../src/save/index.js';
import {
  CONTINUE_COUNTDOWN_TICKS,
  CONTINUE_LOCK_TICKS,
  GAME_OVER_DELAY_TICKS,
  PauseItem,
  type SceneFlow,
} from '../../src/scenes/index.js';
import type { GameConfig } from '../../src/config/index.js';

/** A headless session with the scene flow. */
class Session {
  readonly platform: HeadlessPlatform = createHeadlessPlatform();
  readonly game: Game;
  readonly flow: SceneFlow;
  /** Drained events `[kind, id, param]`. */
  readonly events: Array<[number, number, number]> = [];

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
   * Runs ticks with a held mask and drains the events.
   *
   * @param held - Held actions.
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
   * Presses and releases an action.
   *
   * @param action - The action.
   */
  press(action: ActionMask): void {
    this.hold(action);
    this.hold(0);
  }

  /** PRESS OK, START: the difficulty menu opens (and its 2-tick lock runs out). */
  openDifficulty(): void {
    this.press(Action.Confirm);
    this.press(Action.Confirm);
    expect(this.ids).toEqual(['title', 'difficulty']);
    this.hold(0, 2);
  }

  /**
   * Starts a game on a preset from the title.
   *
   * @param downs - Down presses from the focused preset.
   */
  start(downs = 0): void {
    this.openDifficulty();
    for (let i = 0; i < downs; i++) this.press(Action.Down);
    this.press(Action.Confirm);
    // The weapon select (M2-03) opens focused on START: OK starts once its lock is over.
    expect(this.ids).toEqual(['title', 'difficulty', 'weaponSelect']);
    this.press(Action.Confirm);
    expect(this.ids).toEqual(['game']);
  }

  /** Ends the running game (every life lost) and waits for its end screen. */
  gameOver(): void {
    const world = this.game.world;
    world.status = 'gameOver';
    for (const ship of world.players) ship.lives = 0;
    this.hold(0, GAME_OVER_DELAY_TICKS);
  }

  /**
   * The texts of the frame's UI list.
   *
   * @returns Its text commands' strings.
   */
  uiTexts(): string[] {
    const ui = this.game.renderFrame().ui;
    const out: string[] = [];
    for (let i = 0; i < ui.count; i++)
      if (ui.op[i] === DrawOp.Text) out.push(ui.strings[ui.ref[i]]);
    return out;
  }

  /**
   * The numbers of the frame's UI list.
   *
   * @returns Their values.
   */
  uiNumbers(): number[] {
    const ui = this.game.renderFrame().ui;
    const out: number[] = [];
    for (let i = 0; i < ui.count; i++) if (ui.op[i] === DrawOp.Number) out.push(ui.value[i]);
    return out;
  }

  /**
   * The SFX cues since an index.
   *
   * @param from - First event index.
   * @returns Cue ids.
   */
  sounds(from = 0): number[] {
    return this.events
      .slice(from)
      .filter((e) => e[0] === SimEventKind.Sfx)
      .map((e) => e[1]);
  }
}

describe('core/scenes the difficulty menu (M2-01)', () => {
  it('opens under START over the title, focused on the config`s preset, with its lives', () => {
    const s = new Session();
    s.openDifficulty();
    expect(s.game.inputContext).toBe('menu');
    const texts = s.uiTexts();
    expect(texts).toContain('DIFFICULTY');
    expect(texts.slice(texts.indexOf('DIFFICULTY') + 1, texts.indexOf('DIFFICULTY') + 6)).toEqual([
      'EASY',
      '→',
      'NORMAL',
      'HARD',
      'ARCADE',
    ]);
    expect(s.flow.difficultyMenu.focused).toBe('normal');
    // Normal: 3 lives, 3 continues, HI 0.
    expect(s.uiNumbers().slice(-3)).toEqual([3, 3, 0]);
    s.press(Action.Up);
    expect(s.flow.difficultyMenu.focused).toBe('easy');
    expect(s.uiNumbers().slice(-3)).toEqual([5, 5, 0]);
    s.press(Action.Up); // wraps
    expect(s.flow.difficultyMenu.focused).toBe('arcade');
    expect(s.uiNumbers().slice(-3)).toEqual([2, 0, 0]);
    const hard = new Session({ difficulty: 'hard' });
    hard.openDifficulty();
    expect(hard.flow.difficultyMenu.focused).toBe('hard');
  });

  it('Back returns to the title menu with the back sound', () => {
    const s = new Session();
    s.openDifficulty();
    const from = s.events.length;
    s.press(Action.Back);
    expect(s.ids).toEqual(['title']);
    expect(s.flow.title.menuOpen).toBe(true);
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuBack]);
  });

  it('starts the game on the chosen preset; RETRY and the next START keep it', () => {
    const s = new Session();
    s.start(1); // HARD
    const world = s.game.world;
    expect(world.config).toMatchObject({ difficulty: 'hard', rankBase: 4, startingLives: 3 });
    expect(world.rank).toBe(4);
    expect(s.flow.difficulty).toBe('hard');
    expect(s.flow.gameConfig).toBe(world.config);
    expect(s.flow.modeKey).toBe('meter-hard');
    expect(s.game.config.difficulty).toBe('normal'); // the session's own config is unchanged
    // RETRY STAGE: the same preset.
    s.press(Action.Pause);
    s.press(Action.Down);
    s.press(Action.Down);
    expect(s.flow.pause.menu.focus).toBe(PauseItem.Retry);
    s.press(Action.Confirm);
    expect(s.game.world).not.toBe(world);
    expect(s.game.world.config.difficulty).toBe('hard');
    // Quit, then START: the menu remembers HARD; EASY aims 16 directions.
    s.press(Action.Pause);
    s.press(Action.Up);
    s.press(Action.Confirm);
    s.press(Action.Left);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title']);
    s.openDifficulty();
    expect(s.flow.difficultyMenu.focused).toBe('hard');
    s.press(Action.Up);
    s.press(Action.Up);
    s.press(Action.Confirm);
    s.press(Action.Confirm); // START in the weapon select (M2-03)
    expect(s.game.world.config).toMatchObject({
      difficulty: 'easy',
      aimDirections: 16,
      startingLives: 5,
    });
  });

  it('keeps a hi-score per preset: the menu and the title show the chosen one', () => {
    const save = createSaveStore(null);
    save.recordScore('meter-hard', createHiScoreEntry(7_000));
    save.recordScore('meter-normal', createHiScoreEntry(3_000));
    const s = new Session({ continues: 0 }, save);
    expect(s.flow.hiScore).toBe(3_000);
    s.openDifficulty();
    s.press(Action.Down);
    expect(s.uiNumbers().slice(-1)).toEqual([7_000]);
    s.press(Action.Confirm);
    s.press(Action.Confirm); // START in the weapon select (M2-03)
    expect(s.game.world.scoring.board.hiScore).toBe(7_000);
    expect(s.flow.hiScore).toBe(7_000);
    // A Hard game over: its score goes into the Hard table, with its difficulty.
    s.game.world.scoring.board.scores[0].score = 8_000;
    s.gameOver();
    s.hold(0, 2); // HARD's own continues (2): the countdown first
    expect(s.ids).toEqual(['game', 'continue']);
    s.hold(0, CONTINUE_LOCK_TICKS);
    s.press(Action.Back);
    expect(s.ids).toEqual(['game', 'gameOver']);
    expect(save.hiScores('meter-hard')[0]).toMatchObject({ score: 8_000, difficulty: 'hard' });
    expect(save.bestScore('meter-normal')).toBe(3_000);
  });
});

describe('core/scenes the continue countdown (M2-01)', () => {
  it('opens after a game over with continues left, counting down 9 … 0 with a tick sound', () => {
    const s = new Session();
    s.start();
    s.gameOver();
    expect(s.ids).toEqual(['game', 'continue']);
    expect(s.game.inputContext).toBe('menu');
    expect(s.flow.continueScreen.seconds).toBe(9);
    // The score and the continues left (the polish of M2-15 added the score).
    expect(s.uiTexts()).toEqual(['CONTINUE?', 'SCORE', 'CREDITS']);
    expect(s.uiNumbers()).toContain(3); // three continues left
    expect(s.events.some((e) => e[0] === SimEventKind.Music && e[1] === MUSIC_CUES.Silence)).toBe(
      true,
    );
    const from = s.events.length;
    s.hold(0, 60);
    expect(s.flow.continueScreen.seconds).toBe(8);
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuMove]);
  });

  it('OK continues at the checkpoint: fresh lives, the continue digit, the game runs on', () => {
    const s = new Session({ stage: null });
    s.start();
    const world = s.game.world;
    world.scoring.board.scores[0].score = 4_560;
    s.gameOver();
    s.hold(Action.Confirm); // inside the lock: ignored
    s.hold(0, CONTINUE_LOCK_TICKS);
    expect(s.ids).toEqual(['game', 'continue']);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['game']);
    expect(s.game.world).toBe(world); // the same game goes on
    expect(world.status).toBe('playing');
    expect(world.players[0].lives).toBe(3);
    expect(world.continuesUsed).toBe(1);
    expect(world.scoring.board.scores[0].score).toBe(4_561);
    const tick = world.tick;
    s.hold(0, 10);
    expect(world.tick).toBe(tick + 10);
    // The next game over offers the countdown again, with one continue fewer.
    s.gameOver();
    expect(s.ids).toEqual(['game', 'continue']);
    expect(s.uiNumbers()).toContain(2);
  });

  it('Back or the timeout gives up: the game-over screen records the run', () => {
    const s = new Session();
    s.start();
    s.game.world.scoring.board.scores[0].score = 900;
    s.gameOver();
    s.hold(0, CONTINUE_COUNTDOWN_TICKS - 1);
    expect(s.ids).toEqual(['game', 'continue']);
    s.hold(0);
    expect(s.ids).toEqual(['game', 'gameOver']);
    expect(s.flow.save.bestScore('meter-normal')).toBe(900);
    const back = new Session();
    back.start();
    back.gameOver();
    back.hold(Action.Back); // inside the lock: ignored
    expect(back.ids).toEqual(['game', 'continue']);
    back.hold(0, CONTINUE_LOCK_TICKS);
    const from = back.events.length;
    back.press(Action.Back);
    expect(back.ids).toEqual(['game', 'gameOver']);
    expect(back.sounds(from)[0]).toBe(SFX_CUES.MenuBack);
  });

  it('goes straight to the game-over screen when no continue is left', () => {
    const arcade = new Session({ difficulty: 'arcade' }); // Arcade: no continues
    arcade.start();
    arcade.gameOver();
    expect(arcade.ids).toEqual(['game', 'gameOver']);
    const s = new Session({ continues: 1, stage: null });
    s.start();
    s.gameOver();
    s.hold(0, CONTINUE_LOCK_TICKS);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['game']);
    s.gameOver();
    expect(s.ids).toEqual(['game', 'gameOver']);
  });
});
