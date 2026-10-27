/**
 * R2 (v20x-TL TL-1): the segment kit the run checkpoint rides on — `SegmentRecorder.snapshot`
 * (non-destructive: the recording continues; the copy carries the live ticks, hashes and a final
 * hash equal to the World's own at that instant; null once sealed or before any header) and the
 * `runSegmentToJson` / `runSegmentFromJson` pair (round trip byte-faithful; malformed input a
 * `RangeError`, a v1 or foreign-frame replay a `ReplayVersionError`).
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { ReplayVersionError, createReplayHeader } from '../../src/replay/format.js';
import { SegmentRecorder, runSegmentFromJson, runSegmentToJson } from '../../src/replay/run.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * A World and a recorder that has been stepping it (no finish).
 *
 * @param ticks - Ticks recorded so far.
 * @returns The handles.
 */
function live(ticks: number): { world: World; recorder: SegmentRecorder } {
  const config = resolveGameConfig({ seed: 5 });
  const world = createWorld(config, EMPTY_CONTENT_DB);
  const recorder = new SegmentRecorder();
  recorder.begin(createReplayHeader(config, { buildId: 'test' }), { hiScore: 0 });
  const input = createInputSnapshot();
  for (let t = 0; t < ticks; t++) {
    commitPlayerInput(input.players[0], (t >> 5) & 1 ? Action.Up : Action.Down);
    recorder.record(input);
    stepWorld(world, input);
    recorder.check(world);
  }
  return { world, recorder };
}

describe('SegmentRecorder.snapshot (R2 TL-1)', () => {
  it('copies the live segment without ending the recording', () => {
    const { world, recorder } = live(100);
    const snap = recorder.snapshot(world);
    if (snap === null) throw new Error('a live segment must snapshot');
    expect(snap.replay.ticks).toBe(100);
    expect(snap.replay.finalHash).toBe(hashWorld(world));
    expect(snap.replay.hashes.length).toBe(0); // below the 600-tick interval
    // Non-destructive: the recorder still holds its header and keeps recording.
    expect(recorder.header).not.toBeNull();
    const input = createInputSnapshot();
    for (let t = 0; t < 40; t++) {
      commitPlayerInput(input.players[0], Action.Up);
      recorder.record(input);
      stepWorld(world, input);
      recorder.check(world);
    }
    const finished = recorder.finish(world, 0);
    if (finished === null) throw new Error('the recording must finish');
    expect(finished.replay.ticks).toBe(140);
    expect(snap.replay.ticks).toBe(100); // the copy did not grow
  });

  it('carries hashed intervals into the copy', () => {
    const { world, recorder } = live(650);
    const snap = recorder.snapshot(world);
    if (snap === null) throw new Error('unreachable');
    expect(snap.replay.ticks).toBe(650);
    expect(snap.replay.hashes.length).toBe(1); // floor(650 / 600)
    expect(snap.replay.hashInterval).toBe(600);
  });

  it('is null before the header and after the seal', () => {
    const fresh = new SegmentRecorder();
    const config = resolveGameConfig({ seed: 5 });
    const world = createWorld(config, EMPTY_CONTENT_DB);
    expect(fresh.snapshot(world)).toBeNull();
    const { world: w, recorder } = live(10);
    expect(recorder.snapshot(w)).not.toBeNull();
    expect(recorder.finish(w, 0)).not.toBeNull();
    expect(recorder.snapshot(w)).toBeNull(); // sealed: the copy is the finished segment itself
  });
});

describe('runSegmentToJson / runSegmentFromJson (R2 TL-1)', () => {
  it('round-trips a snapshot byte-faithfully', () => {
    const { world, recorder } = live(700);
    const snap = recorder.snapshot(world);
    if (snap === null) throw new Error('unreachable');
    const json = runSegmentToJson(snap);
    const back = runSegmentFromJson(JSON.parse(JSON.stringify(json)) as unknown);
    expect(back.replay.ticks).toBe(snap.replay.ticks);
    expect(back.replay.finalHash).toBe(snap.replay.finalHash);
    expect(Array.from(back.replay.hashes)).toEqual(Array.from(snap.replay.hashes));
    for (let p = 0; p < snap.replay.inputs.length; p++) {
      expect(Array.from(back.replay.inputs[p])).toEqual(Array.from(snap.replay.inputs[p]));
    }
    expect(back.replay.header.buildId).toBe('test');
    expect(back.replay.header.config).toEqual(snap.replay.header.config);
    expect(back.actions.length).toBe(0);
    expect(back.start).toEqual(snap.start);
  });

  it('rejects malformed documents with a RangeError', () => {
    expect(() => runSegmentFromJson(42)).toThrow(RangeError);
    expect(() => runSegmentFromJson([])).toThrow(RangeError);
    const good = runSegmentToJson(
      live(10).recorder.snapshot(live(10).world) ??
        (() => {
          throw new Error('unreachable');
        })(),
    );
    expect(() => runSegmentFromJson({ ...good, actions: 'nope' })).toThrow(RangeError);
    expect(() => runSegmentFromJson({ ...good, actions: [-1] })).toThrow(RangeError);
    expect(() => runSegmentFromJson({ ...good, actions: [1.5] })).toThrow(RangeError);
    expect(() => runSegmentFromJson({ ...good, start: 'x' })).toThrow(RangeError);
  });

  it('refuses a v1 or foreign-frame segment with ReplayVersionError', () => {
    const world = live(10).world;
    const good = runSegmentToJson(live(10).recorder.snapshot(world) as never);
    const old = JSON.parse(JSON.stringify(good)) as { replay: { header: Record<string, unknown> } };
    old.replay.header.formatVersion = 1;
    expect(() => runSegmentFromJson(old as unknown)).toThrow(ReplayVersionError);
    const frame = JSON.parse(JSON.stringify(good)) as {
      replay: { header: { config: Record<string, unknown> } };
    };
    frame.replay.header.config.internalWidth = 320;
    expect(() => runSegmentFromJson(frame as unknown)).toThrow(ReplayVersionError);
  });
});
