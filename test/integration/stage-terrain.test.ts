/**
 * Stages and terrain across content, assets and core (plan M1-07): every shipped tileset tile
 * names a frame its atlas sprite has, and its column-height mask equals the opaque pixels of that
 * frame (art and collision cannot drift apart); the shipped `test-range` stage expands into a
 * terrain map drawn only with existing frames, its parallax bands use atlas sprites of their
 * spacing's width, and a headless session plays it to the end — deterministic, the camera
 * following the stage path, the terrain reachable by the queries.
 *
 * R1-04 (tile size as data): the same art-equals-mask check holds for a 12-px fixture — every
 * shipped tileset with its masks moved by `resampleMask(mask, 8, 12)` against its tiles drawn by
 * `renderTerrainTiles(12)` — and a 12-px heightfield stage over those tilesets finds a tile for
 * every cell the generator shapes (`terrain.mjs` and `core/data` agree on the slope masks). The
 * fixtures live only in this test: nothing is added to `content/` or the atlas.
 *
 * R3-03.V4c (wave 5): the two checks are the shared ones — `expectMasksMatchArt` and
 * `expectHeightfieldFindsTiles` are imported from `./terrain-checks.ts` (R3-03.V4b copied them
 * there for the real-art lanes; the copies were byte-identical at the merge, so this spec lost its
 * private ones and a change to either body is now a change in one place).
 */
import {
  MAX_TILE_SIZE,
  PLAYFIELD_W,
  TILE_SIZE,
  TerrainType,
  createGame,
  createHeadlessPlatform,
  findFloor,
  hashWorld,
  loadContent,
  type ContentDb,
  type ContentFile,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { v1rel, v1y } from '../../packages/core/test/helpers/v1-port.js';
import { getPixel } from '../../scripts/assets/image.mjs';
import { buildAtlas } from '../../scripts/assets/pipeline.mjs';
import { renderTerrainTiles, resampleMask } from '../../scripts/assets/procedural/terrain.mjs';
import * as azure from '../../scripts/assets/procedural/azure.mjs';
import * as brine from '../../scripts/assets/procedural/brine.mjs';
import * as tempest from '../../scripts/assets/procedural/tempest.mjs';
import { readContentFiles } from '../../vite.shared.js';
import { expectHeightfieldFindsTiles, expectMasksMatchArt } from './terrain-checks.js';

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

/**
 * The shipped tilesets moved to another tile size: their masks resampled from each file's own
 * `tileSize` (ids, sprites and paths unchanged — a fixture DB holds these instead of the shipped
 * ones).
 *
 * @param size - The new tile size.
 * @returns One tileset file per shipped tileset.
 */
function resampledTilesets(size: number): ContentFile[] {
  return readContentFiles()
    .filter((file) => file.path.startsWith('tilesets/'))
    .map((file) => {
      const data = file.data as { tileSize: number; tiles: { mask: number[] }[] };
      return {
        path: file.path,
        data: {
          ...data,
          tileSize: size,
          tiles: data.tiles.map((tile) => ({
            ...tile,
            mask: resampleMask(tile.mask, data.tileSize, size),
          })),
        },
      };
    });
}

/**
 * The 12-px frames of a shipped tileset sprite: `terrain.mjs` draws the palette families;
 * `tiles/terrain-azure` comes from `azure.mjs`, which paints it at `options.tileSize` exactly
 * like `renderTerrainTiles` does a palette (R5-01.S5a — later zones' -v2 sets route the same
 * way: `tiles/terrain-reef-v2` from `brine.mjs` since R5-02.S5a, `tiles/terrain-ridge-v2` from
 * `tempest.mjs` since R5-05.S5a).
 *
 * @param sprite - The tileset's sprite name.
 * @param size - The tile size to draw at.
 * @returns The drawn grid sprite's frames.
 */
function tilesetFramesAt(sprite: string, size: number): ReturnType<typeof renderTerrainTiles> {
  if (sprite === 'tiles/terrain-reef-v2') {
    for (const drawn of brine.generate({ tileSize: size, artScale: 3 / 2 })) {
      if (drawn.name === sprite) return drawn.frames;
    }
    throw new Error(`brine.mjs draws no ${sprite}`);
  }
  if (sprite === 'tiles/terrain-ridge-v2') {
    for (const drawn of tempest.generate({ tileSize: size, artScale: 3 / 2 })) {
      if (drawn.name === sprite) return drawn.frames;
    }
    throw new Error(`tempest.mjs draws no ${sprite}`);
  }
  if (sprite !== 'tiles/terrain-azure') return renderTerrainTiles(size, sprite);
  for (const drawn of azure.generate({ tileSize: size, artScale: 3 / 2 })) {
    if (drawn.name === sprite) return drawn.frames;
  }
  throw new Error(`azure.mjs draws no ${sprite}`);
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
      expectMasksMatchArt(
        tileset,
        (frame) => [manifest.frames[frames[frame]].w, manifest.frames[frames[frame]].h],
        (frame, x, y) => opaque(frames[frame], x, y),
      );
    }
  });

  it('a 12-px fixture: every resampled mask equals the opaque pixels of its 12-px tile', () => {
    const { db, issues } = loadContent(resampledTilesets(MAX_TILE_SIZE));
    expect(issues).toEqual([]);
    expect(db.tilesets.length).toBeGreaterThan(1);
    for (const tileset of db.tilesets) {
      expect(tileset.tileSize).toBe(MAX_TILE_SIZE);
      const frames = tilesetFramesAt(tileset.sprite, MAX_TILE_SIZE);
      expectMasksMatchArt(
        tileset,
        (frame) => [frames[frame].width, frames[frame].height],
        (frame, x, y) => getPixel(frames[frame], x, y)[3] > 0,
      );
    }
  });

  it('a 12-px fixture: the heightfield finds a tile for every cell it shapes', () => {
    for (const file of resampledTilesets(MAX_TILE_SIZE)) expectHeightfieldFindsTiles(file);
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
    expect(terrain.tileSize).toBe(TILE_SIZE);
    expect(terrain.cols).toBe(Math.ceil((stage.length + PLAYFIELD_W) / terrain.tileSize));
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
          const x = Math.floor(game.world.camera.x) + v1rel(200);
          if (!Number.isNaN(findFloor(terrain, x, v1y(100), v1rel(100)))) floors++;
        }
      }
      return { game, floors };
    };
    const a = play();
    const b = play();
    expect(a.game.world.status).toBe('stageClear');
    expect(a.game.world.camera.x).toBe(v1rel(4800));
    expect(a.floors).toBeGreaterThan(20);
    expect(hashWorld(a.game.world)).toBe(hashWorld(b.game.world));
    expect(a.game.world.stage?.checkpoint).toBe(2);
    // The generated terrain is really solid where the renderer draws it.
    const terrain = a.game.world.terrain;
    expect(terrain?.tileType[1]).toBe(TerrainType.Solid);
  });
});
