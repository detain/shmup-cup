/**
 * The M2-10 run state of `core/scenes` (`scenes/run.ts`): the players carried from one World to
 * the next (`captureCarry` / `applyCarry` — scores with the continue digit and the next extend,
 * lives, loadout, speed, meter cursor, shield; a player out stays out, a player down respawns
 * blinking, an unjoined player 2 stays inactive), the zone tally and its payment, the run's
 * bookkeeping (begin, advance, practice, bonus state, deaths / continues / flags → the ending
 * flags) and the World of the run (`runWorldConfig`, `prepareRunWorld`).
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig } from '../../src/config/index.js';
import { EndingFlag } from '../../src/bosses/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { PLAYER_DEAD_TICKS } from '../../src/player/index.js';
import { MeterSlot } from '../../src/powerups/index.js';
import { markContinue } from '../../src/scoring/index.js';
import {
  CarryState,
  KILL_BONUS_PER_PERCENT,
  RunFlag,
  RunState,
  TIME_BONUS_PAR_TICKS,
  TIME_BONUS_PER_SECOND,
  ZoneResult,
  applyCarry,
  awardZoneBonus,
  captureCarry,
  copyShieldState,
  prepareRunWorld,
  runWorldConfig,
  tallyZone,
  worldDeaths,
} from '../../src/scenes/index.js';
import { FORCE_FIELD, ShieldKind, ShieldState, grantShield } from '../../src/shields/index.js';
import { MainWeapon } from '../../src/weapons/index.js';
import { createWorld, stepWorld, type World } from '../../src/world/index.js';
import { campaignContent } from '../helpers/campaign.js';

const DB = campaignContent();
const CAMPAIGN = DB.campaign;
if (CAMPAIGN === null) throw new Error('no campaign');

/**
 * A World on a stage of the test campaign.
 *
 * @param stage - Stage id.
 * @param over - Config fields.
 * @returns The World.
 */
function world(stage = 't-s', over: Record<string, unknown> = {}): World {
  return createWorld(resolveGameConfig({ seed: 2, stage, ...over }), DB);
}

describe('core/scenes run: carrying the players (M2-10)', () => {
  it('carries score, continue digit, extends, lives, loadout, speed, cursor and shield', () => {
    const from = world();
    const board = from.scoring.board;
    board.scores[0].score = 123_450;
    markContinue(board, 0);
    board.scores[0].nextExtend = 160_000;
    board.scores[0].extendsEarned = 2;
    const ship = from.players[0];
    ship.lives = 5;
    ship.speedLevel = 3;
    const loadout = from.weapons.loadouts[0];
    loadout.main = MainWeapon.Laser;
    loadout.missile = true;
    loadout.options = 3;
    from.powerups.meters[0].cursor = MeterSlot.Double;
    grantShield(ship.shield, FORCE_FIELD);
    ship.shield.hits = 4;
    ship.shield.iFrames = 6;
    from.continuesUsed = 1;
    const carry = captureCarry(from, new CarryState());
    expect(carry.valid).toBe(true);
    expect(carry.players[0]).toMatchObject({
      active: true,
      lives: 5,
      out: false,
      score: 123_451,
      continues: 1,
      nextExtend: 160_000,
      extendsEarned: 2,
      main: MainWeapon.Laser,
      missile: true,
      options: 3,
      speedLevel: 3,
      cursor: MeterSlot.Double,
    });
    expect(carry.players[1].active).toBe(false);
    const to = world('t-u');
    applyCarry(to, carry);
    const s = to.scoring.board.scores[0];
    expect([s.score, s.continues, s.nextExtend, s.extendsEarned]).toEqual([123_451, 1, 160_000, 2]);
    expect(to.scoring.board.hiScore).toBeGreaterThanOrEqual(123_451);
    const p = to.players[0];
    expect([p.lives, p.speedLevel, p.state]).toEqual([5, 3, 'entering']);
    const l = to.weapons.loadouts[0];
    expect([l.main, l.missile, l.options]).toEqual([MainWeapon.Laser, true, 3]);
    expect(to.powerups.meters[0].cursor).toBe(MeterSlot.Double);
    expect([p.shield.kind, p.shield.hits, p.shield.iFrames]).toEqual([ShieldKind.ForceField, 4, 0]);
    expect(to.continuesUsed).toBe(1);
    expect(to.players[1].active).toBe(false);
    // The rank follows the carried power (Laser + Missile + 3 Options + a shield).
    expect(to.rank).toBeGreaterThan(world('t-u').rank);
  });

  it('respawns a player that was down, keeps an out player out (game over at once)', () => {
    const from = world('t-s', { coop: true });
    from.players[1].active = true;
    const input = createInputSnapshot();
    for (let i = 0; i < 50; i++) stepWorld(from, input);
    from.players[0].state = 'dying';
    from.players[0].lives = 2;
    from.players[1].state = 'dead';
    from.players[1].lives = 0;
    const carry = captureCarry(from, new CarryState());
    expect([carry.players[0].down, carry.players[0].out]).toEqual([true, false]);
    expect([carry.players[1].down, carry.players[1].out]).toEqual([true, true]);
    const to = world('t-u', { coop: true });
    applyCarry(to, carry);
    expect(to.players[0].state).toBe('respawning');
    expect(to.players[0].invulnTicks).toBeGreaterThan(0);
    expect([to.players[1].active, to.players[1].state, to.players[1].lives]).toEqual([
      true,
      'dead',
      0,
    ]);
    expect(to.players[1].stateTicks).toBe(PLAYER_DEAD_TICKS);
    // Everybody out: the game is over on the first tick (the continue countdown's business).
    const alone = world();
    const lost = captureCarry(alone, new CarryState());
    lost.players[0].out = true;
    const next = world('t-u');
    applyCarry(next, lost);
    stepWorld(next, createInputSnapshot());
    expect(next.status).toBe('gameOver');
  });

  it('ignores an invalid carry, and copies shields with fresh timers', () => {
    const w = world();
    const before = w.players[0].lives;
    applyCarry(w, new CarryState());
    expect(w.players[0].lives).toBe(before);
    const a = new ShieldState();
    grantShield(a, FORCE_FIELD);
    a.hitTick = 50;
    a.brokeTick = 60;
    a.podHitTick[1] = 3;
    const b = new ShieldState();
    copyShieldState(a, b);
    expect([b.kind, b.hits, b.hitTick, b.brokeTick, b.podHitTick[1]]).toEqual([
      a.kind,
      a.hits,
      -1,
      -1,
      -1,
    ]);
    const copy = new CarryState();
    const src = captureCarry(world(), new CarryState());
    src.players[0].score = 777;
    copy.copyFrom(src);
    expect([copy.valid, copy.players[0].score]).toEqual([true, 777]);
  });
});

describe('core/scenes run: the zone tally (M2-10)', () => {
  it('rates the kills and the boss fight, and pays everybody in play', () => {
    const w = world();
    w.enemies.stats.spawned = 40;
    w.enemies.stats.killed = 30;
    const result = tallyZone(w, new ZoneResult());
    expect([result.killPercent, result.killBonus, result.bossSeconds, result.timeBonus]).toEqual([
      75,
      75 * KILL_BONUS_PER_PERCENT,
      -1,
      0,
    ]);
    // A defeated stage boss: the seconds under par.
    const boss = w.bosses.slots[1];
    boss.specIndex = 0;
    boss.state = 5; // Dead
    boss.fightTicks = TIME_BONUS_PAR_TICKS - 30 * 60 - 10;
    tallyZone(w, result, true);
    expect([result.bossSeconds, result.timeBonus, result.bonus]).toEqual([
      59,
      30 * TIME_BONUS_PER_SECOND,
      true,
    ]);
    // An escaped boss pays nothing.
    boss.escaped = true;
    expect(tallyZone(w, result).timeBonus).toBe(0);
    expect(awardZoneBonus(w, result)).toBe(75 * KILL_BONUS_PER_PERCENT);
    expect(w.scoring.board.scores[0].score).toBe(7500);
    expect(w.scoring.board.scores[1].score).toBe(0); // player 2 is not in play
    result.killBonus = 0;
    expect(awardZoneBonus(w, result)).toBe(0);
  });
});

describe('core/scenes run: the run state (M2-10)', () => {
  it('begins, advances, and derives the ending flags from deaths, continues and flags', () => {
    const run = new RunState();
    run.begin(CAMPAIGN, null);
    expect([run.zone, run.stage, run.depth, run.route, run.finalZone]).toEqual([
      0,
      't-s',
      0,
      [0],
      false,
    ]);
    expect(run.endingFlags).toBe(RunFlag.NoDeath | RunFlag.NoContinue);
    const w = world();
    w.players[0].hits = 2;
    w.continuesUsed = 1;
    w.endingFlags = EndingFlag.BossEscaped;
    run.noteWorldEnd(w);
    expect([run.deaths, run.continues]).toEqual([2, 1]);
    expect(run.endingFlags).toBe(RunFlag.BossEscaped);
    expect(worldDeaths(w)).toBe(2);
    captureCarry(w, run.carry);
    run.carry.players[0].score = 4242;
    run.advance(2);
    expect([run.zone, run.stage, run.depth, run.route, run.finalZone]).toEqual([
      2,
      't-l',
      1,
      [0, 2],
      true,
    ]);
    expect(run.entry.players[0].score).toBe(4242);
    const single = new RunState();
    single.begin(null, 'solo');
    expect([single.campaign, single.zone, single.stage, single.route]).toEqual([
      null,
      -1,
      'solo',
      [],
    ]);
    single.advance(1); // nothing without a campaign
    expect(single.zone).toBe(-1);
  });

  it('keeps the bonus-stage state and the practice start', () => {
    const run = new RunState();
    run.beginPractice(CAMPAIGN, 1, 0);
    expect([run.practice, run.zone, run.stage, run.depth, run.checkpoint]).toEqual([
      true,
      1,
      't-u',
      1,
      0,
    ]);
    run.inBonus = true;
    run.bonusStage = 't-v';
    run.bonusReturnX = 40;
    run.leaveBonus(true);
    expect([run.inBonus, run.bonusStage, run.bonusReturnX, run.bonusLocked]).toEqual([
      false,
      null,
      40,
      true,
    ]);
    run.leaveBonus(false);
    expect([run.bonusReturnX, run.bonusLocked]).toEqual([-1, false]);
  });

  it('builds the World of the run: its stage, rank term, practice checkpoint, bonus return', () => {
    const base = resolveGameConfig({ seed: 2, stage: 't-s' });
    const run = new RunState();
    run.begin(CAMPAIGN, null);
    expect(runWorldConfig(base, run)).toBe(base);
    run.advance(1);
    const upper = runWorldConfig(base, run);
    expect(upper.stage).toBe('t-u');
    expect(upper.seed).toBe(2);
    const w = prepareRunWorld(createWorld(upper, DB), run, null);
    expect(w.rankInputs.stage).toBe(2);
    run.inBonus = true;
    run.bonusStage = 't-v';
    expect(runWorldConfig(base, run).stage).toBe('t-v');
    run.leaveBonus(true);
    run.bonusReturnX = 60;
    const back = prepareRunWorld(createWorld(runWorldConfig(base, run), DB), run, null);
    expect(back.camera.x).toBe(60);
    expect(back.bonus.locked).toBe(true);
    const practice = new RunState();
    practice.beginPractice(CAMPAIGN, 2, 1);
    const p = prepareRunWorld(createWorld(runWorldConfig(base, practice), DB), practice, null);
    expect(p.camera.x).toBe(100);
    expect(practice.continuesAtStart).toBe(0);
  });
});
