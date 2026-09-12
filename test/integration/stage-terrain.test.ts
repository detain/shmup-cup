/**
 * Stages and terrain across content, assets and core (plan M1-07): every shipped tileset tile
 * names a frame its atlas sprite has, and its column-height mask equals the opaque pixels of that
 * frame (art and collision cannot drift apart); the shipped `test-range` stage expands into a
 * terrain map drawn only with existing frames, its parallax bands use atlas sprites of their
 * spacing's width, and a headless session plays it to the end — deterministic, the camera
 * following the stage path, the terrain reachable by the queries.
 */
import {
  TerrainType,
  createGame,
  createHeadlessPlatform,
  findFloor,
  hashWorld,
  loadContent,
  type ContentDb,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../vite.shared.js';

/**
 * The shipped content DB.
 *
 * @returns The DB (asserted issue-free).
 */
function shipped(): ContentDb {
  const { db, issues } = loadContent(readContentFiles());
  expect(issues).toEqual([]);
  return db;
}

const { manifest, pages } = buildAtlas();

/**
 * Whether pixel (x, y) of an atlas frame is opaque.
 *
 * @param frameName - Frame name (`<sprite>#<index>`).
 * @param x - Column inside the frame.
 * @param y - Row inside the frame.
 * @returns `true` for alpha > 0.
 */
function opaque(frameName: string, x: number, y: number): boolean {
  const frame = manifest.frames[frameName];
  const image = pages[frame.p].image;
  return image.data[((frame.y + y) * image.width + frame.x + x) * 4 + 3] > 0;
}

describe('integration: tilesets match their art', () => {
  it('ships at least one tileset, every tile on an existing frame', () => {
    const db = shipped();
    expect(db.tilesets.map((t) => t.id)).toContain('terrain-a');
    for (const tileset of db.tilesets) {
      const frames = manifest.sprites[tileset.sprite]?.frames ?? [];
      for (const tile of tileset.tiles) {
        expect(tile.frame, `${tileset.id}/${tile.name}`).toBeLessThan(frames.length);
      }
    }
  });

  it('has masks equal to the opaque pixels of every solid tile frame', () => {
    const db = shipped();
    for (const tileset of db.tilesets) {
      const frames = manifest.sprites[tileset.sprite]?.frames ?? [];
      for (const tile of tileset.tiles) {
        if (tile.type === 'empty') continue;
        const name = frames[tile.frame];
        const size = tileset.tileSize;
        expect([manifest.frames[name].w, manifest.frames[name].h]).toEqual([size, size]);
        for (let x = 0; x < size; x++) {
          const h = tile.mask[x];
          for (let y = 0; y < size; y++) {
            const solid = tile.anchor === 'ceiling' ? y < h : y >= size - h;
            expect(opaque(name, x, y), `${tile.name} pixel ${x},${y}`).toBe(solid);
          }
        }
      }
    }
  });
});

describe('integration: the test-range stage', () => {
  it('expands into a terrain map drawn with existing frames; bands use real sprites', () => {
    const db = shipped();
    const stage = db.stages[db.stageIndex.get('test-range') ?? -1];
    expect(stage.terrain).not.toBeNull();
    const terrain = stage.terrain;
    if (terrain === null) return;
    const tileset = db.tilesets[terrain.tilesetId];
    expect(terrain.cols).toBe(Math.ceil((stage.length + 384) / 8));
    const used = new Set(terrain.tiles);
    expect(used.size).toBeGreaterThan(5); // floors, ceilings and several slope shapes
    for (const id of used) {
      if (id === 0) continue;
      expect(tileset.tables.frame[id]).toBeGreaterThanOrEqual(0);
    }
    for (const band of stage.parallax) {
      const frame = manifest.frames[manifest.sprites[band.sprite].frames[0]];
      expect(frame.w, band.sprite).toBe(band.spacing);
    }
  });

  it('plays to the end headless, deterministically, with terrain under the camera', () => {
    const db = shipped();
    const play = () => {
      const game = createGame(createHeadlessPlatform(), { seed: 5, stage: 'test-range' }, db);
      // Nobody steers: god mode keeps the ship alive to the end (deaths since M1-12).
      game.world.debugFlags.godMode = true;
      let floors = 0;
      for (let tick = 0; tick < 6000 && game.world.status === 'playing'; tick++) {
        game.step();
        const terrain = game.world.terrain;
        if (terrain !== null && tick % 60 === 0) {
          const x = Math.floor(game.world.camera.x) + 200;
          if (!Number.isNaN(findFloor(terrain, x, 100, 100))) floors++;
        }
      }
      return { game, floors };
    };
    const a = play();
    const b = play();
    expect(a.game.world.status).toBe('stageClear');
    expect(a.game.world.camera.x).toBe(4800);
    expect(a.floors).toBeGreaterThan(20);
    expect(hashWorld(a.game.world)).toBe(hashWorld(b.game.world));
    expect(a.game.world.stage?.checkpoint).toBe(2);
    // The generated terrain is really solid where the renderer draws it.
    const terrain = a.game.world.terrain;
    expect(terrain?.tileType[1]).toBe(TerrainType.Solid);
  });
});
