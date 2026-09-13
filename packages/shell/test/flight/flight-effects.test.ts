/**
 * The free-flight scene hands the M2-08 presentation data to the renderer (plan M2-08): on the
 * `raster-range` dev stage (`?scene=flight&stage=raster-range`) its world view carries the stage's
 * raster effects and palette cycle and the ships' hitbox mirror; in open space the hitbox mirror
 * and no effects; the mirror follows the ship tick by tick.
 */
import {
  Action,
  LayerId,
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
import { createFlightScene } from '../../src/flight/index.js';

/**
 * A game on the real content (core kinds only).
 *
 * @param stage - Stage id, or `null` for open space.
 * @returns The game and its headless platform.
 */
function realGame(stage: string | null): { game: Game; platform: HeadlessPlatform } {
  const { db, issues } = loadContent(readContentFiles());
  expect(issues).toEqual([]);
  const platform = createHeadlessPlatform();
  return { game: createGame(platform, { seed: 1, stage }, db), platform };
}

describe('shell/flight presentation effects and hitboxes (M2-08)', () => {
  it("carries the raster range's effects and the hitbox mirror", () => {
    const { game } = realGame('raster-range');
    const flight = createFlightScene(game);
    const world = flight.update(game.renderFrame()).world;
    expect(world?.effects).toBe(game.world.view.effects);
    expect(world?.effects?.raster.map((r) => [r.layer, r.kind])).toEqual([
      [LayerId.BgMid, RasterKind.Wave],
      [LayerId.BgMid, RasterKind.Lines],
      [LayerId.BgFar, RasterKind.Haze],
    ]);
    expect(world?.effects?.cycles.map((c) => c.layer)).toEqual([LayerId.BgMid]);
    expect(world?.hitboxes).toBe(game.world.hitboxBatch);
  });

  it('carries the hitbox mirror in open space, which follows the ship', () => {
    const { game, platform } = realGame(null);
    const flight = createFlightScene(game);
    const world = flight.update(game.renderFrame()).world;
    expect(world?.effects ?? null).toBeNull();
    const hitboxes = world?.hitboxes;
    if (hitboxes === null || hitboxes === undefined) throw new Error('no hitbox mirror');
    for (let i = 0; i < 90; i++) {
      commitPlayerInput(platform.snapshot.players[0], Action.Down);
      game.step();
    }
    flight.update(game.renderFrame());
    const ship = game.world.players[0];
    expect(hitboxes.count).toBe(1);
    expect([hitboxes.x[0], hitboxes.y[0]]).toEqual([ship.x, ship.y]);
  });
});
