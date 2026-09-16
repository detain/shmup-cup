/**
 * The renderer's draw-call counter (plan M1-19, the debug overlay's `DRAW` figure), with PixiJS's
 * WebGL classes faked as in `renderer-wiring.test.ts`: the fake's `gl` has the four WebGL draw
 * entry points and its `render()` calls some of them; with `countDrawCalls` the renderer reports
 * the last frame's calls (both passes), forwarding every argument to the real method; without it
 * — or without a context to wrap — it reports -1 and leaves the context alone.
 */
import { createDrawList, type RenderFrame } from '@shmup/core';
import type * as Pixi from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createPixiRenderer } from '../../src/renderer/index.js';

const record = vi.hoisted(() => ({
  /** Draw calls the fake issues per `render()` pass. */
  perPass: 3,
  /** Arguments the fake context's methods received. */
  calls: [] as unknown[][],
  /** Whether the fake renderer has a `gl` context at all. */
  withGl: true,
}));

vi.mock('pixi.js', async (importOriginal) => {
  const real = await importOriginal<typeof Pixi>();
  /**
   * Stands in for Pixi's `GlProgram`, whose constructor probes a WebGL context for the GPU's
   * fragment precision (M3-02d: the pass-2 blit builds a program with the renderer).
   */
  class FakeGlProgram {
    /**
     * Ignores the sources.
     *
     * @param options - The program options.
     * @returns A plain stand-in program.
     */
    static from(options: object): object {
      return { ...options, destroy: (): void => {} };
    }
  }
  const CANVAS_TARGET = { label: 'canvas render target' };
  /** A fake WebGL context with the draw entry points. */
  class FakeGl {
    drawElements(...args: unknown[]): void {
      record.calls.push(['drawElements', ...args]);
    }
    drawArrays(...args: unknown[]): void {
      record.calls.push(['drawArrays', ...args]);
    }
  }
  class FakeWebGLRenderer {
    readonly context = { webGLVersion: 1 };
    readonly gl = record.withGl ? new FakeGl() : undefined;
    init(): Promise<void> {
      return Promise.resolve();
    }
    resize(): void {}
    render(options: { container: Pixi.Container }): void {
      const writable = options as Record<string, unknown>;
      writable.target ??= CANVAS_TARGET;
      if (writable.target === CANVAS_TARGET) writable.clear ??= true;
      writable.transform ??= options.container.localTransform;
      const gl = this.gl;
      if (gl === undefined) return;
      for (let i = 0; i < record.perPass; i++) {
        if (i % 2 === 0) gl.drawElements(4, 6 * (i + 1), 5123, 0);
        else gl.drawArrays(4, 0, 3);
      }
    }
    destroy(): void {}
  }
  const FakeRenderTexture = {
    create(options: { width: number; height: number }) {
      return new real.Texture({
        source: new real.TextureSource({ width: options.width, height: options.height }),
      });
    },
  };
  return {
    ...real,
    WebGLRenderer: FakeWebGLRenderer,
    RenderTexture: FakeRenderTexture,
    GlProgram: FakeGlProgram,
  };
});

const canvas = { width: 0, height: 0 } as HTMLCanvasElement;

/** A frame without a world. */
const frame: RenderFrame = {
  tick: 0,
  alpha: 0,
  world: null,
  hud: createDrawList(1, 1),
  ui: createDrawList(1, 1),
  screen: { shakeX: 0, shakeY: 0, flash: 0, dim: 0 },
};

describe('render-pixi/renderer draw-call counter', () => {
  it('reports the last frame’s draw calls (both passes) and forwards every argument', async () => {
    record.withGl = true;
    record.calls = [];
    const renderer = await createPixiRenderer({
      canvas,
      displayWidth: 384,
      displayHeight: 216,
      countDrawCalls: true,
    });
    expect(renderer.drawCalls).toBe(0);
    record.perPass = 3;
    renderer.render(frame);
    expect(renderer.drawCalls).toBe(6);
    record.perPass = 1;
    renderer.render(frame);
    expect(renderer.drawCalls).toBe(2);
    expect(record.calls.slice(-2)).toEqual([
      ['drawElements', 4, 6, 5123, 0, undefined],
      ['drawElements', 4, 6, 5123, 0, undefined],
    ]);
    expect(record.calls[1]).toEqual(['drawArrays', 4, 0, 3, undefined, undefined]);
    renderer.destroy();
  });

  it('reports -1 without the option, and without a context to wrap', async () => {
    record.withGl = true;
    record.calls = [];
    const plain = await createPixiRenderer({ canvas, displayWidth: 384, displayHeight: 216 });
    plain.render(frame);
    expect(plain.drawCalls).toBe(-1);
    expect(record.calls.length).toBeGreaterThan(0); // the context was used, not wrapped
    plain.destroy();
    record.withGl = false;
    const noGl = await createPixiRenderer({
      canvas,
      displayWidth: 384,
      displayHeight: 216,
      countDrawCalls: true,
    });
    noGl.render(frame);
    expect(noGl.drawCalls).toBe(-1);
    noGl.destroy();
  });
});
