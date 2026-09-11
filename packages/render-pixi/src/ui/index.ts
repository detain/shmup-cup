/**
 * # ui — HUD and menu drawing from draw lists
 *
 * **Responsibility.** Draws a core `DrawList` (the renderer-agnostic command buffer the HUD
 * and the canvas menus produce — plan §3.4) into the HUD or UI layer: `rect` commands become
 * the atlas's white pixel scaled and tinted, `sprite` commands atlas frames, `text` and
 * `number` commands bitmap-font glyphs. All commands of a list share one ordered quad pool, so
 * later commands are drawn over earlier ones (a panel, then its text). A list whose
 * `revision` did not change since the last draw is skipped entirely. No DOM, no allocation.
 *
 * **Implements.**
 * - shmup_feat.md §17 — HUD, canvas-drawn UI kit (drawn from core draw commands)
 * - shmup_tech.md §4.10 — no UI framework
 *
 * **Public API.** {@link createDrawListView}, {@link DrawListView}, {@link DrawListViewOptions}.
 *
 * **Planned.** The HUD layout and the menu widgets that *fill* the lists are core `ui` (M1-16);
 * nothing here changes for them.
 *
 * @module
 */
import { DrawOp, defineModule, type DrawList } from '@shmup/core';
import type { Container } from 'pixi.js';
import type { Atlas } from '../atlas/index.js';
import {
  createQuadPool,
  resolveFrame,
  type QuadPool,
  type SpriteTables,
} from '../sprites/index.js';
import { DEFAULT_GLYPH_CAPACITY, drawNumber, drawText, type BitmapFont } from '../text/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'ui',
  status: 'partial',
  specRefs: ['shmup_feat.md §17', 'shmup_tech.md §4.10'],
});

/** Options of {@link createDrawListView}. */
export interface DrawListViewOptions {
  /** The atlas. */
  readonly atlas: Atlas;
  /** Font for `text` / `number` commands (`null` skips them). */
  readonly font: BitmapFont | null;
  /** Sprite tables for `sprite` commands (read on every draw). */
  readonly tables: SpriteTables;
  /** Quads to preallocate (default {@link DEFAULT_GLYPH_CAPACITY}). */
  readonly capacity?: number;
  /** Container label (debugging). */
  readonly label?: string;
}

/** Draws draw lists into one container. */
export interface DrawListView {
  /** Container holding the quads (add it to the HUD or UI layer). */
  readonly container: Container;
  /** The underlying quad pool (usage counters for debug overlays). */
  readonly pool: QuadPool;
  /**
   * Redraws the view from `list` — skipped when it is the list drawn last time and its
   * `revision` has not changed. Never allocates.
   *
   * @param list - Commands to draw.
   */
  draw(list: DrawList): void;
  /** Forces the next {@link DrawListView.draw} to redraw (sprite tables changed). */
  invalidate(): void;
  /** Destroys the quads. */
  destroy(): void;
}

/**
 * Creates a draw-list view.
 *
 * @param options - Atlas, font, sprite tables and capacity.
 * @returns The view (quads preallocated, hidden).
 * @throws {RangeError} When `capacity` is not a positive integer.
 *
 * @example
 * ```ts
 * const hud = createDrawListView({ atlas, font, tables });
 * layers.layers[LayerId.Hud].addChild(hud.container);
 * hud.draw(frame.hud); // every frame; cheap when nothing changed
 * ```
 */
export function createDrawListView(options: DrawListViewOptions): DrawListView {
  const { atlas, font, tables } = options;
  const pool = createQuadPool({
    atlas,
    capacity: options.capacity ?? DEFAULT_GLYPH_CAPACITY,
    label: options.label,
  });
  let lastList: DrawList | null = null;
  let lastRevision = -1;

  return {
    container: pool.container,
    pool,
    draw(list) {
      if (list === lastList && list.revision === lastRevision) return;
      lastList = list;
      lastRevision = list.revision;
      pool.begin();
      const count = list.count;
      for (let i = 0; i < count; i++) {
        const op = list.op[i];
        const x = list.x[i];
        const y = list.y[i];
        const color = list.color[i];
        const alpha = list.alpha[i];
        if (op === DrawOp.Rect) {
          pool.rect(x, y, list.w[i], list.h[i], color, alpha);
        } else if (op === DrawOp.Sprite) {
          const flags = list.flags[i];
          const frame = resolveFrame(atlas, tables, list.ref[i], list.frame[i], flags);
          pool.frame(frame, x, y, flags, color, alpha);
        } else if (font !== null && op === DrawOp.Text) {
          const text = list.strings[list.ref[i]] ?? '';
          drawText(pool, font, text, x, y, color, list.flags[i], alpha);
        } else if (font !== null && op === DrawOp.Number) {
          drawNumber(pool, font, list.value[i], x, y, list.frame[i], color, list.flags[i], alpha);
        }
      }
      pool.end();
    },
    invalidate() {
      lastList = null;
      lastRevision = -1;
    },
    destroy() {
      pool.destroy();
    },
  };
}
