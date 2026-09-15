/**
 * Headless tests of the M1 scene flow (plan M1-16) through `createGame(…, { scenes })` driven by
 * input snapshots: boot → title → game → pause → quit (confirm) → title; Back on the title opens
 * the exit confirmation and `platform.exit` runs only after YES; a platform resume pauses a running
 * game; Play/Pause toggles pause; RETRY STAGE starts a fresh World; the game-over and stage-clear
 * screens and their way back to the title; the binding context per scene; what the render frame
 * shows (world, HUD, UI list, dim) and when the UI list is rebuilt; menu sounds and scene music.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent, type ContentDb, type ContentFile } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { MUSIC_CUES, SFX_CUES, SimEventKind } from '../../src/events/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import {
  GAME_OVER_DELAY_TICKS,
  GAME_OVER_LOCK_TICKS,
  GAME_OVER_TIMEOUT_TICKS,
  HI_SCORE_LOCK_TICKS,
  PAUSE_DIM,
  PauseItem,
  STAGE_CLEAR_CONTINUED_TICKS,
  STAGE_CLEAR_DELAY_TICKS,
  STAGE_CLEAR_TALLY_TICKS,
  TitleItem,
  type SceneFlow,
} from '../../src/scenes/index.js';
import { ConfirmChoice } from '../../src/ui/index.js';
import { ENGINE_SPRITES } from '../../src/world/index.js';

/**
 * A shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The file.
 */
function shipped(path: string): ContentFile {
  return {
    path,
    data: JSON.parse(
      readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
    ) as unknown,
  };
}

const DB: ContentDb = (() => {
  const { db, issues } = loadContent(
    [shipped('player/kestrel.player.json'), shipped('weapons/type-a.weapons.json')],
    { extraSprites: ENGINE_SPRITES },
  );
  expect(issues).toEqual([]);
  return db;
})();

/** A headless session with the scene flow, and helpers to drive it. */
class Session {
  readonly platform: HeadlessPlatform & { exit: (() => void) | null };
  readonly game: Game;
  readonly flow: SceneFlow;
  /** Calls of the platform's exit. */
  exits = 0;
  /** Events drained so far: `[kind, id, param]`. */
  readonly events: Array<[number, number, number]> = [];

  constructor(start: 'boot' | 'title' | 'game' = 'title', canExit = true) {
    const base = createHeadlessPlatform();
    const platform = Object.assign(base, {
      exit: canExit
        ? () => {
            this.exits++;
          }
        : null,
    });
    this.platform = platform;
    // No continues: a game over opens the game-over screen at once (the M1 flow these tests
    // cover; the continue countdown of M2-01 has its own tests — scenes-continue.test.ts).
    this.game = createGame(platform, { seed: 7, continues: 0 }, DB, { scenes: start });
    this.flow = this.game.scenes as SceneFlow;
  }

  /** The top scene's id. */
  get top(): string | undefined {
    return this.flow.stack.top?.id;
  }

  /** The scene ids bottom to top. */
  get ids(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.flow.stack.depth; i++) out.push(this.flow.stack.sceneAt(i)!.id);
    return out;
  }

  /**
   * Runs ticks with a held mask, draining the events.
   *
   * @param held - Actions held.
   * @param ticks - Ticks.
   */
  hold(held: ActionMask, ticks = 1): void {
    for (let t = 0; t < ticks; t++) {
      commitPlayerInput(this.platform.snapshot.players[0], held);
      this.game.step();
      this.drain();
    }
  }

  /**
   * Presses and releases an action (one tick down, one tick up).
   *
   * @param action - The action.
   */
  press(action: ActionMask): void {
    this.hold(action);
    this.hold(0);
  }

  /** Drains the game's events into {@link Session.events}. */
  drain(): void {
    this.game.events.drain((e) => {
      this.events.push([e.kind, e.id, e.param]);
    });
  }

  /**
   * The sounds drained so far.
   *
   * @returns SFX cue ids.
   */
  sounds(): number[] {
    return this.events.filter((e) => e[0] === SimEventKind.Sfx).map((e) => e[1]);
  }

  /**
   * The music cues drained so far.
   *
   * @returns Music cue ids.
   */
  music(): number[] {
    return this.events.filter((e) => e[0] === SimEventKind.Music).map((e) => e[1]);
  }

  /**
   * The texts of the frame's UI list.
   *
   * @returns The strings of its text commands.
   */
  uiTexts(): string[] {
    const ui = this.game.renderFrame().ui;
    const out: string[] = [];
    for (let i = 0; i < ui.count; i++)
      if (ui.op[i] === DrawOp.Text) out.push(ui.strings[ui.ref[i]]);
    return out;
  }
}

describe('core/scenes flow: boot and title', () => {
  it('boots into the boot screen, then the title once loading is done', () => {
    const s = new Session('boot');
    expect(s.top).toBe('boot');
    expect(s.game.inputContext).toBe('menu');
    s.flow.setBootProgress(0.5, 'LOADING SOUND');
    expect(s.uiTexts()).toEqual(['LOADING SOUND']);
    s.hold(0, 3);
    expect(s.top).toBe('boot');
    s.flow.finishBoot();
    s.hold(0);
    expect(s.top).toBe('title');
    expect(s.music()).toEqual([MUSIC_CUES.Title]);
    // The placeholder World's stage theme never reached the host.
    expect(s.events.filter((e) => e[0] === SimEventKind.Music)).toHaveLength(1);
  });

  it('shows PRESS OK (blinking), then the menu 1 PLAYER / 2 PLAYERS / OPTIONS / EXIT', () => {
    const s = new Session();
    expect(s.uiTexts()).toEqual(['PRESS OK', 'HI']);
    s.hold(0, 32);
    expect(s.uiTexts()).toEqual(['HI']); // the off half of the blink
    s.press(Action.Confirm);
    expect(s.flow.title.menuOpen).toBe(true);
    // The mode select (M2-15): PRACTICE (disabled — this content has no campaign) and SOUND TEST.
    expect(s.uiTexts()).toEqual([
      '→',
      '1 PLAYER',
      '2 PLAYERS',
      'PRACTICE',
      'OPTIONS',
      'SOUND TEST',
      'EXIT',
      'HI',
    ]);
    expect(s.flow.title.menu.enabled(TitleItem.Options)).toBe(true);
    expect(s.flow.title.menu.enabled(TitleItem.Practice)).toBe(false);
    s.press(Action.Down);
    expect(s.flow.title.menu.focus).toBe(TitleItem.TwoPlayers);
    s.press(Action.Down); // PRACTICE is skipped
    expect(s.flow.title.menu.focus).toBe(TitleItem.Options);
    s.press(Action.Down);
    expect(s.flow.title.menu.focus).toBe(TitleItem.SoundTest);
    s.press(Action.Down);
    expect(s.flow.title.menu.focus).toBe(TitleItem.Exit);
    expect(s.sounds()).toEqual([
      SFX_CUES.MenuSelect,
      SFX_CUES.MenuMove,
      SFX_CUES.MenuMove,
      SFX_CUES.MenuMove,
      SFX_CUES.MenuMove,
    ]);
  });

  it('has no EXIT on a platform that cannot quit; Back there returns to PRESS OK', () => {
    const s = new Session('title', false);
    s.press(Action.Confirm);
    expect(s.flow.title.menu.items.map((i) => i.label)).toEqual([
      '1 PLAYER',
      '2 PLAYERS',
      'PRACTICE',
      'OPTIONS',
      'SOUND TEST',
    ]);
    s.press(Action.Back);
    expect([s.top, s.flow.title.menuOpen]).toEqual(['title', false]);
    s.press(Action.Back); // nothing to confirm without exit
    expect(s.ids).toEqual(['title']);
  });

  it('Back on the title opens the exit confirmation; exit runs only after YES', () => {
    const s = new Session();
    s.press(Action.Back);
    expect(s.ids).toEqual(['title', 'confirm']);
    expect(s.flow.confirm.prompt.focus).toBe(ConfirmChoice.No);
    expect(s.uiTexts()).toContain('EXIT SHMUP CUP?');
    // OK on the default NO closes the dialog.
    s.press(Action.Confirm);
    expect([s.ids, s.exits]).toEqual([['title'], 0]);
    // Back again, Back answers NO.
    s.press(Action.Back);
    s.press(Action.Back);
    expect([s.ids, s.exits]).toEqual([['title'], 0]);
    // Back, Left to YES, OK: exit.
    s.press(Action.Back);
    s.press(Action.Left);
    expect(s.exits).toBe(0);
    s.press(Action.Confirm);
    expect(s.exits).toBe(1);
    expect(s.ids).toEqual(['title']);
  });

  it('EXIT in the title menu asks too', () => {
    const s = new Session();
    s.press(Action.Confirm);
    s.press(Action.Up); // wraps from START to EXIT
    expect(s.flow.title.menu.focus).toBe(TitleItem.Exit);
    s.press(Action.Confirm);
    expect(s.top).toBe('confirm');
    s.press(Action.Right); // already on NO
    s.press(Action.Confirm);
    expect([s.top, s.exits]).toEqual(['title', 0]);
  });
});

describe('core/scenes flow: title → game → pause → quit → title', () => {
  it('plays the whole round trip from snapshot inputs', () => {
    const s = new Session();
    const placeholder = s.game.world;
    s.press(Action.Confirm); // PRESS OK
    s.press(Action.Confirm); // START
    expect(s.ids).toEqual(['title', 'difficulty']);
    s.press(Action.Confirm); // NORMAL (buffered: it acts once the menu's 2-tick lock is over)
    s.hold(0);
    s.press(Action.Confirm); // START in the weapon select (M2-03; buffered by its lock)
    s.hold(0);
    expect(s.top).toBe('game');
    expect(s.game.inputContext).toBe('game');
    const world = s.game.world;
    expect(world).not.toBe(placeholder);
    s.hold(Action.Right, 60);
    // NORMAL acted on its release tick (the menu had just opened: the press was buffered).
    expect(world.tick).toBe(60);
    expect(world.players[0].state).toBe('alive');
    // Pause.
    s.press(Action.Pause);
    expect(s.ids).toEqual(['game', 'pause']);
    expect(s.game.inputContext).toBe('menu');
    const frozen = world.tick;
    s.hold(0, 30);
    expect(world.tick).toBe(frozen);
    // QUIT TO TITLE → confirm → YES.
    s.press(Action.Up); // RESUME → QUIT (wraps)
    expect(s.flow.pause.menu.focus).toBe(PauseItem.Quit);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['game', 'pause', 'confirm']);
    expect(s.uiTexts()).toContain('QUIT TO TITLE?');
    s.press(Action.Left);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title']);
    expect(s.flow.title.menuOpen).toBe(false);
    expect(s.music()).toEqual([MUSIC_CUES.Title, MUSIC_CUES.Silence, MUSIC_CUES.Title]);
    expect(s.sounds()).toContain(SFX_CUES.PauseToggle);
  });

  it('NO in the quit dialog returns to the pause menu; Back and Pause resume', () => {
    const s = new Session('game');
    s.hold(0, 5);
    s.press(Action.Back); // remote Back → Pause in the game context: here Back pauses as well
    expect(s.ids).toEqual(['game', 'pause']);
    s.press(Action.Back);
    expect(s.ids).toEqual(['game']);
    s.press(Action.Pause);
    s.press(Action.Pause); // Play/Pause toggles
    expect(s.ids).toEqual(['game']);
    s.press(Action.Pause);
    s.press(Action.Up); // RESUME → QUIT (wraps)
    s.press(Action.Confirm);
    s.press(Action.Confirm); // NO
    expect(s.ids).toEqual(['game', 'pause']);
    s.press(Action.Up); // QUIT → RETRY
    s.press(Action.Up); // → OPTIONS
    s.press(Action.Up); // → RESUME
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['game']);
  });

  it('RETRY STAGE starts a fresh World', () => {
    const s = new Session('game');
    s.hold(Action.Up, 90);
    const before = s.game.world;
    s.press(Action.Pause);
    s.press(Action.Down); // OPTIONS
    s.press(Action.Down); // RETRY
    expect(s.flow.pause.menu.focus).toBe(PauseItem.Retry);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['game']);
    expect(s.game.world).not.toBe(before);
    expect(s.game.world.tick).toBe(1); // RETRY acted on the press tick; the release stepped it
    expect(s.flow.game.starts).toBe(2);
  });

  it('a platform resume pauses a running game (and nothing else)', () => {
    const s = new Session('game');
    s.hold(0, 10);
    s.platform.suspend();
    s.hold(Action.Right, 10); // suspended: nothing runs
    expect(s.game.world.tick).toBe(10);
    s.platform.resume();
    expect(s.ids).toEqual(['game', 'pause']);
    s.platform.suspend();
    s.platform.resume(); // already paused: no second pause menu
    expect(s.ids).toEqual(['game', 'pause']);
    const t = new Session();
    t.platform.resume();
    expect(t.ids).toEqual(['title']);
  });
});

describe('core/scenes flow: game over and stage clear', () => {
  it('game over opens its screen after a delay; OK after the lock or the timeout → title', () => {
    const s = new Session('game');
    s.hold(0, 5);
    s.game.world.status = 'gameOver';
    s.hold(0, GAME_OVER_DELAY_TICKS - 1);
    expect(s.top).toBe('game');
    s.hold(0);
    expect(s.ids).toEqual(['game', 'gameOver']);
    expect(s.music()).toContain(MUSIC_CUES.GameOver);
    expect(s.uiTexts()).toEqual(['GAME OVER', 'SCORE']);
    s.hold(Action.Confirm); // inside the lock: ignored
    s.hold(0, GAME_OVER_LOCK_TICKS);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title']);
    // The timeout.
    const t = new Session('game');
    t.game.world.status = 'gameOver';
    t.hold(0, GAME_OVER_DELAY_TICKS);
    expect(t.top).toBe('gameOver');
    t.hold(0, GAME_OVER_TIMEOUT_TICKS - 1);
    expect(t.top).toBe('gameOver');
    t.hold(0);
    expect(t.ids).toEqual(['title']);
  });

  it('stage clear: tally → TO BE CONTINUED → title, by time or OK', () => {
    const s = new Session('game');
    s.game.world.status = 'stageClear';
    s.hold(0, STAGE_CLEAR_DELAY_TICKS);
    expect(s.ids).toEqual(['game', 'stageClear']);
    expect(s.music()).toContain(MUSIC_CUES.StageClear);
    expect(s.uiTexts()).toEqual(['STAGE CLEAR', 'SCORE', 'HI']);
    s.hold(0, STAGE_CLEAR_TALLY_TICKS);
    expect(s.uiTexts()).toEqual(['TO BE CONTINUED']);
    s.hold(0, STAGE_CLEAR_CONTINUED_TICKS);
    expect(s.ids).toEqual(['title']);
    const t = new Session('game');
    t.game.world.status = 'stageClear';
    t.hold(0, STAGE_CLEAR_DELAY_TICKS);
    t.press(Action.Confirm);
    expect(t.uiTexts()).toEqual(['TO BE CONTINUED']);
    t.press(Action.Confirm);
    expect(t.ids).toEqual(['title']);
  });

  it('carries the session hi-score into the title and the next game', () => {
    const s = new Session('game');
    s.game.world.scoring.board.scores[0].score = 4200;
    s.game.world.scoring.board.setHiScore(4200);
    s.game.world.status = 'gameOver';
    s.hold(0, GAME_OVER_DELAY_TICKS + GAME_OVER_TIMEOUT_TICKS);
    // A new hi-score (M2-15): the name entry — `A` and OK on END —, then the table, then the title.
    expect(s.top).toBe('nameEntry');
    s.hold(0, 2); // the entry's 2-tick lock
    for (let i = 0; i < 4; i++) s.press(Action.Confirm);
    expect(s.top).toBe('hiScore');
    s.hold(0, HI_SCORE_LOCK_TICKS);
    s.press(Action.Confirm);
    expect(s.top).toBe('title');
    expect(s.flow.save.hiScores('meter-normal')[0]).toMatchObject({ name: 'A', score: 4200 });
    expect(s.flow.hiScore).toBe(4200);
    s.press(Action.Confirm);
    s.press(Action.Confirm);
    s.press(Action.Confirm); // NORMAL (buffered: it acts once the menu's 2-tick lock is over)
    s.hold(0);
    s.press(Action.Confirm); // START in the weapon select (M2-03; buffered by its lock)
    s.hold(0);
    expect(s.game.world.scoring.board.hiScore).toBe(4200);
    expect(s.game.world.scoring.board.scores[0].score).toBe(0);
    s.flow.setHiScore(90_000);
    expect(s.flow.hiScore).toBe(90_000);
    expect(s.game.world.scoring.board.hiScore).toBe(90_000);
  });
});

describe('core/scenes flow: the render frame', () => {
  it('shows no world or HUD on the title, the World and HUD in game, dimmed under pause', () => {
    const s = new Session();
    let frame = s.game.renderFrame();
    expect([frame.world, frame.hud.count, frame.screen.dim]).toEqual([null, 0, 0]);
    s.press(Action.Confirm);
    s.press(Action.Confirm);
    s.press(Action.Confirm); // NORMAL (buffered: it acts once the menu's 2-tick lock is over)
    s.hold(0);
    s.press(Action.Confirm); // START in the weapon select (M2-03; buffered by its lock)
    s.hold(0);
    frame = s.game.renderFrame();
    expect(frame.world).toBe(s.game.world.view);
    expect(frame.hud.count).toBeGreaterThan(20);
    expect(frame.ui.count).toBe(0);
    s.press(Action.Pause);
    frame = s.game.renderFrame();
    expect(frame.world).toBe(s.game.world.view);
    expect(frame.screen.dim).toBe(PAUSE_DIM);
    expect(s.uiTexts()).toEqual([
      'PAUSE',
      '→',
      'RESUME',
      'OPTIONS',
      'RETRY STAGE',
      'QUIT TO TITLE',
    ]);
    s.press(Action.Up); // RESUME → QUIT (wraps)
    s.press(Action.Confirm);
    // The dialog is drawn over the pause menu (focused on QUIT), which stays visible.
    const texts = s.uiTexts();
    expect(texts.slice(0, 6)).toEqual([
      'PAUSE',
      'RESUME',
      'OPTIONS',
      'RETRY STAGE',
      '→',
      'QUIT TO TITLE',
    ]);
    expect(texts.slice(6)).toEqual(['QUIT TO TITLE?', '→', 'YES', 'NO']);
  });

  it("reports the World's tick while the game shows (frozen under pause), else the flow's", () => {
    const s = new Session();
    s.hold(0, 5);
    expect(s.game.renderFrame().tick).toBe(5);
    s.press(Action.Confirm);
    s.press(Action.Confirm);
    s.press(Action.Confirm); // NORMAL (buffered: it acts once the menu's 2-tick lock is over)
    s.hold(0);
    s.press(Action.Confirm); // START in the weapon select (M2-03; buffered by its lock)
    s.hold(0);
    expect(s.game.renderFrame().tick).toBe(s.game.world.tick);
    s.hold(0, 30);
    const tick = s.game.renderFrame().tick;
    expect(tick).toBe(30);
    s.press(Action.Pause);
    const paused = s.game.renderFrame().tick;
    s.hold(0, 30);
    expect(s.game.renderFrame().tick).toBe(paused);
    expect(s.game.state.tick).toBeGreaterThan(paused + 30);
  });

  it('rebuilds the UI list only when a visible scene changed its look', () => {
    const s = new Session('game');
    s.press(Action.Pause);
    const ui = s.game.renderFrame().ui;
    const revision = ui.revision;
    s.hold(0, 10);
    s.game.renderFrame();
    expect(ui.revision).toBe(revision);
    s.press(Action.Down);
    s.game.renderFrame();
    expect(ui.revision).toBeGreaterThan(revision);
  });

  it('two sessions fed the same inputs stay in lockstep', () => {
    const run = (): number => {
      const s = new Session();
      s.press(Action.Confirm);
      s.press(Action.Confirm);
      s.press(Action.Confirm); // NORMAL (buffered: it acts once the menu's 2-tick lock is over)
      s.hold(0);
      s.press(Action.Confirm); // START in the weapon select (M2-03; buffered by its lock)
      s.hold(0);
      for (let t = 0; t < 400; t++) s.hold(t % 90 < 45 ? Action.Up : Action.Down | Action.Shot);
      s.press(Action.Pause);
      s.press(Action.Pause);
      s.hold(Action.Right, 100);
      return hashWorld(s.game.world);
    };
    expect(run()).toBe(run());
  });
});
