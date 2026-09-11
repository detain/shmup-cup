/**
 * # error-screen — boot progress bar and boot error screen
 *
 * **Responsibility.** What the player sees before the game runs: a loading bar while the atlas
 * pages load and, when boot fails, a readable error screen listing what went wrong (content
 * `ValidationIssue`s with their file/JSON paths, a missing atlas page, no WebGL). Drawn with the
 * plain Canvas 2D API on a separate **overlay canvas** laid over the game canvas — the game
 * canvas cannot be used, because a canvas that ever had a 2D context can no longer get a WebGL
 * one, and the error screen must work when WebGL itself is the problem. The overlay is removed
 * once the game runs. Nothing here depends on the atlas (it may be what failed).
 *
 * **Implements.**
 * - shmup_feat.md §17 — boot / loading screen
 * - shmup_feat.md §22 — content validated at load, problems reported with exact paths
 * - shmup_tech.md §2.5 — launch on the TV (visible feedback instead of a black screen)
 *
 * **Public API.** {@link createBootOverlay}, {@link BootOverlay}, {@link drawProgress},
 * {@link drawErrorScreen}, {@link formatIssues}, {@link Canvas2DLike},
 * {@link BOOT_SCREEN_COLORS}.
 *
 * @module
 */
import { defineModule, type ValidationIssue } from '@shmup/core';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'error-screen',
  status: 'implemented',
  specRefs: ['shmup_feat.md §17', 'shmup_feat.md §22', 'shmup_tech.md §2.5'],
});

/** Colours of the boot screens (lifted navy, never black — VA panels, shmup_feat.md §18). */
export const BOOT_SCREEN_COLORS = Object.freeze({
  /** Background. */
  background: '#10173a',
  /** Normal text and the progress bar fill. */
  text: '#e8e8e8',
  /** Error title. */
  title: '#ff5aa0',
  /** Progress bar frame / track. */
  track: '#2a3a78',
});

/** The subset of `CanvasRenderingContext2D` the boot screens use (tests pass fakes). */
export interface Canvas2DLike {
  /** Fill style for the next `fillRect` / `fillText`. */
  fillStyle: string | CanvasGradient | CanvasPattern;
  /** CSS font for `fillText`. */
  font: string;
  /** Vertical text anchor. */
  textBaseline: CanvasTextBaseline;
  /**
   * Fills a rectangle.
   *
   * @param x - Left.
   * @param y - Top.
   * @param w - Width.
   * @param h - Height.
   */
  fillRect(x: number, y: number, w: number, h: number): void;
  /**
   * Draws text.
   *
   * @param text - Text.
   * @param x - Left.
   * @param y - Baseline position (see `textBaseline`).
   */
  fillText(text: string, x: number, y: number): void;
}

/**
 * Font size used by the boot screens for a canvas height (readable at 3 m on a TV).
 *
 * @param height - Canvas height in pixels.
 * @returns Font size in pixels (≥ 12).
 */
function fontSize(height: number): number {
  return Math.max(12, Math.floor(height / 36));
}

/**
 * Draws the loading screen: title, label and a progress bar.
 *
 * @param ctx - 2D context of the overlay canvas.
 * @param width - Canvas width in pixels.
 * @param height - Canvas height in pixels.
 * @param fraction - Progress 0…1 (clamped).
 * @param label - Text under the title (e.g. `LOADING`).
 */
export function drawProgress(
  ctx: Canvas2DLike,
  width: number,
  height: number,
  fraction: number,
  label: string,
): void {
  const size = fontSize(height);
  const clamped = fraction > 0 ? (fraction < 1 ? fraction : 1) : 0;
  ctx.fillStyle = BOOT_SCREEN_COLORS.background;
  ctx.fillRect(0, 0, width, height);
  ctx.font = `${size}px monospace`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = BOOT_SCREEN_COLORS.text;
  const barWidth = Math.floor(width / 2);
  const barHeight = Math.max(4, Math.floor(size / 2));
  const barX = Math.floor((width - barWidth) / 2);
  const barY = Math.floor(height / 2);
  ctx.fillText('SHMUP CUP', barX, barY - 3 * size);
  ctx.fillText(label, barX, barY - 1.5 * size);
  ctx.fillStyle = BOOT_SCREEN_COLORS.track;
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.fillStyle = BOOT_SCREEN_COLORS.text;
  ctx.fillRect(barX, barY, Math.round(barWidth * clamped), barHeight);
}

/**
 * Draws the boot error screen: a title and one line per problem. Lines that do not fit the
 * width are cut with `…`; when the lines do not fit the height the last visible line says how
 * many more there are.
 *
 * @param ctx - 2D context of the overlay canvas.
 * @param width - Canvas width in pixels.
 * @param height - Canvas height in pixels.
 * @param title - First line (drawn in the title colour).
 * @param lines - Problem lines.
 * @returns Number of problem lines drawn in full (not counting the "more" line).
 */
export function drawErrorScreen(
  ctx: Canvas2DLike,
  width: number,
  height: number,
  title: string,
  lines: readonly string[],
): number {
  const size = fontSize(height);
  const lineHeight = Math.round(size * 1.4);
  const margin = size * 2;
  // Monospace glyphs are ~0.6 em wide; stay conservative so nothing runs off a TV edge.
  const maxChars = Math.max(8, Math.floor((width - 2 * margin) / (size * 0.62)));
  ctx.fillStyle = BOOT_SCREEN_COLORS.background;
  ctx.fillRect(0, 0, width, height);
  ctx.font = `${size}px monospace`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = BOOT_SCREEN_COLORS.title;
  ctx.fillText(clip(title, maxChars), margin, margin);
  ctx.fillStyle = BOOT_SCREEN_COLORS.text;
  const firstY = margin + lineHeight * 2;
  const room = Math.max(1, Math.floor((height - margin - firstY) / lineHeight));
  const shown = lines.length <= room ? lines.length : room - 1;
  for (let i = 0; i < shown; i++) {
    ctx.fillText(clip(lines[i] ?? '', maxChars), margin, firstY + i * lineHeight);
  }
  if (shown < lines.length) {
    ctx.fillText(`… and ${lines.length - shown} more`, margin, firstY + shown * lineHeight);
  }
  return shown;
}

/**
 * Cuts a line to `max` characters, ending it with `…` when cut.
 *
 * @param text - Line.
 * @param max - Maximum characters.
 * @returns The line, possibly shortened.
 */
function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

/**
 * Formats validation issues as error-screen lines.
 *
 * @param issues - Issues from the content loader.
 * @returns One `"<path>: <message>"` line per issue.
 */
export function formatIssues(issues: readonly ValidationIssue[]): string[] {
  return issues.map((issue) => `${issue.path}: ${issue.message}`);
}

/** The overlay canvas shown during boot. */
export interface BootOverlay {
  /** The overlay canvas element. */
  readonly canvas: HTMLCanvasElement;
  /**
   * Shows the loading screen.
   *
   * @param fraction - Progress 0…1.
   * @param label - Label above the bar.
   */
  showProgress(fraction: number, label: string): void;
  /**
   * Shows the error screen (stays until the page reloads).
   *
   * @param title - Title line.
   * @param lines - Problem lines.
   */
  showError(title: string, lines: readonly string[]): void;
  /** Removes the overlay from the document (boot succeeded). Idempotent. */
  remove(): void;
}

/**
 * Creates the overlay canvas next to the game canvas, covering the window.
 *
 * @remarks
 * The overlay is inserted right after the game canvas in its parent, positioned `fixed` over
 * the whole viewport and sized to the window in device-independent pixels. Returns `null`
 * (boot runs without progress / error screens) when the game canvas is not in a document or
 * 2D canvases are unavailable — for example in unit tests with a fake canvas.
 *
 * @param gameCanvas - The game's canvas (in the document).
 * @returns The overlay, or `null`.
 */
export function createBootOverlay(gameCanvas: HTMLCanvasElement): BootOverlay | null {
  const doc = gameCanvas.ownerDocument as Document | null | undefined;
  const parent = gameCanvas.parentNode as Node | null | undefined;
  if (doc === null || doc === undefined || parent === null || parent === undefined) return null;
  const view = doc.defaultView;
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  canvas.setAttribute('data-shmup-overlay', 'boot');
  canvas.style.position = 'fixed';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = '1';
  parent.insertBefore(canvas, gameCanvas.nextSibling);
  let attached = true;

  /** Matches the canvas buffer to the window size. */
  const fit = (): void => {
    const width = Math.max(1, Math.floor(view?.innerWidth ?? 640));
    const height = Math.max(1, Math.floor(view?.innerHeight ?? 360));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  };

  return {
    canvas,
    showProgress(fraction, label) {
      fit();
      drawProgress(ctx, canvas.width, canvas.height, fraction, label);
    },
    showError(title, lines) {
      fit();
      drawErrorScreen(ctx, canvas.width, canvas.height, title, lines);
    },
    remove() {
      if (!attached) return;
      attached = false;
      if (canvas.parentNode !== null) canvas.parentNode.removeChild(canvas);
    },
  };
}
