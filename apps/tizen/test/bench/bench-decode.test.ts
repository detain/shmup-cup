/**
 * The TV render bench's decode scenario (plan R1-05 B4, `src/bench/decode.ts`) in Node: the stage
 * orchestration against a scripted host (what is timed, what is released, how a failing stage is
 * noted), the browser host on a fake window (XHR, an image on a blob URL with `decode()`,
 * `createImageBitmap`, the stage timeout), and the small helpers. The WebGL half runs on the TV and
 * in `pnpm bench` (`?scenario=decode`).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  BENCH_RUN_LENGTH,
  BENCH_SCENARIOS,
  DECODE_SCENARIO_ID,
  DECODE_SCENARIO_INDEX,
  HEADLESS_DECODE_REPETITIONS,
  MAX_DECODE_REPETITIONS,
  TV_DECODE_REPETITIONS,
  createDecodeHost,
  decodeRepetitionsFromSearch,
  failedDecodeRecord,
  measureDecode,
  pngEncodingOf,
  summarizeRuns,
  type BenchDecodePage,
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

/** Two pages: a 2048² RGBA one and a small PNG-8 one. */
const PAGES: BenchDecodePage[] = [
  { id: 'rgba-2048', what: 'big', width: 2048, height: 2048, url: 'assets/atlas/a.png' },
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
  it('follows the 172-scenario matrix as the run’s last page load', () => {
    expect(BENCH_SCENARIOS).toHaveLength(172);
    expect(DECODE_SCENARIO_ID).toBe('decode');
    expect(DECODE_SCENARIO_INDEX).toBe(172);
    expect(BENCH_RUN_LENGTH).toBe(173);
    expect(BENCH_SCENARIOS.some((s) => s.id === DECODE_SCENARIO_ID)).toBe(false);
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
      index: 172,
      webGLVersion: 1,
      repetitions: 3,
      imageDecode: true,
      imageBitmap: true,
      error: null,
      endedAt: 1_760_000_000_000,
    });
    const [big, small] = record.pages;
    expect(big).toEqual({
      id: 'rgba-2048',
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
      'progress rgba-2048 1/3',
      'progress zone-a 1/3',
      'progress rgba-2048 2/3',
      'progress zone-a 2/3',
      'progress rgba-2048 3/3',
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
      index: 172,
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
  options: { bitmap?: boolean; decode?: 'resolve' | 'reject' | 'none'; imageError?: boolean } = {},
) {
  const created: string[] = [];
  const revoked: string[] = [];
  const closed: number[] = [];
  const opened: string[] = [];
  const timers = new Map<number, () => void>();
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
  const win: DecodeWindow = {
    XMLHttpRequest: FakeXhr as unknown as DecodeWindow['XMLHttpRequest'],
    Image: FakeImage as unknown as DecodeWindow['Image'],
    Blob: class {
      constructor(readonly parts: unknown[]) {}
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
          createImageBitmap: (_blob: Blob) =>
            Promise.resolve({
              width: 4,
              height: 4,
              close: () => closed.push(1),
            } as unknown as ImageBitmap),
        }
      : {}),
  };
  return { win, created, revoked, closed, opened, timers };
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
