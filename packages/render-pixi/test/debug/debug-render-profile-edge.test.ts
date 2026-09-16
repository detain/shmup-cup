/**
 * Edge cases of the M3-02c render-profile surfaces (`debug-render-profile.test.ts` has the happy
 * paths):
 *
 * - **`createRenderTargetMeter` under adversarial use.** It hooks a *global* — Pixi's
 *   `TexturePool` — so the review asked for the awkward orders: two meters at once, `stop()` out
 *   of order, `stop()` twice, and a `stop()` that must never take a later meter's hook away. A
 *   stopped meter also has to stop *counting*, in every one of those orders, or the overlay of a
 *   destroyed debug-tools instance would keep adding to a total nobody reads.
 * - **The panel's `REB` / `RT` line** (line 6) at its extremes: no counting (-1), a huge rebuild
 *   count, sub-kilobyte and gigabyte-scale render targets, the rounding and the right-aligned
 *   column, and the seven-line backdrop with and without the M2-17 device line.
 */
import { DrawOp, PLAYFIELD_Y, TextAlign, createDebugFlags, type DrawList } from '@shmup/core';
import { TexturePool, type TexturePoolClass } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  buildDebugPanel,
  createDebugOverlayStats,
  createDebugPanelLists,
  createFrameGraph,
  createRenderTargetMeter,
  setDebugPanelDevice,
} from '../../src/debug/index.js';

/** Height of one panel line, in frame pixels. */
const ROW = 10;

/** Screen y of the panel's first line. */
const PANEL_Y = PLAYFIELD_Y + 2;

/** Screen x of the panel's first column. */
const PANEL_X = 2;

/** Width of one panel character. */
const COL = 6;

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
 * A `TexturePool`-shaped stand-in.
 *
 * @returns The fake pool (as both shapes) and how often its own method ran.
 */
function fakePool(): { pool: TexturePoolClass; handle: PoolHandle; calls: () => number } {
  let calls = 0;
  const handle: PoolHandle = {
    createTexture: (w, h): unknown => {
      calls++;
      return { w, h };
    },
  };
  return { pool: handle as unknown as TexturePoolClass, handle, calls: () => calls };
}

/**
 * The commands of one panel line.
 *
 * @param list - The list.
 * @param row - The line.
 * @returns One entry per command, in command order.
 */
function line(
  list: DrawList,
  row: number,
): Array<{ op: number; text: string; value: number; x: number; align: number }> {
  const out = [];
  for (let i = 0; i < list.count; i++) {
    if (list.y[i] !== PANEL_Y + row * ROW) continue;
    out.push({
      op: list.op[i],
      text: list.op[i] === DrawOp.Text ? list.strings[list.ref[i]] : '',
      value: list.value[i],
      x: list.x[i],
      align: list.flags[i],
    });
  }
  return out;
}

/**
 * The tallest backdrop rect of the panel.
 *
 * @param backdrop - The backdrop list.
 * @returns Its height in pixels.
 */
function backdropHeight(backdrop: DrawList): number {
  let tallest = 0;
  for (let i = 0; i < backdrop.count; i++) tallest = Math.max(tallest, backdrop.h[i]);
  return tallest;
}

/**
 * A panel built from given render-profile figures.
 *
 * @param structureRebuilds - The REB figure.
 * @param renderTargetBytes - The RT figure, in bytes.
 * @param device - Device line, or `''` for none.
 * @returns The panel lists.
 */
function panelWith(
  structureRebuilds: number,
  renderTargetBytes: number,
  device = '',
): ReturnType<typeof createDebugPanelLists> {
  const panel = createDebugPanelLists('abc');
  const stats = createDebugOverlayStats();
  stats.structureRebuilds = structureRebuilds;
  stats.renderTargetBytes = renderTargetBytes;
  if (device !== '') setDebugPanelDevice(panel, device);
  buildDebugPanel(panel, stats, null, createDebugFlags(), createFrameGraph());
  return panel;
}

describe('render-pixi/debug createRenderTargetMeter, adversarially (M3-02c review)', () => {
  it('counts nothing once stopped, whatever order the meters stop in', () => {
    const { pool, handle, calls } = fakePool();
    const own = handle.createTexture;
    const first = createRenderTargetMeter(pool);
    const second = createRenderTargetMeter(pool);
    handle.createTexture(16, 16, false, false);
    expect([first.bytes, second.bytes]).toEqual([16 * 16 * 4, 16 * 16 * 4]);

    // The *inner* meter stops first: it may not steal the outer meter's hook …
    const outerHook = handle.createTexture;
    first.stop();
    expect(handle.createTexture).toBe(outerHook);
    // … and although it is still in the chain (it has to be, to keep forwarding), it is done
    // counting: a destroyed debug-tools instance must not go on adding to its total.
    handle.createTexture(32, 32, false, false);
    expect(first.bytes).toBe(16 * 16 * 4);
    expect(first.count).toBe(1);
    expect(second.bytes).toBe(16 * 16 * 4 + 32 * 32 * 4);
    expect(second.count).toBe(2);

    // The outer meter gives the hook back to the inner one, which now just forwards.
    second.stop();
    handle.createTexture(64, 64, false, false);
    expect([first.bytes, second.bytes]).toEqual([16 * 16 * 4, 16 * 16 * 4 + 32 * 32 * 4]);
    // Every call reached the pool's own method all the same.
    expect(calls()).toBe(3);
    expect(own).not.toBe(handle.createTexture); // (the pass-through is still in front)
  });

  it('is idempotent: stopping twice neither throws nor un-restores', () => {
    const { pool, handle } = fakePool();
    const own = handle.createTexture;
    const meter = createRenderTargetMeter(pool);
    meter.stop();
    expect(handle.createTexture).toBe(own);
    meter.stop();
    meter.stop();
    expect(handle.createTexture).toBe(own);
    handle.createTexture(8, 8, false, false);
    expect([meter.bytes, meter.count]).toEqual([0, 0]);

    // And a meter started on the *restored* pool works exactly like the first one did.
    const again = createRenderTargetMeter(pool);
    handle.createTexture(8, 8, false, false);
    expect(again.bytes).toBe(8 * 8 * 4);
    again.stop();
    expect(handle.createTexture).toBe(own);
  });

  it('forwards every argument and the return value, and totals RGBA8 bytes', () => {
    const seen: unknown[][] = [];
    const handle: PoolHandle = {
      createTexture: (w, h, antialias, mipmaps): unknown => {
        seen.push([w, h, antialias, mipmaps]);
        return `texture ${w}x${h}`;
      },
    };
    const pool = handle as unknown as TexturePoolClass;
    const meter = createRenderTargetMeter(pool);
    expect(handle.createTexture(1024, 512, true, true)).toBe('texture 1024x512');
    expect(seen).toEqual([[1024, 512, true, true]]);
    // A zero-size target is counted as the zero bytes it is, not skipped.
    handle.createTexture(0, 0, false, false);
    expect([meter.bytes, meter.count]).toEqual([1024 * 512 * 4, 2]);
    meter.stop();
  });

  it('meters Pixi’s real global pool by default, and gives it back', () => {
    const before = (TexturePool as unknown as PoolHandle).createTexture;
    const meter = createRenderTargetMeter();
    expect((TexturePool as unknown as PoolHandle).createTexture).not.toBe(before);
    expect(meter.bytes).toBe(0);
    meter.stop();
    expect((TexturePool as unknown as PoolHandle).createTexture).toBe(before);
  });
});

describe('render-pixi/debug the REB / RT line at its extremes (M3-02c)', () => {
  it('rounds the render-target total to whole kilobytes, right-aligned in its column', () => {
    // 1,535 bytes rounds to 1 KB, 1,537 to 2 — `Math.round`, not a truncation.
    expect(line(panelWith(0, 1535).values, 6).map((c) => c.value)).toEqual([0, 1]);
    expect(line(panelWith(0, 1537).values, 6).map((c) => c.value)).toEqual([0, 2]);
    // Half a kilobyte is not "no render targets": it rounds up to 1, so `RT 0 KB` really means
    // nothing was pooled.
    expect(line(panelWith(0, 512).values, 6).map((c) => c.value)).toEqual([0, 1]);
    expect(line(panelWith(0, 0).values, 6).map((c) => c.value)).toEqual([0, 0]);

    const cells = line(panelWith(7, 512 * 256 * 4).values, 6);
    expect(cells.map((c) => c.value)).toEqual([7, 512]);
    // REB is left-aligned at column 4, RT right-aligned at column 24 (so KB never moves).
    expect(cells[0]).toMatchObject({ x: PANEL_X + 4 * COL, align: TextAlign.Left });
    expect(cells[1]).toMatchObject({ x: PANEL_X + 24 * COL, align: TextAlign.Right });
    expect(line(panelWith(7, 0).labels, 6).map((c) => c.text)).toEqual(['REB', 'RT', 'KB']);
  });

  it('draws no REB figure at all when the renderer does not count rebuilds', () => {
    // -1 is what `PixiRenderer.structureRebuilds` reports without `countStructureRebuilds`:
    // the label stays (the line is fixed) and the number is simply absent.
    const values = line(panelWith(-1, 16 * 1024).values, 6);
    expect(values.map((c) => c.value)).toEqual([16]);
    expect(line(panelWith(-1, 16 * 1024).labels, 6).map((c) => c.text)).toEqual([
      'REB',
      'RT',
      'KB',
    ]);
    // Anything below -1 is treated the same (a host that never set the field).
    expect(line(panelWith(-42, 0).values, 6).map((c) => c.value)).toEqual([0]);
  });

  it('holds a long run and a 1080p CRT target without losing the line', () => {
    // An hour at 60 fps, and the 2048×2048 target the CRT filter pools at 1080p (review F2).
    const cells = line(panelWith(216_000, 2048 * 2048 * 4).values, 6);
    expect(cells.map((c) => c.value)).toEqual([216_000, 16_384]);
    // Even 2 GB of pooled targets stays an integer count of kilobytes.
    expect(line(panelWith(1, 2 * 1024 * 1024 * 1024).values, 6)[1].value).toBe(2 * 1024 * 1024);
  });

  it('keeps the device line under it, and the backdrop tall enough for both', () => {
    const plain = backdropHeight(panelWith(1, 1024).backdrop);
    const withDevice = panelWith(1, 1024, 'QN43LS03 FW T-KSU2');
    // The device line is line 7 since M3-02c, and the backdrop grows by exactly one line.
    expect(line(withDevice.values, 7).map((c) => c.text)).toEqual(['QN43LS03 FW T-KSU2']);
    expect(backdropHeight(withDevice.backdrop)).toBe(plain + ROW);
    // The render-profile line is still there, unshifted.
    expect(line(withDevice.labels, 6).map((c) => c.text)).toEqual(['REB', 'RT', 'KB']);
    expect(line(withDevice.values, 6).map((c) => c.value)).toEqual([1, 1]);
  });
});
