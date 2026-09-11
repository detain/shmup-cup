/**
 * DOM glue for the text panels and the stage scaling. Updated at ~10 Hz by `main.ts`; writes only when a
 * panel's text actually changed.
 *
 * @module ui
 */

/** Stage size in CSS pixels (spec: single 1920×1080 stage scaled to the window). */
export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

/** Panel element ids in `index.html`. */
export type PanelId = 'log' | 'env' | 'verdicts' | 'checklist' | 'seen' | 'keys' | 'pads' | 'headline' | 'report';

/** Computes the uniform scale and offsets that letterbox the stage into a window. */
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
  private readonly els = new Map<PanelId, HTMLElement>();
  private readonly last = new Map<PanelId, string>();
  private readonly stage: HTMLElement;

  /** Looks up all panels; throws if the markup is incomplete. */
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

  /** Sets a panel's text if it changed. */
  set(id: PanelId, text: string): void {
    if (this.last.get(id) === text) return;
    this.last.set(id, text);
    const el = this.els.get(id);
    if (el) el.textContent = text;
  }

  /** Scales and centers the stage for the current window size. */
  fit(winW: number, winH: number): void {
    const f = fitStage(winW, winH);
    this.stage.style.transform = 'scale(' + f.scale + ')';
    this.stage.style.left = f.left + 'px';
    this.stage.style.top = f.top + 'px';
  }
}
