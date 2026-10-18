/**
 * v2's R2-01 replay refusal (plan_resolution.md §3.4, owner decision W4-7; acceptance "a v1
 * replay is refused"): `decodeReplay` throws a {@link ReplayVersionError} for a replay whose
 * header config records another frame (`'frame'`) or that has an older format version
 * (`'format'` — from the flip on, when the versions are bumped); `decodeRunReplay` passes a
 * segment's refusal on and refuses an older run format itself; {@link classifyRunReplayText} tells
 * `'ok'` / `'legacy'` / `'invalid'` apart; and the replay library keeps a v1 replay's slot (never
 * deleted by itself) with a legacy summary, refuses to play or keep it, answers a paste of one
 * with `ReplayStoreResult.Legacy`, and deletes it on DELETE. The crafted cases hold at both frames:
 * their replays record {@link OTHER_FRAME}.
 *
 * The run replay v1.0.0's replay library wrote is a committed fixture,
 * `fixtures/run-replay-v1.json` ({@link V1_RUN_TEXT}), so its cases hold from the flip on for good
 * — a v1 replay a player kept stays one — and never read the shipped recordings, which R2-03
 * re-blesses (the cases on those are `replay-version-shipped.test.ts`'s, deleted then).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FRAME_H, FRAME_W, resolveGameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { Action, commitPlayerInput, createInputSnapshot } from '../../src/input/index.js';
import { createHeadlessPlatform, createMemoryStorage } from '../../src/platform/index.js';
import { isOlderFormatVersion, recordedFrame } from '../../src/replay/format.js';
import {
  REPLAY_FORMAT_VERSION,
  REPLAY_SLOTS,
  RUN_REPLAY_FORMAT_VERSION,
  RUN_REPLAY_KIND,
  ReplayStoreResult,
  ReplayVersionError,
  SegmentRecorder,
  classifyRunReplayText,
  createReplayGame,
  createReplayHeader,
  createReplayLibrary,
  createReplayRecorder,
  decodeReplay,
  decodeRunReplay,
  encodeReplay,
  parseRunReplayText,
  replayStorageKey,
  runReplayText,
  type Replay,
  type RunReplay,
} from '../../src/replay/index.js';
import { createWorld, stepWorld } from '../../src/world/index.js';
import { OTHER_FRAME, runTextAtOtherFrame, withFrame } from '../helpers/v1-replay.js';

/**
 * Records a short free-flight replay at the current frame.
 *
 * @param ticks - Ticks to record.
 * @returns The replay.
 */
function recordReplay(ticks = 40): Replay {
  const platform = createHeadlessPlatform();
  const header = createReplayHeader(resolveGameConfig({ seed: 12 }), { buildId: 'version' });
  const recorder = createReplayRecorder(platform.input, header, { capacity: ticks + 1 });
  const game = createReplayGame({ ...platform, input: recorder }, header, EMPTY_CONTENT_DB);
  for (let t = 0; t < ticks; t++) {
    commitPlayerInput(platform.snapshot.players[0], t % 20 < 10 ? Action.Up : Action.Down);
    game.step();
    recorder.check(game.world);
  }
  return recorder.finish(game.world);
}

/**
 * Records a one-segment run replay at the current frame.
 *
 * @param label - The run's label.
 * @returns The run.
 */
function recordRun(label = 'KESTREL NORMAL'): RunReplay {
  const config = resolveGameConfig({ seed: 5 });
  const world = createWorld(config, EMPTY_CONTENT_DB);
  const input = createInputSnapshot();
  const recorder = new SegmentRecorder();
  recorder.begin(createReplayHeader(config, { buildId: 'version' }), null);
  for (let t = 0; t < 30; t++) {
    commitPlayerInput(input.players[0], (t >> 2) & 1 ? Action.Left : Action.Right);
    recorder.record(input);
    stepWorld(world, input);
    recorder.check(world);
  }
  const segment = recorder.finish(world, 0);
  expect(segment).not.toBeNull();
  return {
    formatVersion: RUN_REPLAY_FORMAT_VERSION,
    buildId: 'version',
    mode: '1p',
    label,
    score: 1200,
    reached: 'S',
    assists: 0,
    ticks: segment!.replay.ticks,
    segments: [segment!],
  };
}

/** A fresh copy of a recorded replay's document. */
const REPLAY_DOC = (): Record<string, unknown> =>
  JSON.parse(JSON.stringify(encodeReplay(recordReplay()))) as Record<string, unknown>;

/**
 * The error a call throws.
 *
 * @param fn - The call.
 * @returns What it threw.
 */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw');
}

/** v1's frame: what the header config of every replay v1 recorded holds. */
const V1_FRAME: readonly [number, number] = [384, 216];

/** v1's replay format version, and its run replay format version. */
const V1_FORMAT = 1;

/**
 * A run replay as v1.0.0's replay library wrote it — the text of a v1 `replay.last` / `replay.N`
 * slot or of a SHARE paste: `encodeRunReplay` of v1.0.0 (run format 1, no `ticks` field) as
 * `runReplayText` writes it (one line). The fixture was derived once from v1.0.0's golden
 * `zone-a-god` (its `description` / `expected` dropped: never part of a replay), and v1.0.0's own
 * `parseRunReplayText` reads it and `runReplayText` writes it back byte for byte. It never changes
 * with the goldens; the file is pretty-printed, so it is re-stringified here.
 */
const V1_RUN_TEXT = JSON.stringify(
  JSON.parse(readFileSync(new URL('./fixtures/run-replay-v1.json', import.meta.url), 'utf8')),
);

/**
 * Asserts that a refusal is a v1 replay's: a {@link ReplayVersionError} for its older format, with
 * v1's frame, and a message that names v1.
 *
 * @param error - What decoding threw.
 */
function expectV1Refusal(error: unknown): void {
  expect(error).toBeInstanceOf(ReplayVersionError);
  const refusal = error as ReplayVersionError;
  expect(refusal.name).toBe('ReplayVersionError');
  // The format check comes first: a v1 replay is refused for its version, not its frame.
  expect(refusal.reason).toBe('format');
  expect([refusal.recordedWidth, refusal.recordedHeight]).toEqual(V1_FRAME);
  expect(refusal.message).toBe(
    `replay recorded at ${V1_FRAME[0]}×${V1_FRAME[1]} (v1, format version ${V1_FORMAT}) ` +
      `cannot play at ${FRAME_W}×${FRAME_H}`,
  );
}

describe('core/replay ReplayVersionError (R2-01)', () => {
  it('decodes a replay of the current frame', () => {
    const replay = decodeReplay(REPLAY_DOC());
    expect([replay.header.config.internalWidth, replay.header.config.internalHeight]).toEqual([
      FRAME_W,
      FRAME_H,
    ]);
  });

  it('refuses a replay whose config records another frame, naming both frames', () => {
    const error = thrown(() => decodeReplay(withFrame(REPLAY_DOC())));
    expect(error).toBeInstanceOf(ReplayVersionError);
    expect(error).toBeInstanceOf(RangeError);
    const refusal = error as ReplayVersionError;
    expect(refusal.name).toBe('ReplayVersionError');
    expect(refusal.reason).toBe('frame');
    expect([refusal.recordedWidth, refusal.recordedHeight]).toEqual(OTHER_FRAME);
    expect(refusal.message).toBe(
      `replay recorded at ${OTHER_FRAME[0]}×${OTHER_FRAME[1]} (another frame) cannot play at ` +
        `${FRAME_W}×${FRAME_H}`,
    );
    // Only the height, or only the width, differing is another frame too.
    for (const frame of [
      [FRAME_W, OTHER_FRAME[1]],
      [OTHER_FRAME[0], FRAME_H],
    ] as const) {
      const partial = thrown(() => decodeReplay(withFrame(REPLAY_DOC(), frame)));
      expect(partial, String(frame)).toBeInstanceOf(ReplayVersionError);
    }
  });

  it('keeps a malformed frame a plain RangeError (the config check comes first)', () => {
    const error = thrown(() => decodeReplay(withFrame(REPLAY_DOC(), [8, 8])));
    expect(error).toBeInstanceOf(RangeError);
    expect(error).not.toBeInstanceOf(ReplayVersionError);
  });

  it('refuses a newer, zero or malformed format version as unsupported, not as v1', () => {
    for (const version of [REPLAY_FORMAT_VERSION + 1, 0, -1, 1.5, '1', null]) {
      const doc = REPLAY_DOC();
      (doc.header as Record<string, unknown>).formatVersion = version;
      const error = thrown(() => decodeReplay(doc));
      expect(error, String(version)).toBeInstanceOf(RangeError);
      expect(error, String(version)).not.toBeInstanceOf(ReplayVersionError);
      expect((error as Error).message, String(version)).toMatch(/not supported/);
    }
  });

  it('tells an older format version apart: a whole number from 1 below the current one', () => {
    expect(isOlderFormatVersion(1, 2)).toBe(true);
    expect(isOlderFormatVersion(2, 3)).toBe(true);
    for (const version of [0, 2, 3, 1.5, '1', null, undefined, Number.NaN]) {
      expect(isOlderFormatVersion(version, 2), String(version)).toBe(false);
    }
    // Today's versions: nothing older than the current one is in use until the flip bumps them.
    expect(isOlderFormatVersion(REPLAY_FORMAT_VERSION, REPLAY_FORMAT_VERSION)).toBe(false);
    expect(recordedFrame({ internalWidth: 384, internalHeight: 216 })).toEqual([384, 216]);
    expect(recordedFrame({ internalWidth: '384' }).map(Number.isNaN)).toEqual([true, true]);
    expect(recordedFrame(null).map(Number.isNaN)).toEqual([true, true]);
  });

  it('names v1 for format version 1 only; a later older format is an older build`s', () => {
    const error = new ReplayVersionError('format', 384, 216, 1);
    expect(error.reason).toBe('format');
    expect(error.message).toBe(
      `replay recorded at 384×216 (v1, format version 1) cannot play at ${FRAME_W}×${FRAME_H}`,
    );
    // A format v2 wrote, refused by a later build (after another bump): not v1's.
    expect(new ReplayVersionError('format', 640, 360, 2).message).toBe(
      `replay recorded at 640×360 (an older build, format version 2) cannot play at ` +
        `${FRAME_W}×${FRAME_H}`,
    );
    expect(new ReplayVersionError('format', Number.NaN, Number.NaN, 1).message).toMatch(
      /^replay recorded at NaN×NaN \(v1, format version 1\)/,
    );
    // A frame refusal names no build.
    expect(new ReplayVersionError('frame', 384, 216).message).toBe(
      `replay recorded at 384×216 (another frame) cannot play at ${FRAME_W}×${FRAME_H}`,
    );
  });

  it.runIf(REPLAY_FORMAT_VERSION > 1)(
    'refuses a replay of an older format version as v1, with the frame it recorded',
    () => {
      const doc = withFrame(REPLAY_DOC());
      (doc.header as Record<string, unknown>).formatVersion = REPLAY_FORMAT_VERSION - 1;
      const error = thrown(() => decodeReplay(doc)) as ReplayVersionError;
      expect(error).toBeInstanceOf(ReplayVersionError);
      expect(error.reason).toBe('format');
      expect([error.recordedWidth, error.recordedHeight]).toEqual(OTHER_FRAME);
      // Format version 1 is v1's (the flip bumps it to 2); a later bump names an older build.
      expect(error.message).toMatch(
        REPLAY_FORMAT_VERSION - 1 === 1
          ? /\(v1, format version 1\)/
          : /\(an older build, format version/,
      );
    },
  );
});

describe('core/replay run replays recorded by v1 (R2-01)', () => {
  it('passes a segment`s frame refusal on; classifies ok / legacy / invalid', () => {
    const text = runReplayText(recordRun());
    expect(classifyRunReplayText(text)).toBe('ok');
    expect(parseRunReplayText(text)).not.toBeNull();
    const legacy = runTextAtOtherFrame(text);
    const error = thrown(() => decodeRunReplay(JSON.parse(legacy)));
    expect(error).toBeInstanceOf(ReplayVersionError);
    expect((error as ReplayVersionError).reason).toBe('frame');
    expect(classifyRunReplayText(legacy)).toBe('legacy');
    expect(parseRunReplayText(legacy)).toBeNull();
    for (const bad of ['', '{oops', '{}', '[]', 'null', text.replace('"run-replay"', '"x"')]) {
      expect(classifyRunReplayText(bad), bad.slice(0, 20)).toBe('invalid');
    }
    // A run format newer than this build's is unsupported, not v1.
    const newer = JSON.parse(text) as Record<string, unknown>;
    newer.formatVersion = RUN_REPLAY_FORMAT_VERSION + 1;
    expect(classifyRunReplayText(JSON.stringify(newer))).toBe('invalid');
  });

  it.runIf(RUN_REPLAY_FORMAT_VERSION > 1)(
    'refuses an older run format as v1, the frame read from its first segment',
    () => {
      const doc = JSON.parse(runTextAtOtherFrame(runReplayText(recordRun()))) as Record<
        string,
        unknown
      >;
      doc.formatVersion = RUN_REPLAY_FORMAT_VERSION - 1;
      const error = thrown(() => decodeRunReplay(doc)) as ReplayVersionError;
      expect(error).toBeInstanceOf(ReplayVersionError);
      expect(error.reason).toBe('format');
      expect([error.recordedWidth, error.recordedHeight]).toEqual(OTHER_FRAME);
      expect(classifyRunReplayText(JSON.stringify(doc))).toBe('legacy');
    },
  );
});

describe('core/replay the library and v1 replays (R2-01)', () => {
  it('keeps a stored v1 replay with a legacy summary; never deletes, plays or keeps it', async () => {
    const good = runReplayText(recordRun('MANTA HARD'));
    const legacy = runTextAtOtherFrame(runReplayText(recordRun()));
    const storage = createMemoryStorage({
      [replayStorageKey(0)]: legacy,
      [replayStorageKey(1)]: good,
      [replayStorageKey(2)]: legacy,
    });
    const library = createReplayLibrary(storage);
    await library.load();
    expect(library.summaries[0]).toEqual({
      slot: 0,
      mode: '',
      label: '',
      score: 0,
      reached: '',
      assisted: false,
      ticks: 0,
      legacy: true,
    });
    expect(library.summaries[1]).toMatchObject({ slot: 1, label: 'MANTA HARD', legacy: false });
    expect(library.summaries[2]).toMatchObject({ slot: 2, legacy: true });
    expect(library.summaries[3]).toBeNull();
    // The texts stay — in the library and in the storage (load cleared nothing).
    expect(library.exportText(0)).toBe(legacy);
    expect(await storage.get(replayStorageKey(0))).toBe(legacy);
    expect(await storage.get(replayStorageKey(2))).toBe(legacy);
    // It cannot play, and is not copied.
    expect(library.replay(0)).toBeNull();
    expect(library.replay(1)).not.toBeNull();
    const revision = library.revision;
    expect(library.keep(0)).toBe(-1);
    expect(library.keep(2)).toBe(-1);
    expect(library.revision).toBe(revision);
    expect(library.summaries[3]).toBeNull();
    // A good replay still keeps, into the free slot (the v1 ones keep their room).
    expect(library.keep(1)).toBe(3);
    // DELETE removes one.
    library.remove(2);
    expect(library.summaries[2]).toBeNull();
    expect(await storage.get(replayStorageKey(2))).toBe('');
    // The next finished game replaces the last game's slot as always.
    library.storeLast(recordRun('NEXT'));
    expect(library.summaries[0]).toMatchObject({ label: 'NEXT', legacy: false });
  });

  it('answers a pasted v1 replay with Legacy and stores nothing', async () => {
    const storage = createMemoryStorage();
    const library = createReplayLibrary(storage);
    await library.load();
    const legacy = runTextAtOtherFrame(runReplayText(recordRun()));
    expect(library.importText(legacy)).toBe(ReplayStoreResult.Legacy);
    expect(library.importText('  ' + legacy + '\n')).toBe(ReplayStoreResult.Legacy);
    for (let slot = 0; slot < REPLAY_SLOTS; slot++) expect(library.summaries[slot]).toBeNull();
    expect(await storage.get(replayStorageKey(1))).toBeNull();
    // A broken text is still Invalid, a good one Ok.
    expect(library.importText('{oops')).toBe(ReplayStoreResult.Invalid);
    expect(library.importText(runReplayText(recordRun()))).toBe(ReplayStoreResult.Ok);
    expect(ReplayStoreResult.Legacy).toBe(4);
  });

  it('counts a kept v1 replay toward the kept replays` room', async () => {
    const legacy = runTextAtOtherFrame(runReplayText(recordRun()));
    const storage = createMemoryStorage({
      [replayStorageKey(1)]: legacy,
      [replayStorageKey(2)]: legacy,
      [replayStorageKey(3)]: legacy,
    });
    const library = createReplayLibrary(storage);
    await library.load();
    // Every kept slot holds a v1 replay: a paste finds no room until one is deleted.
    expect(library.importText(runReplayText(recordRun()))).toBe(ReplayStoreResult.Full);
    library.remove(1);
    expect(library.importText(runReplayText(recordRun()))).toBe(ReplayStoreResult.Ok);
    expect(library.summaries[1]).toMatchObject({ legacy: false });
  });
});

describe('core/replay a run replay v1.0.0 wrote (fixtures/run-replay-v1.json, R2-01)', () => {
  it('is v1.0.0`s shape: run format 1, no ticks, one segment of format 1 at v1`s frame', () => {
    // This build writes newer formats at another frame, so the fixture is an older build's.
    expect(REPLAY_FORMAT_VERSION).toBeGreaterThan(V1_FORMAT);
    expect(RUN_REPLAY_FORMAT_VERSION).toBeGreaterThan(V1_FORMAT);
    expect([FRAME_W, FRAME_H]).not.toEqual(V1_FRAME);
    // The fixture stays v1's for good (the guard against re-blessing it with the goldens).
    const doc = JSON.parse(V1_RUN_TEXT) as Record<string, unknown>;
    expect(Object.keys(doc)).toEqual([
      'kind',
      'formatVersion',
      'buildId',
      'mode',
      'label',
      'score',
      'reached',
      'assists',
      'segments',
    ]);
    expect(doc.kind).toBe(RUN_REPLAY_KIND);
    expect(doc.formatVersion).toBe(V1_FORMAT);
    const segments = doc.segments as Array<Record<string, unknown>>;
    expect(segments).toHaveLength(1);
    expect(Object.keys(segments[0])).toEqual(['replay', 'start', 'actions']);
    const replay = segments[0].replay as Record<string, unknown>;
    expect(Object.keys(replay)).toEqual([
      'kind',
      'header',
      'ticks',
      'hashInterval',
      'inputs',
      'hashes',
      'finalHash',
    ]);
    const header = replay.header as { formatVersion: unknown; config: Record<string, unknown> };
    expect(header.formatVersion).toBe(V1_FORMAT);
    expect([header.config.internalWidth, header.config.internalHeight]).toEqual(V1_FRAME);
  });

  it('is legacy: decodeRunReplay refuses it as v1`s, with the frame of its first segment', () => {
    expectV1Refusal(thrown(() => decodeRunReplay(JSON.parse(V1_RUN_TEXT))));
    expect(classifyRunReplayText(V1_RUN_TEXT)).toBe('legacy');
    expect(parseRunReplayText(V1_RUN_TEXT)).toBeNull();
    // Its segment alone is refused the same way.
    const doc = JSON.parse(V1_RUN_TEXT) as { segments: Array<{ replay: unknown }> };
    expectV1Refusal(thrown(() => decodeReplay(doc.segments[0].replay)));
  });

  it('answers a paste of it with ReplayStoreResult.Legacy and stores nothing', async () => {
    const storage = createMemoryStorage();
    const library = createReplayLibrary(storage);
    await library.load();
    const revision = library.revision;
    expect(library.importText(V1_RUN_TEXT)).toBe(ReplayStoreResult.Legacy);
    // A pasted text carries the clipboard's whitespace.
    expect(library.importText('\n' + V1_RUN_TEXT + '  \n')).toBe(ReplayStoreResult.Legacy);
    expect(library.revision).toBe(revision);
    for (let slot = 0; slot < REPLAY_SLOTS; slot++) {
      expect(library.summaries[slot], String(slot)).toBeNull();
      expect(await storage.get(replayStorageKey(slot)), String(slot)).toBeNull();
    }
  });

  it('keeps a stored one as a v1 replay: never played, kept or deleted by itself', async () => {
    const storage = createMemoryStorage({
      [replayStorageKey(0)]: V1_RUN_TEXT,
      [replayStorageKey(1)]: V1_RUN_TEXT,
    });
    const library = createReplayLibrary(storage);
    await library.load();
    for (const slot of [0, 1]) {
      expect(library.summaries[slot], String(slot)).toMatchObject({ slot, legacy: true });
      expect(library.replay(slot), String(slot)).toBeNull();
      expect(library.exportText(slot), String(slot)).toBe(V1_RUN_TEXT);
      expect(await storage.get(replayStorageKey(slot)), String(slot)).toBe(V1_RUN_TEXT);
    }
    expect(library.keep(0)).toBe(-1);
    library.remove(1);
    expect(library.summaries[1]).toBeNull();
    expect(await storage.get(replayStorageKey(1))).toBe('');
  });
});
