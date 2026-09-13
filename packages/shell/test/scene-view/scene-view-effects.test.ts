/**
 * The scene flow's view hands the M2-08 presentation data to the renderer (plan M2-08): on the
 * `raster-range` dev stage its World view — with the stage's raster effects and palette cycles and
 * the ships' hitbox mirror — is drawn as is; in open space the starfield wrapper forwards the
 * hitbox mirror (and no effects).
 */
import {
  Action,
  ENGINE_SPRITES,
  RasterKind,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type Game,
  type HeadlessPlatform,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../../../vite.shared.js';
import { createSceneView } from '../../src/scene-view/index.js';

/**
 * A scene-flow game on the real content.
 *
 * @param stage - Stage id, or `null` for open space.
 * @returns The game and its platform.
 */
function flowGame(stage: string | null): { game: Game; platform: HeadlessPlatform } {
  const { db, issues } = loadContent(readContentFiles(), { extraSprites: ENGINE_SPRITES });
  expect(issues).toEqual([]);
  const platform = createHeadlessPlatform();
  return { game: createGame(platform, { seed: 1, stage }, db, { scenes: 'title' }), platform };
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
 * Starts a game from the title (OK, START, NORMAL, the ship select, the weapon select).
 *
 * @param game - The game.
 * @param platform - Its platform.
 */
function start(game: Game, platform: HeadlessPlatform): void {
  press(game, platform, Action.Confirm);
  press(game, platform, Action.Confirm);
  press(game, platform, Action.Confirm);
  game.step();
  press(game, platform, Action.Confirm);
  game.step();
  press(game, platform, Action.Confirm);
  game.step();
  expect(game.scenes?.stack.top?.id).toBe('game');
}

describe('shell/scene-view presentation effects and hitboxes (M2-08)', () => {
  it("draws the raster range's own view: its effects and the hitbox mirror", () => {
    const { game, platform } = flowGame('raster-range');
    const view = createSceneView(game);
    start(game, platform);
    const world = view.update(game.renderFrame()).world;
    expect(world).toBe(game.world.view);
    const effects = world?.effects;
    expect(effects?.raster.map((r) => r.kind)).toEqual([
      RasterKind.Wave,
      RasterKind.Lines,
      RasterKind.Haze,
    ]);
    expect(effects?.cycles).toHaveLength(1);
    expect(world?.hitboxes).toBe(game.world.hitboxBatch);
  });

  it('forwards the hitbox mirror through the open-space starfield wrapper', () => {
    const { game, platform } = flowGame(null);
    const view = createSceneView(game);
    start(game, platform);
    const world = view.update(game.renderFrame()).world;
    expect(world).not.toBe(game.world.view);
    expect(world?.hitboxes).toBe(game.world.hitboxBatch);
    expect(world?.effects ?? null).toBeNull();
  });
});
