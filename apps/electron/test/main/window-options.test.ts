import { describe, expect, it } from 'vitest';
import { createWindowOptions } from '../../src/main/window-options.js';

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
    expect(options.width).toBe(384 * 3);
    expect(options.height).toBe(216 * 3);
    expect(options.fullscreen).toBe(false);
  });

  it('honours the fullscreen flag', () => {
    expect(createWindowOptions({ preloadPath: 'p', fullscreen: true }).fullscreen).toBe(true);
  });

  it('sizes the content to the scale of the 384x216 frame, placed or centred (M2-17)', () => {
    const centred = createWindowOptions({ preloadPath: 'p', fullscreen: false, scale: 5 });
    expect(centred).toMatchObject({
      width: 1920,
      height: 1080,
      useContentSize: true,
      center: true,
    });
    expect(centred).not.toHaveProperty('x');
    const placed = createWindowOptions({ preloadPath: 'p', fullscreen: false, x: -40, y: 0 });
    expect(placed).toMatchObject({ width: 1152, height: 648, x: -40, y: 0 });
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
