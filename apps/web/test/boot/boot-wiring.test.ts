/**
 * Composition-root test for the browser app: bootWebApp() with a fake window, fake atlas
 * images, a fake renderer (no WebGL in Node) and a fake AudioContext, booted through the real
 * `@shmup/shell`. Checks the wiring: keyboard-first input, audio unlocked by the first user
 * gesture only, visibility → suspend/resume, rAF → fixed ticks → render, resize forwarding,
 * storage fallbacks, the `?scene=` switch, the `?stage=` dev stage (M1-07), the input profiles
 * (`keyboard-default`, the `?profile=` / `?debounce=` dev overrides, the saved choice) and a
 * clean stop().
 */
import type * as AudioWeb from '@shmup/audio-web';
import { Action, SimEventKind, UserOptionKind } from '@shmup/core';
import type * as RenderPixi from '@shmup/render-pixi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import {
  bootWebApp,
  contentStageIds,
  inputOverridesFromSearch,
  loadoutFromSearch,
  stageFromSearch,
  stageSkipFromSearch,
  type WebAppResources,
} from '../../src/boot/index.js';

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
    options: null as Record<string, unknown> | null,
    spriteNames: [] as Array<readonly string[]>,
    setSpriteNames(names: readonly string[]) {
      renderer.spriteNames.push(names);
    },
    bindWorld() {},
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
        setScaleMode: () => {},
        setShowHitbox: () => {},
        interpolation: false,
        setInterpolation(this: { interpolation: boolean }, on: boolean) {
          this.interpolation = on;
        },
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
const resources: WebAppResources = {
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

/** A minimal browser window + document. */
class FakeWindow extends EventTarget {
  innerWidth = 1280;
  innerHeight = 720;
  readonly document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  readonly navigator: { getGamepads?: () => never[] } = { getGamepads: () => [] };
  readonly location = { search: '' };
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
  vi.stubGlobal('Image', FakeImage);
  win = new FakeWindow();
  fakes.renderer.options = null;
  fakes.renderer.spriteNames.length = 0;
  fakes.renderer.ticks.length = 0;
  fakes.renderer.sizes.length = 0;
  fakes.renderer.destroyed = 0;
  fakes.audioContext.state = 'suspended';
  fakes.audioContext.resumes = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Boots the app into the fake window. */
async function boot() {
  const canvas = {} as HTMLCanvasElement;
  const app = await bootWebApp(canvas, resources, win as unknown as Window);
  return { app, canvas };
}

describe('web/boot bootWebApp wiring', () => {
  it('creates the renderer for the canvas at the window size, with the atlas', async () => {
    const { app, canvas } = await boot();
    expect(fakes.renderer.options).toMatchObject({
      canvas,
      displayWidth: 1280,
      displayHeight: 720,
      preferWebGLVersion: 1,
      testPattern: false,
      atlas: app.shell.atlas,
    });
    expect(app.shell.atlas.manifest).toBe(manifest);
  });

  it('runs the scene flow by default, free flight with ?scene=flight, the test pattern with ?scene=calibration', async () => {
    const { app } = await boot();
    expect(app.shell.scene).toBe('game');
    expect(app.game.scenes?.stack.top?.id).toBe('boot'); // finished: the title on the first tick
    expect(app.game.scenes?.boot.done).toBe(true);
    expect(app.input.context).toBe('menu');
    app.stop();
    win = new FakeWindow();
    win.location.search = '?scene=flight';
    const flight = await boot();
    expect(flight.app.shell.scene).toBe('flight');
    expect(flight.app.game.scenes).toBeNull();
    flight.app.stop();
    win = new FakeWindow();
    win.location.search = '?scene=calibration';
    const calibration = await boot();
    expect(calibration.app.shell.scene).toBe('calibration');
    expect(fakes.renderer.options?.testPattern).toBe(true);
  });

  it('Enter on the title and on START starts the game; Esc pauses it (keyboard-default)', async () => {
    const { app } = await boot();
    let now = 0;
    /** Runs one displayed frame. */
    const frame = (): void => {
      win.frame(now);
      now += STEP;
    };
    /**
     * Taps a key over two frames.
     *
     * @param code - `KeyboardEvent.code`.
     * @param keyCode - Legacy key code.
     */
    const tap = (code: string, keyCode: number): void => {
      win.key('keydown', code, keyCode);
      frame();
      win.key('keyup', code, keyCode);
      frame();
    };
    frame();
    frame();
    expect(app.game.scenes?.stack.top?.id).toBe('title');
    tap('Enter', 13);
    tap('Enter', 13); // START → the difficulty menu
    expect(app.game.scenes?.stack.top?.id).toBe('difficulty');
    tap('Enter', 13); // NORMAL (buffered by the menu's open lock)
    frame();
    expect(app.game.scenes?.stack.top?.id).toBe('shipSelect');
    tap('Enter', 13); // KESTREL in the ship select (M2-05; buffered by its lock)
    frame();
    expect(app.game.scenes?.stack.top?.id).toBe('weaponSelect');
    tap('Enter', 13); // START in the weapon select (M2-03; buffered by its lock too)
    frame();
    expect(app.game.scenes?.stack.top?.id).toBe('game');
    frame();
    expect(app.input.context).toBe('game');
    tap('Escape', 27);
    expect(app.game.scenes?.stack.top?.id).toBe('pause');
    expect(app.game.platform.exit).toBeNull(); // no EXIT item in a browser
    expect(app.game.scenes?.title.menu.items.map((item) => item.label)).toEqual([
      '1 PLAYER',
      '2 PLAYERS',
      'PRACTICE',
      'OPTIONS',
      'SOUND TEST',
    ]);
  });

  it('runs the game on the validated content', async () => {
    const { app } = await boot();
    expect(app.shell.content.issues).toEqual([]);
    expect(app.game.content.ships.length).toBeGreaterThan(0);
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
    win.location.search = '?scene=flight';
    const { app } = await boot();
    win.frame(0);
    win.key('keydown', 'KeyZ', 90);
    win.frame(STEP);
    const p1 = app.game.state.input?.players[0];
    expect(p1?.held).toBe(Action.Shot); // keyboard-default, game context (D15)
    expect(p1?.device).toBe('keyboard');
  });

  it('applies keyboard-default and gamepad-standard from the content by default', async () => {
    const { app } = await boot();
    expect(app.profiles.issues).toEqual([]);
    expect(app.profiles.profiles.map((profile) => profile.id)).toContain('tizen-remote-safe');
    expect(app.input.keyProfile?.id).toBe('keyboard-default');
    expect(app.input.gamepadProfile?.id).toBe('gamepad-standard');
    expect(app.input.context).toBe('menu'); // the scene flow starts on its boot / title screens
  });

  it('?profile= picks a key profile and ?debounce= overrides its release debounce', async () => {
    win.location.search = '?profile=keyboard-remote-emulation&debounce=0';
    const { app } = await boot();
    expect(app.input.keyProfile?.id).toBe('keyboard-remote-emulation');
    expect(app.input.keyboard.tuning).toMatchObject({
      releaseDebounceTicks: 0,
      diagonals: 'lastWins',
      socd: 'lastWins',
    });
    win.frame(0);
    win.key('keydown', 'ArrowRight', 39);
    win.key('keydown', 'ArrowUp', 38);
    win.frame(STEP);
    const p1 = app.game.state.input?.players[0];
    expect(p1?.held).toBe(Action.Up); // the second arrow replaces the first, like the remote
    expect(p1?.device).toBe('remote');
  });

  it('warns about an unknown ?profile= and falls back to keyboard-default', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    win.location.search = '?profile=nope';
    const { app } = await boot();
    expect(app.input.keyProfile?.id).toBe('keyboard-default');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"nope"'));
  });

  it('runs the ?stage= stage: scrolling camera, the stage name in the HUD', async () => {
    win.location.search = '?scene=flight&stage=test-range';
    const { app } = await boot();
    expect(app.game.config.stage).toBe('test-range');
    expect(app.game.world.stage?.stage.id).toBe('test-range');
    expect(app.shell.flight?.world.terrain).not.toBeNull();
    for (let i = 0; i <= 90; i++) win.frame(i * STEP);
    expect(app.game.world.camera.x).toBeGreaterThan(20);
  });

  it('starts fully powered with ?loadout=full (M1-10), the default loadout otherwise', async () => {
    win.location.search = '?loadout=full';
    const { app } = await boot();
    expect(app.game.config.loadout).toBe('full');
    expect(app.game.world.weapons.loadouts[0].options).toBe(4);
    app.stop();
    win = new FakeWindow();
    const plain = await boot();
    expect(plain.app.game.config.loadout).toBe('default');
    expect(plain.app.game.world.weapons.loadouts[0].options).toBe(0);
  });

  it('plays zone A in the scene flow by default; ?scene=flight keeps open space (M1-18)', async () => {
    const { app } = await boot();
    expect(app.game.config.stage).toBe('zone-a');
    expect(app.game.config.stageSkip).toBe('none');
    app.stop();
    win = new FakeWindow();
    win.location.search = '?scene=flight';
    const flight = await boot();
    expect(flight.app.game.config.stage).toBeNull();
    expect(flight.app.game.world.stage).toBeNull();
  });

  it('starts every game a little before the boss with ?skip=boss (M1-18)', async () => {
    win.location.search = '?scene=flight&stage=zone-a&skip=boss';
    const { app } = await boot();
    expect(app.game.config.stageSkip).toBe('boss');
    const warning = app.game.world.stage?.stage.events.find((e) => e.type === 'warning');
    expect(warning).toBeDefined();
    expect(app.game.world.camera.x).toBeGreaterThan((warning?.x ?? 0) - 200);
  });

  it('plays zone A from START and skips to its boss with ?skip=boss in the scene flow (M1-18)', async () => {
    win.location.search = '?skip=boss';
    const { app } = await boot();
    expect(app.game.config).toMatchObject({ stage: 'zone-a', stageSkip: 'boss' });
    let now = 0;
    /** Runs one displayed frame. */
    const frame = (): void => {
      win.frame(now);
      now += STEP;
    };
    /** Taps Enter over two frames. */
    const enter = (): void => {
      win.key('keydown', 'Enter', 13);
      frame();
      win.key('keyup', 'Enter', 13);
      frame();
    };
    frame();
    frame();
    expect(app.game.scenes?.stack.top?.id).toBe('title');
    enter();
    enter(); // START → the difficulty menu
    enter(); // NORMAL (buffered by the menu's open lock)
    frame();
    expect(app.game.scenes?.stack.top?.id).toBe('shipSelect');
    enter(); // KESTREL in the ship select (M2-05)
    frame();
    expect(app.game.scenes?.stack.top?.id).toBe('weaponSelect');
    enter(); // START in the weapon select (M2-03)
    frame();
    expect(app.game.scenes?.stack.top?.id).toBe('game');
    const world = app.game.world;
    expect(world.stage?.stage.id).toBe('zone-a');
    const warning = world.stage?.stage.events.find((e) => e.type === 'warning');
    expect(world.camera.x).toBeGreaterThanOrEqual((warning?.x ?? 0) - 96);
    expect(world.camera.x).toBeLessThan(warning?.x ?? 0);
  });

  it('keeps open space in the dev scenes and ignores ?skip= on a stage without a boss (M1-18)', async () => {
    for (const scene of ['showcase', 'calibration', 'fx-gallery']) {
      win = new FakeWindow();
      win.location.search = `?scene=${scene}&skip=boss`;
      const { app } = await boot();
      expect(app.game.config.stage, scene).toBeNull();
      app.stop();
    }
    win = new FakeWindow();
    win.location.search = '?scene=flight&stage=test-range&skip=boss';
    const { app } = await boot();
    expect(app.game.config).toMatchObject({ stage: 'test-range', stageSkip: 'boss' });
    expect(app.game.world.stage?.stage.id).toBe('test-range');
    expect(app.game.world.camera.x).toBe(0);
  });

  it('flies in open space when the content has no zone A (M1-18)', async () => {
    const withoutZoneA: WebAppResources = {
      ...resources,
      // Without zone A — and so without the campaign that starts there (M2-10) and its demo
      // (M2-15).
      contentFiles: resources.contentFiles.filter(
        (f) =>
          f.path !== 'stages/zone-a.stage.json' &&
          f.path !== 'campaign/main.campaign.json' &&
          f.path !== 'demos/zone-a.replay.json',
      ),
    };
    const app = await bootWebApp({} as HTMLCanvasElement, withoutZoneA, win as unknown as Window);
    expect(app.game.config.stage).toBeNull();
    app.stop();
  });

  it('warns about an unknown ?stage= and flies in open space', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    win.location.search = '?stage=nope';
    const { app } = await boot();
    expect(app.game.config.stage).toBeNull();
    expect(app.game.world.stage).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no stage "nope"'));
  });

  it('applies the saved profile choice unless ?profile= overrides it', async () => {
    win.stored.set('shmup-cup:save.v1', savedProfile('keyboard-remote-emulation'));
    const saved = await boot();
    expect(saved.app.input.keyProfile?.id).toBe('keyboard-remote-emulation');
    saved.app.stop();

    win = new FakeWindow();
    win.stored.set('shmup-cup:save.v1', savedProfile('keyboard-remote-emulation'));
    win.location.search = '?profile=tizen-remote-safe';
    const overridden = await boot();
    await flush();
    expect(overridden.app.input.keyProfile?.id).toBe('tizen-remote-safe');
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

describe('web/boot loadoutFromSearch', () => {
  it('reads the last known ?loadout= value (M1-10 dev override)', () => {
    expect(loadoutFromSearch('?loadout=full')).toBe('full');
    expect(loadoutFromSearch('stage=test-range&loadout=full')).toBe('full');
    expect(loadoutFromSearch('?loadout=full&loadout=default')).toBe('default');
    expect(loadoutFromSearch('?loadout=full&loadout=bogus')).toBe('full');
    expect(loadoutFromSearch('?loadout=')).toBeNull();
    expect(loadoutFromSearch('?loadout')).toBeNull();
    expect(loadoutFromSearch('')).toBeNull();
  });

  it('matches name and value exactly (case, extra "=", empty pairs, other parameters)', () => {
    expect(loadoutFromSearch('?LOADOUT=full')).toBeNull();
    expect(loadoutFromSearch('?loadout=Full')).toBeNull();
    expect(loadoutFromSearch('?loadout=full=1')).toBeNull();
    expect(loadoutFromSearch('?xloadout=full&loadoutx=full')).toBeNull();
    expect(loadoutFromSearch('?&&loadout=full&')).toBe('full');
    expect(loadoutFromSearch('?loadout=full&loadout=')).toBe('full');
    expect(loadoutFromSearch('?stage=test-range&profile=x&loadout=default')).toBe('default');
    expect(loadoutFromSearch('?')).toBeNull();
  });
});

describe('web/boot stageSkipFromSearch', () => {
  it('reads the last known ?skip= value exactly (M1-18 debug stage skip)', () => {
    expect(stageSkipFromSearch('?skip=boss')).toBe('boss');
    expect(stageSkipFromSearch('stage=zone-a&skip=boss')).toBe('boss');
    expect(stageSkipFromSearch('?skip=boss&skip=none')).toBe('none');
    expect(stageSkipFromSearch('?skip=boss&skip=bogus')).toBe('boss');
    expect(stageSkipFromSearch('?skip=Boss')).toBeNull();
    expect(stageSkipFromSearch('?SKIP=boss')).toBeNull();
    expect(stageSkipFromSearch('?skip=')).toBeNull();
    expect(stageSkipFromSearch('?skip')).toBeNull();
    expect(stageSkipFromSearch('')).toBeNull();
  });

  it('is not percent-decoded and ignores empty pairs and look-alike keys', () => {
    expect(stageSkipFromSearch('?skip=%62oss')).toBeNull();
    expect(stageSkipFromSearch('?skip=boss=1')).toBeNull();
    expect(stageSkipFromSearch('?skip= boss')).toBeNull();
    expect(stageSkipFromSearch('?skipper=boss&xskip=boss')).toBeNull();
    expect(stageSkipFromSearch('?&&skip=boss&')).toBe('boss');
    expect(stageSkipFromSearch('skip=none')).toBe('none');
    expect(stageSkipFromSearch('??skip=boss')).toBeNull(); // the key is "?skip"
  });
});

describe('web/boot stageFromSearch / contentStageIds', () => {
  it('reads the last non-empty, decodable ?stage= value', () => {
    expect(stageFromSearch('?stage=test-range')).toBe('test-range');
    expect(stageFromSearch('scene=flight&stage=a&stage=b')).toBe('b');
    expect(stageFromSearch('?stage=a&stage=')).toBe('a');
    expect(stageFromSearch('?stage=%E0%A4%A&x=1')).toBeNull();
    expect(stageFromSearch('?stage=zone%2Da')).toBe('zone-a');
    expect(stageFromSearch('?stage')).toBeNull();
    expect(stageFromSearch('')).toBeNull();
  });

  it('lists the ids of the stage files among the content files', () => {
    expect(contentStageIds(readContentFiles())).toContain('test-range');
    expect(
      contentStageIds([
        { path: 'a', data: { kind: 'stage', id: 'x' } },
        { path: 'b', data: { kind: 'player', id: 'y' } },
        { path: 'c', data: { kind: 'stage' } },
        { path: 'd', data: null },
      ]),
    ).toEqual(['x']);
  });
});

describe('web/boot inputOverridesFromSearch', () => {
  it('reads ?profile= and ?debounce=', () => {
    expect(inputOverridesFromSearch('?profile=keyboard-remote-emulation&debounce=2')).toEqual({
      profile: 'keyboard-remote-emulation',
      debounce: 2,
    });
    expect(inputOverridesFromSearch('scene=calibration&debounce=10')).toEqual({
      profile: null,
      debounce: 10,
    });
    expect(inputOverridesFromSearch('')).toEqual({ profile: null, debounce: null });
  });

  it('ignores empty profiles, bad debounce values and undecodable pairs', () => {
    expect(inputOverridesFromSearch('?profile=&debounce=11')).toEqual({
      profile: null,
      debounce: null,
    });
    expect(inputOverridesFromSearch('?debounce=-1&debounce=1.5&profile=%E0%A4%A')).toEqual({
      profile: null,
      debounce: null,
    });
    expect(inputOverridesFromSearch('?profile=tizen%2Dremote%2Dsafe&debounce')).toEqual({
      profile: 'tizen-remote-safe',
      debounce: null,
    });
  });
});

describe('web/boot input profiles (edge cases)', () => {
  /**
   * Boots with some content files left out.
   *
   * @param keep - Which content files to keep.
   */
  async function bootWith(keep: (path: string) => boolean) {
    const canvas = {} as HTMLCanvasElement;
    return bootWebApp(
      canvas,
      { ...resources, contentFiles: resources.contentFiles.filter((file) => keep(file.path)) },
      win as unknown as Window,
    );
  }

  it('?profile= naming a gamepad profile is not a key profile: warn, use keyboard-default', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    win.location.search = '?profile=gamepad-standard';
    const { app } = await boot();
    expect(app.input.keyProfile?.id).toBe('keyboard-default');
    expect(app.input.gamepadProfile?.id).toBe('gamepad-standard');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/"gamepad-standard".*using keyboard-default/);
  });

  it('a valid ?profile= logs nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    win.location.search = '?profile=keyboard-default';
    await boot();
    expect(warn).not.toHaveBeenCalled();
  });

  it('?profile=tizen-remote-safe lets a desktop keyboard act as the remote (keyCode fallback)', async () => {
    win.location.search = '?scene=flight&profile=tizen-remote-safe';
    const { app } = await boot();
    expect(app.input.keyboard.tuning.releaseDebounceTicks).toBe(2);
    win.frame(0);
    win.key('keydown', 'Enter', 13); // desktop Enter → keyCode 13 = OK = PowerUp in the game
    win.frame(STEP);
    const p1 = app.game.state.input?.players[0];
    expect(p1?.pressed).toBe(Action.PowerUp);
    expect(p1?.device).toBe('remote');
    win.key('keydown', 'KeyZ', 90); // not a remote key: ignored
    win.frame(2 * STEP);
    expect(app.game.state.input?.players[0]?.held).toBe(Action.PowerUp);
  });

  it('?debounce= also applies to the saved choice', async () => {
    win.stored.set('shmup-cup:save.v1', savedProfile('keyboard-remote-emulation'));
    win.location.search = '?debounce=5';
    const { app } = await boot();
    expect(app.input.keyProfile?.id).toBe('keyboard-remote-emulation');
    expect(app.input.keyProfile?.releaseDebounceTicks).toBe(5);
    expect(app.input.keyboard.tuning.releaseDebounceTicks).toBe(5);
  });

  it('ignores a saved choice that is unknown, a gamepad profile or not offered in a browser', async () => {
    for (const saved of ['no-such-profile', 'gamepad-standard', 'tizen-remote-safe']) {
      win = new FakeWindow();
      win.stored.set('shmup-cup:save.v1', savedProfile(saved));
      const { app } = await boot();
      expect(app.input.keyProfile?.id, saved).toBe('keyboard-default');
      app.stop();
    }
  });

  it('offers the keyboard profiles in the Options screen and switches live', async () => {
    const { app } = await boot();
    const flow = app.game.scenes!;
    expect(flow.inputProfiles).toEqual([
      { id: 'keyboard-default', label: 'KEYBOARD (DEFAULT)' },
      { id: 'keyboard-remote-emulation', label: 'KEYBOARD AS REMOTE' },
      { id: 'keyboard-split', label: 'SPLIT KEYBOARD' }, // M2-06
    ]);
    expect(flow.activeInputProfile).toBe(0);
    // The Options screen's change reaches the input adapter through the event dispatch.
    app.game.events.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, 1);
    win.frame(0);
    expect(app.input.keyProfile?.id).toBe('keyboard-remote-emulation');
  });

  it('offers a ?profile= override in use in the Options screen too', async () => {
    win.location.search = '?profile=tizen-remote-safe';
    const { app } = await boot();
    expect(app.game.scenes!.inputProfiles.map((p) => p.id)).toEqual([
      'keyboard-default',
      'keyboard-remote-emulation',
      'keyboard-split',
      'tizen-remote-safe',
    ]);
    expect(app.game.scenes!.activeInputProfile).toBe(3);
  });

  it('boots on the built-in bindings when the content has no input profiles', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    win.location.search = '?profile=keyboard-default';
    const app = await bootWith((path) => !path.startsWith('input/'));
    expect(app.profiles.profiles).toEqual([]);
    expect(app.input.keyProfile).toBeNull();
    expect(app.input.gamepadProfile).toBeNull();
    expect(warn.mock.calls[0]?.[0]).toMatch(/using the built-in bindings/);
    win.frame(0);
    win.key('keydown', 'KeyZ', 90);
    win.frame(STEP);
    expect(app.game.state.input?.players[0]?.held).toBe(Action.Shot | Action.Confirm);
  });

  it('switches keyboard X from Sub to Back when the game asks for the menu context', async () => {
    const { app } = await boot();
    let context: 'game' | 'menu' = 'game';
    Object.defineProperty(app.game, 'inputContext', { get: () => context });
    win.frame(0);
    win.key('keydown', 'KeyX', 88);
    win.frame(STEP);
    expect(app.game.state.input?.players[0]?.pressed).toBe(Action.Sub);
    win.key('keyup', 'KeyX', 88);
    context = 'menu';
    win.frame(2 * STEP);
    expect(app.input.context).toBe('menu');
    win.key('keydown', 'KeyX', 88);
    win.frame(3 * STEP);
    expect(app.game.state.input?.players[0]?.pressed).toBe(Action.Back);
  });
});

describe('web/boot inputOverridesFromSearch (edge cases)', () => {
  it('keeps the last valid value of a repeated parameter', () => {
    expect(inputOverridesFromSearch('?profile=a&profile=b&debounce=1&debounce=3')).toEqual({
      profile: 'b',
      debounce: 3,
    });
    // Invalid later values do not erase an earlier valid one.
    expect(inputOverridesFromSearch('?profile=a&profile=&debounce=2&debounce=x')).toEqual({
      profile: 'a',
      debounce: 2,
    });
  });

  it('accepts leading zeros and the 0 and 10 bounds, nothing signed or spaced', () => {
    expect(inputOverridesFromSearch('debounce=007').debounce).toBe(7);
    expect(inputOverridesFromSearch('debounce=0').debounce).toBe(0);
    expect(inputOverridesFromSearch('debounce=10').debounce).toBe(10);
    for (const bad of ['+2', '2e0', ' 2', '%202', '0x2', '1e1', '']) {
      expect(inputOverridesFromSearch(`debounce=${bad}`).debounce, bad).toBeNull();
    }
  });

  it('decodes values but not names, and tolerates empty pairs and a bare "?"', () => {
    expect(inputOverridesFromSearch('?').profile).toBeNull();
    expect(inputOverridesFromSearch('&&profile=x&&').profile).toBe('x');
    expect(inputOverridesFromSearch('%70rofile=x').profile).toBeNull();
    expect(inputOverridesFromSearch('profile=a%20b').profile).toBe('a b');
    expect(inputOverridesFromSearch('profile=a=b').profile).toBe('a=b');
    expect(inputOverridesFromSearch('Profile=x&DEBOUNCE=2')).toEqual({
      profile: null,
      debounce: null,
    });
  });
});

describe('web/boot saves and the Options screen (M1-17 edge)', () => {
  it('a player pick in the Options screen wins over a ?profile= override', async () => {
    win.location.search = '?profile=tizen-remote-safe';
    const { app } = await boot();
    expect(app.input.keyProfile?.id).toBe('tizen-remote-safe');
    // CONTROLS: keyboard-default (DEFAULT), keyboard-remote-emulation, keyboard-split,
    // tizen-remote-safe.
    app.game.events.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, 0);
    win.frame(0);
    expect(app.input.keyProfile?.id).toBe('keyboard-default');
    // ... and the override stays offered: it can be picked again.
    app.game.events.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, 3);
    win.frame(1000 / 60);
    expect(app.input.keyProfile?.id).toBe('tizen-remote-safe');
  });

  it('a pick out of the choice range changes nothing', async () => {
    const { app } = await boot();
    app.game.events.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, 5);
    win.frame(0);
    expect(app.input.keyProfile?.id).toBe('keyboard-default');
  });

  it('a pick keeps the ?debounce= override', async () => {
    win.location.search = '?debounce=4';
    const { app } = await boot();
    app.game.events.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, 1);
    win.frame(0);
    expect(app.input.keyProfile?.id).toBe('keyboard-remote-emulation');
    expect(app.input.keyboard.tuning.releaseDebounceTicks).toBe(4);
  });

  it('reads a corrupt save as defaults and keeps a copy under shmup-cup:save.corrupt', async () => {
    win.stored.set('shmup-cup:save.v1', 'not json at all');
    const { app } = await boot();
    expect(app.shell.loadedSave.status).toBe('corrupt');
    expect(win.stored.get('shmup-cup:save.corrupt')).toBe('not json at all');
    expect(app.input.keyProfile?.id).toBe('keyboard-default');
    await flush();
    expect(win.stored.get('shmup-cup:save.v1')).toBe('not json at all'); // until the next write
  });

  it('the save the flow plays with is the shell’s, on the prefixed localStorage', async () => {
    win.stored.set(
      'shmup-cup:save.v1',
      JSON.stringify({ version: 1, hiScores: { 'meter-normal': [{ score: 12345 }] } }),
    );
    const { app } = await boot();
    const flow = app.game.scenes!;
    expect(flow.save).toBe(app.shell.save);
    expect(flow.hiScore).toBe(12345);
    flow.save.count('gamesStarted');
    expect(await flow.save.flush()).toBe(true);
    const stored = JSON.parse(win.stored.get('shmup-cup:save.v1') ?? '{}') as {
      stats: { gamesStarted: number };
    };
    expect(stored.stats.gamesStarted).toBe(1);
  });
});

describe('web/boot rebinding (M2-16)', () => {
  /** A version-2 save with the player's keyboard and pad rebinding, SOCD and debounce. */
  const REBOUND = JSON.stringify({
    version: 2,
    options: {
      input: {
        profileId: null,
        socd: 'lastWins',
        releaseDebounce: 3,
        bindings: {
          'keyboard-default': { game: { Shot: ['code:KeyJ'] } },
          'gamepad-standard': { game: { PowerUp: ['button:6'] } },
        },
      },
    },
  });

  it('applies the saved rebinding, SOCD and debounce at boot; J shoots in the game', async () => {
    win.stored.set('shmup-cup:save.v1', REBOUND);
    win.location.search = '?scene=flight'; // the game context from the first frame
    const { app } = await boot();
    const keys = app.input.keyProfile;
    expect(keys?.id).toBe('keyboard-default');
    expect([keys?.tables.game.keys.byCode.KeyJ, keys?.tables.game.keys.byCode.KeyZ]).toEqual([
      Action.Shot,
      0,
    ]);
    expect(app.input.keyboard.tuning).toMatchObject({ releaseDebounceTicks: 3, socd: 'lastWins' });
    expect(app.input.gamepadProfile?.tables.game.buttons[6]).toBe(Action.PowerUp);
    expect(app.input.gamepadProfile?.releaseDebounceTicks).toBe(0);
    win.frame(0);
    win.key('keydown', 'KeyJ', 74);
    win.frame(STEP);
    expect(app.game.state.input?.players[0]?.held).toBe(Action.Shot);
    // A dev scene has no scene flow (no rebind screen).
    expect(app.game.scenes).toBeNull();
  });

  it('?debounce= still overrides the saved debounce (a dev override)', async () => {
    win.stored.set('shmup-cup:save.v1', REBOUND);
    win.location.search = '?debounce=0';
    const { app } = await boot();
    expect(app.input.keyboard.tuning).toMatchObject({ releaseDebounceTicks: 0, socd: 'lastWins' });
    // The rebinding still applies.
    expect(app.input.keyProfile?.tables.game.keys.byCode.KeyJ).toBe(Action.Shot);
  });

  it('a profile switch applies that profile’s own rebinding (none) with the player’s SOCD', async () => {
    win.stored.set('shmup-cup:save.v1', REBOUND);
    const { app } = await boot();
    win.frame(0);
    app.game.events.push(SimEventKind.UserOption, UserOptionKind.InputProfile, 0, 0, 1);
    win.frame(STEP);
    const emulation = app.input.keyProfile;
    expect(emulation?.id).toBe('keyboard-remote-emulation');
    expect(emulation?.tables.game.keys.byCode.KeyJ).toBeUndefined();
    expect(emulation?.releaseDebounceTicks).toBe(3);
    // The rebind screen gets both devices: the key profile in use and the gamepad.
    const page = app.game.scenes!.controlsPage;
    expect([page.deviceIndex(false), page.deviceIndex(true)]).toEqual([0, 1]);
  });
});
