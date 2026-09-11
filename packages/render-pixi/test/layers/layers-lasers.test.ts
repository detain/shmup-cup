/**
 * Enemy laser drawing (plan M1-09), headless over the test atlas: two preallocated sprites per
 * laser slot (warning line, beam) pivoting on the laser's origin; the telegraph (width 0) as the
 * white pixel stretched into a tinted 1-px line; a beam as the beam sprite stretched to
 * `length × width`; rotation from the binary angle; the blink (`Hidden`) and shrinking views hide
 * sprites; validation; allocation-free syncs through a laser's life cycle.
 */
import {
  LayerId,
  PLAYFIELD_Y,
  SpriteFlag,
  createStageCamera,
  type LaserView,
  type StageCamera,
} from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import {
  LASER_WARNING_TINT,
  createLaserBinding,
  createLayerStack,
} from '../../src/layers/index.js';
import { createSpriteTables } from '../../src/sprites/index.js';
import { measureAllocation, pageImages, testManifest } from '../helpers.js';

/** Sprite names: 0 = ships/a (3 frames of 16×9 — the "beam", bands 1…3 px), 1 = bg/tile. */
const NAMES = ['ships/a', 'bg/tile'];

/**
 * A camera at a position (the World's camera class — a `{ x, y }` literal would share hidden
 * classes with every other such literal in the process and skew the allocation measurement).
 *
 * @param x - World x.
 * @param y - World y.
 * @returns The camera.
 */
function cameraAt(x: number, y: number): StageCamera {
  const camera = createStageCamera();
  camera.x = x;
  camera.y = y;
  return camera;
}

/** @returns The test atlas (warnings silenced). */
function atlas(): Atlas {
  const manifest = testManifest();
  return createAtlas(manifest, pageImages(manifest), { onWarning: () => {} });
}

/**
 * A laser view with `capacity` slots.
 *
 * @param capacity - Slots.
 * @returns A writable view.
 */
function laserView(capacity: number): LaserView & {
  count: number;
  x: Float64Array;
  y: Float64Array;
  angle: Float64Array;
  length: Float64Array;
  width: Float64Array;
  spriteId: Uint16Array;
  flags: Uint8Array;
} {
  return {
    capacity,
    count: 0,
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    angle: new Float64Array(capacity),
    length: new Float64Array(capacity),
    width: new Float64Array(capacity),
    spriteId: new Uint16Array(capacity),
    flags: new Uint8Array(capacity),
  };
}

describe('render-pixi/layers laser binding', () => {
  it('preallocates two hidden sprites per slot (tinted line, beam), pivoting on the left-middle', () => {
    const a = atlas();
    const binding = createLaserBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 4,
    });
    expect(binding.capacity).toBe(4);
    const children = binding.container.children as Sprite[];
    expect(children).toHaveLength(8);
    for (const child of children) {
      expect(child.visible).toBe(false);
      expect([child.anchor.x, child.anchor.y]).toEqual([0, 0.5]);
    }
    expect(children[0].tint).toBe(LASER_WARNING_TINT);
    expect(children[0].texture).toBe(a.textures[a.pixelFrame]);
    expect(() =>
      createLaserBinding({ atlas: a, tables: createSpriteTables(a, NAMES), capacity: 0 }),
    ).toThrow(RangeError);
  });

  it('draws the telegraph as a tinted 1-px line and a beam as the stretched beam sprite', () => {
    const a = atlas();
    const tables = createSpriteTables(a, NAMES);
    const binding = createLaserBinding({ atlas: a, tables, capacity: 4 });
    const view = laserView(4);
    view.count = 2;
    view.x.set([300.4, 100]);
    view.y.set([50.6, 80]);
    view.angle.set([512, 256]);
    view.length.set([200, 64]);
    view.width.set([0, 4.5]);
    view.spriteId.set([0, 0]);
    binding.sync(view, cameraAt(10.2, 0));
    const [line, lineBeam, lineOfBeam, beam] = binding.container.children as Sprite[];
    expect([line.visible, lineBeam.visible, lineOfBeam.visible, beam.visible]).toEqual([
      true,
      false,
      false,
      true,
    ]);
    expect(line.texture).toBe(a.textures[a.pixelFrame]);
    expect([line.scale.x, line.scale.y, line.tint]).toEqual([200, 1, LASER_WARNING_TINT]);
    expect(line.rotation).toBeCloseTo(Math.PI, 12);
    expect([line.x, line.y]).toEqual([Math.round(300.4 - 10.2), Math.round(50.6) + PLAYFIELD_Y]);
    // ships/a has 3 frames: a 4.5-px beam is wider than they go, so the last one scales across.
    const frame = a.frameId('ships/a#2');
    expect(beam.texture).toBe(a.textures[frame]);
    expect(beam.scale.x).toBeCloseTo(64 / 16, 12);
    expect(beam.scale.y).toBeCloseTo(4.5 / 9, 12);
    view.width[1] = 2.4; // frame 1 (a 2-px band), unscaled
    binding.sync(view, cameraAt(10.2, 0));
    expect(beam.texture).toBe(a.textures[a.frameId('ships/a#1')]);
    expect(beam.scale.y).toBe(1);
    view.width[1] = 0.3; // thinner than a pixel: frame 0
    binding.sync(view, cameraAt(10.2, 0));
    expect(beam.texture).toBe(a.textures[a.frameId('ships/a#0')]);
    expect(beam.tint).toBe(0xffffff);
    expect(beam.rotation).toBeCloseTo(Math.PI / 2, 12);
    expect(binding.visibleCount).toBe(2);
  });

  it('hides blinking and zero-length lasers and the slots a shrinking view no longer uses', () => {
    const a = atlas();
    const binding = createLaserBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 3,
    });
    const view = laserView(3);
    view.count = 3;
    view.length.set([100, 100, 0]);
    view.flags.set([0, SpriteFlag.Hidden, 0]);
    binding.sync(view, cameraAt(0, 0));
    const sprites = binding.container.children as Sprite[];
    expect(sprites.map((s) => s.visible)).toEqual([true, false, false, false, false, false]);
    expect(binding.visibleCount).toBe(1);
    view.count = 0;
    binding.sync(view, cameraAt(0, 0));
    expect(sprites.every((s) => !s.visible)).toBe(true);
  });

  it('is added to ENEMY_BULLETS by the renderer contract (layer stack order)', () => {
    const stack = createLayerStack();
    const a = atlas();
    const binding = createLaserBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 1,
    });
    stack.layers[LayerId.EnemyBullets].addChild(binding.container);
    expect(binding.container.parent).toBe(stack.layers[LayerId.EnemyBullets]);
  });

  it('syncs without allocating through a laser life cycle (blink, grow, beam, fade, re-aim)', () => {
    const a = atlas();
    const binding = createLaserBinding({
      atlas: a,
      tables: createSpriteTables(a, NAMES),
      capacity: 16,
    });
    const view = laserView(16);
    view.count = 16;
    for (let i = 0; i < 16; i++) {
      view.y[i] = 20 + i * 10;
      view.length[i] = 150;
      view.spriteId[i] = 0;
    }
    const camera = cameraAt(0, 0);
    const bytes = measureAllocation((tick) => {
      camera.x = tick * 0.5;
      for (let i = 0; i < 16; i++) {
        // A 64-tick life per slot: 40 ticks of blinking warning, a 4-tick grow, the beam, a fade;
        // each new life has a new angle and origin.
        const t = (tick + i * 4) % 64;
        view.x[i] = camera.x + 300 + ((tick >> 6) % 7);
        view.angle[i] = ((tick >> 6) * 96 + i * 64) & 1023;
        view.flags[i] = t < 40 && (t & 4) !== 0 ? SpriteFlag.Hidden : 0;
        view.width[i] = t < 40 ? 0 : t < 44 ? (t - 39) * 0.7 : t < 58 ? 3 : (64 - t) * 0.45;
      }
      binding.sync(view, camera);
    }, 10_000);
    expect(bytes).toBeLessThan(256 * 1024);
  });
});
