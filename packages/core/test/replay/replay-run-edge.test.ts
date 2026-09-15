/**
 * Edge cases of plan M3-01's whole-run replays (`core/replay` `./run.ts`), beyond
 * `replay-run.test.ts`: the {@link SegmentRecorder} while idle, with two players, at its action
 * limit, with a missed periodic hash and when reused; every branch of the run replay decoder and
 * the text round trip; the storage keys; and the {@link createReplayLibrary} library's slot bounds,
 * memory-only use, failing storage, the kept replays' shared budget at its exact limits and what
 * `load()` makes of odd stored values.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import {
  Action,
  MAX_PLAYERS,
  commitPlayerInput,
  createInputSnapshot,
  type InputSnapshot,
} from '../../src/input/index.js';
import { createMemoryStorage, type PlatformStorage } from '../../src/platform/index.js';
import {
  AssistFlag,
  KEPT_REPLAY_SLOTS,
  MAX_KEPT_REPLAY_TEXT,
  MAX_REPLAY_TEXT,
  MAX_RUN_SEGMENTS,
  MAX_SEGMENT_ACTIONS,
  REPLAY_HASH_INTERVAL,
  REPLAY_SLOTS,
  RUN_REPLAY_FORMAT_VERSION,
  RUN_REPLAY_KIND,
  ReplayStoreResult,
  RunAction,
  SEGMENT_CAPACITY,
  SegmentRecorder,
  createReplayHeader,
  createReplayLibrary,
  decodeRunReplay,
  encodeRunReplay,
  parseRunReplayText,
  replayStorageKey,
  runAssisted,
  runReplayText,
  type RunReplay,
  type RunReplayJson,
  type RunSegment,
} from '../../src/replay/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';

/**
 * Records a free-flight World: player 1 weaves, player 2 holds Shot.
 *
 * @param ticks - Ticks to record.
 * @param recorder - The recorder (default: a fresh one).
 * @returns The World and the segment.
 */
function record(
  ticks: number,
  recorder = new SegmentRecorder(),
): { world: World; segment: RunSegment | null } {
  const config = resolveGameConfig({ seed: 8 });
  const world = createWorld(config, EMPTY_CONTENT_DB);
  const input = createInputSnapshot();
  recorder.begin(createReplayHeader(config, { buildId: 'edge' }), null);
  for (let t = 0; t < ticks; t++) {
    commitPlayerInput(input.players[0], (t >> 3) & 1 ? Action.Left : Action.Right);
    commitPlayerInput(input.players[1], Action.Shot);
    recorder.record(input);
    stepWorld(world, input);
    recorder.check(world);
  }
  return { world, segment: recorder.finish(world, 0) };
}

/**
 * A run replay of segments.
 *
 * @param segments - The segments.
 * @param fields - Other fields.
 * @returns The run.
 */
function runOf(segments: readonly RunSegment[], fields: Partial<RunReplay> = {}): RunReplay {
  let ticks = 0;
  for (const segment of segments) ticks += segment.replay.ticks;
  return {
    formatVersion: RUN_REPLAY_FORMAT_VERSION,
    buildId: 'edge',
    mode: '1p',
    label: 'KESTREL EASY',
    score: 500,
    reached: 'B',
    assists: 0,
    ticks,
    segments,
    ...fields,
  };
}

/** A small valid segment (30 ticks). */
const SEGMENT = record(30).segment!;

/** Its run's encoded document (a fresh copy per call). */
function goodDoc(): RunReplayJson & Record<string, unknown> {
  return JSON.parse(JSON.stringify(encodeRunReplay(runOf([SEGMENT])))) as RunReplayJson &
    Record<string, unknown>;
}

/**
 * A valid run whose text is exactly a length (its segment's start state padded).
 *
 * @param length - The text's length.
 * @param label - The run's label (to tell texts apart).
 * @returns The text.
 */
function textOfLength(length: number, label = 'KESTREL EASY'): string {
  const bare = runReplayText(runOf([{ ...SEGMENT, start: { pad: '' } }], { label }));
  const text = runReplayText(
    runOf([{ ...SEGMENT, start: { pad: 'x'.repeat(length - bare.length) } }], { label }),
  );
  expect(text).toHaveLength(length);
  return text;
}

/**
 * Lets the library's fire-and-forget writes land.
 *
 * @returns Resolves after a few microtask turns.
 */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

describe('core/replay SegmentRecorder edges (M3-01)', () => {
  it('ignores everything while idle and after a reset', () => {
    const recorder = new SegmentRecorder(50);
    const world = createWorld(resolveGameConfig({ seed: 1 }), EMPTY_CONTENT_DB);
    const input = createInputSnapshot();
    recorder.record(input);
    recorder.check(world);
    recorder.action(RunAction.Continue, 1);
    recorder.seal(world);
    expect([recorder.active, recorder.ticks, recorder.actionCount, recorder.sealed]).toEqual([
      false,
      0,
      0,
      false,
    ]);
    expect(recorder.finish(world, 0)).toBeNull();
    // A reset drops a segment in progress: nothing to finish.
    recorder.begin(createReplayHeader(world.config), { a: 1 });
    recorder.record(input);
    recorder.reset();
    expect([recorder.active, recorder.ticks, recorder.start]).toEqual([false, 0, null]);
    expect(recorder.finish(world, 0)).toBeNull();
  });

  it('records both players, and an absent player as no input', () => {
    const { segment } = record(20);
    const inputs = segment!.replay.inputs;
    expect(inputs).toHaveLength(MAX_PLAYERS);
    expect(inputs[1][0] & 0xffff).toBe(Action.Shot);
    expect(inputs[1][5] & 0xffff).toBe(Action.Shot);
    expect(inputs[1][5] >>> 16).toBe(0); // held, not newly pressed
    // A snapshot with only player 1 (a host's shorter list) records 0 for player 2.
    const recorder = new SegmentRecorder(10);
    const config = resolveGameConfig({ seed: 1 });
    const world = createWorld(config, EMPTY_CONTENT_DB);
    const full = createInputSnapshot();
    commitPlayerInput(full.players[0], Action.Up);
    const short = { players: [full.players[0]] } as unknown as InputSnapshot;
    recorder.begin(createReplayHeader(config), null);
    recorder.record(short);
    stepWorld(world, full);
    const out = recorder.finish(world, 0)!;
    expect(out.replay.inputs[0][0] & 0xffff).toBe(Action.Up);
    expect(out.replay.inputs[1][0]).toBe(0);
  });

  it('packs an action`s parameter above its code and overflows past MAX_SEGMENT_ACTIONS', () => {
    const config = resolveGameConfig({ seed: 1 });
    const world = createWorld(config, EMPTY_CONTENT_DB);
    const input = createInputSnapshot();
    const recorder = new SegmentRecorder(100);
    recorder.begin(createReplayHeader(config), null);
    recorder.action(RunAction.SelfDestruct, 1); // before the first tick: tick count 0
    recorder.record(input);
    stepWorld(world, input);
    recorder.action(RunAction.Continue, 0xffffff);
    const segment = recorder.finish(world, 0)!;
    expect(Array.from(segment.actions)).toEqual([
      0,
      RunAction.SelfDestruct | (1 << 8),
      1,
      (RunAction.Continue | (0xffffff << 8)) >>> 0,
    ]);
    expect(segment.actions[3] & 0xff).toBe(RunAction.Continue);
    expect(segment.actions[3] >>> 8).toBe(0xffffff);
    // One action too many: the segment cannot be kept.
    recorder.begin(createReplayHeader(config), null);
    for (let i = 0; i < MAX_SEGMENT_ACTIONS; i++) recorder.action(RunAction.FullPower, 0);
    expect([recorder.actionCount, recorder.overflow]).toEqual([MAX_SEGMENT_ACTIONS, false]);
    recorder.action(RunAction.FullPower, 0);
    expect(recorder.overflow).toBe(true);
    expect(recorder.finish(world, 0)).toBeNull();
    expect(recorder.active).toBe(false);
  });

  it('refuses a segment whose periodic hash was missed', () => {
    const config = resolveGameConfig({ seed: 1 });
    const world = createWorld(config, EMPTY_CONTENT_DB);
    const input = createInputSnapshot();
    const recorder = new SegmentRecorder(REPLAY_HASH_INTERVAL * 2);
    recorder.begin(createReplayHeader(config), null);
    for (let t = 0; t < REPLAY_HASH_INTERVAL + 5; t++) {
      recorder.record(input);
      stepWorld(world, input);
      // No check() on the interval tick.
    }
    expect(recorder.finish(world, 0)).toBeNull();
    // Exactly one interval, checked: one hash, the final one taken at the finish.
    const { world: w, segment } = record(REPLAY_HASH_INTERVAL);
    expect(segment!.replay.hashes).toHaveLength(1);
    expect(segment!.replay.finalHash).toBe(hashWorld(w));
  });

  it('keeps the first seal, copies its buffers out and starts clean when reused', () => {
    const recorder = new SegmentRecorder(200);
    const a = record(40, recorder);
    const first = a.segment!;
    // Reused for a second World: its own ticks, no leftovers.
    const b = record(12, recorder);
    expect(b.segment!.replay.ticks).toBe(12);
    expect(first.replay.ticks).toBe(40);
    expect(first.replay.inputs[0]).toHaveLength(40);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.replay.header)).toBe(true);
    // The seal keeps the hash of the moment it was taken.
    const config = resolveGameConfig({ seed: 1 });
    const world = createWorld(config, EMPTY_CONTENT_DB);
    const input = createInputSnapshot();
    recorder.begin(createReplayHeader(config), null);
    recorder.record(input);
    stepWorld(world, input);
    recorder.seal(world);
    const sealed = recorder.finalHash;
    stepWorld(world, input);
    recorder.seal(world);
    expect(recorder.finalHash).toBe(sealed);
    const header = createReplayHeader(config);
    recorder.begin(header, null);
    const segment = recorder.finish(world, AssistFlag.Secret | AssistFlag.Speed)!;
    expect(segment.replay.ticks).toBe(0);
    expect(segment.replay.header.assists).toBe(AssistFlag.Secret | AssistFlag.Speed);
    expect(header.assists).toBe(0); // the header given to begin() is not changed
    expect(SEGMENT_CAPACITY).toBe(20 * 60 * 60);
  });
});

describe('core/replay run replay decoder edges (M3-01)', () => {
  it('refuses every malformed field', () => {
    const doc = goodDoc();
    const seg = doc.segments[0] as unknown as Record<string, unknown>;
    const withSegment = (fields: Record<string, unknown>): unknown => ({
      ...doc,
      segments: [{ ...seg, ...fields }],
    });
    const bad: Array<[string, unknown]> = [
      ['array', []],
      ['string', 'run-replay'],
      ['no kind', { ...doc, kind: undefined }],
      ['version string', { ...doc, formatVersion: '1' }],
      ['score fraction', { ...doc, score: 1.5 }],
      ['score string', { ...doc, score: '5' }],
      ['assists negative', { ...doc, assists: -1 }],
      ['assists fraction', { ...doc, assists: 1.5 }],
      ['segments object', { ...doc, segments: {} }],
      ['too many segments', { ...doc, segments: new Array(MAX_RUN_SEGMENTS + 1).fill(seg) }],
      ['segment array', { ...doc, segments: [[]] }],
      ['segment null', { ...doc, segments: [null] }],
      ['segment replay', withSegment({ replay: { ...(seg.replay as object), ticks: -1 } })],
      ['segment no replay', withSegment({ replay: undefined })],
      ['start array', withSegment({ start: [] })],
      ['start number', withSegment({ start: 3 })],
      ['actions missing', withSegment({ actions: undefined })],
      [
        'actions too many',
        withSegment({ actions: new Array(MAX_SEGMENT_ACTIONS * 2 + 2).fill(0) }),
      ],
      ['action negative', withSegment({ actions: [1, -1] })],
      ['action fraction', withSegment({ actions: [1.5, 1] })],
      ['action string', withSegment({ actions: ['1', 1] })],
      ['buildId number', { ...doc, buildId: 5 }],
      ['mode long', { ...doc, mode: 'm'.repeat(65) }],
      ['reached missing', { ...doc, reached: undefined }],
      ['label null', { ...doc, label: null }],
    ];
    for (const [name, value] of bad) expect(() => decodeRunReplay(value), name).toThrow(RangeError);
  });

  it('accepts the limits: 64-character texts, flag 255, an action on the last tick, many segments', () => {
    const doc = goodDoc();
    const seg = doc.segments[0];
    const ticks = SEGMENT.replay.ticks;
    const run = decodeRunReplay({
      ...doc,
      label: 'L'.repeat(64),
      mode: '',
      assists: 0xff,
      segments: [{ ...seg, start: null, actions: [0, 1, ticks, 2, ticks, 3] }],
    });
    expect(run.label).toHaveLength(64);
    expect(runAssisted(run.assists)).toBe(true);
    expect(Array.from(run.segments[0].actions)).toEqual([0, 1, ticks, 2, ticks, 3]);
    expect(run.segments[0].start).toBeNull();
    // The run's ticks are the segments' (no field of its own in the document).
    const many = decodeRunReplay({ ...doc, segments: new Array(MAX_RUN_SEGMENTS).fill(seg) });
    expect(many.segments).toHaveLength(MAX_RUN_SEGMENTS);
    expect(many.ticks).toBe(MAX_RUN_SEGMENTS * ticks);
    expect(Object.isFrozen(many)).toBe(true);
    expect(Object.isFrozen(many.segments)).toBe(true);
  });

  it('writes the same text it reads, and parses nothing but a run replay', () => {
    const run = runOf([SEGMENT, record(REPLAY_HASH_INTERVAL + 3).segment!], {
      assists: AssistFlag.Invincible,
    });
    const text = runReplayText(run);
    expect(text).not.toContain('\n');
    const back = parseRunReplayText(text)!;
    expect(runReplayText(back)).toBe(text);
    expect(encodeRunReplay(back).kind).toBe(RUN_REPLAY_KIND);
    expect(Array.isArray(encodeRunReplay(back).segments[0].actions)).toBe(true);
    for (const junk of ['', 'null', '[]', '42', '"run-replay"', '{"kind":"replay"}']) {
      expect(parseRunReplayText(junk), junk).toBeNull();
    }
  });

  it('names one storage key per slot', () => {
    const keys: string[] = [];
    for (let slot = 0; slot < REPLAY_SLOTS; slot++) keys.push(replayStorageKey(slot));
    expect(keys).toEqual(['replay.last', 'replay.1', 'replay.2', 'replay.3']);
    expect(KEPT_REPLAY_SLOTS).toBe(3);
  });
});

describe('core/replay ReplayLibrary edges (M3-01)', () => {
  it('works in memory only, with a stable summary list and a revision per change', async () => {
    const library = createReplayLibrary(null);
    expect(library.storage).toBeNull();
    await library.load();
    const summaries = library.summaries;
    expect(summaries).toHaveLength(REPLAY_SLOTS);
    const r0 = library.revision;
    expect(library.storeLast(runOf([SEGMENT], { assists: 0 }))).toBe(ReplayStoreResult.Ok);
    expect(library.revision).toBe(r0 + 1);
    expect(library.summaries).toBe(summaries);
    expect(summaries[0]).toEqual({
      slot: 0,
      mode: '1p',
      label: 'KESTREL EASY',
      score: 500,
      reached: 'B',
      assisted: false,
      ticks: SEGMENT.replay.ticks,
    });
    // The last game is replaced by the next one.
    library.storeLast(runOf([SEGMENT], { score: 900, label: 'MANTA HARD' }));
    expect(summaries[0]).toMatchObject({ score: 900, label: 'MANTA HARD' });
    // A kept replay can be kept again (into the next free slot).
    expect(library.keep(0)).toBe(1);
    expect(library.keep(1)).toBe(2);
    expect(library.summaries[2]).toMatchObject({ slot: 2, score: 900 });
    expect(library.exportText(2)).toBe(library.exportText(0));
  });

  it('treats slots out of range as empty and never changes them', () => {
    const library = createReplayLibrary(null);
    library.storeLast(runOf([SEGMENT]));
    const revision = library.revision;
    for (const slot of [-1, REPLAY_SLOTS, 1.5, Number.NaN]) {
      expect(library.replay(slot), String(slot)).toBeNull();
      expect(library.exportText(slot)).toBeNull();
      expect(library.keep(slot)).toBe(-1);
      library.remove(slot);
    }
    // Removing an empty slot changes nothing either.
    library.remove(2);
    expect(library.revision).toBe(revision);
    library.remove(0);
    expect(library.revision).toBe(revision + 1);
    expect(library.summaries[0]).toBeNull();
    expect(library.keep(0)).toBe(-1);
  });

  it('survives a storage that throws synchronously', async () => {
    const throwing: PlatformStorage = {
      get: () => {
        throw new Error('no storage');
      },
      set: () => {
        throw new Error('no storage');
      },
    };
    const library = createReplayLibrary(throwing);
    await library.load();
    expect(library.summaries.every((s) => s === null)).toBe(true);
    expect(library.storeLast(runOf([SEGMENT]))).toBe(ReplayStoreResult.Ok);
    expect(library.keep(0)).toBe(1);
    library.remove(1);
    expect(library.summaries[1]).toBeNull();
    expect(library.summaries[0]).not.toBeNull();
  });

  it('reads odd stored values as empty slots, and kept slots up to the exact shared budget', async () => {
    const valid = runReplayText(runOf([SEGMENT]));
    const odd: PlatformStorage = {
      get: (key) =>
        Promise.resolve(
          (
            {
              [replayStorageKey(0)]: 42,
              [replayStorageKey(1)]: '',
              [replayStorageKey(2)]: '{"kind":"run-replay","formatVersion":2}',
              [replayStorageKey(3)]: valid,
            } as Record<string, unknown>
          )[key] as string | null,
        ),
      set: () => Promise.resolve(),
    };
    const reader = createReplayLibrary(odd);
    await reader.load();
    expect(reader.summaries.map((s) => (s === null ? null : s.slot))).toEqual([
      null,
      null,
      null,
      3,
    ]);
    // Kept slots totalling exactly MAX_KEPT_REPLAY_TEXT all load; an invalid one takes no room.
    const a = textOfLength(60_000, 'A');
    const b = textOfLength(MAX_KEPT_REPLAY_TEXT - 60_000, 'B');
    const storage = createMemoryStorage({
      [replayStorageKey(1)]: a,
      [replayStorageKey(2)]: 'garbage'.repeat(20_000),
      [replayStorageKey(3)]: b,
    });
    const library = createReplayLibrary(storage);
    await library.load();
    await settle();
    expect(library.summaries.map((s) => (s === null ? null : s.label))).toEqual([
      null,
      'A',
      null,
      'B',
    ]);
    expect(await storage.get(replayStorageKey(3))).toBe(b);
  });

  it('imports and keeps up to the exact shared budget, counting the trimmed text', async () => {
    const storage = createMemoryStorage();
    const library = createReplayLibrary(storage);
    const longest = textOfLength(MAX_REPLAY_TEXT, 'LONGEST');
    // The surrounding blanks of a paste do not count.
    expect(library.importText('\n\t ' + longest + ' \n')).toBe(ReplayStoreResult.Ok);
    expect(library.summaries[1]?.label).toBe('LONGEST');
    const rest = MAX_KEPT_REPLAY_TEXT - MAX_REPLAY_TEXT;
    expect(library.importText(textOfLength(rest + 1, 'OVER'))).toBe(ReplayStoreResult.Full);
    expect(library.importText(textOfLength(rest, 'EXACT'))).toBe(ReplayStoreResult.Ok);
    expect(library.summaries[2]?.label).toBe('EXACT');
    // One slot is free but the budget is spent: even the smallest replay is refused.
    expect(library.summaries[3]).toBeNull();
    expect(library.importText(runReplayText(runOf([SEGMENT])))).toBe(ReplayStoreResult.Full);
    library.storeLast(runOf([SEGMENT]));
    expect(library.keep(0)).toBe(-1);
    // Invalid is reported before Full; TooLong before either.
    expect(library.importText('{"kind":"run-replay"}')).toBe(ReplayStoreResult.Invalid);
    expect(library.importText(' '.repeat(5) + 'x'.repeat(MAX_REPLAY_TEXT + 1))).toBe(
      ReplayStoreResult.TooLong,
    );
    expect(library.importText('   ')).toBe(ReplayStoreResult.Invalid);
    await settle();
    expect(await storage.get(replayStorageKey(1))).toBe(longest);
  });
});
