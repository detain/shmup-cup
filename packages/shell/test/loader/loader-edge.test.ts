/**
 * Edge cases of the boot loaders: images that fire their handlers twice or error after
 * loading, partial progress before a failure, duplicate and verbatim relative URLs; content
 * owners called once per kind with that kind's files in path order, owner exceptions, files
 * with a broken header (never foreign), and a non-list argument.
 */
import type { ContentFile } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  AssetLoadError,
  loadGameContent,
  loadImages,
  type LoadableImage,
} from '../../src/loader/index.js';

/** An image the test settles by hand. */
class ManualImage implements LoadableImage {
  onload: LoadableImage['onload'] = null;
  onerror: LoadableImage['onerror'] = null;
  src = '';

  /** Fires `onload` (if still set). */
  load(): void {
    this.onload?.call(null as never, {} as Event);
  }

  /** Fires `onerror` (if still set). */
  fail(): void {
    this.onerror?.call(null as never, 'error');
  }
}

/** @returns A settled task queue. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Loads `urls` with manual images.
 *
 * @param urls - URLs.
 */
function manualLoad(urls: readonly string[]) {
  const images: ManualImage[] = [];
  const progress: Array<[number, number]> = [];
  let settled: 'pending' | 'resolved' | 'rejected' = 'pending';
  let reason: unknown = null;
  const promise = loadImages(
    urls,
    () => {
      const image = new ManualImage();
      images.push(image);
      return image;
    },
    (loaded, total) => progress.push([loaded, total]),
  ).then(
    (value) => {
      settled = 'resolved';
      return value;
    },
    (error: unknown) => {
      settled = 'rejected';
      reason = error;
      return [];
    },
  );
  return { images, progress, promise, state: () => settled, reason: () => reason };
}

describe('shell/loader loadImages (edge)', () => {
  it('sets each relative URL verbatim and creates one image per URL, duplicates included', () => {
    const run = manualLoad(['assets/atlas/main.png', 'assets/atlas/main.png', './x.png']);
    expect(run.images.map((image) => image.src)).toEqual([
      'assets/atlas/main.png',
      'assets/atlas/main.png',
      './x.png',
    ]);
  });

  it('counts an image once even if its load handler would fire again', async () => {
    const run = manualLoad(['a.png', 'b.png']);
    const [a, b] = run.images;
    a.load();
    a.load();
    a.fail();
    b.load();
    await run.promise;
    expect(run.progress).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
    expect(run.state()).toBe('resolved');
  });

  it('reports progress for the images that loaded before one failed, then rejects', async () => {
    const run = manualLoad(['a.png', 'b.png', 'c.png']);
    run.images[2].load();
    run.images[0].fail();
    run.images[1].load();
    await run.promise;
    expect(run.state()).toBe('rejected');
    expect(run.reason()).toBeInstanceOf(AssetLoadError);
    expect((run.reason() as AssetLoadError).url).toBe('a.png');
    expect((run.reason() as Error).message).toBe('could not load a.png');
    expect(run.progress).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
    ]);
  });

  it('stays pending until every image settles and clears both handlers of a failed image', async () => {
    const run = manualLoad(['a.png', 'b.png']);
    run.images[0].load();
    await flush();
    expect(run.state()).toBe('pending');
    run.images[1].fail();
    await run.promise;
    expect(run.images[1].onload).toBeNull();
    expect(run.images[1].onerror).toBeNull();
  });

  it('works without a progress callback', async () => {
    const images: ManualImage[] = [];
    const promise = loadImages(['a.png'], () => {
      const image = new ManualImage();
      images.push(image);
      return image;
    });
    images[0].load();
    await expect(promise).resolves.toEqual(images);
  });
});

describe('shell/loader loadGameContent (edge)', () => {
  it('calls each owner once, with its kind’s files in path order, kinds in path order', () => {
    const files: ContentFile[] = [
      { path: 'z/b.beta.json', data: { formatVersion: 1, kind: 'beta' } },
      { path: 'a/2.alpha.json', data: { formatVersion: 1, kind: 'alpha' } },
      { path: 'a/1.alpha.json', data: { formatVersion: 1, kind: 'alpha' } },
      { path: 'b/a.beta.json', data: { formatVersion: 1, kind: 'beta' } },
    ];
    const calls: string[][] = [];
    const owner = (owned: readonly ContentFile[]) => {
      calls.push(owned.map((file) => file.path));
      return [];
    };
    const result = loadGameContent(files, { owners: { alpha: owner, beta: owner } });
    expect(calls).toEqual([
      ['a/1.alpha.json', 'a/2.alpha.json'],
      ['b/a.beta.json', 'z/b.beta.json'],
    ]);
    expect(result.issues).toEqual([]);
    expect(result.foreign.map((file) => file.path)).toEqual([
      'a/1.alpha.json',
      'a/2.alpha.json',
      'b/a.beta.json',
      'z/b.beta.json',
    ]);
  });

  it('lets an owner exception escape (bootShell turns it into CONTENT COULD NOT BE READ)', () => {
    const files: ContentFile[] = [
      { path: 'x/a.custom.json', data: { formatVersion: 1, kind: 'custom' } },
    ];
    expect(() =>
      loadGameContent(files, {
        owners: {
          custom: () => {
            throw new Error('owner crashed');
          },
        },
      }),
    ).toThrow('owner crashed');
  });

  it('never routes files with a broken header to owners (the core reports them)', () => {
    const seen: string[] = [];
    const result = loadGameContent(
      [
        { path: 'x/no-kind.json', data: { formatVersion: 1 } },
        { path: 'x/not-object.json', data: 42 },
      ],
      {
        owners: {
          undefined: (owned) => {
            seen.push(...owned.map((file) => file.path));
            return [];
          },
        },
      },
    );
    expect(seen).toEqual([]);
    expect(result.foreign).toEqual([]);
    expect(result.issues.map((issue) => issue.path.split(':')[0])).toEqual(
      expect.arrayContaining(['x/no-kind.json', 'x/not-object.json']),
    );
  });

  it('returns no issues for an empty file list and throws a TypeError for a non-list', () => {
    expect(loadGameContent([]).issues).toEqual([]);
    expect(() => loadGameContent(null as unknown as ContentFile[])).toThrow(TypeError);
  });
});
