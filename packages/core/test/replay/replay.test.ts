/**
 * Tests for the replay module (plan M1-19): base64 and run-length coding, the recorder and the
 * playback round trip (every per-tick snapshot and every state hash reproduced, also through the
 * JSON encoding), desync detection on a tampered replay, the header (checkpoint start, god mode as
 * `assisted`, the build lock) and the decoder's validation.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB, loadContent, type ContentDb } from '../../src/data/index.js';
import { hashWorld } from '../../src/debug/index.js';
import { Action, commitPlayerInput, type InputSnapshot } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import {
  REPLAY_FORMAT_VERSION,
  REPLAY_HASH_INTERVAL,
  REPLAY_KIND,
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
  moduleInfo,
  packReplayInput,
  playReplay,
  type Replay,
  type ReplayHeader,
} from '../../src/replay/index.js';

/**
 * Reads a shipped content file.
 *
 * @param path - Path below `content/`.
 * @returns The parsed JSON.
 */
function shipped(path: string): unknown {
  return JSON.parse(
    readFileSync(new URL('../../../../content/' + path, import.meta.url), 'utf8'),
  ) as unknown;
}

/**
 * Content with the KESTREL, the `terrain-a` tileset and a scrolling test stage with three
 * checkpoints and a floor.
 *
 * @returns The DB.
 */
function stageDb(): ContentDb {
  const { db, issues } = loadContent([
    { path: 'player/kestrel.player.json', data: shipped('player/kestrel.player.json') },
    { path: 'tilesets/terrain-a.tileset.json', data: shipped('tilesets/terrain-a.tileset.json') },
    {
      path: 'stages/t.stage.json',
      data: {
        formatVersion: 1,
        kind: 'stage',
        id: 't',
        name: 'T',
        music: { stage: 'Stage', boss: 'Boss' },
        length: 6000,
        camera: [{ x: 0, speed: 1 }],
        checkpoints: [{ x: 0 }, { x: 600 }, { x: 1800 }],
        parallax: [],
        tilemap: {
          tileSize: 8,
          tileset: 'terrain-a',
          rowsTall: 25,
          generator: {
            type: 'heightfield',
            segments: [{ from: 0, to: 6384, floor: { base: 40, amp: 8, period: 64, seed: 1 } }],
          },
        },
        events: [{ x: 6000, type: 'end' }],
      },
    },
  ]);
  expect(issues).toEqual([]);
  return db;
}

/**
 * A scripted pilot: weaves up and down, taps PowerUp between ticks now and then (pressed but not
 * held — a latched tap) and holds Shot in bursts.
 *
 * @param tick - The tick about to run.
 * @returns `[held, latchedPressed]`.
 */
function pilot(tick: number): [number, number] {
  let held = (tick >> 5) % 3 === 0 ? Action.Up : (tick >> 5) % 3 === 1 ? Action.Down : 0;
  if ((tick >> 6) % 2 === 1) held |= Action.Right;
  if (tick % 90 < 30) held |= Action.Shot;
  const tap = tick % 77 === 5 ? Action.PowerUp : 0;
  return [held, tap];
}

/** A recorded session and what its game saw. */
interface Recording {
  /** The replay. */
  readonly replay: Replay;
  /** `[held, pressed, released]` of player 1 as the game saw them, per tick. */
  readonly seen: number[][];
  /** `hashWorld` after every tick. */
  readonly hashes: number[];
}

/**
 * Records `ticks` ticks of the pilot.
 *
 * @param config - Session config.
 * @param db - Content.
 * @param ticks - Ticks to record.
 * @param header - Header options.
 * @returns The recording.
 */
function record(
  config: GameConfig,
  db: ContentDb,
  ticks: number,
  header: { checkpoint?: number; assisted?: boolean } = {},
): Recording {
  const platform = createHeadlessPlatform();
  const replayHeader = createReplayHeader(config, { buildId: 'test-build', ...header });
  const recorder = createReplayRecorder(platform.input, replayHeader);
  const game = createReplayGame({ ...platform, input: recorder }, replayHeader, db);
  const seen: number[][] = [];
  const hashes: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const [held, tap] = pilot(i);
    commitPlayerInput(platform.snapshot.players[0], held, tap);
    game.step();
    recorder.check(game.world);
    const p = (game.state.input as InputSnapshot).players[0];
    seen.push([p.held, p.pressed, p.released]);
    hashes.push(hashWorld(game.world));
  }
  return { replay: recorder.finish(game.world), seen, hashes };
}

const FREE = resolveGameConfig({ seed: 5 });

describe('core/replay', () => {
  it('describes itself', () => {
    expect(moduleInfo.name).toBe('replay');
    expect(moduleInfo.status).toBe('implemented');
    expect([REPLAY_KIND, REPLAY_FORMAT_VERSION, REPLAY_HASH_INTERVAL]).toEqual(['replay', 1, 600]);
  });

  it('encodes base64 like RFC 4648 and decodes it back', () => {
    const vectors: Array<[string, string]> = [
      ['', ''],
      ['f', 'Zg=='],
      ['fo', 'Zm8='],
      ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg=='],
      ['fooba', 'Zm9vYmE='],
      ['foobar', 'Zm9vYmFy'],
    ];
    for (const [plain, coded] of vectors) {
      const bytes = Uint8Array.from(plain, (c) => c.charCodeAt(0));
      expect(encodeBase64(bytes)).toBe(coded);
      expect(Array.from(decodeBase64(coded))).toEqual(Array.from(bytes));
    }
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(Array.from(decodeBase64(encodeBase64(all)))).toEqual(Array.from(all));
    expect(encodeBase64(all)).toBe(Buffer.from(all).toString('base64'));
  });

  it.each(['abc', 'ab=c', 'a===', '=abc', 'ab!c', 'Zg=A'])(
    'rejects the malformed base64 %j',
    (text) => {
      expect(() => decodeBase64(text)).toThrow(RangeError);
    },
  );

  it('run-length encodes the input words (value, count varints) and decodes them exactly', () => {
    expect(encodeInputRuns(new Uint32Array([0, 0, 0, 5]))).toBe('AAMFAQ==');
    expect(Array.from(decodeInputRuns('AAMFAQ==', 4))).toEqual([0, 0, 0, 5]);
    expect(encodeInputRuns(new Uint32Array(0))).toBe('');
    expect(decodeInputRuns('', 0)).toEqual(new Uint32Array(0));
    // Big values (every bit of the 32-bit word) and long runs survive.
    const words = new Uint32Array(1000);
    for (let i = 0; i < words.length; i++) words[i] = i < 400 ? 0xffffffff : i < 900 ? 0x10000 : i;
    expect(decodeInputRuns(encodeInputRuns(words), 1000)).toEqual(words);
    // Only the first `ticks` words are encoded.
    expect(decodeInputRuns(encodeInputRuns(words, 10), 10)).toEqual(words.slice(0, 10));
  });

  it('rejects runs that do not add up, empty runs and broken varints', () => {
    const runs = encodeInputRuns(new Uint32Array([7, 7, 7]));
    expect(() => decodeInputRuns(runs, 2)).toThrow(/exceed/);
    expect(() => decodeInputRuns(runs, 4)).toThrow(/cover 3 of 4/);
    expect(() => decodeInputRuns(encodeBase64(Uint8Array.from([1, 0])), 0)).toThrow(/empty run/);
    expect(() => decodeInputRuns(encodeBase64(Uint8Array.from([0x81])), 1)).toThrow(/truncated/);
    const tooLong = Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0x1f, 1]);
    expect(() => decodeInputRuns(encodeBase64(tooLong), 1)).toThrow(/32 bits/);
    const sixBytes = Uint8Array.from([0x80, 0x80, 0x80, 0x80, 0x80, 0x01, 1]);
    expect(() => decodeInputRuns(encodeBase64(sixBytes), 1)).toThrow(/32 bits/);
  });

  it('packs held | pressed << 16 as an unsigned word', () => {
    expect(packReplayInput(Action.Up | Action.Shot, Action.Up)).toBe(
      (Action.Up | Action.Shot) + Action.Up * 65536,
    );
    expect(packReplayInput(0xffff, 0xffff)).toBe(0xffffffff);
    expect(packReplayInput(0x1ffff, 0x10000)).toBe(0xffff);
  });

  it('builds a header from the config (every sim-affecting field) and validates the checkpoint', () => {
    const config = resolveGameConfig({ seed: 9, loadout: 'full' });
    const header = createReplayHeader(config, { buildId: 'abc1234', assisted: true });
    expect(header).toEqual({
      formatVersion: REPLAY_FORMAT_VERSION,
      buildId: 'abc1234',
      seed: 9,
      config,
      stageId: null,
      checkpoint: -1,
      loadout: 'full',
      assisted: true,
      // M3-01: the assist flags (god mode here).
      assists: 1,
    });
    expect(Object.isFrozen(header)).toBe(true);
    expect(createReplayHeader(config).buildId).toBe('dev');
    expect(() => createReplayHeader(config, { checkpoint: -2 })).toThrow(RangeError);
    expect(() => createReplayHeader(config, { checkpoint: 0.5 })).toThrow(RangeError);
  });

  it('records a session and plays it back tick for tick: the same input, every hash reproduced', () => {
    const ticks = 2000;
    const run = record(FREE, EMPTY_CONTENT_DB, ticks);
    const { replay } = run;
    expect(replay.ticks).toBe(ticks);
    expect(replay.inputs).toHaveLength(2);
    expect(replay.hashes).toHaveLength(Math.floor(ticks / REPLAY_HASH_INTERVAL));
    expect(Array.from(replay.hashes)).toEqual([
      run.hashes[599],
      run.hashes[1199],
      run.hashes[1799],
    ]);
    expect(replay.finalHash).toBe(run.hashes[ticks - 1]);
    // Player 2 never moved: one run.
    expect(Array.from(decodeBase64(encodeInputRuns(replay.inputs[1])))).toEqual([0, 0xd0, 0x0f]);

    const playback = createPlayback(replay);
    const game = createReplayGame(
      { ...createHeadlessPlatform(), input: playback },
      replay.header,
      EMPTY_CONTENT_DB,
    );
    const seen: number[][] = [];
    const hashes: number[] = [];
    while (!playback.done) {
      game.step();
      playback.check(game.world);
      const p = (game.state.input as InputSnapshot).players[0];
      seen.push([p.held, p.pressed, p.released]);
      hashes.push(hashWorld(game.world));
    }
    expect(seen).toEqual(run.seen);
    expect(hashes).toEqual(run.hashes);
    expect(playback.report).toEqual({
      ok: true,
      checked: 4,
      desyncTick: -1,
      expectedHash: 0,
      actualHash: 0,
      finished: true,
      buildMatches: null,
    });
    // Latched taps (pressed without held) were recorded and replayed.
    expect(run.seen.some(([held, pressed]) => (pressed & ~held & Action.PowerUp) !== 0)).toBe(true);
  });

  it('survives the JSON encoding unchanged', () => {
    const { replay } = record(
      resolveGameConfig({ seed: 11, autofireInterval: 3 }),
      EMPTY_CONTENT_DB,
      1300,
    );
    const text = JSON.stringify(encodeReplay(replay));
    const decoded = decodeReplay(JSON.parse(text));
    expect(decoded.header).toEqual(replay.header);
    expect(decoded.ticks).toBe(replay.ticks);
    expect(decoded.inputs).toEqual(replay.inputs);
    expect(decoded.hashes).toEqual(replay.hashes);
    expect(decoded.finalHash).toBe(replay.finalHash);
    expect(decoded.hashInterval).toBe(REPLAY_HASH_INTERVAL);
    expect(playReplay(decoded, EMPTY_CONTENT_DB).report.ok).toBe(true);
    // Compact: a 1,300-tick session with a changing pilot stays well under 2 KB of input.
    expect(text.length).toBeLessThan(4000);
  });

  it('detects a desync on a tampered replay at the first hash after the change', () => {
    const { replay } = record(FREE, EMPTY_CONTENT_DB, 2000);
    const tampered: Replay = {
      ...replay,
      inputs: [replay.inputs[0].slice(), replay.inputs[1]],
    };
    tampered.inputs[0][700] ^= Action.Up | Action.Down;
    const { report } = playReplay(tampered, EMPTY_CONTENT_DB);
    expect(report.ok).toBe(false);
    expect(report.desyncTick).toBe(1200);
    expect(report.expectedHash).toBe(replay.hashes[1]);
    expect(report.actualHash).not.toBe(report.expectedHash);
    expect(report.finished).toBe(true);

    // A change after the last periodic hash is caught by the final hash.
    const late: Replay = { ...replay, inputs: [replay.inputs[0].slice(), replay.inputs[1]] };
    late.inputs[0][1990] = Action.Left;
    expect(playReplay(late, EMPTY_CONTENT_DB).report.desyncTick).toBe(2000);

    // A tampered hash is a desync too.
    const badHash: Replay = { ...replay, finalHash: (replay.finalHash + 1) >>> 0 };
    expect(playReplay(badHash, EMPTY_CONTENT_DB).report).toMatchObject({
      ok: false,
      desyncTick: 2000,
    });
  });

  it('reports whether the replay was recorded by the running build', () => {
    const { replay } = record(FREE, EMPTY_CONTENT_DB, 10);
    expect(
      playReplay(replay, EMPTY_CONTENT_DB, { buildId: 'test-build' }).report.buildMatches,
    ).toBe(true);
    expect(playReplay(replay, EMPTY_CONTENT_DB, { buildId: 'other' }).report.buildMatches).toBe(
      false,
    );
    expect(playReplay(replay, EMPTY_CONTENT_DB).report.buildMatches).toBeNull();
  });

  it('starts a replay at its checkpoint and with god mode when it is assisted', () => {
    const db = stageDb();
    const config = resolveGameConfig({ seed: 3, stage: 't' });
    const run = record(config, db, 900, { checkpoint: 1, assisted: true });
    expect(run.replay.header.checkpoint).toBe(1);
    expect(run.replay.header.assisted).toBe(true);
    const playback = createPlayback(run.replay);
    const game = createReplayGame(
      { ...createHeadlessPlatform(), input: playback },
      run.replay.header,
      db,
    );
    expect(game.world.camera.x).toBe(600);
    expect(game.debug.godMode).toBe(true);
    expect(playReplay(run.replay, db).report.ok).toBe(true);
    // Without the checkpoint the same input diverges.
    const shifted: Replay = {
      ...run.replay,
      header: { ...run.replay.header, checkpoint: -1 },
    };
    expect(playReplay(shifted, db).report.ok).toBe(false);
    // A checkpoint the stage does not have.
    const missing = { ...run.replay.header, checkpoint: 3 } as ReplayHeader;
    expect(() => createReplayGame(createHeadlessPlatform(), missing, db)).toThrow(RangeError);
    const free = createReplayHeader(FREE, { checkpoint: 0 });
    expect(() => createReplayGame(createHeadlessPlatform(), free, EMPTY_CONTENT_DB)).toThrow(
      /checkpoint 0/,
    );
  });

  it('grows its buffers when a session outlasts the preallocated capacity', () => {
    const platform = createHeadlessPlatform();
    const header = createReplayHeader(FREE);
    const recorder = createReplayRecorder(platform.input, header, { capacity: 7, hashInterval: 5 });
    const game = createReplayGame({ ...platform, input: recorder }, header, EMPTY_CONTENT_DB);
    for (let i = 0; i < 53; i++) {
      commitPlayerInput(platform.snapshot.players[0], i & 15);
      game.step();
      recorder.check(game.world);
      recorder.check(game.world); // a second check for the same tick changes nothing
    }
    expect(recorder.ticks).toBe(53);
    const replay = recorder.finish(game.world);
    expect(replay.hashes).toHaveLength(10);
    expect(Array.from(replay.inputs[0]).map((w) => w & 0xffff)).toEqual(
      Array.from({ length: 53 }, (_, i) => i & 15),
    );
    expect(playReplay(replay, EMPTY_CONTENT_DB).report).toMatchObject({ ok: true, checked: 11 });
  });

  it('refuses to finish a recording whose hashes were never taken', () => {
    const platform = createHeadlessPlatform();
    const header = createReplayHeader(FREE);
    const recorder = createReplayRecorder(platform.input, header, { hashInterval: 10 });
    const game = createReplayGame({ ...platform, input: recorder }, header, EMPTY_CONTENT_DB);
    for (let i = 0; i < 25; i++) game.step();
    expect(() => recorder.finish(game.world)).toThrow(/2 state hash/);
    expect(() => createReplayRecorder(platform.input, header, { capacity: 0 })).toThrow(RangeError);
    expect(() => createReplayRecorder(platform.input, header, { hashInterval: 0.5 })).toThrow(
      RangeError,
    );
  });

  it('feeds idle input once the replay is over and stops checking', () => {
    const { replay } = record(FREE, EMPTY_CONTENT_DB, 30);
    const playback = createPlayback(replay);
    for (let i = 0; i < 30; i++) playback.poll();
    expect(playback.done).toBe(true);
    const after = playback.poll();
    expect(after.players.map((p) => [p.held, p.pressed])).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(playback.ticks).toBe(31);
  });
});

describe('core/replay decodeReplay validation', () => {
  const { replay } = record(FREE, EMPTY_CONTENT_DB, 700);
  const good = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(encodeReplay(replay))) as Record<string, unknown>;

  it('ignores extra top-level fields (a golden file’s expectations)', () => {
    expect(decodeReplay({ ...good(), expected: { status: 'playing' } }).ticks).toBe(700);
  });

  it('fills a config field an older replay lacks with its default', () => {
    const doc = good();
    delete (doc.header as { config: Record<string, unknown> }).config.pickupMagnet;
    expect(decodeReplay(doc).header.config.pickupMagnet).toBe(true);
  });

  it.each<[string, (doc: Record<string, unknown>) => void, RegExp]>([
    ['another kind', (d) => void (d.kind = 'stage'), /not a replay/],
    ['a missing header', (d) => void (d.header = null), /header must be an object/],
    [
      'another format version',
      (d) => void ((d.header as Record<string, unknown>).formatVersion = 2),
      /format version 2/,
    ],
    [
      'a non-string build id',
      (d) => void ((d.header as Record<string, unknown>).buildId = 1),
      /buildId/,
    ],
    [
      'a missing config',
      (d) => void ((d.header as Record<string, unknown>).config = 'x'),
      /config must be an object/,
    ],
    [
      'an invalid config',
      (d) => void ((d.header as { config: Record<string, unknown> }).config.tickRate = 0),
      /tickRate/,
    ],
    [
      'a seed that disagrees',
      (d) => void ((d.header as Record<string, unknown>).seed = 6),
      /seed disagrees/,
    ],
    [
      'a stage that disagrees',
      (d) => void ((d.header as Record<string, unknown>).stageId = 'x'),
      /stageId disagrees/,
    ],
    [
      'a loadout that disagrees',
      (d) => void ((d.header as Record<string, unknown>).loadout = 'full'),
      /loadout disagrees/,
    ],
    [
      'a non-boolean assisted flag',
      (d) => void ((d.header as Record<string, unknown>).assisted = 1),
      /assisted/,
    ],
    [
      'a bad checkpoint',
      (d) => void ((d.header as Record<string, unknown>).checkpoint = -2),
      /checkpoint/,
    ],
    ['negative ticks', (d) => void (d.ticks = -1), /ticks/],
    ['a bad hash interval', (d) => void (d.hashInterval = 0), /hash interval/],
    ['one player', (d) => void (d.inputs = [(d.inputs as string[])[0]]), /2 players/],
    ['a non-string input', (d) => void ((d.inputs as unknown[])[1] = 5), /inputs\[1\]/],
    ['input that is too short', (d) => void (d.ticks = 701), /cover 700 of 701/],
    ['a missing hash', (d) => void (d.hashes = []), /1 values/],
    ['a bad hash', (d) => void ((d.hashes as unknown[])[0] = -1), /hashes\[0\]/],
    ['a fractional final hash', (d) => void (d.finalHash = 1.5), /finalHash/],
  ])('rejects %s', (_name, change, message) => {
    const doc = good();
    change(doc);
    expect(() => decodeReplay(doc)).toThrow(message);
  });

  it('rejects non-objects', () => {
    expect(() => decodeReplay(null)).toThrow(RangeError);
    expect(() => decodeReplay([])).toThrow(RangeError);
  });
});
