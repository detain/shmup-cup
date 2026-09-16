/**
 * The debug overlay's render-profile readouts (plan M3-02c — the two figures the render review's
 * F1 and F2 need to be visible on the TV at all):
 *
 * - the panel's seventh line, `REB` (frames on which Pixi rebuilt the scene's instruction set) and
 *   `RT` (pooled render-target kilobytes), with the device line pushed one line down;
 * - `createRenderTargetMeter`, which hooks Pixi's `TexturePool.createTexture` once so that reading
 *   the total costs a property read — and gives the pool back on `stop()`;
 * - the allocation guard: a panel rebuild with both figures set allocates nothing.
 */
import { DrawOp, PLAYFIELD_Y, createDebugFlags, type DrawList } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import type { TexturePoolClass } from 'pixi.js';
import {
  buildDebugPanel,
  createDebugOverlayStats,
  createDebugPanelLists,
  createFrameGraph,
  createRenderTargetMeter,
  setDebugPanelDevice,
} from '../../src/debug/index.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** Height of one panel line, in frame pixels (the pixel font's line height). */
const ROW = 10;

/** Screen y of the panel's first line. */
const PANEL_Y = PLAYFIELD_Y + 2;

/**
 * The `[text, y]` pairs of a list's text commands.
 *
 * @param list - The list.
 * @returns The pairs, in command order.
 */
function texts(list: DrawList): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] === DrawOp.Text) out.push([list.strings[list.ref[i]], list.y[i]]);
  }
  return out;
}

/**
 * The `[value, y]` pairs of a list's number commands.
 *
 * @param list - The list.
 * @returns The pairs, in command order.
 */
function numbers(list: DrawList): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] === DrawOp.Number) out.push([list.value[i], list.y[i]]);
  }
  return out;
}

/** The one method the meter hooks, as a plain property (not an unbound class method). */
interface PoolHandle {
  /**
   * Creates a pooled render target.
   *
   * @param w - Pixel width.
   * @param h - Pixel height.
   * @param antialias - Whether the target is multisampled.
   * @param mipmaps - Whether it generates mipmaps.
   * @returns The texture.
   */
  createTexture: (w: number, h: number, antialias: boolean, mipmaps: boolean) => unknown;
}

/**
 * A `TexturePool`-shaped stand-in: `createTexture` only records what it was asked for.
 *
 * @returns The fake pool (as both shapes — the meter's argument type and the handle the test
 *   reads) and the calls it saw.
 */
function fakePool(): { pool: TexturePoolClass; handle: PoolHandle; calls: number[][] } {
  const calls: number[][] = [];
  const handle: PoolHandle = {
    createTexture: (w, h, antialias, mipmaps): unknown => {
      calls.push([w, h, antialias ? 1 : 0, mipmaps ? 1 : 0]);
      return { w, h };
    },
  };
  return { pool: handle as unknown as TexturePoolClass, handle, calls };
}

describe('render-pixi/debug render-profile line (M3-02c)', () => {
  it('draws REB and RT on line 6 and pushes the device line to line 7', () => {
    const panel = createDebugPanelLists('abc');
    const stats = createDebugOverlayStats();
    const flags = createDebugFlags();
    const graph = createFrameGraph();
    stats.structureRebuilds = 1234;
    // One 2048×2048 RGBA render target — what the CRT filter pools at 1080p (review F2).
    stats.renderTargetBytes = 2048 * 2048 * 4;
    setDebugPanelDevice(panel, 'QN43LS03');
    buildDebugPanel(panel, stats, null, flags, graph);

    const labels = texts(panel.labels);
    expect(labels).toContainEqual(['REB', PANEL_Y + 6 * ROW]);
    expect(labels).toContainEqual(['RT', PANEL_Y + 6 * ROW]);
    expect(labels).toContainEqual(['KB', PANEL_Y + 6 * ROW]);
    const line6 = numbers(panel.values).filter(([, y]) => y === PANEL_Y + 6 * ROW);
    expect(line6.map(([value]) => value)).toEqual([1234, 16384]);
    expect(texts(panel.values)).toContainEqual(['QN43LS03', PANEL_Y + 7 * ROW]);
  });

  it('leaves the REB figure blank when the renderer does not count rebuilds', () => {
    const panel = createDebugPanelLists('abc');
    const stats = createDebugOverlayStats();
    // Fresh stats: -1 (not counting) and no pooled targets yet.
    expect(stats.structureRebuilds).toBe(-1);
    expect(stats.renderTargetBytes).toBe(0);
    buildDebugPanel(panel, stats, null, createDebugFlags(), createFrameGraph());
    const line6 = numbers(panel.values).filter(([, y]) => y === PANEL_Y + 6 * ROW);
    expect(line6.map(([value]) => value)).toEqual([0]);
  });

  it('allocates nothing while rebuilding the panel with both figures', () => {
    const panel = createDebugPanelLists('abc');
    const stats = createDebugOverlayStats();
    const flags = createDebugFlags();
    const graph = createFrameGraph();
    stats.structureRebuilds = 12;
    stats.renderTargetBytes = 16_777_216;
    const bytes = measureHeapGrowth(
      (i) => {
        stats.structureRebuilds = i;
        stats.renderTargetBytes = i * 524_288;
        buildDebugPanel(panel, stats, null, flags, graph);
      },
      2000,
      2000,
      3,
    ).bytes;
    expect(bytes).toBeLessThan(32 * 1024);
  }, 60_000);
});

describe('render-pixi/debug createRenderTargetMeter (M3-02c)', () => {
  it('totals the bytes of every pooled render target and forwards the call', () => {
    const { pool, handle, calls } = fakePool();
    const meter = createRenderTargetMeter(pool);
    expect(meter.bytes).toBe(0);
    expect(meter.count).toBe(0);
    // The frame target Pixi pools for a 384×216 filter pass: 512×256, not 384×216 (review F3).
    expect(handle.createTexture(512, 256, false, false)).toEqual({ w: 512, h: 256 });
    expect(meter.bytes).toBe(512 * 256 * 4);
    // The CRT pass at 1080p.
    handle.createTexture(2048, 2048, false, false);
    expect(meter.bytes).toBe(512 * 256 * 4 + 2048 * 2048 * 4);
    expect(meter.count).toBe(2);
    expect(calls).toEqual([
      [512, 256, 0, 0],
      [2048, 2048, 0, 0],
    ]);
  });

  it('gives the pool its own method back on stop, and stops counting', () => {
    const { pool, handle } = fakePool();
    const original = handle.createTexture;
    const meter = createRenderTargetMeter(pool);
    expect(handle.createTexture).not.toBe(original);
    handle.createTexture(8, 8, false, false);
    meter.stop();
    expect(handle.createTexture).toBe(original);
    handle.createTexture(64, 64, false, false);
    expect(meter.bytes).toBe(8 * 8 * 4);
    // Idempotent, and it never steals a later meter's hook.
    const later = createRenderTargetMeter(pool);
    const hook = handle.createTexture;
    meter.stop();
    expect(handle.createTexture).toBe(hook);
    later.stop();
    expect(handle.createTexture).toBe(original);
  });

  it('reads the total without allocating', () => {
    const { pool, handle } = fakePool();
    const meter = createRenderTargetMeter(pool);
    handle.createTexture(1024, 512, false, false);
    let seen = 0;
    const bytes = measureHeapGrowth(
      () => {
        seen += meter.bytes;
      },
      2000,
      2000,
      3,
    ).bytes;
    expect(bytes).toBeLessThan(32 * 1024);
    expect(seen).toBeGreaterThan(0);
    meter.stop();
  });
});
