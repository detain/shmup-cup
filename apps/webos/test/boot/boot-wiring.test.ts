/**
 * Composition-root test for the LG webOS app (plan M3-03): `bootWebosApp()` with a fake window, a
 * fake `window.webOS`, fake atlas images, a fake renderer (no WebGL in Node) and a fake
 * AudioContext, booted through the real `@shmup/shell`.
 *
 * It checks what makes this host *different* from the Tizen one — the `webos-remote-safe` profile,
 * Back on key code **461**, exit through `webOS.platformBack()`, and the fact that nothing
 * registers keys — plus the wiring both TVs share (audio unlocked without a gesture, visibility
 * and focus → suspend/resume, rAF → fixed ticks → render, a clean stop). Everything is a fake:
 * this app has never run on hardware.
 *
 * @module
 */
import type * as AudioWeb from '@shmup/audio-web';
import {
  DEFAULT_WEBOS_PROFILE_ID,
  inputProfileChoices,
  selectableKeyProfiles,
} from '@shmup/input-web';
import type * as RenderPixi from '@shmup/render-pixi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import { bootWebosApp, type WebosAppResources } from '../../src/boot/index.js';

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
    warmUps: 0,
    warmUp() {
      renderer.warmUps++;
    },
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

vi.mock('@shmup/audio-web', async (importOriginal) => {
  const real = await importOriginal<typeof AudioWeb>();
  return {
    ...real,
    createWebAudio: () => real.createWebAudio({ createContext: () => fakes.audioContext }),
  };
});

const STEP = 1000 / 60;
const { manifest } = buildAtlas();
const resources: WebosAppResources = {
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

/** A minimal browser window + document + `window.webOS`. */
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
  backs = 0;
  closes = 0;
  readonly webOS = {
    platformBack: (): void => {
      this.backs++;
    },
  };
  private pending: ((now: number) => void) | null = null;
  private nextHandle = 1;
  cancelled = 0;

  close(): void {
    this.closes++;
  }

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
   * Dispatches a remote key (keyCode only, empty `code`, like an LG Magic Remote).
   *
   * @param type - Event type.
   * @param keyCode - Legacy key code.
   * @returns The dispatched event (so a test can read `defaultPrevented`).
   */
  key(type: 'keydown' | 'keyup', keyCode: number): Event {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      code: '',
      keyCode,
      repeat: false,
    });
    this.dispatchEvent(event);
    return event;
  }
}

/** @returns A settled microtask queue (lets `void promise` chains finish). */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A save document (`core/save` v1) that names an input profile.
 *
 * @param profileId - The saved profile id.
 * @returns The stored JSON text.
 */
function savedProfile(profileId: string): string {
  return JSON.stringify({ version: 1, options: { input: { profileId } } });
}

let win: FakeWindow;

beforeEach(() => {
  vi.stubGlobal('Image', FakeImage);
  win = new FakeWindow();
  fakes.renderer.options = null;
  fakes.renderer.frames.length = 0;
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
  const app = await bootWebosApp(canvas, resources, win as unknown as Window);
  return { app, canvas };
}

describe('webos/boot bootWebosApp wiring (M3-03)', () => {
  it('creates a WebGL1 renderer sized to the window, with the atlas and the scene flow', async () => {
    const { app, canvas } = await boot();
    expect(fakes.renderer.options).toMatchObject({
      canvas,
      displayWidth: 1920,
      displayHeight: 1080,
      preferWebGLVersion: 1,
      atlas: app.shell.atlas,
    });
    expect(app.shell.scene).toBe('game');
    expect(app.platform.id).toBe('webos');
    app.stop();
  });

  it('applies webos-remote-safe, not the Tizen profile', async () => {
    const { app } = await boot();
    expect(app.input.keyProfile?.id).toBe('webos-remote-safe');
    expect(app.profiles.profiles.map((p) => p.id)).toContain('tizen-remote-safe');
    app.stop();
  });

  it('offers only the webOS remote in CONTROLS — never the Tizen one (its Back is 10009)', async () => {
    const { app } = await boot();
    // The list the Options screen's CONTROLS row is built from, filtered by the profile's `hosts`.
    const choices = inputProfileChoices(
      app.profiles.profiles,
      'keyCode',
      DEFAULT_WEBOS_PROFILE_ID,
      null,
      'webos',
    );
    expect(choices).toEqual([{ id: 'webos-remote-safe', label: 'REMOTE (DEFAULT)' }]);
    // Without the filter both TVs' remotes would be offered — that is what `hosts` prevents.
    expect(
      inputProfileChoices(app.profiles.profiles, 'keyCode', DEFAULT_WEBOS_PROFILE_ID).map(
        (c) => c.id,
      ),
    ).toEqual(['tizen-remote-safe', 'webos-remote-safe']);
    app.stop();
  });

  it('runs the game with remoteMode and forced autofire, audio unlocked without a gesture', async () => {
    const { app } = await boot();
    expect(app.game.config.remoteMode).toBe(true);
    expect(app.game.config.autofire).toBe(true);
    await flush();
    expect(fakes.audioContext.state).toBe('running');
    app.stop();
  });

  it('gives Back (461) to the scene flow once the game runs — the title asks before exiting', async () => {
    const { app } = await boot();
    let now = 0;
    /** Runs one displayed frame. */
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
    const back = win.key('keydown', 461);
    expect(back.defaultPrevented).toBe(true); // the webOS profile binds it
    frame();
    win.key('keyup', 461);
    for (let i = 0; i < 4; i++) frame();
    expect(app.game.scenes?.stack.top?.id).toBe('confirm');
    expect(win.backs).toBe(0);
    tap(13); // OK on the default NO
    expect([app.game.scenes?.stack.top?.id, win.backs]).toEqual(['title', 0]);
    tap(461);
    tap(37); // Left → YES
    expect(win.backs).toBe(0);
    tap(13);
    expect(win.backs).toBe(1); // webOS.platformBack(), never window.close()
    expect(win.closes).toBe(0);
    app.stop();
  });

  it('registers no keys at all (webOS has no tvinputdevice) and never touches window.close', async () => {
    const { app } = await boot();
    expect(win.closes).toBe(0);
    expect(Object.keys(win.webOS)).toEqual(['platformBack']);
    app.stop();
  });

  it('suspends on hidden and on blur, and resumes when visible and focused again', async () => {
    const { app } = await boot();
    await flush();
    win.setVisibility('hidden');
    await flush();
    expect(fakes.audioContext.state).toBe('suspended');
    win.setVisibility('visible');
    await flush();
    expect(fakes.audioContext.state).toBe('running');

    win.dispatchEvent(new Event('blur'));
    await flush();
    expect(fakes.audioContext.state).toBe('suspended');
    win.dispatchEvent(new Event('focus'));
    await flush();
    expect(fakes.audioContext.state).toBe('running');
    app.stop();
  });

  it('steps the fixed loop from rAF and renders, then stops cleanly', async () => {
    const { app } = await boot();
    win.frame(STEP);
    win.frame(STEP * 2);
    expect(fakes.renderer.frames.length).toBeGreaterThan(0);
    app.stop();
    expect(fakes.renderer.destroyed).toBe(1);
  });

  // Regression, M3-03: the lock-out the `hosts` list was added for. `tizen-remote-safe` binds
  // every action the menu context requires, so nothing but the host filter keeps it out — and a
  // webOS player who ended up on it would have Back on 10009, a key an LG remote never sends.
  // The filter has to hold on `apply` as well as on `choices`, because the shell applies the
  // *saved* profile id without ever consulting the choices.
  it('ignores a save that names the Tizen remote — Back must stay on 461', async () => {
    win.stored.set('shmup-cup:save.v1', savedProfile('tizen-remote-safe'));
    const { app } = await boot();
    expect(app.profiles.profiles.map((p) => p.id)).toContain('tizen-remote-safe');
    expect(app.input.keyProfile?.id).toBe('webos-remote-safe');
    // …and Back still leaves the title through the scene flow, not through a dead key.
    expect(
      selectableKeyProfiles(app.profiles.profiles, 'keyCode', 'webos').map((p) => p.id),
    ).toEqual(['webos-remote-safe']);
    app.stop();
  });

  it('ignores a saved profile of any other device, and an unknown id', async () => {
    for (const saved of [
      'gamepad-standard',
      'keyboard-default',
      'keyboard-remote-emulation',
      'nope',
    ]) {
      win = new FakeWindow();
      win.stored.set('shmup-cup:save.v1', savedProfile(saved));
      const { app } = await boot();
      expect(app.input.keyProfile?.id, saved).toBe('webos-remote-safe');
      app.stop();
    }
  });
});
