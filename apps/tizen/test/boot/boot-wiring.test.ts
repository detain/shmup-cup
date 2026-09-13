/**
 * Composition-root test for the TV app: bootTizenApp() with a fake window, a fake
 * `window.tizen`, fake atlas images, a fake renderer (no WebGL in Node) and a fake
 * AudioContext, booted through the real `@shmup/shell`. Checks the wiring the TV depends on:
 * remote-first input with the data-driven input profiles (D13/D14: `tizen-remote-safe`, its
 * `register` list, the saved choice), key registration, Back through the scene flow (title → exit
 * confirmation; a direct exit only from the boot error screen), audio
 * unlocked without a gesture, visibility → suspend/resume, rAF → fixed ticks → render, and a
 * clean stop().
 */
import type * as AudioWeb from '@shmup/audio-web';
import { Action, SimEventKind, UserOptionKind } from '@shmup/core';
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
      // The game-feel parts of plan M1-14: real screen effects, no particles or popups.
      return Promise.resolve({
        ...fakes.renderer,
        effects: real.createScreenEffects(),
        particles: null,
        popups: null,
        setFxContent: () => {},
        setBulletPalette: () => {},
      });
    },
  };
});

/**
 * A save document (`core/save` v1) that names an input profile.
 *
 * @param profileId - The saved profile id.
 * @returns The stored JSON text.
 */
function savedProfile(profileId: string): string {
  return JSON.stringify({ version: 1, options: { input: { profileId } } });
}

vi.mock('@shmup/audio-web', async (importOriginal) => {
  const real = await importOriginal<typeof AudioWeb>();
  return {
    ...real,
    createWebAudio: () => real.createWebAudio({ createContext: () => fakes.audioContext }),
  };
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
    expect(app.shell.scene).toBe('game'); // the scene flow (title first)
    expect(app.game.scenes).not.toBeNull();
  });

  it('builds a remote-first Tizen platform and game (keys registered, autofire forced)', async () => {
    const { app } = await boot();
    expect(app.platform.id).toBe('tizen');
    expect(app.platform.caps).toEqual({ gamepad: true, remoteOnly: true, webgl2: false });
    expect(app.game.config.remoteMode).toBe(true);
    expect(app.game.config.autofire).toBe(true);
    // START plays zone A (M1-18); the TV has no debug stage skip.
    expect(app.game.config.stage).toBe('zone-a');
    expect(app.game.config.stageSkip).toBe('none');
    expect(win.registeredKeys).toContain('MediaPlayPause');
    expect(win.registeredKeys).not.toContain('Exit');
  });

  it('plays zone A whatever the URL says: no ?stage= / ?skip= on the TV (M1-18)', async () => {
    Object.assign(win, { location: { search: '?stage=test-range&skip=boss' } });
    const { app } = await boot();
    expect(app.game.config.stage).toBe('zone-a');
    expect(app.game.config.stageSkip).toBe('none');
    app.stop();
    // The dev scenes fly in open space.
    Object.assign(win, { location: { search: '?scene=showcase' } });
    const showcase = await boot();
    expect(showcase.app.game.config.stage).toBeNull();
    showcase.app.stop();
    // Content without zone A: START flies in open space.
    Object.assign(win, { location: { search: '' } });
    const app2 = await bootTizenApp(
      {} as HTMLCanvasElement,
      {
        ...resources,
        contentFiles: resources.contentFiles.filter((f) => f.path !== 'stages/zone-a.stage.json'),
      },
      win as unknown as Window,
    );
    expect(app2.game.config.stage).toBeNull();
    app2.stop();
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

  it('resolves remote OK to Confirm on the title, to PowerUp in the game context (D15)', async () => {
    const title = await boot();
    win.frame(0);
    win.frame(STEP);
    win.key('keydown', 13);
    win.frame(2 * STEP);
    expect(title.app.game.state.input?.players[0]?.pressed).toBe(Action.Confirm);
    title.app.stop();
    // Free flight (a dev scene) plays from the first frame: the game context.
    Object.assign(win, { location: { search: '?scene=flight' } });
    const { app } = await boot();
    expect(app.game.config.stage).toBeNull(); // dev scenes fly in open space (M1-18)
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

  it('applies a saved profile choice during boot and registers its keys', async () => {
    win.stored.set('shmup-cup:save.v1', savedProfile('tizen-remote-diagonal'));
    const { app } = await boot();
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

  it('ignores a saved choice that names no remote profile the TV offers', async () => {
    for (const saved of ['gamepad-standard', 'keyboard-default', 'keyboard-remote-emulation']) {
      win = new FakeWindow();
      win.stored.set('shmup-cup:save.v1', savedProfile(saved));
      const { app } = await boot();
      expect(app.input.keyProfile?.id, saved).toBe('tizen-remote-safe');
      expect(win.registeredKeys, saved).toEqual(['MediaPlayPause', 'ChannelUp', 'ChannelDown']);
      app.stop();
    }
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
    Object.assign(win, { location: { search: '?scene=flight&loadout=full' } });
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

  it('Back on the title asks first: the app exits only after YES (the scene flow owns Back)', async () => {
    const { app } = await boot();
    let now = 0;
    /** Runs one displayed frame (one tick after the first). */
    const frame = (): void => {
      win.frame(now);
      now += STEP;
    };
    /**
     * Taps a remote key and lets the release debounce run out.
     *
     * @param keyCode - Legacy key code.
     */
    const tap = (keyCode: number): void => {
      win.key('keydown', keyCode);
      frame();
      win.key('keyup', keyCode);
      for (let i = 0; i < 4; i++) frame();
    };
    frame();
    frame();
    expect(app.game.scenes?.stack.top?.id).toBe('title');
    const back = win.key('keydown', 10009);
    expect(back.defaultPrevented).toBe(true); // the input profile binds it
    frame();
    win.key('keyup', 10009);
    for (let i = 0; i < 4; i++) frame();
    expect(app.game.scenes?.stack.top?.id).toBe('confirm');
    expect(win.exits).toBe(0);
    tap(13); // OK on the default NO
    expect([app.game.scenes?.stack.top?.id, win.exits]).toEqual(['title', 0]);
    tap(10009);
    tap(37); // Left → YES
    expect(win.exits).toBe(0);
    tap(13);
    expect(win.exits).toBe(1);
    // In the game, Back pauses (the remote's game table binds it to Pause); it never exits.
    tap(13); // PRESS OK
    tap(13); // START
    expect(app.game.scenes?.stack.top?.id).toBe('difficulty');
    tap(13); // NORMAL
    expect(app.game.scenes?.stack.top?.id).toBe('game');
    tap(10009);
    expect(app.game.scenes?.stack.top?.id).toBe('pause');
    tap(10009);
    expect(app.game.scenes?.stack.top?.id).toBe('game');
    expect(win.exits).toBe(1);
    app.stop();
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
  it('a saved choice equal to the default re-registers nothing', async () => {
    win.stored.set('shmup-cup:save.v1', savedProfile('tizen-remote-safe'));
    const { app } = await boot();
    expect(app.input.keyProfile?.id).toBe('tizen-remote-safe');
    expect(win.registeredKeys).toEqual(['MediaPlayPause', 'ChannelUp', 'ChannelDown']);
  });

  it('offers the remote profiles in the Options screen', async () => {
    const { app } = await boot();
    expect(app.game.scenes!.inputProfiles).toEqual([
      { id: 'tizen-remote-safe', label: 'SAFE 4-WAY (DEFAULT)' },
      { id: 'tizen-remote-diagonal', label: 'FAST 8-WAY' },
    ]);
    expect(app.game.scenes!.activeInputProfile).toBe(0);
  });

  it('an Options change switches the profile while running, even mid-hold, and registers keys', async () => {
    const { app } = await boot();
    win.frame(0);
    win.key('keydown', 39);
    win.frame(STEP);
    app.game.events.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, 1);
    win.frame(1.5 * STEP); // drains the event (no tick yet)
    expect(app.input.keyProfile?.id).toBe('tizen-remote-diagonal');
    expect(win.registeredKeys).toHaveLength(6);
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

describe('tizen/boot saves and the Options screen (M1-17 edge)', () => {
  /** The next frame's rAF time. */
  let at = 0;

  /**
   * Runs frames (one tick each).
   *
   * @param frames - Frames to run.
   */
  function frames(frames: number): void {
    for (let i = 0; i < frames; i++) {
      win.frame(at);
      at += STEP;
    }
  }

  /**
   * Presses and releases a remote key (the safe profile debounces the release by 2 ticks).
   *
   * @param keyCode - Legacy key code.
   */
  function tap(keyCode: number): void {
    win.key('keydown', keyCode);
    frames(3);
    win.key('keyup', keyCode);
    frames(6);
  }

  beforeEach(() => {
    at = 0;
  });

  it('an Options pick of the profile in use neither switches nor registers keys', async () => {
    const { app } = await boot();
    const before = app.input.keyProfile;
    app.game.events.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, 0);
    frames(1);
    expect(app.input.keyProfile).toBe(before);
    expect(win.registeredKeys).toEqual(['MediaPlayPause', 'ChannelUp', 'ChannelDown']);
  });

  it('a saved FAST 8-WAY shows as the active choice and can be switched back', async () => {
    win.stored.set('shmup-cup:save.v1', savedProfile('tizen-remote-diagonal'));
    const { app } = await boot();
    expect(app.game.scenes!.activeInputProfile).toBe(1);
    app.game.events.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, 0);
    frames(1);
    expect(app.input.keyProfile?.id).toBe('tizen-remote-safe');
    expect(app.input.keyProfile?.releaseDebounceTicks).toBe(2);
  });

  it('a corrupt save boots the title with defaults and is kept aside', async () => {
    win.stored.set('shmup-cup:save.v1', '{"version":1,"options":');
    const { app } = await boot();
    expect(app.shell.loadedSave.status).toBe('corrupt');
    expect(win.stored.get('shmup-cup:save.corrupt')).toBe('{"version":1,"options":');
    expect(app.input.keyProfile?.id).toBe('tizen-remote-safe');
    expect(app.game.scenes!.save.options.audio).toEqual({ master: 10, music: 10, sfx: 10 });
  });

  it('remote only: change SFX and CONTROLS, Back saves; a relaunch keeps both', async () => {
    const first = await boot();
    frames(2);
    tap(13); // PRESS OK → menu
    tap(40); // OPTIONS
    tap(13);
    frames(2);
    const flow = first.app.game.scenes!;
    expect(flow.stack.top?.id).toBe('options');
    tap(40);
    tap(40); // SFX
    tap(37); // 10 → 9
    tap(37); // → 8
    tap(40); // CONTROLS
    tap(39); // → FAST 8-WAY (applied live)
    expect(first.app.input.keyProfile?.id).toBe('tizen-remote-diagonal');
    expect(win.stored.has('shmup-cup:save.v1')).toBe(false); // written when the screen closes
    win.key('keydown', 10009); // Back: save and close (never an exit here)
    frames(2);
    win.key('keyup', 10009);
    frames(2);
    expect(flow.stack.top?.id).toBe('title');
    expect(win.exits).toBe(0);
    await flush();
    const stored = JSON.parse(win.stored.get('shmup-cup:save.v1') ?? '{}') as {
      options: { audio: { sfx: number }; input: { profileId: string } };
    };
    expect(stored.options.audio.sfx).toBe(8);
    expect(stored.options.input.profileId).toBe('tizen-remote-diagonal');
    first.app.stop();

    // Relaunch on the same storage (Tizen keeps localStorage until uninstall).
    const kept = win.stored;
    win = new FakeWindow();
    for (const [key, value] of kept) win.stored.set(key, value);
    const second = await boot();
    expect(second.app.input.keyProfile?.id).toBe('tizen-remote-diagonal');
    expect(second.app.game.scenes!.save.options.audio.sfx).toBe(8);
    expect(second.app.game.scenes!.activeInputProfile).toBe(1);
  });
});
