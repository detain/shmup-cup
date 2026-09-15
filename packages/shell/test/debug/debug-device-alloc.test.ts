/**
 * Allocation guard of the debug tools' device line (plan M2-17 review — own file, the guard is
 * sensitive to what other suites leave behind): the TV app hands the tools a `device` callback that
 * returns its full line (about 66 characters, longer than the panel's 56) every frame, and
 * `beforeRender` passes it to the overlay each time. Before the review fix the overlay cleaned and
 * cut that line into a new string on every frame (~1.7 MB per 20,000 frames); now a frame with an
 * unchanged line allocates nothing. Measured on a second tools instance after a throwaway one (the
 * factory's hidden-class transitions — see the conventions' allocation-guard rules).
 */
import { EMPTY_CONTENT_DB, createGame, createHeadlessPlatform } from '@shmup/core';
import { createLayerStack, type PixiRenderer } from '@shmup/render-pixi';
import { describe, expect, it } from 'vitest';
import { createDebugTools } from '../../src/debug/index.js';
import { measureHeapGrowth } from '../../../core/test/helpers/alloc.js';

/** The remote unlock's full TV line (longer than the panel's 56 characters). */
const TV_LINE = 'LS43AM702U 20_KANTSU2 FW T-KSU2EUC-1234.5 1920x1080@1 C69 GL1/4096';

/**
 * Tools on a fake host whose device callback returns the TV line (the same string every frame,
 * like the Tizen app's `device.line`).
 *
 * @returns The tools.
 */
function tools() {
  const game = createGame(createHeadlessPlatform(), {}, EMPTY_CONTENT_DB);
  const device = { line: TV_LINE };
  return createDebugTools(
    {
      game,
      renderer: {
        atlas: null,
        layers: createLayerStack(),
        webGLVersion: 1,
        drawCalls: -1,
        particles: null,
      } as unknown as PixiRenderer,
      win: new EventTarget() as unknown as Window,
      now: () => 0,
      bootMs: 0,
      sceneId: () => 'title',
      visibleWorld: () => null,
    },
    { device: () => device.line },
  );
}

describe('shell/debug device line allocation (M2-17 review)', () => {
  it('passes an unchanged long device line to the overlay every frame without allocating', () => {
    const throwaway = tools();
    for (let i = 0; i < 2000; i++) throwaway.beforeRender();
    const t = tools();
    t.beforeRender();
    expect(t.overlay.panel.values.strings).toContain(TV_LINE.slice(0, 56));
    const growth = measureHeapGrowth(
      () => {
        t.beforeRender();
      },
      20_000,
      20_000,
      3,
      8 * 1024,
    );
    expect(growth.bytes).toBeLessThan(16 * 1024);
  }, 60_000);
});
