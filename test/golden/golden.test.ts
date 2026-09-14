/**
 * The golden-replay test (plan M1-19, part of `pnpm test`): every committed
 * `test/golden/<scenario>.replay.json` — zone A (and, since M2-07 / M2-08 / M2-09 / M2-10, the
 * `gimmick-range`, `raster-range`, `captain-range`, `raid-range`, `twin-range`, `bonus-range` and
 * `bonus-vault` dev stages; since M2-11 the real zones B and C and zone B's bonus stage)
 * played by the 4-way bot and recorded with `core/replay` (the 4-way bot, or a careless weaving
 * pilot for the deaths) — plays back into a
 * fresh session with **every state hash** (one per 600 ticks and
 * the final one) and the recorded outcome (status, ticks, score, lives, death ticks, boss kill)
 * reproduced. A failure means the simulation changed: fix the change, or — when it is intended —
 * re-bless with `pnpm golden:update` and say why in the commit message.
 *
 * With `SHMUP_GOLDEN_UPDATE=1` (what `pnpm golden:update` sets) the test first re-records every
 * scenario from the bot and rewrites its file, then checks the new files the same way.
 */
import { describe, expect, it } from 'vitest';
import {
  BONUS_CAPSULE_SCORE,
  BonusEntrance,
  BossState,
  ENGINE_SPRITES,
  EndingFlag,
  KNOWN_SCRIPT_IDS,
  REPLAY_HASH_INTERVAL,
  loadContent,
} from '@shmup/core';
import { shippedContent } from '../playtest/harness.js';
import { readContentFiles } from '../../vite.shared.js';
import {
  GOLDEN_BUILD_ID,
  GOLDEN_SCENARIOS,
  GOLDEN_UPDATE_ENV,
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
      if (updating) {
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

  it('covers the whole stage, deaths to game over, the boss under the Arcade penalty, both ships and co-op', () => {
    const god = readGolden('zone-a-god').file.expected;
    expect(god.status).toBe('stageClear');
    expect(god.bossDefeated).toBe(true);
    expect(god.deathTicks).toEqual([]);
    expect(readGolden('zone-a-arcade').file.expected.status).toBe('stageClear');
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
    expect(coopDeaths.deathTicks).toEqual([]); // player 1 played on
  });

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
    // The 4-way bot: the whole range, the region trigger left alone (the high branch).
    const god = play('gimmick-range-god');
    expect(god.outcome).toMatchObject({ status: 'stageClear', deathTicks: [] });
    expect([god.low, god.fired]).toEqual([false, 0]);
    expect(god.destroyed).toBeGreaterThanOrEqual(1);
    // The weaving pilot dives through the trigger: the low branch, bricks broken all along.
    const weaver = play('gimmick-range-weaver');
    expect(weaver.outcome).toMatchObject({ status: 'stageClear', deathTicks: [] });
    expect([weaver.low, weaver.fired]).toEqual([true, 1]);
    expect(weaver.destroyed).toBeGreaterThanOrEqual(5);
    // Without god mode under the Arcade penalty: the checkpoint restarts roll the terrain back.
    const deaths = play('gimmick-range-deaths');
    expect(deaths.outcome.status).toBe('gameOver');
    expect(deaths.outcome.deathTicks).toHaveLength(3);
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
    expect(captains.outcome.bossDefeated).toBe(true); // the ram, in slot 0
    expect(captains.world.camera.x).toBe(captains.world.stage?.stage.length);
    // Only captains ever took a slot; the first one (the ram, slot 0) was shot down.
    const ids = captains.slots.map((s) => s.id).filter((id) => id !== '');
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id.startsWith('captain-')).toBe(true);
    expect(captains.slots[0].state).toBe(BossState.Dead);
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

  it('covers the real zones B and C of M2-11: both cleared in 3–6 minutes, their bosses shot down, the grotto', () => {
    for (const [name, stage] of [
      ['zone-b-god', 'zone-b'],
      ['zone-c-god', 'zone-c'],
    ] as const) {
      const { file, replay } = readGolden(name);
      expect(replay.header.stageId).toBe(stage);
      expect(file.expected).toMatchObject({
        status: 'stageClear',
        bossDefeated: true,
        deathTicks: [],
      });
      expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
      expect(file.expected.ticks / 60).toBeLessThanOrEqual(360);
    }
    // Zone B's hidden bonus stage: the bonus capsules and the 1UP collected, no boss.
    const grotto = readGolden('brine-grotto-god');
    const { world, outcome } = playGolden(grotto.replay);
    expect(world.stage?.stage.type).toBe('bonus');
    expect(outcome).toMatchObject({ status: 'stageClear', bossDefeated: false, deathTicks: [] });
    const p1 = world.scoring.board.scores[0];
    expect(outcome.lives - 3 - p1.extendsEarned).toBeGreaterThanOrEqual(1);
    expect(outcome.score).toBeGreaterThan(5 * BONUS_CAPSULE_SCORE);
  });

  it('covers zones B and C without god mode (M2-11 tests): deaths and restarts, a clear with a death', () => {
    // BRINE NEBULA under the Arcade penalty: every death restarts at a checkpoint, then game over.
    const deaths = readGolden('zone-b-deaths');
    expect(deaths.replay.header.assisted).toBe(false);
    expect(deaths.replay.header.config.deathPenalty).toBe('arcade');
    expect(deaths.file.expected).toMatchObject({
      status: 'gameOver',
      lives: 0,
      bossDefeated: false,
    });
    expect(deaths.file.expected.deathTicks).toHaveLength(3);
    // DUNE EXPANSE with the 4-way bot and no god mode: it dies at least once, respawns in place
    // (the Classic penalty) and still shoots SANDGRAVE WIDOW down in 3–6 minutes.
    const bot = readGolden('zone-c-bot');
    expect(bot.replay.header.assisted).toBe(false);
    expect(bot.replay.header.config.deathPenalty).toBe('classic');
    expect(bot.file.expected).toMatchObject({ status: 'stageClear', bossDefeated: true });
    expect(bot.file.expected.deathTicks.length).toBeGreaterThanOrEqual(1);
    expect(bot.file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
    expect(bot.file.expected.ticks / 60).toBeLessThanOrEqual(360);
  });
});
