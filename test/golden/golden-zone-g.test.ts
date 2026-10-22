/**
 * Zone G's golden outcome checks (plan M2-13; split out of `golden.test.ts` by R5-P.P3): the
 * committed `zone-g-god`, `zone-g-bot` and `zone-g-boss` files and zone G's hidden bonus stage,
 * the cache — PRISM LABYRINTH clears with god mode (the design §15 god run: its PRISM SENTINEL
 * captain seen), and the no-god and skip recordings carry the identity of their scenario: what
 * they recorded — status, deaths, seconds — is REPORTED, not promised (the w11-G7 ruling). The
 * file plays back (every state hash) stays in `golden.test.ts`; this file reads only zone G's
 * own goldens (`glimmer-cache-god` is a zone G stage).
 *
 * R5-07.S6 retargeted the outcomes to the design (decision R5-D2's 4–6-minute bot window, §15's
 * death windows, §16's sentinel and the P14 skip at the stage's last warning at 20,550). The
 * same wave's R5-07.S6b (the w11-G7 ruling, option (b), zone E's landed shape since `fe4cdae3`)
 * moved the no-god case back to the recorded-replay law: §12's 4–6-minute band governs the GOD
 * run (case 1, untouched), the bot scenario asserts its replay identity and reports its outcome
 * honestly — the §15 windows stay on the record below as the design law, and the gallery-mouth
 * death the RV/O1 measured on both seeds is the owner's taste row (wave 12). Options (a)
 * content-tuning the mouth volley and (c) seed-changing were rejected: heavier than the
 * law-side error this case carried. The old v1 recordings fail `golden.test.ts`'s hash identity
 * until the zone's LAND re-blesses them.
 *
 * Skipped while re-blessing (`SHMUP_GOLDEN_UPDATE=1`): `golden.test.ts` is rewriting the files.
 */
import { describe, expect, it } from 'vitest';
import { BONUS_CAPSULE_SCORE, BossRole, BossState } from '@shmup/core';
import { GOLDEN_UPDATE_ENV, playGolden, readGolden } from './golden.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

describe.skipIf(updating)('golden replays — zone G (M2-13)', () => {
  it('covers zone G of M2-13: cleared in 4–6 minutes, its captain seen, its boss shot down, the cache', () => {
    const { file, replay } = readGolden('zone-g-god');
    expect(replay.header.stageId).toBe('zone-g');
    expect(replay.header.assisted).toBe(true);
    expect(file.expected).toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    // The R5-07 stage (design §2's 4.0–6.0-minute window, the bot run measured 330.1 s at S6):
    // the re-recorded golden must clear 4 minutes on the 21,300-px route. Red until the zone's
    // LAND re-blesses `zone-g-god`.
    expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(240);
    expect(file.expected.ticks / 60).toBeLessThanOrEqual(360);
    // Design §15: the god run FIRES the captain event — PRISM SENTINEL fought at 8,040 (§7)
    // before the MONARCH. (The v1 recording has no sentinel: red until the LAND re-record.)
    const captains = new Set<string>();
    playGolden(replay, undefined, (world) => {
      for (const slot of world.bosses.slots) {
        if (slot.state === BossState.Fight && slot.role === BossRole.Captain) {
          captains.add(world.content.enemies[slot.specIndex].id);
        }
      }
    });
    expect(captains.has('prism-sentinel'), 'zone-g-god captain').toBe(true);
    // Zone G's hidden bonus stage: the bonus capsules collected, no boss (the ported run does not
    // reach the 1UP).
    const cache = readGolden('glimmer-cache-god');
    const { world, outcome } = playGolden(cache.replay);
    expect(world.stage?.stage.type).toBe('bonus');
    expect(outcome).toMatchObject({ status: 'stageClear', bossDefeated: false, deathTicks: [] });
    // The v2 layout (R5-10): god mode costs no life and the cache holds exactly one 1UP (the
    // release-audit law), so the run leaves with 3 lives plus its extends plus 0 or 1. Whether
    // the bot's lane catches the 1UP at x 4,620 is not a layout law — its drop is pinned by
    // content-zone-g's presence check. The route is 5,400 px at a constant 1.5 px/tick — 3,600
    // ticks plus the ramp — so the clear records inside 59–67 s; 24 carriers' capsules carry the
    // score past five of them.
    const p1 = world.scoring.board.scores[0];
    const lifeDelta = outcome.lives - 3 - p1.extendsEarned;
    expect(lifeDelta).toBeGreaterThanOrEqual(0);
    expect(lifeDelta).toBeLessThanOrEqual(1);
    expect(outcome.score).toBeGreaterThan(5 * BONUS_CAPSULE_SCORE);
    const cacheSeconds = cache.file.expected.ticks / 60;
    expect(cacheSeconds).toBeGreaterThanOrEqual(59);
    expect(cacheSeconds).toBeLessThanOrEqual(67);
  });

  it('covers zone G without god mode (M2-13 tests): the recorded replay, reported — and the skip to FACET MONARCH', () => {
    // The landed law for a no-god golden is zone E's shape (`golden-zone-e` since `fe4cdae3`,
    // the w11-G7 ruling option (b)): the replay-hash IDENTITY is the assertion — that check
    // rides in `golden.test.ts` with every state hash — while the recorded status, deaths and
    // seconds are REPORTED as the file has them. Design §12's 4–6-minute band is the GOD run's
    // promise (case 1, untouched); an asserted clear here promised what no design number does.
    const bot = readGolden('zone-g-bot');
    expect(bot.replay.header.stageId).toBe('zone-g');
    expect(bot.replay.header.assisted).toBe(false);
    expect(bot.replay.header.config.deathPenalty).toBe('classic');
    // Design §15's death-window law stays on the record (NOT asserted — see the ruling): the
    // design expects the bot's deaths inside the §2 slide (camera x 8,400–9,600), the deep
    // gallery and refraction hall (9,600–13,800) and the refraction run (16,800–19,200), at
    // most two of them. The measured truth, both seeds: the live playtest bank dies at
    // terrain@x 5,153 (the gallery mouth, 145.1 s gameOver, 3 deaths) and the blessed
    // re-record takes its first death at tick 4,548 (camera x ≈ 5,458 — the same mouth volley,
    // gameOver 9,358 t). The mouth sits OUTSIDE every window; the gallery's difficulty is the
    // owner's taste row (w11-SW-G duty 5, wave 12, not blocking). The windows return as
    // assertions only with an owner re-tune of §5, never by weakening this file.
    expect(['stageClear', 'gameOver']).toContain(bot.file.expected.status);
    expect(Array.isArray(bot.file.expected.deathTicks)).toBe(true);
    console.info(
      `[golden] zone-g-bot recorded: ${String(bot.file.expected.status)} after ` +
        `${String(bot.file.expected.ticks / 60)} s, ` +
        `${String(bot.file.expected.deathTicks.length)} death(s) at ` +
        `[${String(bot.file.expected.deathTicks.join('/'))}], bossDefeated ` +
        String(bot.file.expected.bossDefeated),
    );
    // The stage skip to FACET MONARCH: the scenario's identity is its header (the skip to the
    // boss, the full loadout, the Arcade penalty) and its hash identity rides in
    // `golden.test.ts` like every file's; a skip stays a fraction of the zone's own god-mode
    // clear (R5-P.P3: on `bc8e05d` the pair block divided by zone F's Arcade run instead).
    // What it recorded is reported, not promised. The S6 pass measured the live skip lines —
    // first camera x ∈ [20,400, 20,550) under the P14 last-warning law (the sentinel at 8,040
    // carries no warning), phases [0, 1, 2], the camera on the gallery row y 168 at clear —
    // and they stay on the record here; `zone-g-runtime.test.ts` still asserts the skip's
    // fight on the branch, so the law is kept, just not chained to a stale recording.
    const skip = readGolden('zone-g-boss');
    expect(skip.replay.header.stageId).toBe('zone-g');
    expect(skip.replay.header.config, 'zone-g-boss').toMatchObject({
      stageSkip: 'boss',
      loadout: 'full',
      deathPenalty: 'arcade',
    });
    expect(['stageClear', 'gameOver']).toContain(skip.file.expected.status);
    expect(skip.file.expected.ticks, 'zone-g-boss').toBeLessThan(
      readGolden('zone-g-god').file.expected.ticks / 4,
    );
    console.info(
      `[golden] zone-g-boss recorded: ${String(skip.file.expected.status)} after ` +
        `${String(skip.file.expected.ticks)} ticks, ` +
        `${String(skip.file.expected.deathTicks.length)} death(s), bossDefeated ` +
        String(skip.file.expected.bossDefeated),
    );
  });
});
