/**
 * # video — the cutscene video surface (v2 R7-VID)
 *
 * **Responsibility.** One screen-space quad that draws a decoded H.264 clip into the low-res
 * frame **inside the layer stack's root group**, in one of two bands chosen per clip
 * ({@link VideoSurface.setBand}): the *world* band, directly over the world group — the gameplay
 * windows (the WARNING stings, the attract loop's backdrop), where the HUD and the UI keep their
 * place above the clip; and the *screen* band, directly under the debug layer — the title and the
 * story, whose screens paint their own full-frame backdrop into the UI, which would otherwise
 * cover the clip entirely (R7-VID's first build placed the quad below the whole stack and drew
 * nothing but the backdrop; e2e proved the fix by pixel counting). Either way the CRT pass
 * (pass 2) filters the clip exactly like the rest of the frame — the {@link createCrtPass} blit
 * is the precedent for a whole-frame image drawn through the same pipeline. The clip is a
 * `<video>` element decoded by the browser; this module **pulls** its current frame into a GPU
 * texture once per render tick when the decoded presentation time moved — `createImageBitmap` of
 * the element, then the ordinary `image` texture upload. No other mechanism: no
 * `requestVideoFrameCallback` (Chrome 80 — beyond the Chromium 68 / 69 TV floor), no Pixi
 * ticker, and deliberately **not** Pixi's `VideoSource` (v8.22's video uploader allocates a
 * WebGL2 sized texture through the element overload — under ANGLE the real allocation is lost
 * while the bookkeeping follows, and every later sub-image upload fails with an offset overflow;
 * the R7-VID bench found it before any TV ran the path). An `ImageBitmap` is what the atlas
 * decode path already uploads safely on both GL versions. The simulation never waits on media:
 * the director that shows and hides this surface runs on presentation time alone
 * (`@shmup/shell` `cutscene`).
 *
 * The quad fits the frame by stretching the decoded picture to `width` × `height` — the shipped
 * set is encoded at the frame's own size (`scripts/v20x/video-encode.mjs`: every clip is
 * FRAME_W × FRAME_H), so the scale is 1 and the picture is pixel-aligned. A surface draws one
 * clip at a time; `play()` switches the element's url (the element and the texture are reused —
 * one decoder, one 0.92 MiB RGBA texture, no rebuild).
 *
 * **Failure is invisible.** A media error (metadata failure, refused start) leaves the surface
 * inert: `usable` goes false, `play()` resolves false, the quad never shows, and the procedural
 * scene keeps running exactly as it does when no video option was given at all. Nothing here can
 * block a frame: the cold work (url set, metadata wait, start) runs outside `render()`, and the
 * hot pull is a flag compare when the quad is hidden.
 *
 * **Implements.**
 * - shmup_feat.md §18 — draw order (the surface is one of the root group's bands, never a layer)
 * - shmup_feat.md §17 — scene flow (the presentation stings the host director shows over it)
 *
 * **Public API.** {@link createVideoSurface}, {@link VideoSurface}, {@link VideoSurfaceOptions},
 * {@link VideoElementLike}, {@link VideoSourceLike}, {@link VideoFrameBitmapLike}.
 *
 * @module
 */
import { FRAME_H, FRAME_W, defineModule } from '@shmup/core';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'video',
  status: 'implemented',
  specRefs: ['shmup_feat.md §18', 'shmup_feat.md §17'],
});

/**
 * What this module reads and calls on the media element (the structural type of a real
 * `HTMLVideoElement`; tests pass a plain object — the web-audio module's context fakes are the
 * precedent for typing the DOM boundary this way).
 */
export interface VideoElementLike {
  /** Current source url (assigned by {@link VideoSurface.play}). */
  src: string;
  /** Whether the element loops natively (looping stings set it before the start). */
  loop: boolean;
  /** Decode-load policy — `'auto'` at creation (the clips are a few hundred KB). */
  preload: string;
  /** Restart the fetch/decode of the current `src` (called on every clip change after the first). */
  load(): void;
  /** Start decoding/presenting frames; returns a promise on modern Chromium. */
  play(): unknown;
  /** Stop presenting frames (the last one stays readable). */
  pause(): void;
  /** Presentation time of the frame the element shows now (the pull's change key). */
  readonly currentTime: number;
  /** Whether the (non-looping) clip ran to its end. */
  readonly ended: boolean;
  /** Data readiness (2 = HAVE_CURRENT_DATA — enough for one bitmap). */
  readonly readyState: number;
  /** `loadeddata` / `error` only, through this window. */
  addEventListener(type: 'loadeddata' | 'error', listener: () => void): void;
  /** The matching removal (the metadata wait never leaks a listener). */
  removeEventListener(type: 'loadeddata' | 'error', listener: () => void): void;
}

/**
 * A frame snapshot of the element (`ImageBitmap` in the browser; tests inject a recorder).
 * `close()` releases the native copy — the pull closes the previous bitmap on every swap, so one
 * frame is alive at a time.
 */
export interface VideoFrameBitmapLike {
  /** Intrinsic width of the snapshot (the frame size for the shipped clips). */
  readonly width: number;
  /** Intrinsic height of the snapshot. */
  readonly height: number;
  /** Frees the native pixels (the browser's ImageBitmap close). */
  close(): void;
}

/**
 * What this module reads and calls on the Pixi texture source (structural so tests inject a
 * recorder; the default factory builds a real `TextureSource` whose `uploadMethodId` is the
 * proven `image` path over the bitmap resource).
 */
export interface VideoSourceLike {
  /** The bitmap the GPU copy comes from (swapped by the pull; the uploader reads it live). */
  resource: VideoFrameBitmapLike | null;
  /** Pushes an `'update'` event so the bound GL texture re-uploads the current resource. */
  update(): void;
  /** Current texture width in pixels (the frame, fixed at construction). */
  readonly pixelWidth: number;
  /** Current texture height in pixels (the frame, fixed at construction). */
  readonly pixelHeight: number;
  /** Frees the source (and, through this module, the live bitmap). */
  destroy(): void;
}

/** The band a clip draws in (see the module docblock; {@link VideoSurface.setBand}). */
export type VideoBand = 'world' | 'screen';

/** Child indices of the two bands inside the root group, captured before the surface joins it. */
export interface VideoBandAnchors {
  /** Index that puts the quad over the world group and under the HUD (the gameplay band). */
  readonly world: number;
  /** Index that puts the quad over the UI and under the debug layer (the title/story band). */
  readonly screen: number;
}

/** Options for {@link createVideoSurface}. */
export interface VideoSurfaceOptions {
  /** The layer stack's root group — the surface's container joins it in the world band. */
  readonly root: Container;
  /** The band anchors inside `root` (the renderer computes them from its own layer stack). */
  readonly bands: VideoBandAnchors;
  /** Frame width (default core's `FRAME_W` — the clip is stretched to it). */
  readonly width?: number;
  /** Frame height (default core's `FRAME_H`). */
  readonly height?: number;
  /** Creates the media element (default `document.createElement('video')`; tests pass a fake). */
  readonly createVideoElement?: () => VideoElementLike;
  /**
   * Snapshots the element's current frame (default `createImageBitmap`; tests pass a recorder).
   *
   * @param element - The ready media element.
   * @returns The bitmap snapshot, or a rejection when the frame cannot be copied.
   */
  readonly createFrameBitmap?: (element: VideoElementLike) => Promise<VideoFrameBitmapLike>;
  /**
   * Creates the texture source over the first bitmap (default Pixi's `TextureSource` on the
   * `image` upload path, sized to the frame; tests pass a fake).
   *
   * @param bitmap - The first frame snapshot (the source's initial resource).
   * @returns The source; it must not update on its own.
   */
  readonly createVideoSource?: (bitmap: VideoFrameBitmapLike) => VideoSourceLike;
}

/**
 * The renderer's video surface: one quad under the layer stack, one reusable media element and
 * one reused texture. Nothing allocates in {@link VideoSurface.tick} while it is hidden (the
 * state of the surface in almost every frame of the game's life); while a clip shows, the pull
 * makes one native bitmap per decoded frame (closed on the next swap) and no JS garbage — the
 * texture itself is never rebuilt.
 */
export interface VideoSurface {
  /** The surface's container (a child of the layer stack's root group, in the current band). */
  readonly container: Container;
  /** The band the container currently draws in (`world` until {@link VideoSurface.setBand}). */
  readonly band: VideoBand;
  /** Whether a clip is currently drawn (quad visible, element playing). */
  readonly playing: boolean;
  /** Whether the surface can show clips at all (false after a media failure). */
  readonly usable: boolean;
  /**
   * Loads a clip and starts it (cold path — never from `render()`). Sets the element's `src` and
   * restarts the media element (a same-url replay starts from its first frame); resolves `true`
   * when the clip started and its first frame was snapshotted, `false` when the surface is inert
   * or the media failed.
   *
   * @param url - Relative or absolute media url (the bundle's `assets/video/<id>.mp4`).
   * @param loop - Whether the element loops natively (attract backdrops do).
   * @returns `true` when the clip plays.
   */
  play(url: string, loop: boolean): Promise<boolean>;
  /**
   * Moves the quad between the two draw bands (cold path — the director calls it when a clip
   * starts, never per frame). The `world` band draws over the world group and under the HUD and
   * UI (gameplay windows); the `screen` band draws over the UI and under the debug layer (the
   * title and story screens, which paint an opaque full-frame backdrop the world band cannot
   * show through).
   *
   * @param band - The band the current clip belongs to.
   */
  setBand(band: VideoBand): void;
  /**
   * Stops the clip and hides the quad. The last pulled bitmap stays in the texture; a paused
   * surface holds the picture it last uploaded (this is what the browser shows while seeking).
   */
  stop(): void;
  /**
   * One pull, from the renderer's `render()`: snapshots the element's frame into the texture when
   * its presentation time moved, and ends a non-looping clip at its last frame. Allocates nothing
   * while hidden.
   */
  tick(): void;
  /** {@link VideoSurface.stop} plus release of the element, bitmap, source and texture. */
  destroy(): void;
}

/**
 * Waits until the element has one decoded frame (`readyState ≥ 2`), resolving `false` on a media
 * error. Cold path only — {@link createVideoSurface} calls it once per first play.
 *
 * @param element - The media element whose `src` was just (re)loaded.
 * @returns Whether a frame became available.
 */
function waitForFirstFrame(element: VideoElementLike): Promise<boolean> {
  if (element.readyState >= 2) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (): void => {
      element.removeEventListener('loadeddata', done);
      element.removeEventListener('error', fail);
      resolve(true);
    };
    const fail = (): void => {
      element.removeEventListener('loadeddata', done);
      element.removeEventListener('error', fail);
      resolve(false);
    };
    element.addEventListener('loadeddata', done);
    element.addEventListener('error', fail);
  });
}

/**
 * Creates the surface and adds its container to the layer stack's root group in the **world**
 * band — **call after `createLayerStack`** so the anchors exist (the child order is the draw
 * order; {@link VideoSurface.setBand} moves the container when a clip wants the screen band).
 * The quad itself is built on the first successful {@link VideoSurface.play} (a media failure
 * therefore leaves an empty container and nothing else).
 *
 * @param options - Root group, band anchors, frame size, element/bitmap/source factories.
 * @returns The surface, hidden and inert until the first {@link VideoSurface.play}.
 */
export function createVideoSurface(options: VideoSurfaceOptions): VideoSurface {
  const width = options.width ?? FRAME_W;
  const height = options.height ?? FRAME_H;
  const createElement = options.createVideoElement ?? (() => document.createElement('video'));
  const createBitmap =
    options.createFrameBitmap ??
    ((element: VideoElementLike) => createImageBitmap(element as unknown as HTMLVideoElement));
  const createSource =
    options.createVideoSource ??
    ((bitmap: VideoFrameBitmapLike) => {
      const source = new TextureSource({
        resource: bitmap,
        width,
        height,
        label: 'video',
      });
      // The proven atlas upload path: the bitmap is a plain image source on both GL versions
      // (module docblock — this is exactly why Pixi's `VideoSource` is not used).
      source.uploadMethodId = 'image';
      return source;
    });

  const element = createElement();
  element.preload = 'auto';
  const container = new Container({ label: 'video' });
  const root = options.root;
  const bands = options.bands;
  root.addChildAt(container, bands.world);

  /** The band the container currently sits in. */
  let band: VideoBand = 'world';

  /** The quad's parts, built on the first frame (null until then). */
  let sprite: Sprite | null = null;
  let texture: Texture | null = null;
  let source: VideoSourceLike | null = null;
  /** The url loaded now (a newer play replaces it and the older promise's result is dropped). */
  let currentUrl: string | null = null;
  /** Whether a media failure made the surface inert. */
  let usable = true;
  /** Whether the quad is drawn (the pull's idle guard). */
  let shown = false;
  /** The loop flag of the current clip. */
  let looping = false;
  /** Whether the element has produced its first frame (later plays restart it). */
  let elementLoaded = false;
  /** Whether a bitmap request is in flight (at most one pull is pending). */
  let pending = false;
  /**
   * The pull's clock: slot 0 holds the presentation time of the last uploaded frame. A
   * `Float64Array` because the time is a fraction the frame loop touches every tick, and a
   * fractional closure variable would box one heap number a frame (plan M1-08; the pattern
   * DSL's expression stack — slot-based fractions, comparisons and stores stay unboxed).
   */
  const clock = new Float64Array(1);
  clock[0] = -1;

  /** Hides the quad and pauses the element (a clip's end, a stop, or a media failure). */
  const halt = (): void => {
    shown = false;
    if (sprite !== null) sprite.visible = false;
    clock[0] = -1;
    element.pause();
  };

  /**
   * Swaps a snapshot into the texture and closes the previous one (runs on the bitmap promise's
   * microtask — never inside the render pass; `update()` re-uploads synchronously through the
   * bound GL texture right here, the same call Pixi's own sources make).
   *
   * @param bitmap - The snapshot to show (owned by the surface until the next swap).
   */
  const applyBitmap = (bitmap: VideoFrameBitmapLike): void => {
    pending = false;
    const own = source;
    if (own === null) {
      bitmap.close();
      return;
    }
    const previous = own.resource;
    own.resource = bitmap;
    own.update();
    if (previous !== null && previous !== bitmap) previous.close();
  };

  /** Requests one snapshot of the element's current frame (drops itself if the surface stopped). */
  const pull = (): void => {
    if (pending || source === null) return;
    pending = true;
    const url = currentUrl;
    createBitmap(element).then(
      (bitmap) => {
        // A newer clip (or a stop) superseded this frame: drop the snapshot instead of showing it.
        if (url !== currentUrl || source === null) bitmap.close();
        else applyBitmap(bitmap);
      },
      () => {
        pending = false;
      },
    );
  };

  return {
    container,
    get band(): VideoBand {
      return band;
    },
    get playing(): boolean {
      return shown;
    },
    get usable(): boolean {
      return usable;
    },
    async play(url: string, loop: boolean): Promise<boolean> {
      if (!usable) return false;
      if (shown) halt();
      const first = !elementLoaded;
      element.src = url;
      currentUrl = url;
      looping = loop;
      element.loop = loop;
      try {
        if (first) {
          element.load();
          if (!(await waitForFirstFrame(element))) {
            usable = false;
            return false;
          }
        } else {
          element.load();
        }
      } catch {
        // A decoder that cannot even restart makes the surface inert for good — the procedural
        // scene keeps running exactly as if no video had been asked for.
        usable = false;
        return false;
      }
      if (url !== currentUrl) return false; // a newer play replaced this one while loading
      try {
        await element.play();
      } catch {
        // A refused start (a missing media source id, a policy block) fails this clip only; the
        // surface stays usable for the next window.
        return false;
      }
      if (url !== currentUrl) return false;
      if (first) elementLoaded = true;
      if (!first) {
        // Metadata survives the restart; the frame itself may not be decoded yet.
        if (!(await waitForFirstFrame(element))) {
          usable = false;
          return false;
        }
        if (url !== currentUrl) return false;
      }
      try {
        if (sprite === null) {
          const bitmap = await createBitmap(element);
          if (url !== currentUrl) {
            bitmap.close();
            return false;
          }
          source = createSource(bitmap);
          texture = new Texture({ source: source as unknown as TextureSource });
          sprite = new Sprite(texture);
          container.addChild(sprite);
        } else {
          pull();
        }
      } catch {
        // No frame could be copied (a seek race at the very end of a short clip): the surface
        // stays usable, this window shows nothing.
        return false;
      }
      if (url !== currentUrl) return false;
      const own = sprite;
      if (own !== null) {
        own.scale.set(
          width / (source?.pixelWidth ?? width),
          height / (source?.pixelHeight ?? height),
        );
        own.visible = true;
      }
      shown = true;
      clock[0] = element.currentTime;
      return true;
    },
    setBand(next: VideoBand): void {
      if (next === band) return;
      band = next;
      // A band change is a child-index move of one container inside the root group — cold path
      // only (the director calls it at a clip start); Pixi rebuilds the root group once, and the
      // 17 LayerId containers themselves never move.
      root.addChildAt(container, next === 'world' ? bands.world : bands.screen);
    },
    stop(): void {
      if (shown) halt();
    },
    tick(): void {
      if (!shown) return;
      // A finished non-looping clip keeps its last frame until the window ends it; when the
      // element reports the end, stop drawing it (the loop clips never do).
      if (!looping && element.ended) {
        halt();
        return;
      }
      const time = element.currentTime;
      if (time !== clock[0]) {
        clock[0] = time;
        pull();
      }
    },
    destroy(): void {
      shown = false;
      const ownSource = source;
      if (ownSource !== null) {
        const bitmap = ownSource.resource;
        ownSource.destroy();
        if (bitmap !== null) bitmap.close();
        source = null;
      }
      if (texture !== null) texture.destroy();
      container.destroy({ children: true });
      element.pause();
      element.src = '';
      currentUrl = null;
    },
  };
}
