/**
 * Edge cases of the cross-engine determinism check (plan M2-18, `determinism` module) in Node,
 * beyond `determinism.test.ts`'s golden replays:
 *
 * - a replay recorded here with a short hash interval plays back hash for hash — the periodic
 *   hashes on the interval's ticks, the last one included when the length is a multiple of the
 *   interval (and then equal to the final hash), none for a zero-tick replay, whose final hash is
 *   the starting state's;
 * - a replay that starts from a checkpoint with god mode (`assisted`) is set up like the recording;
 * - a tampered final hash is reported at the last tick, a replay naming a stage or a checkpoint the
 *   content does not have throws a `RangeError`;
 * - one check plays any number of replays, each from a fresh session (nothing leaks between them),
 *   and reads the injected clock once before and once after a playback;
 * - every bundled attract demo (`content/demos/`) reproduces its recorded hashes through the check
 *   — the Node side of what `test/e2e/determinism.spec.ts` asks of Chromium and Firefox.
 */
import { readdirSync, readFileSync } from 'node:fs';
import {
  Action,
  commitPlayerInput,
  createHeadlessPlatform,
  createReplayGame,
  createReplayHeader,
  createReplayRecorder,
  encodeReplay,
  hashWorld,
  resolveGameConfig,
  type ReplayJson,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../../../vite.shared.js';
import { createDeterminismCheck, installDeterminismCheck } from '../../src/determinism/index.js';
import { loadGameContent } from '../../src/loader/index.js';

const FILES = readContentFiles();
const { db: DB, issues: ISSUES } = loadGameContent(FILES);

/** What {@link record} records. */
interface RecordOptions {
  /** Ticks to record. */
  readonly ticks: number;
  /** Hash interval (default 25). */
  readonly interval?: number;
  /** Start checkpoint (default -1). */
  readonly checkpoint?: number;
  /** God mode (default false). */
  readonly assisted?: boolean;
  /** Gameplay seed (default 7). */
  readonly seed?: number;
}

/**
 * Records a short zone-A run in Node (the ship weaving up and down) and encodes it as the JSON a
 * page would receive.
 *
 * @param options - What to record.
 * @returns The replay document (a plain JSON copy).
 */
function record(options: RecordOptions): ReplayJson {
  const platform = createHeadlessPlatform();
  const header = createReplayHeader(
    resolveGameConfig({ stage: 'zone-a', seed: options.seed ?? 7 }),
    {
      buildId: 'edge',
      checkpoint: options.checkpoint ?? -1,
      assisted: options.assisted ?? false,
    },
  );
  const recorder = createReplayRecorder(platform.input, header, {
    hashInterval: options.interval ?? 25,
  });
  const game = createReplayGame({ ...platform, input: recorder }, header, DB);
  for (let i = 0; i < options.ticks; i++) {
    commitPlayerInput(platform.snapshot.players[0], i % 90 < 45 ? Action.Up : Action.Down);
    game.step();
    game.events.clear();
    recorder.check(game.world);
  }
  return JSON.parse(JSON.stringify(encodeReplay(recorder.finish(game.world)))) as ReplayJson;
}

/**
 * A copy of a replay document with some fields replaced.
 *
 * @param doc - The document.
 * @param patch - Fields to replace.
 * @returns The patched copy.
 */
function patched(doc: ReplayJson, patch: Record<string, unknown>): Record<string, unknown> {
  return { ...(JSON.parse(JSON.stringify(doc)) as Record<string, unknown>), ...patch };
}

describe('shell/determinism — edge cases (M2-18)', () => {
  it('validates the shipped content without an issue', () => {
    expect(ISSUES).toEqual([]);
    expect(createDeterminismCheck(FILES).issues).toEqual([]);
  });

  it('plays a replay whose length is not a multiple of the interval: one hash per whole interval', () => {
    const doc = record({ ticks: 110, interval: 25 });
    expect(doc.hashes).toHaveLength(4);
    const run = createDeterminismCheck(FILES).play(doc);
    expect(run.ok).toBe(true);
    expect(run.desyncTick).toBe(-1);
    expect(run.ticks).toBe(110);
    expect(run.hashes).toEqual(doc.hashes);
    expect(run.finalHash).toBe(doc.finalHash);
    // Four periodic hashes and the final one.
    expect(run.checked).toBe(5);
    expect(run.status).toBe('playing');
  });

  it('includes the last tick’s hash when the length is a multiple of the interval', () => {
    const doc = record({ ticks: 100, interval: 25 });
    const run = createDeterminismCheck(FILES).play(doc);
    expect(run.ok).toBe(true);
    expect(run.hashes).toHaveLength(4);
    expect(run.hashes).toEqual(doc.hashes);
    // The last periodic hash is taken after the last tick: the final state.
    expect(run.hashes[3]).toBe(run.finalHash);
    expect(run.checked).toBe(5);
  });

  it('plays a zero-tick replay: no periodic hash, the final hash is the starting state', () => {
    const doc = record({ ticks: 0 });
    const run = createDeterminismCheck(FILES).play(doc);
    expect(run).toMatchObject({ ok: true, desyncTick: -1, ticks: 0, checked: 1, hashes: [] });
    expect(run.finalHash).toBe(doc.finalHash);
    // The same starting state as a fresh session from the header.
    const game = createReplayGame(
      createHeadlessPlatform(),
      createReplayHeader(resolveGameConfig({ stage: 'zone-a', seed: 7 }), { buildId: 'edge' }),
      DB,
    );
    expect(run.finalHash).toBe(hashWorld(game.world));
  });

  it('starts from the header’s checkpoint with god mode, like the recording', () => {
    const doc = record({ ticks: 240, interval: 60, checkpoint: 1, assisted: true });
    expect(doc.header.checkpoint).toBe(1);
    expect(doc.header.assisted).toBe(true);
    const run = createDeterminismCheck(FILES).play(doc);
    expect(run.ok).toBe(true);
    expect(run.hashes).toEqual(doc.hashes);
    expect(run.finalHash).toBe(doc.finalHash);
    // The same inputs from the stage start end elsewhere: the checkpoint really was used.
    const fromStart = createDeterminismCheck(FILES).play(
      patched(doc, { header: { ...doc.header, checkpoint: -1 } }),
    );
    expect(fromStart.ok).toBe(false);
    expect(fromStart.finalHash).not.toBe(doc.finalHash);
  });

  it('reports a tampered final hash at the last tick, the periodic hashes still in sync', () => {
    const doc = record({ ticks: 80, interval: 25 });
    const run = createDeterminismCheck(FILES).play(
      patched(doc, { finalHash: (doc.finalHash ^ 0x10) >>> 0 }),
    );
    expect(run.ok).toBe(false);
    expect(run.desyncTick).toBe(80);
    expect(run.hashes).toEqual(doc.hashes);
    expect(run.finalHash).toBe(doc.finalHash);
    expect(run.checked).toBe(4);
  });

  it('reports the first of several differing hashes', () => {
    const doc = record({ ticks: 100, interval: 20 });
    const hashes = doc.hashes.map((h, i) => (i >= 2 ? (h ^ 1) >>> 0 : h));
    const run = createDeterminismCheck(FILES).play(patched(doc, { hashes }));
    expect(run.ok).toBe(false);
    expect(run.desyncTick).toBe(60);
    expect(run.hashes).toEqual(doc.hashes);
  });

  it('throws a RangeError for a stage or a checkpoint the content does not have', () => {
    const doc = record({ ticks: 10 });
    const check = createDeterminismCheck(FILES);
    expect(() => check.play(patched(doc, { header: { ...doc.header, checkpoint: 99 } }))).toThrow(
      RangeError,
    );
    expect(() =>
      check.play(
        patched(doc, {
          header: {
            ...doc.header,
            stageId: 'no-such-zone',
            config: { ...doc.header.config, stage: 'no-such-zone' },
          },
        }),
      ),
    ).toThrow(RangeError);
    expect(() => check.play(null)).toThrow(RangeError);
    expect(() => check.play('{"kind":"replay"}')).toThrow(RangeError);
    // A throw leaves the check usable.
    expect(check.play(doc).ok).toBe(true);
  });

  it('plays each replay from a fresh session: the order of the replays changes nothing', () => {
    const a = record({ ticks: 90, seed: 1 });
    const b = record({ ticks: 130, seed: 2, assisted: true });
    const check = createDeterminismCheck(FILES);
    const first = check.play(a);
    const between = check.play(b);
    const again = check.play(a);
    expect(first.ok && between.ok && again.ok).toBe(true);
    expect(again.hashes).toEqual(first.hashes);
    expect(again.finalHash).toBe(first.finalHash);
    expect(between.finalHash).not.toBe(first.finalHash);
  });

  it('reads the injected clock once before and once after a playback (ms is the difference)', () => {
    const doc = record({ ticks: 30 });
    const readings = [1000, 1250.5, 4000, 4003];
    let calls = 0;
    const check = installDeterminismCheck(
      { document: { documentElement: { setAttribute: () => undefined } } },
      FILES,
      () => readings[calls++],
    );
    expect(calls).toBe(0);
    expect(check.play(doc).ms).toBe(250.5);
    expect(calls).toBe(2);
    expect(check.play(doc).ms).toBe(3);
    expect(calls).toBe(4);
  });

  it('reproduces every attract demo’s recorded hashes (the demos the browsers play too)', () => {
    const dir = new URL('../../../../content/demos/', import.meta.url);
    const demos = readdirSync(dir)
      .filter((file) => file.endsWith('.replay.json') && !file.startsWith('example.'))
      .sort();
    expect(demos).toHaveLength(9);
    const check = createDeterminismCheck(FILES);
    for (const file of demos) {
      const doc = JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as ReplayJson;
      const run = check.play(doc);
      expect(run.ok, file).toBe(true);
      expect(run.ticks, file).toBe(doc.ticks);
      expect(run.hashes, file).toEqual(doc.hashes);
      expect(run.finalHash, file).toBe(doc.finalHash);
    }
  });
});
