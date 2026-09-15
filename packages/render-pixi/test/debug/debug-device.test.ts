/**
 * The debug panel's device line (plan M2-17 — the TV's model, firmware and display under the five
 * panel lines): absent until a host sets it, drawn on a sixth line with a taller backdrop once set,
 * kept to printable ASCII and the panel's width, and rewritten only when it changes.
 */
import { DrawOp, PLAYFIELD_Y, createDebugFlags, type DrawList } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  DEBUG_DEVICE_MAX,
  buildDebugPanel,
  createDebugOverlayStats,
  createDebugPanelLists,
  createFrameGraph,
  debugDeviceText,
  setDebugPanelDevice,
} from '../../src/debug/index.js';

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
});
