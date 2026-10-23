/**
 * Zone H's golden outcome checks (plan M2-14; split out of `golden.test.ts` by R5-P.P3): the
 * committed `zone-h-god`, `zone-h-boss`, `zone-h-arcade` and `zone-h-deaths` files — IRON
 * CITADEL clears with god mode and IRON SOVEREIGN falls in its last phase, the skip (R5-P.P14)
 * lands at the sovereign's WARNING and fights it through its four phases past the parade, the
 * Arcade run reports the outcome its recording carries (R5-08.FIX3 — the fall under
 * rank-scaled fire or the clean old record, never a promised clear), and the weaving pilot
 * dies at the outer walls and restarts at the start. The file plays back (every state hash)
 * stays in `golden.test.ts`; this file reads only zone H's own goldens.
 *
 * Skipped while re-blessing (`SHMUP_GOLDEN_UPDATE=1`): `golden.test.ts` is rewriting the files.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOSS_SKIP_LEAD, BossState } from '@shmup/core';
import { follow, GOLDEN_UPDATE_ENV, playGolden, readGolden } from './golden.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

describe.skipIf(updating)('golden replays — zone H (M2-14)', () => {
  it('covers zone H of M2-14: cleared in 4 to 7 minutes, IRON SOVEREIGN through its four phases', () => {
    const { file, replay } = readGolden('zone-h-god');
    expect(replay.header.stageId).toBe('zone-h');
    expect(replay.header.assisted).toBe(true);
    expect(file.expected).toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(240); // §17's 4 to 6 minutes…
    expect(file.expected.ticks / 60).toBeLessThanOrEqual(420); // …; 420 s by R5-D13
    // IRON SOVEREIGN died in its last phase; the parade's four captains went before it.
    const citadel = playGolden(readGolden('zone-h-god').replay).world;
    const sovereign = citadel.bosses.slots.find(
      (b) => citadel.content.enemies[b.specIndex]?.id === 'iron-sovereign',
    );
    expect(sovereign?.state).toBe(BossState.Dead);
    expect(sovereign?.phase).toBe(3);
    expect(sovereign?.escaped).toBe(false);
  });

  it('covers zone H without god mode (M2-14 tests): the skip to the stage boss, Arcade rank, restarts', () => {
    // Since R5-P.P14 the skip lands at the stage's OWN boss: BOSS_SKIP_LEAD px before IRON
    // SOVEREIGN's WARNING — the four echoes of the parade never fight in this recording (the
    // full runs zone-h-god, -arcade and -deaths cover the parade). The sovereign falls through
    // all four phases; an escaped echo or skipped captain sets no ending flag here anyway.
    const stage = JSON.parse(
      readFileSync(new URL('../../content/stages/zone-h.stage.json', import.meta.url), 'utf8'),
    ) as { events: { type: string; x: number }[] };
    const warnings = stage.events.filter((e) => e.type === 'warning');
    const sovereignWarning = warnings[warnings.length - 1];
    expect(warnings).toHaveLength(1); // the skip's target is the sovereign's own WARNING
    const land = (sovereignWarning?.x ?? 0) - BOSS_SKIP_LEAD;
    const h = follow('zone-h-boss');
    expect(readGolden('zone-h-boss').replay.header.config).toMatchObject({
      stageSkip: 'boss',
      loadout: 'full',
      deathPenalty: 'arcade',
    });
    expect(h.outcome).toMatchObject({ status: 'stageClear', bossDefeated: true, deathTicks: [] });
    expect(h.first).toBeGreaterThanOrEqual(land); // the camera starts at the skip's landing
    expect(h.first).toBeLessThan(land + 4); // … one or two slow scroll ticks into the recording
    for (const echo of ['echo-bulwark', 'echo-maw', 'echo-bastion', 'echo-regent']) {
      expect(h.phases.has(echo + ':0'), echo).toBe(false); // the parade is not in this run
      expect(h.last.has(echo), echo).toBe(false);
    }
    expect([...h.phases].filter((p) => p.startsWith('iron-sovereign:')).sort()).toEqual([
      'iron-sovereign:0',
      'iron-sovereign:1',
      'iron-sovereign:2',
      'iron-sovereign:3',
    ]);
    expect(h.world.endingFlags).toBe(0);
    // The skip takes far less than the whole zone.
    expect(h.outcome.ticks).toBeLessThan(readGolden('zone-h-god').file.expected.ticks);
    // IRON CITADEL at Arcade difficulty — the recorded replay's own story (R5-08.FIX3,
    // adjudication RT-H B-2). S6 authored this arm with the god run's promise: stageClear,
    // no deaths, §17's 240–360 s band. But §17's window is the GOD scenario's (kept there),
    // and Arcade rank scales the fire: the H weld's blessed re-record falls to it in the
    // parade — gameOver at 5,632 t (93.9 s), deathTicks [4113, 5539], score 3,130, no boss.
    // That is design-legal per §11 — whether the bot survives Arcade rank is the owner's
    // taste row, not this file's promise. The v1-era recording this branch still carries
    // (stageClear at 15,895 t, 264.9 s) stands until the `--only zone-h` re-bless. The law
    // below is the landed zone-G/F twin: assert the scenario's identity and whatever
    // outcome was recorded — never a re-pinned promise.
    const arcade = readGolden('zone-h-arcade');
    expect(arcade.replay.header).toMatchObject({ assisted: false });
    expect(arcade.replay.header.stageId).toBe('zone-h');
    expect(arcade.replay.header.config.difficulty).toBe('arcade');
    expect(arcade.replay.header.config.deathPenalty).toBe('arcade');
    expect(['stageClear', 'gameOver']).toContain(arcade.file.expected.status);
    expect(Array.isArray(arcade.file.expected.deathTicks)).toBe(true);
    // The recorded shape hangs together: a fall leaves no lives and no dead boss.
    if (arcade.file.expected.status === 'gameOver') {
      expect(arcade.file.expected.lives).toBe(0);
      expect(arcade.file.expected.bossDefeated).toBe(false);
    } else {
      expect(arcade.file.expected.bossDefeated).toBe(true);
    }
    // The deaths law is a COUNT, never a tick list (zone F's softened rule at SW-F): at
    // most two lives spent — the clean v1-era record spent zero, the blessed parade fall
    // spends two. A third would change the run's story for the design, not for a re-record.
    expect(arcade.file.expected.deathTicks.length).toBeLessThanOrEqual(2);
    console.info(
      `[golden] zone-h-arcade recorded: ${arcade.file.expected.status} after ` +
        `${String(arcade.file.expected.ticks / 60)} s, ` +
        `${String(arcade.file.expected.deathTicks.length)} death(s) at ` +
        `[${arcade.file.expected.deathTicks.join(', ')}], bossDefeated ` +
        `${String(arcade.file.expected.bossDefeated)}`,
    );
    // The weaving pilot on Easy under the Arcade penalty: every death at the outer walls sends
    // it back to the start (it never reaches the piston hall's checkpoint), until the game is over.
    const deaths = readGolden('zone-h-deaths');
    expect(deaths.replay.header.config).toMatchObject({
      deathPenalty: 'arcade',
      difficulty: 'easy',
    });
    expect(deaths.file.expected).toMatchObject({
      status: 'gameOver',
      lives: 0,
      bossDefeated: false,
    });
    expect(deaths.file.expected.deathTicks.length).toBeGreaterThanOrEqual(4);
    const deathTicks = new Set(deaths.file.expected.deathTicks);
    const died: number[] = [];
    const back: number[] = [];
    let alive = true;
    playGolden(deaths.replay, undefined, (world) => {
      const ship = world.players[0];
      if (deathTicks.has(world.tick - 1)) died.push(world.camera.x);
      if (!alive && ship.state === 'alive') back.push(world.camera.x);
      alive = ship.state === 'alive';
    });
    expect(died).toHaveLength(deathTicks.size);
    expect(back).toHaveLength(died.length); // the start's fly-in, then one per restart but the last
    for (const x of died) expect(x).toBeLessThan(3300); // every death short of the gate's §2
    // checkpoint (3,300): the pilot never passes the outer wall (R5-08.S6, remastered geometry)
    for (const x of back) expect(x).toBeLessThan(60);
  });
});
