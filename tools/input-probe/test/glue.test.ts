/**
 * DOM / Tizen glue modules exercised headlessly with small fakes (no jsdom):
 * platform (key registration, exit), env (environment probe), ui (panels, stage fit), arena (canvas drawing).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Arena, ARENA_HEIGHT, ARENA_WIDTH, LANE_HEIGHT } from '../src/arena';
import { collectEnv } from '../src/env';
import { FrameStats } from '../src/frameStats';
import { describeError, exitApp, getSupportedKeys, hasTizen, registerAllKeys } from '../src/platform';
import { createLanes } from '../src/ships';
import { fitStage, ProbeUI, STAGE_HEIGHT, STAGE_WIDTH, type PanelId } from '../src/ui';
import { createFakeWebGL, createRecordingContext2D } from './helpers/fakeCanvas';

afterEach(() => {
  vi.unstubAllGlobals();
});

const TIZEN_UA =
  'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106.1/5.5 TV Safari/537.36';

// ------------------------------------------------------------------------------------------------ platform

describe('platform', () => {
  it('desktop browser: no tizen → safe no-ops', () => {
    vi.stubGlobal('window', {});
    expect(hasTizen()).toBe(false);
    const onError = vi.fn();
    expect(getSupportedKeys(onError)).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
    expect(registerAllKeys([{ name: 'ChannelUp', code: 427 }])).toEqual([]);
    expect(exitApp()).toBe(false);
  });

  it('hasTizen rejects a null tizen global', () => {
    vi.stubGlobal('window', { tizen: null });
    expect(hasTizen()).toBe(false);
  });

  it('getSupportedKeys copies name/code and reports failures', () => {
    vi.stubGlobal('window', {
      tizen: { tvinputdevice: { getSupportedKeys: () => [{ name: 'ChannelUp', code: 427, extra: 1 }] } },
    });
    expect(hasTizen()).toBe(true);
    expect(getSupportedKeys(() => undefined)).toEqual([{ name: 'ChannelUp', code: 427 }]);

    vi.stubGlobal('window', {
      tizen: {
        tvinputdevice: {
          getSupportedKeys: () => {
            throw { name: 'SecurityError', message: 'privilege missing' };
          },
        },
      },
    });
    const onError = vi.fn();
    expect(getSupportedKeys(onError)).toEqual([]);
    expect(onError).toHaveBeenCalledWith('getSupportedKeys failed: SecurityError: privilege missing');
  });

  it('registerAllKeys registers each key except Exit, recording per-key results', () => {
    const registered: string[] = [];
    vi.stubGlobal('window', {
      tizen: {
        tvinputdevice: {
          registerKey: (name: string) => {
            if (name === 'VolumeUp') throw { name: 'InvalidValuesError', message: 'not allowed' };
            registered.push(name);
          },
        },
      },
    });
    const results = registerAllKeys([
      { name: 'ChannelUp', code: 427 },
      { name: 'Exit', code: 10182 },
      { name: 'VolumeUp', code: 447 },
      { name: 'MediaPlayPause', code: 10252 },
    ]);
    expect(registered).toEqual(['ChannelUp', 'MediaPlayPause']);
    expect(results).toEqual([
      { name: 'ChannelUp', code: 427, ok: true, error: null },
      { name: 'VolumeUp', code: 447, ok: false, error: 'InvalidValuesError: not allowed' },
      { name: 'MediaPlayPause', code: 10252, ok: true, error: null },
    ]);
  });

  it('exitApp calls getCurrentApplication().exit() and survives failures', () => {
    const exit = vi.fn();
    vi.stubGlobal('window', { tizen: { application: { getCurrentApplication: () => ({ exit }) } } });
    expect(exitApp()).toBe(true);
    expect(exit).toHaveBeenCalledOnce();

    vi.stubGlobal('window', {
      tizen: {
        application: {
          getCurrentApplication: () => {
            throw new Error('nope');
          },
        },
      },
    });
    expect(exitApp()).toBe(false);
  });

  it.each([
    [{ name: 'NotFoundError', message: 'no key' }, 'NotFoundError: no key'],
    [{ name: 'NotFoundError' }, 'NotFoundError'],
    [{ message: 'only message' }, 'only message'],
    [new TypeError('bad'), 'TypeError: bad'],
    ['plain string', 'plain string'],
    [42, '42'],
    [null, 'null'],
    [undefined, 'undefined'],
    [{}, '[object Object]'],
  ])('describeError(%j) → %s', (e, text) => {
    expect(describeError(e)).toBe(text);
  });
});

// ------------------------------------------------------------------------------------------------ env

interface EnvStubOptions {
  tizen?: unknown;
  webapis?: unknown;
  audio?: 'ok' | 'throws' | 'none';
  webgl?: 'ok' | 'throws' | 'none';
  globalThisPolyfilled?: boolean;
}

function stubBrowser(o: EnvStubOptions = {}): { closed: () => boolean; glLost: () => boolean } {
  let closed = false;
  const { gl, lost } = createFakeWebGL({ maxTextureSize: 8192, renderer: 'Mali-G52 MC2', vendor: 'ARM', version: 'WebGL 1.0', debugInfo: true });
  class FakeAudioContext {
    sampleRate = 48000;
    baseLatency = 0.012;
    audioWorklet = {};
    constructor() {
      if (o.audio === 'throws') throw new Error('audio blocked');
    }
    close(): Promise<void> {
      closed = true;
      return Promise.resolve();
    }
  }
  const win: Record<string, unknown> = {
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    screen: { width: 1920, height: 1080 },
    WebAssembly: {},
    tizen: o.tizen,
    webapis: o.webapis,
    __globalThisPolyfilled: o.globalThisPolyfilled,
  };
  if (o.audio !== 'none') win['AudioContext'] = FakeAudioContext;
  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', { userAgent: TIZEN_UA, getGamepads: () => [], hardwareConcurrency: 4 });
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: (kind: string) => {
        if (o.webgl === 'throws') throw new Error(kind + ' exploded');
        if (o.webgl === 'none') return null;
        return kind === 'webgl' ? gl : null;
      },
    }),
  });
  return { closed: () => closed, glLost: lost };
}

describe('collectEnv', () => {
  it('collects the target-device facts from Tizen / Samsung / browser globals', () => {
    const b = stubBrowser({
      tizen: {
        systeminfo: { getCapability: (k: string) => (k === 'http://tizen.org/feature/platform.version' ? '5.5.0' : null) },
        application: { getCurrentApplication: () => ({ appInfo: { version: '0.1.0' } }) },
      },
      webapis: { productinfo: { getModel: () => 'LS43AM702U', getModelCode: () => '21_KANTSU2E', getFirmware: () => 'T-KSU2E-1' } },
    });
    const e = collectEnv();
    expect(e).toMatchObject({
      userAgent: TIZEN_UA,
      chromeVersion: 69,
      innerWidth: 1920,
      innerHeight: 1080,
      devicePixelRatio: 1,
      screenWidth: 1920,
      screenHeight: 1080,
      webgl1: { supported: true, maxTextureSize: 8192, renderer: 'Mali-G52 MC2', vendor: 'ARM', version: 'WebGL 1.0' },
      webgl2: { supported: false },
      webAssembly: true,
      audioWorklet: true,
      offscreenCanvas: false,
      gamepadApi: true,
      nativeGlobalThis: true,
      audioSampleRate: 48000,
      audioBaseLatency: 0.012,
      hardwareConcurrency: 4,
      tizen: true,
      tizenPlatformVersion: '5.5.0',
      webapis: true,
      model: 'LS43AM702U',
      modelCode: '21_KANTSU2E',
      firmware: 'T-KSU2E-1',
      appVersion: '0.1.0',
      errors: [],
    });
    expect(b.closed()).toBe(true);
    expect(b.glLost()).toBe(true);
  });

  it('desktop browser without Tizen/Samsung APIs, AudioContext or WebGL', () => {
    stubBrowser({ audio: 'none', webgl: 'none', globalThisPolyfilled: true });
    const e = collectEnv();
    expect(e).toMatchObject({
      tizen: false,
      webapis: false,
      tizenPlatformVersion: '5.5', // falls back to the UA
      model: null,
      modelCode: null,
      firmware: null,
      appVersion: null,
      audioSampleRate: null,
      audioBaseLatency: null,
      audioWorklet: false,
      nativeGlobalThis: false,
      errors: [],
    });
    expect(e.webgl1.supported).toBe(false);
  });

  it('never throws: failing probes are recorded as errors', () => {
    stubBrowser({
      audio: 'throws',
      webgl: 'throws',
      tizen: {
        systeminfo: {
          getCapability: () => {
            throw new Error('no systeminfo');
          },
        },
        application: {
          getCurrentApplication: () => {
            throw new Error('no app');
          },
        },
      },
      webapis: {
        productinfo: {
          getModel: () => {
            throw { name: 'SecurityError', message: 'x' };
          },
          getFirmware: () => '',
        },
      },
    });
    const e = collectEnv();
    expect(e.errors).toEqual([
      'AudioContext: audio blocked',
      'systeminfo: no systeminfo',
      'webgl: webgl exploded',
      'webgl2: webgl2 exploded',
      'getModel: [object Object]',
      'appInfo: no app',
    ]);
    expect(e.tizenPlatformVersion).toBe('5.5');
    expect(e.firmware).toBeNull(); // '' → null
    expect(e.modelCode).toBeNull(); // method missing
  });
});

// ------------------------------------------------------------------------------------------------ ui

describe('fitStage', () => {
  it('1920×1080 window → scale 1, no offsets', () => {
    expect(fitStage(1920, 1080)).toEqual({ scale: 1, left: 0, top: 0 });
  });

  it('letterboxes wide and tall windows', () => {
    expect(fitStage(1280, 720)).toEqual({ scale: 2 / 3, left: 0, top: 0 });
    const wide = fitStage(2560, 1080);
    expect(wide.scale).toBe(1);
    expect(wide.left).toBe(320);
    const tall = fitStage(960, 1080);
    expect(tall.scale).toBe(0.5);
    expect(tall.top).toBe(270);
  });

  it('degenerate 0×0 window falls back to scale 1', () => {
    expect(fitStage(0, 0).scale).toBe(1);
    expect(STAGE_WIDTH / STAGE_HEIGHT).toBeCloseTo(16 / 9);
  });
});

const PANELS: PanelId[] = ['log', 'env', 'verdicts', 'checklist', 'seen', 'keys', 'pads', 'headline', 'report'];

function fakeDoc(ids: string[]): { doc: Document; els: Map<string, { textContent: string; writes: number; style: Record<string, string> }> } {
  const els = new Map<string, { textContent: string; writes: number; style: Record<string, string> }>();
  for (const id of ids) {
    const el = {
      _t: '',
      writes: 0,
      style: {} as Record<string, string>,
      get textContent(): string {
        return this._t;
      },
      set textContent(v: string) {
        this._t = v;
        this.writes++;
      },
    };
    els.set(id, el);
  }
  return { doc: { getElementById: (id: string) => els.get(id) ?? null } as unknown as Document, els };
}

describe('ProbeUI', () => {
  it('throws when the stage or a panel is missing', () => {
    expect(() => new ProbeUI(fakeDoc(PANELS).doc)).toThrow('#stage missing');
    expect(() => new ProbeUI(fakeDoc(['stage', ...PANELS.filter((p) => p !== 'pads')]).doc)).toThrow('#pads missing');
  });

  it('writes panel text only when it changed', () => {
    const { doc, els } = fakeDoc(['stage', ...PANELS]);
    const ui = new ProbeUI(doc);
    ui.set('log', 'a');
    ui.set('log', 'a');
    ui.set('log', 'b');
    expect(els.get('log')?.textContent).toBe('b');
    expect(els.get('log')?.writes).toBe(2);
  });

  it('fit() scales and centers the stage', () => {
    const { doc, els } = fakeDoc(['stage', ...PANELS]);
    new ProbeUI(doc).fit(2560, 1080);
    expect(els.get('stage')?.style).toEqual({ transform: 'scale(1)', left: '320px', top: '0px' });
  });
});

// ------------------------------------------------------------------------------------------------ arena

describe('Arena', () => {
  function makeArena(): { arena: Arena; calls: ReturnType<typeof createRecordingContext2D>['calls'] } {
    const { ctx, calls } = createRecordingContext2D();
    const canvas = { getContext: () => ctx } as unknown as HTMLCanvasElement;
    return { arena: new Arena(canvas), calls };
  }

  it('throws without Canvas2D', () => {
    expect(() => new Arena({ getContext: () => null } as unknown as HTMLCanvasElement)).toThrow('Canvas2D unavailable');
  });

  it('lanes fit the canvas', () => {
    expect(3 * LANE_HEIGHT).toBeLessThanOrEqual(ARENA_HEIGHT);
  });

  it('draws background, lanes, timelines, the frame graph and the flash box', () => {
    const { arena, calls } = makeArena();
    const frames = new FrameStats();
    for (let i = 0; i < 300; i++) frames.push(i % 50 === 0 ? 40 : 16.7);
    const lanes = createLanes(ARENA_WIDTH, LANE_HEIGHT);
    for (let i = 0; i < 100; i++) {
      lanes.raw.step(i % 3 === 0 ? 0 : 4, 0);
      lanes.naive.step(12, 0);
    }
    arena.draw({ lanes, frames, flashFrames: 0, flashLabel: 'ArrowRight' });
    expect(calls[0]).toMatchObject({ op: 'fillRect', args: [0, 0, ARENA_WIDTH, ARENA_HEIGHT] });
    const texts = calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    expect(texts).toEqual(
      expect.arrayContaining([
        'A · raw — held between keydown and keyup',
        'B · debounced — held, or released < 50 ms ago',
        'C · naive — fixed step on every keydown (incl. repeats)',
        'LATENCY FLASH',
        'ArrowRight',
        '16.7',
        '33.3',
      ]),
    );
    expect(calls.filter((c) => c.op === 'fill')).toHaveLength(3); // three ships
    expect(calls.filter((c) => c.op === 'stroke')).toHaveLength(1); // frame graph
    // hitch markers in red for the 40 ms frames within the last 240 (pushes #100, #150, #200, #250)
    expect(calls.filter((c) => c.op === 'fillRect' && c.fillStyle === '#ff4d6d').length).toBe(4);
  });

  it('flash box is white while flashFrames > 0', () => {
    const { arena, calls } = makeArena();
    const lanes = createLanes(ARENA_WIDTH, LANE_HEIGHT);
    const frames = new FrameStats();
    const flashRect = (): unknown =>
      calls.filter((c) => c.op === 'fillRect' && c.args[0] === 580 && c.args[1] === 572).map((c) => c.fillStyle).pop();
    arena.draw({ lanes, frames, flashFrames: 2, flashLabel: 'Enter' });
    expect(flashRect()).toBe('#ffffff');
    arena.draw({ lanes, frames, flashFrames: 0, flashLabel: 'Enter' });
    expect(flashRect()).not.toBe('#ffffff');
  });

  it('draws movement runs as merged rectangles (no per-frame rects)', () => {
    const { arena, calls } = makeArena();
    const lanes = createLanes(ARENA_WIDTH, LANE_HEIGHT);
    for (let i = 0; i < 240; i++) lanes.raw.step(i < 100 || i >= 200 ? 4 : 0, 0); // two runs
    arena.draw({ lanes, frames: new FrameStats(), flashFrames: 0, flashLabel: '' });
    const laneA = calls.filter((c) => c.op === 'fillRect' && c.args[1] === 470 && c.fillStyle === '#4fd1ff');
    expect(laneA).toHaveLength(2);
    const widths = laneA.map((c) => c.args[2]).sort((a, b) => (a as number) - (b as number));
    expect(widths).toEqual([40 * 3, 100 * 3]);
  });
});
