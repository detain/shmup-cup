/**
 * The pseudo-3D **high-speed dimension** stage of plan M3-02 (shmup_feat.md §14 "[P2] pseudo-3D
 * high-speed dimension stage (Gradius III arcade stage 4: behind-the-ship view dodging walls) —
 * Mode 7-style effect") across content, assets, core and render-pixi:
 *
 * - its `mode7` section matches the art the `dimension` generator draws (the floor tile's size,
 *   the sky band's parallax row and repeat) and the three P2 bosses of the step are its fights;
 * - it really is a high-speed stage: the camera ramps well past a normal zone's scroll speed;
 * - a headless session of the whole stage drives render-pixi's Mode-7 floor (a fake filter — no
 *   WebGL in Node) frame by frame: the floor is bound from the atlas, attached the whole way, the
 *   plane's origin follows the camera exactly as the stage's `scroll` / `sway` ask, and the row
 *   band the shader fills stays inside the playfield.
 */
import {
  LayerId,
  PLAYFIELD_H,
  createGame,
  createHeadlessPlatform,
  loadContent,
  type ContentDb,
  type Mode7View,
} from '@shmup/core';
import { createLayerStack, createMode7Floor, type Mode7Filter } from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../scripts/assets/pipeline.mjs';
import {
  DIMENSION_SKY_H,
  DIMENSION_SKY_W,
  DIMENSION_TILE,
} from '../../scripts/assets/procedural/dimension.mjs';
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
 * The shipped dimension stage.
 *
 * @param db - The content.
 * @returns The stage.
 */
function dimension(db: ContentDb): ContentDb['stages'][number] {
  const stage = db.stages[db.stageIndex.get('dimension') ?? -1];
  expect(stage).toBeDefined();
  return stage;
}

const { manifest } = buildAtlas();

describe('integration: the high-speed dimension stage (M3-02)', () => {
  it('asks for the floor and sky the `dimension` generator draws', () => {
    const stage = dimension(shipped());
    const floor = stage.mode7;
    expect(floor).not.toBeNull();
    if (floor === null) throw new Error('the dimension stage has no Mode-7 floor');
    // The tile the shader repeats with `fract`: the generator's square cell, one frame.
    const tile = manifest.sprites[floor.sprite];
    expect(tile.frames).toHaveLength(1);
    const rect = manifest.frames[tile.frames[0]];
    expect([rect.w, rect.h]).toEqual([DIMENSION_TILE, DIMENSION_TILE]);
    // The horizon is inside the playfield, above the last row the plane covers.
    expect(floor.horizon).toBeGreaterThan(0);
    expect(floor.bottom).toBeGreaterThan(floor.horizon);
    expect(floor.bottom).toBeLessThanOrEqual(PLAYFIELD_H);
    // The sky band meets the floor at the horizon: the generator's band, its own repeat.
    const sky = stage.parallax[0];
    expect(sky.sprite).toBe('bg/dimension-sky');
    expect(sky.spacing).toBe(DIMENSION_SKY_W);
    const band = manifest.frames[manifest.sprites[sky.sprite].frames[0]];
    expect([band.w, band.h]).toEqual([DIMENSION_SKY_W, DIMENSION_SKY_H]);
    // Its bottom edge reaches the horizon, so no gap of nothing shows between them.
    expect(sky.y + DIMENSION_SKY_H).toBeGreaterThanOrEqual(floor.horizon);
  });

  it('is a high-speed stage and fights the step’s three P2 bosses', () => {
    const stage = dimension(shipped());
    const top = Math.max(...stage.camera.map((leg) => leg.speed));
    // A normal zone scrolls at 1 … 2 px a tick; the dimension ramps far past that.
    expect(top).toBeGreaterThanOrEqual(4);
    const bosses: string[] = [];
    for (const event of stage.events) {
      if (event.type === 'boss' || event.type === 'warning') bosses.push(event.enemy);
    }
    for (const boss of ['shadow-strider', 'iron-talon', 'grasping-bloom']) {
      expect(bosses).toContain(boss);
    }
    expect(stage.events.at(-1)?.type).toBe('end');
  });

  it('drives the Mode-7 floor over the whole stage, the plane following the camera', () => {
    const db = shipped();
    const game = createGame(createHeadlessPlatform(), { seed: 11, stage: 'dimension' }, db);
    game.world.debugFlags.godMode = true;
    const floor = game.world.view.effects?.mode7 ?? null;
    if (floor === null) throw new Error('the dimension stage has no Mode-7 floor view');
    const stack = createLayerStack();
    const applied: Array<[number, number]> = [];
    const tiles: number[][] = [];
    const fake: Mode7Filter = {
      filter: { enabled: true } as unknown as Mode7Filter['filter'],
      apply(_view: Mode7View, originU: number, originV: number) {
        applied.push([originU, originV]);
      },
      setTile(...rect: number[]) {
        tiles.push(rect);
      },
      destroy() {},
    };
    const mode7 = createMode7Floor({
      layer: stack.layers[LayerId.BgMid],
      createFilter: () => fake,
    });
    // The tile rectangle the renderer would hand it, straight out of the packed atlas.
    const name = manifest.sprites['bg/dimension-floor'].frames[0];
    const frame = manifest.frames[name];
    const page = manifest.pages[frame.p];
    mode7.bind(floor, [frame.x, frame.y, frame.w, frame.h, page.w, page.h]);
    expect(tiles).toEqual([[frame.x, frame.y, frame.w, frame.h, page.w, page.h]]);
    const camera = game.world.camera;
    const failures: string[] = [];
    let frames = 0;
    let topSpeed = 0;
    let lastX = camera.x;
    for (let tick = 0; game.world.status === 'playing' && tick < 20_000; tick++) {
      game.step();
      mode7.sync(camera);
      frames++;
      topSpeed = Math.max(topSpeed, camera.x - lastX);
      lastX = camera.x;
      // The floor covers the whole stage (`from` 0, `to` the end), so it is never detached.
      if (!mode7.active) failures.push(`tick ${tick} x ${camera.x}: floor detached`);
      const last = applied.at(-1);
      if (last === undefined || last[0] !== camera.x * floor.scroll) {
        failures.push(`tick ${tick}: origin ${String(last?.[0])} for camera ${camera.x}`);
      } else if (last[1] !== camera.y * floor.sway) {
        failures.push(`tick ${tick}: sway ${last[1]} for camera y ${camera.y}`);
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
    expect(frames).toBeGreaterThan(1000);
    // The camera really reached the stage's high-speed leg.
    expect(topSpeed).toBeGreaterThanOrEqual(4);
    // The stage ran to its `end` event, not into a wall of its own.
    expect(game.world.status).not.toBe('playing');
    expect(applied).toHaveLength(frames);
    mode7.destroy();
  });
});
