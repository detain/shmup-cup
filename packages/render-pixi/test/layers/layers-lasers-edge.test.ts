/**
 * Edge cases of the laser binding (plan M1-09), headless over the test atlas: capacity
 * validation, views with more lasers than the binding has slots, angles past one turn, rotations
 * written only when a slot's angle changes, a slot switching between warning line and beam both
 * ways, the band / frame boundaries (exactly as many px as the sprite has frames, one more),
 * non-finite lengths, the y offset and a scrolled camera, `destroy()`.
 */
import { SpriteFlag, createStageCamera, type LaserView, type StageCamera } from '@shmup/core';
import type { Sprite } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createAtlas, type Atlas } from '../../src/atlas/index.js';
import { createLaserBinding, type LaserBinding } from '../../src/layers/index.js';
import { createSpriteTables } from '../../src/sprites/index.js';
import { pageImages, testManifest } from '../helpers.js';

/** Sprite names: 0 = ships/a (3 frames of 16×9 — the "beam", bands 1…3 px), 1 = bg/tile. */
const NAMES = ['ships/a', 'bg/tile'];

/**
 * A camera at a position.
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

/** A writable laser view. */
type WritableLaserView = LaserView & {
  count: number;
  x: Float64Array;
  y: Float64Array;
  angle: Float64Array;
  length: Float64Array;
  width: Float64Array;
  spriteId: Uint16Array;
  flags: Uint8Array;
};

/**
 * A laser view with `capacity` slots, every laser 100 px long.
 *
 * @param capacity - Slots.
 * @returns A writable view.
 */
function laserView(capacity: number): WritableLaserView {
  return {
    capacity,
    count: 0,
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    angle: new Float64Array(capacity),
    length: new Float64Array(capacity).fill(100),
    width: new Float64Array(capacity),
    spriteId: new Uint16Array(capacity),
    flags: new Uint8Array(capacity),
  };
}

/**
 * A binding over the test atlas.
 *
 * @param a - The atlas.
 * @param capacity - Slots.
 * @param offsetY - Optional y offset.
 * @returns The binding.
 */
function bind(a: Atlas, capacity: number, offsetY?: number): LaserBinding {
  return createLaserBinding({ atlas: a, tables: createSpriteTables(a, NAMES), capacity, offsetY });
}

/**
 * The warning line and beam sprites of a slot.
 *
 * @param binding - The binding.
 * @param i - The slot.
 * @returns `[line, beam]`.
 */
function sprites(binding: LaserBinding, i: number): [Sprite, Sprite] {
  const children = binding.container.children as Sprite[];
  return [children[2 * i], children[2 * i + 1]];
}

describe('render-pixi/layers laser binding edge', () => {
  it('rejects capacities that are not positive integers', () => {
    const a = atlas();
    for (const capacity of [0, -1, 1.5, Number.NaN, Infinity]) {
      expect(() => bind(a, capacity), String(capacity)).toThrow(RangeError);
    }
    expect(bind(a, 1).capacity).toBe(1);
  });

  it('draws at most its capacity when the view holds more lasers', () => {
    const a = atlas();
    const binding = bind(a, 2);
    const view = laserView(4);
    view.count = 4;
    binding.sync(view, cameraAt(0, 0));
    expect(binding.visibleCount).toBe(2);
    expect(binding.container.children).toHaveLength(4);
  });

  it('masks angles past one turn and writes a rotation only when the angle changes', () => {
    const a = atlas();
    const binding = bind(a, 1);
    const view = laserView(1);
    view.count = 1;
    view.angle[0] = 1024 + 256;
    const [line] = sprites(binding, 0);
    binding.sync(view, cameraAt(0, 0));
    expect(line.rotation).toBeCloseTo(Math.PI / 2, 12);
    line.rotation = 0; // a sentinel: an unchanged angle must not be written again
    binding.sync(view, cameraAt(0, 0));
    expect(line.rotation).toBe(0);
    view.angle[0] = 256; // the same direction: still not written
    binding.sync(view, cameraAt(0, 0));
    expect(line.rotation).toBe(0);
    view.angle[0] = 512;
    binding.sync(view, cameraAt(0, 0));
    expect(line.rotation).toBeCloseTo(Math.PI, 12);
  });

  it('switches a slot between warning line and beam in both directions', () => {
    const a = atlas();
    const binding = bind(a, 1);
    const view = laserView(1);
    view.count = 1;
    view.angle[0] = 128;
    const [line, beam] = sprites(binding, 0);
    const shown = (): boolean[] => [line.visible, beam.visible];
    binding.sync(view, cameraAt(0, 0));
    expect(shown()).toEqual([true, false]);
    view.width[0] = 2;
    binding.sync(view, cameraAt(0, 0));
    expect(shown()).toEqual([false, true]);
    expect(beam.rotation).toBeCloseTo(Math.PI / 4, 12); // the beam keeps its own angle cache
    view.width[0] = 0;
    binding.sync(view, cameraAt(0, 0));
    expect(shown()).toEqual([true, false]);
    view.flags[0] = SpriteFlag.Hidden;
    binding.sync(view, cameraAt(0, 0));
    expect(shown()).toEqual([false, false]);
    expect(binding.visibleCount).toBe(0);
  });

  it('uses the last frame unscaled for a band of exactly its frame count, scales one wider', () => {
    const a = atlas();
    const binding = bind(a, 1);
    const view = laserView(1);
    view.count = 1;
    const [, beam] = sprites(binding, 0);
    const last = a.textures[a.frameId('ships/a#2')];
    view.width[0] = 3.4; // rounds to 3 = the sprite's 3 frames
    binding.sync(view, cameraAt(0, 0));
    expect([beam.texture === last, beam.scale.y]).toEqual([true, 1]);
    view.width[0] = 3.6; // rounds to 4: wider than the frames
    binding.sync(view, cameraAt(0, 0));
    expect(beam.texture).toBe(last);
    expect(beam.scale.y).toBeCloseTo(3.6 / 9, 12);
    view.width[0] = 1.49; // band 1: frame 0
    binding.sync(view, cameraAt(0, 0));
    expect(beam.texture).toBe(a.textures[a.frameId('ships/a#0')]);
    expect(beam.scale.x).toBeCloseTo(100 / 16, 12);
  });

  it('hides lasers with a NaN or negative length', () => {
    const a = atlas();
    const binding = bind(a, 3);
    const view = laserView(3);
    view.count = 3;
    view.length.set([Number.NaN, -5, 20]);
    binding.sync(view, cameraAt(0, 0));
    expect((binding.container.children as Sprite[]).map((s) => s.visible)).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
    expect(binding.visibleCount).toBe(1);
  });

  it('places the origin at round(x − camera.x), round(y − camera.y) + offsetY', () => {
    const a = atlas();
    const binding = bind(a, 1, 5);
    const view = laserView(1);
    view.count = 1;
    view.x[0] = 250.6;
    view.y[0] = 80.4;
    binding.sync(view, cameraAt(100.2, 30.9));
    const [line] = sprites(binding, 0);
    expect([line.x, line.y]).toEqual([Math.round(250.6 - 100.2), Math.round(80.4 - 30.9) + 5]);
    expect(Object.is(line.x, -0)).toBe(false);
    view.x[0] = 100.4; // round(0.2) → 0, never −0
    view.y[0] = 30.5;
    binding.sync(view, cameraAt(100.6, 30.9));
    expect(Object.is(line.x, -0)).toBe(false);
  });

  it('hides the slots a view stops using, then shows them again when it grows back', () => {
    const a = atlas();
    const binding = bind(a, 3);
    const view = laserView(3);
    view.count = 3;
    binding.sync(view, cameraAt(0, 0));
    expect(binding.visibleCount).toBe(3);
    view.count = 1;
    binding.sync(view, cameraAt(0, 0));
    expect((binding.container.children as Sprite[]).map((s) => s.visible)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
    view.count = 3;
    binding.sync(view, cameraAt(0, 0));
    expect(binding.visibleCount).toBe(3);
  });

  it('destroys its sprites and container', () => {
    const a = atlas();
    const binding = bind(a, 2);
    const children = [...binding.container.children];
    binding.destroy();
    expect(binding.container.destroyed).toBe(true);
    expect(children.every((c) => c.destroyed)).toBe(true);
  });
});
