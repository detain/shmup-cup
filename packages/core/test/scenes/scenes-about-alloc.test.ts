/**
 * Allocation guard of the AboutScene of the owner order 2026-10-27 (definition of done: zero
 * allocations per tick and per frame): with the screen open over the title, the frame is composed
 * every tick while nothing is pressed — the panel, the headline, the four rows, the page label and
 * the hint all re-reference their constructor / table strings. Turning a page is a menu action: the
 * one string it builds (`formatUiText` of `PAGE {0}/{1}`) rides outside the measured loop, proven
 * by the functional test below. Mirrors `scenes-options-pages-alloc.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { createGame, type Game } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import { createSaveStore } from '../../src/save/index.js';
import { TitleItem, type SceneFlow } from '../../src/scenes/index.js';
import { measureHeapGrowth } from '../helpers/alloc.js';

/** A session on the title with the AboutScene open (setup only — never measured). */
class Session {
  readonly platform: HeadlessPlatform = createHeadlessPlatform();
  readonly game: Game;
  readonly flow: SceneFlow;

  constructor() {
    this.game = createGame(this.platform, { remoteMode: false }, undefined, {
      scenes: 'title',
      save: createSaveStore(null),
      inputProfiles: { choices: [], active: '' },
    });
    this.flow = this.game.scenes!;
  }

  /** One tick with a held mask (the frame composed, the events dropped). */
  tap(held: number): void {
    commitPlayerInput(this.platform.snapshot.players[0], held);
    this.game.step();
    commitPlayerInput(this.platform.snapshot.players[0], 0);
    this.game.step();
    this.game.events.clear();
  }

  /** Opens HELP from the title prompt. */
  openHelp(): void {
    this.tap(Action.Confirm);
    while (this.flow.title.menu.focus !== TitleItem.Help) this.tap(Action.Down);
    this.tap(Action.Confirm);
    this.tap(0);
    this.tap(0);
  }
}

describe('core/scenes AboutScene allocation (owner order 2026-10-27)', () => {
  it('idles over the title without allocating', () => {
    const s = new Session();
    s.openHelp();
    expect(s.flow.stack.top?.id).toBe('about');
    const player = s.platform.snapshot.players[0];
    const growth = measureHeapGrowth(
      () => {
        commitPlayerInput(player, 0);
        s.game.step();
        s.game.renderFrame();
        s.game.events.drain(() => undefined);
      },
      20_000,
      20_000,
    );
    expect(s.flow.stack.top?.id).toBe('about');
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });

  it('turns the pages both ways, wrapping, while it draws', () => {
    const s = new Session();
    s.openHelp();
    const about = s.flow.about;
    expect(about.page).toBe(0);
    for (let i = 0; i < 7; i++) {
      s.tap(Action.Right);
      s.tap(0);
      s.tap(0);
    }
    expect(about.page).toBe(1); // 6 pages, wrapped once
    s.tap(Action.Left);
    s.tap(0);
    s.tap(0);
    expect(about.page).toBe(0);
    s.tap(Action.Back);
    s.tap(0);
    s.tap(0);
    s.tap(0);
    expect(s.flow.stack.top?.id).toBe('title');
  });
});
