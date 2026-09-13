/**
 * The scene flow's view with the weapon select's live preview (plan M2-03): the frame shows the
 * preview's World — its own view on the shipped weapon range (parallax and terrain), or the
 * open-space starfield under its batches when the content has no range — counted as a World shown,
 * followed by the camera while the select is open, and replaced by the game's World on START
 * (another World counted) or by the difficulty menu's backdrop on Back.
 */
import {
  Action,
  ENGINE_SPRITES,
  commitPlayerInput,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type ContentDb,
  type ContentFile,
  type Game,
  type HeadlessPlatform,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../../../vite.shared.js';
import { createSceneView } from '../../src/scene-view/index.js';

/**
 * Validated content.
 *
 * @param files - The content files.
 * @returns The DB.
 */
function content(files: ContentFile[]): ContentDb {
  const { db, issues } = loadContent(files, { extraSprites: ENGINE_SPRITES });
  expect(issues).toEqual([]);
  return db;
}

/** The real content (the weapon range included). */
const DB = content(readContentFiles());

/** The real content without the weapon range stage (the preview then flies open space). */
const NO_RANGE = content(
  readContentFiles().filter((file) => !file.path.endsWith('weapon-range.stage.json')),
);

/**
 * A scene-flow game in open space, on the title.
 *
 * @param db - The content.
 * @returns The game and its platform.
 */
function flowGame(db: ContentDb): { game: Game; platform: HeadlessPlatform } {
  const platform = createHeadlessPlatform();
  return { game: createGame(platform, { seed: 5 }, db, { scenes: 'title' }), platform };
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
 * Opens the weapon select from the title (OK, START, NORMAL) and lets its lock run out.
 *
 * @param game - The game.
 * @param platform - Its platform.
 */
function openSelect(game: Game, platform: HeadlessPlatform): void {
  press(game, platform, Action.Confirm);
  press(game, platform, Action.Confirm);
  press(game, platform, Action.Confirm);
  game.step();
  game.step();
  expect(game.scenes?.stack.top?.id).toBe('weaponSelect');
}

describe('shell/scene-view with the weapon select`s preview (M2-03)', () => {
  it('shows the preview on the weapon range as is, follows its camera, then the game`s World', () => {
    const { game, platform } = flowGame(DB);
    const view = createSceneView(game);
    view.update(game.renderFrame());
    expect(view.worldChanges).toBe(0);
    openSelect(game, platform);
    const preview = game.scenes!.weaponSelect.preview!;
    expect(preview.stage?.stage.id).toBe('weapon-range');
    let frame = view.update(game.renderFrame());
    expect(frame.world).toBe(preview.view);
    expect(view.worldChanges).toBe(1);
    // The range scrolls: the view follows the preview's camera, frame after frame.
    for (let i = 0; i < 40; i++) game.step();
    view.update(game.renderFrame());
    view.follow();
    expect(preview.camera.x).toBeGreaterThan(0);
    expect([view.camera.x, view.camera.y]).toEqual([preview.camera.x, preview.camera.y]);
    // The same preview is one World shown, however many frames.
    view.update(game.renderFrame());
    expect(view.worldChanges).toBe(1);
    // START: the game's World (open space — its starfield wrapper), another World counted.
    press(game, platform, Action.Confirm);
    expect(game.scenes?.stack.top?.id).toBe('game');
    frame = view.update(game.renderFrame());
    expect(frame.world).not.toBe(preview.view);
    expect(frame.world).not.toBe(view.backdrop);
    expect(view.worldChanges).toBe(2);
    view.follow();
    expect([view.camera.x, view.camera.y]).toEqual([game.world.camera.x, game.world.camera.y]);
  });

  it('wraps an open-space preview in the starfield; Back shows the backdrop again', () => {
    const { game, platform } = flowGame(NO_RANGE);
    const view = createSceneView(game);
    openSelect(game, platform);
    const preview = game.scenes!.weaponSelect.preview!;
    expect(preview.stage).toBeNull();
    const frame = view.update(game.renderFrame());
    expect(frame.world).not.toBe(preview.view);
    expect(frame.world).not.toBe(view.backdrop);
    expect(frame.world!.camera).toBe(preview.view.camera);
    expect(view.worldChanges).toBe(1);
    press(game, platform, Action.Back);
    expect(game.scenes?.stack.top?.id).toBe('difficulty');
    expect(view.update(game.renderFrame()).world).toBe(view.backdrop);
    view.follow();
    expect([view.camera.x, view.camera.y]).toEqual([0, 0]);
    // A new visit is a new preview World.
    game.step();
    game.step();
    press(game, platform, Action.Confirm);
    game.step();
    game.step();
    expect(game.scenes?.stack.top?.id).toBe('weaponSelect');
    view.update(game.renderFrame());
    expect(view.worldChanges).toBe(2);
  });
});
