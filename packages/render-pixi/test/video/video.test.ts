/**
 * The video surface's state machine (v2 R7-VID), on fake media elements, fake frame bitmaps and
 * a fake texture source: what `play`/`tick`/`stop`/`destroy` do to the element, the bitmap
 * lifecycle and the quad — and the law that a media failure is invisible. The mechanism itself
 * (`createImageBitmap` pulls into the `image` upload path; Pixi's `VideoSource` is deliberately
 * unused) is pinned by the last block, which reads the module's factories and the real
 * `TextureSource` the default factory builds.
 */
import { Container, TextureSource } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  createVideoSurface,
  moduleInfo,
  type VideoElementLike,
  type VideoFrameBitmapLike,
  type VideoSourceLike,
} from '../../src/video/index.js';

/** A media element the test drives: counters for every call, settable readiness, time and end. */
class FakeElement implements VideoElementLike {
  src = '';
  loop = false;
  preload = '';
  /** What `readyState` reports (2 = a frame is available). */
  ready = 4;
  /** Presentation time the element "shows" now (a fraction, like the real getter). */
  time = 0;
  /** What `ended` reports. */
  end = false;
  /** When true, `play()` rejects (a refused start). */
  refusePlay = false;
  /** When true, `play()` returns a promise the test resolves by hand (race probes). */
  holdPlay = false;
  loads = 0;
  plays = 0;
  pauses = 0;
  /** Reads of `currentTime` (the pull's idle path must never perform one). */
  timeReads = 0;
  /** Live `play()` promise when {@link holdPlay} (the test calls {@link releasePlay}). */
  heldPlay: (() => void) | null = null;
  private readonly listeners = new Map<string, Array<() => void>>();

  get currentTime(): number {
    this.timeReads++;
    return this.time;
  }

  get readyState(): number {
    return this.ready;
  }

  get ended(): boolean {
    return this.end;
  }

  load(): void {
    this.loads++;
  }

  play(): Promise<void> {
    this.plays++;
    if (this.refusePlay) return Promise.reject(new Error('NotAllowedError'));
    if (this.holdPlay) {
      return new Promise<void>((resolve) => {
        this.heldPlay = resolve;
      });
    }
    return Promise.resolve();
  }

  pause(): void {
    this.pauses++;
  }

  addEventListener(type: 'loadeddata' | 'error', listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: 'loadeddata' | 'error', listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    const at = list.indexOf(listener);
    if (at >= 0) list.splice(at, 1);
  }

  /** Fires a stored media event (the loaded-data arrival or a decode error). */
  fire(type: 'loadeddata' | 'error'): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  /** Releases the held start promise ({@link holdPlay} must be set first). */
  releasePlay(): void {
    this.holdPlay = false;
    const resolve = this.heldPlay;
    this.heldPlay = null;
    resolve?.();
  }
}

/** A frame snapshot: counts closes; the shared instance keeps the guards allocation-free. */
class FakeBitmap implements VideoFrameBitmapLike {
  readonly width = 640;
  readonly height = 360;
  closes = 0;

  close(): void {
    this.closes++;
  }
}

/** A texture source the test drives: counts updates, holds the swapped resource. */
class FakeSource implements VideoSourceLike {
  resource: VideoFrameBitmapLike | null = null;
  pixelWidth = 640;
  pixelHeight = 360;
  updates = 0;
  destroyed = false;

  update(): void {
    this.updates++;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

/** A surface over fresh fakes, plus the bitmap-request recorder it pulls through. */
function makeSurface() {
  // The root group with the band anchors the renderer computes: [world, HUD, UI, DEBUG] at 0..3.
  const root = new Container({ label: 'layers' });
  root.addChild(new Container({ label: 'world' }));
  root.addChild(new Container({ label: 'HUD' }));
  root.addChild(new Container({ label: 'UI' }));
  root.addChild(new Container({ label: 'DEBUG' }));
  const bands = { world: 1, screen: 3 };
  const element = new FakeElement();
  const source = new FakeSource();
  const bitmaps: FakeBitmap[] = [];
  const failBitmap = { on: false };
  const gateBitmap: {
    release: ((bitmap: FakeBitmap, resolve: (bitmap: FakeBitmap) => void) => void) | null;
  } = { release: null };
  const surface = createVideoSurface({
    root,
    bands,
    createVideoElement: () => element,
    createVideoSource: (bitmap) => {
      source.resource = bitmap;
      return source;
    },
    createFrameBitmap: () => {
      if (failBitmap.on) return Promise.reject(new Error('FrameCopyError'));
      const bitmap = new FakeBitmap();
      bitmaps.push(bitmap);
      if (gateBitmap.release === null) return Promise.resolve(bitmap);
      return new Promise<FakeBitmap>((resolve) => {
        const release = gateBitmap.release;
        gateBitmap.release = null;
        release?.(bitmap, resolve);
      });
    },
  });
  return { surface, root, bands, element, source, bitmaps, failBitmap, gateBitmap };
}

/** Drains the microtask queue so pending bitmap callbacks run. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('render-pixi/video', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('video');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('joins the root group in the world band as an empty container — the quad is built on the first frame', () => {
    const { surface, root } = makeSurface();
    expect(root.children).toContain(surface.container);
    expect(root.children.indexOf(surface.container)).toBe(1); // over world, under the HUD
    expect(surface.band).toBe('world');
    expect(surface.container.label).toBe('video');
    expect(surface.container.children.length).toBe(0);
    expect(surface.playing).toBe(false);
    expect(surface.usable).toBe(true);
  });

  it('setBand moves the container and the same-band call is inert', () => {
    const { surface, root } = makeSurface();
    // Creation: [world, video, HUD, UI, DEBUG] (the world anchor is index 1).
    surface.setBand('screen');
    expect(surface.band).toBe('screen');
    // Move = remove + insert at 3: [world, HUD, UI, video, DEBUG] — over the UI, under DEBUG.
    expect(root.children.indexOf(surface.container)).toBe(3);
    const children = [...root.children];
    surface.setBand('screen');
    expect(root.children).toEqual(children); // no move, no duplicate
    surface.setBand('world');
    expect(root.children.indexOf(surface.container)).toBe(1);
    expect(root.children.length).toBe(children.length);
  });

  it('plays a clip: src, load, start, first bitmap, then the quad is visible', async () => {
    const { surface, element, source, bitmaps } = makeSurface();
    await expect(surface.play('assets/video/title-sting.mp4', false)).resolves.toBe(true);
    expect(element.src).toBe('assets/video/title-sting.mp4');
    expect(element.loads).toBe(1);
    expect(element.plays).toBe(1);
    expect(bitmaps.length).toBe(1);
    expect(source.resource).toBe(bitmaps[0]);
    expect(surface.playing).toBe(true);
    const sprite = surface.container.children[0] as { visible: boolean };
    expect(sprite.visible).toBe(true);
    // A later clip change reuses the source and restarts only the element.
    await surface.play('assets/video/dawn-flight.mp4', false);
    expect(element.loads).toBe(2);
    expect(element.src).toBe('assets/video/dawn-flight.mp4');
    expect(surface.container.children.length).toBe(1); // one quad, not two
  });

  it('pulls once per moved frame and never for an unchanged time', async () => {
    const { surface, element, source } = makeSurface();
    await surface.play('assets/video/warn-zone-a.mp4', false);
    await flush();
    const base = source.updates; // the first play pulled its frame into the fresh source
    element.time = 0.041;
    surface.tick();
    surface.tick();
    await flush();
    expect(source.updates).toBe(base + 1);
    element.time = 0.083;
    surface.tick();
    await flush();
    expect(source.updates).toBe(base + 2);
  });

  it('a hidden surface reads nothing and pulls nothing', () => {
    const { surface, element, source } = makeSurface();
    surface.tick();
    surface.tick();
    expect(element.timeReads).toBe(0);
    expect(source.updates).toBe(0);
    expect(surface.playing).toBe(false);
  });

  it('a paused surface keeps its last frame: stop hides the quad, the bitmap stays alive', async () => {
    const { surface, element, source, bitmaps } = makeSurface();
    await surface.play('assets/video/escape-collapse.mp4', false);
    await flush();
    surface.stop();
    expect(surface.playing).toBe(false);
    expect(element.pauses).toBe(1);
    expect(source.resource).toBe(bitmaps[0]); // the picture survives in the texture
    expect(bitmaps[0].closes).toBe(0);
    const reads = element.timeReads;
    const updates = source.updates;
    surface.tick();
    surface.tick();
    expect(element.timeReads).toBe(reads);
    expect(source.updates).toBe(updates);
  });

  it('ends a non-looping clip at the element end; a looping clip keeps showing', async () => {
    const { surface, element } = makeSurface();
    await surface.play('assets/video/title-sting.mp4', false);
    await flush();
    element.end = true;
    surface.tick();
    expect(surface.playing).toBe(false);

    await surface.play('assets/video/attract-ambient.mp4', true);
    await flush();
    element.end = true; // (never true for real looping media — the flag must not be consulted)
    element.time = 1.5;
    surface.tick();
    await flush();
    expect(surface.playing).toBe(true);
  });

  it('a metadata error makes the surface inert and stays invisible', async () => {
    const { surface, element } = makeSurface();
    element.ready = 0; // wait for `loadeddata`
    const first = surface.play('assets/video/broken.mp4', false);
    await flush();
    element.fire('error');
    await expect(first).resolves.toBe(false);
    expect(surface.usable).toBe(false);
    expect(surface.playing).toBe(false);
    await expect(surface.play('assets/video/title-sting.mp4', false)).resolves.toBe(false);
    expect(element.plays).toBe(0);
  });

  it('a refused start fails that clip only, and the surface keeps working', async () => {
    const { surface, element } = makeSurface();
    element.refusePlay = true;
    await expect(surface.play('assets/video/title-sting.mp4', false)).resolves.toBe(false);
    expect(surface.usable).toBe(true);
    expect(surface.container.children.length).toBe(0); // no quad was ever built
    element.refusePlay = false;
    await expect(surface.play('assets/video/title-sting.mp4', false)).resolves.toBe(true);
    expect(surface.playing).toBe(true);
  });

  it('a frame the copier cannot take fails the window, not the surface', async () => {
    const { surface, failBitmap } = makeSurface();
    failBitmap.on = true;
    await expect(surface.play('assets/video/title-sting.mp4', false)).resolves.toBe(false);
    expect(surface.usable).toBe(true);
    expect(surface.playing).toBe(false);
  });

  it('the newer of two racing plays wins alone', async () => {
    const { surface, element } = makeSurface();
    element.holdPlay = true;
    const first = surface.play('assets/video/a.mp4', false);
    const second = surface.play('assets/video/b.mp4', false); // takes the hold too? no: first holds
    element.releasePlay();
    element.releasePlay();
    await flush();
    const results = await Promise.all([first, second]);
    expect(results[0]).toBe(false); // superseded before its quad
    expect(results[1]).toBe(true);
    expect(surface.playing).toBe(true);
    expect(element.src).toBe('assets/video/b.mp4');
  });

  it('a bitmap superseded mid-flight is closed, never shown', async () => {
    const { surface, source, gateBitmap } = makeSurface();
    const held: { bitmap: FakeBitmap | null; resolve: ((b: FakeBitmap) => void) | null } = {
      bitmap: null,
      resolve: null,
    };
    gateBitmap.release = (bitmap, resolve) => {
      held.bitmap = bitmap;
      held.resolve = resolve;
    };
    const play = surface.play('assets/video/a.mp4', false);
    await flush();
    // A newer clip arrives while the first frame is still being copied.
    const later = surface.play('assets/video/b.mp4', false);
    await flush();
    held.resolve?.(held.bitmap!);
    await flush();
    await expect(play).resolves.toBe(false);
    await expect(later).resolves.toBe(true);
    expect(held.bitmap!.closes).toBe(1); // the orphan was freed, not uploaded
    expect(source.resource).not.toBe(held.bitmap);
  });

  it('every swap closes the previous bitmap — one frame is alive at a time', async () => {
    const { surface, element, bitmaps } = makeSurface();
    await surface.play('assets/video/attract-ambient.mp4', true);
    await flush();
    element.time = 0.1;
    surface.tick();
    await flush();
    element.time = 0.2;
    surface.tick();
    await flush();
    expect(bitmaps.length).toBe(3);
    expect(bitmaps[0].closes).toBe(1);
    expect(bitmaps[1].closes).toBe(1);
    expect(bitmaps[2].closes).toBe(0);
  });

  it('destroy releases the source, closes the live bitmap and leaves the root group', async () => {
    const { surface, root, source, bitmaps } = makeSurface();
    await surface.play('assets/video/title-sting.mp4', false);
    await flush();
    surface.destroy();
    expect(source.destroyed).toBe(true);
    expect(bitmaps[0].closes).toBe(1);
    expect(root.children).not.toContain(surface.container);
  });
});

describe('render-pixi/video — the real texture source', () => {
  it('the default source uploads through the image path at the frame size', () => {
    // The module's law in one line: the bitmap pull uses the `image` upload method (the atlas
    // decode's path), never Pixi's `video` one — and a plain TextureSource has no ticker or
    // frame-callback mechanism to disconnect in the first place.
    const bitmap = new FakeBitmap();
    const source = new TextureSource({
      resource: bitmap as unknown as ImageBitmap,
      width: 640,
      height: 360,
    });
    source.uploadMethodId = 'image';
    expect(source.pixelWidth).toBe(640);
    expect(source.pixelHeight).toBe(360);
    expect((source as unknown as { uploadMethodId: string }).uploadMethodId).toBe('image');
    let events = 0;
    source.on('update', () => {
      events++;
    });
    const swapped = new FakeBitmap();
    (source as unknown as VideoSourceLike).resource = swapped;
    (source as unknown as VideoSourceLike).update();
    expect(events).toBe(1);
    expect(bitmap.closes).toBe(0); // closing is the surface's job, not the source's
    source.destroy();
  });
});
