/**
 * The debug panel's device line (plan M2-17 — the TV's model, firmware and display under the five
 * panel lines): absent until a host sets it, drawn on a sixth line with a taller backdrop once set,
 * kept to printable ASCII and the panel's width, and rewritten only when it changes. The overlay's
 * `setDevice`, which the shell calls every frame, allocates nothing while its input stays the same —
 * even for a TV line longer than the panel, which cleaning cuts into a new string (M2-17 review).
 */
import { DrawOp, PLAYFIELD_Y, createDebugFlags, type DrawList } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  DEBUG_DEVICE_MAX,
  buildDebugPanel,
  createDebugOverlay,
  createDebugOverlayStats,
  createDebugPanelLists,
  createFrameGraph,
  debugDeviceText,
  setDebugPanelDevice,
} from '../../src/debug/index.js';
import { createLayerStack } from '../../src/layers/index.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** A full TV line (the remote unlock's), longer than {@link DEBUG_DEVICE_MAX}. */
const TV_LINE = 'LS43AM702U 20_KANTSU2 FW T-KSU2EUC-1234.5 1920x1080@1 C69 GL1/4096';

/**
 * The text commands of a list with their y.
 *
 * @param list - The list.
 * @returns `[text, y]` pairs.
 */
function texts(list: DrawList): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] === DrawOp.Text) out.push([list.strings[list.ref[i]], list.y[i]]);
  }
  return out;
}

/**
 * The backdrop's height (its first rect).
 *
 * @param list - The backdrop list.
 * @returns The height.
 */
function backdropHeight(list: DrawList): number {
  return list.h[0];
}

describe('render-pixi/debug device line (M2-17)', () => {
  it('draws no device line until one is set, then a sixth line on a taller backdrop', () => {
    const panel = createDebugPanelLists('abc');
    const stats = createDebugOverlayStats();
    const flags = createDebugFlags();
    const graph = createFrameGraph();
    buildDebugPanel(panel, stats, null, flags, graph);
    const plain = backdropHeight(panel.backdrop);
    expect(texts(panel.values).map(([text]) => text)).toEqual(['.', '.', 'ABC']);

    setDebugPanelDevice(panel, 'QN43LS03 FW T-KSU2 1920x1080@1 C69 GL1/4096');
    buildDebugPanel(panel, stats, null, flags, graph);
    expect(backdropHeight(panel.backdrop)).toBe(plain + 10);
    const device = texts(panel.values).find(([text]) => text.startsWith('QN43'));
    expect(device).toEqual(['QN43LS03 FW T-KSU2 1920x1080@1 C69 GL1/4096', PLAYFIELD_Y + 2 + 50]);

    setDebugPanelDevice(panel, '');
    buildDebugPanel(panel, stats, null, flags, graph);
    expect(backdropHeight(panel.backdrop)).toBe(plain);
  });

  it('keeps the line to printable ASCII and the panel width', () => {
    expect(debugDeviceText('Modèle ✓ 69')).toBe('Mod?le ? 69');
    expect(debugDeviceText('x'.repeat(80))).toHaveLength(DEBUG_DEVICE_MAX);
    expect(debugDeviceText('')).toBe('');
  });

  it('rewrites the string slot only when the text changes', () => {
    const panel = createDebugPanelLists('abc');
    setDebugPanelDevice(panel, 'A');
    const revision = panel.values.revision;
    setDebugPanelDevice(panel, 'A');
    expect(panel.values.revision).toBe(revision);
    setDebugPanelDevice(panel, 'B');
    expect(panel.values.revision).toBeGreaterThan(revision);
  });

  it("sets the overlay's line once for a repeated input, even one longer than the panel", () => {
    expect(TV_LINE.length).toBeGreaterThan(DEBUG_DEVICE_MAX);
    const overlay = createDebugOverlay({ atlas: null, layers: createLayerStack() });
    const values = overlay.panel.values;
    overlay.setDevice(TV_LINE);
    const revision = values.revision;
    expect(values.strings).toContain(TV_LINE.slice(0, DEBUG_DEVICE_MAX));
    overlay.setDevice(TV_LINE);
    expect(values.revision).toBe(revision);
    overlay.setDevice('QN43LS03');
    expect(values.revision).toBeGreaterThan(revision);
    expect(values.strings).toContain('QN43LS03');
    overlay.setDevice('');
    expect(values.strings).not.toContain('QN43LS03');
    overlay.destroy();
  });

  it('allocates nothing when the shell sets the same long line every frame', () => {
    const overlay = createDebugOverlay({ atlas: null, layers: createLayerStack() });
    const line = TV_LINE;
    const growth = measureHeapGrowth(
      () => {
        overlay.setDevice(line);
      },
      20_000,
      20_000,
      3,
      8 * 1024,
    );
    // The old path cut the 66-character line into a new 56-character string per call: ≥ 20 bytes a
    // call, 400 KB a window.
    expect(growth.bytes).toBeLessThan(16 * 1024);
    overlay.destroy();
  }, 60_000);
});
