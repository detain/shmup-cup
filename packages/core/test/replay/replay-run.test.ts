/**
 * Tests for the whole-run replays of plan M3-01 (`core/replay` `./run.ts`): the segment recorder
 * (input, periodic hashes, actions, the seal, the overflow), the run replay's JSON round trip and
 * the decoder's validation, the replay library over a storage (the last game, KEEP, the shared
 * text's import, DELETE, the size cap, reading back) and the assisted flags in replay headers.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { createMemoryStorage } from '../../src/platform/index.js';
import {
  AssistFlag,
  KEPT_REPLAY_SLOTS,
  MAX_REPLAY_TEXT,
  REPLAY_HASH_INTERVAL,
  REPLAY_SLOTS,
  RUN_REPLAY_FORMAT_VERSION,
  RUN_REPLAY_KIND,
  ReplayStoreResult,
  RunAction,
  SegmentRecorder,
  createReplayHeader,
  createReplayLibrary,
  decodeReplay,
  decodeRunReplay,
  encodeReplay,
  encodeRunReplay,
  parseRunReplayText,
  replayStorageKey,
  runAssisted,
  runReplayText,
  type RunReplay,
  type RunSegment,
} from '../../src/replay/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * Records one free-flight World with a weaving input.
 *
 * @param ticks - Ticks to record.
 * @param recorder - The recorder (default: a fresh one).
 * @returns The World and the segment.
 */
function recordSegment(
  ticks: number,
  recorder = new SegmentRecorder(),
): { world: World; segment: RunSegment | null } {
  const config = resolveGameConfig({ seed: 5 });
  const world = createWorld(config, EMPTY_CONTENT_DB);
  const input = createInputSnapshot();
  recorder.begin(createReplayHeader(config, { buildId: 'test' }), { hiScore: 0 });
  for (let t = 0; t < ticks; t++) {
    commitPlayerInput(input.players[0], (t >> 5) & 1 ? Action.Up : Action.Down);
    recorder.record(input);
    stepWorld(world, input);
    recorder.check(world);
  }
  return { world, segment: recorder.finish(world, AssistFlag.Speed) };
}

/**
 * A run replay of one or two recorded segments.
 *
 * @param segments - The segments.
 * @param assists - The run's assists.
 * @returns The replay.
 */
function runOf(segments: readonly RunSegment[], assists = 0): RunReplay {
  let ticks = 0;
  for (const segment of segments) ticks += segment.replay.ticks;
  return {
    formatVersion: RUN_REPLAY_FORMAT_VERSION,
    buildId: 'test',
    mode: '1p',
    label: 'KESTREL NORMAL',
    score: 1230,
    reached: 'A',
    assists,
    ticks,
    segments,
  };
}

describe('core/replay SegmentRecorder (M3-01)', () => {
  it('records the input of every tick, a hash every interval and the final hash', () => {
    const ticks = REPLAY_HASH_INTERVAL * 2 + 17;
    const { world, segment } = recordSegment(ticks);
    expect(segment).not.toBeNull();
    const replay = segment!.replay;
    expect(replay.ticks).toBe(ticks);
    expect(replay.hashes).toHaveLength(2);
    expect(replay.finalHash).toBe(hashWorld(world));
    expect(replay.header.assists).toBe(AssistFlag.Speed);
    expect(segment!.start).toEqual({ hiScore: 0 });
    expect(Array.from(segment!.actions)).toEqual([]);
    // The recorded words: Down for 32 ticks, then Up (pressed on the first tick of each).
    expect(replay.inputs[0][0] & 0xffff).toBe(Action.Down);
    expect(replay.inputs[0][32] & 0xffff).toBe(Action.Up);
    expect(replay.inputs[0][32] >>> 16).toBe(Action.Up);
  });

  it('notes actions at the tick count, stops at the seal and goes idle when finished', () => {
    const config = resolveGameConfig({ seed: 5 });
    const world = createWorld(config, EMPTY_CONTENT_DB);
    const input = createInputSnapshot();
    const recorder = new SegmentRecorder();
    expect(recorder.active).toBe(false);
    expect(recorder.finish(world, 0)).toBeNull();
    recorder.begin(createReplayHeader(config), null);
    expect(recorder.active).toBe(true);
    for (let t = 0; t < 10; t++) {
      recorder.record(input);
      stepWorld(world, input);
      recorder.check(world);
    }
    recorder.action(RunAction.Continue, 3);
    recorder.seal(world);
    const sealed = hashWorld(world);
    // After the seal nothing counts: the ticks, the action.
    recorder.record(input);
    stepWorld(world, input);
    recorder.action(RunAction.FullPower, 0);
    const segment = recorder.finish(world, 0);
    expect(recorder.active).toBe(false);
    expect(segment?.replay.ticks).toBe(10);
    expect(segment?.replay.finalHash).toBe(sealed);
    expect(Array.from(segment!.actions)).toEqual([10, RunAction.Continue | (3 << 8)]);
  });

  it('overflows past its capacity: the segment cannot be kept', () => {
    const recorder = new SegmentRecorder(100);
    const { segment } = recordSegment(150, recorder);
    expect(segment).toBeNull();
  });
});

describe('core/replay run replay format (M3-01)', () => {
  it('round-trips through its JSON and text', () => {
    const a = recordSegment(700).segment!;
    const b = recordSegment(30).segment!;
    const run = runOf([a, b], AssistFlag.Invincible);
    const json = encodeRunReplay(run);
    expect(json.kind).toBe(RUN_REPLAY_KIND);
    expect(json.segments).toHaveLength(2);
    const back = decodeRunReplay(JSON.parse(JSON.stringify(json)) as unknown);
    expect(back.ticks).toBe(730);
    expect(back.assists).toBe(AssistFlag.Invincible);
    expect(back.segments[0].replay.hashes).toEqual(a.replay.hashes);
    expect(back.segments[0].replay.inputs[0]).toEqual(a.replay.inputs[0]);
    expect(back.segments[1].replay.finalHash).toBe(b.replay.finalHash);
    expect(parseRunReplayText(runReplayText(run))?.label).toBe('KESTREL NORMAL');
  });

  it('refuses anything that is not a valid run replay', () => {
    const good = encodeRunReplay(runOf([recordSegment(20).segment!]));
    const bad: unknown[] = [
      null,
      { ...good, kind: 'replay' },
      { ...good, formatVersion: 99 },
      { ...good, segments: [] },
      { ...good, score: -1 },
      { ...good, assists: 256 },
      { ...good, label: 'x'.repeat(65) },
      { ...good, segments: [{ ...good.segments[0], start: 'no' }] },
      { ...good, segments: [{ ...good.segments[0], actions: [5] }] },
      { ...good, segments: [{ ...good.segments[0], actions: [21, 1] }] },
      { ...good, segments: [{ ...good.segments[0], actions: [5, 1, 4, 1] }] },
    ];
    for (const doc of bad)
      expect(() => decodeRunReplay(doc), JSON.stringify(doc)).toThrow(RangeError);
    expect(parseRunReplayText('not json')).toBeNull();
    expect(parseRunReplayText('{"kind":"run-replay"}')).toBeNull();
  });
});

describe('core/replay assisted flags in headers (M3-01)', () => {
  it('flags god mode and the invincibility assist, and reads replays from before M3-01', () => {
    const plain = resolveGameConfig({ seed: 1 });
    expect(createReplayHeader(plain).assists).toBe(0);
    expect(createReplayHeader(plain, { assisted: true }).assists).toBe(AssistFlag.GodMode);
    const invincible = resolveGameConfig({ seed: 1, invincible: true });
    expect(createReplayHeader(invincible).assists).toBe(AssistFlag.Invincible);
    expect(createReplayHeader(plain, { assists: AssistFlag.Speed }).assists).toBe(AssistFlag.Speed);
    expect(() => createReplayHeader(plain, { assists: 300 })).toThrow(RangeError);
    const replay = recordSegment(10).segment!.replay;
    const doc = encodeReplay(replay) as unknown as { header: Record<string, unknown> };
    expect(doc.header.assists).toBe(AssistFlag.Speed);
    // A replay recorded before M3-01 has no `assists`: god mode when `assisted`.
    const old = JSON.parse(JSON.stringify(doc)) as { header: Record<string, unknown> };
    delete old.header.assists;
    old.header.assisted = true;
    expect(decodeReplay(old).header.assists).toBe(AssistFlag.GodMode);
    old.header.assists = 'x';
    expect(() => decodeReplay(old)).toThrow(RangeError);
    expect(runAssisted(0)).toBe(false);
    for (const flag of Object.values(AssistFlag)) expect(runAssisted(flag)).toBe(true);
  });
});

describe('core/replay ReplayLibrary (M3-01)', () => {
  it('keeps the last game and up to three kept replays, in storage', async () => {
    const storage = createMemoryStorage();
    const library = createReplayLibrary(storage);
    await library.load();
    expect(library.summaries).toEqual([null, null, null, null]);
    expect(REPLAY_SLOTS).toBe(1 + KEPT_REPLAY_SLOTS);
    const run = runOf([recordSegment(40).segment!], AssistFlag.Secret);
    expect(library.storeLast(run)).toBe(ReplayStoreResult.Ok);
    expect(library.summaries[0]).toMatchObject({
      slot: 0,
      mode: '1p',
      label: 'KESTREL NORMAL',
      score: 1230,
      reached: 'A',
      assisted: true,
      ticks: 40,
    });
    const before = library.revision;
    expect(library.keep(0)).toBe(1);
    expect(library.revision).toBeGreaterThan(before);
    expect(library.keep(3)).toBe(-1); // an empty slot
    // Sharing is the text; importing it fills the next free slot.
    const text = library.exportText(0);
    expect(text).not.toBeNull();
    expect(library.importText('  ' + text! + '\n')).toBe(ReplayStoreResult.Ok);
    expect(library.importText('{"kind":"run-replay"}')).toBe(ReplayStoreResult.Invalid);
    expect(library.importText(text!)).toBe(ReplayStoreResult.Ok);
    expect(library.importText(text!)).toBe(ReplayStoreResult.Full);
    expect(library.importText('x'.repeat(MAX_REPLAY_TEXT + 1))).toBe(ReplayStoreResult.TooLong);
    expect(library.replay(2)?.segments[0].replay.ticks).toBe(40);
    library.remove(2);
    expect(library.summaries[2]).toBeNull();
    expect(library.replay(2)).toBeNull();
    // Written under one key per slot (an emptied slot as an empty text); read back by a new one.
    await Promise.resolve();
    expect(await storage.get(replayStorageKey(0))).toBe(text);
    expect(await storage.get(replayStorageKey(2))).toBe('');
    const again = createReplayLibrary(storage);
    await again.load();
    expect(again.summaries.map((s) => (s === null ? null : s.slot))).toEqual([0, 1, null, 3]);
  });

  it('never throws on bad storage and refuses a run too long to keep', async () => {
    const broken = {
      get: () => Promise.reject(new Error('gone')),
      set: () => Promise.reject(new Error('full')),
    };
    const library = createReplayLibrary(broken);
    await library.load();
    expect(library.summaries.every((s) => s === null)).toBe(true);
    expect(library.storeLast(runOf([recordSegment(5).segment!]))).toBe(ReplayStoreResult.Ok);
    await Promise.resolve();
    const garbage = createMemoryStorage({ [replayStorageKey(1)]: 'garbage' });
    const reader = createReplayLibrary(garbage);
    await reader.load();
    expect(reader.summaries[1]).toBeNull();
    const memory = createReplayLibrary(null);
    await memory.load();
    // A run whose text is over the cap is not stored (the last game stays as it was).
    const run = runOf([recordSegment(5).segment!]);
    expect(memory.storeLast({ ...run, buildId: 'x'.repeat(MAX_REPLAY_TEXT) })).toBe(
      ReplayStoreResult.TooLong,
    );
    expect(memory.summaries[0]).toBeNull();
    expect(memory.storeLast(run)).toBe(ReplayStoreResult.Ok);
    expect(memory.summaries[0]?.score).toBe(1230);
  });
});
