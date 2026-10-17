/**
 * bootShell()'s atlas residency (plan R1-05) with a fake renderer over the real, zone-split atlas:
 *
 * - at boot, behind the loading screen and **before the warm-up frame**, the boot stage's pages
 *   (the `common` group and the stage's zone, read from the manifest's `pages[].group`) are
 *   uploaded eagerly and every other page is unloaded; dev scenes that draw from any page keep
 *   every page;
 * - the canvas carries the resident pages (`data-shmup-atlas-pages`) and the atlas load time
 *   (`data-shmup-atlas-load-ms`), and `Shell.atlasTiming` the per-page upload times;
 * - the debug tools get the residency (`__shmupDebug.atlas`);
 * - when the scene flow shows a new World, its stage's pages go up before its first frame — the
 *   shell-side trigger the attract demo needs (W3-9).
 */
import {
  Action,
  commitPlayerInput,
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
  ATLAS_LOAD_MS_ATTRIBUTE,
  ATLAS_PAGES_ATTRIBUTE,
  SCENE_ATTRIBUTE,
  bootShell,
  type ShellInput,
  type ShellOptions,
} from '../../src/boot/index.js';
import type { DebugToolsFactory, DebugToolsHost } from '../../src/debug/index.js';
import type { BootOverlay } from '../../src/error-screen/index.js';
import type { LoadableImage } from '../../src/loader/index.js';

const fakes = vi.hoisted(() => ({
  /** What the renderer was asked, in order: `upload` (with the source), `warmUp`, `render`. */
  calls: [] as Array<{ kind: 'upload' | 'warmUp' | 'render'; source?: unknown }>,
}));

vi.mock('@shmup/render-pixi', async (importOriginal) => {
  const real = await importOriginal<typeof RenderPixi>();
  return {
    ...real,
    createPixiRenderer: () =>
      Promise.resolve({
        webGLVersion: 1,
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
        setSpriteNames: () => {},
        bindWorld: () => {},
        warmUp: () => fakes.calls.push({ kind: 'warmUp' }),
        uploadTextureSource: (source: unknown) => fakes.calls.push({ kind: 'upload', source }),
        render: (_frame: RenderFrame) => fakes.calls.push({ kind: 'render' }),
        resize: () => {},
        destroy: () => {},
      }),
  };
});

const STEP = 1000 / 60;
const { manifest } = buildAtlas();
const pageUrls = manifest.pages.map((page) => `assets/atlas/${page.file}`);
const contentFiles = readContentFiles();

/**
 * The pages of the `common` group and of one zone, from the manifest (what the packer grouped).
 *
 * @param zone - The zone's group (`zone-b`), or `null` for every page.
 * @returns Ascending page indices.
 */
const groupPages = (zone: string | null): number[] =>
  manifest.pages.flatMap((page, p) =>
    zone === null || page.group === 'common' || page.group === zone ? [p] : [],
  );

/** An image that loads asynchronously with its manifest page's size. */
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
      const page = manifest.pages.find((p) => value.endsWith(`/${p.file}`));
      this.width = this.naturalWidth = page?.w ?? 1;
      this.height = this.naturalHeight = page?.h ?? 1;
      this.onload?.call(null as never, {} as Event);
    }, 0);
  }
}

/** A window with rAF and listeners; `performance` only when a test adds one. */
class FakeWindow extends EventTarget {
  innerWidth = 1920;
  innerHeight = 1080;
  performance?: { now(): number };
  private pending: ((now: number) => void) | null = null;

  requestAnimationFrame(callback: (now: number) => void): number {
    this.pending = callback;
    return 1;
  }

  cancelAnimationFrame(): void {
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

let win: FakeWindow;
let platform: ReturnType<typeof createHeadlessPlatform>;
let input: ShellInput;
let audio: IAudio;

beforeEach(() => {
  win = new FakeWindow();
  fakes.calls.length = 0;
  platform = createHeadlessPlatform();
  input = {
    poll: () => platform.snapshot,
    clear() {},
    setContext() {},
    destroy() {},
  };
  audio = {
    state: 'uninitialized',
    unlock: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
    resume: () => Promise.resolve(),
    setBusVolume: () => {},
    destroy: () => Promise.resolve(),
  };
});

/**
 * Boots the scene flow on a stage.
 *
 * @param overrides - Option overrides.
 * @returns The boot promise and the canvas attributes.
 */
function boot(overrides: Partial<ShellOptions> = {}) {
  const attributes = new Map<string, string>();
  const canvas = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  } as unknown as HTMLCanvasElement;
  const overlay: BootOverlay = {
    canvas: {} as HTMLCanvasElement,
    showProgress: () => {},
    showError: () => {},
    remove: () => {},
  };
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
    scene: 'game',
    gameConfig: { stage: 'zone-b' },
    ...overrides,
  });
  return { promise, attributes };
}

/**
 * The page indices of the uploaded sources, in upload order.
 *
 * @param pages - The atlas's pages (`Shell.atlas.pages`).
 * @returns Indices.
 */
const uploadedPages = (pages: readonly unknown[]): number[] =>
  fakes.calls.filter((call) => call.kind === 'upload').map((call) => pages.indexOf(call.source));

describe('shell/boot atlas residency (R1-05)', () => {
  it('the shipped atlas is split: common + one group per zone (the premise of these tests)', () => {
    expect(manifest.pages.length).toBeGreaterThan(1);
    expect(manifest.pages[0].group).toBe('common');
    expect(groupPages('zone-b').length).toBeLessThan(manifest.pages.length);
  });

  it('uploads the boot stage’s pages before the warm-up frame and marks the canvas', async () => {
    const { promise, attributes } = boot();
    const shell = await promise;
    const expected = groupPages('zone-b');
    expect(uploadedPages(shell.atlas.pages)).toEqual(expected);
    // Every upload comes before the warm-up frame, which comes before any real frame.
    const kinds = fakes.calls.map((call) => call.kind);
    expect(kinds.lastIndexOf('upload')).toBeLessThan(kinds.indexOf('warmUp'));
    expect(kinds).not.toContain('render');
    expect(attributes.get(ATLAS_PAGES_ATTRIBUTE)).toBe(expected.join(','));
    expect(shell.atlasResidency.resident).toEqual(
      manifest.pages.map((_, p) => expected.indexOf(p) >= 0),
    );
    expect(shell.atlasResidency.unloads).toBe(manifest.pages.length - expected.length);
    expect(attributes.get(ATLAS_LOAD_MS_ATTRIBUTE)).toBe('0'); // no window clock here
    shell.stop();
  });

  it('times the boot uploads per page and reports the atlas total on the canvas', async () => {
    let ms = 0;
    win.performance = { now: () => (ms += 2) };
    const { promise, attributes } = boot();
    const shell = await promise;
    const expected = groupPages('zone-b');
    const timing = shell.atlasTiming;
    timing.pages.forEach((page, p) => {
      expect(page.uploadMs, page.file).toBe(expected.indexOf(p) >= 0 ? 2 : 0);
    });
    expect(timing.pagesMs).toBeGreaterThan(0);
    const uploads = timing.pages.reduce((sum, page) => sum + page.uploadMs, 0);
    expect(timing.totalMs).toBe(timing.manifestMs + timing.pagesMs + uploads);
    expect(attributes.get(ATLAS_LOAD_MS_ATTRIBUTE)).toBe(String(Math.round(timing.totalMs)));
    shell.stop();
  });

  it('free flight keeps its stage’s pages; the showcase, which draws from any page, keeps all', async () => {
    const flight = await boot({ scene: 'flight', gameConfig: { stage: 'zone-c' } }).promise;
    expect(uploadedPages(flight.atlas.pages)).toEqual(groupPages('zone-c'));
    flight.stop();
    fakes.calls.length = 0;
    const { promise, attributes } = boot({ scene: 'showcase' });
    const showcase = await promise;
    expect(uploadedPages(showcase.atlas.pages)).toEqual(groupPages(null));
    expect(attributes.get(ATLAS_PAGES_ATTRIBUTE)).toBe(groupPages(null).join(','));
    expect(showcase.atlasResidency.unloads).toBe(0);
    showcase.stop();
  });

  it('gives the debug tools the residency (__shmupDebug.atlas)', async () => {
    const hosts: DebugToolsHost[] = [];
    const factory: DebugToolsFactory = (host) => {
      hosts.push(host);
      return {
        controls: null as never,
        overlay: null as never,
        counters: null as never,
        api: null as never,
        telemetry: null as never,
        unlocked: true,
        handleKey: () => false,
        beginFrame: () => {},
        endTicks: () => {},
        beforeRender: () => {},
        afterRender: () => {},
        destroy: () => {},
      };
    };
    const shell = await boot({ debugTools: factory }).promise;
    expect(hosts[0].atlas).toBe(shell.atlasResidency);
    shell.stop();
  });

  it('a new World on screen gets its stage’s pages before its first frame (W3-9)', async () => {
    const { promise, attributes } = boot();
    const shell = await promise;
    // Somewhere else first (as after the attract demo of another zone).
    const zoneC = shell.content.db.stageIndex.get('zone-c') ?? -1;
    shell.atlasResidency.prepare(zoneC);
    expect(attributes.get(ATLAS_PAGES_ATTRIBUTE)).toBe(groupPages('zone-c').join(','));
    fakes.calls.length = 0;
    /**
     * Presses and releases an action over two displayed frames.
     *
     * @param action - The action.
     * @param at - The first frame's timestamp.
     * @returns The next free timestamp.
     */
    const press = (action: number, at: number): number => {
      commitPlayerInput(platform.snapshot.players[0], action);
      win.frame(at);
      commitPlayerInput(platform.snapshot.players[0], 0);
      win.frame(at + STEP);
      return at + 2 * STEP;
    };
    let at = press(0, 1000);
    at = press(Action.Confirm, at); // PRESS OK
    at = press(Action.Confirm, at); // START → the difficulty menu
    at = press(Action.Confirm, at); // NORMAL
    at = press(0, at);
    at = press(Action.Confirm, at); // the ship select
    at = press(0, at);
    at = press(Action.Confirm, at); // the weapon select's START
    at = press(0, at);
    expect(attributes.get(SCENE_ATTRIBUTE)).toBe('game');
    win.frame(at);
    // The game's World (zone B) is on screen: zone B's pages went up before a frame drew it.
    expect(attributes.get(ATLAS_PAGES_ATTRIBUTE)).toBe(groupPages('zone-b').join(','));
    const zoneBOwn = groupPages('zone-b').filter((p) => groupPages('zone-c').indexOf(p) < 0);
    const uploads = fakes.calls.flatMap((call, i) => (call.kind === 'upload' ? [i] : []));
    expect(uploads.map((i) => shell.atlas.pages.indexOf(fakes.calls[i].source as never))).toEqual(
      zoneBOwn,
    );
    shell.stop();
  });
});
