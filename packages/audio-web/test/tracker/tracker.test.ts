/**
 * `audio-web/tracker` (plan M3-03): capability detection, the music-path decision and the size
 * arithmetic that keeps libopenmpt out of the Tizen bundle. The acceptance criterion the plan
 * names for this step is "audio path selection tests" — this file is it.
 *
 * Nothing here loads a tracker: `chiptune3` is not a dependency of this repo, so every
 * {@link TrackerBackend} below is a fake and no shipped build can choose the tracker path.
 *
 * @module
 */
import { describe, expect, it } from 'vitest';
import {
  NO_TRACKER,
  TIZEN_APP_JS_GZIP_BUDGET,
  TRACKER_MODULE_EXTENSIONS,
  TRACKER_WORKLET_GZIP_BYTES,
  chooseMusicPath,
  detectAudioCapabilities,
  isTrackerModuleUrl,
  moduleInfo,
  trackerFitsBundle,
  type TrackerAvailability,
  type TrackerBackend,
} from '../../src/tracker/index.js';

/** A backend that would play modules, if one existed. */
const FAKE_BACKEND: TrackerBackend = {
  load: () =>
    Promise.resolve({
      start: () => Promise.resolve(),
      stop: () => undefined,
      setVolume: () => undefined,
    }),
  dispose: () => undefined,
};

/**
 * Availability with a backend and the given capabilities.
 *
 * @param audioWorklet - AudioWorklet support.
 * @param wasm - WebAssembly support.
 * @returns The availability.
 */
function live(audioWorklet = true, wasm = true): TrackerAvailability {
  return { caps: { audioWorklet, wasm }, backend: FAKE_BACKEND };
}

describe('audio-web/tracker capabilities (M3-03)', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('tracker');
    expect(moduleInfo.status).toBe('implemented');
    expect(moduleInfo.specRefs).toContain('shmup_tech.md §4.3');
  });

  it('reads AudioWorklet and WebAssembly off the global scope, missing ones as false', () => {
    expect(detectAudioCapabilities({})).toEqual({ audioWorklet: false, wasm: false });
    expect(detectAudioCapabilities({ WebAssembly: {} })).toEqual({
      audioWorklet: false,
      wasm: true,
    });
    // What the 2026-09-15 probe found on the M7 monitors: both present.
    expect(detectAudioCapabilities({ AudioWorkletNode: () => undefined, WebAssembly: {} })).toEqual(
      {
        audioWorklet: true,
        wasm: true,
      },
    );
    // A truthy-but-wrong global is not support.
    expect(detectAudioCapabilities({ AudioWorkletNode: 1, WebAssembly: null })).toEqual({
      audioWorklet: false,
      wasm: false,
    });
  });

  it('runs on the real global scope without throwing', () => {
    const caps = detectAudioCapabilities();
    expect(typeof caps.audioWorklet).toBe('boolean');
    // Node has WebAssembly but no AudioWorkletNode.
    expect(caps.wasm).toBe(true);
    expect(caps.audioWorklet).toBe(false);
  });
});

describe('audio-web/tracker path selection (M3-03)', () => {
  it('ships with no backend, so a module track still plays its song', () => {
    expect(NO_TRACKER.backend).toBeNull();
    expect(chooseMusicPath({ song: true, file: false, module: true })).toBe('song');
    expect(chooseMusicPath({ song: false, file: true, module: true })).toBe('file');
  });

  it('picks the tracker only with a module, both capabilities and a backend', () => {
    const source = { song: true, file: false, module: true };
    expect(chooseMusicPath(source, live())).toBe('tracker');
    expect(chooseMusicPath(source, live(false, true))).toBe('song'); // no AudioWorklet
    expect(chooseMusicPath(source, live(true, false))).toBe('song'); // no WebAssembly
    expect(
      chooseMusicPath(source, { caps: { audioWorklet: true, wasm: true }, backend: null }),
    ).toBe('song');
    // No module in the content: the backend is irrelevant.
    expect(chooseMusicPath({ song: true, file: false, module: false }, live())).toBe('song');
  });

  it('prefers a recorded file over the placeholder chip song', () => {
    expect(chooseMusicPath({ song: true, file: true, module: false })).toBe('file');
  });

  it('answers "none" for a track with nothing to play', () => {
    expect(chooseMusicPath({ song: false, file: false, module: false })).toBe('none');
    expect(chooseMusicPath({ song: false, file: false, module: true })).toBe('none');
    expect(chooseMusicPath({ song: false, file: false, module: true }, live())).toBe('tracker');
  });
});

describe('audio-web/tracker the size argument (M3-03)', () => {
  it('states why libopenmpt cannot be inlined into the Tizen widget', () => {
    expect(TRACKER_WORKLET_GZIP_BYTES).toBe(518 * 1024);
    expect(TIZEN_APP_JS_GZIP_BUDGET).toBe(512 * 1024);
    // The player alone is bigger than the whole widget's budget — before a line of game code.
    expect(trackerFitsBundle()).toBe(false);
    expect(TRACKER_WORKLET_GZIP_BYTES - TIZEN_APP_JS_GZIP_BUDGET).toBe(6 * 1024);
    // It fits a budget that is large enough, and the used bytes count against it.
    expect(trackerFitsBundle(1024 * 1024)).toBe(true);
    expect(trackerFitsBundle(1024 * 1024, 600 * 1024)).toBe(false);
  });

  it('knows the module formats libopenmpt reads', () => {
    expect(TRACKER_MODULE_EXTENSIONS).toEqual(['.mod', '.xm', '.it', '.s3m']);
    for (const extension of TRACKER_MODULE_EXTENSIONS) {
      expect(isTrackerModuleUrl(`audio/music/zone-a${extension}`), extension).toBe(true);
      expect(isTrackerModuleUrl(`audio/music/zone-a${extension.toUpperCase()}`)).toBe(true);
    }
    expect(isTrackerModuleUrl('audio/music/zone-a.ogg')).toBe(false);
    expect(isTrackerModuleUrl('audio/music/xm')).toBe(false);
    expect(isTrackerModuleUrl('')).toBe(false);
  });
});
