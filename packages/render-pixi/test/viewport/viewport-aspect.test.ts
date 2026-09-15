/**
 * The **aspect modes** of plan M3-02 (shmup_feat.md §18 "[P2] widescreen Darius-style ultra-wide
 * mode for desktop", §3 "classic 4:3 mode with pillarbox side art"): `computeAspectViewport`
 * places the frame in a window of the chosen ratio — the whole display (`normal`), 64:27
 * (`wide`) or 4:3 (`classic`) — and reports the leftover width as the side panels the renderer
 * fills. The frame itself is never cropped and the scale mode still decides how it fills the
 * window.
 */
import { ASPECT_MODES } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { ASPECT_RATIOS, computeAspectViewport, computeViewport } from '../../src/viewport/index.js';

describe('render-pixi/viewport aspect modes (M3-02)', () => {
  it('has one ratio per core aspect mode, `normal` unconstrained', () => {
    expect(ASPECT_MODES).toEqual(['normal', 'wide', 'classic']);
    expect(ASPECT_RATIOS).toHaveLength(ASPECT_MODES.length);
    expect(ASPECT_RATIOS[0]).toBe(0);
    expect(ASPECT_RATIOS[1]).toBeCloseTo(64 / 27, 10);
    expect(ASPECT_RATIOS[2]).toBeCloseTo(4 / 3, 10);
  });

  it('`normal` is the plain viewport over the whole display, with no panels', () => {
    for (const mode of ['integer', 'fit', 'stretch'] as const) {
      const placed = computeAspectViewport(0, mode, 1920, 1080, 384, 216);
      expect(placed.viewport).toEqual(computeViewport(mode, 1920, 1080, 384, 216));
      expect([placed.panelLeft, placed.panelRight]).toEqual([0, 0]);
      expect([placed.windowX, placed.windowY]).toEqual([0, 0]);
      expect([placed.windowWidth, placed.windowHeight]).toEqual([1920, 1080]);
    }
  });

  it('`classic` pillarboxes a widescreen display and reports both panels', () => {
    const placed = computeAspectViewport(2, 'integer', 1920, 1080, 384, 216);
    expect([placed.windowWidth, placed.windowHeight]).toEqual([1440, 1080]);
    expect([placed.panelLeft, placed.panelRight]).toEqual([240, 240]);
    expect(placed.windowX).toBe(240);
    // The frame keeps its own integer scale inside the narrower window, centred in the display.
    const inner = computeViewport('integer', 1440, 1080, 384, 216);
    expect(placed.viewport.scale).toBe(inner.scale);
    expect(placed.viewport.width).toBe(inner.width);
    expect(placed.viewport.x).toBe(inner.x + 240);
    expect(placed.viewport.y).toBe(inner.y);
    // Centred: the same margin either side of the frame.
    expect(placed.viewport.x).toBe((1920 - placed.viewport.width) / 2);
  });

  it('`wide` fills an ultra-wide display edge to edge, with no panels left', () => {
    const ultra = computeAspectViewport(1, 'integer', 2560, 1080, 384, 216);
    expect([ultra.windowWidth, ultra.windowHeight]).toEqual([2560, 1080]);
    expect([ultra.panelLeft, ultra.panelRight]).toEqual([0, 0]);
    expect(ultra.viewport).toEqual(computeViewport('integer', 2560, 1080, 384, 216));
  });

  it('`wide` letterboxes a 16:9 display into a cabinet window instead of cropping', () => {
    const tv = computeAspectViewport(1, 'integer', 1920, 1080, 384, 216);
    expect(tv.windowWidth).toBe(1920);
    expect(tv.windowHeight).toBe(810);
    expect([tv.panelLeft, tv.panelRight]).toEqual([0, 0]);
    expect(tv.windowY).toBe(135);
    // The whole frame is still there — 384×216 scaled, never cut.
    expect(tv.viewport.width / tv.viewport.scaleX).toBe(384);
    expect(tv.viewport.height / tv.viewport.scaleY).toBe(216);
    expect(tv.viewport.y).toBeGreaterThanOrEqual(tv.windowY);
  });

  it('a window taller than the display shrinks in height, not past the edges', () => {
    // A tall (portrait) display: the 4:3 window is limited by the width.
    const portrait = computeAspectViewport(2, 'integer', 600, 1000, 384, 216);
    expect(portrait.windowWidth).toBe(600);
    expect(portrait.windowHeight).toBe(450);
    expect([portrait.panelLeft, portrait.panelRight]).toEqual([0, 0]);
    expect(portrait.windowY).toBe(275);
  });

  it('survives a degenerate display and an unknown mode index', () => {
    for (const bad of [-1, 3, 7.5, Number.NaN]) {
      const placed = computeAspectViewport(bad, 'integer', 1920, 1080, 384, 216);
      expect([placed.windowWidth, placed.windowHeight]).toEqual([1920, 1080]);
      expect([placed.panelLeft, placed.panelRight]).toEqual([0, 0]);
    }
    for (const size of [0, -10]) {
      const placed = computeAspectViewport(2, 'integer', size, size, 384, 216);
      expect(placed.windowWidth).toBeGreaterThan(0);
      expect(placed.windowHeight).toBeGreaterThan(0);
      expect(placed.panelLeft).toBeGreaterThanOrEqual(0);
      expect(placed.panelRight).toBeGreaterThanOrEqual(0);
    }
  });

  it('never loses a pixel: the panels and the window fill the display', () => {
    for (const aspect of [0, 1, 2]) {
      for (const [dw, dh] of [
        [1920, 1080],
        [2560, 1080],
        [1280, 720],
        [3440, 1440],
        [1000, 600],
        [640, 480],
      ]) {
        const placed = computeAspectViewport(aspect, 'integer', dw, dh, 384, 216);
        expect(placed.panelLeft + placed.windowWidth + placed.panelRight).toBe(dw);
        expect(placed.windowX).toBe(placed.panelLeft);
        expect(placed.viewport.x).toBeGreaterThanOrEqual(placed.windowX);
        expect(placed.viewport.x + placed.viewport.width).toBeLessThanOrEqual(
          placed.windowX + placed.windowWidth + 1,
        );
      }
    }
  });
});
