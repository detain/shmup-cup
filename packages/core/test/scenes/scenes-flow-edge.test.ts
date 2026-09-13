/**
 * Edge cases of the M1 scene flow (plan M1-16), driven headlessly through `createGame(…, {
 * scenes })` and `createSceneFlow` with a fake host: construction (one placeholder World, its
 * events dropped, disjoint string slots), the boot bar, the title's blink, lock and Back rules
 * (with and without `platform.exit`), OK held or mashed, any player driving the menus, the game's
 * pause edge and end-screen delay (frozen while paused, reset by RETRY), the pause menu's lock and
 * denied OPTIONS, the confirm dialog's sounds, the game-over lock boundary, the stage-clear tally,
 * the WARNING band, platform resume on every scene, the session hi-score (lowering, fractions, the
 * score cap), what the frame shows on every screen, and lockstep across menus and retries.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import {
  EMPTY_CONTENT_DB,
  loadContent,
  type ContentDb,
  type ContentFile,
} from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import {
  MUSIC_CUES,
  SFX_CUES,
  SimEventKind,
  createEventQueue,
  type EventQueue,
} from '../../src/events/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { DrawOp, TextAlign, type DrawList } from '../../src/presentation/index.js';
import {
  GAME_OVER_DELAY_TICKS,
  GAME_OVER_LOCK_TICKS,
  GAME_OVER_TIMEOUT_TICKS,
  PAUSE_DIM,
  PauseItem,
  STAGE_CLEAR_DELAY_TICKS,
  STAGE_CLEAR_TALLY_TICKS,
  TitleItem,
  createSceneFlow,
  type SceneFlow,
  type SceneFlowHost,
  type SceneStart,
} from '../../src/scenes/index.js';
import { MAX_SCORE } from '../../src/scoring/index.js';
import { ConfirmChoice, UI_COLORS, resolveUiSprites } from '../../src/ui/index.js';
import { ENGINE_SPRITES, createWorld, type World } from '../../src/world/index.js';

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

/** A drained event: `[kind, id, param]`. */
type Drained = [number, number, number];

/** A headless session with the scene flow, and helpers to drive it. */
class Session {
  readonly platform: HeadlessPlatform & { exit: (() => void) | null };
  readonly game: Game;
  readonly flow: SceneFlow;
  /** Calls of the platform's exit. */
  exits = 0;
  /** Events drained so far. */
  readonly events: Drained[] = [];

  /**
   * Creates the session.
   *
   * @param start - First scene.
   * @param canExit - Whether the platform can quit.
   * @param content - Content database.
   */
  constructor(start: SceneStart = 'title', canExit = true, content: ContentDb = DB) {
    const platform = Object.assign(createHeadlessPlatform(), {
      exit: canExit
        ? () => {
            this.exits++;
          }
        : null,
    });
    this.platform = platform;
    // No continues: a game over opens the game-over screen at once (the M1 flow; the continue
    // countdown of M2-01 is covered by scenes-continue.test.ts).
    this.game = createGame(platform, { seed: 11, continues: 0 }, content, { scenes: start });
    this.flow = this.game.scenes as SceneFlow;
    this.drain();
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
   * Runs ticks with a held mask (player 1 unless given), draining the events.
   *
   * @param held - Actions held.
   * @param ticks - Ticks.
   * @param player - Player slot.
   * @param latched - Actions pressed and released since the last tick (first tick only).
   */
  hold(held: ActionMask, ticks = 1, player = 0, latched: ActionMask = 0): void {
    for (let t = 0; t < ticks; t++) {
      commitPlayerInput(this.platform.snapshot.players[player], held, t === 0 ? latched : 0);
      this.game.step();
      this.drain();
    }
  }

  /**
   * Presses and releases an action (one tick down, one tick up).
   *
   * @param action - The action.
   * @param player - Player slot.
   */
  press(action: ActionMask, player = 0): void {
    this.hold(action, 1, player);
    this.hold(0, 1, player);
  }

  /** PRESS OK, then START, then NORMAL in the difficulty menu (its buffered OK acts a tick late). */
  startGame(): void {
    this.press(Action.Confirm);
    this.press(Action.Confirm);
    expect(this.top).toBe('difficulty');
    this.chooseNormal();
  }

  /**
   * OK on the difficulty menu's focus (NORMAL unless moved), then one idle tick: the menu's
   * 2-tick open lock buffers the press, which acts once the lock is over.
   *
   * @param player - Player slot.
   */
  chooseNormal(player = 0): void {
    this.press(Action.Confirm, player);
    this.hold(0, 1, player);
    // The weapon select (M2-03) opens focused on START: the same buffered OK starts the game.
    expect(this.top).toBe('weaponSelect');
    this.press(Action.Confirm, player);
    this.hold(0, 1, player);
    expect(this.top).toBe('game');
  }

  /** Drains the game's events. */
  drain(): void {
    this.game.events.drain((e) => {
      this.events.push([e.kind, e.id, e.param]);
    });
  }

  /**
   * The sounds drained since an index.
   *
   * @param from - First event index.
   * @returns SFX cue ids.
   */
  sounds(from = 0): number[] {
    return this.events.slice(from).flatMap((e) => (e[0] === SimEventKind.Sfx ? [e[1]] : []));
  }

  /**
   * The music events drained since an index.
   *
   * @param from - First event index.
   * @returns `[cue, fade]` pairs.
   */
  music(from = 0): Array<[number, number]> {
    return this.events
      .slice(from)
      .flatMap((e): Array<[number, number]> => (e[0] === SimEventKind.Music ? [[e[1], e[2]]] : []));
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
}

/**
 * The commands of a list of one op.
 *
 * @param list - The list.
 * @param op - The op.
 * @returns Command indices.
 */
function indicesOf(list: DrawList, op: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < list.count; i++) if (list.op[i] === op) out.push(i);
  return out;
}

/** A fake flow host counting its Worlds. */
class FakeHost implements SceneFlowHost {
  readonly config = resolveGameConfig({ seed: 3 });
  readonly content: ContentDb;
  readonly events: EventQueue = createEventQueue();
  readonly exit: (() => void) | null;
  /** Worlds created. */
  worlds = 0;
  /** Exit calls. */
  exits = 0;

  /**
   * Creates the host.
   *
   * @param canExit - Whether it can quit.
   * @param content - Content.
   */
  constructor(canExit: boolean, content: ContentDb = DB) {
    this.content = content;
    this.exit = canExit
      ? () => {
          this.exits++;
        }
      : null;
  }

  createWorld(): World {
    this.worlds++;
    return createWorld(this.config, this.content, { events: this.events });
  }
}

/**
 * The events of a queue, drained.
 *
 * @param events - The queue.
 * @returns `[kind, id, param]` per event.
 */
function drainAll(events: EventQueue): Drained[] {
  const out: Drained[] = [];
  events.drain((e) => {
    out.push([e.kind, e.id, e.param]);
  });
  return out;
}

describe('core/scenes flow edge: construction', () => {
  it('creates one placeholder World, drops its events and starts the requested scene', () => {
    const boot = new FakeHost(true);
    boot.events.push(SimEventKind.Sfx, 1, 0, 0, 0); // queued before: dropped with the World's
    const flow = createSceneFlow(boot);
    expect([boot.worlds, flow.stack.top?.id, drainAll(boot.events)]).toEqual([1, 'boot', []]);
    const title = new FakeHost(true);
    expect(createSceneFlow(title, 'title').stack.top?.id).toBe('title');
    expect([title.worlds, drainAll(title.events)]).toEqual([
      1,
      [[SimEventKind.Music, MUSIC_CUES.Title, 30]],
    ]);
    const game = new FakeHost(true);
    const started = createSceneFlow(game, 'game');
    expect([game.worlds, started.game.starts, started.stack.top?.id]).toEqual([2, 1, 'game']);
    expect(drainAll(game.events)[0]).toEqual([SimEventKind.Music, MUSIC_CUES.Silence, 30]);
    expect(started.world.events).toBe(game.events);
  });

  it('gives every scene its own string slots, together within the UI list', () => {
    for (const canExit of [true, false]) {
      const flow = createSceneFlow(new FakeHost(canExit));
      const scenes = [
        flow.boot,
        flow.title,
        flow.game,
        flow.pause,
        flow.stageClear,
        flow.gameOver,
        flow.confirm,
      ];
      let next = 0;
      for (const scene of scenes) {
        expect(scene.stringBase).toBe(next);
        expect(scene.stringSlots).toBeGreaterThan(0);
        next += scene.stringSlots;
      }
      expect(next).toBeLessThanOrEqual(flow.view.ui.stringCapacity);
      // PRESS OK, HI, the logo's text, the cursor and the items (2 PLAYERS since M2-06).
      expect(flow.title.stringSlots).toBe(canExit ? 10 : 9);
    }
  });

  it('declares each scene as the spec says (overlay, dim, binding context)', () => {
    const flow = createSceneFlow(new FakeHost(true));
    const rows = [
      flow.boot,
      flow.title,
      flow.game,
      flow.pause,
      flow.stageClear,
      flow.gameOver,
      flow.confirm,
    ].map((s) => [s.id, s.overlay, s.dim, s.inputContext]);
    expect(rows).toEqual([
      ['boot', false, 0, 'menu'],
      ['title', false, 0, 'menu'],
      ['game', false, 0, 'game'],
      ['pause', true, PAUSE_DIM, 'menu'],
      ['stageClear', true, 0.25, 'menu'],
      ['gameOver', true, 0.35, 'menu'],
      ['confirm', true, PAUSE_DIM, 'menu'],
    ]);
  });
});

describe('core/scenes flow edge: boot', () => {
  it('clamps the bar, keeps the label when none is given and ignores input', () => {
    const s = new Session('boot');
    const bar = (): number[] => {
      const ui = s.game.renderFrame().ui;
      return indicesOf(ui, DrawOp.Rect).map((i) => ui.w[i]);
    };
    expect(bar()).toEqual([160]); // the track only
    s.flow.setBootProgress(0.25, 'LOADING ART');
    expect(bar()).toEqual([160, 40]);
    s.flow.setBootProgress(-1);
    expect(bar()).toEqual([160]);
    s.flow.setBootProgress(2);
    expect(bar()).toEqual([160, 160]);
    expect(s.uiTexts()).toEqual(['LOADING ART']);
    s.press(Action.Confirm);
    s.press(Action.Back);
    s.press(Action.Pause);
    expect([s.ids, s.exits, s.sounds()]).toEqual([['boot'], 0, []]);
  });

  it('does not rebuild the UI list while nothing changes, and moves on right after finishBoot', () => {
    const s = new Session('boot');
    const ui = s.game.renderFrame().ui;
    const revision = ui.revision;
    s.hold(0, 20);
    s.game.renderFrame();
    expect(ui.revision).toBe(revision);
    s.flow.finishBoot();
    expect(s.top).toBe('boot'); // the next tick shows the title
    s.hold(0);
    expect(s.ids).toEqual(['title']);
    expect(s.music()).toEqual([[MUSIC_CUES.Title, 30]]);
  });
});

describe('core/scenes flow edge: title', () => {
  it('blinks PRESS OK every 32 ticks (a UI rebuild per blink, none in between)', () => {
    const s = new Session();
    const revision = s.flow.title.uiRevision;
    s.hold(0, 31);
    expect(s.flow.title.uiRevision).toBe(revision);
    s.hold(0);
    expect(s.flow.title.uiRevision).toBe(revision + 1);
    expect(s.uiTexts()).not.toContain('PRESS OK'); // ticks 32–63: the "off" half
    s.hold(0, 32);
    expect(s.flow.title.uiRevision).toBe(revision + 2);
    expect(s.uiTexts()).toContain('PRESS OK'); // ticks 64–95: "on" again
    s.hold(0, 32);
    expect(s.flow.title.uiRevision).toBe(revision + 3);
    expect(s.uiTexts()).not.toContain('PRESS OK');
  });

  it('OK held after PRESS OK does not also start the game', () => {
    const s = new Session();
    s.hold(Action.Confirm, 90);
    expect([s.top, s.flow.title.menuOpen]).toEqual(['title', true]);
    s.hold(0);
    expect(s.top).toBe('title');
  });

  it('an OK mashed right after the menu opened starts the game once the lock is over', () => {
    const s = new Session();
    s.hold(Action.Confirm); // PRESS OK
    s.hold(Action.Confirm, 1, 0, Action.Confirm); // released and pressed again between polls
    s.hold(0);
    expect(s.top).toBe('title'); // still locked (2 ticks)
    s.hold(0);
    expect(s.ids).toEqual(['title', 'difficulty']); // the buffered press: START
    s.chooseNormal();
  });

  it('wraps the menu at both ends and plays the move sound', () => {
    const s = new Session();
    s.press(Action.Confirm);
    const from = s.events.length;
    s.press(Action.Up);
    expect(s.flow.title.menu.focus).toBe(TitleItem.Exit);
    s.press(Action.Down);
    expect(s.flow.title.menu.focus).toBe(TitleItem.Start);
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuMove, SFX_CUES.MenuMove]);
  });

  it('without EXIT the menu moves between 1 PLAYER, 2 PLAYERS and OPTIONS only', () => {
    const s = new Session('title', false);
    s.press(Action.Confirm);
    const from = s.events.length;
    s.press(Action.Down);
    expect(s.flow.title.menu.focus).toBe(TitleItem.TwoPlayers);
    s.press(Action.Down);
    expect(s.flow.title.menu.focus).toBe(TitleItem.Options);
    s.press(Action.Down); // wraps
    expect(s.flow.title.menu.focus).toBe(TitleItem.Start);
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuMove, SFX_CUES.MenuMove, SFX_CUES.MenuMove]);
  });

  it('Back from the menu without EXIT shows PRESS OK at once with the back sound', () => {
    const s = new Session('title', false);
    s.hold(0, 40); // the prompt's "off" half
    s.press(Action.Confirm);
    const from = s.events.length;
    s.press(Action.Back);
    expect(s.flow.title.menuOpen).toBe(false);
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuBack]);
    expect(s.uiTexts()).toContain('PRESS OK'); // the blink restarted on the "on" half
    const quiet = s.events.length;
    s.press(Action.Back); // PRESS OK without exit: nothing at all
    expect([s.ids, s.sounds(quiet)]).toEqual([['title'], []]);
  });

  it('NO on the exit confirmation returns to where the title was (prompt or menu)', () => {
    const s = new Session();
    s.press(Action.Back); // from PRESS OK
    s.press(Action.Confirm); // NO
    expect([s.ids, s.flow.title.menuOpen]).toEqual([['title'], false]);
    s.press(Action.Confirm); // PRESS OK → menu
    s.press(Action.Back); // from the menu
    expect(s.ids).toEqual(['title', 'confirm']);
    s.hold(Action.Back); // Back answers NO: the dialog closes at the end of this tick
    expect([s.ids, s.flow.title.menuOpen]).toEqual([['title'], true]);
    // The menu is locked again for two ticks: an OK right away is only buffered.
    s.hold(0, 1, 0, Action.Confirm);
    expect(s.top).toBe('title');
    s.hold(0);
    expect(s.top).toBe('title');
    s.hold(0);
    expect(s.top).toBe('difficulty');
  });

  it('opens the menu on START again after a game, whatever was focused before', () => {
    const s = new Session();
    s.press(Action.Confirm);
    s.press(Action.Up); // EXIT
    s.press(Action.Down); // START
    s.press(Action.Confirm);
    s.chooseNormal();
    s.press(Action.Pause);
    s.press(Action.Up); // QUIT (wraps)
    s.press(Action.Confirm);
    s.press(Action.Left);
    s.press(Action.Confirm);
    expect([s.ids, s.flow.title.menuOpen]).toEqual([['title'], false]);
    s.flow.title.menu.focus = TitleItem.Exit;
    s.press(Action.Confirm);
    expect(s.flow.title.menu.focus).toBe(TitleItem.Start);
  });

  it('draws the logo sprite, or its name without the UI sprites, and the session hi-score', () => {
    const s = new Session();
    s.flow.setHiScore(4321);
    const ui = s.game.renderFrame().ui;
    const logo = resolveUiSprites(DB).logo;
    const sprites = indicesOf(ui, DrawOp.Sprite);
    expect(sprites.map((i) => [ui.ref[i], ui.x[i], ui.y[i]])).toEqual([[logo, 192, 64]]);
    const numbers = indicesOf(ui, DrawOp.Number);
    expect(numbers.map((i) => [ui.value[i], ui.x[i], ui.y[i], ui.frame[i]])).toEqual([
      [4321, 168, 196, 8],
    ]);
    const bare = new Session('title', true, EMPTY_CONTENT_DB);
    expect(indicesOf(bare.game.renderFrame().ui, DrawOp.Sprite)).toEqual([]);
    expect(bare.uiTexts()[0]).toBe('SHMUP CUP');
  });

  it("answers any player's input (player 2 starts the game and pauses it)", () => {
    const s = new Session();
    s.press(Action.Confirm, 1);
    s.press(Action.Confirm, 1);
    s.chooseNormal(1);
    s.press(Action.Pause, 1);
    expect(s.top).toBe('pause');
    s.press(Action.Back, 1);
    expect(s.top).toBe('game');
  });
});

describe('core/scenes flow edge: game', () => {
  it('pauses once for a held Pause (the edge, not the level) with the pause sound', () => {
    const s = new Session('game');
    const from = s.events.length;
    s.hold(Action.Pause, 60);
    expect(s.ids).toEqual(['game', 'pause']);
    expect(s.sounds(from)).toEqual([SFX_CUES.PauseToggle]);
    s.hold(0);
    s.press(Action.Pause);
    expect(s.ids).toEqual(['game']);
    expect(s.sounds(from)).toEqual([SFX_CUES.PauseToggle, SFX_CUES.PauseToggle]);
  });

  it('freezes the end-screen delay while paused', () => {
    const s = new Session('game');
    s.game.world.status = 'gameOver';
    s.hold(0, 20);
    s.press(Action.Pause);
    s.hold(0, 100);
    s.press(Action.Pause); // the release tick steps the World: 21 ticks of the delay
    expect(s.top).toBe('game');
    s.hold(0, GAME_OVER_DELAY_TICKS - 22);
    expect(s.top).toBe('game');
    s.hold(0);
    expect(s.ids).toEqual(['game', 'gameOver']);
  });

  it('restarts the delay when the World is playing again, and RETRY cancels it', () => {
    const s = new Session('game');
    const world = s.game.world;
    world.status = 'gameOver';
    s.hold(0, 20);
    world.status = 'playing';
    s.hold(0);
    world.status = 'gameOver';
    s.hold(0, GAME_OVER_DELAY_TICKS - 1);
    expect(s.top).toBe('game');
    s.hold(0);
    expect(s.top).toBe('gameOver');
    // RETRY during the delay: a fresh World, no game-over screen.
    const t = new Session('game');
    t.game.world.status = 'gameOver';
    t.hold(0, 10);
    t.press(Action.Pause);
    t.press(Action.Down); // OPTIONS
    t.press(Action.Down); // RETRY
    t.press(Action.Confirm);
    t.hold(0, GAME_OVER_DELAY_TICKS * 2);
    expect([t.ids, t.game.world.status]).toEqual([['game'], 'playing']);
  });

  it('shows the WARNING band while it plays, red and yellow every 16 ticks', () => {
    const s = new Session('game');
    const warning = s.game.world.bosses.warning;
    const ui = s.game.renderFrame().ui;
    expect(ui.count).toBe(0);
    warning.active = true;
    warning.ticks = 0;
    warning.text = 'WARNING!! TEST CRAFT';
    s.hold(0);
    const frame = s.game.renderFrame();
    expect(indicesOf(frame.ui, DrawOp.Rect).map((i) => [frame.ui.y[i], frame.ui.h[i]])).toEqual([
      [76, 48],
      [76, 1],
      [123, 1],
    ]);
    const text = indicesOf(frame.ui, DrawOp.Text)[0];
    expect(frame.ui.strings[frame.ui.ref[text]]).toBe('WARNING!! TEST CRAFT');
    expect([frame.ui.color[text], frame.ui.flags[text]]).toEqual([
      UI_COLORS.alert,
      TextAlign.Center,
    ]);
    const revision = s.flow.game.uiRevision;
    s.hold(0, 5); // same look: no redraw
    expect(s.flow.game.uiRevision).toBe(revision);
    warning.ticks = 16;
    s.hold(0);
    expect(s.flow.game.uiRevision).toBe(revision + 1);
    const yellow = s.game.renderFrame().ui;
    expect(yellow.color[indicesOf(yellow, DrawOp.Text)[0]]).toBe(UI_COLORS.focus);
    warning.active = false;
    s.hold(0);
    expect(s.game.renderFrame().ui.count).toBe(0);
  });
});

describe('core/scenes flow edge: pause menu and dialogs', () => {
  it('opens on RESUME every time and buffers an OK pressed while it opens', () => {
    const s = new Session('game');
    s.press(Action.Pause);
    s.press(Action.Up); // wraps to QUIT
    expect(s.flow.pause.menu.focus).toBe(PauseItem.Quit);
    s.press(Action.Pause); // resume
    s.hold(Action.Pause); // pause again
    expect(s.flow.pause.menu.focus).toBe(PauseItem.Resume);
    s.hold(0, 1, 0, Action.Confirm); // an OK right away: buffered while locked
    expect(s.top).toBe('pause');
    s.hold(0);
    expect(s.top).toBe('pause');
    s.hold(0);
    expect(s.ids).toEqual(['game']); // RESUME
  });

  it('opens the Options screen from OPTIONS with the select sound', () => {
    const s = new Session('game');
    s.press(Action.Pause);
    s.press(Action.Down);
    const from = s.events.length;
    s.press(Action.Confirm);
    expect([s.ids, s.sounds(from)]).toEqual([['game', 'pause', 'options'], [SFX_CUES.MenuSelect]]);
  });

  it('RETRY plays the select sound, fades the music out and counts a start', () => {
    const s = new Session('game');
    s.press(Action.Pause);
    s.press(Action.Down);
    s.press(Action.Down);
    const from = s.events.length;
    s.hold(Action.Confirm);
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuSelect]);
    expect(s.music(from)[0]).toEqual([MUSIC_CUES.Silence, 30]);
    expect([s.flow.game.starts, s.game.world.tick, s.game.renderFrame().tick]).toEqual([2, 0, 0]);
  });

  it('the dialogs sound: move, NO / Back back, YES select', () => {
    const s = new Session('game');
    s.press(Action.Pause);
    s.press(Action.Up); // QUIT
    let from = s.events.length;
    s.press(Action.Confirm);
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuSelect]); // the dialog opens
    from = s.events.length;
    s.press(Action.Left);
    s.press(Action.Right);
    s.press(Action.Confirm); // NO
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuMove, SFX_CUES.MenuMove, SFX_CUES.MenuBack]);
    s.press(Action.Confirm); // QUIT again
    from = s.events.length;
    s.press(Action.Back);
    expect([s.ids, s.sounds(from)]).toEqual([['game', 'pause'], [SFX_CUES.MenuBack]]);
    s.press(Action.Confirm);
    s.press(Action.Up); // YES
    from = s.events.length;
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title']);
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuSelect]);
    expect(s.music(from)).toEqual([[MUSIC_CUES.Title, 30]]);
  });

  it('draws the title under the exit confirmation, dimmed, with no World', () => {
    const s = new Session();
    s.press(Action.Back);
    const frame = s.game.renderFrame();
    expect([frame.world, frame.hud.count, frame.screen.dim]).toEqual([null, 0, PAUSE_DIM]);
    const texts = s.uiTexts();
    expect(texts[texts.length - 4]).toBe('EXIT SHMUP CUP?');
    expect(texts).toContain('HI'); // the title is still drawn below
    expect(s.flow.confirm.prompt.focus).toBe(ConfirmChoice.No);
  });

  it('asks again on NO → Back → reopen with the focus back on NO', () => {
    const s = new Session();
    s.press(Action.Back);
    s.press(Action.Left); // YES
    s.press(Action.Back); // closed without answering YES
    expect(s.exits).toBe(0);
    s.press(Action.Back);
    expect(s.flow.confirm.prompt.focus).toBe(ConfirmChoice.No);
    s.press(Action.Confirm);
    expect([s.ids, s.exits]).toEqual([['title'], 0]);
  });
});

describe('core/scenes flow edge: end screens', () => {
  /**
   * A session showing the game-over screen.
   *
   * @returns The session.
   */
  function gameOver(): Session {
    const s = new Session('game');
    s.game.world.status = 'gameOver';
    s.hold(0, GAME_OVER_DELAY_TICKS);
    expect(s.top).toBe('gameOver');
    return s;
  }

  it('ignores OK on the last locked tick and takes it on the next', () => {
    const early = gameOver();
    early.hold(0, GAME_OVER_LOCK_TICKS - 1);
    early.hold(Action.Confirm); // its tick 30
    expect(early.top).toBe('gameOver');
    const late = gameOver();
    late.hold(0, GAME_OVER_LOCK_TICKS);
    const from = late.events.length;
    late.hold(Action.Back); // its tick 31: Back works too
    expect(late.ids).toEqual(['title']);
    expect(late.sounds(from)).toEqual([SFX_CUES.MenuSelect]);
  });

  it('times out silently, keeps the World on screen frozen and dimmed meanwhile', () => {
    const s = gameOver();
    const frame = s.game.renderFrame();
    const tick = frame.tick;
    expect([frame.world, frame.screen.dim]).toEqual([s.game.world.view, 0.35]);
    expect(s.game.inputContext).toBe('menu');
    s.hold(0, 100);
    expect(s.game.renderFrame().tick).toBe(tick);
    const from = s.events.length;
    s.hold(0, GAME_OVER_TIMEOUT_TICKS - 100);
    expect(s.ids).toEqual(['title']);
    expect(s.sounds(from)).toEqual([]);
    // The next game is a fresh one.
    s.startGame();
    expect(s.game.world.status).toBe('playing');
  });

  it('stage clear: the tally shows the score and hi-score right-aligned; Back does not skip', () => {
    const s = new Session('game');
    const board = s.game.world.scoring.board;
    board.scores[0].score = 3100;
    board.setHiScore(9000);
    s.game.world.status = 'stageClear';
    s.hold(0, STAGE_CLEAR_DELAY_TICKS);
    const ui = s.game.renderFrame().ui;
    const numbers = indicesOf(ui, DrawOp.Number);
    expect(numbers.map((i) => [ui.value[i], ui.x[i], ui.flags[i]])).toEqual([
      [3100, 256, TextAlign.Right],
      [9000, 256, TextAlign.Right],
    ]);
    expect(s.game.renderFrame().screen.dim).toBe(0.25);
    s.press(Action.Back);
    s.hold(0, STAGE_CLEAR_TALLY_TICKS - 3);
    expect(s.uiTexts()).toEqual(['STAGE CLEAR', 'SCORE', 'HI']);
    s.hold(0);
    expect(s.uiTexts()).toEqual(['TO BE CONTINUED']);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title']);
    expect(s.flow.hiScore).toBe(9000);
  });

  it('plays the jingles without a fade, once per screen', () => {
    const s = new Session('game');
    s.game.world.status = 'stageClear';
    const from = s.events.length;
    s.hold(0, STAGE_CLEAR_DELAY_TICKS + 30);
    expect(s.music(from).filter((m) => m[0] === MUSIC_CUES.StageClear)).toEqual([
      [MUSIC_CUES.StageClear, 0],
    ]);
    const t = gameOver();
    expect(t.music().filter((m) => m[0] === MUSIC_CUES.GameOver)).toEqual([
      [MUSIC_CUES.GameOver, 0],
    ]);
  });
});

describe('core/scenes flow edge: platform resume', () => {
  it('pauses only a running game, with the pause sound', () => {
    const boot = new Session('boot');
    boot.platform.resume();
    expect(boot.ids).toEqual(['boot']);
    const s = new Session();
    s.press(Action.Back);
    s.platform.resume();
    expect(s.ids).toEqual(['title', 'confirm']);
    const g = new Session('game');
    g.hold(0, 3);
    g.platform.suspend();
    g.platform.resume();
    g.drain();
    expect(g.ids).toEqual(['game', 'pause']);
    expect(g.sounds()).toContain(SFX_CUES.PauseToggle);
    g.game.world.status = 'gameOver';
    g.press(Action.Pause);
    g.hold(0, GAME_OVER_DELAY_TICKS);
    expect(g.top).toBe('gameOver');
    g.platform.resume();
    expect(g.ids).toEqual(['game', 'gameOver']);
  });
});

describe('core/scenes flow edge: session hi-score', () => {
  it('never lowers, floors fractions, caps at the score limit and redraws the title', () => {
    const s = new Session();
    const revision = s.flow.title.uiRevision;
    s.flow.setHiScore(1234.9);
    expect(s.flow.hiScore).toBe(1234);
    expect(s.flow.title.uiRevision).toBe(revision + 1);
    s.flow.setHiScore(10);
    s.flow.setHiScore(Number.NaN);
    expect(s.flow.hiScore).toBe(1234);
    s.flow.setHiScore(1e12);
    expect(s.flow.hiScore).toBe(MAX_SCORE);
    expect(s.game.world.scoring.board.hiScore).toBe(MAX_SCORE);
  });

  it('records a new best from the game when it is abandoned or retried', () => {
    const s = new Session('game');
    s.game.world.scoring.board.setHiScore(5000);
    s.press(Action.Pause);
    s.press(Action.Down); // OPTIONS
    s.press(Action.Down); // RETRY
    s.press(Action.Confirm);
    expect(s.flow.hiScore).toBe(5000);
    expect(s.game.world.scoring.board.hiScore).toBe(5000);
    s.game.world.scoring.board.setHiScore(7000);
    s.press(Action.Pause);
    s.press(Action.Up); // QUIT
    s.press(Action.Confirm);
    s.press(Action.Left);
    s.press(Action.Confirm);
    expect([s.ids, s.flow.hiScore]).toEqual([['title'], 7000]);
    const ui = s.game.renderFrame().ui;
    const n = indicesOf(ui, DrawOp.Number)[0];
    expect(ui.value[n]).toBe(7000);
  });
});

describe('core/scenes flow edge: the frame', () => {
  it("reports the flow's tick outside the game and an empty HUD", () => {
    const s = new Session();
    s.hold(0, 12);
    let frame = s.game.renderFrame();
    expect([frame.tick, frame.world, frame.hud.count]).toEqual([s.game.state.tick, null, 0]);
    s.startGame();
    s.hold(0, 5);
    s.press(Action.Pause);
    s.press(Action.Up);
    s.press(Action.Confirm);
    s.press(Action.Left);
    s.press(Action.Confirm);
    frame = s.game.renderFrame();
    expect([frame.tick, frame.world, frame.hud.count, frame.screen.dim]).toEqual([
      s.game.state.tick,
      null,
      0,
      0,
    ]);
  });

  it('keeps the UI list during plain play and rebuilds the HUD for a new World', () => {
    const s = new Session('game');
    const frame = s.game.renderFrame();
    const ui = frame.ui;
    const revision = ui.revision;
    for (let t = 0; t < 60; t++) {
      s.hold(t % 20 < 10 ? Action.Up : Action.Down);
      s.game.renderFrame();
    }
    expect(ui.revision).toBe(revision);
    const builds = s.flow.game.hud.builds;
    s.press(Action.Pause);
    s.press(Action.Down);
    s.press(Action.Down);
    s.press(Action.Confirm); // RETRY
    expect(s.game.renderFrame().hud).toBe(s.flow.game.hudList);
    expect(s.flow.game.hud.builds).toBeGreaterThan(builds);
  });

  it('two sessions driven through menus, retries and a quit stay in lockstep', () => {
    const run = (): [number, Drained[]] => {
      const s = new Session();
      s.startGame();
      for (let t = 0; t < 150; t++) s.hold(t % 40 < 20 ? Action.Up | Action.Shot : Action.Right);
      s.press(Action.Pause);
      s.press(Action.Down);
      s.press(Action.Down);
      s.press(Action.Confirm); // RETRY
      for (let t = 0; t < 120; t++) s.hold(t % 30 < 15 ? Action.Down : Action.Left);
      s.press(Action.Pause);
      s.press(Action.Up);
      s.press(Action.Confirm);
      s.press(Action.Left);
      s.press(Action.Confirm); // QUIT → title
      s.startGame();
      for (let t = 0; t < 200; t++) s.hold(t % 50 < 25 ? Action.Up : Action.Down);
      return [hashWorld(s.game.world), s.events];
    };
    const [hashA, eventsA] = run();
    const [hashB, eventsB] = run();
    expect(hashA).toBe(hashB);
    expect(eventsA).toEqual(eventsB);
  });
});
