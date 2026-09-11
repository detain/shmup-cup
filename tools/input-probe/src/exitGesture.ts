/**
 * "Back pressed N times quickly" exit gesture (spec: Back ×3 within 1.5 s ⇒ exit).
 *
 * Pure module.
 *
 * @module exitGesture
 */

/**
 * Detects N presses within a time window.
 *
 * @remarks
 * The probe registers almost every remote key and handles Back itself (a single Back must not leave the
 * app, or testers would exit by accident while tapping it). Triple-Back is the in-app way out; long-press
 * Back and Home still leave through the system. Only logical presses are fed in (`main.ts` ignores repeats
 * and bounces), so holding Back does not trigger it.
 *
 * @example
 * ```ts
 * const d = new MultiPressDetector(3, 1500);
 * d.press(0);    // false
 * d.press(400);  // false
 * d.press(900);  // true — three presses within 1.5 s
 * ```
 */
export class MultiPressDetector {
  /** Press times inside the current window, oldest first. */
  private readonly times: number[] = [];

  /**
   * @param presses - presses required (default 3).
   * @param windowMs - window from the first to the last press (default 1500 ms).
   */
  constructor(
    readonly presses = 3,
    readonly windowMs = 1500,
  ) {}

  /**
   * Records a press.
   *
   * @param t - press time in ms (monotonic clock).
   * @returns true when this press completes the gesture (the history is then cleared).
   */
  press(t: number): boolean {
    this.times.push(t);
    while (this.times.length > 0 && t - (this.times[0] as number) > this.windowMs) this.times.shift();
    if (this.times.length >= this.presses) {
      this.times.length = 0;
      return true;
    }
    return false;
  }

  /** Number of presses currently inside the window. */
  get pending(): number {
    return this.times.length;
  }

  /** Forgets all presses. */
  reset(): void {
    this.times.length = 0;
  }
}
