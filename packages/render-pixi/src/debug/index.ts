/**
 * # debug — the debug overlay
 *
 * **Responsibility.** The development overlay drawn on the `DEBUG` layer, on top of the frame
 * (plan M1-19, shmup_feat.md §24): a **panel** with FPS, tick ms / render ms (measured by the host
 * — `@shmup/shell`), WebGL draw calls, pool usage (enemy bullets, enemies, player shots,
 * particles, lasers, items), rank, gameplay RNG calls, the state hash taken every 60 ticks, the
 * WebGL version, boot ms, the build id, the active debug switches, an optional device line (M2-17 —
 * the TV's model and firmware) and a **frame graph** of the
 * last 60 frame times (hitches stand out in yellow / red); and the **outlines**: the ships' hurt
 * circles and terrain boxes, enemy and boss-part hurtboxes (every boss slot's — M2-09),
 * player-shot boxes, enemy bullet circles, item radii, active laser capsules and the broad-phase
 * grid's cells. Both are sets of core `DrawList`s ({@link buildDebugPanel},
 * {@link buildDebugOutlines} — pure, testable builders) drawn through the `ui` module's quad
 * pools, so the overlay needs no Pixi `Graphics`. Created only by dev / test builds (the shell's
 * debug tools), so a release bundle carries none of it.
 *
 * **One colour per list.** Pixi's `tint` setter allocates, and a quad pool re-tints its quads
 * whenever the items it draws shift (a bullet leaves the view, a number gains a digit). So every
 * list here draws in one colour — the outlines one list per kind ({@link DebugOutlineLists}), the
 * panel one list each for its backdrop, labels, values, active switches and the three frame-graph
 * colours ({@link DebugPanelLists}) — and a quad keeps its tint for good: the overlay allocates
 * nothing per frame.
 *
 * **Coordinates.** Screen pixels of the 384×216 frame. World boxes are drawn at
 * `world − camera + (0, PLAYFIELD_Y)` (the playfield starts under the 8-px HUD bar) and skipped
 * when they lie outside the playfield; a circle is drawn as its bounding square. The panel sits at
 * the playfield's top-left corner on a translucent backdrop.
 *
 * **Implements.**
 * - shmup_feat.md §24 — debug overlay: hitboxes / hurtboxes, collision grid, pool usage, entity
 *   counts, tick ms / render ms, draw calls, FPS, rank, RNG call count, state hash
 * - shmup_feat.md §5 — optional "show hitbox" display (the outlines)
 *
 * **Public API.** {@link createDebugOverlay}, {@link DebugOverlay}, {@link DebugOverlayOptions},
 * {@link DebugOverlayStats}, {@link createDebugOverlayStats}, {@link DebugPanelLists},
 * {@link createDebugPanelLists}, {@link buildDebugPanel}, {@link DebugOutlineLists},
 * {@link createDebugOutlineLists}, {@link buildDebugOutlines}, {@link createFrameGraph},
 * {@link FrameGraph}, {@link OUTLINE_COLORS}, {@link PANEL_COLORS}, {@link FRAME_GRAPH_LENGTH};
 * M2-17: {@link setDebugPanelDevice}, {@link debugDeviceText}, {@link DEBUG_DEVICE_MAX} (the
 * device line — the TV's model and firmware under the panel).
 *
 * @module
 */
import {
  EnemyFlag,
  EnemyState,
  GRID_MARGIN,
  ITEM_RADIUS,
  LaserPhase,
  LayerId,
  PLAYFIELD_H,
  PLAYFIELD_Y,
  TextAlign,
  createDrawList,
  defineModule,
  type DebugCounters,
  type DebugFlags,
  type DrawList,
  type World,
} from '@shmup/core';
import { Container } from 'pixi.js';
import type { PixiRenderer } from '../renderer/index.js';
import type { SpriteTables } from '../sprites/index.js';
import { DEFAULT_FONT, createBitmapFont, type BitmapFont } from '../text/index.js';
import { createDrawListView, type DrawListView } from '../ui/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'debug',
  status: 'implemented',
  specRefs: ['shmup_feat.md §24', 'shmup_feat.md §5'],
});

/** Frames the frame graph shows (one pixel column each). */
export const FRAME_GRAPH_LENGTH = 60;

/** Outline colours by kind, 0xRRGGBB. */
export const OUTLINE_COLORS = Object.freeze({
  /** Grid cell lines. */
  grid: 0x7888b0,
  /** Item radii. */
  items: 0xffffff,
  /** Enemy hurtboxes. */
  enemies: 0xff4848,
  /** Boss-part hurtboxes. */
  boss: 0xff9830,
  /** Player-shot boxes. */
  shots: 0x48e0ff,
  /** Active laser capsules. */
  lasers: 0xff90c8,
  /** Enemy bullet circles. */
  bullets: 0xff50ff,
  /** The ships' terrain boxes. */
  terrain: 0xffe040,
  /** The ships' hurt circles. */
  hurt: 0x50ff50,
});

/** Panel colours by list, 0xRRGGBB. */
export const PANEL_COLORS = Object.freeze({
  /** The translucent backdrop. */
  backdrop: 0x000000,
  /** The frame graph's reference lines (one and two 60 Hz frames). */
  guide: 0x405070,
  /** Labels and capacities. */
  labels: 0x9fb4e0,
  /** Values. */
  values: 0xffffff,
  /** Active switches. */
  alerts: 0xffe040,
  /** Frames up to 17.5 ms. */
  good: 0x50ff50,
  /** Frames up to 34 ms (one dropped frame). */
  warn: 0xffe040,
  /** Longer frames. */
  bad: 0xff4848,
});

/** The outline lists, one per kind (and colour — see the module docs). */
export interface DebugOutlineLists {
  /** Grid cell lines. */
  readonly grid: DrawList;
  /** Item radii. */
  readonly items: DrawList;
  /** Enemy hurtboxes. */
  readonly enemies: DrawList;
  /**
   * Boss-part hurtboxes: every boss slot's parts in use (M2-09 — up to 4 × 16; a circle part as its
   * bounding square).
   */
  readonly boss: DrawList;
  /** Player-shot boxes. */
  readonly shots: DrawList;
  /** Active laser capsules (squares along the beam). */
  readonly lasers: DrawList;
  /** Enemy bullet circles. */
  readonly bullets: DrawList;
  /** The ships' terrain boxes. */
  readonly terrain: DrawList;
  /** The ships' hurt circles. */
  readonly hurt: DrawList;
}

/** The outline kinds in drawing order (later ones on top). */
const OUTLINE_KINDS = [
  'grid',
  'items',
  'enemies',
  'boss',
  'shots',
  'lasers',
  'bullets',
  'terrain',
  'hurt',
] as const;

/** Most squares drawn along one laser. */
const LASER_SQUARES = 16;

/** Command capacity of each outline list: 4 rects per box of the pool's size (+ the grid lines). */
const OUTLINE_CAPACITY: Readonly<Record<keyof DebugOutlineLists, number>> = Object.freeze({
  grid: 64,
  items: 32 * 4,
  enemies: 64 * 4,
  boss: 64 * 4, // every boss slot's parts (M2-09: 4 × 16)
  shots: 96 * 4,
  lasers: 16 * (LASER_SQUARES + 1) * 4,
  bullets: 512 * 4,
  terrain: 2 * 4,
  hurt: 2 * 4,
});

/**
 * Creates empty outline lists sized for full pools.
 *
 * @remarks
 * Load time: each list holds 4 rects per box of its pool's full size (512 bullets, 64 enemies,
 * 96 shots …), so {@link buildDebugOutlines} never runs out of commands.
 *
 * @returns The lists.
 *
 * @example
 * ```ts
 * const outlines = createDebugOutlineLists();
 * buildDebugOutlines(outlines, game.world, game.debug);
 * ```
 */
export function createDebugOutlineLists(): DebugOutlineLists {
  const lists = {} as Record<keyof DebugOutlineLists, DrawList>;
  for (const kind of OUTLINE_KINDS) lists[kind] = createDrawList(OUTLINE_CAPACITY[kind], 1);
  return lists;
}

/** The panel lists, one per colour (see the module docs). */
export interface DebugPanelLists {
  /** The backdrop and the frame graph's reference lines (fixed commands). */
  readonly backdrop: DrawList;
  /** Labels, slashes and capacities. */
  readonly labels: DrawList;
  /** Values (numbers, the decimal dots, the build id). */
  readonly values: DrawList;
  /** The active switches. */
  readonly alerts: DrawList;
  /** Frame-graph bars up to 17.5 ms. */
  readonly good: DrawList;
  /** Frame-graph bars up to 34 ms. */
  readonly warn: DrawList;
  /** Longer frame-graph bars. */
  readonly bad: DrawList;
}

/**
 * Sets the panel's device line (M2-17 — the TV's model, firmware, display: a sixth line under the
 * five; `''`, the web's case, removes it). The line lives in a string slot of the values list.
 *
 * @remarks
 * Cold: writes the slot only when the text changed.
 *
 * @param lists - The panel lists.
 * @param text - The line ({@link debugDeviceText} is applied).
 */
export function setDebugPanelDevice(lists: DebugPanelLists, text: string): void {
  const line = debugDeviceText(text);
  if (line !== lists.values.strings[DEVICE]) lists.values.setString(DEVICE, line);
}

/** The panel lists in drawing order. */
const PANEL_KINDS = ['backdrop', 'good', 'warn', 'bad', 'labels', 'values', 'alerts'] as const;

/** String slots of the labels list. */
const LABELS = [
  'FPS',
  'TICK',
  'RENDER',
  'DRAW',
  'BUL',
  'ENM',
  'SHT',
  'PRT',
  'RANK',
  'RNG',
  'HASH',
  '@',
  'WEBGL',
  'BOOT',
  'LAS',
  'ITM',
  '/',
] as const;

/** String slots of the alerts list. */
const ALERTS = ['GOD', 'HITBOX', 'GRID', 'STEP', 'SLOW'] as const;

/**
 * Slot of a label.
 *
 * @param name - The label.
 * @returns Its slot in the labels list.
 */
const L = (name: (typeof LABELS)[number]): number => LABELS.indexOf(name);

/**
 * Slot of an alert.
 *
 * @param name - The alert.
 * @returns Its slot in the alerts list.
 */
const A = (name: (typeof ALERTS)[number]): number => ALERTS.indexOf(name);

/** Values-list slot of the decimal dot. */
const DOT = 0;

/** Values-list slot of the build id. */
const BUILD = 1;

/** Values-list slot of the device line (M2-17). */
const DEVICE = 2;

/** Longest device line the panel draws, in characters (the panel and its frame graph). */
export const DEBUG_DEVICE_MAX = 56;

/**
 * Makes a device line drawable by the pixel font: characters outside printable ASCII become `?`,
 * and the line is cut to {@link DEBUG_DEVICE_MAX} characters.
 *
 * @param text - The line (e.g. the TV's model and firmware — `apps/tizen` `device-info`).
 * @returns The drawable line.
 *
 * @example
 * ```ts
 * debugDeviceText('QN43LS03 ✓ T-KSU2'); // → 'QN43LS03 ? T-KSU2'
 * ```
 */
export function debugDeviceText(text: string): string {
  const cut = text.length > DEBUG_DEVICE_MAX ? text.slice(0, DEBUG_DEVICE_MAX) : text;
  return cut.replace(/[^\x20-\x7e]/g, '?');
}

/**
 * Creates the panel lists with their static strings (labels, switches, the build id).
 *
 * @param buildId - Build id shown on the fourth line (upper-cased — the font has capitals).
 * @returns The lists.
 *
 * @example
 * ```ts
 * const panel = createDebugPanelLists('abc1234');
 * buildDebugPanel(panel, stats, counters, flags, graph);
 * ```
 */
export function createDebugPanelLists(buildId: string): DebugPanelLists {
  const labels = createDrawList(96, LABELS.length);
  LABELS.forEach((text, slot) => labels.setString(slot, text));
  const values = createDrawList(64, 3);
  values.setString(DOT, '.');
  values.setString(BUILD, buildId.toUpperCase());
  values.setString(DEVICE, '');
  const alerts = createDrawList(16, ALERTS.length);
  ALERTS.forEach((text, slot) => alerts.setString(slot, text));
  return {
    backdrop: createDrawList(4, 1),
    labels,
    values,
    alerts,
    good: createDrawList(FRAME_GRAPH_LENGTH, 1),
    warn: createDrawList(FRAME_GRAPH_LENGTH, 1),
    bad: createDrawList(FRAME_GRAPH_LENGTH, 1),
  };
}

/** The host-measured numbers the panel shows (filled every frame by the host). */
export interface DebugOverlayStats {
  /** Frames per second (averaged by the host). */
  fps: number;
  /** Time spent in the frame's ticks (`game.frame`), ms. */
  tickMs: number;
  /** Time spent in `renderer.render`, ms. */
  renderMs: number;
  /** WebGL draw calls of the last frame (-1 = unknown). */
  drawCalls: number;
  /** Live particles. */
  particles: number;
  /** Particle pool size. */
  particleCapacity: number;
  /** WebGL version (1 or 2). */
  webGLVersion: number;
  /** Launch-to-ready time, ms. */
  bootMs: number;
}

/**
 * Creates zeroed stats (draw calls unknown).
 *
 * @returns Fresh stats.
 */
export function createDebugOverlayStats(): DebugOverlayStats {
  return {
    fps: 0,
    tickMs: 0,
    renderMs: 0,
    drawCalls: -1,
    particles: 0,
    particleCapacity: 0,
    webGLVersion: 0,
    bootMs: 0,
  };
}

/** A ring of the last {@link FRAME_GRAPH_LENGTH} frame times. */
export interface FrameGraph {
  /** Frame times in ms (a ring; the oldest entry is at `head` once it is full). */
  readonly times: Float64Array;
  /** Next slot to write. */
  readonly head: number;
  /** Entries written so far (capped at the length). */
  readonly count: number;
  /**
   * Records one frame time.
   *
   * @param ms - The frame's duration (time since the previous frame).
   */
  push(ms: number): void;
}

/**
 * Creates an empty frame graph.
 *
 * @remarks
 * `push()` writes one number into a preallocated `Float64Array` ring — allocation-free, so the
 * host may call it every frame.
 *
 * @param length - Frames kept (default {@link FRAME_GRAPH_LENGTH}).
 * @returns The graph.
 *
 * @example
 * ```ts
 * const graph = createFrameGraph();
 * graph.push(16.7);
 * graph.push(33.4); // a dropped frame: drawn as a yellow bar
 * graph.count; // → 2
 * ```
 */
export function createFrameGraph(length: number = FRAME_GRAPH_LENGTH): FrameGraph {
  const times = new Float64Array(length);
  const state = { head: 0, count: 0 };
  return {
    times,
    get head() {
      return state.head;
    },
    get count() {
      return state.count;
    },
    push(ms) {
      times[state.head] = ms;
      state.head = state.head + 1 < length ? state.head + 1 : 0;
      if (state.count < length) state.count++;
    },
  };
}

/** Width of one panel character (the pixel font is monospaced, 6 px). */
const COL = 6;

/** Height of one panel line (the pixel font's line height). */
const ROW = 10;

/** Screen x of the panel. */
const PANEL_X = 2;

/** Screen y of the panel's first line (2 px into the playfield). */
const PANEL_Y = PLAYFIELD_Y + 2;

/** Panel lines. */
const PANEL_LINES = 5;

/** Width of the panel's text, in pixels. */
const PANEL_W = 46 * COL;

/** Gap between the text and the frame graph, in pixels. */
const GRAPH_GAP = 4;

/** Tallest frame-graph bar, in pixels (5 frames at 8 px per 16.7 ms). */
const GRAPH_MAX = 40;

/**
 * Adds a label at a text cell.
 *
 * @param list - The labels (or alerts) list.
 * @param slot - String slot.
 * @param color - The list's colour.
 * @param col - Column.
 * @param row - Line.
 */
function label(list: DrawList, slot: number, color: number, col: number, row: number): void {
  list.text(slot, PANEL_X + col * COL, PANEL_Y + row * ROW, color);
}

/**
 * Adds a number at a text cell.
 *
 * @param list - The list.
 * @param value - Value (integer part drawn).
 * @param color - The list's colour.
 * @param col - Column (the left edge, or the right edge with `align` right).
 * @param row - Line.
 * @param align - Text alignment (default left).
 * @param minDigits - Zero padding.
 */
function number(
  list: DrawList,
  value: number,
  color: number,
  col: number,
  row: number,
  align: number = TextAlign.Left,
  minDigits = 0,
): void {
  list.number(value, PANEL_X + col * COL, PANEL_Y + row * ROW, minDigits, color, align);
}

/**
 * Builds the panel lists: the backdrop, five lines of labels and numbers and the frame graph to
 * their right. Never allocates (numbers use the `number` command, labels the lists' fixed string
 * slots).
 *
 * @remarks
 * Lines: `FPS · TICK ms · RENDER ms · DRAW`; `BUL · ENM · SHT · PRT` (used / capacity);
 * `RANK · RNG · HASH @tick`; `WEBGL · BOOT ms · LAS · ITM · build id`; the active switches
 * (`GOD`, `HITBOX`, `GRID`, `STEP`, `SLOW n`). Frame-graph bars are 1 px per frame, newest on the
 * right, 8 px per 16.7 ms (capped at 40 px), in the `good` (≤ 17.5 ms), `warn` (≤ 34 ms) or `bad`
 * list; two guide lines mark one and two 60 Hz frames.
 *
 * @param lists - The panel lists ({@link createDebugPanelLists}).
 * @param stats - Host-measured numbers.
 * @param counters - The sim counters (`core/debug` `collectDebugCounters`), or `null` without a
 *   World (the pool and hash fields then stay empty).
 * @param flags - The debug switches.
 * @param graph - The frame graph.
 *
 * @example
 * ```ts
 * buildDebugPanel(panel, stats, collectDebugCounters(game.world, counters), game.debug, graph);
 * ```
 */
export function buildDebugPanel(
  lists: DebugPanelLists,
  stats: DebugOverlayStats,
  counters: DebugCounters | null,
  flags: DebugFlags,
  graph: FrameGraph,
): void {
  const { labels, values, alerts } = lists;
  const lc = PANEL_COLORS.labels;
  const vc = PANEL_COLORS.values;
  labels.clear();
  values.clear();
  alerts.clear();

  const times = graph.times;
  const length = times.length;
  const graphX = PANEL_X + PANEL_W + GRAPH_GAP;
  const baseY = PANEL_Y + PANEL_LINES * ROW - 2;
  const backdrop = lists.backdrop;
  const device = values.strings[DEVICE] !== '';
  const lines = device ? PANEL_LINES + 1 : PANEL_LINES;
  backdrop.clear();
  backdrop.rect(
    PANEL_X - 2,
    PANEL_Y - 2,
    PANEL_W + GRAPH_GAP + length + 4,
    lines * ROW + 2,
    PANEL_COLORS.backdrop,
    150,
  );
  backdrop.rect(graphX, baseY - 8, length, 1, PANEL_COLORS.guide, 200);
  backdrop.rect(graphX, baseY - 16, length, 1, PANEL_COLORS.guide, 200);

  // Line 0: FPS 60  TICK  0.21  RENDER  1.30  DRAW 12
  label(labels, L('FPS'), lc, 0, 0);
  number(values, Math.round(stats.fps) | 0, vc, 4, 0);
  label(labels, L('TICK'), lc, 7, 0);
  millis(values, Math.floor(stats.tickMs * 100) | 0, 12, 0);
  label(labels, L('RENDER'), lc, 18, 0);
  millis(values, Math.floor(stats.renderMs * 100) | 0, 25, 0);
  label(labels, L('DRAW'), lc, 31, 0);
  if (stats.drawCalls >= 0) number(values, stats.drawCalls, vc, 36, 0);
  // Line 1: BUL 123/512  ENM 12/64  SHT 40/96  PRT 30/256
  label(labels, L('BUL'), lc, 0, 1);
  label(labels, L('ENM'), lc, 12, 1);
  label(labels, L('SHT'), lc, 22, 1);
  label(labels, L('PRT'), lc, 33, 1);
  if (counters !== null) {
    usage(lists, counters.enemyBullets, counters.bulletCapacity, 4, 1);
    usage(lists, counters.enemies, counters.enemyCapacity, 16, 1);
    usage(lists, counters.playerShots, counters.shotCapacity, 26, 1);
  }
  usage(lists, stats.particles, stats.particleCapacity, 37, 1);
  // Line 2: RANK 2  RNG 1234  HASH 3735928559 @600
  label(labels, L('RANK'), lc, 0, 2);
  label(labels, L('RNG'), lc, 9, 2);
  label(labels, L('HASH'), lc, 22, 2);
  if (counters !== null) {
    number(values, counters.rank, vc, 5, 2);
    number(values, counters.rngCalls, vc, 13, 2);
    if (counters.hashTick >= 0) {
      number(values, counters.stateHash, vc, 27, 2);
      label(labels, L('@'), lc, 38, 2);
      number(values, counters.hashTick, vc, 39, 2);
    }
  }
  // Line 3: WEBGL 1  BOOT 1234  LAS 2/16  ITM 1/32  build
  label(labels, L('WEBGL'), lc, 0, 3);
  number(values, stats.webGLVersion, vc, 6, 3);
  label(labels, L('BOOT'), lc, 8, 3);
  number(values, Math.round(stats.bootMs) | 0, vc, 13, 3);
  label(labels, L('LAS'), lc, 19, 3);
  label(labels, L('ITM'), lc, 29, 3);
  if (counters !== null) {
    usage(lists, counters.lasers, counters.laserCapacity, 22, 3);
    usage(lists, counters.items, counters.itemCapacity, 32, 3);
  }
  label(values, BUILD, vc, 39, 3);
  // Line 4: the active switches.
  const ac = PANEL_COLORS.alerts;
  let col = 0;
  if (flags.godMode) {
    label(alerts, A('GOD'), ac, col, 4);
    col += 4;
  }
  if (flags.showHitboxes) {
    label(alerts, A('HITBOX'), ac, col, 4);
    col += 7;
  }
  if (flags.showGrid) {
    label(alerts, A('GRID'), ac, col, 4);
    col += 5;
  }
  if (flags.frameAdvance) {
    label(alerts, A('STEP'), ac, col, 4);
    col += 5;
  }
  if (flags.slowMo > 1) {
    label(alerts, A('SLOW'), ac, col, 4);
    number(alerts, flags.slowMo, ac, col + 5, 4);
  }
  // Line 5 (M2-17): the device line (model, firmware, display) when the host set one.
  if (device) label(values, DEVICE, vc, 0, 5);

  // The frame graph, newest bar on the right.
  const good = lists.good;
  const warn = lists.warn;
  const bad = lists.bad;
  good.clear();
  warn.clear();
  bad.clear();
  const count = graph.count;
  for (let i = 0; i < count; i++) {
    const ms = times[(graph.head - count + i + length) % length];
    let h = Math.round((ms * 8) / (1000 / 60));
    if (h < 1) h = 1;
    if (h > GRAPH_MAX) h = GRAPH_MAX;
    const x = graphX + (length - count) + i;
    if (ms <= 17.5) good.rect(x, baseY - h, 1, h, PANEL_COLORS.good);
    else if (ms <= 34) warn.rect(x, baseY - h, 1, h, PANEL_COLORS.warn);
    else bad.rect(x, baseY - h, 1, h, PANEL_COLORS.bad);
  }
}

/**
 * Adds milliseconds with two decimals (`12.34`) to the values list, without building a string.
 *
 * @param values - The values list.
 * @param centis - Hundredths of a millisecond, a whole number (a fractional argument would be
 *   boxed by the call).
 * @param col - Column of the integer part (right-aligned in the 2 columns before the dot).
 * @param row - Line.
 */
function millis(values: DrawList, centis: number, col: number, row: number): void {
  const c = centis > 0 ? centis : 0;
  const hundredths = c % 100;
  const vc = PANEL_COLORS.values;
  number(values, (c - hundredths) / 100, vc, col + 2, row, TextAlign.Right);
  label(values, DOT, vc, col + 2, row);
  number(values, hundredths, vc, col + 3, row, TextAlign.Left, 2);
}

/**
 * Adds a `used/capacity` pair: `used` in the values list (right-aligned in 3 columns), the slash
 * and the capacity in the labels list.
 *
 * @param lists - The panel lists.
 * @param used - Used slots.
 * @param capacity - Capacity.
 * @param col - First column of `used`.
 * @param row - Line.
 */
function usage(
  lists: DebugPanelLists,
  used: number,
  capacity: number,
  col: number,
  row: number,
): void {
  number(lists.values, used, PANEL_COLORS.values, col + 3, row, TextAlign.Right);
  label(lists.labels, L('/'), PANEL_COLORS.labels, col + 3, row);
  number(lists.labels, capacity, PANEL_COLORS.labels, col + 4, row);
}

/**
 * Scratch state of {@link buildDebugOutlines}: the camera and the world box being outlined. A class
 * instance, so the fractional values stay unboxed doubles — passing them as arguments to a call V8
 * does not inline would box each one (a few KB per frame with a screen full of bullets).
 */
class OutlineScratch {
  /** Camera x. */
  camX = 0;
  /** Camera y. */
  camY = 0;
  /** World left edge of the box. */
  x0 = 0;
  /** World top edge. */
  y0 = 0;
  /** World right edge. */
  x1 = 0;
  /** World bottom edge. */
  y1 = 0;

  /**
   * Sets the box from a centre and half extents.
   *
   * @param cx - Centre x.
   * @param cy - Centre y.
   * @param hw - Half width.
   * @param hh - Half height.
   */
  centred(cx: number, cy: number, hw: number, hh: number): void {
    this.x0 = cx - hw;
    this.y0 = cy - hh;
    this.x1 = cx + hw;
    this.y1 = cy + hh;
  }
}

/** The box being outlined (see {@link OutlineScratch}). */
const scratch = new OutlineScratch();

/**
 * Adds the 1-px outline of the scratch box (skipped when it lies outside the playfield).
 *
 * @param list - The kind's list.
 * @param color - The list's colour.
 */
function outline(list: DrawList, color: number): void {
  const left = Math.floor(scratch.x0 - scratch.camX) | 0;
  const top = (Math.floor(scratch.y0 - scratch.camY) + PLAYFIELD_Y) | 0;
  let right = (Math.ceil(scratch.x1 - scratch.camX) - 1) | 0;
  let bottom = (Math.ceil(scratch.y1 - scratch.camY) + PLAYFIELD_Y - 1) | 0;
  if (right < left) right = left;
  if (bottom < top) bottom = top;
  if (right < 0 || left >= 384 || bottom < PLAYFIELD_Y || top >= PLAYFIELD_Y + PLAYFIELD_H) return;
  const w = right - left + 1;
  const h = bottom - top + 1;
  list.rect(left, top, w, 1, color);
  if (h > 1) list.rect(left, bottom, w, 1, color);
  if (h > 2) {
    list.rect(left, top + 1, 1, h - 2, color);
    if (w > 1) list.rect(right, top + 1, 1, h - 2, color);
  }
}

/**
 * Rebuilds the outline lists from a World: with `flags.showHitboxes` the ships' hurt circles
 * (scaled by `shield.hurtScale`, so Reduce's smaller hurtbox shows — M2-04) and terrain boxes
 * (never scaled), enemy and boss-part hurtboxes (the parts of every boss slot in use — M2-09),
 * player-shot boxes (a laser shot spans its length),
 * bullet circles, item radii and active laser capsules (17 squares along each beam); with
 * `flags.showGrid` the broad-phase grid's cell lines. Clears every list first; never allocates.
 *
 * @param lists - The outline lists ({@link createDebugOutlineLists}).
 * @param world - The World (its camera places the boxes), or `null` (the lists stay empty).
 * @param flags - The debug switches.
 *
 * @example
 * ```ts
 * buildDebugOutlines(outlines, frame.world === null ? null : game.world, game.debug);
 * ```
 */
export function buildDebugOutlines(
  lists: DebugOutlineLists,
  world: World | null,
  flags: DebugFlags,
): void {
  for (let i = 0; i < OUTLINE_KINDS.length; i++) lists[OUTLINE_KINDS[i]].clear();
  if (world === null || (!flags.showHitboxes && !flags.showGrid)) return;
  const camera = world.camera;
  scratch.camX = camera.x;
  scratch.camY = camera.y;
  if (flags.showGrid) {
    const grid = lists.grid;
    const cell = world.grid.cellSize;
    const originX = (Math.floor(camera.x) - GRID_MARGIN) | 0;
    const originY = (Math.floor(camera.y) - GRID_MARGIN) | 0;
    for (let k = 0; k <= world.grid.cols; k++) {
      const sx = Math.floor(originX + k * cell - scratch.camX) | 0;
      if (sx >= 0 && sx < 384) grid.rect(sx, PLAYFIELD_Y, 1, PLAYFIELD_H, OUTLINE_COLORS.grid, 90);
    }
    for (let k = 0; k <= world.grid.rows; k++) {
      const sy = (Math.floor(originY + k * cell - scratch.camY) + PLAYFIELD_Y) | 0;
      if (sy >= PLAYFIELD_Y && sy < PLAYFIELD_Y + PLAYFIELD_H) {
        grid.rect(0, sy, 384, 1, OUTLINE_COLORS.grid, 90);
      }
    }
  }
  if (!flags.showHitboxes) return;

  const items = world.powerups.pool;
  const item = items.fields;
  for (let i = 0; i < items.count; i++) {
    scratch.centred(item.x[i], item.y[i], ITEM_RADIUS, ITEM_RADIUS);
    outline(lists.items, OUTLINE_COLORS.items);
  }

  const enemies = world.enemies.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.state !== EnemyState.Live || (e.flags & EnemyFlag.Ghost) !== 0) continue;
    scratch.centred(e.x, e.y, e.hw, e.hh);
    outline(lists.enemies, OUTLINE_COLORS.enemies);
  }
  // Every boss slot's parts in use (M2-09: captains, double and inner bosses share the World); a
  // circle part is outlined by its bounding square.
  const slots = world.bosses.slots;
  for (let s = 0; s < slots.length; s++) {
    const boss = slots[s];
    const parts = boss.parts;
    for (let i = 0; i < boss.partCount; i++) {
      const part = parts[i];
      // A part without a hurtbox is never hit or touched: nothing to outline.
      if (!part.active || !part.hurtbox || part.destroyed) continue;
      scratch.centred(part.x, part.y, part.hw, part.hh);
      outline(lists.boss, OUTLINE_COLORS.boss);
    }
  }

  const shots = world.weapons.pool;
  const shot = shots.fields;
  for (let i = 0; i < shots.count; i++) {
    const length = shot.length[i];
    scratch.centred(shot.x[i], shot.y[i], shot.hw[i], shot.hh[i]);
    if (length > 0) {
      // A laser shot's box spans its length, back from its head.
      scratch.x1 = shot.x[i];
      scratch.x0 = scratch.x1 - length;
    }
    outline(lists.shots, OUTLINE_COLORS.shots);
  }

  const lasers = world.bullets.lasers;
  const laser = lasers.fields;
  for (let i = 0; i < lasers.count; i++) {
    if (laser.phase[i] !== LaserPhase.Active) continue;
    for (let k = 0; k <= LASER_SQUARES; k++) {
      const x0 = laser.x[i];
      const y0 = laser.y[i];
      const r = laser.width[i] / 2;
      scratch.centred(
        x0 + ((laser.ex[i] - x0) * k) / LASER_SQUARES,
        y0 + ((laser.ey[i] - y0) * k) / LASER_SQUARES,
        r,
        r,
      );
      outline(lists.lasers, OUTLINE_COLORS.lasers);
    }
  }

  const bullets = world.bullets.pool;
  const bullet = bullets.fields;
  for (let i = 0; i < bullets.count; i++) {
    const r = bullet.radius[i];
    scratch.centred(bullet.x[i], bullet.y[i], r, r);
    outline(lists.bullets, OUTLINE_COLORS.bullets);
  }

  const players = world.players;
  const spec = world.ship;
  const hurt = spec.hurtRadius;
  const box = spec.terrainBox;
  for (let i = 0; i < players.length; i++) {
    const ship = players[i];
    if (!ship.active || ship.state === 'dying' || ship.state === 'dead') continue;
    scratch.centred(ship.x, ship.y, box.hw, box.hh);
    outline(lists.terrain, OUTLINE_COLORS.terrain);
    // Reduce shrinks the hurt circle (M2-04); the terrain box never changes.
    const r = hurt * ship.shield.hurtScale;
    scratch.centred(ship.x, ship.y, r, r);
    outline(lists.hurt, OUTLINE_COLORS.hurt);
  }
}

/** Options of {@link createDebugOverlay}. */
export interface DebugOverlayOptions {
  /** Build id shown in the panel (the apps' `__SHMUP_BUILD__`; default `'dev'`). */
  readonly buildId?: string;
}

/** The overlay of one renderer (see {@link createDebugOverlay}). */
export interface DebugOverlay {
  /** The overlay's root on the renderer's `DEBUG` layer: the outlines, then the panel. */
  readonly container: Container;
  /** Host-measured numbers the panel shows — fill them before {@link DebugOverlay.update}. */
  readonly stats: DebugOverlayStats;
  /** The frame graph — push each frame's time into it. */
  readonly graph: FrameGraph;
  /** The panel's lists (rebuilt by `update` while `flags.overlay` is on). */
  readonly panel: DebugPanelLists;
  /** The outline lists (rebuilt by `update` while hitboxes or the grid are on). */
  readonly outlines: DebugOutlineLists;
  /**
   * Rebuilds and draws the overlay for this frame: the panel when `flags.overlay` is on, the
   * outlines of `world` when `flags.showHitboxes` / `flags.showGrid` are; hides what is off. Call
   * after the frame's ticks and before `renderer.render`. Never allocates.
   *
   * @param world - The World on screen, or `null` (menus: no outlines).
   * @param flags - The debug switches.
   * @param counters - The sim counters for the panel, or `null` without a World.
   */
  update(world: World | null, flags: DebugFlags, counters: DebugCounters | null): void;
  /**
   * Sets the panel's device line (M2-17 — {@link setDebugPanelDevice}; `''` removes it). Cheap
   * when the text did not change.
   *
   * @param text - The line.
   */
  setDevice(text: string): void;
  /** Removes the overlay from the renderer and destroys its quads (idempotent). */
  destroy(): void;
}

/** One list and the view that draws it. */
interface ListView {
  /** The list. */
  readonly list: DrawList;
  /** Its view. */
  readonly view: DrawListView;
}

/**
 * Creates the debug overlay on a renderer: a container on its `DEBUG` layer holding one
 * draw-list view per outline kind and per panel colour, fed from the atlas's white pixel and
 * bitmap font.
 *
 * @remarks
 * Load time only (dev / test builds): allocates the lists and their quad pools once (a quad per
 * possible command — 4 per box of every pool, the panel's glyphs). Without an atlas the overlay
 * exists but draws nothing (and without the atlas's font the panel has no text). `update()` skips
 * a list whose revision did not change and hides the container that is off.
 *
 * @param renderer - The renderer (its `atlas` and `layers`).
 * @param options - Build id.
 * @returns The overlay.
 *
 * @example
 * ```ts
 * const overlay = createDebugOverlay(renderer, { buildId: __SHMUP_BUILD__ });
 * // every frame (dev builds):
 * overlay.stats.fps = fps;
 * overlay.update(game.world, game.debug, collectDebugCounters(game.world, counters));
 * renderer.render(frame);
 * ```
 */
export function createDebugOverlay(
  renderer: Pick<PixiRenderer, 'atlas' | 'layers'>,
  options: DebugOverlayOptions = {},
): DebugOverlay {
  const container = new Container({ label: 'debug-overlay' });
  const outlineRoot = new Container({ label: 'debug-outlines' });
  const panelRoot = new Container({ label: 'debug-panel' });
  outlineRoot.visible = false;
  panelRoot.visible = false;
  container.addChild(outlineRoot, panelRoot);
  renderer.layers.layers[LayerId.Debug].addChild(container);
  const outlines = createDebugOutlineLists();
  const panel = createDebugPanelLists(options.buildId ?? 'dev');
  const stats = createDebugOverlayStats();
  const graph = createFrameGraph();
  const outlineViews: ListView[] = [];
  const panelViews: ListView[] = [];
  const atlas = renderer.atlas;
  if (atlas !== null) {
    const font: BitmapFont | null = Object.prototype.hasOwnProperty.call(
      atlas.manifest.fonts,
      DEFAULT_FONT,
    )
      ? createBitmapFont(atlas, DEFAULT_FONT)
      : null;
    // Only rects, text and numbers: no sprite ids to resolve.
    const tables: SpriteTables = { base: new Int32Array(0), flash: new Int32Array(0) };
    for (const kind of OUTLINE_KINDS) {
      const list = outlines[kind];
      const view = createDrawListView({
        atlas,
        font: null,
        tables,
        capacity: list.capacity,
        label: `debug-${kind}`,
      });
      outlineRoot.addChild(view.container);
      outlineViews.push({ list, view });
    }
    for (const kind of PANEL_KINDS) {
      const list = panel[kind];
      // Text lists need a quad per glyph: up to 12 per command (a 10-digit hash, `HITBOX`).
      const text = kind === 'labels' || kind === 'values' || kind === 'alerts';
      const view = createDrawListView({
        atlas,
        font,
        tables,
        capacity: text ? list.capacity * 12 : list.capacity,
        label: `debug-${kind}`,
      });
      panelRoot.addChild(view.container);
      panelViews.push({ list, view });
    }
  }
  let destroyed = false;
  return {
    container,
    stats,
    graph,
    panel,
    outlines,
    update(world, flags, counters) {
      const showOutlines = world !== null && (flags.showHitboxes || flags.showGrid);
      outlineRoot.visible = showOutlines;
      if (showOutlines) {
        buildDebugOutlines(outlines, world, flags);
        for (let i = 0; i < outlineViews.length; i++) {
          outlineViews[i].view.draw(outlineViews[i].list);
        }
      }
      panelRoot.visible = flags.overlay;
      if (flags.overlay) {
        buildDebugPanel(panel, stats, counters, flags, graph);
        for (let i = 0; i < panelViews.length; i++) panelViews[i].view.draw(panelViews[i].list);
      }
    },
    setDevice(text) {
      setDebugPanelDevice(panel, text);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const entry of outlineViews) entry.view.destroy();
      for (const entry of panelViews) entry.view.destroy();
      container.destroy({ children: true });
    },
  };
}
