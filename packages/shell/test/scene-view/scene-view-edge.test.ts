/**
 * Edge cases of the scene flow's view (plan M1-16): the followed camera before any frame and
 * after the game is left, the backdrop's drift with the flow's tick and its tile layout, the
 * open-space starfield frozen with the World under the pause menu, the backdrop again after QUIT
 * TO TITLE (no new World counted), and a new World counted per game start.
 */
import {
  Action,
  ENGINE_SPRITES,
  PLAYFIELD_H,
  PLAYFIELD_W,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type Game,
  type HeadlessPlatform,
  type SpriteBatchView,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../../../vite.shared.js';
import { SCENE_VIEW_SPRITES, createSceneView } from '../../src/scene-view/index.js';

/** The real content, validated once. */
const DB = (() => {
  const { db, issues } = loadContent(readContentFiles(), { extraSprites: ENGINE_SPRITES });
  expect(issues).toEqual([]);
  return db;
})();

/**
 * A scene-flow game in open space, on the title.
 *
 * @returns The game and its platform.
 */
function flowGame(): { game: Game; platform: HeadlessPlatform } {
  const platform = createHeadlessPlatform();
  return { game: createGame(platform, { seed: 5 }, DB, { scenes: 'title' }), platform };
}

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

/**
 * Starts a game from the title (OK, START, NORMAL, KESTREL in the ship select, then START in
 * the weapon select).
 *
 * @param game - The game.
 * @param platform - Its platform.
 */
function start(game: Game, platform: HeadlessPlatform): void {
  press(game, platform, Action.Confirm);
  press(game, platform, Action.Confirm); // START → the difficulty menu
  press(game, platform, Action.Confirm); // NORMAL (buffered by the menu's open lock)
  game.step();
  press(game, platform, Action.Confirm); // KESTREL in the ship select (M2-05; buffered too)
  game.step();
  press(game, platform, Action.Confirm); // START in the weapon select (M2-03; buffered too)
  game.step();
  expect(game.scenes?.stack.top?.id).toBe('game');
}

/**
 * Quits a running game to the title (pause, QUIT TO TITLE, YES).
 *
 * @param game - The game.
 * @param platform - Its platform.
 */
function quit(game: Game, platform: HeadlessPlatform): void {
  press(game, platform, Action.Pause);
  press(game, platform, Action.Up);
  press(game, platform, Action.Confirm);
  press(game, platform, Action.Left);
  press(game, platform, Action.Confirm);
  expect(game.scenes?.stack.top?.id).toBe('title');
}

/**
 * The x positions of a batch.
 *
 * @param batch - The batch.
 * @returns Its x values.
 */
function xs(batch: SpriteBatchView): number[] {
  return Array.from(batch.x).slice(0, batch.count);
}

describe('shell/scene-view edge', () => {
  it('follows the backdrop before any frame and lays its tiles over the playfield', () => {
    const { game } = flowGame();
    const view = createSceneView(game);
    view.follow();
    expect([view.camera.x, view.camera.y]).toEqual([0, 0]);
    view.update(game.renderFrame());
    const [far, mid] = view.backdrop.batches;
    const columns = Math.ceil(PLAYFIELD_W / 128) + 1;
    const rows = Math.ceil(PLAYFIELD_H / 128);
    expect([far.count, mid.count]).toEqual([columns * rows, 2 * columns * rows]);
    const base = game.content.sprites.names.length;
    expect(view.spriteNames[far.spriteId[0]]).toBe(SCENE_VIEW_SPRITES[0]);
    expect(far.spriteId[0]).toBe(base);
    expect(mid.spriteId[0]).toBe(base + 1);
    expect(mid.spriteId[columns * rows]).toBe(base + 2);
  });

  it("drifts the backdrop with the flow's tick, each layer at its own speed", () => {
    const { game } = flowGame();
    const view = createSceneView(game);
    view.update(game.renderFrame());
    const [far, mid] = view.backdrop.batches;
    expect([far.x[0], mid.x[0]]).toEqual([0, 0]);
    for (let i = 0; i < 8; i++) game.step();
    view.update(game.renderFrame());
    const rows = Math.ceil(PLAYFIELD_H / 128);
    const columns = Math.ceil(PLAYFIELD_W / 128) + 1;
    // 8 ticks: far 0.125 px/tick, mid 0.25, near 0.5.
    expect([far.x[0], mid.x[0], mid.x[columns * rows]]).toEqual([-1, -2, -4]);
    expect(far.x[1] - far.x[0]).toBe(128);
    expect(far.y[columns] - far.y[0]).toBe(rows > 1 ? 128 : 0);
  });

  it('freezes the open-space starfield with the World under the pause menu', () => {
    const { game, platform } = flowGame();
    const view = createSceneView(game);
    start(game, platform);
    for (let i = 0; i < 10; i++) game.step();
    const frame = view.update(game.renderFrame());
    const stars = frame.world!.batches[1];
    const before = xs(stars);
    game.step();
    view.update(game.renderFrame());
    expect(xs(stars)).not.toEqual(before); // playing: it drifts
    press(game, platform, Action.Pause);
    const paused = xs(view.update(game.renderFrame()).world!.batches[1]);
    for (let i = 0; i < 30; i++) game.step();
    expect(xs(view.update(game.renderFrame()).world!.batches[1])).toEqual(paused);
  });

  it('shows the backdrop again after QUIT TO TITLE and counts a World per game only', () => {
    const { game, platform } = flowGame();
    const view = createSceneView(game);
    start(game, platform);
    for (let i = 0; i < 60; i++) {
      commitPlayerInput(platform.snapshot.players[0], Action.Down);
      game.step();
    }
    view.update(game.renderFrame());
    view.follow();
    expect(view.worldChanges).toBe(1);
    quit(game, platform);
    const frame = view.update(game.renderFrame());
    view.follow();
    expect(frame.world).toBe(view.backdrop);
    expect([view.camera.x, view.camera.y]).toEqual([0, 0]);
    expect(view.worldChanges).toBe(1);
    start(game, platform);
    view.update(game.renderFrame());
    expect(view.worldChanges).toBe(2);
  });
});
