/**
 * A headless session of the scene flow for the M2-15 front-end edge suites
 * (`scenes-attract-edge`, `scenes-front-end-edge`): `createGame(…, { scenes: 'title' })` on the
 * front-end test content (`./front-end.ts`), with helpers to hold and press actions (for either
 * player), start a game, end it on the game-over screen, and read the frame's UI list and the
 * drained events.
 */
import { expect } from 'vitest';
import type { GameConfig } from '../../src/config/index.js';
import type { ContentDb } from '../../src/data/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import { createSaveStore, type SaveStore } from '../../src/save/index.js';
import {
  GAME_OVER_DELAY_TICKS,
  GAME_OVER_LOCK_TICKS,
  type SceneFlow,
  type SoundTestSetup,
} from '../../src/scenes/index.js';
import { addScore } from '../../src/scoring/index.js';

/** One drained event: kind, id, param, x. */
export type DrainedEvent = [kind: number, id: number, param: number, x: number];

/** Options of {@link FrontEndSession}. */
export interface FrontEndSessionOptions {
  /** The content. */
  readonly db: ContentDb;
  /** The save (default: a memory-only store). */
  readonly save?: SaveStore;
  /** Config overrides (default: seed 9, stage `t-s`, no continues). */
  readonly config?: Partial<GameConfig>;
  /** Give the platform an exit (the TV): the title gains EXIT and Back asks to quit. */
  readonly canExit?: boolean;
  /** The host's music titles for the sound test. */
  readonly soundTest?: SoundTestSetup | null;
}

/** A headless session of the scene flow, started on the title. */
export class FrontEndSession {
  readonly platform: HeadlessPlatform & { exit: (() => void) | null };
  readonly game: Game;
  readonly flow: SceneFlow;
  readonly save: SaveStore;
  /** Drained events. */
  readonly events: DrainedEvent[] = [];
  /** Calls of the platform's exit. */
  exits = 0;

  /**
   * Starts on the title.
   *
   * @param options - Content, save, config, exit, sound test.
   */
  constructor(options: FrontEndSessionOptions) {
    const base = createHeadlessPlatform();
    this.platform = Object.assign(base, {
      exit:
        options.canExit === true
          ? () => {
              this.exits++;
            }
          : null,
    });
    this.save = options.save ?? createSaveStore(null);
    this.game = createGame(
      this.platform,
      { seed: 9, stage: 't-s', continues: 0, ...options.config },
      options.db,
      { scenes: 'title', save: this.save, soundTest: options.soundTest ?? null },
    );
    this.flow = this.game.scenes!;
  }

  /** The top scene's id. */
  get top(): string | undefined {
    return this.flow.stack.top?.id;
  }

  /** The scene ids, bottom to top. */
  get ids(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.flow.stack.depth; i++) out.push(this.flow.stack.sceneAt(i)!.id);
    return out;
  }

  /**
   * Runs ticks with a held mask (the frame composed after each), draining the events.
   *
   * @param held - Actions held.
   * @param ticks - Ticks.
   * @param player - The player slot holding them (the other holds nothing).
   */
  hold(held: ActionMask, ticks = 1, player = 0): void {
    const players = this.platform.snapshot.players;
    for (let t = 0; t < ticks; t++) {
      for (let p = 0; p < players.length; p++)
        commitPlayerInput(players[p], p === player ? held : 0);
      this.game.step();
      this.game.renderFrame();
      this.game.events.drain((e) => {
        this.events.push([e.kind, e.id, e.param, e.x]);
      });
    }
  }

  /**
   * A press: a tick down, a tick up.
   *
   * @param action - The action.
   * @param player - The player slot pressing it.
   */
  press(action: ActionMask, player = 0): void {
    this.hold(action, 1, player);
    this.hold(0);
  }

  /**
   * Presses a sequence after a 2-tick pause (for a menu that just opened).
   *
   * @param actions - The actions.
   */
  presses(actions: readonly ActionMask[]): void {
    this.hold(0, 2);
    for (const action of actions) this.press(action);
  }

  /**
   * Starts a game from the title: 1 PLAYER (or 2 PLAYERS), NORMAL, the weapon select's START.
   *
   * @param coop - 2 PLAYERS.
   */
  start(coop = false): void {
    this.press(Action.Confirm); // PRESS OK
    this.presses(coop ? [Action.Down, Action.Confirm] : [Action.Confirm]);
    this.presses([Action.Confirm]); // NORMAL
    this.presses([Action.Confirm]); // START (one ship: no ship select)
    this.hold(0);
    expect(this.top).toBe('game');
  }

  /**
   * Ends the game on its game-over screen with player 1's score and leaves it (OK).
   *
   * @param score - Player 1's score.
   */
  gameOver(score: number): void {
    addScore(this.game.world, 0, score);
    this.game.world.status = 'gameOver';
    this.hold(0, GAME_OVER_DELAY_TICKS + GAME_OVER_LOCK_TICKS + 1);
    expect(this.top).toBe('gameOver');
    this.press(Action.Confirm);
  }

  /**
   * The texts of the frame's UI list.
   *
   * @returns The strings of its text commands, in draw order.
   */
  uiTexts(): string[] {
    return this.uiTextColors().map((entry) => entry[0]);
  }

  /**
   * The texts of the frame's UI list with their colours.
   *
   * @returns `[text, colour]` pairs in draw order.
   */
  uiTextColors(): Array<[string, number]> {
    const ui = this.game.renderFrame().ui;
    const out: Array<[string, number]> = [];
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] === DrawOp.Text) out.push([ui.strings[ui.ref[i]], ui.color[i]]);
    }
    return out;
  }

  /**
   * Counts the frame's UI commands of an op.
   *
   * @param op - A `DrawOp`.
   * @returns The count.
   */
  uiCount(op: number): number {
    const ui = this.game.renderFrame().ui;
    let n = 0;
    for (let i = 0; i < ui.count; i++) if (ui.op[i] === op) n++;
    return n;
  }

  /**
   * Events of a kind drained from an index on.
   *
   * @param kind - A `SimEventKind`.
   * @param from - First event index.
   * @returns `[id, param]` pairs.
   */
  of(kind: number, from = 0): Array<[number, number]> {
    return this.events.slice(from).flatMap((e) => (e[0] === kind ? [[e[1], e[2]]] : []));
  }
}
