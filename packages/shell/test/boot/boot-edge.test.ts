/**
 * Edge cases of bootShell() (fake window, fake images, fake renderer — no WebGL in Node; the
 * atlas is built for real): every failure path releases exactly what boot created so far
 * (content owner crash, a page-count mismatch, a WebGL failure destroying the atlas, a
 * platform factory throwing a non-Error), the singular "PROBLEM" title, progress with several
 * pages, canvases without attributes, no overlay at all, events dispatched before the frame
 * is rendered, and a stopped shell staying stopped.
 */
import {
  SimEventKind,
  createHeadlessPlatform,
  type IAudio,
  type Platform,
  type RenderFrame,
} from '@shmup/core';
import type * as RenderPixi from '@shmup/render-pixi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import {
  BOOT_STATE_ATTRIBUTE,
  ShellBootError,
  bootShell,
  type ShellInput,
  type ShellOptions,
} from '../../src/boot/index.js';
import type { BootOverlay } from '../../src/error-screen/index.js';
import type { LoadableImage } from '../../src/loader/index.js';

const fakes = vi.hoisted(() => ({
  rendererOptions: null as Record<string, unknown> | null,
  rendererFails: false,
  /** Ticks of the frames rendered so far. */
  renders: [] as Array<{ tick: number }>,
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
        effects: real.createScreenEffects(),
        particles: null,
        popups: null,
        setFxContent: () => {},
        setSpriteNames: () => {},
        bindWorld: () => {},
        render: (frame: RenderFrame) => fakes.renders.push({ tick: frame.tick }),
        resize: () => {},
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

/** A manifest with two small pages and no frames (the fallbacks stand in). */
const twoPages: RenderPixi.AtlasManifest = {
  formatVersion: 1,
  pages: [
    { file: 'p0.png', w: 8, h: 8 },
    { file: 'p1.png', w: 4, h: 4 },
  ],
  frames: {},
  sprites: {},
  animations: {},
  fonts: {},
};

/** An image that loads asynchronously with a size looked up by file name. */
class FakeImage implements LoadableImage {
  onload: LoadableImage['onload'] = null;
  onerror: LoadableImage['onerror'] = null;
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
    setTimeout(() => {
      const page = [...manifest.pages, ...twoPages.pages].find((p) => value.endsWith(p.file));
      this.width = this.naturalWidth = page?.w ?? 1;
      this.height = this.naturalHeight = page?.h ?? 1;
      this.onload?.call(null as never, {} as Event);
    }, 0);
  }
}

/** A window with rAF, listeners and a size. */
class FakeWindow extends EventTarget {
  innerWidth = 1920;
  innerHeight = 1080;
  private pending: ((now: number) => void) | null = null;

  requestAnimationFrame(callback: (now: number) => void): number {
    this.pending = callback;
    return 1;
  }

  cancelAnimationFrame(): void {
    this.pending = null;
  }

  /** @returns Whether a frame is scheduled. */
  get scheduled(): boolean {
    return this.pending !== null;
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

let win: FakeWindow;
let input: ShellInput & { destroyed: number };
let audio: IAudio & { destroyed: number };
let platform: ReturnType<typeof createHeadlessPlatform>;

beforeEach(() => {
  win = new FakeWindow();
  fakes.rendererOptions = null;
  fakes.rendererFails = false;
  fakes.renders.length = 0;
  fakes.destroyed = 0;
  platform = createHeadlessPlatform();
  input = {
    destroyed: 0,
    poll: () => platform.snapshot,
    clear: () => {},
    setContext: () => {},
    destroy() {
      input.destroyed++;
    },
  };
  audio = {
    destroyed: 0,
    state: 'uninitialized',
    unlock: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
    resume: () => Promise.resolve(),
    setBusVolume: () => {},
    destroy() {
      audio.destroyed++;
      return Promise.resolve();
    },
  };
});

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

/**
 * Boots with test defaults.
 *
 * @param overrides - Option overrides.
 */
function boot(overrides: Partial<ShellOptions> = {}) {
  const attributes = new Map<string, string>();
  const canvas = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  } as unknown as HTMLCanvasElement;
  const { overlay, shown } = recordingOverlay();
  const promise = bootShell({
    canvas,
    win: win as unknown as Window,
    contentFiles,
    assets: { manifest, pageUrls },
    input,
    audio,
    platform: (): Platform => platform,
    createImage: () => new FakeImage() as unknown as LoadableImage & HTMLImageElement,
    overlay,
    ...overrides,
  });
  return { promise, attributes, shown };
}

/**
 * Awaits a boot that must fail.
 *
 * @param promise - The boot promise.
 * @returns The ShellBootError.
 */
async function failure(promise: Promise<unknown>): Promise<ShellBootError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ShellBootError);
  return error as ShellBootError;
}

describe('shell/boot ShellBootError', () => {
  it('joins the title and lines into the message and keeps issues and reason', () => {
    const cause = new Error('x');
    const error = new ShellBootError(
      'TITLE',
      ['a: 1', 'b: 2'],
      [{ path: 'a', message: '1' }],
      cause,
    );
    expect(error.message).toBe('TITLE\na: 1\nb: 2');
    expect([error.name, error.reason, error.issues.length]).toEqual(['ShellBootError', cause, 1]);
    const bare = new ShellBootError('ONLY', []);
    expect([bare.message, bare.issues, bare.reason]).toEqual(['ONLY', [], undefined]);
    expect(bare).toBeInstanceOf(Error);
  });
});

describe('shell/boot failure cleanup (edge)', () => {
  it('a content owner that throws: CONTENT COULD NOT BE READ, nothing else created', async () => {
    const foreign = [
      ...contentFiles,
      { path: 'x/a.custom.json', data: { formatVersion: 1, kind: 'custom' } },
    ];
    const { promise, shown, attributes } = boot({
      contentFiles: foreign,
      contentOwners: {
        custom: () => {
          throw new TypeError('owner crashed');
        },
      },
    });
    const error = await failure(promise);
    expect(error.lines).toEqual(['TypeError: owner crashed']);
    expect(error.reason).toBeInstanceOf(TypeError);
    expect(shown[shown.length - 1]).toBe(
      'error:CONTENT COULD NOT BE READ|TypeError: owner crashed',
    );
    expect(attributes.get(BOOT_STATE_ATTRIBUTE)).toBe('error');
    expect(fakes.rendererOptions).toBeNull();
    expect([input.destroyed, audio.destroyed, fakes.destroyed]).toEqual([1, 1, 0]);
  });

  it('says PROBLEM (singular) for exactly one content issue', async () => {
    const one = [
      ...contentFiles,
      { path: 'x/lonely.custom.json', data: { formatVersion: 1, kind: 'custom' } },
    ];
    const error = await failure(boot({ contentFiles: one }).promise);
    expect(error.message.split('\n')[0]).toBe('CONTENT ERRORS: 1 PROBLEM');
    expect(error.lines).toEqual(['x/lonely.custom.json: no loader for content kind "custom"']);
  });

  it('fewer page URLs than manifest pages: progress completes, then the atlas is rejected', async () => {
    const { promise, shown } = boot({ assets: { manifest, pageUrls: [] } });
    const error = await failure(promise);
    expect(error.message).toMatch(
      /^ATLAS DOES NOT MATCH ITS MANIFEST\nRangeError: atlas: \d+ page/,
    );
    expect(shown).toContain('progress:1');
    expect(fakes.rendererOptions).toBeNull();
    expect([input.destroyed, audio.destroyed]).toEqual([1, 1]);
  });

  it('a WebGL failure destroys the atlas that was already built', async () => {
    fakes.rendererFails = true;
    await failure(boot().promise);
    const atlas = fakes.rendererOptions?.atlas as RenderPixi.Atlas;
    expect(atlas.textures.length).toBeGreaterThan(0);
    expect(atlas.textures.every((texture) => texture.destroyed)).toBe(true);
    expect(atlas.pages.every((page) => page.destroyed)).toBe(true);
    expect([input.destroyed, audio.destroyed]).toEqual([1, 1]);
  });

  it('a platform factory throwing a non-Error: its text on screen, renderer and atlas released', async () => {
    const { promise, shown } = boot({
      platform: () => {
        // A third-party factory may throw anything; the shell must still describe it.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'no platform today';
      },
    });
    const error = await failure(promise);
    expect(error.reason).toBe('no platform today');
    expect(shown[shown.length - 1]).toBe('error:SHMUP CUP FAILED TO START|no platform today');
    expect(fakes.destroyed).toBe(1);
    const atlas = fakes.rendererOptions?.atlas as RenderPixi.Atlas;
    expect(atlas.textures.every((texture) => texture.destroyed)).toBe(true);
    expect(win.scheduled).toBe(false);
  });

  it('fails cleanly without an overlay and without canvas attributes', async () => {
    fakes.rendererFails = true;
    const promise = bootShell({
      canvas: {} as HTMLCanvasElement,
      win: win as unknown as Window,
      contentFiles,
      assets: { manifest, pageUrls },
      input,
      audio,
      platform: () => platform,
      createImage: () => new FakeImage() as unknown as LoadableImage & HTMLImageElement,
      overlay: null,
    });
    const error = await failure(promise);
    expect(error.message).toMatch(/^WEBGL IS NOT AVAILABLE/);
  });
});

describe('shell/boot running (edge)', () => {
  it('reports progress page by page for a multi-page atlas', async () => {
    const { promise, shown } = boot({
      assets: { manifest: twoPages, pageUrls: ['assets/atlas/p0.png', 'assets/atlas/p1.png'] },
    });
    const shell = await promise;
    expect(shown).toEqual(['progress:0', 'progress:0', 'progress:0.5', 'progress:1', 'removed']);
    expect(shell.atlas.pages).toHaveLength(2);
    shell.stop();
  });

  it('boots on a canvas without setAttribute and passes the preferred WebGL version on', async () => {
    const shell = await bootShell({
      canvas: {} as HTMLCanvasElement,
      win: win as unknown as Window,
      contentFiles,
      assets: { manifest, pageUrls },
      input,
      audio,
      platform: () => platform,
      createImage: () => new FakeImage() as unknown as LoadableImage & HTMLImageElement,
      overlay: null,
      preferWebGLVersion: 2,
    });
    expect(fakes.rendererOptions?.preferWebGLVersion).toBe(2);
    shell.stop();
  });

  it('dispatches a frame’s events before that frame is rendered', async () => {
    const shell = await boot().promise;
    const rendersSeenByHandler: number[] = [];
    shell.events.on(SimEventKind.Sfx, () => rendersSeenByHandler.push(fakes.renders.length));
    win.frame(1000);
    shell.game.events.push(SimEventKind.Sfx, 1, 0, 0, 0);
    win.frame(1000 + STEP);
    expect(rendersSeenByHandler).toEqual([1]);
    expect(fakes.renders).toHaveLength(2);
    shell.stop();
  });

  it('a stopped shell schedules no frame and releases everything exactly once', async () => {
    const shell = await boot().promise;
    win.frame(0);
    shell.stop();
    expect(win.scheduled).toBe(false);
    win.frame(STEP);
    shell.stop();
    expect(fakes.renders).toHaveLength(1);
    expect([input.destroyed, audio.destroyed, fakes.destroyed]).toEqual([1, 1, 1]);
  });
});
