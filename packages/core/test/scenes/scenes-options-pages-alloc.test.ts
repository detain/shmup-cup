/**
 * Allocation guard of the Options screen's pages of plan M2-16 (definition of done: zero
 * allocations per tick and per frame), in its own file: with each page open, the focus moves and
 * the values change over and over — the DISPLAY page's live events, the CONTROLS page's profile,
 * autofire and rate, the GAME page's choices and toggles, the rebind screen's rows and its MODE
 * switch — with the render frame composed every tick (the input test has its own file,
 * `scenes-input-test-alloc.test.ts`). What stores
 * into the save (closing a page, SOCD / DEBOUNCE, a rebinding) is a menu action outside the loops.
 */
import { describe, expect, it } from 'vitest';
import { SimEventKind, type SimEvent } from '../../src/events/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionName } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { createSaveStore } from '../../src/save/index.js';
import {
  ControlsItem,
  OptionsItem,
  TitleItem,
  type ControlsSetup,
  type RebindDevice,
  type RebindOutcome,
  type SceneFlow,
} from '../../src/scenes/index.js';
import { CaptureStatus, RebindStatus } from '../../src/ui/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/** The devices of the fake host (a constant list). */
const DEVICES: readonly RebindDevice[] = Object.freeze([
  { id: 'keyboard-default', kind: 'keyboard' },
  { id: 'gamepad-standard', kind: 'gamepad' },
]);

/** A host side that never allocates when polled (the labels are one constant). */
const CONTROLS: ControlsSetup = {
  devices: () => DEVICES,
  keysLabel: (_device: number, _context: string, _action: ActionName) => 'Z  SPACE',
  beginCapture: () => undefined,
  pollCapture: () => CaptureStatus.Idle,
  endCapture: () => undefined,
  bindCaptured: (): RebindOutcome => ({ status: RebindStatus.Bound, other: null }),
  reset: () => undefined,
};

/** A session on the title with helpers (setup only — never measured). */
class Session {
  readonly platform: HeadlessPlatform = createHeadlessPlatform();
  readonly game: Game;
  readonly flow: SceneFlow;

  constructor() {
    this.game = createGame(this.platform, { remoteMode: false }, undefined, {
      scenes: 'title',
      save: createSaveStore(null),
      inputProfiles: {
        choices: [
          { id: 'a', label: 'FIRST (DEFAULT)' },
          { id: 'b', label: 'SECOND' },
        ],
        active: 'a',
      },
      controls: CONTROLS,
    });
    this.flow = this.game.scenes!;
  }

  /**
   * One tick with a held mask (the frame composed, the events dropped).
   *
   * @param held - Held actions.
   */
  tap(held: number): void {
    commitPlayerInput(this.platform.snapshot.players[0], held);
    this.game.step();
    commitPlayerInput(this.platform.snapshot.players[0], 0);
    this.game.step();
    this.game.events.clear();
  }

  /**
   * Opens a page of the Options screen from the title.
   *
   * @param item - An `OptionsItem` page row.
   */
  openPage(item: number): void {
    this.tap(Action.Confirm);
    while (this.flow.title.menu.focus !== TitleItem.Options) this.tap(Action.Down);
    this.tap(Action.Confirm);
    this.tap(0);
    while (this.flow.options.menu.focus !== item) this.tap(Action.Down);
    this.tap(Action.Confirm);
    this.tap(0);
  }
}

/**
 * Runs a page's measured loop: a direction every few ticks from the index's phase (Up / Down to
 * move, Left / Right to change), the frame composed and the events drained every tick.
 *
 * @param s - The session (the page open).
 * @param held - The held mask of a tick, from its index.
 * @returns The bytes grown and the option events seen.
 */
function measure(s: Session, held: (t: number) => number): { bytes: number; changes: number } {
  const player = s.platform.snapshot.players[0];
  let t = 0;
  let changes = 0;
  /**
   * Counts the option events (one visitor for the whole run).
   *
   * @param event - A drained event.
   */
  const count = (event: Readonly<SimEvent>): void => {
    if (event.kind === SimEventKind.UserOption) changes++;
  };
  const growth = measureHeapGrowth(
    () => {
      t++;
      commitPlayerInput(player, held(t));
      s.game.step();
      s.game.renderFrame();
      s.game.events.drain(count);
    },
    20_000,
    20_000,
  );
  return { bytes: growth.bytes, changes };
}

describe('core/scenes Options pages allocation (M2-16)', () => {
  it('the DISPLAY page changes every row live without allocating', () => {
    const s = new Session();
    s.openPage(OptionsItem.Display);
    const page = s.flow.displayPage;
    const { bytes, changes } = measure(s, (t) => {
      const phase = t % 16;
      // Down through BULLETS … BOSS HP and back up; OK flips a toggle / steps a choice.
      if (phase === 0) return (t >> 4) % 10 < 5 ? Action.Down : Action.Up;
      if (phase === 8 && page.menu.focus <= 5) return Action.Confirm;
      return 0;
    });
    expect(s.flow.stack.top?.id).toBe('display');
    expect(changes).toBeGreaterThan(500);
    expect(bytes).toBeLessThan(64 * 1024);
  });

  it('the CONTROLS page steps the profile, autofire and rate without allocating', () => {
    const s = new Session();
    s.openPage(OptionsItem.Controls);
    const page = s.flow.controlsPage;
    const { bytes, changes } = measure(s, (t) => {
      const phase = t % 16;
      // PROFILE, AUTOFIRE, RATE only (SOCD / DEBOUNCE store into the save — menu actions).
      if (phase === 0) return (t >> 4) % 4 < 2 ? Action.Down : Action.Up;
      if (phase === 8 && page.menu.focus <= ControlsItem.Rate) return Action.Right;
      return 0;
    });
    expect(s.flow.stack.top?.id).toBe('controls');
    expect(changes).toBeGreaterThan(100); // the profile's live events
    expect(bytes).toBeLessThan(64 * 1024);
  });

  it('the GAME page changes its choices and toggles without allocating', () => {
    const s = new Session();
    s.openPage(OptionsItem.Game);
    const page = s.flow.gameOptionsPage;
    const { bytes } = measure(s, (t) => {
      const phase = t % 16;
      if (phase === 0) return (t >> 4) % 10 < 5 ? Action.Down : Action.Up;
      if (phase === 8 && page.menu.focus <= 5) return Action.Confirm;
      return 0;
    });
    expect(s.flow.stack.top?.id).toBe('gameOptions');
    expect(bytes).toBeLessThan(64 * 1024);
  });

  it('the rebind screen moves over its rows and switches MODE without allocating', () => {
    const s = new Session();
    s.openPage(OptionsItem.Controls);
    while (s.flow.controlsPage.menu.focus !== ControlsItem.Keys) s.tap(Action.Down);
    s.tap(Action.Confirm);
    s.tap(0);
    expect(s.flow.stack.top?.id).toBe('rebind');
    const panel = s.flow.rebind.panel;
    const { bytes } = measure(s, (t) => {
      const phase = t % 12;
      if (phase === 0) return panel.menu.focus === 0 ? Action.Right : Action.Up; // MODE
      if (phase === 6) return (t >> 5) % 2 === 0 ? Action.Down : 0;
      return 0;
    });
    expect(s.flow.stack.top?.id).toBe('rebind');
    expect(bytes).toBeLessThan(64 * 1024);
  });
});
