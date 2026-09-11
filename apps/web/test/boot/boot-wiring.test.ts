/**
 * Composition-root test for the browser app: bootWebApp() with a fake window, a fake
 * renderer (no WebGL in Node) and a fake AudioContext. Checks the wiring: keyboard-first
 * input, audio unlocked by the first user gesture only, visibility → suspend/resume,
 * rAF → fixed ticks → render, resize forwarding, storage fallbacks and a clean stop().
 */
import type * as AudioWeb from '@shmup/audio-web';
import { Action } from '@shmup/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootWebApp } from '../../src/boot/index.js';

const fakes = vi.hoisted(() => {
  const renderer = {
    width: 384,
    height: 216,
    webGLVersion: 2,
    viewport: { scale: 5, x: 0, y: 0, width: 1920, height: 1080 },
    scene: {},
    ticks: [] as number[],
    sizes: [] as Array<[number, number]>,
    destroyed: 0,
    options: null as unknown,
    resize(w: number, h: number) {
      renderer.sizes.push([w, h]);
    },
    render(frame: { tick: number }) {
      renderer.ticks.push(frame.tick);
    },
    destroy() {
      renderer.destroyed++;
    },
  };
  const audioContext = {
    state: 'suspended',
    resumes: 0,
    destination: {},
    createGain: () => ({ gain: { value: 1 }, connect: () => undefined, disconnect: () => {} }),
    resume() {
      audioContext.resumes++;
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

/** A minimal browser window + document. */
class FakeWindow extends EventTarget {
  innerWidth = 1280;
  innerHeight = 720;
  readonly document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  readonly navigator: { getGamepads?: () => never[] } = { getGamepads: () => [] };
  readonly stored = new Map<string, string>();
  storageThrows = false;
  private pending: ((now: number) => void) | null = null;
  cancelled = 0;

  get localStorage() {
    if (this.storageThrows) throw new Error('SecurityError: access denied');
    return {
      getItem: (key: string): string | null => this.stored.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        this.stored.set(key, value);
      },
    };
  }

  requestAnimationFrame(callback: (now: number) => void): number {
    this.pending = callback;
    return 1;
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
   * Dispatches a keyboard event.
   *
   * @param type - Event type.
   * @param code - `KeyboardEvent.code`.
   * @param keyCode - Legacy key code.
   */
  key(type: 'keydown' | 'keyup', code: string, keyCode = 0): void {
    this.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), { code, keyCode, repeat: false }),
    );
  }
}

/** @returns A settled task queue (lets `void promise` chains finish). */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

let win: FakeWindow;

beforeEach(() => {
  win = new FakeWindow();
  fakes.renderer.ticks.length = 0;
  fakes.renderer.sizes.length = 0;
  fakes.renderer.destroyed = 0;
  fakes.audioContext.state = 'suspended';
  fakes.audioContext.resumes = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Boots the app into the fake window. */
async function boot() {
  const canvas = {} as HTMLCanvasElement;
  const app = await bootWebApp(canvas, win as unknown as Window);
  return { app, canvas };
}

describe('web/boot bootWebApp wiring', () => {
  it('creates the renderer for the canvas at the window size', async () => {
    const { canvas } = await boot();
    expect(fakes.renderer.options).toEqual({ canvas, displayWidth: 1280, displayHeight: 720 });
  });

  it('builds a keyboard-first web game (no forced remote mode) with detected capabilities', async () => {
    const { app } = await boot();
    expect(app.game.config.remoteMode).toBe(false);
    expect(app.game.platform.id).toBe('web');
    expect(app.game.platform.exit).toBeNull();
    expect(app.game.platform.caps).toEqual({ gamepad: true, remoteOnly: false, webgl2: true });
    expect(app.game.platform.display.cssWidth).toBe(1280);
    win.innerWidth = 1600;
    expect(app.game.platform.display.cssWidth).toBe(1600);
  });

  it('leaves audio locked until the first key or pointer gesture, then unlocks once', async () => {
    const { app } = await boot();
    await flush();
    expect(app.audio.state).toBe('uninitialized');
    win.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(app.audio.state).toBe('running');
    win.key('keydown', 'KeyQ');
    win.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(fakes.audioContext.resumes).toBe(1);
  });

  it('a keydown gesture unlocks audio too', async () => {
    const { app } = await boot();
    win.key('keydown', 'ArrowUp');
    await flush();
    expect(app.audio.state).toBe('running');
  });

  it('drives fixed ticks and rendering from requestAnimationFrame', async () => {
    const { app } = await boot();
    win.frame(500);
    win.frame(500 + STEP);
    win.frame(500 + 2 * STEP);
    expect(app.game.state.tick).toBe(2);
    expect(fakes.renderer.ticks).toEqual([0, 1, 2]);
  });

  it('delivers keyboard input to player 1 as a keyboard device', async () => {
    const { app } = await boot();
    win.frame(0);
    win.key('keydown', 'KeyZ', 90);
    win.frame(STEP);
    const p1 = app.game.state.input?.players[0];
    expect(p1?.held).toBe(Action.Shot | Action.Confirm);
    expect(p1?.device).toBe('keyboard');
  });

  it('suspends on hidden (clearing held keys and audio) and resumes on visible', async () => {
    const { app } = await boot();
    win.key('keydown', 'ArrowRight');
    await flush();
    win.frame(0);
    win.frame(STEP);
    expect(app.game.state.input?.players[0]?.held).toBe(Action.Right);

    win.setVisibility('hidden');
    await flush();
    expect(app.game.state.suspended).toBe(true);
    expect(app.audio.state).toBe('suspended');
    expect(app.input.keyboard.held).toBe(0);

    win.setVisibility('visible');
    await flush();
    expect(app.game.state.suspended).toBe(false);
    expect(app.audio.state).toBe('running');
  });

  it('forwards resizes to the renderer', async () => {
    await boot();
    win.innerWidth = 1920;
    win.innerHeight = 1080;
    win.dispatchEvent(new Event('resize'));
    expect(fakes.renderer.sizes).toEqual([[1920, 1080]]);
  });

  it('persists through localStorage with the shmup-cup: prefix', async () => {
    const { app } = await boot();
    await app.game.platform.storage.set('options', '{}');
    expect(win.stored.get('shmup-cup:options')).toBe('{}');
  });

  it('boots with memory storage when localStorage access throws, and without the Gamepad API', async () => {
    win.storageThrows = true;
    delete win.navigator.getGamepads;
    const { app } = await boot();
    await app.game.platform.storage.set('k', 'v');
    expect(await app.game.platform.storage.get('k')).toBe('v');
    expect(app.game.platform.caps.gamepad).toBe(false);
  });

  it('stop() ends the loop and removes every listener', async () => {
    const { app } = await boot();
    app.stop();
    await flush();
    expect(win.cancelled).toBe(1);
    expect(fakes.renderer.destroyed).toBe(1);
    expect(app.audio.state).toBe('closed');
    win.dispatchEvent(new Event('resize'));
    win.dispatchEvent(new Event('pointerdown'));
    win.key('keydown', 'ArrowLeft');
    await flush();
    expect(fakes.renderer.sizes).toEqual([]);
    expect(fakes.audioContext.resumes).toBe(0);
    expect(app.input.keyboard.held).toBe(0);
  });
});
