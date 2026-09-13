/**
 * Headless tests of the Options screen and the saves in the scene flow (plan M1-17): OPTIONS opens
 * it from the title and the pause menu; the MASTER / MUSIC / SFX sliders and the CONTROLS profile
 * push `UserOption` events live; BACK and the Back button store the options and write the save only
 * when something changed; the game-over and stage-clear screens insert the score into the saved
 * table; the hi-score persists across a new game instance on the same memory storage.
 */
import { describe, expect, it } from 'vitest';
import type { InputProfileChoice } from '../../src/config/index.js';
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
  BULLET_PALETTE_LABELS,
  GAME_OVER_DELAY_TICKS,
  OptionsItem,
  PAUSE_DIM,
  STAGE_CLEAR_DELAY_TICKS,
  TitleItem,
  type SceneFlow,
} from '../../src/scenes/index.js';
import { addScore } from '../../src/scoring/index.js';

/** The profiles a TV would offer. */
const PROFILES: readonly InputProfileChoice[] = [
  { id: 'tizen-remote-safe', label: 'SAFE 4-WAY (DEFAULT)' },
  { id: 'tizen-remote-diagonal', label: 'FAST 8-WAY' },
];

/** A headless scene-flow session on a storage, with helpers to drive it. */
class Session {
  readonly platform: HeadlessPlatform;
  readonly game: Game;
  readonly flow: SceneFlow;
  readonly save: SaveStore;
  /** Events drained so far: `[kind, id, param]`. */
  readonly events: Array<[number, number, number]> = [];

  constructor(
    save: SaveStore,
    start: 'title' | 'game' = 'title',
    profiles: { choices: readonly InputProfileChoice[]; active: string | null } | null = {
      choices: PROFILES,
      active: 'tizen-remote-safe',
    },
  ) {
    this.platform = createHeadlessPlatform();
    this.save = save;
    // No continues: a game over records the run at once (the M1 flow these tests cover).
    this.game = createGame(this.platform, { seed: 3, continues: 0 }, undefined, {
      scenes: start,
      save,
      inputProfiles: profiles,
    });
    this.flow = this.game.scenes!;
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
   * @param from - First event index.
   * @returns `[kind, value]` pairs.
   */
  options(from = 0): Array<[number, number]> {
    return this.events
      .slice(from)
      .filter((e) => e[0] === SimEventKind.UserOption)
      .map((e) => [e[1], e[2]]);
  }

  /**
   * The sounds since an index.
   *
   * @param from - First event index.
   * @returns SFX cue ids.
   */
  sounds(from = 0): number[] {
    return this.events
      .slice(from)
      .filter((e) => e[0] === SimEventKind.Sfx)
      .map((e) => e[1]);
  }

  /** Opens the title menu and the Options screen, waiting out its open lock. */
  openOptionsFromTitle(): void {
    this.press(Action.Confirm); // PRESS OK → menu
    this.press(Action.Down); // 2 PLAYERS (M2-06)
    this.press(Action.Down); // OPTIONS
    expect(this.flow.title.menu.focus).toBe(TitleItem.Options);
    this.press(Action.Confirm);
    this.hold(0, 2);
  }

  /** The texts of the frame's UI list. */
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
 * A memory storage that counts writes.
 *
 * @returns The storage and its write log.
 */
function countingStorage() {
  const inner = createMemoryStorage();
  const writes: string[] = [];
  const storage: PlatformStorage = {
    get: (key) => inner.get(key),
    set: (key, value) => {
      writes.push(key);
      return inner.set(key, value);
    },
  };
  return { storage, writes };
}

/** Lets the save's pending writes finish. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('core/scenes options: opening and drawing', () => {
  it('opens from the title over the title, dimmed, with the saved volumes', () => {
    const save = createSaveStore(null);
    save.setOptions({
      audio: { master: 6, music: 4, sfx: 9 },
      input: save.options.input,
      display: {
        bulletPalette: 'standard',
        scaleMode: 'integer',
        screenShake: true,
        reduceFlashing: false,
        showHitbox: false,
      },
    });
    const s = new Session(save);
    s.openOptionsFromTitle();
    expect(s.ids).toEqual(['title', 'options']);
    expect(s.game.inputContext).toBe('menu');
    expect(s.game.renderFrame().screen.dim).toBe(PAUSE_DIM);
    const o = s.flow.options;
    expect([o.master.value, o.music.value, o.sfx.value]).toEqual([6, 4, 9]);
    expect(o.menu.focus).toBe(OptionsItem.Master);
    const texts = s.uiTexts();
    expect(texts.slice(texts.lastIndexOf('OPTIONS'))).toEqual([
      'OPTIONS',
      '→',
      'MASTER',
      'MUSIC',
      'SFX',
      'CONTROLS',
      'SAFE 4-WAY (DEFAULT)',
      'BULLETS',
      'STANDARD',
      'SCALE',
      'INTEGER',
      'SHAKE',
      'ON',
      'FLASHES',
      'NORMAL',
      'HITBOX',
      'OFF',
      'BACK',
    ]);
  });

  it('opens from the pause menu over the frozen game', () => {
    const s = new Session(createSaveStore(null), 'game');
    s.hold(0, 10);
    s.press(Action.Pause);
    s.press(Action.Down); // OPTIONS
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['game', 'pause', 'options']);
    const tick = s.game.world.tick;
    s.hold(Action.Down, 30);
    expect(s.game.world.tick).toBe(tick);
    expect(s.game.renderFrame().world).toBe(s.game.world.view);
    s.press(Action.Back);
    expect(s.ids).toEqual(['game', 'pause']);
  });

  it('shows the profile in use and disables CONTROLS without profiles', () => {
    const s = new Session(createSaveStore(null), 'title', {
      choices: PROFILES,
      active: 'tizen-remote-diagonal',
    });
    expect(s.flow.activeInputProfile).toBe(1);
    s.openOptionsFromTitle();
    expect(s.flow.options.controls.label).toBe('FAST 8-WAY');

    const none = new Session(createSaveStore(null), 'title', null);
    expect(none.flow.inputProfiles).toEqual([]);
    expect(none.flow.activeInputProfile).toBe(-1);
    none.openOptionsFromTitle();
    expect(none.flow.options.menu.enabled(OptionsItem.Controls)).toBe(false);
    expect(none.flow.options.controls.label).toBe('DEFAULT');
    none.press(Action.Down);
    none.press(Action.Down);
    none.press(Action.Down); // CONTROLS is skipped
    expect(none.flow.options.menu.focus).toBe(OptionsItem.Bullets);
    for (let i = 0; i < 5; i++) none.press(Action.Down); // SCALE … HITBOX, BACK
    expect(none.flow.options.menu.focus).toBe(OptionsItem.Back);
  });
});

describe('core/scenes options: live changes', () => {
  it('pushes a UserOption event per slider step, with the move sound', () => {
    const s = new Session(createSaveStore(null));
    s.openOptionsFromTitle();
    const from = s.events.length;
    s.press(Action.Left); // MASTER 10 → 9
    s.press(Action.Right); // → 10
    s.press(Action.Right); // at the top: nothing
    s.press(Action.Down);
    s.press(Action.Left); // MUSIC → 9
    s.press(Action.Down);
    s.hold(Action.Left, 18 + 6 * 3); // SFX held: 10 → 9 at once, then after 18, 24, 30, 36 ticks
    s.hold(0);
    expect(s.options(from)).toEqual([
      [UserOptionKind.MasterVolume, 9],
      [UserOptionKind.MasterVolume, 10],
      [UserOptionKind.MusicVolume, 9],
      [UserOptionKind.SfxVolume, 9],
      [UserOptionKind.SfxVolume, 8],
      [UserOptionKind.SfxVolume, 7],
      [UserOptionKind.SfxVolume, 6],
    ]);
    expect(s.flow.options.sfx.value).toBe(6);
    // Every change moved (sound), plus the two focus moves; OK on a slider is silent.
    const before = s.events.length;
    s.press(Action.Confirm);
    expect(s.sounds(before)).toEqual([]);
    expect(s.sounds(from).every((cue) => cue === SFX_CUES.MenuMove)).toBe(true);
  });

  it('steps the input profile with Left / Right / OK (wrapping) and applies it live', () => {
    const s = new Session(createSaveStore(null));
    s.openOptionsFromTitle();
    for (let i = 0; i < 3; i++) s.press(Action.Down);
    expect(s.flow.options.menu.focus).toBe(OptionsItem.Controls);
    const from = s.events.length;
    s.press(Action.Right);
    expect(s.flow.activeInputProfile).toBe(1);
    s.press(Action.Right); // wraps
    s.press(Action.Confirm); // steps forward
    s.press(Action.Left);
    expect(s.options(from)).toEqual([
      [UserOptionKind.InputProfile, 1],
      [UserOptionKind.InputProfile, 0],
      [UserOptionKind.InputProfile, 1],
      [UserOptionKind.InputProfile, 0],
    ]);
    expect(s.uiTexts()).toContain('SAFE 4-WAY (DEFAULT)');
  });
});

describe('core/scenes options: saving', () => {
  it('BULLETS picks the bullet palette live (M2-02), stores it and reopens on it', async () => {
    const { storage } = countingStorage();
    const save = createSaveStore(storage, await loadSave(storage));
    const s = new Session(save);
    s.openOptionsFromTitle();
    for (let i = 0; i < 4; i++) s.press(Action.Down);
    expect(s.flow.options.menu.focus).toBe(OptionsItem.Bullets);
    const from = s.events.length;
    s.press(Action.Right); // DEUTERANOPIA
    s.press(Action.Right); // PROTANOPIA
    s.press(Action.Left); // DEUTERANOPIA
    expect(s.flow.options.bullets.label).toBe('DEUTERANOPIA');
    expect(s.options(from)).toEqual([
      [UserOptionKind.BulletPalette, 1],
      [UserOptionKind.BulletPalette, 2],
      [UserOptionKind.BulletPalette, 1],
    ]);
    s.press(Action.Back);
    expect(save.options.display).toEqual({
      bulletPalette: 'deuteranopia',
      scaleMode: 'integer',
      screenShake: true,
      reduceFlashing: false,
      showHitbox: false,
    });
    s.hold(0, 3);
    s.press(Action.Confirm);
    s.hold(0, 2);
    expect(s.flow.options.bullets.index).toBe(1);
    expect(BULLET_PALETTE_LABELS).toEqual(['STANDARD', 'DEUTERANOPIA', 'PROTANOPIA', 'TRITANOPIA']);
  });

  it('BACK stores the options and writes the save; unchanged options write nothing', async () => {
    const { storage, writes } = countingStorage();
    const save = createSaveStore(storage, await loadSave(storage));
    const s = new Session(save);
    s.openOptionsFromTitle();
    s.press(Action.Down);
    s.press(Action.Left); // MUSIC 9
    for (let i = 0; i < 2; i++) s.press(Action.Down);
    s.press(Action.Right); // CONTROLS → FAST 8-WAY
    s.press(Action.Down); // BULLETS
    for (let i = 0; i < 5; i++) s.press(Action.Down); // SCALE … HITBOX, BACK
    const from = s.events.length;
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title']);
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuBack]);
    expect(save.options).toEqual({
      audio: { master: 10, music: 9, sfx: 10 },
      input: { profileId: 'tizen-remote-diagonal' },
      display: {
        bulletPalette: 'standard',
        scaleMode: 'integer',
        screenShake: true,
        reduceFlashing: false,
        showHitbox: false,
      },
    });
    await settle();
    expect(writes).toEqual([SAVE_STORAGE_KEY]);
    const stored = await loadSave(storage);
    expect(stored.data.options).toEqual(save.options);

    // Opened again (the title menu kept its focus on OPTIONS) and left with Back, nothing
    // changed: no second write.
    s.hold(0, 3);
    s.press(Action.Confirm);
    s.hold(0, 2);
    expect(s.ids).toEqual(['title', 'options']);
    expect(s.flow.options.controls.index).toBe(1);
    s.press(Action.Back);
    expect(s.ids).toEqual(['title']);
    await settle();
    expect(writes).toEqual([SAVE_STORAGE_KEY]);
  });

  it('keeps the saved profile when CONTROLS was not touched', () => {
    const save = createSaveStore(null);
    save.setOptions({ ...save.options, input: { profileId: 'keyboard-remote-emulation' } });
    const s = new Session(save);
    s.openOptionsFromTitle();
    s.press(Action.Left); // MASTER 9
    s.press(Action.Back);
    expect(save.options.input.profileId).toBe('keyboard-remote-emulation');
    expect(save.options.audio.master).toBe(9);
  });
});

describe('core/scenes saves: hi-scores', () => {
  it('starts the title from the saved best of its mode', () => {
    const save = createSaveStore(null);
    save.recordScore('meter-normal', createHiScoreEntry(48000));
    save.recordScore('meter-hard', createHiScoreEntry(99000));
    const s = new Session(save);
    expect(s.flow.modeKey).toBe('meter-normal');
    expect(s.flow.hiScore).toBe(48000);
    s.press(Action.Confirm);
    s.press(Action.Confirm); // START
    s.press(Action.Confirm); // NORMAL
    s.hold(0); // the difficulty menu's lock: the buffered OK acts now
    s.press(Action.Confirm); // START in the weapon select (M2-03)
    s.hold(0);
    expect(s.game.world.scoring.board.hiScore).toBe(48000);
    expect(save.data.stats.gamesStarted).toBe(1);
  });

  it('game over inserts the score into the table and writes the save', async () => {
    const { storage, writes } = countingStorage();
    const save = createSaveStore(storage, await loadSave(storage));
    const s = new Session(save, 'game');
    addScore(s.game.world, 0, 12300);
    s.game.world.status = 'gameOver';
    s.hold(0, GAME_OVER_DELAY_TICKS + 1);
    expect(s.ids).toEqual(['game', 'gameOver']);
    expect(s.flow.gameOver.rank).toBe(0);
    expect(s.uiTexts()).toContain('NEW HI-SCORE');
    expect(save.hiScores('meter-normal')).toEqual([
      { name: '---', score: 12300, reached: '', mode: '1p', difficulty: 'normal' },
    ]);
    expect(save.data.stats).toEqual({ gamesStarted: 1, gameOvers: 1, stagesCleared: 0 });
    await settle();
    expect(writes).toEqual([SAVE_STORAGE_KEY]);
  });

  it('a score below the best enters lower without NEW HI-SCORE; zero enters nowhere', () => {
    const save = createSaveStore(null);
    save.recordScore('meter-normal', createHiScoreEntry(50000));
    const s = new Session(save, 'game');
    addScore(s.game.world, 0, 700);
    s.game.world.status = 'gameOver';
    s.hold(0, GAME_OVER_DELAY_TICKS + 1);
    expect(s.flow.gameOver.rank).toBe(1);
    expect(s.uiTexts()).not.toContain('NEW HI-SCORE');

    const zero = new Session(createSaveStore(null), 'game');
    zero.game.world.status = 'gameOver';
    zero.hold(0, GAME_OVER_DELAY_TICKS + 1);
    expect(zero.flow.gameOver.rank).toBe(-1);
    expect(zero.save.hiScores('meter-normal')).toEqual([]);
    expect(zero.save.data.stats.gameOvers).toBe(1);
  });

  it('stage clear records the run and counts the clear', () => {
    const save = createSaveStore(null);
    const s = new Session(save, 'game');
    addScore(s.game.world, 0, 4000);
    s.game.world.status = 'stageClear';
    s.hold(0, STAGE_CLEAR_DELAY_TICKS + 1);
    expect(s.ids).toEqual(['game', 'stageClear']);
    expect(s.flow.stageClear.rank).toBe(0);
    expect(save.bestScore('meter-normal')).toBe(4000);
    expect(save.data.stats.stagesCleared).toBe(1);
  });

  it('the hi-score persists across a new game instance on the same memory storage', async () => {
    const storage = createMemoryStorage();
    const first = new Session(createSaveStore(storage, await loadSave(storage)), 'game');
    addScore(first.game.world, 0, 31400);
    first.game.world.status = 'gameOver';
    first.hold(0, GAME_OVER_DELAY_TICKS + 1);
    await settle();

    const loaded = await loadSave(storage);
    expect(loaded.status).toBe('ok');
    const second = new Session(createSaveStore(storage, loaded));
    expect(second.flow.hiScore).toBe(31400);
    second.press(Action.Confirm);
    second.press(Action.Confirm); // START
    second.press(Action.Confirm); // NORMAL
    second.hold(0);
    second.press(Action.Confirm); // START in the weapon select (M2-03)
    second.hold(0);
    expect(second.game.world.scoring.board.hiScore).toBe(31400);
    expect(second.save.hiScores('meter-normal').map((r) => r.score)).toEqual([31400]);
  });
});

describe('core/scenes options: display options (plan M2-08)', () => {
  it('shows SCALE, SHAKE, FLASHES and HITBOX, pushes each change live and saves them on BACK', async () => {
    const { storage } = countingStorage();
    const save = createSaveStore(storage, await loadSave(storage));
    const s = new Session(save);
    s.openOptionsFromTitle();
    const o = s.flow.options;
    expect([o.scale.label, o.shake.value, o.flashes.label, o.hitbox.value]).toEqual([
      'INTEGER',
      true,
      'NORMAL',
      false,
    ]);
    for (let i = 0; i < OptionsItem.Scale; i++) s.press(Action.Down);
    expect(o.menu.focus).toBe(OptionsItem.Scale);
    const from = s.events.length;
    s.press(Action.Right); // FIT
    s.press(Action.Right); // STRETCH
    s.press(Action.Down);
    s.press(Action.Left); // SHAKE OFF
    s.press(Action.Down);
    s.press(Action.Right); // FLASHES REDUCED
    s.press(Action.Down);
    s.press(Action.Confirm); // HITBOX flips ON
    expect(s.options(from)).toEqual([
      [UserOptionKind.ScaleMode, 1],
      [UserOptionKind.ScaleMode, 2],
      [UserOptionKind.ScreenShake, 0],
      [UserOptionKind.ReduceFlashing, 1],
      [UserOptionKind.ShowHitbox, 1],
    ]);
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['STRETCH', 'OFF', 'REDUCED', 'ON']));
    s.press(Action.Down);
    expect(o.menu.focus).toBe(OptionsItem.Back);
    s.press(Action.Confirm);
    expect(save.options.display).toEqual({
      bulletPalette: 'standard',
      scaleMode: 'stretch',
      screenShake: false,
      reduceFlashing: true,
      showHitbox: true,
    });
    await settle();
    // The next session reads them back into the screen.
    const again = new Session(createSaveStore(storage, await loadSave(storage)));
    again.openOptionsFromTitle();
    const a = again.flow.options;
    expect([a.scale.label, a.shake.value, a.flashes.label, a.hitbox.value]).toEqual([
      'STRETCH',
      false,
      'REDUCED',
      true,
    ]);
  });
});
