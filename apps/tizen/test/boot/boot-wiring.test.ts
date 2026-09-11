/**
 * Composition-root test for the TV app: bootTizenApp() with a fake window, a fake
 * `window.tizen`, a fake renderer (no WebGL in Node) and a fake AudioContext. Checks the
 * wiring the TV depends on: remote-first input, key registration, Back → exit, audio
 * unlocked without a gesture, visibility → suspend/resume, rAF → fixed ticks → render,
 * and a clean stop().
 */
import type * as AudioWeb from '@shmup/audio-web';
import { Action, type RenderFrame } from '@shmup/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootTizenApp } from '../../src/boot/index.js';

const fakes = vi.hoisted(() => {
  const renderer = {
    width: 384,
    height: 216,
    webGLVersion: 1,
    viewport: { scale: 5, x: 0, y: 0, width: 1920, height: 1080 },
    scene: {},
    frames: [] as Array<{ tick: number; alpha: number }>,
    sizes: [] as Array<[number, number]>,
    destroyed: 0,
    options: null as unknown,
    resize(w: number, h: number) {
      renderer.sizes.push([w, h]);
    },
    render(frame: { tick: number; alpha: number }) {
      renderer.frames.push({ tick: frame.tick, alpha: frame.alpha });
    },
    destroy() {
      renderer.destroyed++;
    },
  };
  const audioContext = {
    state: 'suspended',
    destination: {},
    createGain: () => ({ gain: { value: 1 }, connect: () => undefined, disconnect: () => {} }),
    resume() {
      audioContext.state = 'running';
      return Promise.resolve();
    },
    suspend() {
      audioContext.state = 'suspended';
      return Promise.resolve();
    },
    close() {
      audioContext.state = 'closed';
      return Promise.resolve();
    },
  };
  return { renderer, audioContext };
});

vi.mock('@shmup/render-pixi', () => ({
  createPixiRenderer: (options: unknown) => {
    fakes.renderer.options = options;
    return Promise.resolve(fakes.renderer);
  },
}));

vi.mock('@shmup/audio-web', async (importOriginal) => {
  const real = await importOriginal<typeof AudioWeb>();
  return { createWebAudio: () => real.createWebAudio({ createContext: () => fakes.audioContext }) };
});

const STEP = 1000 / 60;

/** A minimal browser window + document + Tizen API. */
class FakeWindow extends EventTarget {
  innerWidth = 1920;
  innerHeight = 1080;
  readonly document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  readonly navigator: { getGamepads?: () => never[] } = { getGamepads: () => [] };
  readonly stored = new Map<string, string>();
  readonly localStorage = {
    getItem: (key: string): string | null => this.stored.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      this.stored.set(key, value);
    },
  };
  readonly registeredKeys: string[] = [];
  exits = 0;
  readonly tizen = {
    tvinputdevice: {
      registerKey: (name: string) => {
        this.registeredKeys.push(name);
      },
      registerKeyBatch: (names: string[]) => {
        this.registeredKeys.push(...names);
      },
    },
    application: {
      getCurrentApplication: () => ({
        exit: () => {
          this.exits++;
        },
      }),
    },
  };
  private pending: ((now: number) => void) | null = null;
  private nextHandle = 1;
  cancelled = 0;

  requestAnimationFrame(callback: (now: number) => void): number {
    this.pending = callback;
    return this.nextHandle++;
  }

  cancelAnimationFrame(): void {
    this.cancelled++;
    this.pending = null;
  }

  /**
   * Runs the pending animation frame.
   *
   * @param now - rAF timestamp.
   */
  frame(now: number): void {
    const callback = this.pending;
    this.pending = null;
    callback?.(now);
  }

  get hasPendingFrame(): boolean {
    return this.pending !== null;
  }

  /**
   * Flips page visibility.
   *
   * @param state - `hidden` or `visible`.
   */
  setVisibility(state: 'hidden' | 'visible'): void {
    this.document.visibilityState = state;
    this.document.dispatchEvent(new Event('visibilitychange'));
  }

  /**
   * Dispatches a remote key (keyCode only, empty `code`, like the Samsung remote).
   *
   * @param type - Event type.
   * @param keyCode - Legacy key code.
   * @param repeat - Auto-repeat flag.
   */
  key(type: 'keydown' | 'keyup', keyCode: number, repeat = false): Event {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      code: '',
      keyCode,
      repeat,
    });
    this.dispatchEvent(event);
    return event;
  }
}

/** @returns A settled microtask queue (lets `void promise` chains finish). */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

let win: FakeWindow;

beforeEach(() => {
  win = new FakeWindow();
  fakes.renderer.frames.length = 0;
  fakes.renderer.sizes.length = 0;
  fakes.renderer.destroyed = 0;
  fakes.audioContext.state = 'suspended';
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Boots the app into the fake window. */
async function boot() {
  const canvas = {} as HTMLCanvasElement;
  const app = await bootTizenApp(canvas, win as unknown as Window);
  return { app, canvas };
}

describe('tizen/boot bootTizenApp wiring', () => {
  it('creates a WebGL1-first renderer sized to the window', async () => {
    const { canvas } = await boot();
    expect(fakes.renderer.options).toEqual({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      preferWebGLVersion: 1,
    });
  });

  it('builds a remote-first Tizen platform and game (keys registered, autofire forced)', async () => {
    const { app } = await boot();
    expect(app.platform.id).toBe('tizen');
    expect(app.platform.caps).toEqual({ gamepad: true, remoteOnly: true, webgl2: false });
    expect(app.game.config.remoteMode).toBe(true);
    expect(app.game.config.autofire).toBe(true);
    expect(win.registeredKeys).toContain('MediaPlayPause');
    expect(win.registeredKeys).not.toContain('Exit');
  });

  it('unlocks audio immediately (no user gesture on TV)', async () => {
    const { app } = await boot();
    await flush();
    expect(app.audio.state).toBe('running');
  });

  it('drives fixed ticks and rendering from requestAnimationFrame', async () => {
    const { app } = await boot();
    win.frame(1000);
    for (let i = 1; i <= 3; i++) win.frame(1000 + i * STEP);
    expect(app.game.state.tick).toBe(3);
    expect(fakes.renderer.frames.map((frame: RenderFrame) => frame.tick)).toEqual([0, 1, 2, 3]);
  });

  it('delivers remote arrows to player 1 as a remote device', async () => {
    const { app } = await boot();
    win.frame(0);
    win.key('keydown', 38);
    win.frame(STEP);
    const p1 = app.game.state.input?.players[0];
    expect(p1?.held).toBe(Action.Up);
    expect(p1?.device).toBe('remote');
  });

  it('exits the app on Back (the calibration screen is the root screen) and ignores repeats', async () => {
    const { app } = await boot();
    const back = win.key('keydown', 10009);
    expect(back.defaultPrevented).toBe(true);
    win.key('keydown', 10009, true);
    expect(win.exits).toBe(1);
    app.stop();
    win.key('keydown', 10009);
    expect(win.exits).toBe(1);
  });

  it('suspends the game and audio when hidden, clears held input, and resumes cleanly', async () => {
    const { app } = await boot();
    await flush();
    win.frame(0);
    win.key('keydown', 39);
    win.frame(STEP);
    expect(app.game.state.tick).toBe(1);

    win.setVisibility('hidden');
    await flush();
    expect(app.game.state.suspended).toBe(true);
    expect(app.audio.state).toBe('suspended');
    win.frame(10_000); // JS was frozen: no catch-up burst
    expect(app.game.state.tick).toBe(1);

    win.setVisibility('visible');
    await flush();
    expect(app.audio.state).toBe('running');
    win.frame(20_000);
    win.frame(20_000 + STEP);
    expect(app.game.state.tick).toBe(2);
    // The arrow held before the app was hidden must not stick (its keyup was never seen).
    expect(app.game.state.input?.players[0]?.held).toBe(0);
  });

  it('forwards window resizes to the renderer', async () => {
    await boot();
    win.innerWidth = 1280;
    win.innerHeight = 720;
    win.dispatchEvent(new Event('resize'));
    expect(fakes.renderer.sizes).toEqual([[1280, 720]]);
  });

  it('works without the Gamepad API and without window.tizen (desktop dev)', async () => {
    delete win.navigator.getGamepads;
    Object.defineProperty(win, 'tizen', { value: undefined });
    const { app } = await boot();
    expect(app.platform.caps.gamepad).toBe(false);
    expect(app.platform.exit).toBeNull();
    win.key('keydown', 10009); // Back with no exit available: nothing happens
    expect(win.exits).toBe(0);
  });

  it('stop() ends the loop and releases listeners, renderer and audio', async () => {
    const { app } = await boot();
    await flush();
    app.stop();
    await flush();
    expect(win.cancelled).toBe(1);
    expect(win.hasPendingFrame).toBe(false);
    expect(fakes.renderer.destroyed).toBe(1);
    expect(app.audio.state).toBe('closed');
    win.dispatchEvent(new Event('resize'));
    expect(fakes.renderer.sizes).toEqual([]);
    win.key('keydown', 37);
    expect(app.input.keyboard.held).toBe(0);
  });
});
