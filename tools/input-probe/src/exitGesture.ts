/**
 * "Back pressed N times quickly" exit gesture (spec: Back ×3 within 1.5 s ⇒ exit).
 *
 * Pure module.
 *
 * @module exitGesture
 */

/** Detects N presses within a time window. */
export class MultiPressDetector {
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
