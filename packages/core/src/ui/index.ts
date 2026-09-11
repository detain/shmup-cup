/**
 * # ui — canvas UI kit, HUD model and bitmap text layout
 *
 * **Status: placeholder.** Declares the intended public API only; no game logic yet.
 *
 * **Responsibility.** Everything on screen that is not gameplay — without DOM or a UI framework. A tiny
 * widget kit (list menu, slider, toggle, key-rebind prompt, 3-letter name entry via a
 * D-pad letter picker, confirm dialog incl. the Tizen exit confirm) whose focus moves with
 * input actions; the HUD model (score / HI / 2P, lives, power meter or tier pips, shield,
 * optional boss HP bar); bitmap-font text layout. The core owns state, focus and layout
 * as renderer-agnostic draw commands; `@shmup/render-pixi` draws them with sprites.
 *
 * **Implements.**
 * - shmup_feat.md §17 — HUD and canvas-drawn UI kit
 * - shmup_tech.md §4.10 — no UI framework; scene stack + canvas menus + bitmap font
 *
 * **Intended public API.** The declarations below (and the `Planned` notes at the
 * end of the file) are the contract later steps implement.
 *
 * @module
 */
import { defineModule } from '../module-info.js';

/** Module descriptor (see {@link defineModule}). */
export const moduleInfo = defineModule({
  name: 'ui',
  status: 'placeholder',
  specRefs: ['shmup_feat.md §17', 'shmup_tech.md §4.10'],
});

/** Widget types of the canvas UI kit. */
export type WidgetKind = 'list' | 'slider' | 'toggle' | 'rebind' | 'nameEntry' | 'confirm';

/** Base state of a widget. */
export interface Widget {
  /** Which widget this is (selects the tick/draw behaviour). */
  readonly kind: WidgetKind;
  /** Text drawn with the bitmap font. */
  label: string;
  /** `true` for the widget that receives directional / Confirm input. */
  focused: boolean;
}

/** Data the HUD renderer needs each frame (rebuilt only on change). */
export interface HudModel {
  /** Score per player. */
  readonly scores: number[];
  /** Best score shown at the top of the HUD. */
  hiScore: number;
  /** Lives per player. */
  readonly lives: number[];
  /** Highlighted meter slot, -1 = none (meter mode). */
  meterCursor: number;
}

/** Bitmap-font metrics used for layout. */
export interface TextMetrics {
  /**
   * Measures a single line of text.
   *
   * @param text - Text to measure (no line breaks).
   * @param fontId - Bitmap font id.
   * @returns Width in pixels of `text` in the given font.
   */
  measure(text: string, fontId: string): number;
  /** Line advance in pixels. */
  readonly lineHeight: number;
}

// Planned: createMenu(items), menuTick(menu, input), buildHudModel(state), layoutText(...).
