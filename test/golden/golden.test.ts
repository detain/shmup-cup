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

  it('covers the real zones D and E of M2-12: both cleared in 3–6 minutes, their bosses shot down', () => {
    for (const [name, stage] of [
      ['zone-d-god', 'zone-d'],
      ['zone-e-god', 'zone-e'],
    ] as const) {
      const { file, replay } = readGolden(name);
      expect(replay.header.stageId).toBe(stage);
      expect(replay.header.assisted).toBe(true);
      expect(file.expected).toMatchObject({
        status: 'stageClear',
        bossDefeated: true,
        deathTicks: [],
      });
      expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
      expect(file.expected.ticks / 60).toBeLessThanOrEqual(360);
    }
    // MAGMA DEEP's run went down into the caves: its World ends with the camera 200 px down.
    const { world } = playGolden(readGolden('zone-d-god').replay);
    expect(world.camera.y).toBe(200);
    expect(world.stage?.stage.id).toBe('zone-d');
  });

  it('covers the final zones H and I of M2-14: both cleared in 3–6 minutes, their finales shot down', () => {
    for (const [name, stage] of [
      ['zone-h-god', 'zone-h'],
      ['zone-i-god', 'zone-i'],
    ] as const) {
      const { file, replay } = readGolden(name);
      expect(replay.header.stageId).toBe(stage);
      expect(replay.header.assisted).toBe(true);
      expect(file.expected).toMatchObject({
        status: 'stageClear',
        bossDefeated: true,
        deathTicks: [],
      });
      expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
      expect(file.expected.ticks / 60).toBeLessThanOrEqual(360);
    }
    // IRON SOVEREIGN died in its last phase; the parade's four captains went before it.
    const citadel = playGolden(readGolden('zone-h-god').replay).world;
    const sovereign = citadel.bosses.slots.find(
      (b) => citadel.content.enemies[b.specIndex]?.id === 'iron-sovereign',
    );
    expect(sovereign?.state).toBe(BossState.Dead);
    expect(sovereign?.phase).toBe(3);
    expect(sovereign?.escaped).toBe(false);
    // The ARK did not escape: its final blast revealed THE HOLLOW KING, who fell too.
    const throne = playGolden(readGolden('zone-i-god').replay).world;
    expect(throne.endingFlags).toBe(0);
    const king = throne.bosses.slots.find(
      (b) => throne.content.enemies[b.specIndex]?.id === 'hollow-king',
    );
    expect(king?.state).toBe(BossState.Dead);
    expect(king?.escaped).toBe(false);
  });

  it('covers zones H and I without god mode (M2-14 tests): the skips, Arcade rank, restarts, the escape', () => {
    const db = shippedContent();
    /**
     * Plays a golden back and follows its bosses: every `<id>:<phase>` fought, each boss's last
     * state, and the leftmost camera x.
     *
     * @param name - Scenario name.
     * @returns The outcome, the final World, the phases fought, the bosses' last states and the
     *   leftmost camera x.
     */
    const follow = (name: string) => {
      const phases = new Set<string>();
      const last = new Map<string, { state: number; escaped: boolean }>();
      let first = Number.POSITIVE_INFINITY;
      const { outcome, world } = playGolden(readGolden(name).replay, undefined, (w) => {
        first = Math.min(first, w.camera.x);
        for (const b of w.bosses.slots) {
          if (b.specIndex < 0 || b.state === BossState.None) continue;
          const id = db.enemies[b.specIndex].id;
          if (b.state === BossState.Fight) phases.add(id + ':' + String(b.phase));
          last.set(id, { state: b.state, escaped: b.escaped });
        }
      });
      return { outcome, world, phases, last, first };
    };
    // The skip into IRON CITADEL lands before the parade's first echo (the skip stops before a
    // `boss` event too): the four echoes of earlier bosses, each shot down before its time limit
    // (captains: no ending flag), the core run, then IRON SOVEREIGN through all four phases.
    const h = follow('zone-h-boss');
    expect(readGolden('zone-h-boss').replay.header.config).toMatchObject({
      stageSkip: 'boss',
      loadout: 'full',
      deathPenalty: 'arcade',
    });
    expect(h.outcome).toMatchObject({ status: 'stageClear', bossDefeated: true, deathTicks: [] });
    expect(h.first).toBeGreaterThan(4400); // the parade hangar's checkpoint …
    expect(h.first).toBeLessThan(4520); // … before BULWARK ECHO's `boss` event
    for (const echo of ['echo-bulwark', 'echo-maw', 'echo-bastion', 'echo-regent']) {
      expect(h.phases.has(echo + ':0'), echo).toBe(true);
      expect(h.last.get(echo), echo).toEqual({ state: BossState.Dead, escaped: false });
    }
    expect([...h.phases].filter((p) => p.startsWith('iron-sovereign:')).sort()).toEqual([
      'iron-sovereign:0',
      'iron-sovereign:1',
      'iron-sovereign:2',
      'iron-sovereign:3',
    ]);
    expect(h.world.endingFlags).toBe(0);
    // The skip to the ABYSS ARK: the raid in both phases, then the king in his three.
    const i = follow('zone-i-boss');
    expect(i.outcome).toMatchObject({ status: 'stageClear', bossDefeated: true, deathTicks: [] });
    expect(i.first).toBeGreaterThan(8800); // skipped to the WARNING at 9,000
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
    // Both skips take far less than a whole zone.
    expect(i.outcome.ticks).toBeLessThan(h.outcome.ticks);
    expect(h.outcome.ticks).toBeLessThan(readGolden('zone-h-god').file.expected.ticks);
    // IRON CITADEL at Arcade difficulty: the 4-way bot survives the rank-scaled fire to the clear.
    const arcade = readGolden('zone-h-arcade');
    expect(arcade.replay.header).toMatchObject({ assisted: false });
    expect(arcade.replay.header.config.difficulty).toBe('arcade');
    expect(arcade.file.expected).toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    expect(arcade.file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
    expect(arcade.file.expected.ticks / 60).toBeLessThanOrEqual(360);
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
    for (const x of died) expect(x).toBeLessThan(2200);
    for (const x of back) expect(x).toBeLessThan(60);
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
    const ark = db.enemies[db.enemyIndex.get('abyss-ark') ?? -1];
    expect(ark.boss?.timeLimit).toBe(5400);
    expect(escape.outcome.ticks).toBeGreaterThan(5400);
  });

  it('covers the real zones F and G of M2-13: both cleared in 3–6 minutes, their bosses shot down, the cache', () => {
    for (const [name, stage] of [
      ['zone-f-god', 'zone-f'],
      ['zone-g-god', 'zone-g'],
    ] as const) {
      const { file, replay } = readGolden(name);
      expect(replay.header.stageId).toBe(stage);
      expect(replay.header.assisted).toBe(true);
      expect(file.expected).toMatchObject({
        status: 'stageClear',
        bossDefeated: true,
        deathTicks: [],
      });
      expect(file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
      expect(file.expected.ticks / 60).toBeLessThanOrEqual(360);
    }
    // CELL VAULT's run shot tissue cells open on the way (breaks since the last restore).
    const vault = playGolden(readGolden('zone-f-god').replay);
    expect(vault.world.gimmicks.destructible?.destroyed ?? 0).toBeGreaterThan(0);
    // Zone G's hidden bonus stage: the bonus capsules and the 1UP collected, no boss.
    const cache = readGolden('glimmer-cache-god');
    const { world, outcome } = playGolden(cache.replay);
    expect(world.stage?.stage.type).toBe('bonus');
    expect(outcome).toMatchObject({ status: 'stageClear', bossDefeated: false, deathTicks: [] });
    const p1 = world.scoring.board.scores[0];
    expect(outcome.lives - 3 - p1.extendsEarned).toBeGreaterThanOrEqual(1);
    expect(outcome.score).toBeGreaterThan(5 * BONUS_CAPSULE_SCORE);
  });

  it('covers zones F and G without god mode (M2-13 tests): Arcade rank, restarts, deaths in place, the skips', () => {
    // CELL VAULT at Arcade difficulty: the 4-way bot survives the rank-scaled fire to the clear,
    // shooting tissue open on the way.
    const arcade = readGolden('zone-f-arcade');
    expect(arcade.replay.header.assisted).toBe(false);
    expect(arcade.replay.header.config.difficulty).toBe('arcade');
    expect(arcade.file.expected).toMatchObject({
      status: 'stageClear',
      bossDefeated: true,
      deathTicks: [],
    });
    expect(arcade.file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
    expect(arcade.file.expected.ticks / 60).toBeLessThanOrEqual(360);
    expect(playGolden(arcade.replay).world.gimmicks.destructible?.destroyed ?? 0).toBeGreaterThan(
      0,
    );
    // The weaving pilot on Easy under the Arcade penalty: its restarts go back to the start until
    // it passes the checkpoint at 2,200, then to that checkpoint — with the tissue it shot open at
    // the first walls standing again —, until the game is over.
    const deaths = readGolden('zone-f-deaths');
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
    const died: { x: number; broken: number }[] = [];
    const back: { x: number; broken: number }[] = [];
    let alive = true;
    playGolden(deaths.replay, undefined, (world) => {
      const ship = world.players[0];
      const broken = world.gimmicks.destructible?.destroyed ?? 0;
      if (deathTicks.has(world.tick - 1)) died.push({ x: world.camera.x, broken });
      if (!alive && ship.state === 'alive') back.push({ x: world.camera.x, broken });
      alive = ship.state === 'alive';
    });
    expect(died).toHaveLength(deaths.file.expected.deathTicks.length);
    expect(back).toHaveLength(died.length); // the start's fly-in, then one per restart but the last
    const restarts = back.slice(1);
    for (let k = 0; k < restarts.length; k++) {
      // Back to a checkpoint — the start or 2,200 — never ahead of where it died, the shot-open
      // tissue standing again (the ship flies in for a few dozen pixels of scroll).
      const checkpoint = restarts[k].x >= 2200 ? 2200 : 0;
      expect(restarts[k].x - checkpoint, `restart ${String(k)}`).toBeLessThan(60);
      expect(restarts[k].x, `restart ${String(k)}`).toBeLessThan(died[k].x + 100);
      expect(restarts[k].broken, `restart ${String(k)}`).toBe(0);
    }
    expect(restarts.filter((r) => r.x < 60).length).toBeGreaterThanOrEqual(1);
    expect(restarts.filter((r) => r.x >= 2200).length).toBeGreaterThanOrEqual(2);
    expect(died.some((d) => d.x >= 2700 && d.broken > 0)).toBe(true);
    // PRISM LABYRINTH with the 4-way bot and no god mode: a death in the cube rush, the Classic
    // respawn in place (the camera scrolled on — no checkpoint restart), the clear.
    const bot = readGolden('zone-g-bot');
    expect(bot.replay.header.assisted).toBe(false);
    expect(bot.replay.header.config.deathPenalty).toBe('classic');
    expect(bot.file.expected).toMatchObject({ status: 'stageClear', bossDefeated: true });
    expect(bot.file.expected.deathTicks).toHaveLength(1);
    expect(bot.file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
    expect(bot.file.expected.ticks / 60).toBeLessThanOrEqual(360);
    const death = bot.file.expected.deathTicks[0];
    let deathX = -1;
    let respawnX = -1;
    playGolden(bot.replay, undefined, (world) => {
      if (world.tick - 1 === death) deathX = world.camera.x;
      if (deathX >= 0 && respawnX < 0 && world.players[0].state === 'alive') {
        respawnX = world.camera.x;
      }
    });
    expect(deathX).toBeGreaterThanOrEqual(4600); // the cube rush's checkpoint …
    expect(deathX).toBeLessThan(6800); // … before the refraction run's
    expect(respawnX).toBeGreaterThan(deathX);
    // The stage skips to MANTLE REGENT and FACET MONARCH: the full loadout under the Arcade
    // penalty, all three phases of each fought, no death.
    for (const [name, boss] of [
      ['zone-f-boss', 'mantle-regent'],
      ['zone-g-boss', 'facet-monarch'],
    ] as const) {
      const skip = readGolden(name);
      expect(skip.replay.header.config, name).toMatchObject({
        stageSkip: 'boss',
        loadout: 'full',
        deathPenalty: 'arcade',
      });
      expect(skip.file.expected, name).toMatchObject({
        status: 'stageClear',
        bossDefeated: true,
        deathTicks: [],
      });
      expect(skip.file.expected.ticks, name).toBeLessThan(arcade.file.expected.ticks / 4);
      const phases = new Set<number>();
      const index = shippedContent().enemyIndex.get(boss);
      let first = Number.POSITIVE_INFINITY;
      playGolden(skip.replay, undefined, (world) => {
        first = Math.min(first, world.camera.x);
        const slot = world.bosses.boss;
        if (slot.state === BossState.Fight && slot.specIndex === index) phases.add(slot.phase);
      });
      expect([...phases].sort(), name).toEqual([0, 1, 2]);
      expect(first, name).toBeGreaterThan(9000); // skipped to the WARNING
    }
  });

  it('covers zones D and E without god mode (M2-12 tests): deaths in place, the caves, the skip', () => {
    // MAGMA DEEP with the 4-way bot and no god mode: a death down in the caves (the camera at
    // y 200), the Classic respawn in place — the camera stays down there — and the clear.
    const bot = readGolden('zone-d-bot');
    expect(bot.replay.header.assisted).toBe(false);
    expect(bot.replay.header.config.deathPenalty).toBe('classic');
    expect(bot.file.expected).toMatchObject({ status: 'stageClear', bossDefeated: true });
    expect(bot.file.expected.deathTicks.length).toBeGreaterThanOrEqual(1);
    expect(bot.file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
    expect(bot.file.expected.ticks / 60).toBeLessThanOrEqual(360);
    const deathTicks = new Set(bot.file.expected.deathTicks);
    const cameraAtDeath: number[] = [];
    let respawnY = -1;
    playGolden(bot.replay, undefined, (world) => {
      // The watch records a death on the tick before the one the ship turned `dying`.
      if (deathTicks.has(world.tick - 1)) cameraAtDeath.push(world.camera.y);
      const ship = world.players[0];
      if (respawnY < 0 && cameraAtDeath.length > 0 && ship.state === 'alive') {
        respawnY = world.camera.y;
      }
    });
    expect(cameraAtDeath).toContain(200);
    expect(respawnY).toBe(200);
    // The stage skip into the caves: CINDER BASTION shot down, no checkpoint restart needed.
    const skip = readGolden('zone-d-boss');
    expect(skip.replay.header.config).toMatchObject({
      stageSkip: 'boss',
      loadout: 'full',
      deathPenalty: 'arcade',
    });
    expect(skip.file.expected).toMatchObject({ status: 'stageClear', bossDefeated: true });
    expect(skip.file.expected.ticks).toBeLessThan(bot.file.expected.ticks / 4);
    let deepest = Number.POSITIVE_INFINITY;
    const skipped = playGolden(skip.replay, undefined, (world) => {
      deepest = Math.min(deepest, world.camera.y);
    });
    expect(deepest).toBe(200); // never above the caves
    expect(skipped.world.stage?.stage.id).toBe('zone-d');
    // TEMPEST RIDGE with the 4-way bot and no god mode: a death, a respawn in place, the clear.
    const ridge = readGolden('zone-e-bot');
    expect(ridge.replay.header.assisted).toBe(false);
    expect(ridge.file.expected).toMatchObject({ status: 'stageClear', bossDefeated: true });
    expect(ridge.file.expected.deathTicks.length).toBeGreaterThanOrEqual(1);
    expect(ridge.file.expected.lives).toBeGreaterThanOrEqual(1);
    expect(ridge.file.expected.ticks / 60).toBeGreaterThanOrEqual(180);
    expect(ridge.file.expected.ticks / 60).toBeLessThanOrEqual(360);
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
