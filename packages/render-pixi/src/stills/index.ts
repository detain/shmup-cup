/**
 * # stills — the image surface: one non-atlas bitmap as a full-frame quad
 *
 * **Responsibility.** Shows a large-format bitmap that is **not** an atlas page — a menu
 * backdrop, a story still, ending art (plan v20x A4, the ARTLEDGER's "LARGE full-bleed
 * surfaces" class) — as one textured quad inside the layer stack, beside the video surface it
 * mirrors:
 *
 * - the quad lives inside the layer stack's **root group** and is not a `LayerId` (the 17-layer
 *   system never moves, `layers/index.ts`); the two bands are the video's: `world` puts the
 *   picture over the world group and under the HUD and UI (the endings' scene art draws its
 *   sprites and panel on the UI list and shows the still through), `screen` puts it over the UI
 *   and under the debug layer (a surface that must cover an opaque UI backdrop);
 * - the image arrives **already decoded** — the shell's page-image factory (`@shmup/shell`
 *   `loader` `createPageImageFactory`, the v20x P0-1 `createImageBitmap` path with its `Image`
 *   fallback) loads the bytes over the `file://`-safe XHR and hands the surface an
 *   {@link AtlasPageImage}. This module never fetches and never decodes (render-pixi depends on
 *   core alone — `repo-layout.md`);
 * - **the VRAM law** (plan v20x P0-1 / decision W5-15, the atlas residency's rule): a shown
 *   still holds exactly one decoded image and one GPU copy; {@link ImageSurface.hide} closes the
 *   bitmap with {@link closePageImage} and destroys the texture, so a hidden surface costs
 *   **zero** — an unclosed bitmap never piles up, and no closed image can be re-uploaded behind
 *   the surface's back by a context-loss pass, because nothing references it any more. A swap
 *   (one still directly after another) attaches the new image first and closes the old one
 *   after, exactly as `Atlas.loadPage` replaces a page's image.
 *
 * Nothing runs per frame: {@link ImageSurface.show} and {@link ImageSurface.hide} are cold paths
 * the shell's stills director drives at scene transitions, and a hidden surface's container is
 * simply not visited by the render pass. The quad is one `Sprite`; Pixi batches it like any
 * other, and the texture is a `TextureSource` on the proven `image` upload method (the video
 * surface's path — WebGL1-safe on the Mali, `video/index.ts`).
 *
 * **Implements.**
 * - shmup_tech.md §2.5 — the TV memory budget (the resident still is counted by the shell's
 *   estimator, `memory/index.ts`, through {@link ImageSurface.shown})
 * - shmup_feat.md §22 — texture budgets
 *
 * **Public API.** {@link createImageSurface}, {@link ImageSurface},
 * {@link ImageSurfaceOptions}, {@link ImageBand}, {@link ImageBandAnchors}.
 *
 * @module
 */
import { FRAME_H, FRAME_W, defineModule } from '@shmup/core';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';
import { closePageImage, type AtlasPageImage } from '../atlas/index.js';

/** Module descriptor. */
export const moduleInfo = defineModule({
  name: 'stills',
  status: 'implemented',
  specRefs: ['shmup_tech.md §2.5', 'shmup_feat.md §22'],
});

/** The band the still draws in (the video surface's bands, {@link ImageSurface.setBand}). */
export type ImageBand = 'world' | 'screen';

/** Child indices of the two bands inside the root group, captured before the surface joins it. */
export interface ImageBandAnchors {
  /** Index that puts the quad over the world group and under the HUD (the scene band). */
  readonly world: number;
  /** Index that puts the quad over the UI and under the debug layer (the screen band). */
  readonly screen: number;
}

/** Options for {@link createImageSurface}. */
export interface ImageSurfaceOptions {
  /** The layer stack's root group — the surface's container joins it in the world band. */
  readonly root: Container;
  /** The band anchors inside `root` (the renderer computes them from its own layer stack). */
  readonly bands: ImageBandAnchors;
  /** Frame width the quad covers (default core's `FRAME_W` — the still is stretched to it). */
  readonly width?: number;
  /** Frame height the quad covers (default core's `FRAME_H`). */
  readonly height?: number;
}

/** The renderer's image surface: one quad, at most one resident still, nothing per frame. */
export interface ImageSurface {
  /** The surface's container (a child of the layer stack's root group, in the current band). */
  readonly container: Container;
  /** The band the container currently draws in (`world` until {@link ImageSurface.setBand}). */
  readonly band: ImageBand;
  /**
   * Whether a still is resident now (false after {@link ImageSurface.hide} and
   * {@link ImageSurface.destroy}) — the shell's memory estimator charges the bytes it stands
   * for exactly while this is true (the attached-page rule of `memory` `estimateMemory`).
   */
  readonly shown: boolean;
  /** Width of the resident still in pixels (0 while none is shown). */
  readonly stillWidth: number;
  /** Height of the resident still in pixels (0 while none is shown). */
  readonly stillHeight: number;
  /**
   * Shows a decoded still (cold path — from a scene transition, never from `render()`). The
   * surface owns the image from here: a swap attaches the new one and closes the previous,
   * {@link ImageSurface.hide} closes it. The bitmap is stretched to the frame; the pipeline
   * bakes any contain-and-pad into the shipped PNG, and a size change (a swap between stills of
   * different pixel sizes) rebuilds the texture on the same cold path.
   *
   * @param image - The decoded image to show (an `ImageBitmap` from the shell's page-image
   *   factory, or its `Image` fallback); ownership transfers to the surface.
   */
  show(image: AtlasPageImage): void;
  /**
   * Hides the quad and **releases everything**: closes the resident image (the VRAM law of the
   * module docblock) and destroys its texture and source. The next {@link ImageSurface.show}
   * builds fresh ones. Idempotent.
   */
  hide(): void;
  /**
   * Moves the quad between the two draw bands (cold path — the director calls it when a still
   * starts, never per frame). The `world` band draws over the world group and under the HUD and
   * UI; the `screen` band draws over the UI and under the debug layer.
   *
   * @param band - The band the current still belongs to.
   */
  setBand(band: ImageBand): void;
  /** {@link ImageSurface.hide} plus release of the container. */
  destroy(): void;
}

/**
 * Builds the image surface: the container joins the root at the world-band anchor (the video
 * surface's rule — the renderer creates this surface before the video surface, so a clip in the
 * same band draws over the still), and the quad itself is built on the first
 * {@link ImageSurface.show} — an unused surface owns no sprite, texture or image at all.
 *
 * @param options - Root group, band anchors and frame size.
 * @returns The surface.
 *
 * @example
 * ```ts
 * const surface = createImageSurface({ root: layers.root, bands: { world: 1, screen: 3 } });
 * surface.show(bitmap); // the pipeline's 640×360 PNG, already decoded
 * surface.hide();       // closed and destroyed — zero bytes held
 * ```
 */
export function createImageSurface(options: ImageSurfaceOptions): ImageSurface {
  const width = options.width ?? FRAME_W;
  const height = options.height ?? FRAME_H;
  const root = options.root;
  const bands = options.bands;
  const container = new Container({ label: 'stills' });
  root.addChildAt(container, bands.world);

  /** The band the container currently sits in. */
  let band: ImageBand = 'world';
  /** The quad, built with the first still (null until then — an idle surface holds nothing). */
  let sprite: Sprite | null = null;
  /** The still's texture (its source rides inside it; both destroyed by every `hide()`). */
  let texture: Texture | null = null;
  /** The resident image (null while none); owned by the surface, closed on swap and release. */
  let live: AtlasPageImage | null = null;

  /**
   * Swaps a decoded image into the quad: the reuse arm replaces the source's resource (the
   * `Atlas.loadPage` replace rule — attach first, close the previous after) when the size
   * matches, and a size change rebuilds texture and source after the reassignment. Cold path.
   *
   * @param image - The image to show; the surface takes ownership.
   */
  const show = (image: AtlasPageImage): void => {
    const previousTexture = texture;
    const previousImage = live;
    const own = previousTexture === null ? null : previousTexture.source;
    if (
      own !== null &&
      own !== Texture.EMPTY.source &&
      own.pixelWidth === image.width &&
      own.pixelHeight === image.height
    ) {
      own.resource = image;
      own.update();
      live = image;
      if (sprite !== null) sprite.visible = true;
      if (previousImage !== null && previousImage !== image) closePageImage(previousImage);
      return;
    }
    const source = new TextureSource({
      resource: image,
      width: image.width,
      height: image.height,
      label: 'stills',
    });
    // The proven atlas/video upload path: the bitmap is a plain image source on both GL
    // versions (render-pixi `video/index.ts` — the Mali-safe choice, not a specialised one).
    source.uploadMethodId = 'image';
    const next = new Texture({ source });
    if (sprite === null) {
      sprite = new Sprite(next);
      sprite.width = width;
      sprite.height = height;
      container.addChild(sprite);
    } else {
      sprite.texture = next;
      sprite.visible = true;
    }
    // The old texture (with its source) leaves only after the quad points at the new one.
    if (previousTexture !== null && previousTexture !== next) previousTexture.destroy(true);
    texture = next;
    live = image;
    if (previousImage !== null && previousImage !== image) closePageImage(previousImage);
  };

  /**
   * Releases the resident still: hide the quad, detach the texture, destroy texture and source,
   * then close the image — the order that keeps a closed bitmap unreachable for any re-upload.
   * Cold path; idempotent.
   */
  const hide = (): void => {
    const ownTexture = texture;
    const ownImage = live;
    texture = null;
    live = null;
    if (sprite !== null) {
      sprite.texture = Texture.EMPTY;
      sprite.visible = false;
    }
    if (ownTexture !== null) ownTexture.destroy(true);
    if (ownImage !== null) closePageImage(ownImage);
  };

  return {
    container,
    get band(): ImageBand {
      return band;
    },
    get shown(): boolean {
      return live !== null;
    },
    get stillWidth(): number {
      return live === null ? 0 : live.width;
    },
    get stillHeight(): number {
      return live === null ? 0 : live.height;
    },
    show,
    hide,
    setBand(next: ImageBand): void {
      if (next === band) return;
      band = next;
      root.addChildAt(container, next === 'world' ? bands.world : bands.screen);
    },
    destroy(): void {
      hide();
      container.destroy({ children: true });
      sprite = null;
    },
  };
}
