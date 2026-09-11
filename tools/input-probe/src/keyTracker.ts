/**
 * Key-state tracking and behavior verdicts for the input probe.
 *
 * Pure module: it only receives plain inputs (key code, `repeat` flag, timestamp in ms) and never
 * touches the DOM, so every rule here is unit-testable in Node.
 *
 * Two views of "held" are maintained per key:
 * - **raw** — between a `keydown` and the next `keyup` (repeats ignored);
 * - **logical** — raw holds merged across *bounces*: a `keyup` followed by a `keydown` of the same key
 *   within {@link KeyTrackerOptions.bounceWindowMs} (a "fake keyup/keydown pair") does not end the hold.
 *   Because a release can only be confirmed once the bounce window has passed, logical releases are
 *   finalized lazily by {@link KeyTracker.tick} (or by the next key event).
 *
 * Verdicts (diagonals, OK-while-arrow-held) are computed on the logical view; the ship lanes use the raw
 * view (lane A), a time-debounced view (lane B) and naive per-event counts (lane C).
 *
 * @module keyTracker
 */

import { ARROW_CODES, KeyCode, isArrow } from './keys';

/** Classification of a `keydown` event. */
export type KeyDownKind =
  /** A new (logical) press. */
  | 'press'
  /** Auto-repeat with the `repeat` flag set, no `keyup` in between ("clean"). */
  | 'repeat'
  /** Another `keydown` for a key already down, but without the `repeat` flag. */
  | 'repeat-noflag'
  /** Re-press within the bounce window after a `keyup` (a fake keyup/keydown pair). */
  | 'bounce';

/** Tunable thresholds (all in milliseconds). */
export interface KeyTrackerOptions {
  /** A `keyup`→`keydown` gap of the same key shorter than this is a bounce (fake pair). Default 60. */
  bounceWindowMs: number;
  /** Second arrow "replaces" the first if the first is released within this of the second's press. Default 60. */
  replaceWindowMs: number;
  /** An arrow counts as "dropped" by OK if it is released within this of the OK press. Default 60. */
  chordWindowMs: number;
  /**
   * "Replaced" (diagonal) and "dropped" (OK chord) verdicts only count when the first arrow had already been held
   * this long when the second key was pressed — filters out quick sequential taps. Default 200.
   */
  minHoldMs: number;
  /** Lane B treats a key as still held for this long after its `keyup` (~3 frames). Default 50. */
  debounceMs: number;
  /**
   * {@link KeyTracker.tick} evaluates time-outs this far behind the clock it is given, so that events whose
   * `timeStamp` precedes the frame time (dispatch delay) are still classified correctly. Default 40.
   */
  lateGraceMs: number;
}

/** Default thresholds from the spec. */
export const DEFAULT_KEY_TRACKER_OPTIONS: Readonly<KeyTrackerOptions> = {
  bounceWindowMs: 60,
  replaceWindowMs: 60,
  chordWindowMs: 60,
  minHoldMs: 200,
  debounceMs: 50,
  lateGraceMs: 40,
};

/** Dominant key-repeat style observed while holding keys. */
export type RepeatStyle = 'none' | 'clean' | 'noflag' | 'fakepairs';

/** Diagonal (two arrows at once) verdict. */
export type DiagonalVerdict = 'untested' | 'yes' | 'no';

/** OK-while-arrow-held verdict: arrow kept, kept after a brief release blip, or dropped. */
export type ChordVerdict = 'untested' | 'kept' | 'blip' | 'dropped';

/** Per-key counters for the "seen keys" table. */
export interface SeenKey {
  code: number;
  downs: number;
  ups: number;
  /** `keydown`s that were not new presses (repeats, flagless repeats, bounces). */
  repeats: number;
}

/** Snapshot of all key statistics and verdicts. */
export interface KeyStats {
  diagonal: {
    verdict: DiagonalVerdict;
    /** Overlaps of two arrows lasting at least the replace window. */
    yes: number;
    /** Times the second arrow replaced the first. */
    replaced: number;
    /** Conclusive observations (yes + replaced). */
    attempts: number;
  };
  chord: {
    verdict: ChordVerdict;
    kept: number;
    blip: number;
    dropped: number;
    /** Conclusive observations (kept + blip + dropped). */
    attempts: number;
  };
  repeat: {
    style: RepeatStyle;
    clean: number;
    noFlag: number;
    fakePairs: number;
    /** Average time from press to first repeat event (ms), or null if none seen. */
    delayAvgMs: number | null;
    delaySamples: number;
    /** Average time between repeat events (ms), or null if none seen. */
    intervalAvgMs: number | null;
    /** 1000 / interval, or null. */
    intervalHz: number | null;
    intervalSamples: number;
  };
  bounce: {
    count: number;
    minGapMs: number | null;
    avgGapMs: number | null;
  };
  /** Most raw keys down at the same time. */
  maxSimultaneous: number;
  /** Longest logical hold (including a hold still in progress). */
  longestHoldMs: number;
  /** Key code of the longest hold, or null. */
  longestHoldCode: number | null;
}

interface KeyState {
  code: number;
  rawDown: boolean;
  rawDownAt: number;
  rawUpAt: number;
  held: boolean;
  /** Start of the current logical hold (never moved by {@link KeyTracker.resetStats}). */
  pressAt: number;
  /** Start used for the "longest hold" statistic: `pressAt`, or the reset time for holds spanning a reset. */
  holdStatFrom: number;
  /** Raw keyup time awaiting confirmation (NaN when none). */
  pendingUpAt: number;
  gotRepeat: boolean;
  lastRepeatAt: number;
  naiveDowns: number;
  downs: number;
  ups: number;
  repeats: number;
}

interface Overlap {
  /** Arrow that was held first. */
  a: number;
  /** Arrow pressed second. */
  b: number;
  start: number;
  /** How long `a` had been held when `b` was pressed. */
  aHoldMs: number;
}

interface Chord {
  arrow: number;
  t: number;
  /** How long the arrow had been held when OK was pressed. */
  arrowHoldMs: number;
}

/**
 * Tracks key state from plain key events and derives the probe's verdicts and statistics.
 *
 * Timestamps must come from one monotonic clock (e.g. `event.timeStamp` / `performance.now()`).
 */
export class KeyTracker {
  /** Effective options. */
  readonly opts: Readonly<KeyTrackerOptions>;

  private readonly byCode = new Map<number, KeyState>();
  private readonly list: KeyState[] = [];
  private readonly overlaps: Overlap[] = [];
  private readonly chords: Chord[] = [];
  private clock = -Infinity;
  private rawDownCount = 0;

  // --- resettable hold/repeat stats ---
  private repeatClean = 0;
  private repeatNoFlag = 0;
  private fakePairs = 0;
  private delaySum = 0;
  private delayCount = 0;
  private intervalSum = 0;
  private intervalCount = 0;
  private bounceCount = 0;
  private bounceGapSum = 0;
  private bounceGapMin = Infinity;
  private maxSimultaneous = 0;
  private longestHoldMs = 0;
  private longestHoldCode: number | null = null;

  // --- verdict counters (not reset) ---
  private diagYes = 0;
  private diagReplaced = 0;
  private chordKept = 0;
  private chordBlip = 0;
  private chordDropped = 0;

  /** @param options - overrides for {@link DEFAULT_KEY_TRACKER_OPTIONS}. */
  constructor(options: Partial<KeyTrackerOptions> = {}) {
    this.opts = { ...DEFAULT_KEY_TRACKER_OPTIONS, ...options };
  }

  /**
   * Feeds a `keydown` event.
   *
   * @param code - DOM `keyCode`.
   * @param repeat - the event's `repeat` flag.
   * @param t - event time in ms.
   * @returns how the event was classified.
   */
  keyDown(code: number, repeat: boolean, t: number): KeyDownKind {
    this.advance(t);
    const s = this.state(code);
    s.downs++;
    s.naiveDowns++;
    let kind: KeyDownKind;
    if (s.rawDown) {
      kind = repeat ? 'repeat' : 'repeat-noflag';
      if (repeat) this.repeatClean++;
      else this.repeatNoFlag++;
      this.recordRepeat(s, t);
    } else if (hasPending(s)) {
      kind = 'bounce';
      const gap = t - s.pendingUpAt;
      this.fakePairs++;
      this.bounceCount++;
      this.bounceGapSum += gap;
      if (gap < this.bounceGapMin) this.bounceGapMin = gap;
      this.onBounce(s);
      s.pendingUpAt = NaN;
      this.setRawDown(s, t);
      this.recordRepeat(s, t);
    } else {
      kind = 'press';
      this.setRawDown(s, t);
      s.held = true;
      s.pressAt = t;
      s.holdStatFrom = t;
      s.gotRepeat = false;
      this.onLogicalPress(s, t);
    }
    if (kind !== 'press') s.repeats++;
    return kind;
  }

  /**
   * Feeds a `keyup` event.
   *
   * @returns how long the key had been raw-held (ms), or -1 for a stray `keyup` without a `keydown`.
   */
  keyUp(code: number, t: number): number {
    this.advance(t);
    const s = this.state(code);
    s.ups++;
    if (!s.rawDown) return -1;
    s.rawDown = false;
    this.rawDownCount--;
    s.rawUpAt = t;
    s.pendingUpAt = t;
    return t - s.rawDownAt;
  }

  /**
   * Releases every key immediately (e.g. on window `blur`, when `keyup`s may never arrive).
   * Open diagonal / OK-chord observations are discarded rather than judged.
   */
  releaseAll(t: number): void {
    this.advance(t);
    this.overlaps.length = 0;
    this.chords.length = 0;
    for (let i = 0; i < this.list.length; i++) {
      const s = this.list[i] as KeyState;
      if (s.rawDown) {
        s.rawDown = false;
        s.rawUpAt = t;
        if (!hasPending(s)) s.pendingUpAt = t;
      }
      if (s.held) this.finalizeRelease(s);
      s.naiveDowns = 0;
    }
    this.rawDownCount = 0;
  }

  /**
   * Advances time-based decisions (confirming releases, judging overlaps/chords) to `now - lateGraceMs`.
   * Call once per frame. Allocation-free.
   */
  tick(now: number): void {
    this.advance(now - this.opts.lateGraceMs);
  }

  /** True while the key is raw-held (between `keydown` and `keyup`). Lane A. */
  isRawHeld(code: number): boolean {
    const s = this.byCode.get(code);
    return s !== undefined && s.rawDown;
  }

  /** True while the key is held or was released less than `debounceMs` before `now`. Lane B. */
  isDebouncedHeld(code: number, now: number): boolean {
    const s = this.byCode.get(code);
    if (s === undefined) return false;
    return s.rawDown || now - s.rawUpAt < this.opts.debounceMs;
  }

  /** True while the key is held in the bounce-merged (logical) view. */
  isLogicallyHeld(code: number): boolean {
    const s = this.byCode.get(code);
    return s !== undefined && s.held;
  }

  /**
   * Returns and clears the number of `keydown` events (presses, repeats and bounces) of a key since the
   * previous call. Lane C ("naive" menu-style movement).
   */
  takeNaiveDowns(code: number): number {
    const s = this.byCode.get(code);
    if (s === undefined) return 0;
    const n = s.naiveDowns;
    s.naiveDowns = 0;
    return n;
  }

  /** Number of `keydown` events seen for a key (0 if never seen). */
  downsOf(code: number): number {
    const s = this.byCode.get(code);
    return s === undefined ? 0 : s.downs;
  }

  /** Number of keys currently raw-held. */
  get heldCount(): number {
    return this.rawDownCount;
  }

  /** Per-key counters in first-seen order. */
  seenKeys(): SeenKey[] {
    const out: SeenKey[] = [];
    for (let i = 0; i < this.list.length; i++) {
      const s = this.list[i] as KeyState;
      out.push({ code: s.code, downs: s.downs, ups: s.ups, repeats: s.repeats });
    }
    return out;
  }

  /**
   * Resets the hold/repeat statistics (repeat style & timing, bounces, max simultaneous, longest hold).
   * Key states, the seen-keys table and the diagonal / OK verdicts are kept.
   */
  resetStats(): void {
    this.repeatClean = 0;
    this.repeatNoFlag = 0;
    this.fakePairs = 0;
    this.delaySum = 0;
    this.delayCount = 0;
    this.intervalSum = 0;
    this.intervalCount = 0;
    this.bounceCount = 0;
    this.bounceGapSum = 0;
    this.bounceGapMin = Infinity;
    this.maxSimultaneous = this.rawDownCount;
    this.longestHoldMs = 0;
    this.longestHoldCode = null;
    for (let i = 0; i < this.list.length; i++) {
      const s = this.list[i] as KeyState;
      // Ongoing holds only count their post-reset duration towards "longest hold". Their true press time is
      // kept: it feeds the repeat delay and the verdicts' min-hold filters, which must not be skewed by a reset.
      if (s.held) s.holdStatFrom = this.clock;
    }
  }

  /**
   * Builds a snapshot of all statistics and verdicts.
   *
   * @param now - current time; used to include holds still in progress in "longest hold".
   */
  getStats(now: number): KeyStats {
    let longest = this.longestHoldMs;
    let longestCode = this.longestHoldCode;
    for (let i = 0; i < this.list.length; i++) {
      const s = this.list[i] as KeyState;
      if (!s.held) continue;
      // A hold whose keyup is only awaiting bounce confirmation ended at that keyup, not at `now`.
      const end = hasPending(s) ? s.pendingUpAt : now;
      if (end - s.holdStatFrom > longest) {
        longest = end - s.holdStatFrom;
        longestCode = s.code;
      }
    }
    return {
      diagonal: {
        verdict: this.diagYes > 0 ? 'yes' : this.diagReplaced > 0 ? 'no' : 'untested',
        yes: this.diagYes,
        replaced: this.diagReplaced,
        attempts: this.diagYes + this.diagReplaced,
      },
      chord: {
        verdict:
          this.chordKept > 0 ? 'kept' : this.chordBlip > 0 ? 'blip' : this.chordDropped > 0 ? 'dropped' : 'untested',
        kept: this.chordKept,
        blip: this.chordBlip,
        dropped: this.chordDropped,
        attempts: this.chordKept + this.chordBlip + this.chordDropped,
      },
      repeat: {
        style: dominantRepeatStyle(this.repeatClean, this.repeatNoFlag, this.fakePairs),
        clean: this.repeatClean,
        noFlag: this.repeatNoFlag,
        fakePairs: this.fakePairs,
        delayAvgMs: this.delayCount > 0 ? this.delaySum / this.delayCount : null,
        delaySamples: this.delayCount,
        intervalAvgMs: this.intervalCount > 0 ? this.intervalSum / this.intervalCount : null,
        intervalHz:
          this.intervalCount > 0 && this.intervalSum > 0 ? (1000 * this.intervalCount) / this.intervalSum : null,
        intervalSamples: this.intervalCount,
      },
      bounce: {
        count: this.bounceCount,
        minGapMs: this.bounceCount > 0 ? this.bounceGapMin : null,
        avgGapMs: this.bounceCount > 0 ? this.bounceGapSum / this.bounceCount : null,
      },
      maxSimultaneous: this.maxSimultaneous,
      longestHoldMs: longest,
      longestHoldCode: longestCode,
    };
  }

  // ------------------------------------------------------------------ internals

  private state(code: number): KeyState {
    let s = this.byCode.get(code);
    if (s === undefined) {
      s = {
        code,
        rawDown: false,
        rawDownAt: 0,
        rawUpAt: -Infinity,
        held: false,
        pressAt: 0,
        holdStatFrom: 0,
        pendingUpAt: NaN,
        gotRepeat: false,
        lastRepeatAt: 0,
        naiveDowns: 0,
        downs: 0,
        ups: 0,
        repeats: 0,
      };
      this.byCode.set(code, s);
      this.list.push(s);
    }
    return s;
  }

  private setRawDown(s: KeyState, t: number): void {
    s.rawDown = true;
    s.rawDownAt = t;
    this.rawDownCount++;
    if (this.rawDownCount > this.maxSimultaneous) this.maxSimultaneous = this.rawDownCount;
  }

  private recordRepeat(s: KeyState, t: number): void {
    if (!s.held) return;
    if (!s.gotRepeat) {
      s.gotRepeat = true;
      this.delaySum += t - s.pressAt;
      this.delayCount++;
    } else {
      this.intervalSum += t - s.lastRepeatAt;
      this.intervalCount++;
    }
    s.lastRepeatAt = t;
  }

  /** Moves the clock forward and resolves everything that timed out. */
  private advance(t: number): void {
    if (t > this.clock) this.clock = t;
    const now = this.clock;
    const bw = this.opts.bounceWindowMs;
    for (let i = 0; i < this.list.length; i++) {
      const s = this.list[i] as KeyState;
      if (hasPending(s) && now - s.pendingUpAt >= bw) this.finalizeRelease(s);
    }
    this.resolveOverlaps(now);
    this.resolveChords(now);
  }

  /** Confirms a pending release: the logical hold ends at the raw `keyup` time. */
  private finalizeRelease(s: KeyState): void {
    const upAt = hasPending(s) ? s.pendingUpAt : this.clock;
    s.pendingUpAt = NaN;
    if (!s.held) return;
    s.held = false;
    const hold = upAt - s.holdStatFrom;
    if (hold > this.longestHoldMs) {
      this.longestHoldMs = hold;
      this.longestHoldCode = s.code;
    }
    // Diagonal overlaps involving this key end now.
    for (let i = this.overlaps.length - 1; i >= 0; i--) {
      const ov = this.overlaps[i] as Overlap;
      if (ov.a !== s.code && ov.b !== s.code) continue;
      const overlapMs = upAt - ov.start;
      if (overlapMs >= this.opts.replaceWindowMs) this.diagYes++;
      else if (ov.a === s.code && ov.aHoldMs >= this.opts.minHoldMs) this.diagReplaced++;
      // else: the second arrow was only tapped, or the first was only tapped — inconclusive.
      removeAt(this.overlaps, i);
    }
    // OK chords on this arrow end now.
    const cw = this.opts.chordWindowMs;
    for (let i = this.chords.length - 1; i >= 0; i--) {
      const ch = this.chords[i] as Chord;
      if (ch.arrow !== s.code) continue;
      if (upAt < ch.t - cw) {
        // Arrow was already released well before OK: not a chord attempt after all.
      } else if (upAt <= ch.t + cw) {
        if (ch.arrowHoldMs >= this.opts.minHoldMs) this.chordDropped++;
        // else: arrow tapped just before OK — sequential taps, inconclusive.
      } else this.chordKept++;
      removeAt(this.chords, i);
    }
  }

  /** A key was re-pressed inside the bounce window (fake keyup/keydown pair). */
  private onBounce(s: KeyState): void {
    const cw = this.opts.chordWindowMs;
    for (let i = this.chords.length - 1; i >= 0; i--) {
      const ch = this.chords[i] as Chord;
      if (ch.arrow !== s.code) continue;
      if (Math.abs(s.pendingUpAt - ch.t) <= cw) {
        this.chordBlip++;
        removeAt(this.chords, i);
      }
    }
  }

  /** A new logical press: open diagonal / OK-chord observations. */
  private onLogicalPress(s: KeyState, t: number): void {
    if (isArrow(s.code)) {
      for (let i = 0; i < ARROW_CODES.length; i++) {
        const other = this.byCode.get(ARROW_CODES[i] as number);
        if (other === undefined || other === s || !other.held) continue;
        this.overlaps.push({ a: other.code, b: s.code, start: t, aHoldMs: t - other.pressAt });
      }
    } else if (s.code === KeyCode.Enter) {
      for (let i = 0; i < ARROW_CODES.length; i++) {
        const arrow = this.byCode.get(ARROW_CODES[i] as number);
        if (arrow === undefined || !arrow.held) continue;
        this.chords.push({ arrow: arrow.code, t, arrowHoldMs: t - arrow.pressAt });
      }
    }
  }

  private resolveOverlaps(now: number): void {
    const w = this.opts.replaceWindowMs;
    for (let i = this.overlaps.length - 1; i >= 0; i--) {
      const ov = this.overlaps[i] as Overlap;
      const end = Math.min(this.heldUntil(ov.a, now), this.heldUntil(ov.b, now));
      if (end - ov.start >= w) {
        this.diagYes++;
        removeAt(this.overlaps, i);
      }
    }
  }

  private resolveChords(now: number): void {
    const cw = this.opts.chordWindowMs;
    for (let i = this.chords.length - 1; i >= 0; i--) {
      const ch = this.chords[i] as Chord;
      if (now - ch.t < cw) continue;
      const s = this.byCode.get(ch.arrow);
      if (s === undefined || !s.held) {
        removeAt(this.chords, i);
        continue;
      }
      const pendingInWindow = hasPending(s) && s.pendingUpAt <= ch.t + cw;
      if (!pendingInWindow) {
        this.chordKept++;
        removeAt(this.chords, i);
      }
    }
  }

  /** End of a key's logical hold as known so far: its pending keyup time, or `now` while still down. */
  private heldUntil(code: number, now: number): number {
    const s = this.byCode.get(code);
    if (s === undefined || !s.held) return -Infinity;
    return hasPending(s) ? s.pendingUpAt : now;
  }
}

/** Picks the most frequent repeat style (ties: fake pairs > flagless > clean). */
export function dominantRepeatStyle(clean: number, noFlag: number, fakePairs: number): RepeatStyle {
  if (clean === 0 && noFlag === 0 && fakePairs === 0) return 'none';
  if (fakePairs >= noFlag && fakePairs >= clean) return 'fakepairs';
  if (noFlag >= clean) return 'noflag';
  return 'clean';
}

/** True when a key has a raw `keyup` awaiting bounce confirmation. */
function hasPending(s: KeyState): boolean {
  return !Number.isNaN(s.pendingUpAt);
}

/** Removes an element by swapping in the last one (order is not preserved). */
function removeAt<T>(arr: T[], i: number): void {
  const last = arr.length - 1;
  if (i !== last) arr[i] = arr[last] as T;
  arr.length = last;
}
