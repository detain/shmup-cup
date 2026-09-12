/**
 * Edge cases of the ship's life cycle at the `core/player` level (plan M1-12), beyond
 * `player-life.test.ts`: a negative fly-in length, what a respawn keeps (speed level, lives, hit
 * record) and resets (bank, motion, timer), the respawn fly-in riding a scrolling and panning
 * camera, a dying / dead ship staying where it was hit while the camera scrolls (no
 * invulnerability counting there), `playerOut` boundaries, and the last hit of a tick winning the
 * hit record.
 */
import { describe, expect, it } from 'vitest';
import { createDebugFlags } from '../../src/debug/index.js';
import {
  DEFAULT_PLAYER_SHIP,
  ENTER_END_X,
  ENTER_START_X,
  PLAYER_DEAD_TICKS,
  PLAYER_DYING_TICKS,
  PlayerHitCause,
  SPAWN_Y,
  createPlayer,
  createPlayerIntent,
  killPlayer,
  playerHit,
  playerOut,
  respawnPlayer,
  setPlayerState,
  updatePlayer,
  type PlayerShip,
} from '../../src/player/index.js';

/**
 * An active, alive ship with three lives at (100, 80).
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

describe('core/player respawn edges', () => {
  it('a negative fly-in length counts as 0: control returns on the first update', () => {
    const spec = { ...DEFAULT_PLAYER_SHIP, enterTicks: -5, respawnInvulnTicks: 20 };
    const ship = alive();
    respawnPlayer(ship, spec, { x: 0, y: 0 });
    expect(ship.invulnTicks).toBe(20);
    updatePlayer(ship, spec, createPlayerIntent(), { x: 0, y: 0, dx: 0, dy: 0 });
    expect([ship.state, ship.invulnTicks, ship.x]).toEqual(['alive', 20, ENTER_END_X]);
  });

  it('keeps the speed level, lives and hit record; resets bank, motion and the timer', () => {
    const ship = alive();
    ship.speedLevel = 3;
    ship.bank = 1;
    ship.moving = true;
    playerHit(ship, PlayerHitCause.Contact, 12, createDebugFlags());
    killPlayer(ship);
    for (let t = 0; t < 10; t++) {
      updatePlayer(ship, DEFAULT_PLAYER_SHIP, createPlayerIntent(), { x: 0, y: 0, dx: 0, dy: 0 });
    }
    ship.moving = true;
    ship.bank = -1;
    respawnPlayer(ship, DEFAULT_PLAYER_SHIP, { x: 40, y: 8 });
    expect(ship).toMatchObject({
      state: 'respawning',
      stateTicks: 0,
      speedLevel: 3,
      lives: 2,
      hits: 1,
      hitCause: PlayerHitCause.Contact,
      hitTick: 12,
      bank: 0,
      moving: false,
      x: 40 + ENTER_START_X,
      y: 8 + SPAWN_Y,
    });
  });

  it('the fly-in follows a scrolling, panning camera and eases out monotonically', () => {
    const ship = alive();
    killPlayer(ship);
    const camera = { x: 1000, y: 0, dx: 1.5, dy: 0.5 };
    respawnPlayer(ship, DEFAULT_PLAYER_SHIP, camera);
    const intent = createPlayerIntent();
    const rel: number[] = [];
    while (ship.state === 'respawning') {
      camera.x += camera.dx;
      camera.y += camera.dy;
      updatePlayer(ship, DEFAULT_PLAYER_SHIP, intent, camera);
      rel.push(ship.x - camera.x);
      expect(ship.y).toBeCloseTo(camera.y + SPAWN_Y, 9);
    }
    expect(rel).toHaveLength(DEFAULT_PLAYER_SHIP.enterTicks);
    for (let i = 1; i < rel.length; i++) expect(rel[i]).toBeGreaterThan(rel[i - 1]);
    // Ease-out: the first steps are the longest.
    expect(rel[1] - rel[0]).toBeGreaterThan(rel[rel.length - 1] - rel[rel.length - 2]);
    expect(rel[0]).toBeGreaterThan(ENTER_START_X);
    expect(rel[rel.length - 1]).toBe(ENTER_END_X);
  });
});

describe('core/player dying and dead edges', () => {
  it('a dying or dead ship stays where it was hit while the camera scrolls', () => {
    const ship = alive();
    killPlayer(ship);
    const camera = { x: 0, y: 0, dx: 2, dy: 1 };
    const intent = createPlayerIntent();
    intent.moveX = 1;
    intent.moveY = -1;
    for (let t = 0; t < PLAYER_DYING_TICKS + PLAYER_DEAD_TICKS; t++) {
      camera.x += camera.dx;
      camera.y += camera.dy;
      updatePlayer(ship, DEFAULT_PLAYER_SHIP, intent, camera);
    }
    expect([ship.state, ship.x, ship.y, ship.bank, ship.moving]).toEqual([
      'dead',
      100,
      80,
      0,
      false,
    ]);
    expect(ship.invulnTicks).toBe(0);
  });

  it('playerOut is false while dying, for a dead ship with a life, and for an inactive one', () => {
    const ship = alive();
    ship.lives = 1;
    killPlayer(ship);
    ship.stateTicks = PLAYER_DEAD_TICKS * 2; // a long explosion is still not "out"
    expect(playerOut(ship)).toBe(false);
    setPlayerState(ship, 'dead');
    ship.stateTicks = PLAYER_DEAD_TICKS;
    expect(playerOut(ship)).toBe(true);
    ship.lives = 2;
    expect(playerOut(ship)).toBe(false);
    ship.lives = -1; // a debug tool went below zero: still out
    expect(playerOut(ship)).toBe(true);
    ship.active = false;
    expect(playerOut(ship)).toBe(false);
  });

  it('the last hit of a tick wins the record; each counts in hits', () => {
    const ship = alive();
    const debug = createDebugFlags();
    expect(playerHit(ship, PlayerHitCause.Bullet, 5, debug)).toBe(true);
    expect(playerHit(ship, PlayerHitCause.Terrain, 5, debug)).toBe(true);
    expect([ship.hits, ship.hitCause, ship.hitTick]).toEqual([2, PlayerHitCause.Terrain, 5]);
    expect(killPlayer(ship)).toBe(2);
  });
});
