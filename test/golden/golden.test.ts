/**
 * The golden-replay test (plan M1-19, part of `pnpm test`): every committed
 * `test/golden/<scenario>.replay.json` — zone A (and, since M2-07 / M2-08 / M2-09 / M2-10, the
 * `gimmick-range`, `raster-range`, `captain-range`, `raid-range`, `twin-range`, `bonus-range` and
 * `bonus-vault` dev stages; since M2-11 the real zones B and C and zone B's bonus stage; since
 * M2-12 zones D and E, since M2-13 zones F and G and zone G's bonus stage, since M2-14 the final
 * zones H and I, with and without god mode)
 * played by the 4-way bot and recorded with `core/replay` (the 4-way bot, or a careless weaving
 * pilot for the deaths) — plays back into a
 * fresh session with **every state hash** (one per 600 ticks and
 * the final one) and the recorded outcome (status, ticks, score, lives, death ticks, boss kill)
 * reproduced. A failure means the simulation changed: fix the change, or — when it is intended —
 * re-bless with `pnpm golden:update` and say why in the commit message.
 *
 * With `SHMUP_GOLDEN_UPDATE=1` (what `pnpm golden:update` sets) the test first re-records every
 * scenario from the bot and rewrites its file, then checks the new files the same way. Since
 * R5-P.P3 the script's `--only <ids>` filter (passed through as `SHMUP_GOLDEN_ONLY`) restricts the
 * re-recording to the listed stages — every other file is still verified by this run.
 *
 * The per-zone outcome checks of the real zones A–I live in `golden-zone-<x>.test.ts` (R5-P.P3);
 * the dev stages' blocks and the extra modes of M3-01 stay here.
 */
import { describe, expect, it } from 'vitest';
import {
  BLACK_HOLE_PULL_TICKS,
  BONUS_CAPSULE_SCORE,
  BonusEntrance,
  BossState,
  ENGINE_SPRITES,
  EndingFlag,
  KNOWN_SCRIPT_IDS,
  REPLAY_HASH_INTERVAL,
  SLOWDOWN_THRESHOLD,
  loadContent,
} from '@shmup/core';
import { shippedContent } from '../playtest/harness.js';
import { readContentFiles } from '../../vite.shared.js';
import {
  GOLDEN_BUILD_ID,
  GOLDEN_SCENARIOS,
  GOLDEN_UPDATE_ENV,
  goldenStageSelected,
  playGolden,
  readGolden,
  recordGolden,
  writeGolden,
} from './golden.js';

/** Whether this run re-blesses the files. */
const updating = process.env[GOLDEN_UPDATE_ENV] === '1';

describe('golden replays (zone A and the dev stages, playtest bots)', () => {
  it.each(GOLDEN_SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
    '%s reproduces every state hash and its outcome',
    (_name, scenario) => {
      if (updating && goldenStageSelected(scenario.stageId)) {
        const { replay, outcome } = recordGolden(scenario);
        writeGolden(scenario, replay, outcome);
        console.info(
          `[golden] re-blessed ${scenario.name}: ${outcome.status} after ${outcome.ticks} ticks, ` +
            `${outcome.deathTicks.length} death(s), score ${outcome.score}`,
        );
      }
      const { file, replay } = readGolden(scenario.name);
      // The file is the scenario it claims to be.
      expect(file.description).toBe(scenario.description);
      expect(replay.header.buildId).toBe(GOLDEN_BUILD_ID);
      expect(replay.header.stageId).toBe(scenario.stageId);
      expect(replay.header.assisted).toBe(scenario.godMode);
      for (const [key, value] of Object.entries(scenario.config)) {
        expect(replay.header.config[key as keyof typeof replay.header.config], key).toEqual(value);
      }
      expect(replay.hashInterval).toBe(REPLAY_HASH_INTERVAL);
      expect(replay.ticks).toBe(file.expected.ticks);

      const { report, outcome } = playGolden(replay);
      expect(
        report,
        `desync at tick ${report.desyncTick}: the simulation changed — fix it, or re-bless with ` +
          '`pnpm golden:update` and say why in the commit message',
      ).toMatchObject({ ok: true, finished: true, buildMatches: true });
      expect(report.checked).toBe(replay.hashes.length + 1);
      expect(outcome).toEqual(file.expected);
    },
  );

  it('covers the stage gimmicks of M2-07: both branches, broken bricks, blocks, pulls, rollbacks', () => {
    /**
     * Plays a gimmick-range golden back and reads what its World went through.
     *
     * @param name - Scenario name.
     * @returns The outcome, the low branch's flag, the trigger mask and the terrain counts.
     */
    const play = (name: string) => {
      const { outcome, world } = playGolden(readGolden(name).replay);
      const stage = world.stage;
      const terrain = world.gimmicks.destructible;
      if (stage === null || terrain === null) throw new Error('the gimmick range has no stage');
      const low = 1 << stage.stage.flagNames.indexOf('took-low');
      return {
        outcome,
        low: (stage.flags & low) !== 0,
        fired: stage.triggersFired,
        destroyed: terrain.destroyed,
        resets: terrain.resets,
      };
    };
    // The 4-way bot: the whole range — on the ported world its line-up fires the region trigger,
    // so this run now proves the LOW branch (the weave pilot below proves it too; the high branch
    // is pinned on the deaths run further below).
    const god = play('gimmick-range-god');
    expect(god.outcome).toMatchObject({ status: 'stageClear', deathTicks: [] });
    expect([god.low, god.fired]).toEqual([true, 1]);
    // M3-02b: under the remote model the v1 bot flew the high branch without touching the terrain;
    // the ported run breaks 3 bricks on its way through the low branch. The many bricks are still
    // covered by the weaver scenario below (≥ 5 broken) and the rollbacks of `gimmick-range-deaths`.
    expect(god.destroyed).toBe(3);
    // The weaving pilot dives through the trigger: the low branch, bricks broken all along.
    const weaver = play('gimmick-range-weaver');
    expect(weaver.outcome).toMatchObject({ status: 'stageClear', deathTicks: [] });
    expect([weaver.low, weaver.fired]).toEqual([true, 1]);
    expect(weaver.destroyed).toBeGreaterThanOrEqual(5);
    // Without god mode under the Arcade penalty: the checkpoint restarts roll the terrain back.
    const deaths = play('gimmick-range-deaths');
    expect(deaths.outcome.status).toBe('gameOver');
    expect(deaths.outcome.deathTicks).toHaveLength(3);
    expect([deaths.low, deaths.fired]).toEqual([false, 0]); // the high branch, left by the god run
    expect(deaths.resets).toBeGreaterThanOrEqual(2);
  });

  it('covers the raster range of M2-08: its effects never reach the simulation', () => {
    const { file, replay } = readGolden('raster-range-god');
    expect(file.expected).toMatchObject({ status: 'stageClear', deathTicks: [] });
    // The stage has raster effects and a palette cycle: its World hands them to the renderer …
    const { world } = playGolden(replay);
    expect(world.view.effects?.raster).toHaveLength(3);
    expect(world.view.effects?.cycles).toHaveLength(1);
    // … and the same inputs on the stage without them reproduce every hash and the outcome.
    const files = readContentFiles().map((content) => {
      if (content.path !== 'stages/raster-range.stage.json') return content;
      const data = { ...(content.data as Record<string, unknown>) };
      delete data.raster;
      delete data.cycles;
      return { ...content, data };
    });
    const { db, issues } = loadContent(files, {
      knownScripts: KNOWN_SCRIPT_IDS,
      extraSprites: ENGINE_SPRITES,
    });
    expect(issues).toEqual([]);
    const bare = db.stages.find((stage) => stage.id === 'raster-range');
    expect([bare?.raster, bare?.cycles]).toEqual([[], []]);
    const plain = playGolden(replay, db);
    expect(plain.world.view.effects).toBeNull();
    expect(plain.report).toMatchObject({ ok: true, finished: true, buildMatches: true });
    expect(plain.report.checked).toBe(replay.hashes.length + 1);
    expect(plain.outcome).toEqual(file.expected);
  });

  it('covers the advanced bosses of M2-09: captains, the raid and its heart, an escape, the twins', () => {
    const db = shippedContent();
    /**
     * Plays an M2-09 golden back and reads its boss slots.
     *
     * @param name - Scenario name.
     * @returns The outcome, the final World and each slot's boss id, state and flags.
     */
    const play = (name: string) => {
      const { outcome, world } = playGolden(readGolden(name).replay);
      const slots = world.bosses.slots.map((b) => ({
        id: b.specIndex >= 0 ? db.enemies[b.specIndex].id : '',
        state: b.state,
        escaped: b.escaped,
        enraged: b.enraged,
      }));
      return { outcome, world, slots };
    };
    // Captains ride the scrolling camera: the stage ran to its end, no ending flag.
    const captains = play('captain-range-god');
    expect(captains.outcome).toMatchObject({ status: 'stageClear', deathTicks: [] });
    expect(captains.outcome.bossDefeated).toBe(true); // a captain fell (the circler, in slot 1)
    expect(captains.world.camera.x).toBe(captains.world.stage?.stage.length);
    // Only captains ever took a slot. On the ported world the stage runs to its end while slot 0's
    // captain (the launcher) still fights — v1's recording shot the ram down in slot 0; here the
    // ram never held a slot at the end, the circler died in slot 1 and the crab fights in slot 2.
    const ids = captains.slots.map((s) => s.id).filter((id) => id !== '');
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id.startsWith('captain-')).toBe(true);
    expect(captains.slots[0].state).toBe(BossState.Fight);
    expect(captains.slots[1].state).toBe(BossState.Dead);
    expect(captains.world.endingFlags).toBe(0);
    // The raid shot down: the heart revealed in slot 1 and shot down too; the camera handed back.
    const raid = play('raid-range-god');
    expect(raid.outcome).toMatchObject({ status: 'stageClear', bossDefeated: true });
    expect(raid.slots.slice(0, 2)).toEqual([
      { id: 'raid-leviathan', state: BossState.Dead, escaped: false, enraged: false },
      { id: 'raid-heart', state: BossState.Dead, escaped: false, enraged: false },
    ]);
    expect([raid.world.endingFlags, raid.world.stage?.following]).toEqual([0, null]);
    // Without power-ups the battleship escapes after its time limit: the ending flag, no heart.
    const escape = play('raid-range-escape');
    expect(escape.outcome).toMatchObject({ status: 'stageClear', bossDefeated: false });
    expect(escape.slots[0]).toMatchObject({ id: 'raid-leviathan', escaped: true });
    expect(escape.slots.some((s) => s.id === 'raid-heart')).toBe(false);
    expect(escape.world.endingFlags & EndingFlag.BossEscaped).toBe(EndingFlag.BossEscaped);
    expect(escape.world.stage?.following).toBeNull();
    // The twins: both shot down, the survivor had enraged.
    const twins = play('twin-range-god');
    expect(twins.outcome).toMatchObject({ status: 'stageClear', bossDefeated: true });
    expect(twins.slots.slice(0, 2).map((s) => [s.id, s.state, s.escaped])).toEqual([
      ['twin-ember', BossState.Dead, false],
      ['twin-frost', BossState.Dead, false],
    ]);
    expect(twins.slots.slice(0, 2).filter((s) => s.enraged)).toHaveLength(1);
    expect(twins.world.endingFlags).toBe(0);
  });

  it('covers the hidden bonus stages of M2-10: two entrances opened, the vault`s items collected', () => {
    const db = shippedContent();
    const vaultIndex = db.stageIndex.get('bonus-vault');
    /**
     * Plays an M2-10 golden back.
     *
     * @param name - Scenario name.
     * @returns The outcome and the final World.
     */
    const play = (name: string) => playGolden(readGolden(name).replay);
    // The full loadout shoots all three ground turrets of the window: the ground entrance opens.
    const god = play('bonus-range-god');
    expect(god.outcome).toMatchObject({ status: 'stageClear', deathTicks: [], bossDefeated: true });
    expect(god.world.enemies.stats).toMatchObject({ groundSpawned: 3, groundKilled: 3 });
    const opened = god.world.bonus;
    expect(opened.kind[opened.entered]).toBe(BonusEntrance.Ground);
    expect(opened.enteredStage()).toBe(vaultIndex);
    expect(opened.enteredTick).toBeGreaterThan(0);
    expect(opened.locked).toBe(false);
    // Without power-ups the turrets survive; the thousands digit at the last window opens it.
    const digit = play('bonus-range-digit');
    expect(digit.outcome).toMatchObject({ status: 'stageClear', deathTicks: [] });
    expect(digit.world.enemies.stats.groundKilled).toBeLessThan(3);
    expect(digit.world.bonus.kind[digit.world.bonus.entered]).toBe(BonusEntrance.Digit);
    // Both played on to the boss: the World never leaves by itself (the scene flow warps).
    expect(god.world.stage?.stage.id).toBe('bonus-range');
    // The vault: no boss, its carriers' capsules and the 1UP collected (lives beyond the extends).
    const vault = play('bonus-vault-god');
    expect(vault.outcome).toMatchObject({
      status: 'stageClear',
      deathTicks: [],
      bossDefeated: false,
    });
    expect(vault.world.stage?.stage.type).toBe('bonus');
    const p1 = vault.world.scoring.board.scores[0];
    expect(vault.outcome.lives - 3 - p1.extendsEarned).toBeGreaterThanOrEqual(1);
    // 19 kills of carriers worth at most 500 each: the rest of the score is bonus capsules.
    expect(vault.world.enemies.stats.killed).toBeGreaterThan(10);
    expect(vault.outcome.score).toBeGreaterThan(10 * BONUS_CAPSULE_SCORE);
    expect(vault.world.bonus.count).toBe(0);
  });
});

describe('golden replays of the extra modes (M3-01)', () => {
  it('loop 2: the remix, faster bullets and revenge bullets, cleared with god mode and without', () => {
    const god = readGolden('zone-a-loop2-god');
    expect(god.replay.header.config.loop).toBe(2);
    expect(god.file.expected).toMatchObject({ status: 'stageClear', bossDefeated: true });
    // The same seed on loop 1 plays a different run (the remix, the rank, the bullets).
    const loop1 = readGolden('zone-a-god');
    expect(god.file.expected.score).not.toBe(loop1.file.expected.score);
    const boss = readGolden('zone-a-loop2-boss');
    expect(boss.replay.header).toMatchObject({ assisted: false, assists: 0 });
    expect(boss.replay.header.config).toMatchObject({ loop: 2, stageSkip: 'boss' });
    expect(boss.file.expected.bossDefeated || boss.file.expected.status === 'gameOver').toBe(true);
  });

  it('the caravan clock ends the World at time up; the Extra Edit and option recovery play back', () => {
    const caravan = readGolden('zone-a-caravan');
    expect(caravan.replay.header.config.timeLimit).toBe(3600);
    expect(caravan.file.expected.status).toBe('stageClear');
    expect(caravan.file.expected.ticks).toBeLessThanOrEqual(3600 + 1);
    const { world } = playGolden(caravan.replay);
    expect([world.timeUp, world.timeLeft]).toEqual([true, 0]);
    const extra = readGolden('zone-a-extra');
    expect(extra.replay.header.config.weaponEdit).toMatchObject({ missile: 'missile.hawkWind' });
    expect(extra.file.expected).toMatchObject({ status: 'stageClear', bossDefeated: true });
    const recovery = readGolden('zone-a-recovery');
    expect(recovery.replay.header.config.optionRecovery).toBe(true);
    expect(recovery.file.expected.deathTicks.length).toBeGreaterThanOrEqual(1);
  });

  it('the M3-02 extras really run: vortices thrown, bullets grazed, ticks skipped', () => {
    const extras = readGolden('zone-a-extras');
    expect(extras.replay.header.config).toMatchObject({
      shipId: 'manta',
      powerUpMode: 'direct',
      slowdown: true,
      graze: true,
      deathBomb: 8,
      blackHole: true,
    });
    let vortexTicks = 0;
    let maxLoad = 0;
    let skipped = 0;
    let bolts = 0;
    const { outcome, world } = playGolden(extras.replay, undefined, (w) => {
      if (w.blackholes.count > 0) vortexTicks++;
      if (w.slowLoad > maxLoad) maxLoad = w.slowLoad;
      if (w.slowSkip) skipped++;
      for (const hole of w.blackholes.holes) {
        if (hole.active && hole.age > BLACK_HOLE_PULL_TICKS) bolts++;
      }
    });
    // The run covers each extra: a vortex was open, it reached its burst, bullets were grazed.
    expect(vortexTicks).toBeGreaterThan(0);
    expect(bolts).toBeGreaterThan(0);
    expect(world.grazes).toBeGreaterThan(0);
    // The slowdown counted the load every tick — and zone A never reaches the threshold, so a
    // normal run of it never slows down (the tuning of `SLOWDOWN_THRESHOLD`, D18: responsiveness
    // first). `world-extras.test.ts` covers the skipping itself.
    expect(maxLoad).toBeGreaterThan(0);
    expect(maxLoad).toBeLessThanOrEqual(SLOWDOWN_THRESHOLD);
    expect(skipped).toBe(0);
    expect(outcome).toEqual(extras.file.expected);
    expect(outcome.status).toBe('stageClear');
  });

  it('flags the assists in the replay headers: god mode, the invincibility assist', () => {
    expect(readGolden('zone-a-loop2-god').replay.header).toMatchObject({
      assisted: true,
      assists: 1,
    });
    const invincible = readGolden('zone-a-invincible');
    expect(invincible.replay.header).toMatchObject({ assisted: false, assists: 2 });
    expect(invincible.replay.header.config.invincible).toBe(true);
    // A pilot that never dodges, hit after hit ignored: no death (an extend on top).
    expect(invincible.file.expected.deathTicks).toEqual([]);
    expect(invincible.file.expected.lives).toBeGreaterThanOrEqual(
      invincible.replay.header.config.startingLives,
    );
  });
});
