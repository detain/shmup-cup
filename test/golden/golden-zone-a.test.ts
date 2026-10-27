/**
 * Zone A's golden outcome checks (plan M1-18 … M2-06; split out of `golden.test.ts` by
 * R5-P.P3): the committed `zone-a-*.replay.json` files prove the whole-stage coverage — the
 * clear with god mode, the Arcade run, the deaths to game over, the boss skip, both ships and
 * the co-op games. The file plays back (every state hash) stays in `golden.test.ts`, and so do
 * the extra modes of M3-01; this file reads only zone A's own goldens.
 *
 * Skipped while re-blessing (`SHMUP_GOLDEN_UPDATE=1`): `golden.test.ts` is rewriting the files.
 */
import { describe, expect, it } from 'vitest';
import { GOLDEN_UPDATE_ENV, readGolden } from './golden.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

describe.skipIf(updating)('golden replays — zone A (M1-18 … M2-06)', () => {
  it('covers the whole stage, deaths to game over, the boss under the Arcade penalty, both ships and co-op', () => {
    const god = readGolden('zone-a-god').file.expected;
    expect(god.status).toBe('stageClear');
    expect(god.bossDefeated).toBe(true);
    expect(god.deathTicks).toEqual([]);
    // On the ported world the Arcade run no longer survives: game over — but the eased vertical
    // (w15-MOVE) holds the grace-tapping route together far enough to REACH and kill the boss
    // before the last life falls: three deaths, the boss down, still no clear (v1 cleared, the
    // pre-grace ease never even met the boss).
    const arcade = readGolden('zone-a-arcade').file.expected;
    expect(arcade.status).toBe('gameOver');
    expect(arcade.lives).toBe(0);
    expect(arcade.bossDefeated).toBe(true);
    // The Arcade preset's two lives (`content/rules/difficulty.rules.json`), both lost — the
    // tick positions measure the run, the count is what the content prescribes (R5-01.S6).
    expect(arcade.deathTicks).toHaveLength(3);
    const deaths = readGolden('zone-a-deaths').file.expected;
    expect(deaths.status).toBe('gameOver');
    expect(deaths.deathTicks).toHaveLength(3);
    expect(deaths.lives).toBe(0);
    const boss = readGolden('zone-a-boss');
    expect(boss.replay.header.config.deathPenalty).toBe('arcade');
    expect(boss.replay.header.config.stageSkip).toBe('boss');
    // The skip starts right before the WARNING: the run is short.
    expect(boss.file.expected.ticks).toBeLessThan(god.ticks);
    // Both ships (M2-05): the MANTA clears the stage and its boss in Direct mode.
    for (const name of ['zone-a-manta', 'zone-a-manta-boss']) {
      const manta = readGolden(name);
      expect(manta.replay.header.config).toMatchObject({ shipId: 'manta', powerUpMode: 'direct' });
      expect(manta.file.expected.status).toBe('stageClear');
      expect(manta.file.expected.bossDefeated).toBe(true);
    }
    // And dies (M2-05 tests): the Direct-mode Arcade penalty, checkpoint restarts, game over.
    const mantaDeaths = readGolden('zone-a-manta-deaths');
    expect(mantaDeaths.replay.header.config).toMatchObject({
      shipId: 'manta',
      powerUpMode: 'direct',
      deathPenalty: 'arcade',
    });
    expect(mantaDeaths.file.expected.status).toBe('gameOver');
    expect(mantaDeaths.file.expected.deathTicks).toHaveLength(3);
    expect(mantaDeaths.file.expected.lives).toBe(0);
    // Co-op (M2-06): player 2 drops in and scores; a weaving player 2 continues with START.
    const coop = readGolden('zone-a-coop');
    expect(coop.replay.header.config.coop).toBe(true);
    expect(coop.file.expected.status).toBe('stageClear');
    expect(coop.file.expected.p2?.score).toBeGreaterThan(0);
    expect(readGolden('zone-a-god').file.expected.p2).toBeUndefined();
    const coopDeaths = readGolden('zone-a-coop-deaths').file.expected;
    expect(coopDeaths.p2?.continues).toBeGreaterThan(0);
    expect(coopDeaths.p2?.deathTicks.length).toBeGreaterThan(3);
    // w15-MOVE: player 1's dodges ride the eased vertical now — it falls once, late, before the
    // end (pre-ramp it played on clean). The scenario's subject — p2's many deaths and continue —
    // is the two assertions above, both unchanged.
    // w15-C LAND re-pin: the capsule-dominant zone-a table moves this route's equipment stream,
    // so the one late player-1 fall lands 32 ticks earlier — 13022 → 12990 (2026-10-26,
    // measured off the re-recorded replay; the fall itself, its lateness and p2's story hold).
    expect(coopDeaths.deathTicks).toEqual([12990]);
  });
});
