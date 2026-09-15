/**
 * Edge cases of the Options screen's display rows (plan M2-08 — the DISPLAY page since M2-16), next
 * to `scenes-options.test.ts`:
 * SCALE wraps both ways and OK steps it forward, FLASHES flips with OK and wraps, SHAKE / HITBOX
 * push nothing when set to what they already are (Left on OFF, Right on ON), a save opened with
 * the non-default values shows them and BACK without a change writes nothing, the Back button saves
 * the display options too, the screen opened from the pause menu, every row of the taller panel
 * inside the frame and the panel, a scale mode unknown to the screen shown as INTEGER.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_OPTIONS, PLAYFIELD_H, type DisplayOptions } from '../../src/config/index.js';
import { SimEventKind, UserOptionKind } from '../../src/events/index.js';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput, type ActionMask } from '../../src/input/index.js';
import {
  createHeadlessPlatform,
  createMemoryStorage,
  type HeadlessPlatform,
  type PlatformStorage,
} from '../../src/platform/index.js';
import { DrawOp } from '../../src/presentation/index.js';
import { createSaveStore, loadSave, type SaveStore } from '../../src/save/index.js';
import {
  DisplayItem,
  FLASH_LABELS,
  OptionsItem,
  SCALE_MODE_LABELS,
  TitleItem,
  type SceneFlow,
} from '../../src/scenes/index.js';

/** A headless scene-flow session on a save, with helpers to drive it. */
class Session {
  readonly platform: HeadlessPlatform;
  readonly game: Game;
  readonly flow: SceneFlow;
  /** Events drained so far: `[kind, id, param]`. */
  readonly events: Array<[number, number, number]> = [];

  /**
   * Creates the session.
   *
   * @param save - The save store.
   * @param start - Where the flow starts.
   */
  constructor(save: SaveStore, start: 'title' | 'game' = 'title') {
    this.platform = createHeadlessPlatform();
    this.game = createGame(this.platform, { seed: 3, continues: 0 }, undefined, {
      scenes: start,
      save,
      inputProfiles: null,
    });
    const flow = this.game.scenes;
    if (flow === null) throw new Error('no scene flow');
    this.flow = flow;
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
   * Opens the title menu, the Options screen and its DISPLAY page (M2-16), waiting out the locks.
   */
  openOptionsFromTitle(): void {
    this.press(Action.Confirm); // PRESS OK → menu
    this.press(Action.Down); // 2 PLAYERS
    this.press(Action.Down); // OPTIONS
    expect(this.flow.title.menu.focus).toBe(TitleItem.Options);
    this.press(Action.Confirm);
    this.hold(0, 2);
    this.openDisplay();
  }

  /** From the Options screen: opens its DISPLAY page (M2-16), past the lock. */
  openDisplay(): void {
    while (this.flow.options.menu.focus !== OptionsItem.Display) this.press(Action.Down);
    this.press(Action.Confirm);
    this.hold(0, 2);
    expect(this.flow.stack.top?.id).toBe('display');
  }

  /**
   * Moves the focus down to a DISPLAY row.
   *
   * @param item - The row ({@link DisplayItem}).
   */
  focus(item: number): void {
    while (this.flow.displayPage.menu.focus !== item) this.press(Action.Down);
  }
}

/**
 * A memory storage that counts writes.
 *
 * @returns The storage and its write log.
 */
function countingStorage(): { storage: PlatformStorage; writes: string[] } {
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

/**
 * A save store holding display options.
 *
 * @param display - Display fields over the defaults.
 * @returns The store.
 */
function saveWith(display: Partial<DisplayOptions>): SaveStore {
  const save = createSaveStore(null);
  save.setOptions({
    ...save.options,
    display: { ...DEFAULT_USER_OPTIONS.display, ...display },
  });
  return save;
}

describe('core/scenes options: display rows (edges)', () => {
  it('wraps SCALE both ways and steps it forward with OK', () => {
    const s = new Session(createSaveStore(null));
    s.openOptionsFromTitle();
    s.focus(DisplayItem.Scale);
    const from = s.events.length;
    s.press(Action.Left); // INTEGER → STRETCH (wraps)
    s.press(Action.Right); // → INTEGER (wraps)
    s.press(Action.Confirm); // → FIT
    s.press(Action.Confirm); // → STRETCH
    s.press(Action.Confirm); // → INTEGER
    expect(s.options(from)).toEqual([
      [UserOptionKind.ScaleMode, 2],
      [UserOptionKind.ScaleMode, 0],
      [UserOptionKind.ScaleMode, 1],
      [UserOptionKind.ScaleMode, 2],
      [UserOptionKind.ScaleMode, 0],
    ]);
    expect(s.flow.displayPage.scale.label).toBe(SCALE_MODE_LABELS[0]);
  });

  it('flips FLASHES with OK and wraps it with Left / Right', () => {
    const s = new Session(createSaveStore(null));
    s.openOptionsFromTitle();
    s.focus(DisplayItem.Flashes);
    const from = s.events.length;
    s.press(Action.Confirm); // REDUCED
    s.press(Action.Confirm); // NORMAL
    s.press(Action.Left); // REDUCED (wraps)
    s.press(Action.Right); // NORMAL (wraps)
    expect(s.options(from)).toEqual([
      [UserOptionKind.ReduceFlashing, 1],
      [UserOptionKind.ReduceFlashing, 0],
      [UserOptionKind.ReduceFlashing, 1],
      [UserOptionKind.ReduceFlashing, 0],
    ]);
    expect(s.flow.displayPage.flashes.label).toBe(FLASH_LABELS[0]);
  });

  it('pushes nothing when SHAKE or HITBOX is set to what it already is', () => {
    const s = new Session(createSaveStore(null));
    s.openOptionsFromTitle();
    s.focus(DisplayItem.Shake);
    const from = s.events.length;
    s.press(Action.Right); // already ON
    s.press(Action.Down);
    s.press(Action.Down);
    expect(s.flow.displayPage.menu.focus).toBe(DisplayItem.Hitbox);
    s.press(Action.Left); // already OFF
    expect(s.options(from)).toEqual([]);
    s.press(Action.Right); // ON
    s.press(Action.Right); // still ON
    s.press(Action.Confirm); // OFF
    expect(s.options(from)).toEqual([
      [UserOptionKind.ShowHitbox, 1],
      [UserOptionKind.ShowHitbox, 0],
    ]);
  });

  it('shows saved non-default values and writes nothing on BACK when nothing changed', async () => {
    const { storage, writes } = countingStorage();
    const first = createSaveStore(storage, await loadSave(storage));
    first.setOptions({
      ...first.options,
      display: {
        bulletPalette: 'tritanopia',
        scaleMode: 'fit',
        screenShake: false,
        reduceFlashing: true,
        showHitbox: true,
        bossHpBar: false,
        crtFilter: 'light',
        aspect: 'classic',
      },
    });
    await first.flush();
    const written = writes.length;
    const s = new Session(createSaveStore(storage, await loadSave(storage)));
    s.openOptionsFromTitle();
    const o = s.flow.displayPage;
    expect([o.scale.label, o.shake.value, o.flashes.label, o.hitbox.value]).toEqual([
      'FIT',
      false,
      'REDUCED',
      true,
    ]);
    s.focus(DisplayItem.Back);
    s.press(Action.Confirm);
    await settle();
    expect(writes).toHaveLength(written);
    expect(s.flow.stack.depth).toBe(2); // back on the Options screen
  });

  it('saves the display options when the Back button closes the screen', () => {
    const save = createSaveStore(null);
    const s = new Session(save);
    s.openOptionsFromTitle();
    s.focus(DisplayItem.Hitbox);
    s.press(Action.Right); // HITBOX ON
    s.press(Action.Up);
    s.press(Action.Up);
    s.press(Action.Up); // SCALE
    expect(s.flow.displayPage.menu.focus).toBe(DisplayItem.Scale);
    s.press(Action.Right); // FIT
    s.press(Action.Back);
    expect(save.options.display).toMatchObject({ scaleMode: 'fit', showHitbox: true });
  });

  it('works the same from the pause menu over a running game', () => {
    const save = createSaveStore(null);
    const s = new Session(save, 'game');
    s.hold(0, 10);
    s.press(Action.Pause);
    s.press(Action.Down); // OPTIONS
    s.press(Action.Confirm);
    s.hold(0, 2);
    s.openDisplay();
    s.focus(DisplayItem.Shake);
    const from = s.events.length;
    s.press(Action.Left); // SHAKE OFF
    expect(s.options(from)).toEqual([[UserOptionKind.ScreenShake, 0]]);
    s.focus(DisplayItem.Back);
    s.press(Action.Confirm);
    expect(save.options.display.screenShake).toBe(false);
  });

  it('shows a scale mode the screen does not know as INTEGER and saves INTEGER', () => {
    const save = saveWith({ scaleMode: 'zoom' as DisplayOptions['scaleMode'] });
    const s = new Session(save);
    s.openOptionsFromTitle();
    expect(s.flow.displayPage.scale.label).toBe('INTEGER');
    s.focus(DisplayItem.Back);
    s.press(Action.Confirm);
    expect(save.options.display.scaleMode).toBe('integer');
  });

  it('draws all nine rows of the DISPLAY page inside the panel and the frame, one line apart', () => {
    const s = new Session(createSaveStore(null));
    s.openOptionsFromTitle();
    const ui = s.game.renderFrame().ui;
    const rows = new Map<string, number>();
    let panelTop = Number.POSITIVE_INFINITY;
    let panelBottom = 0;
    for (let i = 0; i < ui.count; i++) {
      if (ui.op[i] === DrawOp.Text) rows.set(ui.strings[ui.ref[i]], ui.y[i]);
      // The panel: the largest rectangle drawn (the dim is not in the UI list).
      if (ui.op[i] === DrawOp.Rect && ui.w[i] >= 280 && ui.h[i] > 100) {
        panelTop = Math.min(panelTop, ui.y[i]);
        panelBottom = Math.max(panelBottom, ui.y[i] + ui.h[i]);
      }
    }
    // The page is drawn last (over the Options screen): its rows win the map.
    const labels = [
      'BULLETS',
      'SCALE',
      'SHAKE',
      'FLASHES',
      'HITBOX',
      'BOSS HP',
      'CRT',
      'ASPECT',
      'BACK',
    ];
    const ys = labels.map((label) => rows.get(label));
    expect(ys.every((y) => y !== undefined)).toBe(true);
    for (let i = 1; i < ys.length; i++) expect((ys[i] ?? 0) - (ys[i - 1] ?? 0)).toBe(14);
    const title = rows.get('DISPLAY') ?? -1;
    expect(title).toBeLessThan(ys[0] ?? 0);
    expect(panelTop).toBeLessThanOrEqual(title);
    // Glyphs are 8 px tall: the last row ends inside the panel, the panel inside the frame.
    expect((ys[ys.length - 1] ?? 0) + 8).toBeLessThanOrEqual(panelBottom);
    expect(panelTop).toBeGreaterThanOrEqual(0);
    // The 216-row frame: the playfield and the two 8-row HUD bars.
    expect(panelBottom).toBeLessThanOrEqual(PLAYFIELD_H + 16);
  });
});
