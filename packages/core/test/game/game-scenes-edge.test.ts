/**
 * Edge cases of `createGame` with and without the scene flow (plan M1-16): `game.world` follows the
 * flow's World across starts, the binding context across every transition, the platform's `exit`
 * deciding the title's EXIT item, the frame's dim cleared once the pause menu closes and `alpha`
 * 0 while the host freezes the flow, and bare gameplay ignoring a game over (nothing reacts).
 */
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/game/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform, type HeadlessPlatform } from '../../src/platform/index.js';
import type { Game } from '../../src/game/index.js';

/**
 * Presses and releases an action (two ticks).
 *
 * @param game - The game.
 * @param platform - Its platform.
 * @param action - The action.
 */
function press(game: Game, platform: HeadlessPlatform, action: number): void {
  commitPlayerInput(platform.snapshot.players[0], action);
  game.step();
  commitPlayerInput(platform.snapshot.players[0], 0);
  game.step();
}

describe('core/game edge: the scene flow', () => {
  it("follows the flow's World and binding context through start, pause, resume and retry", () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform, {}, undefined, { scenes: 'title' });
    const flow = game.scenes!;
    const contexts: string[] = [game.inputContext];
    expect(game.world).toBe(flow.world);
    press(game, platform, Action.Confirm);
    press(game, platform, Action.Confirm); // START → the difficulty menu
    press(game, platform, Action.Confirm); // NORMAL (buffered by the menu's open lock)
    game.step();
    contexts.push(game.inputContext);
    press(game, platform, Action.Confirm); // START in the weapon select (M2-03)
    game.step();
    contexts.push(game.inputContext);
    const first = game.world;
    expect(first).toBe(flow.world);
    press(game, platform, Action.Pause);
    contexts.push(game.inputContext);
    press(game, platform, Action.Down); // OPTIONS
    press(game, platform, Action.Down); // RETRY
    press(game, platform, Action.Confirm);
    contexts.push(game.inputContext);
    expect(game.world).not.toBe(first);
    expect(game.world).toBe(flow.world);
    expect(contexts).toEqual(['menu', 'menu', 'game', 'menu', 'game']);
  });

  it('offers EXIT only on a platform that can quit', () => {
    const tv = Object.assign(createHeadlessPlatform(), { exit: () => {} });
    const labels = (game: Game): string[] => game.scenes!.title.menu.items.map((i) => i.label);
    expect(labels(createGame(tv, {}, undefined, { scenes: 'title' }))).toEqual([
      'START',
      'OPTIONS',
      'EXIT',
    ]);
    const browser = Object.assign(createHeadlessPlatform(), { exit: null });
    expect(labels(createGame(browser, {}, undefined, { scenes: 'title' }))).toEqual([
      'START',
      'OPTIONS',
    ]);
  });

  it('clears the dim when the pause menu closes and holds alpha at 0 while frozen', () => {
    const platform = createHeadlessPlatform();
    const game = createGame(platform, {}, undefined, { scenes: 'game' });
    press(game, platform, Action.Pause);
    expect(game.renderFrame().screen.dim).toBeGreaterThan(0);
    press(game, platform, Action.Pause);
    expect(game.renderFrame().screen.dim).toBe(0);
    game.pause();
    expect(game.renderFrame().alpha).toBe(0);
    const tick = game.state.tick;
    press(game, platform, Action.Pause); // frozen: nothing runs, no pause menu
    expect([game.state.tick, game.scenes?.stack.top?.id]).toEqual([tick, 'game']);
    game.resume();
    expect(game.renderFrame()).toBe(game.renderFrame()); // one reused frame
  });
});

describe('core/game edge: bare gameplay', () => {
  it('keeps simulating after a game over (no scene reacts)', () => {
    const game = createGame(createHeadlessPlatform());
    game.world.status = 'gameOver';
    for (let i = 0; i < 100; i++) game.step();
    expect([game.world.tick, game.world.status, game.scenes]).toEqual([100, 'gameOver', null]);
    const frame = game.renderFrame();
    expect([frame.world, frame.hud.count, frame.ui.count, frame.screen.dim]).toEqual([
      game.world.view,
      0,
      0,
      0,
    ]);
  });
});
