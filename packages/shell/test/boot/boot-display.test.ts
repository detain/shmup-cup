/**
 * `boot` (plan R6-04, decision W5-20): the pure resolution of the GRAPHICS page's two boot knobs —
 * the output cap sizing the backbuffer, the WebGL version under the dev pin, the Chromium 71 floor
 * and the probe, and the raw save text the host reads before any store exists.
 */
import {
  DEFAULT_USER_OPTIONS,
  SAVE_STORAGE_KEY,
  SAVE_VERSION,
  serializeSave,
  type OutputCap,
  type RendererChoice,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  WEBGL2_MIN_CHROMIUM,
  bootDisplayFromSaveText,
  capDisplaySize,
  chromiumMajorFromUserAgent,
  outputCapHeight,
  probeWebGL2,
  resolveBootGLVersion,
} from '../../src/boot/index.js';

/** A fake `Window` carrying only a canvas `getContext` for the probe. */
function probeWin(getContext: (kind: string) => unknown): Window {
  return {
    document: {
      createElement: () => ({ getContext }),
    },
  } as unknown as Window;
}

describe('shell/boot the output cap (R6-04)', () => {
  it('reads the cap height from the table', () => {
    expect(outputCapHeight('auto')).toBe(0);
    expect(outputCapHeight('1080')).toBe(1080);
    expect(outputCapHeight('720')).toBe(720);
    expect(outputCapHeight('540')).toBe(540);
  });

  it('caps the backbuffer to the window aspect — and never upsizes', () => {
    expect(capDisplaySize(1920, 1080, 720)).toEqual({ width: 1280, height: 720 });
    expect(capDisplaySize(1920, 1080, 540)).toEqual({ width: 960, height: 540 });
    expect(capDisplaySize(1920, 1080, 1080)).toEqual({ width: 1920, height: 1080 });
    // A window shorter than the cap keeps its own size (no upscaling, no width below 1).
    expect(capDisplaySize(1280, 600, 720)).toEqual({ width: 1280, height: 600 });
    expect(capDisplaySize(640, 360, 0)).toEqual({ width: 640, height: 360 });
    // A rounding-prone aspect still gives a whole width of at least 1.
    expect(capDisplaySize(3, 2160, 540)).toEqual({ width: 1, height: 540 });
  });
});

describe('shell/boot the renderer choice (R6-04)', () => {
  it('keeps the dev pin over every saved choice', () => {
    expect(
      resolveBootGLVersion({ pin: 1, choice: 'webgl2', chromiumMajor: 130, hasWebGL2: true }),
    ).toBe(1);
    expect(
      resolveBootGLVersion({ pin: 2, choice: 'webgl1', chromiumMajor: 68, hasWebGL2: false }),
    ).toBe(2);
  });

  it('an explicit row pins its version even below the floor', () => {
    expect(
      resolveBootGLVersion({ pin: null, choice: 'webgl2', chromiumMajor: 69, hasWebGL2: false }),
    ).toBe(2);
    expect(
      resolveBootGLVersion({ pin: null, choice: 'webgl1', chromiumMajor: 130, hasWebGL2: true }),
    ).toBe(1);
  });

  it('auto stays on WebGL 1 under the Chromium 71 floor — both TVs (68 and 69)', () => {
    for (const major of [68, 69]) {
      expect(
        resolveBootGLVersion({ pin: null, choice: 'auto', chromiumMajor: major, hasWebGL2: true }),
      ).toBe(1);
    }
    expect(WEBGL2_MIN_CHROMIUM).toBe(71);
  });

  it('auto takes WebGL 2 only above the floor and with a live probe', () => {
    expect(
      resolveBootGLVersion({ pin: null, choice: 'auto', chromiumMajor: 71, hasWebGL2: true }),
    ).toBe(2);
    expect(
      resolveBootGLVersion({ pin: null, choice: 'auto', chromiumMajor: 130, hasWebGL2: false }),
    ).toBe(1);
  });

  it('reads the Chromium major from the user agents, else 0', () => {
    expect(
      chromiumMajorFromUserAgent(
        'Mozilla/5.0 (SmartHub; SMART-TV) AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/69.0.3497.106 LargeScreen/TV55 5.5 Safari/537.36',
      ),
    ).toBe(69);
    expect(
      chromiumMajorFromUserAgent(
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/68.0.3440.106 Safari/537.36 WebAppManager',
      ),
    ).toBe(68);
    expect(
      chromiumMajorFromUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/130.0.0.0 Safari/537.36',
      ),
    ).toBe(130);
    expect(chromiumMajorFromUserAgent('Mozilla/5.0 (compatible; MSIE 10.0)')).toBe(0);
    expect(chromiumMajorFromUserAgent('')).toBe(0);
  });

  it('the probe asks the canvas once and survives a window without a document', () => {
    expect(probeWebGL2(probeWin(() => ({})))).toBe(true);
    expect(probeWebGL2(probeWin(() => null))).toBe(false);
    expect(probeWebGL2({} as unknown as Window)).toBe(false);
  });
});

describe('shell/boot the raw save read (R6-04)', () => {
  /** A current save text carrying the given boot knobs. */
  function saved(output: OutputCap, renderer: RendererChoice): string {
    return serializeSave({
      version: SAVE_VERSION,
      options: {
        ...DEFAULT_USER_OPTIONS,
        display: { ...DEFAULT_USER_OPTIONS.display, output, renderer },
      },
      hiScores: {},
      stats: { gamesStarted: 0, gameOvers: 0, stagesCleared: 0 },
    });
  }

  it('reads both knobs off a current document', () => {
    expect(bootDisplayFromSaveText(saved('1080', 'webgl2'), false)).toEqual({
      output: '1080',
      renderer: 'webgl2',
    });
  });

  it("a TV host's `auto` output stands for the measured 720p cap", () => {
    expect(bootDisplayFromSaveText(saved('auto', 'auto'), true)).toEqual({
      output: '720',
      renderer: 'auto',
    });
    expect(bootDisplayFromSaveText(saved('540', 'webgl1'), true)).toEqual({
      output: '540',
      renderer: 'webgl1',
    });
  });

  it('no save, corrupt text and unknown names all land on auto', () => {
    expect(bootDisplayFromSaveText(null, false)).toEqual({ output: 'auto', renderer: 'auto' });
    expect(bootDisplayFromSaveText(null, true)).toEqual({ output: '720', renderer: 'auto' });
    expect(bootDisplayFromSaveText('{not json', true)).toEqual({ output: '720', renderer: 'auto' });
    expect(
      bootDisplayFromSaveText(saved('4K' as OutputCap, 'directx' as RendererChoice), false),
    ).toEqual({ output: 'auto', renderer: 'auto' });
  });

  it('the key the hosts read is the save key with the shell prefix', () => {
    // The hosts compose this name the same way; the helper just stands what it finds.
    expect(SAVE_STORAGE_KEY).toBe('save.v1');
  });
});
