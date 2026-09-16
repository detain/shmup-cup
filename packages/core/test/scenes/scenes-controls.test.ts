/**
 * Headless tests of the Options screen's pages of plan M2-16 in the scene flow: the CONTROLS page
 * (autofire mode and rate reaching the next games' configs — never the World in play —, SOCD and
 * debounce stored at once and applied live, the rebind rows opening the rebind screen), the GAME
 * page (difficulty, lives, death penalty, Auto Power-Up, magnet and the one-button preset reaching
 * the configs; the difficulty menu's choice remembered), the rebind screen over a fake host
 * (capture → bind with its outcome, cancel, timeout, the wait for a release, reset, the context,
 * DONE) and the input test (the gameplay context, lit actions, hold Pause to leave).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_OPTIONS, type InputProfileChoice } from '../../src/config/index.js';
import { SimEventKind, UserOptionKind } from '../../src/events/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import {
  Action,
  commitPlayerInput,
  type ActionMask,
  type ActionName,
  type InputContext,
} from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import { createSaveStore, type SaveStore } from '../../src/save/index.js';
import {
  ControlsItem,
  GameOptionsItem,
  INPUT_TEST_EXIT_PRESSES,
  INPUT_TEST_EXIT_TICKS,
  INPUT_TEST_EXIT_WINDOW_TICKS,
  OptionsItem,
  TitleItem,
  WeaponSelectItem,
  type ControlsSetup,
  type RebindDevice,
  type RebindOutcome,
  type SceneFlow,
} from '../../src/scenes/index.js';
import { CaptureStatus, REBIND_CAPTURE_TICKS, RebindStatus } from '../../src/ui/index.js';

/** Two keyboard profiles. */
const PROFILES: readonly InputProfileChoice[] = [
  { id: 'keyboard-default', label: 'KEYBOARD (DEFAULT)' },
  { id: 'keyboard-remote-emulation', label: 'KEYBOARD AS REMOTE' },
];

/** A fake host side of the rebind screen: records the calls, answers what a test sets. */
class FakeControls implements ControlsSetup {
  /** The devices offered. */
  list: RebindDevice[] = [
    { id: 'keyboard-default', kind: 'keyboard' },
    { id: 'gamepad-standard', kind: 'gamepad' },
  ];
  /** The capture's state. */
  status: number = CaptureStatus.Idle;
  /** What the next bind answers. */
  outcome: RebindOutcome = { status: RebindStatus.Bound, other: null };
  /** Every call: `[method, …args]`. */
  readonly calls: Array<Array<string | number | null>> = [];
  /** Labels by `device/context/action`. */
  readonly labels = new Map<string, string>();

  devices(): readonly RebindDevice[] {
    return this.list;
  }
  keysLabel(device: number, context: InputContext, action: ActionName): string {
    return this.labels.get(`${device}/${context}/${action}`) ?? `${action.toUpperCase()}-KEY`;
  }
  beginCapture(device: number): void {
    this.calls.push(['begin', device]);
    this.status = CaptureStatus.Waiting;
  }
  pollCapture(): number {
    return this.status;
  }
  endCapture(): void {
    this.calls.push(['end']);
    this.status = CaptureStatus.Idle;
  }
  bindCaptured(device: number, context: InputContext, action: ActionName): RebindOutcome {
    this.calls.push(['bind', device, context, action]);
    this.labels.set(`${device}/${context}/${action}`, 'J');
    return this.outcome;
  }
  reset(device: number, context: InputContext): void {
    this.calls.push(['reset', device, context]);
    this.labels.clear();
  }
}

/** A headless scene-flow session with helpers. */
class Session {
  readonly platform: HeadlessPlatform = createHeadlessPlatform();
  readonly game: Game;
  readonly flow: SceneFlow;
  /** Drained events `[kind, id, param]`. */
  readonly events: Array<[number, number, number]> = [];

  constructor(
    readonly save: SaveStore = createSaveStore(null),
    readonly controls: FakeControls | null = new FakeControls(),
    config: Record<string, unknown> = { remoteMode: false },
  ) {
    this.game = createGame(this.platform, { seed: 9, continues: 0, ...config }, undefined, {
      scenes: 'title',
      save,
      inputProfiles: { choices: PROFILES, active: 'keyboard-default' },
      controls,
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

  /** Title → menu → OPTIONS, past its lock. */
  openOptions(): void {
    this.press(Action.Confirm);
    while (this.flow.title.menu.focus !== TitleItem.Options) this.press(Action.Down);
    this.press(Action.Confirm);
    this.hold(0, 2);
  }

  /**
   * From the Options screen: opens a page.
   *
   * @param item - An `OptionsItem` page row.
   */
  openPage(item: number): void {
    while (this.flow.options.menu.focus !== item) this.press(Action.Down);
    this.press(Action.Confirm);
    this.hold(0, 2);
  }

  /**
   * Focuses a row of the top scene's menu (the CONTROLS or GAME page).
   *
   * @param menu - The page's menu.
   * @param menu.focus - Its focus.
   * @param item - The row.
   */
  focus(menu: { focus: number }, item: number): void {
    while (menu.focus !== item) this.press(Action.Down);
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

describe('core/scenes CONTROLS page (M2-16)', () => {
  it('shows the rows with the next game’s autofire; the remote host disables AUTOFIRE', () => {
    const s = new Session();
    s.openOptions();
    s.openPage(OptionsItem.Controls);
    expect(s.ids).toEqual(['title', 'options', 'controls']);
    const page = s.flow.controlsPage;
    expect([page.autofire.label, page.rate.label, page.socd.label, page.debounce.label]).toEqual([
      'ALWAYS',
      '15/S',
      'PROFILE',
      'AUTO',
    ]);
    expect(s.uiTexts()).toEqual(
      expect.arrayContaining(['PROFILE', 'AUTOFIRE', 'RATE', 'SOCD', 'DEBOUNCE', 'REBIND KEYS']),
    );
    for (const row of [ControlsItem.Autofire, ControlsItem.Keys, ControlsItem.Pad]) {
      expect(page.menu.enabled(row)).toBe(true);
    }
    const tv = new Session(createSaveStore(null), new FakeControls(), { remoteMode: true });
    tv.openOptions();
    tv.openPage(OptionsItem.Controls);
    expect(tv.flow.controlsPage.menu.enabled(ControlsItem.Autofire)).toBe(false);
    // Only a gamepad to rebind: REBIND KEYS is off.
    const padOnly = new FakeControls();
    padOnly.list = [{ id: 'gamepad-standard', kind: 'gamepad' }];
    const pads = new Session(createSaveStore(null), padOnly);
    pads.openOptions();
    pads.openPage(OptionsItem.Controls);
    expect(pads.flow.controlsPage.menu.enabled(ControlsItem.Keys)).toBe(false);
    expect(pads.flow.controlsPage.menu.enabled(ControlsItem.Pad)).toBe(true);
  });

  it('stores AUTOFIRE and RATE on BACK: the next game plays them, the World in play does not', () => {
    const save = createSaveStore(null);
    const s = new Session(save);
    const before = s.flow.gameConfig;
    s.openOptions();
    s.openPage(OptionsItem.Controls);
    const page = s.flow.controlsPage;
    s.focus(page.menu, ControlsItem.Autofire);
    s.press(Action.Right); // TOGGLE
    s.press(Action.Down);
    s.press(Action.Right); // 20/S
    expect([page.autofire.label, page.rate.label]).toEqual(['TOGGLE', '20/S']);
    const from = s.events.length;
    s.press(Action.Back);
    // Sim-affecting: nothing live.
    expect(s.options(from)).toEqual([]);
    expect(save.options.input).toMatchObject({ autofire: 'toggle', autofireInterval: 3 });
    expect(s.flow.gameConfig).not.toBe(before);
    expect(s.flow.gameConfig).toMatchObject({ autofireMode: 'toggle', autofireInterval: 3 });
    // A new flow on the save plays them too; an untouched page stores nothing new.
    const again = new Session(save);
    expect(again.flow.gameConfig).toMatchObject({ autofireMode: 'toggle', autofireInterval: 3 });
    again.openOptions();
    again.openPage(OptionsItem.Controls);
    again.press(Action.Back);
    expect(save.options.input.autofire).toBe('toggle');
  });

  it('applies to a RETRY STAGE, never to the World being played', () => {
    const s = new Session();
    s.press(Action.Confirm);
    s.press(Action.Confirm); // 1 PLAYER
    s.press(Action.Confirm); // NORMAL
    s.hold(0);
    s.press(Action.Confirm); // START in the weapon select
    s.hold(0, 5);
    expect(s.ids).toEqual(['game']);
    const world = s.game.world;
    s.press(Action.Pause);
    s.press(Action.Down); // OPTIONS
    s.press(Action.Confirm);
    s.hold(0, 2);
    s.openPage(OptionsItem.Controls);
    s.focus(s.flow.controlsPage.menu, ControlsItem.Autofire);
    s.press(Action.Left); // HOLD (wraps back)
    s.press(Action.Back);
    s.hold(0, 2);
    s.press(Action.Back); // the Options screen
    expect(s.ids).toEqual(['game', 'pause']);
    expect(s.game.world).toBe(world);
    expect(world.config.autofireMode).toBe('always');
    s.hold(0, 2);
    s.press(Action.Down); // RETRY STAGE (the pause menu kept its focus on OPTIONS)
    s.press(Action.Confirm);
    expect(s.game.world).not.toBe(world);
    expect(s.game.world.config.autofireMode).toBe('hold');
  });

  it('stores SOCD and DEBOUNCE at once and pushes InputSettings live', () => {
    const save = createSaveStore(null);
    const s = new Session(save);
    s.openOptions();
    s.openPage(OptionsItem.Controls);
    const page = s.flow.controlsPage;
    s.focus(page.menu, ControlsItem.Socd);
    const from = s.events.length;
    s.press(Action.Right); // NEUTRAL
    s.press(Action.Right); // LAST WINS
    expect(save.options.input.socd).toBe('lastWins');
    s.press(Action.Down);
    s.press(Action.Right); // 0 TICKS
    s.press(Action.Right); // 1 TICKS
    expect(save.options.input.releaseDebounce).toBe(1);
    s.press(Action.Left);
    s.press(Action.Left); // AUTO
    expect(save.options.input.releaseDebounce).toBeNull();
    expect(s.options(from)).toEqual([
      [UserOptionKind.InputSettings, 0],
      [UserOptionKind.InputSettings, 0],
      [UserOptionKind.InputSettings, 0],
      [UserOptionKind.InputSettings, 0],
      [UserOptionKind.InputSettings, 0],
      [UserOptionKind.InputSettings, 0],
    ]);
    // Reopened, the page shows them.
    s.press(Action.Back);
    s.hold(0, 3);
    s.press(Action.Confirm);
    s.hold(0, 2);
    expect([page.socd.label, page.debounce.label]).toEqual(['LAST WINS', 'AUTO']);
  });

  it('opens the rebind screen for the keyboard and for the gamepad, and the input test', () => {
    const s = new Session();
    s.openOptions();
    s.openPage(OptionsItem.Controls);
    const page = s.flow.controlsPage;
    s.focus(page.menu, ControlsItem.Keys);
    s.press(Action.Confirm);
    s.hold(0, 2);
    expect(s.ids).toEqual(['title', 'options', 'controls', 'rebind']);
    expect(s.uiTexts()).toContain('KEYBOARD CONTROLS');
    expect(s.flow.rebind.device).toBe(0);
    s.press(Action.Back);
    expect(s.ids).toEqual(['title', 'options', 'controls']);
    s.hold(0, 2);
    s.press(Action.Down); // REBIND PAD
    s.press(Action.Confirm);
    s.hold(0, 2);
    expect(s.flow.rebind.device).toBe(1);
    expect(s.uiTexts()).toContain('GAMEPAD CONTROLS');
    s.press(Action.Back);
    s.hold(0, 2);
    s.press(Action.Down); // INPUT TEST
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title', 'options', 'controls', 'inputTest']);
  });
});

describe('core/scenes GAME page (M2-16)', () => {
  it('reaches the next games’ configs: difficulty, lives, penalty, Auto Power-Up, magnet', () => {
    const save = createSaveStore(null);
    const s = new Session(save);
    expect(s.flow.gameConfig).toMatchObject({ difficulty: 'normal', startingLives: 3 });
    s.openOptions();
    s.openPage(OptionsItem.Game);
    expect(s.ids).toEqual(['title', 'options', 'gameOptions']);
    const page = s.flow.gameOptionsPage;
    expect([page.difficulty.label, page.lives.label, page.penalty.label]).toEqual([
      'NORMAL',
      'PRESET',
      'PRESET',
    ]);
    expect([page.autoPowerUp.value, page.magnet.value, page.oneButton.value]).toEqual([
      false,
      true,
      false,
    ]);
    s.press(Action.Right); // HARD
    s.press(Action.Down);
    s.press(Action.Left); // LIVES 5 (wraps from PRESET)
    s.press(Action.Down);
    s.press(Action.Left); // PENALTY CASUAL (wraps)
    s.press(Action.Down);
    s.press(Action.Right); // AUTO POWER on
    s.press(Action.Down);
    s.press(Action.Left); // MAGNET off
    s.press(Action.Back);
    expect(save.options.game).toEqual({
      difficulty: 'hard',
      lives: 5,
      deathPenalty: 'casual',
      autoPowerUp: true,
      pickupMagnet: false,
      oneButton: false,
    });
    expect(s.flow.difficulty).toBe('hard');
    expect(s.flow.gameConfig).toMatchObject({
      difficulty: 'hard',
      startingLives: 5,
      deathPenalty: 'casual',
      autoPowerUp: true,
      pickupMagnet: false,
    });
    // Every preset's config gets them (the difficulty menu may still pick another).
    expect(s.flow.difficulty).toBe('hard');
    const fresh = new Session(save);
    expect(fresh.flow.difficulty).toBe('hard');
    expect(fresh.flow.gameConfig.startingLives).toBe(5);
  });

  it('the one-button preset forces autofire, Auto Power-Up and the casual penalty', () => {
    const save = createSaveStore(null);
    save.setOptions({
      ...save.options,
      input: { ...save.options.input, autofire: 'hold' },
      game: { ...save.options.game, deathPenalty: 'arcade', autoPowerUp: false },
    });
    const s = new Session(save);
    expect(s.flow.gameConfig).toMatchObject({
      autofireMode: 'hold',
      deathPenalty: 'arcade',
      autoPowerUp: false,
    });
    s.openOptions();
    s.openPage(OptionsItem.Game);
    const page = s.flow.gameOptionsPage;
    s.focus(page.menu, GameOptionsItem.OneButton);
    s.press(Action.Confirm); // ON
    expect(page.menu.enabled(GameOptionsItem.AutoPowerUp)).toBe(false);
    expect(page.menu.enabled(GameOptionsItem.Penalty)).toBe(false);
    s.press(Action.Back);
    expect(s.flow.gameConfig).toMatchObject({
      autofire: true,
      autofireMode: 'always',
      autoPowerUp: true,
      deathPenalty: 'casual',
    });
  });

  it('remembers the difficulty menu’s choice in the save', () => {
    const save = createSaveStore(null);
    const s = new Session(save);
    s.press(Action.Confirm);
    s.press(Action.Confirm); // 1 PLAYER → the difficulty menu
    s.hold(0, 2);
    s.press(Action.Down); // HARD
    s.press(Action.Confirm);
    expect(save.options.game.difficulty).toBe('hard');
    expect(new Session(save).flow.difficulty).toBe('hard');
  });

  it('the weapon select’s AUTO shows the GAME page’s Auto Power-Up and edits it', () => {
    const save = createSaveStore(null);
    save.setOptions({ ...save.options, game: { ...save.options.game, autoPowerUp: true } });
    const s = new Session(save);
    s.press(Action.Confirm);
    s.press(Action.Confirm); // 1 PLAYER
    s.press(Action.Confirm); // NORMAL
    s.hold(0, 2);
    expect(s.ids[s.ids.length - 1]).toBe('weaponSelect');
    const select = s.flow.weaponSelect;
    expect(select.auto.value).toBe(true);
    const focus = (): number => select.menu.focus;
    while (focus() !== WeaponSelectItem.Auto) s.press(Action.Up);
    s.press(Action.Left); // OFF
    while (focus() !== WeaponSelectItem.Start) s.press(Action.Down);
    s.press(Action.Confirm);
    s.hold(0, 2);
    expect(save.options.game.autoPowerUp).toBe(false);
    expect(s.game.world.config.autoPowerUp).toBe(false);
    // Under the one-button preset the row is off (and ON).
    const one = createSaveStore(null);
    one.setOptions({ ...one.options, game: { ...one.options.game, oneButton: true } });
    const t = new Session(one);
    t.press(Action.Confirm);
    t.press(Action.Confirm);
    t.press(Action.Confirm);
    t.hold(0, 2);
    expect(t.flow.weaponSelect.auto.value).toBe(true);
    expect(t.flow.weaponSelect.menu.enabled(WeaponSelectItem.Auto)).toBe(false);
  });

  it('over the pause menu DIFFICULTY is disabled: the run keeps its difficulty and table (review round 1)', () => {
    const save = createSaveStore(null);
    const s = new Session(save);
    s.press(Action.Confirm);
    s.press(Action.Confirm); // 1 PLAYER
    s.press(Action.Confirm); // NORMAL
    s.hold(0);
    s.press(Action.Confirm); // START in the weapon select
    s.hold(0, 5);
    expect(s.ids).toEqual(['game']);
    const world = s.game.world;
    const key = s.flow.modeKey;
    s.press(Action.Pause);
    s.press(Action.Down); // OPTIONS
    s.press(Action.Confirm);
    s.hold(0, 2);
    s.openPage(OptionsItem.Game);
    expect(s.ids).toEqual(['game', 'pause', 'options', 'gameOptions']);
    const page = s.flow.gameOptionsPage;
    expect(page.inGame).toBe(true);
    expect(page.menu.enabled(GameOptionsItem.Difficulty)).toBe(false);
    expect(page.difficulty.label).toBe('NORMAL');
    // The focus skipped DIFFICULTY: Right changes LIVES (the review's Right > Back > Back).
    expect(page.menu.focus).toBe(GameOptionsItem.Lives);
    s.press(Action.Up); // wraps past DIFFICULTY
    expect(page.menu.focus).toBe(GameOptionsItem.Back);
    s.press(Action.Down);
    expect(page.menu.focus).toBe(GameOptionsItem.Lives);
    s.press(Action.Right); // LIVES 1
    expect(page.difficulty.label).toBe('NORMAL');
    s.press(Action.Back);
    s.hold(0, 2);
    s.press(Action.Back); // the Options screen
    expect(s.ids).toEqual(['game', 'pause']);
    expect(s.flow.difficulty).toBe('normal');
    expect(s.flow.modeKey).toBe(key);
    // The difficulty menu's NORMAL stays the remembered one.
    expect(save.options.game).toMatchObject({ difficulty: 'normal', lives: 1 });
    expect(s.game.world).toBe(world);
    // RETRY STAGE takes the new LIVES — on the run's difficulty.
    s.hold(0, 2);
    s.press(Action.Down); // RETRY STAGE
    s.press(Action.Confirm);
    expect(s.game.world).not.toBe(world);
    expect(s.game.world.config).toMatchObject({ difficulty: 'normal', startingLives: 1 });
    expect(s.flow.modeKey).toBe(key);
    // Back on the title the row is enabled again.
    const title = new Session(save);
    title.openOptions();
    title.openPage(OptionsItem.Game);
    expect(title.flow.gameOptionsPage.inGame).toBe(false);
    expect(title.flow.gameOptionsPage.menu.enabled(GameOptionsItem.Difficulty)).toBe(true);
    expect(title.flow.gameOptionsPage.menu.focus).toBe(GameOptionsItem.Difficulty);
  });

  it('the difficulty menu shows the LIVES the game starts with (review round 1)', () => {
    const save = createSaveStore(null);
    save.setOptions({ ...save.options, game: { ...save.options.game, lives: 5 } });
    const s = new Session(save);
    // The panel's LIVES then CONTINUES (the screen's only numbers drawn without zero padding).
    const drawn = (): number[] => {
      const ui = s.game.renderFrame().ui;
      const out: number[] = [];
      for (let i = 0; i < ui.count; i++) {
        if (ui.op[i] === DrawOp.Number && ui.frame[i] === 0) out.push(ui.value[i]);
      }
      return out;
    };
    s.press(Action.Confirm);
    s.press(Action.Confirm); // 1 PLAYER → the difficulty menu
    s.hold(0, 2);
    expect(s.ids).toEqual(['title', 'difficulty']);
    expect(s.flow.difficultyMenu.focused).toBe('normal');
    // The preset alone has 3 (below); the GAME page's LIVES 5 is what the game gets.
    expect(s.flow.gameConfig.startingLives).toBe(5);
    expect(drawn()[0]).toBe(5);
    s.press(Action.Down); // HARD
    expect(drawn()[0]).toBe(5);
    s.press(Action.Up);
    s.press(Action.Confirm); // NORMAL
    s.hold(0);
    s.press(Action.Confirm); // START in the weapon select
    s.hold(0, 5);
    expect(s.ids).toEqual(['game']);
    expect(s.game.world.players[0].lives).toBe(5);
    // Without the option the menu shows the preset's.
    const plain = new Session();
    plain.press(Action.Confirm);
    plain.press(Action.Confirm);
    plain.hold(0, 2);
    const ui = plain.game.renderFrame().ui;
    const lives: number[] = [];
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] === DrawOp.Number && ui.frame[i] === 0) lives.push(ui.value[i]);
    }
    expect(lives[0]).toBe(3);
  });

  it('an untouched page keeps the unset options unset', () => {
    const save = createSaveStore(null);
    const s = new Session(save);
    s.openOptions();
    s.openPage(OptionsItem.Game);
    s.press(Action.Back);
    expect(save.options.game).toEqual(DEFAULT_USER_OPTIONS.game);
  });
});

/**
 * Opens the rebind screen of a device from the title.
 *
 * @param s - The session.
 * @param pad - The gamepad (else the keyboard).
 */
function openRebind(s: Session, pad = false): void {
  s.openOptions();
  s.openPage(OptionsItem.Controls);
  s.focus(s.flow.controlsPage.menu, pad ? ControlsItem.Pad : ControlsItem.Keys);
  s.press(Action.Confirm);
  s.hold(0, 2);
  expect(s.ids[s.ids.length - 1]).toBe('rebind');
}

describe('core/scenes rebind screen (M2-16)', () => {
  it('lists every game action with its keys; MODE shows the menu table', () => {
    const controls = new FakeControls();
    controls.labels.set('0/game/Shot', 'Z  SPACE');
    const s = new Session(createSaveStore(null), controls);
    openRebind(s);
    const panel = s.flow.rebind.panel;
    expect(panel.context).toBe('game');
    expect(panel.keys[0].slice(0, 5)).toEqual([
      'UP-KEY',
      'DOWN-KEY',
      'LEFT-KEY',
      'RIGHT-KEY',
      'Z  SPACE',
    ]);
    const texts = s.uiTexts();
    expect(texts).toEqual(
      expect.arrayContaining(['MODE', 'GAME', 'SHOT', 'Z  SPACE', 'RESET', 'DONE']),
    );
    s.press(Action.Right); // MODE → MENU
    expect(panel.context).toBe('menu');
    expect(s.uiTexts()).toEqual(expect.arrayContaining(['MENU', 'OK', 'BACK', 'CONFIRM-KEY']));
  });

  it('captures a key and binds it; the message says what happened', () => {
    const controls = new FakeControls();
    const s = new Session(createSaveStore(null), controls);
    openRebind(s);
    const panel = s.flow.rebind.panel;
    for (let i = 0; i < 5; i++) s.press(Action.Down); // SHOT
    expect(panel.focusedAction).toBe('Shot');
    s.press(Action.Confirm);
    expect(panel.capturing).toBe(true);
    expect(controls.calls).toEqual([['begin', 0]]);
    expect(s.uiTexts()).toContain('PRESS A KEY FOR SHOT');
    // Menu input does nothing while the prompt waits.
    s.press(Action.Down);
    expect(panel.focusedAction).toBe('Shot');
    controls.outcome = { status: RebindStatus.Swapped, other: 'Sub' };
    controls.status = CaptureStatus.Captured;
    s.hold(Action.Confirm); // the captured key is still down on the next ticks
    expect(controls.calls).toEqual([['begin', 0], ['bind', 0, 'game', 'Shot'], ['end']]);
    expect(panel.capturing).toBe(false);
    expect(panel.message).toBe('SWAPPED WITH SUB');
    expect(panel.keys[0][4]).toBe('J');
    // Held keys do not act on the rows until released.
    s.hold(Action.Confirm, 10);
    expect(panel.capturing).toBe(false);
    expect(controls.calls).toHaveLength(3);
    s.hold(0, 3);
    s.press(Action.Confirm); // a new capture
    expect(controls.calls[3]).toEqual(['begin', 0]);
  });

  it('shows every outcome; a gamepad asks for a button', () => {
    const cases: Array<[RebindOutcome, string]> = [
      [{ status: RebindStatus.Bound, other: null }, 'SHOT REBOUND'],
      [{ status: RebindStatus.Moved, other: 'Up' }, 'KEY TAKEN FROM UP'],
      [{ status: RebindStatus.Refused, other: 'Pause' }, 'NOT POSSIBLE: PAUSE NEEDS A KEY'],
      [{ status: RebindStatus.Unchanged, other: null }, 'NO CHANGE'],
      [{ status: RebindStatus.Rejected, other: null }, 'THAT KEY CANNOT BE USED'],
    ];
    for (const [outcome, message] of cases) {
      const controls = new FakeControls();
      const s = new Session(createSaveStore(null), controls);
      openRebind(s, true);
      for (let i = 0; i < 5; i++) s.press(Action.Down);
      s.press(Action.Confirm);
      expect(s.uiTexts()).toContain('PRESS A BUTTON FOR SHOT');
      controls.outcome = outcome;
      controls.status = CaptureStatus.Captured;
      s.hold(0);
      expect(s.flow.rebind.panel.message, message).toBe(message);
      expect(controls.calls[1]).toEqual(['bind', 1, 'game', 'Shot']);
    }
  });

  it('a cancel or the timeout ends the capture without a binding', () => {
    const controls = new FakeControls();
    const s = new Session(createSaveStore(null), controls);
    openRebind(s);
    s.press(Action.Down); // UP
    s.press(Action.Confirm);
    controls.status = CaptureStatus.Cancelled;
    s.hold(0);
    expect(s.flow.rebind.panel.message).toBe('CANCELLED');
    expect(controls.calls).toEqual([['begin', 0], ['end']]);
    s.hold(0, 3);
    s.press(Action.Confirm);
    expect(s.flow.rebind.panel.capturing).toBe(true);
    s.hold(0, REBIND_CAPTURE_TICKS);
    expect(s.flow.rebind.panel.capturing).toBe(false);
    expect(controls.calls).toEqual([['begin', 0], ['end'], ['begin', 0], ['end']]);
  });

  it('RESET resets the shown context; DONE closes; leaving mid-capture ends it', () => {
    const controls = new FakeControls();
    const save = createSaveStore(null);
    const s = new Session(save, controls);
    openRebind(s);
    s.press(Action.Right); // MENU
    const panel = s.flow.rebind.panel;
    while (panel.menu.focus !== panel.resetRow) s.press(Action.Down);
    s.press(Action.Confirm);
    expect(controls.calls).toEqual([['reset', 0, 'menu']]);
    expect(panel.message).toBe('RESET TO DEFAULTS');
    s.press(Action.Down); // DONE
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title', 'options', 'controls']);
    // Back out of the capture: the screen closes, the capture ends.
    s.hold(0, 2);
    s.press(Action.Confirm); // REBIND KEYS again (the page kept its focus)
    s.hold(0, 2);
    s.press(Action.Down);
    s.press(Action.Confirm);
    expect(panel.capturing).toBe(true);
    s.flow.stack.pop();
    expect(panel.capturing).toBe(false);
    expect(controls.calls[controls.calls.length - 1]).toEqual(['end']);
  });
});

describe('core/scenes input test (M2-16)', () => {
  it('reads the gameplay table, lights what is held, and leaves on a held Pause', () => {
    const s = new Session();
    s.openOptions();
    s.openPage(OptionsItem.Controls);
    s.focus(s.flow.controlsPage.menu, ControlsItem.InputTest);
    s.press(Action.Confirm);
    const test = s.flow.inputTest;
    expect(s.game.inputContext).toBe('game');
    expect(s.uiTexts()).toEqual(
      expect.arrayContaining([
        'INPUT TEST',
        'PAUSE X3 OR HOLD TO EXIT',
        'SHOT',
        'POWER-UP',
        'PAUSE',
      ]),
    );
    s.hold(Action.Shot | Action.Up);
    expect(test.lit & (Action.Shot | Action.Up)).toBe(Action.Shot | Action.Up);
    s.hold(0);
    // A tap stays lit a few ticks.
    expect(test.lit & Action.Shot).toBe(Action.Shot);
    s.hold(0, 10);
    expect(test.lit).toBe(0);
    // Back / OK do nothing here (the gameplay table); a short Pause does not leave.
    s.press(Action.Pause);
    expect(s.ids[s.ids.length - 1]).toBe('inputTest');
    s.hold(0, INPUT_TEST_EXIT_WINDOW_TICKS + 2); // the press window runs out
    s.hold(Action.Pause, INPUT_TEST_EXIT_TICKS - 2);
    expect(s.ids[s.ids.length - 1]).toBe('inputTest');
    s.hold(Action.Pause, 2);
    expect(s.ids).toEqual(['title', 'options', 'controls']);
    expect(s.game.inputContext).toBe('menu');
  });

  it('leaves on three Pause presses inside the window — the remote cannot hold Back (M3-02b)', () => {
    const s = new Session();
    s.openOptions();
    s.openPage(OptionsItem.Controls);
    s.focus(s.flow.controlsPage.menu, ControlsItem.InputTest);
    s.press(Action.Confirm);
    expect(s.ids[s.ids.length - 1]).toBe('inputTest');
    // Back and Play/Pause arrive as a keydown + keyup together, so each is one tick of Pause.
    for (let i = 0; i < INPUT_TEST_EXIT_PRESSES - 1; i++) {
      s.press(Action.Pause);
      s.hold(0, 4);
      expect(s.ids[s.ids.length - 1], `press ${String(i + 1)}`).toBe('inputTest');
    }
    s.press(Action.Pause);
    expect(s.ids).toEqual(['title', 'options', 'controls']);
  });

  it('forgets the presses once the window runs out', () => {
    const s = new Session();
    s.openOptions();
    s.openPage(OptionsItem.Controls);
    s.focus(s.flow.controlsPage.menu, ControlsItem.InputTest);
    s.press(Action.Confirm);
    const test = s.flow.inputTest;
    s.press(Action.Pause);
    s.press(Action.Pause);
    expect(test.presses).toBe(2);
    s.hold(0, INPUT_TEST_EXIT_WINDOW_TICKS + 2);
    expect(test.presses).toBe(0);
    s.press(Action.Pause);
    expect(s.ids[s.ids.length - 1]).toBe('inputTest');
  });
});
