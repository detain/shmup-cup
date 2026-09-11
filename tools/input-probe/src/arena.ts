/**
 * Canvas2D rendering of the arena: three ship lanes, per-lane movement timelines, the frame-time graph and
 * the latency flash box. DOM glue — all state comes from pure modules. Drawing is allocation-free apart
 * from what the canvas implementation does internally.
 *
 * @module arena
 */

import type { FrameStats } from './frameStats';
import { TIMELINE_FRAMES, TRAIL_LENGTH, type Lanes, type Ship } from './ships';

/** Canvas size (must match `index.html`). */
export const ARENA_WIDTH = 820;
export const ARENA_HEIGHT = 726;
/** Height of one ship lane. */
export const LANE_HEIGHT = 150;

const LANE_COLORS = ['#4fd1ff', '#9cff6e', '#ffb347'];
const LANE_LABELS = [
  'A · raw — held between keydown and keyup',
  'B · debounced — held, or released < 50 ms ago',
  'C · naive — fixed step on every keydown (incl. repeats)',
];
const TL_X = 60;
const TL_Y = 470;
const TL_H = 18;
const TL_STEP = 24;
const TL_PX = 3;
const GRAPH_X = 60;
const GRAPH_Y = 572;
const GRAPH_H = 146;
const GRAPH_PX = 2;
const GRAPH_FRAMES = 240;
const GRAPH_MAX_MS = 50;
const FLASH_X = 580;
const FLASH_Y = 572;
const FLASH_W = 230;
const FLASH_H = 146;

/** Per-frame inputs for {@link Arena.draw}. */
export interface ArenaFrame {
  lanes: Lanes;
  frames: FrameStats;
  /** Frames left for the white flash (0 = off). */
  flashFrames: number;
  /** Key name shown in the flash box. */
  flashLabel: string;
}

/** Draws the arena canvas. */
export class Arena {
  private readonly ctx: CanvasRenderingContext2D;

  /** @throws if Canvas2D is unavailable. */
  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas2D unavailable');
    this.ctx = ctx;
  }

  /** Renders one frame. */
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

  private graphY(ms: number): number {
    const clamped = ms > GRAPH_MAX_MS ? GRAPH_MAX_MS : ms < 0 ? 0 : ms;
    return GRAPH_Y + GRAPH_H - (clamped / GRAPH_MAX_MS) * GRAPH_H;
  }

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
