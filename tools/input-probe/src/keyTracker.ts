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
 * Hot-path methods ({@link KeyTracker.keyDown}, {@link KeyTracker.keyUp}, {@link KeyTracker.tick} and the
 * `is*Held` queries) do not allocate once every key has been seen; only opening a diagonal / OK-chord
 * observation pushes a small record. {@link KeyTracker.getStats} and {@link KeyTracker.seenKeys} allocate and
 * are meant for the ~10 Hz UI refresh.
 *
 * @example
 * ```ts
 * const tr = new KeyTracker();
 * tr.keyDown(KeyCode.Right, false, 1000); // 'press'
 * tr.keyDown(KeyCode.Right, true, 1500);  // 'repeat'  (clean auto-repeat)
 * tr.keyUp(KeyCode.Right, 1520);          // 520 (raw hold, ms)
 * tr.keyDown(KeyCode.Right, false, 1540); // 'bounce'  (fake keyup/keydown pair, gap 20 ms)
 * tr.keyUp(KeyCode.Right, 3000);
 * tr.tick(3200);                          // confirms the release (bounce window passed)
 * tr.getStats(3200).longestHoldMs;        // 2000 — one logical hold from 1000 to 3000
 * ```
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

/**
 * Default thresholds from the spec (60 ms windows, 200 ms minimum hold, 50 ms debounce, 40 ms late grace).
 *
 * @remarks
 * These are the single source of truth for the verdict rules documented in `tools/input-probe/README.md`
 * and `docs/dev/input-probe.md`; change them here and update both documents.
 */
export const DEFAULT_KEY_TRACKER_OPTIONS: Readonly<KeyTrackerOptions> = {
  bounceWindowMs: 60,
  replaceWindowMs: 60,
  chordWindowMs: 60,
  minHoldMs: 200,
  debounceMs: 50,
  lateGraceMs: 40,
};

/**
 * Dominant key-repeat style observed while holding keys.
 *
 * - `none` — no repeat events seen yet;
 * - `clean` — `keydown` with `repeat=true`, no `keyup` in between;
 * - `noflag` — further `keydown`s while the key is down, but `repeat=false`;
 * - `fakepairs` — the key is "released" and "re-pressed" (`keyup` + `keydown` within the bounce window).
 */
export type RepeatStyle = 'none' | 'clean' | 'noflag' | 'fakepairs';

/**
 * Diagonal (two arrows at once) verdict: `yes` once any two arrows were logically held together for at least
 * the replace window, `no` when only "second arrow replaced the first" was observed, `untested` otherwise.
 */
export type DiagonalVerdict = 'untested' | 'yes' | 'no';

/**
 * OK-while-arrow-held verdict: arrow `kept`, kept after a brief release `blip` (fake pair), or `dropped`.
 * The best observed outcome wins (kept > blip > dropped).
 */
export type ChordVerdict = 'untested' | 'kept' | 'blip' | 'dropped';

/** Per-key counters for the "seen keys" table. */
export interface SeenKey {
  /** DOM `keyCode`. */
  code: number;
  /** All `keydown` events (presses, repeats and bounces). */
  downs: number;
  /** All `keyup` events, including stray ones. */
  ups: number;
  /** `keydown`s that were not new presses (repeats, flagless repeats, bounces). */
  repeats: number;
}

/** Snapshot of all key statistics and verdicts (see {@link KeyTracker.getStats}). */
export interface KeyStats {
  /** Question 1 — can two arrows be held at once? */
  diagonal: {
    /** Overall verdict. */
    verdict: DiagonalVerdict;
    /** Overlaps of two arrows lasting at least the replace window. */
    yes: number;
    /** Times the second arrow replaced the first. */
    replaced: number;
    /** Conclusive observations (yes + replaced). */
    attempts: number;
  };
  /** Question 2 — does an arrow stay held when OK is pressed? */
  chord: {
    /** Overall verdict. */
    verdict: ChordVerdict;
    /** The arrow was still held one chord window after OK. */
    kept: number;
    /** The arrow got a keyup within the chord window of OK but was re-pressed within the bounce window. */
    blip: number;
    /** The arrow was released within the chord window of OK (and had been held ≥ `minHoldMs`). */
    dropped: number;
    /** Conclusive observations (kept + blip + dropped). */
    attempts: number;
  };
  /** Question 3 — how does holding a key repeat? Reset by {@link KeyTracker.resetStats}. */
  repeat: {
    /** Dominant style (see {@link dominantRepeatStyle}). */
    style: RepeatStyle;
    /** `keydown` events with the `repeat` flag while the key was raw-held. */
    clean: number;
    /** `keydown` events without the `repeat` flag while the key was raw-held. */
    noFlag: number;
    /** Fake keyup/keydown pairs (same as {@link KeyStats.bounce} `count`). */
    fakePairs: number;
    /** Average time from press to first repeat event (ms), or null if none seen. */
    delayAvgMs: number | null;
    /** Number of holds that contributed a repeat-delay sample. */
    delaySamples: number;
    /** Average time between repeat events (ms), or null if none seen. */
    intervalAvgMs: number | null;
    /** 1000 / interval, or null. */
    intervalHz: number | null;
    /** Number of repeat-interval samples. */
    intervalSamples: number;
  };
  /** Fake keyup/keydown pairs ("bounces"). Reset by {@link KeyTracker.resetStats}. */
  bounce: {
    /** Number of bounces. */
    count: number;
    /** Shortest `keyup` → `keydown` gap (ms), or null when none. */
    minGapMs: number | null;
    /** Average `keyup` → `keydown` gap (ms), or null when none. */
    avgGapMs: number | null;
  };
  /** Most raw keys down at the same time. */
  maxSimultaneous: number;
  /** Longest logical hold (including a hold still in progress). */
  longestHoldMs: number;
  /** Key code of the longest hold, or null. */
  longestHoldCode: number | null;
}

/** Internal per-key state (one object per key code, created on first sight and reused forever). */
interface KeyState {
  /** DOM `keyCode`. */
  code: number;
  /** Raw view: between `keydown` and `keyup`. */
  rawDown: boolean;
  /** Time of the last raw `keydown` that started a raw hold. */
  rawDownAt: number;
  /** Time of the last raw `keyup` (`-Infinity` before the first one) — drives lane B's debounce. */
  rawUpAt: number;
  /** Logical (bounce-merged) view. */
  held: boolean;
  /** Start of the current logical hold (never moved by {@link KeyTracker.resetStats}). */
  pressAt: number;
  /** Start used for the "longest hold" statistic: `pressAt`, or the reset time for holds spanning a reset. */
  holdStatFrom: number;
  /** Raw keyup time awaiting confirmation (NaN when none). */
  pendingUpAt: number;
  /** Whether the current logical hold has produced a repeat yet (first repeat = delay sample). */
  gotRepeat: boolean;
  /** Time of the previous repeat event of the current hold (interval samples). */
  lastRepeatAt: number;
  /** `keydown`s not yet consumed by {@link KeyTracker.takeNaiveDowns} (lane C). */
  naiveDowns: number;
  /** See {@link SeenKey.downs}. */
  downs: number;
  /** See {@link SeenKey.ups}. */
  ups: number;
  /** See {@link SeenKey.repeats}. */
  repeats: number;
}

/** An open diagonal observation: arrow `b` was pressed while arrow `a` was logically held. */
interface Overlap {
  /** Arrow that was held first. */
  a: number;
  /** Arrow pressed second. */
  b: number;
  /** Time `b` was pressed (start of the overlap). */
  start: number;
  /** How long `a` had been held when `b` was pressed. */
  aHoldMs: number;
}

/** An open OK-chord observation: OK was pressed while `arrow` was logically held. */
interface Chord {
  /** Key code of the held arrow. */
  arrow: number;
  /** Time OK was pressed. */
  t: number;
  /** How long the arrow had been held when OK was pressed. */
  arrowHoldMs: number;
}

/**
 * Tracks key state from plain key events and derives the probe's verdicts and statistics.
 *
 * Timestamps must come from one monotonic clock (e.g. `event.timeStamp` / `performance.now()`).
 *
 * @remarks
 * The internal clock only moves forward: an event whose timestamp is older than the latest time seen is
 * processed at its own time for durations, but time-outs are never "un-resolved". Call {@link KeyTracker.tick}
 * once per frame so releases and verdicts are finalized even when no further key events arrive.
 *
 * @example
 * ```ts
 * // Hold → for 1 s, then press ↑ as well for 300 ms: diagonals work.
 * const tr = new KeyTracker();
 * tr.keyDown(KeyCode.Right, false, 0);
 * tr.keyDown(KeyCode.Up, false, 1000);
 * tr.keyUp(KeyCode.Up, 1300);
 * tr.keyUp(KeyCode.Right, 1400);
 * tr.tick(2000);
 * tr.getStats(2000).diagonal.verdict; // 'yes'
 * ```
 */
export class KeyTracker {
  /** Effective options. */
  readonly opts: Readonly<KeyTrackerOptions>;

  /** Key states by key code. */
  private readonly byCode = new Map<number, KeyState>();
  /** The same states in first-seen order (index loops avoid iterator allocation). */
  private readonly list: KeyState[] = [];
  /** Open diagonal observations, resolved by time-out or release. */
  private readonly overlaps: Overlap[] = [];
  /** Open OK-chord observations, resolved by time-out, bounce or release. */
  private readonly chords: Chord[] = [];
  /** Latest time seen (monotonic; starts at `-Infinity`). */
  private clock = -Infinity;
  /** Number of keys currently raw-held. */
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
   * @returns how the event was classified:
   *   `'repeat'` / `'repeat-noflag'` while the key is raw-held (by the `repeat` flag),
   *   `'bounce'` when it follows this key's `keyup` within the bounce window,
   *   `'press'` otherwise (a new logical hold that may open diagonal / OK-chord observations).
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
   * @param code - DOM `keyCode`.
   * @param t - event time in ms.
   * @returns how long the key had been raw-held (ms), or -1 for a stray `keyup` without a `keydown`.
   *
   * @remarks
   * The raw hold ends immediately; the logical hold only ends once the bounce window has passed without a
   * re-press (confirmed by a later event or {@link KeyTracker.tick}).
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
   *
   * @param t - current time in ms; becomes the release time of every held key.
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
   *
   * @param now - current frame time in ms (same clock as the event timestamps).
   *
   * @remarks
   * The {@link KeyTrackerOptions.lateGraceMs} lag exists because a key event dispatched during this frame can
   * carry an `event.timeStamp` slightly *earlier* than the rAF time; resolving time-outs exactly at `now` would
   * judge a bounce or chord before its second event has been seen.
   */
  tick(now: number): void {
    this.advance(now - this.opts.lateGraceMs);
  }

  /**
   * Raw view, used by lane A.
   *
   * @param code - DOM `keyCode`.
   * @returns true while the key is raw-held (between `keydown` and `keyup`).
   */
  isRawHeld(code: number): boolean {
    const s = this.byCode.get(code);
    return s !== undefined && s.rawDown;
  }

  /**
   * Time-debounced view, used by lane B.
   *
   * @param code - DOM `keyCode`.
   * @param now - current time in ms.
   * @returns true while the key is held or was released less than `debounceMs` before `now`.
   */
  isDebouncedHeld(code: number, now: number): boolean {
    const s = this.byCode.get(code);
    if (s === undefined) return false;
    return s.rawDown || now - s.rawUpAt < this.opts.debounceMs;
  }

  /**
   * Logical (bounce-merged) view, on which the verdicts are computed.
   *
   * @param code - DOM `keyCode`.
   * @returns true while the key is held in the bounce-merged view (a pending, unconfirmed release still
   *   counts as held).
   */
  isLogicallyHeld(code: number): boolean {
    const s = this.byCode.get(code);
    return s !== undefined && s.held;
  }

  /**
   * Returns and clears the number of `keydown` events (presses, repeats and bounces) of a key since the
   * previous call. Lane C ("naive" menu-style movement).
   *
   * @param code - DOM `keyCode`.
   * @returns the count since the last call (0 for a never-seen key).
   */
  takeNaiveDowns(code: number): number {
    const s = this.byCode.get(code);
    if (s === undefined) return 0;
    const n = s.naiveDowns;
    s.naiveDowns = 0;
    return n;
  }

  /**
   * Number of `keydown` events seen for a key.
   *
   * @param code - DOM `keyCode`.
   * @returns the total count (0 if never seen); not affected by {@link KeyTracker.resetStats}.
   */
  downsOf(code: number): number {
    const s = this.byCode.get(code);
    return s === undefined ? 0 : s.downs;
  }

  /** Number of keys currently raw-held. */
  get heldCount(): number {
    return this.rawDownCount;
  }

  /**
   * Per-key counters for the seen-keys table.
   *
   * @returns a fresh array of {@link SeenKey} records in first-seen order (allocates; UI-rate only).
   */
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
   * @returns a fresh {@link KeyStats} object (allocates; call at UI rate, not per frame).
   *
   * @remarks
   * Verdict precedence: diagonals are `yes` as soon as one overlap succeeded (a single success proves the
   * hardware can do it); the OK chord reports the best outcome seen (kept > blip > dropped).
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

  /**
   * Returns the state of a key, creating it on first sight.
   *
   * @param code - DOM `keyCode`.
   * @returns the (reused) state object.
   */
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

  /**
   * Starts a raw hold and updates the "max simultaneous" statistic.
   *
   * @param s - key state.
   * @param t - `keydown` time in ms.
   */
  private setRawDown(s: KeyState, t: number): void {
    s.rawDown = true;
    s.rawDownAt = t;
    this.rawDownCount++;
    if (this.rawDownCount > this.maxSimultaneous) this.maxSimultaneous = this.rawDownCount;
  }

  /**
   * Records a repeat event (clean, flagless or bounce) of the current logical hold: the first one yields a
   * repeat-delay sample (press → first repeat), later ones repeat-interval samples.
   *
   * @param s - key state.
   * @param t - event time in ms.
   */
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

  /**
   * Moves the clock forward and resolves everything that timed out: pending releases older than the bounce
   * window, diagonal overlaps that lasted the replace window, and OK chords whose window has passed.
   *
   * @param t - candidate time in ms; ignored if earlier than the current clock.
   */
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

  /**
   * Confirms a pending release: the logical hold ends at the raw `keyup` time. Updates "longest hold" and
   * judges every open diagonal overlap and OK chord that involves this key.
   *
   * @param s - key state (no-op for the logical view when the key is not held).
   */
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

  /**
   * A key was re-pressed inside the bounce window (fake keyup/keydown pair): an OK chord on this arrow whose
   * release blip fell within the chord window is judged "kept (release blip)".
   *
   * @param s - key state, with `pendingUpAt` still set to the bounced `keyup` time.
   */
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

  /**
   * A new logical press: an arrow opens a diagonal observation against every other held arrow; OK (Enter)
   * opens a chord observation for every held arrow.
   *
   * @param s - state of the key just pressed.
   * @param t - press time in ms.
   */
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

  /**
   * Counts a diagonal "yes" for every open overlap whose two arrows have now been held together for at least
   * the replace window (releases still pending confirmation end the overlap at their `keyup` time).
   *
   * @param now - current clock.
   */
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

  /**
   * Judges OK chords whose chord window has passed: "kept" when the arrow is still held and has no pending
   * release inside the window; chords whose arrow is no longer held are dropped from the list (the release
   * already judged them in {@link KeyTracker.finalizeRelease}); a pending release inside the window is left
   * for the release / bounce logic to decide.
   *
   * @param now - current clock.
   */
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

  /**
   * End of a key's logical hold as known so far.
   *
   * @param code - DOM `keyCode`.
   * @param now - current clock.
   * @returns its pending keyup time, `now` while still down, or `-Infinity` when not logically held.
   */
  private heldUntil(code: number, now: number): number {
    const s = this.byCode.get(code);
    if (s === undefined || !s.held) return -Infinity;
    return hasPending(s) ? s.pendingUpAt : now;
  }
}

/**
 * Picks the most frequent repeat style (ties: fake pairs > flagless > clean).
 *
 * @param clean - count of `keydown` events with the `repeat` flag.
 * @param noFlag - count of flagless repeat `keydown` events.
 * @param fakePairs - count of fake keyup/keydown pairs.
 * @returns `'none'` when all counts are zero, otherwise the dominant style.
 *
 * @remarks
 * Ties favor the "worse" style on purpose: the game's input layer must be designed for the most hostile
 * behavior the hardware exhibits.
 *
 * @example
 * ```ts
 * dominantRepeatStyle(10, 0, 0); // 'clean'
 * dominantRepeatStyle(5, 0, 5);  // 'fakepairs' (tie)
 * dominantRepeatStyle(0, 0, 0);  // 'none'
 * ```
 */
export function dominantRepeatStyle(clean: number, noFlag: number, fakePairs: number): RepeatStyle {
  if (clean === 0 && noFlag === 0 && fakePairs === 0) return 'none';
  if (fakePairs >= noFlag && fakePairs >= clean) return 'fakepairs';
  if (noFlag >= clean) return 'noflag';
  return 'clean';
}

/**
 * Tells whether a key has a raw `keyup` awaiting bounce confirmation.
 *
 * @param s - key state.
 * @returns true when `pendingUpAt` is set (not NaN).
 */
function hasPending(s: KeyState): boolean {
  return !Number.isNaN(s.pendingUpAt);
}

/**
 * Removes an element by swapping in the last one (order is not preserved). O(1), allocation-free.
 *
 * @param arr - array to modify in place.
 * @param i - index to remove (must be in range).
 */
function removeAt<T>(arr: T[], i: number): void {
  const last = arr.length - 1;
  if (i !== last) arr[i] = arr[last] as T;
  arr.length = last;
}
