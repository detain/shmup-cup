/**
 * Edge cases of the replay module (plan M1-19): varint and run boundaries of the input coding,
 * player 2 and short source snapshots, a one-tick hash interval, the check() contract (before the
 * first poll, twice per tick, after the end), the first desync kept, a zero-tick replay (its final
 * hash — the starting state — is compared too, so a tampered header is caught), deterministic
 * encoding, the config copy in the JSON and the decoder's remaining validation paths.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG, resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { Action, commitPlayerInput, type InputSnapshot } from '../../src/input/index.js';
import { createHeadlessPlatform, type PlatformInput } from '../../src/platform/index.js';
import {
  REPLAY_HASH_INTERVAL,
  createPlayback,
  createReplayGame,
  createReplayHeader,
  createReplayRecorder,
  decodeBase64,
  decodeInputRuns,
  decodeReplay,
  encodeBase64,
  encodeInputRuns,
  encodeReplay,
  packReplayInput,
  playReplay,
  type Replay,
  type ReplayJson,
} from '../../src/replay/index.js';

const FREE = resolveGameConfig({ seed: 21 });

/**
 * Records a free-flight session where both players' inputs change.
 *
 * @param ticks - Ticks to record.
 * @param options - Hash interval and capacity of the recorder; the session config.
 * @returns The replay and the per-tick `[held, pressed, released]` of both players the game saw.
 */
function recordBoth(
  ticks: number,
  options: { hashInterval?: number; capacity?: number; config?: GameConfig } = {},
): { replay: Replay; seen: number[][] } {
  const platform = createHeadlessPlatform();
  const header = createReplayHeader(options.config ?? FREE, { buildId: 'edge' });
  const recorder = createReplayRecorder(platform.input, header, {
    hashInterval: options.hashInterval,
    capacity: options.capacity,
  });
  const game = createReplayGame({ ...platform, input: recorder }, header, EMPTY_CONTENT_DB);
  const seen: number[][] = [];
  for (let i = 0; i < ticks; i++) {
    const [p1, p2] = platform.snapshot.players;
    commitPlayerInput(p1, i % 50 < 25 ? Action.Up | Action.Shot : Action.Down);
    commitPlayerInput(p2, i % 7 < 3 ? Action.Left : 0, i % 11 === 0 ? Action.PowerUp : 0);
    game.step();
    recorder.check(game.world);
    const players = (game.state.input as InputSnapshot).players;
    seen.push(players.flatMap((p) => [p.held, p.pressed, p.released]));
  }
  return { replay: recorder.finish(game.world), seen };
}

describe('core/replay input coding — boundaries', () => {
  it('round-trips the varint boundaries of values and run lengths', () => {
    const values = [0, 1, 127, 128, 16_383, 16_384, 0x1fffff, 0x200000, 0xfffffff, 0x10000000];
    values.push(0x7fffffff, 0x80000000, 0xfffffffe, 0xffffffff);
    const words: number[] = [];
    // Runs of 1, 127, 128 and 300 words (one- and two-byte run counts).
    for (const [index, value] of values.entries()) {
      const run = [1, 127, 128, 300][index % 4];
      for (let k = 0; k < run; k++) words.push(value);
    }
    const array = Uint32Array.from(words);
    const text = encodeInputRuns(array);
    expect(decodeInputRuns(text, array.length)).toEqual(array);
    // Each run costs its value's varint plus its count's varint: the encoding is run-length.
    expect(decodeBase64(text).length).toBeLessThan(values.length * 8);
  });

  it('encodes a value with its varint bytes little-endian (LEB128)', () => {
    // (300, 1): 300 = 0b1_0010_1100 → 0xac 0x02; count 1 → 0x01.
    expect(Array.from(decodeBase64(encodeInputRuns(Uint32Array.of(300))))).toEqual([
      0xac, 0x02, 0x01,
    ]);
    // (2^32 - 1, 200): five value bytes, then 200 → 0xc8 0x01.
    expect(
      Array.from(decodeBase64(encodeInputRuns(new Uint32Array(200).fill(0xffffffff)))),
    ).toEqual([0xff, 0xff, 0xff, 0xff, 0x0f, 0xc8, 0x01]);
  });

  it('never merges runs of different values, even when they alternate every word', () => {
    const words = Uint32Array.from({ length: 64 }, (_, i) => (i % 2 === 0 ? 5 : 6));
    const bytes = decodeBase64(encodeInputRuns(words));
    expect(bytes.length).toBe(64 * 2);
    expect(decodeInputRuns(encodeInputRuns(words), 64)).toEqual(words);
  });

  it('rejects a varint cut off in the run count and a run count that overflows the ticks', () => {
    // A value, then a run count whose continuation bit has no next byte.
    expect(() => decodeInputRuns(encodeBase64(Uint8Array.of(5, 0x80)), 1)).toThrow(/truncated/);
    // Two runs of one each for ticks = 1.
    expect(() => decodeInputRuns(encodeBase64(Uint8Array.of(5, 1, 6, 1)), 1)).toThrow(/exceed/);
    // Not base64 at all.
    expect(() => decodeInputRuns('####', 1)).toThrow(/base64/);
    // Nothing encoded but ticks expected.
    expect(() => decodeInputRuns('', 3)).toThrow(/cover 0 of 3/);
  });

  it('packs out-of-range masks into their low 16 bits each', () => {
    expect(packReplayInput(-1, -1)).toBe(0xffffffff);
    expect(packReplayInput(0x12345, 0)).toBe(0x2345);
    expect(packReplayInput(0, 0x12345)).toBe(0x2345 * 0x10000);
    expect(packReplayInput(0, 0)).toBe(0);
  });

  it('decodes base64 of every length back to the bytes it came from', () => {
    for (let length = 0; length < 40; length++) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 97 + length) & 255);
      const text = encodeBase64(bytes);
      expect(text.length % 4).toBe(0);
      expect(Array.from(decodeBase64(text))).toEqual(Array.from(bytes));
      expect(text).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
});

describe('core/replay recorder and playback — edge cases', () => {
  it('records and replays player 2’s input as well (both players, tick for tick)', () => {
    const { replay, seen } = recordBoth(400);
    expect(Array.from(replay.inputs[1]).some((word) => word !== 0)).toBe(true);
    const playback = createPlayback(replay);
    const game = createReplayGame(
      { ...createHeadlessPlatform(), input: playback },
      replay.header,
      EMPTY_CONTENT_DB,
    );
    const replayed: number[][] = [];
    while (!playback.done) {
      game.step();
      playback.check(game.world);
      const players = (game.state.input as InputSnapshot).players;
      replayed.push(players.flatMap((p) => [p.held, p.pressed, p.released]));
    }
    expect(replayed).toEqual(seen);
    expect(playback.report.ok).toBe(true);
  });

  it('records a source snapshot with fewer players as idle input for the missing ones', () => {
    const platform = createHeadlessPlatform();
    const one = { held: Action.Up, pressed: Action.Up, released: 0, device: 'keyboard' as const };
    const source: PlatformInput = { poll: () => ({ players: [one] }) };
    const header = createReplayHeader(FREE);
    const recorder = createReplayRecorder(source, header, { hashInterval: 5 });
    const game = createReplayGame({ ...platform, input: recorder }, header, EMPTY_CONTENT_DB);
    for (let i = 0; i < 10; i++) {
      game.step();
      recorder.check(game.world);
    }
    const replay = recorder.finish(game.world);
    expect(Array.from(replay.inputs[0])).toEqual(
      new Array(10).fill(packReplayInput(Action.Up, Action.Up)),
    );
    expect(Array.from(replay.inputs[1])).toEqual(new Array(10).fill(0));
  });

  it('hashes every tick with a one-tick interval, growing the hash list past the capacity', () => {
    const { replay } = recordBoth(50, { hashInterval: 1, capacity: 8 });
    expect(replay.hashInterval).toBe(1);
    expect(replay.hashes).toHaveLength(50);
    const run = playReplay(replay, EMPTY_CONTENT_DB);
    expect(run.report).toMatchObject({ ok: true, checked: 51, finished: true });
    expect(run.report.checked).toBe(replay.hashes.length + 1);
    expect(hashWorld(run.game.world)).toBe(replay.finalHash);
  });

  it('ignores check() before the first poll, a second check() of a tick and checks past the end', () => {
    const { replay } = recordBoth(REPLAY_HASH_INTERVAL + 5);
    const playback = createPlayback(replay);
    const game = createReplayGame(
      { ...createHeadlessPlatform(), input: playback },
      replay.header,
      EMPTY_CONTENT_DB,
    );
    playback.check(game.world); // no tick yet
    expect(playback.report.checked).toBe(0);
    while (!playback.done) {
      game.step();
      playback.check(game.world);
      playback.check(game.world); // twice: counted once
    }
    expect(playback.report).toMatchObject({ ok: true, checked: 2, finished: true });
    // Past the end: idle input, nothing compared any more (even though the state moves on).
    for (let i = 0; i < REPLAY_HASH_INTERVAL; i++) {
      game.step();
      playback.check(game.world);
    }
    expect(playback.report).toMatchObject({ ok: true, checked: 2, finished: true });
  });

  it('keeps the first desync and still counts the later comparisons', () => {
    const { replay } = recordBoth(2 * REPLAY_HASH_INTERVAL + 10);
    const tampered: Replay = {
      ...replay,
      inputs: [replay.inputs[0].slice(), replay.inputs[1]],
    };
    // Diverges well before the first hash (after the ship's fly-in, when it steers).
    tampered.inputs[0].fill(Action.Right, 200, 230);
    const { report } = playReplay(tampered, EMPTY_CONTENT_DB);
    expect(report.ok).toBe(false);
    expect(report.desyncTick).toBe(REPLAY_HASH_INTERVAL);
    expect(report.expectedHash).toBe(replay.hashes[0]);
    expect(report.checked).toBe(3);
    expect(report.finished).toBe(true);
  });

  it('compares a zero-tick replay’s final hash with the starting state', () => {
    const platform = createHeadlessPlatform();
    const header = createReplayHeader(FREE);
    const recorder = createReplayRecorder(platform.input, header);
    const game = createReplayGame({ ...platform, input: recorder }, header, EMPTY_CONTENT_DB);
    const replay = recorder.finish(game.world);
    expect([replay.ticks, replay.hashes.length]).toEqual([0, 0]);
    expect(replay.finalHash).toBe(hashWorld(game.world));
    const run = playReplay(replay, EMPTY_CONTENT_DB);
    expect(run.report).toMatchObject({ ok: true, checked: 1, finished: true });
    // Another seed changes the starting state: caught, although no tick ran.
    const reseeded = decodeReplay({
      ...encodeReplay(replay),
      header: { ...encodeReplay(replay).header, seed: 22, config: { ...FREE, seed: 22 } },
    });
    expect(playReplay(reseeded, EMPTY_CONTENT_DB).report).toMatchObject({
      ok: false,
      desyncTick: 0,
      checked: 1,
      finished: true,
    });
  });

  it('records byte-identical files for the same session, and plays without touching the replay', () => {
    const a = JSON.stringify(encodeReplay(recordBoth(700).replay));
    const b = JSON.stringify(encodeReplay(recordBoth(700).replay));
    expect(a).toBe(b);
    const replay = decodeReplay(JSON.parse(a));
    const hashes = Array.from(replay.hashes);
    const inputs = replay.inputs.map((words) => Array.from(words));
    playReplay(replay, EMPTY_CONTENT_DB);
    expect(Array.from(replay.hashes)).toEqual(hashes);
    expect(replay.inputs.map((words) => Array.from(words))).toEqual(inputs);
    expect(Object.isFrozen(replay)).toBe(true);
  });

  it('keeps recording after finish(): a later finish() covers the extra ticks', () => {
    const platform = createHeadlessPlatform();
    const header = createReplayHeader(FREE);
    const recorder = createReplayRecorder(platform.input, header, { hashInterval: 4 });
    const game = createReplayGame({ ...platform, input: recorder }, header, EMPTY_CONTENT_DB);
    const run = (ticks: number): void => {
      for (let i = 0; i < ticks; i++) {
        commitPlayerInput(platform.snapshot.players[0], i % 3 === 0 ? Action.Up : 0);
        game.step();
        recorder.check(game.world);
      }
    };
    run(9);
    const first = recorder.finish(game.world);
    run(9);
    const second = recorder.finish(game.world);
    expect([first.ticks, second.ticks]).toEqual([9, 18]);
    expect(Array.from(second.inputs[0].slice(0, 9))).toEqual(Array.from(first.inputs[0]));
    expect(Array.from(second.hashes.slice(0, 2))).toEqual(Array.from(first.hashes));
    expect(playReplay(first, EMPTY_CONTENT_DB).report.ok).toBe(true);
    expect(playReplay(second, EMPTY_CONTENT_DB).report.ok).toBe(true);
  });
});

describe('core/replay header and JSON — edge cases', () => {
  it('keeps the config object, mirrors stage / seed / loadout and treats a missing flag as false', () => {
    const config = resolveGameConfig({ seed: 4, loadout: 'full' });
    const header = createReplayHeader(config, { checkpoint: 0 });
    expect(header.config).toBe(config);
    expect([header.seed, header.stageId, header.loadout]).toEqual([4, null, 'full']);
    expect([header.checkpoint, header.assisted, header.buildId]).toEqual([0, false, 'dev']);
    expect(() => createReplayHeader(config, { checkpoint: Number.NaN })).toThrow(RangeError);
    expect(() => createReplayHeader(config, { checkpoint: Infinity })).toThrow(RangeError);
  });

  it('writes every GameConfig field into the JSON, arrays as copies', () => {
    const { replay } = recordBoth(3);
    const doc = encodeReplay(replay);
    const config = doc.header.config as unknown as Record<string, unknown>;
    expect(Object.keys(config).sort()).toEqual(Object.keys(DEFAULT_GAME_CONFIG).sort());
    expect(config.autoPowerUpOrder).toEqual(replay.header.config.autoPowerUpOrder);
    expect(config.autoPowerUpOrder).not.toBe(replay.header.config.autoPowerUpOrder);
    expect(doc.kind).toBe('replay');
    expect(doc.inputs).toHaveLength(2);
    expect(doc.hashes).toEqual([]);
  });

  it('drops config fields the game does not know when decoding', () => {
    const doc = JSON.parse(JSON.stringify(encodeReplay(recordBoth(3).replay))) as ReplayJson;
    (doc.header.config as unknown as Record<string, unknown>).futureOption = 7;
    const replay = decodeReplay(doc);
    expect(Object.prototype.hasOwnProperty.call(replay.header.config, 'futureOption')).toBe(false);
    expect(playReplay(replay, EMPTY_CONTENT_DB).report.ok).toBe(true);
  });

  it('accepts an empty replay document (zero ticks, empty input strings)', () => {
    const doc = JSON.parse(JSON.stringify(encodeReplay(recordBoth(0).replay))) as ReplayJson;
    expect(doc.inputs).toEqual(['', '']);
    expect(decodeReplay(doc).ticks).toBe(0);
  });

  const base = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(encodeReplay(recordBoth(610).replay))) as Record<string, unknown>;

  it.each<[string, (doc: Record<string, unknown>) => void, RegExp]>([
    ['fractional ticks', (d) => void (d.ticks = 1.5), /ticks/],
    ['string ticks', (d) => void (d.ticks = '610'), /ticks/],
    ['a string hash interval', (d) => void (d.hashInterval = '600'), /hashInterval/],
    ['a fractional hash interval', (d) => void (d.hashInterval = 2.5), /hash interval/],
    ['inputs that are not a list', (d) => void (d.inputs = 'AAAA'), /2 players/],
    ['three players', (d) => void (d.inputs = [...(d.inputs as string[]), '']), /2 players/],
    ['hashes that are not a list', (d) => void (d.hashes = 5), /hashes must hold 1/],
    ['a hash too big for 32 bits', (d) => void ((d.hashes as unknown[])[0] = 2 ** 32), /hashes/],
    ['a string hash', (d) => void ((d.hashes as unknown[])[0] = '1'), /hashes\[0\]/],
    ['a missing final hash', (d) => void delete d.finalHash, /finalHash/],
    [
      'a fractional checkpoint',
      (d) => void ((d.header as Record<string, unknown>).checkpoint = 0.5),
      /checkpoint/,
    ],
    [
      'a string checkpoint',
      (d) => void ((d.header as Record<string, unknown>).checkpoint = '0'),
      /checkpoint/,
    ],
    [
      'a missing format version',
      (d) => void delete (d.header as Record<string, unknown>).formatVersion,
      /format version undefined/,
    ],
    [
      'a config that is a list',
      (d) => void ((d.header as Record<string, unknown>).config = []),
      /config must be an object/,
    ],
    ['broken base64 input', (d) => void ((d.inputs as string[])[0] = 'A'), /base64/],
    ['a header that is a list', (d) => void (d.header = []), /header must be an object/],
  ])('rejects %s', (_name, change, message) => {
    const doc = base();
    change(doc);
    expect(() => decodeReplay(doc)).toThrow(message);
  });

  it('rejects documents that are not objects or have no kind', () => {
    for (const value of [undefined, 0, 'replay', true, {}, { kind: 'REPLAY' }]) {
      expect(() => decodeReplay(value)).toThrow(/not a replay document/);
    }
  });
});
