/**
 * Tile size and font metrics are data (plan_resolution.md R1-04): the loader accepts v1's 8-px
 * and v2's 12-px tiles (`MIN_TILE_SIZE` / `MAX_TILE_SIZE`), so this test holds the shipped content
 * — and the format examples — to **one** size: every tileset and every stage tilemap declares it,
 * and the loaded terrains use it. That size is the build's `TILE_SIZE` — since R2-02's port the
 * shipped content is exactly that size (R2-01's pending window, which held the content to v1's 8
 * while the build ran at 12, is closed). Never mixed, so a half-ported content set still fails
 * here.
 *
 * `MAX_UI_TEXT_LENGTH` stays a character count; with the font's advance `GLYPH_W` the longest UI
 * text still fits on one line of the frame.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FRAME_W,
  GLYPH_W,
  MAX_TILE_SIZE,
  MAX_UI_TEXT_LENGTH,
  MIN_TILE_SIZE,
  PLAYFIELD_H,
  TILE_SIZE,
  loadContent,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

/** The repository's `content/` folder. */
const CONTENT_ROOT = fileURLToPath(new URL('../../content', import.meta.url));

/** A content JSON file, examples included. */
interface RawFile {
  /** Path below `content/`. */
  readonly path: string;
  /** The parsed JSON. */
  readonly data: Record<string, unknown>;
}

/**
 * Every JSON file of one content folder, the `example.*` files included.
 *
 * @param folder - Folder below `content/`.
 * @returns The files, sorted by name.
 */
function folderFiles(folder: string): RawFile[] {
  const dir = join(CONTENT_ROOT, folder);
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({
      path: folder + '/' + name,
      data: JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<string, unknown>,
    }));
}

describe('integration: the tile size (R1-04)', () => {
  it('builds with one of the two loadable tile sizes, a whole number of rows tall', () => {
    expect([MIN_TILE_SIZE, MAX_TILE_SIZE]).toContain(TILE_SIZE);
    expect(PLAYFIELD_H % TILE_SIZE).toBe(0);
  });

  it('ships every tileset at one tile size (TILE_SIZE)', () => {
    const tilesets = folderFiles('tilesets');
    expect(tilesets.length).toBeGreaterThan(1);
    for (const file of tilesets) expect(file.data.tileSize, file.path).toBe(TILE_SIZE);
  });

  it('ships every stage tilemap at the same tile size (never mixed)', () => {
    let tilemaps = 0;
    for (const file of folderFiles('stages')) {
      const tilemap = file.data.tilemap as { tileSize?: unknown } | null | undefined;
      if (tilemap === null || tilemap === undefined) continue;
      tilemaps++;
      expect(tilemap.tileSize, file.path).toBe(TILE_SIZE);
    }
    expect(tilemaps).toBeGreaterThan(1);
  });

  it('loads every shipped terrain at the same tile size (never mixed)', () => {
    const { db, issues } = loadContent(readContentFiles());
    expect(issues).toEqual([]);
    for (const tileset of db.tilesets) {
      expect(tileset.tileSize, tileset.id).toBe(TILE_SIZE);
    }
    let terrains = 0;
    for (const stage of db.stages) {
      if (stage.terrain === null) continue;
      terrains++;
      expect(stage.terrain.tileSize, stage.id).toBe(TILE_SIZE);
    }
    expect(terrains).toBeGreaterThan(1);
  });
});

describe('integration: the font metrics (R1-04)', () => {
  it('fits the longest UI text on one line of the frame', () => {
    expect(MAX_UI_TEXT_LENGTH * GLYPH_W).toBeLessThanOrEqual(FRAME_W);
  });
});
