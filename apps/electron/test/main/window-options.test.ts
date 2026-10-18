import { describe, expect, it } from 'vitest';
import { createWindowOptions } from '../../src/main/window-options.js';
import { DEFAULT_WINDOW_SCALE, FRAME_HEIGHT, FRAME_WIDTH } from '../../src/main/window-state.js';

describe('electron/main/window-options', () => {
  it('locks down the renderer and keeps the game loop unthrottled', () => {
    const options = createWindowOptions({ preloadPath: '/x/preload.cjs', fullscreen: false });
    expect(options.webPreferences).toMatchObject({
      preload: '/x/preload.cjs',
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    });
    expect(options.width).toBe(FRAME_WIDTH * DEFAULT_WINDOW_SCALE);
    expect(options.height).toBe(FRAME_HEIGHT * DEFAULT_WINDOW_SCALE);
    expect(options.fullscreen).toBe(false);
  });

  it('honours the fullscreen flag', () => {
    expect(createWindowOptions({ preloadPath: 'p', fullscreen: true }).fullscreen).toBe(true);
  });

  it('sizes the content to the scale of the frame, placed or centred (M2-17)', () => {
    const centred = createWindowOptions({ preloadPath: 'p', fullscreen: false, scale: 5 });
    expect(centred).toMatchObject({
      width: FRAME_WIDTH * 5, // 1920 × 1080 at 384×216
      height: FRAME_HEIGHT * 5,
      useContentSize: true,
      center: true,
    });
    expect(centred).not.toHaveProperty('x');
    const placed = createWindowOptions({ preloadPath: 'p', fullscreen: false, x: -40, y: 0 });
    expect(placed).toMatchObject({
      width: FRAME_WIDTH * DEFAULT_WINDOW_SCALE, // 1152 × 648 at 384×216, 1280 × 720 at 640×360
      height: FRAME_HEIGHT * DEFAULT_WINDOW_SCALE,
      x: -40,
      y: 0,
    });
    expect(placed).not.toHaveProperty('center');
    // Half a position centres.
    expect(createWindowOptions({ preloadPath: 'p', fullscreen: false, x: 10 })).toMatchObject({
      center: true,
    });
  });

  it('lets the game play audio without a gesture (the web build unlocks it at boot on Electron)', () => {
    expect(
      createWindowOptions({ preloadPath: 'p', fullscreen: false }).webPreferences,
    ).toMatchObject({ autoplayPolicy: 'no-user-gesture-required' });
  });
});
