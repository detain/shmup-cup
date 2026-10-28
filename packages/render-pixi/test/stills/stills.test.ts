/**
 * The image surface (plan v20x A4) on fake bitmaps and the real Pixi containers: the band
 * join, the attach/swap/release lifecycle (the VRAM law in one file — every image the surface
 * drops is closed, once, at once), the size-change rebuild, `setBand` and `destroy`. The
 * `shown`/`stillWidth`/`stillHeight` figures the shell's memory estimator reads ride here too.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { FRAME_H, FRAME_W } from '@shmup/core';
import { createImageSurface, moduleInfo } from '../../src/stills/index.js';
import type { AtlasPageImage } from '../../src/atlas/index.js';

/** A decoded still: counts closes; the size is a parameter so rebuilds can be proven. */
class FakeBitmap {
  closes = 0;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  close(): void {
    this.closes++;
  }
}

/** The same image as the surface's parameter type (a fake, cast once per test). */
function asImage(bitmap: FakeBitmap): AtlasPageImage {
  return bitmap;
}

/** A surface over a fresh root group with the renderer's band anchors. */
function makeSurface() {
  // Root children [world, HUD, UI, DEBUG] at 0..3 — the renderer computes the anchors live,
  // exactly like `video/index.ts`; a still created here joins at index 1.
  const root = new Container({ label: 'layers' });
  root.addChild(new Container({ label: 'world' }));
  root.addChild(new Container({ label: 'HUD' }));
  root.addChild(new Container({ label: 'UI' }));
  root.addChild(new Container({ label: 'DEBUG' }));
  const bands = { world: 1, screen: 3 };
  const surface = createImageSurface({ root, bands });
  return { surface, root, bands };
}

describe('render-pixi/stills', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('stills');
    expect(moduleInfo.status).toBe('implemented');
  });

  it('joins the root group in the world band as an empty container — the quad is built on the first show', () => {
    const { surface, root } = makeSurface();
    expect(root.children).toContain(surface.container);
    expect(root.children.indexOf(surface.container)).toBe(1); // over world, under the HUD
    expect(surface.band).toBe('world');
    expect(surface.container.label).toBe('stills');
    expect(surface.container.children.length).toBe(0);
    expect(surface.shown).toBe(false);
    expect(surface.stillWidth).toBe(0);
    expect(surface.stillHeight).toBe(0);
  });

  it('shows a still: the quad appears, stretched to the frame, and the surface knows its size', () => {
    const { surface } = makeSurface();
    const bitmap = new FakeBitmap(FRAME_W, FRAME_H);
    surface.show(asImage(bitmap));
    expect(surface.shown).toBe(true);
    expect(surface.stillWidth).toBe(FRAME_W);
    expect(surface.stillHeight).toBe(FRAME_H);
    const sprite = surface.container.children[0] as Sprite;
    expect(sprite).toBeInstanceOf(Sprite);
    expect(sprite.visible).toBe(true);
    expect(sprite.width).toBe(FRAME_W); // the quad covers the frame whatever the bitmap's size
    expect(sprite.height).toBe(FRAME_H);
    expect(bitmap.closes).toBe(0); // the resident image stays open
    expect(sprite.texture.source.resource).toBe(asImage(bitmap));
    expect(sprite.texture.source.uploadMethodId).toBe('image'); // the proven atlas/video path
    surface.destroy();
  });

  it('a swap closes the previous image only after the new one is attached', () => {
    const { surface } = makeSurface();
    const first = new FakeBitmap(FRAME_W, FRAME_H);
    const second = new FakeBitmap(FRAME_W, FRAME_H);
    surface.show(asImage(first));
    const sprite = surface.container.children[0] as Sprite;
    const sourceOfFirst = sprite.texture.source;
    surface.show(asImage(second));
    expect(surface.container.children.length).toBe(1); // one quad, not two
    expect(sprite.texture.source).toBe(sourceOfFirst); // the same source was reused
    expect(sprite.texture.source.resource).toBe(asImage(second));
    expect(first.closes).toBe(1);
    expect(second.closes).toBe(0);
    surface.destroy();
  });

  it('a size change rebuilds the texture and closes the old image', () => {
    const { surface } = makeSurface();
    const wide = new FakeBitmap(FRAME_W, FRAME_H);
    const tall = new FakeBitmap(FRAME_W / 2, FRAME_H);
    surface.show(asImage(wide));
    const sprite = surface.container.children[0] as Sprite;
    const firstSource = sprite.texture.source;
    surface.show(asImage(tall));
    expect(sprite.texture.source).not.toBe(firstSource);
    expect(firstSource.destroyed).toBe(true); // destroy(true) took the source with the texture
    expect(wide.closes).toBe(1);
    expect(surface.stillWidth).toBe(FRAME_W / 2);
    surface.destroy();
  });

  it('hide releases everything: no texture, no source, the image closed once, the frame clean', () => {
    const { surface } = makeSurface();
    const bitmap = new FakeBitmap(FRAME_W, FRAME_H);
    surface.show(asImage(bitmap));
    surface.hide();
    expect(surface.shown).toBe(false);
    expect(bitmap.closes).toBe(1);
    const sprite = surface.container.children[0] as Sprite;
    expect(sprite.visible).toBe(false);
    expect(sprite.texture).toBe(Texture.EMPTY); // detached before the old texture was destroyed
    // A hide is idempotent and a later show works again (fresh texture, the rebuild arm).
    surface.hide();
    expect(bitmap.closes).toBe(1);
    const again = new FakeBitmap(FRAME_W, FRAME_H);
    surface.show(asImage(again));
    expect(surface.shown).toBe(true);
    expect(again.closes).toBe(0);
    surface.destroy();
  });

  it('setBand moves the container and the same-band call is inert', () => {
    const { surface, root } = makeSurface();
    surface.setBand('screen');
    expect(surface.band).toBe('screen');
    // Move = remove + insert at 3: [world, HUD, UI, stills, DEBUG] — over the UI, under DEBUG.
    expect(root.children.indexOf(surface.container)).toBe(3);
    const children = [...root.children];
    surface.setBand('screen');
    expect(root.children).toEqual(children); // no move, no duplicate
    surface.setBand('world');
    expect(root.children.indexOf(surface.container)).toBe(1);
    expect(root.children.length).toBe(children.length);
    surface.destroy();
  });

  it('destroy releases a resident still and leaves the root group', () => {
    const { surface, root } = makeSurface();
    const bitmap = new FakeBitmap(FRAME_W, FRAME_H);
    surface.show(asImage(bitmap));
    surface.destroy();
    expect(bitmap.closes).toBe(1);
    expect(root.children).not.toContain(surface.container);
  });

  it('the created-before-video order holds: a later container at the same anchor draws above', () => {
    // The renderer creates the stills surface first, then the video surface; both insert at the
    // live world anchor, so the video container ends above the still (the endings show the
    // dawn-flight clip over their backdrop). This test pins the insertion arithmetic itself.
    const { root } = makeSurface();
    const first = new Container({ label: 'stills' });
    root.addChildAt(first, 1); // [world, stills, HUD, UI, DEBUG]
    const second = new Container({ label: 'video' });
    root.addChildAt(second, root.children.indexOf(root.children[2])); // the recomputed HUD index
    expect(root.children.indexOf(second)).toBeGreaterThan(root.children.indexOf(first));
  });
});
