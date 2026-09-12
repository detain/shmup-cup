/**
 * The shipped test boss end to end (plan M1-13) through the public API of `@shmup/core` and the
 * shipped content, the way a host runs it (`createGame` on `?stage=test-boss`):
 *
 * - the fully powered KESTREL fights TRIAL WARDEN down with its shots alone (no `defeat()`):
 *   both shield plates, then the core behind them, the phases in order, the death sequence to
 *   `stageClear`, and the presentation events a host receives in their order (music stop, dim,
 *   three critical siren pulses with WARNING flashes, the boss theme, the chain, the final blast,
 *   the defeat event with the tally, the stage-clear jingle);
 * - the render contract carries the WARNING (`renderFrame().world.warning`) with the game's own
 *   paraphrased text (decision D10 — never the arcade original's words, shmup_feat.md §26);
 * - two identical sessions stay in lockstep (`hashWorld`) through the whole fight.
 */
import {
  BOSS_BLAST_HIT_STOP_TICKS,
  BOSS_CLEAR_TICKS,
  BossState,
  FX_CUES,
  FlashKind,
  MUSIC_CUES,
  SFX_CUES,
  SfxPriority,
  SimEventKind,
  WARNING_PULSE_TICKS,
  WARNING_TEMPLATE,
  WARNING_TICKS,
  checkEnemyBehaviors,
  createGame,
  createHeadlessPlatform,
  hashWorld,
  loadContent,
  type ContentDb,
  type Game,
} from '@shmup/core';
import { describe, expect, it } from 'vitest';
import { readContentFiles } from '../../vite.shared.js';

/**
 * The shipped content DB.
 *
 * @returns The DB (asserted issue-free, behaviours included).
 */
function shipped(): ContentDb {
  const { db, issues } = loadContent(readContentFiles());
  expect(issues).toEqual([]);
  expect(checkEnemyBehaviors(db)).toEqual([]);
  return db;
}

/** The shared DB (read-only). */
const DB = shipped();

/** One event a host received. */
interface Received {
  /** Tick it was pushed in. */
  readonly tick: number;
  /** Kind. */
  readonly kind: number;
  /** Id. */
  readonly id: number;
  /** Param. */
  readonly param: number;
}

/**
 * A game on the boss range with every weapon, god mode on (the boss's bullets and lasers must
 * not end the run).
 *
 * @param seed - Seed.
 * @returns The game.
 */
function game(seed: number): Game {
  const g = createGame(createHeadlessPlatform(), { seed, stage: 'test-boss', loadout: 'full' }, DB);
  g.world.debugFlags.godMode = true;
  return g;
}

/**
 * Steps a game until its boss is dead (or a limit), collecting the events.
 *
 * @param g - The game.
 * @param limit - Tick limit.
 * @param out - Collector.
 * @returns The collector.
 */
function fight(g: Game, limit: number, out: Received[] = []): Received[] {
  for (let i = 0; i < limit && g.world.bosses.boss.state !== BossState.Dead; i++) {
    const tick = g.world.tick;
    g.step();
    g.events.drain((e) => out.push({ tick, kind: e.kind, id: e.id, param: e.param }));
  }
  return out;
}

describe('integration: the shipped test boss (M1-13)', () => {
  it('is fought down by the shots alone, phase by phase, to stageClear with its events in order', () => {
    const g = game(4);
    const world = g.world;
    const boss = world.bosses.boss;
    const index = DB.enemyIndex.get('test-boss') ?? -1;
    const phases: number[] = [];
    const events: Received[] = [];
    for (let i = 0; i < 12_000 && boss.state !== BossState.Dead; i++) {
      fight(g, 1, events);
      if (boss.state === BossState.Fight && phases[phases.length - 1] !== boss.phase) {
        phases.push(boss.phase);
      }
    }
    expect(boss.state).toBe(BossState.Dead);
    expect(world.status).toBe('stageClear');
    expect(phases).toEqual([0, 1, 2]);
    // Shots did it: both plates and the core are gone, credited to player 1.
    const parts = boss.parts;
    const named = (name: string): (typeof parts)[number] => {
      const part = parts.find((p) => p.name === name);
      if (part === undefined) throw new Error('no part ' + name);
      return part;
    };
    expect(
      [named('plate-top'), named('plate-bottom'), named('core')].map((p) => p.destroyed),
    ).toEqual([true, true, true]);
    expect(named('hull').destroyed).toBe(false); // armour never breaks
    expect(boss.killer).toBe(0);

    // The events a host received, in order.
    const first = (kind: number, id: number): number =>
      events.findIndex((e) => e.kind === kind && e.id === id);
    const silence = first(SimEventKind.Music, MUSIC_CUES.Silence);
    const dim = first(SimEventKind.Dim, 50);
    const sirens = events.filter(
      (e) => e.kind === SimEventKind.Sfx && e.id === SFX_CUES.WarningSiren,
    );
    const warningTick = sirens[0].tick;
    expect(sirens.map((e) => [e.tick - warningTick, e.param])).toEqual([
      [0, SfxPriority.Critical],
      [WARNING_PULSE_TICKS, SfxPriority.Critical],
      [2 * WARNING_PULSE_TICKS, SfxPriority.Critical],
    ]);
    expect(
      events
        .filter((e) => e.kind === SimEventKind.Flash && e.id === FlashKind.Warning)
        .map((e) => e.tick - warningTick),
    ).toEqual([0, WARNING_PULSE_TICKS, 2 * WARNING_PULSE_TICKS]);
    const theme = first(SimEventKind.Music, MUSIC_CUES.Boss);
    expect(events[theme].tick).toBe(warningTick + WARNING_TICKS);
    const chain = first(SimEventKind.Particles, FX_CUES.BossChain);
    const blast = first(SimEventKind.Particles, FX_CUES.BossBlast);
    const defeated = first(SimEventKind.BossDefeated, index);
    const jingle = first(SimEventKind.Music, MUSIC_CUES.StageClear);
    expect(silence).toBeGreaterThanOrEqual(0);
    expect([silence < dim, dim < theme, theme < chain, chain < blast, blast < defeated]).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(jingle).toBeGreaterThan(defeated);
    expect(events[defeated].param).toBe(20_000);
    expect(events.filter((e) => e.kind === SimEventKind.BossDefeated)).toHaveLength(1);
    // The tick the core died in → the tick of the stage clear: 180 simulated ticks plus the
    // blast's hit-stop (the kill's music fade marks the kill tick).
    const kill = events.findLast(
      (e) => e.kind === SimEventKind.Music && e.id === MUSIC_CUES.Silence,
    );
    expect(kill).toBeDefined();
    expect(world.tick - 1 - (kill?.tick ?? 0)).toBe(BOSS_CLEAR_TICKS + BOSS_BLAST_HIT_STOP_TICKS);
    // The tally, the parts and the stage's enemies all went to player 1's score.
    const score = world.scoring.board.scores[0].score;
    expect(score).toBeGreaterThanOrEqual(20_000 + 500 + 500 + 5000);
    // The camera is free again and the stage plays on.
    expect(world.stage?.locked).toBe(false);
    const x = world.camera.x;
    for (let i = 0; i < 120; i++) g.step();
    expect(world.camera.x).toBeGreaterThan(x);
  });

  it("puts the WARNING in the render contract with the game's own paraphrased text", () => {
    const g = game(1);
    const frame = g.renderFrame();
    const view = frame.world?.warning;
    expect(view).toBeDefined();
    expect(view).toBe(g.world.bosses.warning);
    let ticks = 0;
    while (view?.active !== true && ticks++ < 2000) g.step();
    expect(view?.active).toBe(true);
    expect(view?.duration).toBe(WARNING_TICKS);
    expect(view?.text).toBe('WARNING!!\nGIANT HOSTILE "TRIAL WARDEN"\nCLOSING IN - CODE TW-00');
    expect(g.world.status).toBe('bossWarning');
    // Original wording only (shmup_feat.md §26): not the arcade's phrases.
    for (const phrase of ['HUGE BATTLESHIP', 'APPROACHING FAST', 'IS APPROACHING']) {
      expect(WARNING_TEMPLATE).not.toContain(phrase);
    }
    // The live view counts the WARNING and ends it.
    for (let i = 0; i < 30; i++) g.step();
    expect(view?.ticks).toBe(30);
    while (view?.active === true) g.step();
    expect(g.world.bosses.boss.state).toBe(BossState.Intro);
  });

  it('keeps two identical sessions in lockstep through the whole fight', () => {
    const a = game(8);
    const b = game(8);
    const input = { a: [] as Received[], b: [] as Received[] };
    for (let block = 0; block < 120 && a.world.bosses.boss.state !== BossState.Dead; block++) {
      fight(a, 100, input.a);
      fight(b, 100, input.b);
      expect(hashWorld(a.world)).toBe(hashWorld(b.world));
    }
    expect(a.world.bosses.boss.state).toBe(BossState.Dead);
    expect(b.world.bosses.boss.state).toBe(BossState.Dead);
    expect(input.a).toEqual(input.b);
  });
});
