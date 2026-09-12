/**
 * The ship's life cycle (plan M1-12) at the `core/player` level: `killPlayer` (dying, one life,
 * never below 0, only for a ship in play), `dying` → `dead` after `PLAYER_DYING_TICKS`,
 * `respawnPlayer` (a blinking fly-in, then exactly `respawnInvulnTicks` of invulnerability from
 * the tick control returns), `playerOut`, and `playerHit` recording (the World turns it into the
 * death — `test/world/world-death.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import { PLAYFIELD_H } from '../../src/config/index.js';
import { createDebugFlags } from '../../src/debug/index.js';
import {
  DEFAULT_PLAYER_SHIP,
  ENTER_START_X,
  PLAYER_DEAD_TICKS,
  PLAYER_DYING_TICKS,
  PlayerHitCause,
  createPlayer,
  createPlayerIntent,
  killPlayer,
  playerHit,
  playerOut,
  respawnPlayer,
  setPlayerState,
  updatePlayer,
  type PlayerShip,
  type PlayerState,
} from '../../src/player/index.js';

/** A static camera at the origin. */
const CAMERA = { x: 0, y: 0, dx: 0, dy: 0 };

/**
 * An active ship in the `alive` state with three lives.
 *
 * @returns The ship.
 */
function alive(): PlayerShip {
  const ship = createPlayer(0, 3);
  ship.active = true;
  setPlayerState(ship, 'alive');
  ship.x = 100;
  ship.y = 80;
  return ship;
}

/**
 * Updates a ship `n` times with no input on the static camera.
 *
 * @param ship - The ship.
 * @param n - Ticks.
 * @returns The state after each update.
 */
function advance(ship: PlayerShip, n: number): PlayerState[] {
  const intent = createPlayerIntent();
  const states: PlayerState[] = [];
  for (let i = 0; i < n; i++) {
    updatePlayer(ship, DEFAULT_PLAYER_SHIP, intent, CAMERA);
    states.push(ship.state);
  }
  return states;
}

describe('core/player life cycle', () => {
  it('uses the documented timings (24 ticks dying, 60 dead) and the 150-tick respawn blink', () => {
    expect([PLAYER_DYING_TICKS, PLAYER_DEAD_TICKS]).toEqual([24, 60]);
    expect(DEFAULT_PLAYER_SHIP.respawnInvulnTicks).toBe(150);
  });

  it('killPlayer: dying, one life gone, no invulnerability, level', () => {
    const ship = alive();
    ship.invulnTicks = 5;
    ship.bank = -1;
    ship.moving = true;
    ship.stateTicks = 30;
    expect(killPlayer(ship)).toBe(2);
    expect(ship).toMatchObject({
      state: 'dying',
      stateTicks: 0,
      lives: 2,
      invulnTicks: 0,
      bank: 0,
      moving: false,
      x: 100,
      y: 80,
    });
  });

  it('killPlayer never goes below 0 lives and ignores inactive, dying and dead ships', () => {
    const ship = alive();
    ship.lives = 1;
    expect(killPlayer(ship)).toBe(0);
    expect(killPlayer(ship)).toBe(-1); // already dying
    setPlayerState(ship, 'dead');
    expect(killPlayer(ship)).toBe(-1);
    const idle = alive();
    idle.active = false;
    expect(killPlayer(idle)).toBe(-1);
    expect(idle.lives).toBe(3);
    const broke = alive();
    broke.lives = 0; // a debug tool emptied it
    expect(killPlayer(broke)).toBe(0);
    for (const state of ['entering', 'respawning'] as const) {
      const flying = alive();
      setPlayerState(flying, state);
      expect(killPlayer(flying), state).toBe(2);
    }
  });

  it('dies where it was hit, then turns dead after PLAYER_DYING_TICKS updates', () => {
    const ship = alive();
    killPlayer(ship);
    const states = advance(ship, PLAYER_DYING_TICKS + 2);
    expect(states.indexOf('dead')).toBe(PLAYER_DYING_TICKS - 1);
    expect(ship.stateTicks).toBe(2);
    expect([ship.x, ship.y]).toEqual([100, 80]);
    // `dead` only counts: the World decides the respawn.
    advance(ship, PLAYER_DEAD_TICKS * 3);
    expect(ship.state).toBe('dead');
    expect(ship.stateTicks).toBe(2 + PLAYER_DEAD_TICKS * 3);
  });

  it('respawnPlayer: a fly-in from the left edge that blinks, then respawnInvulnTicks exactly', () => {
    const ship = alive();
    killPlayer(ship);
    setPlayerState(ship, 'dead');
    const camera = { x: 500, y: -20, dx: 0, dy: 0 };
    respawnPlayer(ship, DEFAULT_PLAYER_SHIP, camera);
    expect(ship).toMatchObject({
      state: 'respawning',
      stateTicks: 0,
      x: 500 + ENTER_START_X,
      y: -20 + PLAYFIELD_H / 2,
      lives: 2,
      invulnTicks: DEFAULT_PLAYER_SHIP.enterTicks + DEFAULT_PLAYER_SHIP.respawnInvulnTicks,
    });
    const intent = createPlayerIntent();
    let ticks = 0;
    while (ship.state === 'respawning') {
      updatePlayer(ship, DEFAULT_PLAYER_SHIP, intent, camera);
      ticks++;
    }
    expect(ticks).toBe(DEFAULT_PLAYER_SHIP.enterTicks);
    expect(ship.invulnTicks).toBe(DEFAULT_PLAYER_SHIP.respawnInvulnTicks);
  });

  it('sets the invulnerability when control returns, whatever the fly-in length (0 included)', () => {
    for (const enterTicks of [0, 1, 7]) {
      const spec = { ...DEFAULT_PLAYER_SHIP, enterTicks, respawnInvulnTicks: 30 };
      const ship = alive();
      respawnPlayer(ship, spec, CAMERA);
      ship.invulnTicks = 3; // a debug tool cut it short: the end of the fly-in restores it
      const intent = createPlayerIntent();
      while (ship.state !== 'alive') updatePlayer(ship, spec, intent, CAMERA);
      expect(ship.invulnTicks, `enterTicks ${enterTicks}`).toBe(30);
    }
  });

  it('a stage-start fly-in (entering) grants no invulnerability', () => {
    const ship = createPlayer(0, 3);
    ship.active = true;
    setPlayerState(ship, 'entering');
    advance(ship, DEFAULT_PLAYER_SHIP.enterTicks);
    expect([ship.state, ship.invulnTicks]).toEqual(['alive', 0]);
  });

  it('playerOut: active, dead for PLAYER_DEAD_TICKS and no lives left', () => {
    const ship = alive();
    ship.lives = 1;
    killPlayer(ship);
    expect(playerOut(ship)).toBe(false);
    advance(ship, PLAYER_DYING_TICKS);
    expect(ship.state).toBe('dead');
    advance(ship, PLAYER_DEAD_TICKS - 1);
    expect(playerOut(ship)).toBe(false);
    advance(ship, 1);
    expect(playerOut(ship)).toBe(true);
    ship.lives = 1;
    expect(playerOut(ship)).toBe(false);
    ship.lives = 0;
    ship.active = false;
    expect(playerOut(ship)).toBe(false);
  });

  it('playerHit records the hit and leaves the state to the World', () => {
    const ship = alive();
    const debug = createDebugFlags();
    expect(playerHit(ship, PlayerHitCause.Laser, 42, debug)).toBe(true);
    expect([ship.state, ship.hits, ship.hitTick, ship.hitCause]).toEqual([
      'alive',
      1,
      42,
      PlayerHitCause.Laser,
    ]);
    killPlayer(ship);
    expect(playerHit(ship, PlayerHitCause.Bullet, 43, debug)).toBe(false); // not alive
    expect(ship.hits).toBe(1);
  });
});
