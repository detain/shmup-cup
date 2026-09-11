/**
 * DOM glue for the text panels and the stage scaling. Updated at ~10 Hz by `main.ts`; writes only when a
 * panel's text actually changed.
 *
 * The page is laid out once at a fixed 1920×1080 size (see `style.css`) and scaled uniformly with a CSS
 * transform, so the layout is identical on the TV, a 4K monitor and a small desktop window.
 *
 * @module ui
 */

/** Stage width in CSS pixels (spec: single 1920×1080 stage scaled to the window). */
export const STAGE_WIDTH = 1920;
/** Stage height in CSS pixels. */
export const STAGE_HEIGHT = 1080;

/** Panel element ids in `index.html`. */
export type PanelId = 'log' | 'env' | 'verdicts' | 'checklist' | 'seen' | 'keys' | 'pads' | 'headline' | 'report';

/**
 * Computes the uniform scale and offsets that letterbox the stage into a window.
 *
 * @param winW - window width (`innerWidth`).
 * @param winH - window height (`innerHeight`).
 * @returns `scale` (1 for a degenerate 0×0 window) and the `left` / `top` offsets (px) that center the
 *   scaled stage.
 *
 * @example
 * ```ts
 * fitStage(1920, 1080); // { scale: 1, left: 0, top: 0 }
 * fitStage(1280, 1024); // { scale: 0.666…, left: 0, top: 152 }
 * ```
 */
export function fitStage(winW: number, winH: number): { scale: number; left: number; top: number } {
  const scale = Math.min(winW / STAGE_WIDTH, winH / STAGE_HEIGHT) || 1;
  return {
    scale,
    left: Math.max(0, (winW - STAGE_WIDTH * scale) / 2),
    top: Math.max(0, (winH - STAGE_HEIGHT * scale) / 2),
  };
}

/** Owns the panel elements. */
export class ProbeUI {
  /** Panel elements by id. */
  private readonly els = new Map<PanelId, HTMLElement>();
  /** Last text written per panel (skips redundant DOM writes / layouts). */
  private readonly last = new Map<PanelId, string>();
  /** The `#stage` element that gets scaled. */
  private readonly stage: HTMLElement;

  /**
   * Looks up all panels.
   *
   * @param doc - the page document.
   * @throws Error if `#stage` or any panel element is missing (the markup is incomplete).
   */
  constructor(doc: Document) {
    const stage = doc.getElementById('stage');
    if (!stage) throw new Error('#stage missing');
    this.stage = stage;
    const ids: PanelId[] = ['log', 'env', 'verdicts', 'checklist', 'seen', 'keys', 'pads', 'headline', 'report'];
    for (const id of ids) {
      const el = doc.getElementById(id);
      if (!el) throw new Error('#' + id + ' missing');
      this.els.set(id, el);
    }
  }

  /**
   * Sets a panel's text if it changed.
   *
   * @param id - panel id.
   * @param text - new text content (newlines are kept: the panels are `<pre>` elements).
   */
  set(id: PanelId, text: string): void {
    if (this.last.get(id) === text) return;
    this.last.set(id, text);
    const el = this.els.get(id);
    if (el) el.textContent = text;
  }

  /**
   * Scales and centers the stage for the current window size.
   *
   * @param winW - window width (`innerWidth`).
   * @param winH - window height (`innerHeight`).
   */
  fit(winW: number, winH: number): void {
    const f = fitStage(winW, winH);
    this.stage.style.transform = 'scale(' + f.scale + ')';
    this.stage.style.left = f.left + 'px';
    this.stage.style.top = f.top + 'px';
  }
}
