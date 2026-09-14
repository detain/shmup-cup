/**
 * Edge cases of the M2-10 run state (`core/scenes` `scenes/run.ts`) beyond `scenes-run.test.ts`:
 *
 * - carrying: which ship states count as *down* (dying, dead, respawning) and which fly in afresh
 *   (alive, leaving — the fly-out of a cleared zone —, entering); player 2 carried in and out of a
 *   co-op game; the hi-score carried as the best of the run and the scores; the Direct-mode
 *   levels and family; every shield field (pods, Reduce's scale, the Arm's tier and charge) with
 *   the World-bound timers reset; `CarryState.copyFrom` field for field;
 * - the tally: the kill rate's rounding and cap, which boss fights count (a stage boss dying or
 *   dead, not escaped, not a captain, not one still fighting), the longest of two fights, the time
 *   bonus at and around par; the payment skipping an out player, paying player 2 and granting an
 *   extend;
 * - the run: `begin` after a finished run resets everything, practice at the start zone,
 *   `noteWorldEnd` never counts negative continues and keeps only the `BossEscaped` bit,
 *   `advance` leaves the bonus state, the ending flags;
 * - the World of the run: a single-stage run keeps the rank's stage term, a bonus stage ignores the
 *   way back and the lock, the way back beats a practice checkpoint, a carried World notes the
 *   continues it starts with.
 */
import { describe, expect, it } from 'vitest';
import { BossRole, BossState, EndingFlag } from '../../src/bosses/index.js';
import { resolveGameConfig } from '../../src/config/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { PLAYER_DEAD_TICKS, setPlayerState } from '../../src/player/index.js';
import {
  CarryState,
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
} from '../../src/scenes/index.js';
import { FORCE_FIELD, MAX_SHIELD_PODS, ShieldState, grantShield } from '../../src/shields/index.js';
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
  return createWorld(resolveGameConfig({ seed: 5, stage, ...over }), DB);
}

describe('core/scenes run edges: carrying (M2-10)', () => {
  it('counts dying, dead and respawning ships as down; alive, leaving and entering fly in', () => {
    const states = [
      ['alive', false],
      ['leaving', false],
      ['entering', false],
      ['dying', true],
      ['dead', true],
      ['respawning', true],
    ] as const;
    for (const [state, down] of states) {
      const from = world();
      setPlayerState(from.players[0], state);
      from.players[0].lives = 2;
      const carry = captureCarry(from, new CarryState());
      expect([carry.players[0].down, carry.players[0].out], state).toEqual([down, false]);
      const to = world('t-u');
      applyCarry(to, carry);
      expect(to.players[0].state, state).toBe(down ? 'respawning' : 'entering');
      expect(to.players[0].lives, state).toBe(2);
    }
  });

  it('marks a ship out when its last life is gone (down with no life, or out already)', () => {
    const lastLife = world();
    setPlayerState(lastLife.players[0], 'dying');
    lastLife.players[0].lives = 0;
    expect(captureCarry(lastLife, new CarryState()).players[0].out).toBe(true);
    const over = world();
    setPlayerState(over.players[0], 'dead');
    over.players[0].lives = 0;
    over.players[0].stateTicks = PLAYER_DEAD_TICKS;
    expect(captureCarry(over, new CarryState()).players[0].out).toBe(true);
    // An inactive player 2 is never out (it may still join).
    expect(captureCarry(over, new CarryState()).players[1]).toMatchObject({
      active: false,
      out: false,
    });
  });

  it('carries player 2 of a co-op game in, and switches off a player 2 that never joined', () => {
    const from = world('t-s', { coop: true });
    from.players[1].active = true;
    setPlayerState(from.players[1], 'alive');
    from.players[1].lives = 4;
    from.scoring.board.scores[1].score = 3_330;
    from.weapons.loadouts[1].options = 2;
    const carry = captureCarry(from, new CarryState());
    const to = world('t-u', { coop: true });
    applyCarry(to, carry);
    expect([to.players[1].active, to.players[1].state, to.players[1].lives]).toEqual([
      true,
      'entering',
      4,
    ]);
    expect(to.scoring.board.scores[1].score).toBe(3_330);
    expect(to.weapons.loadouts[1].options).toBe(2);
    // A carry whose player 2 never joined switches off an active one.
    const solo = captureCarry(world('t-s', { coop: true }), new CarryState());
    const joined = world('t-u', { coop: true });
    joined.players[1].active = true;
    applyCarry(joined, solo);
    expect(joined.players[1].active).toBe(false);
  });

  it('carries the hi-score as the best of the run`s record and the carried scores', () => {
    const from = world();
    from.scoring.board.setHiScore(900_000);
    from.scoring.board.scores[0].score = 12_340;
    const carry = captureCarry(from, new CarryState());
    expect(carry.hiScore).toBe(900_000);
    const to = world('t-u');
    applyCarry(to, carry);
    expect(to.scoring.board.hiScore).toBe(900_000);
    // A score above the record becomes the hi-score.
    carry.hiScore = 100;
    const next = world('t-l');
    applyCarry(next, carry);
    expect(next.scoring.board.hiScore).toBe(12_340);
    expect(next.scoring.board.scores[0].displayDirty).toBe(true);
  });

  it('carries the Direct-mode levels and family, the speed and the meter cursor as they are', () => {
    const from = world();
    const loadout = from.weapons.loadouts[0];
    loadout.shot = 5;
    loadout.sub = 3;
    loadout.family = 2;
    from.players[0].speedLevel = 4;
    from.powerups.meters[0].cursor = -1;
    const carry = captureCarry(from, new CarryState());
    expect(carry.players[0]).toMatchObject({
      shot: 5,
      sub: 3,
      family: 2,
      speedLevel: 4,
      cursor: -1,
    });
    const to = world('t-u');
    to.powerups.meters[0].cursor = 3;
    applyCarry(to, carry);
    const l = to.weapons.loadouts[0];
    expect([l.shot, l.sub, l.family, to.players[0].speedLevel]).toEqual([5, 3, 2, 4]);
    expect(to.powerups.meters[0].cursor).toBe(-1);
  });

  it('copies every lasting shield field and resets the World-bound timers', () => {
    const from = new ShieldState();
    grantShield(from, FORCE_FIELD);
    from.maxHits = 9;
    from.absorbsTerrain = true;
    from.absorbed = 7;
    from.hurtScale = 0.5;
    from.podCount = 2;
    from.podMaxHits = 6;
    from.podOrbit = 20;
    from.spin = 3;
    from.tier = 2;
    from.charge = 40;
    from.iFrames = 12;
    for (let i = 0; i < MAX_SHIELD_PODS; i++) {
      from.podHits[i] = i + 1;
      from.podAngle[i] = i * 10;
      from.podIFrames[i] = 5;
      from.podHitTick[i] = 99;
      from.podX[i] = i * 2;
      from.podY[i] = i * 3;
    }
    const to = new ShieldState();
    copyShieldState(from, to);
    expect(to).toMatchObject({
      kind: from.kind,
      hits: from.hits,
      maxHits: 9,
      iFrames: 0,
      absorbsTerrain: true,
      hitTick: -1,
      brokeTick: -1,
      absorbed: 7,
      hurtScale: 0.5,
      podCount: 2,
      podMaxHits: 6,
      podOrbit: 20,
      spin: 3,
      tier: 2,
      charge: 40,
    });
    for (let i = 0; i < MAX_SHIELD_PODS; i++) {
      expect([to.podHits[i], to.podAngle[i], to.podX[i], to.podY[i]]).toEqual([
        i + 1,
        i * 10,
        i * 2,
        i * 3,
      ]);
      expect([to.podIFrames[i], to.podHitTick[i]]).toEqual([0, -1]);
    }
  });

  it('CarryState.copyFrom copies every player, the counters and the shields', () => {
    const src = new CarryState();
    src.valid = true;
    src.continuesUsed = 2;
    src.hiScore = 5_000;
    src.players.forEach((p, i) => {
      p.active = true;
      p.lives = 3 + i;
      p.out = i === 1;
      p.down = i === 0;
      p.score = 1000 * (i + 1);
      p.continues = i;
      p.nextExtend = 70_000;
      p.extendsEarned = i + 1;
      p.main = 2;
      p.missile = true;
      p.options = i + 1;
      p.shot = 4;
      p.sub = 2;
      p.family = 1;
      p.speedLevel = 3;
      p.cursor = 5;
      grantShield(p.shield, FORCE_FIELD);
    });
    const copy = new CarryState();
    copy.copyFrom(src);
    expect([copy.valid, copy.continuesUsed, copy.hiScore]).toEqual([true, 2, 5_000]);
    for (let i = 0; i < src.players.length; i++) {
      const { shield: a, ...rest } = copy.players[i];
      const { shield: b, ...expected } = src.players[i];
      expect(rest).toEqual(expected);
      expect(a).not.toBe(b);
      expect([a.kind, a.hits]).toEqual([b.kind, b.hits]);
    }
    // An invalid source makes the copy invalid.
    copy.copyFrom(new CarryState());
    expect(copy.valid).toBe(false);
  });
});

describe('core/scenes run edges: the tally (M2-10)', () => {
  /**
   * A World with a boss in a slot.
   *
   * @param slot - Boss slot.
   * @param state - Its state.
   * @param fightTicks - Its fight's length.
   * @param role - Its role.
   * @param w - The World (default a new one).
   * @returns The World.
   */
  function withBoss(
    slot: number,
    state: number,
    fightTicks: number,
    role: number = BossRole.Boss,
    w: World = world(),
  ): World {
    const boss = w.bosses.slots[slot];
    boss.specIndex = 0;
    boss.state = state;
    boss.fightTicks = fightTicks;
    boss.role = role;
    return w;
  }

  it('rounds the kill rate down and caps it at 100 %', () => {
    const w = world();
    const stats = w.enemies.stats;
    const rate = (spawned: number, killed: number): number => {
      stats.spawned = spawned;
      stats.killed = killed;
      return tallyZone(w, new ZoneResult()).killPercent;
    };
    expect(rate(3, 1)).toBe(33);
    expect(rate(3, 2)).toBe(66);
    expect(rate(7, 7)).toBe(100);
    expect(rate(2, 5)).toBe(100); // more kills than spawns (restarts re-spawn): capped
    expect(rate(1, 0)).toBe(0);
    expect(rate(0, 0)).toBe(100);
    expect(tallyZone(w, new ZoneResult()).bonus).toBe(false);
  });

  it('times only defeated stage bosses: dying or dead, not escaped, not captains', () => {
    const counted = (w: World): number => tallyZone(w, new ZoneResult()).bossSeconds;
    expect(counted(withBoss(0, BossState.Dying, 600))).toBe(10);
    expect(counted(withBoss(0, BossState.Dead, 600))).toBe(10);
    expect(counted(withBoss(0, BossState.Fight, 600))).toBe(-1);
    expect(counted(withBoss(0, BossState.Escape, 600))).toBe(-1);
    expect(counted(withBoss(0, BossState.Dead, 600, BossRole.Captain))).toBe(-1);
    const escaped = withBoss(0, BossState.Dead, 600);
    escaped.bosses.slots[0].escaped = true;
    expect(counted(escaped)).toBe(-1);
    // Two defeated bosses (a double boss): the longer fight counts.
    const pair = withBoss(
      1,
      BossState.Dead,
      1_300,
      BossRole.Boss,
      withBoss(0, BossState.Dead, 700),
    );
    expect(counted(pair)).toBe(21);
  });

  it('pays whole seconds under par only', () => {
    const bonus = (fight: number): number =>
      tallyZone(withBoss(0, BossState.Dead, fight), new ZoneResult()).timeBonus;
    expect(bonus(TIME_BONUS_PAR_TICKS)).toBe(0);
    expect(bonus(TIME_BONUS_PAR_TICKS + 600)).toBe(0);
    expect(bonus(TIME_BONUS_PAR_TICKS - 59)).toBe(0);
    expect(bonus(TIME_BONUS_PAR_TICKS - 60)).toBe(TIME_BONUS_PER_SECOND);
    expect(bonus(0)).toBe(90 * TIME_BONUS_PER_SECOND);
  });

  it('pays everybody in play but an out player, and grants the extends the points reach', () => {
    const w = world('t-s', { coop: true });
    w.players[1].active = true;
    setPlayerState(w.players[1], 'alive');
    const result = new ZoneResult();
    result.killBonus = 5_000;
    result.timeBonus = 2_000;
    const p1 = w.scoring.board.scores[0];
    p1.score = p1.nextExtend - 10;
    const lives = w.players[0].lives;
    expect(awardZoneBonus(w, result)).toBe(7_000);
    expect(w.players[0].lives).toBe(lives + 1);
    expect(w.scoring.board.scores[1].score).toBe(7_000);
    // Player 2 out of the game: not paid.
    setPlayerState(w.players[1], 'dead');
    w.players[1].lives = 0;
    w.players[1].stateTicks = PLAYER_DEAD_TICKS;
    awardZoneBonus(w, result);
    expect(w.scoring.board.scores[1].score).toBe(7_000);
    // Nothing to pay: nobody changes.
    result.killBonus = 0;
    result.timeBonus = 0;
    const before = w.scoring.board.scores[0].score;
    expect(awardZoneBonus(w, result)).toBe(0);
    expect(w.scoring.board.scores[0].score).toBe(before);
  });
});

describe('core/scenes run edges: the run (M2-10)', () => {
  it('begin after a finished run resets every field', () => {
    const run = new RunState();
    run.begin(CAMPAIGN, null);
    run.advance(1);
    run.flags = RunFlag.Bonus | RunFlag.BossEscaped;
    run.deaths = 3;
    run.continues = 2;
    run.continuesAtStart = 1;
    run.ending = CAMPAIGN.endings[0];
    run.inBonus = true;
    run.bonusStage = 't-v';
    run.bonusReturnX = 40;
    run.bonusLocked = true;
    run.practice = true;
    run.checkpoint = 1;
    run.entry.valid = true;
    run.carry.valid = true;
    run.begin(CAMPAIGN, null);
    expect({
      zone: run.zone,
      stage: run.stage,
      depth: run.depth,
      route: run.route,
      flags: run.flags,
      deaths: run.deaths,
      continues: run.continues,
      continuesAtStart: run.continuesAtStart,
      ending: run.ending,
      inBonus: run.inBonus,
      bonusStage: run.bonusStage,
      bonusReturnX: run.bonusReturnX,
      bonusLocked: run.bonusLocked,
      practice: run.practice,
      checkpoint: run.checkpoint,
      entry: run.entry.valid,
      carry: run.carry.valid,
    }).toEqual({
      zone: 0,
      stage: 't-s',
      depth: 0,
      route: [0],
      flags: 0,
      deaths: 0,
      continues: 0,
      continuesAtStart: 0,
      ending: null,
      inBonus: false,
      bonusStage: null,
      bonusReturnX: -1,
      bonusLocked: false,
      practice: false,
      checkpoint: -1,
      entry: false,
      carry: false,
    });
    expect(run.endingFlags).toBe(RunFlag.NoDeath | RunFlag.NoContinue);
  });

  it('practises the start zone at depth 0, and a single-stage run has no final zone', () => {
    const run = new RunState();
    run.beginPractice(CAMPAIGN, CAMPAIGN.startIndex, -1);
    expect([run.practice, run.zone, run.depth, run.route, run.checkpoint]).toEqual([
      true,
      0,
      0,
      [0],
      -1,
    ]);
    expect(run.finalZone).toBe(false);
    run.beginPractice(CAMPAIGN, 2, -1);
    expect(run.finalZone).toBe(true);
    const single = new RunState();
    single.begin(null, 't-u');
    expect(single.finalZone).toBe(false);
    const empty = new RunState();
    expect([empty.campaign, empty.zone, empty.finalZone]).toEqual([null, -1, false]);
  });

  it('noteWorldEnd: no negative continues, only the BossEscaped bit of the World`s flags', () => {
    const run = new RunState();
    run.begin(CAMPAIGN, null);
    run.continuesAtStart = 3;
    const w = world();
    w.continuesUsed = 1; // fewer than the World started with: nothing to count
    w.endingFlags = 0b1110 | EndingFlag.BossEscaped;
    run.noteWorldEnd(w);
    expect([run.continues, run.flags]).toEqual([0, RunFlag.BossEscaped]);
    w.continuesUsed = 5;
    run.noteWorldEnd(w);
    expect(run.continues).toBe(2);
    expect(run.endingFlags).toBe(RunFlag.BossEscaped | RunFlag.NoDeath);
    run.flags |= RunFlag.Bonus;
    run.deaths = 1;
    expect(run.endingFlags).toBe(RunFlag.BossEscaped | RunFlag.Bonus);
  });

  it('advance leaves the bonus state and the checkpoint behind', () => {
    const run = new RunState();
    run.begin(CAMPAIGN, null);
    run.checkpoint = 1;
    run.inBonus = true;
    run.bonusStage = 't-v';
    run.bonusReturnX = 40;
    run.bonusLocked = true;
    run.carry.valid = true;
    run.carry.players[0].score = 99;
    run.advance(2);
    expect([
      run.checkpoint,
      run.inBonus,
      run.bonusStage,
      run.bonusReturnX,
      run.bonusLocked,
    ]).toEqual([-1, false, null, -1, false]);
    expect([run.entry.valid, run.entry.players[0].score]).toEqual([true, 99]);
  });
});

describe('core/scenes run edges: the World of the run (M2-10)', () => {
  const base = resolveGameConfig({ seed: 5, stage: 't-s' });

  it('a single-stage run keeps the base config and the rank`s stage term', () => {
    const run = new RunState();
    run.begin(null, 't-s');
    expect(runWorldConfig(base, run)).toBe(base);
    const w = createWorld(base, DB);
    const term = w.rankInputs.stage;
    prepareRunWorld(w, run, null);
    expect(w.rankInputs.stage).toBe(term);
    // A bonus stage whose id is the base stage keeps the base object too.
    run.inBonus = true;
    run.bonusStage = 't-s';
    expect(runWorldConfig(base, run)).toBe(base);
  });

  it('a bonus stage ignores the way back and the lock; the way back beats a checkpoint', () => {
    const run = new RunState();
    run.begin(CAMPAIGN, null);
    run.inBonus = true;
    run.bonusStage = 't-v';
    run.bonusReturnX = 60;
    run.bonusLocked = true;
    const bonus = prepareRunWorld(createWorld(runWorldConfig(base, run), DB), run, null);
    expect(bonus.stage?.stage.id).toBe('t-v');
    expect(bonus.camera.x).toBe(0);
    expect(bonus.bonus.locked).toBe(false);
    expect(bonus.rankInputs.stage).toBe(1);
    // Back in the zone with a practice checkpoint too: the entrance's x wins.
    run.leaveBonus(true);
    run.checkpoint = 1; // x 100
    const back = prepareRunWorld(createWorld(runWorldConfig(base, run), DB), run, null);
    expect(back.camera.x).toBe(60);
    expect(back.bonus.locked).toBe(true);
  });

  it('notes the continues a carried World starts with, and none for a fresh one', () => {
    const run = new RunState();
    run.begin(CAMPAIGN, null);
    const from = world();
    from.continuesUsed = 2;
    const carry = captureCarry(from, new CarryState());
    run.advance(1);
    const w = prepareRunWorld(createWorld(runWorldConfig(base, run), DB), run, carry);
    expect([run.continuesAtStart, w.continuesUsed]).toEqual([2, 2]);
    // The World's own continues are what the run counts at its end.
    w.continuesUsed = 3;
    run.noteWorldEnd(w);
    expect(run.continues).toBe(1);
    prepareRunWorld(createWorld(runWorldConfig(base, run), DB), run, new CarryState());
    expect(run.continuesAtStart).toBe(0);
  });

  it('a carried player flies in from the left edge of the next World`s camera', () => {
    const run = new RunState();
    run.begin(CAMPAIGN, null);
    const from = world();
    const input = createInputSnapshot();
    for (let i = 0; i < 120; i++) stepWorld(from, input);
    const carry = captureCarry(from, new CarryState());
    run.advance(2);
    run.checkpoint = 1; // practice-like start at x 100
    const w = prepareRunWorld(createWorld(runWorldConfig(base, run), DB), run, carry);
    expect(w.camera.x).toBe(100);
    expect(w.players[0].state).toBe('entering');
    expect(w.players[0].x).toBeLessThan(w.camera.x + 64);
    expect(w.players[0].x).toBeGreaterThanOrEqual(w.camera.x - 64);
  });
});
