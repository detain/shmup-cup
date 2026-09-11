/**
 * Tests for the free-flight scene (plan M1-06): its own sprites exist in the real atlas and are
 * appended after the content's names, its world view is the starfield followed by the game
 * World's batches on the game's live camera, update() copies the game frame and fills a
 * starfield that covers the playfield wherever the camera is, the HUD is rebuilt only when the
 * stock changes, and the KESTREL moved by input shows up in the drawn batches.
 */
import {
  Action,
  DrawOp,
  LayerId,
  PLAYFIELD_H,
  PLAYFIELD_W,
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
import { FLIGHT_SPRITES, createFlightScene, moduleInfo } from '../../src/flight/index.js';

/**
 * A game on the real content (core kinds only).
 *
 * @returns The game and its headless platform.
 */
function realGame(): { game: Game; platform: HeadlessPlatform } {
  const { db, issues } = loadContent(readContentFiles());
  expect(issues).toEqual([]);
  const platform = createHeadlessPlatform();
  return { game: createGame(platform, { seed: 1 }, db), platform };
}

describe('shell/flight', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('flight');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('names only sprites the asset pipeline produces', () => {
    const { manifest } = buildAtlas();
    for (const name of FLIGHT_SPRITES) expect(Object.keys(manifest.sprites)).toContain(name);
  });

  it("appends its sprites after the content's names, so world ids keep their meaning", () => {
    const { game } = realGame();
    const flight = createFlightScene(game);
    const names = game.content.sprites.names;
    expect(flight.spriteNames).toEqual([...names, ...FLIGHT_SPRITES]);
    const shipId = game.world.playerBatch.spriteId[0];
    expect(flight.spriteNames[shipId]).toBe('ships/kestrel');
  });

  it("draws the starfield under the game World's batches, on the game's camera", () => {
    const { game } = realGame();
    const flight = createFlightScene(game);
    expect(flight.world.camera).toBe(game.world.camera);
    const layers = flight.world.batches.map((batch) => batch.layer);
    expect(layers).toEqual([
      LayerId.BgFar,
      LayerId.BgMid,
      LayerId.GroundEnemies,
      LayerId.AirEnemies,
      LayerId.Player,
    ]);
    expect(flight.world.batches.slice(2)).toEqual(game.world.view.batches);
    expect(flight.world.batches[2]).toBe(game.world.enemies.groundBatch);
    expect(flight.world.batches[3]).toBe(game.world.enemies.airBatch);
    expect(flight.world.batches[4]).toBe(game.world.playerBatch);
  });

  it('copies the game frame and reuses its own', () => {
    const { game } = realGame();
    const flight = createFlightScene(game);
    for (let i = 0; i < 5; i++) game.step();
    const source = game.renderFrame();
    const frame = flight.update(source);
    expect(frame).toBe(flight.frame);
    expect([frame.tick, frame.alpha, frame.screen, frame.world]).toEqual([
      5,
      source.alpha,
      source.screen,
      flight.world,
    ]);
    expect(flight.update(source)).toBe(frame);
    expect(frame.ui.count).toBe(0);
  });

  it('the starfield covers the playfield wherever the camera is', () => {
    const { game } = realGame();
    const flight = createFlightScene(game);
    const [far, mid] = flight.world.batches;
    for (const [camX, camY, tick] of [
      [0, 0, 0],
      [1234.5, -40, 777],
      [50, 20, 12345],
    ]) {
      game.world.camera.x = camX;
      game.world.camera.y = camY;
      flight.update({ ...game.renderFrame(), tick });
      for (const batch of [far, mid]) {
        let minX = Infinity;
        let maxRight = -Infinity;
        let maxBottom = -Infinity;
        for (let i = 0; i < batch.count; i++) {
          minX = Math.min(minX, batch.x[i] - camX);
          maxRight = Math.max(maxRight, batch.x[i] - camX + 128);
          maxBottom = Math.max(maxBottom, batch.y[i] - camY + 128);
        }
        expect(minX).toBeLessThanOrEqual(0);
        expect(maxRight).toBeGreaterThanOrEqual(PLAYFIELD_W);
        expect(maxBottom).toBeGreaterThanOrEqual(PLAYFIELD_H);
      }
      expect(far.count).toBe(8);
      expect(mid.count).toBe(16);
    }
  });

  it('builds the HUD bars once and again only when the stock changes', () => {
    const { game } = realGame();
    const flight = createFlightScene(game);
    const hud = flight.frame.hud;
    flight.update(game.renderFrame());
    const ops = Array.from(hud.op.subarray(0, hud.count));
    expect(ops.slice(0, 2)).toEqual([DrawOp.Rect, DrawOp.Rect]);
    expect([hud.y[0], hud.y[1], hud.w[0], hud.h[1]]).toEqual([0, 208, PLAYFIELD_W, 8]);
    expect(hud.strings.slice(0, 3)).toEqual(['1P', 'FREE FLIGHT', 'ARROWS MOVE']);
    // Three ships → two stock icons.
    expect(ops.filter((op) => op === DrawOp.Sprite)).toHaveLength(2);
    const revision = hud.revision;
    flight.update(game.renderFrame());
    expect(hud.revision).toBe(revision);
    game.world.players[0].lives = 1;
    flight.update(game.renderFrame());
    expect(hud.revision).toBeGreaterThan(revision);
    expect(Array.from(hud.op.subarray(0, hud.count)).filter((op) => op === DrawOp.Sprite)).toEqual(
      [],
    );
  });

  it('shows the KESTREL where the input moved it', () => {
    const { game, platform } = realGame();
    const flight = createFlightScene(game);
    for (let i = 0; i < 40; i++) game.step();
    const player = flight.world.batches[4];
    expect(player).toBe(game.world.playerBatch);
    flight.update(game.renderFrame());
    const x = player.x[0];
    commitPlayerInput(platform.snapshot.players[0], Action.Right | Action.Down);
    for (let i = 0; i < 10; i++) game.step();
    flight.update(game.renderFrame());
    expect(player.count).toBe(1);
    expect(player.x[0]).toBeGreaterThan(x + 10);
    expect(player.frame[0]).toBe(2); // banking down
  });

  it('draws a stage with its own parallax and terrain instead of the starfield (M1-07)', () => {
    const { db } = loadContent(readContentFiles());
    const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'test-range' }, db);
    const flight = createFlightScene(game);
    const view = game.world.view;
    expect(flight.world.camera).toBe(view.camera);
    expect(flight.world.parallax).toBe(view.parallax);
    expect(flight.world.terrain).toBe(view.terrain);
    expect(flight.world.parallax).not.toBeNull();
    expect(flight.world.terrain).not.toBeNull();
    expect(flight.world.batches).toEqual(view.batches);
    flight.update(game.renderFrame());
    expect(flight.frame.hud.strings[1]).toBe('TEST RANGE');
    for (let i = 0; i < 120; i++) game.step();
    expect(game.world.camera.x).toBeGreaterThan(60);
  });
});
