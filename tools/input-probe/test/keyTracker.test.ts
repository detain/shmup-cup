/**
 * KeyTracker: keydown classification, held views (raw / logical / debounced / naive), repeat & bounce
 * statistics, diagonal and OK-chord verdicts, resets and time handling.
 */

import { describe, expect, it } from 'vitest';

import { Checklist } from '../src/checklist';
import { KeyCode } from '../src/keys';
import { DEFAULT_KEY_TRACKER_OPTIONS, KeyTracker, dominantRepeatStyle } from '../src/keyTracker';
import { holdClean, holdFakePairs, tickRange } from './helpers/keySeq';

const { Left, Up, Right, Down, Enter, Back } = KeyCode;

describe('KeyTracker options', () => {
  it('uses the spec defaults', () => {
    expect(new KeyTracker().opts).toEqual(DEFAULT_KEY_TRACKER_OPTIONS);
    expect(DEFAULT_KEY_TRACKER_OPTIONS).toMatchObject({ bounceWindowMs: 60, replaceWindowMs: 60, chordWindowMs: 60, debounceMs: 50 });
  });

  it('merges partial overrides with the defaults', () => {
    const tr = new KeyTracker({ bounceWindowMs: 100 });
    expect(tr.opts.bounceWindowMs).toBe(100);
    expect(tr.opts.chordWindowMs).toBe(60);
  });
});

describe('keydown classification', () => {
  it('classifies press, clean repeat and flagless repeat', () => {
    const tr = new KeyTracker();
    expect(tr.keyDown(Right, false, 0)).toBe('press');
    expect(tr.keyDown(Right, true, 500)).toBe('repeat');
    expect(tr.keyDown(Right, false, 550)).toBe('repeat-noflag');
  });

  it('treats a re-press < bounce window after keyup as a bounce, and at the window as a new press', () => {
    const a = new KeyTracker();
    a.keyDown(Up, false, 0);
    a.keyUp(Up, 100);
    expect(a.keyDown(Up, false, 159)).toBe('bounce');

    const b = new KeyTracker();
    b.keyDown(Up, false, 0);
    b.keyUp(Up, 100);
    expect(b.keyDown(Up, false, 160)).toBe('press');
  });

  it('honors a custom bounce window', () => {
    const tr = new KeyTracker({ bounceWindowMs: 20 });
    tr.keyDown(Up, false, 0);
    tr.keyUp(Up, 100);
    expect(tr.keyDown(Up, false, 125)).toBe('press');
  });

  it('classifies a repeat-flagged keydown for a key that is not down as a press (e.g. after blur)', () => {
    const tr = new KeyTracker();
    expect(tr.keyDown(Left, true, 10)).toBe('press');
    expect(tr.isLogicallyHeld(Left)).toBe(true);
  });

  it('a repeat-flagged keydown right after a keyup is still a bounce', () => {
    const tr = new KeyTracker();
    tr.keyDown(Left, false, 0);
    tr.keyUp(Left, 600);
    expect(tr.keyDown(Left, true, 610)).toBe('bounce');
  });

  it('tracks keys independently', () => {
    const tr = new KeyTracker();
    tr.keyDown(Left, false, 0);
    tr.keyUp(Left, 100);
    expect(tr.keyDown(Right, false, 110)).toBe('press');
    expect(tr.keyDown(Left, false, 120)).toBe('bounce');
  });
});

describe('keyup', () => {
  it('returns the raw hold duration since the latest raw keydown', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    expect(tr.keyUp(Right, 300)).toBe(300);
    tr.keyDown(Right, false, 320); // bounce
    expect(tr.keyUp(Right, 400)).toBe(80);
  });

  it('returns -1 for a stray keyup and never lets heldCount go negative', () => {
    const tr = new KeyTracker();
    expect(tr.keyUp(Enter, 5)).toBe(-1);
    tr.keyDown(Enter, false, 10);
    tr.keyUp(Enter, 20);
    expect(tr.keyUp(Enter, 30)).toBe(-1);
    expect(tr.heldCount).toBe(0);
    expect(tr.seenKeys()).toEqual([{ code: Enter, downs: 1, ups: 3, repeats: 0 }]);
  });
});

describe('held views', () => {
  it('raw view ends at keyup; logical view ends only after the bounce window (via tick with late grace)', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    expect(tr.isRawHeld(Right)).toBe(true);
    tr.keyUp(Right, 100);
    expect(tr.isRawHeld(Right)).toBe(false);
    expect(tr.isLogicallyHeld(Right)).toBe(true);
    tr.tick(150); // evaluates at 110
    expect(tr.isLogicallyHeld(Right)).toBe(true);
    tr.tick(199); // 159
    expect(tr.isLogicallyHeld(Right)).toBe(true);
    tr.tick(200); // 160 = keyup + 60
    expect(tr.isLogicallyHeld(Right)).toBe(false);
  });

  it('late grace lets a keydown whose timestamp precedes the frame time still count as a bounce', () => {
    const graced = new KeyTracker();
    graced.keyDown(Right, false, 0);
    graced.keyUp(Right, 100);
    graced.tick(165); // evaluates at 125 — not yet confirmed
    expect(graced.keyDown(Right, false, 150)).toBe('bounce');

    const noGrace = new KeyTracker({ lateGraceMs: 0 });
    noGrace.keyDown(Right, false, 0);
    noGrace.keyUp(Right, 100);
    noGrace.tick(165); // release confirmed at 160
    expect(noGrace.keyDown(Right, false, 150)).toBe('press');
  });

  it('debounced view stays held for debounceMs after keyup', () => {
    const tr = new KeyTracker();
    expect(tr.isDebouncedHeld(Up, 0)).toBe(false); // unknown key
    tr.keyDown(Up, false, 0);
    expect(tr.isDebouncedHeld(Up, 10)).toBe(true);
    tr.keyUp(Up, 100);
    expect(tr.isDebouncedHeld(Up, 149)).toBe(true);
    expect(tr.isDebouncedHeld(Up, 150)).toBe(false);
  });

  it('unknown keys are never held', () => {
    const tr = new KeyTracker();
    expect(tr.isRawHeld(999)).toBe(false);
    expect(tr.isLogicallyHeld(999)).toBe(false);
    expect(tr.takeNaiveDowns(999)).toBe(0);
    expect(tr.downsOf(999)).toBe(0);
  });

  it('naive downs count every keydown (press, repeats, bounces) and are cleared when taken', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Right, true, 500);
    tr.keyUp(Right, 520);
    tr.keyDown(Right, false, 530);
    expect(tr.takeNaiveDowns(Right)).toBe(3);
    expect(tr.takeNaiveDowns(Right)).toBe(0);
    expect(tr.downsOf(Right)).toBe(3);
  });

  it('counts simultaneous raw keys and the maximum', () => {
    const tr = new KeyTracker();
    tr.keyDown(Left, false, 0);
    tr.keyDown(Up, false, 10);
    tr.keyDown(Enter, false, 20);
    expect(tr.heldCount).toBe(3);
    tr.keyUp(Up, 30);
    tr.keyDown(Up, false, 40); // bounce re-press counts again
    tr.keyUp(Left, 50);
    expect(tr.heldCount).toBe(2);
    expect(tr.getStats(60).maxSimultaneous).toBe(3);
  });

  it('seenKeys lists keys in first-seen order with downs/ups/repeats', () => {
    const tr = new KeyTracker();
    tr.keyDown(Back, false, 0);
    tr.keyUp(Back, 50);
    holdClean(tr, Right, 1000, 1700); // press + repeats at 1500, 1550, 1600, 1650
    expect(tr.seenKeys()).toEqual([
      { code: Back, downs: 1, ups: 1, repeats: 0 },
      { code: Right, downs: 5, ups: 1, repeats: 4 },
    ]);
  });
});

describe('repeat statistics', () => {
  it('clean repeats: delay, interval and Hz', () => {
    const tr = new KeyTracker();
    holdClean(tr, Right, 0, 1000, 400, 40);
    const r = tr.getStats(2000).repeat;
    expect(r.style).toBe('clean');
    expect(r.clean).toBe(15); // 400, 440, … 960
    expect(r.delayAvgMs).toBe(400);
    expect(r.delaySamples).toBe(1);
    expect(r.intervalAvgMs).toBeCloseTo(40);
    expect(r.intervalSamples).toBe(14);
    expect(r.intervalHz).toBeCloseTo(25);
  });

  it('averages the repeat delay over several holds', () => {
    const tr = new KeyTracker();
    holdClean(tr, Right, 0, 1000, 400, 50);
    holdClean(tr, Up, 2000, 3000, 600, 50);
    expect(tr.getStats(4000).repeat).toMatchObject({ delayAvgMs: 500, delaySamples: 2 });
  });

  it('flagless repeats', () => {
    const tr = new KeyTracker();
    tr.keyDown(Down, false, 0);
    tr.keyDown(Down, false, 500);
    tr.keyDown(Down, false, 600);
    tr.keyUp(Down, 650);
    const r = tr.getStats(700).repeat;
    expect(r).toMatchObject({ style: 'noflag', noFlag: 2, clean: 0, fakePairs: 0, delayAvgMs: 500, intervalAvgMs: 100 });
  });

  it('fake pairs: bounces feed the style, delay/interval and bounce gap stats', () => {
    const tr = new KeyTracker();
    holdFakePairs(tr, Right, 0, 1000, 500, 100, 20); // keyups at 500..900, keydowns 20 ms later
    tr.tick(2000);
    const s = tr.getStats(2000);
    expect(s.repeat.style).toBe('fakepairs');
    expect(s.repeat.fakePairs).toBe(5);
    expect(s.repeat.delayAvgMs).toBe(520);
    expect(s.repeat.intervalAvgMs).toBe(100);
    expect(s.bounce).toEqual({ count: 5, minGapMs: 20, avgGapMs: 20 });
    expect(s.longestHoldMs).toBe(1000); // one logical hold across all bounces
  });

  it('bounce stats are null when there were none', () => {
    const s = new KeyTracker().getStats(0);
    expect(s.bounce).toEqual({ count: 0, minGapMs: null, avgGapMs: null });
    expect(s.repeat).toMatchObject({ style: 'none', delayAvgMs: null, intervalAvgMs: null, intervalHz: null });
  });

  it('reports min and average of different bounce gaps', () => {
    const tr = new KeyTracker();
    tr.keyDown(Up, false, 0);
    tr.keyUp(Up, 300);
    tr.keyDown(Up, false, 310);
    tr.keyUp(Up, 400);
    tr.keyDown(Up, false, 450);
    expect(tr.getStats(500).bounce).toEqual({ count: 2, minGapMs: 10, avgGapMs: 30 });
  });

  it('intervalHz is null when all repeat intervals are zero', () => {
    const tr = new KeyTracker();
    tr.keyDown(Up, false, 0);
    tr.keyDown(Up, true, 500);
    tr.keyDown(Up, true, 500);
    const r = tr.getStats(600).repeat;
    expect(r.intervalAvgMs).toBe(0);
    expect(r.intervalHz).toBeNull();
  });
});

describe('dominantRepeatStyle', () => {
  it.each([
    [0, 0, 0, 'none'],
    [1, 0, 0, 'clean'],
    [0, 1, 0, 'noflag'],
    [0, 0, 1, 'fakepairs'],
    [1, 1, 1, 'fakepairs'],
    [2, 2, 0, 'noflag'],
    [3, 2, 0, 'clean'],
    [5, 0, 4, 'clean'],
    [1, 2, 3, 'fakepairs'],
    [1, 3, 2, 'noflag'],
  ] as const)('clean=%i noFlag=%i fake=%i → %s', (c, n, f, expected) => {
    expect(dominantRepeatStyle(c, n, f)).toBe(expected);
  });
});

describe('longest hold', () => {
  it('includes a hold still in progress and names its key', () => {
    const tr = new KeyTracker();
    tr.keyDown(Left, false, 0);
    tr.keyUp(Left, 300);
    tr.keyDown(Up, false, 1000);
    tr.tick(2000);
    const s = tr.getStats(2000);
    expect(s.longestHoldMs).toBe(1000);
    expect(s.longestHoldCode).toBe(Up);
  });

  it('keeps the longest finished hold when a shorter one is in progress', () => {
    const tr = new KeyTracker();
    tr.keyDown(Left, false, 0);
    tr.keyUp(Left, 900);
    tr.keyDown(Up, false, 1000);
    const s = tr.getStats(1100);
    expect(s.longestHoldMs).toBe(900);
    expect(s.longestHoldCode).toBe(Left);
  });

  it('regression: a released key awaiting bounce confirmation is not counted until "now"', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyUp(Right, 1450);
    // 55 ms later the release is still pending (bounce window 60 ms): the hold ended at 1450, not 1505.
    expect(tr.getStats(1505).longestHoldMs).toBe(1450);
    tr.tick(2000);
    expect(tr.getStats(2000).longestHoldMs).toBe(1450);
  });

  it('regression: a 1.45 s hold never ticks the sticky "held a key ≥ 1.5 s" checklist item', () => {
    const tr = new KeyTracker();
    const checklist = new Checklist();
    tr.keyDown(Right, false, 0);
    tr.keyUp(Right, 1450);
    for (let now = 1450; now <= 1600; now += 16) {
      tr.tick(now);
      const s = tr.getStats(now);
      checklist.update({
        seenCodes: [Right],
        longestHoldMs: s.longestHoldMs,
        diagonalAttempts: 0,
        chordAttempts: 0,
        gamepadSeen: false,
        leftAndReturned: false,
      });
    }
    expect(checklist.isDone('longHold')).toBe(false);
  });
});

describe('diagonal verdict', () => {
  it('YES when two arrows overlap for at least the replace window (boundary 60 ms)', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Up, false, 500);
    tr.keyUp(Right, 560); // overlap exactly 60 ms
    tr.tick(1000);
    expect(tr.getStats(1000).diagonal).toEqual({ verdict: 'yes', yes: 1, replaced: 0, attempts: 1 });
  });

  it('NO when the first arrow is released just before the second is pressed', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyUp(Right, 495);
    tr.keyDown(Up, false, 500);
    tr.tick(1000);
    expect(tr.getStats(1000).diagonal).toEqual({ verdict: 'no', yes: 0, replaced: 1, attempts: 1 });
  });

  it('NO when the first arrow is released within the window after the second press (59 ms overlap)', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Up, false, 500);
    tickRange(tr, 500, 558);
    tr.keyUp(Right, 559);
    tickRange(tr, 560, 1000);
    expect(tr.getStats(1000).diagonal).toMatchObject({ verdict: 'no', replaced: 1 });
  });

  it('is judged YES during the hold, without waiting for a release', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Up, false, 500);
    tr.tick(599); // evaluates at 559
    expect(tr.getStats(599).diagonal.verdict).toBe('untested');
    tr.tick(600); // 560
    expect(tr.getStats(600).diagonal.verdict).toBe('yes');
  });

  it('ignores a first arrow that was only tapped (held < minHoldMs)', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyUp(Right, 150);
    tr.keyDown(Up, false, 160);
    tr.tick(1000);
    expect(tr.getStats(1000).diagonal).toMatchObject({ verdict: 'untested', attempts: 0 });
  });

  it('ignores a second arrow that was only tapped while the first stays held', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Up, false, 500);
    tr.keyUp(Up, 530);
    tr.tick(1000);
    expect(tr.getStats(1000).diagonal).toMatchObject({ verdict: 'untested', attempts: 0 });
  });

  it('a fake keyup/keydown pair on the first arrow does not end the overlap', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Up, false, 500);
    tr.keyUp(Right, 520);
    tr.keyDown(Right, false, 535); // bounce
    tr.tick(700);
    expect(tr.getStats(700).diagonal).toMatchObject({ verdict: 'yes', replaced: 0 });
  });

  it('YES wins over earlier NO observations; attempts count both', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyUp(Right, 495);
    tr.keyDown(Up, false, 500);
    tr.keyUp(Up, 2000);
    tr.tick(2100);
    tr.keyDown(Left, false, 3000);
    tr.keyDown(Down, false, 3500);
    tr.tick(4000);
    expect(tr.getStats(4000).diagonal).toEqual({ verdict: 'yes', yes: 1, replaced: 1, attempts: 2 });
  });

  it('non-arrow keys never form a diagonal', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Back, false, 500);
    tr.keyDown(Enter, false, 600);
    tr.tick(2000);
    expect(tr.getStats(2000).diagonal.attempts).toBe(0);
  });

  it('three arrows held together produce one overlap per pair with the newest arrow', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Up, false, 300);
    tr.keyDown(Left, false, 600);
    tr.tick(1000);
    expect(tr.getStats(1000).diagonal).toMatchObject({ verdict: 'yes', yes: 3 });
  });

  it('releaseAll discards an open overlap instead of judging it', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Up, false, 500);
    tr.releaseAll(520);
    tr.tick(2000);
    expect(tr.getStats(2000).diagonal).toMatchObject({ verdict: 'untested', attempts: 0 });
  });

  it('honors custom replace window and min hold', () => {
    const tr = new KeyTracker({ replaceWindowMs: 20, minHoldMs: 50 });
    tr.keyDown(Right, false, 0);
    tr.keyUp(Right, 90);
    tr.keyDown(Up, false, 100);
    tr.tick(1000);
    expect(tr.getStats(1000).diagonal.verdict).toBe('no');
  });
});

describe('OK-while-arrow-held verdict', () => {
  it('kept: the arrow is still held one chord window after OK (judged by tick)', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Enter, false, 500);
    tr.keyUp(Enter, 540);
    tr.tick(599); // 559
    expect(tr.getStats(599).chord.verdict).toBe('untested');
    tr.tick(600); // 560
    expect(tr.getStats(600).chord).toEqual({ verdict: 'kept', kept: 1, blip: 0, dropped: 0, attempts: 1 });
  });

  it('kept: judged at the next key event even without ticks', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Enter, false, 500);
    tr.keyUp(Right, 700);
    expect(tr.getStats(700).chord.verdict).toBe('kept');
  });

  it('dropped: arrow released just inside the chord window after OK', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Enter, false, 500);
    tr.keyUp(Right, 559);
    tr.tick(1000);
    expect(tr.getStats(1000).chord).toMatchObject({ verdict: 'dropped', dropped: 1 });
  });

  it('kept: arrow released just after the chord window', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Enter, false, 500);
    tr.keyUp(Right, 561);
    tr.tick(1000);
    expect(tr.getStats(1000).chord).toMatchObject({ verdict: 'kept', dropped: 0 });
  });

  it('dropped: arrow keyup arrives just before OK keydown (still pending)', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyUp(Right, 460);
    tr.keyDown(Enter, false, 500);
    tr.tick(1000);
    expect(tr.getStats(1000).chord.verdict).toBe('dropped');
  });

  it('blip: arrow gets a fake keyup/keydown pair around OK', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Enter, false, 500);
    tr.keyUp(Right, 505);
    tr.keyDown(Right, false, 525);
    tr.tick(1000);
    expect(tr.getStats(1000).chord).toEqual({ verdict: 'blip', kept: 0, blip: 1, dropped: 0, attempts: 1 });
    expect(tr.isLogicallyHeld(Right)).toBe(true);
  });

  it('a fake pair far from the OK press is not a blip; the chord is judged kept', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Enter, false, 500);
    tr.keyUp(Right, 570);
    tr.keyDown(Right, false, 590); // bounce, but keyup was 70 ms after OK
    tr.tick(1000);
    expect(tr.getStats(1000).chord).toMatchObject({ verdict: 'kept', blip: 0 });
  });

  it('ignores an arrow that was only tapped before OK (sequential taps)', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 400);
    tr.keyUp(Right, 480);
    tr.keyDown(Enter, false, 500);
    tr.tick(1000);
    expect(tr.getStats(1000).chord).toMatchObject({ verdict: 'untested', attempts: 0 });
  });

  it('OK without any arrow held, or OK repeats, open no chord', () => {
    const tr = new KeyTracker();
    tr.keyDown(Enter, false, 0);
    tr.keyDown(Right, false, 100);
    tr.keyDown(Enter, true, 600); // repeat of OK while the arrow is held
    tr.tick(2000);
    expect(tr.getStats(2000).chord.attempts).toBe(0);
  });

  it('OK with two arrows held observes both', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Up, false, 100);
    tr.keyDown(Enter, false, 500);
    tr.tick(1000);
    expect(tr.getStats(1000).chord).toMatchObject({ verdict: 'kept', kept: 2 });
  });

  it('verdict precedence: kept > blip > dropped', () => {
    const tr = new KeyTracker();
    // dropped
    tr.keyDown(Right, false, 0);
    tr.keyDown(Enter, false, 500);
    tr.keyUp(Enter, 520);
    tr.keyUp(Right, 530);
    tr.tick(1000);
    expect(tr.getStats(1000).chord.verdict).toBe('dropped');
    // blip
    tr.keyDown(Right, false, 2000);
    tr.keyDown(Enter, false, 2500);
    tr.keyUp(Enter, 2510);
    tr.keyUp(Right, 2510);
    tr.keyDown(Right, false, 2530);
    tr.tick(3000);
    expect(tr.getStats(3000).chord.verdict).toBe('blip');
    // kept
    tr.keyDown(Enter, false, 3500);
    tr.tick(4000);
    expect(tr.getStats(4000).chord).toEqual({ verdict: 'kept', kept: 1, blip: 1, dropped: 1, attempts: 3 });
  });

  it('releaseAll discards an open chord', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Enter, false, 500);
    tr.releaseAll(510);
    tr.tick(2000);
    expect(tr.getStats(2000).chord.attempts).toBe(0);
  });
});

describe('releaseAll', () => {
  it('releases raw, logical and naive state immediately and records the hold', () => {
    const tr = new KeyTracker();
    tr.keyDown(Left, false, 0);
    tr.keyDown(Up, false, 100);
    tr.releaseAll(800);
    expect(tr.heldCount).toBe(0);
    expect(tr.isRawHeld(Left)).toBe(false);
    expect(tr.isLogicallyHeld(Left)).toBe(false);
    expect(tr.isLogicallyHeld(Up)).toBe(false);
    expect(tr.takeNaiveDowns(Left)).toBe(0);
    expect(tr.getStats(800)).toMatchObject({ longestHoldMs: 800, longestHoldCode: Left });
    // a keyup arriving afterwards is stray
    expect(tr.keyUp(Left, 900)).toBe(-1);
    // the next keydown is a fresh press
    expect(tr.keyDown(Left, true, 1000)).toBe('press');
  });

  it('a release pending before blur ends the hold at its original keyup time', () => {
    const tr = new KeyTracker();
    tr.keyDown(Left, false, 0);
    tr.keyUp(Left, 400);
    tr.releaseAll(430);
    expect(tr.getStats(430).longestHoldMs).toBe(400);
  });
});

describe('resetStats', () => {
  it('clears hold/repeat stats but keeps verdicts and the seen-keys table', () => {
    const tr = new KeyTracker();
    holdClean(tr, Right, 0, 1000);
    tr.keyDown(Right, false, 2000);
    tr.keyDown(Up, false, 2500);
    tr.keyUp(Right, 2505);
    tr.keyDown(Right, false, 2520); // bounce
    tr.keyUp(Right, 3000);
    tr.keyUp(Up, 3000);
    tr.tick(4000);
    tr.resetStats();
    const s = tr.getStats(4000);
    expect(s.repeat).toMatchObject({ style: 'none', clean: 0, delaySamples: 0, intervalSamples: 0 });
    expect(s.bounce.count).toBe(0);
    expect(s.longestHoldMs).toBe(0);
    expect(s.longestHoldCode).toBeNull();
    expect(s.maxSimultaneous).toBe(0);
    expect(s.diagonal.verdict).toBe('yes');
    expect(tr.seenKeys().map((k) => k.code)).toEqual([Right, Up]);
  });

  it('keeps max simultaneous at the number of keys currently held', () => {
    const tr = new KeyTracker();
    tr.keyDown(Left, false, 0);
    tr.keyDown(Up, false, 0);
    tr.keyDown(Enter, false, 0);
    tr.keyUp(Enter, 10);
    tr.resetStats();
    expect(tr.getStats(20).maxSimultaneous).toBe(2);
  });

  it('restarts ongoing holds so their pre-reset duration is not counted', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.tick(1040); // clock = 1000
    tr.resetStats();
    expect(tr.getStats(1300).longestHoldMs).toBe(300);
  });

  it('regression: a key held through a reset does not record a bogus repeat-delay sample', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    for (let t = 500; t <= 1000; t += 50) tr.keyDown(Right, true, t);
    tr.tick(1060); // clock = 1020
    tr.resetStats();
    for (let t = 1050; t <= 1200; t += 50) tr.keyDown(Right, true, t);
    tr.keyUp(Right, 1220);
    const r = tr.getStats(1300).repeat;
    expect(r.delaySamples).toBe(0); // no new press → no delay sample
    expect(r.delayAvgMs).toBeNull();
    expect(r.intervalAvgMs).toBe(50);
    expect(r.intervalSamples).toBe(4); // 1000→1050 … 1150→1200
  });

  it('a key pressed before a reset still yields its true repeat delay (measured from the real press)', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.tick(240); // clock = 200
    tr.resetStats();
    tr.keyDown(Right, true, 500);
    tr.keyDown(Right, true, 550);
    const r = tr.getStats(600).repeat;
    expect(r.delaySamples).toBe(1);
    expect(r.delayAvgMs).toBe(500);
    expect(r.intervalSamples).toBe(1);
    expect(r.intervalAvgMs).toBe(50);
  });

  it('regression: a reset does not shorten an arrow hold as seen by the diagonal min-hold filter', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.tick(1040); // clock = 1000
    tr.resetStats();
    tr.keyUp(Right, 1095);
    tr.keyDown(Up, false, 1100); // Right (held 1.1 s) replaced by Up
    tr.tick(2000);
    expect(tr.getStats(2000).diagonal).toMatchObject({ verdict: 'no', replaced: 1 });
  });

  it('regression: a reset does not shorten an arrow hold as seen by the OK-chord min-hold filter', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.tick(1040); // clock = 1000
    tr.resetStats();
    tr.keyDown(Enter, false, 1100);
    tr.keyUp(Right, 1110); // arrow dropped by OK
    tr.tick(2000);
    expect(tr.getStats(2000).chord).toMatchObject({ verdict: 'dropped', dropped: 1 });
  });
});

describe('time handling', () => {
  it('never moves its clock backwards on out-of-order timestamps', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyUp(Right, 100);
    tr.tick(1000); // confirms the release
    tr.keyDown(Up, false, 50); // late, out-of-order event
    expect(tr.isLogicallyHeld(Right)).toBe(false);
    expect(tr.isLogicallyHeld(Up)).toBe(true);
  });

  it('getStats does not mutate state (repeatable snapshots)', () => {
    const tr = new KeyTracker();
    holdClean(tr, Right, 0, 1000);
    tr.keyDown(Up, false, 1500);
    const a = tr.getStats(2000);
    const b = tr.getStats(2000);
    expect(b).toEqual(a);
  });
});
