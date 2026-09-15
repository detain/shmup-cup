/**
 * Edge cases of the Options screen's pages of plan M2-16 in the scene flow: the CONTROLS page (a
 * saved rate the page does not list shown at the closest one and kept when untouched, DEBOUNCE and
 * SOCD over their whole range, the rebind rows disabled without a host), the GAME page (LIVES and
 * PENALTY over their whole range, the one-button preset switched on and off again), the rebind
 * screen (the release wait capped at 60 ticks, the sounds of the outcomes, a capture caught on
 * the timeout's tick still binding, a host that lost its capture) and the input test (a Pause
 * released early starts the exit again, Back does not leave, the device shown).
 */
import { describe, expect, it } from 'vitest';
import { type InputProfileChoice } from '../../src/config/index.js';
import { SFX_CUES, SimEventKind, UserOptionKind } from '../../src/events/index.js';
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
  INPUT_TEST_EXIT_TICKS,
  OptionsItem,
  TitleItem,
  type ControlsSetup,
  type RebindDevice,
  type RebindOutcome,
  type SceneFlow,
} from '../../src/scenes/index.js';
import {
  CaptureStatus,
  MenuResult,
  REBIND_CAPTURE_TICKS,
  RebindStatus,
} from '../../src/ui/index.js';

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

  devices(): readonly RebindDevice[] {
    return this.list;
  }
  keysLabel(_device: number, _context: InputContext, action: ActionName): string {
    return `${action.toUpperCase()}-KEY`;
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
    return this.outcome;
  }
  reset(device: number, context: InputContext): void {
    this.calls.push(['reset', device, context]);
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
   * @param device - The device the input comes from.
   */
  hold(held: ActionMask, ticks = 1, device: 'keyboard' | 'remote' | 'gamepad' = 'keyboard'): void {
    for (let t = 0; t < ticks; t++) {
      const player = this.platform.snapshot.players[0];
      commitPlayerInput(player, held);
      if (held !== 0) player.device = device;
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
   * The sound effects since an index.
   *
   * @param from - First event index.
   * @returns The cues.
   */
  sounds(from: number): number[] {
    return this.events
      .slice(from)
      .filter((e) => e[0] === SimEventKind.Sfx)
      .map((e) => e[1]);
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
   * Focuses a row of a page's menu.
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

/**
 * Opens the rebind screen of the keyboard from the title and focuses SHOT.
 *
 * @param s - The session.
 */
function openRebindOnShot(s: Session): void {
  s.openOptions();
  s.openPage(OptionsItem.Controls);
  s.focus(s.flow.controlsPage.menu, ControlsItem.Keys);
  s.press(Action.Confirm);
  s.hold(0, 2);
  expect(s.ids[s.ids.length - 1]).toBe('rebind');
  for (let i = 0; i < 5; i++) s.press(Action.Down);
  expect(s.flow.rebind.panel.focusedAction).toBe('Shot');
}

describe('core/scenes CONTROLS page (edge, M2-16)', () => {
  it('shows a saved rate it does not list at the closest one and keeps it when untouched', () => {
    const save = createSaveStore(null);
    save.setOptions({ ...save.options, input: { ...save.options.input, autofireInterval: 7 } });
    const s = new Session(save);
    expect(s.flow.gameConfig.autofireInterval).toBe(7);
    s.openOptions();
    s.openPage(OptionsItem.Controls);
    // 7 is as close to 8 as to 6: the first (the slower) is shown.
    expect(s.flow.controlsPage.rate.label).toBe('7.5/S');
    s.press(Action.Back);
    expect(save.options.input.autofireInterval).toBe(7);
    expect(s.flow.gameConfig.autofireInterval).toBe(7);
  });

  it('steps DEBOUNCE over AUTO and 0–10 ticks (wrapping) and SOCD both ways, each stored at once', () => {
    const save = createSaveStore(null);
    const s = new Session(save);
    s.openOptions();
    s.openPage(OptionsItem.Controls);
    const page = s.flow.controlsPage;
    s.focus(page.menu, ControlsItem.Debounce);
    const seen: Array<number | null> = [];
    for (let i = 0; i < 12; i++) {
      s.press(Action.Right);
      seen.push(save.options.input.releaseDebounce);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null]);
    s.press(Action.Left);
    expect([page.debounce.label, save.options.input.releaseDebounce]).toEqual(['10 TICKS', 10]);
    s.press(Action.Up); // SOCD
    s.press(Action.Left); // wraps to LAST WINS
    expect([page.socd.label, save.options.input.socd]).toEqual(['LAST WINS', 'lastWins']);
    s.press(Action.Left);
    expect(save.options.input.socd).toBe('neutral');
    s.press(Action.Left);
    expect([page.socd.label, save.options.input.socd]).toEqual(['PROFILE', null]);
    // Reopened, the page shows the saved values.
    s.press(Action.Back);
    s.hold(0, 3);
    s.press(Action.Confirm);
    s.hold(0, 2);
    expect([page.socd.label, page.debounce.label]).toEqual(['PROFILE', '10 TICKS']);
  });

  it('disables REBIND KEYS / PAD without a host setup; OK on them is denied', () => {
    const s = new Session(createSaveStore(null), null);
    s.openOptions();
    s.openPage(OptionsItem.Controls);
    const page = s.flow.controlsPage;
    expect(page.menu.enabled(ControlsItem.Keys)).toBe(false);
    expect(page.menu.enabled(ControlsItem.Pad)).toBe(false);
    expect(page.menu.enabled(ControlsItem.InputTest)).toBe(true);
    page.menu.focus = ControlsItem.Keys; // forced onto the disabled row
    const from = s.events.length;
    s.press(Action.Confirm);
    expect(s.ids).toEqual(['title', 'options', 'controls']);
    // The denied sound (the back cue).
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuBack]);
    expect(page.deviceIndex(false)).toBe(-1);
  });

  it('AUTOFIRE and RATE changed and changed back store nothing new', () => {
    const save = createSaveStore(null);
    const s = new Session(save);
    const config = s.flow.gameConfig;
    s.openOptions();
    s.openPage(OptionsItem.Controls);
    s.focus(s.flow.controlsPage.menu, ControlsItem.Autofire);
    s.press(Action.Right);
    s.press(Action.Left);
    s.press(Action.Down);
    s.press(Action.Left);
    s.press(Action.Right);
    s.press(Action.Back);
    expect([save.options.input.autofire, save.options.input.autofireInterval]).toEqual([
      null,
      null,
    ]);
    expect(s.flow.gameConfig).toBe(config);
  });
});

describe('core/scenes GAME page (edge, M2-16)', () => {
  it('steps LIVES over PRESET and 1–5 and PENALTY over PRESET and the three presets', () => {
    const save = createSaveStore(null);
    const s = new Session(save);
    s.openOptions();
    s.openPage(OptionsItem.Game);
    const page = s.flow.gameOptionsPage;
    s.focus(page.menu, GameOptionsItem.Lives);
    const lives: string[] = [];
    for (let i = 0; i < 6; i++) {
      s.press(Action.Right);
      lives.push(page.lives.label);
    }
    expect(lives).toEqual(['1', '2', '3', '4', '5', 'PRESET']);
    s.press(Action.Down);
    const penalty: string[] = [];
    for (let i = 0; i < 4; i++) {
      s.press(Action.Right);
      penalty.push(page.penalty.label);
    }
    expect(penalty).toEqual(['ARCADE', 'CLASSIC', 'CASUAL', 'PRESET']);
    s.press(Action.Left); // CASUAL
    s.focus(page.menu, GameOptionsItem.Lives);
    s.press(Action.Right); // 1
    s.press(Action.Back);
    expect(save.options.game).toMatchObject({ lives: 1, deathPenalty: 'casual' });
    expect(s.flow.gameConfig).toMatchObject({ startingLives: 1, deathPenalty: 'casual' });
    // Reopened, the page shows them; PRESET stores null again.
    s.hold(0, 3);
    s.press(Action.Confirm);
    s.hold(0, 2);
    expect([page.lives.label, page.penalty.label]).toEqual(['1', 'CASUAL']);
    s.focus(page.menu, GameOptionsItem.Lives);
    s.press(Action.Left); // PRESET
    s.press(Action.Back);
    expect(save.options.game.lives).toBeNull();
    expect(s.flow.gameConfig.startingLives).toBe(3);
  });

  it('switching the one-button preset off again enables its rows and restores the options', () => {
    const save = createSaveStore(null);
    save.setOptions({
      ...save.options,
      game: { ...save.options.game, deathPenalty: 'arcade', oneButton: true },
    });
    const s = new Session(save);
    expect(s.flow.gameConfig.deathPenalty).toBe('casual');
    s.openOptions();
    s.openPage(OptionsItem.Game);
    const page = s.flow.gameOptionsPage;
    expect(page.oneButton.value).toBe(true);
    expect(page.menu.enabled(GameOptionsItem.Penalty)).toBe(false);
    expect(page.menu.enabled(GameOptionsItem.AutoPowerUp)).toBe(false);
    // The disabled rows are skipped on the way down.
    s.press(Action.Down);
    expect(page.menu.focus).toBe(GameOptionsItem.Lives);
    s.press(Action.Down);
    expect(page.menu.focus).toBe(GameOptionsItem.Magnet);
    s.press(Action.Down);
    s.press(Action.Confirm); // ONE BUTTON off
    expect(page.oneButton.value).toBe(false);
    expect(page.menu.enabled(GameOptionsItem.Penalty)).toBe(true);
    expect(page.menu.enabled(GameOptionsItem.AutoPowerUp)).toBe(true);
    s.press(Action.Back);
    expect(save.options.game).toMatchObject({ oneButton: false, deathPenalty: 'arcade' });
    expect(s.flow.gameConfig.deathPenalty).toBe('arcade');
  });
});

describe('core/scenes rebind screen (edge, M2-16)', () => {
  it('waits for a release after a capture, at most 60 ticks', () => {
    const controls = new FakeControls();
    const s = new Session(createSaveStore(null), controls);
    openRebindOnShot(s);
    const panel = s.flow.rebind.panel;
    s.press(Action.Confirm);
    controls.status = CaptureStatus.Captured;
    s.hold(Action.Down); // the captured key, held
    expect(panel.capturing).toBe(false);
    expect(s.flow.rebind.releaseTicks).toBe(60);
    // Still held 59 more ticks, then an Up press on the 60th: the rows do not move yet.
    s.hold(Action.Down, 59);
    expect(s.flow.rebind.releaseTicks).toBe(1);
    s.hold(Action.Down | Action.Up);
    expect(panel.focusedAction).toBe('Shot');
    expect(s.flow.rebind.releaseTicks).toBe(0);
    // The wait is over: the rows take input again (the lock only delays activation).
    s.hold(0);
    s.press(Action.Down);
    expect(panel.focusedAction).toBe('Sub');
  });

  it('a released key ends the wait at once', () => {
    const controls = new FakeControls();
    const s = new Session(createSaveStore(null), controls);
    openRebindOnShot(s);
    s.press(Action.Confirm);
    controls.status = CaptureStatus.Captured;
    s.hold(0);
    expect(s.flow.rebind.releaseTicks).toBe(60);
    s.hold(0);
    expect(s.flow.rebind.releaseTicks).toBe(0);
    s.press(Action.Down);
    expect(s.flow.rebind.panel.focusedAction).toBe('Sub');
  });

  it('plays the select sound for a binding and the back sound for a refusal or rejection', () => {
    const cases: Array<[number, number]> = [
      [RebindStatus.Bound, SFX_CUES.MenuSelect],
      [RebindStatus.Moved, SFX_CUES.MenuSelect],
      [RebindStatus.Swapped, SFX_CUES.MenuSelect],
      [RebindStatus.Unchanged, SFX_CUES.MenuSelect],
      [RebindStatus.Refused, SFX_CUES.MenuBack],
      [RebindStatus.Rejected, SFX_CUES.MenuBack],
    ];
    for (const [status, cue] of cases) {
      const controls = new FakeControls();
      const s = new Session(createSaveStore(null), controls);
      openRebindOnShot(s);
      s.press(Action.Confirm);
      controls.outcome = { status, other: status === RebindStatus.Refused ? 'Up' : null };
      controls.status = CaptureStatus.Captured;
      const from = s.events.length;
      s.hold(0);
      expect(s.sounds(from), String(status)).toEqual([cue]);
    }
  });

  it('a key caught on the timeout’s tick is still bound', () => {
    const controls = new FakeControls();
    const s = new Session(createSaveStore(null), controls);
    openRebindOnShot(s);
    s.press(Action.Confirm); // the prompt's first tick
    s.hold(0, REBIND_CAPTURE_TICKS - 2);
    expect(s.flow.rebind.panel.capturing).toBe(true);
    controls.status = CaptureStatus.Captured;
    s.hold(0);
    expect(controls.calls).toEqual([['begin', 0], ['bind', 0, 'game', 'Shot'], ['end']]);
    expect(s.flow.rebind.panel.message).toBe('SHOT REBOUND');
  });

  it('a host that lost its capture (idle) ends the prompt as cancelled', () => {
    const controls = new FakeControls();
    const s = new Session(createSaveStore(null), controls);
    openRebindOnShot(s);
    s.press(Action.Confirm);
    const from = s.events.length;
    controls.status = CaptureStatus.Idle;
    s.hold(0);
    expect(s.flow.rebind.panel.capturing).toBe(false);
    expect(s.flow.rebind.panel.message).toBe('CANCELLED');
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuBack]);
    expect(controls.calls).toEqual([['begin', 0], ['end']]);
  });

  it('a new capture clears the last outcome; MODE on MENU binds menu actions', () => {
    const controls = new FakeControls();
    const s = new Session(createSaveStore(null), controls);
    openRebindOnShot(s);
    const panel = s.flow.rebind.panel;
    s.press(Action.Confirm);
    controls.status = CaptureStatus.Captured;
    s.hold(0, 2);
    expect(panel.message).toBe('SHOT REBOUND');
    s.hold(0, 3);
    s.press(Action.Confirm);
    expect(panel.message).toBe('');
    controls.status = CaptureStatus.Cancelled;
    s.hold(0, 2);
    // MODE → MENU, then OK (the fifth row) is captured in the menu context.
    while (panel.menu.focus !== 0) s.press(Action.Up);
    s.press(Action.Right);
    expect(panel.context).toBe('menu');
    for (let i = 0; i < 5; i++) s.press(Action.Down);
    expect(panel.focusedAction).toBe('Confirm');
    s.press(Action.Confirm);
    expect(s.uiTexts()).toContain('PRESS A KEY FOR OK');
    controls.status = CaptureStatus.Captured;
    s.hold(0);
    expect(controls.calls[controls.calls.length - 2]).toEqual(['bind', 0, 'menu', 'Confirm']);
  });

  it('plays the move sound over the rows and the back sound on DONE', () => {
    const controls = new FakeControls();
    const s = new Session(createSaveStore(null), controls);
    openRebindOnShot(s);
    let from = s.events.length;
    s.press(Action.Down);
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuMove]);
    expect(s.flow.rebind.panel.result).toBe(MenuResult.None); // the release tick
    from = s.events.length;
    s.press(Action.Back);
    expect(s.sounds(from)).toEqual([SFX_CUES.MenuBack]);
    expect(s.ids).toEqual(['title', 'options', 'controls']);
  });
});

describe('core/scenes input test (edge, M2-16)', () => {
  /**
   * Opens the input test from the title.
   *
   * @param s - The session.
   */
  function openInputTest(s: Session): void {
    s.openOptions();
    s.openPage(OptionsItem.Controls);
    s.focus(s.flow.controlsPage.menu, ControlsItem.InputTest);
    s.press(Action.Confirm);
    expect(s.ids[s.ids.length - 1]).toBe('inputTest');
  }

  it('a Pause released before the second starts the exit over', () => {
    const s = new Session();
    openInputTest(s);
    const test = s.flow.inputTest;
    s.hold(Action.Pause, INPUT_TEST_EXIT_TICKS - 5);
    expect(test.holdTicks).toBe(INPUT_TEST_EXIT_TICKS - 5);
    s.hold(0);
    expect(test.holdTicks).toBe(0);
    s.hold(Action.Pause, INPUT_TEST_EXIT_TICKS - 1);
    expect(s.ids[s.ids.length - 1]).toBe('inputTest');
    s.hold(Action.Pause);
    expect(s.ids).toEqual(['title', 'options', 'controls']);
    // Opened again: nothing lit, the exit bar empty.
    s.hold(0, 3);
    s.press(Action.Confirm);
    expect([test.holdTicks, test.lit]).toEqual([0, 0]);
  });

  it('Back, OK and every other action stay on the screen and light up', () => {
    const s = new Session();
    openInputTest(s);
    const test = s.flow.inputTest;
    for (const action of [Action.Back, Action.Confirm, Action.Special, Action.Speed]) {
      s.hold(action);
      expect(s.ids[s.ids.length - 1]).toBe('inputTest');
    }
    s.hold(Action.Sub | Action.PowerUp | Action.Left | Action.Down);
    expect(test.lit & (Action.Sub | Action.PowerUp | Action.Left | Action.Down)).toBe(
      Action.Sub | Action.PowerUp | Action.Left | Action.Down,
    );
  });

  it('names the device the last input came from', () => {
    const s = new Session();
    openInputTest(s);
    expect(s.uiTexts()).not.toContain('GAMEPAD');
    s.hold(Action.Up, 1, 'gamepad');
    expect(s.uiTexts()).toContain('GAMEPAD');
    s.hold(0);
    // Idle input keeps the last device shown.
    expect(s.uiTexts()).toContain('GAMEPAD');
    s.hold(Action.Up, 1, 'remote');
    expect(s.uiTexts()).toContain('REMOTE');
  });

  it('pushes no user-option event and never stores anything', () => {
    const save = createSaveStore(null);
    const s = new Session(save);
    const options = save.options;
    openInputTest(s);
    const from = s.events.length;
    s.hold(Action.Shot | Action.Up, 30);
    s.hold(Action.Pause, INPUT_TEST_EXIT_TICKS);
    expect(s.events.slice(from).filter((e) => e[0] === SimEventKind.UserOption)).toEqual([]);
    expect(save.options).toBe(options);
    expect(UserOptionKind.InputSettings).toBe(10);
  });
});
