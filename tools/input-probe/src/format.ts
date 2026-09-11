/**
 * Small, pure number/text formatting helpers shared by the UI, event log and report.
 *
 * The panels are monospace `<pre>` blocks, so alignment is done with plain space padding.
 *
 * @module format
 */

/**
 * Formats a millisecond value.
 *
 * @param v - value in ms.
 * @param digits - decimals (default 1).
 * @returns e.g. `"16.7 ms"`, or `"—"` for null / undefined / non-finite values.
 *
 * @example
 * ```ts
 * fmtMs(16.666);    // "16.7 ms"
 * fmtMs(3.14159, 2); // "3.14 ms"
 * fmtMs(null);      // "—"
 * ```
 */
export function fmtMs(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(digits) + ' ms';
}

/**
 * Formats a frequency with one decimal.
 *
 * @param v - value in Hz.
 * @returns e.g. `"60.0 Hz"`, or `"—"` for null / undefined / non-finite values.
 */
export function fmtHz(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(1) + ' Hz';
}

/**
 * Left-pads `s` with spaces to `width` characters.
 *
 * @param s - text.
 * @param width - minimum width; longer text is returned unchanged.
 * @returns the padded text.
 */
export function padLeft(s: string, width: number): string {
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}

/**
 * Right-pads `s` with `fill` (default space) to `width` characters.
 *
 * @param s - text.
 * @param width - minimum width; longer text is returned unchanged.
 * @param fill - single padding character (default space; the verdict labels use `"."`).
 * @returns the padded text.
 *
 * @example
 * ```ts
 * padRight('Frames ', 15, '.'); // "Frames ........"
 * ```
 */
export function padRight(s: string, width: number, fill = ' '): string {
  return s.length >= width ? s : s + fill.repeat(width - s.length);
}

/**
 * Truncates `s` to at most `max` characters, adding an ellipsis when cut.
 *
 * @param s - text.
 * @param max - maximum length (the ellipsis counts as one character).
 * @returns `s` unchanged when short enough, otherwise its first `max - 1` characters plus `…`.
 *
 * @example
 * ```ts
 * truncate('ColorF2Yellow', 8); // "ColorF2…"
 * ```
 */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return max <= 1 ? s.slice(0, max) : s.slice(0, max - 1) + '…';
}

/**
 * Rounds to one decimal (for compact log / report numbers).
 *
 * @param v - value.
 * @returns the rounded value; null / undefined / non-finite values become null.
 *
 * @example
 * ```ts
 * round1(16.66); // 16.7
 * round1(NaN);   // null
 * ```
 */
export function round1(v: number | null | undefined): number | null {
  return v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;
}
