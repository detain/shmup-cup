/**
 * Canvas2D rendering of the arena: three ship lanes, per-lane movement timelines, the frame-time graph and
 * the latency flash box. DOM glue — all state comes from pure modules. Drawing is allocation-free apart
 * from what the canvas implementation does internally.
 *
 * @module arena
 */

import type { FrameStats } from './frameStats';
import { TIMELINE_FRAMES, TRAIL_LENGTH, type Lanes, type Ship } from './ships';

/** Canvas width in px (must match the `width` attribute of `#arena` in `index.html`). */
export const ARENA_WIDTH = 820;
/** Canvas height in px (must match the `height` attribute of `#arena` in `index.html`). */
export const ARENA_HEIGHT = 726;
/** Height of one ship lane (px); the three lanes fill the top 450 px. */
export const LANE_HEIGHT = 150;

/** Lane colors A (cyan), B (green), C (orange) — also used for the timeline labels. */
const LANE_COLORS = ['#4fd1ff', '#9cff6e', '#ffb347'];
/** Lane captions drawn in the top-left corner of each lane. */
const LANE_LABELS = [
  'A · raw — held between keydown and keyup',
  'B · debounced — held, or released < 50 ms ago',
  'C · naive — fixed step on every keydown (incl. repeats)',
];
/** Timeline strips: left edge (px). */
const TL_X = 60;
/** Timeline strips: top of the first strip (px). */
const TL_Y = 470;
/** Timeline strips: strip height (px). */
const TL_H = 18;
/** Timeline strips: vertical distance between strips (px). */
const TL_STEP = 24;
/** Timeline strips: width of one frame (px). */
const TL_PX = 3;
/** Frame-time graph: left edge (px). */
const GRAPH_X = 60;
/** Frame-time graph: top edge (px). */
const GRAPH_Y = 572;
/** Frame-time graph: height (px). */
const GRAPH_H = 146;
/** Frame-time graph: width of one frame (px). */
const GRAPH_PX = 2;
/** Frame-time graph: frames shown. */
const GRAPH_FRAMES = 240;
/** Frame-time graph: value at the top edge (ms); larger deltas are clamped. */
const GRAPH_MAX_MS = 50;
/** Flash box: left edge (px). */
const FLASH_X = 580;
/** Flash box: top edge (px). */
const FLASH_Y = 572;
/** Flash box: width (px). */
const FLASH_W = 230;
/** Flash box: height (px). */
const FLASH_H = 146;

/** Per-frame inputs for {@link Arena.draw}. */
export interface ArenaFrame {
  /** The three ships (already stepped for this frame). */
  lanes: Lanes;
  /** Frame-time ring for the graph. */
  frames: FrameStats;
  /** Frames left for the white flash (0 = off). */
  flashFrames: number;
  /** Key name shown in the flash box. */
  flashLabel: string;
}

/**
 * Draws the arena canvas.
 *
 * Layout (820×726): lanes A/B/C at y 0–450, the three 240-frame timeline strips below them, then the
 * frame-time graph (left) and the latency flash box (right) at the bottom.
 */
export class Arena {
  /** Opaque 2D context of the `#arena` canvas. */
  private readonly ctx: CanvasRenderingContext2D;

  /**
   * @param canvas - the `#arena` canvas (its size must be {@link ARENA_WIDTH} × {@link ARENA_HEIGHT}).
   * @throws Error if Canvas2D is unavailable.
   */
  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas2D unavailable');
    this.ctx = ctx;
  }

  /**
   * Renders one frame (full repaint).
   *
   * @param f - lanes, frame stats and flash state for this frame.
   */
  draw(f: ArenaFrame): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#0d1633';
    ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    ctx.font = '14px monospace';
    ctx.textBaseline = 'top';

    this.drawLane(0, f.lanes.raw);
    this.drawLane(1, f.lanes.debounced);
    this.drawLane(2, f.lanes.naive);

    // Timelines
    ctx.fillStyle = '#9fb0e0';
    ctx.fillText('moving? last ' + TIMELINE_FRAMES + ' frames (gaps = stutter)', TL_X, TL_Y - 16);
    this.drawTimeline(0, f.lanes.raw);
    this.drawTimeline(1, f.lanes.debounced);
    this.drawTimeline(2, f.lanes.naive);

    this.drawGraph(f.frames);
    this.drawFlash(f.flashFrames > 0, f.flashLabel);
  }

  /**
   * Draws one lane: background, caption, fading trail and the ship (a right-pointing arrowhead).
   *
   * @param i - lane index (0 = A, 1 = B, 2 = C).
   * @param ship - the lane's ship.
   */
  private drawLane(i: number, ship: Ship): void {
    const ctx = this.ctx;
    const y0 = i * LANE_HEIGHT;
    ctx.fillStyle = i % 2 === 0 ? '#101c40' : '#0f1a3b';
    ctx.fillRect(0, y0, ARENA_WIDTH, LANE_HEIGHT);
    ctx.fillStyle = '#2b3f7a';
    ctx.fillRect(0, y0 + LANE_HEIGHT - 1, ARENA_WIDTH, 1);
    const color = LANE_COLORS[i] as string;
    ctx.fillStyle = color;
    ctx.fillText(LANE_LABELS[i] as string, 8, y0 + 6);

    // Trail (oldest first, fading in).
    for (let k = 0; k < TRAIL_LENGTH; k++) {
      const idx = (ship.trailHead + k) % TRAIL_LENGTH;
      ctx.globalAlpha = (k + 1) / (TRAIL_LENGTH + 4);
      ctx.fillRect((ship.trailX[idx] as number) - 3, y0 + (ship.trailY[idx] as number) - 3, 6, 6);
    }
    ctx.globalAlpha = 1;

    // Ship: triangle pointing right.
    const x = ship.x;
    const y = y0 + ship.y;
    ctx.beginPath();
    ctx.moveTo(x + 16, y);
    ctx.lineTo(x - 12, y - 11);
    ctx.lineTo(x - 6, y);
    ctx.lineTo(x - 12, y + 11);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draws one timeline strip: newest frame on the right, runs of "moving" frames as filled bars — so a
   * steady hold is one solid bar and stutter shows up as gaps.
   *
   * @param i - lane index (0 = A, 1 = B, 2 = C).
   * @param ship - the lane's ship.
   */
  private drawTimeline(i: number, ship: Ship): void {
    const ctx = this.ctx;
    const y = TL_Y + i * TL_STEP;
    ctx.fillStyle = '#1a2754';
    ctx.fillRect(TL_X, y, TIMELINE_FRAMES * TL_PX, TL_H);
    ctx.fillStyle = LANE_COLORS[i] as string;
    ctx.fillText('ABC'.charAt(i), TL_X - 20, y + 2);
    // Newest frame on the right; draw runs of "moving" frames as single rects.
    let runStart = -1;
    for (let k = 0; k <= TIMELINE_FRAMES; k++) {
      const col = TIMELINE_FRAMES - 1 - k; // k = age
      const moving = k < TIMELINE_FRAMES && ship.timelineAt(k) === 1;
      if (moving && runStart < 0) runStart = col;
      if (!moving && runStart >= 0) {
        // run covers columns col+1 .. runStart
        ctx.fillRect(TL_X + (col + 1) * TL_PX, y, (runStart - col) * TL_PX, TL_H);
        runStart = -1;
      }
    }
  }

  /**
   * Draws the frame-time graph: the last {@link GRAPH_FRAMES} rAF deltas as a line (newest on the right),
   * guide lines at 16.7 ms (60 Hz) and 33.3 ms (30 Hz), and red ticks under frames above 20 ms.
   *
   * @param frames - frame-time ring.
   */
  private drawGraph(frames: FrameStats): void {
    const ctx = this.ctx;
    const w = GRAPH_FRAMES * GRAPH_PX;
    ctx.fillStyle = '#9fb0e0';
    ctx.fillText('rAF frame time, last ' + GRAPH_FRAMES + ' frames (0–' + GRAPH_MAX_MS + ' ms)', GRAPH_X, GRAPH_Y - 16);
    ctx.fillStyle = '#111d45';
    ctx.fillRect(GRAPH_X, GRAPH_Y, w, GRAPH_H);
    // Guide lines at 16.7 and 33.3 ms.
    ctx.fillStyle = '#3d5aa8';
    ctx.fillRect(GRAPH_X, this.graphY(16.7), w, 1);
    ctx.fillRect(GRAPH_X, this.graphY(33.3), w, 1);
    ctx.fillStyle = '#6c7bab';
    ctx.fillText('16.7', GRAPH_X - 44, this.graphY(16.7) - 7);
    ctx.fillText('33.3', GRAPH_X - 44, this.graphY(33.3) - 7);

    const n = Math.min(frames.length, GRAPH_FRAMES);
    if (n === 0) return;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const x = GRAPH_X + w - 1 - k * GRAPH_PX;
      const y = this.graphY(frames.recent(k));
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // Hitch markers (> 20 ms).
    ctx.fillStyle = '#ff4d6d';
    for (let k = 0; k < n; k++) {
      const v = frames.recent(k);
      if (v > 20) ctx.fillRect(GRAPH_X + w - 2 - k * GRAPH_PX, GRAPH_Y + GRAPH_H - 6, GRAPH_PX + 1, 6);
    }
  }

  /**
   * Maps a frame time to a graph y coordinate.
   *
   * @param ms - frame time (clamped to [0, {@link GRAPH_MAX_MS}]).
   * @returns canvas y (bottom edge = 0 ms).
   */
  private graphY(ms: number): number {
    const clamped = ms > GRAPH_MAX_MS ? GRAPH_MAX_MS : ms < 0 ? 0 : ms;
    return GRAPH_Y + GRAPH_H - (clamped / GRAPH_MAX_MS) * GRAPH_H;
  }

  /**
   * Draws the latency flash box: solid white with black text while `on`, dark otherwise.
   *
   * @param on - whether the flash is active this frame.
   * @param label - name of the key that triggered the latest flash.
   */
  private drawFlash(on: boolean, label: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = on ? '#ffffff' : '#1a2754';
    ctx.fillRect(FLASH_X, FLASH_Y, FLASH_W, FLASH_H);
    ctx.fillStyle = on ? '#000000' : '#6c7bab';
    ctx.fillText('LATENCY FLASH', FLASH_X + 10, FLASH_Y + 8);
    ctx.fillText('4 frames / keydown', FLASH_X + 10, FLASH_Y + FLASH_H - 22);
    ctx.font = '22px monospace';
    ctx.fillStyle = on ? '#000000' : '#dfe6ff';
    ctx.fillText(label, FLASH_X + 10, FLASH_Y + 60);
    ctx.font = '14px monospace';
  }
}
