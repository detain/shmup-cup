/**
 * bootShell()'s atlas residency (plan R1-05) with a fake renderer over the real, zone-split atlas:
 *
 * - at boot, behind the loading screen and **before the warm-up frame**, the boot stage's pages
 *   (the `common` group and the stage's zone, read from the manifest's `pages[].group`) are
 *   uploaded eagerly and every other page is unloaded; dev scenes that draw from any page keep
 *   every page;
 * - the canvas carries the resident pages (`data-shmup-atlas-pages`), the atlas load time
 *   (`data-shmup-atlas-load-ms`) and the same load per page (`data-shmup-atlas-page-ms` — fetch /
 *   decode / upload at boot, the uploads of each stage change: owner decision W3-6), and
 *   `Shell.atlasTiming` the per-page times;
 * - the debug tools get the residency and the timing (`__shmupDebug.atlas`, `.timing`, `.pageMs`);
 * - when the scene flow shows a new World, its stage's pages go up before its first frame — the
 *   shell-side trigger the attract demo needs (W3-9);
 * - a page drawn behind the residency's back — the weapon select's preview draws zone A's terrain
 *   page — leaves the GPU at the next stage change (the residency's self-healing unload; the fake
 *   renderer keeps a fake GPU: the residency's uploads, Pixi's `unload` events and, like Pixi, an
 *   upload of the terrain's page on its first draw).
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
  ATLAS_PAGE_MS_ATTRIBUTE,
  ATLAS_PAGES_ATTRIBUTE,
  SCENE_ATTRIBUTE,
  atlasTimingText,
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
  /**
   * The atlas pages on the fake GPU: added by `uploadTextureSource` and — as Pixi uploads a page
   * on its first draw — by a frame whose World draws terrain from it; removed by the page's
   * `unload` event (Pixi's texture system frees it then).
   */
  gpu: new Set<unknown>(),
}));

vi.mock('@shmup/render-pixi', async (importOriginal) => {
  const real = await importOriginal<typeof RenderPixi>();
  return {
    ...real,
    createPixiRenderer: (options: { atlas: RenderPixi.Atlas }) => {
      const { atlas } = options;
      for (const page of atlas.pages) page.on('unload', () => fakes.gpu.delete(page));
      /** The sprite names the renderer was given (`setSpriteNames`). */
      let names: readonly string[] = [];
      /**
       * Pixi's upload on first draw, for the terrain: the page of the tileset the frame's World
       * draws goes on the fake GPU.
       *
       * @param frame - The frame drawn.
       */
      const drawTerrain = (frame: RenderFrame): void => {
        const terrain = frame.world?.terrain ?? null;
        if (terrain === null) return;
        const sprite = atlas.manifest.sprites[names[terrain.tilesetSpriteId] ?? ''];
        const info = sprite === undefined ? undefined : atlas.manifest.frames[sprite.frames[0]];
        if (info !== undefined) fakes.gpu.add(atlas.pages[info.p]);
      };
      return Promise.resolve({
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
        setSpriteNames: (spriteNames: readonly string[]) => {
          names = spriteNames;
        },
        bindWorld: () => {},
        warmUp: () => fakes.calls.push({ kind: 'warmUp' }),
        uploadTextureSource: (source: unknown) => {
          fakes.gpu.add(source);
          fakes.calls.push({ kind: 'upload', source });
        },
        render: (frame: RenderFrame) => {
          fakes.calls.push({ kind: 'render' });
          drawTerrain(frame);
        },
        resize: () => {},
        destroy: () => {},
      });
    },
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
  fakes.gpu.clear();
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

/**
 * The page indices on the fake GPU.
 *
 * @param pages - The atlas's pages (`Shell.atlas.pages`).
 * @returns Ascending indices.
 */
const gpuPages = (pages: readonly unknown[]): number[] =>
  pages.flatMap((page, p) => (fakes.gpu.has(page) ? [p] : []));

/**
 * Presses and releases an action over two displayed frames.
 *
 * @param action - The action.
 * @param at - The first frame's timestamp.
 * @returns The next free timestamp.
 */
function press(action: number, at: number): number {
  commitPlayerInput(platform.snapshot.players[0], action);
  win.frame(at);
  commitPlayerInput(platform.snapshot.players[0], 0);
  win.frame(at + STEP);
  return at + 2 * STEP;
}

/**
 * From the title to the weapon select (PRESS OK, START, NORMAL, the ship), whose preview is then
 * on screen.
 *
 * @param start - The first frame's timestamp.
 * @returns The next free timestamp.
 */
function toWeaponSelect(start: number): number {
  let at = press(0, start);
  at = press(Action.Confirm, at); // PRESS OK
  at = press(Action.Confirm, at); // START → the difficulty menu
  at = press(Action.Confirm, at); // NORMAL
  at = press(0, at);
  at = press(Action.Confirm, at); // the ship select
  return press(0, at);
}

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
    expect(gpuPages(shell.atlas.pages)).toEqual(expected);
    // No window clock here: every time is 0, but every page is listed (W3-6).
    expect(attributes.get(ATLAS_LOAD_MS_ATTRIBUTE)).toBe('0');
    expect(attributes.get(ATLAS_PAGE_MS_ATTRIBUTE)).toBe(
      ['manifest:0.0', ...manifest.pages.map((page) => `${page.file}:0.0/0.0/0.0`)].join(';'),
    );
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
    // Per page (W3-6): the manifest, then every page's load / decode / upload, in ms to 0.1.
    expect(timing.pages.every((page) => page.loadMs > 0)).toBe(true);
    const bootText = [
      `manifest:${timing.manifestMs.toFixed(1)}`,
      ...timing.pages.map(
        (page) =>
          `${page.file}:${page.loadMs.toFixed(1)}/${page.decodeMs.toFixed(1)}/` +
          page.uploadMs.toFixed(1),
      ),
    ].join(';');
    expect(attributes.get(ATLAS_PAGE_MS_ATTRIBUTE)).toBe(bootText);
    expect(atlasTimingText(timing)).toBe(bootText);
    // A stage change: the pages it uploaded, each with its upload (nothing is fetched or decoded).
    const zoneC = shell.content.db.stageIndex.get('zone-c') ?? -1;
    shell.atlasResidency.prepare(zoneC);
    const fresh = groupPages('zone-c').filter((p) => expected.indexOf(p) < 0);
    expect(fresh.length).toBeGreaterThan(0);
    expect(attributes.get(ATLAS_PAGE_MS_ATTRIBUTE)).toBe(
      fresh.map((p) => `${manifest.pages[p].file}:0.0/0.0/2.0`).join(';'),
    );
    expect(attributes.get(ATLAS_LOAD_MS_ATTRIBUTE)).toBe(
      String(Math.round(shell.atlasResidency.lastPrepareMs)),
    );
    // A prepare that moves nothing leaves both as they were; the boot record stays in atlasTiming.
    const before = attributes.get(ATLAS_PAGE_MS_ATTRIBUTE);
    shell.atlasResidency.prepare(zoneC);
    expect(attributes.get(ATLAS_PAGE_MS_ATTRIBUTE)).toBe(before);
    expect(atlasTimingText(shell.atlasTiming)).toBe(bootText);
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
    const { promise, attributes } = boot({ debugTools: factory });
    const shell = await promise;
    expect(hosts[0].atlas).toBe(shell.atlasResidency);
    // And the timing (W3-6): the boot's, and the last load per page as the canvas shows it.
    expect(hosts[0].atlasTiming).toBe(shell.atlasTiming);
    expect(hosts[0].atlasPageMs?.()).toBe(attributes.get(ATLAS_PAGE_MS_ATTRIBUTE));
    expect(hosts[0].atlasPageMs?.()).toBe(atlasTimingText(shell.atlasTiming));
    shell.atlasResidency.prepare(shell.content.db.stageIndex.get('zone-c') ?? -1);
    expect(hosts[0].atlasPageMs?.()).toBe(attributes.get(ATLAS_PAGE_MS_ATTRIBUTE));
    expect(hosts[0].atlasPageMs?.()).toMatch(/^main-\d+\.png:0\.0\/0\.0\/0\.0$/);
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
    let at = toWeaponSelect(1000);
    expect(attributes.get(SCENE_ATTRIBUTE)).toBe('weaponSelect');
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

  it('the page the weapon select’s preview draws leaves the GPU at the next stage change', async () => {
    const { promise, attributes } = boot();
    const shell = await promise;
    const pages = shell.atlas.pages;
    const stage = (id: string): number => shell.content.db.stageIndex.get(id) ?? -1;
    expect(gpuPages(pages)).toEqual(groupPages('zone-b'));
    // As after a zone C attract demo: common + zone C.
    shell.atlasResidency.prepare(stage('zone-c'));
    expect(gpuPages(pages)).toEqual(groupPages('zone-c'));
    // The weapon select: its preview flies the dev weapon-range, whose terrain-a tiles sit on
    // zone A's page — uploaded on the preview's first draw, behind the residency's back.
    let at = toWeaponSelect(1000);
    expect(attributes.get(SCENE_ATTRIBUTE)).toBe('weaponSelect');
    const zoneAOwn = groupPages('zone-a').filter((p) => groupPages('zone-c').indexOf(p) < 0);
    expect(zoneAOwn.length).toBeGreaterThan(0);
    expect(gpuPages(pages)).toEqual([...groupPages('zone-c'), ...zoneAOwn].sort((a, b) => a - b));
    expect(attributes.get(ATLAS_PAGES_ATTRIBUTE)).toBe(groupPages('zone-c').join(','));
    // A practice start on zone D (its PrepareStage): exactly common + zone D stay on the GPU.
    shell.atlasResidency.prepare(stage('zone-d'));
    expect(gpuPages(pages)).toEqual(groupPages('zone-d'));
    expect(attributes.get(ATLAS_PAGES_ATTRIBUTE)).toBe(groupPages('zone-d').join(','));
    // And the game the weapon select starts (zone B — the trigger, W3-9): common + zone B.
    at = press(Action.Confirm, at);
    at = press(0, at);
    win.frame(at);
    expect(attributes.get(SCENE_ATTRIBUTE)).toBe('game');
    expect(gpuPages(pages)).toEqual(groupPages('zone-b'));
    shell.stop();
  });

  it('lazy pages: the boot awaits and uploads only its stage’s, nothing else is attached', async () => {
    const { promise, attributes } = boot({ atlasPages: 'lazy' });
    const shell = await promise;
    const expected = groupPages('zone-b');
    const pages = shell.atlas.pages;
    // The residency's eager-shaped view: same uploads, same marks, same `resident`.
    expect(uploadedPages(pages)).toEqual(expected);
    expect(attributes.get(ATLAS_PAGES_ATTRIBUTE)).toBe(expected.join(','));
    expect(shell.atlasResidency.resident).toEqual(pages.map((_, p) => expected.indexOf(p) >= 0));
    expect(gpuPages(pages)).toEqual(expected);
    // The rest never got an image at all (W5-15): detached, not merely off the GPU — and the
    // boot's `atlasTiming` page rows carry uploads only (no fetch, no decode here).
    expect(pages.map((_, p) => shell.atlas.isPageLoaded(p))).toEqual(
      pages.map((_, p) => expected.indexOf(p) >= 0),
    );
    expect(shell.atlasTiming.pagesMs).toBe(0);
    expect(shell.atlasTiming.pages.every((page) => page.loadMs === 0)).toBe(true);
    expect(shell.atlasResidency.imagePolicy).toBe('resident');
    shell.stop();
  });

  it('lazy pages: a stage change fetches its own, detaches the others with their images', async () => {
    const { promise, attributes } = boot({ atlasPages: 'lazy' });
    const shell = await promise;
    const pages = shell.atlas.pages;
    const zoneC = shell.content.db.stageIndex.get('zone-c') ?? -1;
    shell.atlasResidency.prepare(zoneC); // the adapter: fire and forget (R3-04.M3c)
    const expected = groupPages('zone-c');
    await vi.waitFor(() => {
      expect(attributes.get(ATLAS_PAGES_ATTRIBUTE)).toBe(expected.join(','));
    });
    expect(pages.map((_, p) => shell.atlas.isPageLoaded(p))).toEqual(
      pages.map((_, p) => expected.indexOf(p) >= 0),
    );
    // The fetched pages uploaded (the fake GPU gained them); zone B's own pages left it.
    expect(gpuPages(pages)).toEqual(expected);
    shell.stop();
  });

  it('lazy pages: the showcase, drawing from any page, keeps every page', async () => {
    const { promise } = boot({ scene: 'showcase', atlasPages: 'lazy' });
    const showcase = await promise;
    const pages = showcase.atlas.pages;
    expect(uploadedPages(pages)).toEqual(groupPages(null));
    expect(pages.every((_, p) => showcase.atlas.isPageLoaded(p))).toBe(true);
    expect(showcase.atlasResidency.unloads).toBe(0);
    showcase.stop();
  });
});
