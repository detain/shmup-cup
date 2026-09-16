/**
 * The **Mode-7 floor**'s rebinding edges (plan M3-02): the renderer binds a new World's floor over
 * the one it was drawing (a zone change, a warp into a bonus stage, the escape sequence), so
 * `bind` has to leave the mesh in a sane state whichever way the floor changes — and `sync` must
 * do nothing at all before anything is bound. Since M3-02d the floor is a mesh, so "detached"
 * means "hidden" and no filter list is involved.
 */
import type { Mode7View } from '@shmup/core';
import { Container } from 'pixi.js';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createMode7Floor, type Mode7Shader } from '../../src/effects/index.js';

vi.mock('pixi.js', async (importOriginal) => {
  const real = await importOriginal<typeof Pixi>();
  /** Stands in for Pixi's GlProgram (whose constructor needs a WebGL context). */
  class FakeGlProgram {
    /**
     * Ignores the sources.
     *
     * @param options - The program options.
     * @returns A plain stand-in program.
     */
    static from(options: object): object {
      return { ...options };
    }
  }
  return { ...real, GlProgram: FakeGlProgram };
});

/**
 * A stage floor.
 *
 * @param over - Fields to override.
 * @returns The view.
 */
function view(over: Partial<Mode7View> = {}): Mode7View {
  return {
    spriteId: 7,
    horizon: 100,
    bottom: 200,
    height: 34,
    scroll: 0.5,
    sway: 0.25,
    turn: 0,
    fog: 0x20_12_4a,
    fogDepth: 220,
    alpha: 1,
    from: 0,
    to: Number.POSITIVE_INFINITY,
    ...over,
  };
}

/** A fake shader that records what the floor asks of it. */
interface FakeShader extends Mode7Shader {
  /** Every `apply` call. */
  readonly applied: Array<[Mode7View, number, number]>;
  /** Every `setTile` call. */
  readonly tiles: number[][];
  /** Times `destroy` was called. */
  destroyed: number;
}

/**
 * Builds a fake shader (a plain container stands in for the mesh).
 *
 * @returns The shader.
 */
function fakeShader(): FakeShader {
  const fake: FakeShader = {
    mesh: new Container() as unknown as Mode7Shader['mesh'],
    applied: [],
    tiles: [],
    destroyed: 0,
    apply(floor, originU, originV) {
      fake.applied.push([floor, originU, originV]);
    },
    setTile(x, y, w, h, pw, ph) {
      fake.tiles.push([x, y, w, h, pw, ph]);
    },
    destroy() {
      fake.destroyed++;
    },
  };
  return fake;
}

describe('render-pixi/effects Mode-7 floor — rebinding (M3-02)', () => {
  it('does nothing at all before a view is bound', () => {
    const fake = fakeShader();
    const floor = createMode7Floor({ layer: new Container(), createShader: () => fake });
    floor.sync({ x: 10, y: 10 });
    expect(floor.shader).toBeNull();
    expect(floor.view).toBeNull();
    expect(floor.active).toBe(false);
    expect(fake.applied).toEqual([]);
    floor.destroy();
  });

  it('a World without a floor takes the drawn one off the screen', () => {
    const fake = fakeShader();
    const floor = createMode7Floor({ layer: new Container(), createShader: () => fake });
    floor.bind(view(), [0, 0, 32, 32, 256, 256]);
    floor.sync({ x: 0, y: 0 });
    expect(floor.active).toBe(true);
    expect(fake.mesh.visible).toBe(true);
    // The next World has no Mode-7 section.
    floor.bind(null, null);
    expect(floor.active).toBe(false);
    expect(fake.mesh.visible).toBe(false);
    // And a frame on it changes nothing.
    floor.sync({ x: 10, y: 10 });
    expect(floor.active).toBe(false);
    expect(fake.applied).toHaveLength(1);
    floor.destroy();
  });

  it('a second floor reuses the one mesh, with its own tile, and starts hidden', () => {
    const fake = fakeShader();
    const floor = createMode7Floor({ layer: new Container(), createShader: () => fake });
    floor.bind(view(), [0, 0, 32, 32, 256, 256]);
    floor.sync({ x: 0, y: 0 });
    expect(floor.active).toBe(true);
    const next = view({ from: 500, to: 900, scroll: 0.1 });
    floor.bind(next, [64, 0, 16, 16, 256, 256]);
    // One mesh for the renderer's whole life; the new tile is handed to its shader.
    expect(floor.shader).toBe(fake);
    expect(fake.tiles).toEqual([
      [0, 0, 32, 32, 256, 256],
      [64, 0, 16, 16, 256, 256],
    ]);
    // Hidden until the camera reaches the new floor's range.
    expect(floor.active).toBe(false);
    expect(fake.mesh.visible).toBe(false);
    floor.sync({ x: 100, y: 0 });
    expect(floor.active).toBe(false);
    floor.sync({ x: 600, y: 20 });
    expect(floor.active).toBe(true);
    expect(fake.applied.at(-1)).toEqual([next, 600 * 0.1, 20 * 0.25]);
    floor.destroy();
  });

  it('a destroyed floor keeps its shader destroyed once', () => {
    const fake = fakeShader();
    const floor = createMode7Floor({ layer: new Container(), createShader: () => fake });
    floor.bind(view(), [0, 0, 32, 32, 256, 256]);
    floor.destroy();
    expect(fake.destroyed).toBe(1);
    expect(floor.shader).toBeNull();
    expect(floor.view).toBeNull();
    expect(floor.active).toBe(false);
  });
});
