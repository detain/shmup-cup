/**
 * summary (verdicts, panel lines, report parts) and envInfo (UA parsing, environment lines).
 */

import { describe, expect, it } from 'vitest';

import { Checklist } from '../src/checklist';
import { envHeadline, envLines, parseChromeVersion, parseTizenVersion, type EnvInfo } from '../src/envInfo';
import { FrameStats, RunningStats } from '../src/frameStats';
import { KeyCode, KeyNames } from '../src/keys';
import { KeyTracker, type KeyStats } from '../src/keyTracker';
import {
  buildReportParts,
  buildVerdicts,
  checklistLines,
  registerLines,
  seenKeyLines,
  verdictLines,
  type ProbeSnapshot,
} from '../src/summary';
import { holdClean } from './helpers/keySeq';

const names = new KeyNames();
const keyName = (c: number): string => names.name(c);

function snapshotFrom(tr: KeyTracker, now: number, frames = new FrameStats(), dispatch = new RunningStats()): ProbeSnapshot {
  return { keys: tr.getStats(now), frames: frames.summary(), dispatch: dispatch.summary() };
}

function withKeys(over: (k: KeyStats) => void): ProbeSnapshot {
  const snap = snapshotFrom(new KeyTracker(), 0);
  over(snap.keys);
  return snap;
}

describe('buildVerdicts', () => {
  it('fresh probe: everything "not tested"/null', () => {
    const v = buildVerdicts(snapshotFrom(new KeyTracker(), 0), keyName);
    expect(v).toEqual({
      diagonals: 'not tested',
      okWhileArrowHeld: 'not tested',
      repeatStyle: 'not observed',
      repeatDelayMs: null,
      repeatIntervalMs: null,
      repeatHz: null,
      bounces: 0,
      bounceMinGapMs: null,
      bounceAvgGapMs: null,
      maxSimultaneous: 0,
      longestHoldMs: 0,
      longestHoldKey: null,
      dispatchDelayAvgMs: null,
      dispatchDelayMaxMs: null,
      frameMedianMs: null,
      frameHz: null,
      frameP95Ms: null,
      frameMaxMs: null,
      hitches: 0,
    });
  });

  it.each([
    ['yes', 'YES'],
    ['no', 'NO'],
    ['untested', 'not tested'],
  ] as const)('diagonal %s → %s', (verdict, text) => {
    expect(buildVerdicts(withKeys((k) => (k.diagonal.verdict = verdict)), keyName).diagonals).toBe(text);
  });

  it.each([
    ['kept', 'arrow kept'],
    ['blip', 'arrow kept (release blip)'],
    ['dropped', 'arrow dropped'],
    ['untested', 'not tested'],
  ] as const)('chord %s → %s', (verdict, text) => {
    expect(buildVerdicts(withKeys((k) => (k.chord.verdict = verdict)), keyName).okWhileArrowHeld).toBe(text);
  });

  it('reports "not delivered" when a single-key device swallowed every second key (M3-02b)', () => {
    // The M7's remote: a long hold, never more than one key down at once, both arrows and OK seen.
    const snap = withKeys((k) => {
      k.maxSimultaneous = 1;
      k.longestHoldMs = 4200;
    });
    const seen = [KeyCode.Left, KeyCode.Right, KeyCode.Enter];
    const v = buildVerdicts(snap, keyName, seen);
    expect(v.diagonals).toBe('NO — not delivered');
    expect(v.okWhileArrowHeld).toBe('NO — not delivered');
    // Without a long hold there is nothing to conclude.
    const short = withKeys((k) => {
      k.maxSimultaneous = 1;
      k.longestHoldMs = 200;
    });
    expect(buildVerdicts(short, keyName, seen).diagonals).toBe('not tested');
    // Two keys down at once: the device is not single-key, so silence really is "not tested".
    const multi = withKeys((k) => {
      k.maxSimultaneous = 2;
      k.longestHoldMs = 4200;
    });
    expect(buildVerdicts(multi, keyName, seen).diagonals).toBe('not tested');
    // A conclusive observation always wins over the inference.
    const yes = withKeys((k) => {
      k.maxSimultaneous = 1;
      k.longestHoldMs = 4200;
      k.diagonal.verdict = 'yes';
    });
    expect(buildVerdicts(yes, keyName, seen).diagonals).toBe('YES');
  });

  it('needs the keys themselves to have been seen before it says "not delivered" (M3-02b)', () => {
    const single = () =>
      withKeys((k) => {
        k.maxSimultaneous = 1;
        k.longestHoldMs = 4200;
      });
    // One arrow only: a diagonal was never even attempted, so "not tested" is the honest answer.
    expect(buildVerdicts(single(), keyName, [KeyCode.Left]).diagonals).toBe('not tested');
    expect(buildVerdicts(single(), keyName, []).diagonals).toBe('not tested');
    // Two arrows: the attempt happened and the second key produced nothing.
    expect(buildVerdicts(single(), keyName, [KeyCode.Left, KeyCode.Up]).diagonals).toBe('NO — not delivered');
    // OK-while-arrow needs one arrow and OK; an arrow alone is not enough.
    expect(buildVerdicts(single(), keyName, [KeyCode.Left]).okWhileArrowHeld).toBe('not tested');
    expect(buildVerdicts(single(), keyName, [KeyCode.Enter]).okWhileArrowHeld).toBe('not tested');
    expect(buildVerdicts(single(), keyName, [KeyCode.Left, KeyCode.Enter]).okWhileArrowHeld).toBe('NO — not delivered');
    // Default: no seen list at all behaves like an empty one (the old two-argument call).
    expect(buildVerdicts(single(), keyName).diagonals).toBe('not tested');
  });

  it('keeps a measured chord verdict over the single-key inference', () => {
    for (const [verdict, text] of [
      ['kept', 'arrow kept'],
      ['blip', 'arrow kept (release blip)'],
      ['dropped', 'arrow dropped'],
    ] as const) {
      const snap = withKeys((k) => {
        k.maxSimultaneous = 1;
        k.longestHoldMs = 4200;
        k.chord.verdict = verdict;
      });
      expect(buildVerdicts(snap, keyName, [KeyCode.Left, KeyCode.Enter]).okWhileArrowHeld).toBe(text);
    }
  });

  it.each([
    ['clean', 'clean (repeat flag)'],
    ['noflag', 'keydown without repeat flag'],
    ['fakepairs', 'fake keyup/keydown pairs'],
    ['none', 'not observed'],
  ] as const)('repeat style %s → %s', (style, text) => {
    expect(buildVerdicts(withKeys((k) => (k.repeat.style = style)), keyName).repeatStyle).toBe(text);
  });

  it('rounds timings to 0.1 ms, longest hold to 1 ms, and names the longest-held key', () => {
    const tr = new KeyTracker();
    tr.keyDown(KeyCode.Right, false, 0);
    tr.keyDown(KeyCode.Right, true, 512.34);
    tr.keyDown(KeyCode.Right, true, 545.67);
    tr.keyUp(KeyCode.Right, 1500.6);
    tr.tick(3000);
    const frames = new FrameStats();
    frames.push(16.66);
    frames.push(16.68);
    frames.push(25);
    const dispatch = new RunningStats();
    dispatch.add(1.234);
    dispatch.add(3.456);
    const v = buildVerdicts(snapshotFrom(tr, 3000, frames, dispatch), keyName);
    expect(v.repeatDelayMs).toBe(512.3);
    expect(v.repeatIntervalMs).toBe(33.3);
    expect(v.repeatHz).toBe(30);
    expect(v.longestHoldMs).toBe(1501);
    expect(v.longestHoldKey).toBe('ArrowRight');
    expect(v.dispatchDelayAvgMs).toBe(2.3);
    expect(v.dispatchDelayMaxMs).toBe(3.5);
    expect(v.frameMedianMs).toBe(16.7);
    expect(v.frameHz).toBe(60);
    expect(v.frameMaxMs).toBe(25);
    expect(v.hitches).toBe(1);
  });
});

describe('verdictLines', () => {
  it('renders every stat group with aligned labels', () => {
    const tr = new KeyTracker();
    holdClean(tr, KeyCode.Right, 0, 2000);
    tr.keyDown(KeyCode.Up, false, 3000);
    tr.keyDown(KeyCode.Left, false, 3500);
    tr.keyDown(KeyCode.Enter, false, 4000);
    tr.tick(5000);
    const snap = snapshotFrom(tr, 5000);
    const lines = verdictLines(buildVerdicts(snap, keyName), snap);
    expect(lines).toHaveLength(12);
    expect(lines[0]).toBe('Diagonals ..... YES  (1 together, 0 replaced)');
    expect(lines[1]).toBe('OK+arrow ...... arrow kept');
    expect(lines[2]).toContain('2 kept · 0 blip · 0 dropped');
    expect(lines[3]).toBe('Repeat style .. clean (repeat flag)');
    expect(lines[4]).toContain('flag 30 · no-flag 0 · fake pairs 0');
    expect(lines[5]).toBe('Repeat timing . delay 500 ms · every 50.0 ms ⇒ 20.0 Hz');
    expect(lines[6]).toContain('Bounces <60ms . 0 · min gap —');
    expect(lines[7]).toContain('Max held ...... 3 keys · longest 2000 ms (ArrowRight)');
    expect(lines[8]).toContain('Dispatch ...... avg — · max — · n=0');
    expect(lines[9]).toContain('Frames ........');
    expect(lines[11]).toContain('pauses 0 · frames 0');
  });

  it('prompts for the chord test when untested', () => {
    const snap = snapshotFrom(new KeyTracker(), 0);
    const lines = verdictLines(buildVerdicts(snap, keyName), snap);
    expect(lines[0]).toBe('Diagonals ..... not tested');
    expect(lines[2]).toContain('hold an arrow, then tap OK');
  });
});

describe('seenKeyLines', () => {
  it('placeholder when empty', () => {
    expect(seenKeyLines([], keyName)).toEqual(['(no keys yet)']);
  });

  it('lays out name(code) downs/ups/repeats in columns, trimming trailing space', () => {
    const seen = [
      { code: 39, downs: 5, ups: 1, repeats: 4 },
      { code: 13, downs: 1, ups: 1, repeats: 0 },
      { code: 10009, downs: 2, ups: 2, repeats: 0 },
    ];
    const lines = seenKeyLines(seen, keyName);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^ArrowRight\(39\) 5\/1\/4 +Enter\(13\) 1\/1\/0$/);
    expect(lines[1]).toBe('Back(10009) 2/2/0');
    expect(seenKeyLines(seen, keyName, 3)).toHaveLength(1);
  });

  it('truncates long key names to fit the cell', () => {
    const lines = seenKeyLines([{ code: 1, downs: 1, ups: 0, repeats: 0 }], () => 'AVeryVeryLongTizenKeyName', 1, 34);
    expect(lines[0]).toContain('…');
    expect(lines[0]?.length).toBeLessThanOrEqual(34);
  });
});

describe('registerLines / checklistLines', () => {
  it('desktop browser', () => {
    expect(registerLines(0, [], false)).toEqual(['(no tizen.tvinputdevice — desktop browser)']);
  });

  it('summarizes successes and lists each failure', () => {
    const lines = registerLines(
      5,
      [
        { name: 'ChannelUp', code: 427, ok: true, error: null },
        { name: 'VolumeUp', code: 447, ok: false, error: 'InvalidValuesError: nope' },
        { name: 'Mystery', code: null, ok: false, error: null },
        { name: '0', code: 48, ok: true, error: null },
      ],
      true,
    );
    expect(lines).toEqual([
      'supported 5 · registered 2 · failed 2 (Exit skipped)',
      'ok: ChannelUp 0',
      'FAIL VolumeUp(447): InvalidValuesError: nope',
      'FAIL Mystery: ?',
    ]);
  });

  it('no ok line when nothing registered', () => {
    expect(registerLines(0, [], true)).toEqual(['supported 0 · registered 0 · failed 0 (Exit skipped)']);
  });

  it('checklist boxes', () => {
    const c = new Checklist();
    c.update({ seenCodes: [13, 10009], longestHoldMs: 0, diagonalAttempts: 0, chordAttempts: 0, gamepadSeen: false, leftAndReturned: false });
    const lines = checklistLines(c.items());
    expect(lines).toHaveLength(8);
    expect(lines[0]).toBe('[ ] Tapped all 4 arrows');
    expect(lines[1]).toBe('[x] Tapped OK & Back');
  });
});

describe('buildReportParts', () => {
  it('assembles env, verdicts and a JSON-friendly stats block', () => {
    const tr = new KeyTracker();
    tr.keyDown(427, false, 0);
    tr.keyUp(427, 50);
    const snap = snapshotFrom(tr, 100);
    const parts = buildReportParts({
      env: null,
      snapshot: snap,
      keyName,
      seen: tr.seenKeys(),
      registered: [{ name: 'ChannelUp', code: 427, ok: true, error: null }],
      supportedKeys: 12,
      checklist: new Checklist().items(),
      gamepads: [{ index: 0 }],
    });
    expect(parts.env).toBeNull();
    expect(parts.verdicts.diagonals).toBe('not tested');
    const stats = parts.stats as Record<string, unknown>;
    expect(stats['seenKeys']).toEqual([{ name: 'ChannelUp', code: 427, downs: 1, ups: 1, repeats: 0 }]);
    expect(stats['supportedKeys']).toBe(12);
    expect(stats['registered']).toEqual([{ name: 'ChannelUp', code: 427, ok: true, error: null }]);
    expect(stats['checklist']).toHaveLength(8);
    expect((stats['checklist'] as Array<{ id: string; done: boolean }>)[0]).toEqual({ id: 'arrows', done: false });
    expect(stats['gamepads']).toEqual([{ index: 0 }]);
    expect(stats['keys']).toBe(snap.keys);
    expect(JSON.parse(JSON.stringify(parts))).toMatchObject({ verdicts: { diagonals: 'not tested' } });
  });

  it('hands the seen keys to the verdicts, so a report says "not delivered" too (M3-02b)', () => {
    // The same long single-key hold the on-screen panel infers from must reach the JSON report.
    const tr = new KeyTracker();
    tr.keyDown(KeyCode.Left, false, 0);
    tr.keyDown(KeyCode.Up, false, 100); // swallowed on the hardware; the tracker still sees it
    tr.keyUp(KeyCode.Up, 100);
    tr.keyUp(KeyCode.Left, 5000);
    tr.keyDown(KeyCode.Enter, false, 5200);
    tr.keyUp(KeyCode.Enter, 5300);
    const snap = snapshotFrom(tr, 6000);
    snap.keys.maxSimultaneous = 1; // what the M7 reports: never two keys down at once
    const parts = buildReportParts({
      env: null,
      snapshot: snap,
      keyName,
      seen: tr.seenKeys(),
      registered: [],
      supportedKeys: 0,
      checklist: new Checklist().items(),
      gamepads: [],
    });
    expect(parts.verdicts.diagonals).toBe('NO — not delivered');
    expect(parts.verdicts.okWhileArrowHeld).toBe('NO — not delivered');
  });

  it('carries the raw rAF-delta histogram into the report (M3-02b)', () => {
    const frames = new FrameStats(16);
    for (const d of [16.7, 16.7, 21.3, 33.4]) frames.push(d);
    const parts = buildReportParts({
      env: null,
      snapshot: snapshotFrom(new KeyTracker(), 100, frames),
      keyName,
      seen: [],
      registered: [],
      supportedKeys: 0,
      checklist: new Checklist().items(),
      gamepads: [],
    });
    const stats = parts.stats as Record<string, unknown>;
    const summary = stats['frames'] as { histogram: number[] };
    expect(summary.histogram.reduce((sum, n) => sum + n, 0)).toBe(4);
    // It survives the JSON round trip the log server reads.
    expect(JSON.parse(JSON.stringify(parts)).stats.frames.histogram).toEqual(summary.histogram);
  });
});

// ------------------------------------------------------------------------------------------------ envInfo

/** Samsung's published UA strings (developer.samsung.com, "Retrieving Platform Information"). */
const UA = {
  tizen55: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106.1/5.5 TV Safari/537.36',
  tizen60: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146/6.0 TV Safari/537.36',
  tizen65: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.93/6.5 TV Safari/537.36',
  tizen50: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36',
  desktop: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  chromium: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/69.0.3497.100 Safari/537.36',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
};

describe('parseChromeVersion', () => {
  it('regression: reads the Chromium version from the Tizen 5.5 UA (no "Chrome/" token)', () => {
    expect(parseChromeVersion(UA.tizen55)).toBe(69);
  });

  it.each([
    ['tizen60', 76],
    ['tizen65', 85],
    ['desktop', 139],
    ['chromium', 69],
  ] as const)('%s → %i', (key, v) => {
    expect(parseChromeVersion(UA[key])).toBe(v);
  });

  it.each(['tizen50', 'firefox'] as const)('%s → null', (key) => {
    expect(parseChromeVersion(UA[key])).toBeNull();
  });

  it('empty string → null', () => {
    expect(parseChromeVersion('')).toBeNull();
  });
});

describe('parseTizenVersion', () => {
  it('reads the Tizen version', () => {
    expect(parseTizenVersion(UA.tizen55)).toBe('5.5');
    expect(parseTizenVersion(UA.tizen60)).toBe('6.0');
    expect(parseTizenVersion('Mozilla/5.0 (Linux; Tizen 2.3; SmartHub) …')).toBe('2.3');
    expect(parseTizenVersion(UA.desktop)).toBeNull();
  });
});

function env(over: Partial<EnvInfo> = {}): EnvInfo {
  const gl = { supported: true, maxTextureSize: 8192, renderer: 'Mali-G52', vendor: 'ARM', version: 'WebGL 1.0' };
  return {
    userAgent: UA.tizen55,
    chromeVersion: 69,
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    screenWidth: 1920,
    screenHeight: 1080,
    webgl1: gl,
    webgl2: { supported: false, maxTextureSize: null, renderer: null, vendor: null, version: null },
    webAssembly: true,
    audioWorklet: false,
    offscreenCanvas: false,
    gamepadApi: true,
    nativeGlobalThis: false,
    audioSampleRate: 48000,
    audioBaseLatency: 0.0213,
    hardwareConcurrency: 4,
    tizen: true,
    tizenPlatformVersion: '5.5',
    webapis: true,
    model: 'LS43AM702U',
    modelCode: '21_KANTSU2E_ST',
    firmware: 'T-KSU2EDEUC-1234.5',
    appVersion: '0.1.0',
    errors: [],
    ...over,
  };
}

describe('envLines / envHeadline', () => {
  it('describes the target device', () => {
    const lines = envLines(env());
    expect(lines).toEqual([
      'UA: ' + UA.tizen55,
      'Chrome 69 · Tizen 5.5 · tizen=yes webapis=yes',
      'Model LS43AM702U (21_KANTSU2E_ST) · FW T-KSU2EDEUC-1234.5 · app 0.1.0',
      'Window 1920×1080 @1 · screen 1920×1080',
      'WebGL1: yes  MAX_TEXTURE_SIZE=8192  WebGL 1.0',
      'WebGL2: no',
      'GPU: Mali-G52 / ARM',
      'WASM yes · AudioWorklet no · OffscreenCanvas no · Gamepad API yes · native globalThis no',
      'Audio sampleRate 48000 · baseLatency 21.3 ms · cores 4',
    ]);
    expect(envHeadline(env())).toBe('Chrome 69 · Tizen 5.5 · 1920×1080@1 · WebGL2 no · LS43AM702U');
  });

  it('uses dashes for unknown values and lists probe errors', () => {
    const e = env({
      chromeVersion: null,
      tizenPlatformVersion: null,
      model: null,
      modelCode: null,
      firmware: '',
      appVersion: null,
      audioSampleRate: null,
      audioBaseLatency: null,
      hardwareConcurrency: null,
      webgl1: { supported: false, maxTextureSize: null, renderer: null, vendor: null, version: null },
      errors: ['getFirmware: denied', 'webgl2: boom'],
    });
    const lines = envLines(e);
    expect(lines[1]).toBe('Chrome — · Tizen — · tizen=yes webapis=yes');
    expect(lines[2]).toBe('Model — (—) · FW — · app —');
    expect(lines[4]).toBe('WebGL1: no');
    expect(lines[6]).toBe('GPU: — / —');
    expect(lines[8]).toBe('Audio sampleRate — · baseLatency — · cores —');
    expect(lines[9]).toBe('probe errors: getFirmware: denied; webgl2: boom');
    expect(envHeadline(e)).toBe('Chrome — · Tizen — · 1920×1080@1 · WebGL2 no');
  });

  it('GPU line falls back to WebGL2 info', () => {
    const gl2 = { supported: true, maxTextureSize: 16384, renderer: 'ANGLE', vendor: 'Google', version: 'WebGL 2.0' };
    const e = env({ webgl1: { supported: false, maxTextureSize: null, renderer: null, vendor: null, version: null }, webgl2: gl2 });
    expect(envLines(e)).toContain('GPU: ANGLE / Google');
    expect(envHeadline(e)).toContain('WebGL2 yes');
  });
});
