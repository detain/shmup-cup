/**
 * R2 (v20x-TL TL-1): the checkpoint record's text — `buildCheckpointText` / `classifyCheckpointText`
 * round trips (R1-only and with a tail), the tail-drop fallback over the size cap, the staleness
 * verdicts (format, replay format, build id) that reuse the `ReplayVersionError` pattern, malformed
 * records never throwing, and the `RunCheckpointStore` over a memory storage (load, write-order
 * chain, self-clearing stale keys).
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { createMemoryStorage } from '../../src/platform/index.js';
import {
  CHECKPOINT_FORMAT_VERSION,
  CHECKPOINT_MAX_CHARS,
  RUN_CHECKPOINT_KIND,
  RUN_CHECKPOINT_STORAGE_KEY,
  RunCheckpointStore,
  buildCheckpointText,
  classifyCheckpointText,
} from '../../src/replay/checkpoint.js';
import { REPLAY_FORMAT_VERSION, createReplayHeader } from '../../src/replay/format.js';
import { SegmentRecorder } from '../../src/replay/run.js';
import { createWorld, stepWorld } from '../../src/world/index.js';

/** A minimal valid run-state block for a campaign record on zone `t-s`. */
const RUN = {
  campaignId: 'test',
  zone: 0,
  stage: 't-s',
  depth: 0,
  route: [0],
  checkpoint: -1,
  mode: 'normal',
  loop: 1,
  timeLimit: 0,
  flags: 0,
  deaths: 1,
  continues: 0,
  continuesAtStart: 0,
  assists: 0,
  inBonus: false,
  bonusStage: null,
  bonusReturnX: -1,
  bonusLocked: false,
  inEscape: false,
  escapeStage: null,
} as const;

/** The carry JSON (the start kit's shape: only its objectness is checked here). */
const CARRY = { stageTerm: 1, checkpoint: -1, locked: false, hiScore: 120 };

/**
 * A full input record.
 *
 * @param tailTicks - Record a live tail of this many ticks (0: checkpoint only).
 * @returns The input (and its tail recorder, for reuse in tail tests).
 */
function input(tailTicks: number): Parameters<typeof buildCheckpointText>[0] {
  const config = resolveGameConfig({ seed: 5 });
  let tailSegment = null;
  if (tailTicks > 0) {
    const world = createWorld(config, EMPTY_CONTENT_DB);
    const segment = new SegmentRecorder();
    segment.begin(createReplayHeader(config, { buildId: 'test' }), { hiScore: 120 });
    const inputSnapshot = createInputSnapshot();
    for (let t = 0; t < tailTicks; t++) {
      commitPlayerInput(inputSnapshot.players[0], t < tailTicks / 2 ? Action.Up : Action.Down);
      segment.record(inputSnapshot);
      stepWorld(world, inputSnapshot);
      segment.check(world);
    }
    tailSegment = segment.snapshot(world);
    if (tailSegment === null) throw new Error('snapshot of a live segment must exist');
  }
  return {
    buildId: 'test',
    config: { ...config },
    savedTick: tailTicks > 0 ? tailTicks : -1,
    checkpointPassed: tailTicks > 0 ? 1 : -1,
    pendingStart: tailTicks === 0,
    run: { ...RUN },
    carry: { ...CARRY },
    tailSegment,
  };
}

/**
 * Parsed JSON of a text.
 *
 * @param text - The checkpoint text.
 * @returns The object.
 */
function raw(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

describe('buildCheckpointText / classifyCheckpointText (R2 TL-1)', () => {
  it('round-trips a checkpoint-only (R1) record', () => {
    const text = buildCheckpointText(input(0));
    expect(text).not.toBeNull();
    if (text === null) return;
    expect(text.length).toBeLessThanOrEqual(CHECKPOINT_MAX_CHARS);
    const { verdict, record } = classifyCheckpointText(text, 'test');
    expect(verdict).toBe('ok');
    if (record === null) throw new Error('unreachable');
    expect(record.savedTick).toBe(-1);
    expect(record.pendingStart).toBe(true);
    expect(record.tail).toBeNull();
    expect(record.run.stage).toBe('t-s');
    expect(record.run.campaignId).toBe('test');
    expect(record.run.route).toEqual([0]);
    expect(record.config.seed).toBe(5);
    expect(record.carry.hiScore).toBe(120);
    // The stored kind and formats are the module's, and the config round-trips resolved.
    const data = raw(text);
    expect(data.kind).toBe(RUN_CHECKPOINT_KIND);
    expect(data.v).toBe(CHECKPOINT_FORMAT_VERSION);
    expect(data.replayFormat).toBe(REPLAY_FORMAT_VERSION);
    expect(record.config.stage).toBeNull();
  });

  it('round-trips a record with a live tail', () => {
    const text = buildCheckpointText(input(60));
    if (text === null) throw new Error('a 60-tick tail must fit');
    const { verdict, record } = classifyCheckpointText(text, 'test');
    expect(verdict).toBe('ok');
    if (record === null || record.tail === null) throw new Error('unreachable');
    expect(record.savedTick).toBe(60);
    expect(record.checkpointPassed).toBe(1);
    expect(record.tail.replay.ticks).toBe(60);
    expect(record.tail.replay.header.buildId).toBe('test');
    expect(record.tail.replay.header.checkpoint).toBe(-1);
  });

  it('drops the tail over the size cap and keeps the R1 record', () => {
    const base = input(60);
    // A carry padded past the cap with the tail; small enough without it.
    const pad: Record<string, unknown> = {
      ...CARRY,
      pad: 'x'.repeat(CHECKPOINT_MAX_CHARS - 2_000),
    };
    const text = buildCheckpointText({ ...base, carry: pad });
    expect(text).not.toBeNull();
    if (text === null) return;
    expect(text.length).toBeLessThanOrEqual(CHECKPOINT_MAX_CHARS);
    expect(raw(text).tail).toBeNull();
    expect(text).toContain('xxx');
    const { verdict, record } = classifyCheckpointText(text, 'test');
    expect(verdict).toBe('ok');
    if (record === null) throw new Error('unreachable');
    expect(record.tail).toBeNull();
    expect(record.savedTick).toBe(60);
  });

  it('returns null when even the tail-less record does not fit', () => {
    const base = input(0);
    const pad: Record<string, unknown> = { ...CARRY, pad: 'x'.repeat(CHECKPOINT_MAX_CHARS) };
    expect(buildCheckpointText({ ...base, carry: pad })).toBeNull();
  });

  it('fails fast on a config that cannot resolve', () => {
    expect(() => buildCheckpointText({ ...input(0), config: { seed: 'five' } as never })).toThrow();
  });

  it('classifies staleness like the replay kit: formats, build id, tail', () => {
    const text = buildCheckpointText(input(60));
    if (text === null) throw new Error('unreachable');
    expect(classifyCheckpointText(null, 'test').verdict).toBe('none');
    expect(classifyCheckpointText('', 'test').verdict).toBe('none');
    // Another build: silent discard.
    expect(classifyCheckpointText(text, 'other-build').verdict).toBe('stale');
    const v2 = raw(text);
    v2.v = CHECKPOINT_FORMAT_VERSION + 1;
    expect(classifyCheckpointText(JSON.stringify(v2), 'test').verdict).toBe('stale');
    const rf = raw(text);
    rf.replayFormat = REPLAY_FORMAT_VERSION + 1;
    expect(classifyCheckpointText(JSON.stringify(rf), 'test').verdict).toBe('stale');
    // A v1-format tail (replay formatVersion 1) throws ReplayVersionError in validation → stale.
    const tailOld = raw(text);
    const tail = tailOld.tail as Record<string, unknown>;
    const replay = tail.replay as Record<string, unknown>;
    const header = replay.header as Record<string, unknown>;
    header.formatVersion = 1;
    expect(classifyCheckpointText(JSON.stringify(tailOld), 'test').verdict).toBe('stale');
  });

  it('classifies garbage as invalid and never throws', () => {
    expect(classifyCheckpointText('not json', 'test').verdict).toBe('invalid');
    expect(classifyCheckpointText('[]', 'test').verdict).toBe('invalid');
    expect(classifyCheckpointText('null', 'test').verdict).toBe('invalid');
    expect(classifyCheckpointText(JSON.stringify({ kind: 'other' }), 'test').verdict).toBe(
      'invalid',
    );
    const base = raw(buildCheckpointText(input(0)) ?? '');
    const junk = (patch: Record<string, unknown>): string => JSON.stringify({ ...base, ...patch });
    // Bad mode, negative zone, non-array route, broken config: invalid, not a crash.
    expect(classifyCheckpointText(junk({ run: { ...RUN, mode: 'turbo' } }), 'test').verdict).toBe(
      'invalid',
    );
    expect(classifyCheckpointText(junk({ run: { ...RUN, zone: -2 } }), 'test').verdict).toBe(
      'invalid',
    );
    expect(classifyCheckpointText(junk({ run: { ...RUN, route: 'nope' } }), 'test').verdict).toBe(
      'invalid',
    );
    expect(classifyCheckpointText(junk({ config: { seed: 'x' } }), 'test').verdict).toBe('invalid');
    expect(classifyCheckpointText(junk({ savedTick: -3 }), 'test').verdict).toBe('invalid');
    expect(classifyCheckpointText(junk({ tail: 42 }), 'test').verdict).toBe('invalid');
    // A foreign-frame tail header is stale through decodeReplay's frame check (config frame).
    const frame = raw(buildCheckpointText(input(60)) ?? '');
    const tailReplay = (frame.tail as Record<string, unknown>).replay as Record<string, unknown>;
    const tailHeader = tailReplay.header as Record<string, unknown>;
    const tailConfig = tailHeader.config as Record<string, unknown>;
    tailConfig.internalWidth = 320;
    expect(classifyCheckpointText(JSON.stringify(frame), 'test').verdict).toBe('stale');
  });
});

describe('RunCheckpointStore (R2 TL-1)', () => {
  it('load is empty on a fresh storage and a write becomes available', async () => {
    const storage = createMemoryStorage();
    const store = new RunCheckpointStore(storage, 'test');
    await store.load();
    expect(store.available).toBe(false);
    const text = buildCheckpointText(input(0));
    if (text === null) throw new Error('unreachable');
    await store.store(text);
    expect(store.available).toBe(true);
    expect(store.current?.run.stage).toBe('t-s');
    expect(await storage.get(RUN_CHECKPOINT_STORAGE_KEY)).toBe(text);
  });

  it('a stale record deletes itself at load', async () => {
    const storage = createMemoryStorage();
    const text = buildCheckpointText(input(0));
    if (text === null) throw new Error('unreachable');
    await storage.set(RUN_CHECKPOINT_STORAGE_KEY, JSON.stringify({ ...raw(text), v: 99 }));
    const store = new RunCheckpointStore(storage, 'test');
    await store.load();
    expect(store.available).toBe(false);
    expect(await storage.get(RUN_CHECKPOINT_STORAGE_KEY)).toBe('');
  });

  it('keeps write order: a clear after a store settles last', async () => {
    const storage = createMemoryStorage();
    const store = new RunCheckpointStore(storage, 'test');
    await store.load();
    const text = buildCheckpointText(input(60));
    if (text === null) throw new Error('unreachable');
    void store.store(text);
    const done = store.clear();
    await done;
    expect(store.available).toBe(false);
    expect(await storage.get(RUN_CHECKPOINT_STORAGE_KEY)).toBe('');
  });

  it('reading a good record survives a later clear of another store on the same storage', async () => {
    const storage = createMemoryStorage();
    const text = buildCheckpointText(input(0));
    if (text === null) throw new Error('unreachable');
    const a = new RunCheckpointStore(storage, 'test');
    await a.store(text);
    const b = new RunCheckpointStore(storage, 'test');
    await b.load();
    expect(b.current?.savedTick).toBe(a.current?.savedTick);
  });
});
