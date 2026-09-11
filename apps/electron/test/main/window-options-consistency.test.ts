/**
 * The desktop window must match the game's internal resolution and palette, and must
 * never grant the renderer Node access.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createWindowOptions } from '../../src/main/window-options.js';

const options = createWindowOptions({ preloadPath: '/p/preload.cjs', fullscreen: false });
const webIndex = readFileSync(new URL('../../../web/index.html', import.meta.url), 'utf8');

describe('electron/main/window-options consistency', () => {
  it('opens at an integer multiple of 384x216 and never smaller than one frame', () => {
    const width = options.width ?? 0;
    const height = options.height ?? 0;
    expect(width % 384).toBe(0);
    expect(height % 216).toBe(0);
    expect(width / 384).toBe(height / 216);
    expect([options.minWidth, options.minHeight]).toEqual([384, 216]);
  });

  it('uses the same letterbox colour as the web page to avoid a flash on load', () => {
    expect(options.backgroundColor).toBe('#05070f');
    expect(webIndex).toContain(`background: ${options.backgroundColor ?? ''}`);
  });

  it('stays hidden until ready-to-show and never enables Node in the renderer', () => {
    expect(options.show).toBe(false);
    const prefs = options.webPreferences ?? {};
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.nodeIntegrationInWorker).toBeUndefined();
    expect(prefs.webSecurity).toBeUndefined(); // default (true) — never disabled
    expect(prefs.allowRunningInsecureContent).toBeUndefined();
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.sandbox).toBe(true);
  });

  it('returns a fresh object per call', () => {
    const a = createWindowOptions({ preloadPath: 'a', fullscreen: false });
    const b = createWindowOptions({ preloadPath: 'b', fullscreen: true });
    expect(a).not.toBe(b);
    expect(a.webPreferences?.preload).toBe('a');
    expect(b.webPreferences?.preload).toBe('b');
  });
});
