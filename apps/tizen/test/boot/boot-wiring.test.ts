/**
 * Composition-root test for the TV app: bootTizenApp() with a fake window, a fake
 * `window.tizen`, fake atlas images, a fake renderer (no WebGL in Node) and a fake
 * AudioContext, booted through the real `@shmup/shell`. Checks the wiring the TV depends on:
 * remote-first input with the data-driven input profiles (D13/D14: `tizen-remote-safe`, its
 * `register` list, the saved choice), key registration, Back → exit (also from the boot error screen), audio
 * unlocked without a gesture, visibility → suspend/resume, rAF → fixed ticks → render, and a
 * clean stop().
 */
import type * as AudioWeb from '@shmup/audio-web';
import { Action, type PlatformStorage } from '@shmup/core';
import type * as InputWeb from '@shmup/input-web';
import type * as RenderPixi from '@shmup/render-pixi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import { bootTizenApp, type TizenAppResources } from '../../src/boot/index.js';
import { REMOTE_KEYS_TO_REGISTER } from '../../src/platform/index.js';

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
    options: null as Record<string, unknown> | null,
    setSpriteNames() {},
    bindWorld() {},
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

vi.mock('@shmup/render-pixi', async (importOriginal) => {
  const real = await importOriginal<typeof RenderPixi>();
  return {
    ...real,
    createPixiRenderer: (options: Record<string, unknown>) => {
      fakes.renderer.options = options;
      return Promise.resolve(fakes.renderer);
    },
  };
});

/**
 * Lets a test hold back the saved profile choice (`loadInputProfileChoice`) until it releases
 * the gate — the real storage answers within the same task. `null` = no gate.
 */
const choiceGate = vi.hoisted(() => ({ wait: null as Promise<void> | null }));

vi.mock('@shmup/input-web', async (importOriginal) => {
  const real = await importOriginal<typeof InputWeb>();
  return {
    ...real,
    loadInputProfileChoice: (storage: PlatformStorage) =>
      choiceGate.wait === null
        ? real.loadInputProfileChoice(storage)
        : choiceGate.wait.then(() => real.loadInputProfileChoice(storage)),
  };
});

vi.mock('@shmup/audio-web', async (importOriginal) => {
  const real = await importOriginal<typeof AudioWeb>();
  return { createWebAudio: () => real.createWebAudio({ createContext: () => fakes.audioContext }) };
});

const STEP = 1000 / 60;
const { manifest } = buildAtlas();
const resources: TizenAppResources = {
  contentFiles: readContentFiles(),
  assets: { manifest, pageUrls: manifest.pages.map((page) => `assets/atlas/${page.file}`) },
};

/** Stand-in for `Image`: "loads" asynchronously with the atlas page size. */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 0;
  height = 0;
  naturalWidth = 0;
  naturalHeight = 0;
  private url = '';

  get src(): string {
    return this.url;
  }

  set src(value: string) {
    this.url = value;
    const page = manifest.pages.find((p) => value.endsWith(p.file));
    setTimeout(() => {
      this.width = this.naturalWidth = page?.w ?? 1;
      this.height = this.naturalHeight = page?.h ?? 1;
      this.onload?.();
    }, 0);
  }
}

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
  vi.stubGlobal('Image', FakeImage);
  win = new FakeWindow();
  choiceGate.wait = null;
  fakes.renderer.options = null;
  fakes.renderer.frames.length = 0;
  fakes.renderer.sizes.length = 0;
  fakes.renderer.destroyed = 0;
  fakes.audioContext.state = 'suspended';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Boots the app into the fake window. */
async function boot() {
  const canvas = {} as HTMLCanvasElement;
  const app = await bootTizenApp(canvas, resources, win as unknown as Window);
  return { app, canvas };
}

describe('tizen/boot bootTizenApp wiring', () => {
  it('creates a WebGL1-first renderer sized to the window, with the atlas', async () => {
    const { app, canvas } = await boot();
    expect(fakes.renderer.options).toMatchObject({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      preferWebGLVersion: 1,
      testPattern: false,
      atlas: app.shell.atlas,
    });
    expect(app.shell.scene).toBe('flight');
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

  it('applies tizen-remote-safe and gamepad-standard, registering the profile keys only', async () => {
    const { app } = await boot();
    expect(app.profiles.issues).toEqual([]);
    expect(app.input.keyProfile?.id).toBe('tizen-remote-safe');
    expect(app.input.keyProfile?.releaseDebounceTicks).toBe(2);
    expect(app.input.gamepadProfile?.id).toBe('gamepad-standard');
    expect(app.input.keyboard.tuning.releaseDebounceTicks).toBe(2);
    expect(win.registeredKeys).toEqual(['MediaPlayPause', 'ChannelUp', 'ChannelDown']);
  });

  it('resolves remote OK to PowerUp in the game context (D15) and debounces its release', async () => {
    const { app } = await boot();
    win.frame(0);
    win.key('keydown', 13);
    win.frame(STEP);
    expect(app.game.state.input?.players[0]?.pressed).toBe(Action.PowerUp);
    win.key('keyup', 13);
    win.frame(2 * STEP);
    win.frame(3 * STEP);
    expect(app.game.state.input?.players[0]?.held).toBe(Action.PowerUp); // debounce: 2 polls
    win.frame(4 * STEP);
    expect(app.game.state.input?.players[0]?.held).toBe(0);
  });

  it('applies a saved profile choice once storage answers and registers its keys', async () => {
    win.stored.set('shmup-cup:input.profile', 'tizen-remote-diagonal');
    const { app } = await boot();
    await flush();
    expect(app.input.keyProfile?.id).toBe('tizen-remote-diagonal');
    expect(app.input.keyboard.tuning.releaseDebounceTicks).toBe(0);
    expect(win.registeredKeys).toEqual([
      'MediaPlayPause',
      'ChannelUp',
      'ChannelDown',
      'MediaPlayPause',
      'ChannelUp',
      'ChannelDown',
    ]);
  });

  it('ignores a saved choice that names no remote or keyboard profile', async () => {
    win.stored.set('shmup-cup:input.profile', 'gamepad-standard');
    const { app } = await boot();
    await flush();
    expect(app.input.keyProfile?.id).toBe('tizen-remote-safe');
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
    expect(fakes.renderer.frames.map((frame) => frame.tick)).toEqual([0, 1, 2, 3]);
  });

  it('autofires with no key held and ignores the web-only ?loadout=full (M1-10)', async () => {
    // A development build opened with the web app's dev override must not power up the TV game.
    Object.assign(win, { location: { search: '?loadout=full' } });
    const { app } = await boot();
    expect(app.game.config.loadout).toBe('default');
    const world = app.game.world;
    expect(world.weapons.loadouts[0].options).toBe(0);
    win.frame(0);
    // The 40-tick fly-in, then remote rule 1: the main shot fires without any button.
    for (let i = 1; i <= 60; i++) win.frame(i * STEP);
    expect(app.game.state.tick).toBe(60);
    expect(app.game.state.input?.players[0]?.held).toBe(0);
    expect(world.players[0].state).toBe('alive');
    expect(world.weapons.countShots(0, 0)).toBeGreaterThan(0);
    expect(world.weapons.options[0].count).toBe(0);
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

  it('exits the app on Back (free flight is the root screen) and ignores repeats', async () => {
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

  it('Back still exits from the boot error screen (boot failed before the platform existed)', async () => {
    const broken: TizenAppResources = {
      ...resources,
      contentFiles: [
        ...resources.contentFiles,
        { path: 'player/zz.player.json', data: { formatVersion: 1, kind: 'player' } },
      ],
    };
    await expect(
      bootTizenApp({} as HTMLCanvasElement, broken, win as unknown as Window),
    ).rejects.toThrow(/CONTENT ERRORS/);
    expect(fakes.renderer.options).toBeNull();
    win.key('keydown', 10009);
    expect(win.exits).toBe(1);
  });
});

describe('tizen/boot input profiles (edge cases)', () => {
  /**
   * A gate for the saved choice.
   *
   * @returns The function that opens it.
   */
  function gate(): () => void {
    let open = (): void => {};
    choiceGate.wait = new Promise<void>((resolve) => {
      open = resolve;
    });
    return open;
  }

  it('a saved choice equal to the default re-registers nothing', async () => {
    win.stored.set('shmup-cup:input.profile', 'tizen-remote-safe');
    const { app } = await boot();
    await flush();
    expect(app.input.keyProfile?.id).toBe('tizen-remote-safe');
    expect(win.registeredKeys).toEqual(['MediaPlayPause', 'ChannelUp', 'ChannelDown']);
  });

  it('a saved keyboard profile is applied on the TV but registers no keys', async () => {
    win.stored.set('shmup-cup:input.profile', 'keyboard-remote-emulation');
    const { app } = await boot();
    await flush();
    expect(app.input.keyProfile?.id).toBe('keyboard-remote-emulation');
    expect(win.registeredKeys).toEqual(['MediaPlayPause', 'ChannelUp', 'ChannelDown']);
  });

  it('a saved choice that arrives after stop() is neither applied nor registered', async () => {
    const open = gate();
    win.stored.set('shmup-cup:input.profile', 'tizen-remote-diagonal');
    const { app } = await boot();
    app.stop();
    open();
    await flush();
    expect(app.input.keyProfile?.id).toBe('tizen-remote-safe');
    expect(win.registeredKeys).toEqual(['MediaPlayPause', 'ChannelUp', 'ChannelDown']);
  });

  it('a late saved choice replaces the default while running, even mid-hold', async () => {
    const open = gate();
    win.stored.set('shmup-cup:input.profile', 'tizen-remote-diagonal');
    const { app } = await boot();
    win.frame(0);
    win.key('keydown', 39);
    win.frame(STEP);
    open();
    await flush();
    expect(app.input.keyProfile?.id).toBe('tizen-remote-diagonal');
    win.frame(2 * STEP);
    const p1 = app.game.state.input?.players[0];
    expect(p1?.held).toBe(Action.Right); // same bindings: the held arrow keeps moving
    expect(p1?.pressed).toBe(0);
    win.key('keyup', 39);
    win.frame(3 * STEP);
    expect(app.game.state.input?.players[0]?.held).toBe(0); // debounce 0 now
  });

  it('without input-profiles content: fallback key list, built-in remote bindings', async () => {
    const bare: TizenAppResources = {
      ...resources,
      contentFiles: resources.contentFiles.filter((file) => !file.path.startsWith('input/')),
    };
    const app = await bootTizenApp({} as HTMLCanvasElement, bare, win as unknown as Window);
    expect(app.profiles.profiles).toEqual([]);
    expect(app.input.keyProfile).toBeNull();
    expect(app.input.gamepadProfile).toBeNull();
    expect(win.registeredKeys).toEqual([...REMOTE_KEYS_TO_REGISTER]);
    win.frame(0);
    win.key('keydown', 13);
    win.frame(STEP);
    const p1 = app.game.state.input?.players[0];
    expect(p1?.held).toBe(Action.Confirm | Action.PowerUp); // keymap defaults
    expect(p1?.device).toBe('remote');
  });

  it('remote OK is Confirm once the game asks for the menu context', async () => {
    const { app } = await boot();
    let context: 'game' | 'menu' = 'game';
    Object.defineProperty(app.game, 'inputContext', { get: () => context });
    win.frame(0);
    context = 'menu';
    win.frame(STEP); // the shell forwards the switch at the start of the frame
    expect(app.input.context).toBe('menu');
    win.key('keydown', 13);
    win.frame(2 * STEP);
    expect(app.game.state.input?.players[0]?.pressed).toBe(Action.Confirm);
  });

  it('an invalid input-profiles file stops the boot; Back still exits', async () => {
    const broken: TizenAppResources = {
      ...resources,
      contentFiles: [
        ...resources.contentFiles,
        {
          path: 'input/zz.input-profiles.json',
          data: { formatVersion: 1, kind: 'input-profiles', profiles: [] },
        },
      ],
    };
    await expect(
      bootTizenApp({} as HTMLCanvasElement, broken, win as unknown as Window),
    ).rejects.toThrow(/CONTENT ERRORS/);
    expect(win.registeredKeys).toEqual([]);
    win.key('keydown', 10009);
    expect(win.exits).toBe(1);
  });
});
