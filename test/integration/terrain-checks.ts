/**
 * The two terrain checks of `stage-terrain.test.ts`, exported as shared functions (plan step
 * R3-03.V4b, wave-04): R3-03's lanes need "every mask equals the opaque pixels of its frame"
 * and "the heightfield finds a tile for every cell it shapes" over tilesets that are not the
 * shipped ones — a tileset ingested from real art, a temp fixture in a script test — without
 * importing a spec file.
 *
 * This is a COPY made for that step: `stage-terrain.test.ts` keeps its own private copies,
 * unchanged. V4c (wave 5, after U4) converts that spec to import these functions, so a change
 * to one body means changing the other in the same step — never silently, and never here
 * without reading the original.
 *
 * Both checks take their tileset as data, not as a path: the caller loads or builds it.
 * `expectHeightfieldFindsTiles` takes one tileset `ContentFile` and shapes its own fixed
 * stage over it, exactly like the original test body does per fixture file.
 */
import {
  MAX_TILE_SIZE,
  PLAYFIELD_W,
  loadContent,
  type ContentFile,
  type TilesetSpec,
} from '@shmup/core';
import { expect } from 'vitest';

/**
 * Asserts that every solid tile of a tileset is drawn on a `tileSize²` frame whose opaque pixels
 * are exactly its column-height mask.
 *
 * @param tileset - The loaded tileset.
 * @param frameSize - Width and height of frame `i` of its sprite.
 * @param isOpaque - Whether pixel (x, y) of frame `i` is opaque.
 */
export function expectMasksMatchArt(
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
 * Asserts that the 12-px heightfield finds a tile for every cell it shapes over one tileset:
 * the fixed `tile12` stage (the original test's) loaded against the given tileset file, with
 * the 45° and 22.5° slopes of both anchors looked up by mask.
 *
 * @param file - One tileset content file (shipped, resampled or a fixture).
 */
export function expectHeightfieldFindsTiles(file: ContentFile): void {
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
