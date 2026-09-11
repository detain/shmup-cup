/**
 * # data/tilemap — tileset tables and stage tilemap expansion (load time)
 *
 * **Responsibility.** Turns the `tileset` and `stage.tilemap` content of `core/data` into the
 * typed arrays the terrain queries (`core/collision`) and the renderer read:
 *
 * - {@link buildTilesetTables} — per-tile-id type, anchor, column heights and atlas frame;
 * - {@link expandTilemap} — a stage's `Uint8Array` tile grid, built **deterministically at load**
 *   from a `heightfield` generator (no committed giant arrays) and/or explicit run-length
 *   encoded rows (the import path for Tiled / LDtk exports, shmup_feat.md §14 [P1]).
 *
 * **Heightfield.** Each segment `[from, to)` gets a floor and/or ceiling profile
 * `base + amp · (0.7·sin θ + 0.3·sin(2θ + φ₂))`, θ = `x · 1024 / period + φ₁` (binary angles from
 * the committed sine table, phases from the profile's seed). The profile is sampled at every tile
 * boundary and quantised to half tiles; consecutive boundaries differ by at most one tile (45°),
 * a half-tile height is always left by a half-tile step (the 22.5° slope pairs), and the terrain
 * ramps up from 0 at `from` and back down to 0 by `to`. Every cell is then filled with the
 * tileset tile whose column-height mask matches the generated heights: the tile named `solid`
 * for buried cells, `floor` / `ceiling` for flat cells with open space beyond their surface, and
 * the slope tiles (matched by anchor + mask) elsewhere. Where a floor and a ceiling overlap the
 * floor wins. RLE rows are applied after the generator; their non-zero tiles overwrite it.
 *
 * **RLE rows.** One string per map row (top to bottom, exactly `rowsTall` of them): comma
 * separated tokens `<id>` or `<count>*<id>` (tile ids, 0 = empty; spaces ignored), e.g.
 * `"40*0, 3*2, 1"`. A row may be shorter than the map (the rest is empty), never longer.
 *
 * **Implements.** shmup_feat.md §14 — tilemap terrain (8×8 tiles, collision types, slopes via
 * per-tile height masks), stage data format.
 *
 * **Public API.** Internal to `core/data` (re-exported types only): {@link TilesetTables},
 * {@link buildTilesetTables}, {@link expandTilemap}, {@link decodeRleRow}.
 *
 * @remarks
 * Load-time code: it allocates freely and reports every problem as a `ValidationIssue`
 * instead of throwing. Only IEEE `+ − × ÷`, `Math.round/floor` and the sine table are used, so
 * the generated maps are identical on every engine.
 *
 * @module
 */
import { TerrainAnchor, TerrainType } from '../collision/index.js';
import { ANGLE_UNITS, sinB } from '../math/index.js';
import { createRng } from '../rng/index.js';
import type { ValidationIssue } from './schema.js';

/** The fields of a tileset tile the tables need (the full spec lives in `core/data`). */
export interface TileTableInput {
  /** Unique name inside the tileset. */
  readonly name: string;
  /** `empty` (decoration), `solid` or `hazard`. */
  readonly type: 'empty' | 'solid' | 'hazard';
  /** Frame of the tileset sprite that draws the tile. */
  readonly frame: number;
  /** Edge the column heights grow from. */
  readonly anchor: 'floor' | 'ceiling';
  /** Column heights, one per pixel column (0 … tileSize). */
  readonly mask: readonly number[];
}

/**
 * Per-tile-id lookup tables of a tileset (tile id = position in the file's `tiles` + 1; id 0 is
 * the empty cell and has type `Empty`, mask all 0 and frame -1).
 */
export interface TilesetTables {
  /** Number of ids, the empty cell included (`tiles.length + 1`). */
  readonly count: number;
  /** `TerrainType` code per id. */
  readonly type: Uint8Array;
  /** `TerrainAnchor` code per id. */
  readonly anchor: Uint8Array;
  /** Column heights: `mask[id * tileSize + column]`. */
  readonly mask: Uint8Array;
  /** Frame of the tileset sprite per id (-1 = not drawn). */
  readonly frame: Int16Array;
  /** Tile name → id. */
  readonly byName: ReadonlyMap<string, number>;
}

/**
 * Builds the lookup tables of a validated tileset.
 *
 * @param tiles - The tiles in file order (masks already validated to `tileSize` entries).
 * @param tileSize - Tile edge in pixels.
 * @returns The tables.
 */
export function buildTilesetTables(
  tiles: readonly TileTableInput[],
  tileSize: number,
): TilesetTables {
  const count = tiles.length + 1;
  const type = new Uint8Array(count);
  const anchor = new Uint8Array(count);
  const mask = new Uint8Array(count * tileSize);
  const frame = new Int16Array(count);
  const byName = new Map<string, number>();
  frame[0] = -1;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const id = i + 1;
    type[id] =
      tile.type === 'solid'
        ? TerrainType.Solid
        : tile.type === 'hazard'
          ? TerrainType.Hazard
          : TerrainType.Empty;
    anchor[id] = tile.anchor === 'ceiling' ? TerrainAnchor.Ceiling : TerrainAnchor.Floor;
    for (let c = 0; c < tileSize; c++) mask[id * tileSize + c] = tile.mask[c] ?? 0;
    frame[id] = tile.frame;
    if (!byName.has(tile.name)) byName.set(tile.name, id);
  }
  return { count, type, anchor, mask, frame, byName };
}

/**
 * Decodes one RLE row into `out[offset … offset + cols)`, writing only non-zero tiles (so a row
 * overlays whatever the generator put there).
 *
 * @param text - The row, e.g. `"40*0, 3*2, 1"`.
 * @param cols - Map width in tiles.
 * @param maxTile - Largest valid tile id.
 * @param out - The map.
 * @param offset - Index of the row's first cell.
 * @param path - Issue path of the row.
 * @param issues - Collector.
 * @returns `true` when the row decoded cleanly (on failure nothing is written).
 */
export function decodeRleRow(
  text: string,
  cols: number,
  maxTile: number,
  out: Uint8Array,
  offset: number,
  path: string,
  issues: ValidationIssue[],
): boolean {
  const cells: number[] = [];
  const compact = text.replace(/\s+/g, '');
  if (compact !== '') {
    const tokens = compact.split(',');
    for (let t = 0; t < tokens.length; t++) {
      const match = /^(?:([0-9]+)\*)?([0-9]+)$/.exec(tokens[t]);
      if (match === null) {
        issues.push({
          path,
          message: 'token ' + String(t + 1) + ' "' + tokens[t] + '" is not <id> or <count>*<id>',
        });
        return false;
      }
      const count = match[1] === undefined ? 1 : Number(match[1]);
      const id = Number(match[2]);
      if (count < 1) {
        issues.push({ path, message: 'token ' + String(t + 1) + ' has a zero run length' });
        return false;
      }
      if (id > maxTile) {
        issues.push({
          path,
          message:
            'tile id ' + String(id) + ' does not exist (the tileset has ' + String(maxTile) + ')',
        });
        return false;
      }
      if (cells.length + count > cols) {
        issues.push({
          path,
          message: 'row is longer than the map (' + String(cols) + ' tiles)',
        });
        return false;
      }
      for (let k = 0; k < count; k++) cells.push(id);
    }
  }
  for (let c = 0; c < cells.length; c++) if (cells[c] !== 0) out[offset + c] = cells[c];
  return true;
}

/** One heightfield profile (floor or ceiling) as validated by `core/data`. */
export interface HeightfieldProfileInput {
  /** Average height in pixels (from the map's bottom for floors, top for ceilings). */
  readonly base: number;
  /** Wave amplitude in pixels. */
  readonly amp: number;
  /** Wavelength in pixels. */
  readonly period: number;
  /** Seed of the wave phases. */
  readonly seed: number;
}

/** One heightfield segment as validated by `core/data`. */
export interface HeightfieldSegmentInput {
  /** First world x of the segment (pixels). */
  readonly from: number;
  /** World x where the segment ends (exclusive). */
  readonly to: number;
  /** Floor profile, if any. */
  readonly floor?: HeightfieldProfileInput;
  /** Ceiling profile, if any. */
  readonly ceiling?: HeightfieldProfileInput;
}

/** A stage tilemap block as validated by `core/data` (the fields expansion needs). */
export interface TilemapInput {
  /** Tile edge in pixels. */
  readonly tileSize: number;
  /** Map height in tiles. */
  readonly rowsTall: number;
  /** Explicit RLE rows, top to bottom. */
  readonly rle?: readonly string[];
  /** Procedural terrain. */
  readonly generator?: {
    /** Generator kind (`heightfield`). */
    readonly type: 'heightfield';
    /** Segments. */
    readonly segments: readonly HeightfieldSegmentInput[];
  };
}

/**
 * Target height of a profile at a world x.
 *
 * @param profile - The profile.
 * @param x - World x in pixels.
 * @param phase1 - Phase of the fundamental (binary angle).
 * @param phase2 - Phase of the second harmonic.
 * @returns Height in pixels (unclamped).
 */
function profileTarget(
  profile: HeightfieldProfileInput,
  x: number,
  phase1: number,
  phase2: number,
): number {
  const theta = Math.round((x * ANGLE_UNITS) / profile.period) + phase1;
  return profile.base + profile.amp * (0.7 * sinB(theta) + 0.3 * sinB(2 * theta + phase2));
}

/**
 * Samples a profile at the tile boundaries `c0 … c1` and applies the slope rules (see the module
 * docs).
 *
 * @param profile - The profile.
 * @param c0 - First tile column of the segment.
 * @param c1 - Tile column where the segment ends (exclusive).
 * @param size - Tile edge in pixels.
 * @param maxHeight - Highest allowed height (a multiple of `size`).
 * @returns Heights in pixels at boundaries `c0 … c1` (`c1 - c0 + 1` entries, first and last 0).
 */
function boundaryHeights(
  profile: HeightfieldProfileInput,
  c0: number,
  c1: number,
  size: number,
  maxHeight: number,
): number[] {
  const rng = createRng(profile.seed >>> 0);
  const phase1 = rng.rangeInt(0, ANGLE_UNITS - 1);
  const phase2 = rng.rangeInt(0, ANGLE_UNITS - 1);
  const half = size / 2;
  const heights: number[] = [0];
  let previous = 0;
  let direction = 1;
  for (let b = c0 + 1; b <= c1; b++) {
    const remaining = c1 - b;
    const cap = Math.min(maxHeight, remaining * size);
    let wanted = Math.round(profileTarget(profile, b * size, phase1, phase2) / half) * half;
    if (wanted < 0) wanted = 0;
    if (wanted > cap) wanted = cap;
    let delta = wanted - previous;
    if (delta > size) delta = size;
    if (delta < -size) delta = -size;
    if (previous % size === half) {
      // Leaving a half-tile height: only the 22.5° pairs fit (±half a tile).
      let step = delta > 0 ? half : delta < 0 ? -half : direction * half;
      if (previous + step > cap) step = -half;
      delta = step;
    }
    const height = previous + delta;
    if (delta !== 0) direction = delta > 0 ? 1 : -1;
    heights.push(height);
    previous = height;
  }
  return heights;
}

/**
 * Pixel-column heights of one tile column between two boundary heights (the formula the
 * placeholder slope tiles are drawn with: 45° = `1 … 8`, 22.5° = `0,1,1,2,2,3,3,4` / `4 … 8`).
 *
 * @param h0 - Height at the column's left boundary.
 * @param h1 - Height at its right boundary.
 * @param size - Tile edge in pixels.
 * @param out - Receives `size` heights.
 */
function columnHeights(h0: number, h1: number, size: number, out: number[]): void {
  const slope = (h1 - h0) / size;
  for (let px = 0; px < size; px++) {
    out[px] =
      slope >= 0 ? h0 + Math.floor(slope * (px + 1)) : h1 + Math.floor(-slope * (size - px));
  }
}

/** The tiles the generator places by name or by mask. */
interface GeneratorTiles {
  /** Buried cells. */
  readonly solid: number;
  /** Flat floor cells with open space above. */
  readonly floor: number;
  /** Flat ceiling cells with open space below. */
  readonly ceiling: number;
  /** `anchor:mask` → tile id of every solid tile. */
  readonly byMask: ReadonlyMap<string, number>;
}

/**
 * Looks up the tiles the heightfield generator needs.
 *
 * @param tables - The tileset tables.
 * @param size - Tile edge.
 * @param tilesetId - Tileset id (for messages).
 * @param path - Issue path of the generator.
 * @param issues - Collector.
 * @returns The tiles, or `null` when a required named tile is missing.
 */
function generatorTiles(
  tables: TilesetTables,
  size: number,
  tilesetId: string,
  path: string,
  issues: ValidationIssue[],
): GeneratorTiles | null {
  const named: number[] = [];
  for (const name of ['solid', 'floor', 'ceiling']) {
    const id = tables.byName.get(name);
    if (id === undefined || tables.type[id] !== TerrainType.Solid) {
      issues.push({
        path,
        message: 'tileset "' + tilesetId + '" has no solid tile named "' + name + '"',
      });
      return null;
    }
    named.push(id);
  }
  const byMask = new Map<string, number>();
  for (let id = 1; id < tables.count; id++) {
    if (tables.type[id] !== TerrainType.Solid) continue;
    const key = maskKey(tables.anchor[id], tables.mask, id * size, size);
    if (!byMask.has(key)) byMask.set(key, id);
  }
  return { solid: named[0], floor: named[1], ceiling: named[2], byMask };
}

/**
 * Key of an anchor + mask combination.
 *
 * @param anchor - `TerrainAnchor` code.
 * @param heights - Height array.
 * @param start - First index in `heights`.
 * @param size - Number of columns.
 * @returns E.g. `0:1,2,3,4,5,6,7,8`.
 */
function maskKey(anchor: number, heights: ArrayLike<number>, start: number, size: number): string {
  let key = String(anchor) + ':';
  for (let c = 0; c < size; c++) key += (c === 0 ? '' : ',') + String(heights[start + c]);
  return key;
}

/**
 * Fills one profile (floor or ceiling) of a segment into the map.
 *
 * @param map - The map.
 * @param cols - Map width in tiles.
 * @param rows - Map height in tiles.
 * @param size - Tile edge.
 * @param c0 - First column.
 * @param heights - Boundary heights from {@link boundaryHeights}.
 * @param anchor - `TerrainAnchor.Floor` (rows counted from the bottom) or `Ceiling`.
 * @param tiles - Generator tiles.
 * @param path - Issue path of the profile.
 * @param issues - Collector (one issue per missing mask).
 * @param reported - Masks already reported.
 */
function fillProfile(
  map: Uint8Array,
  cols: number,
  rows: number,
  size: number,
  c0: number,
  heights: readonly number[],
  anchor: number,
  tiles: GeneratorTiles,
  path: string,
  issues: ValidationIssue[],
  reported: Set<string>,
): void {
  const pixels: number[] = [];
  const cell: number[] = [];
  const above: number[] = [];
  for (let i = 0; i + 1 < heights.length; i++) {
    const col = c0 + i;
    if (col >= cols) break;
    columnHeights(heights[i], heights[i + 1], size, pixels);
    let top = 0;
    for (let px = 0; px < size; px++) if (pixels[px] > top) top = pixels[px];
    const layers = Math.min(rows, Math.ceil(top / size));
    for (let k = 0; k < layers; k++) {
      let full = true;
      let empty = true;
      for (let px = 0; px < size; px++) {
        const h = pixels[px] - k * size;
        cell[px] = h < 0 ? 0 : h > size ? size : h;
        above[px] = h - size;
        if (cell[px] !== size) full = false;
        if (cell[px] !== 0) empty = false;
      }
      if (empty) continue;
      let tile: number;
      if (full) {
        let exposed = true;
        for (let px = 0; px < size; px++) if (above[px] > 0) exposed = false;
        tile = !exposed
          ? tiles.solid
          : anchor === TerrainAnchor.Floor
            ? tiles.floor
            : tiles.ceiling;
      } else {
        const key = maskKey(anchor, cell, 0, size);
        const found = tiles.byMask.get(key);
        if (found === undefined) {
          if (!reported.has(key)) {
            reported.add(key);
            issues.push({
              path,
              message:
                'the tileset has no solid ' +
                (anchor === TerrainAnchor.Floor ? 'floor' : 'ceiling') +
                ' tile with the mask [' +
                cell.slice(0, size).join(',') +
                ']',
            });
          }
          tile = tiles.solid;
        } else {
          tile = found;
        }
      }
      const row = anchor === TerrainAnchor.Floor ? rows - 1 - k : k;
      map[row * cols + col] = tile;
    }
  }
}

/**
 * Expands a stage tilemap into its tile grid (see the module docs).
 *
 * @param tilemap - The validated tilemap block.
 * @param cols - Map width in tiles (the stage length plus one screen, rounded up).
 * @param tables - The tileset's tables.
 * @param tilesetId - Tileset id (for messages).
 * @param path - Issue path of the tilemap block (`<file>:tilemap`).
 * @param issues - Collector.
 * @returns The grid (`cols × rowsTall`, row-major), or `null` when the RLE rows are unusable.
 */
export function expandTilemap(
  tilemap: TilemapInput,
  cols: number,
  tables: TilesetTables,
  tilesetId: string,
  path: string,
  issues: ValidationIssue[],
): Uint8Array | null {
  const size = tilemap.tileSize;
  const rows = tilemap.rowsTall;
  const map = new Uint8Array(cols * rows);
  const generator = tilemap.generator;
  if (generator !== undefined) {
    const generatorPath = path + '.generator';
    const tiles = generatorTiles(tables, size, tilesetId, generatorPath, issues);
    if (tiles !== null) {
      const reported = new Set<string>();
      const segments = generator.segments;
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const c0 = Math.floor(segment.from / size);
        const c1 = Math.min(cols, Math.ceil(segment.to / size));
        if (c1 <= c0) continue;
        const segmentPath = generatorPath + '.segments[' + String(i) + ']';
        const maxHeight = rows * size;
        if (segment.ceiling !== undefined) {
          const heights = boundaryHeights(segment.ceiling, c0, c1, size, maxHeight);
          fillProfile(
            map,
            cols,
            rows,
            size,
            c0,
            heights,
            TerrainAnchor.Ceiling,
            tiles,
            segmentPath + '.ceiling',
            issues,
            reported,
          );
        }
        if (segment.floor !== undefined) {
          const heights = boundaryHeights(segment.floor, c0, c1, size, maxHeight);
          fillProfile(
            map,
            cols,
            rows,
            size,
            c0,
            heights,
            TerrainAnchor.Floor,
            tiles,
            segmentPath + '.floor',
            issues,
            reported,
          );
        }
      }
    }
  }
  const rle = tilemap.rle;
  if (rle !== undefined) {
    if (rle.length !== rows) {
      issues.push({
        path: path + '.rle',
        message: 'must have exactly rowsTall (' + String(rows) + ') rows',
      });
      return null;
    }
    let ok = true;
    for (let r = 0; r < rows; r++) {
      const rowPath = path + '.rle[' + String(r) + ']';
      if (!decodeRleRow(rle[r], cols, tables.count - 1, map, r * cols, rowPath, issues)) ok = false;
    }
    if (!ok) return null;
  }
  return map;
}
