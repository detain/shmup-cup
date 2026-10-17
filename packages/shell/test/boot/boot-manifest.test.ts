/**
 * bootShell() with the atlas manifest fetched rather than inlined (plan R1-05): the apps pass
 * `virtual:shmup-assets` — `{ manifestUrl, atlasDir, manifestDigest }` — and the shell reads
 * `assets/atlas/main.json` with `XMLHttpRequest` (here a fake: status 0 is what `file://` answers
 * on the TVs), checks its digest and format version, then loads the pages from `atlasDir`. A
 * failed request or unreadable file shows `ATLAS MANIFEST FAILED TO LOAD`; a manifest of another
 * build or format shows `ATLAS DOES NOT MATCH ITS MANIFEST`; both release what boot created and
 * never reach the renderer. The inlined form (`virtual:shmup-assets-inline`) still boots, without
 * a request. `Shell.atlasTiming` reports the manifest and per-page times on the window's clock.
 */
import { createHeadlessPlatform, type IAudio, type Platform, type RenderFrame } from '@shmup/core';
import type { XhrLike } from '@shmup/audio-web';
import type * as RenderPixi from '@shmup/render-pixi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatManifest } from '../../../../scripts/assets/manifest.mjs';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import { readContentFiles } from '../../../../vite.shared.js';
import {
  BOOT_STATE_ATTRIBUTE,
  ShellBootError,
  bootShell,
  type ShellAssets,
  type ShellInput,
  type ShellOptions,
} from '../../src/boot/index.js';
import type { BootOverlay } from '../../src/error-screen/index.js';
import { manifestDigest, type LoadableImage } from '../../src/loader/index.js';

const fakes = vi.hoisted(() => ({
  /** Renderers created (none when boot fails before step 4). */
  renderers: 0,
  destroyed: 0,
}));

vi.mock('@shmup/render-pixi', async (importOriginal) => {
  const real = await importOriginal<typeof RenderPixi>();
  return {
    ...real,
    createPixiRenderer: () => {
      fakes.renderers++;
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
        setSpriteNames: () => {},
        bindWorld: () => {},
        warmUp: () => {},
        uploadTextureSource: () => {},
        render: (_frame: RenderFrame) => {},
        resize: () => {},
        destroy: () => {
          fakes.destroyed++;
        },
      });
    },
  };
});

const { manifest } = buildAtlas();
const contentFiles = readContentFiles();
/** `main.json` as the pipeline writes it and the build ships it. */
const MANIFEST_BYTES = new TextEncoder().encode(formatManifest(manifest));
/** What `virtual:shmup-assets` exports for that file. */
const URL_ASSETS: ShellAssets = {
  manifestUrl: 'assets/atlas/main.json',
  atlasDir: 'assets/atlas',
  manifestDigest: manifestDigest(MANIFEST_BYTES),
};

/** What a fake request answers. */
interface Answer {
  /** HTTP status (default 0 — a `file://` response). */
  readonly status?: number;
  /** The body (default the shipped manifest). */
  readonly body?: Uint8Array;
  /** Fail with a network error instead. */
  readonly networkError?: boolean;
}

/** Requests made: `[method, url]`. */
let requests: Array<[string, string]> = [];

/**
 * A request factory answering asynchronously.
 *
 * @param answer - The answer.
 * @returns The factory.
 */
function fakeXhr(answer: Answer = {}): () => XhrLike {
  return () => {
    let target: [string, string] = ['', ''];
    const request = {
      responseType: '',
      status: 0,
      response: null as unknown,
      onload: null as ((event: never) => unknown) | null,
      onerror: null as ((event: never) => unknown) | null,
      open(method: string, url: string) {
        target = [method, url];
      },
      send() {
        requests.push(target);
        setTimeout(() => {
          if (answer.networkError === true) {
            request.onerror?.(undefined as never);
            return;
          }
          request.status = answer.status ?? 0;
          request.response = (answer.body ?? MANIFEST_BYTES).slice().buffer;
          request.onload?.(undefined as never);
        }, 0);
      },
    };
    return request;
  };
}

/** Image URLs requested. */
let imageUrls: string[] = [];

/** An image that loads asynchronously with its manifest page's size (URLs with `bad` fail). */
class FakeImage implements LoadableImage {
  onload: LoadableImage['onload'] = null;
  onerror: LoadableImage['onerror'] = null;
  width = 0;
  height = 0;
  naturalWidth = 0;
  naturalHeight = 0;
  private url = '';

  /** @param size - A size forced on every page (a stale atlas), or `null`. */
  constructor(private readonly size: [number, number] | null = null) {}

  get src(): string {
    return this.url;
  }

  set src(value: string) {
    this.url = value;
    imageUrls.push(value);
    setTimeout(() => {
      if (value.includes('bad')) {
        this.onerror?.call(null as never, 'error');
        return;
      }
      const page = manifest.pages.find((p) => value.endsWith(`/${p.file}`));
      [this.width, this.height] = this.size ?? [page?.w ?? 1, page?.h ?? 1];
      [this.naturalWidth, this.naturalHeight] = [this.width, this.height];
      this.onload?.call(null as never, {} as Event);
    }, 0);
  }
}

/** A window with rAF and listeners (no `performance` unless a test adds one). */
class FakeWindow extends EventTarget {
  innerWidth = 1920;
  innerHeight = 1080;
  performance?: { now(): number };

  requestAnimationFrame(): number {
    return 1;
  }

  cancelAnimationFrame(): void {}
}

let win: FakeWindow;
let input: ShellInput & { destroyed: number };
let audio: IAudio & { destroyed: number };

beforeEach(() => {
  win = new FakeWindow();
  fakes.renderers = 0;
  fakes.destroyed = 0;
  requests = [];
  imageUrls = [];
  const platform = createHeadlessPlatform();
  input = {
    destroyed: 0,
    poll: () => platform.snapshot,
    clear() {},
    setContext() {},
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
    destroy: () => {
      audio.destroyed++;
      return Promise.resolve();
    },
  };
});

/**
 * Boots free flight with the fetched manifest by default.
 *
 * @param overrides - Option overrides.
 * @returns The boot promise, the canvas attributes and the overlay log.
 */
function boot(overrides: Partial<ShellOptions> = {}) {
  const attributes = new Map<string, string>();
  const canvas = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  } as unknown as HTMLCanvasElement;
  const shown: string[] = [];
  const overlay: BootOverlay = {
    canvas: {} as HTMLCanvasElement,
    showProgress: () => {},
    showError: (title, lines) => shown.push(`${title}|${lines.join('|')}`),
    remove: () => shown.push('removed'),
  };
  const platform = createHeadlessPlatform();
  const promise = bootShell({
    canvas,
    win: win as unknown as Window,
    contentFiles,
    assets: URL_ASSETS,
    createRequest: fakeXhr(),
    input,
    audio,
    platform: (): Platform => platform,
    createImage: () => new FakeImage() as unknown as LoadableImage & HTMLImageElement,
    overlay,
    scene: 'flight',
    ...overrides,
  });
  return { promise, attributes, shown };
}

/**
 * Boots and expects the boot error screen.
 *
 * @param overrides - Option overrides.
 * @returns The error, the overlay log and the canvas attributes.
 */
async function bootFails(overrides: Partial<ShellOptions>) {
  const { promise, attributes, shown } = boot(overrides);
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ShellBootError);
  return { error: error as ShellBootError, shown, attributes };
}

describe('shell/boot — the fetched atlas manifest (R1-05)', () => {
  it('fetches the manifest, then loads the pages from atlasDir, and runs', async () => {
    const { promise, attributes, shown } = boot();
    const shell = await promise;
    expect(requests).toEqual([['GET', 'assets/atlas/main.json']]);
    expect(imageUrls).toEqual(manifest.pages.map((page) => `assets/atlas/${page.file}`));
    expect(attributes.get(BOOT_STATE_ATTRIBUTE)).toBe('running');
    expect(shown).toEqual(['removed']);
    expect(shell.atlas.pages).toHaveLength(manifest.pages.length);
    // The residency works off the fetched manifest too.
    expect(shell.atlasResidency.resident).toHaveLength(manifest.pages.length);
    expect(shell.atlasTiming.manifest).toBe('fetched');
    expect(shell.atlasTiming.manifestBytes).toBe(MANIFEST_BYTES.length);
    expect(shell.atlasTiming.pages.map((page) => page.file)).toEqual(
      manifest.pages.map((page) => page.file),
    );
    expect(Object.isFrozen(shell.atlasTiming)).toBe(true);
    shell.stop();
  });

  it('times the manifest and every page with the window clock (W3-6), never options.now', async () => {
    let ms = 1000;
    win.performance = { now: () => (ms += 7) };
    let bootClock = 0;
    const shell = await boot({ now: () => (bootClock += 50) }).promise;
    // The boot clock saw exactly its two readings (start, ready) — the atlas used its own.
    expect(shell.bootTiming).toEqual({ startMs: 50, readyMs: 100, bootMs: 50 });
    expect(shell.atlasTiming.manifestMs).toBe(7);
    for (const page of shell.atlasTiming.pages) {
      expect(page.loadMs).toBeGreaterThan(0);
      expect(page.decodeMs).toBe(0); // the fake image has no decode()
    }
    shell.stop();
  });

  it('reports zero times where the window has no clock', async () => {
    const shell = await boot().promise;
    expect(shell.atlasTiming.manifestMs).toBe(0);
    expect(shell.atlasTiming.pages.every((p) => p.loadMs === 0 && p.decodeMs === 0)).toBe(true);
    shell.stop();
  });

  it('still boots an inlined manifest without any request (virtual:shmup-assets-inline)', async () => {
    const shell = await boot({
      assets: { manifest, pageUrls: manifest.pages.map((page) => `inline/${page.file}`) },
      createRequest: () => {
        throw new Error('no request expected');
      },
    }).promise;
    expect(requests).toEqual([]);
    expect(imageUrls).toEqual(manifest.pages.map((page) => `inline/${page.file}`));
    expect(shell.atlasTiming).toMatchObject({
      manifest: 'inline',
      manifestMs: 0,
      manifestBytes: 0,
    });
    shell.stop();
  });

  it('accepts a manifest without a recorded digest', async () => {
    const shell = await boot({
      assets: { manifestUrl: 'assets/atlas/main.json', atlasDir: 'assets/atlas' },
    }).promise;
    expect(shell.atlas.pages).toHaveLength(manifest.pages.length);
    shell.stop();
  });

  it.each<[string, Answer, string]>([
    ['an HTTP error', { status: 404 }, 'status 404'],
    ['a network error', { networkError: true }, 'network error'],
    ['an empty file', { body: new Uint8Array(0) }, 'status 0'],
  ])('shows ATLAS MANIFEST FAILED TO LOAD for %s', async (_label, answer, reason) => {
    const { error, shown, attributes } = await bootFails({ createRequest: fakeXhr(answer) });
    expect(error.message).toBe(
      `ATLAS MANIFEST FAILED TO LOAD\nAtlasManifestError: assets/atlas/main.json: ${reason}`,
    );
    expect(shown).toEqual([
      `ATLAS MANIFEST FAILED TO LOAD|AtlasManifestError: assets/atlas/main.json: ${reason}`,
    ]);
    expect(attributes.get(BOOT_STATE_ATTRIBUTE)).toBe('error');
    // Nothing past the manifest ran, and what boot made is released.
    expect(imageUrls).toEqual([]);
    expect(fakes.renderers).toBe(0);
    expect(input.destroyed).toBe(1);
    expect(audio.destroyed).toBe(1);
  });

  it('shows ATLAS MANIFEST FAILED TO LOAD for a file that is not a manifest', async () => {
    const body = new TextEncoder().encode('<html>404</html>');
    const { error } = await bootFails({
      assets: { ...URL_ASSETS, manifestDigest: manifestDigest(body) },
      createRequest: fakeXhr({ body }),
    });
    expect(error.message).toMatch(
      /^ATLAS MANIFEST FAILED TO LOAD\nAtlasManifestError: assets\/atlas\/main\.json: not JSON/,
    );
  });

  it('shows ATLAS DOES NOT MATCH ITS MANIFEST for a manifest of another build (digest)', async () => {
    const { error } = await bootFails({ assets: { ...URL_ASSETS, manifestDigest: 'deadbeef' } });
    expect(error.message).toBe(
      'ATLAS DOES NOT MATCH ITS MANIFEST\nAtlasManifestError: assets/atlas/main.json: digest ' +
        `${manifestDigest(MANIFEST_BYTES)}, the build expects deadbeef (a manifest of another build)`,
    );
    expect(imageUrls).toEqual([]);
  });

  it('shows ATLAS DOES NOT MATCH ITS MANIFEST for a format version it cannot read', async () => {
    const body = new TextEncoder().encode(JSON.stringify({ ...manifest, formatVersion: 3 }));
    const { error } = await bootFails({
      assets: { ...URL_ASSETS, manifestDigest: manifestDigest(body) },
      createRequest: fakeXhr({ body }),
    });
    expect(error.message).toBe(
      'ATLAS DOES NOT MATCH ITS MANIFEST\nAtlasManifestError: assets/atlas/main.json: format ' +
        'version 3, this build reads 1 or 2',
    );
  });

  it('reads a format-2 manifest (pages with a group)', async () => {
    const v2 = {
      ...manifest,
      formatVersion: 2,
      pages: manifest.pages.map((page, i) => ({ ...page, group: i === 0 ? 'common' : 'zone-a' })),
    };
    const body = new TextEncoder().encode(JSON.stringify(v2));
    const shell = await boot({
      assets: { ...URL_ASSETS, manifestDigest: manifestDigest(body) },
      createRequest: fakeXhr({ body }),
    }).promise;
    expect(shell.atlas.pages).toHaveLength(v2.pages.length);
    shell.stop();
  });

  it('a page the fetched manifest names that fails to load is ATLAS PAGE FAILED TO LOAD', async () => {
    const { error } = await bootFails({ assets: { ...URL_ASSETS, atlasDir: 'bad/atlas' } });
    expect(error.message).toBe(
      'ATLAS PAGE FAILED TO LOAD\nbad/atlas/main.png: AssetLoadError: could not load bad/atlas/main.png',
    );
    expect(fakes.renderers).toBe(0);
  });

  it('pages of another size than the fetched manifest says are ATLAS DOES NOT MATCH ITS MANIFEST', async () => {
    const { error } = await bootFails({
      createImage: () => new FakeImage([16, 16]) as unknown as LoadableImage & HTMLImageElement,
    });
    expect(error.message).toMatch(/^ATLAS DOES NOT MATCH ITS MANIFEST\n/);
    expect(fakes.renderers).toBe(0);
  });
});
