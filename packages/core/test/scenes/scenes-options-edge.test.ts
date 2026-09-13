/**
 * Edge cases of the Options screen and the saves in the scene flow (plan M1-17): leaving the
 * screen back to the pause menu, Back during the open lock, sliders at their ends, a single
 * profile, a profile stepped away and back, an unknown active profile, re-reading the save on every
 * open; the arcade rule (quitting or RETRY STAGE records nothing), the game-start counter, a
 * non-default difficulty's table, the stage reached, repeated game overs and a failing storage.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { InputProfileChoice } from '../../src/config/index.js';
import { loadContent, type ContentDb } from '../../src/data/index.js';
import { SFX_CUES, SimEventKind, UserOptionKind } from '../../src/events/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import {
  createHeadlessPlatform,
  createMemoryStorage,
  type HeadlessPlatform,
  type PlatformStorage,
} from '../../src/platform/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import {
  SAVE_STORAGE_KEY,
  createHiScoreEntry,
  createSaveStore,
  loadSave,
  type SaveStore,
} from '../../src/save/index.js';
import {
  GAME_OVER_DELAY_TICKS,
  GAME_OVER_LOCK_TICKS,
  OptionsItem,
  PauseItem,
  STAGE_CLEAR_DELAY_TICKS,
  TitleItem,
  type InputProfileSetup,
  type SceneFlow,
} from '../../src/scenes/index.js';
import { addScore } from '../../src/scoring/index.js';
import { ConfirmChoice } from '../../src/ui/index.js';

/** Two profiles, the first the platform default. */
const PROFILES: readonly InputProfileChoice[] = [
  { id: 'keyboard-default', label: 'KEYBOARD (DEFAULT)' },
  { id: 'keyboard-remote-emulation', label: 'KEYBOARD AS REMOTE' },
];

/** Session options. */
interface SessionOptions {
  /** First scene. */
  readonly start?: 'title' | 'game';
  /** Input profiles (default {@link PROFILES}, active the first). */
  readonly profiles?: InputProfileSetup | null;
  /** Config overrides. */
  readonly config?: Record<string, unknown>;
  /** Content. */
  readonly content?: ContentDb;
}

/** A headless scene-flow session with helpers. */
class Session {
  readonly platform: HeadlessPlatform = createHeadlessPlatform();
  readonly game: Game;
  readonly flow: SceneFlow;
  /** Drained events `[kind, id, param]`. */
  readonly events: Array<[number, number, number]> = [];

  constructor(
    readonly save: SaveStore,
    options: SessionOptions = {},
  ) {
    // No continues unless a test asks: a game over records the run at once (M1 flow).
    this.game = createGame(
      this.platform,
      { seed: 5, continues: 0, ...options.config },
      options.content,
      {
        scenes: options.start ?? 'title',
        save,
        inputProfiles:
          options.profiles === undefined
            ? { choices: PROFILES, active: 'keyboard-default' }
            : options.profiles,
      },
    );
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

  /**
   * The `UserOption` events since an index.
   *
   * @param from - First index.
   * @returns `[kind, value]`.
   */
  options(from = 0): Array<[number, number]> {
    return this.events
      .slice(from)
      .filter((e) => e[0] === SimEventKind.UserOption)
      .map((e) => [e[1], e[2]]);
  }

  /**
   * The SFX cues since an index.
   *
   * @param from - First index.
   * @returns Cue ids.
   */
  sounds(from = 0): number[] {
    return this.events
      .slice(from)
      .filter((e) => e[0] === SimEventKind.Sfx)
      .map((e) => e[1]);
  }

  /** Title → menu → OPTIONS, past its open lock. */
  openFromTitle(): void {
    this.press(Action.Confirm);
    this.press(Action.Down); // 2 PLAYERS (M2-06)
    this.press(Action.Down);
    expect(this.flow.title.menu.focus).toBe(TitleItem.Options);
    this.press(Action.Confirm);
    this.hold(0, 2);
    expect(this.ids).toEqual(['title', 'options']);
  }

  /**
   * Focuses an Options item from MASTER (the focus on opening).
   *
   * @param item - An {@link OptionsItem}.
   */
  focus(item: number): void {
    for (let i = 0; i < item; i++) this.press(Action.Down);
    expect(this.flow.options.menu.focus).toBe(item);
  }

  /** Ends the game on the game-over screen. */
  gameOver(): void {
    this.game.world.status = 'gameOver';
    this.hold(0, GAME_OVER_DELAY_TICKS + 1);
    expect(this.ids).toEqual(['game', 'gameOver']);
  }

  /** The texts of the frame's UI list. */
  uiTexts(): string[] {
    const ui = this.game.renderFrame().ui;
    const out: string[] = [];
    for (let i = 0; i < ui.count; i++)
      if (ui.op[i] === DrawOp.Text) out.push(ui.strings[ui.ref[i]]);
    return out;
  }
}

/** Lets pending storage writes finish. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A memory storage counting writes, optionally failing them.
 *
 * @returns The storage, its write log and the failure switch.
 */
function countingStorage() {
  const inner = createMemoryStorage();
  const writes: string[] = [];
  const state = { fail: false };
  const storage: PlatformStorage = {
    get: (key) => inner.get(key),
    set: (key, value) => {
      if (state.fail) return Promise.reject(new Error('quota'));
      writes.push(key);
      return inner.set(key, value);
    },
  };
  return { storage, writes, state, inner };
}

/**
 * Reads a shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The parsed JSON.
 */
function shipped(path: string): unknown {
  return JSON.parse(
    readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
  ) as unknown;
}

/**
 * Content with the KESTREL and a short open-space stage `range-t`.
 *
 * @returns The DB.
 */
function stageDb(): ContentDb {
  const { db, issues } = loadContent([
    { path: 'player/kestrel.player.json', data: shipped('player/kestrel.player.json') },
    { path: 'tilesets/terrain-a.tileset.json', data: shipped('tilesets/terrain-a.tileset.json') },
    {
      path: 'stages/range-t.stage.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 'range-t',
        name: 'RANGE T',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 3000,
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [{ x: 0 }],
        parallax: [{ layer: 'far', sprite: 'bg/stars-far', factor: 0.5, y: 0, spacing: 128 }],
        tilemap: {
          tileSize: 8,
          tileset: 'terrain-a',
          rowsTall: 25,
          generator: {
            type: 'heightfield',
            segments: [{ from: 0, to: 3384, floor: { base: 48, amp: 0, period: 64, seed: 1 } }],
          },
        },
        events: [{ x: 3000, type: 'end' }],
      },
    },
  ]);
  expect(issues).toEqual([]);
  return db;
}

describe('core/scenes options (edge): opening and closing', () => {
  it('from the pause menu BACK returns to the pause menu, saves, and the game resumes', async () => {
    const { storage, writes } = countingStorage();
    const save = createSaveStore(storage, await loadSave(storage));
    const s = new Session(save, { start: 'game' });
    s.hold(0, 10);
    s.press(Action.Pause);
    s.press(Action.Down);
    s.press(Action.Confirm);
    s.hold(0, 2);
    expect(s.ids).toEqual(['game', 'pause', 'options']);
    s.focus(OptionsItem.Sfx);
    s.press(Action.Left); // SFX 9
    // Past CONTROLS, BULLETS (M2-02) and the display rows (M2-08).
    for (let i = 0; i < 7; i++) s.press(Action.Down);
    expect(s.flow.options.menu.focus).toBe(OptionsItem.Back);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['game', 'pause']);
    expect(s.flow.pause.menu.focus).toBe(PauseItem.Options);
    expect(save.options.audio.sfx).toBe(9);
    await settle();
    expect(writes).toEqual([SAVE_STORAGE_KEY]);
    // Resume: the game ticks again.
    const tick = s.game.world.tick;
    s.press(Action.Pause);
    expect(s.ids).toEqual(['game']);
    s.hold(0, 5);
    expect(s.game.world.tick).toBeGreaterThan(tick);
  });

  it('Back closes the screen even during its open lock, storing the options', () => {
    const save = createSaveStore(null);
    const s = new Session(save);
    s.press(Action.Confirm);
    s.press(Action.Down); // 2 PLAYERS (M2-06)
    s.press(Action.Down);
    s.press(Action.Confirm); // opens; locked for two ticks
    expect(s.ids).toEqual(['title', 'options']);
    const from = s.events.length;
    s.press(Action.Back);
    expect(s.ids).toEqual(['title']);
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuBack]);
    expect(save.options).toEqual({
      audio: { master: 10, music: 10, sfx: 10 },
      input: { profileId: null },
      display: {
        bulletPalette: 'standard',
        scaleMode: 'integer',
        screenShake: true,
        reduceFlashing: false,
        showHitbox: false,
      },
    });
  });

  it('re-reads the save on every open and focuses MASTER again', () => {
    const save = createSaveStore(null);
    const s = new Session(save);
    s.openFromTitle();
    s.focus(OptionsItem.Controls);
    s.press(Action.Back);
    save.setOptions({ ...save.options, audio: { master: 1, music: 2, sfx: 3 } });
    s.hold(0, 3);
    s.press(Action.Confirm); // the title menu kept its focus on OPTIONS
    s.hold(0, 2);
    const o = s.flow.options;
    expect([o.master.value, o.music.value, o.sfx.value]).toEqual([1, 2, 3]);
    expect(o.menu.focus).toBe(OptionsItem.Master);
  });

  it('shows the chosen profile label and updates it when CONTROLS changes', () => {
    const s = new Session(createSaveStore(null));
    s.openFromTitle();
    expect(s.uiTexts()).toContain('KEYBOARD (DEFAULT)');
    s.focus(OptionsItem.Controls);
    s.press(Action.Right);
    const texts = s.uiTexts();
    expect(texts).toContain('KEYBOARD AS REMOTE');
    expect(texts).not.toContain('KEYBOARD (DEFAULT)');
  });
});

describe('core/scenes options (edge): sliders and profiles', () => {
  it('a slider at 0 ignores Left: no event, no sound', () => {
    const save = createSaveStore(null);
    save.setOptions({ ...save.options, audio: { master: 0, music: 10, sfx: 10 } });
    const s = new Session(save);
    s.openFromTitle();
    const from = s.events.length;
    s.press(Action.Left);
    expect(s.options(from)).toEqual([]);
    expect(s.sounds(from)).toEqual([]);
    s.press(Action.Right);
    expect(s.options(from)).toEqual([[UserOptionKind.MasterVolume, 1]]);
  });

  it('runs a slider from 10 down to 0 with one event per level', () => {
    const s = new Session(createSaveStore(null));
    s.openFromTitle();
    s.focus(OptionsItem.Music);
    const from = s.events.length;
    for (let i = 0; i < 12; i++) s.press(Action.Left);
    expect(s.options(from).map(([, v]) => v)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(s.options(from).every(([k]) => k === UserOptionKind.MusicVolume)).toBe(true);
    s.press(Action.Back);
    expect(s.save.options.audio.music).toBe(0);
  });

  it('a single profile: CONTROLS is enabled but never changes, and OK on it is silent', () => {
    const s = new Session(createSaveStore(null), {
      profiles: { choices: [PROFILES[0]], active: PROFILES[0].id },
    });
    s.openFromTitle();
    expect(s.flow.options.menu.enabled(OptionsItem.Controls)).toBe(true);
    s.focus(OptionsItem.Controls);
    const from = s.events.length;
    s.press(Action.Left);
    s.press(Action.Right);
    s.press(Action.Confirm);
    expect(s.options(from)).toEqual([]);
    expect(s.sounds(from)).toEqual([]);
    expect(s.ids).toEqual(['title', 'options']);
  });

  it('a profile stepped away and back is applied live but not stored', () => {
    const save = createSaveStore(null);
    const s = new Session(save);
    s.openFromTitle();
    s.focus(OptionsItem.Controls);
    const from = s.events.length;
    s.press(Action.Right);
    s.press(Action.Left);
    expect(s.options(from)).toEqual([
      [UserOptionKind.InputProfile, 1],
      [UserOptionKind.InputProfile, 0],
    ]);
    expect(s.flow.activeInputProfile).toBe(0);
    s.press(Action.Back);
    expect(save.options.input.profileId).toBeNull(); // still the platform's default
  });

  it('an unknown active profile shows the first choice; a pick is stored by id', () => {
    const save = createSaveStore(null);
    const s = new Session(save, { profiles: { choices: PROFILES, active: 'gone-profile' } });
    expect(s.flow.activeInputProfile).toBe(-1);
    s.openFromTitle();
    expect(s.flow.options.controls.index).toBe(0);
    s.press(Action.Back);
    expect([save.options.input.profileId, s.flow.activeInputProfile]).toEqual([null, -1]);
    s.hold(0, 3);
    s.press(Action.Confirm);
    s.hold(0, 2);
    s.focus(OptionsItem.Controls);
    s.press(Action.Right);
    expect(s.flow.activeInputProfile).toBe(1);
    s.press(Action.Back);
    expect(save.options.input.profileId).toBe('keyboard-remote-emulation');
  });

  it('a null active profile (the adapter’s built-in keys) counts as none of the choices', () => {
    const s = new Session(createSaveStore(null), { profiles: { choices: PROFILES, active: null } });
    expect(s.flow.activeInputProfile).toBe(-1);
    expect(s.flow.inputProfiles).toBe(PROFILES);
  });

  it('an empty choice list disables CONTROLS like no profiles at all', () => {
    const s = new Session(createSaveStore(null), { profiles: { choices: [], active: null } });
    s.openFromTitle();
    expect(s.flow.options.menu.enabled(OptionsItem.Controls)).toBe(false);
    expect(s.flow.options.controls.labels).toEqual(['DEFAULT']);
  });
});

describe('core/scenes saves (edge): what counts as a finished game', () => {
  it('QUIT TO TITLE records nothing (arcade rule) but the start is counted', async () => {
    const { storage, writes } = countingStorage();
    const save = createSaveStore(storage, await loadSave(storage));
    const s = new Session(save);
    s.press(Action.Confirm);
    s.press(Action.Confirm); // START
    s.press(Action.Confirm); // NORMAL
    s.hold(0); // the difficulty menu's lock: the buffered OK acts now
    s.press(Action.Confirm); // START in the weapon select (M2-03)
    s.hold(0);
    expect(s.ids).toEqual(['game']);
    addScore(s.game.world, 0, 9000);
    s.press(Action.Pause);
    s.press(Action.Up); // → QUIT
    s.press(Action.Confirm);
    s.press(Action.Left); // YES
    expect(s.flow.confirm.prompt.focus).toBe(ConfirmChoice.Yes);
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title']);
    expect(save.hiScores('meter-normal')).toEqual([]);
    expect(save.data.stats).toEqual({ gamesStarted: 1, gameOvers: 0, stagesCleared: 0 });
    await settle();
    expect(writes).toEqual([]); // nothing ended: nothing written yet
    // The session HI still takes the quit game's score (the title shows it), the save does not.
    expect(s.flow.hiScore).toBe(9000);
  });

  it('RETRY STAGE records nothing and counts another start', () => {
    const save = createSaveStore(null);
    const s = new Session(save, { start: 'game' });
    addScore(s.game.world, 0, 5000);
    s.press(Action.Pause);
    s.press(Action.Down);
    s.press(Action.Down); // RETRY
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['game']);
    expect(save.hiScores('meter-normal')).toEqual([]);
    expect(save.data.stats.gamesStarted).toBe(2);
    // The retried game's HUD HI starts from the retried score (session hi-score).
    expect(s.game.world.scoring.board.hiScore).toBe(5000);
  });

  it('a Hard game goes into the meter-hard table with its difficulty', () => {
    const save = createSaveStore(null);
    save.recordScore('meter-hard', createHiScoreEntry(700));
    save.recordScore('meter-normal', createHiScoreEntry(90000));
    const s = new Session(save, { start: 'game', config: { difficulty: 'hard' } });
    expect(s.flow.modeKey).toBe('meter-hard');
    expect(s.flow.hiScore).toBe(700);
    addScore(s.game.world, 0, 800);
    s.gameOver();
    expect(s.flow.gameOver.rank).toBe(0);
    expect(save.hiScores('meter-hard')[0]).toEqual({
      name: '---',
      score: 800,
      reached: '',
      mode: '1p',
      difficulty: 'hard',
    });
    expect(save.bestScore('meter-normal')).toBe(90000);
  });

  it('records the stage the run reached', () => {
    const save = createSaveStore(null);
    const s = new Session(save, {
      start: 'game',
      config: { stage: 'range-t' },
      content: stageDb(),
    });
    addScore(s.game.world, 0, 1500);
    s.gameOver();
    expect(save.hiScores('meter-normal')[0].reached).toBe('range-t');
  });

  it('repeated game overs: one row and one write each; the rank resets per game', async () => {
    const { storage, writes } = countingStorage();
    const save = createSaveStore(storage, await loadSave(storage));
    const s = new Session(save, { start: 'game' });
    addScore(s.game.world, 0, 2000);
    s.gameOver();
    expect(s.flow.gameOver.rank).toBe(0);
    await settle();
    s.hold(0, GAME_OVER_LOCK_TICKS + 1);
    s.press(Action.Confirm); // → title
    expect(s.ids).toEqual(['title']);
    expect(s.flow.hiScore).toBe(2000);
    s.press(Action.Confirm);
    s.press(Action.Confirm); // START
    s.press(Action.Confirm); // NORMAL
    s.hold(0);
    s.press(Action.Confirm); // START in the weapon select (M2-03)
    s.hold(0);
    addScore(s.game.world, 0, 100);
    s.gameOver();
    expect(s.flow.gameOver.rank).toBe(1);
    expect(s.uiTexts()).not.toContain('NEW HI-SCORE');
    await settle();
    expect(writes).toEqual([SAVE_STORAGE_KEY, SAVE_STORAGE_KEY]);
    expect(save.hiScores('meter-normal').map((r) => r.score)).toEqual([2000, 100]);
    expect(save.data.stats).toEqual({ gamesStarted: 2, gameOvers: 2, stagesCleared: 0 });
  });

  it('a failing storage never breaks the flow; the next end writes everything', async () => {
    const { storage, writes, state, inner } = countingStorage();
    const save = createSaveStore(storage, await loadSave(storage));
    const s = new Session(save, { start: 'game' });
    state.fail = true;
    addScore(s.game.world, 0, 3000);
    s.gameOver();
    await settle();
    expect(writes).toEqual([]);
    expect(save.dirty).toBe(true);
    state.fail = false;
    s.hold(0, GAME_OVER_LOCK_TICKS + 1);
    s.press(Action.Confirm);
    s.press(Action.Confirm);
    s.press(Action.Confirm); // START
    s.press(Action.Confirm); // NORMAL
    s.hold(0);
    s.press(Action.Confirm); // START in the weapon select (M2-03)
    s.hold(0);
    s.game.world.status = 'stageClear';
    s.hold(0, STAGE_CLEAR_DELAY_TICKS + 1);
    await settle();
    expect(writes).toEqual([SAVE_STORAGE_KEY]);
    const stored = await loadSave(inner);
    expect(stored.data.hiScores['meter-normal'].map((r) => r.score)).toEqual([3000]);
    expect(stored.data.stats).toEqual({ gamesStarted: 2, gameOvers: 1, stagesCleared: 1 });
  });

  it('the title of a new flow on the same save shows a best made in an earlier session', () => {
    const save = createSaveStore(null);
    const first = new Session(save, { start: 'game' });
    addScore(first.game.world, 0, 4400);
    first.gameOver();
    const second = new Session(save);
    expect(second.flow.hiScore).toBe(4400);
    expect(second.game.world.scoring.board.hiScore).toBe(4400);
  });
});
