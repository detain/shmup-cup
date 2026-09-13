/**
 * The `raster-range` dev stage across content, assets, core and render-pixi (plan M2-08):
 *
 * - its art matches its effects — the sea band's parallax row, size and repeat are the wave's rows,
 *   the checker floor's are the line-band floor's rows, strips and wrap, and the palette cycle's
 *   ramp is the `raster-bands` generator's (`SEA_RAMP`);
 * - in the packed atlas the sea is painted only in the ramp's exact colours, and nothing else drawn
 *   on the cycled layer comes within the layer shader's match tolerance (1 per channel) of them —
 *   the floor never flickers with the sea;
 * - a headless session of the whole stage drives the renderer's layer effects (fake filters — no
 *   WebGL in Node) frame by frame: the sea / floor filter is on from the first frame, the far
 *   layer's only while the camera is inside the heat haze's range; every offset table stays within
 *   its effect's bounds (wave ±3 px, haze ±2 px, the floor wrapped into [0, 64) and whole strips
 *   moving as one), encodes exactly, and the colour pairs follow the ramp every 8 ticks.
 */
import {
  LayerId,
  PLAYFIELD_Y,
  RasterKind,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type ContentDb,
} from '@shmup/core';
import {
  createLayerEffects,
  createLayerStack,
  createRasterTable,
  decodeRasterRow,
  type LayerEffectFilter,
} from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../scripts/assets/pipeline.mjs';
import * as rasterBands from '../../scripts/assets/procedural/raster-bands.mjs';
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

/**
 * The shipped raster range.
 *
 * @param db - The content.
 * @returns The stage.
 */
function rasterRange(db: ContentDb): ContentDb['stages'][number] {
  const stage = db.stages[db.stageIndex.get('raster-range') ?? -1];
  expect(stage).toBeDefined();
  return stage;
}

/**
 * `#rrggbb` → 0xRRGGBB.
 *
 * @param hex - The colour.
 * @returns The number.
 */
const rgbOf = (hex: string): number => parseInt(hex.slice(1), 16);

const { manifest, pages } = buildAtlas();

/**
 * Every pixel colour (0xRRGGBB, alpha > 0) of a sprite's frames in the packed atlas.
 *
 * @param sprite - Sprite name.
 * @returns The colours with their pixel counts.
 */
function spriteColors(sprite: string): Map<number, number> {
  const colors = new Map<number, number>();
  for (const name of manifest.sprites[sprite].frames) {
    const frame = manifest.frames[name];
    const image = pages[frame.p].image;
    for (let y = 0; y < frame.h; y++) {
      for (let x = 0; x < frame.w; x++) {
        const i = ((frame.y + y) * image.width + frame.x + x) * 4;
        if (image.data[i + 3] === 0) continue;
        const rgb = (image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2];
        colors.set(rgb, (colors.get(rgb) ?? 0) + 1);
      }
    }
  }
  return colors;
}

/**
 * Whether the layer shader would take one colour for another (every channel within 1).
 *
 * @param a - A colour.
 * @param b - Another.
 * @returns The match.
 */
function shaderMatches(a: number, b: number): boolean {
  for (const shift of [16, 8, 0]) {
    if (Math.abs(((a >> shift) & 0xff) - ((b >> shift) & 0xff)) > 1) return false;
  }
  return true;
}

describe('integration: the raster range matches its art (M2-08)', () => {
  it("puts the wave on the sea band's rows and the floor on the checker floor's", () => {
    const stage = rasterRange(shipped());
    const band = (sprite: string) => stage.parallax.find((layer) => layer.sprite === sprite);
    const sea = band('bg/sea-swell');
    const floor = band('bg/checker-floor');
    if (sea === undefined || floor === undefined) throw new Error('bands missing');
    const [wave, lines, haze] = stage.raster;
    expect([wave.kind, lines.kind, haze.kind]).toEqual(['wave', 'lines', 'haze']);
    // The sea: its band rows are the wave's, its sprite as tall as the rows and repeating at its width.
    expect([sea.layer, wave.layer]).toEqual(['mid', 'mid']);
    expect([wave.top, wave.bottom]).toEqual([sea.y, sea.y + rasterBands.SEA_TILE_H]);
    expect(sea.spacing).toBe(rasterBands.SEA_TILE_W);
    const seaFrame = manifest.frames[manifest.sprites['bg/sea-swell'].frames[0]];
    expect([seaFrame.w, seaFrame.h]).toEqual([rasterBands.SEA_TILE_W, rasterBands.SEA_TILE_H]);
    // The floor: rows, strips and wrap are the checker floor's.
    expect(lines.layer).toBe(floor.layer);
    expect([lines.top, lines.bottom]).toEqual([floor.y, floor.y + rasterBands.FLOOR_TILE_H]);
    expect(lines.bands).toEqual([...rasterBands.FLOOR_BANDS]);
    expect([lines.wrap, floor.spacing]).toEqual([
      rasterBands.FLOOR_TILE_W,
      rasterBands.FLOOR_TILE_W,
    ]);
    // A floor band that stays put (factor 0): the raster effect alone scrolls it.
    expect(floor.factor).toBe(0);
    // The haze sits on the far layer above the sea, inside a camera range.
    expect(haze.layer).toBe('far');
    expect(haze.bottom).toBeLessThanOrEqual(wave.top);
    expect([haze.from, haze.to]).toEqual([1200, 2400]);
    // The cycle recolours the sea's ramp on the sea's layer.
    expect(stage.cycles).toHaveLength(1);
    expect(stage.cycles[0].layer).toBe('mid');
    expect(stage.cycles[0].rgb).toEqual(rasterBands.SEA_RAMP.map(rgbOf));
  });

  it('paints the sea only in the ramp; nothing else on the cycled layer comes close to it', () => {
    const stage = rasterRange(shipped());
    const ramp = stage.cycles[0].rgb;
    const sea = spriteColors('bg/sea-swell');
    expect([...sea.keys()].sort((a, b) => a - b)).toEqual([...ramp].sort((a, b) => a - b));
    // Every other sprite drawn on the mid layer (the checker floor) keeps clear of the ramp.
    const others = stage.parallax
      .filter((layer) => layer.layer === 'mid' && layer.sprite !== 'bg/sea-swell')
      .map((layer) => layer.sprite);
    expect(others).toEqual(['bg/checker-floor']);
    for (const sprite of others) {
      for (const color of spriteColors(sprite).keys()) {
        for (const key of ramp) {
          expect(shaderMatches(color, key), `${sprite} #${color.toString(16)}`).toBe(false);
        }
      }
    }
  });
});

/** A fake layer-effect filter (Pixi cannot build a GL program in Node). */
interface FakeFilter extends LayerEffectFilter {
  /** The last `apply`: raster on, colour pairs, row shift. */
  last: [boolean, number, number];
}

describe('integration: the raster range drives the layer effects (M2-08)', () => {
  it('filters the right layers over the whole stage, every table within bounds', () => {
    const db = shipped();
    const game = createGame(createHeadlessPlatform(), { seed: 5, stage: 'raster-range' }, db);
    game.world.debugFlags.godMode = true;
    const view = game.world.view.effects ?? null;
    if (view === null) throw new Error('the raster range has no effects view');
    const stack = createLayerStack();
    const made: FakeFilter[] = [];
    const effects = createLayerEffects({
      layers: stack.layers,
      createFilter(rows) {
        const fake: FakeFilter = {
          filter: { enabled: true } as unknown as LayerEffectFilter['filter'],
          table: createRasterTable(rows),
          bytes: new Uint8Array(rows * 4),
          cycleFrom: new Float32Array(24),
          cycleTo: new Float32Array(24),
          last: [false, 0, 0],
          apply(raster, count, shift) {
            fake.last = [raster, count, shift];
          },
          destroy() {},
        };
        made.push(fake);
        return fake;
      },
    });
    effects.bind(view);
    expect(made).toHaveLength(2);
    const far = effects.filterOf(LayerId.BgFar) as FakeFilter;
    const mid = effects.filterOf(LayerId.BgMid) as FakeFilter;
    const [wave, lines, haze] = view.raster;
    expect([wave.kind, lines.kind, haze.kind]).toEqual([
      RasterKind.Wave,
      RasterKind.Lines,
      RasterKind.Haze,
    ]);
    const ramp = view.cycles[0].colors;
    const failures: string[] = [];
    let hazeFrames = 0;
    const camera = game.world.camera;
    for (let tick = 0; game.world.status === 'playing' && tick < 5000; tick++) {
      game.step();
      effects.sync(game.world.tick, camera, 0, true);
      const inHaze = camera.x >= 1200 && camera.x < 2400;
      if (inHaze) hazeFrames++;
      const expectedMask = (1 << LayerId.BgMid) | (inHaze ? 1 << LayerId.BgFar : 0);
      if (effects.attachedMask !== expectedMask) {
        failures.push(`tick ${tick} x ${camera.x}: mask ${effects.attachedMask}`);
        continue;
      }
      if (tick % 7 !== 0) continue; // the tables: every 7th frame is plenty
      const t = mid.table;
      for (let r = 0; r < 200; r++) {
        const row = r + PLAYFIELD_Y;
        const offset = t.offset[row];
        if (r >= wave.top && r < wave.bottom) {
          if (Math.abs(offset) > wave.amplitude + 1e-9) failures.push(`sea row ${r}: ${offset}`);
        } else if (r >= lines.top && r < lines.bottom) {
          if (!(offset >= 0 && offset < 64) || t.wrap[row] !== 64) {
            failures.push(`floor row ${r}: ${offset} / ${t.wrap[row]}`);
          }
        } else if (offset !== 0) {
          failures.push(`mid row ${r}: ${offset}`);
        }
        const [decoded, wrap] = decodeRasterRow(mid.bytes, row);
        if (decoded !== Math.round(offset) + 0 || wrap !== Math.round(t.wrap[row])) {
          failures.push(`mid row ${r} encoded ${decoded} / ${wrap}`);
        }
      }
      // Whole strips move as one.
      let row = lines.top;
      for (const height of lines.bands) {
        for (let k = 1; k < height; k++) {
          if (t.offset[row + k + PLAYFIELD_Y] !== t.offset[row + PLAYFIELD_Y]) {
            failures.push(`strip at ${row} torn at tick ${tick}`);
          }
        }
        row += height;
      }
      if (inHaze) {
        for (let r = haze.top; r < haze.bottom; r++) {
          const offset = far.table.offset[r + PLAYFIELD_Y];
          if (Math.abs(offset) > haze.amplitude + 1e-9) failures.push(`haze row ${r}: ${offset}`);
        }
        if (far.last[0] !== true) failures.push(`tick ${tick}: the haze's table is off`);
      }
      // The colour pairs: ramp colour i drawn as ramp colour (i + step) mod 4, step = tick / 8.
      const step = Math.floor(game.world.tick / 8) % ramp.length;
      if (mid.last[1] !== ramp.length) failures.push(`tick ${tick}: ${mid.last[1]} pairs`);
      for (let i = 0; i < ramp.length; i++) {
        const to = Math.round(mid.cycleTo[3 * i + 2] * 255);
        if (to !== (ramp[(i + step) % ramp.length] & 0xff)) {
          failures.push(`tick ${tick}: pair ${i} → ${to}`);
        }
      }
    }
    expect(failures.slice(0, 20)).toEqual([]);
    expect(game.world.status).toBe('stageClear');
    // The haze ran for the 1,200 px of its range at 1 px a tick.
    expect(hazeFrames).toBeGreaterThanOrEqual(1199);
    expect(hazeFrames).toBeLessThanOrEqual(1201);
  });
});
