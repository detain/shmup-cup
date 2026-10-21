/**
 * The Options screen's **GRAPHICS page** of plan R6-04 (`GraphicsScene`, owner decision W5-20):
 * OUTPUT and RENDERER (the two **boot knobs** — stored, applied when the next renderer is created,
 * marked by the `APPLIES AT RESTART` hint while focused) and the CRT / ASPECT rows moved here from
 * DISPLAY in the same step (they still apply **live** through `UserOption` events). BACK stores
 * all four, preserving the DISPLAY page's fields, and the two pages never clobber each other's.
 */
import { describe, expect, it } from 'vitest';
import {
  ASPECT_MODES,
  CRT_FILTERS,
  OUTPUT_CAPS,
  RENDERER_CHOICES,
  resolveUserOptions,
} from '../../src/config/index.js';
import { SimEventKind, UserOptionKind } from '../../src/events/index.js';
import { Action } from '../../src/input/index.js';
import { createMemoryStorage } from '../../src/platform/index.js';
import { createSaveStore, loadSave, type SaveStore } from '../../src/save/index.js';
import { DisplayItem, GraphicsItem, OptionsItem, TitleItem } from '../../src/scenes/index.js';
import { frontEndContent } from '../helpers/front-end.js';
import { FrontEndSession } from '../helpers/front-end-session.js';

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

describe('core/scenes — the GRAPHICS page (R6-04)', () => {
  it('sits under the Options screen with its four rows and BACK, focused on OUTPUT', () => {
    const s = optionsSession();
    openPage(s, OptionsItem.Graphics);
    expect(s.top).toBe('graphics');
    expect(s.uiTexts()).toEqual(
      expect.arrayContaining(['GRAPHICS', 'OUTPUT', 'RENDERER', 'CRT', 'ASPECT', 'BACK']),
    );
    expect(s.flow.graphicsPage.menu.focus).toBe(GraphicsItem.Output);
  });

  it('DISPLAY lost its CRT and ASPECT rows to the new page', () => {
    const s = optionsSession();
    openPage(s, OptionsItem.Display);
    expect(s.uiTexts()).not.toContain('CRT');
    expect(s.uiTexts()).not.toContain('ASPECT');
    const labels = s
      .uiTexts()
      .filter((text) =>
        ['BULLETS', 'SCALE', 'SHAKE', 'FLASHES', 'HITBOX', 'BOSS HP', 'LANGUAGE', 'BACK'].includes(
          text,
        ),
      );
    // The page draws over the Options screen, whose own BACK row counts once too.
    expect([...labels].sort()).toEqual(
      [
        'BULLETS',
        'SCALE',
        'SHAKE',
        'FLASHES',
        'HITBOX',
        'BOSS HP',
        'LANGUAGE',
        'BACK',
        'BACK',
      ].sort(),
    );
  });

  it('CRT and ASPECT still apply live through their moved events', () => {
    const s = optionsSession();
    openPage(s, OptionsItem.Graphics);
    const page = s.flow.graphicsPage;
    page.menu.focus = GraphicsItem.Crt;
    s.hold(0, 1);
    const from = s.events.length;
    s.press(Action.Right); // LIGHT
    s.press(Action.Right); // FULL
    s.press(Action.Down);
    expect(page.menu.focus).toBe(GraphicsItem.Aspect);
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
  });

  it('OUTPUT and RENDERER announce restart-pending events with the choice index', () => {
    const s = optionsSession();
    openPage(s, OptionsItem.Graphics);
    const page = s.flow.graphicsPage;
    const from = s.events.length;
    s.press(Action.Right); // OUTPUT 1920X1080
    expect(page.output.label).toBe('1920X1080');
    s.press(Action.Down);
    s.press(Action.Right); // RENDERER WEBGL 2
    expect(page.renderer.label).toBe('WEBGL 2');
    expect(userOptions(s, from)).toEqual([
      [UserOptionKind.Output, 1],
      [UserOptionKind.Renderer, 1],
    ]);
  });

  it('the APPLIES AT RESTART hint marks the two boot rows only', () => {
    const s = optionsSession();
    openPage(s, OptionsItem.Graphics);
    expect(s.uiTexts()).toContain('APPLIES AT RESTART'); // OUTPUT focused
    s.press(Action.Down);
    expect(s.uiTexts()).toContain('APPLIES AT RESTART'); // RENDERER focused
    s.press(Action.Down);
    expect(s.uiTexts()).not.toContain('APPLIES AT RESTART'); // CRT: live
    s.press(Action.Down);
    expect(s.uiTexts()).not.toContain('APPLIES AT RESTART'); // ASPECT: live
  });

  it('BACK stores all four, keeps the DISPLAY fields, and the next boot reads them back', async () => {
    const storage = createMemoryStorage();
    const seed = createSaveStore(storage);
    seed.setOptions({
      ...seed.options,
      display: {
        ...seed.options.display,
        bulletPalette: 'protanopia',
        scaleMode: 'stretch',
      },
    });
    await seed.flush();
    const save = createSaveStore(storage, await loadSave(storage));
    const s = optionsSession(save);
    openPage(s, OptionsItem.Graphics);
    const page = s.flow.graphicsPage;
    page.menu.focus = GraphicsItem.Output;
    s.hold(0, 1);
    s.press(Action.Right); // 1080
    page.menu.focus = GraphicsItem.Renderer;
    s.hold(0, 1);
    s.press(Action.Right); // WEBGL 2
    s.press(Action.Right); // WEBGL 1
    page.menu.focus = GraphicsItem.Crt;
    s.hold(0, 1);
    s.press(Action.Right); // LIGHT
    page.menu.focus = GraphicsItem.Aspect;
    s.hold(0, 1);
    s.press(Action.Right); // ULTRA-WIDE
    s.press(Action.Back);
    expect(save.options.display).toEqual({
      bulletPalette: 'protanopia',
      scaleMode: 'stretch',
      screenShake: true,
      reduceFlashing: false,
      showHitbox: false,
      bossHpBar: false,
      crtFilter: 'light',
      aspect: 'wide',
      output: '1080',
      renderer: 'webgl1',
      language: 'en',
    });
    await settle();
    const again = optionsSession(createSaveStore(storage, await loadSave(storage)));
    openPage(again, OptionsItem.Graphics);
    const a = again.flow.graphicsPage;
    expect([
      OUTPUT_CAPS[a.output.index],
      RENDERER_CHOICES[a.renderer.index],
      CRT_FILTERS[a.crt.index],
      ASPECT_MODES[a.aspect.index],
    ]).toEqual(['1080', 'webgl1', 'light', 'wide']);
  });

  it('the DISPLAY page stores its fields and keeps the four graphics values', async () => {
    const storage = createMemoryStorage();
    const seed = createSaveStore(storage);
    seed.setOptions({
      ...seed.options,
      display: { ...seed.options.display, output: '540', crtFilter: 'full' },
    });
    await seed.flush();
    const save = createSaveStore(storage, await loadSave(storage));
    const s = optionsSession(save);
    openPage(s, OptionsItem.Display);
    const page = s.flow.displayPage;
    page.menu.focus = DisplayItem.Shake;
    s.hold(0, 1);
    s.press(Action.Confirm); // SHAKE OFF
    s.press(Action.Back);
    expect(save.options.display).toMatchObject({
      screenShake: false,
      output: '540',
      crtFilter: 'full',
    });
  });

  it('wraps around the ends of the two boot lists', () => {
    const s = optionsSession();
    openPage(s, OptionsItem.Graphics);
    const page = s.flow.graphicsPage;
    expect(page.output.index).toBe(0);
    s.press(Action.Left);
    expect(page.output.index).toBe(OUTPUT_CAPS.length - 1);
    for (let i = 0; i < OUTPUT_CAPS.length; i++) s.press(Action.Right);
    expect(page.output.index).toBe(OUTPUT_CAPS.length - 1);
    page.menu.focus = GraphicsItem.Renderer;
    s.hold(0, 1);
    s.press(Action.Left);
    expect(page.renderer.index).toBe(RENDERER_CHOICES.length - 1);
  });

  it('a saved display section with unknown boot names falls back to auto', () => {
    const options = resolveUserOptions({ display: { output: '4K', renderer: 'webgl3' } });
    expect(options.display.output).toBe('auto');
    expect(options.display.renderer).toBe('auto');
  });

  it('the defaults are auto / auto', () => {
    const s = optionsSession();
    openPage(s, OptionsItem.Graphics);
    const page = s.flow.graphicsPage;
    expect(OUTPUT_CAPS[page.output.index]).toBe('auto');
    expect(RENDERER_CHOICES[page.renderer.index]).toBe('auto');
    expect(page.output.label).toBe('AUTO');
    expect(page.renderer.label).toBe('AUTO');
  });
});
