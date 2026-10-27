/**
 * Tests for the page-image factory of plan v20x P0-1 (`createPageImageFactory`,
 * `loadPageImagesTimed`): the `createImageBitmap` branch loads bytes through the `file://`-safe
 * XHR path and tags the bitmap with its URL, the `Image` branch stays the untouched fallback, and
 * every bitmap-branch failure falls back per URL.
 */
import { describe, expect, it } from 'vitest';
import {
  AssetLoadError,
  createPageImageFactory,
  loadPageImagesTimed,
  tagPageImageUrl,
  type LoadableImage,
} from '../../src/loader/index.js';

/** One fetched request (the fake answers with `bytes`, or errors like `loadArrayBuffer` sees it). */
class FakeXhr {
  responseType = '';
  status = 0;
  response: unknown = null;
  onload: ((event: never) => unknown) | null = null;
  onerror: ((event: never) => unknown) | null = null;
  url = '';

  constructor(
    private readonly bytes: Uint8Array | null,
    private readonly networkError = false,
  ) {}

  open(_method: string, url: string): void {
    this.url = url;
  }

  send(): void {
    setTimeout(() => {
      if (this.networkError) {
        this.onerror?.({} as never);
        return;
      }
      if (this.bytes === null) {
        this.status = 404;
      } else {
        this.response = this.bytes.buffer.slice(
          this.bytes.byteOffset,
          this.bytes.byteOffset + this.bytes.byteLength,
        );
      }
      this.onload?.({} as never);
    }, 0);
  }
}

/** An `Image`-path fake that settles through `onload` (or `onerror`) like the loader drives it. */
class FakeImage implements LoadableImage {
  onload: LoadableImage['onload'] = null;
  onerror: LoadableImage['onerror'] = null;
  src = '';

  constructor(private readonly failLoad = false) {}

  /** Fires the load outcome once (the loader's own microtask turn). */
  settle(): void {
    setTimeout(() => {
      if (this.failLoad) this.onerror?.({} as never);
      else this.onload?.call(null as never, {} as Event);
    }, 0);
  }
}

/**
 * A decoded fake `ImageBitmap` with the shape the atlas reads (no `naturalWidth`, so the
 * `width` / `height` arm) and a counted `close()`.
 *
 * @param w - Page width.
 * @param h - Page height.
 * @returns The bitmap fake (with `closes`).
 */
function fakeBitmap(w: number, h: number): ImageBitmap & { closes: number } {
  const bitmap = {
    width: w,
    height: h,
    closes: 0,
    close() {
      this.closes++;
    },
  };
  return bitmap;
}

/** A clock that moves 10 ms per reading (fetch start, fetched, decoded → 10 / 20 / 30). */
function steppingClock(): () => number {
  let ms = 0;
  return () => {
    ms += 10;
    return ms;
  };
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

describe('shell/loader createPageImageFactory — bitmap branch', () => {
  it('fetches bytes, builds an image/png Blob and resolves the tagged bitmap with split timings', async () => {
    const requests: FakeXhr[] = [];
    const blobs: Blob[] = [];
    const bitmap = fakeBitmap(64, 32);
    const create = createPageImageFactory({
      createBitmap: (blob) => {
        blobs.push(blob);
        return Promise.resolve(bitmap);
      },
      createRequest: () => {
        const xhr = new FakeXhr(PNG_BYTES);
        requests.push(xhr);
        return xhr;
      },
      now: steppingClock(),
    });
    const { image, timing } = await create('assets/atlas/main-3.png');
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('assets/atlas/main-3.png');
    expect(requests[0].responseType).toBe('arraybuffer');
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe('image/png');
    expect(blobs[0].size).toBe(PNG_BYTES.byteLength);
    expect(image).toBe(bitmap);
    expect((image as { pageUrl?: string }).pageUrl).toBe('assets/atlas/main-3.png');
    // The clock steps 10 ms a reading: start 10 → fetched 20 → decoded 30.
    expect(timing).toEqual({ loadMs: 10, decodeMs: 10 });
  });

  it('a failed byte fetch falls back to the Image branch for that URL (the bench URL case)', async () => {
    const elements: FakeImage[] = [];
    let bitmapCalls = 0;
    const create = createPageImageFactory({
      createBitmap: () => {
        bitmapCalls++;
        return Promise.reject(new Error('decode failed'));
      },
      createElement: () => {
        const image = new FakeImage();
        elements.push(image);
        image.settle();
        return image;
      },
      createRequest: () => new FakeXhr(null), // 404 → rejects
    });
    const { image, timing } = await create('assets/atlas/main.png');
    expect(bitmapCalls).toBe(0); // the fetch failed before the bitmap was asked for
    expect(elements).toHaveLength(1);
    expect(image).toBe(elements[0]);
    expect(elements[0].src).toBe('assets/atlas/main.png');
    expect(timing).toEqual({ loadMs: 0, decodeMs: 0 }); // no clock injected
  });

  it('a rejected createImageBitmap falls back to the Image branch too', async () => {
    const elements: FakeImage[] = [];
    const create = createPageImageFactory({
      createBitmap: () => Promise.reject(new Error('bad png')),
      createElement: () => {
        const image = new FakeImage();
        elements.push(image);
        image.settle();
        return image;
      },
      createRequest: () => new FakeXhr(PNG_BYTES),
    });
    const { image } = await create('assets/atlas/main.png');
    expect(image).toBe(elements[0]);
    expect(elements[0].src).toBe('assets/atlas/main.png');
  });

  it('if both branches fail the AssetLoadError of the Image branch surfaces', async () => {
    const create = createPageImageFactory({
      createBitmap: () => Promise.reject(new Error('bad png')),
      createElement: () => {
        const image = new FakeImage(true);
        image.settle();
        return image;
      },
      createRequest: () => new FakeXhr(PNG_BYTES),
    });
    await expect(create('assets/atlas/main.png')).rejects.toBeInstanceOf(AssetLoadError);
  });
});

describe('shell/loader createPageImageFactory — fallback-only engine', () => {
  it('without createBitmap the factory is the plain Image load, never an XHR', async () => {
    const requests: FakeXhr[] = [];
    const elements: FakeImage[] = [];
    const create = createPageImageFactory({
      createElement: () => {
        const image = new FakeImage();
        elements.push(image);
        image.settle();
        return image;
      },
      createRequest: () => {
        const xhr = new FakeXhr(PNG_BYTES);
        requests.push(xhr);
        return xhr;
      },
    });
    const { image } = await create('assets/atlas/main.png');
    expect(image).toBe(elements[0]);
    expect(requests).toHaveLength(0);
  });
});

describe('shell/loader loadPageImagesTimed', () => {
  it('runs the factory per URL in parallel, keeps order and reports progress', async () => {
    const starts: string[] = [];
    const progress: number[] = [];
    const bitmaps = new Map<string, ImageBitmap>();
    const { images, timings } = await loadPageImagesTimed(
      ['a.png', 'b.png', 'c.png'],
      (url) => {
        starts.push(url);
        const delay = url === 'a.png' ? 20 : url === 'b.png' ? 0 : 10;
        const bitmap = fakeBitmap(delay, 2);
        bitmaps.set(url, bitmap);
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ image: bitmap, timing: { loadMs: delay, decodeMs: 2 } });
          }, delay);
        });
      },
      (loaded, total) => {
        expect(total).toBe(3);
        progress.push(loaded);
      },
    );
    expect(starts).toEqual(['a.png', 'b.png', 'c.png']); // every load started up front
    expect(images).toEqual([bitmaps.get('a.png'), bitmaps.get('b.png'), bitmaps.get('c.png')]);
    expect(timings).toEqual([
      { loadMs: 20, decodeMs: 2 },
      { loadMs: 0, decodeMs: 2 },
      { loadMs: 10, decodeMs: 2 },
    ]);
    expect(progress[0]).toBe(0); // the `(0, total)` call before any request
    expect(progress.slice(1).sort()).toEqual([1, 2, 3]); // one per settled page
    expect(progress).toHaveLength(4);
  });

  it('rejects with the first AssetLoadError', async () => {
    const create = createPageImageFactory({
      createElement: () => {
        const image = new FakeImage();
        image.settle();
        return image;
      },
      createRequest: () => new FakeXhr(null), // every fetch 404s
    });
    const load = (url: string) =>
      url === 'ok.png'
        ? create(url).then((loaded) => ({ image: loaded.image, timing: loaded.timing }))
        : Promise.reject(new AssetLoadError(url));
    await expect(loadPageImagesTimed(['bad.png', 'ok.png'], load)).rejects.toMatchObject({
      url: 'bad.png',
    });
  });
});

describe('shell/loader tagPageImageUrl', () => {
  it('writes a plain own property and returns the same object', () => {
    const target: { pageUrl?: string } = {};
    expect(tagPageImageUrl(target, 'x.png')).toBe(target);
    expect(target.pageUrl).toBe('x.png');
  });
});
