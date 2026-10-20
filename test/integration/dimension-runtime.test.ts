/**
 * The pseudo-3D **high-speed dimension** stage of plan M3-02 (shmup_feat.md §14 "[P2] pseudo-3D
 * high-speed dimension stage (Gradius III arcade stage 4: behind-the-ship view dodging walls) —
 * Mode 7-style effect") across content, assets, core and render-pixi:
 *
 * - the atlas draws the `dimension` generator's floor tile and sky band at the interim art scale
 *   (v2's R2-01: `INTERIM_ART_SCALE`, a length `n` drawn `⌈s·n⌉`), and its `mode7` section and sky
 *   band meet that art (the sky's parallax row and repeat) — the content half is gated until
 *   R2-02 ports the content to the ×1.5 art; the three P2 bosses of the step are its fights;
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
import { createLayerStack, createMode7Floor, type Mode7Shader } from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { INTERIM_ART_SCALE, scaleLength } from '../../scripts/assets/interim.mjs';
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

/**
 * A length of the `dimension` generator as the atlas draws it at the interim art scale.
 *
 * @param n - A length the generator draws (its scale-1 constant).
 * @returns `⌈INTERIM_ART_SCALE · n⌉`.
 */
const art = (n: number): number => scaleLength(n, INTERIM_ART_SCALE);

/**
 * The one frame of a sprite in the packed atlas.
 *
 * @param sprite - Sprite name.
 * @returns Its frame rectangle.
 */
function onlyFrame(sprite: string): (typeof manifest.frames)[string] {
  const frames = manifest.sprites[sprite].frames;
  expect(frames, sprite).toHaveLength(1);
  return manifest.frames[frames[0]];
}

describe('integration: the high-speed dimension stage (M3-02)', () => {
  it('draws the `dimension` generator`s floor tile and sky band at the interim art scale', () => {
    // The tile the shader repeats with `fract`: the generator's square cell, one frame.
    const rect = onlyFrame('bg/dimension-floor');
    expect([rect.w, rect.h]).toEqual([art(DIMENSION_TILE), art(DIMENSION_TILE)]);
    const band = onlyFrame('bg/dimension-sky');
    expect([band.w, band.h]).toEqual([art(DIMENSION_SKY_W), art(DIMENSION_SKY_H)]);
  });

  it('asks for that floor and sky, meeting at the horizon', () => {
    const stage = dimension(shipped());
    const floor = stage.mode7;
    expect(floor).not.toBeNull();
    if (floor === null) throw new Error('the dimension stage has no Mode-7 floor');
    expect(floor.sprite).toBe('bg/dimension-floor');
    // The horizon is inside the playfield, above the last row the plane covers.
    expect(floor.horizon).toBeGreaterThan(0);
    expect(floor.bottom).toBeGreaterThan(floor.horizon);
    expect(floor.bottom).toBeLessThanOrEqual(PLAYFIELD_H);
    // The sky band meets the floor at the horizon: the drawn band, its own repeat.
    const sky = stage.parallax[0];
    expect(sky.sprite).toBe('bg/dimension-sky');
    const band = onlyFrame(sky.sprite);
    expect(sky.spacing).toBe(band.w);
    // Its bottom edge reaches the horizon, so no gap of nothing shows between them.
    expect(sky.y + band.h).toBeGreaterThanOrEqual(floor.horizon);
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
    // A real Pixi container stands in for the mesh — a spare layer of a second stack, since the
    // root test project has no direct `pixi.js` dependency.
    const spare = createLayerStack();
    const fake: Mode7Shader = {
      mesh: spare.layers[LayerId.Debug] as unknown as Mode7Shader['mesh'],
      apply(_view: Mode7View, originU: number, originV: number) {
        applied.push([originU, originV]);
      },
      setTile(...rect: number[]) {
        tiles.push(rect);
      },
      setPage() {},
      destroy() {},
    };
    const mode7 = createMode7Floor({
      layer: stack.layers[LayerId.BgMid],
      createShader: () => fake,
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
      if (!mode7.active) failures.push(`tick ${tick} x ${camera.x}: floor hidden`);
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
