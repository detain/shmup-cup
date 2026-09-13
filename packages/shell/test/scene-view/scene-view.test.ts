/**
 * Tests for the scene flow's view (plan M1-16): its starfield sprites exist in the real atlas and
 * follow the content's names; outside a game the frame shows the starfield backdrop; in a game in
 * open space the World's batches are drawn over a starfield on the World's camera (a wrapper built
 * once per World), a stage's own view is used as is; the game's HUD / UI / screen pass through;
 * the followed camera; no allocation per displayed frame.
 */
import {
  Action,
  ENGINE_SPRITES,
  LayerId,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type Game,
  type HeadlessPlatform,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';
import { SCENE_VIEW_SPRITES, createSceneView, moduleInfo } from '../../src/scene-view/index.js';

/**
 * A scene-flow game on the real content.
 *
 * @param stage - Stage id, or `null` for open space.
 * @returns The game and its platform.
 */
function flowGame(stage: string | null = null): { game: Game; platform: HeadlessPlatform } {
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

describe('shell/scene-view', () => {
  it('describes itself and names only sprites the asset pipeline produces', () => {
    expect(moduleInfo.name).toBe('scene-view');
    const { manifest } = buildAtlas();
    for (const name of SCENE_VIEW_SPRITES) expect(Object.keys(manifest.sprites)).toContain(name);
  });

  it("appends its sprites after the content's names (the UI kit's ids keep their meaning)", () => {
    const { game } = flowGame();
    const view = createSceneView(game);
    expect(view.spriteNames).toEqual([...game.content.sprites.names, ...SCENE_VIEW_SPRITES]);
    expect(view.spriteNames).toContain('ui/logo');
  });

  it('shows the starfield backdrop on the title, passing the HUD, UI and screen through', () => {
    const { game } = flowGame();
    const view = createSceneView(game);
    const source = game.renderFrame();
    const frame = view.update(source);
    expect(frame).toBe(view.frame);
    expect(frame.world).toBe(view.backdrop);
    expect([frame.hud, frame.ui, frame.screen]).toEqual([source.hud, source.ui, source.screen]);
    const [far, mid] = view.backdrop.batches;
    expect([far.layer, mid.layer]).toEqual([LayerId.BgFar, LayerId.BgMid]);
    expect(far.count).toBeGreaterThan(0);
    expect(mid.count).toBe(2 * far.count);
    expect(view.worldChanges).toBe(0);
  });

  it("draws a game in open space over a starfield on the World's camera, one wrapper per World", () => {
    const { game, platform } = flowGame();
    const view = createSceneView(game);
    start(game, platform);
    const frame = view.update(game.renderFrame());
    const world = frame.world!;
    expect(world).not.toBe(view.backdrop);
    expect(world.camera).toBe(game.world.view.camera);
    expect(world.batches.slice(2)).toEqual(game.world.view.batches);
    expect(world.batches[0].count).toBeGreaterThan(0);
    expect(view.worldChanges).toBe(1);
    game.step();
    expect(view.update(game.renderFrame()).world).toBe(world);
    // RETRY STAGE: another World, another wrapper.
    press(game, platform, Action.Pause);
    press(game, platform, Action.Down); // OPTIONS
    press(game, platform, Action.Down); // RETRY STAGE
    press(game, platform, Action.Confirm);
    const retried = view.update(game.renderFrame()).world!;
    expect(retried).not.toBe(world);
    expect(retried.batches.slice(2)).toEqual(game.world.view.batches);
    expect(view.worldChanges).toBe(2);
  });

  it("uses a stage's own view (its parallax and terrain) as is", () => {
    const { game, platform } = flowGame('test-range');
    const view = createSceneView(game);
    start(game, platform);
    expect(view.update(game.renderFrame()).world).toBe(game.world.view);
  });

  it("follows the World's camera in a game and the backdrop's outside", () => {
    const { game, platform } = flowGame('test-range');
    const view = createSceneView(game);
    view.update(game.renderFrame());
    view.follow();
    expect([view.camera.x, view.camera.y]).toEqual([0, 0]);
    start(game, platform);
    for (let i = 0; i < 200; i++) game.step();
    view.update(game.renderFrame());
    view.follow();
    expect(game.world.camera.x).toBeGreaterThan(0);
    expect(view.camera.x).toBe(game.world.camera.x);
  });

  it('allocates nothing per displayed frame', () => {
    const { game, platform } = flowGame();
    const view = createSceneView(game);
    start(game, platform);
    let drawn = 0;
    const growth = measureHeapGrowth(
      () => {
        game.step();
        view.follow();
        drawn += view.update(game.renderFrame()).tick & 1;
        game.events.clear();
      },
      10_000,
      20_000,
    );
    expect(drawn).toBeGreaterThan(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
