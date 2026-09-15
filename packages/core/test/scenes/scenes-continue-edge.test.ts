/**
 * Edge cases of the M2-01 scene flow (difficulty menu, continue countdown) beyond
 * `scenes-continue.test.ts`, headless through `createGame(…, { scenes })`:
 *
 * - the countdown: the seconds 9 … 0 each shown for 60 ticks, one tick sound per change (nine),
 *   the timeout exactly at `CONTINUE_COUNTDOWN_TICKS`; OK accepted from the first tick after
 *   `CONTINUE_LOCK_TICKS`, never while still held from the game (a press is an edge); a resume
 *   from the platform does not pause over it; the score recorded after giving up carries the
 *   continue digit (the saved table at once, the session best once the game is left);
 * - the difficulty menu: Down wraps from ARCADE to EASY, the move / select sounds, the host config
 *   object reused for its own preset (and again after coming back to it), `setHiScore` raising only
 *   the chosen preset's session best;
 * - a content `rules` table: the session config and every preset the menu offers read it.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFFICULTY_TABLE, type GameConfig } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { SFX_CUES, SimEventKind } from '../../src/events/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { createSaveStore } from '../../src/save/index.js';
import { addScore } from '../../src/scoring/index.js';
import {
  CONTINUE_COUNTDOWN_TICKS,
  CONTINUE_LOCK_TICKS,
  GAME_OVER_DELAY_TICKS,
  GAME_OVER_LOCK_TICKS,
  type SceneFlow,
} from '../../src/scenes/index.js';

/** A headless session with the scene flow on the title. */
class Session {
  readonly platform: HeadlessPlatform = createHeadlessPlatform();
  readonly game: Game;
  readonly flow: SceneFlow;
  /** Drained events `[kind, id]`. */
  readonly events: Array<[number, number]> = [];

  /**
   * Creates the session.
   *
   * @param config - Config overrides.
   * @param content - The content (default: none).
   */
  constructor(config: Partial<GameConfig> = {}, content?: ContentDb) {
    this.game = createGame(this.platform, { seed: 8, stage: null, ...config }, content, {
      scenes: 'title',
      save: createSaveStore(null),
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
   * Runs ticks with a held mask, draining the events.
   *
   * @param held - Held actions.
   * @param ticks - Ticks.
   */
  hold(held: ActionMask, ticks = 1): void {
    for (let t = 0; t < ticks; t++) {
      commitPlayerInput(this.platform.snapshot.players[0], held);
      this.game.step();
      this.game.events.drain((e) => {
        this.events.push([e.kind, e.id]);
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

  /** PRESS OK, START: the difficulty menu, past its lock. */
  openDifficulty(): void {
    this.press(Action.Confirm);
    this.press(Action.Confirm);
    this.hold(0, 2);
    expect(this.ids).toEqual(['title', 'difficulty']);
  }

  /**
   * Starts a game from the title.
   *
   * @param downs - Down presses on the difficulty menu first.
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

  /**
   * Ends the running game and waits for its end screen.
   *
   * @param held - Held while waiting.
   */
  gameOver(held: ActionMask = 0): void {
    const world = this.game.world;
    world.status = 'gameOver';
    for (const ship of world.players) ship.lives = 0;
    this.hold(held, GAME_OVER_DELAY_TICKS);
  }

  /**
   * The SFX cues since an event index.
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

describe('core/scenes continue countdown edges (M2-01)', () => {
  it('shows every second for 60 ticks with one tick sound per change, then times out', () => {
    const s = new Session();
    s.start();
    s.gameOver();
    const screen = s.flow.continueScreen;
    expect(s.flow.stack.top).toBe(screen);
    const from = s.events.length;
    const shown: number[] = [screen.seconds];
    for (let t = 1; t < CONTINUE_COUNTDOWN_TICKS; t++) {
      s.hold(0);
      shown.push(screen.seconds);
    }
    expect(s.flow.stack.top).toBe(screen);
    for (let second = 9; second >= 0; second--) {
      expect(
        shown.filter((v) => v === second),
        `second ${second}`,
      ).toHaveLength(60);
    }
    expect(s.sounds(from).filter((c) => c === SFX_CUES.MenuMove)).toHaveLength(9);
    s.hold(0); // tick 600
    expect(s.ids).toEqual(['game', 'gameOver']);
  });

  it('accepts OK from the first tick after the lock', () => {
    const s = new Session();
    s.start();
    s.gameOver();
    const screen = s.flow.continueScreen;
    s.hold(0, CONTINUE_LOCK_TICKS - 1);
    s.hold(Action.Confirm); // the lock's last tick
    expect(screen.ticks).toBe(CONTINUE_LOCK_TICKS);
    expect(s.game.world.status).toBe('gameOver');
    s.hold(0);
    s.hold(Action.Confirm); // tick 32
    expect(s.ids).toEqual(['game']);
    expect(s.game.world.continuesUsed).toBe(1);
  });

  it('never continues on an OK held since the game (only a fresh press)', () => {
    const s = new Session();
    s.start();
    s.gameOver(Action.Confirm);
    expect(s.ids).toEqual(['game', 'continue']);
    s.hold(Action.Confirm, CONTINUE_LOCK_TICKS + 30);
    expect(s.ids).toEqual(['game', 'continue']);
    expect(s.game.world.continuesUsed).toBe(0);
    s.hold(0); // released …
    s.press(Action.Confirm); // … and pressed again
    expect(s.ids).toEqual(['game']);
  });

  it('keeps counting on a platform resume (no pause menu over it)', () => {
    const s = new Session();
    s.start();
    s.gameOver();
    s.platform.suspend();
    s.platform.resume();
    expect(s.ids).toEqual(['game', 'continue']);
    const before = s.flow.continueScreen.ticks;
    s.hold(0, 5);
    expect(s.flow.continueScreen.ticks).toBe(before + 5);
  });

  it('records the score with its continue digit when the player gives up later', () => {
    const s = new Session();
    s.start();
    addScore(s.game.world, 0, 5_000);
    s.gameOver();
    s.hold(0, CONTINUE_LOCK_TICKS);
    s.press(Action.Confirm);
    addScore(s.game.world, 0, 1_000); // 6,001
    s.gameOver();
    s.hold(0, CONTINUE_LOCK_TICKS);
    s.press(Action.Back);
    expect(s.ids).toEqual(['game', 'gameOver']);
    expect(s.flow.save.bestScore('meter-normal')).toBe(6_001);
    // After the name entry (M2-15) the session best has it too.
    s.hold(0, GAME_OVER_LOCK_TICKS);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['nameEntry']);
    expect(s.flow.hiScore).toBe(6_001);
  });
});

describe('core/scenes difficulty menu edges (M2-01)', () => {
  it('wraps Down from ARCADE to EASY with the move sound; OK plays the select sound', () => {
    const s = new Session({ difficulty: 'arcade' });
    s.openDifficulty();
    expect(s.flow.difficultyMenu.focused).toBe('arcade');
    let from = s.events.length;
    s.press(Action.Down);
    expect(s.flow.difficultyMenu.focused).toBe('easy');
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuMove]);
    from = s.events.length;
    s.press(Action.Confirm);
    expect(s.sounds(from)[0]).toBe(SFX_CUES.MenuSelect);
    s.press(Action.Confirm); // START in the weapon select (M2-03)
    expect(s.game.world.config.difficulty).toBe('easy');
  });

  it('reuses the host config for its own preset, even after another was chosen', () => {
    const s = new Session({ startingLives: 5 }); // Normal with an explicit override
    expect(s.flow.gameConfig).toBe(s.game.config);
    s.start(1); // HARD: the preset's 3 lives
    expect(s.game.world.config.startingLives).toBe(3);
    // Back to the title, then NORMAL again: the host config, override and all.
    s.press(Action.Pause);
    s.press(Action.Up);
    s.press(Action.Confirm);
    s.press(Action.Left);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title']);
    s.openDifficulty();
    s.press(Action.Up);
    s.press(Action.Confirm);
    s.press(Action.Confirm); // START in the weapon select (M2-03): the loadout it had
    expect(s.game.world.config).toBe(s.game.config);
    expect(s.game.world.config.startingLives).toBe(5);
  });

  it('raises only the chosen preset`s session best', () => {
    const s = new Session();
    s.flow.setHiScore(4_000);
    expect(s.flow.hiScore).toBe(4_000);
    s.start(1); // HARD: its own best, 0
    expect(s.flow.hiScore).toBe(0);
    expect(s.game.world.scoring.board.hiScore).toBe(0);
    s.flow.setHiScore(9_000);
    expect(s.flow.hiScore).toBe(9_000);
    s.flow.setHiScore(1_000); // lower: nothing
    expect(s.flow.hiScore).toBe(9_000);
  });
});

describe('core/scenes difficulty from a content rules table (M2-01)', () => {
  it('builds the session config and every menu preset from the content`s table', () => {
    const table = JSON.parse(JSON.stringify(DEFAULT_DIFFICULTY_TABLE)) as Record<
      string,
      Record<string, unknown>
    >;
    table.normal.continues = 1;
    table.hard.lives = 1;
    table.hard.rankBase = 5;
    const { db, issues } = loadContent([
      {
        path: 'rules/difficulty.rules.json',
        data: { formatVersion: 1, kind: 'rules', difficulty: table },
      },
    ]);
    expect(issues).toEqual([]);
    const s = new Session({}, db);
    expect(s.game.config.continues).toBe(1);
    s.start(1);
    expect(s.game.world.config).toMatchObject({
      difficulty: 'hard',
      startingLives: 1,
      rankBase: 5,
    });
    expect(s.game.world.rank).toBe(5);
  });
});
