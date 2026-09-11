/**
 * Tests for bootShell() with a fake window, fake images and a fake renderer (no WebGL in
 * Node; the atlas is built for real over fake page images): the boot order, the showcase and
 * calibration scenes, the frame loop (ticks → event dispatch → render), audio unlock policies,
 * lifecycle and resize wiring, stop(), and every failure path of the boot error screen.
 */
import {
  SimEventKind,
  createHeadlessPlatform,
  type IAudio,
  type Platform,
  type RenderFrame,
} from '@shmup/core';
import type * as RenderPixi from '@shmup/render-pixi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import {
  BOOT_STATE_ATTRIBUTE,
  SHELL_SCENES,
  ShellBootError,
  bootShell,
  moduleInfo,
  sceneFromSearch,
  type ShellInput,
  type ShellOptions,
} from '../../src/boot/index.js';
import type { BootOverlay } from '../../src/error-screen/index.js';
import type { LoadableImage } from '../../src/loader/index.js';
import { SHOWCASE_SPRITES } from '../../src/showcase/index.js';

const fakes = vi.hoisted(() => ({
  rendererOptions: null as Record<string, unknown> | null,
  rendererFails: false,
  spriteNames: [] as Array<readonly string[]>,
  bound: [] as unknown[],
  frames: [] as Array<{ tick: number; world: unknown; hudCount: number }>,
  sizes: [] as Array<[number, number]>,
  destroyed: 0,
}));

vi.mock('@shmup/render-pixi', async (importOriginal) => {
  const real = await importOriginal<typeof RenderPixi>();
  return {
    ...real,
    createPixiRenderer: (options: Record<string, unknown>) => {
      fakes.rendererOptions = options;
      if (fakes.rendererFails) return Promise.reject(new Error('WebGL unavailable'));
      return Promise.resolve({
        width: 384,
        height: 216,
        webGLVersion: 1,
        setSpriteNames: (names: readonly string[]) => fakes.spriteNames.push(names),
        bindWorld: (world: unknown) => fakes.bound.push(world),
        render: (frame: RenderFrame) =>
          fakes.frames.push({ tick: frame.tick, world: frame.world, hudCount: frame.hud.count }),
        resize: (w: number, h: number) => fakes.sizes.push([w, h]),
        destroy: () => {
          fakes.destroyed++;
        },
      });
    },
  };
});

const STEP = 1000 / 60;
const { manifest } = buildAtlas();
const pageUrls = manifest.pages.map((page) => `assets/atlas/${page.file}`);
const contentFiles = readContentFiles();

/** An image that loads asynchronously with the manifest page size (URLs with `bad` fail). */
class FakeImage implements LoadableImage {
  onload: LoadableImage['onload'] = null;
  onerror: LoadableImage['onerror'] = null;
  width = 0;
  height = 0;
  naturalWidth = 0;
  naturalHeight = 0;
  private url = '';

  constructor(private readonly size: [number, number] | null = null) {}

  get src(): string {
    return this.url;
  }

  set src(value: string) {
    this.url = value;
    setTimeout(() => {
      if (value.includes('bad')) {
        this.onerror?.call(null as never, 'error');
        return;
      }
      const page = manifest.pages.find((p) => value.endsWith(p.file));
      [this.width, this.height] = this.size ?? [page?.w ?? 1, page?.h ?? 1];
      [this.naturalWidth, this.naturalHeight] = [this.width, this.height];
      this.onload?.call(null as never, {} as Event);
    }, 0);
  }
}

/** A window with rAF, listeners and a size. */
class FakeWindow extends EventTarget {
  innerWidth = 1920;
  innerHeight = 1080;
  private pending: ((now: number) => void) | null = null;
  cancelled = 0;

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
}

/** Records what the boot overlay was asked to show. */
function recordingOverlay() {
  const shown: string[] = [];
  const overlay: BootOverlay = {
    canvas: {} as HTMLCanvasElement,
    showProgress: (fraction) => shown.push(`progress:${fraction}`),
    showError: (title, lines) => shown.push(`error:${title}|${lines.join('|')}`),
    remove: () => shown.push('removed'),
  };
  return { overlay, shown };
}

/** A canvas fake that records attributes. */
function fakeCanvas() {
  const attributes = new Map<string, string>();
  const canvas = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  } as unknown as HTMLCanvasElement;
  return { canvas, attributes };
}

let win: FakeWindow;
let input: ShellInput & { cleared: number; destroyed: number };
let audio: IAudio & { calls: string[] };
let platform: ReturnType<typeof createHeadlessPlatform>;
let unlocks = 0;

beforeEach(() => {
  win = new FakeWindow();
  fakes.rendererOptions = null;
  fakes.rendererFails = false;
  fakes.spriteNames.length = 0;
  fakes.bound.length = 0;
  fakes.frames.length = 0;
  fakes.sizes.length = 0;
  fakes.destroyed = 0;
  unlocks = 0;
  platform = createHeadlessPlatform();
  input = {
    cleared: 0,
    destroyed: 0,
    poll: () => platform.snapshot,
    clear() {
      input.cleared++;
    },
    destroy() {
      input.destroyed++;
    },
  };
  const calls: string[] = [];
  audio = {
    calls,
    state: 'uninitialized',
    unlock: () => Promise.resolve(),
    suspend: () => {
      calls.push('suspend');
      return Promise.resolve();
    },
    resume: () => {
      calls.push('resume');
      return Promise.resolve();
    },
    setBusVolume: () => {},
    destroy: () => {
      calls.push('destroy');
      return Promise.resolve();
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Boots with test defaults.
 *
 * @param overrides - Option overrides.
 */
function boot(overrides: Partial<ShellOptions> = {}) {
  const { canvas, attributes } = fakeCanvas();
  const { overlay, shown } = recordingOverlay();
  const promise = bootShell({
    canvas,
    win: win as unknown as Window,
    contentFiles,
    assets: { manifest, pageUrls },
    input,
    audio,
    platform: (): Platform => ({
      ...platform,
      audio: {
        unlock: () => {
          unlocks++;
          return Promise.resolve();
        },
      },
    }),
    createImage: () => new FakeImage() as unknown as LoadableImage & HTMLImageElement,
    overlay,
    ...overrides,
  });
  return { promise, attributes, shown };
}

describe('shell/boot sceneFromSearch', () => {
  it('describes itself and knows its scenes', () => {
    expect(moduleInfo.name).toBe('boot');
    expect(SHELL_SCENES).toEqual(['showcase', 'calibration']);
  });

  it('reads ?scene= and defaults to the showcase', () => {
    expect(sceneFromSearch('?scene=calibration')).toBe('calibration');
    expect(sceneFromSearch('debug=1&scene=calibration')).toBe('calibration');
    expect(sceneFromSearch('?scene=showcase')).toBe('showcase');
    expect(sceneFromSearch('?scene=nope')).toBe('showcase');
    expect(sceneFromSearch('?scene')).toBe('showcase');
    expect(sceneFromSearch('')).toBe('showcase');
  });
});

describe('shell/boot bootShell', () => {
  it('loads, creates a WebGL1-first renderer with the atlas, and marks the canvas running', async () => {
    const { promise, attributes, shown } = boot();
    const shell = await promise;
    expect(fakes.rendererOptions).toMatchObject({
      displayWidth: 1920,
      displayHeight: 1080,
      preferWebGLVersion: 1,
      testPattern: false,
      atlas: shell.atlas,
    });
    expect(shell.atlas.manifest).toBe(manifest);
    expect(shell.content.issues).toEqual([]);
    expect(shell.game.content).toBe(shell.content.db);
    expect(attributes.get(BOOT_STATE_ATTRIBUTE)).toBe('running');
    expect(shown[0]).toBe('progress:0');
    expect(shown).toContain('progress:1');
    expect(shown[shown.length - 1]).toBe('removed');
  });

  it('shows the showcase by default: its sprite names and world are handed to the renderer', async () => {
    const shell = await boot().promise;
    expect(shell.scene).toBe('showcase');
    expect(fakes.spriteNames).toEqual([SHOWCASE_SPRITES]);
    expect(fakes.bound).toEqual([shell.showcase?.world]);
  });

  it('calibration scene: the test pattern, the content sprite table and the game frame', async () => {
    const shell = await boot({ scene: 'calibration' }).promise;
    expect(shell.showcase).toBeNull();
    expect(fakes.rendererOptions?.testPattern).toBe(true);
    expect(fakes.spriteNames).toEqual([shell.game.content.sprites.names]);
    win.frame(0);
    expect(fakes.frames[0]).toMatchObject({ tick: 0, world: null });
  });

  it('runs the frame loop: fixed ticks, event dispatch, then render', async () => {
    const shell = await boot({ gameConfig: { seed: 7 } }).promise;
    expect(shell.game.config.seed).toBe(7);
    const shakes: number[] = [];
    shell.events.on(SimEventKind.Shake, (event) => shakes.push(event.param));
    shell.game.events.push(SimEventKind.Shake, 0, 0, 0, 3);
    win.frame(1000);
    win.frame(1000 + STEP);
    win.frame(1000 + 2 * STEP);
    expect(shell.game.state.tick).toBe(2);
    expect(shakes).toEqual([3]);
    expect(fakes.frames.map((frame) => frame.tick)).toEqual([0, 1, 2]);
    expect(fakes.frames.every((frame) => frame.world === shell.showcase?.world)).toBe(true);
    expect(fakes.frames[0].hudCount).toBeGreaterThan(0);
  });

  it('unlocks audio on the first key or pointer gesture only (web default)', async () => {
    await boot().promise;
    expect(unlocks).toBe(0);
    win.dispatchEvent(new Event('pointerdown'));
    win.dispatchEvent(new Event('keydown'));
    expect(unlocks).toBe(1);
  });

  it('unlocks audio immediately when asked (TV)', async () => {
    await boot({ audioUnlock: 'immediate' }).promise;
    expect(unlocks).toBe(1);
    win.dispatchEvent(new Event('keydown'));
    expect(unlocks).toBe(1);
  });

  it('suspend clears held input and suspends audio; resume resumes audio', async () => {
    const shell = await boot().promise;
    platform.suspend();
    expect(input.cleared).toBe(1);
    expect(shell.game.state.suspended).toBe(true);
    platform.resume();
    expect(audio.calls).toEqual(['suspend', 'resume']);
  });

  it('forwards window resizes to the renderer', async () => {
    await boot().promise;
    win.innerWidth = 1280;
    win.innerHeight = 720;
    win.dispatchEvent(new Event('resize'));
    expect(fakes.sizes).toEqual([[1280, 720]]);
  });

  it('stop() ends the loop and releases listeners, input, renderer, atlas and audio (once)', async () => {
    const shell = await boot().promise;
    const firstTexture = shell.atlas.textures[0];
    shell.stop();
    shell.stop();
    expect(win.cancelled).toBe(1);
    expect(input.destroyed).toBe(1);
    expect(fakes.destroyed).toBe(1);
    expect(firstTexture.destroyed).toBe(true);
    expect(audio.calls).toEqual(['destroy']);
    win.dispatchEvent(new Event('resize'));
    win.dispatchEvent(new Event('keydown'));
    expect(fakes.sizes).toEqual([]);
    expect(unlocks).toBe(0);
  });
});

describe('shell/boot failures (boot error screen)', () => {
  it('lists every content issue and rejects with a ShellBootError carrying them', async () => {
    const broken = [
      ...contentFiles,
      { path: 'player/zz.player.json', data: { formatVersion: 1, kind: 'player' } },
    ];
    const { promise, attributes, shown } = boot({ contentFiles: broken });
    const error = await promise.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ShellBootError);
    const bootError = error as ShellBootError;
    expect(bootError.issues.length).toBeGreaterThan(0);
    expect(bootError.lines[0]).toMatch(/^player\/zz\.player\.json:/);
    expect(shown[shown.length - 1]).toMatch(/^error:CONTENT ERRORS: \d+ PROBLEMS?\|player\/zz/);
    expect(attributes.get(BOOT_STATE_ATTRIBUTE)).toBe('error');
    expect(fakes.rendererOptions).toBeNull();
    expect(input.destroyed).toBe(1);
    expect(audio.calls).toEqual(['destroy']);
  });

  it('reports content from a foreign kind nobody owns, unless an owner accepts it', async () => {
    const foreign = [
      ...contentFiles,
      { path: 'fx/particles.fx.json', data: { formatVersion: 1, kind: 'fx' } },
    ];
    await expect(boot({ contentFiles: foreign }).promise).rejects.toThrow(
      /no loader for content kind "fx"/,
    );
    const owned = await boot({ contentFiles: foreign, contentOwners: { fx: () => [] } }).promise;
    expect(owned.content.foreign).toHaveLength(1);
  });

  it('reports an atlas page that fails to load', async () => {
    const { promise, shown } = boot({ assets: { manifest, pageUrls: ['assets/atlas/bad.png'] } });
    await expect(promise).rejects.toBeInstanceOf(ShellBootError);
    expect(shown[shown.length - 1]).toMatch(
      /^error:ATLAS PAGE FAILED TO LOAD\|assets\/atlas\/bad\.png/,
    );
  });

  it('reports a stale atlas page (size differs from the manifest)', async () => {
    const { promise, shown } = boot({
      createImage: () => new FakeImage([8, 8]) as unknown as LoadableImage & HTMLImageElement,
    });
    await expect(promise).rejects.toThrow(/ATLAS DOES NOT MATCH ITS MANIFEST/);
    expect(shown[shown.length - 1]).toMatch(/stale atlas/);
  });

  it('reports a missing WebGL context and releases the atlas', async () => {
    fakes.rendererFails = true;
    const { promise, shown, attributes } = boot();
    const error = (await promise.catch((caught: unknown) => caught)) as ShellBootError;
    expect(error.message).toMatch(/^WEBGL IS NOT AVAILABLE/);
    expect(error.reason).toBeInstanceOf(Error);
    expect(shown[shown.length - 1]).toContain('WebGL unavailable');
    expect(attributes.get(BOOT_STATE_ATTRIBUTE)).toBe('error');
  });

  it('reports a platform or game that cannot be created, and destroys the renderer', async () => {
    const { promise } = boot({ gameConfig: { startingLives: 99 } });
    await expect(promise).rejects.toThrow(/SHMUP CUP FAILED TO START/);
    expect(fakes.destroyed).toBe(1);
  });

  it('boots without an overlay when none can be created (fake canvas)', async () => {
    const shell = await boot({ overlay: undefined }).promise;
    expect(shell.scene).toBe('showcase');
  });
});
