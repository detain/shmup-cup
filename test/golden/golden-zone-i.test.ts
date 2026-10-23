/**
 * Zone I's golden outcome checks (plan M2-14; split out of `golden.test.ts` by R5-P.P3): the
 * committed `zone-i-god`, `zone-i-boss` and `zone-i-escape` files — ABYSSAL THRONE clears with
 * god mode and THE HOLLOW KING falls, the skip fights the ABYSS ARK in both phases and the
 * king in his three, and a weaving pilot without power-ups lets the ARK escape after its time
 * limit (the ending flag THE FLAGSHIP SLIPS AWAY is chosen by). The file plays back (every
 * state hash) stays in `golden.test.ts`; this file reads only zone I's own goldens.
 *
 * Skipped while re-blessing (`SHMUP_GOLDEN_UPDATE=1`): `golden.test.ts` is rewriting the files.
 */
import { describe, expect, it } from 'vitest';
import { BossState, EndingFlag } from '@shmup/core';
import { shippedContent } from '../playtest/harness.js';
import { follow, GOLDEN_UPDATE_ENV, playGolden, readGolden } from './golden.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

describe.skipIf(updating)('golden replays — zone I (M2-14)', () => {
  it('covers zone I of M2-14: cleared in 4–7 minutes, the ARK and THE HOLLOW KING shot down', () => {
    const { file, replay } = readGolden('zone-i-god');
    expect(replay.header.stageId).toBe('zone-i');
    expect(replay.header.assisted).toBe(true);
    expect(file.expected).toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    // The R5-09 stage (design §12's window, the ceiling widened to 420 s by decision
    // R5-D13): the re-recorded golden must clear 4 minutes on the 20,400-px route. Red
    // until the zone's LAND re-blesses `zone-i-god`.
    expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(240);
    expect(file.expected.ticks / 60).toBeLessThanOrEqual(420);
    // The ARK did not escape: its final blast revealed THE HOLLOW KING, who fell too.
    const throne = playGolden(readGolden('zone-i-god').replay).world;
    expect(throne.endingFlags).toBe(0);
    const king = throne.bosses.slots.find(
      (b) => throne.content.enemies[b.specIndex]?.id === 'hollow-king',
    );
    expect(king?.state).toBe(BossState.Dead);
    expect(king?.escaped).toBe(false);
  });

  it('covers zone I without god mode (M2-14 tests): the skip to the ARK, the escape', () => {
    // The skip to the ABYSS ARK: the raid in both phases, then the king in his three.
    const i = follow('zone-i-boss');
    expect(i.outcome).toMatchObject({ status: 'stageClear', bossDefeated: true, deathTicks: [] });
    // Skipped to the WARNING at x 19,650 (design §2, R5-09.S5b — the stage skip keeps the
    // warning target, R5-P.P14): the recorded v2 skip lands ~214 px before it (the lead
    // ported from v1's 143 px); the window is the calm key's 360 px before the warning.
    expect(i.first).toBeGreaterThan(19_290);
    expect(i.first).toBeLessThan(19_650); // red until the zone's LAND re-blesses `zone-i-boss`
    expect([...i.phases].sort()).toEqual([
      'abyss-ark:0',
      'abyss-ark:1',
      'hollow-king:0',
      'hollow-king:1',
      'hollow-king:2',
    ]);
    expect(i.last.get('abyss-ark')).toEqual({ state: BossState.Dead, escaped: false });
    expect(i.last.get('hollow-king')).toEqual({ state: BossState.Dead, escaped: false });
    expect(i.world.endingFlags).toBe(0);
    // The skip takes far less than the whole zone (R5-P.P3: the pair block compared it with zone
    // H's skip — a per-zone file compares with its own god-mode clear instead).
    expect(i.outcome.ticks).toBeLessThan(readGolden('zone-i-god').file.expected.ticks);
    // The ARK outlasts a weaving pilot without power-ups: it escapes after its time limit — the
    // ending flag the campaign's THE FLAGSHIP SLIPS AWAY is chosen by —, the king never appears,
    // and the zone still clears.
    const escape = follow('zone-i-escape');
    expect(readGolden('zone-i-escape').replay.header.assisted).toBe(true);
    expect(escape.outcome).toMatchObject({
      status: 'stageClear',
      bossDefeated: false,
      deathTicks: [],
    });
    expect(escape.last.get('abyss-ark')).toEqual({ state: BossState.Dead, escaped: true });
    expect(escape.last.has('hollow-king')).toBe(false);
    expect(escape.world.endingFlags & EndingFlag.BossEscaped).toBe(EndingFlag.BossEscaped);
    expect(escape.world.stage?.following).toBeNull();
    // It fought the ARK for its whole 90-s time limit.
    const db = shippedContent();
    const ark = db.enemies[db.enemyIndex.get('abyss-ark') ?? -1];
    expect(ark.boss?.timeLimit).toBe(5400);
    expect(escape.outcome.ticks).toBeGreaterThan(5400);
  });
});
