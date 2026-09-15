/**
 * Edge cases of the TV environment facts (plan M2-17, `device-info`) with fakes: Samsung getters
 * that need their object as `this`, fallbacks and trimming of the product answers, odd WebGL
 * answers, the overlay line's parts, and `loadWebapis` on windows without a document or `<head>`,
 * with a `null` `webapis`, the default timeout and the one load a window ever starts.
 */
import { describe, expect, it } from 'vitest';
import {
  WEBAPIS_SCRIPT_URL,
  WEBAPIS_TIMEOUT_MS,
  collectDeviceInfo,
  formatDeviceLine,
  loadWebapis,
  readMaxTextureSize,
  readProductInfo,
  type DeviceInfoSources,
  type WebapisLike,
} from '../../src/device-info/index.js';

const SOURCES: DeviceInfoSources = {
  userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) Chrome/76.0.3809.146 TV Safari/537.36',
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 1,
  webglVersion: 1,
  gl: null,
  webapis: null,
};

/** Samsung's product API as a class whose getters read their own fields (need `this`). */
class ProductInfo {
  private readonly real = 'QN55Q60TAFXZA';
  private readonly code = '20_KANTM2_QTV';
  private readonly firmware = 'T-KTMAKUC-1560.3';
  getRealModel(): string {
    return this.real;
  }
  getModelCode(): string {
    return this.code;
  }
  getFirmware(): string {
    return this.firmware;
  }
}

describe('tizen/device-info product info edges', () => {
  it('calls the getters as methods of their object', () => {
    expect(readProductInfo({ productinfo: new ProductInfo() })).toEqual({
      model: 'QN55Q60TAFXZA',
      modelCode: '20_KANTM2_QTV',
      firmware: 'T-KTMAKUC-1560.3',
    });
  });

  it('falls back to getModel when getRealModel answers nothing, and trims the answers', () => {
    const webapis: WebapisLike = {
      productinfo: {
        getRealModel: () => '',
        getModel: () => '  UJS9500  ',
        getModelCode: () => '\t15_HAWKP\n',
        getFirmware: () => ' T-HKPAKUC-1234.5 ',
      },
    };
    expect(readProductInfo(webapis)).toEqual({
      model: 'UJS9500',
      modelCode: '15_HAWKP',
      firmware: 'T-HKPAKUC-1234.5',
    });
    // A getter that is not a function is a missing one.
    const odd = { productinfo: { getRealModel: 'QN55' } } as unknown as WebapisLike;
    expect(readProductInfo(odd).model).toBeNull();
    expect(readProductInfo({ productinfo: null } as unknown as WebapisLike).model).toBeNull();
  });

  it('keeps odd WebGL answers out: fractions floored, zero, negative and non-numbers dropped', () => {
    const answer = (value: unknown) => ({ MAX_TEXTURE_SIZE: 1, getParameter: () => value });
    expect(readMaxTextureSize(answer(4096.7))).toBe(4096);
    expect(readMaxTextureSize(answer(0))).toBeNull();
    expect(readMaxTextureSize(answer(-1))).toBeNull();
    expect(readMaxTextureSize(answer('4096'))).toBeNull();
    expect(readMaxTextureSize(answer(Number.NaN))).toBeNull();
  });

  it('keeps only WebGL versions 1 and 2', () => {
    for (const [version, expected] of [
      [1, 1],
      [2, 2],
      [0, null],
      [3, null],
      [null, null],
      [1.5, null],
    ] as const) {
      expect(collectDeviceInfo({ ...SOURCES, webglVersion: version }).webglVersion).toBe(expected);
    }
  });
});

describe('tizen/device-info overlay line edges', () => {
  it('shows the model without a code, a fractional pixel ratio and a WebGL 2 context', () => {
    const info = collectDeviceInfo({
      ...SOURCES,
      devicePixelRatio: 1.5,
      webglVersion: 2,
      gl: { MAX_TEXTURE_SIZE: 7, getParameter: () => 8192 },
      webapis: { productinfo: { getModel: () => 'UJS9500', getFirmware: () => 'T-1' } },
    });
    expect(formatDeviceLine(info)).toBe('UJS9500 FW T-1 1920x1080@1.5 C76 GL2/8192');
  });

  it('shows the code without a model and a WebGL version without its texture size', () => {
    const info = collectDeviceInfo({
      ...SOURCES,
      webapis: { productinfo: { getModelCode: () => '22_PONTUSM' } },
    });
    expect(formatDeviceLine(info)).toBe('? 22_PONTUSM FW ? 1920x1080@1 C76 GL1');
  });
});

/**
 * A fake Tizen window whose document records the scripts added.
 *
 * @param options - What the document has.
 * @returns The window and its records.
 */
function tizenWindow(options: { head?: boolean; document?: boolean; webapis?: null } = {}) {
  const appended: Array<{ to: string; script: { src: string; onload: (() => void) | null } }> = [];
  const timers: number[] = [];
  const parent = (to: string) => ({
    appendChild: (script: { src: string; onload: (() => void) | null }) => {
      appended.push({ to, script });
    },
  });
  const win: Record<string, unknown> = {
    tizen: {},
    webapis: options.webapis,
    setTimeout: (_callback: () => void, ms: number) => {
      timers.push(ms);
      return timers.length;
    },
    clearTimeout: () => undefined,
  };
  if (options.document !== false) {
    win.document = {
      head: options.head === false ? null : parent('head'),
      body: parent('body'),
      createElement: () => ({ src: '', onload: null, onerror: null }),
    };
  }
  return { win: win as unknown as Window, appended, timers };
}

describe('tizen/device-info loadWebapis edges', () => {
  it('adds the script to <body> when there is no <head>, with the default timeout', async () => {
    const { win, appended, timers } = tizenWindow({ head: false });
    const load = loadWebapis(win);
    expect(appended.map((entry) => entry.to)).toEqual(['body']);
    expect(appended[0]?.script.src).toBe(WEBAPIS_SCRIPT_URL);
    expect(timers).toEqual([WEBAPIS_TIMEOUT_MS]);
    expect(WEBAPIS_TIMEOUT_MS).toBe(3000);
    appended[0]?.script.onload?.();
    expect(await load).toBeNull();
  });

  it('loads the script when window.webapis is null (not only undefined)', () => {
    const { win, appended } = tizenWindow({ webapis: null });
    void loadWebapis(win);
    expect(appended).toHaveLength(1);
  });

  it('resolves null without a document to add the script to', async () => {
    const { win } = tizenWindow({ document: false });
    await expect(loadWebapis(win)).resolves.toBeNull();
  });

  it('starts one load per window, ever: a settled load is shared too', async () => {
    const { win, appended } = tizenWindow();
    const first = loadWebapis(win);
    appended[0]?.script.onload?.();
    expect(await first).toBeNull();
    const again = loadWebapis(win);
    expect(again).toBe(first);
    expect(appended).toHaveLength(1);
    // Another window loads for itself.
    const other = tizenWindow();
    void loadWebapis(other.win);
    expect(other.appended).toHaveLength(1);
  });

  it('prefers a webapis that appeared meanwhile over the pending load', async () => {
    const { win, appended } = tizenWindow();
    const pending = loadWebapis(win);
    const webapis: WebapisLike = { productinfo: {} };
    (win as unknown as { webapis: WebapisLike }).webapis = webapis;
    expect(await loadWebapis(win)).toBe(webapis);
    appended[0]?.script.onload?.();
    expect(await pending).toBe(webapis);
  });
});
