/**
 * The Options screen's **EXTRAS page** of plan M3-02 (`ExtrasScene`): the four sim-affecting
 * mechanic extras — SLOWDOWN, GRAZE, DEATH BOMB, BLACK HOLE — as toggles that are stored in the
 * save (`UserOptions.play`) and reach the *next* game's `GameConfig`, never the World in play, and
 * the BLACK HOLE hint that only shows while that row is focused.
 *
 * The DISPLAY page's two M3-02 rows are here too: CRT and ASPECT apply **live** through
 * `UserOption` events and are stored as `UserOptions.display`.
 */
import { describe, expect, it } from 'vitest';
import {
  ASPECT_MODES,
  CRT_FILTERS,
  DEFAULT_DEATH_BOMB_TICKS,
  DEFAULT_PLAY_OPTIONS,
  DEFAULT_USER_OPTIONS,
  resolveUserOptions,
  userGameOverrides,
} from '../../src/config/index.js';
import { SimEventKind, UserOptionKind } from '../../src/events/index.js';
import { Action } from '../../src/input/index.js';
import { createMemoryStorage } from '../../src/platform/index.js';
import { createSaveStore, loadSave } from '../../src/save/index.js';
import { DisplayItem, ExtrasItem, OptionsItem, TitleItem } from '../../src/scenes/index.js';
import { frontEndContent } from '../helpers/front-end.js';
import { FrontEndSession } from '../helpers/front-end-session.js';
import type { SaveStore } from '../../src/save/index.js';

const { db } = frontEndContent();

/** Lets the save's pending writes finish. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A session with the Options screen open.
 *
 * @param save - The save store (default: memory only).
 * @returns The session.
 */
function optionsSession(save?: SaveStore): FrontEndSession {
  const s = new FrontEndSession({ db, save });
  s.press(Action.Confirm); // PRESS OK → the title menu
  s.hold(0, 2);
  while (s.flow.title.menu.focus !== TitleItem.Options) s.press(Action.Down);
  s.press(Action.Confirm);
  s.hold(0, 2);
  expect(s.top).toBe('options');
  return s;
}

/**
 * Opens a page of the Options screen.
 *
 * @param s - The session.
 * @param item - The `OptionsItem` row.
 */
function openPage(s: FrontEndSession, item: number): void {
  while (s.flow.options.menu.focus !== item) s.press(Action.Down);
  s.press(Action.Confirm);
  s.hold(0, 2);
}

/**
 * The `UserOption` events since an index.
 *
 * @param s - The session.
 * @param from - First event index.
 * @returns `[kind, value]` pairs.
 */
function userOptions(s: FrontEndSession, from: number): Array<[number, number]> {
  return s.events
    .slice(from)
    .filter((e) => e[0] === SimEventKind.UserOption)
    .map((e) => [e[1], e[2]]);
}

describe('core/scenes — the EXTRAS page (M3-02)', () => {
  it('sits under the Options screen with its four rows and BACK', () => {
    const s = optionsSession();
    expect(s.uiTexts()).toContain('EXTRAS');
    openPage(s, OptionsItem.Extras);
    expect(s.ids).toEqual(['title', 'options', 'extras']);
    const page = s.flow.extrasPage;
    expect(page.menu.focus).toBe(ExtrasItem.Slowdown);
    const texts = s.uiTexts();
    for (const label of ['SLOWDOWN', 'GRAZE', 'DEATH BOMB', 'BLACK HOLE', 'BACK']) {
      expect(texts).toContain(label);
    }
    // Every row starts at the default: off.
    expect([
      page.slowdown.value,
      page.graze.value,
      page.deathBomb.value,
      page.blackHole.value,
    ]).toEqual([false, false, false, false]);
  });

  it('shows the BLACK HOLE note only while that row is focused', () => {
    const s = optionsSession();
    openPage(s, OptionsItem.Extras);
    expect(s.uiTexts()).toContain('APPLIES FROM THE NEXT GAME');
    expect(s.uiTexts()).not.toContain('BLACK HOLE: THE DIRECT SHIP ONLY');
    while (s.flow.extrasPage.menu.focus !== ExtrasItem.BlackHole) s.press(Action.Down);
    expect(s.uiTexts()).toContain('BLACK HOLE: THE DIRECT SHIP ONLY');
    s.press(Action.Down); // BACK
    expect(s.uiTexts()).not.toContain('BLACK HOLE: THE DIRECT SHIP ONLY');
  });

  it('stores every toggle in the save and arms the next game with it', async () => {
    const { storage } = { storage: createMemoryStorage() };
    const save = createSaveStore(storage);
    const s = optionsSession(save);
    openPage(s, OptionsItem.Extras);
    const page = s.flow.extrasPage;
    s.press(Action.Right); // SLOWDOWN ON
    s.press(Action.Down);
    s.press(Action.Confirm); // GRAZE flips ON
    s.press(Action.Down);
    s.press(Action.Right); // DEATH BOMB ON
    s.press(Action.Down);
    s.press(Action.Right); // BLACK HOLE ON
    expect([
      page.slowdown.value,
      page.graze.value,
      page.deathBomb.value,
      page.blackHole.value,
    ]).toEqual([true, true, true, true]);
    // Nothing is stored until the page closes.
    expect(save.options.play).toEqual(DEFAULT_PLAY_OPTIONS);
    s.press(Action.Down);
    expect(page.menu.focus).toBe(ExtrasItem.Back);
    s.press(Action.Confirm);
    expect(s.top).toBe('options');
    expect(save.options.play).toMatchObject({
      slowdown: true,
      graze: true,
      deathBomb: true,
      blackHole: true,
    });
    // They are the next game's config, through `userGameOverrides`.
    expect(userGameOverrides(save.options)).toMatchObject({
      slowdown: true,
      graze: true,
      deathBomb: DEFAULT_DEATH_BOMB_TICKS,
      blackHole: true,
    });
    await settle();
    // And the next session reads them back into the page.
    const again = optionsSession(createSaveStore(storage, await loadSave(storage)));
    openPage(again, OptionsItem.Extras);
    const back = again.flow.extrasPage;
    expect([
      back.slowdown.value,
      back.graze.value,
      back.deathBomb.value,
      back.blackHole.value,
    ]).toEqual([true, true, true, true]);
  });

  it('a game started after the page carries the extras (APPLIES FROM THE NEXT GAME)', () => {
    const save = createSaveStore(null);
    const s = optionsSession(save);
    openPage(s, OptionsItem.Extras);
    s.press(Action.Right); // SLOWDOWN
    s.press(Action.Down);
    s.press(Action.Right); // GRAZE
    s.press(Action.Down);
    s.press(Action.Right); // DEATH BOMB
    while (s.flow.extrasPage.menu.focus !== ExtrasItem.Back) s.press(Action.Down);
    s.press(Action.Confirm);
    s.hold(0, 4);
    while (s.flow.options.menu.focus !== OptionsItem.Back) s.press(Action.Down);
    s.press(Action.Confirm); // out of the Options screen
    s.hold(0, 2);
    expect(s.top).toBe('title');
    // The title menu kept its focus on OPTIONS: go back up to 1 PLAYER.
    while (s.flow.title.menu.focus !== TitleItem.Start) s.press(Action.Up);
    s.presses([Action.Confirm]); // 1 PLAYER
    s.presses([Action.Confirm]); // NORMAL
    s.presses([Action.Confirm]); // START
    s.hold(0);
    expect(s.top).toBe('game');
    const config = s.game.world.config;
    expect(config.slowdown).toBe(true);
    expect(config.graze).toBe(true);
    expect(config.deathBomb).toBe(DEFAULT_DEATH_BOMB_TICKS);
    expect(config.blackHole).toBe(false);
  });

  it('the Back button closes and stores the page just like BACK', () => {
    const save = createSaveStore(null);
    const s = optionsSession(save);
    openPage(s, OptionsItem.Extras);
    s.press(Action.Right); // SLOWDOWN ON
    s.press(Action.Back);
    expect(s.top).toBe('options');
    expect(save.options.play.slowdown).toBe(true);
  });

  it('a saved page with rubbish in it falls back to the defaults', () => {
    const options = resolveUserOptions({
      play: { slowdown: 'yes', graze: 1, deathBomb: null, blackHole: undefined },
    });
    expect(options.play).toMatchObject({
      slowdown: false,
      graze: false,
      deathBomb: false,
      blackHole: false,
    });
    expect(userGameOverrides(DEFAULT_USER_OPTIONS)).toEqual({});
  });
});

describe('core/scenes — the DISPLAY page CRT and ASPECT rows (M3-02)', () => {
  it('applies both live and stores them', async () => {
    const storage = createMemoryStorage();
    const save = createSaveStore(storage);
    const s = optionsSession(save);
    openPage(s, OptionsItem.Display);
    const page = s.flow.displayPage;
    /**
     * The page's focused row (read through a call, so nothing narrows it).
     *
     * @returns The `DisplayItem` row.
     */
    const focus = (): number => page.menu.focus;
    while (focus() !== DisplayItem.Crt) s.press(Action.Down);
    const from = s.events.length;
    s.press(Action.Right); // LIGHT
    s.press(Action.Right); // FULL
    s.press(Action.Down);
    expect(focus()).toBe(DisplayItem.Aspect);
    s.press(Action.Right); // WIDE
    s.press(Action.Right); // CLASSIC
    expect(userOptions(s, from)).toEqual([
      [UserOptionKind.CrtFilter, 1],
      [UserOptionKind.CrtFilter, 2],
      [UserOptionKind.Aspect, 1],
      [UserOptionKind.Aspect, 2],
    ]);
    expect(CRT_FILTERS[page.crt.index]).toBe('full');
    expect(ASPECT_MODES[page.aspect.index]).toBe('classic');
    while (focus() !== DisplayItem.Back) s.press(Action.Down);
    s.press(Action.Confirm);
    expect(save.options.display).toMatchObject({ crtFilter: 'full', aspect: 'classic' });
    await settle();
    const again = optionsSession(createSaveStore(storage, await loadSave(storage)));
    openPage(again, OptionsItem.Display);
    expect(CRT_FILTERS[again.flow.displayPage.crt.index]).toBe('full');
    expect(ASPECT_MODES[again.flow.displayPage.aspect.index]).toBe('classic');
  });

  it('wraps around the ends of both lists', () => {
    const s = optionsSession();
    openPage(s, OptionsItem.Display);
    const page = s.flow.displayPage;
    while (page.menu.focus !== DisplayItem.Crt) s.press(Action.Down);
    expect(page.crt.index).toBe(0);
    s.press(Action.Left);
    expect(page.crt.index).toBe(CRT_FILTERS.length - 1);
    for (let i = 0; i < CRT_FILTERS.length; i++) s.press(Action.Right);
    expect(page.crt.index).toBe(CRT_FILTERS.length - 1);
    s.press(Action.Down);
    expect(page.aspect.index).toBe(0);
    s.press(Action.Left);
    expect(page.aspect.index).toBe(ASPECT_MODES.length - 1);
    for (let i = 0; i < ASPECT_MODES.length; i++) s.press(Action.Right);
    expect(page.aspect.index).toBe(ASPECT_MODES.length - 1);
  });

  it('a saved display section with unknown names falls back to off / normal', () => {
    const options = resolveUserOptions({ display: { crtFilter: 'plasma', aspect: 'square' } });
    expect(options.display.crtFilter).toBe('off');
    expect(options.display.aspect).toBe('normal');
  });
});
