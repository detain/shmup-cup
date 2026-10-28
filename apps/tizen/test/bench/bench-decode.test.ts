/**
 * The TV render bench's decode scenario (plan R1-05 B4, `src/bench/decode.ts`) in Node: the stage
 * orchestration against a scripted host (what is timed, what is released, how a failing stage is
 * noted), the browser host on a fake window (XHR, an image on a blob URL with `decode()`,
 * `createImageBitmap`, the stage timeout), and the small helpers. The WebGL half runs on the TV and
 * in `pnpm bench` (`?scenario=decode`). The SVG arm's rows (plan R-SVG WO-1) prove the encoding
 * sniff, the skipped `createImageBitmap` stage, and the blob typed by the file.
 */
import { describe, expect, it, vi } from 'vitest';
import { SVG_DECODE_ENCODING, SVG_DECODE_MIME } from '../../src/bench/decode.js';
import { SVG_MIME_TYPE } from '../../scripts/bench-svg.mjs';
import {
  BENCH_RUN_LENGTH,
  BENCH_SCENARIOS,
  DECODE_SCENARIO_ID,
  DECODE_SCENARIO_INDEX,
  REWIND_SCENARIO_ID,
  REWIND_SCENARIO_INDEX,
  HEADLESS_DECODE_REPETITIONS,
  MAX_DECODE_REPETITIONS,
  STANDIN_SCENARIO_ID,
  STANDIN_SVG_SCENARIO_ID,
  STANDIN_SVG_SCENARIO_INDEX,
  STANDIN_SCENARIO_INDEX,
  TV_DECODE_REPETITIONS,
  createDecodeHost,
  decodeRepetitionsFromSearch,
  failedDecodeRecord,
  measureDecode,
  measureVideoDecode,
  pngEncodingOf,
  summarizeRuns,
  VIDEO_DECODE_ENCODING,
  type BenchDecodePage,
  type BenchVideoSpec,
  type DecodeHost,
  type DecodeMeasureOptions,
  type DecodeTexture,
  type DecodeWindow,
} from '../../src/bench/index.js';

/** The first 26 bytes of a PNG of colour type `type`. */
function pngHead(type: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
  bytes[25] = type;
  return bytes;
}

/** Two pages: a big stand-in zone A page and a small PNG-8 one. */
const PAGES: BenchDecodePage[] = [
  { id: 'standin-zone-a', what: 'big', width: 2048, height: 2048, url: 'assets/atlas/a.png' },
  { id: 'zone-a', what: 'small', width: 256, height: 128, url: 'assets/atlas/b.png' },
];

/** Engine facts for the record. */
const FACTS: DecodeMeasureOptions = {
  repetitions: 3,
  webGLVersion: 1,
  imageDecode: true,
  wallClock: () => 1_760_000_000_000,
};

/** What the scripted host saw. */
interface Script {
  readonly host: DecodeHost;
  readonly log: string[];
  readonly destroyed: number[];
  readonly released: string[];
}

/**
 * A scripted host whose clock advances by fixed steps per stage: fetch 10 ms, image decode 100 ms,
 * upload 5 ms CPU + 20 ms on `finish()`, bitmap 80 ms. Page `b.png`'s second fetch fails when asked.
 *
 * @param options - `bitmap`: whether the engine has `createImageBitmap`; `failFetch` /
 *   `failDecode` / `mismatch`: break a stage of the small page.
 * @returns The host and what it saw.
 */
function scriptedHost(
  options: { bitmap?: boolean; failFetch?: boolean; failDecode?: boolean; mismatch?: boolean } = {},
): Script {
  let clock = 0;
  let pending = 0;
  const log: string[] = [];
  const destroyed: number[] = [];
  const released: string[] = [];
  let textures = 0;
  const host: DecodeHost = {
    now: () => clock,
    fetch: (url) => {
      log.push(`fetch ${url}`);
      clock += 10;
      if (options.failFetch === true && url.endsWith('b.png')) {
        return Promise.reject(new Error('status 404'));
      }
      if (url.endsWith('.svg')) {
        // The SVG arm's page (plan R-SVG WO-1): E3 text of a big page, the sniff's `<svg` first.
        const text =
          '<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1024" ' +
          'viewBox="0 0 2048 1024" shape-rendering="crispEdges"><path fill="#102030" d="M0 0h1z"/></svg>';
        const bytes = new ArrayBuffer(300_000);
        new Uint8Array(bytes).set(new TextEncoder().encode(text));
        return Promise.resolve(bytes);
      }
      const head = pngHead(url.endsWith('a.png') ? 6 : 3);
      const bytes = new ArrayBuffer(url.endsWith('a.png') ? 2_500_000 : 2_600);
      new Uint8Array(bytes).set(head);
      return Promise.resolve(bytes);
    },
    decodeImage: (bytes) => {
      log.push(`decode ${bytes.byteLength}`);
      clock += 100;
      if (options.failDecode === true && bytes.byteLength < 10_000) {
        return Promise.reject(new Error('the image did not decode'));
      }
      return Promise.resolve({
        image: { size: bytes.byteLength },
        release: () => released.push(`image ${bytes.byteLength}`),
      });
    },
    decodeUrl: (url, repetition) => {
      log.push(`decodeUrl ${url} ${repetition}`);
      clock += 110;
      return Promise.resolve({ image: { url }, release: () => released.push(`url ${url}`) });
    },
    decodeBitmap:
      options.bitmap === false
        ? null
        : (bytes) => {
            log.push(`bitmap ${bytes.byteLength}`);
            clock += 80;
            return Promise.resolve({
              image: { bitmap: bytes.byteLength },
              release: () => released.push(`bitmap ${bytes.byteLength}`),
            });
          },
    createSource: (_image, page): DecodeTexture => {
      if (options.mismatch === true && page.id === 'zone-a') {
        throw new RangeError('atlas: page b.png is 1×1 but the manifest says 256×128');
      }
      const id = ++textures;
      return {
        destroy: () => {
          destroyed.push(id);
        },
      };
    },
    upload: () => {
      log.push('upload');
      clock += 5;
      pending += 20;
    },
    finish: () => {
      clock += pending;
      pending = 0;
    },
    progress: (text) => log.push(`progress ${text}`),
  };
  return { host, log, destroyed, released };
}

describe('decode scenario: its place in the run', () => {
  it('follows the 194-scenario matrix, then the stand-in loads and the rewind page (R3-04.M4a, R2 TL-3, R-SVG WO-2)', () => {
    expect(BENCH_SCENARIOS).toHaveLength(194);
    expect(DECODE_SCENARIO_ID).toBe('decode');
    expect(DECODE_SCENARIO_INDEX).toBe(194);
    expect(BENCH_RUN_LENGTH).toBe(198);
    expect(BENCH_SCENARIOS.some((s) => s.id === DECODE_SCENARIO_ID)).toBe(false);
    expect(STANDIN_SCENARIO_ID).toBe('standin-zone');
    expect(STANDIN_SCENARIO_INDEX).toBe(DECODE_SCENARIO_INDEX + 1);
    // The SVG arm's stand-in load sits right after the PNG one and before the rewind page that
    // closes the run (plan R-SVG WO-2): the index the PNG arm reserves and passes over, so both arms
    // share one run length and every index below it means the same row on both.
    expect(STANDIN_SVG_SCENARIO_ID).toBe('standin-zone-svg');
    expect(STANDIN_SVG_SCENARIO_INDEX).toBe(STANDIN_SCENARIO_INDEX + 1);
    expect(STANDIN_SVG_SCENARIO_INDEX).toBe(BENCH_SCENARIOS.length + 2);
    expect(REWIND_SCENARIO_INDEX).toBe(STANDIN_SVG_SCENARIO_INDEX + 1);
    expect(REWIND_SCENARIO_INDEX + 1).toBe(BENCH_RUN_LENGTH);
    expect(BENCH_SCENARIOS.some((s) => s.id === STANDIN_SCENARIO_ID)).toBe(false);
    expect(BENCH_SCENARIOS.some((s) => s.id === REWIND_SCENARIO_ID)).toBe(false);
    expect(BENCH_SCENARIOS.some((s) => s.id === STANDIN_SVG_SCENARIO_ID)).toBe(false);
    expect([TV_DECODE_REPETITIONS, HEADLESS_DECODE_REPETITIONS]).toEqual([8, 2]);
  });

  it('reads ?reps= as whole repetitions within bounds', () => {
    expect(decodeRepetitionsFromSearch('?reps=3', 8)).toBe(3);
    expect(decodeRepetitionsFromSearch('', 8)).toBe(8);
    expect(decodeRepetitionsFromSearch('?reps=0', 8)).toBe(8);
    expect(decodeRepetitionsFromSearch('?reps=2.5', 8)).toBe(8);
    expect(decodeRepetitionsFromSearch(`?reps=${MAX_DECODE_REPETITIONS + 1}`, 8)).toBe(8);
    expect(decodeRepetitionsFromSearch(`?reps=${MAX_DECODE_REPETITIONS}`, 8)).toBe(
      MAX_DECODE_REPETITIONS,
    );
  });

  it('reads a PNG’s encoding from its header', () => {
    expect(pngEncodingOf(pngHead(6))).toBe('rgba');
    expect(pngEncodingOf(pngHead(3))).toBe('png8');
    expect(pngEncodingOf(pngHead(2))).toBe('type 2');
    expect(pngEncodingOf(new Uint8Array(30))).toBe('unknown');
    expect(pngEncodingOf(new Uint8Array(4))).toBe('unknown');
  });

  it('summarizes repetitions as [min, p50, p95, max], or null for none', () => {
    expect(summarizeRuns([3, 1, 2])).toEqual([1, 2, 3, 3]);
    expect(summarizeRuns([])).toBeNull();
  });
});

describe('decode scenario: measureDecode', () => {
  it('times every stage of every page and repetition, and releases everything', async () => {
    const script = scriptedHost();
    const record = await measureDecode(script.host, PAGES, FACTS);
    expect(record).toMatchObject({
      scenario: 'decode',
      index: DECODE_SCENARIO_INDEX,
      webGLVersion: 1,
      repetitions: 3,
      imageDecode: true,
      imageBitmap: true,
      error: null,
      endedAt: 1_760_000_000_000,
    });
    const [big, small] = record.pages;
    expect(big).toEqual({
      id: 'standin-zone-a',
      what: 'big',
      width: 2048,
      height: 2048,
      encoding: 'rgba',
      bytes: 2_500_000,
      textureBytes: 2048 * 2048 * 4,
      repetitions: 3,
      fetchMs: [10, 10, 10, 10],
      decodeMs: [100, 100, 100, 100],
      uploadMs: [5, 5, 5, 5],
      uploadSyncedMs: [25, 25, 25, 25],
      totalMs: [135, 135, 135, 135],
      firstTotalMs: 135,
      bitmapMs: [80, 80, 80, 80],
      bitmapUploadMs: [25, 25, 25, 25],
      error: null,
    });
    expect(small.encoding).toBe('png8');
    expect(small.bytes).toBe(2_600);
    // Repetitions outer, pages inner; the progress is shown before each page's measurement.
    expect(script.log.filter((line) => line.startsWith('progress'))).toEqual([
      'progress standin-zone-a 1/3',
      'progress zone-a 1/3',
      'progress standin-zone-a 2/3',
      'progress zone-a 2/3',
      'progress standin-zone-a 3/3',
      'progress zone-a 3/3',
    ]);
    // Two textures per page and repetition (the image's and the bitmap's), all destroyed.
    expect(script.destroyed).toHaveLength(2 * 2 * 3);
    expect(script.released.filter((r) => r.startsWith('image'))).toHaveLength(6);
    expect(script.released.filter((r) => r.startsWith('bitmap'))).toHaveLength(6);
  });

  it('leaves the bitmap figures out where the engine has no createImageBitmap', async () => {
    const record = await measureDecode(scriptedHost({ bitmap: false }).host, PAGES, FACTS);
    expect(record.imageBitmap).toBe(false);
    expect(record.pages[0].bitmapMs).toBeNull();
    expect(record.pages[0].bitmapUploadMs).toBeNull();
    expect(record.pages[0].decodeMs).toEqual([100, 100, 100, 100]);
  });

  it('decodes from the URL when the fetch fails, and says so', async () => {
    const script = scriptedHost({ failFetch: true });
    const record = await measureDecode(script.host, PAGES, FACTS);
    const small = record.pages[1];
    expect(small.fetchMs).toBeNull();
    expect(small.decodeMs).toEqual([110, 110, 110, 110]);
    expect(small.uploadSyncedMs).toEqual([25, 25, 25, 25]);
    // No file → GPU total without the fetch, and no bitmap (it needs the bytes).
    expect(small.totalMs).toBeNull();
    expect(small.firstTotalMs).toBe(0);
    expect(small.bitmapMs).toBeNull();
    expect(small.error).toBe(
      'fetch: status 404; fetch: decoded from the URL instead (fetch + decode)',
    );
    expect(script.log).toContain('decodeUrl assets/atlas/b.png 0');
    expect(script.log).toContain('decodeUrl assets/atlas/b.png 2');
    // The big page is unaffected.
    expect(record.pages[0].error).toBeNull();
  });

  it('notes a failed decode or a size mismatch per page and carries on', async () => {
    const decode = await measureDecode(scriptedHost({ failDecode: true }).host, PAGES, FACTS);
    expect(decode.pages[1].decodeMs).toBeNull();
    expect(decode.pages[1].uploadMs).toBeNull();
    expect(decode.pages[1].error).toContain('decode: the image did not decode');
    // The bitmap path does not use the image: it still decodes and uploads the bytes.
    expect(decode.pages[1].bitmapMs).toEqual([80, 80, 80, 80]);
    expect(decode.pages[0].error).toBeNull();

    const script = scriptedHost({ mismatch: true });
    const mismatch = await measureDecode(script.host, PAGES, FACTS);
    expect(mismatch.pages[1].uploadMs).toBeNull();
    expect(mismatch.pages[1].error).toContain('upload: atlas: page b.png is 1×1');
    expect(mismatch.pages[1].error).toContain('bitmap: atlas: page b.png is 1×1');
    // A source that was never made needs no destroying, but the decoded images are released.
    expect(script.destroyed).toHaveLength(2 * 3);
    expect(script.released.filter((r) => r === 'image 2600')).toHaveLength(3);
    expect(script.released.filter((r) => r === 'bitmap 2600')).toHaveLength(3);
  });

  it('records a scenario that could not run at all', () => {
    expect(failedDecodeRecord('Error: no WebGL', FACTS)).toEqual({
      scenario: 'decode',
      index: DECODE_SCENARIO_INDEX,
      webGLVersion: 1,
      repetitions: 3,
      imageDecode: true,
      imageBitmap: false,
      pages: [],
      error: 'Error: no WebGL',
      endedAt: 1_760_000_000_000,
    });
  });
});

/** A fake browser window for {@link createDecodeHost}. */
function fakeWindow(
  options: {
    bitmap?: boolean;
    decode?: 'resolve' | 'reject' | 'none';
    imageError?: boolean;
    video?: 'ok' | 'error';
  } = {},
) {
  const created: string[] = [];
  const revoked: string[] = [];
  const closed: number[] = [];
  const opened: string[] = [];
  const videos: FakeVideo[] = [];
  const timers = new Map<number, () => void>();
  const blobTypes: string[] = [];
  let nextTimer = 0;
  /** An XHR answering with 30 bytes (status 0, as `file://` does). */
  class FakeXhr {
    responseType = '';
    status = 0;
    response: ArrayBuffer | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    open(_method: string, url: string): void {
      opened.push(url);
    }
    send(): void {
      this.response = pngHead(6).buffer as ArrayBuffer;
      void Promise.resolve().then(() => this.onload?.());
    }
  }
  /** An image that loads (or fails) asynchronously, with an optional `decode()`. */
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    src = '';
    decode?: () => Promise<void>;
    constructor() {
      if (options.decode === 'resolve') this.decode = () => Promise.resolve();
      if (options.decode === 'reject')
        this.decode = () => Promise.reject(new Error('EncodingError'));
      let src = '';
      Object.defineProperty(this, 'src', {
        get: () => src,
        set: (value: string) => {
          src = value;
          void Promise.resolve().then(() => {
            if (options.imageError === true) this.onerror?.();
            else this.onload?.();
          });
        },
      });
    }
  }
  /**
   * A video surface: `src` fires `loadeddata` (or `error`) asynchronously; `removeAttribute` and
   * `load` stand in for the release, counted on the instance.
   */
  class FakeVideo {
    muted = false;
    preload = '';
    src = '';
    onloadeddata: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readonly removed: string[] = [];
    loaded = 0;
    play(): Promise<void> {
      return Promise.resolve();
    }
    removeAttribute(name: string): void {
      this.removed.push(name);
    }
    load(): void {
      this.loaded++;
    }
    constructor() {
      videos.push(this);
      let src = '';
      Object.defineProperty(this, 'src', {
        get: () => src,
        set: (value: string) => {
          src = value;
          void Promise.resolve().then(() => {
            if (options.video === 'error') this.onerror?.();
            else this.onloadeddata?.();
          });
        },
      });
    }
  }
  const win: DecodeWindow = {
    XMLHttpRequest: FakeXhr as unknown as DecodeWindow['XMLHttpRequest'],
    Image: FakeImage as unknown as DecodeWindow['Image'],
    Blob: class {
      constructor(
        readonly parts: unknown[],
        options?: { type?: string },
      ) {
        blobTypes.push(options?.type ?? '');
      }
    } as unknown as typeof Blob,
    URL: {
      createObjectURL: () => {
        const url = `blob:${created.length}`;
        created.push(url);
        return url;
      },
      revokeObjectURL: (url: string) => {
        revoked.push(url);
      },
    },
    performance: { now: () => 0 },
    setTimeout: (handler: () => void) => {
      timers.set(++nextTimer, handler);
      return nextTimer;
    },
    clearTimeout: (id: unknown) => {
      timers.delete(id as number);
    },
    ...(options.bitmap === true
      ? {
          createImageBitmap: (_source: Blob | HTMLVideoElement) =>
            Promise.resolve({
              width: 4,
              height: 4,
              close: () => closed.push(1),
            } as unknown as ImageBitmap),
        }
      : {}),
    ...(options.video === undefined
      ? {}
      : { Video: FakeVideo as unknown as DecodeWindow['Video'] }),
  };
  return { win, created, revoked, closed, opened, videos, timers, blobTypes };
}

/**
 * A host on a fake window.
 *
 * @param win - The window.
 * @returns The host.
 */
function hostOn(win: DecodeWindow): DecodeHost {
  return createDecodeHost({
    win,
    createSource: () => ({ destroy: () => {} }),
    upload: () => {},
    finish: () => {},
  });
}

describe('decode scenario: the browser host', () => {
  it('fetches with XHR and decodes on a blob URL, awaiting decode(), then revokes it', async () => {
    const fake = fakeWindow({ decode: 'resolve' });
    const host = hostOn(fake.win);
    const bytes = await host.fetch('assets/atlas/a.png');
    expect(fake.opened).toEqual(['assets/atlas/a.png']);
    expect(pngEncodingOf(new Uint8Array(bytes))).toBe('rgba');
    const decoded = await host.decodeImage(bytes);
    expect((decoded.image as { src: string }).src).toBe('blob:0');
    expect(fake.revoked).toEqual([]);
    decoded.release();
    expect(fake.revoked).toEqual(['blob:0']);
    // Every settled stage cleared its timeout.
    expect(fake.timers.size).toBe(0);
  });

  it('counts a rejected decode() as decoded, and works without decode()', async () => {
    const rejected = hostOn(fakeWindow({ decode: 'reject' }).win);
    await expect(rejected.decodeImage(new ArrayBuffer(8))).resolves.toBeDefined();
    const old = hostOn(fakeWindow({ decode: 'none' }).win);
    await expect(old.decodeImage(new ArrayBuffer(8))).resolves.toBeDefined();
  });

  it('rejects an image that does not decode, revoking its URL', async () => {
    const fake = fakeWindow({ imageError: true });
    await expect(hostOn(fake.win).decodeImage(new ArrayBuffer(8))).rejects.toThrow(
      'the image did not decode',
    );
    expect(fake.revoked).toEqual(['blob:0']);
  });

  it('decodes from a URL past the image cache, one URL per repetition', async () => {
    const host = hostOn(fakeWindow().win);
    const first = await host.decodeUrl('assets/atlas/a.png', 0);
    const third = await host.decodeUrl('assets/atlas/a.png', 2);
    expect((first.image as { src: string }).src).toBe('assets/atlas/a.png');
    expect((third.image as { src: string }).src).toBe('assets/atlas/a.png?rep=2');
  });

  it('uses createImageBitmap where the window has it, and closes the bitmap on release', async () => {
    expect(hostOn(fakeWindow().win).decodeBitmap).toBeNull();
    const fake = fakeWindow({ bitmap: true });
    const host = hostOn(fake.win);
    const decodeBitmap = host.decodeBitmap;
    expect(decodeBitmap).not.toBeNull();
    const bitmap = await decodeBitmap!(new ArrayBuffer(8));
    bitmap.release();
    expect(fake.closed).toEqual([1]);
  });

  it('fails a stage that never settles once its timeout fires', async () => {
    const fake = fakeWindow();
    /** An XHR that never answers. */
    class SilentXhr {
      responseType = '';
      status = 0;
      response = null;
      onload = null;
      onerror = null;
      open(): void {}
      send(): void {}
    }
    const host = createDecodeHost({
      win: { ...fake.win, XMLHttpRequest: SilentXhr as unknown as DecodeWindow['XMLHttpRequest'] },
      createSource: () => ({ destroy: () => {} }),
      upload: () => {},
      finish: () => {},
      timeoutMs: 5,
    });
    const pending = host.fetch('assets/atlas/a.png');
    expect(fake.timers.size).toBe(1);
    for (const handler of fake.timers.values()) handler();
    await expect(pending).rejects.toThrow('fetch timed out after 5 ms');
  });

  it('times with the window clock and forwards the renderer’s side', () => {
    const upload = vi.fn();
    const finish = vi.fn();
    const fake = fakeWindow();
    const host = createDecodeHost({
      win: { ...fake.win, performance: { now: () => 42 } },
      createSource: () => ({ destroy: () => {} }),
      upload,
      finish,
    });
    expect(host.now()).toBe(42);
    host.upload({ destroy: () => {} });
    host.finish();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledTimes(1);
  });
});

describe('the video rows (plan v20x HARBENCH S8)', () => {
  /** One clip, in the shape the virtual module ships. */
  const CLIPS: BenchVideoSpec[] = [
    {
      id: 'attract',
      what: 'Attract clip',
      width: 640,
      height: 360,
      url: 'assets/video/attract.mp4',
    },
  ];

  /** Facts for the video scenario — two repetitions cache-bust the URLs. */
  const VIDEO_FACTS: DecodeMeasureOptions = {
    repetitions: 2,
    webGLVersion: 1,
    imageDecode: true,
    wallClock: () => 1_760_000_000_000,
  };

  /**
   * A scripted surface host: the clock advances fetch 3 ms, surface load 40 ms, the pull 10 ms,
   * upload 5 ms CPU + 20 ms per `finish()`.
   *
   * @param fail - `'open'` omits the surface entirely, `'pull'` omits the bitmap pull.
   * @returns The host, the closed bitmaps, the released surfaces and the opened URLs.
   */
  function videoHost(fail: 'open' | 'pull' | 'none' = 'none') {
    let clock = 0;
    const closed: number[] = [];
    const released: number[] = [];
    const urls: string[] = [];
    const host: DecodeHost = {
      now: () => clock,
      fetch: () => {
        clock += 3;
        return Promise.resolve(new ArrayBuffer(99));
      },
      decodeImage: () => Promise.resolve({ image: null, release: () => {} }),
      decodeUrl: () => Promise.resolve({ image: null, release: () => {} }),
      decodeBitmap: null,
      createSource: () => ({ destroy: () => {} }),
      upload: () => {
        clock += 5;
      },
      finish: () => {
        clock += 20;
      },
      ...(fail === 'open'
        ? {}
        : {
            openVideo: (url: string, repetition: number) => {
              urls.push(`${url}@${repetition}`);
              clock += 40;
              return Promise.resolve({
                image: { repetition },
                release: () => {
                  released.push(repetition);
                },
              });
            },
          }),
      ...(fail === 'pull'
        ? {}
        : {
            pullBitmap: (image: unknown) => {
              clock += 10;
              return Promise.resolve({
                close: () => closed.push((image as { repetition: number }).repetition),
              } as unknown as ImageBitmap);
            },
          }),
    };
    return { host, closed, released, urls };
  }

  it('folds load, pull and synced upload onto one row per clip', async () => {
    const { host, closed, released, urls } = videoHost();
    const rows = await measureVideoDecode(host, CLIPS, VIDEO_FACTS);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: 'video-attract',
      what: 'Attract clip',
      width: 640,
      height: 360,
      encoding: VIDEO_DECODE_ENCODING,
      bytes: 99,
      textureBytes: 640 * 360 * 4,
      repetitions: 2,
      fetchMs: [40, 40, 40, 40],
      decodeMs: null,
      uploadMs: null,
      uploadSyncedMs: null,
      totalMs: [75, 75, 75, 75],
      firstTotalMs: 75,
      bitmapMs: [10, 10, 10, 10],
      bitmapUploadMs: [25, 25, 25, 25],
      error: null,
    });
    // The bytes are fetched once (rep 0 only); the surfaces cache-bust like the image pages.
    expect(urls).toEqual(['assets/video/attract.mp4@0', 'assets/video/attract.mp4@1']);
    expect(closed).toEqual([0, 1]);
    expect(released).toEqual([0, 1]);
  });

  it('notes the missing surface on every clip, without touching the host', async () => {
    for (const fail of ['open', 'pull'] as const) {
      const { host, urls } = videoHost(fail);
      const rows = await measureVideoDecode(host, CLIPS, VIDEO_FACTS);
      expect(rows[0].error, fail).toBe('video surface unavailable');
      expect(rows[0].repetitions, fail).toBe(0);
      expect(rows[0].bytes, fail).toBe(0);
      expect(rows[0].fetchMs, fail).toBeNull();
      expect(rows[0].firstTotalMs, fail).toBe(0);
      expect(urls, fail).toEqual([]);
    }
  });

  it('opens the fake surface through the real host, and releases it', async () => {
    const fake = fakeWindow({ bitmap: true, video: 'ok' });
    const host = hostOn(fake.win);
    expect(host.openVideo).not.toBeNull();
    const rows = await measureVideoDecode(host, CLIPS, {
      ...VIDEO_FACTS,
      repetitions: 1,
    });
    expect(rows[0].id).toBe('video-attract');
    expect(rows[0].encoding).toBe(VIDEO_DECODE_ENCODING);
    expect(rows[0].error).toBeNull();
    expect(rows[0].repetitions).toBe(1);
    expect(rows[0].bytes).toBe(32); // the fake XHR's answer
    expect(fake.videos).toHaveLength(1);
    expect(fake.videos[0].muted).toBe(true);
    expect(fake.videos[0].removed).toEqual(['src']);
    expect(fake.videos[0].loaded).toBe(1);
    expect(fake.closed).toHaveLength(1); // the pulled bitmap was closed
  });

  it('notes the clip whose surface errors, with the bytes it did fetch', async () => {
    const fake = fakeWindow({ bitmap: true, video: 'error' });
    const rows = await measureVideoDecode(hostOn(fake.win), CLIPS, {
      ...VIDEO_FACTS,
      repetitions: 1,
    });
    expect(rows[0].error).toContain('video: the clip did not load');
    expect(rows[0].repetitions).toBe(0);
    expect(rows[0].bytes).toBe(32);
    expect(fake.videos[0].removed).toEqual(['src']); // released even on failure
  });

  it('has no surface on a window without Video (the old fakes keep working)', () => {
    const host = hostOn(fakeWindow({ bitmap: true }).win);
    expect(host.openVideo).toBeNull();
  });
});

describe('the SVG arm page: the encoding sniff and the createImageBitmap guard (plan R-SVG WO-1)', () => {
  /** The stand-in zone A page of the SVG arm (the shape the emitter's largest page has). */
  const SVG_PAGE: BenchDecodePage = {
    id: 'standin-zone-a',
    what: 'big',
    width: 2048,
    height: 1024,
    url: 'assets/atlas/standin-zone-a.svg',
  };

  it('reads an SVG page as svg-e3 and never hands it to createImageBitmap', async () => {
    const s = scriptedHost(); // the scripted host HAS decodeBitmap — the file, not the engine, skips
    const record = await measureDecode(s.host, [SVG_PAGE], { ...FACTS, repetitions: 2 });
    const row = record.pages[0];
    expect(row.encoding).toBe(SVG_DECODE_ENCODING);
    expect(row.error).toBeNull();
    // The bitmap stage is the one the guard skips: no `bitmap` log line, null summaries.
    expect(s.log.filter((l) => l.startsWith('bitmap '))).toEqual([]);
    expect(row.bitmapMs).toBeNull();
    expect(row.bitmapUploadMs).toBeNull();
    // The other stages still measured (the row says what the TV took, not that it took nothing).
    expect(record.imageBitmap).toBe(true);
    expect(row.fetchMs).not.toBeNull();
    expect(row.decodeMs).not.toBeNull();
    expect(row.uploadMs).not.toBeNull();
  });

  it('measures a PNG page and an SVG page in one scenario without cross-contamination', async () => {
    const s = scriptedHost();
    const record = await measureDecode(s.host, [PAGES[1], SVG_PAGE], {
      ...FACTS,
      repetitions: 1,
    });
    // b.png is the PNG-8 page; its bitmap stage ran as always (colour type 3 at byte 25).
    expect(record.pages[0].encoding).toBe('png8');
    expect(record.pages[0].bitmapMs).not.toBeNull();
    expect(s.log.some((l) => l.startsWith('bitmap 2600'))).toBe(true);
    // The svg row: sniffed by content (the url ends .svg but the reader never looks at it).
    expect(record.pages[1].encoding).toBe(SVG_DECODE_ENCODING);
    expect(s.log.filter((l) => l.startsWith('bitmap 300000'))).toEqual([]);
  });

  it('types the blob by the file: SVG text as image/svg+xml, a PNG stays image/png', async () => {
    const fake = fakeWindow({ decode: 'resolve' });
    const host = hostOn(fake.win);
    const text = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2"></svg>',
    );
    const svg = text.buffer.slice(text.byteOffset, text.byteOffset + text.byteLength);
    await host.decodeImage(svg);
    expect(fake.blobTypes).toEqual([SVG_DECODE_MIME]);
    await host.decodeImage(new ArrayBuffer(8));
    expect(fake.blobTypes).toEqual([SVG_DECODE_MIME, 'image/png']);
    // The bitmap route types the same way (even though measureDecode never calls it for svg).
    const fake2 = fakeWindow({ bitmap: true });
    const decodeBitmap = hostOn(fake2.win).decodeBitmap;
    expect(decodeBitmap).not.toBeNull();
    await decodeBitmap!(svg);
    expect(fake2.blobTypes).toEqual([SVG_DECODE_MIME]);
  });

  it('the runtime MIME constant equals the build side (one string, pinned across the trees)', () => {
    expect(SVG_DECODE_MIME).toBe(SVG_MIME_TYPE);
    expect(SVG_DECODE_ENCODING).toBe('svg-e3');
  });
});
