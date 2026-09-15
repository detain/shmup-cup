/**
 * `core/world` — the sim side of plan M3-01's extra modes: the loop (the rank's loop term, the
 * faster bullets), the caravan's clock (time up, the time bonus of a clear, the clock in the state
 * hash only when there is one, the HUD's clock), the invincibility assist, option recovery after a
 * death, and the pause menu's secrets `grantFullPower` / `selfDestruct`.
 */
import { describe, expect, it } from 'vitest';
import { resolveGameConfig, type GameConfig } from '../../src/config/index.js';
import { EMPTY_CONTENT_DB } from '../../src/data/index.js';
import { createDebugFlags, hashWorld } from '../../src/debug/index.js';
import { createInputSnapshot } from '../../src/input/index.js';
import { PlayerHitCause, playerHit } from '../../src/player/index.js';
import { ItemKind } from '../../src/powerups/index.js';
import { createDrawList } from '../../src/presentation/index.js';
import { LOOP_BULLET_SPEED_STEP, RANK_LOOP1_CAP } from '../../src/rank/index.js';
import {
  HUD_COMMAND_COUNT,
  HUD_STRING_COUNT,
  buildHud,
  hudClockSeconds,
} from '../../src/ui/index.js';
import { MainWeapon } from '../../src/weapons/index.js';
import {
  CARAVAN_TIME_BONUS,
  createWorld,
  grantFullPower,
  selfDestruct,
  stepWorld,
  type World,
} from '../../src/world/index.js';

const INPUT = createInputSnapshot();

/**
 * A free-flight World.
 *
 * @param overrides - Config fields.
 * @returns The World.
 */
function world(overrides: Partial<GameConfig> = {}): World {
  return createWorld(resolveGameConfig({ seed: 3, ...overrides }), EMPTY_CONTENT_DB);
}

/**
 * Steps a World.
 *
 * @param w - The World.
 * @param ticks - Ticks.
 */
function run(w: World, ticks: number): void {
  for (let t = 0; t < ticks; t++) stepWorld(w, INPUT);
}

/**
 * The live items of a kind.
 *
 * @param w - The World.
 * @param kind - An `ItemKind`.
 * @returns How many.
 */
function items(w: World, kind: number): number {
  const pool = w.powerups.pool;
  let n = 0;
  for (let i = 0; i < pool.count; i++) if (pool.fields.kind[i] === kind) n++;
  return n;
}

describe('core/world loops (M3-01)', () => {
  it('counts the loop in the rank (the loop-1 cap lifted) and flies faster bullets', () => {
    const one = world();
    const two = world({ loop: 2 });
    expect(one.rankInputs.loop).toBe(1);
    expect(two.rankInputs.loop).toBe(2);
    // Normal: base 2, + 8 for loop 2.
    expect(two.rank).toBe(one.rank + 8);
    two.weapons.loadouts[0].options = 4;
    two.weapons.loadouts[0].main = MainWeapon.Laser;
    two.weapons.loadouts[0].missile = true;
    run(two, 2);
    expect(two.rank).toBeGreaterThan(RANK_LOOP1_CAP);
    // At the same rank (no growth), loop 2's bullets are LOOP_BULLET_SPEED_STEP faster.
    const flat = world({ rankGrowth: 0 });
    const flatTwo = world({ rankGrowth: 0, loop: 2 });
    expect(flatTwo.rank).toBe(flat.rank);
    expect(flatTwo.bullets.speedScale / flat.bullets.speedScale).toBeCloseTo(
      1 + LOOP_BULLET_SPEED_STEP,
      9,
    );
    // The loop is part of the state hash (the rank inputs), the default loop leaves it alone.
    expect(hashWorld(world({ loop: 1 }))).toBe(hashWorld(world()));
  });
});

describe('core/world the caravan clock (M3-01)', () => {
  it('counts down while played and ends the World at 0: time up', () => {
    const w = world({ timeLimit: 120 });
    expect(w.timeLeft).toBe(120);
    expect(world().timeLeft).toBe(-1);
    run(w, 119);
    expect([w.status, w.timeLeft, w.timeUp]).toEqual(['playing', 1, false]);
    run(w, 1);
    expect([w.status, w.timeLeft, w.timeUp]).toEqual(['stageClear', 0, true]);
    // Time up pays no bonus.
    const score = w.scoring.board.scores[0].score;
    run(w, 5);
    expect(w.scoring.board.scores[0].score).toBe(score);
    expect(w.clockPaid).toBe(false);
  });

  it('pays a thousand points a second left when the stage is cleared in time', () => {
    const w = world({ timeLimit: 600 });
    run(w, 90);
    w.status = 'stageClear';
    run(w, 1);
    expect(w.clockPaid).toBe(true);
    // 510 ticks left: 8 whole seconds.
    expect(w.scoring.board.scores[0].score).toBe(8 * CARAVAN_TIME_BONUS);
    run(w, 30);
    expect(w.scoring.board.scores[0].score).toBe(8 * CARAVAN_TIME_BONUS);
  });

  it('hashes the clock only in a World that has one', () => {
    const a = world({ timeLimit: 600 });
    const b = world({ timeLimit: 600 });
    run(a, 10);
    run(b, 10);
    expect(hashWorld(a)).toBe(hashWorld(b));
    b.timeLeft--;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
    // Without a clock the field is not part of the hash.
    const c = world();
    const before = hashWorld(c);
    c.timeLeft = -2;
    expect(hashWorld(c)).toBe(before);
  });

  it('shows the whole seconds left in player 2`s place on the HUD', () => {
    const w = world({ timeLimit: 600 });
    run(w, 1);
    expect(hudClockSeconds(w)).toBe(10);
    w.timeLeft = 61;
    expect(hudClockSeconds(w)).toBe(2);
    w.timeLeft = 0;
    expect(hudClockSeconds(w)).toBe(0);
    w.timeLeft = 300;
    const list = createDrawList(HUD_COMMAND_COUNT, HUD_STRING_COUNT);
    buildHud(w, list);
    const texts: string[] = [];
    for (let i = 0; i < list.count; i++) texts.push(list.strings[list.ref[i]] ?? '');
    expect(texts).toContain('TIME');
    expect(texts).not.toContain('2P');
  });
});

describe('core/world assists and secrets (M3-01)', () => {
  it('the invincibility assist ignores every hit, like god mode', () => {
    const w = world({ invincible: true });
    run(w, 60);
    const ship = w.players[0];
    expect(ship.invincible).toBe(true);
    expect(playerHit(ship, PlayerHitCause.Bullet, w.tick, createDebugFlags())).toBe(false);
    expect(selfDestruct(w, 0)).toBe(false);
    const plain = world();
    run(plain, 60);
    expect(playerHit(plain.players[0], PlayerHitCause.Bullet, plain.tick, createDebugFlags())).toBe(
      true,
    );
  });

  it('option recovery: the Options a death takes drift off to be caught again', () => {
    const w = world({ loadout: 'full', optionRecovery: true, deathPenalty: 'arcade' });
    run(w, 60);
    expect(w.weapons.loadouts[0].options).toBe(4);
    expect(selfDestruct(w, 0)).toBe(true);
    run(w, 1);
    expect(w.players[0].state).toBe('dying');
    expect(w.weapons.loadouts[0].options).toBe(0);
    // The drops become items when the death's hit-stop is over.
    run(w, 12);
    expect(items(w, ItemKind.FreeOption)).toBe(4);
    // Without it the Options are simply gone.
    const plain = world({ loadout: 'full', deathPenalty: 'arcade' });
    run(plain, 60);
    selfDestruct(plain, 0);
    run(plain, 13);
    expect(items(plain, ItemKind.FreeOption)).toBe(0);
    // The classic penalty takes one Option: one drifts off.
    const classic = world({ loadout: 'full', optionRecovery: true });
    run(classic, 60);
    selfDestruct(classic, 0);
    run(classic, 13);
    expect(classic.weapons.loadouts[0].options).toBe(3);
    expect(items(classic, ItemKind.FreeOption)).toBe(1);
  });

  it('grantFullPower gives an alive ship the full loadout; selfDestruct kills it next tick', () => {
    const w = world();
    expect(grantFullPower(w, 0)).toBe(false); // still flying in
    run(w, 60);
    expect(grantFullPower(w, 0)).toBe(true);
    const loadout = w.weapons.loadouts[0];
    expect([loadout.main, loadout.missile, loadout.options]).toEqual([MainWeapon.Laser, true, 4]);
    expect(grantFullPower(w, 1)).toBe(false); // player 2 is not in the game
    expect(grantFullPower(w, 7)).toBe(false);
    const lives = w.players[0].lives;
    expect(selfDestruct(w, 0)).toBe(true);
    run(w, 1);
    expect([w.players[0].state, w.players[0].lives]).toEqual(['dying', lives - 1]);
    expect(selfDestruct(w, 0)).toBe(false);
    // The Direct-mode ship: both levels at the top.
    const direct = world({ powerUpMode: 'direct', shipId: 'manta' });
    run(direct, 60);
    expect(grantFullPower(direct, 0)).toBe(true);
    expect(direct.weapons.loadouts[0].shot).toBe(8);
  });
});
