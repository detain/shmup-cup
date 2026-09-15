/**
 * The TV environment facts (plan M2-17, `device-info`) with fakes: the snapshot from the window,
 * the renderer's WebGL context and Samsung's `webapis.productinfo` (missing methods, a missing
 * privilege's `SecurityError` and empty answers tolerated), the overlay line, and the loading of
 * `$WEBAPIS/webapis/webapis.js` — only in a Tizen web app, once, with a timeout.
 */
import { describe, expect, it } from 'vitest';
import {
  WEBAPIS_SCRIPT_URL,
  collectDeviceInfo,
  formatDeviceLine,
  loadWebapis,
  moduleInfo,
  parseChromeMajor,
  readMaxTextureSize,
  readProductInfo,
  type WebapisLike,
} from '../../src/device-info/index.js';

const TIZEN_UA =
  'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.106.1/5.5 TV Safari/537.36';
const TIZEN_UA_CHROME =
  'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/3.0 Chrome/69.0.3497.106 TV Safari/537.36';

const gl = {
  MAX_TEXTURE_SIZE: 0x0d33,
  getParameter: (name: number) => (name === 0x0d33 ? 4096 : 0),
};

const webapis: WebapisLike = {
  productinfo: {
    getRealModel: () => 'LS43AM702UNXZA',
    getModel: () => 'LS43AM702U',
    getModelCode: () => '20_KANTSU2',
    getFirmware: () => 'T-KSU2EUC-1234.5',
  },
};

describe('tizen/device-info', () => {
  it('is implemented', () => {
    expect(moduleInfo.name).toBe('device-info');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('collects the snapshot from the window, the WebGL context and webapis.productinfo', () => {
    const info = collectDeviceInfo({
      userAgent: TIZEN_UA_CHROME,
      innerWidth: 1920,
      innerHeight: 1080,
      devicePixelRatio: 1,
      webglVersion: 1,
      gl,
      webapis,
    });
    expect(info).toEqual({
      userAgent: TIZEN_UA_CHROME,
      chromeMajor: 69,
      cssWidth: 1920,
      cssHeight: 1080,
      devicePixelRatio: 1,
      webglVersion: 1,
      maxTextureSize: 4096,
      model: 'LS43AM702UNXZA',
      modelCode: '20_KANTSU2',
      firmware: 'T-KSU2EUC-1234.5',
    });
    expect(Object.isFrozen(info)).toBe(true);
    expect(formatDeviceLine(info)).toBe(
      'LS43AM702UNXZA 20_KANTSU2 FW T-KSU2EUC-1234.5 1920x1080@1 C69 GL1/4096',
    );
  });

  it('tolerates a desktop browser: no webapis, no WebGL', () => {
    const info = collectDeviceInfo({
      userAgent: 'Mozilla/5.0 Firefox/130.0',
      innerWidth: 1280,
      innerHeight: 720,
      devicePixelRatio: 2,
      webglVersion: 0,
      gl: null,
      webapis: null,
    });
    expect(info).toMatchObject({
      chromeMajor: null,
      webglVersion: null,
      maxTextureSize: null,
      model: null,
      modelCode: null,
      firmware: null,
    });
    expect(formatDeviceLine(info)).toBe('? FW ? 1280x720@2 C? GL-');
  });

  it('parses the Chrome version of Tizen user agents', () => {
    expect(parseChromeMajor(TIZEN_UA_CHROME)).toBe(69);
    expect(parseChromeMajor('Mozilla/5.0 Chromium/120.0 Safari/537.36')).toBe(120);
    // The Tizen 5.5 UA without a Chrome token.
    expect(parseChromeMajor(TIZEN_UA)).toBeNull();
    expect(parseChromeMajor('')).toBeNull();
  });

  it('reads product info defensively (missing privilege, missing methods, empty answers)', () => {
    const denied: WebapisLike = {
      productinfo: {
        getRealModel: () => {
          throw new Error('SecurityError');
        },
        getModel: () => 'UJS9500',
        getModelCode: () => '   ',
        getFirmware: () => 42 as unknown as string,
      },
    };
    expect(readProductInfo(denied)).toEqual({ model: 'UJS9500', modelCode: null, firmware: null });
    expect(readProductInfo({})).toEqual({ model: null, modelCode: null, firmware: null });
    expect(readProductInfo(null)).toEqual({ model: null, modelCode: null, firmware: null });
    expect(readProductInfo({ productinfo: {} })).toEqual({
      model: null,
      modelCode: null,
      firmware: null,
    });
  });

  it('reads MAX_TEXTURE_SIZE defensively', () => {
    expect(readMaxTextureSize(gl)).toBe(4096);
    expect(readMaxTextureSize(null)).toBeNull();
    expect(readMaxTextureSize({ MAX_TEXTURE_SIZE: 1, getParameter: () => null })).toBeNull();
    expect(
      readMaxTextureSize({
        MAX_TEXTURE_SIZE: 1,
        getParameter: () => {
          throw new Error('context lost');
        },
      }),
    ).toBeNull();
  });
});

/** A fake window whose document records the scripts added. */
function fakeWindow(options: { tizen?: boolean; webapis?: WebapisLike } = {}) {
  const scripts: Array<{ src: string; onload: (() => void) | null; onerror: (() => void) | null }> =
    [];
  const timers: Array<{ callback: () => void; ms: number; cleared: boolean }> = [];
  const win = {
    tizen: options.tizen === true ? {} : undefined,
    webapis: options.webapis,
    document: {
      head: {
        appendChild: (script: (typeof scripts)[number]) => {
          scripts.push(script);
        },
      },
      body: null,
      createElement: () => ({ src: '', onload: null, onerror: null }),
    },
    setTimeout: (callback: () => void, ms: number) => {
      timers.push({ callback, ms, cleared: false });
      return timers.length;
    },
    clearTimeout: (handle: number) => {
      const timer = timers[handle - 1];
      if (timer !== undefined) timer.cleared = true;
    },
  };
  return { win, scripts, timers };
}

describe('tizen/device-info loadWebapis', () => {
  it('requests nothing outside a Tizen web app', async () => {
    const { win, scripts } = fakeWindow();
    expect(await loadWebapis(win as unknown as Window)).toBeNull();
    expect(scripts).toEqual([]);
  });

  it('uses window.webapis when it is already there', async () => {
    const { win, scripts } = fakeWindow({ tizen: true, webapis });
    expect(await loadWebapis(win as unknown as Window)).toBe(webapis);
    expect(scripts).toEqual([]);
  });

  it('adds the $WEBAPIS script once and resolves with window.webapis when it loads', async () => {
    const { win, scripts, timers } = fakeWindow({ tizen: true });
    const first = loadWebapis(win as unknown as Window);
    const second = loadWebapis(win as unknown as Window);
    expect(second).toBe(first);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.src).toBe(WEBAPIS_SCRIPT_URL);
    win.webapis = webapis;
    scripts[0]?.onload?.();
    expect(await first).toBe(webapis);
    expect(timers[0]?.cleared).toBe(true);
  });

  it('resolves with null when the script fails or times out', async () => {
    const failing = fakeWindow({ tizen: true });
    const failed = loadWebapis(failing.win as unknown as Window);
    failing.scripts[0]?.onerror?.();
    expect(await failed).toBeNull();

    const slow = fakeWindow({ tizen: true });
    const waiting = loadWebapis(slow.win as unknown as Window, 500);
    expect(slow.timers[0]?.ms).toBe(500);
    slow.timers[0]?.callback();
    expect(await waiting).toBeNull();
    // A late load after the timeout changes nothing.
    slow.scripts[0]?.onload?.();
  });
});
