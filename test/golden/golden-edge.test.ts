/**
 * Guards around the golden replays (plan M1-19), next to `golden.test.ts`:
 *
 * - every committed file is exactly what `pnpm golden:update` writes for its decoded content (so a
 *   hand edit or a stale format is caught), and the folder holds no file without a scenario;
 * - re-recording the short boss scenario from its bot writes a **byte-identical** file — the
 *   re-bless of an unchanged simulation changes nothing;
 * - a tampered golden replay (a burst of other input, a changed seed) desyncs at the first hash
 *   after the change: desync detection on real zone A content;
 * - the expectations are consistent (death ticks ordered and within the run) and
 *   `scripts/golden-update.mjs` runs this folder with the variable `golden.test.ts` reads.
 *
 * Skipped while re-blessing (`SHMUP_GOLDEN_UPDATE=1`): `golden.test.ts` is rewriting the files.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Action, REPLAY_HASH_INTERVAL, decodeReplay, encodeReplay, type Replay } from '@shmup/core';
import { describe, expect, it } from 'vitest';
import {
  GOLDEN_SCENARIOS,
  GOLDEN_UPDATE_ENV,
  formatGolden,
  goldenPath,
  playGolden,
  readGolden,
  recordGolden,
} from './golden.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

/** The golden folder. */
const folder = fileURLToPath(new URL('.', import.meta.url));

describe.skipIf(updating)('golden replays — file guards', () => {
  it('has one file per scenario and no file without one', () => {
    const names = GOLDEN_SCENARIOS.map((scenario) => scenario.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^zone-a-[a-z0-9-]+$/);
    const files = readdirSync(folder)
      .filter((file) => file.endsWith('.replay.json'))
      .map((file) => file.replace(/\.replay\.json$/, ''))
      .sort();
    expect(files).toEqual([...names].sort());
  });

  it.each(GOLDEN_SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
    '%s is exactly what golden:update writes for its content',
    (name, scenario) => {
      const text = readFileSync(goldenPath(name), 'utf8');
      const { file, replay } = readGolden(name);
      expect(formatGolden(scenario, replay, file.expected)).toBe(text);
      expect(text.endsWith('}\n')).toBe(true);
    },
  );

  it.each(GOLDEN_SCENARIOS.map((scenario) => [scenario.name] as const))(
    '%s has consistent expectations',
    (name) => {
      const { file, replay } = readGolden(name);
      const { expected } = file;
      expect(expected.ticks).toBe(replay.ticks);
      expect(replay.hashes).toHaveLength(Math.floor(replay.ticks / REPLAY_HASH_INTERVAL));
      expect([...expected.deathTicks].sort((a, b) => a - b)).toEqual(expected.deathTicks);
      for (const tick of expected.deathTicks) {
        expect(tick).toBeGreaterThanOrEqual(0);
        expect(tick).toBeLessThan(replay.ticks);
      }
      expect(expected.lives).toBeGreaterThanOrEqual(0);
      expect(expected.score).toBeGreaterThanOrEqual(0);
      // One-player runs: the bots only drive player 1; player 2 never pressed anything. Co-op runs
      // (M2-06): player 2's first input is its START at the scenario's join tick.
      const scenario = GOLDEN_SCENARIOS.find((candidate) => candidate.name === name);
      const p2 = scenario?.p2;
      const words2 = Array.from(replay.inputs[1]);
      if (p2 === undefined) {
        expect(words2.every((word) => word === 0)).toBe(true);
        expect(expected.p2).toBeUndefined();
      } else {
        expect(replay.header.config.coop).toBe(true);
        expect(words2.findIndex((word) => word !== 0)).toBe(p2.joinTick);
        expect(words2[p2.joinTick]).toBe(Action.Pause | (Action.Pause << 16));
        expect(expected.p2).toBeDefined();
        expect([...(expected.p2?.deathTicks ?? [])].sort((a, b) => a - b)).toEqual(
          expected.p2?.deathTicks,
        );
      }
      // Every recorded word is a held | pressed << 16 pair of real actions.
      const known = 0xffff;
      for (const words of replay.inputs) {
        for (const word of words) expect(word & ~(known | (known << 16))).toBe(0);
      }
    },
  );

  it('re-records the boss scenario byte for byte (a re-bless of an unchanged sim is a no-op)', () => {
    const scenario = GOLDEN_SCENARIOS.find((candidate) => candidate.name === 'zone-a-boss');
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    const { replay, outcome } = recordGolden(scenario);
    expect(formatGolden(scenario, replay, outcome)).toBe(
      readFileSync(goldenPath(scenario.name), 'utf8'),
    );
  });
});

describe.skipIf(updating)('golden replays — desync detection on zone A', () => {
  const { replay } = readGolden('zone-a-boss');

  it('the untouched file plays back cleanly', () => {
    expect(playGolden(replay).report).toMatchObject({ ok: true, finished: true });
  });

  it('a burst of other input before the first hash desyncs at that hash', () => {
    expect(replay.ticks).toBeGreaterThan(REPLAY_HASH_INTERVAL);
    const inputs = [replay.inputs[0].slice(), replay.inputs[1]];
    // A second of the bot's input replaced by a steady climb from tick 100 on.
    for (let tick = 100; tick < 160; tick++) inputs[0][tick] = Action.Up;
    const tampered: Replay = { ...replay, inputs };
    const { report } = playGolden(tampered);
    expect(report.ok).toBe(false);
    expect(report.desyncTick).toBe(REPLAY_HASH_INTERVAL);
    expect(report.expectedHash).toBe(replay.hashes[0]);
    expect(report.actualHash).not.toBe(replay.hashes[0]);
    expect(report.finished).toBe(true);
  });

  it('a change after the last periodic hash is caught by the final hash', () => {
    const inputs = [replay.inputs[0].slice(), replay.inputs[1]];
    const last = replay.hashes.length * REPLAY_HASH_INTERVAL;
    for (let tick = last + 5; tick < replay.ticks; tick++) inputs[0][tick] = Action.Down;
    const { report } = playGolden({ ...replay, inputs });
    expect(report).toMatchObject({ ok: false, desyncTick: replay.ticks, finished: true });
  });

  it('another seed in the header desyncs (the file is locked to its whole config)', () => {
    const doc = encodeReplay(replay);
    const reseeded = decodeReplay({
      ...doc,
      header: {
        ...doc.header,
        seed: doc.header.seed + 1,
        config: { ...doc.header.config, seed: doc.header.seed + 1 },
      },
    });
    expect(playGolden(reseeded).report.ok).toBe(false);
  });
});

describe('golden replays — the re-bless script', () => {
  it('runs this folder in the integration project with the variable golden.test.ts reads', () => {
    const script = readFileSync(
      new URL('../../scripts/golden-update.mjs', import.meta.url),
      'utf8',
    );
    expect(script).toContain(`${GOLDEN_UPDATE_ENV}: '1'`);
    expect(script).toMatch(/\[vitest, 'run', '--project', 'integration', 'test\/golden'\]/);
    expect(script).toContain('process.exit(result.status ?? 1)');
    // The files are generated: Prettier leaves them alone.
    const ignore = readFileSync(new URL('../../.prettierignore', import.meta.url), 'utf8');
    expect(ignore.split('\n')).toContain('test/golden/*.replay.json');
  });
});
