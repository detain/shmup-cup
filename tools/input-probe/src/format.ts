/**
 * Small, pure number/text formatting helpers shared by the UI, event log and report.
 *
 * @module format
 */

/** Formats a millisecond value with one decimal, or `—` for null/NaN. */
export function fmtMs(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(digits) + ' ms';
}

/** Formats a frequency with one decimal, or `—`. */
export function fmtHz(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(1) + ' Hz';
}

/** Left-pads `s` with spaces to `width` characters. */
export function padLeft(s: string, width: number): string {
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}

/** Right-pads `s` with `fill` (default space) to `width` characters. */
export function padRight(s: string, width: number, fill = ' '): string {
  return s.length >= width ? s : s + fill.repeat(width - s.length);
}

/** Truncates `s` to at most `max` characters, adding an ellipsis when cut. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return max <= 1 ? s.slice(0, max) : s.slice(0, max - 1) + '…';
}

/** Rounds to one decimal; null / non-finite values become null. */
export function round1(v: number | null | undefined): number | null {
  return v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;
}
