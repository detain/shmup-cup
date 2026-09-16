/**
 * Edge cases of `audio-web/tracker` (plan M3-03): the whole truth table of `chooseMusicPath`
 * (2⁵ = 32 combinations of what a track carries and what the host can do), capability detection
 * against hostile scopes, the extension test's boundaries, and the size arithmetic at its exact
 * threshold.
 *
 * The invariant worth protecting here is that **turning the tracker path on can never silence a
 * device**: a track always keeps its song or its file, so whenever the tracker is refused the
 * decision falls back to something playable. The truth table below is what proves it.
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
  trackerFitsBundle,
  type MusicPath,
  type TrackerBackend,
} from '../../src/tracker/index.js';

/** A backend that would play modules, if one existed. */
const BACKEND: TrackerBackend = {
  load: () =>
    Promise.resolve({
      start: () => Promise.resolve(),
      stop: () => undefined,
      setVolume: () => undefined,
    }),
  dispose: () => undefined,
};

describe('audio-web/tracker — the whole path truth table (M3-03)', () => {
  it('answers every combination of source and host, and never goes silent with a source', () => {
    const rows: string[] = [];
    for (let bits = 0; bits < 32; bits++) {
      const source = {
        song: (bits & 1) !== 0,
        file: (bits & 2) !== 0,
        module: (bits & 4) !== 0,
      };
      const audioWorklet = (bits & 8) !== 0;
      const wasm = (bits & 16) !== 0;
      for (const backend of [null, BACKEND]) {
        const path = chooseMusicPath(source, { caps: { audioWorklet, wasm }, backend });
        const trackerReady = source.module && audioWorklet && wasm && backend !== null;
        const expected: MusicPath = trackerReady
          ? 'tracker'
          : source.file
            ? 'file'
            : source.song
              ? 'song'
              : 'none';
        const label = `song=${source.song} file=${source.file} module=${source.module} worklet=${audioWorklet} wasm=${wasm} backend=${backend !== null}`;
        expect(path, label).toBe(expected);
        // The safety property: a track that carries a playable source is never answered 'none',
        // whatever the device says. Refusing the tracker always falls back, never silences.
        if (source.song || source.file) expect(path, label).not.toBe('none');
        rows.push(`${label} → ${path}`);
      }
    }
    expect(rows).toHaveLength(64);
    // A module on its own, with no host support, is the one way a track can go quiet — which is
    // why the music loader refuses a track whose only source is a module.
    expect(chooseMusicPath({ song: false, file: false, module: true })).toBe('none');
  });

  it('needs all three conditions: one missing is enough to refuse the tracker', () => {
    const source = { song: true, file: false, module: true };
    expect(
      chooseMusicPath(source, { caps: { audioWorklet: true, wasm: true }, backend: BACKEND }),
    ).toBe('tracker');
    expect(
      chooseMusicPath(source, { caps: { audioWorklet: false, wasm: true }, backend: BACKEND }),
    ).toBe('song');
    expect(
      chooseMusicPath(source, { caps: { audioWorklet: true, wasm: false }, backend: BACKEND }),
    ).toBe('song');
    expect(
      chooseMusicPath(source, { caps: { audioWorklet: true, wasm: true }, backend: null }),
    ).toBe('song');
  });

  it('defaults to the shipped availability — no backend, no capabilities', () => {
    expect(NO_TRACKER.backend).toBeNull();
    expect(NO_TRACKER.caps).toEqual({ audioWorklet: false, wasm: false });
    expect(Object.isFrozen(NO_TRACKER)).toBe(true);
    expect(Object.isFrozen(NO_TRACKER.caps)).toBe(true);
    expect(chooseMusicPath({ song: true, file: true, module: true })).toBe(
      chooseMusicPath({ song: true, file: true, module: true }, NO_TRACKER),
    );
  });
});

describe('audio-web/tracker — capability detection edge cases (M3-03)', () => {
  it('wants a callable AudioWorkletNode and an object WebAssembly, nothing looser', () => {
    expect(detectAudioCapabilities({})).toEqual({ audioWorklet: false, wasm: false });
    expect(
      detectAudioCapabilities({ AudioWorkletNode: undefined, WebAssembly: undefined }),
    ).toEqual({ audioWorklet: false, wasm: false });
    // A truthy value of the wrong type is not support: `typeof` is the whole test.
    expect(detectAudioCapabilities({ AudioWorkletNode: {}, WebAssembly: 1 })).toEqual({
      audioWorklet: false,
      wasm: false,
    });
    expect(detectAudioCapabilities({ AudioWorkletNode: 'yes', WebAssembly: 'yes' })).toEqual({
      audioWorklet: false,
      wasm: false,
    });
    // `null` is an object — the explicit null check is what keeps it out.
    expect(detectAudioCapabilities({ WebAssembly: null })).toEqual({
      audioWorklet: false,
      wasm: false,
    });
    expect(
      detectAudioCapabilities({
        AudioWorkletNode: function AudioWorkletNode() {},
        WebAssembly: {},
      }),
    ).toEqual({ audioWorklet: true, wasm: true });
  });

  it('never throws on a scope whose properties are hostile', () => {
    const scope = Object.create(null) as Record<string, unknown>;
    expect(detectAudioCapabilities(scope)).toEqual({ audioWorklet: false, wasm: false });
    // An inherited global still counts: `typeof scope.X` walks the prototype chain, which is how
    // a real `window` exposes its constructors.
    const inherited = Object.create({ WebAssembly: {} }) as Record<string, unknown>;
    expect(detectAudioCapabilities(inherited).wasm).toBe(true);
  });
});

describe('audio-web/tracker — module URLs and the size argument (M3-03)', () => {
  it('matches the four extensions, case-insensitively, and nothing else', () => {
    for (const extension of TRACKER_MODULE_EXTENSIONS) {
      expect(isTrackerModuleUrl(`audio/music/zone-a${extension}`), extension).toBe(true);
      expect(isTrackerModuleUrl(`AUDIO/ZONE-A${extension.toUpperCase()}`), extension).toBe(true);
    }
    for (const url of [
      'audio/music/zone-a.ogg',
      'audio/music/zone-a.mp3',
      'audio/music/zone-a.module',
      'audio/music/zone-a.mod.ogg',
      'audio/music/mod',
      'audio/music/.mod.txt',
      '',
    ]) {
      expect(isTrackerModuleUrl(url), JSON.stringify(url)).toBe(false);
    }
    // A bare extension is a (silly but valid) module name — the check is on the suffix only.
    expect(isTrackerModuleUrl('.xm')).toBe(true);
    expect(Object.isFrozen(TRACKER_MODULE_EXTENSIONS)).toBe(true);
  });

  it('says no for the Tizen budget and yes only above the worklet’s own size', () => {
    expect(trackerFitsBundle()).toBe(false);
    expect(TRACKER_WORKLET_GZIP_BYTES).toBeGreaterThan(TIZEN_APP_JS_GZIP_BUDGET);
    // The exact threshold, both sides of it, with and without a bundle already using space.
    expect(trackerFitsBundle(TRACKER_WORKLET_GZIP_BYTES)).toBe(true);
    expect(trackerFitsBundle(TRACKER_WORKLET_GZIP_BYTES - 1)).toBe(false);
    expect(trackerFitsBundle(TRACKER_WORKLET_GZIP_BYTES + 1000, 1000)).toBe(true);
    expect(trackerFitsBundle(TRACKER_WORKLET_GZIP_BYTES + 1000, 1001)).toBe(false);
    // Even an empty bundle of the TV's budget cannot hold it — that is the whole argument.
    expect(trackerFitsBundle(TIZEN_APP_JS_GZIP_BUDGET, 0)).toBe(false);
    expect(TIZEN_APP_JS_GZIP_BUDGET).toBe(512 * 1024);
  });
});
