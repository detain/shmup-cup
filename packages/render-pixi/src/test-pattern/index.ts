/**
 * # test-pattern — placeholder pixel-art calibration scene
 *
 * **Responsibility.** What the renderer shows until real scenes exist: a 384×216
 * calibration pattern that makes scaling problems obvious on a TV —
 * a 1-px checker border (edge pixels must stay crisp at ×3/×5), a faint 16-px grid,
 * centre cross-hair, colour bars, an original placeholder ship drawn from a pixel
 * map, and a tick-driven marker that sweeps one pixel per simulation tick (proves
 * the fixed-step loop runs at 60 ticks/s and shows any judder).
 *
 * **Implements.** shmup_feat.md §3 (pixel-perfect integer scaling can be eyeballed),
 * shmup_feat.md §18 (lifted dark background).
 *
 * **Public API.** {@link createTestPattern}, {@link TestPattern}, {@link pixelArtToRects},
 * {@link PLACEHOLDER_SHIP}.
 *
 * @module
 */
import { defineModule } from '@shmup/core';
import { Container, Graphics } from 'pixi.js';
import { PALETTE } from '../palette/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'test-pattern',
  status: 'implemented',
  specRefs: ['shmup_feat.md §3', 'shmup_feat.md §18'],
});

/** A solid rectangle in pixel coordinates. */
export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: number;
}

/**
 * Original placeholder ship (16×9). `.` = transparent; other characters are keys of
 * the colour map passed to {@link pixelArtToRects}.
 */
export const PLACEHOLDER_SHIP: readonly string[] = [
  '....hh..........',
  '...hhhh.........',
  '.t.hhhhhhh......',
  'tt.hhhhccchhh...',
  'ttthhhhhhhhhhhhh',
  'tt.hhhhbbbbhhh..',
  '.t.hhhhhhh......',
  '...hhhh.........',
  '....hh..........',
];

/**
 * Converts a character pixel map into rectangles, merging horizontal runs of the same
 * colour (fewer draw commands). Pure — used by the test pattern and unit tests.
 *
 * @param rows - Equal-length strings, one per pixel row.
 * @param colors - Character → 0xRRGGBB; characters not in the map are transparent.
 * @param originX - X of the top-left pixel.
 * @param originY - Y of the top-left pixel.
 * @returns Rectangles covering every opaque pixel exactly once.
 */
export function pixelArtToRects(
  rows: readonly string[],
  colors: Readonly<Record<string, number>>,
  originX = 0,
  originY = 0,
): PixelRect[] {
  const rects: PixelRect[] = [];
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y] ?? '';
    let x = 0;
    while (x < row.length) {
      const key = row.charAt(x);
      const color = colors[key];
      if (color === undefined) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row.charAt(end) === key) end++;
      rects.push({ x: originX + x, y: originY + y, width: end - x, height: 1, color });
      x = end;
    }
  }
  return rects;
}

/** The pattern's display objects. */
export interface TestPattern {
  /** Add this to the low-res scene. */
  readonly root: Container;
  /**
   * Moves the animated parts for a simulation tick.
   *
   * @param tick - Current simulation tick.
   */
  update(tick: number): void;
}

/**
 * Builds the calibration pattern for a `width × height` frame.
 *
 * @param width - Internal frame width (384).
 * @param height - Internal frame height (216).
 * @returns The pattern.
 */
export function createTestPattern(width: number, height: number): TestPattern {
  const root = new Container();
  const statics = new Graphics();
  root.addChild(statics);

  // Background.
  statics.rect(0, 0, width, height).fill(PALETTE.space);

  // Faint 16-px grid (1-px lines) and centre cross-hair.
  for (let x = 16; x < width; x += 16) statics.rect(x, 0, 1, height).fill(PALETTE.grid);
  for (let y = 16; y < height; y += 16) statics.rect(0, y, width, 1).fill(PALETTE.grid);
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  statics.rect(cx, cy - 8, 1, 17).fill(PALETTE.borderA);
  statics.rect(cx - 8, cy, 17, 1).fill(PALETTE.borderA);

  // 1-px checker border: every edge pixel alternates colour.
  for (let x = 0; x < width; x++) {
    const color = x % 2 === 0 ? PALETTE.borderA : PALETTE.borderB;
    statics.rect(x, 0, 1, 1).fill(color);
    statics.rect(x, height - 1, 1, 1).fill(x % 2 === 0 ? PALETTE.borderB : PALETTE.borderA);
  }
  for (let y = 1; y < height - 1; y++) {
    statics.rect(0, y, 1, 1).fill(y % 2 === 0 ? PALETTE.borderA : PALETTE.borderB);
    statics.rect(width - 1, y, 1, 1).fill(y % 2 === 0 ? PALETTE.borderB : PALETTE.borderA);
  }

  // Colour bars along the top.
  const barWidth = 24;
  const barsX = cx - (PALETTE.bars.length * barWidth) / 2;
  for (let i = 0; i < PALETTE.bars.length; i++) {
    statics.rect(barsX + i * barWidth, 8, barWidth, 12).fill(PALETTE.bars[i] ?? PALETTE.grid);
  }

  // Placeholder ship at 2× (pixel art must stay square at every integer scale).
  const shipColors = {
    h: PALETTE.shipHull,
    t: PALETTE.shipThruster,
    c: PALETTE.shipCanopy,
    b: PALETTE.shipTrim,
  };
  for (const r of pixelArtToRects(PLACEHOLDER_SHIP, shipColors)) {
    statics.rect(48 + r.x * 2, cy - 9 + r.y * 2, r.width * 2, r.height * 2).fill(r.color);
  }

  // Tick-driven marker: a 3×3 "bullet" sweeping one pixel per tick.
  const marker = new Graphics();
  marker.rect(-1, -1, 3, 3).fill(PALETTE.bullet);
  marker.rect(0, 0, 1, 1).fill(PALETTE.bulletCore);
  marker.y = height - 24;
  root.addChild(marker);

  const travel = width - 16;
  return {
    root,
    update(tick) {
      marker.x = 8 + (tick % travel);
    },
  };
}
