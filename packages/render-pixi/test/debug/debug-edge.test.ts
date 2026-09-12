/**
 * Edge cases of the debug overlay (plan M1-19):
 *
 * - capacity: with every pool of the World full and in view (512 bullets, 96 shots, 64 enemies,
 *   16 boss parts, 16 active lasers, 32 items, both ships) and the grid on, no outline list drops a
 *   command and every command gets its quad, and no panel quad pool (shipped atlas and font) runs
 *   full with the panel's numbers at their widest;
 * - what is not outlined: ghost and non-live enemies, boss parts that are inactive, destroyed or
 *   have no hurtbox, inactive / dying ships;
 * - box geometry: a 1-px box is one rect, a 2-px-tall box two, bigger boxes four;
 * - the panel: milliseconds with two decimals (negative → 0), `used / capacity` pairs, the hash and
 *   its tick only once a hash exists, every switch label, the build id upper-cased;
 * - the frame graph ring: oldest-to-newest order after wrapping, a custom length, bar heights
 *   clamped to 1…40 px and the colour thresholds at exactly 17.5 and 34 ms.
 */
import {
  DrawOp,
  EMPTY_CONTENT_DB,
  EnemyFlag,
  EnemyState,
  LaserPhase,
  MAX_BOSS_PARTS,
  MAX_ENEMY_BULLETS,
  MAX_ENEMY_LASERS,
  MAX_ITEMS,
  MAX_PLAYER_SHOTS,
  PLAYFIELD_Y,
  TextAlign,
  createDebugCounters,
  createDebugFlags,
  createWorld,
  resolveGameConfig,
  type DebugFlags,
  type DrawList,
  type World,
} from '@shmup/core';
import type { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { createAtlas } from '../../src/atlas/index.js';
import {
  FRAME_GRAPH_LENGTH,
  PANEL_COLORS,
  buildDebugOutlines,
  buildDebugPanel,
  createDebugOutlineLists,
  createDebugOverlay,
  createDebugOverlayStats,
  createDebugPanelLists,
  createFrameGraph,
} from '../../src/debug/index.js';
import { createLayerStack } from '../../src/layers/index.js';
import { pageImages } from '../helpers.js';

/** A rect command read back from a list. */
interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
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
    if (list.op[i] === DrawOp.Rect) {
      out.push({ x: list.x[i], y: list.y[i], w: list.w[i], h: list.h[i] });
    }
  }
  return out;
}

/**
 * Switches with hitboxes (and optionally the grid) on.
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

/**
 * A free-flight World at camera (2000, 0) with every pool full and everything in view.
 *
 * @returns The World.
 */
function crowdedWorld(): World {
  const w = createWorld(resolveGameConfig({ seed: 2, loadout: 'full' }), EMPTY_CONTENT_DB);
  w.camera.x = 2000;
  w.camera.y = 0;
  const cx = 2000;
  // Bullets: a grid over the playfield.
  for (let i = 0; i < MAX_ENEMY_BULLETS; i++) {
    expect(w.bullets.spawn(cx + 10 + (i % 32) * 11, 10 + Math.floor(i / 32) * 11, 0, 0, 0)).toBe(i);
  }
  const shots = w.weapons.pool;
  for (let i = 0; i < MAX_PLAYER_SHOTS; i++) {
    const s = shots.alloc();
    shots.fields.x[s] = cx + 20 + (i % 24) * 15;
    shots.fields.y[s] = 20 + Math.floor(i / 24) * 40;
    shots.fields.hw[s] = 4;
    shots.fields.hh[s] = 2;
    shots.fields.length[s] = i % 2 === 0 ? 0 : 12;
  }
  for (const e of w.enemies.enemies) {
    e.state = EnemyState.Live;
    e.flags = 0;
    e.x = cx + 40 + (e.slot % 16) * 20;
    e.y = 30 + Math.floor(e.slot / 16) * 40;
    e.hw = 6;
    e.hh = 5;
  }
  const boss = w.bosses.boss;
  boss.partCount = MAX_BOSS_PARTS;
  for (const part of boss.parts) {
    part.active = true;
    part.hurtbox = true;
    part.destroyed = false;
    part.x = cx + 60 + part.index * 18;
    part.y = 100;
    part.hw = 7;
    part.hh = 7;
  }
  const lasers = w.bullets.lasers;
  for (let i = 0; i < MAX_ENEMY_LASERS; i++) {
    const l = lasers.alloc();
    lasers.fields.x[l] = cx + 370;
    lasers.fields.y[l] = 10 + i * 12;
    lasers.fields.ex[l] = cx + 10;
    lasers.fields.ey[l] = 10 + i * 12;
    lasers.fields.width[l] = 6;
    lasers.fields.phase[l] = LaserPhase.Active;
  }
  const items = w.powerups.pool;
  for (let i = 0; i < MAX_ITEMS; i++) {
    const it = items.alloc();
    items.fields.x[it] = cx + 30 + i * 10;
    items.fields.y[it] = 180;
  }
  for (const [index, ship] of w.players.entries()) {
    ship.active = true;
    ship.state = 'alive';
    ship.x = cx + 100 + index * 50;
    ship.y = 90;
  }
  return w;
}

/**
 * Visible and total quads of a view container.
 *
 * @param view - A draw-list view's container.
 * @returns `[visible, capacity]`.
 */
function quads(view: Container): [number, number] {
  return [view.children.filter((child) => child.visible).length, view.children.length];
}

describe('render-pixi/debug overlay — capacity with every pool full', () => {
  it('drops no outline command with every pool full and the grid on', () => {
    const w = crowdedWorld();
    const lists = createDebugOutlineLists();
    buildDebugOutlines(lists, w, outlinesOn(true));
    for (const [kind, list] of Object.entries(lists) as Array<[string, DrawList]>) {
      expect(list.dropped, kind).toBe(0);
    }
    expect(lists.bullets.count).toBe(MAX_ENEMY_BULLETS * 4);
    expect(lists.shots.count).toBe(MAX_PLAYER_SHOTS * 4);
    expect(lists.enemies.count).toBe(64 * 4);
    expect(lists.boss.count).toBe(MAX_BOSS_PARTS * 4);
    expect(lists.lasers.count).toBe(MAX_ENEMY_LASERS * 17 * 4);
    expect(lists.lasers.count).toBe(lists.lasers.capacity); // exactly full, not over
    expect(lists.items.count).toBe(MAX_ITEMS * 4);
    expect(lists.terrain.count).toBe(2 * 4);
    expect(lists.hurt.count).toBe(2 * 4);
    expect(lists.grid.count).toBeGreaterThanOrEqual(15);
  });

  it('never fills a quad pool of the overlay, outlines or panel at its widest numbers', () => {
    const { manifest } = buildAtlas();
    const renderer = {
      atlas: createAtlas(manifest, pageImages(manifest), { onWarning: () => {} }),
      layers: createLayerStack(),
    };
    const overlay = createDebugOverlay(renderer, { buildId: 'abcdef0+dirty' });
    const w = crowdedWorld();
    const flags = outlinesOn(true);
    flags.overlay = true;
    flags.godMode = true;
    flags.frameAdvance = true;
    flags.slowMo = 4;
    const counters = createDebugCounters();
    Object.assign(counters, {
      tick: 999_999,
      enemies: 64,
      enemyBullets: 512,
      bulletCapacity: 512,
      lasers: 16,
      laserCapacity: 16,
      playerShots: 96,
      shotCapacity: 96,
      items: 32,
      itemCapacity: 32,
      rank: 31,
      rngCalls: 4_294_967_295,
      stateHash: 4_294_967_295,
      hashTick: 999_960,
    });
    Object.assign(overlay.stats, {
      fps: 9999,
      tickMs: 99.99,
      renderMs: 99.99,
      drawCalls: 99_999,
      particles: 256,
      particleCapacity: 256,
      webGLVersion: 2,
      bootMs: 99_999,
    });
    for (let i = 0; i < FRAME_GRAPH_LENGTH; i++) overlay.graph.push(i % 3 === 0 ? 50 : 16);
    overlay.update(w, flags, counters);
    const [outlineRoot, panelRoot] = overlay.container.children;
    // Outline pools hold exactly one quad per possible command: full pools may fill them, but
    // every command gets its quad.
    for (const view of outlineRoot.children) {
      const kind = String(view.label).replace('debug-', '') as keyof typeof overlay.outlines;
      const [visible, capacity] = quads(view);
      expect(visible, kind).toBe(overlay.outlines[kind].count);
      expect(visible, kind).toBeLessThanOrEqual(capacity);
    }
    // Panel pools (glyphs) keep room to spare even at the widest numbers.
    for (const view of panelRoot.children) {
      const [visible, capacity] = quads(view);
      expect(visible, view.label).toBeLessThan(capacity);
    }
    expect(quads(panelRoot.children[panelRoot.children.length - 1])[0]).toBeGreaterThan(0);
    overlay.destroy();
  });
});

describe('render-pixi/debug outlines — what is skipped and box geometry', () => {
  /**
   * A World with the ships out of play (only what a test adds is outlined).
   *
   * @returns The World.
   */
  const emptyWorld = (): World => {
    const w = createWorld(resolveGameConfig({ seed: 3 }), EMPTY_CONTENT_DB);
    w.camera.x = 0;
    w.camera.y = 0;
    for (const ship of w.players) ship.active = false;
    return w;
  };

  it('skips ghost and non-live enemies', () => {
    const w = emptyWorld();
    const [live, ghost, dying] = w.enemies.enemies;
    for (const e of [live, ghost, dying]) {
      e.state = EnemyState.Live;
      e.flags = 0;
      e.x = 100;
      e.y = 100;
      e.hw = 5;
      e.hh = 5;
    }
    ghost.flags = EnemyFlag.Ghost;
    dying.state = EnemyState.Free;
    const lists = createDebugOutlineLists();
    buildDebugOutlines(lists, w, outlinesOn());
    expect(lists.enemies.count).toBe(4);
  });

  it('skips boss parts that are inactive, destroyed or have no hurtbox', () => {
    const w = emptyWorld();
    const boss = w.bosses.boss;
    boss.partCount = 4;
    for (const part of boss.parts.slice(0, 4)) {
      part.active = true;
      part.hurtbox = true;
      part.destroyed = false;
      part.x = 50 + part.index * 40;
      part.y = 80;
      part.hw = 6;
      part.hh = 6;
    }
    boss.parts[1].active = false;
    boss.parts[2].destroyed = true;
    boss.parts[3].hurtbox = false; // decorative: never hit, never touched
    boss.parts[3].hw = 0;
    boss.parts[3].hh = 0;
    // A slot past partCount is not in use.
    boss.parts[4].active = true;
    boss.parts[4].hurtbox = true;
    boss.parts[4].x = 300;
    boss.parts[4].y = 80;
    boss.parts[4].hw = 6;
    boss.parts[4].hh = 6;
    const lists = createDebugOutlineLists();
    buildDebugOutlines(lists, w, outlinesOn());
    const drawn = rects(lists.boss);
    expect(drawn).toHaveLength(4);
    expect(Math.min(...drawn.map((r) => r.x))).toBe(50 - 6);
  });

  it('skips inactive and dying ships', () => {
    const w = createWorld(resolveGameConfig({ seed: 3 }), EMPTY_CONTENT_DB);
    w.camera.x = 0;
    w.camera.y = 0;
    const [p1, p2] = w.players;
    p1.state = 'dying';
    p1.x = 100;
    p1.y = 100;
    expect(p2.active).toBe(false);
    const lists = createDebugOutlineLists();
    buildDebugOutlines(lists, w, outlinesOn());
    expect([lists.hurt.count, lists.terrain.count]).toEqual([0, 0]);
    p1.state = 'respawning';
    buildDebugOutlines(lists, w, outlinesOn());
    expect([lists.hurt.count, lists.terrain.count]).toEqual([4, 4]);
  });

  it('draws a point as one rect, a two-pixel-tall box as two and bigger boxes as four', () => {
    const w = emptyWorld();
    const bullets = w.bullets.pool;
    const sizes: Array<[number, number]> = [
      [0, 1], // radius 0: one pixel → 1 rect
      [1, 2], // radius 1: 2×2 → top and bottom
      [2, 4], // radius 2: 4×4 → 4 rects
    ];
    for (const [radius, expected] of sizes) {
      const lists = createDebugOutlineLists();
      const b = w.bullets.spawn(100, 100, 0, 0, 0);
      bullets.fields.radius[b] = radius;
      buildDebugOutlines(lists, w, outlinesOn());
      expect(lists.bullets.count, `radius ${radius}`).toBe(expected);
      bullets.free(b);
      bullets.flush();
    }
  });

  it('keeps boxes that straddle the playfield edges (partly visible) and places them exactly', () => {
    const w = emptyWorld();
    w.bullets.spawn(1, 100, 0, 0, 0); // left edge
    w.bullets.spawn(100, 1, 0, 0, 0); // top edge
    w.bullets.spawn(383, 100, 0, 0, 0); // right edge
    w.bullets.spawn(100, 199, 0, 0, 0); // bottom edge
    const lists = createDebugOutlineLists();
    buildDebugOutlines(lists, w, outlinesOn());
    expect(lists.bullets.count).toBe(16);
    const drawn = rects(lists.bullets);
    expect(Math.min(...drawn.map((r) => r.x))).toBeLessThan(1);
    expect(Math.min(...drawn.map((r) => r.y))).toBeLessThan(PLAYFIELD_Y + 1);
  });
});

describe('render-pixi/debug panel — formatting', () => {
  /**
   * The commands of a list as `[op, x, value-or-text, minDigits, align]`.
   *
   * @param list - The list.
   * @returns The commands.
   */
  const commands = (list: DrawList): Array<[number, number, number | string, number, number]> => {
    const out: Array<[number, number, number | string, number, number]> = [];
    for (let i = 0; i < list.count; i++) {
      const op = list.op[i];
      out.push([
        op,
        list.x[i],
        op === DrawOp.Text ? list.strings[list.ref[i]] : list.value[i],
        op === DrawOp.Number ? list.frame[i] : 0,
        op === DrawOp.Text ? 0 : list.flags[i],
      ]);
    }
    return out;
  };

  it('writes milliseconds as integer part, dot and two zero-padded decimals (negative → 0)', () => {
    const panel = createDebugPanelLists('x');
    const stats = createDebugOverlayStats();
    stats.tickMs = 3.057;
    stats.renderMs = -2;
    buildDebugPanel(panel, stats, null, createDebugFlags(), createFrameGraph());
    const values = commands(panel.values);
    // FPS, then TICK: 3 (right-aligned), '.', 05 (two digits), then RENDER: 0 '.' 00.
    expect(values.slice(1, 7).map(([op, , v, digits]) => [op, v, digits])).toEqual([
      [DrawOp.Number, 3, 0],
      [DrawOp.Text, '.', 0],
      [DrawOp.Number, 5, 2],
      [DrawOp.Number, 0, 0],
      [DrawOp.Text, '.', 0],
      [DrawOp.Number, 0, 2],
    ]);
    expect(values[1][4]).toBe(TextAlign.Right);
  });

  it('pairs used / capacity: the used count in the values list, slash and capacity as labels', () => {
    const panel = createDebugPanelLists('x');
    const stats = createDebugOverlayStats();
    stats.particles = 7;
    stats.particleCapacity = 256;
    buildDebugPanel(panel, stats, null, createDebugFlags(), createFrameGraph());
    const values = commands(panel.values).filter(([op]) => op === DrawOp.Number);
    expect(values.map(([, , v]) => v)).toContain(7);
    const labels = commands(panel.labels);
    const slash = labels.findIndex(([, , v]) => v === '/');
    expect(slash).toBeGreaterThanOrEqual(0);
    expect(labels[slash + 1][2]).toBe(256);
    for (let i = 0; i < panel.labels.count; i++) {
      expect(panel.labels.color[i]).toBe(PANEL_COLORS.labels);
    }
  });

  it('shows the hash and its tick only once a hash was taken', () => {
    const panel = createDebugPanelLists('x');
    const counters = createDebugCounters();
    const stats = createDebugOverlayStats();
    buildDebugPanel(panel, stats, counters, createDebugFlags(), createFrameGraph());
    expect(commands(panel.labels).some(([, , v]) => v === '@')).toBe(false);
    counters.hashTick = 120;
    counters.stateHash = 4_000_000_000;
    buildDebugPanel(panel, stats, counters, createDebugFlags(), createFrameGraph());
    expect(commands(panel.labels).some(([, , v]) => v === '@')).toBe(true);
    const numbers = commands(panel.values).map(([, , v]) => v);
    expect(numbers).toContain(4_000_000_000); // stored as a double: no sign flip above 2^31
    expect(numbers).toContain(120);
  });

  it('lists every active switch, each once, SLOW with its factor', () => {
    const panel = createDebugPanelLists('x');
    const flags = createDebugFlags();
    flags.godMode = true;
    flags.showHitboxes = true;
    flags.showGrid = true;
    flags.frameAdvance = true;
    flags.slowMo = 2;
    buildDebugPanel(panel, createDebugOverlayStats(), null, flags, createFrameGraph());
    const alerts = commands(panel.alerts);
    expect(alerts.map(([, , v]) => v)).toEqual(['GOD', 'HITBOX', 'GRID', 'STEP', 'SLOW', 2]);
    // Left to right, never overlapping.
    const xs = alerts.map(([, x]) => x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    flags.slowMo = 1;
    flags.godMode = false;
    buildDebugPanel(panel, createDebugOverlayStats(), null, flags, createFrameGraph());
    expect(commands(panel.alerts).map(([, , v]) => v)).toEqual(['HITBOX', 'GRID', 'STEP']);
  });

  it('upper-cases the build id (the pixel font has capitals only)', () => {
    expect(createDebugPanelLists('9524c84+').values.strings).toContain('9524C84+');
    expect(createDebugPanelLists('').values.strings).toContain('');
  });
});

describe('render-pixi/debug frame graph — ring and bars', () => {
  it('keeps the newest entries in order after wrapping, for any length', () => {
    const graph = createFrameGraph(4);
    for (let i = 1; i <= 6; i++) graph.push(i);
    expect(graph.count).toBe(4);
    expect(graph.head).toBe(2);
    const ordered = Array.from({ length: graph.count }, (_, i) => {
      const index = (graph.head - graph.count + i + graph.times.length) % graph.times.length;
      return graph.times[index];
    });
    expect(ordered).toEqual([3, 4, 5, 6]);
    expect(createFrameGraph().times).toHaveLength(FRAME_GRAPH_LENGTH);
  });

  it('draws a partly filled graph right-aligned, bars clamped to 1…40 px', () => {
    const graph = createFrameGraph();
    graph.push(0); // → at least 1 px
    graph.push(1000); // → at most 40 px
    const panel = createDebugPanelLists('x');
    buildDebugPanel(panel, createDebugOverlayStats(), null, createDebugFlags(), graph);
    const good = rects(panel.good);
    const bad = rects(panel.bad);
    expect(good.map((r) => r.h)).toEqual([1]);
    expect(bad.map((r) => r.h)).toEqual([40]);
    expect(bad[0].x).toBe(good[0].x + 1); // the newest is the rightmost column
    expect(good[0].y + good[0].h).toBe(bad[0].y + bad[0].h); // one baseline
  });

  it('colours at exactly 17.5 ms good and 34 ms warn (inclusive thresholds)', () => {
    const graph = createFrameGraph();
    for (const ms of [17.5, 17.51, 34, 34.01]) graph.push(ms);
    const panel = createDebugPanelLists('x');
    buildDebugPanel(panel, createDebugOverlayStats(), null, createDebugFlags(), graph);
    expect([panel.good.count, panel.warn.count, panel.bad.count]).toEqual([1, 2, 1]);
  });
});
