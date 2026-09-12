/**
 * Replays and the M2-01 difficulty fields (`core/replay`, plan M2-01 "a replay header records every
 * resolved value; format version unchanged: a missing key resolves to the preset's"):
 *
 * - a header records `rankBase`, `rankGrowth`, `extendFirst`, `extendEvery`, `continues` and
 *   `bulletSpeedMul` as resolved for its preset, and an encode → JSON → decode round trip keeps them;
 * - a header written before M2-01 (none of those keys) decodes to its preset's values, while the
 *   keys it did record (lives, death penalty, aim directions) keep their recorded values;
 * - recorded preset fields win over the preset on decode; a bad one is refused;
 * - a session recorded on each preset plays back with every hash equal.
 */
import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_PRESETS,
  difficultyOverrides,
  resolveGameConfig,
  type DifficultyPreset,
} from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { Action, commitPlayerInput } from '../../src/input/index.js';
import { createHeadlessPlatform } from '../../src/platform/index.js';
import {
  createReplayGame,
  createReplayHeader,
  createReplayRecorder,
  decodeReplay,
  encodeReplay,
  playReplay,
  type Replay,
} from '../../src/replay/index.js';

/** The config keys M2-01 added. */
const M2_01_KEYS = [
  'rankBase',
  'rankGrowth',
  'extendFirst',
  'extendEvery',
  'continues',
  'bulletSpeedMul',
] as const;

/**
 * Records a short free-flight session.
 *
 * @param difficulty - The preset.
 * @param ticks - Ticks to record.
 * @returns The replay.
 */
function record(difficulty: DifficultyPreset, ticks = 300): Replay {
  const platform = createHeadlessPlatform();
  const header = createReplayHeader(resolveGameConfig({ seed: 12, difficulty, loadout: 'full' }), {
    buildId: 'test-build',
  });
  const recorder = createReplayRecorder(platform.input, header);
  const game = createReplayGame({ ...platform, input: recorder }, header, EMPTY_CONTENT_DB);
  for (let t = 0; t < ticks; t++) {
    const held = ((t >> 4) & 1) === 0 ? Action.Up | Action.Shot : Action.Down | Action.Right;
    commitPlayerInput(platform.snapshot.players[0], held);
    game.step();
    recorder.check(game.world);
  }
  return recorder.finish(game.world);
}

/**
 * An encoded replay as plain, editable JSON.
 *
 * @param replay - The replay.
 * @returns Its JSON document.
 */
function json(replay: Replay): { header: { config: Record<string, unknown> } } {
  return JSON.parse(JSON.stringify(encodeReplay(replay))) as {
    header: { config: Record<string, unknown> };
  };
}

describe('core/replay difficulty fields (M2-01)', () => {
  it('records the resolved preset fields and keeps them through JSON', () => {
    for (const preset of DIFFICULTY_PRESETS) {
      const replay = record(preset, 30);
      const rules = difficultyOverrides(preset);
      for (const key of M2_01_KEYS) expect(replay.header.config[key], key).toBe(rules[key]);
      const decoded = decodeReplay(json(replay));
      expect(decoded.header.config).toEqual(replay.header.config);
    }
  });

  it('decodes a header written before M2-01 to its preset`s values', () => {
    const doc = json(record('hard', 30));
    const config = doc.header.config;
    for (const key of M2_01_KEYS) delete config[key];
    // What an M1 header held for these: the old defaults, recorded explicitly.
    config.startingLives = 4;
    config.deathPenalty = 'classic';
    const decoded = decodeReplay(doc).header.config;
    expect(decoded).toMatchObject({
      difficulty: 'hard',
      rankBase: 4,
      rankGrowth: 1,
      extendFirst: 20_000,
      extendEvery: 70_000,
      continues: 2,
      bulletSpeedMul: 1,
      startingLives: 4,
      deathPenalty: 'classic',
    });
    const easy = json(record('easy', 30));
    for (const key of M2_01_KEYS) delete easy.header.config[key];
    expect(decodeReplay(easy).header.config).toMatchObject({
      rankGrowth: 0.5,
      bulletSpeedMul: 0.85,
    });
  });

  it('lets recorded preset fields win and refuses a bad one', () => {
    const doc = json(record('normal', 30));
    doc.header.config.rankBase = 9;
    doc.header.config.continues = 0;
    expect(decodeReplay(doc).header.config).toMatchObject({ rankBase: 9, continues: 0 });
    doc.header.config.bulletSpeedMul = 0;
    expect(() => decodeReplay(doc)).toThrow(/bulletSpeedMul/);
    doc.header.config.bulletSpeedMul = 1;
    doc.header.config.difficulty = 'nightmare';
    expect(() => decodeReplay(doc)).toThrow(/difficulty/);
  });

  it.each(DIFFICULTY_PRESETS.map((p) => [p]))('plays a %s session back in lockstep', (preset) => {
    const replay = record(preset);
    const { report, game } = playReplay(decodeReplay(json(replay)), EMPTY_CONTENT_DB);
    expect(report.ok).toBe(true);
    expect(report.desyncTick).toBe(-1);
    // A full loadout from the start: power 12 (Easy's growth 0.5 halves it), capped at 16.
    const base = difficultyOverrides(preset).rankBase ?? 0;
    expect(game.world.rank).toBe(Math.min(16, base + (preset === 'easy' ? 6 : 12)));
  });
});
