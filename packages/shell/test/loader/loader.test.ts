/**
 * Tests for the boot loaders: parallel image loading through an injected factory (order,
 * progress, failure → AssetLoadError), and content validation that routes foreign kinds to
 * their owners (and reports kinds nobody owns).
 */
import { readContentFiles } from '../../../../vite.shared.js';
import { ENGINE_SPRITES, type ContentFile } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  AssetLoadError,
  DEFAULT_CONTENT_OWNERS,
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

  it("interns the engine's own sprites (bullets, laser beam) unless told otherwise (M1-09)", () => {
    const names = loadGameContent(readContentFiles()).db.sprites.names;
    for (const name of ENGINE_SPRITES) expect(names).toContain(name);
    const bare = loadGameContent(readContentFiles(), { extraSprites: [] }).db.sprites.names;
    expect(bare).not.toContain('lasers/beam-pink');
  });

  it('hands the default input-profiles owner every file at once (ids unique across files)', () => {
    expect(Object.isFrozen(DEFAULT_CONTENT_OWNERS)).toBe(true);
    const shipped = readContentFiles().filter((file) => file.path.startsWith('input/'));
    const copy: ContentFile = { path: 'input/zz-copy.input-profiles.json', data: shipped[0]?.data };
    const result = loadGameContent([...readContentFiles(), copy]);
    const ids = ['tizen-remote-safe', 'tizen-remote-diagonal', 'keyboard-default'];
    expect(result.issues.slice(0, 3)).toEqual(
      ids.map((id, i) => ({
        path: `input/zz-copy.input-profiles.json:profiles[${String(i)}].id`,
        message: `duplicate input profile id "${id}" (first defined in input/remote.input-profiles.json)`,
      })),
    );
    expect(result.issues).toHaveLength(5);
  });

  it('validates input profiles with the default owner (plan §3.5)', () => {
    expect(Object.keys(DEFAULT_CONTENT_OWNERS)).toEqual(['input-profiles']);
    const result = loadGameContent([
      {
        path: 'input/bad.input-profiles.json',
        data: { formatVersion: 1, kind: 'input-profiles', profiles: [] },
      },
    ]);
    expect(result.issues).toEqual([
      { path: 'input/bad.input-profiles.json:profiles', message: 'must have at least 1 items' },
    ]);
    const shipped = loadGameContent(readContentFiles());
    expect(shipped.foreign.map((file) => file.path)).toEqual(['input/remote.input-profiles.json']);
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
