/**
 * The atlas manifest's delivery (plan R1-05): `loadAtlasManifest` fetches `assets/atlas/main.json`
 * with a fake `XMLHttpRequest` — status 0 (`file://` on the TVs) and 200 succeed; 404, an empty
 * body and a network error are `load` failures —, checks the digest against the build's
 * (`digest`), then the JSON, the format version (`version`: 1 and 2 are read) and the shape
 * (`parse`); `manifestDigest` is 32-bit FNV-1a over the bytes; `atlasPageUrls` joins the pages'
 * folder; and `loadImagesTimed` awaits `decode()` where an image has it (a rejection still counts)
 * and times every page.
 */
import { readFileSync } from 'node:fs';
import type { XhrLike } from '@shmup/audio-web';
import { describe, expect, it } from 'vitest';
import { formatManifest } from '../../../../scripts/assets/manifest.mjs';
import { buildAtlas } from '../../../../scripts/assets/pipeline.mjs';
import {
  ATLAS_MANIFEST_VERSIONS,
  AssetLoadError,
  AtlasManifestError,
  atlasPageUrls,
  loadAtlasManifest,
  loadImages,
  loadImagesTimed,
  manifestDigest,
  parseAtlasManifest,
  type AtlasManifestFailure,
  type LoadableImage,
} from '../../src/loader/index.js';

const { manifest } = buildAtlas();
/** The manifest file as the pipeline writes it (and the build ships it). */
const MANIFEST_TEXT = formatManifest(manifest);
const MANIFEST_BYTES = new TextEncoder().encode(MANIFEST_TEXT);
const URL_ = 'assets/atlas/main.json';

/** What a fake request answers. */
interface Answer {
  /** HTTP status (0 = a `file://` response). */
  readonly status?: number;
  /** The body (`null`: none). */
  readonly body?: Uint8Array | null;
  /** Fail with a network error instead. */
  readonly networkError?: boolean;
}

/**
 * A request factory whose requests answer asynchronously and record what was asked.
 *
 * @param answer - The answer.
 * @returns The factory and the log of `[method, url, responseType]`.
 */
function fakeXhr(answer: Answer) {
  const log: Array<[string, string, string]> = [];
  const create = (): XhrLike => {
    let method = '';
    let url = '';
    const request = {
      responseType: '',
      status: 0,
      response: null as unknown,
      onload: null as ((event: never) => unknown) | null,
      onerror: null as ((event: never) => unknown) | null,
      open(m: string, u: string) {
        method = m;
        url = u;
      },
      send() {
        log.push([method, url, request.responseType]);
        setTimeout(() => {
          if (answer.networkError === true) {
            request.onerror?.(undefined as never);
            return;
          }
          request.status = answer.status ?? 0;
          const body = answer.body === undefined ? MANIFEST_BYTES : answer.body;
          request.response = body === null ? null : body.slice().buffer;
          request.onload?.(undefined as never);
        }, 0);
      },
    };
    return request;
  };
  return { create, log };
}

/**
 * The failure a rejected load reports.
 *
 * @param promise - The load.
 * @returns The error.
 */
async function failure(promise: Promise<unknown>): Promise<AtlasManifestError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AtlasManifestError);
  return error as AtlasManifestError;
}

describe('shell/loader manifestDigest (R1-05)', () => {
  it('is 32-bit FNV-1a over the bytes, 8 hex digits', () => {
    expect(manifestDigest(new Uint8Array(0))).toBe('811c9dc5');
    expect(manifestDigest(new TextEncoder().encode('a'))).toBe('e40c292c');
    expect(manifestDigest(new TextEncoder().encode('foobar'))).toBe('bf9cf968');
    expect(manifestDigest(MANIFEST_BYTES)).toMatch(/^[0-9a-f]{8}$/);
    // One byte changed, another digest.
    const changed = MANIFEST_BYTES.slice();
    changed[changed.length - 2] ^= 1;
    expect(manifestDigest(changed)).not.toBe(manifestDigest(MANIFEST_BYTES));
  });
});

describe('shell/loader loadAtlasManifest (R1-05)', () => {
  it('reads the manifest over XHR as an arraybuffer, status 0 (file://) or 200', async () => {
    for (const status of [0, 200, 204]) {
      const xhr = fakeXhr({ status });
      const loaded = await loadAtlasManifest(URL_, manifestDigest(MANIFEST_BYTES), xhr.create);
      expect(loaded.manifest).toEqual(manifest);
      expect(loaded.digest).toBe(manifestDigest(MANIFEST_BYTES));
      expect(loaded.bytes).toBe(MANIFEST_BYTES.length);
      expect(xhr.log).toEqual([['GET', URL_, 'arraybuffer']]);
    }
  });

  it('skips the digest check when the build recorded none', async () => {
    const loaded = await loadAtlasManifest(URL_, undefined, fakeXhr({}).create);
    expect(loaded.manifest.pages).toEqual(manifest.pages);
  });

  it.each<[string, Answer, string]>([
    ['an HTTP error', { status: 404 }, 'status 404'],
    ['a server error', { status: 500 }, 'status 500'],
    ['a redirect it cannot follow', { status: 302 }, 'status 302'],
    ['an empty body', { status: 0, body: new Uint8Array(0) }, 'status 0'],
    ['no body', { status: 200, body: null }, 'status 200'],
    ['a network error', { networkError: true }, 'network error'],
  ])('rejects %s as a load failure', async (_label, answer, reason) => {
    const error = await failure(loadAtlasManifest(URL_, undefined, fakeXhr(answer).create));
    expect(error.failure).toBe<AtlasManifestFailure>('load');
    expect(error.url).toBe(URL_);
    expect(error.message).toBe(`${URL_}: ${reason}`);
    expect(error.name).toBe('AtlasManifestError');
  });

  it('rejects a manifest of another build (digest), before reading it', async () => {
    const error = await failure(
      loadAtlasManifest(URL_, '00000000', fakeXhr({ body: new TextEncoder().encode('{') }).create),
    );
    expect(error.failure).toBe('digest');
    expect(error.message).toBe(
      `${URL_}: digest ${manifestDigest(new TextEncoder().encode('{'))}, the build expects ` +
        '00000000 (a manifest of another build)',
    );
  });

  it('rejects text that is not a manifest (parse) and an unknown format version (version)', async () => {
    const answers: Array<[string, AtlasManifestFailure]> = [
      ['{', 'parse'],
      ['{"formatVersion":3,"pages":[]}', 'version'],
    ];
    for (const [text, kind] of answers) {
      const body = new TextEncoder().encode(text);
      const error = await failure(
        loadAtlasManifest(URL_, manifestDigest(body), fakeXhr({ body }).create),
      );
      expect(error.failure, text).toBe(kind);
    }
  });
});

describe('shell/loader parseAtlasManifest (R1-05)', () => {
  /**
   * A manifest document with overrides.
   *
   * @param patch - Fields to replace.
   * @returns The JSON text.
   */
  const doc = (patch: Record<string, unknown>): string =>
    JSON.stringify({
      formatVersion: 1,
      pages: [{ file: 'main.png', w: 1024, h: 1024 }],
      frames: {},
      sprites: {},
      animations: {},
      fonts: {},
      ...patch,
    });

  it('reads format 1 and format 2 (pages with a group)', () => {
    expect(ATLAS_MANIFEST_VERSIONS).toEqual([1, 2]);
    expect(parseAtlasManifest(MANIFEST_TEXT, URL_)).toEqual(manifest);
    const v2 = parseAtlasManifest(
      doc({
        formatVersion: 2,
        pages: [
          { file: 'main.png', w: 1024, h: 1024, group: 'common' },
          { file: 'main-1.png', w: 512, h: 256, group: 'zone-a' },
        ],
      }),
      URL_,
    );
    expect(v2.pages.map((page) => page.group)).toEqual(['common', 'zone-a']);
  });

  it.each([3, 0, -1, 1.5, '1', null, undefined])('rejects format version %s', (version) => {
    let error: unknown = null;
    try {
      parseAtlasManifest(doc({ formatVersion: version }), URL_);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(AtlasManifestError);
    expect((error as AtlasManifestError).failure).toBe('version');
    expect((error as AtlasManifestError).message).toMatch(/this build reads 1 or 2$/);
  });

  it.each<[string, string, string]>([
    ['not JSON', '{"formatVersion":', 'not JSON'],
    ['an array', '[]', 'not a JSON object'],
    ['null', 'null', 'not a JSON object'],
    ['a number', '7', 'not a JSON object'],
    ['no pages', doc({ pages: [] }), 'no pages'],
    ['pages not a list', doc({ pages: {} }), 'no pages'],
    ['a page without a file', doc({ pages: [{ w: 1, h: 1 }] }), 'page 0 is not a page entry'],
    ['a page in a sub-folder', doc({ pages: [{ file: '../x.png', w: 1, h: 1 }] }), 'page 0'],
    ['a page that is no PNG', doc({ pages: [{ file: 'main.json', w: 1, h: 1 }] }), 'page 0'],
    ['a page of zero width', doc({ pages: [{ file: 'main.png', w: 0, h: 1 }] }), 'page 0'],
    ['a fractional page', doc({ pages: [{ file: 'main.png', w: 1, h: 1.5 }] }), 'page 0'],
    ['a page as text', doc({ pages: ['main.png'] }), 'page 0'],
    ['no frames', doc({ frames: undefined }), 'no frames object'],
    ['frames as a list', doc({ frames: [] }), 'no frames object'],
    ['no sprites', doc({ sprites: null }), 'no sprites object'],
    ['no animations', doc({ animations: 1 }), 'no animations object'],
    ['no fonts', doc({ fonts: 'x' }), 'no fonts object'],
  ])('rejects %s (parse)', (_label, text, detail) => {
    let error: unknown = null;
    try {
      parseAtlasManifest(text, URL_);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(AtlasManifestError);
    expect((error as AtlasManifestError).failure).toBe('parse');
    expect((error as AtlasManifestError).message).toContain(`${URL_}: ${detail}`);
  });
});

describe('shell/loader atlasPageUrls (R1-05)', () => {
  it('joins the pages’ folder and file names, in page order', () => {
    const two = {
      ...manifest,
      pages: [
        { file: 'main.png', w: 8, h: 8 },
        { file: 'main-1.png', w: 4, h: 4 },
      ],
    };
    expect(atlasPageUrls('assets/atlas', two)).toEqual([
      'assets/atlas/main.png',
      'assets/atlas/main-1.png',
    ]);
    expect(atlasPageUrls('assets/atlas/', two)[0]).toBe('assets/atlas/main.png');
    expect(atlasPageUrls('', two)).toEqual(['main.png', 'main-1.png']);
  });
});

/** An image that loads on the next macrotask; `decode` is configurable. */
class DecodingImage implements LoadableImage {
  onload: LoadableImage['onload'] = null;
  onerror: LoadableImage['onerror'] = null;
  decode?: () => Promise<void>;
  decodes = 0;
  private url = '';

  /**
   * @param mode - `'none'` (no `decode`), `'resolve'` or `'reject'`.
   * @param clock - The fake clock, advanced by the load (10) and the decode (5).
   */
  constructor(
    mode: 'none' | 'resolve' | 'reject',
    private readonly clock: { now: number },
  ) {
    if (mode !== 'none') {
      this.decode = () => {
        this.decodes++;
        clock.now += 5;
        return mode === 'resolve' ? Promise.resolve() : Promise.reject(new Error('EncodingError'));
      };
    }
  }

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
      this.clock.now += 10;
      this.onload?.call(null as never, {} as Event);
    }, 0);
  }
}

describe('shell/loader loadImagesTimed (R1-05)', () => {
  it('awaits decode() where the image has it and times load and decode per page', async () => {
    const clock = { now: 100 };
    const images: DecodingImage[] = [];
    const progress: Array<[number, number]> = [];
    const result = await loadImagesTimed(
      ['a.png', 'b.png'],
      () => {
        const image = new DecodingImage('resolve', clock);
        images.push(image);
        return image;
      },
      (loaded, total) => progress.push([loaded, total]),
      () => clock.now,
    );
    expect(result.images).toEqual(images);
    expect(images.map((image) => image.decodes)).toEqual([1, 1]);
    // Both requests start at 100; the first loads at 110 and decodes to 115, the second loads at
    // 125 (its own +10 after the first decode) and decodes to 130.
    expect(result.timings).toEqual([
      { loadMs: 10, decodeMs: 5 },
      { loadMs: 25, decodeMs: 5 },
    ]);
    expect(progress).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
  });

  it('counts a rejected decode as loaded, and an image without decode() too', async () => {
    const clock = { now: 0 };
    const modes = ['reject', 'none'] as const;
    let i = 0;
    const result = await loadImagesTimed(
      ['a.png', 'b.png'],
      () => new DecodingImage(modes[i++], clock),
      undefined,
      () => clock.now,
    );
    expect(result.images).toHaveLength(2);
    expect(result.timings[1].decodeMs).toBe(0);
  });

  it('times nothing without a clock, and loadImages returns just the images', async () => {
    const clock = { now: 0 };
    const result = await loadImagesTimed(['a.png'], () => new DecodingImage('resolve', clock));
    expect(result.timings).toEqual([{ loadMs: 0, decodeMs: 0 }]);
    const images = await loadImages(['a.png'], () => new DecodingImage('resolve', clock));
    expect(images).toHaveLength(1);
  });

  it('still rejects with the URL of the first page that fails', async () => {
    const clock = { now: 0 };
    await expect(
      loadImagesTimed(['ok.png', 'bad.png'], () => new DecodingImage('resolve', clock)),
    ).rejects.toEqual(new AssetLoadError('bad.png'));
  });
});

describe('shell/loader — the shipped manifest is what the pipeline writes', () => {
  it('assets/generated/atlas/main.json parses and digests like the pipeline output', () => {
    const onDisk = readFileSync(
      new URL('../../../../assets/generated/atlas/main.json', import.meta.url),
    );
    expect(parseAtlasManifest(onDisk.toString('utf8'), URL_)).toEqual(manifest);
    expect(manifestDigest(new Uint8Array(onDisk))).toBe(manifestDigest(MANIFEST_BYTES));
  });
});
