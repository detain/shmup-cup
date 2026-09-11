/**
 * Edge-case suite for the free-flight scene (plan M1-06), beyond `flight.test.ts`: the sprite ids
 * of its own layers and HUD icons, the starfield drift per layer (paused with the game, wrapping
 * every tile), other tile sizes, the stock-icon cap and an empty stock, the screen effects passed
 * through by reference, a content DB without sprites, and zero allocation per displayed frame
 * (`update()` with a moving camera, a changing tick and the HUD left alone).
 */
import {
  DrawOp,
  EMPTY_CONTENT_DB,
  LayerId,
  PLAYFIELD_H,
  PLAYFIELD_W,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type Game,
  type RenderFrame,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../../../vite.shared.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';
import { FLIGHT_SPRITES, createFlightScene } from '../../src/flight/index.js';

/**
 * A game on the real content.
 *
 * @returns The game.
 */
function realGame(): Game {
  const { db, issues } = loadContent(readContentFiles());
  expect(issues).toEqual([]);
  return createGame(createHeadlessPlatform(), { seed: 1 }, db);
}

/**
 * A copy of the game frame with another tick (the scene only reads tick, alpha and screen).
 *
 * @param game - The game.
 * @param tick - Tick to report.
 * @returns The frame.
 */
function frameAt(game: Game, tick: number): RenderFrame {
  return { ...game.renderFrame(), tick };
}

describe('shell/flight edge cases', () => {
  it("draws its layers and stock icons with its own ids, after the content's", () => {
    const game = realGame();
    const flight = createFlightScene(game);
    flight.update(game.renderFrame());
    const [far, mid] = flight.world.batches;
    const base = game.content.sprites.names.length;
    expect(flight.spriteNames[far.spriteId[0]]).toBe('bg/stars-far');
    const midNames = new Set<string>();
    for (let i = 0; i < mid.count; i++) midNames.add(flight.spriteNames[mid.spriteId[i]]);
    expect([...midNames].sort()).toEqual(['bg/stars-mid', 'bg/stars-near']);
    const hud = flight.frame.hud;
    const life = base + FLIGHT_SPRITES.indexOf('hud/life');
    for (let i = 0; i < hud.count; i++) {
      if (hud.op[i] === DrawOp.Sprite) expect(hud.ref[i]).toBe(life);
    }
    expect([far.layer, mid.layer]).toEqual([LayerId.BgFar, LayerId.BgMid]);
  });

  it('drifts each star layer left at its own speed, wrapping every tile, frozen with the tick', () => {
    const game = realGame();
    const flight = createFlightScene(game);
    const [far, mid] = flight.world.batches;
    const firstX = (): [number, number, number] => {
      const perLayer = mid.count / 2;
      return [far.x[0], mid.x[0], mid.x[perLayer]];
    };
    flight.update(frameAt(game, 0));
    expect(firstX()).toEqual([0, 0, 0]);
    flight.update(frameAt(game, 8));
    expect(firstX()).toEqual([-1, -2, -4]); // 0.125, 0.25, 0.5 px/tick
    const paused = firstX();
    flight.update(frameAt(game, 8)); // the game did not tick: nothing moves
    expect(firstX()).toEqual(paused);
    // The near layer wraps after one tile (128 px / 0.5 px per tick = 256 ticks).
    flight.update(frameAt(game, 256));
    expect(firstX()[2]).toBe(0);
    flight.update(frameAt(game, 257));
    expect(firstX()[2]).toBe(-0.5);
  });

  it('sizes the starfield from starTileSize and still covers the playfield', () => {
    const game = realGame();
    const flight = createFlightScene(game, { starTileSize: 64 });
    const [far, mid] = flight.world.batches;
    game.world.camera.x = 777.25;
    game.world.camera.y = -13;
    flight.update(frameAt(game, 999));
    const columns = Math.ceil(PLAYFIELD_W / 64) + 1;
    const rows = Math.ceil(PLAYFIELD_H / 64);
    expect([far.count, mid.count]).toEqual([columns * rows, 2 * columns * rows]);
    for (const batch of [far, mid]) {
      let minX = Infinity;
      let maxRight = -Infinity;
      let minY = Infinity;
      let maxBottom = -Infinity;
      for (let i = 0; i < batch.count; i++) {
        minX = Math.min(minX, batch.x[i] - game.world.camera.x);
        maxRight = Math.max(maxRight, batch.x[i] - game.world.camera.x + 64);
        minY = Math.min(minY, batch.y[i] - game.world.camera.y);
        maxBottom = Math.max(maxBottom, batch.y[i] - game.world.camera.y + 64);
      }
      expect(minX).toBeLessThanOrEqual(0);
      expect(maxRight).toBeGreaterThanOrEqual(PLAYFIELD_W);
      expect(minY).toBe(0);
      expect(maxBottom).toBeGreaterThanOrEqual(PLAYFIELD_H);
    }
  });

  it('caps the stock icons at 8 and draws none for the last ship', () => {
    const game = realGame();
    const flight = createFlightScene(game);
    const hud = flight.frame.hud;
    const icons = (): number => {
      let n = 0;
      for (let i = 0; i < hud.count; i++) if (hud.op[i] === DrawOp.Sprite) n++;
      return n;
    };
    game.world.players[0].lives = 20;
    flight.update(game.renderFrame());
    expect(icons()).toBe(8);
    game.world.players[0].lives = 1;
    flight.update(game.renderFrame());
    expect(icons()).toBe(0);
    game.world.players[0].lives = 0;
    flight.update(game.renderFrame());
    expect(icons()).toBe(0);
    // The texts stay: bars, 1P, score, title, hint.
    expect(hud.strings.slice(0, 3)).toEqual(['1P', 'FREE FLIGHT', 'ARROWS MOVE']);
  });

  it("passes the game frame's screen effects and alpha through", () => {
    const game = realGame();
    const flight = createFlightScene(game);
    const screen = { shakeX: 2, shakeY: -1, flash: 0.5, dim: 0 };
    const frame = flight.update({ ...game.renderFrame(), alpha: 0.25, screen });
    expect(frame.screen).toBe(screen);
    expect(frame.alpha).toBe(0.25);
  });

  it('works on a content DB without sprites (ids start at 0; the ship is not drawn)', () => {
    const game = createGame(createHeadlessPlatform(), {}, EMPTY_CONTENT_DB);
    const flight = createFlightScene(game);
    expect(flight.spriteNames).toEqual(FLIGHT_SPRITES);
    flight.update(game.renderFrame());
    expect(flight.world.batches[0].spriteId[0]).toBe(0);
    expect(flight.world.batches[6]).toBe(game.world.playerBatch);
    expect(flight.world.batches[6].count).toBe(0);
  });

  it('allocates nothing per displayed frame', () => {
    const game = realGame();
    const flight = createFlightScene(game);
    const source = game.renderFrame();
    const frame = { ...source };
    let drawn = 0;
    const growth = measureHeapGrowth(
      (i) => {
        game.world.camera.x += 0.75;
        frame.tick = i;
        drawn += flight.update(frame).tick & 1;
      },
      10_000,
      20_000,
    );
    expect(drawn).toBeGreaterThan(0);
    expect(growth.bytes).toBeLessThan(64 * 1024);
  });
});
