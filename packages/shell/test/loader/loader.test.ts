/**
 * Tests for the boot loaders: parallel image loading through an injected factory (order,
 * progress, failure → AssetLoadError), and content validation that routes foreign kinds to
 * their owners (and reports kinds nobody owns).
 */
import { readContentFiles } from '../../../../vite.shared.js';
import type { ContentFile } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  AssetLoadError,
  loadGameContent,
  loadImages,
  moduleInfo,
  type LoadableImage,
} from '../../src/loader/index.js';

/** A fake image that "loads" asynchronously; URLs containing `bad` fail. */
class FakeImage implements LoadableImage {
  onload: LoadableImage['onload'] = null;
  onerror: LoadableImage['onerror'] = null;
  private url = '';

  get src(): string {
    return this.url;
  }

  set src(value: string) {
    this.url = value;
    setTimeout(() => {
      if (value.includes('bad')) this.onerror?.call(null as never, 'error');
      else this.onload?.call(null as never, {} as Event);
    }, 0);
  }
}

describe('shell/loader loadImages', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('loader');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('starts every request, resolves in URL order and reports progress', async () => {
    const created: FakeImage[] = [];
    const progress: Array<[number, number]> = [];
    const images = await loadImages(
      ['assets/atlas/main.png', 'assets/atlas/main-1.png'],
      () => {
        const image = new FakeImage();
        created.push(image);
        return image;
      },
      (loaded, total) => progress.push([loaded, total]),
    );
    expect(images).toEqual(created);
    expect(images.map((image) => image.src)).toEqual([
      'assets/atlas/main.png',
      'assets/atlas/main-1.png',
    ]);
    expect(progress).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
    expect(images.every((image) => image.onload === null && image.onerror === null)).toBe(true);
  });

  it('resolves an empty list immediately', async () => {
    const progress: Array<[number, number]> = [];
    await expect(
      loadImages(
        [],
        () => new FakeImage(),
        (n, t) => progress.push([n, t]),
      ),
    ).resolves.toEqual([]);
    expect(progress).toEqual([[0, 0]]);
  });

  it('rejects with an AssetLoadError naming the URL that failed', async () => {
    const failure = loadImages(['ok.png', 'bad.png'], () => new FakeImage());
    await expect(failure).rejects.toBeInstanceOf(AssetLoadError);
    await expect(failure).rejects.toMatchObject({ url: 'bad.png', name: 'AssetLoadError' });
  });
});

describe('shell/loader loadGameContent', () => {
  it('validates the shipped content with no issues', () => {
    const result = loadGameContent(readContentFiles());
    expect(result.issues).toEqual([]);
    expect(result.db.ships.length).toBeGreaterThan(0);
  });

  it('routes foreign kinds to their owner, and reports kinds nobody owns', () => {
    const files: ContentFile[] = [
      {
        path: 'input/remote.input-profiles.json',
        data: { formatVersion: 1, kind: 'input-profiles' },
      },
      { path: 'fx/particles.fx.json', data: { formatVersion: 1, kind: 'fx' } },
      { path: 'fx/more.fx.json', data: { formatVersion: 1, kind: 'fx' } },
    ];
    const seen: string[][] = [];
    const result = loadGameContent(files, {
      owners: {
        'input-profiles': (owned) => {
          seen.push(owned.map((file) => file.path));
          return [{ path: `${owned[0].path}:profiles[0]`, message: 'bad profile' }];
        },
      },
    });
    expect(seen).toEqual([['input/remote.input-profiles.json']]);
    expect(result.issues).toEqual([
      { path: 'fx/more.fx.json', message: 'no loader for content kind "fx"' },
      { path: 'fx/particles.fx.json', message: 'no loader for content kind "fx"' },
      { path: 'input/remote.input-profiles.json:profiles[0]', message: 'bad profile' },
    ]);
    expect(result.foreign).toHaveLength(3);
  });

  it('keeps the core issues first and never calls owners for core kinds', () => {
    const result = loadGameContent(
      [
        { path: 'player/bad.player.json', data: { formatVersion: 1, kind: 'player' } },
        { path: 'x/y.custom.json', data: { formatVersion: 1, kind: 'custom' } },
      ],
      { owners: { custom: () => [] } },
    );
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.every((issue) => issue.path.startsWith('player/bad.player.json'))).toBe(
      true,
    );
  });

  it('ignores owner keys inherited from Object.prototype', () => {
    const result = loadGameContent([
      { path: 'x/proto.toString.json', data: { formatVersion: 1, kind: 'toString' } },
    ]);
    expect(result.issues).toEqual([
      { path: 'x/proto.toString.json', message: 'no loader for content kind "toString"' },
    ]);
  });
});
