/**
 * The advanced bosses of plan M2-09 end to end on the shipped dev stages, through the public API
 * of `@shmup/core` the way a host runs them (`createGame` with `?stage=…`), god mode on:
 *
 * - **CAPTAIN RANGE** — the four captains come in order with `boss` events while the camera keeps
 *   scrolling; each one's short death pays its tally; the stage ends at its `end` event;
 * - **RAID RANGE** — IRON LEVIATHAN: the WARNING, the camera following its boss-relative segments,
 *   its death easing the camera back, LEVIATHAN HEART revealed by the blast, the stage clear after
 *   the heart; and, left alone, its escape after its time limit (the ending flag, no tally);
 * - **TWIN RANGE** — the EMBER AND FROST TWINS take turns; one down, the survivor enrages;
 * - **GAUNTLET RANGE** — a boss rush: TRIAL WARDEN, LEVIATHAN HEART, the twins, then the clear;
 * - BROOD LAUNCHER's minions: regular `bubble` enemies launched from its tubes while it fights;
 * - the HP bar model over the shipped raid: filling through the intro, full at the fight's start
 *   (the cores and what they require), empty while dying, then LEVIATHAN HEART's own bar;
 * - two sessions of the raid range stay in lockstep (`hashWorld`).
 */
import {
  BossState,
  EndingFlag,
  EnemyState,
  SimEventKind,
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

/**
 * A god-mode game on a stage.
 *
 * @param stage - Stage id.
 * @param seed - Seed.
 * @param shoot - Whether the ship fires (the remote's always-on autofire, fully powered).
 * @returns The game.
 */
function game(stage: string, seed: number, shoot = true): Game {
  const g = createGame(
    createHeadlessPlatform(),
    shoot ? { seed, stage, loadout: 'full' } : { seed, stage, autofire: false, remoteMode: false },
    DB,
  );
  g.world.debugFlags.godMode = true;
  return g;
}

/**
 * The enemy index of an id.
 *
 * @param id - Enemy id.
 * @returns The index.
 */
function index(id: string): number {
  const i = DB.enemyIndex.get(id);
  if (i === undefined) throw new Error('no ' + id);
  return i;
}

/**
 * Steps a game, collecting the bosses' defeat and escape events (`defeated:<id>` /
 * `escaped:<id>`), defeating every boss that has fought `patience` ticks.
 *
 * @param g - The game.
 * @param ticks - Most ticks.
 * @param patience - Fight ticks before `defeat()` (0 = never).
 * @param stop - Stops early when it returns `true`.
 * @returns The collected events.
 */
function play(g: Game, ticks: number, patience: number, stop: () => boolean): string[] {
  const out: string[] = [];
  const bosses = g.world.bosses;
  for (let t = 0; t < ticks && !stop(); t++) {
    if (
      patience > 0 &&
      bosses.slots.some((b) => b.state === BossState.Fight && b.fightTicks > patience)
    ) {
      bosses.defeat(0);
    }
    g.step();
    g.events.drain((e) => {
      if (e.kind === SimEventKind.BossDefeated) out.push('defeated:' + DB.enemies[e.id].id);
      if (e.kind === SimEventKind.BossEscaped) out.push('escaped:' + DB.enemies[e.id].id);
    });
  }
  return out;
}

describe('integration: the advanced bosses of M2-09 on their dev stages', () => {
  it('CAPTAIN RANGE: four captains in order, never stopping the scroll, then the end', () => {
    const g = game('captain-range', 3);
    const world = g.world;
    let lockedWhileCaptain = false;
    const seen: string[] = [];
    const events: string[] = [];
    for (let t = 0; t < 9000 && world.status === 'playing'; t++) {
      events.push(...play(g, 1, 400, () => false));
      for (const b of world.bosses.slots) {
        if (b.state === BossState.Fight) {
          const id = DB.enemies[b.specIndex].id;
          if (seen[seen.length - 1] !== id) seen.push(id);
          if (world.stage?.locked) lockedWhileCaptain = true;
        }
      }
    }
    expect(seen).toEqual(['captain-ram', 'captain-launcher', 'captain-circler', 'captain-crab']);
    expect(events).toEqual(seen.map((id) => 'defeated:' + id));
    expect(lockedWhileCaptain).toBe(false);
    expect(world.status).toBe('stageClear');
    expect(world.camera.x).toBe(world.stage?.stage.length);
  });

  it('RAID RANGE: the raid camera, the heart revealed by the blast, the clear after it', () => {
    const g = game('raid-range', 4);
    const world = g.world;
    const [leviathan, heart] = world.bosses.slots;
    play(g, 3000, 0, () => leviathan.state === BossState.Fight);
    expect(leviathan.specIndex).toBe(index('raid-leviathan'));
    expect(leviathan.raiding).toBe(true);
    const home = { x: leviathan.raidHomeX, y: leviathan.raidHomeY };
    // The camera pans round the boss (segments relative to its world-anchored origin).
    const cameras = new Set<string>();
    for (let t = 0; t < 600; t++) {
      play(g, 1, 0, () => false);
      cameras.add(`${String(Math.round(world.camera.x))},${String(Math.round(world.camera.y))}`);
    }
    expect(cameras.size).toBeGreaterThan(100);
    expect(world.camera.y).not.toBe(home.y);
    const events = play(g, 12_000, 1, () => world.status === 'stageClear');
    expect(events).toEqual(['defeated:raid-leviathan', 'defeated:raid-heart']);
    expect(heart.specIndex).toBe(index('raid-heart'));
    expect(world.status).toBe('stageClear');
    // Back where the raid began, the lock released.
    expect(world.camera.y).toBe(home.y);
    expect(world.stage?.locked).toBe(false);
    expect(world.endingFlags).toBe(0);
  });

  it('RAID RANGE left alone: the battleship escapes after its time limit — the ending flag', () => {
    const g = game('raid-range', 5, false);
    const world = g.world;
    const events = play(g, 12_000, 0, () => world.status === 'stageClear');
    expect(events).toEqual(['escaped:raid-leviathan']);
    expect(world.bosses.boss.escaped).toBe(true);
    expect(world.endingFlags & EndingFlag.BossEscaped).toBe(EndingFlag.BossEscaped);
    expect(world.status).toBe('stageClear');
    expect(world.scoring.board.scores[0].score).toBe(0);
  });

  it('TWIN RANGE: the twins take turns; one down, the survivor enrages; both down, the clear', () => {
    const g = game('twin-range', 6, false);
    const world = g.world;
    const [ember, frost] = world.bosses.slots;
    play(g, 3000, 0, () => ember.state === BossState.Fight);
    expect(frost.specIndex).toBe(index('twin-frost'));
    let turns = 0;
    let resting = ember.resting;
    for (let t = 0; t < 1000; t++) {
      play(g, 1, 0, () => false);
      if (ember.resting !== resting) {
        resting = ember.resting;
        turns++;
      }
    }
    expect(turns).toBeGreaterThanOrEqual(3);
    // Destroy the core of whichever twin is in front.
    const front = ember.resting ? frost : ember;
    const other = front === ember ? frost : ember;
    world.bosses.damagePart(front.parts[1].global, 1000, 0);
    expect(front.state).toBe(BossState.Dying);
    expect(other.enraged).toBe(true);
    play(g, 400, 0, () => false);
    expect(other.phase).toBe(1);
    expect(world.status).toBe('playing');
    const events = play(g, 2000, 1, () => world.status === 'stageClear');
    expect(events).toEqual(['defeated:' + DB.enemies[other.specIndex].id]);
    expect(world.status).toBe('stageClear');
  });

  it('GAUNTLET RANGE: a boss rush, one after another, then the clear', () => {
    const g = game('gauntlet-range', 7);
    const world = g.world;
    const events = play(g, 20_000, 300, () => world.status === 'stageClear');
    expect(events).toEqual([
      'defeated:test-boss',
      'defeated:raid-heart',
      'defeated:twin-ember',
      'defeated:twin-frost',
    ]);
    expect(world.status).toBe('stageClear');
    expect(world.bosses.rushIndex).toBe(3);
  });

  it('keeps two raid sessions in lockstep', () => {
    const a = game('raid-range', 9);
    const b = game('raid-range', 9);
    for (let block = 0; block < 40; block++) {
      play(a, 100, 900, () => false);
      play(b, 100, 900, () => false);
      expect(hashWorld(a.world), `block ${String(block)}`).toBe(hashWorld(b.world));
    }
  });

  it('CAPTAIN RANGE: BROOD LAUNCHER launches its bubbles from its tubes while it fights', () => {
    const g = game('captain-range', 11, false);
    const world = g.world;
    const launcher = index('captain-launcher');
    const bubble = index('bubble');
    const slot = (): (typeof world.bosses.slots)[number] | undefined =>
      world.bosses.slots.find((b) => b.specIndex === launcher && b.state === BossState.Fight);
    play(g, 3000, 0, () => slot() !== undefined);
    const boss = slot();
    if (boss === undefined) throw new Error('BROOD LAUNCHER never fought');
    const tubes = boss.parts.slice(1, 3);
    let launched = 0;
    let atTube = 0;
    /**
     * The slots of the live bubbles.
     *
     * @returns The slots.
     */
    const bubbles = (): Set<number> =>
      new Set(
        world.enemies.enemies
          .filter((e) => e.specIndex === bubble && e.state === EnemyState.Live)
          .map((e) => e.slot),
      );
    for (let t = 0; t < 400 && boss.state === BossState.Fight; t++) {
      const before = bubbles();
      play(g, 1, 0, () => false);
      for (const e of world.enemies.enemies) {
        if (e.specIndex !== bubble || e.state !== EnemyState.Live || before.has(e.slot)) continue;
        launched++;
        // Spawned at a tube's centre (it has moved at most a few pixels this tick).
        if (tubes.some((p) => Math.abs(p.x - e.x) < 8 && Math.abs(p.y - e.y) < 8)) atTube++;
      }
    }
    expect(launched).toBeGreaterThanOrEqual(2);
    expect(atTube).toBe(launched);
  });

  it('RAID RANGE: the HP bar fills through the intro, counts the cores, then the heart', () => {
    const g = game('raid-range', 12, false);
    const world = g.world;
    const bar = world.bosses.hpBar;
    const [leviathan, heart] = world.bosses.slots;
    play(g, 3000, 0, () => leviathan.state === BossState.Intro);
    // Its first intro tick: shown, empty.
    expect([bar.visible, bar.hp]).toEqual([true, 0]);
    let last = -1;
    while (leviathan.state === BossState.Intro) {
      play(g, 1, 0, () => false);
      expect(bar.hp).toBeGreaterThanOrEqual(last);
      last = bar.hp;
    }
    expect([bar.visible, bar.bosses]).toEqual([true, 1]);
    // The fight: every counted hit point is there (the cores and the parts they require).
    const spec = DB.enemies[leviathan.specIndex].boss;
    if (spec === null) throw new Error('no boss section');
    const cores = spec.parts.filter((p) => p.core);
    expect(bar.maxHp).toBeGreaterThanOrEqual(cores.reduce((sum, p) => sum + p.hp, 0));
    expect(bar.hp).toBe(bar.maxHp);
    world.bosses.defeat(0);
    play(g, 1, 0, () => false);
    expect([bar.visible, bar.hp]).toEqual([true, 0]);
    // The heart's intro fills the bar again, with its own strength.
    play(g, 400, 0, () => heart.state === BossState.Fight);
    expect(heart.specIndex).toBe(index('raid-heart'));
    play(g, 1, 0, () => false);
    expect(bar.bosses).toBe(1);
    const heartSpec = DB.enemies[heart.specIndex].boss;
    if (heartSpec === null) throw new Error('no boss section');
    expect(bar.maxHp).toBeGreaterThanOrEqual(
      heartSpec.parts.filter((p) => p.core).reduce((sum, p) => sum + p.hp, 0),
    );
    expect(bar.hp).toBe(bar.maxHp);
  });
});
