/**
 * The TV debug tools' device line (plan M2-17 — `tizenDebugTools(win, buildId, canvas)` with
 * `device-info`): nothing is collected and `webapis.js` is never requested while the tools are
 * locked; the unlock shows the window's facts at once and the model / firmware once Samsung's
 * script has loaded; `MAX_TEXTURE_SIZE` comes from the renderer's own context (WebGL 1 or 2) and a
 * throwing canvas is tolerated; a full TV line is cut to the panel's width; the snapshot is logged
 * once for the remote inspector.
 */
import { EMPTY_CONTENT_DB, createGame, createHeadlessPlatform } from '@shmup/core';
import { DEBUG_DEVICE_MAX, createLayerStack, type PixiRenderer } from '@shmup/render-pixi';
import type { DebugTools } from '@shmup/shell';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { tizenDebugTools } from '../../src/boot/index.js';
import { WEBAPIS_SCRIPT_URL, type WebapisLike } from '../../src/device-info/index.js';

/**
 * A renderer-like object (no atlas: the overlay exists but draws nothing).
 *
 * @param webGLVersion - The WebGL version it reports.
 * @returns The renderer.
 */
function fakeRenderer(webGLVersion: number): PixiRenderer {
  return {
    atlas: null,
    layers: createLayerStack(),
    webGLVersion,
    drawCalls: -1,
    particles: null,
  } as unknown as PixiRenderer;
}

/** A script element the fake document records. */
interface FakeScript {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

/** A TV window: `keydown` events, `tizen`, a document that records scripts, timers. */
class TvWindow extends EventTarget {
  readonly scripts: FakeScript[] = [];
  readonly tizen = { tvinputdevice: { registerKeyBatch: () => undefined } };
  webapis: WebapisLike | undefined = undefined;
  readonly navigator = {
    userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.5) Chrome/69.0.3497.106 TV Safari/537.36',
  };
  readonly innerWidth = 1920;
  readonly innerHeight = 1080;
  readonly devicePixelRatio = 1;
  readonly document = {
    head: {
      appendChild: (script: FakeScript) => {
        this.scripts.push(script);
      },
    },
    body: null,
    createElement: (): FakeScript => ({ src: '', onload: null, onerror: null }),
  };
  setTimeout(): number {
    return 1;
  }
  clearTimeout(): void {}

  /**
   * Dispatches a remote keydown.
   *
   * @param keyCode - Legacy key code.
   */
  key(keyCode: number): void {
    // M3-02b: the tools track held keys themselves, so a fresh press needs the key-up first.
    this.dispatchEvent(Object.assign(new Event('keyup'), { keyCode, code: '' }));
    const event = Object.assign(new Event('keydown', { cancelable: true }), {
      keyCode,
      code: '',
      repeat: false,
    });
    this.dispatchEvent(event);
  }

  /** Enters Pause, Ch+, Ch+, Ch+. */
  unlock(): void {
    for (const keyCode of [10252, 427, 427, 427]) this.key(keyCode);
  }
}

/** A canvas whose contexts answer `MAX_TEXTURE_SIZE`, recording which context was asked for. */
function fakeCanvas(maxTextureSize: number) {
  const asked: string[] = [];
  const canvas = {
    getContext: (kind: string) => {
      asked.push(kind);
      return { MAX_TEXTURE_SIZE: 0x0d33, getParameter: () => maxTextureSize };
    },
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, asked };
}

let info: MockInstance<typeof console.info>;

beforeEach(() => {
  info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Creates the TV tools on a window.
 *
 * @param win - The window.
 * @param canvas - The game canvas, or `null`.
 * @param webGLVersion - The renderer's WebGL version.
 * @returns The tools and a reader of the panel's value strings.
 */
function create(win: TvWindow, canvas: HTMLCanvasElement | null, webGLVersion = 1) {
  const game = createGame(createHeadlessPlatform(), {}, EMPTY_CONTENT_DB);
  const tools: DebugTools = tizenDebugTools(
    win as unknown as Window,
    'tv1',
    canvas,
  )({
    game,
    renderer: fakeRenderer(webGLVersion),
    win: win as unknown as Window,
    now: () => 0,
    bootMs: 0,
    sceneId: () => 'title',
    visibleWorld: () => null,
  });
  /** @returns The panel's value strings after a frame. */
  const lines = (): string[] => {
    tools.beforeRender();
    return [...tools.overlay.panel.values.strings];
  };
  return { tools, lines };
}

/** Lets the pending promise callbacks run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('tizen/boot debug tools device line (M2-17)', () => {
  it('collects nothing and loads no script while locked', async () => {
    const win = new TvWindow();
    const { canvas, asked } = fakeCanvas(4096);
    const { tools, lines } = create(win, canvas);
    for (let frame = 0; frame < 3; frame++) lines();
    await settle();
    expect(win.scripts).toEqual([]);
    expect(asked).toEqual([]);
    expect(lines().some((text) => text.includes('1920x1080'))).toBe(false);
    expect(info).not.toHaveBeenCalled();
    tools.destroy();
  });

  it("shows the window's facts at once, then the model and firmware once webapis.js loaded", async () => {
    const win = new TvWindow();
    const { canvas, asked } = fakeCanvas(4096);
    const { tools, lines } = create(win, canvas);
    win.unlock();
    expect(asked).toEqual(['webgl']);
    expect(lines()).toContain('? FW ? 1920x1080@1 C69 GL1/4096');
    expect(win.scripts.map((script) => script.src)).toEqual([WEBAPIS_SCRIPT_URL]);
    win.webapis = {
      productinfo: {
        getRealModel: () => 'QN55Q60T',
        getModelCode: () => '20_KANTM2',
        getFirmware: () => 'T-KTM-1',
      },
    };
    win.scripts[0]?.onload?.();
    await settle();
    expect(lines()).toContain('QN55Q60T 20_KANTM2 FW T-KTM-1 1920x1080@1 C69 GL1/4096');
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]?.[0]).toBe('Shmup Cup device');
    expect(info.mock.calls[0]?.[1]).toMatchObject({ model: 'QN55Q60T', maxTextureSize: 4096 });
    // The sequence again toggles the overlay but collects nothing new.
    win.unlock();
    await settle();
    expect(win.scripts).toHaveLength(1);
    expect(info).toHaveBeenCalledTimes(1);
    tools.destroy();
  });

  it('asks the WebGL 2 context of a WebGL 2 renderer', () => {
    const win = new TvWindow();
    const { canvas, asked } = fakeCanvas(16384);
    const { tools, lines } = create(win, canvas, 2);
    win.unlock();
    expect(asked).toEqual(['webgl2']);
    expect(lines()).toContain('? FW ? 1920x1080@1 C69 GL2/16384');
    tools.destroy();
  });

  it('tolerates no canvas and a canvas that throws', () => {
    for (const canvas of [
      null,
      {
        getContext: () => {
          throw new Error('context lost');
        },
      } as unknown as HTMLCanvasElement,
      {} as HTMLCanvasElement,
    ]) {
      const win = new TvWindow();
      const { tools, lines } = create(win, canvas);
      win.unlock();
      expect(lines()).toContain('? FW ? 1920x1080@1 C69 GL1');
      tools.destroy();
    }
  });

  it("cuts a full TV line to the panel's width", async () => {
    const win = new TvWindow();
    win.webapis = {
      productinfo: {
        getRealModel: () => 'LS43AM702UNXZA',
        getModelCode: () => '20_KANTSU2_MONITOR',
        getFirmware: () => 'T-KSU2EUC-1234.5',
      },
    };
    const { canvas } = fakeCanvas(4096);
    const { tools, lines } = create(win, canvas);
    win.unlock();
    await settle();
    const full = 'LS43AM702UNXZA 20_KANTSU2_MONITOR FW T-KSU2EUC-1234.5 1920x1080@1 C69 GL1/4096';
    expect(full.length).toBeGreaterThan(DEBUG_DEVICE_MAX);
    expect(lines()).toContain(full.slice(0, DEBUG_DEVICE_MAX));
    expect(win.scripts).toEqual([]);
    tools.destroy();
  });
});
