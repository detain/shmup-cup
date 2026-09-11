/**
 * Smoke tests: every pure module imports in Node (no DOM) and the core flows produce sane results.
 * The full suite is built out separately; this file keeps the essentials covered.
 */

import { describe, expect, it } from 'vitest';

import { Checklist } from '../src/checklist';
import { formatEvent, LineLog } from '../src/eventLog';
import { MultiPressDetector } from '../src/exitGesture';
import { chooseEventTime, FrameStats, RunningStats } from '../src/frameStats';
import { GamepadMonitor, type GamepadEdge, type GamepadLike } from '../src/gamepad';
import { KeyTracker } from '../src/keyTracker';
import { KeyCode, KeyNames, selectKeysToRegister, shouldPreventDefault } from '../src/keys';
import { makeSessionId, reportEndpoint, ReportQueue } from '../src/report';
import { createLanes, stepLanes, wrap } from '../src/ships';
import { buildReportParts, buildVerdicts, type ProbeSnapshot } from '../src/summary';

const { Left, Up, Right, Enter } = KeyCode;

/** Feeds a hold with clean auto-repeat: press at t0, repeats from t0+delay every `interval`, release at t1. */
function holdClean(tr: KeyTracker, code: number, t0: number, t1: number, delay = 500, interval = 50): void {
  tr.keyDown(code, false, t0);
  for (let t = t0 + delay; t < t1; t += interval) tr.keyDown(code, true, t);
  tr.keyUp(code, t1);
}

describe('smoke', () => {
  it('imports pure modules without a DOM', () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
    expect(new KeyTracker()).toBeInstanceOf(KeyTracker);
  });

  it('names keys from the static table, Tizen list and DOM key fallback', () => {
    const n = new KeyNames();
    expect(n.name(10009)).toBe('Back');
    n.merge([{ name: 'ColorF0Red', code: 403 }, { name: 'Foo', code: 999 }]);
    expect(n.name(999)).toBe('Foo');
    expect(n.name(82, 'r')).toBe('R');
    expect(n.name(12345)).toBe('#12345');
    expect(selectKeysToRegister([{ name: 'Exit', code: 10182 }, { name: 'ChannelUp', code: 427 }])).toEqual(['ChannelUp']);
    expect(shouldPreventDefault(Left, { ctrl: false, meta: false, alt: false }, false)).toBe(true);
    expect(shouldPreventDefault(123, { ctrl: false, meta: false, alt: false }, true)).toBe(false);
    expect(shouldPreventDefault(82, { ctrl: true, meta: false, alt: false }, true)).toBe(false);
  });
});

describe('KeyTracker verdicts', () => {
  it('detects clean repeat style, delay and interval', () => {
    const tr = new KeyTracker();
    holdClean(tr, Right, 1000, 3000);
    tr.tick(4000);
    const s = tr.getStats(4000);
    expect(s.repeat.style).toBe('clean');
    expect(s.repeat.delayAvgMs).toBe(500);
    expect(s.repeat.intervalAvgMs).toBe(50);
    expect(s.longestHoldMs).toBe(2000);
    expect(s.bounce.count).toBe(0);
  });

  it('detects fake keyup/keydown pairs and keeps the logical hold', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    expect(tr.keyUp(Right, 400)).toBe(400);
    expect(tr.keyDown(Right, false, 420)).toBe('bounce');
    tr.keyUp(Right, 500);
    expect(tr.keyDown(Right, false, 530)).toBe('bounce');
    expect(tr.isLogicallyHeld(Right)).toBe(true);
    tr.keyUp(Right, 1600);
    tr.tick(2000);
    const s = tr.getStats(2000);
    expect(s.repeat.style).toBe('fakepairs');
    expect(s.bounce.count).toBe(2);
    expect(s.bounce.minGapMs).toBe(20);
    expect(s.bounce.avgGapMs).toBe(25);
    expect(s.longestHoldMs).toBe(1600);
    expect(tr.isLogicallyHeld(Right)).toBe(false);
  });

  it('detects keydown repeats without the repeat flag', () => {
    const tr = new KeyTracker();
    expect(tr.keyDown(Up, false, 0)).toBe('press');
    expect(tr.keyDown(Up, false, 400)).toBe('repeat-noflag');
    tr.keyUp(Up, 500);
    expect(tr.getStats(600).repeat.style).toBe('noflag');
  });

  it('diagonal YES when two arrows stay held together', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyDown(Up, false, 500);
    tr.tick(700);
    const s = tr.getStats(700);
    expect(s.diagonal.verdict).toBe('yes');
    expect(s.maxSimultaneous).toBe(2);
  });

  it('diagonal NO when the second arrow replaces the first', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyUp(Right, 495);
    tr.keyDown(Up, false, 500);
    tr.keyUp(Up, 1500);
    tr.tick(2000);
    expect(tr.getStats(2000).diagonal).toMatchObject({ verdict: 'no', replaced: 1, yes: 0 });
  });

  it('OK while arrow held: kept / dropped / blip', () => {
    const kept = new KeyTracker();
    kept.keyDown(Right, false, 0);
    kept.keyDown(Enter, false, 500);
    kept.keyUp(Enter, 550);
    kept.tick(700);
    expect(kept.getStats(700).chord.verdict).toBe('kept');

    const dropped = new KeyTracker();
    dropped.keyDown(Right, false, 0);
    dropped.keyDown(Enter, false, 500);
    dropped.keyUp(Right, 510);
    dropped.tick(800);
    expect(dropped.getStats(800).chord.verdict).toBe('dropped');

    const blip = new KeyTracker();
    blip.keyDown(Right, false, 0);
    blip.keyUp(Right, 495);
    blip.keyDown(Enter, false, 500);
    blip.keyDown(Right, false, 520);
    blip.tick(800);
    expect(blip.getStats(800).chord.verdict).toBe('blip');
  });

  it('ignores quick sequential taps for replaced / dropped verdicts', () => {
    const tr = new KeyTracker();
    tr.keyDown(Right, false, 0);
    tr.keyUp(Right, 60);
    tr.keyDown(Enter, false, 70); // Right still pending release, but was only tapped
    tr.keyUp(Enter, 120);
    tr.keyDown(Up, false, 130);
    tr.keyUp(Up, 190);
    tr.keyDown(Left, false, 200);
    tr.tick(1000);
    const s = tr.getStats(1000);
    expect(s.chord).toMatchObject({ verdict: 'untested', attempts: 0 });
    expect(s.diagonal).toMatchObject({ verdict: 'untested', attempts: 0 });
  });

  it('lane strategies: raw vs debounced vs naive', () => {
    const tr = new KeyTracker();
    const lanes = createLanes(800, 150);
    const x0 = lanes.raw.x;
    tr.keyDown(Right, false, 0);
    tr.keyUp(Right, 100);
    stepLanes(lanes, tr, 120); // raw released, debounced still held (< 50 ms), naive: 1 keydown
    expect(lanes.raw.x).toBe(x0);
    expect(lanes.debounced.x).toBe(x0 + 4);
    expect(lanes.naive.x).toBe(x0 + 12);
    expect(wrap(-1, 800)).toBe(799);
  });

  it('releaseAll clears held keys', () => {
    const tr = new KeyTracker();
    tr.keyDown(Left, false, 0);
    tr.releaseAll(100);
    expect(tr.isRawHeld(Left)).toBe(false);
    expect(tr.heldCount).toBe(0);
  });
});

describe('frame stats, exit gesture, log, checklist, gamepad, report', () => {
  it('computes frame summary and hitches', () => {
    const f = new FrameStats(100);
    for (let i = 0; i < 99; i++) f.push(16.7);
    f.push(40);
    f.push(2000); // pause
    const s = f.summary();
    expect(s.medianMs).toBeCloseTo(16.7);
    expect(s.hitches).toBe(1);
    expect(s.pauses).toBe(1);
    expect(s.maxMs).toBe(40);
    expect(f.recent(0)).toBe(40);
    const r = new RunningStats();
    r.add(2);
    r.add(4);
    expect(r.summary()).toEqual({ count: 2, avg: 3, min: 2, max: 4 });
    expect(chooseEventTime(990, 1000)).toEqual({ t: 990, delay: 10 });
    expect(Number.isNaN(chooseEventTime(1.7e12, 1000).delay)).toBe(true);
  });

  it('Back ×3 within 1.5 s exits', () => {
    const d = new MultiPressDetector();
    expect(d.press(0)).toBe(false);
    expect(d.press(2000)).toBe(false);
    expect(d.press(2500)).toBe(false);
    expect(d.press(3000)).toBe(true);
  });

  it('formats and bounds the event log', () => {
    const line = formatEvent({ t: 1234.5, type: 'down', code: 39, name: 'ArrowRight', repeat: false, kind: 'press', dt: 12 });
    expect(line).toContain('DOWN ArrowRight(39)');
    expect(line).toContain('repeat=0 press');
    expect(line).toContain('Δ12.0');
    const log = new LineLog(2);
    log.push('a');
    log.push('b');
    log.push('c');
    expect(log.toArray()).toEqual(['b', 'c']);
  });

  it('ticks the checklist stickily', () => {
    const c = new Checklist();
    const newly = c.update({
      seenCodes: [37, 38, 39, 40, 13, 10009, 427],
      longestHoldMs: 1600,
      diagonalAttempts: 0,
      chordAttempts: 1,
      gamepadSeen: false,
      leftAndReturned: false,
    });
    expect(newly).toEqual(['arrows', 'okBack', 'longHold', 'okWhileArrow', 'extraKey']);
    c.update({ seenCodes: [], longestHoldMs: 0, diagonalAttempts: 0, chordAttempts: 0, gamepadSeen: false, leftAndReturned: false });
    expect(c.isDone('arrows')).toBe(true);
  });

  it('edge-logs gamepad buttons and axes', () => {
    const m = new GamepadMonitor();
    const edges: GamepadEdge[] = [];
    const pad = (pressed: boolean, axis: number): GamepadLike => ({
      index: 0,
      id: 'Test pad',
      mapping: 'standard',
      connected: true,
      buttons: [{ pressed: false, value: 0 }, { pressed, value: pressed ? 1 : 0 }],
      axes: [axis, 0],
    });
    m.update([pad(false, 0)], (e) => edges.push(e));
    m.update([pad(true, -0.9)], (e) => edges.push(e));
    m.update([null], (e) => edges.push(e));
    expect(edges.map((e) => e.text)).toEqual([
      'GP0 connected id="Test pad" mapping="standard"',
      'GP0 b1 down',
      'GP0 a0 -1',
      'GP0 disconnected',
    ]);
    expect(m.anySeen).toBe(true);
  });

  it('builds report payloads and retries failed events', () => {
    expect(reportEndpoint('http://10.0.0.2:8787/')).toBe('http://10.0.0.2:8787/report');
    expect(reportEndpoint('')).toBeNull();
    expect(reportEndpoint(undefined)).toBeNull();
    const session = makeSessionId(1_700_000_000_000, 0.5);
    expect(session).toMatch(/^ip-[a-z0-9]+-[a-z0-9]{4}$/);

    const q = new ReportQueue(session, 3);
    q.push({ t: 1, type: 'info', text: 'a' });
    const tr = new KeyTracker();
    const snap: ProbeSnapshot = {
      keys: tr.getStats(0),
      frames: new FrameStats().summary(),
      dispatch: new RunningStats().summary(),
    };
    const parts = buildReportParts({
      env: null,
      snapshot: snap,
      keyName: (c) => String(c),
      seen: [],
      registered: [],
      supportedKeys: 0,
      checklist: [],
      gamepads: [],
    });
    expect(parts.verdicts.diagonals).toBe('not tested');
    const p1 = q.build(parts.env, parts.verdicts, parts.stats, 123);
    expect(p1).toMatchObject({ session, seq: 1, newEvents: [{ text: 'a' }] });
    q.restore(p1);
    q.push({ t: 2, type: 'info', text: 'b' });
    const p2 = q.build(null, null, null, 456);
    expect(p2.seq).toBe(2);
    expect(p2.newEvents.map((e) => e.text)).toEqual(['a', 'b']);
    expect(JSON.parse(JSON.stringify(p2)).session).toBe(session);
    expect(buildVerdicts(snap, String).repeatStyle).toBe('not observed');
  });
});
