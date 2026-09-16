/**
 * Tests for the debug overlay (plan M1-19): the outline builder (ships, bullets, shots — a laser
 * shot spanning its length —, enemies, items, active lasers, the grid; clipped to the playfield,
 * nothing while the switches are off or without a World), the panel builder (every counter as a
 * `number` command, the switches' labels only when on, the frame graph's colours), and the overlay
 * itself on a renderer-like host (its container on the `DEBUG` layer, views shown only while their
 * switch is on, idempotent destroy). The allocation guard lives in `debug-alloc.test.ts`.
 */
import {
  DrawOp,
  EMPTY_CONTENT_DB,
  GRID_MARGIN,
  LaserPhase,
  LayerId,
  PLAYFIELD_Y,
  createDebugCounters,
  createDebugFlags,
  createWorld,
  resolveGameConfig,
  collectDebugCounters,
  type DebugFlags,
  type DrawList,
  type World,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { createAtlas } from '../../src/atlas/index.js';
import {
  FRAME_GRAPH_LENGTH,
  OUTLINE_COLORS,
  PANEL_COLORS,
  buildDebugOutlines,
  buildDebugPanel,
  createDebugOutlineLists,
  createDebugOverlay,
  createDebugOverlayStats,
  createDebugPanelLists,
  createFrameGraph,
  moduleInfo,
  type DebugOutlineLists,
  type DebugPanelLists,
} from '../../src/debug/index.js';
import { createLayerStack } from '../../src/layers/index.js';
import { pageImages, testManifest } from '../helpers.js';

/** A rect command read back from a list. */
interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: number;
}

/**
 * The rect commands of a list.
 *
 * @param list - The list.
 * @returns The rects.
 */
function rects(list: DrawList): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < list.count; i++) {
    if (list.op[i] !== DrawOp.Rect) continue;
    out.push({ x: list.x[i], y: list.y[i], w: list.w[i], h: list.h[i], color: list.color[i] });
  }
  return out;
}

/**
 * The named lists of an outline or panel set.
 *
 * @param lists - The set.
 * @returns `[name, list]` pairs.
 */
function entries(lists: DebugOutlineLists | DebugPanelLists): Array<[string, DrawList]> {
  return Object.entries(lists as unknown as Record<string, DrawList>);
}

/**
 * Commands in every outline list.
 *
 * @param lists - The lists.
 * @returns The total.
 */
function total(lists: DebugOutlineLists): number {
  return entries(lists).reduce((n, [, list]) => n + list.count, 0);
}

/**
 * The bounding box of a set of outline rects.
 *
 * @param list - The rects.
 * @returns `[left, top, right, bottom]` (inclusive).
 */
function bounds(list: readonly Rect[]): [number, number, number, number] {
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const rect of list) {
    l = Math.min(l, rect.x);
    t = Math.min(t, rect.y);
    r = Math.max(r, rect.x + rect.w - 1);
    b = Math.max(b, rect.y + rect.h - 1);
  }
  return [l, t, r, b];
}

/**
 * A free-flight World with the ship parked at the view's centre.
 *
 * @returns The World.
 */
function world(): World {
  const w = createWorld(resolveGameConfig({ seed: 1 }), EMPTY_CONTENT_DB);
  w.camera.x = 1000.5;
  w.camera.y = 20;
  const ship = w.players[0];
  ship.x = 1100;
  ship.y = 120;
  ship.state = 'alive';
  return w;
}

/**
 * Switches with the outlines on.
 *
 * @param grid - Also the grid.
 * @returns The switches.
 */
function outlinesOn(grid = false): DebugFlags {
  const flags = createDebugFlags();
  flags.showHitboxes = true;
  flags.showGrid = grid;
  return flags;
}

describe('render-pixi/debug outlines', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('debug');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('draws nothing while the switches are off or without a World', () => {
    const lists = createDebugOutlineLists();
    lists.bullets.rect(0, 0, 1, 1, 0);
    buildDebugOutlines(lists, world(), createDebugFlags());
    expect(total(lists)).toBe(0);
    buildDebugOutlines(lists, null, outlinesOn(true));
    expect(total(lists)).toBe(0);
  });

  it('draws each kind in its own list, in one colour', () => {
    const lists = createDebugOutlineLists();
    const w = world();
    for (let i = 0; i < 20; i++) w.bullets.spawn(1010 + i * 15, 40 + i * 5, 0, 0, 0);
    buildDebugOutlines(lists, w, outlinesOn(true));
    for (const [kind, list] of entries(lists)) {
      for (const rect of rects(list)) {
        expect(rect.color, kind).toBe(OUTLINE_COLORS[kind as keyof typeof OUTLINE_COLORS]);
      }
    }
    expect(lists.bullets.count).toBe(20 * 4);
  });

  it('outlines the ship: terrain box and hurt circle, in screen pixels under the HUD bar', () => {
    const w = world();
    const lists = createDebugOutlineLists();
    buildDebugOutlines(lists, w, outlinesOn());
    const box = w.ship.terrainBox;
    const hurt = w.ship.hurtRadius;
    const sx = 1100 - 1000.5;
    const sy = 120 - 20 + PLAYFIELD_Y;
    expect(bounds(rects(lists.terrain))).toEqual([
      Math.floor(sx - box.hw),
      Math.floor(sy - box.hh),
      Math.ceil(sx + box.hw) - 1,
      Math.ceil(sy + box.hh) - 1,
    ]);
    expect(bounds(rects(lists.hurt))).toEqual([
      Math.floor(sx - hurt),
      Math.floor(sy - hurt),
      Math.ceil(sx + hurt) - 1,
      Math.ceil(sy + hurt) - 1,
    ]);
    // A dead ship has no boxes.
    w.players[0].state = 'dead';
    buildDebugOutlines(lists, w, outlinesOn());
    expect(rects(lists.hurt)).toEqual([]);
  });

  it('outlines bullets, shots (a laser shot spans its length), enemies, items and active lasers', () => {
    const w = world();
    const b = w.bullets.spawn(1050, 60, 0, 0, 0);
    expect(b).toBeGreaterThanOrEqual(0);
    const r = w.bullets.pool.fields.radius[b];
    const shots = w.weapons.pool;
    const s = shots.alloc();
    shots.fields.x[s] = 1200;
    shots.fields.y[s] = 100;
    shots.fields.hw[s] = 3;
    shots.fields.hh[s] = 1;
    shots.fields.length[s] = 40;
    const e = w.enemies.enemies[2];
    e.state = 1; // EnemyState.Live
    e.flags = 0;
    e.x = 1300;
    e.y = 50;
    e.hw = 6;
    e.hh = 4;
    const items = w.powerups.pool;
    const it = items.alloc();
    items.fields.x[it] = 1020;
    items.fields.y[it] = 180;
    const lasers = w.bullets.lasers;
    const l = lasers.alloc();
    lasers.fields.x[l] = 1350;
    lasers.fields.y[l] = 150;
    lasers.fields.ex[l] = 1110;
    lasers.fields.ey[l] = 150;
    lasers.fields.width[l] = 6;
    lasers.fields.phase[l] = LaserPhase.Active;

    const lists = createDebugOutlineLists();
    buildDebugOutlines(lists, w, outlinesOn());
    const at = (x: number, y: number): [number, number] => [
      Math.floor(x - 1000.5),
      Math.floor(y - 20) + PLAYFIELD_Y,
    ];
    expect(bounds(rects(lists.bullets)).slice(0, 2)).toEqual(at(1050 - r, 60 - r));
    expect(bounds(rects(lists.shots)).slice(0, 2)).toEqual(at(1160, 99));
    expect(bounds(rects(lists.shots))[2]).toBe(Math.ceil(1200 - 1000.5) - 1);
    expect(bounds(rects(lists.enemies)).slice(0, 2)).toEqual(at(1294, 46));
    expect(bounds(rects(lists.items)).slice(0, 2)).toEqual(at(1015, 175));
    const beam = rects(lists.lasers);
    expect(beam).toHaveLength(17 * 4); // 17 squares along the beam
    expect(bounds(beam)[0]).toBe(Math.floor(1110 - 3 - 1000.5));
    // A telegraphed laser has no hitbox.
    lasers.fields.phase[l] = LaserPhase.Telegraph;
    buildDebugOutlines(lists, w, outlinesOn());
    expect(rects(lists.lasers)).toEqual([]);
  });

  it('clips everything to the playfield', () => {
    const w = world();
    w.bullets.spawn(900, 60, 0, 0, 0); // left of the view
    w.bullets.spawn(1100, -40, 0, 0, 0); // above the playfield
    const lists = createDebugOutlineLists();
    buildDebugOutlines(lists, w, outlinesOn());
    expect(rects(lists.bullets)).toEqual([]);
    expect(rects(lists.hurt)).toHaveLength(4); // the ship is still there
  });

  it('draws the grid cell lines at the World’s grid origin, inside the playfield', () => {
    const w = world();
    const flags = createDebugFlags();
    flags.showGrid = true;
    const lists = createDebugOutlineLists();
    buildDebugOutlines(lists, w, flags);
    const lines = rects(lists.grid);
    const cell = w.grid.cellSize;
    const originX = Math.floor(w.camera.x) - GRID_MARGIN;
    const expected: number[] = [];
    for (let k = 0; k <= w.grid.cols; k++) {
      const sx = Math.floor(originX + k * cell - w.camera.x);
      if (sx >= 0 && sx < 384) expected.push(sx);
    }
    expect(expected.length).toBeGreaterThan(10);
    expect(lines.filter((line) => line.w === 1).map((line) => line.x)).toEqual(expected);
    for (const line of lines) {
      expect(line.y).toBeGreaterThanOrEqual(PLAYFIELD_Y);
      expect(line.y + line.h).toBeLessThanOrEqual(PLAYFIELD_Y + 200);
    }
    expect(total(lists)).toBe(lines.length); // only the grid
  });
});

describe('render-pixi/debug panel', () => {
  /**
   * The values of the number commands of some lists.
   *
   * @param lists - The lists.
   * @returns Values in command order.
   */
  const numbers = (...lists: DrawList[]): number[] => {
    const out: number[] = [];
    for (const list of lists) {
      for (let i = 0; i < list.count; i++) {
        if (list.op[i] === DrawOp.Number) out.push(list.value[i]);
      }
    }
    return out;
  };
  /**
   * The strings of the text commands of some lists.
   *
   * @param lists - The lists.
   * @returns Texts in command order.
   */
  const texts = (...lists: DrawList[]): string[] => {
    const out: string[] = [];
    for (const list of lists) {
      for (let i = 0; i < list.count; i++) {
        if (list.op[i] === DrawOp.Text) out.push(list.strings[list.ref[i]]);
      }
    }
    return out;
  };
  /**
   * Every list of a panel.
   *
   * @param panel - The panel.
   * @returns The lists.
   */
  const all = (panel: DebugPanelLists): DrawList[] => entries(panel).map(([, list]) => list);

  it('shows every counter as a number and the switches only when on, one colour per list', () => {
    const panel = createDebugPanelLists('abc1234');
    const w = world();
    const counters = collectDebugCounters(w, createDebugCounters());
    const stats = createDebugOverlayStats();
    Object.assign(stats, {
      fps: 59.6,
      tickMs: 0.4567,
      renderMs: 12.3,
      drawCalls: 17,
      particles: 40,
      particleCapacity: 256,
      webGLVersion: 1,
      bootMs: 2345.6,
    });
    const flags = createDebugFlags();
    buildDebugPanel(panel, stats, counters, flags, createFrameGraph());
    const values = numbers(...all(panel));
    for (const expected of [
      60,
      0,
      45,
      12,
      30,
      17,
      40,
      256,
      512,
      64,
      96,
      counters.stateHash,
      1,
      2346,
    ]) {
      expect(values).toContain(expected);
    }
    expect(texts(panel.values)).toContain('ABC1234');
    expect(texts(panel.alerts)).toEqual([]);
    for (const kind of ['labels', 'values', 'alerts'] as const) {
      for (let i = 0; i < panel[kind].count; i++) {
        expect(panel[kind].color[i], kind).toBe(PANEL_COLORS[kind]);
      }
    }
    flags.godMode = true;
    flags.frameAdvance = true;
    flags.slowMo = 4;
    buildDebugPanel(panel, stats, counters, flags, createFrameGraph());
    expect(texts(panel.alerts)).toEqual(['GOD', 'STEP', 'SLOW']);
    expect(numbers(panel.alerts)).toEqual([4]);
    // Unknown draw calls and no World: those fields stay empty.
    stats.drawCalls = -1;
    buildDebugPanel(panel, stats, null, createDebugFlags(), createFrameGraph());
    expect(numbers(panel.values)).not.toContain(17);
    expect(texts(panel.labels)).not.toContain('@');
    expect(panel.backdrop.count).toBe(3);
  });

  it('draws the frame graph: one bar per frame, green / yellow / red by frame time', () => {
    const graph = createFrameGraph();
    for (let i = 0; i < FRAME_GRAPH_LENGTH + 5; i++) graph.push(16.6);
    graph.push(30);
    graph.push(80);
    expect(graph.count).toBe(FRAME_GRAPH_LENGTH);
    const panel = createDebugPanelLists('x');
    buildDebugPanel(panel, createDebugOverlayStats(), null, createDebugFlags(), graph);
    const good = rects(panel.good);
    expect(good).toHaveLength(FRAME_GRAPH_LENGTH - 2);
    expect(rects(panel.warn)).toEqual([
      expect.objectContaining({ color: PANEL_COLORS.warn, h: 14 }),
    ]);
    expect(rects(panel.bad)).toEqual([expect.objectContaining({ color: PANEL_COLORS.bad, h: 38 })]);
    // The newest bar is the rightmost.
    expect(rects(panel.bad)[0].x).toBe(good[0].x + FRAME_GRAPH_LENGTH - 1);
  });
});

describe('render-pixi/debug overlay', () => {
  /**
   * A renderer-like host with the test atlas.
   *
   * @param withAtlas - `false`: no atlas.
   * @returns The host.
   */
  const host = (withAtlas = true) => {
    const manifest = testManifest();
    return {
      atlas: withAtlas
        ? createAtlas(manifest, pageImages(manifest), { onWarning: () => {} })
        : null,
      layers: createLayerStack(),
    };
  };

  it('sits on the DEBUG layer and shows each view only while its switch is on', () => {
    const renderer = host();
    const overlay = createDebugOverlay(renderer, { buildId: 'f00d' });
    expect(renderer.layers.layers[LayerId.Debug].children).toContain(overlay.container);
    const [outlines, panel] = overlay.container.children;
    expect(outlines.children).toHaveLength(9);
    // M3-02b added the `pacing` list (the rAF-delta histogram).
    expect(panel.children).toHaveLength(8);
    const w = world();
    const flags = createDebugFlags();
    const counters = createDebugCounters();
    overlay.update(w, flags, counters);
    expect([outlines.visible, panel.visible]).toEqual([false, false]);
    flags.overlay = true;
    flags.showHitboxes = true;
    overlay.update(w, flags, counters);
    expect([outlines.visible, panel.visible]).toEqual([true, true]);
    expect(total(overlay.outlines)).toBeGreaterThan(0);
    expect(overlay.panel.labels.count).toBeGreaterThan(0);
    expect(overlay.panel.values.strings).toContain('F00D');
    overlay.update(null, flags, null);
    expect(outlines.visible).toBe(false);
    overlay.destroy();
    overlay.destroy();
    expect(renderer.layers.layers[LayerId.Debug].children).not.toContain(overlay.container);
  });

  it('exists without an atlas but draws nothing', () => {
    const overlay = createDebugOverlay(host(false));
    expect(overlay.container.children.map((c) => c.children.length)).toEqual([0, 0]);
    const flags = createDebugFlags();
    flags.overlay = true;
    overlay.update(world(), flags, null);
    expect(overlay.stats.drawCalls).toBe(-1);
    overlay.destroy();
  });
});
