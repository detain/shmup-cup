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
import { v1x } from '../../packages/core/test/helpers/v1-port.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

describe.skipIf(updating)('golden replays — zone I (M2-14)', () => {
  it('covers zone I of M2-14: cleared in 3–6 minutes, the ARK and THE HOLLOW KING shot down', () => {
    const { file, replay } = readGolden('zone-i-god');
    expect(replay.header.stageId).toBe('zone-i');
    expect(replay.header.assisted).toBe(true);
    expect(file.expected).toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
    expect(file.expected.ticks / 60).toBeLessThanOrEqual(360);
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
    expect(i.first).toBeGreaterThan(v1x(8800)); // skipped to the WARNING at v1x(9,000) — the ported
    // bounds (R2-02's ×1.5); the recorded skip lands at 13,357.125
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
