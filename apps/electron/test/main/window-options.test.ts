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
});
