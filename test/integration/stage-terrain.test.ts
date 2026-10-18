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
  type TilesetSpec,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { itPortPending } from '../../packages/core/test/helpers/port-pending.js';
import { getPixel } from '../../scripts/assets/image.mjs';
import { buildAtlas } from '../../scripts/assets/pipeline.mjs';
import { renderTerrainTiles, resampleMask } from '../../scripts/assets/procedural/terrain.mjs';
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

/**
 * Asserts that every solid tile of a tileset is drawn on a `tileSize²` frame whose opaque pixels
 * are exactly its column-height mask.
 *
 * @param tileset - The loaded tileset.
 * @param frameSize - Width and height of frame `i` of its sprite.
 * @param isOpaque - Whether pixel (x, y) of frame `i` is opaque.
 */
function expectMasksMatchArt(
  tileset: TilesetSpec,
  frameSize: (frame: number) => readonly [number, number],
  isOpaque: (frame: number, x: number, y: number) => boolean,
): void {
  const size = tileset.tileSize;
  for (const tile of tileset.tiles) {
    if (tile.type === 'empty') continue;
    expect(frameSize(tile.frame), `${tileset.id}/${tile.name}`).toEqual([size, size]);
    for (let x = 0; x < size; x++) {
      const h = tile.mask[x];
      for (let y = 0; y < size; y++) {
        const solid = tile.anchor === 'ceiling' ? y < h : y >= size - h;
        expect(isOpaque(tile.frame, x, y), `${tileset.id}/${tile.name} pixel ${x},${y}`).toBe(
          solid,
        );
      }
    }
  }
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

  itPortPending('has masks equal to the opaque pixels of every solid tile frame', () => {
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
      const frames = renderTerrainTiles(MAX_TILE_SIZE, tileset.sprite);
      expectMasksMatchArt(
        tileset,
        (frame) => [frames[frame].width, frames[frame].height],
        (frame, x, y) => getPixel(frames[frame], x, y)[3] > 0,
      );
    }
  });

  it('a 12-px fixture: the heightfield finds a tile for every cell it shapes', () => {
    const tilesets = resampledTilesets(MAX_TILE_SIZE);
    for (const file of tilesets) {
      const id = (file.data as { id: string }).id;
      const stage = {
        formatVersion: 1,
        kind: 'stage',
        id: 'tile12',
        name: 'TILE 12',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 6000,
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [],
        parallax: [],
        tilemap: {
          tileSize: MAX_TILE_SIZE,
          tileset: id,
          rowsTall: 28, // v2's 336-px playfield in 12-px rows
          generator: {
            type: 'heightfield',
            segments: [
              {
                from: 0,
                to: 6000 + PLAYFIELD_W,
                floor: { base: 84, amp: 60, period: 420, seed: 7 },
                ceiling: { base: 48, amp: 36, period: 300, seed: 8 },
              },
            ],
          },
        },
        events: [],
      };
      const { db, issues } = loadContent([file, { path: 'stages/tile12.stage.json', data: stage }]);
      expect(issues, id).toEqual([]);
      const terrain = db.stages[0].terrain;
      expect(terrain?.tileSize).toBe(MAX_TILE_SIZE);
      // Slopes of both kinds are in use, so the 45° and 22.5° shapes were looked up by mask.
      const tables = db.tilesets[0].tables;
      const used = new Set(terrain?.tiles);
      for (const name of ['slope-up', 'slope-down', 'slope-up-low', 'ceil-slope-up-high']) {
        expect(used.has(tables.byName.get(name) ?? -1), `${id} uses ${name}`).toBe(true);
      }
    }
  });
});

describe('integration: the test-range stage', () => {
  itPortPending(
    'expands into a terrain map drawn with existing frames; bands use real sprites',
    () => {
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
    },
  );

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
