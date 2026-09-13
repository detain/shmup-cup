/**
 * Edge cases of the ship select (plan M2-05, shmup_feat.md §5, §17) beyond `scenes-ship-select`:
 * the focus wrapping both ways, the opening lock (an early OK does nothing), the menu sounds, an
 * unknown host ship focusing the first one, the choice composing with the weapon select's loadout
 * (a MANTA keeps it, the KESTREL flies it again later) and re-armed for every difficulty, the saved
 * hi-scores of each power-up model (the difficulty menu, the game's HI and a finished game's row
 * all use the chosen ship's table), a content without ships (the built-in ship, no ship select) and
 * the UI string budget of the screen.
 */
import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB, type ContentDb } from '../../src/data/index.js';
import { SFX_CUES, SimEventKind } from '../../src/events/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import { menuStringSlots } from '../../src/ui/index.js';
import { createHiScoreEntry, createSaveStore, type SaveStore } from '../../src/save/index.js';
import { GAME_OVER_DELAY_TICKS, type SceneFlow } from '../../src/scenes/index.js';
import { directDb } from '../helpers/direct.js';

/** The shared content: the KESTREL and the MANTA. */
const DB = directDb();

/** A headless session with the scene flow on the title. */
class Session {
  readonly platform: HeadlessPlatform = createHeadlessPlatform();
  readonly game: Game;
  readonly flow: SceneFlow;
  /** SFX cues heard, in order. */
  readonly sounds: number[] = [];

  /**
   * Creates the session.
   *
   * @param config - Config overrides (the still stage by default).
   * @param content - The content.
   * @param save - The save (default: an empty in-memory one).
   */
  constructor(
    config: Partial<GameConfig> = {},
    content: ContentDb = DB,
    save: SaveStore | null = null,
  ) {
    this.game = createGame(this.platform, { seed: 3, stage: 'still', ...config }, content, {
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
   * Runs ticks with a held mask (the cues heard are kept).
   *
   * @param held - Held actions.
   * @param ticks - Ticks.
   */
  hold(held: ActionMask, ticks = 1): void {
    for (let t = 0; t < ticks; t++) {
      commitPlayerInput(this.platform.snapshot.players[0], held);
      this.game.step();
      this.game.renderFrame();
      this.game.events.drain((e) => {
        if (e.kind === SimEventKind.Sfx) this.sounds.push(e.id);
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

  /** PRESS OK, START, NORMAL: the difficulty menu's OK (the ship select opens, still locked). */
  toShips(): void {
    this.press(Action.Confirm);
    this.press(Action.Confirm);
    this.hold(0, 2);
    this.hold(Action.Confirm);
    expect(this.ids).toEqual(['title', 'difficulty', 'shipSelect']);
  }

  /** {@link Session.toShips}, then its lock run out. */
  openShips(): void {
    this.toShips();
    this.hold(0, 3);
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
}

describe('core/scenes the ship select — edges', () => {
  it('wraps the focus both ways', () => {
    const s = new Session();
    s.openShips();
    const select = s.flow.shipSelect;
    s.press(Action.Up);
    expect(select.focused.id).toBe('manta');
    s.press(Action.Down);
    expect(select.focused.id).toBe('kestrel');
  });

  it('ignores an OK held over from the difficulty menu (the opening lock)', () => {
    const s = new Session();
    s.toShips();
    s.hold(Action.Confirm, 1); // still held on the tick it opened
    expect(s.ids).toEqual(['title', 'difficulty', 'shipSelect']);
    s.hold(0, 3);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title', 'difficulty', 'shipSelect', 'weaponSelect']);
  });

  it('sounds the move, the choice and Back', () => {
    const s = new Session();
    s.openShips();
    s.sounds.length = 0;
    s.press(Action.Down);
    expect(s.sounds).toEqual([SFX_CUES.MenuMove]);
    s.sounds.length = 0;
    s.press(Action.Back);
    expect(s.sounds).toEqual([SFX_CUES.MenuBack]);
    expect(s.ids).toEqual(['title', 'difficulty']);
    s.hold(0, 3);
    s.press(Action.Confirm);
    s.hold(0, 3);
    s.sounds.length = 0;
    s.press(Action.Confirm);
    expect(s.sounds[0]).toBe(SFX_CUES.MenuSelect);
  });

  it('focuses the first ship when the host`s ship is not in the content', () => {
    const s = new Session({ shipId: 'no-such-ship' });
    s.openShips();
    expect(s.flow.shipSelect.focused.id).toBe('kestrel');
  });

  it('keeps the weapon select`s loadout under a ship change, for every difficulty', () => {
    const s = new Session();
    s.openShips();
    s.press(Action.Confirm); // KESTREL → the weapon select
    s.hold(0, 3);
    for (let i = 0; i < 5; i++) s.press(Action.Up); // START → OPTION
    s.press(Action.Right); // SNAKE
    for (let i = 0; i < 5; i++) s.press(Action.Down); // → START
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['game']);
    expect(s.flow.world.config).toMatchObject({ optionChoice: 'snake', shipId: 'kestrel' });
    // Back to the title; HARD, then the MANTA.
    s.flow.stack.reset(s.flow.title);
    s.press(Action.Confirm); // PRESS OK
    s.press(Action.Confirm); // START
    s.hold(0, 2);
    s.press(Action.Down); // HARD
    s.press(Action.Confirm);
    s.hold(0, 3);
    expect(s.ids).toEqual(['title', 'difficulty', 'shipSelect']);
    s.press(Action.Down);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['game']);
    expect(s.flow.world.config).toMatchObject({
      difficulty: 'hard',
      shipId: 'manta',
      powerUpMode: 'direct',
      optionChoice: 'snake', // unused by the MANTA, kept for the KESTREL
    });
    // Every difficulty is armed with the ship: EASY's config flies the MANTA before any new choice.
    s.flow.stack.reset(s.flow.title);
    s.press(Action.Confirm);
    s.press(Action.Confirm);
    s.hold(0, 2);
    s.press(Action.Up);
    s.press(Action.Up); // HARD → NORMAL → EASY
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title', 'difficulty', 'shipSelect']);
    expect(s.flow.shipSelect.focused.id).toBe('manta');
    expect(s.flow.gameConfig).toMatchObject({
      difficulty: 'easy',
      shipId: 'manta',
      powerUpMode: 'direct',
      optionChoice: 'snake',
    });
  });

  it('reads and records the hi-scores of the chosen ship`s power-up model', () => {
    const save = createSaveStore(null);
    save.recordScore('meter-normal', createHiScoreEntry(1_000));
    save.recordScore('direct-normal', createHiScoreEntry(9_000));
    const s = new Session({ continues: 0 }, DB, save);
    expect(s.flow.hiScore).toBe(1_000);
    s.openShips();
    s.press(Action.Down);
    s.press(Action.Confirm); // MANTA
    expect(s.flow.hiScore).toBe(9_000);
    const world = s.flow.world;
    expect(world.scoring.board.hiScore).toBe(9_000);
    // A game over records the MANTA's score in the Direct table only.
    world.scoring.board.scores[0].score = 4_000;
    world.status = 'gameOver';
    for (const ship of world.players) ship.lives = 0;
    s.hold(0, GAME_OVER_DELAY_TICKS + 2);
    expect(s.ids).toEqual(['game', 'gameOver']);
    expect(save.hiScores('direct-normal').map((row) => row.score)).toEqual([9_000, 4_000]);
    expect(save.hiScores('meter-normal').map((row) => row.score)).toEqual([1_000]);
  });

  it('the difficulty menu shows the saved best of the chosen ship`s model', () => {
    const save = createSaveStore(null);
    save.recordScore('meter-normal', createHiScoreEntry(1_000));
    save.recordScore('direct-normal', createHiScoreEntry(9_000));
    const s = new Session({ shipId: 'manta', powerUpMode: 'direct' }, DB, save);
    s.press(Action.Confirm);
    s.press(Action.Confirm);
    s.hold(0, 2);
    expect(s.ids).toEqual(['title', 'difficulty']);
    expect(s.uiNumbers()).toContain(9_000);
    expect(s.uiNumbers()).not.toContain(1_000);
  });

  it('without ships in the content the built-in ship flies and there is nothing to choose', () => {
    const s = new Session({ stage: null }, EMPTY_CONTENT_DB);
    expect(s.flow.ships).toHaveLength(1);
    s.press(Action.Confirm);
    s.press(Action.Confirm);
    s.hold(0, 2);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title', 'difficulty', 'weaponSelect']);
  });

  it('fits the UI list: its strings and commands over the title and the difficulty menu', () => {
    const s = new Session();
    const select = s.flow.shipSelect;
    expect(select.stringSlots).toBe(6 + menuStringSlots(select.menu));
    s.openShips();
    s.press(Action.Down);
    const ui = s.game.renderFrame().ui;
    expect(ui.dropped).toBe(0);
    expect(ui.count).toBeLessThan(ui.capacity);
    expect(select.stringBase + select.stringSlots).toBeLessThanOrEqual(ui.stringCapacity);
  });
});
